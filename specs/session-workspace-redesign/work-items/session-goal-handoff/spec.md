# Goal Handoff 到目标 Runtime 新 Session

## 背景与目标

项目内 Sessions 已经能读取执行内容、显示 Goal 历史并加载原 Runtime，但当原 Session 不适合继续、用户希望换 Runtime，或 Runtime 不支持原生 resume 时，目前只有一句“后续提供 Handoff”的提示。用户需要从当前 Session 明确发起一次交接：以这条 Session 的当前 Goal 为唯一事实源，审阅并可编辑交接内容，确认目标 Runtime、当前 Project、Goal 与工作目录后，创建一条新的目标 Session。

本 Work Item 达到完成等级 3「功能可用」：Codex 原生新 Session 与首条 Handoff 消息真实创建；弱能力 Runtime 使用可追溯的 Molis Work 托管 Session 回退；草稿、失败、重试和来源/目标 lineage 在本机持久化。它不声称已经适配所有 Runtime 的原生协议。

## 当前行为与问题证据

- `CodexRuntimeSessionAdapter` 目前把 `handoff` 简单映射到 `thread/start`，但本机 Codex app-server protocol 明确表明：`thread/start` 只创建 thread，首条用户消息必须另行调用 `turn/start`。
- Session 详情只有「加载原 Session」，resume unsupported 时仍显示“Handoff 将在独立功能接入后提供”。
- Session Registry schema v2 没有 Handoff package、发送状态或来源/目标 Session lineage，失败后无法安全重试。
- 已有 `SessionContentService` 能提供 Runtime 原生历史与 Molis Work 事件，但不能把整段原始历史在没有预览和确认时自动发给另一个 Runtime。

## 保留、替换、忽略

### 保留

- `session_id` 继续是 Molis Work 业务主键；Runtime 原生 ID 只在 Adapter 内使用。
- 当前 Session 的 `current_goal_id` 是 Handoff 的唯一 Goal 来源；没有当前 Goal 时禁用并说明原因。
- Handoff 由用户显式触发、预览、编辑和确认，不因读取 Session、打开页面或 resume 失败自动发送。
- Runtime 不支持原生 Handoff 时保留受控 fallback，不伪造原生送达。

### 替换

- Codex `handoff` 改为可恢复的两阶段调用：新目标使用 `thread/start`，随后以 `turn/start` 发送已确认 package；若 thread 已经创建，重试只调用 `turn/start`。
- “后续提供”的占位提示替换为 Session 详情中的真实 Handoff 动作和审阅工作面。

### 忽略

- 不跨 Runtime 读取、resume 或复用同一个原生 Session。
- 不让一个 Runtime 解释另一个 Runtime 的 native ID。
- 不自动总结或后台发送整段对话，不引入 LLM 生成步骤。

## 用户流程

1. 用户在项目 Sessions 详情选择一条具有当前 Goal 的 Session，点击「创建 Handoff」。
2. Molis Work 读取当前 Goal Contract 和这条 Session 已可见的最小上下文，生成本地加密草稿。目标 Project 与 Goal固定为当前已确认关系；用户选择目标 Runtime，并确认或调整目标工作目录。
3. 用户在同一审阅面查看来源 Session、当前 Goal、目标组合和完整 Markdown package，可以直接修改正文或暂时关闭，草稿不会发送。
4. 用户勾选确认并点击「创建并发送」。Codex 创建新的 thread 并把 package 作为第一条用户消息；其他 Runtime 只有在 Adapter 声明原生能力时才走原生调用。
5. Runtime 不支持原生 Handoff 时，Molis Work 创建新的托管 Session，把 package 作为加密的 Molis Work 内容写入，并明确标记为 fallback。
6. 创建或发送失败时，来源 Session 和 package 保留。若目标原生 Session 已经创建，lineage 记录真实目标，重试只补发 package；若没有得到原生 ID，则不创建虚假的目标 Session。

## Handoff package

默认 Markdown 是确定性模板，用户发送前可编辑，包含：

- 来源 Project、来源 Session、来源 Runtime 与目标工作目录；
- 当前 Goal 的标题、outcome、why、business logic、scope、约束、输入、输出与验收条件；
- Goal 派生 work state、当前 Run、有效 Evidence locator、开放 Risk 和待检查角色；
- 最近的最小 Session 上下文：优先 user/runtime/artifact/status，默认不带命令、工具调用和终端大段输出；
- 清楚的执行要求：目标 Runtime 将其视为一次新的 Session，不假装继承原 Runtime 内存。

package 正文存入既有 AES-256-GCM Session content store；SQLite 只保留 content ref、digest 和无正文状态元数据。Web 列表与错误日志不得包含 package 正文。

## 状态机与恢复

`session_handoffs` 状态为：

- `draft`：已生成或已修改，尚未发送；
- `sending`：外部创建/发送正在进行；
- `failed`：发送失败，可保留目标 Session 并重试；
- `sent`：package 已原生送达或已写入受控 fallback Session；
- `cancelled`：用户明确取消；不会删除密文或 lineage。

状态转换只允许 `draft|failed -> sending -> sent|failed`，以及 `draft|failed -> cancelled`。`sent` 不可重新修改或重复发送；重复请求返回已完成记录。`sending.updated_at` 同时作为五分钟发送租约：其他 Web/MCP Registry 连接不会改动仍在租约内的真实发送；进程退出后，超过租约的 `sending` 会在下次读取或 Registry 打开时转为可重试 `failed`，避免永久卡死。

