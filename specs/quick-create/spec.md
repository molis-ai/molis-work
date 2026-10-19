# 创建入口：每个插件一句话新建，选中内容自动创建

状态：执行中（2026-10-12）。完整设计与既有验收保留；W0 独立原型已打磨并实操；产品接入的 W1、W2 已在交接分支 #411 里通过工程用例，真实 Jev 评估、桌面原生拖出与一骏本人验收未完成。接续入口、现状、没做的事和下一步见[总纲第 20 节「远端交接」](../context-program/spec.md)，证据见总纲第 16 节；以下标为 2026-10-09 的现状表是历史快照，不代表本轮重新验证。

## 1. 用户的话与要解决的事

用户的话：选中文字，发送到炼金术士，或者发送到 Todo，只是举例。系统层面，所有插件都要有一个快速入口，允许一段自然语言的输入，让助理通过插件提供的创建 Item 接口，创建一个对应插件的 Item。

用户后来补充的两句：①这不是「更多」里的「发送到」菜单，就是一句话新建，由助理创建对应内容，在浮条里由类似 Jev 的选择模型根据当时的上下文推荐最合适的 Item；②选中内容之后**不用用户再输入**，助理根据选中内容的上下文自动创建。

要解决的事：现在「在某个插件里记下一件事」要先切过去、找到新建按钮、填表单。想法通常在别处冒出来，选一段文字、或者随口一句话，就该能落进对应的插件。

## 2. 现状（均已对照代码核对）

1. **没有统一的「创建 Item」接口。** 各插件有各自的创建动作，名字、输入、有没有来源字段都不同（能力 id 是 `前缀.动作`，不是插件 id）：Todo 的 `todo.items.create`（带 `sources` 来源字段，最多 20 条）、灵光的 `lingguang.create`、Pages 的 `pages.create`、Goals 的 `goals.create` / `goals.tree.submit`（提案，要在 Goals 里确认）、炼金术士的 `alchemist.directions.create`、Jelly 的 `jelly.item.create` / `jelly.note.create`、Schedule 的 `schedule.tasks.create`、Cognia 的 `cognia.material.create`、Shelf 的 `shelf.items.admit`、Characters 的 `characters.create`、Coding 的 `coding.sessions.create`……
2. **已经有一个小范围的统一合同：工作流内容站**（`packages/contracts/src/platform/workflow-content.ts`）。角色是 `list / read / receive / create`，能力 id 是 `<站>.content.<角色>`；`receive` 收 `{ payload: { title, body, url?, source?, feed_item_id? }, context: { instance_id, step, title? } }`，返回 `{ plugin, item_id, title }`。Form、灵光、Inbox、Dataset、Jelly、Feed、PPT、Pages 这 8 个插件已经实现了它（成果库是第 9 个站，只能列、读，不能收）。但它为工作流设计：幂等键是「工作流实例 + 步骤」（`workflowDeliveryKey` 返回 `workflow:<实例>:<步骤>`，6 个插件用它；Feed 自己拼 `<实例>:<步骤>`；Inbox 沿用 Feed 条目或交给 Feed），不适合「选中一段文字」这类来源。
3. **助理卡片已经有「先看、再改、再确认」的形态**（`POST /api/assistant/cards`，路由在 `apps/local-host/src/assistant/assistant-http.ts:148`，合同 `AssistantPreparedCard` 在 `packages/contracts/src/services/assistant.ts:134`）：卡片带 `reference`（要调的动作）、`input`（完整输入）、`editable`（可改的字段）、`missing`（还缺的字段）、`source_object`、`materials`（最多 4 段，每段 2 万字）。能否直接执行由 `directEligible`（`assistant-authority.ts:22`）判断。选区动作里的写入类（记成待办、记下灵光）已经走这条路。
4. **助理能直接用目录里的能力**，所以「对助理说一句话让它建待办」今天已经可能；缺的是**每个插件页面里一个看得见的入口**，和**从选区一键送去哪里**的目的地列表。
5. **页面上的新建入口**：设计规范里每个插件列表页有「一个石墨色的新建按钮」，没有自然语言入口。

## 3. 方案一句话

每个插件**声明一次「创建入口」**：它的哪个动作创建 Item、怎么称呼、适合装什么、几句示例。系统据此做两个入口，共用同一条起草 → 创建的路径：

- **① 插件页面里的「一句话新建」**：新建按钮旁一个「✦」，点开是一行输入，写一句自然语言，回车。这里没有选区，那句话就是全部上下文，所以要写；
- **② 选中内容后的浮条推荐（零输入）**：选中文字，Jev 按当时的上下文，在浮条动作区推荐最合适的创建动作（「记成待办」「记成炼金术士想法」……）。点一下就行，**不再输入任何东西**：助理用选区的上下文自动填好目的地创建动作的全部字段，直接创建。没有「发送到」菜单，「更多」里也不出现这些去处。

起草由助理做（按目的地的创建动作的输入 schema 填字段）；创建走插件自己已有的创建动作，不绕过它的校验和权限。

```
入口 ①：用户写的一句话                入口 ②：选区的上下文（不用输入）
        │                                    │ 选中的文字、所在对象与插件、标题路径、
        │                                    │ 周围文字、所属 Goal、最近的动作、记忆召回
        └──────────────┬─────────────────────┘
                       ▼
  助理起草（一次结构化推理，不开 Agent 轮次，不带工具）
        │  按目的地创建动作的 input schema 填字段；有 prepare 的先确定地算；缺的字段标 missing，不追问
        ▼
  创建（确认方式见 §8 问 3）            ← 在浮条下的面板槽或插件页内联，也进助理「还等你处理」
        │  插件自己的创建动作（带请求号，幂等）→ 返回 Item 引用
        ▼
  「已记成待办 · 打开 · 撤销 · 改放到 ▾」
```

## 4. 声明（协议）

随插件的动作登记，进统一目录，不写名单；形状仿 `defineFragmentOffersAction` 和 `defineWorkflowContentActions`。

```ts
interface ItemIntake {
  intake_id: string;                 // 稳定，插件内唯一
  item_kind: string;                 // 创建出来的对象种类，如 "todo_item"
  title: string;                     // 去处的名字：「待办」「炼金术士·想法」
  verb: string;                      // 菜单与按钮里的动词短语：「记成待办」
  describe: string;                  // 给助理看的一句话：这是什么、适合装什么、不适合装什么
  examples: readonly string[];       // ≤3 条自然语言示例；一句话新建的占位文字，也用来校准助理
  action: ActionReference;           // 真正创建的动作：就是插件自己已有的那个
  material_field?: string;           // 选中的文字作为来源写进输入的哪个字段（如 Todo 的 "sources"）
  prepare?: ActionReference;         // 可选：给定文字与出处，不调模型、确定地算出输入（如灵光、Todo）
  effect?: "creates" | "proposes";   // proposes：只提交提案，要在所有者那里再确认（Goals），永远出卡片。这是创建入口自己的字段，与动作合同的 effect（read / write / irreversible）无关
  undo?: ActionReference;            // 撤销这一次创建的动作（删除或归档）；声明了才允许「点一下就创建」，没声明就出预填卡片
}
```

- `prepare` 有就先用它（不调模型，立即出卡片）；没有或用户补了一句话，才由助理起草；
- 同一个插件可以声明多个入口（炼金术士：方向、想法；Jelly：事项、笔记；Feed：加入 Feed、建规则）；
- **已实现内容站 `receive` 的插件不用手写声明**：平台从站点声明派生出创建入口（名称、图标、动词，`action` 指向 `receive`，`material_field` 对应 `body`），作者只需要补 `examples` 和可选的 `prepare`；手写声明覆盖派生值。幂等键要从「工作流实例 + 步骤」泛化成「请求号」，否则选区不能复用（这是产品接入阶段的既有合同变更；读写都只认现行形状，不新增读取兼容）；
- 合同落点：`packages/contracts/src/platform/`，新增 `item-intake.ts`；目录查询沿用现有的动作发现。

## 5. 两个入口

**① 插件页的「一句话新建」。** 平台在插件舞台标题栏放一个槽（与 `data-placement-slot` 同一思路：插件留位置，平台填内容），挨着那个石墨色的新建按钮：一个 ghost 的「✦」按钮，点开是一行内联输入，占位文字取 `examples` 的第一条。回车 → 起草 → 卡片出现在输入下面（与浮条的面板槽同一个组件）→ 确认。没声明创建入口的插件不显示。多个入口时，输入前先选类型（小下拉，默认第一个）。

