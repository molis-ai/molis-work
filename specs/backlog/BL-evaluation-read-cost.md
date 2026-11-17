# BL-evaluation-read-cost

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-evaluation-read-cost | 评测读取证据快照时每条记录调用一次 `observation.evidence.get@1`；一个有 N 条证据记录的样本会产生 N 次动作调用（记录查询已分页，且默认读完整个样本）。正确性不受影响，但大样本的调用次数偏高，属于 N42 类问题 | 第 30 批合后独立审计；`horizontal/evaluation/src/observation-bridge.ts`、`tests/evaluation-service.test.ts` | 已知缺口 | 批量解封要动 observation 的公开读取合同（新动作、版本、API/动作快照与权限拒绝用例），不在最小评测路径内；先用现有逐条动作保证可追溯 | observation 提供批量证据读取后改评测 bridge | 低 | 横向评测（待分配） |
