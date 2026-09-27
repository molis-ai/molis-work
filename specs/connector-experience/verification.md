# 验证记录 · 2026-09-27

完成范围：当前 45 个 Connector 的目录、详情引导、连接/账号管理、回调落地页和下一步入口已实现。目标为本机连接界面内部完整；第三方真实账号成功授权不作全覆盖声明。

## 工程验证

- `pnpm --filter @molis-ai/molis-work-app-workbench run build`：通过。
- `pnpm --filter @molis-ai/molis-work-app-local-host run build`：通过。
- `node scripts/run-tests.mjs tests/connector-api-oauth.test.ts tests/connector-method-directory.test.ts tests/connector-oauth-choice.test.ts tests/connector-connections.test.ts tests/connectors-settings-behaviors.test.ts tests/connector-cli.test.ts tests/connector-mcp.test.ts`：54 项通过。
- 最后两处浏览器反馈调整（刷新后标题焦点、折叠失败技术信息）后，重新构建 Workbench，并重跑 method-directory 的 7 项测试，含生成后浏览器脚本语法检查：通过。
- 本任务 scoped diff 的 `git diff --check`：通过。

回归涵盖：预配置/未配置授权路径、完整方法目录和官方 HTTPS 链接、多字段凭据的新增与替换、取消授权返回对应服务页、连接轮询返回指定账号与版本且不暴露密钥、重授权复用原账号应用配置、账号身份不匹配拒绝覆盖、断开/刷新并发、OAuth 过期/拒绝、MCP 动态注册/刷新/工具读取、真实 PTY 的 CLI 登录、Feed 与 Images 消费所选账号。

Images 的既有测试原先仅 mock fetch，当前实现已通过 Prologue 推理端口，导致测试 Home 未绑定推理服务。测试已改为绑定该端口，在消费端解析并断言 A/B 两条连接的实际凭据，仍验证断开 A 不影响 B；未修改 Images 生产实现。

## 浏览器实操

使用实际 Web Server、真实生产渲染/路由、独立临时 Home；不使用用户现有账号和密钥。

- 45 个服务逐一点击目录→详情→返回：标题、主操作、下一步入口正常，窄屏无横向溢出。
- 搜索无结果、清除筛选、详情返回焦点：通过。
- 浅色/深色、默认桌面与窄屏布局检查：通过。工具的 390px 视口请求在当前浏览器缩放下实际 CSS 宽 433px，记录为窄屏验证，不声称精确 390px。
- 模型 API：保存虚构测试密钥→反馈→重命名→添加第二个账号→断开第二个账号，第一个账号保持可用状态。
- 模型 API 下一步→模型设置→添加供应商→账号选择：可见刚保存的“体验测试账号”，已断开的账号不出现在可选项中。
- Gmail：未配置状态显示官方后台、回调复制、Client ID/Secret 和登录操作。虚构客户端启动得到 Google 官方授权 URL，原页显示等待；刷新可恢复等待，停止等待正常。未在 Google 完成真实登录。
- Jira：独立站点域名、邮箱、API Token 输入，官方创建 Token 入口明确。
- GitHub：虚构无效令牌保存后实际收到官方 HTTP 401，显示检查失败和重试说明；修改后再次保存，刷新只见一条账号记录，没有重复创建。

## 未验证与实际边界

- 未对全部第三方服务使用真实账号授予权限；OAuth、MCP 和 CLI 成功链路中的远端行为由现有集成测试的受控服务/进程覆盖。
- 桌面系统浏览器桥接已复用原有接口，但本轮没有在打包桌面应用中完成真实外部登录。
- 普通 API OAuth 需要服务商的应用配置。已有 Gmail/Notion/GitHub 配置时可直接登录；其余服务不能凭界面改造自动获得产品 OAuth Client。未配置时给出真实准备步骤。
- 外链校验覆盖 HTTPS、去重、官方目录和本地目的路由；未对每个第三方页面在不同组织/地区/登录状态下逐一验收。
- 未安装/发布新的桌面产物；验证为源码构建与本地开发版。用户本人验收待实际体验。
# 第二阶段：真实登录入口（2026-09-27，未全部完成）

