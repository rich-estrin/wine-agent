<?php
/**
 * Plugin Name: Wine Agent API
 * Description: Serves the wine search directly from the WordPress database, and exposes a private REST endpoint for the wine agent to fetch all reviews.
 * Version: 2.45.4
 * Requires at least: 5.9
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once plugin_dir_path( __FILE__ ) . 'includes/wine-index.php';

// ─── REST endpoint ───────────────────────────────────────────────────────────

add_action( 'rest_api_init', function () {
    register_rest_route( 'wine-agent/v1', '/reviews', [
        'methods'             => 'GET',
        'callback'            => 'wine_agent_get_reviews',
        'permission_callback' => 'wine_agent_check_auth',
    ] );
} );

function wine_agent_check_auth( WP_REST_Request $request ): bool {
    $stored_key = get_option( 'wine_agent_search_key', '' );
    if ( empty( $stored_key ) ) {
        return false;
    }
    $provided_key = $request->get_header( 'X-Wine-Agent-Key' );
    return hash_equals( $stored_key, (string) $provided_key );
}

/**
 * Normalize the "Published Date" ACF Date Picker value to ISO Y-m-d.
 * ACF stores date pickers as Ymd (e.g. 20141230); other formats are parsed
 * best-effort. Returns '' when empty/unparseable so callers can fall back.
 */
function wine_agent_format_acf_date( $raw ): string {
    $raw = trim( (string) $raw );
    if ( $raw === '' ) {
        return '';
    }
    if ( preg_match( '/^\d{8}$/', $raw ) ) {
        return substr( $raw, 0, 4 ) . '-' . substr( $raw, 4, 2 ) . '-' . substr( $raw, 6, 2 );
    }
    $ts = strtotime( $raw );
    return $ts ? gmdate( 'Y-m-d', $ts ) : $raw;
}

function wine_agent_get_reviews( WP_REST_Request $request ): WP_REST_Response {
    $page           = max( 1, (int) $request->get_param( 'page' ) ?: 1 );
    $per_page       = min( 1000, max( 1, (int) $request->get_param( 'per_page' ) ?: 500 ) );
    $modified_after = $request->get_param( 'modified_after' );
    $offset         = ( $page - 1 ) * $per_page;

    // The pivot lives in includes/wine-index.php, shared with the indexer so
    // the two can never disagree about which meta keys make up a review.
    $reviews = wine_agent_fetch_review_rows( [
        'limit'          => $per_page,
        'offset'         => $offset,
        'modified_after' => $modified_after,
    ] );

    $response = new WP_REST_Response( $reviews, 200 );
    $response->header( 'X-WP-Total-Page', $page );
    $response->header( 'X-WP-Per-Page', $per_page );
    $response->header( 'X-WP-Count', count( $reviews ) );
    return $response;
}

// ─── API key ─────────────────────────────────────────────────────────────────

add_action( 'admin_init', function () {
    register_setting( 'wine_agent_settings', 'wine_agent_search_key', [
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ] );
} );

// Keep the local index current. Priority 20 so ACF has written its fields
// to postmeta before the pivot reads them back.
add_action( 'save_post_reviews', function ( int $post_id, WP_Post $post ) {
    if ( wp_is_post_revision( $post_id ) ) {
        return;
    }

    if ( $post->post_status === 'publish' ) {
        wine_agent_index_upsert_post( $post_id );
        return;
    }

    // Unpublished: the pivot only ever returns published reviews, so a review
    // that leaves 'publish' has to be dropped from the index explicitly.
    wine_agent_index_delete_post( $post_id );
}, 20, 2 );

// Meta-only edits — update_field(), an importer, a front-end form — write
// postmeta without firing save_post, so watch the meta itself. Ids are queued
// and re-indexed once at shutdown, however many fields one request touches.
function wine_agent_queue_meta_reindex( $meta_id, $post_id, $meta_key = '' ) {
    static $queued = [];
    $post_id = (int) $post_id;
    // The edit lock is rewritten every time someone opens the edit screen.
    if ( 0 === strpos( (string) $meta_key, '_edit_' ) || isset( $queued[ $post_id ] ) ) {
        return;
    }
    if ( get_post_type( $post_id ) !== 'reviews' || wp_is_post_revision( $post_id ) ) {
        return;
    }
    $queued[ $post_id ] = true;
    add_action( 'shutdown', function () use ( $post_id ) {
        if ( get_post_status( $post_id ) === 'publish' ) {
            wine_agent_index_upsert_post( $post_id );
        } else {
            wine_agent_index_delete_post( $post_id );
        }
    } );
}
add_action( 'added_post_meta', 'wine_agent_queue_meta_reindex', 10, 3 );
add_action( 'updated_post_meta', 'wine_agent_queue_meta_reindex', 10, 3 );
add_action( 'deleted_post_meta', function ( $meta_ids, $post_id, $meta_key ) {
    wine_agent_queue_meta_reindex( 0, $post_id, $meta_key );
}, 10, 3 );

