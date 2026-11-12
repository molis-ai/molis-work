# Web 产品界面与页面组合

工作台外壳：底栏、插件选择、按 Manifest 派生的导航、设置，以及进入工作台之前的页面，让每个插件的内容挂在同一个工作区里。

包名：`@molis-ai/molis-work-app-workbench`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Local Host 提供页面模型和操作端口；Workbench renderer 组合公共样式、导航与 Plugin UI，浏览器脚本处理选择、滚动恢复、刷新和请求。Goal 终端（xterm 画面、面板的开关与重开、连接与自动补全）在 `src/terminal/`；`src/terminal-client.ts` 相对导入 `src/terminal/client.ts`，由 `pnpm build:pty-client` 打包。子路径 `@molis-ai/molis-work-app-workbench/terminal` 为测试提供公开入口。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui-composition.ts](src/ui-composition.ts) | UI 组合 |
| [src/shell-page-renderer.ts](src/shell-page-renderer.ts) | 工作台整页装配 |
| 渲染器的组合根（`createWorkbenchRenderer`） | 只把请求的语言与桌面端口交给各页面渲染器，再返回宿主用的渲染表。Goals 的渲染器见 [plugins/native/goals/src/page/renderers.ts](../../plugins/native/goals/src/page/renderers.ts)，Goal 文档与终端面板见 [plugins/native/goals/src/page/documents.ts](../../plugins/native/goals/src/page/documents.ts)（工作台经 `createGoalsPage` 把壳的端口交给它，T-116），Feed、Inbox、Schedule 舞台见 [src/stage-renderers.ts](src/stage-renderers.ts)，日期、列表与链接前缀见 [src/renderer-helpers.ts](src/renderer-helpers.ts) |
| [src/home-plugin-page.ts](src/home-plugin-page.ts) | 无项目时的 Home 工作台；复用文档壳和 UI Host 生命周期，装配 Runtime 提供的内容片段 |
| [src/scripts/client/initialization.ts](src/scripts/client/initialization.ts) | 客户端初始化与恢复 |
| [src/browser-assets.ts](src/browser-assets.ts) | 浏览器资产入口 |
| [src/terminal/index.ts](src/terminal/index.ts) | Goal 终端：面板、xterm 画面与连接（`./terminal` 子路径），请求都走共同 UiRequest；开、列、关、重开走页面给的 Goals 路由（`data-tui-terminals-route`，客户端不点名插件），`/pty` 只附着（S-103 ⑦，T-148） |
| [src/write-checkers-section.ts](src/write-checkers-section.ts) | 项目设置「写后检查」的宿主标记：每句话都由宿主按页面语言写出（`data-say`、三个 `<template>` 带 `{槽}`、catalog 的表单对话框与删除用的警示对话框），页面程序不带任何中文 |
| [src/browser/write-checkers.ts](src/browser/write-checkers.ts) | 项目设置「写后检查」的页面程序：有类型的 TypeScript（`tsconfig.browser.json` 按 DOM 检查），构建时 esbuild 从 `write-checkers-factory.ts` 打成 `dist/write-checkers-client.js`（页面全局 `molisWorkWriteCheckers = (host) => {…}`），`src/scripts/write-checkers-client.ts` 读这份包；只有画这一段的两处（工作台脚本、项目设置页）带它，全局设置页不带，`project-settings.ts` 有它才绑定 |
| [src/assistant-text-html.ts](src/assistant-text-html.ts)、[src/assistant-text-parts.ts](src/assistant-text-parts.ts) | Assistant 正文、代码与审查的 Host HTML 投影；原始文字始终转义，浏览器只绑定阅读与决定操作 |

可对照现有调用方 [apps/local-host/src/workbench-renderer.ts](../local-host/src/workbench-renderer.ts) 阅读装配方式。

## 接入与边界

本包处理页面结构和交互装配，不打开数据库。宿主通过 `unavailable_plugin_stages` 提供不可用舞台的结构化显示数据，工作台转义后绘制静态占位；该分支不申请插件页面授权，正常 `plugin_stages` HTML 始终进入原 sandbox frame。目标状态解释、关系/规划等专属界面由 Goals Plugin 提供；通用主题和图标由 Design System 提供。

项目常规设置保留最初名称观察值，保存冲突时留住输入草稿，不以后台新读值替旧编辑授权。缺失插件区仅显示 Host 核对后尚未安装的依赖；已安装但停用的插件不报缺失，原始标识可换行，提示不触发下载、安装、启用或授予权限。真实 Chrome 动线在 `tests/project-settings-standalone.e2e.test.ts`。

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

## 本地开发

内置同步集合只在 `BUILTIN_PLUGIN_CATALOG` 登记。Module 项目内容用 `project-sections` 描述符列出公开 owner 身份、资产种类和技术日志命名，不在工作台导入 Module 实现；Host 在既有项目库组合根解析 owner 定义，调用公共 Storage 的事务组装。声明与发现本身不打开库、不授予同步权限。

