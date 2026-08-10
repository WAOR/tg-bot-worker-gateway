# 🛡️ Telegram Bot Workers Gateway

> **高性能、零信任安全**的 Telegram Bot API 反向代理网关，部署于 Cloudflare Workers 全球边缘网络。
> 内置现代化 Web 管理界面，支持多 Bot 管理、Webhook 分发、AES-256-GCM 加密存储与完整的安全审计日志。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WAOR/tg-bot-worker-gateway)
![License](https://img.shields.io/github/license/WAOR/tg-bot-worker-gateway)

---

## ✨ 核心特性

| 特性 | 说明 |
| :--- | :--- |
| 🔒 **零信任安全架构** | 所有路由默认拒绝；Secret Token 未配置时代理路由自动锁定（403） |
| 🔐 **AES-256-GCM 加密存储** | Bot Token 与 Secret Token 经 PBKDF2 派生密钥加密后存入 KV，脱库数据无法直接还原 |
| ⏱️ **常数时间密码比较** | 所有密钥校验使用 HMAC-SHA256 常数时间比较，防止时序侧信道攻击 |
| 🌐 **强化 SSRF 防护** | 封锁私有/内网/链路本地/十六进制/八进制 IP，防止 Webhook URL 被利用进行 SSRF |
| 🧱 **HTTP 安全响应头** | 管理界面注入 CSP、X-Frame-Options、X-Content-Type-Options 等安全头 |
| 📋 **结构化安全审计日志** | AUTH_FAILED、PROXY_AUTH_FAILED、BOT_DELETED 等事件实时写入 Cloudflare Tail Logs |
| 🔑 **别名安全代理** | `/proxy/<alias>/<method>` 隐藏真实 Token，客户端只感知别名和 Secret Token |
| 🔗 **Webhook 实时分发** | 自动校验 `X-Telegram-Bot-Api-Secret-Token` 并转发至你的后端服务 |
| 💾 **灵活持久化** | 优先 Cloudflare KV；未配置时自动降级至内存/环境变量模式 |
| 🖥️ **可视化 Web 管理界面** | 内置深色主题管理后台，支持添加/编辑/删除 Bot、在线测试 API、一键绑定 Webhook |

---

## 🚀 部署指南

### 前置条件

- 一个 **Cloudflare 账号**（免费即可）
- Workers 免费套餐：100,000 请求/天，完全满足日常使用

---

### 方法一：一键部署（推荐新手）

1. 点击上方 **Deploy to Cloudflare Workers** 按钮
2. 授权并部署到你的 Cloudflare 账号
3. 部署成功后，**务必**按照下方「[首次必做：配置 ADMIN_PASSWORD](#-首次必做配置-admin_password)」完成安全配置

> [!WARNING]
> 一键部署后若不配置 `ADMIN_PASSWORD`，管理后台将拒绝所有登录请求（503）。这是有意为之的安全设计，不存在默认密码。

---

### 方法二：Wrangler CLI 手动部署

**① 克隆仓库**
```bash
git clone https://github.com/WAOR/tg-bot-worker-gateway.git
cd tg-bot-worker-gateway
npm install
```

**② 创建 KV 命名空间（推荐，用于持久化存储）**
```bash
npx wrangler kv namespace create BOT_GATEWAY_KV
```
将输出中的 `id` 值填入 `wrangler.jsonc`：
```jsonc
"kv_namespaces": [
  {
    "binding": "BOT_GATEWAY_KV",
    "id": "你的KV命名空间ID"   // ← 替换此处
  }
]
```

**③ 配置 ADMIN_PASSWORD（必须）**
```bash
npx wrangler secret put ADMIN_PASSWORD
# 输入你的管理员密码（建议 16 位以上随机字符串）
```

**④ 部署**
```bash
npx wrangler deploy
```

部署成功后，访问 `https://tg-bot-worker-gateway.<你的subdomain>.workers.dev` 即可打开管理界面。

---

### 方法三：GitHub Actions 自动部署

每次 `push` 到 `main` 分支时自动触发部署。

**① 在仓库设置中添加 Secrets**

进入仓库 → **Settings → Secrets and variables → Actions**，添加：

| Secret 名称 | 说明 | 获取方式 |
| :--- | :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌 | [Cloudflare 控制台](https://dash.cloudflare.com/profile/api-tokens) → 创建令牌 → 使用「编辑 Cloudflare Workers」模板 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID | Cloudflare 控制台右侧栏 |

**② 配置 ADMIN_PASSWORD（必须）**

在 Cloudflare 控制台的 Worker → **Settings → Variables → Secret Variables** 中添加 `ADMIN_PASSWORD`。

**③ 推送代码触发自动部署**
```bash
git push origin main
```

---

## 🔐 首次必做：配置 ADMIN_PASSWORD

> [!IMPORTANT]
> 这是最关键的安全步骤。不配置此变量，管理后台将无法登录。

**CLI 方式（推荐）：**
```bash
npx wrangler secret put ADMIN_PASSWORD
```
系统会提示输入密码，输入后回车确认。密码将以 Secret 形式加密存储，**不会出现在代码或日志中**。

**Cloudflare 控制台方式：**
1. 进入 [Cloudflare 控制台](https://dash.cloudflare.com) → Workers & Pages
2. 点击你的 Worker → **Settings → Variables**
3. 在 **Secret Variables** 区域点击「Add variable」
4. 名称填 `ADMIN_PASSWORD`，值填你的密码，点击「Encrypt & Save」

---

## ⚙️ 环境变量说明

| 变量名 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `ADMIN_PASSWORD` | **Secret** | ✅ | Web 管理后台登录密码。**必须**通过 `wrangler secret put` 或控制台 Secret Variables 设置，禁止明文写入 `wrangler.jsonc` |
| `BOT_GATEWAY_KV` | KV Namespace Binding | 推荐 | 机器人配置的 KV 持久化存储。Bot Token 与 Secret Token 以 **AES-256-GCM** 加密后存储 |
| `ENABLE_PUBLIC_GATEWAY` | Var | ❌ | 设为 `true` 时开放 `/bot<TOKEN>/*` 公开代理（默认 `false`，私有模式） |

> [!NOTE]
> `ADMIN_PASSWORD` 同时作为 KV 加密密钥的派生源（PBKDF2 + AES-256-GCM）。若修改此密码，需重新录入所有 Bot 配置，旧 KV 数据将无法解密。

---

## 📡 API 使用说明

### 1. 别名安全代理（强烈推荐）

隐藏真实 Bot Token，客户端只使用别名 + Secret Token 调用：

```bash
curl -X POST "https://<your-worker>.workers.dev/proxy/<alias>/sendMessage" \
     -H "X-Telegram-Bot-Api-Secret-Token: <你配置的 Secret Token>" \
     -H "Content-Type: application/json" \
     -d '{"chat_id": 123456789, "text": "Hello from Gateway!"}'
```

> [!WARNING]
> 未配置 Secret Token 的 Bot，其 `/proxy/<alias>/*` 路由**自动锁定（403）**，无法访问。这是零信任默认拒绝原则的体现。

### 2. 直连代理（兼容原始 Telegram API 路径）

直接替代 `https://api.telegram.org`，适用于无法修改现有代码的场景：

```bash
curl -X POST "https://<your-worker>.workers.dev/bot<BOT_TOKEN>/getMe" \
     -H "Content-Type: application/json"
```

> 默认为**私有模式**（`ENABLE_PUBLIC_GATEWAY=false`）：仅已在网关注册的 Token 可以通过此路径，未注册 Token 返回 403。

### 3. Webhook 接收与分发

**注册 Webhook 到网关（推荐在 Web 界面一键操作）：**

```bash
# 手动调用 Telegram API 将 Webhook 指向网关
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://<your-worker>.workers.dev/webhook/<alias>",
       "secret_token": "<你配置的 Secret Token>"
     }'
```

**网关会校验 `X-Telegram-Bot-Api-Secret-Token`，验证通过后自动转发至你配置的「Webhook 转发地址」。**

---

## 🔒 安全架构说明

本项目按照 **NIST SP 800-207 Zero Trust Architecture** 核心原则设计：

```
Telegram → [Workers 网关] → 你的后端服务器
              ↓
    ┌─────────────────────────────┐
    │ ① 身份验证（Bearer Header） │  Admin API 全部需要 Authorization: Bearer 校验
    │ ② 常数时间比较              │  HMAC-SHA256 防时序侧信道
    │ ③ 默认拒绝（无 Secret 锁定）│  未配置 Secret Token → 403
    │ ④ SSRF 防护                │  Webhook URL 严格校验，封锁私有地址
    │ ⑤ 数据加密                 │  AES-256-GCM + PBKDF2 100k 轮
    │ ⑥ 安全响应头               │  CSP / X-Frame-Options / nosniff
    │ ⑦ 审计日志                 │  结构化 JSON 写入 Tail Logs
    └─────────────────────────────┘
```

**查看安全审计日志（Cloudflare Tail Logs）：**
```bash
npx wrangler tail
```
所有安全事件均以 `[SECURITY_AUDIT]` 前缀输出，格式如：
```json
[SECURITY_AUDIT] {"ts":"2026-08-10T06:00:00.000Z","event":"AUTH_FAILED","ip":"1.2.3.4","route":"/api/admin/bots"}
```

---

## 🗂️ 项目结构

```
tg-bot-worker-gateway/
├── src/
│   ├── index.js        # Workers 主入口：路由分发、安全中间件、加密逻辑
│   └── ui.js           # Web 管理界面：HTML/CSS/JS 全部内联
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Actions 自动部署
├── wrangler.jsonc       # Workers 配置（KV 绑定、环境变量）
├── package.json
└── README.md
```

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 协议开源。
