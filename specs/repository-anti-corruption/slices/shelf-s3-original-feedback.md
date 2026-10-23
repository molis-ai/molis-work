# Shelf S3 原件登记的部分成功反馈

状态：本地实现与定向工程验证完成，待统筹集成（2026-10-23）。补 #1076 合后评审 P2，目标为功能可用；真实原生手势与一骏本人验收另记。基线为 `27bb3c21252003ea51b4b85394278eb773d12df6`，不携带其他客户端迁移片。

## 问题与范围

Shelf 上传已保留副本，原件登记失败时回 `original_registered: false`；桌面 Rust 只取 `item_id`，因此把部分成功当成完全成功。现有 `molisWorkShelfNotice` 只在父窗口发事件，不能保证关闭的 Shelf 或隔离 iframe 中可见。

桌面 HTTP 解析返回成功回执 `{ item_id, original_registered: Option<bool> }`；只有明确 `Some(false)` 提示“副本已收下，但未能登记原件；后续处理将无法核对原件是否变化。”。`true`、缺标记静默，真正失败仍返回 `Err`。目录可包装为无标记；不改变 canonicalize 失败时不发送 `original: true` 的现有行为。

剪贴板接收、拖放轮盘、热键文件/图片收取及 `shelf_admit_paths` 消费同一回执，保留成功 ID、数量、顺序与后续动作。复用桌面已有 `molisWorkShelfNotice(message, partial?)`，默认仍为错误；保留旧事件并经共同 `molisWorkRequest.toast` 显示在顶层现有 toast 节点，部分成功标 `data-mw-state="partial"` 并去掉 `is-error`。后台入口不显示窗口、不抢焦点，主动热键原成功 show/refresh 保持。热键批次同时出现副本成功、原件登记失败与其他文件真正失败时，仍返回真实错误，并在原失败摘要后保留原件警告。隐藏窗口不宣称系统通知已送达。

允许路径：`apps/desktop/adapters/tauri/src/shelf_http.rs`、四个消费入口文件、`apps/desktop/src/shell.ts`、直接回归测试与本规格。新增独立 Shelf HTTP 测试，不改在途片的 Shelf README、`tests/shelf-plugin.test.ts`。不改 iframe、SDK、公开合同、业务存储、权限、共享 roadmap 或 privileges 状态，不新增 toast 容器或日志。

## 验收

- PG-026-S1-S3-1：Rust 生产解析与回执消费测试覆盖 `false`、`true`、缺标记、无 item、错误响应；部分成功仍取到原 ID，只有明确 false 调警告。
- PG-026-S1-S3-2：四个桌面入口保留成功计数、顺序和原后续动作，统一调用已有通知入口；后台剪贴板和轮盘没有新增 show/focus。Rust 类型检查和直接回归覆盖接线。
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
