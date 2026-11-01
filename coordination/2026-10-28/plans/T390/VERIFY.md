# T390 最终独立验证

结论：本地有限验证 PASS，RAC-2834～2836 的拒绝副作用、合法同值重新绑定及重开持久化证据成立；没有发现需要独立补跑的真实缺口。最终建议 **full=false**。整套 SI、产品子集的实际 CI、二审和采用仍由根结算，本报告不把本地结果当作 CI 或发布完成。

本线独立读取实际 Git 差异、完整新 case、生产调用链、作者完整 raw，并重新核算逐文件结果、输入差异、资源哈希、当前构建摘要和包解析；未重跑产品测试/构建/变异，未修改源码、作者工作树、Git 引用或 GitHub。

## 准确输入与范围

| 项 | 实核值 |
| --- | --- |
| M / merge-base | `db29f18d4f602fa8d9efb689a6a766aa9b07625f` |
| 最终 H | `b7eee1b15353b74c586da601d45418c403e0ff5f` |
| tree | `de75058066a19fd86eac681efc4119878e9f310c` |
| parent / 初修批输入 P | `e326710a1e13e1d51a7c10f7c165a90446edfff0` |
| 作者树 | `/private/tmp/t390-dev`，实核 tracked/untracked status 为空 |
| 最终源码摘要 | `f81b5ccbbdb3d0fc84042b42be48c64752eda8e22f22c5ab2bacca7cc442c134` |

M→H 恰好五路径：`plugin-terminal-panels.ts`、`project-catalog.test.ts`、现行 terminal slice、SECURITY-INVARIANTS 的 S-103 单行、根批准的 package.json 命令后缀。独立对 JSON 比较确认 package 仅向 `test:security` 原值末尾追加 ` tests/project-catalog.test.ts`；没有其他字段变更、工作流/selector/runner/lock/预算修改。S-103 以替换准确一行还原全文作比对，其他行不变；两条新 case 指针进入 CI 列，原终端安全用例和本地 Goals 指针保留。

核算原件：[independent-audit.json](independent-audit.json)、[current-build-audit.json](current-build-audit.json)；作者 [final-scoped.diff](/private/tmp/t390-evidence/final-scoped.diff)。

## 行为与验收

| 验收 | 结论与实核依据 |
| --- | --- |
| RAC-2834 非法值写前拒绝 | PASS。`aliasSession` 在原 missing、trim、空值检查之后调用原唯一格式谓词，非法格式直接返回 current，位于 now/addAlias/bind/UPDATE 之前；合法同值判断仍位于 alias/bind 之后。无第二份 regex、错误/API/DDL/迁移/身份来源变化。新 case 逐个传前导选项、内部空格、129 字符；返回与数据库 panel 整记录相等，包含 session/updated_at。 |
| RAC-2834 真实 alias 与 binding 后置条件 | PASS。测试从 desktop 公共包打开 catalog，await 真实 catalog.commit 调 owner。stableContext 带 host_declares_stable、无 cwd。业务变更只走公共入口；关闭 catalog 后才打开 readonly SQLite，参数化读准确 runtime/session 键，四个坏值无 alias 行，原 panel alias 保留。公开 resolve 的 project 观察与 alias 查询一起参与独立预期的 deepEqual。 |
| RAC-2835 已有坏绑定保留 | PASS。坏 context 先经公开 bind 绑定 A/owner-a，报告到 B 后不得改绑；即时观察仍 A，闭库无该 alias，重开公开解析仍 A，公开 binding record 的 bound_by 仍 owner-a。未直接读写绑定私表，未用 SQL 构造前置状态。 |
| RAC-2835 合法三步同值 | PASS。真实 B 保存 S→A 报 S→B 报带边缘空白的同 S；中间公开解析与 actor 为 A/owner-a，最终为 B/owner-b。rebound 与保存记录相等，闭库精确 alias 键指 B，重开 session/updated_at、B 绑定及两个原 panel context 仍成立。误把合法同值判断前移会在最终 B 解析处暴露仍留 A；无需额外变异批次。时间戳不变由现行同值 return 分支和完整记录/重开断言共同支持，本轮未另做时间戳变异。 |
| 原错误与 trim / resume | PASS。空白 runtime/session 与 missing panel 保留原错误；最终新 case 的边缘空白合法 S 经 trim。原完整 terminal-launch 13/13 与 Goals-terminal 4/4 覆盖原拒绝和续接行为，没有改这些测试的期望。 |
| RAC-2836 能识别原缺陷 | PASS。未修生产输入 R 的完整 catalog 原件 15/16，唯一失败是四条坏 alias 被写入、三条新 binding 指向 B、已有 A binding 被覆盖为 B；不是返回值、编译或环境造红。原副作用 deepEqual 段与最终 H 逐字相同。 |

