# Private Work Context

**定位：** Runtime 工作入口与 Project 之间绑定关系的唯一 owner。

大白话说，它保存的是“这个外部 Runtime 的工作入口（或工作目录）属于哪个 Project”：谁在什么时候绑定、解绑，用户拒绝过哪些建议，幂等请求做到了哪一步。这些事实默认只在本机。

Sessions 插件已下线（SC-4，`specs/repository-anti-corruption/slices/sc-4-sessions-offline.md`）：Session 身份、事件与加密内容引用、Handoff、会话目录和关联规则的实现都已删除，重做见 `specs/BACKLOG.md` 的 BL-177。本模块只留下 Runtime 项目绑定。

## 本模块拥有

- Runtime context binding、binding event、setup request 和 suggestion rejection。
- Runtime 工作入口到 Project 的当前关联：personal `work.binding_project` 边，由 Context Ledger 唯一保存。
- 绑定语义的错误码（`work.context.*`，如 `work.context.project_relation_missing`：项目关系缺失时拒绝，不猜测绑定）。

## 本模块不拥有

- Goal、Artifact、Project identity 或 workspace membership。
- Runtime 进程、Codex / PTY 协议和实际消息投递；这些由 Runtime Host 与终端工作区负责。
- Session 与消息：已下线，没有 owner；`<home>/sessions/` 里的旧数据由 Host 的存储登记持有，本模块不打开它。
- Team 同步。

## 公开入口与内部拆分

所有业务调用从 `@molis-ai/molis-work-module-private-work-context` 进入：

- `createRuntimeContextModule`：在同一数据库连接里装配绑定、创建并绑定、拒绝建议与清理服务；Repository 不对包外导出。
- `context-bindings.ts`：Runtime context binding 的身份、控制历史、mapping 和 Repository。
- `context-binding-references.ts`：当前工作入口到 Project 的 Ledger 适配；通过注入的 Projects Query 校验 Project，不跨 owner 查询表。
- `project-binding-commands.ts`、`project-binding-validation.ts`、`project-resolution.ts`、`project-setup.ts`、`project-suggestions.ts`：绑定命令、校验、解析、创建与建议。

Project Catalog 编排选择 Project，不直接保存 Runtime binding SQL；Host MCP 与 Project 通过公开 Contracts 接入。

## 数据位置

Runtime 工作入口绑定保留在 `projects/catalog.db` 的同一事务资源中。当前 Project 关联是 personal `work.binding_project` 边，本模块只存绑定身份、事件、setup 幂等与拒绝建议；目录库只认当前版本，不就地升级。绑定事件里的 Project 是当时决定的历史快照，setup 幂等与拒绝建议仍是控制状态，不能拿来恢复第二份当前关联。解除和 Project 删除通过公开 API 撤销边；外层事务同时覆盖目录版本、metadata、事件与 Ledger，失败后可完整重试。

`<home>/sessions/`（旧 Sessions 的库与加密内容目录）不再被任何代码打开：它登记在 Host 的存储清单（`apps/local-host/src/home-stores.ts`，owner 为 `apps/local-host`），备份与卸载清理仍认得它；项目删除不再有 `sessions` 主人，该目录里属于被删项目的旧记录会留到单独的清理片（SC-5，在备份副本上做并经用户确认）。
