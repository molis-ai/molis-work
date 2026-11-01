# T369 / PR #1716 普通CI核收

**准确 H `89119b9c07c0910f39cfc42beb3fc729c6ee1808` 的普通CI completed/success，Verify实际执行并success；新增测试的Linux动态执行仍未验证。** Run [41277242180](https://github.com/molis-ai/molis-work/actions/runs/41277242180)，pull_request、attempt1，终态更新时间2026-11-01 05:36:51 UTC。末轮PR回读仍H、OPEN、未merged。共15 jobs，11 success、4 skipped；本线有限只读观察已在终态停止，没有触发Full、重试、取消、本机复测或GH写入，full=false保持。

实际checkout是合并提交 `22351fa102abebb048287a79ad412d9ddd3e4382`；双亲依次为M=`15ad4f397018241c8b31625aff8014b89259f239`、H；tree=`41a185430f6e9411b8949530c6b1cdd11eb6270b`，**与H同tree**。所有执行checkout的成功作业原日志均为此合并提交；Verify自身只聚合结果、不checkout。原件 [checkout.json](ci/checkout.json)、[selection.log](ci/selection.log)。

| 实际作业 | Job ID | 终态/实际覆盖 |
| --- | --- | --- |
| Verify | 124762864140 | success，实际执行七类结果断言 |
| Gates | 124761801929 | success，15/15文件 |
| Package boundaries | 124761801978 | success，11/11文件 |
| Action/plugin contracts 1/2、2/2 | 124761801935、124761801916 | success，各24/24文件 |
| Health gate rules 1/2、2/2 | 124761802051、124761801897 | 均success |
| Secret、native、shell | 124761801747、124761801908、124761802039 | 均success |
| PR test selection | 124761801634 | success，security_mode=none、product_mode=none |
| SI、Product | 124761862881、124761863216 | 均skipped，无动态执行 |

[Verify完整日志](ci/job-124762864140.log) 实列并断言Gates、health、boundary、contracts、secrets、native、shell七类结果均success；不是未执行的计划状态或仅check名称存在。

SI/Product的实际跳过理由来自 [选择器raw](ci/selection.log)：以HEAD^1为base，此次触及1个测试，它不在SI的270文件或Product的436文件清单中，因此两模式none，workflow按成功选择器输出跳过。另两个expected skip：124761802501为仅push运行的merge-queue核收，本次pull_request；124761802329为仅schedule/workflow_dispatch运行的可选Linux probe。

专门核过全部11份成功作业完整日志，未见 `tests/mcp-connection-change-refusal.test.ts` 的实际文件运行/结果行。合同两片执行的是各自24文件固定集合；SI/Product没有执行。因此本轮只签工程/合同等实际CI范围，**不把整体CI绿、源码被静态读取或选择器成功冒作新增文件Linux通过**。作者Mac三完整文件21/21、目标变异与恢复继续按原执行来源核抵，不能改署为本轮Linux结果；本线没有为补该项启动任何新运行。

原件：[run.json](ci/run.json)、[jobs.json](ci/jobs.json)、[pr-final.json](ci/pr-final.json)，成功作业全文为本目录 `ci/job-<jobID>.log`。jobs总数15，未分页截断；只读watch已自然退出。最终采用、适用验收与是否另行取得新文件Linux证据由根结算，不扩到T340其他抛出处或MCP目标拒绝的wire传输证明。
