# T386 独立核验（最终 H 增量已核）

## 最终判定：cb931d65

**最终 H=`cb931d6537276952d716b6ca3c3b2b225b222406`、tree=`5ae2b068ba17fd44a23d9927e9d2b858aa40dfec` 的四项配套、构建绑定、资源连续性与清理已核；无产品/配套代码必修，沿用有效三 e2e 10/10 和 A/B。发现一项最终门禁测试槽位执行偏差，见下，不能宣称全程符合测试槽规则。** Full 仍待 T389 采用后由根接准确组合，CI/SI/Full/实际采用不在本线已完成范围。

本轮按根指令只做只读增量核验和本报告更新，无 GH、构建、测试、源码改写或服务启动；下面“首批原件”章节保留原 f204 阶段的结论与历史待办，不表示最终配套仍未落。最终结论以本节为准。

### 四配套路径与准确许可

实际 Git 读取：最终 H 的 parent 为已验行为 H `f204d1b065470a538b90857a7de1f543de424579`，作者树 clean。f204→最终 H 恰为 `apps/workbench/README.md`、`docs/system/SECURITY-INVARIANTS.md`、`scripts/gates/page-assets.mjs`、`tooling/gates/page-assets.json` 四路径，+10/−7；六行为文件逐 blob 均不变，生产 src、Manifest、依赖与三个测试的输入未改。

本线从 Git 重新比较文案：README 仅新增已审不变量；安全表除 S-30 行外全文相等，S-103 和 T143/T148 既有内容未覆盖。新增内容与 `/private/tmp/t379-evidence/shared-docs-candidate.patch` 的两条新增行完全对应。S-30 原行只插入搜索来源/可见性拒绝说明及 Issue 测试引用，没有替换原工具键或讨论路径合同。

已读协调 T-386.md 的“根最终资源与配套窗口（2026-11-01 06:31Z）”，根明确接受无 slack 两 tuple。实际 gate diff 只改 `APPROVED_CEILINGS` 块：删除已消费 T362 的 workbench `[1150291,1150615]`，改为 `[1150615,1151174]`，新增 plugin-frame `[190838,191017]`；该块之外脚本逐字相同。预算只有这两个实测数字变化，无新资源，无算法/阈值/其他许可变动，未借 T389 未采用补丁抵销。

### 最终构建、资源与原证据承接

最终整体 build 原件 exit0，发生在 f204 HEAD 加三个 dirty 配套文件阶段，随后官方 budget update，再提交最终 H；不把 dirty 构建原件称为当时已提交最终 H。最终 clean checks-binding 和 checks-build 绑定 cb931/tree5ae2，实际依赖解析在本树 dist。本线再次只读计算 source digest=`2879e4f9ab3a644fb7921f4bafdc1ec039f249d8a4581b092285dcb6f1d59210`，等于现行 manifest 和最终绑定。digest 改变来自纳入输入的 page-assets gate 脚本，不能沿用旧 a8f61 摘要声称同一源。

逐项独立比较 final/candidate/base 的原始 JSON：最终 48 项 bytes/hash 与 f204 行为产物全部相同；官方 gate bytes 与外置 hash 探针一致、discoveryMisses=[]；最终提交预算逐项等于实测。M→最终仍只有 +179/+559，46 项不变，总计 7470257 B。读过最终 hash 探针对最终生产 gate 的差分，仍只是同 response body 加 hash 记录，未换测量路径。资源证据为真实 Host serving 代码生成的 response body，不扩大为网络层全资源验收。

故三完整 e2e 10/10、A/B 在 f204 的实际执行可沿用到此次仅配套最终 H；执行者与 executed_head 保持原来源，未重跑，未改署为 cb931 新执行。旧两次 driver 首败、旧预算 exit1 与历史 UNKNOWN 保留。

### 最终门禁与一项执行偏差

最终 `tests/page-assets-budget.test.ts` raw 逐 case 及汇总为 **171/171，fail/skip/cancel/todo=0，jobs1/retries0**；读现行 test 的 currentCeilings 检查，确实分别覆盖新两 tuple、额外一字节、其他资源及消费后再增长拒绝。最终 budget、imports、boundary、merge-base health、diff-check raw/result 均 exit0，import graph 为 0/1710 混用。本线未重跑这些检查。

