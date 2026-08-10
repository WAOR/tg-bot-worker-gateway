# 🚀 Telegram Bot Cloudflare Workers 网关 & 可视化 Web 管理后台

一个高性能、无服务器（Serverless）的 **Telegram Bot API 反向代理网关与可视化 Web 管理平台**。部署于 Cloudflare Workers 全球边缘网络，帮助你安全屏蔽 Bot Token、解决国内服务器访问 api.telegram.org 阻断问题、管理多个 Bot 及其 Webhook 转发。

---

## ⚡ 1-Click 一键部署到 Cloudflare Workers

点击下方按钮直接部署到你的 Cloudflare Workers 账号：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WAOR/tg-bot-worker-gateway)

> **提示**：一键部署后，在 Cloudflare 控制台中配置环境变量 `ADMIN_PASSWORD`（默认密码为 `admin`）及绑定 KV 命名空间（可选）即可。

---

## ✨ 核心特性

- 🎨 **极简深色 Web 管理后台**：内置基于 HTML5/JS 的现代化 UI，管理机器人配置、监测网关运行状态。
- 🔒 **安全别名代理路径 (`/proxy/<alias>/*`)**：隐藏真实的 Telegram Bot Token，仅使用别名暴露 API 接口（如 `https://your-worker.workers.dev/proxy/mybot/sendMessage`）。
- 🛡️ **原生 Token 代理路径 (`/bot<TOKEN>/*`)**：完整兼容 `api.telegram.org` 原始路由结构，替代直连 API 请求。
- ⚡ **在线 Telegram API 测试器**：在 Web 界面中直接发起 `getMe`、`sendMessage`、`getWebhookInfo`、`setWebhook` 等测试，实时返回格式化 JSON 结果。
- 🔗 **Webhook 实时分发与密钥验证**：支持注册 Telegram Webhook 到 Workers 网关，自动校验 `X-Telegram-Bot-Api-Secret-Token` 并转发至指定的后端应用服务器。
- 💾 **灵活的数据持久化**：优先使用 Cloudflare KV (`BOT_GATEWAY_KV`)，同时提供内存及环境变量降级容灾，即使未创建 KV 也能开箱即用。

---

## 🛠️ 部署指南

### 方法一：使用 Cloudflare 网页端一键部署
1. 点击上方的 **Deploy to Cloudflare Workers** 按钮。
2. 登录你的 Cloudflare 账号授权部署。
3. 部署完成后，进入 Worker 设置页 -> **Settings -> Variables**，添加环境变量 `ADMIN_PASSWORD` (例如 `MySecurePass123`)。
4. 打开 Worker 产生的二级域名（如 `https://tg-bot-worker-gateway.<subdomain>.workers.dev`）即可访问管理界面！

---

### 方法二：使用 Wrangler CLI 本地部署

1. **克隆项目到本地**：
   ```bash
   git clone https://github.com/WAOR/tg-bot-worker-gateway.git
   cd tg-bot-worker-gateway
   ```

2. **安装依赖**：
   ```bash
   npm install
   ```

3. **创建 Cloudflare KV 命名空间（推荐）**：
   ```bash
   npx wrangler kv namespace create BOT_GATEWAY_KV
   ```
   复制输出结果中的 `id` 填入 `wrangler.jsonc` 的 `id` 字段中。

4. **部署到 Cloudflare Workers**：
   ```bash
   npx wrangler deploy
   ```

---

### 方法三：使用 GitHub Actions 自动部署

1. 在 GitHub 仓库的 **Settings -> Secrets and variables -> Actions** 中添加以下密钥：
   - `CLOUDFLARE_API_TOKEN`：Cloudflare 控制台中生成的 API 令牌 (具备 Workers 编辑权限)。
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 仪表盘右侧获取的 Account ID。
2. 提交代码至 `main` 分支，GitHub Actions 将自动完成编译与部署。

---

## 📖 API 网关使用说明

### 1. 别名安全代理 (推荐)
避免在客户端应用中暴露硬编码的 Bot Token：
- **请求格式**：`POST https://<your-worker-domain>/proxy/<alias>/<method>`
- **cURL 示例**：
  ```bash
  curl -X POST "https://tg-bot-worker-gateway.yourname.workers.dev/proxy/mybot/sendMessage" \
       -H "Content-Type: application/json" \
       -d '{"chat_id": 123456789, "text": "Hello World!"}'
  ```

### 2. 标准直连代理
完全替代 `https://api.telegram.org` 域名：
- **请求格式**：`POST https://<your-worker-domain>/bot<BOT_TOKEN>/<method>`
- **cURL 示例**：
  ```bash
  curl -X POST "https://tg-bot-worker-gateway.yourname.workers.dev/bot123456789:ABCdefGhIJK/sendMessage" \
       -H "Content-Type: application/json" \
       -d '{"chat_id": 123456789, "text": "Hello World!"}'
  ```

### 3. Webhook 代理与分发
在 Web 界面中点击 **Webhook 部署** 按钮，或者手动调用：
- **Webhook 接收地址**：`https://<your-worker-domain>/webhook/<alias>`

---

## ⚙️ 环境变量配置

| 变量名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | Text | Web 管理后台登录密码 (默认: `admin`) |
| `BOT_GATEWAY_KV` | KV Namespace Binding | 机器人配置持久化存储的 KV 命名空间 |

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 协议开源。
