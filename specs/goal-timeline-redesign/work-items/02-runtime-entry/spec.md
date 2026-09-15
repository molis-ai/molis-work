# 02：事件协议接入 Host、MCP 与 Runtime

状态：accepted。depends_on：01-event-facts（已验收）。执行者为直接 Grok CLI（grok-4.6 / xhigh，no-subagents），主 Session 已独立验收。证据见 implementation.md。

## 用户结果

在已连接的真实项目里，Runtime 能创建一个只描述意图的 Goal，为它登记事件类型、上报成果/验证/观察，再由新 Session 读回当前 Goal 与历史，不需要领取角色或创建 Run。工作规划可以提供类型和默认要求，也可以从无模板起点设计局部类型。用户已有的项目连接和执行授权不反复确认。

## 已确认的调用链

`LocalMcpServer.callTool` 先经过 `mcp-authority.ts`，固定项目/board 与会话来源，再由 `apps/mcp` 适配到 Native Goals 公开 capability。`apps/local-host/src/project-capabilities.ts` 注册并委派应用入口，`GoalProjectApplication` 装配真实 Module。

新入口沿这条路径接入 01 的事件 API。MCP、Workbench 和 Host 不持有业务 SQL；公开 typed input/output 复用 Contracts。普通事件不会通过旧的 Claim/Run/Evidence/Review 生命周期转一遍。

## 行为合同

01 公开 API 为 `GoalsModule.events`：`configure(input)`、`report(input)`、`readConfig(boardId,goalId)`、`listEvents(boardId,goalId,{after_cursor?,limit?})`、`readEvent(boardId,goalId,eventId)`、`readCurrentRequirements(boardId,goalId)`；读取也由 `createGoalReadServices(db).events` 提供。Contracts 从 `@molis-ai/molis-work-contracts/modules/goals` 再导出。配置以 `expected_version` / `idempotency_key` 提交；报告以 `events:[{type_id,type_version,title,fields,judgments?}]` 提交。不复制其校验或 SQL。

新增 Runtime 工具固定为 `molis_work_v1_goal_intent_create`、`molis_work_v1_goal_state`、`molis_work_v1_event_configure`、`molis_work_v1_event_report`、`molis_work_v1_event_list`、`molis_work_v1_event_read`。按现有 schema/catalog/dispatch 与错误包装机制接入，工具 schema 必须完整定义本项字段，禁止新建裸 object payload。动态 fields 使用 string-valued additionalProperties 是明确的已登记字段映射，领域模块继续校验允许字段。

对外输出按实际 `kind` 提供明确的配置事件 payload 与报告文本字段类型（discriminated union），不要让消费者反复猜测 `Record<string,unknown>` 中有哪些属性；内部 JSON 落库仍可沿现有方式，不另建重复解析或 schema 平台。

- 意图创建只要求能辨认的标题，可有结果说明；使用现有 draft Goal 能力保存原始意图，不填造 why、输入输出、拆分检查或默认模板。正式完成仍需有明确要求，创建本身不算完成。
- Goal 读取返回意图/当前约定、实际采用配置、有效要求及最新报告、当前事件游标和可继续的信息。返回量应有界；历史正文按事件 ID 或分页按需读取。
- 配置入口登记类型、版本、局部新增要求，采用规划时保存实际采用版本与来源；不允许随模板库升级覆写已有约定。字段/配置错误需带具体定位。
- 上报入口一次提交多条事件；类型和数据按 01 的真实定义校验。返回“记录成功”的事实及当前报告判断，不伪装成完成、人工验收或 Host 已连接。
- 原始类型不接受 Runtime 自填可信用户身份、独立审核者身份或连接状态。身份从宿主边界传入；显示用名称与来源证明分开。跨项目/board、连接覆盖、伪造用户角色等实际信任边界继续拒绝。
- 新写工具不要求 Runtime 填 actor_id/actor_kind；Host 根据可信 runtime_id 与稳定 Session 信息生成审计身份并固定 actor_kind=runtime。未经许可的 authority/actor_kind/user_approval 等顶层字段明确拒绝，不能因未知字段被忽略而使伪造请求看似成功。若宿主确实缺少必要身份，返回说明如何恢复连接的错误；不能假造 user 来源。现有显式项目连接仍可用，但测试需注入真实结构的宿主 Runtime 上下文，避免访问用户全局 home。
- Runtime 可读取可选的内置/个人/项目规划及相关事件定义；工程开发提供交付、行为验证、界面检查、Concern 的合理起点。采用和“是否成为当前完成要求”是明确选择；仅提供一种类型不要求每个 Goal 都提交该类记录。没有模板也可以工作。
- Runtime Skill 改为读当前 Goal → 在已有授权内工作 → 实质变化时报告 → 按返回差距继续；不用固定角色或无关规划读取环节。暂未切换的旧 Goal 明确其旧协议边界，迁移阶段再删除过渡说明。
- 新会话用原绑定项目恢复，无需重新绑定或重新询问；同请求重试仍使用原幂等键。次级 Session 索引失败不能把已持久化的业务事件伪报为完全未发生。

## 边界

本项只打通产品入口和 Runtime 的事实闭环，不实现正式收尾、用户决定应用、Concern 解决或旧状态机替换，这些属于 03。不宣称新版 GoalDetail 已投入使用。

允许修改面：

