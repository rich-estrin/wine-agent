<?php
/**
 * The /search and /meta handler bodies, written against an injected database
 * executor rather than $wpdb so the parity harness can run this exact code
 * against SQLite and diff it with the Node API.
 *
 * The executor is any callable( string $sql, array $bindings ): array
 * returning rows as associative arrays. The WordPress layer passes one backed
 * by $wpdb->prepare/get_results; the harness passes one backed by PDO.
 *
 * @package WineAgent
 */

require_once __DIR__ . '/text.php';
require_once __DIR__ . '/wine-utils.php';
require_once __DIR__ . '/wine-map.php';
require_once __DIR__ . '/wine-query.php';

/**
 * Whether a wine satisfies one filter — the PHP port of `matchesFilter`.
 *
 * The SQL builder handles every filter the frontend actually sends; this is
 * the fallback for unindexed fields, and doubles as the reference definition
 * of what those filters mean.
 *
 * @param array  $wine         Wine array.
 * @param string $key          Filter key.
 * @param string $filter_value Filter value.
 * @return bool Whether the wine matches.
 */
function wine_agent_matches_filter( array $wine, string $key, string $filter_value ): bool {
	$rating = (string) ( $wine['rating'] ?? '' );

	if ( 'scoreMin' === $key || 'scoreMax' === $key ) {
		$n     = wine_agent_js_parse_float( $rating );
		$bound = wine_agent_js_parse_float( $filter_value );
		if ( false !== strpos( $rating, '*' ) || null === $n || null === $bound ) {
			return false;
		}
		return 'scoreMin' === $key ? $n >= $bound : $n <= $bound;
	}

	if ( 'priceMin' === $key || 'priceMax' === $key ) {
		$n     = wine_agent_parse_price_or_null( (string) ( $wine['price'] ?? '' ) );
		$bound = wine_agent_js_parse_float( $filter_value );
		if ( null === $n || null === $bound ) {
			return false;
		}
		return 'priceMin' === $key ? $n >= $bound : $n <= $bound;
	}

	if ( 'casesMin' === $key || 'casesMax' === $key ) {
		$n     = wine_agent_parse_cases_or_null( (string) ( $wine['cases'] ?? '' ) );
		$bound = wine_agent_js_parse_float( $filter_value );
		if ( null === $n || null === $bound ) {
			return false;
		}
		return 'casesMin' === $key ? $n >= $bound : $n <= $bound;
	}

	if ( 'ava' === $key ) {
		$allowed = array_map(
			function ( $s ) {
				return wine_agent_fold( trim( $s ) );
			},
			explode( ',', $filter_value )
		);
		return in_array( wine_agent_fold( (string) ( $wine['ava'] ?? '' ) ), $allowed, true );
	}

	if ( in_array( $key, wine_agent_exact_match_fields(), true ) ) {
		$wine_value = wine_agent_fold( (string) ( $wine[ $key ] ?? '' ) );
		$allowed    = [];
		foreach ( explode( ',', $filter_value ) as $s ) {
			$folded = wine_agent_fold( trim( $s ) );
			if ( '' !== $folded ) {
				$allowed[] = $folded;
			}
		}
		return in_array( $wine_value, $allowed, true );
	}

	if ( 'vintageMin' === $key || 'vintageMax' === $key ) {
		$v     = wine_agent_parse_vintage_or_null( (string) ( $wine['vintage'] ?? '' ) );
		$bound = wine_agent_js_parse_int( $filter_value );
		if ( null === $v || null === $bound ) {
			return false;
		}
		return 'vintageMin' === $key ? $v >= $bound : $v <= $bound;
	}

	if ( ! array_key_exists( $key, $wine ) ) {
		return false;
	}
	$wine_value = (string) $wine[ $key ];

	$parsed   = wine_agent_parse_filter_value( $filter_value );
	$operator = $parsed['operator'];
	$value    = $parsed['value'];

	switch ( $key ) {
		case 'price':
			$n = wine_agent_parse_price_or_null( $wine_value );
			$e = wine_agent_js_parse_float( $value );
			return null !== $n && null !== $e && wine_agent_compare_values( $n, $operator, $e );
		case 'rating':
			$n = wine_agent_parse_rating_or_null( $wine_value );
			$e = wine_agent_js_parse_float( $value );
			return null !== $n && null !== $e && wine_agent_compare_values( $n, $operator, $e );
		case 'vintage':
			$v = wine_agent_parse_vintage_or_null( $wine_value );
			$e = wine_agent_js_parse_int( $value );
			return null !== $v && wine_agent_compare_values( $v, $operator, null === $e ? 0 : $e );
		case 'cases':
			$n = wine_agent_parse_cases_or_null( $wine_value );
			$e = wine_agent_js_parse_int( $value );
			return null !== $n && wine_agent_compare_values( $n, $operator, null === $e ? 0 : $e );
		case 'publicationDate':
		case 'tastingDate':
			$t = wine_agent_parse_date_or_null( $wine_value );
			$e = wine_agent_parse_date_or_null( $value );
			return null !== $t && null !== $e && wine_agent_compare_values( $t, $operator, $e );
		default:
			// Accent-insensitive substring — "Rhone" finds "Rhône".
			if ( '=' !== $operator ) {
				return false;
			}
			return false !== strpos( wine_agent_fold( $wine_value ), wine_agent_fold( $value ) );
	}
}

