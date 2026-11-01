# T381：首轮有界诊断，未修复

负责人：Codex开发线2，独立验证线3/二审线5按原派单保留。**首轮完整原业务文件3/3通过，未复现30秒Page.navigate超时；根因仍UNKNOWN，没有修复候选H。** 按accepted WO停止概率重跑，将证据和下一步交根。仅临时本测试诊断，结束后已精确还原，feature/t381-goals-navigation干净停在B。

## 输入与执行

B=`3fd857792a27352030ac8f3544a3b57d418febc1`，准确tree见initial-binding.json；自有树`/private/tmp/t381-dev`。正式任务`coordination/2026-10-28/tasks/T-381.md`和BOOK-REVIEW已读。frozen/offline安装及公共build槽整体pnpm build exit0，最终manifest source_digest=`c75b962c1bff4d1f6eccdb3e12e3c022e32b2c6e5523b22272f80631d83c11dd`，test启动前源码digest复核相等。

唯一一次诊断执行完整`node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/goals-dialogs.e2e.test.ts`，公共browser槽，3pass/0fail/0skip/0cancel/0todo，22.57秒自然退出0。第三例5.44秒。Node24.14.0/ABI137，Mac专用HeadlessChrome153.0.8010.12，revision971a7443…；wrapper为molis-test-browser并显式use-mock-keychain/password-store=basic。独立系统HOME/CFFIXED/XDG、file backend、ad-hoc、合成demo，无真实模型、账号、Home4207或日常Chrome。

实际浏览器version已由CDP取得；完整进程argv未单独采样，仅保存wrapper和现行launcher调用来源，不能冒作额外argv现场。旧LinuxCI与本轮Mac有平台差异；两旧日志没有在本报告定位准确Chrome版本，不倒填为153。对该输入差异尚未作新运行。

## 已看到的真实交错（接收序号/单调时钟）

本地passive listeners在导航/提交前启用Network/Runtime/Page lifecycle/Debugger，记录858条事件。未hold/intercept、包装fetch/location、改业务或自动接受dialog。只在本测试本地记录command发/回、store首见及trusted submit/input；原120emoji、120ASCII、119emoji+ASCII及121st截断/无孤立代理断言、另两例全部原断言保留。

| 事件 | emoji创建/首次返回 | ASCII创建/第二次返回 |
| --- | ---: | ---: |
| trusted真实submit | seq299 / 20134.76ms | seq569 / 21180.57ms |
| store首见实际新goal_id | seq300 / 20152.71ms | seq570 / 21195.10ms |
| 测试发Page.navigate(RELEASE) | seq302 / 20153.20ms | seq572 / 21195.20ms |
| POST201/loadingFinished被收到 | seq304–305 | seq575–576 |
| 同主frame产品scriptInitiated新Goal导航 | seq306 / 20456.69ms | seq577 / 21195.65ms |
| 新Goal Document加载被取消 | seq309 ERR_ABORTED | seq580 ERR_ABORTED |
| RELEASE命令回复（各自新loader） | seq315 / 20457.51ms | seq592 / 21477.66ms |
| 原navigate等待成功返回 | seq451 / 20847.87ms | seq728 / 21817.80ms |

两次创建、产品/测试导航都属于主frame1F98…、sessionB47A…；具体完整ID/URL/request/loader/context见events.jsonl与timeline.json。不是拿iframe的DCL补签主frame。两次返回的Page.navigate回复loader分别2A9B…/521A…，与对应frameNavigated/lifecycle记录一致。没有收到javascriptDialogOpening/Closed、Runtime.exceptionThrown、目标detach事件；监听已启用、会话持续回复，但这只描述本轮，不排除旧失败的dialog或CDP链故障。

**这是确实发生的导航重叠及产品新Goal加载被测试返回覆盖，不是30秒超时的充分根因。** 本轮两条返回命令都正常回复；不能把ERR_ABORTED直接解释为旧CI超时原因。Network事件的接收单调时间和Chrome自身timestamp分列保留，CDP事件可能排队，不能从seq303晚于store推出POST请求实际晚发。

