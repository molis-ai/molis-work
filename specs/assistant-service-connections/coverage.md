# 服务、方式与用户操作覆盖

状态：实施盘点（2026-10-16），负责人 Codex。本文是[唯一需求书](spec.md)的覆盖证据，不是运行时服务名单。基准 `afe440dd8`，在实施基线 `ba64f24a3` 复核；这期间目录中的服务与方式没有增加，Catalog 的变化为 Atlassian/Salesforce 地址校验收紧。所有真实账号路径尚未验证。

依据：[服务目录](../../apps/local-host/src/connector-directory.ts)、[装配后的方式](../../apps/local-host/src/host-connector-methods.ts)、[API OAuth](../../apps/local-host/src/connector-api-oauth-providers.ts)、[CLI 实际命令](../../apps/local-host/src/connector-cli.ts)、[MCP 客户端](../../apps/local-host/src/connector-mcp.ts)、[Catalog 实际请求](../../plugins/official-integrations/catalog/src/catalog.ts)。下面的 API 操作按处理器的实际 endpoint/GraphQL 字段列出，不沿用目录中较宽泛的宣传文字，例如 Airtable 目前读取 Base 列表，并不读取任意表格记录。

标记：**O** = 已有 API OAuth 处理器（GitHub/Gmail/Notion 还保留专用入口）；**T** = 已有 token/应用凭据表单；**M** = 已有 MCP 处理器，其工具/资源以实际发现为准，不预先承诺某个工具；**C** = 已有 CLI 检测、登录和验证。OAuth/MCP 仍可能需要本人填写注册客户端、租户或取得服务商资格。CLI 必须有对应可执行程序，当前只有安装说明，受控安装是本需求待补项。

API 列中除特殊 owner 外，账号检查归连接管理，列表读取沿用 Integration Provider；业务保存仍由 Feed 或 Artifacts 等 owner 完成。CLI 预览是当前设置页已有用户操作，需开放同一个受限处理器；不开放任意命令。所有行的对话接入/助理组合调用仍待完成，不能因有处理器就记为通过。

| 服务 | 既有方式 | API/业务 owner 的实际用户操作 | CLI 实际用户操作 / 限制 |
| --- | --- | --- | --- |
| 模型 API | T | 模型设置校验；Agent Host 推理；Jelly 使用所选模型 | 无 CLI 方式；不增加第二条模型通道 |
| TypeSafe | T | Functions 已发布判断调用 | 无 CLI 方式 |
| 图像模型 API | T | Images 生成与任务查询 | 无 CLI 方式 |
| 远程 MCP 凭据 | T、M | 保存绑定凭据，Coding 配置引用；通用 URL 管理待统一 | 无 CLI 方式 |
| GitHub | O、T、C、M | 当前账号/范围；Feed 未读通知；Alchemist 使用所选连接读取 GitHub | `gh`：当前账号、通知 |
| Gmail | O、T、M | Feed 只读收信；首次使用读取指定时间范围邮件；没有发送实现 | — |
| Google Calendar | O、T、M | 主日历身份、事件列表 | — |
| Outlook | O、T、C、M | 账号、邮件列表 | PowerShell + Graph：账号、最近邮件 |
| Google Drive | O、T、M | 账号、文件列表；Artifacts 导入 Google Docs 正文 | — |
| OneDrive | O、T、C、M | 账号、最近文件 | PowerShell + Graph：账号、根目录项目 |
| SharePoint | O、T、C、M | 账号、关注的站点 | PowerShell + Graph：账号、站点搜索 |
| Dropbox | O、T、M | 账号、根目录文件 | — |
| Box | O、T、C、M | 账号、根目录项目 | `box`：账号、根目录项目 |
| Notion | O、T、C、M | 账号、页面搜索；Artifacts 导入正文 | `ntn`：账号、用户列表 |
| Slack | O、T、M | 账号、频道列表 | — |
| Microsoft Teams | O、T、C、M | 账号、聊天列表 | PowerShell + Graph：账号、聊天列表 |
| Discord | O、T | 账号、服务器列表 | — |
| 飞书 | O、T、C、M | 账号、聊天列表；Artifacts 导入文档/知识库 | `lark-cli`：账号、日程；地区必须为飞书 |
| Lark | O、T、C、M | 账号、聊天列表；Artifacts 导入文档/知识库 | `lark-cli`：账号、日程；地区必须为国际版 |
| 企业微信 | T | 账号、部门列表 | — |
| Zoom | O、T、M | 账号、本人会议列表 | — |
| GitLab | O、T、C、M | 账号、事件列表 | `glab`：账号、事件列表 |
| Bitbucket | O、T、M | 账号、本人参加的仓库 | — |
| Vercel | O、T、C、M | 账号、部署列表 | `vercel`：账号、项目列表 |
| Cloudflare | O、T、C、M | 账号、Zone 列表 | `wrangler`：仅账号检查，未配置业务读取命令 |
| Hugging Face | O、T、C、M | 账号、账号所属模型列表 | `hf`：仅账号检查 |
| Sentry | O、T、C、M | 账号、指定组织的 Issue 列表 | `sentry`：仅账号检查，限官方云 |
| Supabase | O、T、C、M | 账号、项目列表 | `supabase`：账号、项目列表；当前适配要求 2.118.0+ |
| Linear | O、T、M | 账号、Issue 列表 | — |
| Jira | O、T、C、M | 账号、分配给本人的事项 | `acli`：账号、分配给本人的事项 |
| Confluence | O、T、M | 账号、按更新时间排列的页面 | — |
| Asana | O、T、M | 账号；当前实现读取第一个 workspace 中分配给本人的未完成任务 | — |
| ClickUp | O、T、M | 账号；当前实现读取第一个 team 的任务 | — |
| monday.com | O、T、M | 账号、Board 列表 | — |
| Airtable | O、T、M | 账号、Base 列表 | — |
| Loom | M | 没有 Feed/API 列表适配；使用服务端实际 MCP 能力 | — |
| Figma | O、T、M | API 仅身份；设计内容通过 MCP | — |
| Canva | O、T、M | 账号、设计列表 | — |
| Adobe | O、T | 仅 Adobe IMS 身份；没有业务读取适配 | — |
| Salesforce | O、T、C、M | 账号、最近 Task 记录 | `sf`：账号、同一 Task 查询 |
| HubSpot | O、T、C、M | 账号、联系人列表 | `hubspot`：账号、联系人列表 |
| Intercom | O、T、M | 账号、对话列表 | — |
| Stripe | O、T、C、M | 账号、事件列表；没有支付执行适配 | `stripe`：账号、事件；当前 CLI 使用测试环境 |
| X | O、T、C、M | 账号、指定账号帖子 | `xurl`：仅账号读取；需本人开发应用 |
| LinkedIn | O、T | 仅 OpenID 会员资料；没有 Feed 适配 | — |

