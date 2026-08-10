import { renderDashboardHtml } from './ui.js';

// In-Memory Storage Fallback (used only when KV is not bound)
let memoryBots = [];

// [ABUSE-3] Maximum allowed request body size
const MAX_BODY_SIZE = 50 * 1024 * 1024; // 50 MB

// [AUTH-2] Rate limiting config
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

// KV key for bot config (V2 = AES-GCM encrypted)
const KV_BOTS_KEY = 'BOTS_CONFIG_V2';

// [SEC-HDR] HTTP Security Headers for Dashboard HTML response
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; " +
    "script-src 'unsafe-inline'; " +
    "style-src 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "connect-src 'self'; " +
    "img-src 'self' data:; " +
    "form-action 'self'; " +
    "frame-ancestors 'none';",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // [INFO-2] Split CORS policy:
    //   - Admin routes: same-origin only (blocks cross-origin API access)
    //   - Proxy/webhook routes: open (meant to be called from any client)
    const adminCorsHeaders = {
      'Access-Control-Allow-Origin': url.origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin'
    };

    const proxyCorsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token'
    };

    if (request.method === 'OPTIONS') {
      const isAdmin = path.startsWith('/api/admin/');
      return new Response(null, { headers: isAdmin ? adminCorsHeaders : proxyCorsHeaders });
    }

    try {
      // 1. Web Dashboard UI (/ or /admin)
      if (path === '/' || path === '/admin') {
        const html = renderDashboardHtml(url.origin);
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...SECURITY_HEADERS
          }
        });
      }

      // 2. Admin REST APIs (/api/admin/*)
      if (path.startsWith('/api/admin/')) {
        return handleAdminApi(path, request, env, adminCorsHeaders);
      }

      // 3. Direct Proxy Route: /bot<TOKEN>/<METHOD>
      if (path.startsWith('/bot')) {
        return handleDirectProxy(path, url, request, proxyCorsHeaders, env);
      }

      // 4. Alias Gateway Proxy Route: /proxy/<ALIAS>/<METHOD>
      if (path.startsWith('/proxy/')) {
        return handleAliasProxy(path, url, request, env, proxyCorsHeaders);
      }

      // 5. Telegram Webhook Receiver & Dispatcher: /webhook/<ALIAS>
      if (path.startsWith('/webhook/')) {
        return handleWebhookDispatch(path, request, env);
      }

      // [INFO-1] Do not echo back the requested path to avoid information leakage
      return new Response(JSON.stringify({ error: '404 Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...proxyCorsHeaders }
      });
    } catch (err) {
      // Sanitize token from error message to prevent leakage
      const safeMessage = err.message
        ? err.message.replace(/\d+:[A-Za-z0-9_-]{35,}/g, '[REDACTED_TOKEN]')
        : 'Unknown error';
      return new Response(JSON.stringify({ error: 'Internal Server Error', message: safeMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...proxyCorsHeaders }
      });
    }
  }
};

/* ─────────────────────────── Security Audit Logger ─────────────────────────── */

/**
 * [AUDIT-1] Structured security audit log.
 * Outputs a JSON line to Cloudflare Workers Tail logs for easy querying.
 */
function auditLog(event, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...details
  };
  console.log('[SECURITY_AUDIT]', JSON.stringify(entry));
}

/* ─────────────────────────── Constant-Time Comparison ─────────────────────────── */

/**
 * [TIMING-1] Constant-time string comparison using Web Crypto API (HMAC-SHA256).
 * Prevents timing side-channel attacks when comparing secrets.
 */
