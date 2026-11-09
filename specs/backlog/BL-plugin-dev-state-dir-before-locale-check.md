# BL-plugin-dev-state-dir-before-locale-check

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-plugin-dev-state-dir-before-locale-check | `molis-work plugin dev --locale <不存在的语言>` 报错之前，`runLocalPluginDevelopment`（`apps/local-host/src/local-plugin-development.ts:30-47`）已经先建好状态目录并写下标记文件 `.molis-work-plugin-development.json`；语言是在后面的 `developInPrivateHost` 里才检查的。所以写错 `--locale` 会留下一个只有标记文件的状态目录。要做的：把语言（`--locale` 是否在 `ui.locales.available` 里、有没有 `blocking` 问题）的检查挪到建目录之前，或者报错时清掉刚建的空目录；不改标记文件的格式 | 第 14 批 T8 的实现说明（设计稿第 8.6 节第 7 条：状态目录在检查语言之前就建好，沿用原顺序没改） | 已知缺口 | T8 保持了函数原有的先后顺序，没有扩大范围；影响很小，只有写错 `--locale` 时才碰到 | 无 | 低 | C1／插件信任、声明与安装（执行会话待分配） |
