# BL-b44-information-plan-to-feed

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44-information-plan-to-feed | `system.information` 的 `information.plan` 是平台提供方，却按能力 id 点名 `feed.snapshot`、`inbox.list`，输入输出也是 Feed 自己的形状（`configure_filter` 的来源与样本）。应整个搬进 Feed；用户改过的提示词挂在 `system:information` 名下，搬家要带提示词设置的迁移 | [第 44 批合后复查](https://github.com/molis-ai/molis-work/pull/2155) 2026-11-20 | 未实现 | 只改成按目录发现等于换名字；真正搬家涉及提示词归属迁移，用户 2026-11-20 定记 Backlog 以后排 | 提示词设置的归属迁移（`docs/system/CONTRACT-CHANGES.md`「当前保留机制」先经用户确认） | 中 | 插件同等待遇（第 44 批）主会话（执行会话待分配） |
