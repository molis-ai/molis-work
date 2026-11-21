# BL-coding-command-path-receipts

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-coding-command-path-receipts | Agent 在主工作区直接用命令删文件（如 `rm`），本轮固定变更不列这个删除：Prologue 的命令回执（`WorkspaceCommandReceipt`）只有命令、退出码与输出，不含命令实际动了哪些路径；SDK 自带的受审删除 `changePath`（带 `PathChangeReceipt`）也没开放给 Agent 当工具用。按 11-18 用户决定，只有命令文字不能把删除归给本轮。要证实，需要上游命令回执带上实际增删的路径，或把受审的删除／移动开放为 Agent 工具并经 Molis 审批 | 第 99 批 99-1（2026-11-21） | 已知缺口 | 要改上游 Prologue 与 vendored SDK（红线，先问用户）；第 99 批只做了有证据的整合删除 | Prologue 上游 | 低 | B／Coding、Files 与 Git（执行会话待分配） |
