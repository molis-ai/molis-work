# BL-arrival-side-menu-shared

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-arrival-side-menu-shared | 到达页（项目选择、Onboarding）的右侧标签菜单和撤销小签是 `SIDE_PANEL_SCRIPT` 里内联的一份精简版，和工作台标签工作区那一套是两份 | 第 07 批收尾检查（评审台，防腐一项）；S2（#1867）写明了理由 | 明确后续做 | 到达页没有标签工作区，菜单工具 `menuRow`、`placeMenu` 写在 `TAB_WORKSPACE_FACTORY` 的闭包里，平台还没有可共用的客户端菜单工具；要先把菜单抽成 design-system 的浏览器端组件，再让两处共用 | 无 | 低 | 工作台导航（具体会话待分配） |