来源型 Integration 另计：RSS、YouTube、公共网页搜索与手动来源不强造账号连接；来源配置、同步及结果仍通过 Feed/相应 owner。不得把“没有账号”误判为接入缺失。

## 协议与机制验收

| 类别 | 现有基础 | 本次缺口 / 证据 |
| --- | --- | --- |
| 官方远程 MCP · HTTP/SSE | 预置地址、OAuth DCR/已注册客户端、Bearer、匿名 | 回调自动登记首片已验证；助理自动接续未接入 |
| 自定义远程 MCP | Home 通用 HTTP/SSE 与项目 HTTP 配置 | 协议集成已覆盖匿名、Bearer、OAuth；共同管理已能读取/检查/启停/移除；对话准备入口待完成 |
| 已有本机 HTTP | 预置 Figma；Home 与项目通用配置 | 真实回环 HTTP 连接、调用与凭据重启回归通过；由用户拥有的进程不被管理操作终止 |
| 已有可执行文件 | Prologue stdio 运行 | 原项目与目录授权仍检查；Host 重启后由获准调用按需重连已覆盖；对话安装入口待完成 |
| Node/npm | 现有 stdio 能运行已备好程序 | 固定版本用户级安装、运行时检查、更新回滚；待实现 |
| Python | 现有 stdio 能运行已备好程序 | 隔离环境安装、依赖与版本生命周期；待实现 |
| Connector O/T/C | 设置页已有对应处理器与受限用户操作 | 对话管理、本人表单、接续与 CLI 安装；待实现 |
| 凭据保护 | 既有 SecretStore、专用表单、精确目标绑定 | 对话/等待/诊断新增路径仍需覆盖；未真实验收 |

## 存量配置与引用盘点

| 事实 | 当前 owner / 位置 | 消费引用 | 收敛要求 |
| --- | --- | --- | --- |
| Home 账号连接 | ConnectorConnectionStore：`connector_connections` | Feed 来源 `connection_id`；模型/Images/Functions 绑定；MCP connection ref | 保留稳定 id、账号与 SecretStore 引用；统一管理只维护这一份 |
| 插件槽位绑定 | 同一 store：`connector_bindings`，key 为 scope/plugin/slot | 原业务 owner 解析指定连接 | 不静默换号；管理连接不授予业务读写权 |
| 凭据目标 | 同一 store：`connector_connection_targets` | 模型/API/MCP resolver | 目标校验继续生效，更新地址不能带旧凭据过去 |
| Home MCP/API/CLI 协议配置 | ConnectorProtocolStore：`connector_protocols` | 连接 id 指向 endpoint/transport/context/CLI fingerprint | 配置写入归协议 owner；密钥只存引用 |
| 待完成授权 | `connector_authorization_sessions` + SecretStore 暂存 | 一次性 state、回调 origin、待提交 config | 取消/过期/替代失效；提交前检查当前请求 |
| 授权结果 | `connector_authorization_results` | 受保护页面的 authorization id；state 只存 hash | 用同一事实给页面与任务状态，不另造等待轮询库 |
| Coding MCP 配置 | Prologue MCP library，以 project/plugin 为原 owner | Agent MCP save/list/control；ExternalMcpDirectory | 原入口改用共享引用；保留原项目、启动目录、参数及密钥引用；具体维护步骤在切换前补齐 |
| MCP 发现缓存与动作版本 | Home 的 connector/external MCP 工具缓存与版本簿 | Kernel action reference：provider/capability/version | 可重建投影；不能复制成新配置或当成连通证明 |
| 助理任务与等待 | Assistant + Prologue task graph | work/round、continuation/checker | 恢复当前任务且每次等待只续接一次；不新建通用任务引擎 |

Connector 库基线 2 的隔离维护演练已覆盖原连接、协议、绑定、凭据引用与授权结果；真实 Home 未维护。项目 MCP 配置仍由 SDK 保存，Host 共同目录保留其项目范围与来源，直接填写的凭据现在持久保存到 Home SecretStore。正式接入界面、任务接续、受管安装与真实服务验收尚未完成。
