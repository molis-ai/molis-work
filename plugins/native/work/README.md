# 会话与交接体验

组合 Session、Runtime 和项目上下文，提供会话目录、内容读取、恢复和 handoff。Goal 终端（xterm、面板、连接）归工作台 `apps/workbench/src/terminal/`，项目工作目录的关联、修复与解除归 Host 的项目设置（SC-3）。

包名：`@molis-ai/molis-work-plugin-work`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

网页会话列表和工作区中的会话摘要通过 `sessions.directory.read` 读取原 Session 事实与 Runtime 支持情况；`sessions.list` 提供项目公开会话列表，`sessions.content.read` 读取归一化内容，`sessions.resume` 恢复指定原生会话。这四项由插件 manifest 声明，Host 启动时注册，内部调用、网页和授权 MCP 客户端走同一动作服务。恢复只加载会话，不等于发送消息。

普通消息使用 `sessions.message.send`、`sessions.message.read` 和 `sessions.message.retry`。发送须给出 Session、预期当前 Goal（明确无关联时为 null）、消息文本和稳定幂等键；可选上下文是调用方提供的材料，不会据此创建对象关系。三项均使用原 Session owner，发送和查询可并发，不会让状态读取等待网络返回。

`accepted` 仅表示 Runtime 已接收，并带原生 turn ID；`failed` 表示明确未接收，可由显式 retry 重试；`uncertain` 表示送达未确认，查询、重复 send 或 retry 均不会自动重发。`pending` 是尚未开始外部投递的持久请求。普通消息使用原加密内容存储，回执与会话时间线同一事务；断线或本地提交失败时不假报成功。状态请求属于原调用者和项目；正常会话内容仍遵守会话读取权限。

网页薄接口为 `POST /api/sessions/:sessionId/messages`、`GET /api/session-messages/:requestId`、`POST /api/session-messages/:requestId/retry`，输入/输出沿用动作合同。发送已接收返回 200，未确认返回 202，明确拒绝返回 409。首页“说一句”的对象验证、目标选择和状态呈现还需消费这些能力，后端接通不代表首页已完成。

原 `/api/sessions` GET、内容 GET 与恢复 POST 保留为薄转发。项目停用插件后这些入口拒绝调用；已有会话、关联、历史和授权引用不删除，重新启用后继续可用。读取和恢复在原生等待前后检查调用权限及会话所属项目、原生身份和关联；等待期间撤权或改变关联时不返回失效内容。

SessionDirectoryService 继续处理发现/创建，SessionContentService 继续处理内容与恢复，SessionHandoffService 继续准备并交付交接包。Registry、Runtime adapter、内容服务和 recorder 由系统 Host 的一个资源实例持有，网页借用该实例，关闭借用方不关闭 Host。创建、关联与交接的旧业务入口仍在迁移。

目录发现、创建和交接按每次 Action 传入原 `signal/beforeEffect/assert_authority_current`，原生等待返回后在本地提交或下一次派发前复查，并在最后一次等待后同步检查；取消、撤权或停用后不新增 Session 关联、草稿、失败记录或继续派发。已经创建但未获本地提交授权的外部目标保留未知，不自动重建。普通消息只有已经接受的真实 turn 回执可收敛原幂等请求，调用者仍须通过返回前复查；失败或未知结果不套用这个例外，保持未确认请求，恢复不重发。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/actions.ts](src/actions.ts) | 共同动作合同与处理器 |
| [src/directory.ts](src/directory.ts) | 会话发现和创建 |
| [src/messages.ts](src/messages.ts)、[src/message-actions.ts](src/message-actions.ts) | 普通消息发送、去重、回执与重试 |
| [src/content.ts](src/content.ts) | 内容与恢复 |
| [src/handoff.ts](src/handoff.ts) | 交接用例 |
| [src/http/index.ts](src/http/index.ts) | 会话 HTTP 路由（含在某个工作目录里启动会话） |
| [src/ui](src/ui) | 会话界面 |

可对照现有调用方 [apps/local-host/src/web-work-session.ts](../../../apps/local-host/src/web-work-session.ts) 阅读装配方式。

## 接入与边界

Session 事实归 Private Work Context，跨对象关联归 Ledger，进程归 Runtime Host。交接包保持私人内容，不自动发布 Artifact/Team 数据。发送失败、重试和取消保留对应状态，不能把准备完成视为发送成功。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-work typecheck
pnpm --filter @molis-ai/molis-work-plugin-work build
```

已有行为示例与回归：[session-handoff.test.ts](../../../tests/session-handoff.test.ts)、[session-directory.test.ts](../../../tests/session-directory.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/session-handoff.test.ts tests/session-directory.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：会话、Runtime、恢复与交接界面。
- 不负责：Session/Run/Goal 事实、Runtime 适配器实现、Goal 终端（工作台）、项目工作目录的关联与修复（Host 项目设置）。
- 公开入口：`@molis-ai/molis-work-plugin-work`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`；第三方依赖见 `package.json`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 发送必须给出 Session、预期的当前 Goal、文本与稳定幂等键。
  - `uncertain` 表示送达未确认：查询、重复发送或重试都不自动重发。
  - 等待期间撤权或关联改变时不返回失效内容；交接包保持私人，不自动发布。
- 改动后必跑：`node scripts/run-tests.mjs tests/work-session-actions.test.ts tests/work-session-ui.test.ts tests/session-handoff.test.ts tests/session-messages.test.ts`
- 相关手册：[docs/modules/private-work-context.md](../../../docs/modules/private-work-context.md)、[docs/horizontal/runtime-host.md](../../../docs/horizontal/runtime-host.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/private-work-context.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-wk3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`sessions.home.events`提供当前项目在请求窗口内更新的会话事项。数据来自原 Session Registry，打开目标为原 session_id；不会选取其他项目的会话。关联 Goal 名称走共同对象查询，无权读取时保留 Session 已有的 Goal ID。它只投影事项；“说一句”的上下文、目录选择与真实投递仍分别使用对象查询及 Session 消息能力。
