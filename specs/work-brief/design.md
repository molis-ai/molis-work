# 助理卡片与工作简报：设计稿

状态：设计稿（2026-10-26），待用户评审，尚未实现。回答[工作简报需求](spec.md)与[主动式助理](../proactive-assistant/spec.md) §5.5、§9–§12 提出的「不同 Skill 共用同一套卡片、报告、对照、进度、定位」怎样承载。可视规格板（全部卡型、三种尺寸、状态、深浅色、窄屏）在 [docs/design/assistant-cards/](../../docs/design/assistant-cards/README.md)。本文不扩大需求范围；第 12 节是要用户拍板的几点。

## 1. 现在的问题

| 现状 | 问题 |
| --- | --- |
| 助理交给人的结构只有四种：问题卡（`AgentPendingQuestion`）、动作卡（`AssistantCard`，`apps/local-host/src/assistant/assistant-card-view.ts`）、下一步行、动作结果摘要（`ActionResultPresentation`：一句话、标题、至多 4000 字正文、一个链接） | 都是表单或回执的形状。一份周报、一个日程冲突、一组方案对照只能写成 Markdown 正文，再挂一张动作卡；对象、依据、状态都埋在文字里 |
| 正文里的对象只有名字 | 点不开、定位不了、变了也看不出来，平台核对不了是不是真对象（主动式助理 §5.5「卡片的对象和位置必须来自可核对的工具结果」） |
| 工作简报需求把脉搏、状态页、使用回顾、交互式报告页各写了一段 | 照着做是四种页面、四套代码，违反 WBR-08「插件没有按场景名称固定的生成流程」 |
| 首页事项（`HomeEvent`）、Inbox 推荐、动作卡各有各的行样式与状态 | 同一件事在首页、侧栏、对话里长得不一样，状态各算各的（主动式助理 §11「不产生另一套需要手工维护的首页待办」） |

## 2. 方案

**一条卡片记录，一套块语法，三种尺寸，各归其主。**

- 助理每交出一份结果，就是一张**卡片**：对象、为什么是现在、内容、依据、动作、状态。首页、侧栏、对话、通知读同一条记录。
- 卡片的内容由闭集的**块**拼成。**引用块**的字由事实主人给（待办的标题和状态由 Todo 给）；**撰写块**的字由助理写，但每条断言都挂着本轮真实读到的依据；缺口、覆盖、谁完成的由**宿主**写。人一眼分得清哪句是事实、哪句是助理的判断、哪里没读到。
- 常用的拼法是**卡型**：一份数据配方（槽位、每槽允许的块、各尺寸显示哪几槽），不是代码分支。Skill 选卡型、填槽；加一个用现有卡型的场景不写页面、不接定位。
- 同一张卡片在三种**尺寸**下各有样子：行（首页列表、通知）、卡（侧栏、对话）、页（工作简报主区）。
- 要留存、修订、分享的**保存为简报**：工作简报插件保存同一套块和冻结的依据，管版本、人工修改和再生成。

## 3. 分层与主人

| 层 | 主人 | 负责 | 不负责 |
| --- | --- | --- | --- |
| 块与卡型的合同 | `packages/contracts`（类型与 schema）；校验在 `packages/plugin-sdk`，与问卷规则同处，宿主与插件共用一份 | 块的闭集、字段与上界、卡型配方的格式、引用与依据的形状 | 渲染、存储 |
| 呈现 | `packages/design-system`（与 `interaction.ts` 同层的 `renderCard`、`renderBlock`） | 把视图类型画成 `mw-*` HTML，三种尺寸，`data-card-*` 钩子；规格板 `/__ui/catalog` 的样张 | 读记录、权限、执行 |
| 卡片记录 | 个人助理（助理库，与工作、轮次同主人） | 生成、绑定、状态、有效性、暂缓与处理去向 | 业务事实、简报版本 |
| 简报 | 工作简报插件（新） | 简报的块、版本、人工修改、再生成提案、状态页刷新、发布成成果 | 业务状态、执行进度 |
| 事实 | 各插件 | 对象的标题、状态、事实行、打开位置、对照、预览，经它们已注册的动作 | 卡片怎么排 |
| 定位与高亮 | 平台放置服务与各插件 | 打开对象、带到可见区、标记 | — |

