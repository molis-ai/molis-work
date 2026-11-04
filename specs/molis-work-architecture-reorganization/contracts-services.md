# 架构重组基线：横向服务合同

状态：架构重组时的设计与合同记录（2026-09，含正文注明的后续补充），2026-11-03 从需求书分出，保留原章节编号。这里的“已确认”“未实现”、目录与接口示例属于当时基线，不是当前包/API 清单；实际层次、成熟度和依赖以[SSOT](../../docs/SSOT-MATRIX.md)与[现行架构](../../docs/system/ARCHITECTURE.md)为准。原 §20.12/§20.14 两个模块及其他已删除机制的说明见[总需求书开头](spec.md)。

[总需求书与验收](spec.md) · [§19 基础包](contracts-foundation.md) · [§20 模块](contracts-modules.md) · [§21 服务](contracts-services.md) · [§22 插件](contracts-plugins.md) · [§23 应用与工具](contracts-apps.md)

## 21. Horizontal Service Contract

Horizontal Service 是可重建运行机制。它可以保存 queue、cursor、lease、retry、connection health 等技术状态，但不能拥有 Module 正式事实或替 Module 做业务决定。

### 21.1 `horizontal/connector-host`（已确认）

**大白话：** “统一管理怎样连接和调用一个外部系统”。

**提供：**

- Provider Driver 注册、版本/能力发现、connection instance 创建、健康检查和关闭。
- 授权 handshake / refresh 的安全编排、rate-limit / provider error 归一与 Connection Receipt。
- read、send、write-back 等由 Driver Contract 明确定义的类型化 operation invocation。
- Connection Context、deadline、cancel、trace 和已获 grant 的 Secret / Network Adapter handle。

**技术状态：**

- 活跃 connection session、provider health、rate-limit window、refresh attempt、operation attempt 和短期 connection cache。
- Secret bytes 由 Keychain / Secret Adapter 持有；Connector Host 只使用不可导出的 credential reference。

**边界：**

- Sources Module 保存用户配置的 Source、期望启停和 connection reference；Connector Host 不创建或修改 Source。
- Listener Host 使用 Connector Driver 维持长期接收；Actions 内部 dispatch worker 使用 Connector Driver 执行 External Action。
- Integration Plugin 实现 GitHub、Gmail、Slack、IM 等 Driver；Host 不硬编码 Provider 业务字段。
- 不保存 Signal、Feed Item、Action、Goal、Artifact 或 Provider 自定义业务 Payload。
- 不提供一个可绕过 typed Driver Contract 的通用 HTTP escape hatch。

**当前抽取与验收：**

- `src/feed/connectors/` 的通用连接、授权、错误、rate limit 与调用生命周期是主要来源；GitHub / Gmail 细节进入 Integration Plugin / Adapter。
- 测试覆盖 credential 不泄露、refresh 并发、rate limit、provider unavailable、grant 撤销、cancel、Driver crash 和连接恢复。

### 21.2 `horizontal/listener-host`（已确认）

**大白话：** “让一次外部连接长期运行，并且重启、断线后不漏也不重”。

**提供：**

- Poll、stream、webhook subscription 等 Listener Driver 的统一 lifecycle。
- Cursor / checkpoint、lease、heartbeat、retry / backoff、断线重连、catch-up 和重复投递抑制。
- 根据 Source desired state 启动、暂停、恢复和停止 listener，并返回运行 Receipt / health。
- 持久暂存带 provider identity、cursor 和 provenance 的 Raw Event，调用 Integration Plugin 注册的 Listener / Signal Adapter 转换为 Signal Draft。
- 通过 Signals Command 可靠提交 Draft；只有收到接受或明确隔离 Receipt 后才按 Contract 推进 cursor。

**技术状态：**

- Listener instance、cursor、checkpoint、lease、retry schedule、durable raw delivery / quarantine、last delivery、health 和 crash recovery state。
- 这些状态可从 Source 配置和 Provider checkpoint 重建，不成为 Source 或 Signal 业务事实。

**边界：**

