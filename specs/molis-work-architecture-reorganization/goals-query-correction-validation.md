# Goals Query 读取边界纠正验收

2026-09-06；Goal `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` revision 1。对应 `goals-query-correction.md`，没有改原 Contract。完成等级：当前查询切片功能可用，真实前后端和 Runtime 回归通过；不是全产品重组或最终发布验收。

## goals-query-callers

通过。原 Web Policy 历史和 Risk 关联 SQL 已删除，改用 `GoalReadApplication` 的两个公开查询委托，再由 `GoalsQueryApi` 进入本模块。规则历史独立于 active-only 策略计算，完整保留标识、全部状态、来源、理由、时间与原排序；持久化 Goal 级 scope 保持 `goal`。

Coordinator 的替代关系、依赖、开放风险、完成风险与摘要 SQL 已删除。`activeReplacement/listDependencies/listOpenGoalRisks` 只给事实；领取、完成、复核规则、原错误原因及 snapshot 优化路径仍归原应用，没有迁入第二状态机。`query-facts-repository.ts` 66 行，事实 SQL 留唯一 Goals owner；复用原 Risk mapper，不扩原 518 行 Repository。

真实入口检查器已接入 root Web / Coordinator / MCP / CLI 的 Goal 表 SQL 防回流检查。`tests/goals-query-boundaries.test.mjs` 读取这些真实文件，逐一故意恢复 Policy、Risk、关联/依赖 SQL，确认检查器拒绝。不是只检查接口名字或目录存在。

公开 Contract / Goals 包 / root tsc 通过。边界 48 packages / 513 sources / 1,588 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge / 0 errors。root Coordinator 2,675 行、server 3,230 行，仍有其他 owner 装配与历史职责，不能宣称全部 huge class 已退出。

## goals-query-parity

通过。新增 `tests/goals-query-facts.test.ts` 用生产 Goals Query、真实 Web view、Runtime explain 路径读取隔离内存 DB。独立断言：相同时间按 ID 排序的 active/replaced/withdrawn 规则、旧来源与理由、有效规则计算；archived/trashed 依赖仍参与原读取；同时间最新替代关系；开放/已关闭与跨 Board 风险；一个风险关联多个 Goal；领取返回的具体依赖与风险原因；查询不创建 Claim 或修改 Goal/Risk。

正式原子写入、错误、幂等及完成门禁继续由 V1 测试覆盖。真实 Chrome 项目规则和风险维护验证输入校验、保存失败输入保留、恢复重试只写一次、继承效果、receipt 消费和重新加载；没有用 helper 测试替代页面操作。

最终命令：

```sh
node --import tsx --test --test-concurrency=1 tests/goals-query-module.test.ts tests/goals-query-facts.test.ts tests/goals-query-boundaries.test.mjs tests/v1.test.ts tests/web.test.ts tests/goals-project-policy.e2e.test.ts tests/goals-safety.e2e.test.ts
```

**182 tests / 182 passed / 0 failed / 0 skipped，25.47 秒，exit 0**。日志 `/private/tmp/goals-query-correction-acceptance.log`，进程已结束。此前核心回归 119/0/0，`/private/tmp/goals-query-correction-core.log`。构建、边界和 `git diff --check` 通过；后续仅更新说明，不重复无变化测试。

首次类型检查发现新查询尚未接入 Module 的 public facade、旧 Row/JSON helper 已无 caller，均已补接/删除。新增 fixture 首次误用类型里的 `goal_override`，SQLite 的既有 scope 实际是 `goal`；按真实持久化/界面协议修正 fixture 和新历史记录类型，没有改 schema、放宽约束或改变旧策略计算。

## 历史纠正与边界

旧边界 Evidence `evidence-c6f37203-221f-44ce-a364-29d56817d4cc` 已通过不可变纠正 `evidence-correction-a5996146-ffd0-44e9-bc4b-a93d62761037` 撤回，原 Evidence/Review 与历史行为测试保留。这份验收补足原缺口，不改写旧成功次数。

本次没有改用户数据、现用 4173、安装或模型配置。DD 父项收口提案仍待用户决定。Goals Mutation 父项仍需完整覆盖核对；全产品 E2E → 清理 → 再 E2E → 原始架构/包/huge class/调用链/开发规范总审查继续保留。