## Runtime Adapter 调用链

### Codex native

1. 先通过 `create` capability 调用 `thread/start({ cwd })`，取得新的 native thread ID。
2. 只有拿到真实 native ID、且该 ID 不属于来源或其他既有 Session 时，才创建 Molis Work 目标 Session，并立即把目标 lineage 持久化到 Handoff record。
3. 再通过 `handoff` capability 调用 `turn/start({ threadId, input: [{ type: "text", text: package, text_elements: [] }] })`。
4. 第三步被 Runtime 明确拒绝时，Registry 已保留真实目标；重试只传入 `existingThreadId` 补发内容，不再次调用 `thread/start`。若超时、断线等结果无法确认，记录为不可自动重试，要求用户先检查目标 Session，避免重复投递。

### Controlled fallback

- Adapter `handoff=unsupported` 时，使用 `SessionDirectoryService.create` 建立新的目标 Session。
- package 作为 `source=molis-work`、`kind=user_message` 的加密事件写入目标 Session，并记录 `delivery_mode=molis_work_fallback`。
- UI 明确说明它是 Molis Work 托管内容，不声称已在目标 Runtime 原生执行。

## 数据、输入输出与边界

- Registry schema v3 新增 `session_handoffs`；v1 先补事件表再补 Handoff 表，v2 只补 Handoff 表，全部在事务中更新版本。
- Handoff record 至少包含 package ID、来源 Session/Project/Goal、目标 Runtime/Project/workspace、可选目标 Session、状态、delivery mode、content ref/digest、尝试次数、安全错误信息和时间戳。
- 来源 Session 必须属于 URL 当前 Project，且当前 Goal 必须仍存在于该 Project 的 canonical Goal Tree。
- Project-scoped Handoff 写接口继续通过既有本机 control token、同源与一次性操作键门禁；不能因为 URL 带 Project 前缀而绕过本地控制校验。
- 目标 Project 在本切片固定为来源 Project；目标 Goal 固定为来源 Session 当前 Goal。用户仍需在确认区明确看到并确认这组关系。
- 工作目录可留空；非空必须是绝对路径。它只是目标 Session 的工作目录关系，不成为 Session identity。
- 错误响应只返回稳定状态和可操作说明，不返回 Adapter request params、正文、env、token 或凭据。

## 模块边界

- `src/sessions/types.ts`：Handoff record、状态、输入输出与安全 recovery detail。
- `src/sessions/registry.ts`：schema v3、加密 package 持久化、状态转换与 lineage 查询。
- `src/sessions/adapters.ts`：Codex 两阶段 native Handoff；其他 Adapter 继续由能力矩阵决定。
- `src/sessions/handoff.ts`：确定性 package 生成、最小上下文选择、native/fallback 编排与失败恢复。
- `src/web/server.ts`：按 Project/Session 双重隔离的 prepare、update、send、cancel API，并提供 canonical Goal Contract。
- `src/web/project-session-workspaces.ts`：复用现有 Session Hero 与 Goal 详情语言，提供一个高密度、可编辑的 Handoff 审阅面；不增加新目录或新页面壳层。
- `tests/session-handoff.test.ts`、`tests/session-handoff-recovery.test.ts`：package、原生新 Session、fallback、失败与重启恢复证据。

## 验收标准

1. 当前 Goal 的 Goal Contract、工作状态、产物/Evidence 引用和最小 Session 上下文生成可编辑 package；未确认前不会调用目标 Runtime。
2. Codex Handoff 创建全新的 native Session，并通过 `turn/start` 把用户确认后的正文作为首条消息发送；Molis Work 新 `session_id` 与来源 Session 不同。
3. Adapter 不支持原生 Handoff 时创建明确的 Molis Work fallback Session，package 可在目标 Session 内容中读取，不伪装成 native。
4. `thread/start` 失败不产生目标 Session；`turn/start` 失败保留真实目标和 package，重试不重复创建 thread；重启后仍可恢复。
5. 页面在 Session Hero 提供 Handoff 动作；无当前 Goal 时禁用并说明。审阅面显示固定 Project/Goal、目标 Runtime/workspace、可编辑正文、确认、发送、失败与重试状态。
6. 来源/目标 Project 隔离、绝对路径、用户确认、不可重复发送和敏感正文边界均有定向测试。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/session-handoff.test.ts tests/session-handoff-recovery.test.ts
node --import tsx --test tests/session-adapters.test.ts tests/session-registry.test.ts tests/session-migration.test.ts tests/session-directory.test.ts tests/session-web.test.ts
pnpm build
git diff --check
```

UI 完成后在真实项目的 Sessions 目录做 Light/Dark、桌面与窄屏检查；重点验证执行内容仍占主页面最大比重，Handoff 审阅面不引入第三套列表/容器系统。

## 假设与 later

- 本机生成的 Codex app-server protocol 是本实现的 native 事实；其他 Runtime 只有注册并验证 Adapter 后才可声称原生送达。
- `thread/start` 或 `turn/start` 请求超时但 Runtime 实际已经产生副作用时，协议没有 client idempotency key 可供 Molis Work 对账；本切片把结果标为不可自动重试并保留 package。后续可在 Adapter 有可验证 correlation/discovery 能力时补自动对账。
- 跨 Project Handoff、目标 Project 中 Goal 的映射/复制、批量 Handoff、package 版本 diff 和内容治理属于 later。
