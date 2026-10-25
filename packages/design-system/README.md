# 共享视觉与控件原语

产品 UI 的色、字、图标、控件和外壳都从这里出。插件返回 HTML 字符串，不迁 React。视觉意图见 [DESIGN.md](../../DESIGN.md)；这里只写怎么用、文件在哪、别另起一套。

包名：`@molis-ai/molis-work-design-system`。工作区内部包，页面由 Workbench 装配。

## 怎么用

字符串部件（按钮、输入、图标、状态环、目录、舞台外壳等）在 Plugin SDK 的 `/ui`，一份实现，插件和宿主都直接从那里导入，本包不转出（PG-055）；它们产出带 `mw-*` class 和 `data-slot` 的 HTML，样式、图标表、主题与 AI 交互部件在本包：

```ts
import { renderButton, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderIconSprite } from "@molis-ai/molis-work-design-system";

renderButton({ label: "保存", variant: "primary" });
icon("copy"); // 页面已注入 sprite 时也可以 <svg><use href="#icon-copy"></use></svg>
```

媒体预览缩放用 `window.molisMediaZoom(viewport, image, { onChange })`（`src/browser/media-zoom.ts`，VUX-32）：围绕实际看的位置缩放，平移有边界，`0` 回到适应；页面自己不再写第二套 pan/zoom。

状态统一用 `renderStateRing({ state, label?, size?, progress? })` 或 `renderStatusMark({ state, label })`。`state-ring-states.ts` 的 43 个状态复用 21 套环刻样式，业务词义和本地化文案仍归调用方。`doing` 静止，`running` 等实际执行状态持续运动，`round-ended` 只表示一轮结束。部分完成和中断的 `progress` 只接真实完成比例；未知时省略。不传 `size` 时环跟随所在文字（`1em + 2px`，笔画随尺寸换算），与旁边的字等高；只有单独站着的环（规格板标本、空状态的大标记）才传 `size`，页面不再给某一行的环另定尺寸（DESIGN「Order」）。

客户端与插件公开脚本保留原文；宿主沿统一 HTTP 资源入口用 esbuild 压缩交付程序，状态文字与模板字符串内容不改变。

动态界面可把 `data-mw-state` 写在已有的状态文字容器上；共享增强会插入环刻，支持后续状态、真实比例和 `textContent` 更新。常规状态环使用默认 20px，业务样式不再缩小或隐藏它；12/16px 只在规格板作为尺寸对照。图标旁已有文案时无需重复 `label`。`VISUAL_FOUNDATION_CLIENT_SCRIPT` 包含增强；不加载整个 foundation 的 Home 插件页面单独挂 `STATE_RING_CLIENT_SCRIPT`。样式随 `PRIMITIVE_STYLES`。减少动效、离屏、隐藏和卸载的生命周期由共享实现处理，插件不各自启动动画。

状态徽标 `InteractionBadge.state` 可传入精确的环刻状态，例如结果未知用 `verify`、失效用 `stale`；不传时只按已有 `tone` 使用通用表现。业务文案由调用方保留，颜色不作为成功或执行中的证据。

AI 交互部件（`renderInteractionQuestion`、`renderInteractionOperation`、`renderInteractionOptions`、`renderInteractionNextSteps`、`renderInteractionComposerTarget`）只做呈现：调用方把自己的记录（Agent 的等待问题、操作卡、插件的「需要补充」结果）转换成展示参数，读人的文字都由调用方给。页面要用它们时自己加载 `INTERACTION_STYLES`；它故意不在 `PRIMITIVE_STYLES` 里，因为那里每加 1 字节，冻结的页面资源里要付约 6 字节。产品采用时，在同一个改动里删掉被替换的旧渲染（跨插件 AI 交互需求书的 P2）。

控件标本：开发预览打开 `/__ui/catalog`（不进用户导航），真实底栏标本在 `/__ui/catalog/bar`。变体、状态、浅深色、密度、打开后的菜单、组合（列表+详情、工具栏+筛选、带错误的表单、对话框里的菜单、长内容嵌套滚动、窄屏与密度）和动效以组件板为准，不要在业务 CSS 里重画一套。改共享控件必须先看这块板。已经达到产品美学要求的共享控件、状态变体或微动效要补进 `src/primitives/catalog.ts`；草稿和产品专属编排不必塞进去，但进产品主链前不得带着系统下拉等 OS 控件。

