# Pages PGP 独立只读评审

状态：2026-10-18，审阅 `wt-pages-commands` 对 `7eaca0cee` 的指定文件 diff、现行 PGP spec 三条和新增 clipboard Chrome 用例。未改源码或 tests，未运行 build、测试或 Chrome。

结论：没有发现 Blocker/P1 或本片必须追加修复的生产风险。可继续主会话正式 Chrome 与既定门禁验收；本报告不是浏览器通过结论。

## 已核对

- `editor-paste.ts` 的 handlePaste 保留原分支顺序与短路返回：图片先于文字；有效块组选区替换先于 Shift/URL/HTML；Shift plain 单独处理；URL 先于 HTML；HTML 仍仅在非结构化 Markdown 或包含指定 Pages/underline/mark 格式时优先；最后 pasteMarkdown。dispatch/meta/scrollIntoView 的位置未改变。
- writeSpanClipboard 与迁出的 dropSelectedBlock 正文保持原逻辑。先 serialize/clear/set HTML/set Markdown，随后 preventDefault，再执行 cut 删除；复制不 dispatch。多块删除仍清同一 hoverKey 的 span/pos，单块仍用原 NodeSelection 分支与命令。未引入第二份 hover/selection 状态。
- handleDrop 保留先验证图片、按当前事件坐标更新当前 EditorView 选区，再交给 readPagesImage；dragover 仍只对支持图片文件 preventDefault。处理器从事件取得 view，不捕获 mount 时的过期实例。mount 除这三项处理器引用外未发现生命周期/dispatchTransaction/onChange 改动。
- readPagesImage 仍是原 transient owner：冻结映射锚点、换文档/销毁结束读取、回调检查 active/isDestroyed/intact，再取最新 state 提交。此次不另建 listener、FileReader 生命周期或存储位置。
- leavesFromDom 的 `Array.from(childNodes, leafFromDom).filter(leaf !== null)` 与原两处循环等价：leafFromDom 只返回对象、非空字符串或 null；不引入空值、顺序或递归差异。
- 独立 TypeScript AST 读取基线与当前入口，27 个公开 export 名称及顺序相同；diff 未改变其签名。内部 helper 新 export 不进入 editor-browser 的公开出口。
- 独立核实当前正式产物：raw dist/pages-editor.js 为 731930 B，Host 的 web-assets.ts 会调用 tightenServedJs；对当前产物应用同一现有转换后为 **706888 B**，低于 PGP 上限 706897 B，减少 9 B。raw 与 served 差异不是资源回归。未代替完整 page-assets merge-base 门禁。

## 测试证据范围

新 tests/pages-clipboard.e2e.test.ts 的断言覆盖多块 HTML/Markdown copy/cut、copy 零 onChange/cut 一次 onChange、邻块保留、undo、整组优先于 HTML、URL/marked HTML/Markdown/Shift、空/不支持输入零写、图片先于文字、图片 drop 落点、读取中 destroy 后旧 view 零写及新实例可用。它确实沿正式 bundle/CSS 与 DOM ClipboardEvent/DataTransfer 路径，未绕过生产 handler。

等待中的锚点映射与换文档隔离由既有 `tests/content-editing-regressions.e2e.test.ts` 的 W2-18-PAGES-TRANSIENT-01 承担；已读到该测试实际延迟 FileReader、换文档、插入前缀、移动光标后释放读取并检查持久结果。最终应与新 clipboard 用例一起运行，不能用基线 Chrome 通过替代新 bundle 验证。

无新增 P2 生产缺陷。系统剪贴板/操作系统拖入授权未由这些合成 DOM 事件证明，spec 已准确声明该边界，无需扩大本片。
