# T390 PR1719 只读队列观察

状态：**队列观察完成：PR1719 已 MERGED，队列 CI/Verify 成功，远端 main 回读为准确队列提交 `6cdb218302cdb924bd8770a8c2180f5407e30031`。** 本文只记录实际队列、CI checkout、Verify、最终 merge/main 事实，不代根进行 patch-id 或采用裁定。

- PR：[1719](https://github.com/molis-ai/molis-work/pull/1719)。批准输入 H：`b7eee1b15353b74c586da601d45418c403e0ff5f`；回读未变。
- 队列基点 B：`08642dcb92dbdad029d990813da56682d6864a23`。
- 入队：2026-11-01 07:17:52Z（洛杉矶 11月1日 00:17:52 PDT），position1，AWAITING_CHECKS。
- 队列 Q：`6cdb218302cdb924bd8770a8c2180f5407e30031`；tree `ca87bd9ee5a14fd3e2fdfc1fab260310cf6c6f55`，单 parent=B（GitHub queue squash 提交）。Q 与原 PR CI checkout `92812f0d1004ee50b5bb35034ca069891a18b9e0` 是不同提交，API tree相同；不混淆为输入 H 或原 checkout。
- 队列 [CI 41284239322](https://github.com/molis-ai/molis-work/actions/runs/41284239322)，merge_group、attempt1，head_sha=Q，branch `gh-readonly-queue/main/pr-1719-08642dcb92dbdad029d990813da56682d6864a23`。
- 实际 checkout：Secret scan job124782181927 原始 `git log -1 --format=%H` 返回 Q；[完整原件](queue-secret-checkout.raw)。因此不只凭 run.head_sha 推断检出。
- 本轮 PR test selection、Security invariants、Product subset、Linux probe、Verified in the merge queue 作业均 skipped；后者不是最终 Verify。最终 Verify 已完成并成功；其余 skipped 状态没有被改写为执行通过。

安全证据边界：原准确 PR CI41282087119 的 catalog 完整16/16及其绑定已由根手读，本轮不重审或追记为queue执行。原 SI通过数差76、18文件缺逐case诊断仍 UNKNOWN，准确含义见 [CI-REPORT.md](CI-REPORT.md)；本轮SI跳过，queue/Verify成功也不能替代该未执行/未知证据。不称所有安全用例实际通过。

观察只用了 GitHub只读API/插件、现有原件及本目录报告写入；无本地git fetch、refs改动、build/test/Full、GH写入或真实Home操作。GraphQL查询补足插件没有的mergeQueueEntry/main状态读取。


## 最终状态与原件

- 队列 run41284239322 attempt1：completed/success，updated_at `2026-11-01T07:23:59Z`；[run原件](queue-run-final.json)。
- [Verify job124783296747](https://github.com/molis-ai/molis-work/actions/runs/41284239322/job/124783296747)：completed/success。已手读[完整原始日志](queue-verify.raw)，实际 Gates、Health gate rules、Package boundaries、Action contracts、Secret、Native、Shell 七组输入均 success。QUEUE_CHECK_RESULT=skipped 对应另一个“Verified in the merge queue”作业，不是 Verify 跳过；本轮事件为 merge_group，没有借 push 的队列复用分支直接退出。
- [全部15作业终态](queue-jobs-final.json)：total_count=15，读回15无分页遗漏；10 success（含 Verify）、5 skipped，没有 failure/cancel。SI、产品子集、Linux probe在 skipped之列，不签其运行结果。
- checkout另由已完成的 Action and plugin contracts (1/2) job124782181929 原始 `git log -1 --format=%H` 再确认 Q，见[原件](queue-contracts-checkout.raw)。该完整文件批24/24成功是本轮日志事实，不扩展为全部安全/产品测试通过。
- 合并发生于 `2026-11-01T07:24:25Z`（洛杉矶11月1日00:24:25 PDT）。回读时间 `2026-11-01T07:24:43.681613Z`，PR state=MERGED/merged=true，headRefOid仍为批准H，mergeCommit=Q，mergeQueueEntry=null；**远端 refs/heads/main=Q**。见[最终PR与main原件](queue-final-state.json)，与[首次队列原件](queue-first.json)区分。
- [Q commit原件](queue-commit.json)确认单父B、tree `ca87bd9ee5a14fd3e2fdfc1fab260310cf6c6f55`。未进行patch-id计算、未fetch该对象或写本地refs；本报告不把tree相同扩大成根的逐hunk采用裁定。

原 PR CI 的 catalog16/16仍属于CI41282087119/checkout92812f0，而非本次queue。SI76项通过数差额的case名/原因/skip/todo/cancel类别仍UNKNOWN；本轮SI没有执行，最终queue成功不改变该边界。没有触发重跑或补本地动态执行。