- Sources Module 决定“监听哪里、是否启用和期望频率”；Listener Host 只执行该意图。
- Connector Host 建立 Provider connection；Listener 不处理 credential、Provider OAuth 或 External Action。
- Integration Plugin 的 Adapter 只做 Provider protocol / field 到 Signal Draft 的技术翻译，不能决定 Feed、Attention、Goal 或 Automation 行为。
- Signals Module 执行正式 Schema、scope 和 dedupe 校验并创建 Signal；Listener 不直接写 Signal Store。
- Schedule wakeup 可以由 Horizontal Scheduler 触发，但 missed slot / retry 机制仍由 Listener 的运行 Contract 管理。

**当前抽取与验收：**

- `src/feed/sources/scheduler.ts`、Source cursor / run、Connector polling 和 Web server timer 是主要来源；用户配置的 schedule intent 留在 Sources Module。
- 测试覆盖重启恢复、相同 cursor 重投、乱序、lease 竞争、错过多个 schedule slot、backoff、暂停竞态、Adapter 解析失败隔离、升级后重放和 Signals Receipt 前不推进 cursor。

### 21.3 `horizontal/scheduler`（已确认）

**大白话：** “到指定时间，可靠地叫醒一个已注册 Capability”。Scheduler 不理解为什么要触发，也不拥有重复规则。

**提供：**

- `scheduleWakeup`、`cancelWakeup`、`rescheduleWakeup` 和 due wakeup delivery。
- Durable one-shot wakeup、lease、并发 claim、进程重启恢复、missed wakeup catch-up 和 delivery Receipt。
- Deterministic Clock port、批量扫描、backpressure、技术 retry / backoff 和诊断。
- 根据 `owner_capability + object_ref + wakeup_key` 做幂等注册和投递。

**技术状态：**

- `wakeup_id`、owner capability、opaque object reference、`due_at`、wakeup key、attempt、lease、last delivery 与 terminal technical status。
- payload 只能是受限引用和 Contract version，不保存 Source config、Automation condition、Action parameters 或 Attention 内容。

**Owner 分工：**

- Sources Module 保存 interval / desired schedule 并计算下一次 `due_at`；Scheduler 到点调用 Listener Host，Sources 根据 Receipt 决定并注册下一次。
- Automation Module 保存 time trigger / rule，Scheduler 只唤醒 Automation evaluation。
- Actions / Attention 未来可以注册业务已决定的 retry / snooze 时间；Scheduler 不替它们判断是否仍应执行。
- 技术 delivery failure 可以按统一策略重试；业务失败是否再次执行由 owner 收到 Receipt 后决定。

**边界：**

- 不保存 cron / interval 业务定义，不解析 Module 对象，不直接创建 Signal、Action、Attention 或 Automation Run。
- 不替代 Listener 的 cursor / poll recovery、Actions 的 external idempotency 或 Runtime Host 的 process timeout。
- 所有 delivery 通过 Kernel Capability Router，不能持有 owner implementation callback 或 Store handle。

**当前抽取与验收：**

- `src/feed/sources/scheduler.ts` 的 durable planned slot / overlap / catch-up、Web server timer 和相关测试是主要来源；Source interval 计算迁回 Sources Module。
- 测试覆盖同 key 重复注册、取消竞态、多个 Scheduler instance lease、休眠后 catch-up、Clock jump、owner unavailable、技术 retry 和 owner 业务失败不自动循环。

### 21.4 `horizontal/runtime-host`（已确认）

**大白话：** “统一启动、恢复、停止和观察真正执行工作的 Runtime”。它执行技术调用，但不拥有 Execution Run 或 Work Session 的正式状态。

**提供：**

- Runtime Provider 注册、capability discovery、版本/兼容检查和 provider selection descriptor。
- start、resume、send input、stream output、interrupt、cancel、stop 与 health probe。
- invocation handle、deadline、timeout、resource lease、stream cursor、backpressure、crash detection / recovery 和技术 Receipt。
- Local Process、Terminal / PTY、Codex app-server、Remote Agent 等 Runtime Adapter port。

**技术状态：**

- 活跃 runtime connection / process handle、invocation handle、stream cursor、resource lease、provider health 和 crash recovery state。
- 可重建的 output buffer / transport state；长期 conversation / terminal content reference 由 Private Work Context 保存。

**调用方分工：**

