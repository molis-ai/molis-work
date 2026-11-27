# BL-due-delivery-after-listener

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-due-delivery-after-listener | 第 108 批 起，无监听的交付已失败并保留登记。其后独立复核复现了监听异步写入失败时的丢失。本轮的 [B2R-03](../b108-review-remediation/spec.md) 让宿主等待写入回执，Images 按登记重投中断结果。验证见 [助理提醒回归](../../tests/assistant-reminders.test.ts)。 | [修复验收 B2R-03](../b108-review-remediation/spec.md) | 已知缺口 | 完成代码修复，待合入复验。 | 无 | 低 | B 轨（执行会话待分配） |
