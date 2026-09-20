<?php
/**
 * Tests the index rebuild: the lock that serializes passes, and the catch-up
 * that keeps edits made during a rebuild from being swapped away.
 *
 * A rebuild has two independent drivers — the admin Rebuild button and the cron
 * continuation chain — and before the lock they could overlap on one shared
 * offset and skip rows, or RENAME the staging table out from under a pass still
 * writing to it. These are the properties that stop that happening:
 *
 *   1. A caller that cannot take the lock gets `busy` back and touches nothing.
 *   2. The lock is released even when the pass throws part-way through, so a
 *      failed rebuild cannot wedge every rebuild after it.
 *   3. The lock name is scoped to this database, so staging and production
 *      sharing a MySQL server do not block each other.
 *
 * Unlike plugin-load-test.php this one does stub $wpdb, because the lock is
 * nothing but its database calls.
 *
 * Usage: php scripts/plugin-rebuild-test.php
 */

define( 'ABSPATH', __DIR__ . '/../' );
define( 'ARRAY_A', 'ARRAY_A' );

$GLOBALS['failures'] = [];

/**
 * Record a failed expectation.
 *
 * @param bool   $condition Expectation.
 * @param string $message   What was expected.
 * @return void
 */
function expect( bool $condition, string $message ): void {
	if ( ! $condition ) {
		$GLOBALS['failures'][] = $message;
	}
}

// ── Stub WordPress ───────────────────────────────────────────────────────────

$GLOBALS['stub_options'] = [];

function get_option( $name, $default = false ) {
	return $GLOBALS['stub_options'][ $name ] ?? $default;
}
function update_option( $name, $value, $autoload = null ) {
	$GLOBALS['stub_options'][ $name ] = $value;
	return true;
}
function delete_option( $name ) {
	unset( $GLOBALS['stub_options'][ $name ] );
	return true;
}

/**
 * Minimal $wpdb: records every statement, and answers GET_LOCK with whatever
 * the test asked for.
 */
class Stub_WPDB {
	public $prefix    = 'wp_';
	public $dbname    = 'nwwr_prod';
	public $posts     = 'wp_posts';
	public $postmeta  = 'wp_postmeta';
	public $statements = [];

	/** Whether GET_LOCK should succeed. */
	public $lock_granted = true;
	/** What COUNT(*) over published reviews answers. */
	public $published = '18355';
	/** Whether the index table appears to exist. */
	public $table_exists = true;
	/** Rows wine_agent_fetch_review_rows() should return. */
	public $review_rows = [];
	/** Substring of a statement that should throw when run. */
	public $explode_on = null;

	public function prepare( $sql, ...$args ) {
		if ( 1 === count( $args ) && is_array( $args[0] ) ) {
			$args = $args[0];
		}
		foreach ( $args as $arg ) {
			$sql = preg_replace( '/%[sdf]/', is_numeric( $arg ) ? (string) $arg : "'$arg'", $sql, 1 );
		}
		return $sql;
	}

	public function get_var( $sql ) {
		$this->statements[] = $sql;
		if ( false !== strpos( $sql, 'GET_LOCK' ) ) {
			return $this->lock_granted ? '1' : '0';
		}
		if ( false !== strpos( $sql, 'SHOW TABLES' ) ) {
			return $this->table_exists ? 'wp_wine_agent_index' : null;
		}
		if ( false !== strpos( $sql, 'COUNT' ) ) {
			return $this->published;
		}
		return null;
	}

	public function query( $sql ) {
		$this->statements[] = $sql;
		if ( null !== $this->explode_on && false !== strpos( $sql, $this->explode_on ) ) {
			throw new RuntimeException( 'simulated database failure' );
		}
		return true;
	}

	public function get_results( $sql, $mode = null ) {
		$this->statements[] = $sql;
		return $this->review_rows;
	}

	public function delete( $table, $where, $formats = null ) {
		$this->statements[] = 'DELETE FROM ' . $table . ' WHERE id = ' . $where['id'];
		return 1;
	}

	public function get_charset_collate() {
		return 'DEFAULT CHARACTER SET utf8mb4';
	}

	/** Statements run so far that contain $needle. */
	public function matching( string $needle ): array {
		return array_values(
			array_filter(
				$this->statements,
				function ( $sql ) use ( $needle ) {
					return false !== strpos( $sql, $needle );
				}
			)
		);
	}

	public function reset(): void {
		$this->statements = [];
	}
}

global $wpdb;
$wpdb = new Stub_WPDB();

require_once __DIR__ . '/../wordpress-plugin/includes/wine-index.php';

// ── 1. The lock name is database-scoped ──────────────────────────────────────

$name = wine_agent_index_lock_name();
expect(
	false !== strpos( $name, 'nwwr_prod' ) && false !== strpos( $name, 'wp_' ),
	"lock name is not scoped to the database and prefix: $name"
);
expect( strlen( $name ) <= 64, 'lock name exceeds MySQL 64-char limit: ' . strlen( $name ) );

$wpdb->dbname = 'nwwr_staging';
expect(
	wine_agent_index_lock_name() !== $name,
	'staging and production share a lock name — one site would block the other'
);
$wpdb->dbname = 'nwwr_prod';

// ── 2. A caller that cannot take the lock does nothing ───────────────────────

$wpdb->reset();
$wpdb->lock_granted             = false;
$GLOBALS['stub_options']['wine_agent_index_rebuild_offset'] = 9000;

$state = wine_agent_index_rebuild_step( 20 );

