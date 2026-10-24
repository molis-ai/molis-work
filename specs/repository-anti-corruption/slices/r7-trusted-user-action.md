# R7：可信的 `user_action`，找自己的动作不再写提供方（PG-029、PG-030、BL-374）

状态：评审修复完成、等复审（2026-10-23，防腐线 ac-kernel 片，Codex 接续剩余评审项）；验收 RAC-180～184 的测试在 `tests/security-invariants-trusted-user-action.test.ts`，全量与统一验证窗口后补。

## 1. 目标

- **PG-029**：`caller.user_action`（一个人经受保护入口做的操作：来源、会话、消息）只由入口给。插件写的、输入里带的、处理器里自己补的一律不认。Goals S9 删掉宿主手写的 web 来源之前，平台先要有这一条。
- **PG-030**：处理器嵌套调用时 `retainActionAuthority` 不再要求插件写出自己的 `provider_id`：平台按这次分发解析出的提供方去找「自己的动作」。
- **BL-374**：Lingguang、Cognia 的 `caller.retainAuthority?.([definition])` 不带提供方 id，在只认精确动作授权的入口（外部 MCP 客户端按动作给的授权）下最终检查对不上（`mcp.action_revoked`）。由内核在保留时钉住解析出的提供方，插件代码不用改。

## 2. 设计

### 2.1 `user_action` 只由入口给（PG-029）

1. 合同：`ActionCallContext.user_action` 的形状提成具名类型 `ActionUserAction`（`packages/contracts/src/platform/actions.ts`），字段不变；文档写明只有入口给。
2. 内核：每次分发在处理器之前过 `assertCallerProvenance`（`packages/kernel/src/action-authorship.ts`，与 `authorship: "session"` 同一处）。分发发生在一个处理器的异步作用域里（内核自己的 `AsyncLocalStorage`，处理器返回之后它留下的工作也算）时，这次调用的 `user_action` 必须与那个处理器收到的逐字段相同，或者不带；自己写的、改过的、原调用没有却补上的，拒绝（`kernel.user_action_untrusted`，类别 forbidden），目标处理器不运行，调用记录里是一行「未执行」。
   - 只比对、不改写：嵌套调用新增合同外字段也拒绝；已知可选字段省略与显式 `undefined` 等价。沿用原调用的出处（插件动作目录 S-43 的嵌套调用者、`retainActionAuthority` 包出来的调用者）照常通过；去掉它也通过。
   - 处理器创建的异步后续（包括定时器及在其中首次启动服务时创建的后续）即使在处理器返回后仍属该 `AsyncLocalStorage` 作用域。不在任何处理器作用域里、持原始 `ActionClient` 的宿主或现有内置代码算入口，由入口自己负责，内核不判断；第三方插件只有绑定客户端。
3. 入口：页面路由。`apps/local-host/src/plugin-actions-client.ts` 的 `projectRouteControl` 带着本人的调用者时（项目插件的路由 `project-plugin-http.ts`，Home 插件在项目里的路由 `home-plugin-http.ts`），给这个调用者加 `user_action = { source: "web", conversation_ref: "web:<项目 id 或 home>", message_ref: "web:request:<随机 id>" }`，一次请求一条消息；调用者原来带的被覆盖。插件经这个路由调自己的动作（`routedActions`），处理器收到的就是它。
   - 没有改：Goals 的宿主转接（`goals-actions.ts` 的 web 与管理入口、`personal-planning-actions.ts`）仍按动作手写出处——它们是 S9 要删的私路，本片只给 S9 准备平台那一半。管理入口（`molis-work v1`、管理 MCP）的通用出处等 S9 迁移时按同一写法给。
   - S9 后续必须处理：当前页面路由每次请求随机生成 `message_ref`，不提供 `whole_confirmation_prompted`；Goals 旧入口按幂等键生成 `web-decision:<key>`，并从 `confirm_all_pending` 得到整份确认。迁移时须从受保护来源保留重试的同一消息身份和整份确认依据，不能读取普通输入来补；本片不迁移 Goals。
   - 插件页面经 `pluginPageActions` 调自己的动作时不给出处（那条路造的调用者不是本人的路由调用者）；需要时另开一行。

