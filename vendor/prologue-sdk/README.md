# Prologue SDK 构建来源

## 当前依赖：assistant（2026-09-28，系统级个人助理 + network-dispatch）

`prologue-sdk-0.0.0-rc.1-assistant.tgz`。把 main 的 network-dispatch 与系统级个人助理需要的两项 SDK 改动放进同一个包，取代 `network-dispatch.tgz` 与只在助理分支用过的 `app-mode.tgz`。

- **network-dispatch**（来自 main 21cdfbf8，见下节）：`beforeNetworkDispatch` 覆盖 Node Host 每次真实 fetch；MCP 未派发时取消按 `CANCELLED` 收尾。
- **workspace "app"**：`startAgentRun({ workspace: "app" })` 没有授权根，只用会话包工具和不碰工作区的系统工具（`APP_MODE_SYSTEM_TOOLS = ["ask-user", "update-todo", "find-tools", "context-remaining"]`），`toolNames` 必须显式给出；文件与命令工具、根、执行器、子任务、技能、MCP、挂载、工作区上下文在起跑时拒绝（`AGENT_START_INVALID`）；写入类包工具照常走副作用链审批。系统工具执行器的根与 mutator 变为可选。个人助理在没有项目目录时也能使用业务能力。
- **session-stop 钩子**：一次 Run 正要自然收工时触发，载荷 `{ session, run, text }`；钩子 `deny` 时保留原回答、放入理由、接着跑，发 `model-response-repair`（reason `stop-held`）；一次 Run 最多挡两次；没有登记钩子时行为不变。Molis 用它实现“只说不做自动续做一次”（Host `announce-guard.ts`，仅限可写角色）。
- 源码：本机 `~/code/prologue-assistant` 分支 `feat/molis-assistant-app-mode`：`03c6ba0b`（dispatch-denied）→ `6f530d5a`（app 模式）→ `22a1be08`（session-stop）→ `4702abe3`（并入 network-dispatch 在 03c6ba0b 之后的增量）。完整补丁 [assistant.patch](assistant.patch) 相对 `af7375c7`。尚未推送到 molis-ai/prologue。
- 重建：检出 `af7375c7`，应用 `assistant.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`；在 `packages/sdk` 执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-assistant.tgz`。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`。SHA-256：`22265b9165486a265cacbed3b080f8b172a0e161b7e718da3220e7d01a9301a5`。
- 验证：`app-mode.live`、`dispatch-denied.live`、`network-dispatch-authority.live` 12/12 通过；SDK 全量 3348 项：3328 通过、20 跳过，`host-storage-full.live` 一个文件在全量负载下失败、单跑 2/2 通过；类型检查无错。

**本目录只放两份包**（2026-09-28 起，仓库防腐整理 D-03）：当前依赖 `prologue-sdk-0.0.0-rc.1-assistant.tgz`，以及 Codex 分支 `feature/personal-work-assistant` 仍在用的 `prologue-sdk-0.0.0-rc.1-compaction-growth.tgz`。下文各历史包的 tgz 已删除（发布包本就不含它们），各节的 `.patch` 与重建步骤保留。需要旧包时从删除前的提交取出，例如：

```bash
git show d9fe0a5e:vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-claims.tgz > vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-claims.tgz
```

下文写着"保留以便回退""保留用于回溯"的地方，都按上面这条从 git 历史取。换新包时把旧的当前包一并删掉，不再在这里累积。

## 上一依赖：network-dispatch

上一依赖为 `prologue-sdk-0.0.0-rc.1-network-dispatch.tgz`（2026-09-28，已并入上面的 assistant 包）。沿用 claims 的全部能力，新增可信 App 的 `beforeNetworkDispatch`，覆盖 Node Host 每次真实 fetch（包括 MCP 和重定向）；现有 `beforeModelDispatch` 仍只针对模型，两者同时提供时都执行。回调可拒绝当前请求，不能放宽 Host 网络政策。

- 源仓库：<https://github.com/molis-ai/prologue>。源码基线为已提交的 `af7375c74a2e551184c443e2a5e06e105168fed3`；增量 [network-dispatch.patch](network-dispatch.patch) 包含其后已提交的 `03c6ba0b24ddd46ff1cd0f604e3e2bcb134687c2`（拒绝不算网络故障、不重试或切换模型）及本轮未提交的网络回调、MCP 取消收尾和真实 HTTP 回归。没有纳入其他 SDK 工作树的未提交功能。
- MCP 在尚未真实派发时取消，按 Host inspect 的事实返回 `CANCELLED`，不发送多余取消通知；已派发或事实不可读仍保留需对账状态。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`。SHA-256：`7ee09e00ef074b761c0d44a86a7d357e11485ea26868f3e77fb99ed757ae384e`。
- 重建：检出 `af7375c7`，应用 `network-dispatch.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`；在 `packages/sdk` 执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-network-dispatch.tgz`。补丁已在干净 af7375c7 工作树检查可应用。
- SDK 构建通过；网络授权、拒绝语义、MCP HTTP、有界推理 **32/32** 通过。518 个 dist 文件在构建、包和实际安装中逐文件一致。SDK 全量测试类型检查仍有 `agent-compaction-public.test.ts` 两处旧参数错误；干净 af7375c7 上同样复现，不能称为全量类型通过。
- 应用侧把同一动作和父运行的持续授权按调用作用域传到该回调；取消信号通过 SDK 公开 ToolAbort 口进入传输。真实授权/撤权、取消、恢复与应用回归记录见 [main 复查报告](../../specs/action-architecture/review-2026-09-28.md)。

源码补丁随本仓库保存，未另行提交到 Prologue 源仓库或发布 npm；旧包可从 Git 历史恢复。


## 上一依赖：dispatch-denied

上一依赖为 `prologue-sdk-0.0.0-rc.1-dispatch-denied.tgz`（2026-09-28，仓库防腐整理 F-15）。在下面的 claims 包之上只改一件事：**App 的派出前复核拒绝时，报 `EFFECT_NOT_AUTHORIZED`，不再算作网络失败**。

