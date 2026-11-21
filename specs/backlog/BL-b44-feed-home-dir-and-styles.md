# BL-b44-feed-home-dir-and-styles

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44-feed-home-dir-and-styles | Home 里的 `feed/` 目录放的是平台密钥文件 `feed/secrets.json`（storage 的 `assertSecretStoreWritable`、`home-stores.ts` 的 `feed` 存储），名字仍是 Feed 的；`.feed-*` 样式散在约 16 个平台文件（`apps/workbench/src/styles/*`、`packages/design-system/src/styles/*`），样式门禁只数 `source-`、`goal-` 前缀。应把密钥目录改成平台自己的名字（带真实 Home 迁移），样式搬回 Feed 的按需样式表，门禁加上 `feed-` 前缀 | [第 44 批合后复查](https://github.com/molis-ai/molis-work/pull/2155) 2026-11-20 | 未实现 | 要移动真实 Home 里的密钥文件，需要升级步骤与备份说明；用户 2026-11-20 定记 Backlog 以后排 | `specs/upgrade-continuity/upgrade-chain-design.md` 的文件升级；PG-070 按需样式 | 中 | 插件同等待遇（第 44 批）主会话（执行会话待分配） |
