# PG-055：SDK 提供公开的界面部件，插件包不再依赖私有的 design-system

状态：已实现（2026-10-25，#1284，分支 `ac-clients-pg055`，叠在 W5-04 第三组 #1278 之上）。统筹裁定 D1～D6（10-24）与 E1～E4（10-25）都按下面做；10-25 复查查出的四处与草案不符记在文末。部件由 SDK 的 `/ui`、`/browser`、`/page-globals` 公开，design-system 删掉本地实现并依赖 SDK，宿主一侧的 156 个文件直接从 SDK 取（不留转出），边界规则 `plugin-private-ui-dependency` 拦住插件再 import 私有界面包。

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

会被 esbuild 打进插件自己的客户端包的纯函数：`placeFloating`、`placeOverlay`、`pinAt`（`floating.ts`，134 行）、`followScroll`、`scrollShouldFollow`（`scroll-follow.ts`，30 行）。现在 design-system 已有 `./floating` 子路径，pages 的十处 import 都走它。只有 pages 和 coding 用，本片一起切过来（Pages 的包入口不再转出这两个函数，测试直接取 SDK；design-system 的 `./floating` 子路径随之删除）。

### 三、页面全局的类型声明

四个文件的 `import type {} from "…design-system"` 是为了拿 design-system 里 `declare global` 的页面辅助类型（`window.molisReflow`、`window.molisShowMore` 等，宿主往每个插件页面注入的全局函数）。这些全局本身是平台合同，类型声明应该和 `molisWorkRequest` 一样在 SDK 的 `declare global` 里（或 `@molis-ai/molis-work-plugin-sdk/page-globals`），插件用 `import type {} from "@molis-ai/molis-work-plugin-sdk/page-globals"`。

同一个子路径还放页面拿到的端口的类型：`host.interaction` 的 `InteractionClient`、`InteractionClientHost`、`InteractionValues`（`interaction-client.ts` 开头 40 行的接口），`ScrollFollower`（`scroll-follow.ts`），`Reflow`（`reflow.ts`，一行）。这些类型要引用 `HTMLElement`，contracts 不带 DOM 库，所以不进 contracts，见 E1。

### 四、标记和类名是合同

部件输出的 `mw-btn`、`plugin-stage-shell`、`data-work-surface` 等类名与 `data-*` 钩子，由宿主的样式表和客户端脚本定义。部件一公开，这些名字就是对第三方的承诺。守护方式：

1. 导出的形状进 `tooling/gates/api/plugin-sdk/ui.txt` 快照（`pnpm api:update`），和现有的 `highlight`、`rich-text`、`diff-view` 一样。
2. 新增一条测试：把 `/ui` 每个部件用一组典型输入渲染，收集输出里的类名，每一个都必须在宿主的完整样式表里有规则（反过来不要求）；`data-*` 钩子同样要在宿主脚本里被读到或在合同里登记。

### 五、依赖方向

`plugin-sdk` 只依赖 contracts，不能依赖 design-system。所以反过来：design-system 依赖 plugin-sdk，里面这些部件的实现删掉（`git mv` 到 SDK，不是抄）。宿主一侧（工作台、本机宿主、桌面壳、测试、design-system 自己的 17 个文件）原先从 design-system 取这些名字，E3 裁定**不留转出**：design-system 的 `index.ts` 不再导出它们，所有 import 直接改成取 SDK，由一个可重跑的脚本做（TypeScript 语法树，按名字查表改写模块路径，`MolisWorkIcon` 同时改名 `PluginIconName`；命令写在 PR 正文，批头合并后能再跑一遍）。`PACKAGE-BOUNDARIES.md` 第 34～36 行已写明「plugin-sdk 在最底层，其他层都可用它的运行时工具」，所以这个方向不违反层次；`design-system`、`im-ui`、`artifacts` 的 `package.json` 和 `scripts/workspace-packages.mjs` 里登记这条依赖。

### 六、边界规则

仿 `public-sdk-private-dependency` 加一条 `plugin-private-ui-dependency`（`packages/test-kit/src/boundaries.ts`）：插件（native-plugin、integration-plugin）的源码 import 和 `package.json` 依赖，不得指向 `design-system`、`im-ui`、`ui-host`。例外名单 `PRIVATE_UI_EXEMPT_PLUGINS` 里只有 `plugins/native/plugin-builder`（创作台是平台能力，见非目标），名单只许减少。这是绝对规则，不按文件计数：目前一处也没有。

## 实现记录（一个 PR）