// Fire on trash
add_action( 'trashed_post', function ( int $post_id ) {
    if ( get_post_type( $post_id ) !== 'reviews' ) {
        return;
    }
    wine_agent_index_delete_post( $post_id );
} );

// Restoring from trash puts the review back, if it lands published.
add_action( 'untrashed_post', function ( int $post_id ) {
    if ( get_post_type( $post_id ) !== 'reviews' ) {
        return;
    }
    wine_agent_index_upsert_post( $post_id );
} );

// Hard delete: the row has to go even though trashed_post already ran, since a
// review can be deleted permanently without passing through the trash.
add_action( 'before_delete_post', function ( int $post_id ) {
    if ( get_post_type( $post_id ) !== 'reviews' ) {
        return;
    }
    wine_agent_index_delete_post( $post_id );
} );

// ─── Index lifecycle ─────────────────────────────────────────────────────────

/**
 * Timestamp of the next 03:00 America/Los_Angeles. Computed in that zone so it
 * stays at 3am PT across daylight-saving changes, whatever the site timezone.
 */
function wine_agent_next_nightly_time(): int {
    $tz   = new DateTimeZone( 'America/Los_Angeles' );
    $next = new DateTimeImmutable( 'today 03:00', $tz );
    if ( $next->getTimestamp() <= time() ) {
        $next = new DateTimeImmutable( 'tomorrow 03:00', $tz );
    }
    return $next->getTimestamp();
}

/**
 * Keep exactly one nightly event pending, at 03:00 PT. It is a single event
 * that re-arms itself each run (a fixed 24h interval would drift an hour at
 * every DST change). A recurring event left by an older version is replaced.
 */
function wine_agent_schedule_nightly(): void {
    $event = wp_get_scheduled_event( 'wine_agent_index_nightly' );
    if ( $event && $event->schedule === false ) {
        return;
    }
    wp_clear_scheduled_hook( 'wine_agent_index_nightly' );
    wp_schedule_single_event( wine_agent_next_nightly_time(), 'wine_agent_index_nightly' );
}

register_activation_hook( __FILE__, function () {
    wine_agent_index_install();
    wine_agent_schedule_nightly();
} );

register_deactivation_hook( __FILE__, function () {
    wp_clear_scheduled_hook( 'wine_agent_index_nightly' );
    wp_clear_scheduled_hook( 'wine_agent_index_continue' );
} );

// A nightly rebuild from scratch: incremental upserts are equivalent to a
// rebuild by construction, but this catches anything that changed the data
// without firing a post hook (a direct SQL edit, an importer, a restored
// backup).
add_action( 'wine_agent_index_nightly', function () {
    wine_agent_schedule_nightly();
    // Take the lock before resetting progress: a rebuild already in flight has
    // read the offset, and clearing it underneath that pass makes it rewrite
    // rows it has already written. If one is running, it produces an equivalent
    // index anyway, so there is nothing for the nightly pass to add.
    if ( ! wine_agent_index_lock() ) {
        return;
    }
    delete_option( 'wine_agent_index_rebuild_offset' );
    wine_agent_index_unlock();
    wine_agent_index_run_rebuild_pass();
} );

// Continuation for a rebuild that ran out of time budget.
add_action( 'wine_agent_index_continue', 'wine_agent_index_continue_rebuild' );

/**
 * Resume a rebuild, unless there is nothing left to resume.
 *
 * A queued continuation can outlive the rebuild it belonged to — the admin
 * Rebuild button may have finished the job first. Without this guard that stale
 * event would find no stored offset, read it as 0 and rebuild the whole index
 * from scratch for nothing.
 */
function wine_agent_index_continue_rebuild(): void {
    $in_progress = (int) get_option( 'wine_agent_index_rebuild_offset', 0 );
    if ( 0 === $in_progress && ! wine_agent_index_needs_rebuild() ) {
        return;
    }
    wine_agent_index_run_rebuild_pass();
}

/**
 * Run one rebuild pass and schedule the next if there is more to do.
 */
