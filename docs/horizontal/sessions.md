# Sessions

**白话：** 在本人打开的读取范围内，把这台电脑上以及已连接账号里的外部 AI 开发工具会话找出来，按来源实时只读对话历史、帮你把会话归到对应项目、在个人搜索里找得到，也能在个人助理当前这一轮显式拿来当参考；不导入对话全文，不往外部工具发消息，也不托管或恢复外部进程。

**提供：** 外部会话索引、目录关系缓存、来源进度、读取范围与项目 AI 读取开关、本人归属决定与模型归属建议；系统动作（提供方 `system.sessions`）`sessions.list@1`、`sessions.history.read@1`、`sessions.scope.read@1`、`sessions.scope.set@1`、`sessions.project_ai_read.set@1`、`sessions.discovery.run@1`、`sessions.attribution.set@1`、`sessions.attribution.suggest@1`、`sessions.tool.search@1`、`sessions.connector.usages@1`，以及系统搜索来源 `sessions.search.entries@1` 与助理单轮读取 `sessions.subject.read@1`。需求与合同见 [sessions-rebuild/spec.md](../../specs/sessions-rebuild/spec.md) 与 [contract-design.md](../../specs/sessions-rebuild/contract-design.md)。

**不拥有：** 外部会话的对话全文、执行状态与原工具配置（始终归原外部工具）；项目的身份与文件夹设置（归 `modules/projects`）；远端或 CLI 连接与账号凭据（归 `horizontal/connector-host`）；终端进程与回放（归 `horizontal/runtime-host`）。`<Home>/external-sessions/external-sessions.db` 只存索引、目录缓存、读取范围、项目 AI 读取开关、归属决定与归属建议；**不存对话全文**。标题可以取自工具标题或首条用户消息的短摘要，AI 建议会缓存模型给出的短引文（`evidence`）；这两类短摘要不是转录副本。

## 来源与只读边界

1. **工具登记表是唯一事实表。** `packages/contracts/src/platform/external-tools.ts` 的 `EXTERNAL_TOOLS` 逐入口登记会话存储、读取方式与适配器状态；`horizontal/sessions` 在运行时如实报告 `not_allowed`、`reading`、`complete`、`needs_login`、`version_unreadable`、`failed`、`unsupported` 七种来源状态，并在有原因时区分 `login_expired`/`connection_removed`/`account_changed`、`version_mismatch`/`parse_error`、`tool_missing`/`timed_out`/`read_error`、`adapter_pending`/`tool_gap`。没有适配器的入口不会被伪装成「暂无会话」。
2. **十个首期适配器，读取能力按合同如实区分。**
   - **Codex**：`codex app-server` stdio JSON-RPC 只读 `thread/list` + `thread/read`（含子代理 `forked_from`）；不使用本地 JSONL 回退。
   - **Claude Code**：`~/.claude/projects/*/*.jsonl`，跳过 `subagents/`、`isSidechain: true` 与空壳快照。
   - **Gemini CLI**：`~/.gemini/tmp/**/*.json`，过滤 `logs.json`/`settings.json`/`projects.json`，省略 `thoughts`，附件标 `[附件未读取]`。
   - **Pi Agent**：`~/.pi/agent/sessions/**/*.jsonl`，通用 JSONL 解析。
   - **GitHub Copilot Coding Agent**：云端 `gh agent-task list --json ...` / `view --log`；走 `cli` 连接，前后核对账号指纹；私有仓库需要 `repo` 权限，权限不足/账号切换按 `login_expired`/`account_changed` 处理。
   - **Droid**：`droid search --json` 只读发现和工具内搜索；不读取本地 `~/.factory` 文件，也不提供历史正文读取。
   - **Qwen Code**：`qwen sessions list --json` 只读发现；历史读取仍按合同列为缺口，不解析本地 `~/.qwen`。
   - **Qoder CLI（国内）**：`~/.qoder-cn/projects/**/*.jsonl`；国际版 `qoder` 不是本适配器。
   - **Kimi Code**：`~/.kimi-code/sessions/<workdir-hash>/<session-id>/`；支持 `state.json` + `wire.jsonl`、`context.jsonl` + `metadata.json` 两种布局；`wire.jsonl`/`state.json` 需要按会话目录配对，不把单个消息文件当独立会话。
   - **MiniMax Code**：`~/.minimax/**/*.jsonl`；跳过凭据/配置类 JSONL。
   其余 40 个登记入口按 2 个手动导出（`grok-build`、`amp`）和 38 个缺口（`tool_gap` vs `adapter_pending`）显示；合计 50 条。
