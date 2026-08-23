<?php
/**
 * Value parsing, comparison and sorting — the PHP port of
 * web/server/wine-utils.ts.
 *
 * Every numeric and date concept in the data is stored as a display string
 * ("$45", "***1/2", "14.1%"), so these parsers are what turn them into
 * something comparable. The index table caches their output in typed columns;
 * these functions are the single definition of how that conversion happens.
 *
 * No WordPress dependency.
 *
 * @package WineAgent
 */

require_once __DIR__ . '/text.php';

/**
 * JavaScript `parseFloat` semantics: read a leading float, null when there
 * isn't one. PHP's own cast returns 0.0 for junk, which would sort unpriced
 * wines as free.
 *
 * @param string|null $s Raw value.
 * @return float|null Parsed number.
 */
function wine_agent_js_parse_float( ?string $s ): ?float {
	if ( null === $s ) {
		return null;
	}
	if ( ! preg_match( '/^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/', $s, $m ) ) {
		return null;
	}
	return (float) $m[1];
}

/**
 * JavaScript `parseInt(s, 10)` semantics: leading integer, null when absent.
 *
 * @param string|null $s Raw value.
 * @return int|null Parsed integer.
 */
function wine_agent_js_parse_int( ?string $s ): ?int {
	if ( null === $s ) {
		return null;
	}
	if ( ! preg_match( '/^\s*([+-]?\d+)/', $s, $m ) ) {
		return null;
	}
	return (int) $m[1];
}

/**
 * Numeric price, or null when the wine has no usable price. The importer
 * collapses empty, "NA" and "0" to "N/A", so all three land here as null
 * rather than as a sentinel number that would sort like a real price.
 *
 * @param string|null $price_str Raw price.
 * @return float|null Parsed price.
 */
function wine_agent_parse_price_or_null( ?string $price_str ): ?float {
	if ( null === $price_str || '' === $price_str ) {
		return null;
	}
	$trimmed = trim( $price_str );
	if ( 'N/A' === $trimmed || 'NA' === $trimmed || '0' === $trimmed ) {
		return null;
	}
	return wine_agent_js_parse_float( str_replace( [ '$', ',' ], '', $trimmed ) );
}

/**
 * Numeric rating, or null when unrated. Star ratings come back on a 0–5 scale
 * and point scores on their own — the two share this column in the export.
 *
 * @param string|null $rating_str Raw rating.
 * @return float|null Parsed rating.
 */
function wine_agent_parse_rating_or_null( ?string $rating_str ): ?float {
	if ( null === $rating_str || '' === $rating_str ) {
		return null;
	}
	$numeric = wine_agent_js_parse_float( $rating_str );
	$has_star = ( false !== strpos( $rating_str, '*' ) );
	if ( null !== $numeric && ! $has_star ) {
		return $numeric;
	}
	$stars = substr_count( $rating_str, '*' );
	if ( 0 === $stars ) {
		return null;
	}
	$half = ( false !== strpos( $rating_str, '1/2' ) || false !== strpos( $rating_str, '½' ) ) ? 0.5 : 0.0;
	return $stars + $half;
}

/**
 * Vintage year, or null when the row names none.
 *
 * @param string|null $vintage_str Raw vintage.
 * @return int|null Parsed year.
 */
function wine_agent_parse_vintage_or_null( ?string $vintage_str ): ?int {
	return wine_agent_js_parse_int( trim( (string) $vintage_str ) );
}

/**
 * Milliseconds since the epoch for a date string, or null. Dates in this data
 * are date-only, which JS `new Date()` reads as UTC midnight — parsed here the
 * same way so comparisons line up.
 *
 * @param string|null $date_str Raw date.
 * @return int|null Epoch milliseconds.
 */
function wine_agent_parse_date_or_null( ?string $date_str ): ?int {
	if ( null === $date_str || '' === trim( (string) $date_str ) ) {
		return null;
	}
	$trimmed = trim( $date_str );
	if ( preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $trimmed, $m ) ) {
		return wine_agent_utc_ms( (int) $m[1], (int) $m[2], (int) $m[3] );
	}
	$ts = strtotime( $trimmed . ' UTC' );
	if ( false === $ts ) {
		$ts = strtotime( $trimmed );
	}
	return false === $ts ? null : $ts * 1000;
}

