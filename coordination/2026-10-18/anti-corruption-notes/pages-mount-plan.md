# Pages mount 后续拆分计划

状态：只读方案，尚未实现或运行。2026-10-18，Pages 负责人：Codex（pages_handle_writer）；主会话负责收尾 PGH、唯一 spec、共享快照及集成验证。本文件是交接材料，不替代 `specs/repository-anti-corruption/spec.md`。

## 结论与第一片

建议先拆 **剪贴板输入输出与图片拖放入口**，复用现有 `editor-paste.ts`，暂不动键盘表、弹层、AI 请求或 mount/release 时序。这是一条能独立证明的完整事件链，所有处理器已使用事件传入的当前 EditorView，既不读取 mount 尚未赋值的 `view`，也不保存第二份编辑状态。新增模块级函数都远低于 150 行；不把整个 EditorView 配置或 mount 闭包换个文件。

范围具体为：`handlePaste` 55 行、`handleDrop` 13 行、DOM `dragover` 11 行、`copy/cut` 各 3 行及现有模块级 `writeSpanClipboard` 24 行。预计 mount 减少约 75–85 行（以最终正常格式 AST 实测为准），入口文件还减少剪贴板实现；mount 仍约 750 行，不能称整个 mount 或 W5-10 完成。第一片目标是“功能可用、行为保持”，不是新增体验。

相比之下，键盘表约 190 行虽能一次减少更多，但包含优先级、命令 fallback 和初始化前的 view 捕获；弹层/AI 更涉及 frozen range、transient 清理与请求序号。二者适合后续独立片，不与本片混改。

## 已核实际调用链和边界

- `client.ts:495` 经公开 `Editor.mount(editorHost, options)` 挂载。`editor-browser.ts` 创建唯一 EditorView，`dispatchTransaction` 顺序是 apply → updateState → 链接预览 → 评论预览 → onTools → docChanged 时 onChange。
- 事件处理器进入同一 view.dispatch，继续上述回调、客户端草稿与自动保存链；模块拆分不增加直接 `updateState` 或旁路文档写入。
- 粘贴分支的既有优先级必须逐项保留：图片 → 有正文的块组选区替换 → Shift 纯文本 → URL → HTML（正文不像结构化 Markdown，或 HTML 有明确格式标记）→ Markdown；每条分支原 `preventDefault`、返回 true/false、scrollIntoView 和 hover 清理不变。
- 复制读取 hover 所选块，退到 NodeSelection；仅有 clipboardData 且确实选到节点才清空/写入 text/html 与 text/plain。剪切在同一次 clipboard 写入后才删除；组删除仍清 span/pos，单节点删除仍走既有 deleteSelectedBlock。
- 拖入图片先从 DataTransfer 找文件，再 preventDefault；拒绝的文件已被接管但不写正文。可接受图片先按落点设 TextSelection，再由 `readPagesImage` 读取。
- `editor-paste.ts` 当前约 47 行，已有 CLIP_IMAGE、clipboardImage、leafFromDom；`editor-gap.ts` 也消费 clipboardImage，继续共用这份读取，不复制成两份。
- 异步图片唯一 owner 仍为 `editor-transient.ts`：freezePagesFocus → FileReader → ownPagesTransient；读取完成先取映射锚点并停止 transient，再按 intact 写入。`setDoc` 先 endPagesTransients 再换 state；`destroy` 先 endPagesTransients → handle.release → view.destroy。第一片不改这些函数与顺序。
- `editor-block-selection.ts` 拥有 hover PluginKey/块选择命令，只依赖 commands、reorder、table-edit，不回指 browser/paste。`editor-transient.ts` 依赖 commands/focus/schema；focus 依赖 schema。下一片应重查完整相对 import 图，现有这些直接边允许 paste 依赖选择/临时资源实现，不需入口回调或新全局状态。

## 允许修改的模块与形状

