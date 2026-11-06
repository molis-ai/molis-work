# Sessions 来源与历史的合同设计（路线书 22）

状态：设计稿，2026-11-05 写，2026-11-06 按用户定的八项改完（第 13 节，决策记录在[需求 §8](spec.md#8-决策记录)）；没有实现，等公共合同台合审。第 02 批交完（#1762 已合入，#1775、#1786、#1790 在途）、C 轨交接之前不开合同代码。按 `origin/main` `1e8110a5e` 核对，形状按 #1762 合入后写（2026-11-06 已合入 `d82329833`）：动作 id 不带 `.v1`，版本写在 `version`，所以这里写 `projects.workspaces.list@1`。

## 0. 这份稿子做什么

[第 22 批](../post-anticorruption-roadmap/reference/batches/22.md#batch-22-item-1)交「Sessions 来源与历史合同」。写手照这份稿子写合同小 PR，第 34 批照它实现。本稿写九件事，和第 3～11 节一一对应：

| 节 | 内容 |
| --- | --- |
| 3 | 厂商与入口矩阵 |
| 4 | 外部工具登记表，三份名单怎样派生（BL-955） |
| 5 | 会话身份与去重（SRB-13） |
| 6 | 列表与读取动作、来源状态、分页、搜索 |
| 7 | 读取范围（SRB-06、SRB-12） |
| 8 | 项目归属与 AI 建议（SRB-14～16） |
| 9 | 新服务包、表、错误码、安全不变量、调用次数 |
| 10 | 合同 PR 怎样切、动哪些快照、和采集层的分界 |
| 11 | SRB-01～18 逐条归哪一批 |

产品规则已经定了，这里不重定：[需求](spec.md) §1～§5、§8 的定样 B／B／A、[来源盘点](source-inventory-2026-11.md)、[来源合同核查](source-contract-checks-2026-11.md)。本稿只写合同长什么样、归谁、怎么拆。用户 2026-11-06 定的八项摘要在第 13 节，正文写的 D1～D8 指这八项。

## 1. 原则

- **原生记录归外部工具。** Molis 只存能回到来源的索引，不存原文（需求 §4）。
- **一个事实一个主人。** 会话目录、来源进度、读取范围、单条归属是平台事实，归新服务 `horizontal/sessions`；项目与目录的关系归 Projects，只读不抄；账号与凭据归 connector-host，只存引用；持续跟进的记录归观测和采集层。
- **能力注册一次。** 动作由 `system.sessions` 提供，页面、工作流、Agent、MCP 用同一份。厂商差异只在登记表和适配里，不进页面、路由和插件。
- **登记的是「这个工具给了什么」，不是「Molis 接通了什么」。** 登记表写官方能力和缺口，改它是合同变更。接没接通看适配在不在，由服务在运行时报告（第 4.2 节）。这样第 34 批逐家接适配时不用反复排合同队列。
- **没核到就不写支持。** 盘点里「未查到」「待核」的项进登记表是缺口，不是空白，也不删行。
- **看不等于跑。** 列表、历史、搜索永远不让外部工具运行 Agent、发消息或改文件。
- **读取权与归属分开。** 归到项目不带读取权。项目里的 AI 能不能读，看这个项目的单独许可（第 7.4 节）。
- **可信身份不从输入读。** actor、项目、受众取自调用上下文。原生 ID 和路径也不从输入读：调用方只给 `session_key`，由服务在自己的索引里解析（第 5 节）。
- **现行取值。** 工具 id 沿用现值，存量 `runtime_id` 照样有效，不加读取兼容（[合同变更流程](../../docs/system/CONTRACT-CHANGES.md)）。

## 2. 现状（2026-11-05 核对）

| 现在 | 位置 | 对本稿的影响 |
| --- | --- | --- |
| 没有登记表、读取动作、服务包；`sessions.*` 动作 id 没人用 | 全仓搜索 | 新建，不用改名 |
| 工具名单不止三份，还有下面七处手写 | 见第 4.4 节 | BL-955 的范围要扩大，见第 12 节 |
| 目录关系只有路径，没有仓库：`workspace_id` 是规范路径的 SHA-256 | `modules/projects/src/workspace.ts` | 仓库由服务读 `.git` 文件现算，不给 Projects 加字段（第 8.2 节） |
| Projects 的跨项目读取已有：`ProjectsQueryApi.listWorkspaceDirectory()`，每条带 `project_ids` | `packages/contracts/src/modules/projects.ts` | 归属直接用，一次读完（第 8.1 节） |
| Runtime 工作入口已经能绑项目：`runtime_context_bindings`，键是 `runtime_id` + `stable_work_context_id`，MCP 下后者就是 Runtime 的会话号 | `modules/private-work-context`、`apps/local-host/src/mcp-authority.ts` | 只读进来作依据，不回写（D1，第 8.2 节）。批量读 `listRuntimeContextBindings()` 已有，宿主注入即可。这些绑定不都经本人确认：`user_confirmed` 取自模型给的参数，终端面板的绑定没有确认这一步 |
| 目录关系的来源混在 `bound_by` 里：`workspace_project_memberships.bound_by` 记写入者。工具绑定（`context_bind`）写 `<客户端>:<会话>`，但终端面板绑定时带 `cwd`，写的是打开终端的人；工具再绑一次还会覆盖本人写的值 | `modules/projects/src/workspace-repository.ts`、`modules/private-work-context/src/project-binding-commands.ts`、`apps/local-host/src/project-catalog.ts` 的 `terminalContextBinder` | 要先改 Projects，才分得清本人建的和工具带进来的（第 8.1 节，片 P-1） |
| 现役 MCP 流程里，目录成员只算建议，不算绑定 | `modules/private-work-context/src/project-resolution.ts` 的 `workspaceMemberSuggestions` | 与需求 §1.3 的「唯一关系自动归入」不同，新归属不走这段（第 8.2 节） |
| 系统搜索的来源协议可用，索引由本机用户建，有 `markChanged` | `packages/contracts/src/platform/search-sources.ts`、`horizontal/search` | 跨会话搜索的落点（第 6.4 节） |
| 宿主到页面没有通用推送，页面读 owner 的动作 | `docs/system/CALL-CHAINS.md` | 进度由页面在读取期间询问（D5，第 9.5 节） |
| 项目记录里没有「团队项目」这个标记，Home 现在只有一个人 | `packages/contracts/src/modules/projects.ts` | 「团队项目先不开放」现在没有东西可判，第 7.4 节写了团队批接入时做什么 |
| `<home>/sessions/` 是退役目录：新 Home 不创建，快照按未知条目拒绝 | `docs/system/HOME-DATA.md` | 新库不能用这个路径（第 9.2 节） |
| Home 上每个库只留当前基线，版本不符就拒绝，不写迁移链 | [合同变更流程](../../docs/system/CONTRACT-CHANGES.md) | 需求 §7 第 6 项的「进升级链」要按这条读（第 9.2 节） |
| `retainBackgroundAuthority` 只在调用活着时有效，不跨重启 | `packages/contracts/src/platform/actions.ts` | 后台发现的依据是读取范围这条记录，不是留住一次调用（第 7.3 节） |

## 3. 厂商与入口矩阵

覆盖[需求 §2](spec.md#2-已定覆盖范围) 每个产品入口。一行一个入口，CLI、IDE、桌面、云端分开，国内、国际分开。第一列的 id 就是登记表的 id。C-1 的测试把这份 id 全集写成字面量（第 4.5 节），有人删行就失败。

这张表是 2026-11-05 的公开资料核对结果，**不是已接通清单**。写适配时逐家在实装版本上复核（需求 §3）。

**接入方式：**

| 记号 | 含义 | 登记表里 |
| --- | --- | --- |
| 命 | 正式命令 | `via: "command"` |
| 协 | 协议或官方 SDK | `via: "protocol"` |
| 服 | 产品的账号接口 | `via: "service"` |
| 录 | 读本地记录；官方说是内部格式或没说，要按版本钉住解析，版本对不上报「这一版读不了」 | `via: "local_record"` |
| 界 | 缺口：只在 TUI 或产品界面里有，程序调不了 | `gap: "interactive_only"` |
| 私 | 缺口：私有或加密的存储，不解析（需求 §3） | `gap: "private_store"` |
| 无 | 缺口：官方资料说没有这项 | `gap: "not_offered"` |
| 账 | 缺口：要账号或企业权限，接口没核完 | `gap: "needs_account"` |
| 待 | 缺口：未查到或待核，**不等于没有**。括号里的线索写进 `note`，不算接入方式 | `gap: "unverified"` |

**可信度：** 官＝产品自己的文档；帮＝本机 `--help` 看过（写版本）；仓＝仓库里已在用；三＝第三方说法，没核对；待＝未查到。接入方式只认官、帮、仓；第三方说法和输出格式没核的命令都写成「待」，线索放括号里。每个缺口的回退：有导出写导出，否则「回到原工具」。

### 3.1 海外

| id | 产品入口 | 发现 | 列表 | 读历史 | 搜索 | 恢复 | 发送 | 停止 | 导出 | 可信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `codex` | Codex CLI | 协 `thread/list` | 协 `thread/list` | 协 `thread/read`、`thread/items/list` | 待 | 命 `codex resume <id>`（工作终端已接） | 命 `codex exec resume <id>`、`codex queue --thread` | 协 `turn/interrupt` | 待 | 官；帮 0.166.0。命令行把 `app-server` 标 experimental，官方页说这几个方法稳定，以实测为准 |
| `codex-ide` | Codex IDE 扩展 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 |
| `codex-desktop` | Codex 桌面 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 帮 0.166.0（只知道 `codex app` 能启动） |
| `codex-cloud` | Codex 云端任务 | 待（`codex cloud list` 存在，输出格式未核） | 待（同左） | 无：`status`、`diff` 只有状态和差异，不是对话 | 待 | 无：只有把差异应用到本地 | 无：`codex cloud exec` 是新任务，不算续接 | 待 | 待 | 帮 0.166.0，experimental |
| `claude-code` | Claude Code CLI | 协 Agent SDK `listSessions()` | 协 `listSessions()` | 协 `getSessionMessages()` | 界（选择器内） | 命 `--resume <id>`（工作终端已接） | 命 `-p --resume <id>` | 待：`claude agents --json` 只列运行中的 | 待 | 官。默认只留 30 天，读不到早期的不算没有。不用 SDK 时的备选是读 `~/.claude/projects/`，第 34 批这一片定，登记表只写实际走的那条 |
| `claude-code-desktop` | Claude Code 桌面 | 界 | 界 | 界 | 界 | 界（官方说能恢复 CLI 会话，是否共用未实测） | 界 | 界 | 待 | 官 |
| `claude-code-ide` | Claude Code VS Code | 界 | 界 | 界 | 界 | 界 | 界 | 界 | 待 | 官 |
| `claude-code-web` | Claude Code 网页 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点第 5 节待核） |
| `gemini-cli` | Gemini CLI | 待（`gemini --list-sessions` 存在，输出格式未查到） | 待（同左） | 录 `~/.gemini/tmp/<项目哈希>/chats/` | 待 | 命 `--resume <UUID>`（只用 UUID，序号会变） | 待 | 待 | 待 | 官 |
| `antigravity-cli` | Antigravity 终端 | 私 | 界 `/resume` | 私 | 待 | 界 `/resume` | 待 | 待 | 待 | 三 |
| `antigravity-desktop` | Antigravity 桌面 | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `copilot-cli` | Copilot CLI | 待（线索：`~/.copilot/session-state/<id>/`，三） | 界 `--resume` 选择器 | 待（线索：`events.jsonl`，格式未公开，三） | 待 | 命 `--resume <id>` | 待 | 待 | 待 | 官（命令） |
| `copilot-ide` | Copilot IDE 会话 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `copilot-coding-agent` | Copilot 编码 Agent（云端） | 命 `gh agent-task list` | 命 `gh agent-task list` | 命 `gh agent-task view --log` | 待 | 无 | 待 | 待 | 待 | 官，preview；盘点第 5 节写未查到，本稿查到 |
| `cursor` | Cursor Agent CLI | 私：`~/.cursor/chats` 是私有库（三） | 界：`agent ls` 不支持无头，官方人员确认过（2026-01 版） | 私 | 待 | 命 `--resume=<chat-id>` | 待 | 待 | 待 | 官 |
| `cursor-editor` | Cursor 编辑器 | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无 | 三 |
| `cursor-cloud` | Cursor 云端 Agent | 待（线索：`GET /v0/agents`，三） | 待（同左） | 待（线索：`/conversation`，三） | 待 | 待 | 待（线索：followup，三） | 待（线索：stop，三） | 待 | 三；需求 §2 没列，本稿补，官方页要再核 |
| `kiro-cli` | Kiro CLI | 待（`--list-sessions` 存在，输出格式未核） | 待（同左） | 待（线索：`~/.kiro/sessions/`，三） | 待 | 命 `--resume-id <id>` | 待：无头模式拿不到会话 ID（问题单） | 待 | 待 | 官（命令） |
| `kiro-ide` | Kiro IDE | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 待 | 三 |
| `devin-cloud` | Devin 云端 | 账 企业 API | 账 | 账 会话消息接口，要服务账号 | 待 | 界 网页 | 待 | 待 | 待 | 官（接口文档） |
| `devin-desktop` | Devin Desktop（原 Windsurf，2026-06 改名） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 官（改名公告）；会话未查到，盘点没写，本稿补 |
| `windsurf-cascade` | Windsurf／Cascade（旧版） | 私：加密 `.pb` | 界 | 私 | 界 | 界 | 界 | 界 | 无 | 三。Cascade 据报 2026-07-01 停，旧记录仍可能在用户机器上，行不删 |
| `grok-build` | Grok Build | 待（`grok sessions list` 存在，输出格式未核） | 待（同左） | 待：`~/.grok/` 无官方读取口 | 待（`grok sessions search` 存在，输出格式未核） | 命 `--resume <id>`（工作终端已接；别用标题） | 待 | 待 | 待 | 帮 1.0.70 |
| `junie-cli` | Junie CLI | 待（线索：`transcript.md`、`events.jsonl`，根目录未写） | 界 `/history` | 待（同左） | 界 | 界 `/history` | 待 | 待 | 待 | 官 |
| `junie-ide` | Junie IDE | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `droid` | Droid | 命 `droid search --json` | 界 `/sessions` | 待：`-o json` 是运行输出 | 命 `droid search --json` | 命 `droid resume <id>` | 命 `droid exec -s <id>` | 待 | 待 | 官 |
| `amp` | Amp CLI | 待（`amp threads list` 存在，输出格式未核） | 待（同左） | 命 `amp threads markdown`、`export`（JSON 只给创建者） | 待（`amp threads search` 存在，输出格式未核） | 待 | 待 | 待 | 命 `amp threads export` | 官；flag 未核。盘点第 5 节待核，本稿查到 |
| `amp-web` | Amp 网页 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 界 | 官说「各端同一线程」，共用未实测 |

### 3.2 国内与开放工具

| id | 产品入口 | 发现 | 列表 | 读历史 | 搜索 | 恢复 | 发送 | 停止 | 导出 | 可信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `qwen-code` | Qwen Code | 命 `qwen sessions list --json` | 命 | 待：`/export` 在 TUI 内；`--acp`、`@qwen-code/sdk/peer` 未核 | 待 | 界 `/resume` | 待 | 待 | 界 `/export` | 官。`qwen sessions ps --json` 可报运行中 |
| `lingma` | 通义灵码 | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `qoder` | Qoder CLI（国际） | 待（`--list-sessions` 存在，输出格式未核） | 待（同左） | 待：`-p -o json` 是运行输出 | 待 | 命 `-r <id>` | 待 | 待 | 待 | 官 |
| `qoder-ide` | Qoder IDE（国际） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `qoder-cn` | Qoder CLI（国内，`qodercn`） | 待（`qodercn --list-sessions` 存在，JSON 输出未写） | 待（同左） | 录 `~/.qoder-cn/projects/<目录>/<id>.jsonl` | 待 | 命 `qodercn -r <id>` | 待 | 待 | 待 | 官；盘点写待核，本稿查到。与国际版是否共用未写，按不共用 |
| `qoder-cn-ide` | Qoder IDE（国内） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `codebuddy` | CodeBuddy Code（国际） | 待 | 待：列表命令未查到 | 待：只知日志在 `~/.codebuddy/logs/` | 待 | 命 `-r <id>`（交互模式） | 待 | 待 | 待 | 官 |
| `codebuddy-cn` | CodeBuddy（国内） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（地区版本未核，本稿补） |
| `codebuddy-ide` | CodeBuddy IDE | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `trae` | TRAE（国际） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三。国内外是两个站，历史是否互通未查到 |
| `trae-cn` | TRAE（国内） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `solo` | SOLO（国际） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `solo-cn` | SOLO（国内） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `kimi-code` | Kimi Code | 录 `~/.kimi-code/sessions/` | 界 `/sessions` | 待（`kimi export <id>` 存在，输出格式未核） | 待 | 命 `--session <id>` | 待：`kimi acp`、Server API 未核 | 待 | 待（同左） | 官 |
| `zcode` | ZCode | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 待 | 三 |
| `minimax-code` | MiniMax Code | 录 `~/.minimax` | 界 `/sessions` | 录 | 界 | 命 `mcode --session <id>` | 待 | 待 | 待 | 官 |
| `minimax-agent` | MiniMax 开发 Agent（网页） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `comate` | 文心快码 Comate | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 |
| `zulu` | Zulu | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 |
| `codearts-agent` | CodeArts 代码智能体 | 待 | 待 | 待 | 待 | 待：有 `codearts run`，会话命令未查到 | 待 | 待 | 待 | 官（CLI 存在） |
| `opencode` | OpenCode | 待（线索：`opencode session list`，三） | 待（同左） | 待（线索：`opencode export <id>`，三） | 待 | 命 `--session <id>`（工作终端已接） | 待 | 待 | 待（同左） | 仓（恢复）；其余三 |
| `pi-agent` | Pi Agent | 录 `~/.pi/agent/sessions/`（可被 `--session-dir` 与环境变量改） | 界 `--resume` 选择器 | 录 | 待 | 命 `--session <id>`（工作终端已接；接受路径和部分 ID，只传完整 ID） | 待：`--mode rpc` 未核 | 待 | 命 `--export <file>`（HTML） | 帮 1.5.0；盘点写待核，本稿查到 |

### 3.3 三个读表要注意的

- **恢复与发送不是本批接的。** 这两列和停止列只是登记能力，实现在第 59 批。第 34 批只接前四列和导出。表里「搜索」列的「待」多是命令已知、输出没核，复核后写手改成「命」。
- **同品牌不外推。** `claude-code` 接通不代表 `claude-code-web` 接通。入口之间是否共用会话，只在实测后写进 `shares_sessions_with`（第 5.2 节）。
- **一项能力只登一种接入方式。** `claude-code`、`codex` 优先协议，少碰内部格式。Agent SDK 是新增 npm 依赖，由第 34 批这一家的适配片定（第 9.1 节），登记表随实现改成实际走的那条。

## 4. 外部工具登记表

### 4.1 类型

新子路径 `packages/contracts/src/platform/external-tools.ts`（导出 `./platform/external-tools`）。纯数据，没有函数值，所以恢复参数写成模板。

```ts
export type ExternalToolSurface = "cli" | "ide" | "desktop" | "cloud";
export type ExternalToolRegion = "global" | "cn" | "unspecified";
export type ExternalToolTrust = "official" | "help" | "repository" | "third_party" | "unverified";
export type ExternalToolGap = "not_offered" | "private_store" | "interactive_only" | "needs_account" | "unverified";
export type ExternalSessionCapability = "discover" | "list" | "read" | "search" | "resume" | "send" | "stop" | "export";

/** 一项能力怎样接：四种接入方式，或者一个带原因的缺口。 */
export type ExternalToolAccess =
  | { via: "command"; argv: readonly string[]; output: "json" | "jsonl" | "text" | "interactive"; trust: ExternalToolReachedTrust }
  | { via: "protocol"; protocol: string; method: string; trust: ExternalToolReachedTrust }
  | { via: "service"; service_id: string; trust: ExternalToolReachedTrust }
  | { via: "local_record"; root: ExternalToolPath; format: "documented" | "internal"; trust: ExternalToolReachedTrust }
  | { via: "gap"; gap: ExternalToolGap; note: string; fallback: "return_to_tool" | "export" | "none"; trust: ExternalToolTrust };

/** 接入方式只认这三种：第三方说法和未核的只能是缺口。 */
export type ExternalToolReachedTrust = "official" | "help" | "repository";

/** 路径写成「基准 + 相对段」，由宿主按当前用户展开；`env` 覆盖基准，只认绝对路径。 */
export interface ExternalToolPath {
  base: "home" | "xdg_config";
  segments: readonly string[];
  env?: string;
}

export interface ExternalToolEntry {
  id: string;
  display_name: string;
  vendor: string;
  surface: ExternalToolSurface;
  region: ExternalToolRegion;
  /** 只在实测确认共用同一份原生会话后才写，值是主入口的 id（第 5.2 节）。 */
  shares_sessions_with?: string;
  /** 怎样确认本机这个命令真是这个工具（第 4.3 节）。 */
  detect?: { commands: readonly string[]; real_path_pattern?: string; version_argv: readonly string[]; version_pattern: string };
  /** 本机入口必填：这家把会话放在哪；公开资料查不到时写 null（第 5.1 节）。云端入口不写。 */
  data_root?: ExternalToolPath | null;
  mcp_integration?: true;
  /** 恢复参数只写在 sessions.resume 一处，这里只有命令名。 */
  terminal?: { command: string };
  character_import?: { config_root: ExternalToolPath };
  sessions: Readonly<Record<ExternalSessionCapability, ExternalToolAccess>>;
  /** 这一行最后核对的日期与版本。 */
  checked: { on: string; version?: string };
}
```

`argv` 里只有占位符 `{session_id}`、`{query}` 由宿主替换，且必须独占一个元素：

```ts
{ id: "codex", terminal: { command: "codex" },
  sessions: { resume: { via: "command", argv: ["resume", "{session_id}"], output: "interactive", trust: "help" }, /* … */ } }
```

### 4.2 登记与接通分开

| 问题 | 谁答 | 改它要不要合同 PR |
| --- | --- | --- |
| 这个工具给了什么、缺什么 | 登记表 | 要 |
| Molis 现在接没接通 | `horizontal/sessions` 里有没有这个 id 的适配，由 `sessions.scope.read@1` 报 `adapter: "available"` 或 `"none"` | 不要 |
| 这台机器上这个版本读不读得了 | 适配运行时判断，报来源状态 | 不要 |

登记表说能读、适配还没有时，来源状态是 `unsupported`，原因 `adapter_pending`，和工具本身不支持的 `tool_gap` 分开（SRB-01）。

### 4.3 派生（BL-955）

```ts
export const EXTERNAL_TOOLS = [ /* 第 3 节的每一行 */ ] as const satisfies readonly ExternalToolEntry[];
export type ExternalToolId = (typeof EXTERNAL_TOOLS)[number]["id"];

type ToolWith<Key extends string> = Extract<(typeof EXTERNAL_TOOLS)[number], Record<Key, unknown>>;

const idsWith = <Key extends string>(key: Key): readonly ToolWith<Key>["id"][] =>
  EXTERNAL_TOOLS.filter(tool => key in tool).map(tool => tool.id) as ToolWith<Key>["id"][];
```

| 名字 | 怎样得出 | 留在哪 |
| --- | --- | --- |
| `SUPPORTED_RUNTIME_IDS`、`SupportedRuntimeId` | `idsWith("mcp_integration")` | `installation-detection.ts`，`app-host.ts` 的转出不动 |
| `RUNTIME_DISPLAY_NAMES` | 这些 id 的 `display_name` | 同上 |
| `TERMINAL_RUNTIMES`、`TerminalRuntime` | `idsWith("terminal")` | `apps/local-host/src/plugin-terminal-runtimes.ts`，`RECIPES` 删掉，`terminalRuntimeRecipe` 读 `terminal.command` 与 `sessions.resume.argv` |
| `CHARACTER_IMPORT_RUNTIMES`、`CharacterImportRuntimeId` | `idsWith("character_import")` | `character-import.ts` |

三个要点：

- **顺序是合同。** 登记表把这六家排在最前：`codex`、`claude-code`、`cursor`、`opencode`、`pi-agent`、`grok-build`。这样三份名单的成员和顺序都和今天一样，界面排序不变，PR 里写「成员不变，对调用方无影响」。
- **`cursor` 这个 id 留给 Agent CLI 一行。** 它今天只用于角色导入，配置根目录 `~/.cursor` 由 CLI 和编辑器共用；编辑器是另一行 `cursor-editor`，不带 `character_import`。
- **命令名不够认人。** 本机 `agent` 是指向 grok 的链接，而 Cursor 的命令也叫 `agent`。`character-import-discovery.ts` 现在已按真实路径核（命令名是 `agent` 时匹配 `.cursor` 或 `grok`，注释写明光看文件名不够），换成 `detect` 时**这个检查要保住**，写成 `real_path_pattern`。顺序是先看路径，路径不符不运行；过了才跑 `version_argv` 匹配 `version_pattern`，不符就当没装，不把输出交给这家的解析器。比现在多运行一次本机程序，所以写进 S-115。

会话 ID 的规则只留一份：`plugin-terminal-runtimes.ts` 的 `TERMINAL_SESSION` 正则搬到 `external-tools.ts`，导出 `EXTERNAL_SESSION_NATIVE_ID_PATTERN`。`isTerminalSessionId` 留在原处用它，行为不变，S-103 的代码位置一格不用改。[核查 §3.2](source-contract-checks-2026-11.md#32-合成一份的做法) 写的「不动」指行为，这里只搬定义，理由是服务包也要同一条规则，不写第二份。

### 4.4 还有七处手写要一起收

`git grep '"grok-build"'` 查到的，核查和 BL-955 原来只算了三份：

| 位置 | 是什么 | 收法 |
| --- | --- | --- |
| `apps/desktop/src/web-host.ts` | 命令可用性表 | 遍历 `TERMINAL_RUNTIMES`，命令名取配方。这是 F 轨独占文件，见第 10.1 节 |
| `apps/workbench/src/terminal/pane.ts` | 显示名表（服务端渲染） | 同上；显示顺序今天是 Claude Code 在前，保留要写一句 |
| `apps/workbench/src/browser/characters/common.ts` | 显示名表（**浏览器**） | 不把登记表带进浏览器：宿主在快照候选上下发 `label`，页面读它 |
| `apps/local-host/src/character-import-discovery.ts` | `LABELS` 与命令名表 | 读 `display_name` 与 `detect`，路径检查保住（第 4.3 节） |
| `apps/local-host/src/character-import-paths.ts` | 配置根目录表 | 读 `character_import.config_root` |
| `modules/characters/src/service.ts` | 显示名表 | 读 `display_name` |
| `apps/workbench/src/characters/import-ui.ts` | 下拉选项 | 由宿主渲染时遍历 `CHARACTER_IMPORT_RUNTIMES` |

`character-import-runtimes.ts` 的扫描函数表和 `runtime-config-adapters.ts` 的适配是行为，不是名单，留在宿主，用 `Record<CharacterImportRuntimeId, …>` 这类派生类型钉住，缺一家就编译不过。

**第十二处，这次不收：** `modules/shelf/src/runtimes.ts` 的 `SHELF_ENGINES`（9 家）。它的键是 `grok`、`claude` 这样的另一套值，已存进 Shelf 的设置；说的是「能跑无头任务的引擎」，命令名也和这里不同（Cursor 只认 `cursor-agent`）。硬收要么改存量键，要么在登记表再加一套键，都超出 C-1。留作 BL-955 的余项，第 4.5 节的扫描也拦不到它。

**页面资源。** 登记表 50 行，浏览器不许 import 它。插件里 `RUNTIME_DISPLAY_NAMES` 的值只有 `plugins/native/goals/src/event-acknowledgement-body.ts` 在用，写手要跑 `pnpm page-assets:check` 确认这个文件不进页面包；进了就改由宿主给名字，不放宽预算。

### 4.5 防止手写回潮的测试

`tests/action-external-tools.test.ts`，随 `test:contracts` 的 `tests/action-*.test.ts` 跑，不改 CI。测试名写 SRB-01、SRB-07。

| 断言 | 拦什么 |
| --- | --- |
| 三份名单等于今天的成员与顺序（写字面量，只有这里许写） | 派生顺序变了 |
| 三份名单等于登记表按字段筛出的结果 | 绕开派生 |
| 登记表的 id 全集等于测试里的字面量（第 3 节的 50 行） | 有人删行；改名或增行要同时改测试。不读设计稿，归档后路径会断 |
| `via` 不是 `gap` 时 `trust` 只能是 `official`、`help`、`repository`（类型挡一层，测试再挡一层）；`gap` 必须有 `note` | 未核的写成支持 |
| `sessions` 八项都有；`shares_sessions_with` 指向存在的 id、不成链；`surface` 不是 `cloud` 时必须写 `data_root` 这个键 | 漏项 |
| 有 `terminal` 的行 `sessions.resume` 必须是 `via: "command"`；`argv` 里每个占位符独占一个元素；`command` 是裸命令名 | 拼接注入；终端能跑却没有恢复参数 |
| 用 TypeScript AST 扫 `apps`、`horizontal`、`modules`、`packages`、`plugins` 的 `.ts`：数组字面量含两个以上登记 id 一律失败；对象字面量含两个以上登记 id 作键时，只有声明类型是派生类型的 `Record<…>`、**且值都是函数**才放过；登记表文件自身除外 | 手写名单回潮。`Record<…, string>` 的手写显示名表照样拦。放在测试里，不改门禁脚本 |

## 5. 会话身份与去重

### 5.1 身份

| 部分 | 取值 | 为什么 |
| --- | --- | --- |
| `entry_id` | 主入口 id：有 `shares_sessions_with` 就取它指向的 | 同一份会话从两个入口看到时是一条 |
| `location_key` | 本机：`local:` + `data_root` 展开后路径 SHA-256 的前 24 位，写法同 `workspace_id`；`data_root` 是 `null` 时写 `local:default`；云端：`connection:` + `connection_id` | 两个 `CODEX_HOME` 是两个来源 |
| `native_id` | 工具给的稳定 ID，必须过 `EXTERNAL_SESSION_NATIVE_ID_PATTERN` | 序号、标题、路径都不算身份 |

本机的 `location_key` 不用读任何会话就算得出，所以还没允许时也有值。`data_root` 按宿主进程的环境展开（`env` 优先），路径存在时取真实路径。`data_root` 是 `null` 的工具分不开两个数据目录，这是缺口。云端来源选了连接才有 `location_key`。

`session_key` = `xs_` + 三者规范 JSON 的 SHA-256 前 32 位。确定值，重扫得到同一个，不靠随机号。

```ts
export interface ExternalSessionIdentity { entry_id: ExternalToolId; location_key: string; native_id: string }
```

列表行同时给 `session_key` 和 `identity`，读取只收 `session_key`。需求要「能辨认」，这里满足；同时调用方写不进任意原生 ID 或路径，只能读索引里已有、范围内的会话。

云端用 `connection_id` 是因为 `ConnectorConnectionRecord` 只有 `account_label`，没有稳定账号号。代价：删掉连接再新建同一账号，等于新来源，旧行随旧连接移出范围，看不到重复，但旧的单条归属要重选。第 13 批以后连接有稳定账号号时，改合同换掉。

本机的账号：工具不在记录里写账号时分不开，身份只到数据目录。同一目录下换账号，原生 ID 不同，不会误合并，但读取范围不能按账号收窄，界面不许写成能。

### 5.2 去重规则

| 情况 | 结果 |
| --- | --- |
| 重试、重扫、重启后再扫 | 同一身份，`UPSERT`，不新增 |
| 两个入口，已实测共用（写了 `shares_sessions_with`） | 一条，`seen_via` 记入口 |
| 两个入口，没实测 | 两条，不猜；这种时候适配读的也是两份存储 |
| 不同账号或地区版本，原生 ID 恰好相同 | `location_key` 或 `entry_id` 不同，两条 |
| 标题、目录相同 | 不比较，绝不合并 |
| 分叉出新 ID | 新的一条，`forked_from` 指向来源的 `session_key` |
| 原工具改了标题或目录 | 同一条，字段更新 |
| 原生 ID 不合规 | 不进索引，来源上记 `skipped_count`，不当作没有 |
| 原工具里没了 | **完整列出之后**才记 `gone_at` 并隐藏；部分失败的一轮不删（同系统搜索的规则） |

SRB-13 的测试至少覆盖：中断后重扫行数不变、两个 `location_key` 下同 `native_id` 两行、同标题不同工具两行、部分失败不产生 `gone_at`。

## 6. 动作

提供方 `system.sessions`（`SESSIONS_PROVIDER_ID`），合同在新子路径 `packages/contracts/src/services/sessions.ts`。第 1 版都是 `scope: "home"`，和 `search.query` 同样从调用上下文取当前项目。

| 动作 | operation／effect | 受众 | 权限 | `scheduling` | 第几片 |
| --- | --- | --- | --- | --- | --- |
| `sessions.list@1` | query／read | `user`、`agent`、`workflow`、`mcp`、`plugin` | `sessions:read` | `concurrent` | C-2 |
| `sessions.history.read@1` | query／read | `user`、`agent`、`workflow`、`mcp`、`plugin` | `sessions:history` | `concurrent` | C-2 |
| `sessions.scope.read@1` | query／read | `user` | `sessions:read` | `concurrent` | C-2 |
| `sessions.scope.set@1` | command／write | `user` | `sessions:manage` | 不声明 | C-2 |
| `sessions.project_ai_read.set@1` | command／write | `user` | `sessions:manage` | 不声明 | C-2 |
| `sessions.discovery.run@1` | command／write | `user` | `sessions:manage` | 不声明（只排队，立刻返回） | C-2 |
| `sessions.attribution.set@1` | command／write | `user` | `sessions:manage` | 不声明 | C-3 |
| `sessions.attribution.suggest@1` | command／write | `user` | `sessions:manage` | `concurrent` | C-3 |
| `sessions.search.entries@1` | query／read | `user` | `sessions:read` | `concurrent` | C-3 |
| `sessions.tool.search@1` | query／read | `user` | `sessions:read` | `concurrent` | C-3 |

`sessions.list@1` 只读自己的库，本身不等外部服务。声明 `concurrent` 是为了不排在 Home 的串行队列里被长任务挡住，和 `search.query` 同样处理。

两个读取动作的受众写五种，是为了登记一次、各入口共用；实际能读什么由处理器按第 7.4 节收窄。

恢复、发送、停止、交接的动作第 59 批再加，不在这里占位：只读与控制的授权分开（需求 §1.1、SRB-11），早加没有消费者。

### 6.1 `sessions.list@1`

```ts
export interface ExternalSessionListInput {
  /** project＝调用者当前项目；unfiled＝待归类；all＝全部。后两种只有 user。 */
  view: "project" | "unfiled" | "all";
  entry_ids?: ExternalToolId[];
  cursor?: string | null;
  limit?: number;              // 1～100，默认 50
}

export interface ExternalSessionListOutput {
  sessions: ExternalSessionRow[];
  /** 给本人时：每个来源一条，含未允许和暂不支持的。一个入口通常一条，云端一个连接一条，还没选连接的入口也有一条。 */
  sources: ExternalSessionSource[];
  /** 只给本人；别的受众是 null。 */
  unfiled_count: number | null;
  next_cursor: string | null;
  scope_revision: number;
  /** 固定值：标题和目录来自外部工具，不是指令。 */
  trust: "untrusted";
}

export interface ExternalSessionRow {
  session_key: string;
  identity: ExternalSessionIdentity;
  tool: { entry_id: ExternalToolId; display_name: string; surface: ExternalToolSurface; region: ExternalToolRegion };
  seen_via: ExternalToolId[];
  title: string | null;          // 来自外部工具，不可信文本
  directory: string | null;
  last_activity_at: string;
  activity: "running" | "idle" | "unknown";   // 工具报不了就是 unknown，不猜
  attribution: ExternalSessionAttribution;     // 第 8.3 节
  forked_from: string | null;
  return_target: { kind: "command" | "url"; label: string } | null;
}
```

- 排序 `last_activity_at DESC, session_key`，游标是这两项的键集，不用偏移：边读边发现新会话时不重不漏。
- `view: "project"` 没有当前项目时报 `sessions.project_required`。
- 每次都按当前读取范围过滤，范围外的行不返回（第 7 节）。`user` 以外的调用者另按第 7.4 节核许可。
- 打开列表不等发现。来源过期（默认 5 分钟）且调用者是 `user` 时，服务去重后在后台排一次发现，不阻塞这次返回。Agent、MCP 调用不触发，防止循环调用变成频繁起子进程；带 `query_only` 的调用（首页聚合这样调）也不触发。
- 非本人调用不漏全局信息：`unfiled_count` 是 `null`；`sources` 只留当前项目有会话的来源，`session_count` 是这个项目里 `confirmed`、`automatic` 的数，`skipped_count`、`progress`、`location_key` 不给。用户接了哪些工具、别的项目和待归类有多少，都看不到。`title` 过 SDK 的密钥脱敏，理由同第 6.3 节。
- 页面不用第二个请求：`sources`、`unfiled_count` 都在这一个响应里。

### 6.2 来源状态

```ts
export type ExternalSessionSourceState =
  | "complete"            // 已读完（范围里确实没有会话时也是它，count 为 0）
  | "reading"             // 在读
  | "needs_login"         // 需要登录
  | "version_unreadable"  // 这一版读不了
  | "failed"              // 没读成
  | "unsupported"         // 暂不支持
  | "not_allowed";        // 未允许

export interface ExternalSessionSource {
  entry_id: ExternalToolId;
  location_key: string | null;   // 本机来源总有值；云端来源没选连接时才空
  display_name: string;
  state: ExternalSessionSourceState;
  reason: ExternalSessionSourceReason | null;
  session_count: number;
  skipped_count: number;
  progress: { read: number; total: number | null } | null;
  /** 上次完整读完的时间；没读成时已有的结果照常显示，用它说明截止到什么时候。 */
  completed_at: string | null;
  next_step: "open_scope" | "sign_in" | "update_tool" | "retry" | "return_to_tool" | "export" | null;
}

export type ExternalSessionSourceReason =
  | "adapter_pending" | "tool_gap"                         // unsupported
  | "tool_missing" | "timed_out" | "read_error"            // failed
  | "version_mismatch" | "parse_error"                     // version_unreadable
  | "login_expired" | "connection_removed";                // needs_login
```

七个状态是互斥的当前状态，一个来源一个。「没有会话」只有一种写法：`complete` 且 `session_count` 为 0。其余任何情况都不返回「空且正常」（SRB-13、需求 §7 第 13 项）。

判定顺序：范围不允许 → `not_allowed`；没有适配或工具缺这项 → `unsupported`；正在跑 → `reading`；否则看上一轮结果。

### 6.3 `sessions.history.read@1`

```ts
export interface ExternalSessionHistoryInput {
  session_key: string;
  /** 不写就是最新一页。before 往更早读，after 往后读，around 跳到命中位置。 */
  from?: { before: string } | { after: string } | { around: string };
  limit?: number;                // 1～200，默认 50
  query?: string;                // 会话内搜索，1～200 字，字面匹配
}

export interface ExternalSessionHistoryOutput {
  session_key: string;
  entries: ExternalSessionEntry[];
  older_cursor: string | null;
  newer_cursor: string | null;
  matches: Array<{ position: string; ranges: Array<[number, number]> }>;
  search: { scanned_all: boolean; next_cursor: string | null } | null;
  read_state: "complete" | "partial";
  stopped: { code: string; at: string | null; retryable: boolean } | null;
  activity: "running" | "idle" | "unknown";
  /** 固定值：这里的文字来自外部工具，不是指令。 */
  trust: "untrusted";
}

export interface ExternalSessionEntry {
  position: string;              // 不透明、稳定；日志追加后旧位置不变
  role: "you" | "tool" | "tool_step" | "note";
  at: string | null;
  text: string;                  // 单条最多 64 KB
  truncated: boolean;
  step?: { name: string; status: "ok" | "failed" | "unknown" };
}
```

- 四种 `role` 对应定样 A 的「你／工具／工具步骤／说明」。工具的隐藏推理不输出。附件不读，写一条 `note`。
- 一页文字合计不超过 256 KB，到了就提前结束，用 `older_cursor` 接着读。
- **读到一半断了**：已读的照常返回，`read_state: "partial"`，`stopped` 写码和位置。**一条都没读到**：抛错，码见第 9.3 节，不返回空页。
- `session_key` 不在索引里、已在目录范围外、或不归调用者当前项目：一律 `sessions.not_found`，不透露它存在。来源整个没允许，本人调用时才报 `sessions.not_allowed`，别的受众还是 `sessions.not_found`。
- **会话内搜索**：原文不落盘，所以每次在来源上流式扫。一次最多扫 32 MB，超了 `scanned_all: false`，用 `search.next_cursor` 接着扫。同一会话的解析结果可放进程内短缓存，键含文件大小与修改时间，不写库。
- 不调模型，不等 AI（需求 §4）。
- 给 `agent`、`workflow`、`mcp`、`plugin` 的输出过 SDK 的密钥脱敏；给 `user` 的是原文。原因：工具步骤的输出里可能有密钥，本人看自己的记录没问题，进别的上下文不行。

### 6.4 跨会话搜索

跨会话搜索只到标题、目录、工具名（D3）。三层：

| 层 | 做什么 | 落在哪 |
| --- | --- | --- |
| 找会话 | 标题、目录、工具名 | `sessions.search.entries@1`，`defineSearchEntriesAction` 声明的来源，`content: "summary"`，`scope: "home"`，`audiences: ["user"]`。经 `search.query` 查，`project_id` 为空，算个人内容 |
| 在一个会话里找 | 这个会话的正文 | `sessions.history.read@1` 的 `query`（第 6.3 节） |
| 在这个工具里搜 | 工具自带搜索的（登记表 `search` 不是缺口的，现在只有 Droid；Grok Build、Amp 有搜索命令，输出格式核过后加入） | `sessions.tool.search@1` |

全文索引不做，原文不进任何索引。以后要做另议，做的话是本人开启。

`sessions.tool.search@1` 输入 `{ entry_id, location_key, query, limit }`，输出 `{ sessions: ExternalSessionRow[]; skipped_count: number }`。只返回索引里有、当前范围内的会话，返回前按第 7.3 节尾检；工具报出的其他结果只计入 `skipped_count`。`query` 以 `{query}` 占一个 `argv` 元素，不许以 `-` 开头（S-115）。工具的 `search` 是缺口时报 `sessions.source_unsupported`。

「找会话」这一层的三条约束：

- 只列当前范围内的会话；`collection_revision` 含 `scope_revision` 和目录表摘要。
- 范围变了就调 `SearchService.markChanged("system.sessions", null)`，两条来路：`sessions.scope.set@1` 提交后由服务调；项目目录关系变了由宿主调，见第 7.3 节。只标记不够：查询有时间预算，收窄后的旧条目可能还在。第 34 批要加一条测试，收窄后紧接着 `search.query` 不返回范围外的标题；过不了就要给搜索补一个同步移除的端口，这是对 `horizontal/search` 的改动，由它的主人落。
- `search.open` 用 `external_session` 的对象读取器重新核对范围。

### 6.5 第 20 批怎样用

场景套组把 `sessions.list@1` 写成 `requires` 的可选依赖。

**就绪判断**（D4 带来的变化，由主会话转交第 20 批）：要同时满足两条，由外壳以本人身份调 `sessions.scope.read@1` 判断，不要计数：

1. `sources` 里至少有一项 `allowed` 为真且 `adapter` 是 `available`；
2. `project_ai_reads` 里 `current` 为真的那一行 `allowed` 是 `true`。

第二条默认是关的。缺第一条时去处是读取范围的「工具与目录」页，缺第二条时去处是「项目的 AI」页并定位到当前项目，两者分开显示。

生成页面按 `plugin` 受众调，只能用 `view: "project"`，主体与项目来自页面记录（[场景合同 §6.4](../scene-and-page-contract/spec.md#64-页面主体与授权)）。许可关着时调用报 `sessions.project_ai_read_off`，页面显示未就绪，不当成空列表。「最近会话」用 `limit` 取前几条，一个请求。

## 7. 读取范围

### 7.1 归谁

读取范围归 `horizontal/sessions`（D6）。账号和凭据仍归 connector-host，云端来源只存 `connection_id`，读取时另核连接有效。

```ts
export interface ExternalSessionReadScope {
  entry_id: ExternalToolId;
  location_key: string;
  allowed: boolean;
  directories: { mode: "all" } | { mode: "linked_projects" };
  connection_id: string | null;      // 云端来源才有
  revision: number;
  decided_at: string;
}

/** sessions.scope.read@1 的输入：Sheet 要计数，就绪判断不要。 */
export interface ExternalSessionScopeReadInput { include_counts?: boolean }

export interface ExternalSessionScopeView {
  sources: Array<ExternalSessionReadScope & { adapter: "available" | "none" }>;
  /** 全部项目各一行，给「项目的 AI」那一页（第 7.4 节）。 */
  project_ai_reads: ExternalSessionProjectAiRead[];
  scope_revision: number;
}
```

`directories` 的两种就是定样 Sheet 上的两个选项。`linked_projects` 是活的：本人给项目新连上目录就进范围，解除就出范围，每次按 Projects 当前的目录算。**只认本人建的目录关系**（第 8.1 节）：工具绑定时带进项目的目录不算，所以工具扩不了这个范围。范围包含这些目录的子目录，以及这些目录在同一仓库的 worktree 里对应的位置（D2，判法同第 8.2 节的第 1、2 条）。这不算扩大授权，用户选的就是这个说法；Sheet 文案要写明含 worktree。

读取范围是权限边界，认不出的目录不能算进去。没有目录的会话（云端、目录丢失）、已删或认不出的 worktree、工具带进项目的目录下的会话，在 `linked_projects` 下都不在范围内，不进索引，也不会有 AI 建议。用户要选「所有目录」才看得到它们；这时没有绑定的进待归类，走第 8.2 节的 AI 建议，有工具绑定的是 `reported`。

发现时范围外的会话在写库前过滤掉，不进索引。

**这一版的能力缺口：** 不能按时间限定读取范围，没有这个字段（D7）。本机工具不写账号时也不能按账号收窄（第 5.1 节）。

### 7.2 收窄与停止

`sessions.scope.set@1` 只给 `user`：

```ts
export interface ExternalSessionScopeSetInput {
  sources: Array<{ entry_id: ExternalToolId; connection_id?: string; allowed: boolean; directories: ExternalSessionReadScope["directories"] }>;
  expected_revision: number;         // 全局的 scope_revision，不是单个来源的
}
// 输出：ExternalSessionScopeView
```

整份替换。`location_key` 由服务算，不从输入读；云端来源第一次允许时给 `connection_id`。`expected_revision` 不符报 `sessions.scope_conflict`。步骤：

1. 写新范围，`revision` 加一，全局 `scope_revision` 加一。
2. 事务后取消被收窄来源的在跑任务（每个来源一个 `AbortController`）。
3. 调搜索的 `markChanged`。
4. 放宽的来源排一次发现。

`sessions.discovery.run@1` 输入 `{ entry_id?: ExternalToolId }`，不写就是全部允许的来源；输出 `{ queued: ExternalToolId[] }`，只排队，立刻返回。

收窄不删索引行，只是不再返回（需求 §1.2「不隐式清理旧数据」；定样「之前读到的也不显示」）。再放宽时旧行重新出现，并按最新结果校正。暂不支持的工具不能勾，勾了报 `sessions.source_unsupported`。

### 7.3 异步返回前怎样再核

外部读取前后范围可能变。四处用同一个函数 `assertInScope(session, caller, snapshot)`，全程同步、不让出。

**它不看版本号短路，每次按当前状态重算：** 用项目快照（第 8.1 节）和范围行，算这个会话还在不在范围内；`user` 以外的调用者再核项目许可，以及会话是否还以 `confirmed` 或 `automatic` 归这个项目。原因：`linked_projects` 的范围跟着项目目录变，解除目录、删除项目都不经 `sessions.scope.set@1`，`revision` 不变。

**一批取一次快照。** 核查写在 `projects.read(snapshot => { … })` 的回调里：回调是同步的，取一次快照，逐行比完就给出结果，中间不 await。一批 N 行只读一遍目录表，安全上和逐行重读等价。

| 路径 | 等待前 | 等待后 |
| --- | --- | --- |
| `sessions.history.read@1` | 解析 `session_key`，`assertInScope` | `await caller.beforeEffect()`，再在 `projects.read` 的回调里同步调 `caller.assert_authority_current?.()` 和 `assertInScope`，回调给出结果后**不再等别的**，直接返回。失败抛 `sessions.scope_changed`，不带内容 |
| `sessions.tool.search@1` | 核来源已允许 | 同上；结果逐行过 `assertInScope`，范围外的行去掉 |
| AI 建议 | 只把范围内的材料交给模型 | `await caller.beforeEffect()`，`projects.read` 的回调里开写建议的事务，事务里 `assertInScope`；范围外的结果丢弃，不写 |
| 后台发现 | 读范围 | 每批取一次快照，写库的事务里逐行重算范围，范围外的不写；来源已不允许时整批丢弃 |

云端来源多核一条：连接仍在且 `enabled`（`ports.connections.current`）。

**目录关系变了谁通知。** 服务导出 `directoriesChanged()`，宿主在目录关系的每个写入口之后调：`projects.workspaces.add`、`repair`、`unlink`，项目删除，以及 `context_bind` 里的目录写入。它做两件事：取消已不在范围内的在跑任务，调 `searchChanged()`。漏调不会放出原文，因为上面的尾检是现算的；只影响后台任务和搜索索引何时收窄。

后台发现的依据是读取范围这条记录，不是留住某次调用的授权：它要跨重启接着读，而 `retainBackgroundAuthority` 不跨重启。需求 §1.2 也要求已有许可不因重启重问。Host 关停时取消全部任务；启动时把上一轮没读完的来源排回队列，从 `session_sources` 的进度接着读。

被取消或收窄的调用不写业务记录，符合 AGENTS 硬约束；来源进度行也按同一规则，中止时不更新。

### 7.4 项目的 AI 读取许可

读取权与归属分开（D4）。每个项目一个许可：「允许这个项目的 AI 读这里的外部会话」。默认关，开一次长期有效，只有用户本人能改。它是读取范围的一部分，存在 `horizontal/sessions`，界面在读取范围这一处。

界面用定样方案 A（用户 2026-11-06 定）：读取范围分「工具与目录」「项目的 AI」两页，第二页全部项目一张表，一行一个项目。

```ts
export interface ExternalSessionProjectAiRead {
  project: ProjectSelection;
  directories: string[];          // 本人给这个项目连的目录，表里显示用
  current: boolean;               // 调用者当前项目
  allowed: boolean;
  revision: number;               // 这个项目这一行的版本
  decided_at: string | null;      // 从没改过时为 null，allowed 为 false
  counts: ExternalSessionProjectCounts | null;   // 没要 include_counts 时为 null
}

export interface ExternalSessionProjectCounts {
  filed: number;          // 「N 个会话归到这里」：下面三项之和
  ai_readable: number;    // 「AI 能读 N 个」：工具已允许的 confirmed、automatic；不看开关，开着才这样显示
  reported: number;       // 「另 N 个是工具报的」：工具已允许的 reported
  /** 「另 N 个在没允许的工具里」：按工具分开，定样要写工具名。 */
  blocked: Array<{ entry_id: ExternalToolId; display_name: string; count: number }>;
}
```

**计数的口径。** `ai_readable`、`reported`、`blocked` 三项互不重叠，`filed` 是它们之和：先看工具允不允许，不允许的都算 `blocked`，不管归属是哪种；允许的再分 `reported` 和 `ai_readable`。

- 只数索引里有、没有 `gone_at` 的会话。从没允许过的工具没有索引行，`blocked` 里就没有它；这一项数的是读过之后又停掉的工具。
- 工具允许、但目录在范围外的会话不进任何一项：范围外的不显示。
- 待归类的不进任何项目。
- 只有数字和工具名，没有标题和内容，所以和「范围外的不显示」不冲突；这些数字也只给 `user`，`sessions.scope.read@1` 本来就只给本人。

**一次聚合。** 不按项目逐个查：一条 `GROUP BY`，按归属项目、归属状态、来源、`directory_key` 分组，再在内存里按读取范围折成每个项目四个数。`external_sessions` 上的 `reported_project_id` 是这条查询和 `view: "project"` 共用的缓存，随摘要重算，**只在第 8.2 节第 6 行时有值**：否则 `view: "project"` 会把归 A 的会话也列进绑定指向的 B。`tool_reported_other` 不用这一列，直接从快照的绑定取。行里的「看是哪些」用 `sessions.list@1`，发到那个项目的路径。

**看全部：** `sessions.scope.read@1` 一次带回全部项目，只给 `user`。一次项目快照（第 8.1 节，含绑定，所以 `reported` 不会是旧的）、一次读表，要计数时再加一条聚合，不按项目逐个请求。

**改一个项目：** `sessions.project_ai_read.set@1`，输入 `{ allowed: boolean; expected_revision: number }`，`expected_revision` 是这个项目那一行的。项目取自调用上下文，不从输入读。没有当前项目报 `sessions.project_required`，版本不符报 `sessions.scope_conflict`。

**全局 Sheet 改别的项目：** 外壳把请求发到目标项目的路径 `POST /projects/<目标项目>/api/sessions/project-ai-read`。工作台的项目上下文由请求路径定（`apps/local-host/src/web-routing.ts` 解析并核项目存在，`localWebActionContext` 写进调用上下文），和当前打开的页面无关；全局设置页已这样做（`settings-plugins.ts`、`settings-assistant.ts`）。这条路由写法同 `search-http.ts`，只有外壳页面能发，走 S-03 的控制令牌和一次性键，插件框架发不了。每次要打开目标项目并发现动作，一次点击的成本可以接受，所以 Sheet 不做批量改。按下就生效，失败时这一行退回原状并就地说明。

`details.next_step` 是 `open_project_ai_read` 时，工作台把读取范围 Sheet 盖在当前页上，打开「项目的 AI」页。这要工作台浮层接，归第 34 批界面片。

| 调用者 | 要什么 | 能读到什么 |
| --- | --- | --- |
| `user` | 读取范围 | `project`、`unfiled`、`all` 全部 |
| `agent`、`workflow`、`plugin`（生成页面，以及声明了这项依赖的插件） | 读取范围，加当前项目的许可开着；插件还要 Manifest 的 `capabilities.consumes` 和权限，所有插件同等待遇 | 只有 `view: "project"`，只到归属当前项目的 `confirmed`、`automatic` 会话，列表和原文一样 |
| `mcp` | 同上，再加 S-08 的逐客户端授权 | 同上 |

- 许可关着：报 `sessions.project_ai_read_off`（`forbidden`），`details.next_step` 是 `open_project_ai_read`。不返回空列表。
- 非本人用 `unfiled`、`all`：`actions.forbidden`。
- 读不归当前项目的会话：`sessions.not_found`，不透露它存在。
- 关掉后在途的调用在第 7.3 节的尾检处被拒。关掉时界面写「已经写进回答的内容不会收回」：AI 已写出的内容收不回，别让人以为关掉能撤回。
- 许可不扩大读取范围：工具没允许、目录在范围外时，开着许可也读不到。
- `reported`（工具报的）不进项目 AI 的可读范围，许可开着也一样：它只显示在本人的列表里，列表行标「工具报的」，打开后的归属行写「工具报的，不是你确认的」。本人确认后变成 `confirmed`，这时才算。所以工具不能经绑定让自己的会话进项目 AI 的范围。别的受众读这样的会话报 `sessions.not_found`。
- 项目删除时这一行随 `ProjectDataDeclaration` 清掉（第 8.5 节）。
- AI 归属建议不看这个许可：它由本人打开待归类时触发，材料不进项目 AI 的上下文，界面单独写明（第 8.4 节）。
- 团队项目先不开放。项目现在没有团队标记，所以合同里不写判断；团队批接入时，这个动作要对共享项目拒绝，并加一条拒绝测试。这一步记在第 12 节。

## 8. 项目归属

### 8.1 读哪份合同

`horizontal/sessions` 不依赖 `modules/projects`，由宿主注入端口：

```ts
/** 借目录库读一次。回调是同步的，读到的就是此刻的状态。 */
projects: { read<T>(operation: (snapshot: SessionProjectSnapshot) => T): Promise<T> };
/** 认目录：真实路径与所在仓库，只读 `.git` 相关的三个文件，见第 8.2 节。 */
directories: { identify(path: string): { real_path: string; repository_key: string | null; worktree_relative: string | null } | null };

export interface SessionProjectSnapshot {
  directories: ProjectWorkspaceDirectoryRecord[];   // listWorkspaceDirectory()
  projects: ProjectSelection[];                     // selections()
  /** 工具报的绑定，只读（D1）。这些绑定不一定经本人确认，名字不写「确认」。 */
  bindings: RuntimeContextBindingRecord[];          // listRuntimeContextBindings()
}
```

宿主的 `withCatalog`（`apps/local-host/src/web-catalog-access.ts`）是异步借用一条长开连接，`projects.read` 就是包一层：回调在 `withCatalog` 里同步跑。Host 关停时 `withCatalog` 抛错，`projects.read` 随之失败，读取不返回内容，发现这一批不写，都按被取消处理。

快照里的项目和目录来自 `ProjectsQueryApi`，这是 `packages/contracts/src/modules/projects.ts` 的公开合同，`modules/private-work-context` 用的同一份。不用 `projects.workspaces.list@1`：它只回当前项目，要全局关系就得按项目逐个调（N52 那一类）。

`listRuntimeContextBindings()` 是 `modules/private-work-context` 已有的读取，宿主放进快照。Sessions 不读它的表，也不回写。

一次列表取一次快照，算出摘要。摘要变了才重算派生归属（第 8.2 节）。

**目录来源（片 P-1，第 10.1 节）。** `linked_projects` 和自动归入只认本人建的目录关系。Projects 给出这个判断，Sessions 不比 actor：

```ts
export interface ProjectWorkspaceDirectoryRecord extends ProjectWorkspaceRef {
  project_ids: string[];
  /** project_ids 里由本人建的那些；工具绑定时带进来的不在内。 */
  person_project_ids: string[];
  // …
}
```

| 写入口 | 算不算本人建的 |
| --- | --- |
| `projects.workspaces.add`、`repair`（本人，只给 `user`） | 算 |
| Onboarding 选目录（`web-onboarding.ts`） | 算 |
| 工作树目录授权（`system-agent-service.ts` 的 `authorizeWriterDirectory`，经本人审查通过） | 算 |
| `context_bind`（`project-binding-commands.ts` 的两处 `upsertWorkspaceMembership`） | 不算 |
| 终端面板绑定时带的 `cwd`（走同一段代码） | 不算 |

不加列：沿用 `bound_by`，所以 `projects/catalog.db` 版本不变，不碰真实 Home 的库。规则：

- **判法是白名单：** `bound_by` 等于 `LOCAL_PERSON_ACTOR_ID` 才算本人建的，别的值一律不算。读取范围是权限边界，不能默认放行：新增的写入口忘了标记，结果是不算，不是算。P-1 要核表里算的三处写的都是这个值（Onboarding、工作树授权已是，`add`、`repair` 取调用者）。团队批再扩。
- **标记在 Projects 内部加：** `modules/projects/src/index.ts` 的 `lifecycle.upsertWorkspaceMembership` 这个入口写 `binding:<actor>`，`project-binding-commands.ts` 不拼字符串。`requiredActorId` 和事件里的 actor 用原值。
- **不降级：** `upsert` 不用工具的值覆盖本人的值；本人再连一次，工具带进来的关系升为本人的。
- **工具只能解除工具带进来的：** `context_unbind` 的 `binding_scope: "workspace"` 分支走 `lifecycle.unlinkWorkspaceMembership`。它改成返回解除没解除，判法仍在 Projects。遇到本人建的关系不解除，这个分支回 `changed: false`、`unbound_project: null`，再带一个有码的原因，不说成已解除；会话绑定这个分支本来就不碰，要解除走 `session` 范围。这样读取范围既不会被工具放大，也不会被工具收窄。

```ts
export interface MolisWorkRuntimeContextUnbindResult {
  resolution: MolisWorkRuntimeContextResolution;
  unbound_project: MolisWorkProjectSelection | null;
  changed: boolean;
  /** 只在没解除时有：这个目录关系是本人建的，工具解除不了，要本人在项目设置里解除。 */
  kept?: { code: "work.context.person_relation_kept"; message: string };
}
```

`person_project_ids` 由 Projects 算，判法只在 Projects 一处。

代价：片 P-1 之前 `context_bind` 写下的行不是本人的 id，自动不算；但终端面板写下的行 `bound_by` 是本人的 id，分不出来，会算成本人建的。真实 Home 如果在 P-1 之后才重建，这些行就没有了；否则要在维护窗口核一次，这一步见第 12 节。

### 8.2 归属怎样算

单条决定之外的归属是算出来的，不存第二份关系（需求 §1.3）。缓存在 `session_directories` 上，一个目录一行，带目录表摘要，摘要不符就重算，所以项目解除、删除后不会靠旧值继续生效。

优先级，高的先：

| # | 情况 | 结果 |
| --- | --- | --- |
| 1 | 有单条决定：归到某项目，且项目还在 | `confirmed` |
| 2 | 有单条决定：先不归 | `unfiled`，`left_unfiled`，不再请 AI 建议 |
| 3 | 有单条决定，但项目已不在 | `unfiled`，`project_gone`，不自动换项目 |
| 4 | 目录或仓库匹配到唯一项目，关系是本人建的 | `automatic`，依据是这条目录关系；有绑定也一样，绑定只作附加说明 |
| 5 | 匹配到多个项目，含同一仓库连着两个项目 | `unfiled`，`ambiguous`，候选是这几个项目，走 AI 建议 |
| 6 | 没有本人目录关系，有工具报的 Runtime 绑定，且项目还在 | `reported`，只有本人的列表显示，列表行标「工具报的」，打开后的归属行写「工具报的，不是你确认的」；本人确认或改选后走第 1 行 |
| 7 | 只匹配到工具带进项目的目录 | `unfiled`，`tool_linked`，候选是这个项目，走 AI 建议 |
| 8 | 曾匹配、现在没有了（缓存重建后分不出，退成第 9 行） | `unfiled`，`relation_gone` |
| 9 | 没有匹配，或目录已不存在、认不出 | `unfiled`，`no_relation`，走 AI 建议 |

**目录关系排在绑定前面。** 从项目打开的终端和 MCP 连上的会话，工具都会报绑定，而它们多数就在本人连的目录下。排在前面它们才是 `automatic`，才算自动归入；工具也改不了结果：本人目录下的会话，工具绑到别的项目，项目 AI 的范围不变。

**绑定指向另一个项目时（第 4 行，用户 2026-11-06 定）。** 会话唯一匹配本人目录时仍是 `automatic`，归那个目录的项目。本人列表的行上标「工具另报」，打开后的归属行写「工具报的是另一个项目」，数据在 `tool_reported_other`，别的受众的输出里没有这个字段。工具左右不了归属。

**第 6 行（D1）。** `linked_projects` 下在范围内的会话都匹配本人目录，所以 `reported` 只在读取范围是「所有目录」时出现，不是常见情况。绑定可能是工具自己报的，不是本人确认的，所以不写成 `confirmed`。这条依据只算归属，不带任何读取权：工具没允许就读不到，项目 AI 没许可就读不到。绑定的键没有账号和位置，所以只用于本机来源；同一绑定命中两个 `location_key` 时不算，走下一行。终端面板的绑定里 `stable_work_context_id` 可能是面板号，对不上原生 ID 就自然不命中。本人在 Sessions 改选后第 1 行优先，不回写绑定，所以连着的工具调用仍落在旧项目，改归属的 Dialog 要写这一句。

**第 4、5 行怎样算（D2）。** 分两步。先找匹配的项目，一个已关联目录符合下面任一条就算匹配：

1. 路径：会话目录的真实路径等于已关联目录，或在它之下。按路径段比，不比字符串前缀。
2. worktree：两者 `repository_key` 相同，且会话目录相对自己工作树根的路径，等于已关联目录相对它工作树根的路径，或在它之下。已关联目录就是仓库根时，这个仓库的任何 worktree 都算。

再看唯一：匹配到的项目恰好一个，**且**这个仓库没有连着别的项目，才算唯一。同一仓库连着两个项目时算不唯一，候选是这些项目，走 AI 建议。

单仓多包的例子，只关联 `/repo/packages/a`：

| 会话目录 | 结果 |
| --- | --- |
| `/repo/packages/a/src` | 匹配（第 1 条） |
| `/wt/feature/packages/a`（`/repo` 的 worktree） | 匹配（第 2 条） |
| `/repo/packages/b`、`/wt/feature/packages/b` | 不匹配：同一仓库，但不在已关联的位置。不进 `linked_projects`，不自动归入 |

`realpath_verified` 为假的关联不进候选。上面的「已关联目录」只算 `person_project_ids` 里的项目；只被工具带进来的走第 7 行。

**认仓库，只读文件，绝不跑 git（S-119）。** `repository_key` 是公共 git 目录真实路径的 SHA-256 前 24 位。规则只有一种写法：

- 从目录往上找 `.git`，到用户主目录或根目录停。
- `.git` 是目录：它就是公共 git 目录，这是主工作树。
- `.git` 是文件，就要证明这是 worktree，三件事都成立才算：
  1. `gitdir:` 一行指向的目录，形状是 `<公共目录>/worktrees/<名字>`；
  2. 那里有 `commondir` 文件，解析出的目录就是上面的公共目录；
  3. 那里的 `gitdir` 文件指回这个 `.git` 文件。互相指着才算，只有单向指认的是伪造。
- 三个文件里的路径可能是相对的：`.git` 里的 `gitdir:` 相对 `.git` 所在目录，`commondir` 和 `gitdir` 文件相对它们自己所在的目录。解析后都取真实路径再比。
- 少一件，`repository_key` 都为空。没有 `commondir` 的（子模块）也是空：它不算 worktree，路径规则照常管它。
- 只碰 `.git`、`commondir`、`gitdir` 这三个文件，每个不超过 4 KB。不读 `config`、hooks 或任何别的文件，内容不外传，只留哈希。
- 读不了、格式不对、路径不存在：`repository_key` 为空，不报错。
- 不在会话目录里跑 git：仓库里的配置和钩子可能让 git 执行代码，而这些目录来自外部工具的记录。

`identify` 同时给出工作树根的相对路径。会话目录每轮发现时重新认一次，已关联目录在目录表摘要变化时认一次，一个目录一次，都放 `session_directories`（`kind` 分会话目录与已关联目录）。worktree 已删时目录不存在，`identify` 返回空，走第 9 行；这只发生在读取范围是「所有目录」时，`linked_projects` 下它不在范围内（第 7.1 节）。

单次历史选择、同名目录、相似标题、「只有一个候选」都不进这张表（需求 §1.3）。现役 MCP 的 `RuntimeProjectResolution` 用 `recent_project`、`session_title` 这类线索打分，这里不复用，它的结果只算建议。

### 8.3 合同形状

```ts
export type ExternalSessionAttribution =
  | { state: "confirmed"; project: ProjectSelection; basis: "user_chose" | "suggestion_accepted"; decided_at: string;
      later_suggestion?: ExternalSessionSuggestion }
  | { state: "reported"; project: ProjectSelection; source: { kind: "runtime_binding"; runtime_id: string }; reported_at: string }
  | { state: "automatic"; project: ProjectSelection; evidence: { kind: "directory" | "repository"; path: string };
      /** 只给本人：工具报的是另一个项目，只作提示，不改归属。 */
      tool_reported_other?: { project: ProjectSelection; runtime_id: string } }
  | { state: "unfiled";
      reason: "no_relation" | "tool_linked" | "ambiguous" | "relation_gone" | "project_gone" | "left_unfiled";
      candidates: ProjectSelection[];
      suggestion: ExternalSessionSuggestion | null };
// confirmed 另带可选的 later_suggestion：定样要显示「你改选后来了新建议，没有改你的选择」。

export interface ExternalSessionSuggestion {
  status: "ready" | "no_match" | "failed";
  project: ProjectSelection | null;
  alternatives: ProjectSelection[];
  reason: string;                 // 最多 120 字，模型写的，不可信文本
  evidence: Array<{ kind: "directory" | "title" | "message"; text: string }>;
  created_at: string;
}
```

`sessions.attribution.set@1`：

```ts
export interface ExternalSessionAttributionInput {
  session_key: string;
  decision: { kind: "project"; project_id: string } | { kind: "leave_unfiled" } | { kind: "clear" };
  suggestion_accepted: boolean;
  expected_revision: number;
}
```

- 只给 `user`：AI 不能确认归属，这是拒绝测试的内容（S-118）。
- `project_id` 要在 `selections()` 里，否则 `sessions.project_unavailable`。
- `clear` 把这条交回第 8.2 节的规则。
- 只改这一条：不碰目录关系，不搬文件，不改原工具（需求 §1.3、§8）。
- 归属不授予读取或控制权：本人读取只看读取范围，项目 AI 另看第 7.4 节的许可。

### 8.4 AI 建议

`sessions.attribution.suggest@1`，输入 `{ session_keys: string[] }`，最多 100 条。服务按目录分组，同一目录一组，没有目录的一条一组；超过 20 组报 `sessions.too_many_groups`。输出每条会话的 `ExternalSessionSuggestion`，同组共用。

**什么时候跑（D8）。** 只在用户打开待归类时跑，往下翻再要下一批。发现时不跑，也没有后台批量。卡片随 `sessions.list@1` 立刻显示，这个动作另发一个请求，建议到了再填进卡片，不挡页面。没到之前卡片照常能改选和先不归。待归类界面写明：这些会话的标题、目录和开头几句，连同你的项目名和项目目录，会发给你配置的模型；这和项目的 AI 能不能读是两件事，内容不进任何项目 AI 的对话（第 7.4 节）。

**发给模型的（都是范围内的、有上限）：**

```ts
interface SuggestInput {
  groups: Array<{ ref: number; tools: string[]; directory: string | null; titles: string[]; opening: string[] }>;
  projects: Array<{ ref: number; name: string; directories: string[] }>;
}
```

`titles` 最多 5 个；`opening` 是组内最近一个会话前 3 条「你」说的话，每条最多 300 字。`titles`、`opening` 发出前过 SDK 的密钥脱敏。总量不超过 `MODEL_DATA_MAX_CHARS`。

**模型只回编号：**

```ts
interface SuggestDraft {
  items: Array<{ group: number; project: number | null; alternatives: number[]; reason: string;
                 evidence: Array<{ kind: "directory" | "title" | "message"; text: string }> }>;
}
```

- 走法同 `knowledge.locate`：宿主注入 `SessionAttributionSuggester`，内部用 `hostTextGeneration` 和结构化输出，提示词 `sessions.attribution.suggest` 登记在 `apps/local-host/src/agent-definitions/system-prompts.ts`。模型调用不出 `horizontal/agent-host`，服务包不碰 SDK。没配模型时端口是 `null`，状态 `failed`，会话照常待归类、照常能看。
- 输入是一行 JSON，放在代码固定的「不可信」声明之后（S-13、S-117）。
- 回来的编号必须在给出的范围内，否则丢弃这一项。项目名由服务查回，不用模型写的。
- `reason`、`evidence` 按文本转义显示。
- 建议不写归属。晚到的建议只更新建议表，事务里不碰决定表。
- 按 `input_digest` 缓存：材料没变不重算，重试才强制。

### 8.5 项目删除与权限变化

读取时都核：`selections()` 里没有的项目，决定显示 `project_gone`，派生归属随摘要重算。

Home 里按项目存的数据走现有机制：`horizontal/sessions` 导出一份 `ProjectDataDeclaration`，宿主在 `apps/local-host/src/project-deleted-owners.ts` 点名，不新增删除入口。

| 表 | 项目删除时 |
| --- | --- |
| `session_project_ai_reads` | 清掉这一行 |
| `session_suggestions` | 清掉指向这个项目的建议 |
| `session_directories` | 不清，下次摘要变化重算 |
| `session_attributions` | **保留**：只有会话与项目 id，没有项目内容，留着才能显示「原来归的项目没了」，让用户改选；不靠它恢复访问 |

确认框的文字写「这个项目的 AI 读取许可和归属建议」。`purge` 只动本库文件，库不存在时不创建。

## 9. 服务包

### 9.1 放在哪

`horizontal/sessions`，包名 `@molis-ai/molis-work-service-sessions`，照[新增横向服务](../../docs/system/PACKAGE-BOUNDARIES.md#新增一个横向服务或平台服务)和 `horizontal/knowledge` 的样子建。

| 文件 | 做什么 |
| --- | --- |
| `src/index.ts` | `SessionsService`：列表、历史、范围、归属 |
| `src/store.ts` | 建表与读写，Repository 不导出 |
| `src/discovery.ts` | 按来源的后台发现、进度、取消 |
| `src/attribution.ts` | 第 8.2 节的规则，纯函数 |
| `src/adapters/<id>.ts` | 一家一个适配：`list`、`read`，把原格式转成合同形状 |
| `src/errors.ts` | `sessionsErrors` |

依赖只有 contracts 和 plugin-sdk（脱敏、整字截）。例外只可能是 `claude-code` 适配用 Agent SDK：那是这一片的新依赖，随那个 PR 过评审；不用它就读本地记录。进程和文件经宿主注入：

```ts
export interface SessionsPorts {
  commands: { run(entry: ExternalToolId, argv: readonly string[], signal: AbortSignal): Promise<SessionCommandResult> };
  files: { open(root: string, relative: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> };
  connections: {
    current(connectionId: string): { enabled: boolean } | null;
    /** 云端适配经它发请求，凭据由宿主按引用解析，不进服务包。 */
    request(connectionId: string, request: SessionServiceRequest, signal: AbortSignal): Promise<SessionServiceResponse>;
  };
  projects: { read<T>(operation: (snapshot: SessionProjectSnapshot) => T): Promise<T> };
  directories: { identify(path: string): { real_path: string; repository_key: string | null; worktree_relative: string | null } | null };
  suggester: SessionAttributionSuggester | null;
  searchChanged(): void;
}
```

宿主一侧是 `apps/local-host/src/sessions-actions.ts`，只装配，同 `knowledge-actions.ts`。第三方插件贡献来源适配不在本批：登记表是合同，适配在服务包里。需求 §2 的「开放工具」现在按登记一行走；要开放成扩展点是第 59 批之后的事，记在第 12 节。

同步文档：`docs/SSOT-MATRIX.md` 新增一行，`scripts/workspace-packages.mjs`、`docs/system/PACKAGE-BOUNDARIES.md` 现行包清单、`docs/horizontal/sessions.md`、`docs/system/HOME-DATA.md`（新库与表）、`docs/system/GLOSSARY.md`（外部会话、来源、读取范围、待归类）。「外部工具」「产品入口」两词 C-1 就进代码，词条随 C-1 落，写清它们和 Runtime 的关系。`tooling/gates/error-owners.json` 加 `sessions` 主人，这是 README 写的常规步骤，不算改门禁。

### 9.2 库与表

库 `external-sessions/external-sessions.db`，第 1 版基线，在 `apps/local-host/src/home-stores.ts` 登记为新库，同时加进发布清单第 3 节的版本表。**不用 `sessions/`**：那是退役目录，快照按未知条目拒绝。只由本包读写，不进 `tooling/gates/table-owners.json`。

| 表 | 主键 | 主要字段 | 性质 |
| --- | --- | --- | --- |
| `external_sessions` | `session_key` | `entry_id`、`location_key`、`native_id`、`seen_via`、`title`、`directory_key`、`reported_project_id`、`last_activity_at`、`forked_from`、`gone_at` | 可重建索引 |
| `session_directories` | `directory_key` | `path`、`kind`、`realpath_verified`、`repository_key`、`worktree_relative`、`derived_state`、`derived_project_id`、`candidates`、`directory_digest` | 可重建缓存 |
| `session_sources` | `entry_id`、`location_key` | `state`、`reason`、`progress_cursor`、`session_count`、`skipped_count`、`completed_at`、`checked_at` | 可重建进度 |
| `session_read_scopes` | `entry_id`、`location_key` | `allowed`、`directories`、`connection_id`、`revision`、`decided_at` | **用户决定** |
| `session_project_ai_reads` | `project_id` | `allowed`、`revision`、`decided_by`、`decided_at` | **用户决定** |
| `session_attributions` | `session_key` | `decision`、`project_id`、`basis`、`revision`、`decided_by`、`decided_at` | **用户决定** |
| `session_suggestions` | `session_key` | `status`、`project_id`、`alternatives`、`reason`、`evidence`、`input_digest`、`prompt_version`、`created_at` | 可重算 |
| `session_meta` | `key` | `scope_revision`、库版本 | 控制 |

索引：`external_sessions(last_activity_at DESC, session_key)`、`external_sessions(directory_key, last_activity_at DESC, session_key)`、`external_sessions(reported_project_id, last_activity_at DESC, session_key)`、`session_attributions(project_id)`、`session_directories(derived_project_id)`。`view: "project"` 按派生归属、单条决定、`reported_project_id` 三路取同一键集的页，合并后减去被单条决定改走的行。

会话不进成果库，也不是过程项；冷启动整理出的内容按各主人的流程写（需求 §7 第 11 项）。

`session_attributions` 的 `session_key` 要在索引清掉后也还在，所以不设外键。索引和进度可以整个重建，三张用户决定的表要保留。库版本将来变化时怎样带过这两张表，跟第 05 批的升级规则走；现行规则是版本不符就拒绝，本稿不写迁移。

### 9.3 错误码

`horizontal/sessions/src/errors.ts`，一处声明，不写 Error 子类。这些码由动作抛出；合同里要点名的放合同，写法同 `projectCatalogErrors`。

```ts
export const sessionsErrors = defineErrorCodes("sessions", {
  not_found: "not_found",              // session_key 不在索引里，或已在范围外（不区分，不透露）
  not_allowed: "forbidden",            // 来源未允许
  scope_changed: "forbidden",          // 等待期间范围或许可变了
  project_ai_read_off: "forbidden",    // 这个项目的 AI 读取许可关着
  scope_conflict: "conflict",          // expected_revision 不符
  needs_login: "unavailable",
  version_unreadable: "unavailable",
  read_failed: "upstream",             // 没读成
  source_unsupported: "unavailable",   // 暂不支持
  project_required: "invalid",
  project_unavailable: "invalid",
  attribution_conflict: "conflict",
  cursor_invalid: "invalid",
  suggestion_unavailable: "unavailable",
  too_many_groups: "too_large",
});
```

### 9.4 安全不变量

编号暂写 S-114～S-119（表里到 S-108，S-109～S-113 已被别的稿子占用），由公共合同台定。测试放 `tests/security-invariants-external-sessions.test.ts`，`test:security` 的通配会带上。

| 编号 | 不变量（拒绝什么） | 拒绝测试要断言的 |
| --- | --- | --- |
| S-114 | 只读获准来源的数据根目录：`..`、绝对路径、指向根外的符号链接一律拒，沿 S-11 和角色导入的做法 | 根内放指向根外的链接，读被拒、内容不返回；未允许的来源不被扫描，读目录次数为 0 |
| S-115 | 子进程只跑登记表写明的只读命令：不经 shell，`argv` 来自登记表，只有 `{session_id}`、`{query}` 被替换；前者过 `EXTERNAL_SESSION_NATIVE_ID_PATTERN`，后者占一个元素、不以 `-` 开头；有时限、输出上限、最小环境；`detect` 不符不跑解析。列表、历史、搜索不启动 `resume`、`exec`、`delete`、`queue` 一类命令。`detect` 要运行本机程序：先过 `real_path_pattern`，不过不运行；运行时只带 `version_argv`，同样有时限、无 shell、最小环境 | 原生 ID 写成 `--dangerously…`、带分号或空格时不起进程；搜索词以 `-` 开头时不起进程；`version_pattern` 不符时不解析；走一遍列表、历史、搜索后，假工具记录下的调用里没有写命令（SRB-12）；`agent` 的真实路径不符时假工具一次都没被运行 |
| S-116 | 外部读取返回前再核范围：收窄、停止、撤连接、关掉项目的 AI 读取许可后，在途的读取不返回内容、发现不写库、建议不写表 | 假适配在等待中收窄范围、关掉许可、解除项目目录（`linked_projects` 下，`revision` 没变），各断言 `sessions.scope_changed`、响应里没有原文、索引行数不变；`sessions.tool.search@1` 在等待中收窄，范围外的行不返回；取消后来源进度不更新；连接失效时云端来源不返回内容 |
| S-117 | 外部会话的标题、原文、工具输出都是不可信数据：给模型时走 S-13 的 JSON 围栏，给 Agent 的输出带 `trust: "untrusted"` 并脱敏，不进系统提示和工具定义 | 标题里写伪造的结束标记和角色，留在 JSON 字符串里；原文里的密钥样式在 `agent` 受众下被脱敏；模型回了列表外的项目编号，这一项被丢弃 |
| S-118 | 读取范围、项目的 AI 读取许可与单条决定只有本人能定：Agent、MCP、工作流、插件调 `sessions.scope.set@1`、`sessions.project_ai_read.set@1`、`sessions.attribution.set@1` 被拒；`actor_id`、`project_id` 等身份字段在输入里不认。工具能做的只有报绑定：它得到 `reported`，排在本人决定和本人目录关系之后，不改读取范围，不产生 `automatic`，不进项目 AI 的可读范围。项目 AI 的读取要许可开着，且只到当前项目的 `confirmed`、`automatic` 会话；待归类与 `view: "all"` 只有本人；归属不授予读取或控制权 | 四种受众逐个被拒且决定表没写；非本人调 `sessions.scope.read@1` 被拒，拿不到各项目的计数；`context_bind` 与终端面板把目录带进项目后，`linked_projects` 的范围不变，这个目录下没有绑定的会话是 `tool_linked`，绑定的那个会话是 `reported`，都不是 `automatic`；工具绑定不覆盖本人的目录来源和单条决定；`context_unbind` 解除不了本人建的目录关系，回 `changed: false`、`unbound_project: null` 和 `kept`，不说成已解除；`bound_by` 不是本人 id 的行（含旧的 `<客户端>:<会话>`）不算本人建的；本人目录下的会话，工具绑到别的项目：仍是 `automatic`、归本人目录的项目，项目 AI 的范围不变，`reported` 计数不变，本人的行带 `tool_reported_other`，非本人的输出没有这个字段；读取范围是「所有目录」时，没有本人目录关系的 Runtime 绑定显示 `reported` 不是 `confirmed`；许可开着时，`reported` 的会话不出现在 `agent`、`workflow`、`plugin`、`mcp` 的列表里，读原文报 `sessions.not_found`，本人确认后才可读；许可默认关时 `agent`、`workflow`、`plugin`、`mcp` 读列表和原文都报 `sessions.project_ai_read_off`；许可开着时读别的项目的会话报 `sessions.not_found`，用 `unfiled`、`all` 报 `actions.forbidden`；MCP 客户端有许可、没有 S-08 授权时被拒；未允许的来源里，归了项目或有 Runtime 绑定的会话照样读不到；自动归入的会话许可关时被拒、开时可读；非本人的 `sessions.list@1` 输出里 `unfiled_count` 是 `null`，`sources` 没有别的项目的来源和数量 |
| S-119 | 认仓库只读文件，不跑 git：只读 `.git`、`commondir`、`gitdir` 三个文件，各不超过 4 KB，内容只留哈希，不读 `config` 与 hooks；到用户主目录或根目录停止往上找；`.git` 文件必须和仓库里的 `gitdir` 互相指着才算 worktree，否则 `repository_key` 为空 | `PATH` 上放假 `git` 并记录调用，发现、归属、范围判断之后调用次数为 0；任意目录放 `.git` 文件写 `gitdir: <已关联仓库>/.git/worktrees/x`，而仓库那边没有指回：`repository_key` 为空，不进范围，不自动归入；`gitdir:` 指向不相干的目录、没有 `commondir`、超长、含 NUL 时 `repository_key` 都为空且不报错；仓库 `config` 里写 `core.fsmonitor` 也不执行；三个文件之外的读取次数为 0 |

SRB-11 的「读取不推导控制」等第 59 批加控制动作时补进新行。

### 9.5 调用次数（开工前检查第 9 项）

| 用户操作 | 请求数 | 动作发现／授权 | 开库 | 外部调用 |
| --- | --- | --- | --- | --- |
| 打开列表 | 1 | 1 遍（动作网关照常） | 服务长开，0 | 0（过期时后台排一次，不在请求里） |
| 翻下一页 | 1 | 1 | 0 | 0 |
| 打开一个会话 | 1 | 1 | 0 | 1 次读取；项目快照 2 次（等待前后） |
| 往上读 | 1 | 1 | 0 | 1 次读取，同文件走短缓存 |
| 会话内搜索 | 1 | 1 | 0 | 1 次流式扫描 |
| 改读取范围 | 1 | 1 | 0 | 放宽的来源每家 1 轮发现 |
| 打开待归类 | 2（列表 + 建议，后者不挡页面） | 各 1 | 0 | 取 `opening` 最多 20 次来源读取（每组一次，可能是子进程），模型 1 次；往下翻再一轮；材料没变走缓存，这两样都不发生 |
| 读取中询问一次 | 1 | 1 | 0 | 0；每次是完整的 `sessions.list@1`，含一遍动作发现和一次项目快照。最坏：发现一直没读完、页面一直可见，稳定后每分钟 4 次（15 秒一次） |
| 打开读取范围 Sheet | 1（全部项目的许可和计数都在这一个响应里，只给 `user`） | 1 | 0 | 0；计数是一条 `GROUP BY`，项目再多也是一条查询，不走外部工具 |
| 第 20 批判断就绪 | 1（不带计数，不做聚合） | 1 | 0 | 0 |
| 改项目的 AI 读取许可 | 1（发到目标项目的路径） | 1，且要打开目标项目 | 目标项目 1 | 0 |
| 在这个工具里搜 | 1 | 1 | 0 | 1 次命令 |
| 确认一张卡 | 1 | 1 | 0 | 0 |
| 发现一轮 | 0 | 0（后台不走动作发现） | 0 | 每来源分页，一批写一个事务；全局并发 2，同来源 1 |

- 列表里取一次项目快照，N 条行不逐条查项目；尾检一批一次。来源状态一个查询。
- 认仓库一个目录一次。会话目录只在发现时认；列表请求只在摘要变了时认新连的目录，尾检不读文件，用表里存的。
- 后台发现不走动作目录，不按条目请求，避开 N48 那类空转。
- 没有定时器：第 34 批的发现只由四件事触发，即范围变化、用户点重试、打开列表时过期、启动时接上没读完的来源。持续跟进是采集层的事。
- 第 34 批按 N56 的「调用预算」用例记基线（用例在，就加这几个代表请求）。
- **进度到页面（D5）。** 没有推送通道，页面重发 `sessions.list@1`。只在 `sources` 里有 `reading` 且页面可见时问；间隔从 2 秒起逐步拉长，最长 15 秒；页面隐藏即停，失败退避，都读完即停。这几条照 N54 写，组件要有测试。其余时候页面不问。N54 提到的 `plugin-frame/events.ts` 只是把插件路由的事件转给框架，`server/src/events.ts` 是团队服务端，都不是工作台外壳能用的宿主推送。

## 10. 切片

### 10.1 合同 PR

规则 1：合同单独开小 PR，同一份快照同一时间一个在途。下面的片按顺序叠，都归 C1 队列，开工前在认领板认领。现在没有在途 PR 碰下表的快照。

| 片 | 内容 | 动的快照 | 动的其他文件 | 等什么 |
| --- | --- | --- | --- | --- |
| **C-1 登记表与派生**（BL-955） | `platform/external-tools`；第 4.3、4.4 节；`tests/action-external-tools.test.ts`；GLOSSARY 两词 | 新增 `tooling/gates/api/contracts/platform/external-tools.txt`；改 `platform/app-host.txt`、`modules/characters.txt` | `packages/contracts/package.json` 的导出；`plugin-terminal-runtimes.ts` 等第 4.4 节七处。不动动作，不跑 `actions:update` | 第 02 批交完、C 轨交接 |
| **C-2 读取合同** | `services/sessions`：身份、来源状态、列表（含归属类型）、历史、读取范围、项目 AI 读取许可、权限、错误码常量 | 新增 `tooling/gates/api/contracts/services/sessions.txt` | `packages/contracts/package.json` 的导出 | C-1 |
| **P-1 目录来源** | `ProjectWorkspaceDirectoryRecord.person_project_ids`；白名单判法；绑定写入在 Projects 内部带 `binding:`；`upsert` 不降级本人的值；工具解除不了本人的关系（第 8.1 节） | 改 `modules/projects.txt`、`modules/private-work-context.txt` | `packages/contracts/src/modules/runtime-project-context.ts`；`modules/projects/src/index.ts`、`workspace-repository.ts`、`workspace.ts`；`modules/private-work-context/src/project-binding-commands.ts`、`binding-errors.ts`；`apps/mcp/src/context-tools.ts` 的工具说明；`docs/mcp.md`、`docs/mcp.en.md`、`skills/goal-advance/references/project-connection.md`；`tests/project-catalog.test.ts`、`tests/runtime-binding-error-codes.test.ts`、`tests/mcp.test.ts` | 第 02 批交完。不依赖 C-1，可以和它并行 |
| **C-3 归属与搜索合同** | `attribution.*` 动作、`search.entries`、`tool.search` | 改 `services/sessions.txt` | 无 | C-2 |

`ExternalSessionRow` 带 `attribution`，所以归属类型在 C-2，C-3 只加写动作。

**P-1 谁落。** 这是 Sessions 的需求改 Projects 的数据。`modules/projects`、`modules/private-work-context` 不是哪条轨道的独占文件，主人是 SSOT 写的 Module 归属；`packages/contracts/src/modules/projects.ts` 走合同队列（规则 1）。按规则 7 的精神：由 C 轨写手认领后单开这一片，请 Module 主人评审，Sessions 服务片叠在它后面。**影响面：**

- 库：不改结构，`projects/catalog.db` 版本不动。`bound_by` 现在没有别的读者（核过 `git grep`）。
- MCP 调用方有一处变化：`molis_work_v1_context_unbind` 的 `workspace` 范围，遇到本人建的目录关系时不再解除，返回 `changed: false` 和 `kept`。工具名和输入不变。工具说明和 `goal-advance` 的连接说明要改，让 Runtime 转告用户去项目设置解除，不说成已解除。工具自己带进来的关系、`session` 范围的解除、`context_bind`、`context_resolve`、`workspaceMemberSuggestions` 都不变。
- `skills/` 有改动，这一片按 AGENTS 的规矩不要和全量回归同时改。


服务片 S-3 要等 P-1 合入：在它之前算不出 `person_project_ids`。

`apps/desktop/src/web-host.ts` 是 F 轨独占文件（规则 7），C-1 不直接改它。这一处只要遍历现有的 `TERMINAL_RUNTIMES` 与配方，不依赖登记表，所以由 F 轨排在 C-1 之前落；否则第 4.5 节的扫描在 C-1 上是红的。

C-2、C-3 只有定义，宿主还没登记，所以不动 `tooling/gates/actions/`。`host-actions.tsv` 在服务片随登记一起改，跑 `pnpm build` 后 `pnpm actions:update`。

每片的 PR 写：消费者清单、对调用方的影响（C-1 是「成员不变」）、「防腐与代码质量」六行。

### 10.2 服务与消费（第 34 批，不在本批）

| 片 | 内容 |
| --- | --- |
| S-1 | 包、库、表、动作登记、S-114～119 的测试、一个假工具适配 |
| S-2 | A 组适配，逐家在实装版本上复核，改登记表的 `checked` 和实际接入方式 |
| S-3 | 归属与建议 |
| S-4 | 搜索来源 |
| S-5 | 工作台界面（入口随第 03 批；「外部会话原文」先由 D 轨补标本）；读取范围 Sheet 两页；`project-ai-read` 路由；`open_project_ai_read` 的浮层；项目设置里本人连的目录和工具带进来的目录分开显示，后者给确认入口 |
| S-6 | B 组适配；D 组保持缺口 |

其余后续批次要接的：

| 批次 | 要做什么 |
| --- | --- |
| 第 20 批 | 就绪判断同时看读取范围和项目许可，缺哪样去处不同（第 6.5 节） |
| 第 35 批 | Onboarding 加一步，让本人打开这个项目的 AI 读取许可。许可默认关，不打开时冷启动的 AI 整理读不到历史（SRB-09） |
| 第 59 批 | 恢复、发送、停止、交接的动作，持续跟进 |
| 团队批 | `sessions.project_ai_read.set@1` 对共享项目拒绝，加拒绝测试（第 7.4 节） |

### 10.3 和观测采集层的分界

| 事 | Sessions | 观测和采集层 |
| --- | --- | --- |
| 有哪些会话、状态、归属 | 主人 | 只读 |
| 原文 | 不存，按需读 | 证据按[设计](../observation-collection/design.md) §1 D1 定；只放引用或快照 |
| 增量读取 | 给读取能力：`sessions.history.read@1` 的 `from: { after }` 和稳定的 `position` | 记水位、补读、缺口、去重；决定什么时候读 |
| 「持续跟进」开关 | 不管 | 主人（委托记录），第 59 批接 |
| 首次读取、补读、导入的来源类别 | 不判断 | 入口给出（设计 §3） |
| 定时轮询 | 不建 | 按采集层的节奏 |
| 读取范围变化 | 经动作调用记录被看到 | 按「授权与撤权」一行接入 |

接口只有一处：`position` 必须稳定，日志追加不改旧位置。这是 C-2 的合同要求，采集层不用另开端口。Sessions 不写采集层的表，也不反向依赖它，所以第 28 批和第 34 批谁先都行。

## 11. SRB 逐条

「本批」指合同定下什么，不是通过验收。

| 编号 | 本批覆盖 | 留给 |
| --- | --- | --- |
| SRB-01 | 矩阵逐入口写状态与缺口；登记与接通分开；测试防删行 | 34 接通读取；59 接通控制。全部入口有结论才算完成 |
| SRB-02 | 身份、列表、历史、搜索的合同；读取失败与无历史分开。**搜索是最低读法（D3）**：跨会话只搜标题、目录、工具名，内容进单个会话搜，工具自带搜索的另搜。缩了什么：不能一次搜所有会话的正文；工具没有搜索命令时，「哪个会话说过这个词」要逐个进去搜 | 34 用真实会话验。全文索引不做，以后另议，做的话是本人开启 |
| SRB-03 | 登记恢复方式；工作终端配方派生 | 59 |
| SRB-04 | 登记发送方式；不定动作 | 59 |
| SRB-05 | 不涉及 | 59 |
| SRB-06 | 范围、项目 AI 读取许可、再核、受众、不变量 S-114、S-116、S-118 | 34 实现与拒绝测试；发送部分 59 |
| SRB-07 | 入口分行、地区分行、`shares_sessions_with` 必须实测 | 34、59 逐入口验 |
| SRB-08 | 列表与历史合同按定样写 | 34 高保真与实操，本人验收 |
| SRB-09 | 只给读取能力，导入整理不在这里 | 35（Onboarding）；写入按各主人流程 |
| SRB-10 | 第 10.3 节的分界与 `position` | 28 接入，59 持续跟进 |
| SRB-11 | 读取权限单独声明，控制动作不提前加 | 59 |
| SRB-12 | 范围、自动发现、S-115 的「看不等于跑」；不能按时间限定是能力缺口（D7） | 34 |
| SRB-13 | 身份、去重、七个状态、进度 | 34 用真实来源制造中断 |
| SRB-14 | 第 8.1、8.2 节，含子目录、worktree、同仓库两项目、单仓多包、伪造 worktree、工具带进来的目录的反例；S-119 | P-1；34 |
| SRB-15 | 第 8.4 节 | 34 |
| SRB-16 | 第 8.5 节、第 7.4 节、S-118。授权来自项目许可，归属只定范围；所以许可开着时，本人给项目新连目录会让 AI 可读的会话变多。工具做不到这一点：工具带进来的目录不算，工具报的绑定不进 AI 的可读范围 | P-1；34 |
| SRB-17 | 登记停止方式；`activity` 三态是它的前提 | 59 |
| SRB-18 | 不涉及 | 59 |

## 12. 和现状对不上的地方

2026-11-06 用户定了八项之后的状态。「已改」指这次一起改了需求或批次文件。

| # | 哪里 | 对不上什么 | 状态 |
| --- | --- | --- | --- |
| 1 | BL-955、[核查 §3](source-contract-checks-2026-11.md#3-一处工具名单bl-955) | 说三份名单，实际十二处：`RUNTIME_DISPLAY_NAMES` 是第四份，另有七处手写，其中一处在浏览器代码；还有 Shelf 的 `SHELF_ENGINES` | 第 4.4 节收十一处，Shelf 留作余项并写了理由；批次文件和 BL-955 已改；核查是 11-04 的记录，不改 |
| 2 | 需求 §7 第 9 项 | 「进度经已有的事件推送」没有这样的通道 | 已改（D5） |
| 3 | 需求 §7 第 6 项 | 「库结构进升级链」与现行「只留基线、版本不符就拒绝」不符 | 已改 |
| 4 | 需求 §7 第 6 项与 §1.3 末段 | 单条归属两种说法，且 `modules/private-work-context` 已有绑定 | D1 定了；§1.3 末段不改，那句「新归属应经同一项目主人和公开合同接入」指目录关系经 Projects 公开合同 |
| 5 | 需求 §1.3 | 写「目录／仓库」，项目数据里只有路径 | 已改（D2），仓库现算 |
| 6 | 需求 §1.3 与现役代码 | 现役 MCP 流程把目录成员只算建议，新归属是唯一就自动归入，两条路对同一会话结果会不同 | 不动现役流程，新归属不走旧段 |
| 7 | 需求 §4 | 写「账号、凭据、授权归原服务」，和 D6 的读取范围归 Sessions 不完全一致 | 已改 |
| 8 | 盘点 §2 | A 组写「带机器读输出」，但逐家表里 Grok、Kiro、MiniMax 的机器读出口是「未查到」或有问题；MiniMax 的列表只在 TUI | 矩阵按逐家事实写 |
| 9 | 盘点 §3 | Windsurf 已改名 Devin Desktop；Cascade 停用日期是第三方转述 | 加 `devin-desktop`，`windsurf-cascade` 保留 |
| 10 | 盘点 §3 | 漏了 `copilot-ide`、`junie-ide`、`qoder-ide`、`qoder-cn-ide`、`codebuddy-cn`、`codebuddy-ide`、`minimax-agent`；Codex 的 IDE、桌面、云端入口也没单列 | 全部补行，写待核 |
| 11 | 盘点 §4、§5 | 待核项已查到：Amp 的 `threads` 命令、Qoder CN、Pi、`gh agent-task`；Codex 有 `thread/*` 协议和 `codex queue`，Claude Agent SDK 有列表与读取函数 | 矩阵已更新；盘点是 11-03 的记录，不改 |
| 12 | 核查 §3.2 | 说 `isTerminalSessionId` 不动；服务包要同一规则 | 第 4.3 节只搬定义，行为不动 |
| 13 | 本机 | `claude --help` 被本机的包装命令盖住 | `claude-code` 一行只写官 |
| 14 | [定样](../../docs/design/sessions-sources/README.md) | D2、D4、D8 让用户看过的样多了三处：Sheet 写明含 worktree，读取范围里多一个项目许可开关，待归类写明发给模型的内容（含项目名和目录） | 改归属 Dialog 也要加第 8.2 节那一句。这几处要进定样再做产品代码，主会话定走不走一次看样 |
| 15 | [核查 §1](source-contract-checks-2026-11.md#1-第-20-批要的历史读取能力)、第 20 批 | 核查说就绪只看读取范围；D4 之后还要看项目许可 | 就绪说法以第 6.5 节为准。核查是 11-04 的记录，不改；`specs/scene-and-page-contract/spec.md` 由主会话转交 |
| 16 | 需求 SRB-09、第 35 批 | 冷启动由 AI 读历史整理，而项目许可默认关 | Onboarding 加一步让本人打开，列在第 10.2 节；批次 35 的文件由主会话转交 |
| 17 | 需求 SRB-16 | 写「自动归入不扩大读取权限」，而 D4 让项目 AI 读到含自动归入的会话 | 已裁定：授权来自项目许可，归属只定范围，写在第 11 节 SRB-16 一行 |
| 18 | 团队批 | 「团队项目先不开放」现在无从判断，项目没有这个标记 | 团队批接入时，`sessions.project_ai_read.set@1` 对共享项目拒绝并加测试 |
| 19 | 路线书决策表第 11 项 | 记着 Sessions 技术方案待定 | 统筹的跨批文件，不改 |
| 20 | 许可开关定样方案 A | 用户选 A | 全局 Sheet 改别的项目做得到，`sessions.scope.read@1` 带回全部项目（第 7.4 节），动作总数不变。`sessions.scope.read@1` 同时带回每个项目的计数。定样分支 `claude/roadmap-22-permit-sample-31916b` 还没合入，它的 README 里「行里的数字没有合同来源」和「这些目录下的会话进待归类」（后者要加「选所有目录时」，见第 7.1 节）两句待改。关掉时那句「已经写进回答的内容不会收回」用户已定，写在第 7.4 节 |
| 21 | `bound_by` 存量 | 片 P-1 之前终端面板写下的目录关系，`bound_by` 是本人的 id，会算成本人建的；`context_bind` 的旧行不是本人 id，白名单下自动不算 | 真实 Home 重建在 P-1 之后就没有；否则维护窗口要核一次，交主会话排 |
| 22 | 已定裁定之间 | 第一版让 `reported` 进项目 AI 的可读范围，和 P4 的本意有张力 | 已定（2026-11-06）：收紧，`reported` 不进，本人确认后才算（第 7.4 节、S-118） |
| 23 | 绑定指向另一个项目 | 会话在本人连的 A 目录下，工具绑到 B | 已定（2026-11-06）：仍 `automatic` 归 A，行上标「工具另报」，打开后写「工具报的是另一个项目」，写在第 8.2 节、S-118 |
| 24 | 项目设置 | 工具带进来的目录和本人连的看起来一样，「本人再连一次」没有入口 | **要进定样**：两种目录分开显示，后者给确认入口；实现列在片 S-5 |
| 25 | 需求 §2「开放工具同走公共接入合同」 | 登记表在合同里、适配在服务包里，第三方插件现在贡献不了来源适配 | 本批不做；要开放成扩展点在第 59 批之后另议 |

## 13. 已定

用户 2026-11-06 定（P3、P4 与开关定样是同日稍后定的），理由与否掉的方案在[需求 §8](spec.md#8-决策记录)。

| 项 | 决定 | 落在 |
| --- | --- | --- |
| D1 | Sessions 自己存单条决定；已有 Runtime 绑定只读进来作归属依据，不回写，不带任何读取权；显示成工具报的，不写成本人确认（P4） | 第 8.1、8.2 节 |
| D2 | 子目录和 git worktree 都算；同一仓库连两个项目算不唯一；只读 `.git`、`commondir`、`gitdir`，互相指着才算 worktree（P3），绝不跑 git；`linked_projects` 和自动归入只认本人建的目录关系，工具带进来的目录下的会话进待归类（P4）；`linked_projects` 含 worktree；已删、认不出的不算进 `linked_projects`，选「所有目录」时才看得到并走 AI 建议 | 第 7.1、8.2 节，S-119 |
| D3 | 跨会话只搜标题、目录、工具名；内容进单个会话搜；工具自带搜索的加「在这个工具里搜」；全文索引不做 | 第 6.4 节，SRB-02 |
| D4 | 读取权与归属分开：每个项目一个 AI 读取许可，默认关，只有本人能改；`agent`、`workflow`、`plugin` 要它，且只到当前项目的 `confirmed`、`automatic` 会话，工具报的不算；MCP 另需 S-08；待归类和全部只有本人；团队项目先不开放 | 第 6.5、7.4 节，S-118 |
| D5 | 页面只在有来源在读且可见时询问，逐步拉长；隐藏即停、失败退避、读完即停 | 第 9.5 节 |
| D6 | 读取范围归 Sessions，云端只存 `connection_id`，读取时另核连接有效 | 第 7.1、7.3 节 |
| D7 | 时间窗不做，没有字段，记为能力缺口 | 第 7.1 节 |
| 开关定样 | 方案 A：读取范围分「工具与目录」「项目的 AI」两页，全部项目一张表 | 第 7.4 节 |
| D8 | 打开待归类才跑，同目录一起问，一次最多 20 组，往下翻再要；卡片先显示，建议随后到；界面写明发给模型的内容 | 第 8.4 节 |

## 14. 来源

本稿新增的核对（其余见[盘点](source-inventory-2026-11.md#来源)）：

官方：[Codex app-server](https://learn.chatgpt.com/docs/app-server)、[Claude Agent SDK TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)、[Qoder CN 会话](https://docs.qoder.cn/en/cli/sessions)、[Amp 线程](https://ampcode.com/docs/threads)、[Copilot 编码 Agent 的命令行](https://github.blog/changelog/2025-09-25-kick-off-and-track-copilot-coding-agent-sessions-from-the-github-cli)、[Windsurf 改名公告](https://devin.ai/blog/windsurf-is-now-devin-desktop)、[Cursor 输出格式](https://cursor.com/docs/cli/reference/output-format)、[Cursor 论坛：`ls` 不支持无头](https://forum.cursor.com/t/cli-headless-doesnt-work-with-ls-no-way-to-get-a-list-of-chat-ids/151821)。

第三方（没核对）：[Copilot 会话目录](https://docs.entire.io/integrations/copilot-cli)、[Cursor 云端 Agent 路由](https://docs.litellm.ai/docs/pass_through/cursor.md)、[Cascade 停用日期](https://businesstechnavigator.com/news/windsurf-devin-desktop-cascade-eol-2026)、[Amp 导出字段](https://docs.rs/txcript/0.4.2/txcript/harness/amp/index.html)。

本机 `--help`（只看帮助，没读任何会话）：Codex 0.166.0、Grok Build 1.0.70、Pi 1.5.0。
