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
| 渲染器的组合根（`createWorkbenchRenderer`） | 只把请求的语言与桌面端口交给各页面渲染器，再返回宿主用的渲染表。Goals 的渲染器见 [src/goals-renderers.ts](src/goals-renderers.ts)，Goal 文档与终端面板见 [src/goals-documents.ts](src/goals-documents.ts)，Feed、Inbox、Schedule 舞台见 [src/stage-renderers.ts](src/stage-renderers.ts)，日期、列表与链接前缀见 [src/renderer-helpers.ts](src/renderer-helpers.ts) |
| [src/home-plugin-page.ts](src/home-plugin-page.ts) | 无项目时的 Home 工作台；复用文档壳和 UI Host 生命周期，装配 Runtime 提供的内容片段 |
| [src/scripts/client/initialization.ts](src/scripts/client/initialization.ts) | 客户端初始化与恢复 |
| [src/browser-assets.ts](src/browser-assets.ts) | 浏览器资产入口 |
| [src/terminal/index.ts](src/terminal/index.ts) | Goal 终端：面板、xterm 画面与连接（`./terminal` 子路径），请求都走共同 UiRequest；面板路由在 Host 的 `apps/local-host/src/web-panel-routes.ts` |
| [src/write-checkers-section.ts](src/write-checkers-section.ts) | 项目设置「写后检查」的宿主标记：每句话都由宿主按页面语言写出（`data-say`、三个 `<template>` 带 `{槽}`、catalog 的表单对话框与删除用的警示对话框），页面程序不带任何中文 |
| [src/browser/write-checkers.ts](src/browser/write-checkers.ts) | 项目设置「写后检查」的页面程序：有类型的 TypeScript（`tsconfig.browser.json` 按 DOM 检查），构建时 esbuild 从 `write-checkers-factory.ts` 打成 `dist/write-checkers-client.js`（页面全局 `molisWorkWriteCheckers = (host) => {…}`），`src/scripts/write-checkers-client.ts` 读这份包；只有画这一段的两处（工作台脚本、项目设置页）带它，全局设置页不带，`project-settings.ts` 有它才绑定 |
| [src/assistant-text-html.ts](src/assistant-text-html.ts)、[src/assistant-text-parts.ts](src/assistant-text-parts.ts) | Assistant 正文、代码与审查的 Host HTML 投影；原始文字始终转义，浏览器只绑定阅读与决定操作 |

可对照现有调用方 [apps/local-host/src/workbench-renderer.ts](../local-host/src/workbench-renderer.ts) 阅读装配方式。

## 接入与边界

本包处理页面结构和交互装配，不打开数据库。宿主通过 `unavailable_plugin_stages` 提供不可用舞台的结构化显示数据，工作台转义后绘制静态占位；该分支不申请插件页面授权，正常 `plugin_stages` HTML 始终进入原 sandbox frame。目标状态解释、关系/规划等专属界面由 Goals Plugin 提供；通用主题和图标由 Design System 提供。

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

## 本地开发

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

## 界面文字：翻译检查，与一个文件怎样迁到稳定键

### 现在怎么工作

翻译调用支持主人稳定键（如 `L("images.compose.generate")`）与尚未迁移的中文键（如 `L("设置")`）。稳定词典由插件自己的 `src/messages.ts` 定义，在插件 Manifest 的 `ui.messages` 里声明（PG-071：Manifest 是纯数据，内置与第三方插件同一条路，平台只读已安装插件的 Manifest）；[`src/i18n.ts`](src/i18n.ts) 的插件词条表（[`src/plugin-messages.ts`](src/plugin-messages.ts)）在内置插件启动时、其他插件被 Host 启用时登记它们，按当前请求语言查找，浏览器收到当前页面语言的同一份词条，只含已登记插件的。中文键的英文：Workbench 自己的写在 `X_EN` 词典里，由 [`src/i18n/en.ts`](src/i18n/en.ts) 按顺序并成 `EN`；插件自己的 `X_EN` 写在插件包里，由它的 Manifest 的 `ui.translations` 声明（任何发布者的插件都可用，等它的文字换成稳定键就不再需要；过渡机制记在 `specs/repository-anti-corruption`）。`ui.translations` 只翻译声明它的插件自己的框架和贡献、不进全页目录（中文原文不属于任何人，同一句在宿主和别的插件里都出现）：框架里的脚本从 `MOLIS_WORK_PLUGIN_WORDS[plugin_id]` 取自己的词，贡献由 `UiHost` 的 `drawingAs`（`withPluginWords`）在画的那一刻套上；查词时先 `ui.messages`，再宿主 `EN`，最后该插件自己的 `ui.translations`。宿主（包括外壳画的 Goals、Feed 等）画一个插件交来的文字时，用该插件自己的词：画的那一处包上 `withPluginWords(插件 id, …)`（渲染器收到的 `L` 已是套着自己词的版本），页面脚本用 `LFor(插件 id)`（浏览器里的 `LF(插件 id, 键)`）；所以第三方插件的动作标题、删除项目时的数据说明也有英文，且只限它自己交的文字。宿主词典里只留宿主自己的、或几个插件共用的句子（[`src/i18n/shared-words-en.ts`](src/i18n/shared-words-en.ts)，并进 `EN`），不再有给某个内置插件开的词表；中文页直接显示中文原文。两种调用均在查词后替换参数。

