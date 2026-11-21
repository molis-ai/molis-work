# BL-browser-socket-close-pending-bind · 关掉侧栏浏览器后，清掉还没挂好的监听

侧栏正在确认该看哪个项目，用户先关了窗口。检查完成后就不该又给已关闭的连接挂上监听。

预计 **2–5 工时**。维护范围为A／宿主与安全。正式交付项为 [93-2](../../batches/93.md#batch-93-item-2)。[原始待办](https://github.com/molis-ai/molis-work/blob/d5dd1fbb6aec214c743e34fba9434f7f131ae6f1/specs/backlog/BL-browser-socket-close-pending-bind.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-browser-socket-close-pending-bind。正式交付项为 93-2，批次文件在 specs/post-anticorruption-roadmap/reference/batches/93.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。BL-browser-socket-close-pending-bind 已随 #2149 合入并删除条目，结清记录在 docs/backlog-removed.md。

目标
关掉侧栏浏览器后，清掉还没挂好的监听。侧栏正在确认该看哪个项目，用户先关了窗口。检查完成后就不该又给已关闭的连接挂上监听。

实施
从 apps/local-host/src/browser/browser-socket.ts 的 watch／attach 找到异步项目检查。让绑定完成处尊重连接关闭状态，同时保留原有项目校验、消息顺序和拒绝路径。用可手动完成的 Promise 稳定控制先关闭、后完成检查的顺序。

验收
验证迟到的绑定没有留下监听、活连接仍正常收消息、关闭时已存在的监听能释放。运行 node scripts/run-tests.mjs tests/side-panel-browser.e2e.test.ts 以及新增的定向回归。 涉及浏览器实操时用项目测试浏览器及隔离 Home。

协作
可先做。与 BL-1006 的页面请求测试分文件。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