**② 选区浮条里的推荐创建动作（零输入）。** 创建入口在登记簿里是一个个候选，进同一份推荐，由同一个 Jev 判断按上下文排序（§6 的「推荐」）。选中「周五前把方案发给 Lee」，动作区首位是「记成待办」；选中一句「也许可以把留存拆成三个队列」，首位是「记成炼金术士想法」或「记下灵光」。点了推荐的那个：

- **不用再输入**：助理用选区的上下文自动填字段（标题从选中文字里提，描述带上下文，来源记出处，选中文字里有日期就填截止日期，所在 Goal 就挂上去）；有 `prepare` 的插件先确定地算，不够再由助理补；填不出的字段留空并标出，不向用户追问；
- **推荐错了**：结果提示或卡片上有「改放到 ▾」，下拉是这一次判断排出的前几个去处，一键换，换了就用新去处重新起草；
- **想自己说**：点浮条上的「✦助理」，面板槽里有一行可选的输入，写一句「记到炼金术士里，作为下周的优先方向」，由助理从登记簿里选目的地并起草；这是可选的，不是流程的一部分；
- **不在「更多」里**：创建类候选只在推荐位出现，不进「更多」，也不进「全部操作」。够不着的去处有两条路：「✦助理」里的一句话，和那个插件页面里的「✦ 一句话新建」。

两个入口共用：起草服务、创建、幂等、撤销。区别只有材料：① 是用户写的一句话，② 是选区的上下文。

## 6. 执行与边界

- **起草服务**：Host 里新增一个起草入口（`apps/local-host/src/` 下，与 `contextual/` 并列），模型调用只经 `horizontal/agent-host`；一次结构化推理，不带工具、不开 Agent 轮次。起草本身不写任何记录；
- **材料是数据**：选区文字和用户的话进模型前先 `redactText`、`screenInbound`，像指令的文字当数据放引用块里（沿用 contextual-interaction §4.2）；
- **仅本人可见的来源**（Shelf）：选中文字不参与任何判断，只在用户点了具体去处之后才用于起草；
- **确认按插件分**：声明了 `undo` 的直接创建（带「撤销」），其余出预填卡片、一键确认；创建动作是 `write` 就按卡片的现有规则执行，请求号在卡片路径来自卡片的 `message_id`，直接创建路径由起草服务生成，重发不会建第二条；`effect: "proposes"` 的（Goals）确认后只提交提案；
- **可信身份**：actor、项目从调用上下文来，不从输入读；用户一句话里写的「帮我建给某某」不会改变归属；
- **只许本机本人的创建动作**（`LOCAL`，受众只有 `user` 的）：入口只在本机界面里出现，不进 Agent / MCP 受众。2026-10-09 核对：Coding 新建会话 `coding.sessions.create` 的受众是 user、agent、workflow、mcp，不属于这一类；Coding 里只许本机本人的是改会话、开跑、控制一轮、存报告与变更、存与确认计划；
- **失败**：起草失败或超时，退回「只带着文字去目的地的新建表单」，不丢用户写的话；创建失败保留卡片和输入；
- **撤销**：沿用卡片的撤销；目的地没有撤销就不显示，不假装能撤。

### 6.1 推荐：创建入口怎么进同一份推荐

- 每个创建入口是一个候选：键 `intake.<provider>.<intake_id>`（与 `frag.`、`offer.` 并列），`intent` 取 `capture`（声明里可改成 `advance` 等），`apply` 取 `record`，提示语取 `describe`；
- 进判断的材料：`describe` 和 `examples`（让 Jev 分得清「炼金术士·想法」和「灵光」各装什么），加上现有的选区、对象、标题路径、所属 Goal、最近的动作、记忆召回；输出仍是现有的 `next` 概率，由陈列策略放进推荐位（≤3 个，把握大时才加重点）；
- **候选太多**：先由规则筛，按粒度、选区角色、识别出的日期或链接、插件是否启用与是否有权限，创建类候选留 ≤8 个再交给 Jev；延迟预算沿用 1.5 秒，超时退回规则；
- **没有模型时**（Jev 不可用）：规则只推一个，不加重点：选中的是清单项或带动词的短句 → 待办；一段较长的叙述 → 灵光；
  - 现状（W4-1，统筹 2026-10-18 定）：只对一段文字（`range`、`block`、`blocks`）推，放在最后一个推荐位；一个词或整个对象不推。规则分不出各个去处，所以按共同目录的顺序取第一个，代码不点名任何插件；有判断时这一条不起作用。按内容挑（上面那两条）要 `intake` 声明它收哪类内容，是改合同，记在 BL-174。
- **越用越准**：采纳与忽略的信号（`memory.signals.report`）进记忆，下一次召回「这类内容上次放去了哪」，影响排序；
- **评估**：评估集（contextual-interaction §5.4 的方法）加一类标注「这段选区最合适的去处是哪个插件」，首轮测量后再定目标值，不先拍数字；
- **隐私**：Shelf 这类仅本人可见的来源，选区不进判断，规则推荐只用选区形状；点了具体的去处之后才用于起草。

### 6.2 同形的姊妹：追加、批量、工作流起点

用户第一批纳入的三件事，都和创建入口走同一条路径（候选 → Jev 推荐 → 上下文自动起草 → 创建或预填卡片）：

- **追加到已有 Item（F2）**：声明 `ItemAttach`：`action`（把一段文字加到某个已有 Item 里的动作）、`material_field`、`find`（怎么找候选 Item：沿用该插件的搜索来源，加最近打开的），以及 `positions`（总纲 3.4：与右栏「放进左边落点」合成一个声明）。一个候选只有一种目标：`positions` 只用于落点目标（左边当前打开的编辑器，位置精确到光标或选区，一律先在落点处预览确认）；`find` 找到的目标一律放末尾或建关联。推荐时由 Jev 在候选 Item 里选最合适的一个，结果提示写「已追加到：某条 ▾」，可改。有 `undo` 才直接追加；
- **一次提取多个 Item（F3）**：创建入口允许 `multiple: true`：起草可以返回若干条，出**一张批量卡片**，每条可单独取消，确认后逐条创建，每条各有请求号；条数有上限（先定 8）；Todo 已有的「从材料提取候选」提示词是现成的起点；
- **选中文字运行工作流（F13，用户提出）**：Workflows 插件里的每个工作流是一个动态候选（key `wf.<工作流 id>`，名称与站点链进判断材料）。点了之后，选中的文字作为第一个节点的输入：工作流的第一站是内容站，所以这一步就是第一站的 `receive`——**创建 Item**，然后工作流照常往下推进。要改两处：`instances.start`（现在的输入是 `{ id, item_id?, title? }`：给了 `item_id` 就从第一站已有的内容起步，否则要第一站支持 `can_start_blank` 才建空白，且至少两站）新增 `payload`（标题、正文、出处），创建运行后交给第一站的 `receive`（步骤 0，幂等键沿用「运行 + 步骤」）；片段动作的选项允许按项目动态枚举（有上限、key 稳定、准备时核对工作流仍存在）。工作流可能连着外部动作，所以**总是出预填卡片**（工作流名、起点站、将创建的 Item 预览），确认才运行。

## 7. 各插件的创建动作现状（2026-10-09 按 origin/main 11878059 重新核对）

记号：● 只需声明；◐ 要补一小段逻辑或做一个选择；○ 要先设计。能力 id 是注册在目录里的 `前缀.动作`，不是插件 id，也不是路由 id 或场景 id。

