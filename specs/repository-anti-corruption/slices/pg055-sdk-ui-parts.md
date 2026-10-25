# PG-055 草案：SDK 提供公开的界面部件，插件包不再依赖私有的 design-system

状态：设计已定（2026-10-24 统筹裁定 D1～D6，见文末），2026-10-25 对着 3b 之后的代码复查过一遍，查出的四处与草案不符、要裁的四点见「2026-10-25 复查」；还没有代码，分两个 PR（S1+S2、S3+S4），排在 W5-04 第三组（#1278）之后。

## 问题

`privileges.md` 的 PG-055：22 个插件包（含 plugin-builder；`privileges.md` 记的 19 个是 10-22 的数，之后 shelf、todo、workflows 等也取了 `icon`，以下面的实测为准；2026-10-25 在 3b 之后重量，包数不变）从私有的 `@molis-ai/molis-work-design-system` 取舞台外壳、图标、状态环等。第三方插件作者只装 `contracts` 和 `plugin-sdk`（AGENTS.md 的硬约束），做不出同样的界面；10-18「插件同等待遇」要求内置插件和第三方用同一套公开部件。现状量过一遍（`plugins/native/**/*.ts` 里所有从 design-system 的 import，按名字去重）：

| 部件 | 用它的包数 | 用的包 |
| --- | --- | --- |
| `icon` | 18 | alchemist、artifacts、coding、cognia、dataset、diff、files、form、images、issues、jelly、lingguang、pages、ppt、shelf、text-stats、todo、workflows |
| `renderPluginStageShell` | 12 | alchemist、cognia、dataset、form、images、issues、jelly、lingguang、pages、ppt、todo、workflows |
| `escapeHtml` | 3 | coding、diff、text-stats |
| `renderButton` | 2 | coding、shelf |
| `renderStateRing`、`StateRingState` | 2 | feed、goals |
| `renderStatusMark` | 1 | feed |
| 伙伴页面舞台：`renderCompanionBrowserStage`（files、git）、`renderCompanionListStage`（diff、text-stats）、类型 `CompanionStageModel`（四个都用） | 4 | diff、files、git、text-stats |
| `RECEIPT_WORDS`（输入回执用词） | 2 | coding、goals |
| 浏览器端工具：`placeFloating`、`placeOverlay`、`pinAt`、`FloatingAnchor`、`FloatingSize`、`followScroll`、`scrollShouldFollow`、`CopyLabels` | 1 | pages |
| `processFold`（生成折叠样式的函数，服务端用）、`InteractionNextStep` | 1 | coding |
| 目录与侧栏：`renderDirectoryPanel`、`renderDirectoryHeading`、`renderSidebar` | 1 | coding（工作台的设置目录与到达页、伙伴页面舞台也用，不是 Coding 专有） |
| 页面端口的类型：`InteractionClient`、`InteractionClientHost`、`InteractionValues`、`ScrollFollower`（3b 起 Coding 的类型化页面带进来）、`Reflow` | 2 | coding、form |
| `renderDatePicker`、类型 `Reflow` | 1 + 1 | jelly、form |
| `import type {} from "…design-system"`（只为取页面全局的类型声明） | 4 个文件 | coding、files、lingguang、ppt |
| 创作台组件目录：`PLUGIN_COMPONENTS` 等 16 项 | 1 | plugin-builder |

## 目标与非目标

目标：上表里「插件包该自己做」的部件由 SDK 公开，插件改从 SDK 取；一份实现，宿主（design-system、工作台）和插件用同一份；边界规则拦住插件再 import design-system。

非目标：
- 创作台的组件目录（`PLUGIN_COMPONENTS`、`validatePluginPresentation` 等）是平台能力（10-18 定「创作台是平台能力」），留在 design-system，plugin-builder 是唯一的例外条目。
- 不改部件的外观和标记，只改它们在哪里。

## 设计

### 一、`@molis-ai/molis-work-plugin-sdk/ui`：纯字符串部件

不碰 DOM、没有依赖，输入是数据，输出是 HTML 字符串：

