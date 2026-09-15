# Session 内容与原 Runtime 加载验收

## 完成等级

功能可用。项目内 Sessions 使用统一 `session_id` 展示真实 Registry 记录；详情按需读取 owning Runtime 的结构化历史并合并 Molis Work TUI / 生命周期事件；空闲 Codex Session 可以通过原生 resume 加载。跨 Runtime Handoff 的生成与目标 Session 创建仍属于后续 Work Item。

## Goal TUI 与关系恢复

- PTY spawn 显式携带 `session_id`，socket 把输出和退出状态交给 `SessionTuiRecorder`。
- TUI 正文使用 AES-256-GCM 文件存储，Registry 只保存内容引用与无敏感正文的元数据。
- Registry 关闭后重新打开，终端输出、退出状态、project、Goal 与 Session 关系仍可读取。
- Molis Work MCP 在成功选择、推进、提交 Evidence/Review 或完成 Goal 后，把当前 Goal 与最小状态事件写回对应 Session；相同幂等调用不会生成重复事件。
- 当前真实 Codex Session 已对账到 `session-content-runtime-load`；项目 Sessions 列表、详情“当前关系”和关联历史均显示该 Goal。

## 原 Runtime 内容与加载

- 真实 Codex app-server `thread/read(includeTurns=true)` 返回了 userMessage、agentMessage、commandExecution、fileChange、mcpToolCall、状态等历史；详情标为“Runtime 原生”。
- 当前真实 Session 页面加载了完整事件序列；用户消息和 Runtime 输出直接阅读，长工具/Artifact/终端记录折叠后按需展开。
- 当前详情搜索只过滤已加载的当前 Session 内容，没有建立全局正文索引。
- 真实空闲 Codex Session 的 `thread/resume(excludeTurns=true)` 成功；请求始终使用该 Registry 记录的 owning `runtime_id` 与原生 Session ID。
- 对已有 active writer 的 Codex Session，页面明确提示“已经在另一个 Codex 窗口运行，无需重复加载”，不显示虚假成功。
- 不支持原生 resume 的 Adapter 返回 `next_action=create_handoff`；不会把来源 Session 内容发送给其他 Runtime。

## 内容与隐私边界

- Session event 正文不进入 SQLite；密钥与密文权限为 `0600`。
- 原生 Runtime 历史只在请求内存和浏览器当前详情中存在，不做本地持久 cache。
- data URL 与长 base64/二进制字段在 Runtime 标准化边界替换为省略标记；页面不渲染图片二进制正文。
- 列表响应、错误响应与事件 metadata 过滤 credential、authorization、cookie、token、secret、env、body、content 等敏感键。
- `/api/sessions/:id/content` 与 `/resume` 同时校验 URL 当前项目和 Session 的项目关系；跨项目访问返回 404。

## 页面与交互检查

- 桌面：项目目录、Sessions 列表、Session 详情是与 Goals 相同的左侧目录 + 右侧内容层级；Hero 聚合状态、Runtime、Session ID、时间和动作，执行内容占主区域，Goal 关系位于右侧。
- 窄屏：`目录 → Sessions → 详情 → 运行` 四段切换可用；列表的搜索、内容能力筛选、选中态和返回箭头清晰；没有文本下划线式伪导航。
- `#sessions` deep link 会在事件监听器安装后打开目录并自动加载当前 Session 内容。
- 真实页面不再执行“页面内假装更改 Goal / 归档 / 创建 Handoff”的静态成功行为；当前 Goal 由真实 Goal 生命周期同步，未接入的 Handoff 只给出诚实入口。

## 自动验证

- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `tests/mcp.test.ts`：32/32 通过。
- Session 定向套件：17/17 通过，覆盖 Adapter、Registry、migration、加密、内容、resume、PTY 与 Web 项目隔离。
- `tests/web.test.ts tests/desktop-tui.test.ts`：81/82 通过。唯一失败是既有 Feed 窄屏 CSS 字符串断言 `tests/web.test.ts:1884`，检查的是 `.feed-detail` padding，与本 Work Item 的 Session 代码、API 和页面无关；没有修改该旧断言或 Feed 样式来制造通过。
- `git diff --check`：通过。

## 0.1.13 安装回归（2026-08-31）

- 先安装 0.1.12 后，真实 Registry 仍保留当前 Codex Session、Project 与 `session-content-runtime-load` Goal 关系，但原生内容返回 `content_mode=failed`；这证明不是 Session 数据丢失，而是 Runtime transport 不可用。
- 根因是受管 macOS LaunchAgent 的 `PATH` 没有包含 `~/.local/bin`，而本机 Codex CLI 位于该用户级目录。0.1.13 将该目录加入 Molis Work 自己生成的 plist，并保留旧 plist 的 `needs_repair → 确认 install` 安全升级流程；未知 plist 仍不会被覆盖。
- 本机安装 0.1.13 并确认修复服务后，`service status` 为 `running/owned=true`，`/health` 保持 10 个项目；当前 Session 的同一 `session_id`、原生 Runtime Session ID 和 Goal 关系均未变化。
- 同一条当前 Session 再次读取为 `content_mode=native`、`native_error=null`，共返回 6,042 个事件：60 条用户消息、318 条 Runtime 消息、2,425 条工具记录、343 个 Artifact，其余为状态与一条 Molis Work 关系事件。没有修改或重建 Session 数据。
- Codex、Claude Code 与 Grok Build 的受管 Skill/MCP 接入均事务式对齐到 0.1.13 并返回 `connected`；当前已运行的 Codex Session 没有被重启，新的 Runtime Session 才会加载新 Skill/MCP 清单。
- 第一次完整 TypeScript 门禁中，既有 300 Goal 性能断言在全套并行负载下耗时 106.1ms，超过 100ms 阈值；单独复跑为 8.7ms。系统负载恢复后再次完整运行，最终 **401/401** 通过，Session Web 同样通过。Desktop Rust 12/12、Rust format、版本一致性和 `git diff --check` 通过。

## 验收结论

1. Goal TUI 内容可持久恢复并准确关联 project / Goal / Session：通过。
2. 原 Runtime resume/load 使用 owning Runtime 与同一原生 Session；unsupported 明确降级：通过。
3. 内容最小化、来源授权、加密和敏感信息边界：通过。
4. 按来源按需展示可追溯时间线，当前详情可搜索：通过。
