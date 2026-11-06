# 插件页面里的平台区域：挂法与防遮盖（第 18 批 P3 设计稿）

状态：设计稿（2026-11-05，第 18 批合同台起草），待评审台审；第 8 节 D1～D3 等用户定，定之前 P3 只开合同 PR、不动界面细节。上游是[按任务授权读取的实施方案](schedule-task-reads.md) §3.7（用户定样 F）与 §9 G4（点击劫持）；定样见[原型说明](../../docs/design/schedule-task-grants/README.md)。

- **要解决的**：Schedule 的任务详情里要有一块「能读的数据」，一类一个开关，拨一下就是本人的一次 `agent.task_grants.set`。这一块必须由平台画、平台写：插件页面的代码读不到、改不了、也不能骗本人去点。
- **结论（推荐）**：插件只经 SDK 说「在这个空元素的位置，为我这个任务放一块」；工作台把区域画在**插件框外**，作为插件框的兄弟节点叠在它上面，跟着插件报的位置走。这和现有的审查卡（`view.reviews.show`，`apps/workbench/src/browser/plugin-frame/reviews.ts`）、嵌入（`view.embed`，`embed.ts`）是同一种做法，新增的是防遮盖的几条检查（第 3 节）和一条安全不变量（第 4 节）。
- **不碰的**：P2 的宿主任务主体与三个平台动作的实现（E）、Schedule 的页面（E，叠在 P3 后面接入）、`packages/contracts/src/platform/dom-events.ts`（推荐方案不需要新的 DOM 事件）。

验收编号：本稿新增 `TGA-01`～`TGA-12`（第 4 节），测试名里写编号；需求侧仍是 PWA-148、PWA-151、PWA-154。

## 1. 现状：插件页面怎样跑、平台已有的「框外区域」

- **插件页面在一个不透明来源的沙箱框里**：`mountFrame`（`apps/workbench/src/browser/plugin-frame/parent.ts`）建 `iframe`，`sandbox="allow-scripts allow-forms"`、`srcdoc`，框和外层只经一条 `MessageChannel` 说话（`types.ts` 的 `FrameUp`／`FrameDown`）。插件的客户端代码与框里的平台代码（`child.ts`）跑在同一个文档里，所以**框里报上来的任何东西都当作插件说的**，平台代码在框里也不可信。
- **外层文档**是工作台本身，或者侧栏的同源文档（#1853 把右侧并入同一套窗格后，插件的侧栏标签仍是一份同源文档，自己调 `mountFrame`）。区域画在调 `mountFrame` 的那份文档里，两种位置同一套代码。
- **已有三处「插件只报位置，平台在框外画」**：
  - 审查卡：框里 `childReviews` 每帧报空槽的 `getBoundingClientRect`（`review-layout`），外层 `pageReviews` 在 `root` 里建一个 `position:absolute; z-index:1` 的兄弟节点叠在框上，按框的位置换算坐标、裁到框内；外层量出内容高度回给框（`review-size`），框把空槽撑到这个高度。审查的文字、按钮、回执都不过这条通道。
  - 嵌入：同样的叠法，叠的是另一个插件的框。
  - 连接槽（`connection-slot.ts`）：外层画选择账号的弹层，安装与服务由宿主从页面授权取（`/api/host/plugin-page-slot`，只认外层加的 `x-molis-context-page` 头，框里的取数桥会去掉它，`apps/local-host/src/plugin-page-authority.ts` 的 `slotChoice`）。
