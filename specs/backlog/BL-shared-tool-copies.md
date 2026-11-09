# BL-shared-tool-copies

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-shared-tool-copies | 共用工具跨批仍有多份写法。2026-11-08 已收口：`packages/plugin-sdk/src/ui/file-reader.ts`、`ui/text-ref.ts` 的 `isObject` 删除、统一用 `src/json-value.ts` 的 `isRecord`（`appearance-files.ts`、`locale-pack.ts`、`token-values.ts` 同步）；`packages/storage/src/versioned-file.ts` 的 `isObject` 改用 SDK `isRecord`；`apps/workbench/src/i18n.ts` 的 `escapeAttr` 改用 SDK `/ui` 的 `escapeHtml`；`better-sqlite3` 的 Alchemist 例外改成独立数据文件 `tooling/gates/sqlite-driver-owners.json`（带理由，门禁缺失/坏形状直接失败；#1979 合入后只剩 Alchemist 一个目录，见 PR #1987）。仍剩：`horizontal/account/src/operations.ts`、`upstream/validate.ts` 的 `isRecord`／`isObject`——account 还没依赖 SDK，加依赖边要先定；`plugins/native/shelf/src/browser/dom.ts` 的 `escText`／`escapeAttr`——改用 SDK `escapeHtml` 会让 `shelf-client.js` 涨约 4 字节，需要页面资源一次性放行；`packages/contracts/src/modules/workspace-artifacts.ts` 的 `isRecord` 因 contracts 不能依赖 SDK 另算；`packages/design-system` 的 catalog escape 早于 02。码元比较器见 [BL-1066](BL-1066.md) | 2026-11-08 审计（B1、N1、N2、N5）；2026-11-08 修复（部分完成） | 明确后续做 | 余下分别是包依赖、页面资源体积和合同依赖方向，要单独决定，本 PR 不硬改 | account 的依赖决定；页面资源一次性放行；contracts 合同面 | 中 | 各包维护人（执行会话待分配） |
