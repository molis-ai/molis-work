# 共享视觉与控件原语

产品 UI 的色、字、图标、控件和外壳都从这里出。插件返回 HTML 字符串，不迁 React。视觉意图见 [DESIGN.md](../../DESIGN.md)；这里只写怎么用、文件在哪、别另起一套。

包名：`@molis-ai/molis-work-design-system`。工作区内部包，页面由 Workbench 装配。

## 怎么用

从包根导入 helper，产出带 `mw-*` class 和 `data-slot` 的 HTML：

```ts
import { renderButton, icon, renderIconSprite } from "@molis-ai/molis-work-design-system";

renderButton({ label: "保存", variant: "primary" });
icon("copy"); // 页面已注入 sprite 时也可以 <svg><use href="#icon-copy"></use></svg>
```

控件标本：开发预览打开 `/__ui/catalog`（不进用户导航）。变体、状态、浅深色以 Catalog 为准，不要在业务 CSS 里重画一套。

页面仍注入 `THEME_BOOTSTRAP_SCRIPT`、`VISUAL_FOUNDATION_STYLES`（含 `PRIMITIVE_STYLES`）、`TYPEFACE_STYLES` 和 `renderIconSprite()`。三张产品表在 [apps/workbench/src/page-assets.ts](../../apps/workbench/src/page-assets.ts) 再把 Coss / Primitive / Typeface 挂到页面 CSS 之后，让 `mw-*` 盖住中间插入的产品规则。对照装配入口 [apps/workbench/src/renderer.ts](../../apps/workbench/src/renderer.ts)。

## 文件

公开入口：[src/index.ts](src/index.ts)。生产只从包名导入，不要深层 import 到 `src/`。

| 路径 | 用途 |
| --- | --- |
| [src/primitives/](src/primitives) | HTML helper：按钮、字段、浮层、导航、布局、目录、日历、Catalog |
| [src/styles/primitives.ts](src/styles/primitives.ts) | `mw-*` CSS |
| [src/palette.ts](src/palette.ts) | 14 色相、插件色、内容平面；`renderLinearShellTokens` 是锌色壳层 SSOT |
| [src/icons.ts](src/icons.ts) | Lucide 库与 sprite |
| [src/typeface.ts](src/typeface.ts)、[fonts/](fonts) | Inter Variable + Noto Sans SC Regular |
| [src/visual-foundation.ts](src/visual-foundation.ts) | 主题/密度/分层样式入口 |
| [src/styles/](src/styles) | 工作台、设置、标题栏等表面层 |

## 硬规则

- 栈保持 HTML Slot。不引入 Coss/shadcn 包，不把 Nova/Mira 做成可切换皮肤；密度按 Mira（桌面控件约 28，表单主操作 36，窄屏/粗指针 44）。
- 新控件用 `render*` / `mw-*`。不要再发明 `.button-primary`、`document-action`、`text-button` 这类填充。
- 壳层 hover / 当前走 `--nav-hover` / `--nav-active` / `--ink`。靛（`--blue` / `--focus`）只给链接、焦点、选区和进行中，不是第二套实心按钮。
- 色用 token，不要在组件规则里写死 hex。后代选择器不要盖 `mw-*` 的填充和焦点。
- 图标从库取：`icon("name")` 或 `#icon-name`。不要第二套 emoji/Unicode 图标。Shelf 文件类型 SVG 仍走插件自己的 glyph，动作图标用库。
- 字重默认 400。层级靠字号和 `--ink` / `--ink-soft` / `--muted` / `--faint`。
- Shelf 阅读面继续 `--content-*` / `--mark-*`，不要涂成工作台锌灰。
- 这里不拥有业务数据、路由或 Goal 状态。改共享样式要看真实页面和窄屏，编译通过不等于视觉通过。

## 本地开发

在**仓库根目录**执行。改源码后必须编进 `dist`，预览和测试读的是包导出，不是 `src/`。

```bash
./node_modules/.bin/tsc -p packages/design-system
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/visual-foundation.test.ts tests/coss-control-language.test.ts
```

隔离预览（不要动用户 4180）：

```bash
node --import tsx apps/desktop/launchers/web/server.ts --port 4182 --home "$HOME/.molis-work"
```

然后打开 `http://127.0.0.1:4182/__ui/catalog`。

## 进一步阅读

- [DESIGN.md](../../DESIGN.md)：色、字、密度、外壳几何
- [UI Platform](../../docs/platform/UI-PLATFORM.md)：Workbench / UI Host / Design System 分工
- [SSOT 索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/ui`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap3`

当前行为以本包公开入口、Catalog、调用方和对应测试为准。Coss 全表落地过程见 `specs/coss-primitive-library/spec.md`，那是任务书，不是用法手册。