- `packages/contracts/src/modules/goals.ts`、`goal-events.ts` 及确需的 `platform/app-host` Runtime 上下文类型：仅公开输入输出/应用端口。
- `modules/goals/src/planning/`、`modules/goals/methods/`：规划包可选事件定义与默认要求、来源版本的解析和保存；可复用 01 API 做采用，但不重写其存储。不要给所有规划机械添加类型。
- `modules/goals/src/event-facts.ts`、`event-facts-repository.ts` 与 `index.ts`：仅为明确的公开事件类型和应用端口接入调整，不改变 01 已验收的绑定、幂等、事务、版本和恢复语义。
- `plugins/native/goals/src/`：新增小型事件应用/capability 文件及 `index.ts`、`goals-entry-capabilities.ts` 的导出或接入；只涉及本项公开事件入口，不修改 UI 和旧完成状态机。
- `apps/local-host/src/goal-project-application.ts`、`project-capabilities.ts`、`mcp-server.ts`、`mcp-authority.ts`：装配、注册和可信调用上下文。可新增同层专属事件 capability/身份适配文件以避免继续扩大大类；不新增笼统 Manager。
- `apps/mcp/src/`：新增专属事件工具 schema/handler，接入 `tool-catalog.ts`、`tool-dispatch.ts`、`index.ts`，按需维护 `runtime-session-activity.ts` 与规划 schema/展示。不得将业务 SQL 或模块内部读写搬来此层。
- `skills/goal-advance/SKILL.md` 及其 `references/`：更新新事件工作主链，暂时明确旧 Goal 的旧协议路径；不修改用户已安装的 Skill 副本。
- `tests/mcp-goal-events.test.ts`、`tests/goal-events-planning.test.ts`，必要时更新直接受影响的 `mcp.test.ts`、`mcp-protocol.test.ts`、`mcp-session-activity.test.ts`、`runtime-skill-flow.test.ts`。不改无关断言，不因旧测试要求固定工具总数而保留失效行为。
- `docs/modules/goals.md`、`modules/goals/README.md`、`apps/mcp/README.md`：仅同步本项行为和公开入口。

不修改 specs、prototype、implementation.md 或其他工作项代码。需要额外范围时指出具体调用依赖，由主 Session处理。单项完成后停止，不自行进入 03，不 Git 提交/推送，不运行真实用户数据库迁移，不安装/发布，不使用 ForkLight。

## 验收

主 Session 2026-09-09 独立复现后的具体验收补充（仍属于本项约定，不转为 03）：

- 状态摘要取当前 Goal 的真正最近报告，超过首个历史分页仍正确，读取保持有界；分页历史与当前摘要不混用。
- 一个模板可被多个 Goal 采用，默认要求在当前 Goal 实例化，不因其他 Goal 采用同名要求而冲突；调用方能从返回配置找到当前 Goal 实际要求 ID 和来源。
- 配置时省略采用规划表示保留原采用；局部类型/要求追加正常工作。模板升级后也能继续使用已保存版本。
- 配置幂等依据原始业务请求；同键同请求在模板升级后仍返回原回执，同键不同请求仍拒绝。不能先解析最新版模板再决定是否重放。
- Runtime 报告支持 human_decision 要求时，当前差距仍明确需要可信用户确认；本项不实现人工确认效果。
- 缺少可信 Runtime 或稳定 Session 信息时，新写入口清楚拒绝，不降为整个 runtime 共用的审计身份。
- 多规划采用按总 spec 合并等价定义/要求并保留来源；冲突给出具体定位且没有部分配置写入。

为上述应用接入修正，允许 Goals 事件契约、事实服务与仓储增加必要的有界最新读取/原请求幂等端口；仅确需时调整相关 schema/validation 与 Host migration 装配，必须保留 01 已验收的作用域、绑定、事务及历史恢复语义，不新增第二套存储或在 Native/MCP 写 SQL。

- 通过真实 LocalMcpServer/Host 在临时项目中创建意图、登记类型、批量报告、读取；整个过程无 Claim/Run 前置，返回与持久化一致。
- 关闭并重建 Host/MCP 后读回类型、历史与当前判断；旧配置版本对应历史正文不变化。
- 验证拒绝跨 board、项目路径覆盖、Runtime 伪造 user 身份；拒绝时没有新业务记录。
- 请求重试不重复记录；无效批次、已断开项目绑定等错误给出可恢复结果，不让合法事实消失。
- 工程规划实际定义驱动配置/报告；无模板 Goal 不暗中采用工程模板，模板变化不改已有 Goal。
- Skill 与工具 schema/响应字段相符，文档不把未接通的完成和审批能力写为可用。

执行命令：

```sh
pnpm build
node --import tsx --test --test-concurrency=1 tests/mcp-goal-events.test.ts tests/goal-events-planning.test.ts tests/mcp-session-activity.test.ts tests/mcp-protocol.test.ts
pnpm boundary:check
```

真实集成参考 `tests/mcp-session-activity.test.ts` 的临时 home、catalog、Host 和 `MolisWorkServer`；不可只测试 handler mock，不能只验 schema 字段存在。规划测试需让实际内置/个人/项目方法读取或保存路径驱动配置与报告，检验采用内容和版本保存后不随方法更改。

交回：工具调用样例与真实响应、公开 API、修改路径、实际命令结果、身份/项目边界验证、下一项可直接消费的入口及任何未完成项。不把事实工具接通称为正式完成/审批或 UI 已完成。
