# T386 最终作者交接

**作者授权范围已完成，本地门禁通过，窗口交回；尚未发布或采用。** M `db29f18d4f602fa8d9efb689a6a766aa9b07625f`；最终 H **`cb931d6537276952d716b6ca3c3b2b225b222406`**；tree **`5ae2b068ba17fd44a23d9927e9d2b858aa40dfec`**。工作树 `/private/tmp/t386-dev`，分支 `feature/t386-w6-pair`，干净。原正常merge两片的行为头为`f204d1b065470a538b90857a7de1f543de424579`；最终只在其上收进根授权的四个配套路径。没有merge后续T391纯文档main，也没有取在途兄弟补丁。

## 最终改动与许可

总差分十路径：六原行为/测试文件 **+241/-2**，每个blob仍等于T379/T380各自冻结原H；另四配套文件 **+10/-7**。README的一条不变量和安全表S-30精确目标行由根串行应用，本线收进提交；S-103及其余安全行不动。`page-assets.mjs`只替换已消费T362 workbench tuple并新增plugin-frame tuple，门禁算法、阈值及其他许可不变。`tooling/gates/page-assets.json`由官方 `--update --base db29f18d4f602fa8d9efb689a6a766aa9b07625f` 写入，仅两数字变化，无新资源、无slack。

根许可来自当前accepted T-386.md“根最终资源与配套窗口”（06:31Z）。准确tuple为 **plugin-frame 190838→191017（+179 B）**、**workbench 1150615→1151174（+559 B）**；T384+324已经在基数1150615内，未重复计或与兄弟补丁抵销。省量判断是已审源码替代方案分析，未称压缩实验；必要source/current/visibility/inert/terminal检查与Goals URL/lastBoard选择保留，不以inline迁移、删无关功能或换minifier抵额度。

原件：[最终完整patch](final/candidate.patch)、[四配套patch](final/companion.patch)、[成员blob](member-blobs.json)、[S30/门禁范围核验](final/scope-prebuild.json)。

## 构建、资源与证据承接

最终公共build槽执行整体 `pnpm build`，5/63包重建、58包未变，自然exit0；然后官方预算更新exit0。最终 source digest **`2879e4f9ab3a644fb7921f4bafdc1ec039f249d8a4581b092285dcb6f1d59210`** 与manifest匹配，实际local-host/desktop/coding/test-kit解析均在本树dist；见 [最终绑定](final/checks-build.json)、[构建raw](final/whole-build.raw)、[更新raw](final/budget-update.raw)。构建时根配套为dirty，提交后在准确最终H重新绑定，不把旧HEAD标成已提交构建输入。

最终官方gate测量48条Host serving响应，无discovery miss；外置探针仅在同一gate的响应记录点补sha256（仓库gate没有此诊断改动），其48 bytes与官方gate完全一致。**最终48项bytes/hash全部等于已通过行为验证的f204产物**；M→最终仅上述两项变化，其他46项hash相同，总量7469519→7470257 B。见 [最终响应](final/served-hashes.raw)、[连续性与M/H差分](final/continuity.json)、[原M响应](base/served-hashes.raw)。官方 [预算gate](final/budget.raw) exit0。

`f204→最终H`仅四配套文件；生产src、Manifest/依赖、三份e2e未变，48最终响应hash完全相同。source digest变化由纳入指纹的`script/gate`实际文件 `scripts/gates/page-assets.mjs` 引起，README与预算本身不在该指纹集合。故按根明确要求承接原10/10与A/B，不重复、不改署成最终H重新执行。[输入连续性](final/input-continuity.json)给出准确范围。

## 实际验证与原件