- Node Host 的 `beforeModelDispatch` 是 App 的撤权复核（授权被收回、Character 被停用、密钥变了）。它拒绝时一个字节都没出本机，原来却被 agent loop 与 session run 两处 `mapNetworkError` 改成 `MODEL_NETWORK_FAILED`，消费方据此提示"检查网络"；带备选目标时还会换到下一个目标再被拒一次。
- 现在：复核抛错（不是取消、不是等待超时）时这次调用记为 failed，报 `EFFECT_NOT_AUTHORIZED`，消息保留 App 给的原因（`The App refused this model dispatch before sending: <原因>`）；两处 `mapNetworkError` 原样传出这个码；被拒后不换备选目标。取消和超时保持原来的含义。图片、TypeSafe 那条路本来就原样抛出 Host 的错误，随之拿到新码。
- 源码提交：molis-ai/prologue 分支 `fix/molis-dispatch-denied`，提交 `03c6ba0b`，父提交是 claims 的源码 `af7375c7`；增量补丁 [dispatch-denied.patch](dispatch-denied.patch)（相对 `af7375c7`，4 个文件）。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`3b8dcca04121e458e3c5f6d4fed77617f2e68178dccaad5cfcdb602601bc7c6f`

重建：检出 `03c6ba0b`（或在 `af7375c7` 上 `git apply dispatch-denied.patch`），执行 `pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-dispatch-denied.tgz`。

核对：与 claims 包逐文件比对，520 个文件中只有 `dist/agent/core/loop.js`、`dist/host/plugin/node.js`、`dist/session/core/run.js` 三个不同，证明底子就是 claims。新增 `test/dispatch-denied.live.test.ts` 3 项（Agent 轮次与一次性调用被拒时报 `EFFECT_NOT_AUTHORIZED`、零请求、不换备选；复核中途取消仍是取消），修复前前两项失败（拿到 `MODEL_NETWORK_FAILED`）。SDK 构建通过；SDK 全量 3339 项：3319 通过、20 跳过、0 失败；`tsconfig.typecheck.json` 仍是 claims 源码就有的 2 处测试文件类型错误（`test/agent-compaction-public.test.ts` 的 `continueWhenCompactionFails`、`windowTokens`），与本改动无关、数量不变。消费方改动与验证见 [仓库防腐整理 spec](../../specs/repository-systematic-review/spec.md) F-15。未发布 npm。

## 上一依赖：claims（协同第一期，已并入上面的 dispatch-denied）

该历史依赖为 `prologue-sdk-0.0.0-rc.1-claims.tgz`（2026-09-26 起，协同第一期"认领与任务图摘要"；2026-09-27 并入 Prologue 线的增量后，是 main 唯一的一条 SDK 补丁线）。在 coding-inference 合成包之上：

- 任务图负责人可以是角色、会话（包括子任务的会话）或人；只有负责人能报告，报告记下是哪个会话、哪个人。
- 新增 `handOver`：把没结束的一步从一个负责人交给另一个，状态与进展不动，留下交接记录；由人交接时记下是谁。
- 宿主替人记录决定时用 `override` 并写明人，模型的任务图工具不能这样做。
- `dispatch-subagent` 新增 `claims`：派出前整体核对，子任务开跑前接过这几步，结束时没做完的交回父会话；子任务总能看到读图和回报两个工具（`grantedTools`，不超过父任务本身的工具）。
- 读图时负责人写成 `you (this session)`、`subagent <引用>`、`the session that dispatched you`。
- 任务图事件带上图的编号（`board`）。
- 常开的任务图（`standing: { keepFinished }`，协同第二期）：不因节点都结束而终止，可以空着开，只留最近加入的若干个已结束节点（还有人在等的不丢）；用作每个项目一张的"进行中的工作"。
- 会话之间的信持久化（协同第三期）：信封记下 `inReplyTo`（答复哪一封，必须存在）、`awaitReply`（发信方在等答复）和 `sentAtMs`；投递箱可以存、重启后读回（`store`/`hydrate`/`flush`），可订阅（`subscribe`），可按收发方列出（`list`）。`session-send` 工具新增 `inReplyTo` 和 `wait`；`wait` 时回执提示模型说清在等什么并结束这一轮。
- 后台命令与挂起唤醒（第四期）：
  - `runtime.background`：后台命令属于会话（`background.outliveRun` 打开时，这一轮结束后继续跑；每个会话同时最多 `maxPerSession` 个），落盘；重启后原先在跑的记为 `interrupted`；Runtime 关闭时停掉还在跑的并记为被打断。后台命令和普通命令一样经审查，审查载荷标明 `background`、`outlivesRun`。
  - `runtime.waits`：会话挂起，等一条后台命令结束或输出指定字样、等一封信被答复或了结、等任务图上一个节点结束；落盘，重启后补上挂起期间已满足的；触发后由 App 接着开下一轮（`resume`），或取消。
  - 新系统工具 `await-commands`：一轮之内阻塞等（不调模型），或 `park: true` 挂起；子任务只能阻塞等，可以等父会话的后台命令。`session-send` 带 `wait` 时挂起在那封信上。命令结束时在下一次工具结果后提醒一次。