/**
 * Midnight UTC of the calendar day a date string names, or null. Sorting by
 * review date compares the published *day*: two reviews that went out the same
 * morning are a tie to be broken by rating, however many minutes apart their
 * timestamps are.
 *
 * @param string|null $date_str Raw date.
 * @return int|null Epoch milliseconds at UTC midnight.
 */
function wine_agent_parse_day_or_null( ?string $date_str ): ?int {
	if ( null === $date_str || '' === trim( (string) $date_str ) ) {
		return null;
	}
	$trimmed = trim( $date_str );
	if ( preg_match( '/^(\d{4})-(\d{2})-(\d{2})/', $trimmed, $m ) ) {
		return wine_agent_utc_ms( (int) $m[1], (int) $m[2], (int) $m[3] );
	}
	$ts = strtotime( $trimmed . ' UTC' );
	if ( false === $ts ) {
		$ts = strtotime( $trimmed );
	}
	if ( false === $ts ) {
		return null;
	}
	return wine_agent_utc_ms(
		(int) gmdate( 'Y', $ts ),
		(int) gmdate( 'n', $ts ),
		(int) gmdate( 'j', $ts )
	);
}

/**
 * The ISO day a date string names ("2024-03-15"), or '' — the form stored in
 * the index table's pub_day column.
 *
 * @param string|null $date_str Raw date.
 * @return string ISO date or empty string.
 */
function wine_agent_parse_day_iso( ?string $date_str ): string {
	$ms = wine_agent_parse_day_or_null( $date_str );
	return null === $ms ? '' : gmdate( 'Y-m-d', intdiv( $ms, 1000 ) );
}

/**
 * Epoch milliseconds for a UTC calendar date, matching JS `Date.UTC`.
 *
 * @param int $year  Year.
 * @param int $month Month (1-12).
 * @param int $day   Day of month.
 * @return int Epoch milliseconds.
 */
function wine_agent_utc_ms( int $year, int $month, int $day ): int {
	return gmmktime( 0, 0, 0, $month, $day, $year ) * 1000;
}

/**
 * Case production as plain digits, or '' when the row reports none. A value
 * carrying anything else — a decimal point most of all — is read as no data
 * rather than salvaged: the export has rows whose Cases cell holds an alcohol
 * percentage ("14.8"), and dropping the point would report those wines as
 * producing 148 cases.
 *
 * @param string|null $raw Raw cases value.
 * @return string Digits or empty string.
 */
function wine_agent_normalize_cases( ?string $raw ): string {
	$trimmed = trim( (string) $raw );
	if ( ! preg_match( '/^[0-9][0-9,\s]*(cases?)?$/i', $trimmed ) ) {
		return '';
	}
	$digits = preg_replace( '/[^0-9]/', '', $trimmed );
	if ( '' === $digits || 0 === (int) $digits ) {
		return '';
	}
	return (string) (int) $digits;
}

/**
 * Numeric case production, or null when the wine reports none.
 *
 * @param string|null $cases_str Raw cases value.
 * @return int|null Parsed cases.
 */
function wine_agent_parse_cases_or_null( ?string $cases_str ): ?int {
	$digits = preg_replace( '/[^0-9]/', '', (string) $cases_str );
	if ( '' === $digits ) {
		return null;
	}
	$n = (int) $digits;
	return 0 === $n ? null : $n;
}

/**
 * Split an operator-prefixed filter value ("&gt;90") into its parts.
 *
 * @param string $filter_value Raw filter value.
 * @return array{operator:string,value:string} Operator and value.
 */
function wine_agent_parse_filter_value( string $filter_value ): array {
	if ( preg_match( '/^([><=]+)(.+)$/', $filter_value, $m ) ) {
		return [
			'operator' => $m[1],
			'value'    => trim( $m[2] ),
		];
	}
	return [
		'operator' => '=',
		'value'    => $filter_value,
	];
}

/**
 * Compare two values with a filter operator. Numbers are compared as floats
 * throughout, mirroring JS where every number is a double.
 *
 * @param mixed  $actual   Wine's value.
 * @param string $operator Comparison operator.
 * @param mixed  $expected Filter's value.
 * @return bool Whether the comparison holds.
 */