- 目标改为所有 Connector 消费者直接登录。当前完成的是主路径切换、Host 产品配置支持及可用官方动态注册路径；不是所有服务真实账号连接完成。
- 最终代码对 17 个入口调用生产 `startMcpConnection`，均取得官方授权 URL：Notion、GitLab、Vercel、Cloudflare、Hugging Face、Sentry、Supabase、Linear、ClickUp、monday、Airtable、Jira、Confluence、Bitbucket、Loom、Stripe、Intercom。四个 Atlassian 入口共用同一服务。批量发起的临时 Home 已清除；随后 Notion 真实连接保存在单独预览 Home，未删除或转存至用户生产 Home。
- Dropbox DCR 返回 HTTP 403 `registration_not_supported`，正文说明仅接受预注册 MCP trusted partners；Box/Zoom/X 元数据无动态注册端点。均改为产品应用预注册路径，不再在空白安装中显示直接登录。
- 修复 Hugging Face 匿名初始化掩盖账号登录：OAuth 新连接先主动授权。新增测试模拟匿名工具服务器，断言未授权不能保存连接，回调后才持有账号令牌。
- 新增产品配置隔离回归：启动不需浏览器提交 Client ID/Secret；秘密不进方法目录或启动响应；自有 Client ID 不借用产品 Secret；部署配置改变后重新授权仍沿用原连接应用；API 与 MCP 配置隔离。
- `node scripts/run-tests.mjs tests/connector-method-directory.test.ts tests/connector-api-oauth.test.ts tests/connector-mcp.test.ts tests/connector-connections.test.ts tests/connector-oauth-choice.test.ts tests/connectors-settings-behaviors.test.ts`：53/53 通过。
- contracts、workbench、local-host 构建通过；所改 tracked 文件 diff whitespace 检查通过。
- 真实浏览器：目录点击 Notion 立即发起请求、显示等待与重新打开/检查/停止；停止后回列表正常；Gmail 未配置时主流程无应用凭据输入。手动在受控浏览器打开生成的 Notion 链接，成功到官方确认页，显示 Molis、当前工作区及正确 loopback callback。随后用户明确授权，已点击 Continue 完成回调，原页自动更新。首次查看工具暂时失败，重试成功显示 45 个工具，没有调用工具或读取工作区内容。弹窗自动打开的 native/外部浏览器行为未完整观测，因此不能把 URL 生成或这次手动打开当作自动跳转的完整证明。
- `provider-readiness.md` 覆盖全部 45 个服务。用户已选 Cloudflare 且确认 Relay 可沿用，Google 应用名已改为 Molis。仍缺 Cloudflare 有效登录与实际部署、产品隐私政策和条款、各服务注册/发布资格，以及其他服务真实账号成功/刷新/断开验收。只完成工程检查不等于内部完整或可发布。

## Cloudflare 后端实现与验证

- Worker 复用服务定义实现产品 OAuth 代理，Host 按明确服务列表走云端启动/换码/刷新。两段独立 PKCE；AES-GCM 短时 state/票据与服务绑定的 refresh envelope；固定 loopback callback，拒绝任意目标；秘密只在 Worker；按路径与 hashed connecting IP 限流，关闭请求观测日志。
- 加入代理后的整组 Connector 测试 56/56 通过；随后新增的限流回归连同代理原 3 项共 4/4 通过（当前共 57 个相关用例）。
- Host 构建、Worker TypeScript 独立检查通过；Wrangler 4.141.0 deploy dry-run 成功，约 23.71 KiB / gzip 6.86 KiB。
- 实际 Cloudflare workerd 本地运行时验证通过：health、AES-GCM 授权启动、密钥不泄漏、恶意返回地址拒绝。使用明确虚假应用配置，未向 Asana 换取真实令牌。初次测试误将 PUBLIC_ORIGIN 配为 localhost，而 Wrangler 按 custom-domain 路由提供 auth.molis.ai origin；恢复正式 origin 后通过。临时诊断字段已移除，本地 Worker 测试进程已停止。
- Wrangler whoami 返回旧授权过期；Cloudflare 网页也处于登录页。未部署、未创建生产 secrets 或 Web OAuth 客户端。Google 仍是测试状态，仅 1 个测试用户，发布按钮因品牌配置不完整而禁用。
- Google 后续已保存官网 https://molis.ai 与授权域名 molis.ai；没有把不存在的隐私/条款 URL 填入表单。域名登记不等于所有权验证或公开发布。
- 最后检查修复预配置 OAuth 的隐藏高级设置仍被标为 required、可能阻止 Jira 等服务直接登录的问题；增加针对预配置 Jira 的回归并重新构建 Workbench。