- 其余协同场景（第五期）：挂起会成环时拒绝（`WAIT_CYCLE`，沿"等信→等收信的会话、等节点→等它的负责会话"查）；`session-send` 的 `handoff` 可带 `board`/`steps` 把本会话名下未完成的步骤交出去（任务图 `handOver`，留交接记录）；`recipients` 一次给多个会话发通知；任务图新增只读查询 `assignedTo(session)`；工具执行器知道自己的会话（`session`）。
- 给人看的信（第五期，委派迁到信封）：`EnvelopeInput` 新增 `attachments`（App 自己的引用，比如固定成果的版本，最多 30 个）、`audience: "people"`（给两边的人处理，不交给模型，不占会话的扇出上限，正文上限另设 `maxPeopleBodyChars`、默认 20000，允许人自己写的路径，密钥仍拒绝）、`by`（替谁发）；每封信带 `history`（每一步的事件、之后的状态、时间、谁、为什么、附带的引用；最多 100 条），送达、接受/拒绝、完成、取消都可带上这些（`EnvelopeDetail`）；新增 `record` 在不改状态的前提下记一步（比如"开始执行"），结束之后记的标为 `late`、什么也不改。
- 第五期实测后的两处修正：`session-send` 交接只有交出计划里的步骤时才带 `board`/`steps`，传错时说明怎么改、什么也不发；`ask-user` 的选项写成 `{ label, … }` 时取 label。
- 并入 Prologue 线的增量（见下「Prologue 线」）：没有系统段时把缓存断点挂到最后一条用户消息；事件账保存 400–599 的 HTTP status；工具超时默认值归 Runtime 配置，去掉 runtime↔tool 双向依赖。
- 这一轮新增可选项 `context.continueWhenCompactionFails`（默认关，Molis 打开，用户拍板"放得下就继续"）：提前整理失败时，窗口还放得下就用原上下文接着跑，再攒一个 `compactAboveTokens` 后再整理；放不下仍然失败。子任务沿用父任务的设置。
- Node 宿主新选项 `retryUnansweredModelCalls`（默认关）：模型调用在对方还没有任何回应时连接就断了（重置、关闭、连接超时、网络不可达），标为可重试，按 Runtime 的重试策略再发（最多 3 次、退避）；仍记为已派出，用量照记。没有这类原因的错误、证书错误、回应已经开始后的中断都不重发。失败信息里带上原因码，比如 `fetch failed (UND_ERR_SOCKET)`。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 源码提交：molis-ai/prologue 分支 `codex/molis-coding-collab`，提交 `af7375c7`（基于上述基线）。它相对基线的差异与 [claims.patch](claims.patch) 逐字节相同。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`0a616614ae5882d20016c4ac07de30f149e0d78e05ff459e29689c0b5eefb43c`

重建：检出 `af7375c7`（或在基线上 `git apply claims.patch`），执行 `pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-claims.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过（仍有上一包就有的 `test/host-agnostic-adapters.test.ts` 类型错误）；安装后的 dist 与源码构建逐文件一致。SDK 全量结果见 Coding spec 第 0 节"协同第一期"。未发布 npm，未替换正式安装版。

## 上一依赖（Prologue 线，已并入上面的 claims）：账本 HTTP 状态

该依赖为 `prologue-sdk-0.0.0-rc.1-ledger-status.tgz`（2026-09-27）。保留下面缓存修复及全部既有能力，补齐安全 HTTP 错误状态（400–599 整数）的 Session 账本保存与恢复；旧账本没有 status 仍可读，原始响应和任意错误附加属性不进入账本。工具超时默认值归 Runtime 配置，ToolCatalog 复用同一值，移除 runtime ↔ tool 双向依赖；默认 60 秒、App 上限覆盖和工具自身 deadline 均保持。

- 本地源码：`/Users/yijunwang/code/prologue-molis-integrated`，基线 `a7e785b8c76149961d25b2f918aeec55554d8420`。
- 累计源码补丁：[ledger-status.patch](ledger-status.patch)。已在干净基线检查正向应用，并在当前源码检查反向应用；包含本次回归测试及历史扩展。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`；SHA-256：`a50e14cd8bd4afb2fa2f041e639855d21848ee4c9ffbe3c0a010b136e714f2fd`。
- 重建：基线应用补丁后执行 `pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`，在 `packages/sdk` 执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-ledger-status.tgz`。
- 验证：SDK build、`tsconfig.typecheck.json` 通过；session-error-status、session-long、workstation-wiring、live-tree、module-config、tool、prompt-cache-breakpoint、prompt-cache-prefix 共 100/100 通过。原先三项失败均已通过；未以定向回归替代全量 SDK 验证。
- 消费方：冻结安装、Agent Host / Local Host 类型检查通过，文字、图片、TypeSafe、Schedule、凭据与恢复共 75/75 通过；包内全部 514 个 dist 文件与 SDK 构建、实际安装逐字节一致。
- 补充验证：SDK 全量 3321 项，3300 通过、20 跳过、1 项在 Chrome fixture 加载页面阶段失败；随后单独复跑 `computer-use.live.test.ts` 11/11 通过，未修改测试超时或生产行为。图片标准 MCP 端到端 1/1 通过，覆盖真实字节保存、跨进程重开、权限与幂等；这仍是受控图片服务，不代表商业图片服务验证。

未提交或推送 SDK 源码、未发布 npm。旧包保留以便回退（2026-09-28 起从 git 历史取，见本文开头）。本轮本地/CLI 暂缓范围与真实图片服务未验证项见消费方 [spec](../../specs/bp-delivery-parallel/work-items/prologue-convergence/spec.md)。

## 上一依赖：缓存断点

该历史依赖为 `prologue-sdk-0.0.0-rc.1-cache-breakpoint.tgz`（2026-09-26）。在下面的 coding-inference 之上，**没有系统段时把 Anthropic 缓存断点挂到最后一条用户消息的末块上**：宿主文字生成只发一条用户消息，原来缓存档位开着、请求体里却一个 `cache_control` 都没有，`required` 照价收费而调用方以为命中。有系统段时仍只挂系统段；`off` 档一个字段都不加。另修了 `test/host-agnostic-adapters.test.ts` 那处 `ImagePayload` 类型错误。

- 源仓库、基线、本地源码同下（`/Users/yijunwang/code/prologue-molis-integrated`，基线 `a7e785b8`）。
- 未提交源码修改：[cache-breakpoint.patch](cache-breakpoint.patch)，相对基线的**累计**补丁（74 个文件），在干净的基线 checkout 上 `git apply --check` 通过。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`61bb2ee7a56b70c42e5a65dbbec3159cf08620a9f75f1d9672238aaa5d7bb964`

重建：同下，把补丁换成 `cache-breakpoint.patch`，`pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-cache-breakpoint.tgz`。

核对：SDK 构建与类型检查（`tsconfig.typecheck.json`）通过，类型错误清零。新增 `test/prompt-cache-breakpoint.test.ts` 6 项通过（一次性会话无系统段时 best-effort/required 挂在用户消息上、off 不带字段、有系统段只挂系统段、带附件落在正文块、多轮只挂最后一条用户消息）；原 `prompt-cache-prefix` 5 项通过。SDK 全量 3315 项：3291 通过、20 跳过、4 失败——其中 3 个是下面记录的共享推理线既有失败；`agent-context.live` 的「磁盘上有，但默认集合里看不见」在与 GoalBoard 全量构建并跑时超时，单独重跑 5/5 通过。

## 上一依赖：coding-inference 合成包

该历史依赖为 `prologue-sdk-0.0.0-rc.1-coding-inference.tgz`（2026-09-26，main 与 Coding 分支 `codex/molis-work-goal-continue` 合并时合成）。它同时包含两条累计补丁线：Coding 线的 [parent-reads.patch](parent-reads.patch)（子任务、角色工具、父任务只读子目录、大文件读、同状态回报等，见下「Coding 线」）与共享推理线的 [bounded-inference.patch](bounded-inference.patch)（有界文字、OpenAI/Gemini 图片、原生 TypeSafe、每次网络 dispatch 前的 Host 权限复核，见下「共享推理线」）。两条线都相对同一基线，回环修复两边都带着。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-molis-integrated`（detached worktree）：先 `git apply parent-reads.patch`，再 `git apply --3way bounded-inference.patch`，三方合并零冲突。
- 未提交源码修改：[coding-inference.patch](coding-inference.patch)，相对基线的**累计**补丁（72 个文件）。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`76fc2bda33a3f94d28e0f27be3f83dc2a2a2d5f061c080dc5dc977a016b93c03`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/coding-inference.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-coding-inference.tgz`。

核对：SDK 构建与类型检查（`tsconfig.typecheck.json`）通过。SDK 全量 3309 项：3286 通过、20 跳过、3 失败，另有 1 处测试文件类型错误。3 个失败（`live-tree` 的 runtime ↔ tool 模块环、`session-long` 事件账回放、`workstation-wiring` 重开后回执唯一）在共享推理线原工作树 `prologue-action-loopback` 里同样失败，Coding 线 `prologue-output-continuation` 里全部通过，属于共享推理线尚未收口的问题，不是合并引入；类型错误在 `test/host-agnostic-adapters.test.ts`（`ImagePayload` 联合类型取 `bytes`），同属该线。未发布 npm，未替换正式安装版。

## 上一依赖（共享推理线）：有界推理、图片与 TypeSafe

该历史依赖为 `prologue-sdk-0.0.0-rc.1-bounded-inference.tgz`，SHA-256 `9c6d6c0975334c029328d98306c5d5b58a764390d3196a4cdce94e48d4d8166e`。同一 Runtime 提供有界文字、OpenAI/Gemini 图片、原生 TypeSafe，支持每次真实网络 dispatch 前的 Host 权限复核。正式 Agent workspace:none 保留 Character、文本材料、会话历史、预算和用量，不创建目录；Builder 每次执行的工具/根授权仍走同一 EffectChain，不产生全局 allow。工具超时上限可由可信 App 配置，原工具自身时限不变。

源码基线仍是 `a7e785b8c76149961d25b2f918aeec55554d8420`，当前未提交扩展见 [bounded-inference.patch](bounded-inference.patch)，包含下方既有 loopback 修复。从该基线应用补丁、`pnpm install --frozen-lockfile`、`pnpm --filter @prologue/sdk build`，再在 packages/sdk 执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-bounded-inference.tgz`。没有发布 npm 或修改正式安装版。

