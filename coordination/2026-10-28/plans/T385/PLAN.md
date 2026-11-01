# T346 + T347 普通 storage 承载候选

状态：2026-10-31 PDT，只读吞吐准备。**建议可以两片合成、一个普通PR、同一最终H跑一次Full；没有发现分开跑更能隔离风险的实际语义冲突。** 未建writer树、未运行构建/测试、未访问GH、未改原PR或协调文件。根决定scope和执行窗口；T383实际采用后以准确main重冻，当前T384独立执行树保持原任务。不纳T299/T373/T345/T146或保护PR。

## 准确输入和静态预测

| 原片 | 准确H | 自有范围 |
| --- | --- | --- |
| T346 #1664 | `815d6e11be8f8ae28631183a90cfcdd2b352c6e4` | 8文件+262/−17：`packages/storage/src/sqlite-baseline.ts`、storage `src/index.ts`/README，`apps/local-host/src/home-plugin-store.ts`，`tests/storage-baseline.test.ts`，CHECKLIST/CALL-CHAINS，error-owners.json |
| T347 #1665 | `170777c2a8c61257e7e840afc0ebfcadd382efcb` | 2文件+124/−4：`packages/storage/src/adapters/file-secret-store.ts`、`tests/secret-store-format.test.ts` |

本轮Git对象核头，未把merge提交自身的大量main带入差异当成本片代码。对已知main `328d5b612ef47214378ecd55e32a648228c120f3`，临时对象库先merge-tree T346、用临时双亲对象再merge-tree T347，exit0，预测tree=`76ec855f96c195ce078f4725e3b7c03b305be9cc`，10文件+386/−21；无文本冲突、自有路径交集0。临时对象写在 `/private/tmp/next-carrier-plan/git`，原树/index/refs不动。这不是未来最终H，T383或新main的实际差集仍要重核；不能拿此树签任何运行。

## 真正的storage接缝与安全语义

T346链：`openBaselineHomeSqlite` → `inspectSqliteBaseline` 用readOnly连接核version/基线表结构 → 允许时 `openHomeSqliteDatabase` 可写开库 → `applyBaseline`；hot journal `SQLITE_READONLY_ROLLBACK=776`转可写SQLite崩溃恢复，再完整核版本/结构。`home-plugin-store.ts`仅将同版本结构不符映射为该store现有拒绝；新错误owner路径是sqlite-baseline。基线version/schema不变，不做迁移；八处直接 `openHomeSqliteDatabase→applySqliteBaseline` 不被夸成已获先只读保证。

T347链：file vault读/写/快照的SealedV2结构检查一致；写在 `withSecretsLock` 内load后、save前拒坏条目。mutex直接 `new DatabaseSync(secrets.lock.sqlite)`＋BEGIN IMMEDIATE，不经过T346的baseline wrapper；`file-secret-store.ts`无openBaseline/applySqlite/openHomeSqlite调用。密钥文件与vault不是Home业务baseline表，两个改动没有新增嵌套锁、共用事务、key派生或版本检查依赖。二者共用storage包入口、node:sqlite和最终Host启动/备份消费者，故需要一个组合build及相关完整文件，合成Full也比各自绿更能观察共用消费者。

拒绝保证必须分清：T346的DELETE journal夹具验证数据库bytes、mode及目录不变；WAL用例验证数据库和已有WAL业务页不变，readOnly打开可能触及SHM锁字节，干净关闭的WAL库也可能出现空WAL/SHM，不能概括所有日志模式旁文件一律不动。776允许可写SQLite崩溃恢复后再完整核版本/结构，不声称所有崩溃库零字节变化。T347拒绝坏vault条目时secrets.json原字节不变，mutex锁库本身可以有事务活动，不升级成整个Home无文件写。`delete`仅允许删坏目标而其余坏条目仍拒；前缀删除入口及结构完整但认证失败仍是原批准的后续边界，不借承载补功能。无真实Home、Keychain、账号、真模型操作。

## 原审验沿用

- T346 [最终二审](/private/tmp/t346-final-second/REPORT.md)：准确旧H `b4f7e598…`无必修，B/H十一完整文件各116/116（真实签名安装、Home/project/CLI/信任等）；核心storage-baseline及776证据按各自来源保留。旧223历史失败/UNKNOWN不倒填。当前815同步的[REPORT](/private/tmp/t346-current-sync/REPORT.md)核8路径补丁保持，7blob同旧H，CALL-CHAINS只自动合main另一处；匹配build/必要门禁/48资源零增量通过，但不是这11文件在新H重跑。
- T347 [独立验证](/private/tmp/t347-shape-verify/REPORT.md)在旧修复H `a8608b3e…`完整secret-store-format与security-invariants-secret-snapshot各5/5，共10/10，无skip/retry；[二审](/private/tmp/t347-shape-second/REPORT.md)关缺IV/tag P1并保认证失败/前缀删除边界。当前170同步的[REPORT](/private/tmp/t347-current-sync/REPORT.md)核两blob及完整binary patch原样、build/门禁/资源零增量；旧M/35和Full失败仍属原输入。当前BOARD称两片增量审验已核，不等于新Full或实际采用。