| 文件 | 修改内容 | 明确保留 |
| --- | --- | --- |
| `plugins/native/pages/src/editor-paste.ts` | 加入粘贴、图片 drop/dragover、复制/剪切的内部事件处理函数；既有图片识别和 DOM→PasteLeaf 留在此处 | 原分支顺序、输入、返回、事务内容；不保存 view/selection、不注册监听、不成为生命周期 owner |
| `plugins/native/pages/src/editor-block-selection.ts` | 将当前入口的 6 行 dropSelectedBlock 原实现移入，供键盘和剪贴板共同调用 | 相同函数名/算法；不新增公开包出口，不重复单节点删除逻辑 |
| `plugins/native/pages/src/editor-browser.ts` | 只 import 上述处理器，原 EditorView 对应属性以函数引用装配；原 copy/cut 位置可保留极薄委托 | 27 个公开出口、插件顺序、dispatchTransaction、blur、挂载顺序、release、setDoc/destroy 完全保留 |
| `plugins/native/pages/README.md` | 精确说明剪贴板/drop 责任与定向验证 | 不改公开使用合同 |
| `tests/pages-plugin.test.ts` | 迁移受影响的 paste 顺序与源码绑定断言到真实 owner，保留原断言强度 | 原命令/转换/样式断言；不能只断 import 存在 |
| `tests/pages-clipboard.e2e.test.ts`（建议新增） | 正式资源上的事件动线回归，见下文 | 不加源码内部 import、不接管系统剪贴板 |

不改 client/Host、commands 算法、schema、持久化、样式、资源预算、构建参数、公共 API。spec、迁移表、派生快照由主会话串行处理。只有已核实为本片必要的断言位置可以补迁；不顺便改其他测试。

实现优先用具名函数直接作为 ProseMirror props，或按 props 类型声明的小对象，避免 `create…` 大工厂、每个事件再套闭包、getView 端口或新的控制器状态。具体导出名称在实现前选定后保持；不为字节数缩短标识符。若复用同一小对象，必须先核 ProseMirror 只读取而不修改该对象，不能凭感觉把实例对象改为共享可变对象。

## 验收建议（由主会话纳入唯一 spec 后生效）

建议暂用 `W5-10-PGP-01/02/03`，主会话确认未占用后登记，不在本方案预称 accepted。

1. **PGP-01 结构与合同**：27 个公开出口及可观察签名不变；新函数≤150 行、文件≤800 行；无新类/循环依赖/状态 owner；mount 与入口实测减少；正式 `/assets/molis-work-pages-editor.js` 以完成 PGH 后实际基线 **706897 B** 为本地比较点，且逐项通过 merge-base 资源门禁。该数字是主会话已核事实，本计划未重新测量。
2. **PGP-02 剪贴板实际行为**：正式 bundle/CSS + 公开 mount；复制/剪切选中多块同时产生完整 HTML 与 Markdown 文本，copy 不写正文、cut 只删除选中块、undo 恢复；粘贴到块组选区替换整组并保留相邻内容，undo 恢复。覆盖 HTML 标记与 URL、结构化 Markdown、Shift 纯文本的优先级，校验最终 doc/marks，不仅查 DOM 有字。空/不支持输入继续交给默认处理，正文与 changed 回调不应多写。
3. **PGP-03 图片及生命周期**：正式编辑器接收图片 paste/drop，drop 使用落点；图片读取等待中移动光标仍按原映射锚点落位，切文档或销毁后旧读取零写入；destroy/remount 后当前编辑器仍可粘贴。原 `W2-18-PAGES-TRANSIENT-01` 已覆盖等待、换文档及映射，优先复用，不复制一套 FileReader 延迟设施。

Chrome 的剪贴板数据使用 DataTransfer/ClipboardEvent 注入，进入实际 DOM/ProseMirror 处理器并断言返回效果；这证明真实浏览器的编辑路径，不宣称操作系统剪贴板授权已验证。键盘 undo 走 CDP；不以直接调用新函数替代事件接线，也不改用户系统剪贴板。补图片 drop 的真实 DOM 事件即可，不伪称系统拖文件经过了平台授权。

## 现有验证证据与缺口

已阅读的有效基础：

