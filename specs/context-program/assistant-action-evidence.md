# 助理动作推荐的验证与暂停记录

原 §21.6–21.7。保留每项证据、用户决定的暂停点和未做事项。

[返回需求书](spec.md)

- [21.6 进度与证据](#216-进度与证据)
- [21.7 暂停点（2026-10-14，用户：需求线暂停，整机让给防腐线）](#217-暂停点2026-10-14用户需求线暂停整机让给防腐线)

## 21.6 进度与证据

- 2026-10-14：现状按代码核对（21.1）；方案与切片（21.2）；切片在内置浏览器 1440 浅色、375 深色走过五步（选区 → ✦助理 → 记成待办由下一步确认 → 下一步里直接答题 → 回复里选一段放进左边光标处），窄屏时下一步移到输入框上方、页面无横向滚动。**真实产品走查未做**：整机构建锁被 #489 的最终验证（构建 + 全量）占着，本线的构建排在后面；构建后在隔离 Home（脚本模型产生真实的操作卡与问卷卡）补走查与截图，写回本节。
- 2026-10-15 W3-A1 实现（分支 `context/assistant-flow`，并入 main `e8218714`）：
  - 宿主：`assistantStepRow`（`apps/local-host/src/assistant/assistant-view-html.ts`）用 `interactionNextSteps` 派生全部下一步——复核卡、问题、操作卡、「去核对」、等你的子任务、结果、再试一次——画成 `next_html`（前三个加「还有 N 项」）与 `next_all_html`（展开后全部）。
  - 页面：新文件 `apps/workbench/src/scripts/client/assistant-step-row.ts` 把这一行放在输入框正上方，按下时点对话里那条记录自己的控件（卡的执行键；题的选项再点提交；其他只带到记录处）；卡上有没交的改动、选项不在或按钮不可用时只带到卡上。卡执行后重读一次工作，下一步跟着宿主的记录走（FLOW-04）。
  - 删掉：A10「接下来」、A11 概况与顶部条带的「去…」按钮、A7 建议条（连同 #489 页脚名单里的 `.assistant-offer`，换成 `.assistant-next-row`）、底部小片里「等你…」的一半。`assistant-island.ts` 净减；页面资源四个文件都不大于 main（预算已按实测降低）。
- 工程验证：`pnpm build`；`tests/agent-next-steps.test.ts`、`tests/interaction-components.test.ts`、`tests/assistant-interaction-html.test.ts`（新增 FLOW-04/05 行的用例）与 design-system 必跑用例通过；`check-health-gates --base origin/main`、`page-assets --base origin/main` 通过；`affected-tests` 选出的单元用例与 Assistant 相关的浏览器用例见 PR。全量按统筹的安排上 CI（`full-suite` 标签）。
- 真实场景验证（隔离 Home，脚本模型出真实的问卷卡与操作卡，`walk-serve.mts`）：两题问卷 →「去回答（2 题）」带琥珀点，按下落到卡上；单题单选 →「团队（推荐）」「只给经理」，按一下即交回答、这一轮接着做完（记录里「你的回答：团队」）；操作卡 →「记成待办：整理周报」，先改字段不提交时按下只带到卡上、卡仍是 ready，撤回改动再按即执行、卡变 done；页面建议 →「侧栏浏览器的建议」。1440 浅色 / 深色、1024、390、主区展开各截图，证据在统筹共享笔记 `contextual-line/w3a1/`。走查中发现并修掉两处：卡执行后下一步仍显示它（改为执行后重读工作）；390 宽时次要样式透明、页面内容透出（这一行的按钮改为纸色底）。
- 浏览器用例（本机，`run-tests` 自取 browser 槽）：Assistant 相关的 14 个文件第一轮 13 过；`tests/touch-targets.e2e.test.ts` 失败——通知卡的「知道了」只有 28px（下限 32），因为通知借用了 `.assistant-offer-actions`，样式随建议条删了。基线工作树（`e8218714`）同一文件 4/4 过，确认是本线引入；改为通知自己的 `.assistant-notice-actions` 后 4/4 过。390 宽时触控按钮 44px，这一行先与面板重叠 2px，后来只差 4px。现在面板让出的高度是一个变量，这一行在时取 48px，触控时面板底边与这一行至少隔 8px（统筹 10-15 复查第 5 条）。窄屏（≤600px）时，这一行所在的整条带（从面板底边到输入框）铺底栏同色的实底，页面内容不再从缝里和按钮之间透出来（统筹 10-15 复查补充）；宽屏仍是 8px 以上的缝。`assistant-strip-narrow` 在 800 宽量这段间距，在 390 宽量这条带是实底、不压面板。实底的字节靠删掉没有元素用的 `.tab-menu` 选择器（6 处）抵消。
- 触控尺寸：`tests/touch-targets.e2e.test.ts` 的面板一组补回普通下一步的覆盖。原先量的 `[data-assistant-next]`、`[data-assistant-strip-next]` 已随元素删掉；现在用宿主的 `renderInteractionNextSteps` 画出等你、普通与「还有 N 项」三种按钮放进这一行，一起量 44px（统筹 10-15 复查第 2 条）。
- 页面建议「改宽度后消失」已复现并修掉（统筹 10-15 复查第 3 条）：
  - 复现：在 1300、1200、1300、600、520、600 宽各量一次，每次改宽度，岛都重画这一行，并把建议按钮拆掉重建一个，进场动画从透明重放。窗格不在前台时动画停在第一帧，按钮就是透明的；前台时则每次重画闪一下。
  - 修法：一条建议从出现到被点掉只用一个按钮，重画时原样留着（`assistant-step-row.ts`）。
  - 用例：`tests/assistant-strip-narrow.e2e.test.ts` 新增一条，在 1200、1300、600、520、390、1300 宽检查仍是同一个按钮、不透明、在窗口内。
  - 不加 BACKLOG。
- 防腐复查（清单 `ANTI-CORRUPTION-REVIEW.md`）：2026-10-15 · 并入 main `414f61b4` · merge-base `414f61b4` · 通过，无暂缓项。
  - 机器检查：M1、M2、M4、M5、M6、M8、M9、M10、M15 全过；M7 本线改动的文件里没有 Biome 告警；api 与 actions 快照无变化。
  - 人看的条目：逐条结论写在 PR #536「防腐复查」节。
  - 删掉的旧「接下来」：`drawAssistantReply` 里只放在最新一轮下面的 `next_html`（标题「接下来」），以及岛内画它的 `[data-entry="next"]` 一段。
- 用户验收：待用户验收。
- 2026-10-15 W3-A2 实现（分支 `context/w3a2-strip`）：
  - 情境条：新文件 `apps/workbench/src/scripts/client/assistant-context-strip.ts`，并进岛的脚本；样式进 `craft-finish.ts`。小片依次是：正在看的对象（已加入是实线，可 ×；没加入是虚框，写「没加入」，点「＋」加入）、它未保存的修改、同一对象已有的工作（「→ 标题」，一点切换过去）、页面选区、你加的文件与引用、交接放进来的东西。面板开着、输入框或情境条有焦点、或者有人放进了东西时才显示；只是页面上有对象或选区，不在页面上方冒出来。位置在下一步那一行之上，面板再让出一行（`--context-row`）；窄屏铺底栏的实底；主区展开时随页脚走。
  - 删掉：输入框里的「材料」按钮与弹层（A14）、聚焦输入框弹出的开场建议（A5）、侧栏材料块里重复的小片、浮条菜单的「说出要做什么」、没人再用的样式（`.assistant-material*`、`.assistant-chip*`、`.assistant-materials-*`、`.assistant-starter--*`）。「/」「@」仍用原来的弹层。
  - 删掉的入口去了哪里：材料在情境条；开场建议与「继续最近的工作」在新工作的空白对话里（原本就有）；「发给…更改」在侧栏「这项工作」；同一对象已有的工作在情境条上。
  - 规则：岛的 `pageObject()` 只在对象已属于当前工作、或人点了「＋」时算加入（原来新工作一律算）；宿主不改（`assistant-service.ts`、`assistant-inputs.ts` 未动），没加入就不带 `context.object`，`linkSent` 也就不记关系。
  - 验收编号：STRIP-01（「＋」的两面：没加入时模型的请求里没有「正在看的对象」、对象下面没有工作；加入后两者都有，关系是 `origin`）、STRIP-02（✦助理：选段进情境条、输入框为空且有焦点、不再提供同一文档的虚框小片；发送后模型读到选段、文档下面记着这项工作，关系是 `material`），在 `tests/assistant-context-strip.e2e.test.ts`。
  - 交接（页面的 `delegate`、`molis:assistant-open`）：带材料的，材料带上它来自的对象；只带对象、不带材料的，对象本身作为一份材料放到手上，工作因此挂在它下面（不再靠「正在看」）。同一份东西再交一次（比如上一次发送没成功、材料还在手上）只放一份。
  - 情境条的钩子是 `data-assistant-context-strip`，与面板里已有的状态条 `data-assistant-strip` 分开。
  - 页面资源：`molis-work-workbench.js` −4432 B，三份样式表各 −2578 B，`plugins/todo.js` −140 B。
  - 遗留（本线负责，W3-B2 或单独小片处理，不是本 PR 引入的）：390px 下助理面板开着、页面又有选区时，选区旁的浮条（`context-toolbar`）盖在面板上，几个标签挤在一起。（W3-B2 已修，见下一条）
- 2026-10-16 W3-B2 实现（分支 `context/w3b2-landing-strip`；方案与前后截图在统筹的共享笔记 `contextual-line/w3b2-ui-proposal.md`，三项决定见 21.5 L-1～L-3）：
  - 页面：情境条听 `molis:surface-landing`（只多一个监听者，不新增事件），对象已加入时在最后多一片铜色浅底的落点小片；发送时岛把有界的落点放进 `context.landing`。Pages 的落点报告填上 `heading_path`（`landing-editor.ts`）。
  - 合同：`AssistantContextSnapshot.landing?`（`AssistantLanding`），可选字段，旧调用方不受影响；`pnpm api:update` 已刷新快照。
  - 宿主：新文件 `apps/local-host/src/assistant/assistant-landing.ts`（有界检查与这一轮的材料）；H3 的 `horizontal/search/src/references.ts` 多导出 `readReferences`（`confirmReferences` 改由它派生，同一份主人读取），`search-actions.ts` 的 `SearchHost` 加同名方法；`assistant-service.ts` 只在两处已有的行上加调用，净减一行。
  - 浮条：`context-bar.ts` 的命中测试与面板收起后回来（`MutationObserver` 看两种面板的 `hidden`）。
  - 页面资源（只减不增，同一个 PR 里删代码抵消）：`molis-work-workbench.js` −30 B，`molis-work-pages-editor.js` −27 B，三份样式表各 −9 B。删掉的是已经没有元素的旧代码（仓库里没有任何地方再产出这些属性，几处测试本就断言它们不在页面上）：Goals 目录里的搜索框（`[data-tree-search]`、`[data-personal-search]`）的监听与状态、刷新时替换「归档」「回收站」链接（`[data-archive-link]`、`[data-trash-link]`）、`[data-close-work-planning]`、`[data-open-goal-tui]`、`[data-immersive-theme]`、`[data-feed-directory-title]` 的处理，以及选择器里的 `[data-risk-*]`、`[data-artifact-select]`；情境条的 `[hidden]` 规则（元素没有别的 `display`，浏览器自带的规则已经藏起它）；Pages 的落点改用 `focus.ts` 已有的 `headingPath`，不另写一份。
  - 验收编号：STRIP-04（没加入时没有落点；加入后出现，名字是标题加位置词；× 只去掉落点，对象照旧、模型不再看到落点）、STRIP-05（模型看到落点的事实；对象被主人删掉后，这一行没有）、CTX-COVER-01（390 与 1440 下，面板盖住选区时浮条不出、收起后回来），都在 `tests/assistant-context-strip.e2e.test.ts`。
  - 顺带看到、不在本片：助理回复里的选区还不算手上的东西（DOM 选区读取排除了 `[data-assistant-island]`），所以「从回复里选一段放进左边光标处」没有接上，记在 BACKLOG BL-150（排在 W3-B3 之后，统筹 10-16 定）。
- 2026-10-17 W3-B3 实现（分支 `context/w3b3-pane-landing`，叠在 W3-B2 上，按 B-6）：分屏窗格里的 Pages 也是落点。
  - 窗格往上：窗格文档把自己的 `molis:surface-landing` 去掉 `screen` 后发给顶层（`workbench-surface-landing`）；顶层照现有窗格消息的写法核对（同源、来源窗口是某个 `iframe[data-pane-owner]`），在那个 frame 上重新发 `molis:surface-landing`，`pane_id` 取窗格名，所以情境行与情境条照读，不另写一套。窗格关页时报 `null`。不是窗格发来的落点一律丢掉。
  - 往下与执行：选了 `attach.` 候选后，顶层照旧先 `prepare`，再把准备好的选择交给落点所在的窗格（`workbench-context-attach-chosen`，带一次性记号）；窗格在自己的文档里发 `molis:assistant-context-action-chosen`，Pages 在窗格里的落点处预览。确认时窗格请顶层执行（`workbench-context-attach-run`），只有收到记号的那个窗格能用它、只用一次，顶层用排序时的落点调 `/api/contextual/attach`，把结果回给窗格。宿主照旧两道检查（`confirmReferences`、Pages 比版本）。没有页面接手就照旧提示「左边的内容已经换了」。
  - 情境条：只由报告它的那一页收回落点（分屏时窗格和旁边的页面各报各的，一页报 `null` 不再清掉另一页的）。
  - 窗格消息的检查只写一份（S-30，统筹 10-17 定加行）：新文件 `pane-messages.ts`（`PANE_MESSAGES_SCRIPT`）给出「是哪个窗格发来的」「是不是外面那一页发来的」与「记号只给那个框、只用一次」，`context-bus.ts`、`context-landing.ts`、`context-actions.ts` 的窗格一侧与 `tab-workspace.ts` 的窗格消息监听都先过它。顺带收紧：「打开设置」（`workbench-open-settings`）以前收任何同源窗口发来的，现在只收窗格发来的（只有窗格发它）。`tab-workspace.ts` 窗格一侧原来有两个 `message` 监听（Goal 视图；Feed 任务与新增），并成一个，各自的来源检查只写一次，这个巨大单元的行数与 main 持平。拒绝用例是不开浏览器的 `tests/security-invariants-pane-messages.test.ts`，进 `pnpm test:security`。
  - 写在 `context-landing.ts`（顶层与窗格各一段）；`context-bus.ts` 只变短（窗格检查换成一行），`assistant-island.ts`、`client.ts` 不动。
  - 验收编号：PANE-LAND-01（窗格里留下光标 → 顶层收到带窗格名、不带 `screen` 的落点 → 右栏选一句「插入到光标处」→ 预览在窗格里、顶层没有 → 放进去、存下）、PANE-LAND-02（不是窗格的窗口发来的落点被丢掉），在 `tests/context-landing-panes.e2e.test.ts`。
- 2026-10-17 BL-150（分支 `context/bl150-reply-in-hand`；对象种类与 id 统筹 10-17 定）：助理回复里选中的一段成了手上的东西，能「插入到光标处」放进左边。
  - 对象：助理是唯一的主人。回复的气泡带 `data-assistant-context`：`plugin_id: "assistant"`，`object: { kind: "assistant_reply", id: "<work_id>:<run_id>:<turn_id>", title }`。`run_id` 与 `turn_id` 是宿主给这一轮、这一句的 id（`turn_id` 每一轮各自编号，所以带上 `run_id`），刷新后不变，不是页面上的序号或时间；`title` 是工作现在的标题，由助理给，不从页面文字取。
  - 种类不登记：现在登记对象种类的只有插件搜索来源的 `search_source.kinds`，助理没有搜索来源。这个 id 也不在别处解析：放进左边时宿主只重读落点对象（`confirmReferences`），写进 Pages 的只有文字（「作为引用插入」另写出处标题）。
  - 读选区（`context-actions.ts` 的 `own()`）：助理面板里只有回复的字算手上的东西，输入框、情境条、按钮和人自己的话都不算；位置照 W3-B1 已有的写法从元素得出 `place: "assistant"`。助理自己找「正在看的页面」时跳过面板里的回复（`pageCtx`）。
  - `assistant-island.ts` 不变大：斜杠菜单里「方法」与「能力」两段一样的按钮代码合成一个 `pick`，净减 5 行。种类名 `ASSISTANT_REPLY_KIND` 只在合同 `services/contextual` 定义一次，岛与测试都取它（统筹 10-17）。
  - 验收：`tests/context-landing-reply.e2e.test.ts`（BL-150、AC-S15）：回复的 id 由工作、轮次、句子组成，刷新后相同；人自己的话选中不出东西；回复里选一段，「插入到光标处」先在 Pages 光标处预览，「放进去」写入。
- 2026-10-17 W3-A3a 实现（分支 `context/w3a3a-card-in-work`；方案与两条条件统筹 10-17 定）：§21.2 第 5 条，浮条或开场建议选的写动作，卡片放进你正在做的工作。
  - 判断：页面准备好卡后发登记过的请求 `molis:assistant-card-target`（`context-card-target.ts`，同步派发，只认第一次回答，只收字符串或 null）。助理在 `assistant-work-objects.ts` 里回答：面板开着、当前工作是助理自己的（不是 Coding）、且这项工作「拿着」这个对象时，回当前工作的 id。「拿着」只有一条规则，就是情境条用的那条：工作自己的对象（助理的 relation 行，随工作视图读来），或人在情境条里按 + 加入的。没人回答（没有助理、面板关着、对象不属于它），照旧新开一项。
  - `work_id` 只是指针：宿主 `offerFromPage` 本来就只认本人的工作（按服务自己的 actor 查，不从输入取身份），已归档、Coding 的、别的项目的都拒；这次补上这四种拒绝的测试（`tests/assistant-business-gateway.test.ts`「W3-A3a」）。
  - 放进当前工作后，`molis:assistant-open` 让正在显示的工作重读，卡片马上出现，不用等轮询。
  - 不变大：岛把对象与工作的几样（`objectKey`、`belongsToWork`、相关工作的缓存）搬到新文件，净减 8 行；`context-bus.ts` 把行与开场建议两处一样的选择处理合成 `settle`，净减 1 行。`molis-work-workbench.js` 比 main 小 3,210 B：删掉没有任何渲染方的客户端代码（`.mobile-switch` 与 `[data-mobile-target]`、`[data-mobile-directory-root]`、`[data-timeline-filter]`，渲染方自 `bc79f8a49` 起就没了；证据表在 PR 里），留下的 `.mobile-switch` 样式交给样式表切片。
  - 验收：`tests/assistant-card-target.test.ts`（没人回答、只认一次、助理何时回答）；`tests/context-card-in-work.e2e.test.ts`（面板关着新开；面板开着且工作拿着文档时放进同一项并马上显示；再关上又新开）。
- 2026-10-17 W3-A3b 实现（分支 `context/w3a3b-pick-flash`，叠在 W3-A3a 上；方案与六条条件统筹 10-17 定）：§21.2 第 6 条的后一半，结果卡片可以拿起，悬停放进去时落点闪一下。
  - 拿起：结果块里还读得到的结果（`current`、`changed`）卡片可以聚焦（`role="group"`，`aria-label`「拿起：标题」）。点卡片、或聚焦后按 Enter / 空格，整个对象成了手上的东西：`molis:surface-focus`，`plugin_id: "assistant"`，`granularity: "object"`，对象与唯一的 `object` 目标取结果自己的 `subject` 与标题，`screen` 是卡片的矩形；位置照已有的写法得出 `place: "assistant"`，浮条贴着卡片。拿着的卡片 `aria-current="true"`。只有标题打开对象（标题按钮原来盖住整张卡的 `::after` 对这种卡片去掉），卡上的按钮照旧；在卡片里选字后松手是在读，不拿起。Esc（同一张卡）或在卡片与浮条以外按下就放下，同一张卡发 `null`；一次只拿一个。已经拿着的卡再点、再按 Enter 或空格，换一个新的 `context_id` 再给出一次（浮条按 Esc 收起、或因重建放手后，靠它回来），卡片仍在手上，和选中文字时 Esc 只收浮条的做法一致（统筹 10-17 审）。不在了、读不到、搬走的结果不能拿。代码在 `assistant-work-objects.ts`，岛只在结果块调用一次，行数不变。
  - 闪一下：浮条上悬停或聚焦一个放进去的候选（候选来源是 `attach`）时，顶层把登记过的请求 `molis:surface-landing-flash` 发在报告落点的那个元素上；每次移入或聚焦算一次，同一个候选一直停着不再发；浮条在指针每移过它的一部分时都报一次手上的键（`context-toolbar.ts` 的 `pointerover` 不再只认 `[data-key]`），所以移到按钮之间再回来也算一次新的移入。落点不是本页的（窗格的）、元素已不在或不在本文档，就什么都不发。Pages 拥有这次闪（`landing-editor.ts`，页面状态主人 `pages-landing`）：光标或末尾处一条铜色竖线，选区用 CSS 自定义高亮衬一层浅底，不盖字；正在闪时不再闪；要求少动画时不闪。
  - 资源不变大：`molis-work-workbench.js` 比 W3-A3a 小 19 B，`molis-work-pages-editor.js` 小 11 B；三张卡片节点视图的三段模板并成一段、编辑卡片的两个确认合成一个；删掉没有渲染方的代码（`[data-plugin-expand]` 的开合与它存的 `directoryCollapsedSections`、`.plugin-stack` 选择器与开场动画、`.topbar` 的 `data-mobile-surface`、Goal 正文里的 `.desktop-pane-header`、`.mobile-switch` 的样式），证据表在 PR 里。
  - 分屏窗格的落点闪、「更多」菜单里的放进去闪，在 W3-A3c 做了（见下一条）。
  - 验收：PICK-01（点卡片或 Enter / 空格拿起整个对象）、PICK-02（标题打开、按钮照旧、选字不拿）、PICK-03（Esc 或按在别处放下，按在浮条上不放，一次一个）、PICK-04（不在、读不到、搬走的不能拿）、PICK-05（已拿着的再拿一次换新的 context 再给出，浮条收起后回来），在 `tests/assistant-pick.test.ts`；FLASH-01（悬停或聚焦放进去时落点闪一次，正在闪不再闪，移到按钮之间再回来再闪）、FLASH-02（落点已不在：不发、不报错）、FLASH-03（拿起的结果放到光标处：先预览、确认才写入），与 PICK-01 的键盘与鼠标两条路、PICK-05（浮条 Esc 收起，再按 Enter 回来），在 `tests/context-pick-result.e2e.test.ts`。
- 2026-10-17 W3-A3c 实现（分支 `context/w3a3c-flash-panes-menu`，叠在 W3-A3b 上；方案与两条条件统筹 10-17 定）：分屏窗格的落点也闪，「更多」菜单里的放进去也闪。
  - 菜单：菜单项带 `data-key`，指针移入、移出或焦点进入菜单都报一次手上的键，和浮条本身一样。浮条另给一个 `pointed()`（浮条上的键加菜单里的键）只用来闪；`pinned()` 的意思不变（浮条上那三个按钮里悬停或聚焦的，随下一次判断发给宿主，`planContextualLayout` 只用它给 `primary` 保位），菜单项不算进去（统筹条件 1）。
  - 窗格：落点是窗格报告的（`pane_id` 不是本页）时，顶层不在本页发 `molis:surface-landing-flash`，而是给那个窗格的框发窗格消息 `workbench-surface-landing-flash`：只发给 `landing.element` 这个还连着、在本文档里的 iframe，目标 origin 是 `location.origin`；窗格一侧先过 `panes.fromParent`，再在报告落点的那个元素上（还在就）发这个请求，由 Pages 照旧画（统筹条件 2；消息登记在 §19.3 第 2 条，S-30 加了一行拒绝用例）。
  - 大小：浮条程序 13,883 字（上限 13,900）：去掉被 `pointerover` 包含的 `pointerenter`，焦点进出时「在浮条或菜单里」的判断合成一处 `inside`。顶层的转发不另看 `pane_id`（落点元素是 iframe 就转给它，否则在本页发），也不再查元素是否在本文档（它总是本文档上听到的事件的目标）。删掉没有发送方的窗格消息处理 `workbench-feed-add`、没有产出方的 `.project-settings-hub`（选择器与样式；两者的另一半都在 `fe9f98064` 里没了）。`molis-work-workbench.js` 仍比 W3-A3b 多 318 B，两份样式表各少 149 B；抵不下的数字已报统筹，预算不由本片调。
  - 还没做：手上的东西在窗格里时浮条画在窗格自己的文档里，那里悬停放进去还不闪（窗格的 `workbench-context-hold` 只带 `pinned`，顶层不据它问落点）。
  - 验收：PANE-FLASH-01（落点在分屏窗格：悬停浮条上的「插入到光标处」，窗格画出闪线，顶层不发）、PANE-FLASH-02（窗格自己发、窗格里别的框发的「闪一下」都不闪）、MENU-FLASH-01（「更多」菜单里同一项悬停也闪；菜单项在 `pointed()` 里、不在 `pinned()` 和发给宿主的 `pinned` 里），在 `tests/context-landing-flash-panes.e2e.test.ts`；S-30 的拒绝在 `tests/security-invariants-pane-messages.test.ts`「S-30 a pane shows its landing only when the page around it asks, from this origin」。
- 2026-10-17 W2'-1 右栏本身（分支 `context/w2p-shelf-side`；分片：W2'-1 右栏本身，W2'-2 Shelf 成为第一格、「常开插件」声明（`always_on: true`）、窄宽度版式、旧入口改道，W2'-3 桌面入口与文档）：
  - 底栏右侧只剩侧栏按钮（`data-side-toggle`，提示「侧栏：Shelf、灵光、文件、浏览器、电脑与讨论」）；Shelf、灵光两个常驻按钮与 `BAR_RESIDENT_IDS` 删掉，点按钮只发 `molis:side-open` / `molis:side-close`，不再另开一套窗口状态。
  - 群聊命名直接换掉、不留别名（side-shelf §7）：面板 `id="side-panel"`，讨论框 `data-side-body="discussion"`；`data-dock-window`、`data-dock-frame`、`data-dock-toggle`、`dock-window-im` 全仓只剩历史原型与 spec 的对照记录。GLOSSARY 的 R-A10（`im` 指整个右栏）一并删掉。
  - 格的顺序由声明决定：平台格带 `order`（文件 20、浏览器 30、电脑 40、讨论 50），插件侧栏视图的 `order` 原样带进来（灵光 10，没写的 100），一起排序，不写名单。默认格是排在第一的那格；W2'-2 Shelf 声明 0 后自然成为第一格、首次打开就在它。
  - Dock 里 Shelf 与灵光的钉子原来因常驻固定按下，现在是普通钉子（DOCK-04 测试随之改；Shelf 的钉子在 W2'-2 随 Shelf 离开插件列表一起消失）。
  - 页面资源只变小（数字见 PR）；`assistant-island.ts`、`client.ts`、`context-bus.ts` 不动。
- 2026-10-17 W2'-2 Shelf 成为右栏第一格（分支 `context/w2p2-shelf-always-on`，叠在 #694 上）：
  - Manifest 新增 `always_on`（v2，布尔）：SDK 解析，Plugin Runtime 在安装和确认升级时拒绝非内置的声明（S-34，`tests/security-invariants-always-on.test.ts`）；项目移除时拒绝（`catalog.plugin_always_on`），市场与插件切换跳过，旧的隐藏存值不再生效。
  - Shelf 只剩一个界面面 `side`（`order: 0`，第一格）；工作区的 Shelf 舞台、目录与工作台里为它写的路径删掉。样式改成填满格子：窄时目录全宽、打开一项盖住目录并带返回，容器 ≥ 640px 时目录 213px 留在左边（容器查询，不看视口）。
  - 存值：保存的标签状态里点名 shelf 的，工作区回到项目首页一次（现有的通用处理）；Dock 里存过的 shelf 钉子渲染时跳过，存值不改。
  - 统筹 10-18 定的四项（同一个 PR，各一个提交）：
    - `openPlugin` / `open.surface` 指插件，位置由声明决定：只有侧栏视图、没有工作区面（`workbench.main`、`workbench.directory`）的插件，打开时落到它的侧栏格（`sideOpenedPlugins`，`apps/workbench/src/plugin-catalog.ts`；页面上只有 `openPluginInSide` 一处，不写 `shelf`）。三处存值（动作链接、搜索索引的 `open_json`、助理通知的 `open`）不改写，各有一条点开落到那一条的用例（`tests/shelf-side-links.e2e.test.ts` SHELF-LINK-01～03）；用不是 Shelf、只声明侧栏视图的假插件证明规则通用（OPEN-PLACE-01）。
    - 侧栏文档把登记的落点事件（`molis:placement-convert`、`-request`、`-result`，名单只在 `SIDE_FORWARD_SCRIPT` 一处）转给页面；页面只收同源、来源窗口是侧栏插件格框架的消息，名单外的名字丢掉（S-30 扩展，`tests/security-invariants-pane-messages.test.ts`、SIDE-FWD-01）。
    - 图片「放进 Shelf」经宿主路由调 `shelf.items.admit`（定义只在合同里一份，`SHELF_ADMIT_ACTION`：Shelf 按它注册，图片按它调用，不转型），`molis:shelf-admit` 从登记表删掉；放好后出一张落点卡片，从卡片的「打开」进 Shelf 格（不自动打开）。
    - 侧栏格按条目打开：`molis:side-open` 带 `target {item,title}`，侧栏对已载入的格框架以本页源发 `molis:side-target`，格文档按同一检查收下后在自己的工作面上发 `molis-work:select-item`；工作台不读条目 id。
- 2026-10-18 W2'-3 桌面入口（分支 `context/w2p3-desktop-entries`，叠在 #701 上；统筹 10-18 认可计划并定两处做法）：
  - 热键、菜单栏打开 Shelf 只说插件名：`molisWorkOpenShelf` 调页面的 `molisWorkOpenPlugin("shelf")`，它就是工作台的 `openPlugin`，判断仍只在 `openPluginInSide` 一处；不写死格名，不加 focus（原来点插件列表时也不移焦点）。热键脚本里点插件列表的兜底删掉。
  - 壳从顶层文档（不是框架）报「右栏开着且选中的是 Shelf 格」时那一格的矩形：现成的 `shelf_surface_changed` 把 `active` 换成 `panel`（CSS 像素，内容区左上为原点）；矩形先经 `reported_panel` 检查，轮盘命中只用 `over_reported_panel`（S-14 表与 `tests/security-invariants-desktop-ipc.test.ts` 同步，Rust 用例 `s14_…`）。热键的显示/隐藏开关以「Shelf 格正在显示」为准。
  - 页面顶部的插件说明（`STAGE_SUMMARIES`）按工作区面取，只开在右栏的插件没有工作区面，按同一条规则（`sideOpenedPlugins`）不再带进页面，`workbench.js` 由此不超过 #701 的大小。
  - 用例：`tests/desktop-shelf-side.e2e.test.ts`（DESK-SHELF-01、DESK-SHELF-02，用真的壳脚本和一个记录调用的替身桥）、`tests/desktop-tui.test.ts`。
- 2026-10-18 W3-C 右栏各格报告手上的东西（分支 `context/w3c-side-in-hand`；做法统筹 10-18 定：像分屏窗格一样，复用现成的来源检查，不加新消息类型）：
  - 右栏插件格的文档跑 `context-actions.ts` 里窗格那一半（`CONTEXT_PANE_FACTORY_SCRIPT`：DOM 选区读取、给打开的条目起名、自己画浮条），与分屏窗格是同一段代码；格里选中的东西经 `workbench-surface-focus` 交给顶层，浮条的方案与选择、悬停保位、交不出去的选择都走分屏窗格已有的消息。
  - 顶层的上下文总线收这些消息时，来源除了分屏窗格框，再认右栏插件框；认框只用一段 `SIDE_FRAME_FROM_SCRIPT`（`molis:side-forward` 的 `from` 也是它，S-30）。顶层按框所在的格标上 `place: "side"` 与 `side_tab`（`landing.place`，和顶层文档里的右栏格同一条规则），`pane_id` 是 `side`；格里报来的 `place` 不算数。
  - 由此左边的落点对右栏格里的选区也成立：浮条给出「插入到光标处」；在左边选中时浮条回到左边；右栏收起后框看不见，总线照旧放下手上的东西，格里的浮条随之收起。
  - 没做：在格里的浮条上悬停「放进去」时，左边的落点不闪（分屏窗格的浮条今天也不闪：窗格报的保位只带浮条上的键，不带菜单的），记作后续 W3-C2（§21.4）。
  - 用例：`tests/security-invariants-pane-messages.test.ts`「S-30 AC-S04 …」（真的工厂脚本跑在一个小页面上：不是右栏插件框也不是分屏窗格发来的焦点被丢掉、不问 Host、哪里都不画浮条；Shelf 框发来的标上右栏与格、只让那个框画）、`tests/side-shelf-in-hand.e2e.test.ts`（W3-C AC-S04，Shelf 格里选中一段材料，左边是 Pages 的光标）。
- 2026-10-18 W3-C2 窗格与右栏格的浮条悬停时闪落点（分支 `context/w3c2-pane-hover-flash`，叠在 #712 上；计划与三条条件统筹 10-18 定）：
  - 窗格（分屏窗格与右栏格同一段代码）报保位 `workbench-context-hold` 时多带 `pointed`：浮条上与「更多」菜单里悬停的键，取自浮条现成的 `pointed()`；`pinned` 不变。没有新消息类型；这条消息是 `postMessage`，不在 `dom-events.ts` 或别的合同里登记，不改合同。
  - 顶层收到后（来源检查 S-30 与当前焦点检查在前）调与自己浮条同一个 `landing.hint(pointed, bar.plan)`：键只在顶层自己的方案里查，查不到或不是 `attach.` 键就什么也不闪，不报错、不记日志；最多看前 16 个。
  - 实际能闪的是右栏格：分屏窗格里的焦点不带 `place`，不给落点，也就没有 `attach.`，那一半代码相同、今天没有可闪的。
  - 用例：`tests/security-invariants-pane-messages.test.ts`「S-30 W3-C2 …」（非 attach 键、非字符串、不是数组、别的来源带合法键、过期的 context 都不闪；Shelf 格悬停闪一次，离开再回来再闪），`tests/side-shelf-in-hand.e2e.test.ts`「W3-C2」（真指针悬停 Shelf 格浮条上与菜单里的「插入到光标处」，左边 Pages 闪、不写）。
  - 全量（run 39115596523）在 `context-pick-result.e2e` 的 PICK-05 红：Esc 收起浮条，可是已经排上或在路上的判断回来后又把浮条画了出来（慢机上判断回来得晚）。不是 W3-C2 的改动造成的，是 Esc 原本的缺口：现在 Esc 和「换了手上的东西」用同一个 `bus.hush()`，把排着的计时、在路上的判断和规则的回复都作废。PICK-05 加了一步：把判断扣住，按 Esc 之后再放行，浮条不再出来（不修时这一步失败）。workbench.js 因此再加 38 字节，并进 W3-C2 的一次性放行。
- 2026-10-18 W4-1 创建入口：记成待办、记下灵光（分支 `context/w4-1-intake-todo-lingguang`；统筹 10-18 认可，带四个条件）：
  - Todo 的 `todo.items.create` 与灵光的 `lingguang.create` 声明 `intake`（`prepare` 是各自的 `*.fragment.offers`，不经模型）；两个旧的片段动作选项连同只有它们用的代码删掉（页面上没有只给它们的文案、事件与翻译键）。灵光加 `lingguang.revert`，`create.undo` 指向它。`scripts/contextual-slice/*` 只有自己的静态样例，不调已删的选项，留着；design-system 的示例标签留着。
  - 宿主 `POST /api/contextual/create`（`apps/local-host/src/contextual/contextual-create.ts`）：起草后按声明决定；能直接建的条件：主人声明的撤销此刻可用（与助理共用 `directEligible`），不是 `proposes`、不是 `multiple`、没有缺的字段。浮条新建是本人亲手点的，不读助理的逐项确认 `confirm_always`：在助理里设成「每次都确认」的动作，在浮条上照样直接建（统筹裁定第 2 条，`specs/archive/repository-anti-corruption` §10.28；`contextual-todo.e2e` 第一条把 Todo 的新建设成每次确认后再建两次，都直接建）。直接建时以本人的权限调用、返回建好的对象与撤销令牌；否则返回草稿，页面出卡片。`POST /api/contextual/undo` 花掉令牌（S-40，`tests/security-invariants-contextual-undo.test.ts`：重复用、换项目、换操作者、过期、提供方换了安装或停用、页面自己写撤销，都拒）。
  - 页面（`context-bus.ts` 的 `create`）：同一个选区与入口复用同一个请求号（连点两次只建一个，主人按请求号去重），在途时第二次点击不发；完成卡片用落点的卡片，「打开」走 `describe` + `openObject`，「撤销」失败时卡片说「没能撤销」。
  - 顺带修好：Goals「拆成目标步骤」的提案条目号原来固定是 `step-1` 一类，同一个项目的第二份提案被拒；改成按请求号区分（`plugins/native/goals/src/fragment-offers.ts`）。
  - 动作合同快照：Todo、灵光几个动作的 `traits` 哈希变了，输入输出 schema 不变，不升版本；新增 `lingguang.revert@1`（MCP 工具多一个）。
  - 页面资源：`workbench.js` +1,158 字节，一次性放行（`APPROVED_CEILINGS`，理由与试过的写在 `scripts/gates/page-assets.mjs`）。
  - 用例：`tests/contextual-create.test.ts`（真 Host：两个入口直接建、一次请求只建一个、别处改过后撤销被拒且不删不改、令牌只能用一次、别的项目的令牌被拒；假目录：没有撤销、提案、多个、缺字段都出卡片，只调 `prepare`）、`tests/plugin-context-declarations.test.ts`、`tests/contextual-destinations.test.ts`（只有规则时一段文字一个去处、一个词没有）、`tests/contextual-fragment-offers.test.ts`（同项目第二份拆分提案）、`tests/contextual-todo.e2e.test.ts`（连点、重选、改后撤销被拒、撤销、打开；原来「卡片执行被拒、什么都不写、可以再执行」那一半改用 Goals「拆成目标步骤」的卡片留在同一个文件里）、`tests/lingguang-actions.test.ts` LG-REVERT-01；原来用「记成待办」「记下灵光」的三个浏览器用例改用「拆成目标步骤」，只改去哪里找。
  - 2026-10-19 补测（防腐 §10.28 对 #730 的复查）：原来写「断言不变」，不实，「卡片准备途中改选区，卡片仍按原选区」那条在 W4-1 里删掉了，没有替换。现在补回两条，都在 `contextual-todo.e2e`：Goals「拆成目标步骤」那条把这次点击发的 `/api/contextual/prepare` 扣在路上、选区换到第二段再放行，问的焦点、卡片摘要、work 和执行后的提案都只有第一段；直接新建那条把第一次 `/api/contextual/create` 扣在路上、换选区再放行，问的焦点、完成卡片和建出的待办都只有第一段。
- 2026-10-19 手上的东西在哪里只看元素（防腐 §10.28 对 #712、#720 的 P3）：原来 `landing.place` 只在元素落在右栏格或助理里时盖掉焦点里的 `place`、`side_tab`，左边的文档（`molis:surface-focus`）和分屏窗格（`workbench-surface-focus`）自己报的 `place: "side"` 与随便一个格名会原样送到 Host，Host 就按右栏给落点、给「插入到光标处」，提示里也写成右栏的格。现在 `place` 一律由元素算出（右栏格 `side` 带格名、助理 `assistant`、其余 `main`），`side_tab` 只在右栏格里有，自己报的两样都不算数。
  - 用例：`tests/security-invariants-pane-messages.test.ts`「S-30 §10.28 …」（分屏窗格与左边文档自称右栏、带伪造格名，Host 收到的是 `main`、没有格；Shelf 框自称助理、带伪造格名，收到的是右栏和 Shelf 自己的格）。
  - 页面资源：`workbench.js` 少 4 字节（`tooling/gates/page-assets.json` 同步降）。

## 21.7 暂停点（2026-10-14，用户：需求线暂停，整机让给防腐线）

2026-10-15 统筹通知恢复（#489、#523 已合 main），恢复步骤 1–5 已按下文做完，结果见 21.6；本节留作当时的记录。

分支 `context/assistant-flow`（从 origin/main `393e8958` 开，全部已推送，本机没有只在本地的改动；没开 PR）。

**已完成（只到「写完」）**：

- §13 现状核对（16.5）；#180 由统筹关闭，三行出处已在本分支的 `specs/coding-plugin/next-requirements.md`。
- 方案、决策与波次（21.1–21.5）；可点切片（私有页面 `https://claude.ai/artifact/1PphQCPrX7CgnH5eSWK6FN`，本地副本、截图与隔离 Home 走查脚本 `walk-serve.mts` 在统筹共享笔记目录 `contextual-line/`）。
- 交互线同意的 D24 与 FLOW-01…05（21.2），H3 的落点读取用法（21.4 W3-B）。
- 部件参数：`renderInteractionNextSteps(steps, label, { max, more })`、`waiting`/`waitingLabel`、样式、组件板样张、`tests/interaction-components.test.ts` 新用例。
- 派生函数：`apps/local-host/src/agent-next-steps.ts` 的 `interactionNextSteps` 与 `NEXT_STEP` id（经 `apps/local-host/src/index.ts` 导出），用例 `tests/agent-next-steps.test.ts`（FLOW-02…05，含 unknown 不重跑）。

**没验证的**：部件与派生都没构建（这棵树的 dist 是 10-13 的，`tsc` 对派生报的找不到 `services/agent-interaction` 与 `waiting` 字段都因旧 dist）；FLOW 用例与 design-system 必跑用例没跑；健康门禁、页面资源没量（部件新增的样式会让三份样式表各多约 300 字节，要在 W3-A1 同一个 PR 里用删掉的旧渲染抵掉，单独合会被页面资源门禁拒）；真实产品没走查。

**恢复时按顺序**：

1. `git fetch origin main`，把 main 合进本分支（不 rebase、不强推）；按排队顺序拿构建锁 `pnpm build`。
2. 跑 `node scripts/run-tests.mjs tests/agent-next-steps.test.ts tests/interaction-components.test.ts` 与 `packages/design-system/README.md` 的必跑用例；`node scripts/check-health-gates.mjs --base origin/main`。
3. 隔离 Home 实走：`node --import tsx walk-serve.mts 4296`（脚本放回 scratchpad 并把 `node_modules` 链到工作树；它起隔离 Home 与脚本模型，「问我…」出问卷卡、「待办 / 建议」出操作卡），1440/1024/800/390 与深色截图，结果补进 21.6。
4. 等 #489 合入后接执行：岛外新文件画输入框旁的下一步（`renderInteractionNextSteps` 带 `max: 3`），按 `NEXT_STEP` id 点卡自己的控件（选项像人点一样、卡上有没交的改动就只滚到卡上）；删 A10「接下来」、A11 两个「去…」、A7 建议条（连同 #489 页脚名单里的 `.assistant-offer`），页面资源每个文件只减。
5. 定向用例、门禁、截图齐了开 W3-A1 的 PR（本分支的文档与部件一起），PR 号与证据发统筹。
