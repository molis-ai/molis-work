# T384 Full 原件核验｜验证线5

**Full终态通过：16/16片及聚合成功，实际输入与1627个唯一文件结果核齐；其中2个文件仅重试通过，不是首轮全绿。**

- Full：[41271182787](https://github.com/molis-ai/molis-work/actions/runs/41271182787)，event pull_request、attempt1，event H `4404e142662cbd7895f46c1c6df6e5efe5e6e135`。
- 候选tree `ecf513543c29653e1be8eb44cf684efc14a3800d`。各片实际checkout在下表；parents/tree保留于commit原件，不把event H单独当checkout证明。75239fdd的不可变commit原件沿CI checkout-commit.json，新checkout另存。
- 16片实际checkout均为C `75239fddf8ffc07b792cc7991ea30b040bbc8342`；其parents准确为M `6729a2d4655caa603daa369f99884e09c4726bde`、H `4404e142662cbd7895f46c1c6df6e5efe5e6e135`，tree与H相同。16片Build步骤及完整构建原日志均核齐。
- 终态后重新GET确认：run attempt1 completed/success，17个jobs均completed/success，更新时间2026-11-01T04:59:57Z。新鲜原件：[full-final-live.json](/private/tmp/t384-verify/ci/full-final-live.json)；完整解析：[full-terminal.json](/private/tmp/t384-verify/ci/full-terminal.json)；[聚合原日志](/private/tmp/t384-verify/ci/full-124755810480.log)实际输出`shards: success`。

| 片 | job结论 | checkout/tree | Build | 完整文件汇总 |
| --- | --- | --- | --- | --- |
| [Full suite (1/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114037) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 15.5 min (2 at a time) |
| [Full suite (2/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114161) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 12.3 min (2 at a time) |
| [Full suite (3/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744113914) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed (2 only on a retry) in 31.8 min (2 at a time) |
| [Full suite (4/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114012) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 20.9 min (2 at a time) |
| [Full suite (5/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114096) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 16.9 min (2 at a time) |
| [Full suite (6/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114010) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 19.6 min (2 at a time) |
| [Full suite (7/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114054) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 19.8 min (2 at a time) |
| [Full suite (8/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114063) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 19.9 min (2 at a time) |
| [Full suite (9/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114057) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 17.0 min (2 at a time) |
| [Full suite (10/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114116) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 20.1 min (2 at a time) |
| [Full suite (11/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114018) | completed/success | 75239fdd/同H树 | success | run-tests: 102 of 102 files passed in 11.1 min (2 at a time) |
| [Full suite (12/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744113976) | completed/success | 75239fdd/同H树 | success | run-tests: 101 of 101 files passed in 11.9 min (2 at a time) |
| [Full suite (13/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114120) | completed/success | 75239fdd/同H树 | success | run-tests: 101 of 101 files passed in 18.8 min (2 at a time) |
| [Full suite (14/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114114) | completed/success | 75239fdd/同H树 | success | run-tests: 101 of 101 files passed in 15.0 min (2 at a time) |
| [Full suite (15/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114088) | completed/success | 75239fdd/同H树 | success | run-tests: 101 of 101 files passed in 16.3 min (2 at a time) |
| [Full suite (16/16)](https://github.com/molis-ai/molis-work/actions/runs/41271182787/job/124744114138) | completed/success | 75239fdd/同H树 | success | run-tests: 101 of 101 files passed in 18.2 min (2 at a time) |

聚合job：124755810480 completed/success。原始aggregate的shards结果保留，不由局部分片倒签。
已读文件结果1627，唯一文件1627；原日志排除49个macOS-only，总列表1676，本轮应纳入1627。Full不是Product隔离表的子集；实际清单与未执行范围按原件记录。

## 首败、重试与未执行范围

- Full suite (1/16): tests/agent-built-plugins-workflow.test.ts 41/42 (ok)；不作已执行通过。
- Full suite (6/16): tests/desktop-tui.test.ts 35/36 (ok)；不作已执行通过。
- Full suite (6/16): tests/plugin-sandbox-network.test.ts 6/7 (ok)；不作已执行通过。
- Full suite (4/16): tests/live-product-integration.e2e.test.ts 0/1 (ok)；不作已执行通过。
- Full suite (3/16): 2026-11-01T04:08:08.2383050Z [attempt 1 failed] FAIL  tests/onboarding-journey.e2e.test.ts  239.0s
- Full suite (3/16): 2026-11-01T04:08:08.2493384Z [retry 1] ok    tests/onboarding-journey.e2e.test.ts  224.3s
- Full suite (3/16): 2026-11-01T04:12:20.8907816Z [attempt 1 failed] FAIL  tests/page-interaction-flow.e2e.test.ts  61.8s
- Full suite (3/16): 2026-11-01T04:12:20.8959918Z [retry 1] ok    tests/page-interaction-flow.e2e.test.ts  57.3s
- Full suite (3/16): tests/live-feed-accounts.e2e.test.ts 0/2 (ok)；不作已执行通过。
- Full suite (9/16): tests/agent-studio.e2e.test.ts 0/3 (ok)；不作已执行通过。
- Full suite (8/16): tests/prologue-node-live.test.ts 0/1 (ok)；不作已执行通过。
- Full suite (10/16): tests/goals-page-golden.test.ts 67/68 (ok)；不作已执行通过。
- Full suite (13/16): tests/coding-external-wait-live.test.ts 0/4 (ok)；不作已执行通过。

成功文件逐case输出由原runner收起；pass/total差额不推断为确定原因，不宣称所有case或跨平台通过。

9个成功文件共有15项pass/total差额，另有49个macOS-only文件排除；均未记作已执行通过。Full原日志未给Product式quarantine分类统计，不推断为隔离项0。普通CI的Product两片quarantined=0是另一份已记录证据。

第3片两项首败的定位（完整[首败原文](/private/tmp/t384-verify/ci/full-first-failures-124744113914.log)及[整片原日志](/private/tmp/t384-verify/ci/full-124744113914.log)保留）：

- `tests/onboarding-journey.e2e.test.ts:172`：首轮13/14；已在行168确认两组材料显示，行171点击移除网页组后，等待`.ob-right .mw-file-group`数量退回1时DOM条件超时，焦点仍在粘贴正文输入区；不是初次导入后等待材料出现。整文件重试通过；与当前delta的因果关系UNKNOWN。
- `tests/page-interaction-flow.e2e.test.ts:42`：首轮2/3；打开settings surface后，在发送Escape之前，等待Goals展开组位于hidden/inert祖先下时DOM条件超时；Escape按键在行46–47才发送，因此该首败不能定位为Esc失败。整文件重试通过；与当前delta的因果关系UNKNOWN。

发现原件时已立即报告根；未改代码、扩大本机验证、重跑或取消CI，也未将其认定为环境问题。观察器曾按不存在的轮次文件名读取快照，得到ENOENT后定位到仅状态变化时保存的快照；此为证据读取控制错误，无CI操作或产品失败。

## 三个历史问题文件

- Full suite (4/16): tests/goals-dialogs.e2e.test.ts 3/3 (ok)；该文件retry/首败行 0，见[原始job](/private/tmp/t384-verify/ci/full-124744114012.log)。
- Full suite (3/16): tests/goals-dialogs-ui.test.ts 2/2 (ok)；该文件retry/首败行 0，见[原始job](/private/tmp/t384-verify/ci/full-124744113914.log)。
- Full suite (5/16): tests/pages-actions.e2e.test.ts 4/4 (ok)；该文件retry/首败行 0，见[原始job](/private/tmp/t384-verify/ci/full-124744114096.log)。
- Full suite (6/16): tests/pages-actions.test.ts 27/27 (ok)；该文件retry/首败行 0，见[原始job](/private/tmp/t384-verify/ci/full-124744114010.log)。
- Full suite (11/16): tests/inbox-pages-actions.e2e.test.ts 2/2 (ok)；该文件retry/首败行 0，见[原始job](/private/tmp/t384-verify/ci/full-124744114018.log)。
- Full suite (1/16): tests/ui-client-lifecycle.e2e.test.ts 3/3 (ok)；该文件retry/首败行 0，见[原始job](/private/tmp/t384-verify/ci/full-124744114037.log)。

完整原日志为ci/full-<jobid>.log，逐文件摘要为full-audit-<jobid>.json，首败段另存full-first-failures-<jobid>.log。若失败，仅交定位材料与待证关系，不擅自修改或认定环境原因。

旧T116/T143首红、retry-only、ui-client-lifecycle900秒TIMEOUT及UNKNOWN保留；当前H即使绿也不倒签旧Full或旧因果。T381/T383同步修复与当前结果分别记录。普通CI/SI/Product详[CI-REPORT.md](/private/tmp/t384-verify/CI-REPORT.md)。

仅GitHub GET和证据目录写入，无本机测试/build/浏览器/改树、GH写入、label/触发/重跑/取消CI。根手查SI及采用另结，工程通过不代表用户验收或自动直接合入。

