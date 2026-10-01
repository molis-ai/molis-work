# Session 内容时间线与原 Runtime 加载

## 背景与目标

统一 Session 身份已经落到独立 Registry，但项目内的 Sessions 详情仍使用代表性静态内容，嵌入式 Goal TUI 的 PTY 回放也只存在 Web 进程内存中。用户目前不能在 Molis Work 重启后继续查看执行过程，也不能从统一 `session_id` 安全地回到拥有该 Session 的 Runtime。

本 Work Item 把 Session 详情改造成真实数据链路：Runtime 支持原生读取时按需取得结构化历史；Molis Work 自己持久化嵌入式 TUI 的终端输出与状态事件；两类来源合并成一条可搜索的时间线；“在 Runtime 打开”只调用该 Session 所属 Runtime 的原生 resume。能力缺失时明确给出 Handoff 入口，不伪造内容。

完成等级为「功能可用」：核心内容读取、TUI 重启恢复、当前详情内搜索和同 Runtime resume 真实工作；跨 Runtime Handoff 的最终生成流程、所有 Runtime 的原生 Adapter 和全局全文索引不在本项内。

## 当前行为与证据

- `src/web/project-session-workspaces.ts` 的 Session 记录、对话和按钮反馈都是静态原型，页面明确写着“不写入真实系统”。
- `MolisWorkPtyHost` 只保留每个 panel 最后 200,000 字符的内存 replay；进程退出或 Web 重启后内容丢失。
- `CodexRuntimeSessionAdapter` 已验证 `thread/read` 与 `thread/resume` 方法映射，但没有生产 transport、内容标准化或面向 Web 的服务。
- Codex app-server `thread/read` 可返回 turn/items；item 类型包含 userMessage、agentMessage、commandExecution、fileChange、mcpToolCall 等，适合标准化为统一时间线。

## 范围

- Session Registry schema v2：只新增 Molis Work 管理事件索引，不破坏 v1 Session、Goal history 和 migration receipt。
- Session 内容密文存储：TUI/Molis Work 管理内容以 AES-256-GCM 加密文件保存，SQLite 只保存引用与无敏感正文的结构元数据。
- PTY 输出与退出状态采集：panel spawn 明确携带 `session_id`；写入以 session 为边界，重启后仍可读取。
- Codex app-server stdio transport：初始化、请求关联、事件订阅、超时、退出与关闭；不会把请求正文或凭据写入日志。
- macOS 常驻 Web 的受管 PATH 必须包含用户级工具目录 `~/.local/bin`，使通过官方用户级入口安装的 Codex CLI 在 LaunchAgent 中也可被原生内容 transport 找到；只扩展 Molis Work 自己生成的 plist，不读取或改写 Session 数据。
- 内容服务：按 Molis Work `session_id` 查 owning Runtime/native ID，调用 Adapter read，标准化结构化历史并与 Molis Work 事件合并。
- Goal 生命周期回写：Runtime 成功选择、推进或完成 Goal 时，把当前 Goal 与最小状态事件写回 owning Session；不复制 MCP 请求正文。
- 同 Runtime resume：只向拥有该 Session 的 Adapter 发送其原生 ID；unsupported/failed 返回结构化恢复动作。
- 当前 Session 内存中搜索；不建立跨 Session 的正文索引。
- 项目 Session 详情 API 与现有高密度详情布局的真实加载/重试/打开行为。

## 非目标

- 跨 Runtime 加载同一个原生 Session。
- 把 PTY 字符流声称为完整 user/assistant/tool 结构化历史。
- 保存键盘输入、环境变量、认证头或 Runtime 请求体。
- 全局或跨 Session 的正文搜索、SQLite FTS、搜索片段预览。
- 自动把内容发送给另一个 Runtime。
- 完整 Handoff 生成与新 Runtime Session 创建；能力缺失时只提供明确的下一步入口。
- 删除旧 panel/work-context 兼容字段。

## 用户流程

1. 用户在 Goal 内打开嵌入式 Runtime TUI。WebSocket spawn 带上已经对账得到的 `session_id`；PTY 输出被分块加密持久化，退出写入状态事件。
2. 用户打开项目下 Sessions 目录并选择一条 Session。页面先显示 Session/Goal/workspace 元数据，再通过当前项目范围内的详情 API 按需加载内容。
3. Runtime 支持 read 时，Molis Work 取得结构化 turn/item 并标记为「Runtime 原生」；同时加载本地 TUI 事件并标记为「Molis Work TUI」。按来源顺序稳定合并，不去重不同来源的事实。
4. Runtime 不支持 read 或没有原生 ID 时，只显示 Molis Work 已持久化的事件；若两者都没有，明确显示不可读取而不是示例内容。
5. 用户在详情内搜索，只过滤当前已经加载到浏览器的事件，不向数据库建立正文索引。
6. 用户点击「在 Runtime 打开」，服务只调用记录中的 owning `runtime_id` 和 `native_runtime_session_id`。成功返回 resume 结果；unsupported 时提示创建 Handoff；失败时保留 Session 身份并允许重试。

