# BL-knowledge-restore-partial-catalog

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-knowledge-restore-partial-catalog | 搜索索引为空或没追完时，知识卡会按不完整的目录被删，Home 恢复后第一次列卡就是这样。搜索索引不进快照，恢复后是空的；`knowledge.list` 先追赶来源，没追完也接着跑 `KnowledgeOrganizer.reconcile`（`horizontal/knowledge/src/organize.ts`），没编辑、没排除的卡只要不在目录里就删。U2 生成金样时实测 14 张变 3 张，索引追上后回到 14 张。重建出来的是新卡，所以真实 Home 上模型写的卡片内容可能丢，还要再花一次当日额度；这一半是读代码推的，没有模型，没有实测。读代码看还有两条路会碰到，都没有实跑：搜索库改版本时 `text-search-index.ts` 删表重建，以后每改一次，每个 Home 升级时索引都会清空；`settle` 里的 `organizer.kick` 也会 `reconcile`（`knowledge-actions.ts`、`organize.ts`），项目里有改动就触发，不用谁打开列表 | [#1912](https://github.com/molis-ai/molis-work/pull/1912) U2 写手 | 已知缺口 | 查金样时碰到的，不在那片范围。回放只是等卡片追上（最多 30 秒）再核行数，产品代码没改。方向是目录没追完时不删卡，要先确认「追完」怎么判断 | 无 | 中 | 知识线（执行会话待分配） |
