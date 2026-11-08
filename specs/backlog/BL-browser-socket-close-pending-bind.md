# BL-browser-socket-close-pending-bind

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-browser-socket-close-pending-bind | 侧栏浏览器的宿主 socket（`apps/local-host/src/browser/browser-socket.ts`）在关闭时，还在做项目检查的 `watch`／`attach` 绑定检查通过后仍会给页面挂上监听，监听留到页面关掉 | [#1853](https://github.com/molis-ai/molis-work/pull/1853) 评审台不挡合并的意见（S1 的消息排队修复让这个窗口略长，窗口原本就有） | 已知缺口 | 不越权：项目检查照旧先过，拒绝的绑定照旧丢掉后面的消息（S-04 不变）；只是关闭后多留一个监听。修法是绑定完成时再看一眼 socket 是否已关，关了就不挂 | 无 | 低 | 宿主与安全（A 轨，具体会话待分配） |