模型只写卡片草稿（结构化参数），不写 HTML；宿主绑定后存成记录，界面只渲染记录（[跨插件 AI 交互](../ai-interaction-experience/spec.md) §7 的分工）。插件自己的 Agent 也能用同一套块和渲染在自己的页面出卡片，记录归插件，和问题卡今天的做法一样（`PluginInteractionClient`），不给助理开私路。

## 4. 卡片记录

```ts
interface Card {
  card_id: string;
  revision: number;
  work_id: string;                 // 所属工作；同一工作、卡型、主对象的卡是同一张的新 revision
  run_id: string | null;
  scope: { kind: "project"; project_id: string } | { kind: "personal" };
  type: string;                    // 卡型 id（§11），如 "decision"、"pulse"
  intent: CardIntent;              // §4.1
  title: string;                   // 对象 + 结果，至多 60 字
  why: string;                     // 为什么是现在，至多 120 字
  subjects: { primary: BoundSubject | null; related: BoundSubject[] };  // 都经主人解析过
  slots: Record<string, Block[]>;  // 按卡型的槽
  basis: CardBasis;                // 依据条：Skill 与版本、截至、来源覆盖、缺口（宿主写）
  state: { presentation: Presentation; suggestion: Suggestion; work: WorkState; validity: Validity };  // §6
  snooze?: { until?: string; condition?: SubjectRef };
  brief?: { brief_id: string; version: number };  // 已保存为简报
  created_at: string;
  updated_at: string;
}
```

### 4.1 意图

闭集，对应主动式助理 §4.2 的判断结果。意图不配颜色（[DESIGN.md](../../DESIGN.md)「颜色只说状态」），用状态环与字区分；排序只是默认，Skill 和用户固定的顺序优先。

| 意图 | 用户读到 | 状态环 | 默认顺序 |
| --- | --- | --- | --- |
| `decide` 需要你决定 | 一个会改变后续的选择 | 待答（琥珀） | 1 |
| `blocked` 卡住了 | 在等什么、等谁、何时能继续 | 受阻（红） | 2 |
| `prepared` 已备好 | 结果做好了，等你采用 | 就绪 | 3 |
| `next` 可以接着做 | 具体到对象的下一步 | 空心 | 4 |
| `running` 进行中 | 受托工作的真实进度 | 执行中（转动） | 5 |
| `review` 回顾 | 报告、脉搏、状态页 | 静 | 6 |
| `notice` 知会 | 不需要动作的变化、机会 | 静 | 7 |

## 5. 块

### 5.1 三种字

- **主人的字**（引用块）：标题、状态、事实行、时间只来自对象的主人。助理只决定选哪些对象、怎么排、旁边加一句注。主人那边改了，卡片下次读到的就是新的。
- **助理的字**（撰写块）：凡是断言（「推进了」「逾期 3 天」「有风险」）必须挂 `cite`。`cite` 只能是：① 主人能解析的对象引用（带版本），或 ② 本轮一次真实读取的活动编号（宿主留着它的冻结输出）。解析不了的引用让工具当场失败并指出是哪一条，不静默丢掉（WBR-03）。
- **宿主的字**：缺口、覆盖、`stale`、`owner-supplied`、你完成还是助理完成、两次之间的变化。模型压不掉也改不了。

画出来也分得开：主人的事实是带插件图标的对象行和 12/400 的事实字；助理的话是 13/400 正文，依据是正文后的小号依据标；宿主的覆盖与缺口在卡片底部的依据条里，缺口带琥珀点。

### 5.2 块的闭集

