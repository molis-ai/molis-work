# T387 实质增量二审

结论：**准确H的实质增量二审通过，无Blocker/P1或当前必修项。** 作者最终REPORT/EVIDENCE-MAP与验证线3独立REPORT已齐并逐一核收，原件与结论相符。通过范围为实际合成、旧证据适用性和本地工程；新组合动态及最终Full/CI/SI/采用仍待根，不预签。二审线5仅只读，作者开发线1、验证线3分别保留来源。

accepted WO：`coordination/2026-10-28/tasks/T-387.md`（含末节共享hunk交接）。M=`6729a2d4655caa603daa369f99884e09c4726bde`；H=`3862de92dee5683543fef60d669750053562e330`；tree=`92a84c126f0f1b0c6ac4a04d65921f4d78e03fa3`。当前作者树干净H。

**RAC-2826：实际合成通过。** Git实读正常三次merge父链，最终10路径+148/-123。逐成员独立复算原merge-base→原H与M→最终H相应路径的完整binary patch逐字相同，全部10个blob同原片；不是只比预测tree或patch-id。T299仅同一JSDoc移动；Feed三源码、两测试、v1 SQL夹具及FI-C-06/07说明按原片保留；聚合外层catch的code-only顺序、closing静默及父取消先抛保持。已采用M的34路径都保留，无回退T208/T381/T382/T383。根交的三共享文件仅成员自有hunk，T384/T116 renderer删除与T121账号/DELETE权限增量没有被带入，原PR只读边界吻合。

**调用与旧证据适用范围。** runtime-inputs列明的Feed动作/registration/plugin/application-ports/projection/contract、Host聚合端口/本人context/后台消费、contracts/SDK/Runtime/storage及根package/lock在M0→M和M→H均未变（后者不含自有修改文件）；本二审重读Git差集确认。Feed plugin-only回收command没有被接成home_aggregate只读查询，三片无新事务/权限/取消调用边。五个相关dist单元实际字节与各原候选保留产物相同，本线重算hash并直接比较字节成立。故旧有效动态可沿原来源/范围继承，不能改署为本H实跑；无需机械本机再跑三核心文件/旧矩阵或原变异。

**RAC-2827工程原件已核部分。** 作者整体build 131.74秒exit0；boundary含test-kit局部build、health --base准确M、test-import graph（0/1705混用）、diff、frozen-M secrets（148新增行）和page-assets均exit0。gates-result绑定H/tree/十blob及实际source digest=`ac7e726c1ba51c99c998b9f0fc71f69f8d682a1b2042663ab874ac1c97a2d7c7`，等matching manifest。作者新捕获48个实际Host asset响应，与保存的准确M基线逐项bytes和SHA相等，共7469195B，discoveryMisses=[]；本线独立解析两份资源捕获及基线副本校验成立。基线来自T146准确M原执行、经T385保留复用，不冒作T387重建M。无预算/ceiling更新、无增长许可。

原始build/gates与environment/run.py显示公共build槽、显式公共slot目录、隔离系统HOME/CFFIXED/XDG/TMP、file后端/ad-hoc；Foundation Home/Library等隔离而NSTemporaryDirectory仍系统路径，不签全原生隔离。cleanup及preflight记录无打开自有路径/存活自有进程，九任务目录本线实查均不存在；作者tree/build保留且源码干净。本线未运行任何build/test或重新测Host。

**仍待外部结算。** 三核心完整文件`feed-content-ledger`、`feed-runtime-plugin`、`home-aggregate`留最终准确组合Full核真实执行、结果和首败/retry/skip，当前没有本H新业务动态；旧Full不替该项。作者当前secrets只是对冻结M扫描，推前fresh fetch后检查仍由根执行。RAC-2828的准确H Verify/适用SI/新Full/main实际采用及逐成员核账均未签。T345只对现行DDL新建干净v1 Home，真实旧Home没有迁移/重建/清理结论；T373不闭R63整体、不承诺同轮两条Host日志；历史失败/UNKNOWN和延期边界不销账。以上不是追加本地测试要求。

终核增量：已全文读`/private/tmp/t387-evidence/REPORT.md`、`EVIDENCE-MAP.md`及`/private/tmp/t387-verify/REPORT.md`、checks.json/check.py。独立线实质核对十patch/blob、五编译单元、运行依赖、源码digest和48资源响应，未build/test或改署旧动态；同本二审复算一致。M资源来源原件还核到detached准确6729参考树创建与整体build、T146报告的基线捕获说明；`final6729-binding.json`本身是T146候选N绑定，不把它单独冒作M采集绑定，M来源依创建/build/capture/报告链核收。资源采集是matching built路由处理器返回体，不是启动真实HTTP服务的产品实操。

RAC-2826通过；RAC-2827的本地构建/门禁/资源和沿用条件通过、三完整文件的新组合动态待Full；RAC-2828仍待根外部结算。没有理由追加本机三文件重跑、旧矩阵/负控或虚构跨模块组合用例。本报告不要求作者再改代码/文档；共享窗口按WO由根串行交还，不因本二审自动释放其他writer。

本二审仅写本报告；只读Git、源码、保存日志/产物并做差分/hash计算，没有运行测试/构建、启动Host/浏览器、写GH/coord/refs/作者树或操作真实Home。
