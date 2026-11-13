# BL-linux-ci-browser-reds

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-linux-ci-browser-reds | 三个浏览器用例在 CI（Linux，约慢 3 倍）上每次都红、重跑也红，本机（macOS）都过：`tests/code-scale.e2e.test.ts` 的 B27SRC-05（Linux 字体下代码块行高与 20px 一行的假设不符）、`tests/pages-find.e2e.test.ts` 的 QA-033（重新载入后查找计数停在别的值）、`tests/todo-draft-recovery.e2e.test.ts` 的 QA-034（点击目标被遮住）。三个在第 22 批的全量里同样红，是 `main` 的老问题。原列第四项 `tests/surface-cross-positions.e2e.test.ts`（首页 Inbox 卡在整次组合 1 秒截止内答不完）已由用户 2026-11-13 定把截止放宽到 3 秒解决（surface-composition §8.1） | [第 15 批 #2017 的全量](https://github.com/molis-ai/molis-work/pull/2017)；用户 2026-11-12 弹窗定先入队、记 BL；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 只在 Linux CI 上复现，本机复现不了 | 一台 Linux 复现环境 | 高 | 各插件与测试环境 |