### 2.2 找自己的动作（PG-030、BL-374）

1. 合同：`ActionExecutionContext.current_action`（可选，冻结）——这次分发的动作和解析出的提供方，只由内核写。
2. `retainActionAuthority(context, origin, beforeEffect?)`：`origin` 可以不带 `provider_id`，这时它必须是正在执行的动作（`current_action` 的动作与版本），提供方取 `current_action` 的；别的动作不带提供方的拒绝（`actions.reference_invalid`），即使上下文没有任何授权检查也先校验来源。带提供方的照旧。
3. 内核 `retainAuthority(references)`：不带提供方、指向正在执行的动作的，按这次分发的提供方解析（不是目录里先找到的那一个）；任何引用解析后，后续检查（`validate_authority`、`assert_authority_current`、后台复查）都带解析出的提供方，所以只认精确动作授权的入口能对上。
4. Feed、Inbox 的 `retainActionAuthority` 调用去掉自己钉的 `provider_id`（`plugins/native/feed/src/{content,item,rule,source}-actions.ts`、`plugins/native/inbox/src/{actions,content-actions}.ts`）。宿主自己的提供方（`apps/local-host/src/*-actions.ts` 里的 `system.*`）和 `horizontal/*` 的不在本片范围，留原样。

## 3. 验收

| 编号 | 内容 | 测试 |
| --- | --- | --- |
| RAC-180 | 在正在执行的处理器里发起的调用，写了自己的 `user_action`（与原调用不同，或原调用没有）被拒（`kernel.user_action_untrusted`），目标不运行；处理器返回后留下的工作也一样；沿用原调用的、或不带的通过；不在任何处理器里的入口调用照常 | 「RAC-180 …refused before its handler runs」「RAC-180 …carries the handler's own user_action, or none」「RAC-180 …work a handler left behind」 |
| RAC-181 | 处理器从 `current_action` 读到这次分发的动作与解析出的提供方，对象冻结 | 「RAC-181 …」 |
| RAC-182 | `retainActionAuthority` 不带提供方时用正在执行的动作的提供方，每次检查都带它；别的动作不带提供方的拒绝 | 「RAC-182 …」 |
| RAC-183 | BL-374：`retainAuthority([定义])` 在只认精确动作授权的入口下通过 | 「RAC-183 BL-374 …」 |
| RAC-184 | 页面路由给插件自己的动作 `user_action`（source `web`、项目的会话、每个请求一条消息）；请求体里带的不被读（路由只提取 `reference`，伪造请求返回 200，处理器仍收到可信 web 出处；故障注入移除入口覆盖时本测试必须失败）；经动作目录委托的目标看到同一份 | 「RAC-184 …」 |

## 4. 安全不变量

新增 S-58（统筹 2026-10-23 分配，`docs/system/SECURITY-INVARIANTS.md` 有行，测试名里写 `S-58`）：`user_action` 只由入口给；处理器作用域里的分发只能沿用或去掉，写了自己的拒绝；页面路由入口给 `web`。

## 5. 对调用方的影响

- 合同：新增导出类型 `ActionUserAction`、可选字段 `ActionExecutionContext.current_action`；`retainActionAuthority` 的 `origin` 放宽为 `ActionReference`（原来的调用写法都还成立）。没有动作 schema、MCP 工具名、Manifest 的变化。
- 行为：一个处理器里再给嵌套调用写 `user_action` 的代码会被拒。静态调用链中的 Goals 转接、个人规划与管理调用按入口使用；是否有长生命周期入口在处理器的异步作用域里创建，仍需统一验证窗口核实。若出现 `kernel.user_action_untrusted`，先查该入口创建时的 `AsyncLocalStorage` 作用域，不放宽出处检查。在处理器域内经进程内 MCP 管理工具调 Goals 的路径会按同一规则拒绝。
- 插件作者：`retainActionAuthority(caller, ownDefinition, caller.beforeEffect)` 保留自己的动作授权和副作用检查，不用 `{ ...def, provider_id: MY_PLUGIN_ID }`；其他动作须明确提供方。同片同步 `packages/plugin-sdk/README.md` 与 `skills/molis-plugin-dev/host.md`，不留合入后另改的承诺。