改共享控件或列表交互时，建议对照 `/__ui/catalog`（见 [CLI 与开发 · 前端与控件板](../../docs/cli-and-development.md#前端与控件板)），达标标本补进 Design System Catalog。

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
pnpm --filter @molis-ai/molis-work-app-workbench build
```

已有行为示例与回归：[workbench-ui-platform.test.ts](../../tests/workbench-ui-platform.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/workbench-ui-platform.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## Home 外观

设置的候选只画在样张里。宽度随设置内容的容器变化，空间不足时同一张样张移入 Sheet。首次打开使用宿主提供的快照和样式引用。其后的外观选择变化沿本页证明订阅 Home 修订，插件隔离 frame 从已绑定的父页端口接收已准备的外观。终端按等宽字重测原会话。

改动后用 `node scripts/run-tests.mjs --jobs 1 tests/appearance-settings.e2e.test.ts` 核对真实页面。外观及动作边界见 [B/C 运行合同](../../specs/font-and-skin-system/bc-runtime-contract.md)。

## 界面文字：稳定键和翻译检查

界面短句在 SDK 的 `t`／`say` 中引用稳定键。HTML 插值用 `t`／`say`，节点的 `textContent` 或会自行转义的控件用 `t.text`／`say.text`。日期和数字用 SDK `format`，在整句里用 `dateArg`、`numberArg`。用户原文作为参数，不能作为键，也不把译好的句子写进业务记录。

平台短句在 [`resources/locales/`](resources/locales/)；每个插件自己声明 `ui.locales`，拥有自己的 `locales/<语言>.json`。键用 `<主人>.<位置>.<元素>`，不要以显示文字或对象 ID 拼键；一组状态值可以用一张固定的键表。确需让各插件读取的词用平台的 `common.*`。宿主代画插件交来的内容时，从对象所属的实际运行或发布来源选读表。详细写法见 [作者指南](../../skills/molis-plugin-dev/text-and-appearance.md) 和 [UI Platform](../../docs/platform/UI-PLATFORM.md#5-界面文字语言与外观)。

`node scripts/gates/translations.mjs --missing` 找声明、默认语言和英文缺漏、重复键、参数名不一致及私有词越界；同一规则随 `pnpm health:check` 运行。检查按源码和同程序内转交文字的调用扫描（包括模板中的浏览器脚本）；计算出来的键和后端动态投影还需运行核对。`--dead` 只报告未找到字面量的键，不据此删除动态使用的词。`--calls` 列可静态解析的调用。改语言入口同时跑 `tests/workbench-language.e2e.test.ts`，核对切换不丢焦点、选区、草稿，也不接受旧响应覆盖。

## 开发要求

插件设置中，双实例的项目可选权限只读定位到个人空间，Home disabled/crashed 仍按安装、插件、发布者签名与信任配对；可信内部安装 ID 标识避免 Home 缺失时回落项目开关。required/requested/granted 仍表示各安装自己的声明与记录。回归：`tests/plugin-permission-switch.e2e.test.ts`（RAC-2910）。

目录 SSR 与目录 section 共用实际 `data-directory-panel` 身份；owner 提供的另一目录别名不代表 owner 自己有目录。已存目录宽度从同项目/collection 的 session UI 键在首绘前应用到本页 workspace，和 resizer 共用 `directory-width.ts` 的边界；嵌入 pane 跳过，缺少偏好仍由响应式 CSS 决定。回归见 `tests/declared-stages.test.ts` 与原完整 `tests/load-geometry.e2e.test.ts`。

- 浏览器交互回归先等待生产界面的可操作状态，再取点：按 [VUX-22 自然高度折叠合同](../../specs/visual-ui-experience/spec.md#disclosure-segmented)，展开到容纳目标按钮后，才由现有点击助手滚动并验证命中（`tests/goals-planning.e2e.test.ts`、`tests/feed-capture.e2e.test.ts`）。保留原等待上限、严格点击与业务结果断言；超时或遮挡仍失败，不增加固定睡眠、不关闭动效、不改产品布局。Feed 的预览零入箱、规则保存与真实消费、停用提供方后保留绑定仍由原用例验收。
- 负责：工作台界面的组合根：导航、插件选择、设置页、Functions 编辑器、Goal 终端（`src/terminal/`），以及进入工作台之前的页面——项目选择页与简介、开场与 Welcome、新建项目引导、更新页（`src/arrival/`、`src/context-onboarding-renderer.ts`、`src/scripts/context-onboarding.ts`）。
- 不负责：业务 Store、Node 专用实现、Tauri 命令。
- 公共工作台脚本由 `tooling/build-client.mjs` 在构建时生成：请求助手 bootstrap 保持原样在最前，其余程序由仓库构建工具 `scripts/client-literals.mjs` 在已有函数作用域内复用重复的表达式字符串，再经 esbuild 压缩空白、局部绑定名及等价语法。字面量值、指令序言、属性名、事件名和公开全局不变。字符串池的语义测试为 `node --test tests/client-literals.test.mjs`。运行时只读取生成的 dist 资源。修改后先构建再跑浏览器回归，页面资源预算只能下调。
- 插件框架的 TypeScript 桥由 `tooling/build-client.mjs` 打包并复用同一字面量压缩，写入 `dist/plugin-frame-client.js`。`src/plugin-frame.ts` 将它和共用控件合成框架脚本。
- 账号与空间菜单的浏览器入口在 `src/browser/personal-account.ts`，由 `tsconfig.browser.json` 独立做 DOM 类型检查；包的构建命令用 esbuild 先打包，再参与公共工作台脚本组合。服务器端 `src/scripts/personal-account.ts` 只读取构建资源，不再保存程序字符串。
- 账号入口可用 Tab 到达、Enter/空格打开，未登录时焦点进入登录按钮；Esc 关闭后返回可见入口，若账号行所在的项目菜单已收起则返回其 summary。浏览器测试先等菜单真正可见，不把尚在 `content-visibility` 过渡中的节点当作能接收焦点；账号菜单改动后必跑：`node scripts/run-tests.mjs tests/personal-menu.e2e.test.ts`（PCSYNC-KBD-01）。
- 公开入口：`@molis-ai/molis-work-app-workbench`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：组合根：按 `package.json` 装配已登记的包，只做装配与 IO，不写业务规则。方向见[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节。
- 不变量：
  - Home 包的项目同意显示在当前项目设置的插件行；确认只提交当前选择快照，取消不发修改请求，失败重读真实状态。声明增加要重新确认，旧列表回执不能覆盖新状态；实际工作台导航和刷新都保留 iframe 的项目绑定，Home 打开则没有项目。回归：`tests/home-package-project-reach.e2e.test.ts`。
  - 窄屏仍显示完整内容（`DESIGN.md` Layout、VUX-40）：放置完成卡的长项目名在卡内换行，移动与关闭按钮留在视口内；Home 日期条为「今天」与事件点统一预留底部空间，日期数字不与状态字相叠，各日期仍对齐。手机沿用现有 70px 高度，比原来的 64px 多出 6px 容纳三层字形及后备字体，列宽仍为 49px。不改文字与日期行为，不加截断与审计例外。回归 `tests/chinese-completion-layout.e2e.test.ts`、原 `tests/chinese-layers.e2e.test.ts` 与 `tests/placement-card-clearance.e2e.test.ts`。
  - Home 工具（目录项 `runtime.keys`，现在是 Issue 的 `Mod+Shift+I`）是开关：按钮或组合键打开它的侧栏视图并把键盘送进视图文档，从视图里再按一次收起。组合键在同源框架里（侧栏视图、嵌入窗格，以及本机 Host 发的讨论页）由 `homeToolKeysScript()` 转交给外壳；从视图里收起时键盘回到打开它的地方，打开前没有焦点就离开侧栏；带组合键的视图在页面空闲时预载，第一次按下就可用。视图可回报 `molis:side-status`（`busy` / `attention`），外壳在它的页签和按钮上标点，侧栏收起时也看得到。Home 插件侧栏始终只展示当前页。验证见 `tests/issue-global-navigation.e2e.test.ts`。
  - 可见插件页面的非终端内容中，`Mod+K` 与 `Mod+F` 经同一 plugin-frame 桥进入外壳的全局搜索，分别保留开关与打开／聚焦语义。组合由可信外壳提供；子页已处理、组合输入、重复键和终端目标不转发。嵌套侧栏搜索还需核对同源、真实来源框、当前打开且可见的非 inert 页，不接受消息自报身份。原 Home 工具键与讨论页召回路径保持。回归见 `tests/global-ui-interaction.e2e.test.ts`（RAC-2800、2802）、`tests/issue-global-navigation.e2e.test.ts`（RAC-2801～2803）。
  - 侧栏脚本（`side-panel*.ts`）发出时去掉整行注释：说明留在源码里，不进页面资源。
  - 跨请求的页面操作固定点击时的对象：浏览器文件选择绑定 chooser 与网页，网站决定绑定原审查和显示的网站；文件预览绑定 source/kind/id 与本次打开。迟到结果不改后来打开的对象，设置与引用预览的失败也遵守同一约束。判断规则样例与草稿删除更新原记录，保留另一规则或同一规则的新编辑。标签恢复只收当前保存格式，保留当前组、分屏与设置页撤下规则。回归见 `tests/workbench-browser-targets.e2e.test.ts`、`tests/workbench-async-targets.e2e.test.ts`、`tests/workbench-functions-late.e2e.test.ts`、`tests/workbench-current-tabs.e2e.test.ts`。
  - Goal Frame 跨窗口同步只改变相机、块与展开状态没变时，保留正在交互的块和已加载正文，不重复读取 owner；删除或换引用、版本时仍更新并使旧手势失效。真实跨窗口 storage、可信点击、正文加载与持久化回归见 `tests/workbench-frame-container.e2e.test.ts`（FCS-01～04）。
  - 插件市场从 Host 重读项目成员；既有 `molis-work:plugins-changed` 使这份投影失效，过期读取不覆盖新事实。后台命令停止失败通过共同 UiRequest 显示拒绝、结果未知与可复制的诊断编号，不自动重试；真实命令状态及 Coding 的持久投影仍归它们的 owner。回归见 `tests/workbench-async-targets.e2e.test.ts`、`tests/workbench-stop-feedback.e2e.test.ts`；后者用公开 Runtime 端口控制隔离子进程，不调用模型。
  - 导航与区域从 Manifest 派生（`BUILTIN_PLUGIN_CATALOG`），不按插件名写分支。
  - 公开入口 `src/index.ts` 不转出任何 `@molis-ai/molis-work-plugin-*` 包的名字（含经 `browser-assets` 转出的），没有 `export *`（含 `export type *`、`export * as`）：新增的 helper 不会自动变成公开面，宿主与测试要插件的名字就从该插件的公开入口取。没有文本使用者、只因宿主的声明文件生成必须点名而留在入口的类型只有 `ChooserArrival`、`ProjectSettingsFoldId`、`SideViewDocumentInput` 三个（`tests/workbench-entry-exports.test.ts` 的 RAC-1115 钉住，多一个就要在那里写理由）。平台成果的绘制（`artifactWorkbench`）与工作台自己的目录是工作台的东西，不算转出。
  - 终端用 xterm 的命名空间导入并兼容 default 导出，两种打包形态都能加载；终端的请求走共同 UiRequest，不直接 `fetch`。改 `src/terminal/` 加跑 `node scripts/run-tests.mjs tests/work-terminal-client.test.ts tests/desktop-tui.test.ts`。
  - 目录条目可标 `developer: true`（Text Stats，平台的最小参考插件和测试依托）：只在 Host 开着开发者模式时进插件选择器和市场（`pluginMarketCards({ developerMode })`、`renderPluginRail`/`renderPluginMarket` 的 `developerMode`，由页面视图的 `developer_mode` 传入）；仍然登记、仍可安装，项目里已经添加的照常显示、可移除（W2-18 决定 5，2026-10-09）。开发者模式只是 Host 进程的启动开关（`MOLIS_WORK_DEVELOPER_MODE=1`），不是用户设置，设置里没有开关（用户 2026-10-09 已定，见 `apps/local-host/README.md`）。
  - 目录条目的浏览器脚本发出去时，`registration.workbench` 设 `clientServed: true` 即可去掉整行 `//` 注释、独占行的 `/* */` 注释和每行行首的缩进（页面资源预算只许减少；`/* */` 与代码共用一行的不动；脚本里有跨行字符串或模板时缩进是内容，不能用它）：作者在源码里保留注释和缩进，`tests/plugin-client-served.test.ts` 证明发出去的是同一段程序；用它的条目要进这个测试的名单。
  - 内置 build 只在各包 `src/registration.ts` 的 `registration` 绑定一次 Manifest、目录信息、Agent 正文与 UI/静态资源；`builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG` 由 `node scripts/generate-plugin-registry.mjs` 从它们生成，不手改（`pnpm health:check` 跑它的 `--check`），宿主加载时 `catalogProblems`（`apps/local-host/src/plugin-registry.ts`）自检重复的 id 与位置、悬空的 `companions` / `clientUses`。哪些插件是个人插件、常开、连带什么、项目显示哪些，都是宿主的事实：它写在页面视图的 `shown_plugins` 与 `plugin_directory` 各项的 `personal`、`always_on`、`companions` 上，外壳只读这些（W5-02 B1）；没有宿主画页面的测试用 `tests/fixtures/host-plugin-facts.ts` 拿同样的事实。构建期装配只剩用户批过的两个例外 Alchemist、插件创作台（`tests/builtin-plugin-assembly-gate.test.ts` 的 `APPROVED_BUILD_TIME_EXCEPTIONS`）；新的内置插件只走 Plugin Runtime 装配，但仍在自己的 `registration` 登记一条（该测试要求每个 Runtime 装配的 id 都有目录条目），所以目录本身不是例外名单；`plugin-catalog.ts` 和 `plugin-workbench.ts` 派生外壳的投影（导航、资源），不派生平台事实。资源 order 保持 CSS 与客户端初始化顺序，不改变 Manifest 的导航 order。公共动作发现与授权仍归 Kernel/Host。
  - 插件的 Agent 提示词、方法正文与模型指令随插件定义（`PluginDefinition` 的 `agent_prompts`、`agent_skills`、`methods`、`instructions`）走，不在 `registration` 上；Manifest 只写声明（PG-051）。
  - 界面文字用稳定键，默认词包和英文都要有，`pnpm health:check` 失败时按上节「界面文字」定位；控件只用 design-system，不引入系统弹窗或原生下拉。
  - `development: true` 只标明隔离预览，不能当作真实团队接通的证明。
  - 浏览器端程序由 `src/scripts/client/*` 字符串片段拼成，类型检查看不到里面：改动后跑 `tests/client-script-undeclared.test.ts`，它检查拼接结果里没有未声明的名称（页面全局在测试里列白名单）；进入工作台之前的三段程序（选择页、引导、动效）也在其中。
  - 助理的发送片段 `scripts/client/assistant-send.ts` 在点击时固定工作、作用域、执行者/方式、Character、页面上下文、材料、HTTP 路由与 request_id。等待草稿或回执时可以继续选择别的工作、项目和输入；回执只更新对应工作，仍属于当前输入时才清掉已发送材料和文字。连接中断后的同一条重试沿用原请求；发送期间的后续输入立即留在对应工作草稿，列表重读和发送回执保留它，回执后再提交。A→B→A 不恢复已发送文字，B 的编辑不算 A 的新草稿。真实 Host/HTTP/Store 与 Chrome 网络 barrier 回归见 `tests/assistant-send-intent.e2e.test.ts`（W2-18-SEND-01/02）。
  - 助理对话的滚动只有一个主人：设计系统的 `window.molisFollow`（VUX-26）。到底跟随、人往上滚就停，新内容不推走读者，「新消息」回到最新；明确发送也回到最新，跳到等人的卡之前先 `release()`。侧栏的 产出、变更、后台任务 是三个同样的折叠组，收起仍显示失败或进行中的数目，更新不擅自展开（VUX-08）。回归 `tests/assistant-scroll-follow.e2e.test.ts`、`tests/assistant-side-groups.e2e.test.ts`。
  - 助理侧栏的六组（工作环境、上下文、连接与工具、产出、变更、后台任务）在 `scripts/client/assistant-island.ts` 与 `assistant-side-context.ts`：上下文只读输入条与工作自己的轮次，工作环境与连接与工具读宿主的 `GET /api/assistant/works/<id>/surroundings`，只在工作、修订或状态变化时再问。改动跑 `node scripts/run-tests.mjs tests/assistant-side-groups.e2e.test.ts tests/client-script-undeclared.test.ts`。
  - 助理单轮记忆参考由 `assistant-process.ts` 展示：已提供、送达未确认、内容已更新、本轮参考记录未保存分别说明，未知不计入已提供；空引用移除旧正文，更新保留原折叠节点与展开状态。真实 Chrome 渲染合同回归 `tests/assistant-memory-usage.e2e.test.ts` 使用读取 DTO；SDK 派发事实另由 AgentHost 真实 Node/HTTP 回归证明。
  - 助理的用量框（`assistant-side-context.ts` 的用量工厂，VUX-11）分上下文窗口、本轮、账户额度与这项工作四处，数字只取运行时对这一轮的报告与轮次的 `model`：占比要已用与窗口都已知，没报的写「暂不可用」而不是 0，估算照口径标出。改动跑 `node scripts/run-tests.mjs tests/assistant-usage.e2e.test.ts`。
  - 助理操作卡按完整集合清理，逐张放到时间线时保留其他卡；刷新工作所得成功或失败只影响仍对应原工作 ID 的页面。回归 `tests/assistant-page-cards.e2e.test.ts` 验同一工作的两张页面卡、独立执行/忽略与重读；`tests/assistant-stale-refresh.e2e.test.ts` 验真实 owner 删除、迟到 404 与后选工作的草稿保持（W2-18-PAGE-CARDS-01、W2-18-ASSISTANT-404-01）。
  - 进入工作台之前的页面是一个框架（标题栏 · 舞台 · 常驻底栏，`arrival/shell.ts`）和一张样式表（`/assets/molis-work-arrival.css`，`styles/arrival.ts`）：页面之间是整页跳转，框架不动；控件与部件只用 design-system 的 `mw-*`，页面样式只排版，不另画一套。
  - 项目简介由 `composeProjectBrief` 从公开读口（Goals 目录与状态、Home 事项、长期背景）的结果决定，读不到的部分如实写「读不到」，不猜、不补示例数据；选择页不读任何项目的私有存储。
  - 模型设置页（`scripts/settings-models.ts`）在第一个能用的模型出现时通过绑定选项报告给设置外壳，`settings-directory.ts` 宣布 `molis-work:model-ready`，开始使用页（`scripts/context-onboarding.ts`）经同名 `BroadcastChannel` 收到；先关设置再宣布、窗格框架、跨标签与桌面壳的限制，机制只写在 `packages/contracts/src/platform/dom-events.ts` 的登记条目（主人是 `settings-directory`），这里不复述，监听者用 `node scripts/gates/dom-events.mjs --report` 查。独立 Home 的 `scripts/home-model-settings.ts` 同时消费既有打开设置请求与本页链接，使用同一同源/路径校验，不导航宿主。回归：`tests/issue-home-locale.e2e.test.ts`、`tests/model-first-setup.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/model-ready-cross-tab.e2e.test.ts`（两个标签页）
  - 回程（`specs/draft-and-return/spec.md`）：页面的 `host.returns`、普通设置链接、助理的「继续接入」与原处连接卡去设置时开一张回程。形状检查与窗口号在 `src/browser/return-trips.ts`，外层文档的唯一写入方 `settings-return` 在 `src/browser/settings-return.ts`（与前者一起由 esbuild 打成 `dist/settings-return-client.js`，`scripts/client/settings-return.ts` 读进客户端脚本最前面，在任何框架挂上之前），框架宿主的一半在 `src/browser/plugin-frame/returns.ts`；`settings-directory.ts` 在打开设置后调它的 `open`／`link`，模型设置与连接页保存后调 `saved`；布局回答 `molis-work:layout-holds` 在 `scripts/client/tab-workspace-places.ts`；返回条的模板与样式归设置外壳，共用件 `renderReturnBar`、`renderResumePrompt` 在插件 SDK 的 `ui`。改动跑 `node scripts/run-tests.mjs tests/security-invariants-return-trips.test.ts tests/settings-return-trips.e2e.test.ts tests/security-invariants-return-trips.e2e.test.ts tests/model-first-setup.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts`，后三项在下面的「界面改动加跑」里。
- 改动后必跑：`node scripts/run-tests.mjs tests/style-has-scope.test.ts tests/plugin-declarative-mounting.test.ts tests/builtin-plugin-agent-texts.test.ts tests/builtin-manifests-contract.test.ts tests/builtin-plugin-composition.test.ts tests/workbench-ui-platform.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts tests/ui-request-client.test.ts tests/ui-request-client-pages.test.ts tests/settings-requests-through-helper.test.ts tests/web-service-settings-client.test.ts tests/assistant-island-script.test.ts tests/plugin-client-served.test.ts tests/plugin-list-developer-mode.test.ts tests/plugin-picker-pins.test.ts tests/settings-call-diagnostics.test.ts tests/capabilities-page.test.ts`
- 插件安装预览的范围、服务地址或确认交互改动，验证 `node scripts/run-tests.mjs tests/plugin-trust-view.test.ts tests/plugin-trust-home-upgrade.e2e.test.ts tests/i18n.test.ts`。局部 view 输入单列；RAC-2619 用真实 File、服务端预览/确认与 Home runner 核取消零写、旧版本比较、来源文本、中英文及三宽度明暗状态。
- 写后检查设置改动加跑：`node scripts/run-tests.mjs tests/write-checkers-settings-http.test.ts tests/write-checkers-settings.e2e.test.ts`。后者以真实 Chrome 与临时 Home 验证保存/重读、毫秒时限、删除确认及焦点、版本冲突/重读失败保留输入、撤权无写入与中英文响应式页面。
- 助理失败响应按共同错误体读取：`code` 在顶层，恢复工作与修复入口只从 `details.work` / `details.action` 取。保留原文草稿、同一 work、请求标识及结果未知时的恢复；改动这条路径跑 `node scripts/run-tests.mjs tests/assistant-island-script.test.ts tests/assistant-error-recovery.e2e.test.ts tests/assistant-page-written.e2e.test.ts`（后两份需要本机 Chrome）。
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workbench-tab-workspace.e2e.test.ts tests/call-id-lookup.e2e.test.ts tests/ui-request-client.e2e.test.ts tests/request-failure-call-id.e2e.test.ts tests/model-first-setup.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts tests/model-ready-cross-tab.e2e.test.ts tests/assistant-send-intent.e2e.test.ts tests/assistant-page-cards.e2e.test.ts tests/assistant-stale-refresh.e2e.test.ts`（后三个守住模型设置页、设置外壳的先关再宣布和各页面的重读，见不变量里的 `molis-work:model-ready`；其中 Jelly 一条守住「设置盖下面的页面不能开模态对话框」；`call-id-lookup` 守住「设置 › 诊断」按诊断编号查找、原地再查和复制完整编号；`request-failure-call-id` 守住失败的请求在查得到时显示诊断编号、点一下复制完整编号，查不到的失败不显示，写入断线时说不知道有没有完成）；改到分栏窗格与设置链接再加跑 `tests/cognia-embedded-settings.e2e.test.ts`（窗格里的设置链接只经窗格自己的一条转发到达外层，插件不另发消息）；改到进入工作台之前的页面再加跑 `tests/project-arrival-chooser.test.ts tests/project-brief.test.ts tests/project-arrival.e2e.test.ts tests/onboarding-journey.e2e.test.ts`（后两个检查每屏在各宽度、明暗下没有元素重叠、被裁、够不着）。
- 上述跨请求目标、成员刷新、标签恢复或停止反馈改动再加跑：`node scripts/run-tests.mjs tests/tab-workspace-ops.test.ts tests/workbench-current-tabs.e2e.test.ts tests/workbench-browser-targets.e2e.test.ts tests/workbench-async-targets.e2e.test.ts tests/workbench-functions-late.e2e.test.ts tests/workbench-stop-feedback.e2e.test.ts`。浏览器用例只用临时 Home 与本地站点，在原请求/响应上设 barrier，核对页面状态和原对象的 Host/Runtime 事实；须在共同请求助手装配完成后运行。
- 相关手册：[DESIGN.md](../../DESIGN.md)、[specs/craft-finish/spec.md](../../specs/craft-finish/spec.md)、[docs/platform/UI-PLATFORM.md](../../docs/platform/UI-PLATFORM.md)、[skills/molis-plugin-dev/ui.md](../../skills/molis-plugin-dev/ui.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

独立插件资源每项最多等待 10 秒，失败或挂起超时解除界面等待并提供原资源重试入口；重试不重派业务动作。Host 关闭释放等待中的资源与定时器，旧请求迟到不重复挂载；已打开界面和最近选择沿用原实例。

## 进一步阅读

- [职责与接入说明](../../docs/platform/UI-PLATFORM.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

当前项目的输入目录与输出目录由项目设置的「工作目录」页统一维护（项目不记资料与 Git 的浏览选择，页面看哪个目录是页面自己的状态），Workspace 不再作为导航插件。页面与嵌入工作台共用 `project-settings-pages.ts` / `scripts/project-settings.ts`；协议和设置归属见 [PROJECT-SETTINGS.md](../../docs/platform/PROJECT-SETTINGS.md)。

工作台从现有内置目录派生独立客户端资源，首次打开时装入惯有 surface DOM 并准备 `clientAssets` 后挂载。原 surface 根节点和已挂载实例持续保留；隐藏时使用原 UI Host 生命周期暂停读取。独立侧栏文档同样在执行工厂前加载插件声明的 `clientAssets`，不依赖主区先打开。Pages 编辑器由 Pages 的登记声明依赖。Coding 与伴随视图的装配在 Coding 包里（`plugins/native/coding/src/browser/workbench.ts`），工作台没有 Coding 专用脚本：Git、Diff、Text Stats 各有自己的客户端包（`/assets/molis-work-plugins/<id>.js`）与样式（登记的 `stylesheet`），不借 Coding 的，打开一个伴随面只下载它自己的一份（`pluginSurfaceClients()` 是主区、侧栏文档和按需加载共用的一份名单）；Coding 的登记写 `clientUses: ["git"]`，`plugin-workbench.ts` 把这个包加进 Coding 的 `clientAssets`（挂载前先加载），并把 Git 登记的客户端作为 `host.clients.git`，以 Git 插件的身份，把宿主的评审动作作为 `host.reviews` 交给 Coding 的工厂（只是渲染钩子，不给决定权），两边写得不对应就在派生时抛错。失败保留内容并提供仅重载 UI 资源的按钮，不自动重试业务动作。分屏省略其他独立客户端 surface 的正文，通用 Goals/Feed/Inbox 与设置绑定保留；CSS 为保持现有全局层叠仍由 shell 按原顺序提供。回归见 `tests/workbench-deferred-clients.e2e.test.ts`、`tests/workbench-hidden-refresh.e2e.test.ts`。

插件样式（PG-070）：页面在框架里运行的插件（有客户端）把自己名字空间下的规则（`.<id>`、`.<id>-…`、`[data-<id>…]`，以及登记的 `stylesheetPrefixes`，类名早于 id 的插件用，如插件创作台的 `as-`/`pb-`）作为 `/assets/molis-work-plugins/<id>.css` 单独发，只由要用它的框架在工作台样式表之后链接（`FramePack.styles`，来自 `pluginSurfaceClients()` 的 `styles`）；有设置页的插件（Shelf、Coding）另外由外壳画的设置页链接（`pluginSettingsStyleLinks(contribution_id)`），工作台设置面板抓来的页面由 `scripts/client/settings-directory.ts` 的 `ensureStyleSheets` 先加载它的样式表。其余规则留在共用样式表：别的类的规则、名字只出现在 `:not()`/`:is()`/`:where()` 里的选择器、`stylesheetShared` 列出的类（宿主或共用库在框架之外也画的类）。没有客户端的插件（Feed、Goals 等，界面由外壳自己画）整张样式留在共用样式表，默认排在外壳各层之后；登记写 `stylesheetLayer: "beneath-shell"` 的（Goals，外壳的画布、密度、部件各层还要再改它的文档）排在外壳各层之前（PG-060，T-115）。插件设置页的规则（`settingsStylesheet`）同时进设置样式表和工作台样式表，设置页脚本（`settingsClient`）经登记聚合进入独立设置页、工作台脚本和项目设置整页；Coding 的四条私有设置规则随其已登记设置贡献的 section 内 `<style>` 携带，不进两张共用表。Characters 的项目页与全局项目入口也分别在自身 section 内携带所需静态样式，随抽取、缓存搬移与重开保留；它的事实仍归 Characters Module，页面归 Host；外壳画的插件页要用的工厂由登记的 `pageClients` 按名字给（`pluginPageClients`），工作台不 import 插件包。SDK 的 diff 视图（`mw-diff-*`）由 `packages/design-system/src/styles/diff-view.ts` 定义、随工作台样式表下发，Diff 插件没有自己的样式表。拆分在 `src/plugin-styles.ts` 里按名字做，不改任何一条规则适用的对象；`tests/plugin-styles.test.ts` 找出 `stylesheetShared` 必须列的类，以及哪个插件要在 `stylesheetUses` 里写上别人的样式表。设置样式表（`renderMolisWorkSettingsStylesheet()`）不带 Coding 的样式，Coding 的设置页使用自身贡献 section 携带的四条 `.coding-settings` 规则和它链接的 `coding.css`（PG-070，T-146 与 T393）。


引导、项目选择、Functions与MCP授权/连接页面共用`globalThis.molisWorkRequest`：Host请求保留code/status/callId/body，错误位置用同一failure view提供可查询的诊断编号。Functions的项目feed adapter仍以有没有project决定是否提供；未保存字段、选择序号、取消与旧DOM检查保留。原已授权但刷新失败的连接恢复入口继续只重载信息，不重新授权。定向验证：`tests/workbench-request-pages.e2e.test.ts`、`tests/workbench-functions-late.e2e.test.ts`、`tests/functions-draft-retention.test.ts`、`tests/context-onboarding-blank.e2e.test.ts`、`tests/request-failure-call-id.e2e.test.ts`。

同步设置的冲突比较按变化字段展示，较长内容可展开或导出完整版本；位置由同步绑定声明，前端拒绝跨源定位。常驻底栏入口区分同步中、上次检查完成、等待、冲突、失败及离线，并链接到同一设置详情。个人项目回收入口沿原请求保护，绑定观察版本及操作标识；失败重试不生成新操作，恢复不启动执行。

个人版首用试用界面保留云端回收与历史恢复；永久清理暂不开放，保留内容仍计入容量。

### 记忆管理的版本与部分清空

现有个人/项目记忆页按 [memory strategy §9.4 M2](../../specs/prologue-memory-strategy/spec.md) 发送实际所见的正式或候选版本。同一编辑决定失败后保留输入、版本及领域操作号，不自动刷新到新版本重做；HTTP 一次性键仍由统一请求助手每次生成。历史恢复分别携当前版本与目标历史版，撤销、导入、导出保持原入口。清空保留本页已确认的 fingerprint，部分完成显示逐项结果并允许显式重试；重新预览必须另行确认，不向旧范围加入新记忆。`tests/memory-settings-cas.e2e.test.ts` 用生产渲染/客户端/请求助手与真实 Chrome、HTTP 验证消费协议；SDK/授权与持久化由 MemoryService/LocalHost 集成测试证明。

失败的普通记忆命令保留在当前页面绑定的不可变快照里，包含原动作、完整请求、所见版本与操作号；多个失败分别显示“重试这次操作”。筛选、重新读取列表和其它操作成功都不丢失它们，重试成功只移除对应记录；改变内容、对象或动作形成新决定，不借重试读取最新版本。浏览器刷新或离页不承诺恢复，页面明确说明。该快照不授予权限，每次 HTTP 派发仍有新请求键，并重新经过 Host 当前授权。固定清空继续使用原独立预览。回归仍为上述 `tests/memory-settings-cas.e2e.test.ts`，覆盖重画、重读、多个失败、原版本重放、修改决定、请求键及实际响应诊断；不新增后台重试或持久恢复账。

账号入口使用 `src/browser/account.ts` 的 typed 浏览器程序，构建后并入既有页面脚本；入口页与工作台共用弹窗，凭据仅经 Host 窄入口，不写浏览器持久存储。`src/browser/account-management.ts` 提供资料与登录方式管理，`src/browser/account-verification.ts` 共用当前/新身份验证表单。WORK-03 至 WORK-05 的注册登录、第三方回跳和资料安全联调及复现方式见 [账号规范](../../specs/unified-account/spec.md)。

WORK-06 的个人/租户选择、定向邀请、角色管理、交接与平台租户操作经现有账号入口和同一动作目录接入，中央负责权限与版本；不切换本地 Home。专项验证：`MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/account-tenants.test.mjs`（临时 Home/D1、Chrome，外部服务 mock）。

WORK-07 的订阅、席位与平台变更专项联调：构建后以 `MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/account-billing.test.mjs` 运行（按机器 browser 时段包裹）。使用真实 Auth/Host、临时 Home/D1 和 Chrome，外部服务 mock。平台库存只读合同为 Auth 1.1.0，席位写操作仍由租户管理角色授权。

### 内容选择器的 owner 分页

冷启动内容选择器仍只投影 owner 的惰性 HTML 元数据。需要跨页完整枚举的 owner，在已授权页面上声明 `data-frame-assets-input`（字符串输入对象的 JSON）；每页在 `data-frame-assets-next-input` 声明下一页输入，末页省略。输入只经既有 Manifest 舞台参数合同，平台不识别具体插件或过滤值。每页读取前后校验同一个 producer/page 授权，重复输入拒绝；一位 owner 的任一页失败就不交付该 owner 的部分候选。对象解析可在找到精确引用后停止；拖拽仍必须先通过原句柄的投影范围检查，不以新页面放大旧句柄权限。FBR-05 的跨200条/归档候选、伪造与撤回拒绝由 `tests/workbench-frame-container.e2e.test.ts` 覆盖。