function wine_agent_index_run_rebuild_pass(): void {
    // Cron unschedules the event before running it, so while a pass is running
    // only this transient tells wine_agent_index_maybe_start_rebuild() a chain
    // is live.
    set_transient( 'wine_agent_index_auto_rebuild', 1, 5 * MINUTE_IN_SECONDS );
    if ( ! wine_agent_index_table_exists() ) {
        wine_agent_index_install();
    }
    $state = wine_agent_index_rebuild_step( 20 );
    if ( ! empty( $state['busy'] ) ) {
        // Another pass holds the lock — most likely someone pressing Rebuild in
        // the admin. Come back later rather than hot-looping on the lock, and
        // keep the chain alive so the rebuild still completes if they stop
        // pressing Continue.
        wp_schedule_single_event( time() + 30, 'wine_agent_index_continue' );
        return;
    }
    if ( ! $state['done'] ) {
        wp_schedule_single_event( time() + 5, 'wine_agent_index_continue' );
    }
}

// Upgrades don't run the activation hook, so pick up a schema change on the
// first admin page load after the plugin files are replaced.
add_action( 'admin_init', function () {
    if ( (int) get_option( 'wine_agent_index_version', 0 ) !== WINE_AGENT_INDEX_VERSION ) {
        wine_agent_index_install();
    }
    wine_agent_schedule_nightly();
    wine_agent_index_maybe_start_rebuild();
} );

/**
 * Start a background rebuild when the index can't serve search — a first
 * install, or a schema bump that invalidated the existing index.
 * Search answers 503 until the index exists, so waiting for someone to press
 * Rebuild or for the nightly cron would leave the site without search.
 *
 * Scheduled rather than run inline so the admin page load isn't held for a
 * full pass. The transient keeps two admin requests from starting two chains;
 * it outlives the gap between passes, and if a chain dies it expires and the
 * next admin load resumes from the stored offset.
 */
function wine_agent_index_maybe_start_rebuild(): void {
    if ( ! wine_agent_index_needs_rebuild() ) {
        return;
    }
    if ( wp_next_scheduled( 'wine_agent_index_continue' ) || get_transient( 'wine_agent_index_auto_rebuild' ) ) {
        return;
    }
    set_transient( 'wine_agent_index_auto_rebuild', 1, 5 * MINUTE_IN_SECONDS );
    wp_schedule_single_event( time(), 'wine_agent_index_continue' );
}

// ─── [wine-search] shortcode ─────────────────────────────────────────────────
//
// Usage: add [wine-search] to any page or post.
// The app JS/CSS are bundled with the plugin under assets/.

/**
 * This file's declared version, read from the plugin header.
 *
 * The header is the single place the version is written, so reading it back
 * rather than restating it in a constant keeps the two from drifting. Read
 * once per request.
 *
 * @return string Version string, e.g. '2.41.0'.
 */
function wine_agent_plugin_version(): string {
    static $version = null;
    if ( null === $version ) {
        $data    = get_file_data( __FILE__, [ 'Version' => 'Version' ] );
        $version = isset( $data['Version'] ) ? trim( $data['Version'] ) : '';
    }
    return $version;
}

add_shortcode( 'wine-search', function () {
    // Read the Vite manifest bundled with the plugin (no HTTP calls needed).
    $manifest_path = plugin_dir_path( __FILE__ ) . 'assets/manifest.json';
    if ( ! file_exists( $manifest_path ) ) {
        return '<p><em>Wine search: assets not found. Re-upload the plugin zip.</em></p>';
    }
    $assets   = json_decode( file_get_contents( $manifest_path ), true );
    $js_file  = $assets['index.html']['file'] ?? null;
    $css_file = $assets['index.html']['css'][0] ?? null;

    // Dequeue WordPress's bundled React/ReactDOM (wp-element) so they don't
    // conflict with the React 19 copy bundled inside our app JS.
    wp_dequeue_script( 'react' );
    wp_dequeue_script( 'react-dom' );
    wp_dequeue_script( 'wp-element' );

    if ( $js_file ) {
        wp_enqueue_script( 'wine-agent-app', plugins_url( $js_file, __FILE__ ), [], null, true );
    }
    if ( $css_file ) {
        wp_enqueue_style( 'wine-agent-app', plugins_url( $css_file, __FILE__ ) );
    }

    // Point the app at this site's own REST endpoints, and tell it which
    // plugin build it came from — the app logs that on startup, so which
    // version a page is serving is answerable from the browser console.
    //
    // The nonce is what lets WordPress see the reader's login on the app's
    // REST calls — without it every call runs logged out. The page token
    // names the page hosting the search, which is what search access is
    // checked against (see wine_agent_can_search()).
    $page_id = (int) get_the_ID();

    // A `?wine=` link opens straight onto that review. It is inlined rather
    // than fetched, and only for a reader who could search from this page.
    $review = wine_agent_requested_review();
    $page   = $page_id > 0 ? get_post( $page_id ) : null;
    $wine   = ( $review && $page && wine_agent_can_read_page( $page ) ) ? wine_agent_review_wine( $review ) : null;

    return '<div id="wine-agent-root"></div>' . "\n"
         . '<script>'
         . 'window.__WINE_AGENT_WINE__ = ' . wp_json_encode( $wine, JSON_HEX_TAG | JSON_HEX_AMP ) . ';'
         . 'window.__WINE_AGENT_EDIT__ = ' . wp_json_encode( wine_agent_review_edit_link() ) . ';'
         . 'window.__WINE_AGENT_API_BASE__ = ' . wp_json_encode( rest_url( 'wine-agent/v1' ) ) . ';'
         . 'window.__WINE_AGENT_VERSION__ = ' . wp_json_encode( wine_agent_plugin_version() ) . ';'
         . 'window.__WINE_AGENT_NONCE__ = ' . wp_json_encode( wp_create_nonce( 'wp_rest' ) ) . ';'
         . 'window.__WINE_AGENT_PAGE__ = ' . wp_json_encode( $page_id > 0 ? wine_agent_page_token( $page_id ) : '' ) . ';'
         . '</script>';
} );

