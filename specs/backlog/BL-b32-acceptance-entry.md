# BL-b32-acceptance-entry

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b32-acceptance-entry | 32-2 的本人认可入口现在是 `acceptance.decide@1` 与 `/api/acceptance/decide`（只有本人，安全用例已过），没有走 32.md 第 2 项／APR-15 写的「39-2 前用助理决定请求与原审查队列」，`modules/acceptance` 也只借用了共用审查合同的 `ReviewEvidence` 层级，没有使用 `ReviewRequest`/`ReviewReference`。39-2 落地后按用户 2026-11-14 的补充改通用决定入口；在 39-2 前需要用户确认这条本人门可以替代原审查队列，否则要改接现有入口 | 第 32 批 #2093 合后独立审计（32.md 第 2 项、`specs/agent-approval/spec.md` APR-14／APR-15） | 待你决定 | 功能与安全上成立：认可、退回、改要求都只开本人门（S-acceptance-person-decides），执行者不能替本人决定；缺口是合同口径与「不另造」的验收，不是越权 | 39-2 通用决定入口 | 中 | 助理与 39 的主人 |
