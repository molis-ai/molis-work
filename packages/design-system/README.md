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

AI 交互部件（`renderInteractionQuestion`、`renderInteractionOperation`、`renderInteractionOptions`、`renderInteractionNextSteps`、`renderInteractionComposerTarget`）只做呈现：调用方把自己的记录（Agent 的等待问题、操作卡、插件的「需要补充」结果）转换成展示参数，读人的文字都由调用方给。页面要用它们时自己加载 `INTERACTION_STYLES`；它故意不在 `PRIMITIVE_STYLES` 里，因为那里每加 1 字节，冻结的页面资源里要付约 6 字节。产品采用时，在同一个改动里删掉被替换的旧渲染（跨插件 AI 交互需求书的 P2）。

控件标本：开发预览打开 `/__ui/catalog`（不进用户导航），真实底栏标本在 `/__ui/catalog/bar`。变体、状态、浅深色、密度、打开后的菜单、组合（列表+详情、工具栏+筛选、带错误的表单、对话框里的菜单、长内容嵌套滚动、窄屏与密度）和动效以组件板为准，不要在业务 CSS 里重画一套。改共享控件必须先看这块板。已经达到产品美学要求的共享控件、状态变体或微动效要补进 `src/primitives/catalog.ts`；草稿和产品专属编排不必塞进去，但进产品主链前不得带着系统下拉等 OS 控件。

页面仍注入 `THEME_BOOTSTRAP_SCRIPT`、`VISUAL_FOUNDATION_STYLES`（含 `PRIMITIVE_STYLES`）、`TYPEFACE_STYLES` 和 `renderIconSprite()`。三张产品表在 [apps/workbench/src/page-assets.ts](../../apps/workbench/src/page-assets.ts) 再把 Coss / Primitive / Typeface 挂到页面 CSS 之后，最后接 `CRAFT_FINISH_STYLES`（Soft Workbench 终层），让 `mw-*` 和终层盖住中间插入的产品规则。对照装配入口 [apps/workbench/src/renderer.ts](../../apps/workbench/src/renderer.ts)。

## 文件

公开入口：[src/index.ts](src/index.ts)。生产只从包名导入，不要深层 import 到 `src/`。

| 路径 | 用途 |
| --- | --- |
| [src/primitives/](src/primitives) | HTML helper：按钮、字段、浮层、导航、布局、目录、日历、Catalog |
| [src/styles/primitives.ts](src/styles/primitives.ts) | `mw-*` CSS |
| [src/palette.ts](src/palette.ts) | Soft Workbench token 的唯一来源：`renderShellTokens(theme)`（面、字色、状态、阴影、遮罩）、`renderShapeTokens()`（圆角、焦点、动效、图标尺寸）、`renderControlMetrics()`（控件高度，只在早层声明）；14 色相与插件表只作数据 |
| [src/icons.ts](src/icons.ts) | Lucide 库与 sprite |
| [src/typeface.ts](src/typeface.ts)、[fonts/](fonts) | `FONT_STACK`（系统无衬线优先，Inter / Noto Sans SC 仅作离线后备）、`MONO_FONT_STACK`、字重角色变量 |
| [src/visual-foundation.ts](src/visual-foundation.ts) | 主题/密度/分层样式入口 |
| [src/styles/](src/styles) | 工作台、设置、标题栏等表面层 |
| [src/styles/craft-finish.ts](src/styles/craft-finish.ts) | Soft Workbench 终层（模块名沿用）：珍珠灰桌面与连续白色工作面、底栏几何（Dock、统一对话栏、常驻与项目按钮）、抬升/圆角/动效 token、提示气泡、`molisCraft` 完成与落地时刻 |
| [src/styles/touch-targets.ts](src/styles/touch-targets.ts) | 底栏的触控尺寸，跟在 craft-finish 后面：手机宽度或 `pointer: coarse` 的窗口里底栏与助理输入条是 44px 目标；挤满的助理输入条由岛标记 `data-crowded` 并分步让位（选择器、工作条的清除标记、材料与通知并入「+」菜单） |
| [src/monogram.ts](src/monogram.ts) | 项目徽标：首字母 + 由项目 id 决定的色相 |
| [src/interaction.ts](src/interaction.ts)、[src/styles/interaction.ts](src/styles/interaction.ts) | AI 交互部件：问卷（混合字段、推荐理由、逐字段错误）、选项组、操作卡（作用对象与版本、参数预览、状态、结果）、输入框旁的下一步。只收展示参数（`Interaction*View`），用 `data-ix-*` 钩子接行为；样式 `INTERACTION_STYLES` 单独导出，不在共享页面样式表里 |
| [src/catalog-examples.ts](src/catalog-examples.ts)、[src/interaction-example.ts](src/interaction-example.ts) | 组件板的示例区块（插件页面组合、AI 交互），在 `catalog.ts` 之外组合 |

