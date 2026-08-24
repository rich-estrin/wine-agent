<?php
/**
 * Plugin Name: Wine Agent API
 * Description: Serves the wine search directly from the WordPress database, and exposes a private REST endpoint for the wine agent to fetch all reviews.
 * Version: 2.27.1
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

// ─── Webhook: push review changes to the search app ──────────────────────────

add_action( 'admin_init', function () {
    register_setting( 'wine_agent_settings', 'wine_agent_search_key', [
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ] );
} );

function wine_agent_build_review_payload( int $post_id ): array {
    $post = get_post( $post_id );
    return [
        'id'               => $post_id,
        'brand_name'       => $post->post_title,
        'wine_name'        => get_post_meta( $post_id, 'designation', true )
                           ?: get_post_meta( $post_id, 'variety_style', true )
                           ?: get_post_meta( $post_id, 'varietal_label', true ),
        'designation'      => (string) get_post_meta( $post_id, 'designation', true ),
        'variety_style'    => (string) get_post_meta( $post_id, 'variety_style', true ),
        'tasting_note'     => (string) get_post_meta( $post_id, 'review_content', true ),
        'rating'           => (string) get_post_meta( $post_id, 'rating', true ),
        'price'            => (string) get_post_meta( $post_id, 'price', true ),
        'vintage'          => (string) get_post_meta( $post_id, 'vintage', true ),
        'wine_type'        => (string) get_post_meta( $post_id, 'wine_type', true ),
        'variety'          => (string) get_post_meta( $post_id, 'varietal_label', true ),
        'region'           => (string) get_post_meta( $post_id, 'home_region', true ),
        'appellation'      => (string) get_post_meta( $post_id, 'appellation', true ),
        'publication_date' => wine_agent_format_acf_date( get_post_meta( $post_id, 'publishedDate', true ) )
                           ?: substr( (string) $post->post_date, 0, 10 ),
        'special_designation' => (string) get_post_meta( $post_id, 'special_designation', true ),
        'alcohol'          => (string) get_post_meta( $post_id, 'alcohol_percentage', true ),
        'closure'          => (string) get_post_meta( $post_id, 'closure', true ),
        'cases'            => (string) get_post_meta( $post_id, 'cases', true ),
        'state_or_province' => (string) get_post_meta( $post_id, 'state_or_province', true ),
        'source'           => (string) get_post_meta( $post_id, 'source', true ),
        'reviewer'         => (string) get_post_meta( $post_id, 'reviewer_user', true ),
    ];
}

function wine_agent_send_webhook( string $action, int $post_id ): void {
    $app_url        = rtrim( get_option( 'wine_agent_app_url', '' ), '/' );
    $search_key = get_option( 'wine_agent_search_key', '' );

    if ( empty( $app_url ) ) {
        return;
    }

    $webhook_url = $app_url . '/api/webhook/review';

    $payload = wp_json_encode( [
        'action' => $action,
        'review' => wine_agent_build_review_payload( $post_id ),
    ] );

    $args = [
        'method'    => 'POST',
        'body'      => $payload,
        'headers'   => [
            'Content-Type'     => 'application/json',
            'X-Webhook-Secret' => $search_key,
        ],
        'timeout'   => 10,
        'blocking'  => false, // fire-and-forget
    ];

    wp_remote_post( $webhook_url, $args );
}

// Keep the local index current, and keep feeding the EC2 webhook while proxy
// mode is still a rollback target. Priority 20 so ACF has written its fields
// to postmeta before the pivot reads them back.
add_action( 'save_post_reviews', function ( int $post_id, WP_Post $post ) {
    if ( wp_is_post_revision( $post_id ) ) {
        return;
    }

    if ( $post->post_status === 'publish' ) {
        wine_agent_index_upsert_post( $post_id );
        wine_agent_send_webhook( 'upsert', $post_id );
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
    wine_agent_send_webhook( 'delete', $post_id );
} );

// Restoring from trash puts the review back, if it lands published.
add_action( 'untrashed_post', function ( int $post_id ) {
    if ( get_post_type( $post_id ) !== 'reviews' ) {
        return;
    }
    wine_agent_index_upsert_post( $post_id );
    if ( get_post_status( $post_id ) === 'publish' ) {
        wine_agent_send_webhook( 'upsert', $post_id );
    }
} );

// Hard delete: the row has to go even though trashed_post already ran, since a
// review can be deleted permanently without passing through the trash.
add_action( 'before_delete_post', function ( int $post_id ) {
    if ( get_post_type( $post_id ) !== 'reviews' ) {
        return;
    }
    wine_agent_index_delete_post( $post_id );
    wine_agent_send_webhook( 'delete', $post_id );
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
    delete_option( 'wine_agent_index_rebuild_offset' );
    wine_agent_index_run_rebuild_pass();
} );

// Continuation for a rebuild that ran out of time budget.
add_action( 'wine_agent_index_continue', 'wine_agent_index_run_rebuild_pass' );

/**
 * Run one rebuild pass and schedule the next if there is more to do.
 */
