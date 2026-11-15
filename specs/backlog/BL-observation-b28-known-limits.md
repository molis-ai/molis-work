# BL-observation-b28-known-limits

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-observation-b28-known-limits | 工作记录第 28 批留下的已知限制（2026-11-14 后续整改修了 ⑥；第 29 批已补齐 ①②③：① `apps/workbench/src/scripts/client/work-records.ts` 在离页/隐藏时循环分批 `keepalive` 排空全部队列（`tests/observation-shell-stages.test.ts`）；② 工作流交接在取消或撤权后不再写失败步骤的用例已补齐（`tests/observation-workflow-steps.test.ts` `OCL-11 S-35`）；③ 嵌套子代理模型请求归属最近受跟上级轮次的用例已补齐（`tests/observation-agent-runs.test.ts` `OCL-01 OCL-04`））：仍留 ④ 项目类别（是不是演示项目）读失败时，这个项目的记录按真实工作记；⑤ 金样里的观测库没有记录行：并发调用结束的先后决定记录的顺序、编号与证据加密取到的随机数，生成时不写记录（`holdObservationRecords`，见 golden-replay-design §2）——观测库第一次升结构之前，要补一份能按确定顺序生成的记录样本，让升级段有行可验； | [#2059](https://github.com/molis-ai/molis-work/pull/2059) 评审台两轮；第 29 批已消解 ①②③ | 已知缺口 | ④ 影响小，维持安全保守默认；⑤ 观测库还是第 1 版，首次升结构前补确定顺序样本 | 第 28 批（#2059） | 低 | 观测库首次升级结构主会话（待分配） |
