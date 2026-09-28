<?php
/**
 * Search access: /search and /meta answer only a reader who may see the page
 * hosting the search, and the shortcode hands the app what it needs to prove
 * that.
 *
 * Runs the plugin against a stub WordPress, with MemberPress stubbed as a
 * single MeprRule::is_locked() switch. The real MemberPress rule evaluation is
 * the post-upload check in docs/production-rollout.md; this covers everything
 * on our side of that call.
 *
 * Usage: php scripts/plugin-access-test.php
 */

define( 'ABSPATH', __DIR__ . '/../' );
define( 'HOUR_IN_SECONDS', 3600 );

// The shortcode bails out without built assets, and a source checkout has
// none, so load a copy of the plugin that carries a stand-in manifest.
$plugin_dir = sys_get_temp_dir() . '/wine-agent-access-test-' . getmypid();
mkdir( $plugin_dir . '/assets', 0777, true );
copy( __DIR__ . '/../wordpress-plugin/wine-agent-api.php', $plugin_dir . '/wine-agent-api.php' );
mkdir( $plugin_dir . '/includes' );
foreach ( glob( __DIR__ . '/../wordpress-plugin/includes/*.php' ) as $file ) {
	copy( $file, $plugin_dir . '/includes/' . basename( $file ) );
}
file_put_contents(
	$plugin_dir . '/assets/manifest.json',
	json_encode( [ 'index.html' => [ 'file' => 'assets/index-test.js' ] ] )
);
register_shutdown_function(
	function () use ( $plugin_dir ) {
		exec( 'rm -rf ' . escapeshellarg( $plugin_dir ) );
	}
);

// ── Stub WordPress ───────────────────────────────────────────────────────────
$GLOBALS['stub_hooks']      = [];
$GLOBALS['stub_shortcodes'] = [];
$GLOBALS['stub_routes']     = [];
$GLOBALS['stub_posts']      = [];
$GLOBALS['stub_can_read']   = false;
$GLOBALS['stub_password']   = false;
$GLOBALS['stub_the_id']     = 0;

class WP_Post {
	public $ID;
	public $post_status;
	public function __construct( int $id, string $status ) {
		$this->ID          = $id;
		$this->post_status = $status;
	}
}
class WP_REST_Request {
	private $headers;
	public function __construct( array $headers = [] ) {
		$this->headers = array_change_key_case( $headers );
	}
	public function get_header( $name ) {
		return $this->headers[ strtolower( $name ) ] ?? null;
	}
}

function plugin_dir_path( $file ) {
	return dirname( $file ) . '/';
}
function add_action( $hook, $callback, $priority = 10, $args = 1 ) {
	$GLOBALS['stub_hooks'][ $hook ][] = $callback;
	return true;
}
function add_filter( $hook, $callback, $priority = 10, $args = 1 ) {
	return add_action( $hook, $callback, $priority, $args );
}
function add_shortcode( $tag, $callback ) {
	$GLOBALS['stub_shortcodes'][ $tag ] = $callback;
}
function register_activation_hook( $file, $callback ) {}
function register_deactivation_hook( $file, $callback ) {}
function register_rest_route( $namespace, $route, $args ) {
	$GLOBALS['stub_routes'][ $namespace . $route ] = $args;
}
function wp_dequeue_script( $handle ) {}
function wp_enqueue_script( $handle, $src = '', $deps = [], $ver = null, $footer = false ) {}
function wp_enqueue_style( $handle, $src = '', $deps = [], $ver = null ) {}
function plugins_url( $path = '', $file = '' ) {
	return 'https://example.test/wp-content/plugins/wine-agent-api/' . ltrim( $path, '/' );
}
function rest_url( $path = '' ) {
	return 'https://example.test/wp-json/' . ltrim( $path, '/' );
}
function wp_json_encode( $value, $flags = 0 ) {
	return json_encode( $value, $flags );
}
function get_file_data( $file, $headers, $context = '' ) {
	return [ 'Version' => 'test' ];
}
function wp_salt( $scheme = 'auth' ) {
	return 'stub-salt-' . $scheme;
}
function wp_create_nonce( $action = -1 ) {
	return 'nonce-for-' . $action;
}
function get_the_ID() {
	return $GLOBALS['stub_the_id'];
}
function get_post( $id ) {
	return $GLOBALS['stub_posts'][ (int) $id ] ?? null;
}
function current_user_can( $cap, ...$args ) {
	return $GLOBALS['stub_can_read'];
}
function post_password_required( $post = null ) {
	return $GLOBALS['stub_password'];
}

