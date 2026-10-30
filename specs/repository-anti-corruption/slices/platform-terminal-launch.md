# 平台的「启动终端」服务（S-103 · T-136）

状态：实现中（T-136）。S-103 行在 #1549（S-102）进 main 之后加。

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

次序：调用检查 → 输入检查 → 核一次 → `beforeEffect` → 核一次 → 选根（工作目录根读项目目录库）、`realpath` 根与目标、根内判断、`stat` 是目录，每次等待之后都核 → 取 PTY 宿主 → 派生面板号 → 最后核一次 → `spawn`。「核」= 实例在跑、持有 `terminal:run`（工作目录根另加 `workspace:read`）、原调用没取消没撤权。`spawn` 用的是解析后的真实路径，不再用插件给的 `path` 拼一次。

## 3. 不做

| 不做 | 去向 |
| --- | --- |
| 工作终端搬给 Goals、删 `web-panel*.ts` 与 control token 的 `spawn`、面板登记与续接会话接到服务上、「按运行时选程序」 | T-137 |
| `services.terminal.list` / `close` | T-137 若需要再加；页面要结束进程用页面终端的 `kill` |
| 沙箱包得到终端 | BL-910：终端进程跑在沙箱之外、带人的全部权限，要给须另有设计，先问用户 |
| Characters 的原生执行 | 平台自己的面，不是插件（RAC-70） |
| 页面一侧（插件框架的页面终端、`pty-socket.ts` 的页面检查、`pty-page-access.ts` 的主人记录） | PG-053 已统一；服务在插件调用里 `spawn`，主人照旧由页面终端的主人记录记下 |

## 4. S-103 的分句（写进 `docs/system/SECURITY-INVARIANTS.md` 时照这里）

1. 只有 Manifest 声明 `terminal:run` 的宿主运行插件（Home 实例与项目实例）有这项服务，没声明的没有；沙箱包声明了（必需或人批准的可选）在启动时以 `sandbox.service_not_given` 拒（S-60）。
2. 只能在本安装（同一半、同一世代）当次的、受众为 `user`、command、非只读、自己声明了 `terminal:run` 的动作里调用，否则 `actions.forbidden`；没批准的 `terminal:run` 让人的调用在内核就被拒；每次核安装在跑、持有 `terminal:run`、原调用没取消没撤权，`beforeEffect` 前后与每次等待之后都核，任何一处失败都不起进程。
3. 安装、项目、人只从调用上下文取；输入只认 `key`、`title`、`command`、`args`、`directory`，多一个键整个拒；面板号由平台按身份与 key 派生，页面只能附着同一身份的面板（S-47）。
4. 工作目录只能在两种根里：本次调用所在项目已关联的工作目录（另要 `workspace:read`；没有项目的调用、别的项目的 `workspace_id`、不存在的都拒），或本插件声明的主人文件目录（项目实例没有）；相对路径的空段、`.`、`..`、绝对路径、NUL、反斜杠拒，解析真实路径后逃出根（符号链接）或不是目录拒。
5. 程序是不含 NUL 的绝对路径，参数有界（至多 32 项、每项至多 4096 字符、无 NUL），否则 `actions.input_invalid`。
6. 停用、撤权、卸载、项目实例停止时，本激活经该服务起的进程全部结束；停了的激活留下的句柄：在动作之外调不回答也不起进程（BL-411），在新激活的动作里调以 `actions.forbidden` 拒。

**不覆盖**：`realpath` 与 `stat` 核过之后、`spawn` 之前，路径里的某一段被换成链接，进程可能落到根外。这是检查与使用之间的竞态，本片不修，测试也测不住；`spawn` 用的是解析后的真实路径。

## 5. 验收

都在 `tests/security-invariants-plugin-terminal-launch.test.ts`，除非另写。「不起进程」= 程序（一个把所在目录写进标记文件的脚本）的标记文件不存在，且平台按同一公式派生的面板没有在跑。

| 编号 | 条件 | 证明 |
| --- | --- | --- |
| RAC-2550 | 项目插件在本项目已关联工作目录的子目录里起终端，`pwd -P` 是它；面板号按身份派生；本插件本项目的页面能附着、写入，同项目的别的插件、别的项目的同一插件的页面附着被拒 | 新文件 |
| RAC-2551 | 没声明 `terminal:run`：Home、项目两种实例都没有 `services.terminal`；声明为可选、人没批准：调用被拒，不起进程 | 新文件 |
| RAC-2552 | 撤掉 `terminal:run`、停用、卸载、项目实例停止，各一例，之后面板不在了；旧激活的句柄在动作之外调不回答、在新激活的动作里调被拒，都不起进程 | 新文件 |
| RAC-2553 | 查询动作、只读调用（`query_only`、`read_only_effects` 各一例，内核在分派时就拒，到不了服务）、受众 `agent` / `workflow` / `mcp` / `plugin`（`plugin` 是本安装在任何动作之外调自己的动作，由服务拒）、动作没声明 `terminal:run`、在任何动作之外、在本插件另一个安装的动作里调，各一例，`actions.forbidden`，不起进程 | 新文件 |
| RAC-2554 | 别的项目的、不存在的 `workspace_id`；`..`、`sub/../..`、`/etc`、NUL、空段、`./sub`；链到根外的符号链接；文件；不存在的目录；没有主人文件；没持有 `workspace:read`；Home 实例无项目的调用——按第 4 条的码拒，不起进程 | 新文件 |
| RAC-2555 | 多一个键（`cwd`、`project_id`、`actor_id`、`install_id`、`env`，以及 `directory` 里多一个键）、相对或含 NUL 的程序、超过 32 项或含 NUL、非字符串、超长的参数、不合格式的 key、空或超长的标题、没有 `directory`、别的 `root`——`actions.input_invalid`，不起进程；两个不同的人、同一 key，面板号不同 | 新文件 |
| RAC-2556 | 目录解析卡在读项目目录库这一处等待时，撤 `terminal:run`、撤 `workspace:read`、取消原调用，各一例，`open` 被拒，不起进程 | 新文件 |
| RAC-2557 | 沙箱包声明必需的、或人批准了可选的 `terminal:run`，项目与 Home 两种启动都以 `sandbox.service_not_given` 拒、代码不跑；`HOST_SERVICE_PERMISSIONS` 的 `terminal` 被 S-60 的分类用例认作拒绝 | 新文件；`tests/security-invariants-sandbox-services.test.ts`（S-60 RAC-238 表里的两例） |
| RAC-2558 | 双实例插件：项目一半的句柄在 Home 一半的动作里调被拒；本半自己的动作越过实例检查、停在输入检查 | `tests/dual-instance-services.test.ts` |
| RAC-2559 | 回归：Shelf 走新形状照旧在主人文件目录里起程序、重开附着同一进程、停用后结束 | `tests/security-invariants-plugin-terminals.test.ts` |