**执行偏差（交根记录/裁定，不抹结果）：** `final-run.py` 将 prepare 和 checks 都固定 `slot='build'`；`final/checks.log` 真实外层只有 `machine-slot run build`，checks-binding 为 `MOLIS_WORK_SLOT_HELD=build`。其中直接跑非浏览器 `page-assets-budget.test.ts`；本线读取运行器并只读核分类为 `marks=[]`，因此 run-tests 不会再取得 browser 槽。此与 `docs/system/PARALLEL-DEVELOPMENT.md` §5.1“本机跑测试一律包成 ... run browser ...”不一致。它使用的是公共 build 槽，不是私有 TMPDIR 分裂，但无法据此证明与其他本地测试串行。现有 raw 没有失败或数据混用证据，171/171 结果如实保留；不把它升级成完全符合槽位协议的执行，也不重跑来补写历史。后续执行应由根安排正确 browser 槽；本线没有因此新增源码或执行请求。

最终阶段没有浏览器启动；cleanup 原件记录作用域进程/lsof 空、九个隔离目录移除。本线回读九目录均不存，原行为阶段 profile/目录清理结论不变。NSTemporaryDirectory 的系统目录限制仍保持，不宣称全系统临时目录隔离。

本轮独立重算见 `final-checks.json`、`final-build-recheck.json`、`final-hash-probe.diff`。RAC2823 的最终合成/配套和 RAC2824 原行为证据可接受；RAC2825 的本地资源/绑定部分成立，完整 CI/SI/Full/采用仍待根。T389 采用后若实际基数或运行输入改变，再针对差集结算，不持旧 tuple/本报告去预签新组合。

## 以下为首批原件核验历史（f204 阶段）

状态：首批只读核验完成。**当前六路径合成、构建绑定、三完整 e2e 与 A/B 窄实操证据可接受，未发现需要重复执行或修改产品的缺口。资源许可、README/S-30 配套及最终 H 尚未落定，不能签最终 RAC2823～2825/READY/采用。** 验证线3只读作者原件并独立重算 patch/blob/source digest/结果数据；没有重复构建、测试、启动服务、操作 GH 或 Full。

## 准确输入与范围

M=`db29f18d4f602fa8d9efb689a6a766aa9b07625f`，当前候选 H=`f204d1b065470a538b90857a7de1f543de424579`，tree=`e62a15d0bde983b060346b8b907c0900279b3f4c`。作者 `/private/tmp/t386-dev` 在读取时 clean；M→H 只有任务书六路径，+241/−2。T379 经 dda7af634 正常 merge，T380 为 H 第二 parent。此 H 是已执行生产候选，不冒充后续最终配套 H。

本线独立用 Git 重算，非引用作者 member-blobs 的布尔值：

| 原成员 | 原 B→H 与本次 M→H scoped binary patch | 全文件 blob |
| --- | --- | --- |
| T379 ea67075d | 17444 bytes，逐字节相等，SHA256 `45f6deb391b0a3d23b2c47d708513d83e32fbe4fe3616eaeeac84e05da885f06` | 四文件全部相等 |
| T380 b4382ea8 | 12727 bytes，逐字节相等，SHA256 `fab94e2cab2a0881d15888886fbe634e80c2aaa3a11b7398335bd04a15546893` | 两文件全部相等 |

读过三生产 diff 与三测试 diff：可信 shell 搜索名单、child handled/composing/repeat/terminal 排除、nested source/current/open/visibility/inert 检查仍在；工具键旧分支保留。Goals 恢复只按嵌入首页 URL 无 paneItem 兑现 lastBoard，无额外布局状态。旧测试没有删改断言。

T384 的 `plugins/native/goals/src/page/documents.ts`、`ports.ts`、workbench `terminal/pane.ts`、`client.ts`、`panels.ts` 以及 local-host `plugin-terminal-service.ts` 六个全文件 blob 与 M 相等。静态核到必填 terminalsRoute、Goals 模板 `/api/plugins/io.molis.work.goals/goals/:goalId/terminals`、pane 的 data 属性、client 读取和 panels 消费链；B 再给出了最终真实生产 DOM/route 回执。没有用旧 T379 Host 装配代签。

## 构建、完整文件与隔离