| 块 | 用途 | 字来自 | 数据来源（现有合同） | 行 / 卡 / 页 |
| --- | --- | --- | --- | --- |
| `object` 对象 | 一个真实对象：图标、标题、状态、至多 3 条事实、打开与定位 | 主人 | 主题摘要（§5.3，新增）、`placement.describe` | 对象片 / 对象行 / 对象行 + 摘录 |
| `list` 对象列表 | 一组对象，可分组，每项可带助理一句注 | 主人；注是助理 | 主题摘要批量读取 | 计数 / 前 3–5 条与「还有 n 条」 / 全部 |
| `metric` 数 | 一个可核对的数 | 宿主按 `basis` 从读取输出取；或用户口述（标 `owner-supplied`）；或估算（必须写方法与不确定性） | 查询动作输出 + JSON Pointer（与 `ActionResultView` 同一取值规则） | — / 数、单位、依据 / 加上与上期比 |
| `status` 来源状态 | 脉搏：每个来源一行红/黄/绿/n.a. | 色与一句话是助理的判断；读取成败与依据由宿主给 | 本轮各来源读取的活动编号 | 三色计数 / 行 / 行 + 风险展开 |
| `agenda` 时间轴 | 今天或本周的时刻：日程、提醒、到期、冲突 | 主人 | `schedule.tasks.list`、`jelly.calendar.list`、`todo.reminders.due` | 下一个 / 当日轴 / 周视图 |
| `timeline` 经过 | 一件事最近发生了什么 | 主人 | `goals.timeline.list`、`home.events.read`、`goals.history.list` | — / 最近 3 条 / 全部 |
| `progress` 进度 | 受托工作的步骤、当前步、等待原因，可暂停或停止 | 执行主人 | `agent.run.read.v1`、`coding.runs.list`、`workflows.instances.get`、`images.jobs.get` | 环与当前步 / 步骤 / 步骤与记录入口 |
| `diff` 对照 | 两个版本或候选稿与目标的差异 | 主人的对照动作；候选稿用 SDK 的 `compareTexts`（`packages/plugin-sdk/src/text-diff.ts`） | `pages.artifacts.compare`、`dataset.artifacts.compare`、`diff.compare` | 「+12 −3」 / 前几处 / 全部 |
| `file` 文件 | 文件或成果的预览 | 主人的预览动作 | `artifacts.preview`、`files.side.content`、各插件的 `*.artifacts.preview` | 种类片 / 缩略与名称 / 预览 |
| `text` 正文 | 助理的说明，可内嵌对象片 | 助理；对象片由宿主解析 | 现有富文本子集（`packages/plugin-sdk/src/rich-text.ts`） | 一句 / 段落（可折叠） / 全文 |
| `claim` 结论 | 一条结论：断言、把握（确定 / 推断 / 待验证）、依据、附图 | 助理写断言，宿主核对依据 | `cite` | — / 断言与依据数 / 断言、依据、附图 |
| `options` 选项 | 要决定的选择：单选或多选、差异、推荐与理由、其他、暂不决定 | 助理 | 就是 `AgentQuestion`（choice）；答案进原工作 | — / 选项 / 选项 |
| `compare` 方案对照 | 方案 × 维度的表，推荐列与理由 | 助理；每格可挂 `cite` | `cite` | — / 至多 4 个维度 / 全表 |
| `draft` 候选稿 | 可采用到某处的内容：目标对象与位置、与目标的差异 | 助理写内容；目标由主人解析 | 目标主人的写入动作：`pages.landing.insert`、`pages.landing.replace`、`todo.items.batch`、`goals.guidance.add` | — / 前几行与差异计数 / 全文与差异 |
| `action` 动作 | 一个可执行的真实动作 | 现有动作卡记录 | `suggest-action`、`*.fragment.offers`、`defineSubjectOffersAction` | 一个按钮 / 动作卡 / 动作卡 |
| `question` 问题 | 必答的问题 | 现有问题卡 | `ask-user` 与 `AgentPendingQuestion` | — / 问题卡 / 问题卡 |
| `delta` 变化 | 和上次比：新增、状态变化、完成、新阻塞、移除、读不到 | 宿主比较两次的引用块 | 两个版本的冻结快照 | 「3 项变化」 / 列表 / 列表 |
| `gap` 缺口 | 读不到、未连接、过期、未验证 | 宿主 | 本轮读取的成败、`connectors.connections.read` | 琥珀点 / 一行 / 段落 |
| `exhibit` 附图 | 结论的附图：状态机、调用链、结构、界面草图 | 助理给结构化数据，渲染器画 | 节点、边、表格的 JSON；不收 HTML、Mermaid 或脚本 | — / 缩略 / 全图 |

