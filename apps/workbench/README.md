# Web 产品界面与页面组合

工作台外壳：底栏、插件选择、按 Manifest 派生的导航、设置，以及进入工作台之前的页面，让每个插件的内容挂在同一个工作区里。

包名：`@molis-ai/molis-work-app-workbench`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Local Host 提供页面模型和操作端口；Workbench renderer 组合公共样式、导航与 Plugin UI，浏览器脚本处理选择、滚动恢复、刷新和请求。终端资产入口委托 Work Plugin 的 terminal-client。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui-composition.ts](src/ui-composition.ts) | UI 组合 |
| [src/goals-page-renderer.ts](src/goals-page-renderer.ts) | 工作台整页装配（文件名沿用旧称） |
| [src/scripts/client/initialization.ts](src/scripts/client/initialization.ts) | 客户端初始化与恢复 |
| [src/browser-assets.ts](src/browser-assets.ts) | 浏览器资产入口 |

可对照现有调用方 [apps/local-host/src/workbench-renderer.ts](../local-host/src/workbench-renderer.ts) 阅读装配方式。

## 接入与边界

本包处理页面结构和交互装配，不打开数据库。目标状态解释、关系/规划等专属界面由 Goals Plugin 提供；通用主题和图标由 Design System 提供。

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
node --import tsx --test --test-concurrency=1 tests/workbench-ui-platform.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 界面文字：翻译检查，与一个文件怎样迁到稳定键

### 现在怎么工作

中文原文是键：`L("设置")`、`p.text("加入 Inbox")`、浏览器脚本里的 `L('设置')`。英文写在各主人的词典里（`export const X_EN: Record<string, string>`，如 `plugins/native/images/src/en.ts`、`src/i18n/*.ts`）；[`src/i18n/en.ts`](src/i18n/en.ts) 把它们按顺序并成一张 `EN`，后写的覆盖先写的；服务端 `L()` 与浏览器端 `globalThis.L` 都只查这一张（[`src/i18n.ts`](src/i18n.ts)）。

检查是 [`scripts/gates/translations.mjs`](../../scripts/gates/translations.mjs)，接在 `pnpm health:check` 里，CI 的「Health gates」步骤用 `--base` 跑它。它扫整个源码树（`apps`、`plugins`、`packages`、`modules`、`horizontal`、`server`、`tooling` 下的 `.ts`，不含测试和构建产物），不用文件名单：

| 规则 | 怎样算 | 结果 |
| --- | --- | --- |
| 缺英文 | 翻译调用里的中文字面量，在所有词典里都没有 | 失败；头上必须为零 |
| 词典没接上 | 某本 `*_EN` 词典，[`src/i18n/en.ts`](src/i18n/en.ts) 建的 `EN` 从来没有引用它（直接，或经它引用的另一本词典：`GOALS_EN` 里的 `...GOALS_DIALOGS_EN`、`Object.assign(EN, X_EN)`）。只写了 import、只在别处 `export … from` 转发、只给它 `Object.assign` 填内容，都不算引用——英文照样显示不出来 | 失败；头上必须为零 |
| 冲突 | 同一句中文有两条译文不同的条目（跨词典，或同一词典的前后两块） | 冻结在 `tooling/gates/baseline.json` 的 `translationConflicts`（键 → 有几种译法）。新键、或老键多一种译法就失败；`--base` 时对照 merge-base 自己的扫描，改基线放不过。冲突少了，用 `--update --base origin/main` 降基线 |
| 无用键 | 词典里的键，源码里没有任何地方以字面量出现 | 只报告。动态拼出的键先改成常量或稳定键，再删（[路线图](../../specs/repository-anti-corruption/roadmap-2026-10-07.md) W5-03） |
| 稳定键 | 见下 | 一出现就检查 |

