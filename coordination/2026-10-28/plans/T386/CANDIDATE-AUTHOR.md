# T386 作者本地交接：行为合成与组合验证已完成，根文档/资源窗口待处理

M **db29f18d4f602fa8d9efb689a6a766aa9b07625f**；候选 H **f204d1b065470a538b90857a7de1f543de424579**；tree **e62a15d0bde983b060346b8b907c0900279b3f4c**。分支 `feature/t386-w6-pair`，工作树 `/private/tmp/t386-dev` 干净。正常 no-ff merge 两冻结原 H，无冲突；恰好原六路径 **+241/-2**，各文件blob与各自原片逐一相同（[member-blobs.json](member-blobs.json)、[candidate.patch](candidate.patch)）。T384的Goals端口、必填terminalsRoute及生产终端服务不变。此结论是本地作者候选，不是整项T386已采用。

本线冻结六路径，不再自行写源码。根串行的README/S30和资源预算尚未写：**候选 page-assets exit1仍真实存在**，恰好两个未放行增长，不冒签全绿。具体精确许可交接见 [RESOURCE-PENDING.md](RESOURCE-PENDING.md)。最终H经根配套变更后须另核绑定；当前证据不会直接改署为未来H。独立验证线3/独立二审一审线2与根最终裁决仍待各自执行。

## 实际验证

| 项目 | 结果与原件 |
| --- | --- |
| M/H整体构建、依赖解析 | 两边首次 `pnpm install --frozen-lockfile --offline`、整体 `pnpm build` 自然exit0；[M绑定](base/prepare-build.json)、[H绑定](candidate/prepare-build.json)及对应prepare.log/whole-build.raw。候选实际导入local-host/desktop/coding/test-kit均来自本树dist。M复用提示到达时基线prepare已开始，遵照“不取消正在跑的步骤”让其完成。 |
| 三份完整e2e，jobs1/retries0 | **10/10 pass，fail/skip/cancel/todo=0**，单次完整执行。global-ui 4、issue-global-navigation 3、plugin-tab-groups 3；RAC2804～2806属于同一case，未虚增计数。 [完整raw](candidate/three-e2e.raw)、[命令/exit](candidate/three-e2e-result.json)、[运行时绑定](candidate/test-build.json)。 |
| A 顶层搜索+双栏组合 | [qa2/A.json](candidate/qa2/A.json)：固定左CORE tab/id/标题/正文、右pane/无paneItem首页URL/INTERFACES可见行，五个搜索前后状态均保持；顶层真实入口点击trusted，原生K关闭/F打开聚焦、唯一dialog；真实右frame双击打开INTERFACES且左CORE保持。没有宣称右Goals宿主pane跨窗转发。 [截图](candidate/qa2/A-search-with-two-panes.png)。 |
| B 真实生产终端菜单 | [qaB/B.json](candidate/qaB/B.json)：单独合成Home、生产Goal文档真实“打开工作区→添加终端→自定义命令”；input属top文档、正确goalId、ASIDE data-tui-pane、visible/non-inert/activeElement均核。准确非空`:goalId`模板与其真实展开route分别核；原生K/F四条capture/after回执全部trusted且未prevented；搜索关闭、空value保持、前后公开owner panels=[]，终端创建/执行非GET=0，真实取消。 [截图](candidate/qaB/B-terminal-empty-input.png)。无PTY/xterm/Agent启动。opaque child target排除只由完整global-ui相应用例签证。 |
| 必要门禁 | imports --check --chains、boundary、health --base M、final diff-check全pass。health含现行文档引用/翻译/API检查，未改快照。对应candidate/*-result.json和*.raw。 |
| 48实际served响应 | [served-delta.json](served-delta.json)：同48键无增删，46项bytes/hash一致；plugin-frame **190838→191017 (+179B)**，workbench **1150615→1151174 (+559B)**。M总7469519→H7470257。T384+324已在基数，未重复计。M budget gate exit0，H exit1待根许可。 |

源码指纹 M `1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`；H `a8f61cc2a9c97cacd504a1ae3c6226bb1d2eeca2682c0df51d0ad413d692b8b2`。资源使用官方gate真实Host serving路径，不取dist文件大小代替；外置`measure-hashes.mjs`仅在同份gate测量回调加sha256，`--root`绑定各自树，未改仓库gate。各自官方gate和探针48 bytes逐项一致；base/candidate的served.raw、served-hashes.raw、budget.raw及命令结果全保留。

实际affected建议61文件、full=[]、uncovered为plugin-frame/navigation.ts（文本选取器未直接识别该桥，完整global-ui真实路径实际覆盖）。按accepted WO保留原T379作者188项/独立7项与T380作者18unit/17browser/独立3项的原头、原执行者，不重演这些批次或scene5/7、T384全矩阵；这些旧证据不冒签组合H。T386合同要求的PR Full仍由根执行，affected full=[]不取消该要求。

## 失败与边界

两次外置实操控制失败均保留，未计通过：第一轮A末尾被尚未收起的插件picker遮住行；只增加真实toggle关闭步骤。第二轮A完整通过，但B仍沿用了双栏布局，脚本误在顶层找实际已进右frame的新Goal工作按钮；B尚未发键。B随后独立合成Home中执行，明确单栏owner文档，A不再重复。详见 [CONTROL-NOTE.md](CONTROL-NOTE.md)、candidate/qa和qa2的failure.json/failure.png；三个完整e2e没有重试/重跑，没有改产品、hidden、layout存储或放宽断言。

raw中有既有workspace-settings `actions.missing` 等诊断，完整保留，不把它们当成新增测试失败或无错误日志。旧三条driver准备首败、旧网络UNKNOWN及运行中PTY未验保持原出处；本轮不推称整条W6、最终App或一骏本人验收通过。

## 隔离、清理与剩余

公共slot在覆盖TMPDIR前取得并在内外层显式固定；build/browser各一槽。独立HOME/CFFIXED/XDG/Node TMP/MolisHome、file secrets、ad-hoc identity；专用测试浏览器外置wrapper加mock-keychain/basic密码存储，13次profile启动留原件。Foundation Home/Library/Caches/ApplicationSupport已隔离，但NSTemporaryDirectory仍指系统临时目录，明确未隔离。没有真实Home/4207/Keychain、凭据或模型调用。

所有本次命令自然退出；lsof无打开句柄、作用域浏览器/runner进程为空，18个自有运行目录已删，13次profile均不存在。候选与基线worktree/dist、截图和原件保留。[cleanup.json](cleanup.json)。T391旧树另核clean/无句柄/无进程、无后续用途，已释放给根正常清理（[T391-RELEASE.json](T391-RELEASE.json)）。

剩余由根串行：README不变量/S30精确hunk；按真实48响应给予两条无slack资源tuple并更新预算、清消费项；冻结最终H、核配套变更输入和必要检查；独立验证/二审；fresh-fetch/secrets、推送、Verify、适用SI、该普通PR一次Full和实际main采用。作者未做GH/push/CI/Full/协调仓写入。当前准确信息汇总 [FINAL-STATE.json](FINAL-STATE.json)。
