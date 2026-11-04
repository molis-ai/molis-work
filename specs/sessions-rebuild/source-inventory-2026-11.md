# Sessions 来源盘点（2026-11-03）

状态：只读盘点（路线书第 05 批列明可并行的「22 来源盘点」），供第 22 批「Sessions 来源与历史合同」使用；不写代码，不碰真实会话。覆盖面以[需求](spec.md) §2 的表为准，本文逐项写下各家官方给出的会话入口，以及仓库现在已有什么。

**可信度怎么标。** 「官方」指该产品自己的文档或帮助页；「第三方」指博客、社区工具、问题单里的说法，没有核对过；「未查到」指公开资料里没找到，不等于没有。命令与路径都会随版本变化，第 22 批定合同前要在实际安装的版本上复核（需求 §3）。

## 0. 给人讲清楚

我把需求里列的二十多家 AI 开发工具都查了一遍，看每家把会话存在哪里、有没有正式命令列出和恢复会话、能不能让别的程序读。结论是三类：

- 大约一半是命令行工具，有正式的列出、恢复命令，很多还能输出机器读的格式。这些可以先接；
- 几家的会话在云端，要走它们自己的账号接口；
- 剩下的主要是 IDE 插件和桌面应用，没有正式的读取方式，会话藏在私有的本地文件里，有的还加了密。这些先记为缺口，不去破解它们的文件。

仓库里现在没有任何读外部会话的代码，旧 Sessions 已经下线。能直接用上的有一样：工作终端能按会话 ID 恢复 5 家工具的会话。另外，仓库里有三份各自维护的工具名单，接入前要先合成一份。

## 1. 仓库现在有什么

| 已有 | 在哪里 | 和 Sessions 的关系 |
| --- | --- | --- |
| 工作终端按会话 ID 恢复 | `apps/local-host/src/plugin-terminal-runtimes.ts`（`TERMINAL_RUNTIMES` 与每家的 `resumeArgs`）；`goals.terminal.open@2` 的 `resume_session_id` | 「直接控制」里的恢复已有一条真实路径：Codex `resume <id>`、Claude Code `--resume <id>`、OpenCode / Pi `--session <id>`、Grok Build `--resume <id>`。会话 ID 要用户自己填，没有发现与列表 |
| 运行时安装检测与 MCP 接入 | `packages/contracts/src/platform/installation-detection.ts`（`SUPPORTED_RUNTIME_IDS`）、`apps/local-host/src/installer/runtime-config-adapters.ts` | 知道本机装了哪几家、配置文件在哪；不读会话 |
| Runtime 与工作情境的关联 | `modules/private-work-context`（`runtime_context_bindings`：`runtime_id` + `stable_work_context_id`） | 关联的是目录 / 工作情境，不是会话；可以做「明确且唯一的目录关系」归属的一个来源（需求 §1.3），但要由项目主人的公开合同读 |
| 角色导入扫描 | `apps/local-host/src/character-import-runtimes.ts`（`CHARACTER_IMPORT_RUNTIMES`） | 读各家的规则文件与 Skills，不读会话；已经有「只读允许的根目录」这一套做法，发现会话时可以照用 |
| 读外部会话的代码 | 无 | SC-4 下线后没有；旧库按 SC-5 不读 |

**要先处理的一处：三份工具名单。** `SUPPORTED_RUNTIME_IDS`（contracts，5 家）、`TERMINAL_RUNTIMES`（宿主，同样 5 家，另写一份）、`CHARACTER_IMPORT_RUNTIMES`（contracts，5 家，多 Cursor，少 Pi）。需求 §4 要求「不在首页、每个插件或宿主路由分别维护厂商名单」。第 22 批的来源合同应当是唯一的登记处：每家一条适配声明，写清能力和缺口，这三份由它派生。名单合并改的是合同，归 C1，排在合同队列里。

## 2. 按接入方式分组

