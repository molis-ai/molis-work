# BL-b44-onboarding-mail-source

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44-onboarding-mail-source | 上手的邮件来源仍叫 `gmail`：读邮件已改走 Gmail 包的 `MailboxDriver`（44B PR3），但上手的来源种类、OAuth 回来后挂到哪条来源（`connector-oauth-return.ts`）和上手页面的文案与按钮（`apps/workbench/src/scripts/context-onboarding.ts`）还按 Gmail 写；改成按「声明了邮箱驱动的集成」列出与连接 | 第 44B 批 PR3（[44b.md](../post-anticorruption-roadmap/reference/batches/44b.md)「连接器驱动化」） | 明确后续做 | 改上手页面文案与动线属于界面改动，要按上手定样一起做 | 第 44B 批合入 | 低 | 待分配 |
