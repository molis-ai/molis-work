# Goals Query 读取边界纠正

2026-09-06；沿用 Goal `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` revision 1 的原 Contract，不修改验收、不新增功能。

已完成：21:31 UTC 正式重验恢复 valid/satisfied/completed，cursor 1141。新 Evidence `evidence-8f29fc8c-e202-4f4b-98bf-579329e64416` verified，完整验收见 goals-query-correction-validation.md。下文为本次修复的原因、范围和验收合同，不再作为待执行清单。

## 反证与原因

原 `goals-query-callers` Evidence `evidence-c6f37203-221f-44ce-a364-29d56817d4cc` 声称 Goals 事实 SQL 留在唯一 owner、所有 Web 读 caller 都经公开 Query。当前真实 Web read-view 仍在 `src/web/server.ts:379` 查询全部 policy_bindings，406 查询 goal_risks；这些读取用于页面 Policy 历史和 Risk 关联，不是仅供测试的代码。

Coordinator 的替代 Goal 查询、领取依赖与风险、完成阻塞风险、依赖/风险摘要也仍直接读 Goals 的表（1441、2080、2456、2493、2688、2703）。读取事实的职责应归 Goals；后续动作判断、错误原因和 UI 编排不因此并入 Goals。原 scanner 只检验公开 Goal 详情的应用入口，未覆盖这些真实旁路，所以旧测试通过不能证明“全部 caller”。

不否认已建立 Query/Repository、已有 211 / 493 项历史行为测试，不将本次发现描述为数据损坏。撤回的仅是过度声称的边界 Evidence，历史记录保留；新的验收需补真实读取路径及失败敏感性证据。

## 范围与设计

唯一结果：Web 与 Runtime 现有 Goal 事实读取统一经过公开 Goals Query，行为不变。

- 复用当前 Goals Query 的 Goal、Relation、Risk 与链接数据。新增接口只针对已存在的消费缺口，不公开 SQL/Repository。
- Policy 历史需要全部状态、原标识/来源/理由/创建时间和 `created_at, policy_binding_id` 顺序；不能拿只有 active 且无来源的 resolvePolicy 数据替代。有效策略的优先级和现有 snapshot 结构保持不变。
- Web Risk 关联使用 owner 的公开读取；保持实际合法跨 Goal 关联、排序与页面呈现，不引入新共享或隐私策略。
- Runtime 替代/依赖/风险事实通过公开查询读取。保留原 Board 范围、最新替代排序、直接关联的风险规则、state/阻塞模式和输出；保持有 snapshot 的路径一致，不重写 Execution 的领取、复核、完成判断。
- 实现位置：contracts/modules/goals、modules/goals 的 Query/Repository（必要时按读取结果拆 helper）；既有公开应用/Host composition、src/web/server.ts 对应读取段、src/v1/coordinator.ts 对应事实读取段；测试、边界检查和就近文档。禁止把整份 Coordinator / server 搬进 Goals，不放宽 huge class 限制。
- 非目标：schema、用户数据、现用 4173、安装、模型、DD 父项决定、全产品 Cutover。不是重做 GW4 的 Command adapter 或 DD2 的 Proposal 物化。

## 验收与验证

1. 原 goals-query-callers：上述旁路退出，真实 App / Runtime caller 只依赖 public Contract，事实 SQL 留 Goals；边界检查故意恢复旁路时应失败。
2. 原 goals-query-parity：全部 Policy 历史及顺序、Risk 关联、替代/依赖/领取/完成原因，与原行为独立对账；跨 Board、archive/trash 等原语义保留。
3. 真实前端：项目/Goal 工作规则和风险页、修改后刷新/失败恢复仍可用；复用现有真实 Chrome Policy/Safety 场景。后端：真实 Web view/API 与 Runtime 领取、依赖和完成门禁经过新读路径，不只测 helper。

定向命令：`node --import tsx --test --test-concurrency=1 tests/goals-query-module.test.ts tests/v1.test.ts tests/web.test.ts tests/goals-project-policy.e2e.test.ts tests/goals-safety.e2e.test.ts`；按改动增加直接生产路径场景和边界反证。受影响包构建、root tsc、`node scripts/check-package-boundaries.mjs`、`git diff --check`。测试使用隔离数据库/端口，完成后按原两条验收提交 fresh Evidence 和 Review。

依赖保持原状；先通过正式 Evidence correction 恢复真实未完成状态，再按返回动作执行。若只撤回证据后系统没有提供执行入口，使用正式受影响 criterion 的 rework，而非用旧 Claim 绕过门禁。
