# BL-model-preference-save-overwrite

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-model-preference-save-overwrite | 保存新的模型选择时不看原文件、整份替换，会把版本更高的文件盖掉：`apps/local-host/src/model-configuration.ts:59` 的 `saveSettings` 直接 `atomicWrite` 整份 `{schema_version: MODEL_PREFERENCE_SCHEMA_VERSION, provider_id, model_id}`（:98），没有先读原文件的版本；`docs/releases/CHECKLIST.md` 第 3 节「插件的模型选择」一行也把「保存新的选择时不看原文件，整份替换，所以版本高的文件也会被盖掉」记为现状。读的时候版本不是 1 会报 `host.model_configuration_invalid` 并保留原文件，但保存路径没有同样的版本核对，别的进程或更新版本写的偏好文件会被这一次保存覆盖 | 第 02 批评审 + 2026-11-08 审计 | 明确后续做 | 不在第 02 批修，归第 05 批或后续；改保存路径要动宿主设置的文件读写与版本核对，并补「高版本文件被保留、保存被拒」的用例 | 第 05 批升级链（`VersionedFile.upgrades`）就绪后一起看 | 中 | 宿主设置维护人（执行会话待分配） |