- `escapeHtml`、`cx`、`renderAttrs`（design-system 的 `primitives/html.ts`，三十行）。
- `icon(name, className?)` 与图标名字表（`PluginIconName`）。**关键事实**：`icon()` 输出的是 `<svg aria-hidden="true"><use href="#icon-名"></use></svg>`，图形在宿主页面带的雪碧图里（`renderIconSprite()`），不在 `icon()` 里。所以 SDK 只要名字表和一行标记，**不需要把 lucide 带进 SDK**，也不改变「SDK 只依赖 contracts」。状态环类的图标名（`STATE_RING_ICON_STATES`）走 `renderStateRing`，一并搬（`state-ring.ts`、`state-ring-geometry.ts`、`state-ring-states.ts`，合计约 220 行）。
- `renderPluginStageShell`（21 行）、`renderButton`、`renderStatusMark`、`renderBadge`、`renderEmpty`、`renderStateRing`、`StateRingState`。
- 目录与侧栏：`renderDirectoryPanel`、`renderDirectoryHeading`、`renderDirectoryTitle`、`renderDirectoryAdd`、`renderDirectoryRow`（`primitives/directory.ts`，134 行）和 `renderSidebar`（`primitives/layout.ts`），见 E4。
- `processFold(scope, selectors)`：生成折叠样式文本的纯函数（`styles/disclosure.ts`，22 行），Coding 的服务端样式用它，不是浏览器端工具，所以放这里而不是 `/browser`。
- `renderDatePicker` 连同它要用的 `renderInput`、`renderCalendar`（D6）。它的行为不在部件里：`.mw-date-picker`、`data-date-picker-input`、`.mw-calendar__day`、`data-ix-calendar-page` 这些钩子由宿主往每个插件页面注入的交互脚本（`plugin-frame.ts` 里的 `INTERACTION_CLIENT_SCRIPT_TYPED_DATES`）接线，与 `molisReflow` 同类，所以部件进 SDK、脚本留在宿主，钩子进第四节的守护测试。
- `RECEIPT_WORDS` 与 `InteractionNextStep` 的类型：回执用词是 Host 与插件对用户说的同一批词。contracts 里现在没有这两个名字（只有 `platform/plugin-interaction` 的 `PluginInteractionNextSteps`），所以搬进 contracts 是新增导出，要走 `CONTRACT-CHANGES.md`，见裁定 D4。

### 二、`@molis-ai/molis-work-plugin-sdk/browser`：浏览器端工具

会被 esbuild 打进插件自己的客户端包的纯函数：`placeFloating`、`placeOverlay`、`pinAt`（`floating.ts`，134 行）、`followScroll`、`scrollShouldFollow`（`scroll-follow.ts`，30 行）。现在 design-system 已有 `./floating` 子路径，pages 的十处 import 都走它。只有 pages 和 coding 用，等它们做客户端打包时（Pages 的 W5-10、Coding 的 3b）顺带切过来；本片只出子路径，不强迫它们先搬。

### 三、页面全局的类型声明

四个文件的 `import type {} from "…design-system"` 是为了拿 design-system 里 `declare global` 的页面辅助类型（`window.molisReflow`、`window.molisShowMore` 等，宿主往每个插件页面注入的全局函数）。这些全局本身是平台合同，类型声明应该和 `molisWorkRequest` 一样在 SDK 的 `declare global` 里（或 `@molis-ai/molis-work-plugin-sdk/page-globals`），插件用 `import type {} from "@molis-ai/molis-work-plugin-sdk/page-globals"`。

同一个子路径还放页面拿到的端口的类型：`host.interaction` 的 `InteractionClient`、`InteractionClientHost`、`InteractionValues`（`interaction-client.ts` 开头 40 行的接口），`ScrollFollower`（`scroll-follow.ts`），`Reflow`（`reflow.ts`，一行）。这些类型要引用 `HTMLElement`，contracts 不带 DOM 库，所以不进 contracts，见 E1。

### 四、标记和类名是合同

部件输出的 `mw-btn`、`plugin-stage-shell`、`data-work-surface` 等类名与 `data-*` 钩子，由宿主的样式表和客户端脚本定义。部件一公开，这些名字就是对第三方的承诺。守护方式：

