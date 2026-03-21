<?php
/**
 * Plugin Name: Wine Agent API
 * Description: Exposes a private REST endpoint for the wine agent to fetch all reviews.
 * Version: 1.0.0
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
    $stored_key = get_option( 'wine_agent_api_key', '' );
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

add_action( 'admin_init', function () {
    register_setting( 'wine_agent_settings', 'wine_agent_api_key', [
        'sanitize_callback' => 'sanitize_text_field',
    ] );
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
        update_option( 'wine_agent_api_key', $new_key );
        echo '<div class="notice notice-success"><p>API key regenerated.</p></div>';
    }

    $current_key = get_option( 'wine_agent_api_key', '' );
    $endpoint    = rest_url( 'wine-agent/v1/reviews' );
    ?>
    <div class="wrap">
        <h1>Wine Agent API</h1>

        <h2>Endpoint</h2>
        <p><code><?php echo esc_html( $endpoint ); ?></code></p>
        <p>Pass the API key in the <code>X-Wine-Agent-Key</code> request header.</p>

        <h2>API Key</h2>
        <form method="post" action="options.php">
            <?php settings_fields( 'wine_agent_settings' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><label for="wine_agent_api_key">Current Key</label></th>
                    <td>
                        <input
                            type="text"
                            id="wine_agent_api_key"
                            name="wine_agent_api_key"
                            value="<?php echo esc_attr( $current_key ); ?>"
                            class="regular-text"
                        />
                        <p class="description">Keep this secret. Used by the wine agent to authenticate requests.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button( 'Save Key' ); ?>
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
