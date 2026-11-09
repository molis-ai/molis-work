# BL-b05-product-copy-naming

分组：9. 平台小项与工程流程 / 翻译与界面用词

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b05-product-copy-naming | #1979 把项目设置里这块页面的导航标签改成「输入与输出」（英文 `apps/workbench/src/i18n/renderer-gap-en.ts:709` 是 "Inputs and output"），三份插件 README 本次也已改成 "Project Settings → Inputs and output"，但产品内文字仍是旧叫法：`plugins/native/schedule/src/messages.ts:21` 的「打开工作目录设置 / Open workspace settings」、`plugins/native/files/src/messages.ts:56` 与 `plugins/native/git/src/messages.ts:194` 的「工作目录设置 / Working folder settings」；`tests/schedule-readiness.test.ts:128` 仍断言「打开工作目录设置」并指向 `/projects/p1/settings/workspaces`（设置页分区 id 与 URL 仍是 `workspaces`，导航标签已是「输入与输出」）。这些文字与断言要在各自界面落地时一起改，并决定设置页分区 id/URL 是否跟着改名 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批独立审计（cleanup-global T6/materials 分册） | 明确后续做 | 本批改产品文案会和第 16 批「工作台、宿主和内置插件换成稳定键与语言文件」的迁移撞；本次只改 README 与审计记录，messages 与测试按第 16 批规则随各自界面做 | 第 16 批文字与外观能力；设置页分区 id/URL 改名（如决定改） | 中 | 内置插件（E 轨，执行会话待分配） |