require_once $plugin_dir . '/wine-agent-api.php';

// ── Assertions ───────────────────────────────────────────────────────────────
$failures = [];

function expect( bool $condition, string $message ): void {
	if ( ! $condition ) {
		$GLOBALS['failures'][] = $message;
	}
}

/** Whether a request carrying this page header would be let through. */
function allowed( ?string $token ): bool {
	return wine_agent_can_search( new WP_REST_Request( null === $token ? [] : [ 'X-Wine-Agent-Page' => $token ] ) );
}

$GLOBALS['stub_posts'][42] = new WP_Post( 42, 'publish' );
$GLOBALS['stub_posts'][7]  = new WP_Post( 7, 'publish' );
$good                      = wine_agent_page_token( 42 );

// ── Both search routes carry the check ───────────────────────────────────────
foreach ( $GLOBALS['stub_hooks']['rest_api_init'] as $init ) {
	$init();
}
foreach ( [ 'wine-agent/v1/search', 'wine-agent/v1/meta' ] as $route ) {
	expect(
		( $GLOBALS['stub_routes'][ $route ]['permission_callback'] ?? null ) === 'wine_agent_can_search',
		"$route is not guarded by wine_agent_can_search"
	);
}

// ── The token names a page and cannot be forged ──────────────────────────────
expect( allowed( $good ), 'a valid token for a public page should be allowed' );
expect( ! allowed( null ), 'a request with no page token must be refused' );
expect( ! allowed( '' ), 'an empty page token must be refused' );
expect( ! allowed( '42' ), 'a bare page id must be refused' );
expect( ! allowed( '42.' . str_repeat( '0', 32 ) ), 'a forged signature must be refused' );
expect(
	! allowed( '7.' . explode( '.', $good )[1] ),
	"page 42's signature must not unlock page 7"
);
expect( ! allowed( wine_agent_page_token( 999 ) ), 'a token for a page that does not exist must be refused' );
expect( ! allowed( strtoupper( $good ) ), 'a token is matched exactly' );

// ── The page's own visibility ────────────────────────────────────────────────
$GLOBALS['stub_posts'][43] = new WP_Post( 43, 'draft' );
expect( ! allowed( wine_agent_page_token( 43 ) ), 'a draft page must refuse a reader who cannot read it' );
$GLOBALS['stub_can_read'] = true;
expect( allowed( wine_agent_page_token( 43 ) ), 'a draft page should allow a reader who can read it' );
$GLOBALS['stub_can_read'] = false;

$GLOBALS['stub_password'] = true;
expect( ! allowed( $good ), 'a password-protected page must refuse until the password is given' );
$GLOBALS['stub_password'] = false;

// ── MemberPress decides when it is active ────────────────────────────────────
if ( true ) {
	class MeprRule {
		public static $locked = true;
		public static function is_locked( $post ) {
			return self::$locked;
		}
	}
}
MeprRule::$locked = true;
expect( ! allowed( $good ), 'a page MemberPress locks for this reader must refuse' );
MeprRule::$locked = false;
expect( allowed( $good ), 'a page MemberPress unlocks for this reader should allow' );
MeprRule::$locked = true;

// ── The shortcode hands the app its page token and a REST nonce ──────────────
$GLOBALS['stub_the_id'] = 42;
$rendered               = $GLOBALS['stub_shortcodes']['wine-search']();
expect(
	false !== strpos( $rendered, 'window.__WINE_AGENT_PAGE__ = ' . json_encode( $good ) ),
	'shortcode does not emit the page token for its host page'
);
expect(
	false !== strpos( $rendered, 'window.__WINE_AGENT_NONCE__ = "nonce-for-wp_rest"' ),
	'shortcode does not emit a wp_rest nonce'
);

$GLOBALS['stub_the_id'] = 0;
$rendered               = $GLOBALS['stub_shortcodes']['wine-search']();
expect(
	false !== strpos( $rendered, 'window.__WINE_AGENT_PAGE__ = ""' ),
	'outside a post the shortcode should emit an empty page token'
);

// ── Report ───────────────────────────────────────────────────────────────────
if ( empty( $failures ) ) {
	echo "plugin access test: ok\n";
	exit( 0 );
}

echo 'plugin access test: ' . count( $failures ) . " failure(s)\n";
foreach ( $failures as $failure ) {
	echo "  - $failure\n";
}
exit( 1 );