| 插件 | 现有创建 / 接收动作 | 作为创建入口 |
| --- | --- | --- |
| Todo | `todo.items.create`（有 `sources`，最多 20 条） | ● 「记成待办」；已有 `prepare` 的雏形（`todo.fragment.offers`） |
| 灵光 | `lingguang.create` + 内容站 | ● 「记下灵光」；同上（`lingguang.fragment.offers`） |
| Pages | `pages.create` + 内容站 | ● 「存为文档」「追加到文档」 |
| Inbox | 内容站 `receive`（沿用 Feed 条目或交给 Feed） | ● 「放进收件箱」 |
| Jelly | `jelly.item.create`、`jelly.note.create` + 内容站 | ◐ 事项、笔记两个入口；含时间时事项最有用 |
| Feed | 内容站 `receive`（`feed.content.receive`）、`feed.rules.create`（原写的 `feed.out-rules.create` 是路由 id；`feed.capture` 是场景，不是动作） | ◐ 「加入 Feed」（`receive`）与「建规则」（`feed.rules.create`）两个入口 |
| Dataset | `dataset.create`（只收可选的标题）+ 内容站 | ◐ 「建成数据表」更适合选中表格文字；带内容的创建走 `receive` |
| Form | `form.create`（只收可选的标题）+ 内容站 | ◐ 「拟成问卷」；带内容的创建走 `receive` |
| PPT | `ppt.create`（只收可选的标题）+ 内容站 | ◐ 「做成演示稿大纲」；带内容的创建走 `receive` |
| Goals | `goals.create`、`goals.tree.submit`（提案） | ◐ `effect: "proposes"`，确认后到 Goals 里再确认 |
| 炼金术士 | `alchemist.directions.create` 等 | ◐ 方向、想法两个入口。方向与想法的读取动作现在都有（`alchemist.direction.subject.read`、`alchemist.idea.subject.read`），但没有列举动作；所有动作都是项目范围，个人空间里没有可列的内容 |
| Schedule | `schedule.tasks.create`；`reminders.add` 只对插件开放（受众 `plugin`），不能当入口 | ◐ 要理解时间，由助理起草；入口指向 `schedule.tasks.create` |
| Cognia | `cognia.material.create`、`cognia.draft.save` | ◐ 「收进知识库」 |
| Shelf | `shelf.items.admit`（收文字与标题，个人范围，受众 user、workflow、agent、mcp；撤销 `shelf.items.delete`）。`shelf.material.save` 是把已有的 Shelf 材料交给项目（产生过程项，只许人），`shelf.clipboard.add` 是记剪贴板（只许人），都不是这里的入口 | ● 「收进 Shelf」，但仅本人可见 |
| Characters | `characters.create`（输入为空，只建空白草稿） | ○ 个人草稿，「一句话拟人设」要另想 |
| Coding | `coding.sessions.create`（受众 user、agent、workflow、mcp，不是只许本机本人） | ◐ 「新开编码会话并放入这段话」，不开跑；没有撤销，出卡片 |
| Sessions（目录 `work`） | `sessions.create` | ○ |
| Workflows | `workflows.create` | ○ |
| Images | `images.jobs.start`（生图，花钱耗时） | ○ 不是「建 Item」，按「生成」另设计 |
| Experiments、Artifacts、Files、Git、Diff、Text stats | 没有创建动作（Text stats 只有 `text-stats.state`、`text-stats.count` 两个查询） | 不适用，或后续 |

## 8. 取舍（用户 2026-10-02 已按推荐拍板）

1. **一句话新建放在每个插件页面标题栏的「✦」**，挨着新建按钮；没声明创建入口的插件不显示。不另在助理输入框里加「去处」标签。
2. **「记成待办」「记下灵光」并进创建入口，旧的两个选区动作删掉**，选区里同一件事只有创建入口一条路，不留两套。
3. **创建确认按插件分**（用户 2026-10-02 改选，取代之前的「总是出卡片」）：插件在创建入口里声明了 `undo`（待办、灵光、新文档这类删得掉的），选区点一下就直接创建，结果提示里带「撤销」「改放到 ▾」「打开」；没有 `undo` 的、以及 `effect: "proposes"`（Goals 提案）、Coding 会话、工作流运行，出一张**预填好的卡片，一键确认**，仍然不用打字。

## 决策记录

| 日期 | 决定 | 来源 |
| --- | --- | --- |
| 2026-10-02 | 所有插件要有快速入口：一句话自然语言，由助理通过插件的创建 Item 接口创建对应的 Item；选中文字也能发送到任一插件 | 用户 |
| 2026-10-02 | 不新造统一的创建接口：每个插件声明一次「创建入口」指向自己已有的创建动作；内容站 `receive` 可直接复用，幂等键泛化为请求号 | 按推荐（§4） |
| 2026-10-02 | 入口放在插件页标题栏「✦」 | 用户（推荐项） |
| 2026-10-02 | 并入「记成待办」「记下灵光」，删旧动作 | 用户（推荐项） |
| 2026-10-02 | 总是出卡片，确认才创建（同日被下面「创建确认按插件分」取代） | 用户（推荐项） |
| 2026-10-02 | 纠正：「发送到」不是「更多」里的菜单；创建类候选进同一份推荐，由 Jev 按上下文在浮条动作区推荐，不进「更多」与「全部操作」 | 用户 |
| 2026-10-02 | 选中内容后的创建**不用用户再输入**：助理按选区上下文自动填字段创建；一句话输入只在插件页「✦」里需要，或作为浮条「✦助理」里的可选项 | 用户 |
| 2026-10-02 | 创建确认按插件分：声明了 `undo` 的直接创建，其余出预填卡片（取代「总是出卡片」） | 用户（推荐项） |
| 2026-10-02 | 同形姊妹纳入：追加到已有 Item（`ItemAttach`）、一次提取多个 Item（`multiple`）、选中文字运行工作流（`instances.start` 加 `payload`，第一站 `receive` 创建 Item） | 用户 |
| 2026-10-02 | 与右栏需求合并设计：`ItemAttach` 同时承担「放进左边落点」，加 `positions`；手上的东西可以来自右栏与助理面板，创建入口与工作流候选对它们同样适用 | 用户（总纲） |
| 2026-10-09 | 吸收 main：§2、§7 的能力名与输入形状按 11878059 改正；「收进 Shelf」指向 `shelf.items.admit`（不是 `shelf.material.save`）；Coding 新建会话不是只许本机本人；Schedule 的入口只用 `schedule.tasks.create` | 核对结果（总纲第 15 节） |

## 9. 分期与验收

**分期**
- Q0 本文 + 把「推荐的创建动作」和「一句话新建」画进 context-toolbar 的高保真切片；
- Q1 合同与起草服务：`item-intake.ts`、内容站幂等键泛化、起草入口、卡片复用，单测；
- Q2 先接 Todo、灵光、Pages、Inbox、Goals 五个入口，插件页「✦」与浮条里的推荐创建动作；
- Q3 其余插件按 §7 的 ● ◐ 顺序补；○ 的先设计；存量插件的完整补齐计划（波次、完成标准、PR 形状）见 [context-toolbar §11.6](../context-toolbar/spec.md)，创建入口是其中第 2 项；
- Q4 真实 Home 验证：选区送去 Todo / 炼金术士、一句话新建、起草失败与重复提交、分屏窗格、读屏。

**验收（AC-Q）**
- Q01 声明过创建入口的插件，页面里有「✦」；没声明的没有；插件停用，它的「✦」和浮条里的推荐同时消失；
- Q02 选中一段文字，浮条推荐位出现最合适的创建动作；点一下，**不输入任何内容**，就得到填好的结果，带着出处；「更多」里没有创建类去处；
- Q08 创建确认按插件分：声明了 `undo` 的点一下就建，提示里有「撤销」「改放到」；没声明的、提案类、工作流运行出预填卡片，一键确认；撤销只撤这一次创建，且按请求号幂等；
- Q09 选中一段会议纪要，推荐位出现「提取待办」，一张批量卡片列出各条，可逐条取消；
- Q10 选中一段文字，推荐「运行：整理成周报」，确认后第一站收到这段文字并创建 Item，随后的交接照常推进；重发不会建第二个 Item；
- Q03 选中的文字里有「下周三前」，截止日期被自动填上；填不出的字段标出，可改，不追问；点「改放到 ▾」换去处，用新去处重新起草；
- Q04 重复点击、刷新后重试、重发请求都只建一条；预填卡片路径点确认才创建；
- Q05 起草失败时用户写的话不丢；创建失败卡片保留；
- Q06 外壳没有按 `plugin_id` 的分支；仅本人可见来源不进判断模型；只许本机本人的动作不进 Agent / MCP；
- Q07 内容站既有测试不变（读取兼容）；`pnpm boundary:check` 通过。

  2026-10-11 实施校正：上句保留原验收全文以便对照；括号中的“读取兼容”是已被现行合同规则取代的历史实施前提，不得据此加兼容层。Q07 仍要求内容站原有业务行为回归与边界检查；合同改形状时更新对应断言，不能放宽业务约束。