// ─── Review links ────────────────────────────────────────────────────────────
//
// An open review is named on the host page's URL as `?wine=<post slug>`, so a
// link to it can be shared, and the admin bar offers "Edit Brand Review" for it
// the way the review's own page does. The slug is read from the posts table at
// response time rather than stored in the index, so it is never stale and adding
// it cost no rebuild.

/**
 * Add each review's post slug to a page of search results.
 *
 * @param array[] $wines Wines from wine_agent_run_search().
 * @return array[]
 */
function wine_agent_add_slugs( array $wines ): array {
    global $wpdb;
    $ids = array_values( array_filter( array_map( 'intval', array_column( $wines, 'id' ) ) ) );
    if ( empty( $ids ) ) {
        return $wines;
    }
    $rows = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT ID, post_name FROM {$wpdb->posts} WHERE ID IN (" . implode( ', ', array_fill( 0, count( $ids ), '%d' ) ) . ')',
            $ids
        ),
        ARRAY_A
    );
    $slugs = array_column( (array) $rows, 'post_name', 'ID' );
    foreach ( $wines as &$wine ) {
        $wine['slug'] = (string) ( $slugs[ (int) $wine['id'] ] ?? '' );
    }
    unset( $wine );
    return $wines;
}

/**
 * The published review a `?wine=` link names, or null. Takes the slug, or a
 * bare post id (what standalone links use when a wine has no slug).
 *
 * @return WP_Post|null
 */
function wine_agent_requested_review() {
    $raw = isset( $_GET['wine'] ) ? sanitize_title( wp_unslash( (string) $_GET['wine'] ) ) : '';
    if ( '' === $raw ) {
        return null;
    }
    $post = ctype_digit( $raw ) ? get_post( (int) $raw ) : get_page_by_path( $raw, OBJECT, 'reviews' );
    if ( ! $post instanceof WP_Post || 'reviews' !== $post->post_type || 'publish' !== $post->post_status ) {
        return null;
    }
    return $post;
}

/**
 * The review as the search API returns it — the index row's display JSON plus
 * its slug — or null when it isn't indexed.
 *
 * @param WP_Post $review Review post.
 * @return array|null
 */
function wine_agent_review_wine( $review ): ?array {
    global $wpdb;
    if ( wine_agent_index_needs_rebuild() ) {
        return null;
    }
    $json = $wpdb->get_var(
        $wpdb->prepare( 'SELECT display_json FROM ' . wine_agent_index_table() . ' WHERE id = %d', $review->ID )
    );
    $wine = is_string( $json ) ? json_decode( $json, true ) : null;
    if ( ! is_array( $wine ) ) {
        return null;
    }
    $wine['slug'] = $review->post_name;
    return $wine;
}

/**
 * The "Edit Brand Review" label and link template, for a reader who can edit
 * any published review — null for everyone else. The app fills in the id as
 * reviews are opened and closed.
 *
 * @return array{label:string,url:string}|null
 */
function wine_agent_review_edit_link(): ?array {
    $type = get_post_type_object( 'reviews' );
    if ( ! $type
        || ! current_user_can( $type->cap->edit_others_posts )
        || ! current_user_can( $type->cap->edit_published_posts ) ) {
        return null;
    }
    return [
        'label' => (string) ( $type->labels->edit_item ?? 'Edit Review' ),
        'url'   => admin_url( 'post.php?post=__ID__&action=edit' ),
    ];
}