公开链实读：desktop `src/project-catalog.ts`→local-host `MolisWorkProjectCatalog.open`→`createCatalogCommit` 的 BEGIN IMMEDIATE / 同步 owner / COMMIT→`PluginTerminalPanels.aliasSession`→`terminalContextBinder`→runtime-context owner。catalog.close 同步关闭持有存储后才读 alias 表，读完关闭再重开 catalog；夹具 finally 删除自己的临时目录。MCP 两个 adapter 仍在真实 commit 内调用同一 alias owner，未新增旁路。

### 初批失败与断言纠正

初修 P 的 catalog 在原副作用 deepEqual 已通过后，唯一失败位于重开 `status === unbound`，实际为 `suggested`。实读未修改的 `modules/private-work-context/src/project-resolution.ts`：找不到当前 binding 后，可从别的 Session 的已确认项目形成非权威历史建议；suggestedResolution 的 project/connection 均 null，resolver 不写绑定。因此无 cwd 并不意味着无历史建议。

最终 diff 只把此处 status 要求改为三条业务后置条件：project 为 null、connection 为 null、公开 binding records 不存在准确 runtime/session 键；此前闭库 alias 无行、已有绑定不被覆盖、原 panel 与返回记录相等全部保留。这是纠正过强状态期待，仍能钉住禁止写入，不是放宽业务拒绝。旧红原件和初修首败均保留。

## 动态证据、绑定与沿用

| 执行输入与原件 | 独立核出的结果 | 解释 |
| --- | --- | --- |
| R=`178a43d1cb4adc1f560d8a3d2c41d515a7fc31d6`；[original-red.log](/private/tmp/t390-evidence/raw/original-red.log) | 完整 catalog 15/16，exit 1，fail 1，skip/cancel/todo 0 | R 对 M 仅新增测试；生产/脚本/依赖一致。原缺陷的真实副作用红。 |
| P=`e326710a…`；[tests.log](/private/tmp/t390-evidence/raw/tests.log) | 66 个唯一完整文件，649/650；仅 catalog fail，exit 1；skip/cancel/todo 0 | 原批次自然结束，所有首败保留。T369 完整文件 2/2。 |
| 最终 H；[final-tests.log](/private/tmp/t390-evidence/raw/final-tests.log) | catalog 16/16，selector 9/9，25/25，exit 0；skip/cancel/todo 0 | 两文件都完整执行，无 case 筛选或自动重试。 |
| P→H 沿用 | 其余 64 完整文件 625/625 | 逐个测试 blob 相同；全仓 P→H 仅 catalog 测试、S-103 指针和测试命令追加，生产/fixture/脚本/依赖/lock 未变。两个受这次增量影响的文件已在 H 重跑。 |

两批实际命令均 jobs1/browser-jobs1/retries0。独立从 raw 的 66 个文件摘要与每文件 tests/pass/fail/cancelled/skipped/todo 汇总交叉校验，不只使用作者 batch-summary。不能描述为“最终 H 一次运行 650/650”，只能说最终 25 项加经输入比对可沿用的 625 项覆盖本地 66 文件集合。

红输入整体构建发生在 `2900b9eef…`，该提交到 R 只有测试修正，生产摘要 `1daeedd8…` 相同；其构建 manifest 早于 R 的实际红执行。P 整体构建摘要 `109a14c9…`，manifest 06:20:05Z，初批于 06:23:19Z 开始、约 452.6 秒后结束。最终 H 提交于 06:31:28Z，整体 build 于 06:31:58Z 开始、manifest 06:32:07Z，最终两文件于 06:34:00Z 执行；修订发生在初批结束后。

