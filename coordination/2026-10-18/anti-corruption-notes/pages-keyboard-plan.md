# Pages 键盘拆分方案

状态：只读方案，尚未授权实现。2026-10-18，Pages 负责人 Codex（pages_handle_writer）；主会话负责收尾 PGP、接受下一片唯一 spec 与最终验证。本文件为交接材料，不替代 `specs/repository-anti-corruption/spec.md`。本轮读取 P 的当前源与既有测试，没有改 P，没有构建或运行 Chrome。

## 下一片结果与范围

建议把 Pages 的自定义键盘命令装配迁到一个内部模块 `editor-keyboard.ts`，其中按职责分成三个短键表构造函数，并移动它们专用的短命令助手；入口只在原插件位置调用装配函数。目标仍为功能可用、行为保持。公开 27 个出口、文档/存储/动作合同、插件顺序、输入法、弹层 owner、dispatchTransaction 和资源门禁不变。

本次实测当前自定义对象有 **37 个绑定，164 行**（入口 644–807 行）；加上 mount 内 20 行 turnCurrent，才接近先前估计的 190 行。当前 mount 752 行。本片预计减少约 180 行，仍有弹层、AI、工具和装配，不代表整个 W5-10 完成。最终用正常格式 AST 计量，不以本估算验收。

不拆为三个 ProseMirror keymap 插件；保持原来一个自定义插件、同一位置。三个键表构造函数无持久状态，合并一次后仍交给现有 `keymap`，不建立新监听、当前 view 缓存、getView、selection 副本或控制器。也不把 164 行对象原样塞进另一个巨函数。

## 模块与职责

优先一个新增文件即可，不为 37 个绑定增加多层模块。

| 内部单元 | 现有连续范围 | 大约大小与职责 |
| --- | --- | --- |
| `shortcutKeys(openLink)` | Mod-z 到 Mod-Shift-9，22 项 | 当前 60 行，改为使用事件 view 后预计低于 90；撤销/重做、复制剪切、行内格式、链接/查找、软换行、复制块、待办切换及块类型快捷键 |
| `blockKeys()` | Enter 到 Mod-a，5 项 | 当前 38 行，预计低于 50；正文编辑、删除回退、清格式及逐层全选 |
| `navigationKeys()` | Mod-Shift-ArrowUp 到 Shift-Tab，10 项 | 当前 64 行，预计低于 85；移动块/列、光标/原子节点边界、表格/代码/列表/容器 Tab |
| `pagesKeymap(openLink)` | 新增薄装配 | 约 5 行；按上述连续顺序合并三个对象，调用一次 keymap。每次 mount 创建一份，避免把原每实例对象变成共享可变常量 |
| `turnCurrent(view, id)` | 原 mount 内函数 | 原 20 行；改为显式当前 view 参数，算法和返回保持 |
| `applySelected`、`nudgeTableColumn`、`cellNav` | 原入口模块级函数 | 原 5、9、19 行；均只由此次键表使用，完整迁移 |
| `commandToggle` | 原入口模块级函数 | 原 15 行；键盘和 toolbar 共同使用，内部导出，入口导入同一实现，不复制一份 |

`commandToggle` 是编辑器 UI 命令适配器，继续调用已有 commands 和 hover selection；它既供快捷键也供 toolbar，放在本内部模块不意味着 toolbar 经键盘事件运行。不要改 `headingCommand`：它供工具栏使用，当前不属于键表拆分。

新模块预估约 260–310 行；每个构造函数、命令和回调均低于 150 行，不新增类。仅依赖 commands、schema、input-rules、table-edit、editor-block-selection、editor-find 及现有 ProseMirror 包；不 import editor-browser。入口依赖新模块，既有选择/查找模块不得反向引用。

允许路径建议：上述新模块、editor-browser、Pages README、受影响的 pages-plugin 定位断言、新 `tests/pages-keyboard.e2e.test.ts`。若一个助手确实被别的生产模块复用，再核具体 owner；本片不预先扩到 commands 算法、toolbar、popup、Host、CSS 或公共 API。spec/迁移表/下降快照由 root 串行维护。

