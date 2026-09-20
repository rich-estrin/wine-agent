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

// An unknown key must not drag the request onto the in-memory fallback path,
// which reads and decodes every row in the index.
$plan = wine_agent_build_search_sql( [ 'brandName' => 'e' ] );
expect( false === $plan['needs_php'], 'an unknown filter key still forces the PHP fallback path' );
expect( empty( $plan['php_filters'] ), 'an unknown filter key still reaches php_filters' );

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