- Execution 创建正式 Run 后调用 Runtime Host，收到 invocation / outcome Receipt 后再更新 Run。
- Private Work Context 创建或恢复 Session 时调用 Runtime Host，收到 resume / content Receipt 后更新 Session。
- App 可以请求显示 stream，但不能绕过 owner Module 直接把 Runtime outcome 写成 Goal completion 或 Artifact。

**边界：**

- 不拥有 Claim、Run、attempt、Goal status、Session registry、Workspace、conversation lineage 或 Artifact。
- 不实现具体 Codex、Terminal、container 或 remote protocol；这些属于 Adapter / Runtime Provider Plugin。
- 不替代 Kernel 的通用 Capability 路由；Runtime Host 只定义 Runtime execution contract 和技术 lifecycle。
- Provider Binding 由 Kernel / Host composition 决定，Runtime Host 只验证所选 Provider 能力并执行。

**当前抽取与验收：**

- `src/sessions/adapters.ts`、Codex transport、PTY client / server、Web runtime resources 和 Desktop native bridge 是主要来源。
- 测试覆盖 provider unavailable、resume unsupported、stream 断开恢复、timeout、interrupt vs cancel、process crash、重复 Receipt、resource cleanup 和切换 Adapter 后 Contract 一致。
- 验收时 Runtime Host 可以用 fake provider 独立测试，不导入 Execution Store、Session Registry implementation、Web Server 或 Tauri implementation。

**WK2 执行合同（2026-09-02）：**

2026-09-05 恢复验证发现两项可复现的 Runtime 生命周期缺陷：并发首次请求可抢在 initialize 完成前发送；initialize 超时后进程未清理且重试复用未初始化连接。WK2 的启动、恢复与资源清理验收包含修复这两项；保留已完成请求和业务状态，不自动重放写请求。

- 完成等级：功能可用的无损迁移；本 Goal 完成自动化 Contract、边界、定向与全量回归，统一人工端到端验证按第 24 节在全部架构开发完成后执行。
- `@molis-ai/molis-work-contracts/services/runtime-host` 是 Runtime capability、Provider Adapter、transport result/error 的唯一类型入口；`horizontal/runtime-host` 只通过公开入口对调用者开放。
- `horizontal/runtime-host` 接收现有 Runtime router、Codex app-server transport/Adapter 与 Terminal/PT​Y process host；不导入 Execution Store、Private Work Context Registry、Web Server 或业务写入实现。
- 未知 Runtime 的 Session registry fallback 仍属于 Private Work Context 兼容编排，不能被 Runtime Host 吸收；WebSocket 鉴权和 Session 内容记录仍属于 Web/Work Plugin 调用层。
- 旧 `src/sessions/adapters.ts`、`src/sessions/codex-transport.ts` 与 `src/web/pty-host.ts` 只保留薄兼容出口；生产 Web composition、PTY socket 和 Session 内容服务改用新包公开 API。
- 验收：fake Provider 的注册、能力矩阵、调用与 unsupported；Codex 请求/事件/失败恢复；PTY spawn/attach/write/resize/kill/crash/resource cleanup；无 owner 深层导入、无跨 owner Store、旧实现入口不再保留 provider/process 细节。

### 21.5 `horizontal/search`（2026-09-28 增补，`specs/archive/system-search/spec.md`）

- 负责：经共同动作目录发现插件声明的搜索来源（`molis.search.entries.v1`、按需的 `molis.search.query.v1`），维护可重建的本地索引（集合版本与条目版本增量比对、删除清理、失败保留与重试、停用与卸载清理），按调用者当前授权过滤并聚合结果，打开前经原插件读取器核对。
- 技术状态：`{home}/search/search.db`（来源版本、同步时间与错误；条目版本、允许持久化的文字、打开位置），由 `packages/storage` 的 `openTextSearchIndex` 实现；整份可删除重建。
- 不负责：插件的存储与业务规则、对象正文的解释、权限授予与可信身份、会话与助理交互；不读任何插件私有库。
- 入口：Host 在 Home 注册一次系统动作 `search.query/open/status/rebuild`（`system.search`），页面、助理、工作流、MCP 经同一目录调用。
