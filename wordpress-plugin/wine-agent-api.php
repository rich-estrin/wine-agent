<?php
/**
 * Plugin Name: Wine Agent API
 * Description: Exposes a private REST endpoint for the wine agent to fetch all reviews.
 * Version: 2.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

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

function wine_agent_get_reviews( WP_REST_Request $request ): WP_REST_Response {
    global $wpdb;

    $page           = max( 1, (int) $request->get_param( 'page' ) ?: 1 );
    $per_page       = min( 1000, max( 1, (int) $request->get_param( 'per_page' ) ?: 500 ) );
    $modified_after = $request->get_param( 'modified_after' );
    $offset         = ( $page - 1 ) * $per_page;

    // Build optional modified_after clause
    $date_clause = '';
    if ( $modified_after ) {
        $date = sanitize_text_field( $modified_after );
        $date_clause = $wpdb->prepare( 'AND p.post_modified >= %s', $date );
    }

    // One query: pivot the postmeta keys we need, join taxonomy for appellation.
    // Uses MAX() to collapse the multiple meta rows into a single result row.
    $sql = $wpdb->prepare(
        "
        SELECT
            p.ID                                                   AS id,
            p.post_title                                           AS brand_name,
            p.post_date                                            AS publication_date,
            MAX( CASE WHEN pm.meta_key = 'review_content' THEN pm.meta_value END ) AS tasting_note,
            MAX( CASE WHEN pm.meta_key = 'rating'         THEN pm.meta_value END ) AS rating,
            MAX( CASE WHEN pm.meta_key = 'price'          THEN pm.meta_value END ) AS price,
            MAX( CASE WHEN pm.meta_key = 'vintage'        THEN pm.meta_value END ) AS vintage,
            MAX( CASE WHEN pm.meta_key = 'wine_type'      THEN pm.meta_value END ) AS wine_type,
            MAX( CASE WHEN pm.meta_key = 'designation'    THEN pm.meta_value END ) AS designation,
            MAX( CASE WHEN pm.meta_key = 'variety_style'  THEN pm.meta_value END ) AS variety_style,
            MAX( CASE WHEN pm.meta_key = 'home_region'    THEN pm.meta_value END ) AS home_region,
            MAX( CASE WHEN pm.meta_key = 'appellation'    THEN pm.meta_value END ) AS appellation,
            MAX( CASE WHEN pm.meta_key = 'varietal_label' THEN pm.meta_value END ) AS variety
        FROM {$wpdb->posts} p
        JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID
        WHERE p.post_type   = 'reviews'
          AND p.post_status  = 'publish'
          {$date_clause}
        GROUP BY p.ID, p.post_title, p.post_date
        ORDER BY p.ID ASC
        LIMIT %d OFFSET %d
        ",
        $per_page,
        $offset
    );

    $rows = $wpdb->get_results( $sql, ARRAY_A );

    $reviews = array_map( function ( $row ) {
        return [
            'id'               => (int) $row['id'],
            'brand_name'       => (string) $row['brand_name'],
            'wine_name'        => (string) ( $row['designation'] ?: $row['variety_style'] ?: $row['variety'] ),
            'designation'      => (string) $row['designation'],
            'variety_style'    => (string) $row['variety_style'],
            'tasting_note'     => (string) $row['tasting_note'],
            'rating'           => (string) $row['rating'],
            'price'            => (string) $row['price'],
            'vintage'          => (string) $row['vintage'],
            'wine_type'        => (string) $row['wine_type'],
            'variety'          => (string) ( $row['variety'] ?: $row['variety_style'] ),
            'region'           => (string) $row['home_region'],
            'appellation'      => (string) $row['appellation'],
            'publication_date' => (string) $row['publication_date'],
        ];
    }, $rows );

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
        'publication_date' => $post->post_date,
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

// Fire on publish/update
add_action( 'save_post_reviews', function ( int $post_id, WP_Post $post ) {
    if ( $post->post_status !== 'publish' || wp_is_post_revision( $post_id ) ) {
        return;
    }
    wine_agent_send_webhook( 'upsert', $post_id );
}, 10, 2 );

// Fire on trash
add_action( 'trashed_post', function ( int $post_id ) {
    if ( get_post_type( $post_id ) !== 'reviews' ) {
        return;
    }
    wine_agent_send_webhook( 'delete', $post_id );
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
        wp_script_add_data( 'wine-agent-app', 'type', 'module' );
    }
    if ( $css_file ) {
        wp_enqueue_style( 'wine-agent-app', plugins_url( $css_file, __FILE__ ) );
    }

    // Inject the WP REST proxy base URL so the app calls WP, not EC2 directly.
    $proxy_base = rest_url( 'wine-agent/v1' );
    return '<div id="wine-agent-root"></div>' . "\n"
         . '<script>window.__WINE_AGENT_API_BASE__ = ' . wp_json_encode( $proxy_base ) . ';</script>';
} );

// ─── Proxy endpoints: forward /search and /meta to the EC2 API ───────────────
//
// Allows the embedded React app to call HTTPS WP REST endpoints instead of
// making direct HTTP requests to EC2 (which browsers block as mixed content).

add_action( 'rest_api_init', function () {
    $proxy_args = [
        'permission_callback' => '__return_true',
    ];

    register_rest_route( 'wine-agent/v1', '/search', array_merge( $proxy_args, [
        'methods'  => 'GET',
        'callback' => 'wine_agent_proxy_search',
    ] ) );

    register_rest_route( 'wine-agent/v1', '/meta', array_merge( $proxy_args, [
        'methods'  => 'GET',
        'callback' => 'wine_agent_proxy_meta',
    ] ) );
} );

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

function wine_agent_proxy_search( WP_REST_Request $request ): WP_REST_Response {
    nocache_headers();
    return wine_agent_proxy_request( 'search', $request->get_query_params() );
}

function wine_agent_proxy_meta( WP_REST_Request $request ): WP_REST_Response {
    nocache_headers();
    return wine_agent_proxy_request( 'meta' );
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

    $search_key = get_option( 'wine_agent_search_key', '' );
    $app_url    = get_option( 'wine_agent_app_url', '' );
    $endpoint       = rest_url( 'wine-agent/v1/reviews' );
    ?>
    <div class="wrap">
        <h1>Wine Agent API</h1>

        <h2>Endpoint</h2>
        <p><code><?php echo esc_html( $endpoint ); ?></code></p>
        <p>Pass the API key in the <code>X-Wine-Agent-Key</code> request header.</p>

        <h2>Settings</h2>
        <form method="post" action="options.php">
            <?php settings_fields( 'wine_agent_settings' ); ?>
            <table class="form-table">
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
