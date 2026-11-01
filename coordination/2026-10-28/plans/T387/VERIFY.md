# T387 本地候选独立核收

**准确 H 的合成、继承范围及本地工程原件核收通过，无当前必须返工项。** H=`3862de92dee5683543fef60d669750053562e330`，tree=`92a84c126f0f1b0c6ac4a04d65921f4d78e03fa3`，M=`6729a2d4655caa603daa369f99884e09c4726bde`。本线仅只读Git、作者冻结原件和现存产物，执行只读指纹/差分计算；没有build/test、重跑旧矩阵、启动Host/浏览器或写GH/coord。`full=true`，组合动态、CI/Full和实际采用尚待根。

RAC-2826：直接回读三次正常merge父链为 M→T299→T345→T373，与作者binding一致；工作树干净。M→H仅10路径、+148/-123。独立从Git按各成员merge-base（均`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`）重算：原成员patch与承载对应patch**逐字节相同**，各自也等于保存的original/carrier原件；10个整文件blob均与其成员H相同，非成员路径保M。见 [checks.json](checks.json)、[复核脚本](check.py)；作者 [binding.json](/private/tmp/t387-evidence/binding.json) 与实际对象相符。不是只凭预测tree或patch-id签合成。

T299的JSDoc全文/非注释代码关系、T345现行v1 DDL及SQL夹具/回收恢复约束、T373外层code-only顺序/closing/父取消合同随原patch保持。M0→M的34路径不交本批10路径；独立核作者列明的Feed动作/插件/registration/合同与Host聚合直接调用输入、contracts/SDK/Runtime/storage/package/lock无变化。Host index的既有Artifact HTTP命名变化不改聚合导出；没有把全Host说成未变。最终5个相关编译单元与保留成员产物逐项同SHA-256，支持沿用，不算新业务运行。未发现需补虚构Feed-command→aggregate-query场景或本机重演三核心文件的风险。

RAC-2827本地部分：整体 [build.log](/private/tmp/t387-evidence/raw/candidate-build.log) 与结果exit0，63包及根编译/pty产物均完成，warning保原文。独立重算源码digest=`ac7e726c1ba51c99c998b9f0fc71f69f8d682a1b2042663ab874ac1c97a2d7c7`，等于当前manifest、作者prepare记录及served捕获。boundary errors=[]、health --base准确M、test-import graph（0混用）、scoped diff check、冻结M secrets扫描148行均有exit0原件，[gates-summary.json](/private/tmp/t387-evidence/raw/gates-summary.json)与实际日志一致。**fresh fetch后的推前secrets仍由根执行**；未把当前冻结M扫描签成新的fresh检查。

独立解析候选 [candidate-assets.json](/private/tmp/t387-evidence/candidate-assets.json) 与准确M保存的实际资源捕获：**48项逐项bytes及SHA-256均相同，合计7,469,195 B**，不是仅比预算总和。候选capture代码走matching built `createLocalWebAssets().serveWorkbenchAsset`实际响应体；标准page-assets检查也通过、discoveryMisses=[]。M基线来自T146准确M参考树的创建/安装/整体build/serve原件，经T385保存、本次只读复用；独立核保存文件hash与provenance相符，未另建基线或测量。未改预算/ceiling/许可，未把非网络路由捕获写成真实HTTP服务实操。

已全文核最终作者 [REPORT.md](/private/tmp/t387-evidence/REPORT.md)、[EVIDENCE-MAP.md](/private/tmp/t387-evidence/EVIDENCE-MAP.md)、环境和cleanup。公共槽目录显式指向系统共享路径，原件记录build持槽；独立系统HOME/CFFIXED/XDG、私有store、file/adhoc环境明确。Foundation Home/Library/cache探针隔离，NSTemporaryDirectory仍为系统路径；SwiftPM获取/解析等原日志不被描述为全程网络隔离。当前九个本次隔离目录确实已不存在，作者cleanup-preflight记录无自有进程/打开路径，候选仍clean。该环境证据只归本次工程，不向旧运行反向扩签。

旧动态按来源沿用：T299独立四文本及作者35/M1-M2；T345旧6ace独立63及作者T336组合runtime54、59/先红/M1–M4；T373原ba1a独立7/7和closing负控、作者旧catch/68文件。特别保留T345 6ace→4b曾改source-history提示的既有映射，不能说自6ace始终六blob全同。以上均不计本H实跑。

RAC-2827组合动态与RAC-2828待结算：一次最终准确H Full须从真实分片日志逐一核完整 `feed-content-ledger.test.ts`、`feed-runtime-plugin.test.ts`、`home-aggregate.test.ts` 的执行/结果及首败/retry/skip/cancel/bail；当前本机未跑，不预填旧case数。普通Verify、适用SI执行或skip原因、Full实际checkout parents/tree、二审及main采用由根核齐；event H不是运行树的替代。若有具体输入变更或实际覆盖缺口才定向补，当前不增加重复本机矩阵。

保留T345仅新建干净现行v1 Home适用、真实旧Home未处置；T373不关闭R63整项/不扩日志策略；历史Full首败、T381/T383 Linux因果UNKNOWN及产品/真实Home/本人验收边界。原三PR只有根在承载实际采用并逐成员回读后才能标由承载采用关闭，不称其自身merged。
