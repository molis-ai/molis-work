# BL-linux-ci-browser-reds

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-linux-ci-browser-reds | 首页组合在 CI（Linux，约慢 3 倍）上读不出，这几个用例每次都红、重跑也红，本机（macOS）与本机 Linux 容器多半能过：`tests/surface-cross-positions.e2e.test.ts` 的 IUI-03 与 IUI-10（首页的 Inbox 卡在整次组合的 1 秒截止内答不完，`horizontal/surfaces/src/values.ts` 的 `DEADLINE_MS`，重试也是同一预算，慢机上永远读不出）；`tests/security-invariants-im-discussion-surfaces.test.ts` 的 IUI-02/03/10/21（原消息与引用应只读一次主人对象，CI 上读了 3 次，疑与同一截止下的重读同源；第二条断言已补上每次读取的来源，下一次 CI 红即可确认）；`tests/home-offers.e2e.test.ts` 的 RAC-214（基线全量里 47 秒通过，run 43380029353 两次都红：首页的 Inbox 行 30 秒内连同按「重试」都没出现；负载高的开发机上也会出现行先出现、点击前又没了）。Inbox 主人读得慢的一个来源见 [BL-inbox-update-blocks-host](BL-inbox-update-blocks-host.md)（逐个动作同步重查安装记录）。是第 15 批首页在慢机上的表现：要定下慢机上首页怎样读出（测试环境可调截止、重试给更长预算，或晚到的结果仍然画上），再改用例。原先同列的 B27SRC-05、QA-033、QA-034 是测试一侧的问题，已在 #2046 修好 | [第 15 批 #2017 的全量](https://github.com/molis-ai/molis-work/pull/2017)；用户 2026-11-12 弹窗定先入队、记 BL；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md)；#2046 的基线全量（main b819373250） | 明确后续做 | 牵涉 §8.1 的一秒截止，要先定慢机上的行为；本机复现可用 `node scripts/linux-repro.mjs` 加 `MOLIS_WORK_TEST_CPU_THROTTLE`（`docs/system/PARALLEL-DEVELOPMENT.md` §8.1） | 首页截止的产品决定 | 高 | 平台（组合服务），第 15 批原会话 |
