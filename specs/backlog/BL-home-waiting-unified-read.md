# BL-home-waiting-unified-read

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-home-waiting-unified-read | 首页与 Work Brief 的「等你」不读第 32 批的统一读取：第 32 批核账第 4 行写 32-3 定一份「等你」统一读取，「角标、线上事件的『等你』、后台任务面板和首页读同一份」。实际角标与线读 `horizontal/mainline` 的线与任务表（`attention.waiting.read@1`、`apps/local-host/src/attention-http.ts`），而组合服务给首页和 Work Brief 的 `attention` 组仍读 `modules/attention-resumption` 的 `inbox_entries`（`apps/local-host/src/surface-actions.ts:101` 调 `listSurfaceEntries`，只有 Feed 条目、Goal 决定与来源故障三种）。两处数出来的「等你」可能不一致 | [第 32 批](../post-anticorruption-roadmap/reference/batches/32.md)核账第 4 行；[第 19 批](../post-anticorruption-roadmap/reference/batches/19.md#implementation-19)「32 合入后只改 `parts.ts` 的 slot」；2026-11-17 合入批次核对 | 待你决定 | 第 32 批把「等你」的写侧收拢放在第 56 批第 1 项；首页读侧算第 32 批漏做、现在改组合服务读统一读取，还是随第 56 批写侧一起改，要先定 | 用户决定归哪批；第 56 批第 1 项 | 中 | 事项线／组合服务主人；Work Brief 主人 |
