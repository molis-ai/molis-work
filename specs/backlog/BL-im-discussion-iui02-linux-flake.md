# BL-im-discussion-iui02-linux-flake

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-im-discussion-iui02-linux-flake | `tests/security-invariants-im-discussion-surfaces.test.ts` 的 IUI-02 在 Linux CI 上偶发多读一次（`2 !== 1`）：合并队列 run 43420074833 的 Security invariants (3/8) 红在这里；main 基线 `b819373250` 也红过。需要先在 Linux 复现环境（`scripts/linux-repro.mjs`）找出第二次读取的来源，再决定是测试时序还是真实多读 | [PR #2009](https://github.com/molis-ai/molis-work/pull/2009) 合并队列 run [43420074833](https://github.com/molis-ai/molis-work/actions/runs/43420074833)、PR 2026-11-13T12:06Z 评论；原并在 `BL-linux-ci-browser-reds` 里，随 #2046 删除后无人跟踪 | 已知缺口 | 第 06 批不碰 IM 发送路径；后续入队 run 43426979905 已通过，属偶发，不能在未复现前改断言 | Linux 复现环境；IUI-02 的发送路径与读取计数 | 中 | 工程流程（执行会话待分配） |