算翻译调用的有：`L(…)`、`x.L(…)`、`p.text(…)`、`translate(…)`、`this.t(…)`；类型写成 `(text: string, values?: Record<string, string | number>) => string` 的参数；同一文件里把参数转交给翻译调用的函数（如 `const t = v => p.escape(p.text(v))`；转交了几个参数就查几个，`relationGroup("上游", "这个 Goal 的归属与完成依赖", …)` 的两句都要有英文）；模板字符串里的浏览器脚本（按 JavaScript 解析；`String.raw` 的模板按原文解析，不先转义，否则 `'\n'` 会变成换行、`/^https?:\/\//` 会变成注释，后面的调用都读不到；本身不完整的片段按容错解析读）。`L(a ? "x" : "y")` 和 `L(表[键])`（同一文件里的常量表）按字面量读。一个浏览器程序常由几个文件拼成（Alchemist 的 `client.ts` 定义 `tx`、`button`，再拼上 `client-views.ts`（定义 `section`）、`client-flows.ts`（定义 `field`、`show`）、`work-reuse/client.ts` 的脚本，四个文件互相调用对方定义的包装函数），所以同一个插件里、靠相对 import 连起来的脚本文件共用彼此定义的包装函数，紧挨着它们的文件（import 它们或被它们 import）也带着这些包装函数读；没连起来的文件各用各的名字（`linkPrograms`；`tests/translation-check.test.ts` 的 `program` 用例）。**已知的限制（没有关上）**：包装函数按名字对上，不按作用域。一个浏览器程序里，别的文件定义的名字压过本文件自己定义的同名函数：`src/settings-memory.ts` 自己的 `button(text, variant, label)` 从不翻译，却按 `home-talk.ts` 的 `button(action, label)` 读，于是它的 13 处 `button("mw-btn--secondary")` 被记成翻译调用（这个文件单独扫一个也没有）。没有汉字的键所有规则都不看，所以现在没有影响；会出问题的只有一种：给这样的同名函数，在共用的那一个会翻译的参数位置上传一句中文——检查会要这句的英文，而这个函数其实不显示它。要关上它得按作用域解析名字（看一次调用实际落在哪个绑定上），那是解析器的活；真遇到了，改本地函数的名字。`L(变量)` 只计数；服务端文件里定义、别的文件 import 的包装函数不跟（2026-10-08 试过：跟进去只多 9 处调用、没有缺英文，却多出 90 个动态调用）。没有汉字的名字（Gmail）两种语言相同，不要英文；汉字占位符（`{标题}`）如果运行时就按汉字替换，英文条目原样保留它。

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

**还没有的**，第一个样板要一起做：运行时。`L()` 现在只查 `EN[中文]`，遇到稳定键会原样返回键；样板要让 `L()` 按当前语言查主人们的 messages 表，让浏览器端的 `clientI18nScript()`（今天中文页送 `{}`、英文页送整张 `EN`）也送稳定键表，并决定 messages 表怎么登记。登记不能再往 `i18n/en.ts` 加 `import`（它现在从 17 个插件包 import 词典，正是路线图第 5 波要拆的热点），应该走插件目录条目（`builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG`）或 Plugin Runtime。运行时落地后，再给检查加一条：每个 messages 表都被目录引用。

### 第一个样板：Images（`plugins/native/images`）

在 `node scripts/gates/translations.mjs --owners` 里（2026-10-08）选纠缠最少、又把两条路径都走到的插件：

| | Images | 为什么看这一列 |
| --- | --- | --- |
| 有翻译调用的文件 | 2 个：`ui.ts`（服务端 `p.text`，46 处）、`client.ts`（浏览器脚本里的 `L('…')`，60 处） | 服务端渲染和送到浏览器的目录两头都有，运行时两条路一次验完 |
| 动态调用 | 0 | 没有要先改成常量的键 |
| 自己词典里别的主人也用的键 | 11 / 89，多是「关闭」「正在保存…」这类通用词 | 这些旧条目要留到那些主人迁完；同列的 schedule 23、ppt 33、form 37、dataset 39、todo 64 |
| 借用别的主人词典里的键 | 3 | 迁的时候要给它们建自己的键 |
| 冲突键 | 2：`图片`（Workbench 译 Image，这里译 Images）、`生成结果`（这里是 Generation result，Shelf 译 Results） | 刚好能演示冲突怎么消：每个意思一个键；同列的 schedule 8、ppt 14、dataset 17 |
| 无用键 | 6，都是文案改过后留下的旧条目 | 迁的时候顺手删 |
| 其他 | `src/*.ts` 共 1,441 行（main 上 1,430，本次补英文加了 11）；main 上次改界面是 2026-10-02；在途的 `fix/project-deletion-owners` 动 `store.ts`、`service.ts`、`index.ts` 和 README（删项目时清数据），不碰 `ui.ts`、`client.ts`、`en.ts`；有 `tests/images-plugin.test.ts`、`tests/images-plugin.e2e.test.ts` | 改动小、有现成回归 |

没选的：Feed（一个文件 372 处调用，但 205 个键借自 Workbench 的词典）、Todo（328 处、64 个键别人也用）、Goals（39 个文件、1,069 处调用、444 个键借自别人的词典，另有 215 个无用键）、Workbench 自己（78 个文件，`common.*` 在这里定义，放最后）。样板之后按同一张表挑下一个：schedule、lingguang、ppt。

## 开发要求

