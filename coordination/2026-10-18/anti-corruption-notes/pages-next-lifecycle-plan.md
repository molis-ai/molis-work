# Pages 下一片：链接与评论预览层

状态：只读计划，等 PGT 正式验收后由主 Session 决定下一份 accepted spec。未改 P、未做候选或资源预演、未运行 build/Chrome。当前 mount 537 行。

## 推荐边界

将**链接与评论预览的 DOM、当前位置绘制、按钮行为、blur 隐藏、滚动/resize 订阅与节点移除**归一个内部 `editor-previews.ts` 函数模块。入口继续掌握现有装配与释放的各个时点。它是完整的预览职责，不只是搬两段绘制函数；预计 mount 可减少约 85–100 行，正式数字待实现，不以跨过入口 800 行为目标。

不用新的 ProseMirror Plugin，也不做 `PreviewController`、返回一套方法的对象、getView、第二份 selection/state 或模块级 registry。传递的 `PreviewElements` 只是七个已创建 DOM 节点的只读引用（link/comment 容器、label/text 和三个按钮），不含 view、doc、选区或生命周期状态。既有按钮和 scroll 回调继续捕获本次 mount 的固定 view 引用，回调执行时读它的 state；没有新增可变的 currentView 缓存。

TOC/calendar 可作为资源不满足时的后续独立备选：它们已有 Plugin 生命周期、依赖清楚，可减约 100 行入口，但几乎不减 mount。它不能替代当前 mount 职责拆分，不优先做。

## 内部接口与装配时序

内部模块导出以下专用函数，不从编辑器公共入口再导出：

```ts
createEditorPreviews(translate?: Translate): PreviewElements
updateEditorPreviews(view: EditorView, previews: PreviewElements): void
handlePreviewBlur(view: EditorView, previews: PreviewElements, pop: HTMLElement): false
bindEditorPreviewButtons(view: EditorView, previews: PreviewElements,
  openLink: (view: EditorView) => void, openComment: (view: EditorView) => void): void
followEditorPreviews(view: EditorView, previews: PreviewElements,
  onScreen?: () => void): () => void
removeEditorPreviews(previews: PreviewElements): void
```

这几个调用点刻意保留，不能压成一个“初始化/销毁”控制器：当前已有操作在中间穿插，合并会改时序。

| 原位置 | 替换后仍在原位置执行 |
| --- | --- |
| `host.replaceChildren()` 后，toolDefs 前 | create 两预览 DOM，三个译文仍为 打开→编辑→编辑；不要提前 append |
| toolDefs 创建后、pop 创建前 | 入口将两个 preview root 按 link→comment 原顺序 append 到原 overlayRoot |
| dispatchTransaction 的 updateState 后、onTools 前 | update 仍先 link、后 comment；onChange 条件不动 |
| handleDOMEvents.blur | 当前事件给的 view 传给 blur helper，返回 false，保留 120ms 延迟 |
| EditorView 构造后、onPopEscape 注册前 | 首次 update，然后 bind 五个原 DOM 监听（两个 mousedown、三个 click） |
| onPopEscape 注册、refreshToc 之后 | follow 安装原 followScroll(link root) 与 window resize，返回停止二者的一个函数 |
| release 开头 | 调停止函数：先 stopScroll、再 remove resize；随后还是 hidePop、移除 onPopEscape、pop.remove |
| release 末尾 | remove 依次移除 link/comment root；destroy 仍在 release 之后调用 view.destroy |

update 内部保留两个短绘制函数，允许共享确实相同的坐标/放置小函数；创建函数和各生命周期函数都可小于 40 行，模块预计 130–180 行，无需新类或长工厂。bind 不新加显式 DOM listener registry：原来按钮监听随被移除节点回收，继续此行为。停止全局监听与移除 DOM 分开，正是为了保留 pop 清理夹在中间的既有顺序。

## pop/AI 的唯一 owner

本片让 `popToken`、`popRequest`、`docked`、可重赋值的 `hidePop` 继续共同留在入口原闭包中，保持一个 owner。preview 模块只拿 pop 元素做 blur 的 contains 检查，不得到 token/request、不操作冻结范围，不拿 runAi/openPanel，也不负责 pop 的 Escape 或销毁。

当前调用链是：showPop 先调用旧 hidePop，再通过 ownPagesTransient 注册本次 clearPop；clearPop 隐藏并清空 DOM、增加 popRequest、释放唯一 popToken、退出 docked、归还 stage 并按原条件恢复焦点。AI 请求在 prepare 与 runAi 的每次 await 后核对同一个 popRequest；候选采用沿用同一个冻结 token 的映射与 intact 结果。`setDoc`/`destroy` 经原 endPagesTransients 触发这条清理链。

以后若拆 pop，应将上述四个变量、show/clear/hide/anchor/place/reclaim 与异步请求有效性作为一个状态所有权整体处理，表单构造和候选绘制可依赖它；不要先单独搬 runAiCommand 再加 AI epoch，也不要为跨模块取 view 增加 getter。那是下一项需单独定义的边界，本片不预造 ports 或状态类。

## 必须保留的行为与真正风险

