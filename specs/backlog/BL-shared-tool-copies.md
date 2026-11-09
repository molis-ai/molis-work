# BL-shared-tool-copies

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-shared-tool-copies | 共用工具跨批仍有多份写法。2026-11-08/09 已收口：`packages/plugin-sdk/src/ui/file-reader.ts`、`ui/text-ref.ts` 的 `isObject` 删除、统一用 `src/json-value.ts` 的 `isRecord`（`appearance-files.ts`、`locale-pack.ts`、`token-values.ts` 同步）；`packages/storage/src/versioned-file.ts` 的 `isObject` 改用 SDK `isRecord`；`apps/workbench/src/i18n.ts` 的 `escapeAttr`、`plugins/native/shelf/src/browser/dom.ts` 的 `escText`/`escapeAttr` 改用 SDK `/ui` 的 `escapeHtml`（shelf 客户端脚本与本变更前等长，页面资源零增长）；`horizontal/account` 的 `operations.ts` 改用 SDK `isRecord`，并声明 account → plugin-sdk 的依赖边（`scripts/workspace-packages.mjs`、`docs/system/PACKAGE-BOUNDARIES.md` 登记表同步；account 的 README 依赖说明同步；`src/upstream/validate.ts` 是固定字节的 Auth 合同副本，`provenance.json` 钉住它的 sha256，不在本地改）；`better-sqlite3` 的 Alchemist 例外改成独立数据文件 `tooling/gates/sqlite-driver-owners.json`（带理由、fail closed；#1979 合入后只剩 Alchemist 一个目录）。见 PR #1987。仍剩：`packages/contracts/src/modules/workspace-artifacts.ts` 的 `isRecord`（contracts 不能依赖 SDK，另算）；`packages/design-system` 的 catalog escape（早于 02）。码元比较器见 [BL-1066](BL-1066.md) | 2026-11-08 审计（B1、N1、N2、N5）；2026-11-08/09 修复（大部分完成） | 明确后续做 | 余下两处分别是合同依赖方向与更早批次的实现，不在本次维修硬改 | contracts 合同面；design-system 主人 | 中 | 各包维护人（执行会话待分配） |
