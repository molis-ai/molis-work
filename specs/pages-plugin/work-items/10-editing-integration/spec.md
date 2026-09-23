# WI10 Pages 连续编辑与无损转换

完成等级目标：4 内部完整（当前列出的编辑路径）。延续 WI9；不以函数测试数量宣称整体达到 Notion。

depends_on: 09-notion-parity

## 目标与证据

2026-09-23 浏览器真实键入 `**bold**`、`[ ] ` 后仍显示原字符。InputRule 回调收到的 state 尚未包含本次输入，但现有 markdown 命令只读旧 state，因此纯函数测试通过也无法保证实际触发。`convert.ts` 只抽取列表项首段和容器直属文本，转换时会丢失嵌套子块。另确认：分栏内选局部文字转标题会错误选中祖先而清空分栏；连续链接被粗斜体拆分后仅修改一截；多项取消缩进将尾项移到前面；嵌套复制光标落到文末。Slash/提及菜单仅监听 mousedown，原生键盘 click 没有动作。桌面标题与正文左缘相差 24px。

实际 UI 继续发现 ProseMirror 缺少 `white-space: pre-wrap`，浏览器把输入空格改成 NBSP，导致 `[ ] ` 连续输入仍不触发；同时控制台有对应编辑器警告。修复基础文本排版，而不是额外兼容错误空格。

浏览器验收还复现 Cmd+K 同时打开链接弹层和工作台搜索：外层 window keydown 没有尊重内层的 defaultPrevented。只在工作台键盘路由入口补已有事件消费/输入法判断，保证 Pages Cmd+K/Cmd+F 留在正文。

拖拽实测：指向 Callout 第二段前时仍判在整个 Callout 前。原因是父容器用包含所有子块的总高度计算命中中线，遮住了子行落点。改为父容器只占到首个可见子行之前的命中区域，子行独立接收落点。

390px 窄屏实测：格式栏已换行且不超屏，但第一行落在工作台编辑区域上方，被其 overflow 边界裁切。弹层改为在实际 stage 可见矩形内选择上下位置并限制大小，不能只用整个 viewport。

## 范围与方案

- 将真实 InputRule 接线抽到 `input-rules.ts`，在同一 transaction 内按实际 input from/to/text 纳入待输入内容后执行现有转换。跨 inline atom 的语法保留字面文字；行内 code mark 正确声明 code 语义。保留 marks、光标、后续文本和撤销。代码围栏在 Space 或 Enter 后确认语言，避免第三个反引号提前转换导致无法输入语言。
- 转换保留子块和嵌套顺序、inline marks 与元数据；源节点无法安全转换时不改文档，菜单禁用该选项。单块/多块使用同一无损转换语义。
- Slash/提及菜单同时支持鼠标、Enter/Space 原生按钮激活；上下键高亮时不反复重建同一菜单；菜单关闭后回到编辑器，输入法确认键不被抢占。
- 新建文档后直接选中标题可改名，Enter 进入正文；校准标题与正文对齐；窄视口格式栏可用且不出界；使用现有 token、阴影和 reduced-motion。
- 修改 Pages 编辑器及其测试、当前 spec；工作台仅补键盘事件消费边界。保留工作区其他改动；不扩展 AI、同步、发布或其他插件。

## 场景与验收

1. 逐字符输入粗体/斜体/删除线/行内代码/Markdown 链接、URL 后空格、待办、引用、分隔线能转换；光标可继续输入，Backspace 撤销输入规则，Cmd+Z 可撤销；代码内保持字面文本。
2. 输入代码围栏与语言再按 Space 或 Enter 得到正确代码语言。
3. 含子列表、第二段、嵌套 Callout 或图片的块转换不丢内容；不能表达的目标拒绝，允许的目标保存结构和 marks。转换自身不重置属性。撤销恢复原文档。
4. Slash 从空白打开、过滤、鼠标选项与键盘激活、无结果/Escape 均可继续写；块转换/复制/删除/排序/嵌套可用。
5. 选中文字后格式、链接提交与取消能返回原选区；菜单和格式栏在窄视口内可达；标题正文对齐。
6. 真实 UI 编辑后保存刷新仍在；旧 Pages 测试回归通过。只对本次具体场景给通过/未运行/失败，不扩大完成声明。