不做 `checklist`：会前「要带的材料」用 `list` 列对象，宿主按主人事实标「已具备 / 缺」；人想打勾的就转成待办（`todo.items.batch`）。简报不维护第二份任务状态（需求 §4）。

### 5.3 要补的读取：主题摘要

`subject.read`（`packages/contracts/src/platform/action-subjects.ts` 的 `ActionSubjectContext`）给正文与关联，最多 32,000 字，没有状态与事实行：拿来画列表太重，也不够用。新增一个与 `defineSubjectContextAction` 同类的协议：

```ts
// molis.subject-summaries.v1：一次至多 50 个同种对象
interface SubjectSummary {
  subject: ActionSubject;
  revision: string;
  title: string;                                   // 至多 200 字
  state?: { label: string; ring: StateRingState };  // 主人的状态词和状态环
  facts: Array<[string, string]>;                  // 至多 3 条，主人的话：「到期」「10-28」
  when?: string;                                   // 关键时刻（到期、开始）
  open: { surface: string; id: string } | null;
  project_id?: string | null;
}
// 读不到的逐个回 { subject, missing: "deleted" | "unavailable" }，不整批失败
```

每个已有 `subject.read` 的插件补一个 `*.subject.summaries`，权限同读取。首页事项（`packages/contracts/src/platform/home-events.ts`）的 `facts` 与 `open` 已经是这个形状，Todo、Schedule、Goals、Feed、Inbox 可以直接复用取值。

## 6. 状态与有效性

四道，各自独立，互不冒充（主动式助理 §12.2）：

| 道 | 取值 | 谁改 | 怎样显示 |
| --- | --- | --- | --- |
| 呈现 | `new` → `seen`；`selected` | 界面 | 新卡一次 `--accent-soft` 着陆（DESIGN.md 的「时刻」）；选中 `--nav-active` 底 |
| 建议 | `pending`、`snoozed`、`handled`、`declined`、`superseded`、`expired` | 用户的处理；宿主的有效性检查 | 头部右侧的字 |
| 工作 | `none`、`preparing`、`running`、`waiting`、`done`、`partial`、`failed`、`unknown` | 执行主人 | 底部状态行与状态环 |
| 有效性 | `valid`、`changed`、`stale`、`unavailable` | 宿主打开时重读主对象版本 | 琥珀横幅「《Q4 发布方案》已从 v3 改到 v4」与「按新版本重新准备」 |

- 打开卡片（任何尺寸）只重读主题摘要，不跑模型、不跑 Skill（主动式助理 §5.5、§11）。
- 卡片冻结生成时的快照；`changed` 时可以切换「当时 / 现在」（§12.4、WBR-04）。
- 动作块绑定生成时的对象版本：`changed` 或 `stale` 之后按钮不可执行，只留「按新版本重新准备」（沿用动作卡的 `stale`）。
- 暂缓的三种：到某个时间、某个对象变化（以版本为准）、只留给我找回。重新出现前先重读，仍有价值才出（§4.4）。

## 7. 交互约定

- **三个点击区，三种意思**（主动式助理 §10、§12.3）：
  1. 卡片主体：选中，侧栏展开详情，主区打开主对象并定位高亮。只看，不改，不启动新执行。
  2. 选项与可改字段：只改待提交的参数，不生效。
  3. 按钮：明确提交，名字写对象和结果（「采用到《Q4 发布方案》第 2 节」「把 3 条建成待办」）。一张卡至多一个实心主按钮。