## Cloudflare 实际部署（2026-09-27 续）

- 用户完成登录并明确批准 Wrangler 的最小部署权限，随后 CLI whoami 验证有效，凭据由 Keychain 加密保存。
- molis-oauth 首次部署成功，版本 b0fc6090-fa2d-46f0-8701-72d7292c830c，部署列表核对 100%，秘密列表核对 ENVELOPE_KEY/OAUTH_APPS 类型为 secret_text；应用清单为空，未宣称任何新增提供商真实可用。
- 用户确认 DNS 接入 Cloudflare 并保留网站和邮箱。Free zone 创建成功；扫描导入 2 A / 3 CNAME / 2 MX / 1 SRV / 2 TXT，全部保留 DNS-only。nameservers 分配为 ali.ns.cloudflare.com / isaac.ns.cloudflare.com；尚未修改 GoDaddy 的原 nameservers，等待完整 DNS 记录核对。
- auth.molis.ai 自定义域名部署成功，但公网 HTTPS curl 握手失败（DNS 尚未切换）；正式 HTTP/回调验证仍未通过。

- GoDaddy 全部 14 条原记录核对完成。Cloudflare 漏扫 secureserver1._domainkey / secureserver2._domainkey 两条 CNAME，已补齐为原目标且 DNS-only。分别查询 ns13.domaincontrol.com 和 ali.ns.cloudflare.com：apex A、www/email/domainconnect/DKIM CNAME、MX、SPF/DMARC TXT、autodiscover SRV 共 10 组全部一致。GoDaddy 转发未设置、DNSSEC 未启用。最终切换表单已填好，等待提交时确认；原 NS/SOA 不作为业务记录复制。

- 用户在了解影响后明确要求继续，已点击 GoDaddy 保存及继续并验证；进入账户邮箱 OTP 页面，等待用户本人完成。切换未确认生效，当前公共 NS 查询仍为旧值，官网 HTTPS 返回 200，授权子域名 HTTPS 尚不可达。

- 用户完成 GoDaddy OTP 后，页面明确显示使用自定义域名服务器 ali.ns.cloudflare.com / isaac.ns.cloudflare.com；Cloudflare 页面仍等待注册商传播（页面提示通常 1–2 小时，最长 24 小时），已手动触发一次检查。
- 用户明确批准创建 Google Web 客户端及将密钥保存至 Cloudflare。Molis OAuth Broker 已创建，唯一回调 https://auth.molis.ai/callback；密钥存入 OAUTH_APPS，Gmail/Calendar/Drive 分服务条目，同一产品客户端。CLI 部署列表确认新版本 d7905b42-884c-4be2-b5de-03497703b74c，100%。未把创建凭据等同于用户内容授权或成功连接。

- Google API 检查：Gmail 已启用；用户明确批准接受相关条款后启用 Calendar/Drive，两个 API 服务详情均显示已启用。未启用付费试用。
- 公共 Google DNS-over-HTTPS 查询仍返回旧 nameservers，auth.molis.ai 返回 NXDOMAIN；Cloudflare 仍显示等待传播，最新官网 HTTPS 检查为 200。没有绕过证书或把直连边缘测试代替正式域名验收。
- 隐私草稿使用用户提供的 info@molis.ai，运营者为公司（全称待补充）。草稿明确 Connector 范围、云端令牌交换、本机持久化、断开不删除历史内容、AI 数据链待核对，尚未发布。

## DNS 生效与独立服务配置（续）

- 公共 DNS-over-HTTPS 返回 molis.ai NS 为 ali.ns.cloudflare.com / isaac.ns.cloudflare.com，auth.molis.ai A 为 172.67.200.119 / 104.21.74.80。官网仍 HTTP 200。普通及指定公开 DNS IP 的 HTTPS 均握手失败；Cloudflare 页面证实 Universal 和 Worker managed 证书 Pending Validation (TXT)。没有绕过证书检查。
- 为后续服务注册增加独立 Worker Secret OAUTH_APP_<SERVICE>，保留 OAUTH_APPS 兼容；单服务完整覆盖，不能借用旧秘密。真实生产协议的定向测试验证换码使用独立凭据、旧 Google 条目仍能启动、坏覆盖项关闭该服务、缺少或损坏旧映射不影响独立条目。代理 5/5 测试、独立类型检查和 Wrangler dry-run 通过。
- 实际部署版本 7e6d6120-dd7a-484e-90ec-05d027dbc4f0 成功；本轮没有修改或重新生成任何已有秘密。
- Google Search Console 的手动验证 TXT 已填入 Cloudflare 表单，尚未保存，等待新增验证所有者权限确认。GitHub 官方应用注册入口需要用户登录，尚未创建应用。

