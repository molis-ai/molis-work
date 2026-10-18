# Pages 预览层外部候选

状态：自由函数版与最后一次闭包边界候选的等价核对、配对资源预演均已完成；**实际最小候选仍超预算 103 B，按约停止继续改写，停在外部，不建议实施当前候选**。没有进入生产实施或接受新 spec。基线为 P 的 `90d279993`，正式 served 预算 **706,825 B**。

P：`/Users/yijunwang/code/molis-anti-corruption-20261017/wt-pages-commands`。候选只写在同级 `pages-previews-planned/`；P 的生产源、测试、README、spec 和构建产物均未修改，没有运行整体 build 或 Chrome。

实际文件：[候选 diff](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/candidate.diff)、[editor-browser.ts](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/editor-browser.ts)、[editor-previews.ts](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/editor-previews.ts)、[资源数字](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/bytes.json)。这组旧文件对应下表自由函数 combined 版；pure/shared 原样保留供比较。最后一次闭包方案见文末，单独保存 closure-* 文件，未覆盖前次候选。

## 原自由函数候选范围

新增内部 `editor-previews.ts`，负责链接/评论预览的七个 DOM 引用、绘制、五个按钮监听、120ms blur、滚动/resize 订阅与节点移除。入口仍决定每一个挂载/释放时点。没有新 Controller、getView、状态所有者、ProseMirror Plugin 或 registry。

`popToken`、`popRequest`、`docked`、`hidePop` 及全部 pop/AI 表单、请求有效性逻辑仍在原入口；没有触碰 focus/transient/floating 或其他职责。公开函数、27 项公共导出与插件数组不变。

与前次计划相比，两处参数传递更严格地保留原行为：

- 创建函数接收 `Pick<PagesEditorMountOptions, "translate">`，每次仍在原来的时点读取 `options.translate`，而不是在入口提前固定一次译文函数；外部等价核对包含第一轮翻译中替换后续译文函数的情形。
- follow 函数接入口的 `() => options.onScreen?.()`，每次仍动态读取原 options，且 callback 的 `this` 仍为原 options 对象；不改成提前固定的裸函数引用。

## 逐项等价核对

| 时点/行为 | 候选如何保留 | 证据 |
| --- | --- | --- |
| `host.replaceChildren` 后、toolDefs 前 | 原顺序创建 link 根/label/open/edit，再 comment 根/text/edit；打开→编辑→编辑的译文调用顺序不变 | 原代码与纯提取 AST 比对；去重版本创建轨迹比对 |
| toolDefs 后、pop 前 | 入口仍按 link→comment append 到同一个 overlayRoot | mount 剩余 AST 比对 |
| transaction updateState 之后 | 同时更新两个 preview，先 link 后 comment，再 onTools/onChange | mount 顺序比对与绘制轨迹 |
| 空 TextSelection / href / comment text | 与原门槛相同，保留 bookmarkLabel 优先和 href 回退；link 在上、comment 在下 | 9 组外部差分绘制轨迹 |
| blur | 原 120ms，四项 activeElement 判断、返回 false 不变 | 函数体 AST 相等；事件 current 是该实例 view |
| EditorView 建好后 | 先首次绘制，再两个 mousedown 和三个 click；所有 click 执行时读取当前 view.state | 五个监听体 AST 相等 |
| onPopEscape、refreshToc 之后 | followScroll 仍仅排除 linkPreview 内部滚动；再安装 resize；无焦点隐藏，有焦点重画，之后 onScreen | 保留原 follow 结构 |
| release 开头 | 先停止 followScroll，再移除 resize；然后入口 hidePop、移除 Escape、移除 pop | stop 函数和 mount 顺序比对 |
| release 末尾 | 最后按 link→comment remove；hidePop 重入 dispatch 时两 preview 仍存在 | mount 顺序比对；Chrome 计划另验 |
| setDoc / view.updateState | 没有新增重绘或 Plugin.update，保持只在原三条路径触发预览更新 | setDoc 及其余函数 AST 相等 |
| 销毁与迟到 blur | 不增加 timer owner、destroyed 标记或旧按钮失效语义；迟到 timer 只持有旧 DOM | 原 blur 函数体与移除顺序 |

外部核对脚本：`check-pages-previews.cjs`（纯提取、入口其余逻辑、公共出口、依赖图）与 `check-pages-previews-traces.cjs`（原绘制函数与去重版本的 DOM/坐标效果，9 种选择/标记场景；动态译文创建顺序）。这些是源码等价证据，不能代替浏览器验收。

