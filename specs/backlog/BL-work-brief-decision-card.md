# BL-work-brief-decision-card

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-work-brief-decision-card | Work Brief「要你处理」里的决定卡还没有：第 19 批定的是卡型里的决定走 39-2 的通用决定入口，并写明「等 39-2 合入后接」。第 39 批已合入（#2105，`horizontal/project-approvals` 的受保护决定入口），但它的批次文件和代码都没有接到 Work Brief；`plugins/native/work-brief` 里没有任何决定入口，只在本人验收单 `BL-b19-work-brief-acceptance` 里作为「与原型的差异」提过一句。另外第 19 批写的「32 合入后只改 `src/browser/parts.ts` 的 slot 与个人简报的项目链接」也没有做（该文件第 19 批以后未改），见 `BL-home-waiting-unified-read` | [第 19 批](../post-anticorruption-roadmap/reference/batches/19.md#implementation-19)第 5 项与「没做、留给后面的」；[work-brief](../work-brief/spec.md)；2026-11-17 合入批次核对 | 未实现 | 平台给插件页面的审查挂载位（`UiPageReviewQuery`，`packages/contracts/src/platform/ui.ts`）现在只能按 Coding 的 `runIds` 过滤，不能按对象或 `ReviewReference` 选出要在简报里显示的决定，要先补公开查询形状（合同改动）；卡的样子要对照第 19 批定样原型，组件板若需新部件先补标本 | 审查挂载位按对象或审查引用过滤的合同 | 中 | Work Brief 主人；公共审查（39-2 的主人） |
