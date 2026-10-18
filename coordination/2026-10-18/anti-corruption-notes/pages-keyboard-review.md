# Pages PGK 独立只读复查（负责人：reviewer）

结论：当前未提交候选未发现 Blocker/P1 或必须修正的源码风险；可以进入主会话正式构建与Chrome验证。不能据此称PGK已验收：正式资源、最终Chrome、资源/health/API/boundary仍未由本review执行。

范围：wt-pages-commands 的 4d1d1e029 到当前工作区diff，含未跟踪 editor-keyboard.ts、pages-keyboard.e2e.test.ts；对照唯一spec顶部W5-10-PGK。未改源码、运行测试/构建/Chrome或操作其他会话。handoff只作索引，没有把writer结论当验证结果。

## 独立源码核验

- 用独立只读脚本从基线原keymap和新shortcutKeys/blockKeys/navigationKeys提取属性：37/37、逐项顺序相同、37个唯一键。新pagesKeymap将三个连续段按原顺序展开，没有键覆盖。
- 对照本机实际prosemirror-keymap@1.2.3/src/keymap.ts的keydownHandler：直接命中、Shift重试、keyCode回退三路均调用 command(view.state, view.dispatch, view)。因此原闭包view改第三参数对真实键盘路径成立；空view返回false仅影响原本不由keymap触发的人工调用，没有装配时捕获未初始化view。
- Enter：confirmCodeFence → hovered span → selected block → empty code → toggle → wrapped block → list split → heading，顺序与dispatch meta相同；之后仍是task Enter keymap和baseKeymap。
- Backspace/Delete：hovered group先行，原chain及base回退不变。复制/剪切仍检查selection且原样返回execCommand boolean，没有换剪贴板实现。
- verticalArrow展开正负方向与原ArrowDown/Up相符：moved有改变才scroll dispatch；moved存在但无改变时尝试continueEdge且无论有无extra都true；table/column/code/atom短路顺序不变；最终没有extra才false。
- tabKey保持table→code→list→container顺序，changed时清hover span并scroll，最终始终true。cellNav正文保持，只有dir>0且atLastTableCell才addTableRow，Shift-Tab没有新增行路径。applySelected非空但无变化tr仍true；nudgeTableColumn命中表格但无法移动仍true。
- 插件数组原位置不变：history、slash、mention在自定义键表之前；task/base在之后，find/capture等顺序未动。commandToggle仍是一份由工具栏/键盘共用；新模块依赖原commands/selection/find/table/input-rules/schema，无直接回指editor-browser或全局view/selection缓存。
- destroy/remount实现未动；每次mount创建新keymap，执行从第三参数拿当前view，openLink仍使用本次mount回调。未引入新listener owner或需额外销毁的对象。

## 测试能证明什么

新文件通过正式Host JS/CSS和公开mount，CDP Input.dispatchKeyEvent实际走ProseMirror DOM键盘链；未导入内部键盘源码替换执行。reset用setDoc，选区设置后按键并读取真实doc/selection/onChange/undo/focus，因此不会只验证测试自建keymap。

- 格式/历史组可击中mark丢失、history返回错误、块转换拿旧view、重复块与组优先改变；destroy后新实例heading变化且旧doc保持，能发现模块级缓存旧view。每次setDoc后的命令也使用新doc。
- Enter/删除组能击中task/base fallback阻断、heading/code fence顺序改变、group删除错误与输入规则撤回失效；相邻内容与undo断言避免只看到部分文字就通过。
- 表格组能击中Tab先做缩进而非cellNav、末格重复加行、onChange多次、列移动失效；Shift-Tab从Right回Left且keyChanges=0可击中误把普通反向导航当写入。
- 代码/容器组验证双向缩进及选区、plain Tab不变且焦点保留、块移动undo、atom选择与末尾延伸。
- 调整pages-plugin.test.ts的位置断言跟随owner，原command业务测试保留；新方向映射/顺序断言属于辅助静态证据，不能替代最终浏览器。

新4组没有独立覆盖每一个37键，也不直接构造“moved无变化且continueEdge=null”的全部边界；该处本次以逐分支源码对照确认保持。现有clipboard/find/slash/mention/menu/drag浏览器仍须按spec跑；新用例的“duplicate”是块复制，不是系统剪贴板。无需为本次等价提取强制增加全键矩阵，但不要把新4组称作这些未覆盖动线已通过。

## 当前交付条件

主会话须在正式构建后的同一资源上跑新keyboard与spec指定原相关浏览器，以及包必跑/门禁；检查706888 B资源上限。此review没有借用原PGP浏览器通过或外部预览构建作为最终候选证据。不存在需要先回writer改源码的已确认问题。
