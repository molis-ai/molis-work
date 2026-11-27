# 设计参考与原型（现役索引）

生产 UI 的权威规范见根目录 [DESIGN.md](../../DESIGN.md)，日常开发执行手册见 [设计与前端工程 Skill](../../skills/molis-design-ui/SKILL.md)，生产控件实件以组件板 `/__ui/catalog` 为准。本目录里的内容仅作**设计探路与视觉参考**，与生产规范冲突时以 `DESIGN.md` 与 `skills/molis-design-ui/` 为准。

2026-11-21 按[路线书决定 60](../../specs/post-anticorruption-roadmap/reference/decisions.md#decision-60)收口存量原型：4 套原型工具统一收归 [`kit/`](kit/README.md)，已落地或被取代的 50 份历史设计稿全部移入 [`archive/`](archive/README.md)，主目录只保留 **9 个高信噪比现役目录**；此后新增的定样记在第 3 节。

## 1. 唯一共享原型实件（画新原型只引这里）

- [组件板实件 kit](kit/README.md) — `pnpm build && node docs/design/kit/build.mjs` 一键生成全量 `kit.css / kit.js / settings.css` 与 `dist/`，取代已归档的 `_catalog`、`component-board`、`coding-frame`、`assistant-cards`

## 2. 现行视觉与壳层基准（2 份）

- [逐屏打磨第一轮：高保真样稿（含第十三版底栏 `helm.html`）](screen-polish/README.md)
- [Folio 配色定样](folio-baseline/README.md)

## 3. 未落地待实施原型（8 份）

- [助理三条路径定样](assistant-proactive-paths/README.md)
- [37-1 · 生成页面运行、采用与恢复定样（原型）](generated-page-adoption/README.md)
- [第 37 批合并定样：36A 第一页挂载与事项工作台](batch-37-workbench/README.md) — 2026-11-23 新增，待用户确认；实现与定样同一个 PR，落地后移入归档
- [Onboarding 全程：可点的定样（路线书第 04 批）](onboarding-full-journey/README.md)
- [创作台主路径定样](plugin-studio-main-path/README.md)
- [运行与恢复定样（第 25、26 批）](runtime-and-recovery/README.md)
- [主线：顶部事项切换定样（第 37-2 批）](work-mainline-switch/README.md)
- [Jelly 瘦身定样（第 112-2 批，用户选方案 B：日历旁放当天）](jelly-slim/README.md) — 2026-11-26 新增，实现与定样同一个 PR；落地核对完后按决定 60 移入归档
- [待办详情页定样（可点，已定稿）](todo-detail/README.md) — 2026-11-21 新增，实现与定样同一个 PR；落地核对完后按决定 60 移入归档
- [创作台做的插件怎样安装、升级和恢复（第 47 批，用户选 C，2026-11-21 确认第二版）](studio-package-install/README.md) — 实现随第 47 批同一个 PR；落地核对完后按决定 60 移入归档

## 4. 历史归档（50 份）

- [设计原型历史归档索引](archive/README.md) — 已落地功能原型、已被新定样取代的早期方案与历史工具壳