1. **绘制时机**：`setDoc` 当前直接 updateState，不调用两预览绘制；直接调用公开 view.updateState 也是如此。改成 Plugin.update 会新增这些时刻的绘制，还会将普通 transaction 的绘制提前到其他 plugin updates 之间，因此不采用。新测试应在原会触发重绘的选择 transaction 后判断新内容，不借拆分添加 setDoc 立即隐藏/重画的新语义。
2. **释放重入**：hidePop 里的 releasePagesFrozen 可 dispatch transaction，原来这时全局 scroll/resize 已停止、两个预览 DOM 尚未移除。合并为提前 remove/销毁预览会改变重入时可见的节点与测量，必须保留上述两段释放。
3. **选择和焦点**：仅空的 TextSelection 显示预览；link 有 href 才显示且 bookmarkLabel 优先，comment 有 text 才显示；两个可同时出现。link 上方、comment 下方，使用当前 found.from/to 的原坐标。按钮 mousedown 仍 preventDefault，打开/编辑时重新读取当前 state，不能捕获上次 found。
4. **blur 与 scroll 不同**：120ms 后才检查 activeElement；只要焦点在任一预览、pop 内或 view.dom，就不隐藏。scroll/resize 则看 view.hasFocus，不在编辑器即隐藏，但仍调用 onScreen。不能统一成一个“是否活跃”标志。followScroll 仍只排除 linkPreview 内部滚动，不偷偷扩大到两个预览。
5. **现有计时器边界**：blur timer 当前没有保存/取消 handle，晚到时仅操作旧 DOM 引用。本片保留，不新建 timer owner 或 destroyed 标记。用重挂验证旧延迟回调不隐藏新预览；不宣称原来保留的 detached button handler 会自动失效。
6. **译文与公开合同**：DOM 创建顺序和三个翻译调用时点不变，不能搬到 view 构造后；27 个公共出口、PagesEditorHandle、options、插件数组、schema/存储/动作保持。

## 最小验证

先在正式 PGT 资源建立两组新 Chrome 基线，再应用提取；仍从公开 mount 和正式 JS/CSS 操作，不导入内部新模块。

- **预览及当前目标**：一个含 link/comment 的文本夹具，光标进入后验证文字与相对 DOM Range 的位置；非空选择、无标记处隐藏。真实 mousedown/click 保持选择，link 打开捕获到当前 href 与原 `_blank`/`noopener,noreferrer` 参数，编辑进入原表单，comment 编辑进入原 callback/表单。移动到另一个标记再点击同一按钮，证明读的是当前目标。调用 window.open 用夹具记录参数，避免真实外跳。
- **焦点、订阅、释放**：编辑表单获焦后经过原 blur 延时预览仍保留；外部按钮获焦后隐藏。真实滚动/resize 在有无编辑器焦点时分别验证重定位/隐藏与 onScreen；destroy 后旧 onScreen 计数不再随全局事件增加，两个旧 DOM 被移除。含待处理 blur 的销毁/重挂后新预览和点击可用，不重复监听。关键断言只覆盖这条生命周期，不造全编辑器矩阵。

复用 `content-editing-regressions.e2e.test.ts` 的 `W2-18-PAGES-COMMENT-01`（原评论范围映射、旧表单不能写 B）、`W2-18-PAGES-CALLOUT-01` 和 TRANSIENT-01；复用 PGT tools 的当前文档/scroll，以及 `context-toolbar-panes.e2e`、`contextual-interaction.e2e` 的 docked panel/窄屏/等待中选区与候选拒绝，证明 pop/AI owner 未受影响，不新增一份 AI 延迟夹具。

静态对照需要逐项核对原两个绘制体、五个 DOM 监听、120ms blur 四项焦点判断、followScroll 排除对象、resize/onScreen 顺序及 release 两段位置；公共声明/其余 mount/插件数组 AST 保持、依赖无环。现有源码定位仅发现 `pages-plugin.test.ts` 约 2796 行的 followScroll(linkPreview) 需迁到新 owner；约 1721–1722 行 onPopEscape 的增加/移除断言仍应留入口，不能跟着迁错。

允许源码为 editor-browser、新 editor-previews、README、上述必要定位断言及一个新 pages-previews Chrome 文件；不碰 editor-transient/focus/shared floating 的实现，也不修改 pop/AI 表单逻辑。主 Session 继续拥有 shared spec/HUGE/快照、整体 build、最终相关测试与门禁。

## 资源可行性预期

尚未预演，不能承诺下降。纯参数化会增加函数调用与 DOM 引用字段，预计存在先增长的可能；本职责内可读的抵消空间只在两个预览重复的选择判断、坐标/放置、隐藏与三个按钮的创建，需实际量出才决定，不用表驱动框架或短名压字节。共享前必须逐项证明原读取、显示/隐藏与调用顺序等价；若资源约束仍不满足，停在外部候选报告差值，不调整门禁/压缩器、不借其他片额度。

建议待 PGT 正式验收后，先按这一个职责做 D 外部候选和同工作目录的原源码/候选配对预演（原源码 raw 必须等同正式 dist）；资源可行后再接受生产 spec、建立上述 Chrome 基线并实施。预算是届时正式 PGT served bytes，不能使用先前不同工作目录产生的 9 B 差异。
