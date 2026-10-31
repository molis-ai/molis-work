# 平台的「启动终端」服务（S-103 · T-136）

状态：T-136 已批可合（#1640），S-103 行已写进 `docs/system/SECURITY-INVARIANTS.md`；T-137 实现中，叠在 T-136 上（第 6 节），第 4 节第 3、5 条的改写与第 8 条随 T-137 写进 S-103 行，第 7 条随 T-148。

用户 2026-10-30 裁定（#1332）：平台加一个「启动终端」服务，任何宿主运行的插件按安装授权可用，新 S 号；本片把服务立起来、把边界写成 S-103。工作终端搬过去、删旧路（`/api/goals/:id/panels`、control token 上的 `spawn`）、关 BL-637 / BL-695 / BL-508 是 T-137。

## 1. 之前

- `services.terminal` 只在 Home 实例里建（`apps/local-host/src/home-plugin-executor.ts`），要求插件有主人文件，工作目录写死成主人文件根；
- 项目实例（`apps/local-host/src/plugin-host-services.ts` 的 `openHostSession`）没有这项服务；
- 所以在项目工作目录里起终端的（Goal 的工作终端）只能走工作台的 control token 通道（BL-695）。

## 2. 做法

`services.terminal` 是 Runtime SDK 服务，不登记成动作：能被动作目录看见、被授权的是插件自己的那个动作（例如 `shelf.terminal.open@1`，声明 `terminal:run`、受众只有 `user`），服务只是它的效果端口（`specs/action-architecture/spec.md` §3「注册一次」）。

| 部分 | 在哪 |
| --- | --- |
| 合同：`PluginTerminalClient.open({ key, title, command, args?, directory })`、`PluginTerminalDirectory` | `packages/contracts/src/platform/plugin-host-services.ts` |
| 服务：调用检查、输入检查、目录解析、派生面板号、停用时结束进程 | `apps/local-host/src/plugin-terminal-service.ts`（`pluginTerminalFor`） |
| 装配：Home 实例与项目实例都建，`dispose`、`revoke` 都结束本激活起的进程 | `apps/local-host/src/home-plugin-executor.ts`、`apps/local-host/src/plugin-host-services.ts` |
| 权限名一处：`HOST_SERVICE_PERMISSIONS.terminal`、`TERMINAL_RUN_PERMISSION` | `apps/local-host/src/plugin-service-permissions.ts` |
| 沙箱不给：`SANDBOX_SERVICE_FATE.terminal` 是 `refused`，`SANDBOX_NOT_GIVEN` 有 `terminal` 一行 | `packages/plugin-sandbox/src/services.ts` |
| 唯一现存调用方 Shelf 改成新形状（`directory: { root: "owner_files" }`），不留兼容期 | `plugins/native/shelf/src/home-plugin.ts` |

次序：调用检查 → 输入检查 → 核一次 → `beforeEffect` → 核一次 → 选根（工作目录根读项目目录库）、`realpath` 根与目标、根内判断、首尾无空白、`stat` 是目录，每次等待之后都核 → 取 PTY 宿主 → 派生面板号 → 最后核一次 → `spawn`。「核」= 实例在跑、持有 `terminal:run`（工作目录根另加 `workspace:read`）、原调用没取消没撤权。`spawn` 用的是解析后的真实路径，不再用插件给的 `path` 拼一次；参数用的是检查过的那份拷贝。PTY 宿主会把程序和工作目录 trim 一次再用（`horizontal/runtime-host/src/adapters/terminal-pty.ts`），所以 trim 前后不同的，服务直接拒，不改宿主（二审必修 1）。中间几次「核」是纵深防御：撤权会先停实例，最先答的是实例检查；RAC-2556 证明的是 `spawn` 之前至少有一道会拒。

## 3. 不做

| 不做 | 去向 |
| --- | --- |
| 工作终端搬给 Goals、面板记录、「按运行时选程序」、`list` / `close` | T-137（第 6 节） |
| 删 `web-panel*.ts` 与 control token 的 `spawn`、MCP 续接改接新表、工作台窗格改走 Goals 路由、删旧表 | T-148 |
| 沙箱包得到终端 | BL-910：终端进程跑在沙箱之外、带人的全部权限，要给须另有设计，先问用户 |
| Characters 的原生执行 | 平台自己的面，不是插件（RAC-70） |
| 页面一侧（插件框架的页面终端、`pty-socket.ts` 的页面检查、`pty-page-access.ts` 的主人记录） | PG-053 已统一；服务在插件调用里 `spawn`，主人照旧由页面终端的主人记录记下 |

