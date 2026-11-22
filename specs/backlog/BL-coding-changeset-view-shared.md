# BL-coding-changeset-view-shared

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-coding-changeset-view-shared | 从固定变更（`type.coding.changeset`）的一项画出差异，Coding 的 `changeView`（`plugins/native/coding/src/change-html.ts`）与 Diff 的 `compareRunChangeSet`（`plugins/native/diff/src/comparison.ts`）各写一份：新建、删除、净变更的判断要两边同步改（第 99 批就得在两处各补 `removed`）。插件之间不能互相 import，共用的一份应放进 SDK 的 `diff-view`，两个插件都调它 | 第 99 批收尾检查（2026-11-21） | 明确后续做 | 早于本批的两份，不是本批引入；合成一份要动 SDK 公开出口与两个插件，单独做 | 无 | 低 | B／Coding、Files 与 Git（执行会话待分配） |
