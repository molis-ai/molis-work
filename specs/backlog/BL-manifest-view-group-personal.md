# BL-manifest-view-group-personal

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-manifest-view-group-personal | Manifest 视图声明里的 `group: "personal"`（cognia、jelly、lingguang、todo 等，`UI_VIEW_GROUPS` 里也有这一项）在第 07 批之后不再起作用：「个人」改由登记的 `personal` 加 Manifest `runtime.scope: home` 判断（`isPersonalPlugin`），视图的 group 不再决定插件进不进「个人」 | 第 07 批子分支评审小修-3 | 明确后续做 | 删掉这个取值是 Manifest 格式与 `UI_VIEW_GROUPS` 的合同改动，要连同各内置插件的 Manifest、动作合同快照和插件作者文档一起改；第 07 批定了不改 Manifest | 无 | 低 | 插件合同（C1，具体会话待分配） |
