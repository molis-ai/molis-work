# C8 助理执行方设计（PG-036 的 W5-10 一半）

状态：② 10-21 写的设计稿，交 ① 批。① 批了以后照它开 C8-1。
- 行号都按 main `75623a5e3` 核过。
- 安全不变量的编号开 PR 时再取：按 main 加在途 PR 取下一个空号，这里不预填。

## 0. ① 要的三件事

1. **`withPersonDispatchGuard` 归平台**，挂在本人的动作客户端上（`apps/local-host/src/local-web-actions.ts`，② 负责）。
   - 客户端的 `invoke` 多一个参数 `control`，形状就是现成的 `PluginExecutionControl`（`packages/contracts/src/platform/plugin.ts:382`）里的 `beforeEffect`、`assert_authority_current` 两项，不新造类型。
   - 这和插件调动作时传的 `control` 是同一个东西：`services.actions.invoke(…, control)`，以及 S-43 委托的 `directory.invoke(reference, input, control)`（`plugin-action-delegation.ts:42-46`）。
   - 把 `control` 串进调用者的两道检查，这段只写一份（新的小文件），本人客户端和 S-43 的 `delegate` 都用它。S-43 的检查顺序不变，靠它现有的测试原样通过来证明。
   - 助理只传自己那一项「这一轮还算数」的检查；`withPersonDispatchGuard` 和助理里的 `PersonActions` 接口都删掉。
2. **要一条新的安全不变量**（编号开 PR 时取）。
   - 原因：这道守卫现在只有用例（`W2-18-FOLLOWUP-DELETE-04` 等），不在 `SECURITY-INVARIANTS.md` 的表里。
   - C8 以后，执行方不再写死成 Coding，任何插件都可以当，所以「交给谁」也要一起钉住。
   - 条文见 §5。
3. **拒绝测试放新文件 `tests/security-invariants-assistant-executor.test.ts`。**
   - `package.json` 的 `test:security` 用通配 `tests/security-invariants-*.test.ts`，会自动带上它；CI 在 `.github/workflows/ci.yml:455`（`pnpm test:security --shard …/2`）跑。
   - 所以不用改 `package.json`。
   - 现有的 `tests/assistant-coding-executor.test.ts` 在 CI 产品子集里（`tests/ci-product-subset.txt:93`）。它改名成 `tests/assistant-executor.test.ts`，清单在同一个 PR 里改（N-16）。

## 1. 现状（main `75623a5e3`）

**执行方的类型**
- `AssistantExecutor = {kind:"assistant"} | {kind:"coding"; title; session_id|null; mode?}`，在 `packages/contracts/src/services/assistant.ts:238-243`。同样的字面量还出现在 :309、:405、:411、:486-490、:526。
- `assistant` 是内置的 Prologue 运行时。Characters 和委托出去的子工作也都是 `assistant`。
- `coding` 是唯一的插件执行方，只在项目里有。

**存下来的地方**
- `assistant_works.body` 的 JSON（`assistant-store.ts:28-31`、:191-220）。
- `assistant_rounds.body` 的 `executor?: "coding"`（:109-110、:228）。
- 交接摘要（`handover_brief`）。
- 上下文账本里的关系 `coding_session`（`assistant-service.ts:160`）。
- 库的建库基线是 `ASSISTANT_STORE_BASELINE` 第 2 版（`assistant-store.ts:27`）。

**Coding 写死在哪里**
- `assistant-service.ts` 里有 37 处 `"coding"`，另有 8 个站点（迁移计划 §2.12）。
- 工作台 `assistant-island.ts` 有 62 处：`EXECUTORS` :79、:197、:869、:1119-1127、:1580、:1937-1950。
- 还有 `assistant-send.ts:31-32,63`、`assistant-work-objects.ts:40`、`assistant-side-context.ts:105-124`。

**`CodingExecutor`（`assistant/assistant-coding.ts`）只调 Coding 的公开动作**
- 动作：`coding.state`、`sessions.create`、`sessions.read`、`sessions.update`、`runs.start`、`runs.control@7`。版本钉在 `VERSIONS`。
- `setup()`（#876）读会话的目录和 MCP 选择。
- 往正在跑的那一轮里追加，走平台通用的 `inputs.deliver`（`assistant-service.ts:1293`）。

