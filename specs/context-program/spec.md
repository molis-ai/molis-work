# 情境动作总纲：一个动作池、一条浮条、右栏与创建入口

> 接续入口是下面的「交接（2026-10-20）」一节。第 17 节的旧交接、第 20 节的远端交接都只作历史记录；第 21 节各小节仍是设计、决策与证据的出处。

状态：执行中，本线 2026-10-20 交接后停（见下一节）。W0～W3（含助理整合 W3-A1～A3c、落点 W3-B1～B3、右栏 W3-C、W3-C2）、W2' 右栏改版、W4-1 两个创建入口与下一步行的结果位，以及交接时在途的 W4-2（#801）、W4-6a（#804）与 QA-013～018 的修补（#830、#831）都已合入 main；W4 其余各片、W5～W7 与收尾没开工，记在 `specs/BACKLOG.md`；真实 Jev 评估、桌面原生拖出未做，没有一骏本人验收。

## 交接（2026-10-20）

情境线（会话 ⑧）按用户 2026-10-19 的重新安排收尾：除防腐线外，各线把手头的片做完、开 PR 交 ⑤（评审、修意见、合并），写交接，然后停。本线不再开新片。

**现在的状态**：见上面的状态句。交接时在途的四条 PR 都已合入；⑤ 在 2026-10-20 核对了实际合入提交，并把本轮补过的验证与剩余欠账分开记录如下。

**已合入 main**

| PR | 内容 | 合入提交 |
| --- | --- | --- |
| #411 | W1 合同与声明；W2 浮条取代底栏、Pages 迁到浮条 | `70c928ae0` |
| #494 | W2 的浏览器用例（W2-02、W2-05、W2-08）与手册的浮条章节 | `5ba2fa929` |
| #536 | W3-A1 下一步与输入框同一行（FLOW-01～05） | `ac47ed788` |
| #553 | W3-B1 把手上的东西放进左边 Pages 的落点 | `2897ae047` |
| #573 | W3-A2 助理输入框上方的情境条 | `cca71e02f` |
| #594 | 切换器的标题只在变了时重建（顺带修） | `ac6c4cd85` |
| #618 | W3-B2 情境条显示落点 | `0a931c978` |
| #651 | W3-B3 分屏窗格里的 Pages 也是落点；窗格消息一处检查（S-30） | `106d6163a` |
| #660 | BL-150 助理回复里选中的一段是手上的东西 | `57cc56635` |
| #664 | W3-A3a 页面上选的写动作留在当前工作 | `bcb304cd1` |
| #673 | W3-A3b 拿起结果卡；悬停「放进去」时闪落点 | `9fda1a405` |
| #691 | W3-A3c 分屏窗格与「更多」菜单里也闪 | `df00646d8` |
| #701 | W2'-1、W2'-2 右栏改版：Shelf 是第一格，常开插件 | `a56a2763d` |
| #704 | W2'-3 桌面：Shelf 的热键与菜单按插件名开右栏格 | `c31291c34` |
| #712 | W3-C 右栏插件格报告手上的东西 | `38beba3dd` |
| #720 | W3-C2 右栏格的浮条悬停时闪左边的落点；PICK-05（Esc 后在路上的判断回来不再画出浮条） | `b2336d5c4` |
| #730 | W4-1「记成待办」「记下灵光」并进创建入口 | `f4207e064` |
| #772 | 补回 #730 删掉的「改选区」用例；手上的东西在哪只看元素 | `bcf080dba` |
| #780 | 下一步行的结果位（21.9，SLOT-01、SLOT-02） | `8eedf2222` |
| #789 | 结果按钮由下一步行接上（SLOT-03，回执 3e-2a） | `c5213bc2c` |
| #791 | 21.9 结果位的顺序规则 | `08572e900` |
| #817 | 21.9 交付说明里的「问题」只指为补充问的问题 | `c40e7088f` |

**交接时在途、现已合入 main（2026-10-20 核对）**

| PR | 内容 | 合入提交 | 验证与剩余事项 |
| --- | --- | --- | --- |
| #801 | W4-2 Pages「存为文档」、Goals「拆成目标步骤」两个创建入口（21.10，D-1～D-6） | `335628529` | 已补真实提案确认、采用、失败重试、草稿保留与挂载回归，含 390 深色 / 1440 浅色实操截图；原 spec 的全部宽度与明暗人工矩阵仍在 BL-338 |
| #804 | W4-6a 内容站 `receive` 升到 v2，请求号取代「实例 + 步骤」（quick-create §11） | `e7bb2d44e` | D25 归 ① 等用户定时间；quick-create §11.10 的独立浏览器实走仍待补 |
| #830 | 修 QA-013、QA-014、QA-015：侧栏首开是 Shelf；390 宽情境条不再互相盖住；Pages 落点在写入前撤权或取消时什么都不写 | `a6ada23f8` | 定向非浏览器与浏览器回归、窄屏焦点与标题检查已补；66 张图中 63 张一致、3 张差异已核，22 组样式一致；全部中英明暗人工矩阵仍在 BL-338 |
| #831 | 修 QA-016、QA-017、QA-018（只改测试） | `42d8c6f6a` | 已包含在本轮完整回归；不据此宣称原 spec 的人工截图矩阵或一骏验收通过 |