已验证 SDK 原 image/loopback 23、network/stream/config 50、新真实 Node native 8、取消生命周期 2、Agent scope及相关 70、tool/config 33 项；部分套件重叠，不将数字相加宣称不同测试总数。GoalBoard Agent Host/Local Host 编译通过，消费端 36 项、助理真实 SDK 联验 27 项通过；9 种助理撤权交错实际 fetch=0。

本轮生产使用 Node Host。Tauri 对新 HTTP 下载/认证/响应边界能力明确拒绝，尚未扩展对应原生实现；不宣称跨 Host 功能等价。本地 OCR/Whisper/Laya/Grok 和外部 Agent 调度仍在继续迁移，阶段包不代表“所有 AI 已收敛”。


## Coding 线（此前依赖）

该历史依赖为 `prologue-sdk-0.0.0-rc.1-parent-reads.tgz`。在子任务带着角色声明的工具去之上，**分派到独立目录的父任务可以只读这些目录**（用户拍板"允许只读"）：并行写入时父任务（协调者）原来只看得见主工作区，核对子任务成果只能靠子任务的文字汇报。现在 `startAgentRun` 的 `subagents.parentReads` 为真时，父任务的 read、list、search 可以带 `workspace`（本轮冻结的子目录标识）只读查看那个目录；不带就是自己的目录。write、edit、命令都不接受这个参数，父任务不能在子目录写入或运行命令。父任务的查看不记进子目录"看过什么"的账：子任务改文件之前仍要自己先读。这项授权进开始指纹（只在授予时出现，未授予的旧运行指纹不变）。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[parent-reads.patch](parent-reads.patch)，相对基线的**累计**补丁。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`3584a8b6c21c6761d65f9ed9c4320ecf570bcd52aba5ee470d6f984eb75d34e3`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/parent-reads.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-parent-reads.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；SDK 全量 3269 项通过（全量并跑时有 6 项计时类用例在机器繁忙时超时，单独重跑这 6 个文件 84 项全过）。新增定向：真实 Node 宿主上，授权后父任务按标识读、列、搜子目录，写入被拒；父任务看过的文件子任务不先读就改仍被拒；未授权时点名子目录被拒。未发布 npm，未替换正式安装版。

## 上一依赖：子任务带着角色声明的工具去

该历史依赖为 `prologue-sdk-0.0.0-rc.1-role-tools.tgz`。在写错角色版本审查前就拒之上，**点名的子角色带着它声明的工具去**（用户拍板"就给工具"）：原来子角色声明的工具必须全部出现在父任务这次派出的工具名单里，父任务漏写一个（比如只读的 list），整次派出就以 CHARACTER_ESCALATION 失败，所以子角色只能不声明 list，子任务只好一条条 ls 请人审查。现在派出时把角色声明、且父任务这一轮本身就有的工具补进名单；父任务没有的工具仍然整次失败，孩子永远拿不到父亲没有的东西。每次写入和命令照旧经宿主审查。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[role-tools.patch](role-tools.patch)，相对基线的**累计**补丁。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`8e544ec408c6f6ea5c6321d20080c6f7001a91c41fe7163f4d61249a3bcb99b2`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/role-tools.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-role-tools.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；SDK 全量 3268 项通过、0 失败（改写定向：角色声明、父亲也有的工具直接给上；父亲没有的仍整次失败、孩子不上线）。未发布 npm，未替换正式安装版。