**守卫**
- 生产接线在 `assistant-http.ts:98-101`：`client.invoke(withPersonDispatchGuard(caller, beforeDispatch), action, input)`。
- 调用者由 `localWebActionContext` 给出：actor `web-user`，audience `user`。
- 内核 `ActionService.invoke`（`packages/kernel/src/action-service.ts:199-211`）先跑 `validate_authority`，派发之前再跑 `assert_authority_current`。处理器自己的 `beforeEffect()` 也会再问一次。用例 `tests/assistant-coding-executor.test.ts:59-79` 证明：在最后一个 `beforeEffect` 的等待里请求被删掉，就不提交。
- 只有 `codingDispatch`（`assistant-service.ts:1276-1307`）真的给了检查：`assertSendCurrent(stillCurrent)`，不算数就抛 `assistant.cancelled`。
- 对 Coding 工作，这个检查唯一的来源是定时跟进（`assistant-followups.ts:178-180, 202-220`）：记录没被改、没被删，才算数。

**受众**
- Coding 的 `sessions.update`、`runs.start`、`runs.control` 只给 `user`。
- `state`、`sessions.create`、`sessions.read` 还给 agent、workflow、mcp。

## 2. 选执行方：按动作类型，不按消费场景

**不用消费场景**
- 消费场景在 `specs/action-architecture/spec.md`「消费场景执行入口」里只有一种意思：
  - 插件先准备（prepare），再交给判断函数判断，最后用结果落地（consume）。
  - 绑定存在 Functions 库的 `function_scene_bindings`，绑的是判断。
  - `tooling/gates/actions/scenes.tsv` 现在只有 `feed.capture`、`inbox.next` 两行。
- 执行方没有「判断」这一步。塞进场景，场景表就多出第二种意思，这是防腐要拆的那种东西。
- 所以 PG-036 行里「按动作和消费场景」改成「按动作」：在 privileges PG-036 行和 C8-1 PR 正文里各写一句。

**用动作类型，照搜索来源的先例**
- 搜索来源的先例在 `packages/contracts/src/platform/search-sources.ts`：
  - 插件发布带平台语义类型（`input_type` / `output_type`）的动作，就担起一个平台角色；
  - 平台在共同目录里按判定函数找它，不另写名单，Manifest 不加字段。
  - 工作流也按这两个类型配对。
- C8 照做：
  - 新的合同子路径 `@molis-ai/molis-work-contracts/platform/work-executors`（`packages/contracts/src/platform/work-executors.ts`），放各角色的类型名（`molis.work-executor.<角色>.v1`）、输入输出 schema 和判定函数。
  - 一个提供方要把全套角色都发布齐（同一个 `provider_id`），才算执行方。缺一个就不出现在可选列表里，也选不上。
- 角色取 `CodingExecutor` 现在实际用的几个，不多加：

| 角色 | 现在对应 Coding 的 | 说明 |
| --- | --- | --- |
| `state` | `coding.state` | 能不能用、有哪些方式（`modes: {id, title}[]`）、收不收图片、工作区与 MCP 可选项（#876 的 `setup` 用的部分） |
| `session.open` | `sessions.create` | 标题、方式 → `session_id` |
| `session.read` | `sessions.read` | 会话、轮次（`AgentRunView`）、配置、`recovery_required`，以及会话选的 MCP |
| `session.update` | `sessions.update` | 改方式 |
| `run.start` | `runs.start` | 会话加任务文字（交接摘要或本人的话） |
| `run.control` | `runs.control@7` | 停、答、批（`AgentRunControl`） |

- 往正在跑的一轮里追加照旧走 `inputs.deliver`：它的 `answer`、`send` 两个回调换成调 `run.control`、`run.start`。
- 受众：
  - 判定函数只要求每个角色动作的受众里有 `user`，因为助理以本人的身份调。
  - 不要求只给 `user`：别的受众是提供方自己的事。Coding 的 start、control、update 继续只给 `user`。
