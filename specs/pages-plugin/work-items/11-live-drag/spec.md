# WI11 实时拖拽排版

目标：拖动行时就看见真实重排；相邻内容顺滑让位、嵌套/分栏即时换行，松手自然落位。完成程度为当前路径可内部试用，工程、浏览器实操与本人验收分开记录。

depends_on: 10-editing-integration

## 证据与方案

现状：hoverHandlePlugin 的 pointermove 只更新 ghost 和 drop-line；previewSpan 已计算真实合法目标 doc，但没有用于渲染。主编辑器每次 docChanged 都触发保存，因此不能把中间状态直接写入主 view。

在拖动期间挂一个 inert、只读的排版预览，共享现有 schema/NodeView，主文档及选区不变。每个合法 gap/level 用 previewSpan 的 doc 更新预览，按块前后位置做短时位移动画；被拖块变为真实尺寸空位，浮动内容跟手。嵌套和分栏采用真实排版而不是假设固定行高。命中使用起拖时未变形几何加滚动偏移，避免动画反向改变目标。pointermove 合并到 animation frame，仅目标变化重排。松手提交一次，隔离撤销；取消不写正文。

预览的 chrome 只保留排版装饰，不接主编辑器的临时输入 owner/销毁钩子；不可编辑原子块复制现有呈现，避免重复加载。复制块可能复用同一个 ProseMirror Node：起拖时为各出现位置建立独立内存节点，文档内容完全相同且不加持久化 ID。映射先全局保留精确身份，再匹配重建容器，避免父容器抢走唯一子段的空位。提交前后均设置历史分组边界，紧接的输入单独撤销。

动作反馈：让位约 180ms ease-out，落位约 150ms；拖动副本无跟手延迟。不加动画库。减少动态效果时立即更新排版和落点，不播放位移。

## 边界与验收

- 允许修改 editor-browser.ts、styles.ts，新增拖动呈现模块和定向测试；本 spec。移除旧测试中仅检查已替换 drop-line 实现名称的断言，保留行为断言。复用 reorder.ts 的合法性与 moveSpan 语义，不更改文档协议、持久化、菜单或其它插件。
- 单块、多块、列表父子、Callout、分栏都使用同一真实预览。父子动画扣除祖先位移，不重复移动。预览不得执行编辑操作或抢焦点。
- pointerup 处理末帧；Escape/pointercancel/丢失 capture/失焦/销毁清理；拖动中正文由别的动作改变时取消旧预览。原位或非法落点不提交。
- 接近编辑区上下沿时连续自动滚动；窄屏保留可抓取握把及触摸拖动，握把位置按实际正文边距收紧。
- 验收：按住时正文已让位且有可观察的中间动画；真实 doc/保存未变；松手预览与提交一致；一次撤销恢复；反向拖动、取消、嵌套/分栏、多块、滚动、窄屏和 reduced-motion 无残留。

## 验证

`pnpm --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench build`

`node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts tests/pages-input-rules.test.ts tests/pages-conversion.test.ts tests/pages-drag-target.test.ts tests/pages-drag-preview.test.ts tests/pages-draft-race.test.ts`

在 4179 隔离测试 home 用真实 pointer 按住/移动/松手，检查中间排版、取消、最终保存、撤销及刷新；桌面/窄屏和 reduced-motion 同批验证。保留工作区现有及其他任务的改动。

## 结果

2026-09-23：已实现，当前路径可内部试用。一骏本人尚未验收；以下是真实浏览器操作与工程证据，不替代本人对手感的评价。

| 验收 | 结果与证据 |
| --- | --- |
| 按住时实时排版 | **通过**。按住拖动，预览顺序从 P/H2 变成 H2/P，主编辑器 DOM 顺序仍为 P/H2。反向拖动读到 heading 的 translateY -44px 中间状态；移动结束 transform 恢复 none。 |
| 真实尺寸与嵌套 | **通过**。拖进 Callout 时预览已包含被拖段，主 Callout 仍无此段；空位宽度从 636px 变成 576px。跨到标题右侧时即时成为两栏，段落宽 262px、高度从 27.2px 增到 54.4px，文字真实换行。 |
| 多块与跟手 | **通过**。两行选中后，两个空位和数量 2 同步显示，列表整体让位；松手顺序为 UL/P/H2。握住第二行仍保持整组原有抓取偏移（指针 y438，组顶 y353），不会跳到第一行。 |
| 提交、保存、撤销 | **通过**。松手后无 preview/source 隐藏残留，预览与最终结构一致；分栏一次撤销恢复。多块落位显示已保存，刷新仍为 UL/P/H2。生产 commitDrag 测试验证只发一次 docChanged，拖前输入保留，拖后输入先单独撤销，再撤销移动。 |
| 取消与动态效果 | **通过**。Escape 恢复原顺序、空位/ghost/拖动 class 清空；窄屏边缘滚动后取消同样恢复。减少动效时预览仍更新，所有行 transform 为 none。模拟设置已恢复。 |
| 窄屏与滚动 | **通过**。390px 握把可抓，位于 x26–48、正文从 x52 开始。按住靠近底边，scrollTop 从 48 连续增长到 273.6，仍有合法空位。 |
| 工程 | **通过**。Pages、Workbench 构建通过；Host 及其依赖顺序重建通过。定向新测试 5 项；完整所列回归 **147/147**。scoped diff whitespace 检查通过，最终浏览器无错误或警告。 |

代码审查发现并修复：只读预览的临时输入 owner 泄漏；唯一 Callout 子段映射被父容器抢占；拖后输入合并进移动的历史组。补充了共享对象的复制块单独拖动回归，验证空位仍属于正确副本且最终内容与生产移动一致。

工作区其他任务更新 Cognia/Characters/Work 的依赖时，曾导致 Host 适配器/类型产物不同步；按依赖顺序重建后恢复，未改其业务实现。隔离验证 home 仍为 `/tmp/molis-work-pages-verify-home`，服务 `http://127.0.0.1:4179`，保留《Pages · 结构与链接验收》用于体验。

**未运行**：真实触屏/原生 WKWebView、多浏览器及长文档性能基准；pointercancel、丢失 capture、窗口失焦和销毁的分支已接清理，但未逐项注入浏览器故障。未发布、未提交 Git，保留工作区其它成果。
