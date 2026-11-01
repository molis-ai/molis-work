# T381 最终候选代码二审

结论：**准确H二审通过，无Blocker/P1或当前必须返工项；最终无诊断H的独立完整文件3/3证据已核收，该待项关闭。** 普通CI及采用仍由根结算。负责人：二审线5（Codex）。本线只读accepted书02:18增量、Git/diff、源码及作者/独立验证原件，重新比较事件与文件字节；未运行构建/测试/浏览器、未改产品/GH/CI。

## 准确范围与实现

H=`469dafa192ac26e7894020958b75f61d20cd2eb2`，tree=`80719ba7dc19a4aa7b7b2b09f87229673a539d96`；父B=`3fd857792a27352030ac8f3544a3b57d418febc1`。`/private/tmp/t381-dev`现读HEAD/tree一致且干净。完整diff仅tests/goals-dialogs.e2e.test.ts，+33/-13；本线重算与final.diff原字节一致，提交内容与final-test.ts相同。前两例从imports至第三例之前逐字未变。

第三例的submitGoal先调用既有`navigate(() => click(...))`，fixture在执行action前注册导航监听；click仍用既有真实CDP指针。去掉的是“只见Owner持久化即结束”的轮询，未加sleep、超时或第二次提交。导航结束后从Owner按原唯一标题取得生成goal_id，并核完整标题，随后assertGoalPage等待准确URL与该id对应的可见Frame标题，Page.getFrameTree核根frame/URL，读取标题文本并拒绝可见非空alert/create-error。默认主session的evaluate与根frame读数不借iframe或任意画布补签。

前两次back都在submitGoal全部完成后才发RELEASE导航；核回执无errorText，再核RELEASE准确URL、主frame、Owner原标题和无可见错误，切回列表后要求创建按钮可见、有尺寸、未disabled且不在inert中。随后真实openCreate还继续通过既有命中检查并等title焦点。第三次也完整核创建页面后才收尾。三种标题、240/120/239 UTF-16 units、121st截断、混合值与无孤立代理等原断言均保留，未改产品导航、共享fixture、数据或前两例业务期望。

## 顺序反证及执行来源

order-oracle.py按最初真实主frame/session、Owner生成id对应URL的commit与同loader DOMContentLoaded，在测试返回命令/第三次test.after之前核完成；不读修复helper名称来生成期望。本线只读原事件独立重算：旧两条均无commit/DCL先于302/572；新三条分别117→181→201、294→358→378、479→543→560，与old/new-oracle.json完全一致。旧脚本最后期待“两违例”仅检查取证结果，不能把其脚本exit0说成旧浏览器用例红；本轮没有再跑B，更未复现30秒超时。该证据方式符合02:18根增量裁定。

作者test.log为带被动观测候选的完整文件：3 pass/0 fail/0 skip/cancel/todo，jobs1/retries0、exit0。执行时HEAD仍B、测试是未提交候选，报告已明确；不能改署成最终H执行。对比fixed-diagnostic-test.ts与最终提交，差异仅append日志、透传command/navigate观测包装、启用只读事件观测与清理，业务操作/断言相同；移除后的最终准确H由独立验证承担。

生产源码和构建输入未改，B的匹配整体build可沿用；实际保留dist manifest与作者记录同为source_digest `c75b962c1bff4d1f6eccdb3e12e3c022e32b2c6e5523b22272f80631d83c11dd`。本线没有重算构建或另跑产品。affected原件只有本browser文件，packages/storage/uncovered/full均为空；test-only无安全合同、动作、资源变化。作者适用health/secret/diff检查及final-cleanup记录分属作者证据，无需因二审重开矩阵。

## 边界与裁决

本次证明修复的是已观测的“测试提前返回覆盖产品创建导航”。响应消费精确logpoint未命中、历史Linux两份Page.navigate 30秒首败的因果及平台差异仍UNKNOWN；不写成旧超时已解释或消失，也不消除旧Full失败/重试记录。

最终增量核收：已全文读 `/private/tmp/t381-verify/REPORT.md` 与 `tests.log`。独立验证线3的detached副本绑定准确H/tree、最终测试blob `e52b6ec44df01165e7093e79fc6fb4b8fec70558`，执行前源码digest与复用B的生产build manifest匹配。公共browser槽中仅一次最终无诊断完整文件，jobs1/retries0，逐例原日志3/3、fail/skip/cancel/todo均0，26.0586秒；报告记exit0。隔离Home/profile及自有缓存清理正常；首次过宽tmp全空检查命中Swift/tsx缓存后仅清本线缓存，非测试失败重跑。此动态执行归验证线3，本二审只核原件，不计作本线执行。最终无诊断准确H的待项由此关闭，不重审或重复运行。

当前代码及本地独立验证证据必修清单为空，无要求扩改的P2。普通CI及采用由根结算；上述新通过不解释历史Linux30秒超时或补签旧Full，未签真实Home、产品发布或用户验收。