## 数据与隐私边界

- `session_events` 保存 `event_id/session_id/source/kind/source_id/source_order/occurred_at/content_ref/metadata_json`；正文只能通过 `content_ref` 解密读取。
- 密钥文件和密文文件权限为 `0600`；key 与 blobs 位于 Molis Work home 的 `sessions/content`，不会进入项目数据库或 Web HTML 首屏。
- 原生 Runtime 历史默认只在请求内存中存在，不写入本地 cache；因此没有后台同步与跨 Runtime泄露。
- TUI 只采集 Runtime 输出和退出状态，不采集按键输入。终端控制序列在展示前移除；内容仍标为 partial terminal stream。
- 列表 API、Session 预览、应用日志和错误响应不得包含正文、凭据、env 或 app-server request params。
- 详情 API 只允许读取 URL 当前项目关联的 Session；不同项目返回 404。

## 统一时间线契约

`SessionTimelineEvent` 至少包含：

- `event_id`：来源内稳定 ID；
- `session_id`；
- `source`：`runtime_native | goalboard_tui | molis-work`；
- `kind`：`user_message | runtime_message | tool | approval | status | artifact | terminal_output`；
- `label/content/occurred_at/source_order`；
- `runtime_id` 与无正文的 `metadata`。

Codex 映射：

- `userMessage` → `user_message`；
- `agentMessage` → `runtime_message`；
- `commandExecution` / `mcpToolCall` / dynamic tool → `tool`；
- `fileChange` / image generation → `artifact`；
- turn status、review mode、compaction 与未识别 item → `status`。

每个 turn 使用 `startedAt/completedAt`；item 无独立时间时继承 turn 时间并以 item index 保持原顺序。Molis Work 事件按 `occurred_at/source_order` 排序。合并时先按时间、再按来源、最后按来源顺序稳定排序，响应明确提供 `content_mode=native|fallback|unavailable|failed`。

## 模块边界

- `src/sessions/content-store.ts`：加密正文读写、权限与引用校验。
- `src/sessions/registry.ts`：schema v1→v2 迁移和 Session event 索引事务。
- `src/sessions/content.ts`：Runtime 响应标准化、合并、当前内容搜索和 resume 结果。
- `src/sessions/codex-transport.ts`：Codex app-server 子进程协议边界。
- `src/install/web-service.ts`：为 Molis Work 自己的 LaunchAgent 提供可复现且最小的 Runtime CLI 查找 PATH。
- `src/web/pty-host.ts` / `pty-socket.ts` / `pty-client.ts`：显式传递 session identity 并采集输出/退出。
- `src/web/server.ts`：项目隔离的 Session content/resume API，服务生命周期与 transport 注入。
- `src/web/project-session-workspaces.ts`：现有高密度详情使用真实记录和 API；不新增另一套导航或容器层级。

## 验收标准

1. Goal TUI 终端输出与退出事件使用 `session_id`、project、Goal 关系持久化；关闭并重新打开 Registry/Store 后内容仍可读取；PTY 内存 replay 不是唯一来源。
2. Codex 原生 read 能标准化 user、runtime、tool、approval、status、artifact；保留来源和顺序。unsupported 不生成假历史。
3. resume 只调用 owning Runtime Adapter 和同一 native ID；没有能力时返回 `create_handoff`，不把内容传给其他 Runtime。
4. 内容正文加密存储；列表、日志和失败响应不泄露正文/凭据；原生历史不做持久 cache。
5. 详情 API 按 project/session 双重隔离；搜索只作用于已经加载的当前 Session 内容。
6. Session 详情移除静态“演示完成”行为，真实展示 native/fallback/unavailable/failed 与重试/恢复入口。
7. Runtime 选择或推进 Goal 后，对应 Session 的 `current_goal_id`、Goal 历史和 Molis Work 状态事件可被项目详情读取；同一个幂等调用不会生成重复事件。
8. Codex CLI 只位于 `~/.local/bin` 时，确认修复受管 LaunchAgent 后，Web 仍能启动 `codex app-server` 并读取原生 Session 内容；旧 plist 被识别为 `needs_repair`，未知 plist 仍不接管。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/session-content.test.ts tests/session-resume.test.ts tests/session-tui-capture.test.ts tests/session-content-privacy.test.ts
node --import tsx --test tests/session-registry.test.ts tests/session-migration.test.ts tests/session-adapters.test.ts
node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts
node --import tsx --test tests/service.test.ts
pnpm build
git diff --check
```

## 风险与恢复

- app-server 不可启动或请求超时：返回 failed，不丢失 Registry/TUI 内容；用户可重试或走 Handoff。
- 加密 key 丢失：事件索引仍保留但正文明确 unavailable；不得覆盖已有密文或静默生成新 key 解读旧数据。
- 高频 PTY 输出：采集器分批写入，单事件和总保留量设上限；WebSocket 广播不等待磁盘写入。
- schema 迁移失败：v1 数据事务回滚，reader 不假装打开成功。
