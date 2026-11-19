# BL-b35-review-followups

分组：9. 平台小项与工程流程

第 35 批 PR #2123 评审台（头 0372d594b1、0ccdb47396）与公共合同台（头 f14b918335）列出的不挡合并的小修，本批没做。

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b35-review-followups | ① 沙箱读附件图片每一段都整份重读、重算 sha256、重开库（`packages/plugin-sandbox/src/materials.ts`），改为首段核一次摘要、其后按偏移读（S2）；② Coding 历史消息每张图一个请求、每个请求再读一遍会话与轮次（`plugins/native/coding/src/routes-images.ts`），改为一轮一个请求，`URL.createObjectURL` 补 `revoke`（S3）；③ 6 张、5 MB 与图片种类在 agent-host、Coding、沙箱各写一份，收进合同的 `CONVERSATION_ATTACHMENT_LIMITS`／`CONVERSATION_ATTACHMENT_IMAGE_TYPES` 并加张数常量（S4）；④ `horizontal/agent-host/src/code-intelligence/tool-fetcher.ts` 的 `options as ToolFetcherOptions` 改为只要所需字段（S8）；⑤ `apps/local-host/src/material-attachments.ts` 的 `forget` 与同一摘要写入的竞态：清理可能删掉另一主人刚写的 blob；同一份文档在助理里并发带两次时，先读完的一次会删掉共用的行，另一次报找不到。删 blob 前再查一次行或与写入共用一把锁（S9）；⑥ 组件板示例图写死浅灰（`packages/design-system/src/primitives/coding-basics.ts`），改为随主题（S10）；⑦ `apps/local-host/src/index.ts` 为测试导出的内部函数注明或收进测试入口（S12）；⑧ 公共合同台建议：`PluginMaterialsClient.attach` 用 `materials:read` 授权却持久保存字节，日后要不要像 `materials:original` 那样单列权限；`plugin-sdk/src/ui/coding-basics.ts` 里的命令签、检查行是通用部件，改名为 `command-chip`／`check-line` 一类 | [第 35 批](../post-anticorruption-roadmap/reference/batches/35.md#batch-35-record)；PR [#2123](https://github.com/molis-ai/molis-work/pull/2123) | 明确后续做 | 不挡合并，本批按评审结论先合；各条都有现成的改法 | 无 | 低 | 下一批小修子分支（执行会话待分配） |
