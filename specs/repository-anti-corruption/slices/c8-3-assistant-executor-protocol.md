# C8-3：助理按执行方协议选执行方，删 `assistant-coding.ts`

状态：2026-10-24，`claude/ac-coding-93b25f` 上做完，等 PR 评审与统筹跑全量（本机没有跑浏览器用例和全量）。真实 Home 的助理库 2→3 维护没有执行，脚本与演练在本片，执行归维护八。

## 目标、证据与边界

PG-036 的 C8-3：助理把一项工作交给哪个插件，只看插件有没有发布工作执行方协议（`packages/contracts/src/platform/work-executors.ts` 的六个角色），不再靠 `apps/local-host/src/assistant/assistant-coding.ts` 里写死的 `coding.*` 动作名、工作种类 `"coding"` 和 `io.molis.work.coding`。C8-2（#987）已让 Coding 用 `defineWorkExecutorActions` 发布了这六个角色（`coding.executor.*`），本片把助理接到协议上。

只改助理对执行方的选取、记录与调用，不改 Coding 自己的页面和动作（`coding.state`、`coding.sessions.*`、`coding.runs.*` 的 id、版本、形状都不动，动作快照没有变化）。Coding 的 `coding-surface.ts` 和 HYBRID 清单是下一片（C9）。

## 方案与取舍

- **找执行方。** `executorProviders(views)` 在项目的动作目录里按每个角色的 `input_type`/`output_type` 找，同一个提供方六个角色齐全、每个都对 `user` 开放、带 `plugin_id`，且 `session.open` 声明了会话的主体种类，才算一个执行方。缺角色、只对 Agent 开放、没有 `plugin_id`、没声明会话种类的都不在清单里。`offerExecutors` 读每个执行方自己的 `state`（方式、缺省方式），不可用的带原因返回。
- **记住执行方。** 一项工作的执行方是 `{ kind: "plugin", plugin_id, title, session_id, mode? }`，按 `plugin_id` 记。每次调用在当前目录里重新找：插件停用、卸载、撤权、少了角色就以 `assistant.executor_unavailable` 拒绝，不换别的提供方，没有“默认执行方”。取舍：不记动作 id，因为动作 id 是插件自己的事，换版本或改名不该让一项进行中的工作断掉；不记提供方 id，因为同一个插件的提供方 id 不是稳定合同。
- **会话关联。** 工作与执行方会话的关联种类取 `session.open` 声明的第一个主体种类（Coding 是 `coding_session`，与以前相同，所以存量关联不用改）。交回助理的工作，用关联的种类去目录里找回它原来的提供方，找不到就没有会话部分，不猜。
- **调用。** 全部走 `WorkExecutor`（`assistant-executor.ts`），只调六个角色；一轮用 `run.start` 返回的 `run_id`；补充、回答、撤回、停止都走 `run.control`。调用以本人客户端发出，S-51 不变（`dispatchControl`）。
- **选择入口。** `GET /api/assistant/executors` 返回 `AssistantExecutorOffer[]`；`POST /send` 的 `executor` 是 `{kind:"assistant"} | {kind:"plugin", plugin_id}`，`executor_session_id` 取代 `coding_session_id`；`POST /works/:id/handover` 的 `to` 同形。浏览器里的执行方清单、方式表、转交按钮都从这个清单来，页面事件 `molis:assistant-effect` 的 `capability_id` 取清单里的 `capability_ids`，不写 Coding 的动作 id。
- **库版本。** 助理库 2→3：工作正文的执行方改记插件标识，轮次的 `executor` 由 `"coding"` 改为 `"plugin"`，已发送请求的结果（`assistant_requests.result`，同一个请求标识再发会原样取回，完成的行不删）里的 `work.executor` 同工作正文那样改。表不变。读取不翻译旧值（`docs/system/CONTRACT-CHANGES.md`：现在不留兼容期），版本不符就拒；真实 Home 要先跑维护脚本 `tests/fixtures/assistant-maintenance-v3.sql`。
- **没做的。** 助理的“个人工作”没有执行方（执行方在项目里工作）；执行方不能带图片的限制沿用原来的拒绝；Alchemist 与创作台不动。

## 验收标准

