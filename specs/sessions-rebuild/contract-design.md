# Sessions 来源与历史的合同设计（路线书 22）

状态：设计稿，2026-11-05 写，2026-11-06 按用户定的八项改完（第 13 节，决策记录在[需求 §8](spec.md#8-决策记录)）；没有实现，等公共合同台合审。第 02 批交完（#1762、#1775、#1786、#1790）、C 轨交接之前不开合同代码。按 `origin/main` `1e8110a5e` 核对，形状按 #1762 合入后写：动作 id 不带 `.v1`，版本写在 `version`，所以这里写 `projects.workspaces.list@1`。

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
| Runtime 工作入口已经能绑项目：`runtime_context_bindings`，键是 `runtime_id` + `stable_work_context_id`，MCP 下后者就是 Runtime 的会话号 | `modules/private-work-context`、`apps/local-host/src/mcp-authority.ts` | 只读进来作依据，不回写（D1，第 8.2 节）。这个模块现在没有批量读的公开函数，要补一个 |
| 现役 MCP 流程里，目录成员只算建议，不算绑定 | `modules/private-work-context/src/project-resolution.ts` 的 `workspaceMemberSuggestions` | 与需求 §1.3 的「唯一关系自动归入」不同，新归属不走这段（第 8.2 节） |
| 系统搜索的来源协议可用，索引由本机用户建，有 `markChanged` | `packages/contracts/src/platform/search-sources.ts`、`horizontal/search` | 跨会话搜索的落点（第 6.4 节） |
| 宿主到页面没有通用推送，页面读 owner 的动作 | `docs/system/CALL-CHAINS.md` | 进度由页面在读取期间询问（D5，第 9.5 节） |
| 项目记录里没有「团队项目」这个标记，Home 现在只有一个人 | `packages/contracts/src/modules/projects.ts` | 「团队项目先不开放」现在没有东西可判，第 7.4 节写了团队批接入时做什么 |
| `<home>/sessions/` 是退役目录：新 Home 不创建，快照按未知条目拒绝 | `docs/system/HOME-DATA.md` | 新库不能用这个路径（第 9.2 节） |
| Home 上每个库只留当前基线，版本不符就拒绝，不写迁移链 | [合同变更流程](../../docs/system/CONTRACT-CHANGES.md) | 需求 §7 第 6 项的「进升级链」要按这条读（第 9.2 节） |
| `retainBackgroundAuthority` 只在调用活着时有效，不跨重启 | `packages/contracts/src/platform/actions.ts` | 后台发现的依据是读取范围这条记录，不是留住一次调用（第 7.3 节） |

## 3. 厂商与入口矩阵

覆盖[需求 §2](spec.md#2-已定覆盖范围) 每个产品入口。一行一个入口，CLI、IDE、桌面、云端分开，国内、国际分开。第一列的 id 就是登记表的 id，`tests/action-external-tools.test.ts` 核两边相同（第 4.5 节）。

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
| 待 | 缺口：未查到或待核，**不等于没有** | `gap: "unverified"` |

**可信度：** 官＝产品自己的文档；帮＝本机 `--help` 看过（写版本）；三＝第三方说法，没核对；待＝未查到。每个缺口的回退：有导出写导出，否则「回到原工具」。

### 3.1 海外

| id | 产品入口 | 发现 | 列表 | 读历史 | 搜索 | 恢复 | 发送 | 停止 | 导出 | 可信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `codex` | Codex CLI | 协 `thread/list` | 协 `thread/list` | 协 `thread/read`、`thread/items/list` | 待 | 命 `codex resume <id>`（工作终端已接） | 命 `codex exec resume <id>`、`codex queue --thread` | 协 `turn/interrupt` | 待 | 官；帮 0.166.0。命令行把 `app-server` 标 experimental，官方页说这几个方法稳定，以实测为准 |
| `codex-ide` | Codex IDE 扩展 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 |
| `codex-desktop` | Codex 桌面 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 帮 0.166.0（只知道 `codex app` 能启动） |
| `codex-cloud` | Codex 云端任务 | 命 `codex cloud list` | 命 `codex cloud list` | 无：`status`、`diff` 只有状态和差异，不是对话 | 待 | 无：只有把差异应用到本地 | 无：`codex cloud exec` 是新任务，不算续接 | 待 | 待 | 帮 0.166.0，experimental |
| `claude-code` | Claude Code CLI | 协 Agent SDK `listSessions()`；或录 `~/.claude/projects/` | 协 `listSessions()` | 协 `getSessionMessages()`；或录 | 界（选择器内） | 命 `--resume <id>`（工作终端已接） | 命 `-p --resume <id>` | 待：`claude agents --json` 只列运行中的 | 待 | 官。默认只留 30 天，读不到早期的不算没有 |
| `claude-code-desktop` | Claude Code 桌面 | 界 | 界 | 界 | 界 | 界（官方说能恢复 CLI 会话，是否共用未实测） | 界 | 界 | 待 | 官 |
| `claude-code-ide` | Claude Code VS Code | 界 | 界 | 界 | 界 | 界 | 界 | 界 | 待 | 官 |
| `claude-code-web` | Claude Code 网页 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点第 5 节待核） |
| `gemini-cli` | Gemini CLI | 命 `gemini --list-sessions` | 命（输出格式未查到） | 录 `~/.gemini/tmp/<项目哈希>/chats/` | 待 | 命 `--resume <UUID>`（只用 UUID，序号会变） | 待 | 待 | 待 | 官 |
| `antigravity-cli` | Antigravity 终端 | 私 | 界 `/resume` | 私 | 待 | 界 `/resume` | 待 | 待 | 待 | 三 |
| `antigravity-desktop` | Antigravity 桌面 | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `copilot-cli` | Copilot CLI | 录 `~/.copilot/session-state/<id>/`（三；官方文档没直接核到） | 界 `--resume` 选择器 | 录 `events.jsonl`（格式未公开） | 待 | 命 `--resume <id>` | 待 | 待 | 待 | 官（命令）、三（路径） |
| `copilot-ide` | Copilot IDE 会话 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `copilot-coding-agent` | Copilot 编码 Agent（云端） | 命 `gh agent-task list` | 命 `gh agent-task list` | 命 `gh agent-task view --log` | 待 | 无 | 待 | 待 | 待 | 官，preview；盘点第 5 节写未查到，本稿查到 |
| `cursor` | Cursor Agent CLI | 私：`~/.cursor/chats` 是私有库（三） | 界：`agent ls` 不支持无头，官方人员确认过（2026-01 版） | 私 | 待 | 命 `--resume=<chat-id>` | 待 | 待 | 待 | 官 |
| `cursor-editor` | Cursor 编辑器 | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无 | 三 |
| `cursor-cloud` | Cursor 云端 Agent | 服 `GET /v0/agents`（三） | 服（三） | 服 `/conversation`（三） | 待 | 待 | 服 followup（三） | 服 stop（三） | 待 | 三；需求 §2 没列，本稿补，官方页要再核 |
| `kiro-cli` | Kiro CLI | 命 `--list-sessions` | 命（输出格式未核） | 录 `~/.kiro/sessions/`（三） | 待 | 命 `--resume-id <id>` | 待：无头模式拿不到会话 ID（问题单） | 待 | 待 | 官（命令）、三（路径） |
| `kiro-ide` | Kiro IDE | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 待 | 三 |
| `devin-cloud` | Devin 云端 | 账 企业 API | 账 | 账 会话消息接口，要服务账号 | 待 | 界 网页 | 待 | 待 | 待 | 官（接口文档） |
| `devin-desktop` | Devin Desktop（原 Windsurf，2026-06 改名） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 官（改名公告）；会话未查到，盘点没写，本稿补 |
| `windsurf-cascade` | Windsurf／Cascade（旧版） | 私：加密 `.pb` | 界 | 私 | 界 | 界 | 界 | 界 | 无 | 三。Cascade 据报 2026-07-01 停，旧记录仍可能在用户机器上，行不删 |
| `grok-build` | Grok Build | 命 `grok sessions list` | 命（输出格式未核） | 待：`~/.grok/` 无官方读取口 | 命 `grok sessions search` | 命 `--resume <id>`（工作终端已接；别用标题） | 待 | 待 | 待 | 帮 1.0.70 |
| `junie-cli` | Junie CLI | 录 `transcript.md`、`events.jsonl`（根目录未写） | 界 `/history` | 录 | 界 | 界 `/history` | 待 | 待 | 待 | 官 |
| `junie-ide` | Junie IDE | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `droid` | Droid | 命 `droid search --json` | 界 `/sessions` | 待：`-o json` 是运行输出 | 命 `droid search --json` | 命 `droid resume <id>` | 命 `droid exec -s <id>` | 待 | 待 | 官 |
| `amp` | Amp CLI | 命 `amp threads list` | 命 | 命 `amp threads markdown`、`export`（JSON 只给创建者） | 命 `amp threads search` | 待 | 待 | 待 | 命 `amp threads export` | 官；flag 未核。盘点第 5 节待核，本稿查到 |
| `amp-web` | Amp 网页 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 界 | 官说「各端同一线程」，共用未实测 |

### 3.2 国内与开放工具

| id | 产品入口 | 发现 | 列表 | 读历史 | 搜索 | 恢复 | 发送 | 停止 | 导出 | 可信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `qwen-code` | Qwen Code | 命 `qwen sessions list --json` | 命 | 待：`/export` 在 TUI 内；`--acp`、`@qwen-code/sdk/peer` 未核 | 待 | 界 `/resume` | 待 | 待 | 界 `/export` | 官。`qwen sessions ps --json` 可报运行中 |
| `lingma` | 通义灵码 | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `qoder` | Qoder CLI（国际） | 命 `--list-sessions` | 命 | 待：`-p -o json` 是运行输出 | 待 | 命 `-r <id>` | 待 | 待 | 待 | 官 |
| `qoder-ide` | Qoder IDE（国际） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `qoder-cn` | Qoder CLI（国内，`qodercn`） | 命 `qodercn --list-sessions` | 命（JSON 输出未写） | 录 `~/.qoder-cn/projects/<目录>/<id>.jsonl` | 待 | 命 `qodercn -r <id>` | 待 | 待 | 待 | 官；盘点写待核，本稿查到。与国际版是否共用未写，按不共用 |
| `qoder-cn-ide` | Qoder IDE（国内） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `codebuddy` | CodeBuddy Code（国际） | 待 | 待：列表命令未查到 | 待：只知日志在 `~/.codebuddy/logs/` | 待 | 命 `-r <id>`（交互模式） | 待 | 待 | 待 | 官 |
| `codebuddy-cn` | CodeBuddy（国内） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（地区版本未核，本稿补） |
| `codebuddy-ide` | CodeBuddy IDE | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `trae` | TRAE（国际） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三。国内外是两个站，历史是否互通未查到 |
| `trae-cn` | TRAE（国内） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `solo` | SOLO（国际） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `solo-cn` | SOLO（国内） | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 无（三） | 三 |
| `kimi-code` | Kimi Code | 录 `~/.kimi-code/sessions/` | 界 `/sessions` | 命 `kimi export <id>` | 待 | 命 `--session <id>` | 待：`kimi acp`、Server API 未核 | 待 | 命 `kimi export <id>` | 官 |
| `zcode` | ZCode | 私 | 界 | 私 | 界 | 界 | 界 | 界 | 待 | 三 |
| `minimax-code` | MiniMax Code | 录 `~/.minimax` | 界 `/sessions` | 录 | 界 | 命 `mcode --session <id>` | 待 | 待 | 待 | 官 |
| `minimax-agent` | MiniMax 开发 Agent（网页） | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待（盘点漏了，本稿补） |
| `comate` | 文心快码 Comate | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 |
| `zulu` | Zulu | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 | 待 |
| `codearts-agent` | CodeArts 代码智能体 | 待 | 待 | 待 | 待 | 待：有 `codearts run`，会话命令未查到 | 待 | 待 | 待 | 官（CLI 存在） |
| `opencode` | OpenCode | 命 `opencode session list` | 命 | 命 `opencode export <id>` | 待 | 命 `--session <id>`（工作终端已接） | 待 | 待 | 命 `opencode export <id>` | 三 |
| `pi-agent` | Pi Agent | 录 `~/.pi/agent/sessions/`（可被 `--session-dir` 与环境变量改） | 界 `--resume` 选择器 | 录 | 待 | 命 `--session <id>`（工作终端已接；接受路径和部分 ID，只传完整 ID） | 待：`--mode rpc` 未核 | 待 | 命 `--export <file>`（HTML） | 帮 1.5.0；盘点写待核，本稿查到 |

### 3.3 三个读表要注意的

- **恢复与发送不是本批接的。** 这两列和停止列只是登记能力，实现在第 59 批。第 34 批只接前四列和导出。
- **同品牌不外推。** `claude-code` 接通不代表 `claude-code-web` 接通。入口之间是否共用会话，只在实测后写进 `shares_sessions_with`（第 5.2 节）。
- **同一能力有两种路时只登一种。** `claude-code`、`codex` 优先协议，少碰内部格式。Agent SDK 是新增 npm 依赖，由第 34 批这一家的适配片定，登记表随实现改成实际走的那条。

## 4. 外部工具登记表

### 4.1 类型

新子路径 `packages/contracts/src/platform/external-tools.ts`（导出 `./platform/external-tools`）。纯数据，没有函数值，所以恢复参数写成模板。

```ts
export type ExternalToolSurface = "cli" | "ide" | "desktop" | "cloud";
export type ExternalToolRegion = "global" | "cn" | "unspecified";
export type ExternalToolTrust = "official" | "help" | "third_party" | "unverified";
export type ExternalToolGap = "not_offered" | "private_store" | "interactive_only" | "needs_account" | "unverified";
export type ExternalSessionCapability = "discover" | "list" | "read" | "search" | "resume" | "send" | "stop" | "export";

/** 一项能力怎样接：四种接入方式，或者一个带原因的缺口。 */
export type ExternalToolAccess =
  | { via: "command"; argv: readonly string[]; output: "json" | "jsonl" | "text"; trust: ExternalToolTrust }
  | { via: "protocol"; protocol: string; method: string; trust: ExternalToolTrust }
  | { via: "service"; service_id: string; trust: ExternalToolTrust }
  | { via: "local_record"; root: ExternalToolPath; format: "documented" | "internal"; trust: ExternalToolTrust }
  | { via: "gap"; gap: ExternalToolGap; note: string; fallback: "return_to_tool" | "export" | "none"; trust: ExternalToolTrust };

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
  detect?: { commands: readonly string[]; version_argv: readonly string[]; version_pattern: string };
  mcp_integration?: true;
  terminal?: { command: string; resume_argv: readonly string[] };
  character_import?: { config_root: ExternalToolPath };
  sessions: Readonly<Record<ExternalSessionCapability, ExternalToolAccess>>;
  /** 这一行最后核对的日期与版本。 */
  checked: { on: string; version?: string };
}
```

`argv` 与 `resume_argv` 里只有占位符 `{session_id}`、`{query}` 由宿主替换，且必须独占一个元素：

```ts
{ id: "codex", terminal: { command: "codex", resume_argv: ["resume", "{session_id}"] }, /* … */ }
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
| `TERMINAL_RUNTIMES`、`TerminalRuntime` | `idsWith("terminal")` | `apps/local-host/src/plugin-terminal-runtimes.ts`，`RECIPES` 删掉，`terminalRuntimeRecipe` 从登记表读 |
| `CHARACTER_IMPORT_RUNTIMES`、`CharacterImportRuntimeId` | `idsWith("character_import")` | `character-import.ts` |

三个要点：

- **顺序是合同。** 登记表把这六家排在最前：`codex`、`claude-code`、`cursor`、`opencode`、`pi-agent`、`grok-build`。这样三份名单的成员和顺序都和今天一样，界面排序不变，PR 里写「成员不变，对调用方无影响」。
- **`cursor` 这个 id 留给 Agent CLI 一行。** 它今天只用于角色导入，配置根目录 `~/.cursor` 由 CLI 和编辑器共用；编辑器是另一行 `cursor-editor`，不带 `character_import`。
- **命令名不够认人。** 本机 `agent` 是指向 grok 的链接，而 Cursor 的命令也叫 `agent`。`detect` 要跑一次 `version_argv` 并匹配 `version_pattern`，不符就当没装，不把输出交给这家的解析器。

会话 ID 的规则只留一份：`plugin-terminal-runtimes.ts` 的 `TERMINAL_SESSION` 正则搬到 `external-tools.ts`，导出 `EXTERNAL_SESSION_NATIVE_ID_PATTERN`。`isTerminalSessionId` 留在原处用它，行为不变，S-103 的代码位置一格不用改。[核查 §3.2](source-contract-checks-2026-11.md#32-合成一份的做法) 写的「不动」指行为，这里只搬定义，理由是服务包也要同一条规则，不写第二份。

### 4.4 还有七处手写要一起收

`git grep '"grok-build"'` 查到的，核查和 BL-955 只算了三份：

| 位置 | 是什么 | 收法 |
| --- | --- | --- |
| `apps/desktop/src/web-host.ts` | 命令可用性表 | 遍历 `TERMINAL_RUNTIMES`，命令名取配方 |
| `apps/workbench/src/terminal/pane.ts` | 显示名表（服务端渲染） | 同上；显示顺序今天是 Claude Code 在前，保留要写一句 |
| `apps/workbench/src/browser/characters/common.ts` | 显示名表（**浏览器**） | 不把登记表带进浏览器：宿主在快照候选上下发 `label`，页面读它 |
| `apps/local-host/src/character-import-discovery.ts` | `LABELS` 与命令名表 | 读 `display_name` 与 `detect.commands` |
| `apps/local-host/src/character-import-paths.ts` | 配置根目录表 | 读 `character_import.config_root` |
| `modules/characters/src/service.ts` | 显示名表 | 读 `display_name` |
| `apps/workbench/src/characters/import-ui.ts` | 下拉选项 | 由宿主渲染时遍历 `CHARACTER_IMPORT_RUNTIMES` |

`character-import-runtimes.ts` 的扫描函数表和 `runtime-config-adapters.ts` 的适配是行为，不是名单，留在宿主，用 `Record<CharacterImportRuntimeId, …>` 这类派生类型钉住，缺一家就编译不过。

**页面资源。** 登记表 50 行，浏览器不许 import 它。插件里 `RUNTIME_DISPLAY_NAMES` 的值只有 `plugins/native/goals/src/event-acknowledgement-body.ts` 在用，写手要跑 `pnpm page-assets:check` 确认这个文件不进页面包；进了就改由宿主给名字，不放宽预算。

### 4.5 防止手写回潮的测试

`tests/action-external-tools.test.ts`，随 `test:contracts` 的 `tests/action-*.test.ts` 跑，不改 CI。测试名写 SRB-01、SRB-07。

| 断言 | 拦什么 |
| --- | --- |
| 三份名单等于今天的成员与顺序（写字面量，只有这里许写） | 派生顺序变了 |
| 三份名单等于登记表按字段筛出的结果 | 绕开派生 |
| 第 3 节矩阵第一列的 id 集合等于登记表的 id 集合（读本稿的表） | 表和代码走散；有人删行 |
| `via` 不是 `gap` 时 `trust` 不能是 `unverified`；`gap` 必须有 `note` | 未核的写成支持 |
| `sessions` 八项都有；`shares_sessions_with` 指向存在的 id、不成链 | 漏项 |
| `resume_argv` 恰好一个 `{session_id}`，独占一个元素；`command` 是裸命令名 | 拼接注入 |
| 用 TypeScript AST 扫 `apps`、`horizontal`、`modules`、`packages`、`plugins` 的 `.ts`：数组字面量含两个以上登记 id 一律失败；对象字面量含两个以上登记 id 作键时，只有声明类型是派生类型的 `Record<…>` 才放过；登记表文件自身除外 | 手写名单回潮。放在测试里，不改门禁脚本 |

## 5. 会话身份与去重

### 5.1 身份

| 部分 | 取值 | 为什么 |
| --- | --- | --- |
| `entry_id` | 主入口 id：有 `shares_sessions_with` 就取它指向的 | 同一份会话从两个入口看到时是一条 |
| `location_key` | 本机：`local:` + 工具数据根目录真实路径 SHA-256 的前 24 位，写法同 `workspace_id`；云端：`connection:` + `connection_id` | 两个 `CODEX_HOME` 是两个来源 |
| `native_id` | 工具给的稳定 ID，必须过 `EXTERNAL_SESSION_NATIVE_ID_PATTERN` | 序号、标题、路径都不算身份 |

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
| `sessions.scope.read@1` | query／read | `user` | `sessions:read` | 不声明 | C-2 |
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
  /** 登记表每一行一条，含未允许和暂不支持的。 */
  sources: ExternalSessionSource[];
  unfiled_count: number;
  next_cursor: string | null;
  scope_revision: number;
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
- 打开列表不等发现。来源过期（默认 5 分钟）且调用者是 `user` 时，服务去重后在后台排一次发现，不阻塞这次返回。Agent、MCP 调用不触发，防止循环调用变成频繁起子进程。
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
  location_key: string | null;   // 还没允许时可能没有
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
- **会话内搜索**：原文不落盘，所以每次在来源上流式扫。一次最多扫 32 MB，超了 `scanned_all: false`，用 `search.next_cursor` 接着扫。同一会话的解析结果可放进程内短缓存，键含文件大小与修改时间，不写库。
- 不调模型，不等 AI（需求 §4）。
- 给 `agent`、`workflow`、`mcp`、`plugin` 的输出过 SDK 的密钥脱敏；给 `user` 的是原文。原因：工具步骤的输出里可能有密钥，本人看自己的记录没问题，进别的上下文不行。

### 6.4 跨会话搜索

跨会话搜索只到标题、目录、工具名（D3）。三层：

| 层 | 做什么 | 落在哪 |
| --- | --- | --- |
| 找会话 | 标题、目录、工具名 | `sessions.search.entries@1`，`defineSearchEntriesAction` 声明的来源，`content: "summary"`，`scope: "home"`，`audiences: ["user"]`。经 `search.query` 查，`project_id` 为空，算个人内容 |
| 在一个会话里找 | 这个会话的正文 | `sessions.history.read@1` 的 `query`（第 6.3 节） |
| 在这个工具里搜 | 工具自带搜索的（登记表 `search` 不是缺口的，现在是 Grok Build、Droid、Amp） | `sessions.tool.search@1` |

全文索引不做，原文不进任何索引。以后要做另议，做的话是本人开启。

`sessions.tool.search@1` 输入 `{ entry_id, location_key, query, limit }`，输出 `{ sessions: ExternalSessionRow[]; skipped_count: number }`。只返回索引里有、当前范围内的会话；工具报出的其他结果只计入 `skipped_count`。`query` 以 `{query}` 占一个 `argv` 元素，不许以 `-` 开头（S-115）。工具的 `search` 是缺口时报 `sessions.source_unsupported`。

「找会话」这一层的三条约束：

- 只列当前范围内的会话；`collection_revision` 含 `scope_revision`。
- `sessions.scope.set@1` 提交后，宿主同步调 `SearchService.markChanged("system.sessions", null)`。只标记不够：查询有时间预算，收窄后的旧条目可能还在。第 34 批要加一条测试，收窄后紧接着 `search.query` 不返回范围外的标题；过不了就要给搜索补一个同步移除的端口，这是对 `horizontal/search` 的改动，由它的主人落。
- `search.open` 用 `external_session` 的对象读取器重新核对范围。

### 6.5 第 20 批怎样用

场景套组把 `sessions.list@1` 写成 `requires` 的可选依赖。

**就绪判断**（D4 带来的变化，由主会话转交第 20 批）：要同时满足两条，由外壳以本人身份调 `sessions.scope.read@1` 判断：

1. `sources` 里至少有一项不是 `not_allowed`、`unsupported`；
2. `project_ai_read.allowed` 是 `true`。

第二条默认是关的。缺第一条时去处是读取范围，缺第二条时去处是这个项目的许可开关，两者分开显示。

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

export interface ExternalSessionScopeView {
  sources: Array<ExternalSessionReadScope & { adapter: "available" | "none" }>;
  /** 调用者当前项目的 AI 读取许可；没有当前项目时为 null（第 7.4 节）。 */
  project_ai_read: ExternalSessionProjectAiRead | null;
  scope_revision: number;
}
```

`directories` 的两种就是定样 Sheet 上的两个选项。`linked_projects` 是活的：项目新连上目录就进范围，解除就出范围，每次按 Projects 当前的目录算。范围包含这些目录的子目录，以及这些目录所在仓库的 worktree（D2，判法同第 8.2 节）。这不算扩大授权，用户选的就是这个说法；Sheet 文案要写明含 worktree。

没有目录的会话（云端、目录丢失）和认不出仓库的已删 worktree，在 `linked_projects` 下不算范围内。

发现时范围外的会话在写库前过滤掉，不进索引。

**这一版的能力缺口：** 不能按时间限定读取范围，没有这个字段（D7）。本机工具不写账号时也不能按账号收窄（第 5.1 节）。

### 7.2 收窄与停止

`sessions.scope.set@1` 只给 `user`，整份替换，带 `expected_revision`，不符报 `sessions.scope_conflict`。步骤：

1. 写新范围，`revision` 加一，全局 `scope_revision` 加一。
2. 事务后取消被收窄来源的在跑任务（每个来源一个 `AbortController`）。
3. 调搜索的 `markChanged`。
4. 放宽的来源排一次发现。

收窄不删索引行，只是不再返回（需求 §1.2「不隐式清理旧数据」；定样「之前读到的也不显示」）。再放宽时旧行重新出现，并按最新结果校正。暂不支持的工具不能勾，勾了报 `sessions.source_unsupported`。

### 7.3 异步返回前怎样再核

外部读取前后范围可能变。三处用同一个函数 `assertInScope(session, capturedRevision)`，全程同步、不让出。`user` 以外的调用者，这个函数同时核项目许可和会话是否还归这个项目：

| 路径 | 等待前 | 等待后 |
| --- | --- | --- |
| `sessions.history.read@1` | 解析 `session_key`，核范围，记下这个来源的 `revision` | `await caller.beforeEffect()`，再同步尾检 `revision` 未变或仍覆盖该会话，**之后不再 await**，直接返回。失败抛 `sessions.scope_changed`，不带内容 |
| 后台发现 | 记 `revision` | 每批写库的事务里核 `revision`，变了整批丢弃 |
| AI 建议 | 只把范围内的材料交给模型 | 写建议的事务里再核；范围外的结果丢弃，不写 |

云端来源多核一条：连接仍在且 `enabled`（`ports.connections.current`）。

后台发现的依据是读取范围这条记录，不是留住某次调用的授权：它要跨重启接着读，而 `retainBackgroundAuthority` 不跨重启。需求 §1.2 也要求已有许可不因重启重问。Host 关停时取消全部任务，重启后从 `session_sources` 的进度接着读。

被取消或收窄的调用不写业务记录，符合 AGENTS 硬约束；来源进度行也按同一规则，中止时不更新。

### 7.4 项目的 AI 读取许可

读取权与归属分开（D4）。每个项目一个许可：「允许这个项目的 AI 读这里的外部会话」。默认关，开一次长期有效，只有用户本人能改。它是读取范围的一部分，存在 `horizontal/sessions`，界面在读取范围这一处。

```ts
export interface ExternalSessionProjectAiRead {
  project_id: string;
  allowed: boolean;
  revision: number;
  decided_at: string | null;      // 从没改过时为 null，allowed 为 false
}
```

`sessions.project_ai_read.set@1`：输入 `{ allowed: boolean; expected_revision: number }`，项目取自调用上下文，不从输入读。没有当前项目报 `sessions.project_required`。

| 调用者 | 要什么 | 能读到什么 |
| --- | --- | --- |
| `user` | 读取范围 | `project`、`unfiled`、`all` 全部 |
| `agent`、`workflow`、`plugin`（含生成页面） | 读取范围，加当前项目的许可开着 | 只有 `view: "project"`，只到归属当前项目的会话（`confirmed`、`automatic`），列表和原文一样 |
| `mcp` | 同上，再加 S-08 的逐客户端授权 | 同上 |

- 许可关着：报 `sessions.project_ai_read_off`（`forbidden`），`details.next_step` 是 `open_project_ai_read`。不返回空列表。
- 非本人用 `unfiled`、`all`：`actions.forbidden`。
- 读不归当前项目的会话：`sessions.not_found`，不透露它存在。
- 关掉后在途的调用在第 7.3 节的尾检处被拒。
- 许可不扩大读取范围：工具没允许、目录在范围外时，开着许可也读不到。
- 项目删除后这一行不再被用到，`ProjectDeletionService` 不加步骤。
- AI 归属建议不看这个许可：它由本人打开待归类时触发，材料不进项目 AI 的上下文，界面单独写明（第 8.4 节）。
- 团队项目先不开放。项目现在没有团队标记，所以合同里不写判断；团队批接入时，这个动作要对共享项目拒绝，并加一条拒绝测试。这一步记在第 12 节。

## 8. 项目归属

### 8.1 读哪份合同

`horizontal/sessions` 不依赖 `modules/projects`，由宿主注入端口：

```ts
projects: Pick<ProjectsQueryApi, "listWorkspaceDirectory" | "selections">;
/** 已确认的 Runtime 绑定，只读（D1）。 */
bindings: { listConfirmed(): Array<{ runtime_id: string; stable_work_context_id: string; project_id: string }> };
/** 认目录：真实路径与所在仓库，只读 `.git` 文件，见第 8.2 节。 */
directories: { identify(path: string): { real_path: string; repository_key: string | null } | null };
```

`ProjectsQueryApi` 是 `packages/contracts/src/modules/projects.ts` 的公开合同，`modules/private-work-context` 用的同一份。不用 `projects.workspaces.list@1`：它只回当前项目，要全局关系就得按项目逐个调（N52 那一类）。

`bindings.listConfirmed` 是 `modules/private-work-context` 要补的公开读取，由 Projects 之外的这个主人给，一次读完，Sessions 不读它的表，也不回写。

一次列表读一遍 `listWorkspaceDirectory()` 和 `listConfirmed()`，算出摘要。摘要变了才重算派生归属（第 8.2 节）。

### 8.2 归属怎样算

单条决定之外的归属是算出来的，不存第二份关系（需求 §1.3）。缓存在 `session_directories` 上，一个目录一行，带目录表摘要，摘要不符就重算，所以项目解除、删除后不会靠旧值继续生效。

优先级，高的先：

| # | 情况 | 结果 |
| --- | --- | --- |
| 1 | 有单条决定：归到某项目，且项目还在 | `confirmed` |
| 2 | 有单条决定：先不归 | `unfiled`，`left_unfiled`，不再请 AI 建议 |
| 3 | 有单条决定，但项目已不在 | `unfiled`，`project_gone`，不自动换项目 |
| 4 | 有已确认的 Runtime 绑定，且项目还在 | `confirmed`，`basis: "runtime_binding"` |
| 5 | 目录或仓库匹配到唯一项目 | `automatic`，依据是这条目录关系 |
| 6 | 匹配到多个项目，含同一仓库连着两个项目 | `unfiled`，`ambiguous`，候选是这几个项目，走 AI 建议 |
| 7 | 曾匹配、现在没有了 | `unfiled`，`relation_gone` |
| 8 | 没有匹配，或目录已不存在、认不出 | `unfiled`，`no_relation`，走 AI 建议 |

**第 4 行（D1）。** 这条依据只算归属，不带任何读取权：工具没允许就读不到，项目 AI 没许可就读不到。绑定的键没有账号和位置，所以只用于本机来源；同一绑定命中两个 `location_key` 时不算，走第 5 行。终端面板的绑定里 `stable_work_context_id` 可能是面板号，对不上原生 ID 就自然不命中。本人在 Sessions 改选后第 1 行优先，不回写绑定，所以连着的工具调用仍落在旧项目，改归属的 Dialog 要写这一句。

**第 5、6 行怎样算（D2）。** 候选项目是下面两条的并集，并集恰好一个才算唯一：

1. 路径：会话目录的真实路径等于已关联目录，或在它之下。按路径段比，不比字符串前缀。
2. 仓库：会话目录的 `repository_key` 等于某个已关联目录的 `repository_key`。worktree 就靠这一条认回主仓库。

`realpath_verified` 为假的关联不进候选。

**认仓库，只读文件，绝不跑 git（S-119）。** `repository_key` 是公共 git 目录真实路径的 SHA-256 前 24 位。

- 从目录往上找 `.git`，到用户主目录或根目录停。
- `.git` 是目录：它就是公共 git 目录。
- `.git` 是文件：只解析 `gitdir:` 一行；进那个目录，读 `commondir` 文件得到公共 git 目录。没有 `commondir` 就用 `gitdir` 本身。
- 只碰 `.git` 与 `commondir` 这两样，每个不超过 4 KB。不读 `config`、hooks 或任何别的文件，内容不外传，只留哈希。
- 读不了、格式不对、路径不存在：`repository_key` 为空，不报错。
- 不在会话目录里跑 git：仓库里的配置和钩子可能让 git 执行代码，而这些目录来自外部工具的记录。

每轮发现时重新认一次，一个目录一次，结果放 `session_directories`。worktree 已删时目录不存在，`identify` 返回空，走第 8 行。

单次历史选择、同名目录、相似标题、「只有一个候选」都不进这张表（需求 §1.3）。现役 MCP 的 `RuntimeProjectResolution` 用 `recent_project`、`session_title` 这类线索打分，这里不复用，它的结果只算建议。

### 8.3 合同形状

```ts
export type ExternalSessionAttribution =
  | { state: "confirmed"; project: ProjectSelection; basis: "user_chose" | "suggestion_accepted" | "runtime_binding"; decided_at: string;
      later_suggestion?: ExternalSessionSuggestion }
  | { state: "automatic"; project: ProjectSelection; evidence: { kind: "directory" | "repository"; path: string } }
  | { state: "unfiled";
      reason: "no_relation" | "ambiguous" | "relation_gone" | "project_gone" | "left_unfiled";
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

**什么时候跑（D8）。** 只在用户打开待归类时跑，往下翻再要下一批。发现时不跑，也没有后台批量。卡片随 `sessions.list@1` 立刻显示，这个动作另发一个请求，建议到了再填进卡片，不挡页面。没到之前卡片照常能改选和先不归。待归类界面写明：标题、目录和开头几句会发给你配置的模型。

**发给模型的（都是范围内的、有上限）：**

```ts
interface SuggestInput {
  groups: Array<{ ref: number; tools: string[]; directory: string | null; titles: string[]; opening: string[] }>;
  projects: Array<{ ref: number; name: string; directories: string[] }>;
}
```

`titles` 最多 5 个；`opening` 是组内最近一个会话前 3 条「你」说的话，每条最多 300 字。总量不超过 `MODEL_DATA_MAX_CHARS`。

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

都在读取时核：`selections()` 里没有的项目，决定显示 `project_gone`，派生归属随摘要重算。`ProjectDeletionService` 不用加步骤，也不新增删除入口。决定行留着，用户改选时覆盖。

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

依赖只有 contracts 和 plugin-sdk（脱敏、整字截）。进程和文件经宿主注入：

```ts
export interface SessionsPorts {
  commands: { run(entry: ExternalToolId, argv: readonly string[], signal: AbortSignal): Promise<SessionCommandResult> };
  files: { open(root: string, relative: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> };
  connections: { current(connectionId: string): { enabled: boolean } | null };
  projects: Pick<ProjectsQueryApi, "listWorkspaceDirectory" | "selections">;
  bindings: { listConfirmed(): Array<{ runtime_id: string; stable_work_context_id: string; project_id: string }> };
  directories: { identify(path: string): { real_path: string; repository_key: string | null } | null };
  suggester: SessionAttributionSuggester | null;
  searchChanged(): void;
}
```

宿主一侧是 `apps/local-host/src/sessions-actions.ts`，只装配，同 `knowledge-actions.ts`。第三方插件贡献来源适配不在本批：登记表是合同，适配在服务包里。需求 §2 的「开放工具」现在按登记一行走；要开放成扩展点是第 59 批之后的事，记在第 12 节。

同步文档：`docs/SSOT-MATRIX.md` 新增一行，`scripts/workspace-packages.mjs`、`docs/system/PACKAGE-BOUNDARIES.md` 现行包清单、`docs/horizontal/sessions.md`、`docs/system/GLOSSARY.md`（外部会话、产品入口、来源、读取范围、待归类）。`tooling/gates/error-owners.json` 加 `sessions` 主人，这是 README 写的常规步骤，不算改门禁。

### 9.2 库与表

库 `external-sessions/external-sessions.db`，第 1 版基线，在 `apps/local-host/src/home-stores.ts` 登记为新库，同时加进发布清单第 3 节的版本表。**不用 `sessions/`**：那是退役目录，快照按未知条目拒绝。只由本包读写，不进 `tooling/gates/table-owners.json`。

| 表 | 主键 | 主要字段 | 性质 |
| --- | --- | --- | --- |
| `external_sessions` | `session_key` | `entry_id`、`location_key`、`native_id`、`seen_via`、`title`、`directory_key`、`last_activity_at`、`forked_from`、`gone_at` | 可重建索引 |
| `session_directories` | `directory_key` | `path`、`realpath_verified`、`repository_key`、`derived_state`、`derived_project_id`、`candidates`、`directory_digest` | 可重建缓存 |
| `session_sources` | `entry_id`、`location_key` | `state`、`reason`、`progress_cursor`、`session_count`、`skipped_count`、`completed_at`、`checked_at` | 可重建进度 |
| `session_read_scopes` | `entry_id`、`location_key` | `allowed`、`directories`、`connection_id`、`revision`、`decided_at` | **用户决定** |
| `session_project_ai_reads` | `project_id` | `allowed`、`revision`、`decided_by`、`decided_at` | **用户决定** |
| `session_attributions` | `session_key` | `decision`、`project_id`、`basis`、`revision`、`decided_by`、`decided_at` | **用户决定** |
| `session_suggestions` | `session_key` | `status`、`project_id`、`alternatives`、`reason`、`evidence`、`input_digest`、`prompt_version`、`created_at` | 可重算 |
| `session_meta` | `key` | `scope_revision`、库版本 | 控制 |

索引：`external_sessions(last_activity_at DESC, session_key)`、`external_sessions(directory_key)`。

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
| S-115 | 子进程只跑登记表写明的只读命令：不经 shell，`argv` 来自登记表，只有 `{session_id}`、`{query}` 被替换；前者过 `EXTERNAL_SESSION_NATIVE_ID_PATTERN`，后者占一个元素、不以 `-` 开头；有时限、输出上限、最小环境；`detect` 不符不跑解析。列表、历史、搜索不启动 `resume`、`exec`、`delete`、`queue` 一类命令 | 原生 ID 写成 `--dangerously…`、带分号或空格时不起进程；搜索词以 `-` 开头时不起进程；`version_pattern` 不符时不解析；走一遍列表、历史、搜索后，假工具记录下的调用里没有写命令（SRB-12） |
| S-116 | 外部读取返回前再核范围：收窄、停止、撤连接、关掉项目的 AI 读取许可后，在途的读取不返回内容、发现不写库、建议不写表 | 假适配在等待中收窄范围、关掉许可，各断言 `sessions.scope_changed`、响应里没有原文、索引行数不变；取消后来源进度不更新；连接失效时云端来源不返回内容 |
| S-117 | 外部会话的标题、原文、工具输出都是不可信数据：给模型时走 S-13 的 JSON 围栏，给 Agent 的输出带 `trust: "untrusted"` 并脱敏，不进系统提示和工具定义 | 标题里写伪造的结束标记和角色，留在 JSON 字符串里；原文里的密钥样式在 `agent` 受众下被脱敏；模型回了列表外的项目编号，这一项被丢弃 |
| S-118 | 读取范围、项目的 AI 读取许可与归属只有本人能定：Agent、MCP、工作流、插件调 `sessions.scope.set@1`、`sessions.project_ai_read.set@1`、`sessions.attribution.set@1` 被拒；`actor_id`、`project_id` 等身份字段在输入里不认。项目 AI 的读取要许可开着，且只到归属当前项目的会话；待归类与 `view: "all"` 只有本人；归属（含 Runtime 绑定依据）不授予读取或控制权 | 四种受众逐个被拒且决定表没写；许可默认关时 `agent`、`workflow`、`plugin`、`mcp` 读列表和原文都报 `sessions.project_ai_read_off`；许可开着时读别的项目的会话报 `sessions.not_found`，用 `unfiled`、`all` 报 `actions.forbidden`；MCP 客户端有许可、没有 S-08 授权时被拒；未允许的来源里，归了项目或有 Runtime 绑定的会话照样读不到 |
| S-119 | 认仓库只读文件，不跑 git：只读 `.git` 与 `commondir`，各不超过 4 KB，内容只留哈希，不读 `config` 与 hooks；到用户主目录或根目录停止往上找 | `PATH` 上放假 `git` 并记录调用，发现、归属、范围判断之后调用次数为 0；`.git` 文件的 `gitdir:` 指向不相干的目录、超长、含 NUL 时 `repository_key` 为空且不报错；仓库 `config` 里写 `core.fsmonitor` 也不执行；除这两样之外的文件读取次数为 0 |

SRB-11 的「读取不推导控制」等第 59 批加控制动作时补进新行。

### 9.5 调用次数（开工前检查第 9 项）

| 用户操作 | 请求数 | 动作发现／授权 | 开库 | 外部调用 |
| --- | --- | --- | --- | --- |
| 打开列表 | 1 | 1 遍（动作网关照常） | 服务长开，0 | 0（过期时后台排一次，不在请求里） |
| 翻下一页 | 1 | 1 | 0 | 0 |
| 打开一个会话 | 1 | 1 | 0 | 1 次读取 |
| 往上读 | 1 | 1 | 0 | 1 次读取，同文件走短缓存 |
| 会话内搜索 | 1 | 1 | 0 | 1 次流式扫描 |
| 改读取范围 | 1 | 1 | 0 | 放宽的来源每家 1 轮发现 |
| 打开待归类 | 2（列表 + 建议，后者不挡页面） | 各 1 | 0 | 模型 1 次，最多 20 组；往下翻再 1 次；材料没变走缓存 |
| 改项目的 AI 读取许可 | 1 | 1 | 0 | 0 |
| 在这个工具里搜 | 1 | 1 | 0 | 1 次命令 |
| 确认一张卡 | 1 | 1 | 0 | 0 |
| 发现一轮 | 0 | 0（后台不走动作发现） | 0 | 每来源分页，一批写一个事务；全局并发 2，同来源 1 |

- 列表里 `listWorkspaceDirectory()`、`listConfirmed()` 各读一次，N 条行不逐条查项目。来源状态一个查询。
- 认仓库一个目录一次，只在发现时做，不在列表请求里做。
- 后台发现不走动作目录，不按条目请求，避开 N48 那类空转。
- 没有定时器：第 34 批的发现只由三件事触发，即范围变化、用户点重试、打开列表时过期。持续跟进是采集层的事。
- 第 34 批按 N56 的「调用预算」用例记基线（用例在，就加这几个代表请求）。
- **进度到页面（D5）。** 没有推送通道，页面重发 `sessions.list@1`。只在 `sources` 里有 `reading` 且页面可见时问；间隔从 2 秒起逐步拉长，最长 15 秒；页面隐藏即停，失败退避，都读完即停。这几条照 N54 写，组件要有测试。其余时候页面不问。

## 10. 切片

### 10.1 合同 PR

规则 1：合同单独开小 PR，同一份快照同一时间一个在途。三片按顺序叠，都归 C1 队列。

| 片 | 内容 | 动的快照 | 动的其他文件 | 等什么 |
| --- | --- | --- | --- | --- |
| **C-1 登记表与派生**（BL-955） | `platform/external-tools`；第 4.3、4.4 节；`tests/action-external-tools.test.ts` | 新增 `tooling/gates/api/contracts/platform/external-tools.txt`；改 `platform/app-host.txt`、`modules/characters.txt`；`index.txt` 随之 | `plugin-terminal-runtimes.ts` 等第 4.4 节七处。不动动作，不跑 `actions:update` | 第 02 批交完、C 轨交接 |
| **C-2 读取合同** | `services/sessions`：身份、来源状态、列表、历史、读取范围、项目 AI 读取许可、权限、错误码常量 | 新增 `tooling/gates/api/contracts/services/sessions.txt`；`index.txt` | `packages/contracts/package.json` 的导出 | C-1 |
| **C-3 归属与搜索合同** | 归属类型、`attribution.*`、`search.entries`、`tool.search`；`private-work-context` 的绑定批量读取 | 改 `services/sessions.txt`、`modules/private-work-context.txt` | 无 | C-2 |

C-2、C-3 只有定义，宿主还没登记，所以不动 `tooling/gates/actions/`。`host-actions.tsv` 在服务片随登记一起改，跑 `pnpm build` 后 `pnpm actions:update`。

C-1 和 #1762 没有文件冲突：核过 `git diff --name-only`，#1762 不碰 `character-import.ts`、`installation-detection.ts`、`plugin-terminal-runtimes.ts`，也不碰这几份快照。但它改 `services/*`，所以还是排在它后面。

每片的 PR 写：消费者清单、对调用方的影响（C-1 是「成员不变」）、「防腐与代码质量」六行。

### 10.2 服务与消费（第 34 批，不在本批）

| 片 | 内容 |
| --- | --- |
| S-1 | 包、库、表、动作登记、S-114～119 的测试、一个假工具适配 |
| S-2 | A 组适配，逐家在实装版本上复核，改登记表的 `checked` 和实际接入方式 |
| S-3 | 归属与建议 |
| S-4 | 搜索来源 |
| S-5 | 工作台界面（入口随第 03 批；「外部会话原文」先由 D 轨补标本） |
| S-6 | B 组适配；D 组保持缺口 |

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
| SRB-14 | 第 8.1、8.2 节，含子目录、worktree、同仓库两项目的反例；S-119 | 34 |
| SRB-15 | 第 8.4 节 | 34 |
| SRB-16 | 第 8.5 节、第 7.4 节、S-118 | 34 |
| SRB-17 | 登记停止方式；`activity` 三态是它的前提 | 59 |
| SRB-18 | 不涉及 | 59 |

## 12. 和现状对不上的地方

2026-11-06 用户定了八项之后的状态。「已改」指这次一起改了需求或批次文件。

| # | 哪里 | 对不上什么 | 状态 |
| --- | --- | --- | --- |
| 1 | BL-955、[核查 §3](source-contract-checks-2026-11.md#3-一处工具名单bl-955) | 说三份名单，实际十一处：`RUNTIME_DISPLAY_NAMES` 是第四份，另有七处手写，其中一处在浏览器代码 | 第 4.4 节全收；批次文件已改；BL-955 行和核查没改 |
| 2 | 需求 §7 第 9 项 | 「进度经已有的事件推送」没有这样的通道 | 已改（D5） |
| 3 | 需求 §7 第 6 项 | 「库结构进升级链」与现行「只留基线、版本不符就拒绝」不符 | 已改 |
| 4 | 需求 §7 第 6 项与 §1.3 末段 | 单条归属两种说法，且 `modules/private-work-context` 已有绑定 | D1 定了；§1.3 末段那句「新归属应经同一项目主人和公开合同接入」没改，读法是目录关系经 Projects 公开合同 |
| 5 | 需求 §1.3 | 写「目录／仓库」，项目数据里只有路径 | 已改（D2），仓库现算 |
| 6 | 需求 §1.3 与现役代码 | 现役 MCP 流程把目录成员只算建议，新归属是唯一就自动归入，两条路对同一会话结果会不同 | 不动现役流程，新归属不走旧段 |
| 7 | 需求 §4 | 写「账号、凭据、授权归原服务」，和 D6 的读取范围归 Sessions 不完全一致 | 这次没列在要改的句子里，**没改**，交主会话定 |
| 8 | 盘点 §2 | A 组写「带机器读输出」，但逐家表里 Grok、Kiro、MiniMax 的机器读出口是「未查到」或有问题；MiniMax 的列表只在 TUI | 矩阵按逐家事实写 |
| 9 | 盘点 §3 | Windsurf 已改名 Devin Desktop；Cascade 停用日期是第三方转述 | 加 `devin-desktop`，`windsurf-cascade` 保留 |
| 10 | 盘点 §3 | 漏了 `copilot-ide`、`junie-ide`、`qoder-ide`、`qoder-cn-ide`、`codebuddy-cn`、`codebuddy-ide`、`minimax-agent`；Codex 的 IDE、桌面、云端入口也没单列 | 全部补行，写待核 |
| 11 | 盘点 §4、§5 | 待核项已查到：Amp 的 `threads` 命令、Qoder CN、Pi、`gh agent-task`；Codex 有 `thread/*` 协议和 `codex queue`，Claude Agent SDK 有列表与读取函数 | 矩阵已更新；盘点是 11-03 的记录，不改 |
| 12 | `character-import-discovery.ts` | Cursor 和 Grok 的命令名表都含 `agent`，本机 `agent` 实际指向 grok，Cursor 候选可能认错。现存小缺陷，不是本批引入 | 建议记一条 BL，C-1 的 `detect` 顺带修掉 |
| 13 | 核查 §3.2 | 说 `isTerminalSessionId` 不动；服务包要同一规则 | 第 4.3 节只搬定义，行为不动 |
| 14 | 本机 | `claude --help` 被本机的包装命令盖住 | `claude-code` 一行只写官 |
| 15 | [定样](../../docs/design/sessions-sources/README.md) | D2、D4、D8 让用户看过的样多了三处：Sheet 写明含 worktree，读取范围里多一个项目许可开关，待归类写明发给模型的内容 | 改归属 Dialog 也要加第 8.2 节那一句。这几处要进定样再做产品代码，主会话定走不走一次看样 |
| 16 | [核查 §1](source-contract-checks-2026-11.md#1-第-20-批要的历史读取能力)、第 20 批 | 就绪只看读取范围；D4 之后还要看项目许可 | 第 6.5 节写清，由主会话转交，`specs/scene-and-page-contract/spec.md` 和核查没改 |
| 17 | 需求 SRB-09、第 35 批 | 冷启动由 AI 读历史整理，而项目许可默认关，Onboarding 要有一步让本人打开 | 第 35 批开工时处理，本稿不写 |
| 18 | 需求 SRB-16 | 写「自动归入不扩大读取权限」。D4 定了项目 AI 读到「含自动归入」的会话，所以许可开着时，项目新连一个目录，AI 能读的会话会变多。授权来自许可，归属只定范围，本稿这样写，但这一点要让用户知道 | 交主会话 |
| 19 | 团队批 | 「团队项目先不开放」现在无从判断，项目没有这个标记 | 团队批接入时，`sessions.project_ai_read.set@1` 对共享项目拒绝并加测试 |
| 20 | 路线书决策表第 11 项 | 记着 Sessions 技术方案待定 | 这次没列，**没改**，由主会话更新 |
| 21 | 需求 §2「开放工具同走公共接入合同」 | 登记表在合同里、适配在服务包里，第三方插件现在贡献不了来源适配 | 本批不做；要开放成扩展点在第 59 批之后另议 |

## 13. 已定

用户 2026-11-06 定，理由与否掉的方案在[需求 §8](spec.md#8-决策记录)。

| 项 | 决定 | 落在 |
| --- | --- | --- |
| D1 | Sessions 自己存单条决定；已有 Runtime 确认绑定只读进来作归属依据，不回写，不带任何读取权 | 第 8.1、8.2 节 |
| D2 | 子目录和 git worktree 都算；同一仓库连两个项目算不唯一；只读 `.git` 与 `commondir`，绝不跑 git；`linked_projects` 含 worktree；已删、认不出的走 AI 建议 | 第 7.1、8.2 节，S-119 |
| D3 | 跨会话只搜标题、目录、工具名；内容进单个会话搜；工具自带搜索的加「在这个工具里搜」；全文索引不做 | 第 6.4 节，SRB-02 |
| D4 | 读取权与归属分开：每个项目一个 AI 读取许可，默认关，只有本人能改；`agent`、`workflow`、`plugin` 要它，且只到当前项目已归属的会话；MCP 另需 S-08；待归类和全部只有本人；团队项目先不开放 | 第 6.5、7.4 节，S-118 |
| D5 | 页面只在有来源在读且可见时询问，逐步拉长；隐藏即停、失败退避、读完即停 | 第 9.5 节 |
| D6 | 读取范围归 Sessions，云端只存 `connection_id`，读取时另核连接有效 | 第 7.1、7.3 节 |
| D7 | 时间窗不做，没有字段，记为能力缺口 | 第 7.1 节 |
| D8 | 打开待归类才跑，同目录一起问，一次最多 20 组，往下翻再要；卡片先显示，建议随后到；界面写明发给模型的内容 | 第 8.4 节 |

## 14. 来源

本稿新增的核对（其余见[盘点](source-inventory-2026-11.md#来源)）：

官方：[Codex app-server](https://learn.chatgpt.com/docs/app-server)、[Claude Agent SDK TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)、[Qoder CN 会话](https://docs.qoder.cn/en/cli/sessions)、[Amp 线程](https://ampcode.com/docs/threads)、[Copilot 编码 Agent 的命令行](https://github.blog/changelog/2025-09-25-kick-off-and-track-copilot-coding-agent-sessions-from-the-github-cli)、[Windsurf 改名公告](https://devin.ai/blog/windsurf-is-now-devin-desktop)、[Cursor 输出格式](https://cursor.com/docs/cli/reference/output-format)、[Cursor 论坛：`ls` 不支持无头](https://forum.cursor.com/t/cli-headless-doesnt-work-with-ls-no-way-to-get-a-list-of-chat-ids/151821)。

第三方（没核对）：[Copilot 会话目录](https://docs.entire.io/integrations/copilot-cli)、[Cursor 云端 Agent 路由](https://docs.litellm.ai/docs/pass_through/cursor.md)、[Cascade 停用日期](https://businesstechnavigator.com/news/windsurf-devin-desktop-cascade-eol-2026)、[Amp 导出字段](https://docs.rs/txcript/0.4.2/txcript/harness/amp/index.html)。

本机 `--help`（只看帮助，没读任何会话）：Codex 0.166.0、Grok Build 1.0.70、Pi 1.5.0。