**风险**
- 助理填错字段 → 直接创建的有「撤销」「改放到」，卡片路径可改、缺失处标出、确认才创建；
- 入口太多让「更多」变长 → 同组超过 6 项折成子菜单；
- 起草要等模型，慢 → 有 `prepare` 的先确定地出卡，模型起草只在补了话时发生；
- 与助理「直接说一句话」重复 → 不重复：那是对话，这里是就地入口，共用同一套能力与卡片。

## 10. 开发手册、Skill、模板与门禁

创建入口要「大部分插件都有」，所以手册、Skill、`plugin create` 模板、覆盖率门禁（冻结豁免名单，只许减少）、生成插件由平台代写，都放在 [context-toolbar §11](../context-toolbar/spec.md)，不在这里重复。本 spec 只要求：Q1 合同落地时同一个 PR 带上 Skill 与手册的对应章节，Q2 起每接一个插件就把它移出豁免名单。

## 11. W4-6 与 BL-174 计划（2026-10-19）

状态：W4-6a 已实施，待评审合入（分支 `context/w4-6a-receive-v2`，2026-10-19）；W4-6b 与 BL-174 仍是计划，未实施。这一节由情境线 ⑧ 的规划会话写，对照的是 origin/main `ebad9a223` 的代码。11.9 的两个问题已由用户在 2026-10-19 回答，答复记在 11.9。

### 11.1 三片与顺序

每片一个 PR。

| 片 | 做什么 | 前置 | 进哪一批 |
| --- | --- | --- | --- |
| **W4-6a** 合同泛化 | 内容站 `receive` 的幂等键从「工作流实例 + 步骤」换成通用的请求号，`receive` 升到 v2。八个接收站、工作流、放置和测试在同一个 PR 里改完（CONTRACT-CHANGES §3.2） | 无。与 W4-2 只在快照文件和 `tests/pages-actions.test.ts` 相交（11.8） | 要改 contracts 和 SDK，算共享核心，进 ⑤ 的集成批次跑全量 |
| **BL-174** 规则按内容挑去处 | `intake` 新增 `fits` 字段，声明自己收哪类文字。没有判断时，内核按选区的形状挑那一个去处 | W4-2 合入（两边都改 `planContextualLayout`、`candidateOf`、`ContextualCandidate`） | ⑤ 的集成批次 |
| **W4-6b** 派生创建入口与「放进 Inbox」 | 内容站的声明可以派生出创建入口；Inbox 用它加上「放进 Inbox」；Pages 与 Inbox 共用 SDK 里的段落工具 | W4-6a、W4-2 合入；建议排在 BL-174 之后 | SDK 新增工具，算共享核心，进 ⑤ 的批次 |

顺序：W4-6a →（W4-2）→ BL-174 → W4-6b。W4-6a 不等 W4-2，可以和 W4-2 的评审同时进行。

W4-6b 排在 BL-174 后面的理由：Inbox 不声明 `fits`。有了 BL-174，没有判断时 Inbox 不会只因为目录顺序在前就占到那一个推荐位。如果 W4-6b 先合，没有判断时也可能推到「放进 Inbox」。这不会写错东西，因为它只出卡片，但会改变 W4-1 定下的、人看得到的行为。

### 11.2 存量工作流有没有固定 `receive` 的版本（只看代码，没有打开任何 Home 或数据库）

**结论：固定了。** 而且不只固定 `receive`：保存下来的每个站点、每个角色都按确切版本固定。

**依据**

- **保存流程时固定。** 新建、修改、开始一次运行，都经过 `validChain`（`plugins/native/workflows/src/actions.ts:238-243`）解析全部站点。`bindingFor`（`plugins/native/workflows/src/content-client.ts:26-36`）把这个站点的每个角色（list、read、receive、create）记成 `{ capability_id, version }`，加上 `provider_id`。结果存进站点的 `content`（`plugins/native/workflows/src/model.ts:30`），落在 `workflows.chain_json` 表（`plugins/native/workflows/src/store.ts:212-230`）。
- **运行中的实例也固定。** 推进之前，`prepareHandoff` 会再解析一遍后面的站点（`actions.ts:292-296`），然后把解析好的整条链存进实例（`actions.ts:332`，写进 `instances.chain_json`）。所以运行中的实例自己带着一份固定引用。
- **固定的引用必须完全对上。** `resolve` 拿着保存的引用时，要求每个已保存的角色都能在目录里找到同一提供方、同一 `capability_id`、同一 `version` 的动作（`content-client.ts:38-51`）。找不到就报 `workflows.unavailable`：「已保存的接收能力 v1 不可用；原引用已保留，请检查插件或重新配置该站点」（`content-client.ts:46`），不会换成新版本。这正是 action-architecture §3「工作流存量内容站迁移」的规则。现有测试 `tests/workflow-content-actions.test.ts:110-134` 就断言了这一点（`register(2)` 之后报「v1 不可用」）。

**升到 v2 之后会怎样**

- 凡是用了八个接收站（Dataset、Feed、Form、Inbox、Jelly、灵光、Pages、PPT）之一的已存流程，打开时那一站标为不可用，并给出原因（`actions.ts:244-249`；`plugins/native/workflows/src/client.ts:265`）。开始不了，界面提示「先恢复不可用的站点」（`client.ts:323`）。
- 站点在第一站也一样会坏：`resolve` 检查的是保存下来的**所有**角色，而 binding 里存着 `receive@1`。
- 成果库这一站（`receive: false`）不受影响。
- 修复办法：在编辑器里把这一站拿掉再加回来。新加的站点只带插件名（`client.ts:155`），保存时会固定到当前版本。
- **运行中的实例没法在编辑器里修**：实例的链是自己存的一份，改流程碰不到它，所以这样的实例会一直停在「v1 不可用」。

**不固定版本的地方**

- 内置的示例流程 `[feed, inbox, pages]` 只写了插件名（`client.ts:986`）。
- 创作台回放的语料 `tests/fixtures/studio-replay/recorded.json` 只记了能力 id，没有版本。
- 只有测试替身写死了版本：`tests/workflows-stop-and-token.test.ts:18-19`。
- 放置的「转成」每次都按当前目录找 `receive`（`horizontal/placement/src/index.ts:361-364`），不固定版本。
- 创作台生成的插件调不到 `receive`：它的受众里没有 `plugin`，所以创作台的目录（`apps/local-host/src/plugin-builder/catalog.ts:60-90`）不把它开放给插件，理由写「提供方没有开放给插件」（:86）。

**还会跟着变的东西：MCP 工具名带版本号。** 工具名是 `<capability_id>__v<version>`（`apps/mcp/src/action-tools.ts:8-21`），所以八个 `…content.receive__v1` 会变成 `__v2`。按 CONTRACT-CHANGES §3.5 这是产品决定，已定，见 11.9 第 2 条。

**只能看真实 Home 才知道的**：真实 Home 里有没有用到这八个站的已存流程或运行中的实例。已定，见 11.9 第 1 条：由用户自己在编辑器里修。

**一个已知的边角情况**：升级前发出、Feed 已经收下、但工作流崩溃没记上的那一次交接，升级后重试会在 Feed 里多出一条。原因是 Feed 的 `externalId` 从 `<实例>:<步骤>`（`plugins/native/feed/src/content-actions.ts:29-43`）变成了请求号 `workflow:<实例>:<步骤>`。另外六个站本来就用 `workflow:<实例>:<步骤>`，工作流继续发同一个值，所以不受影响；Inbox 自己不存键，跟着 Feed 走。不为这种情况写兼容。

### 11.3 合同变化与各插件的版本

`receive` v2 的输入（输出不变，仍是 `{ plugin, item_id, title }`）：

```ts
interface WorkflowReceiveInput {          // molis.workflow.content.receive.input.v2
  readonly title: string;
  readonly body: string;
  readonly url?: string | null;
  readonly source?: string | null;
  readonly feed_item_id?: string | null;
  /** 一次交付。同一个请求号只建一个对象，重发时返回同一个。由调用的入口给，不由起草猜。1–160 字。 */
  readonly request_id: string;
}
```

