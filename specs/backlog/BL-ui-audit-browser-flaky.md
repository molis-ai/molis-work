# BL-ui-audit-browser-flaky

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-ui-audit-browser-flaky | `tests/ui-audit-browser.e2e.test.ts` 在 CI 上偶发 CDP 超时，一失败就取消整轮分片，挡住带 `full-suite` 的 PR。[#1937 的第一次全量](https://github.com/molis-ai/molis-work/actions/runs/42378910452) `Runtime.evaluate` 查 `iframe.tab-content-frame` 时两次尝试都超时（第 85 行，耗时 17.6 s，上限 15 s），诊断里 Node 进程的事件循环几乎没有空闲（`nodeCpuMs` 18354、`eventLoopIdleMs` 6）；run 42376987308 第一遍 `Page.captureScreenshot` 超时，重试才过。评审台数到 2026-11-07 这天 9 次尝试失败 3 次，都是 CDP 超时。#1937 只改 `tests/golden-home.test.ts`，碰不到它 | [第 05 批，#1937](https://github.com/molis-ai/molis-work/pull/1937) | 明确后续做 | 和 `BL-1009` 记的「UI 审计 CDP 超时」是同一件事，那里没证根因，这里补新证据，也按那里的规矩不以重试绿销账。**新证据（2026-11-07，第 14 批 T3）**：[#1949 第一次全量](https://github.com/molis-ai/molis-work/actions/runs/42396101767)的分片 14/32，`ui-audit-browser.e2e` 第一次 `Runtime.evaluate` 超时，重试又在 `Page.captureScreenshot` 超时（耗时 17.6 s，上限 15 s，事件循环空闲 0 ms）；同一分片里 [BL-workbench-current-tabs-flaky](BL-workbench-current-tabs-flaky.md) 也先败。第 05 批这几片都不碰这个用例；要先查是用例、夹具还是 runner 负载。不为变绿放宽断言；一直撞就按规则进 `tests/quarantine.json` | `BL-1009` | 中 | 工作台浏览器验证线（具体会话待分配） |
