# Pages 下一片：编辑器工具定义与选区投影（只读建议）

状态：规划完成，未修改 P；依赖 PGK 正式构建、浏览器回归和资源门禁被主 Session 接受。P = `wt-pages-commands`，当前候选 `mount` 568 行、入口约 856 行。本文不替代 accepted spec，不授权执行。

## 候选与建议

| 候选 | 真正职责与预计收益 | 依赖/代价 | 建议 |
| --- | --- | --- | --- |
| 工具定义与选区投影 | 14 项编辑器工具的定义、分组、pressed 状态、选区矩形；含 heading/list 命令构造。约移出入口 60 行、mount 35–40 行 | 只读当前 view/state，命令本身沿用；无生命周期、缓存、异步依赖 | 下一片。入口可降至约 800 行附近，mount 仍明确未完成 |
| 文档派生内容（TOC/calendar） | 目录与日历两个 Plugin 的投影和重绘，约 100 行入口 | 有 DOM 渲染/目录事件、当前日期；不减 mount；静态导出已有 `card-content.ts`，不能把活 view 逻辑混入那里 | 后续可独立做，收益主要是入口 |
| 链接/评论预览 | 两个 DOM、放置、点击、失焦、滚动/resize、销毁 | 当前与 pop、EditorView 初始化、120ms blur 回调、onScreen 及 release 同时耦合；若整个抽出会引入新拥有者或较宽接口 | 不作下一片，先保留原生命周期 |

不把整个 pop/AI 处理搬成控制器。`popToken`、`popRequest`、`docked`、`hidePop` 与候选结果有效性是一组现有状态，不能拆成第二个 epoch 或文档缓存。

## 最小完整边界

新增 `plugins/native/pages/src/editor-tools.ts`，只接入三类函数：

1. `editorToolDefinitions(translate)`：在 mount 原 toolDefs 位置调用；保留原 14 项顺序、字样、icon/glyph、panel 值和命令工厂。`headingCommand`、`dispatchList` 随定义迁入。
2. `editorToolGroups(view, definitions)`：从传入 view 的当下 state 读 `from/to`、`listKindAt`、`headingLevelAt`、`markCovers`；返回原三组、collapse 值、项目字段和 pressed/opens 规则。
3. `editorSelectionScreen(view)`：原 coordsAtPos(from/to) 和四个 Math.min/max，返回原四字段。

内部 ToolDefinition 类型放新模块，不从 `editor-browser.ts` 或包入口导出。`commandToggle` 仍由 PGK 的 `editor-keyboard.ts` 提供（原来 toolbar 已从那里取），不复制算法、不再搬它。依赖方向：entry → tools → keyboard/commands/schema/view-ui；新模块不可反向 import entry。

mount 只保留 `const toolDefs = editorToolDefinitions(options.translate)`、三处简单 glue（tools/screen 包装与现有 runTool）、原来的 EditorView/弹层回调。`runTool` 原六行就地保留，按 id 查定义后直接路由 `openTone/openLink/openComment` 或 run+focus；不为了搬这六行新增 panel port/controller/返回意图协议。

toolDefs 创建的时刻不变，translate 调用次数/顺序不变，不改成模块级常量、不延迟到 view 初始化后。tools/screen 每次调用都传现有 `view`，不保存 state，不用 getView，不引入事件监听或缓存。保持现有 `setDoc` 更新 view state 的语义，不顺手增加 onTools/onChange 调用。

入口 public export 声明与 PagesEditorHandle 形状全部不变；新模块函数是内部依赖。预计新模块约 95–115 行、最大函数约 25 行；数字需用正式 AST 门禁确认，不能凭估算称通过。

## 允许路径与冻结范围

writer 候选允许：新 `src/editor-tools.ts`、`src/editor-browser.ts`、Pages README、必要时 `tests/pages-plugin.test.ts` 的旧 owner 定位，以及新 `tests/pages-tools.e2e.test.ts`。现有其他浏览器测试只复用，不因这片扩大改动。

主 Session 串行维护：同一 accepted spec、HUGE 清单、快查 baseline、page-assets 数字和阶段状态。共享合同、SDK、actions、package.json、bundle/minify 参数、公共 CSS、Dataset/PPT 文件一律不动。未发现 pages-plugin 对 toolDefs/toolGroups/headingCommand/dispatchList 的旧源码定位断言，预计无需修改该测试；如实际失败，逐条检查原断言目标后再决定。

## 必须保留的可观察行为