function wine_agent_index_run_rebuild_pass(): void {
    if ( ! wine_agent_index_table_exists() ) {
        wine_agent_index_install();
    }
    $state = wine_agent_index_rebuild_step( 20 );
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
} );

// ─── [wine-search] shortcode ─────────────────────────────────────────────────
//
// Usage: add [wine-search] to any page or post.
// The app JS/CSS are loaded from the configured app URL (Settings → Wine Agent API).
// To set the URL: WP Admin → Settings → Wine Agent API → App URL.

add_action( 'admin_init', function () {
    register_setting( 'wine_agent_settings', 'wine_agent_app_url', [
        'sanitize_callback' => 'esc_url_raw',
        'default'           => '',
    ] );
    register_setting( 'wine_agent_settings', 'wine_agent_search_mode', [
        'sanitize_callback' => function ( $value ) {
            return 'native' === $value ? 'native' : 'proxy';
        },
        'default'           => 'proxy',
    ] );
    register_setting( 'wine_agent_settings', 'wine_agent_allow_mode_override', [
        'sanitize_callback' => function ( $value ) {
            return '1' === (string) $value ? '1' : '';
        },
        'default'           => '',
    ] );
} );

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

    // Inject the WP REST proxy base URL so the app calls WP, not EC2 directly.
    $proxy_base = rest_url( 'wine-agent/v1' );
    return '<div id="wine-agent-root"></div>' . "\n"
         . '<script>window.__WINE_AGENT_API_BASE__ = ' . wp_json_encode( $proxy_base ) . ';</script>';
} );

// ─── Search endpoints ────────────────────────────────────────────────────────
//
// Two implementations behind one route, chosen by the Search Mode setting:
//
//   native — answer from the index table in this site's own database. No
//            network hop, no second server, and the data is whatever
//            WordPress last saved.
//   proxy  — forward to the EC2 Node API, the pre-2.27 behaviour. Kept as the
//            rollback path while native mode is soaking.
//
// Either way the embedded app calls same-origin HTTPS WP REST endpoints, which
// is what keeps browsers from blocking the request as mixed content.

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

    // The app ships a chat client; the feature is disabled on both backends.
    // Answering here keeps the contract explicit rather than 404-ing.
    register_rest_route( 'wine-agent/v1', '/chat', array_merge( $public_args, [
        'methods'  => 'POST',
        'callback' => function () {
            return new WP_REST_Response( [ 'error' => 'Chat is not available yet.' ], 503 );
        },
    ] ) );
} );

/**
 * Which backend serves /search and /meta: 'native' or 'proxy'.
 *
 * A `wa_mode` query param can override the setting for one request, but only
 * while the override option is switched on — that is what lets the parity
 * harness ask the same site the same question both ways, over the real data,
 * before anyone commits to the switch. It stays off on a normal site.
 */
