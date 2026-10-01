# Session 内容隐私与保留

## 内容所有权

- Runtime 原生历史仍由原 Runtime 持有。Molis Work 只在用户打开 Session 详情时按需读取，并在该请求生命周期内标准化，不做持久 cache。
- Molis Work 嵌入式 TUI 产生的终端输出属于 Molis Work 管理事件。它以加密正文 + SQLite 引用保存，用于重启后回放和弱能力 Runtime 的 fallback。
- `session_id`、Runtime ID、native ID、project/Goal/workspace 关系属于可列举元数据；Session 正文不进入列表或搜索索引。

## 不会发生的隐式传输

- 读取 Session 不会创建 Runtime、不会 resume、不会生成 Handoff。
- resume 只调用这条 Session 的 owning Runtime；不会把正文交给另一个 Runtime。
- Handoff 是未来独立、需要用户确认的流程；本 Work Item 只返回 `create_handoff` 下一步提示。
- Molis Work 不采集 PTY 键盘输入，不保存启动 env，不记录 app-server params。

## 本地加密与权限

- Session TUI 正文使用 AES-256-GCM；每条 content ref 绑定 AAD 并在读取时验证 SHA-256。
- 密钥与 blob 文件仅对当前用户可读写（`0600`），目录位于 `<molis-work-home>/sessions/content`。
- SQLite `session_events` 不保存正文，只保存 content ref 与经过白名单筛选的结构元数据。
- 如果 key 缺失而已有 blobs，写入失败关闭；不会生成新 key 覆盖旧内容。

## 保留与删除

- 单条 TUI 内容有大小上限；PTY 输出按块保存并标记为 partial terminal stream。
- 当前版本随 Session 保留事件索引和密文；归档不会删除 Runtime 原生历史或本地密文。
- 自动过期、按 Session 删除和导出属于后续内容治理 Goal；在实现前 UI 不承诺“删除 Runtime 内容”。

## 展示与日志

- 只有项目范围内的 Session 详情 API 返回解密正文。
- 列表行、Hero 事实、错误消息和服务日志不得包含正文、token、authorization、cookie、secret、password 或完整 env。
- 终端 ANSI 控制序列在 Web 展示前剥离；来源始终标为「Molis Work TUI · 部分终端记录」，不能冒充原生逐轮历史。
- 当前详情搜索完全在已加载内容上进行，不向服务器创建跨 Session 正文索引。
