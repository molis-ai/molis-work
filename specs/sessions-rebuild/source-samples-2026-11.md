# Sessions 历史来源样本与实测核查（2026-11-14）

状态：只读核查（路线书[第 33 批](../post-anticorruption-roadmap/reference/batches/33.md)列明可并行的「34 的历史来源样本核查」），供[第 34 批「Sessions 历史实现」](../post-anticorruption-roadmap/reference/batches/34.md)编写各来源适配片（S-1～S-4）时直接对照。只读公开文档与本机已装命令的 `--version`／`--help` 标志，**未读取任何真实用户会话、未启动任何 Home 或外部运行会话**。

## 0. 给人讲清楚

第 22 批已经把外部会话的公共合同定好（[合同设计](contract-design.md)），第 34 批要按全量来源清单把发现、读取、搜索和自动归属做出来。做之前最容易踩坑的是「文档写有这个命令，真正跑起来参数、输出格式或权限对不上」。本文把三件事核清：

1. 本机实装二进制（`gh 2.103.3`、`grok 1.0.77`）的 `--help` 实测标志与 [合同设计 §12](contract-design.md#12-和现状对不上的地方) 第 8、27、28、35、36 行的逐条对照；
2. 第一批要落适配器的 CLI／本地文件来源（Claude Code、Codex、Gemini CLI、Qwen Code、Qoder／Qoder CN、Droid、Amp、Kimi Code、OpenCode、Pi Agent、Copilot Coding Agent、Grok Build、MiniMax Code）的记录结构、字段边界与异常样本清单；
3. 第 34 批测试夹具必须覆盖的损坏、截断、版本升级与权限缺口样本，确保读不到时报 `unreadable_version`／`failed`／`auth_required`，绝不静默返回空列表冒充「没有历史」（SRB-13）。

## 1. 本机实装二进制标志核对（只读 `--version`／`--help`）

| 来源 `entry_id` | 本机实测版本 | 实测命令与标志 | 对第 34 批实现的直接结论 |
| --- | --- | --- | --- |
| `copilot-coding-agent`（经 `gh`） | `gh version 2.103.3 (2026-10-26)` | `gh agent-task list -L <n> --json completedAt,createdAt,id,name,pullRequestNumber,pullRequestState,pullRequestTitle,pullRequestUrl,repository,state,updatedAt,user`；单条详情 `gh agent-task view <session-id> [-R HOST/OWNER/REPO] --json ...`；日志 `gh agent-task view <session-id> --log` | 1. **列表有完整结构化 JSON**，`id` 为 UUID（如 `e2fa49d2-...`），不能用 PR 号作主键（同一 PR 可有多次任务，官方 `--help` 明写非交互场景不要用 PR 号）；<br>2. **正文只有 `--log` 纯文本日志**，没有按消息轮次切分的结构化 JSON，读取器应映射为有序步骤／日志段并标明来源，不伪造不存在的用户多轮气泡；<br>3. **权限范围（对应[合同设计 §12](contract-design.md#12-和现状对不上的地方) 第 28 行）**：`repository` 与 PR 元数据走 GitHub 仓库／PR 权限，现有 `CONNECTOR_CLIS.github` 的 `notifications,read:user` 对私有仓库不够，读私有库会话需 `repo`（或细粒度 Pull requests + Metadata 只读），权限不足时必报 `auth_required` 而非空列表。 |
| `grok-build` | `grok 1.0.77 (50ca579fa996)` | `grok sessions list [-n <LIMIT>]`、`grok sessions search`、`grok -c`、`grok --cwd <CWD>`、`grok --fork-session`；无 `--json` 标志；带 `--leader-socket <PATH>`（默认 `~/.grok/leader.sock`） | 1. **证实[合同设计 §12](contract-design.md#12-和现状对不上的地方) 第 8 行**：`grok sessions list` 在 `1.0.77` 上**没有 `--json` 机器读输出**，且依赖 `~/.grok/leader.sock` 守护套接字；<br>2. 只读发现不应悄悄拉起常驻守护进程改写 `~/.grok/leader.sock`；若按 `~/.grok/`（或 `GROK_HOME`）本地记录解析，须按版本号钉住并在表结构不符时报 `unreadable_version`。 |

## 2. 各来源记录样本结构与解析边界

供第 34 批编写各 `entry_id` 适配器与构造确定性测试样本（`tests/fixtures/session-sources/`）使用：

| 来源 `entry_id` | 发现与读取方式 | 单条样本关键字段与目录归属依据 | 必须防御的边界／异常样本 |
| --- | --- | --- | --- |
| `claude-code` | 本地 `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`（官方声明内部格式、默认保留 30 天）或 Claude Agent SDK 会话列表／读取接口 | 每行一条事件 JSON（`type: "user" \| "assistant" \| "summary" \| ...`、`sessionId`、`cwd`、`gitBranch`、`timestamp`、`message.content` 数组含 `text`／`tool_use`／`tool_result`）。`cwd` 为真实工作目录绝对路径（不要从 `<encoded-cwd>` 反推路径，因路径中的 `-` 与 `/` 编码不可逆！） | 1. 正在写入的末尾半行 JSON（截断行应保留前面已完整条目并标 `truncated_at`）；<br>2. 仅含 `file-history-snapshot` 或 `summary`、无对话消息的空壳文件；<br>3. 未知顶层 `type` 或新版 schema 版本 → 报 `unreadable_version`；<br>4. 子代理 sidechain（`isSidechain: true`）不混作独立顶层会话。 |
| `codex` | 本地 `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`（及归档压缩文件）或 `codex app-server` `thread/list`、`thread/read` | 首行 `session_meta`（含 `id`、`timestamp`、`cwd`、`originator`、`cli_version`、`git` 信息），后续为 `response_item`／`event_msg`（用户消息、模型输出、`function_call`、`function_call_output`）。`session_meta.cwd` 提供精确目录归属 | 1. 同一 `id` 分叉（`forked_from_id`）须作为独立会话保留来源关系（[盘点 §4](source-inventory-2026-11.md#4-给第-22-批合同的输入) 第 2 条）；<br>2. 缺少首行 `session_meta` 或损坏压缩流 → 单文件记读取错误，不中断同目录其余文件；<br>3. `codex-cloud` 独立登记（需先补 `CONNECTOR_CLIS` 连接定义，见 §12 第 27 行）。 |
| `gemini-cli` | `gemini --list-sessions` + 本地 `~/.gemini/tmp/<project-hash>/chats/session-*.json` | 会话 JSON 含 `sessionId`、`projectHash`、`startTime`、`lastUpdated`、`messages[]`（`type: "user" \| "gemini"`、`content`、`toolCalls`）。注意目录名只有 `<project-hash>`（工作目录 SHA-256），若无明文路径映射则不能硬猜目录，按「关系不明确」走待归类 | 1. 序号在 `--resume` 里会随新会话漂移，主键必须用 `sessionId`（UUID）；<br>2. 大型 `toolCalls` 结果（几十 KB 标准输出）分页截断，单页不整包载入内存。 |
| `qwen-code` | `qwen sessions list --json`；历史导出 `/export jsonl` 或本地会话记录 | 列表 JSON 含会话 ID、工作目录、更新时间与标题摘要 | CLI 未登录或非零退出码与「0 条会话」严格区分：非零退出码报来源 `failed`／`auth_required`。 |
| `qoder` / `qoder-cn` | `--list-sessions`；单次 `-p -o json` | 国际版（`qoder`）与国内版（`qoder-cn`）分列不同 `entry_id`，`location_key` 各自独立，同名工作区会话不合并 | 未装对应地区 CLI 时标 `not_installed`／未允许，绝不用另一地区版本的记录顶替。 |
| `droid` | `droid search --json`；恢复 `droid resume <id>` | JSON 数组含会话 ID、标题、工作目录与最后活动时间 | 搜索词前导 `-` 注入防护（见 §12 第 43 行：去掉前导空白后再核首字符或传 `--` 分隔符）。 |
| `amp` | 云端／CLI `amp threads` 命令族（需账号登录） | 线程 ID（`T-...`）、标题、工作区关联与更新时间，跨 CLI 与网页共享同一服务端线程 | 属云端／账号来源：只存 `connection_id`，每次读取复核连接有效性与账号指纹（§12 第 35 行），账号切换报 `account_changed`。 |
| `kimi-code` | 本地 `~/.kimi-code/sessions/<dir-key>/` 下 `state.json` + `wire.jsonl`，或 `kimi export <id>` | `state.json` 存会话元信息与工作目录，`wire.jsonl` 存消息与工具事件流 | `state.json` 存在但 `wire.jsonl` 为空或正在写入时，保留会话头并如实展示可读前缀。 |
| `opencode` | `opencode session list`、`opencode export <id>`（新版 `~/.local/share/opencode/opencode.db` SQLite） | 走正式 CLI 命令优先于直读私有 `opencode.db`，避免锁冲突与跨小版本表结构变化 | 命令超时或数据库被外部进程独占写锁时报来源暂时不可读，不改写外部 SQLite（不建 WAL／SHM 副作用）。 |
| `pi-agent` / `minimax-code` | `pi`（仓库已支持 `--session <id>`）；`mcode`（`~/.minimax`，列表仅在 TUI `/sessions`） | `minimax-code` 无非交互 `--list-sessions --json`（§12 第 8 行），若未核实稳定本地格式则保留发现缺口，仅开放已知 ID 恢复／返回原工具 | 严格遵守「未证实稳定机器读入口即标能力缺口」，不写脆弱屏幕抓取（PTY 刮 TUI）冒充正式列表。 |
| D 组（IDE／加密库：`cursor-editor`、`devin-desktop`／`windsurf-cascade`、`antigravity`、`lingma`、`trae`、`zcode`、`comate`、`codearts`、`kiro-ide`） | 无正式对外读取接口（私有 `state.vscdb`、加密 `.pb` 或应用内私有库） | 不解析私有／加密存储（需求 §3） | 统一返回来源状态 `unsupported`，提供「回到原工具」或手动导出指引。 |

## 3. 第 34 批契约与安全门禁样本核对清单（对应合同设计 §12）

第 34 批落地前，样本夹具必须逐条覆盖以下五类验证，不能只放「格式完好的 happy-path JSONL」：

1. **只读命令最小环境与零副作用（`S-sessions-read-only-commands`，§12 第 35、36 行）**：
   - 调用外部 CLI（`gh agent-task`、`qwen`、`droid`、`opencode`）必须带明确超时、关闭交互输入（`stdin: "ignore"`）、固定只读子命令白名单，且前后核对 `cli` 连接账号指纹；不能因读取列表在被测目录生成新会话或缓存目录。
2. **目录与 git worktree 纯文件判定样本（`S-sessions-git-files-only`，D2）**：
   - 样本须含：① 正常主仓 `.git/` 目录；② 合法 worktree（子目录 `.git` 文件指向 `<main>/.git/worktrees/<name>`，且后者 `commondir` 与 `gitdir` 双向闭环）；③ 单向伪造的 `.git` 文件（恶意仓库把 `.git` 指到别的项目以骗取自动归入 → **必须拒绝自动归入**）；④ 已删除的旧 worktree 路径（在「只读项目连着的目录」下不可见，选「所有目录」时进待归类）。
3. **版本演进与半行截断样本（SRB-13）**：
   - 每个文件型读取器至少配三份固定样本：支持版本完整样本、末尾写入一半的截断样本（返回已读条目 + 截断位置）、未知新版本样本（返回 `unreadable_version` 来源状态，列表不报空）。
4. **Knowledge 代读与引用种类封堵样本（§12 第 40、41 行，前置红线）**：
   - 在登记 `sessions.subject.read@1` 对象读取器**之前**，必须先有拒绝测试证明：插件或未获项目 AI 读取许可的调用经 `knowledge.read`／`outline`／`grep` 读 `external_session` 一律被拒，且 `projectReferenceKinds` 不把未授权外部会话暴露给插件。
5. **搜索参数与路径转义样本（§12 第 43 行）**：
   - 包含前导空白 + `-n`／`--help`／`--exec` 的搜索词样本，验证服务层归一化后再传参，外部 CLI 绝不把搜索词解释为命令行选项。
