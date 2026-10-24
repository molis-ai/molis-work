# Shelf S3 原件登记的部分成功反馈

状态：首轮实现已提交 #1150，评审补修已完成本地实现与定向工程验证，待统筹集成（2026-10-23）。补 #1076 合后评审 P2，目标为功能可用；真实原生手势与一骏本人验收另记。基线为 `27bb3c21252003ea51b4b85394278eb773d12df6`，不携带其他客户端迁移片。

## 问题与范围

Shelf 上传已保留副本，原件登记失败时回 `original_registered: false`；桌面 Rust 只取 `item_id`，因此把部分成功当成完全成功。现有 `molisWorkShelfNotice` 只在父窗口发事件，不能保证关闭的 Shelf 或隔离 iframe 中可见。

桌面 HTTP 解析返回成功回执 `{ item_id, original_registered: Option<bool> }`；只有明确 `Some(false)` 提示“副本已收下，但未能登记原件；后续处理将无法核对原件是否变化。”。`true`、缺标记静默，真正失败仍返回 `Err`。目录可包装为无标记；不改变 canonicalize 失败时不发送 `original: true` 的现有行为。

剪贴板接收、拖放轮盘、热键文件/图片收取消费同一回执，保留成功 ID、数量、顺序与后续动作。`shelf_admit_paths` 只有原生命令和权限登记，当前没有 TS/JS 调用者；保留类型接线，不计为真实用户入口，本片不删除其命令或权限。复用桌面已有 `molisWorkShelfNotice(message, partial?)`，默认仍为错误；保留旧事件并经共同 `molisWorkRequest.toast` 显示在顶层现有 toast 节点，部分成功标 `data-mw-state="partial"` 并去掉 `is-error`。后台入口不显示窗口、不抢焦点，主动热键原成功 show/refresh 保持。热键批次同时出现副本成功、原件登记失败与其他文件真正失败时，仍返回真实错误，并在原失败摘要后保留原件警告。隐藏窗口不宣称系统通知已送达。

允许路径：`apps/desktop/adapters/tauri/src/shelf_http.rs`、四个消费入口文件、`apps/desktop/src/shell.ts`、`apps/workbench/src/i18n/renderer-gap-en.ts`、`tests/ci-product-subset.txt`、直接回归测试与本规格。新增独立 Shelf HTTP 测试，不改在途片的 Shelf README、`tests/shelf-plugin.test.ts`。不改 iframe、SDK、公开合同、业务存储、权限、共享 roadmap 或 privileges 状态，不新增 toast 容器或日志。

## 验收

- PG-026-S1-S3-1：Rust 生产解析与回执消费测试覆盖 `false`、`true`、缺标记、无 item、错误响应；部分成功仍取到原 ID，只有明确 false 调警告。
- PG-026-S1-S3-2：三个真实桌面入口及保留的无调用者命令维持成功计数、顺序和原后续动作，统一调用已有通知入口；后台剪贴板和轮盘没有新增 show/focus。Rust 类型检查和直接回归覆盖接线。
- PG-026-S1-S3-3：真实 Shelf HTTP 上传用 `node:http` 带 `sec-molis-work-original-path`，实际登记成功后修改原件，`extract_text` 拒绝为 `shelf.origin_changed`，不新增 job/result，副本字节不变。
- PG-026-S1-S3-4：真实上传声明 `original: true` 但不带路径头时仍 200、`original_registered: false`，副本可读；原件动作在实际 ActionCallLog 留一条失败，不另写重复日志。
- PG-026-S1-S3-5：真实桌面 bootstrap + Tauri fixture 下，Shelf 关闭和打开时部分成功 toast 都在顶层可见；侧栏开关、选中标签与焦点不变；旧事件保留，默认真实错误仍显示失败样式。`true`/缺标记静默由 Rust 回执消费证明。

## 验证与边界

整体 `pnpm build` 后运行新增 HTTP、桌面 Shelf 浏览器、desktop README 必跑及相关回归；Rust 使用仓库原生检查入口执行格式、clippy 和测试。固定基线 health、boundary、API 快照、资源预算、secrets 与 affected-tests 留完整日志。构建和浏览器均用公共机器槽；全量交统筹集成，不在子会话启动。页面发布资源预期不变，桌面 bootstrap 响应脚本增量按实际结果记录。测试使用隔离 Home 与受控端口，不操作真实 Home、付费服务或真实系统快捷键。