## 上一依赖：写错角色版本审查前就拒

该历史依赖为 `prologue-sdk-0.0.0-rc.1-character-precheck.tgz`。在子任务中断轮次结束即有终态之上，**派出子任务时写错角色版本，在审查之前就拒**：预演中 MiniMax 两次把子角色写成不存在的版本，人批准派出之后才报错，白审两次。现在工具调用器在进审查前核对 `character`：登记表里没有这个 `id@version` 时直接失败（`CHARACTER_NOT_FOUND`），并列出同名的现有版本，什么也没派出。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[character-precheck.patch](character-precheck.patch)，相对基线的**累计**补丁。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`2015571474b5dbc6033d74d54f6a9456fac7ddc588a737536e3811d0fe76cecc`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/character-precheck.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-character-precheck.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；SDK 全量 3267 项通过、0 失败（新增定向：登记过的角色写错版本时审查前就拒，并列出现有版本，孩子没上线）。未发布 npm，未替换正式安装版。

## 上一依赖：子任务中断轮次结束即有终态

该历史依赖为 `prologue-sdk-0.0.0-rc.1-subagent-close.tgz`。在同状态回报只记进展之上，**核对并结束子任务被中断的那一轮后，子任务立即有终态**：重启后，运行到一半的子任务被投影为"需要对账"，父会话因此拒绝开始任何新一轮（`EFFECT_RECONCILE_REQUIRED`）。结束子会话那一轮会写下终态，但子任务登记表只在启动时读一次，父会话要等下次重启才解开。现在经恢复结束一轮后，重新读取以这一轮为运行的子任务并装回登记表。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[subagent-close.patch](subagent-close.patch)，相对基线的**累计**补丁。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`c054fe2e7fd45b0a78c4f0a0614436cda5e27fd1341bafc9abc082505e51dd1e`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/subagent-close.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-subagent-close.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；SDK 全量 3266 项通过、0 失败（新增定向：非优雅退出后孩子为对账，结束它的中断轮次后立即有终态；去掉修复时该项失败）。未发布 npm，未替换正式安装版。

## 上一依赖：同状态回报只记进展

该历史依赖为 `prologue-sdk-0.0.0-rc.1-board-same-state.tgz`。在大文件行窗读之上，**报一个步骤已经在的状态只记进展，不算冲突**：用 Coding 开发 Molis 时，模型对已在进行的步骤再报"进行中"，得到 `TASKBOARD_CONFLICT: A running node cannot become running`，那句进展也一起丢了，模型读成版本冲突去重读任务图、白费一轮。现在 board report 的目标状态与当前相同时，保留说明、版本加一、不改状态、不发状态事件；显式的 transition 仍然严格拒绝同状态转换。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[board-same-state.patch](board-same-state.patch)，相对基线的**累计**补丁。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`4070d1b2939a084c5da2caa88f979e03ee355334c9262f6ddb5333a07b9a6e7d`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/board-same-state.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-board-same-state.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；SDK 全量 3265 项通过、0 失败（新增定向：同状态再报两次都记下进展、状态不变，显式 transition 仍被拒）。未发布 npm，未替换正式安装版。

## 上一依赖：大文件行窗读

该历史依赖为 `prologue-sdk-0.0.0-rc.1-large-read.tgz`。在搜索读大文件之上，**大于 64KB 的文件可以按行读、可以 edit**：用 Coding 开发 Molis 时，76KB 的样式文件整读被拒、提示"按行窗读"，可 read 工具根本没有行号参数，edit 又先整读同样被拒，模型只好用 `sed -n` 看、再用 `sed -i` 改（macOS 的 `sed -i -e` 还会留下一个备份文件）。现在 read 工具有 `offset`（从第几行起，1 起算）和 `limit`（取几行，最多 2000），回复末尾写明"第几行到第几行、共几行"；edit 与补丁准备为了生成差异可整读到 2MB（正文不进模型上下文）。不带行号的整读仍是 64KB 上限，超过时提示用 offset 和 limit。Tauri 原生 Host 同步支持 `maxBytes`（只能放宽到 2MB，不能调低）。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[large-read.patch](large-read.patch)，相对基线的**累计**补丁。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`9ec1243b2eb0bd08fdb866926021a8e714dd77cff8c1afa9da23c64ea46c4ebb`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/large-read.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-large-read.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；SDK 全量 3264 项通过、0 失败（新增定向：80KB 文件整读被拒并指向行窗、按行窗读到末尾几行、edit 改成功）；Rust Host 全部测试通过（新增 1 项：默认整读仍拒、放宽后读得到、不能调低、超过 2MB 仍拒）。未发布 npm，未替换正式安装版。

## 上一依赖：搜索读大文件

该历史依赖为 `prologue-sdk-0.0.0-rc.1-search-large.tgz`。在大仓库搜全之上，**搜索不再悄悄跳过大于 64KB 的文件**：原来搜索和整份读取共用 64KB 上限，超过的文件在搜索里直接跳过——Molis 的 76KB 样式文件里明明有 `.coding-tool-state[data-tone=failed]`，模型却一再断定"这个类没有样式"。现在搜索单个文件可读到 2MB，更大的仍跳过但计入"没搜全"；整份读取的 64KB 上限不变（仍提示按行窗读）。Tauri 原生 Host 同步修正。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[search-large.patch](search-large.patch)，相对基线的**累计**补丁。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`4a40774bf8f6fb111e12da40b83304f1253ea4fcb4b7ca1975d1c8c2da4ac123`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/search-large.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-search-large.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；新增定向（80KB 以上的文件照样搜到），搜索相关 29 项与 Rust Host 测试通过。全量结果见 Coding spec。未发布 npm，未替换正式安装版。

## 上一依赖：大仓库搜全

