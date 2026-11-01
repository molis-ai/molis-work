# T389 · 一轮 H/M 有限诊断

状态：**H/M 各一次完整文件均2/2通过，未复现390px Hidden custom_rss；历史CI根因仍UNKNOWN，没有修复候选。** 依照accepted WO停止本轮，不新增第三次执行、产品改法、提交、推送、GH或CI操作。原始失败未撤销，T384兄弟输入不作M基线。

## 准确输入、构建与解析

| 输入 | head / tree | matching生产摘要 |
| --- | --- | --- |
| H | `44efe84d925b7f01e6f8f837c0bf284471ae7659` / `908622b69189edcfed007efb26290d57a1c148c7` | `f115740ff71b5f074c6ec6b9a70fcffb53b322db4c04dd3f7fad5da40856d2db` |
| M | `6729a2d4655caa603daa369f99884e09c4726bde` / `5df7692e7cf4affb0ca1942e8c1cf9ee29497066` | `ed2596f14b20160c8be9477f4172e7269cf2752399a30f2f0713eaaeb1d0a872` |

隔离detached树为 `/private/tmp/t389-dev/H`、`/private/tmp/t389-dev/M`。H构建从冻结 `/private/tmp/t385-dev` 的准确同H复制；M构建从 `/private/tmp/t388-dev` 的 `45abd242013a428d79e750503159ee580fa33ba7` 复制，**该树不冒称M整树**：Git差分仅 `tests/workbench-stop-feedback.e2e.test.ts`，不在本旅程或生产构建输入中。两边在公共build槽完成 frozen/offline安装，lock字节与来源一致；复制前后各自独立重算源码摘要，均等于manifest。每边11287份dist文件逐字汇总与来源相等，依赖与实际解析在新树本地，不借用来源树模块。未运行整体或局部生产构建。

`prepare-result.json`给来源head、manifest及源码重算、public local-host/desktop/workbench/test-kit browser/Feed/storage六个真实解析入口，均为本次树自己的dist。`input-binding.json`给依赖输入、测试和全部直接helper路径及SHA、dist字节核对；两边原旅程测试SHA相同 `348cc75954f021cb4183e0c645224b746148e612b63c460cfafe90a5af3c8d29`。H/M在旅程、goal-browser、Feed与相关工作台客户端无diff；H的十路径差分仍是storage/Home-store及其文档/测试/owner。不能据这个差分范围或本轮通过排除其间接影响。

## 原CI与本地结果分别保留

T385 Full41271185187 shard11/job124744120267，完整原件复制为 `T385-full-original.log`。492行明确CI检出 `6cceb92f4cd5101b3400819c4170d8f6ab1826c0`，是H合入准确M的测试merge输入；本地Git确认M为H祖先，但该CI merge对象未在本机对象库，未声称实测了其tree。CI运行在Linux，本轮为Mac，不能称相同环境重放。首轮与内部retry均1440通过、390在原test60的native click helper报Hidden custom_rss；首轮约32.69/22.38秒，retry约33.03/22.53秒，原失败保持有效。旧log没有失败选择器现场图，最后截图属于goal-recorded；不能用它当picker失败图。T384同文件2/2仅按WO的兄弟输入记录，本轮未跑T384、未用它核抵M。

| 本轮完整文件 | 1440 | 390 | 文件结果 |
| --- | ---: | ---: | --- |
| H | 11.048秒通过 | 9.854秒通过 | 2pass/0fail/skip/cancel/todo，23.202秒，exit0 |
| M | 9.284秒通过 | 8.650秒通过 | 2pass/0fail/skip/cancel/todo，20.222秒，exit0 |

原命令是 `node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/project-user-journey.e2e.test.ts`，各一次完整文件，无case筛选/重试/第三棵树。全部原native click、helper、断言、超时保持；8张原旅程截图保存在 `screenshots/H`、`screenshots/M`。本轮无失败，故没有制造失败截图。

## 观测事实与局限

临时观测仅写本测试文件；原 `plugin('feed') → click(add-toggle) → click(custom_rss)` 三个await逐字连续，关键窗口没有插CDP/await/等待/落盘或重采样。关键前一次evaluate安装事件与MutationObserver，在原custom_rss调用成功/失败后finally读出并移除。页面内使用WeakMap引用编号，不写节点属性、不改函数或业务状态；不读正文/输入/URL查询串。仅记录允许的panePlugin/workbenchPane元数据。同源doc可访问才观察，1次iframe-unavailable按UNKNOWN保留。几何/computed style只在初始与终态采样；mutation回调不取布局、不遍历全DOM，只检查目标/祖先与有界新增iframe，缓冲上限500。浏览器exception事件在同窗口内只保generic text/line，不留正文。

下表为页面记录器起点起的毫秒，**仅说明本轮**：

| 输入/宽度 | 可信add点击 | dialog hidden去除的mutation回调 | 可信custom_rss点击 | 缓冲/丢弃 |
| --- | ---: | ---: | ---: | ---: |
| H1440 | 108.9 | 115.8 | 208.2 | 500/5 |
| H390 | 126.3 | 134.2 | 516.4 | 500/6 |
| M1440 | 93.0 | 99.6 | 192.3 | 500/5 |
| M390 | 129.4 | 137.4 | 211.5 | 500/6 |

