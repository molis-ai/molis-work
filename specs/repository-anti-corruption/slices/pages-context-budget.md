# Pages 未保存摘要的上下文预算

状态：限定实现与作者验证已完成，候选待独立审验（2026-10-25）。负责人：Codex I1。基线为 fresh `origin/main` 的 `29f1ffd47999714ff8c4b92c3bfee179f8f65054`，独立分支 `feature/pages-context-budget`。目标是限定功能修复及工程、真实浏览器证据，不代表整个 PG-031/057、发布或本人验收完成。

## 目标与边界

Pages 的 `publishContext` 先取正文前 20,000 个 UTF-16 单元，再序列化完整上下文。引号等字符会膨胀：既有真实浏览器反例的 44,000 字未保存正文，其 20,000 字节选形成长度 40,201 的 JSON；不透明 frame 的实际 `child.ts` 属性观察器发送这串 JSON，`parent.ts` 只接受 `message.value.length < 32000`，否则移除上下文。这里比较 JS 字符串长度，不是 UTF-8 字节数。

只修 `plugins/native/pages/src/browser/context.ts` 的生产端。保留原摘要上限、字段与通知时序；普通可容纳输出逐字保持，唯一例外是原 20,000 截点恰好拆开完整代理项对时，退到该字符之前。完整 JSON 超限时，在原文前缀上有界二分，只缩 `draft_text`，最终可容纳上下文严格小于 32,000。不截 JSON 文本，不改变正文、`plugin_id`、`surface_title`、对象 kind/id/version/title 或 `unsaved`。预算连空摘要字段也容纳不了时，省略可选的 `draft_text`；删除它后的纯元数据仍大于等于 32,000 才属于元数据自身超限，保留全部元数据并由原 parent 继续拒绝。持久化标题由动作和 store 限制为 80，但未保存 `titleInput.value` 不能据此假定永不超限；不增加兜底协议或伪造成功。

其余允许文件为 Pages README 一条不变量，以及 `tests/pages-surface-naming.test.ts`、`tests/pages-actions.e2e.test.ts` 的必要回归。沿现有公开客户端工厂与浏览器 fixture 测试，不新增生产文件、公开导出或私有源码导入。parent/transport、S30、100,000 offer 上限、评论重试/消息 id、来源/目的/gesture/ACK、权限、模型调用、其他插件、门禁/预算/CI 与公共状态均不改；不追加旧冻结候选，不运行 Full，不接入其生产选择。

## 验收

| 编号 | 标准与证据 |
| --- | --- |
| PAGESCTX-01 | 公开生产客户端对原本可容纳的短稿和普通长稿输出与原完整上下文等值；元数据与摘要内容不改（`tests/pages-surface-naming.test.ts`）。 |
| PAGESCTX-02 | 引号、反斜杠与控制字符造成真实转义膨胀时，完整 JSON 合法且严格小于 32,000；摘要是原文前缀、至多 20,000，元数据及 unsaved 保留（同上）。 |
| PAGESCTX-03 | 覆盖 31,999 / 32,000 的精确门槛、emoji 截点、无正文/无文档/已保存；元数据自身超限仍由原接收门槛拒绝，不改身份、标题、版本或 unsaved（同上）。 |
| PAGESCTX-04 | 调用实际生产客户端，保留旧生产路径在引号长稿上超限的自然失败反例，再证明新路径保留；不只测 helper 或夹具（同上与原始负控日志）。 |
| PAGESCTX-05 | 专用浏览器、临时 Home/profile 中真实编辑长稿，沿 child 属性观察器/port → 未改的实际 parent，观察同文档 id/version/unsaved 和缩短摘要仍在；短稿、保存和切文档不带旧稿。保存可暂挂以保持 dirty，但不得伪造 context 消息；不调真实模型（`tests/pages-actions.e2e.test.ts`）。 |

## 验证与交付

源码固定后正常整体 `pnpm build`，保留官方输入指纹与 manifest。非浏览器与浏览器均按公共 machine-slot 的 browser FIFO，`--jobs 1 --retries 0 --verbose`；跑 Pages README 既有必跑集、surface naming 与本单的浏览器 PAGESCTX-05，不重全部 PG-031/057 或 Full。另核 fresh main/准确 merge-base 的 health、boundary、源码/构建混用及资源；资源增长先同资源减省，必要增量交独立 REVIEW，不自行改预算或门禁。fresh fetch 后 secrets，再普通 push 自有 feature，不开新 PR、不改 main/carrier。固定候选和必要输入 clean 后释放 writer，直交原 REVIEW/TEST，作者亲读正式回执及必要原件后交 Root/PIPE；保留自然失败/退出与自身进程、Home、profile 清理证据。

作者验证：最终正常整体构建通过；naming 7 项、README 13 文件 133 项、真实 PAGESCTX-05 1 项均通过且无跳过，health、boundary 与源码/构建混用检查通过。使用原 bundler 选项单独编译精确基线 producer 的公开客户端工厂作为负控，实际输出长度 40,166，新增业务断言自然失败；这是旧生产工厂反例，不是完整基线构建回跑。最终真实浏览器的 44,000 字草稿保留 15,900 字摘要，完整 JSON 从旧路径 40,199 缩至 31,999，同文档身份/版本/unsaved 到达未改 parent，保存后版本从 1 到 2、摘要消失，切文档及返回均不带旧稿。模型 completion 关闭；临时 Home/profile 及自身 Chrome 进程清理已核。

页面资源仍待既有政策处理：Pages 客户端同资源 38,705 → 初版 39,026；改用原生 `codePointAt` 判截点后省回 60，最终 38,966（净 +261 字节）。完整 JSON 预算、Unicode 截点及可选摘要省略属于本修复所需，未新增依赖或通用框架。资源门禁仍报增长，不改预算、ceiling 或接收上限；由独立 REVIEW 评估并交唯一集成方在实际组合结果上处理，不宣称门禁全绿或主线采用。
