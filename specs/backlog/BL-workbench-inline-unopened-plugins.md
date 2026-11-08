# BL-workbench-inline-unopened-plugins

分组：9. 平台小项与工程流程 / 首屏加载与资源

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-workbench-inline-unopened-plugins | 工作台的 HTML 把所有已启用插件的内容文档内联进来（`apps/workbench/src/plugin-frame.ts:25`），没打开的也在：新项目 14 块共 149,168 B，示例项目 407,699 B；HTML 是 `no-store`，每次打开整份重发。要做的：只内联当前打开的，其余在打开时取；先核对每块是否被首屏脚本同步读，再改。改前改后用第一屏报告量字节 | [字体皮肤语言的首屏实测与资源预算方案](../font-and-skin-system/resource-budget.md) 第 5、8 节、附录 A | 已知缺口 | 预算方案只建议另登，没有排期；要先看哪些插件内容块在首屏同步被用 | 无 | 中 | D 外观与语言／工作台外壳（执行会话待分配） |
