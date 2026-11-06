# Prologue 写后诊断与采用证据

原 §6.0p–6.4 的实施、回归与交接。PA-25 至 PA-39 和后续三组决定保留在[主文 §6.0p.7](spec.md#60p7-验收pa-25pa-39)。

[返回需求书](spec.md)

- [6.0p A2 写后诊断：合同（2026-10-17；A2-1 在 main，A2-2 见 §6.0p.12）](#60p-a2-写后诊断合同2026-10-17a2-1-在-maina2-2-见-60p12)
- [6.0q P4 助理一半 A4：Work 视图按合同取，委派上限是一张表，存量用一次性脚本（2026-10-17）](#60q-p4-助理一半-a4work-视图按合同取委派上限是一张表存量用一次性脚本2026-10-17)
- [6.1 当前记录](#61-当前记录)
- [6.2 A0 本轮交接（2026-10-11 11:50 UTC）](#62-a0-本轮交接2026-10-11-1150-utc)
- [6.3 与 Computer Use 的三处集成交接（2026-10-11，只读）](#63-与-computer-use-的三处集成交接2026-10-11只读)
- [6.4 当前主线候选包消费验证（2026-10-11）](#64-当前主线候选包消费验证2026-10-11)

## 6.0p A2 写后诊断：合同（2026-10-17；A2-1 在 main，A2-2 见 §6.0p.12）

第 9 项。§4.4 定了边界：检查器按已授权项目显式配置，受同一命令审查和预算约束，记录实际命令、退出状态和结果引用；没有检查器显示「未检查」，失败不掩盖文件已经写入；不静默安装工具，不起任意语言服务，不把一次完整构建叫作按文件诊断。这一节把它写成能实现、能验收的合同。统筹 10-17 认可第一刀只写 spec，也认可先做 Prologue 一刀。

### 6.0p.1 结论：两刀，先 Prologue

- **Prologue 一刀**：写后诊断的缝不再自己跑东西，改成交回一条命令（`executable`、`argv`、`cwd`、`timeoutMs`）。SDK 用这一轮自己的命令路径去跑：同一份 `workspace-command` v1 审查资源，同一道 Effect 链，同一份命令回执。跑完把有界的结果拼进这次写入的观察。
- **Molis 一刀**：换包；检查器配置；Coding 的包声明这一样，执行器只按配置拼出命令；Coding 的时间线显示「未检查」或检查结果。

为什么 Molis 自己做不到：
- SDK 现有的缝（`coding.diagnose-after-write`，Prologue `docs/slices/coding-diagnose-after-write.md`）是 `safe-read`，执行器拿到的只有这次调用（工具登记、参数、取消信号），没有命令路径。执行器要跑 `tsc` 或 `eslint`，只能自己起进程。
- Molis 自己不替 Agent 起进程：Agent 的每一条命令都由 SDK 的 Node Host 跑，`horizontal/agent-host` 里没有 `child_process`。
- 在执行器里起进程，就是一条不经命令审查、不留命令回执的新路径。这正是本节要排除的。

Prologue 一刀另外要做到：
- 审查等待不计入写入的时限。写入的时限只管写盘；检查自己的时限见 §6.0p.3。
- 这个开关跟着会话走：会话的包没有声明这一样，就零调用，写入的观察里也不加字。现在的开关是全局的 `config.workspace.diagnoseAfterWrite`，打开后没声明的会话每次写入都多一句「diagnostics unavailable」。
- 取消跟随写入（§6.0p.5）。
- 检查的命令回执挂在这次写入的调用上（同一个 `call_id`），Molis 从回执读结构化的事实，不从观察的文字读。

### 6.0p.2 检查器从哪来

- **只认人保存的项目配置。** 每个项目、每个已授权的工作区，一份检查器清单，带版本号。每个检查器写：
  - `checker_id`、显示名；
  - `executable`：程序名（裸名，最长 255 个字符），在 Host 的 `PATH` 上找（S-38，Host 不跑带路径的可执行文件），不经 shell；带 `/` 或 `\`、带空白或 shell 符号（`;`、`&`、`|`、`>`、`<`、`$`、反引号）、写成 `.` 或 `..` 的，以及 Host 任何时候都不跑的名字（SDK 的 `NEVER_RUN`：`rm`、`sudo`、`chmod` 等），保存时拒（`agent.write_checker_invalid`，§6.0p.11）；
  - `args`（数组，不经 shell）；
  - `applies_to`：扩展名清单，例如 `[".js", ".mjs"]`；
  - `cwd`：相对工作区根，默认 `.`；按 normalize 之后、要存下的那个值查，首尾带空白的、以盘符加分隔符（`C:/`、`C:\`）开头的、出根的、落在 SDK 的受保护目录（`.git`、`node_modules`、`.prologue`，按整段比，`node_modules_cache` 不算）里的，保存时拒（§6.0p.11）；
  - `timeout_ms`（§6.0p.3）。
  - 没有 `env_allowlist`：SDK 跑写后检查时不带人挑的环境变量，答复里带这一项会被 SDK 拒，存进来也用不上（§6.0p.11）。
- **文件怎样进命令**：`args` 里恰好一个元素整个写成 `{file}`（没有 `{file}` 的保存时拒，见 §6.0p.9），执行时换成这次写入的、相对检查器 `cwd` 的路径（`cwd` 是 `.` 时就是相对工作区根），作为一个完整参数；一个检查器只查它 `cwd` 里的文件（A2-2 定，§6.0p.12）。不允许 `{file}` 嵌在别的文字里（如 `--file={file}`），也不允许出现两次。路径以 `-` 开头时写成 `./<路径>`，不会被当成选项。
- **主人**：`horizontal/agent-host`，和 MCP 服务器配置放在一起；检查器同样是在已授权工作区里由 Agent 运行时起的命令。存在 Prologue Runtime 的存储里（kind `molis-write-checkers`，每个项目、每个工作区一条），版本就是存储自己的版本，从 1 起；不建表。两个动作：`agent.write_checkers.list.v1`（query）与 `agent.write_checkers.save.v1`（command，带 `expected_version`），受众都只有 `user`。按「新能力注册成动作」，不加 typed 条目。代码与存储里叫 write-checker，和等待用的条件检查器（`prologue-checkers.ts`）分开（统筹 10-18 定，见 §6.0p.10）。设置页放在平台自己的项目设置节里，和工作区授权在一起，不挂在 Coding 的设置页（`CODING_SETTINGS_UI_CONTRIBUTION_ID`）上：检查器是 agent-host 的平台事实，挂在已授权的工作区上（统筹 10-19 定，§6.0p.11）。
- **哪些轮会查**：按这一轮的会话声明启用，不按插件名认 Coding：这一轮的包声明了写后检查、工作区此刻已授权并存了检查器，执行器就接上（统筹 10-19 定）。
- **谁能改**：
  - 只有人，在项目设置里改。`agent.write_checkers.save.v1` 的受众只有 `user`，权限 `projects:settings`，和项目设置的动作一样（`packages/contracts/src/modules/projects.ts`）。页面直接调这个动作，不经 Coding 的插件路由转调（转调的受众是 `plugin`）。
  - 不登记 `agent`、`mcp`、`workflow`、`plugin`：模型、MCP 客户端、工作流和别的插件都改不了。
  - 操作者从调用上下文来（S-17），不从输入读。
- **只给已授权的工作区**：保存时工作区必须是这个项目此刻已授权、`realpath_verified` 的（`projectSettingsCapabilities.workspaces`，和 MCP 的 stdio 工作区同一处）。
- **改了要不要重新授权**：
  - 工作区授权与检查器配置是两件事。改检查器不放宽工作区，不要求重新授权工作区。
  - 每一次检查都过命令审查（§6.0p.3）。「本会话不再询问」的规则按完整命令精确匹配，所以配置一改，命令变了，旧规则自然对不上，要重新批准，不另写一套失效逻辑。
  - 工作区授权被撤回后，它的检查器不再运行：写入的观察写「未检查：工作区授权已撤回」，不起审查。配置本身留着，授权回来后照用。
  - 审查卡和时间线写出用的是哪个检查器、配置的哪个版本；给模型的观察里没有这两项（§6.0p.4）。SDK 的命令回执里也没有这一项，Molis 不往回执里加字段。
- **不从模型和文件里读命令**：
  - 不读 `package.json` 的 scripts、`Makefile`、`.editorconfig`、仓库里的任何配置文件来推出命令，也不自动「发现」检查器。
  - 模型的写入调用只给路径和内容，执行器拿到的路径来自 SDK 的写入回执，不是模型的文字。模型调用里多写的字段（如 `checker`、`command`）由写入工具的合同拒（SDK 的 `write` 参数是 `additionalProperties: false`）。
  - 要从项目文件里推荐检查器，以后另开一片：只在设置页里列出候选，由人确认后保存。

### 6.0p.3 执行与预算

- **走现有的命令审查，不新开免审路径。**
  - 每一次检查是一笔命令 Effect，审查卡就是现在的命令卡（`prologue-review-documents.ts` 的 `workspaceCard`）：完整的 executable、argv、cwd、时限、环境名单、所属工作区。卡上多一行「写后检查：<显示名>（配置 v<n>）」。宿主靠审查资源的 `operationKey` 认出这是写后检查，用 SDK 导出的 `isAfterWriteCheckOperationKey` 判断，不自己拼 `after-write-check:` 这个字符串。检查器和版本来自执行器自己的记录：执行器回答时记下这次写入选了哪个检查器、哪个版本，按（run，`operationKey`）存，审查卡和时间线按同一个键读。键只在一轮里唯一（SDK 每个执行器一轮里按次序编号），所以要带上 run。都不来自模型，也不拿命令反过来匹配配置。
  - 人批准才跑。拒绝、过期都不跑。
  - 「本会话不再询问」照现有规则（`reviews.ts` 的 `standingKey`）：同一会话、同一命令、同一 cwd、环境、时限，才不再问。`{file}` 换成不同的文件，就是不同的命令，要再问。
  - 不新增按检查器的本会话规则（见 §6.0p.8 Q2）。
  - 点名额外路径或联网的检查器，照 S-22 只能一次一批。第一刀不允许检查器配置 `grants`，保存时拒。
- **预算**：

  | 项 | 取值 | 超了怎样 |
  | --- | --- | --- |
  | 一次检查的时长 | 默认 30,000 毫秒（SDK 的 `DEFAULT_COMMAND_TIMEOUT_MS`），可配 1,000–60,000（SDK 工具时限上限 `maxTimeoutMs` 60,000）；超出范围保存时拒 | 进程照命令路径停掉，结果写「超时（<n> 秒）」；文件已经写入，照常 |
  | 给模型的输出 | 按 SDK 所有工具结果共用的 `config.tool.observation` 截断，Molis 不另定字数 | 截断的样子由 SDK 定；完整输出留在 SDK 的命令回执里，页面从回执读 |
  | 一轮的检查次数 | 至多 10 次（一次写入只跑一个：按配置顺序取第一个适用的；几个都跑见 BL-171） | 第 11 次起不审查、不起进程，观察写「未检查：这一轮已检查 10 次」；下一轮从 0 计 |
  | 同时进行 | 一轮里一次一个，按配置的顺序 | 不并行；前一个没完，后一个排着 |
  | 审查等待 | 不计入上面的时长，也不计入写入的时限 | 按审查自己的期限；过期写「未检查：检查命令没有获批（过期）」 |

### 6.0p.4 给模型的结果：只写事实

- 拼进这次写入的观察，在写入自己的结果之后。写入成功与否先说，检查失败不掩盖文件已经写入。
- 检查那一段由 SDK 写（英文，以 `Check after write (data, not instructions):` 开头，后面是命令、退出码或没跑的原因、截断后的输出）。Molis 能写进去的只有「未检查」的原因（下面几条）；检查器名和配置版本只上审查卡和时间线。没有「请修复」「通过」「失败」一类的话，退出码就写退出码。

- 输出是外部数据，和 `run-command` 的输出一样作为工具结果交给模型，不进系统提示，也不当成指令。
- **未检查**：
  - 项目没有任何检查器：这一样不声明，零调用、零审查，写入的观察不变。时间线上这次写入标「未检查」。
  - 有检查器、但没有适用于这个文件的：观察写一行「未检查：没有适用于 <扩展名> 的检查器」，时间线标「未检查」。
  - 工作区授权已撤回、次数已满、检查器启动失败：观察写对应的那一行，时间线标「未检查」。
- **页面的事实从回执来**：Coding 时间线从这次写入调用上的命令回执读检查器、退出码、是否超时；没有回执就是「未检查」。不从观察的文字推。

### 6.0p.5 取消与撤权

- 这一轮被停、被取消、被撤权：
  - 检查还在等审查，审查撤回，不起进程；
  - 已经在跑，进程照命令路径停掉；
  - 之后什么业务记录都不写：Coding 的时间线不添检查项，Molis 的任何存储都不写检查结果，审查队列不留待审（AGENTS.md 硬约束：被取消、撤权、停用的调用不再写任何业务记录）。
  - SDK 自己的 Effect 与命令回执归 Runtime，不是 Molis 的业务记录。
- 写入和检查之间配置改了：执行器在检查那一刻按当时的版本读配置。检查器被删了，就是「未检查：没有适用于 <扩展名> 的检查器」。
- 检查在取消之前已经跑完的，回执留着，时间线照常显示。那是已经发生的事实。

### 6.0p.6 安全边界：加一行安全不变量（随 Molis 那一刀取下一个空号）

判定：要加。这是宿主替模型拼命令的第一个地方：命令的来源从「模型写的」换成「人存的配置加一个文件路径」，配置的写入受众就成了新的边界。审查卡仍显示完整命令，但只靠审查挡不住「模型或文件改了配置、人照常批准」的那一类。

这一行随 Molis 那一刀加进 `docs/system/SECURITY-INVARIANTS.md`，取那时的下一个空号，不在这里写死（S-33 已给交互线 BL-156 的 Molis 半边）。测试 `tests/security-invariants-checkers.test.ts`。内容：

> 写后检查器的命令只来自人在项目设置里保存的配置：模型、MCP 客户端、工作流和别的插件都存不了（受众只有 `user`）；文件路径只作为一个完整参数，以 `-` 开头的写成 `./…`，不经 shell；没有命令审查的批准就不起进程；配置改了，旧的「本会话不再询问」规则对不上新命令。

四条拒绝各有一个用例（PA-25、PA-28、PA-29、PA-30）。

### 6.0p.12 A2-2：执行器、审查卡与 S-42（2026-10-19）

叠在换包 #814（Prologue `a51607fb`，含 #51 的 `afterWriteCheck` 标记、#52 的「没有退出码」）上。

- **包里怎样声明。** Prologue #51 以后，SDK 按包里标了 `afterWriteCheck: true` 的那一样认写后检查，不再认固定名字。工具目录一个名字只收一份登记，而 Molis 每条会话按这一轮冻住的动作造自己的包，所以这一样的名字随包（`molis-after-write-<范围>`），`safe-read`，可选，不给模型。有工作区、不是业务轮的每一轮都带它；这一轮的工作区此刻已授权、存了检查器，才给它执行器（`prologue-run.ts` 的 `roundChecks`），否则 SDK 零调用，观察里一个字不加。按会话的声明认，不按插件名认 Coding（§6.0p.2）。
- **`{file}` 相对检查器的 `cwd`。** SDK 在检查器的 `cwd` 里跑命令，写入回执给的是相对工作区根的路径；`cwd` 不是 `.` 时，原文的「相对工作区根」会把路径给错。所以换成相对 `cwd` 的路径，并且一个检查器只查它 `cwd` 里的文件：`cwd` 外的写入对它来说不适用，按顺序看下一个。以 `-` 开头的仍写成 `./…`（PA-28）。
- **执行器每次回答前再核。** 先过这一轮自己的派出前复核（插件实例、Character 的授权），再按这一轮的目录问 local-host 此刻授权的工作区（`checks.workspaceAt`，和起跑授权同一处 `workspaceGrants`，只认 `realpath_verified`），再读那一刻的配置。撤回了写「未检查：工作区授权已撤回」，一轮第 11 次写「未检查：这一轮已检查 10 次」（PA-26、PA-33）。执行器自己不起进程，SDK 拿它的答复走这一轮的命令审查、Effect 链和回执。
- **名和版本按 SDK 的键记。** 执行器回答时把检查器编号、显示名、配置版本（和触发它的写入调用）记在这一轮会话索引的那一次尝试上（`write_checks`，键是 SDK 给的 `operationKey`）。写入和审查都按 `run_id` 找同一次尝试，不依赖数组位置，所以（run，`operationKey`）唯一（PA-29）。现行写操作先经过 Host 审查：主轮在 `afterStart` 保存 `run_id` 后才接审批镜像，子轮也先存索引再接镜像，SDK 只在获批的 write/edit 落地后问写后检查；沿用这条顺序，不增加等待状态。审查卡用 `isAfterWriteCheckOperationKey` 认出写后检查，按同一个键读出名和版本，加一行「写后检查：<名>（配置 v<n>）」；是写后检查却读不到记录的，卡不能批准（PA-29）。命令回执里不加字段。
- **模型看到的是 SDK 的原话。** 检查器的 `cwd` 不是 `.` 时，命令那一行后面标 `(in <cwd>)`；可执行文件起不来写「not checked: COMMAND_FAILED: That executable could not be started.」，这就是 PA-37 的「检查器启动失败」；被信号结束、没有退出码的才写「not checked: no exit code (a signal ended it)」（Prologue #52）。Molis 不改写这几行。
- **安全不变量 S-42** 和 `tests/security-invariants-checkers.test.ts`（PA-39）随这一片加：受众只有 `user`、`./` 前缀、不批准不起进程、改了配置旧规则对不上，四条拒绝各一个用例。

这一片没做的，留给下一片：

- **A2-2b Coding 时间线**：写入那一行从这次写入的检查回执读检查器、退出码、是否超时，没有回执标「未检查」（PA-35 的时间线一半，`tests/coding-diagnose-timeline.e2e.test.ts`）。这一片的审查卡已经写出检查器和版本；运行视图的 `command_outputs` 里已经有 `<写入 call id>:diagnostics` 那一条回执。
- **子任务各自目录里的写入**（§6.0p.8 Q3）：子任务的会话由 SDK 派出，不经 `startPrologueRun`，这一片没有接它们的执行器，也没有用例。

### 6.0p.13 A2-3 设置页：项目设置「工作目录」里的「写后检查」（2026-10-20，已实现，真实浏览器回归通过）

现状：已实现在 #805；A2-2 执行器 #822 已合入 main（2026-10-20），前置依赖满足。PA-40 到 PA-43 的真实浏览器验证、截图与当前 main 上 75 个包要求及相关非浏览器用例通过；整体构建、boundary 与 health 对照 main 通过。10 个工作台 README 浏览器用例通过（其中诊断编号用例一次 CDP 连接中断，单独重跑通过）；参数转义补充后 HTTP 5/5、i18n 9/9、真实 Chrome 3/3 通过。

按 §6.0p.11 最后一条，检查器在平台的项目设置里改，和工作区授权在一起；Coding 不知道这一页。

- **放在哪**：项目设置「工作目录」一节（`apps/workbench/src/project-settings-pages.ts` 的 `workspaces`），在「已关联目录」「关联新目录」之后加一段「写后检查」。每个此刻已授权、`realpath_verified` 的目录一组，组就是 `agent.write_checkers.list.v1` 返回的那几份；没授权的目录不出现。独立的项目设置页和工作台设置里的嵌入用同一段。
- **怎样读写**：页面调 `GET`/`POST <project>/api/project-settings/write-checkers`。这条路由和工作目录那条并排（`apps/local-host/src/web-project-platform-routes.ts`），只做适配：以本机的人（`audience: "user"`，权限 `projects:settings`）调 `agent.write_checkers.list.v1` 和 `save.v1`，不自己校验，也不另存。拒绝按动作的错误码回（`actionErrorResponse`：版本过时 409、输入不合法 400、无权 403），页面原样显示动作给的提示语。受众仍然只有 `user`，不经任何插件路由转调（§6.0p.2「谁能改」）。
- **一组里有什么**：
  - 每个检查器一行，写出名称、命令（程序名加参数，`{file}` 原样显示）、适用的扩展名、目录、时限，带「修改」「上移」「删除」三个按钮（第一行没有「上移」）。三个按钮和组上的「添加检查器」给读屏的名字带上检查器或目录的名字（「修改 Node 语法」「添加检查器（app）」）；组名是三级标题。
  - 组上一句说明：一次写入只跑第一个适用的，顺序就是这里的顺序（§6.0p.10 第 1 条）。
  - 「添加检查器」和「修改」用同一张表单，字段是名称、程序名、参数、适用的扩展名、目录、时限。参数用空格分开，带空格、字面双引号或反斜杠的参数加双引号；引号内仅 `\\` 和 `\"` 解为字面反斜杠和双引号，其他反斜杠序列照字面保留，`{file}` 单独一项。已有合法参数（含双引号、反斜杠、空串、空格）读到表单、编辑另一个字段后保存，参数数组逐项不变；不求值 shell、不做变量展开或命令替换；扩展名用空格或逗号分开，没写点的由页面补上；目录默认 `.`；时限按秒填，输入框标出 1–60，空着用动作的默认 30。
  - 每次保存（加、改、删、上移）都把整组连同读到的 `expected_version` 交给 `save`。修改时 `checker_id` 不变；新加的由页面按程序名取一个组内不重复的（`node`、`node-2`），人看不到它。
- **状态**：
  - 读取中。
  - 读不到：写出错误；已有列表保留，取消表单仍能回到原按钮。表单保存冲突后的重读失败，在表单内显示重读的错误，不把它留在对话框后面的状态行。上方的「刷新」重读目录，也重读检查器，不另放一个按钮。
  - 没有可用的目录：写「先在上方关联目录」。
  - 组里没有检查器：写「这个目录还没有配置写后检查器」。执行器已合入，Coding 时间线的「未检查」仍属 A2-2b；设置页不承诺尚未接上的时间线。
  - 保存中：整组的按钮禁用。
  - 版本过时（409）：先重读各组，重读成功才写「这组检查器已在别处改过，已重新读取，请再改一次」；重读也失败就留着重读的错误，不写这句。表单不关，人填的内容留着。
  - 删除先问：在 catalog 的警示对话框里问「删除检查器「名称」？」，不用浏览器自己的 `confirm()`；只有对话框里的「删除」才保存，取消、Esc、关闭都不动。
  - 焦点：加、改、上移、删除保存之后，以及表单、删除对话框以任何方式关闭之后，焦点回到人用过的那个按钮（按检查器和动作再找到它）；它没了（上移到了第一行、检查器被删）就回到这一组的「添加检查器」，不落到页面上。
  - 其他拒绝（400、403）：在表单里写出动作的提示语，表单不关。
- **页面资源**：脚本在 `molis-work-workbench.js` 里（工作台设置的嵌入也用它），会涨。先在同一个资源里找能省的；省不回的部分在 PR 里按用户决定 #17 写明，请评审一次性放行（预计不到 10 KB）。省的办法：每句话都由宿主按页面语言写在 HTML 里（`data-say` 和三个带 `{槽}` 的 `<template>`，`apps/workbench/src/write-checkers-section.ts`），页面程序只克隆并用 `textContent` 填槽，自己没有中文；这段程序是单独的常量（`WRITE_CHECKERS_CLIENT_SCRIPT`），只有画这一段的两处带它（工作台脚本、项目设置页），全局设置页不带，工作区脚本有它才绑定。
- **不做的**：不从项目文件里推荐检查器（§6.0p.2 最后一条）；不做拖动排序；不显示 `checker_id`。

| 编号 | 做到 | 拒绝或反例 | 用例 |
| --- | --- | --- | --- |
| PA-40 | 工作目录一节有「写后检查」，每个已授权目录一组，列出 `list` 返回的检查器 | 没授权、`realpath_verified` 为假的目录不出现；没有检查器的组明确未配置，不承诺下一片才实现的时间线 | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |
| PA-41 | 页面的保存经路由调 `save`，版本加 1；路由不另外校验 | 版本过时回 409 `actions.conflict`，配置不变；不合法回 400 `agent.write_checker_invalid`，提示语原样；不带控制令牌的请求被拒 | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |
| PA-42 | 表单换成合同的形状并可逆：已有合法参数含字面双引号、反斜杠、空串或空格时，编辑另一个字段后保存参数不变；带引号的参数算一项，`{file}` 单独一项，时限从秒换成毫秒；新检查器的编号组内不重复，修改时保留原编号；上移、删除只动那一项 | 没有 `{file}`、`{file}` 嵌在别的文字里、程序名带路径的，页面照样交给 `save`，由动作拒（页面不另写一套规则，只做补点、去空白、秒换毫秒这类整理） | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |
| PA-43 | 页面程序不带自己的句子：每句话在宿主写的标记里（`data-say`、`<template>` 的槽、带名字的 `aria-label`），删除问在警示对话框里，时限框接受毫秒（`step`）；只有画这一段的两处带这段程序，全局设置页不带 | 页面程序里没有 `confirm(`、没有中文、不用 `innerHTML`；全局设置页没有 `molisWorkWriteCheckers` 的定义，工作区脚本在它不在时不绑定也不报错 | `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` |

2026-10-20 真实浏览器验证通过：新增用例用临时 Home、真实 HTTP 与 Chrome 走独立/工作台嵌入设置页的保存、重读、修改 2500 ms、含引号/反斜杠/空串/空格参数只改名称后保存不变、上移、删除、取消/Esc 和焦点恢复；真实版本冲突和只拦 GET 的网络故障保留输入；撤回工作区授权后拒绝保存，重新授权仍读出原版本原配置。中英文各在 1440 浅色、1024 深色、390 浅色核对列表与编辑表单，长命令无横向溢出。12 张截图默认在忽略的 `.impeccable/qa/review/write-checkers-settings/`。这些覆盖自动化真实操作，不代替用户本人验收。

### 6.0p.9 不做的

- 不自动发现检查器，不读仓库里的配置文件推命令。
- 不装工具，不起 LSP 或别的常驻语言服务。
- 不把整项目构建当成按文件诊断：配置里没有 `{file}` 的检查器保存时拒，第一刀只有按文件的。
- 不给检查器联网或额外路径（不带 `grants`）。
- 不改 SDK 官方编码包；Molis 不用官方包。

## 6.0q P4 助理一半 A4：Work 视图按合同取，委派上限是一张表，存量用一次性脚本（2026-10-17）

§7.5 第 5 条的第 7、8 项，加上 A1、A2 留给这一片的存量。统筹 10-17 定了四条：Q1、Q4 统筹定，Q2、Q3 用户在弹窗里定。

1. **Work 视图按合同逐项取。**
   - 以前 `publicWork` 从存的正文里剥掉宿主自己的几项，剩下的全放进视图（`...rest`），正文里多一个键，视图就多一个。
   - 现在由 `assistant-work-view.ts` 的 `workView` 按 `AssistantWork` 的字段一项项取，选填的只在有值时出现。
   - 合同以后加字段，漏取的编译不过（统筹审 #680 提）：必填的一半写成 `AssistantWork`，选填的一半写成「合同的每个选填字段都必须给、可以是 `undefined`」的类型，再只放进有值的。试过在合同上临时加一个选填字段、一个必填字段，构建都在 `workView` 报错；以前选填的那种会悄悄漏掉。
   - 子任务的 `delegated_by` 也这样取（`AssistantDelegations.shown`）：只取标题、验收标准和收回时刻。派它的工作从图上读，正文里留着的旧 `work_id` 盖不住它。
2. **委派上限是助理的产品规则**（Q1，统筹定 A）。
   - 6/3/2 放在 `assistant-delegation.ts` 的 `DELEGATION_LIMITS`（`parts`、`active`、`followUps`），只在这一处定义；告诉模型的话一字不改。
   - 原来写的是「搬进协作配置」，可 SDK 没有这个东西。它只有板的上限（`maxNodes`、`maxDepth` 等），那是 Runtime 的保护，不是助理的规则。
3. **存量用一次性脚本，不进仓库**（Q2，用户定 A）。
   - 删每项 Work 正文里的 `handed_back_run`、`hand_back_held`（§6.0n 第 8 条）。
   - 旧形状的子 Work（有 `delegated_by`，没有 `graph_id`/`node_id`）去掉 `delegated_by`，各自成为独立的工作，正文、轮次和结果都留着。不在 Prologue 的库里给它们补步骤。
   - 其余不在现行 `StoredWork` 里的键只列出来，不改。
   - 只改 `assistant_works.body`，在一个事务里；不动 `revision`、`updated_at`、`user_version`。只打印编号和个数，不打印标题和正文。
   - 脚本拒绝在真实 Home 的路径上跑。真实的库只在装下一个版本时写，和维护八同一步，那时再问用户。
   - **脚本在哪、怎么跑**：不进仓库，放在统筹的共享笔记目录（`~/Library/Application Support/Claude/side-session-notes/local_7207c245-d21c-46be-b897-b5267cf14585/adoption-a4-stored-works.mjs`）。`node adoption-a4-stored-works.mjs count <assistant.db>` 只列出会改的编号和个数，什么都不写；`apply <assistant.db>` 在一个事务里改完，再数一遍。
   - **跑之前先问用户**：对真实 Home 的任何一次 `count` 或 `apply` 都要用户先同意。写真实的库时，Home 先停，先备份，在拷贝上 `apply` 过，再对真实的库跑（脚本现在拒绝真实 Home 的路径，到那一步由维护八的流程决定怎么放行，也要用户同意）。
4. **演练**（Q3，用户同意）。
   - 用 `sqlite3` 以只读方式（`mode=ro`）把真实 Home 的 `assistant/assistant.db` 备份到草稿目录。只拷了这一个库：脚本不读 Prologue 的库。没读密钥，没碰钥匙串。
   - 列出的结果：13 张表，`user_version` 2；`assistant_works` 0 行（`assistant_rounds`、`assistant_jobs` 也是 0）。所以要改的是 0 项：两个旧键 0 项、旧形状子 Work 0 项、其余键 0 种。
   - **这是 10-17 只读拷贝上的数。** 装下一个版本时（和维护八同一步），写之前先再 `count` 一次：在那之前，已装的 10-11 构建还可能写出旧形状的行。
   - 在拷贝上执行了一遍：改了 0 项，`integrity_check` 为 ok，`user_version` 仍是 2。
   - 拷贝随即删掉。真实的库没被写，修改时间仍是 10-07 19:23；当时也没有进程打开它。
   - 另在一个合成库上试过一遍：两个旧键、一个旧形状子 Work、一个现行子 Work、一个陌生键。改了 2 项，现行子 Work 和陌生键原样，真实 Home 的路径被拒。
5. **复查已废的读写**：核过，没有别的。
   - `AssistantStore` 的方法都有调用方。
   - `handed_back_run`、`hand_back_held` 只在本文里出现。
   - `delegated_by` 的读法都按现行形状（`graph_id`、`node_id`）。
   - `assistant_jobs` 不再写，只在删工作时删行；删表另做（第 6 条）。
6. **不改基线**（Q4，统筹定）。A4 只改代码和脚本。3 号基线（删 `assistant_jobs`）另做一片，节奏跟维护八和 BL-157 的门禁走。

**验收**：

| 编号 | 证明 |
| --- | --- |
| W2-18-A4-VIEW-01 | 存的正文带两个旧键、一个陌生键和宿主自己的几项：视图正好是合同的 12 个必填字段，没有值的选填字段不出现。带齐选填字段的子任务：视图多出那 5 项，`delegated_by` 是派它的工作，加上它的标题和验收标准；正文的 `delegated_by` 里留着的 `work_id` 和别的键都不出现（`tests/assistant-work-view.test.ts`） |
| W2-18-A4-LIMITS-01 | 第七个子任务、第三次跟进、已有三个还在进行时的下一个都被拒，错误的原话照旧，被拒的那次不留下工作（`tests/assistant-delegation.test.ts` 里的三处；第三处在图上加三个没结束的步骤） |

**变异**（每条改回去重建、单跑对应的用例）：

| 变异 | 变红的用例 |
| --- | --- |
| M1 `publicWork` 改回 `...rest` | VIEW-01 |
| M2 `shown` 改回 `...rest` | VIEW-01 |
| M3 视图漏掉 `budget_tokens` | VIEW-01 |
| M4 `followUps` 改成 3，`parts` 那句话改一个字 | LIMITS-01 的前两处 |
| M5 `active` 改成 4 | LIMITS-01 的第三处 |
| M6 合同临时加一个选填字段（和一个必填字段） | 构建失败在 `workView`，不用等用例 |

同时进行的上限（3）以前没有用例，这一片补上了（第三处，统筹审 A4 时提）。

- 验证（叠在 #675 的 `fc2f7538d` 上）：
  - `pnpm build` 通过。全部非浏览器的 `assistant-*`、`prologue-work-*` 用例（36 个文件；补了第三处之后 `assistant-delegation` 又单跑一遍），加上 `project-deletion-assistant`、`security-invariants-assistant-html`、`agent-collaboration-revise`、`coding-delegation-waits`、`doc-reference-gates`、`health-gates-api-snapshot`，都一次过。
  - `pnpm test:security` 59/59，`pnpm test:contracts` 44/44。
  - `check-health-gates --base origin/main`、`boundary:check`、`page-assets --base origin/main` 都过。`AssistantService` 1555→1553 行，方法数 94 不变；本地快查跟着降。
  - 这一片没有改公开 API、动作和页面资源；门禁列出的两份 API 变化都是 #675 的。
- 未验证：浏览器用例和全量，由统筹排；真实的库没有写，等装下一个版本时和维护八一起。

## 6.1 当前记录

A0 执行记录（下列历史方案记录之后继续）：

- 2026-10-11 范围纠正已落实：原 1–23 项和存储/预算决定仍是整线目标，24/25 只补协作链；删除 P5 对所有原采用项的无依据前置，§5.2 分列真实依赖，§5.6 给出下一完整 A1 的来源、文件与 PA-24 验收。
- 本轮三处授权登记完成：S-13 补记忆标记，S-22/S-23 记命令扩权与 yield 拒绝；`test:security` 仅追加三份对应测试，产品子集追加 yield、记忆和存储重开三份用例。既有条目保留，S-07/S-17 和数量说明未动。文档/安全登记检查 0 问题；`tests/security-invariants-doc.test.ts` 1/1 通过（日志 `/tmp/molis-a0-security-registration.log`）。没有启动构建、浏览器或重跑已有产品验证；正式 SDK 包与 Linux 默认消费结论仍未获得。

- SDK 完整 S1 与 `c4b9fde3` 组合只在 `loop-tools.ts` 出现文本冲突，保留两边语义；`pnpm exec tsc -p tsconfig.typecheck.json` 通过。首轮定向 54 项中 50 通过，4 项因隔离树未构建、子进程找不到 `dist/index.js` / `dist/node.js` 失败，待构建后复验。
- Molis `node scripts/check-health-gates.mjs --base origin/main` 通过，公开 API 快照只变 AgentRunView 与命令扩权合同；`pnpm boundary:check` 通过（该脚本会先构建 test-kit，小包步骤也已执行）。
- 为等待完整构建而做的源码接线验证：临时 tsconfig 仅把公共包入口映射到当前 Molis/SDK 源码，6 文件 49 项通过，包含 PA-23 真实 HTTP + Node Host 的 yield 拒绝、零子派发、原父 Run 与重开不自动启动，以及状态/审查/存储/记忆边界。它不证明候选包可安装，正式包/默认构建路径仍待验证。
- 扩展源码验证：8 文件首跑 93 项中 80 通过、13 因新安装没有 SQLite 原生模块失败；核对同版本 `better-sqlite3@12.8.0` 后复用主检出的 Mach-O arm64 模块，`action-before-effect.test.ts` 的 20 项复验全过。补跑状态投影/凭据桥 2 文件 17 项全过。去重后 16 文件 159 项通过；这仍是源码映射验证。副作用用例启动临时 Host 时报告尚未构建的插件资源缺失，业务断言通过不升级为工作台启动/资产验收。
- 最终源码差异 `git diff --check HEAD` 两仓通过；Molis 文档门禁 0 问题，临时源码映射配置已删除。当前 PA-22/PA-23 已有测试引用（新增 A1 的 PA-24 仍待实现），编号脚本只证明可检索，具体通过程度仍以下表为准。
- 包尚未生成，撤回从旧采用提交提取的 `vendor-provenance.test.ts` 写死包名/提交改动，使其与当前未换包状态一致。依赖、锁文件、登记、vendor 文件仍与基准相同；健康门禁此时通过不证明新包来源合格。
- 临时跨仓源码 typecheck 暴露 SDK 与 Molis 不同 TS 配置（ES lib、Node 类型、noUnused），不能作为正式包类型检查；未因此放宽配置或改 SDK 无关源码。该检查未报告 Molis 源码错误。

前序方案记录：

- 2026-10-09：建采用树，完成原始调研与部分适配；当时的唯一进度只记到状态投影和微压缩。本次按提交/源码补全为 §0.2，历史测试声称不升级为本次验收。
- 2026-10-11：按用户最后纠正，TaskBoard 统一协作成为确定方向；本轮读取原对话、两仓规则、采用/相关工作树和现行实现，修订同一份 spec。SDK `onYieldSettled` 已有、App-tools 仍拒子代理、Molis 仍拒子任务通信、两套私有协调状态均已在源码核实。
- 本轮文档校验：`git diff --check` 通过；采用树现有 `docGateProblems`（链接、引用、索引、BACKLOG、根目录规则）为 0。用主检出的新版同一文档检查器复核，HEAD 与修改后均有 6 个既存 contract placeholder 问题，新增 0；本轮不改这些源码。
- 编号校验：采用树尚无 `check-spec-coverage.mjs`，用主检出脚本加 `--root` 指向采用树只读检查。PA-01–PA-23 全部识别，无未编号条目或前缀冲突；报告仍列 23 项未被测试引用，属于新增方案尚未写实现测试的缺口，不把脚本退出 0 当作产品覆盖通过。PA-01 的方案内容/文档校验已完成；PA-02–PA-23 待实现和验证。
- 2026-10-11 补充：按用户要求增加 §4.6.8 外部条件等待。核实 SDK 命令事件/输出等待、LocalQueue、Molis 助理作业退避检查、Schedule 的项目闹钟边界及常驻服务限制；新增 PA-16–PA-21。通用进程/文件/下载上传检查器未标成现有完成能力。
- 2026-10-11 交接补充：§5.5 将 A0 基础采用收窄到四个 Molis 来源提交，明确 S1/题型均非前置、SDK 合成落点、私有接续排除、文件范围、当前主线冲突与 PA-22/PA-23。只读预演 A0 为 8 文件重叠/2 文件文本冲突；未运行源码验证。
- 前序文档轮仅修改本文与 `specs/README.md` 的本线索引行。原 8 个源码/快照修改与 5 个未跟踪源码/测试保留；该文档轮两仓均无产品代码修改。工程全量、真实模型、产品实操、用户本人验收本轮均未执行。

## 6.2 A0 本轮交接（2026-10-11 11:50 UTC）

本轮完成度是**源码已集成、定向验证部分通过**，未达到 A0「功能可用」。所有改动均未提交；新 Molis 树 `feature/prologue-a0@9f9bda551402e1bee03f0646f55791e5cb0e31d6`，SDK 树 `feature/molis-a0-s1@c4b9fde33df465b6f1798ef1c34de85c2b1904f0` 加完整已接受 S1（33 文件）与组合说明。Molis diff 42 文件，包含合同/Host/必要 Coding 展示、测试与本线文档；可用 `git diff HEAD` 审阅，不能只看未暂存 diff。来源树与真实 Home 未动。

| 验收 | 已证明 | 未证明 / 下一步 |
| --- | --- | --- |
| PA-22 | SDK typecheck；组合源码微压缩/回执/子回报定向通过；Molis 预算合并、状态/审查、独占 owner 清理、凭据、取消/撤权后零写等源码入口验证通过 | SDK 4 项子进程用例缺 dist；尚无组合候选包与离线消费者；Molis 默认构建/安装路径、UI、资产、集成全量未验 |
| PA-23 | 真实回环 HTTP + 生产 Node Adapter：yield 在派出前拒绝，零孩子、无审批、只有原父 Run；落盘重开无模型调用/自动接续。diff 保留现行主线删除/owner/testkit 边界，健康与 API/包边界已检查 | 正式依赖/锁文件待实际包生成；临时 Home 默认启动与 Coding 浏览器未验；未合 main，D7 未解除 |

11:42 统筹明确整机资源仍被 Computer Use 全量（PID 40510/40511）和防腐全量（PID 55804/55805）占用，禁止整体构建、SDK 包构建、浏览器及包装命令的隐式构建。本轮不主动等待/轮询这些任务；保留工作树供统筹分配下一时段。日志：`/tmp/prologue-a0-typecheck.log`、`/tmp/prologue-a0-sdk-targeted.log`、`/tmp/molis-a0-source-tests.log`、`/tmp/molis-a0-source-integration.log`、`/tmp/molis-a0-source-effect-retry.log`、`/tmp/molis-a0-source-status-credentials.log`、`/tmp/molis-a0-health-code.log`、`/tmp/molis-a0-boundary.log`。临时源码映射仅在已忽略 QA 目录生成，验证后删除，不成为生产配置。

下一时段按依赖串行执行，不重跑已经有效的源码检查：

1. SDK 树执行 `pnpm --filter @prologue/sdk run build`，然后 `pnpm exec vitest run packages/sdk/test/host-storage-concurrency.live.test.ts packages/sdk/test/steer-receipts-node.live.test.ts packages/sdk/test/packaged-consumer.test.ts --maxWorkers=1 --typecheck.enabled=false`。前两文件复验真实子进程，第三文件验证公开构建入口；它本身有隐式构建，当前未运行。
2. 在 `packages/sdk` 执行 `pnpm pack --out <临时绝对目录>/prologue-sdk-a0-s1.tgz`；空目录依赖该包，`pnpm install --offline --ignore-scripts`，复制并执行 `packages/sdk/test/fixtures/steer-receipts-consumer.mjs`。记录真实包 SHA/字节数、基点与完整工作树差异；`dirty: true`，不得写成已提交/上游 main 包。
3. 正式 vendor 规则要求干净具名提交，不能用候选来源冒充或放宽 `vendored-provenance`。先交候选包和 scoped diff 给统筹集中处理 SDK 提交/上游合入授权。获授权后从最终具名提交重建，才把包、来源、依赖、`scripts/workspace-packages.mjs`、锁文件及对应测试一起切换；保留/删除历史旁证遵守 vendor 当前规则。
4. Molis 正式包切换后 `pnpm install --frozen-lockfile --offline`、`pnpm build`，用默认配置跑 §5.5 定向测试（加 `tests/agent-action-tools-prologue.test.ts`、`tests/prologue-credential-bridge.test.ts`），再 `pnpm boundary:check`、`pnpm test:contracts`、`pnpm test:security`、`node scripts/check-health-gates.mjs --base origin/main`。正式包来源授权未到时，可先在独立临时消费树验证同一 candidate 默认路径，但不得把它当可合主线产物。
5. 统筹已授权三处安全/CI 登记，范围见 §5.5：S-13 的 pinned memory 标记中和、命令扩权一次性批准、yield 派出前拒绝及对应轻量用例。此次只追加登记；后续合主线前与防腐届时版本合并，不覆盖其 S-07/S-17 与数量说明。默认包路径执行这些用例仍随构建时段验收。
6. 构建时段内执行 `pnpm workspace:build`、`pnpm page-assets:check`；真实尺寸只能保持或缩小，超额在本刀允许的展示代码内解决，不放宽预算。浏览器时段跑 `node scripts/run-tests.mjs tests/coding-timeline.e2e.test.ts`；冻结源码后按集成排期 `node scripts/run-tests.mjs` 全量。收紧后的生成基线按现行命令更新，失败再做干净基线对照。

当前不请求用户提前批准未知候选包。三处安全验证登记范围已授权；仍需要 SDK/Molis 构建时段；候选包完成后，再集中给出 SDK 提交/上游采用的具体审批材料。没有执行 commit、push、PR、merge、publish 或真实 Home 切换。

## 6.3 与 Computer Use 的三处集成交接（2026-10-11，只读）

核对时 `origin/main=9f9bda551402e1bee03f0646f55791e5cb0e31d6`；CU 来源为 `.claude/worktrees/computer-use`、`feat/computer-use-land@6919b8cc2231185e6bc5851aa353fe806a106ad0` **加当前未提交 diff**，负责人仍是 Grok 原线。只查 HEAD 差异会漏掉已提交桌面合同，因此同时对照该树工作目录与 origin/main。三文件合计相对主线 93 行新增、52 行删除；这是当前快照，不是已接受基准。

只读文本预演将 A0/共同主线/CU 三份文件复制进临时目录后执行 `git merge-file -p`，不改任何工作树、index 或 ref：`prologue-node.ts` 1 块冲突（导入）、`prologue-stream.ts` 1 块冲突（同位置新增 helper）、公共合同 0 块。自动合得上不代表语义正确；以下是需要保留的实际行为。

| 接缝 | CU 当前改动与 A0 的关系 | 集成裁决 / 验证落点 |
| --- | --- | --- |
| `horizontal/agent-host/src/adapters/prologue-node.ts` | CU 加桌面审查 helper、runRefs、应用本轮授权、结束释放与桌面指导；A0 有副作用白名单、yield 守卫、预算/模块拆分、S1 steer 等待后丢弃返回值。导入冲突可按各自引用并存 | 保留 A0 的 `HOST_GOVERNED_TOOLS`、预算/审查/拒绝及三处 async steer 桥；接入 CU 已接受的桌面 helper 和 Run 生命周期，不能搬回旧大函数覆盖拆分。**CU 的 `sleeping → paused` 是必须消除的语义冲突**：A0 已让运行端保留 sleeping，并由 `prologuePhaseOf` 投影为 running + `sleeping_until`；休眠会自行继续，不能成为需人工恢复的 paused。保留 CU 真正的 person-input 暂停，两者分别测试 |
| `horizontal/agent-host/src/adapters/prologue-stream.ts` | CU 新增 desktop surface/observation 识别、`DESKTOP_STEP` 标记、tool-call/result helper；A0 新增状态/记忆/变更/恢复 handlers、reasoning 收口、sleep 清理 | 两组 helper 可共存，工具事件交给 CU helper 时仍调用 A0 `closeStreaming`，保留所有 A0 handlers 与 completed/终态收口。重放必须同样区分桌面与浏览器，标记不泄漏给人；不能整文件选择任何一边。`tests/prologue-stream.test.ts` 与 CU `tests/assistant-tool-words.test.ts` 联合证明 |
| `packages/contracts/src/services/agent-host.ts` | CU 对主线增加 `AgentToolOperationReviewDocument.round_allow` 和 `remember: session / app-this-round`；其相对 CU HEAD 的未提交部分仅缩短这两处注释。A0 拆 memory 合同并增加 grants、sleep/turn_changes 等投影 | 没有同名字段类型冲突；联合合同保留两边字段。`app-this-round` 只授权桌面应用当前 Run，不能使 A0 带 grants 的命令取得免询问；命令记住规则与桌面本轮规则各守既有适用条件。重新生成单份 API/动作快照，不拼接旧快照；`agent-review-standing` 与 CU 的审批入口用例联合验 |

**对 A0 的前置结论**：未发现必须先等 CU 合同落地才能完成 A0 独立包/默认路径验收的冲突。上面的 sleeping 转换必须在两线共用产物前解决；此轮不改 CU 或为其增加兼容逻辑。CU 当前依赖 `prologue-sdk-0.0.0-rc.1-computer-use.tgz`，A0 准备的是 c4b9fde3 + S1；两者不能靠覆盖包路径合成。共同 SDK 源码/来源与消费验证是后续共享集成任务，不把只核对这三文件当作 SDK 联合兼容验收。

**交回与顺序**：本节交回唯一统筹会话 `01a12a80-ede2-7b81-93ea-521a5abcc35c`；CU 代码/实际电脑验收留给 Grok 原负责人。A0 先按获配时段完成 §6.2 的包、默认路径和工程验证。统筹选定两线已接受快照与最新防腐主线后，指定一个集成 writer 在隔离集成树按 SDK/公共合同 → Host/审查 → 事件投影 → 两线默认路径测试的顺序合并；以此处裁决保住休眠语义、命令扩权拒绝和 CU Run 授权释放，不整支覆盖。若 CU 先合 main，A0 按新 main 重做上述三处窄差异集成；若 A0 先合，CU 同理适配，不因先后顺序改变合同。两线分别通过不代替共同产物验证。

| 层次 | 本次可报告事实 |
| --- | --- |
| 代码 | A0 42 文件在途 diff，CU 在途提交/未提交快照已只读核对；三处尚未实际合并，没有改 CU/SDK 来源树 |
| 验证 | A0 保留 159 项源码映射验证、SDK typecheck 与登记检查证据；此次仅三文件语义审阅/文本预演，无共同构建/测试。CU 原 spec 的真机及模型记录是原线证据，本轮不升级其结论 |
| 合入 | 两线均未因本轮进入 main；origin/main 仍为上述提交。正式来源与提交/推送/PR/合并授权边界不变，D7 尚未解除 |
| 安装 | 本轮没有安装/切换真实 Home 或桌面产物；组合包也尚未生成，不是当前运行环境已升级 |
| 真实验收 | A0 默认临时 Home/UI/真实模型及共同产物实操未验；未取得用户本人验收。CU 真机覆盖与缺口仍由其 spec/负责人维护 |

资源以统筹最新核查为准：原防腐全量 PID 55804 已结束，转浏览器补验 PID 22490；baseline-main 有构建；CU 全量 PID 40510 仍跑。未分配 A0 构建/浏览器时段，因此不启动含隐式构建的命令，也不开始 A1 源码。资源更新只改变验证排期，不改变完整采用范围或未读输入政策。

## 6.4 当前主线候选包消费验证（2026-10-11）

**最新完成程度（2026-10-12 00:32 UTC）**：真实 dirty SDK 候选与隔离公开包消费者已通过；Molis 已换包并完成冻结离线安装，整体构建首次失败于安装时丢失 esbuild 可选依赖，环境已修复但尚未重建。新起 CU 基线全量占用后停止重构建，Molis 默认定向/浏览器/全量仍未验；不能据已完成的 Agent Host/Coding 单包编译宣称产品构建通过。D7 未解除。

- SDK 来源仍为 `/Users/yijunwang/code/prologue-a0-integration` 的 `c4b9fde33df465b6f1798ef1c34de85c2b1904f0` + 完整 33 文件 S1 未提交差异，源码/index 未改；构建前后与既存完整源 patch 比较一致。`pnpm --filter @prologue/sdk run build` 通过；`host-storage-concurrency.live`、`steer-receipts-node.live`、`packaged-consumer` 三文件 11 项通过（maxWorkers=1），不重复此前已通过的源码/类型证据。
- 候选实际为 validationROOT 的 `prologue-sdk-a0-s1.tgz`，1,064,280 字节，SHA-256 `71c25f85f15de3f918107080a468f0dc469e956d2b76b12987d2cf51087fb96b`。provenance 明确 `dirty:true` 和完整 patch，没有宣称正式提交或上游合入。既有 `sdk-consumer` 离线安装后，经 `@prologue/sdk` / `@prologue/sdk/node` 公开入口运行 `steer-receipts-consumer.mjs` 成功：实际回环 HTTP、输入幂等/撤回/读到归属、落盘重启回放且无多余请求。日志为 `sdk-build.log`、`sdk-dist-tests.log`、`sdk-pack.log`、`sdk-consumer-install.log`、`sdk-consumer-s1.log`。
- 同一 Molis 消费者从 fb8c9dcca 无损前移 `4fb2db83f0d03b7a738b24dc7979215fa7300e3a`，备份在 `advance-fb8c9dcca-to-4fb2db83f/`。三方应用无冲突，42 个 A0 文件与备份字节相同（同步最新 spec 前），62 个主线变更与 HEAD 相同；主线版本单源、TypeSafe 内部绑定、安静重开、触屏/Dock、schedule readiness、页面预算/快照和文档修正均保留。
- 候选只切到临时消费者的 agent-host 依赖、包登记与锁；旧包和 sidecars 从临时 vendor 移出，原字节备份在 `old-vendor-package/`，Git blob 和来源加入 patch-history，旧重建补丁按既有决定保留。原 A0 实现树的依赖与 SDK 源未换包。正式来源门禁/测试不放宽；它们原来钉住旧包、无补丁干净提交与历史数量，本候选阶段不能称通过，最终正式来源确定后才更新实际包断言。
- 第一次 `pnpm install --offline --ignore-scripts` 解析锁时丢掉平台可选依赖（原始锁保留为 `molis-lock-offline-resolution.yaml`），后续整体 `pnpm build` 因 `@esbuild/darwin-arm64` 缺失而退出 1。已核对未配置 optional 禁用；保留 main 的完整依赖图，仅带入 pnpm 实际生成的 SDK resolution/路径，最终锁只差 5 行。`pnpm install --frozen-lockfile --offline` 修复通过（18 项全部本地复用），不改配置或放宽门禁。日志 `molis-candidate-build.log`、`molis-candidate-install-repair.log`；首次 build 中 Agent Host 与 Coding 的 tsc 已完成，但 root/workbench 构建未完成。
- 修复后重命令前发现新 CU 基线全量 PID 79488（包装 PID 79483，`cu-baseline-4fb2-full`），没有启动第二次 build、test-kit、浏览器或等待型全量。`node scripts/check-package-boundaries.mjs` 直接使用首次构建已有的 test-kit，返回 errors=[]；这是同一边界检查器通过，未额外运行会隐式构建的 pnpm 包装。`node scripts/check-health-gates.mjs --base origin/main` 退出 1，仅报候选 provenance 的 `source.dirty must be false`，无其他问题（`molis-candidate-health.log`）。不更新基线或跳过断言。00:32 UTC 最后复查该全量与 Chrome 子进程仍在运行，本轮冻结交回；既有 `resume-commands.md` 从安装已修复后的整体 build 接续，SDK 已通过步骤不重跑。

以下保留各轮历史过程；与本段冲突的“尚无包/旧基点”只描述当时状态。

**2026-10-12 00:26 UTC 恢复包验证**：实际进程复查未发现构建、全量或浏览器批次。沿用同一 SDK、sdk-consumer 与 molis-consumer；本轮先 SDK build → 三个缺 dist/包验证 → dirty tgz → 公开包 S1 消费，再把消费者 fb8c9dcca 无损前移到已 fetch 的最新 main（统筹为 4fb2db83f），运行正常默认包路径。原源/已通过源码证据保留，正式来源门禁不放宽，无提交或真实 Home 授权；当前还没有候选成功证据，下面旧结果均按其时间保留。

**20:24 UTC 接续合同**：本轮目标是 SDK build、三个缺构建验证（host-storage-concurrency.live、steer-receipts-node.live、packaged-consumer）、dirty 候选及隔离 S1 包消费，再验证临时 Molis 默认路径；不重复 159 项源码映射与已通过类型证据。现已 fetch 的目标为 `fb8c9dcca5cfc424decd6fff44ba940e8491eb9b`（#395/#396/#397 已合），PR #398 版本单源仍在途，不先采用。同一消费者从 70c529805 前移，先备份再三方恢复原 42 文件差异；原 A0/SDK 源保留。重叠 7 文件只合主线适配：保留交互失败限次、动作参数错误合同、ScenarioPack 2.4.8、图片上限 6、安全表 S-03/S-07/S-08/S-17/S-18 和 Issue 安全测试；同时保留 A0 的预算、授权、副作用、yield 拒绝、steer 回执与 sleeping 状态。主线 Home Runtime、数据库、快照、资源预算和安装说明均不改写。

实际资源核查与统筹的空闲观察不一致：`scripts/./run-tests.mjs` PID 85235（integration-wave3-i2）与其浏览器仍运行，约 54 分钟；不是僵尸。已有锁不能代替全量独占，故先做无构建的消费者前移，未启动 SDK/build/test-kit/浏览器。资源释放后沿既有 resume-commands 顺序继续，正式 dirty 来源失败单列，D7 不解除。以下 70c529805 记录为上一轮已完成的静态集成证据，非本轮包验证结果。

**本轮实际集成结果**：同一消费者 HEAD 已为 `fb8c9dcca5cfc424decd6fff44ba940e8491eb9b`，42 文件 A0 差异仍完整暂存。前移完整恢复材料在 validationROOT 的 `advance-70c529805-to-fb8c9dcca/`（full/staged/unstaged patch、index、42 文件归档及原 A0/SDK 备份）。三方应用有 2 处冲突：`package.json` 的安全测试采用 main Issue 3 项与 A0 3 项的并集，其他字段保持 main；`specs/README.md` 同时保留 Issue 与完整 Prologue 采用索引。其余 5 个重叠文件自动合并，已读实际 diff 核对，保留主线提问失效判断/交互失败限次、参数纠错、图片 6 张及 A0 预算、授权、effect、yield 拒绝、异步 steer 和状态投影。

范围与源保护检查：两基点间 167 个主线变更中的 160 个非重叠项与新 HEAD 一致（含删除），其余 35 个 A0 文件在同步本 spec 前与备份逐字节相同；安全表 main 全部行（除 A0 扩展的 S-13）保留，A0 S-13/S-22/S-23 与备份一致。已整合的 `model-thinking` 两处 `templates: []` 未变。原 A0 暂存/非 spec 源码和 SDK 的 staged/unstaged/status 保持不变。无 unmerged、无空白错误；文档、安全登记、产品子集只读门禁均返回 0 问题。最终复查 PID 85235 仍在跑（约 56 分 43 秒，活跃测试子进程 27962），没有启动本线重验证。这些是静态整合证据，不宣称运行行为通过。

统筹已纠正资源观察：按 `run-tests.mjs` 基名检查，避免漏掉 `scripts/./run-tests.mjs`。实际 PID 85235 全量仍在运行，本轮不排队等待、不启动 SDK/test-kit/产品构建或浏览器；SDK 无 dist、无 tgz，Molis 仍指向主线旧 SDK，依赖安装尚未针对新 main 更新，旧安装不能算新候选验证。`preparation.json`、`molis-a0.patch` 与 `resume-commands.md` 已更新到本次真实基点。下一时段从 SDK build 继续，不重建消费者；默认测试除原范围外还需覆盖本次主线交互修复与 Issue 共存。正式来源、默认路径、合入与真实验收均未完成，D7 未解除。


**历史验证基准（上一轮无构建集成）**：再次 fetch 后 `origin/main=70c5298054da92eab9b2b8837fa18716a2ae1b3c`，同一消费树的 detached HEAD 已从 `385987c6ae3d06a13b4e3b987e6c5c5245c31ec2` 无损前移至它。原 A0 实现树仍为 9f9bda551 + 原已审差异，不冒称最新主线。当前在途 PR 仅 #180/#178/#156；#388–#391 的已合入内容全部保留，Goals 输入接受/移除仍由 Goals 拥有，不等同于 SDK S1 回执。

前移前保存消费者 full/staged/unstaged patch、状态、index 和 42 文件归档，以及原 A0 与 SDK 的暂存/未暂存差异，位置为 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/advance-385987c6a-to-70c529805`。仅在本消费者对备份 patch 做反向 `--index` 应用恢复旧基点，再 `git switch --detach` 新 main、`git apply --3way` 恢复 A0；没有 stash、提交、重置主检出或新建消费者。三方应用退出 0、无 unmerged 条目，无需人工选边。

逐项内容核对：

- A0 42 文件中，前移前后 40 文件字节相同（本次同步最新 spec 副本前）；另外两文件只吸收对应主线变化：`tests/model-thinking.test.ts` 两处增加 `templates: []`，A0 显式预算 900 的断言与 PA-22 注释保留；安全表只增加主线 S-17 管理入口身份拒绝测试，A0 S-13/S-22/S-23 与其他条目保留。之后唯一 spec 从原树同步为消费者验证副本，因此与前移备份相比共有 3 文件有可解释变化。
- 两基点之间 62 个主线文件中，排除上述两个重叠后的 60 文件逐字节等于新 HEAD；其中包含 Pages/灵光空白丢弃、actions/resource/API 快照和 Host 模板 owner/新出口。没有拿原 A0 树整片覆盖这些新事实。现行 A0 功能差异仍只占原 42 文件。
- 已读 `CONTRACT-CHANGES.md` 第 3 条与动作快照段并核实 PR #390 的固定引用影响说明：文档一处要求形状变化升版，另一处允许说明现版本引用不受破坏，表述不一致。#390 已解释可选字段与现有引用影响；这里只记录，不把它当 A0 阻塞，不修改 Claude 代码、合同规则或快照。
- 原 A0 已暂存差异与所有非 spec 未暂存差异、SDK 完整 staged/unstaged 源码与状态保持不变；SDK 候选仍未构建。消费者 HEAD、无冲突/空白错误、scope 与内容核对通过；文档、安全登记与产品子集只读检查均为 0 问题。这是集成静态证据，不是类型/默认路径或产品运行通过。

`preparation.json` 与 `resume-commands.md` 更新为真实新基准，`molis-a0.patch` 更新为新基点上的 42 文件差异；旧 patch 与状态仍在上述备份中可恢复。没有新建包哈希、没有打包或安装；本轮不等待/轮询资源、不跑 noEmit、已通过测试、SDK/产品/test-kit/隐式构建、浏览器、预览或全量。按统筹交代的全量/浏览器占用冻结交回；下一获准时段仍从 SDK build → 缺 dist 与 packaged-consumer → dirty 候选与离线 S1 消费 → 当前 Molis 默认路径验证继续。D7 仍需正式来源、默认验收与 main 合入。

以下保留上一轮 385987c6a 的准备记录，不代表现行消费树基点：

上一轮开工重新 fetch，`origin/main=385987c6ae3d06a13b4e3b987e6c5c5245c31ec2`（#386 Alchemist 模型可用性/Home 配置、#387 Feed 嵌套 Goals beforeEffect）。原实现树仍是 `9f9bda551402e1bee03f0646f55791e5cb0e31d6`，不是最新主干。两点间主线改动与 A0 42 文件无直接交集，规则/Agent Host/公共合同未变；#388 在途 Goals 输入接受/移除不带入，也不等同于 S1 SDK 输入回执。

独立临时消费树：`/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/molis-consumer`，detached HEAD 为上述 main，叠本线已审阅 scoped diff 和必要文档快照。本文仍只有本原实现树是可编辑事实源，临时树中的副本仅供安装/文档门禁验证，不另行维护进度。原 A0 的已暂存/未暂存内容保留；SDK 来源仍是 `/Users/yijunwang/code/prologue-a0-integration` 的 c4b9fde3 + 已接受完整 S1，不带题型/CU。准备记录、差异和候选包放在 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5`。

本轮先准备再等待资源；复用已有 Claude `build-lock.sh`，只参加同一个构建锁，不新造锁。该包装不能证明未参加者/全量/浏览器空闲，每次重命令前仍查真实进程；有界等待不超过约 10 分钟。SDK 构建、缺 dist 子进程用例、包消费者、离线 S1 消费和 Molis 默认路径按 §6.2 串行验证；结果在本节续记。正式 vendor 的干净来源与上游 main 要求不放宽，dirty 候选仅供临时树验证；合入/安装/真实验收仍各记事实，D7 未解除。

本轮实际准备结果：

- `git apply --check` 后将 A0 完整差异应用到临时消费树，与原实现树逐文件核对 42 文件一致；仅在临时树暂存这些文件，没有提交。主线新增的 Alchemist/Feed 内容保留，#388 未带入。原树已暂存内容未改，只有本文追加进度。
- 临时树 `pnpm install --frozen-lockfile --offline --ignore-scripts` 通过（`/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/molis-install-preparation.log`），当前装的仍是原主线 SDK；这不是候选包消费证据。同版本 `better-sqlite3@12.8.0` 的 arm64 原生模块从原 A0 安装复制，没有编译。
- SDK 基点、dirty:true 和 33 文件完整差异已保存为 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/sdk-source.json` 与 `prologue-a0-s1-source.patch`。没有生成 tgz，来源记录明确 `artifactStatus: not-built`，未捏造包哈希、最终提交或已合上游。
- `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-a0-package-validation-azs1pyf5/molis-a0.patch` 是此次应用的完整 scoped diff；`preparation.json` 记源/目标/基准，`original-status.txt` 保存准备时暂存状态；`resume-commands.md` 给出接续命令，`sdk-consumer/` 是待装包的空消费者目录。它们都是临时验证材料，需求与进度仍归本文。
- 有界等待/复查未获得时段：13:52 UTC 实际进程有全量 PID 469（integration-wave3-i1，约 6 分 45 秒）、另一全量 PID 40324（约 1 分 37 秒），以及构建 PID 48495/48548/50528。原始紧凑进程记录在 `resource-observation.log`。即使已有 build.lock 暂时空闲，全量仍禁止构建；未加入会绕过该条件的排队。
- **本轮未运行**：SDK build、4 项缺 dist 的复验、packaged-consumer、pnpm pack、空目录 S1 包消费、Molis candidate 依赖/锁切换、默认构建/定向/门禁/Coding 浏览器/全量。原因是共享重验证时段未释放；没有重复已通过的源码测试或 CU 预演。此前源码证据继续保留，A0 仍非功能可用，D7 未解除。

交回唯一统筹 `01a12a80-ede2-7b81-93ea-521a5abcc35c`：下次确认无全量/浏览器及独占构建时段后，从 SDK build 起按本节材料继续即可；不需要重新建立消费树或复制差异。若主线又前进，先核对新 main 与当前临时基点之间的实际文件，再无损准备下一基准。SDK/包/消费者证据齐备后才集中提交正式来源/上游采用的授权材料；没有执行提交、推送、PR、合并、发布、安装或真实 Home/凭据操作。
