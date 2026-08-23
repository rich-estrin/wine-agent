<?php
/**
 * Review row → Wine, and Wine → index row. The PHP port of `mapWPReview`
 * (web/server/wp-client.ts) plus the extra step the native backend needs:
 * turning a Wine into the flat, pre-folded, typed row the index table holds.
 *
 * Every normalization here is strictly per-row and stateless, which is what
 * makes a single-row index upsert on save equivalent to a full rebuild.
 *
 * No WordPress dependency.
 *
 * @package WineAgent
 */

require_once __DIR__ . '/text.php';
require_once __DIR__ . '/wine-utils.php';

/**
 * Appellation spellings the export gets wrong, mapped to the canonical name.
 *
 * @return array<string,string>
 */
function wine_agent_ava_corrections(): array {
	return [
		'columbia valley'                  => 'Columbia Valley',
		'horse heaven hills'               => 'Horse Heaven Hills',
		'walla walla valley'               => 'Walla Walla Valley',
		'ancient lakes'                    => 'Ancient Lakes of Columbia Valley',
		'ancient lakes of columbia valley' => 'Ancient Lakes of Columbia Valley',
	];
}

/**
 * State/province codes and compass abbreviations that stay uppercase inside
 * region names — "Seattle & NW (WA)", not "Seattle & Nw (wa)".
 *
 * @return string[]
 */
function wine_agent_geo_abbreviations(): array {
	return [ 'bc', 'wa', 'or', 'id', 'ca', 'ab', 'mt', 'nv', 'sw', 'nw', 'se', 'ne' ];
}

/**
 * Display-only grouping for Special Designation, shared with the frontend.
 *
 * @return array<int,array{label:string,members:string[]}>
 */
function wine_agent_designation_groups(): array {
	return [
		[
			'label'   => "Critic's Choice",
			'members' => [ "Critic's Choice", "Editor's Choice" ],
		],
		[
			'label'   => 'Cellar Stocker',
			'members' => [ 'Cellar Stocker', 'Cellar Selection' ],
		],
		[
			'label'   => 'Value Pick',
			'members' => [ 'Best Buy', 'Value Pick' ],
		],
	];
}

/**
 * Given the distinct designations present in the data, return the group labels
 * that actually have at least one member represented.
 *
 * @param string[] $available Designations present.
 * @return string[] Group labels.
 */
function wine_agent_designation_group_labels( array $available ): array {
	$present = [];
	foreach ( $available as $v ) {
		$t = trim( (string) $v );
		if ( '' !== $t ) {
			$present[ $t ] = true;
		}
	}
	$labels = [];
	foreach ( wine_agent_designation_groups() as $group ) {
		foreach ( $group['members'] as $member ) {
			if ( isset( $present[ $member ] ) ) {
				$labels[] = $group['label'];
				break;
			}
		}
	}
	return $labels;
}

/**
 * Canonical appellation name.
 *
 * @param string|null $raw Raw appellation.
 * @return string Corrected name.
 */
function wine_agent_normalize_ava( ?string $raw ): string {
	$trimmed     = trim( (string) $raw );
	$corrections = wine_agent_ava_corrections();
	$key         = strtolower( $trimmed );
	return $corrections[ $key ] ?? $trimmed;
}

/**
 * Capitalize the first letter of each word; unicode-safe, so "mourvèdre"
 * becomes "Mourvèdre" and not "MourvèDre".
 *
 * @param string|null $s Raw text.
 * @return string Title-cased text.
 */
function wine_agent_title_case( ?string $s ): string {
	$lower = mb_strtolower( trim( (string) $s ), 'UTF-8' );
	if ( '' === $lower ) {
		return '';
	}
	return preg_replace_callback(
		'/(^|[\s-])(\p{L})/u',
		function ( $m ) {
			return $m[1] . mb_strtoupper( $m[2], 'UTF-8' );
		},
		$lower
	);
}

/**
 * Title-case a region, then restore the geographic abbreviations.
 *
 * @param string|null $raw Raw region.
 * @return string Normalized region.
 */