| 组 | 含义 | 成员 |
| --- | --- | --- |
| A. 有正式的列出 + 恢复命令，带机器读输出 | 发现、读取、恢复都能走正式命令，不碰私有文件 | Claude Code、Codex、Qwen Code、Qoder、Droid、Grok Build、Kiro CLI、MiniMax Code、OpenCode |
| B. 有正式的恢复命令，列出或读取靠本地文件 | 恢复能走正式命令；发现与历史要读本地记录，格式官方说是内部格式、会变 | Gemini CLI、Kimi Code、Cursor Agent CLI、Copilot CLI、CodeBuddy、Junie CLI |
| C. 会话在云端 | 走产品自己的账号接口或网页，要服务连接授权 | Amp（线程在服务端，有跨端访问）、Devin（企业 API 有会话消息接口）、Claude Code 网页版、Codex 云端任务、Copilot 编码 Agent |
| D. IDE / 桌面，没有正式读取方式 | 只有私有本地存储，有的加密；记为缺口，只提供「回到原工具」与导出入口 | Cursor 编辑器、Windsurf / Cascade、Antigravity、通义灵码、TRAE / SOLO、ZCode、文心快码 Comate / Zulu、CodeArts 代码智能体（CLI 有，会话命令未查到）、Kiro IDE |

A、B 组的差别决定实现顺序：A 组可以先做出「获准后自动发现 + 读历史 + 恢复」的完整一条；B 组的读取依赖内部格式，要按版本钉住解析，并在版本变了时如实报「读不了」，不是「没有会话」（需求 §1.2、SRB-13）。

## 3. 逐家

