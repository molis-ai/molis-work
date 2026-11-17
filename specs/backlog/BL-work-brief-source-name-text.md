# BL-work-brief-source-name-text

分组：9. 平台小项与工程流程 / 翻译与界面用词

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-work-brief-source-name-text | Work Brief 把来源插件的名字存成保存当时的显示文字：`plugins/native/work-brief/src/reading.ts:82` 取 `view.provider.title` 写进 `SourceRow.name`（`model.ts:28`），变化记录 `kind: "source"` 的 `name` 同样；页面直接显示存下的字。换界面语言后仍显示旧语言，违反「存键和参数，不存译文」。同一结构里的 `summary` 已经是 `OwnedTextRef`，插件 Manifest 也有 `name_text` | [第 19 批](../post-anticorruption-roadmap/reference/batches/19.md#implementation-19)「没做、留给后面的」：写「归第 16 批的 TextRef 处理」，但第 16 批在第 19 批之前已合入，没有人接；2026-11-17 合入批次核对 | 已知缺口 | 改成存 `{ owner: plugin_id, key: name_text 的键, fallback: 当时的名字 }`，或改为显示时按 `plugin_id` 现读名字、只在插件已不在时用存的名字；两种都改 Work Brief 已存简报的形状。用户 2026-11-17 已定：升版本（Work Brief 库 1→2），旧名字转成 `literal`；已固定进成果库的简报版本（`fix.ts` 写入的 `sources[].name`）是否也改、还是按固定快照原样保留，由实施会话核清后再问。和 `BL-action-card-outcome-text` 同一个 PR | 无（做法已定，固定版本一处待核） | 低 | Work Brief 主人 |