检查是 [`scripts/gates/translations.mjs`](../../scripts/gates/translations.mjs)，接在 `pnpm health:check` 里，CI 的「Health gates」步骤用 `--base` 跑它。它扫整个源码树（`apps`、`plugins`、`packages`、`modules`、`horizontal`、`server`、`tooling` 下的 `.ts`，不含测试和构建产物），不用文件名单：

| 规则 | 怎样算 | 结果 |
| --- | --- | --- |
| 缺英文 | 翻译调用里的中文字面量，在所有词典里都没有 | 失败；头上必须为零 |
| 词典没接上 | 某本 `*_EN` 词典，[`src/i18n/en.ts`](src/i18n/en.ts) 建的 `EN` 从来没有引用它（直接，或经它引用的另一本词典：`GOALS_EN` 里的 `...GOALS_DIALOGS_EN`、`Object.assign(EN, X_EN)`）。只写了 import、只在别处 `export … from` 转发、只给它 `Object.assign` 填内容，都不算引用——英文照样显示不出来 | 失败；头上必须为零 |
| 冲突 | 同一句中文有两条译文不同的条目（跨词典，或同一词典的前后两块） | 冻结在 `tooling/gates/baseline.json` 的 `translationConflicts`（键 → 有几种译法）。新键、或老键多一种译法就失败；`--base` 时对照 merge-base 自己的扫描，改基线放不过。冲突少了，用 `--update --base origin/main` 降基线 |
| 无用键 | 词典里的键，源码里没有任何地方以字面量出现 | 只报告。动态拼出的键先改成常量或稳定键，再删（[路线图](../../specs/repository-anti-corruption/roadmap-2026-10-07.md) W5-03） |
| 稳定键 | 见下 | 一出现就检查 |

算翻译调用的有：`L(…)`、`x.L(…)`、`p.text(…)`、`translate(…)`、`this.t(…)`；类型写成 `(text: string, values?: Record<string, string | number>) => string` 的参数；同一文件里把参数转交给翻译调用的函数（如 `const t = v => p.escape(p.text(v))`；转交了几个参数就查几个，`relationGroup("上游", "这个 Goal 的归属与完成依赖", …)` 的两句都要有英文）；模板字符串里的浏览器脚本（按 JavaScript 解析；`String.raw` 的模板按原文解析，不先转义，否则 `'\n'` 会变成换行、`/^https?:\/\//` 会变成注释，后面的调用都读不到；本身不完整的片段按容错解析读）。`L(a ? "x" : "y")` 和 `L(表[键])`（同一文件里的常量表）按字面量读。一个浏览器程序常由几个文件拼成（Alchemist 的 `client.ts` 定义 `tx`、`button`，再拼上 `client-views.ts`（定义 `section`）、`client-flows.ts`（定义 `field`、`show`）、`work-reuse/client.ts` 的脚本，四个文件互相调用对方定义的包装函数），所以同一个插件里、靠相对 import 连起来的脚本文件共用彼此定义的包装函数，紧挨着它们的文件（import 它们或被它们 import）也带着这些包装函数读；没连起来的文件各用各的名字（`linkPrograms`；`tests/translation-check.test.ts` 的 `program` 用例）。**已知的限制（没有关上）**：包装函数按名字对上，不按作用域。一个浏览器程序里，别的文件定义的名字压过本文件自己定义的同名函数：`src/settings-memory.ts` 自己的 `button(text, variant, label)` 从不翻译，却按另一个文件的 `button(action, label)` 读，于是它的 13 处 `button("mw-btn--secondary")` 被记成翻译调用（这个文件单独扫一个也没有）。没有汉字的键所有规则都不看，所以现在没有影响；会出问题的只有一种：给这样的同名函数，在共用的那一个会翻译的参数位置上传一句中文——检查会要这句的英文，而这个函数其实不显示它。要关上它得按作用域解析名字（看一次调用实际落在哪个绑定上），那是解析器的活；真遇到了，改本地函数的名字。`L(变量)` 只计数；服务端文件里定义、别的文件 import 的包装函数不跟（2026-10-08 试过：跟进去只多 9 处调用、没有缺英文，却多出 90 个动态调用）。没有汉字的名字（Gmail）两种语言相同，不要英文；汉字占位符（`{标题}`）如果运行时就按汉字替换，英文条目原样保留它。

