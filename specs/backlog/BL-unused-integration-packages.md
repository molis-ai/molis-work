# BL-unused-integration-packages

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-unused-integration-packages | 两个官方接入包有整块没人用的代码：`plugins/official-integrations/web-query/` 整个包没有生产调用方；`plugins/official-integrations/youtube/src/index.ts` 的 `youtubeIntegrationManifest` 与 `createYoutubeIntegrationPlugin` 没有调用方（宿主只用 `channel.ts` 的辅助函数）。应删掉，或按 Plugin Runtime 真正接上 | [对抗式审查台账](../../docs/reviews/adversarial-review-2026-11-01.md) N18；第 27 批核对 | 已知缺口 | 删除会连带 `tooling/versions.json` 里这些 Manifest 的版本条目与 `carriers`、`tooling/gates/version-exceptions.json`、包清单与 SSOT 行；动版本表按红线先问用户，第 27 批只删了合同与插件里的零散死导出 | 无 | 低 | 合同维护人（执行会话待分配） |