- SDK 加 `defineWorkExecutorActions(…)`（`packages/plugin-sdk/src/work-executors.ts`，照 `source-declarations.ts` 的写法）：替插件填好类型和 schema，插件发不出半套或类型写错的角色。SDK 是共享核心，进批。
- 版本：类型名带 `.v1`。形状变了就换 `.v2`，助理在同一个 PR 里跟着改（`CONTRACT-CHANGES.md` 第 3 条）。

## 3. 工作上存什么

**合同**
- 执行方改成 `{kind:"assistant"} | {kind:"plugin"; plugin_id; title; session_id|null; mode?}`。
- 存 `plugin_id`，不存安装号和 `provider_id`：重装、升级之后 `plugin_id` 不变。
- 每次调用前，在本项目当前的目录里按 `plugin_id` 加全套角色重新找提供方。
- 找不到（停用、卸载、撤权、缺角色）就拒绝，码是 `assistant.executor_unavailable`，什么都不发，也不换别的提供方。这和 `CONTRACT-CHANGES.md` 第 3 条「失效时保留并报错，不换成新版本或另一个提供方」是同一个口径。

**跟着改名的**
- 轮次的 `executor?: "coding"` 改成 `"plugin"`。
- 账本关系 `coding_session` 改成 `executor_session`，带 `plugin_id`。
- 错误码 `assistant.coding_unavailable` 改成 `assistant.executor_unavailable`。
- `CodingUnavailable extends Error` 删掉，改用 `defineErrorCodes`，错误模型的数字随之下降。

**存量数据**（照 `CONTRACT-CHANGES.md` 第 4 条）
- `ASSISTANT_STORE_BASELINE` 升到第 3 版，版本不符的库被拒，读取时不兜底。
- 开发用的 Home 用会话临时目录里的一次性脚本升级或重建，脚本不进仓库。
- 本机没有真实 Home，也不碰。

**照旧拒绝**
- Characters、委托出去的子工作、卡片、重问、预算、方法、扶持（holds）、用量，对插件执行方照旧拒绝，口径和现在对 Coding 的一样，只是不再写死 `"coding"`。

## 4. 守卫归谁，为什么

- **归平台的本人动作客户端，不归助理。** 守卫做的事很通用：调用者自己的「还算数」检查，挂在内核最后那道同步检查上。凡是替本人在宿主里发动作的地方都要它：现在是助理，W5-10 以后是独立出去的助理包，以后还可能有别的入口。留在助理里，下一个用的人就得再写一份。
- **助理搬成独立包以后**（W5-10 最后一步，决定 #3）：它经端口拿到本人客户端，照样传 `control`，不 import 宿主。
- **不走 S-43 委托。**
  - 委托只能在本安装自己正在运行的动作里用，嵌套调用者的受众是 `workflow`。
  - 助理是以本人身份（`user`）在本人自己的工作里调；定时跟进又是长期挂着的，不在哪个动作里面。
  - Coding 的 start、control、update 只给 `user`。走委托要么被拒，要么得把它们放开给 `workflow`，那等于放宽了谁能启动 Coding。

## 5. 新的安全不变量（编号开 PR 时取）

条文草稿：

> 助理把一项工作交给执行方插件（PG-036）：
> （一）只以本人的调用者（audience `user`、actor 是本人）调执行方的动作，而且只在三种情况下调：本人在这项工作里的发送、本人的控制、本人设的定时跟进。助理的模型、Characters 和委托出去的子工作，都不能把工作交给插件执行方。
> （二）一项工作只交给记下的那个插件（`plugin_id`）。每次调用前在当前目录里重找；它停用、卸载、撤权或不再提供全套角色，就以 `assistant.executor_unavailable` 拒绝，什么都不发，不换别的提供方。
> （三）派发时这一轮已经不算数（工作被删、被改、跟进被撤）就不派发。检查挂在本人客户端的 `control` 上，跟着内核的 `validate_authority`、派发前的 `assert_authority_current` 和处理器的 `beforeEffect` 一起走，到执行方提交前最后一次同步检查都算。被拒的不写业务记录（S-18 口径）。