async function timingSafeEqual(a, b) {
  try {
    const enc = new TextEncoder();
    const aBytes = enc.encode(a);
    const bBytes = enc.encode(b);

    const maxLen = Math.max(aBytes.length, bBytes.length);
    const aPadded = new Uint8Array(maxLen);
    const bPadded = new Uint8Array(maxLen);
    aPadded.set(aBytes);
    bPadded.set(bBytes);

    // HMAC-sign both with the same ephemeral key, then compare MACs
    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const [sigA, sigB] = await Promise.all([
      crypto.subtle.sign('HMAC', key, aPadded),
      crypto.subtle.sign('HMAC', key, bPadded)
    ]);

    const viewA = new Uint8Array(sigA);
    const viewB = new Uint8Array(sigB);
    let diff = 0;
    for (let i = 0; i < viewA.length; i++) {
      diff |= viewA[i] ^ viewB[i];
    }
    // Ensure original lengths match (reject padding bypass)
    return diff === 0 && aBytes.length === bBytes.length;
  } catch {
    return false;
  }
}

/* ─────────────────────────── AES-GCM Token Encryption ─────────────────────────── */

/**
 * [CRYPTO-1] Derive a 256-bit AES-GCM key from ADMIN_PASSWORD via PBKDF2.
 */
async function deriveEncryptionKey(adminPassword) {
  const enc = new TextEncoder();
  const rawKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(adminPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('tg-bot-gateway-kv-salt-v1'),
      iterations: 100_000,
      hash: 'SHA-256'
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * [CRYPTO-1] Encrypt plaintext string -> base64 ciphertext (IV prepended).
 */
async function encryptValue(plaintext, adminPassword) {
  try {
    const key = await deriveEncryptionKey(adminPassword);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    );
    const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuf), iv.byteLength);
    return btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.error('[CRYPTO] encryptValue failed:', e.message);
    return null;
  }
}

/**
 * [CRYPTO-1] Decrypt base64 ciphertext -> plaintext string.
 */
