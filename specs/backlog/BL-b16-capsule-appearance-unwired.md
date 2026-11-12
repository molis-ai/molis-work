# BL-b16-capsule-appearance-unwired

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b16-capsule-appearance-unwired | 桌面胶囊（`/desktop/capsule`）的 Web 外观没有接入 Home 的外观投影：`apps/desktop/src/capsule-shell.ts:2,25,30,36` 仍内联 `FONT_STACK`/`renderShellTokens` 基线与固定字体；`apps/local-host/src/web-catalog-routes.ts:105-110` 的 `desktop-capsule` 路由直接渲染，不传 `UiEnvironmentSnapshot`/皮肤字体投影；`specs/font-and-skin-system/implementation-plan.md` §6.1（`:263`）要求胶囊改到同一文件投影与无重载更新。第 16 批记录原写「胶囊视觉待验」，合后审计更正为**外观未接入**（不是验没验）。同时菜单与剪贴板权限未验。要做的：把胶囊接到同一外观投影（或明确接受基线外观），补菜单/剪贴板权限的隔离实测；批次（第 16 批后续还是第 70 批）由用户定 | [16.md「合后审计整改」](../post-anticorruption-roadmap/reference/batches/16.md#合后审计整改fix16-audit-followups)；合后审计 REPORT K7（`/private/tmp/audit16/REPORT.md`） | 未实现 | 第 16 批范围只做主窗/工作台/插件外观，胶囊 Web 未接；记录原写成「视觉待验」，合后审计更正 | 用户定批次；桌面/胶囊外观 owner | 中 | 桌面与胶囊外观（执行会话待分配） |
