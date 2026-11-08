# BL-feed-product-version-replay

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-feed-product-version-replay | 产品版本每变一次，Feed 每条捕获线在成果库多一个内容相同的版本：`plugins/native/feed/src/out-rules.ts` 重放时 `sameVersion` 判不同，接住 `version_conflict` 后写出最新版本加一。每条线每个产品版本最多多一次，不报错。无上限的那部分已在第 02 批复查修复时修掉（`out-rules.ts` 的 `supersedes`） | 第 02 批复查（2026-11-07） | 明确后续做 | 要给 `PluginArtifactWriter` 加读 `origin.revision`，或给 Feed 加 `artifact:read`，都是改合同或权限声明。要赶在第一次改产品版本之前 | 无 | 中 | E／Feed（执行会话待分配） |
