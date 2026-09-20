<?php
/**
 * Loads the plugin against a stub WordPress to catch anything that would fatal
 * on activation — a redeclared function, a missing include, a call made at load
 * time rather than on a hook.
 *
 * This is not a functional test of the WordPress integration — that needs a
 * real $wpdb, and is what the post-upload spot-check in DEPLOYMENT.md covers.
 * It is the cheap check that the file WordPress is about to run parses, loads,
 * and registers what it means to.
 *
 * Usage: php scripts/plugin-load-test.php
 */

define( 'ABSPATH', __DIR__ . '/../' );
define( 'HOUR_IN_SECONDS', 3600 );

$GLOBALS['stub_hooks']      = [];
$GLOBALS['stub_shortcodes'] = [];

function plugin_dir_path( $file ) {
	return dirname( $file ) . '/';
}
function add_action( $hook, $callback, $priority = 10, $args = 1 ) {
	$GLOBALS['stub_hooks'][ $hook ][] = $callback;
	return true;
}
function add_filter( $hook, $callback, $priority = 10, $args = 1 ) {
	$GLOBALS['stub_hooks'][ $hook ][] = $callback;
	return true;
}
function add_shortcode( $tag, $callback ) {
	$GLOBALS['stub_shortcodes'][ $tag ] = $callback;
}
function register_activation_hook( $file, $callback ) {
	$GLOBALS['stub_hooks']['activate'][] = $callback;
}
function register_deactivation_hook( $file, $callback ) {
	$GLOBALS['stub_hooks']['deactivate'][] = $callback;
}

function wp_dequeue_script( $handle ) {}
function wp_enqueue_script( $handle, $src = '', $deps = [], $ver = null, $footer = false ) {}
function wp_enqueue_style( $handle, $src = '', $deps = [], $ver = null ) {}
function plugins_url( $path = '', $file = '' ) {
	return 'https://example.test/wp-content/plugins/wine-agent-api/' . ltrim( $path, '/' );
}
function rest_url( $path = '' ) {
	return 'https://example.test/wp-json/' . ltrim( $path, '/' );
}
function wp_json_encode( $value, $flags = 0 ) {
	return json_encode( $value, $flags );
}
function esc_html( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}
/** Real get_file_data is close enough for a header read. */
function get_file_data( $file, $headers, $context = '' ) {
	$contents = file_get_contents( $file );
	$found    = [];
	foreach ( $headers as $key => $label ) {
		$found[ $key ] = preg_match( '/^[ \t\/*#@]*' . preg_quote( $label, '/' ) . ':(.*)$/mi', $contents, $m )
			? trim( $m[1] )
			: '';
	}
	return $found;
}

$plugin = __DIR__ . '/../wordpress-plugin/wine-agent-api.php';
require_once $plugin;

// ── Assertions ───────────────────────────────────────────────────────────────
$failures = [];

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

$required_functions = [
	// WordPress-free core.
	'wine_agent_fold',
	'wine_agent_fold_words',
	'wine_agent_fold_search_words',
	'wine_agent_parse_price_or_null',
	'wine_agent_parse_rating_or_null',
	'wine_agent_normalize_cases',
	'wine_agent_sort_wines',
	'wine_agent_map_review_row',
	'wine_agent_build_index_row',
	'wine_agent_build_search_sql',
	'wine_agent_build_meta_sqls',
	'wine_agent_run_search',
	'wine_agent_run_meta',
	'wine_agent_index_columns',
	// WordPress half.
	'wine_agent_index_table',
	'wine_agent_index_install',
	'wine_agent_index_upsert_post',
	'wine_agent_index_delete_post',
	'wine_agent_index_rebuild_step',
	'wine_agent_index_rebuild_step_locked',
	'wine_agent_index_lock',
	'wine_agent_index_unlock',
	'wine_agent_index_lock_name',
	'wine_agent_index_published_count',
	'wine_agent_index_executor',
	'wine_agent_fetch_review_rows',
	'wine_agent_shape_review_row',
	// Plugin surface.
	'wine_agent_handle_search',
	'wine_agent_handle_meta',
	'wine_agent_get_reviews',
	'wine_agent_settings_page',
	'wine_agent_index_maybe_start_rebuild',
	'wine_agent_index_continue_rebuild',
];
foreach ( $required_functions as $name ) {
	expect( function_exists( $name ), "function $name is not defined" );
}

$required_hooks = [
	'rest_api_init',
	'save_post_reviews',
	'trashed_post',
	'untrashed_post',
	'before_delete_post',
	'admin_init',
	'admin_menu',
	'wine_agent_index_nightly',
	'wine_agent_index_continue',
	'activate',
	'deactivate',
];
foreach ( $required_hooks as $hook ) {
	expect( ! empty( $GLOBALS['stub_hooks'][ $hook ] ), "no callback registered on $hook" );
}

expect( isset( $GLOBALS['stub_shortcodes']['wine-search'] ), '[wine-search] shortcode not registered' );

