# T299 / T345 / T373 普通 feature PR 合载只读准备

负责人：一审线2；2026-10-31。状态：只读方案完成，**未授权实施/建分支/推送/排Full**，三原PR仍只读。本方案不占新任务号或RAC。

**建议三片合载。** 在指定已采用M上可无冲突组成一个普通`feature/*`承载PR，10文件、+148/−123；六种合并顺序得到同一tree，所有原片自有blob与逐行补丁均保留。与最值得比较的T345+T373双片相比，加入T299仅多1个JSDoc文件/+10−9，不增加业务/资源改动或完整测试文件。当前没有发现合载新增的必修修复或产品裁定；一个最终准确头Full可以覆盖这份组合，但尚未运行，旧三个头的CI/审验不得改署成该组合实跑。

## 冻结依据与预测

M=`6729a2d4655caa603daa369f99884e09c4726bde`，tree=`5df7692e7cf4affb0ca1942e8c1cf9ee29497066`，T383实际采用。共同旧main基点M0=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`。

| 来源 | 本轮Git与GitHub直接回读准确H | 路径/资格 |
| --- | --- | --- |
| T299 #1671 | `afbcdaad6fe879a0feb99e9276ed01d960348e11` | 1路径，丙档、无一审；最新独立验证6551895233/二审6551895961核收。正式full=true沿6548760051，不能用原任务预计false降级。 |
| T345 #1663 | `4e6055767a77a0129c153c07b1cd0a4de1a524ab` | 7路径；最新一审FIRST、验证VERIFY与二审SECOND及根6551893604/6551894618核收；新建干净v1 Home前提保留。 |
| T373 #1700 | `c52dcc200ad706d48fe693c59a67c9e9736c60a2` | 2路径；最新VERIFY/SECOND与根6551896559/6551897666核收；两阶段code-only输出，不关闭R63整项。 |

上述三PR均OPEN、未merged、实际远端H与给定值相同。已读三个`/private/tmp/t*-current-sync`的REPORT及现存FIRST/VERIFY/SECOND、保存diff与真实Git diff，并读协调HEAD=`f3c92e08f9ca4fcd6c01be3f796174c48549d3ca`的三任务书。早先同步/20点档案仅作沿用来源，不作当前tree/CI状态。任务书状态行落后于最新根评论时，以准确头新审验限定现状。Memory搜索无相关命中，不依赖旧记忆。

M0→M只有已采用T208、T381、T382、T383四项结果（34路径）；与三片全部10路径交集为空。特别保留T381 goals-dialogs、T383 pages-actions两测试修复，T382 Artifact HTTP命名和T208图片整字修复；不将旧Full首败因为main已有修复就倒填成旧运行通过。

模拟仅用`TemporaryDirectory`中的私有Git对象库、主objects只读alternates；merge-tree后为下一次预测创建的commit对象也只在临时库，无共享refs/索引/工作树变化。结束临时对象已删除。以下tree是静态预测标识，不是已创建的可发布分支或测试结果：

| 组合 | 预测tree | diff对M | 成本判断 |
| --- | --- | --- | --- |
| T299+T345 | `9fe525ed00ba21fe2dc2436fc55924242b80f13d` | 8文件、+55/−122 | 留下T373单独排Full，减少收益较小 |
| T299+T373 | `584386966f9cf2f40e4318ae2c08b5e52a074bfd` | 3文件、+103/−10 | 不含DDL；仅当根有意暂留Feed采用时才有实际边界价值，本轮未发现必须这样拆的阻塞 |
| T345+T373 | `21c5012b8ddc6979beaee50204041246a6aaaf84` | 9文件、+138/−114 | 两项业务最小双片；但T299仍需自己的full=true处置 |
| **三片** | **`92a84c126f0f1b0c6ac4a04d65921f4d78e03fa3`** | **10文件、+148/−123** | 推荐；六种顺序均相同，无文本/rename冲突，全部原blob及自有增删行相同 |

## 路径、hunk与语义交点

三片路径两两交集为0，没有需手工解释的冲突解法。下面行号是相对M0/原片的统一零上下文diff定位；M在这些路径无变化，因此也适用于本次预测，不能仅凭没有冲突就跳过真实合成后核对。

| 片 | 精确路径与主要hunk | 行为边界 |
| --- | --- | --- |
| T299 | `apps/workbench/src/immersive-shell.ts`：旧91–99移除JSDoc，105附近原文插入；共2 hunk | “The person's entries…”移到dependentPlugins之后、既有Host chrome说明之前；非注释代码与注释原文不变，无客户端或运行态变化。 |
| T345 | `plugins/native/feed/src/content-ledger.ts`：23/33/58–64删除meta表、COMPLETE、isComplete/markComplete，77–98删除reclaim/release完整标记闸门；`home-plugin.ts`：17–28仅保database依赖，删除安装目录/维护等待；`source-history.ts`：36–57删除ledger-incomplete中断、complete只表示forget是否可做，74与136同步含义/文案 | Home正文引用账从创建就完整，按真实hold引用回收；不是取消beforeEffect/事务/批次/引用计数，也不是旧库兼容或数据迁移。 |
| T345配套 | `specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md`270、534–535；`tests/feed-content-ledger.test.ts`原14–321相关11hunk；`tests/feed-runtime-plugin.test.ts`48–1338相关9hunk；`tests/fixtures/feed-content-home-v1.sql`删除第10行meta表 | FI-C-06/07恢复约束保留；删维护等待的旧断言、补RAC2718，生产v1 DDL与夹具同步。原7路径共39hunk。 |
| T373 | `apps/local-host/src/home-aggregate.ts`108单行改3行；`tests/home-aggregate.test.ts`62后新增90行 | 第二阶段普通失败保catalogIssue并按顺序拼当前code-only issue；closing静默与父取消同一reason保持；B项目成功结果不丢。 |

真实调用链接缝已按冻结对象核：

- **Feed写链**：登记`registration.runtime`的Home半实例→`createFeedHomePlugin`→context.services.database事务与evidenceCollector→content-ledger handlers。`holderOf`仍从可信plugin audience/calling_plugin_id/project_id取holder；三动作hold/release/reclaim@1保持plugin受众及feed:write/回收权限。项目`plugin.ts:123–128`的holdContent/releaseHistory经Home动作调用，source-history分批reclaim/最后release，再forget检索记录；清理异常仍使删除失败、保来源/引用供重试。没有把新complete含义传成跨库原子回滚保证。
- **聚合读链**：`homeAggregatePorts`→只读当前openProjects、withProject、actionClient、本人context与projectPluginReach→collectHomeAggregate。先目录读取、后2秒deadline下discover/invoke，caller保持query_only；本片只改外层失败结果。当前生产直接消费者是`home-background-tasks.ts:77`，它读HOME_BACKGROUND_TASKS_OUTPUT_TYPE并展平答案；issues交既有repeatingFailure，相同项目键可能只记首条日志。T373仍不承诺“返回两条issue就有两条Host日志”。
- **三片之间**：Feed Home半实例与聚合器同处Home/项目Runtime，但聚合只发现home_aggregate查询，不调用Feed的plugin-only正文回收command；Feed源历史删除不依赖本次issue拼接。T299只是服务端rail说明，未向这两链加入运行调用。因此没有新增事务/权限/关闭/取消调用边，不能为了“组合”造一个把ledger失败注入aggregate的假场景。

M0→M再次核查：Feed content-ledger-actions/plugin/application-ports/projection/contract/index/registration/manifest，Host project-host/local-web-actions/local-owner-permissions/home-background-tasks，以及contracts/SDK/storage、根package/lock均未变化。Host index的变化仅T382的Artifact库HTTP出口改名，聚合出口及调用入口未变。结论限这些真实接缝，不宣称全Host或所有运行依赖不变。

## 沿用与最小完整文件覆盖

三片最终自有patch保持时，已有有效证据按准确头/执行者沿用：

- T299原四项文本检查、35文件、M1/M2保持各自原独立/作者来源；afbc的新匹配build/门禁/served48零delta已独立核收，不再重演四检查或35文件，不给丙档补源码一审。
- T345旧独立63/63绑定6ace原执行及已接受映射（ledger9+runtime54），前轮main/T336组合runtime54/54为作者执行；59文件、先红、M1–M4保持原来源。本H的三阶段增量审验只签同步与原件，不能称其新跑63/54。
- T373原ba1a独立完整7/7和closing负控6/7唯一RAC2780红保持独立来源；旧catch负控与68文件为作者来源。c52的编译产物同旧独立函数产物、build/门禁/served已核收；原生NSTemporaryDirectory仍系统路径、Corepack准备提示等限制保留，不夸大原生隔离或全程离线。

**最小核心完整文件集合只有三份**：`tests/feed-content-ledger.test.ts`、`tests/feed-runtime-plugin.test.ts`、`tests/home-aggregate.test.ts`。三片组合没有新的语义hunk/接缝疑点，因此不因换承载PR再强制本机重跑这三份或旧矩阵；它们应在**一次最终承载Full**的实际文件列表/结果中全部核到。按当前Git测试及相对fixture闭包只读检查，这三份没有runner的Darwin标记，不应被`--skip-macos-only`排除；最终仍以真实Full日志为准，不能只读到总绿。

两片若含T345，同样是两份Feed文件覆盖；含T373加home-aggregate；加入T299无需额外业务用例。因此T345+T373和三片的最小动态文件集合相同。原T373固定home-event-actions/home-events.e2e/home-plugin-platform等范围已有有效证据不机械本机再跑，新Full覆盖照实记录；不为本片新增浏览器矩阵、变异或Home/Keychain实验。

正式承载仍需自己的**匹配整体build、health --base最终main、boundary、test-import约束、diff/secret检查及实际served资源核对**，这些可由作者必要工程和准确头CI按既有规则核收。当前M资源预算为48项、**7469195B**，不是前轮7469175B；三片都未改预算/脚本/客户端资源，预期相对最终M零delta，但本轮没有构建或测量，不能把预算算术当实测。不新增资源许可、不抢T146视觉或T384资源写窗。

## 正式派单前条件及已知边界

这三项没有必须等T384或T385代码的直接依赖；仅只读协调任务可知T384是四片共享核心承载、T385是T346/T347 storage承载，本方案不进入它们的树、测试批或资源窗口，也不混入其中补丁。若它们先实际采用、main再前进，根需重新冻结M并核真实接缝/预算，不能拿本文tree直接背签更新组合。T146视觉不作为这三片的附加验收门。

已知真实限制是T345现行v1 DDL只面向新建干净Home；原真实旧Home没有由这些测试或本方案验证，禁止为了合载加迁移、compat、标记回填。T373不闭R63整项、不改日志策略。T299正式full=true仍须满足。没有据此发现需拆掉T345或重新产品裁定的矛盾。

若根采纳：先发同一承载的执行合同，明确三个accepted task与允许10路径、唯一writer、原三PR只读；从fresh确认的已采用main建立普通`feature/*`承载（本轮不建），只合这三原H，不拿原PR已有merge-main历史当自有代码，不创建integration分支。实际tree/每片patch保留、工程与增量独立审验结束后，根统一推送/建PR，并只在**一个最终准确H**安排普通Verify/适用SI及一次Full。Full须取证event H、实际checkout/tree、16片/aggregate、首败/retry/skip与上述三文件；旧Full/CI及本轮预测均不抵这次新运行。原三PR的最终关闭/替代与精确来源映射由根在实际采用后结算，不能先把三任务记完成。

除实际新M/合成差异或真实失败外，不新增工作项、可选测试、功能修复或重复矩阵。本轮输出仅本文件；没有build/test、修改共享refs/索引/作者树/GH/coord，也未读取真实Home/凭据、保护分支或T384/T385/T146工作树。