页面仍注入 `THEME_BOOTSTRAP_SCRIPT`、基础样式、`TYPEFACE_STYLES` 和 `renderIconSprite()`。规格板等独立消费者使用完整的 `VISUAL_FOUNDATION_STYLES`（含 Coss / Primitive）；三张产品表在 [apps/workbench/src/page-assets.ts](../../apps/workbench/src/page-assets.ts) 使用不含这两层的 `VISUAL_FOUNDATION_PAGE_STYLES`，只在原来的页面 CSS 末尾覆盖位置装配一次 Coss / Primitive / Typeface，最后接 `CRAFT_FINISH_STYLES`（Soft Workbench 终层），让 `mw-*` 和终层盖住中间插入的产品规则。对照装配入口 [apps/workbench/src/renderer.ts](../../apps/workbench/src/renderer.ts)。

## 文件

公开入口：[src/index.ts](src/index.ts)。浏览器安全的叶子工具（浮层放置、跟随滚动）在 Plugin SDK 的 `/browser`（[floating 的源码](../plugin-sdk/src/browser.ts)），不在本包。生产只从包入口导入，不要深层 import 到 `src/`。

| 路径 | 用途 |
| --- | --- |
| [src/primitives/](src/primitives) | HTML helper：按钮、字段、浮层、导航、布局、目录、日历、Catalog |
| [src/styles/primitives.ts](src/styles/primitives.ts) | `mw-*` CSS |
| [src/palette.ts](src/palette.ts) | Soft Workbench token 的唯一来源：`renderShellTokens(theme)`（面、字色、状态、阴影、遮罩）、`renderShapeTokens()`（圆角、焦点、动效、图标尺寸）、`renderControlMetrics()`（控件高度，只在早层声明）；14 色相与插件表只作数据 |
| [src/icons.ts](src/icons.ts) | 导航、动作、对象的 Lucide 库与 sprite；status-* 转到共享环刻 |
| [src/state-ring-client.ts](src/state-ring-client.ts) | 环刻的浏览器增强；静态呈现、状态映射与几何在 Plugin SDK 的 `/ui`（[state-ring.ts](../plugin-sdk/src/ui/state-ring.ts)） |
| [src/typeface.ts](src/typeface.ts)、[fonts/](fonts) | `FONT_STACK`（系统无衬线优先，Inter / Noto Sans SC 仅作离线后备）、`MONO_FONT_STACK`、字重角色变量 |
| [src/visual-foundation.ts](src/visual-foundation.ts) | 主题/密度/分层样式入口 |
| [src/styles/](src/styles) | 工作台、设置、标题栏等表面层 |
| [src/styles/craft-finish.ts](src/styles/craft-finish.ts) | Soft Workbench 终层（模块名沿用）：珍珠灰桌面与连续白色工作面、底栏几何（Dock、统一对话栏、常驻与项目按钮）、抬升/圆角/动效 token、提示气泡、`molisCraft` 完成与落地时刻。规则按小节切在 `craft-finish-bar.ts`、`craft-finish-assistant.ts`、`craft-finish-pages.ts`（级联顺序就是三份相接的顺序），共用的选择器片段在 `craft-finish-selectors.ts`；`craft-finish.ts` 把它们接起来，并带着 `CRAFT_FINISH_CLIENT_SCRIPT` |
| [src/plugin-component-client.ts](src/plugin-component-client.ts) 与 `plugin-component-{kit,records,controls,output,part,types}.ts` | 创作台生成的插件在浏览器里的渲染器（`createPluginComponentClient`）。按层拆成函数：`pcKit`（不碰状态的助手）、`pcRelations`/`pcRecords`（从当前视图读出的关系与记录）、`pcDetail`/`pcControls`/`pcOutput`/`pcQuery`/`pcSubmit`/`pcPart`、`pcLifecycle`。每层是「共享状态加前面各层」的函数，返回自己新加的函数；可变的 `view`、`selection`、`epoch`、`fresh` 等放在 `plugin-component-types.ts` 的 `State` 上，各层读 `c.view` 而不是闭包变量。整套函数用 `toString` 拼成 `PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT`，所以层函数里不能用模块级的 import，只能用参数和 DOM |
| [src/styles/touch-targets.ts](src/styles/touch-targets.ts) | 底栏的触控尺寸，跟在 craft-finish 后面：手机宽度或 `pointer: coarse` 的窗口里底栏与助理输入条是 44px 目标；挤满的助理输入条由岛标记 `data-crowded` 并分步让位（选择器、工作条的清除标记、材料与通知并入「+」菜单） |
| [src/monogram.ts](src/monogram.ts) | 项目徽标：首字母 + 由项目 id 决定的色相 |
| [src/interaction.ts](src/interaction.ts)、[src/styles/interaction.ts](src/styles/interaction.ts) | AI 交互部件：问卷（混合字段、推荐理由、逐字段错误）、选项组、操作卡（作用对象与版本、参数预览、状态、结果）、输入框旁的下一步。只收展示参数（`Interaction*View`），用 `data-ix-*` 钩子接行为；样式 `INTERACTION_STYLES` 单独导出，不在共享页面样式表里 |
| [src/interaction-client.ts](src/interaction-client.ts) | 上面这些部件的浏览器端行为：`createInteractionClient(root, host)`（读写字段值、选项与对象切换、单选的箭头键与单一 Tab 停靠、步进器上下界、日历弹层、回车跳项与 ⌘/Ctrl+回车提交、中文输入法组合中不报变化、逐字段错误；对象引用题的搜索框：人停止打字 250 ms 后才调调用方给的 `host.references(source, query)`，只认最后一次的结果，结果是可用箭头键、回车、Esc 操作的列表，选中的对象成为可去掉的标签，多选到上限就停）。由三个不依赖 import 的函数组成，`INTERACTION_CLIENT_SCRIPT` 是它们拼成的脚本表达式，供不能 import 的插件客户端工厂内嵌；浏览器侧目前只能用这个字符串导出，不能从包根 import `createInteractionClient`，因为包根会带进只给 node 用的模块；不存任何值，值归调用方，写入从不夺走正在输入的字段 |
| [src/catalog-examples.ts](src/catalog-examples.ts)、[src/interaction-example.ts](src/interaction-example.ts) | 组件板的示例区块（插件页面组合、AI 交互），在 `catalog.ts` 之外组合 |
| [Plugin SDK 的 browser.ts](../plugin-sdk/src/browser.ts) | 浮层放在哪：`placeFloating`（上、下、旁，留边距；上下那一半是 `placeStacked`，页面程序带的是它）、`placeOverlay`（在给定舞台里放，不超过自己的 CSS 上限）、`pinAt`（窗格成了 fixed 参照盒时按差值校正）、`followScroll`、`scrollShouldFollow`。叶子文件：没有 import，不碰 Node；经子路径 `@molis-ai/molis-work-plugin-sdk/browser` 给页面包（Pages 编辑器）单独取用，设计系统的包根入口带 Node 模块，不能进浏览器包 |
| [src/context-toolbar.ts](src/context-toolbar.ts)、[src/context-tools.ts](src/context-tools.ts)、[src/floating-source.ts](src/floating-source.ts)、[src/context-toolbar-example.ts](src/context-toolbar-example.ts) | 情境浮条：页面程序（`CONTEXT_TOOLBAR_CLIENT_SCRIPT`，同一份放置函数以源码形式带进去）与样式（`CONTEXT_TOOLBAR_STYLES`，只用令牌，工作台把它放进自己的样式表，不进共享样式表）、插件发布的工具的清洗（`sanitizeContextTools`，有界封闭）、以及组件板的一节（样式与示范程序内联在该节）。页面程序在发给浏览器前过 `compactScript`（[src/compact-script.ts](src/compact-script.ts)：去掉缩进、空行和整行注释，不并行、不改语句）：写源码的人照常缩进和写注释，页面不为它们付字节；含多行字符串或模板字面量的程序不要过它。三个页面事件 `molis:context-tools`、`molis:context-panel-open`、`molis:context-tool-invoke` 在事件登记表里归 `context-toolbar` |

