import { renderDashboardHtml } from './ui.js';

// In-Memory Storage Fallback (used only when KV is not bound)
let memoryBots = [];

// [ABUSE-3] Maximum allowed request body size
const MAX_BODY_SIZE = 50 * 1024 * 1024; // 50 MB

// [AUTH-2] Rate limiting config
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

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
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
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

/* ─────────────────────────── Utility Helpers ─────────────────────────── */

/** [CRED-2] Mask a Telegram Bot Token for safe display */
function maskToken(token) {
  if (!token || token.length < 12) return '***';
  return token.substring(0, 8) + '...' + token.slice(-4);
}

/** [CRED-2] Strip full token from bot objects before sending to the client */
function sanitizeBotsForClient(bots) {
  return bots.map(({ token, ...rest }) => ({
    ...rest,
    token: maskToken(token),
    hasToken: !!token
  }));
}

/** [INJ-1] Validate webhookUrl: HTTPS only, block private/loopback addresses */
function validateWebhookUrl(urlStr) {
  if (!urlStr) return true; // Optional field — empty is fine
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    const blocked = [
      'localhost', '127.', '0.0.0.0', '::1', '169.254.',
      '10.', '192.168.',
      '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
      '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
      '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'
    ];
    if (blocked.some(p => h === p.replace(/\.$/, '') || h.startsWith(p))) return false;
    return true;
  } catch {
    return false;
  }
}

/** [INJ-2] Validate Telegram API method name — alphanumeric only, no path traversal */
function validateMethodName(method) {
  return typeof method === 'string' && /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(method);
}

/* ─────────────────────────── Data Helpers ─────────────────────────── */

async function getBotsList(env) {
  if (env.BOT_GATEWAY_KV) {
    try {
      const data = await env.BOT_GATEWAY_KV.get('BOTS_CONFIG', { type: 'json' });
      if (data && Array.isArray(data)) return data;
    } catch (e) {
      console.error('Failed to read from KV:', e);
    }
  }

  if (env.BOT_CONFIGS) {
    try {
      return JSON.parse(env.BOT_CONFIGS);
    } catch (e) {}
  }

  return memoryBots;
}

async function saveBotsList(env, bots) {
  memoryBots = bots;
  if (env.BOT_GATEWAY_KV) {
    try {
      await env.BOT_GATEWAY_KV.put('BOTS_CONFIG', JSON.stringify(bots));
    } catch (e) {
      console.error('Failed to write to KV:', e);
    }
  }
}

/** [CRED-1] Auth check — hard-fails if no password is configured */
function checkAdminAuth(request, env) {
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) return false; // No password configured → always deny

  const authHeader = request.headers.get('Authorization') || '';
  const url = new URL(request.url);
  const keyParam = url.searchParams.get('key');

  if (keyParam === adminPassword) return true;
  if (authHeader.startsWith('Bearer ') && authHeader.substring(7) === adminPassword) return true;
  return false;
}

/* ─────────────────────────── Rate Limiting (KV-backed, per IP) ─────────────────────────── */

