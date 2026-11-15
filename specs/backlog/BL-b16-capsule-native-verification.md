# BL-b16-capsule-native-verification

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b16-capsule-native-verification | 桌面胶囊的原生实操验证：Web 外观已接入（2026-11-12 合后整改，`apps/desktop/src/capsule-shell.ts` 不再内联 `renderShellTokens`/`FONT_STACK`，改由同一 appearance owner 投影 `appearanceHead`+Soft Workbench 基线；选中皮肤/字体/mono 与设备浅深色进入胶囊 head，见 16.md 合后审计整改）。但真实 Tauri 胶囊窗口里选中 Folio 的观感、原生菜单/托盘/剪贴板权限、`sync_capsule_locale` 语言切换重载仍未实操验；**2026-11-14 复查补：** 设置页换肤时已打开的胶囊不会立即重画；已在胶囊页的 `runtime-panel` 浏览器程序（`apps/workbench/src/browser/runtime-panel.ts`，capsule 路径守卫）里加 focus 时的 `data-selection-revision` 复核，变了就重载胶囊页，真实 Tauri 窗口里仍待实操验；PR #2031 的「原生主窗可切语言、换肤和重开」也只有自述 | [16.md「合后审计整改」](../post-anticorruption-roadmap/reference/batches/16.md#合后审计整改fix16-audit-followups)；合后审计 REPORT K7（`/private/tmp/audit16/REPORT.md`） | 待你验收 | Web 接入已完成；原生窗口、菜单/托盘/剪贴板与语言切换重载需要可打开的隔离 Home 与真实构建 | 无（可与 BL-b16-appearance-acceptance 的 FSS-02/17/32 一起看） | 中 | 用户 |
