# T383 独立只读核验

**当前两次成功 reload 的事件事实可采；历史 Linux 根因仍 UNKNOWN，没有修复候选。RAC-2814 的公共槽要求不合格，不能签完整验收通过。** 本线仅读 WO、作者报告/补丁/raw、两份历史 job、Git 与现存产物，未补跑、构建或操作 GitHub。

直接回读 `/private/tmp/t383-dev` 为 E=`328d5b612ef47214378ecd55e32a648228c120f3`、tree=`80719ba7dc19a4aa7b7b2b09f87229673a539d96`，tracked clean；测试文件逐字等于 E 及 `original-test.ts`。重算 source digest=`c75b962c1bff4d1f6eccdb3e12e3c022e32b2c6e5523b22272f80631d83c11dd`，与复用 build manifest 相符。`diagnostic.diff` 只在本测试增加观测并把原 reloadPage 展开到同一 `navigate(()=>command(Page.reload))` 路径，原4例业务断言及30秒期限保留；新增读命令和同步日志会改变观测负载，不能据此宣称与 Linux 首败调度等价。

亲从374行 `events.jsonl` 按 width 重算：两轮 binding 均为 page target、无 parent 顶层 frame，targetId=frameId；先成功启用 lifecycle/Network，再调用 reload。1440/390 的顶层 session、frame 与 `timeline.json` 一致；新 loader 分别为 `BF6B2C920544E878423AF600F657852C`、`F175EDB834B4C9BA3CB703A903059215`，均不同于旧 loader。两轮原始序号均为 command call/reply #51/#54，Document request/response/finished #55/#56/#99，顶层无parent提交 #58，同session/frame/新loader的DCL #150，post-binding #186。Document链另外逐项核同session/requestId，响应200；post-binding仍同frame/新loader。#4/#5是旧loader启用回放，未误计；子帧事件也未补签顶层。无frameId的DCL #148与navigate返回 #149早于#150，报告准确分开记账，不能改称fixture本身已严格等待新loader。

`test.log`/`test.exit` 支持作者这一次4/4、零fail/skip/cancel/todo、32.105秒、exit0；本线没有新增执行。T377 job124690868164与T116 job124712459625的raw分别确有1440/390首轮3/4、同:113 reload等待失败及随后Runtime.evaluate约15秒超时、整文件retry4/4。旧日志没有命令应答/loader/renderer/dialog现场；本轮Mac成功、相邻actions.missing警告、或两个表象相似都不能补出旧因果。

环境偏差披露真实：`command.txt`隔离TMPDIR却无公共 `MOLIS_WORK_SLOT_DIR`；现行machine-slot实现正以tmpdir生成槽目录，因此安装/浏览器取得私有槽。事前事后公共槽free不证明运行期间无并发，RAC-2814不得补签，也不为修正这项机械复跑。独立HOME/CFFIXED/XDG、file/ad-hoc/safe-browser有命令记录；缺少本轮完整原生路径预检、运行期进程argv原件时，不扩写为全部原生路径/完整进程隔离均已独立证明。当前九个环境目录确已不存在，测试恢复/工作树干净，未见T383存活运行进程；历史全部pid/profile逐项销毁没有独立现场记录，只保作者cleanup归属。公共API未暴露wire send/socket close，继续UNKNOWN。

报告总体未越界，保留以下限定即可：当前无dialog/detach/crash事件只限已订阅观察窗；诊断未见显式Target discovery/Inspector启用确认，不能把事件缺席升级为renderer从未崩溃。`pre-reload-state`在顶层误查iframe内Pages节点，`unsaved:null/saveStatus:other`无有效状态归属；更不能据它排除顶层beforeunload。源码真正读取的是宿主presentation root的 `data-assistant-context.unsaved`。

按协调 README §9第3条，两次跨分支同文件首败已满足加急条件：保持T383未修复和相关采用待结算，不做第三次同输入概率重跑，不重开16片Full碰运气，也不把retry或本轮4/4记成首轮全绿。在根批准下一次**有新增观测的Linux诊断**前，没有产品修复依据。

建议唯一最小下一入口：在根安排的准确头 Linux 临时检出、matching build与专用profile上，仍以 `node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/pages-actions.e2e.test.ts` 一次完整4例取证。只携带该测试本地trace：保本次public command应答、顶层frame/新loader/Document/DCL、失败后仍可落盘的事件；把预读改成宿主对应Pages frame的实际presentation root（先记root存在与frame身份）及插件iframe内已保存状态分别读取，正文不入日志。保存实际Browser.getVersion、OS/Node/checkout/tree/build和启动参数；若使用本机槽先从未改TMPDIR的宿主计算公共目录再显式传入，Linux CI则记录runner/workflow并发归属，不硬套Mac路径。crash事件若要用于排除假设，须先核相关domain/target订阅成立；未知项照旧保留。无超时则交一次原件停止；若失败，按命令是否应答、Document/新loader/DCL和renderer可用性确定下一责任层。共享fixture、test-kit、产品及保护PR均继续不交写。本建议未执行，不触发CI，也不预签修复或Full采用。

根补线索后的静态核对：原文件第一例 PAGESCTX-05 在 child“已保存”后，确实另等父 `[data-work-surface="pages"]` 的同一object.id、`!unsaved`、无`draft_text`，再检查保存版本增长；两宽度例则只等 child saved、读owner正文后立即reload。`plugins/native/pages/src/browser/context.ts` 发布child context；`child.ts:110–111` 的MutationObserver经MessagePort发送，`parent.ts:174`才更新宿主root；`presentation.ts:25–30`的beforeunload读的正是父root。故child/owner已存不能推导父context已清，存在尚未等待的异步边界。**这是可验证的静态同步缺口，尚未证明旧Linux失败时实际命中此交错或触发dialog。** 本次trace在reload前新增多个await，可能让父消息追上；无效probe和本机4/4都不能排除它。

可交根裁定的最小测试同步候选，优先于猜产品修复：只在两宽度例reload前，以现有顶层 `browser.waitFor` 等实际父Pages root，要求context的object.id等本次owner读回页id、object.version等已保存owner版本、`unsaved`非真且无`draft_text`，同时保现有child正文/已保存和owner正文断言。root/context缺失必须继续等或失败，不能用空值充当clean，不加sleep、不清dirty、不自动接受dialog。它把“等待可安全离开的保存完成状态”写成明确条件；不能称已修复历史超时。需先在同一WO更新为测试同步范围后由writer实施，本线没有改代码。

该候选若获根采用，下一次Linux仍只跑上述一个完整文件：在原child-saved/owner-read切点记录正确父context的存在/id/version/unsaved/draft字段是否存在（不记正文），再记录父clean谓词首次满足与reload调用；核满足发生在reload之前，随后同顶层新loader完成与全部原断言。若采到“child saved而父仍unsaved”，才得到该次真实交错反证；若没采到，只签新路径已等待真实父状态，历史因果继续UNKNOWN，不补造旧红、不概率重复。后续发生超时则保首败并依事件定位，不据这项同步改进擅自修改产品/共享fixture或签Full通过。
