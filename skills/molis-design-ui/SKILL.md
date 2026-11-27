---
name: molis-design-ui
description: Complete UI, visual design, color/skin, Sans+Chinese typography, component, motion, feedback, settings page, plugin surface, desktop shell, and component-board engineering guide for Molis Work. Use whenever creating or modifying any UI surface, stylesheet, CSS token, theme/skin, font, component, modal/dialog, toast, settings page, arrival/onboarding page, plugin view, side panel, IM surface, standalone/export HTML, desktop window inset, `/__ui/catalog` specimen, or `docs/design/` prototype.
---

# Molis Work 设计与前端工程 Skill（写完即过线）

本 Skill 是 Molis Work **所有界面表面**（工作台外壳、到达/引导、设置全集、[内置插件](../../apps/local-host/src/plugin-registry.generated.ts)、生成插件、侧栏、IM、独立/导出页、桌面壳、组件板 `/__ui/catalog` 与 `docs/design/` 原型）的**统一执行手册**。
完整规范见根目录 [`DESIGN.md`](../../DESIGN.md)，生产标本见组件板 `/__ui/catalog`；插件平台协议另读 [`molis-plugin-dev`](../molis-plugin-dev/SKILL.md)，模型与 Agent 另读 [`molis-prologue-ai`](../molis-prologue-ai/SKILL.md)。

**产品气质**：Soft Workbench（阳光净透浅底 + 静谧瓷青深底）——明净桌面托起一张连续纯白纸页，暗色以 `1px` 顶部玻璃高光（`--edge-highlight`）立面；以**对齐六律**建立一眼整洁的几何秩序，**图标与色彩优先**取代冗长状态说明字，唯一墨青/深墨主操作，琥珀只留给「轮到你」，所有切换与流式反馈坚持**无页面刷新感的连续动效**（持久化 DOM + FLIP + 容器高度呼吸 + 光影浸润流式），克制、可中断、确定可恢复。

---

## 按任务读哪章（渐进披露，不要一次硬背 150 KB）

| 你正在做什么 | 必读章节 |
| --- | --- |
| 配色、4 套内置皮肤（阳光净透浅底 / 瓷青深底）、256 对 WCAG AA 对比度、F1 Sans+中文三字重、布局版心令牌 | [tokens-and-typography.md](tokens-and-typography.md) |
| 工作台方案 C 顶栏、第十三版底栏、11 视图右侧栏、到达/IM/独立插件壳、桌面红绿灯安全区 | [shell-and-surfaces.md](shell-and-surfaces.md) |
| `mw-*` 组件选型、**对齐六律**、区块/内嵌分组容器（`.mw-section-well` / `.mw-inset-group`）、三层标签栏、**图示优先与列表副信息换行规则**、9 大共享机制与 `@container` | [components-and-mechanisms.md](components-and-mechanisms.md) |
| 新增或修改全局设置（6 组）/ 项目设置（9 页）/ 插件设置页（228px 左轨 + 侧栏筛选 + 250ms 防闪） | [settings-pages.md](settings-pages.md) |
| **无刷新连续动效**、动效语法「一变一动」、流式浸润 v2 与微阻尼追底、`molisBusy` / `molisToast` / `molisAutosave` / `molisOptimisticToggle` | [motion-and-feedback.md](motion-and-feedback.md) |
| 跨表面串联（`host.returns.go`、`dom-events.ts`、`presentation`、单一审批流）、插件布局选型与白话文案 | [flows-and-plugins.md](flows-and-plugins.md) |
| 给 `/__ui/catalog` 加标本（`extraChapters`）、用唯一 `docs/design/kit/` 画原型或归档设计稿 | [catalog-and-prototypes.md](catalog-and-prototypes.md) |
| 视觉自审五律、明暗/三断点验收与全部自动化门禁命令 | [review-and-gates.md](review-and-gates.md) |

---

## 绝不允许触碰的十条红线

