# 04 独立视觉修正复核

2026-09-10。同一 Grok 4.6 / xhigh 只读 Impeccable reviewer，verdict pass 仅评分先前列出的六项修正。以下为 reviewer 原结论；不代表整个界面或功能已经通过。

Check 0 holds: listed final captures exist and match the claimed viewports; `mobile-390-form-top/bottom` are complementary clips; submit geometry is judged from `mobile-390x1100-form-viewport.png`. Scoring the six listed fixes only.

## verdict
1. **P1 Chinese history/verdict/scope — resolved.** `desktop.png` index/meta is 当前进展/进展记录/配置/建立目标, not `report`/`goal.created`. `desktop-legacy-v1.png` primary line is the relation reason; type is 增加关系; IDs sit in 原记录. `desktop-real-dark.png` judgment is「可以直接打开较早报告 ：仍无法判断」, not `long: unknown`.
2. **P1 one planning return — resolved.** `desktop-planning.png` shows one「返回所选事件」and one「工作规划」heading; planning panel no longer emits a second back control.
3. **P1 next+owner at 522px and 390px — resolved.** `desktop-squeezed-reading.png` and `mobile-390-timeline.png` both show next and「当前 Runtime」without expand.
4. **P1 automatic IDs + initial field + 移除 — resolved.** `desktop-type.png` and the 390 form captures show 字段名/内容形式/必填/移除, no 类型 ID; IDs are hidden tokens; empty-field submit is blocked in client.
5. **P1 stacked mobile helper/full-width submit — resolved.** `mobile-390x1100-form-viewport.png` stacks「至少保留一个字段。」above edge-to-edge「登记到当前 Goal」; `@container 680px` sets `composer-bottom` column + primary `width: 100%`.
6. **P2 distinct current-judgment/next/risk — resolved.** `desktop.png` lead is「首次使用已接通，重启后的接续是当前缺口。」not the outcome subtitle; columns are done / next+owner / different amber risk. `desktop-real-dark.png` lead「有事项挡住完成。」; next「按当前类型记录事实。 · 待接续」≠ risk「可以直接打开较早报告」; grid copy is `var(--ink)`.

No fix-batch regressions in these captures (Goal tree, Runtime chrome, current facts vs selected history, and container-width「返回时间线」remain).

## remaining
clear. This ship covers the six scored visual/UX fixes only, not the whole GoalDetail surface and not functional acceptance.

disposition: ship
