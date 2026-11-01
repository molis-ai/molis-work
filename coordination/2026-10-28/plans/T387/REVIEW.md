# T299 / T345 / T373 承载方案独立审阅

结论：**支持三片普通feature合载；未发现当前必须拆批、手修或增加本地业务测试的理由。** 将三份核心完整文件留给最终承载Full、沿用已核收旧证据的方案足够，但以实际合成保持原补丁及下列最终证据成立为条件。无文本冲突不单独构成行为通过。本轮无实施授权、新编号或READY结论。

只读核了PLAN、三准确H的实际差分、T345/T373 accepted任务与同步审验/证据映射、必要调用链，以及M0→指定M=`6729a2d4655caa603daa369f99884e09c4726bde`的路径差集；未重审三个原单。未重做六顺序merge-tree，不把PLAN预测tree当本线执行证据。未build/test、写GH/refs/索引/作者树；只写本报告。

**真实边界核对。** T299相对M0仅移动同一JSDoc，运行代码无变；T345七路径与T373两路径相互无交集。Feed以registration的双实例装配、Home数据库事务和evidenceCollector实现正文hold/reclaim/release；身份仍由plugin audience、calling_plugin_id及project_id判定，动作是plugin-only command。聚合器以当前open project、本人context、query_only和home_aggregate/output_type筛选查询，T373仅在第二阶段普通失败时按顺序补回catalogIssue；父取消先抛同reason、closing仍静默。它没有调用Feed的正文回收command，Feed删除也不依赖聚合issue拼接。两者共享Host/Runtime不构成新事务或副作用调用边；无需注入“ledger失败传到aggregate”的虚构组合场景。

T373的直接生产消费者homeBackgroundTasks确实把issues交给同一project/source键的repeatingFailure；返回两条issue不保证两行日志。本片不能用合载顺手改日志策略。Feed source-history仍逐批reclaim、末批release再forget，服务间已有提交不被后续失败回滚；FI-C-06/07的失败保引用、有限重试与重启恢复不因删完整标记而注销。M0→M的34路径与本批10路径无交集；所读变更是T208/T381/T382/T383范围，未见改变两业务链的直接输入。该判断不扩大为全Host所有依赖不变。

**证据抵扣成立。** T345旧63/63及原M/T336的runtime54/54、T373旧独立7/7和closing负控、作者旧矩阵、T299文本/35文件等按各自准确头与执行者保留；同步报告及同blob/patch/产物映射可以证明沿用范围，没有理由只因更换承载名重新本机执行它们。旧负控不重新运行，也不改署为最终组合证明。当前最小新增动态结果是最终H下完整`feed-content-ledger.test.ts`、`feed-runtime-plugin.test.ts`、`home-aggregate.test.ts`；一次新Full可承担，无须在本机提前重复一轮。若实际合成或新main改了相关源码、fixtures、contracts/SDK/storage或调用入口，就先解释具体差集再选择受影响完整文件，不能继续用“同blob”概括不同输入。

**最终最低证明仍是门槛：**

- 作者/CI对同一实际合成H有匹配整体build、必要boundary/merge-base health/test-import/diff/secrets与实际served结果；独立增量核读实际10路径、各片自有blob/补丁、M的T381/T383等保留及构建绑定。不要求独立审阅再运行同一批工程命令，但不能只交静态预测。
- 最终普通PR的Verify、适用SI及新Full按原full=true规则结算。Full必须保event H和真实checkout merge parents/tree，确认三核心文件**完整执行**、各自case通过/失败/skip/retry，而非只见aggregate绿。它们当前文件没有显式Darwin skip，但最终以真实运行及fixture/平台行为为准；缺文件、未执行、取消或关键case skip不算通过，内部重试成功仍保首败。无需固定沿用旧case数量来证明完成。
- 资源以最终M和最终组合实测逐项零delta为目标；当前M预算7469195B不是新组合实测，不能沿用旧7469175B。无理由新建资源许可；出现真实增长或新asset先定位输入/装配差异，不把它塞进既有资源窗放行。构建/served操作照公共槽串行，不抢T384/T146窗口。

**旧v1 Home与延期边界。** T345只适用于按当前DDL新建的干净Home；相同version=1不证明旧库结构或旧正文引用账已经符合。代码合入与真实旧Home部署/清理是两件待分别核实的结果：本承载不启动真实Home、不删除旧表/引用、不做迁移/重建/回填；未来真实Home处置保留待办，不以新Full绿关闭。这个已接受前提不要求现在新增兼容机制或重开产品选择。T373仍只关闭两阶段code-only结果缺口，不关闭R-63整体、日志表现或真实Home验收。T299正式full=true保留，不能回退到原预计false。历史Full首败、T381/T383的Linux因果UNKNOWN、原生TMP及Corepack等已披露限制均保持原来源；M采用了测试修复不重写历史终态。

