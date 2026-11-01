# T385 本地普通 storage 承载交接

状态：本地工程候选完成、干净冻结，`full=true`。无一审（甲档）；独立验证线1、二审线4和最终 Verify/Full/适用SI/§8采用由根接续。本线未推送、未写GH/CI、未跑本机Full，未接触真实Home/4207/Keychain/账号模型或原PR作者树。

## 准确输入与合成（RAC-2820）

| 对象 | 准确值 |
| --- | --- |
| 已采用 M | `6729a2d4655caa603daa369f99884e09c4726bde`（开工 ls-remote核同） |
| T346 输入 | `815d6e11be8f8ae28631183a90cfcdd2b352c6e4`，与 M 的merge-base=`3fd857792a27352030ac8f3544a3b57d418febc1` |
| T347 输入 | `170777c2a8c61257e7e840afc0ebfcadd382efcb`，与 M 的merge-base=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987` |
| 第一正常 merge | `bff004fba58912d2ff97cb3b9dd8d8ccc964097a`，parents=M、T346 |
| 最终 H | `44efe84d925b7f01e6f8f837c0bf284471ae7659`，parents=第一merge、T347 |
| 最终 tree / 分支 | `908622b69189edcfed007efb26290d57a1c148c7` / `feature/t385-storage-carrier` |
| 候选树 | `/private/tmp/t385-dev` |

两次均正常 merge、无冲突、无手工生产或测试修改；未rebase/force。M→H准确十路径+386/−21，全部在WO范围，十个最终blob均等于对应输入H；其它路径保持M。T346 stable patch-id=`d76419efdb971a58a544e5eaa74ed94da01f1aa7`，T347=`71a4dfa91c991216062670abd3da3c739ffa8bd3`，各自在原头和承载投影完全相同。见 `binding.json`、`raw/T346-original.patch`/`T346-carrier.patch`、T347同名原件、`raw/carrier.patch`、两个merge日志。错误主人表仅保T346既有storage路径/理由；现行schema/version、seal/open/key算法与mutex调用方式没有新增变更。

生产调用链维持 accepted WO：T346只读baseline预检，776交SQLite可写恢复后再核版本/结构；Home plugin store仅映射自己的结构拒绝。T347 mutex直接DatabaseSync/BEGIN IMMEDIATE，不走T346 wrapper；load后save前的封条拒绝/删坏目标恢复没有新增嵌套锁或共用事务。没有引入第三项修复或人为串接故障矩阵。

## 匹配构建、完整文件与恢复（RAC-2821）

Node24.14.0/ABI137/darwin arm64；offline frozen install和整体 `pnpm build` 均exit0，公共build槽原件 `raw/candidate-install.log`、`raw/candidate-build.log`、`raw/prepare-result.json`。最终生产source digest=`f115740ff71b5f074c6ec6b9a70fcffb53b322db4c04dd3f7fad5da40856d2db`，与保留manifest相同；每批前后核对应源码/测试文件，原始日志直接绑定干净H/tree，没有提交前dirty绑定替代。

| 固定完整文件（tests/） | 本轮执行 | 验证范围 |
| --- | ---: | --- |
| storage-baseline.test.ts | 7/7 | 建库/健康重开；版本/结构/缺表拒绝；DELETE bytes/mode/目录不变；776恢复后完整校验；WAL db和已有WAL业务页不变（不承诺SHM锁字节或空sidecar不变） |
| home-store-baselines.test.ts | 26/26 | 当前Home registry/schema金样、Host消费者及具体store拒绝 |
| secret-store-format.test.ts | 5/5 | 读/写/snapshot一致拒坏封条；锁内拒写secrets.json字节不变；删坏目标恢复，删健康而留其它坏项仍拒绝 |
| security-invariants-secret-snapshot.test.ts | 5/5 | 原key、认证/用途、健康空明文、坏nonce/tag/key拒绝及只读正控 |
| secret-store-missing-key.test.ts | 3/3 | 缺/错原key拒绝、无替代key、恢复原key后健康读取 |
| home-backup-recovery.test.ts | 1/1 | 仅离线复制后的Project、Goal历史、Artifact版本，不署vault/原key恢复 |

六文件47例，命令和逐例完整输出 `raw/six-files.log`。另外九项逐行核抵/补跑见 **[README-NINE.md](README-NINE.md)**：无可直接核抵本组合的完整证据，九个原完整文件补跑69例通过。两批均jobs1/retries0，无fail/skip/cancel/todo，无名称过滤。`verification-summary.json`逐文件计数；两个result保H/source digest/测试SHA及fixture绑定。没有扩大旧223批、重做旧11/116或T347旧矩阵。原T346旧B/H各116、核心776及T347旧独立10/10/二审按原头/执行者继承未变范围，不改署本轮；旧失败及UNKNOWN保持。

## 门禁和资源（RAC-2822本地部分）

`raw/gates-summary.json`各项exit0：boundary（公共build槽）、health对准确M、test-import graph、diff --check、冻结M的逐提交secrets（490新增行）、page-assets严格检查、report和实际served捕获。health同时覆盖错误owner表严格性及各错误码归属、API快照；没有update基线/快照/许可或改门禁。

48项实际Host响应体均与准确M **bytes和SHA-256完全相同**，总量两端7,469,195B，差异=[]；无新asset或资源许可。候选原件 `candidate-assets.json`、`resource-comparison.json`、`raw/capture.log`。M基线只读复用T146作者刚完成的准确6729参考树整体build/serve原件，已逐项核完整捕获、创建/安装/构建/绑定/报告并保存到 `raw/M-resource-source/`，来源与本轮候选执行明确分开；没有拿旧T383缺T382输入的build或静态预算充基线。原T146参考树后续已由其owner正常移除，本线未进入或修改其树。候选48路径还经过标准page-assets discovery检查，discoveryMisses=[]。

根推送前仍需fresh fetch与`pnpm secrets:check`；本线只签冻结M的本地扫描。准确H的普通CI/Full、独立验证/二审、适用SI与未答问题尚未由本报告签收；不把本地通过当作采用。最终应在main回读十路径、两成员patch/blob/文案/错误主人后再标两原PR“由承载采用”，不称它们自身merged。

## 隔离、执行偏差与清理

公共machine-slot路径从系统TMPDIR取得，内层HOME/CFFIXED/XDG/TMPDIR/MolisHome为本任务私有路径，file backend、首次ad-hoc、无个人账号/模型/代理环境。Node home/tmp和Foundation用户Library/cache/application-support探针通过；**Foundation NSTemporaryDirectory仍返回macOS系统临时目录**，限制保留，不宣称所有原生临时路径都被TMPDIR重定向。本批无浏览器/模型需求；受控CLI/PTY及fake-security均属既有测试合成夹具，未执行真实登录/凭据。额外security保护程序未被意外命中。

准备期读取旧私有pnpm缓存index的普通只读SQLite连接报`unable to open database file`；改用immutable只读快照成功，随后新私有store的offline frozen安装通过。没有修改旧store或绕过锁文件；这不是产品/测试失败。原计划另建M参考树时，发现T146正在同准确M构建，故取消**本任务尚未开始**的重复排队wrapper（exit−15，非运行中的测试/CI）；改核其原件，记录 `raw/reference-queue-cancellation.json`。未停他人进程或触碰T384树。

测试/构建/门禁进程全部结束，lsof与ps的本任务作用域匹配为空；测试Home已由夹具清理。`cleanup.json`记录仅移除本任务临时系统Home/缓存/store/TMP/MolisHome及未使用的干净reference树。保留干净候选及匹配node_modules/dist/native build供独立线复用，证据/脚本保留；原T346/T347树仍clean且HEAD原值不变。没有对主检出或其他任务做清理。
