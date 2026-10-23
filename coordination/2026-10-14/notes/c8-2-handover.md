# C8-2 交接（③，10-22）

分支 `migrate/c8-2-coding-executor`，已推送，PR #987（https://github.com/molis-ai/molis-work/pull/987），10-22 移交 ⑤。功能提交 7c36b300b，用 merge 合入了 main 6d2361652，无冲突，之后重跑相关测试都通过。

## 做了什么

- Coding 用 SDK 的 `defineWorkExecutorActions` 发布了六个执行方角色：`coding.executor.state`、`.session.open`、`.session.read`、`.session.update`、`.run.start`、`.run.control`。每个都是 v1，只对本人开放（audiences `["user"]`），Agent 与 MCP 都找不到它们。
- `run.start` 声明了 `scheduling: "concurrent"` 和 `cost: metered`，与 `coding.runs.start` 一致。权限也照 Coding 原有动作给。

## 决定：用新 id，不给旧动作升版本

协议要求的 schema 是封闭的，必须与规范 schema 完全相同。Coding 原有的六个动作（`coding.state`、`sessions.*`、`runs.start`、`runs.control@7`）同时是页面路由的动作和 MCP 工具名，形状不能换成协议的。

所以角色用了新 id。原有动作的 id、版本和形状都不变，不需要升版本。动作快照只多了这 6 行，其余不变。

## 怎样接到 Coding 自己的代码

- `codingRouteEntry` 新增了 `action(definition, handle)`。它绑定的是一个 owner 动作，围栏与路由动作相同：调用方的检查、动作自己的权限、本次激活。
- 角色在进程内调用路由的处理器（`call.routed(route_id, request)`），用的是角色自己的围栏。没有经过另一个动作，因此不触发 S-43 的委托，也不会遇到 user-only 动作拒绝插件调用的问题。
- 带 mode 的 `session.open` 和 `session.update`，会把下一轮的设置写到页面保存的同一个位置（`configuration:<session_id>`，经 `coding.update-session` 的处理器）。
- `run.start` 走 Coding 自己的 start 路径，并使用这些设置。会话没有设置时用 Coding 的默认值：execute、第一个模型、当前目录。用过的默认值会写回会话。
- `state.modes` 只给五种：讨论、规划、修改、执行、评审。协作和并行写入要先在页面上设置，所以不提供；收到时报 `coding.executor_mode_unknown`。
- 缺模型或缺工作目录时报 `coding.executor_unprepared`。这个检查放在建会话之前，被拒时不会留下会话。

## 与在途 PR 的重叠

- **#934、#936**（yijunw0212）也改 `route-entry.ts` 和 `routes.ts`：`execute` 增加了 locale 参数和 `ports.ready()`。我这边的改动都是新增，没有碰 `routes-sessions.ts` 和 `routes-timeline.ts`。后合入的一方要调整 `action()` 里那一处 `execute(...)` 调用。
- **#963** 也改 `privileges.md` 和 `ci-product-subset.txt`，但改的是不同的行，不冲突。

## 测试

`tests/coding-work-executor.test.ts`（W5-01-CODING-70..79），已加入 CI 产品子集，本机约 12 秒。覆盖：

- 按类型找到角色；只对本人可见；SDK 的检查通过；
- 缺模型时被拒，且不留下会话；
- `state`；
- 带 mode 新建会话后，页面自己的读取能看到同一份设置；
- 改方式、各类拒绝；
- 真实一轮：角色发起后，页面上能看到；补充有回执，且只带三个字段；`stop` 被接受；`session.read` 与页面一致。

本机还跑过这些，都通过：

- 相关的 18 个文件（`coding-actions`、`action-contract-snapshot`、`assistant-coding-executor`、`work-executor-protocol`、`ci-product-subset`、Coding 装配与效果控制、改过的夹具的使用者等）；
- 健康门禁 `--base origin/main`；
- `boundary:check`；
- `secrets:check`；
- 对改动文件的 Biome 检查。

整包 `pnpm build` 在 local-host 的 Swift 那一步失败，是已知的本机 CLT 问题。我只单独建了需要的包。

## 给 C8-3

现在可以把助理切到按角色找执行方：

- 用 `workExecutorRoleOf(row.action)` 在目录里找，提供方为 Coding。
- 角色给出的方式名与 `assistant-island.ts` 现有的方式表一致。
- `tests/fixtures/coding-product-host.ts` 现在还返回 `host`，可以直接用 `host.actionClient(...)` 调用角色。

未涉及共享核心（只改了 `plugins/native/coding`、测试、spec 一行和动作快照），所以不进批次，直接交给 ⑤。