- 顺序固定：marks = strong/em/underline/strike/code；blocks = h1/h2/h3/ul/ol/task；insert = tone/link/comment。前两组 collapse=overflow，第三组 never。只有 run 工具有 pressed，panel 工具只有 opens=panel；字段可选性不改。
- pressed 继续按覆盖整段/所在列表/标题级别计算；不把“部分有 mark”改成选中，不用 storedMarks 代替现有空选区语义。
- 已知工具 run 使用调用时 current state 与绑定后的 view.dispatch，再 focus；未知 id 原样无动作且不抢焦点。三个 panel 分支保持既有弹层、focus、冻结选区与外部 onComment 语义。
- 每次 transaction 的顺序仍是 apply → updateState → 两预览 → onTools → docChanged 时 onChange；tools() 是读，不派发交易/通知。screen() 是读，不派发通知；滚动/resize 的 onScreen 仍由原 reposition 发。
- setDoc 后 tools()/screen()/runTool 立即使用新文档；destroy/remount 不让新 handle 的工具动作修改旧文档。生命周期现有行为不借此次修复或增强。

## 验收与证据建议（编号由 accepted spec 定）

在改生产源码前，以已接受 PGK 正式 JS+CSS 建新 Chrome 基线；测试从公开 `MolisWorkPagesEditor.mount` 取 handle，用现有 CDP/browser fixture，不 import 新模块。三组足够：

1. **定义与动态状态**：完整比较 3 组/14 项公开输出的 id/label/glyph/icon/collapse/pressed/opens；使用简单 translator 验调用时机。选择全标粗段、部分标粗范围、标题、列表，按独立期望检查 pressed；调用 tools() 前后文档与 onChange/onTools 计数不变。通过 DOM 选区或公开 handle 的现有 Selection 构造选区，不从新实现导出测试钩子。
2. **命令与路由**：runTool 加粗、标题、列表后检查实际 doc JSON、选区邻居、onChange、焦点与 Undo；未知 id 检查文档/通知/焦点不变。tone/link/comment 分别验证打开原 UI 或外部 onComment 回调；至少一个表单通过真实点击完成修改再关闭，证明路由进入原 owner，而非只看到节点。保留已有键盘测试验证共享 commandToggle 路径。
3. **当前状态与矩形**：setDoc 后选新段并调用 tools/screen/runTool，检查新 doc 与新选择。对两端可见选区测矩形有限、顺序正确且覆盖两端 DOM Range 区域（像素容差，不直接重复 coordsAtPos 实现计算期待）；滚动后变化方向与数值、重新选择更新。destroy/remount 新动作不改旧 doc。

已有真实工作台证据复用：`tests/context-toolbar-panes.e2e.test.ts` W2-05 覆盖 mark→pressed 与 Mod-K docked panel；`tests/contextual-interaction.e2e.test.ts` 1440/390 覆盖实际 toolbar、响应式、selection 改变及异步冻结结果；`tests/pages-keyboard.e2e.test.ts` 覆盖 commandToggle/heading/list 的键盘旁路。`tests/context-toolbar.e2e.test.ts` 主要测组件规格板，不能单独证明 Pages 工具接线。

定向基础检查：Pages 两套 typecheck、新增源码/test scoped lint、`tests/pages-plugin.test.ts`、diff check、依赖图无环、入口 public 声明等价。正式生产候选冻结后，由主 Session 取得机器构建/Chrome 时段，整体 `pnpm build`、相关正式浏览器用例、结构/资源门禁；不并发构建、不在主 Session 测试时改源码。

## 资源与执行次序

PGK 外部预演 706848 B 只作线索；本片正式基线必须用主 Session 最终接受的 PGK served bytes，不能拿 raw esbuild 数字。新模块纯搬移也可能增加 wrapper/符号字节；本计划没有跑 esbuild，**资源可行性未验证**。

accepted spec 后先在 D 做纯迁移候选并做一次同链路字节预演，再安排基线 Chrome 和生产实现；如超过已接受基线，先报告差值与代码成因，由主 Session 决定同职责内有证据的等价表达或改选下一候选。不得用此前 headroom、其他资源缩减、压缩参数变化或门禁改动抵账；也不因资源卡住把工具定义拆成难维护微型表。

完成判定：职责落在独立模块，原公共合同/生命周期/行为有上述证据，入口与 mount 实测下降，新函数/文件无巨大单元且 served bytes 不增。本片仅减少一个职责，不能将整个 Pages 入口治理或 W5/W6 标为完成。
