# BL-goals-contract-forwards

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-goals-contract-forwards | Goals 的 `array`、`nullable` 转发经 `goal-actions.ts` 的 `export *` 进了公开 `./contract`（RAC-1770 钉住）。`goal-event-action-schemas.ts:13` 的 `object` 带更窄的返回类型，不是纯转发，要单独判断 | 第 02 批复查（2026-11-07） | 明确后续做 | 要改约 21 个文件和 `CONTRACT_RUNTIME_EXPORTS`，是公开合同改动 | 无 | 低 | Goals 维护人（执行会话待分配） |
