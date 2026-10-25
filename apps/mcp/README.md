# MCP 工具适配

向 AI Runtime 提供 Molis Work 工具、输入 schema 和响应视图。维护工具名、参数、上下文呈现或协议错误时使用本包。

包名：`@molis-ai/molis-work-app-mcp`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

根 apps/desktop/launchers/mcp/server.ts 处理进程入口；Host 管理项目连接和调用身份。本包提供 MCP 协议（handleMcpMessage）、平台工具目录（连接工具与受信管理入口的工具）、连接工具与管理工具的分发，以及把动作目录里每个动作变成 MCP 工具的适配（`createActionMcpPorts`；名称 `molis_work_v1_action_<动作>__v<版本>` 由 `molisWorkActionToolName` 给出，产品代码里前缀只在这里出现）。Goals 与各插件的能力都经动作工具对外。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/protocol.ts](src/protocol.ts) | handleMcpMessage：协议处理 |
| [src/tool-catalog.ts](src/tool-catalog.ts) | 平台工具目录：7 个连接工具与受信管理入口的 initialize、event_decide、goal_tree_decide。插件与 Goals 能力都是动作工具，不在这里写死 |
| [src/tool-dispatch.ts](src/tool-dispatch.ts) | 三个管理工具的 wire 适配；只接 Host 构造的管理动作端口或 null |
| [src/launcher-validation.ts](src/launcher-validation.ts) | 启动器验证 |

可对照现有调用方 [apps/local-host/src/mcp-server.ts](../local-host/src/mcp-server.ts) 阅读装配方式。

## 接入与边界