- 多对象：有主对象就定位它，其余关联在详情里逐个点；没有主对象就先列出来让人选，不擅自跳到第一个；综合建议不跳转、不造高亮。
- 「说一句」：卡片可以成为输入框的对象（`renderInteractionComposerTarget`），说的话是这张卡所属工作的新输入，不另开工作。
- 键盘：卡片列表上下键移动，Enter 等于点主体，主按钮可以 Tab 到；悬停只预览，不切插件、不滚动。
- 后台更新不重排正在看或要点的卡：新卡进「n 条新内容」，点了才插入。

## 8. 三种尺寸与位置

| 尺寸 | 在哪 | 样子 |
| --- | --- | --- |
| 行 | 首页「需要你处理 / 可以接着做」、通知、侧栏收起的分组 | 状态环 · 标题 · 一条事实 · 主对象的插件图标 · 一个动作（悬停或聚焦时出）；32/40px，与目录行同一语法 |
| 卡 | 侧栏、对话、首页展开 | 头（状态环与意图字 · 主对象 · 时间 · 建议状态）、标题、为什么是现在、卡型 `card` 槽里 1–3 个块、动作行、依据条；`--surface-soft` 底、12px 圆角、无边框无阴影（卡在纸上，不是纸上再叠一张纸） |
| 页 | 工作简报主区（插件页，960px 内栏） | 页标题 24/600、范围与截至、tab 或目录、各块的「页」形态、右侧依据栏（≥1100px，窄了收成折叠） |

- 侧栏 320–480px：卡内只放卡型定义的 `card` 槽，其余在「展开」里。
- 对话里：卡片是回复的一段，与回复同宽，不再套气泡。
- 窄屏：卡占满宽度，动作行换行，主按钮在第一个；页的依据栏收成折叠。

## 9. 生成与绑定

```text
Skill 指导 → 模型在本轮读事实（各插件的查询动作，每次读取留活动编号）
  → 调用 present-card：卡型、意图、标题、why、各槽的块草稿与 cite
  → 宿主绑定（不跑模型）
      · 卡型存在，块的种类在宿主能画的范围内，长度与个数在上界内
      · 每个对象引用经主人解析成主题摘要；读不到 → 工具失败，指出是哪一条
      · 每个 cite 是本轮真实读取，或主人能解析的对象
      · 动作块走 suggest-action 同一条路，准备成动作卡记录
      · 宿主补 gap（本轮失败的读取、未连接的来源）与 basis（Skill、截至、覆盖）
      · 冻结快照：每个引用块的版本、摘要与读取时刻
  → 卡片记录（助理库）→ 首页、侧栏、对话、通知读同一条
  → 人：看（只重读）/ 选（草稿）/ 按（动作卡执行，或答案回原工作）
  → 保存为简报 → brief.briefs.create（块、快照、依据）
```

- 工具 schema 只列宿主现在能画的卡型与块（与 `ask-user` 的题型能力感知同一做法）；用了不认识的，当场失败并说明能用哪些。
- 卡型配方是数据：`{ id, title, slots: [{ id, blocks, min, max }], sizes: { row: slot, card: slots, page: slots 或 tabs } }`，登记在设计系统。新增卡型 = 加一条配方、在规格板加样张；平台不按卡型写分支。
- 卡片有可接续的身份（`work_id + type + 主对象`）：再生成是同一张卡的新 revision，重复触发、重启或重试不产生第二张，也不重复通知（主动式助理 §9.1）。

## 10. 工作简报

### 10.1 简报是什么

简报 = 标题、范围（个人或项目，周期或主题）、截至时刻、按卡型配方组织的块、依据、版本。卡片「保存为简报」，或 Skill 直接生成长形态时建一份。首页和侧栏里显示的是它的卡尺寸（摘要卡），点开是插件页。临时提示不存成简报（WBR-01）。

