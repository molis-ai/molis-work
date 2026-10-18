# Shelf 原件来源授权核查（负责人：主会话）

只读，S `a939521a3`；未改源码或运行构建、测试、真实 Home/桌面。**Shelf 现无可直接复用的原件授权凭据；可复用原生选择器、只读书签和安全读取实现，不能复用网页路径或把工作准备的授权扩大给 Shelf。**

## 事实与当前风险

- `plugins/native/shelf/src/actions.ts:140–151`：文件 origin 仅查 `audience=user`，folder 连该检查都无；`route-handlers.ts:37–62` 转发网页正文。`modules/shelf/src/store.ts:230,310` 只 path.resolve；origin_hash 来自提交副本 bytes，不能证明路径被选取过。
- `store.ts:454,523,829` 在任务前、提交前核原件：文件夹和不存在的文件直接跳过；其他用无界 readFileSync，跟随链接。伪路径可触发本机读/存在及 hash 判定，大文件或特殊文件可阻塞。副本与冻结 input 的 hash 是另一条已有保护，须保留。
- Rust `apps/desktop/adapters/tauri/src/shelf_http.rs:25–94,256`：原生拖放/Finder/热键确实取得文件 bytes，但通过普通 HTTP JSON 提交 origin，认证仍是网页同款 control token、Origin、一次性键，没有 native 来源证明。`main.rs:630–649` 的 shelf_admit_paths 直接读页面给的路径，不绑定 Spotlight 结果或系统选取；搜索结果也只是字符串。
- `apps/desktop/src-tauri/capabilities/default.json`、`permissions/shelf.toml` 仅限制 main/capsule、本机4173与命令名单，不能授权每个文件；S-14 还记有同源 iframe 可达性未实测。可复用 `context_directories*.rs` 的 caller 前后复查、操作锁、NSOpenPanel、只读 security-scoped bookmark与失效拒绝，及 `context_directory_files.rs` 的目录 FD/openat/O_NOFOLLOW、类型和大小限制。现命令只允许 main `/onboarding`、四个目录 ID，授权文案是工作准备预览/整理；复用底层，不直接借用 grants 或照搬其6MB/文件类型限制。

## 推荐最小合同

1. 公共 admit/admit-folder 只接副本 bytes，普通 origin 字符串不能产生读权。原生真实拖放、Finder/系统选取，或原生登记的搜索选取引用，才能建立只读来源绑定；shelf_admit_paths 改为只消费该引用，拒绝页面任意路径和伪 native 标志。
2. 可信本机 owner 持有绑定（Home、Shelf item、确切文件身份、只读授权）；Shelf 按 item 请求核验，不获得外部 fs。Host/desktop 交接需网页不可伪造的来源能力：现共享 Web token **不够**，也不存在可直接使用的 Host origin-verifier。窄接口只返回核验结果，不接任意 path、不回传外部正文；任务前和提交前重核原调用、item、授权。hash 是当时观察，不保证外部文件以后不变。
3. 既有 origin_realpath 原字节保留为定位线索，**不自动转为授权**、不历史兜底读、不改为“已校验”。需核原件时明确显示“尚未授权/不可访问”并暂停任务；本人原生重新选取后，真实内容必须匹配旧 origin_hash，不匹配仍报告原件变化、不改旧 hash。副本浏览、导出、管理照常。桌面未运行、文件缺失、书签失效也显式暂停，不能静默算通过。
4. 本片保留文件夹现有副本/input hash语义，明确尚无文件夹原件一致性保证；增加目录全树原件扫描属于另一个行为扩展。

**不需要现在自造审批。** 阻止路径授予读权、显式失败及按需原生重新选取，是修复信任边界的最小建议，授权发生在导入/选取场景。只有希望旧记录无人重新授权仍自动校验，或原件缺失仍继续任务，才需明确新的产品选择；现有记录不能证明这两种授权。原生来源绑定和私有交接仍需实现，不能只完成 owner 文件树便声称原件核验迁移完成。