## 当前 view 的读取时机

当前流程是先定义 `let view!: EditorView` 与捕获它的 turnCurrent，再构造插件数组，最后 `view = new EditorView(...)`。键表装配期间没有读取 view；Mod-k、Mod-d、块类型快捷键、块上下移动及列移动在**按键真正执行时**才读取该闭包变量。

已读本地锁定依赖 `prosemirror-keymap/src/keymap.ts`：keydownHandler 每次命中都执行 `command(view.state, view.dispatch, view)`。新内部键表的这些处理器应读取第三个参数 current，调用 `turnCurrent(current, id)`、`nudgeEditor(current, direction)` 等；这保留了实际按键时读取当前状态的时机，不在构造函数中读取尚未创建的 view。Command 的 editor 类型可选，采用短的参数存在性检查即可；不设计通用 withView 工厂或 getter 端口。

唯一需要从 mount 传入的是现有 `openLink(current)` 回调，它拥有当前 pop 的呈现流程。传入该函数本身，不传 view、不新建 popup owner，不在装配期间调用。Mod-f 已用事件传入 editor，继续调用同一 openFind。

这项参数化不是文字 AST 完全相同：对照时需标明把原闭包 view 代换为 keydownHandler 提供的当前 editor。可观察验收是公开 mount 中该实例的按键路径；不要声称手工拿 A 的私有命令再对 B 的 view 调用也保持原行为。拆分前后复测 setDoc 与 destroy/remount 后的快捷键，防止捕获旧实例或旧 state。

## 必须保持的优先级与返回约定

插件顺序保持：history → slash → mention → **同一个自定义 keymap** → task Enter keymap → baseKeymap → inputRules → gap/drop 等原插件 → hover/find 等 → Escape 的 selectEnclosingBlock → pagesFocus → options.plugins。入口的整份插件数组按 AST 对照，仅允许替换自定义槽位；不要借机挪 Escape 或把 task Enter 并入自定义 Enter。

1. `Enter`：confirmCodeFence → 多块 insertAfterSpan 并清 hover span → 单块 insertAfterSelectedBlock → leaveEmptyCodeLine → enterInToggle → exitWrappedBlock → splitListItem(list_item) → enterHeading；全 false 才到后面的 task split，再到 base Enter。`listItem` 只在这里用，可在新 blockKeys 内读取 `pagesSchema.nodes.list_item`，不得误换 task_item。
2. `Shift-Enter`：有 hoveredGroup 时使用 hardBreakAtSpanEnd；即使没有可 dispatch 的 tr 也返回 true，不能改成继续普通软换行。无 group 才 insertHardBreak。
3. `Backspace`：整组优先；然后 undoInputRule → 单块删除 → table left → collapseEmptyColumn → unwrapAtStart → base Backspace。Delete：整组 → 单块 → table right → base Delete。保留显式 base 命令，不能因后面还有 baseKeymap 就省掉，链内终止和回退需要逐项保持。
4. `Mod-d`：整组复制优先，否则 duplicateEnclosingRow；成功 dispatch.scrollIntoView 后 focus。不能直接改为原 hover 插件后面的 duplicateSpan 分支；自定义键表在它之前。
5. `Mod-Enter`：能翻转整组待办才 return true，否则回退 toggleTaskChecked。`Mod-\\`：有组却 clearSpanMarks 返回 null 时原样 false，不能擅自再清单个选区。
6. ArrowLeft/Right：折叠 NodeSelection → 相邻原子节点 → table edge → column edge，保持短路。ArrowDown/Up：先 moveSelectedBlock；即使得到不改变 doc/selection 的 tr，也尝试 continuePastEnd/BeforeStart 后吞键。之后 table → column → code → neighbor atom → continue；末尾没有 extra 才 false。不要统一成“无变化都 false”。
7. Tab/Shift-Tab：cellNav → code indent/remove → list indent/outdent → 容器嵌套/提起；最后始终 true，即使没有可用操作，也不能让焦点移出编辑器。Tab 到最后表格单元格先加行；反向查找不加行。hover span 被清除的时机与 scrollIntoView 保留。
8. 复制/剪切快捷键仍检查 state.selection.empty 与 editor，再 `document.execCommand("copy"|"cut")`，返回其 boolean；不切到 Clipboard API，不主动读写系统剪贴板。其产生的实际 clipboard 事件继续走 PGP 处理器。
9. 三段键名集合必须与原 37 项逐项一致、无重复，原键名顺序保留。所有 chainCommands、`||`、if 分支顺序和每条返回值保留。

