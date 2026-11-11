# BL-coding-skill-auto

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-coding-skill-auto | SKP-10 的 Coding 一侧：设成「自动」、适用于 Coding 的技能，每轮把名称和说明交给 Coding 的模型，合适时经 `skills.body.read@1` 读正文（助理已这样做，9-2）；本人点名或「选择方法」选的照旧优先。今天 Coding 的一轮只带委派来的和本人选的技能（`plugins/native/coding/src/executor.ts` 的 `mergedSkills`），「自动」档在 Coding 上等于「仅手动」，运行时说明写的是「自动选择尚未接通」 | [第 09 批收尾检查](../post-anticorruption-roadmap/reference/batches/09.md#batch-09-closing-check)；[技能包 SKP-10](../skill-packs/spec.md) | 部分实现 | 9-4 只做了 Coding 改读共同目录、删旧方法路，没把「自动」档接进 Coding 的一轮；收尾检查时才发现 | Coding 角色的工具里要有读技能正文的一项（与助理同一个动作），一轮的技能列表由宿主一处给出（9-9 的工具全集） | 高 | C2 轨（执行会话待分配） |
