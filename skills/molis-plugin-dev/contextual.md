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

## 六、浮条上的工具

浮条贴在用户手上的东西旁边：右边是系统排出的下一步（上面几节的声明），左边可以放**你的工具**——只作用于当前打开内容的命令（加粗、标题、列表、链接、评论）。工具不是动作：不进目录、Agent 调不到、撤销是你自己的。它们是纯数据，浮条只负责画和把点击交回给你。样例：Pages `plugins/native/pages/src/client.ts`（14 个工具分 4 组）。

**1. 报告焦点时带上浮条画在哪。** 自己有编辑器的页面派发 `molis:surface-focus` 时，在 `SurfaceFocus` 里加 `screen: { rect }`：本文档视口坐标的矩形（选区或光标的外框），`placement` 可写 `below`（默认在上方，放不下自动翻到下方）。它是纯数据，不要交元素；滚动或排版变了，用**同一个 `context_id`** 再报一次，浮条跟着移动，不重新排序。`screen` 只在本文档里有意义，不会发给宿主，也不会跨窗格。

**2. 发布工具。** 焦点报出去之后，在同一个根元素上派发 `molis:context-tools`，`detail` 是 `ContextTools`（契约 `@molis-ai/molis-work-contracts/services/contextual`）：

```js
root.dispatchEvent(new CustomEvent("molis:context-tools", { bubbles: true, detail: { context_id, groups: [
  { id: "inline", items: [{ id: "bold", label: L("加粗"), glyph: "B", pressed: true, shortcut: "⌘B" }, { id: "link", label: L("链接"), icon: "link", opens: "panel" }] },
  { id: "blocks", collapse: "overflow", items: [{ id: "h2", label: L("二级标题"), glyph: "H2" }] },
] } }));
```

- `context_id` 必须是你刚报出的焦点的那个：别的上下文的工具，浮条直接丢掉。
- 上限见 `CONTEXT_TOOL_LIMITS`（6 组、24 项、标签 24 字），超出的被丢掉；`label` 是已经翻译好的可读名字，也是悬停提示。外观用设计系统的图标名（`icon`）或几个字母（`glyph`：`B`、`I`、`U`、`S`、`H1`–`H3`、`A`）。
- `pressed` 表示当前状态（光标处已加粗），`disabled` 表示现在不能用；`collapse: "overflow"` 的组在浮条窄时可以收进一个菜单。
- 状态变了（加粗切换、光标移进标题）就再发一次；内容没变时不要重复发（Pages 用 `context_id` 加分组内容做键）。

**3. 接收点击。** 用户点了一个工具，浮条在发布工具的那个元素上派发 `molis:context-tool-invoke`，`detail` 是 `ContextToolInvoke`（`{ context_id, group, id }`）。核对 `context_id` 仍是你当前的焦点，执行命令，再发布一次工具（状态可能变了）。

**4. 需要一小块表单时（链接地址、评论），请浮条托管。** 派发可取消的 `molis:context-panel-open`，`detail` 为 `{ context_id, node, label, onClose?, keep? }`：

- 浮条接住就 `preventDefault()`，把你的 `node` 放在浮条下面，一次只放一块；Esc、点别处或换了上下文时收起，并调用 `onClose`。
- **没人接**（`defaultPrevented` 为 false，比如这一处没有浮条）：你自己把表单放在原处，别丢掉用户的操作。
- `node: null` 让浮条收起面板；表单里在等模型的结果（候选文字）带 `keep: true`，上下文变了也留在原处，等用户处理。

**不要做的**：不要自己再画一条格式条或悬浮工具栏（Pages 的格式条已经并进浮条）；不要把工具做成动作（一个动作要能被目录发现和授权，工具不要）；不要在 `label` 里放用户内容。

## 七、还没有的

**插件开发包的页面端辅助函数**：报告手上的东西与落点、发布工具、接收放进来的选择。现在按上面的事件直接写，辅助函数加进插件开发包时同一任务更新本章。**落点**（`SurfaceLanding`）还没有插件报告，`attach` 的去处因此暂不出现。

## 验证

- 声明：`tests/plugin-context-declarations.test.ts`（每条规则的报错原文与先后顺序）、`tests/plugin-declaration-rules.test.ts`。
- 浮条与工具：`tests/context-toolbar.test.ts`（工具的清洗与上限）、`tests/context-toolbar.e2e.test.ts`（1440 与 390 宽）。
- 候选与判断：`tests/contextual-destinations.test.ts`（去处从声明派生、`places`、只进推荐位、个人空间不进判断）、`tests/contextual-landing.test.ts`、`tests/contextual-interaction.test.ts`。
