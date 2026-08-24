<?php
/**
 * PHP side of the parity harness: loads the combined fixture into an in-memory
 * SQLite database through the real index-row builder, then answers the battery
 * through the real handler core — the same wine_agent_run_search() and
 * wine_agent_run_meta() the plugin calls, with only the executor swapped.
 *
 * SQLite stands in for MySQL here. Every construct the builders emit is plain
 * SQL — LIKE over pre-folded columns, IS NULL ordering, GROUP BY — precisely so
 * this substitution is sound and the query layer is testable without a server.
 *
 * Usage: php scripts/parity/run-php.php <combined-fixture.json>
 */

require_once __DIR__ . '/../../wordpress-plugin/includes/wine-api-core.php';

$fixture_path = $argv[1] ?? '';
if ( '' === $fixture_path ) {
	fwrite( STDERR, "usage: run-php.php <combined-fixture.json>\n" );
	exit( 2 );
}

$parsed = json_decode( (string) file_get_contents( $fixture_path ), true );
// Accept either { wines: [...] } or a bare array, same as FixtureClient.
$wines = ( is_array( $parsed ) && isset( $parsed['wines'] ) ) ? $parsed['wines'] : $parsed;
if ( ! is_array( $wines ) || ! isset( $wines[0] ) ) {
	fwrite( STDERR, "could not read fixture\n" );
	exit( 2 );
}

// ── Build the index in SQLite ────────────────────────────────────────────────
$pdo = new PDO( 'sqlite::memory:' );
$pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

$columns     = wine_agent_index_columns();
$definitions = [];
foreach ( $columns as $name => $mysql_def ) {
	$definitions[] = $name . ' ' . parity_sqlite_type( $name, $mysql_def );
}
$pdo->exec( 'CREATE TABLE wine_index (' . implode( ', ', $definitions ) . ')' );

$names        = array_keys( $columns );
$placeholders = implode( ', ', array_fill( 0, count( $names ), '?' ) );
$insert       = $pdo->prepare(
	'INSERT INTO wine_index (' . implode( ', ', $names ) . ") VALUES ($placeholders)"
);

foreach ( $wines as $wine ) {
	$row    = wine_agent_build_index_row( $wine );
	$values = [];
	foreach ( $names as $name ) {
		$value = $row[ $name ] ?? null;
		// pub_day is stored as a DATE in MySQL; '' would sort ahead of real
		// dates instead of last, so an absent day is NULL in both engines.
		if ( 'pub_day' === $name && '' === $value ) {
			$value = null;
		}
		$values[] = $value;
	}
	$insert->execute( $values );
}

/**
 * Map a MySQL column definition onto its SQLite equivalent.
 *
 * @param string $name      Column name.
 * @param string $mysql_def MySQL definition.
 * @return string SQLite definition.
 */
function parity_sqlite_type( string $name, string $mysql_def ): string {
	if ( 'id' === $name ) {
		return 'INTEGER PRIMARY KEY';
	}
	if ( preg_match( '/FLOAT|DOUBLE/i', $mysql_def ) ) {
		return 'REAL';
	}
	if ( preg_match( '/INT/i', $mysql_def ) ) {
		return 'INTEGER';
	}
	return 'TEXT';
}

/**
 * The executor: swaps the %s/%d/%f placeholders the builders emit for the
 * positional ones PDO wants, then runs the statement.
 *
 * @param string $sql      SQL with WordPress placeholders.
 * @param array  $bindings Bound values.
 * @return array Rows.
 */
function parity_execute( string $sql, array $bindings ): array {
	global $pdo;
	$sql       = str_replace( '{TABLE}', 'wine_index', $sql );
	$converted = preg_replace( '/%[sdf]/', '?', $sql );
	$statement = $pdo->prepare( $converted );
	$statement->execute( array_values( $bindings ) );
	return $statement->fetchAll( PDO::FETCH_ASSOC );
}

// ── Run the battery ──────────────────────────────────────────────────────────
$battery = json_decode( (string) file_get_contents( __DIR__ . '/battery.json' ), true );
$results = [];

foreach ( $battery as $entry ) {
	$params = [];
	if ( '' !== $entry['query'] ) {
		parse_str( str_replace( '+', '%20', $entry['query'] ), $params );
	}
	// parse_str gives arrays for repeated keys; the REST layer hands strings.
	foreach ( $params as $key => $value ) {
		if ( is_array( $value ) ) {
			$params[ $key ] = (string) end( $value );
		}
	}

	$body = ( 'meta' === $entry['endpoint'] )
		? wine_agent_run_meta( 'parity_execute', $params )
		: wine_agent_run_search( 'parity_execute', $params );

	$results[ $entry['name'] ] = [
		'status' => 200,
		'body'   => $body,
	];
}

echo json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
