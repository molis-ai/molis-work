# T383 独立二审

结论：**收下本轮有界诊断的限定证据，T383 不能签全部验收通过；没有修复候选，历史 Linux 因果继续 UNKNOWN。** 不为补齐公共槽而机械重跑 Mac。后续普通 Full 按协调 README §9 的候选、Verify 和容量要求继续排；重复首败须保留为专门待定位事项，不能被这次 4/4 抹去。

本次只读唯一 WO、作者 REPORT、diagnostic.diff、原测试/诊断测试、全部 raw 事件、test.log/exit、binding、slot-audit 和 cleanup，并读取当前恢复后的工作树及相关执行入口；未跑测试、构建、CI 或写 GitHub。验证线3的独立结论另计。

## 可收的证据

- E=`328d5b612ef47214378ecd55e32a648228c120f3`、tree=`80719ba7dc19a4aa7b7b2b09f87229673a539d96` 与当前 `/private/tmp/t383-dev` 一致；工作树干净，留存 original-test 与 E 的测试逐字相同。诊断差分只有 Pages 测试本地观测、等价 reload 调用替换，原4例输入、操作、断言和30秒期限保留；共享 fixture、test-kit、产品未改。构建复用的 digest 绑定有作者记录，不冒作本二审重新构建或重算全部生产摘要。
- raw test.log 和 exit 支持这一次**带观测的 macOS 完整文件**4/4、32.105秒，零失败/skip/cancel/retry；支持本轮恢复、命名、冲突保存等后续断言通过。它不是最终无诊断候选的验证，也不是 Linux 结论。
- 独立从374行 raw 按 width 重建：各187条、序号连续；两次均 #51 调用、#54 命令应答、#55准确顶层新 loader Document请求、#56 HTTP200、#58无parent的同顶层frame提交、#99该请求完成、#150同顶层session/frame/新loader的DCL。#149 navigate已返回，#186后读frameTree同新loader。启用时回放的旧loader #4/#5未计入；iframe事件未补签顶层。没有当前reload超时或session换代事实。
- 原件保留、诊断撤下成立：当前测试与E一致；cleanup列的九个环境目录现已不存在，raw及diff仍在。自然teardown与“未干预进程”按作者执行记录收取，不将事后空目录当作完整进程生命周期审计。

## 必须保留的缺口

1. **公共槽不合格且无法事后补证。** command.txt有独立TMPDIR、没有MOLIS_WORK_SLOT_DIR；machine-slot实现确实默认用`tmpdir()/molis-work-slots`。前后free和事后ps不能证明期间无并发。本轮事件是真实观测，不因此作废，但RAC-2814的公共环境约束不能通过，也不能声称已排除负载因素。
2. **保存状态探针归属错误。** 顶层查询插件文档里的`[data-pages=workbench]`返回null/other，不能说明父页面beforeunload所读root的unsaved值。原iframe“已保存”及owner store读回成立；父root context同步是否及时仍未知。此次观测在reload前新增若干协议往返（到实际命令调用约20.9/4.9ms）和同步日志，因此“被动”不等于零时序扰动，不能据未复现排除短时竞争。
3. **失败时的定位能力仍不完整。** trace把命令错误只记为`Error`，无法区分协议拒绝、CDP timeout、connection closed；失败支路也没有独立browser-plane健康读数。Target/Inspector监听存在不等于所有crash域已具备可观测条件，故只能说窗口内未收到这些事件，不能签“没有crash”。当前成功后的getFrameTree和业务操作能证明本次renderer可用，不能反推旧失败时状态。Network请求关联集只用requestId，后续补丁应以eventSession+requestId关联，避免跨session误配。发生换代时只有attached/detached记录，尚无新session重绑证据，届时继续明确UNKNOWN。
4. 两个历史Linux Full仍各有一次Pages首轮3/4及内部重试4/4；旧失败缺命令应答/准确loader/renderer分时证据，Chrome具体版本未核到。本轮无权补签这些历史事实。RAC-2813仅当前可见链路核收；RAC-2814部分满足、公共槽失败；RAC-2815原件/撤回/清理可收，根因未关闭。

## 有限的下一处置

根补充的同步链已独立核实，足以确认一个**测试前置条件缺口**：`pages-actions.e2e.test.ts`的PAGESCTX-05在子文档显示已保存后，还等待父`[data-work-surface="pages"]`的同object.id、`!unsaved`、无draft_text；两宽度例没有这步。Pages `document.ts`保存后publishContext只更新子文档属性；`child.ts:110-111`经MutationObserver/MessagePort发送，`parent.ts:174`收context后才更新父root。`presentation.ts:25-30`的真实beforeunload判断读取后者。因此child saved+owner持久化不蕴含父root已清unsaved，当前测试没有建立“可安全reload”的跨文档同步条件。**可证明缺少同步，不等于已观测这次窗口发生，更不等于历史30秒超时已归因。**

