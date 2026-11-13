# BL-golden-prompt-uses-flaky

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-golden-prompt-uses-flaky | 2026-11-13 合后审计确认：第 06 批修复分支没有安全地只改测试就能稳定的办法；`scripts/golden-home.mjs` 的生成上下文仍会放行后台任务与随机 id，属于该 BL 原记的“单独一批改生成上下文”。本分支只保留既有测试与记录，不把偶发改成重试或跳过。 | 2026-11-13 合后审计（`fix/06-audit-followups`） | 已知缺口 | 需要隔离生成期后台任务，不能靠重试销账 | 无 | 中 | C1（执行会话待分配） |
| BL-golden-prompt-uses-flaky | `tests/golden-home.test.ts` 的 UPG2-02（同一提交生成两次字节相同）偶发失败。2026-11-11 审查修复（B4）已把 `prompt_uses` 从「读取提示词时」改到「模型调用已派发时」记录，`prompt_uses` 的计数不再漂移；但在共享机负载下，两次生成仍会差在 `agent-runtime/records` 的随机后缀文件、`assistant_notices`、`memory_uses`、`knowledge_cards` 与 `manifest.json`，属生成期后台/时序写入同族。不是产品回归；剩下的要先在生成期隔离后台任务（不让非确定的定时器/后台轮次写任何表），再复跑 UPG2-02 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾、2026-11-11 审查修复 | 已知缺口 | 生成期后台任务与随机 id 仍会写表；彻底做法要改生成上下文（隔离/冻结随机与定时器），单独一批做 | U2-c（已随 #1979 合入） | 中 | C1（执行会话待分配） |
