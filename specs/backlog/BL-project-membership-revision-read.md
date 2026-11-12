# BL-project-membership-revision-read

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-project-membership-revision-read | 项目插件成员的版本化读取多一次 `project_events` 查询：`ProjectPluginMembershipService.readSnapshot` 在成员读之后再读一次最近成员事件的 `event_id` 来算 revision（`modules/projects/src/project-plugin-membership.ts`，查询在 `modules/projects/src/project-records-repository.ts` 的 `latestPluginMembershipEventId`）。页面渲染与「全部项目」读取每个项目各多这一条。合并成 owner 内的一次读取（或一次遍历），行为不变：revision 仍由成员、hidden 与最近成员增删事件得出，ABA 仍能检出。 | [第 20 批](../post-anticorruption-roadmap/reference/batches/20.md) 的「记录说明（2026-11-10 补记）」自述「后续可在 owner 内合并」；2026-11-11 代码复审（scene-contracts，第二轮）把它登记为待办 | 未实现 | 这条多出来的查询换来的是 ABA 检测：只按成员集合算 revision 会把「加了又删回原样」当成没变。合并需要 owner 内把成员投影与最近事件放进同一次读，不引入缓存或新表（不能为了省一条查询放宽冲突检出）。 | 无硬前置；`modules/projects` 的 owner 在自己库里改 | 低 | C1（Projects OWNER；执行会话待分配） |
