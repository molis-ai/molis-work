# Connectors 设置页，动作进 Functions 行为总表

完成等级：3 功能可用。不是可发布。不改 Goals/Artifact 事实。不提交除非另说。

## 背景目标

人在本机连上账号。连上之后，该服务已兑现的出站动作出现在 Host 行为总表里，Functions 写判断时能勾。判断只挑，不自动发出去。GitHub 同一份凭据同时给 Feed 拉通知和至少一个已兑现动作。

## 当前行为与问题

账号绑定埋在 Feed「来源与连接」：GitHub PAT / Device Flow、Gmail 令牌 / OAuth。凭据已进 SecretStore（`connector:github:token`、`connector:gmail:token`）。Functions 行为总表只有系统按钮、native 插件 `behaviors` 和 `mcp_exports`。GitHub Integration 没有 `behaviors`。判断 `ok` 只写建议，不会调 GitHub。设置 → MCP 是 GoalBoard 对外贡献哪些方法，不是连人的账号。

## 范围与非目标

做：

1. 全局设置单独一页 Connectors（Host/Workbench 拥有，和 MCP 同级）。
2. 卡片：已连接 / 未连接 / 要重新授权；点进去授权或断开。账号属于这台电脑上的人。
3. 凭据进现有 SecretStore，页面不回显明文。
4. GitHub / Gmail 账号迁到 Connectors；Feed 继续用同一份凭据拉通知。
5. GitHub 至少一个已兑现出站动作打进总表；Functions Agent 去向能勾。未连接看不见。
6. 判断不自动执行。已发布 Choice 还勾着未兑现动作时，按非法建议退回默认按钮。
7. 常见账号目录对齐 Codex / Claude / Grok 能连的那些：GitHub、Gmail 可连；其余占位，每张卡带自家应用图标。飞书、微信、X、LinkedIn 保留诚实不可用原因。不建空包。

不做：

- 塞进「设置 → MCP」
- 只埋在 Feed「来源与连接」
- `plugins/native/connectors`、`modules/connectors`
- Functions 里写各家 API
- 每个服务一个 MCP 进程包
- 平行 invoke API 绕开行为总表
- 微信个人号、X/LinkedIn 装官方 MCP
- 宣称可发布、宣称全绿
- 改 Goals/Artifact 事实

## 使用场景

1. 打开全局设置 → Connectors → 点 GitHub → 贴 PAT 或 Device Flow → 看到已连接（只显示末四位）。
2. 打开 Functions → 用在哪选 Agent → 能勾「查看当前 GitHub 账号」（`github.whoami`）。
3. 断开 GitHub 后，该动作从总表消失；已发布 Choice 若还勾着它，判断落地时建议被丢掉，首页退回默认按钮。
4. Feed 添加 GitHub 任务不再填令牌；「在 Connectors 管理账号」。已连接时仍用同一凭据拉通知。
5. Gmail 在 Connectors 连账号。出站发送未兑现，目录写明。

## 方案与关键决策

- Connector Host 仍是连接技术；Feed 仍是入站来源；设置 → MCP 仍是对外贡献方法。本页做「人的账号 → Integration 动作兑现 → 判断能挑」。
- 动作 id 并进 `apps/local-host/src/behavior-catalog.ts`。已连接才把 Integration `behaviors` 并进总表。
- GitHub 第一刀出站动作：`github.whoami`（官方 `GET /user`，read）。不扩写权限、不自动建 Issue。
- 判断 `ok` 只通过现有 `filterSuggestedBehaviorIds`；执行只走拥有该行为的 Integration / Host handler（点了或 Agent 另调）。
- 目录按 Codex / Claude / Grok 常见账号连接铺开；每张卡用该服务应用图标（Simple Icons CC0，飞书 Semi Design MIT，monday.com gilbarbara/logos CC0）。能连的只有 GitHub 和 Gmail。
- 分包：协议与动作在 `plugins/official-integrations/github`（Gmail 同理）；连接技术 `horizontal/connector-host`；装配 / 授权 HTTP / 已连接才兑现 `apps/local-host`；设置页 `apps/workbench`；类型 `packages/contracts`；判断库只消费总表。

## 输入输出与依赖

- 输入：本机 SecretStore、GitHub PAT / Device Flow、Gmail OAuth（现有回调路径）。
- 输出：Connectors 页、行为总表条目、Functions Agent 可勾选项、Host `POST /api/settings/connectors/github/whoami`。
- 依赖：现有 SecretStore、Feed connector 凭据键、Functions 总表与非法建议过滤、规格板 `mw-*`。

## 文件 / 模块边界

| 包 | 职责 |
| --- | --- |
| `packages/contracts` | Connector 目录/账号状态类型 |
| `horizontal/connector-host` | 协议无关连接技术（不放产品目录、不放设置页） |
| `plugins/official-integrations/github` | `behaviors` + `githubWhoami` |
| `plugins/official-integrations/gmail` | 账号迁入；目录写明出站未兑现 |
| `apps/local-host` | `connector-credentials` 按 connector id；已连接才兑现总表；授权 HTTP |
| `apps/workbench` | Connectors 设置页 |
| `modules/functions` + `plugins/native/functions` | 只消费总表 |
| `plugins/native/feed` | 去掉账号绑定表单；来源仍用同一凭据 |

禁止新建 `plugins/native/connectors`、`modules/connectors`。

## 验收标准

1. `/settings/connectors` 存在，导航与 MCP 同级，不属于插件 settings-page，也不在「设置 → MCP」。
2. 卡片能区分已连接 / 未连接 / 要重新授权；点进去可授权或断开；不回显明文。
3. GitHub 未连接时 Functions catalog 没有 `github.whoami`；连接后 Agent 去向能勾到。
4. 判断 `ok` 不调用 GitHub API；点「查看当前账号」或 `POST .../whoami` 才打 `GET /user`。
5. 断开后动作未兑现；已发布 Choice 仍勾着它时建议被过滤，退回默认按钮。
6. Feed 拉 GitHub 通知仍用 `connector:github:token`。Feed 添加来源不再出现 PAT 输入。
7. Gmail 账号在 Connectors 管理；目录写明出站未兑现。
8. 占位服务有不可用原因；没有空包；不宣称全绿。
9. `/settings/connectors` 每张卡和详情标题带对应应用图标；目录覆盖 Codex / Claude / Grok 常见账号连接，不只 GitHub / Gmail / 原 7 个占位。

## 验证命令

- `node --test tests/connectors-settings-behaviors.test.ts tests/functions-system-capability.test.ts tests/plugin-global-settings.test.ts tests/feed-native-plugin.test.ts tests/feed-sources.test.ts`
- 浏览器：设置 → Connectors 走 GitHub 连接/断开；Functions Agent 去向勾选随连接变化。

## 假设与开放问题

- GitHub 第一刀动作用 `GET /user`，不申请写 Issue 的 scope。
- Gmail OAuth 回调路径保持 `/api/feed/connectors/gmail/oauth/callback`（含项目前缀），完成后回到 Connectors 页。
- 删除 Feed 里的 GitHub/Gmail 任务不再拆除本机凭据。