| 动作 | 版本 | 变化 | 哪一片 |
| --- | --- | --- | --- |
| `dataset`、`feed`、`form`、`inbox`、`jelly`、`lingguang`、`pages`、`ppt` 的 `.content.receive` | 1 → **2** | 输入改成上面的平铺形状，`input_type` 改为 `….receive.input.v2`；`output_type` 仍是 `.output.v1`；`context.title` 去掉（没有站点读它） | W4-6a |
| 以上各站，加成果库的 `.content.list` / `.read` / `.create` | 不变，仍是 1 | 无。`workflow_content.protocol` 仍是 1 | — |
| `inbox.content.receive@2` | 2 | 多了派生出的 `intake` 和 `result_view`。它们是声明，不改输入输出的形状，所以不升版本，与 W4-2 给 `pages.create@1` 加 `intake` 同一做法 | W4-6b |
| `inbox.intake.offers` | 新增，1 | 只用作 `prepare`，没有自己的选项，不调模型 | W4-6b |
| `todo.items.create`、`lingguang.create` | 不变 | `intake` 多了 `fits`，属于声明 | BL-174 |

合同包与 SDK 的导出变化：

- **W4-6a**
  - 新增 `WORKFLOW_CONTENT_VERSIONS`（`list: 1, read: 1, receive: 2, create: 1`）。定义器和 SDK 的检查都从它取版本。
  - `WorkflowReceiveInput` 改成平铺。
  - 删掉 `workflowDeliveryKey`：「工作流实例 + 步骤」这个说法回到工作流插件自己，由它拼请求号。
- **W4-6b**
  - `WorkflowStationSpec` 多两个可选字段：`intake`、`receive_result_view`。
  - SDK 新增段落工具 `passageDraft`。
- **BL-174**
  - 新增 `ITEM_INTAKE_FITS`。
  - `ActionIntake.fits?` 和 `ContextualCandidate.fits?`。

每片都在同一个 PR 里跑 `pnpm actions:update` 和 `pnpm api:update`，并在 PR 的「公开合同与 API 影响」一栏写清楚。W4-6a 还要列出八个 MCP 工具的新旧名字。

### 11.4 W4-6a：合同泛化

1. **合同**（`packages/contracts/src/platform/workflow-content.ts`）
   - 按 11.3 改 schema 与类型，版本从 `WORKFLOW_CONTENT_VERSIONS` 取。
   - 把「定义一个角色」拆成自己的函数，让每个函数都在 20 行以内（合同纯度门禁；`defineWorkflowContentActions` 现在已经 19 行）。
   - 改完所有站点一起换版本，不需要每个插件各改一行。
2. **SDK 的检查**（`packages/plugin-sdk/src/action-declarations.ts:202-216`）：`input_type` 与 schema 按角色的现行版本核对。按旧形状声明 `receive` 的插件，登记时就被拒绝，理由写明「没有兑现工作流内容协议 receive v2 的输入合同」。
3. **八个接收站**：原来用 `workflowDeliveryKey(context)` 的地方，改用 `input.request_id`。
   - Dataset（`plugins/native/dataset/src/actions.ts:141-146`）、Form、Jelly、灵光、Pages、PPT：各自的 `content-actions.ts`。
   - Feed 的 `externalId` 改用请求号。Feed 收东西放在哪个来源下，由可信的 `caller.audience` 决定：
     - 受众是 `workflow` 的，仍放在 `workflow-handoffs`「工作流程」；
     - 其他调用方的（人经放置或浮条、助理、MCP），放在新来源 `hand-ins`「放进来的内容」。
     - 两个来源都不进系统搜索（`plugins/native/feed/src/content-actions.ts:51` 同样排除）。
   - Inbox：`ensure(itemId, addedBy)` 里的 `added_by` 由 Inbox 插件按 `caller.audience` 定：
     - `workflow` 记 `"workflow"`，仍显示「Inbox · 工作流程」（`plugins/native/inbox/src/projection.ts:85-88`）；
     - `user` 记 `"web_user"`，与 Feed「加入 Inbox」同一个值（`plugins/native/feed/src/application.ts:181`）；
     - 其余照受众名记。
     - 没人读的 `workflow_instance_id` 去掉。宿主 `apps/local-host/src/inbox-actions.ts:65-66` 只把值传过去，不再自己写死 `"workflow"`。
     - Inbox 调 Feed 用的是 `retainActionAuthority` 包过的调用上下文，受众不变，所以 Feed 那边看到的是同一个受众。
4. **工作流插件**（`plugins/native/workflows/src/`）
   - `content-client.ts` 里新增请求号函数，返回 `workflow:<实例>:<步骤>`。格式不变，所以另外六个站的已有交付键保持原样。
   - 接收端口改成 `receive(plugin, payload, requestId, binding)`（`actions.ts:116`、`content-client.ts:95`）；`continuation.ts:43` 改用它。
   - 实例标题不再随交付一起发。
5. **放置**（`horizontal/placement/src/index.ts:363-364`）：用 `request_id: "placement:<请求号>"`，不再伪造 `instance_id: "placement:…", step: 0`。放置用的是本人的上下文（`apps/local-host/src/placement-actions.ts:83-86`），所以从放置转进 Inbox 的条目，以后不再被标成「Inbox · 工作流程」。
6. **文档**
   - `skills/molis-plugin-dev/placement.md:33` 改成「同一次交付只建一个对象（用输入里的 `request_id`）」。
   - `docs/system/CALL-CHAINS.md:162` 写明 Feed 的两个来源由受众决定。
   - 本文 §2 第 2 条是当时的现状，不改。
   - `skills/molis-plugin-dev/generated-design.md:21` 推荐生成插件调用 `feed.content.receive`，可这个动作不开放给插件。这是已有的问题，不在本片修，记为后续。
7. **存量数据**：PR 里不带任何迁移代码，处理办法见 11.9 第 1 条：用户自己在编辑器里修。

### 11.5 W4-6b：内容站派生创建入口与「放进 Inbox」

**派生的写法**

站点声明里写了 `intake` 的，定义器给这一站的 `receive` 加上一个普通的 `intake`。各字段这样来：

- `intake_id`：站点 id
- `item_kind`：`subject_kind`
- `title`：站名
- `material_field`：`"body"`
- `verb`、`describe`、`examples`，以及可选的 `prepare`、`places`、`fits`：由作者写
- `receive_result_view`：放到 `receive` 动作上，就是完成卡的摘要和链接

几点说明：

- 内核与宿主看到的只是一个普通的 `intake`，没有按站点、按插件分的分支。
- SDK 已有的检查照常起作用：`material_field` 必须是顶层字段，这也是 v2 必须平铺的原因之一（`packages/plugin-sdk/src/context-declarations.ts:58`）。
- 这一片只有 Inbox 写 `intake`。Pages、灵光已经在自己的创建动作上有入口，不再写，所以同一个插件不会出现两个同义的去处。
- Feed、Jelly、Dataset、Form、PPT 按 §9 的 Q3 以后再接。

**Inbox 的声明**（`plugins/native/inbox/src/content-actions.ts`）

```ts
defineWorkflowContentActions({ id: "inbox", title: "Inbox", icon: "inbox", subject_kind: "inbox_entry", /* 权限与调度不变 */
  intake: { verb: "放进 Inbox",
    describe: "还没决定怎么处理、先放着稍后看的一段材料或一件事；已经知道要做的放待办，一闪而过的念头放灵光",
    examples: ["这段先放着，周会再看", "客户这条反馈稍后处理"], prepare: { capability_id: "inbox.intake.offers", version: 1 } },
  receive_result_view: { summary: "已放进 Inbox", title_pointer: "/title",
    link: { label: "去 Inbox", href_template: "/projects/{project_id}/?openPlugin=inbox" } } });
```

动词按 `docs/system/GLOSSARY.md:281` 写成「放进 Inbox」：中文界面里 Inbox 的显示名用英文。§7 表里的「放进收件箱」在这一片的 PR 里一并改掉。

**准备（`prepare`）**