1. 导出的形状进 `tooling/gates/api/plugin-sdk/ui.txt` 快照（`pnpm api:update`），和现有的 `highlight`、`rich-text`、`diff-view` 一样。
2. 新增一条测试：把 `/ui` 每个部件用一组典型输入渲染，收集输出里的类名，每一个都必须在宿主的完整样式表里有规则（反过来不要求）；`data-*` 钩子同样要在宿主脚本里被读到或在合同里登记。

### 五、依赖方向

`plugin-sdk` 只依赖 contracts，不能依赖 design-system。所以反过来：design-system 依赖 plugin-sdk，它里面这些部件的实现删掉，改为 `import { icon, … } from "@molis-ai/molis-work-plugin-sdk/ui"` 再用。design-system 自己的 17 个文件和宿主一侧的 74 个文件（apps 50、tests 23、packages 1，`icon` 一项就 34 个）从 design-system 取这些名字，要不要逐个改成直接取 SDK，见 E3。`PACKAGE-BOUNDARIES.md` 第 34～36 行已写明「plugin-sdk 在最底层，其他层都可用它的运行时工具」，所以这个方向不违反层次；`design-system` 的 `molis-work` 元数据和 `scripts/workspace-packages.mjs` 里要登记这条依赖。

### 六、边界规则

仿 `public-sdk-private-dependency` 加一条 `plugin-private-ui-dependency`：`plugins/native/*`（除 plugin-builder）的源码不得 import `@molis-ai/molis-work-design-system`；计数按文件，对照 merge-base 只许减少。plugin-builder 的例外写进规则的名单（带理由：创作台是平台能力）。

## 迁移步骤（统筹 10-24 定：两个 PR，排在 3b 之后）

- **PR 一（S1+S2，共享核心，进批跑一次全量）**
  1. SDK 加 `/ui`、`/browser`、`/page-globals`；`RECEIPT_WORDS`、`InteractionNextStep` 进 contracts 的 `platform/ui`（改合同，走 `CONTRACT-CHANGES.md`，`pnpm api:update`）；快照入库，类名与钩子测试守护。部件是搬（`git mv`）不是抄，所以不需要「新旧输出逐字相同」的过渡测试，用 design-system 现有的渲染测试（`tests/primitives.test.ts` 等）兜住即可。
  2. design-system 改成从 SDK 取这些部件（E3 定门面还是改 import），删本地实现；宿主的行为不变。
- **PR 二（S3+S4）**
  3. 插件分批替换 import，每批只改 import 和 `package.json`（去掉 design-system 依赖，补 plugin-sdk 依赖，登记到 `workspace-packages.mjs`）：先 `icon` 加 `renderPluginStageShell` 的 12 个；再 feed、goals（状态环）；再 diff、files、git、text-stats（各自把舞台写进自己的 `ui.ts`，D3）；最后 coding、pages、shelf、jelly（日期选择器，D6）、form、lingguang、ppt。每批按各插件 README 的「改动后必跑」。
  4. 加边界规则 `plugin-private-ui-dependency`，把 PG-055 标完成。

估计影响面：PR 一动共享核心（SDK、design-system、contracts、工作台的页面生成），按共享核心跑全量。页面资源：部件被打进各插件自己的客户端包，只带用到的（esbuild 摇树）；服务端渲染的部件不进页面资源。

## 2026-10-25 复查：与草案不符的四处，和要裁的四点

对着 3b 之后的代码重量（`plugins/native/**` 里所有从 design-system 的 import）：