第三种混合标题在seq856已完整持久化，原文件随即收尾；本轮未观察到它后续POST事件/产品新Goal文档完成，不能签三次完整创建页面旅程。原文件3/3只是覆盖原业务断言，不满足RAC2808要求的修后完整导航证明。

## 缺口及唯一下一步建议

尝试从33个当前origin脚本源码匹配字面`navigate(route(result.goal_path));`安装非暂停日志点，**没有实际setBreakpoint/命中**。因此响应消费与location.assign的精确生产切点仍UNKNOWN；frameRequestedNavigation只证明该URL导航已由脚本发起。未把“已申请观测”写成“切点已命中”。命令序号/回复和frame loader已记录，但未采底层CDP包ID/连接close专用回调；没有当前超时原件，不填旧失败空缺。

根回读已证交错后的下一步候选（仍待准确裁定，未实施）：优先只修本测试的过早返回，不再先安排Linux概率复现。第三例每次submit之前以既有`navigate(() => click(...))`登记真实导航等待；从owner持久化行固定新goal_id后，核同主frame的准确新Goal URL、`data-goal-view`及用户可见标题=输入标题、无可见创建/页面错误，完成后才允许backToBoard；返回后核准确RELEASE URL/Goal标识及可见可用创建入口。三标题边界和另两例断言不动，不加超时、不改变产品导航。

拟用独立顺序oracle作反证：以本测试的passive主frame/loader记录，要求“目标新Goal Document提交并完成对应DOMContentLoaded”发生在“测试发RELEASE命令”之前；再用真实DOM/title/无错误断言验证目标，而非仅计数DCL。现存旧trace的两次newGoal Document都ERR_ABORTED、没有提交完成，返回先发，故这些真实记录应被该oracle判红；这仍是候选oracle对旧证据的推导，未冒称已经执行旧红用例或证明所有调度稳定红。根/独立窄核后才以同输入旧路径/候选路径各一轮完整文件，核顺序oracle旧红/新绿及解除观测控制后的正常路径。若旧路径在该顺序oracle下不稳定失败或缺事件，不随机重跑，交具体差异再裁。当前不使用intercept/hold/暂停控制，也不要求随机制造30秒超时才承认过早返回缺口；历史超时因果仍UNKNOWN。

原“先转Linux补观测”的建议被上述根收窄方向替代，不据此启动任何运行。响应消费日志点未命中的缺口继续留账；若根认为正反证仍需要该切点或确定性控制，再单独冻结实际执行位置/测试侧接缝。

## 验收与旧事实

RAC2807：B/build、两旧来源、当前submit/store/frame-loader/命令事件已交；未复现及生产消费切点缺口保留。RAC2808：未运行旧红/新绿，未修复，不声称通过。RAC2809：本轮原完整文件3/3、三标题与另两例原断言通过；没有最终修复H，不能签最终回归/产品验收。

旧T116 Full41260457165/job124712459625第二次backToBoard超时、T143 Full41261014012/job124714101683第一次超时，各首轮2/3与内部retry3/3分源保留，非B本轮执行。原完整job已复制为t116-full-job.log/t143-full-job.log，historical-failure.md保原读结论。不将两旧头与B混成一个已证根因。

## 原件和清理

initial-binding.json、build-manifest/records、install/build/test.log及各result、original-test.ts、diagnostic-test.ts/diagnostic.diff、instrument.py、events.jsonl/timeline.json、历史完整job。诊断未进入永久测试diff；本次所有Host/Chrome/队列进程结束，fixture自然清理独立Home/profile，监听after移除；9个系统Home/XDG/tmp/cache目录已删，cleanup.json可核。自有feature树/build干净保留供根下一步，未碰其它候选。无提交/push/GH/Full/模型/真实Home/Keychain操作。任务保持**未修复**，等待根对上述唯一下一观测或具体控制接缝裁定。