## 边界与并行

主 Session：floating.ts、tests/pages-drag-target.test.ts、apps/workbench/src/scripts/client/initialization.ts（键盘事件消费边界）、schema.ts（code mark 标识）、client.ts、input-rules.ts、editor-browser.ts、styles.ts、en.ts、tests/pages-input-rules.test.ts、当前 spec。
独立 writer：convert.ts、必要的 conversion 调用点（需告知主 Session）、tests/pages-conversion.test.ts；不得动 editor-browser、styles、旧 tests。
独立 writer 同时修复连续链接范围、取消缩进顺序和嵌套复制光标，并补相应回归。代码块转换按原语义去除行内样式，但保留文字和换行；其他转换保留样式。

API/Store 不改；依赖现有 ProseMirror，无新库。

## 验证命令

`pnpm --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench build`

`node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts tests/pages-input-rules.test.ts tests/pages-conversion.test.ts tests/pages-drag-target.test.ts tests/pages-draft-race.test.ts`

浏览器：本地 4179 验证 home；键入而非直接注入格式化 doc，操作后读 DOM/保存状态并刷新。宽/窄视口截图和控制台错误同批检查。

## 开放问题与结果

2026-09-23 完成本 WI 实现；目标范围内的核心路径已达到可内部试用。工程验证与真实操作分开记录，一骏本人尚未验收，不宣称整套产品全面等同 Notion。

| 验收 | 结果与证据 |
| --- | --- |
| 1 连续输入与恢复 | **通过**。测试调用实际 `handleTextInput`，覆盖逐字符格式、链接、URL、清单、引用、分隔线、输入替换范围、行内 atom/code、Backspace、撤销/重做。浏览器实际键入粗体、清单、分隔线，验证继续输入、撤销；中文正文可连续写。真实操作没有覆盖所有输入法。 |
| 2 代码围栏 | **通过**。测试覆盖 Space/Enter、语言与代码内字面内容；浏览器键入围栏与 js 后回车，生成 JavaScript 代码，保存后刷新仍为 `const ready = true;`。 |
| 3 无损转换 | **通过**。生产命令测试覆盖子列表、第二段、图片、Callout、marks/note、拒绝有损目标、同类型属性与撤销。浏览器转换父列表为标题后两条子项仍在；分栏内局部文字转标题只改当前栏，撤销恢复。 |
| 4 菜单与块操作 | **通过**。浏览器实操 Slash 过滤/Enter/按钮原生 Enter/无结果/Escape，Tab 与 Shift+Tab，嵌套块复制/删除后的光标，段落拖到 Callout 前及两段之间。最后一次真实拖拽确认嵌套落点，刷新后顺序保留。 |
| 5 选区、弹层与视觉 | **通过**。混合粗斜体的四段连续链接一起更新，非法地址展示错误；Cmd+K/Cmd+F 不再打开工作台搜索。390px 视口格式栏全行可见，加粗与文字色可组合，取消链接回到原选区，样式可撤销。桌面标题/正文对齐；浅/深色截图检查；模拟 reduced-motion 后动画为 none、transition 为 0s，模拟设置已恢复。 |
| 6 保存与回归 | **通过**。真实保存刷新后，嵌套段落、四段同址链接、任务列表、标题与代码保留。Pages 与 Workbench 构建通过；上述命令 **139/139** 通过；scoped diff whitespace 检查通过。 |

构建期间另一任务清理/重建 workspace dist，曾短暂出现 plugin-builder/Contracts/Workbench 产物缺失；依赖产物恢复后同一正常构建和测试命令全部通过，未改动其业务实现。

浏览器实操使用隔离的 `/tmp/molis-work-pages-verify-home`，预览服务在 `http://127.0.0.1:4179`。保留《Pages · 结构与链接验收》和《Pages · 验收通过稿》用于复核。控制台仅保留修复前的 pre-wrap 历史警告，修复后未新增错误或警告。

**未运行**：原生 WKWebView、其他浏览器、真实系统输入法的候选词交互、发布安装/升级。未作性能基准；以上 Chromium 实操证据只覆盖列出的路径。未发布、未提交 Git；保留工作区原有与其他任务并行改动。