## 本地验收记录（2026-10-23）

- PG-026-S1-S3-1/2 通过：生产 Rust 回执解析、消费与热键批次汇总用例；20 个 Rust 文件格式、clippy `-D warnings`、crate tests 全通过。四入口的类型与现有 desktop IPC 回归通过。未执行真实剪贴板、轮盘、系统热键手势，不将这些操作记为实机验收。
- PG-026-S1-S3-3/4 通过：两个隔离 Home 的真实 HTTP 用例；原件成功登记后变化拒绝为 HTTP 400 / `shelf.origin_changed`，catalog、jobs、results 与副本字节均核对；无路径头时保留副本，并核对实际 ActionCallLog 只有一条原件失败。首轮误写预期 409，按现行 `origin_changed: invalid` 合同及既有错误模型用例修正为 400 后通过，生产语义未改。
- PG-026-S1-S3-5 通过：受控浏览器中的真实 desktop bootstrap 和 Tauri fixture，Shelf 关闭/打开两种状态可见顶层 partial toast，侧栏、标签、焦点与旧事件保持；默认错误仍有失败样式。该浏览器文件 2/2 通过，未使用个人浏览器资料。
- README 必跑三文件与 desktop IPC、共同 toast/request 回归通过；加跑原件安全 7/7、Shelf 等错误模型 12/12。共 10 个唯一测试文件、80 个测试通过。整体构建、固定基线 health（含 API 快照）、boundary、页面资源预算通过；27 个页面资源保持 7,812,087 字节。完整回归由统筹集成运行。
- Rust 首轮 clippy 发现新测试模块位置和 eval 的多余借用，已机械修正并重新完整通过，未增加抑制。隐藏窗口没有系统通知承诺；真实原生手势、最终安装包及一骏本人验收尚未执行。

## #1150 评审补修范围（2026-10-23）

首轮轮盘按文件逐次发 toast，后来的原件登记警告会覆盖前面的真实失败。把热键的生产汇总放进共享的 `shelf_http`，轮盘与剪贴板都先累计一批的成功 ID、原件警告和最后一个真实失败，再只通知一次：有真实失败优先错误状态，保留成功数、失败原因和原件警告；只有警告才是 partial；全成功静默。热键复用同一汇总，保留主动打开/刷新行为。后台剪贴板的多文件失败也经同一汇总可见，不显示窗口或抢焦点。

`crate::shelf_notice` 合并提示注入，支持内部延迟参数：后台仍立即注入，热键先原有 show/refresh 后延迟 80 ms 调同一函数。旧 `molis-shelf-notice` 的原文载荷与合同不改。顶层展示时逐行过现有 `L`，把固定原件提醒加入现有英文词典，因此独立 partial 和混合错误末尾都可显示英文。计数加原生错误的动态整行仍保持现有原文；不增加字符串语法解析或新的翻译协议，不宣称完成全部原生错误本地化。

- PG-026-S1-S3-6：生产共享批次通知覆盖 `[partial, failure]` 和 `[failure, partial]`，均仅通知一次、error 状态、成功数/原 ID/失败原因/原件提醒齐全；全成功、仅警告、全失败保持对应语义。轮盘与剪贴板均调用这一生产通知路径。
- PG-026-S1-S3-7：真实英文页面和 desktop bootstrap 下，固定原件提醒独立及嵌入混合失败末尾均为英文；旧事件载荷保持原文，partial/failed 样式与开关、焦点规则不变。
- PG-026-S1-S3-8：新增真实 HTTP 两项加入现有 CI product subset，保留门禁算法；按既有桌面与工作台 README、原生检查、定向 HTTP/浏览器、整 PR health `--base origin/main`、boundary、assets、secrets 验证。

不处理 dead `shelf_admit_paths` 删除、旧事件合同归属或全量原生文案迁移；不变更公共 API、权限、SDK、业务存储或统筹状态。历史首轮证据保留，下面追加补修结果，不能把首轮通过当成此次修复验证。