async function decryptValue(b64Ciphertext, adminPassword) {
  try {
    const key = await deriveEncryptionKey(adminPassword);
    const combined = Uint8Array.from(atob(b64Ciphertext), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

/* ─────────────────────────── Utility Helpers ─────────────────────────── */

/** [CRED-2] Mask a Telegram Bot Token for safe display */
function maskToken(token) {
  if (!token || token.length < 12) return '***';
  return token.substring(0, 8) + '...' + token.slice(-4);
}

/** [CRED-2] Strip full token/secret from bot objects before sending to client */
function sanitizeBotsForClient(bots) {
  return bots.map(({ token, secretToken, ...rest }) => ({
    ...rest,
    token: maskToken(token),
    hasToken: !!token,
    secretToken: secretToken ? '***configured***' : ''
  }));
}

/**
 * [SSRF-1] Hardened SSRF validation.
 * Blocks: private/loopback/link-local/metadata CIDRs, hex/octal IP notation, IPv6-mapped.
 */
function validateWebhookUrl(urlStr) {
  if (!urlStr) return true;
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;

    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

    const blockedExact = ['localhost', '0.0.0.0', '::1', '::ffff:0:0'];
    if (blockedExact.includes(h)) return false;

    const blockedPrefixes = [
      '127.',            // loopback
      '10.',             // RFC-1918
      '192.168.',        // RFC-1918
      '169.254.',        // link-local / AWS metadata
      '100.64.',         // CGNAT
      '0.',              // 0.0.0.0/8
      '198.51.100.',     // TEST-NET-2
      '203.0.113.',      // TEST-NET-3
      '::ffff:127.',     // IPv4-mapped loopback
      '::ffff:10.',      // IPv4-mapped private
      '::ffff:192.168.',
      'fe80:',           // link-local IPv6
      'fc', 'fd',        // unique-local IPv6
    ];
    for (const prefix of blockedPrefixes) {
      if (h.startsWith(prefix)) return false;
    }

    // Block 172.16.0.0/12
    const ipv4Match = h.match(/^172\.(\d{1,3})\./);
    if (ipv4Match) {
      const octet = parseInt(ipv4Match[1], 10);
      if (octet >= 16 && octet <= 31) return false;
    }

    // Block hex/octal/decimal integer IP notation
    if (/^0x[0-9a-f]+$/i.test(h)) return false;
    if (/^[0-9]+$/.test(h)) return false;
    if (/^0\d+\./.test(h)) return false;

    // Block metadata endpoints
    if (h === 'metadata.google.internal') return false;

    return true;
  } catch {
    return false;
  }
}

/** [INJ-2] Validate Telegram API method name — alphanumeric only, no path traversal */
function validateMethodName(method) {
  return typeof method === 'string' && /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(method);
}

/* ─────────────────────────── Data Helpers (with AES-GCM & Memory Cache) ─────────────────────────── */

let cachedBots = null;
let lastKvFetchTime = 0;
const KV_CACHE_TTL_MS = 60 * 1000; // 60 seconds in-memory cache

/** [CRYPTO-1] Encrypt sensitive fields before KV storage. */
async function encryptBotForStorage(bot, adminPassword) {
  if (!adminPassword) return bot;
  const [encToken, encSecret] = await Promise.all([
    encryptValue(bot.token, adminPassword),
    bot.secretToken ? encryptValue(bot.secretToken, adminPassword) : Promise.resolve('')
  ]);
  return {
    ...bot,
    token: encToken || bot.token,
    secretToken: encSecret || bot.secretToken || '',
    _encrypted: true
  };
}

/** [CRYPTO-1] Decrypt sensitive fields from KV. Handles V1 (plaintext) and V2 (encrypted). */
async function decryptBotFromStorage(bot, adminPassword) {
  if (!bot._encrypted || !adminPassword) return bot;
  const [decToken, decSecret] = await Promise.all([
    decryptValue(bot.token, adminPassword),
    bot.secretToken ? decryptValue(bot.secretToken, adminPassword) : Promise.resolve('')
  ]);
  return {
    ...bot,
    token: decToken || bot.token,
    secretToken: decSecret || bot.secretToken || ''
  };
}

/**
 * [PERF-1] In-Memory Cached KV Fetch.
 * Worker isolate reuses memory across requests. Caching decrypted bots for 60s
 * cuts KV read operations (and potential billing) by >99.9%.
 */
async function getBotsList(env, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedBots && (now - lastKvFetchTime < KV_CACHE_TTL_MS)) {
    return cachedBots;
  }

  const adminPassword = env.ADMIN_PASSWORD || null;

  if (env.BOT_GATEWAY_KV) {
    try {
      const data = await env.BOT_GATEWAY_KV.get(KV_BOTS_KEY, { type: 'json' });
      if (data && Array.isArray(data)) {
        const decrypted = await Promise.all(data.map(b => decryptBotFromStorage(b, adminPassword)));
        cachedBots = decrypted;
        lastKvFetchTime = now;
        return cachedBots;
      }
      // Migration: try legacy V1 unencrypted key
      const legacyData = await env.BOT_GATEWAY_KV.get('BOTS_CONFIG', { type: 'json' });
      if (legacyData && Array.isArray(legacyData)) {
        auditLog('KV_LEGACY_READ', { note: 'Migrating from legacy BOTS_CONFIG key on next save.' });
        cachedBots = legacyData;
        lastKvFetchTime = now;
        return cachedBots;
      }
    } catch (e) {
      console.error('Failed to read from KV:', e);
    }
  }

  if (env.BOT_CONFIGS) {
    try {
      cachedBots = JSON.parse(env.BOT_CONFIGS);
      lastKvFetchTime = now;
      return cachedBots;
    } catch (e) {}
  }

  cachedBots = memoryBots;
  lastKvFetchTime = now;
  return memoryBots;
}

async function saveBotsList(env, bots) {
  const adminPassword = env.ADMIN_PASSWORD || null;
  const encryptedBots = adminPassword
    ? await Promise.all(bots.map(b => encryptBotForStorage(b, adminPassword)))
    : bots;

  memoryBots = bots;
  cachedBots = bots; // Immediately update memory cache
  lastKvFetchTime = Date.now();

  if (env.BOT_GATEWAY_KV) {
    try {
      await env.BOT_GATEWAY_KV.put(KV_BOTS_KEY, JSON.stringify(encryptedBots));
      // Clean up legacy V1 key after migration
      await env.BOT_GATEWAY_KV.delete('BOTS_CONFIG').catch(() => {});
    } catch (e) {
      console.error('Failed to write to KV:', e);
    }
  }
}

/**
 * [CRED-1] Auth check.
 * [URL-KEY] REMOVED: ?key= query param — credentials MUST only be sent via Authorization header.
 * [TIMING-1] Uses constant-time comparison.
 */
async function checkAdminAuth(request, env) {
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;

  const provided = authHeader.substring(7);
  return timingSafeEqual(provided, adminPassword);
}

/* ─────────────────────────── Rate Limiting (KV-backed, per IP) ─────────────────────────── */

async function checkLoginRateLimit(env, ip) {
  if (!env.BOT_GATEWAY_KV) {
    auditLog('RATE_LIMIT_DEGRADED', { ip, reason: 'KV not bound; rate limiting disabled' });
    return true;
  }
  const key = `rl:login:${ip}`;
  const now = Date.now();
  try {
    const data = await env.BOT_GATEWAY_KV.get(key, { type: 'json' });
    if (data && (now - data.windowStart) < RATE_LIMIT_WINDOW_MS) {
      if (data.count >= RATE_LIMIT_MAX_ATTEMPTS) {
        auditLog('AUTH_RATE_LIMITED', { ip, count: data.count });
        return false;
      }
      await env.BOT_GATEWAY_KV.put(
        key,
        JSON.stringify({ count: data.count + 1, windowStart: data.windowStart }),
        { expirationTtl: 900 }
      );
    } else {
      await env.BOT_GATEWAY_KV.put(
        key,
        JSON.stringify({ count: 1, windowStart: now }),
        { expirationTtl: 900 }
      );
    }
    return true;
  } catch (e) {
    console.error('Rate limit KV error:', e);
    return true;
  }
}

async function resetLoginRateLimit(env, ip) {
  if (!env.BOT_GATEWAY_KV) return;
  try {
    await env.BOT_GATEWAY_KV.delete(`rl:login:${ip}`);
  } catch (e) {}
}

/* ─────────────────────────── Admin Handler ─────────────────────────── */

async function handleAdminApi(path, request, env, corsHeaders) {

  // ── Login ──────────────────────────────────────────────────────────────
  if (path === '/api/admin/login' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    const allowed = await checkLoginRateLimit(env, ip);
    if (!allowed) {
      return new Response(JSON.stringify({
        success: false,
        error: '登录尝试次数过多，请 15 分钟后重试'
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '900', ...corsHeaders }
      });
    }

    const adminPassword = env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return new Response(JSON.stringify({
        success: false,
        error: '服务器未配置 ADMIN_PASSWORD，请通过 wrangler secret put ADMIN_PASSWORD 设置'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const body = await request.json().catch(() => ({}));
    const pass = body.password || '';

    // [TIMING-1] Constant-time comparison
    const isCorrect = await timingSafeEqual(pass, adminPassword);

    if (isCorrect) {
      await resetLoginRateLimit(env, ip);
      auditLog('AUTH_SUCCESS', { ip });
      return new Response(JSON.stringify({ success: true, message: 'Authenticated' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    auditLog('AUTH_FAILED', { ip, route: '/api/admin/login' });
    return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── Auth Guard for all other /api/admin/* ──────────────────────────────
  if (!(await checkAdminAuth(request, env))) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    auditLog('AUTH_FAILED', { ip, route: path });
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized. Invalid Password.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── GET /api/admin/bots ────────────────────────────────────────────────
  if (path === '/api/admin/bots' && request.method === 'GET') {
    const bots = await getBotsList(env);
    return new Response(JSON.stringify({
      success: true,
      bots: sanitizeBotsForClient(bots),
      kvBound: !!env.BOT_GATEWAY_KV,
      storage: env.BOT_GATEWAY_KV ? 'Cloudflare KV (AES-256-GCM Encrypted)' : 'Memory / Fallback'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── POST /api/admin/bots (Add / Update Bot) ───────────────────────────
  if (path === '/api/admin/bots' && request.method === 'POST') {
    const data = await request.json().catch(() => ({}));

    if (!data.name || !data.token || !data.alias) {
      return new Response(JSON.stringify({ success: false, error: '名称、Token、别名(Alias)为必填项' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (data.webhookUrl && !validateWebhookUrl(data.webhookUrl)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Webhook URL 必须使用 HTTPS 协议，且不能指向私有/内网/保留地址'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (!data.secretToken) {
      auditLog('BOT_NO_SECRET_TOKEN', {
        alias: data.alias,
        note: 'proxy and webhook routes will be inaccessible until a Secret Token is set'
      });
    }

    let bots = await getBotsList(env);
    const existingIndex = bots.findIndex(b => b.id === data.id);

    const aliasExist = bots.find(b => b.alias === data.alias && b.id !== data.id);
    if (aliasExist) {
      return new Response(JSON.stringify({ success: false, error: `别名 /proxy/${data.alias} 已存在，请更换` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (existingIndex >= 0) {
      const existing = bots[existingIndex];
      // [CRED-2] Preserve original if client echoes masked/placeholder values back
      const newToken = data.token.includes('...') ? existing.token : data.token;
      const newSecret = data.secretToken === '***configured***' ? existing.secretToken : (data.secretToken || '');
      bots[existingIndex] = {
        ...existing,
        name: data.name,
        token: newToken,
        alias: data.alias,
        webhookUrl: data.webhookUrl || '',
        secretToken: newSecret,
        updatedAt: new Date().toISOString()
      };
    } else {
      bots.push({
        id: 'bot_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: data.name,
        token: data.token,
        alias: data.alias,
        webhookUrl: data.webhookUrl || '',
        secretToken: data.secretToken || '',
        createdAt: new Date().toISOString()
      });
    }

    await saveBotsList(env, bots);
    return new Response(JSON.stringify({ success: true, bots: sanitizeBotsForClient(bots) }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── DELETE /api/admin/bots/:id ─────────────────────────────────────────
  if (path.startsWith('/api/admin/bots/') && request.method === 'DELETE') {
    const id = path.replace('/api/admin/bots/', '');
    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing bot id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    let bots = await getBotsList(env);
    bots = bots.filter(b => b.id !== id);
    await saveBotsList(env, bots);
    auditLog('BOT_DELETED', { botId: id });
    return new Response(JSON.stringify({ success: true, message: 'Bot deleted' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── POST /api/admin/test (Telegram API Tester) ─────────────────────────
  if (path === '/api/admin/test' && request.method === 'POST') {
    const { botId, method, payload } = await request.json().catch(() => ({}));

    if (!validateMethodName(method)) {
      return new Response(JSON.stringify({ success: false, error: '无效的 API Method 名称（仅允许字母数字）' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const bots = await getBotsList(env);
    const bot = bots.find(b => b.id === botId);

    if (!bot) {
      return new Response(JSON.stringify({ success: false, error: '未找到指定机器人' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const tgUrl = `https://api.telegram.org/bot${bot.token}/${method}`;
    const tgRes = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });

    const resJson = await tgRes.json();
    return new Response(JSON.stringify(resJson), {
      status: tgRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid Admin Endpoint' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

/* ─────────────────────────── Direct Proxy: /bot<TOKEN>/<METHOD> ─────────────────────────── */

async function handleDirectProxy(path, url, request, corsHeaders, env) {
  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const isPublic = env.ENABLE_PUBLIC_GATEWAY === 'true' || env.ENABLE_PUBLIC_GATEWAY === true;
  if (!isPublic) {
    const match = path.match(/^\/bot([^/]+)/);
    if (match) {
      const token = match[1];
      const bots = await getBotsList(env);
      const isAllowed = bots.some(b => b.token === token);
      if (!isAllowed) {
        auditLog('PROXY_UNREGISTERED_TOKEN', { route: path });
        return new Response(JSON.stringify({ error: 'Gateway is private. Token not registered.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
  }

  const targetUrl = `https://api.telegram.org${path}${url.search}`;
  const headers = new Headers(request.headers);
  headers.set('Host', 'api.telegram.org');

  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers,
    body: (request.method !== 'GET' && request.method !== 'HEAD') ? request.body : null,
    redirect: 'follow'
  });

  const response = await fetch(proxyReq);
  const newHeaders = new Headers(response.headers);
  Object.keys(corsHeaders).forEach(k => newHeaders.set(k, corsHeaders[k]));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/* ─────────────────────────── Alias Proxy: /proxy/<ALIAS>/<METHOD> ─────────────────────────── */

async function handleAliasProxy(path, url, request, env, corsHeaders) {
  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const parts = path.split('/').filter(Boolean);
  if (parts.length < 3) {
    return new Response(JSON.stringify({ error: 'Invalid Proxy Path format. Expected /proxy/<alias>/<method>' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const alias = parts[1];
  const method = parts.slice(2).join('/');

  const bots = await getBotsList(env);
  const bot = bots.find(b => b.alias === alias);

  if (!bot) {
    return new Response(JSON.stringify({ error: `Bot with alias '/proxy/${alias}' not found` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (!bot.secretToken) {
    auditLog('PROXY_LOCKED_NO_SECRET', { alias });
    return new Response(JSON.stringify({
      error: 'This proxy route is locked. Please configure a Secret Token for this bot in the gateway dashboard.'
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // [TIMING-1] Constant-time comparison for secret validation
  const authHeader = request.headers.get('Authorization') || '';
  const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';

  const bySecret = await timingSafeEqual(secretHeader, bot.secretToken);
  const byBearer = authHeader.startsWith('Bearer ')
    && await timingSafeEqual(authHeader.substring(7), bot.secretToken);
  const isAuthorized = bySecret || byBearer;

  if (!isAuthorized) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    auditLog('PROXY_AUTH_FAILED', { ip, alias, route: path });
    return new Response(JSON.stringify({ error: 'Unauthorized. Invalid Secret Token.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const targetUrl = `https://api.telegram.org/bot${bot.token}/${method}${url.search}`;
  const headers = new Headers(request.headers);
  headers.set('Host', 'api.telegram.org');

  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers,
    body: (request.method !== 'GET' && request.method !== 'HEAD') ? request.body : null,
    redirect: 'follow'
  });

  const response = await fetch(proxyReq);
  const newHeaders = new Headers(response.headers);
  Object.keys(corsHeaders).forEach(k => newHeaders.set(k, corsHeaders[k]));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/* ─────────────────────────── Webhook Dispatcher: /webhook/<ALIAS> ─────────────────────────── */

async function handleWebhookDispatch(path, request, env) {
  const alias = path.replace('/webhook/', '');
  const bots = await getBotsList(env);
  const bot = bots.find(b => b.alias === alias);

  if (!bot) {
    return new Response(JSON.stringify({ error: 'Bot alias not found' }), { status: 404 });
  }

  if (!bot.secretToken) {
    auditLog('WEBHOOK_LOCKED_NO_SECRET', { alias });
    return new Response(JSON.stringify({
      error: 'Webhook endpoint is locked. Configure a Secret Token for this bot to enable webhook ingestion.'
    }), { status: 403 });
  }

  const reqSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';

  // [TIMING-1] Constant-time comparison for webhook secret
  const isValid = await timingSafeEqual(reqSecret, bot.secretToken);
  if (!isValid) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    auditLog('WEBHOOK_AUTH_FAILED', { ip, alias });
    return new Response(JSON.stringify({ error: 'Unauthorized secret token' }), { status: 403 });
  }

  if (bot.webhookUrl) {
    try {
      const payload = await request.clone().text();
      const forwardHeaders = new Headers();
      forwardHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
      forwardHeaders.set('X-Telegram-Bot-Api-Secret-Token', bot.secretToken);

      await fetch(bot.webhookUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: payload
      });
    } catch (e) {
      console.error(`Failed to forward webhook to ${bot.webhookUrl}:`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, forwarded: !!bot.webhookUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