expect( ! empty( $state['busy'] ), 'a blocked pass did not report busy' );
expect( false === $state['done'], 'a blocked pass reported done' );
expect( 9000 === $state['processed'], 'a blocked pass lost the stored offset' );
expect( 18355 === $state['total'], 'a blocked pass did not report the total' );

// The whole point: no schema changes, no swap, no progress written.
foreach ( [ 'DROP TABLE', 'CREATE TABLE', 'RENAME TABLE' ] as $ddl ) {
	expect(
		empty( $wpdb->matching( $ddl ) ),
		"a blocked pass issued $ddl — it must not touch the index at all"
	);
}
expect(
	9000 === $GLOBALS['stub_options']['wine_agent_index_rebuild_offset'],
	'a blocked pass overwrote the offset of the pass that holds the lock'
);
expect(
	empty( $wpdb->matching( 'RELEASE_LOCK' ) ),
	'a blocked pass released a lock it never held — that would free the running pass'
);

// ── 3. The lock is released even when the pass throws ────────────────────────

$wpdb->reset();
$wpdb->lock_granted = true;
$wpdb->explode_on   = 'CREATE TABLE';
// Offset 0 is what makes the pass build the staging table, which is where the
// simulated failure lands.
delete_option( 'wine_agent_index_rebuild_offset' );

$threw = false;
try {
	wine_agent_index_rebuild_step( 20 );
} catch ( RuntimeException $e ) {
	$threw = true;
}

expect( $threw, 'the simulated failure did not surface to the caller' );
expect(
	1 === count( $wpdb->matching( 'RELEASE_LOCK' ) ),
	'a pass that threw did not release the lock — every later rebuild would block'
);

// ── 4. A pass that takes the lock releases it once, normally ─────────────────

$wpdb->reset();
$wpdb->explode_on = null;
delete_option( 'wine_agent_index_rebuild_offset' );

$state = wine_agent_index_rebuild_step( 20 );

expect( empty( $state['busy'] ), 'a pass that holds the lock reported busy' );
expect(
	1 === count( $wpdb->matching( 'GET_LOCK' ) ),
	'expected exactly one GET_LOCK per pass'
);
expect(
	1 === count( $wpdb->matching( 'RELEASE_LOCK' ) ),
	'expected exactly one RELEASE_LOCK per pass'
);

// ── 5. Edits made during a rebuild survive the swap ──────────────────────────
//
// Incremental upserts write to the LIVE table, but a multi-pass rebuild
// accumulates into a staging table and then RENAMEs it over the live one. Any
// review saved between the first pass and the swap was therefore written to a
// table that was about to be thrown away, and vanished from search until the
// next nightly rebuild — up to 24 hours for an edit the editor watched save.

$wpdb->reset();
$wpdb->lock_granted = true;
$wpdb->explode_on   = null;
$GLOBALS['stub_options'] = [];

// A rebuild is part-way through: pass one has run and stored its offset.
update_option( 'wine_agent_index_rebuild_offset', 500 );

// An editor saves a review while that rebuild is in flight.
wine_agent_index_upsert_post( 4242 );

$dirty = get_option( 'wine_agent_index_rebuild_dirty', [] );
expect(
	in_array( 4242, array_map( 'intval', (array) $dirty ), true ),
	'a review saved during a rebuild was not recorded for catch-up'
);

// The rebuild now finishes and swaps the staging table in.
$wpdb->reset();
$wpdb->published = '500';
$state = wine_agent_index_rebuild_step( 20 );

expect( ! empty( $state['done'] ), 'the final pass did not report done' );
expect( 1 === count( $wpdb->matching( 'RENAME TABLE' ) ), 'the final pass did not swap the staging table in' );

$replayed = $wpdb->matching( '4242' );
expect(
	! empty( $replayed ),
	'the review saved mid-rebuild was not re-indexed after the swap — it is gone from search until the next nightly'
);

// The replay must land AFTER the rename, or it writes to the table being
// discarded and achieves nothing.
$order       = $wpdb->statements;
$rename_at   = null;
$replay_at   = null;
foreach ( $order as $i => $sql ) {
	if ( null === $rename_at && false !== strpos( $sql, 'RENAME TABLE' ) ) {
		$rename_at = $i;
	}
	if ( null === $replay_at && false !== strpos( $sql, '4242' ) ) {
		$replay_at = $i;
	}
}
expect(
	null !== $rename_at && null !== $replay_at && $replay_at > $rename_at,
	'the catch-up ran before the swap, so it wrote to the table being discarded'
);

expect(
	empty( get_option( 'wine_agent_index_rebuild_dirty', [] ) ),
	'the catch-up list was not cleared after being replayed'
);

// ── 6. Nothing is recorded when no rebuild is running ────────────────────────
//
// The list exists only to bridge a rebuild. Recording every ordinary save
// would grow an option on every edit, forever.

$GLOBALS['stub_options'] = [];
wine_agent_index_upsert_post( 77 );
expect(
	empty( get_option( 'wine_agent_index_rebuild_dirty', [] ) ),
	'an ordinary save outside a rebuild was recorded for catch-up'
);

// ── Report ───────────────────────────────────────────────────────────────────

if ( empty( $GLOBALS['failures'] ) ) {
	echo "rebuild test: ok\n";
	exit( 0 );
}

echo 'rebuild test: ' . count( $GLOBALS['failures'] ) . " failure(s)\n";
foreach ( $GLOBALS['failures'] as $failure ) {
	echo "  - $failure\n";
}
exit( 1 );
