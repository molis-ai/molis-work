# 插件页面里的平台区域：挂法与防遮盖（第 18 批 P3 设计稿）

状态：设计稿（2026-11-05，第 18 批合同台起草）；第 8 节 D1～D3 用户 2026-11-06 已定（都按推荐），正文已按选定写死；评审台首轮意见（[#1860 评论](https://github.com/molis-ai/molis-work/pull/1860#issuecomment-6677227067)，挡合并 3 条、小修 11 条）已按统筹裁定改完；复审（[#1860 评论](https://github.com/molis-ai/molis-work/pull/1860#issuecomment-6677556604)）剩的 2 挡 2 小也已改（R1 不再校验原有类、R3 两种边界、不给撤销的几种经用户 2026-11-06 定）。上游是[按任务授权读取的实施方案](schedule-task-reads.md) §3.7（用户定样 F）与 §9 G4（点击劫持）；定样见[原型说明](../../docs/design/schedule-task-grants/README.md)。

- **要解决的**：Schedule 的任务详情里要有一块「能读的数据」，一类一个开关，拨一下就是本人的一次 `agent.task_grants.set`。这一块必须由平台画、平台写：插件页面的代码读不到、改不了、也不能骗本人去点。
- **结论（推荐）**：插件只经 SDK 说「在这个空元素的位置，为我这个任务放一块」；工作台把区域画在**插件框外**，作为插件框的兄弟节点叠在它上面，跟着插件报的位置走。这和现有的审查卡（`host.reviews.show`，`UiPageReviews`，`apps/workbench/src/browser/plugin-frame/reviews.ts`）、嵌入（`view.embed`，`embed.ts`）是同一种做法，新增的是防遮盖的几条检查（第 3 节）和一条安全不变量（第 4 节）。
- **不碰的**：P2 的宿主任务主体与三个平台动作的实现（E）、Schedule 的页面（E，叠在 P3 后面接入）、`packages/contracts/src/platform/dom-events.ts`（推荐方案不需要新的 DOM 事件）。

验收编号：本稿新增 `TGA-01`～`TGA-19`（第 4 节）与 `TGA-20`（5.1，不属于安全不变量），测试名里写编号；需求侧仍是 PWA-148、PWA-151、PWA-154。

## 1. 现状：插件页面怎样跑、平台已有的「框外区域」

- **插件页面在一个不透明来源的沙箱框里**：`mountFrame`（`apps/workbench/src/browser/plugin-frame/parent.ts`）建 `iframe`，`sandbox="allow-scripts allow-forms"`、`srcdoc`，框和外层只经一条 `MessageChannel` 说话（`types.ts` 的 `FrameUp`／`FrameDown`）。插件的客户端代码与框里的平台代码（`child.ts`）跑在同一个文档里，所以**框里报上来的任何东西都当作插件说的**，平台代码在框里也不可信。
- **外层文档**是工作台本身，或者侧栏的同源文档（#1853 把右侧并入同一套窗格后，插件的侧栏标签仍是一份同源文档，自己调 `mountFrame`）。区域画在调 `mountFrame` 的那份文档里，两种位置同一套代码。
- **已有三处「插件只报位置，平台在框外画」**：
  - 审查卡（插件拿到的是 `host.reviews`，`child.ts` 第 80 行交给插件，不在 `view` 下面）：框里 `childReviews` 每帧报空槽的 `getBoundingClientRect`（`review-layout`），外层 `pageReviews` 在 `root` 里建一个 `position:absolute; z-index:1` 的兄弟节点叠在框上，内容宽固定 320 px，按框的位置换算坐标、裁到框内；外层量出内容高度回给框（`review-size`），框把空槽撑到这个高度。审查的文字、按钮、回执都不过这条通道。
  - 嵌入：同样的叠法，叠的是另一个插件的框。
  - 连接槽（`connection-slot.ts`）：外层画选择账号的弹层，安装与服务由宿主从页面授权取（`/api/host/plugin-page-slot`，只认外层加的 `x-molis-context-page` 头，框里的取数桥会去掉它，`apps/local-host/src/plugin-page-authority.ts` 的 `slotChoice`）。
- **缺的**：这三处都没有防「位置在点按前一刻挪过来」「区域只露出一半」「被别的平台叠层盖住标头」「键盘从框里 Tab 出来直接按」的检查，高度也随内容变——审查卡的决定可以再经确认对话框，开关即生效没有这一步，所以要补。

## 2. 插件怎样请平台放一块区域（问题 1）

所有插件同一个入口：插件只给**一个空元素**（位置）和**自己任务的 key**（`TASK_GRANT_SUBJECT_KEY_PATTERN` 的形状）；安装与项目由宿主从页面授权取，不经插件。Schedule 只是第一个用的。

| 方案 | 做法 | 好处 | 代价 |
| --- | --- | --- | --- |
| **A SDK 函数 + 框通道，框外叠放（推荐）** | `host.taskGrants.place(element, key, { signal, onChange })`。框里的平台代码每帧报元素的位置（`task-grants-layout`），外层画区域、回报高度（`task-grants-size`）、拨动后只回一个摘要（`task-grants-changed`）。宿主新开一条只认外层的路由读写 | 和审查卡、嵌入同一种做法，代码与测试有现成的样子；插件拿到的只有高度和一个「有没有授权」的摘要；不需要 DOM 事件，不碰 `dom-events.ts` 和 #1853 | 合同多一个 SDK 函数（`ui.ts` 快照，按轨道规则 1 排队）；每帧报位置的循环（已有两处同样的循环，只在区域存在且页面可见时跑） |
| B 声明的挂点（属性），框外叠放 | 插件在自己的 DOM 里写 `<div data-platform-area="task-grants" data-subject-key="…">`，框里的平台代码像落点（`placement.ts` 的 `[data-placement-slot]`）那样扫出来上报；也可以再在 Manifest 里声明「本插件用平台区域」 | 声明式，服务端渲染的文档也能用（可仿连接槽的 `renderedRecord` 核对服务端文档里确有这个 key） | 扫 DOM 的成本按页面大小算；属性名、key 都还是插件给的，不比 A 多一分可信；Manifest 那一项要改最热的快照；Schedule 是客户端页面，用不到声明式的好处 |
| C 平台组件画在插件文档里面 | SDK 的 UI 子路径出一个 `renderTaskGrants(element, key)`，由框里的平台代码画开关，点按经框通道转给外层写 | 区域就在插件的排版流里，滚动、窄屏天然对齐 | **不安全，排除**：插件和这段代码在同一个文档，能读开关、改样式、把它设成透明再在下面摆诱饵（§9 G4），`isTrusted` 挡不住真点按；框里的「点按」消息插件也能伪造 |

经 DOM `CustomEvent` 请工作台放区域的写法不成立：插件框是不透明来源，框里的事件到不了外层文档，最后还是要走框通道，等于 A 再多登记一个事件。

**推荐 A。** B 的声明式好处要等有服务端渲染的插件要用时再加，到时作为 A 的另一个入口（同一套外层代码）。

### 2.1 A 的接口（给合同写手的草稿，名字由 C1/D 评审时定）

```ts
// packages/contracts/src/platform/ui.ts
/**
 * What the page learns after the person changes a task's reads, for its own list: two flags it could also read from
 * `agent.task_grants.list` for its own subjects. Nothing here or in the area's height tells the page which categories this
 * project offers (a plugin's `list` gets `categories: []`).
 */
export interface UiTaskGrantsAreaState {
  /** At least one category is granted now (the task reads data). */
  readonly granted: boolean;
  /** A category needs the person: `needs_confirmation` or `removed`. */
  readonly attention: boolean;
}
/**
 * A platform area on one of this installation's own background tasks (specs/proactive-assistant/task-grants-platform-area.md).
 * The page supplies an empty element and the task's key; the shell draws the area over that place, outside the page, and
 * keeps its switches, words and writes. The element is given the area's height, which depends only on the element's width.
 * Resolves once shown; rejects when unavailable.
 */
export interface UiPageTaskGrants<Element = unknown> {
  place(element: Element, key: string, options?: { signal?: AbortSignal; onChange?: (state: UiTaskGrantsAreaState) => void }): Promise<void>;
}
// UiPluginClientHost<Element, …> 加一项
readonly taskGrants: UiPageTaskGrants<Element>;
```

- 一个页面同时最多 4 块（外层拒绝更多，同审查卡的 8、嵌入的 4）；同一个元素再调一次是换 key，旧的那块关掉。
- `signal` 中止、元素离开文档、页面关闭都关掉这一块。
- 页面不可见时（比如在后台打开的标签）放的区域不拒绝：外层等页面可见了再读、再画，`place` 到那时才结束，插件不用重试；等的时候 `signal` 中止或元素离开文档就不再等（P3-1 评审小修 3，2026-11-07）。
- `onChange` 只在本人拨动、撤销、允许、移除成功之后来一次，带的是新的摘要；插件要更多就自己调 `agent.task_grants.list`（插件受众，只看到自己安装的）。

### 2.2 框通道的消息（工作台内部，`types.ts`，不是公开合同）

| 方向 | 类型 | 内容 | 外层怎样核对 |
| --- | --- | --- | --- |
| 上 | `task-grants-open` | `id`、`key` | `id` 是正的安全整数；`key` 合 `TASK_GRANT_SUBJECT_KEY_PATTERN`；本页不超过 4 块；页面不可见时等到可见再开（2.1） |
| 上 | `task-grants-layout` | `id`、`box`（`x/y/width/height` 或 `null`） | 四个数都是有限数；`null`、宽为 0、页面不可见时区域藏起并且不响应 |
| 上 | `task-grants-close` | `id` | — |
| 下 | `task-grants-size` | `id`、`height` | 只给高度，框把空元素撑高；高度只取按宽度定的两档（3.1），与类别多少无关 |
| 下 | `task-grants-shown` | `id`、`error?` | 让 `place` 的 Promise 结束；错误只有一句固定的「暂时不能显示」，不分原因（原因留在区域里给人看） |
| 下 | `task-grants-changed` | `id`、`state`（2.1 的两个布尔） | 只在成功写入之后发 |
| 下 | `task-grants-reveal` | `id` | D1 选 A 带来的一条：区域没有整块露出时被点（3.3 末），请框把空元素滚进视野 |

没有任何「上」的消息能改开关、选类别或带类别名单：写入只由外层自己的点按处理器发起。这些是外壳与框之间的 `postMessage` 类型，按 `dom-events.ts` 开头的说明不进 DOM 事件登记。

### 2.3 宿主路由（P3 随外层代码一起落）

`POST /api/host/plugin-page-task-grants`，照连接槽的规矩：

- 只认外层加的 `x-molis-context-page` 头（带框里取数桥的 `x-molis-plugin-page` 头一律拒），在 `plugin-page-authority.ts` 里与 `slotChoice` 并列一项；页面要有 `project_id` 与 `activation.install_id`。
- 输入只收 `{ key, mode: "read" }` 或 `{ key, mode: "set", categories, expected_revision }`，多一个键就 `actions.input_invalid`。**不收 `plugin_install_id`**：宿主从页面授权取，所以一页只能动自己安装下的主体。
- `read`：以本人身份（`localWebActionContext`，`user` 受众）调一次 `agent.task_grants.list`（带页面的安装），回 `categories` 与这个 key 的主体（没有记录就是 `revision: ""`、空类别）。
- `set`：以本人身份调一次 `agent.task_grants.set`，回它的输出（新的主体）；`actions.conflict` 原样回给外层。
- 写之前照 `plugin-page-check` 核一次页面仍是当前的（`beforeEffect`）。页面已撤销、插件停用时拒绝，不写。

## 3. 区域由谁画、画在哪（问题 2）

**由工作台画在插件框外**：外层在 `root` 里建一个兄弟节点叠在插件框上，跟随框里报的位置。插件的样式、脚本、DOM 都到不了这一层。

### 3.1 位置同步

- **报位置**：框里每帧量空元素（`requestAnimationFrame`，只在有区域且页面可见时跑，同 `childReviews`）；文档隐藏、框里有打开的 `dialog`、元素 `checkVisibility()` 为假、宽为 0 时报 `null`。
- **换算**：外层用 `frame.getBoundingClientRect()` 与 `root.getBoundingClientRect()` 把框内坐标换成 `root` 内的坐标，外面一层 `overflow:hidden` 的容器裁到框的可见范围（同 `pageReviews`）。
- **滚动**：插件滚动时位置每帧跟上，最多落后一帧；区域在视口里的矩形一变就重新计「稳定」的时间（3.3 第 4 条）。
- **缩放**：浏览器缩放与桌面壳缩放对框里框外同比例生效，坐标都是 CSS 像素，不用另算。
- **宽**：取插件报的宽，但**不小于 280 px、不大于框宽**。
- **高与内容脱钩**（评审挡合并 3，统筹裁定）：高度**只按宽度取两档**——宽不足 480 px 一档、480 px 及以上一档，具体像素由 D 在组件板标本里定，定下后写成常量；不随类别多少、说明折行、状态行（`needs_confirmation`、`unavailable`、`removed`）、变化行的文字变化。区域分三段：上面的平台标头与说明固定、中间的类别列表在区域**内部滚动**、下面的变化行固定（D2）。两档的高度要让常见的项目（不超过 5 类）不用滚动；类别少时列表下面留空，没有可读来源时空状态画在同一高度里。插件只知道自己报的宽，所以从高度推不出本项目提供几类、装了哪些提供方。外层仍用 `ResizeObserver` 量内容，只用来决定列表要不要出滚动条，不回给框。插件不给高或给小了，区域照样按档画出，盖住的是插件自己的内容。
- **窄屏 390**：区域宽约 358 px（框宽减边距），落在窄的一档；一类一行，说明折行，多出来的在列表里滚动。变化行在窄的一档固定两行高（「撤销」按组件板 `mw-toast` 的规则折到字下面），宽的一档一行高；放不下的字截断，全文放在 `title` 与读屏文字里。框宽不足 280 px 时（极窄的侧栏）区域藏起，不响应，空元素高度回 0。
- **层级**：区域的容器 `z-index` 高于审查卡与嵌入（它们是 1，区域用 2），插件无法用自己请来的嵌入或审查卡盖住它。
- **几块之间**：一页最多 4 块。任意两块在视口里的矩形相交，相交的**两块都藏起、不响应**，直到分开（防止拿 A 的标头配 B 的开关）。

### 3.2 插件框不可见、被遮

| 情况 | 区域怎样 |
| --- | --- |
| 框不可见（标签在后台、窗格收起、`frame.hidden`、任一祖先不可见：`parent.ts` 的 `visible()`） | 藏起、不响应；回到可见时重读一次（3.6），不轮询 |
| 框里开了对话框（`dialog[open]`）或插件报 `null` | 藏起、不响应 |
| 区域有一部分出了框的可见范围（滚到边上、被裁） | 照样画出可见的部分，但**整块不响应**（3.3 条件 ②）；点到时变化行写「请先让这一块完整显示」，并请框把空元素滚进视野（D1） |
| 工作台自己的浮层（菜单、对话框、底栏弹层、浮条）盖在上面 | 盖住的地方点不到区域；没盖住的开关也要过命中检查（3.3 条件 ③）才响应 |
| 写入还没回来时框被藏起 | 这次写入照常完成（本人已经拨了），回到可见时显示结果；不因为藏起而取消 |

### 3.3 只认真实点按，什么时候才响应

外层的处理器挂在区域自己的开关、「撤销」「允许」「移除」上，**同时满足下面六条**才发请求，否则这一下什么都不写：

1. **真点按**：`event.isTrusted` 为真（脚本合成的 `click`、`.click()` 都不算）。这是这一条唯一的防线；`navigator.userActivation` 不算防护——在插件框里点一下，激活就会传到外层文档（`clipboard.ts`、`file-picker.ts` 正靠这一点工作），所以不检查它。
2. **整块可见**：区域的视口矩形整个落在「框的可见范围 ∩ 视口 ∩ 外层各个裁剪祖先（`overflow` 不为 `visible` 的祖先）」里，框可见（`parent.ts` 的 `visible()`），并且不与本页另一块区域相交（3.1）；被点的控件整个落在类别列表的可见范围里（列表内部滚动时，半露的那一行不响应）。
3. **命中检查**：`document.elementsFromPoint` 在被点的控件中心、区域标头、变化行三处取到的最上层元素都在区域里面（盖住标头、只露开关的叠法过不了）。
4. **稳定期**：以**外层量到的区域视口矩形**为准，不管是什么让它动了（插件报的位置、窗格缩放、外层重排、区域刚显示出来），矩形最近一次变化之后已经过了 **500 毫秒**；时间取这次指针按下的 `pointerdown` 事件的 `event.timeStamp`，不取 `click` 处理器运行的时刻。**键盘产生的激活**（空格、回车，没有对应的 `pointerdown`）另要求焦点落在这个控件上已经不少于 500 毫秒（按控件 `focus` 事件的 `timeStamp` 计，失焦即清零）：插件写「按 Tab 再按空格继续」，焦点刚从框里 Tab 到开关上就按，过不了（评审挡合并 2）。
5. **一次一个**：这块区域没有在途的写入；在途时再点（连点）不发第二个请求。
6. **仍是当前**：页面仍是当前的（`scope.assertCurrent()`），区域的 key 没换过。

**未就绪态**（评审小修 11，D1 的变体，统筹裁定采纳）：稳定期内（第 4 条还没满足），区域里的开关与按钮淡显、读屏标「未就绪」，满了再恢复，让人看得见为什么现在拨不动。焦点停留不足 500 毫秒时同样淡显这一个控件。

**不响应时怎样交代**（用户 2026-11-06 定，D1）：第 2～4 条没过的那一下不写，变化行写出原因并请再拨一次——第 4 条写「刚移动过，请再拨一次」，第 2、3 条写「请先让这一块完整显示」；第 2 条没过时外层另发一条 `task-grants-reveal` 下行消息，框里的平台代码把空元素 `scrollIntoView({ block: "nearest" })`（插件可以不配合，那只是看不全，不影响安全）。第 1、5、6 条没过的不交代（脚本合成的点按、连点、页面已换），什么都不显示。

插件改不了区域的透明度、位置、层级：区域不在插件的文档里；插件能影响的只有「报哪个位置」，而位置变化会触发第 4 条，宽有下限、高只按宽度取档、容器层级固定。

### 3.4 变化行和「撤销」一直看得见

- 变化行是区域的一部分（同一个容器、同一次命中检查），不另外浮起。
- 变化行**平时就占住一行**（用户 2026-11-06 定，D2：平时写一句「拨一下即生效，下一次运行起按新的范围读」），拨动后换成「已撤回待办，下一次运行起读不到 · 撤销」，区域高度不变（3.1：高度只按宽度取档），所以不会因为多出一行而被挤出框外。
- 因为只有整块可见时开关才响应（3.3 第 2 条），能拨的时候变化行一定在眼前。
- 变化行一直留到下一次拨动或这块区域关掉。关掉之后要改回去，就再拨一次开关。哪些改动给「撤销」、撤销发什么，见 3.6。

### 3.5 区域里画什么

照定样 F：平台标头「Molis Work · 只有你能改」（加上这个安装的显示名，由外层从目录取，不由插件给）；一句「只能读，不能改；只给这个任务；随时可以撤回」；一类一行（提供方的显示名与「包含什么」，英文取该提供方的 `ui.translations`，同 `TaskGrantCategory` 的注释），末尾一个开关；状态行按 `TaskGrantCategoryState.status`：`needs_confirmation` 多一个「允许」，`unavailable` 写「暂时读不到，授权还在」，`removed` 写「这一类已不再提供」和「移除」。控件全部用组件板已有的（`mw-item`、`mw-switch`、`mw-toast` 带 `action`），新增的平台区域外框与标头按原型说明的「组件板新增」交 D 轨补标本。

### 3.6 读与写的时机，与 `set` 的类别怎样组

`agent.task_grants.set` 是整体替换。照 #1841 的写法，每一类都会按此刻的目录重新展开，拨一个开关就会连带改别的类：处在 `needs_confirmation` 的类被悄悄放开新能力（违反 PWA-152 与「发现不扩权」），处在 `unavailable` 的类展开成空、授权悄悄没了（违反「记录留着，回来就恢复」）。评审挡合并 1，**统筹裁定修法 (a)：改 P2 宿主的 `set`**，区域按下面的规则组请求。

**区域要求 `set` 做到的**（P2a 写手实现，合同注释随之改；统筹已转达）：

| # | 规则 |
| --- | --- |
| R1 | 请求里列出、而这个主体**原本就有记录**的类，原记录**原样保留**，不按此刻的目录重新展开，不论它现在是 `granted`、`needs_confirmation`、`unavailable` 还是 `removed`。这样的类按 `list` 此刻的写法点名、按原记录认：`removed` 的那一行是不带 `group_id` 的提供方（记录里的动作此刻不在任何组里）。「原本就有记录」以**宿主执行 `set` 时**这个主体的记录、以及每条记录此刻所属的类为准，不看请求里写的状态；区域读到的底与宿主的记录靠 `expected_revision` 对齐，revision 把两者一起算进去，所以提供方在区域读过之后改了分组，`set` 就是 `actions.conflict`，区域重读再拨。既不是原有的类、也不是此刻提供的类，而主体有这个提供方的记录的引用，是分组改动之前的旧引用，同样整次 `actions.conflict`（#1879 评审，2026-11-06）。「组不存在」、对声明了分组的提供方省略 `group_id` 就拒（实施方案 §10 C3）对新加入的类照旧 |
| R2 | 请求里**新加入**的类（原来没有记录），按此刻的目录展开记下 |
| R3 | 本人点「允许」时要能重新展开一个已有的类：请求里这一类带 `confirm: true`，就按此刻的目录重新记下这一类（只用于 `needs_confirmation`）。统筹 2026-11-06 裁定两种边界：`confirm: true` 的类此刻展开为空（提供方停用或不再声明）时**整次拒绝**，原记录不动；`confirm` 用在原本没有记录的类上**整次拒绝**（`actions.input_invalid`），不当作 R2。这一项改 `set` 的输入形状（`TaskGrantCategoryReference` 加可选的 `confirm`），会变 `tooling/gates/actions/` 的快照，随 P2a 的合同改动一起落 |
| R4 | 原本有记录、请求里没列的类，记录删掉 |
| R5 | 新加入的类若提供方此刻停用或不再声明它（展开为空），整次拒绝（`actions.input_invalid`），不记一条空授权 |

**区域怎样组请求**（「底」= 这个主体此刻**所有有记录的类**，按读到的状态，含 `needs_confirmation`、`unavailable`、`removed`）：

| 本人做了什么 | 发出的 `set` | 给不给「撤销」 |
| --- | --- | --- |
| 打开一个关着的类 Y | 底 + Y | 给：撤销发「此刻的底 − Y」 |
| 关掉一个 `granted` 的类 Y | 底 − Y | 给：撤销发「此刻的底 + Y」（Y 重新展开；刚才是 `granted`，展开结果与原记录相同，除非这几秒里目录变了，那与重新打开一样；若这几秒里 Y 的提供方停用了，撤销被 R5 拒，按下面「失败」处理） |
| 关掉一个 `needs_confirmation` 的类 X | 底 − X | **不给**（用户 2026-11-06 定）：原记录已删，撤销只能按此刻重新展开，那会悄悄放开新能力。变化行写「已撤回 X；要再读它，重新打开开关，会按它现在的读取能力允许」 |
| 关掉一个 `unavailable` 的类 X | 底 − X | **不给**（同上）：撤销会展开成空、被 R5 拒。变化行写「已撤回 X；它的插件回来之后，重新打开开关才能再读」 |
| 「允许」`needs_confirmation` 的类 X | 底，X 带 `confirm: true` | **不给**（同上）：旧记录不留。变化行写「已允许 X 的新读取能力；不想要就关掉这一类」 |
| 「移除」`removed` 的类 X | 底 − X | **不给**（同上）：这一类已不再提供。变化行写「已移除 X，这一类已不再提供」 |
| 撤销 | 见上表各行 | 撤销之后不再给撤销 |

- `unavailable` 且关着的类，开关不可拨（提供方停用，打开会被 R5 拒）；`removed` 的类没有开关，只有「移除」。
- **不给撤销的几种**（用户 2026-11-06 定，见[主动助理 §5.4.1](spec.md) 决策记录与 PWA-154）：关掉 `needs_confirmation` 或 `unavailable` 的类、「允许」、「移除」。这是对定样 F「可撤销」的一处例外，变化行写清怎样回去。

**宿主那一半的拒绝用例**（归 P2 的任务主体不变量，不进本稿的 TGA；P2a 写手落）：

- 带 `confirm: true` 的类此刻展开为空：整次拒绝，这个主体的全部记录不变。
- `confirm` 用在原本没有记录的类上：`actions.input_invalid`，不写任何记录。
- 底里有 `removed` 的类（按 `list` 的写法，不带 `group_id` 的提供方），同时新加入一类 Y：被接受，`removed` 那一类的记录原样保留。
- 区域读过之后提供方改了分组（开始分组、或删掉一组），拿读到的 revision 发的 `set`：`actions.conflict`，记录不变；带已不再声明的 `group_id`、而主体有这个提供方记录的引用，用此刻的 revision 也是 `actions.conflict`。
- 新加入的类对声明了分组的提供方省略 `group_id`、或指向不存在的组：整次拒绝（C3 对新加入的类照旧）。
- 请求里写的状态与宿主记录不符、`expected_revision` 过期：`actions.conflict`，不写。
- 每个请求都带读到的 `revision`；回来的主体就是新状态，不再读。

**时机**：

- **打开**：`place` 之后外层发一次 `read`。
- **冲突**（`actions.conflict`，比如同一个任务同时开在主区和右侧、或「授权与放行」一页刚改过）：开关回到原位，重读一次，变化行写「已在别处改动，已刷新」，撤销作废。
- **失败**：开关回到原位，变化行写「没能保存，原来的授权没变」加「重试」（PWA-154）。撤销失败（如上表 R5 的情形）也走这一条，并且这次撤销作废、不再给撤销。
- **框重新可见**：重读一次。不轮询。

## 4. 新的安全不变量（问题 3）

名称：**`S-task-grants-area`**（记录在 [`docs/system/security-invariants/S-task-grants-area.md`](../../docs/system/security-invariants/S-task-grants-area.md)；起草时暂编 S-1xx、P3-1 写手暂编 S-142，main 改成每条一个文件、按语义命名之后用名字，不再取号）。P2 的「按任务的授权主体」那条是 [`S-task-grant-subjects`](../../docs/system/security-invariants/S-task-grant-subjects.md)。

**一句话**：插件页面里那块「能读的数据」只由工作台画在插件框外、只由本人对它的真实点按改动：插件只给位置与自己任务的 key，读不到其中的类别与开关（高度也只按宽度取档），不能让它透明、移位、被盖住，也不能替本人点；不满足时开关不响应、不写任何记录。

**前提**（评审小修 9）：宿主路由的信任只靠「带外层加的 `x-molis-context-page` 头、没有框里取数桥的 `x-molis-plugin-page` 头」（`plugin-page-authority.ts` 与 `slotChoice` 同一判据）；取数桥对框里的每个请求都加上 plugin-page 头，只转发 accept、last-event-id 与幂等键，框里造不出外层的头。所以同源文档里**任何**代码都能调这条路由，与连接槽、`/api/agent/reviews/decide` 现在一样；这条路由的后果是给任务开读，比那几条重。成立的前提是**外层文档与各个同源文档里不跑插件代码**：插件代码只在不透明来源的沙箱框里跑（S-47），宿主的回答不能被别的站点嵌进框架（S-21）。哪天有插件代码进了同源文档，这条不变量与连接槽、审查决定一起失效，要先改它们。

**拒绝什么，各自的用例**（浏览器用例放 `tests/security-invariants-task-grants-area.e2e.test.ts`，按 `test:security` 的 `tests/security-invariants-*.test.ts` 通配在 CI 里跑，样子照 `tests/plugin-page-reviews.e2e.test.ts` 与 `tests/security-invariants-plugin-pages.e2e.test.ts`；宿主路由的拒绝不需要浏览器，放 `tests/security-invariants-task-grants-area.test.ts`）。每条用例断言**没有写**：宿主那边 `agent.task_grants.set` 没被调用、授权记录（`config/mcp-tools.json` 里这个主体的行）不变。

| 编号 | 插件做了什么 | 断言 | 先红的办法（落地 PR 里写出红的那次运行） |
| --- | --- | --- | --- |
| TGA-01 | 在框里把空元素设 `opacity:0`、`visibility:hidden`、`z-index:-1`，在下面摆一个「继续」按钮 | 外层区域的计算样式不受影响（`opacity` 为 1、在框之上）；本人点到的是真开关，变化行写出变化 | 先把区域画在框里（方案 C 的写法）跑一遍，断言区域样式不变的那一步红。这一条证明的是架构（区域不在插件文档里），不是某一条检查的先红 |
| TGA-02 | 在点按前 100 毫秒改报的位置，把区域挪到指针下 | 这一下不写；区域处在未就绪态；变化行写「刚移动过，请再拨一次」（D1） | 先不实现 3.3 第 4 条跑，红 |
| TGA-03 | 让区域刚出现就被点；或外层窗格缩放让区域在视口里挪动后立刻点 | 不写 | 同上；稳定期改成按插件报的位置计时（不按外层量的矩形）时，窗格缩放那半条红 |
| TGA-04 | 报一个只露出开关、标头和变化行在框外的位置；或让外层某个裁剪祖先裁掉标头 | 不写；变化行写「请先让这一块完整显示」，框收到 `task-grants-reveal` | 先不实现 3.3 第 2 条，红 |
| TGA-05 | 请一个嵌入或审查卡叠在区域标头上 | 区域在上（层级）；即使人为把嵌入调到上面，命中检查不过、不写 | 先不实现 3.3 第 3 条并把区域层级设成 1，红 |
| TGA-06 | 在外层文档里（测试代表一段被注入的脚本）对开关 `dispatchEvent(new MouseEvent("click"))`、或调 `.click()` | 不写（`isTrusted` 为假） | 先去掉第 1 条，红 |
| TGA-07 | 从框里发伪造的消息：`task-grants-set`、带 `categories` 的 `task-grants-open`、超过 4 块、非法 key、负数 id | 都不写；超限与非法的不建区域 | 外层若照单全收会写：先让处理器接受一个带类别的上行消息，红 |
| TGA-08 | 框里的插件代码经框的取数桥请求宿主路由（带 `x-molis-plugin-page`） | 拒绝（`plugin-page-authority.ts` 的拒绝答复），不写。框里直接 `fetch`（`Origin: null`）由 S-03 现有用例覆盖，这里不重复 | 先让路由也认页面头，红 |
| TGA-09 | 以外层身份调路由，输入里多出任何安装字段（`plugin_install_id`、`install_id`）或别的键 | `actions.input_invalid`；写入只落在页面自己的安装下 | 先让路由从输入读安装，红 |
| TGA-10 | 框被藏起（标签切走）、框里开了对话框时，区域还在原位吗 | 藏起、不响应 | 先不处理 `null` 与 `visible()`，红 |
| TGA-11 | 读插件能拿到什么：在类别个数、状态、说明长短都不同的两个项目里各放一块同宽的区域，监听框的全部下行消息 | 只有 `task-grants-size`、`task-grants-shown`、`task-grants-changed`、`task-grants-reveal`；两个项目的 `size` 相同，且只取 3.1 的两档之一；`changed` 只有两个布尔；`shown` 的错误是固定的一句；没有类别名、动作名、`revision` | 让高度跟内容走（`ResizeObserver` 量到多少回多少），红；让下行带主体，红 |
| TGA-12 | 本人正常拨、撤销、允许、移除 | 各发一次 `set`，请求按 3.6 组好，变化行写对；撤销回到上一步 | 正常路径，证明拒绝不是因为区域根本不能用 |
| TGA-13 | 类 X 处在 `needs_confirmation`，本人拨类 Y | 请求里 X 不带 `confirm`；X 的授权记录不变，X 新加的读取能力仍读不到 | 区域按「已授权的类 ± Y」组、宿主按旧写法整体重新展开，红（宿主那一半的拒绝用例在 P2 的任务主体不变量里） |
| TGA-14 | 类 X 处在 `unavailable`（提供方停用），本人拨类 Y | X 的记录保留；提供方回来、能力没变，X 照样读得到 | 同上：重新展开得到空，X 的记录没了，红 |
| TGA-15 | 插件页面写「按 Tab 再按空格继续」，焦点从框里 Tab 到开关上后 100 毫秒内按空格（或回车） | 不写；开关处在未就绪态；焦点停够 500 毫秒后再按才写 | 先只按 `pointerdown` 计稳定期、不管键盘，红 |
| TGA-16 | 连点开关三下；或写入在途时再点 | 只发一个 `set` | 先去掉 3.3 第 5 条，红 |
| TGA-17 | 区域的 key 换了之后点旧开关；页面撤销（`DELETE` 页面授权）后点；页面关闭或插件停用后调路由 | 都不写；路由拒绝（页面授权的拒绝答复） | 先去掉 3.3 第 6 条，红；路由那半先不核页面是否当前，红 |
| TGA-18 | 框宽小于 280 px（极窄的侧栏） | 区域藏起、不响应，空元素高度回 0 | 先不判框宽，红 |
| TGA-19 | 一页放两块区域，报成相交的位置（A 的标头压着 B 的开关） | 两块都藏起、不响应，分开后恢复 | 先不判相交，红 |

**代码位置**（表的第三列，落地时写实）：`apps/workbench/src/browser/plugin-frame/task-grants-area.ts`（外层的画与六条检查、框里的报位置）；`parent.ts`、`child.ts`、`types.ts` 的接线；`apps/local-host/src/plugin-page-authority.ts` 的新一项与 `plugin-page-http.ts` 的路由。

**残余风险（评审台确认接受）**：

- **仿冒的区域**：插件可以在自己的文档里画一块仿冒的区域。仿冒的开关什么都写不了，所以不能扩大授权；它能做的只是让本人以为已经撤回了。兜住它的是：运行结果里列出这次读了哪些来源（实施方案 §2「AI 的部分」），以及「授权与放行」一页（第 5 节）显示真实的授权与任务标题。平台区域能做的只是在视觉上与插件内容分开（外框与标头，组件板标本），不承诺插件仿不出来。
- **任务错配**（评审小修 4）：key 是插件给的，区域标头只显示安装名、不显示任务名，所以插件可以把任务 Y 的区域放在任务 X 的详情里，本人以为在改 X。错配只在同一个安装之内，不跨安装（安装由宿主从页面授权取）；而且这个安装本来就决定每个任务做什么。兜住它的与上一条相同。区域标头**不**显示任务标题：标题要经 D3 的搜索条目动作取，打开一次详情就要多取整个安装的条目（不符合第 6 节「打开 1 个请求」），而且标题本身也是插件说的，挡不住插件有意错配。

## 5. 「授权与放行」一页怎样读（问题 5）

- 打开时以本人身份调**一次** `agent.task_grants.list`，不带 `plugin_install_id`：得到本项目此刻可选的 `categories` 与全部任务主体，每个主体带安装与 key、各类状态。按安装分组，每个任务一行，列出已授权的类别与状态。
- 撤回一类：一次 `set`（去掉这一类，带 `revision`，组法同 3.6）；全部撤回：一次 `clear`（本人调要写 `plugin_install_id`）。`needs_confirmation` 给「允许」，`removed` 给「移除」，与区域同一套文字。
- 这一页由 D 轨实现，和平台区域共用「一类一行」的画法与翻译取法；冲突处理同 3.6。
- 「对外接入」一页排除任务主体（实施方案 §3.2）由 P2 的宿主改动做，不在 P3。
- 撤回、允许、移除的请求照 3.6 的规则组（底 ± 这一类，允许带 `confirm: true`），不按「已授权的类」组。
- **一个任务叫什么**（用户 2026-11-06 定，D3）：合同里的主体只有安装与 key，没有标题。提供方在 Manifest 里声明 `task_subjects`（5.1），平台用它已有的搜索条目动作取标题，一页一次（5.2）。

### 5.1 Manifest 新字段 `task_subjects`

```ts
// packages/contracts/src/platform/plugin-task-subjects.ts（新文件，照 plugin-read-groups.ts 单独一段）
/**
 * What this plugin's task grant subjects are, so the platform can name them where the person reviews grants
 * (specs/proactive-assistant/task-grants-platform-area.md §5). A subject's key is the id of one of this plugin's own
 * objects of `kind`; the platform finds its title through this Manifest's own search source for that kind.
 */
export interface PluginTaskSubjectsDeclaration {
  /** An object kind this Manifest's own search source lists (`search_source.kinds[].kind`). */
  readonly kind: string;
}
// packages/contracts/src/platform/plugin-manifest.ts，紧接 read_groups
/** What this plugin's background tasks are, by its own object kind (`plugin-task-subjects.ts`). */
task_subjects?: import("./plugin-task-subjects.js").PluginTaskSubjectsDeclaration;
```

- **读 Manifest 时的检查**（`packages/plugin-sdk/src/task-subject-declarations.ts`，新文件，由 `parsePluginManifest` 在 `readGroupDeclarationProblems` 旁调用）：是对象、只有 `kind` 一个键；`kind` 是本 Manifest 某个动作的 `action.search_source.kinds[].kind`，并且那个动作对 `user` 开放（取标题以本人身份调）。不符就拒绝这份 Manifest，同读取分组。
- **不声明**：插件照样能用任务主体与平台区域，只是「授权与放行」里那一行写「插件名 · 一个任务」。插件同等待遇：第三方声明同一项就得到同样的标题。
- **Schedule 的声明**：`task_subjects: { kind: "schedule_task" }`；它已有 `schedule.search.entries`（`plugins/native/schedule/src/search.ts`，列出未归档的 `schedule_task`，带标题与打开位置），不用新增动作。这一行属 E 的文件，按规则 7 由 E 随 P3-2 落。
- **一种对象**：现在一个插件的任务主体只对应一种对象，所以 `task_subjects` 是单个对象。将来一个插件有多种任务对象时改成数组（合同改动）。
- **验收**：`TGA-20`「`task_subjects` 声明检查」：上面三条读 Manifest 时的检查（只有 `kind`；`kind` 是本 Manifest 搜索来源列出的；那个搜索来源对 `user` 开放）各有一个通过用例和只破这一条的拒绝用例，畸形输入以 `plugin.declaration_invalid` 拒绝而不是抛 TypeError（`tests/plugin-task-subjects.test.ts`）。它是 Manifest 合同的检查，**不属于**第 4 节的安全不变量：标题只用于显示，不作授权依据。

### 5.2 取标题的通路

1. 页面先调一次 `agent.task_grants.list`（同上）。
2. 对**有任务主体的每个安装**（通常只有 Schedule 一个），从目录找出它的 Manifest 声明的 `task_subjects.kind`，以本人身份调这个安装自己的、列出该 kind 的搜索条目动作（`SEARCH_ENTRIES` 合同，`{ cursor: null, limit: 500 }`），用 `subject.id === key` 配上标题与 `open`。一个安装一次；超过 500 条才按 `next_cursor` 再取，直到配齐或取完。
3. 配上的：一行写任务标题，加「打开」（`open` 给的面与对象）。配不上的（任务已归档或删掉、提供方没声明、搜索动作暂时不可用）：写「插件名 · 一个任务」；已归档或删掉的任务本该由 Schedule 清授权（实施方案 §3.4），这一页照样给「全部撤回」。
4. 标题是提供方说的，只用于显示，不作任何授权依据；页面不缓存，每次打开现取。

不新增动作，不改 `agent.task_grants.list` 的输出：宿主不为取标题耦合到搜索，`actions:update` 不因取标题而变。

## 6. 调用次数（问题 6）

| 操作 | 浏览器发出的请求 | 宿主里 |
| --- | --- | --- |
| 打开任务详情（区域出现） | 1 个 `read` | 页面核对 1 次；`list` 1 次（读一次目录与授权记录）。Schedule 自己的任务列表照旧一次 `list`（插件受众），与区域无关 |
| 拨一个开关 | 1 个 `set` | 页面核对 1 次；`set` 1 次（宿主按 3.6 R1～R5：已有的类保留原记录，只展开新加入的类）；回来的主体直接显示，不再读。框收到一条 `task-grants-changed`，Schedule 用它更新列表标记，不再请求 |
| 撤销、允许、移除 | 各 1 个 `set` | 同上 |
| 冲突或失败 | 冲突时多 1 个 `read` | — |
| 框重新可见 | 1 个 `read` | 同打开 |
| 页面在后台、区域可见时 | 0（不轮询） | 0 |
| 「授权与放行」一页打开 | 1 个 `list` | 1 次目录与授权记录读取 |
| 同上，取任务标题 | 有任务主体的安装各 1 个搜索条目请求（通常 1 个），不按任务逐个 | 各 1 次该插件的搜索条目动作 |

框里报位置的每帧循环不发网络请求，只在有区域且页面可见时跑。

## 7. 合同改动清单（问题 4，给合同代码写手）

按[轨道规则](../post-anticorruption-roadmap/reference/tracks.md#section-5) 1，合同先行、只改合同；共两处，**分成两个合同 PR**（理由见本节末）。

**P3-0a 页面接口**（`packages/contracts/src/platform/ui.ts` 在轨道表里归 D，由 D 的合同写手落、C1 评审）：

| 文件 | 改什么 |
| --- | --- |
| `packages/contracts/src/platform/ui.ts` | 新增 `UiTaskGrantsAreaState`、`UiPageTaskGrants<Element>`（2.1）；`UiPluginClientHost` 加 `readonly taskGrants` |
| `packages/plugin-sdk/src/index.ts` | 第 80 行那组 `export type` 加 `UiPageTaskGrants`、`UiTaskGrantsAreaState` |
| `tooling/gates/api/contracts/platform/ui.txt`、`tooling/gates/api/plugin-sdk/index.txt` | `pnpm api:update` 只应变这两份 |

验收：快照 diff 只含上表两项；给 `UiPluginClientHost` 造假宿主的地方（Git、Coding 的类型、工作台 `child.ts`）补上 `taskGrants`（`child.ts` 先给一个拒绝的占位，P3-1 换成真的）。

**P3-0b Manifest 的 `task_subjects`**（C1 写、C1 评，照 #1841 加 `read_groups` 的样子）：

| 文件 | 改什么 |
| --- | --- |
| `packages/contracts/src/platform/plugin-task-subjects.ts`（新） | `PluginTaskSubjectsDeclaration`（5.1） |
| `packages/contracts/src/platform/plugin-manifest.ts` | `PluginManifest` 加可选的 `task_subjects`，紧接 `read_groups` |
| `packages/contracts/src/platform/plugin.ts` | 与 `PluginReadGroupDeclaration` 并列转出 `PluginTaskSubjectsDeclaration` |
| `packages/plugin-sdk/src/task-subject-declarations.ts`（新）、`packages/plugin-sdk/src/manifest.ts` | 5.1 的检查，`parsePluginManifest` 调一次；用例放 `tests/plugin-read-groups.test.ts` 旁的新文件或同一文件（拒绝：多余的键、`kind` 不是本 Manifest 搜索源列的、那个搜索源不对 `user` 开放），并写进 SDK README「改动后必跑」 |
| `tooling/gates/api/contracts/platform/plugin.txt` | `pnpm api:update` 只应变这一份（新文件是 `plugin` 子路径的一部分，不另成快照） |

**两个 PR 都不改**：动作（`pnpm actions:update` 无变化：三个平台动作已在 #1841，取标题用插件已有的搜索条目动作）；`dom-events.ts`（无新 DOM 事件）；框通道的消息类型（`apps/workbench/src/browser/plugin-frame/types.ts`，工作台内部，随 P3-1 落）；各插件的 Manifest（Schedule 那一行随 P3-2 由 E 落）。

**为什么分开、先后怎样排（推荐）**：两个 PR 改的快照不重叠（`ui.txt`、`plugin-sdk/index.txt` 对 `plugin.txt`），按规则 1 可以各自排队。在途核对（2026-11-06，评审小修 7 更正）：真正占着 `plugin-sdk/index.txt` 快照的是 #1836（第 02 批③，改 `plugin-sdk/src/index.ts` 与 `tooling/gates/api/plugin-sdk/index.txt`）；#1846（账号基础）只改 `ui.ts` 源文件，改动从 `UiRequestInit`（约 651 行）开始，紧挨 `UiPluginClientHost` 的末尾，文本冲突很小；#1790（第 02 批）只改 `plugin-sdk/src/index.ts` 源文件；`ui.txt` 与 `plugin.txt` 都没有在途合同 PR。所以 **P3-0b 先开先合**；P3-0a 排在 #1836 之后（它占着 SDK 快照），与 #1846、#1790 的源文件冲突落地时顺手解。合在一起的话，整个 PR 要陪着等 `ui.txt` 和 `plugin-sdk/index.txt`，又同时占住三份快照，不划算。两者互不依赖：P3-1 要 P3-0a，P3-3（「授权与放行」）要 P3-0b。

**顺带看到的缺口（不在本批做）**：`child.ts` 已经把 `reviews` 交给插件，但 `UiPluginClientHost` 里没有这一项，Git 自己在 `plugins/native/git/src/browser/types.ts` 补声明。交 C1/D 记一条 BL。

## 8. 用户的决定

**已定（用户 2026-11-06，[#1860 评论](https://github.com/molis-ai/molis-work/pull/1860#issuecomment-6677128052)）：D1 选 A、D2 选 A、D3 选 B**，都按推荐；正文 3.3 末、3.4、第 5 节已按选定写死，决策记录见[主动助理 §5.4.1](spec.md)。下面留着当时的选项，供以后查为什么。

**D1 防遮盖条件不满足时，这一下拨动怎样交代。** 3.3 的第 2、4 条会让一些真点按不生效：刚滚完就拨（500 毫秒内）、区域只露出一半。

- **A（选定）** 这一下不生效，变化行写一句原因并请再拨一次：「刚移动过，请再拨一次」「请先让这一块完整显示」；区域只露一半时，同时请框把空元素滚进视野。安全，用户知道为什么。评审补的变体「稳定期内开关淡显『未就绪』」与 A 一致，统筹裁定采纳（3.3），不另问。
- B 不生效也不说。最安静，但用户会以为开关坏了。
- C 不设 500 毫秒的稳定期，只留整块可见与命中检查。没有误拦，但挡不住「点按前一刻挪过来」（TGA-02、TGA-03 删掉），要在不变量里写明接受这一风险。

**D2 变化行平时占不占位。** 原型 F 是拨动后才长出这一行。

- **A（选定）** 平时就占一行，写「拨一下即生效，下一次运行起按新的范围读」，拨后换成变化与「撤销」。区域高度不变，拨动后这一行不会被挤出视野，也不推动插件的排版。
- B 平时空着留白占位。效果同 A，但空白看着像没画完。
- C 照原型，拨后才长出来。离下边缘近时新长出的那一行可能出框；那时区域整块不再可见，下一次拨动按 3.3 第 2 条不响应（「撤销」要先滚回来）。

**D3 「授权与放行」一页怎样叫出一个任务。** 合同里的任务主体只有安装与 key，平台不知道任务标题。

- A 写「Schedule · 一个任务」，加「在 Schedule 里打开」。打开靠的是提供方的约定「key 就是自己某个对象的 id」（Schedule 用 `task_id`），不是平台的假设；不守这个约定的插件只能打开它的面。不改合同；同一个插件有几个任务时只能逐个打开去认。
- **B（选定）** 提供方在 Manifest 里声明「任务主体对应自己的哪种对象」（例如 Schedule 的任务对象），这一页按 key 批量取标题，取不到就退回 A 的写法。任何插件同一套；代价是 Manifest 合同多一项（另开合同 PR），Schedule 补一行声明。落成的写法：字段 `task_subjects: { kind }`，标题经该插件已有的搜索条目动作一个安装取一次（5.1、5.2），合同见第 7 节 P3-0b。
- C 平台区域在写入时记下插件给的标题。标题是插件说的、可以与实际任务不符——这一条对 B 同样成立（B 取到的标题也是插件的搜索条目给的）。C 真正的差别是：要改授权记录的形状（`config/mcp-tools.json` 带版本，要升版本与升级步骤），而且记下的标题会过时（任务改名后不跟着变），B 每次现取。不推荐。

## 9. 开工前检查（问题 7）

逐项回答[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)第 4 节。

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。授权仍归宿主的动作授权（P2）；区域只是本人改它的一个入口。插件拿到的摘要是派生的显示值，不存。任务归 Schedule |
| 2 | 插件同等待遇 | 区域是平台能力，任何插件经同一个 `host.taskGrants.place` 用；宿主与工作台里不写 Schedule 的名字；安装从页面授权取。不新增构建期接线 |
| 3 | 能力注册 | 写入只经已登记的 `agent.task_grants.set`（`user` 受众）；新的宿主路由只是本人调用的一个入口，以本人身份调动作，不另登记能力。不等模型或外部服务，不需要 `scheduling: "concurrent"` |
| 4 | 合同 | 改两处，各一个只改合同的 PR（第 7 节）：P3-0a `ui.ts` 两个类型与 `UiPluginClientHost` 一项、SDK 转出，排在 #1846、#1790 之后；P3-0b Manifest 可选字段 `task_subjects` 与它的检查，`plugin.txt` 没有在途合同 PR，先开先合。M1 之前，不留兼容期；`task_subjects` 可选，不声明的插件不用改 |
| 5 | 放在哪个包 | 外层与框里的代码在 `apps/workbench/src/browser/plugin-frame/`（D）；路由在 `apps/local-host`（页面授权的同一处）。都是已有平台层的扩展，不是新的平台服务，不开 `horizontal/` 包；依赖方向不变 |
| 6 | 表与存储 | 不新建表、不改存储，授权记录形状不变（D3 定 B，没选记标题的 C） |
| 7 | 兼容与迁移 | 不加 |
| 8 | 安全边界 | 碰：插件页面隔离（S-47 一族）、本人才能写授权（S-17 与 P2 的新条）。新增本稿第 4 节的一条，带 19 个用例（18 个拒绝、1 个正常路径），先红后绿；前提「同源文档里不跑插件代码」写明并指向 S-21、S-47。另要求 P2 的 `set` 保留已有类的原记录（3.6 R1～R5），宿主那一半的拒绝用例进 P2 的任务主体不变量 |
| 9 | 调用次数 | 见第 6 节：打开 1 个、拨 1 个、撤销 1 个，不按类别逐个请求，后台不轮询 |
| 10 | 升级与数据 | 不涉及存储；升级后授权照旧在 P2 的记录里，区域每次打开现读 |
| 11 | 成果与过程项 | 不涉及：不产生成果，也不交给别的插件 |
| 12 | 页面与外壳 | 插件只给位置，区域挂在插件自己的页面位置上，不出整页；无新 DOM 事件（框通道的 `postMessage` 不在登记范围）。页面资源：外层与框里的代码进现有插件框的资源，预计增长 5～8 KB，P3 的 PR 写实测字节数；不新增资源 |
| 13 | 错误 | 复用 `actions.input_invalid`、`actions.conflict`、`actions.forbidden` 与页面授权的拒绝答复；不新增错误码 |
| 14 | 冲突面 | D 独占：`apps/workbench/src/browser/plugin-frame/`、`ui.ts`、i18n 词典（区域的文字）。C1：`plugin-sdk/src/index.ts`、`packages/contracts/src/platform/plugin-manifest.ts` 与新的 `plugin-task-subjects.ts`、`packages/plugin-sdk/src/manifest.ts`、`tooling/gates/api/`（两个合同 PR）。宿主：`plugin-page-authority.ts`、`plugin-page-http.ts`，不在独占表、也不在规则 4 的热文件名单里，随 P3 落（规则 4）。E：Schedule 接入的那几行在 `plugins/native/schedule/src/browser/`，Manifest 的 `task_subjects` 一行在 `plugins/native/schedule/src/manifest.ts`（与 02② 的 N26 同文件，按规则 4 排开），按规则 7 由 E 落，叠在 P3 后面。在途核对（2026-11-06）：#1853 改 `plugin-frame/navigation.ts` 与 `dom-events.ts`，本稿都不碰，但 #1853 把右侧并入同一套窗格，P3 要在右侧标签里也测一遍；#1836 占 `plugin-sdk/index.txt` 快照，#1846 改 `ui.ts`、#1790 改 `plugin-sdk/src/index.ts` 的源文件（不改快照），`ui.txt`、`plugin.txt` 没有在途合同 PR（第 7 节）；`parent.ts`、`child.ts`、`types.ts`、两个宿主文件此刻没有别的在途 PR |

## 10. 拆片

| 片 | 内容 | 谁 | 前置 |
| --- | --- | --- | --- |
| P3-0a 页面接口合同 | 第 7 节 P3-0a | D 写、C1 评 | 本稿审过；#1836 让出 SDK 快照 |
| P3-0b Manifest `task_subjects` 合同 | 第 7 节 P3-0b | C1 | 本稿审过（可与 P3-0a 并行，先合） |
| P3-1 区域与路由 | 外层画区域与六条检查（含 D1 的原因提示与 `task-grants-reveal`、D2 的常驻变化行）、框里的报位置、宿主路由、不变量记录 `S-task-grants-area` 与 TGA-01～19、高度两档的常量、组件板标本（平台区域外框与标头）、中英文词条 | D | P3-0a、P2 的三个平台动作已在宿主可调且 `set` 按 3.6 R1～R5 |
| P3-2 Schedule 接入 | 任务详情里放空元素、`place`、用 `onChange` 更新列表标记；Manifest 加 `task_subjects: { kind: "schedule_task" }` | E（规则 7） | P3-1、P3-0b |
| P3-3 「授权与放行」按任务列出 | 第 5 节（含 5.2 取标题） | D | P2、P3-0b |

**P3-2 的验收**（不属于第 4 节的安全不变量，测试名里写编号）：

- `TGA-21` Schedule 只经 `host.taskGrants.place` 放区域：打开一个任务的详情，就在详情「能读的数据」一段里留好的空元素上放一块，key 是这个任务的 `task_id`；换到另一个任务、点返回、新建表单占了这一栏，都中止上一块（区域消失、空元素的高度还回去）；区域显示后，Schedule 自己按类别计的那一行让位，说明仍留着。页面在后台时打开的详情不被拒，页面显示后画出（`tests/schedule-task-grants-area.e2e.test.ts`）。
- `TGA-22` 本人在区域里改动之后，列表里这个任务的标记（读数据／读文件、需要重新确认）按框收到的两个布尔改，不再读一次授权（同上）。两个布尔分不出的一种（没有已授权的、也没有要本人看的，但还留着一类插件已停用的）先显示成读文件，下一次读列表时更正。
- `TGA-23` Schedule 的 Manifest 声明 `task_subjects: { kind: "schedule_task" }`，经 SDK 的检查照原样读出；列出这个 kind 的只有它已有的 `schedule.search.entries`，对 `user` 开放（`tests/schedule-task-grants.test.ts`）。