资源抵消只做了三处可读的重复消除：三个按钮共用同一创建顺序；两个预览共用坐标读取/放置；一次同步 update 内共用空 TextSelection 门槛。最后一项由原两次 selection 读取变为一次，不声称原函数体逐字相同；已核对中间的 linkAt/bookmarkLabel/coordsAtPos/placeOverlay 均不 dispatch 或等待，ProseMirror selection 在这段同步绘制内不改变，且 link 绘制后仍立即查 comment 并绘制。九组效果轨迹与原版相同。blur/buttons/follow/remove 四个生命周期函数相对纯提取保持 AST 相同。

## 资源预演

预演脚本使用 **P/plugins/native/pages 作为 absWorkingDir**，与包 build 完全相同的 entry、bundle、iife/browser、MolisWorkPagesEditor、minify-whitespace、outfile。通过 esbuild onLoad/onResolve 在原 source 路径替换候选内容，不改变模块身份，不把外部文件的物理路径混进 bundle。

每次配对先断言原源码 raw 与正式 `dist/pages-editor.js` **逐字节相同**，再使用 P 正式 Host 的 `tightenServedJs` 比较 served bytes。脚本只 `write:false`，输出放 D；通过机器 build 槽串行执行。构建、压缩参数和门禁均未调整，不使用其他片的资源额度。

| 版本 | raw bytes | served bytes | 相对正式预算 |
| --- | ---: | ---: | ---: |
| 正式基线 / 配对原源码 | 731,794 | 706,825 | 0 |
| 纯提取 | 732,688 | 707,729 | +904 |
| shared：按钮与坐标去重 | 732,582 | 707,623 | +798 |
| combined：再合并选择门槛，当前候选 | 732,316 | 707,342 | **+517** |

两次配对均断言 raw 与正式 dist 逐字节一致，正式 served 也确认为 706,825 B。预演已释放机器 build 槽。脚本分别为 `preview-pages-previews.mjs` 和 `preview-pages-previews-variants.mjs`，原始数字留在 `pure-bytes.json` 与 `variant-bytes.json`；最终 `bytes.json` 明确 `eligibleForImplementation: false`。

这些职责内去重尚不足以抵消参数化/独立生命周期函数的成本。没有继续引入表驱动框架、改短名称压字节或搬别的职责来抵消；也没有更改压缩器、构建配置、资源上限或申请其他片额度。若后续继续，只能基于主会话新的边界决定；本报告不自动授权生产实施。

## 规模

入口 **804→719 行**，mount **537→451 行**。纯提取预览模块 130 行、最长函数 22 行；当前 combined 模块 **121 行、最长函数 updateEditorPreviews 24 行**，其余最大为 follow 19、create 16、bind 12、blur 9。相对依赖图 56 个模块、无环。最终核对仍确认 P 工作树干净。

## 正式实施前后的验证计划

接受唯一 spec 后，先在正式 PGT 的 706,825 B JS/CSS 上建立两个 Chrome 基线用例；源代码应用之后复跑同一份用例。都经公开 mount 和实际 DOM/CDP，不直接 import 新内部模块。

1. **预览与当前目标**：含两个 link、两个 comment 及重叠标记的真实文档；折叠光标显示标签和上下定位，非空选择及未标记处隐藏。实际 mousedown/click 不丢选择；拦截 window.open 检查当前 href、`_blank`、`noopener,noreferrer`；第二个标记仍复用同一按钮但读取新目标。link 编辑表单及 comment callback/原表单可达，编辑与取消仍走原 pop owner。setDoc 不借此增加立即重画，随后 selection transaction 才显示新文档目标。
2. **焦点、订阅与释放**：pop 表单获焦后超过 120ms 预览仍保留，外部按钮获焦后隐藏。真实滚动/resize 在编辑器有无焦点时分别重定位/隐藏并调用 onScreen，link 内部滚动继续排除。已打开表单时直接调用 handle.release，观察 hidePop 触发的重入 transaction：全局跟随已停止而两个 preview DOM 尚在，之后两根节点消失；再销毁 view。另做带待处理 blur 的 destroy→重挂，旧 timer 不隐藏新预览，旧订阅不继续增加 onScreen，新的预览和按钮仍可用。

复用：`content-editing-regressions.e2e.test.ts` 的 COMMENT-01/CALLOUT-01/TRANSIENT-01，PGT `pages-tools.e2e.test.ts` 的当前文档与 scroll，`context-toolbar-panes.e2e`、`contextual-interaction.e2e` 的 docked/窄屏/等待中选区与候选拒绝；不新增第二份 AI 延迟矩阵。