### 10.2 版本与人工修改

- 每个块有稳定 id 和来源：`generated`、`edited`（人改过）、`added`（人加的）。人改过的块再生成时不被覆盖。
- 再生成产出一份**提案**：逐块给「保留我的 / 用新的 / 合并」，对照用 `compareTexts`（WBR-05）。正文的修改不写回源插件。
- 保存、导出、分享过的版本固定，成为成果（`artifacts.produces` 声明 `brief.version.v1`，带预览动作）；之后的刷新只产生新版本，不改旧的（WBR-04）。再生成提案是过程项，不进成果库。

### 10.3 状态页与刷新

- 状态页 = 带刷新安排的简报，tab 来自卡型配方，没有内容的 tab 不出（WBR-10）。
- 需求里页面内不可见的 `state` 块，就是**引用块的冻结快照**（对象、版本、状态、主人事实），不另造一种隐藏块。
- 刷新：宿主重读全部引用块（不跑模型），与上一版比出 `delta`；要重新判断的部分（风险、下一步）才交给助理按 Skill 更新。读不到的标 `stale`，不编造（WBR-11）。
- 「部署到同一地址」= 同一个简报的当前版本；分享出去的是固定版本。

### 10.4 交互式报告页

- `claim` 组成结论树，每条可挂 `exhibit` 与 `options`（决定放在它影响的结论上）。
- 读者展开、勾选、评论都是草稿；「交给助理」把勾选与评论打成一份输入（[输入回执](../ai-input-receipts/spec.md)的同一 `request_id`）送回原工作。提交前不改业务事实，保存与引用走成果（WBR-16）。

### 10.5 插件形态

- 插件 id `io.molis.work.brief`，目录 `plugins/native/brief`。个人周报要跨项目，建议做成 Home 级插件，每份简报带所属项目或个人，由 Home 监督器装配（`apps/workbench/src/builtin-plugins.ts` 目录条目的 `runtime: { scope: "home" }`，写法见 `skills/molis-plugin-dev/host.md`）。待拍板，见 §12 ②。
- 动作只管简报本身：`brief.briefs.create`、`read`、`list`、`revise`（提案）、`resolve`（逐块处理提案）、`edit`、`versions`、`compare`、`refresh`、`publish`，加 `subject.read`、`subject.summaries`、`search.entries`、`home.events`、`artifacts.preview`。业务动作留在原插件。

## 11. 卡型目录

19 个卡型，6 组，样张见规格板。「槽」写作 `名：块`，带 `*` 的是卡尺寸显示的槽，其余在展开或页尺寸。

### 推进

1. **接着做 `next`**：已开始的工作可以接上。`*主对象：object`、`*停在哪：text`（差什么）、`*动作：action`。来源 `goals.work.resume`、`coding.sessions.read`、`pages.get`。主按钮如「接着写《Q4 发布方案》第 3 节」。
2. **已备好 `prepared`**：候选结果等你采用。`*候选：draft`、`*对照：diff`、`依据：claim`、`*动作：action`（采用 / 调整 / 放弃）。来源 `pages.ai`、`ppt.outline_ai`、`form.questions.draft`、`todo.organize.extract`。采用走目标主人的写入；主人没有可靠撤销时不显示撤销。
3. **接续 `handoff`**：一处的结果满足了另一处的前提。`*从：object`、`*到：object`、`*怎么转：text`、`*动作：action`。如问卷收齐 → 导入数据集（`form.results.csv` → `dataset.import`），Coding 报告 → Goal 交付（`coding.reports.read` → `goals.deliverables.add`）。
4. **收拢 `gather`**：零散材料开始指向同一个结果。`*材料：list`（Shelf、Feed、灵光、Inbox）、`*去处：options`（建 Goal / 整理成文档 / 挂到已有 Goal）、`*动作：action`。来源 `shelf.items.list`、`feed.items.get`、`lingguang.content.list`、`inbox.list`；去处 `goals.create`、`pages.create`、`goals.inputs.bind`。未确认的意图保持候选，不自动建承诺。