**另一类看不到的（#958 → #990）**：服务端固定 prompt 里的中文常量。它经模型往返后是运行时的动态字符串，页面用 `L(动态值)` 显示；门禁只按字面量认翻译调用，所以把它的英文条目从词典里删掉，「缺英文」仍是零。#958 删掉 Issue 的固定追问句（`plugins/native/issues/src/prompts.ts` 的 `ISSUE_ASK`）的英文后门禁放行，靠 `tests/issue-naming.test.ts` 的 `PRR-08` 断言拦下，英文条目已随 #990 恢复。补偿做法是把这类固定句子钉成测试：断言英文词典含该确切字符串（`PRR-08` 就是这么写的）；改这类句子时在同一个 PR 里改那条断言，不要只改词典。

看数字和细节：`node scripts/check-health-gates.mjs --report`；`node scripts/gates/translations.mjs --missing | --conflicts | --dead | --calls | --owners`。规则的变异测试在 [`tests/translation-check.test.ts`](../../tests/translation-check.test.ts)；[`tests/i18n.test.ts`](../../tests/i18n.test.ts)（要先构建，CI 不跑）另查扫描读到的键与 Host 实际提供的 `EN` 完全一致。「词典没接上」一条靠名字追引用，不需要构建，所以 CI 里就能拦；它认的根是 `translations.mjs` 里的 `SERVED_ROOT`，`EN` 以后换地方组装时要一起改（`tests/translation-check.test.ts` 钉住了根还在）。缺英文时检查会指出该加到哪个词典（Workbench 渲染器与宿主文件加到 [`src/i18n/renderer-gap-en.ts`](src/i18n/renderer-gap-en.ts)）。

### 目标：稳定键

用户 2026-10-08 定（`specs/repository-anti-corruption/spec.md` 决策表「界面翻译」一行，PR #312）：约 164 个源文件的中文键都换成稳定键，词典按主人分。检查已经认得下面的写法，所以文件可以一个一个迁，新旧并存期间两种键都照常检查。

- **键**：`<主人>.<区域>.<名称>`，小写，2～5 段，段内可用 `-` 和 `_`（`images.service.delete-confirm`）。主人是包目录名：`plugins/native/images` → `images`，`apps/workbench` → `workbench`；Workbench 另有共用词 `common.*`，任何主人都可以用。名称说意思，不抄措辞。键只写成字面量，不拼接；必须拼时用前缀加常量（`` L(`images.status.${state}`) ``），前缀 `images.status.` 让这一族键不算无用。
- **词典**：主人包里的 `src/messages.ts`，一个平铺对象，一键一条，中英文并排：

  ```ts
  export const IMAGES_MESSAGES = {
    "images.service.delete-confirm": { zh: "删除这个生图服务？已有生成记录会保留。", en: "Delete this image service? Existing generation records are kept." },
  } as const;
  ```

  检查按形状认：任何对象字面量里，键符合上面的写法、值带 `zh` 与 `en`，就是一条稳定键，不看变量名。规则：一个键只定义一次；键以定义它的主人开头；`zh`、`en` 都是非空字面量，用同一组 `{占位符}`；只有主人自己的文件能用它（`common.*` 例外）。
- **调用不变**：`L("images.service.delete-confirm")`、`p.text(…)`、浏览器脚本里的 `L('…')`，带占位符照旧 `L("…", { count })`。

### 一个文件怎样迁

迁整个插件（它的全部文件）比迁单个文件好：这样才能删掉它的旧词典。

1. `node scripts/gates/translations.mjs --calls | grep <文件>` 列出这个文件用的键；`--conflicts` 看其中哪些是冲突键。
2. 在主人的 `src/messages.ts` 为每个键建一条：`zh` 用旧的中文原文，`en` 用这个文件现在实际显示的英文（构建后看 `EN["…"]`）。冲突键按这个文件里的意思各取各的，每个意思一个键，冲突就这样消掉。
3. 把文件里的字面量换成键。
4. 旧词典里的条目，别的主人还在用这句中文时不删（`--owners` 的 usedByOthers 列和 `--calls` 能看到谁在用）；删多了会被「缺英文」拦住。已经没人用的和无用键一起删。
5. 跑 `node scripts/check-health-gates.mjs`（缺英文为零，没有新冲突），再跑 `node scripts/run-tests.mjs tests/i18n.test.ts tests/translation-check.test.ts` 和该插件自己的用例。冲突或无用键少了，在同一个 PR 里 `node scripts/check-health-gates.mjs --update --base origin/main`。
6. 一个插件里一部分文件用稳定键、一部分仍用中文键是允许的；检查两种都认。

