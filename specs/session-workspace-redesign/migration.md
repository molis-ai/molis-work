# Session Foundation 兼容迁移与回退

## 迁移原则

- 新 Registry 位于 `/sessions/sessions.db`；旧 `/projects/catalog.db` 只读参与对账，不改表、不删行。
- 每个旧来源使用稳定 migration key，整批迁移在一个 Registry 事务中完成。
- 失败时回滚整个事务；下次打开可原样重试。
- 迁移成功后旧 project binding 和 desktop panel 仍可继续工作，是显式兼容回退，不是待清理垃圾。

## 对账规则

1. 先处理 desktop panel：
   - `surface_id = panel_id`；
   - `correlation_token = work_context_id`，只有尚无原生身份时保留；
   - `native_runtime_session_id = host_session_id`（存在时）；
   - `project_id`、`current_goal_id` 和 cwd 对应 workspace 作为已确认历史事实迁入。
2. 再处理 runtime context binding：
   - 若 `(runtime_id, stable_work_context_id)` 已命中 panel 的 work context 或 host session，复用该 `session_id`；
   - 否则创建 `provenance=legacy_migrated` 的 Session，并把 stable ID 保存为 Runtime 命名空间下的原生身份；
   - 只迁入 binding 已确认的 project，不从 workspace membership、标题或最近项目候选创建 Session 关系。
3. 同一来源再次迁移通过 `session_migration_receipts` 复用原结果，不新增 Session 或 Goal history。

## 旧变量边界

- `MOLIS_WORK_SESSION_ID` 是新路径，表示 Molis Work Session。
- `MOLIS_WORK_PANEL_ID` 只表示 surface。
- `MOLIS_WORK_GOAL_ID` 只提供启动时当前 Goal 候选；不独立创建或改写 Session。
- `MOLIS_WORK_WORK_CONTEXT_ID` 只由 compatibility adapter 解释为 legacy correlation/work entry。
- `CODEX_THREAD_ID`、Claude Session env 与 MCP `_meta.threadId` 是 Runtime 原生身份候选；只有宿主声明或匹配 correlation/surface 时写入。

## 回退与恢复

- Registry 不可用时，既有项目解析和 panel 仍按原 catalog 路径运行；响应明确标记 Session Registry unavailable，不伪造 `session_id`。
- 新写入失败不触碰旧 binding；旧 binding 写入成功但 Registry 补写失败时，下一次 reconcile 从旧事实补齐。
- 不提供自动删除或反向覆盖旧 binding 的流程。删除兼容层必须由未来独立迁移 Goal 验证所有 Runtime 后决定。

## 验证

- schema 新建、重复打开、旧 binding-only、panel-before-native、panel-after-native、重复别名和失败注入。
- 迁移前后旧 binding/panel 数量及关键字段一致。
- Registry Session 数量与 migration receipt 对账一致。
- 同 workspace 两条旧 Session 保持两个 `session_id`。