块菜单和拖拽的 document capture keydown 仍在 `editor-block-handle.ts`：拖拽期间拦截键盘、Escape 取消；菜单打开时先由 menu.handleKey 消费。不要在新模块重复加拦截。slash/mention 的 composing 判定也不搬；本片不引入新 IME 判断或改变 ProseMirror 原输入事件时序。

## 跨平台与真实 Chrome 基线

依赖里的 `Mod` 在 Mac/iOS navigator.platform 上取 Meta，其余取 Ctrl；`Mod-y` 和 `Mod-Shift-z` 都继续存在，不擅自删掉 Mac 较少用的 Mod-y。Shift 数字与 Alt 字符布局由相同 keymap 依赖的 key/keyCode fallback 处理；Windows Ctrl+Alt 有 AltGr 的例外。保留字面键名，不手写 platform 判断，也不把 Mod 映射成 Meta。

新基线用正式 JS/CSS、公开 mount、CDP 的真实 keyDown/keyUp。状态准备允许从公开 view 的 schema/transaction 设置明确选区，命令触发必须经键事件；断言 doc JSON、marks、selection、onChange、undo 与 focus，而不仅 DOM 文字。原生 Shift 选择之后先等 ProseMirror 的 selectionchange 同步再发下一键，沿用之前已修正的夹具经验。

建议新增一个文件、三组关键用例，先在 PGP 最终正式包通过，再应用生产拆分：

- **格式、块与历史**：选中文字 Mod-b 后验证 strong mark；撤销与两种 redo 回到明确状态；普通块/选中多块 Mod-d 只复制目标块、undo 恢复；Mod-Alt-1/0 与 Shift 数字列表快捷键验证节点类型及邻块保持；Mod-Enter 验证待办 checked；Mod-\\ 清格式后 undo。Mod-k 打开现有链接面板，验证焦点并关闭；destroy/remount 后再格式或转换，旧实例零变化。
- **Enter、删除与回退**：普通段中 Enter 走基础分段；task item Enter 确认 task 专门插件仍有机会；标题 Enter 和代码围栏 Enter 证明前面的专门分支；Shift-Enter 产生 hard_break。多块 Backspace/Delete 删除整组并能 undo；至少一个“输入规则刚完成，Backspace 先撤输入规则”和行首 unwrap 的场景，防止链次序失效。其他列表/折叠分支已有命令测试复用，不为了列满矩阵逐个复制。
- **导航与 Tab**：表格首/末单元格 Tab/Shift-Tab，最后一格新增且只新增一行，selection 在预期 cell，undo 恢复；代码 Tab/Shift-Tab 修改缩进；列表或段落容器的嵌套/提起并保持相邻内容；无可缩进的第一段 Tab 吞键、焦点仍在编辑器。图像或横线前后的 Arrow 选择/退出，以及文尾向下扩一段，只检核心 state 转换；块/表格列的 Mod 方向键各取一个代表路径。

这三组是建议场景集合，实施时按实际夹具拆为短测试，每个函数 <150 行。测试数据应有邻块与不同 marks，防止“修改了任意正文”也过。为避免历史合并造成偶发 undo 断言，各场景 setDoc 清历史后独立开始；不以固定 sleep 代替选区/事件完成条件。

主验证环境是当前 Mac Chrome。可在**加载 bundle 前**以 CDP platform 模拟补 Ctrl 路径的 2–3 个映射例（格式/undo/Shift 数字），但那只能证明同一 Chrome 中依赖的非 Mac 分支，不算真实 Windows/AltGr/系统快捷键验收；若不补，明确 Windows 未实操，由保留键名和同一依赖实现支持兼容判断。不要修改用户浏览器平台设置或系统键位。

