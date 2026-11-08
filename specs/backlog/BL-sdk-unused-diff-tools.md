# BL-sdk-unused-diff-tools

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-sdk-unused-diff-tools | SDK 的 `compareHunks`、`parseUnifiedDiff`、`unifiedErrors` 产品不再调用；Feed 的 `renderFeedOverlays` 总返回空。先判断留不留 | 第 02 批复查（2026-11-07） | 明确后续做 | SDK 是公开包，第三方可能在用，删之前要定对外承诺 | 无 | 低 | 合同维护人（执行会话待分配） |
