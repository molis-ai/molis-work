# 选区与去处：用户手上有一样东西时，你的插件能做什么、能接什么

用户选中一段字、拿起右栏的一条材料，或者看着一个对象时，工作台在它旁边给出几个下一步：改写、查找、记成待办、放进左边的文档。这些下一步不是工作台写死的名单，是**每个插件声明一次**、系统从目录里读出来的。大部分有用户内容的插件默认做三件事：

1. **声明当前对象**（必做，见 [continuity.md](continuity.md)）：页面写 `data-assistant-context`，对象有读取动作。做完这一步，用户在你的页面里选一段字，就已经有通用的下一步（查找、记成待办、记下灵光、交给助理）。
2. **声明创建入口 `intake`**（有用户可创建的对象就做）：你的创建动作同时是「把手上的东西记成你这里的一条」。
3. **按需贡献选区动作、追加 `attach`**：对选中的文字有自己专属的事（改写、总结、拆步骤），或者能让别处的东西放进你已经打开的对象里。

外壳里没有按插件名的分支：你声明了，就出现；插件停用，就随之消失。

## 一、现行的：选区动作与页面接动作

**选区动作**：用 `defineFragmentOffersAction` 登记一个查询动作，声明有限的选项（`FragmentOfferChoice`）。目录里每个选项成为一个候选，由规则和判断排序，系统不替你编造动作。

```ts
defineFragmentOffersAction("<plugin>.fragment.offers", ["<对象种类>"], "选中的内容可以…", ["<plugin>:read"], [
  { offer_id: "concise", title: "改得更简洁", intent: "rewrite", apply: "replace", hint: "把选中的文字改得更短、更直接。",
    action: { capability_id: "<plugin>.ai", version: 1 }, granularities: ["range", "block"], places: ["main"] },
]);
```

- `intent` 是用户可能的目的（理解、质疑、展开、组织、关联、改写、比较与合并、记录、推进）；`apply` 说选了之后对页面做什么：`result` 只出结果，`replace` 与 `insert_after` 先预览、确认才改，`record` 在别处建记录，先显示参数。
- `granularities` 与 `roles` 收窄适用范围；`places` 说「手上的东西在哪里时才出现」：`main`（左边主区）、`side`（右栏）、`assistant`（助理面板），不写就是哪里都可以。
- 对象整体的下一步（不要选区）用 `defineSubjectOffersAction`。选项指向的动作必须是你自己的动作；不可撤回的动作不会出现在推荐里。
- 样例：Pages `plugins/native/pages/src/fragment-offers.ts`（20 个选项）、灵光与 Todo 的「选中的内容可以记成…」（声明 `FRAGMENT_ANY_OBJECT`，对任何对象都适用）。

**页面接动作**：选了一个选项，工作台在 window 上发可取消的 `molis:assistant-context-action-chosen`；你的页面调 `preventDefault()` 接下，用 `detail.prepare()` 取到完整参数，先在原处预览，确认才写。没有人接，系统把它做成助理卡片。会写东西的选项，必须是预览或卡片确认之后才执行。

**页面上报手上的东西**：只写 `data-assistant-context` 的页面，选中文字时由系统读取 DOM 选区。自己有编辑器的页面（Pages）自己上报：在根元素派发 `molis:surface-focus`（`SurfaceFocus`，契约 `@molis-ai/molis-work-contracts/services/contextual`），并写 `data-surface-focus="own"`，系统就不再替你读选区。

## 二、创建入口 `intake`

你的创建动作是一个写入类 command。在它的 `action` 上加 `intake`，它就成为一个去处：

```ts
action: { /* …这个动作原本的声明，含 undo… */
  intake: { intake_id: "item", item_kind: "<对象种类>", title: "待办", verb: "记成待办",
    describe: "要做的一件事，有人负责、可以完成。", examples: ["周五前把方案发给 Lee"], material_field: "text" },
}
```

