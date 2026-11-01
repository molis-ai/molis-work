# T388 独立本地核收

结论：**RAC-2829/2830 本地工程核收通过，无当前必修项；无需新增动态执行。** 本线只读核源码、Git与作者原件，没有重跑测试/构建/实验，未操作GitHub。CI及最终采用由根另结，旧T385 Full暂停态首败因果仍UNKNOWN。

准确M=`6729a2d4655caa603daa369f99884e09c4726bde`，H=`45abd242013a428d79e750503159ee580fa33ba7`，tree=`5ab65df733c83d7881a1f6b6cf624d8cb7da4bb3`。独立回读作者树HEAD/tree/clean及diff-check符合。实际差异仅原测试一行在`command.pause()`前增加await；本线把这一个await还原后，完整测试与M逐字相同，亦等于保留的original-test.ts。stop屏障、10秒窗口、Runtime/真实合成子进程、全部拒绝/未知不重试/成功停止与owner投影断言都未变化。相关fixture和生产owner文件blob同M。

**顺序证明核实：** pause直接返回真实CodingSessionStore.setState；store返回Host project database transaction的Promise。client先await beforeEffect，然后BEGIN、同步UPDATE、COMMIT，成功才返回；因此新增await建立真实提交完成→原visibilitychange刷新的顺序，写入错误也在刷新前传播。未增加owner读、固定sleep或强制DOM/aggregate。该静态链证明修复的顺序语义，不能还原旧CI实际读到了什么。

**准确H作者完整运行可核抵：** [test-binding.json](/private/tmp/t388-evidence/execution/test-binding.json)在调用前记录H/tree/clean及测试blob `4713162771ff151ed4c06564a9df7e5cc84b9671`；H已于04:45Z提交，构建manifest生成于04:49Z，测试日志随后实际执行，时间顺序与准确H绑定相符。原命令为完整`workbench-stop-feedback.e2e.test.ts`、jobs1/retries0/verbose，无筛case；[原始输出](/private/tmp/t388-evidence/execution/stop-feedback.raw)是原W2-18-STOP-FEEDBACK-01 **1/1、fail/skip/cancel/todo均0**，自然exit0，一次完整文件执行。结合完整测试正文，证据覆盖扣住拒绝响应时的paused刷新、拒绝诊断call-id/真实进程仍活、丢回复未知且不重试、实际成功停止和owner投影清理。不把runner退出单独作为全部行为证据，也不冒署本线执行。

作者整体build原件exit0。本线只读重新计算当前源码digest=`ed2596f14b20160c8be9477f4172e7269cf2752399a30f2f0713eaaeb1d0a872`，与manifest及作者测试前绑定相同；local-host、desktop、coding与test-kit/browser实际resolve均落本树dist。digest不含tests，故测试blob/运行HEAD单独绑定。作者health（准确M）、boundary、test-imports原始日志及结果exit0；affected仅目标完整文件，`full=[]`、`uncovered=[]`。基于实际唯一测试await变更与完整文件证据，建议本片full=false，最终由根决定，不推展为产品/旧Full全绿。

**隔离与收尾已核：** 公共槽在TMPDIR覆盖前固定为机器共享目录，内部HOME/CFFIXED/XDG/Node临时Home、file backend、ad-hoc与专用browser路径按原始运行环境设置。Foundation用户Home/Library隔离成立，系统临时目录仍未隔离，限制保留。[cleanup.json](/private/tmp/t388-evidence/cleanup.json)记自然退出、无执行目录open handle/profile进程；本线复查其列出的临时目录均已移除，当前无目标目录关联的存活运行进程。合成子进程清理由原测试真实ended断言与原t.after承担，没有独立逐PID过程采样，不能扩写为系统级审计。作者REPORT与cleanup均已齐，工作树/构建/原件保留。

原始`actions.missing`与`actions.host_closed`/`host.closed`日志行没有隐藏或销账，它们未导致本轮原测试断言失败。未做可选交错实验；旧Full41271185187首轮0/1与内部retry1/1、缺少提交/attention/DOM精确时序的UNKNOWN保持。本报告只核当前极小排序修复及本地完整运行，不签CI、Full、真实Home或最终采用。