### 补修验证结果

- PG-026-S1-S3-1/2/6 通过：`node scripts/gates/native-checks.mjs rust` 重新检查 20 个 Rust 文件格式，clippy `--all-targets --locked -D warnings` 和 cargo test 全部通过。批次生产通知的两种错误顺序、成功 ID 与顺序、单次通知、全成功/仅警告/全失败均有断言；热键保留原主动 show/refresh 和 80 ms 延迟，后台两入口不新增 show/focus。
- PG-026-S1-S3-3/4/8 通过：真实 HTTP 两项及原件安全 7 项重跑通过，HTTP 文件已加入 CI product subset；清单规则 17 项通过。未修改门禁算法或公开 API。
- PG-026-S1-S3-5/7 通过：受控测试浏览器重新运行 3/3；真实页面的中文、英文 bootstrap 均覆盖独立 partial 与混合 failure 文案，原文事件、错误样式、侧栏开关、选中标签及焦点保持。
- 本次桌面与工作台 README 必跑、HTTP、原件安全共 23 文件 190/190，通过；追加 toast、desktop IPC 和 CI 清单规则 3 文件 26/26，通过。整体 `pnpm build`、boundary、整 PR health `--base origin/main`（merge-base `27bb3c21`）和页面预算通过；27 个资源仍为 7,812,087 字节。原始日志为本机 `/tmp/molis-verify-2026-10-23/pr1150-review-*.log`，不入库。
- 未运行全量回归、真实 OS 剪贴板/拖拽/热键手势或最终安装包；这些结果不冒充一骏本人验收。隐藏窗口没有系统通知承诺；混合错误的动态原文行仍未本地化，固定原件警告已本地化。

## #1150 主线冲突同步（2026-10-23）

按已接受评审，仅普通 merge 固定主线 `aa4de404fc847d99bf89842f446474ec41d7622a`；原 PR head 为 `04e51af7e2da39a8c36683fc2849f3ee8fed8a26`，合并提交为 `e79495cfd`。唯一冲突在 `renderer-gap-en.ts` 顶部，双保留原件登记警告和主线新增的 Shelf 示例恢复失败译文；主线删除 Issue 旧译文及新增 Todo 候选措辞的改动均保留。PG-026-S1-S3-1 至 8、原生产语义和已有验收边界不变。

在追加此记录前，对旧 PR（`27bb3c21..04e51af7e`）和新主线上的 PR 逐文件比较：11 个文件的新增/删除行完全一致，PR 外文件与固定主线一致，没有带回主线已移走的内容。主线自原基线以来未改桌面 Rust 文件，本次不重复已通过的 Rust 原生测试。构建与浏览器用例由机器槽排队，后续验证只追加本次结果；本次原始日志为本机 `/tmp/molis-verify-2026-10-23/pr1150-main-sync-*.log`，不入库。

同步后验证通过：当前工作台 README 18 个必跑文件、桌面 README 3 个必跑文件，加翻译规则与真实 Shelf HTTP 共 23 文件 249/249；受控浏览器的原侧栏用例及中文、英文 partial/failed 提示 3/3，共 24 个唯一文件、252 项。`pnpm build`、boundary、对固定 merge-base `aa4de404fc` 的 health（含 API 快照）及页面预算均通过，公开 API 相对该 main 无差异。27 个资源合计 7,793,234 字节，与新主线预算一致；未修改预算、baseline 或门禁。构建中的 4 条 xterm default-export 警告与上轮日志一致。

`affected-tests` 对固定主线报告 11 个改动文件、2 个包，建议 41 个非浏览器和 24 个浏览器文件；`full`、`storage`、`uncovered` 均为空。按本次机械词典合并、当前 README 与直接生产路径选测，不扩跑建议全集或全量回归。首个 health 进程启动早于 merge commit，实际比较旧基线 `27bb3c21`，该日志仅留作过程记录；有效结果是提交后重新检查的 `aa4de404fc` 基线。未新增测试失败；既有原生手势、最终安装包及用户验收未执行的边界保持。
