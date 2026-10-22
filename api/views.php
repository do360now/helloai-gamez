<?php
/**
 * Visitor counter, ported from do360now's api/views.php with helloai's per-slug totals.
 * One browser per IP (IPv6: per /64) per UTC day, per game and overall; the IP is only
 * kept as a salted daily hash. State lives outside the web root in ~/private/helloai-gamez.
 *   GET  ?game=<slug>  -> {"game": slug, "views": N, "total": N, "since": "..."}
 *   POST ?game=<slug>  -> counts this visitor (browsers only), then returns the same.
 * A slug is "home" (the arcade page) or one with games/<slug>/index.html. PHP 7.4 compatible.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');

function views_reply(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function views_private(): string {
    $dir = getenv('GAMEZ_VIEWS_DIR');
    if (is_string($dir) && $dir !== '') return rtrim($dir, '/');
    $home = getenv('HOME');
    if (!is_string($home) || $home === '') $home = '/home/do360now';
    return rtrim($home, '/') . '/private/helloai-gamez';
}

function views_is_browser(string $ua): bool {
    if (trim($ua) === '') return false;
    $bots = [
        '/googlebot/i', '/bingbot/i', '/duckduckbot/i', '/baiduspider/i', '/yandex(bot)?/i', '/applebot/i',
        '/gptbot/i', '/chatgpt-user/i', '/oai-searchbot/i', '/claudebot/i', '/claude-user/i', '/anthropic-ai/i',
        '/perplexitybot/i', '/perplexity-user/i', '/bytespider/i', '/ccbot/i', '/amazonbot/i',
        '/claude-searchbot/i', '/meta-external(agent|fetcher)/i', '/mistralai-user/i', '/duckassistbot/i', '/cohere-ai/i', '/diffbot/i',
        '/^(anthropic|openai)\/(js|node|python|go|java|ruby)/i', '/langchain/i', '/llama-?index/i', '/openai[- ]?python/i', '/anthropic[- ]?(sdk|python)/i', '/\bmcp\b/i', '/ai-agent/i',
        '/headless/i', '/bot\b/i', '/crawler/i', '/spider/i', '/externalhit/i', '/preview/i',
    ];
    foreach ($bots as $re) if (preg_match($re, $ua)) return false;
    return (bool)preg_match('/Mozilla\//', $ua) && (bool)preg_match('/Chrome|Safari|Firefox|Edg/', $ua);
}

function views_salt(string $dir): string {
    $path = $dir . '/views.salt';
    if (is_file($path)) {
        $salt = trim((string)file_get_contents($path));
        if ($salt !== '') return $salt;
    }
    $salt = bin2hex(random_bytes(32));
    file_put_contents($path, $salt, LOCK_EX);
    chmod($path, 0600);
    return $salt;
}

/** One visitor per IPv4 address or per IPv6 /64 (a single connection usually owns a whole /64). */
function views_visitor(string $ip): string {
    $bin = @inet_pton($ip);
    if ($bin === false) return '';
    return strlen($bin) === 16 ? bin2hex(substr($bin, 0, 8)) . '::/64' : $ip;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') views_reply(405, ['error' => 'method not allowed']);

$game = (string)($_GET['game'] ?? '');
if ($game !== 'home' && (!preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/', $game) || !is_file(__DIR__ . '/../games/' . $game . '/index.html'))) {
    views_reply(404, ['error' => 'unknown game']);
}

$dir = views_private();
if (!is_dir($dir) && !@mkdir($dir, 0700, true)) views_reply(503, ['error' => 'views unavailable']);
$fh = @fopen($dir . '/views.json', 'c+');
if ($fh === false) views_reply(503, ['error' => 'views unavailable']);
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh);
$state = $raw ? json_decode($raw, true) : null;
if (!is_array($state) || !isset($state['total'])) $state = ['since' => gmdate('c'), 'total' => 0, 'games' => [], 'date' => '', 'seen' => []];
if (!is_array($state['games'] ?? null)) $state['games'] = [];
$today = gmdate('Y-m-d');
if (($state['date'] ?? '') !== $today || !is_array($state['seen'] ?? null)) {
    $state['date'] = $today;
    $state['seen'] = [];               // yesterday's hashes are dropped, not kept
}

// The whole file is rewritten per new visitor, so cap new entries per day to bound its size (~2 MB).
const VIEWS_DAILY_CAP = 40000;

$changed = false;
if ($method === 'POST') {
    $ip = views_visitor($_SERVER['REMOTE_ADDR'] ?? '');
    if ($ip !== '' && views_is_browser($_SERVER['HTTP_USER_AGENT'] ?? '') && count($state['seen']) < VIEWS_DAILY_CAP) {
        $digest = substr(hash('sha256', views_salt($dir) . ':' . $today . ':' . $ip), 0, 32);
        if (!isset($state['seen'][$digest])) {
            $state['seen'][$digest] = 1;
            $state['total'] = (int)$state['total'] + 1;
            $changed = true;
        }
        if (!isset($state['seen'][$game . ':' . $digest])) {
            $state['seen'][$game . ':' . $digest] = 1;
            $state['games'][$game] = (int)($state['games'][$game] ?? 0) + 1;
            $changed = true;
        }
    }
}
if ($changed) {
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($state, JSON_UNESCAPED_SLASHES));
    fflush($fh);
}
flock($fh, LOCK_UN);
fclose($fh);
views_reply(200, [
    'game' => $game,
    'views' => (int)($state['games'][$game] ?? 0),
    'total' => (int)$state['total'],
    'since' => (string)($state['since'] ?? gmdate('c')),
]);