- `tests/pages-plugin.test.ts` 包含多块 paste、结构化 Markdown、HTML 格式/危险链接、剪贴板节点转换等命令级验证。约 4257 行的 `handlePaste`→`replaceSpanWithNodes`→`pasteMarkdown` 源码顺序断言须随 owner 迁移；其余形如 IIFE 内含函数名的断言会继续成立，不应删除。
- `tests/content-editing-regressions.e2e.test.ts` 的 `W2-18-PAGES-TRANSIENT-01` 通过真实 Pages 页面 paste 图片，延迟 FileReader，证明 A 的回调不能写 B、同文档按映射锚点插入且保存。该文件也含其他插件测试；可用测试名筛选新增相关路径，最终是否整文件由主会话按 README 选择。
- `tests/pages-insert-plugins.e2e.test.ts` 覆盖段间输入与原 chromePlugin 的公开挂载；由于仍消费 editor-paste 的图片读取小函数，需要保留这条跨入口回归。
- `tests/pages-block-menu.e2e.test.ts`、`tests/pages-block-drag.e2e.test.ts` 覆盖块选择、移动和 undo，可作为本次 selection helper 位置调整的相邻回归。
- 当前没有读到完整浏览器 copy→cut→paste、Shift HTML/Markdown 优先级及图片 drop 位置的直接断言；应补最小新用例。命令单测与源字符串不能代替这些事件路径。

执行时先读已存在的 spec 更新并确认 PGH 已收尾；不假设本计划就是后续实现授权。实现前保存同一组新动线的当前正式资源基线结果。无需本机全量。

## 实施与验证顺序

1. 主会话先收当前 PGH，记录实际 head/资源预算，并在唯一 spec 写入本片边界和验收。下一片实现收到通知后才开始。
2. 只在外部候选中抽取上述函数，逐函数核参数、分支、返回和 dispatch 内容，跑与生产相同 esbuild/tighten 的槽位预览。资源紧：函数提升会带来符号/引用成本，**尚无测量证明本片必然不增长**；若增长，先消除同职责的真实重复或减少无用委托，不动语义/格式阈值/资源门禁，不借不相关模块作体积抵扣。无法同时保持合同和预算时报告具体差值供主会话决定，不能静默扩大范围。
3. 应用小范围源改；Pages 两份 tsconfig typecheck、scoped Biome、27 出口比较、相对 import 无环、diff/spec 覆盖检查。同步测试位置断言与 README。
4. 主会话串行整体 `pnpm build`，再执行 README 当前列出的必跑非浏览器文件，以及 `tests/pages-plugin.test.ts`、相关图片/命令测试；用 `node scripts/run-tests.mjs --jobs 2 <确切存在的文件…>`。测试文件清单应以磁盘核对，不填不存在的 `pages-editor.test.ts`。
5. 同一正式构建跑新 clipboard Chrome、原 transient、insert/menu/drag 与 README 要求的 UX 文件；主会话核 final 资源/health/API/boundary 和派生快照。全量仍由集成线安排。

## mount 后续地图（不是本片实现清单）

- **键盘**：现有自定义 keymap 保留为 plugins 中同一槽；按原连续顺序拆成通用/格式快捷键、块编辑、导航与 Tab 三组（各约 40–80 行），turnCurrent 和共享命令小函数归内部命令模块；优先保持当前 view 的读取时机，不建立第二份 selection。不能把约 190 行键表原样放进一个仍超限的函数。
- **弹层与 previews**：popup 的 token、request、docked、hide/ownTransient 是一个生命周期 owner；链接/评论 preview 负责自己的 DOM、投影和跟随。后续接口须保 onTools/onChange/onScreen 顺序、openPanel 归还、blur 120ms 逻辑及销毁顺序。
- **AI 候选**：runAiCommand/showCandidate 共用 popup owner 的请求序号与 frozen token；prepare 等待后的 request 检查、模型结果后的检查、wholeDoc/localId、proofread/actions/translate_new 分支必须整体守住，不能另存一个 request epoch。到该片时读 Prologue 技能及真实 context-toolbar/候选用例。
- **工具与最终装配**：toolDefs/toolGroups/runTool/screen 是编辑器向共同 toolbar 的同步投影，独立后 mount 才能只留 DOM/view/plugin 装配与薄生命周期。最后以实际 AST 数字决定是否剩余巨单元，不能靠累计“已拆几片”验收。

本次只写本文件；未修改 P 工作树任何源文件、测试、README、spec 或快照，未构建、未启动 Chrome。