function wine_agent_search_mode(): string {
    $mode = get_option( 'wine_agent_search_mode', 'proxy' );

    if ( '1' === (string) get_option( 'wine_agent_allow_mode_override', '' ) && isset( $_GET['wa_mode'] ) ) {
        $override = sanitize_text_field( wp_unslash( $_GET['wa_mode'] ) );
        if ( 'native' === $override || 'proxy' === $override ) {
            return $override;
        }
    }

    return 'native' === $mode ? 'native' : 'proxy';
}

/**
 * Query params to forward to the proxy — everything except the override, which
 * is ours and would be read as a wine field by the Node API.
 */
function wine_agent_proxy_params( WP_REST_Request $request ): array {
    $params = $request->get_query_params();
    unset( $params['wa_mode'] );
    return $params;
}

function wine_agent_handle_search( WP_REST_Request $request ): WP_REST_Response {
    nocache_headers();

    if ( 'native' !== wine_agent_search_mode() ) {
        return wine_agent_proxy_request( 'search', wine_agent_proxy_params( $request ) );
    }

    if ( wine_agent_index_needs_rebuild() ) {
        return new WP_REST_Response(
            [ 'error' => 'Search index is not built yet. Rebuild it under Settings → Wine Agent API.' ],
            503
        );
    }

    $result = wine_agent_run_search( wine_agent_index_executor(), $request->get_query_params() );
    return new WP_REST_Response( $result, 200 );
}

function wine_agent_handle_meta( WP_REST_Request $request ): WP_REST_Response {
    nocache_headers();

    if ( 'native' !== wine_agent_search_mode() ) {
        // Note: proxy mode has never forwarded the filters, so its facet lists
        // are unnarrowed. Native mode forwards them, which is what the app was
        // built for — see the Search Mode setting.
        return wine_agent_proxy_request( 'meta' );
    }

    if ( wine_agent_index_needs_rebuild() ) {
        return new WP_REST_Response(
            [ 'error' => 'Search index is not built yet. Rebuild it under Settings → Wine Agent API.' ],
            503
        );
    }

    $result = wine_agent_run_meta( wine_agent_index_executor(), $request->get_query_params() );
    return new WP_REST_Response( $result, 200 );
}

function wine_agent_proxy_request( string $path, array $query_params = [] ): WP_REST_Response {
    $app_url = rtrim( get_option( 'wine_agent_app_url', '' ), '/' );
    if ( empty( $app_url ) ) {
        return new WP_REST_Response( [ 'error' => 'App URL not configured' ], 503 );
    }

    $url = rtrim( $app_url, '/' ) . '/api/' . $path;
    if ( ! empty( $query_params ) ) {
        $url .= '?' . http_build_query( $query_params );
    }

    $secret  = get_option( 'wine_agent_search_key', '' );
    $response = wp_remote_get( $url, [
        'timeout' => 15,
        'headers' => [ 'X-Wine-Agent-Key' => $secret ],
    ] );
    if ( is_wp_error( $response ) ) {
        return new WP_REST_Response( [ 'error' => $response->get_error_message() ], 502 );
    }

    $code = wp_remote_retrieve_response_code( $response );
    $body = json_decode( wp_remote_retrieve_body( $response ), true );
    return new WP_REST_Response( $body, $code );
}

// ─── Debug endpoint (temporary) ──────────────────────────────────────────────

add_action( 'rest_api_init', function () {
    register_rest_route( 'wine-agent/v1', '/debug/(?P<id>\d+)', [
        'methods'             => 'GET',
        'callback'            => 'wine_agent_debug_post',
        'permission_callback' => 'wine_agent_check_auth',
        'args'                => [ 'id' => [ 'validate_callback' => 'is_numeric' ] ],
    ] );
} );