## 硬规则

视觉规范见 [DESIGN.md](../../DESIGN.md)（Soft Workbench）。这里只列最容易写错的：

- 栈保持 HTML Slot。不引入 Coss/shadcn 包，不做可切换皮肤。新控件用 `render*` / `mw-*`，不要再发明 `.button-primary`、`document-action`、`text-button` 这类填充。
- **token 只从 `palette.ts` 来。** 组件规则里不写 hex，不在后面的层重新声明同名 token 换个数，不用 `!important` 或按插件覆盖去"压"前面的规则——改源头。
- **面：** 桌面 `--desk`（=`--page`、`--nav-bg`）承载标题栏和底栏；工作都在一张连续白色纸面 `--paper` 上（14px 圆角、`--sheet-shadow`）；插件目录列和内部块用 `--surface-soft`；局部分组、只读字段、次按钮静止态用 `--rail`。插件不要在纸面里再画外框卡片。
- **色：** 石墨 `--action` 只给主操作和选中的选项；铜色 `--accent` 给焦点、链接、进行中和选中的小细节（`--blue*` / `--focus` 已指向铜色）。铜色不填按钮。其余颜色只表达状态（`--green` / `--amber` / `--red`）。插件没有身份色：`--plugin-*` 全部是 `--ink-soft`。选中行用 `--nav-active`，不加左侧色条。
- **深度：** 普通内容靠留白、字重和少量发丝线分层；只有浮起来的东西投影：`--lift-1`（当前标签、分段滑块、当前 Dock 项、主按钮）、`--lift-2`（输入胶囊、内层面板）、`--lift-3`（菜单、对话框、边缘面板、提示）。浮层不再画描边。遮罩只变暗不模糊。渐变只用于引导页的环境光。
- **字：** 系统字体栈 `FONT_STACK`；字重只有 400 / 500 / 600，用 `--weight-body` / `--weight-control` / `--weight-title`。不准全局强制字重，不准合成粗体（`font-synthesis-weight: none`）。代码与 ID 用 `--font-mono`。
- **尺寸：** 控件 32px（紧凑 28，手机/粗指针 44），`--control-h` 只在早层声明，好让密度和触控规则赢。圆角：tag 6、control 8、row 10、card 12、sheet 14、composer 15、dialog 16。
- **焦点：** 只用 `--focus-stroke`（2px 铜色、偏移 1px）；字段是铜色边框加 3px 铜色光晕。不准用 ink 或蓝色描焦点，不准去掉焦点。危险态用 `--red`。
- **动效：** 只用 `--dur-*`（按压/悬停 130、状态 250、到达 420、时刻 640）和 `--ease-quint` / `--ease-spring`。按下回弹到 .97；菜单从触发处长出，底栏菜单从栏升起；面板从边缘滑入；悬停只变色调。打开弹层的控件不缩放。完成与新到达用 `molisCraft.celebrate` / `molisCraft.land`。`prefers-reduced-motion` 与自动化下全部静止。
- **不准露出操作系统默认控件。** 选择打开后是 `mw-menu`；禁止系统色盘、系统日期/时间弹出、`alert` / `confirm` / `prompt`、未换肤的 `range`。原生 `<select>` 只可隐藏当值，原生 `<dialog>` 只留行为。
- 选项组用 `renderChoice` / `mw-choice`：选中是石墨底加对勾，不能只靠光影或颜色表达选中。
- 图标从库取：`icon("name")` 或 `#icon-name`。不要第二套 emoji/Unicode 图标。
- Shelf 阅读面通过 `--content-*` / `--da-*` 别名到同一套 token；`--mark-*` 五色只作文件类型小标签。
- 这里不拥有业务数据、路由或 Goal 状态。改共享样式要看真实页面、深浅色、紧凑密度和窄屏，编译通过不等于视觉通过。

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

## 开发要求

- 负责：设计令牌、控件、图标、主题与无障碍基础。
- 不负责：产品页业务决定、插件状态、路由。
- 公开入口：`@molis-ai/molis-work-design-system`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/ui`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 生产只从包名导入，不深入 `src/`；改源码后编进 `dist`，预览和测试读的是包导出。
  - 改共享控件先看规格板 `/__ui/catalog`。
  - 禁止系统色盘、系统日期/时间弹出、`alert`/`confirm`/`prompt` 与未换肤的 `range`。
  - 键盘焦点只用 `--focus-stroke`；动效只用 `--dur-*`、`--motion-*`、`--ease-*`。
  - 进入工作台之前的页面用到的部件（`mw-wordmark`、`mw-caption`、`mw-steps`、`mw-goal-track`、`mw-bar-context`、`mw-bar-status`、`mw-file-kind/row/group`、`mw-brief`、按钮上的 `mw-btn__key`）在这里定义，规格板的「到达」一节各有标本；页面（`apps/workbench/src/arrival/`）只排版，不重画。打字与飞入动效是一段脚本（`ARRIVAL_MOTION_CLIENT_SCRIPT`），在减少动态效果与自动化下静止。
  - AI 交互部件只收展示参数，不认识 Run、回执或授权；读人的文字由调用方给。`INTERACTION_STYLES` 只用令牌，不进共享页面样式表，直到产品真正采用。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-design-system run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/coss-control-language.test.ts tests/visual-foundation.test.ts tests/arrival-components.test.ts tests/studio-english.test.ts tests/interaction-components.test.ts`
