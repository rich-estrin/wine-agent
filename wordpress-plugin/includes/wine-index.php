<?php
/**
 * The index table and everything that maintains it.
 *
 * This is the WordPress-facing half of the native search: it owns the schema,
 * the row writer, the incremental hooks and the full rebuild, and it supplies
 * the $wpdb executor that the WP-free handler core in wine-api-core.php runs
 * its queries through.
 *
 * The index is a cache of wp_posts/wp_postmeta, never a second source of
 * truth: every row is rebuilt from the same pivot query the /reviews endpoint
 * serves, and every value in it is derived by the shared per-row mapper. That
 * is what makes a single-row upsert on save equivalent to a full rebuild.
 *
 * @package WineAgent
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/wine-api-core.php';

/** Bumped when the schema or any indexed normalization changes; a mismatch triggers a rebuild. */
const WINE_AGENT_INDEX_VERSION = 1;

/** How many reviews to pivot and write per batch during a full rebuild. */
const WINE_AGENT_REBUILD_BATCH = 500;

/**
 * The index table name.
 *
 * @return string Prefixed table name.
 */
function wine_agent_index_table(): string {
	global $wpdb;
	return $wpdb->prefix . 'wine_agent_index';
}

/**
 * Meta keys the pivot reads, as alias => meta_key. Defined once so the
 * /reviews endpoint and the indexer can never drift apart.
 *
 * @return array<string,string>
 */
function wine_agent_review_meta_map(): array {
	return [
		'published_date'      => 'publishedDate',
		'tasting_note'        => 'review_content',
		'rating'              => 'rating',
		'price'               => 'price',
		'vintage'             => 'vintage',
		'wine_type'           => 'wine_type',
		'designation'         => 'designation',
		'variety_style'       => 'variety_style',
		'home_region'         => 'home_region',
		'appellation'         => 'appellation',
		'variety'             => 'varietal_label',
		'special_designation' => 'special_designation',
		'alcohol_percentage'  => 'alcohol_percentage',
		'closure'             => 'closure',
		'cases'               => 'cases',
		'state_or_province'   => 'state_or_province',
		'source'              => 'source',
		'reviewer'            => 'reviewer_user',
	];
}

/**
 * Fetch published review rows in the shape mapWPReview expects.
 *
 * One query: pivot the postmeta keys onto each post with MAX(CASE WHEN …).
 * Kept as an inner JOIN — a review carrying no postmeta at all has never been
 * returned, and the index must hold exactly what the API has always served.
 *
 * @param array $args limit, offset, ids, modified_after.
 * @return array[] Review rows.
 */
function wine_agent_fetch_review_rows( array $args = [] ): array {
	global $wpdb;

	$limit          = isset( $args['limit'] ) ? (int) $args['limit'] : 0;
	$offset         = isset( $args['offset'] ) ? (int) $args['offset'] : 0;
	$ids            = isset( $args['ids'] ) ? array_map( 'intval', (array) $args['ids'] ) : [];
	$modified_after = $args['modified_after'] ?? '';

	$pivot = [];
	foreach ( wine_agent_review_meta_map() as $alias => $meta_key ) {
		$pivot[] = $wpdb->prepare(
			"MAX( CASE WHEN pm.meta_key = %s THEN pm.meta_value END ) AS `$alias`",
			$meta_key
		);
	}

	$where    = [ "p.post_type = 'reviews'", "p.post_status = 'publish'" ];
	$bindings = [];

	if ( ! empty( $ids ) ) {
		$where[]  = 'p.ID IN (' . implode( ', ', array_fill( 0, count( $ids ), '%d' ) ) . ')';
		$bindings = array_merge( $bindings, $ids );
	}
	if ( ! empty( $modified_after ) ) {
		$where[]    = 'p.post_modified >= %s';
		$bindings[] = sanitize_text_field( $modified_after );
	}

	$sql = 'SELECT p.ID AS id, p.post_title AS brand_name, p.post_date AS entry_date, '
		. implode( ', ', $pivot )
		. " FROM {$wpdb->posts} p"
		. " JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID"
		. ' WHERE ' . implode( ' AND ', $where )
		. ' GROUP BY p.ID, p.post_title, p.post_date'
		. ' ORDER BY p.ID ASC';

	if ( $limit > 0 ) {
		$sql       .= ' LIMIT %d OFFSET %d';
		$bindings[] = $limit;
		$bindings[] = $offset;
	}

	if ( ! empty( $bindings ) ) {
		$sql = $wpdb->prepare( $sql, $bindings );
	}

	$rows = $wpdb->get_results( $sql, ARRAY_A );
	if ( ! is_array( $rows ) ) {
		return [];
	}

	return array_map( 'wine_agent_shape_review_row', $rows );
}

/**
 * Turn a raw pivot row into the review shape the mapper and the REST endpoint
 * both consume.
 *
 * @param array $row Raw pivot row.
 * @return array Review row.
 */
