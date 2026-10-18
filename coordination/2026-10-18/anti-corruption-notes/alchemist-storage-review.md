# Alchemist 存储方案独立复查（负责人：reviewer）

结论：不推荐将 P1a 的 borrowedSql 接口作为迁移前置落地。它把马上要删除的 driver 形状跨包公开，并新增 Host 的 Alchemist 专用装配，而没有兑现 PluginDatabase 的授权/事务边界。真实关闭缺口值得先修，但可以直接在现生命周期上闭合，不需要先移动数据库归属。随后应按生产提交边界直接迁到最终 PluginDatabase 合同；可以分实现提交，不能交付两个生产存储协议或把 P1a 称 Runtime 迁移。

只读核对：D/alchemist-storage-plan.md 与 wt-alchemist-runtime / 8e0152907 的实际 startup、actor invoker、worker、SQL事务、Host eviction、搜索shutdown及数据库服务。未写代码/spec、安装/构建/Chrome/测试。以下为代码可证明的风险，不借方案作者的数量作为必要性证明。

## 1. 当前必须处理的风险

### P1：关闭没有等待前台调用，现方案只加 whenIdle 仍须补停止后的效果检查

`bootstrap/actor-actions.ts` 的 actionsInFlight 只计count供idle读取；`local-runtime.ts:306` close设closed、stop worker，仅await draining和worker.whenIdle，随后finally database.close。actionsFor发出的前台conversation可停在generateStructured等待；它不计入worker。`conversation-message.ts` 在await模型后会再次调用beforeEffect再写成功或失败回复，但原control没有自动加入此studio.closed检查；bindAlchemistActor只在调用入口检查closed。因此直接runtime关闭/嵌入路径或仍有效的原caller，可能在close返回后接触已关闭数据库。Host删除路径的外层项目权限拒绝可能挡住部分写，不可把它当通用runtime关闭保证。

最小修复：关闭先拒绝新接纳，等待现有前台track归零及worker真正settled后才关DB；给现前台执行控制组合本studio停止信号/closed同步检查，后续成功/失败效果均拒绝，不在close期间继续记失败。需覆盖曾取得actionsFor后才invoke的延迟调用；track包裹整个异步调用并finally减计数。runtime.actions/app是现有直接嵌入入口，明确它们是否可在生产使用：可用就也纳入同一接纳/排空，不以只追踪actionsFor便宣称所有前台排空。不要等待自己尚未结束的close调用造成重入死锁；关闭由外部Host发起，重复close共享当次等待。

### P1：失败关闭后资源被遗忘，计划的“重试同一关闭”尚未闭合

`alchemist-service-host.ts` 的evict/close在finally中无论runtime/search关闭是否成功都删除studios entry。deleteProject的首次rm会因await拒绝而跳过，但下次clear看到entry不存在，直接rm目录；仍存活的搜索/连接不再能被定位。`alchemist-search.ts` shutdown和local-runtime.close还都缓存 `closing ??= promise`，失败后同对象重试只拿到同一rejected promise。仅保留entry、再次await它不能恢复。

最小闭合必须同时包括：
- closing期间所有owner entries撤下，process studios保留这个资源对象，get不能重开；runtime和search都尝试收尾，只有确认全部释放才删entry再rm。
- 每个资源区分“本次正在关闭promise”“已成功关闭”与“失败仍有待清理”；失败不永久缓存rejected promise，重试只重做未完成部分，不启动worker、不重复关闭已确认关闭的连接。运行任务失败不等于连接未关闭，结果需准确记录，避免其实释放成功却永远卡pending。
- Host.close当前先 `this.closed=true`，注册owner的alive是 `!this.closed`。若仍有失败/等待清理资源，它会被ProjectDeletedHooks移出，离线owner可能直接rm；在真实资源未释放前，清理owner必须继续存活或交接给仍持有同资源的可信owner。不能只在map留对象却让删除路由绕过它。
- idle sweep是 `void this.evict(...)`，失败也要有被处理的失败状态/诊断和可重试入口，不能产生未处理拒绝或让同目录重开。

原计划的三个交错方向有价值，但失败重试测试必须击中真实缓存层（搜索shutdown失败且资源仍待释放），不能只wrapper第一次throw、第二次调用一个其实早已关闭的对象然后声称重试完成。

## 2. borrowedSql 为什么不是必要层

`Pick<SqliteDatabase,'prepare'|'transaction'>` 仍是better-sqlite3 driver协议。prepare返回的Statement有 `database: Database`（实际本机 @types/better-sqlite3 index.d.ts:10），拿到statement即可拿回close/pragma；transaction又有嵌套/.immediate等driver语义。因此“只绑定两个函数就移除close/path能力”不成立。可信native代码本来不是JS沙箱，没必要为了虚假的能力收窄再包一轮statement facade。

新增openAlchemistStudioDatabase与Host baseline拼装只把open/close搬位置，业务139处prepare及提交授权仍未变，下一片全要重做。它还会增加包外引用Alchemist的Host文件/导出面，可能触当前只许减少的结构门禁；不能为了临时层调大基线。修当前close问题保留现openDatabase与baseline即可；最终转换才一次移走开库责任。

## 3. 直接接最终数据库的真实依赖与可分步做法

