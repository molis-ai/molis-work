# BL-computer-records-shape

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-computer-records-shape | 用电脑的记录读的时候不查字段：`computer/records/<id>/record.json` 是合法 JSON、却缺 `started_at` 时，`ComputerRecords.list()` 排序报错，整张记录列表打不开，不只是这一条（`apps/local-host/src/computer/computer-records.ts` 的 `get()`、`list()`） | 第 02 批复查（2026-11-08），写发布检查单第 3 节时读代码发现 | 已知缺口 | 文件只由宿主自己写，只有文件损坏或人手改才会出现；修法（读时按现行形状校验，不符的一条当作没有）属于用电脑的主人，不属于第 02 批的版本清理 | 无 | 低 | C2／Prologue Computer Use，F／桌面（执行会话待分配） |
