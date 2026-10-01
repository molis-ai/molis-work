# Decision prerequisite ordering

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。src/web/render.ts 与 Rewire 决定中心已退役。没有剩余事项。

## 背景与目标

Draft Contract Proposal 可以引用待用户决定的 Dependency Rewire。Coordinator 已要求用户先决定所有关联 Rewire，再接受 Contract；当前 Web 却先展示 Contract，并让“确认并设为可执行”看起来可点击，用户点击后才收到后端拒绝。

目标是让页面顺序和真实协议一致：先处理关系调整，前置决定完成后再接受 Contract。

## 范围

- `src/web/render.ts`：待决定 Rewire 排在 Contract Proposal 前面；关联 Rewire 仍 pending 时，Contract 主按钮禁用并用白话说明恢复条件。
- `tests/web.test.ts`：覆盖展示顺序、禁用状态和前置决定完成后的恢复。
- `DESIGN.md`、`.impeccable/design.json`：同步 shipped 决策顺序和 disabled 前置状态。

## 非目标

- 不改变 Coordinator 的 Candidate、Rewire 或 Contract 决策语义。
- 不自动确认任何 Proposal。
- 不重做 Decision Inbox 的视觉系统。

## 关键行为

1. Decision Inbox 先展示 pending Rewire，再展示当前 Goal 的 pending Contract Proposal，最后展示其他 Candidate。
2. Contract 引用的任一 Rewire 为 pending 时：
   - 主按钮显示“先处理依赖调整”；
   - 按钮具有原生 `disabled`，不能发送请求；
   - 附近文字说明“上方依赖决定完成后才可确认 Contract”。
3. 所有关联 Rewire 已 `applied` 或 `rejected` 后，按钮恢复为“确认并设为可执行”。
4. “退回补全”始终可用，因为拒绝 Contract 不需要先改变依赖。

## 验收与验证

- HTML 中 pending Rewire 的位置早于关联 Contract Proposal。
- pending 时批准按钮 disabled 且包含恢复说明。
- Rewire 决定后重新获取页面，批准按钮恢复可用。
- DESIGN 文档和 sidecar 中的 Draft Contract Proposal 代表组件反映相同规则。
- `pnpm exec tsx --test tests/web.test.ts` 与 `pnpm typecheck` 通过。
