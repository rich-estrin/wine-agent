<?php
/**
 * Loads the plugin against a stub WordPress to catch anything that would fatal
 * on activation — a redeclared function, a missing include, a call made at load
 * time rather than on a hook.
 *
 * This is not a functional test of the WordPress integration (that needs a real
 * $wpdb; see the staging A/B in scripts/parity/run-remote.mjs). It is the cheap
 * check that the file WordPress is about to run parses, loads, and registers
 * what it means to.
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
	'wine_agent_index_executor',
	'wine_agent_fetch_review_rows',
	'wine_agent_shape_review_row',
	// Plugin surface.
	'wine_agent_search_mode',
	'wine_agent_handle_search',
	'wine_agent_handle_meta',
	'wine_agent_proxy_request',
	'wine_agent_get_reviews',
	'wine_agent_settings_page',
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