## 4. S-103 的分句（写进 `docs/system/SECURITY-INVARIANTS.md` 时照这里）

1. 只有 Manifest 声明 `terminal:run` 的宿主运行插件（Home 实例与项目实例）有这项服务，没声明的没有；沙箱包声明了（必需或人批准的可选）在启动时以 `sandbox.service_not_given` 拒（S-60）。
2. 只能在本安装（同一半、同一世代）当次的、受众为 `user`、command、非只读、自己声明了 `terminal:run` 的动作里调用，否则 `actions.forbidden`；没批准的 `terminal:run` 让人的调用在内核就被拒；每次核安装在跑、持有 `terminal:run`、原调用没取消没撤权，`beforeEffect` 前后与每次等待之后都核，任何一处失败都不起进程。
3. 安装、项目、人只从调用上下文取；输入只认 `key`、`title`、`program`、`subject`、`directory`，多一个键整个拒；面板号由平台按身份与 key 派生，页面只能附着同一身份的面板（S-47）。
4. 工作目录只能在两种根里：本次调用所在项目已关联的工作目录（另要 `workspace:read`；不写 `workspace_id` 就是项目的首选工作目录；没有项目的调用、别的项目的 `workspace_id`、不存在的都拒），或本插件声明的主人文件目录（项目实例没有）；相对路径的空段、`.`、`..`、绝对路径、NUL、反斜杠拒，解析真实路径后逃出根（符号链接）、首尾有空白（终端宿主会 trim，`<root>/sub ` 会落到 `<root>/sub`）或不是目录拒。
5. 程序是平台的运行时配方（`program.runtime`，未知的拒），或 `program.command`：不含 NUL、首尾无空白的绝对路径，或只含 `[A-Za-z0-9._+-]` 的命令名（由平台在自己的 PATH 上解析成绝对路径，找不到答 `actions.unavailable`），不经 shell；参数先读一次长度（须是 0 到 32 的整数：Proxy 过得了 `Array.isArray`，它的 `length` 每次读可以答不同的值），循环只用这个值，按下标拷成普通数组，检查这份拷贝（至多 32 项、每项是至多 4096 字符、无 NUL 的字符串），起进程也用它（稀疏数组、自定义迭代器、下标 getter 换不掉）；否则 `actions.input_invalid`。
6. 停用、撤权、卸载、项目实例停止时，本激活经该服务起的进程全部结束；停了的激活留下的句柄：在动作之外调不回答也不起进程（BL-411），在新激活的动作里调以 `actions.forbidden` 拒。
7. （T-148）`/pty` 上任何连接都只能附着服务端已经建好的面板：`spawn` 必须 `attachOnly: true`，只许五个键，否则报错、不起进程。
8. 终端的记录只对本安装、本项目、本人可见，也只能由他们关闭：`list` 只回这些行，`close` 别人的 key 答 `actions.missing`；一个 key 只属于开它时的 `subject`，换了 `subject` 不论在跑与否都答 `actions.conflict`；同一 key 在跑就附着（不比程序），停了就按记下的程序重起，重起时换程序答 `actions.conflict`；重起不重新绑定运行时的工作上下文，首选工作目录换过后，绑定里的 `workspace` 仍是第一次打开时的；被拒的调用不留记录（记录、绑定、项目事件与 `spawn` 在同一个目录库事务里，事务里先核一次）。一个安装、项目、人与 key 只有一行：面板号由这四项派生、是主键，所以表上不另加 UNIQUE。终端环境里的 `MOLIS_WORK_*` 变量正好是平台那一组：宿主进程自己的（`MOLIS_WORK_ENCRYPTION_KEY`、`MOLIS_WORK_SECRET_BACKEND`、测试开关）原先经登录 shell 的环境带进终端，T-137 二审建议的断言把它测了出来，`buildPtyEnvironment` 不再带入（RAC-2564）。

**不覆盖**：`realpath` 与 `stat` 核过之后、`spawn` 之前，路径里的某一段被换成链接，进程可能落到根外。这是检查与使用之间的竞态，本片不修，测试也测不住；`spawn` 用的是解析后的真实路径。

## 5. 验收

都在 `tests/security-invariants-plugin-terminal-launch.test.ts`，除非另写。「不起进程」= 程序（一个把所在目录写进标记文件的脚本）的标记文件不存在，且平台按同一公式派生的面板没有在跑。

