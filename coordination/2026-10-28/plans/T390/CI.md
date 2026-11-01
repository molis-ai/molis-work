# T390 准确 CI 独立核收

结论：准确 PR CI 已 completed/success；Verify、SI 两片、产品子集两片均已手读原件。T390 的完整 `project-catalog.test.ts` **16/16** 在 SI1 成功，包含 RAC-2834/2836 与 RAC-2835 两条新增回归。未发现本次首败或重试。SI 其它文件有 **76 项通过数差额，涉及18个文件**，缺少逐例 skip/todo/cancel 明细，保留 UNKNOWN；不能将 job success 扩称全部安全用例实际执行通过。

本轮只读 GitHub/API/产物及本地源码，未改 GH/refs、未触发重跑、未执行本地产品测试或 Full。根另手查后按 §8 结算，当前 PR 仍 open、未合并。

## 输入绑定

| 项 | 准确值 |
| --- | --- |
| PR | [#1719](https://github.com/molis-ai/molis-work/pull/1719) |
| PR H | `b7eee1b15353b74c586da601d45418c403e0ff5f` |
| CI | [41282087119](https://github.com/molis-ai/molis-work/actions/runs/41282087119)，run 5918，attempt 1，pull_request |
| CI base B | `08642dcb92dbdad029d990813da56682d6864a23` |
| 实际检出 C | `92812f0d1004ee50b5bb35034ca069891a18b9e0` |
| C tree | `ca87bd9ee5a14fd3e2fdfc1fab260310cf6c6f55` |
| C parents（顺序） | B，H |
| 最后 run 状态 | completed/success，更新于 2026-11-01 07:06:42Z，即 11月1日 00:06:42 PDT |

PR/API head 与运行 head 均为指定 H；实际 actions/checkout 在源码作业里是 C，不能把运行 head 字段写成实际 checkout。selection 的 git log 原件见 [ci-selection.raw:128](/private/tmp/t390-verify/ci-selection.raw:128)；SI1/SI2 各自 [raw:131](/private/tmp/t390-verify/ci-job-124775940502.raw:131)、[raw:131](/private/tmp/t390-verify/ci-job-124775940446.raw:131)，产品两片各自 raw:129，均相同。

GitHub compare H→C 只有 `docs/system/EXTENSION-POINTS.md` +10/-10，too_large=null；B→C 恰好 T390 原五路径、111+/6−。因此 C 相对本地独立验证 H 没有生产/测试/依赖/工作流/selector 改动，tree 不同是新 main 文档增量，不能写成 H tree。API commit/parents/tree/两个 compare 原件见 [ci-binding.json](/private/tmp/t390-verify/ci-binding.json)。末次回读 PR H 未变，状态 open/merged=false；17个作业完整分页与终态见 [ci-terminal.json](/private/tmp/t390-verify/ci-terminal.json)。本地不存在 C 对象，未为此 fetch/写 refs，绑定改用只读 GitHub commit/compare 及日志。

## Verify 与阻塞检查

[Verify job 124776669868](https://github.com/molis-ai/molis-work/actions/runs/41282087119/job/124776669868) completed/success，06:49:34Z 结束；[原始日志53行](/private/tmp/t390-verify/ci-job-124776669868.raw:53)逐项列 Gates、Health rules、Package boundaries、Action contracts、Secret scan、Native、Shell 均 success。该 job 不消费 SI/产品结果，因此本报告独立核下列两组。

| 作业 | 原始 job ID | 相关多文件批次实读 |
| --- | --- | --- |
| Gates | 124775884136 | 15/15 文件，407/407；[raw:729](/private/tmp/t390-verify/ci-job-124775884136.raw:729) |
| Health rules 1 | 124775884123 | 8/8，381/381；[raw:364](/private/tmp/t390-verify/ci-job-124775884123.raw:364) |
| Health rules 2 | 124775884144 | 7/7，332/332；[raw:364](/private/tmp/t390-verify/ci-job-124775884144.raw:364) |
| Action contracts 1 | 124775884115 | 24/24，454/454；[raw:727](/private/tmp/t390-verify/ci-job-124775884115.raw:727) |
| Action contracts 2 | 124775884266 | 24/24，215/215；[raw:728](/private/tmp/t390-verify/ci-job-124775884266.raw:728) |
| Package boundaries | 124775884105 | 11/11，268/268；其余单文件门禁步骤亦成功；[raw:894](/private/tmp/t390-verify/ci-job-124775884105.raw:894) |
| Rust/Swift、Secret、Shell/Python | 124775884129 / 124775884180 / 124775884206 | API job/step success，Verify 原件对应 success；不虚构这些作业未逐例展开的计数 |

以上六份多文件原始日志无 retry/FLAKY 记录、无 pass/tests 差额，检出同 C。selection job `124775883938` 明确 SI whole、产品 whole，各两片，见 [raw:157](/private/tmp/t390-verify/ci-selection.raw:157)。

## 整套 SI 与 catalog

| 作业 | 结果 | 原始证据 |
| --- | --- | --- |
| [SI1 / 124775940502](https://github.com/molis-ai/molis-work/actions/runs/41282087119/job/124775940502) | completed/success；137/137 次文件执行，136 唯一文件；1237/1279 用例，通过数差42 | [命令与批次 raw:742](/private/tmp/t390-verify/ci-job-124775940502.raw:742)、[完整结束 raw:882](/private/tmp/t390-verify/ci-job-124775940502.raw:882) |
| [SI2 / 124775940446](https://github.com/molis-ai/molis-work/actions/runs/41282087119/job/124775940446) | completed/success；136/136 次文件执行，136 唯一文件；1025/1059 用例，通过数差34 | [命令与批次 raw:742](/private/tmp/t390-verify/ci-job-124775940446.raw:742)、[完整结束 raw:881](/private/tmp/t390-verify/ci-job-124775940446.raw:881) |

两份 raw 都记录实际 C checkout 和整体 `pnpm build`（raw:342），随后运行未筛 case 的 `pnpm test:security --shard 1/2` / `2/2`，没有 SELECTED 子集、name-pattern、skip-macos-only 或 retries 参数；当前 run-tests 默认 retries0。日志无失败文件、retry/FLAKY/timeout/cancelled 终止，完整批次均自然结束。不能因整体 succeeded 推定每个 case 都运行。

**catalog 关键证据**：[SI1 raw:807](/private/tmp/t390-verify/ci-job-124775940502.raw:807) 为 `07:03:26.7228415Z [64/137] ok tests/project-catalog.test.ts 17.3s 16/16 tests`。在整个两片中只有这一条 catalog 文件结果。C 与 H 的该文件一致，已核的原14例加两条 RAC 新例都属于这次完整文件；不是只筛新 case、重试结果或用本地16/16代签。成功文件模式不逐行输出名称与独立耗时，因此本报告只签完整文件16/16及其绑定内容，不捏造单个新 case 的 CI 时长。

文件数口径：securityList 去重为271；原 `test:security` 同时用 glob 和显式 token 收录 `security-invariants-alchemist-resumption.test.ts`、`security-invariants-knowledge.test.ts`，实际 shell 展开273次调用。前者在SI1重复，后者两片各一次；两处都在 M 原命令已存在，本次只末尾加 catalog。逐片将 raw 文件 Counter 与展开后奇偶分片 Counter 比较完全一致，两片合并覆盖全部271唯一文件，无漏项。不能将273称为唯一文件数，也不将这些历史重复称为重试。[展开原件](/private/tmp/t390-verify/ci-security-command-expansion.json)、[独立 SI 核算](/private/tmp/t390-verify/ci-si-audit.json)。

合计按实际调用汇总为2262/2338，差76；不是去重用例总数。下表列全部差额。成功文件只输出 pass/tests，没有逐case skip/todo/cancel原件，**精确类型、case名和原因均 UNKNOWN**；源码平台判断或历史结果不能替代这次动态记录。0/N 文件尤其不能算有实际安全断言覆盖。不扩大解释为产品失败，也不抹去为全绿。

| SI片 | 文件 | pass/tests | raw行 |
| --- | --- | --- | --- |
| 1 | `tests/security-invariants-plugin-materials.test.ts` | 18/23 | [768](/private/tmp/t390-verify/ci-job-124775940502.raw:768) |
| 1 | `tests/security-invariants-sandbox-home-database.test.ts` | 6/7 | [823](/private/tmp/t390-verify/ci-job-124775940502.raw:823) |
| 1 | `tests/security-invariants-plugin-project-database.test.ts` | 15/16 | [831](/private/tmp/t390-verify/ci-job-124775940502.raw:831) |
| 1 | `tests/security-invariants-plugin-interaction.test.ts` | 3/4 | [841](/private/tmp/t390-verify/ci-job-124775940502.raw:841) |
| 1 | `tests/security-invariants-plugin-install.test.ts` | 17/18 | [854](/private/tmp/t390-verify/ci-job-124775940502.raw:854) |
| 1 | `tests/security-invariants-plugin-lifecycle.test.ts` | 1/14 | [855](/private/tmp/t390-verify/ci-job-124775940502.raw:855) |
| 1 | `tests/security-invariants-sandbox-home-instance.test.ts` | 0/5 | [856](/private/tmp/t390-verify/ci-job-124775940502.raw:856) |
| 1 | `tests/sandbox-integration-home.test.ts` | 0/6 | [858](/private/tmp/t390-verify/ci-job-124775940502.raw:858) |
| 1 | `tests/security-invariants-plugin-trust-http.test.ts` | 0/5 | [860](/private/tmp/t390-verify/ci-job-124775940502.raw:860) |
| 1 | `tests/security-invariants-sandbox-background.test.ts` | 6/9 | [873](/private/tmp/t390-verify/ci-job-124775940502.raw:873) |
| 1 | `tests/plugin-sandbox-network.test.ts` | 6/7 | [876](/private/tmp/t390-verify/ci-job-124775940502.raw:876) |
| 2 | `tests/security-invariants-plugin-projects.test.ts` | 11/14 | [783](/private/tmp/t390-verify/ci-job-124775940446.raw:783) |
| 2 | `tests/security-invariants-sandbox-model.test.ts` | 16/20 | [785](/private/tmp/t390-verify/ci-job-124775940446.raw:785) |
| 2 | `tests/security-invariants-plugin-install-cli.test.ts` | 2/4 | [792](/private/tmp/t390-verify/ci-job-124775940446.raw:792) |
| 2 | `tests/security-invariants-publisher-revoke.test.ts` | 3/6 | [823](/private/tmp/t390-verify/ci-job-124775940446.raw:823) |
| 2 | `tests/security-invariants-call-connections.test.ts` | 6/8 | [839](/private/tmp/t390-verify/ci-job-124775940446.raw:839) |
| 2 | `tests/sandbox-integration.test.ts` | 5/9 | [846](/private/tmp/t390-verify/ci-job-124775940446.raw:846) |
| 2 | `tests/security-invariants-sandbox-home-signed-model.test.ts` | 0/16 | [856](/private/tmp/t390-verify/ci-job-124775940446.raw:856) |

## 产品子集原件与跳过/首败/重试

| 作业 | 完整结果 | 证据 |
| --- | --- | --- |
| [产品1 / 124775940422](https://github.com/molis-ai/molis-work/actions/runs/41282087119/job/124775940422) | 218/218 文件，1820/1820 用例，4浏览器冒烟；7.3分钟 | [raw:937](/private/tmp/t390-verify/ci-job-124775940422.raw:937)、[report.json](/private/tmp/t390-verify/ci-product-1-report.json)、[summary](/private/tmp/t390-verify/ci-product-1-summary.md) |
| [产品2 / 124775940470](https://github.com/molis-ai/molis-work/actions/runs/41282087119/job/124775940470) | 218/218 文件，1548/1548 用例，1浏览器冒烟；5.8分钟 | [raw:937](/private/tmp/t390-verify/ci-job-124775940470.raw:937)、[report.json](/private/tmp/t390-verify/ci-product-2-report.json)、[summary](/private/tmp/t390-verify/ci-product-2-summary.md) |

两份报告准确 commit=C、Linux x64 / Node24.14.0、endedBy=finished；每个文件 attempts=1，全部 pass。逐case fail/cancelled/skipped/todo 全0，逐文件 flaky/timeout/skipped/not-run 全0，无隔离项。虽配置 retries1，本次没有实际首败或重试。两片文件无交集、并集精确等于436文件清单，合计3368/3368用例。[独立逐文件与计数核算](/private/tmp/t390-verify/ci-product-audit.json)。

五个浏览器冒烟均实际通过一次：assistant-dock-ime 2/2、goals-refresh 7/7、project-management-navigation 1/1、shell-direct-links 2/2、context-onboarding-blank 2/2。此处是产品子集的限定场景，不代替其它界面或用户验收。

GitHub artifact 1=`13074081832`（SHA256 `9064e71fc2d98760f196830228ced3099cef78facbe8a610c2d7ce971fef9c47`），artifact 2=`13073832298`（`392b97976010fe55847289a730c41c497a11e3a2a241611a8a2c4a4d57b4c157`）。已通过连接器只读下载，再从返回文件引用保存并核对 bytes digest；ZIP只含report.json/summary.md，保留原件 [ZIP1](/private/tmp/t390-verify/ci-product-1.zip)、[ZIP2](/private/tmp/t390-verify/ci-product-2.zip)。这些原件确有逐case计数，所以产品的零skip结论比SI的摘要证据更完整。

## 跳过与最终边界

本次17个job中，仅 Linux probe job `124775884734`、Verified in merge queue job `124775906767` 按pull_request事件条件 skipped；没有把它们记作通过。SI及产品不是skipped，且独立于Verify实读成功。run attempt1、无人工重跑；本线无GH/refs写入。运行中一次SI日志读取返回404 BlobNotFound，作业结束后成功读取完整日志，未将下载时机错误记作测试失败。

root已裁full=false，本次CI也未运行Full。SI非阻塞且merge_group不执行，因此后续queue Verify不能替代本次已核SI；若head或实际组合发生实质变化，应按真实输入增量判断证据效力。当前可交根手查原始job、catalog16/16与76项UNKNOWN后按§8结算；本报告不代根合入、采用或清理。
