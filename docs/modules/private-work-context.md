# Private Work Context

**定位：** 用户或 Runtime 为完成工作产生的私人 Session、内容引用、workspace 关联和 handoff 事实的唯一 owner。

大白话说，它保存的是“这次私人工作从哪里开始、现在关联哪个 Project / Goal、私密过程内容放在哪里、换 Runtime 后从哪继续”。这些事实默认只在本机，不会因为进入 Team 就自动同步。

## 本模块拥有

- Molis Work Session identity、Runtime native identity / correlation、surface identity。
- Session 与 Project、Goal、workspace 的关联规则和 Goal 历史视图；关系事实由 Context Ledger 唯一保存。
- 本地加密的 Session event / content reference。
- Handoff 草稿、目标 Session、发送状态、重试与恢复事实。
- Runtime context binding、binding event、setup request 和 suggestion rejection。
- 旧 panel / binding 到新 Session Registry 的幂等迁移 receipt。

## 本模块不拥有

- Execution Claim / Run、Goal、Artifact、Project identity 或 workspace membership。
- Runtime 进程、Codex / PTY 协议、resume 调用和实际消息投递；这些由 WK2 的 Runtime Host 和 WK3 的 Work Plugin 编排。
- Desktop panel UI 状态。Panel 只把明确的用户选择写入本模块公开入口。
- Team 同步。私人过程要交换给别人，必须由用户显式发布为 Goal / Artifact 或未来明确选择共享的记录。

## 公开入口与内部拆分

所有业务调用从 `@molis-ai/molis-work-module-private-work-context` 进入：

- `MolisWorkSessionRegistry`：兼容期 public facade，不保存混合实现。
- `session-records.ts`：Session 身份与命令事务。
- `session-associations.ts`：关联规则、Ledger 公开 API 适配与旧关联迁移，不保存第二套关系表。
- `session-events.ts` 与 `content-store.ts`：过滤元数据并本地加密保存内容。
- `session-handoffs.ts`：Handoff 状态、目标关联和中断恢复。
- `handoff-associations.ts`：Handoff 的来源 Goal、目标 Project / workspace 引用适配及旧数据迁移；关系存储归 Ledger。
- `session-migration.ts`：旧数据迁移与 receipt。
- `context-bindings.ts`：Runtime context binding 的身份、控制历史、mapping 和 Repository。
- `context-binding-references.ts`：当前工作入口到 Project 的 Ledger 适配与旧表迁移；通过注入的 Projects Query 校验 Project，不跨 owner 查询表。
- `session-schema.ts`：Session 数据库版本和共同校验。

WK3 已将所有 Registry caller 切到公开 owner 包，并删除 `src/sessions/registry.ts` 和 `content-store.ts`。旧 `src/sessions/` 已全部退出；Host MCP/Project 通过公开 Contracts 与 Work/Private Work Context 接入。Project Catalog 编排选择 Project，不直接保存 Runtime Session binding SQL。Work 依赖公开 `WorkSessionQueryApi` / `WorkSessionApi`（包括已有的 eventCount 查询和 Handoff 状态操作），不依赖 Registry 私有实现或数据库。

## 兼容与数据位置

- 继续使用 `~/.molis-work/sessions/sessions.db` 和原有加密内容目录；schema v5 包含 v4 的 Session 关联迁移，并迁移 Handoff 的跨模块引用，不搬移或删除私人内容。旧 reader 不会误读新 schema。
- 原 owner marker 继续作为数据兼容标识，不代表代码 owner 仍在旧目录。
- WK1 迁移事实 owner；WK2 迁移 Runtime Host，WK3 再清除 Work UI / resume / handoff caller 的兼容入口。

应用层通过 `@molis-ai/molis-work-app-local-host` 的 `openWorkSessionRegistry` 组合两个 Module；Module 单独使用时显式注入 Ledger factory。v3 历史 link 的编号、操作者和起止时间保留，未知历史 Project 不用当前 Project 回填。`project_id`、`current_goal_id`、`workspace_id` 仍作为公开 Session response 字段，但从 Ledger 派生；旧列和旧 link 表迁移后清空，不再双写。Project 里的同名 Goal 通过 ObjectRef 的 Project namespace 区分。

Handoff 的 `source_project_id` / `source_goal_id` / `target_project_id` / `target_workspace_id` 同样由 Ledger 派生；旧必填列清空字符串，workspace 列清空 null。新 prepare 记录调用方实际使用的 Goal Contract revision，旧包未知版本保留 null。迁移从包自身的历史引用读取，不借用 Session 后来的关联。初始化升级、新建和目标修改均把 Work 状态与 Ledger 放入一个事务；失败不留下半迁移或孤立关系。

私人 Handoff 草稿、正文引用、digest、发送/重试 Receipt 仍归本模块，不因持久化自动成为 Artifact 或进入 Team。只有显式形成符合定义的正式结果才走 Artifact 发布；这是总 spec §20.11 / §20.13 的边界，而非暂存双 owner。

Runtime 工作入口绑定保留在 `projects/catalog.db` 的同一事务资源中。Catalog schema v10 将当前 Project endpoint 迁成 personal `work.binding_project` 边，重建 Work-owned metadata 表并移除旧 `project_id` 列；公开 Binding response 不变。绑定事件里的 Project 是当时决定的历史快照，setup 幂等与拒绝建议仍是 Work 控制状态，不能拿来恢复第二份当前关联。解除和 Project 删除通过公开 API 撤销边；外层事务同时覆盖 Catalog 版本、metadata、事件与 Ledger，失败后旧绑定和版本可完整重试。旧 Catalog reader 明确拒绝 v10，不静默降级。
