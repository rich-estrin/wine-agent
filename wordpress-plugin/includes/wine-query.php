<?php
/**
 * SQL builders for the native search — the piece that replaces the Node
 * in-memory pipeline (web/server/wine-search.ts + the /api/search and
 * /api/meta handlers in web/server/app.ts).
 *
 * These functions are pure: they take request params and return SQL text with
 * %s/%d/%f placeholders plus a parallel bindings array, so the WordPress layer
 * can hand them to $wpdb->prepare and the parity harness can run them against
 * SQLite without WordPress. Nothing here touches $wpdb or global state.
 *
 * All matching happens over columns the indexer already folded, so every
 * comparison below is a plain binary one — no collation, no REGEXP, nothing
 * that varies between MySQL and MariaDB.
 *
 * @package WineAgent
 */

require_once __DIR__ . '/text.php';
require_once __DIR__ . '/wine-utils.php';
require_once __DIR__ . '/wine-map.php';

/**
 * The filter keys the app sends, and the only ones either endpoint honours.
 *
 * An allowlist rather than a denylist, because /search and /meta are public
 * and unauthenticated. Anything else in the query string is ignored: a CDN
 * cache-buster, a tracking tag, a typo, and WordPress's own REST params
 * (`rest_route` on plain permalinks, `_locale`, `_envelope`) all used to be
 * read as wine fields, where they matched no row and emptied the page.
 *
 * Mirrors `FILTER_PARAMS` in web/server/app.ts.
 *
 * @return string[]
 */
function wine_agent_filter_params(): array {
	return [
		'mainVarietal',
		'ava',
		'region',
		'type',
		'stateProvince',
		'specialDesignation',
		'priceMin',
		'priceMax',
		'scoreMin',
		'scoreMax',
		'vintageMin',
		'vintageMax',
		'casesMin',
		'casesMax',
		'publicationDate',
	];
}

/**
 * The largest page a caller may ask for, and the default when none is given.
 * The app pages 40 at a time; the cap is what stops `?limit=100000` returning
 * the whole index in one public response.
 */
const WINE_AGENT_MAX_LIMIT     = 100;
const WINE_AGENT_DEFAULT_LIMIT = 20;

/**
 * Clamp the caller's page window.
 *
 * Both numbers reach SQL, so neither can be trusted: an unbounded limit dumps
 * the index, and MySQL rejects a negative LIMIT outright with a syntax error
 * that 500s the endpoint. (SQLite accepts it, which is why the parity harness
 * cannot see this and scripts/plugin-query-test.php asserts it instead.)
 *
 * @param array $params Raw query params.
 * @return array{limit:int,offset:int}
 */
function wine_agent_page_window( array $params ): array {
	$limit = isset( $params['limit'] ) ? wine_agent_js_parse_int( (string) $params['limit'] ) : null;
	$limit = ( null === $limit )
		? WINE_AGENT_DEFAULT_LIMIT
		: max( 1, min( (int) $limit, WINE_AGENT_MAX_LIMIT ) );

	$offset = isset( $params['offset'] ) ? wine_agent_js_parse_int( (string) $params['offset'] ) : null;
	$offset = ( null === $offset ) ? 0 : max( 0, (int) $offset );

	return [
		'limit'  => $limit,
		'offset' => $offset,
	];
}

/**
 * Fields the sidebar's single-select and tree pickers populate. These match
 * exactly against a comma-separated OR list rather than by substring, so
 * varietal "Ca" doesn't match every Cabernet.
 *
 * @return string[]
 */
function wine_agent_exact_match_fields(): array {
	return [ 'mainVarietal', 'type', 'region', 'stateProvince', 'specialDesignation' ];
}

/**
 * Sorts the index can order in SQL. Anything else falls back to the PHP path,
 * which sorts the matched rows in memory exactly as Node does.
 *
 * @return array<string,string> Field name => column name.
 */
function wine_agent_sortable_columns(): array {
	return [
		'price'           => 'price_num',
		'rating'          => 'rating_sort',
		'vintage'         => 'vintage_num',
		'cases'           => 'cases_num',
		'publicationDate' => 'pub_day',
	];
}

/**
 * Pull the recognised filter params out of a request, dropping blanks.
 *
 * @param array $params Raw query params.
 * @return array<string,string> Filters.
 */
function wine_agent_collect_filters( array $params ): array {
	$allowed = array_flip( wine_agent_filter_params() );
	$filters = [];
	foreach ( $params as $key => $value ) {
		if ( ! isset( $allowed[ $key ] ) ) {
			continue;
		}
		if ( is_string( $value ) && '' !== trim( $value ) ) {
			$filters[ $key ] = $value;
		}
	}
	return $filters;
}

/**
 * A condition that matches nothing — the SQL form of a JS comparison against
 * NaN, which is what a non-numeric range value produces.
 *
 * @return array{sql:string,bindings:array}
 */