最终组合上逐片scoped patch-id/文件blob相同，原审验未变范围可沿；新main若改变storage、Node/依赖、Home store schema或这些测试/fixture，明确具体差异后补对应证据，不靠“同一包”要求重跑旧223/116矩阵。原PR/作者树全程只读，唯一writer只负责新承载合成和必要的实际冲突；发现必须改生产语义先交根界定，不在承载分支堆第三项修复。

## 最小新增完整文件与门禁

根交唯一writer后，从T383已采用的准确M正常merge两H，核10路径、原schema/key算法/错误码、文案及error-owner行；整体 `pnpm build` 使用公共槽。组合最低完整批（jobs1/retries0、隔离系统Home/file backend）是 `tests/storage-baseline.test.ts`、`tests/home-store-baselines.test.ts`、`tests/secret-store-format.test.ts`、`tests/security-invariants-secret-snapshot.test.ts`、`tests/secret-store-missing-key.test.ts`、`tests/home-backup-recovery.test.ts`：分别核只读拒绝/776、Host基线消费者、坏封条锁内拒写/删坏目标恢复、snapshot认证、缺key不替换，以及离线目录复制后Project/Goal历史/Artifact版本回读。home-backup不创建或读取vault/原密钥，不能当两类拒绝链串联证据；保留该文件是storage README要求。无需新增快照用例或合成故障矩阵。

现行storage README必跑15文件要求保留：对未列在上述六文件的其余9项，按原准确运行＋输入不变逐项核抵，缺有效同范围证据才补完整文件；不能以此六文件豁免包要求，也不无差别重演所有旧Home/macOS批。原十一成对文件在新main增加的case不能冒领旧116；若新增case涉及当前storage输入则补其完整文件，其他由准确Full覆盖。原有有效负控与红绿不机械重做，出现拒绝语义疑点再定点注入。

核boundary、merge-base health、test-import graph、error-owner现行规则、`git diff --check`、推前fresh fetch后的secrets。两原片均已声明 `full=true`，storage共享核心不可降级；承载最终H必须新Full。两片未改 SECURITY-INVARIANTS 表或安全前缀测试（snapshot文件只是运行），因此不凭空新增§8安全作业门槛；实际CI若选择SI或根要求该作业，核准确H实际执行/skip和终态，不把Full替SI。若新main合成不得不改安全登记/测试，则按真实diff提升适用SI要求。

资源预计**零增量、无新资源、无小额许可申请**。最终匹配build对准确M实际served48项bytes/hash核等价；若资源有差异先定位装配/主干输入，不把storage承载当资源窗顺手放行。新增公开导出是storage内部包的结构错误判别函数，原T346范围保留；不改contracts/动作/Manifest/schema版本，不机械刷新API/actions来吞差异。

## 普通PR一次Full和采用核账

仅新普通 `feature/*` 承载PR作为落地对象。根核最终H的逐片等价/组合验证/二审，Verify绿且Full入场条件齐后，按README§9给该PR一次full-suite（普通最多6runner）；不建integration镜像、不与当前T384或其他排程抢槽，不触发/取消任何CI。本稿没有查询当前Full/CI活跃态，启动前由根fresh核。保留事件H与实际checkout parents/tree；必须含已采用T383/T377及其余相关修复，不能用旧PR的合成ref推断。失败/retry/skip/UNKNOWN按实际文件记录；Full失败先归因到具体改动，不因同属storage互相补偿。

§8只对承载最终H结算Verify、验证/二审、Full、适用SI与未答问题；单次Full不倒签两原H。实际采用后根回读main，按10路径逐成员blob/patch-id/错误owner/文案比承载前M与两原自有patch，确认无丢失或额外变更，再将#1664/#1665标“由承载采用”并依根流程关闭，原负责人和证据出处保留，不称原PR自身merged。未解释差异保持对应任务open。旧223、旧T347 Full失败及已观察上游UNKNOWN原样留账；不宣称真实Home/产品/用户验收完成。

若最终新M使两片的开库/锁事务或snapshot路径出现实际耦合且无法按上述六文件低成本验证，根据具体差异保持单片；目前读到的生产链不支持仅因敏感storage就各跑一次Full，也没有证据需要新工作项。