| 产品 / 入口 | 会话存在哪里 | 列出 / 搜索 | 恢复 / 继续 | 机器读出口 | 可信度 |
| --- | --- | --- | --- | --- | --- |
| Claude Code CLI | `~/.claude/projects/<目录换算>/<session-id>.jsonl`；格式官方说是内部格式、会变；默认保留 30 天 | `claude --resume` 选择器（可扩到全部项目）；`claude agents --json` 列运行中的 | `--continue`、`--resume <id|名字|路径>`、`--fork-session`；`-p --resume <id>` 非交互追问 | `-p --output-format json / stream-json`；hooks 收到 `transcript_path`；Agent SDK | 官方 |
| Claude Code 桌面 / 网页 / VS Code | 各自有会话列表；桌面能恢复 CLI 会话 | 各自界面 | 各自界面 | 未查到对外接口 | 官方 |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`（可能压缩），旁边有 SQLite 索引 | `codex resume` 选择器、`--all` | `codex resume <id>/--last`、`codex fork`、`codex exec resume` | `codex exec --json`；`codex app-server`（stdio / ws） | 命令官方；路径第三方 |
| Gemini CLI | `~/.gemini/tmp/<项目哈希>/chats/` | `gemini --list-sessions` | `gemini --resume [序号|UUID]`，TUI `/resume` | 未查到 | 官方 |
| Antigravity | `~/.gemini/antigravity/` 下的 protobuf 或 JSONL 记录 | TUI `/resume` | `/resume`、`/fork` | 未查到官方导出 | 第三方 |
| Copilot CLI | 未查到官方路径 | `copilot --resume` 选择器 | `--continue`、`--resume <id>` | 未查到；Copilot SDK 有会话持久化 | 官方（命令） |
| Cursor Agent CLI | 未查到 | `agent ls`（默认全部工作区） | `agent resume`、`--continue`、`--resume=<chat-id>` | 未查到 | 官方 |
| Cursor 编辑器 | 私有本地库 | 编辑器内 | 编辑器内 | 无 | 第三方 |
| Kiro CLI / IDE | `~/.kiro/sessions/`（按工作区哈希） | `--list-sessions`、`--resume-picker`、新版 `/sessions` | `--resume`、`--resume-id <id>` | 无头模式下拿不到会话 ID（问题单） | 命令官方；路径第三方 |
| Windsurf / Cascade | `~/.codeium/windsurf/cascade/` 的加密 `.pb` 或 `state.vscdb` | 编辑器内 | 编辑器内 | 无导出（有功能请求） | 第三方 |
| Devin | 云端 | 企业 API | 网页 | 企业 API 有会话消息接口，要服务账号权限 | 官方（接口文档） |
| Grok Build | `~/.grok/`（或 `GROK_HOME`） | `grok sessions list / search` | `-c`、`--resume <id|标题>`、`--fork-session` | 未查到 | 第三方 |
| Junie CLI | 每个会话一个 `transcript.md` + `events.jsonl`，根目录未写 | TUI `/history` | `/history` 里恢复；没有命令行参数 | 未查到 | 官方 |
| Droid | 未查到 | `/sessions`、`droid search --json` | `droid resume <id>/--last`、`--fork`、`droid exec -s <id>` | `-o json / stream-json / stream-jsonrpc` | 官方 |
| Amp | 服务端线程（官方说「各端同一线程」） | 网页 / CLI | 跨端访问可从网页继续 CLI 线程 | 有流式 JSON（页面未展开） | 官方 |
| Qwen Code | 未查到 | `qwen sessions list --json`、`qwen sessions ps --json` | TUI `/resume`、`/continue` | `/export html|md|json|jsonl`；`qwen --acp`；`@qwen-code/sdk/peer` | 官方 |
| 通义灵码 | `~/.lingma/cache/projects/<id>/conversation-history/<session>/`，SQLite 索引 | IDE 内 | IDE 内 | 不支持导入导出（社区请求） | 第三方 |
| Qoder（国际） | 未查到 | `--list-sessions` | `-c`、`-r <id>`、`--session-id`、`--fork-session` | `-p -o json`；`--acp` | 官方 |
| Qoder CN | 文档另有一页 sessions | 未逐条核对 | 未逐条核对 | 未逐条核对 | 待核 |
| CodeBuddy Code | 日志在 `~/.codebuddy/logs/` | 未查到列表命令 | `-c`、`-r <id>`（交互模式下选择） | `-p` 经 SDK | 官方 |
| TRAE / SOLO | SOLO 每个对话是 Application Support 下的一个 git 仓库 | 应用内 | 应用内 | 无官方导出 | 第三方 |
| Kimi Code | `~/.kimi-code/sessions/`（按目录分），`state.json` + `wire.jsonl` | `kimi --session` 选择器、TUI `/sessions` | `--continue`、`--session <id>` | `kimi export <id>`、`import-sessions`；`kimi acp`；Server API | 官方 |
| ZCode | `~/.zcode/cli/` 的 SQLite，`~/.zcode/v2/tasks-index.sqlite` | 应用内 | 应用内（有「历史重构」） | 未查到 | 第三方 |
| MiniMax Code | `~/.minimax`（旧版 `~/.minimax-code`） | TUI `/sessions`（搜索、恢复、分叉、归档） | `mcode --continue`、`--session <id>` | 未查到 | 官方 |
| 文心快码 Comate / Zulu | 未查到 | IDE 内 | IDE 内 | 未查到 | 未查到 |
| CodeArts 代码智能体 | 未查到 | 未查到 | 有 `codearts run`，会话命令未查到 | 未查到 | 官方（CLI 存在） |
| OpenCode | `~/.local/share/opencode/`（新版 SQLite `opencode.db`，旧版 JSON） | `opencode session list` | `opencode run --session <id>`（仓库里已用 `--session`） | `opencode export <id>`（`--sanitize`） | 命令第三方 |
| Pi Agent | 未查（仓库里已用 `--session <id>` 恢复） | 未查 | `--session <id>` | 未查 | 待核 |

## 4. 给第 22 批合同的输入

1. **一条来源一份适配声明，能力逐项写。** 每个产品入口声明自己支持的：发现、列出、读历史、搜索、恢复、发送、停止、导出，和每项的接入方式（正式命令、协议、服务接口、本地记录）。不支持的写成缺口，界面按它显示「回到原工具」或导出入口。上面三份名单从这里派生。
2. **身份。** 会话身份 = 产品入口 + 账号或本机 Home 位置 + 原生会话 ID。不同账号、不同地区版本里同名的会话不合并（需求 §1.2）；同一会话分叉出的新 ID 是新会话，带上来源关系。
3. **读取不靠解析私有格式也能先做一半。** A 组用正式命令（`--json` 一类）拿列表和历史；B 组读本地记录时，按工具版本钉住解析器，版本对不上就报「这一版读不了」，不报空。D 组不解析加密或私有库（需求 §3：不靠改写另一工具的私有库）。
4. **发现的范围由用户授权的目录决定。** 和角色导入一样，只读允许的根目录；Claude Code、Codex、Kiro、Kimi 都按工作目录分会话，可以直接用作「明确的目录关系」的依据（需求 §1.3）。
5. **恢复与控制已有起点。** 工作终端的 `resumeArgs` 已经覆盖 5 家；第 22 批把它挂到来源声明上，让发现到的会话能一键在终端里恢复，不用再手填 ID。发送消息走非交互入口（如 `claude -p --resume`、`codex exec resume`、`droid exec -s`），要按需求 §1.4 处理「原会话还在运行」。
6. **持续跟进接采集层。** 列表与历史的增量读取交给[观测和采集层](../observation-collection/spec.md)，Sessions 不另建一套轮询。

## 5. 没查到、要在实装版本上复核的

Copilot CLI 的存储位置；Cursor Agent CLI 的存储与 JSON 输出；Qoder CN 与国际版是否共用会话；CodeBuddy 的列表命令；文心快码、CodeArts 的会话入口；Pi Agent 的列表；Amp 的线程列表命令与流式 JSON；Codex 云端任务、Copilot 编码 Agent、Claude Code 网页版的对外接口。

## 来源

官方：[Claude Code 会话](https://code.claude.com/docs/en/sessions)、[Codex CLI 参考](https://learn.chatgpt.com/docs/cli/reference)、[Gemini CLI 会话](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/session-management.md)、[Cursor CLI 斜杠命令](https://cursor.com/docs/cli/reference/slash-commands)、[Cursor CLI](https://cursor.com/docs/cli)、[Copilot CLI 会话](https://awesome-copilot.github.com/learning-hub/cli-for-beginners/02-context-and-conversations/)、[Kiro 会话管理](https://kiro.dev/docs/cli/chat/session-management/)、[Junie CLI](https://junie.jetbrains.com/docs/junie-cli.html)、[Droid CLI](https://github.com/Factory-AI/factory/blob/main/docs/reference/cli-reference.mdx)、[Amp 跨端访问](https://ampcode.com/docs/cli/remote-control)、[Devin 会话消息 API](https://docs.devin.ai/es/api-reference/v3/sessions/get-enterprise-session-messages.md)、[Qwen Code 命令](https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/)、[Qoder CLI](https://docs.qoder.com/cli/cli-reference)、[Qoder 会话（中文）](https://docs.qoder.com/zh/cli/sessions)、[CodeBuddy CLI 参考](https://www.workbuddy.ai/docs/cli/cli-reference)、[Kimi Code 会话](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/sessions.html)、[MiniMax Code 快速开始](https://agent.minimax.io/docs/cli/quick-start)、[CodeArts Agent CLI](https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0034.md)。

第三方：[Codex 会话管理](https://codex.danielvaughan.com/2026/04/13/codex-cli-session-management-resume-fork-transcripts)、[kiro-cli-history](https://pypi.org/project/kiro-cli-history/)、[Kiro 问题单](https://github.com/kirodotdev/Kiro/issues/9066)、[Grok Build 会话指南](https://www.codeagentswarm.com/en/guides/grok-build-conversation-history)、[Grok Build 0.2.112](https://techdevnotes.com/releases/grok-build/0.2.112)、[antigravity-history](https://pypi.org/project/antigravity-history/)、[Antigravity CLI 教程](https://dev.to/iromin/antigravity-cli-tutorial-series-part-2-conversations-conversations-and-conversations-j39)、[Windsurf 导出请求](https://feedback.windsurf.com/feature-requests/p/export-chat)、[cctop Windsurf 读取](https://docs.rs/crate/cctop/latest/source/src/session/windsurf.rs)、[灵码导入导出请求](https://developer.aliyun.com/ask/703811)、[TRAE SOLO 适配 PR](https://github.com/jackwener/OpenCLI/pull/1801)、[ZCode 存储](https://www.llmnesia.com/blog/where-does-zcode-store-session-history)、[OpenCode 会话](https://opencode.school/lessons/sessions)、[OpenCode 存储说明](https://github.com/drmikecrowe/harnessed/wiki/home-folder-opencode-requirements)、[Cursor 论坛：resume 选择器](https://forum.cursor.com/t/cli-resume-picker-default-to-this-workspace-configurable/167113)。