本轮完整回归 [Full suite #39444644367](https://github.com/molis-ai/molis-work/actions/runs/39444644367) 通过 1176 个测试文件（其中 2 个按现有重试规则第二次通过）。最终 main `2571a328` 的完整文件树与被测树一致。逐 PR 的补修与验证记录见 [#801](https://github.com/molis-ai/molis-work/pull/801) 和 [#830](https://github.com/molis-ai/molis-work/pull/830) 评论；这些证据不代替下列剩余实走和本人验收。

**D25**：移交 ①；#804 已合入（`e7bb2d44e`），等用户定时间。D25 是真实 Home 上的一次性维护：把 MCP 客户端授权、内置 Agent 授权和 Characters 角色里八个 `<站>.content.receive` 从 v1 改成 v2；先在一次性 Home 上演练、先备份，时间由用户定（用户 2026-10-19）。计划、演练报告和脚本已交到 ① 的笔记目录，① 正式跑之前重新演练一次。已保存的工作流不在范围内，由用户自己在编辑器里修。

**分支与工作树**（本机 `.claude/worktrees/`）

- 已删（2026-10-20，⑧）：W1 的七个工作树与本地分支（`feat/context-w1-contracts`、`-declarations`、`-derivation`、`-drafting`、`-floating`、`-manual`、`feat/context-w1-split-context-actions`，内容都在 main），`context-w2-plan` 工作树。
- 工作树已删、本地分支留着：`feat/context-w1-toolbar`、`feat/context-w2-toolbar`、`feat/context-w2-bus-view` 的提交按标题都能在 main 里找到（合成 #411 时改过基），只是提交号不同；`context/w4-6-plan` 的提交在 #804 的分支里；`context/w4-2-create-entries` 已推送（#801）。强删本地分支要用户点头，由 ① 在 #801、#804 合入后一起处理。
- 留着的工作树：`agent-a197fe3b87d42bdae`（`context/w4-6a-receive-v2`，#804 的子代理工作树，带锁，提交都已推送），#804 合入后由 ① 删；`agent-aac8d653cd0e97318`（`context/qa-016-018`），#831 已合入（`42d8c6f6a`），由 ① 删；`contextual-line-38bd8a`（本会话，`context/qa-013-014` 与交接分支 `context/handover-1020`），#830 与交接 PR 合入后，归档本会话时删。
- 远端分支：仓库启用了合入后自动删除。2026-10-20 核对，#801、#804、#830、#831 的源分支已不存在；上述其他 Agent 的本地分支与工作树仍由原负责人处理。
- 一次性 Home：本线没有留下的（D25 演练用的已删）。① 在查的八个 `molis-test-home-*` 不是本线建的。

**没做完、没开工的**（`specs/BACKLOG.md`，负责人都是「未分配」）：BL-174、BL-330～BL-339。

**接续入口**：这一节取代 `coordination/2026-10-18/lines/` 下本线的线文件（不在 main 上）、第 17 节的旧交接、第 20 节的远端交接和原来开头的「统筹更正（2026-10-13 晚）」；第 20、21 节标题里的「当前接续入口」已去掉。接手时先读这一节，再读第 9 节分期、第 21.4 节片表（W4-2～W4-7 几行随 #801 进 main）与 quick-create §11（W4-6b 与 BL-174 的计划，随 #804 进 main）。第 16.5 节的对照表停在 2026-10-14，之后的进度看第 21.6 节和上面的已合入表；重核对照表记在 BL-339。

**风险与不能碰的**

- 真实 Home（日常用的那个、本机 4207 端口的服务）和真实数据不碰；用例与走查只用一次性 Home，用完删掉。D25 是唯一要动真实 Home 的事，归 ①。
- 钥匙串里的 Home 主密钥条目不删：每个 Home 共用它。MiniMax 的 key 只在命令里内联读取，不进聊天、文件和日志。
- #804 合入后，八个 MCP 工具名从 `…content.receive__v1` 变成 `__v2`，不留别名（用户 2026-10-19 定）：外部 MCP 配置写死旧名的要跟着改；真实 Home 里固定了 v1 的授权与角色，在 D25 之前报不可用。
- 页面资源每个文件只许减：新加的样式和脚本先在同一个资源里省回来，省不回才一次性放行（W4-1 用过一次）。
- `assistant-island.ts` 只减不增；`context-toolbar.ts` 的页面脚本要小于 13,900 字符（`tests/context-toolbar.test.ts`），#830 之后是 13,873。
- 用户 2026-10-20 已授权本轮合并所需的验证；已补的范围见上表。暂停期间留下的其余实走与截图欠账仍见 BL-338，不能把本轮定向验证当作全部产品验收。

本文把三批需求合成一套设计，三份子需求书各管一块，交叉的地方以本文为准：

四份完整设计原在 `feature/context-toolbar` 的提交 `7748613e8`；本轮按新基准移入 `feature/context-w0`，原设计树保留。四份仍作为同一需求整体维护，后续范围不以外部 PR 链接代替。

| 子需求书 | 管什么 |
| --- | --- |
| [side-shelf](../side-shelf/spec.md) | 右栏（Shelf 成为一格）、左右互动、落点、助理接入 |
| [context-toolbar](../context-toolbar/spec.md) | 情境浮条（取代底部动作条）、工具与面板槽、选区能力 F1–F13、手册与覆盖率门禁、存量补齐 |
| [quick-create](../quick-create/spec.md) | 创建入口 `ItemIntake`、追加和放进 `ItemAttach`、批量、选中文字运行工作流、起草服务 |

承接已合入 main 的 [contextual-interaction](../archive/contextual-interaction/spec.md)：候选派生、Jev 判断、陈列方案、冻结、记忆信号，都沿用。

## 1. 为什么合在一起

三批需求动的是同一样东西，即「人手上有一样东西时，能对它做什么、在哪里做」：

- side-shelf 让「手上的东西」可以在右栏或助理面板里，并且能放进左边的某个位置；
- context-toolbar 把显示动作的地方从底栏搬到这样东西旁边；
- quick-create 让「建成某个插件里的一条」成为每个插件都有的动作。

分开做会出三套东西：三种动作来源、两个位置规则、两种「放进已有对象」的说法。合起来以后，只有**一个动作池、一个情境中枢、一次判断、一条浮条、一条执行路径**。

## 2. 合起来之后，用户看到的

```
左：当前插件（Pages）                                   右：侧栏（Shelf · 灵光 · 文件 · 浏览器 · 电脑 · 讨论）
┌─────────────────────────────────────────────┐ ┌──────────────────────────────────────┐
│ 标题  ………………………………   [新建] [✦]            │ │ Shelf                         [✦]    │
│                                             │ │  ▸ 会议纪要.pdf   ← 选中这一行        │
│ ……正在写的段落 ▍  ← 落点（悬停「放进」时闪）│ │ ┌─────────────────────────────────┐  │
│                                             │ │ │→ Pages·第3段光标处 ┃ 插入到光标处 │  │
│                                             │ │ │ 记成待办 │ 更多▾ │ ✦助理          │  │
│  ┌──────────────────────────────┐           │ │ └─────────────────────────────────┘  │
│  │ 预览：将插入的内容 [插入][取消]│ ← 面板槽  │ │                                      │
│  └──────────────────────────────┘  画在落点处│ │                                      │
└─────────────────────────────────────────────┘ └──────────────────────────────────────┘
底栏：Dock · 助理输入框（上方是「手上 + 落点」情境条，可删）· 侧栏按钮 · 项目圆钮。不再有动作条。
```

- **只有一条浮条，贴着手上的东西出现。** 手上的东西可以在左边（选区旁）、右栏（选中的条目或选区旁）、助理面板（结果或材料旁）；拖放时，浮条出现在松手处。
- **浮条的组成**：工具（插件声明，固定在左）｜动作（≤3 个推荐，可能是改写、建成待办、追加到某条、放进左边）｜更多｜✦助理。
- **手上的东西在右栏或助理面板时，浮条最前面标出落点**，例如「→ Pages · 第 3 段光标处」。悬停「放进」类动作时，左边的落点会闪一下。
- **预览出现在要改的地方**：放进左边的预览，画在左边落点处的面板槽里；改写手上这段的预览，画在这段旁边。
- **一句话新建「✦」**：每个插件页的标题栏都有，右栏插件格的标题栏也有。
- **底部动作条取消。** 助理输入框上方只剩「手上 + 落点」情境条。

## 3. 统一模型

### 3.1 手上的东西

就是现有的 `SurfaceFocus`，加三个字段：

- `anchor`（context-toolbar）：浮条贴在哪；
- `place`（side-shelf）：取值 `main`、`side`、`assistant`；
- `side_tab`（side-shelf）：在右栏时是哪一格。

谁最后报告，谁就是手上的东西。某个表面报告「什么都没有」（`detail: null`）时，只清掉它自己报告过的内容。这条现有的总线已经这样做了，不新增清空事件。

### 3.2 落点

落点是「手上的东西可以放进去的地方」，有两种来源：

- **点击时**：左边焦点窗格此刻的光标、选区或当前对象。只有能当落点的页面才报告，事件为 `molis:surface-landing`。
- **拖放时**：松手的位置。顶层用 `molis:landing-at {x, y}` 问那一处的页面。拖放的落点不限于左边：拖到右栏的讨论输入框、Shelf 格，也是落点。

### 3.3 候选

候选只有一个池，有五种来源，都在统一能力目录里声明一次：

| 来源 | 键 | 声明 | 子需求书 |
| --- | --- | --- | --- |
| 选区动作 | `frag.` | `fragment_offer_choices` | 已有 |
| 对象动作 | `offer.` | `subject_offer_choices` | 已有 |
| 创建入口 | `intake.<provider>.<id>` | `ItemIntake` | quick-create |
| 追加和放进 | `attach.<provider>.<id>` | `ItemAttach`，**加 `positions`**（见 3.4） | quick-create F2 + side-shelf |
| 运行工作流 | `wf.<工作流 id>` | Workflows 按项目动态枚举 | quick-create F13 |

**创建类候选只在推荐位出现**（用户已定）：创建入口、追加、运行工作流这些「去处」类候选，只在浮条的 ≤3 个推荐位里出现，不进「更多」，也不进「全部操作」；够不着的去处靠「✦助理」里的一句话，或那个插件页面的「✦」。

候选池之外还有两类东西，都不进判断：

- **工具**（`ContextTools`）：插件声明，只作用于当前打开的内容。分界口诀（context-toolbar §3）：Agent 会不会也想调它？会就是动作，进目录；只是编辑器里的一个按键，就是工具；
- **系统工具**：复制为引用等，外壳自带。

### 3.4 「追加」与「放进左边」是同一件事

quick-create 的 F2「追加到已有 Item」和 side-shelf 的「放进落点」，都是把手上的东西放进一个已有对象，区别只在目标怎么定：

- **F2**：目标由 Jev 从候选里挑，候选来自搜索来源加上最近打开的；放在末尾，或作为关联。
- **side-shelf**：目标就是落点，左边打开的对象，位置精确到光标或选区。

所以合成一个声明 `ItemAttach`，在 quick-create 草案的基础上加一个字段：

```ts
interface ItemAttach {
  attach_id: string; item_kind: string; title: string; verb: string; describe: string;
  action: ActionReference;            // 插件自己已有的写入动作，带版本条件
  material_field?: string;
  find?: ...;                         // 怎么找候选目标（F2）
  positions?: readonly ("cursor" | "selection" | "end")[];
  // 能放到哪个位置。含 cursor / selection 时，若左边落点正好是这种对象，落点就是首选目标，位置精确
  undo?: ActionReference;
}
```

- **一个候选只有一种目标**：`positions` 只用于落点目标（左边当前打开的编辑器）；`find` 找到的目标一律放末尾或建关联。同一份声明在两种情形下各产生自己的候选，不会混在一起。
- side-shelf 草案里挂在可选动作上的 `landing` 字段，以及 `place` 效果的声明方式，都由此取代。
- 「落点动作只能由落点对象的主人提供」这条规则不变：`ItemAttach` 本来就由目标对象所在的插件声明。

### 3.5 判断

- 规则先筛，把候选压到 12 个以内（context-toolbar），其中创建类 ≤ 8 个（quick-create），再交给 Jev 两题排序。
- 运行时的延迟预算沿用 1.5 秒，超时退回规则排序。
- 仅本人可见的来源（Shelf）：内容不进 Jev，只按形状和种类排；用户点了具体动作之后，才把内容用于起草。
- 两组评估：
  - 左右互动：门槛已由用户定为首位 ≥ 80%、前三 ≥ 95%、p95 ≤ 2 秒；
  - 最合适的去处：先测一轮，再定目标。

### 3.6 执行：四条路，一条总规则

| 动作写到哪 | 谁执行 | 确认方式 |
| --- | --- | --- |
| 只读结果（解释、总结、旁问） | 平台，结果显示在面板槽里 | 不用确认 |
| 改手上这段（替换、插到后面） | 手上东西的主人页面，在原处预览 | 预览后确认（现有规则） |
| **放进落点**（`ItemAttach` 的光标或选区位置） | **落点的主人页面**，在落点处的面板槽里预览 | **一律预览确认**（用户已定） |
| 写到别处（创建、追加到末尾、记录、工作流） | 动作服务 | 声明了 `undo` 的直接执行，结果提示带「撤销」「改放到」；没声明的、提案类、工作流运行，出预填卡片一键确认（quick-create 已定） |

**总规则：写进人眼前正在编辑的对象，一律先预览；写到别处的，按插件声明决定。**

### 3.7 守则（三份需求书都适用）

- **能力只登记一次**：外壳里不出现按 `plugin_id` 的分支；插件启停，浮条上的动作和去处随之增减。
- **隐私**：仅本人可见的来源（Shelf）里的内容不进判断模型，只按形状排序；用户点了具体动作之后，才把内容用于起草或交给助理。
- **脱敏**：选区文字、用户的话进模型前，先过 `redactText` 和 `screenInbound`；像指令的文字一律当数据。
- **只许本机本人的动作**（Coding 这类，`LOCAL`）：只在本机界面里由人点击触发，不进 Agent、MCP 受众。
- **可信身份**：actor、项目从调用上下文来，不从输入或用户的话里读。
- **浮条不抢焦点**：`mousedown` 一律 `preventDefault`，选区高亮不变；⌘. 进入，←→ 移动，Esc 回到原处。
- **界面**：遵守 `DESIGN.md`，浮层只用 `--shadow-raised`、不描边，动效只用 `--dur-*`；深色、窄屏、减少动画、读屏、触屏都要走一遍。
- **动态动作的逻辑不改**：候选、判断、陈列、冻结、记忆信号，都沿用 contextual-interaction，只换显示的地方、加来源。

## 4. 合同：合起来一共加什么

| 合同 | 内容 | 来自 |
| --- | --- | --- |
| `SurfaceFocus.anchor` | `rect` / `element` / `placement` | context-toolbar §5.1 |
| `SurfaceFocus.place`、`side_tab` | `main` / `side` / `assistant` | side-shelf |
| 落点 | `SurfaceLanding { pane_id, plugin_id, object, position, anchor?, version }`；事件 `molis:surface-landing`、`molis:landing-at` | side-shelf |
| 工具与面板槽 | `molis:context-tools`、`molis:context-tool-invoke`、`molis:context-panel-open` | context-toolbar §5.2–5.4 |
| `ItemIntake` | 含 `multiple`（F3）、`effect`、`undo`、`prepare` | quick-create §4、§6.2 |
| `ItemAttach` | 含 `positions`（本文 3.4） | quick-create §6.2 + side-shelf |
| `places` | 可选动作和创建入口可选带，只用来收窄范围，缺省是哪里都可以 | side-shelf |
| side 视图的 `objects` | 这一格显示哪些对象种类 | side-shelf |
| 冻结 | `FrozenFocus` 同时冻结落点 | side-shelf |
| 工作流 | `instances.start` 加 `payload`；可选动作按项目动态枚举 | quick-create F13 |
| 内容站幂等键 | 泛化为请求号（只认现行形状，不新增读取兼容） | quick-create |
| 插件 SDK 页面端 | 一个 `contextual` 模块：报告手上的东西或落点、发布工具、开面板槽、接收放进与工具调用 | 合并 side-shelf 4.4 与 context-toolbar §11 |
| 平台自带的格 | 讨论、浏览器、文件按 side 视图的形状登记；`browser_page`、`discussion_message` 的读取动作 | side-shelf |
| Shelf 是常开插件 | Manifest 的通用声明 `always_on: true`（「常开插件」）：始终启用、不进插件列表、市场、Dock、项目插件管理，不能从项目里移除；只有内置插件能声明（S-34；2026-10-18 改：改成按声明与授权，实现前仍如此）；Shelf 只有 side 视图 | side-shelf §7、§11 |
| 页面自己陈列动作 | 对象声明里的一个通用字段，表示「本提供方的动作由我自己陈列」；浮条在这个表面上不重复列出这个提供方的动作（Shelf 格用它） | 本文 §7 |

目录检查合并为一组（side-shelf 4.3 与 context-toolbar §11.5 的覆盖率门禁放在一起）：

- 声明了 `objects` 的种类，都要有读取器；
- `ItemAttach` 只能指向提供方自己的对象种类；
- 带光标或选区位置的写入动作，必须带版本条件；
- 选项键唯一；
- 覆盖率名单冻结，只许减少。

## 5. 情境中枢与跨文档

- **大脑只有一个**：顶层的情境总线（`context-actions.ts` 的 `bus`）同时持有手上的东西、落点和陈列方案。
- **右栏的 iframe 格当作窗格处理**：Shelf、灵光、讨论、插件侧栏视图，复用现成的三条窗格消息（`workbench-surface-focus`、`-context-plan`、`-context-action-choose`）；再加一条落点消息。
- **浮条画在拥有手上东西的那个文档里**（context-toolbar 的规则）：
  - 右栏 iframe 格自己画；
  - 文件格就在顶层文档里，直接画；
  - 浏览器格的画面是 canvas，由浏览器服务给出选区矩形，外壳把浮条画在 canvas 上方；
  - 助理面板在顶层文档里。
- **落点预览画在落点主人的文档里**，即左边窗格。顶层把冻结后的选择交给它，它用面板槽预览。
- **右栏较窄时**：右栏宽度多在 360–480px，按 context-toolbar §6「窄屏」的规则，动作区只留 2 个，其余进「更多」；工具区折成「格式 ▾」。
- 拖放用自有的数据类型 `application/x-molis-hand+json`。桌面版 Shelf 的行要和 AppKit 原生拖出分开：拖到窗口内算应用内放置，拖出窗口交给系统。切片阶段先验证。

## 6. 助理

- **助理输入框上方的情境条**：显示「手上 + 落点」，默认带上，可删（用户已定）。
- **浮条上的「✦助理」**：面板槽里一行可选的输入（context-toolbar），说的话连同手上的东西和落点一起交给助理。
- **零输入创建和追加**：走起草服务（quick-create）。它是一次结构化推理，不开 Agent 轮次；起草时也用到落点。
- **助理自己在一轮里放东西或建东西**：经只读系统动作取同一份候选，页面 HTTP 也调用该动作；结果做成卡片，放进落点一律先预览确认。当前只有工作台 HTTP，动作提升是后续产品接入工作，W0 不实现。
- **助理面板是一个位置，第一期就做（用户已定）**：助理给出的结果或材料选中后，浮条贴在它旁边出现。
- **「更多」底部的助理一组**（context-toolbar）：「带到助理」「说出要做什么」，所有插件共用。
- **改动边界**：助理面板归 `assistant-island.ts`，contextual-interaction §6.3 与助理面板线约定过边界。情境条、助理面板作为位置这两处，动工前先通知助理面板线和助理线的会话。

## 7. 右栏与浮条的交点

- **Shelf 格里各管一半**（用户已定）：DropAgent 原有的动作栏原样保留，管 Shelf 自己的动作（整合、提取文字、快捷动作、Agent 动作）；贴在选中行旁的浮条只显示「去别处」的动作（放进左边、建到别的插件、交给助理）。实现上用一条通用声明，不按插件名分支：页面在对象声明里写明「本提供方的动作由我自己陈列」，浮条就不重复列出这个提供方在这个表面上的动作。Shelf 的动作仍登记进池，在别的格或左边拿着文件时照样能被推荐。
- **材料篮（F8）就用 Shelf**（用户已定）：「加入材料」就是放上 Shelf；在 Shelf 格里多选几项，浮条上就有「一起交给助理」。不另做临时暂存篮，材料跨页面、跨项目都留得住。
- **F12 带到项目讨论**：讨论格的输入框成为右栏上的一个落点。放进去只是放进输入框，不写记录，由用户自己发送。这取代 context-toolbar §10.4 里那条待设计的「讨论草稿入口」。讨论是 iframe 里的 im-ui，现在的 `molis:side-open` 没有草稿入口，IM 的 `quote_id` 也只能引用已有消息，所以 im-ui 要新做两件事：输入框报告落点；接收带出处的外部引文（新格式）。
- **左→右**：「收进 Shelf」「记下灵光」就是这两个插件的创建入口，不另做一套。落进去之后，右栏自动切到那一格，并高亮新建的那一条（side-shelf 3.1「某件事需要右栏时打开相关的那一格」）。
- **右栏插件格的标题栏也有「✦ 一句话新建」**，例如灵光、Shelf。
- **「文件」格收什么（2026-10-09 按[成果库定位](../archive/artifact-positioning/spec.md)核对）**：它是只读的汇总，收三样：项目的成果（固定版本，预览走类型 owner，与成果库同一份渲染）、各插件声明的文件来源（Pages 文档、工作区文件等）、Shelf 的材料（`shelf.files.entries`，个人范围，列材料与结果，不列文件夹和失败的）。**过程项一律不进**：Shelf 交给项目的文字材料 `shelf.text-material.v1`、Coding 的变更集与计划、Files 的快照等，不进「文件」格、成果库和搜索，所以也不会以「文件」格条目的身份成为手上的东西；它们只在消费它的插件里出现（Coding 的材料、Shelf 收下的副本）。Shelf 材料两边都出现：「文件」格只能看，Shelf 格能加工。
- **左边的东西「收进 Shelf」只建个人材料**：底层动作是现有的 `shelf.items.admit`（收文字与标题，个人范围），撤销用 `shelf.items.delete`；它不产生过程项。过程项只在用户把 Shelf 的一份材料交给项目时（`shelf.material.save`，只许人）才产生。

## 8. 能力总表：扩展的动作和能力都在哪

三份子需求书里要扩展的每一项，都在这张表里有一行：细节写在哪一份、在哪一波做。细节以子需求书为准，本表只负责「一项都不漏」。

### 8.1 平台能力

| 能力 | 细节在 | 波次 |
| --- | --- | --- |
| 情境浮条：单行版式（窄时工具折成「格式 ▾」）；工具、动作、更多、✦助理、面板槽；打字时不自动浮出，选中、⌘. 或段落把手才出；底部动作条整个取消、无锚点不显示；行为规则（350ms 后出、不跳、何时收、不遮字、让位、与助理面板并存、关闭开关） | context-toolbar §2–§7、§9 | W1、W2 |
| Pages 迁移：格式条、写作菜单、「AI」按钮并进浮条 | context-toolbar §7 | W2 |
| 右栏改版：Shelf 不再是插件、原样成为右栏一格；格的顺序 Shelf · 灵光 · 文件 · 浏览器 · 电脑 · 讨论，首开 Shelf、之后回到上次那格、需要时开相关格；Shelf 格窄时上下叠放、≥640px 两栏；底栏 Shelf、灵光按钮并进侧栏按钮；侧栏去掉群聊命名；桌面热键、菜单栏、轮盘、搜索、旧地址改道；Shelf 设置留在全局设置；「文件」格与 Shelf 分开，Shelf 材料两边都出现 | side-shelf §3、§7 | W2' |
| 右栏六格与助理面板也能是「手上的东西」，浮条贴着它们出现 | side-shelf §6、本文 §5 | W3 |
| 落点与「放进左边」（`ItemAttach` 的光标、选区位置），在落点处预览 | 本文 3.2、3.4、3.6 | W3 |
| 拖放：浮条出现在松手处；与桌面版 Shelf 的原生拖出分开 | 本文 §5、side-shelf 4.6 | W5 |
| 助理：情境条、同一份候选出卡片、助理面板是一个位置 | 本文 §6、side-shelf 4.7 | W3 |
| 起草服务（零输入创建、追加），一次结构化推理，不开 Agent 轮次 | quick-create §6 | W1 |
| 判断：规则先筛 ≤12（创建类 ≤8）、Jev 两题、两组评估、隐私来源不进 Jev | 本文 3.5 | W0（评估）、W1 |
| 合同、目录检查、关系视图、SDK 页面端模块 | 本文 §4、side-shelf 4.3–4.4 | W1 |
| 手册、Skill、`plugin create` 模板、覆盖率门禁（冻结名单只许减少）；side-shelf 的新声明（`objects`、`places`、落点报告、`ItemAttach.positions`）写进同一份 `contextual.md`、纳入同一个门禁 | context-toolbar §11 | 随各波 |
| 平台零代码默认：工作台按搜索来源代为声明对象；内容站 `receive` 派生创建入口；生成插件由平台绘制处代写对象声明与「✦」；`plugin create` 模板带三件事 | context-toolbar §11.2 | W1 起；生成插件的「✦」与创建入口可以由平台代写，对象声明要先补平台侧的种类与读取器（15.4） |
| G1 文本框里选字；G2 画布与终端自报焦点；G3 对象级动作贴在行旁（`anchor.element`） | context-toolbar §10.1 | G1 在 W7 的 F4 之前；G3 在 W3（Shelf 等右栏条目要用） |

### 8.2 选区与对象上的动作家族（context-toolbar §10.7）

| 家族 | 合并后的做法 | 细节在 | 波次 |
| --- | --- | --- | --- |
| F1 创建 Item（含插件页和右栏格的「✦ 一句话新建」） | 创建入口 `ItemIntake`；「记成待办」「记下灵光」并入，旧的删掉 | quick-create §3–§6.1 | W4 |
| F2 追加到已有 Item | 与「放进左边」合成 `ItemAttach`（本文 3.4）。目标是落点时用 `positions`；目标由 `find` 找到时，一律放末尾或建关联 | quick-create §6.2、本文 3.4 | 落点部分 W3；`find` 部分与 F1 同在 W4 |
| F3 一次提取多个 Item | `ItemIntake.multiple`，一张批量卡片可逐条取消 | quick-create §6.2 | W4（与 F1、F2 同一套起草与卡片） |
| F4 任意文本框润色、翻译 | 依赖 G1；写作类动作改为不挑对象的提供方 | context-toolbar §10.7 | W7 第一批 |
| F5 只读问答、旁问（btw） | 并入旁问：`result` 动作 + 面板槽内联答复；Coding 与助理各提供一个（8.5） | context-toolbar §10.3、本文 8.5 | W7 |
| F6 识别选中的是什么（链接、路径、日期、邮箱） | 选区动作加 `matches` 过滤 | context-toolbar §10.7 | W7 第二批 |
| F7 带出处的复制引用 | 系统工具 | context-toolbar §10.7 | W7 第二批 |
| F8 材料篮 | **就用 Shelf**：「加入材料」就是 Shelf 的创建入口「收进 Shelf」；在 Shelf 格多选几项，浮条上出现「一起交给助理」。Shelf 是仅本人可见的来源，内容只在用户点了具体动作后才进模型 | 本文 §7 | W6 |
| F9 批注与标记 | 新服务，排最后 | context-toolbar §10.7 | W7 最后 |
| F10 记住 | 用现有的 `memory.write`（「记住一件事」，2026-10-09 核对）：人点的写入经写入门直接生效，撤销用 `memory.changes.undo`；Agent 写的只成为待认可的建议。与 Coding C3 共用这一个入口 | context-toolbar §10.7 | W7 第二批 |
| F11 做成规则或自动化 | 并入 F1：各插件「建规则」就是它的创建入口 | context-toolbar §10.7 | 随各插件补齐 |
| F12 带去别处讨论 | 带到助理已有；带到项目讨论 = 讨论格的输入框作为落点。im-ui 要新做：输入框报告落点、接收带出处的引文（现有 `quote_id` 只能引用已有消息） | 本文 §7、context-toolbar §10.4 | W6 |
| F13 运行工作流 | 见 8.4 | quick-create §6.2 | W7 第一批 |
| 分叉（fork，Coding） | Coding 的对象级动作，调 `forkSession`；会话列表显示分叉关系（8.5） | context-toolbar §10.3、本文 8.5 | W7 |

### 8.3 各插件要补的动作

| 清单 | 细节在 | 波次 |
| --- | --- | --- |
| 「放进左边」**第一批（W3）**：Pages 插入到光标处（没有光标放文末）、替换选中的文字、作为引用插入（带出处）。都是确定性的 `ItemAttach` 声明，预览就是将写入的内容 | side-shelf 5.4（2026-10-12 已分批，§14）。与 context-toolbar §10.4 的「Pages 追加到文档」是同一批 | W3 |
| 「放进左边」**第二批**：Pages 整理成要点后插入（要 W1 起草服务）；Goals 作为依据附上（要 Goals 报告落点）；Coding 放进当前会话的下一轮材料（要 Coding 自己名下的文字摘录过程项 `coding.text-excerpt.v1`，8.5） | 同上；与 context-toolbar §10.4 的「Goals 作为证据」「Coding 放进某个会话的下一轮」是同一批，合并为一份 | 前置条件到位后，W3 之后 |
| 各插件的创建入口（Todo、灵光、Pages、Inbox、Goals 先，其余按 ● ◐ ○） | quick-create §7 | W4 起 |
| context-toolbar §10.4 第一张表里不属于创建入口的去处：Coding「补充给正在运行的这一轮」（`steer`，只许本机本人，必须出卡片）；Schedule、Jelly 识别出时间后建事项或提醒；Text stats 统计这段文字（纯计算动作的样板） | context-toolbar §10.4 | W7 起 |
| 各插件自己对象上的专属动作与工具（Todo 拆成子待办、Feed 建规则、Inbox 转待办、Dataset 核对数字、PPT 扩写……） | context-toolbar §10.4 第二张表 | W7 起，按 context-toolbar §11.6 的波次 |
| Shelf 的 DropAgent 动作登记进池（整合、提取文字、快捷动作、Agent 动作） | side-shelf U6 | W6 |
| 存量插件补齐：五项完成标准，「待补」名单清零 | context-toolbar §11.6 | W7 起 |

### 8.4 工作流在这套设计里的位置

工作流有四处和这套设计相关，都不另起机制：

1. **选中内容运行工作流（F13）。** 每个工作流是 Workflows 插件提供的一个动态候选（键 `wf.<工作流 id>`，按项目枚举、有上限、准备时核对它还在）。它的名称和站点链进 Jev 的判断材料。点了之后，手上的东西作为第一个节点的输入：第一站是内容站，它的 `receive` 创建 Item，然后照常往下推进。`instances.start` 要加 `payload`（标题、正文、出处）。工作流可能连着外部动作，所以**总是出预填卡片**，确认才运行。手上的东西不限来源：左边的选区、右栏的条目、助理面板的结果都可以。
2. **内容站就是创建入口。** 已实现内容站 `receive` 的 8 个插件（Form、灵光、Inbox、Dataset、Jelly、Feed、PPT、Pages），由平台从站点声明派生出创建入口。幂等键从「工作流实例 + 步骤」泛化为「请求号」（读写都只认现行形状）。
3. **这里登记的动作，工作流也能当步骤用。** 创建、追加、放进的底层动作都是普通能力，工作流按现有合同使用，参数显式给出。只有需要界面落点（光标、选区）的那一层，只在界面里出现。
4. **做成规则或自动化（F11）。** 「以这段为样例建一条 Feed 规则或工作流步骤」，是各插件的创建入口，不单列。

（细节：quick-create §6.2、context-toolbar §10.7 F13 行。）

### 8.5 Coding 在这套设计里的位置

Coding 有两类东西和这套设计相关：一类是**现在就有的能力**，要接进浮条和右栏；另一类是 [Coding 下一阶段需求书](../coding-plugin/next-requirements.md)里**和这里交叉的条目**。凡是会改文件、会开跑的，都只许本机本人（`LOCAL`），不进 Agent、MCP 受众，而且一律出卡片确认。

**现有能力的接入**（2026-10-02 按代码核对）

| 能力 | 在这套设计里 | 细节在 | 波次 |
| --- | --- | --- | --- |
| 放进当前会话的下一轮材料（带出处，不开跑） | `ItemAttach`，落点是左边打开的 Coding 会话；改会话属于只许本机本人的写入，在落点处预览确认。按成果库定位（2026-10-09 核对）分两种来源：手上是 **Shelf 材料**时复用现有通路——`shelf.material.save` 把它交给项目，成为 Shelf 名下的过程项 `shelf.text-material.v1`，Coding 经 `materials` 端口挂到这个会话；手上是**别的东西**（网页选段、Pages 选区、助理结果）时，Coding 现在没有通用的文字摘录材料，要新增一个 **Coding 自己名下的过程项类型**（暂名 `coding.text-excerpt.v1`，带出处），不经 Shelf、不进成果库 | side-shelf 5.4、context-toolbar §10.4 | W3 |
| 补充给正在运行的这一轮（`coding.runs.control` 的 `steer`） | 只在有一轮正在运行时出现；只许本机本人；必须出卡片 | context-toolbar §10.4 | W7 |
| 放进 Coding 的输入框 | 输入框作为落点（与讨论输入框同一做法）；只放进去、不写记录，由用户发送 | context-toolbar §10.5、本文 §7 | W6 |
| 新开编码会话并放入这段话（不开跑） | 创建入口，底层动作是 `coding.sessions.create`（2026-10-09 核对：原写的 `coding.create-session` 是路由 id；它的受众是 user、agent、workflow、mcp，**不是**只许本机本人）。没有撤销动作，所以出预填卡片 | quick-create §7 | W4 之后按 ◐ |
| 在转录里选中回复或日志：存成待办、存为成果、补充给这一轮、放进下一轮、复制为引用 | 选区动作加推荐的创建动作。先核对：转录里选的字算不算会话对象 | context-toolbar §10.4 第二张表 | W7 |
| Coding 的报告与变更：收进 Shelf、发到左边 | 2026-10-09 按成果库定位改写：Coding 的执行报告是**成果**（`coding.report.v1`），变更集是**过程项**（`coding.changeset.v1`）。Shelf 用现有的接收通路（`shelf.results.list`、`shelf.results.preview`、`shelf.results.receive`，带 `expected_fingerprint`）把任一种收成一份**个人副本**（Markdown 材料，记着来源）。收下后它就是普通 Shelf 材料：在 Shelf 格里选中就是手上的东西，能放进左边，出处指回原报告或变更集。变更集不会因此进成果库、侧栏文件或搜索；报告要留存引用，引用成果库里的那一版，不从 Shelf 副本再存一次 | Shelf README、本文 §7 | W6 |
| Files 的选区引用给 Coding（`files.text-selection.v1`） | 入口收进浮条 | context-toolbar §10.4 Files 行 | W7 |
| 对话里的网址（开发服务器等）在右栏浏览器打开 | 已有（侧栏的存量接入） | archive/side-panel §4.1 | 已有 |

**下一阶段需求书里的交叉条目**

| 条目 | 在这套设计里 |
| --- | --- |
| **C4 旁问（Codex `/btw`）** | 做成平台级形态：选中一段，浮条上出现「问一下」。两个提供方：Coding 的「问问这一轮 / 这个会话」（开一个只读的临时一轮，带会话上下文），助理的「问一下（不记入工作）」，在「更多」里按提供方区分。答案显示在浮条下方的面板槽里。边界：只读、不带工具、不改文件；不进会话历史；不打断正在跑的一轮；不进判断、不进记忆。三个出口：继续问、放进会话（写入类，出卡片）、复制。手上的东西在左边、右栏、助理面板都能问。核心（只读临时一轮）是 Coding 自己的活，浮条上的入口是这里的声明 |
| **C1 会话分叉（fork）** | 对象级动作：Coding 的一轮或一条回复旁边出现「从这里分叉」（用 G3 的 `anchor.element` 贴在那一行旁）。调用 SDK 的 `forkSession`（现在 Coding 和 agent-host 都还没接）；可选同时把文件回到那一轮的检查点。**会话列表要显示分叉关系**（C1 的验收：同一任务分叉出两种做法，做完再比较）。写入类，只许本机本人，出卡片 |
| C3 长期记忆 | 与 F10「记住」用同一个记忆写入口：模型提出、用户确认后才写；入口一处，不做两套 |
| C2 整段导出、分享 | 是整段会话的事，不是选区的事，不进浮条；以后可作为会话的对象级动作 |
| D3 模型操作浏览器 | **共用右栏浏览器**（用户 2026-10-02 定）：Coding 的模型也在右栏那个浏览器里操作，网站授权、接手与交还、截图遮蔽只有一套；Coding 里的「浏览器」一栏改为打开右栏的浏览器格。一个项目只有一张标签页，助理和 Coding 同时要用时排队，并明确告知谁在用 |
| A3 图片输入 | 依赖 A3 落地：把右栏的图片（Shelf、文件格）拖进 Coding 输入框，作为图片附件放进去 |

**分工**：C1、C4 的核心（接 `forkSession`、只读临时一轮）归 Coding 自己的下一阶段工作；浮条入口、面板槽里的答复、会话列表里的分叉关系，按本文的波次做。两边谁先到，另一边就接上，不重复造。

## 9. 合并后的分期

排期按依赖推进：浮条、创建入口、右栏是职责分块，不再代表三个并行 writer。当前仅一个 writer；共享合同、底栏和情境总线串行修改，由统筹安排构建与浏览器时段。原先“谁先改谁告知”的安排停止适用。

| 波次 | 内容 | 来自 | 可并行 |
| --- | --- | --- | --- |
| W0 | 本总纲定稿；一个高保真切片，同时演示：左边选区浮条、右栏条目浮条与落点、拖放、推荐的创建动作、「✦」一句话新建、落点处预览；两组 Jev 评估 | 三份的 S0 / Q0 / P0 | — |
| W1 共享件 | 浮条组件与定位上移；全部新合同（第 4 节）；情境中枢扩展（右栏和助理也能报告手上的东西、落点）；起草服务；SDK 页面端模块；目录检查与覆盖率门禁骨架；第一份 `skills/molis-plugin-dev/contextual.md` | CT S1 + QC Q1 + SS P2 | 一个 writer 按依赖先合同后调用方 |
| W2 | 外壳换成浮条 + Pages 迁移，同一个 PR | CT S2+S3 | 与 W2' 涉及共享外壳，串行 |
| W2' | 右栏改版：Shelf 进右栏、底栏按钮合一、旧入口改道 | SS P1 | 与 W2 都改底栏，统筹串行安排 |
| W3 | 右→左：右栏六格与助理面板报告手上的东西（含 G3 贴在行旁）；Pages、Goals、Coding 报告落点并声明 `ItemAttach` 的位置（第一批放进动作，8.3）；落点处预览；助理情境条 | SS P3 | 依赖 W1、W2 |
| W4 | F1 创建入口第一批（Todo、灵光、Pages、Inbox、Goals）+ F2 追加（`find` 目标）+ F3 批量，同一套起草与卡片；插件页和右栏格的「✦」；浮条里推荐创建动作 | QC Q2 | 依赖 W1、W2 |
| W5 | 拖放（浮条出现在松手处） | SS P4 | 依赖 W3 |
| W6 | Shelf 动作进池；左→右（Shelf、灵光的创建入口）；F8 材料篮 = Shelf 多选交给助理；F12 讨论输入框作为落点 | SS P5、P6 + CT F8、F12 | 依赖 W4 |
| W7 起 | 第一批：F4（先做 G1）、F13 运行工作流；第二批：F6、F7、F10；旁问与分叉；最后 F9；各插件专属动作与存量补齐按 context-toolbar §11.6 的波次 | CT §10.7、§11.6，QC §6.2 | 每项独立小 PR |
| 收尾 | 真实 Home 全面验证；全量回归对照基线；三份子需求书与本文归档 | 三份 | — |

## 10. 被调整的既有决定

| 原决定 | 调整为 | 依据 |
| --- | --- | --- |
| side-shelf U5：底栏动作条跟着手上的东西走 | 浮条贴着手上的东西出现；拖放时弹出的仍是同一份列表 | context-toolbar 已定「底部动作条整个取消」（用户 2026-10-02），晚于 U5；「一条动作栏、一份列表、跟着手上的东西走」的本意不变 |
| side-shelf 3.3：动作条前面标出来源 | 不再需要标来源，因为浮条就在来源旁边；只标落点 | 同上 |
| side-shelf §5.2：可选动作上的 `landing` 字段 | 并入 `ItemAttach.positions` | 用户（本文 3.4，第 11 节问 4） |
| side-shelf 草案：`molis:hand-clear` 事件 | 删掉，沿用 `surface-focus` 的 `null` | 现有总线已经这样做 |
| context-toolbar §10.4：项目讨论「○ 要新增草稿入口」 | 讨论输入框作为落点 | 本文第 7 节 |
| quick-create §7：Shelf「收进置物架」 | 同时就是左→右的那条路 | 本文第 7 节 |
| context-toolbar §10.7 F8：外壳里的暂存篮 | 就用 Shelf：「加入材料」= 放上 Shelf，多选后一起交给助理 | 用户（第 11 节问 1） |
| side-shelf U6：Shelf 格内 DropAgent 动作栏不动、动作另登记进池 | 保留，并明确分工：浮条在 Shelf 格里只显示去别处的动作 | 用户（第 11 节问 2） |

## 11. 用户的决定、还没定的与待核对

四问用户都已按推荐拍板（2026-10-02）：

1. ~~材料篮（F8）要不要就用 Shelf~~：就用 Shelf（第 7 节）。
2. ~~Shelf 格里两套动作界面怎么分工~~：各管一半（第 7 节）。
3. ~~三份子需求书要不要合到一处~~：四份形成同一需求整体，接口以本文为准；原设计分支和 goal-prompt 属历史安排，本轮按第 15.7、16.2 节执行。
4. ~~F2 与「放进左边落点」是否合成一个 `ItemAttach`~~：合成一个（3.4）。

原留到切片阶段看着实物再定的两件事，2026-10-12 已由统筹按用户的规则定下（见 §14 末两行），用户验收时可推翻：第一批「放进左边」只做 Pages 的三个确定性动作；平台格的对象种类叫 `browser_page`、`discussion_message`。

**开工前先核对**：六项都已核对（2026-10-09，按 origin/main 11878059），结果写回了对应的子需求书，汇总在第 15.4 节：

- ~~生成插件的绘制处能否代写对象声明和「✦」槽~~：部分可以。「✦」与创建入口可以代写；对象声明还缺平台侧的对象种类与读取器（context-toolbar §11.2）；
- ~~Goals 事件类动作的能力名~~：`goals.note`、`goals.concerns.apply`、`goals.decisions.request`、`goals.progress.record`、`goals.relations.add`（只许人）；「风险」已移出 Goals（context-toolbar §10.4）；
- ~~记忆合同有没有显式写入入口~~：有，`memory.write`（本文 8.2 F10 行）；
- ~~Shelf 有没有创建文字材料的动作~~：有，`shelf.items.admit`，撤销用 `shelf.items.delete`（本文 §7）；
- ~~Coding 转录里的选字算不算会话对象、Jelly 笔记块能否选中~~：Coding 算，每一轮有 `data-turn` 可作锚点；Jelly 笔记块是 `contenteditable`，通用路径现在排除它，并进 G1（context-toolbar §10.1）；
- ~~浏览器服务能否给出页面选区的矩形~~：能，经现有的 `evaluate()` 取 `getSelection()` 的矩形，再按现有的视口比例换算到 canvas（side-shelf §6）。

**风险**：

- 桌面版 Shelf 行的原生拖出和应用内拖放冲突：W0 切片先验证；
- 右栏窄、浮条挤：按窄屏规则只留 2 个动作；
- 候选膨胀：规则先筛到 ≤12 再交给 Jev；
- 运行时延迟预算 1.5 秒，左右互动评估的门槛却是 p95 ≤ 2 秒：落在 1.5～2 秒之间的会退回规则排序，评估时一并记下退回的比例。

## 12. 跨三份的验收

各子需求书的验收照旧（side-shelf AC-S、context-toolbar AC-T、quick-create AC-Q）。下面几条只在合起来时才看得出，由总纲负责：

| # | 验收 |
| --- | --- |
| AC-P01 | 同一个手上的东西，浮条、拖放时弹出的列表、助理卡片给出的候选是同一份，准备核对是同一次（对照测试，仿 `tests/contextual-dock-parity.test.ts`） |
| AC-P02 | 手上的东西在左边、右栏、助理面板三处都能出浮条；在分屏窗格和右栏的 iframe 格里，浮条画在它们自己的文档里 |
| AC-P03 | 放进落点的预览出现在左边的落点处，确认前不写入；写到别处的按插件声明（`undo` 直接执行并带撤销，其余出卡片） |
| AC-P04 | 创建类候选只在推荐位出现；Shelf 格里，浮条不重复 DropAgent 动作栏已有的 Shelf 动作 |
| AC-P06 | 在 Coding 转录里选一段，浮条上有「问一下」：答案出现在面板槽里，不进会话历史，不打断正在跑的一轮；在一条回复旁点「从这里分叉」，出卡片，确认后建新会话，会话列表显示分叉关系 |
| AC-P05 | 外壳没有按 `plugin_id` 的分支；仅本人可见来源的内容不进判断模型；`pnpm boundary:check` 通过；覆盖率门禁名单只减不增 |

## 13. 附录：需求对照表

每一条用户提出或已定的要求，对应在哪里写着。

**本会话（右栏与左右互动，2026-10-01～02）**

| # | 要求 | 写在 |
| --- | --- | --- |
| R1 | Shelf 放到右边侧栏，不当插件，也不是右栏里的一个插件标签 | side-shelf 3.2、§7；本文 §4「Shelf 是常开插件」 |
| R2 | 右边的内容包括灵光、文件、浏览器内容、群聊 | side-shelf 3.1、§6 |
| R3 | 右边可以和左边互动，右边的内容可以发送到左边 | 本文 3.2、3.4、3.6；side-shelf 3.3 |
| R4 | 侧边不止是群聊里 | side-shelf 3.1、§7（去掉 `dock-window-im` 等群聊命名） |
| R5 | 会有一整套动作，Jev 选择、动态生成 | 本文 3.3、3.5 |
| R6 | 原 Shelf 原样保留成右栏的一格（U1） | side-shelf 3.2 |
| R7 | 双向，先做右→左（U2） | 本文 W3、W6 |
| R8 | Jev 只从统一目录里挑（U3） | 本文 3.3、3.5 |
| R9 | 动作栏不只管发送；同一个动作池、同一份列表；细化可用范围（U4） | 本文 3.3、§4（`places`、`objects`、`ItemAttach.positions`） |
| R10 | 动作栏跟着手上的东西走，拖放弹同一份列表（U5，已按浮条调整） | 本文 §2、§10 |
| R11 | Shelf 格内 DropAgent 动作栏不动，动作登记进池（U6）；与浮条各管一半 | 本文 §7、W6 |
| R12 | 底栏 Shelf、灵光两个按钮并进侧栏按钮 | side-shelf 3.1、§7 |
| R13 | 格的顺序、首开 Shelf、回到上次那格、需要时开相关格 | side-shelf 3.1 |
| R14 | Shelf 格窄时上下叠放、≥640px 两栏 | side-shelf 3.2 |
| R15 | Jev 左右互动评估门槛：首位 ≥80%、前三 ≥95%、p95 ≤2 秒 | 本文 3.5；side-shelf 5.5 |
| R16 | 「文件」格与 Shelf 是两个独立功能，Shelf 材料两边都出现 | side-shelf §7、§11 |
| R17 | 先设计架构；动作注册表就是统一目录，维护插件 ↔ 右栏、右栏 ↔ 左边的关系 | side-shelf 4.1–4.3；本文 §4 |
| R18 | 插件开发要登记什么 | side-shelf 4.4；本文 §4「插件 SDK 页面端」 |
| R19 | 消息、事件 | side-shelf 4.6；本文 §4、§5 |
| R20 | 和助理打通；放置动作不另行登记给助理 | side-shelf 4.7；本文 §6 |
| R21 | 助理默认带上「手上 + 落点」，可删 | 本文 §6 |
| R22 | 助理放进落点一律先预览确认 | 本文 3.6 |
| R23 | 助理面板是一个位置，第一期就做 | 本文 §6、W3 |
| R24 | 工作流、MCP 用同一批底层动作 | side-shelf 4.8；本文 8.4 第 3 条 |
| R25 | 桌面热键、菜单栏、轮盘、搜索、旧地址改道到 Shelf 格；Shelf 设置留在全局设置 | side-shelf 3.2、§7 |
| R26 | 材料篮就用 Shelf；四份文档一个分支、一个 PR；F2 与放进落点合成 `ItemAttach` | 本文 §7、3.4、§12 |

**context-toolbar 目标（用户原话与已定事项）**

| # | 要求 | 写在 |
| --- | --- | --- |
| C1 | 动作出现在用户动作发生的地方；与 Pages 浮窗合并；系统级通用；动态逻辑不变；系统定义结构与协议，插件自定义行为 | context-toolbar §2–§7；本文 §2、8.1 |
| C2 | 其他插件也要有；存量插件尽可能补上；开发手册和 Skill 里声明 | context-toolbar §10、§11；本文 8.1、8.3 |
| C3 | 每个插件都有创建 Item 和一句话快速入口，由助理通过插件的创建接口创建 | quick-create；本文 8.2 F1 |
| C4 | 「发送到」不是「更多」里的菜单；由 Jev 按上下文推荐；选中后零输入 | quick-create §5；context-toolbar §10.2；本文 3.3、§6 |
| C5 | 选中文字触发工作流，文字作为第一个节点的输入，第一个节点创建 Item 再执行 | quick-create §6.2；本文 8.4 |
| C6 | 旁问、分叉（Side Talk / Fork / btw） | context-toolbar §10.3；本文 8.2 |
| C7 | 单行版式；打字时不自动浮出；底部动作条整个取消 | context-toolbar §9；本文 8.1 |
| C8 | 工具与动作的界线 | context-toolbar §3；本文 3.3 |
| C9 | 创建入口：插件页「✦」与浮条推荐；创建类候选不进「更多」和「全部操作」 | quick-create §5、§8；本文 3.3 |
| C10 | 创建确认按插件分（`undo` 直接，其余卡片） | quick-create §8；本文 3.6 |
| C11 | 「记成待办」「记下灵光」并入创建入口，旧的删掉 | quick-create §8；本文 8.2 F1 |
| C12 | 手册与 Skill 全部随代码一起写 | context-toolbar §11.1；本文 8.1 |
| C13 | 覆盖率门禁：冻结豁免名单、只许减少；存量按波次补齐 | context-toolbar §11.5–§11.6；本文 8.1、8.3 |
| C14 | 选区能力 F1–F13 的批次（含 F9 批注排最后） | context-toolbar §10.7；本文 8.2 |
| C15 | 约束：隐私来源、脱敏、`LOCAL`、`DESIGN.md`、浮条不抢焦点 | 本文 3.7 |
| C16 | 开工前的待核对事项 | 本文 §11 |

**Coding**

| # | 要求 | 写在 |
| --- | --- | --- |
| K1 | Coding 现有能力接进浮条与右栏：放进下一轮、补充给这一轮（`steer`）、放进输入框、新开会话、转录里选中后的动作、报告与变更收进 Shelf、Files 选区引用 | 本文 8.5 |
| K2 | 旁问（btw，next-requirements C4） | 本文 8.5；context-toolbar §10.3 |
| K3 | 分叉（fork，next-requirements C1），含会话列表显示分叉关系 | 本文 8.5；context-toolbar §10.3 |
| K4 | 与长期记忆（C3）、导出（C2）、浏览器操作（D3）、图片输入（A3）的交叉 | 本文 8.5、§11 |

## 14. 决策记录

| 日期 | 决定 | 依据 |
| --- | --- | --- |
| 2026-10-02 | context-toolbar、quick-create 一并纳入，与 side-shelf 综合设计 | 用户 |
| 2026-10-02 | 一个动作池、一个情境中枢、一次判断、一条浮条、一条执行路径；底部动作条取消（context-toolbar 已定），side-shelf U5 的「底栏」改为「浮条贴着手上的东西」 | 用户（context-toolbar 的决定晚于 U5） |
| 2026-10-02 | 执行的总规则：写进人眼前正在编辑的对象一律先预览；写到别处按插件声明（`undo` 直接、其余卡片） | 合并两条用户决定 |
| 2026-10-02 | Coding 的「模型操作浏览器」（next-requirements D3）共用右栏浏览器，不另起一个 | 用户（推荐项） |
| 2026-10-02 | 材料篮（F8）就用 Shelf；Shelf 格里 DropAgent 动作栏管自己的动作、浮条只显示去别处的动作（通用声明，不按插件分支）；四份文档合到 `feature/context-toolbar` 一个 PR；F2 追加与放进落点合成一个 `ItemAttach`（加 `positions`） | 用户（推荐项） |
| 2026-10-09 | 吸收 main 的变化（第 15 节）：「收进 Shelf」只建个人材料（`shelf.items.admit`），不产生过程项；Coding 报告（成果）与变更集（过程项）收进 Shelf 都是个人副本；「文件」格不收过程项 | 常规取舍，按 artifact-positioning 已定的规则 |
| 2026-10-09 | 「放进 Coding 下一轮材料」：Shelf 材料复用现有通路；别的来源由 Coding 新增自己名下的文字摘录过程项（暂名 `coding.text-excerpt.v1`），不经 Shelf | 常规取舍：交换数据存在产生它的插件名下（artifact-positioning 2026-10-02） |
| 2026-10-09 | 动大文件之前先拆：`context-actions.ts` 先把 `bar` 与 `bus` 分成两个文件；浮条、情境条、落点、Shelf 窄版式、讨论落点都写成新文件，不往巨大单元里加行；改名不留别名 | 健康门禁（AGENTS.md） |
| 2026-10-09 | 与 ai-interaction-experience 的分界：与输入框同排的按钮只放对话的下一步，页面选区动作走本设计的浮条 | 用户（该任务的 D1，经 goalboard-4e 告知） |
| 2026-10-12 | 首批「放进左边」只做 Pages 的三个确定性动作（插入到光标处 / 替换选中的文字 / 作为引用插入）；暂缓三项：Pages「整理成要点后插入」（前置：W1 起草服务）、Goals「作为依据附上」（前置：Goals 报告落点）、Coding「放进下一轮材料」（前置：Coding 自己名下的文字摘录过程项）。被否的做法：第一批铺开多家。理由：确定性、预览即写入、可核对可撤销，比覆盖面广更重要；第一次用就出现模型改写、写错难撤，会伤信任 | 统筹按用户的规则定（功能线选用户体验最好的）；用户验收时可推翻 |
| 2026-10-12 | 平台自带格的对象种类叫 `browser_page`、`discussion_message`。被否：`web.page`、`im.message`。理由：仓库里对象种类一律是「主人_东西」的下划线写法；点号写法与能力 id（`pages.create`）撞形；GLOSSARY 里讨论的代码词是 `discussion`，而 `im` 按 R-A10 指整个右栏的 dock，再拿它命名会加深重名。常量在原型的 `OBJECT_KIND`，产品里随 side 视图的 `objects` 登记 | 统筹按用户的规则定（技术决策看防腐后果）；用户验收时可推翻 |
| 2026-10-12 | W1 规划（§18）：页内锚点叫 `SurfaceFocus.screen`（避开 `SurfaceFocusTarget.anchor`，元素引用不进合同）；`intake`、`attach` 声明在被指向的写入动作上，撤销沿用动作已有的 `undo`；浮条按钮按 DESIGN 下限（32 / 28 / 44px），浮条 `--lift-2`、菜单与面板槽 `--lift-3`；DOM 事件随第一对收发方登记；浮条原件 W1 只上组件板，W2 接入时资源净减；中枢接右栏、助理与落点的 DOM 线挪到 W3，内容站请求号挪到 W4 开头 | 本线按用户的规则定（技术决策看防腐后果：页面资源两向不容差、DOM 事件门禁、合同纯度、能力只登记一次） |
| 2026-10-12 | W2 规划（§19）：浮条程序在设计系统、只进工作台的脚本与样式；顶层与窗格各画一条、总线仍只在顶层，新增 `workbench-context-view` / `-hold` / `-dismiss` 三条窗格消息；总线经视图接口说话、不再依赖底栏宿主；删掉只为 Pages 写作菜单存在的 `molis:assistant-context-actions`、`molis:assistant-context-action-choose` 及其合同常量；Pages 的 15 个按钮变 4 组工具、「AI」按钮删除；面板打开期间一律冻结选区（修掉链接、评论写到裸位置）；段落把手入口延后（`renderMenu` 在上限）；开场建议的报错回到助理浮层 | 本线（防腐：不留两套、事件有发有收、巨大单元只减；体验：context-toolbar §6、§9 的既定取舍） |
| 2026-10-13 | 右栏「电脑」格改接 main 上 #471 的实现，不再是「只留位置」：它是只读的实时画面（只显示助理正在看的那个应用、盖住密码栏），不产生手上的东西、不是落点，浮条在它上面不出现；它的唯一出口是格自带的「放进 Shelf」（把一次操作记录放进 Shelf），这条已有的路径不重写。被否：把画面当「浏览器页」那样取选区（画面是桌面应用的像素，没有可取的文字）；让材料拖进电脑格（电脑的输入只走助理的 `surface-act` 与逐步确认、或人接手后在真实应用里做，拖放会开第二条往电脑里写的路径）。理由：side-shelf §8 已定「情境线不创建第二份电脑事实或执行链」；#471 的信任模型是画面单向。若以后要让「这次电脑操作」成为手上的东西（给助理接着做），走 Computer Use 的公开合同报 `SurfaceFocus { place: "side", side_tab: "computer" }` 加一种记录的对象种类，由 Computer Use 线声明，属 W3 | 统筹更正（#471 合入 main）与防腐后果；功能上按体验定，非用户验收 |

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
- **[repository-anti-corruption](../repository-anti-corruption/spec.md)**：它在拆 `AssistantService` 等巨大单元；本设计改到同一文件前先问。
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

## 20. 远端交接（2026-10-13）

> 本节写于 2026-10-13，已被开头的「交接（2026-10-20）」取代，只作历史记录；下文的「先读」「下一步」都不再适用。

> **统筹补充（2026-10-13 晚，先读）：暂停期间 main 上有两次大合并，本节下文写于知道它们之前。**
>
> - **#471**（yijunw0212，10-13 08:24 UTC，78 个文件）把桌面 Computer Use 合进 main，并把 main 的 vendored SDK 换成 `prologue-sdk-0.0.0-rc.1-computer-use.tgz`。它的来源是 Prologue `d4908c11`（分支 `feat/desktop-computer-use`，基于 `c4b9fde3` = `4f7110fe` + 采用修正 + 5 个 Computer Use 提交）；provenance 写着 `pushed: false`，这个提交**不在 Prologue main，也不在 GitHub 远端**。这份包**不含**已进 Prologue main 的 S1–S3、带类型问卷（`a06ae62e`）、P1 合同、P2a–P2f。main 上同时还留着旧的 side-panel-memory 包与补丁（两份 tgz）。#471 还新增了右栏的电脑格（`apps/workbench/src/side-panel-computer.ts`）、`contracts/services/computer.ts`、`services/ui-surfaces.ts`，改了助理服务、`assistant-island.ts`、`prologue-node.ts`、`prologue-stream.ts`、`contracts/services/agent-host.ts`，并把 10-09 版的 `specs/ai-interaction-experience/spec.md` 与参考图带进了 main。
> - **#472**（yijunw0212，10-13 10:54 UTC，93 个文件 +3399/−953）把旧采用树 `feat/prologue-adoption` 的 10 个提交（10-09 的 `77fde104`…`8b1a0522`）合进 main：一轮的推理力度、运行中换模型、逐轮写入记录（约等于 A1）、灵光流式（A3 的一部分）、助理把交出去的工作收回来后接着做（`8b1a0522`「第 14 项」，A0 当时明确不纳入的私有接续）、变化等待（`b3235bb1`/`8c0b60fb`，约等于 A4）。它沿用 #471 的 computer-use 包，没有换包。main 上的 `specs/prologue-adoption/spec.md` 是 10-09 的旧版（标题「Prologue 新能力接入：修复、适配与功能优化」）。
> - 统筹层的说明与后续顺序见远端分支 `coordination/handoff-2026-10-13` 的 `coordination/2026-10-13/README.md` §2a。
> - **以下更正优先于本节下文（统筹审查，2026-10-13）：**
>   1. 上面「对本线的影响」第 2 条列的直接冲突文件不准。实测把 main 合进 #411 只冲突 4 个：`apps/workbench/src/page-assets.ts`、`packages/design-system/README.md`、`tooling/gates/baseline.json`、`tooling/gates/page-assets.json`；`apps/local-host/src/index.ts`、`specs/README.md` 能自动合并，`package.json` 不再冲突，所以 §20.4-2 里 `test:security` 那一步不适用。
>   2. 上面第 3 条「顺序不变（排在采用线之后）」与 §20.2、§20.5-5「#408 第一，#411 第二」：已过时。#411 具备条件（W1-4 回归已修、合 main 后防腐复查过、定向用例与基线比对过）就可以先合（README §2a-4）。
>   3. §20.2「PR #446 … 统筹来关」：#446 已关闭。#411 的 head 现在是 `8c27b372`（代码 head 仍是 `be29dd53`，之后都是文档）。
>   4. §20.5「右栏『电脑』那一格归 Computer Use 原负责人，本线只留位置」：以上面第 1 条为准——#471 已在 main 实现电脑格，合 main 后改接它。
>   5. §20.8 的工作规则补两条：模型分配（规划用 Opus 5.5 high/xhigh，执行用 Sonnet 5.5 xhigh/high）；提交身份 `jing xu <jing.xu.sandra@gmail.com>`，提交说明结尾带 `Co-Authored-By` 行。原文见 README §3。
> - 文中 `coordination/2026-10-13/…` 都是远端分支 `coordination/handoff-2026-10-13` 上的文件（原来写的本机路径 `.claude/locks/…` 已统一改成这里）。
>
> **对本线的影响：**
> 1. #471 在 main 上实现了右栏的电脑格（`apps/workbench/src/side-panel-computer.ts`、`contracts/services/computer.ts`、`services/ui-surfaces.ts`）。W0/W1 里「电脑」格原来只是占位、归 Computer Use 原负责人；合 main 后改成接 #471 的实现（只留位置的说明删掉），右栏六格的落点、拖放与浮条在电脑格上的行为按 #471 的表面核对。
> 2. #471 还改了 `side-panel.ts`、`side-panel-browser.ts`、`page-assets.ts`、`assistant-island.ts` 和页面资源预算；与 #411 的直接文件冲突在 `apps/local-host/src/index.ts`、`apps/workbench/src/page-assets.ts`、`specs/README.md`、`tooling/gates/baseline.json`、`tooling/gates/page-assets.json`。页面资源字节两个方向都要精确：合 main 后重新 `pnpm workspace:build` 再 `node scripts/gates/page-assets.mjs --update --base origin/main`，不手工合并数字。
> 3. #411 合进 main 的顺序不变（排在采用线之后），但采用线的 #408 现在要先和 #472 对账，可能晚到；如果 #411 先具备条件（W1-4 回归已修、合 main 后防腐复查过、定向用例与基线比对过），由统筹决定是否先合。


### 20.0 当前状态（2026-10-13 晚，统筹接手后，先读）

本节之后的 20.1–20.10 写于 10-13 早上；与本节不一致的以本节为准。

- **#411 已合 main 到 `c33448f2`**（#471、#472 与之后的测试迁移都在里面），冲突只有 `packages/design-system/README.md`（两边都留）以及一开始的 `page-assets.ts`、两份门禁文件（重新生成）。
- **防腐复查**：见 16.4 的 2026-10-13 晚一行（通过，修了五处）。
- **工程证据**：
  - 全量（合 main `ee84a837` 之后、W0 修复之前的树，`node scripts/run-tests.mjs`，约 117 分钟）：6154 条，6135 通过、10 失败、9 跳过。10 条逐条比对过：
    - W0 原型 5 条：本线 W2 引入，已修（`c24fb961`），`context-program-slice` 单元加浏览器 18/18；
    - `goal-event-document.e2e` 1 条：负载下的时序，单独在本线与干净 main 上都 3/3；
    - `feed-inbox-schedule-error-model` 1 条：main 上同样失败（#472 在 `schedule-task-runner.ts` 加了裸 `new Error`），由采用线 #408 修；
    - `settings-requests-through-helper` 1 条：main 上同样失败（#471 在 `settings-assistant.ts` 直接 `fetch("/api/computer…")`），不属于四条线，已报统筹；
    - `touch-targets.e2e` 2 条（触屏窗口的 44px 与助理行）：干净 main 上同样失败。
  - 再合 main `c33448f2`（只有测试迁移）后：重建、门禁全过；main 改过的 210 个测试文件加本线四个文件：1337 条，1336 通过、1 失败（`functions-authoring-actions` 的「发布校验期间草稿被改」，与采用线的定向用例同时跑时失败，单独在本线连跑两次与在干净 main 上都 4/4，判为负载时序）。
  - 浏览器：浮条与情境用例在 10-13 早上的树上通过（20.3）；本轮跑了 `context-program-slice.e2e`（5/5）与 `goal-event-document.e2e`（3/3）。6 个分屏用例在全量里通过，不再是待查项。
- **开发者实操、用户验收**：同 20.1，没有变化。
- **20.4 里已经做完的**：第 1 条（W1-4 回归）、第 2 条（与 main 的冲突）、第 3 条（6 个分屏用例，全量里通过）、第 4 条（小批浏览器复跑，含在全量里）。
- **还没做的**：W2-02、W2-05、W2-08 的用例和 `contextual.md` 的浮条章节（20.4 第 5、6 条，2026-10-14 在做，见 20.11）；20.4 第 8 条的后续各项；真实 Jev 评估与桌面原生拖出（要用户授权）。W1-9 **不需要门禁 PR**（见 20.4 第 7 条的更正）。
- **下一步**：统筹按条件合 #411（`Verify` 绿、与 main 同步、secrets 与 health `--base` 过、证据入本文、读过 diff），然后从 20.5 第 4 步接着做。

本节取代第 17 节。读它的人可能在另一台机器上，看不到本机的工作树、锁目录和别的会话：下面凡是本线要用的事实都写在这里，链接只是出处。本节写于用户 2026-10-13 的「先暂停一下」之后，所以「没做」里的事都等恢复通知再动。

### 20.1 一句话现状

| 级别 | 现状 |
| --- | --- |
| 工程 | W1 的合同、SDK 声明、内核派生、起草服务、浮条原件，以及 W2（浮条取代底栏、Pages 迁到浮条）都在交接分支里；合入 main `490251d1` 后，健康门禁（`--base origin/main`）与 `boundary:check` 通过，定向非浏览器用例 277/277，页面预算已按实测降低（16.4）。浏览器：新浮条用例（1440、390 宽）和重写后的情境用例通过；窗格类 6 个用例失败，还没有和干净基线比对；另有一个已确认的 W1-4 回归（`action-artifact-references`，20.4 第 1 条） |
| 开发者实操 | 只有 W0 独立原型（预览端口 4290，内置浏览器，1440 与手机宽度、浅色与深色，16.2）。**产品里的浮条还没有人在真实 Home 里点过**，只有 e2e 在隔离 Home 里走过 |
| 用户验收 | 没有。一骏本人没有验收过浮条、创建入口、右栏任何一块 |

两件拍板是统筹按用户的规则代定的，用户验收时可以推翻：首批「放进左边」只做 Pages 的三个确定性动作（插入到光标处、替换选中的文字、作为引用插入）；平台自带格的对象种类叫 `browser_page`、`discussion_message`（理由和被否的写法见 §14）。

### 20.2 分支与 PR

| 东西 | 状态 |
| --- | --- |
| Molis PR #411 = 分支 `feature/handoff-contextual-actions` | **本线唯一的提交位置**。推送的头是 `be29dd53`（之后只可能多交接文档的提交）。已合入 main 到 `490251d1`；GitHub 之后报告和 main 又有冲突，**没有解**（20.4 第 2 条）。远端：`git@github.com:molis-ai/molis-work.git` |
| 原单开的 PR #429–#434、#445 | 统筹已关闭，每个留了评论指向 #411；提交都已经在 #411 里 |
| PR #446（W1-6） | 提交 `e67cd28e` 已在 #411；统筹来关 |
| 远端分支 `feat/context-w1-*`、`feat/context-w2-toolbar` | **旧版本，不要再推，也不要从它们开新分支**：内容已被 #411 取代（W2 在 #411 里是重新摘取的提交，不是这个分支）。可以删 |
| 本机分支 `feat/context-w2-toolbar`（9fe0cf7f）、`feat/context-w2-bus-view`（cbfe997c） | 被 #411 里的新版本取代的旧版本，不推送 |
| 用户规则（2026-10-13 02:10）：不再单开 Molis PR，每条线只往自己的交接 PR 提交 | 因为防腐线在同时改代码质量与架构，单开 PR 容易和它的改动冲突 |

合进 main 的顺序由统筹定：#408（采用线）第一，**#411 第二**。批量全量、防腐复查、`Verify` 都过了统筹才合；本线不自己合。

### 20.3 已完成（带证据级别）

证据级别：**工程**＝单测、门禁、e2e 在隔离 Home 里通过；**实操**＝开发者在浏览器里按用户路径走过；**验收**＝用户本人。除 W0 有实操外，下面都只到工程。

| 项 | 提交 | 内容 | 证据 |
| --- | --- | --- | --- |
| W0 打磨 | `6454915a` 起，16.2 | 独立原型：浮条、右栏、落点、创建入口的高保真切片，不改产品代码 | 工程：`tests/context-program-slice.test.ts` 13/13 与 e2e；实操：内置浏览器端口 4290 |
| W1-3 合同 | `54c79004` | `SurfaceFocus` 加 `place`/`side_tab`/`screen`；`SurfaceLanding`；`ContextTools`/`ContextToolInvoke`/`CONTEXT_TOOL_LIMITS`（6 组、24 项、标签 24 字）；落点与创建入口的类型 | 工程：合同单测、API 快照；进了统筹的批量全量 |
| W1-4 SDK 声明 | `e4062fce` | 写入类 command 可声明 `intake`（建成一个 Item）和 `attach`（加进已有对象） | 工程：`plugin-context-declarations`、`plugin-declaration-rules` 等 |
| W1-5 内核派生 | `47c00b44` | 去处（创建入口、追加）作为候选进入排序，且只占推荐位；`packages/kernel/src/contextual/destinations.ts` | 工程：`contextual-destinations`、`contextual-landing` |
| W1-7 起草服务 | `5af907b1` | `POST /api/contextual/draft`、`ContextualDraft`：用目标动作的输入 schema 当表单、选中文字当材料，一次结构化模型请求填文字与日期字段；模型缺席或出错也不丢用户的话 | 工程：`contextual-draft` |
| W1-8 第一部分 | `c8a15bbf` | `skills/molis-plugin-dev/contextual.md`（插件作者怎样声明选区动作、`intake`、`attach`）与手册对应节 | 工程：文档引用门禁。覆盖率门禁没做（20.4） |
| W1-1 拆文件 | `2d8a56dc` | 情境行的脚本拆成 `context-bar.ts`、`context-bus.ts` 与 `context-actions.ts` 工厂，外观不变 | 工程：`contextual-interaction.e2e` 等 |
| W1-2 放置上移 | `f3b3c7e9` | 浮层怎么放（上、下、旁、留边距）移进设计系统叶子子路径 `@molis-ai/molis-work-design-system/floating`；Pages 删掉自己的副本 | 工程：`design-system-floating`、`pages-plugin` |
| W1-6 浮条原件 | `e67cd28e` | 设计系统 `context-toolbar.ts`（页面程序＋样式）、`context-tools.ts`（工具有界封闭的清洗）、组件板一节；三个页面事件登记 | 工程：`context-toolbar.test.ts`，`context-toolbar.e2e` 1440/390 通过 |
| W2-0 总线解耦 | `03ed8ed2` | 总线通过视图接口说话，不再依赖底栏 DOM | 工程：`pages-surface-naming` 新用例、`contextual-interaction.e2e` |
| W2 切换（五个提交） | `4a1981da`、`83c638ef`、`d7529d86`、`4d1262b7`、`03d6528b` | 工作台顶层和每个分屏窗格各画自己的浮条；删掉底栏宿主与行样式（三份样式表各减约 8.5 KB）；Pages 的格式条与「AI」写作菜单删除，14 个工具作为 4 组 `ContextTools` 发布、点击回到编辑器执行；链接/评论/颜色/候选表单进浮条的面板槽；删 `molis:assistant-context-actions`、`molis:assistant-context-action-choose` 两个事件与合同常量；`molis:context-panel-open` 可取消并带 `keep` | 工程：门禁与定向用例通过；浏览器第一轮 119 个里 105 个通过，含新浮条 e2e 与重写后的 `contextual-interaction`（1440/390、候选写回、编辑后拒绝写入、「更多」等于方案、整篇在最后） |
| 三处修复与预算 | `fb7fc705`、`88f39abc`、`40313fed`、`771b003e`、`44d551bc` | `client.ts` 不比 main 大；浮条动画改用共享动效令牌（`soft-workbench-refinement` 的「四个时长两条曲线」）；Pages 关编辑器时撤掉浮条面板；Pages 面板请求只在一处构造、工具直接发布；页面预算降到实测；本地基线重新生成 | 工程：重建后 277/277、健康门禁与边界检查通过。「离开文档浮条与面板消失」那一步在浏览器里**还没复跑确认** |
| 防腐复查 | `1c76b258` | 16.4 | 清单机器项全过，人工项通过，记了三处缺口 |

统筹的批量全量（main＋#442＋W1 合同那几片）结果：5893 过、38 败、9 取消，分布在 35 个文件，多数是浏览器用例。非浏览器的失败已归因：除 20.4 第 1 条（W1-4 引入）外，Swift helper、stdio-MCP、`installed-plugin-host` 那几条 26–44 秒的超时在干净基线上也有，或是负载造成的。**浏览器失败的归因还没做完**：基线那边的 e2e 复跑结果不可信，要重做；所以 W1 引入了哪几个浏览器失败还没有结论。

### 20.4 没完成

1. **已确认的回归（排第一，这一轮只记录、不修）**：`tests/action-artifact-references.test.ts` 的「declarations that are not what the shape rules expect do not make the check throw」在批量集成分支（main `894b917a` + #408 + W1 栈）上 1ms 就失败，干净基线 `894b917a` 上通过；重跑结果一样，不是负载问题。堆栈：`TypeError: Cannot read properties of null (reading 'action')`，在 `packages/plugin-sdk/src/context-declarations.ts` 的 `ownKinds`（93:30，filter 回调在 93:71）→ `inspectContextDeclarations`（100:17）→ `packages/plugin-sdk/src/manifest.ts` 的 `assertV2Blocks`（236:20）→ `parsePluginManifest`（116:5）。来源是 W1-4（`e4062fce`）。形状不对的声明（比如条目是 `null`）应该作为问题报告出来，不能抛错。修法：在 `ownKinds` 和 `inspectContextDeclarations` 里先按形状过滤或报告，再读 `.action`；**断言不放宽**。
2. **#411 与 main 的冲突**：GitHub 报告有冲突，没解。做法：`git fetch git@github.com:molis-ai/molis-work.git main`，合 `FETCH_HEAD`（不 rebase、不 force-push）；`package.json` 的 `test:security` 三方合并（两边都留）；`tooling/gates/page-assets.json`、`baseline.json`、`tooling/gates/api/**` 不手工合：取 main 的，再 `node scripts/gates/page-assets.mjs --update --base origin/main`、`node scripts/check-health-gates.mjs --update --base origin/main`、`node scripts/gates/api-snapshot.mjs --update` 重新生成；解完重跑防腐清单 M1、M2（`coordination/2026-10-13/ANTI-CORRUPTION-REVIEW.md` 的内容在 20.6 概述）。
3. **6 个分屏浏览器用例失败**，两轮都败，还没和干净基线比对：`workbench-hidden-refresh`、`workbench-deferred-clients`、`workbench-tab-workspace`、`workbench-pane-feed` 的 3 个。失败形态是 CDP 超时和「Navigation did not finish」，当时机器负载均值约 30，所以可能是环境，也可能是窗格里的浮条（在窗格文档里多建了一个浮条）拖慢或卡住了页面。判断办法：用干净 main 的构建（统筹有基线工作树）跑同样 6 个文件对比，再在安静时段单独跑一遍。
4. **小批浏览器用例复跑**：`contextual-interaction`、`context-toolbar`、`pages-actions`、`assistant-dock-ime`、`workbench-tab-workspace`、`workbench-deferred-clients`，确认「离开文档浮条与面板消失」的修复，并看 `assistant-dock-ime`（第一轮败，与底栏行无关，疑似负载）。
5. **缺测试的验收编号**：W2-02（窗格里的浮条画在窗格自己的文档里；悬停或聚焦的按钮在判断到达时不移动；Esc 收起记「忽略」——需要一条分屏用例）、W2-05（⌘K 打开链接面板）、W2-08（开场建议选了动作后出错，经 `host.showToast` 显示）。W2-04 已改成「等着的结果不丢」（§19.8），对应用例在 `contextual-interaction.e2e`。
6. **`skills/molis-plugin-dev/contextual.md` 的浮条章节**：给插件作者讲怎么发布工具、接收点击、请求面板、上报 `screen`。要点：根元素上派发 `molis:context-tools`（`{ context_id, groups }`）；点击回到同一个元素上的 `molis:context-tool-invoke`；`molis:context-panel-open` 可取消，浮条接住就 `preventDefault()`，没接住自己放表单，`node: null` 收起，等模型的结果带 `keep: true`；上报焦点时带 `screen: { rect }`（本文档视口坐标，纯数据，滚动后用同一个 `context_id` 再报）。样例：`plugins/native/pages/src/client.ts`。
7. **W1-9 的门禁 PR**：~~让 API 快照门禁支持子路径~~。**更正（2026-10-14）**：不需要。快照工具按插件 SDK 的 `exports` 逐个子路径出快照，是通用的（19.8 的 W1-9 一行早已这样记）；W1-9 的页面端子路径随第一个收发方一起上，那时 `pnpm api:update` 就会多出它的快照文件。用户 10-13 同意的「单独的门禁 PR」因此不开。
8. 还有（更靠后）：W1-8 的覆盖率门禁；SDK 页面端辅助函数；`attach` 的起草（W3）；段落把手入口（Pages 的 `renderMenu` 先要拆，排在 W7）；选区冻结（W2 决定 8 的原意，现在只做了「等着的结果不丢」）；右栏改版 W2'（side-shelf P1）、中枢接右栏与助理的 DOM 线（W3）、落点事件随 W3 登记。

### 20.5 下一步，按顺序

1. 先修 20.4 第 1 条的回归（`ownKinds` 对形状不对的声明不抛错，改完跑 `tests/action-artifact-references.test.ts` 与 `plugin-context-declarations`、`plugin-manifest-v2`）。前置：恢复通知；这是 W1-4 的 bug，和 main 的冲突无关，可以先于下一条做。
2. 解 #411 的冲突并推送（20.4 第 2 条）。前置：恢复通知；`secrets:check` 先过；不 force-push。
3. 等统筹的归因比对；如果 6 个分屏用例是本线引入的（窗格里的浮条），先修；不是则记入 16.4。前置：browser 锁（`coordination/2026-10-13/tools/slot.sh`，一次只一批）。
4. 补 W2-02、W2-05、W2-08 的用例和浮条章节（20.4 第 5、6 条）。
5. #411 合进 main 排在 #408 之后；统筹合。
6. W1-9 门禁 PR（单独提，先告诉统筹）。
7. W3 起（中枢接右栏、助理与落点；Pages 的落点；右栏改版）按第 9 节分期，每步先对照第 18.2、19.5 的门禁。

**必须先问用户的**：两组真实 Jev 评估、桌面原生拖出（要真实凭据或真实环境）；合并 main、发布、改真实 Home（端口 4207/4173）、放宽门禁、读真实凭据。**右栏「电脑」那一格归 Computer Use 原负责人**，本线只留位置。真实 AI 接入用采用线（adoption，#408）的统一 SDK 包，不另带包。

### 20.6 跨线约定与防腐交界

- **输入回执线**：情境条把「手上 + 落点」放进现有的 `AssistantSendInput.context` 与 `materials`，回执（`AgentInputView`，子路径 `services/agent-inputs`）只记用户的话，不带附带的情境与材料。
- **互动线**：与输入框同排的按钮只放对话的下一步，页面选区动作走浮条；输入框上方留一个独立槽挂「手上 + 落点」情境条。`catalog-examples.ts` 是组件板扩展点，谁先合谁先加，后合的解冲突，两边的行都留。
- **采用线**：真实模型调用只经 `horizontal/agent-host`；本线的起草服务用 Host 的文字模型请求，不另接模型。
- **防腐在途片**（完整表在统筹的 `ANTI-CORRUPTION-REVIEW.md` §4，和本线直接相关的）：新声明字段的交叉检查加在 SDK 的 `action-declarations.ts`/`action-cross-references.ts`，不加回 contracts（W3-03/05）；选区推荐保持只给工作台的 HTTP，要让助理、工作流或 MCP 用它就触发删除条件，先找统筹（W3-04）；所有 AI 写入路径从一开始带读到的版本（W3-09-3，包括起草）；新的浏览器请求用 `packages/ui-host/src/request-client.ts`，W3-10-4 与本线同文件（`assistant-island.ts` 包装、`placement.ts`、情境动作、`initialization.ts`），动之前先问统筹；新错误码写成 `defineErrorCodes("contextual", …)`（本线的主人名 `contextual`，目录 `apps/local-host/src/contextual/`）；新测试走公开入口，不新增对包内部源码的引用；巨大单元（`assistant-island.ts`、`craft-finish.ts`、`tab-workspace.ts`、`editor-browser.ts`）只减不增。
- **每次把 main 合进 #411 之后**：对本线 diff 跑一遍防腐清单（机器 16 条：`boundary:check`、健康门禁、API 与动作快照、页面资源、lint、DOM 事件、翻译、测试引用等；人工 27 条），结果写进 16.4。

### 20.7 决策记录要点（全部在第 14 节与 19.8）

- 一个动作池、一个情境中枢、一次判断、一条浮条、一条执行路径；底部动作条取消。写进人眼前正在编辑的对象一律先预览。
- 首批「放进左边」只做 Pages 三个确定性动作；`browser_page`、`discussion_message`（上面 20.1）。
- W1：页内锚点叫 `SurfaceFocus.screen`；`intake`、`attach` 声明在被指向的写入动作上，撤销沿用动作已有的 `undo`；浮条按钮 32/28/44px、`--lift-2`，菜单与面板 `--lift-3`。
- W2：浮条程序在设计系统、只进工作台脚本与样式；顶层和窗格各画一条，总线只在顶层；删两个只为写作菜单存在的事件。**与计划不同的三处**：面板不冻结选区，改为「等着的结果不丢」（`keep`）；开场建议的错误用提示条；✦助理沿用把文字放进助理输入框、不发送的现有入口。
- 压缩：页面程序过 `compactScript`（去缩进、空行、整行注释）。

### 20.8 工作规则（用户的原话，经统筹转达）

- 「优先开发，全量回归测试不用每次都触发，攒一波一起弄，除非必须」：每片只跑 `node scripts/affected-tests.mjs` 选出的定向用例（含受影响的浏览器用例）；全量由统筹在集成分支上批量跑，结果分给各线。整机同时最多一个构建、一个浏览器用例批次（`slot.sh` 的 build、browser 两把锁，用完立刻放，等锁的脚本用 trap 兜底）；停进程只用 `kill <pid>`，不用 `pkill`。
- 拍板：技术决策按防腐线的后果判断，功能决策按对用户 UI 交互与使用体验最好的推荐走；本线内的决定写进 §14 并在汇报里列出，跨线或改范围的找统筹。仍先问用户：合并 main、发布、真实 Home 或安装版、放宽门禁、读真实凭据。**拍板不等于用户验收。**
- 「不用单开PR，每个线都只在之前的交接PR里commit，因为有另外的防腐线在做代码质量和架构升级，所以单开PR的话，如果防腐有改动，容易导致架构问题」。
- 「先推进按照当前main的代码开发功能，如果几条线之前有依赖关系，从main拉取最新代码合并入各自分支之后按照防腐线防腐要求进行复查，确保需求迭代的同时不与防腐要求冲突，几条线的开发顺序由你统筹」。
- 「先暂停一下」（2026-10-13）：全部会话停在安全点，不推送、不开新任务，等统筹的恢复通知。
- 提交署名 `jing xu <jing.xu.sandra@gmail.com>`，推送用 SSH 地址 `git@github.com:molis-ai/molis-work.git`，推前跑 `node scripts/check-secrets.mjs`；不放宽、跳过或删除断言；不碰真实 Home。原文另见统筹分支 `coordination/handoff-2026-10-13` 的 README。

### 20.9 已知问题

- **页面资源字节两个方向都不容差**：变大会被拒，比预算小也要在同一个 PR 里用 `--update --base origin/main` 降到实测值（所以合 main 后预算几乎一定要重新生成）。`workbench.js` 现在比 main 小 607 字节，`pages-editor.js` 小 5.1 KB；任何新增都要同时删等量。
- **`pages-editor.js` 压线**：编辑器是巨大单元（`editor-browser.ts` 约 3870 行、`mount` 要继续变短），往里加行会被门禁拒。
- **两个近似的压缩函数**：工作台的 `served()`（`apps/workbench/src/plugin-workbench.ts`，插件客户端脚本）和设计系统的 `compactScript`（情境脚本，还去空行）。应并成一个，会动所有插件的资源，留给页面资源门禁的主人。对整个 `workbench.js` 拼装处用 `compactScript` 预计能少几十 KB，已证明情境脚本和 Pages 脚本压缩前后语义相同，别的脚本需逐个验证。
- **批量全量里 W1 的浏览器失败还没归因**；`runtime-integration.test.ts` 在 CI 上败过一次，本机一次败一次过，疑似不稳。
- 本机 `touch-targets.e2e` 有 4 个在干净 main 上也败的用例（不是本线）。
- 本线没有往 `tests/ci-product-subset.txt` 加用例；W2-02 的分屏用例若又快又稳可以加。

### 20.10 怎么复现

没有 `pnpm` 在 PATH 里时，先把装有 pnpm/corepack 的目录加进 PATH。构建和浏览器用例要走锁（`coordination/2026-10-13/tools/slot.sh`，在统筹的主检出里）：

```sh
pnpm install --frozen-lockfile --offline
pnpm build                                              # 改过 */src、scripts、package.json 后先整体构建
node scripts/check-health-gates.mjs --base origin/main
pnpm boundary:check
node scripts/gates/page-assets.mjs --base origin/main   # 构建后
node scripts/affected-tests.mjs --list --unit-only      # 选出的非浏览器用例
node scripts/run-tests.mjs tests/pages-surface-naming.test.ts tests/context-toolbar.test.ts tests/soft-workbench-refinement.test.ts tests/pages-plugin.test.ts tests/dom-events-contract.test.ts tests/design-system-floating.test.ts tests/contextual-*.test.ts
node scripts/run-tests.mjs tests/context-toolbar.e2e.test.ts tests/contextual-interaction.e2e.test.ts tests/pages-actions.e2e.test.ts   # 浏览器，需要本机 Chrome
```

W0 原型的预览（独立脚本，不是产品）：`pnpm exec tsx scripts/preview-contextual-interaction.mts --judge rules --home <隔离标识> --port 4290`，端口 4290 写在本树未入库的 `.claude/launch.json`。产品里的浮条没有单独的预览入口：用 `tests/fixtures/goal-browser.ts` 的隔离 Home（`openGoalBrowser`），e2e 就是这样走的。

**不用构建就能量页面字节**（构建要排锁，量一次要几分钟）：用一个 Node 加载钩子把 `.ts` 用 TypeScript 的 `transpileModule` 转成 JS、把 `@molis-ai/molis-work-*` 指到各包的 `src`，再 `import` 脚本模块、对导出的脚本字符串取 `Buffer.byteLength`。用 TypeScript 转译而不是 esbuild，因为页面程序里 `.toString()` 带进去的函数文本要和 `tsc` 的产出一致；量 HEAD 和工作树各一次比较。这样量出的数与构建后的 `page-assets.mjs` 一致（工作台脚本、`pages.js` 都对上了）。最终以构建后的 `page-assets.mjs` 为准。

### 20.11 W2 的验收用例与浮条章节（2026-10-14，分支 `feature/context-w2-tests-docs`）

- 新用例 `tests/context-toolbar-panes.e2e.test.ts`：
  - **W2-02**：分屏后，窗格里的浮条画在窗格自己的文档里、在窗格之内，顶层文档不画；聚焦浮条上的按钮时窗格把「手在哪几个键上」报给顶层（`workbench-context-hold` 带 `pinned`），所以判断这时到达也不挪它们；Esc 收起，并按「忽略」上报（`/api/contextual/signal`），不记任何接受。「判断到达时不移动」本身要接判断（本机没有判断连接），这里证明的是窗格把保位报了上去。
  - **W2-05**：浮条在时，⌘B 照常加粗、浮条上的加粗变为按下；⌘K 打开链接表单，停靠在浮条下面并拿到焦点（Linux 上是 Ctrl）。
  - **W2-08**：开场建议里一个已经不在候选里的动作，选了以后用错误提示条说明原因。
- `skills/molis-plugin-dev/contextual.md`：「六、浮条上的工具」写发布工具、接收点击、请求面板、报告 `screen`，原「还没有的」改为第七节（页面端辅助函数与落点）。
- 结果（合 main `46cb083e` 后构建）：`context-toolbar-panes.e2e` 3/3（W2-02 约 9.6 秒，另两条各约 4.8 秒），连同 `context-toolbar.e2e`、`contextual-interaction.e2e` 再跑一遍 10/10；健康门禁对照 merge-base 通过（文档引用含在内）。产品子集的浏览器冒烟只留 3–5 个，这几条不加进去。只加用例与文档，没有动产品代码，所以不跑全量。

## 21. 助理的动作推荐、动作指引与对话整合（2026-10-14 起）

> 接续入口在开头的「交接（2026-10-20）」；本节各小节仍是设计、决策与证据的出处。

用户 2026-10-14 给本线加的需求（原话）：「个人助理动作推荐，动作指引与个人助理对话界面的整合和交互优化，这个新的优化需求，请与情景动作这个线一起做掉，现在的这几部分自成一派，动线和使用体验很不好。」它和第 9 节的 W3（助理与落点、助理面板作为位置）合在一起做。

### 21.1 现状：与「动作」有关的每一处（按 main `393e8958` 的代码；隔离 Home 实走见 21.6）

| # | 在界面哪里 | 是什么 | 从哪来（合同 / 动作 / 页面状态的主人） |
| --- | --- | --- | --- |
| A1 | 页面选区旁 | 浮条：工具、≤3 个推荐、更多、✦助理 | 情境总线（`context-bus.ts`）→ `/api/contextual/candidates`、`/judge`；本线 |
| A2 | 浮条「✦助理」「更多 › 说出要做什么 / 带到助理」 | 打开助理，往输入框里写一句生成的话（「帮我看看这段内容，先从「…」开始。」）或只带材料，不发送 | `molis:assistant-open`；总线写，岛收；本线 |
| A3 | 浮条上的写动作（`apply: record`，如「记成待办」） | 准备好参数后 `POST /api/assistant/cards`，**新开一项工作**放操作卡，再打开助理跳到那项工作 | 总线 → `assistant-offers.ts` 的 `offerFromPage`（交互线 H2） |
| A4 | 新工作的空白对话「从这一页开始」 | 开场建议：当前页对象的候选（同一份规则方案），加「继续最近的工作」 | `molis:assistant-starters-request` → 总线；岛画 |
| A5 | 输入框聚焦时弹出的「可以这样开始」 | 同 A4 的同一份开场建议、最近的工作、「发给：助理 · 新工作 · 项目 更改」 | 岛的 `setStarters`；与 A4 重复 |
| A6 | 输入框「/」「@」 | 全部能力与方法、项目内引用搜索 | 岛；`/api/assistant/…` |
| A7 | 输入框上方的「建议条」（`data-assistant-offer`） | 页面发来的建议（`purpose: suggest`）：「放进输入框 / 忽略」 | `molis:assistant-message`；各插件页面发，岛收 |
| A8 | 对话里的操作卡 | 模型 `suggest-action` 或 A3 放的卡：可改字段、执行、结果、撤销 | `assistant-offers.ts` + `assistant-card-view.ts`（宿主画，交互线 H2） |
| A9 | 对话里的问卷卡 | `ask-user` 的待答问题，共享问卷卡，带草稿 | `agent-question-card.ts`（宿主画，交互线 A1/A2） |
| A10 | 最新一轮下面的「接下来」 | 再试一次 / 打开结果（最多两个） | `assistant-outcome.ts` 的 `assistantOutcomeSteps`（交互线 D14） |
| A11 | 对话顶部条带（侧栏收起时）与左侧概况 | 状态、「去确认 / 去回答 / 去处理 / 去核对 / 看等你的子任务」按钮、暂停继续停止；两处各一份 | 岛的 `nextStep`、`paintStrip`、`paintSummary` |
| A12 | 左侧概况的「还等你处理」 | 本工作等你的子任务与对象 | 岛的 `renderAttention` |
| A13 | 输入框的铃铛「等你 N」 | 全部工作的通知（等你的、新消息） | `/notices`；岛 |
| A14 | 输入框的「材料」按钮与弹层 | 本次发送自动带上的：正在看的对象、选中的内容、未保存的修改，加你添加的文件与引用 | 岛读页面 `data-assistant-context` 与选区 |
| A15 | 项目首页的动作按钮 | 首页事件上的推荐动作，直接执行 | `home-offers.ts`（不在助理面板，本节只核对不改） |

**彼此怎样断开**（用户说的「自成一派」）：

1. **两份候选、两处陈列**：同一个页面对象的开场建议在空白对话里一份（A4）、聚焦输入框又弹一份（A5）；选区的候选在浮条（A1）。三处来源相同，但界面各画各的，样式与行为不同。
2. **写动作把人带走**：浮条或开场建议里选「记成待办」，卡片放进一项新开的工作，助理跳到那项工作（A3）；正在聊的那项工作里看不到它。
3. **「等你」说了四遍，动作却在第五处**：顶部条带、左侧概况各有一个「去…」按钮（A11），「还等你处理」（A12）和铃铛（A13）也在说等你；真正要点的按钮在对话中间的卡片上（A8、A9），对话末尾还有一行「接下来」（A10）。看到提醒以后要再去找按钮。
4. **说不清这次带上了什么**：选区和正在看的对象被悄悄带上，只在「材料」按钮的数字和弹层里看得到（A14）；✦助理往输入框里塞一句不是你说的话（A2）。
5. **页面建议另起一条**：页面发来的建议条（A7）、开场建议弹层（A5）、「材料」弹层（A14）都悬在输入框上方同一块地方，样式、关闭方式各不相同，互相挡。
6. **结果停在对话里**：助理给出的结果不能当成「手上的东西」，要放进左边只能复制粘贴（R23 未做）。
7. **输入框一行太挤**：目标、材料、执行者、铃铛、角色、方式六个小按钮都在输入框里，窄时互相挤掉。

### 21.2 方案：以输入框为中心的一条动线

可点的高保真切片：claude.ai 私有页面 `https://claude.ai/artifact/1PphQCPrX7CgnH5eSWK6FN`（模拟数据，不连 Home；本地副本与截图在统筹的共享笔记目录 `contextual-line/`）。

```
┌ 助理面板 ──────────────────────────────────────────────┐
│ ○ 记成待办 · 等你                                      │  状态只说状态
│   你：记成待办（带上：选中的内容 · 周报草稿）            │
│   助理：……                                             │
│   ┌ 待办 · 操作卡 · 等你确认 ┐  ← 卡片与问卷只在对话里    │
│   └ 标题 / 截止 / 出处  [不用了][记成待办] ┘           │
└────────────────────────────────────────────────────────┘
┌ 输入框 ────────────────────────────────────────────────┐
│ [选中的内容 · 周报草稿 ×] [→ Pages · 下周计划 光标处 ×] │  情境条：手上 + 落点 + 材料
│ [这项工作] 对选中的内容说点什么…   [●记成待办][调整] ＋ ↑ │  下一步：与输入框同一行
└────────────────────────────────────────────────────────┘
```

1. **情境条**（输入框上方一行）：这次发送会带上的东西，各一枚可删的小片：手上的东西（页面选区、正在看的对象、助理回复里选中的一段）、落点（手上的东西不在左边、左边有落点时）、你加的文件与引用。取代「材料」按钮与弹层（A14）。没加入的「正在看」对象显示成虚框小片，点「＋」加入（沿用 A14 的「无关的不带上」规则）。点「手上」那一片，浮条贴着它出现，列的就是同一份候选（助理面板是一个位置，R23）。
2. **下一步**（与输入框同一行，输入框让出空间；输入框宽度不足 560px 时移到输入框上方、情境条之下）：只放**对话的下一步**（交互线 D1）——等你确认的卡（按钮做的事与卡上的主按钮完全一样）、等你回答的单选题的选项（选了就交回，同卡上点选项）、「去回答（N 题）」、这一轮之后的「打开结果」「再试一次」、页面发来的建议（A7）。最多 3 个，其余「还有 N 项」。按钮是次要样式，等你的那一项带琥珀点；整个界面仍只有卡片上一个实心主按钮。取代：A10「接下来」、A11 两处的「去…」按钮、A7 建议条。
3. **从这一页开始**：只在新工作的空白对话里，与浮条同一份候选（Jev 排的那一份，最多 3 个）加「继续最近的工作」。删掉聚焦输入框时的重复弹层（A5）；「发给：…更改」那一行并进输入框的目标按钮。「/」仍是全部能力。
4. **页面交给助理只有一种方式**：✦助理、带到助理、页面的 `delegate` 消息，都是「把手上的东西放进情境条、打开助理、光标进输入框」；不替人写话。人自己在浮条 ✦ 后打的字照常放进输入框。
5. **写动作留在你正在做的工作里**：浮条或开场建议选的写动作，卡片放进当前工作（助理面板开着、当前工作不是 Coding、对象属于它或者情境条里带着它），否则照旧新开一项；面板打开并滚到卡片，下一步里第一项就是它。用 `offerFromPage` 已有的 `work_id` 参数，不改合同。
6. **助理面板是一个位置**（W3，R23、AC-S15）：在助理回复里选中一段，或点结果小片，它就成了手上的东西（`SurfaceFocus.place = "assistant"`），浮条贴着它出现；左边有落点时浮条最前面标「→ Pages · 第 N 段光标处」，悬停「插入到光标处」时落点闪一下；预览画在左边落点处，确认才写入（3.6 总规则）。落点要等 Pages 报告落点与声明 `attach`（W3 的另一片）。
7. **状态只说一次**：面板头与顶部条带只显示状态和暂停 / 继续 / 停止；「去…」都在下一步里。左侧概况的「还等你处理」留作明细；铃铛只管别的工作的通知。

**不变的**：候选只来自统一能力目录，Jev 排一份，宿主不按 `plugin_id` 分支；写进人眼前正在编辑的对象一律先预览；问卷卡、操作卡的合同与渲染归交互线，本线只决定它们在面板里的位置与动线；回执线 1e 的「每条输入的回执」画在对话里你的那条消息下，不占输入框这一块。

### 21.3 与在途工作的关系

- **#489（Codex，Pages 评论侧栏、助理展开成主区标签）**：它把岛下面的 `.assistant-popover`、`.assistant-offer`、`.assistant-composer` 搬进主区标签的页脚。情境条和下一步都写在输入框表单 `.assistant-composer` 之内，跟着它走，两处都只有一个输入框；A7 建议条删掉后，#489 页脚名单里的 `.assistant-offer` 随本线的改动一起删。按计划 #489 先合，本线在它之上实现。
- **交互线**：下一步的视图用它的 `InteractionNextStep` 与 `renderInteractionNextSteps`；它的 D14 把「接下来」留在对话里，是因为当时还没人做底栏的布局验证，本方案把它挪到输入框同一行（参考图 1、§3 第 2 条的原意），**要交互线同意**（经统筹）。宿主派生下一步的函数（`assistant-view-html.ts`）要加上「等你确认的卡、等你回答的题」两类，也在交互线的文件里，同样经统筹。
- **回执线 1e**：不冲突，见上。

**交互线的答复（2026-10-14，经统筹）**：同意把「接下来」挪到输入框同一行，记作交互线 D24（随 H3 的 PR 进 main）。布局归本线，语义按五条（W3-A1 的验收，编号 FLOW-01…05）：

- FLOW-01：下一步只是同一条记录的另一个入口——做的事和卡上的主按钮、题上的选项完全一样，走同一个 `runCard` / 回答路径，带同一个 `revision` / `pending_revision`，不另写执行路径。
- FLOW-02：点选项直接交回答，只在这几条同时成立时：这一组只有这一道题、单选、没有别的必填题；否则只给「去回答（N 题）」，把人带到卡上。
- FLOW-03：`needs-input` 的卡，或者卡上有没交的改动时，下一步只把人带到卡上，不直接执行。
- FLOW-04：`stale`、`running`、`done`、`dismissed` 的卡不进下一步；`failed` 与 `unknown`（结果未知）的卡只带到卡上，`unknown` 是去核对，绝不在下一步里重跑（交互 spec §7.2：结果未知时不能靠重试把副作用悄悄再做一遍）。
- FLOW-05：同一件事只出现一次。

统筹转来的补充要求（同日，W3-A1 一并做）：

- **部件**：`renderInteractionNextSteps(steps, label, options?)`，`options = { max?, more?(n) }`；不传时行为一字不变（一主一次）；传 `max` 时按调用方的顺序取前 `max` 个，其余合成一个挂 `data-ix-steps-more` 的「还有 N 项」，文字由调用方给。`InteractionNextStep` 加 `waiting`（琥珀点，`data-waiting`）与 `waitingLabel`（读屏读得到的文字，调用方给）。样式进 `INTERACTION_STYLES` 的「下一步」段；组件板加样张（三个按钮、一个等你、「还有 2 项」）；单测断言默认不变与新标记、转义。
- **派生**：待确认的副作用只把人带到复核卡，不在下一步里批准。派生函数放宿主层、通用名字，签名 `(questions, cards, reviews, follow-ups) → InteractionNextStep[]`，Coding（H4）直接用，不经过助理专用的东西——放在 `apps/local-host/src/agent-next-steps.ts`（与共享问卷卡 `agent-question-card.ts` 同层），`assistant-view-html.ts` 调它。
- **执行**：替人选中选项时，像人点一样在卡上点那个选项（共享客户端的 `onChange` 照常存草稿），再点卡的提交；不直接改 `checked`。

派生仍是从记录推出、不另存的纯函数；`interactionNextSteps` 与 `card:` / `question:` 这套 step id 交互线 H4 直接用，改形状先经统筹；输入是问题与卡片的视图，不读助理工作的私有字段，交互线 H4 做 Coding 的下一步时直接复用。

### 21.4 波次（并进第 9 节 W3）

| 片 | 内容 | 依赖 |
| --- | --- | --- |
| W3-A1 | 下一步与输入框同一行：宿主派生全部下一步（卡、题、结果、重试、页面建议），岛只画；删 A10「接下来」、A11 两个「去…」、A7 建议条；窄时移到输入框上方；FLOW-01…05 | #489 先合（交互线已同意，D24） |
| W3-A2 | 情境条：取代「材料」按钮与弹层；删聚焦弹出的开场建议（A5）；✦助理等交接只带手上的东西、不替人写话 | W3-A1 |
| W3-A3 | 写动作留在当前工作（`work_id`）；助理回复与结果可以拿起（`place: assistant`），浮条画在岛里 | W3-A2 |
| W3-A3c | ① 分屏窗格里的落点也闪：顶层把「闪一下」转给报告落点的那个窗格；② 浮条「更多」菜单里的放进去也闪（实现记录见 21.6） | W3-A3b |
| W3-B | Pages 报告落点、三个确定性的 `attach`、落点处预览；落点事件登记；情境条显示落点。执行前宿主用 H3 的 `confirmReferences` 按调用者的权限重读落点对象，不在或没权限用合同里的 `reference-unavailable`，不另写一套；`attach` 的 `find` 取候选（`search.references@1`）改到 W4 的 F2（统筹 2026-10-15 定，见 21.8）。拆成 W3-B1（落点、动作、预览、执行）与 W3-B2（情境条显示落点） | W3-B1：H3 合入；W3-B2：W3-A2 |
| W3-C | 右栏各格报告手上的东西（中枢接右栏；实现记录见 21.6） | W2'（右栏改版） |
| W4-1 | 「记成待办」「记下灵光」并进创建入口（F1 第一批的前两个）：两个插件在写入动作上声明 `intake`，旧的片段动作选项删掉；浮条选中创建入口时，有主人声明的撤销就直接建、完成卡片给「打开」「撤销」，否则出卡片（C10）；只有规则时，一段文字的推荐位里放一个去处（quick-create §6.1） | W3 |
| W4-2 | Pages「存为文档」、Goals「拆成目标步骤」两个创建入口：`pages.create`、`goals.tree.submit` 各声明 `intake`，Pages 加一个只做 `prepare` 的 offers 查询；只有规则时不推提案类（`effect: "proposes"`）与批量（`multiple`）的去处（设计与验收见 21.10） | W4-1 |
| W4-3 | C9：插件页标题栏与右栏插件格的「✦ 一句话新建」（一行输入 → 起草服务 → 同一张卡或直接建），C10 在这条路上照同一规则 | W4-2（有 4 个入口可演示） |
| W4-4 | F2：`attach` 的 `find` 用 `search.references@1` 取候选，目标不在落点时一律放末尾或建关联；Pages「追加到文档」先做（改 `ItemAttach.find` 的形状） | W4-2 |
| W4-5 | F3：`multiple`，一张批量卡片逐条取消、逐条请求号；Todo「提取待办」先做 | W4-3（卡片组件） |
| W4-6 | 内容站请求号泛化（quick-create §4）+ Inbox「放进收件箱」（改 `workflow-content.ts` 的 `receive` 输入，8 个插件的 `receive` 升版本；开片前另写计划） | W4-2 |
| W4-7 | C13 覆盖率门禁（新门禁，只许减少的冻结名单，先问统筹）+ `skills/molis-plugin-dev/contextual.md` 第一部分 | W4-2～W4-6 都有 `intake` 之后 |
| W3-C2 | 在分屏窗格或右栏格自己画的浮条上悬停「放进去」时，左边的落点也闪（统筹 10-18 定；实现记录见 21.6） | W3-C |

每片：`assistant-island.ts` 只减不增，新东西写新文件；页面资源每个文件只减（删掉的旧渲染抵新增）；`pnpm build`、`affected-tests.mjs` 选出的用例、`check-health-gates --base origin/main`、`page-assets --base origin/main`、1440/1024/800/390 与深色截图。

### 21.5 决策记录（本线按体验定，用户验收时可推翻）

| 日期 | 决定 | 被否的做法与理由 |
| --- | --- | --- |
| 2026-10-14 | 下一步与输入框同一行，只放对话的下一步；按钮是卡片按钮的另一个入口，做的事完全一样 | 否：把页面选区动作也放到输入框旁（违反用户 10-09 的 D1）；否：仍留在对话末尾（看到提醒后要再去找按钮，是用户说的「动线不好」本身） |
| 2026-10-14 | 下一步按钮用次要样式加琥珀点，实心主按钮只在卡片上 | DESIGN「一个决定只有一个实心主按钮」 |
| 2026-10-14 | 情境条取代「材料」按钮；带上什么一眼看得见、点 × 去掉 | 否：保留「材料」按钮再加一条情境条（两处说同一件事） |
| 2026-10-14 | 开场建议只在空白对话里一份，删聚焦弹层 | 否：两处都留（重复） |
| 2026-10-14 | 交给助理不替人写话 | 否：沿用「帮我看看这段内容…」（人发出的话不是自己说的，回执与记忆里也会算成人的话） |
| 2026-10-15 | 下一步那一行在所有宽度都紧贴在输入框正上方，不放进输入框那一行；面板打开时整体上移让出这一行 | 否：与输入框同一行（输入框一行已有六个小按钮和触控窗口的分步让位规则 `data-fit`，再塞三个按钮会和让位规则互相挤；紧贴在上方读起来仍是输入框的一部分，切片窄屏时本来就放在这里） |
| 2026-10-15 | 页面发来的建议（A7）是下一步里的一项：点了放进输入框，不发送；面板收起时只显示它；没有「忽略」，新建议替换旧的，点了即消失 | 否：保留单独的建议条（与下一步挤在输入框上方同一块地方，就是 21.1 第 5 条） |
| 2026-10-15 | 对话底部的「↓ 等你确认 / 等你回答 / 有操作等你点」小片删掉，只留「↓ 新消息」 | 等你的东西都在下一步里，第五处说「等你」（21.1 第 3 条） |
| 2026-10-14 | 写动作的卡留在当前工作（条件见 21.2 第 5 条），否则新开 | 否：一律新开（把人从正在做的事里带走）；否：一律放进当前工作（与当前工作无关的对象会混进来，沿用岛「看的不等于做的」规则） |
| 2026-10-15 | 加入（情境条上点「＋」）就是两件事：模型看得到这个对象，工作也记在它下面；没加入（虚框小片写「没加入」）两件都不做。新工作不再自动带上正在看的对象，只有已经属于当前工作的对象自动带上（统筹 10-15 定） | 否：新工作自动带上正在看的对象（看的不等于做的，工作会悄悄记到人只是路过的对象下面）；否：只给模型看、不记关联，或反过来（两件分开，人说不清这次带了什么） |
| 2026-10-15 | 从一个对象发起的交接把那个对象放在手上：✦助理、带到助理把选段连同它所在的对象放进情境条；页面的 `delegate` 消息照旧把对象放在材料上。发送后工作记在那个对象下面（材料关系）。核对过的入口：浮条 ✦ 与「带到助理」、浮条选不中页面时的退路、成果库「交给助理 / Coding」、待办「交给助理」与「继续推进」、灵光「问助理」、侧栏浏览器的建议、成果库「被谁引用」打开工作（只切换，不带东西）。Goal 没有自己的「带到助理」按钮，Goal 正文里的选段走浮条，同上 | 否：交接只带文字，不带对象（工作就记不到 Goal 或文档下面，#271 的「工作事件挂到 Goal」会断） |
| 2026-10-15 | `molis:assistant-open` 去掉 `text`、加上 `object`；待办的 `delegate` 不再写「帮我推进「…」」。灵光「问助理」的话是人自己在灵光里打的，照旧放进输入框并发送 | 否：保留 `text` 只是不用（合同里留一个没人发的字段，以后又有人拿它替人写话） |
| 2026-10-15 | 「说出要做什么」删掉：交接不替人写话以后，它和「带到助理」做的事完全一样 | 否：两项都留（同一件事两个名字） |
| 2026-10-15 | 「发给：助理 · 新工作 · 项目 更改」不放进目标按钮，回到侧栏「这项工作」里选（原来的弹层只是指过去） | 否：新工作也显示目标按钮（craft-finish 已定新工作不占输入框一行的小片，触控时这一行本来就要让位）；否：放进「＋」菜单（「＋」只管添加东西，不管工作怎么做，`immersive-directory` 的用例钉着） |
| 2026-10-15 | 侧栏「材料」块不再列「下次发送带上」的小片，只留拖放区与「用过的」：带上什么只在情境条一处说 | 否：两处都列（两处说同一件事） |
| 2026-10-16 | 情境条放不下时横向滚动：有更多的那一侧淡出，键盘到达的小片滚进视野，竖向滚轮横着滚这一行（STRIP-03） | 否：超出的收成「+N」点开（多一次点击才看得到、要另做一个弹层，与「材料」弹层被换掉的理由相同）；也否：不提示直接截断（看不出还有、也看不出能滚） |
| 2026-10-16 | 落点小片只在页面对象已加入（实线的「正在看」，或点了「＋」）时出现；× 只去掉落点，对象照旧带上，直到落点换到另一个对象前不再出现（L-1，统筹 10-16 定） | 否：按 R21 字面一律默认带上（落点带着前后原文，没点「＋」就把文档内容给了模型，与上一行「没加入两件都不做」和 STRIP-01 冲突） |
| 2026-10-16 | 发送时带上落点：合同 `AssistantContextSnapshot` 加可选的 `landing`（`AssistantLanding`，`SurfaceLanding` 的有界子集）；宿主在这一轮开始前用 H3 的主人读取（`readReferences`，与 `confirmReferences` 同一份）按本人在这个项目里的权限重读落点对象，读不到就整项丢掉，对象名用主人读到的 label；给模型的只是事实（对象、位置、选中的文字、前后原文），不写「请放到这里」一类的话；逻辑在单独的 `assistant-landing.ts`，`assistant-service.ts` 只加调用、行数不增（L-2a，统筹 10-16 定） | 否：只显示不带给模型（R21 的「带上」落空，「帮我续写这一段」写不出贴合位置的内容）；否：宿主另写一套读取（与 W3-B1 执行前那一道重复） |
| 2026-10-16 | 落点的名字是「最近的标题 + 位置词 + 原文片段」：小片写「发布计划 · 「步骤」光标处」，读屏与悬停读完整的一句「放进去的位置：发布计划，「步骤」，光标处（「…第二步，」之后）」；标题由 Pages（落点的主人）填进 `surroundings.heading_path`。取代 §14「最近的标题 · 第 N 段」（L-3，统筹 10-16 定） | 否：第 N 段（合同里没有段落序号，加要改合同；标题加原文片段比数段落更认得出） |
| 2026-10-18 | W4-1 创建入口直接建时，撤销留在 Host：宿主按主人声明的 `undo` 从这次的输出取输入，存在一个令牌后面（S-40：只在内存里，重启失效；只能用一次；绑定项目、操作者和撤销提供方的安装；30 分钟；最多 50 条），「撤销」把令牌交回 `POST /api/contextual/undo`（在 S-03 之内），以本人的权限经动作网关调主人自己的撤销；页面只交令牌，请求体里写了别的就拒（统筹条件③）。与助理工作的撤销共用 `declaredUndo`（`apps/local-host/src/action-undo.ts`） | 否：把撤销动作与输入交给页面（页面就能调任意写入动作的「撤销」，等于在动作网关旁边多开一个门）；否：宿主自己删（绕过主人，S-35 的「只经主人」） |
| 2026-10-18 | 灵光加 `lingguang.revert {id, expected_updated_at}`，`create.undo` 指向它：与 `lingguang.discard` 共用同一个存储函数（`store.discard`）和同一道版本检查，要的权限也一样；别处改过以后撤销被主人按版本拒绝，不删也不改（统筹条件②，LG-REVERT-01）。助理的撤销原来指向不带版本的 `discard`，别处改过也照丢，也因此修好。Todo 已有按版本拒绝的 `todo.changes.revert` | 否：用现成的 `lingguang.discard`（不带版本，别处改过也照删） |
| 2026-10-18 | 只有规则、没有判断时，一段文字（`range`、`block`、`blocks`）的推荐位里放排名最高的一个去处，占最后一个主位；一个词或整个对象照旧（quick-create §6.1）。规则分不出去处，按共同目录的顺序取第一个，代码不点名任何插件；有判断时这一条不起作用（`contextual-destinations.test.ts`「W4-1 §6.1」）。按内容挑去处要 `intake` 声明收哪类内容，是改合同，记在 BL-174（统筹 10-18） | 否：去处一律进「更多」（只有规则时创建入口永远看不到）；否：一个词也推（「在项目里查找」被挤出主位） |
| 2026-10-18 | SDK：片段动作的 offers 查询可以没有自己的选项，条件是它是本插件某个创建入口或追加的 `prepare`（`inspectContextDeclarations`） | 否：给 Todo、灵光留一个假选项（浮条上同一件事出现两次） |
| 2026-10-19 | D-1（W4-2，本线按推荐定）：只有规则、没有判断时，挑那一个去处要跳过提案类（`effect: "proposes"`）与批量（`multiple`）的入口。内核不点名插件：创建入口按声明在候选上带 `always_card`，`planContextualLayout` 在没有判断时不把带这个标记的候选算进去；有判断时照旧由判断排。含义是规则分不出一段文字是不是计划，不能把每段文字都推成一份目标提案；这类去处由判断点名，或由人自己要（`contextual-destinations.test.ts` W4-2-01、W4-2-02） | 否：照目录顺序取第一个（Goals 若排在前面，每段文字都推成一份目标提案，要多点一次确认，而规则根本分不出这段是不是计划） |
| 2026-10-19 | D-2（W4-2，本线按推荐定）：在 Pages 里选中一段也出「存为文档」（把一段提取成新文档），`places` 不收窄 | 否：在 Pages 里不出：提取段落成新文档本来就常用，没有理由挡 |
| 2026-10-19 | D-3（W4-2，本线按推荐定）：提案的完成卡写「已提交目标提案：要在 Goals 里确认才生效」，带「去 Goals 确认」，不写「撤销」。链接由 `goals.tree.submit` 自己的 `result_view` 给，页面不加代码 | 否：给一个「撤回提案」：Goals 里撤回就是审批时拒绝（`goals.tree.decide`），那是人在 Goals 里看过整份提案才做的决定；把它当成 `undo` 放到完成卡上一键做掉，等于绕开审批那一步 |
| 2026-10-19 | D-4（W4-2，本线按推荐定）：没占到主位的去处，若带 `always_card`（提案、批量），按它的意图放进「更多」（只对一段文字，D-6 收窄），有判断没判断都一样；只有规则时仍不推进主位（D-1 不变）。其他去处没有位就不显示（quick-create §6.1 不变）。`planContextualLayout` 把带 `always_card` 的去处留在排名里：`rest` 取没进 `primary` 的这类去处，`listed` 带上它们（页面按 `plan.candidates` 找键），一行注释写明这个例外。这类去处从不直接建，放进「更多」不会误写（`contextual-destinations.test.ts` W4-2-09） | 否：把 `breakdown` 作为片段选项加回来（同一件事两处登记：创建入口与片段选项，quick-create §8 第 2 条）；否：规则也把提案推上主位（每段文字都推一张要确认的卡，规则分不出这段是不是计划，即 D-1 的理由） |
| 2026-10-19 | D-5（W4-2，本线按推荐定）：只有规则时，一段文字（`range`、`block`、`blocks`）推的那一个去处优先别的插件的入口；这段文字所在的插件（`focus.plugin_id`）自己的入口，只在没有别的插件的入口可选时才推。所以在 Pages 里选一段，推的仍是「记成待办」，不是「存为文档」；「存为文档」仍可用（D-2），判断可以点名它。内核不点名插件：候选带可选的 `own?: true`（`destinationCandidates` 用 `ownerOf(view) === focus.plugin_id` 算，只在创建入口上，追加的去处不带），`planContextualLayout` 在没有判断、是一段文字、且有别的插件的入口（可用、不带 `always_card`）时，先筛掉本插件的创建入口，再按排名（D-1）取。按内容挑去处（BL-174）与它叠加：先筛「别处优先」，再按内容挑（`contextual-destinations.test.ts` W4-2-10） | 否：不改，让目录顺序决定（`pages.create` 排在 `todo.items.create` 之前，在 Pages 里每段文字都推「存为文档」，W4-1 的「记成待办」从 Pages 的浮条上消失）；否：只在「推去处」那一步优先别处（本插件的入口靠排名自己进前三时仍占位，W4-2-10 的用例逼出了这一点）；否：在内核里写死插件名 |
| 2026-10-19 | D-6（W4-2，本线按推荐定）：D-4 的「更多」只对一段文字（`range`、`block`、`blocks`，复用内核的 `PASSAGE_GRANULARITIES`）。一个词或整个对象、没有判断时，规则不列带 `always_card` 的去处，它既不在主位也不在「更多」、不在 `plan.candidates` 里；有判断时，点名的照常占主位（任何粒度），没点名的同样不进「更多」、不单独列出（主位有空时，判断版面照旧按排名补满，那是它占了位，不是列出）。这与「规则只对一段文字推去处」是同一条界线，也是「拆成目标步骤」在 W4-2 之前出现的地方（只对一段文字有片段选项）。`planContextualLayout` 里 `rest` 与 `listed` 的这个例外各加一个 `passage` 条件（`contextual-destinations.test.ts` W4-2-09） | 否：任何粒度都放进「更多」（一个词算不出步骤，选了只得到一张没有步骤的卡，白占一行；整个对象的起手项还会带上它） |
| 2026-10-16 | 选区旁的浮条显示前，在锚点中心做一次命中测试：落在助理面板或右栏里、而选区又不在这块面板里，浮条先不出；盖住它的面板一收起，浮条回来。不按宽度分支，只改 `context-bar.ts`，不碰 design-system 的浮条组件；选中的内容照旧在情境条上（统筹 10-16 定） | 否：390px 以下一律不出浮条（宽屏的浮动面板同样会盖住选区，按宽度分支漏掉它）；否：把浮条压到面板下面（浮条指着一段看不见的文字） |

### 21.6 进度与证据

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
  - 宿主 `POST /api/contextual/create`（`apps/local-host/src/contextual/contextual-create.ts`）：起草后按声明决定；能直接建的条件：主人声明的撤销此刻可用（与助理共用 `directEligible`），不是 `proposes`、不是 `multiple`、没有缺的字段。浮条新建是本人亲手点的，不读助理的逐项确认 `confirm_always`：在助理里设成「每次都确认」的动作，在浮条上照样直接建（统筹裁定第 2 条，`specs/repository-anti-corruption` §10.28；`contextual-todo.e2e` 第一条把 Todo 的新建设成每次确认后再建两次，都直接建）。直接建时以本人的权限调用、返回建好的对象与撤销令牌；否则返回草稿，页面出卡片。`POST /api/contextual/undo` 花掉令牌（S-40，`tests/security-invariants-contextual-undo.test.ts`：重复用、换项目、换操作者、过期、提供方换了安装或停用、页面自己写撤销，都拒）。
  - 页面（`context-bus.ts` 的 `create`）：同一个选区与入口复用同一个请求号（连点两次只建一个，主人按请求号去重），在途时第二次点击不发；完成卡片用落点的卡片，「打开」走 `describe` + `openObject`，「撤销」失败时卡片说「没能撤销」。
  - 顺带修好：Goals「拆成目标步骤」的提案条目号原来固定是 `step-1` 一类，同一个项目的第二份提案被拒；改成按请求号区分（`plugins/native/goals/src/fragment-offers.ts`）。
  - 动作合同快照：Todo、灵光几个动作的 `traits` 哈希变了，输入输出 schema 不变，不升版本；新增 `lingguang.revert@1`（MCP 工具多一个）。
  - 页面资源：`workbench.js` +1,158 字节，一次性放行（`APPROVED_CEILINGS`，理由与试过的写在 `scripts/gates/page-assets.mjs`）。
  - 用例：`tests/contextual-create.test.ts`（真 Host：两个入口直接建、一次请求只建一个、别处改过后撤销被拒且不删不改、令牌只能用一次、别的项目的令牌被拒；假目录：没有撤销、提案、多个、缺字段都出卡片，只调 `prepare`）、`tests/plugin-context-declarations.test.ts`、`tests/contextual-destinations.test.ts`（只有规则时一段文字一个去处、一个词没有）、`tests/contextual-fragment-offers.test.ts`（同项目第二份拆分提案）、`tests/contextual-todo.e2e.test.ts`（连点、重选、改后撤销被拒、撤销、打开；原来「卡片执行被拒、什么都不写、可以再执行」那一半改用 Goals「拆成目标步骤」的卡片留在同一个文件里）、`tests/lingguang-actions.test.ts` LG-REVERT-01；原来用「记成待办」「记下灵光」的三个浏览器用例改用「拆成目标步骤」，只改去哪里找。
  - 2026-10-19 补测（防腐 §10.28 对 #730 的复查）：原来写「断言不变」，不实，「卡片准备途中改选区，卡片仍按原选区」那条在 W4-1 里删掉了，没有替换。现在补回两条，都在 `contextual-todo.e2e`：Goals「拆成目标步骤」那条把这次点击发的 `/api/contextual/prepare` 扣在路上、选区换到第二段再放行，问的焦点、卡片摘要、work 和执行后的提案都只有第一段；直接新建那条把第一次 `/api/contextual/create` 扣在路上、换选区再放行，问的焦点、完成卡片和建出的待办都只有第一段。
- 2026-10-19 手上的东西在哪里只看元素（防腐 §10.28 对 #712、#720 的 P3）：原来 `landing.place` 只在元素落在右栏格或助理里时盖掉焦点里的 `place`、`side_tab`，左边的文档（`molis:surface-focus`）和分屏窗格（`workbench-surface-focus`）自己报的 `place: "side"` 与随便一个格名会原样送到 Host，Host 就按右栏给落点、给「插入到光标处」，提示里也写成右栏的格。现在 `place` 一律由元素算出（右栏格 `side` 带格名、助理 `assistant`、其余 `main`），`side_tab` 只在右栏格里有，自己报的两样都不算数。
  - 用例：`tests/security-invariants-pane-messages.test.ts`「S-30 §10.28 …」（分屏窗格与左边文档自称右栏、带伪造格名，Host 收到的是 `main`、没有格；Shelf 框自称助理、带伪造格名，收到的是右栏和 Shelf 自己的格）。
  - 页面资源：`workbench.js` 少 4 字节（`tooling/gates/page-assets.json` 同步降）。

### 21.7 暂停点（2026-10-14，用户：需求线暂停，整机让给防腐线）

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

### 21.8 W3-B 设计（2026-10-15 统筹已定 B-1～B-3；W3-B1 本地开工，H3 #546 合入后开 PR）

**现状（main `ac47ed78`）**：

- 合同已有：`SurfaceLanding`（`contracts/services/contextual.ts`）、`ActionAttach.positions`（`contracts/platform/item-intake.ts`）。
- 内核已能派生：`destinationCandidates` 在手上的东西不在左边（`place !== "main"`）、左边落点是提供方自己的对象种类、位置合声明时，出 `attach.` 候选。
- 宿主的判断请求已能带 `landing`（`contextual-request.ts` 有界读取）。
- **缺的是页面这一半**：没有页面报告落点，情境总线不持有落点，没有插件声明 `attach`，落点处没有预览，执行也没有接上。所以今天 `attach.` 候选永远不出现。

**要做的（按依赖顺序）**：

1. **落点事件**：登记 `molis:surface-landing`（`dom-events.ts`，主人 `context-actions`，发在元素上、冒泡，载荷 `SurfaceLanding | null`），与发它的 Pages 代码同一个改动。`molis:landing-at`（拖放）不在 W3-B，随 W6 拖放做。
2. **总线持有落点**：`context-bus.ts` 收左边焦点窗格的落点，窗格失焦或报 `null` 时清掉自己的；手上的东西在右栏或助理时，判断与准备请求带上落点（宿主已能读）。窗格转发沿用现有的窗格消息。
3. **Pages 报告落点**：光标、选区，没有光标时是文末，带 `version` 与有界的 `surroundings`。写在 Pages 的新文件里（`client.ts` 已 1135 行，只许变小）。
4. **三个确定性的 `attach`**（§14 已定）：插入到光标处（`cursor`、`end`）、替换选中的文字（`selection`）、作为引用插入（`cursor`、`end`，带出处）。
   - 一个动作只能挂一份 `attach`（`ActionView.action.attach` 是单个），所以是 Pages 自己的三个写入动作，共用一个处理器。
   - 输入：`id`、`expected_version`、位置（`anchor`、`head`）、文字、出处（仅引用）。
   - 每个动作带 `undo: pages.revert`（沿用 `update` 的 `change_id`）。
   - 版本不符就拒绝。
5. **落点处预览**（§3.6「放进落点，一律预览确认」）：选了 `attach.` 候选后，由落点的主人页面（Pages）在落点处开面板槽（`molis:context-panel-open`，W1-6 已登记），画出将写入的内容。确认后经动作服务调第 4 步的动作；不在页面里直接改文档，保证与助理、MCP 同一个入口。
6. **H3 那一对函数**：执行前宿主用 `confirmReferences`（`horizontal/search/src/references.ts`）按调用者的权限重读落点对象。不在或没权限时，用合同里的 `reference-unavailable` 拒绝，不另写读取。版本由 Pages 的动作自己比对。
7. **情境条显示落点**：「→ 发布计划 · 「步骤」光标处」（2026-10-16 L-3 改为标题加位置词，见 21.5）。依赖 W3-A2 的情境条，排在 W3-A2 之后。

**决策（统筹 2026-10-15 按推荐定）**：

- **B-1**：三个动作，共用一个处理器，不改合同。三个是不同的操作，各占一个 `capability_id`，都是 version 1；提交时带上 `tooling/gates/actions/` 的快照。处理器在 `beforeEffect()` 之后按读取时的版本（`expected_version`）提交，被取消或撤权就不写。
- **B-2**：W3-B 只用 `confirmReferences`；「`attach` 的 `find` 取候选」（`search.references@1`）改到 W4 的 F2「追加到已有」。
- **B-3**：拆开。W3-B1 = 第 1–6 步，H3（#546）合入后开 PR；W3-B2 = 第 7 步，排在 W3-A2 之后。
- **B-4（统筹 2026-10-15）**：选中事件 `ContextActionChosen` 加两个可选字段 `landing?: SurfaceLanding` 与 `run?(): Promise<unknown>`，`run` 不收参数。`run` 由总线在派发时绑死总线手上的落点和这一次选择，只发 `/api/contextual/attach`；页面拿 `landing` 只定位预览，执行时换不了落点。宿主照旧两道检查：先 `confirmReferences`，再按 `expected_version` 提交。不选「复用现有字段」：插件代码要点名平台路由，`object` 的含义也被挪用；不选「另起一个事件」：多一对发和听，换来的一样。只增字段，现有页面不用改，不留兼容。
- **B-5（本线按体验定，统筹同意）**：只按规则排序时，派生出的 `attach.` 去处排在其他规则之上（内核 `ruleScores`，按声明顺序）。不这样它们永远进不了主行的前三，而版面从不把去处放进「更多」。只在手上的东西不在左边、左边又真有落点时才派生，平常的选区不受影响。
- **B-6**：分屏窗格（iframe）里的落点不在 W3-B1，由情境线在 W3-B2 之后补（W3-B3）：沿用 `workbench-surface-*` 窗格消息，来源照现有写法核对 origin 与来源窗口；若新加消息类型，按 `SECURITY-INVARIANTS.md` 对应条补「别的来源发来的落点被丢掉」的拒绝用例。

**开工须知（统筹 2026-10-15）**：页面资源只许变小，第 3、5 步加的字节在同一个 PR 里自己抵消，不借别的 PR 省下的；第 1 步改合同，同一个 PR 跑 `pnpm api:update`，事件要有人发、有人听；第 5 步的预览挂在主人页面的面板槽里，不开整页、不开第二个标签页（shell-page-gate）；开工先并最新 main（防腐 #542 改 Pages 的 `index.ts`、`store.ts`、`project-data.ts`）；开工前把要改的文件清单发统筹核对。

**防腐预检**：

- 新动作：注册一次，要跑 `actions:update`。
- 新事件：同一改动里登记。
- `assistant-island.ts`、`client.ts`、`context-bus.ts` 只减或持平，新东西写新文件。
- 页面资源靠删掉的代码抵消。
- 不新增 typed 能力。
- 写入从一开始就带读取版本（W3-09-3）。
- 页面请求用 `request-client.ts`（W3-10）。

**实现记录（W3-B1，本地 `c623a9eb`，未推送）**：

- **焦点在哪里**：以前没有谁设 `focus.place`，`attach.` 候选因此永远派生不出来。现在由总线按报告焦点的元素推出：在右栏格子里（`[data-side-panel] [data-side-body]`）是 `side`（带 `side_tab`），在助理岛里是 `assistant`，其余不设（即 `main`）。写在新文件 `context-landing.ts`，`molis:surface-focus` 的监听从 `context-bus.ts` 移过去（`context-bus.ts` 变小）。
- **右栏手上的东西**：右栏的文件预览（`side-panel-files.ts`）打开插件文件时声明它的对象（`data-assistant-context`），在里面选的文字就是手上的东西。插件自己的右栏格子是 iframe，焦点到不了总线，不在 W3-B1。
- **排序**：版面只把前三个里的落点类候选放进主行，从不放进「更多」；只按规则时它们从来排不进前三。内核 `ruleScores` 让派生出的 `attach.` 候选按声明顺序排在其他规则之上（判断时权重和其他规则一样，只占百分之一分）。只在左边真有落点、手上的东西不在左边时才派生，所以不影响平常的选区。
- **输入怎样拼**：宿主 `contextual-attach.ts` 确定性地拼：`id` 取落点对象，`expected_version` 取落点版本，`anchor`/`head` 取落点第一个带位置的目标，`material_field` 取手上各段文字（空行相接，至多 20000 字），动作有 `source` 时取手上对象的标题。手上没有文字就拒绝（`contextual.empty`），没有落点就是 `contextual.stale`。
- **预览**：画在 Pages 编辑器自己的浮层里、落点下方（`placeOverlay`，在 `[data-pages-stage-workspace]` 内），不是 `molis:context-panel-open`（那个槽停在情境条下，离落点远）；仍在主人页面里，不开整页、不开标签页。准备好的输入位置与报告的不同，或确认时文档已改，就不写，请人重新选位置。确认先保存未存的输入，用保存后的版本经 `/api/contextual/attach` 调动作，再按存储重载文档。
- **只有保存了的文字有落点**：Pages 有未保存的输入时报 `null`，保存后再报，所以落点的位置总属于它带的版本；确认时文档若已不同于报告时，不写，请人重新选位置。`run` 因此不用带版本（B-4）。
- **宿主不信页面给的位置**：Pages 的动作先按 `expected_version` 读当前文档，版本不符拒绝（`pages.conflict`），越界、插入带了范围、替换没有范围都拒绝（`pages.invalid`），写入走 `PagesStore.update`。备好输入是确定性的，不调模型，所以动作不声明 `scheduling: "concurrent"`；以后要调模型就得声明，返回后再 `beforeEffect()`。
- **分屏窗格**（iframe 里的落点）不在 W3-B1，见 B-6。
- **执行前重读落点对象（第 6 步）**：`/api/contextual/attach` 调动作之前，宿主用 H3 的 `confirmReferences`（经 `localHost.search`，本人在这个项目里的权限）读一次落点对象，种类限定为 `attach.item_kind`；不在、不能用，或宿主没有这道检查，都拒绝（`contextual.reference_unavailable`），什么也不写。之后版本仍由 Pages 的动作自己比对。证据：`tests/pages-landing-actions.test.ts`「W3-B1 step 6」。
- **待用户定**：页面资源的抵消方式（统筹在问；`served-page-text.ts` 保留绑定名是有测试钉住的决定，没定之前不动）。
- **证据**：`tests/pages-landing-actions.test.ts`（三个动作、版本冲突、撤销、撤权不写），`tests/context-landing.e2e.test.ts`（右栏选一句 → 「插入到光标处」→ 落点处预览 → 放进去）。

### 21.9 下一步行的结果位（槽位接口，2026-10-19；DISPATCH-1019-0710 ⑧）

版面归本线（`assistant-island.ts` 的布局属 ⑧）。回执线的交付说明（3e）与交互线的结果卡（AC-06 H4）都放进下一步行的同一个位置，不各开结构。

**位置与顺序**：

- 先放等你的（确认、问卷、操作卡、核对、等你的子任务），然后是结果位。
- 结果位最多给 2 步（`OUTCOME_STEPS`）。整行仍只显示 3 步，其余收进「还有 N 项」，所以结果不会把等你的挤出前三。
- 结果位一次只说一件事，取第一个有内容的：
  1. 工作的交付说明（回执 3e，⑥ 加）。只在两件事同时成立时出现：最近一轮已经终止，且显示的轮里有人的补充（及为它问的问题）。出现时排第一，因为它的产出链接已经含了这几轮的结果；
  2. 最近跑完的那张卡的结果（交互 AC-06，⑨ 加）。交付说明不出现的时候，它排第一；
  3. 最近一轮做出的结果（「打开「…」」），这一轮失败时是「用同样的话再试一次」。

  最近一轮失败时，前两支都不给步，结果位只给「再试一次」；交付说明和卡片结果在对话里照画。第一支的出现条件与这个顺序是 2026-10-19 统筹答回执线 Q1 定的，以这里写的为准。

**接口**：

- 宿主：`apps/local-host/src/assistant/assistant-outcome.ts` 的 `assistantOutcomeSteps(view, say)`。每个主人在这里加自己的一支，并在对话里画自己的记录；别处不画结果。`assistantStepRow` 把它接在等你的之后，经 `interactionNextSteps` 去重。
- 记录：对话里的一条交付说明或结果，用自己的 `data-ix-record="<kind>:<id>"` 作键（`NEXT_STEP.record`）；卡片的结果用卡片自己的 `data-card` 作键。
- 控件：记录里允许下一步按的控件带 `data-ix-press="<name>"`（结果的「打开」、交付说明里的链接、卡片结果的「打开」）。步的 id 是 `<键>:<name>`（`NEXT_STEP.press`）。
- 页面：`assistant-step-row.ts` 只按记录自己的控件，和人按的一样，所以没有第二条执行路径（FLOW-01）。控件被禁用、记录有没发出的修改、记录里没有这个名字的控件，都只把记录带到眼前，原因由记录自己的控件说（FLOW-03）。只写键不写名字的步，也只带到眼前。键要整段相同，`delivery:w1` 不会接住 `delivery:w10:…`。对话里找不到记录的步交给岛自己的处理（`open:`、`check`、`work:`、`retry`）。
- 结果按钮（2026-10-19 统筹 D10）：记录里打开某个结果的按钮写成 `data-assistant-object="<view.objects 的下标>"`，和回复里的对象按钮同一写法（`assistant-text-parts.ts`）；要让下一步按它，再加 `data-ix-press`。下一步行每次绘制时，把对话里每条 `data-ix-record` 记录交给岛的 `bindText` 接一次：加图标、点开（侧栏预览优先）。记录的主人只给有 `open` 的对象写 `data-assistant-object`，和 `assistant-text-parts.ts` 一样；没写按钮的显示为文字。记录由主人整块重画，行看第一个子节点换没换，换了才再接，所以轮询和缩放不会重复接。卡片里不写 `data-assistant-object`，卡片的结果用卡片自己的控件：岛画卡片时不调 `bindText`，行也不接卡片。卡片结果的「打开」是卡片自己的控件（`data-ix-press`），不经 `bindText`；以后卡片要放 `data-assistant-object` 写法的结果按钮（要行来加图标、点开），行的循环才要加上 `[data-card]`（约 12 字节）并补用例。不给回执工厂另加 `open` 端口（统筹 10-19 D11 先答加端口，10:08 更正为不加）：一处接住所有结果记录，⑥、⑨ 只写按钮不再碰岛；两处都接会给同一个按钮接两次；回执工厂在岛里先于 `bindText` 的声明调用，直接传 `bindText` 会在声明前取值而抛错。
- 不改合同、不改设计系统、不改 `assistant-island.ts`（#631 在途，大面积改它）。

**状态**：

- 空：没有结果就不占位；整行没有步时行隐藏。
- 进行中：一轮还没完不给结果步。
- 失败：只给「再试一次」。
- 不在了或打不开的结果不给步。
- 没权限或已禁用：步只带到记录，由记录说明。
- 能撤销：撤销是记录自己的控件，步按的就是它。

**验收**：

- **SLOT-01**：宿主端结果位排在等你的之后，至多 2 步，不把等你的挤出前三；不在了或打不开的结果不是步。证据：`tests/assistant-interaction-html.test.ts`。
- **SLOT-02**：页面端只按记录自己的控件；禁用、未发出的修改、没有的名字只带到眼前；键不前缀误配；卡片的 `run` 与问卷的选项照旧。证据：`tests/assistant-step-row.test.ts`（真实下发的脚本在 `node:vm` 里跑）。
- **SLOT-03**：页面端把每条结果记录交给岛的 `bindText` 接一次；没重画时再绘制不重复接；主人整块重画后再接；卡片不由行接。证据：`tests/assistant-step-row.test.ts`。

**下发体积**：宿主发脚本前已用 esbuild 压空白（`tightenServedJs`），所以新增的分支只能靠把下一步行的脚本写短来抵：按属性找控件合成一个小函数 `at`，几支判断并在一起，去掉多余的初值。以宿主的压法量，这段脚本比改前少 6 字节，`workbench.js` 不变大。接上结果按钮（SLOT-03）是新功能，省不回来：以宿主的压法量，行脚本多 103 字节、岛的调用处多 4 字节，已用短名字、ARIA 属性直接赋值、调用处的可选链各省一点（共省约 50 字节）。比另加 `open` 端口少一条路径，体积相近。涨的部分由 ⑤ 按页面资源门禁一次放行。

**待补浏览器验证**（用户 10-19 暂停）：

- 一轮做出结果后，下一步行在等你的之后显示「打开「…」」，按下与按结果自己的「打开」相同。
- 窄面板（小于 560px）时结果步随整行移到输入框上方。
- 结果记录里的按钮带对象图标，点开先走侧栏预览；打不开的显示为「…」文字；轮询几次后按钮仍只有一个图标、点一次只开一次。

### 21.10 W4-2 创建入口：Pages「存为文档」与 Goals「拆成目标步骤」（2026-10-19）

状态：实现与节点、浏览器验证已补齐，含本线按推荐定的 D-4、D-5、D-6；10-20 真机复查发现完成链接没有到达提案，按 W4-2-13 补齐审批闭环，工程检查、浏览器实操和独立评审通过。分支 `context/w4-2-create-entries` 在批次前序基础上验证；未覆盖的人工体验列在本节末尾。W4-1 铺好的路（宿主 `POST /api/contextual/create`：主人声明了 `undo` 就直接建，否则出卡片；撤销令牌 S-40）上再加两个入口，创建入口由插件声明，宿主不新增插件专用路由。

**动线**

1. 人在任何地方选中一段文字（Pages 文档、灵光、Coding 的回复、右栏 Shelf、讨论、文件格、助理面板），浮条贴着选区出现，至多 3 个推荐位。
2. 有判断（Jev）时，「存为文档」「拆成目标步骤」和「记成待办」「记下灵光」一起进候选池，由判断按各自的 `describe`、`examples` 排。
3. 只有规则时，一段文字的最后一个主位放一个去处：别的插件的入口优先，没有才放这段文字所在插件自己的入口；同一类里按排名、再按共同目录的顺序取第一个，跳过提案类与批量入口（D-1、D-5，21.5）；所以只有规则时推的仍是一键可撤的去处，在 Pages 里选一段，推的是「记成待办」，不是「存为文档」。
   提案类与批量入口（「拆成目标步骤」）没有占到主位时，对一段文字按它的意图放在「更多」里，有判断没判断都一样；判断点名它就占主位，并从「更多」里去掉（D-4）。一个词或整个对象时，只有判断点名了它才出现，规则与没点名的判断都不把它放进「更多」或列出（D-6）。
4. 点「存为文档」：按钮进入忙碌态，同一处再点是同一个请求号（页面的 `made`）；宿主用 Pages 的 `prepare` 不调模型算出标题与正文，以本人的权限调 `pages.create`，完成卡「已存为文档」带「打开」「撤销」。「撤销」把令牌交回 `/api/contextual/undo`，宿主经 Pages 自己的 `pages.discard` 删，只在文档新建后没改过时；改过了主人拒绝，卡片写「没能撤销」与原因，文档不动。只有这一次真的建了文档，才有「撤销」：同一个请求号再点（连点，或文档改过之后在原处再选同一段）时 Pages 交回的是文档现在的样子，输出里没有 `created_version`，宿主就不签令牌，完成卡只剩「打开」，没有一张卡能删掉人后来写进去的内容。
5. 在「更多」里点「拆成目标步骤」：永远出卡片，不直接建。Goals 的 `prepare`（`goals.fragment.offers`）算出一份结构提案（每个分句一步，至少 4 个字，至多 6 步；文档属于某个 Goal 时挂在它下面），助理面板里是预填的卡，人点提交才调 `goals.tree.submit`；完成卡「已提交目标提案：要在 Goals 里确认才生效」，带「去 Goals 确认」（`/projects/{project_id}/?openPlugin=goals#{proposal_id}`），定位到本次提案。Goals 列表展示所有待确认提案，独立文档的无根目标提案同样可采用或退回；原有 Goal 详情审批入口保留。提案没有撤销：撤回就是在 Goals 里审批时拒绝（D-3）。
6. 做完回到原处：浮条收起，选区还在，左边不跳走（除非人点了「打开」「去 Goals 确认」）。

**五种状态**

| 状态 | 「存为文档」 | 「拆成目标步骤」 |
| --- | --- | --- |
| 空 | 选中的只有空白：宿主先拒绝（`contextual.empty`「没有可以放进去的内容」），浮条下一行错误。一个词、整个对象、几个对象：`pages.intake.offers` 不给输入；只有规则时这几种也不推这个去处（只对一段文字推），判断点名了它，宿主退回通用起草：原文放进 `markdown`，不会建空文档 | 拆不出至少一步（每步至少 4 个字）：`prepare` 不给输入，宿主退回通用起草，卡片里没有步骤、缺项（`items`）写在卡上，人补完才能提交 |
| 加载 | 点下后按钮忙碌，同一处再点不重复建（同一请求号；Pages 的 `pages.create` 带 `request_id`，同一个请求号只建一篇，其他内容用同一请求号被拒） | 点下后按钮忙碌，卡片出来才恢复；卡片里提交中按卡片的现有规则 |
| 出错 | 算不出输入或建失败（Pages 停用、写入被拒）：浮条下一行错误，原文不动，可再点 | 卡片出不来：同左；卡片里提交失败：卡片保留并写原因，可再提交（卡片的现有规则） |
| 没有权限 | 本人在这个项目里没有 `pages:write`，或 Pages 没启用：目录里这一项不可用，不出这个去处；准备（`pages.intake.offers`）要 `pages:read` | 没有 `goals:write`：不出 |
| 可撤销 | 完成卡有「撤销」，30 分钟、只一次、只本人本项目（S-40，不改）；改过了主人拒绝；同一请求号重放的那次没有新建，没有「撤销」 | 没有撤销，卡上不写；在 Goals 里拒绝提案 |

**合同与代码**

- 动作声明：`pages.create` 加 `intake`（`intake_id: "document"`，`verb: "存为文档"`，`material_field: "markdown"`，`prepare: pages.intake.offers`）和输入里可选的 `request_id`；`goals.tree.submit` 加 `intake`（`intake_id: "breakdown"`，`effect: "proposes"`，`verb: "拆成目标步骤"`，`prepare: goals.fragment.offers`）和 `result_view`（摘要加「去 Goals 确认」链接）。新动作一个：`pages.intake.offers@1`（`defineFragmentOffersAction(…, [FRAGMENT_ANY_OBJECT], …, [])`，没有自己的选项，只做 `prepare`，不调模型）。
- `GOALS_FRAGMENT_CHOICES` 去掉 `breakdown`（同一件事只有创建入口一条路，quick-create §8 第 2 条），`progress` 留着；`prepareGoalsFragmentOffers` 照旧算 `breakdown` 这一份输入。
- 合同 `ContextualCandidate`（`@molis-ai/molis-work-contracts/services/contextual`）加两个可选字段，都是只增不改：`always_card?: true`（这个去处从不直接建，永远出卡片：声明了 `effect: "proposes"` 或 `multiple`）与 `own?: true`（创建入口，它的提供方就是手里这件东西所在的插件，即 `focus.plugin_id`）。内核 `candidateOf`（`packages/kernel/src/contextual/destinations.ts`）按声明与 `ownerOf(view) === focus.plugin_id` 设它们；追加的去处永远不带 `own`。`planContextualLayout` 在没有判断时：不把带 `always_card` 的候选算进主位（D-1），对一段文字把它们留在「更多」（`rest`）与列表（`listed`）里（D-4），一个词或整个对象时不留（D-6，`PASSAGE_GRANULARITIES`）；对一段文字、且有别的插件的入口（可用、不带 `always_card`）时，先把本插件的创建入口筛掉再排（D-5）。不点名任何插件。公开 API 快照随之刷新（`pnpm api:update`）。
- `pages.create` 升到 **2**：输入多了可选的 `request_id`，输出多了可选的 `created_version`；原输出只允许 `document`（`additionalProperties: false`），新增字段改变严格形状，按现行合同规则升版。Pages 用现有的 `page_imports`（`PagesStore.importDocuments`）做同请求只建一篇，没有给 `PagesStore` 加方法，写入逻辑放在新文件 `plugins/native/pages/src/create-document.ts`（`createPagesActionHandlers` 已近阈值，不往里加行）；`page_imports` 的请求号与导入对话框共用一个命名空间（导入用 UUID）；`importDocuments` 多收一个可选的 `replay`（重放时的两句提示与一个「是重放」的回调），导入对话框不传、保留原来的两句，`pages.create` 传自己的说法（「同一个请求的内容已改变，请重新发起」「这个请求已完成，但其中的文档已被删除；不会重新创建」），类的行数与方法数不增。
- `pages.create@2` 的 `created_version` 只在这一次真的建了文档时出现，值是建出来的版本号，重放时不带；撤销声明改成 `expected_version: "created_version"`（原来取 `document.version`）。原因：重放返回的是文档现在的版本，原来的声明会让重放出来的撤销令牌带着改过之后的版本号通过 `pages.discard` 的校验，把改过的文档永久删掉（评审 #801 Y1）；`declaredUndo` 在路径取不到值时不给撤销，所以重放没有令牌。不在 `discard` 里硬卡第 1 版：Pages 收回空白文档（W2-18 决定 6）用的版本会大于 1。撤销声明的输入路径变了，快照的 `traits` 哈希随之刷新。
- 动作快照 `tooling/gates/actions/` 刷新（`pnpm actions:update`）：`pages.create@2` 取代 1，`pages.intake.offers@1` 的目标同步为 2；其他 Pages 动作、只变声明的 Goals 和灵光动作版本不变。不留旧动作别名或读取兜底。已固定 `pages.create@1` 的工作流程、绑定及外部插件需重新发现并绑定 2；MCP 工具名改为 `pages.create__v2`，原工具失效。HTTP 路径仍是 `/pages`；动态从目录选动作的 Skill 和平台调用沿用发现结果。
- Inbox：没有自己的创建动作（只有 `inbox.entry.status`、`inbox.pages.generate`、判断类动作和内容站 `receive`），按 W4-2 的条件不动；「放进收件箱」归 W4-6。
- 页面与翻译：完成卡标题按入口的 `verb` 拼，提案走现有的 `suggestCard`，链接由 `result_view` 给。W4-2-13 把待确认提案加入 Goals 的现有列表插槽，并由 Goals 浏览器脚本消费本次提案锚点；未新增宿主路由，采用/退回复用原决定入口。工作台脚本同段精简先抵消新增定位的开销（净减少 5 字节）；补齐未提交理由保存和准确滚动后，最终相对前序为 1,129,470 → 1,129,880 字节（+410）。独立评审与主会话于 10-20 按现行单资源不超过 10 KB 的规则认可一次性精确放行；移除已用完的 #826 条目，超上限一字节、其他资源及新基准继续增长仍拒绝。CSS 及其他资源不变。界面复用现有译文，无新的英文条目。

**已知后果**

- D-5 的代价：没有判断（没配 Jev）时，Pages 的浮条与「更多」里没有「存为文档」；人只能靠判断点名它，或经助理自己要。它仍然「可用」（D-2），只是规则不推。如果将来想让人在 Pages 里一定够得着它，要么 BL-174 按内容挑，要么另议把本插件的入口放进「更多」（会让「更多」里出现普通去处，动 quick-create §6.1）。
- 离线评估的夹具（`scripts/contextual-slice/fixture.mts`）仍是 W4-2 之前的形状：Goals 的「拆成目标步骤」在里面还是片段选项（线上它现在是带 `always_card` 的创建入口，没有判断时不进主位），和 W4-1 之后的「记下灵光」同样是它自己的静态样例。这套脚本（`evaluate.mts`、`evaluate-memory.mts`、`replay.mts`）只排片段选项，不排创建入口，所以拿它评估浮条排位得到的数字，和人在线上看到的不是同一个池子；`evaluate-memory.mts` 的两条用例和 `replay-recorded.json` 以 `breakdown` 为键，直接删掉它会让那两条名次变成 0。要让评估和线上一致，得让夹具也出创建入口的候选，那是另一片的事（评审 #801 J2）。
- 只有规则时在别的插件里选一段，推的那一个按排名、再按共同目录的顺序取（21.5 的 10-18 行与 D-5）：目录里 `lingguang.create` 排在 `todo.items.create` 之前，项目里灵光可用时，浮条上的会是「记下灵光」而不是「记成待办」；这是 W4-1 已有的行为（其第一个用例随 #730 合入），本片没有改变也没有动那个用例。按内容挑去处是 BL-174（`intake` 声明收哪类内容），本片没有加排序规则；它与 D-5 叠加：先筛「别处优先」，再按内容挑。

**验收**

- **W4-2-01**：只有规则时，挑那一个去处跳过提案类与批量入口；判断点名的提案类入口照样占位。证据：`tests/contextual-destinations.test.ts`。
- **W4-2-02**：目录里只剩提案类与批量入口时，规则不推去处，它们也不占任何主位，按意图放在「更多」里（D-4；这一条的断言原来是「也不列出」，因 D-4 改成「列出，但不在主位」）。证据：同上。
- **W4-2-03**：「存为文档」由 Pages 声明、宿主按主人声明的撤销直接建：标题取最近的标题，没有则取第一行，正文是选中的原文，末行「摘自『对象标题』」；同一请求号只建一篇；在 Pages 里选也出（D-2）。证据：`tests/contextual-create.test.ts`（真实 Host）。
- **W4-2-04**：撤销只在没人改过时：没改过，令牌交回、文档删掉、令牌作废；改过，Pages 拒绝并说明，文档还在。同一请求号在文档改过之后再建：交回现在的文档、没有撤销令牌，文档还在、标题是改过的；同一请求号的重放输出里没有 `created_version`，真建的那次有。证据：同上，加 `tests/pages-actions.test.ts`（W4-2-06）。
- **W4-2-05**：「拆成目标步骤」永远回草稿出卡，不调 `goals.tree.submit`，不在片段选项里，没有撤销，完成卡写要在 Goals 确认并带链接；选择它不写任何提案。证据：`tests/contextual-create.test.ts`。
- **W4-2-06**：`pages.create` 的声明、`pages.intake.offers` 的标题与正文（有标题、没标题、选了标题、太长、被截断，截断不切开 emoji）、空白与一个词与整个对象不出、带请求号只建一篇、同请求号换内容被拒、准备要 `pages:read`。证据：`tests/pages-actions.test.ts`。
- **W4-2-12**：动作目录与 MCP 只发布 `pages.create@2`，1 不再可调；创建、片段准备、助理跨服务保存、侧栏和撤销都走 2。MCP 的权限与伪造项目拒绝用存在的 2 测试，拒绝后没有写入；其他 Pages 动作仍为 1。证据：`tests/pages-actions.test.ts`、`tests/pages-mcp.test.ts`、`tests/contextual-create.test.ts`、`tests/assistant-connector-business.test.ts`、`tests/side-panel-platform.test.ts` 与动作快照。
- **W4-2-07**：`goals.tree.submit` 声明为提案（无 `undo`，有 `result_view` 链接），Goals 的片段选项只剩 `progress`，同一个 `prepare` 仍算得出 `breakdown`。证据：`tests/contextual-fragment-offers.test.ts`。
- **W4-2-08**：浏览器：在 Pages 里真选一段 → 浮条上是别的插件的入口「记成待办」，没有「存为文档」（D-5），「更多」里有「拆成目标步骤」、没有「存为文档」（D-4）→ 键盘走一遍（⌘. 进浮条、←→ 成环、Esc 回编辑器；再用 ⌘.、→ 走到「更多」、Enter 展开）→ 没有判断的 Home 里「存为文档」不在浮条上，所以按宿主同一条 `create` 路由（键由 Pages 的声明得出）要它：按所在标题命名、末行「摘自」、源文档不动 → 同一请求号再要只建一篇 → 改过后撤销被拒、没改过撤销成功 → 「打开」走完成卡的「打开」同一个 `describe` 加 `openObject`。「拆成目标步骤」：浮条的主位上没有，「更多」里点它，出草稿、不写提案，被拒的运行什么都不写、卡片原样可再运行，再运行写一份提案，卡片写「要在 Goals 里确认才生效」并带准确提案链接；实际点击、采用与持久化按 W4-2-13 验证。证据：`tests/contextual-pages-goals.e2e.test.ts`（完成卡本身是页面唯一的 `create` 路径，由 `tests/contextual-todo.e2e.test.ts` 第一个用例对「记成待办」走过）。
- **W4-2-09**（D-4、D-6）：只有规则时，对一段文字，提案类与批量入口没有主位、在「更多」里（按意图归入「记录」那一组），键在 `plan.candidates` 里；普通去处没有位就不列。有判断时：判断没点名的提案类入口在「更多」里，点名的占位并从「更多」里去掉；不可用的提案类入口带原因列出，不进「更多」。一个词或整个对象时：规则不列它，没点名它的判断也不放进「更多」、不单独列出（主位被判断点名的去处占满时，它不在 `plan.candidates`），点名它的判断给它主位并可运行。证据：`tests/contextual-destinations.test.ts`。
- **W4-2-10**（D-5）：只有规则时，一段文字推的那一个去处优先别的插件的入口：目录里本插件的入口排在前面、排名自己进前三、片段选项很多或很少，推的都是别的插件的；只有本插件的入口时照推；一个词与整个对象不筛；判断点名本插件的入口照样占位；追加的去处不带 `own`。证据：同上。
- **W4-2-11**（2026-10-20 评审 J3）：灵光同一请求号建成后又编辑，再重放并撤销时必须拒绝，编辑后的标题、正文、状态和时间保持原样；初次创建及未编辑的重放仍可撤销。撤销参数 `expected_updated_at` 从已有的 `spark.created_at` 取首次版本：新建时两个时间相同，编辑/丢弃严格推进 `updated_at`，重放保留 `created_at`，移动保留两者。不增加输出字段或数据结构、不改动作版本；修正既有“只在记下之后没改过时可撤销”的参数映射，动作快照只更新这条撤销声明的 traits。证据：`tests/contextual-create.test.ts` 的真实 Host 录入、修改、重放与拒绝。Pages 的合并保留 Plugin Runtime 的 `ports.read` / `ports.write(caller, …)` 和数据库事务边界，`createPagesDocument` 在同一写事务里处理请求号；不恢复原宿主私路。

- **W4-2-13**（2026-10-20 真机复查）：完成卡必须实际打开本次提案并可采用。复用 Goals 的列表插槽、原确认表单和受保护 decision HTTP；插件自己的浏览器代码只消费有效提案锚点一次，刷新后不重新切换视图或抢焦点。不存在的锚点不选择其他提案，不写业务事实。验收覆盖独立 Pages 文档与所属 Goal 文档：点击完成链接后准确显示新提案，确认前无新 Goal，采用后所列步骤及适用父子关系持久化，其他提案仍待确认；拒绝请求保留输入并可重试。采用另一份提案导致强制刷新时，列表与详情各自仍待决定的提案保留人工输入理由及展开状态，不复制过期条目、冲突检查或按钮状态。证据：`tests/contextual-pages-goals.e2e.test.ts`、`tests/goals-proposal.e2e.test.ts`。范围仅补原链路，不新增审批语义或宿主插件专用路由，资源预算算法不变。

**W4-2-13 验证**：Goals 包要求的服务端回归及相关上下文用例共 19 个文件、89 条通过；包含刷新、多提案理由隔离与上述真实采用链路的 3 个浏览器文件、9 条通过。1440 浅色与 390 深色均检查长标题、提案正文、理由输入及采用/退回按钮；窄屏截图已由主会话和独立评审查看，未见遮挡或横向溢出。资源预算 101 条与动作快照 25 条通过，动作快照未变化。以上证明所覆盖路径，不代替一骏本人验收；本节末尾其余人工体验仍保留。

工作台的列表与详情两种提案 surface 共用同一个 `UiHost` 挂载调用，类型明确的 renderer 入口分别传入自己的模型。`tests/workbench-registration-boundaries.test.mjs` 的原绕过突变仍能拒绝这条唯一挂载路径；该检查随 `pnpm workspace:verify` 运行，守卫与拒绝断言均不改。

**2026-10-20 补验**：`tests/contextual-pages-goals.e2e.test.ts`、`tests/contextual-todo.e2e.test.ts`、`tests/contextual-interaction.e2e.test.ts`、`tests/context-card-in-work.e2e.test.ts` 和 `tests/interaction-no-crosstalk.e2e.test.ts` 共 14 条浏览器用例通过，包含键盘走到「更多」、提案草稿、拒绝后再运行和只建一次。后两份首次导航曾超时，代码和断言不变的定向重跑全部通过。服务端与合同定向共 261 条通过；整体构建、边界、健康和资源检查通过。以下原定人工体验仍未验证：
- 隔离 Home 实走：1440、1024、800、390 加深色截图（写进 `.impeccable/qa/review/`，不入库）。
- 同一选区点两下「存为文档」只建一篇。