function wine_agent_never(): array {
	return [
		'sql'      => '1 = 0',
		'bindings' => [],
	];
}

/**
 * Word-start match for one term against one column. The indexed text is a
 * space-joined list of folded words, so a term either opens the column or
 * follows a space — exactly the word-start rule the Node regex enforces.
 *
 * @param string $column Column to match.
 * @param string $term   Folded, alphanumeric term.
 * @return array{sql:string,bindings:array}
 */
function wine_agent_word_start_clause( string $column, string $term ): array {
	return [
		'sql'      => "($column LIKE %s OR $column LIKE %s)",
		'bindings' => [ $term . '%', '% ' . $term . '%' ],
	];
}

/**
 * Build the WHERE fragments for the free-text query. Every term must match
 * somewhere, though not necessarily in the same field; with `notes` on, the
 * tasting note joins the fields a term may land in.
 *
 * @param string $query        Raw query string.
 * @param bool   $search_notes Whether to widen to the tasting note.
 * @return array{clauses:string[],bindings:array}
 */
function wine_agent_build_query_clauses( string $query, bool $search_notes ): array {
	$terms    = wine_agent_fold_words( $query );
	$clauses  = [];
	$bindings = [];

	foreach ( $terms as $term ) {
		// foldWords yields letters and digits only, so LIKE wildcards cannot
		// appear in a term; strip defensively rather than trust that.
		$safe = preg_replace( '/[^\p{L}\p{N}]/u', '', $term );
		if ( '' === $safe ) {
			continue;
		}

		$parts = wine_agent_word_start_clause( 'words', $safe );
		$sql   = $parts['sql'];
		$binds = $parts['bindings'];

		if ( $search_notes ) {
			$note  = wine_agent_word_start_clause( 'folded_note', $safe );
			$sql   = '(' . $sql . ' OR ' . $note['sql'] . ')';
			$binds = array_merge( $binds, $note['bindings'] );
		}

		$clauses[] = $sql;
		$bindings  = array_merge( $bindings, $binds );
	}

	return [
		'clauses'  => $clauses,
		'bindings' => $bindings,
	];
}

/**
 * Build the WHERE fragment for a single filter, or null when the filter needs
 * the PHP fallback path (an unindexed field).
 *
 * @param string $key   Filter key.
 * @param string $value Filter value.
 * @return array{sql:string,bindings:array}|null Clause, or null for PHP.
 */
function wine_agent_build_filter_clause( string $key, string $value ) {
	// ── Range filters ────────────────────────────────────────────────────────
	// A non-numeric bound compares against NaN in JS, which is false for every
	// row; `wine_agent_never()` is that same answer in SQL.
	$ranges = [
		'scoreMin' => [ 'rating_num', '>=', 'float' ],
		'scoreMax' => [ 'rating_num', '<=', 'float' ],
		'priceMin' => [ 'price_num', '>=', 'float' ],
		'priceMax' => [ 'price_num', '<=', 'float' ],
		'casesMin' => [ 'cases_num', '>=', 'float' ],
		'casesMax' => [ 'cases_num', '<=', 'float' ],
		'vintageMin' => [ 'vintage_num', '>=', 'int' ],
		'vintageMax' => [ 'vintage_num', '<=', 'int' ],
	];
	if ( isset( $ranges[ $key ] ) ) {
		list( $column, $op, $type ) = $ranges[ $key ];
		$bound = 'int' === $type
			? wine_agent_js_parse_int( $value )
			: wine_agent_js_parse_float( $value );
		if ( null === $bound ) {
			return wine_agent_never();
		}
		$placeholder = 'int' === $type ? '%d' : '%f';
		return [
			'sql'      => "($column IS NOT NULL AND $column $op $placeholder)",
			'bindings' => [ $bound ],
		];
	}

	// ── Appellation ──────────────────────────────────────────────────────────
	// Unlike the dropdown fields below, blanks are NOT dropped: an empty entry
	// in the list is a real request for wines with no appellation, and the Node
	// implementation keeps it.
	if ( 'ava' === $key ) {
		$allowed = array_map(
			function ( $s ) {
				return wine_agent_fold( trim( $s ) );
			},
			explode( ',', $value )
		);
		return wine_agent_in_clause( 'f_ava', $allowed );
	}

	// ── Dropdown-selected fields ─────────────────────────────────────────────
	if ( in_array( $key, wine_agent_exact_match_fields(), true ) ) {
		$allowed = [];
		foreach ( explode( ',', $value ) as $s ) {
			$folded = wine_agent_fold( trim( $s ) );
			if ( '' !== $folded ) {
				$allowed[] = $folded;
			}
		}
		if ( empty( $allowed ) ) {
			return wine_agent_never();
		}
		return wine_agent_in_clause( 'f_' . wine_agent_column( $key ), $allowed );
	}

	// ── Review Date ──────────────────────────────────────────────────────────
	// The one filter that still carries an operator, because the sidebar's
	// Review Date control sends one: `publicationDate=>=2024-01-01`.
	$parsed   = wine_agent_parse_filter_value( $value );
	$sql_op   = wine_agent_sql_operator( $parsed['operator'] );
	$expected = wine_agent_parse_date_or_null( $parsed['value'] );

	if ( 'publicationDate' === $key ) {
		return ( null === $sql_op || null === $expected )
			? wine_agent_never()
			: [
				'sql'      => "(pub_ms IS NOT NULL AND pub_ms $sql_op %d)",
				'bindings' => [ $expected ],
			];
	}

	// Unreachable: every key in wine_agent_filter_params() is handled above, and
	// wine_agent_collect_filters() drops everything else. Fails closed, and
	// plugin-query-test.php asserts the two lists cannot drift apart.
	return wine_agent_never();
}

