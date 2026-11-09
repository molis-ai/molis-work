# BL-workbench-current-tabs-flaky

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-workbench-current-tabs-flaky | `tests/workbench-current-tabs.e2e.test.ts` 在 CI 上偶发 CDP 超时：[#1949 第一次全量](https://github.com/molis-ai/molis-work/actions/runs/42396101767)的分片 14/32，第一次尝试 92.6 s，`Runtime.evaluate`（在标签工作区状态上点边缘）超时；同一分片里 `ui-audit-browser.e2e` 紧接着也超时（见 [BL-ui-audit-browser-flaky](BL-ui-audit-browser-flaky.md)）。重试后整个 run 的第二次尝试全绿。#1949 只改 Manifest 声明和类型，碰不到工作台标签；根因没有证。同一文件在本机（macOS）干净 main 上稳定复现的另一类失败见 [BL-workbench-current-tabs-local](BL-workbench-current-tabs-local.md)，两件分开查 | [第 14 批 #1949 的全量，run 42396101767，job 128473683734](https://github.com/molis-ai/molis-work/actions/runs/42396101767/job/128473683734) | 已知缺口 | 只在带 `ui-audit-browser` 的同一分片里看到过，先和 BL-ui-audit-browser-flaky、BL-1009 一起查：是用例、夹具还是 runner 负载。不为变绿放宽断言；一直撞就按规则进 `tests/quarantine.json` | [BL-ui-audit-browser-flaky](BL-ui-audit-browser-flaky.md)、[BL-1009](BL-1009.md) | 中 | 工作台浏览器验证线（具体会话待分配） |
