# BL-jelly-command-readers

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-jelly-command-readers | Jelly 的读值函数和 `store` 那层的 `as` 留着：全部命令走一个处理器，`store.execute({ type, ...fields })` 拿到的 `JellyCommand` 值都是 `unknown`，`calendar.ts` 的 `identifier`、`record`、`ids`、`bool` 和 `content.ts` 的 `record`、`string`、`priorityOf`、`blocks` 在收窄；`calendar.ts:138,139,185,187,188,189`、`content.ts:132` 还有 `as`，含一处 `as unknown as JellyPlan`。N22-G 只查定义处和处理器的输入参数，查不到它们 | [第 05 批，#1923](https://github.com/molis-ai/molis-work/pull/1923) | 明确后续做 | 要删就得把 `JellyCommand` 改成由 schema 推出的联合，而表驱动的处理器证明不了「这个 `type` 配这份字段」，要么一处 `as`，要么 33 个处理器分开写，`contract.ts` 的 `JellyCommand` 还是页面在用的类型。留着的代价（`store` 那层的 `as`）小于改它的代价，评审台和统筹都接受，不挡 T 片 | — | 低 | E 轨 |