- 负责：工作台界面的组合根：导航、插件选择、设置页、Functions 编辑器，以及进入工作台之前的页面——项目选择页与简介、开场与 Welcome、新建项目引导、更新页（`src/arrival/`、`src/context-onboarding-renderer.ts`、`src/scripts/context-onboarding.ts`）。
- 不负责：业务 Store、Node 专用实现、Tauri 命令。
- 公开入口：`@molis-ai/molis-work-app-workbench`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：组合根：按 `package.json` 装配已登记的包，只做装配与 IO，不写业务规则。方向见[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节。
- 不变量：
  - 导航与区域从 Manifest 派生（`BUILTIN_PLUGIN_CATALOG`），不按插件名写分支。
  - 内置 build 只在 `builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG` 绑定一次 Manifest、目录信息、Agent 正文与 UI/静态资源。其中仍走构建期装配的旧路径插件，名单冻结为 `tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED`、只许减少；新的内置插件只走 Plugin Runtime 装配，但仍在同一目录登记一条（该测试要求每个 Runtime 装配的 id 都有目录条目），所以目录本身不是冻结名单；`plugin-catalog.ts` 和 `plugin-workbench.ts` 派生相应投影。资源 order 保持 CSS 与客户端初始化顺序，不改变 Manifest 的导航 order。公共动作发现与授权仍归 Kernel/Host。
  - 插件的 Agent 提示词与方法正文随目录条目的 `agent` 声明，Manifest 只写声明。
  - 界面文字走 i18n，新增中文文案同时补英文，缺英文、词典没并进 `EN` 由 `pnpm health:check` 拦下（CI 里也跑；做法与稳定键的迁移见上节「界面文字」）；控件只用 design-system，不引入系统弹窗或原生下拉。
  - `development: true` 只标明隔离预览，不能当作真实团队接通的证明。
  - 浏览器端程序由 `src/scripts/client/*` 字符串片段拼成，类型检查看不到里面：改动后跑 `tests/client-script-undeclared.test.ts`，它检查拼接结果里没有未声明的名称（页面全局在测试里列白名单）；进入工作台之前的三段程序（选择页、引导、动效）也在其中。
  - 进入工作台之前的页面是一个框架（标题栏 · 舞台 · 常驻底栏，`arrival/shell.ts`）和一张样式表（`/assets/molis-work-arrival.css`，`styles/arrival.ts`）：页面之间是整页跳转，框架不动；控件与部件只用 design-system 的 `mw-*`，页面样式只排版，不另画一套。
  - 项目简介由 `composeProjectBrief` 从公开读口（Goals 目录与状态、Home 事项、长期背景）的结果决定，读不到的部分如实写「读不到」，不猜、不补示例数据；选择页不读任何项目的私有存储。
  - 模型设置页（`scripts/settings-models.ts`）在第一个能用的模型出现时通过绑定选项报告给设置外壳，`settings-directory.ts` 在 `document` 和每个 `iframe[data-pane-tab]` 窗格里宣布 `molis-work:model-ready`：显示「没有模型」的页面都重读（助理的失败卡片、Cognia、Dataset、Form、PPT、Workflows、Alchemist、Jelly 的模型对话框、插件创作台）；事件登记在 `packages/contracts/src/platform/dom-events.ts`（主人是 `settings-directory`）。本标签页里的页面把人带去设置的（链接或窗格的转发）才在这时关上设置并提示，而且是先关上、再宣布，页面在事件里看到的就是人眼前的样子（Jelly 只在自己在屏幕上时才重开模型对话框，否则模态对话框开在被藏起来的页面里，整页点不了）；按地址打开的设置页（新标签里的 `/settings/models`）不关；开始使用页的「连接文字模型」就是这样的新标签，所以同一个脚本还在同源的 `BroadcastChannel('molis-work:model-ready')` 上通知其他标签页（也包括还没有项目时不带工作台的独立设置页，那里没有 `settings-directory.ts`），`scripts/context-onboarding.ts` 听到后重读 `/api/onboarding/context`、重画「已连接」。通道不是 DOM 事件，登记表不收，记在事件的说明里；桌面壳若把新标签交给系统浏览器，通道到不了。回归：`tests/model-first-setup.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/model-ready-cross-tab.e2e.test.ts`（两个标签页）。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-declarative-mounting.test.ts tests/builtin-plugin-agent-texts.test.ts tests/builtin-manifests-contract.test.ts tests/builtin-plugin-composition.test.ts tests/workbench-ui-platform.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts tests/assistant-island-script.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workbench-tab-workspace.e2e.test.ts`；改到分栏窗格与设置链接再加跑 `tests/cognia-embedded-settings.e2e.test.ts`（窗格里的设置链接只经窗格自己的一条转发到达外层，插件不另发消息）；改到进入工作台之前的页面再加跑 `tests/project-arrival-chooser.test.ts tests/project-brief.test.ts tests/project-arrival.e2e.test.ts tests/onboarding-journey.e2e.test.ts`（后两个检查每屏在各宽度、明暗下没有元素重叠、被裁、够不着）。
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

工作台从现有内置目录派生独立客户端资源，首次打开时装入惯有 surface DOM 并准备 `clientAssets` 后挂载。原 surface 根节点和已挂载实例持续保留；隐藏时使用原 UI Host 生命周期暂停读取。Pages 编辑器由 Pages 的登记声明依赖，Coding 与伴随视图的原装配由相同目录登记。失败保留内容并提供仅重载 UI 资源的按钮，不自动重试业务动作。分屏省略其他独立客户端 surface 的正文，通用 Goals/Feed/Inbox 与设置绑定保留；CSS 为保持现有全局层叠仍由 shell 按原顺序提供。回归见 `tests/workbench-deferred-clients.e2e.test.ts`、`tests/workbench-hidden-refresh.e2e.test.ts`。