- `inbox.intake.offers`：用合同包已有的 `defineFragmentOffersAction("inbox.intake.offers", [FRAGMENT_ANY_OBJECT], …, ["inbox:read"], [])` 声明，没有自己的选项，要 `inbox:read`。从选区算出完整输入 `{ title, body, request_id }`，正文末行是「摘自『对象标题』」。
- 一个词、整个对象、几个对象，都不给输入。
- 标题、各段原文、出处、是否截断，由 SDK 的新工具 `passageDraft`（`packages/plugin-sdk/src/passage-draft.ts`）算：标题取最近的标题，没有就取第一行去掉列表记号，最多 80 字。这套逻辑就是 W4-2 在 Pages 里写的那份。
- 这一片顺带让 Pages 的 `preparePagesIntakeOffers`（`plugins/native/pages/src/intake-offers.ts`）也改用 `passageDraft`，W4-2-06 的断言不改。
- Inbox 现在只依赖合同包（`plugins/native/inbox/package.json`），要加上 SDK 依赖，并重新生成包清单的行（`node scripts/gates/package-inventory.mjs --table`）。

**动线**

1. 人在别处（灵光、Pages、Coding 的回复、讨论、右栏 Shelf、助理面板）选中一段文字，浮条贴着选区出现。
2. 有判断时，「放进 Inbox」和「记成待办」「记下灵光」「存为文档」「拆成目标步骤」一起进候选，判断按各自的 `describe` 和 `examples` 排。没有判断时，它不声明 `fits`，只有在没有别的去处声明这类内容时，才按目录顺序轮到它（BL-174）。
3. 点「放进 Inbox」，按钮进入忙碌状态。宿主用 `inbox.intake.offers` 不调模型算出标题与正文，在助理面板里出一张预填卡片，标题和正文可以改。Inbox 没有 `undo`，所以不直接建。
4. 点「确认」：以本人身份、带卡片的请求号调用 `inbox.content.receive@2`。
   - Feed 在「放进来的内容」来源下存一条，Inbox 建一条 `added_by: "web_user"` 的事项，显示「手动加入」。
   - 然后 Inbox 做下一步判断。判断失败不影响收下内容。
   - 完成卡写「已放进 Inbox」，带「去 Inbox」。
5. 做完回到原处：浮条收起，选区还在，左边不跳走。
6. 在 Inbox 页，标题栏出现「✦」，占位文字是「这段先放着，周会再看」。写一句、回车，经过起草和卡片，确认之后与第 4 步一样。

**五种状态**

| 状态 | 浮条里的「放进 Inbox」 | Inbox 页的「✦」 |
| --- | --- | --- |
| 空 | 选中的只有空白：宿主拒绝（`contextual.empty`「没有可以放进去的内容」，`apps/local-host/src/contextual/contextual-draft.ts:65`）。一个词或整个对象：准备不给输入，没有判断时也不推；判断点了它，就退回通用起草（原文放进 `body`，标题由起草来填，填不出的标为缺项） | 输入是空的，回车不起作用，与现有的「✦」一样 |
| 加载 | 点下后按钮忙碌，卡片出来才恢复。卡片确认后一直忙碌，直到 Inbox 存好并做完下一步判断（`receive` 是 `concurrent`，不占项目队列）。同一个请求号再点，不会多建 | 起草时输入框忙碌；卡片与左边一样 |
| 出错 | 准备或起草失败：浮条下方一行写错误，原文不动，可以再点。确认失败（Inbox 或 Feed 被停用、写入被拒）：卡片保留并写出原因，可以再确认 | 起草失败时，用户写的话不丢（Q05）；其余与左边一样 |
| 没有权限 | 缺 `inbox:write` 或 `feed:write`，或者 Inbox 没启用：目录里这一项不可用，不出现这个去处。准备要 `inbox:read` | 不出现「✦」 |
| 可撤销 | 没有撤销，卡片上不写「撤销」。之后在 Inbox 里「忽略」只是处理这条事项，Feed 里那一条还在，不假装撤销过 | 同左 |

以后其他站点用同样的方式接入时，五种状态照这一行写，差别只在各自的 `prepare` 和权限。

### 11.6 BL-174：只有规则时，按内容挑去处

**合同**（`packages/contracts/src/platform/item-intake.ts`）

- 新增 `ITEM_INTAKE_FITS = ["line", "list", "prose"]`，`ActionIntake` 多一个可选的 `fits`，写它收哪几类文字。
- SDK（`packages/plugin-sdk/src/context-declarations.ts`）只接受这三个值组成的、非空、不重复的子集。
- `candidateOf`（`packages/kernel/src/contextual/destinations.ts`）把 `fits` 抄到候选上（`ContextualCandidate.fits`，`packages/contracts/src/services/contextual.ts`）。

**内核怎么分类**：只看选区的形状，不看用了哪些词，也不点名任何插件（K5 门禁，`scripts/gates/kernel-contextual.mjs`）。只对一段文字（`range`、`block`、`blocks`）分类：

- `list`：有任何一部分的角色是 `list` 或 `task`（`FRAGMENT_ROLES`）；或者至少有两行，而且每行不超过 60 个字。
- `line`：只有一行，不超过 60 个字，而且不是只选了标题。
- `prose`：其余情况，包括一行超过 60 个字的。
- 只选了标题、代码或表格的，不分类。

**怎么挑**：只在没有判断的时候起作用。`planContextualLayout`（`packages/kernel/src/contextual.ts:334-365`，W4-1 那几行）取排名里第一个声明了这一类、并且不带 `always_card` 的去处。没有任何去处声明这一类的，退回 W4-1 的做法：按目录顺序取第一个不带 `always_card` 的。有判断时 `fits` 不起作用，判断仍然读 `describe` 和 `examples`。

**声明**

- Todo：`fits: ["line", "list"]`（`plugins/native/todo/src/actions.ts:101-103`）
- 灵光：`fits: ["prose"]`（`plugins/native/lingguang/src/actions.ts:41`）
- Pages、Inbox、Goals 不声明。

这样 BACKLOG 写的「清单项、带动词的短句 → 记成待办；较长的叙述 → 记下灵光」就成立了。「带动词」这一条用「一行短句」来近似，代价写在 11.11。

**文档**

- `skills/molis-plugin-dev/contextual.md` 第二节的字段表加 `fits` 一行。
- `docs/platform/PLUGIN-DEVELOPMENT.md:260` 加一句。
- 本文 §6.1 的「现状」一行改成按内容挑。
- `specs/BACKLOG.md` 删掉 BL-174 这一行。

### 11.7 验收

**W4-6a**

| 编号 | 验收内容 | 证明它的测试 |
| --- | --- | --- |
| W4-6-01 | 八个站的 `receive` 都是 `@2`，输入是平铺形状，`request_id` 必填（1–160 字），`input_type` 是 `.input.v2`；`list`、`read`、`create` 仍是 `@1`。SDK 拒绝按旧形状声明的 `receive`，也拒绝形状对了、动作版本低于 2 的（插件可以自己往上升版本），并说明理由 | `tests/workflow-content-actions.test.ts`、`tests/plugin-declaration-rules.test.ts` |
| W4-6-02 | 八个站各自：同一个请求号只建一个对象，重发返回同一个；换一个请求号会另建；请求号不是 `workflow:` 开头的也一样 | 新增 `tests/content-station-request-id.test.ts`（真实的八个站），以及 `tests/document-plugins-limits.test.ts`、`tests/lingguang-actions.test.ts`、`tests/pages-actions.test.ts`、`tests/content-owner-regressions.test.ts` 里改过的断言 |
| W4-6-03 | 工作流交接照旧：用 `workflow:<实例>:<步骤>` 作请求号；崩溃后重试、两次并发推进，都只交一次；Feed → Inbox → Pages → 灵光整条走通 | `tests/workflows-handoff-idempotency.test.ts`、`tests/workflows-plugin.test.ts` |
| W4-6-04 | 已固定 `receive@1` 的流程与实例：原引用保留，报「已保存的接收能力 v1 不可用」，不换成 v2，也不写任何内容；在编辑器里把这一站拿掉再加回来，就固定到 `receive@2`，能跑 | `tests/workflow-content-actions.test.ts`（「saved versions survive withdrawal and upgrades」那一组加一条） |
| W4-6-05 | 来源与归属只认可信的调用上下文。工作流交来的：Inbox 记 `added_by: "workflow"`，Feed 放在「工作流程」下。人经放置交来的：Inbox 记 `"web_user"`，Feed 放在「放进来的内容」下。输入里写什么都改不了这两项。Inbox 嵌套调用 Feed 时，受众不变 | `tests/inbox-action-scenes.test.ts`、`tests/workflows-plugin.test.ts`（:208）、`tests/work-placement.test.ts` |
| W4-6-06 | 放置的「转成」用 `placement:<请求号>`，同一个请求只建一个 | `tests/work-placement.test.ts` |
| W4-6-07 | MCP 里八个 `…content.receive__v1` 换成 `__v2`，其余工具名不变 | `tests/dataset-mcp.test.ts`、`tests/form-mcp.test.ts`、`tests/ppt-mcp.test.ts` |
| W4-6-08 | 动作快照只有八行 `receive` 变了（`@1` 换成 `@2`），其余行不变；公开 API 里 `workflowDeliveryKey` 没有了，多了 `WORKFLOW_CONTENT_VERSIONS` | `tests/action-contract-snapshot.test.ts`；`pnpm health:check` 的 API 快照 |

