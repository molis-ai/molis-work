# BL-onboarding-journey-flaky

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-onboarding-journey-flaky | `tests/onboarding-journey.e2e.test.ts:173` 偶发失败：删掉网页来源那一组后等 `.mw-file-group` 剩 1 个，超时，焦点还在 `cx-browser-text`，里面的字还在。#1912（头 `82d9a0fd5`）的 `Full suite (13/32)` 同一处连败两次（两次尝试），重跑全绿。#1912 不改产品代码，所以不是它带来的；是用例还是产品里有竞争（比如输入防抖在删除后又把这一组加回来）没有查。`run-tests` 的重试也没救回来，所以可能挡别的 PR | [第 05 批，run 42361835978](https://github.com/molis-ai/molis-work/actions/runs/42361835978) | 明确后续做 | 第 05 批这几片都不碰引导页；要先复现再判断，不为变绿放宽断言 | — | 中 | F 轨 |