function wine_agent_normalize_region( ?string $raw ): string {
	$titled = wine_agent_title_case( trim( (string) $raw ) );
	if ( '' === $titled ) {
		return '';
	}
	$abbrevs = array_flip( wine_agent_geo_abbreviations() );
	return preg_replace_callback(
		'/[A-Za-z]+/',
		function ( $m ) use ( $abbrevs ) {
			return isset( $abbrevs[ strtolower( $m[0] ) ] ) ? strtoupper( $m[0] ) : $m[0];
		},
		$titled
	);
}

/**
 * The plugin already returns ISO Y-m-d, but normalize defensively in case an
 * ACF date picker value arrives as raw Ymd ("20141230").
 *
 * @param string|null $raw Raw date.
 * @return string Normalized date.
 */
function wine_agent_normalize_pub_date( ?string $raw ): string {
	$v = trim( (string) $raw );
	if ( preg_match( '/^\d{8}$/', $v ) ) {
		return substr( $v, 0, 4 ) . '-' . substr( $v, 4, 2 ) . '-' . substr( $v, 6, 2 );
	}
	return $v;
}

/**
 * Map a raw review row (the shape the /reviews endpoint and the webhook both
 * produce) into a Wine. Mirrors `mapWPReview` field for field.
 *
 * @param array $row Raw review row.
 * @return array Wine array.
 */
function wine_agent_map_review_row( array $row ): array {
	$raw_price = trim( (string) ( $row['price'] ?? '' ) );
	if ( '' === $raw_price || 'NA' === $raw_price || '0' === $raw_price ) {
		$price = 'N/A';
	} elseif ( str_starts_with( $raw_price, '$' ) ) {
		$price = $raw_price;
	} else {
		$price = '$' . $raw_price;
	}

	$variety_style = trim( (string) ( $row['variety_style'] ?? '' ) );
	$variety       = trim( (string) ( $row['variety'] ?? '' ) );

	return [
		'id'                 => (string) ( $row['id'] ?? '' ),
		'brandName'          => trim( (string) ( $row['brand_name'] ?? '' ) ),
		'wineName'           => trim( (string) ( $row['wine_name'] ?? '' ) ),
		'ava'                => wine_agent_normalize_ava( $row['appellation'] ?? '' ),
		'vintage'            => trim( (string) ( $row['vintage'] ?? '' ) ),
		'price'              => $price,
		'rating'             => trim( (string) ( $row['rating'] ?? '' ) ),
		'review'             => trim( (string) ( $row['tasting_note'] ?? '' ) ),
		'region'             => wine_agent_normalize_region( $row['region'] ?? '' ),
		'type'               => wine_agent_title_case( $row['wine_type'] ?? '' ),
		// `variety` is the Varietal Label, blank for blends — the filter falls
		// back to the style so a blend stays selectable, while `varietalLabel`
		// keeps the label alone for display.
		'mainVarietal'       => wine_agent_title_case( '' !== $variety ? $variety : $variety_style ),
		'varietalLabel'      => wine_agent_title_case( $variety ),
		'varietyStyle'       => wine_agent_title_case( $variety_style ),
		'publicationDate'    => wine_agent_normalize_pub_date( $row['publication_date'] ?? '' ),
		'tastingDate'        => '',
		'setting'            => '',
		'purchasedProvided'  => '',
		'temp'               => '',
		'hyperlink'          => '',
		'specialDesignation' => trim( (string) ( $row['special_designation'] ?? '' ) ),
		'alcohol'            => trim( (string) ( $row['alcohol'] ?? '' ) ),
		'closure'            => trim( (string) ( $row['closure'] ?? '' ) ),
		'cases'              => wine_agent_normalize_cases( $row['cases'] ?? '' ),
		'stateProvince'      => wine_agent_title_case( $row['state_or_province'] ?? '' ),
		'source'             => trim( (string) ( $row['source'] ?? '' ) ),
		'reviewer'           => trim( (string) ( $row['reviewer'] ?? '' ) ),
	];
}

