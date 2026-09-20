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
 * How many mid-rebuild edits the catch-up list will hold. Past this the list
 * stops growing and the nightly rebuild becomes the backstop — which is
 * already its job for anything that bypasses the post hooks. Reaching it takes
 * thousands of editor saves inside one rebuild window.
 */
const WINE_AGENT_REBUILD_DIRTY_MAX = 5000;

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
 * Whether a rebuild is part-way through.
 *
 * A stored offset is the marker: it exists from the moment a rebuild builds
 * its staging table until the pass that swaps it in deletes it.
 *
 * @return bool
 */
function wine_agent_index_rebuild_in_progress(): bool {
	return null !== get_option( 'wine_agent_index_rebuild_offset', null );
}

/**
 * Note a review whose index row changed while a rebuild was in flight.
 *
 * Incremental upserts write to the live table, but a rebuild accumulates into
 * a staging table and then RENAMEs it over the live one. Without this list,
 * anything saved between the first pass and the swap is written to the table
 * about to be discarded, and disappears from search until the next nightly
 * rebuild — up to a day after the editor watched it save.
 *
 * @param int $post_id Review post ID.
 * @return void
 */
function wine_agent_index_note_dirty( int $post_id ): void {
	if ( ! wine_agent_index_rebuild_in_progress() ) {
		return;
	}
	$dirty = get_option( 'wine_agent_index_rebuild_dirty', [] );
	if ( ! is_array( $dirty ) ) {
		$dirty = [];
	}
	if ( count( $dirty ) >= WINE_AGENT_REBUILD_DIRTY_MAX || in_array( $post_id, $dirty, true ) ) {
		return;
	}
	$dirty[] = $post_id;
	update_option( 'wine_agent_index_rebuild_dirty', $dirty, false );
}

/**
 * Re-apply the noted edits to the freshly swapped-in index.
 *
 * Runs after the RENAME, never before: applied to the staging table it would
 * be writing to a table that is about to become `_old`. Each id goes back
 * through the ordinary upsert, which re-reads the post and drops the row if
 * the review no longer qualifies — so unpublishes and deletes replay as
 * correctly as saves do.
 *
 * @return void
 */
function wine_agent_index_replay_dirty(): void {
	$dirty = get_option( 'wine_agent_index_rebuild_dirty', [] );
	delete_option( 'wine_agent_index_rebuild_dirty' );
	if ( ! is_array( $dirty ) ) {
		return;
	}
	foreach ( $dirty as $post_id ) {
		wine_agent_index_upsert_post( (int) $post_id );
	}
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

	wine_agent_index_note_dirty( $post_id );

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
	wine_agent_index_note_dirty( $post_id );
	$wpdb->delete( wine_agent_index_table(), [ 'id' => $post_id ], [ '%d' ] );
}

// ─── Rebuilding ──────────────────────────────────────────────────────────────

/**
 * Name of the advisory lock that serializes rebuild passes.
 *
 * MySQL scopes advisory locks to the whole server, not to a database, so the
 * name carries the database and table prefix: staging and production sharing a
 * MySQL instance must not block each other. MySQL caps lock names at 64 chars.
 *
 * @return string
 */
function wine_agent_index_lock_name(): string {
	global $wpdb;
	return substr( 'wine_agent_rebuild_' . $wpdb->dbname . '_' . $wpdb->prefix, 0, 64 );
}

/**
 * Try to take the rebuild lock, without waiting.
 *
 * A rebuild has two independent drivers that can overlap: the admin Rebuild
 * button, and the cron continuation chain that the first admin page load after
 * activation kicks off. Two passes sharing one stored offset skip rows — each
 * reads the offset once, then writes its own value back, so the higher one
 * wins and the rows in between are never written. A pass can also RENAME the
 * staging table out from under a pass still writing to it.
 *
 * An option or a transient cannot fix that: both are read-then-write, racy in
 * exactly the way being fixed here. GET_LOCK is atomic, and the server drops it
 * when the connection closes, so a PHP process dying mid-pass releases the lock
 * instead of wedging every future rebuild.
 *
 * @return bool Whether the lock is now held by this connection.
 */
function wine_agent_index_lock(): bool {
	global $wpdb;
	return 1 === (int) $wpdb->get_var(
		$wpdb->prepare( 'SELECT GET_LOCK(%s, 0)', wine_agent_index_lock_name() )
	);
}

/**
 * Release the rebuild lock.
 *
 * @return void
 */
function wine_agent_index_unlock(): void {
	global $wpdb;
	$wpdb->query( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', wine_agent_index_lock_name() ) );
}

/**
 * How many published reviews a full rebuild has to cover.
 *
 * @return int
 */
function wine_agent_index_published_count(): int {
	global $wpdb;
	return (int) $wpdb->get_var(
		"SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
		 JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID
		 WHERE p.post_type = 'reviews' AND p.post_status = 'publish'"
	);
}

/**
 * Run one slice of a full rebuild, under the rebuild lock.
 *
 * Rebuilds resume from a stored offset and stop when the time budget is spent,
 * so an 18k-review site finishes across several passes instead of hitting
 * max_execution_time. The caller (admin button or cron) keeps calling until
 * `done` comes back true.
 *
 * Only one pass runs at a time. A caller that arrives while another pass holds
 * the lock gets `busy` back rather than a second overlapping pass — see
 * wine_agent_index_lock(). Serialized passes are still correct and still make
 * progress, because each one resumes from the stored offset.
 *
 * @param int $budget_seconds Wall-clock budget for this pass.
 * @return array{done:bool,busy:bool,processed:int,total:int}
 */
function wine_agent_index_rebuild_step( int $budget_seconds = 20 ): array {
	if ( ! wine_agent_index_lock() ) {
		return [
			'done'      => false,
			'busy'      => true,
			'processed' => (int) get_option( 'wine_agent_index_rebuild_offset', 0 ),
			'total'     => wine_agent_index_published_count(),
		];
	}
	try {
		return wine_agent_index_rebuild_step_locked( $budget_seconds );
	} finally {
		wine_agent_index_unlock();
	}
}

/**
 * The rebuild pass itself. Only ever called with the lock held.
 *
 * Rows are written into a staging table and swapped in at the end, so the live
 * index is never half-rebuilt underneath a reader.
 *
 * @param int $budget_seconds Wall-clock budget for this pass.
 * @return array{done:bool,busy:bool,processed:int,total:int}
 */
function wine_agent_index_rebuild_step_locked( int $budget_seconds ): array {
	global $wpdb;

	$staging = wine_agent_index_table() . '_new';
	$offset  = (int) get_option( 'wine_agent_index_rebuild_offset', 0 );
	$started = microtime( true );

	if ( 0 === $offset ) {
		$wpdb->query( "DROP TABLE IF EXISTS $staging" );
		$wpdb->query( 'CREATE TABLE ' . $staging . ' LIKE ' . wine_agent_index_table() );
		// Store the offset even at zero: its presence is what tells the post
		// hooks a rebuild is in flight and their writes need noting for catch-up.
		update_option( 'wine_agent_index_rebuild_offset', 0, false );
	}

	$total = wine_agent_index_published_count();

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
		// Clear the in-progress marker before replaying, so the replay's own
		// writes aren't noted as a fresh round of catch-up.
		delete_option( 'wine_agent_index_rebuild_offset' );
		wine_agent_index_replay_dirty();
	}

	return [
		'done'      => $done,
		'busy'      => false,
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