四条路径都在顶层document中匹配唯一Feed root、dialog、choices、custom_rss、rail add；root编号8、dialog16、custom_rss20、add21在各自记录中保持同一引用。初始处于Goals，Feed root及其pool祖先hidden；plugin选择后同一Feed root移到pane，后续添加点击真实命中初始rail按钮引用21；custom_rss可信点击命中初始引用20，事件时连接有效、非disabled，祖先链没有hidden/inert。终态选中Feed plugin tab，mobileView=document、feedView=add、selectedSource=all，dialog无aria-busy/hidden，display:block/visibility:visible。390 dialog rect为(0,104,390,416)，1440为(374,32,1052,792)。custom_rss选择后choices祖先17隐藏，是原调用成功之后进入setup的终态，不能解释为原CI点击前失败状态。

可访问的其余document没有Feed匹配；frame元数据没有panePlugin/workbenchPane。这个记录支持本轮操作属于顶层单一Feed实例，不能据初始一次iframe-unavailable断言所有时刻/所有不可访问帧都没有其它副本。原始 `H-1440.json/H-390.json/M-1440.json/M-390.json` 含完整初始/终态最小几何、身份/ancestor链、事件与错误；`observation-summary.json`按初始引用匹配点击提取，四条浏览器错误均为空。

原60的custom_rss helper成功返回后，立即进入finally：先同步移除Node侧exception listener，然后**第一次新增CDP往返**读取 `window.__t389.stop()`；stop先完成终态快照、断开所有页面observer/listener，再返回数据，随后才writeFile落盘，之后才继续原61的fill。没有在原59/60之间导出。四次stop快照完成相对时间分别为260.6/565.5/240.1/250.3ms；磁盘写入的准确时刻没有另行打点。

截断审计见 `truncation-audit.json`：四次custom_rss可信click位于第312/313/312/313条，均完整保留target及祖先引用链，之后仍保留188/187/188/187条事件。第500条均为target211的childList，接收时刻分别257.1/564.1/236.3/249.1ms；被丢的是这之后的5/6/5/6次record调用。**丢弃分支只计数，没有保存kind、目标、attribute、值或时间，因此无法说清具体哪项状态变化被截断，也不能声称只是无关mutation。** 原始终态快照独立于事件缓冲，匹配数、引用身份、hidden/inert祖先及终态geometry仍完整；这支持本轮点击命中初始唯一按钮、点击当时祖先链无hidden/inert的判别，但不能恢复缓冲尾部每个中间状态、所有setter顺序或旧CI失败的身份/祖先。当前原件保留这一观测不足，不修改记录器后再跑。

**观测扰动与缺口：** 每条记录500项，末尾分别丢弃5/6/5/6项；三个可信click已在保留缓冲中，原始终态快照另存，不意味着尾部mutation完整。事件捕获与MutationObserver虽不等待，仍增加同步CPU/分配；初始布局采样也可能提前刷新样式，observer可能改变调度。没有未观测对照轮，不能量化或排除掩盖。mutation时间是回调读取时刻，value可能合并多次同步更新，不能当作setter精确时刻或据此指认showFeedSetup/setFeedTask调用者。内部函数未新增hook，其命中/早退顺序UNKNOWN。没有因截断或未复现增跑。

## 支持、排除和唯一下一决定

当前原件支持：本轮两输入、两宽度都走通唯一顶层Feed实例的add/choose与之后完整旅程。当前可观察窗口没有“错选另一份隐藏节点”“dialog未打开”“custom点击时hidden/inert祖先”这些失败状态；这只排除它们作为**本次四条成功路径的表现**，没有排除旧CI的同名假设。当前数据不支持把旧失败定为storage回归、CSS故障、丢消息或测试同步问题，也不支持用本轮通过宣称原CI已修复/环境问题。H/M均过不能说明H相对M无回归；历史原因保持UNKNOWN。

唯一必要下一决定交根：若仍需关闭该UNKNOWN，在下一次本来已计划的Linux同文件运行中收实际首败现场（先在同WO确认观测预算/减少无关mutation尾部丢弃）；不凭本轮绿色选择产品或helper修法。本阶段不自行启动该运行或修改生产。

## 隔离、公共槽与清理

Node24.14.0/ABI137、Darwin arm64、专用Chrome for Testing153.0.8010.12；测试wrapper为molis-test-browser且带mock-keychain/password-store=basic，file backend/ad-hoc、无真实模型或Home4207/凭据读取。系统HOME/CFFIXED/XDG与Node TMPDIR在本任务runtime目录，fixture创建独立Home/profile。Foundation自身临时目录解释未另行测量，不能承诺所有原生辅助tmp都受Node TMPDIR控制。

公共槽在改TMPDIR前解析宿主os.tmpdir，固定 `MOLIS_WORK_SLOT_DIR=/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-slots`。prepare-result.json保存public build holder，test-H/M-result.json保存各自public browser holder在完整子进程运行前后同一pid/since与起止时间，日志首行给真实命令/隔离环境。不是以事前事后free替代期间持槽。两边正常/失败finally都会断开监听；本轮正常fixture teardown清理了Host、Chrome和临时Home/profile，无按名称停进程。清理前无fixtureHome/本次browser-test进程，九个runtime目录已按准确路径删除，public槽最终free；两树临时测试逐字还原、Git干净停在准确H/M，证据与matching构建留存，见cleanup.json。

RAC-2831：输入、生产摘要/依赖/实际解析及隔离槽证据已交。RAC-2832：H/M各一完整文件、原关键调用序列与被动观测已交；截断/扰动如实保留，不声称旧失败已复现。RAC-2833：结论UNKNOWN与单一后续决定交根，诊断阶段停止；独立核验按本原件复核，不要求重复H/M。
