# BL-linux-ci-browser-reds

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-linux-ci-browser-reds | 四个浏览器用例在 CI（Linux，约慢 3 倍）上每次都红、重跑也红，本机（macOS）都过：`tests/code-scale.e2e.test.ts` 的 B27SRC-05（Linux 字体下代码块行高与 20px 一行的假设不符）、`tests/pages-find.e2e.test.ts` 的 QA-033（重新载入后查找计数停在别的值）、`tests/todo-draft-recovery.e2e.test.ts` 的 QA-034（点击目标被遮住）、`tests/surface-cross-positions.e2e.test.ts` 的 IUI-03 与 IUI-10（首页的 Inbox 卡在整次组合的 1 秒截止内答不完，`horizontal/surfaces/src/values.ts` 的 `DEADLINE_MS`，重试也是同一预算，慢机上永远读不出）。前三个在第 22 批的全量里同样红，是 `main` 的老问题；第四个是第 15 批首页在慢机上的表现：要定下慢机上首页怎样读出（测试环境可调截止、重试给更长预算，或晚到的结果仍然画上），再改用例 | [第 15 批 #2017 的全量](https://github.com/molis-ai/molis-work/pull/2017)；用户 2026-11-12 弹窗定先入队、记 BL；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 只在 Linux CI 上复现，本机复现不了；第四个牵涉 §8.1 的一秒截止，要先定慢机上的行为 | 一台 Linux 复现环境；首页截止的产品决定 | 高 | 平台（组合服务）与各插件 |