1. **绝不写死颜色、字体或非标动效**：业务 CSS 只能写语义变量（`var(--paper)`、`var(--ink)`、`var(--dur-move)`、`var(--ease-quint)`）；禁止裸 `#hex`/`rgb()`、禁止私写 JS `cubic-bezier(...)`、禁止在组件内私读 `[data-resolved-theme="dark"]` 硬改颜色。
2. **绝不用 OS 原生失控控件**：禁止 `window.confirm` / `window.alert` / `window.prompt`（改走 `host.confirm` / `.mw-dialog`）；禁止未包裹的可见原生 `<select>`（改走 `.mw-select`）、原生 `date`/`time`/`datetime-local`（改走统一日期时间增强器）、`<datalist>` 与裸 `<progress>`。
3. **绝不自造第二套基础体系**：不自造插件专属按钮/输入框/弹窗方言（如 `.as-*`、`.settings-switch`）、不自造第二套 Toast（统一走 `host.showToast`）、不自造第二套审批流、不写自定义滚动条（`scrollbar-width` / `::-webkit-scrollbar` 由门禁拦死）。
4. **绝不绕过样式门禁**：插件 CSS 必须走 `workbench.stylesheet` 或平台登记样式表，禁止把整段 CSS 塞进前端 JS 字符串逃避 `tests/soft-workbench-refinement.test.ts`；绝不引用未定义的 CSS 变量。
5. **绝不搞错色彩与形状语义**：一屏平面最多 **1 个** `mw-btn--primary`；**琥珀（`--amber` / `--amber-soft`）只留给「轮到你」**（审批/提问/决策/高危确认），严禁用于收藏、分类、普通提醒或默认高亮；状态芯片固定 `var(--r-tag, 6px)`，严禁 `999px` 球场胶囊；常态就绪保持退隐，不刷无意义绿签/蓝签。
6. **绝不让输入框、次按钮退回无边灰块**：输入框与次按钮保持「纸面精微边框 + 轻贴面投影 + 雾蓝焦点光晕」材质；弹窗与表单底栏永远 **左取消、右主动作**；不可逆删除永远 `mw-btn--danger` + 具体动词，禁用「确定 / 提交」。
7. **绝不挤压中文或混排日文字形**：中文/日文界面正文 `letter-spacing: 0`（严禁全局 `-0.011em` 挤压方块字），开启 `text-autospace: normal`，使用真实 `400 / 500 / 600` 三字重（`F1 Inter Variable + 思源黑体 400/500/600`），`:lang(ja)` 经全部 4 套字体方案优先回落系统日文字体栈（+0 字体字节，杜绝简中汉字配日文假名混排），等宽数字用 `.mw-num` / `tabular-nums`。
8. **绝不忽略容器响应与独立壳完整度**：插件舞台响应用 `@container plugin-stage` 三档断点，禁止在插件内写视口布局 `@media (max-width/min-width)`；所有 HTML 入口（Workbench、Settings、IM、插件独立文档、侧栏、Home 插件、组件板子 iframe）必须带齐 `appearanceHead()`、正确的 `<html lang>`（走 `htmlLang()`）、无延迟主题引导脚本与共享微交互脚本。
9. **绝不吞错、冻屏、硬编码文案或零延迟瞬闪**：异步按钮用 `window.molisBusy`（`< 250ms` 静默，禁止手写灰死或整页 `inert` 冻屏）；失败温和交代现状、保留草稿并给出口，**结果未知永不自动重放**；共用 `mw-*` 原语禁止写死默认中文；禁止二元 `zh`/`en` 分支、禁止闭包缓存译文或拿译文做 `if`/过滤判断、禁止在 CSS `content:` 写死单语文案；动态界面必须响应 `molis-work:language-changed`。
10. **绝不触碰安全与桌面红线**：跨模块通信走 `packages/contracts/src/platform/dom-events.ts`；桌面占位页严守无 `'unsafe-inline'` 静态 CSP（只用外部 CSS）；顶部安全区一律读 `var(--desktop-window-safe-inline-start, 88px)`，严禁硬编码 `84px`；改完公开 UI 合同或设计系统基线，**同一 PR 同步更新本 Skill**。

---

## 交差前 6 步必跑闭环

每次改完任何 UI / CSS / 模板 / 客户端脚本，按顺序走完下面 6 步再提评审（详细命令与修红方法见 [review-and-gates.md](review-and-gates.md)）：

1. **构建先行**：`pnpm build`（单包可用 `pnpm --filter <包> run build`），确保测试读到最新产物。
2. **静态与边界门禁**：`pnpm health:check` + `pnpm boundary:check` + `pnpm plugin-styles:check` + `node scripts/run-tests.mjs tests/soft-workbench-refinement.test.ts tests/ui-baseline.test.ts tests/ui-resources.test.ts tests/cursor-skill-links.test.ts --jobs 1`。
3. **文案与三语巡检**：`node scripts/gates/translations.mjs --missing` + `node scripts/audit-ui-copy.mjs`（文案五条校准标尺、中/英/日三语准绳与黑话清单见 [`skills/molis-plugin-dev/text-and-appearance.md`](../molis-plugin-dev/text-and-appearance.md)）。
4. **体积与首屏核对**：`pnpm page-assets:check` + `node scripts/gates/first-screen.mjs --base origin/main`（按 `tooling/gates/page-asset-budgets.json` 预算表验收；预算内免逐字节许可，调高上限、把资源移出路由或新增未登记路由资产须先问用户）。
5. **视觉与交互定向回归**：按改动面跑 `pnpm visual:compare` 及受影响的 `tests/visual-order.e2e.test.ts` / `tests/touch-targets.e2e.test.ts` / `tests/busy-feedback.e2e.test.ts` / `tests/save-failure.e2e.test.ts`；改了 `skills/molis-plugin-dev/` 或 `plugin-builder` 提示词必跑 `pnpm studio:replay` 与隔离 `smoke`。
6. **隔离真页目视复核**：在隔离 `MOLIS_WORK_HOME`（绝不动真实 `~/.molis-work`）检查 **浅色 + 深色**、**简体中文 + English + 日本語**（原地切换无残留、三项语言切换条不折行不溢出）、**1440px 全宽 / 680px 二分屏 / 390px 窄屏**、**键盘 Tab 焦点与触控热区**。
