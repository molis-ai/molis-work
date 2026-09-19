# 视觉层代码卫生

完成等级：3（结构整理，不改产品行为）

## 背景目标

今天原语 / 色板 / 字体落地后，锌色 token、页面 CSS 拼装和 Host 入口 import 叠了几份。这次只收今天引入的结构债，让调用链单一、token 有唯一 owner。

## 当前行为与问题证据

- `packages/design-system/src/palette.ts` 已是色相 SSOT，但 `:root` 锌色仍手写在 `foundation.ts`、`coss-controls.ts`、`interaction-texture.ts`、`apps/workbench/src/styles/base.ts`。
- `VISUAL_FOUNDATION_STYLES` 末尾已含 `COSS_CONTROL_STYLES` + `PRIMITIVE_STYLES`；Workbench 三张页面表再拼一次，是为了盖住中间插入的产品 CSS。这是级联合同，不是重复入口。
- `createWorkbenchRenderer` 同时装配页面和拼接 CSS/JS 资产，职责混在一起。
- `renderer.ts` / `ui-composition.ts` / workbench `index.ts` 对同一 package 拆成十几条 import。
- Shelf 动作图标另写 `shelfActionIcon`，与 `icon()` 同形。

## 范围

1. `palette.ts` 增加 `renderLinearShellTokens`，上述四层共用，不改 token 值。
2. 页面 CSS/JS 拼装挪到 `apps/workbench/src/page-assets.ts`；renderer 只装配页面。
3. 合并 Host 入口的同包 import；Shelf 动作图标改走 `icon()`。
4. 在 visual-foundation / README 写明级联顺序：foundation 层叠保留，末尾再挂 Coss / Primitive / Texture / Typeface。

## 非目标

- 不合并 `personal-workbench-v2/v3`、calm-desktop、momentum 等 AP3 表面层。
- 不把 Feed / Inbox 状态色或 `source-feed.ts` 迁出 design-system。
- 不拆 `.tree-node.is-selected` 多处覆盖（immersive 依赖后层把底清成透明）。
- 不改 Goals/Feed 业务、Shelf 文件类型 SVG、`docs/design`、不提交、不杀 4180。

## 方案

- 锌色 / 墨色 / 靛 accent 的 hex 只从 `renderLinearShellTokens` 发出；色相与 `--content-*` 仍走 `renderPaletteTokens`。
- 三张页面表保持现有拼接顺序和字符串，只换文件位置。
- Plugin 展示 CSS 仍由 Plugin 导出、Workbench 拼接。

## 验收

- 浅色 `--page: #f3f4f5`、`--ink: #222326`、`--blue: #5e6ad2` 仍出现在 foundation / Coss / texture / workbench base，且四者包含同一段 helper 输出。
- workbench / settings / project-index 样式表仍把 Coss 层放在页面 CSS 之后，Primitive / Typeface 在最后。
- `tests/workbench-ui-platform.test.ts` 仍断言 renderer 不内联 `VISUAL_FOUNDATION_STYLES` / `CLIENT_SCRIPT`。
- Shelf 目录动作仍是 `#icon-copy` / `#icon-search`。

## 验证

```bash
./node_modules/.bin/tsc -p packages/design-system
./node_modules/.bin/tsc -p apps/workbench
./node_modules/.bin/tsc -p plugins/native/shelf
node --import tsx --test --test-concurrency=1 \
  tests/visual-foundation.test.ts \
  tests/coss-control-language.test.ts \
  tests/primitives.test.ts \
  tests/workbench-ui-platform.test.ts \
  tests/shelf-plugin.test.ts
```
