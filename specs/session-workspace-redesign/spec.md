# 统一 Session 身份与 Runtime 适配基础

## 背景与目标

Molis Work 目前把 Runtime 宿主提供的 `stable_work_context_id`、桌面 panel 自己生成的 `work_context_id`、原生 Runtime Session ID 与项目绑定混合使用。它能完成项目路由和 TUI 面板恢复，但没有一条 Molis Work 自己拥有的 Session 记录作为业务入口，后续内容读取、目录管理与 Handoff 会被迫继续识别多种 ID。

本 Work Item 建立独立的全局 Session Registry：Molis Work 创建并持有 `session_id`，Runtime 原生身份、短期 correlation、UI surface、项目、Goal 与 workspace 都只是它的不同关系。Runtime Adapter 通过统一能力契约决定 native、registry fallback 或 unsupported 调用链，业务代码不按 Runtime 名称分支。

这份规格对应 Molis Work Goal「建立统一 Session 身份与 Runtime 适配基础」，是当前行为变更的唯一实现需求书。`specs/project-session-workspace-rebuild/spec.md` 只负责已验收的界面切片，不定义真实 Session 数据行为。

## 当前行为与问题证据

- `RuntimeWorkContext.stable_work_context_id` 被描述为宿主 Session/work-entry identity，但桌面 panel 直接把 `panel_id` 作为 `MOLIS_WORK_WORK_CONTEXT_ID`。
- `runtime_context_bindings` 保存 `(runtime_id, stable_work_context_id) -> project_id`，没有独立 `session_id`、原生身份来源、Goal 历史或内容能力。
- `goal_desktop_panels` 同时保存 panel、work context、可选 host session；后到的 `_meta.threadId` 再作为别名写回。
- `runtimeContextHostFromEnvironment` 直接读取 `MOLIS_WORK_PANEL_ID`、`MOLIS_WORK_GOAL_ID` 与 `MOLIS_WORK_WORK_CONTEXT_ID`，兼容逻辑进入 MCP 主调用链。
- 本机 `codex-cli 0.151.0` 生成的 app-server protocol 明确提供 `thread/start`、`thread/list`、`thread/read`、`thread/resume`，并提供 thread / turn / item 事件通知；这些可作为 Codex 原生能力证据。

## 范围

- 独立的全局 `sessions.db` 与 Molis Work Session 领域模型。
- Session Registry 的创建、原生身份补全、显式外部关联、项目/Goal/workspace 关系、Goal 历史和隔离查询。
- Runtime Adapter 公共契约与 `create/list/discover/read/resume/events/handoff` 能力矩阵。
- Codex app-server 原生方法映射；传输边界可注入，调用结果保留 native、unsupported 与 failed 状态。
- 通用 registry fallback：只创建、列出 Molis Work 创建/托管/显式关联记录；其他能力明确 unsupported。
- legacy catalog binding、desktop panel 和旧环境变量的兼容迁移、对账、幂等与回退。
- MCP 项目解析结果附带 Molis Work `session_id`；不同宿主 Session 的连接继续隔离。
- 定向单元测试、迁移测试和 MCP 多 Session 回归。

## 非目标

- Sessions / 工作目录目录页接入真实数据。
- 完整读取或渲染 Runtime 对话内容。
- 在原 Runtime 打开、续跑或 Handoff 的最终用户流程。
- 删除旧 catalog binding、panel 字段或旧环境变量。
- 为 Claude Code、Grok Build 或未知 Runtime 猜测原生能力。
- 新增持久默认项目、默认 Goal 或默认工作目录。

## 用户与调用场景

1. Codex Session 首次被用户确认关联项目后，Molis Work 建立自己的 `session_id`，原生 thread ID 只保存为 `runtime_id=codex` 命名空间下的原生身份。
2. Molis Work 从项目 Goal 中启动 panel 时，先创建 Session 与短期 correlation；Codex 后续通过 `_meta.threadId` 报到后，凭相同 surface/correlation 补全原生身份，不创建第二条 Session。
3. 用户显式关联一个外部 Runtime Session 时，Registry 创建或复用该原生身份，并记录项目、当前 Goal 与 workspace；没有确认则不写。
4. 原生支持 discover 的 Adapter 可同步标题、状态、时间等元数据，但不得自动写入项目、Goal 或 workspace 关系。
5. 未知 Runtime 仍可创建 Molis Work 托管记录；读取、事件或 resume 缺失时返回结构化 unsupported，不制造假内容。
6. 同一 workspace 内两个 Session 具有独立 `session_id`、项目、Goal、原生连接与事件，不因目录相同互相覆盖。

## Identity model

| 身份 | 所有者 | 作用 | 禁止用途 |
| --- | --- | --- | --- |
| `session_id` | Molis Work | 业务入口、目录与关联主键 | 不冒充 Runtime 原生 ID |
| `runtime_id` | Molis Work Adapter Registry | 选择能力与命名空间 | 不作为 Session 唯一键 |
| `native_runtime_session_id` | Runtime | 原生读取、resume、事件订阅 | 不跨 Runtime 比较；不从 panel/workspace 推导 |
| `correlation_token` | Molis Work | 创建后、原生 ID 返回前的短期关联证明 | 不长期作为原生身份；过期后不可补链 |
| `surface_id` | Molis Work UI/宿主 | 指向 panel 或其他展示入口 | 不代表 Session 内容或 Runtime 身份 |
| `project_id` | Molis Work Project Catalog | 用户确认的项目关系 | 不由路径、标题或候选自动决定 |
| `current_goal_id` / Goal history | Molis Work Session Registry | 当前执行焦点与历史追溯 | 不由打开页面偷偷改变 |
| `workspace_id` | Molis Work workspace normalization | 用户确认的工作目录关系 | 不作为 Session ID 或持久默认关系 |

