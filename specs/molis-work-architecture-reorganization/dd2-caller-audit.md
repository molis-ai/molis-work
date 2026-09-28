# DD2 调用与旧职责退出检查

2026-09-06。对应 `goal-reorg-dd2` revision 1；只审查这一条提案与决定链，不代表整个 Coordinator 已清空。

## 实际调用链

| 入口 / 职责 | 现在的实现 | 保留的边界 |
| --- | --- | --- |
| Local Host / CLI / MCP | `src/local-host/composition.ts` 绑定 Goals Plugin 的既有 capability；Apps 继续使用公开客户端 | 既有参数、返回、错误身份、可信 Runtime / 用户来源 |
| native submit / list / check / decide | `goal-tree-submission.ts`、`goal-tree-query.ts`、`goal-tree-check.ts`、`goal-tree-decision.ts` | check 使用预览 savepoint；submit 不落正式事实；decide 使用原事务 |
| 历史提交 / 决定 | `legacy-proposal-submission.ts`、`legacy-contract-decision.ts`、`legacy-candidate-decision.ts`、`legacy-rewire-decision.ts`、`legacy-goal-tree-decision.ts` | Candidate 批准和 Rewire 决定仍是两步；统一历史 ID 仍可恢复 |
| 输入 / 决定计划 / 修订 | `goal-tree-decision-inputs.ts`、`goal-tree-decision-plan.ts`、`goal-tree-decision-followup.ts` | 精确用户确认、旧 baseline、逐项决定、完整修订及等价历史 Rewire 对账 |
| 正式事实 | Goals 的 confirmed Goal/Relation/Policy/Risk commands；Execution 有限 lifecycle / revision API | Plugin 不访问 Store、Repository 或跨 owner SQL |
| 提案 / 幂等 / 事件 | Governance 的 `goal-tree-records.ts`、`proposal-operation-store.ts`、`record-store.ts` | 原表、operation key、请求 hash、结果 JSON、事件与同连接总事务 |
| Web 风险修订 / 自动退回理由 | `GoalTreeWebDecisionInput` 准备输入，HTTP Host 再调用决定应用 | Host 保留输入检查顺序、鉴权、可信用户消息和 HTTP 错误；准备阶段不写事实 |
| native 提案展示 | `proposal-ui.ts` contribution，`proposal-presentation.ts` / `proposal-issue-copy.ts` | Workbench 经 UiHost mount；只给语言、转义、图标和列表等通用能力 |
| 历史提案展示 | `legacy-proposal-ui.ts` contribution，Contract / Candidate / Rewire 三个 renderer | 保留旧 DOM、来源、禁用按钮、关系记录及独立决定 |
| 分组 / 最近结果 | `decision-groups.ts`、`decision-results.ts`、`decision-results-ui.ts` | 从公开返回的 actions 判断风险待办，不复制权限算法；最近六项及原事件顺序不变 |
| 页面与 Feed 组合 | `apps/workbench/src/decision-center.ts` | 输入各 owner 已生成的片段；不下沉成 Goals Plugin 调用 root 产品函数 |
| 浏览器提交 | `proposal-client.ts`，Workbench 原 submit listener 只分发 | 保留错误恢复、理由焦点、按钮原状态、整份确认与风险修订请求体 |
| 文案与样式 | `decision-copy.ts`、`decision-common-ui.ts`、`proposal-en.ts`、`proposal-styles.ts` | Locale catalog 统一组合；CSS 在原位置和 media query 内插入，不改变层叠顺序 |

## 退出与大文件

旧 Coordinator 的 native 四入口及全部六个历史提交/决定方法、独占 helper 已删除；Host caller 已改绑，不保留转发 facade。原 `src/web/human-language.ts` 已删除。旧 renderer 的完整 native/historical 提案、分组与最近结果实现已移出，提案提交 listener 不再保留产品分支。

新增展示实现按实际职责拆分：native 主 renderer 349 行、提案说明 184 行、问题提示 199 行；历史三个 renderer 为 138 / 89 / 134 行；分组 130 行、最近结果 264 行。没有把原大函数包成另一巨大类，也没有放宽已有 owner 限制。

当前 root Coordinator / renderer / server 为 2,771 / 2,240 / 3,243 行。它们仍是待清理的历史组合文件；不能把 DD2 完成写成整个 huge class 治理完成。root 保留的 Human Review / Risk 决定表单、跨产品 Shell、Feed 适配及其他应用装配由各自 owner / 最终 Cutover 继续核对，不吸收其他模块。

Workbench 的 receipt、跨 Feed/Goal 刷新、sessionStorage 和焦点恢复是共享页面能力；Proposal Plugin 只调用这些通用能力。正式 Module 权限检查并未交给页面。

## 自动反证

`scripts/check-package-boundaries.mjs` 检查真实入口改绑与 owner 边界，并拒绝恢复旧 Proposal UI 函数、绕过 UiHost mount 或把提交分支搬回 Workbench。`tests/draft-dialogue-boundaries.test.mjs` 故意恢复旧实现、删除注册和改成旧调用，验证检查器确实失败；12 项通过。

当前边界：48 packages / 512 sources / 1,585 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。实际无损与恢复证据见 `dd2-validation.md`。
