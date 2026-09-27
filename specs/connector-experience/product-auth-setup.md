# Molis 产品授权配置交接

官网确定为 https://molis.ai。首页可访问，未找到产品自身的隐私政策链接（Google 的隐私政策不能替代 Molis）。用户确认 Relay 是 Molis 前身，可以沿用；已通过 Google Cloud 品牌页面将应用名保存为 Molis、应用首页设为 https://molis.ai、授权域名登记为 molis.ai（两次保存均有页面成功确认）。登记域名不等于已完成 Search Console 所有权验证。原有 Desktop 客户端保留；已获明确许可创建 Web 客户端 Molis OAuth Broker，唯一回调 https://auth.molis.ai/callback。不记录客户秘密。

## 当前检查结论（2026-09-27）

用户已决定暂停其他平台的逐一注册。后续统一按 [配置准备检查](configuration-readiness.md) 配置和验收，其中列明 45 项入口、39 项 API OAuth 的协议差异、权限及剩余限制。以下部署记录保留历史过程，TLS 的最新状态覆盖早期 pending 记录：`https://auth.molis.ai/health` 已通过 HTTPS 返回 200 / ok，`/providers` 返回 github、gmail、google-calendar、google-drive。真实用户授权仍未替代。

本轮协议修复只在工作区完成，尚未更新线上 Worker；当前线上版本仍为 `8d2db232-bbe2-41bd-a639-633f76e5abf4`。启用其他服务前按最新代码部署并完成真实验证。

## 当前可运行配置

Host 支持所有已实现 API OAuth 的产品预配置，运行时读取环境变量，浏览器仅收到 `login_ready`。命名为 `MOLIS_WORK_CONNECTOR_<SERVICE>_<OAUTH|MCP>_CLIENT_ID` 和对应的 `_CLIENT_SECRET`。服务 ID 大写，连字符换为下划线，例如 `GOOGLE_CALENDAR`。OAuth 的服务附加配置使用同一前缀加字段大写，例如 `MOLIS_WORK_CONNECTOR_JIRA_OAUTH_SITE_URL`。仅从服务声明的字段读取设置，不接受任意授权地址。

示例：受控 Host 的 Asana API 应用使用 `MOLIS_WORK_CONNECTOR_ASANA_OAUTH_CLIENT_ID` / `_CLIENT_SECRET`；Asana MCP 应用使用 `MOLIS_WORK_CONNECTOR_ASANA_MCP_CLIENT_ID` / `_CLIENT_SECRET`，两套应用不可混用。Gmail、Notion、GitHub 原有专用配置仍优先，避免破坏旧连接。

API 回调为当前本机 origin 加 `/api/settings/connectors/methods/oauth/callback`；MCP 回调为 `/api/settings/connectors/methods/mcp/callback`。在供应商支持的前提下注册 loopback callback。要求 HTTPS 回调的服务需要托管授权代理，不能用一个不存在的 molis.ai 地址代替；Intercom API 不因填了 Client ID 就宣称就绪。高级自有应用仍可沿用手动回传流程。

产品配置仅用于受控 Host/内部验证。**不得把 confidential Client Secret 打包进分发的桌面应用或前端。** 已实现 `apps/local-host/cloudflare/worker.ts` 和 Host 的代理模式，已部署至用户 Cloudflare 账户，绑定 `https://auth.molis.ai`；GoDaddy 已完成 nameserver 切换，公共 DNS 已返回 Cloudflare NS 和 auth 子域名 A 记录；公网 HTTPS 健康检查已通过，真实供应商登录仍未完成。配置/部署和限制见该目录 README。云端秘密不进入桌面安装包。将本机环境变量或代理代码视为公开产品注册完成，是错误的。

## 剩余外部工作

1. Cloudflare 网页及 Wrangler 登录已恢复；凭据使用 macOS Keychain 加密存储。用户已确认将 molis.ai DNS 接入 Cloudflare并保留现有网站和邮箱。已创建 Free zone、导入扫描出的 10 条记录且设置 DNS-only；已登录 GoDaddy 并核对全部 14 条原记录（含注册商 NS/SOA）；补齐漏扫的两条 DKIM 后，10 组业务记录的旧/新权威 DNS 查询完全一致。用户已最终批准切换并完成 OTP；GoDaddy 已显示自定义 nameservers ali.ns.cloudflare.com 与 isaac.ns.cloudflare.com，公共 DNS 已返回新 NS；授权域名 HTTPS 已可访问。注册公开应用前准备实际产品首页、数据处理说明、隐私政策、服务条款及支持联系方式；不编造法定主体或发布未经确认的承诺。
2. 对支持原生公共客户端和 PKCE 的服务注册 Molis 客户端；按各自支持的回调方式接入。对 confidential 客户端部署已实现的 Worker：秘密只留服务器，授权事务绑定本机发起会话，固定/校验返回地址，短时票据由本机 PKCE 保护；上游授权码单次消费。Worker 和 Host 的启动/回调/身份/刷新集成通过受控测试，部署及公开 HTTPS 已验证，提供商真实授权未验证。已取得的 refresh token 通过加密 envelope 返回本机，不持久化云数据库。
3. Google 已确认沿用且品牌改名完成；HTTPS 客户端及 Gmail/Calendar/Drive API 均已配置；仍需完善域名验证和实际政策页面，验证实际读取权限；审核和外部账号可用性单独验收。Microsoft 注册自己的应用，验证个人/组织账户及租户许可。Dropbox 申请 trusted partner 或改用产品 API 应用；Box/Zoom/X 均需产品应用。Asana、Figma、Canva、Slack 等按各自官方资格和分发规则推进。
4. 按 provider-readiness.md 逐项完成真实登录→权限确认→回调→身份显示→实际读取→刷新/取消/断开。任何一项未完成不得标记为公开可用。

