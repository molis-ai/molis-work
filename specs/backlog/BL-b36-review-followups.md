# BL-b36-review-followups

分组：9. 平台小项与工程流程

第 36 批 PR #2111 评审台（头 d7e30eaa9c）列出的主线不挡合并的小修，没有在本批做的。

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b36-review-followups | 主线：`mainline.subject.read` 的 revision 改用事项真正的修订（现为 created_at，改名、变成对象后不变）；`checkedName` 空名字报 `actions.input_invalid` 而不是 `mainline.limit`；对已完成的事项再点完成不换 revision；`NEXT_STEP_SCHEMA` 在 `services/mainline.ts` 与 `platform/work-items.ts` 各一份，合成一份（`action` 字段写法不同，合并会改动作快照哈希）；插件 id 与安装 id 的推法在 `apps/local-host/src/mainline-actions.ts` 与 `surface-home-directory.ts` 各一份，收成一处 | 第 36 批评审台 | 明确后续做 | 不挡合并；改 revision 与快照要连同主线页面（第 37 批）一起看 | 无 | 中 | 主线负责人 |
