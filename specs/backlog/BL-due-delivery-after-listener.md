# BL-due-delivery-after-listener

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-due-delivery-after-listener | 到期登记「成功后才清」不覆盖真正告诉本人的那一步：助理提醒监听异步失败、或交付时还没有监听，到期项已清，提醒或 Images「生成被中断」通知会丢。修法：监听返回 Promise，`deliverDue` 等它完成再算成功；Images `onDue` 按到期项判断是否已说过，而不是按作业状态 | 第 108 批独立审查（PR [#2348](https://github.com/molis-ai/molis-work/pull/2348)） F-6 | 已知缺口 | 只在监听抛错或启动顺序异常时出现，不会重复写业务 | 无 | 低 | B 轨（执行会话待分配） |