**运行时登记**：在插件包里导出 `X_MESSAGES`，并在包 `src/manifest.ts` 的 `ui` 写 `messages: X_MESSAGES`，不往 `i18n/en.ts` 加插件词典的 import，也不在 `registration` 里写词典（`registration.messages` 已删）。键必须以插件自己的名字（`plugin_id` 的最后一段）开头，`common` 留给通用词；SDK 的 `messageDeclarationProblems` 在 Manifest 解析时检查形状、大小、占位符，Host 登记时再拒绝与别的插件重复的键。服务端 `L()` 按当前请求语言查表；`clientI18nScript()` 将当前语言的词条放进 `MOLIS_WORK_MESSAGES`，浏览器的 `L()` 使用这张表。未定义的文本保持原样；缺词由现有静态检查拦截。同一门禁要求稳定词典实际用在目录里某个插件的 Manifest 的 `ui.messages` 字段；只 import、只放进无关对象、使用别的字段都会失败，更新基线也不能放行。词典须为具名扁平对象，字段直接引用 import 的名字（支持别名）；和现有英文词典检查一样按导出名字识别，不解析模块路径。

**动作输出里的句子**：视图或拒绝理由里的句子（如 Diff 的 `view.message`、Files 动作的拒绝理由）同时是 Agent 读到的动作输出，不改成键；页面画它们时经翻译（`p.text(view.message)`、浏览器 `L(error.message)`），句子本身就是 Manifest `ui.translations` 里的键（中文原文 → 英文，写在插件包的 `src/en.ts`），随已登记的插件发到页面，不并进 `i18n/en.ts`；没有的照原样显示。这条路任何发布者的插件都能用，但只在它自己的贡献和框架里生效；宿主自己画的第三方文字（动作标题、句子形式的动作输出）要有英文，让视图给稳定键并在 `ui.messages` 里声明（已知限制）。Host 画插件页面时把当前请求语言的 `L` 作为 `text` 交给渲染函数，浏览器脚本从 `host.translate` 拿同一张表（visual-ui-experience 第三十五片）。

### 第一个样板：Images（`plugins/native/images`）

Images 首片迁移 `ui.ts` 的 46 处服务端调用与 `client.ts` 的 61 处浏览器调用，共 85 个稳定键，词典在 `plugins/native/images/src/messages.ts`。中文沿用原文；英文沿用迁移前实际 `EN` 结果，例如 `生成结果` 实际显示 `Results`。仍由其他主人或目录元数据使用的 16 个中文词条留在 Images 的 `en.ts`，其余旧条目已删除；这份小词典仍并入 `EN`，直到剩余消费者也迁移。

`tests/i18n.test.ts` 检查真实 Host 与浏览器脚本收到所有词条、异步请求语言隔离、参数替换及实际 UI 渲染；`tests/images-actions.e2e.test.ts` 在中英两种语言、1440/390 像素下验证空态、服务管理、撤权与生成结果，受控 provider 的调用次数和图片字节照旧。整体 W5-03 的其他主人仍待迁移。

## 开发要求

