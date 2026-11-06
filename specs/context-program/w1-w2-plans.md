# 情境方案 W1、W2 计划与实施记录

原 §17–19。保留浮条、Pages 迁移的分工、切片决定和切换条件。

[返回需求书](spec.md)

- [17. 接续入口（2026-10-12）](#17-接续入口2026-10-12)
- [18. W1 实施计划（2026-10-12 规划，基于 origin/main `a091fb67`）](#18-w1-实施计划2026-10-12-规划基于-originmain-a091fb67)
- [19. W2 实施计划：外壳换成浮条 + Pages 迁移（2026-10-12 规划，基于 origin/main `3b1d5076`）](#19-w2-实施计划外壳换成浮条--pages-迁移2026-10-12-规划基于-originmain-3b1d5076)

## 17. 接续入口（2026-10-12）

已被开头的「交接（2026-10-20）」取代（之前是第 20 节）。2026-10-12 之前的交接（W0 完成、W1 尚未开工的状态）只留在 git 历史里。

## 18. W1 实施计划（2026-10-12 规划，基于 origin/main `a091fb67`）

W1 做第 9 节「W1 共享件」：浮条组件与定位上移、新合同、候选派生与准备、起草服务、SDK 页面端、目录检查与覆盖率门禁骨架、第一份 `contextual.md`。下面按现行代码与门禁核对后排成 9 片；数字都是 `a091fb67` 上量的（门禁行数 = `wc -l` + 1）。

### 18.1 分支与合并的规矩

- 每片从最新 `origin/main` 开新工作树和分支（`feat/context-w1-<主题>`），一个主题一个 PR，体量目标 ≤50 个文件（PARALLEL-DEVELOPMENT §4）。`feature/handoff-contextual-actions` 只放原型与需求书，不进产品代码。
- 新分支可以推送；开 PR 前先告诉统筹，由统筹问用户。合入 main 不在本线授权内。
- 每片必跑：`pnpm build`（持 build 锁）、`node scripts/affected-tests.mjs` 选出的用例、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`；改了页面资源加 `node scripts/gates/page-assets.mjs --base origin/main`；改了公开合同加 `pnpm api:update`；改了动作声明加 `pnpm actions:update`；推前 `pnpm secrets:check`。浏览器用例持 browser 锁。
- W1 动共享核心（contracts、kernel、plugin-sdk、workbench 外壳），按 PARALLEL-DEVELOPMENT §6 要全量：W1 各片合入前，在一条集成分支上合起来跑一次全量，对照干净基线工作树。

### 18.2 现行门禁对本波的硬约束

| 门禁 | 现状（`a091fb67`） | 对 W1 的约束 |
| --- | --- | --- |
| 页面资源字节（`page-assets.mjs`） | 两个方向都不容差：变大拒绝，变小也要在同一个 PR 用 `--update --base origin/main` 降到实测值。`workbench.js` 1,396,432；`workbench.css` 1,913,706；`pages-editor.js` 1,051,027（正好压线）；`craft-finish.ts` 同时进 `workbench.css`、`arrival.css`、`settings.css` 三份 | W1 不往任何已发的资源里加字节。浮条原件在 W1 只上组件板（样式与脚本是单独导出的字符串，只在组件板页内联）；接进工作台资源放在 W2，和删除底部动作条、Pages「AI」按钮与写作菜单同一个 PR，每份资源净减 |
| 巨大单元 | `editor-browser.ts` 4043（`mount` 1024 等）、`craft-finish.ts` 2306、`assistant-island.ts` 2804、`tab-workspace.ts` 2049、`primitives/catalog.ts` 947（登记例外，不许长）、`styles/primitives.ts` 1276（登记例外） | 这些文件只删不增；新东西写新文件。组件板用互动线 P2 新加的扩展点（`catalog-examples.ts`），不往 `catalog.ts` 加行 |
| DOM 事件登记（`dom-events.mjs`，无基线） | 登记了没人发或没人听就失败；未登记的发或听也失败；所有者文件名单（`context-actions` → `context-actions.ts`）必须是被跟踪的文件 | 每个新事件在第一对收发方同时出现的那个 PR 里登记。落点类事件（`molis:surface-landing`、`molis:landing-at`）的第一位发送者是 Pages（W3），所以它们随 W3 登记，不在 W1 |
| 合同包纯度 | 合同包里不许有副作用、模块级可变状态和 20 行以上的函数（现 13 处，只许减少） | 新合同只放类型与常量；清洗、派生、上限检查放 kernel/contextual 或插件 SDK |
| kernel/contextual 纯度（K1–K5） | 只许 `node:crypto` 与两份合同；无定时器、时钟、模块级可变状态、能力 id 字面量 | 派生逻辑不写任何具体能力 id |
| 公开 API 快照 | contracts 每个子路径一份，SDK 只有 `plugin-sdk/index.txt` 一份 | 新字段改 `services/contextual.txt`、`platform/actions.txt`、`platform/ui.txt`、`plugin-sdk/index.txt`；新子路径要在同一 PR 有使用方（占位子路径门禁） |
| 动作合同快照 | 动作元数据里的新字段会改用到它的每个动作的 `traits` 哈希 | W1 只加字段、不让任何插件声明，快照不变；W3、W4 让插件声明时同 PR `pnpm actions:update` |
| 声明检查（插件 SDK，W3-03 B2 已合入） | `inspectActionDeclarations` 在 `packages/plugin-sdk/src/action-declarations.ts`，报错文字与先后顺序由 `tests/plugin-declaration-rules.test.ts` 钉住 | 新检查只往末尾追加，并在同一 PR 扩写那份字面量 |

### 18.3 切片与 PR 序列

| 片 | 主题 | 范围 | 验收编号 | 动到的门禁 | 前置 | 枢纽文件 |
| --- | --- | --- | --- | --- | --- | --- |
| W1-1 | 情境中枢拆文件（纯重构） | `context-actions.ts`（635 行、一段模板字符串）拆成 `context-bar.ts`（行的绘制与它自己的指针、焦点、键盘监听）、`context-bus.ts`（收焦点、窗格转发、请求 / 判断 / 信号、选择与交付、起步建议）与留在原处的工厂（共用的小函数、DOM 选区、窗格转发、拼装）；三份拼成的脚本与原脚本逐字节相同（比对脚本验证，41,737 字符），所以页面资源字节不变；`dom-events.ts` 里 `context-actions` 所有者改列三个文件；行为、事件、文案不变 | W1-01：拆分前后情境条行为一致（`contextual-interaction.e2e`、`pages-surface-naming`、`assistant-island-script` 同过）；`workbench.js` 字节不增 | 页面资源（只许相等或更小）、DOM 事件所有者、API 快照 `platform/dom-events.txt` | 无 | `initialization.ts`、`dom-events.ts` |
| W1-2 | 浮层定位上移到设计系统（纯重构） | 新 `packages/design-system/src/floating.ts`：`placeFloating`、`scrollShouldFollow`、`pinAt`（含「窗格成了 fixed 参照盒」的校正）、`placeOverlay`（舞台改为参数）、`followScroll`；Pages 改为引用，`rowGapAt`、`scrollChildIntoView` 留在 Pages | W1-02：Pages 浮层位置不变（`pages-actions.e2e`、`pages-drag-target`、`pages-plugin` 同过）；`pages-editor.js` 字节不增；`editor-browser.ts` 变短 | 页面资源、巨大单元（只减）、设计系统 README 必跑 | 互动线 P2 先合（同改设计系统 `index.ts`、README） | 设计系统 `index.ts`、README |
| W1-3 | 情境合同：位置、落点、工具类型 | `services/contextual.ts` 只加类型与常量：`SurfaceFocus.place`、`side_tab`、页内锚点 `screen`（只含矩形，不含元素；永远不进宿主请求、不跨文档）；`SurfaceLanding`（位置 `cursor`/`selection`/`end`/`object`；位置类落点带一个空文字、`anchor` 与 `head` 相同的部分，选区带被替换的文字；`version` 对外不透明，只有主人比对）；`FrozenFocus.landing`；`ContextualJudgeRequest.landing`；`ContextTools` 三层类型、`ContextToolInvoke` 与上限常量 `CONTEXT_TOOL_LIMITS`。不加任何事件名常量（事件随第一对收发方登记）；面板槽的 detail 含 DOM 元素，类型放进 W1-9 的 SDK 页面端。宿主读请求的代码从 `contextual-http.ts` 搬进新文件 `contextual-request.ts`，收 `place`、`side_tab`、`landing` 并设上限（落点位置类必须带编辑器位置；越界与多余字段被拒绝或丢弃）；判断材料加「手上的东西在」「落点」几行（折成一行、有长度上限、过 `screenModelMaterial`），判断缓存键带上落点。工具的清洗与上限用例随 W1-6 | W1-03：落点与右栏的格被读成有界、封闭的声明；落点变了判断重问；页面写的字折成单行、不能冒充一行新指令；S-13 登记行加引用 | API 快照 `services/contextual.txt`、合同纯度（只有类型与常量）、K1–K5、安全不变量 S-13（登记表与用例） | 无 | `services/contextual.ts`、`contextual-http.ts`、`SECURITY-INVARIANTS.md` |
| W1-4 | 目录声明：创建入口、追加与放进、范围 | 在被指向的写入动作的元数据上声明 `intake`（名称、动词、说明、示例、`item_kind`、`material_field`、`prepare`、`effect`、`multiple`）与 `attach`（同上加 `positions`、`find`）；撤销沿用该动作已有的 `undo`；`places` 加到选区、对象可选动作与 `intake`；`ui.views` 的 side 视图加 `objects`。类型在新文件 `platform/item-intake.ts`，经 `platform/actions` 转出（不开新子路径）。插件 SDK 加检查：`attach` 只能指向本提供方的对象种类；带 `cursor`/`selection` 位置的写入动作必须是 command、带版本条件、不是不可撤回的（side-shelf 4.3 第 3 条）；选项键唯一；side 视图写的每个种类都有读取器 | AC-S10、AC-S14（检查部分）、Q01（声明部分）、W1-04：违规声明在登记时被拒，报错文字逐条钉在 `plugin-declaration-rules` | API 快照 `platform/actions.txt`、`platform/ui.txt`、`plugin-sdk/index.txt`；声明规则字面量（只追加）；动作快照不变 | W1-3；与防腐线 W3-05-1（同改 SDK 声明检查）排先后 | `platform/actions.ts`、`platform/ui.ts`、`plugin-sdk/src/action-declarations.ts` |
| W1-5 | 候选派生、预筛与准备核对 | kernel：`intake.`、`attach.` 候选（键 `intake.<提供方>.<能力>`、`attach.<提供方>.<能力>`），`places` 收窄，落点决定 `attach` 位置候选；规则预筛：总数 ≤12、去处类 ≤8；陈列规则：去处类只进推荐位，不进「更多」与「全部操作」。宿主：`/api/contextual/prepare` 认新键；准备时冻结落点版本，执行前核对，版本不符在任何写入前拒绝；仅本人可见来源的正文不进判断 | AC-P01（同一份候选的逻辑部分）、AC-P04、AC-S06、AC-S09、Q06（隐私部分）、W1-05 | K1–K5、`contextual-interaction`、`contextual-dock-parity`、`contextual-fragment-offers`；动作服务类不增行 | W1-3、W1-4 | `contextual-http.ts`、kernel `contextual.ts`（超 400 行就拆成 `contextual/*.ts`） |
| W1-6 | 浮条原件与面板槽（只上组件板） | 设计系统新文件（含工具的清洗函数与上限用例 T08，按 `CONTEXT_TOOL_LIMITS`；`molis:context-tools`、`molis:context-tool-invoke`、`molis:context-panel-open` 三个事件在这里登记，收发两端都在组件板标本里）：浮条的页面脚本字符串（建条、折叠成「格式 ▾」、窄时 2 个动作、⌘. / ←→ / Esc、`mousedown` 不抢焦点、面板槽同层同位）与样式字符串 `CONTEXT_TOOLBAR_STYLES`；组件板一节（浅深、窄、触屏 44px、减少动画）；`DESIGN.md` 加「Context toolbar」一小节。不接进工作台资源 | T01、T05、T06 在组件板上的部分；W1-06：组件板标本齐、键盘路径与 44px 由用例量 | `primitives.test.ts`（组件板 id）、触屏尺寸用例；页面资源不变 | W1-2；互动线 P2 的组件板扩展点已合入 | `DESIGN.md`、设计系统 `index.ts`、`catalog-examples.ts` |
| W1-7 | 起草服务 | 宿主新目录 `apps/local-host/src/drafting/`：按目的地动作的输入 schema 起草，一次 `hostTextGeneration`（`structured`），不开 Agent 轮次、不带工具、不写记录；材料先 `redactText`、`screenInbound`，按 S-13 写成带不可信声明的数据；有 `prepare` 先确定地算；无模型或失败退回规则，保留用户原话；路由 `POST /api/contextual/draft`（按 2026-10-10 决定只给工作台；助理要用时改成只读系统动作） | Q02、Q03、Q05 的服务部分；W1-07：起草不写任何记录、失败不丢原话、像指令的材料被当数据 | 安全不变量（提示注入行加入口）、`affected-tests` 选出的路由用例 | W1-4 | `web-request.ts`（挂路由一行）、`docs/system/SECURITY-INVARIANTS.md` |
| W1-8 | 覆盖率门禁骨架与第一份 `contextual.md` | 新 `tests/plugin-context-coverage.test.ts`：按内置目录算出「对象声明 / 创建入口 / 选区动作」覆盖表，「待补」（带波次）与「不适用」（带理由）两份冻结名单与算出的集合双向相等，只许减少；进 `tests/ci-product-subset.txt`。`skills/molis-plugin-dev/contextual.md` 第一部分：现行的对象声明、选区动作、`molis:surface-focus`、页面接动作，加 W1-4 的声明写法；SKILL.md 加一行；`docs/platform/PLUGIN-DEVELOPMENT.md` 加一节；`AGENTS.md` 加一条硬约束 | C13、W1-08：新插件不能进名单；名单删一行就要真的补上 | 文档引用门禁（反引号路径须存在）、产品子集清单规则 | W1-4 | `AGENTS.md`、`SKILL.md`、`PLUGIN-DEVELOPMENT.md`、`ci-product-subset.txt` |
| W1-9 | 插件 SDK 页面端 `contextual` | SDK 新子路径（页面端，只依赖合同）：报告手上的东西与落点、发布工具、开面板槽、接收选择；内部转发跨 iframe 的同源消息，插件不手写 `postMessage` | AC-S14（页面端部分）、W1-09 | API 快照（SDK 多一个子路径）、`public-sdk-private-dependency`、`plugin-sample.e2e` | W1-3；**统筹确认**：SDK 快照工具要支持子路径（改 `scripts/gates/api-snapshot.mjs`，属于门禁脚本） | `packages/plugin-sdk/package.json`、`scripts/gates/api-snapshot.mjs` |

排序：W1-1、W1-3 可以先开；W1-2 等互动线 P2；W1-4 等 W1-3 并与防腐线 W3-05-1 排先后；W1-5 等 W1-3、W1-4；W1-6 等 W1-2；W1-7、W1-8 等 W1-4；W1-9 等统筹答复。一次只有一个 writer，按上面的依赖串行，前一片推送、开 PR 后再开下一片。

### 18.4 从 W1 挪出去的两件（理由与取舍）

- **情境中枢接右栏、助理与落点的 DOM 线**（第 9 节原写在 W1）：挪到 W3 第一片，和 Pages 报告落点、右栏格转发焦点同一个 PR。原因：DOM 事件门禁要求登记时收发两端都在，W1 里只有接收方。W1 只做数据形状（W1-3）与派生（W1-5）。代价：W3 第一片变大一些，由它自己再拆。
- **内容站幂等键泛化为请求号**（quick-create Q1）：挪到 W4 开头，已由 W4-6a 做完（`receive@2`，保存的工作流按版本固定，旧版本报不可用；quick-create §11）。只有 W4 的「由内容站派生创建入口」用它；它要改 8 个插件的 `receive`、收件 schema、`workflowDeliveryKey` 和 Workflows 的调用方，形状变了要升这 8 个动作的版本。动手前先查存量工作流定义是否固定了 `receive` 的版本：若固定，开发用 Home 重建即可，真实 Home 要维护就先经统筹问用户。

### 18.5 与其他线会撞的地方

| 线 | 撞在哪 | 怎么排 |
| --- | --- | --- |
| 互动线（P2：共享 AI 交互组件进设计系统与组件板） | 设计系统 `index.ts`、`primitives/catalog.ts`（它把组件板的一节改成 `renderCatalogExamples(section)`，新文件 `catalog-examples.ts`）、README 的文件表与必跑用例；`specs/README.md`。以后（W3）还有输入框上方给情境条留的槽、同排推荐的位置（`assistant-island.ts`、`assistant-dock.ts`） | 它的 P2 先合；W1-2、W1-6 在它之后从 main 开，用它的扩展点，不另造。W3 动输入区 DOM 前，按 15.6 的约定先把结构发给它 |
| 采用线（Prologue 完整采用） | `services/agent-host.ts` 与快照、`horizontal/agent-host` 适配器、`capability-registration.ts`、`baseline.json`、`page-assets.json`；它的 P1 起会动助理服务、HTTP 与授权（TaskBoard） | W1 不动这些文件。起草服务与 Jev 判断都用现有的 `hostTextGeneration`（采用线明确保留这条路，§4.5），不依赖未发布的 SDK。W3 把情境推荐改成只读系统动作、助理出卡片时，会碰助理服务，届时与它的 P1 排先后 |
| 输入回执线 | 新子路径 `services/agent-inputs`（`AgentInputView` 只记文字、来源、方式，不带附带的情境与材料）；助理是第二个试点 | 情境条带上的「手上 + 落点」走现有的 `AssistantSendInput.context` 与 `materials`，回执只记用户的话。这是跨线约定，已发统筹 |
| 防腐线（第 3 波 B、C 批） | W3-05-1 往插件 SDK 声明检查加交叉引用检查，并扩写 `plugin-declaration-rules` 的字面量；W3-02 要求新错误码一律以主人名开头；`ActionService` 冻结不许长；`fix/typesafe-consumer-narrow` 改 `contextual-http.ts` | W1-4 与 W3-05-1 排先后（谁先合，后者重跑字面量与快照）；本线新码用 `contextual.`、`drafting.` 开头；不动 `ActionService`；W1-3、W1-5 开工前先看 `contextual-http.ts` 有没有在途改动 |
| 枢纽文件（PARALLEL-DEVELOPMENT §2） | `initialization.ts`、`dom-events.ts`、`platform/actions.ts`、`DESIGN.md`、`AGENTS.md`、`SKILL.md`、`ci-product-subset.txt`、`baseline.json`、`tooling/gates/api/` | 只加自己的几行；冲突时两边都留；`baseline.json` 与快照合入 main 后重跑生成，不手工合 |

### 18.6 本线自己定下的取舍（记入 §14）

- 页内锚点叫 `SurfaceFocus.screen`，不叫 `anchor`：`SurfaceFocusTarget.anchor` 已经是编辑器位置，同名会混；元素引用不进可序列化的合同，浮条画在拥有它的文档里，锚点从不跨文档。
- `intake`、`attach` 写在被指向的写入动作的元数据上，不另起一份带 `action`、`undo` 的清单：一个能力登记一次，撤销只有动作已有的 `undo` 一处；代价是一个动作只能有一个创建入口，要两个就声明两个动作。
- 浮条按钮按 DESIGN 的下限：桌面 32px、紧凑 28px、触屏 44px（context-toolbar §4 写的 28px 被取代）；浮条本身用 `--lift-2`，它的「更多」菜单与面板槽用 `--lift-3`，让后者明显浮在前者之上。
- DOM 事件随第一对收发方登记；浮条原件在 W1 只上组件板，W2 接入时同一份资源净减。

### 18.7 实施记录与对计划的修正（2026-10-12）

W1-1、W1-3、W1-4、W1-5、W1-7 和 W1-8 的第一部分已在各自分支写完并提交（栈：`feat/context-w1-contracts` → `…-declarations` → `…-derivation` → `…-drafting` / `…-manual`；`feat/context-w1-split-context-actions` 独立）。静默期（采用线全量回归）里只写了代码；构建、测试、推送与开 PR 在静默解除后依次做，PR 链接与证据另报统筹。以下是写代码时对 §18.3 的修正，计划行保留原文以便对照：

| 片 | 计划写的 | 实际 | 原因 |
| --- | --- | --- | --- |
| W1-3 | 合同里留工具类型与事件 | 位置、落点、工具类型、草稿类型进 `services/contextual`；**不加事件常量** | 事件随第一对收发方登记（统筹确认）；常量没人用就是占位 |
| W1-4 | `prepare` 指向「某个动作」；attach 带 `find` | `prepare` 必须是**同一提供方的选区动作查询**（`defineFragmentOffersAction`），其中与 `intake_id` 同名的选项就是确定地算出输入的那一份；`find` 不做，随 W3 的 Pages 落点一起上 | 今天的「记成待办」「记下灵光」选项就是现成的 `prepare`，不用再写一份；落点查找没有消费者 |
| W1-5 | 总数 ≤12、去处 ≤8；`/prepare` 认新键；准备时冻结落点版本 | 判断候选上限仍是 16，去处 ≤8（12 等评估后再改）；`/prepare` 对去处答 `contextual.not_drafted`，去处走 `/draft`；落点版本冻结与执行前核对随 W3 的 `attach` | 12 的取舍没有评估支撑；`attach` 的写入由 W3 接 |
| W1-7 | 起草 `intake` 与 `attach` | 只起草 `intake`（含 `prepare` 先算、一句话、补一句）；`/api/contextual/draft` 有两种形态（`key`+焦点，或 `action`+`intake_id`+一句话）；`attach` 返回 `contextual.not_drafted` | `attach` 的输入里哪个字段放文档号、位置，声明里还没有字段映射，要先在 W3 给 `attach` 加这项声明；不在 W1 猜 |
| W1-7 | 指令登记 | `contextual.draft` 登记在 `system:contextual`（设置 › 提示词），带历史行；S-13 的行加上起草这条通道；新测试进 `test:security`（S-13 的 CI 列要求被 CI 跑） | 提示词登记检查与安全不变量门禁的现行规则 |
| W1-9 | SDK 页面端子路径，需统筹确认快照工具支持子路径 | **挪到 W2/W3**（页面端辅助随第一个收发方一起上）；快照工具对 SDK 的 `exports` 是通用的，**不需要门禁 PR** | 没有页面端消费者就不该先有 API；更正之前说「工具要支持子路径」的说法 |
| W1-8 | 一次上覆盖门禁骨架与 `contextual.md` | 第一部分（`contextual.md`、SKILL.md 一行、`PLUGIN-DEVELOPMENT.md` 一节）已写；覆盖门禁骨架、产品子集条目与 `AGENTS.md` 一条硬约束等插件开始声明 `intake` 后（W3）再上，否则两份冻结名单一开始就是满的 | 先有声明才有可计的覆盖 |

W1-2、W1-6 等互动线 P2（#423）合入后从 main 开。

## 19. W2 实施计划：外壳换成浮条 + Pages 迁移（2026-10-12 规划，基于 origin/main `3b1d5076`）

W2 就是 context-toolbar 的 S2+S3：底部动作条换成贴着手上东西的浮条，Pages 的格式条、「AI」写作菜单和弹窗同时迁到浮条上，**同一个 PR、分提交**（context-toolbar §7「不留两套」）。右栏改版（W2'，side-shelf P1）另起计划，排在 W2 之后。本节先写已核对的现状，再写决定、切片、门禁账和测试；W1 的规矩（§18.1）不变。

### 19.1 前提

- W1-2（浮层定位上移）、W1-6（浮条原件，只上组件板）已合入；它们等互动线 #423。
- #430（W1-3 合同）已合入：W2 用到 `SurfaceFocus.screen` 与 `ContextTools`、`ContextToolInvoke`、`CONTEXT_TOOL_LIMITS`。
- W1-2、W1-6 的写法按本计划细化（19.4），否则 W2 的字节账接不上。

### 19.2 已核对的现状（2026-10-12，`3b1d5076` 与 W1-1 分支）

**外壳**
- 情境中枢是一个闭包脚本，拼进 `/assets/molis-work-workbench.js`；窗格（iframe）加载同一份脚本和 `molis-work-workbench.css`。拆分后：
  - 行的绘制在 `context-bar.ts`（约 14.6 KB）。
  - 总线在 `context-bus.ts`。
  - 工厂在 `context-actions.ts`。
- **总线离不开底栏的 DOM**：
  - 找不到 `[data-assistant-context-actions]` 就整个返回（`context-actions.ts:166-167`）。拿掉这个宿主，焦点监听、开场建议、窗格转发都会一起消失。
  - 总线直接读写行的状态和 DOM：`bar.pinned/interacting/clearWhenLeft/idle/pending/render/error`，以及 `.context-actions-basis`。
  - `choose` 和开场建议的报错都画在行里。
- **窗格里只转发**：
  - 方案只经 `workbench-context-plan` 到窗格，而且只在绘制时发。没有空闲、等待、出错的消息。
  - ⌘. 和读屏播报只在顶层。
- **行的样式**在 `craft-finish.ts:1079-1147`：渲染后约 8.5 KB，同时进三份样式表（工作台、arrival、settings）。
  - 选择器 `ASSIST` 排除了 `[data-pane-embedded]`，所以窗格里一条都不生效。
  - `@container assistant-bar` 和 `:has(.assistant-panel…)` 只在底栏里有意义。
- **「更多」里的「推荐」读计算后的样式**：看哪个按钮被 CSS 藏了（`context-bar.ts:191`）。

**Pages**
- 格式条在 `editor-browser.ts` 的 `mount()` 里（`mount` 1024 行，正好在巨大函数上限）。
- 格式条有 15 个按钮：B、I、U、S、代码；H1–H3；三种列表；颜色、链接、评论；AI。
  - 开关态在 `placeToolbar` 里算。
  - 每次事务都重算位置，没有防抖。
  - 拖选时隐藏，输入法组合时不隐藏。
  - 点按钮执行的是 `run(state, dispatch)`，不带 `view`，所以不走悬停块的路径。
- **`pages-pop` 是一个实例**，承载这些表单：
  - 链接、评论、颜色（由格式条打开）；
  - 「AI」写作菜单（`openAi`）；
  - 候选预览（`runAiCommand` → `showCandidate`）；
  - 块备注、提示块样式（由块菜单、节点视图打开）。
- 另有页面选择器、卡片编辑器两个独立实例。
- **只有候选预览冻结选区**：链接、评论、备注记的是打开时的裸位置，期间文档变了不会重映射。
- **Pages 是 `molis:assistant-context-actions` 唯一的监听方，也是 `molis:assistant-context-action-choose` 唯一的派发方**：都来自写作菜单，`client.ts:311-335`。
- `local_id` 只按活动、粒度和选中的部分算，所以切换加粗不会产生新的焦点事件。

**门禁**
- **页面资源**：`workbench.js`、三份样式表、`pages.js`、`pages-editor.js` 的数字都等于实测，没有余量。
- **巨大单元**：`craft-finish.ts`、`assistant-island.ts`、Pages 的 `client.ts`、`editor-browser.ts`（`mount`、`renderMenu`）都没有余量，只能减。
- **DOM 事件**：登记表要求每个事件有发有收、主人文件都入库。

### 19.3 决定（本线按防腐与体验定，记入 §14）

1. **浮条程序在设计系统，只进工作台**：
   - W1-6 把浮条写成自包含的页面程序字符串和样式字符串。W2 把程序拼进 `workbench.js`，样式只进 `workbench.css`（工作台自己的样式模块），不进 `craft-finish` 那三份。
   - 窗格加载同一份脚本和样式，样式不按 `ASSIST` 限定。
2. **顶层和窗格各画一条，总线仍只有一个，在顶层**：
   - 顶层画在插件舞台里。窗格的嵌入分支自己建一条，由窗格消息驱动。
   - 新增消息：
     - 顶层→窗格 `workbench-context-view`：`op` 取 `render` / `pending` / `idle` / `error`，带方案与回执，取代只在绘制时发的 `workbench-context-plan`。
     - 窗格→顶层 `workbench-context-hold`：`pinned` 键与是否正在交互，供「悬停不动」和判断时保位。
     - 窗格→顶层 `workbench-context-dismiss`：Esc 收起的键，顶层据此记「忽略」。
     - 顶层→窗格 `workbench-surface-landing-flash`（W3-A3c）：请窗格在自己报告的落点上闪一次；顶层只发给落点所在、还连着的那个 iframe，目标 origin 是 `location.origin`，窗格先过 `panes.fromParent` 再处理（S-30）。
   - `workbench-surface-focus`、`-action-choose`、`-action-chosen`、`-action-unhandled` 不变。转发焦点前去掉 `screen`，它从不离开报告它的文档。
3. **总线与视图分开**：
   - 总线只通过一个视图接口说话（`render`、`pending`、`idle`、`error`、`pinned`、`interacting`、`plan`、`published`），按情境来源选本地视图或窗格视图，不再碰任何 DOM。
   - 没有底栏宿主时总线照常工作。
   - 800 ms 的可见性检查在有来源时才开、空闲时停，所以 `pages-surface-naming` 的桩 DOM 不会被定时器挂住。
4. **锚点**：
   - 用 `SurfaceFocus.screen`。浮条在同一文档里优先取活的 DOM 选区矩形：滚动时跟着选区走，滚出视口就收起。
   - 不是 DOM 选区的（Pages 的节点选区、表格单元格），由主人用 `coordsAtPos` 给 `screen`，滚动后重报同一个 `context_id`。浮条在本文档监听 `molis:surface-focus`，只更新位置，不重新请求。
5. **何时出现**（context-toolbar §6，用户 2026-10-02 拍板）：
   - 选区稳定 350 ms 后出现。拖选中、输入法组合中、选区在输入框里时不出现。Pages 的 `dragSelecting` 上收成浮条的通用规则。
   - `editing` 不自动出现，⌘. 唤出、贴在光标处。
   - 段落把手的入口这一波不做：Pages 的 `renderMenu` 已在巨大函数上限，要先拆，排到 W7 的 Pages 补齐。
6. **删掉两条事件和合同常量**：`molis:assistant-context-actions`、`molis:assistant-context-action-choose`，以及 `CONTEXT_ACTIONS_EVENT`、`CONTEXT_ACTION_CHOOSE_EVENT`。
   - 它们唯一的收发方是 Pages 的写作菜单，菜单删了，再留就是两套。
   - 页面接动作的 `molis:assistant-context-action-chosen` 保留。
   - 合同改形状，按 `CONTRACT-CHANGES.md` 同一个 PR 改完所有消费者：仓库内只有 Pages 与总线。
7. **Pages 的工具**：15 个按钮变成 4 组 `ContextTools`。
   - 标记 5 个、标题 3 个、列表 3 个：`collapse: "overflow"`，窄时折成「格式 ▾」。
   - 插入 3 个（颜色、链接、评论，`opens: "panel"`）：`collapse: "never"`。
   - 「AI」按钮删掉，它的内容就是浮条的动作区、「更多」和「✦助理」。
   - 执行沿用今天的 `run(state, dispatch)`（不带 `view`），行为不变。
   - 开关态在每次事务后合并到下一帧重发，`context_id` 不变。
8. **面板槽**：
   - 链接、评论、颜色、候选预览进浮条下的面板槽。⌘K 打开链接面板（浮条随之出现）。
   - **面板打开期间一律冻结选区**，与候选预览同一套 `freezePagesFocus`。这修掉了链接、评论写到裸位置的老问题。
   - 块备注、提示块样式、页面选择器、卡片编辑器不是选区上的东西，留在 Pages 自己的弹窗里，`pages-pop` 的样式为它们保留。
9. **报错落在哪**：
   - 浮条上的选择出错，显示在浮条（或面板槽）的提示行。
   - 开场建议出错，经 `molis:assistant-starters` 的新字段 `error` 回到助理的开场建议浮层（事件详情改形状，登记表同步改）。
10. **助理入口**：
    - 动作区末尾的「✦助理」打开面板槽里的一行输入，派发现有的 `molis:assistant-message`（`mode: "delegate"`）。
    - 「更多」底部固定「带到助理」（`mode: "suggest"`）和依据行（Jev / 按规则，模型与耗时）。
    - 范围标签删掉（选区高亮就是范围），Esc 收起并记「忽略」。
11. **尺寸与层次**按 §18.6：
    - 浮条按钮桌面 32px、紧凑 28px、触屏 44px。
    - 浮条用 `--lift-2`。「更多」菜单与面板槽用 `--lift-3`。
12. **不改**：候选、判断、陈列方案、冻结、记忆信号、开场建议的语义。

### 19.4 切片与 PR 序列

| 片 | 内容 | 验收编号 | 门禁与用例 | 依赖 | 碰的枢纽 |
| --- | --- | --- | --- | --- | --- |
| W1-2（细化） | 设计系统 `floating.ts` 同时导出 TS 函数（给 Pages 的 esbuild）和同一份的字符串形式（给页面程序拼接，`.toString()` 写法）；`placeOverlay` 的舞台选择器改参数；Pages 删掉自己的副本 | W1-02；`pages-editor.js` 不增 | 页面资源（esbuild 的模块路径注释会变长几十字节，用删掉的副本抵掉）、`pages-plugin` 的源码断言 | #423 | 设计系统 `index.ts`、README |
| W1-6（细化） | 组件名 `context-toolbar`、类名前缀 `mw-ctx-`（`renderToolbar` 已占名）；经 #423 的 `catalog-examples.ts` 加一节，样式与示范脚本内联在该节（不进 `PRIMITIVE_STYLES`，不花页面字节）；只用变量，不写色值；三个事件在这里登记，收发方是组件板标本；T08 清洗与上限单测；`DESIGN.md` 的 Context toolbar 一小节 | W1-06、T08 | `primitives.test.ts`、`touch-targets.e2e`（组件板上的菜单项 34/44px）、DOM 事件 | #423 | `DESIGN.md`、`catalog-examples.ts`、`dom-events.ts` |
| W2-0 | 总线与行解耦（纯重构，外观不变）：视图接口、底栏宿主可选、可见性检查按需、报错按来源；行仍是唯一视图 | W2-00：行为与 W1-1 后一致 | `contextual-interaction.e2e`、`pages-surface-naming`、`affected-tests` 选出的；非共享核心，CI 与定向用例绿即可合 | #429 | — |
| W2 | 切换，一个 PR 分五个提交：① 工作台浮条与窗格消息、样式换位、删底栏宿主；② Pages 迁移（声明工具、执行调用、面板槽、删格式条与写作菜单）；③ 合同与登记表（+3 事件的主人改到工作台，−2 事件与常量，`starters` 详情加 `error`）；④ 用例改入口；⑤ 文档（`DESIGN.md`、`skills/molis-plugin-dev/contextual.md` 加「选区浮条」、`continuity.md`、`PLUGIN-PLATFORM.md`、`UI-PLATFORM.md`） | T01–T09（context-toolbar §8）、W2-01…W2-08（下） | 页面资源（逐个文件只减，见 19.5）、巨大单元、DOM 事件、API 快照、翻译；动了合同，进批量全量 | W1-2、W1-6、W2-0、#430 | `dom-events.ts`、`services/contextual.ts`、`DESIGN.md`、`AGENTS.md` 不动 |

W2 自己的验收（在 T01–T09 之外）：

- **W2-01**：总线在没有底栏宿主时照常工作。开场建议、窗格转发、`place-changed` 清空都在。
- **W2-02**：窗格里的浮条画在窗格自己的文档里。
  - 悬停或聚焦的按钮在判断到达时不移动（`workbench-context-hold`）。
  - Esc 收起记「忽略」。
- **W2-03**：浮条的动作区与「更多」逐项等于同一份方案，「整篇」在最后。替代原写作菜单与方案相等的断言，不放宽。
- **W2-04**：面板打开期间选区冻结。期间文档改动，写入被拒并说明，不写到错的位置。链接、评论、颜色、候选都适用。
- **W2-05**：⌘K、⌘B 等快捷键行为不变。⌘K 打开链接面板。
- **W2-06**：页面资源逐个文件不增，三份样式表各减。巨大单元只减。
- **W2-07**：没有任何按 `plugin_id` 的分支。Pages 只经三个事件与浮条说话。
- **W2-08**：开场建议的报错出现在助理的开场建议浮层，不再落在不存在的行里。

### 19.5 字节账（页面资源只许减，逐个文件）

| 资源 | 减 | 加 | 怎么守 |
| --- | --- | --- | --- |
| `workbench.js` | 行的程序约 14.6 KB；转发方案给 Pages 的那段 | 浮条程序（目标 ≤ 11 KB）；窗格消息约 2 KB | 第一个提交就量（`node scripts/gates/page-assets.mjs --report`），超了先压浮条程序（共用小函数、短文案），不能抬数字 |
| `workbench.css` | 行的样式约 8.5 KB；Pages 格式条与写作菜单的样式约 1.5 KB | 浮条样式（目标 ≤ 4 KB） | 同上 |
| `arrival.css`、`settings.css` | 各约 8.5 KB | 0 | 本 PR 内 `--update --base origin/main` 降数字 |
| `pages.js`（Pages 客户端） | 写作菜单的接线约 37 行 | 工具的发布与执行转交（小） | 同上 |
| `pages-editor.js` | 格式条、`openAi`、`placeToolbar` 与监听约 250 行 | 工具声明与执行、面板槽接线（表单本身是搬家） | 同上 |

巨大单元：
- `craft-finish.ts` 删 69 行，`assistant-dock.ts` 删 1 行，Pages `client.ts` 删约 37 行，`mount` 变短。
- `assistant-island.ts` 只改既有一行的选择器：岛的选区监听要排除浮条。
- 新文件都在 800 行内，函数都在 150 行内：浮条程序按职责拆成几段字符串。

### 19.6 测试

- **改入口、不放宽**：
  - `contextual-interaction.e2e`：把行改成浮条。原「写作菜单等于方案」改为「浮条与更多等于方案」（W2-03）。冻结、替换、编辑后拒绝写入的断言照旧。
  - `pages-actions.e2e`：「AI」改为浮条「更多」里的「总结」，候选在面板槽。
  - `pages-plugin`：源码断言跟着改，`followScroll(toolbar` 改为对浮条的断言。
  - `dom-events-contract`。
- **新增单测**：
  - Pages 的工具映射：编辑器状态到 `ContextTools`，纯函数。
  - 窗格消息的读取：有界、封闭。
  - 视图接口的路由。
  - 「更多」的推荐区不再读计算后的样式，改按宽度算出的槽数。
- **浏览器**：
  - `affected-tests` 选出的全部。
  - 加 `touch-targets.e2e`、`workbench-pane-*.e2e`、`pages-*.e2e`。
  - 截图走 PR 模板：浅色、深色，1440、1024、390 三个宽度，写入已忽略的评审目录。
- **全量**：并入统筹排的批量（W2 动了合同）。

### 19.7 风险

- **`workbench.js` 字节**：最紧的一项。浮条程序要写得比 W0 原型紧，第一个提交先量，不在 PR 末尾才发现。
- **窗格里的悬停保位**：多一来一回。判断到达与指针离开的竞争要有单测（顺序：先存，离开后再换）。
- **Pages 的 `mount` 在上限**：迁移只删不增。表单搬进面板槽时保持原函数，不往 `mount` 里加。
- **「正在写的这段」自动建议消失**，只剩 ⌘.：这是 2026-10-02 的既定取舍。把手入口延后，在 PR 和发布说明里写明。
- **与助理面板线**：只改岛里一行选择器，和开场建议报错的显示位置。动工前经统筹告知。

### 19.8 实施记录与对计划的修正（2026-10-12）

| 片 | 计划写的 | 实际 | 原因 |
| --- | --- | --- | --- |
| W1-2 | `floating.ts` 在设计系统，Pages 从包名导入 | 子路径 `@molis-ai/molis-work-design-system/floating`（叶子文件）；舞台由最近的 `[data-floating-stage]` 给，Pages 的工作区加这个属性，编辑器里不再有 Pages 专属的包装 | 包根入口带 `node:url`，不能进浏览器包（esbuild 实测）；包装会让 `pages-editor.js` 多 114 字节，门禁只许减 |
| W1-6 | 浮条原件，事件登记，T08 | 同左，另：`floating-source.ts` 把同一份放置函数以源码形式带进页面程序；页面程序约 13.7K 字符（含放置源码 1.7K、清洗源码 1.5K） | 一份放置；W2 要用被替换的底栏行（约 14.6K 字节）抵它，大小以 W2 实测为准 |
| W2-0 | 总线与行解耦 | 已完成并验证（单测 834/834、健康与边界通过、`contextual-interaction.e2e` 通过、`workbench.js` 少 272 字节，预算在同一 PR 里降）；PR 等 #429 合入后从 main 开 | W2-0 在 W1-1 的拆分文件之上 |
| W2（代码） | 五个提交（浮条与窗格消息、Pages 迁移、合同与登记表、用例、文档） | 已写完并提交到 `feat/context-w2-toolbar`（2026-10-12），已推送、未开 PR：未构建、未跑浏览器用例，等批量全量放掉锁。以下几处与 §19.3 不同 | 见下面各行 |
| W2 决定 8（面板冻结选区） | 链接、评论、颜色、候选面板打开期间一律冻结选区 | **改为「等着的结果不丢」**：面板可带 `keep`（`molis:context-panel-open` 的载荷新增）——候选预览（人在等模型的结果）带它，换了选区、点了别处，面板留在原处、不再跟着浮条，只由它自己的按钮、Esc 或写回收起；链接、评论、颜色这几个属于选区的表单不带，情境一变就收。选区冻结（`freezePagesFocus`）仍只用于候选 | 冻结选区要让总线、浮条、工具三处一起停，边界多、不能在没有浏览器的时候验；真正要保住的是原来的行为（模型还在算时选了别处，结果仍写回当初问的那一段），`keep` 用很小的改动保住它 |
| W2 决定 9（开场建议报错） | `molis:assistant-starters` 详情加 `error` | **不加字段**：开场建议里选了动作后出错，经 `host.showToast` 显示（助理岛的助理线一行不用动，登记表也不变） | 助理岛是巨大单元、没有余量；一条提示足够，且不用为一个字段动合同 |
| W2 决定 10（✦助理） | 动作区末尾的「✦助理」打开面板槽里的一行输入，派发 `molis:assistant-message`（`delegate`） | **沿用现有入口**：「✦助理」和「说出要做什么」把说明文字放进助理输入框、不发送（`molis:assistant-open`，与原先 `askAssistant` 一致）；「带到助理」只放材料。Pages 自己的「交给助理」表单随写作菜单一起删了 | 与 §3.6 的「默认不发送」一致，也不新增一条走向 `assistant-message` 的路径 |
| 页面字节 | 浮条程序目标 ≤ 11 KB，用被替换的行（约 15.2 KB）抵 | 浮条程序 13.8 KB、适配 6.5 KB，**净 +6.4 KB**；补救：新增 `compactScript`（设计系统；发给浏览器前去掉页面程序的缩进、空行和整行注释，语句不并行）用在浮条程序和情境脚本上（整个情境脚本 −5.7 KB），`placeFloating` 拆成「上下」和「旁边」两半、页面程序只带前一半（−0.2 KB），徽标改按「不是当前插件的」判断、少一段计票（−0.2 KB），其余是小改。最后 `CONTEXT_ACTIONS_FACTORY_SCRIPT` 比 W2-0 少约 470 字节（以 TypeScript 转译实测 42,115 → 41,645） | 预算只许减。**观察，另案**：工作台脚本里随手可见的缩进与注释行占相当大一部分，`compactScript` 若用在拼装工作台脚本的那一处，整个 `workbench.js` 能少几十 KB，且可以用「压空白后的 esbuild 输出相同」来证明没有改语义——这属页面资源门禁的主人，写进阶段汇报，由统筹决定 |
| 浮条里的徽标与原因 | 「另一个插件的动作写明是谁的」 | 动作按钮和「更多」里的备注一律按「提供方不是当前聚焦的插件」判断（原先按「可用候选里最多的提供方」）；不可用的条目把原因排在名字下面 | 原来的判断在多个提供方时会给当前插件自己的条目也标上名字；E-10 要求原因在名字下面 |

踩到的门禁规则（记给后面的片）：测试文件引用包内部（相对路径进 `src/`、`dist/`）新文件从 0 起，所以新测试走包入口，宿主内部逻辑只能经 `apps/local-host/src/index.ts` 的具名导出（W1-3、W1-7 各加几行）；Error 子类按文件计数，宿主新错误用 `defineErrorCodes` 声明的码（`contextual.*`）；`as unknown as` 与显式 `any` 在新测试里从 0 起，桩用 `stub<T>(value: object): T`；注释在页面脚本里按字节发给每个页面，长解释放进 TS 文件头。