**采用顺序可行。** 三片无必须等T384/T385代码的直接边；根可按容量排其普通承载。正式执行前先给唯一合同/10路径与writer，fresh冻结已采用M，正常merge三准确H，出现必须手修就回根缩定，不能带着“无新手修”预设覆盖冲突。若T384/T385先采用，针对其实际新M重核Feed数据库/Runtime、聚合端口及资源账；对未变旧证据无需机械重跑。最终H工程/独立增量审验后再推PR，Verify/所需SI/一次新Full按README §9排程，不建integration镜像或取消在跑Full。实际main采用回读和逐成员10路径/补丁映射成立后才关闭原三PR，标“由承载采用”，不称原PR自身merged；未解释差异与真实Home/延期项继续保留。

当前计划无需新增业务矩阵。根可将上述证明及边界直接带入正式执行合同；本书审不授予实施、推送、资源或CI控制权限。

## T387拟派单补核

已回读同一PLAN，范围与此前审阅一致；`/tmp/small-three-carrier`和`/private/tmp/small-three-carrier`为同一目录，复用上述独立结论，不重复原三单审验。拟T387按甲档/full=true、无一审处理合理：包含Feed Home v1 DDL/正文回收与Host聚合改动，且三原任务的正式Full义务均须保留；T299原丙档不单独增设源码一审。按根最新分工，拟作者为开发线1、验证线3、二审线5，根负责GH/Full/采用；最终任务书须落实该身份。当前无证据要求额外本地动态；三核心完整文件须在最终准确组合Full真实执行，旧三个头的Full/动态均不能抵扣或改署为本组合运行。零资源增长是最终实测要求，不是预测许可；新干净v1 Home、T373不闭R63及历史UNKNOWN等边界照上文保留。T387仍为拟号/待正式授权，T386的二审owner继续保留、仍WAIT T384实际采用。

## 0404锁快照的增量核对

已读根`/tmp/root-open-0404.json`，并只读准确Git对象：T384 #1712 H=`4404e142662cbd7895f46c1c6df6e5efe5e6e135`、T116 #1679 H=`7977190e1889b8583310db2423788e88aff6be1d`、T121 #1677 H=`c2502b62dc2af4cb090ce740f12d394646e7bdeb`。这确实是**三个共享文件的现存锁交集**，不能因不同worktree或hunk分离自动视为已释放。原PLAN没有声称无全局锁，故此为实施窗口补充，不是重判合载设计缺陷。

- `immersive-shell.ts`：T299在M0第91～99/105附近移动同一rail JSDoc；T116在第299附近删除三个已迁走的Goals渲染函数。T384与T116该文件同blob=`cc51709da...`，此处是同一原片经承载保留，不是两份不同修复。两组hunk不相交、无运行调用联系；根已确认T384候选冻结CI且无writer，可以明确只交T299注释hunk给T387，禁止复活被T116删除的函数或整文件取T299旧blob。若T384先采用，新M的最终文件自然不会等于T299旧H全blob，应以注释hunk等价、非注释代码保新M解释差异；不能为满足“原blob相同”覆盖新main。
- FI slice：T345只改第270行的4d台账说明及FI-C-06/07（534～535）取消完整标记等待；T121改账号槽位段（447/469附近）及末尾FI7b完成记录（595附近）。具体hunk分离，T345不会代做或注销T121账号绑定、旧账号维护窗口/未支持连接器/孤儿绑定等边界。根可只交上述T345三处文书hunk；T121原PR及其内容保持只读，不全文件取旧版本。
- `feed-runtime-plugin.test.ts`：T345改ledgerStandIn的mark/unmark接口、FI-C-06旧未完整分支及FI-C-07启动补hold用例（45/68/76/160、423～448、1322附近）；T121改DELETE权限常量（302附近）、新增RAC2665/2664/2668账号用例（712附近）、账号释放权限断言（774附近）。没有直接行级冲突，但**共享测试运行前提相关**：T121生产plugin将delete也接入releaseRuntimeAccount，要求connections:use，并改update@2/账号来源合同；不能把它仅当独立新增case。当前T387基于M6729不带T121，原三核心文件留最终Full仍足够，无需因锁额外本机跑；若T121先采用，重绑M后必须保其DELETE权限与新增case，同时保T345账本/恢复改动，在匹配新构建的最终Full中执行完整合成文件，旧54/63证据只保原范围。

**可交接条件：** 根在正式WO写出以上三文件、准确非成员H、T387仅有自有hunk的窗口；确认/安排这些文件在窗口内无其他writer，完成后交还。T384的冻结事实不自动覆盖T121，根还须明确T121这两文件的暂停/交接状态；不同段也不允许并写。T387只在自己的隔离树正常合三个成员H，不合T121/T384候选、不写原PR树或其refs，不顺带修它们。若非成员head/main前进或共享文件重新开写，先回根刷新窗口/差集，不拿本快照永久放行。

采用可由根择序：T387先落则后继T384/T121正常合新main时分别保注释移动与Feed账本hunk，并核真实共享差集；非成员先落则T387重新冻结M并保已采用行为。任何实际冲突或必须手修先回根更新范围，不默认“无手修”。以上锁交接落实后，原三片方案和旧证据抵扣判断仍成立；没有据此新增组合矩阵或提前签行为/资源/Full。

已窄核新`T-387.md`身份行：作者开发线1、验证线3、二审线5、甲档无一审/full=true，与根最新分工一致；其共享hunk窗口仍明确待根核定、未自动解锁。此处仅核身份与等待边界，不把分工更正当作产品风险。