- 改到外壳控件的尺寸（底栏、标签条、助理输入与它旁边的小按钮）加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/touch-targets.e2e.test.ts`——触控尺寸按输入类型，不按宽度：`pointer: coarse` 的窗口（手机、横过来的手机、平板）与手机宽度的窗口，标签条与底栏的控件都是 44px 目标；只有精细指针、宽于 600px（标签条 760px）的桌面窗口在 [DESIGN.md](../../DESIGN.md) 「Focus and accessibility」写明范围的例外内保持原尺寸。挤满的助理输入条由岛标记 `data-crowded` 并分步让位（只在触控窗口；选择器、工作条的清除标记、材料与通知并入「+」菜单，每步只在上一步仍放不下时才做），不把任何按钮压到 44px 以下；岛量这一行时带着小按钮量（`data-measuring` 暂时撤掉手机打字时收起小按钮的规则），所以点进输入框又点开，步骤不变；手机底栏第二行的控件互相紧挨，是一道精确的加法：七个目标要 308px，最宽的一屏（带目录按钮，八个）要 352px，再加两边 8px 内边距与 4px 列间距共 375px；窄于 375px 时列间距与内边距让掉（行贴到窗口边，上面的助理输入条位置不变），八个放得下到 356px、七个到 312px；更窄时不重叠、不压小、不挤出窗口——Dock 从末尾起把按钮并进「+N」列表，项目首页永不收起，连项目首页加「+N」也放不下（356px 以下、带目录按钮）时「+N」按钮也让掉，切换器列着全部插件，什么都不丢。底栏与标签条打开的东西（助理的各个列表与建议卡、通知、材料的移除键、切换器的置顶与添加键、Dock 的「+N」列表、项目菜单、标签条的打开插件、布局、标签与标签组菜单及组名输入与颜色点、展开的助理面板的标签栏与正文、`mw-menu` 的项）在手机与粗指针下也是 44px。面板正文指全部工作的列表、工作详情，和对话里的控件（复制、代码块的复制与展开、问答的选项与输入、批准按钮、步骤摘要、下一步按钮）；句子里的链接比字宽、44px 高，句子里的对象按钮看上去不变、响应手指的范围 44px 高。精细指针的桌面窗口里这些列表里的控件不低于 32px 下限（紧凑 28px；组的颜色点是 32px 目标、里面画 18px 的点）；只有展开的助理面板在桌面仍低于下限：标签栏的 28px 按钮与 20px 关闭标记、正文 22–28px 的控件，是已登记的缺口 BL-127。同一个测试一并量；面板正文的控件种类从页面运行的脚本里读出来（每个 `el("button", "assistant-…")`），新增的控件种类自动进入测量。同一份 `touch-targets.ts` 里还有共用请求助手放在错误区域与吐司里的「诊断编号」按钮（`[data-molis-call-id]`）的 44px 规则（句子里的链接：上下内边距加等量负外边距，不占行高），改它或改吐司的排版（`craft-finish.ts` 的 `.toast`）加跑 `tests/request-failure-call-id.e2e.test.ts`：它在 390px 手机上量吐司不缩成半个窗口、长消息把按钮排到消息下面、按钮用吐司的字色（对比度不低于 4.5）、按钮盒与手指实际点得到的范围都不低于 44px，桌面窗口里消息与按钮同一行。
- 相关手册：[DESIGN.md](../../DESIGN.md)、[specs/craft-finish/spec.md](../../specs/craft-finish/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [DESIGN.md](../../DESIGN.md)：Soft Workbench 规范——色、字、密度、外壳与底栏几何、动效、引导
- [Soft Workbench 迁移记录](../../specs/archive/soft-workbench-rollout/spec.md)与[清单](../../specs/archive/soft-workbench-rollout/inventory.md)
- [UI Platform](../../docs/platform/UI-PLATFORM.md)：Workbench / UI Host / Design System 分工
- [SSOT 索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/ui`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap3`

当前行为以本包公开入口、组件板、调用方和对应测试为准。Coss 全表落地过程见 `specs/archive/coss-primitive-library/spec.md`，Soft Workbench 迁移见 `specs/archive/soft-workbench-rollout/`；那些是任务书，不是用法手册。