现PluginDatabaseTransaction的get/all/run可承接业务SQL，但其transaction是await原授权后同步BEGIN IMMEDIATE/COMMIT，不能用类型断言塞给旧同步工厂。正确颗粒是“一个同步提交及其所有repo写”，不是“每个prepare一个await”，也不是“整个含模型handler一个大事务”。

真正遗漏的前置是**项目分库装配**：Alchemist路径为 `alchemist/projects/<encoded-id>/studio.sqlite`，而现openPluginDatabase只接受单段store_name并开Home登记的单库，assertDatabaseEntries还要求对应store.library；alchemist当前只是Home目录登记。直接填store_name=alchemist不能保持现分项目事实，不能新建一份alchemist.db后称迁好了。最终实现需在已有可信数据库owner装配处支持本项目既有文件位置，身份从Host项目context，基线仍插件声明；不得把任意路径开放给Manifest/action。该窄扩展由root明确，而非新增Alchemist专用借用SQL协议掩盖。

推荐同一最终方向下分提交：
1. 最终数据库的可信项目分库装配与生命周期（上述根路径保持；无业务Repo迁移的双轨运行）；公开client仍PluginDatabase。
2. Repositories改只依赖 `PluginDatabaseReader` 或收到的 `PluginDatabaseTransaction`；写入口显式收tx。同一个tx沿业务服务→jobs→repository向下传，内层不再开启异步事务。独立调用也由其外层提交者创建tx，不做“有tx用新、没tx走旧driver”的兼容分支。
3. 初始化async ready在发布provider/开始worker之前完成seed身份、默认设置、pulse默认源和recoverExpired；这些是可信启动维护，不伪造用户caller，也不通过公开无授权no-op beforeEffect给任意业务写放行。每次actor登记的现写入在自己的已授权提交内保持，query当前也登记actor这点需明确而非漏掉。
4. 同步命令改一层await transaction；模型/网络动作每个现有前后写边界单独await授权提交。worker claim/renew/saveCheckpoint/commit/finish/recoverExpired改顶层async、同步tx叶子，所有handler调用点一起await；lease检查与业务写必须在同一个tx，不能check后另开事务。重启queued/running恢复不在本片偷偷改变；恢复worker的可信权限来源须由root沿现授权合同写清，不能把lease当完整用户授权。
5. 在这些生产路径完整后，原开库/SQL driver类型/专用Host存储胶水一次删除。内部中间提交可供review，不能先发布半数动作新tx、半数旧prepare同库竞争的生产状态。

## 4. 嵌套事务与只读快照：实际语义

已逐链核对：createExploration外层→createRun+jobs.enqueue内层；startLensRun outer immediate→enqueue immediate→createRun；cancelLensRun外层→jobs.cancel，catch只把错误换为owner错误后**仍向外throw**，不会吞失败继续提交；worker.commit→withLease→saveResult/saveReport；finish→withLease。对这些路径，内层异常传到外层整体回滚，显式共享同一tx可以保持原子性，不必为了形式保留nested savepoint API。

迁移每个其他嵌套入口仍应检查是否有catch后继续；本复查没有证明所有24处都可机械删事务。现plan对此保守合理，但不能由“可能有”推出必须实现新的通用savepoint层。最关键故障回归是在enqueue写job/event之后让业务run保存失败，断言job/event/run都回滚且下一次成功；以及worker保存report多表中途失败、lease不属于自己时零业务写。

`readEvents` 现在事务里require job再list events，确需同一快照，但**不因此必需公共readTransaction**：可用一个SELECT从jobs LEFT JOIN job_events（sequence条件放ON）同时返回job状态与事件。无事件仍一行job+null event、无job无行保原not-found；按sequence排序，cursor仍afterSequence或最后事件序号。单SQLite语句已有一致快照。这是本例更小且能直接用PluginDatabaseReader.all的选择，不增加公共API。

## 5. 推荐第一片及验收

推荐第一片是 **ALC关闭/删除生命周期完整修复**，范围为现local-runtime、actor-actions、必要执行控制组合、alchemist-service-host、alchemist-search和真实生命周期/删除测试。保持现库owner及driver，不导出borrowedSql、不搬baseline、不新增Host开库文件、不改job恢复政策。这片有独立用户价值且是最终Runtime停用/删除仍需的机制，不会下一片被全部扔掉。

验收：
- 真实前台模型阻塞+并发close/delete：未排空前连接不关；关闭后所有新接纳拒绝；旧请求迟到成功/失败均无业务写；释放后两资源结束，再删除回执完成。
- 搜索真实关闭失败一次、保持待清理资源，首次receipt pending、目录还在、get不重开；第二次仅重试未完成释放，complete后目录删除；另一个项目继续工作；Host.closed时也不能绕到离线rm。
- 保留worker等待/取消、idle关闭窗口、固定id重建与queued/running重启用例。新测试必须观察状态/文件/第二次调用，不能只assert reject。

若root坚持第一片就是“迁到PluginDatabase”，最小完整范围应包括第3节的项目分库装配、startup、所有生产写边界和worker回调传递，规模确实比构造函数替换大；直接按该范围做，不以临时borrowedSql分散必要工作。

实施后验证建议仍用现 tests/alchemist-host-lifecycle.test.ts、alchemist-studio-idle.test.ts、project-deletion-studios.test.ts、alchemist-runtime.test.ts、alchemist-worker-process.test.ts，加包README必跑；本报告未运行这些测试。源码结构/资源/公开export与ALC spec由root决定，不自行扩大实现。
