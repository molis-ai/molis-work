# T387 本地三片普通承载交接

状态：本地工程候选完成、工作树干净冻结；甲档无一审，`full=true`。独立验证线3、二审线5以及准确H的CI/Full/适用SI与采用由根接续。本轮业务测试/负控/浏览器/模型执行为0，按accepted WO留三核心完整文件给最终新Full；不以旧结果改署新组合通过。

## 准确合成（RAC-2826）

| 绑定 | 值 |
| --- | --- |
| 实际采用 M | `6729a2d4655caa603daa369f99884e09c4726bde`，开工和收尾ls-remote均核同 |
| T299 #1671 | `afbcdaad6fe879a0feb99e9276ed01d960348e11` |
| T345 #1663 | `4e6055767a77a0129c153c07b1cd0a4de1a524ab` |
| T373 #1700 | `c52dcc200ad706d48fe693c59a67c9e9736c60a2` |
| 三成员各自与M的merge-base | `8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987` |
| 第一正常merge（T299） | `a97376e6503f8e8a4ddc96cbc1a926bb27709ebd`，parents=M、T299 |
| 第二正常merge（T345） | `bff124657e2219076bd68ac438bfeea7d517fe24`，parents=第一merge、T345 |
| 最终H（T373） | `3862de92dee5683543fef60d669750053562e330`，parents=第二merge、T373 |
| tree / 分支 / 树 | `92a84c126f0f1b0c6ac4a04d65921f4d78e03fa3` / `feature/t387-small-carrier` / `/private/tmp/t387-dev` |

三次正常merge均无冲突、无手工生产/测试修复、未rebase/force。M→H准确十路径+148/−123，全部为WO允许成员自有路径；十个最终blob均与各自输入H相同，非自有路径保M。实际tree与方案预测相同只是静态补充，运行证据来自本次真实构建。

| 成员 | 原/承载stable patch-id（完全相同） |
| --- | --- |
| T299 | `6a5d9dafe5ba7b7a143b73a1510785f2d3756b74` |
| T345 | `d252e441f7599e8e5dece2ee633c45fd06d0ba3d` |
| T373 | `d4f99a01c538b3c018b01ff077e34438ab18a167` |

见 `binding.json`、`raw/T*-original.patch`/`T*-carrier.patch`、`raw/carrier.patch`、`raw/merge-chain.txt`及三份merge日志。逐行增删也相同，没有用整文件覆盖共享hunk或强求未采用的T384/T121变更。WO末节三个窗口已明确释放给本线；非成员T384/T116/T121头均不是本候选祖先，未读取/导入其候选实现。原三作者树仍clean/HEAD原值，T385旧树仍clean/44efe，未写原PR/GH/coord或其它候选。

## 行为/输入继承及未跑范围

T299原注释全文和非注释代码关系随同blob/patch完整保留。T345仅当前DDL新建干净v1 Home从创建即完整；holder仍来自可信caller，hold/reclaim/release仍走原权限、beforeEffect、事务和批次，清理失败保引用/来源供重试，不新增旧Home迁移或跨服务回滚保证。T373仅第二阶段普通失败保catalogIssue并追加code-only issue；closing静默、父取消same reason、其它项目答案仍按原合同，不改R63日志策略。

`runtime-inputs.json`核已读Feed actions/插件/registration/Manifest/contract、聚合调用方及contracts/SDK/Runtime/storage、package/lock从M0→M均未变；Host index的T382 Artifact HTTP命名变化未触聚合入口。三片之间没有新增事务/权限/关闭调用边，没有把Feed command故障接入聚合query来造矩阵。没有新增语义hunk或相关输入变化要求额外本地业务测试。

旧动态的头、执行者、适用理由及最后三完整文件的Full核验清单见 **[EVIDENCE-MAP.md](EVIDENCE-MAP.md)**。旧T299四文本检查/35/M1-M2、T345旧独立63及作者runtime54/59/M、T373旧独立7/closing负控及作者68/旧catch负控均保原来源。本次没有重新执行或累计它们。最终五个相关编译文件与保留成员产物逐字节相同（`compiled-comparison.json`），该检查不算业务运行。

## 本次工程与资源（RAC-2827本地部分）

Node24.14.0/ABI137/darwin arm64；offline frozen install与整体 `pnpm build` 在公共build槽exit0。原件 `raw/candidate-install.log`、`raw/candidate-build.log`、`raw/prepare-result.json`。最终source digest=`ac7e726c1ba51c99c998b9f0fc71f69f8d682a1b2042663ab874ac1c97a2d7c7`，与保留 `dist/.molis-work-build.json`一致；工程命令前后H/tree/clean与源码绑定明确。没有借旧dist代替组合构建。xterm/SQLite实验警告保留，不当作体验结论。

`raw/gates-summary.json`全部exit0：boundary（含同树test-kit构建，公共build槽）、merge-base health对准确M、test-import graph、diff --check、冻结M逐提交secrets（148新增行）、标准page-assets检查/report及实际Host served捕获。无API/动作/Manifest形状变化，未update快照/基线/预算/许可、未改门禁。根推送前仍须fresh fetch及`pnpm secrets:check`，不以冻结M扫描冒新fresh检查。

**48项实际served响应体对准确M bytes/hash全等**：两端7,469,195B，差异=[]、discoveryMisses=[]，无新asset或许可。候选 `candidate-assets.json`、`raw/capture.log`由本轮匹配build实测；M基线复用T146准确6729参考树已构建并serve的原件，T385已只读保存，本次再保存于 `raw/M-resource-source/`（含创建/安装/构建/捕获/报告/来源）。该M来源是T146作者，不冒称本线重建；不拿预算或旧T383缺T382的产物算实测。对照在 `resource-comparison.json`。

## 隔离与清理

公共slot从未改TMPDIR的系统路径确定，内层新HOME/CFFIXED/XDG/TMP/MolisHome、file backend、ad-hoc；pnpm使用私有store和frozen/offline，Corepack网络关闭，真实配置/凭据环境未继承。Node home/tmp及Foundation用户配置/缓存路径探针通过；**Foundation NSTemporaryDirectory仍由macOS返回系统临时目录**，见`raw/paths.json`，不宣称所有原生临时路径已重定向。SwiftPM构建依赖解析/获取仍按原日志保留，未声称全构建网络隔离。security保护程序未被意外命中。

未启动浏览器/Host服务/模型或真实账号操作，未触真实Home4207/Keychain；没有产品、测试或资源失败要在承载上修复。所有自有进程结束，lsof/ps本任务匹配为空。`cleanup.json`记录仅移除本任务九个临时系统Home/cache/store/TMP/MolisHome目录；保留干净候选、匹配node_modules/dist/native build及证据供独立线复用。T385和原三作者树未作清理/改写。

## 最终采用仍待根（RAC-2828）

本地候选不签最终采用。根需同H的Verify、独立验证/二审、一次普通新Full、实际适用SI与未答问题齐备；Full必须核真实checkout parents/tree和三核心文件完整执行/首败/retry/skip，不能只看aggregate成功。准确执行清单见EVIDENCE-MAP。

根实际main采用后才逐成员十路径/注释/DDL/fixture/聚合行为核账，将#1671/#1663/#1700标“由承载采用”并按流程关闭，不称原PR自身merged。原Full失败、T381/T383历史因果UNKNOWN、真实旧v1 Home与R63延期范围、最终产品/本人验收均保持；共享hunk窗口由根串行交还，不因本报告自动解锁他线writer。
