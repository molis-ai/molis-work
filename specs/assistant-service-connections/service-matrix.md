# 服务矩阵（第 61 批，2026-11-18）

状态：第 61 批盘点及合后修复，负责人为第 61 批主会话。48 项服务按现行目录逐行对照，交接范围见 [§4](#gaps-for-62)。需求书见 [spec.md](spec.md)，历史逐方式盘点见 [coverage.md](coverage.md)。


> [!IMPORTANT]
> **2026-11-22 架构校准（[决定 66](../post-anticorruption-roadmap/reference/decisions.md#decision-66)：[特殊逻辑平民化](../plugin-specials-demotion/spec.md) + [统一工作分区](../unified-partition-plugins/spec.md)）**：按[决定 66](../post-anticorruption-roadmap/reference/decisions.md#decision-66)：① `44B` 将官方集成全量收口为平台声明式连接器驱动，清零宿主 20 CLI/`feishu`/`lark`/`figma`/`github`/`gmail`/`Sentry-Bearer`/`typesafe` 分支并合并独立 `integration-registry.ts`，`youtube` 并入 `rss` 驱动；② `G-01` 移除已于 `44B` 彻底删除的旧 Alchemist；③ `G-02`/`G-03`/`G-05` 基于 `106`～`110` 统一分区与 `services.personSettings` 实施，连接名称同步但密钥/令牌永不出本机（`S-person-settings-private`），`plugin-installation:<install>` 本人默认连接槽收紧仅对本机本人与获准助理可用。

## 1. 怎么读、从哪来

- `homeConnectorDirectory` 在空 Home 列出 48 项，服务声明提供类别和线索。Feed 来源须同时有可绑定的服务槽和与服务 id 相符的来源集成。飞书、Lark、企业微信、Bitbucket 已声明来源集成，截至本次复核没有 Feed 的绑定槽。文档、固定记录读取及网页搜索归各适配器。目录入口见 [Host 实现](../../apps/local-host/src/connector-directory.ts)。
- `tests/service-matrix-doc.test.ts` 核对表里的服务、四种用途与技能类别和目录一致；加了服务或改了声明而没改这张表，测试会红。
- **接入方式**：O = 账号登录（API OAuth），T = 贴密钥，C = 本机官方 CLI，M = 服务的 MCP。
- **新 Home 里即可登录**：不配任何产品应用就能走完的方式。「MCP 登录」= 服务的 MCP 支持动态注册，点连接就能在浏览器里登录；API OAuth 要产品在服务方注册应用（ASC-47 的「产品应用配置未完成」），没配时界面照 §8.1 分开显示，不算用户没配。

## 2. 矩阵

| 服务 | 目录 id | 接入方式 | 新 Home 里即可登录 | Feed 来源 | 导入文档 | 助理可读 | 网页搜索 | 技能类别 | 项目线索 | 声明方 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 模型 API | `model-api` | T | 贴密钥 |  |  |  |  | — | — | 平台 |
| TypeSafe | `typesafe` | T | 贴密钥 |  |  |  |  | — | — | 平台 |
| 图像模型 API | `image-api` | T | 贴密钥 |  |  |  |  | — | — | 平台 |
| 远程 MCP | `mcp-bearer` | T、M | 贴密钥 |  |  |  |  | — | — | 平台 |
| GitHub | `github` | O、C、T、M | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `source-control`、`project-tracker` | 远端 `github.com`；文件 `.github/` | 官方集成插件 |
| Gmail | `gmail` | O、T、M | 贴密钥 | ✓ |  | ✓ |  | `email` | — | 官方集成插件 |
| Google Calendar | `google-calendar` | O、T、M | 贴密钥 | ✓ |  | ✓ |  | `calendar` | — | 官方集成插件 |
| Outlook | `outlook` | M、O、C、T | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `email`、`calendar` | — | 官方集成插件 |
| Google Drive | `google-drive` | O、T、M | 贴密钥 | ✓ | ✓ | ✓ |  | `cloud-storage` | — | 官方集成插件 |
| OneDrive | `onedrive` | M、O、C、T | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `cloud-storage` | — | 官方集成插件 |
| SharePoint | `sharepoint` | M、O、C、T | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `cloud-storage`、`knowledge-base` | — | 官方集成插件 |
| Dropbox | `dropbox` | O、T、M | 贴密钥 | ✓ |  | ✓ |  | `cloud-storage` | 依赖 `dropbox` | 官方集成插件 |
| Box | `box` | O、C、T、M | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `cloud-storage` | — | 官方集成插件 |
| Notion | `notion` | O、C、T、M | MCP 登录、贴密钥、本机 CLI | ✓ | ✓ | ✓ |  | `knowledge-base` | 依赖 `@notionhq/client`、`notion-client` | 官方集成插件 |
| Slack | `slack` | O、T、M | 贴密钥 | ✓ |  | ✓ |  | `chat` | 依赖 `@slack/*`、`slack-sdk`、`slack-bolt` | 官方集成插件 |
| Microsoft Teams | `teams` | M、O、C、T | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `chat` | — | 官方集成插件 |
| Discord | `discord` | O、T | 贴密钥 | ✓ |  | ✓ |  | `chat` | 依赖 `discord.js`、`discord.py` | 官方集成插件 |
| 飞书 | `feishu` | O、C、T、M | 贴密钥、本机 CLI |  | ✓ | ✓ |  | `chat`、`knowledge-base` | 依赖 `@larksuiteoapi/node-sdk`、`lark-oapi` | 官方集成插件 |
| Lark | `lark` | O、C、T、M | 贴密钥、本机 CLI |  | ✓ | ✓ |  | `chat`、`knowledge-base` | — | 官方集成插件 |
| 企业微信 | `wechat` | T | 贴密钥 |  |  | ✓ |  | `chat` | — | 官方集成插件 |
| Zoom | `zoom` | O、T、M | 贴密钥 | ✓ |  | ✓ |  | `meetings` | — | 官方集成插件 |
| GitLab | `gitlab` | O、C、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `source-control` | 远端 `gitlab.com`；文件 `.gitlab-ci.yml` | 官方集成插件 |
| Bitbucket | `bitbucket` | O、T、M | MCP 登录、贴密钥 |  |  | ✓ |  | `source-control` | 远端 `bitbucket.org`；文件 `bitbucket-pipelines.yml` | 官方集成插件 |
| Vercel | `vercel` | O、C、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `deployment` | 文件 `vercel.json`、`.vercel/` | 官方集成插件 |
| Cloudflare | `cloudflare` | O、C、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `deployment` | 文件 `wrangler.toml`、`wrangler.jsonc`、`wrangler.json`；依赖 `wrangler` | 官方集成插件 |
| Hugging Face | `huggingface` | O、C、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `ml-models` | 依赖 `transformers`、`huggingface-hub`、`@huggingface/*` | 官方集成插件 |
| Sentry | `sentry` | C、O、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `error-monitoring` | 文件 `sentry.properties`、`.sentryclirc`；依赖 `@sentry/*`、`sentry-sdk` | 官方集成插件 |
| Supabase | `supabase` | O、C、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `database` | 文件 `supabase/`；依赖 `@supabase/supabase-js`、`supabase` | 官方集成插件 |
| Linear | `linear` | O、T、M | MCP 登录、贴密钥 | ✓ |  | ✓ |  | `project-tracker` | 依赖 `@linear/sdk` | 官方集成插件 |
| Jira | `jira` | C、O、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `project-tracker` | 依赖 `jira-client`、`jira.js` | 官方集成插件 |
| Confluence | `confluence` | O、T、M | MCP 登录、贴密钥 | ✓ |  | ✓ |  | `knowledge-base` | — | 官方集成插件 |
| Asana | `asana` | O、T、M | 贴密钥 | ✓ |  | ✓ |  | `project-tracker` | 依赖 `asana` | 官方集成插件 |
| ClickUp | `clickup` | O、T、M | MCP 登录、贴密钥 | ✓ |  | ✓ |  | `project-tracker` | — | 官方集成插件 |
| monday.com | `monday` | O、T、M | MCP 登录、贴密钥 | ✓ |  | ✓ |  | `project-tracker` | — | 官方集成插件 |
| Airtable | `airtable` | O、T、M | MCP 登录、贴密钥 | ✓ |  | ✓ |  | `database` | 依赖 `airtable`、`pyairtable` | 官方集成插件 |
| Loom | `loom` | M | MCP 登录 |  |  |  |  | `meetings` | — | 官方集成插件 |
| Figma | `figma` | O、T、M | 贴密钥 |  |  |  |  | `design` | 依赖 `@figma/*` | 官方集成插件 |
| Canva | `canva` | O、T、M | 贴密钥 | ✓ |  | ✓ |  | `design` | 依赖 `@canva/*` | 官方集成插件 |
| Adobe | `adobe` | O、T | 贴密钥 |  |  |  |  | `design` | — | 官方集成插件 |
| Salesforce | `salesforce` | O、C、T、M | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `crm` | 文件 `sfdx-project.json`；依赖 `jsforce`、`simple-salesforce` | 官方集成插件 |
| HubSpot | `hubspot` | C、O、T、M | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `crm` | 依赖 `@hubspot/*`、`hubspot-api-client` | 官方集成插件 |
| Intercom | `intercom` | O、T、M | MCP 登录、贴密钥 | ✓ |  | ✓ |  | `customer-support` | 依赖 `intercom-client`、`@intercom/*` | 官方集成插件 |
| Stripe | `stripe` | O、C、T、M | MCP 登录、贴密钥、本机 CLI | ✓ |  | ✓ |  | `payments` | 依赖 `stripe`、`@stripe/*` | 官方集成插件 |
| X | `x` | M、C、O、T | 贴密钥、本机 CLI | ✓ |  | ✓ |  | `social` | — | 官方集成插件 |
| LinkedIn | `linkedin` | O、T | 贴密钥 |  |  |  |  | `social` | — | 官方集成插件 |
| Brave Search | `brave-search` | T | 贴密钥 |  |  |  | ✓ | `web-search` | — | 官方集成插件 |
| DeepSeek Search | `deepseek-search` | T | 贴密钥 |  |  |  | ✓ | `web-search` | — | 官方集成插件 |
| Tavily | `tavily` | T | 贴密钥 |  |  |  | ✓ | `web-search` | — | 官方集成插件 |

来源型集成另计：RSS、YouTube、公共网页查询（SEL 的 AnySearch）与手动来源不建账号连接，来源配置与同步归 Feed，见 [coverage.md](coverage.md)。

## 3. ASC-38～55 与 BL 的现状

「已交」只说工程路径和隔离 Home 里的假服务；真实账号逐服务验收（ASC-50）本批不做，交第 62 批。

| 编号 | 现状 | 证据或去向 |
| --- | --- | --- |
| ASC-38～40 | 服务声明 `categories`。缺账号时，技能目录和正文读取都给出缺失类别。多个账号在对话里用名称区分，Host 接受本人对原问卷的选择，固定到该工作。同一工作后续的固定记录读取受所选账号约束，结果给出实际账号名称 | `tests/skill-connector-categories.test.ts`；[§13.7](spec.md#batch-61-connection-uses) |
| ASC-41～44 | 未交：没有官方连接器时的四级路径（已有连接／MCP → 受管连接 → 定时导出 → 如实说不行）、窄范围接入与批准写入，要第 62 批的 Tool／MCP 策略先定 | [缺口 G-08](#g-08) |
| ASC-45～49 | 第 13 批已交（§13.2～13.6：默认直接连接、技术配置收起、可用性分开显示、连接后接续与复用、取消与重连在原处恢复），本批没改连接路径，只加按用途对照 | `tests/connectors-settings-behaviors.test.ts`、`tests/connector-method-directory.test.ts`、`tests/connector-setup.e2e.test.ts` |
| ASC-50 | 未交（人工）：逐服务真实账号的完整体验 | [缺口 G-06](#g-06) |
| ASC-51～53 | 第 13 批与助理权限批已交：三种权限选择跨入口同一份、本次工作许可的范围、断线自动恢复与合并提醒 | `tests/security-invariants-assistant-pages-permissions.test.ts`、`tests/connector-status.test.ts`、`tests/security-invariants-plugin-connections.test.ts` |
| ASC-54 | 部分交（第 61 批）：设置 › 网页搜索选默认来源（AnySearch、Brave Search、DeepSeek Search、Tavily），平台动作 `connectors.web_search.query@1` 按默认查并写实际来源；助理经动作目录可用。第二个独立消费者 Coding 在第 65 批接 | `tests/web-search-default-source.test.ts`、`tests/catalog-connectors.test.ts`；[缺口 G-01](#g-01)、[G-07](#g-07) |
| ASC-55 | 默认切换只影响后续请求，在途查询保留原账号。拒绝密钥的回复由连接 owner 投影为需处理状态。查询取消、账号移除或重授权后，旧结果不会写入最近使用 | `tests/web-search-default-source.test.ts`；[隔离 Home 复验](../batch-61-audit-fixes/spec.md) |
| BL-692 | 部分交：插件页上撞 id 起不来的集成写明「ID 被别的插件占用」与能怎么办，不再叫人重试；还没写出是被哪个插件占用 | `tests/security-invariants-plugin-permissions-http.test.ts`；[缺口 G-04](#g-04) |
| BL-693 | Home 沙箱实例已接入。真实来源的一轮用量、条数和超时待测 | [缺口 G-05](#g-05) |
| BL-694 | 未交：沙箱集成包的 `document_import` 等 W5-11 把文档读取变成插件操作 | [缺口 G-03](#g-03) |
| BL-917 | Feed 新建候选与 `feed.sources.add_account@1` 用同一平台目录判断来源是否可拉取。本人按来源绑定账号，拉取使用这条绑定。用途表只在账号方式和实况支持该用途时标为可用 | `tests/feed-runtime-plugin.test.ts`、`tests/feed-native-plugin.test.ts`、`tests/security-invariants-connection-card.e2e.test.ts`「ASC-70 BL-917」；[G-02](#g-02) |

<a id="gaps-for-62"></a>

## 4. 交给第 62 批的缺口清单

每条写清卡在哪一层、要 62 改什么。「SDK」指 `packages/plugin-sdk`／`packages/contracts`，「上游」指 vendored 的 Prologue 包或 SEL，按红线由用户定换包范围。

| 编号 | 缺口 | 卡在哪 | 第 62 批要做的 |
| --- | --- | --- | --- |
| <a id="g-01"></a>G-01 | Feed 网页查询仍固定走 SEL 的 AnySearch，不跟设置里的默认网页搜索（旧炼金术已随 `44B` 删除，第 `82` 批重写研究场景直接走平台默认搜索） | Host 接线：Feed 尚未接入宿主默认网页搜索端口 | 在 `62-1B` 让 Feed 网页查询直接经宿主端口消费 `connectors.web_search.query@1` 的默认来源（无需改造第三方 SEL 包） |
| <a id="g-02"></a>G-02 | 本批统一目录、Feed 候选与添加校验。可绑定的服务仍受平台连接槽的服务表与 Feed Manifest 约束 | `packages/contracts/src/services/connector-host.ts` 的 `CONNECTOR_REQUEST_SERVICES`、`plugins/native/feed/src/manifest.ts`、`apps/local-host/src/connector-source-pull.ts` | 第 62 批逐服务用真实账号闭环。新沙箱服务要支持按来源选账号时，需一并验证槽、出站与凭据约束 |
| <a id="g-03"></a>G-03 | 沙箱集成包不能声明 `document_import`、`web_search`（BL-694） | SDK：沙箱集成第一版只收 `source`；文档读取还在宿主的提供方里 | 在 [`69-2`](../post-anticorruption-roadmap/reference/batches/69.md#batch-69-item-2) 随 `W5-11` 文档读取操作化，为沙箱集成包补齐 `document_import` 与 `web_search` 的平台操作和拒绝测试 |
| <a id="g-04"></a>G-04 | 撞 id 的集成没写出被哪个插件占用（BL-692 余项） | 平台：启动登记只记恢复错误，不记占用方 | 登记冲突时把占用方的插件 id 与标题写进恢复错误，插件页显示 |
| <a id="g-05"></a>G-05 | 外部集成一轮拉取的用量与超时没实测（BL-693） | Home 已从 `home-plugins.ts`、`home-installed-plugins.ts` 接入沙箱来源。限额仍由 `DEFAULT_SANDBOX_LIMITS` 与一次 200 条约束 | 用真实来源实测，再按结果决定是否调整 `SandboxCallControl.limits` |
| <a id="g-06"></a>G-06 | 逐服务真实账号验收（ASC-50）：连接、断线、撤权、恢复 | 外部资格：API OAuth 要产品在各服务注册应用；只有 MCP 登录与贴密钥在新 Home 里可走 | 按上表逐行走真实账号；缺产品应用的服务只挡它自己那一行 |
| <a id="g-07"></a>G-07 | Brave Search、DeepSeek Search、Tavily 按用户确认使用假服务。DeepSeek 的地址及 128 Unicode 字符上限已对上[官方 API](https://api-docs.deepseek.com/zh-cn/api/search/)，Host 在派出前检查长度 | 外部资格：真实密钥与服务计费 | 在隔离 Home 实查账号资格、响应、出处和费用提示 |
| <a id="g-08"></a>G-08 | 没有官方连接器的工具的接入路径（ASC-41～44） | 平台策略：受管连接、定时导出的落点要 Tool／MCP 策略先定 | 四策略定下后实现四级判断、窄范围接入、批准写入与真实工具走查 |
| <a id="g-09"></a>G-09 | 项目自动化建议里 Hooks、命令两组只有缺口说明 | SDK：没有可装的 Hook／命令来源声明 | 在 [`65-3`](../post-anticorruption-roadmap/reference/batches/65.md#batch-65-item-3) 随 Coding 用户 Hooks 落地一并定声明，建议器按声明出建议并进 `automation.adoption.adopt@1` 采用卡 |
| <a id="g-10"></a>G-10 | 角色不能从助理的采用卡里开 | 平台：角色没有项目级开／关状态 | 角色有了开关后并进 `automation.adoption.adopt@1` |
| <a id="g-11"></a>G-11 | 操作卡的字段名取动作合同的 `title`，英文／日文界面下仍是中文 | SDK：动作合同的 schema `title` 只有一种语言 | 在 `62-1B` 给 schema 的字段名加 `TextRef`（或按插件词典解析），卡片按界面当前语言（`zh`/`en`/`ja` 三语）显示 |
