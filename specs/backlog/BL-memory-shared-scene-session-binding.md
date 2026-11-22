# BL-memory-shared-scene-session-binding

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-shared-scene-session-binding | 同一项目内两个插件申报同名 `memory_scene` 且都提供会话绑定时，`memory-session-binding.ts`、`settings-memory.ts` 及相关记忆动作仅按场景查找唯一提供方导致直接报错拒绝打开；同步收口非内置插件学习记忆被 `reaches !== true` 误拒、同场景跨插件待审候选来源串扰及 `PluginPlatform` 场景登记缺口。改为按精确提供方身份（`plugin_id` / `provider_id` + 场景标识）区分绑定、清理计划、重试与展示，并在测试中实装双插件同场景完整验证记忆形成、来源会话读取、管理页打开/展示与撤权 | 2026-11-22 源码审查与双插件同名场景复查；排入[第 63A 批](../post-anticorruption-roadmap/reference/batches/63a.md) | 已知缺口 | #2209 将场景放开为插件自报并允许同名共享后，会话记忆绑定合同与入口尚未补精确提供方消歧与双插件实装验证 | 合同变更（`MemorySessionTarget`、受保护会话记忆入口与 `format.memory.session-clear-plan` 阶段一收严） | 高 | C2／Memory（Memory 负责人） |
