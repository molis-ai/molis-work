# T388 #1715 队列与采用核收

状态：队列Verify成功，实际合入及远端main采用已回读确认。根的§8审计6553726390及正常入队授权由根持有；本线无GitHub写入、refs修改、Full或本机执行。早期快照保留，终态见末节。

队列 [CI run 41275642694](https://github.com/molis-ai/molis-work/actions/runs/41275642694)，attempt1，event=`merge_group`；head SHA `820d9a0f59a2f61fde908eae2558c599e26a3a5c`，队列分支`gh-readonly-queue/main/pr-1715-6729a2d4655caa603daa369f99884e09c4726bde`。Git commit API核该候选仅一个parent：M `6729a2d4655caa603daa369f99884e09c4726bde`；tree=`5ab65df733c83d7881a1f6b6cf624d8cb7da4bb3`，与已验PR H `45abd242013a428d79e750503159ee580fa33ba7`的tree相同。它是队列采用候选，不冒称PR双亲合并提交。

已完成的Action/plugin contracts 2/2实际checkout日志及文件结果保存为 [queue-contracts2.raw](/private/tmp/t388-verify/queue-contracts2.raw)，用于绑定实际执行输入，不仅依据run标题。当前队列仍运行，Verify尚无终态，PR仍open/unmerged。其余门禁、实际采用和main回读待追加。

队列中的selection/SI/product subset等按工作流skipped，不签目标浏览器文件的新执行。原准确H普通CI及作者完整一次1/1沿原报告来源；旧因果UNKNOWN保持。采用后须提醒根核实际合入补丁并清理作者工作树/分支，本线不替根写refs或删除别线树。

## 队列终态与实际采用

队列run `41275642694` / attempt1 在2026-11-01 05:12:27Z为 `completed/success`；`head_sha`仍准确队列SHA `820d9a0f59a2f61fde908eae2558c599e26a3a5c`。`Verify` job `124758238060`为 `completed/success`，[原始汇总](/private/tmp/t388-verify/queue-verify.raw)确认required上游成功。Gates自身原始checkout也是队列SHA，比较base为冻结M，随后15/15文件成功、未见retry行，见 [queue-gates.raw](/private/tmp/t388-verify/queue-gates.raw)。此前合同2/2原件为24/24文件成功。SI/product subset在本队列不运行，未触发Full或重跑目标文件。

PR API最终回读 [#1715](https://github.com/molis-ai/molis-work/pull/1715) 为 `closed/merged=true`，合入时间2026-11-01 05:12:52Z（客户端2026-10-31 22:12:52 PDT），`merge_commit_sha=820d9a0f59a2f61fde908eae2558c599e26a3a5c`。随后读取`refs/heads/main`也为该SHA，因此实际采用已发生，不只是队列绿或PR意向状态。

远端实际合入commit API另核：单parent为M `6729a2d4655caa603daa369f99884e09c4726bde`，tree仍`5ab65df733c83d7881a1f6b6cf624d8cb7da4bb3`，同已验H。实际提交只改 `tests/workbench-stop-feedback.e2e.test.ts`，+1/−1，patch唯一变化是原`command.pause()`前的`await`；没有10秒/屏障/原断言或生产改动。

**交根收尾提醒：** 按根的采用流程回读/同步本地main上的实际单行补丁，并清理T388作者工作树`/private/tmp/t388-dev`及本地分支`feature/t388-await-pause`；证据保留目录不要混作工作树删除。本线仅核远端事实，未做本地refs更新或作者树清理。旧T385首败/retry因果UNKNOWN及此前warn/error边界不因合入销账。

本线队列跟踪到此完成并停止。
