# T388 #1715 普通 CI 核收

状态：本轮准确H普通CI终态核收完成，run和Verify成功；full=false。SI/产品子集按选择skipped，目标浏览器文件未在本轮CI执行。本线没有触发Full、改refs/GitHub/源码或本地重跑。早期快照保留，最终结果见末节。

准确PR head `45abd242013a428d79e750503159ee580fa33ba7`，base `6729a2d4655caa603daa369f99884e09c4726bde`。本轮 [CI run 41275146353](https://github.com/molis-ai/molis-work/actions/runs/41275146353)，run_number5906、attempt1、event=pull_request，API head_sha同H。

选择作业 `124755719838` 原始日志实际checkout `refs/remotes/pull/1715/merge`，`git log -1 --format=%H`为 `49d803b4761053e4e8a6527f1e2add5a502d2d19`。Git commit API核该提交parents依次是M、H，tree=`5ab65df733c83d7881a1f6b6cf624d8cb7da4bb3`，同冻结H。证据见 [ci-selection.raw](/private/tmp/t388-verify/ci-selection.raw)。后续实际执行门禁作业还需读其checkout，不自动转署选择作业的运行输入。

同份选择日志明确 `security_mode=none`、`product_mode=none`；Security invariants与Product subset作业均skipped。这是普通CI按实际选择跳过，不签SI或产品子集已执行。本轮尚无 `workbench-stop-feedback.e2e.test.ts` 的新增CI完整文件执行证据，不能由普通CI绿色冒签该文件通过/无首败retry/skip。准确H的作者本地一次完整1/1、零skip/retry仍按 [REPORT.md](/private/tmp/t388-verify/REPORT.md) 的原来源有效；旧T385 Full首败及retry因果UNKNOWN继续保留。

2026-11-01 05:00Z（客户端2026-10-31 22:00 PDT）快照：selection、Secret scan、Shell/Python成功；其余required门禁在运行，Verify尚未生成终态。本线仅继续只读等这轮普通CI结束，不触发新运行。

## 最终结果

2026-11-01 05:03:55Z（客户端2026-10-31 22:03:55 PDT），run `41275146353` / attempt1 为 `completed/success`。终态后回读PR，head仍准确H `45abd242013a428d79e750503159ee580fa33ba7`，base/merge均未变。`Verify` job `124756582811` 为 `completed/success`；其汇总作业自身不checkout，required上游结果成功，见 [Verify原件](/private/tmp/t388-verify/ci-job-124756582811.raw)。

以下实际执行门禁的完整原始日志均已核，checkout各自明确为 `49d803b4761053e4e8a6527f1e2add5a502d2d19`；parents/tree同前述API核实值，而非仅沿用选择作业。所列run-tests文件均成功，摘要pass=total，无文件首败、retry/flaky行或case计数差额；逐文件结果保存在 [ci-job-summaries.json](/private/tmp/t388-verify/ci-job-summaries.json)。

| 实际作业 | 原始run-tests结果 | 原件 |
|---|---|---|
| Gates | 15/15文件，摘要407/407 case | [raw](/private/tmp/t388-verify/ci-job-124755719931.raw) |
| Health gate rules 1/2 | 8/8文件，381/381 | [raw](/private/tmp/t388-verify/ci-job-124755720017.raw) |
| Health gate rules 2/2 | 7/7文件，332/332 | [raw](/private/tmp/t388-verify/ci-job-124755720114.raw) |
| Action/plugin contracts 1/2 | 24/24文件，454/454 | [raw](/private/tmp/t388-verify/ci-job-124755720172.raw) |
| Action/plugin contracts 2/2 | 24/24文件，215/215 | [raw](/private/tmp/t388-verify/ci-job-124755720078.raw) |
| Package boundaries | 11/11文件，268/268 | [raw](/private/tmp/t388-verify/ci-job-124755720166.raw) |

Rust/Swift、Shell/Python、Secret scan亦成功。Security invariants、Product subset、非适用Linux probe与merge-queue确认是skipped，不写成执行通过。

**目标完整文件边界：** 选择为none且上述实际门禁日志没有`workbench-stop-feedback.e2e.test.ts`的执行行；本轮不提供它的新CI完整运行、首败/retry或逐case skip结果。作者准确H的本地完整一次1/1仍是本单动态证据，不能转署为CI执行。未因这个正常选择再触发Full或本地补跑，也没有把普通CI绿倒签旧T385首败因果。旧UNKNOWN、原首败/retry及原warn/error边界保持。

本轮只读跟踪结束，可供根结算T388普通CI；最终采用仍由根决定。T146的Full安排不在本轮执行范围。
