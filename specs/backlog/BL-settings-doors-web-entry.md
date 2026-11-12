# BL-settings-doors-web-entry

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-settings-doors-web-entry | 设置页的四扇入口门（`apps/local-host/src/plugin-consent-settings-entry.ts` 的 `with*SettingsEntry`，各用一个 WeakSet）与第 27 批 B9 的通用入口门 `webEntryDoor`（`apps/local-host/src/web-entry-actions.ts`）做的是同一件事，现在两套并存；把四扇门改写到 `webEntryDoor` 上，拒绝与 S-page-entry-actions 同一份测试 | [第 27 批收尾检查](../post-anticorruption-roadmap/reference/batches/27.md#收尾检查) 第 5 问；[B9 设计稿](../visual-ui-experience/work-items/batch27-http-write-actions/spec.md) | 明确后续做 | B9 先照四扇门的做法落地，收成一套留下一次碰设置页入口时 | — | 中 | C 轨／宿主动作服务（执行会话待分配） |