Session Registry 使用 `/sessions/sessions.db`，与项目事实数据库和 project catalog 分离。关联跨库只保存稳定 ID，不建立跨 SQLite 外键。Registry 的写入事务独立、可回滚，旧 catalog 数据始终保留。

## Runtime Adapter contract

每个 Adapter 必须声明七项能力，值只能是：

- `native`：调用 Runtime 已验证的原生接口。
- `registry`：只使用 Molis Work Registry 中已确认的事实。
- `unsupported`：明确返回能力缺失，不降级成另一种含义。

公共调用返回：

- `ok`：携带 `source=native|registry` 与结果。
- `unsupported`：携带 capability、稳定错误码和可恢复说明。
- `failed`：保留 Runtime 错误边界，不把失败伪装为空列表或空内容。

Codex Adapter 映射：

| Capability | app-server method / signal | Mode |
| --- | --- | --- |
| create | `thread/start` | native |
| list | `thread/list` | native |
| discover | `thread/list` metadata | native |
| read | `thread/read` | native |
| resume | `thread/resume` | native |
| events | thread / turn / item notifications | native |
| handoff | `thread/start`，输入由后续 Handoff Goal 构造 | native |

通用 fallback 仅 `create=list=registry`；`discover/read/resume/events/handoff=unsupported`。新增 Runtime 通过注册 Adapter 扩展，不修改业务服务的 Runtime 名称条件分支。

## 数据与写入规则

- 创建含项目、Goal、workspace 或外部原生身份的 Session 必须带当前操作的 `user_confirmed=true`。
- 原生 discover 只可 upsert 无关联元数据；任何项目、Goal 与 workspace 关系仍需单独确认。
- correlation 默认 15 分钟；只有 session、runtime、surface/correlation 都匹配时可无第二次确认补入晚到的原生 ID。
- 显式改变当前 Goal 会关闭旧 current link 并追加历史，不覆盖历史行。
- 原生身份唯一键为 `(runtime_id, native_runtime_session_id)`；不同 Runtime 相同字符串互不冲突。
- Registry 所有 project/session 查询必须按 `session_id` 或明确的关联字段过滤，workspace 不能扩大查询范围。

## 模块边界

- `src/sessions/types.ts`：身份、能力、结果和错误模型。
- `src/sessions/registry.ts`：独立 SQLite Registry、关联事务和隔离查询。
- `src/sessions/adapters.ts`：Adapter Registry、Codex 原生映射与通用 fallback。
- `src/sessions/compatibility.ts`：旧环境变量解析、catalog/panel 对账与幂等迁移。
- `src/mcp/server.ts`：消费兼容后的宿主上下文，并在项目解析响应中返回统一 Session 摘要。
- `src/desktop/launch.ts`、`src/web/server.ts`：panel 启动时携带 `MOLIS_WORK_SESSION_ID`；旧变量继续发出供兼容回退。
- `tests/session-registry.test.ts`、`tests/session-adapters.test.ts`、`tests/session-migration.test.ts`：新基础的直接证据。
- `tests/mcp.test.ts`、`tests/desktop-tui.test.ts`：跨 Session 与 panel 晚到原生身份回归。

## 验收标准

1. Adapter capability 完整覆盖七项操作；业务只按 capability/mode 路由。Codex 调用已验证方法，fallback 不夸大能力。
2. 旧 binding/panel 对账后每个逻辑 Session 只得到一条 `session_id`；旧数据不删除，重复迁移不增行，注入失败不留下半迁移状态。
3. 领域类型和持久化明确区分所有身份与关系；页面 surface 和 workspace 永远不成为原生 Session ID。
4. 并发 Session、同 workspace、多 Runtime 同值原生 ID、晚到原生 ID和显式外部绑定均隔离。
5. MCP `context_resolve` 在已绑定时返回 Molis Work Session 摘要；宿主 Session 切换仍触发现有 refresh 门禁。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/session-adapters.test.ts tests/session-registry.test.ts tests/session-migration.test.ts
node --import tsx --test tests/mcp.test.ts tests/desktop-tui.test.ts
pnpm build
git diff --check
```

完整套件仅在当前工作树的既有失败不掩盖本 Work Item 时作为额外证据；不得用无关失败否定或掩盖定向结果。

## 假设与开放问题

- 当前只把本机生成的 Codex app-server protocol 作为 Codex 原生能力事实；其他 Runtime 后续分别验证并注册 Adapter。
- 真实 app-server 进程生命周期和内容分页属于下游“Session 内容时间线与原 Runtime 加载”Goal；本 Work Item 固定方法映射与可注入传输契约。
- 旧 workspace default 只作为存量 schema 与拒绝旧调用的兼容事实保留，不再用于项目路由，也不会被迁移成 Session 的持久默认关系。