/**
 * Run a search and return the page of wines plus the total match count.
 *
 * @param callable $db     Executor: ( string $sql, array $bindings ) => rows.
 * @param array    $params Request query params.
 * @return array{wines:array,total:int}
 */
function wine_agent_run_search( callable $db, array $params ): array {
	$plan = wine_agent_build_search_sql( $params );

	if ( ! $plan['needs_php'] ) {
		$rows  = $db( $plan['rows_sql'], $plan['rows_bindings'] );
		$count = $db( $plan['count_sql'], $plan['count_bindings'] );
		return [
			'wines' => wine_agent_decode_rows( $rows ),
			'total' => (int) wine_agent_first_scalar( $count ),
		];
	}

	// Fallback: an unindexed filter or an unindexed sort. Materialise the
	// SQL-matched rows and finish the job in memory, exactly as Node does.
	$rows  = $db( $plan['rows_sql_all'], $plan['all_bindings'] );
	$wines = wine_agent_decode_rows( $rows );

	foreach ( $plan['php_filters'] as $key => $value ) {
		$wines = array_values(
			array_filter(
				$wines,
				function ( $wine ) use ( $key, $value ) {
					return wine_agent_matches_filter( $wine, (string) $key, (string) $value );
				}
			)
		);
	}

	$wines = wine_agent_sort_wines( $wines, $plan['sort_by'], $plan['sort_order'] );
	$total = count( $wines );
	$page  = array_slice( $wines, $plan['offset'], $plan['limit'] );

	return [
		'wines' => $page,
		'total' => $total,
	];
}

/**
 * Build the faceted metadata payload.
 *
 * @param callable $db     Executor.
 * @param array    $params Request query params.
 * @return array Meta payload.
 */
function wine_agent_run_meta( callable $db, array $params ): array {
	$filters = wine_agent_collect_filters( $params );
	$plans   = wine_agent_build_meta_sqls( $filters );

	$cases_plan = $plans['casesMax'];
	unset( $plans['casesMax'] );

	$result = [ 'casesMax' => (int) wine_agent_first_scalar( $db( $cases_plan['sql'], $cases_plan['bindings'] ) ) ];

	foreach ( $plans as $facet_key => $plan ) {
		$rows   = $db( $plan['sql'], $plan['bindings'] );
		$values = [];
		foreach ( $rows as $row ) {
			$row      = array_values( (array) $row );
			$values[] = (string) $row[0];
		}
		$result[ $facet_key ] = wine_agent_finish_facet( $facet_key, $values );
	}

	return $result;
}

/**
 * Decode a result set of display_json rows into Wine arrays.
 *
 * @param array $rows Raw rows.
 * @return array[] Wine arrays.
 */
function wine_agent_decode_rows( array $rows ): array {
	$wines = [];
	foreach ( $rows as $row ) {
		$row  = (array) $row;
		$json = isset( $row['display_json'] ) ? $row['display_json'] : reset( $row );
		$wine = json_decode( (string) $json, true );
		if ( is_array( $wine ) ) {
			$wines[] = $wine;
		}
	}
	return $wines;
}

/**
 * First column of the first row of a result set.
 *
 * @param array $rows Raw rows.
 * @return mixed Scalar value.
 */
function wine_agent_first_scalar( array $rows ) {
	if ( empty( $rows ) ) {
		return 0;
	}
	$first = array_values( (array) $rows[0] );
	return $first[0] ?? 0;
}

/**
 * The index table's column definitions, shared by the schema builder and the
 * row writer so the two cannot drift.
 *
 * Every text column is binary-collated: values are folded in PHP before they
 * land here, so SQL only ever does exact byte comparisons and the host's
 * collation never enters into a search result.
 *
 * @return array<string,string> Column name => MySQL definition.
 */
function wine_agent_index_columns(): array {
	$columns = [
		'id'             => 'BIGINT UNSIGNED NOT NULL',
		'words'          => 'TEXT COLLATE utf8mb4_bin',
		'folded_note'    => 'MEDIUMTEXT COLLATE utf8mb4_bin',
		'rating_num'     => 'FLOAT NULL',
		'rating_is_star' => 'TINYINT NOT NULL DEFAULT 0',
		'rating_sort'    => 'FLOAT NULL',
		'price_num'      => 'FLOAT NULL',
		'vintage_num'    => 'SMALLINT NULL',
		'cases_num'      => 'INT NULL',
		'pub_day'        => 'DATE NULL',
		'pub_ms'         => 'BIGINT NULL',
		'display_json'   => 'MEDIUMTEXT',
	];

	foreach ( wine_agent_facet_fields() as $field ) {
		$col                        = wine_agent_column( $field );
		$columns[ 'f_' . $col ]     = 'VARCHAR(191) COLLATE utf8mb4_bin NOT NULL DEFAULT \'\'';
		$columns[ 'd_' . $col ]     = 'VARCHAR(191) COLLATE utf8mb4_bin NOT NULL DEFAULT \'\'';
	}

	return $columns;
}