## 硬规则

视觉规范见 [DESIGN.md](../../DESIGN.md)（Soft Workbench）。这里只列最容易写错的：

- 栈保持 HTML Slot。不引入 Coss/shadcn 包，不做可切换皮肤。新控件用 `render*` / `mw-*`，不要再发明 `.button-primary`、`document-action`、`text-button` 这类填充。
- **token 只从 `palette.ts` 来。** 组件规则里不写 hex，不在后面的层重新声明同名 token 换个数，不用 `!important` 或按插件覆盖去"压"前面的规则——改源头。
- **面：** 桌面 `--desk`（=`--page`、`--nav-bg`）承载标题栏和底栏；工作都在一张连续白色纸面 `--paper` 上（14px 圆角、`--sheet-shadow`）；插件目录列和内部块用 `--surface-soft`；局部分组、只读字段、次按钮静止态用 `--rail`。插件不要在纸面里再画外框卡片。
- **色：** 石墨 `--action` 只给主操作和选中的选项；铜色 `--accent` 给焦点、链接、进行中和选中的小细节（`--blue*` / `--focus` 已指向铜色）。铜色不填按钮。其余颜色只表达状态（`--green` / `--amber` / `--red`）。插件没有身份色：画插件的地方 `--plugin-tint` 一律是 `--ink-soft`，规则不点任何插件的名字；标签条上一组的颜色是 Manifest 视图的 `hue`。选中行用 `--nav-active`，不加左侧色条。
- **深度：** 普通内容靠留白、字重和少量发丝线分层；只有浮起来的东西投影：`--lift-1`（当前标签、分段滑块、当前 Dock 项、主按钮）、`--lift-2`（输入胶囊、内层面板）、`--lift-3`（菜单、对话框、边缘面板、提示）。浮层不再画描边。遮罩只变暗不模糊。渐变只用于引导页的环境光。
- **字：** 系统字体栈 `FONT_STACK`；字重只有 400 / 500 / 600，用 `--weight-body` / `--weight-control` / `--weight-title`。不准全局强制字重，不准合成粗体（`font-synthesis-weight: none`）。代码与 ID 用 `--font-mono`。
- **尺寸：** 控件 32px（紧凑 28，手机/粗指针 44），`--control-h` 只在早层声明，好让密度和触控规则赢。圆角：tag 6、control 8、row 10、card 12、sheet 14、composer 15、dialog 16。
- **焦点：** 只用 `--focus-stroke`（2px 铜色、偏移 1px）；字段是铜色边框加 3px 铜色光晕。不准用 ink 或蓝色描焦点，不准去掉焦点。危险态用 `--red`。
- **焦点组的局部更新（VUX-28、VUX-36）：** 向页面追加普通正文时，不能因变更的父节点是 `body` 就重新测量全页焦点组；这会把大段代码的布局成本带进无关的键盘维护。`roving-focus` 对子节点增删只标记父节点所属的组，新增子树和属性变化仍检查其中受影响的组；删除、重排、隐藏祖先、禁用与选择变化后仍保留一个有效 Tab 停靠点。本次只收紧已有 DOM 观察范围，不改代码着色、键盘语义或性能门槛。`tests/keyboard-groups.e2e.test.ts` 通过真实页面的几何读取计数验证普通内容变化不再测量无关组，并验证组内更新与原有键盘路径。
- **动效：** 只用 `--dur-*`（按压/悬停 130、状态 250、到达 420、时刻 640）和 `--ease-quint` / `--ease-spring`。按下回弹到 .97；菜单从触发处长出，底栏菜单从栏升起；面板从边缘滑入；悬停只变色调。打开弹层的控件不缩放。入场只有四个关键帧（`src/styles/motion.ts`：到达 `craft-rise`、再显示 `craft-fade-in`、菜单 `craft-drop` / `craft-rise-from-bar`），页面与插件不另写；完成与新到达用 `molisCraft.celebrate` / `molisCraft.land`（新到达的那一层底色是 `[data-craft-new]`）。`prefers-reduced-motion` 与自动化下控件入场动画静止。状态环刻的语义周期为 2.8–5.8 秒，由共享组件维护；减少动效时静止，浏览器回归可以显式验证正常运动。
- **菜单关闭与流式成本（VUX-36、VUX-22）：** `styles/motion.ts` 拥有完整菜单生命周期样式与选择器，craft 层在原位置装配；`details` 菜单的入退场共用可中断的 opacity/transform 过渡（进入 250ms、退出 130ms；反向按进度缩短），入场中关闭也只能逐渐变淡。底栏导航保留朝触发点的方向。关闭立即禁止点击，并仅在 130ms 内保留内容盒；普通折叠、非 details 的 popover 和 Assistant 保留原路径。复用 #1042 的父菜单自定义属性与独立伪元素规则，继续按现有菜单子元素识别动态菜单，不再使用带 `:has()` 的 `::details-content` 选择器。`tests/menu-exit-motion.e2e.test.ts` 覆盖八种现役 host、正常和快速关闭、普通折叠、减少动态效果和自动化静止；`tests/has-anchors.e2e.test.ts` 保持长回复插入节点小于 3ms 的原门槛。短合同见 [visual-ui-experience](../../specs/visual-ui-experience/spec.md#bezier-timing)。
- **不画滚动条。** `HIDDEN_SCROLLBAR_STYLES`（`src/styles/scrollbars.ts`）在每一页把滚动条藏起来，滚动照常；强制颜色下系统滚动条回来。别处不写 `scrollbar-width`、`scrollbar-color`、`::-webkit-scrollbar`；不在共有样式表里的页面（胶囊、IM、接续页）自己带上这条。
- **不准露出操作系统默认控件。** 选择打开后是 `mw-menu`；禁止系统色盘、系统日期/时间弹出、`alert` / `confirm` / `prompt`、未换肤的 `range`。原生 `<select>` 只可隐藏当值，原生 `<dialog>` 只留行为。
- 选项组用 `renderChoice` / `mw-choice`：选中是石墨底加对勾，不能只靠光影或颜色表达选中。
- 图标从库取：`icon("name")` 或 `#icon-name`。不要第二套 emoji/Unicode 图标。
- Shelf 阅读面通过 `--content-*` / `--da-*` 别名到同一套 token；`--mark-*` 五色只作文件类型小标签。
- 这里不拥有业务数据、路由或 Goal 状态。改共享样式要看真实页面、深浅色、紧凑密度和窄屏，编译通过不等于视觉通过。