// On a page hosting the search with `?wine=` set, put the review's edit link in
// the admin bar, beside core's "Edit Page". The app swaps it as wines are opened
// and closed (same node id); this is what the page loads with. Priority 81 sits
// just after core's edit node.
add_action( 'admin_bar_menu', function ( $wp_admin_bar ) {
    if ( is_admin() || ! is_singular() ) {
        return;
    }
    $page = get_queried_object();
    if ( ! $page instanceof WP_Post || ! has_shortcode( $page->post_content, 'wine-search' ) ) {
        return;
    }
    $review = wine_agent_requested_review();
    if ( ! $review || ! current_user_can( 'edit_post', $review->ID ) ) {
        return;
    }
    $type = get_post_type_object( 'reviews' );
    $wp_admin_bar->add_node( [
        'id'    => 'wine-agent-edit-review',
        'title' => esc_html( (string) ( $type->labels->edit_item ?? 'Edit Review' ) ),
        'href'  => get_edit_post_link( $review->ID ),
    ] );
}, 81 );

// Core's pencil icon is keyed to its own `edit` node; give ours the same one.
add_action( 'wp_head', function () {
    if ( is_admin_bar_showing() ) {
        echo '<style>#wpadminbar #wp-admin-bar-wine-agent-edit-review>.ab-item:before{content:"\f464";top:2px}</style>' . "\n";
    }
} );

// ─── Search access ───────────────────────────────────────────────────────────
//
// Search returns the full review — tasting note, score, price — so it must be
// exactly as protected as the page it is embedded on. A MemberPress rule on
// that page protects the page's HTML, but not a REST route, which reads the
// index table directly. So every search and meta call names its host page, and
// is answered only for a reader MemberPress would let see that page.
//
// The page is named by a signed token rather than a bare id: the shortcode
// only issues one for a page it actually renders on, so a caller cannot point
// the check at some unprotected page and read through it.

/**
 * The token the shortcode hands the app for its host page: "<id>.<hmac>".
 *
 * @param int $page_id Host page id.
 * @return string
 */
function wine_agent_page_token( int $page_id ): string {
    return $page_id . '.' . wine_agent_page_signature( $page_id );
}

function wine_agent_page_signature( int $page_id ): string {
    return substr( hash_hmac( 'sha256', 'wine-agent-page|' . $page_id, wp_salt( 'auth' ) ), 0, 32 );
}

/**
 * The host page a token names, or null when the token is missing or forged.
 *
 * @param string $token Value of the X-Wine-Agent-Page header.
 * @return WP_Post|null
 */
function wine_agent_token_page( string $token ) {
    if ( ! preg_match( '/^([1-9][0-9]*)\.([0-9a-f]{32})$/', $token, $m ) ) {
        return null;
    }
    if ( ! hash_equals( wine_agent_page_signature( (int) $m[1] ), $m[2] ) ) {
        return null;
    }
    $post = get_post( (int) $m[1] );
    return $post instanceof WP_Post ? $post : null;
}

/**
 * Permission callback for /search and /meta: may this reader see the page
 * hosting the search?
 *
 * Fails closed. Without MemberPress the page's own visibility decides, so a
 * site with no membership plugin keeps search as public as the page.
 *
 * @param WP_REST_Request $request Incoming request.
 * @return bool
 */
function wine_agent_can_search( WP_REST_Request $request ): bool {
    $post = wine_agent_token_page( (string) $request->get_header( 'X-Wine-Agent-Page' ) );
    return $post ? wine_agent_can_read_page( $post ) : false;
}

/**
 * May this reader see the page? The check behind both the REST routes and the
 * review the shortcode inlines for a `?wine=` link.
 *
 * @param WP_Post $post Page hosting the search.
 * @return bool
 */
function wine_agent_can_read_page( $post ): bool {
    // A draft or private page (the pre-launch test page) is readable only by
    // those who can read it in WordPress.
    if ( 'publish' !== $post->post_status && ! current_user_can( 'read_post', $post->ID ) ) {
        return false;
    }
    if ( post_password_required( $post ) ) {
        return false;
    }
    if ( class_exists( 'MeprRule' ) ) {
        // MemberPress is active but its API has moved: refuse rather than
        // guess, since guessing wrong serves the paid archive to everyone.
        if ( ! is_callable( [ 'MeprRule', 'is_locked' ] ) ) {
            return false;
        }
        return ! MeprRule::is_locked( $post );
    }
    return true;
}

// ─── Search endpoints ────────────────────────────────────────────────────────
//
// Answered from the index table in this site's own database: no network hop,
// no second server, and the data is whatever WordPress last saved. The embedded
// app calls same-origin HTTPS WP REST endpoints, which keeps browsers from
// blocking the request as mixed content.