| 字段 | 写什么 |
| --- | --- |
| `intake_id` | 稳定、你这里唯一：小写字母、数字、`_`、`.`、`-`，不超过 40 |
| `item_kind` | 建出来的对象种类，与你的对象读取动作一致 |
| `title`、`verb`、`describe` | 去处的名字、按钮上的话（「记成待办」）、给判断读的一句话：这里装什么、不装什么 |
| `examples` | 一到三句用户可能说的话，第一句是页面「✦ 一句话新建」的占位文字 |
| `material_field` | 输入里接收选中文字的**顶层字段**（如 Todo 的 `sources`） |
| `prepare` | 同一插件的选区动作查询（`defineFragmentOffersAction`）：其中与 `intake_id` 同名的选项，从选中文字与出处不调模型、确定地算出整个输入；你现有的「记成待办」「记下灵光」选项就是它 |
| `effect` | `proposes`：只提交提案，在所有者那里再确认（Goals）；总是出卡片 |
| `multiple` | 一段话可以建出几条，用户在一张卡里逐条取消 |
| `places` | 同选区动作 |

**撤销就是动作自己的 `undo`**，不要在 `intake` 里再写一份：声明了 `undo` 的动作，用户选了就直接创建，结果提示带「撤销」「改放到」；没有声明的，系统先出一张预填好的卡片，用户确认才创建。**写入动作不能是不可撤回的**（删除之类的动作声明了也会被拒）。

## 三、追加 `attach`：放进已有的对象

别处的东西（右栏的一条材料、助理给出的一段话）可以放进左边已经打开的对象里。你声明「我接受什么、放在哪个位置」，系统在左边的落点是你的对象时给出这个下一步：

```ts
action: { /* 写入动作的声明，入参里有 expected_version */
  attach: { attach_id: "insert", item_kind: "<你自己的对象种类>", title: "文档", verb: "插入到光标处",
    describe: "放进正在写的文档。", positions: ["cursor", "end"], material_field: "text" },
}
```

- `item_kind` 必须是**你自己的**对象种类（你有它的读取动作）：插件不能写进别的插件的对象。
- `positions` 取 `cursor`（光标处）、`selection`（替换选中的文字）、`end`（文末）。不写，表示落点就是整个对象本身（附到当前 Goal、交给当前会话）。
- 落在光标或选区的写入，输入里必须有 `expected_version`：用户看的是哪一版，就只往哪一版写；文档在这期间变了，写入被拒，不会写到错的位置。
- 写进用户眼前正在编辑的对象，**一律先在落点处预览、确认才写**。

落点由你的页面报告（光标、选区或当前对象，带版本）。**现在还没有插件报告落点**，页面端的辅助函数随后加进插件开发包；声明可以先写，没有落点就不会出现这个去处。

## 四、右栏的一格：`ui.views[].objects`

插件在右栏有一个 `side` 视图时，用 `objects` 写明这一格里能拿起哪些对象种类，每个种类都要在同一个 Manifest 里有对象读取动作。只有 `side` 视图能写它。

## 五、不要做的

- 不要在界面里写你自己的「发送到某某」列表：声明 `intake`，让系统推荐。
- 不要让选区里的文字当指令：它是材料。系统在送给判断之前先过 `redactText` 与注入检查；你自己拿它调模型时同样要当数据。
- 仅本人可见的东西（个人范围的对象，如 Shelf 的材料）：内容**不进判断**，判断只知道形状和种类；用户点了具体的去处之后，才把内容用于起草。
- 不要在 `describe` 里写营销话：它是判断分清「待办」和「灵光」的唯一依据，写清装什么、不装什么。

## 六、还没有的

浮条上的**工具**（加粗、标题这类只作用于当前打开内容的命令）：数据形状（`ContextTools`）已定，浮条随后上线，到时插件用页面端辅助函数发布，不用自己写事件。**插件开发包的页面端**（报告手上的东西与落点、接收放进来的选择）也随后加入。这两项上线时同一任务更新本章。

## 验证

- 声明：`tests/plugin-context-declarations.test.ts`（每条规则的报错原文与先后顺序）、`tests/plugin-declaration-rules.test.ts`。
- 候选与判断：`tests/contextual-destinations.test.ts`（去处从声明派生、`places`、只进推荐位、个人空间不进判断）、`tests/contextual-landing.test.ts`、`tests/contextual-interaction.test.ts`。