读取 base/candidate 两份整体 build raw/result，均 exit0。候选 prepare/test/measure/gates/qa/qa2/qaB 原件绑定一致的 H/tree、clean status、实际本树 dist 解析及 source digest。本线只调用已阅读的纯摘要函数重新读取磁盘输入：

- H：`a8f61cc2a9c97cacd504a1ae3c6226bb1d2eeca2682c0df51d0ad413d692b8b2`，匹配 manifest（06:16:10Z）和各运行绑定。
- M：`1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`，匹配 manifest（06:18:54Z）。

作者 `candidate/three-e2e.raw` 是完整 verbose 输出，命令 jobs1/retries0；3/3 文件、10/10 case：global-ui 4/4、issue-global-navigation 3/3、plugin-tab-groups 3/3，fail/cancelled/skipped/todo 均 0。保留 raw 中 actions.missing warning 和 host.closed 关闭期间日志，不把测试绿解释成全日志无错误。该运行来源是作者，本线完成独立原件核验，未冒称独立重新执行。RAC2804～2806 在其中是一个 case。

global-ui 原生 Todo notes 正路径有 trusted/消费前后回执；终端 target 是明确标注的 DOM probe。Issue 原生嵌套来源与未提交草稿保留为真，foreign/hidden/inert 等属于明示协议负向探针。不能把这些 synthetic 边界探针说成原生输入或生产运行中终端。

run.py 外层先用公共 machine-slot，内层固定同一 `MOLIS_WORK_SLOT_DIR=/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-slots`；test.log 有等待 T386-measure 的真实槽记录。隔离 HOME/CFFIXED/XDG/TMP/MolisHome、file backend、ad-hoc identity 和专用 browser wrapper 均在运行绑定中；13 个 launch 使用独立 profile 与 mock-keychain/basic password store。Foundation Home/Library/cache 支持隔离，**NSTemporaryDirectory 仍为系统临时目录，不能签 native 临时目录完全隔离**；raw/path-limits 明确保留此事实。

作者 cleanup 记录无进程命中、lsof 无打开项、18 个自建目录删除、13 个 profile 不存。本线回读这 18 目录及 13 profile 全部不存；未重新扫描整个机器，也未执行任何清理。base/candidate 源树与 dist 保留。

## A：顶层搜索与左右身份

已完整读 qa2.mts、qa2/A.json、requests、绑定和相关 raw，实际查看 `candidate/qa2/A-search-with-two-panes.png`。

A 从顶层 shell 真实 picker 搜索入口点击；5 个状态依次 closed→open→K closed→F open/focused→close。事件实际 owner 是顶层 `http://127.0.0.1:52940/projects/molis-work-v1-demo/`；K/F 均 trusted，capture 未消费、after 消费，dialogCount 始终为 1。左 pane `tco3qtq66`、CORE tab `tunfxjma5`、goal CORE 和固定标题/正文保持；右 pane `tlelhjbhk` 的 URL 明确 panePlugin=goals、无 paneItem，固定 INTERFACES 行在正确文档。

截图显示搜索 modal 打开时背景还存在 picker，因此可见性字段不能解释成背景行当时可直接点击。驱动在搜索关闭后通过真实 toggle 关闭 picker，再进行双层 elementFromPoint 命中检查和原生双击；两个 trusted INTERFACES pointer 回执来自正确右 pane 首页。之后驱动断言右 INTERFACES 标题/正文、左 CORE 正文和原 tabId 不变才写 A.json。故 A 满足关闭后真实可操作的 oracle，没有借 hidden/iframe 数量代签。此处不宣称右 Goals 宿主文档跨窗搜索。

## B：Goals 生产菜单排除，与 opaque child 分开

完整读 qaB.mts、qaB/B.json/requests/result/cleanup 与运行绑定，实际查看 `candidate/qaB/B-terminal-empty-input.png`。B 独立新 Home，由公共 API 创建明确 Goal `goal-fd55225d-dc1b-445d-a94e-20b2da55d770`，真实打开工作区→添加终端→自定义命令→命令 input。