/**
 * Map a filter operator to its SQL form, or null when JS `compareValues`
 * wouldn't recognise it either.
 *
 * @param string $operator Parsed operator.
 * @return string|null SQL operator.
 */
function wine_agent_sql_operator( string $operator ): ?string {
	switch ( $operator ) {
		case '>':
			return '>';
		case '<':
			return '<';
		case '>=':
			return '>=';
		case '<=':
			return '<=';
		case '=':
		case '==':
			return '=';
		default:
			return null;
	}
}

/**
 * An IN (…) clause over pre-folded values.
 *
 * @param string   $column Column to test.
 * @param string[] $values Folded values.
 * @return array{sql:string,bindings:array}
 */
function wine_agent_in_clause( string $column, array $values ): array {
	if ( empty( $values ) ) {
		return wine_agent_never();
	}
	$placeholders = implode( ', ', array_fill( 0, count( $values ), '%s' ) );
	return [
		'sql'      => "($column IN ($placeholders))",
		'bindings' => array_values( $values ),
	];
}

/**
 * Build the complete WHERE clause for a set of filters plus the free-text
 * query.
 *
 * @param string $query        Free-text query.
 * @param bool   $search_notes Widen to tasting notes.
 * @param array  $filters      Field filters.
 * @return array{sql:string,bindings:array}
 */
function wine_agent_build_where( string $query, bool $search_notes, array $filters ): array {
	$clauses  = [];
	$bindings = [];

	if ( '' !== trim( $query ) ) {
		$q = wine_agent_build_query_clauses( $query, $search_notes );
		foreach ( $q['clauses'] as $clause ) {
			$clauses[] = $clause;
		}
		$bindings = array_merge( $bindings, $q['bindings'] );
	}

	foreach ( $filters as $key => $value ) {
		$clause    = wine_agent_build_filter_clause( (string) $key, (string) $value );
		$clauses[] = $clause['sql'];
		$bindings  = array_merge( $bindings, $clause['bindings'] );
	}

	return [
		'sql'      => empty( $clauses ) ? '1 = 1' : implode( ' AND ', $clauses ),
		'bindings' => $bindings,
	];
}

/**
 * The ORDER BY that reproduces the Node comparator.
 *
 * Absent values sort last in BOTH directions, which is the `(col IS NULL)`
 * leading term. Review-date ties are broken by rating, highest first
 * regardless of direction, with unrated last. Anything still tied falls back
 * to id, the order the loader reads rows in — the Node sort is stable over an
 * array built by `ORDER BY p.ID ASC`, so this is the same tie resolution.
 *
 * @param string $sort_by    Sort field.
 * @param string $sort_order 'asc' or 'desc'.
 * @return string ORDER BY clause (without the keyword).
 */
function wine_agent_build_order_by( string $sort_by, string $sort_order ): string {
	$columns   = wine_agent_sortable_columns();
	$direction = ( 'asc' === $sort_order ) ? 'ASC' : 'DESC';
	$terms     = [];

	if ( isset( $columns[ $sort_by ] ) ) {
		$column  = $columns[ $sort_by ];
		$terms[] = "($column IS NULL) ASC";
		$terms[] = "$column $direction";
	}

	if ( 'publicationDate' === $sort_by ) {
		$terms[] = '(rating_sort IS NULL) ASC';
		$terms[] = 'rating_sort DESC';
	}

	$terms[] = 'id ASC';
	return implode( ', ', $terms );
}

/**
 * Build the search query: the row SQL and the matching count SQL.
 *
 * Every filter key and every sort field is one the index has a column for, so
 * the plan is always complete — `rows_sql` returns exactly the requested page
 * and nothing is finished in memory.
 *
 * @param array $params Request query params.
 * @return array Query plan.
 */