- 用户完成 GitHub 登录及批准创建客户端/保存密钥后，注册 Molis app 3886406，页面确认 Application created successfully；Cloudflare OAUTH_APP_GITHUB 确认 Secret / Value encrypted。未修改 OAUTH_APPS/ENVELOPE_KEY；临时浏览器内存密钥已清空，GitHub 页面刷新后只显示掩码。真实用户授权仍未执行。

- GitHub 密钥部署版本 `8d2db232-bbe2-41bd-a639-633f76e5abf4`，CLI deployments list 核对 100%，注释 Add secret: OAUTH_APP_GITHUB。

## 2026-09-27 暂停平台注册后的全目录接入检查

- 范围：45 个目录入口；39 个 API OAuth 协议，其余 6 个为密钥/企业应用/MCP。配置与官方参考集中在 `configuration-readiness.md`；没有新增真实应用、授予权限或发布本轮代码。
- 初始独立合同测试 79 项：75 通过、4 失败；GitLab 缺少刷新回调、Sentry 访问不正确的用户身份端点，分别在直连和 Worker 路径复现。修复后两条生产路径通过。
- 本轮生产修改：GitLab 刷新附带原 redirect_uri；Sentry 保存换码响应 user.id，与组织 ID 共同识别账号，Worker 仅保留该 ID；Worker 对 ok:false / 非零 code 的 HTTP 200 也判为失败；飞书使用官方 v2 JSON 换码；Asana 带 users/workspaces/tasks:read；HF 公开 PKCE 可省略 secret；Airtable 使用官方规范端点域名。
- 新合同测试调用真实 Host/Worker 实现，独立的端点、响应、认证方式断言；39 服务 × 两种路径加目录覆盖、Sentry 账号替换/缺身份、7 个公开 PKCE 客户端，共 87 项。检查上游 verifier 哈希和授权 challenge 相同、稳定 ID 持久化、刷新令牌轮换、secret 不进入客户端、无 refresh 时重连，未使用供应商账号。
- 最终回归：`node scripts/run-tests.mjs tests/connector-provider-contracts.test.ts tests/connector-oauth-broker.test.ts tests/connector-api-oauth.test.ts tests/catalog-connectors.test.ts tests/connector-method-directory.test.ts tests/connector-oauth-choice.test.ts tests/connector-connections.test.ts tests/connector-mcp.test.ts tests/connector-cli.test.ts tests/connectors-settings-behaviors.test.ts`：160/160 通过，0 skipped。隔离测试 HOME；未触碰真实连接令牌。
- 构建：`pnpm --filter @molis-ai/molis-work-integration-catalog build`、`pnpm --filter @molis-ai/molis-work-app-local-host build` 通过。Worker：`pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --skipLibCheck apps/local-host/cloudflare/worker.ts` 通过。受影响已跟踪源码 `git diff --check` 通过。
- 只读公网复核：正式 HTTPS `/health` 返回 200 / ok，`/providers` 返回 github、gmail、google-calendar、google-drive。覆盖此前 pending TLS 记录；不是这些服务实际授权通过。
- 未验：39 服务的真实用户授权/内容读取/刷新、尚未注册服务的应用资格/审核、桌面发布产物；本轮不重复 UI 验证，因为未修改页面布局/交互。Jira/Confluence 指定站点、Asana/ClickUp 首个工作区、身份专用服务无 Feed 等限制逐项保留，不能从协议测试推断能力超出实现。
- 本轮修复未部署，线上 Worker 及原 Google/GitHub 配置保持原样；下次配置启用前需部署新代码并完成对应服务的实网验收。


## 2026-09-27 复查 R1–R6 修复验收