- **缺的**：这三处都没有防「位置在点按前一刻挪过来」「区域只露出一半」「被别的平台叠层盖住标头」的检查——审查卡里的批准另有确认对话框兜着，开关即生效没有这一步，所以要补。

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
/** What the page learns after the person changes a task's reads: nothing about which categories, only what it shows on its own list. */
export interface UiTaskGrantsAreaState {
  /** At least one category is granted now (the task reads data). */
  readonly granted: boolean;
  /** A category needs the person: `needs_confirmation` or `removed`. */
  readonly attention: boolean;
}
/**
 * A platform area on one of this installation's own background tasks (specs/proactive-assistant/task-grants-platform-area.md).
 * The page supplies an empty element and the task's key; the shell draws the area over that place, outside the page, and
 * keeps its switches, words and writes. The element is given the area's height. Resolves once shown; rejects when unavailable.
 */
export interface UiPageTaskGrants<Element = unknown> {
  place(element: Element, key: string, options?: { signal?: AbortSignal; onChange?: (state: UiTaskGrantsAreaState) => void }): Promise<void>;
}
// UiPluginClientHost<Element, …> 加一项
readonly taskGrants: UiPageTaskGrants<Element>;
```

- 一个页面同时最多 4 块（外层拒绝更多，同审查卡的 8、嵌入的 4）；同一个元素再调一次是换 key，旧的那块关掉。
- `signal` 中止、元素离开文档、页面关闭都关掉这一块。
- `onChange` 只在本人拨动、撤销、允许、移除成功之后来一次，带的是新的摘要；插件要更多就自己调 `agent.task_grants.list`（插件受众，只看到自己安装的）。

### 2.2 框通道的消息（工作台内部，`types.ts`，不是公开合同）

| 方向 | 类型 | 内容 | 外层怎样核对 |
| --- | --- | --- | --- |
| 上 | `task-grants-open` | `id`、`key` | `id` 是正的安全整数；`key` 合 `TASK_GRANT_SUBJECT_KEY_PATTERN`；本页不超过 4 块；页面可见 |
| 上 | `task-grants-layout` | `id`、`box`（`x/y/width/height` 或 `null`） | 四个数都是有限数；`null`、宽为 0、页面不可见时区域藏起并且不响应 |
| 上 | `task-grants-close` | `id` | — |
| 下 | `task-grants-size` | `id`、`height` | 只给高度，框把空元素撑高 |
| 下 | `task-grants-shown` | `id`、`error?` | 让 `place` 的 Promise 结束；错误只给一句可显示的话 |
| 下 | `task-grants-changed` | `id`、`state`（2.1 的两个布尔） | 只在成功写入之后发 |

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
- **滚动**：插件滚动时位置每帧跟上，最多落后一帧；位置一变就重新计「稳定」的时间（3.3）。
- **缩放**：浏览器缩放与桌面壳缩放对框里框外同比例生效，坐标都是 CSS 像素，不用另算。
- **大小**：宽取插件报的宽，但**不小于 280 px、不大于框宽**；高**不取插件报的**，由外层量自己的内容（`ResizeObserver`），经 `task-grants-size` 回给框撑高空元素。插件不给高或给小了，区域照样完整画出，盖住的是插件自己的内容。
- **窄屏 390**：区域宽约 358 px（框宽减边距），一类一行，说明折行；变化行里的「撤销」按组件板 `mw-toast` 的规则折到字下面。框宽不足 280 px 时（极窄的侧栏）区域藏起，不响应，空元素高度回 0。
- **层级**：区域的容器 `z-index` 高于审查卡与嵌入（它们是 1，区域用 2），插件无法用自己请来的嵌入或审查卡盖住它。

### 3.2 插件框不可见、被遮

| 情况 | 区域怎样 |
| --- | --- |
| 框不可见（标签在后台、窗格收起、`frame.hidden`、任一祖先不可见：`parent.ts` 的 `visible()`） | 藏起、不响应；回到可见时重读一次（3.6），不轮询 |
| 框里开了对话框（`dialog[open]`）或插件报 `null` | 藏起、不响应 |
| 区域有一部分出了框的可见范围（滚到边上、被裁） | 照样画出可见的部分，但**整块不响应**（3.3 条件 ②）；见 D1 |
| 工作台自己的浮层（菜单、对话框、底栏弹层、浮条）盖在上面 | 盖住的地方点不到区域；没盖住的开关也要过命中检查（3.3 条件 ③）才响应 |
| 写入还没回来时框被藏起 | 这次写入照常完成（本人已经拨了），回到可见时显示结果；不因为藏起而取消 |

### 3.3 只认真实点按，什么时候才响应

外层的处理器挂在区域自己的开关、「撤销」「允许」「移除」上，**同时满足下面六条**才发请求，否则这一下什么都不写：

1. `event.isTrusted` 为真（脚本合成的 `click` 不算；键盘空格／回车在开关上产生的 `click` 也是真点按，照样要过下面几条）；`navigator.userActivation.isActive` 为真。
2. **整块可见**：区域整个落在框的可见范围里，并且框可见。
3. **命中检查**：`document.elementsFromPoint` 在被点的控件中心、区域标头、变化行三处取到的最上层元素都在区域里面（盖住标头、只露开关的叠法过不了）。
4. **位置稳定**：区域显示出来、以及最近一次位置或大小变化之后，已经过了 **500 毫秒**（插件在点按前一刻把区域挪到指针下，或者让它闪一下，都过不了）。见 D1。
5. 这块区域没有在途的写入（一次只发一个，防连点）。
6. 页面仍是当前的（`scope.assertCurrent()`），区域的 key 没换过。

插件改不了区域的透明度、位置、层级：区域不在插件的文档里；插件能影响的只有「报哪个位置」，而位置变化会触发第 4 条，宽有下限、高由外层定、容器层级固定。

### 3.4 变化行和「撤销」一直看得见

- 变化行是区域的一部分（同一个容器、同一次命中检查），不另外浮起。
- 变化行**平时就占住一行**（D2 推荐：平时写一句「拨一下即生效，下一次运行起按新的范围读」），拨动后换成「已撤回待办，下一次运行起读不到 · 撤销」，区域高度不变，所以不会因为多出一行而被挤出框外。
- 因为只有整块可见时开关才响应（3.3 第 2 条），能拨的时候变化行一定在眼前。
- 变化行一直留到下一次拨动或这块区域关掉。关掉之后要改回去，就再拨一次开关（撤销只是「回到上一次的类别」，没有别的语义）。

### 3.5 区域里画什么

照定样 F：平台标头「Molis Work · 只有你能改」（加上这个安装的显示名，由外层从目录取，不由插件给）；一句「只能读，不能改；只给这个任务；随时可以撤回」；一类一行（提供方的显示名与「包含什么」，英文取该提供方的 `ui.translations`，同 `TaskGrantCategory` 的注释），末尾一个开关；状态行按 `TaskGrantCategoryState.status`：`needs_confirmation` 多一个「允许」，`unavailable` 写「暂时读不到，授权还在」，`removed` 写「这一类已不再提供」和「移除」。控件全部用组件板已有的（`mw-item`、`mw-switch`、`mw-toast` 带 `action`），新增的平台区域外框与标头按原型说明的「组件板新增」交 D 轨补标本。

### 3.6 读与写的时机

- **打开**：`place` 之后外层发一次 `read`。
- **拨动**：一次 `set`，类别是「当前已授权的类别 ± 这一类」，带读到的 `revision`；回来的主体就是新状态，不再读。
- **撤销**：一次 `set`，类别是上一次的，带当前 `revision`。
- **冲突**（`actions.conflict`，比如同一个任务同时开在主区和右侧、或「授权与放行」一页刚改过）：开关回到原位，重读一次，变化行写「已在别处改动，已刷新」。
- **失败**：开关回到原位，变化行写「没能保存，原来的授权没变」加「重试」（PWA-154）。
- **框重新可见**：重读一次。不轮询。

## 4. 新的安全不变量（问题 3）

编号：**S-1xx（暂编，落地时按表顺延）**。S-108 已被第 13 批「换用账号」占用；P2 的「按任务的授权主体」那条（实施方案 §4 原暂编 S-108）先落就先取号，本条排在它后面。

**一句话**：插件页面里那块「能读的数据」只由工作台画在插件框外、只由本人对它的真实点按改动：插件只给位置与自己任务的 key，读不到其中的类别与开关，不能让它透明、移位、被盖住，也不能替本人点；不满足时开关不响应、不写任何记录。

**拒绝什么，各自的用例**（浏览器用例放 `tests/security-invariants-task-grants-area.e2e.test.ts`，按 `test:security` 的 `tests/security-invariants-*.test.ts` 通配在 CI 里跑，样子照 `tests/plugin-page-reviews.e2e.test.ts` 与 `tests/security-invariants-plugin-pages.e2e.test.ts`；宿主路由的拒绝不需要浏览器，放 `tests/security-invariants-task-grants-area.test.ts`）。每条用例断言**没有写**：宿主那边 `agent.task_grants.set` 没被调用、授权记录（`config/mcp-tools.json` 里这个主体的行）不变。

| 编号 | 插件做了什么 | 断言 | 先红的办法（落地 PR 里写出红的那次运行） |
| --- | --- | --- | --- |
| TGA-01 | 在框里把空元素设 `opacity:0`、`visibility:hidden`、`z-index:-1`，在下面摆一个「继续」按钮 | 外层区域的计算样式不受影响（`opacity` 为 1、在框之上）；本人点到的是真开关，变化行写出变化 | 先把区域画在框里（方案 C 的写法）跑一遍，断言区域样式不变的那一步红 |
| TGA-02 | 在点按前 100 毫秒改报的位置，把区域挪到指针下 | 这一下不写 | 先不实现 3.3 第 4 条跑，红 |
| TGA-03 | 让区域刚出现就被点 | 不写 | 同上 |
| TGA-04 | 报一个只露出开关、标头和变化行在框外的位置 | 不写 | 先不实现 3.3 第 2 条，红 |
| TGA-05 | 请一个嵌入或审查卡叠在区域标头上 | 区域在上（层级）；即使人为把嵌入调到上面，命中检查不过、不写 | 先不实现 3.3 第 3 条并把区域层级设成 1，红 |
| TGA-06 | 在外层文档里（测试代表一段被注入的脚本）对开关 `dispatchEvent(new MouseEvent("click"))`、或调 `.click()` | 不写（`isTrusted` 为假） | 先去掉第 1 条，红 |
| TGA-07 | 从框里发伪造的消息：`task-grants-set`、带 `categories` 的 `task-grants-open`、超过 4 块、非法 key、负数 id | 都不写；超限与非法的不建区域 | 外层若照单全收会写：先让处理器接受一个带类别的上行消息，红 |
| TGA-08 | 框里的插件代码直接取数宿主路由（经框的取数桥，带 `x-molis-plugin-page`） | 拒绝（`plugin-page-authority.ts` 的拒绝答复），不写 | 先让路由也认页面头，红 |
| TGA-09 | 以外层身份调路由，但多带 `plugin_install_id`、或别的安装的 key 形状 | `actions.input_invalid`；写入只落在页面自己的安装下 | 先让路由从输入读安装，红 |
| TGA-10 | 框被藏起（标签切走）、框里开了对话框时，区域还在原位吗 | 藏起、不响应 | 先不处理 `null` 与 `visible()`，红 |
| TGA-11 | 读插件能拿到什么：监听框的全部下行消息 | 只有 `task-grants-size`、`task-grants-shown`、`task-grants-changed`，后者只有两个布尔，没有类别名、动作名、`revision` | 让下行带主体，红 |
| TGA-12 | 本人正常拨、撤销、允许、移除 | 各发一次 `set`，变化行写对；撤销回到上一次的类别 | 正常路径，证明拒绝不是因为区域根本不能用 |

**代码位置**（表的第三列，落地时写实）：`apps/workbench/src/browser/plugin-frame/task-grants-area.ts`（外层的画与六条检查、框里的报位置）；`parent.ts`、`child.ts`、`types.ts` 的接线；`apps/local-host/src/plugin-page-authority.ts` 的新一项与 `plugin-page-http.ts` 的路由。

**残余风险（评审台确认接受）**：插件可以在自己的文档里画一块**仿冒**的区域。仿冒的开关什么都写不了，所以不能扩大授权；它能做的只是让本人以为已经撤回了。兜住它的是：运行结果里列出这次读了哪些来源（实施方案 §2「AI 的部分」），以及「授权与放行」一页（第 5 节）显示真实的授权。平台区域能做的只是在视觉上与插件内容分开（外框与标头，组件板标本），不承诺插件仿不出来。

## 5. 「授权与放行」一页怎样读（问题 5）

- 打开时以本人身份调**一次** `agent.task_grants.list`，不带 `plugin_install_id`：得到本项目此刻可选的 `categories` 与全部任务主体，每个主体带安装与 key、各类状态。按安装分组，每个任务一行，列出已授权的类别与状态。
- 撤回一类：一次 `set`（去掉这一类，带 `revision`）；全部撤回：一次 `clear`（本人调要写 `plugin_install_id`）。`needs_confirmation` 给「允许」，`removed` 给「移除」，与区域同一套文字。
- 这一页由 D 轨实现，和平台区域共用「一类一行」的画法与翻译取法；冲突处理同 3.6。
- **一个任务叫什么**：合同里的主体只有安装与 key，没有标题。这一页要让人认出是哪个任务，见 D3。
- 「对外接入」一页排除任务主体（实施方案 §3.2）由 P2 的宿主改动做，不在 P3。

## 6. 调用次数（问题 6）

| 操作 | 浏览器发出的请求 | 宿主里 |
| --- | --- | --- |
| 打开任务详情（区域出现） | 1 个 `read` | 页面核对 1 次；`list` 1 次（读一次目录与授权记录）。Schedule 自己的任务列表照旧一次 `list`（插件受众），与区域无关 |
| 拨一个开关 | 1 个 `set` | 页面核对 1 次；`set` 1 次（宿主按目录展开、整体替换这个主体的记录）；回来的主体直接显示，不再读。框收到一条 `task-grants-changed`，Schedule 用它更新列表标记，不再请求 |
| 撤销 | 1 个 `set` | 同上 |
| 冲突或失败 | 冲突时多 1 个 `read` | — |
| 框重新可见 | 1 个 `read` | 同打开 |
| 页面在后台、区域可见时 | 0（不轮询） | 0 |
| 「授权与放行」一页打开 | 1 个 `list` | 1 次目录与授权记录读取（若 D3 选 B，另按有任务的安装各 1 次取标题，批量） |

框里报位置的每帧循环不发网络请求，只在有区域且页面可见时跑。

## 7. 合同改动清单（问题 4，给合同代码写手）

按[轨道规则](../post-anticorruption-roadmap/reference/tracks.md#section-5) 1，单独一个只改合同的 PR，C1 评审；`packages/contracts/src/platform/ui.ts` 在轨道表里归 D，这一处由 D 的合同写手落、C1 评审。

| 文件 | 改什么 |
| --- | --- |
| `packages/contracts/src/platform/ui.ts` | 新增 `UiTaskGrantsAreaState`、`UiPageTaskGrants<Element>`（2.1）；`UiPluginClientHost` 加 `readonly taskGrants` |
| `packages/plugin-sdk/src/index.ts` | 第 80 行那组 `export type` 加 `UiPageTaskGrants`、`UiTaskGrantsAreaState` |
| `tooling/gates/api/contracts/platform/ui.txt`、`tooling/gates/api/plugin-sdk/index.txt` | `pnpm api:update` 只应变这两份 |

**不改**：动作（`pnpm actions:update` 无变化，三个平台动作已在 #1841）；Manifest（推荐 A 不需要声明；D3 若选 B 才改，另开合同 PR）；`dom-events.ts`（无新 DOM 事件）；框通道的消息类型（`apps/workbench/src/browser/plugin-frame/types.ts`，工作台内部，随 P3 实现落）。

**排队**：在途 #1846（账号基础，改 `ui.ts`，`ui.txt` 快照）与 #1790（第 02 批，改 `plugin-sdk/src/index.ts`）占着这两份快照，按规则 1「同一份快照同一时间只有一个合同 PR」，本 PR 排在它们后面，或与它们的作者商定先后。合同 PR 的验收：快照 diff 只含上表两项；测试里给 `UiPluginClientHost` 造假宿主的地方（Git、Coding 的类型、工作台 `child.ts`）补上 `taskGrants`（`child.ts` 先给一个拒绝的占位，P3 换成真的）。

**顺带看到的缺口（不在本批做）**：`child.ts` 已经把 `reviews` 交给插件，但 `UiPluginClientHost` 里没有这一项，Git 自己在 `plugins/native/git/src/browser/types.ts` 补声明。交 C1/D 记一条 BL。

## 8. 要用户拍板的

改变了定样 F 的操作路径或「授权与放行」一页的产品语义，不自己定。

**D1 防遮盖条件不满足时，这一下拨动怎样交代。** 3.3 的第 2、4 条会让一些真点按不生效：刚滚完就拨（500 毫秒内）、区域只露出一半。

- **A（推荐）** 这一下不生效，变化行写一句原因并请再拨一次：「刚移动过，请再拨一次」「请先让这一块完整显示」；区域只露一半时，同时请框把空元素滚进视野。安全，用户知道为什么。
- B 不生效也不说。最安静，但用户会以为开关坏了。
- C 不设 500 毫秒的稳定期，只留整块可见与命中检查。没有误拦，但挡不住「点按前一刻挪过来」（TGA-02、TGA-03 删掉），要在不变量里写明接受这一风险。

**D2 变化行平时占不占位。** 原型 F 是拨动后才长出这一行。

- **A（推荐）** 平时就占一行，写「拨一下即生效，下一次运行起按新的范围读」，拨后换成变化与「撤销」。区域高度不变，拨动后这一行不会被挤出视野，也不推动插件的排版。
- B 平时空着留白占位。效果同 A，但空白看着像没画完。
- C 照原型，拨后才长出来。离下边缘近时新长出的那一行可能出框；那时区域整块不再可见，下一次拨动按 3.3 第 2 条不响应（「撤销」要先滚回来）。

**D3 「授权与放行」一页怎样叫出一个任务。** 合同里的任务主体只有安装与 key，平台不知道任务标题。

- A 写「Schedule · 一个任务」，加「在 Schedule 里打开」（用 key 作为对象 id 打开插件的面）。不改合同；同一个插件有几个任务时只能逐个打开去认。
- **B（推荐）** 提供方在 Manifest 里声明「任务主体对应自己的哪种对象」（例如 Schedule 的任务对象），这一页按 key 用已有的对象描述通路批量取标题，取不到就退回 A 的写法。任何插件同一套；代价是 Manifest 合同多一项（最热的快照，另开合同 PR 排队），Schedule 补一行声明。
- C 平台区域在写入时记下插件给的标题。标题是插件说的、可以与实际任务不符，而且要改授权记录的形状（`config/mcp-tools.json` 带版本，要升版本与升级步骤），不推荐。

## 9. 开工前检查（问题 7）

逐项回答[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)第 4 节。

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。授权仍归宿主的动作授权（P2）；区域只是本人改它的一个入口。插件拿到的摘要是派生的显示值，不存。任务归 Schedule |
| 2 | 插件同等待遇 | 区域是平台能力，任何插件经同一个 `host.taskGrants.place` 用；宿主与工作台里不写 Schedule 的名字；安装从页面授权取。不新增构建期接线 |
| 3 | 能力注册 | 写入只经已登记的 `agent.task_grants.set`（`user` 受众）；新的宿主路由只是本人调用的一个入口，以本人身份调动作，不另登记能力。不等模型或外部服务，不需要 `scheduling: "concurrent"` |
| 4 | 合同 | 改：`ui.ts` 两个类型与 `UiPluginClientHost` 一项，SDK 转出；M1 之前，不留兼容期。单独一个合同 PR（第 7 节），排在 #1846、#1790 之后 |
| 5 | 放在哪个包 | 外层与框里的代码在 `apps/workbench/src/browser/plugin-frame/`（D）；路由在 `apps/local-host`（页面授权的同一处）。都是已有平台层的扩展，不是新的平台服务，不开 `horizontal/` 包；依赖方向不变 |
| 6 | 表与存储 | 不新建表、不改存储。D3 若选 C 才会改授权记录形状（不推荐） |
| 7 | 兼容与迁移 | 不加 |
| 8 | 安全边界 | 碰：插件页面隔离（S-47 一族）、本人才能写授权（S-17 与 P2 的新条）。新增本稿第 4 节的一条，带 12 个拒绝用例，先红后绿 |
| 9 | 调用次数 | 见第 6 节：打开 1 个、拨 1 个、撤销 1 个，不按类别逐个请求，后台不轮询 |
| 10 | 升级与数据 | 不涉及存储；升级后授权照旧在 P2 的记录里，区域每次打开现读 |
| 11 | 成果与过程项 | 不涉及：不产生成果，也不交给别的插件 |
| 12 | 页面与外壳 | 插件只给位置，区域挂在插件自己的页面位置上，不出整页；无新 DOM 事件（框通道的 `postMessage` 不在登记范围）。页面资源：外层与框里的代码进现有插件框的资源，预计增长 5～8 KB，P3 的 PR 写实测字节数；不新增资源 |
| 13 | 错误 | 复用 `actions.input_invalid`、`actions.conflict`、`actions.forbidden` 与页面授权的拒绝答复；不新增错误码 |
| 14 | 冲突面 | D 独占：`apps/workbench/src/browser/plugin-frame/`、`ui.ts`、i18n 词典（区域的文字）。C1：`plugin-sdk/src/index.ts`、`tooling/gates/api/`（合同 PR）。宿主：`plugin-page-authority.ts`、`plugin-page-http.ts`，不在独占表、也不在规则 4 的热文件名单里，随 P3 落（规则 4）。E：Schedule 接入的那几行在 `plugins/native/schedule/src/browser/`，按规则 7 由 E 落，叠在 P3 后面。在途核对（2026-11-05）：#1853 改 `plugin-frame/navigation.ts` 与 `dom-events.ts`，本稿都不碰，但 #1853 把右侧并入同一套窗格，P3 要在右侧标签里也测一遍；#1846、#1790 占快照（第 7 节）；`parent.ts`、`child.ts`、`types.ts`、两个宿主文件此刻没有别的在途 PR |

## 10. 拆片

| 片 | 内容 | 谁 | 前置 |
| --- | --- | --- | --- |
| P3-0 合同 | 第 7 节 | D 写、C1 评 | 本稿审过、D1～D3 定 |
| P3-1 区域与路由 | 外层画区域与六条检查、框里的报位置、宿主路由、不变量行与 TGA-01～12、组件板标本（平台区域外框与标头）、中英文词条 | D | P3-0、P2 的三个平台动作已在宿主可调 |
| P3-2 Schedule 接入 | 任务详情里放空元素、`place`、用 `onChange` 更新列表标记 | E（规则 7） | P3-1 |
| P3-3 「授权与放行」按任务列出 | 第 5 节 | D | P2；D3 选 B 时另等 Manifest 合同 |
