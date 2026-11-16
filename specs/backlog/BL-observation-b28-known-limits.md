# BL-observation-b28-known-limits

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-observation-b28-known-limits | 工作记录第 28 批留下的已知限制（2026-11-14 后续整改修了 ⑥；第 29 批已补齐 ①②③：① `apps/workbench/src/scripts/client/work-records.ts` 在离页/隐藏时循环分批 `keepalive` 排空全部队列（`tests/observation-shell-stages.test.ts`）；② 工作流交接在取消或撤权后不再写失败步骤的用例已补齐（`tests/observation-workflow-steps.test.ts` `OCL-11 S-35`）；③ 嵌套子代理模型请求归属最近受跟上级轮次的用例已补齐（`tests/observation-agent-runs.test.ts` `OCL-01 OCL-04`）；第 30 批在观测库首次升结构 `1 → 2` 时补齐 ⑤：按确定顺序写入真实记录、加密证据快照、覆盖行与设置再执行 `runSqliteUpgrade` 并回读解封验证（`tests/home-store-baselines.test.ts`、`tests/observation-evaluation-holds.test.ts`））：仅剩 ④ 项目类别（是不是演示项目）读失败时，这个项目的记录按真实工作记。 | [#2059](https://github.com/molis-ai/molis-work/pull/2059) 评审台两轮；第 29 批已消解 ①②③；第 30 批已消解 ⑤ | 已知缺口 | ④ 影响小，维持安全保守默认 | 第 28 批（#2059） | 低 | 待分配 |