function wine_agent_build_search_sql( array $params ): array {
	$table = '{TABLE}';

	$query        = isset( $params['q'] ) ? trim( (string) $params['q'] ) : '';
	$search_notes = isset( $params['notes'] ) && ( '1' === (string) $params['notes'] || 'true' === (string) $params['notes'] );
	$filters      = wine_agent_collect_filters( $params );

	$sort_order = ( isset( $params['sort_order'] ) && 'asc' === $params['sort_order'] ) ? 'asc' : 'desc';
	$sort_by    = isset( $params['sort_by'] ) ? (string) $params['sort_by'] : '';
	if ( 'relevance' === $sort_by ) {
		$sort_by = 'rating';
	}
	// Only sorts the index has a typed column for. Anything else falls back to
	// the default rather than being sorted in memory over every matched row.
	// Mirrors SORT_FIELDS in web/server/app.ts.
	if ( ! isset( wine_agent_sortable_columns()[ $sort_by ] ) ) {
		$sort_by = 'publicationDate';
	}

	$window = wine_agent_page_window( $params );
	$limit  = $window['limit'];
	$offset = $window['offset'];

	$where    = wine_agent_build_where( $query, $search_notes, $filters );
	$order_by = wine_agent_build_order_by( $sort_by, $sort_order );

	return [
		'rows_sql'       => "SELECT display_json FROM $table WHERE {$where['sql']} ORDER BY $order_by LIMIT %d OFFSET %d",
		'rows_bindings'  => array_merge( $where['bindings'], [ $limit, $offset ] ),
		'count_sql'      => "SELECT COUNT(*) FROM $table WHERE {$where['sql']}",
		'count_bindings' => $where['bindings'],
		'sort_by'        => $sort_by,
		'sort_order'     => $sort_order,
		'limit'          => $limit,
		'offset'         => $offset,
	];
}

/**
 * Build the faceted metadata queries: one per facet, each narrowed by every
 * OTHER active filter so a facet never narrows itself, plus the unfiltered
 * high-water mark for the Cases slider.
 *
 * The free-text query is deliberately absent — `collectFilters` drops `q`, and
 * the Node meta endpoint never sees it either.
 *
 * @param array $filters Active filters.
 * @return array Facet query plans.
 */
function wine_agent_build_meta_sqls( array $filters ): array {
	$table  = '{TABLE}';
	$facets = [
		'varietals'           => 'mainVarietal',
		'regions'             => 'region',
		'types'               => 'type',
		'avaList'             => 'ava',
		'stateProvinces'      => 'stateProvince',
		'specialDesignations' => 'specialDesignation',
	];

	$plans = [];
	foreach ( $facets as $key => $controls ) {
		$others = [];
		foreach ( $filters as $fkey => $fvalue ) {
			if ( $fkey !== $controls ) {
				$others[ $fkey ] = $fvalue;
			}
		}
		$where  = wine_agent_build_where( '', false, $others );
		$column = 'd_' . wine_agent_column( $controls );

		// MIN(id) reproduces the order the values first appear in the Node
		// array, which is what its Set preserves before the sort — so ties in
		// the case-insensitive sort below land the same way in both.
		$plans[ $key ] = [
			'sql'      => "SELECT $column AS value, MIN(id) AS first_id FROM $table WHERE {$where['sql']} AND $column <> '' GROUP BY $column ORDER BY first_id ASC",
			'bindings' => $where['bindings'],
			'field'    => $controls,
		];
	}

	$plans['casesMax'] = [
		'sql'      => "SELECT COALESCE(MAX(cases_num), 0) FROM $table",
		'bindings' => [],
		'field'    => 'cases',
	];

	return $plans;
}

/**
 * Known junk varietal values (data-entry typos) kept out of the dropdown.
 *
 * @return string[]
 */
function wine_agent_varietal_exclusions(): array {
	return [ 'Ca' ];
}

/**
 * Sort and post-process a facet's raw values into the list the API returns.
 *
 * @param string   $facet_key Facet key.
 * @param string[] $values    Distinct display values in first-appearance order.
 * @return string[] Final option list.
 */
function wine_agent_finish_facet( string $facet_key, array $values ): array {
	// usort is stable in PHP 8, so values the case-insensitive comparison
	// treats as equal keep first-appearance order — same as the JS sort.
	usort( $values, 'wine_agent_compare_display' );

	if ( 'varietals' === $facet_key ) {
		$excluded = array_flip( wine_agent_varietal_exclusions() );
		return array_values(
			array_filter(
				$values,
				function ( $v ) use ( $excluded ) {
					return ! isset( $excluded[ $v ] );
				}
			)
		);
	}

	if ( 'specialDesignations' === $facet_key ) {
		return wine_agent_designation_group_labels( $values );
	}

	return array_values( $values );
}