该历史依赖为 `prologue-sdk-0.0.0-rc.1-search-scope.tgz`。在单文件搜索之上，**搜索在大仓库里也能搜全，没搜全时如实说**。原来一次搜索最多走 1024 个文件，Molis 自己的仓库有 4000 多个可搜文件，搜到一半就停，还答成「(no matches)」——用 Coding 开发 Molis 时，模型在 60 轮里搜了 73 次，多次断定"这段样式不在这个仓库里"，最终用完轮次。现在上界提到 20000 个文件；到了文件数或条数上界时，搜索结果带 `truncated`，工具输出写明"没搜全，缩小路径再搜，别据此断定不存在"。Tauri 原生 Host 同步修正。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[search-scope.patch](search-scope.patch)，相对基线的**累计**补丁（含此前全部改动与 Rust Host 修正）。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`11307936c5b68c42460865a407cf4db5c0081a5ac444be674b246b53346a2bb4`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/search-scope.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-search-scope.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；新增定向 1 项（1500 个文件之后的目标照样找到、条数到上界时标出没搜全），搜索与忽略相关 29 项、Rust Host 全部测试通过。全量结果见 Coding spec。未发布 npm，未替换正式安装版。

## 上一依赖：单文件搜索

该历史依赖为 `prologue-sdk-0.0.0-rc.1-search-file.tgz`。在保留文件权限之上，**搜索的路径可以是单个文件**：原来 search 把 path 当目录去列举，给的是文件时列举失败被吞掉，答成「(no matches)」——模型据此断定文件里没有这段代码（Coding 实测里一个评审子代理连搜 7 次都是空，最后只能自己数行号）。现在路径是文件就只在这份文件里找（字面量与正则两档都是），路径不存在时报 `ROOT_NOT_FOUND`，不再答成没找到；工具说明改为「目录或单个文件」。Tauri 原生 Host 的同一处一并修正（需原生构建才用得上；Molis 走 Node Host）。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[search-file.patch](search-file.patch)，相对基线的**累计**补丁（含此前全部改动与 Rust Host 修正）。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`fd822866fe9125a641123f056c0f4e94c6416540ac5cbc56677c94bb08e93551`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/search-file.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-search-file.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；新增 SDK 定向 1 项（单个文件的字面量与正则搜索、路径不存在报错）与 Rust 定向 1 项，搜索与忽略相关 48 项、Rust Host 全部测试通过。全量结果见 Coding spec。未发布 npm，未替换正式安装版。

## 上一依赖：保留文件权限

该历史依赖为 `prologue-sdk-0.0.0-rc.1-file-mode.tgz`。在派出标识校验之上，工作区写入**保留文件原来的权限**：原来每次写入（包括改已有文件和按检查点回退）都先建一个 0600 的临时文件再改名替换，于是改过的文件都变成 0600，可执行的脚本改完就不再可执行（git 会看到 100755 → 100644）。现在改已有文件沿用它原来的权限，新文件按普通文件的默认权限（0666 减去 umask，通常是 0644）。写入仍是临时文件 + fsync + 原子改名。

起因：Coding 实测里模型新建的 `src/format.ts` 权限是 0600。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree）。
- 未提交源码修改：[file-mode.patch](file-mode.patch)，相对基线的**累计**补丁（含本机模型地址、截断续写、派出标识校验全部改动）。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`f9ca532288b8b6a3d3f68b575f48458f948f8ab93ac29244beb7fce840438398`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/file-mode.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-file-mode.tgz`。

核对：补丁可在源码工作树反向检查通过；SDK 构建、类型检查通过；新增 1 项定向（可执行脚本改完、回退后仍是 0755，新文件是 0666 减去 umask），写入与补丁相关 59 项通过。全量结果见 Coding spec。未发布 npm，未替换正式安装版。

## 上一依赖：派出标识校验

该历史依赖为 `prologue-sdk-0.0.0-rc.1-dispatch-key.tgz`。在截断续写之上，派出子任务（及其他声明 `idempotencyKey` 的系统工具）的键**在进入审查前就按存储地址的格式校验**：1–48 个字母、数字、点、短横或下划线，首字符为字母或数字。原来工具说明里没有格式约束，模型给出 `研究/第一步` 这类键时，要等用户批准后写回执才失败，批准白给；现在当场以 `TOOL_ARGUMENTS_INVALID` 退回，模型按工具修复路径改键重试，不产生审查项。工具说明同步写明格式。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（同一 detached worktree，在截断续写之上继续改）。
- 未提交源码修改：[dispatch-key.patch](dispatch-key.patch)，相对基线的**累计**补丁（含本机模型地址与截断续写全部改动）。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`35367d16ad89cc9b1aac0beaab9fa105e79f07c48addea19cf19d36c52ef81b8`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/dispatch-key.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-dispatch-key.tgz`。

核对：补丁可在源码工作树反向检查通过。SDK 构建、类型检查通过；新增 1 项定向（坏键当场以参数错误退回、不走到存储键报错，同一轮换合法键照常派出且只派出一个），子代理相关 13 项通过。全量 3280 项中 5 项 live 测试在满载并行时失败（computer-use 真浏览器、agent-context、effect-pending-recovery SIGKILL、registry-store、workspace-ignore），单独重跑 5 个文件全部通过（58 项与 11 项），属负载下的时序抖动，与本改动无关。未发布 npm，未替换正式安装版。

## 上一依赖：截断续写

该历史依赖为 `prologue-sdk-0.0.0-rc.1-output-continuation.tgz`。在本机模型地址修复之上，让被输出上限截断的回答**接着写到写完**：截下来的那段先进历史再请模型从断开处接着写（原来只发一句「接着写」，模型看不到写到哪，只能从头再写）；每次续写须写出新正文，不扣轮次，并记一条 `model-response-repair`（`output-truncated`）。续写有上界（8 次）；到了还在截断，或还没写出正文就用完上限且重采样用完，以 `MODEL_OUTPUT_TRUNCATED` 失败，不再把半截或空回答当成完成。护栏与记忆提炼看拼好的整段回答。