Mod-c/x 不用新测试写用户的系统剪贴板：PGP 的 DOM ClipboardEvent/DataTransfer 已证明 MIME、doc 与 undo；键盘层这一片通过完整 AST 保持两个 execCommand 处理器及其原返回值，再复跑 PGP。若专门加模拟 execCommand 调用计数，应明确只是接线局部证明，不冒称系统剪贴板测试。

## 复用与差异核验

既有浏览器直接复用：

- pages-insert-plugins：slash Enter/Tab、mention、输入与 undo，保护比自定义键表更早的消费。
- pages-find：Mod-f、查找栏 Enter/Shift-Enter、undo、Escape 与重挂。
- pages-block-menu：菜单捕获方向/Enter、选组和 undo；pages-block-drag：拖拽 Escape 与取消，不让新模块越过 capture owner。
- pages-clipboard：多块选择、copy/cut/paste 的结果及 undo；PGP transient 用例保持原验收，不因这片重复新增异步设施。
- README 当前必跑和 plugin-small-ux 由 root 在正式整体构建后执行；按实际影响复跑 content-editing，不跑本机全量。

pages-plugin 中已有输入规则、分组格式、任务、容器、表格边界、箭头、Tab、逐层全选等大量命令级断言，继续保留。需迁移的源码断言已定位：约 1821 的 Tab/Shift-Tab 顺序与 return true，约 1910 的整组删除/复制优先级；1715 附近的 slash/mention/base 相对插件顺序仍留在入口。IIFE 键名字面量断言继续读正式包，不能改成仅查 import 存在。

结构/语义核验建议：

1. 原 37 项绑定展开三段后按键名一一对照，参数化的 5 类闭包 view 读取单独标出。检查 shortcut/blocks/navigation 合并没有覆盖和漏项。
2. 原 turnCurrent、applySelected、nudgeTableColumn、cellNav、commandToggle 正文规范化 AST 对照；turnCurrent 只允许参数化原 view。新绑定通过回填对应助手后再与原每个 handler 比较，所有链条和返回逐项保持。
3. 入口除上述迁移部分与 import 以外的 AST、插件数组槽位、公开 27 出口完全一致；同一依赖相对模块图无环，所有新增函数 <150、新文件 <800。
4. 需明确：把闭包 view 改成事件 view 是按已核 keydownHandler 调用合同成立的等价论证，不能用“替换文本后一样”单独证明；新正式 Chrome 的 setDoc/remount 与状态结果补它。

## 资源与实施顺序

PGP 当前外部候选预览为 **706888 B**（root 正在正式整体构建，最终预算以 root 收尾实测为准）。上一片只比 706897 B 下降 9 B；这不意味着下一片有 9 B 可随便增长，下一片应不高于已提交的新预算并过 merge-base 门禁。

先用外部候选原路径 esbuild onLoad 替换，完整相同构建参数与 Host tightenServedJs 算正式大小；不直接从带 symlink 的候选 entry 打包，防止共享模块因 realpath 解析成两份。函数命名、三个对象合并和 keymap 包装都有成本，当前尚未预览，不能承诺必然更小。

若变大，只在键盘职责内合并真实重复，例如 ArrowUp/Down 的镜像流程、Tab/Shift-Tab 的共同分支，且保留方向不同函数和返回时机；每项去重先静态核对与当前基线。不要为了几个字节改 minifier、预算、公共命名、无关模块或语义。若简洁分组不能满足预算，报告实测差值再决定，不将整键表搬成巨函数或搞动态键表编码。

顺序：root 收 PGP → 接受下一片唯一 spec → 新 Chrome 基线 → 外部候选/字节预览与 AST 对照 → 应用有限路径并跑类型/静态/受影响断言 → 冻结 → root 串行整体构建与相同浏览器回归、README 必跑、资源/health/API/boundary/diff。测试编号建议 PGK-01（结构/合同）、PGK-02（键盘状态与回退）、PGK-03（优先级/重挂/平台范围），仅供 root 选择，尚未登记接受。