1. contracts 的 `platform/ui` 加 `RECEIPT_WORDS`、`ReceiptWords`、`InteractionNextStep`（新增导出，快照入库）。
2. SDK 加三个子路径：`/ui`（`src/ui/*.ts`，一个文件一类部件，`src/ui.ts` 汇总）、`/browser`（`src/browser.ts`）、`/page-globals`（`src/page-globals.ts`，页面全局的 `declare global` 与端口类型）。图标名字表 `PluginIconName` 在 `src/ui/icon.ts`，design-system 的图标表声明成 `Record<PluginIconName, IconNode>`。
3. design-system 删掉搬走的实现（`primitives/` 里的按钮、输入、反馈、日历、目录、布局，`state-ring*`、`plugin-stage-shell`、`floating`、`styles/disclosure` 的函数等），改依赖 SDK；`./floating` 子路径随之删除（改取 SDK 的 `/browser`）。
4. 宿主一侧的 import 用脚本改写（见 PR 正文）；Pages 的包入口不再转出 `placeFloating`、`scrollShouldFollow`，测试直接取 SDK。
5. 22 个插件包除 plugin-builder 外去掉 design-system 依赖（有的补上 plugin-sdk）；四个伙伴插件（Files、Git、Diff、Text Stats）各自写自己的 `companion-stage.ts`（D3），用公开的 `renderPluginStageShell`、`renderSidebar`、`renderEmpty`、`icon`。四个 `import type {} from "…design-system"` 改成 `…/page-globals`。
6. 边界规则、文档（`PACKAGE-BOUNDARIES.md`、SDK 与 design-system 的 README、`skills/molis-plugin-dev/ui.md`、`host.md`）和测试同一个改动里更新。

影响面：动共享核心（SDK、contracts、design-system、工作台的页面生成），全量随批跑一次；本机没有跑浏览器用例，页面行为不变是靠「部件是搬不是改」和 design-system 现有的渲染测试兜住。页面资源：部件被打进各自的客户端包，只带用到的；服务端渲染的部件不进页面资源。

## 2026-10-25 复查：与草案不符的四处，和已裁的四点

对着 3b 之后的代码重量（`plugins/native/**` 里所有从 design-system 的 import）：

- **F1** `processFold` 是生成折叠样式文本的函数（`styles/disclosure.ts`），Coding 的 `timeline-styles.ts` 在服务端拼样式时用，不是浏览器端工具：从 `/browser` 改放 `/ui`（第一节已改）。
- **F2** `renderDirectoryPanel`、`renderDirectoryHeading`、`renderSidebar` 不是 Coding 专有：工作台的 `settings-directory.ts`、`arrival/chooser.ts` 和 design-system 的伙伴页面舞台（`companion-stage.ts` 用 `renderSidebar`、`renderEmpty`）也用。草案「搬进 Coding 包」不成立。
- **F3** 3b 之后 Coding 的类型化页面带进四个页面端口的类型（`InteractionClient`、`InteractionClientHost`、`InteractionValues`、`ScrollFollower`），form 带进 `Reflow`；草案只写了 4 个空的 `import type {}`。包数不变，仍是 22 个包、除 plugin-builder 外 21 个要改。
- **F4** `icon()` 的名字表是 `icons.ts` 里 `ICONS`（约 130 个名字对 lucide 图形数据）的键，`MolisWorkIcon = keyof typeof ICONS`；图形数据是 lucide 的，SDK 不能带。SDK 只要名字。

已裁（统筹 2026-10-25）：

- **E1 页面端口的类型放哪里**：SDK `/page-globals`。类型引用 `HTMLElement`，contracts 没有 DOM 库；它们描述宿主交给页面的东西，和 `window.molisReflow` 同类。
- **E2 图标名字表怎么存**：一份名单，`PluginIconName` 在 SDK `/ui`，design-system 的 `ICONS` 声明成 `Record<PluginIconName, IconNode>`，编译期就保证每个名字都有图形、也没有多余的图形。代价：全部名字成了对第三方的承诺，改名或删除走 `CONTRACT-CHANGES.md`。
- **E3 搬走的部件宿主一侧怎么取**：不留转出，宿主的 import 全部直接改成取 SDK，由可重跑的脚本做，命令写进 PR 正文。
- **E4 目录与侧栏**：进 SDK `/ui`。伙伴插件各自写舞台要的正是 `renderSidebar`、`renderEmpty` 和目录行；PR 的「公开合同与 API 影响」一节写明对外部作者的影响，`pnpm api:update` 刷新快照。

## 统筹裁定（2026-10-24）

