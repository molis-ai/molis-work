# BL-subject-context-sandbox

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-subject-context-sandbox | 对象的关联原文（Manifest `ui.subject_context`，BL-911）已泛化为任意小写 `subject_kind`（`packages/plugin-sdk/src/subject-context.ts`）且 `sandbox-read-protocol.ts` 已支持 `read_protocol: { kind: "subject_context", subject_kind }`，但 `packages/plugin-sdk/src/sandbox-manifest.ts:258-259` 生成沙箱 `PluginManifest.ui` 时仍未透传 `ui.subject_context`，且 `apps/local-host/src/project-plugin-stages.ts:340-345`（`shownRuntimeOwners`）仅查内置登记与 Home 条目、未包含已安装的签名沙箱插件；待补齐沙箱清单透传、宿主发现与拒绝用例（GAS-01～03） | [第 27 批收尾检查](../post-anticorruption-roadmap/reference/batches/27.md#收尾检查) 第 2 问；`skills/molis-plugin-dev/ui.md`、`docs/system/EXTENSION-POINTS.md` | 部分实现 | 与 `stage_data` 只对内置目录兑现同一现状，等第一个要用的沙箱包 | — | 低 | C 轨／Plugin Runtime（执行会话待分配） |
