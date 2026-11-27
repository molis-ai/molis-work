# BL-task-report-plugin-added-later

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-task-report-plugin-added-later | 本机复现：项目的主对话已经存在之后才把 Images 加进项目，两个生成结束后项目任务表里有这两行（`reports_to: "assistant"`），但主对话没有收到只汇报的一轮；先加 Images、再建主对话则正常（`tests/assistant-task-reports.e2e.test.ts` 按后者写）。第 108 批前 Images 在 Home 常驻，没有这个先后。要查清是汇报监听漏了变化、还是读表时项目状态不对，并补「先有主对话、后加插件」的用例 | 第 108 批 PR [#2348](https://github.com/molis-ai/molis-work/pull/2348) 修全量用例时发现 | 已知缺口 | 本批只改用例的先后以保持原验收（RRC-01 等）；原因未查明 | 无 | 中 | B 轨（执行会话待分配） |