Session 身份来自 Host 上下文，不能把模型提交的参数直接当作身份。工具 schema 与响应适配属于这里；Goal 事件事实和完成效果属于 Goals，可信用户决定属于 Governance，UI 不另算完成。插件的对外能力就是它声明的动作，由 Local Host 按授权列入目录，不进本包静态目录。作者与 Host 改法见 [Plugin 开发 · 对外 MCP](../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-mcp typecheck
pnpm --filter @molis-ai/molis-work-app-mcp build
```

已有行为示例与回归：[host-entry-consistency.test.ts](../../tests/host-entry-consistency.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/host-entry-consistency.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：MCP 工具 schema、受众划分与能力适配。
- 不负责：业务规则、直接访问 Store、Runtime Skill 政策。
- 公开入口：`@molis-ai/molis-work-app-mcp`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：apps → 组合根 → 公开合同（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - Runtime 与 Session 身份由 Host 写入，工具参数不能自填用户、批准或身份。连接工具（绑定、解绑、拒绝建议、新建并绑定、删项目）也不收 `actor_id`：操作者是 Host 记下的 MCP 客户端与 Runtime 会话（`ports.actorFor`），参数里带身份字段被 `mcp.unexpected_field` 拒绝，什么也不写；删项目交给 Host 的删除服务（`ports.deleteProject`），本包不自己开项目目录删。
  - 三个管理工具各调用一个 Goals 动作：`initialize` → `goals.board.initialize`（版本 2，S8：只收 `project_id` 与 `idempotency_key`，不再收 `title`），`event_decide` → `goals.decisions.record`，`goal_tree_decide` → `goals.tree.decide`。Host 私有的 `bindGoalsManagementActions` 复用命令行的本人身份、management 出处、动作自己的权限和单一授权；本包没有 Host 客户端、typed Goals 描述符或第二份工厂，Runtime 只得到 null 端口。
  - `goal_tree_decide` 不收身份：schema 里没有 `actor_id`、`actor_kind`、`audit_actor_id`、`runtime_actor_id`，`authority` 只指向对话出处，带 `actor_id`、`actor_kind`、`authority_source` 被宿主拒绝；决定记本机这个人，没有 Runtime 转交。`event_decide` 只取当前 schema 的业务字段，额外身份或 `authority` 仍以 `mcp.unexpected_field` 拒绝；Host 为它生成管理入口默认的对话出处。`initialize` 仍手选并转字符串，额外身份字段忽略。
  - 项目路径仍由 Host 解析，参数 `database_path` 优先于 `MOLIS_WORK_DATABASE`，没有默认路径。生产管理 MCP 先校验 wire 与身份/出处，经同一按需启动服务就绪后只向 Home 转发；不在 MCP 里准备目录、打开 Catalog/项目库或调用本地管理动作，项目归属由常驻 Host 再核。显式嵌入式管理入口保留原独立数据库路径及空预打开；前置身份、authority 或未知字段拒绝可无动作行、无编号。真正进入动作的调用只结算一次，结果或错误里的编号能查到这一行，客户端自带的 `_meta` 编号不读。
  - 精确授权但暂不可用的动作保留调用条目，`tools/list`隐藏；按原名字调用进入同一动作服务并保留原因、code与实际已记录的编号，未授权或provider/version不匹配仍拒绝。
  - 平台工具只有连接工具与受信管理入口的工具；其余能力都是动作工具，不进本包的静态目录，也不按名称写 `if`。
  - 生产启动器走常驻服务通道，缺宿主时只尝试当前 Home 的既有安装入口。健康签名验证通过后复核调用身份/取消再转发，不回退到本地 Host。缺入口等启动不可用时仍可发现静态连接工具，真正调用返回具体原因；结果未知不重放。
  - stdio 普通请求串行，最多排队 32 条；等待期间照常观察匹配请求的 cancellation 与输入 EOF，取消该请求的可信 AbortSignal。EOF 丢弃尚未派出的请求并结束在途 IO，不终止已常驻的 Host；工具参数和 `_meta` 都不能提供取消信号或 Host 停止权限。
  - Host 的 Runtime 安装验证只运行自己的 launcher 子进程；stdin 管道失败或退出经现有失败收口，收口后的 stdout（含同一 chunk 的后续消息）不再发送请求。管道监听保留到该子进程关闭，10 秒验证限额不变；失败由现有安装服务恢复配置、Skill 和既存 receipt，再次正常 launcher 可重新接入。
  - 说明或恢复目录不可读时返回真实连接并把对应内容置 null、附错误字段；不伪报空项目、不自动重新绑定。
生产 management audience 的三个 Goals 管理工具通过同一个常驻 Host 执行，实际动作沿用本次工具操作号；Host 验证目标是当前 Home 已登记的项目。显式嵌入式管理入口的独立数据库路径不变。Runtime audience 继续原动作网关。两者都不把明确拒绝、取消或送出后结果未知当成重发许可。

- 改动后必跑：`node scripts/run-tests.mjs tests/mcp-protocol.test.ts tests/mcp-action-grants.test.ts tests/mcp-action-settings.test.ts tests/action-mcp.test.ts tests/mcp-goal-events.test.ts tests/mcp-connection-identity.test.ts tests/runtime-skill-flow.test.ts tests/management-door-identity.test.ts`；安装验证改动另跑：`node scripts/run-tests.mjs tests/runtime-integration.test.ts`。
- 按需启动或 stdio 生命周期改动另跑：`node scripts/run-tests.mjs tests/mcp-stdio-lifetime.test.ts tests/security-invariants-mcp-autostart.test.ts tests/mcp-resident-autostart.test.ts`；最后一项使用隔离 Home 的真实安装产物与进程，安全拒绝文件也进入 `pnpm test:security`。
- 管理动作端口或 wire 适配改动另跑：`node scripts/run-tests.mjs tests/mcp-management-actions.test.ts tests/mcp.test.ts tests/mcp-goal-events-state.test.ts tests/proposal-entry-chain.test.ts tests/goals-query-boundaries.test.mjs tests/cli-goals-actions.test.ts`；同片同步 S-17 与 `pnpm test:security` 的公开管理拒绝用例。
- 相关手册：[docs/mcp.md](../../docs/mcp.md)、[specs/action-architecture/spec.md](../../specs/action-architecture/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/cli-and-development.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-dv1`, `goal-reorg-dv2`, `goal-reorg-gw4`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

连接工具的附带内容与公开动作共享精确授权：`context_resolve/bind/create_and_bind` 接受 Catalog 连接后，以同一客户端调用 `goals.guidance.read`、`goals.list`，必要时调用 `goals.directory.read` 恢复目录窗口外的焦点。生产 launcher 使用常驻服务通道，不能回退到本地 typed Host 读取。说明或恢复目录不可读时仍返回真实连接，对应内容为 null 并附 `project_guidance_error`/`resume_error`；不伪报空项目、不自动重新绑定。客户端或项目在等待期间改变则拒绝旧摘要。

错误由 `formatMcpToolError` 统一为 JSON `{ error, code, details?, call_id? }`，标准动作、上下文及管理工具共用 SDK 错误体。details 保留 owner 数据但不能覆盖 code 或伪造编号；只有 Host 确实记下的操作才给 call_id。旧的「错误文本加末行 JSON」和 message 字段已退役，调用方改读现行字段。