function wine_agent_shape_review_row( array $row ): array {
	return [
		'id'                  => (int) $row['id'],
		'brand_name'          => (string) $row['brand_name'],
		'wine_name'           => (string) ( $row['designation'] ?: $row['variety_style'] ?: $row['variety'] ),
		'designation'         => (string) $row['designation'],
		'variety_style'       => (string) $row['variety_style'],
		'tasting_note'        => (string) $row['tasting_note'],
		'rating'              => (string) $row['rating'],
		'price'               => (string) $row['price'],
		'vintage'             => (string) $row['vintage'],
		'wine_type'           => (string) $row['wine_type'],
		// Varietal Label alone — blank for a blend, whose name lives in
		// variety_style. The app applies its own fallback for filtering.
		'variety'             => (string) $row['variety'],
		'region'              => (string) $row['home_region'],
		'appellation'         => (string) $row['appellation'],
		'publication_date'    => wine_agent_format_acf_date( $row['published_date'] )
							  ?: substr( (string) $row['entry_date'], 0, 10 ),
		'special_designation' => (string) $row['special_designation'],
		'alcohol'             => (string) $row['alcohol_percentage'],
		'closure'             => (string) $row['closure'],
		'cases'               => (string) $row['cases'],
		'state_or_province'   => (string) $row['state_or_province'],
		'source'              => (string) $row['source'],
		'reviewer'            => (string) $row['reviewer'],
	];
}

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Create or update the index table.
 *
 * @return bool Whether the table exists afterwards.
 */
function wine_agent_index_install(): bool {
	global $wpdb;

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$table       = wine_agent_index_table();
	$charset     = $wpdb->get_charset_collate();
	$definitions = [];
	foreach ( wine_agent_index_columns() as $name => $definition ) {
		$definitions[] = "`$name` $definition";
	}
	$definitions[] = 'PRIMARY KEY  (id)';
	// The range and sort columns each get an index; `words` and `folded_note`
	// deliberately do not — a leading-wildcard LIKE cannot use a B-tree, so an
	// index on them would cost writes and buy nothing.
	$definitions[] = 'KEY pub_day (pub_day)';
	$definitions[] = 'KEY rating_sort (rating_sort)';
	$definitions[] = 'KEY price_num (price_num)';
	$definitions[] = 'KEY vintage_num (vintage_num)';
	$definitions[] = 'KEY cases_num (cases_num)';
	$definitions[] = 'KEY f_mainvarietal (f_mainvarietal)';
	$definitions[] = 'KEY f_type (f_type)';
	$definitions[] = 'KEY f_region (f_region)';
	$definitions[] = 'KEY f_stateprovince (f_stateprovince)';
	$definitions[] = 'KEY f_specialdesignation (f_specialdesignation)';
	$definitions[] = 'KEY f_ava (f_ava)';

	dbDelta( "CREATE TABLE $table (\n\t" . implode( ",\n\t", $definitions ) . "\n) $charset;" );

	return wine_agent_index_table_exists();
}

/**
 * Whether the index table is present.
 *
 * @return bool
 */
function wine_agent_index_table_exists(): bool {
	global $wpdb;
	$table = wine_agent_index_table();
	return (bool) $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
}

/**
 * Number of indexed reviews.
 *
 * @return int
 */
function wine_agent_index_count(): int {
	global $wpdb;
	if ( ! wine_agent_index_table_exists() ) {
		return 0;
	}
	return (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . wine_agent_index_table() );
}

/**
 * Whether the index is missing, empty or built by an older version — any of
 * which means a rebuild is owed before native mode can serve traffic.
 *
 * @return bool
 */
