# BL-mr21-review-followups

分组：9. 平台小项与工程流程

三天复核（2026-11-21）里判为 P2、本次没有改的项。改了的见[三天复核](../main-review-1121/spec.md)。

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-mr21-review-followups | ① 按 UTF-16 单位截断用户文字的门禁：本次只改了 Assistant 与知识整理里的已知处，缺一条静态检查拦新增的字符串 `.slice(0, N)`。②（已完成，2026-11-23 [#2255](https://github.com/molis-ai/molis-work/pull/2255) `86318acd55`：`@molis-ai/molis-work-contracts/platform/actions` 已统一提供 `findExactActionView` 收口重复兜底实现）。③ 场景采用失败步骤把主人的 `error.message` 原文写进记录并显示（`horizontal/blueprints/src/adopt.ts`），合同 `BlueprintStepError` 要改成只存码与参数；`sandbox_unsupported` 没有产生处。④ 项目设置页标题写死 24px／20px（`apps/workbench/src/styles/project-settings-page.ts`），应改用 `--type-display-*`，要跑 `pnpm visual:compare`。⑤ 灵光对话只认 ⌘/Ctrl+Enter 发送（`plugins/native/lingguang/src/browser/chat.ts`），与平台输入框的回车约定不一致，先定约定。⑥ `acceptance.reports.submit@1` 没有幂等键，重发同一份报告会再记一条核对、再问一次平台（原 EVD-18 随 #2155 失效）。⑦ `server/migrations/sync/0001_sync.sql` 里仍写 `version=6`，远端库，改前问用户。⑧ visual-audit 的路径过滤不含宿主渲染的页面（`apps/local-host/src/**` 的页面与样式），改这些的 PR 合前不跑巡检（MR21-15）。⑨ 验收编号没有测试：第 05 批 SSC-04（撤权后下一次读写被拒）、第 12 批 DRT 13 个、第 34 批 SRB-03、第 58 批 WLN-25、第 59 批 SAI-14/15、36A 的 75 个编号里 49 个查不到证明；第 12 批 BCD-13 的前提已被 #2163 取消，要改写或作废。 | [三天复核](../main-review-1121/spec.md)（2026-11-21） | 明确后续做 | ③ 是合同改动；④⑤ 要先定样或定约定；⑦ 碰远端库；⑧ 是 CI 改动且等 #2201 合入；⑨ 要逐条写真实路径的测试，各归原批主人 | 无 | 中 | 待分配 |