function wine_agent_compare_values( $actual, string $operator, $expected ): bool {
	switch ( $operator ) {
		case '>':
			return (float) $actual > (float) $expected;
		case '<':
			return (float) $actual < (float) $expected;
		case '>=':
			return (float) $actual >= (float) $expected;
		case '<=':
			return (float) $actual <= (float) $expected;
		case '=':
		case '==':
			return (float) $actual === (float) $expected;
		default:
			return false;
	}
}

/**
 * The sortable value for a wine, or null when it has none.
 *
 * @param array  $wine    Wine array.
 * @param string $sort_by Field to sort on.
 * @return float|int|string|null Sortable value.
 */
function wine_agent_sort_value( array $wine, string $sort_by ) {
	switch ( $sort_by ) {
		case 'price':
			return wine_agent_parse_price_or_null( $wine['price'] ?? '' );
		case 'rating':
			return wine_agent_parse_rating_or_null( $wine['rating'] ?? '' );
		case 'vintage':
			return wine_agent_parse_vintage_or_null( $wine['vintage'] ?? '' );
		case 'cases':
			return wine_agent_parse_cases_or_null( $wine['cases'] ?? '' );
		case 'publicationDate':
			// Day granularity, so same-day reviews tie and fall through to the
			// rating tiebreak rather than being ordered by their timestamps.
			return wine_agent_parse_day_or_null( $wine['publicationDate'] ?? '' );
		case 'tastingDate':
			return wine_agent_parse_date_or_null( $wine['tastingDate'] ?? '' );
		default:
			$v = (string) ( $wine[ $sort_by ] ?? '' );
			return '' === $v ? null : $v;
	}
}

/**
 * Order two wines the primary sort could not separate. Only review date has
 * one: a day's reviews are published as a batch, so leaving them in export
 * order buried the day's best wine in the middle of it. Highest score first in
 * both directions, unrated last.
 *
 * @param array  $a       First wine.
 * @param array  $b       Second wine.
 * @param string $sort_by Active sort field.
 * @return int Comparison result.
 */
function wine_agent_tie_break( array $a, array $b, string $sort_by ): int {
	if ( 'publicationDate' !== $sort_by ) {
		return 0;
	}
	$a_rating = wine_agent_parse_rating_or_null( $a['rating'] ?? '' );
	$b_rating = wine_agent_parse_rating_or_null( $b['rating'] ?? '' );
	if ( null === $a_rating || null === $b_rating ) {
		if ( $a_rating === $b_rating ) {
			return 0;
		}
		return null === $a_rating ? 1 : -1;
	}
	return $b_rating <=> $a_rating;
}

/**
 * Sort wines, with absent values last in BOTH directions — a wine with no
 * price is not the cheapest on "Lowest" nor the priciest on "Highest".
 *
 * @param array[] $wines      Wine arrays.
 * @param string  $sort_by    Field to sort on.
 * @param string  $sort_order 'asc' or 'desc'.
 * @return array[] Sorted wines.
 */
function wine_agent_sort_wines( array $wines, string $sort_by, string $sort_order = 'desc' ): array {
	$sorted = $wines;
	usort(
		$sorted,
		function ( $a, $b ) use ( $sort_by, $sort_order ) {
			$a_val = wine_agent_sort_value( $a, $sort_by );
			$b_val = wine_agent_sort_value( $b, $sort_by );

			if ( null === $a_val || null === $b_val ) {
				// Two wines that both lack the value are still a tie to be
				// broken — the undated tail of a review-date sort gets the same
				// best-first ordering as every dated day above it.
				if ( $a_val === $b_val ) {
					return wine_agent_tie_break( $a, $b, $sort_by );
				}
				return null === $a_val ? 1 : -1;
			}

			if ( is_string( $a_val ) || is_string( $b_val ) ) {
				$cmp = strcmp( (string) $a_val, (string) $b_val );
			} else {
				$cmp = (float) $a_val <=> (float) $b_val;
			}

			if ( 0 !== $cmp ) {
				return 'asc' === $sort_order ? $cmp : -$cmp;
			}
			return wine_agent_tie_break( $a, $b, $sort_by );
		}
	);
	return $sorted;
}
