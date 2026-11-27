# BL-unused-integration-packages

分组：9. 平台小项与工程流程

状态：已销账（待归档）。`plugins/official-integrations/web-query/` 整包已移除，`plugins/official-integrations/youtube/` 已在第 44B 批收编进 `rss` 连接器驱动并合入 `main`；用户已批准 quality-experience-audit §28 两处门禁调整，见 [本轮报告](../quality-experience-audit/report.md)。下表仅留作历史缺口记录，不再作为待办项。

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-unused-integration-packages | 两个官方接入包有整块没人用的代码：`plugins/official-integrations/web-query/` 整个包没有生产调用方；`plugins/official-integrations/youtube/src/index.ts` 的 `youtubeIntegrationManifest` 与 `createYoutubeIntegrationPlugin` 没有调用方（宿主只用 `channel.ts` 的辅助函数）。应删掉，或按 Plugin Runtime 真正接上 （2026-11-22 决定 66 校准：44B 将 youtube 收编进 rss 连接器驱动并清理无用官方接入包，代码合入时同步销账） | [对抗式审查台账](../../docs/reviews/adversarial-review-2026-11-01.md) N18；第 27 批核对 | 已知缺口 | 删除会连带 `tooling/versions.json` 里这些 Manifest 的版本条目与 `carriers`、`tooling/gates/version-exceptions.json`、包清单与 SSOT 行；动版本表按红线先问用户，第 27 批只删了合同与插件里的零散死导出 | 无 | 低 | 合同维护人（执行会话待分配） |
