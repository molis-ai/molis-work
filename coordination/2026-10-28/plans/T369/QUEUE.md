# T369 / #1716 队列与实际采用核收

**队列Verify/Gates实际成功；PR #1716已采用，远端main回读为同一queue提交。** 本线有限只读观察已终止，未触发/重跑/取消CI或操作GH写入、源码、refs、本机测试。实际补丁与后续清理由根另核。

| 绑定 | 实际值 |
| --- | --- |
| PR准确H | `89119b9c07c0910f39cfc42beb3fc729c6ee1808` |
| queue branch | `gh-readonly-queue/main/pr-1716-15ad4f397018241c8b31625aff8014b89259f239` |
| queue SHA / 实际checkout | `db29f18d4f602fa8d9efb689a6a766aa9b07625f` |
| parents | 只有一个：`15ad4f397018241c8b31625aff8014b89259f239`；是squash队列提交，不是M/H双父merge |
| queue tree | `41a185430f6e9411b8949530c6b1cdd11eb6270b`，与准确H同tree |
| queue run | [41277843795](https://github.com/molis-ai/molis-work/actions/runs/41277843795)，merge_group、attempt1、completed/success，终态更新2026-11-01 05:46:17 UTC |
| PR采用 | MERGED，2026-11-01 05:46:44 UTC，mergeCommit=`db29f18d4f602fa8d9efb689a6a766aa9b07625f` |
| 远端main最终GET | `db29f18d4f602fa8d9efb689a6a766aa9b07625f`；同tree、同单父；采用提交→main compare为identical、ahead/behind均0 |

队列成功作业原日志的 `git log -1 --format=%H` 均实报上述queue SHA，不只取workflow的head_sha。绑定原件：[checkout.json](queue/checkout.json)、[pr-final.json](queue/pr-final.json)、[main-ref.json](queue/main-ref.json)、[main-commit.json](queue/main-commit.json)、[adoption-compare.json](queue/adoption-compare.json)。Verify自身只聚合，不checkout。

**实际门禁：** [Verify job124764572364](queue/job-124764572364.log) success，真实脚本断言Gates、health、boundary、contracts、secrets、native、shell七类结果均success。[Gates job124763543723](queue/job-124763543723.log) success，15/15文件；health两片124763543636/124763543718为8/8、7/7；boundary124763543691为11/11；contracts两片124763543674/124763543672各24/24。native124763543806、secret124763543687、shell124763543538均success。原始作业全日志保于`queue/job-<jobID>.log`，快照为 [run.json](queue/run.json)、[jobs.json](queue/jobs.json)。共15 jobs，10 success、5 skipped，无分页截断。

**跳过与动态边界：** merge_group明确排除SI/Product，两job124763544630/124763544609均skipped；PR test selection124763568158仅pull_request运行，所以本次也skipped，不把它描述成选择器返回none。merge-queue核收124763561463是push专用、Linux probe124763544206是schedule/workflow_dispatch专用，均预期skip。

全部队列成功作业原日志中未见 `tests/mcp-connection-change-refusal.test.ts` 的实际文件执行行。故SI/Product未运行，新文件Linux动态仍未验证；队列绿和main采用不补签这一项，也不替作者Mac定向批/负控改署来源。目标拒绝的MCP wire证据、T340其它抛出处和产品/真实环境验收不在本报告内。full=false，本线未触发Full或任何补跑。