**W4-6b**

| 编号 | 验收内容 | 证明它的测试 |
| --- | --- | --- |
| W4-6-09 | 站点写了 `intake` 的，`receive` 带上派生的 `intake`（`intake_id` 是站 id，`item_kind` 是 `subject_kind`，`material_field` 是 `body`）；没写的不带。内核与宿主没有按站点分的分支 | `tests/workflow-content-actions.test.ts`、`tests/plugin-context-declarations.test.ts` |
| W4-6-10 | 「放进 Inbox」出预填卡片，不直接建。卡片里：标题取最近的标题或第一行，正文是原文，末行写出处。确认后，Feed「放进来的内容」下多一条，Inbox 多一条 `web_user` 事项；同一个请求号再确认，不多建 | `tests/contextual-create.test.ts`（真实 Host） |
| W4-6-11 | Inbox 页有「✦」，占位取 `examples[0]`；一句话经过起草出卡片；起草失败时用户写的话还在 | `tests/contextual-draft.test.ts` |
| W4-6-12 | Pages 与 Inbox 的标题、出处由同一份 `passageDraft` 算；W4-2-06 的断言不变；一个词、整个对象不给输入；准备要 `inbox:read` | `tests/pages-actions.test.ts`、`tests/inbox-action-scenes.test.ts` |
| W4-6-13 | 缺 `inbox:write`、`feed:write`，或 Inbox 停用：不出现这个去处，Inbox 页也没有「✦」 | `tests/contextual-create.test.ts` |
| W4-6-14 | 浏览器：在灵光里选一段 → 放进 Inbox → 确认卡片 → 去 Inbox 看到这一条；Inbox 页「✦」一句话 → 卡片 → 确认 | `tests/contextual-inbox.e2e.test.ts`（要写；浏览器暂停期间不跑） |

**BL-174**

| 编号 | 验收内容 | 证明它的测试 |
| --- | --- | --- |
| BL174-01 | `fits` 只接受这三个值组成的、非空、不重复的子集，其他写法 SDK 拒绝 | `tests/plugin-context-declarations.test.ts` |
| BL174-02 | 只有规则时：清单（`list`/`task` 角色，或几行短句）推声明了 `list` 的去处；一行短句推 `line`；长叙述推 `prose`。测试里用替身插件，内核里没有插件 id 或动词 | `tests/contextual-destinations.test.ts` |
| BL174-03 | 没有去处声明这一类时，按目录顺序（W4-1 的做法）；`always_card` 照样排除在外；有判断时 `fits` 不起作用 | 同上 |
| BL174-04 | 真实 Host，只有规则，Todo 与灵光都启用：选一条清单出「记成待办」，选一段长叙述出「记下灵光」 | `tests/contextual-create.test.ts` |

`tests/contextual-create.test.ts` 和 `tests/plugin-context-declarations.test.ts` 跑得快，走的又是用户动线，合入时按 AGENTS.md 的规则考虑加进 `tests/ci-product-subset.txt`。

### 11.8 各片改动的文件与冲突

**W4-6a**

- 合同与 SDK：`packages/contracts/src/platform/workflow-content.ts`、`packages/plugin-sdk/src/action-declarations.ts`
- 八个接收站：`plugins/native/dataset/src/actions.ts`；feed、form、inbox、jelly、lingguang、pages、ppt 各自的 `src/content-actions.ts`
- 宿主：`apps/local-host/src/inbox-actions.ts`
- 工作流：`plugins/native/workflows/src/content-client.ts`、`actions.ts`、`continuation.ts`
- 放置：`horizontal/placement/src/index.ts`
- 快照：`tooling/gates/actions/`、`tooling/gates/api/`
- 文档：`skills/molis-plugin-dev/placement.md`、`docs/system/CALL-CHAINS.md`
- 测试：
  - 改：`workflow-content-actions`、`plugin-declaration-rules`、`content-owner-regressions`、`document-plugins-limits`、`feed-inbox-pages-loop`、`inbox-action-scenes`、`inbox-automatic-scenes`、`lingguang-actions`、`lingguang-material`、`pages-actions`、`work-placement`、`workflows-plugin`、`workflows-handoff-idempotency`、`workflows-stop-and-token`、`dataset-mcp`、`form-mcp`、`ppt-mcp`（都在 `tests/` 下，`.test.ts`）
  - 新增：`tests/content-station-request-id.test.ts`

**BL-174**