| 验证 | 结果 |
| --- | --- |
| 最终H资源预算门禁完整文件 | **171/171，fail/skip/cancel/todo=0，jobs1/retries0**。包含准确两tuple的一次性上限、额外一字节/别的资源/消费后再涨均拒绝。**执行偏差：该171项测试仅持有公共build槽，未取得约定的browser测试槽；结果保留，不据此声称槽位执行合规。**[完整raw](final/asset-gate-tests.raw)、[命令结果](final/asset-gate-tests-result.json)。 |
| 最终H静态门禁 | imports `--check --chains`、boundary、health `--base M`（含文档引用/翻译/API等）、diff-check全部exit0；final目录各同名raw及result.json。无API/动作/Manifest形状变化，未刷新快照。 |
| f204完整三e2e | **10/10，fail/skip/cancel/todo=0，jobs1/retries0，只有一次完整执行**。global-ui 4、issue-global-navigation 3、plugin-tab-groups 3；RAC2804～2806是同一case，不虚增计数。[raw](candidate/three-e2e.raw)、[结果](candidate/three-e2e-result.json)、[当次绑定](candidate/test-build.json)。 |
| A 顶层搜索与双栏 | [qa2/A.json](candidate/qa2/A.json)中固定左CORE tab/id/标题/正文、右pane/无paneItem首页URL/INTERFACES行；五次搜索前后状态保持；真实顶层入口、trusted原生K关闭/F打开聚焦、唯一dialog。收起入口picker后，真实右frame双击打开INTERFACES、左CORE保持。[截图](candidate/qa2/A-search-with-two-panes.png)。不宣称右Goals宿主pane跨窗转发。 |
| B 生产终端菜单负例 | [qaB/B.json](candidate/qaB/B.json)：独立合成Home、真实“打开工作区→添加终端→自定义命令”；正确Goal/top document/input/ASIDE祖先、visible/non-inert/activeElement；非空`:goalId`模板与展开owner route分别核。原生K/F的capture/after四条回执trusted且未prevented，搜索关闭、空value保持；前后公开owner panels=[]，终端创建/执行非GET=0，真实取消。[截图](candidate/qaB/B-terminal-empty-input.png)。无PTY/xterm/Agent启动。opaque child DOM target排除仍单独由完整global-ui用例签证。 |

最初行为差分affected建议61文件、full=[]，文本选取器将navigation.ts标uncovered，完整global-ui实际覆盖该桥。按accepted WO不重复原T379作者188项/独立7项、T380作者18unit/17browser/独立3项、scene5/7或T384矩阵；旧证据保留原准确头与执行者，不能冒签最终组合执行。T386要求的自身PR Full不因affected full=[]取消。

## 首败与未验证边界

两次外置实操控制失败原件保留，不算通过：[CONTROL-NOTE.md](CONTROL-NOTE.md)。第一次A末尾，搜索虽关但入口picker仍遮挡右行；仅加真实toggle关闭步骤后A完整通过。第二次A通过后，B准备仍继承双栏，产品把新Goal正确放右frame，而脚本误查顶层隐藏按钮；未发B键、未创建终端。B改用另一个合成Home/单栏生产文档后通过，A不重跑。没有产品改动、DOM/hidden强改、清布局或放宽断言。三份完整e2e未重试。

最初H资源gate exit1及两次实操exit1分别仍在candidate/budget.raw、candidate/qa及qa2，不倒填绿；最终已获许可的预算gate是final/budget.raw。raw保留workspace-settings `actions.missing`等诊断；不声称零日志错误。原W6三条driver准备首败、旧网络UNKNOWN、运行中PTY未验仍按原出处。工程候选证据不等于整条W6、最终App或一骏本人验收。

## 隔离、清理与后续归属

两阶段均固定覆盖TMPDIR前的公共slot目录。行为阶段构建使用build槽，三份e2e与A/B使用browser槽；**最终171项资源门禁测试却在公共build槽内执行，未取得约定的browser测试槽，这是执行偏差，不能称全程符合槽位规则。**根接受保留171/171实际结果，不要求重跑补历史；原raw保持不变，协调记录由根处理。后续将构建/静态检查与测试分开调度，执行测试前取得约定的公共browser测试槽并核对实际持槽记录，不能以build槽替代。独立HOME/CFFIXED/XDG/Node TMP/MolisHome、file secrets、ad-hoc identity保持。行为阶段专用browser wrapper加mock-keychain/basic，13次profile均已消失；最终配套阶段未开浏览器。Foundation Home/Library/Caches/ApplicationSupport隔离，NSTemporaryDirectory仍指系统临时目录，未称全系统临时路径隔离。无真实Home/4207/用户Keychain/凭据/模型调用。

全部本次命令自然退出；最后lsof与作用域进程为空。行为阶段18个目录、最终阶段9个目录已清；worktree/dist与原件留给独立审验。[第一次清理](cleanup.json)、[最终清理](final/cleanup.json)。T391旧树无用途且已释放给根（T391-RELEASE.json）。

**作者窗口交回，最终H冻结。** 根接续独立验证线3/独立二审extra终签、fresh-fetch/secrets、GH/push、Verify、适用SI、该普通PR自身Full与实际main采用；本线未执行这些外部步骤。若先后采用改变资源基数，按新组合实测收尾，不沿用错误tuple。最终机器可读状态见 [FINAL-STATE.json](FINAL-STATE.json)。第一阶段完整历史报告保存在 [PRE-ADMISSION-REPORT.md](PRE-ADMISSION-REPORT.md)，其中“待许可”仅是旧阶段状态。