起因：思考档开启后，思考与正文共用单次输出上限（SDK 默认 4096），真实 MiniMax 规划轮思考用完上限、计划只写出 53 字，两次重采样后仍以「完成」收场，计划丢失。Molis 同时在思考开启时把单次上限设为 32768（用户拍板）。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-output-continuation`（detached worktree，先应用 model-loopback.patch 再改）。没有修改原 `/Users/yijunwang/code/prologue` checkout 或 `prologue-action-loopback`。
- 未提交源码修改：[output-continuation.patch](output-continuation.patch)，相对基线的**累计**补丁（含本机模型地址全部改动）。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`a8a8d1563cf7257015f54ac385f58c189b6e0407b2f4a6a1a5889d88c4a36c6b`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/output-continuation.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-output-continuation.tgz`。

核对：500 个 dist 文件在源码构建与 Molis 实际安装中逐字节相同；补丁可在源码工作树反向检查通过。SDK 构建、`tsconfig.typecheck.json` 类型检查通过；全量 3279 项为 3259 通过、20 跳过、0 失败；新增 3 项定向（截断续写拼成完整回答且每次请求带上已写部分、续写到上界如实失败、思考用完上限先让它少想再答且一直如此则失败）。Molis 侧定向见 Coding spec。未发布 npm，未替换正式安装版。

## 上一依赖：本机模型地址

该历史依赖为 `prologue-sdk-0.0.0-rc.1-loopback-model.tgz`。修复模型目录允许本机 HTTP、Run 启动却仅接受 HTTPS 的不一致；Cognia 的实际动作与界面现可使用本机模型。Host 默认拒绝、显式 model/loopback 授权、凭据和重定向检查不变。回环判断同步精确识别 IPv4 与 IPv6，拒绝 `127.` 开头的公网域名冒充回环。

- 源仓库：https://github.com/molis-ai/prologue
- 基线提交：`a7e785b8c76149961d25b2f918aeec55554d8420`，保留下方全部历史修复。
- 本地源码：`/Users/yijunwang/code/prologue-action-loopback`（detached worktree）。没有修改原 `/Users/yijunwang/code/prologue` checkout。
- 未提交源码修改：[model-loopback.patch](model-loopback.patch)。包含实现、模块合同、定向测试及 Rust Host 的一致性修复。没有将本包虚称为已提交或已推送版本。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`5eb410ce861d12c987f45515fc605acc59dc8ee558fcd1786b792d6eaae3e3ae`

重建：从上述基线创建干净 checkout，`git apply /absolute/path/to/model-loopback.patch`，执行 `pnpm install --frozen-lockfile`、`pnpm build`，在 `packages/sdk` 内执行 `pnpm pack --out /absolute/path/to/prologue-sdk-0.0.0-rc.1-loopback-model.tgz`。包只带 SDK 构建产物；Rust 源修正保留于补丁，需原生 Host 构建才能用于 Tauri 安装版。Molis 当前验证的生产调用链使用 Node Host。

核对全部 500 个 dist 文件在源码构建、tarball、Molis 实际安装中逐字节相同；源码补丁可在修复工作树反向检查通过。SDK 网络/模型 53 项、结构/打包/运行/原有整理/MCP wire 71 项与 Rust 回环目标测试通过；SDK 构建、类型通过。Molis Cognia 业务/标准 MCP/真实 HTTP 与 HTTPS 17 项、浏览器 4 项、相邻 Character/Prologue/首次使用 66 项通过，相关包构建、根与 SDK 类型、Workbench 注册边界通过。详情见 `specs/action-architecture/migration.md`。

这些是受控 Provider 的真实 I/O 和产品路径证据，不代表商业模型质量、全仓所有测试或用户本人验收。未发布 npm，未替换正式安装版。此前包保留用于追溯和回退。

## 上一依赖：按新增上下文触发整理

该历史依赖为 `prologue-sdk-0.0.0-rc.1-compaction-growth.tgz`。包含下方步骤回报修复，并让一次实际上下文整理后按新增内容达到原阈值再软触发；窗口硬检查和 Provider 明确溢出仍优先。保护内容持续超过软阈值不会逐工具往返重复整理，未缩短的整理也等待新增量；不放宽原文选择校验或丢弃历史。

- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`a7e785b8c76149961d25b2f918aeec55554d8420`（已推送）
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`a00d705a28b94894682a5dea78887ac295e78dfc21fd08e8555307a3400cf61f`

500 个 dist 文件与 SDK 构建、实际安装逐字节一致。SDK 59 项定向、构建、类型通过；全量 3271 项为 3249 通过、20 跳过、原两项 DNS 环境失败，无新增。Molis 构建/边界/类型通过，实际 Node Host 六次读取仅整理一次，原文件与重启后的完整运行投影不变；其余步骤回报与 Character 消费检查通过。MiniMax 返工 completed 且仅一次整理，但读过文件的归属和默认参数覆盖判断仍错误，两步均保存返工评价；完整结果见 Coding spec。Molis 全量仍待复验；未发布 npm 或替换正式安装版。

## 上一依赖：步骤回报

`prologue-sdk-0.0.0-rc.1-step-reports-v2.tgz` 中，`board-report` 允许原 blocked 节点在当前版本解除阻塞到 ready；safe-read 同样经过公开 tool-before hook，使消费 App 的原 Session/Run 归属限制在读取前生效。普通读取不新增 Effect；hook 的拒绝、失败、延后或要求审批均不能偷读。副作用仍走原审批链。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`d2f5a05df6459440a253787e94ee6520f12d754d`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`353ea0bc7c6d6d4e32dda43a597b15f60e82aec5c7e3728b35c2ed8326a89f3f`

500 个 dist 文件与 SDK 构建、实际安装一致。SDK build/typecheck、66 项定向通过；全量 3266 项为 3244 通过、20 跳过、两个原有 DNS 环境失败。Molis 真实 Node Host 覆盖原图读取隔离、版本/顺序依赖、blocked 恢复、失败中断与重启零重放。MiniMax 已从正式确认计划按序回报，原评价和返工由 Coding 独立保存；模型准确性与持续整理仍有实际失败，见 Coding spec 本块完整结果，不宣称整个 Goal 完成。未发布 npm 或替换正式安装版。

## 上一依赖：同步子任务等待