输入属于 top document（frame=null）、真实 ASIDE `[data-tui-pane]`、同一 goalId、visible/non-inert/focused。route 模板非空且等于现行 Goals 模板，替换后与基于创建回执构造的期望路由一致。两个原生 K/F 的 capture/after 共四条均 trusted、terminal=true、focused=true、defaultPrevented=false；三次状态 input.value=""、唯一搜索 dialog 关闭、无 xterm。

截图中的 `opencode` 是生产 pane.ts 的 placeholder，不是输入值；DOM 空值与源模板相互印证。公开 owner terminals 前后均 panels=[]。作者窗口含两次 GET，terminalMutations=[]；本线额外扫描完整 qaB 请求记录 33 条，也无 terminal/execute/pty 非 GET。qa/qa2 的完整 94/192 条记录同样没有这些副作用。取消用真实按钮并等待 menu 关闭。

结论仅为 Goals 生产宿主 global-search 的终端输入排除；opaque childNavigation 排除归完整 global-ui 的 DOM probe。没有运行命令、PTY、xterm 或 Agent 验收结论。

## 两次 driver 准备失败保留

实际看过 qa/failure.png 与 qa2/failure.png，读 failure.json/stack 与 CONTROL-NOTE：

1. 首轮 A 的最后右行 hit-test 被仍打开的 picker 遮挡，exit1。qa→qa2 差分只有输出目录、额外保存 A-before-row 和真实 toggle 关闭 picker/等 hidden；原 hit-test 和后续身份断言未移除。首轮不能算完整 A 通过。
2. 第二轮 A.json 已成功写入；B 在双栏布局中以顶层 querySelector 找工作按钮，命中隐藏副本，尚未执行 B K/F 即退出1。截图显示右 pane 实际 Goal 和按钮。qaB 保留相同 B oracle，独立新 Home 单栏 setup，不篡改旧布局。qa2 整体结果仍失败，不能抹成成功；仅引用其已完成 A，再另引 qaB 成功 B。

这两次是有具体定位、原件保留的外置 driver 准备失败；未改产品、强改 hidden 或放宽断言。三完整 e2e 没有因此重跑。

## 资源与尚待最终配套

本线逐项重新比较 base/candidate 官方 served JSON 与外置 hashes JSON：各自 bytes 完全相等、48 键一致、discoveryMisses=[]；46 项 bytes/hash 均相等。只两项变化：

| 资源 | M | H | 增量 |
| --- | ---: | ---: | ---: |
| molis-work-plugin-frame.js | 190838 | 191017 | +179 B |
| molis-work-workbench.js | 1150615 | 1151174 | +559 B |

总计 7469519→7470257 B。已阅读 hash 探针对生产 gate 的精确 diff，仅在同一 response body 处加 SHA256 并输出；测量实际调用构建后的 `createLocalWebAssets().serveWorkbenchAsset`（fake request/response 收集 body），**不是启动 HTTP 服务后逐资源网络下载**。这支持真实 Host 资源生成路径的内容，不能扩大成独立网络传输验收。未使用 --sizes 或旧 delta 相加；T384 +324 已在 M 基数。

M budget exit0，候选 budget exit1 如实保留，恰为上述两项增长；根资源许可与 budget/APPROVED_CEILINGS 尚未写入。本线不授额度。已核当前 boundary、merge-base health、test-import graph 原始结果均 exit0；import graph 为 0/1710 混用。这些是 H 当前范围结果，不替后续配套最终检查。

待根给最终 H 后，只核新增 README 不变量、S-30 精确行、资源 tuple/预算/已消费条目及必要最终构建/门禁绑定。资源 gate 脚本属于 source digest 输入，配套修改后旧摘要不能原样当新 H 匹配；但若六行为文件及运行产物保持，已有效三完整文件/A/B 不因此机械重跑。若实际运行输入变化再定位必要差集。

当前 RAC2823 的行为合成与 T384 接缝、RAC2824 的作者完整执行及本线独立原件核验成立；RAC2823 配套最终头和 RAC2825 尚待根结算。Verify、适用 SI、该 PR 一次 Full、实际 main 采用、最终 App 和一骏验收均不在本报告已通过范围。T379/T380 历史失败、UNKNOWN 与原证据来源维持，不倒填。

独立重算结果见同目录 `checks.json`、`build-recheck.json`；原始执行证据保留于 `/private/tmp/t386-evidence`。本轮没有发现必须新增本地执行的缺口。
