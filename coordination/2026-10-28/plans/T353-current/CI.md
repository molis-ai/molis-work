# T353 PR-B 本头普通 CI 核收（一审线2）

状态：**本头普通 CI 已终态成功，Verify、两片适用 SI、两片 Product 均逐项核收；本轮只读工作完成并停止观察。** 保留文件通过与用例执行的区别、平台跳过及未执行范围；不签新 Full、正式采用或产品验收。

## 头、实际 checkout 与树

- 开始及终态后连接器回读 #1682：head=`2de956e7ac3b4ad1ef7df936b2e48b5b5ee72d09`，base main=`6729a2d4655caa603daa369f99884e09c4726bde`，open、未merged；没有漂移。不是只读本地旧ref后认定远端头。
- [CI 41274506449](https://github.com/molis-ai/molis-work/actions/runs/41274506449)：`pull_request`、attempt **1**，completed/success。创建至终态：**2026-10-31 21:48:35–22:08:02 PDT**。最终17 jobs：**15 success、2 skipped**，没有失败或取消的step。
- 事件head_sha是上列N；实际运行checkout由各job的原始`git log -1`确认，为GitHub merge commit **`2fd3aa4530b10a86010f4e6544415eaae681d7c2`**。GitHub GET该git commit对象：parents依次是M6729、N2de956；tree **`c532693846cc5ceba57bcfcdcbdd826f95689650`**，与独立本地终核候选完全相同。Verify只是聚合job、不checkout；其余14成功job的实际checkout一致。没有用当前PR merge ref猜测历史checkout，也没有fetch/写refs。
- selection原始日志明确 **security_mode=whole、product_mode=whole，各2 runners**；原因含shared-core、跨包及lock/registry变动，不是窄选文件。SI/Product均continue-on-error，因此本线没有从workflow总体success或Verify推断它们通过，而是逐job读原始完整结果。

身份与完整原件：[run-final.json](ci/run-final.json)、[jobs-final.json](ci/jobs-final.json)、[checkout commit](ci/checkout-candidate.json)、[selection.log](ci/selection.log)、[17 job独立核对](ci/independent-final-jobs.json)。所有15个成功job的完整原始日志均留为 `ci/job-<id>.log`。

## Verify 与实际跳过

[Verify job124754840500](https://github.com/molis-ai/molis-work/actions/runs/41274506449/job/124754840500) success，原日志实际走“Required package gate passed”并逐一要求其依赖success，未走merge-queue免重跑路径。依赖Gates、两片health rules、两片contracts、Package boundaries、Secret scan、Rust/Swift、Shell/Python全部success。

原件中health rules为8/8及7/7完整文件、contracts各24/24完整文件、Gates15/15完整文件；这只描述相应job覆盖，不当作Full。原生检查的`native-checks.test.mjs`为22项：20 pass、**2 skipped**，是macOS runner没有shellcheck而跳过的两个真实shellcheck自测（“passes a clean script”“fails a warning (cd without a guard)”）。独立Shell/Python job成功，但不把macOS这两项改写为执行通过。[先行依赖日志解析](ci/completed-job-audit.json)

两个job级skipped有明确事件条件：

- `Verified in the merge queue`只供push时复用队列Verify，本次是pull_request，未执行。
- `Linux probe …/6`只供schedule/workflow_dispatch，本次未执行；不能据本轮普通CI声称整套Linux probe已跑。

## SI：两片文件均过，保留56项未执行边界

| SI job | 完整文件执行 | 原始pool摘要 pass / tests | 摘要差额 |
| --- | --- | --- | --- |
| [1/2，124753926832](https://github.com/molis-ai/molis-work/actions/runs/41274506449/job/124753926832) | **134/134**，success | 1224 / 1261 | 37 |
| [2/2，124753926775](https://github.com/molis-ai/molis-work/actions/runs/41274506449/job/124753926775) | **134/134**，success | 1000 / 1019 | 19 |

独立逐行解析实际pool输出：合计268次完整文件执行、**266个不同文件**，与N上`test:security`脚本的展开entry多重集合完全相同，无文件遗漏或新增。脚本本身把`security-invariants-alchemist-resumption`和`security-invariants-knowledge`各列了两次（glob加显式路径），因此268不能称作268个不同文件。两片没有fail/retry输出；此runner在未传`--retries`时默认0，本次未重试。[独立SI完整文件核对](ci/independent-security-audit.json)、[实际源码清单展开](ci/expected-security-files.json)

合计原始摘要为**2224 pass / 2280 tests**，不能写成2280断言全执行。差额56所在16文件已逐一核现行源码：**55项对应macOS专属skip条件，另1项是`plugin-sandbox-network.test.ts`的真实registry HTTPS E2E，受`MOLIS_SANDBOX_NETWORK_E2E=1`开关控制，当前未执行**。例如SI2的`sandbox-home-instance`是0/5，SI1的`plugin-trust-http`0/5、`sandbox-integration-home`0/6，均不能写成安全拒绝路径已在Linux运行。

这次成功pool日志不打印逐case TAP明细；上述分类来自日志pass/tests差额与N源码skip条件，并保留这一证据限制，不编造缺失的逐case诊断。每文件差额、源码条件及共享fixture `mac`定义见 [platform evidence](ci/security-source-platform-evidence.json)、[fixture证据](ci/security-fixture-platform.json)。本线没有为补Linux不可覆盖内容另跑本机测试，也不把旧Mac运行改署为本轮。

## Product：完整437文件，全首轮通过

两份upload artifact内的原始report.json已下载保存，独立逐entry复算并与N的`tests/ci-product-subset.txt`精确比较：437个不同文件，missing/extra均空，quarantined=0。两份报告commit均为实际checkout `2fd3aa45…`，endedBy=finished；没有把预算结束、取消或部分输出认作全部通过。

| Product job | 完整文件 | 用例pass / tests | 实际尝试 |
| --- | --- | --- | --- |
| [1/2，124753926811](https://github.com/molis-ai/molis-work/actions/runs/41274506449/job/124753926811) | **219/219** | **1556/1556** | 全部attempts=1 |
| [2/2，124753926807](https://github.com/molis-ai/molis-work/actions/runs/41274506449/job/124753926807) | **218/218** | **1819/1819** | 全部attempts=1 |
| 合计 | **437/437** | **3375/3375** | 无重试 |

虽然workflow允许一次retry，报告实际没有multi-attempt、flaky、skipped、fail、cancelled、todo、timeout或not-run。5个完整browser smoke全部执行：assistant-dock-ime、goals-refresh、project-management-navigation、shell-direct-links、context-onboarding-blank；共14/14用例。不是只证明Chrome可启动或空数据快照。

原始完整报告：[Product 1](ci/product-subset-1/report.json)、[Product 2](ci/product-subset-2/report.json)；[独立逐文件与计数审计](ci/independent-product-audit.json)。两份artifact ZIP与summary.md及原始完整job日志保留在同一`ci/`目录。

## 不被本次CI关闭的边界

- 旧Full **41233823797仍失败**；旧Alchemist首跑及retry失败、其它未运行/取消范围以及“T366是否唯一根因”UNKNOWN保持，不因本头普通CI成功改写。[既有独立终核报告](REPORT.md)保留完整来源。
- 本头 `full=true`。根因T385重复project-journey 390px失败而暂停新增Full调度是另一条归因/排期事实；本线不触发、取消、重跑或推断B Full，也不把别线Full当B Full。新Full、队列/正式采用及回读main仍由根结算，C仍等B实际采用。
- 本轮只有只读连接器/GET、Git对象读取及本目录原件下载/复算；没有本机build/test、新树、refs/GitHub写入、CI控制、真实Home或凭据操作。普通CI核收已完成，没有后台观察进程或持续轮询。