### 决定

5. **需要你决定 `decision`**：会改变后续的一个选择。`*问题与选项：options`、`*影响：list`（受影响的对象）、`依据：claim`。答案进原工作；关于 Goal 的决定落到 `goals.decisions.record`。
6. **方案对照 `compare`**：两到四个方案按维度比。`*表：compare`（卡尺寸至多 4 个维度）、`*推荐：claim`、`*选择：options`。页尺寸是全表与每格依据。
7. **待确认 `confirm`**：改变助理自己做法的东西：记忆候选、Skill 修改草案、长期委托。`*改动：diff 或 text`、`*范围：text`（对什么、多久）、`*动作：action`。来源 `memory.candidates.list`、`agent.skills.read`。一次成功不自动升级为长期执行（主动式助理 §4.3）。

### 守望

8. **卡住了 `blocked`**：在等什么。`*对象：object`、`*等：list`（等谁、自哪天、恢复条件）、`*动作：action`（提醒我 `reminders.add`、起草催办、改期）。起草的消息只是草稿，发送按发送授权。没有新条件不反复催。
9. **偏差与风险 `risk`**：具体记录、影响、下一步（WBR-13）。`*记录：object`、`*影响：metric`（天数、金额、范围，带依据）、`*下一步：action`。没有具体记录就不出这张卡，「有些逾期」不算。
10. **日程与临近 `agenda`**：今天或明天的时刻与冲突。`*轴：agenda`、`*冲突：claim`、`动作：action`（改期、设提醒）。来源 `schedule.tasks.list`、`jelly.calendar.list`、`todo.reminders.due`。
11. **提前准备 `prep`**：会议、交付或阶段切换临近。`*事件：object`、`*材料：list`（已具备 / 缺）、`*要问的：text`、`动作：action`（生成准备简报、把缺的建成待办）。来源 `cognia.knowledge.query`、`files.side.entries`、`pages.list`、`goals.contract.read`。

### 执行

12. **进行中 `running`**：受托工作的真实进度。`*进度：progress`、`*在等：text`、`*控制：action`（暂停、停止、查看）。来源 `agent.run.read.v1`、`coding.runs.list`、`workflows.instances.get`、`images.jobs.get`。
13. **已完成 `receipt`**：做完了什么、改了哪里。`*结果：object 或 file`、`*改动：diff`、`*动作：action`（查看并定位；撤销只在主人有时出：`todo.changes.revert`、`pages.revert`、`jelly.undo`；下一步）。部分成功逐项列，保留没做的选择。

### 回顾

14. **脉搏 `pulse`**：「今天/本周怎么样」。`*状态：status`、`*风险：list`（每条是一张 `risk` 的行尺寸）、`*缺口：gap`。行尺寸「3 绿 · 1 黄 · 1 n.a.」。
15. **周期报告 `report`**：日、周、月、阶段。`*推进：list`（每项标你 / 助理 / 合作，宿主按动作记录给）、`对比：claim + metric`、`*未解决：list`、`*待决定：options`、`接下来：action`（至多 3 个）、`经验：claim`。卡尺寸：一句结论、三个数、待决定。
16. **状态页 `status-page`**：跨工作流的活页。tab：概览（成功标准）、工作流（`list`：负责人、状态、关键字段）、下一步、风险、决定。卡尺寸：`*变化：delta` 与截至。
17. **专题分析 `review`**：结论树、附图、内嵌决定。卡尺寸：结论数、待决定数、第一条结论。
18. **使用回顾 `usage`**：这段时间做了什么、落在哪、采用还是返工。`*产出：list`（你 / 助理）、`*采用：metric`（宿主按动作记录算，`actions.usages.read`）、`返工：list`、`*缺口：gap`。不写节省时间和比例，确要估算就写方法（WBR-14）；默认只给本人看。

### 发现