- 浏览器交互回归先等待生产界面的可操作状态，再取点：按 [VUX-22 自然高度折叠合同](../../specs/visual-ui-experience/spec.md#disclosure-segmented)，展开到容纳目标按钮后，才由现有点击助手滚动并验证命中（`tests/goals-planning.e2e.test.ts`、`tests/feed-capture.e2e.test.ts`）。保留原等待上限、严格点击与业务结果断言；超时或遮挡仍失败，不增加固定睡眠、不关闭动效、不改产品布局。Feed 的预览零入箱、规则保存与真实消费、停用提供方后保留绑定仍由原用例验收。
- 负责：工作台界面的组合根：导航、插件选择、设置页、Functions 编辑器、Goal 终端（`src/terminal/`），以及进入工作台之前的页面——项目选择页与简介、开场与 Welcome、新建项目引导、更新页（`src/arrival/`、`src/context-onboarding-renderer.ts`、`src/scripts/context-onboarding.ts`）。
- 不负责：业务 Store、Node 专用实现、Tauri 命令。
- 公开入口：`@molis-ai/molis-work-app-workbench`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：组合根：按 `package.json` 装配已登记的包，只做装配与 IO，不写业务规则。方向见[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节。
- 不变量：
  - 窄屏仍显示完整内容（`DESIGN.md` Layout、VUX-40）：放置完成卡的长项目名在卡内换行，移动与关闭按钮留在视口内；Home 日期条为「今天」与事件点统一预留底部空间，日期数字不与状态字相叠，各日期仍对齐。手机沿用现有 70px 高度，比原来的 64px 多出 6px 容纳三层字形及后备字体，列宽仍为 49px。不改文字与日期行为，不加截断与审计例外。回归 `tests/chinese-completion-layout.e2e.test.ts`、原 `tests/chinese-layers.e2e.test.ts` 与 `tests/placement-card-clearance.e2e.test.ts`。
  - Home 工具（目录项 `runtime.keys`，现在是 Issue 的 `Mod+Shift+I`）是开关：按钮或组合键打开它的侧栏视图并把键盘送进视图文档，从视图里再按一次收起。组合键在同源框架里（侧栏视图、嵌入窗格，以及本机 Host 发的讨论页）由 `homeToolKeysScript()` 转交给外壳；从视图里收起时键盘回到打开它的地方，打开前没有焦点就离开侧栏；带组合键的视图在页面空闲时预载，第一次按下就可用。视图可回报 `molis:side-status`（`busy` / `attention`），外壳在它的页签和按钮上标点，侧栏收起时也看得到。Home 插件侧栏始终只展示当前页。验证见 `tests/issue-global-navigation.e2e.test.ts`。
  - 侧栏脚本（`side-panel*.ts`）发出时去掉整行注释：说明留在源码里，不进页面资源。
  - 跨请求的页面操作固定点击时的对象：浏览器文件选择绑定 chooser 与网页，网站决定绑定原审查和显示的网站；文件预览绑定 source/kind/id 与本次打开。迟到结果不改后来打开的对象，设置与引用预览的失败也遵守同一约束。判断规则样例与草稿删除更新原记录，保留另一规则或同一规则的新编辑。标签恢复只收当前保存格式，保留当前组、分屏与设置页撤下规则。回归见 `tests/workbench-browser-targets.e2e.test.ts`、`tests/workbench-async-targets.e2e.test.ts`、`tests/workbench-functions-late.e2e.test.ts`、`tests/workbench-current-tabs.e2e.test.ts`。
  - 插件市场从 Host 重读项目成员；既有 `molis-work:plugins-changed` 使这份投影失效，过期读取不覆盖新事实。后台命令停止失败通过共同 UiRequest 显示拒绝、结果未知与可复制的诊断编号，不自动重试；真实命令状态及 Coding 的持久投影仍归它们的 owner。回归见 `tests/workbench-async-targets.e2e.test.ts`、`tests/workbench-stop-feedback.e2e.test.ts`；后者用公开 Runtime 端口控制隔离子进程，不调用模型。
  - 导航与区域从 Manifest 派生（`BUILTIN_PLUGIN_CATALOG`），不按插件名写分支。
  - 终端用 xterm 的命名空间导入并兼容 default 导出，两种打包形态都能加载；终端的请求走共同 UiRequest，不直接 `fetch`。改 `src/terminal/` 加跑 `node scripts/run-tests.mjs tests/work-terminal-client.test.ts tests/desktop-tui.test.ts`。
  - 目录条目可标 `developer: true`（Text Stats，平台的最小参考插件和测试依托）：只在 Host 开着开发者模式时进插件选择器和市场（`pluginMarketCards({ developerMode })`、`renderPluginRail`/`renderPluginMarket` 的 `developerMode`，由页面视图的 `developer_mode` 传入）；仍然登记、仍可安装，项目里已经添加的照常显示、可移除（W2-18 决定 5，2026-10-09）。开发者模式只是 Host 进程的启动开关（`MOLIS_WORK_DEVELOPER_MODE=1`），不是用户设置，设置里没有开关（用户 2026-10-09 已定，见 `apps/local-host/README.md`）。
  - 目录条目的浏览器脚本发出去时，`registration.workbench` 设 `clientServed: true` 即可去掉整行 `//` 注释、独占行的 `/* */` 注释和每行行首的缩进（页面资源预算只许减少；`/* */` 与代码共用一行的不动；脚本里有跨行字符串或模板时缩进是内容，不能用它）：作者在源码里保留注释和缩进，`tests/plugin-client-served.test.ts` 证明发出去的是同一段程序；用它的条目要进这个测试的名单。
  - 内置 build 只在各包 `src/registration.ts` 的 `registration` 绑定一次 Manifest、目录信息、Agent 正文与 UI/静态资源；`builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG` 由 `node scripts/generate-plugin-registry.mjs` 从它们生成，不手改（`pnpm health:check` 跑它的 `--check`），宿主加载时 `catalogProblems`（`apps/local-host/src/plugin-registry.ts`）自检重复的 id 与位置、悬空的 `companions` / `clientUses`。哪些插件是个人插件、常开、连带什么、项目显示哪些，都是宿主的事实：它写在页面视图的 `shown_plugins` 与 `plugin_directory` 各项的 `personal`、`always_on`、`companions` 上，外壳只读这些（W5-02 B1）；没有宿主画页面的测试用 `tests/fixtures/host-plugin-facts.ts` 拿同样的事实。其中仍走构建期装配的旧路径插件，名单冻结为 `tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED`、只许减少；新的内置插件只走 Plugin Runtime 装配，但仍在自己的 `registration` 登记一条（该测试要求每个 Runtime 装配的 id 都有目录条目），所以目录本身不是冻结名单；`plugin-catalog.ts` 和 `plugin-workbench.ts` 派生外壳的投影（导航、资源），不派生平台事实。资源 order 保持 CSS 与客户端初始化顺序，不改变 Manifest 的导航 order。公共动作发现与授权仍归 Kernel/Host。
  - 插件的 Agent 提示词、方法正文与模型指令随插件定义（`PluginDefinition` 的 `agent_prompts`、`agent_skills`、`methods`、`instructions`）走，不在 `registration` 上；Manifest 只写声明（PG-051）。
  - 界面文字走 i18n，新增中文文案同时补英文，缺英文、词典没并进 `EN` 由 `pnpm health:check` 拦下（CI 里也跑；做法与稳定键的迁移见上节「界面文字」）；控件只用 design-system，不引入系统弹窗或原生下拉。
  - `development: true` 只标明隔离预览，不能当作真实团队接通的证明。
  - 浏览器端程序由 `src/scripts/client/*` 字符串片段拼成，类型检查看不到里面：改动后跑 `tests/client-script-undeclared.test.ts`，它检查拼接结果里没有未声明的名称（页面全局在测试里列白名单）；进入工作台之前的三段程序（选择页、引导、动效）也在其中。
  - 助理的发送片段 `scripts/client/assistant-send.ts` 在点击时固定工作、作用域、执行者/方式、Character、页面上下文、材料、HTTP 路由与 request_id。等待草稿或回执时可以继续选择别的工作、项目和输入；回执只更新对应工作，仍属于当前输入时才清掉已发送材料和文字。连接中断后的同一条重试沿用原请求；发送期间的后续输入立即留在对应工作草稿，列表重读和发送回执保留它，回执后再提交。A→B→A 不恢复已发送文字，B 的编辑不算 A 的新草稿。真实 Host/HTTP/Store 与 Chrome 网络 barrier 回归见 `tests/assistant-send-intent.e2e.test.ts`（W2-18-SEND-01/02）。
  - 助理对话的滚动只有一个主人：设计系统的 `window.molisFollow`（VUX-26）。到底跟随、人往上滚就停，新内容不推走读者，「新消息」回到最新；明确发送也回到最新，跳到等人的卡之前先 `release()`。侧栏的 产出、变更、后台任务 是三个同样的折叠组，收起仍显示失败或进行中的数目，更新不擅自展开（VUX-08）。回归 `tests/assistant-scroll-follow.e2e.test.ts`、`tests/assistant-side-groups.e2e.test.ts`。
  - 助理侧栏的六组（工作环境、上下文、连接与工具、产出、变更、后台任务）在 `scripts/client/assistant-island.ts` 与 `assistant-side-context.ts`：上下文只读输入条与工作自己的轮次，工作环境与连接与工具读宿主的 `GET /api/assistant/works/<id>/surroundings`，只在工作、修订或状态变化时再问。改动跑 `node scripts/run-tests.mjs tests/assistant-side-groups.e2e.test.ts tests/client-script-undeclared.test.ts`。
  - 助理的用量框（`assistant-side-context.ts` 的用量工厂，VUX-11）分上下文窗口、本轮、账户额度与这项工作四处，数字只取运行时对这一轮的报告与轮次的 `model`：占比要已用与窗口都已知，没报的写「暂不可用」而不是 0，估算照口径标出。改动跑 `node scripts/run-tests.mjs tests/assistant-usage.e2e.test.ts`。
  - 助理操作卡按完整集合清理，逐张放到时间线时保留其他卡；刷新工作所得成功或失败只影响仍对应原工作 ID 的页面。回归 `tests/assistant-page-cards.e2e.test.ts` 验同一工作的两张页面卡、独立执行/忽略与重读；`tests/assistant-stale-refresh.e2e.test.ts` 验真实 owner 删除、迟到 404 与后选工作的草稿保持（W2-18-PAGE-CARDS-01、W2-18-ASSISTANT-404-01）。
  - 进入工作台之前的页面是一个框架（标题栏 · 舞台 · 常驻底栏，`arrival/shell.ts`）和一张样式表（`/assets/molis-work-arrival.css`，`styles/arrival.ts`）：页面之间是整页跳转，框架不动；控件与部件只用 design-system 的 `mw-*`，页面样式只排版，不另画一套。
  - 项目简介由 `composeProjectBrief` 从公开读口（Goals 目录与状态、Home 事项、长期背景）的结果决定，读不到的部分如实写「读不到」，不猜、不补示例数据；选择页不读任何项目的私有存储。
  - 模型设置页（`scripts/settings-models.ts`）在第一个能用的模型出现时通过绑定选项报告给设置外壳，`settings-directory.ts` 宣布 `molis-work:model-ready`，开始使用页（`scripts/context-onboarding.ts`）经同名 `BroadcastChannel` 收到；先关设置再宣布、窗格框架、跨标签与桌面壳的限制，机制只写在 `packages/contracts/src/platform/dom-events.ts` 的登记条目（主人是 `settings-directory`），这里不复述，监听者用 `node scripts/gates/dom-events.mjs --report` 查。回归：`tests/model-first-setup.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/model-ready-cross-tab.e2e.test.ts`（两个标签页），都在下面的「界面改动加跑」里。
- 改动后必跑：`node scripts/run-tests.mjs tests/style-has-scope.test.ts tests/plugin-declarative-mounting.test.ts tests/builtin-plugin-agent-texts.test.ts tests/builtin-manifests-contract.test.ts tests/builtin-plugin-composition.test.ts tests/workbench-ui-platform.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts tests/ui-request-client.test.ts tests/ui-request-client-pages.test.ts tests/settings-requests-through-helper.test.ts tests/web-service-settings-client.test.ts tests/assistant-island-script.test.ts tests/plugin-client-served.test.ts tests/plugin-list-developer-mode.test.ts tests/plugin-picker-pins.test.ts tests/settings-call-diagnostics.test.ts tests/capabilities-page.test.ts`
- 写后检查设置改动加跑：`node scripts/run-tests.mjs tests/write-checkers-settings-http.test.ts tests/write-checkers-settings.e2e.test.ts`。后者以真实 Chrome 与临时 Home 验证保存/重读、毫秒时限、删除确认及焦点、版本冲突/重读失败保留输入、撤权无写入与中英文响应式页面。
- 助理失败响应按共同错误体读取：`code` 在顶层，恢复工作与修复入口只从 `details.work` / `details.action` 取。保留原文草稿、同一 work、请求标识及结果未知时的恢复；改动这条路径跑 `node scripts/run-tests.mjs tests/assistant-island-script.test.ts tests/assistant-error-recovery.e2e.test.ts tests/assistant-page-written.e2e.test.ts`（后两份需要本机 Chrome）。
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workbench-tab-workspace.e2e.test.ts tests/call-id-lookup.e2e.test.ts tests/ui-request-client.e2e.test.ts tests/request-failure-call-id.e2e.test.ts tests/model-first-setup.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts tests/model-ready-cross-tab.e2e.test.ts tests/assistant-send-intent.e2e.test.ts tests/assistant-page-cards.e2e.test.ts tests/assistant-stale-refresh.e2e.test.ts`（后三个守住模型设置页、设置外壳的先关再宣布和各页面的重读，见不变量里的 `molis-work:model-ready`；其中 Jelly 一条守住「设置盖下面的页面不能开模态对话框」；`call-id-lookup` 守住「设置 › 诊断」按诊断编号查找、原地再查和复制完整编号；`request-failure-call-id` 守住失败的请求在查得到时显示诊断编号、点一下复制完整编号，查不到的失败不显示，写入断线时说不知道有没有完成）；改到分栏窗格与设置链接再加跑 `tests/cognia-embedded-settings.e2e.test.ts`（窗格里的设置链接只经窗格自己的一条转发到达外层，插件不另发消息）；改到进入工作台之前的页面再加跑 `tests/project-arrival-chooser.test.ts tests/project-brief.test.ts tests/project-arrival.e2e.test.ts tests/onboarding-journey.e2e.test.ts`（后两个检查每屏在各宽度、明暗下没有元素重叠、被裁、够不着）。
- 上述跨请求目标、成员刷新、标签恢复或停止反馈改动再加跑：`node scripts/run-tests.mjs tests/tab-workspace-ops.test.ts tests/workbench-current-tabs.e2e.test.ts tests/workbench-browser-targets.e2e.test.ts tests/workbench-async-targets.e2e.test.ts tests/workbench-functions-late.e2e.test.ts tests/workbench-stop-feedback.e2e.test.ts`。浏览器用例只用临时 Home 与本地站点，在原请求/响应上设 barrier，核对页面状态和原对象的 Host/Runtime 事实；须在共同请求助手装配完成后运行。
- 相关手册：[DESIGN.md](../../DESIGN.md)、[specs/craft-finish/spec.md](../../specs/craft-finish/spec.md)、[docs/platform/UI-PLATFORM.md](../../docs/platform/UI-PLATFORM.md)、[skills/molis-plugin-dev/ui.md](../../skills/molis-plugin-dev/ui.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

独立插件资源每项最多等待 10 秒，失败或挂起超时解除界面等待并提供原资源重试入口；重试不重派业务动作。Host 关闭释放等待中的资源与定时器，旧请求迟到不重复挂载；已打开界面和最近选择沿用原实例。

## 进一步阅读

- [职责与接入说明](../../docs/platform/UI-PLATFORM.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd4`, `goal-reorg-ap3`, `goal-reorg-gw4`, `goal-reorg-gw5`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

当前项目的目录关联与 Files/Git 浏览选择由项目设置的「工作目录」页统一维护，Workspace 不再作为导航插件。页面与嵌入工作台共用 `project-settings-pages.ts` / `scripts/project-settings.ts`；协议和设置归属见 [PROJECT-SETTINGS.md](../../docs/platform/PROJECT-SETTINGS.md)。

工作台从现有内置目录派生独立客户端资源，首次打开时装入惯有 surface DOM 并准备 `clientAssets` 后挂载。原 surface 根节点和已挂载实例持续保留；隐藏时使用原 UI Host 生命周期暂停读取。独立侧栏文档同样在执行工厂前加载插件声明的 `clientAssets`，不依赖主区先打开。Pages 编辑器由 Pages 的登记声明依赖。Coding 与伴随视图的装配在 Coding 包里（`plugins/native/coding/src/browser/workbench.ts`），工作台没有 Coding 专用脚本：Files、Git、Diff、Text Stats 各有自己的客户端包（`/assets/molis-work-plugins/<id>.js`）与样式（登记的 `stylesheet`），不借 Coding 的，打开一个伴随面只下载它自己的一份（`pluginSurfaceClients()` 是主区、侧栏文档和按需加载共用的一份名单）；Coding 的登记写 `clientUses: ["git", "files"]`，`plugin-workbench.ts` 把这两个包加进 Coding 的 `clientAssets`（挂载前先加载），并把这两个插件登记的客户端作为 `host.clients.git`、`host.clients.files`，以各自插件的身份，把宿主的评审动作作为 `host.reviews` 交给 Coding 的工厂（只是渲染钩子，不给决定权），两边写得不对应就在派生时抛错。失败保留内容并提供仅重载 UI 资源的按钮，不自动重试业务动作。分屏省略其他独立客户端 surface 的正文，通用 Goals/Feed/Inbox 与设置绑定保留；CSS 为保持现有全局层叠仍由 shell 按原顺序提供。回归见 `tests/workbench-deferred-clients.e2e.test.ts`、`tests/workbench-hidden-refresh.e2e.test.ts`。

插件样式（PG-070）：页面在框架里运行的插件（有客户端）把自己名字空间下的规则（`.<id>`、`.<id>-…`、`[data-<id>…]`，以及登记的 `stylesheetPrefixes`，类名早于 id 的插件用，如插件创作台的 `as-`/`pb-`）作为 `/assets/molis-work-plugins/<id>.css` 单独发，只由要用它的框架在工作台样式表之后链接（`FramePack.styles`，来自 `pluginSurfaceClients()` 的 `styles`）；有设置页的插件（Shelf）另外由外壳画的设置页链接（`pluginSettingsStyleLinks(contribution_id)`），工作台设置面板抓来的页面由 `scripts/client/settings-directory.ts` 的 `ensureStyleSheets` 先加载它的样式表。其余规则留在共用样式表：别的类的规则、名字只出现在 `:not()`/`:is()`/`:where()` 里的选择器、`stylesheetShared` 列出的类（宿主或共用库在框架之外也画的类）。没有客户端的插件（Feed 等，界面由外壳自己画）整张样式留在共用样式表；SDK 的 diff 视图（`mw-diff-*`）由 `packages/design-system/src/styles/diff-view.ts` 定义、随工作台样式表下发，Diff 插件没有自己的样式表。拆分在 `src/plugin-styles.ts` 里按名字做，不改任何一条规则适用的对象；`tests/plugin-styles.test.ts` 找出 `stylesheetShared` 必须列的类，以及哪个插件要在 `stylesheetUses` 里写上别人的样式表。


引导、项目选择、Functions与MCP授权/连接页面共用`globalThis.molisWorkRequest`：Host请求保留code/status/callId/body，错误位置用同一failure view提供可查询的诊断编号。Functions的项目feed adapter仍以有没有project决定是否提供；未保存字段、选择序号、取消与旧DOM检查保留。原已授权但刷新失败的连接恢复入口继续只重载信息，不重新授权。定向验证：`tests/workbench-request-pages.e2e.test.ts`、`tests/workbench-functions-late.e2e.test.ts`、`tests/functions-draft-retention.test.ts`、`tests/context-onboarding-blank.e2e.test.ts`、`tests/request-failure-call-id.e2e.test.ts`。