// ── The version marker ───────────────────────────────────────────────────────
// The rendered page has to name the plugin version it is running, so a deploy
// can be confirmed from the page itself rather than from WP Admin. Read the
// expected version straight out of the header, so the two cannot drift.
preg_match( '/^\s*\*\s*Version:\s*(.+)$/m', file_get_contents( $plugin ), $header );
$header_version = isset( $header[1] ) ? trim( $header[1] ) : '';

expect( '' !== $header_version, 'could not read a Version out of the plugin header' );
expect(
	function_exists( 'wine_agent_plugin_version' ),
	'function wine_agent_plugin_version is not defined'
);
if ( function_exists( 'wine_agent_plugin_version' ) ) {
	expect(
		$header_version === wine_agent_plugin_version(),
		"wine_agent_plugin_version() returned '" . wine_agent_plugin_version() . "', header says '$header_version'"
	);
}

$rendered = $GLOBALS['stub_shortcodes']['wine-search']();

expect(
	false !== strpos( $rendered, $header_version ),
	"the shortcode output does not name the plugin version ($header_version)"
);
expect(
	false !== strpos( $rendered, 'id="wine-agent-version"' ),
	'the version marker has no stable id to look it up by'
);
// Non-visible: it is a verification aid, not page content.
expect(
	(bool) preg_match( '/<span id="wine-agent-version"[^>]*display:\s*none/', $rendered ),
	'the version marker is not hidden — it would print on the page'
);
expect(
	(bool) preg_match( '/<span id="wine-agent-version"[^>]*aria-hidden="true"/', $rendered ),
	'the version marker is not hidden from screen readers'
);
// Emitted even when the assets are missing, which is exactly when knowing the
// installed version matters most. This run has no assets/manifest.json.
expect(
	false !== strpos( $rendered, 'assets not found' ),
	'expected the assets-missing path in a source checkout (no built assets present)'
);
expect( defined( 'WINE_AGENT_INDEX_VERSION' ), 'WINE_AGENT_INDEX_VERSION not defined' );

// The index row and the schema have to agree on the column set, or every
// write silently drops or invents a column.
$sample = wine_agent_map_review_row(
	[
		'id'          => 7,
		'brand_name'  => 'Gård Vintners',
		'price'       => '32',
		'rating'      => '***1/2',
		'appellation' => 'ancient lakes',
		'cases'       => '1,200 cases',
	]
);
$row     = wine_agent_build_index_row( $sample );
$columns = array_keys( wine_agent_index_columns() );
$missing = array_diff( $columns, array_keys( $row ) );
$extra   = array_diff( array_keys( $row ), $columns );
expect( empty( $missing ), 'index row is missing columns: ' . implode( ', ', $missing ) );
expect( empty( $extra ), 'index row has columns the schema lacks: ' . implode( ', ', $extra ) );

// Spot-check that the mapper actually normalized, rather than passing through.
expect( 'Ancient Lakes of Columbia Valley' === $sample['ava'], 'AVA correction not applied' );
expect( '$32' === $sample['price'], 'price not prefixed' );
expect( '1200' === $sample['cases'], 'cases not normalized' );
expect( 3.5 === $row['rating_sort'], 'star rating not parsed to 3.5' );
expect( 1 === $row['rating_is_star'], 'star rating not flagged' );
expect( null === $row['rating_num'], 'star rating leaked into the numeric score column' );

// The generated SQL must carry one binding per placeholder, or $wpdb->prepare
// fails at runtime on a query no test would otherwise exercise.
$plan  = wine_agent_build_search_sql(
	[
		'q'        => "l'ecole semillon",
		'notes'    => '1',
		'type'     => 'Red,White',
		'priceMin' => '20',
		'sort_by'  => 'publicationDate',
	]
);
$marks = preg_match_all( '/%[sdf]/', $plan['count_sql'] );
expect(
	$marks === count( $plan['count_bindings'] ),
	"count SQL has $marks placeholders but " . count( $plan['count_bindings'] ) . ' bindings'
);
$row_marks = preg_match_all( '/%[sdf]/', $plan['rows_sql'] );
expect(
	$row_marks === count( $plan['rows_bindings'] ),
	"rows SQL has $row_marks placeholders but " . count( $plan['rows_bindings'] ) . ' bindings'
);
expect( false !== strpos( $plan['rows_sql'], '{TABLE}' ), 'rows SQL lost its {TABLE} marker' );

foreach ( wine_agent_build_meta_sqls( [ 'type' => 'Red' ] ) as $key => $meta_plan ) {
	$meta_marks = preg_match_all( '/%[sdf]/', $meta_plan['sql'] );
	expect(
		$meta_marks === count( $meta_plan['bindings'] ),
		"meta[$key] has $meta_marks placeholders but " . count( $meta_plan['bindings'] ) . ' bindings'
	);
}

// ── Report ───────────────────────────────────────────────────────────────────
if ( empty( $failures ) ) {
	echo "plugin load test: ok (" . count( $required_functions ) . ' functions, '
		. count( $required_hooks ) . " hooks)\n";
	exit( 0 );
}

echo "plugin load test: " . count( $failures ) . " failure(s)\n";
foreach ( $failures as $failure ) {
	echo "  - $failure\n";
}
exit( 1 );