## 本地开发

在**仓库根目录**执行。改源码后必须编进 `dist`，预览和测试读的是包导出，不是 `src/`。

```bash
./node_modules/.bin/tsc -p packages/design-system
node scripts/run-tests.mjs tests/primitives.test.ts tests/visual-foundation.test.ts tests/coss-control-language.test.ts
```

隔离预览（不要动用户 4180）：

```bash
node --import tsx apps/desktop/launchers/web/server.ts --port 4182 --home /tmp/molis-ui-catalog-isolated-home
```

然后打开 `http://127.0.0.1:4182/__ui/catalog`。这里使用专用临时 Home，换端口不会隔离真实 Home。

生成插件表单按提交时的输入版本处理回执：等待中又编辑时，旧成功不清新草稿、不关它的 sheet/dialog；当前草稿成功提交后才复位，prefill 编辑表单继续保留值。换版/销毁的旧回包不写当前表单或错误反馈。`tests/plugin-composition.e2e.test.ts` 的 W2-18-COMPONENT-DRAFT-01/02 使用生产 renderer、延迟回包并覆盖 form/sheet/dialog。

## 开发要求

- 负责：设计令牌、控件、图标、主题与无障碍基础。
- 不负责：产品页业务决定、插件状态、路由。
- 公开入口：`@molis-ai/molis-work-design-system`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/ui`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（页面部件 `/ui`、`/browser`、`/page-globals`，设计系统的样式与图标表依它的类名与图标名）；第三方依赖见 `package.json`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 服务端 HTML 的文字和属性值使用本包 `escapeHtml`，先处理 `&`，并覆盖单双引号；受信 HTML 槽与 JSON 脚本编码由各自合同处理。
  - 生产只从包名（或 `/floating`）导入，不深入 `src/`；改源码后编进 `dist`，预览和测试读的是包导出。`/floating` 必须保持叶子：不 import 任何东西、不碰 Node（`tests/design-system-floating.test.ts` 看住）。
  - 改共享控件先看规格板 `/__ui/catalog`。
  - 禁止系统色盘、系统日期/时间弹出、`alert`/`confirm`/`prompt` 与未换肤的 `range`。
  - 键盘焦点只用 `--focus-stroke`；动效只用 `--dur-*`、`--ease-*`（`--motion-*` 只是给旧插件的别名，新规则不用）。
  - 进入工作台之前的页面用到的部件（`mw-wordmark`、`mw-caption`、`mw-steps`、`mw-goal-track`、`mw-bar-context`、`mw-bar-status`、`mw-file-kind/row/group`、`mw-brief`、按钮上的 `mw-btn__key`）在这里定义，规格板的「到达」一节各有标本；页面（`apps/workbench/src/arrival/`）只排版，不重画。打字与飞入动效是一段脚本（`ARRIVAL_MOTION_CLIENT_SCRIPT`），在减少动态效果与自动化下静止。
  - AI 交互部件只收展示参数，不认识 Run、回执或授权；读人的文字由调用方给。浏览器端行为（`interaction-client.ts`）只读写 DOM、不存值；它的函数各自不依赖 import，改它要保持这一点。`INTERACTION_STYLES` 只用令牌，不进共享页面样式表，直到产品真正采用。
- 共用 select 增强器保留原字段显式的 `aria-required`；没有声明时才跟随原生 `required`，不改变原表单的提交校验。动态更改与键盘、原生校验回归见 `tests/select-menu-interaction.e2e.test.ts`。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-design-system run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/style-has-scope.test.ts tests/coss-control-language.test.ts tests/visual-foundation.test.ts tests/arrival-components.test.ts tests/studio-english.test.ts tests/interaction-components.test.ts tests/design-system-floating.test.ts tests/context-toolbar.test.ts`；改了 `interaction-client.ts` 加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/interaction-client.e2e.test.ts`；改了 `styles/overflow-fade.ts` 加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/overflow-fade.e2e.test.ts tests/assistant-context-strip.e2e.test.ts`；改了 `browser/`（含 `show-more.ts`）、`styles/copy-feedback.ts`、`styles/disclosure.ts`、`styles/numbers.ts` 或 `micro-interactions.ts` 加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/visual-mechanisms.e2e.test.ts tests/assistant-text-html.e2e.test.ts tests/assistant-side-groups.e2e.test.ts`；改了 `browser/media-zoom.ts` 加跑 `tests/media-zoom-board.e2e.test.ts`
- 改到外壳控件的尺寸（底栏、标签条、助理输入与它旁边的小按钮）加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/touch-targets.e2e.test.ts`——触控尺寸按输入类型，不按宽度：`pointer: coarse` 的窗口（手机、横过来的手机、平板）与手机宽度的窗口，标签条与底栏的控件都是 44px 目标；只有精细指针、宽于 600px（标签条 760px）的桌面窗口在 [DESIGN.md](../../DESIGN.md) 「Focus and accessibility」写明范围的例外内保持原尺寸。挤满的助理输入条由岛标记 `data-crowded` 并分步让位（只在触控窗口；选择器、工作条的清除标记、材料与通知并入「+」菜单，每步只在上一步仍放不下时才做），不把任何按钮压到 44px 以下；岛量这一行时带着小按钮量（`data-measuring` 暂时撤掉手机打字时收起小按钮的规则），所以点进输入框又点开，步骤不变；手机底栏第二行的控件互相紧挨，是一道精确的加法：七个目标要 308px，最宽的一屏（带目录按钮，八个）要 352px，再加两边 8px 内边距与 4px 列间距共 375px；窄于 375px 时列间距与内边距让掉（行贴到窗口边，上面的助理输入条位置不变），八个放得下到 356px、七个到 312px；更窄时不重叠、不压小、不挤出窗口——Dock 从末尾起把按钮并进「+N」列表，项目首页永不收起，连项目首页加「+N」也放不下（356px 以下、带目录按钮）时「+N」按钮也让掉，切换器列着全部插件，什么都不丢。底栏与标签条打开的东西（助理的各个列表与建议卡、通知、材料的移除键、切换器的置顶与添加键、Dock 的「+N」列表、项目菜单、标签条的打开插件、布局、标签与标签组菜单及组名输入与颜色点、展开的助理面板的标签栏与正文、`mw-menu` 的项）在手机与粗指针下也是 44px。面板正文指全部工作的列表、工作详情，和对话里的控件（复制、代码块的复制与展开、问答的选项与输入、批准按钮、步骤摘要、下一步按钮）；句子里的链接比字宽、44px 高，句子里的对象按钮看上去不变、响应手指的范围 44px 高。精细指针的桌面窗口里这些列表里的控件不低于 32px 下限（紧凑 28px；组的颜色点是 32px 目标、里面画 18px 的点）；只有展开的助理面板在桌面仍低于下限：标签栏的 28px 按钮与 20px 关闭标记、正文 22–28px 的控件，是已登记的缺口 BL-127。同一个测试一并量；面板正文的控件种类从页面运行的脚本里读出来（每个 `el("button", "assistant-…")`），新增的控件种类自动进入测量。同一份 `touch-targets.ts` 里还有共用请求助手放在错误区域与吐司里的「诊断编号」按钮（`[data-molis-call-id]`）的 44px 规则（句子里的链接：上下内边距加等量负外边距，不占行高），改它或改吐司样式（`styles/toast.ts`）加跑 `tests/request-failure-call-id.e2e.test.ts`：它在 390px 手机上量吐司不缩成半个窗口、长消息把按钮排到消息下面、按钮用吐司的字色（对比度不低于 4.5）、按钮盒与手指实际点得到的范围都不低于 44px，桌面窗口里消息与按钮同一行。另以真实鼠标移动、按下/释放和键盘 Tab 检查 1440/1024/390px、浅深色的普通/hover/active/focus 状态，不能只量静止态。
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