**拒绝测试**（`tests/security-invariants-assistant-executor.test.ts`）
- 用测试自带的一个假执行方插件，发布全套角色。这样不依赖 Coding，也顺带证明「任何插件都行」这条路。
- 「S-xx 跟进的工作在 read 之后、start 之前被删，执行方不起新的一轮」：从 `assistant-followup-deletion` 搬过来，那个文件不在 CI 子集里。
- 「S-xx 处理器在最后一个 `beforeEffect` 等待时这一轮不算数了，不提交」：就是现在的 `W2-18-FOLLOWUP-DELETE-04`，改成用平台客户端的 `control`。
- 「S-xx 工作记的是插件 A，A 被停用，B 发布了全套角色，也不交给 B；B 的动作一次都没被调用」。
- 「S-xx 少一个角色的提供方选不上，也不出现在可选列表里」。
- 「S-xx 执行方的处理器看到的是本人（audience `user`），委托出去的子工作选插件执行方被拒」。

**宿主里不再写死 Coding**
- 计划 C8 节要的那条：宿主里没有 `assistant-coding.ts`，助理目录里没有 `"coding"` 字面量。
- 这条放进改名后的 `tests/assistant-executor.test.ts`，不动枢纽文件。

## 6. 谁能当执行方

- 我的判断：任何在本项目里装好、在运行、发布了全套角色的插件都能当。没有名单。本人每次对一项工作明确选一个；交接摘要和本人的话只发给选中的那个。
- 依据有两条：
  - 用户 10-18 定的「插件待遇一样」；
  - C5 的先例：U1 开放给所有插件，按 Manifest 声明与安装授权放行。
- 本人选执行方再发话，和打开那个插件自己的页面发话是一回事。所以我认为这不算新的信任边界，不用弹窗问用户。
- ① 如果认为「交接摘要发给第三方插件」是新的边界，就作为一个问题交给用户，推荐项是「开放，按安装与本人每次选择放行（推荐）」。

## 7. 切片

| 片 | 谁 | 内容 | 依赖 | 进批 |
| --- | --- | --- | --- | --- |
| C8-1 | ② | 合同子路径 `platform/work-executors`；SDK `defineWorkExecutorActions`；本人客户端的 `control` 与共用的串接（S-43 也改用，测试原样过）；助理改传 `control`，删 `withPersonDispatchGuard`、`PersonActions`；`pnpm api:update` | 无（`local-web-actions.ts`、`assistant-http.ts` 和 #916 只有几行重叠） | 是（contracts、SDK） |
| C8-2 | ③ | Coding 用 SDK 把六个角色发布出来，形状不同的出新版本；`pnpm actions:update` | C8-1 合入 | 看 ③ 改不改共享核心 |
| C8-3 | ② | 助理改成按类型选；删 `assistant-coding.ts`；`AssistantExecutor` 合同、库第 3 版、账本关系、错误码；工作台的执行方列表改成读服务端给的可选项；新不变量和安全测试；测试改名并改子集清单 | C8-2 合入；视觉线 #916（冲突中，改到 10 个同样的文件）、#915、#940、#951（`assistant-island.ts`）合进 main | 否（宿主与工作台；合同只改 `services/assistant`，不是共享核心那四个包） |

- 验收号取 `W5-01-CODING-70～79`（计划 C8 节）。
- 门禁：
  - `AssistantService` 只许变小：37 处字面量换成判定，应当变小。
  - `CodingUnavailable` 删了以后，错误类数字下降。
  - Coding 包名在包外被点名的数字不变：`assistant-coding.ts` 只调动作 id，不 import Coding 包。
- 枢纽文件不碰。
- T1 照旧：C9 不等 C8。C9 收口时如果 C8-3 还没合，就照 T1 记在 PG-036 名下。

## 8. 不做的

- 在仓库里做第二个执行方插件：测试里的假插件已经证明这条路走得通。
- 助理搬成独立包：W5-10 的最后一步，不在 C8 里。
- Characters 和子工作走插件执行方：照旧拒绝，以后要做另开设计。
