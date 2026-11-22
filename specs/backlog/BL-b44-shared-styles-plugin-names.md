# BL-b44-shared-styles-plugin-names

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44-shared-styles-plugin-names | 平台共用样式（`packages/design-system/src/styles/`、`apps/workbench/src/styles/`）里还点名别的插件：Goals 的 `.goal-*`（约 40 处，含 `goal-collection-fold` 这类已当共用写法用的名字）、Inbox 的 `.inbox-*`、Shelf 的 `.shelf-*`、Coding 的 `.coding-*`、Git 的 `.git-*`；还有 Feed 的数据属性排除（`[data-feed-stage-shell]`、`[data-feed-entry-id]`、`[data-feed-search]`）。共用的改 `mw-` 名，只属于一个插件的搬回它的样式表；插件样式门禁目前只量登记过的样式表、不量平台样式模块，要加「平台共用样式不点名插件」的检查 | BL-b44-feed-home-dir-and-styles 收口时发现（2026-11-21） | 明确后续做 | 那一项只要求 Feed 的 `.feed-*`；别的插件同样处理要逐个核对页面效果 | 无 | 低 | 待分配 |