add_action( 'rest_api_init', function () {
    $search_args = [
        'permission_callback' => 'wine_agent_can_search',
    ];

    register_rest_route( 'wine-agent/v1', '/search', array_merge( $search_args, [
        'methods'  => 'GET',
        'callback' => 'wine_agent_handle_search',
    ] ) );

    register_rest_route( 'wine-agent/v1', '/meta', array_merge( $search_args, [
        'methods'  => 'GET',
        'callback' => 'wine_agent_handle_meta',
    ] ) );
} );

function wine_agent_handle_search( WP_REST_Request $request ): WP_REST_Response {
    nocache_headers();

    if ( wine_agent_index_needs_rebuild() ) {
        return new WP_REST_Response(
            [ 'error' => 'Search index is being built. Try again in a few minutes.' ],
            503
        );
    }

    $result          = wine_agent_run_search( wine_agent_index_executor(), $request->get_query_params() );
    $result['wines'] = wine_agent_add_slugs( $result['wines'] );
    return new WP_REST_Response( $result, 200 );
}

function wine_agent_handle_meta( WP_REST_Request $request ): WP_REST_Response {
    nocache_headers();

    if ( wine_agent_index_needs_rebuild() ) {
        return new WP_REST_Response(
            [ 'error' => 'Search index is being built. Try again in a few minutes.' ],
            503
        );
    }

    $result = wine_agent_run_meta( wine_agent_index_executor(), $request->get_query_params() );
    return new WP_REST_Response( $result, 200 );
}

// ─── Admin settings page ──────────────────────────────────────────────────────

add_action( 'admin_menu', function () {
    add_options_page(
        'Wine Agent API',
        'Wine Agent API',
        'manage_options',
        'wine-agent-api',
        'wine_agent_settings_page'
    );
} );

/**
 * A stored UTC timestamp (ISO 8601) as Pacific time, e.g. "Sep 30, 2026 3:02 am PDT".
 * Pacific whatever the site timezone, to match the 03:00 PT nightly rebuild.
 */
function wine_agent_format_pacific( string $iso ): string {
    try {
        $time = new DateTimeImmutable( $iso );
    } catch ( Exception $e ) {
        return $iso;
    }
    return $time->setTimezone( new DateTimeZone( 'America/Los_Angeles' ) )->format( 'M j, Y g:i a T' );
}

/**
 * One rebuild pass for the settings page's live progress. The page calls this
 * in a loop until it reports done, so a short budget keeps each request well
 * inside any proxy timeout while the reader watches the count climb.
 */
add_action( 'wp_ajax_wine_agent_rebuild_step', 'wine_agent_ajax_rebuild_step' );
function wine_agent_ajax_rebuild_step(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_send_json_error( 'forbidden', 403 );
    }
    check_ajax_referer( 'wine_agent_rebuild_index' );

    if ( ! wine_agent_index_table_exists() ) {
        wine_agent_index_install();
    }
    if ( ! empty( $_POST['restart'] ) && wine_agent_index_lock() ) {
        // Same reasoning as the nightly rebuild: only reset progress when no
        // pass is mid-flight. If one is, this call reports busy and the page
        // follows it instead.
        delete_option( 'wine_agent_index_rebuild_offset' );
        wine_agent_index_unlock();
    }
    $built_at = get_option( 'wine_agent_index_built_at', '' );
    if (
        ! empty( $_POST['follow'] )
        && false === get_option( 'wine_agent_index_rebuild_offset', false )
        && ! wine_agent_index_needs_rebuild()
    ) {
        // The page is mid-loop, but the rebuild it was following has finished
        // (a background pass swapped it in). A step now would read the missing
        // offset as 0 and start the whole rebuild again.
        $count = wine_agent_index_count();
        wp_send_json_success( [
            'done'      => true,
            'busy'      => false,
            'processed' => $count,
            'total'     => $count,
            'indexed'   => $count,
            'built_at'  => $built_at ? wine_agent_format_pacific( $built_at ) : '',
        ] );
    }
    $state    = wine_agent_index_rebuild_step( 8 );
    $built_at = get_option( 'wine_agent_index_built_at', '' );
    wp_send_json_success(
        $state + [
            'indexed'  => wine_agent_index_count(),
            'built_at' => $built_at ? wine_agent_format_pacific( $built_at ) : '',
        ]
    );
}