上一依赖为 `prologue-sdk-0.0.0-rc.1-child-observe.tgz`。同步子任务先确认原分派回执，再由同一次工具调用等待原子结果；子执行与人工审批不再占用父分派工具期限或 Host 分派许可。子任务预算、审批、取消和拒绝保持，后台分派仍立即返回引用。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`4d5f874d37287eb2cd87c10a5837013d922555f0`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`26a0ef1fd3c862949ea0ccc77f26002c639b4971e834179cbfd28e57a5957bd8`

500 个 dist 文件与 SDK 构建、实际安装一致。SDK build/typecheck 与 51 项定向通过；全量 3260 项为 3238 通过、20 跳过、两个原有 DNS 环境失败。Molis 27 项定向通过，包含真实 Node Host 65 秒待审后批准与原结果返回；最终全量 1554 项为 1492 通过、57 个既有失败、5 跳过，零新增失败。

真实 MiniMax 两轮待审分别超过 103 秒、127 秒，拒绝内容错误的提案后父任务收到原子结果，没有超时、许可过期或重派。新 MiniMax 批准写入样本未通过，不能将这些证据解释为模型质量达标。最终八个会话与审查共十六份投影重启保持；详细记录见 Coding spec C13。同步 fork Skill、成果整合、TaskBoard 与完整 Goal 仍未完成；未发布 npm 或替换正式安装版。

## 上一依赖：完整子报告分页

上一依赖为 `prologue-sdk-0.0.0-rc.1-subagent-report-pages.tgz`。在原默认指令修正和恢复能力上，为子任务的有界摘要补上完整最终结果分页。`await-subagents` 的 `reportOffset` 读取本轮原子任务的终态结果，按原 2000 字符页长给出总长与下一页；不灌入思考、工具输出或子聊天过程，不重新执行模型。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`07ad08a11e3b4a01b9fe877dedff1efba6f4833c`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`fb62c2951b4d72c53e45d25390c27cdd786eb04610bca9caedd5362ef4ccd2d0`

包内 500 个 dist 文件与 SDK 构建、实际安装逐字节一致。SDK build/typecheck、57 项定向通过；全量 3257 项为 3235 通过、20 跳过、两个原有 DNS 环境失败，零新增。Molis MiniMax 实际读完新子任务的 2500 字符结果（偏移 0、2000），详细证据见 Coding spec C13 与 `subagents-sdk-consumer.json`。未发布 npm 或替换正式安装版。

## 上一依赖

上一依赖为 `prologue-sdk-0.0.0-rc.1-neutral-agent-prompt.tgz`。在原中断恢复、过程/补充要求持久化、整理用量基础上，移除 SDK Agent 循环强加的本地项目检查人格和固定 `list/search/read` 流程。任务方式仍由 App 与已选 Character 提供，工具权限与审批不变。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`52c49cf5095e67cd62f4db9e9c1d515afa68ddd8`
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`cd2bf974c609fe5277313e876857a61b2b03cc79ee5be6b12a37a5f3cb1b6000`

包内全部 500 个 dist 文件与 SDK 构建、实际安装逐字节一致。SDK build/typecheck 与 61 项定向检查通过，全量 3256 项为 3234 通过、20 跳过、2 个既有 DNS 失败。Molis 正式 MiniMax 同条件 v3 角色实操仍先申请 `ls`、两次审批；本次不宣称减少人工介入，完整证据见 Coding spec。未发布 npm 或替换正式安装版。

## 历史包

上一个依赖为 `prologue-sdk-0.0.0-rc.1-compaction-usage.tgz`，包含中断恢复、过程与补充要求持久化，以及上下文整理用量归属。整理请求通过同 Runtime 的原回执加入父 Run 小计与本轮预算，不重复写入 Runtime 总账。

- 源仓库：https://github.com/molis-ai/prologue
- 来源分支：`codex/molis-coding-receipts`
- 对应源码提交：`a8ac8e1eb7362a2189973cbe7aaa4f4624649ee0`（基于 `46d8092`，本次将恢复、过程、补充要求与整理用量改动一并提交）。打包字节未因提交而改变。
- 包名与版本：`@prologue/sdk@0.0.0-rc.1`
- SHA-256：`a6dcf44718152403d5194fde7df0af0cad34b8d280e9a455bb744b0b3d147322`

该包全部 500 个 dist 文件与 SDK 构建、tarball 和实际安装逐字节一致，见 c9-compaction-usage-sdk-consumer.json。正式 MiniMax 长任务已验证整理请求进入合计，报告与完整会话投影重启不变；SDK 最终 3254 项仅两个既有 DNS 安全拒绝失败。详见原 Coding spec，本包未发布 npm。

2026-09-21 核对 tarball 内全部 500 个 `dist/` 文件，与 SDK 构建结果及 Molis 实际安装目录逐字节一致；最新复核证据 `c10-sdk-consumer.json`。依赖声明、锁文件与 workspace inventory 配套，未发布 npm。恢复只按原 Run/Effect/Pending 的权威事实收口，不调用模型、不重放操作；未知结果仍阻塞，已保存的流式前缀可读，未报告的末尾过程和完整用量不补造。补充要求写入原 Run 后才返回接收回执，应用事件仅表示加入后续上下文。真实进程与模型请求的相关验证通过，完整工程与产品验证及剩余边界见 `specs/coding-plugin/spec.md`，不以打包成功宣称完整恢复通过。

已提交的 `prologue-sdk-0.0.0-rc.1-approved-receipts.tgz` 对应上述基线提交，SHA-256 `852620648243866d755d0b733fbc8354e6cee2eb26b7c9bafa3f077025ead14a`，保留用于回溯。

历史已提交包 `prologue-sdk-0.0.0-rc.1-command-feedback.tgz` 对应源码 `8d590818e32534880984f9e84e1efd005caa105a`，SHA-256 为 `302c81c049c8a1250a47aff9a5aa5f3fe862e409369f6697c5359b9b7cf2ae81`，保留用于回溯。
原 `prologue-sdk-0.0.0-rc.1.tgz` 缺少对应源码提交记录，不能当作上述提交的构建。其余本地中间包不是当前依赖，也不作为本次提交的分发物。
