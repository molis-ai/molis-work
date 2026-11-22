# 自审五律、实看验收与防回归门禁手册

不要把视觉问题留到最后等用户挑刺。任何 UI 改动在提评审前，必须同时通过 **人工目视自审** 与 **自动化门禁**。

---

## 1. 视觉秩序五律（每次改动逐条对照）

1. **一屏一主动作**：排除独立模态弹窗外，同一平面至多 1 个 `mw-btn--primary`；危险操作用 `mw-btn--danger`，次操作用纸面细边 `mw-btn--secondary`。
2. **平面与边界清晰**：桌面（`--page`）、连续纸面（`--paper`）、轻软面（`--surface-soft`）、浮层（`--popover` + 阴影）层次分明；不出现纸中套白卡、卡套卡、或输入框/次按钮退化成无边灰块。
3. **语义色克制不乱涂**：琥珀只属于「轮到你」；常态就绪保持中性退隐；状态芯片全为 `6px`（无 `999px` 胶囊）；静态状态不带旋转环。
4. **中文与英文同样舒展**：中文不挤压（`letter-spacing: 0`、`text-autospace: normal`、真 `400/500/600` 字重、行高 `1.58`）；数字对齐不抖动；无截断无提示的文字、无未翻译词键或中文硬编码。
5. **键盘、触控与分屏全成立**：悬停操作有 `:focus-within` 与 `@media (hover: none)` 等价可达；触控与窄屏目标 ≥ `44px`；`600px` 二分屏窗格零横向溢出、正文有效列宽 ≥ `280px`、无非法双滚动条。

---

## 2. 自动化门禁速查命令（本机多会话统一加 `--jobs 1`，先 `pnpm build`）

> 提醒：仓库锁定 `Node 24.15.x` 与 `pnpm 11.9.0`；改完源码先跑 `pnpm build`（或单包 `pnpm --filter <包> run build`），**本机不跑全量**（全量交 CI `full-suite` 标签）。

### A. 设计系统、样式与边界门禁（必跑）
```bash
pnpm health:check
pnpm boundary:check
pnpm plugin-styles:check
node scripts/run-tests.mjs \
  tests/soft-workbench-refinement.test.ts \
  tests/ui-baseline.test.ts \
  tests/ui-resources.test.ts \
  tests/ui-baseline-release.test.ts \
  tests/coss-control-language.test.ts \
  tests/scrollbars-hidden.test.ts \
  tests/cursor-skill-links.test.ts \
  --jobs 1
```

### B. 文案、体积与视觉回归（按改动面必跑）
```bash
# 文案与双语
node scripts/gates/translations.mjs --missing
node scripts/audit-ui-copy.mjs

# 静态资源体积与首屏字节（单资源涨 >10KB 或新增资产/路由须先问用户）
pnpm page-assets:check
node scripts/gates/first-screen.mjs --base origin/main

# 共享样式 / 壳层 / 皮肤变化时的视觉对比
pnpm visual:compare
```

### C. 交互、组件板与插件创作台回归（按改动面挑选）
```bash
# 挑受影响测试
node scripts/affected-tests.mjs

# 秩序、触控、防闪、失败回滚与动效退场
node scripts/run-tests.mjs \
  tests/visual-order.e2e.test.ts \
  tests/touch-targets.e2e.test.ts \
  tests/busy-feedback.e2e.test.ts \
  tests/save-failure.e2e.test.ts \
  tests/menu-exit-motion.e2e.test.ts \
  --jobs 1

# 改了 skills/molis-plugin-dev/ 或 plugins/native/plugin-builder/src/agent-prompts.ts 时必跑
pnpm studio:replay
pnpm studio:replay smoke
```

---

## 3. 五层机械防回归底线（与本 Skill 双保险）

1. **静态精细度与全插件 CSS 覆盖**（`tests/soft-workbench-refinement.test.ts`）：扫描全量内置插件样式（含 JS 内嵌样式块与独立导出 HTML）及 `IM_STYLES`，按规范化 CSS 规则拦截越阶圆角、违禁上浮、非标曲线/字阶、滚动条样式与插件视口布局 `@media`。
2. **零未定义 CSS 变量守卫**：核对所有产出 CSS 束中 `var(--*)` 均有真实定义，杜绝拼写错与幽灵变量。
3. **独立壳完整度守卫**：校验所有独立 HTML 壳（Workbench、Settings、IM、Plugin Document、Side View、Home Plugin、Catalog 子 iframe）均带 `appearanceHead()` 与必需共享脚本。
4. **原生失控控件零新增棘轮**：拦住新增 `window.confirm/alert/prompt`、未包裹可见 `<select>`、原生 `date/time` 输入与硬编码中文过滤。
5. **浏览器确定性几何与反馈回归**（`visual-order.e2e` / `busy-feedback.e2e` / `save-failure.e2e`）：复用单 Chrome 实例，就绪后确定性测量 `600px` 分屏零横向溢出、`250ms` 零瞬闪与断网失败自动回滚（不用 `> 500ms` 硬编码 sleep）。

---

## 4. 隔离环境实看清单（绝不碰真实 `~/.molis-work`）

用独立 `MOLIS_WORK_HOME` 或 `pnpm dev` 启动预览，对照以下矩阵逐格看一眼：
- **主题**：4 套皮肤（重点默认 `A 净透云光`、及 `B`/`C`/`Folio`）× **浅色 + 深色**
- **语言**：**简体中文**（核对 Sans + 思源黑体三字重与 `text-autospace`）+ **English**（核对 Sentence case、无硬编码中文、无英文断链）
- **视口**：`1440px` 全宽 + `680px` 二分屏/开侧栏 + `390px` 手机窄屏
- **状态**：空态 / 加载（快于 `250ms` 不闪、慢于 `250ms` 有反馈） / 成功 / 失败保草稿 / 取消 / 键盘 Tab & `Escape` 焦点回归