结果：六项审查问题均已修复，工程与覆盖的隔离浏览器路径通过。没有注册新应用、进行新的真实第三方授权或部署 Worker/桌面产物。

| 问题 | 当前行为与证据 |
| --- | --- |
| R1 重连后来源未恢复 | 通用 OAuth 完成会恢复原 Feed 绑定；暂停、删除来源保持原意。原失败复现转为通过。来源状态协调移至 Host 业务模块，OAuth 不再需要依赖 Web 路由。 |
| R2 官方 MCP 未进入 Agent | 支持的官方 HTTP MCP 可在 Coding 选取，自动填写地址/认证；Host 负责令牌刷新、完整 endpoint 校验和断开通知。真实本地 MCP 协议测试覆盖授权、SDK 工具发现、选择校验、到期刷新与断开阻断。连接不执行工具。 |
| R3 产品 OAuth 断开后索要秘密 | 产品配置记录来源，身份及设置匹配时从产品配置恢复；自有应用不能借用产品 Secret。原失败复现和隔离断言通过。 |
| R4 拒绝后原窗口持续等待 | OAuth/MCP 返回独立授权尝试 ID；原窗口识别取消、失败、过期与成功。数据库只保存 state 哈希和状态，不向 UI 返回协议 state 或凭据；回调保持单次消费。 |
| R5 已授权但刷新失败卡住 | 等待逻辑拆为类型化控制器，页面刷新失败单独提示并提供重试；不重复授权。覆盖序列化后的实际客户端函数、临时网络失败、停止期间请求返回等场景。 |
| R6 下一步入口错误 | 依据有效账号及连接能力显示下一步：官方 HTTP MCP 去 Coding，适用 API 去 Feed，密钥去对应消费者；无有效连接只说明用途。保留项目上下文。 |

端到端补充：项目未启用 Coding 时，页面提供启用按钮，成功后重新加载配置；后台只增加稳定错误码，复用已有插件启用接口。凭据解析期间发生账号断开会阻止 Agent 建连，不发出网络请求；重新配置为无账号绑定的服务不会继承旧账号失效状态。

验证命令与结果：

```sh
node scripts/run-tests.mjs tests/connector-reconnect-regressions.test.ts tests/connector-authorization-recovery.test.ts tests/connector-provider-contracts.test.ts tests/connector-oauth-broker.test.ts tests/connector-api-oauth.test.ts tests/catalog-connectors.test.ts tests/connector-method-directory.test.ts tests/connector-oauth-choice.test.ts tests/connector-connections.test.ts tests/connector-mcp.test.ts tests/connector-cli.test.ts tests/connectors-settings-behaviors.test.ts tests/coding-mcp.test.ts
# 172 passed, 0 failed, 0 skipped

# 最后补充凭据解析期间撤销/重新配置的断言后，重建 Agent Host 并重跑受影响范围：
node scripts/run-tests.mjs tests/coding-mcp.test.ts tests/connector-mcp.test.ts
# 14 passed, 0 failed, 0 skipped
```

Contracts、Agent Host、Coding、Workbench、Local Host 构建通过。受影响源码和文档 git diff --check 通过。Impeccable 静态检查未报告问题，不代替运行时验证。测试统一隔离 HOME，不使用真实保存的账号秘密。

浏览器在独立临时 Home/4259 服务中实际操作：Asana 测试配置发起授权与重载后恢复等待；本地拒绝回调后原窗口显示取消并恢复按钮；模型 API 测试密钥保存后显示模型设置入口；Notion 布局样本进入正确项目的 Coding，选择账号自动填写名称、地址与认证；未启用 Coding 的第二项目点击启用后显示「MCP 配置已读取」。浏览器发现的计时器 Illegal invocation 已修复并重测。桌面及实际 CSS 宽度 433px 检查无横向溢出。临时页面和服务已关闭。

证据边界：浏览器账号/密钥为隔离样本，未向真实 Notion 发起工具连接；本地协议测试不代表真实供应商、模型执行或全量界面场景通过。当前 Agent 桥接支持官方 HTTP MCP；本机 stdio、旧 SSE 和专用认证头继续使用既有原生操作，不显示为可用的 HTTP 账号。既有指定站点、首个工作区及身份能力限制继续以 configuration-readiness.md 为准。服务商真实账号、公开审核及发布产物仍需各自验收，不声明全部服务可发布。