function wine_agent_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    // Handle regenerate action
    if (
        isset( $_POST['wine_agent_regenerate'] )
        && check_admin_referer( 'wine_agent_regenerate_key' )
    ) {
        $new_key = wp_generate_password( 40, false );
        update_option( 'wine_agent_search_key', $new_key );
        echo '<div class="notice notice-success"><p>Review export key regenerated.</p></div>';
    }

    // Handle rebuild action. Runs in slices so a large site doesn't hit
    // max_execution_time; the button reports progress and is pressed again
    // until it reports done.
    if (
        isset( $_POST['wine_agent_rebuild'] )
        && check_admin_referer( 'wine_agent_rebuild_index' )
    ) {
        if ( ! wine_agent_index_table_exists() ) {
            wine_agent_index_install();
        }
        if ( isset( $_POST['wine_agent_rebuild_restart'] ) && wine_agent_index_lock() ) {
            // Same reasoning as the nightly rebuild: only reset progress when no
            // pass is mid-flight. If one is, the notice below says so.
            delete_option( 'wine_agent_index_rebuild_offset' );
            wine_agent_index_unlock();
        }
        $state = wine_agent_index_rebuild_step( 20 );
        if ( ! empty( $state['busy'] ) ) {
            printf(
                '<div class="notice notice-info"><p>A rebuild is already running in the background (%s of %s reviews so far). Reload this page to follow it — there is no need to press anything.</p></div>',
                esc_html( number_format_i18n( $state['processed'] ) ),
                esc_html( number_format_i18n( $state['total'] ) )
            );
        } elseif ( $state['done'] ) {
            printf(
                '<div class="notice notice-success"><p>Index rebuilt: %s reviews.</p></div>',
                esc_html( number_format_i18n( $state['processed'] ) )
            );
        } else {
            printf(
                '<div class="notice notice-warning"><p>Indexed %s of %s reviews. Press Continue to carry on.</p></div>',
                esc_html( number_format_i18n( $state['processed'] ) ),
                esc_html( number_format_i18n( $state['total'] ) )
            );
        }
    }

    $search_key  = get_option( 'wine_agent_search_key', '' );
    $endpoint    = rest_url( 'wine-agent/v1/reviews' );
    $index_count = wine_agent_index_count();
    $built_at    = get_option( 'wine_agent_index_built_at', '' );
    $in_progress = (int) get_option( 'wine_agent_index_rebuild_offset', 0 );
    $needs_build = wine_agent_index_needs_rebuild();
    ?>
    <div class="wrap">
        <h1>Wine Agent API</h1>

        <?php if ( $needs_build ) : ?>
            <div class="notice notice-error">
                <p><strong>The search index is not ready.</strong>
                Rebuild it below — searches return 503 until it is built.</p>
            </div>
        <?php endif; ?>

        <h2>Search index</h2>
        <table class="form-table">
            <tr>
                <th scope="row">Indexed reviews</th>
                <td>
                    <span id="wine-agent-indexed"><?php echo esc_html( number_format_i18n( $index_count ) ); ?></span>
                    <?php if ( ! wine_agent_index_table_exists() ) : ?>
                        <span style="color:#b32d2e">— table not created yet</span>
                    <?php endif; ?>
                </td>
            </tr>
            <tr>
                <th scope="row">Last full rebuild</th>
                <td id="wine-agent-built-at"><?php echo $built_at ? esc_html( wine_agent_format_pacific( $built_at ) ) : '<em>never</em>'; ?></td>
            </tr>
            <tr id="wine-agent-progress-row"<?php echo $in_progress > 0 ? '' : ' hidden'; ?>>
                <th scope="row">Rebuild in progress</th>
                <td>
                    <progress id="wine-agent-progress" style="width:20em;vertical-align:middle" max="1" value="0"></progress>
                    <span id="wine-agent-progress-text"><?php echo esc_html( number_format_i18n( $in_progress ) ); ?> reviews written so far</span>
                </td>
            </tr>
        </table>
        <form method="post" id="wine-agent-rebuild-form">
            <?php wp_nonce_field( 'wine_agent_rebuild_index' ); ?>
            <p>
                <button type="submit" name="wine_agent_rebuild" class="button button-primary">
                    <?php echo $in_progress > 0 ? 'Continue rebuild' : 'Rebuild index'; ?>
                </button>
                <?php if ( $in_progress > 0 ) : ?>
                    <button type="submit" name="wine_agent_rebuild_restart" value="1" class="button">
                        Start over
                    </button>
                <?php endif; ?>
            </p>
            <p class="description">
                Reads every published review and rewrites the index. Rows are built in a
                staging table and swapped in at the end, so searches keep working on the
                old index until the new one is complete. Runs automatically each night;
                you only need this after importing or editing reviews outside the editor.
            </p>
        </form>
        <script>
        // Drives the rebuild to completion in one click: one short pass per
        // request, looping until done, with the count shown as it climbs. The
        // form still posts normally (one pass per press) if this never runs.
        ( function () {
            var form = document.getElementById( 'wine-agent-rebuild-form' );
            if ( ! form || ! window.fetch ) {
                return;
            }
            var $ = function ( id ) { return document.getElementById( id ); };
            var row = $( 'wine-agent-progress-row' );
            var bar = $( 'wine-agent-progress' );
            var text = $( 'wine-agent-progress-text' );
            var buttons = form.querySelectorAll( 'button' );
            var nonce = <?php echo wp_json_encode( wp_create_nonce( 'wine_agent_rebuild_index' ) ); ?>;
            var url = <?php echo wp_json_encode( admin_url( 'admin-ajax.php' ) ); ?>;
            var fmt = function ( n ) { return Number( n ).toLocaleString(); };

            function show( msg, state ) {
                row.hidden = false;
                text.textContent = msg;
                if ( state && state.total > 0 ) {
                    bar.max = state.total;
                    bar.value = state.processed;
                }
            }

            function finish( state ) {
                show( 'Done — ' + fmt( state.processed ) + ' reviews indexed.', state );
                $( 'wine-agent-indexed' ).textContent = fmt( state.indexed );
                if ( state.built_at ) {
                    $( 'wine-agent-built-at' ).textContent = state.built_at;
                }
                var notReady = document.querySelector( '.wrap > .notice-error' );
                if ( notReady ) {
                    notReady.remove();
                }
                buttons[ 0 ].textContent = 'Rebuild index';
                for ( var i = 1; i < buttons.length; i++ ) {
                    buttons[ i ].remove();
                }
                buttons = form.querySelectorAll( 'button' );
                buttons.forEach( function ( b ) { b.disabled = false; } );
            }

            // The first call starts (or resumes) a rebuild; later ones only
            // follow it, so they never restart one that has just finished.
            function step( first, restart ) {
                var body = new FormData();
                body.append( 'action', 'wine_agent_rebuild_step' );
                body.append( '_ajax_nonce', nonce );
                if ( restart ) {
                    body.append( 'restart', '1' );
                }
                if ( ! first ) {
                    body.append( 'follow', '1' );
                }
                fetch( url, { method: 'POST', body: body, credentials: 'same-origin' } )
                    .then( function ( r ) { return r.json(); } )
                    .then( function ( res ) {
                        if ( ! res || ! res.success ) {
                            throw new Error( 'the server refused the request' );
                        }
                        var s = res.data;
                        if ( s.done ) {
                            finish( s );
                            return;
                        }
                        var of = fmt( s.processed ) + ' of ' + fmt( s.total ) + ' reviews';
                        if ( s.busy ) {
                            // A background pass holds the lock; wait for it to
                            // let go, then carry on from where it stopped.
                            show( of + ' — a background pass is running, following it…', s );
                            setTimeout( function () { step( false ); }, 3000 );
                        } else {
                            show( of + ' written…', s );
                            step( false );
                        }
                    } )
                    .catch( function ( err ) {
                        show( 'Stopped: ' + err.message + '. Progress is saved — press Continue rebuild to resume.' );
                        buttons[ 0 ].textContent = 'Continue rebuild';
                        buttons.forEach( function ( b ) { b.disabled = false; } );
                    } );
            }

            form.addEventListener( 'submit', function ( e ) {
                e.preventDefault();
                var restart = !! ( e.submitter && e.submitter.name === 'wine_agent_rebuild_restart' );
                buttons.forEach( function ( b ) { b.disabled = true; } );
                show( restart ? 'Starting over…' : 'Starting…' );
                step( true, restart );
            } );
        } )();
        </script>

        <h2>Review export endpoint</h2>
        <p><code><?php echo esc_html( $endpoint ); ?></code></p>
        <p>A private endpoint that returns every published review as raw JSON, for
        pulling the data out of this site. Pass the key below in the
        <code>X-Wine-Agent-Key</code> request header.</p>
        <p class="description">
            The search app does not use this. <code>/search</code> and <code>/meta</code>
            are public and answered from the index table, so the key is not needed to
            run the site.
        </p>

        <h2>Settings</h2>
        <form method="post" action="options.php">
            <?php settings_fields( 'wine_agent_settings' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="wine_agent_search_key">Review Export API Key</label></th>
                    <td>
                        <input
                            type="text"
                            id="wine_agent_search_key"
                            name="wine_agent_search_key"
                            value="<?php echo esc_attr( $search_key ); ?>"
                            class="regular-text"
                        />
                        <p class="description">
                            Authenticates the private <code>/reviews</code> export endpoint.
                            Not used for search.
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button( 'Save Settings' ); ?>
        </form>

        <h2>Regenerate export key</h2>
        <form method="post">
            <?php wp_nonce_field( 'wine_agent_regenerate_key' ); ?>
            <p>
                <button type="submit" name="wine_agent_regenerate" class="button button-secondary">
                    Regenerate Export Key
                </button>
            </p>
            <p class="description">This immediately invalidates the old key.</p>
        </form>
    </div>
    <?php
}
