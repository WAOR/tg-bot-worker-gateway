import { renderDashboardHtml } from './ui.js';

// In-Memory Storage Fallback if KV is not bound
let memoryBots = [
  {
    id: 'demo-1',
    name: '示例机器人',
    token: '123456789:AAExxxxxxxxDemoTokenXXXXXXXXX',
    alias: 'demobot',
    webhookUrl: '',
    secretToken: '',
    createdAt: new Date().toISOString()
  }
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
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
        return handleAdminApi(path, request, env, corsHeaders);
      }

      // 3. Direct Proxy Route: /bot<TOKEN>/<METHOD>
      if (path.startsWith('/bot')) {
        return handleDirectProxy(path, url, request, corsHeaders);
      }

      // 4. Alias Gateway Proxy Route: /proxy/<ALIAS>/<METHOD>
      if (path.startsWith('/proxy/')) {
        return handleAliasProxy(path, url, request, env, corsHeaders);
      }

      // 5. Telegram Webhook Receiver & Dispatcher: /webhook/<ALIAS>
      if (path.startsWith('/webhook/')) {
        return handleWebhookDispatch(path, request, env);
      }

      return new Response(JSON.stringify({ error: '404 Not Found', path }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

/* --- Data Helpers --- */
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

function checkAdminAuth(request, env) {
  const adminPassword = env.ADMIN_PASSWORD || 'admin';
  const authHeader = request.headers.get('Authorization') || '';
  const url = new URL(request.url);
  const keyParam = url.searchParams.get('key');

  if (keyParam === adminPassword) return true;
  if (authHeader.startsWith('Bearer ') && authHeader.substring(7) === adminPassword) {
    return true;
  }
  return false;
}

/* --- Admin Handler --- */
async function handleAdminApi(path, request, env, corsHeaders) {
  // Login Endpoint
  if (path === '/api/admin/login' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const pass = body.password || '';
    const adminPassword = env.ADMIN_PASSWORD || 'admin';
    if (pass === adminPassword) {
      return new Response(JSON.stringify({ success: true, message: 'Authenticated' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // Check Auth for all other /api/admin/*
  if (!checkAdminAuth(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized. Invalid Password.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // GET /api/admin/bots
  if (path === '/api/admin/bots' && request.method === 'GET') {
    const bots = await getBotsList(env);
    return new Response(JSON.stringify({
      success: true,
      bots,
      kvBound: !!env.BOT_GATEWAY_KV,
      storage: env.BOT_GATEWAY_KV ? 'Cloudflare KV' : 'Memory / Fallback'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // POST /api/admin/bots (Add / Update Bot)
  if (path === '/api/admin/bots' && request.method === 'POST') {
    const data = await request.json().catch(() => ({}));
    if (!data.name || !data.token || !data.alias) {
      return new Response(JSON.stringify({ success: false, error: '名称、Token、别名(Alias)为必填项' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    let bots = await getBotsList(env);
    const existingIndex = bots.findIndex(b => b.id === data.id);

    // Check alias conflict
    const aliasExist = bots.find(b => b.alias === data.alias && b.id !== data.id);
    if (aliasExist) {
      return new Response(JSON.stringify({ success: false, error: `别名 /proxy/${data.alias} 已存在，请更换` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (existingIndex >= 0) {
      bots[existingIndex] = {
        ...bots[existingIndex],
        name: data.name,
        token: data.token,
        alias: data.alias,
        webhookUrl: data.webhookUrl || '',
        secretToken: data.secretToken || '',
        updatedAt: new Date().toISOString()
      };
    } else {
      const newBot = {
        id: 'bot_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: data.name,
        token: data.token,
        alias: data.alias,
        webhookUrl: data.webhookUrl || '',
        secretToken: data.secretToken || '',
        createdAt: new Date().toISOString()
      };
      bots.push(newBot);
    }

    await saveBotsList(env, bots);
    return new Response(JSON.stringify({ success: true, bots }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // DELETE /api/admin/bots/:id
  if (path.startsWith('/api/admin/bots/') && request.method === 'DELETE') {
    const id = path.replace('/api/admin/bots/', '');
    let bots = await getBotsList(env);
    bots = bots.filter(b => b.id !== id);
    await saveBotsList(env, bots);
    return new Response(JSON.stringify({ success: true, message: 'Bot deleted' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // POST /api/admin/test (Telegram API Tester)
  if (path === '/api/admin/test' && request.method === 'POST') {
    const { botId, method, payload } = await request.json().catch(() => ({}));
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

/* --- Direct Proxy: /bot<TOKEN>/<METHOD> --- */
async function handleDirectProxy(path, url, request, corsHeaders) {
  const targetUrl = `https://api.telegram.org${path}${url.search}`;
  
  const headers = new Headers(request.headers);
  headers.set('Host', 'api.telegram.org');

  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers: headers,
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

/* --- Alias Proxy: /proxy/<ALIAS>/<METHOD> --- */
async function handleAliasProxy(path, url, request, env, corsHeaders) {
  // Path format: /proxy/{alias}/{method}
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

  const targetUrl = `https://api.telegram.org/bot${bot.token}/${method}${url.search}`;
  const headers = new Headers(request.headers);
  headers.set('Host', 'api.telegram.org');

  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers: headers,
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

/* --- Webhook Dispatcher: /webhook/<ALIAS> --- */
async function handleWebhookDispatch(path, request, env) {
  const alias = path.replace('/webhook/', '');
  const bots = await getBotsList(env);
  const bot = bots.find(b => b.alias === alias);

  if (!bot) {
    return new Response(JSON.stringify({ error: 'Bot alias not found' }), { status: 404 });
  }

  // Validate Secret Token header if bot has secretToken set
  if (bot.secretToken) {
    const reqSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (reqSecret !== bot.secretToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized secret token' }), { status: 403 });
    }
  }

  // Forward to target webhookUrl if configured
  if (bot.webhookUrl) {
    try {
      const payload = await request.clone().text();
      const forwardHeaders = new Headers();
      forwardHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
      if (bot.secretToken) {
        forwardHeaders.set('X-Telegram-Bot-Api-Secret-Token', bot.secretToken);
      }

      await fetch(bot.webhookUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: payload
      });
    } catch (e) {
      console.error(`Failed to forward webhook to ${bot.webhookUrl}:`, e);
    }
  }

  // Return success to Telegram
  return new Response(JSON.stringify({ ok: true, forwarded: !!bot.webhookUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