## 2026-09-27 云端部署证据

- 账户：`a7a6d1ad56cdc1179da80d05ff38e25c`；Worker：`molis-oauth`；首次版本 `b0fc6090-fa2d-46f0-8701-72d7292c830c`，部署列表显示 100%。
- `ENVELOPE_KEY` 与 `OAUTH_APPS` 已作为 Worker Secrets 保存，未写入仓库或输出敏感值。OAUTH_APPS 已更新为 Gmail/Google Calendar/Google Drive 的同一产品 Web 客户端；真实回调未通过前，不启用分发端服务。生产 ENVELOPE_KEY 不能在后续部署时重新生成。
- 自定义域名已绑定，DNS 传播完成前 curl HTTPS 握手失败，不能宣称正式回调可用。所有现有网站和邮箱记录保留 DNS-only；GoDaddy 完整记录已核对；GoDaddy OTP 已完成，页面已确认新 nameservers；Cloudflare 和公共 DNS 仍待传播，不宣称正式域名可用。

- Google Web 公共 Client ID：`858357416867-p2rglnpbvjhmpab4sua1auo5341tnt14.apps.googleusercontent.com`。Secret 已从创建对话框保存至 Cloudflare OAUTH_APPS，未输出至聊天/日志/仓库。Cloudflare 新部署版本 `d7905b42-884c-4be2-b5de-03497703b74c` 已核对 100%，注释 Updated secret: OAUTH_APPS。Google 应用仍为 Testing；API 后续已启用，政策/域名验证和真实用户回调待完成。

- Gmail API 原先已启用；用户批准相应条款后已启用 Calendar 与 Drive API，两个服务详情页均核对“状态：已启用”。未开启 Google 付费试用。
- 对外支持邮箱由用户确认为 info@molis.ai，运营者选择公司但尚未提供公司全称。`privacy-draft.md` 为未发布草稿，仍需公司名称、AI 数据处理链核对及运营承诺确认；未填入 Google 的正式隐私政策链接。

## 最新进展

- Worker 当前版本 `7e6d6120-dd7a-484e-90ec-05d027dbc4f0`：支持独立 `OAUTH_APP_<SERVICE>` secret，保留现有 Google 的 OAUTH_APPS 和 ENVELOPE_KEY。代理 5/5 测试、Worker 类型检查、dry-run 通过，实际部署成功。新增服务无需重填已有秘密；单服务配置整体覆盖，错误配置不会回退混用旧密钥。
- Google 公共 DNS 已返回 ali/isaac NS 及 auth.molis.ai 的 Cloudflare IP；官网 HTTP 200。授权域名 HTTPS 仍握手失败，Cloudflare Universal/Worker managed 证书均显示 Pending Validation (TXT)，真实回调暂未开始。
- Search Console 已准备 molis.ai 的手动 TXT 验证，Cloudflare 新增表单已填写但尚未保存，等待用户对 yijunw0212@gmail.com 成为验证所有者的确认。没有授权 Google 管理 Cloudflare DNS。
- 用户完成 GitHub 登录并明确批准创建和保存凭据，Molis OAuth app 已创建：https://github.com/settings/applications/3886406；公开 Client ID `Ov23lir4Lf2YsDq4f2EZ`。页面所有者为 `yijunw0212`（导航头像标签显示 DreamerWYJ），唯一回调 https://auth.molis.ai/callback，无通配符，Device Flow 未开启，创建时令牌到期/刷新选项保持开启。密钥单独保存为 Cloudflare Secret `OAUTH_APP_GITHUB`，界面确认 Value encrypted；未授权用户内容访问，尚未真实登录回调。

- GitHub 密钥部署版本 `8d2db232-bbe2-41bd-a639-633f76e5abf4`，CLI deployments list 核对 100%，注释 Add secret: OAUTH_APP_GITHUB。
