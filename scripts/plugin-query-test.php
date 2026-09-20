<?php
/**
 * Bounds and key-filtering checks on the generated search SQL.
 *
 * These live here rather than in the parity battery because the parity harness
 * runs the PHP against SQLite, which accepts `LIMIT -5` (meaning "no limit")
 * where MySQL rejects it outright. A negative limit is therefore invisible to
 * a Node/PHP diff and has to be asserted on the query plan itself.
 *
 * Usage: php scripts/plugin-query-test.php
 */

require_once __DIR__ . '/../wordpress-plugin/includes/wine-query.php';

$failures = [];

function expect( bool $condition, string $message ): void {
	global $failures;
	if ( ! $condition ) {
		$failures[] = $message;
	}
}

/** The [ limit, offset ] a request would run with. */
function plan_window( array $params ): array {
	$plan     = wine_agent_build_search_sql( $params );
	$bindings = $plan['rows_bindings'];
	return [ array_slice( $bindings, -2 )[0], array_slice( $bindings, -1 )[0] ];
}

// ── Page size is capped ───────────────────────────────────────────────────────
[ $limit ] = plan_window( [ 'limit' => '100000' ] );
expect( 100 === $limit, "limit=100000 should clamp to 100, got $limit" );

[ $limit ] = plan_window( [ 'limit' => '40' ] );
expect( 40 === $limit, "limit=40 should pass through, got $limit" );

[ $limit ] = plan_window( [] );
expect( 20 === $limit, "an absent limit should default to 20, got $limit" );

[ $limit ] = plan_window( [ 'limit' => 'abc' ] );
expect( 20 === $limit, "a non-numeric limit should default to 20, got $limit" );

// A negative LIMIT is a syntax error on MySQL — the whole endpoint 500s.
[ $limit ] = plan_window( [ 'limit' => '-5' ] );
expect( 1 === $limit, "limit=-5 should clamp to 1, got $limit" );

[ $limit ] = plan_window( [ 'limit' => '0' ] );
expect( 1 === $limit, "limit=0 should clamp to 1, got $limit" );

// ── Offset is never negative ──────────────────────────────────────────────────
[ , $offset ] = plan_window( [ 'offset' => '-10' ] );
expect( 0 === $offset, "offset=-10 should clamp to 0, got $offset" );

[ , $offset ] = plan_window( [ 'offset' => '80' ] );
expect( 80 === $offset, "offset=80 should pass through, got $offset" );

// ── Only recognised filter keys are honoured ──────────────────────────────────
$filters = wine_agent_collect_filters(
	[
		'type'        => 'Red',
		'brandName'   => 'ecole',
		'utm_source'  => 'newsletter',
		'reviewer'    => 'RE',
		'rest_route'  => '/wine-agent/v1/search',
		'_locale'     => 'user',
	]
);
expect( [ 'type' => 'Red' ] === $filters, 'collect_filters kept: ' . wp_json( $filters ) );

// ── Every request is answerable in SQL ────────────────────────────────────────
// There is no in-memory fallback any more: no plan may ask the caller to
// materialise and filter the whole index.
foreach ( [ [ 'brandName' => 'e' ], [ 'sort_by' => 'brandName' ], [ 'q' => 'red', 'type' => 'Red' ] ] as $params ) {
	$plan = wine_agent_build_search_sql( $params );
	foreach ( [ 'needs_php', 'php_filters', 'rows_sql_all', 'all_bindings' ] as $gone ) {
		expect( ! isset( $plan[ $gone ] ), "query plan still carries the removed '$gone' fallback" );
	}
	expect(
		false !== strpos( $plan['rows_sql'], 'LIMIT' ),
		'a plan produced row SQL with no LIMIT: ' . $plan['rows_sql']
	);
}

// ── Only sorts the index can order by ─────────────────────────────────────────
foreach ( array_keys( wine_agent_sortable_columns() ) as $sortable ) {
	$plan = wine_agent_build_search_sql( [ 'sort_by' => $sortable ] );
	expect( $sortable === $plan['sort_by'], "sort_by=$sortable was not honoured" );
}
foreach ( [ 'brandName', 'tastingDate', 'reviewer', '', 'nonsense' ] as $unsortable ) {
	$plan = wine_agent_build_search_sql( [ 'sort_by' => $unsortable ] );
	expect(
		'publicationDate' === $plan['sort_by'],
		"sort_by=$unsortable should fall back to publicationDate, got {$plan['sort_by']}"
	);
}
$plan = wine_agent_build_search_sql( [ 'sort_by' => 'relevance' ] );
expect( 'rating' === $plan['sort_by'], 'the relevance alias no longer maps to rating' );

// ── The allowlist and the clause builder cannot drift apart ───────────────────
// An allowlisted key with no clause builder fails closed — it would match
// nothing and empty the page, which is the failure this whole allowlist exists
// to prevent. Every key must build a real clause.
$sample = [
	'mainVarietal'       => 'Merlot',
	'ava'                => 'Columbia Valley',
	'region'             => 'Yakima (WA)',
	'type'               => 'Red',
	'stateProvince'      => 'Washington',
	'specialDesignation' => 'Value Pick',
	'priceMin'           => '20',
	'priceMax'           => '60',
	'scoreMin'           => '88',
	'scoreMax'           => '95',
	'vintageMin'         => '2018',
	'vintageMax'         => '2022',
	'casesMin'           => '100',
	'casesMax'           => '5000',
	'publicationDate'    => '>=2024-01-01',
];
foreach ( wine_agent_filter_params() as $key ) {
	expect( isset( $sample[ $key ] ), "no sample value for allowlisted key '$key' — add one to this test" );
	if ( ! isset( $sample[ $key ] ) ) {
		continue;
	}
	$clause = wine_agent_build_filter_clause( $key, $sample[ $key ] );
	expect(
		is_array( $clause ) && '1 = 0' !== $clause['sql'],
		"filter key '$key' is allowlisted but builds no SQL clause — it would silently empty the results"
	);
}

function wp_json( $value ): string {
	return json_encode( $value );
}

// ── Report ───────────────────────────────────────────────────────────────────
if ( empty( $failures ) ) {
	echo "plugin query test: ok\n";
	exit( 0 );
}

echo 'plugin query test: ' . count( $failures ) . " failure(s)\n";
foreach ( $failures as $failure ) {
	echo "  - $failure\n";
}
exit( 1 );