/**
 * What the search box looks at, and nothing else — the tasting note is
 * deliberately absent and joins only when `notes=1` is set.
 *
 * @return string[]
 */
function wine_agent_search_fields(): array {
	return [ 'brandName', 'vintage', 'wineName', 'mainVarietal', 'ava' ];
}

/**
 * Facet fields, each stored twice in the index: folded for matching, display
 * for the dropdown lists.
 *
 * @return string[]
 */
function wine_agent_facet_fields(): array {
	return [ 'mainVarietal', 'type', 'region', 'stateProvince', 'specialDesignation', 'ava' ];
}

/**
 * Collapse every run of non-alphanumeric characters to a single space, so a
 * `LIKE '% term%'` test is exactly the word-start match the Node regex does.
 *
 * @param string $folded Already-folded text.
 * @return string Tokenized text.
 */
function wine_agent_tokenize( string $folded ): string {
	$tokenized = preg_replace( '/[^\p{L}\p{N}]+/u', ' ', $folded );
	return trim( (string) $tokenized );
}

/**
 * Build the flat index row for a Wine: pre-folded match columns, typed sort
 * columns, and the display JSON the API hands back verbatim.
 *
 * Everything SQL needs to answer a query is computed here, once per save,
 * rather than per request.
 *
 * @param array $wine Wine array.
 * @return array Index row, keyed by column name.
 */
function wine_agent_build_index_row( array $wine ): array {
	$words = [];
	foreach ( wine_agent_search_fields() as $field ) {
		foreach ( wine_agent_fold_search_words( (string) ( $wine[ $field ] ?? '' ) ) as $word ) {
			$words[] = $word;
		}
	}

	$rating     = (string) ( $wine['rating'] ?? '' );
	$rating_num = wine_agent_js_parse_float( $rating );
	$is_star    = ( false !== strpos( $rating, '*' ) );

	$row = [
		'id'             => (int) ( $wine['id'] ?? 0 ),
		'words'          => implode( ' ', $words ),
		'folded_note'    => wine_agent_tokenize( wine_agent_fold( (string) ( $wine['review'] ?? '' ) ) ),
		// scoreMin/scoreMax read the raw number and reject star ratings, so the
		// two rating columns are not interchangeable: this one is the filter's,
		// rating_sort is the sort's and the operator filter's.
		'rating_num'     => $is_star ? null : $rating_num,
		'rating_is_star' => $is_star ? 1 : 0,
		'rating_sort'    => wine_agent_parse_rating_or_null( $rating ),
		'price_num'      => wine_agent_parse_price_or_null( (string) ( $wine['price'] ?? '' ) ),
		'vintage_num'    => wine_agent_parse_vintage_or_null( (string) ( $wine['vintage'] ?? '' ) ),
		'cases_num'      => wine_agent_parse_cases_or_null( (string) ( $wine['cases'] ?? '' ) ),
		'pub_day'        => wine_agent_parse_day_iso( (string) ( $wine['publicationDate'] ?? '' ) ),
		'pub_ms'         => wine_agent_parse_date_or_null( (string) ( $wine['publicationDate'] ?? '' ) ),
		'display_json'   => wp_json_encode_compat( $wine ),
	];

	foreach ( wine_agent_facet_fields() as $field ) {
		$value                                = trim( (string) ( $wine[ $field ] ?? '' ) );
		$row[ 'f_' . wine_agent_column( $field ) ] = wine_agent_fold( $value );
		$row[ 'd_' . wine_agent_column( $field ) ] = $value;
	}

	return $row;
}

/**
 * Column-name form of a camelCase field ("stateProvince" → "stateprovince").
 *
 * @param string $field Field name.
 * @return string Column suffix.
 */
function wine_agent_column( string $field ): string {
	return strtolower( $field );
}

/**
 * JSON encoding that matches what the Node API emits: unescaped slashes and
 * unicode, so the payload is byte-comparable in the parity harness.
 *
 * @param mixed $value Value to encode.
 * @return string JSON.
 */
function wp_json_encode_compat( $value ): string {
	return (string) json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
}