- 合同与 SDK：`packages/contracts/src/platform/item-intake.ts`、`packages/contracts/src/services/contextual.ts`、`packages/plugin-sdk/src/context-declarations.ts`
- 内核：`packages/kernel/src/contextual/destinations.ts`、`packages/kernel/src/contextual.ts`
- 插件声明：`plugins/native/todo/src/actions.ts`、`plugins/native/lingguang/src/actions.ts`
- 快照：`tooling/gates/actions/`、`tooling/gates/api/`
- 文档：`skills/molis-plugin-dev/contextual.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、本文 §6.1、`specs/BACKLOG.md`
- 测试：`tests/contextual-destinations.test.ts`、`tests/plugin-context-declarations.test.ts`、`tests/contextual-create.test.ts`

**W4-6b**

- 合同：`packages/contracts/src/platform/workflow-content.ts`
- SDK：新增 `packages/plugin-sdk/src/passage-draft.ts`，改 `packages/plugin-sdk/src/index.ts`
- Inbox：`plugins/native/inbox/src/content-actions.ts`、`manifest.ts`，新增 `intake-offers.ts`；`plugins/native/inbox/package.json` 与 `pnpm-lock.yaml`
- Pages：`plugins/native/pages/src/intake-offers.ts`（W4-2 新加的文件）
- 包清单：`specs/repository-anti-corruption/spec.md` §5.1 包清单的行（用脚本重新生成）
- 快照：`tooling/gates/actions/`、`tooling/gates/api/`
- 文档：`skills/molis-plugin-dev/contextual.md`、本文 §7
- 测试：`tests/workflow-content-actions.test.ts`、`tests/plugin-context-declarations.test.ts`、`tests/contextual-create.test.ts`、`tests/contextual-draft.test.ts`、`tests/pages-actions.test.ts`、`tests/inbox-action-scenes.test.ts`；新增 `tests/contextual-inbox.e2e.test.ts`

**与 W4-2 相交的文件**（W4-2 只读，没有改）

- W4-6a 与 W4-2 都改 `tests/pages-actions.test.ts`（W4-6a 改 :38、:42 两处 `receive` 调用）和两份快照。不管谁先合，后合的一方都要重跑 `pnpm actions:update`、`pnpm api:update`。
- BL-174 与 W4-2 改的是同一批内核与合同代码：`packages/kernel/src/contextual.ts`、`packages/kernel/src/contextual/destinations.ts`、`packages/contracts/src/services/contextual.ts`、`tests/contextual-destinations.test.ts`、`tests/contextual-create.test.ts`。所以 BL-174 必须在 W4-2 合入之后，从 main 开分支。
- W4-6b 要改 W4-2 新加的 `plugins/native/pages/src/intake-offers.ts`，还会加到 `tests/contextual-create.test.ts` 和 `tests/pages-actions.test.ts` 里，所以也排在 W4-2 之后。
- W4-2 提出的 D-4（只有规则时，`always_card` 的去处放进「更多」）如果定了，会和 BL-174 改同一段 `planContextualLayout`。两边要按同一份排序规则来写。

**与在途 PR 相交的文件**（2026-10-19 用 `gh pr list --state open` 核对）

- **#776**（`fix/platform-original-caller`）改 `plugins/native/dataset/src/actions.ts`。Dataset 的 `receive` 处理器就在这个文件的 :141-146，这是唯一一处碰到接收站代码的。#776 改的 `form/src/actions.ts`、`ppt/src/plugin.ts` 与两站的 `content-actions.ts` 不重叠。W4-6a 不改 Dataset、Form 的 README，以避开 #776 改的那两份。谁后合谁 rebase，冲突只在 import 行和 :145 那一行。
- **#781**（alchemist）改 `tooling/gates/actions/actions.tsv`。这是生成的文件，合并后重跑 `pnpm actions:update` 即可。
- **#788** 改 `docs/system/CALL-CHAINS.md`（:44-50 一段，不是 :162）。W4-6a 改 :162，只是文字，后合的一方 rebase。
- **#785、#782** 改 `skills/molis-plugin-dev/` 下的其他文件（`SKILL.md`、`generated-ai.md`、`elements.md`），不和 `placement.md`、`contextual.md` 同文件。
- **#772** 改 `apps/local-host/src/contextual/contextual-create.ts` 和 `specs/context-program/spec.md`。三片都不改这两个文件（Inbox 走卡片，不进直接创建的路径）。
- **#777、#759** 改 `specs/BACKLOG.md`。BL-174 删掉自己那一行时可能有文字冲突，按行合并即可。
- **#631** 改 feed、todo 的 `styles.ts` 与 `packages/contracts/src/services/assistant.ts`，与本计划的文件不重叠。
- **#779**（PPT 收尾）删宿主里的 PPT 端口，不碰 `plugins/native/ppt/src/content-actions.ts`。
- **#768**（Form）已经合入（`dd1398d24`），不算冲突。

### 11.9 已定的两件事（用户 2026-10-19 答复）

W4-6a 合入之前原本要请统筹（①）回答两个问题；⑧ 在自己的会话里直接问了用户，答复如下，这里记为已定。

1. **真实 Home 里固定了 `receive@1` 的已存流程与运行中的实例，由用户自己在编辑器里修**（用户 2026-10-19 定）：把站点拿掉再加回来，新引用固定 `receive@2`，也就是 action-architecture §3 说的「显式修复」。
   - 产品里不写迁移代码，也不为开发用的 Home 写迁移脚本；W4-6a 的 PR 也不碰任何真实 Home 或真实数据。
   - 修之前，这些流程与实例照现行规则报「已保存的接收能力 v1 不可用」，不换成 v2，也不写任何记录（`W4-6-04`）。
   - 因为不加迁移机制，所以不用登记到 `specs/repository-anti-corruption` 的保留机制；只在其 §1 的决定表里记一行（见下一条）。
2. **八个 MCP 工具改名，不留别名**（用户 2026-10-19 同意，⑧ 问的）：`molis_work_v1_action_<站>.content.receive__v1` 变成 `__v2`，各插件自己的 MCP 服务里的 `<站>.content.receive__v1` 也一样，八个站是 `dataset`、`feed`、`form`、`inbox`、`jelly`、`lingguang`、`pages`、`ppt`。按 CONTRACT-CHANGES §3.5，已在 `specs/repository-anti-corruption/spec.md` §1 记了一行（2026-10-19），W4-6a 的 PR 里列出新旧名字。

### 11.10 待补浏览器验证（用户 10-19 暂停）

- 浮条：在灵光、Pages、右栏 Shelf 各选一段，有判断时出现「放进 Inbox」→ 卡片 → 确认 → Inbox 列表里有这一条，显示「手动加入」；Feed 里这一条在「放进来的内容」下。键盘走一遍：⌘. 进浮条、←→、Enter、Esc 回原处。
- Inbox 页的「✦」：出现，占位文字对，回车出卡片，确认之后列表刷新。
- 确认之后要等 Inbox 做完下一步判断，量一下这段时间；超过 3 秒的话，在卡片的忙碌状态里写「正在放进 Inbox」。
- 只有规则（BL-174）：选一条清单出「记成待办」，选一段长叙述出「记下灵光」，选一个标题按目录顺序。
- 工作流编辑器：升级后固定了 v1 的站点显示不可用和原因，拿掉再加回来就能开始；运行中的实例怎样显示「v1 不可用」。
- 放置「转成」到 Inbox：条目不再标成「Inbox · 工作流程」。
- 隔离 Home 实际走一遍，截 1440、1024、800、390 宽度和深色模式的图，写进 `.impeccable/qa/review/`，不入库。

### 11.11 决定与否掉的做法

| 决定 | 否掉的做法与理由 |
| --- | --- |
| `receive` v2 的输入平铺，`request_id` 放在顶层 | 否：嵌套成 `context: { request_id }`，只为一个字段套一层，而且起草服务只填顶层字段、`material_field` 也必须是顶层字段。否：`request: { id, origin }`，来源属于出处，必须从可信的调用上下文来，不能从输入读。否：保留 `instance_id`、`step`，让别的入口填假值，一个字段两种意思，快照上也看不出来 |
| 只把 `receive` 升到 2，`protocol` 仍是 1，版本表 `WORKFLOW_CONTENT_VERSIONS` 放在合同包里 | 否：`protocol` 升到 2，所有站点的 list、read、create 快照行都会跟着变；而工作流只认 `protocol === 1`（`content-client.ts:19`），用旧 SDK 的站会悄悄从目录里消失，不给原因。否：v1、v2 并存，那是兼容期，阶段一不允许 |
| `workflowDeliveryKey` 移到工作流插件里，格式不变 | 否：留在合同包里，「实例 + 步骤」是工作流自己的说法，别的入口不该看到它；格式不变，另外六个站的已有交付键才保持原样 |
| 来源与归属按 `caller.audience` 定（Inbox 的 `added_by`、Feed 的来源） | 否：看请求号的前缀，输入不可信。否：一律记成工作流，放置和浮条放进来的东西会被标成「工作流程」 |
| 存量的固定引用：产品代码里不迁移，开发用的 Home 用脚本，真实 Home 由 ① 定 | 否：工作流解析时自动把 v1 升成 v2，就是悄悄换版本，违反 action-architecture §3 的「不换成新版本」。否：给 v1 留别名，阶段一不留兼容 |
| 派生创建入口要作者在站点声明里写 `intake` 才有，派生在定义器里做 | 否：八个站全部自动派生。Dataset、Form、PPT 要的是 CSV、题目、提纲，选中的一段文字不是它们要的内容；Pages、灵光还会多出一个重复的去处。否：由内核从 `workflow_content` 现造候选，内核里会多一条只为内容站的路径 |
| Inbox 走预填卡片，不声明撤销 | 否：只撤一部分（把事项忽略掉），Feed 里那一条还在，等于假装撤销过；而且 `undo.input` 只能写指向输出的路径，写不了常量 |
| 动词是「放进 Inbox」 | 否：「放进收件箱」，与 GLOSSARY:281 的显示名不一致 |
| 段落工具放进 SDK，Pages 和 Inbox 共用 | 否：在 Inbox 里抄一份，就成了第二套（AGENTS.md「不另写第二套」）。否：不做 `prepare`，只有规则时卡片没有标题，要用户自己填，违背「选中之后不用再输入」。否：平台给每个站生成 `<站>.content.offers`，范围更大，而且是宿主替插件造动作 |
| BL-174 只按选区的形状分 `line`、`list`、`prose`，没有声明这一类的去处时按目录顺序 | 否：用动词词表或正则判断「带动词的短句」，只对一种语言、一部分说法有效，而且没有判断时规则只是兜底，不值得做语言规则。否：在内核里写死「清单 → 待办」，就是点名插件，K5 门禁会拦。否：谁都不匹配时不推，去处不进「更多」，没有模型时就哪里都放不进去了。代价：一行没有动词的短句（例如「预算表」）也会推「记成待办」；推错了有「改放到 ▾」 |
| 一行不超过 60 个字算短句 | 这是先定的数字，评估集有了「最合适的去处」这类标注之后再调（§6.1「评估」） |