现有源码定位断言只需将 `tests/pages-plugin.test.ts` 约 2796 行 `followScroll(linkPreview)` 的 owner 改到新模块；onPopEscape 增减监听断言继续留入口。实施允许 editor-browser、新 editor-previews、必要 README、定位断言及一个 pages-previews Chrome 文件；主会话继续负责 shared spec/HUGE/快照、整体构建、正式资源与最终验证。

## 最后一次闭包边界复核（已完成，仍超预算 103 B）

按主会话复核意见，追加一次职责边界更小的候选：唯一导出 `createEditorPreviews(options)`，闭包保有七个 DOM 引用，只返回 `linkPreview` / `commentPreview` 两根节点和 `update(view)`、`blur(view, pop)`、`bind(view, openLink, openComment)`、`follow(view, onScreen)`、`remove()` 五项操作。没有保存 view 字段、getView、Controller 类、额外状态、epoch 或通用注册器；只有原监听回调继续持有绑定时的 view。

入口仍在原 DOM 创建、append、transaction updateState 后、blur、EditorView 初始绘制、按钮安装、Escape/refreshToc 后跟随、release 开始停止跟随、hidePop 后最后移除 DOM 的各时点调用。`follow()` 返回停止函数，入口仍先调用它，再 hidePop，再移除 Escape/pop，再 `remove()`；没有合并原本分开的安装步骤。

实际文件：[闭包候选 diff](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/closure-candidate.diff)、[闭包入口](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/closure-editor-browser.ts)、[保留去重的闭包模块](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/closure-combined-editor-previews.ts)、[纯提取闭包模块](/Users/yijunwang/code/molis-anti-corruption-20261017/pages-previews-planned/closure-pure-editor-previews.ts)。旧自由函数候选原样保留，不覆盖已测版本。

取舍：自由函数方案每次显式传递 DOM 集合，函数可单独观察，但对入口暴露全部内部按钮，并在多个签名重复列举、解构同一组 DOM。闭包把节点所有权收回创建函数，入口只看见挂载所需根节点与操作；重复 DOM 参数和解构消失。闭包中增加五个实例级函数，工厂源码更长：combined 模块 111 行，工厂 89 行；pure 模块 120 行，工厂 111 行，均低于当前 150 行函数阈值。入口仍 719 行、mount 451 行，预览职责完整、无其他职责移入。

逐点等价证据：`check-pages-previews-closure.cjs` 对比两种闭包与各自旧自由函数版，确认 DOM 创建语句完全相等，绘制/blur/按钮/follow/remove 的函数体只变化闭包边界引用；entry 除 import 和调用写法外保持相同。两版各运行 9 组完整生命周期差分轨迹，包括动态替换 translate、选择/空标记/标签 fallback、坐标、五个监听、切换当前文档后点击、五种 activeElement、scroll/resize 有无焦点、stopScroll→remove resize→移除根节点。全部通过；原始代码→纯提取、原始绘制→去重版的既有检查也通过，形成连续等价证据。这些仍是外部源码执行，不是 Chrome 实操或正式类型检查。

资源预演由 `preview-pages-previews-closure.mjs` 使用相同模块身份与生产参数，机器 build 槽串行执行；同时测基线、closure-pure、closure-combined，并继续断言基线 raw 与正式 dist 逐字节相同。不调整构建、压缩器或资源额度。


闭包配对已完成，机器 build 槽已释放。原源码 raw 与正式产物逐字节相等，served 仍为 706,825 B；数字与 bundle 保存在 `pages-previews-planned/closure-bytes.json` 以及 `closure-pure.js` / `closure-combined.js` 和对应 `-served.js`。

| 边界 / 版本 | raw bytes | served bytes | 相对正式预算 |
| --- | ---: | ---: | ---: |
| 正式基线 / 配对原源码 | 731,794 | 706,825 | 0 |
| 原自由函数 pure | 732,688 | 707,729 | +904 |
| 原自由函数 combined | 732,316 | 707,342 | +517 |
| 闭包 pure | 732,240 | 707,286 | +461 |
| **闭包 combined，实际最小候选** | **731,897** | **706,928** | **+103** |

闭包边界使 pure 减少 443 B、combined 减少 414 B，但仍没有满足既有资源上限。**按主会话明确的停止条件，不再更换写法、压短名字或移入其他职责；不修改生产工作树，不把 103 B 当作可以忽略的差额，不建议在现有预算下实施。** 上述候选与检查脚本都保留，供主会话审阅或未来明确的新决定使用。正式实施验证计划保持有效，但未启动；没有执行整体 build、Chrome 或正式类型检查。
