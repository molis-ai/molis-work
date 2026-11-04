# 情境方案的基线复查与 W0 原型

原 §15–16。保留 main 核对、需求对照表、原型实操与回归结论。

[返回需求书](spec.md)

- [15. 吸收 main 的变化（2026-10-09）](#15-吸收-main-的变化2026-10-09)
- [16. 进度与证据](#16-进度与证据)

## 15. 吸收 main 的变化（2026-10-09）

设计稿按 a4e246e0、2b138559 写成。2026-10-09 把 origin/main 11878059 合进本分支（之间 888 个提交），按当前代码逐条核对。下面只写**改动了设计**的地方；行号、能力名这类纯事实更正，直接改在各子需求书的现状节里。

### 15.1 成果库定位

[artifact-positioning](../archive/artifact-positioning/spec.md) 已全部合入：成果只表示固定版本；插件之间的交换数据是**过程项**，存在产生它的插件名下，不进成果库、侧栏「文件」和搜索（门禁 `tests/artifact-type-gate.test.ts`、`tests/artifact-declaration-gate.test.ts`）；侧栏的成果预览走类型 owner。对本设计有四处影响，已改进正文：

1. **Coding 报告与变更收进 Shelf**：报告是成果（`coding.report.v1`），变更集是过程项（`coding.changeset.v1`），Shelf 经 `shelf.results.receive` 把两种都收成一份个人副本；收下后就是普通 Shelf 材料（8.5）。
2. **放进 Coding 下一轮材料**：手上是 Shelf 材料时，`shelf.material.save` 把它交给项目，成为 Shelf 名下的过程项 `shelf.text-material.v1`，Coding 经 `materials` 端口挂到会话；手上是别的东西时，Coding 新增自己名下的文字摘录过程项（8.5）。
3. **「文件」格收什么**：成果、文件来源、Shelf 材料，过程项不进（§7）。
4. **`shelf.files.entries`**：保留。它是个人范围，只列 Shelf 的材料与结果（不列文件夹和失败的），本来就不含过程项（side-shelf §7）。

创建入口与追加不改变这些规则：`ItemIntake`、`ItemAttach` 指向的都是插件自己已有的写入动作，写成果还是过程项由那个动作决定；宿主按 manifest 拒绝未声明的写入，本设计不另加检查。

### 15.2 整页门禁

- Shelf 改为 `side` 视图后，由宿主排版的侧栏文档 `/projects/<id>/side/<插件>/<视图>`（`apps/workbench/src/side-view-document.ts`）出。它已在例外清单里（artifact-positioning §4、`tests/shell-page-gate.test.ts`），不新增例外，也不新增整页生产者。
- Shelf 的 `navigator` 视图删掉后，左边主区不再有 Shelf 页。原来指向它的入口都要改道到右栏的 Shelf 格：
  - `shelf.items.admit` 结果视图里的链接 `?openPlugin=shelf&openItem=…`；
  - 搜索结果的 `open: { surface: "shelf" }`；
  - 桌面的 `molisWorkOpenShelf`（W2'-3 起调 `molisWorkOpenPlugin("shelf")`，与上两条走同一条规则）。
- 整页门禁会沿工作台里的链接逐个打开地址，改道之后仍须落在工作台里。
- 浏览器格、文件格、助理面板都在顶层文档里，浮条直接画在那里，不涉及整页。

### 15.3 健康门禁

**巨大单元只许变小**（上限：文件 800 行、函数 150 行）。本设计要动的文件现状如下，先拆再加：

| 文件 | 现在 | 先拆什么 | 波次 |
| --- | --- | --- | --- |
| `plugins/native/pages/src/editor-browser.ts` | 4042 行；`mount` 1024、`hoverHandlePlugin` 798、`view` 676、`renderMenu` 173、`findPlugin` 169、`slashPlugin` 160 | `placeOverlay`、`pinAt`、`followScroll` 上移到设计系统；格式条与写作菜单的迁移只删不增，搬出的部分写成新文件 | W1、W2 |
| `apps/workbench/src/scripts/client/assistant-island.ts` | 2812 行 | 情境条、助理面板作为位置写成独立模块，不往这个文件里加行 | W3 |
| `packages/design-system/src/styles/craft-finish.ts` | 2312 行 | 浮条样式放进新的设计系统原件；底栏动作条样式（:1079–1145）只删 | W1、W2 |
| `plugins/native/shelf/src/client.ts` | 1708 行 | Shelf 格的窄宽度版式写成独立文件 | W2' |
| `packages/im-ui/src/browser/controller.ts` | 966 行；`startIm` 957 | 输入框落点、外部引文写成独立模块 | W6 |
| `apps/workbench/src/scripts/client/context-actions.ts` | 642 行，还不是巨大单元，但离 800 不远 | 先把 `bar`（渲染，:180）与 `bus`（总线，:372）分成两个文件，再接浮条与落点 | W1 |

**兼容标记只许减少，新文件从零开始。**
- 改名时直接改，不留别名：`dock-window-im`、`data-dock-window="im"`、`data-dock-frame="im"`、`data-dock-toggle="im"`。现在出现在 `immersive-shell.ts`、`side-panel.ts`、`navigation-presentation.ts`、`docs/system/GLOSSARY.md`。
- 右栏记住上次那一格用的是 `localStorage` 的 `molis:side-tab`，格 id（`discussion`、`browser`、`files`、`plugin:<插件>/<视图>`）不改，所以不用迁移旧值。
- 删除底部动作条、`BAR_RESIDENT_IDS`、Pages 的「AI」按钮与写作菜单时，都不留兜底分支。

**旧路径插件名单**（`tests/builtin-plugin-assembly-gate.test.ts`）：写这段时 Shelf 还在名单里、`apps/local-host/src/shelf-native-plugin-http.ts` 仍在；Shelf S3 已删掉这个文件，路由改为插件自己的 `/api/plugins/io.molis.work.shelf/…`。本设计只改 Shelf 的视图，不碰它的 HTTP，也不新增旧路径文件。

### 15.4 六项待核对的结果

| 待核对 | 结论 | 依据 | 对设计的影响 |
| --- | --- | --- | --- |
| 生成插件的绘制处能否代写对象声明和「✦」 | **部分可以** | 所有生成插件都由同一个客户端 `packages/design-system/src/plugin-component-client.ts` 绘制，画在沙箱框（`?frame=workbench`）里；它记着每个集合选中的记录；带 `submit` 的录入部件（`intent: "input"`）就是「新建」 | 「✦」槽和创建入口可以由平台代写：从录入部件的提交动作派生。对象声明还缺两样：生成插件没有 `subject.read` 读取器，记录的对象种类也没有机器可读的声明，要由平台按读取绑定派生种类和读取器；框是 iframe，要像分屏窗格一样把焦点转发上来。排在 context-toolbar §11.6 波次 3 之前做一个平台侧的统一声明（§11.2 已写明） |
| Goals 事件类动作的能力名 | **已核对** | `plugins/native/goals/src/actions.ts:104`（`goals.note`）、`event-command-actions.ts`（`goals.progress.record`、`goals.concerns.apply`、`goals.decisions.request`）、`configuration-actions.ts:39`（`goals.relations.add`，只许人） | 「记为备注」「提出问题」「请求决定」「记进展」各有现成动作，受众含 agent；「关联到别的 Goal」只能由人在界面里点。「风险」已移出 Goals（另有待做的[风险插件](../risk-plugin/spec.md)），浮条里不再写「记为风险」 |
| 记忆合同有没有显式写入入口 | **有** | `packages/contracts/src/services/memory.ts:449` 的 `memory.write`（受众 user、agent；无 plugin 受众（2026-10-11 校正）），撤销 `memory.changes.undo` | F10 直接用它，不用新合同；人点的写入经写入门直接生效并带撤销 |
| Shelf 有没有创建文字材料的动作 | **有** | `plugins/native/shelf/src/actions.ts` 的 `shelf.items.admit`（收文字、标题，个人范围，受众 user、workflow、agent、mcp）；撤销 `shelf.items.delete` | 「收进 Shelf」的底层动作就是它，声明了撤销，所以可以直接执行并带「撤销」。它的输入没有出处字段，出处先写进正文开头（与浏览器「交给助理」的做法相同），以后需要再给 admit 加字段 |
| Coding 转录里的选字算不算会话对象；Jelly 笔记块能否选中 | **Coding 算；Jelly 现在不行** | Coding：转录是普通 DOM，每一轮是 `article.coding-turn[data-turn=<turn_id>]`（`plugins/native/coding/src/client.ts:853`），根元素声明 `coding_session`（:1125），通用选区路径不排除它。Jelly：笔记块是 `contenteditable`（`plugins/native/jelly/src/client-content.ts:30`），通用路径的 `own()` 排除可编辑区 | Coding 转录里选字就是 `coding_session` 的选区；「从这里分叉」用 `data-turn` 那一行作 `anchor.element`，输入里带 `turn_id`。Jelly 笔记的选字并进 G1（文本框与可编辑区的选区），另外 Jelly 也有自己的格式条（`jelly-format-bar`），按 Pages 的做法迁成浮条工具 |
| 浏览器服务能否给出页面选区的矩形 | **能** | `apps/local-host/src/browser/browser-host.ts` 已经用 CDP 的 `evaluate()` 读选中文字（`selectedText`、`capture`）；侧栏已有页面视口坐标到 canvas 的换算（`apps/workbench/src/side-panel-browser.ts:201`） | 加一条取选区的消息：页面里取 `getSelection().getRangeAt(0).getBoundingClientRect()` 和文字，外壳按视口比例换算到 canvas，把浮条画在 canvas 上方。只覆盖顶层框，页面里跨源 iframe 的选区取不到，如实写明 |

### 15.5 其他事实更正（细节在子需求书）

- **对象声明**：Inbox、Artifacts、Sessions 原表写「✗ 没有浮条」，其实工作台已按搜索来源给它们命名对象（打开为条目标签时）；Characters 声明了表面，但不在 `SEARCH_ITEM_TAB_SURFACES` 里，实际仍没有；Git、Diff 仍没有（context-toolbar §10.1）。
- **动作池**：现在是选区动作 25 条（Pages 20、Goals 2、Todo 1、灵光 1、搜索 1）加对象动作 8 条（Feed 5、Inbox 3），共 33 条，不是「约 40 条」（side-shelf §2）。
- **能力名**：`coding.create-session` → `coding.sessions.create`（不是只许本机本人）；`feed.out-rules.create` → `feed.rules.create`；`feed.capture` 是场景不是动作；炼金术士、Jelly、Schedule、Cognia、Images 的动作都带插件前缀；`reminders.add` 只对插件开放；`shelf.material.save` 是把已有的 Shelf 材料交给项目，不是「从文字建」（quick-create §7）。
- **内容站**：`receive@2` 的输入是平铺的 `{ title, body, url?, source?, feed_item_id?, request_id }`，幂等键就是必填的 `request_id`（工作流传 `workflow:<实例>:<步骤>`，放置传 `placement:<请求号>`；W4-6a，quick-create §11）；成果库是第 9 个站，只能列、读，不能收（quick-create §2）。
- **工作流**：`instances.start` 的输入是 `{ id, item_id?, title? }`，至少两站，空白起步要第一站支持 `can_start_blank`（quick-create §6.2）。

### 15.6 与其他在做的任务的交界

- **ai-interaction-experience**（会话 goalboard-4e，分支 `feat/ai-interaction-experience`，需求书在该分支的 `specs/ai-interaction-experience/spec.md`）：用户已定，与输入框同排的按钮只放对话的下一步，页面选区动作走本设计的浮条。2026-10-09 两边约定：
  - 输入框上方留一个独立槽，挂本设计的「手上 + 落点」情境条；同排推荐只占输入框那一行的右侧，窄屏时挪到输入框上方、排在情境条之下；那边动输入区的 DOM 之前先把结构发过来；
  - 复用现行 `AssistantPreparedCard` 与卡片入口；这条是历史接口协作记录，不构成保留旧形状或读取兼容的要求。旧卡片 404/405 回退已删除，不恢复；合同变更遵守现行合同规则；
  - `context-actions.ts`、底栏动作条的容器（`assistant-dock.ts:72`）与样式（`craft-finish.ts:1079–1145`）归本设计，那边不改，也不依赖底部动作条。
- **[repository-anti-corruption](../archive/repository-anti-corruption/spec.md)**：它在拆 `AssistantService` 等巨大单元；本设计改到同一文件前先问。
- **[risk-plugin](../risk-plugin/spec.md)**：「记为风险」的去处等它落地，由它声明创建入口。

### 15.7 本轮实施基准与已确认纠正（2026-10-11）

实施工作树基于 `origin/main=9f9bda551402`，分支 `feature/context-w0`；原设计提交 `7748613e8` 没有合并进实施树，仅恢复本四份完整规格。上文 2026-10-09 的行号、大小和能力统计保留为当时证据；动产品前按当前源码与门禁重核，不照旧数字或旧排期实施。

- `kernel/contextual` 子入口与可配置判断措辞已合入；沿用唯一候选/陈列策略。Manifest 与执行生命周期已有 SDK 归属，声明校验 B2 仍在途，W1 待最终位置；本片不新增公共合同或第二份登记。
- 原“右栏五格”扩为 Shelf、灵光、文件、浏览器、**电脑**、讨论；电脑格由 Computer Use 线拥有，main 的 #471 已实现（`apps/workbench/src/side-panel-computer.ts`：只读的实时画面、每步确认、暂停/接手/停止、「放进 Shelf」）；本线不接管电脑能力，W0 原型只写一段说明、不连接桌面，产品代码不改它。电脑格在情境上的行为见第 14 节 2026-10-13 的决定。原五格的完整行为要求仍保留。
- `memory.write` 当前没有 plugin 受众；F10 保留用户/Agent 路径，不据旧表扩权限。助理消费推荐需提升为只读系统动作，页面 HTTP 调同一动作；本片的助理交接只是模拟。旧 404/405 卡片回退已删除，不恢复。
- 合同读写只认现行取值；原设计“读取兼容”的实施前提已由现行合同规则取代。幂等、既有业务行为及拒绝路径仍须回归；不增加兼容层，不因本说明改变验收编号所对应的业务目标。
- 固定版本成果归成果 owner，过程项归生产插件，Shelf 只拥有个人副本；Coding 文字摘录仍是后续工作。输入提交消费输入回执合同；消息、Run、TaskBoard 的协作/等待/接续沿既定 owner，情境线不另建账或自动续跑。
- 巨大单元、资源字节、DOM 事件与装配均受当前门禁约束，不以旧拆分建议放宽门禁。本轮不改门禁、预算、产品 src、SDK、Agent Host 或助理/Coding 实现。
- 当前一个 writer；构建与浏览器由统筹排时段。旧 A/B/C 多 writer、切片/评估子代理并行安排失效。两组真实 Jev 评估与原生拖出仍是后续欠缺验证，本轮只准备标注样例；历史读本人 Home 的授权不沿用到本轮。

## 16. 进度与证据

工程验证、真实场景验证、用户本人验收分开记。

### 16.1 合入记录

- 历史设计分支记录（不代表 W0 实施树）：2026-10-09 合入 origin/main 11878059（888 个提交，没有冲突），四份 spec 按当前代码核对并改正（第 15 节）；`pnpm health:check`（对 merge-base）通过。
- 2026-10-12：本分支合入 origin/main `02ceba8c`（196 个提交；`specs/README.md` 一处冲突，两边条目都保留）。合入后先不改代码跑了一遍构建、health、定向用例与 e2e，全部通过（16.2）。

### 16.2 W0 原型：范围、打磨与证据（2026-10-12）

**范围**：一个高保真切片，入口 `scripts/preview-contextual-interaction.mts`，模块在 `scripts/contextual-slice/w0-*`。真实的部分：Pages 编辑器（含它的冻结与格式命令）、kernel 候选与陈列策略、Host 规则判断服务、设计系统的令牌与 `mw-*` 控件。模拟的部分在界面上逐处标明（「样例材料」「模拟改写」「模拟起草」「模拟网页」「模拟交接」）：右栏除 Shelf 外的内容、改写与起草、待办 / 灵光 / Goal 提案的写入、助理交接。文稿与条目只在预览进程内存里，重启复位；`--home` 只是隔离标识，不读写。同一个页面里演示：

1. 左边 Pages 选区的浮条：工具区（加粗、斜体，窄时折成「格式 ▾」）、动作区（≤3，窄时 2）、更多、✦助理、面板槽；底部没有动作条；
2. 右栏六格（Shelf · 灵光 · 文件 · 浏览器 · 电脑 · 讨论）：Shelf、灵光、文件、讨论的条目和浏览器里选中的文字都能成为手上的东西，浮条贴着它出现，最前面标出落点；电脑格不产生手上的东西、不是落点（见第 14 节 2026-10-13）；
3. 放进落点：预览画在左边落点处的面板槽里，确认才写入；写入后可撤销；
4. 拖放：从右栏拖到左边松手，在松手处弹出同一份列表（DOM 拖放；桌面原生拖出未验证）；
5. 推荐的创建动作：声明了撤销的直接创建，提示带「撤销」「改放到 ▾」；提案类出预填卡片；
6. 「✦ 一句话新建」：Pages 标题栏、Shelf 与灵光格的标题栏；
7. 助理：输入框上方的「手上 + 落点」情境条，浮条 ✦ 与输入框两处交接，列出与浮条同一份候选。

**2026-10-12 按实物打磨**（在内置浏览器里逐条走过之后改的；产品目标、事实归属与安全边界不变）：

| 改了什么 | 实物里看到的问题 | 收益与取舍 |
| --- | --- | --- |
| 落点在编辑器读完 DOM 选区之后再读，来源在事件发生时判定 | 点在第 3 段，落点却停在隐藏的标题里；确认就会写进标题（严重） | 落点就是光标所在；快速点完文稿马上点右栏也不丢 |
| 落点用读者的话命名：「最近的标题 · 第 N 段 光标处 / 选中处」，另附原文片段；引用写「…之后」（2026-10-16 L-3 去掉「第 N 段」，改为标题 + 位置词 + 原文片段，见 21.5） | 「第 2 段」把隐藏标题也数进去，和眼前对不上 | 认得出放在哪；长标题截到 10 字 |
| 打开文稿就有落点「文末」（`ItemAttach` 的 `end`），点一下文稿改成光标处 | 不先点文稿，右栏选中后没有任何「放进」 | 选中就能放；AC-S06「左边没有落点」改由「原型说明」里的演示开关触发，产品里它对应左边没有能当落点的对象 |
| 落点标记：光标处是铜色插入线、选中处是浅色底，不盖住字；手上东西在右栏时常驻、跟随滚动、滚出文稿区不画；悬停「放进」时闪一次 | 原标记是实心底色块，把要替换的字盖住了 | 一眼看到去处；常驻标记只在有东西可放时出现 |
| 推荐位按两族交替：最好的放进 → 最好的去处 → 次好的放进…；他人原话（访谈、网页、讨论消息）默认「作为引用插入」 | 右栏宽度只放得下 2 个；放进类排满就看不到任何创建 | 窄条也同时给出两类下一步；规则排序的替身，真实排序仍由 Jev 定 |
| 写入后：变化的那一块淡出一次到达色；提示条带「撤销」（以新版本恢复；期间文稿被别处改过就拒绝并说明）；落点移到刚写入内容之后 | 写入后没有任何反馈，不知道写在哪、能不能反悔 | 连续放第二条时顺着往下；撤销不会覆盖别人的改动 |
| 「改放到 ▾」是从提示条长出的菜单，列同一次判断的去处；可撤销的一键换，提案类出卡片 | 原面板被提示条压住，按钮点不到 | 与 quick-create §5 ② 一致 |
| Pages「新建文稿」按需求书改为直接创建带撤销；卡片路径改由「提成 Goal 提案」（`proposes`）演示 | 原型把新建文稿当成「没有撤销」的例子，和 quick-create §8 问 3 不符 | 两种确认路径都看得到，且各自符合声明 |
| 一句话新建：一行输入，回车在同一面板里起草，确认一次 | 原来要跨两层面板 | 少一层；与 quick-create §5 ① 的「一行内联输入」一致 |
| 左→右：「收进 Shelf」后右栏切到 Shelf 并把新行亮一次；灵光格也有 ✦ | 新东西落进右栏看不见 | 总纲 §7 |
| 右栏另五格有了可操作的样例：灵光两条、文件两份加 Shelf 材料（只能看）、浏览器一页（DOM 文字代替画布）、讨论三条消息；电脑只有一段说明（产品里的电脑格是 #471 的实时画面） | 只有 Shelf 能试，右栏六格无从验证 | 六种来源走同一条路；各标「模拟」；对象种类在行的提示里 |
| 浮条照 Pages 格式条（8px 圆角、`--shadow-raised`、28px）；工具与 ✦、▾、× 用设计系统图标；落点胶囊铜色；右栏里放不下时右缘对齐右栏、向左伸出 | 用了 ▾ × ✦ 等字符；右栏里浮条被裁掉 | 合 DESIGN 的图标与触屏规则（触屏 44px） |
| 菜单、面板、提示按 DESIGN：`--lift-3`、12px、34px 行；面板头部 × 图标、底部「取消｜确认」并排在右；提示条是石墨胶囊带成功 / 失败标记，失败轻摇一次，7–9 秒自动收（悬停或聚焦时不收） | 面板是 16px 对话框圆角、头尾各一个关闭；提示条不会自己收 | 一处关闭、一个主按钮 |
| 助理：浮条 ✦ 在面板槽里一行输入；输入框提交时交接卡从输入框上方升起；两处都列同一份候选并写明各自怎么执行。情境条只在手上有右栏 / 助理面板的东西时带落点；手机上一行横向滚动 | 交接卡出现在屏幕顶上；手机上两行情境条压住右栏底部 | 与助理面板「回答在输入框上方升起」一致 |
| 本次预览创建的条目收进顶栏「预览记录」 | 待办出现在 Shelf 列表里，归属不对 | Shelf 格只放 Shelf 材料 |
| 修主题切换（现行属性是 `data-resolved-theme`）与键盘焦点环（`--focus-stroke` 是 outline 值） | 深色截图其实是浅色；键盘焦点看不见 | e2e 断言焦点可见、主题真的切到深色 |

**三级证据**（分开记，下级不替代上级）：

1. **工程**（本树 `feature/handoff-contextual-actions`，2026-10-12 合入 origin/main `02ceba8c`，196 个提交，`specs/README.md` 一处冲突保留两边条目）：
   - 改动前在新 main 上：`pnpm install --frozen-lockfile --offline` 通过；`pnpm build` 通过（持 build 锁，87 秒）；`node scripts/check-health-gates.mjs --base origin/main` 通过；`node scripts/run-tests.mjs tests/context-program-slice.test.ts tests/contextual-interaction.test.ts tests/contextual-dock-parity.test.ts` 42/42；`tests/context-program-slice.e2e.test.ts` 4/4（持 browser 锁）。旧 W0 不改一行即可在新 main 上跑，§17 列的 DESIGN、公开包边界、TypeSafe 单参数绑定、情境服务四处变化不影响预览（TypeSafe 绑定只在预览不用的 Jev 路径上）。
   - 打磨后：切片文件严格 TypeScript 0 诊断；Biome 对切片文件 0 新诊断（`scripts/contextual-slice/client.ts` 里 2 处是 main 上已有的）；`tests/context-program-slice.test.ts` 13/13；e2e 与定向回归见 16.3。
2. **原型人工实操**（内置浏览器，端口 4290；这是独立原型，不等于真实产品实操）：1440 与手机宽度、浅色与深色下走过：左选区浮条 → 改写预览 → 确认替换；右栏选中 → 换落点 → 悬停闪落点 → 作为引用插入 → 确认 → 撤销；收进 Shelf（左→右）→ 改放到待办；一句话新建文稿；浏览器格选字 → 更多 → 说出要做什么 → 同一份候选；滚动时浮条与落点标记跟随；⌘. 进入、方向键、Esc 回到原处；手机上右栏 → 浮条 → 文稿预览。触屏只做了 375px 的触屏模拟；读屏只核对了名称与播报文案，没有用读屏软件走。
3. **真实产品实操**：无。产品代码未接入，没有在工作台里跑。
4. **用户本人验收**：无。两件决定已由统筹按规则代定（见下），不等于用户验收。

**W0 独有条件**（不替代原验收）：

| 编号 | 本轮条件 | 对原验收的关系 |
| --- | --- | --- |
| W0-01 | rules 模式、零真实模型 / 凭据 / Home 读写，模拟边界在界面上可见 | 隔离条件；不能替代 AC-P05 的外壳分支、隐私过滤、边界与覆盖门禁 |
| W0-02 | 点击、松手、助理交接共用候选函数；放进与创建两族交替占推荐位，窄时 2 个，去处类从不进「更多」 | AC-P01/04、AC-S06/07 的局部逻辑证据，不等于生产链路一致 |
| W0-03 | 预览冻结位置与版本；过期在变换前拒绝；重复提交只写一个版本；撤销只在文稿未被别处改动时以新版本恢复 | AC-P03、AC-S05 的局部状态证据，不等于网页来源与真实落点实操 |
| W0-04 | 模拟草稿不写；创建请求幂等；撤销 / 改放到不重复、不误删；提案类确认前不创建 | Q02/04/08 的局部状态证据，不等于声明联动、模型起草、刷新恢复 |
| W0-05 | 非法的创建、落点、位置与写入格式被拒绝 | W0 请求边界；不替代 Q05 的起草 / 提交失败后 UI 保留与重试 |

**原验收与本轮证据映射**（原文标准在第 12 节和三份子规格；下表没有任何一项宣布完整验收通过）：

| 原编号 | 本轮已证明（原型） | 未证明 |
| --- | --- | --- |
| AC-P01 | W0-02 单测；e2e 松手列表与点击列表一致；助理卡片列同一份候选 | 生产的浮条 / 拖放 / 助理同一次准备核对 |
| AC-P02 | 左选区与右栏五种来源的浮条 e2e 与实操 | 助理面板结果作为手上的东西、分屏与右栏 iframe 各自的文档 |
| AC-P03 | 预览前后文档字节比较、外部改动后拒绝、撤销恢复（e2e）；写到别处按声明直接 / 卡片 | 真实编辑器命令与 HTTP、插件声明决定执行方式 |
| AC-P04 | 去处类不进「更多」（单测、e2e） | 真实 Shelf DropAgent 动作栏与不重复陈列 |
| AC-P05 | W0-01 仅作补充 | 生产外壳无 `plugin_id` 分支、私密来源模型过滤、boundary、覆盖门禁 |
| AC-P06 | 无 | Coding 旁问、分叉与会话关系 |
| T01 / T05 / T06 | 选区上方出现、键盘进出与焦点可见、滚动跟随（e2e 与实操）；1440/1024/390、深色、减少动画（e2e 用 reduce） | 分屏、真实触屏、读屏软件 |
| T03 / T04 | 原型里只有一层浮条、底部无动作条 | 生产 Pages 迁移后的单层与助理面板并存 |
| T02 / T07 / T08 / T09 | 无 | 迁移一致、只声明即显示、工具清洗、既有 e2e 回归 |
| Q01 | Pages、Shelf、灵光三处 ✦，一行输入、同面板起草（e2e 覆盖 Shelf） | 声明驱动、无声明隐藏、插件停用联动 |
| Q02 / Q04 / Q08 | 直接创建与撤销、改放到、提案卡片确认前不创建（单测、e2e） | 最合适去处的真实判断、出处字段、刷新后恢复 |
| Q05 | 空输入、过期写入在面板里报错并保留内容 | 起草失败保留原话、提交失败保留卡片的生产路径 |
| Q03 / Q06 / Q07 / Q09 / Q10 | 无 | 日期提取、权限 / 隐私、内容站回归、批量、工作流 |
| AC-S01 | 六格顺序（e2e） | 底栏按钮合一、首开与记住上次那格 |
| AC-S04 / AC-S05 / AC-S06 / AC-S07 | 右栏五种来源、过期拒绝、无落点无放进、DOM 松手（e2e） | 真实网页画布选区、真实指针与原生拖放 |
| AC-S13 | 可删情境条、两处模拟交接列同一份候选 | 真实助理卡片与同一次准备 / 确认 |
| AC-S02 / AC-S03 / AC-S08 / AC-S09 / AC-S10 / AC-S11 / AC-S14 / AC-S15 | 电脑格不产生手上的东西、不是落点（产品里的格已在 main）；其余无 | 完整产品视图与入口、Shelf 功能、动态目录、停用、Manifest 检查、反向放置、助理材料位置 |
| AC-S12 | 三级证据分开记；两组标注样例在 `scripts/contextual-slice/w0-evaluation-cases.ts` | Jev 指标测量、真实场景、一骏本人验收 |

**已由统筹按用户的规则拍板的两件事**（2026-10-12，用户验收时可推翻；截图在本树忽略目录 `.impeccable/qa/review/context-w0/decision-*.png`，也复制在统筹的共享笔记目录）：

1. 首批「放进左边」：只做 Pages 的三个确定性动作（插入到光标处、替换选中的文字、作为引用插入），其余排第二批；理由、暂缓项与前置条件见 §14。
2. 网页与讨论消息的对象种类名：`browser_page`、`discussion_message`；否决 `web.page`、`im.message` 及理由见 §14。原型已改用新名。

**复现命令**（构建与 health 持 build 锁，e2e 持 browser 锁；预览端口 4290 写在本树未入库的 `.claude/launch.json`）：

```sh
pnpm install --frozen-lockfile --offline
pnpm build
node scripts/check-health-gates.mjs --base origin/main
node scripts/run-tests.mjs tests/context-program-slice.test.ts tests/contextual-interaction.test.ts tests/contextual-dock-parity.test.ts
node scripts/run-tests.mjs tests/context-program-slice.e2e.test.ts
pnpm exec tsx scripts/preview-contextual-interaction.mts --judge rules --home <隔离标识> --port 4290
```

历史：2026-10-11 的 W0 写在原作者的本机树（当时的路径与「未提交」状态见 git 历史），当时未构建、未运行浏览器；本节取代那份计划与记录。两组真实 Jev 评估与桌面原生拖出仍是欠缺的验证，动手前要统筹确认执行范围与凭据，不沿用历史授权。

### 16.3 本轮回归结果（2026-10-12）

下面的命令都在本树、最终代码上跑的，持对应的锁；工程通过、原型人工实操、真实产品实操、用户验收分开记，下一级不由上一级推出。

| 级别 | 命令或做法 | 结果 |
| --- | --- | --- |
| 工程 | `pnpm install --frozen-lockfile --offline`、`pnpm build`（合入 main 后、改代码前） | 通过，87 秒 |
| 工程 | `node scripts/check-health-gates.mjs --base origin/main`（改代码前与改完后各一次） | 两次都通过；`--update --base origin/main` 只降了本地快查的 `unknownCasts` |
| 工程 | `node scripts/run-tests.mjs tests/context-program-slice.test.ts tests/contextual-interaction.test.ts tests/contextual-dock-parity.test.ts` | 45/45（改代码前 42/42，新增 3 条切片用例） |
| 工程 | `node scripts/run-tests.mjs tests/context-program-slice.e2e.test.ts`（Chrome，1440 / 1024 / 390 三档加松手与六格两条） | 5/5（改代码前 4/4）；中途一次失败是实物缺陷（手机顶栏把主题按钮隐藏了），看截图时另发现深色切换写错了属性（截图其实是浅色），两处都已修，e2e 现在断言真的切到深色 |
| 工程 | 切片文件 `tsc --noEmit` 严格检查、Biome | 0 诊断；Biome 唯一两处是 main 上已有的 `scripts/contextual-slice/client.ts` |
| 工程 | `node scripts/affected-tests.mjs` 选出的门禁用例与 `pnpm boundary:check` | `affected-tests.mjs` 选出的 11 个用例文件（切片逻辑、文档引用、API 快照、`.impeccable`、kernel/contextual、lint、merge-base、spec 覆盖、表主人、测试引用、翻译）494/494；`pnpm boundary:check` 通过（`errors: []`） |
| 原型人工实操 | 内置浏览器、端口 4290（见 16.2 的路径清单）；e2e 截图写在忽略目录 `.impeccable/qa/review/context-w0/`（`selection-` / `landing-` / `created-` / `drop-` / `web-` / `message-`，1440、1024、390，浅色与深色）；两件决定另有 `decision-*.png` | 走通；触屏只做了 375px 模拟，读屏只核对名称与播报文案 |
| 真实产品实操 | — | 没有；产品代码未接入 |
| 用户本人验收 | — | 没有；两件决定由统筹代定，不等于用户验收 |

没做、有风险的：桌面原生拖出与应用内放置的分离（风险 §11 第一条，仍未验）；真实 Jev 的两组评估；右栏 iframe 格与分屏窗格里各自画浮条；浏览器格的真实画布选区；助理面板里的结果作为手上的东西；Pages 浮条工具里只放了加粗、斜体、格式菜单三项，真实迁移要把 Pages 的 14 个格式按钮、链接、评论都声明成工具（context-toolbar §7）。

### 16.4 交接分支的进度与防腐复查（2026-10-13）

按用户 2026-10-13 的决定，本线所有提交只进交接分支（#411）：W1-1…W1-8、W1-2、W1-6、W2-0 和 W2 都已并入（原 #429–#434、#445 已关闭，#446 的提交 `e67cd28e` 已在其中）。

| 日期 | 合入的 main | 结论 |
| --- | --- | --- |
| 2026-10-13 | `e7a51ff0`（#470）、`490251d1` | **通过，有三处记录。** 机器项：M1 `boundary:check` 无错；M2 健康门禁对照 merge-base 通过（`client.ts` 1148 行 < main 的 1151、`craft-finish.ts` −65、`editor-browser.ts` `mount` 变短；测试引用包内部没有变大）；M4 API 快照已重新生成（`dom-events` 删两项并给 `context-panel-open` 加 `cancelable`/`keep`，合同删两个常量，SDK 加 `ActionIntake`/`ActionAttach`）；M6 页面资源预算已降到实测（`workbench.js` −607 字节，三份样式表各 −8.1～8.5 KB，`pages-editor.js` −5.1 KB，`pages.js` 不增）；M8、M9 随健康门禁通过；M5 `action-contract-snapshot` 通过；M15 无密钥。人工项：第 1 条无兼容代码（读取、别名、迁移都没加）；第 9 条无新巨大单元；第 11 条合同只删不加；第 12 条两个事件和常量的消费者（Pages、总线、用例、文档）同一提交改完；第 13 条快照与预算都由工具重新生成；第 18 条所有 `CustomEvent` 已登记；第 20 条新文案的英文在 `plugin-components.ts`；第 21 条没有新的浏览器请求；第 26、27 条没有开新 PR、没有放宽门禁（门禁脚本、`limits.json`、`biome.jsonc` 未动） |
| | | **记录一：验收编号缺口。** 本 spec §19.4 的 W2-01、W2-02、W2-04、W2-05、W2-08 还没有证明它们的测试：W2-02（窗格里的浮条、悬停保位、Esc 记「忽略」）需要一条分屏用例；W2-04 改成了「等着的结果不丢」（§19.8），对应用例已在 `contextual-interaction.e2e`；W2-05（⌘K 打开链接面板）与 W2-08（开场建议报错改为提示条）待补。检查器目前只报告，不挡合并 |
| | | **记录二：两个近似的压缩函数。** 工作台的 `served()`（`apps/workbench/src/plugin-workbench.ts`，插件客户端脚本）和设计系统新增的 `compactScript`（情境脚本）做的是同一类事：去缩进与整行注释，后者还去空行。应并成一个（`served` 改用 `compactScript`，各插件资源再降一点），这会动所有插件的资源，留给页面资源门禁的主人 |
| | | **记录三：整个 `workbench.js` 还没过压缩。** 工作台脚本里的缩进与注释行占相当大一部分，对拼装 `workbench.js` 的那一处用 `compactScript`，整个资源可以少几十 KB；已用「空白压缩后的 esbuild 输出相同」验证过情境脚本和 Pages 脚本不改语义，别的脚本需逐个验证 |
| 2026-10-13 晚 | `fc18d5f6`（#471 Computer Use、#472 旧采用树）、`ee84a837`（#463、#473 文档）、`c33448f2`（#474、#475、#482、#483 测试改走公开入口与构建副本） | **通过，修了五处。** 机器项：M1 `boundary:check` 无错；M2 健康门禁对照 merge-base `c33448f2` 通过，比 merge-base 小的是巨大单元、`as unknown as`、Error 子类，本地快查已降；M4、M5 快照与源码一致（只有本线有意的合同变化：`ActionIntake`/`ActionAttach`、`SurfaceFocus.place/side_tab/screen`、落点、`ContextTools`、去掉两个只为写作菜单存在的事件）；M6 页面资源每个文件都不比 main 大，按实测降了预算（见下）。**修的五处**：① W1-4 回归：`plugin-sdk` 的 `context-declarations.ts` 遇到形状不对的声明（`null`、数字、错的 `subject_kinds`）会抛 TypeError，改成先按形状过滤，问题交给形状规则报告（`f86f85dd`，加回归用例 `0534f47d`）；② 新用例里一处 `as unknown as`（门禁按文件计数）改成先声明为 `unknown` 再断言一次（`fa762b97`）；③ 页面资源：合 main 后 `workbench.js` 比 main 多 6,230 字节——main 的宿主现在用 esbuild 压空白，原来的底栏代码缩进与注释多、压得多，本线的浮条已经是 `compactScript` 压过的，压不出新空间。查到 esbuild 默认把每个中文字符写成 6 字节的 `\uXXXX`，而资源按 UTF-8 发（3 字节），main 的 `workbench.js` 里有 17,851 个；宿主的 `tightenServedJs` 加 `charset: "utf8"`，程序与名字不变（新用例 `served-script-text` 经包入口证明），`workbench.js` 比 main 少 47,531 字节，每个插件包都变小（几个共享的大包各少约 22.9 KB）（`1f278d01`、`161ba540`）；④ 全量抓到 W2 弄坏的 W0 原型：W2 去掉了 Pages 编辑器句柄上的 `toolbar`，原型还在删它、读它，载入文档时抛错，右栏 Shelf 一条材料都不出；改成读 `tools()`、调 `runTool()`（`c24fb961`）；⑤ 电脑格不再写「只留位置」，改成说明 main 上 #471 的真实格（`541ff17f`）。人工 27 条对照本线 diff 通过；第 16.4 前两行的记录二、三已被 main 的 esbuild 压缩取代。 |

### 16.5 需求对照表的现状核对（2026-10-14，origin/main `393e8958`）

按 main 上的真实代码与测试，把第 13 节每一行标为「已实现（证据）」「部分」「未做」。只到工程证据；开发者实操与用户验收另记（第 16.2、20.1 节，均无新增）。

**一句话**：左边的浮条（W1、W2）已在 main，右栏改版（W2'）、右→左与落点（W3）、助理整合（W3）、创建入口与「✦」（W4）、拖放（W5）、Shelf 进池与左→右（W6）、F4–F13 与 Coding 的旁问、分叉（W7）都还没做；合同、SDK 声明、内核派生、起草服务这些底层已经在 main，等页面接上。

| # | 现状 | 依据（main 上的代码与测试） |
| --- | --- | --- |
| R1 | 未做 | Shelf 仍是 `navigator` 视图的插件（`plugins/native/shelf/src/manifest.ts`），底栏 `BAR_RESIDENT_IDS = ["shelf", "lingguang"]`（`apps/workbench/src/immersive-shell.ts`）。W2' |
| R2 | 部分 | 右栏有讨论、浏览器、文件、电脑与插件侧栏视图（灵光、Issue 声明了 `slot: "side"`）；Shelf 不在其中 |
| R3 | 部分（只有底层） | 落点类型 `SurfaceLanding`、`FrozenFocus.landing`（`services/contextual.ts`）、宿主读请求（`contextual-request.ts`）、内核 `attach` 候选（`kernel/src/contextual/destinations.ts`，`tests/contextual-landing.test.ts`）都在；没有页面报告落点，没有插件声明 `attach`，界面上不出现。W3 |
| R4 | 部分 | 右栏已有多格，但 id 与提示仍是群聊命名（`dock-window-im`、`data-dock-toggle="im"`、「侧栏：讨论、浏览器与文件」）。W2'-1（#694）改成通用名，§21.6 |
| R5 | 部分 | 左边：同一个池、Jev 排序、浮条陈列已在（`tests/contextual-interaction.test.ts`、`contextual-interaction.e2e`、`context-toolbar.e2e`）；右栏与助理面板还不报告手上的东西 |
| R6 | 未做 | 同 R1 |
| R7 | 未做 | 右→左（W3）、左→右（W6）都没有 |
| R8 | 已实现 | 候选只从目录派生（`packages/kernel/src/contextual.ts`、`destinations.ts`），Jev 只排序，失败按规则（`judgment-service.ts`）；`tests/contextual-destinations.test.ts`、`contextual-fragment-offers.test.ts` |
| R9 | 部分 | 同一池已在；范围字段 `places`、`ItemAttach.positions` 已进合同与 SDK 检查（`platform/item-intake.ts`、`plugin-sdk` 的 `context-declarations.ts`，`tests/plugin-context-declarations.test.ts`）；side 视图的 `objects` 没有；没有插件用这些声明 |
| R10 | 部分 | 浮条跟着左边的选区与分屏窗格（W2，`context-toolbar-panes.e2e`）；右栏、助理面板、拖放没有 |
| R11 | 未做 | W6 |
| R12 | 未做 | 同 R1 |
| R13 | 部分 | 记住上次那一格已有（`localStorage` 的 `molis:side-tab`）；默认仍是讨论格，格的顺序仍写死，不是 Shelf · 灵光 · 文件 · 浏览器 · 电脑 · 讨论 |
| R14 | 未做 | W2' |
| R15 | 未做 | 两组真实 Jev 评估要用户授权；只有标注样例（`scripts/contextual-slice/w0-evaluation-cases.ts`） |
| R16 | 部分 | Shelf 材料经 `shelf.files.entries` 出现在「文件」格；Shelf 格还没有 |
| R17 | 部分 | 关系登记在统一目录（W1-4 的 `intake`/`attach` 声明与检查）；只读关系视图没有 |
| R18 | 部分 | `skills/molis-plugin-dev/contextual.md` 一到六节（选区动作、`intake`、`attach`、浮条工具）；页面端辅助函数与落点（第七节「还没有的」）没有 |
| R19 | 部分 | 浮条三事件与三条窗格消息已登记（`dom-events.ts`）；`molis:surface-landing`、`molis:landing-at` 随 W3 |
| R20 | 未做 | 助理不从情境中枢取「手上 + 落点」，没有只读系统动作给助理同一份候选。W3 |
| R21 | 部分 | 情境条（W3-A2）带上手上的东西与正在看的对象；落点在对象已加入时出现、可 ×，发送时带给宿主、宿主经主人重读后告诉模型（W3-B2）；分屏窗格里的落点也一样（W3-B3） |
| R22 | 未做 | W3 |
| R23 | 部分 | 助理回复里选中的一段是手上的东西（`assistant_reply`，`place: "assistant"`），能放进左边的落点（BL-150）；点结果小片还不算 |
| R24 | 部分（按设计成立） | `intake`/`attach` 写在普通写入动作上，工作流与 MCP 天然可用；Todo、灵光已声明 `intake`（W4-1） |
| R25 | 未做 | W2' |
| R26 | 部分 | `attach` 带 `positions` 已在 SDK；材料篮 = Shelf 没有；「四份文档一个 PR」已由用户 10-13 的规则取代（每线一个交接分支，现在按波次开 PR） |
| C1 | 已实现 | 浮条取代底栏、与 Pages 格式条合并（#411）：`context-toolbar.e2e`、`contextual-interaction.e2e`、`context-toolbar-panes.e2e`、`pages-actions.e2e` |
| C2 | 部分 | 手册已有（`contextual.md`）；存量插件补齐与「待补」名单没有 |
| C3 | 部分 | 起草服务与 SDK 的 `intake` 声明在；Todo、灵光已声明（W4-1，`tests/contextual-create.test.ts`）；Pages、Inbox、Goals 与「✦」没有。W4 |
| C4 | 部分 | 内核把去处排进推荐位（`destinations.ts`）；只有规则时一段文字放一个（W4-1，`contextual-destinations.test.ts`）；按内容挑去处要判断 |
| C5 | 未做 | W7 |
| C6 | 未做 | W7 |
| C7 | 已实现 | 单行、打字不浮出、底部动作条删除（#411）：`context-toolbar.e2e` |
| C8 | 已实现 | `ContextTools` 合同、Pages 的 14 个工具（`plugins/native/pages/src/client.ts`）、`contextual.md` 第六节 |
| C9 | 部分 | 「去处只进推荐位」的内核规则已在并有测试；「✦」没有 |
| C10 | 部分 | 浮条选创建入口时按 `undo` 直接建或出卡片（W4-1，`contextual-create.test.ts`、`contextual-todo.e2e`）；「✦」与追加没有 |
| C11 | 已实现 | 「记成待办」「记下灵光」并进创建入口，旧的片段动作选项删掉（W4-1）：`contextual-create.test.ts`、`contextual-fragment-offers.test.ts` |
| C12 | 部分 | 已做的部分随代码写了手册；W3 起随各波 |
| C13 | 未做 | 覆盖率门禁骨架挪到插件开始声明 `intake` 之后（第 18.7 节 W1-8） |
| C14 | 部分 | F1 的底层（起草、声明）在；F2–F13 没有 |
| C15 | 部分 | 已实现的部分守住了：判断与起草过 `redactText`/`screenInbound`（S-13），仅本人可见的种类不进判断（`judgment-service.ts` 的 `privateObjectKinds`），浮条 `mousedown` 不抢焦点；`LOCAL` 动作还没有走到浮条 |
| C16 | 已实现 | 六项待核对已于 2026-10-09 核对（第 15.4 节） |
| K1 | 部分 | Coding 转录的选字走通用选区路径、浮条出现（转录是 `coding_session` 对象）；Coding 专属的去处（放进下一轮、补充这一轮、放进输入框、新开会话、收进 Shelf）都没有 |
| K2 | 未做 | W7 |
| K3 | 未做 | W7 |
| K4 | 未做 | 只在设计里写了交叉关系 |

**PR #180（`feature/context-toolbar`，head `7748613e`，10-09 以来没动、与 main 冲突）**：它的四份 spec（总纲、context-toolbar、side-shelf、quick-create）在 main 上都有更新的版本（#411、#494 带进来的，带 W0–W2 的进度），main 的版本取代它。main 上没有的只有三样：两份 `goal-prompt.md`（总纲第 11 节第 3 条与 15.7 节已写明它们是历史安排，由统筹的交接文档取代，完成标准已并进本节与第 12 节）；`specs/README.md` 的旧索引行（main 的更新）；`specs/coding-plugin/next-requirements.md` 的三行出处（C1、C4 的入口、D3 共用右栏浏览器，用户 2026-10-02 定）——这三行随本线下一个 PR 补进 main。**建议关掉 #180**，不合并（已发统筹，由统筹关）。