- **D1**：三个子路径 `/ui`（字符串部件）、`/browser`（DOM 工具）、`/page-globals`（类型声明）。
- **D2**：design-system 改依赖 SDK，一份实现。
- **D3**：伙伴页面舞台不公开；四个插件各自用公开的舞台外壳、图标、按钮写自己的舞台。
- **D4**：`RECEIPT_WORDS` 与 `InteractionNextStep` 进 contracts 的 `platform/ui`（改合同）。
- **D5**：类名合同只做测试守护，不另登记类名表。
- **D6**：不留例外，不然 PG-055 关不掉。日期选择器的行为脚本是宿主往每个插件页面注入的全局（见第一节），所以 `renderDatePicker`（连同 `renderInput`、`renderCalendar`）进 SDK `/ui`、全局的类型进 `/page-globals`；若实现时发现它其实只是 Jelly 自己的脚本，就连脚本一起搬进 Jelly 的包。边界规则的名单里只有 plugin-builder 一条（创作台是平台能力，见非目标）。

## 验收

- PG055-01（RAC-549）边界规则 `plugin-private-ui-dependency` 拒绝插件（含集成插件）import `design-system`、`im-ui`、`ui-host`；App 与平台包不受影响。`packages/test-kit/tests/boundaries.test.mjs`。
- PG055-02（RAC-550）例外只有 plugin-builder，名单是 `PRIVATE_UI_EXEMPT_PLUGINS`。同上。
- PG055-03（RAC-551）SDK `/ui` 每个部件输出的类名，都在宿主样式表里有规则。`tests/sdk-ui-markup.test.ts`。
- PG055-04（RAC-552）`icon()` 写的是对页面图标雪碧图的引用；SDK 的名字表与 design-system 实际画的图标一一对应。同上。
- PG055-05（RAC-553）外部作者只装 contracts 与 SDK 两个包，也能渲染舞台外壳、按钮、图标，取到 `/browser` 与 `/page-globals`。`tests/plugin-sample.e2e.test.ts`（本机兜底）。
- PG055-06（RAC-554）design-system 里没有 SDK `/ui` 已公开的部件的第二份实现。`tests/sdk-ui-markup.test.ts`。
- PG055-07（RAC-555）除 plugin-builder 外，没有插件的源码或 `package.json` 引用 design-system。同上。

## 2026-10-25 编译环境跟进与验收（FIRST6396482114，非阻塞）

准确基点是 `d67cf115ab2f21d18c965ea1741c020a0993fdb7`。SDK 的单一 `src/**/*.ts` 编译同时纳入了 `/browser`、`/page-globals` 的 `reference lib="dom"`，使 Node 实现和纯字符串 `/ui` 也能误用 `document`、`window`。本项只恢复编译时的环境边界，不改变部件行为、标记、公开导出或依赖；不作为 #1270 的合并依赖。

SDK 的现有 `tsconfig.json` 继续编译 Node 与纯字符串源码，排除两个浏览器入口；新增包内 `tsconfig.browser.json` 单独用 ES2022、DOM 编译这两个入口，并从源码移除 DOM lib 引用。`build`、`typecheck` 顺序运行两份配置，仍向同一个 `dist/` 生成原路径的 JS、声明、映射。不改根配置或共享构建器，不新增公开路径，不转出私有包，不引入全局兜底。浏览器消费者自行声明 DOM 环境。

目标是本项编译边界功能可用。`tests/plugin-sdk-environments.test.ts` 使用真实 TypeScript 按生产配置检查 SDK，并编译仅包含构建后 contracts、SDK 的独立消费项目；独立消费项目不跳过声明检查。反例以实际诊断失败证明，不能靠字符串扫描或 `@ts-expect-error`：

- PG055-08：在 Node SDK 根入口和 `/ui` 的生产编译中注入 `document`、`window` 误用，两处都必须实际报找不到 DOM 全局；其余生产源码不能出现新诊断。
- PG055-09：只有 ES2022 与 Node 类型的独立项目可从现有根入口和 `/ui` 消费构建声明；加上 `document`、`window` 后实际编译失败。
- PG055-10：只有 ES2022 与 DOM、无 Node 类型的独立项目可消费 `/browser` 与 `/page-globals`，包括宿主 Window 扩展及页面端口；给 DOM 工具错误的元素类型时实际失败，证明声明完整且仍有约束。

验证命令：公共 FIFO 中整体 `pnpm build`；`node scripts/run-tests.mjs tests/plugin-sdk-environments.test.ts tests/plugin-sdk-exports.test.ts tests/plugin-sdk-subpaths.test.ts tests/sdk-ui-markup.test.ts`，以及 SDK README 要求的相关非浏览器用例；`pnpm --filter @molis-ai/molis-work-plugin-sdk run typecheck`、公开 API 快照与包边界检查。保留生成声明和构建来源证据。共享核心最终组合、full、CI 与合入仍由 Claude 统筹，本项不另起 full 或浏览器批次。