| 编号 | 条件 | 证明 |
| --- | --- | --- |
| RAC-2550 | 项目插件在本项目已关联工作目录的子目录里起终端，`pwd -P` 是它；面板号按身份派生；本插件本项目的页面能附着、写入，同项目的别的插件、别的项目的同一插件的页面附着被拒 | 新文件 |
| RAC-2551 | 没声明 `terminal:run`：Home、项目两种实例都没有 `services.terminal`；声明为可选、人没批准：调用被拒，不起进程 | 新文件 |
| RAC-2552 | 撤掉 `terminal:run`、停用、卸载、项目实例停止，各一例，之后面板不在了；旧激活的句柄在动作之外调不回答、在新激活的动作里调被拒，都不起进程 | 新文件 |
| RAC-2553 | 查询动作、只读调用（`query_only`、`read_only_effects` 各一例，内核在分派时就拒，到不了服务）、受众 `agent` / `workflow` / `mcp` / `plugin`（`plugin` 是本安装在任何动作之外调自己的动作，由服务拒）、动作没声明 `terminal:run`、在任何动作之外、在本插件另一个安装的动作里调，各一例，`actions.forbidden`，不起进程 | 新文件 |
| RAC-2554 | 别的项目的、不存在的 `workspace_id`；`..`、`sub/../..`、`/etc`、NUL、空段、`./sub`；链到根外的符号链接；名字以空格结尾的目录 `trail `（旁边的 `trail` 链到根外）；文件；不存在的目录；没有主人文件；没持有 `workspace:read`；Home 实例无项目的调用——按第 4 条的码拒，不起进程 | 新文件 |
| RAC-2555 | 多一个键（`cwd`、`project_id`、`actor_id`、`install_id`、`env`、写在 `program` 外面的 `command` 与 `args`，以及 `directory`、`program` 里多一个键）、没有 `program`、`runtime` 与 `command` 都写、未知的 `runtime`、`runtime` 带参数、空或超长的 `subject`、相对（`./term`）、含 NUL 或首尾带空白（空格、换行）的程序、超过 32 项或含 NUL、非字符串、超长、稀疏的参数、`length` 先答 0 后答 40 的 Proxy 参数、不合格式的 key、空或超长的标题、没有 `directory`、别的 `root`——`actions.input_invalid`，不起进程；自定义迭代器（产出 1000 个含 NUL 的参数）、第二次读答 NUL 的下标 getter——照检查过的参数起进程；两个不同的人、同一 key，面板号不同 | 新文件 |
| RAC-2556 | 目录解析卡在读项目目录库这一处等待时，撤 `terminal:run`、撤 `workspace:read`、取消原调用，各一例，`open` 被拒（撤权两例答实例已停止的 `actions.forbidden`，取消一例答原调用的中止），不起进程；中间各次检查是纵深防御，这里证明 `spawn` 之前至少有一道会拒 | 新文件 |
| RAC-2557 | 沙箱包声明必需的、或人批准了可选的 `terminal:run`，项目与 Home 两种启动都以 `sandbox.service_not_given` 拒、代码不跑；`HOST_SERVICE_PERMISSIONS` 的 `terminal` 被 S-60 的分类用例认作拒绝 | 新文件；`tests/security-invariants-sandbox-services.test.ts`（S-60 RAC-238 表里的两例） |
| RAC-2558 | 双实例插件：项目一半的句柄在 Home 一半的动作里调被拒；本半自己的动作越过实例检查、停在输入检查 | `tests/dual-instance-services.test.ts` |
| RAC-2559 | 回归：Shelf 走新形状照旧在主人文件目录里起程序、重开附着同一进程、停用后结束 | `tests/security-invariants-plugin-terminals.test.ts` |

## 6. T-137：工作终端交给 Goals

统筹批（#1332 6538063811）：环境变量改名 `MOLIS_WORK_FOCUS_ID`（取值是 `subject`，读的一侧同片改，不留旧名）；记录表进目录库 v1（等 #1633 合入后 merge 进来）；BL-121 ② 的删除先合，推进提示不收 `feed_item_id`；拆成 T-137 / T-148；`workspace_id` 可选。

