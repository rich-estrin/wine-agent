<?php
/**
 * Plugin Name: Wine Agent API
 * Description: Serves the wine search directly from the WordPress database, and exposes a private REST endpoint for the wine agent to fetch all reviews.
 * Version: 2.33.0
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

register_activation_hook( __FILE__, function () {
    wine_agent_index_install();
    if ( ! wp_next_scheduled( 'wine_agent_index_nightly' ) ) {
        wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wine_agent_index_nightly' );
    }
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
    if ( ! wp_next_scheduled( 'wine_agent_index_nightly' ) ) {
        wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wine_agent_index_nightly' );
    }
    wine_agent_index_maybe_start_rebuild();
} );

/**
 * Start a background rebuild when the index can't serve search — a first
 * install, an upgrade from proxy mode that never built one, or a schema bump.
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

    // Point the app at this site's own REST endpoints.
    return '<div id="wine-agent-root"></div>' . "\n"
         . '<script>window.__WINE_AGENT_API_BASE__ = ' . wp_json_encode( rest_url( 'wine-agent/v1' ) ) . ';</script>';
} );

// ─── Search endpoints ────────────────────────────────────────────────────────
//
// Answered from the index table in this site's own database: no network hop,
// no second server, and the data is whatever WordPress last saved. The embedded
// app calls same-origin HTTPS WP REST endpoints, which keeps browsers from
// blocking the request as mixed content.

add_action( 'rest_api_init', function () {
    $public_args = [
        'permission_callback' => '__return_true',
    ];

    register_rest_route( 'wine-agent/v1', '/search', array_merge( $public_args, [
        'methods'  => 'GET',
        'callback' => 'wine_agent_handle_search',
    ] ) );

    register_rest_route( 'wine-agent/v1', '/meta', array_merge( $public_args, [
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

    $result = wine_agent_run_search( wine_agent_index_executor(), $request->get_query_params() );
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
                    <?php echo esc_html( number_format_i18n( $index_count ) ); ?>
                    <?php if ( ! wine_agent_index_table_exists() ) : ?>
                        <span style="color:#b32d2e">— table not created yet</span>
                    <?php endif; ?>
                </td>
            </tr>
            <tr>
                <th scope="row">Last full rebuild</th>
                <td><?php echo $built_at ? esc_html( $built_at ) : '<em>never</em>'; ?></td>
            </tr>
            <?php if ( $in_progress > 0 ) : ?>
            <tr>
                <th scope="row">Rebuild in progress</th>
                <td><?php echo esc_html( number_format_i18n( $in_progress ) ); ?> reviews written so far</td>
            </tr>
            <?php endif; ?>
        </table>
        <form method="post">
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
