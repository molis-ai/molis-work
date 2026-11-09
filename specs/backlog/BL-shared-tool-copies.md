# BL-shared-tool-copies

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-shared-tool-copies | 共用工具跨批仍有多份写法，第 02 批收尾检查「每件事只剩一份／共用工具只在 SDK」在合入时就不成立：`horizontal/account/src/operations.ts:39` 自己写 `isRecord`（#1846 `1e60753929`）；`packages/storage/src/versioned-file.ts:32` 自己写 `isObject`（#1958 `3b9087a169`）；#1976 `1f0fbaee6b` 在收尾检查之后又往 SDK 里留下两份 `isObject`：`packages/plugin-sdk/src/ui/file-reader.ts:167`、`ui/text-ref.ts:29`；`packages/contracts/src/modules/workspace-artifacts.ts:167` 也有一份 `isRecord`，contracts 不能依赖 SDK，另算。另有两类漏迁：HTML 转义仍有自写实现——`plugins/native/shelf/src/browser/dom.ts:3-4`（`escText`／`escapeAttr`，等价 SDK `/browser` 的 `escapeHtml`）、`apps/workbench/src/i18n.ts:170`（`escapeAttr`）、`packages/design-system` 的 catalog escape（早于 02）；`better-sqlite3` 的 Alchemist 例外在 `scripts/gates/project-sqlite-driver.mjs` 里是硬编码目录前缀 `startsWith("plugins/native/alchemist/")`，没有独立批准数据文件（不影响当前正确性）。码元比较器另见 [BL-1066](BL-1066.md) | 2026-11-08 审计（B1、N1、N2、N5） | 明确后续做 | 副本由别的批（#1846、#1958、#1976）引入，不属第 02 批，修它们要动对应包并由引入批的主人落；本批只收记录，不改代码 | 各引入批 | 中 | 各包维护人（执行会话待分配） |