建议根下一次先授权一个局部、确定性的合同验证，优先于寻找Linux概率复现：仍只在Pages测试本地使用既有`pluginFrameInitScript`，在真实Pages child的MessagePort发送处暂扣**同一文档保存后清unsaved的真实context消息**（不伪造值、不改产品/fixture；其他消息原样转发，同类重复context也暂扣，避免越过屏障）。先让真实unsaved context到父root并确认，再启用上述暂扣；等原child saved与owner读回均成立，断言父同id仍unsaved，直接证明原两宽度前置条件此时会放行。然后按原顺序原样放行暂扣消息，等待父同id、owner当前version、!unsaved且无draft_text，证明新增等待在放行前不满足、放行后满足；不靠sleep或增加timeout。可在两端分别向顶层dispatch可取消的合成beforeunload，断言真实监听器在前者preventDefault、后者不preventDefault，作为守卫因果的局部证据；**合成事件不证明原生dialog或Page.reload超时**。所有hook按原引用恢复，队列只释放一次、失败也清理；这属于新交错验证范围，须先更新WO，不能冒作本次只读二审已执行。

若该验证成立，最小测试候选是在两宽度reload前等待准确父root的同id/当前保存version/清unsaved和draft_text，再沿原reload路径执行。它解决已证同步合同缺口，无需先解释Linux全部症状；按新准确H验证完整4例和定向交错，公共槽正确后可交工程候选。不得称“已修历史Linux超时”。如验证不成立，回收假设；不加无根据等待。下述Linux方案仅用于进一步解释历史首败，不成为这个已证测试缺口修复的无限前置门。

README §9要求先归因，不把承载分支重复失败直接当底噪；同一无关文件第二次红不再机械第三次重跑。此处还应区分**用例首败/内部重试通过**与**Full最终红**，按各自原终态结算。T383已完成一次有界取证但没有修复，不能拿它满足“红文件修好后再推”的条件；受该红项阻塞的原承载批仍由根按§9裁定。该条也不意味着所有无关新候选、全部新Full无限等待UNKNOWN：满足正常门槛和runner预算的其他候选可以继续，报告携带本风险，不能宣称Pages已修好；若再遇本项失败，保首败原件，停止为拿绿重复触发同作业/整份Full，回此诊断owner处理。

若根选择Linux观测，只给**一个Linux worker、一个准确候选、一次完整Pages文件**的取证预算，目的为获得故障平台的真实分时证据；不是修复验收。最小入口是已有授权且可执行shell的隔离Linux工作目录，采用与历史Full一致的Node 24.14.0、锁定pnpm/依赖、匹配构建，以及其现成Chrome `--no-sandbox`启动方式；记录实际OS/Chrome版本，不能假装历史版本已复原。原E或根指定等价新E须先冻结head/tree及相关差分。仅在该目录Pages测试本地应用可重放临时patch，先修正上述错误分类、父root状态归属和session请求关联，不改CI、fixture或#1101。

在隔离TMPDIR之前确定宿主公共槽目录，显式传MOLIS_WORK_SLOT_DIR；与该Linux宿主其他任务共用，记录取得/释放时间。CI=true默认不拿机器槽，若在共享worker需显式启用或由外层持槽；真正独占worker则留独占分配证据。唯一执行入口为：

```sh
node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/pages-actions.e2e.test.ts
```

验收是一次完整4例自然运行、0 retry/skip、保全部首轮raw/exit/事件/绑定/清理（失败也交付，**不要求必须复现或必须绿**）。reload前父root只读少量状态并证实命中；错误保留脱敏的method、timeout/closed/protocol类别与可用cause，不能记录表达式正文或凭据。若失败，保持原超时和错误，最多一次有界browser-plane健康读数用于区分连接与renderer，既有事件先落盘；不自动处理dialog、不延时补绿。若复现，仅提出由事件支持的最小修复点再更新WO；若未复现，停止本轮，不追加Mac/Linux概率矩阵，UNKNOWN作为有owner的未关闭风险带入正常回归，之后只在自然失败或新机制证据出现时重开。

**入口限制：** 当前`full-suite.yml`的workflow_dispatch无单文件输入，直接启动会跑16片且retries=1；现有Linux probe排除浏览器文件，product-subset也未收此Pages e2e。因此不能把这三个现有入口冒充上述单文件诊断。若根没有现成Linux shell执行面，先明确取得该执行面；不为此偷偷改workflow、改用例清单或触发Full。后续把观测附到本来需要的Linux Full属于另一个明确范围决定，不能算本建议的一次单文件执行。