- **RAC-430**：清单只列六个角色齐全的提供方，方式取自它自己的 `state`；缺一个角色的不在清单里，个人范围没有清单。证明：`tests/assistant-executor.test.ts`。
- **RAC-431**：工作按 `plugin_id` 记着执行方；它不再提供协议时拒绝，不换另一个提供方顶替。证明：`tests/assistant-executor.test.ts`。
- **RAC-432**：新工作按插件标识点名执行方；没有人提供的标识在建工作之前就拒，不留下工作。证明：`tests/assistant-executor.test.ts`。
- **RAC-433～439**：保留，本片未用。
- **RAC-440**：看起来像、其实不是执行方的（缺角色、只对 Agent 开放、没有 `plugin_id`、没有会话种类）不在清单里，点名也拒，它的动作一个也不调。证明：`tests/security-invariants-assistant-executor.test.ts`（S-62，暂定号）。
- **RAC-441**：不可用的执行方在清单里带原因，点名也拒，除读 `state` 之外它的角色一个也不跑，不留下工作。证明：同上。
- **RAC-442**：执行方不见了：续发、再次转交都被拒，不记新的一轮、不连新的对象，也不调别的提供方。证明：同上。
- **RAC-443**：`assistant-coding.ts` 已删，助理目录的源码里没有 Coding 的插件标识、动作名、工作种类。证明：同上（源码扫描）。
- **RAC-444**：助理库基线是版本 3，版本 2 的库不翻译着读，开库即拒。证明：同上。
- **RAC-445**：真实 Home 里助理用协议找到 Coding，清单里的方式是 Coding 自己 `state` 给的五种。证明：`tests/assistant-executor-product.test.ts`。
- **RAC-446**：真实 Home 里按插件标识把新工作交给 Coding，会话在 Coding 的页面里能看到，方式与那一轮都一致。证明：同上。
- **RAC-447**：版本 2 的助理库开库即拒；维护后工作、轮次和已发送请求的结果都改记插件标识（库里没有旧种类），库以版本 3 打开，内容不变，同一个请求标识再发取回的结果是现行形状。证明：`tests/assistant-maintenance-v3.test.ts`。
- **RAC-448**：版本不对和中途失败（工作、轮次、请求结果三处各一次）整笔回滚。证明：同上。
- **RAC-449**：保留。

其余沿用的行为（方式记在执行方会话、补充走 `run.control`、RCPT-368 来源、RC-06 排队与回答版本、RC-14 去向、认领已有会话、转交带的说明与文件、跟进删除）由 `tests/assistant-executor.test.ts` 用一个不是 Coding 的协议插件重新断言，原断言一条没有放宽。

## 对调用方的影响

- 合同 `contracts/services/assistant`（API 快照已刷新）：`AssistantExecutor` 的 `coding` 种类改为 `plugin`（带 `plugin_id`）；新增 `AssistantExecutorChoice`、`AssistantExecutorOffer`；`AssistantRound.executor`、`AssistantWorkSurroundings.environment.executor` 与 `tools.executor`、`AssistantSendInput.executor`/`executor_session_id`、`AssistantHandover.to` 随之改。
- HTTP：新增 `GET /api/assistant/executors`；`/send`、`/works/:id/handover` 的请求体按上改。没有别的调用方：成果库的“交给 Coding”（`plugins/native/artifacts/src/handoff-client.ts`）发的页面消息里 `executor` 现在是插件标识 `io.molis.work.coding`。
- 助理库版本 2→3，见上与 `spec.md` §4.1 的维护清单。

## 与在途 PR 的重叠

#1130（`assistant-island.ts`）、#1064（`assistant-coding.ts` 与 `runs.control` v8）、#1157/#1153/#1139（`assistant-service.ts`）。后合入的一方在 `assistant-service.ts` 里把对 `CodingExecutor`/`coding()` 的引用改成 `WorkExecutor`/`executorOf`。

## 验证

本机：`apps/local-host` 的 `tsc`、工作台与合同、Coding 和 artifacts 包的构建；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`pnpm secrets:check`、`node scripts/gates/page-assets.mjs --base origin/main`（工作台脚本涨 311 字节，已按先例一次性放行，理由写在 `scripts/gates/page-assets.mjs`）；翻译门禁；35 个直接相关的非浏览器用例和 `tests/assistant-*` 新用例。没有跑浏览器用例和全量。
