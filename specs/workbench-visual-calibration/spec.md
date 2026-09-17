# 工作台颜色与呼吸校准

## 背景与目标
当前 Linear × Coss 世界还在，但最终色板把纸面、导航和字段挤成一团脏灰；大量正文走 `--muted` / `--faint`，再叠 `opacity`，中文 13px 几乎看不清。空状态被 grid 拉满整面，项目列表把迁移条钉在视口底，中间一截空洞。

目标：在同一视觉世界里把颜色、对比和分组做对。完成等级 3：真实页面可 internally 试用；不宣称原生包。

## 当前行为与问题
- `interaction-texture.ts` 的最终 ramp：Light 带脏靛灰，Dark 的 page `#0e0f12` 与 paper `#17181c` 几乎无层次。
- Home 引言、月历数字、禁用输入、Frame 空文案都用 muted/faint；月历非本月和作曲家还叠加 0.55 / 0.7 透明度。
- `.mw-empty` 默认 `align-content: stretch`，与 `.frame-empty` 叠用后标题、说明、按钮被撑到画布三端。
- 项目索引面板 `height: 100%`，卡片和迁移入口中间留出整屏空白。
- 工作台 `13px/1.35` 覆盖了 DESIGN 的 1.55，中文行距过紧。

## 范围与非目标
范围：最终色板（texture + 对齐 coss token）、可读的文字角色、Home / 项目索引 / 空状态 / 月历的呼吸；DESIGN.md token 记录。
非目标：不换 Linear × Coss 身份；不改密度几何（28px 行、32px 顶栏、目录宽度）；不改领域行为、路由、控件 API。

## 使用场景
用户打开项目列表、Home、Goal Frame 空画布、目录与设置，在 Light / Dark、桌面与窄屏下都能读清标题、说明和日期，相关块靠在一起，无关区域才留白。

## 方案与关键决策
- 中性色改成冷锌：纸面、轨道、字段分层；靛蓝只做强调，不再把灰也染脏。
- `--muted` / `--faint` 在各自表面上 ≥4.5:1；正文和引言用 `--ink` / `--ink-soft`。禁止对已是 faint 的字再降透明度。
- 选中日与 Coss 月历一致：Action 底 + Action Ink，避免 Dark 浅紫上套浅字。
- 空状态作为一组居中，不再拉满画布。项目索引按内容高度排列，迁移条跟在卡片后面。
- 工作台正文字距回到 1.5，不加大控件。

## 输入输出与依赖
输入：现有 CSS 变量与页面 class。输出：同一 HTML，渲染对比度和分组变化。依赖：`interaction-texture` 仍是最终色板；coss token 块与之对齐，避免中段 cascade 各说各话。

## 文件/模块边界
- `packages/design-system/src/styles/interaction-texture.ts`：最终 ramp。
- `packages/design-system/src/styles/coss-controls.ts`：token 块对齐。
- `packages/design-system/src/styles/primitives.ts`：空状态、月历。
- `apps/workbench/src/styles/project-home.ts`、`project-index.ts`、`linear-density.ts`、`goal-canvas.ts`。
- `DESIGN.md`：记录实际 token。

## 验收标准
- Light / Dark 的 ink、ink-soft、muted、faint 在 page/paper 上对比达标；项目卡、Home 引言、月历数字、禁用作曲家不用“灰上再灰”。
- Frame 空状态三件套作为一组出现在画布中部。
- 项目少时，迁移条紧跟卡片，不钉在视口底。
- 桌面 Home、项目列表、Goal 空画布在 Light 与 Dark 可阅读。

## 验证命令
- `pnpm exec tsx --test tests/visual-foundation.test.ts tests/primitives.test.ts tests/coss-control-language.test.ts tests/project-home-start.e2e.test.ts`
- 浏览器：`/` 项目列表、打开项目 Home、Goal Frame 空画布；Light 与 Dark。

## 假设与开放问题
- 用户要的是校准不是换皮；若还要更强品牌色，另开任务。
- 28px Linear 行高保留；只修字色和分组，不回退到更大 chrome。