function wine_agent_debug_post( WP_REST_Request $request ) {
    $id   = (int) $request->get_param( 'id' );
    $meta = get_post_meta( $id );
    return rest_ensure_response( array( 'post_meta' => $meta ) );
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
        echo '<div class="notice notice-success"><p>API key regenerated.</p></div>';
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
        if ( isset( $_POST['wine_agent_rebuild_restart'] ) ) {
            delete_option( 'wine_agent_index_rebuild_offset' );
        }
        $state = wine_agent_index_rebuild_step( 20 );
        if ( $state['done'] ) {
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
    $app_url     = get_option( 'wine_agent_app_url', '' );
    $mode        = wine_agent_search_mode();
    $endpoint    = rest_url( 'wine-agent/v1/reviews' );
    $index_count = wine_agent_index_count();
    $built_at    = get_option( 'wine_agent_index_built_at', '' );
    $in_progress = (int) get_option( 'wine_agent_index_rebuild_offset', 0 );
    $needs_build = wine_agent_index_needs_rebuild();
    ?>
    <div class="wrap">
        <h1>Wine Agent API</h1>

        <?php if ( 'native' === $mode && $needs_build ) : ?>
            <div class="notice notice-error">
                <p><strong>Search is in native mode but the index is not ready.</strong>
                Rebuild it below, or switch back to proxy mode — searches are
                returning 503 until one or the other happens.</p>
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

        <h2>Endpoint</h2>
        <p><code><?php echo esc_html( $endpoint ); ?></code></p>
        <p>Pass the API key in the <code>X-Wine-Agent-Key</code> request header.</p>

        <h2>Settings</h2>
        <form method="post" action="options.php">
            <?php settings_fields( 'wine_agent_settings' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row">Search Mode</th>
                    <td>
                        <fieldset>
                            <label>
                                <input type="radio" name="wine_agent_search_mode" value="native"
                                    <?php checked( $mode, 'native' ); ?> />
                                <strong>Native</strong> — search this site's own database
                            </label>
                            <p class="description" style="margin:4px 0 12px 24px">
                                No external server. Reviews appear in search as soon as they are saved.
                                Filter dropdowns narrow each other (choosing a Wine Type narrows Varietal,
                                a State narrows Appellation), which proxy mode never did.
                            </p>
                            <label>
                                <input type="radio" name="wine_agent_search_mode" value="proxy"
                                    <?php checked( $mode, 'proxy' ); ?> />
                                <strong>Proxy</strong> — forward to the external search server
                            </label>
                            <p class="description" style="margin:4px 0 0 24px">
                                The pre-2.27 behaviour, kept as a rollback. Requires the Search App URL
                                below and a reachable server.
                            </p>
                        </fieldset>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Parity testing</th>
                    <td>
                        <label>
                            <input type="checkbox" name="wine_agent_allow_mode_override" value="1"
                                <?php checked( get_option( 'wine_agent_allow_mode_override', '' ), '1' ); ?> />
                            Allow <code>?wa_mode=native|proxy</code> to override the mode per request
                        </label>
                        <p class="description">
                            Lets the parity harness ask this site the same query both ways and diff the
                            answers, over the real data. Turn it off once the comparison is done.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="wine_agent_search_key">Search API Key</label></th>
                    <td>
                        <input
                            type="text"
                            id="wine_agent_search_key"
                            name="wine_agent_search_key"
                            value="<?php echo esc_attr( $search_key ); ?>"
                            class="regular-text"
                        />
                        <p class="description">Shared secret between this site and the search API server. Must match <code>WEBHOOK_SECRET</code> in the server's <code>.env</code>.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="wine_agent_app_url">Search App URL</label></th>
                    <td>
                        <input
                            type="url"
                            id="wine_agent_app_url"
                            name="wine_agent_app_url"
                            value="<?php echo esc_attr( $app_url ); ?>"
                            class="regular-text"
                            placeholder="http://your-ec2-host.compute.amazonaws.com"
                        />
                        <p class="description">Base URL of the search API server. Used for proxying search requests and sending webhooks on publish/trash.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button( 'Save Settings' ); ?>
        </form>

        <h2>Regenerate Key</h2>
        <form method="post">
            <?php wp_nonce_field( 'wine_agent_regenerate_key' ); ?>
            <p>
                <button type="submit" name="wine_agent_regenerate" class="button button-secondary">
                    Regenerate API Key
                </button>
            </p>
            <p class="description">This immediately invalidates the old key.</p>
        </form>
    </div>
    <?php
}