最终 H 的源码摘要已由本线调用只读 computeBuildSourceDigest 重新计算并与 manifest 匹配。公共 local-host、desktop、storage、SDK 实际解析均为该作者树 dist，better-sqlite3 为该树依赖。生产摘要不覆盖 tests，测试输入另按每次 raw 记录的提交/blob 与真实 Git 核验。编译后的 plugin-terminal-panels.js 与 CI 追加前留存哈希一致：`f406ea5d60dc2acd3bac81357f89f5dcce348fc80ea4d098a93ab0a704635380`。

## 包要求、门禁与 Full 判断

准确 M/H local-host README 第202行首条命令固定 57 文件全部在 66 文件原始清单中；再加直接五文件（包含 T369）、S-103 三文件、selector 一文件，去重为 66。条件 Home 装配/模型生命周期附加集合不适用于本片 owner 内格式检查顺序变更；其它目录级建议没有形成新的生产调用链缺口，未因文件夹名称匹配扩跑。已核 S-103 的原引用及新 catalog 用例对应覆盖。

作者最终 H 的整体 build、boundary、health --base M、test-imports --check --chains、diff、冻结 M 的 secrets、page-assets 原始命令/输出和 exit0 成立。本线另实查 diff --check；未重复执行已有效门禁。health 无巨大单元例外变化，test-imports 为 0/1710 混用，secrets 仅证明冻结 M 后提交，根推送前仍按现行流程核。

**full=false 的独立判断**：实际只改变一个 owner 方法中格式拒绝的顺序，不改共享核心、装配、DDL/schema/迁移、公开合同或跨包结构；定向公开入口和真实持久化反例直接覆盖行为，T369/原终端链已完整通过。selector 的 `full=[]`、`storage=[]` 是辅助依据；其 `uncovered=[plugin-terminal-panels.ts]` 是静态选择器未找到直接文件引用的局限，由本报告实读的公开 catalog→owner 链与原缺陷红弥补，不能解释为无测试。

package.json 只新增 CI 测试收录，不改执行器或生产语义，因此不额外触发 Full。真实 securityList 重新解析得到 271 文件，catalog 恰好一次；原 selector 输出 SI/product 均 whole、各两片。**整套 SI 的动态要求尚未完成**，应由根在实际 CI 输入上核收；本地安全相关文件不是全套 SI。SI 当前非阻塞且 merge_group 不执行，队列 Verify 不能替代它。未运行 Linux CI，本报告不签 CI 绿。

## 资源、隔离与清理

两份实际生产资源 handler 捕获各覆盖预算表全部 48 路径，返回状态检查为 200，独立比较 bytes/SHA-256 全等，各 7,469,519 B。基线捕获在 R（生产与准确 M 相同、只有测试不同），最终捕获在 H。脚本是调用 createLocalWebAssets().serveWorkbenchAsset 并截获 response writer，**不是 TCP HTTP 请求或浏览器加载验收**；足以支持此无界面改动的资源字节比较，不能扩称视觉/网络路径验收。预算与 APPROVED_CEILINGS 未改。

原件：[M-assets.json](/private/tmp/t390-evidence/M-assets.json)、[final-assets.json](/private/tmp/t390-evidence/final-assets.json)、[capture.mjs](/private/tmp/t390-evidence/capture.mjs)。

实读执行 harness/environment：先用共享系统槽目录获取 build/browser 槽，再进入独立 HOME/CFFIXED_USER_HOME/XDG/TMPDIR/Molis Home；使用 file secrets、adhoc 签名、专用测试浏览器，未通过私有 TMPDIR 拆槽。Foundation Home/Library 与 Node home/tmp 在隔离目录，Foundation NSTemporaryDirectory 仍为系统用户临时目录，此限制保留，不声称所有原生临时文件均隔离。raw 含 SQLite warning、actions.missing 等预期/诊断日志，不签“零错误日志”。

作者 pre-cleanup 记录无任务进程/运行目录文件占用、无 security 防误触日志。本线复核九个声明删除的 runtime 目录均不存在，当前无匹配作者树/证据目录的运行进程；未对历史每个子进程 lifetime 做独立采样。干净作者树及 ignored 匹配产物保留给根采用；本线只新增验证目录报告与只读核算结果，没有清理作者或他人资料。

## 交回根

无本地必补执行项；保留上述证据边界。可据此继续独立二审与正常 CI，核实际 SI whole（包括新 catalog）、产品子集、阻塞 checks 及采用。Full 不需要因本片单独启动；后续 main 变化只核输入增量，不机械重跑本次有效证据。
