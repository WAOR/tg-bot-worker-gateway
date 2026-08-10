export function renderDashboardHtml(baseUrl = "") {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Bot Gateway Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #2AABEE;
      --primary-hover: #229ed9;
      --accent: #6366f1;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --code-bg: #090d16;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: radial-gradient(circle at top right, #1e1b4b, #0f172a 50%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    header {
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 1rem 2rem;
    }

    .nav-container {
      max-width: 1280px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 700;
      font-size: 1.25rem;
      color: var(--text-main);
    }

    .brand-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(42, 171, 238, 0.3);
    }

    .brand-icon svg {
      width: 20px;
      height: 20px;
      fill: #fff;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: var(--success);
      font-size: 0.85rem;
      font-weight: 500;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
    }

    /* Main Layout */
    main {
      flex: 1;
      max-width: 1280px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem;
    }

    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.25rem 1.5rem;
      backdrop-filter: blur(8px);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .stat-title {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-main);
      word-break: break-all;
    }

    .stat-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.35rem;
    }

    /* Section Header */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
    }

    .section-title {
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--text-main);
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1.2rem;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      outline: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary), #0284c7);
      color: #fff;
      box-shadow: 0 4px 14px rgba(42, 171, 238, 0.25);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, var(--primary-hover), #0369a1);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
      border: 1px solid var(--card-border);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .btn-sm {
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      border-radius: 8px;
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.25);
    }

    /* Cards & Bot List */
    .bot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 1.5rem;
    }

    .bot-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 1.5rem;
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }

    .bot-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--primary), var(--accent));
    }

    .bot-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .bot-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .bot-avatar {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(42, 171, 238, 0.15);
      border: 1px solid rgba(42, 171, 238, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: var(--primary);
      font-size: 1.1rem;
    }

    .bot-name {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-main);
    }

    .bot-alias {
      font-size: 0.8rem;
      color: var(--primary);
      font-family: 'JetBrains Mono', monospace;
      background: rgba(42, 171, 238, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      margin-top: 2px;
      display: inline-block;
    }

    .endpoint-box {
      background: var(--code-bg);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 0.75rem;
      margin: 1rem 0;
    }

    .endpoint-title {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
      display: flex;
      justify-content: space-between;
    }

    .endpoint-url {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #7dd3fc;
      word-break: break-all;
      user-select: all;
    }

    .bot-meta {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 1.25rem;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
    }

    .meta-val {
      color: var(--text-main);
      font-family: 'JetBrains Mono', monospace;
    }

    .bot-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      background: var(--card-bg);
      border: 1px dashed var(--card-border);
      border-radius: 20px;
      grid-column: 1 / -1;
    }

    .empty-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .empty-desc {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 1.5rem;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25 ease;
    }

    .modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .modal {
      background: #1e293b;
      border: 1px solid var(--card-border);
      border-radius: 20px;
      width: 90%;
      max-width: 560px;
      max-height: 90vh;
      overflow-y: auto;
      padding: 1.75rem;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      transform: translateY(15px);
      transition: transform 0.25s ease;
    }

    .modal-overlay.active .modal {
      transform: translateY(0);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .modal-title {
      font-size: 1.25rem;
      font-weight: 600;
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.25rem;
    }

    .modal-close:hover {
      color: var(--text-main);
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    .form-control {
      width: 100%;
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.75rem 1rem;
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s ease;
    }

    .form-control:focus {
      border-color: var(--primary);
    }

    textarea.form-control {
      min-height: 100px;
      resize: vertical;
      font-family: 'JetBrains Mono', monospace;
    }

    .form-help {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.35rem;
    }

    .response-preview {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #a7f3d0;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Auth Box */
    .auth-box {
      max-width: 400px;
      margin: 4rem auto;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2rem;
      text-align: center;
    }

    .auth-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }

    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #1e293b;
      color: var(--text-main);
      border: 1px solid var(--card-border);
      padding: 0.85rem 1.25rem;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
      z-index: 300;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.9rem;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>
  <header>
    <div class="nav-container">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <span>TG Bot Gateway</span>
      </div>
      <div class="header-actions">
        <div class="status-badge">
          <span class="status-dot"></span>
          <span id="gateway-status-text">Worker Online</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="logoutAdmin()">退出登录</button>
      </div>
    </div>
  </header>

  <main id="app-content">
    <!-- Auth Screen -->
    <div id="auth-screen" class="auth-box" style="display: none;">
      <div class="brand-icon" style="margin: 0 auto 1rem auto; width: 48px; height: 48px;">
        <svg viewBox="0 0 24 24" style="width:28px;height:28px;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      </div>
      <h2 class="auth-title">网关后台登录</h2>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">请输入 ADMIN_PASSWORD 管理密码</p>
      <div class="form-group">
        <input type="password" id="admin-pass-input" class="form-control" placeholder="管理员密码 (默认: admin)" value="admin" onkeyup="if(event.key==='Enter') loginAdmin()">
        <div class="form-help" style="margin-top: 0.5rem; color: #7dd3fc;">💡 提示：默认本地/初始密码为 <code>admin</code></div>
      </div>
      <button class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 0.5rem;" onclick="loginAdmin()">验证登录</button>
      <div id="auth-error-msg" style="color: var(--danger); font-size: 0.85rem; margin-top: 0.75rem; display: none;"></div>
    </div>

    <!-- Dashboard Screen -->
    <div id="dashboard-screen" style="display: none;">
      <!-- Stats -->
      <div class="grid-stats">
        <div class="stat-card">
          <div class="stat-title">已配置机器人</div>
          <div class="stat-value" id="stat-bot-count">0</div>
          <div class="stat-sub">当前运行网关代理数量</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">数据存储模式</div>
          <div class="stat-value" id="stat-storage-type" style="font-size: 1.25rem;">Cloudflare KV</div>
          <div class="stat-sub" id="stat-storage-desc">持久化存储激活中</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">网关域名入口</div>
          <div class="stat-value" style="font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;" id="stat-base-url">--</div>
          <div class="stat-sub"><a href="#" onclick="copyText(document.getElementById('stat-base-url').innerText)" style="color: var(--primary); text-decoration: none;">点击复制基础域名</a></div>
        </div>
      </div>

      <!-- Bots Section -->
      <div class="section-header">
        <h2 class="section-title">机器人列表 (Bots)</h2>
        <button class="btn btn-primary" onclick="openAddBotModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          添加 Telegram Bot
        </button>
      </div>

      <div class="bot-grid" id="bot-list">
        <!-- Rendered via JS -->
      </div>
    </div>
  </main>

  <!-- Add/Edit Bot Modal -->
  <div class="modal-overlay" id="bot-modal">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title" id="modal-bot-title">添加 Telegram 机器人</h3>
        <button class="modal-close" onclick="closeModal('bot-modal')">&times;</button>
      </div>
      <form id="bot-form" onsubmit="saveBot(event)">
        <input type="hidden" id="form-bot-id">
        <div class="form-group">
          <label class="form-label">机器人名称 (Name)</label>
          <input type="text" id="form-bot-name" class="form-control" placeholder="例如：通知机器人" required>
        </div>
        <div class="form-group">
          <label class="form-label">Bot Token (从 @BotFather 获取)</label>
          <input type="text" id="form-bot-token" class="form-control" placeholder="例如：123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ" required>
          <div class="form-help">网关将自动代理对此 Token 的请求</div>
        </div>
        <div class="form-group">
          <label class="form-label">自定义别名 / Slug (Alias)</label>
          <input type="text" id="form-bot-alias" class="form-control" placeholder="例如：mybot1" pattern="[a-zA-Z0-9_-]+" required>
          <div class="form-help">生成安全代理路径: /proxy/mybot1/sendMessage</div>
        </div>
        <div class="form-group">
          <label class="form-label">转发目标 Webhook URL (选填)</label>
          <input type="url" id="form-bot-webhook" class="form-control" placeholder="https://your-backend.com/api/telegram-hook">
          <div class="form-help">若配置，网关会将 Telegram 调用的 Webhook 实时转派至此地址</div>
        </div>
        <div class="form-group">
          <label class="form-label">Secret Token 验证密钥 (选填)</label>
          <input type="text" id="form-bot-secret" class="form-control" placeholder="自定义安全密钥">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('bot-modal')">取消</button>
          <button type="submit" class="btn btn-primary">保存配置</button>
        </div>
      </form>
    </div>
  </div>

  <!-- API Tester Modal -->
  <div class="modal-overlay" id="tester-modal">
    <div class="modal" style="max-width: 680px;">
      <div class="modal-header">
        <h3 class="modal-title">⚡ Telegram Bot API 在线测试器</h3>
        <button class="modal-close" onclick="closeModal('tester-modal')">&times;</button>
      </div>
      <div class="form-group">
        <label class="form-label">选择机器人</label>
        <select id="test-bot-select" class="form-control" onchange="onTestBotChange()"></select>
      </div>
      <div class="form-group">
        <label class="form-label">调用 Method</label>
        <select id="test-method-select" class="form-control" onchange="onTestMethodChange()">
          <option value="getMe">getMe (获取机器人信息)</option>
          <option value="getWebhookInfo">getWebhookInfo (获取 Webhook 状态)</option>
          <option value="sendMessage">sendMessage (发送消息)</option>
          <option value="deleteWebhook">deleteWebhook (删除 Webhook)</option>
          <option value="custom">自定义 Method...</option>
        </select>
      </div>
      <div class="form-group" id="custom-method-group" style="display: none;">
        <label class="form-label">自定义 Method 名称</label>
        <input type="text" id="test-custom-method" class="form-control" placeholder="例如: sendPhoto">
      </div>
      <div class="form-group">
        <label class="form-label">请求 Payload (JSON 格式)</label>
        <textarea id="test-payload" class="form-control" placeholder="{}"></textarea>
      </div>
      <button class="btn btn-primary" style="width: 100%; justify-content: center; margin-bottom: 1rem;" onclick="runApiTest()">发起请求</button>
      
      <div class="form-group">
        <label class="form-label">网关响应 (Response)</label>
        <div class="response-preview" id="test-response-preview">等待测试...</div>
      </div>
    </div>
  </div>

  <!-- Set Webhook Quick Modal -->
  <div class="modal-overlay" id="webhook-modal">
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">🔗 部署 / 绑定 Webhook 到网关</h3>
        <button class="modal-close" onclick="closeModal('webhook-modal')">&times;</button>
      </div>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">
        将此 Telegram 机器人的 Webhook 注册到本 Workers 网关，所有 Telegram 消息将实时推送至网关进行代理转发。
      </p>
      <div class="form-group">
        <label class="form-label">网关 Webhook 接收地址</label>
        <div class="endpoint-box">
          <div class="endpoint-url" id="webhook-target-url">--</div>
        </div>
      </div>
      <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
        <button type="button" class="btn btn-danger" onclick="deleteRemoteWebhook()">解绑 Webhook</button>
        <button type="button" class="btn btn-primary" onclick="setRemoteWebhook()">一键向 Telegram 注册 Webhook</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast">操作成功</div>

  <script>
    const BASE_URL = window.location.origin;
    let botsData = [];
    let currentTestBot = null;
    let currentWebhookBot = null;

    function getAdminPassword() {
      return localStorage.getItem('tg_gateway_admin_pass') || '';
    }

    function setAdminPassword(pass) {
      localStorage.setItem('tg_gateway_admin_pass', pass);
    }

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.style.borderColor = isError ? 'var(--danger)' : 'var(--card-border)';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    async function apiRequest(endpoint, method = 'GET', data = null) {
      const headers = {
        'Authorization': 'Bearer ' + getAdminPassword(),
        'Content-Type': 'application/json'
      };
      const opts = { method, headers };
      if (data) opts.body = JSON.stringify(data);

      try {
        const res = await fetch(endpoint, opts);
        if (res.status === 401) {
          showAuthScreen();
          throw new Error('密码错误或未登录');
        }
        return await res.json();
      } catch (err) {
        throw err;
      }
    }

    function showAuthScreen() {
      document.getElementById('auth-screen').style.display = 'block';
      document.getElementById('dashboard-screen').style.display = 'none';
    }

    function showDashboardScreen() {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('dashboard-screen').style.display = 'block';
    }

    async function loginAdmin() {
      const passInput = document.getElementById('admin-pass-input');
      const errorDiv = document.getElementById('auth-error-msg');
      const pass = passInput.value.trim();
      errorDiv.style.display = 'none';

      if (!pass) {
        errorDiv.innerText = '请输入密码';
        errorDiv.style.display = 'block';
        return;
      }

      setAdminPassword(pass);

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          loadDashboard();
        } else {
          errorDiv.innerText = '密码验证失败！默认初始密码为: admin';
          errorDiv.style.display = 'block';
        }
      } catch (err) {
        errorDiv.innerText = '连接服务器失败: ' + err.message;
        errorDiv.style.display = 'block';
      }
    }

    function logoutAdmin() {
      localStorage.removeItem('tg_gateway_admin_pass');
      showAuthScreen();
    }

    async function loadDashboard() {
      try {
        const res = await apiRequest('/api/admin/bots');
        if (res && res.success) {
          showDashboardScreen();
          botsData = res.bots || [];
          renderBots(botsData);
          document.getElementById('stat-bot-count').innerText = botsData.length;
          document.getElementById('stat-base-url').innerText = BASE_URL;
          document.getElementById('stat-storage-type').innerText = res.storage || 'Cloudflare KV';
          document.getElementById('stat-storage-desc').innerText = res.kvBound ? 'KV 持久化运行中' : '内存/环境变量临时模式';
        }
      } catch (e) {
        // Handled in apiRequest if 401
      }
    }

    function renderBots(bots) {
      const container = document.getElementById('bot-list');
      if (!bots || bots.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-title">尚未配置任何 Telegram 机器人</div>
            <div class="empty-desc">点击右上角“添加 Telegram Bot”，配置 Token 与路由别名即可开启代理网关。</div>
            <button class="btn btn-primary" onclick="openAddBotModal()">立即添加</button>
          </div>
        \`;
        return;
      }

      container.innerHTML = bots.map(bot => {
        const proxyUrl = \`\${BASE_URL}/proxy/\${bot.alias}/sendMessage\`;
        const directUrl = \`\${BASE_URL}/bot\${bot.token.substring(0, 10)}.../sendMessage\`;
        return \`
          <div class="bot-card">
            <div>
              <div class="bot-head">
                <div class="bot-info">
                  <div class="bot-avatar">\${bot.name ? bot.name[0].toUpperCase() : 'B'}</div>
                  <div>
                    <div class="bot-name">\${escapeHtml(bot.name)}</div>
                    <span class="bot-alias">/proxy/\${bot.alias}</span>
                  </div>
                </div>
              </div>

              <div class="endpoint-box">
                <div class="endpoint-title">
                  <span>安全代理端点 (Proxy Endpoint)</span>
                  <a href="#" onclick="copyText('\${BASE_URL}/proxy/\${bot.alias}')" style="color: var(--primary); text-decoration: none;">复制</a>
                </div>
                <div class="endpoint-url">\${BASE_URL}/proxy/\${bot.alias}/{method}</div>
              </div>

              <div class="bot-meta">
                <div class="meta-row">
                  <span>Bot Token:</span>
                  <span class="meta-val">\${bot.token.substring(0, 8)}...:\${bot.token.slice(-4)}</span>
                </div>
                <div class="meta-row">
                  <span>Webhook 转发:</span>
                  <span class="meta-val">\${bot.webhookUrl ? escapeHtml(bot.webhookUrl) : '未配置'}</span>
                </div>
              </div>
            </div>

            <div class="bot-actions">
              <button class="btn btn-secondary btn-sm" onclick="openTesterModal('\${bot.id}')">⚡ 在线测试</button>
              <button class="btn btn-secondary btn-sm" onclick="openWebhookModal('\${bot.id}')">🔗 Webhook 部署</button>
              <button class="btn btn-secondary btn-sm" onclick="editBot('\${bot.id}')">✏️ 编辑</button>
              <button class="btn btn-danger btn-sm" onclick="deleteBot('\${bot.id}')">🗑️ 删除</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function openAddBotModal() {
      document.getElementById('modal-bot-title').innerText = '添加 Telegram 机器人';
      document.getElementById('bot-form').reset();
      document.getElementById('form-bot-id').value = '';
      openModal('bot-modal');
    }

    function editBot(id) {
      const bot = botsData.find(b => b.id === id);
      if (!bot) return;
      document.getElementById('modal-bot-title').innerText = '编辑 Telegram 机器人';
      document.getElementById('form-bot-id').value = bot.id;
      document.getElementById('form-bot-name').value = bot.name;
      document.getElementById('form-bot-token').value = bot.token;
      document.getElementById('form-bot-alias').value = bot.alias;
      document.getElementById('form-bot-webhook').value = bot.webhookUrl || '';
      document.getElementById('form-bot-secret').value = bot.secretToken || '';
      openModal('bot-modal');
    }

    async function saveBot(e) {
      e.preventDefault();
      const id = document.getElementById('form-bot-id').value;
      const payload = {
        id: id || undefined,
        name: document.getElementById('form-bot-name').value.trim(),
        token: document.getElementById('form-bot-token').value.trim(),
        alias: document.getElementById('form-bot-alias').value.trim(),
        webhookUrl: document.getElementById('form-bot-webhook').value.trim(),
        secretToken: document.getElementById('form-bot-secret').value.trim()
      };

      try {
        const res = await apiRequest('/api/admin/bots', 'POST', payload);
        if (res.success) {
          showToast('机器人保存成功！');
          closeModal('bot-modal');
          loadDashboard();
        } else {
          showToast(res.error || '保存失败', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function deleteBot(id) {
      if (!confirm('确定要删除该机器人配置吗？')) return;
      try {
        const res = await apiRequest('/api/admin/bots/' + id, 'DELETE');
        if (res.success) {
          showToast('删除成功');
          loadDashboard();
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    /* Tester Modal Functions */
    function openTesterModal(botId) {
      const select = document.getElementById('test-bot-select');
      select.innerHTML = botsData.map(b => \`<option value="\${b.id}">\${escapeHtml(b.name)} (@\${b.alias})</option>\`).join('');
      if (botId) select.value = botId;
      onTestBotChange();
      onTestMethodChange();
      openModal('tester-modal');
    }

    function onTestBotChange() {
      const id = document.getElementById('test-bot-select').value;
      currentTestBot = botsData.find(b => b.id === id);
    }

    function onTestMethodChange() {
      const method = document.getElementById('test-method-select').value;
      const customGroup = document.getElementById('custom-method-group');
      const payloadBox = document.getElementById('test-payload');

      if (method === 'custom') {
        customGroup.style.display = 'block';
        payloadBox.value = '{}';
      } else {
        customGroup.style.display = 'none';
        if (method === 'sendMessage') {
          payloadBox.value = JSON.stringify({ chat_id: 123456789, text: "Hello from Cloudflare Workers Gateway!" }, null, 2);
        } else {
          payloadBox.value = '{}';
        }
      }
    }

    async function runApiTest() {
      if (!currentTestBot) return;
      let method = document.getElementById('test-method-select').value;
      if (method === 'custom') {
        method = document.getElementById('test-custom-method').value.trim();
      }

      let payload = {};
      try {
        const val = document.getElementById('test-payload').value;
        if (val) payload = JSON.parse(val);
      } catch(e) {
        alert('Payload 必须是合法的 JSON 格式');
        return;
      }

      const resBox = document.getElementById('test-response-preview');
      resBox.innerText = '请求中...';

      try {
        const res = await apiRequest('/api/admin/test', 'POST', {
          botId: currentTestBot.id,
          method: method,
          payload: payload
        });
        resBox.innerText = JSON.stringify(res, null, 2);
      } catch (err) {
        resBox.innerText = '请求失败: ' + err.message;
      }
    }

    /* Webhook Modal */
    function openWebhookModal(botId) {
      currentWebhookBot = botsData.find(b => b.id === botId);
      if (!currentWebhookBot) return;
      const webhookEndpoint = \`\${BASE_URL}/webhook/\${currentWebhookBot.alias}\`;
      document.getElementById('webhook-target-url').innerText = webhookEndpoint;
      openModal('webhook-modal');
    }

    async function setRemoteWebhook() {
      if (!currentWebhookBot) return;
      const targetUrl = \`\${BASE_URL}/webhook/\${currentWebhookBot.alias}\`;
      try {
        const res = await apiRequest('/api/admin/test', 'POST', {
          botId: currentWebhookBot.id,
          method: 'setWebhook',
          payload: {
            url: targetUrl,
            secret_token: currentWebhookBot.secretToken || undefined
          }
        });
        showToast('Webhook 注册完成！');
        alert(JSON.stringify(res, null, 2));
        closeModal('webhook-modal');
      } catch (err) {
        showToast('设置失败: ' + err.message, true);
      }
    }

    async function deleteRemoteWebhook() {
      if (!currentWebhookBot) return;
      try {
        const res = await apiRequest('/api/admin/test', 'POST', {
          botId: currentWebhookBot.id,
          method: 'deleteWebhook',
          payload: { drop_pending_updates: true }
        });
        showToast('Webhook 已成功注销！');
        alert(JSON.stringify(res, null, 2));
        closeModal('webhook-modal');
      } catch (err) {
        showToast('解绑失败: ' + err.message, true);
      }
    }

    function openModal(id) {
      document.getElementById(id).classList.add('active');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    function copyText(text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板！');
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // Auto-init on page load
    window.addEventListener('DOMContentLoaded', () => {
      if (getAdminPassword()) {
        loadDashboard();
      } else {
        showAuthScreen();
      }
    });
  </script>
</body>
</html>`;
}
