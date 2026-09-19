<?php
/**
 * Tests the rebuild lock that serializes index rebuild passes.
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
 * Usage: php scripts/plugin-rebuild-lock-test.php
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
		if ( false !== strpos( $sql, 'COUNT' ) ) {
			return '18355';
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
		return [];
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

// ── Report ───────────────────────────────────────────────────────────────────

if ( empty( $GLOBALS['failures'] ) ) {
	echo "rebuild lock test: ok\n";
	exit( 0 );
}

echo 'rebuild lock test: ' . count( $GLOBALS['failures'] ) . " failure(s)\n";
foreach ( $GLOBALS['failures'] as $failure ) {
	echo "  - $failure\n";
}
exit( 1 );
