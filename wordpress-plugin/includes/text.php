<?php
/**
 * Case- and accent-insensitive folding — the PHP port of web/src/lib/text.ts.
 *
 * Every text comparison in the search goes through here, and the whole native
 * backend depends on this matching the TypeScript reference byte for byte:
 * folded values are what get written into the index table, and SQL then does
 * plain binary comparisons over them. A divergence here is a silently wrong
 * search result, which is why scripts/parity/ diffs this against the TS.
 *
 * No WordPress dependency — plain PHP so the parity harness can include it.
 *
 * @package WineAgent
 */

if ( ! defined( 'WINE_AGENT_DIACRITIC_CLASS' ) ) {
	// JS folds with \p{Diacritic}; PCRE2 has no such property, so we strip
	// nonspacing marks (which is what NFD decomposition actually produces for
	// Latin text) plus the handful of spacing diacritics \p{Diacritic} would
	// also catch. For the accents this dataset contains — é ä å ô ñ ü è —
	// the two are equivalent, and the parity battery holds that claim.
	define( 'WINE_AGENT_DIACRITIC_CLASS', '/[\p{Mn}\x{00A8}\x{00AF}\x{00B4}\x{00B8}\x{02B0}-\x{02FF}\x{FF3E}\x{FF40}\x{FF3F}]/u' );
}

/**
 * Transliteration fallback for hosts without ext/intl. Covers Latin-1
 * Supplement and Latin Extended-A, which is the full accent inventory of the
 * review export. Only consulted when Normalizer is unavailable.
 *
 * @return array<string,string>
 */
function wine_agent_translit_table(): array {
	static $table = null;
	if ( null !== $table ) {
		return $table;
	}
	$map = [
		'a' => [ 'à', 'á', 'â', 'ã', 'ä', 'å', 'ā', 'ă', 'ą' ],
		'c' => [ 'ç', 'ć', 'ĉ', 'ċ', 'č' ],
		'd' => [ 'ď', 'đ' ],
		'e' => [ 'è', 'é', 'ê', 'ë', 'ē', 'ĕ', 'ė', 'ę', 'ě' ],
		'g' => [ 'ĝ', 'ğ', 'ġ', 'ģ' ],
		'h' => [ 'ĥ', 'ħ' ],
		'i' => [ 'ì', 'í', 'î', 'ï', 'ĩ', 'ī', 'ĭ', 'į', 'ı' ],
		'j' => [ 'ĵ' ],
		'k' => [ 'ķ' ],
		'l' => [ 'ĺ', 'ļ', 'ľ', 'ł' ],
		'n' => [ 'ñ', 'ń', 'ņ', 'ň' ],
		'o' => [ 'ò', 'ó', 'ô', 'õ', 'ö', 'ø', 'ō', 'ŏ', 'ő' ],
		'r' => [ 'ŕ', 'ŗ', 'ř' ],
		's' => [ 'ś', 'ŝ', 'ş', 'š' ],
		't' => [ 'ţ', 'ť', 'ŧ' ],
		'u' => [ 'ù', 'ú', 'û', 'ü', 'ũ', 'ū', 'ŭ', 'ů', 'ű', 'ų' ],
		'w' => [ 'ŵ' ],
		'y' => [ 'ý', 'ÿ', 'ŷ' ],
		'z' => [ 'ź', 'ż', 'ž' ],
	];

	$table = [];
	foreach ( $map as $plain => $accented ) {
		foreach ( $accented as $char ) {
			$table[ $char ]                    = $plain;
			$table[ mb_strtoupper( $char ) ]   = $plain;
		}
	}
	return $table;
}

/**
 * Decompose to NFD, drop combining marks, lowercase — "Sémillon" and
 * "Semillon" both fold to "semillon".
 *
 * @param string|null $s Raw text.
 * @return string Folded text.
 */
function wine_agent_fold( ?string $s ): string {
	if ( null === $s || '' === $s ) {
		return '';
	}

	if ( class_exists( 'Normalizer' ) ) {
		$decomposed = Normalizer::normalize( $s, Normalizer::FORM_D );
		if ( false !== $decomposed && null !== $decomposed ) {
			$s = preg_replace( WINE_AGENT_DIACRITIC_CLASS, '', $decomposed );
		}
	} else {
		$s = strtr( $s, wine_agent_translit_table() );
	}

	return function_exists( 'mb_strtolower' ) ? mb_strtolower( $s, 'UTF-8' ) : strtolower( $s );
}

/**
 * Split a folded string into comparable words. Punctuation and hyphens are
 * separators, so "Rhône-Style" yields ["rhone", "style"].
 *
 * @param string|null $s Raw text.
 * @return string[] Folded words.
 */
function wine_agent_fold_words( ?string $s ): array {
	$folded = wine_agent_fold( $s );
	if ( '' === $folded ) {
		return [];
	}
	$parts = preg_split( '/[^\p{L}\p{N}]+/u', $folded, -1, PREG_SPLIT_NO_EMPTY );
	return false === $parts ? [] : $parts;
}

/**
 * `wine_agent_fold_words`, plus the elided form of any apostrophe compound:
 * "L'Ecole" yields "l", "ecole" *and* "lecole", so a reader who types the name
 * without the punctuation still finds it. Both the ASCII and the typographic
 * apostrophe occur in the export.
 *
 * For indexing the searchable side only — query terms stay on fold_words.
 *
 * @param string|null $s Raw text.
 * @return string[] Folded words plus elisions.
 */
function wine_agent_fold_search_words( ?string $s ): array {
	$words  = wine_agent_fold_words( $s );
	$folded = wine_agent_fold( $s );
	if ( '' === $folded ) {
		return $words;
	}

	$tokens = preg_split( '/[^\p{L}\p{N}\'\x{2019}]+/u', $folded, -1, PREG_SPLIT_NO_EMPTY );
	if ( false === $tokens ) {
		return $words;
	}

	$elided = [];
	foreach ( $tokens as $token ) {
		if ( preg_match( '/[\'\x{2019}]/u', $token ) ) {
			$stripped = preg_replace( '/[\'\x{2019}]/u', '', $token );
			if ( '' !== $stripped ) {
				$elided[] = $stripped;
			}
		}
	}

	return empty( $elided ) ? $words : array_merge( $words, $elided );
}

/**
 * Order two display strings the way the Node meta endpoint does — JS
 * `localeCompare(a, b, undefined, { sensitivity: 'base' })`, i.e. accents and
 * case ignored. Ties keep insertion order (usort is stable in PHP 8).
 *
 * @param string $a First value.
 * @param string $b Second value.
 * @return int Comparison result.
 */
function wine_agent_compare_display( string $a, string $b ): int {
	return strcmp( wine_agent_fold( $a ), wine_agent_fold( $b ) );
}
