# DD1 草稿澄清与恢复验收

2026-09-06。Goal `goal-reorg-dd1`，Contract revision 1。完成等级：本项既有功能可用，受影响前后端与 Runtime 用户流程回归通过；不代表全产品重组、最终 E2E 或发布验收完成。生命周期结论以 Molis Work 的 Evidence/Review 回执为准。

## boundary

对应 `goal-reorg-dd1-boundary`，检查通过。

| 入口/职责 | 实际路径与唯一 owner |
| --- | --- |
| CLI / MCP 三个草稿操作 | 原 App `draft-dialogue-commands.ts` → 原 typed capability client → Local Host 同 ID/版本注册；输入、返回及 MCP 分页未变 |
| Host | `src/local-host/composition.ts` 三个注册改为 `.draftDialogue` 公开应用；Coordinator 仅负责构造该实例，没有 start/turn/resume 的 facade |
| 用户流程 | `plugins/native/goals/src/draft-dialogue-application.ts`（224 行）拥有开始、回答、恢复的应用组合和工作流检查；不导入 Coordinator/Store 或写 SQL |
| 正式事实 | Goals Query/Command 读建 Goal；Execution Query/Validation 读 Claim/Run、选择澄清工作；Governance provenance 保留事实/假设区别 |
| 澄清记录与原子性 | `modules/governance-collaboration/src/clarification-store.ts`（123 行）维护现有 Session/Turn、事件和原幂等记录；所有 Command 在同一 SQLite 连接的同步事务内运行，不新增数据库、表或双写 |
| Web | 没有专用的 Web start/turn/resume 表单可迁。既有 GW5 草稿编辑贡献保持原状；既有服务读取澄清 ID/历史，仍消费同一 snapshot，未新增 UI 功能 |

真实调用链与公开类型经源码检查、构建和 CLI/MCP 集成验证。原 EX4 的公开 ExecutionValidation 依赖继续复用；其 root 装配/内部历史回调不在本项重新实现。Draft 应用没有回调旧草稿实现，也不复制执行授权/租约状态机。

## exit

对应 `goal-reorg-dd1-exit`，检查通过。

- Coordinator 的 `startDraftDialogue`、`recordDraftDialogueTurn`、`resumeDraftDialogue` 三个实现及生产旧调用清零；移除独占 `readDraftDialogueView`、`requireOpenClarificationSession`、`requireActiveClarificationRun` 和 `draftTitleFromIdea`。
- root Store 的 clarification snapshot 查询与两段记录映射已删除，改经 Governance owner；没有机械迁走整套 Store。
- 参数归一化、标题截断、请求 hash 字段/排序、operation/key 范围、错误码/文案、事件 payload、会话状态和历史排序对照原实现。幂等重放仍先于新写入与活跃 Run 检查；保留旧响应，不因重启/过期重造记录。
- 共享 helper 仍有 DD2 caller，保留而非误删。`closeOpenClarificationSessions`、native/legacy Proposal 与决定编排由 DD2 迁；原 schema 初始化和最终 Host 装配由后续清理处理，未宣称全部 Coordinator/Store 已退出。
- Coordinator 当前 8,496 行、root Store 1,235 行；仍有 5 个 legacy huge files，行数不作完成替代证据。
- 模块文档、两个 package README、SSOT Matrix、Migration、Huge Class、DD 计划与续接点已更新。
- 包边界检查修正已删除方法作为 Query 区间终点的历史假设，继续检查真实 Query 委托。新增 DD1 检查实际接入生产 scanner；故意恢复旧 facade、Host 调用和 Plugin SQL 均能被拦住，未放宽原 owner 规则。

## result

对应 `goal-reorg-dd1-result`，检查通过。

新增 `tests/draft-dialogue-application.test.ts`：

1. 在真实记录写入之后注入失败，断言整个 Goal/Claim/Run/Session/Turn/事件 snapshot 回滚；相同幂等键重试成功且不重复，回答输入保留，Goal 仍是 Draft。
2. 错误 actor、Goal、Board 写入拒绝且持久化状态不变；租约过期禁止新回答，恢复同一个 Session、保留原历史、只有一个新的活跃 Claim/Run；历史重放仍有效，变更 payload 复用 key 被拒绝。
3. 两个独立 Runtime 子进程在都就绪后同时调用相同 MCP start/turn，数据库真实争用而非单进程 Promise 假并发。得到同一 Goal/Session/Run 与一份回答；关闭两进程，第三个进程恢复并分页读取完整历史；持久化仅一份 Goal/Claim/Run/Session、两条实际 turn、零 Proposal。

既有 V1 / 跨入口测试进一步覆盖原 Goal 开始澄清、accepted frontier 复用已选 Run、拒绝领取整体回滚、只有批准 Contract 才关闭会话、不把推断当用户事实、CLI↔MCP 重放与重启，以及公开 Runtime 从讨论到决定再执行完成的链路。

真实 Chrome 草稿编辑验证新增/删除验收条件、网络失败输入保留、重试仅写一次、刷新后仍是未接受 Draft。Web 回归覆盖既有页面、权限、Decision Center、项目切换、首次使用与中英文切换；不是新建虚假 Dialogue Web 页面。

## commands

通过：按依赖顺序构建 contracts、Governance、Goals Plugin、root：

```sh
node node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json
node node_modules/typescript/bin/tsc -p modules/governance-collaboration/tsconfig.json
node node_modules/typescript/bin/tsc -p plugins/native/goals/tsconfig.json
node node_modules/typescript/bin/tsc -p tsconfig.json
```

初轮 V1/跨入口/Runtime 回归 118 通过；新增应用验证 3 通过。最终代码的串行验收：

```sh
node --import tsx --test --test-concurrency=1 tests/draft-dialogue-application.test.ts tests/draft-dialogue-boundaries.test.mjs tests/proposal-entry-chain.test.ts tests/runtime-skill-flow.test.ts tests/v1.test.ts tests/web.test.ts tests/goals-draft.e2e.test.ts
node scripts/check-package-boundaries.mjs
git diff --check
```

最终 **182 passed / 0 failed / 0 skipped**，28.97 秒，日志 `/private/tmp/dd1-final-regression-authorized.log`。包边界 **48 packages / 450 sources / 1,249 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge / 0 errors**。diff check 通过。

历史失败保留：首次最终串行在 sandbox 内运行，HTTP listen EPERM 与 Chrome 启动权限导致 19 个测试失败（137 通过）；日志 `/private/tmp/dd1-final-regression.log`。获得正常测试运行权限后，同一代码/同一命令通过上面的完整验收。没有为消除权限错误改产品或跳过测试；浏览器展开的子测试使最终总数不同。所有测试使用隔离项目/临时端口，没有停止或修改用户 4173 服务。

## remaining

本项三项验收无未完成内容。DD2 提案/决定与已复现批次物化顺序问题、Goals Mutation 父项收口、DV4 GUI 首启授权、最终数据/Host 清理和全产品两轮 E2E 仍需继续，不能用本项 182 通过代替。