| 部分 | 在哪 |
| --- | --- |
| 合同：`open({ key, title?, program, subject?, directory })` 回 `{ panelId, started }`；`list({ subject? })`；`close({ key })`；`PluginTerminalProgram`、`PluginTerminalPanel` | `packages/contracts/src/platform/plugin-host-services.ts` |
| 运行时配方（命令名、续接参数、显示名）只此一份，桌面壳也读它 | `apps/local-host/src/plugin-terminal-runtimes.ts` |
| 记录表 `plugin_terminal_panels`、`plugin_terminal_panel_aliases`（目录库，`project_id` 可空；不存工作目录、不存在跑与否），`aliasSession` 记下运行时的会话（MCP 的调用方 T-148 改接） | `apps/local-host/src/plugin-terminal-panels.ts`、`catalog-schema.ts`、`project-catalog.ts` |
| 服务：记录、绑定运行时工作上下文、项目事件与 `spawn` 在一个目录库事务里；PATH 在事务之前读；平台的一组环境变量（`MOLIS_WORK_HOME`、`MCP_AUDIENCE=runtime`、`RUNTIME_ID`、`WORK_CONTEXT_ID`、`WORK_CONTEXT_STABLE`、`PANEL_ID`、`FOCUS_ID`、`WEB_URL`、`TERM`、`COLORTERM`） | `apps/local-host/src/plugin-terminal-service.ts` |
| 删项目时项目里还有在跑的插件终端照旧拒删，记录随项目清掉 | `apps/local-host/src/project-deletion-service.ts`、`project-catalog.ts` |
| Goals：四个动作（`goals.terminal.list@1`、`open@1`、`close@1`、`prompt@1`，只给 `user`）、四条路由（`/goals/:goalId/terminals` GET/POST、`/goals/:goalId/terminals/:key` DELETE、`/goals/:goalId/advance-prompt` GET）；父 Goal 只读（`goals.terminal.read_only`）；推进提示从桌面壳搬来（`goalAdvancePrompt`），项目指引经 `goals.guidance.read` 以调用者读（实时策略照旧管住提示），推进提示暂不带 Feed 关联原文：`feed.goals.context@1` 只给 `user`，Goals 以人的身份委托出去的调用算 `workflow` 受众，不给它加受众（统筹答，#1332 6538636605），通路记 BL-911 | `plugins/native/goals/src/terminal-actions.ts`、`http/terminals.ts`、`plugin.ts`、`manifest.ts` |
| 宿主的推进提示处理器、`apps/desktop/src/advance-prompt.ts` 删掉；工作台改调 Goals 的路由 | `apps/local-host/src/web-panel*.ts`、`apps/workbench/src/terminal/client-prompt.ts` |
| Shelf 改成 `program: { command }`；换了终端 Agent 后旧会话已结束时，关掉旧记录再开 | `plugins/native/shelf/src/home-plugin.ts` |

| 编号 | 条件 | 证明 |
| --- | --- | --- |
| RAC-2562 | Goals 的 `open` 用配方在项目首选工作目录起程序（`MOLIS_WORK_FOCUS_ID` 是 Goal），Goals 的页面附着、写入；同一 key 在跑就附着；另一个 Goal 拿这个 key 去 `open`，在跑与停了都答 `actions.conflict`、什么都不起；父 Goal 拒（`goals.terminal.read_only`）；别的项目的 `workspace_id` 拒；`runtime` 与 `command` 二选一、未知配方、多余的键答 400；关掉之后列表为空、再关 404 | `tests/goals-terminal.test.ts` |
| RAC-2563 | 四个 Goals 终端动作对 `agent`、`workflow`、`mcp` 调用方都在动作网关拒（`actions.forbidden`），不起进程；受众声明只有 `user`（插件的调用方由宿主签发，测试造不出，造的会先以 `host.plugin_caller_invalid` 拒） | `tests/goals-terminal.test.ts` |
| RAC-2564 | 命令：`a;b`、`../x`、`x/y`、`.`、`..`、带空格的名字拒，PATH 上没有的名字答 `actions.unavailable`，都不起进程；PATH 上的名字照常起；环境变量就是平台那一组，`MOLIS_WORK_*` 的键正好是这一组（宿主进程自己的不带入），`MOLIS_WORK_GOAL_ID` 没有；不写 `workspace_id` 在首选工作目录里起 | `tests/security-invariants-plugin-terminal-launch.test.ts` |
| RAC-2565 | `aliasSession` 记下会话号之后进程退出，同一 key 再 `open`，以配方的续接参数重起；换成别的程序答 `actions.conflict`，不起进程 | `tests/goals-terminal.test.ts` |
| RAC-2569 | 别的人、本插件的另一个安装 `list` 看不到、`close` 答 `actions.missing`（进程照旧在跑）；本人关掉后列表为空；Home 实例的记录 `project_id` 为空，项目不算它 | `tests/security-invariants-plugin-terminal-launch.test.ts` |

RAC-2560、2561、2566～2568 随 T-148。