19. **机会 `opportunity`**：新资料或新能力能改善当前工作。`*相关的：object`、`*依据：claim`、`*小试：action`（范围小、可审阅）。来源 `feed.goals.context`、`alchemist.opportunities.save`、`plugins.installed.list`。默认是 `notice`，排在最后，不压过当前重点。

## 12. 要拍板的

1. **名字**：产品里叫「卡片」，合同叫 `Card`；现有的 `AssistantCard` 改名 `ActionCard`（它就是动作块的记录）。按 `docs/system/CONTRACT-CHANGES.md` 现在不留兼容期，一次改完。
2. **工作简报的范围**：Home 级插件（推荐；个人周报跨项目放得下，项目简报带项目），还是项目级插件。
3. **主题摘要**：每个插件补一个批量摘要读取（推荐），还是扩大现有 `subject.read` 的输出。前者轻、可批量；后者少一个动作但每次读正文。
4. **先做哪几张**：P2 先上 `next`、`prepared`、`decision`、`blocked`、`running`、`receipt`（推荐，覆盖主动式助理最常见的判断结果），还是先做回顾类（`pulse`、`report`）。

## 13. 分期

| 期 | 内容 | 不含 |
| --- | --- | --- |
| P0 合同与呈现 | 块与卡型的 schema、SDK 校验、design-system 渲染、规格板 `/__ui/catalog` 样张 | 模型、存储 |
| P1 主题摘要 | Todo、Goals、Schedule、Pages、Coding 先补 `*.subject.summaries` | 其余插件 |
| P2 助理接入 | `present-card` 工具与绑定、卡片记录、侧栏与对话里的卡尺寸，六张卡（§12 ④） | 首页、简报 |
| P3 首页与回顾 | 行尺寸进首页「需要你处理 / 可以接着做」；`pulse`、`report`、`agenda`、`prep` | 简报版本 |
| P4 工作简报 | 插件、保存为简报、版本与人工修改、再生成提案、状态页刷新与 `delta`、发布成果、交互式报告页 | — |

## 14. 验收

| 编号 | 用户可观察结果 | 对应 |
| --- | --- | --- |
| CARD-01 | 同一张卡片在首页、侧栏、对话里内容与状态一致；在任一处处理后其他处跟着变 | WBR-02、主动式助理 §11 |
| CARD-02 | 卡片里每个对象都能打开并定位；对象不存在或无权限时如实说明，不显示残留预览 | 主动式助理 §12.3、§12.6 |
| CARD-03 | 主人的事实、助理的判断、宿主的缺口在视觉上分得开；每条断言能展开看到依据 | WBR-03 |
| CARD-04 | 模型引用了解析不了的对象或没读过的依据时，卡片不会生成，工具结果说明是哪一条 | 主动式助理 §5.5 |
| CARD-05 | 打开、展开、切换「当时 / 现在」不运行模型；对象变了的卡片显示变化，旧动作不可执行 | WBR-04、主动式助理 §5.5 |
| CARD-06 | 点卡片主体只看；改选项不生效；只有按钮提交，按钮名字写对象和结果 | 主动式助理 §10 |
| CARD-07 | 只改 Skill、不改平台代码，可以改变卡型、取材和选项；新增一个用现有卡型的场景不改页面 | WBR-08 |
| CARD-08 | 重复触发、重启、重试不产生重复卡片或重复通知 | 主动式助理 §9.1、WBR-07 |
| CARD-09 | 脉搏里一个来源失败不影响其他来源，失败的来源显示 n.a. 与原因，由宿主给出 | WBR-12 |
| CARD-10 | 保存为简报后，人改过的块在再生成时保留，冲突逐块处理；分享过的版本不被刷新改动 | WBR-04、WBR-05 |
| CARD-11 | 状态页刷新只重读事实并给出 `delta`；读不到的标 `stale` | WBR-10、WBR-11 |
| CARD-12 | 三种尺寸在浅深色、紧凑密度、390px 窄屏下重点和主要操作可见，键盘可达 | 主动式助理 §11、§12.6 |
