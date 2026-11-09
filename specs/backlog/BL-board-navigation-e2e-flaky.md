# BL-board-navigation-e2e-flaky

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-board-navigation-e2e-flaky | `tests/board-navigation.e2e.test.ts:51` 的「07-S0 …」在 #1979 的 Full run `42514565847` 上偶发：attempt 1 的 shard 8 挂在 `:73` 的 44px 目标断言（`switchHeights.every(h => h >= 44)`，报 zh/en 某一宽度的真实高度），文件级 retry 仍失败，attempt 2 才通过。`tests/quarantine.json` 现在是空表、也没有 BL。要先判断是断言对亚像素/布局抖动太严（改断言或四舍五入）还是布局真的偶发（修布局），再按隔离清单规则（owner 与到期日、最多 10 条、到期前复查）决定要不要进 `tests/quarantine.json`；不为变绿删行或放宽 44px 触达目标 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) Full run `42514565847`（attempt 1 shard 8 失败、attempt 2 通过）；第 05 批独立审计（verify 分册） | 已知缺口 | 单次重试失败、换 attempt 通过，先按偶发记下；改隔离清单或放宽断言都需要 owner 与到期日，本批不为了全量变绿动它 | 07 批工作台导航（已合入）；CI Full 全量作业 | 中 | 07 批／工作台浏览器验证线（执行会话待分配） |
