# BL-golden-prompt-uses-flaky

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-prompt-uses-flaky | `tests/golden-home.test.ts` 的 UPG2-02（同一提交生成两次字节相同）偶发失败，差在 `prompt_uses` 的计数：后台轮次到点与否让计数差一，第二个用例「机器慢到轮次到点」也跟着红。本批集成时红过一次、重跑通过 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾 | 已知缺口 | 不是产品回归；要先找出哪个后台轮次在生成期间写计数 | U2-c（已随 #1979 合入） | 中 | C1（执行会话待分配） |
