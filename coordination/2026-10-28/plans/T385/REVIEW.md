# T346 + T347 普通 storage 承载方案独立审阅

结论：**可以采用仅两片、一个普通承载 PR、共同最终 H 一次 Full 的方向；发给 writer 前须修正下面两处方案文字。** 未发现须拆开两次 Full 的生产调用/状态冲突，也没有理由借承载增加第三项产品修复。当前仅方案审阅，不等于授权合成或已验证最终产物。本线未运行 build/test/浏览器/Full、未访问 GH、未改原头或产品。

当前必须修改的只有两点：

1. [PLAN.md:20](/private/tmp/storage-pair-carrier/PLAN.md:20) 将 T346 的“bytes/mode/旁文件不变”收窄到已证的模式。准确 `815d6e11b:tests/storage-baseline.test.ts:67–70,202–204` 明确：DELETE journal 夹具验证数据库字节、权限及目录不变；WAL 用例验证数据库与已有 WAL 业务页不变，readOnly 打开可触及 SHM 锁字节，干净关闭的 WAL 库还可能出现空 WAL/SHM。776 可写崩溃恢复的例外也继续保留。不要把拒绝保证写成所有日志模式的旁文件一律不动；这是证据边界修正，不要求改产品或补跑。
2. [PLAN.md:31](/private/tmp/storage-pair-carrier/PLAN.md:31) 的 `home-backup-recovery.test.ts` 不证明“备份读取两类数据”。固定 `328d5b612` 的完整文件只用离线目录复制，回读 Project、Goal 历史与 Artifact 版本，没有创建、读取或断言 vault/原密钥。该文件可因 storage README 的既定必跑要求保留，但用途应改为上述实际范围，不能声称已有同时经过两条拒绝路径的备份测试。本次没有发现两条链新增耦合，**不要求为了修这句再新增快照用例或合成故障矩阵**。

亲读 accepted T-346/T-347、当前准确 scoped diff 与原审验后，两片边界成立：T346 `815d6e11be8f8ae28631183a90cfcdd2b352c6e4` 对其 M 为八路径；T347 `170777c2a8c61257e7e840afc0ebfcadd382efcb` 对其 M 为两路径，路径交集为零。已知准备 main `328d5b612ef47214378ecd55e32a648228c120f3` 对3fd只增加 goals-dialogs测试变更，未改变这些 storage 接缝。T383采用后的实际 M仍需由根冻结；预测 tree 不能代替最终 H 的验证。

T346改 `openBaselineHomeSqlite` 的只读版本/结构预检，以及公开 `applySqliteBaseline` 的同版本结构拒绝；Home plugin store只映射自己库的结构错误。T347在自己的 `withSecretsLock` 内、load后save前检查 vault封条；锁用独立 `new DatabaseSync(secrets.lock.sqlite) → BEGIN IMMEDIATE`，没有调用 baseline wrapper。新增结构拒绝不参与密钥派生或vault锁事务，新封条检查也不调用Home基线开库；两者没有新增互锁、共享事务、失败恢复调用边或处理顺序依赖。共同storage入口、Host装配和CI回归属于合成产物的验证面，不能夸成两个故障点已在同一业务调用中串联。

安全与恢复范围也保持：T346不升级schema/version，普通不匹配拒绝，776只交SQLite恢复后再完整校验；T347保持seal/open、master与Keychain算法，仅对获批的读/写/删除端口拒坏结构，坏目标删除可恢复、其他坏项不可被带入新文件。认证失败及前缀删除的延期范围不随承载改变。vault零写只指secrets.json，不能包括独立mutex库。没有必要重开已接受的这些产品取舍。

计划六个完整文件可作为当前最小组合批：storage-baseline、home-store-baselines、secret-store-format、security-invariants-secret-snapshot、secret-store-missing-key、home-backup-recovery。它们分别覆盖两片实际拒绝/正控/恢复、Home基线消费者、快照认证和缺原key拒绝；不需要人为串接不存在的调用边。README确有15个必跑文件，计划保留另9项逐一核抵、无有效同范围证据则补完整文件的条件是必要的；发执行清单时应兑现该逐项对照，不能把“六个最小文件”当成包要求豁免。原十一成对文件已增加的case、Node/锁/fixture或schema真实变动按具体差异补证，不重跑旧223批来解释历史UNKNOWN。

原审验沿用范围可接受：[T346最终二审](/private/tmp/t346-final-second/REPORT.md)的原B/H各116例、核心776证据；[当前T346增量核收](/private/tmp/t346-current-sync/VERIFY.md)的补丁/构建边界；[T347独立10例](/private/tmp/t347-shape-verify/REPORT.md)与[形状修复二审](/private/tmp/t347-shape-second/REPORT.md)、[当前同步二审](/private/tmp/t347-current-second/REPORT.md)。这些保持原准确输入和执行者，不冒称新承载运行；旧223、T347旧Full失败与未证归因继续留账。

一次普通PR Full的收益是对唯一最终共享核心合成产物集中构建/回归，减少重复成本；此处没有额外不可解释风险抵消收益。最终仍须准确 M/H逐片内容核对、matching build、必要门禁/README范围、Verify、Full及适用SI分项结算。SI是否构成§8门槛按实际改动与根现行规则，不用Full代签；资源零增量只是假设，须实际served对照M确认。若合成出现新生产冲突或两条存储链真实耦合，先回根界定，当前方案没有授权补第三项修复。T383 CI和T384独立运行保持既有安排；原PR只在承载实际采用并回读main后映射关闭，不称原PR自身merged。

接续核收：已亲读修订 PLAN 与 [T-385任务书草案](/private/tmp/storage-pair-carrier/T-385.md)。两项必修均落实：DELETE/WAL/SHM/776保证分别表述；home-backup仅署Project/Goal/Artifact离线恢复，不署vault/原key，也未增矩阵。执行合同明确甲档无一审、开发线1/验证线1/二审线4，RAC-2820～2822；仅十路径、六完整文件与另九项逐项核抵、T383实际采用后冻结M、同最终H一次Full/适用SI及采用回读均保留。任务书层无新增必修，可交根注册与放行；本线保留T385独立二审owner。该结论仅核修订及执行合同，未重做方案审或授权实际执行。