3. **三条硬红线。**
   - 文件读取只在工具声明的会话根目录下打开已核实的常规文件；`..`、绝对路径和**指向根外**的符号链接在打开前拒绝，根内符号链接解析后仍须落在根内；FIFO／套接字／设备文件拒绝（`S-sessions-read-roots`）。
   - 子进程只调固定白名单可执行文件与只读子命令参数，剥离 `NODE_OPTIONS`、`DYLD_*`、`LD_*`、`GIT_*` 等注入环境变量，不经 shell，不拼用户输入进命令；关闭交互 stdin，并有时限/输出上限（`S-sessions-read-only-commands`）。
   - Git worktree 与主仓库关系只读 `.git`、`commondir`、`gitdir` 三个纯文本文件并做双向指针核对，绝不执行 `git` 子进程（`S-sessions-git-files-only`）。

## 九档归属与模型建议

1. **九档优先级（由高到低）：** 本人已归入现存项目（`confirmed`，若会话后来搬去别的项目目录另附只读提示 `later_suggestion`）→ 本人留作待归类（`left_unfiled`）→ 本人归入的项目已删除（`project_gone`，保留决定供重新归属）→ 文件夹或经双向核对的 Git worktree 唯一命中一个项目（`automatic`；工具自报了别的项目时附 `tool_reported_other`）→ 命中多个项目（`ambiguous`）→ 工具上报的项目仍存在（`reported`）→ 仅命中另一台设备的来源链接（`tool_linked`）→ 工具上报的项目已不存在（`relation_gone`）→ 没有任何项目线索（`no_relation`）。`reported` 不属于「待归类」，它是工具上报绑定下的独立归属状态。
2. **模型归属建议（`sessions.attribution.suggest@1`）：** 只在本人在界面点击「帮我判断未归类的」时运行；按目录分组（单次至多 20 组，超出拒 `sessions.too_many_groups`），只读每组最近最多 3 条会话的脱敏标题、目录和开头摘录，送入 Prologue `hostTextGeneration` 的 `fencedMaterials` 非可信数据围栏。建议只缓存在 `session_suggestions`，绝不自动改写 `session_attributions`；卡片显示建议、理由和 evidence，并列出其他候选。
3. **归属不授读取。** 自动归入或人工归入只决定整理位置；项目的 AI 是否能读，另由 `session_project_ai_reads` 的独立开关决定（默认关）。

## 读取重查、搜索与个人助理单轮边界

1. **返回前逐条重查（`S-sessions-recheck-before-return`）：** `sessions.list@1`、`sessions.history.read@1`、`sessions.tool.search@1`、`sessions.search.entries@1`、`sessions.subject.read@1` 每次返回前都重新核对来源读取范围、目录白名单、连接器启用状态与调用方受众；关掉来源或缩窄目录后，已缓存的 `session_key` 立即拒 `sessions.not_allowed`／`sessions.not_found`（等待途中变化拒 `sessions.scope_changed`）。云端 `cli` 连接在读取原文/工具搜索前核对账号指纹；账号切换后不返回正文，来源报 `needs_login`/`account_changed`，列表可能仍显示已缓存的标题/目录直到下一次读取或刷新。
2. **非可信原文（`S-sessions-untrusted-text`）：** 正文统一按纯文本分段返回，不拼 HTML，二进制与图片只标 `[附件未读取]`，单条 64 KB、单页 256 KB、全文扫描 32 MB 有界截断。
3. **只有本人做决定、AI 只在当前轮显式引用（`S-sessions-person-decides`）：** 十个面向本人的动作只对非委托 `user` 开放；插件、工作流、MCP、项目内 Coding／角色 Agent、主动助理、记忆提炼、评测与 `knowledge.*` 一律拿不到外部会话正文。个人助理只在本人把外部会话作为当前查看对象或显式选区发起这一轮、且会话未归项目或所归项目已由本人打开 `session_project_ai_reads` 时，经 `sessions.subject.read@1` 读取有界标题/目录/工具名或使用本人明确选中的片段；选区正文进本轮不可信围栏，不进下一轮历史、落盘材料或记忆来源。
