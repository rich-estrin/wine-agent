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
 * Run a search and return the page of wines plus the total match count.
 *
 * @param callable $db     Executor: ( string $sql, array $bindings ) => rows.
 * @param array    $params Request query params.
 * @return array{wines:array,total:int}
 */
function wine_agent_run_search( callable $db, array $params ): array {
	$plan  = wine_agent_build_search_sql( $params );
	$rows  = $db( $plan['rows_sql'], $plan['rows_bindings'] );
	$count = $db( $plan['count_sql'], $plan['count_bindings'] );

	return [
		'wines' => wine_agent_decode_rows( $rows ),
		'total' => (int) wine_agent_first_scalar( $count ),
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