async function checkLoginRateLimit(env, ip) {
  if (!env.BOT_GATEWAY_KV) return true; // No KV → degrade gracefully (log warning)
  const key = `rl:login:${ip}`;
  const now = Date.now();
  try {
    const data = await env.BOT_GATEWAY_KV.get(key, { type: 'json' });
    if (data && (now - data.windowStart) < RATE_LIMIT_WINDOW_MS) {
      if (data.count >= RATE_LIMIT_MAX_ATTEMPTS) return false; // Blocked
      await env.BOT_GATEWAY_KV.put(
        key,
        JSON.stringify({ count: data.count + 1, windowStart: data.windowStart }),
        { expirationTtl: 900 }
      );
    } else {
      // New window
      await env.BOT_GATEWAY_KV.put(
        key,
        JSON.stringify({ count: 1, windowStart: now }),
        { expirationTtl: 900 }
      );
    }
    return true;
  } catch (e) {
    console.error('Rate limit KV error:', e);
    return true; // On KV error, allow (fail open to avoid lockout)
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

    // [AUTH-2] Rate limiting: 5 attempts per 15 minutes per IP
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

    // [CRED-1] Hard-fail if server has no password configured
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

    if (pass === adminPassword) {
      await resetLoginRateLimit(env, ip); // Reset counter on success
      return new Response(JSON.stringify({ success: true, message: 'Authenticated' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── Auth Guard for all other /api/admin/* ──────────────────────────────
  if (!checkAdminAuth(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized. Invalid Password.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── GET /api/admin/bots ────────────────────────────────────────────────
  if (path === '/api/admin/bots' && request.method === 'GET') {
    const bots = await getBotsList(env);
    // [CRED-2] Mask bot tokens before returning to client
    return new Response(JSON.stringify({
      success: true,
      bots: sanitizeBotsForClient(bots),
      kvBound: !!env.BOT_GATEWAY_KV,
      storage: env.BOT_GATEWAY_KV ? 'Cloudflare KV' : 'Memory / Fallback'
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

    // [INJ-1] Validate webhookUrl
    if (data.webhookUrl && !validateWebhookUrl(data.webhookUrl)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Webhook URL 必须使用 HTTPS 协议，且不能指向私有/内网地址'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // [ABUSE-1] Warn if secretToken is absent (logged server-side)
    if (!data.secretToken) {
      console.warn(`[SECURITY WARNING] Bot alias="${data.alias}" has no secretToken — /proxy/${data.alias}/* and /webhook/${data.alias} will be inaccessible until a Secret Token is set.`);
    }

    let bots = await getBotsList(env);
    const existingIndex = bots.findIndex(b => b.id === data.id);

    // Alias conflict check
    const aliasExist = bots.find(b => b.alias === data.alias && b.id !== data.id);
    if (aliasExist) {
      return new Response(JSON.stringify({ success: false, error: `别名 /proxy/${data.alias} 已存在，请更换` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (existingIndex >= 0) {
      const existing = bots[existingIndex];
      // [CRED-2] If client sends back a masked token (contains '...'), preserve the original full token
      const newToken = data.token.includes('...') ? existing.token : data.token;
      bots[existingIndex] = {
        ...existing,
        name: data.name,
        token: newToken,
        alias: data.alias,
        webhookUrl: data.webhookUrl || '',
        secretToken: data.secretToken || '',
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
    return new Response(JSON.stringify({ success: true, message: 'Bot deleted' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // ── POST /api/admin/test (Telegram API Tester) ─────────────────────────
  if (path === '/api/admin/test' && request.method === 'POST') {
    const { botId, method, payload } = await request.json().catch(() => ({}));

    // [INJ-2] Validate method name — only safe alphanumeric Telegram method names
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
  // [ABUSE-3] Reject oversized payloads
  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const isPublic = env.ENABLE_PUBLIC_GATEWAY === 'true' || env.ENABLE_PUBLIC_GATEWAY === true;
  if (!isPublic) {
    // [CONFIG-1] Fixed: trailing slash is now optional in regex
    const match = path.match(/^\/bot([^/]+)/);
    if (match) {
      const token = match[1];
      const bots = await getBotsList(env);
      const isAllowed = bots.some(b => b.token === token);
      if (!isAllowed) {
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
  // [ABUSE-3] Reject oversized payloads
  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const parts = path.split('/').filter(Boolean); // ['proxy', 'alias', 'method', ...]
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

  // [ABUSE-1] Zero Trust default-deny: no secretToken = route is blocked
  if (!bot.secretToken) {
    return new Response(JSON.stringify({
      error: 'This proxy route is locked. Please configure a Secret Token for this bot in the gateway dashboard.'
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // Validate the supplied secret
  const authHeader = request.headers.get('Authorization') || '';
  const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  const isAuthorized =
    secretHeader === bot.secretToken ||
    (authHeader.startsWith('Bearer ') && authHeader.substring(7) === bot.secretToken);

  if (!isAuthorized) {
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

  // [ABUSE-2] Zero Trust default-deny: require secretToken on all webhook endpoints
  if (!bot.secretToken) {
    return new Response(JSON.stringify({
      error: 'Webhook endpoint is locked. Configure a Secret Token for this bot to enable webhook ingestion.'
    }), { status: 403 });
  }

  const reqSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (reqSecret !== bot.secretToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized secret token' }), { status: 403 });
  }

  if (bot.webhookUrl) {
    try {
      const payload = await request.clone().text();
      const forwardHeaders = new Headers();
      forwardHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
      // Always forward the secret token so the downstream server can verify
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