## 6. 2026-10-23 评审修复验证

- RAC-180：实际 `ActionService` 嵌套调用追加未知字符串字段（包括值为 `undefined`）或符号键时拒绝，目标处理器没有运行；合法拷贝、可选字段省略与显式 `undefined`、去掉出处均通过。处理器返回后的异步后续仍拒绝伪造。
- RAC-181、183：当前动作冻结、精确提供方授权保持通过。RAC-182 新增无任何检查的上下文：其他动作无提供方拒绝，当前动作省略提供方及其他动作明确提供方均通过。
- RAC-184：路由只提取 `reference`，动作 schema 保持 `additionalProperties: false`；伪造 management/x/y 的请求返回 200，实际处理器拿到 `web`、`web:<项目>` 和 `web:request:`，目录委托目标沿用该次请求的同一出处。
- 故障有效性：临时让 `projectRouteControl` 沿用调用者而不写可信出处，重建 local-host 后 RAC-184 退出 1，实际出处 `undefined` 不等于 `web`。恢复完整生产文件并整体构建后，本文件 8 项测试全部通过；故障不在提交里。
- 定向：`security-invariants-trusted-user-action` 8、`security-invariants-doc` 1、`action-authority-tail` 10、`action-before-effect` 23、`action-retained-authority` 6、`action-authorship-dispatch` 2，共 6 文件 50 项通过。整体 `pnpm build`、包边界、API 快照、健康门禁通过；健康与资源检查基点为 `acc71ae473`。27 个页面资源共 7,811,882 字节，未增加额度，API 保持本片原有两个快照变化。
- `affected-tests` 仍要求共享核心全量：按统筹安排交下一统一验证窗口，本次未跑全量、未作用户验收。长生命周期入口是否在处理器域内创建仍在该窗口核实；发现拒绝先查作用域，不放宽安全断言。

## 7. 入口竞争回归夹具补修（2026-10-23）

`tests/host-entry-consistency.test.ts` 要模拟独立管理入口与 MCP 读取竞争；旧夹具在读取处理器的同步 hook 里直接发管理写入，因此实际继承处理器的 AsyncLocalStorage，新增 `user_action` 应由 RAC-180 拒绝。其 finally 再次等待已拒绝的写入，使后面的 Host/HTTP 关闭被跳过，失败进程无法退出。只修夹具：在任何动作处理器外创建独立 AsyncResource，hook 当场经其作用域发起管理调用，保留原竞争时机、first/later 列表、幂等重放与 Session 审计断言；清理逐项等待并收集失败，任一拒绝也继续关闭剩余资源。不改生产身份检查或任何门禁。原样与清理诊断用独立临时目录、独立进程组、60 秒上限；超时只回收本次进程组与目录。

验证：源提交 `2304389cd388362835d275a90ffb714346a3fea9` 整体构建后，原样首条在约 2.7 秒报 `kernel.user_action_untrusted` / forbidden，进程仍活到 60 秒被本次有界运行回收。仅修清理的中间诊断保留同一拒绝，约 7.7 秒自行退出 1、没有超时或取消，证明清理不再被拒绝短路。加入独立入口作用域后，原文件 2/2 通过、约 9.5 秒退出 0；三次独立临时目录都已删除。已有 `security-invariants-trusted-user-action` 8 条与 `action-authorship-dispatch` 2 条全部通过，含处理器内及返回后伪造拒绝。最终改动仅测试和本规格，不为夹具改动重复整体构建或浏览器验证；全量继续交统一集成批次。