function wine_agent_index_needs_rebuild(): bool {
	if ( ! wine_agent_index_table_exists() ) {
		return true;
	}
	if ( (int) get_option( 'wine_agent_index_version', 0 ) !== WINE_AGENT_INDEX_VERSION ) {
		return true;
	}
	return 0 === wine_agent_index_count();
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Write index rows, replacing any existing row with the same id.
 *
 * Batched into one statement per call: a full rebuild at 18k reviews is 36
 * round trips this way instead of 18,000.
 *
 * @param array[]     $index_rows Rows from wine_agent_build_index_row().
 * @param string|null $table      Target table; defaults to the live index.
 * @return int Rows written.
 */
function wine_agent_index_write_rows( array $index_rows, ?string $table = null ): int {
	global $wpdb;
	if ( empty( $index_rows ) ) {
		return 0;
	}

	$table   = $table ?? wine_agent_index_table();
	$columns = array_keys( wine_agent_index_columns() );
	$quoted  = array_map(
		function ( $c ) {
			return "`$c`";
		},
		$columns
	);
	$row_marks = [];
	$bindings  = [];

	foreach ( $index_rows as $row ) {
		$marks = [];
		foreach ( $columns as $column ) {
			$value = $row[ $column ] ?? null;
			if ( 'pub_day' === $column && '' === $value ) {
				// A DATE column: '' would sort ahead of every real date rather
				// than last, so an absent day has to be NULL.
				$value = null;
			}
			if ( null === $value ) {
				$marks[] = 'NULL';
				continue;
			}
			if ( is_int( $value ) ) {
				$marks[] = '%d';
			} elseif ( is_float( $value ) ) {
				$marks[] = '%f';
			} else {
				$marks[] = '%s';
			}
			$bindings[] = $value;
		}
		$row_marks[] = '(' . implode( ', ', $marks ) . ')';
	}

	$sql = "REPLACE INTO $table (" . implode( ', ', $quoted ) . ') VALUES ' . implode( ', ', $row_marks );

	$result = $wpdb->query( $wpdb->prepare( $sql, $bindings ) );
	return false === $result ? 0 : count( $index_rows );
}

/**
 * Re-index a single review, or drop it from the index when it no longer
 * qualifies (unpublished, deleted, or carrying no meta).
 *
 * @param int $post_id Review post ID.
 * @return void
 */
function wine_agent_index_upsert_post( int $post_id ): void {
	if ( ! wine_agent_index_table_exists() ) {
		return;
	}

	$rows = wine_agent_fetch_review_rows( [ 'ids' => [ $post_id ] ] );
	if ( empty( $rows ) ) {
		wine_agent_index_delete_post( $post_id );
		return;
	}

	wine_agent_index_write_rows(
		[ wine_agent_build_index_row( wine_agent_map_review_row( $rows[0] ) ) ]
	);
}

/**
 * Remove a review from the index.
 *
 * @param int $post_id Review post ID.
 * @return void
 */
function wine_agent_index_delete_post( int $post_id ): void {
	global $wpdb;
	if ( ! wine_agent_index_table_exists() ) {
		return;
	}
	$wpdb->delete( wine_agent_index_table(), [ 'id' => $post_id ], [ '%d' ] );
}

// ─── Rebuilding ──────────────────────────────────────────────────────────────

/**
 * Run one slice of a full rebuild.
 *
 * Rebuilds resume from a stored offset and stop when the time budget is spent,
 * so an 18k-review site finishes across several passes instead of hitting
 * max_execution_time. The caller (admin button or cron) keeps calling until
 * `done` comes back true.
 *
 * Rows are written into a staging table and swapped in at the end, so the live
 * index is never half-rebuilt underneath a reader.
 *
 * @param int $budget_seconds Wall-clock budget for this pass.
 * @return array{done:bool,processed:int,total:int}
 */
function wine_agent_index_rebuild_step( int $budget_seconds = 20 ): array {
	global $wpdb;

	$staging = wine_agent_index_table() . '_new';
	$offset  = (int) get_option( 'wine_agent_index_rebuild_offset', 0 );
	$started = microtime( true );

	if ( 0 === $offset ) {
		$wpdb->query( "DROP TABLE IF EXISTS $staging" );
		$wpdb->query( 'CREATE TABLE ' . $staging . ' LIKE ' . wine_agent_index_table() );
	}

	$total = (int) $wpdb->get_var(
		"SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
		 JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID
		 WHERE p.post_type = 'reviews' AND p.post_status = 'publish'"
	);

	while ( $offset < $total ) {
		$rows = wine_agent_fetch_review_rows(
			[
				'limit'  => WINE_AGENT_REBUILD_BATCH,
				'offset' => $offset,
			]
		);
		if ( empty( $rows ) ) {
			break;
		}

		$index_rows = [];
		foreach ( $rows as $row ) {
			$index_rows[] = wine_agent_build_index_row( wine_agent_map_review_row( $row ) );
		}
		wine_agent_index_write_rows( $index_rows, $staging );

		$offset += count( $rows );
		update_option( 'wine_agent_index_rebuild_offset', $offset, false );

		if ( ( microtime( true ) - $started ) >= $budget_seconds ) {
			break;
		}
	}

	$done = $offset >= $total;
	if ( $done ) {
		$live = wine_agent_index_table();
		$old  = $live . '_old';
		$wpdb->query( "DROP TABLE IF EXISTS $old" );
		// One atomic RENAME: readers see the old index right up to the swap and
		// the new one immediately after, never an empty or partial table.
		$wpdb->query( "RENAME TABLE $live TO $old, $staging TO $live" );
		$wpdb->query( "DROP TABLE IF EXISTS $old" );

		update_option( 'wine_agent_index_version', WINE_AGENT_INDEX_VERSION, false );
		update_option( 'wine_agent_index_built_at', gmdate( 'c' ), false );
		delete_option( 'wine_agent_index_rebuild_offset' );
	}

	return [
		'done'      => $done,
		'processed' => $offset,
		'total'     => $total,
	];
}

// ─── Query execution ─────────────────────────────────────────────────────────

/**
 * The database executor the handler core runs its generated SQL through.
 *
 * @return callable Executor.
 */
function wine_agent_index_executor(): callable {
	global $wpdb;
	$table = wine_agent_index_table();

	return function ( string $sql, array $bindings ) use ( $wpdb, $table ) {
		$sql = str_replace( '{TABLE}', $table, $sql );
		if ( ! empty( $bindings ) ) {
			$sql = $wpdb->prepare( $sql, $bindings );
		}
		$rows = $wpdb->get_results( $sql, ARRAY_A );
		return is_array( $rows ) ? $rows : [];
	};
}
