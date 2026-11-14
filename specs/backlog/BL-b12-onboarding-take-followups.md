# BL-b12-onboarding-take-followups

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b12-onboarding-take-followups | 上手承接（`onboarding.takes`）留下的两处：① `apps/local-host/src/context-onboarding-service.ts` 的 `handToTaker` 把调用失败一律记成 `not_taken: "refused"`，暂时性失败或取消也永久记成「没交」，页面也不说原因——要分出原因并在页面显示；② 摘要导入的 `request_hash` 对整个 `adoption` 求哈希，而 `adoption.take.output_set` 会在采用途中变；今天安全是因为它总在摘要导入之前写好，约束不明显——只对 title、body、blank、todo_selected 求哈希，或把 `output_set` 移出 `adoption` | 第 12 批评审台复查 `dbde532c79`（[#2061](https://github.com/molis-ai/molis-work/pull/2061) 评论 6874245349） | 已知缺口 | 不挡合并；① 和第 44 批 44-1「说出交了几份」是同一处页面，一起做 | 第 44 批 44-1 | 中 | 第 44 批主会话 |
