# BL-first-screen-pty-client

分组：9. 平台小项与工程流程 / 首屏加载与资源

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-first-screen-pty-client | `/desktop/pty-client.js`（约 413 KB）已在 `tooling/gates/page-asset-budgets.json`（`pluginFrame` 路由）受预算门禁管制，且第 44 批 44-4 已将其泛化为平台通用对象工作终端客户端（原 BL-637 已关闭，见[已删除的 BL](../../docs/backlog-removed.md)）；但 `apps/workbench/src/shell-page-renderer.ts:270` 在传入 `parts?.terminal_client` 时仍于首屏提前载入，尚未改成打开终端时再按需加载 | [字体皮肤语言的首屏实测与资源预算方案](../font-and-skin-system/resource-budget.md) 第 5、8 节（附录 B） | 已知缺口 | 资源预算方案只建议另登，没有排期；按需载入要先核对各声明 `work_terminals` 的插件终端入口怎么触发它 | 无 | 中 | D 外观与语言／工作台外壳（执行会话待分配） |
