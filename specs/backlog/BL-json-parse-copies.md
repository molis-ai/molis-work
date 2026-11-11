# BL-json-parse-copies

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-json-parse-copies | 平台共用 JSON 解析还剩 1 处依赖方向不允许的副本：`modules/attention-resumption/src/index.ts:416`（该模块只依赖 contracts，加 SDK 依赖要单独评审并改锁文件）。复查更正：`packages/storage` 本来就依赖 SDK（`versioned-file.ts` 用 `isRecord`/`compareCodeUnits`），`sqlite.ts` 的副本已在 2026-11-11 复查中换成 SDK 根导出的 `parseJson`；Goals 的两处同名函数不是副本——它把坏 JSON 读成 `unreadable` 并报告，故意不回退，语义与通用 `parseJson` 不同，保留为 owner 自己的严格读法。 | 2026-11-11 代码质量复查（F2 收尾）；复查更正 | 已知缺口 | 只剩 attention-resumption 受依赖方向限制：它属于 Module、当前只依赖 contracts；换 SDK 要评审边界并更新锁文件 | 边界规则确认后再收 | 低 | 平台基础（执行会话待分配） |
