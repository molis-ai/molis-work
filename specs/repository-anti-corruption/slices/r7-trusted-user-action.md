# R7：可信的 `user_action`，找自己的动作不再写提供方（PG-029、PG-030、BL-374）

状态：开发完成、等评审（2026-10-23，防腐线 ac-kernel 片）；验收 RAC-180～184 的测试在 `tests/security-invariants-trusted-user-action.test.ts`，全量与统一验证窗口后补。

## 1. 目标

- **PG-029**：`caller.user_action`（一个人经受保护入口做的操作：来源、会话、消息）只由入口给。插件写的、输入里带的、处理器里自己补的一律不认。Goals S9 删掉宿主手写的 web 来源之前，平台先要有这一条。
- **PG-030**：处理器嵌套调用时 `retainActionAuthority` 不再要求插件写出自己的 `provider_id`：平台按这次分发解析出的提供方去找「自己的动作」。
- **BL-374**：Lingguang、Cognia 的 `caller.retainAuthority?.([definition])` 不带提供方 id，在只认精确动作授权的入口（外部 MCP 客户端按动作给的授权）下最终检查对不上（`mcp.action_revoked`）。由内核在保留时钉住解析出的提供方，插件代码不用改。

## 2. 设计

### 2.1 `user_action` 只由入口给（PG-029）

1. 合同：`ActionCallContext.user_action` 的形状提成具名类型 `ActionUserAction`（`packages/contracts/src/platform/actions.ts`），字段不变；文档写明只有入口给。
2. 内核：每次分发在处理器之前过 `assertCallerProvenance`（`packages/kernel/src/action-authorship.ts`，与 `authorship: "session"` 同一处）。分发发生在一个处理器的异步作用域里（内核自己的 `AsyncLocalStorage`，处理器返回之后它留下的工作也算）时，这次调用的 `user_action` 必须与那个处理器收到的逐字段相同，或者不带；自己写的、改过的、原调用没有却补上的，拒绝（`kernel.user_action_untrusted`，类别 forbidden），目标处理器不运行，调用记录里是一行「未执行」。
   - 只比对、不改写：沿用原调用的出处（插件动作目录 S-43 的嵌套调用者、`retainActionAuthority` 包出来的调用者）照常通过；去掉它也通过。
   - 不在任何处理器作用域里的调用（宿主入口：页面路由、管理命令、MCP 网关）由入口自己负责，内核不判断。
3. 入口：页面路由。`apps/local-host/src/plugin-actions-client.ts` 的 `projectRouteControl` 带着本人的调用者时（项目插件的路由 `project-plugin-http.ts`，Home 插件在项目里的路由 `home-plugin-http.ts`），给这个调用者加 `user_action = { source: "web", conversation_ref: "web:<项目 id 或 home>", message_ref: "web:request:<随机 id>" }`，一次请求一条消息；调用者原来带的被覆盖。插件经这个路由调自己的动作（`routedActions`），处理器收到的就是它。
   - 没有改：Goals 的宿主转接（`goals-actions.ts` 的 web 与管理入口、`personal-planning-actions.ts`）仍按动作手写出处——它们是 S9 要删的私路，本片只给 S9 准备平台那一半。管理入口（`molis-work v1`、管理 MCP）的通用出处等 S9 迁移时按同一写法给。
   - 插件页面经 `pluginPageActions` 调自己的动作时不给出处（那条路造的调用者不是本人的路由调用者）；需要时另开一行。

### 2.2 找自己的动作（PG-030、BL-374）

1. 合同：`ActionExecutionContext.current_action`（可选，冻结）——这次分发的动作和解析出的提供方，只由内核写。
2. `retainActionAuthority(context, origin, beforeEffect?)`：`origin` 可以不带 `provider_id`，这时它必须是正在执行的动作（`current_action` 的动作与版本），提供方取 `current_action` 的；别的动作不带提供方的拒绝（`actions.reference_invalid`）。带提供方的照旧。
3. 内核 `retainAuthority(references)`：不带提供方、指向正在执行的动作的，按这次分发的提供方解析（不是目录里先找到的那一个）；任何引用解析后，后续检查（`validate_authority`、`assert_authority_current`、后台复查）都带解析出的提供方，所以只认精确动作授权的入口能对上。
4. Feed、Inbox 的 `retainActionAuthority` 调用去掉自己钉的 `provider_id`（`plugins/native/feed/src/{content,item,rule,source}-actions.ts`、`plugins/native/inbox/src/{actions,content-actions}.ts`）。宿主自己的提供方（`apps/local-host/src/*-actions.ts` 里的 `system.*`）和 `horizontal/*` 的不在本片范围，留原样。

## 3. 验收

| 编号 | 内容 | 测试 |
| --- | --- | --- |
| RAC-180 | 在正在执行的处理器里发起的调用，写了自己的 `user_action`（与原调用不同，或原调用没有）被拒（`kernel.user_action_untrusted`），目标不运行；处理器返回后留下的工作也一样；沿用原调用的、或不带的通过；不在任何处理器里的入口调用照常 | 「RAC-180 …refused before its handler runs」「RAC-180 …carries the handler's own user_action, or none」「RAC-180 …work a handler left behind」 |
| RAC-181 | 处理器从 `current_action` 读到这次分发的动作与解析出的提供方，对象冻结 | 「RAC-181 …」 |
| RAC-182 | `retainActionAuthority` 不带提供方时用正在执行的动作的提供方，每次检查都带它；别的动作不带提供方的拒绝 | 「RAC-182 …」 |
| RAC-183 | BL-374：`retainAuthority([定义])` 在只认精确动作授权的入口下通过 | 「RAC-183 BL-374 …」 |
| RAC-184 | 页面路由给插件自己的动作 `user_action`（source `web`、项目的会话、每个请求一条消息）；请求体里带的不被读（动作 schema 拒绝，不运行）；经动作目录委托的目标看到同一份 | 「RAC-184 …」 |

## 4. 安全不变量

新增一条（号由统筹分配，测试名里暂写 `S-XX`，合入前换成正式号并在 `docs/system/SECURITY-INVARIANTS.md` 加行）：`user_action` 只由入口给；处理器作用域里的分发只能沿用或去掉，写了自己的拒绝；页面路由入口给 `web`。

## 5. 对调用方的影响

- 合同：新增导出类型 `ActionUserAction`、可选字段 `ActionExecutionContext.current_action`；`retainActionAuthority` 的 `origin` 放宽为 `ActionReference`（原来的调用写法都还成立）。没有动作 schema、MCP 工具名、Manifest 的变化。
- 行为：一个处理器里再给嵌套调用写 `user_action` 的代码会被拒。main 上查过，宿主里写 `user_action` 的只有 Goals 的入口转接、个人规划与管理入口，它们都不在处理器作用域里；如果某条在处理器里经进程内 MCP 管理工具调 Goals 的路径存在，它现在被拒——这正是本条要的。
- 插件作者：`retainActionAuthority(caller, ownDefinition)` 即可，不用 `{ ...def, provider_id: MY_PLUGIN_ID }`。