- **F1** `processFold` 是生成折叠样式文本的函数（`styles/disclosure.ts`），Coding 的 `timeline-styles.ts` 在服务端拼样式时用，不是浏览器端工具：从 `/browser` 改放 `/ui`（第一节已改）。
- **F2** `renderDirectoryPanel`、`renderDirectoryHeading`、`renderSidebar` 不是 Coding 专有：工作台的 `settings-directory.ts`、`arrival/chooser.ts` 和 design-system 的伙伴页面舞台（`companion-stage.ts` 用 `renderSidebar`、`renderEmpty`）也用。草案「搬进 Coding 包」不成立。
- **F3** 3b 之后 Coding 的类型化页面带进四个页面端口的类型（`InteractionClient`、`InteractionClientHost`、`InteractionValues`、`ScrollFollower`），form 带进 `Reflow`；草案只写了 4 个空的 `import type {}`。包数不变，仍是 22 个包、除 plugin-builder 外 21 个要改。
- **F4** `icon()` 的名字表是 `icons.ts` 里 `ICONS`（约 130 个名字对 lucide 图形数据）的键，`MolisWorkIcon = keyof typeof ICONS`；图形数据是 lucide 的，SDK 不能带。SDK 只要名字。

要裁的点（各给了推荐）：

- **E1 页面端口的类型放哪里**（F3）。(a) SDK `/page-globals`（推荐）：类型引用 `HTMLElement`，contracts 没有 DOM 库；它们描述宿主交给页面的东西，和 `window.molisReflow` 同类。(b) contracts `platform/ui`：要给 contracts 开 DOM 库，不推荐。
- **E2 图标名字表怎么存**（F4）。(a) 名字表（`PluginIconName`，约 130 个字符串）放 SDK `/ui`，design-system 的 `ICONS` 声明成 `Record<PluginIconName, IconNode>`，编译期就保证每个名字都有图形（推荐）；一份名单，加图标要先改 SDK。(b) 只公开插件会用到的子集，要两份名单和一条测试对齐。代价：全部名字成了对第三方的承诺，改名或删除走 `CONTRACT-CHANGES.md`。
- **E3 design-system 里搬走的部件，宿主一侧怎么取**。(a) design-system 的 `index.ts` 用 `export { icon, … } from "@molis-ai/molis-work-plugin-sdk/ui"` 转出这些名字，一份实现，宿主 74 个文件不动（推荐）；这是私有包的入口门面，不是兼容层，也不是 `export *`。(b) 74 个文件全改成直接取 SDK，只是搬字，PR 一里夹一堆无关改动，共享核心全量要跑得更久。
- **E4 目录与侧栏**（F2）。(a) 进 SDK `/ui`（推荐）：D3 让四个伙伴插件各自用公开部件写舞台，它们要的正是 `renderSidebar`、`renderEmpty` 和目录行；不公开它们，D3 做不成。(b) 不公开，四个伙伴各自写一份侧栏标记：重复，且和工作台的设置目录长得不一样。

## 统筹裁定（2026-10-24）

- **D1**：三个子路径 `/ui`（字符串部件）、`/browser`（DOM 工具）、`/page-globals`（类型声明）。
- **D2**：design-system 改依赖 SDK，一份实现。
- **D3**：伙伴页面舞台不公开；四个插件各自用公开的舞台外壳、图标、按钮写自己的舞台。
- **D4**：`RECEIPT_WORDS` 与 `InteractionNextStep` 进 contracts 的 `platform/ui`（改合同）。
- **D5**：类名合同只做测试守护，不另登记类名表。
- **D6**：不留例外，不然 PG-055 关不掉。日期选择器的行为脚本是宿主往每个插件页面注入的全局（见第一节），所以 `renderDatePicker`（连同 `renderInput`、`renderCalendar`）进 SDK `/ui`、全局的类型进 `/page-globals`；若实现时发现它其实只是 Jelly 自己的脚本，就连脚本一起搬进 Jelly 的包。边界规则的名单里只有 plugin-builder 一条（创作台是平台能力，见非目标）。

## 验收（实现时再编号）

- SDK `/ui` 的每个部件输出都只用宿主样式表里有规则的类名（类名测试）。
- 22 个包里除 plugin-builder 外，没有从 design-system 的 import；规则 `plugin-private-ui-dependency` 在 `pnpm health:check` 里计数、只许减少。
- design-system 里这些部件只有一份实现（在 SDK）；`tests/plugin-sample.e2e.test.ts` 在本机兜底：外部作者只装两个包也能渲染舞台外壳与图标。
