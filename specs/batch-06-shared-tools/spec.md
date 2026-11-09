# 第 06 批成果固定、平台资料产生者与 SDK 公用工具

状态：独立合同预审及回修复核通过（2026-11-09）；设计通过不代表隔离证据已通过。N12 实现暂缓，可做隔离验证。Files 的设计前置可继续，数据切换与删除等 §3 的证据。设计维护由本批合同设计台负责，实现由第 06 批主会话分配。基线为 `batch/06` 的 `54a12642c`。

这是 [06-2](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-2) 与 [Files 退役](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-1) 的 S1 技术切片。原需求沿用 [审查台账 N12／N13／N15／N16](../../docs/reviews/adversarial-review-2026-11-01.md)、[项目资料 WMD §5–7](../product-flow-governance/workspace-and-materials-design.md) 和 [06 批 11-08 方案](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-plan-2026-11-08)。第 05 批公共资料合同已随 #1979 合入。本稿完成程度为**概念方案**，实施目标沿 06 批的合同、消费者切换、迁移回读、删除和完整体验验收。当前证据来自仓库代码与历史提交。

## 1. 使用结果和切片顺序

- 在文稿、表格、问卷或演示稿里固定当前版本，仍从原入口得到一份可打开的成果。发布提交和对象上的成果引用一致。中断恢复要保全已固定内容与后来的编辑。并发编辑、移动、撤权或取消时，失败落在原入口，用户可重读后按现有权限重试。
- 项目资料和 Coding 使用同一份文件树、阅读和选择能力。用户看到当前文件，也能固定一份全文或选区供 Diff、Text Stats 等使用。重开项目时旧引用仍可读，目录当前权限仍由现有入口判断。模型可按既有资料授权引用，人工浏览和固定独立于模型。阅读位置与临时浏览目录属于工作台界面。界面的定样与本人验收沿 WMD 和 06-1 走。
- S1 先审两份合同，各自解决阻塞。成果固定的存储决定单独卡住其四个消费者。平台资料生产和迁移可按 §3 继续预审。S3 与 S1 的共享核心由同一轨道接力。S5 在合同可用、UI 走查和旧数据回读条件具备时切换消费者。S6 在回读和切换都通过后删除 Files。全批一个 PR，合同最终头合审。

## 2. N12 成果固定合同

### 现状与边界

`services.artifacts.join(tx, write)` 已用于 Feed 的项目事务。Host 的 [plugin-transaction.ts](../../apps/local-host/src/plugin-transaction.ts) 以客户端和存活期识别事务，成果 owner 在同一项目连接内执行 `head/publish`、提交成果和事件。现有 [S-100 拒绝测试](../../tests/security-invariants-plugin-artifact-join.test.ts) 覆盖串行动作、错误事务、异步闭包、保存点回滚及撤权。

Dataset、Form、Pages、PPT 声明的是 `databases.home.project_rows`。项目实例有插件独立的 Home 库连接，多个项目共享这个库，行用 `project_id` 区分。成果仍在 `projects/<project_id>/molis-work.db`。插件现有流程依次写 pending、向成果库注册固定版本、更新原对象的固定引用。待处理记录包含原作者、源对象版本和快照。移走后回来时，用成果线最新版本与对象计数共同确定下一版本。Pages 恢复时只在原 Goal 关联未被后来编辑修改的情况下更新它。实现在四个插件的 `promote.ts`、`store.ts` 和 `database.ts`，并与各自复制、移动、删除和同步判断相连。

两类连接都默认 WAL，见 [plugin-database.ts](../../apps/local-host/src/plugin-database.ts) 与 [storage/sqlite.ts](../../packages/storage/src/sqlite.ts)。双事务有半提交窗口。WAL 下用 `ATTACH` 虽能处理同一进程里的拒绝与回滚，机器在 COMMIT 中断仍可只提交一个文件。现有 WAL、两个事实位置、所有旧 pending 恢复语义三项同时保留时，无法直接复用同库 `join` 达成跨库原子提交。[SQLite ATTACH](https://sqlite.org/lang_attach.html) · [SQLite 多文件提交](https://www.sqlite.org/atomiccommit.html#multi_file_commit)

### 存储选项与开工条件

| 路径 | 收益与代价 |
| --- | --- |
| **独立预审选 A 作隔离验证：Host 私有的多文件回滚日志事务** | 原表、位置和 DDL 可保留。以既有项目连接为磁盘 `main`，由 Host 用固定别名附加同一个 Home 的精确插件库。沿用成果 writer、项目事件、两库复制日志，以及已绑在该项目连接上的监督器。两份库使用支持 super-journal 的回滚日志和同步配置。把 journal 模式统一在库打开策略，连同升级、快照、备份和关闭一起核对，点击固定时沿用已核实的模式。项目库供所有插件使用，须证明并发读、两库锁顺序、异常恢复、同步和耗时可接受。 |
| B：将可固定的文档行与其依赖搬到项目库 | 一份 WAL 文件，复用 Feed 的提交边界。要搬四份数据、更新 project_rows／项目表声明、个人分区、移动／同步／复制和升级，且偏离本批保留 Home 行的决定。只在 A 因并发、封装或耐久性不成立且用户选择改范围时重新设计。 |
| C：由成果库接管跨库恢复日志 | 可以保留 WAL 与分库。要新增耐久状态、隔离半成品、恢复/清理权限规则和连续升级。重启后可自动补写的时机会碰 S-18，尤其是原调用已撤权的情形。本批取舍先审 A。 |

**当前实现 NO-GO，隔离验证可开。** A 须用实际 Node/SQLite 驱动和两个磁盘文件测固定、读取与同步交错、锁争用、从事务写入到 COMMIT 的进程中断及恢复。能区分半提交与双回滚才算覆盖，单测抛错后回滚只证明进程内路径。检查成果、业务行、事件和两个库的复制记录，以及下次打开与备份恢复的一致性。遇到崩溃侧车时先经 SQLite 完成两库恢复，再让升级快照工作。独立清理其中一个事务日志会破坏此边界。预审未发现用户要求必须沿用 WAL。若 A 在耐久性、并发、权限和真实成本上通过，由存储主人技术裁定，采用时同步 [Home 数据说明](../../docs/system/HOME-DATA.md) 与 [升级链的日志及快照说明](../upgrade-continuity/upgrade-chain-design.md)。真实 Home 的操作窗口另约。若 A 需要放宽授权、长期冻结访问或改变产品语义，回合同台处理具体阻塞。

旧 pending 首选从原有发布入口，由原作者在仍有权限时完成。候选启用前只读预检四库，覆盖本 Home 的项目行及个人分区，阻止新的旧式发布与最后一次预检发生竞态。只在未完成记录为零时切换，保留原列及现有表结构。非零时继续使用旧入口，保留快照和记录，报告需要恢复的对象。若确实要给非零存量做期限明确的续接，另定原作者与当前授权、已写固定版的一致性核对、版本升级和退出条件，先登记 `CONTRACT-CHANGES` 的「当前保留机制」并获准。后台升级无权发布或删掉待处理快照。删列仍须连续升级段。

### 拟议调用链与文件

1. 既有 `*.promote` 与 `*.artifacts.pin` 共用插件 owner 的发布实现。调用上下文给项目、原行为者、安装及世代。动作完成外部等待和 `beforeEffect()` 后，Host 才开始同步写事务。现有 join gate 拒绝串行动作，四个 `defineArtifactPinAction` 当前没有 `scheduling: "concurrent"`。合同预审应列出四个 pin 和实际 promote 的调度，若沿用该 gate，只调整需要它的动作并验证同对象并发及固定引用，不动其他 owner。
2. 保留 `artifacts.join(tx, write)`。新增的 Host 签发事务只为明确声明 `project_rows`、同 Home、同安装及世代的当前项目调用存在。普通 Home 事务继续服务原有路径，交给 join 时拒绝。Host 从已核实的库登记、空间、文件身份和现行版本导出附加目标，使用固定别名，在 `BEGIN` 前核实连接配置。连接、路径、别名和 SQL 都留在 Host。插件回调只持有可信 owner 声明导出的同步根行操作，按绑定的 `project_id + id` 读，按 `project_id + id + expected_version` 作 CAS，限定可更新列并校验正好一行。禁止修改项目键和主键。SQLite native authorizer 负责 schema、表和列，行边界由这个固定读写操作实现。回调与保存点同步，事务、writer 与行能力随回调失效。
3. 在同一事务读取根行与预期版本，通过现有项目库 writer 查 `head`。需核对原固定版时补 `readOwn`，使用同一权限和生产者规则。沿用 `nextPinnedVersion` 和现行版本、origin、移动后续号规则。插件生成自己的快照和名称，经根行 CAS 更新固定引用、时间、版本和 Pages 的 Goal 关联。成果、项目事件和现有复制日志与根行同一提交，通知在提交后发出。四个插件各自保有业务字段和快照定义。
4. 任一 guard、数据库写、成果类型或回调失败，回滚全部。在最终同步提交前再核原调用、安装、项目与授权。保持 `artifact_id/version/origin`、快照格式、现行错误码、归属、`recovered` 的恢复含义和版本比较。相同 `expected_version` 的竞争只能一条成功。异步重试后的正常发布按既有动作语义重新读取。
5. `relocate` 的五份业务移动仍归 Dataset、Form、Pages、PPT、Lingguang，跨分区的撤权回退由 placement 管。Home join 事务不能被当成位置移动入口。N22-06 的 `normalizeProjectId` 已合入 #1893。块③在固定切换后一次比较五个 `duplicate` 的子行、回执、来源和 id 语义，Coding 当前没有 `duplicate`。只有确认某段纯协议在五家确实相同时才共享。复制整体、表 SQL 和事务留 owner。块⑤对齐 §4，先复用已有共用合同，再检查仅命名、适配与文字工具的重复。

边界为 contracts `platform/plugin-artifacts.ts`、`platform/plugin-database.ts` 和确需对外的模块接口，成果 owner `modules/artifacts`，Host 的 `plugin-transaction.ts`、`plugin-database*.ts`、`plugin-artifact-join.ts`、`plugin-host-services.ts` 及 Storage 的受控事务实现，最后是四个插件的发布代码和相关复用者。按 A 的结论决定项目库的打开和关闭文件。公开类型由 `pnpm api:update` 生成快照。若调度、动作声明或形状变化，核对动作快照并记录现有页面、工作流、Agent 与 MCP 的影响。动作输入输出与版本号沿当前阶段原样使用。

## 3. Files 退役的系统产生者合同

### 注册、写入和读回

**一个平台登记和一个 Runtime 输出来源解析端口。** `system.materials` 是 `kind: "system"` 的受信任项目级动作提供方。登记是类型、输出、动作绑定及稳定签名的唯一来源。签名跨重启与产品升级稳定，只由构建内受信任声明取得，映射到现行 `producer_plugin_id`／`producer_binding_signature`。owner 比对登记 id、签名和个人归属。调用的权限与个人 owner 来自实际调用上下文，`audit_actor_id` 只用于署名。系统身份仅持有登记的过程项写能力，独立于插件生命周期、场景、订阅和 Home 授权。

同一登记使用 `process_items.produces` 现有形状及共享校验，声明集合、固定快照、固定选区的现行 type/schema 与 `files/before/after/selection` 四个输出端口，其中 before/after 共用快照类型。输出端口需要对应已声明类型，`projectTypeDeclared` 在当前项目同样比对真实登记和签名。现行插件授权及资产导入的 S-81 特例按各自边界继续工作。系统生产通过受限的过程项 owner 端口，严禁以新通用模块 API 接受调用者传来的 producer、项目或权限。

`horizontal/knowledge` 管 `workspace_file` 的可发现来源和读取形状。生产动作复用 05 的目录读取合同和工作区文件读服务。捕获请求限于目录身份、相对路径、先前读取的指纹、选区和声明的输出口。重新读原文，验证路径、项目权限、指纹、范围、内联大小。参考目录只授予读取，耗时读取使用 concurrent。文件树和正文走 `file_source` 的 entries/content，沿用同提供方、kind 匹配和 live action 权限；二进制预览保留既有来源信任和 MIME 白名单、字节上限、`nosniff`。工作区 Files 原有能力是文本预览，其他类型只有在获准的现行预览路径才给字节，前端文件扩展名或来源自报字段无法提权。

现有 `createPluginOutputsClient.publish` 先记过程项，再单独写 graph 输出并立即评估。系统写入口采用同一项目连接的同步事务，复用现有版本分配、类型检查、过程项登记、日志和端口行保存。一次 `beforeEffect()` 返回后同步核当前 action、actor、项目、目录和来源版本；两次业务写与最终提交前仍受同一原调用检查。端口写失败则成果事件、过程项与复制日志一起回滚，成功才通知和评估消费者。打开文件是否同时交付集合由 WMD 定样明确。换浏览位置或目录授权失效时收回活动端口，旧固定版本按其自身授权仍可读。

Manifest 借用现行对象形状表达精确系统来源，例如 `default_source: { plugin_id: "system.materials", port: "before" }`。只在 [SDK 端口声明校验](../../packages/plugin-sdk/src/wiring-declarations.ts) 接受这一个平台声明 id 和合格端口语法，继续按既有 `PLUGIN_ID` 校验插件身份、安装和信任。写了这份输入声明只表达消费意图。Runtime resolver 从 supervisor 或 Host 登记返回当前项目有效的 id、名称、签名和输出声明，供绑定、候选、写入、读取和默认同意共用。目标仍须是有效插件。现行 `source_plugin_id` 存储字段可表达两类输出来源，系统来源不进入安装与生命周期列表。

`resolvePortInput` 用实际接收者与项目读权限核对输出版本，检查来源现行可用、声明 type/schema、输出引用、记录 producer id/signature，个人过程项还须匹配其 `owner_actor_id`。固定成果沿原固定绑定口。默认绑定核当前完整 subject 的有效同意，拒绝缓存、旧签名和仅凭 `origin: "default"` 的访问。读取、消费者入队后开始交付、消费回调的 `beforeEffect` 和最后收尾都通过现有 `#resolve` 路径复核，revision 仅用于触发重新评估与取消旧交付。

### 默认同意的切换与恢复

[Supervisor 启动](../../packages/plugin-runtime/src/supervisor-releases.ts) 现按新 Manifest 计算 host-build 同意，[账本](../../packages/plugin-runtime/src/consent-ledger.ts) 只按完整 subject 去重。来源换名会使原撤回失去拦截作用。修订为：能证明目标是本 Home 真正首次安装、且目标与来源均属可信宿主构建时，才自动签发指向系统来源的同意。升级、重启及同一目标身份在本 Home 其他项目曾有安装或相应撤回历史时，按存量处理。账本的同意范围跨项目，仅当前项目缺安装记录不能证明首次安装。查不到 Home 范围的历史证据时走本人确认。旧记录按原 subject 撤销或失效，迁移只搬配置和历史，不写新 grant。现有 [外部安装预览](../../apps/local-host/src/plugin-install-service.ts#L219) 传空来源解析，仍不在外部安装中自动授予默认连线。系统来源被识别不改变外部授权范围。

| 采用前的状态 | 采用后与恢复 |
| --- | --- |
| 旧默认有效 | 保留原版本、输出和可恢复的配置。活动默认等本人确认新来源的完整 subject，确认后使用原引用。 |
| 旧默认已撤回 | 继续关闭默认，重启或再次采用不会由 Host 代签。只有本人明确重新同意才能启用。 |
| 旧默认无同意 | 保持未绑定，只在本人确认新来源后启用。 |
| 人工选择 | 其他来源的人工绑定继续生效。可由现有受保护手选路径证明的 Files 绑定，按相同端口、内容类型与输出引用改属，保持 `origin: "user"`，通过新来源、当前接收者与个人 owner 检查后继续交付。它与默认同意独立。缺少授权证据或恢复入口时，本项目预检停在 2→3 之前，保留旧行，等本人能在受保护入口明确重选。 |
| 固定成果版本 | 保留原成果引用和既有读取规则，默认来源切换不替换。 |
| 真正新装 | 宿主随带目标可沿 host-build 初始同意签发当前 subject；外部安装保持当前预览与确认范围。 |

本人恢复走宿主插件设置的受保护同意入口。当前只有 list/revoke。在同一入口补最小的“同意默认来源”操作，以目标插件和端口定位，Host 读取当前安装和声明、当前来源签名与权限后生成完整 subject，再在 `beforeEffect()` 后同步复核并按本人授权入账。设置界面说明具体来源与端口，沿 D 轨定样。仅宿主设置能给出本人的受保护入口证明，签名和权限由 Host 推导。插件页、Agent、工作流及 MCP 无法代签。原 Files 手选路径须核现有入口能否承担明确重选，缺口由 S4/S5 确认最小入口和有效授权的存放位置。恢复默认同意后重新评估消费者。

### 2→3 迁移与交接

- 项目库 `molis-work.db` 的平台基线已是 2。把已授权的 Files 数据切换写成连续 2→3，变更 `tooling/versions.json` 后运行 `pnpm versions:generate`。项目库步骤只按 owner 导出的确定性数据操作组合，归 `modules/artifacts` 的过程项，归 Plugin Runtime 的绑定、输出、安装，升级编排只调用两者。先登记 [当前保留机制](../../docs/system/CONTRACT-CHANGES.md) 与升级链，记录一次性历史来源范围、验证与采用窗口。
- 仅改由旧官方 Files 身份与 `official-files-binding` 产生、且全线版本均为三种已声明 type/schema 的身份行。预检身份、碰撞、混合版本和缺引用，失败保留原库。把 `producer_*` 身份切到系统登记，保留版本行的生产版本史、作者、scope、owner、payload、digest、状态、supersedes、时间及原 `artifact_id@version`。更新 `plugin_port_outputs.plugin_id` 与 `plugin_port_bindings.source_plugin_id`，保留引用、输出失效状态、scope_key 和 origin，生效按同意表。固定成果输入表沿原规则。新产出从 `system.materials:<port>` 起线，已有固定版本经原 ref 读取。逐个核对工作流引用、端口与读回内容。
- 2→3 里的历史改属不能被当作新业务产出。用 owner 的现有同步标志或在事务内恢复精确基线触发器，并核原有事件和同步游标。是否允许启用新版与删除 Files 另过下一节的同步检查。
- 安装、私有设置、同意有不同存储范围。项目库步骤完成该项目的改属、绑定输出和本库安装清理；Home 同意账本由 Runtime owner 幂等撤销，只撤与 Files 相关的现行同意，处理匹配的 Home 私有值与安装。以现有升级协调及备份做先后闸门；在所有相关项目升级、旧资料回读与消费者切换都成功前，不执行最后删除或启动混合来源。中断恢复按 U1。正式 Home 的启动升级／维护时间另授权。
- 给隔离旧版金样准备包含 Files 三种历史过程项（两个固定版本至少一条）、其绑定、同意和私有值，覆盖显式撤权与绑定替代、用户固定成果、普通插件历史及多项目。保持旧基线真实可重放，回读断言 ref、内容、授权、来源、活动输出、同步日志和下次发布。然后开 S6 删除门。
- 代码面为 `horizontal/knowledge` 和 Host 资料装配、`contracts/modules/artifacts`、`contracts/platform/plugin-*`、`modules/artifacts/{plugin-operations,registration,repository}` 所在包、Host 的 `declared-types.ts` 与 `plugin-platform.ts`、Runtime 的 `wiring*.ts`、`services.ts`、`trust-rules.ts`、同意与旧存储 owner。迁移对齐项目库 schema 与 goldens。Files 的产品动线、Coding 工作区与 Side 文件接入由 S4/S5 负责。动作注册表更新以 `host-actions.tsv`、消费者快照和文档同批交付，`pnpm api:update` 与 `pnpm actions:update` 集中生成。移除 Files 的六个动作时逐个对照当前调用方与固定引用，并按现行合同规则说明缺失动作后的恢复。

### 过程项同步的采用门槛

以下状态由现有 owner 分别核对。项目库的升级事务只负责本库数据。同步队列里保存的历史内容按原身份和原操作处理。

| 载体 | 已核实的行为与采用处理 |
| --- | --- |
| 已拉到项目库的身份与版本 | 通过 2→3 改属，保持 ref、正文和历史。 |
| 项目库 `process_items_replica_changes` | 只存 seq/key，尚未冻结的操作以后会读取升级后的业务行。保持原 key、顺序和游标。若该 key 涉及旧同步选择，优先在旧版、旧身份下正常发完，并确认该轮收发一致，再开始切换。 |
| 项目库 `process_items_replica_outbox.operation` | 冻结 payload、base 和 operationId；同 id 回执与冻结值逐字段比较。使用现有发件和回执按原样结清。无法结清即阻塞。不能就地改同 id 的值、删条目或重置游标。 |
| 项目库 conflict/recovery 与 `sync.db` 的 deferred/download failures | 项目 conflict 可能持完整事件，recovery 持本地/远端快照；`sync.db` 的同步失败 owner 持延迟重试事件与游标，和项目冲突表分开。分别列出命中旧 Files 身份的项，走既有冲突解决或重试，核还有可恢复的旧身份快照。剩余项目由对应 owner 提出有限迁移或阻塞采用。历史证据不得删除，升级编排不直接改队列。 |
| 只在远端、旧客户端迟到、换机重拉 | [固定版本 apply](../../modules/artifacts/src/fixed-version-replication.ts) 在本机已有同 id 时会拒不同生产者，无本机行时可照旧 payload 建身份。[Host prepare](../../apps/local-host/src/personal-artifact-sync.ts) 还可能在 apply 前建出项目。须有让远端历史读到、避免旧身份重新落地且保持授权的切换证据。 |

隔离试验先沿现有同步协调器的 `run()`（[实现 `PersonalSync`](../../modules/sync-replication/src/index.ts)），用 [双 Home + Rust/D1/R2 夹具](../../apps/sync-worker/process-items.test.mjs) 做三步：

1. 以旧版、有效 opt-in 和受信调用搭两份 Home，一份只在远端有 Files 数据，另一份模拟原操作已冻结且回执丢失、暂时下载失败和可重试冲突。运行旧路径，保持 operationId 和冻结内容一致。以授权后的 `/v1/round` namespace head、状态及本地游标证明两边已收到同一历史，队列、冲突与相关延迟项已处理。只看 cursor 到 head 不够，失败记录也可能推动 cursor。若历史已过保留期或设备不可达导致数据无法拉齐，先保全可读副本并报告缺口。
2. 隔离暂停旧生产者，再分别用 2→3 迁移本地行。核历史 ref、非 Files 同 collection 记录、绑定、权限、旧回执与无上传回声。再验证迁移之后的两个场景：只有远端历史的干净 Home，及原 head 之后旧设备送来的新事件。覆盖本地有行时的身份冲突和本地无行时的旧身份注册，后者要观察 prepare 是否已创建项目。
3. 先证实已有同步入口能完成一次性拉齐并封住旧写入边界，再选能给空 Home 补齐现有历史的最小路径。若要分版本，`schema_version` 只决定 namespace；另一个 namespace 不会继承 payload、授权、head 或 cursor。只有先拉齐旧资料并确认新 namespace 的合法播种、接收和显式选择，才能用分版本路径。保留旧 namespace、游标与原操作历史，避免伪造回执或扩大选择。仅本地 2→3 已有路径；仍有旧 writer 或新客户端无法取回历史时，真实数据切换暂缓。持续旧格式转换、服务端改动或真实云写需要另行授权。

独立复核确认现有 `PUT /v1/policy` 的 revision CAS 与 D1 写入条件能够拒绝撤选后的旧 namespace 新操作；准确重放原回执须验零新增。上传不推进 policy revision，末次拉取与撤选之间仍有窗口；撤选后的 changes、history、附件读取都验当前选择，保存 head 不延长读权。最小隔离试验先用可控旧端正常结清、停止生产和自动／手动同步、排空在途，再由最后受权旧端拉齐并核正文与相关失败，最后 CAS 撤选或替换。`setDevice(false)` 只关自动工作，不阻止手动运行。新 namespace 还需从干净队列／head 合法播种整个已选集合（含非 Files），不能沿用固定前缀的旧 outbox。

**2026-11-09 隔离探针。** Node 24.15.0／SQLite 3.51.3 下的单文件探针通过（最终 1/1，20.5 秒）。使用真实 `createStaticPersonalSync`／`PersonalSync.run`、项目目录与过程项 owner；HTTP 在进程内模拟，SQLite 执行现行 D1 schema 及从 Rust 提取的 heads、policy CAS、changes、receipt 和事件插入 SQL。未运行 Rust Worker、Miniflare、R2、真实 Auth 或云端；仅 inline 内容。探针在临时目录，测试 Home 与进程已清理，不算正式 BSH-11 验收。

- 丢失上传响应后，原 outbox 的 operationId、base、payload 保持冻结，之后本地编辑也不改原项；下轮原回执能结清。双旧 Home 拉齐后 pending、conflicts、failures 均空，三版 Files 快照（含归档）与同集合另一 owner 的历史均能读回。
- `prepare` 确实可能先建项目，后续暂态失败把完整事件留在 `sync_failures`，stream cursor 已前进，重试后才推进 partition cursor 并清失败。本地先改属再收旧尾部时，事件进入项目 `replica_conflicts`，顶层 `error` 仍为 null；总状态和 cursor 到 head 都不足以证明已排空。
- 旧上传推进 head 而不动 policy revision，现行 policy CAS 仍能撤选，证实末次拉齐与撤选之间存在漏历史窗口。撤选后原 receipt 精确重放保持旧 revision 且零新增，同 id 改 payload/base 或新的旧版操作均被拒。
- 仅选 v2 时 head 为零，空 Home 没有历史。沿用旧 per-key head 在空 v2 播种被拒且保留 frozen。用干净 seed replica 经 owner read/apply 收齐完整版本图，明确 v2 选择再走正常 run，空 Home 可读回三版快照（新 system owner）及另一 owner 历史，v1 传输历史保留但配额增加。已排空的旧设备先收 v2 heads 后可继续上传，旧 partition cursor 保留。v2 选择为测试注入，尚无产品实现；没有证明撤选后旧传输历史仍可在普通 history 入口展示。

**2026-11-09 用户决定：扩大本批隔离实现。** 用户在本会话选择“扩大本批隔离实现（推荐）”，将下述服务端封旧、历史与附件恢复、客户端播种及中断恢复纳入 06。授权是实现代码并在隔离环境验收；不含真实部署、真实 Home 或云端数据切换，这些仍另约授权窗口。原四项交付不减少，Files 不移出本批。具体合同、存储 owner、升级步骤和跨批冲突先设计核清，再由唯一 writer 串行实现。

**采用边界。** 单次 head CAS 仍不足：旧客户端可通过普通 policy PUT 重选 v1。现有产品也没有能证明全部旧写端永久停用的设备名册／强制退场机制，所以“人工停完设备”仅是探针控制条件，不作为产品验收方案。同步关闭且无待处理状态的本地路径可以独立验证，不能作为有云端历史的项目通行证；禁止用“拒绝所有旧事件”顶替可回读的切换方案。

扩大实现的具体范围为：服务端对账号／集合保存持久、单向的旧版本退役事实；原子核 policy revision 和已完整拉齐的旧 head，普通策略保存不能反开。实际数据变更处封住旧版新增写、附件 reserve、history 删除和 trash purge（不能只在 HTTP 前置检查），精确旧回执重放保持零新增。保留旧历史正文／附件的受权读取、导出与恢复入口，并明确与现行保留期的关系。客户端使用已核完整图进行显式选择与幂等播种，容量不足、中断和重启可恢复；现有 immutable receipt、同账号 ready blob digest 复用、quota 和 owner 端口继续共用。正式采用须过真实 Worker Auth/D1/R2 拒绝、旧归档／恢复记录与附件回读、容量不足和中断续播测试。实现限本次 `process_items` 旧版到新版的采用，不顺带改其他同步集合或造通用迁移平台；准确版本与合同在设计中核现行登记后确定。

### Files 的 M0 裁决依据

预审允许独立推进来源、界面定样与隔离合同验证。**Files 整块采用与删除当前 NO-GO。** 实施前核过最小 resolver 和同意恢复入口，落定 knowledge 来源、工作台文件界面、Coding 嵌入和 Runtime 四项前置。数据切换还要证明项目步骤、Home 账本和同步的次序，覆盖 BSH-07 与 BSH-11。若同步仍没有保全远端历史和授权的最小做法，按 06 批止损规则向主会话报整块延期，维持 Files 活动入口。N12 存储和 Files 本库事务各自判定。

N52 随 S4/S5 接同一公共界面：现有 `/sources` 响应合并可见来源的第一页、`next_cursor` 和来源状态，侧栏与 Goal 放置选择器共用；每个来源仍调用其已登记动作，不新增聚合动作或存储。首次读取共用上下文与发现，实际执行保持现行实时授权。源状态和部分失败在 HTTP 边界明确建模，分页、内容和当前引用身份沿原 owner；采用前按 BSH-13 真实验证。

## 4. S3 公用 SDK 工具

- **N13／N12⑤。** `/browser` 沿用浏览器安全的叶子入口，复用 `/ui` 的 HTML 转义与已存在请求基础 `molisWorkRequest`。仅提取实际共用的 `required`、错误消息／状态、abort 识别和 `pluginRequest(host, { fallback, codes })`。保持不同路由的已定项目参数、body、翻译回退、失败 code/status 与当前生命周期 `signal`，调用点负责附上实际的挂载／离开信号（Dataset BL-1033）。浏览器助手复用 Pages 已有文档内容 owner。search/body/start 的输入、权限、摘要和错误先比对，只有纯粹的适配相同才共享。页面专用控件与非同义辅助代码仍在各自插件。
- **N15。** 取时区部件复用 SDK `card-values.ts` 的 `wallClockIn` 内现成 `formatToParts` 规则，提取 `zonedParts` 并保持本地时区、h23、跨日和 DST 行为。通过实际 `Intl` 接受的时区统一 `isTimeZone`，保留 Jelly/Coding 调用方现有空输入政策。面向界面先复用 SDK `ui/message-format.ts` 的 `formatDate` 与现行 locale。缺相同格式时补小段共用日期标签，保持今天／日期回退由当前语言决定，将审查发现的英文界面缺口归 [语言书 §6.1](../font-and-skin-system/spec.md#61-现状与注意事项2026-10-21视觉细节目标-vux-40-的英文实走所得)。 2026-11-09 核查确认四文档插件的短月日标签同义，但现有 `formatDate` 的坏值回退和月份长度不同，不能无差别替换；Images／Workflows／Jelly 的各自格式保留。用量午夜的 DST 偏差已实测并单列 [BL-assistant-usage-dst-midnight](../backlog/BL-assistant-usage-dst-midnight.md)，本次提取不静默改变预算时间窗。
- **N16／E3。** 在 `whole-units.ts` 实现 `cutWithEllipsis`，沿用 `cutHead/cutCharacters`，输出不拆代理对。按调用点核截断前清理、UTF-16／码点预算、尾记是否计入预算及既有 `…`／`...`，明确选项只覆盖现存差异。E3 的无省略号提醒标题直接改用 `cutHead`。门禁只增加用户已批准的直接 `slice` 后加省略号的源码计数，按文件比较基点只减不增，跳过无关的一般切片。库快照与用例随同一 PR。
- #1987 已收口 `isRecord`、`compareCodeUnits` 和 Shelf/工作台的转义。这里直接复用该 SDK 实现，contracts 的工具依赖方向按 BL 另算。SDK 公开入口和快照写前按实际文件查 #1999／#2000，当前已知 `packages/plugin-sdk/src/index.ts` 与部分入口在途。先以有消费的子路径缩小出口范围，再等待同文件的接力。

**N47 的 Runtime 主人已独立裁定 GO（06-4）。** 在实际交给插件的最终 callback view 装惰性 `allowed_actions`。首次读取才克隆数组和每条引用，同一回调内保持同一个可改副本，其他回调和原权限快照各自隔离。保留缺省字段与空数组的区别、可枚举、赋值和序列化语义。Host ingress 继续立即取得独立权限快照，首次读取依据同一可信来源。检查 [action-provider](../../packages/plugin-runtime/src/action-provider.ts) 和 [scene-provider](../../packages/plugin-runtime/src/scene-provider.ts) 构造视图时的对象 spread，它会过早触发 getter。最终 view 安装 getter，或在转交时保留描述符。普通回调、availability 和场景入口各测未读、首次读、重复读与改值，再测嵌套调用及序列化。

独立合成探针走生产回调函数，1,502 次各 164 条引用共复制 246,328 个引用对象，即使回调完全不读。该值是探针证据，真实 brief 请求的前后成本由 06-4 单独测。

## 5. 验收标准

| 编号 | 通过条件与拟接用例 |
| --- | --- |
| BSH-01 | 四插件既有固定入口、Goals 提交与比较读取正确。并发编辑预期版本冲突。同一对象移出再回，原项目固定版本保留、新版本续号。原作者经旧入口恢复已有 pending，后来的编辑和 Pages Goal 得以保留；预检发现非零或发生竞态时拒绝切换。接 `creative-artifact-promote`、`document-pin-after-move`、`artifact-compare-moved` 和各插件动作测试。 |
| BSH-02 | Home join 拒绝另一项目、另一 Home/空间、另一安装、卸下重装后的旧 handle、普通 Home 事务、过期 writer、异步回调及伪造项目或路径。用一个能正常提交的 fixture 变更单一条件，断言实际拒绝和无业务行、成果、事件、同步日志副作用。接 `security-invariants-plugin-artifact-join`。 |
| BSH-03 | 用 barrier 在等待之后、业务行写后、两个 writer 调用之间及最终提交前触发取消、撤权、停用、provider 变化，断言操作拒绝、双方零新增与无提交通知。故障点覆盖保存点丢弃、第二文件失败、崩溃重开；同一 fixture 的正常路径必须同时落两边。 |
| BSH-04 | 真实放置调用在插件移动已提交时触发原调用撤权，恢复到原项目，旧固定版仍可读且没有新成果或位置边。关停和插件报错项目的分支断言 S-35 的拒绝，无第二次写。接 `security-invariants-placement-revert` 及文档移动测试。 |
| BSH-05 | 系统资料 action 的有效请求同提交发布声明过程项、匹配端口和事件。另一项目、无目录授权、非法路径／指纹、伪造系统身份、未声明 type/schema、给成果库写过程项、读另一 owner、越权的二进制预览、最后等待之后取消撤权停用均拒绝。注入端口写失败验证过程项、端口、事件与同步日志零新增、无交付通知。沿 S-18、S-81、WMD-05。 |
| BSH-06 | Runtime 的系统来源按精确引用绑定和回读，保留安装身份验证。覆盖旧默认有效、撤回、无同意、手选、固定和新装矩阵；验证旧绑定跨项目及重启不会令 Host 自动补发同意。拒绝假签名、错类型、失效来源、撤权同意、替换来源和越过本人入口代签。无 revision 变化的撤权也要使 live 读取和已排队/运行的尾部效果被拒。接 `plugin-input-graph`、`plugin-default-bindings`、`security-invariants-default-consent`。 |
| BSH-07 | 2→3 从有业务样本的隔离 Home 升级，逐条读回同 ref、内容、digest、scope/owner、端口与用户绑定。新系统 owner 可读，旧 Files 身份和已撤权同意被拒；重开、重复执行和中途失败恢复无重复副作用，别的生产者数据保留，过程项仍不出现在成果库。Diff／Text Stats 走真实输入消费，承接 WMD-04。 |
| BSH-08 | 不安装 Files 时 WMD-01 的 Coding 与另一个插件可使用真实资料；已有引用能打开，普通浏览和选区捕获走同一来源。删除前有 BSH-07 回读与消费者切换证据。界面走查与本人验收沿 WMD-10。 |
| BSH-09 | 采用 SDK 后，各页面请求保持 HTTP 方法、参数、错误码、文案、状态和 abort 语义；Dataset 离开后取消及错误对应状态；已有日期显示行为按中英文、无效时间与 DST 证据验证。统计 dom/request 副本和例外。 |
| BSH-10 | UTF-16 边界的 emoji 与生僻字不留半字，短串不变，码点与含尾记长度守住调用方预算。源码新增直接切片拼省略号时门禁稳定拒绝，已有计数只减不增。 |
| BSH-11 | 双 Home 以现有同步运行回读仅远端历史、结清冻结 outbox 与原回执、解决项目 conflict/recovery 及独立延迟下载。切换后证明可回读旧 ref、新空 Home 能取回历史、旧设备事件不能复活旧 owner 或先建出无权项目。任何非空阻塞项保全队列和游标并拦住采用。接 `apps/sync-worker/process-items.test.mjs`。 |
| BSH-12 | N47 的最终回调未读时克隆 0 条，第一次读取克隆当前引用，同回调保持 identity，缺省、空数组、枚举、赋值和序列化一致。通过 action、scene 与嵌套回调测试证明改一份无外溢，Host ingress 快照行为保持。真实请求记录前后复制量。 |
| BSH-13 | N52：真实多来源项目分别打开项目资料与 Goal「加输入」，每次首屏一次 HTTP 聚合请求、零逐来源 entries 请求，宿主一次上下文与发现。共用来源第一页、游标及可见但未配置的状态；未配置来源零条目调用，单个失败不遮住其余结果。分页和正文按需读取；发现后撤权仍由实际动作拒绝，零未授权内容交付。 |
| BSH-14 | 已授权的隔离同步切换：真实 Worker/Auth/D1/R2 夹具证明旧 head 或 policy revision 改变时原子拒绝切换，退役后普通策略不能反开，旧新增写、附件 reserve、history/trash 删除在实际变更处被拒，精确原回执重放零新增。有权账号读回保留期内独立归档／恢复记录、正文和附件，撤权后拒绝。完整选中集合含其他 owner 经显式选择与幂等播种可被空 Home 取回；配额不足、取消、中断和重启保留原件及已确认进度，完成前不放行普通新版上传，离线旧端未结清队列不丢失。仅隔离验证，不执行真实部署或云端迁移。 |

验证由实现会话按项目规则排槽。构建后先跑上述定向用例、四插件及 `modules/artifacts`、`packages/plugin-runtime` README 的适用必跑项，再由全批运行合同、边界、安全、金样回放、页面资源及共享核心全量。页面脚本改动比较真实下发字节，使用独立浏览器和临时 Home。公开快照检查 `pnpm api:update`、`pnpm actions:update`、`pnpm test:contracts`，版本变化核对 `pnpm schemas:update`。安全不变量表同步登记拒绝用例（尤其 S-18、S-35、S-46／S-100、S-76 与 S-81）。测试名或注释逐个引用 BSH 编号。本轮仅设计，证据状态均为待执行。

## 6. 开工前检查

| # | 核对结果 |
| --- | --- |
| 1 事实主人 | 草稿、复制、移动归各插件；固定版本归成果库；失败移动的恢复归 Placement；目录配置归 projects、读取归既有工作区与 knowledge，系统资料登记声明过程项产出；Runtime 管绑定与同意，工作台管临时浏览。 |
| 2 同等待遇 | join 由同一 SDK/Host 边界与声明决定，内置和外部在相同受支持运行面用同一守卫。系统身份只在 Host 的既有系统动作注册边界成立。插件仍经 Runtime，系统来源无需合成插件。 |
| 3 能力注册 | 四插件沿原动作定义与 caller。资料产出、entries/content 各在自己的 owner 登记一次，可信字段经上下文，涉及外部读等待的动作 concurrent。 |
| 4 合同 | 改 join 事务资格及必要的 writer 读口、系统过程项产生者和 Runtime 来源解析，固定动作输入输出尽量维持。公开快照集中一份，阶段一同批改全部消费者。合同台及相关轨道先审设计、在最终头合审，沿决定 31 合入一个批 PR。 |
| 5 包边界 | SDK 只放共享工具，Module 掌握成果/过程项和日志端口，Storage 管事务，Runtime 管来源解析及权限，Host 装配，knowledge 管资料读取。插件互不导入实现。 |
| 6 表与存储 | N12 候选 A 保留 DDL。存储主人依据耐久性、安全、并发和性能证据裁定日志模式。Files 沿项目库 2→3，项目、同意和同步各归其 owner。 |
| 7 兼容与迁移 | Files 一次性步骤与隔离队列核查已授权，采用前登记当前保留机制。N12 优先由旧入口结清至零，非零存量需另定有限续接并获准。持续旧同步格式转换、服务端或真实云写有单独的授权边界。 |
| 8 安全边界 | BSH-02～07、BSH-11 覆盖跨分区、撤权、取消、停用、S-35、身份、声明与同步拒绝。实现前先拟拒绝用例，并按最终边界更新不变量文件。 |
| 9 调用次数 | 固定走一次动作、一个联合提交，项目授权在有效的提交边界重查。默认绑定按一次 resolver/本项目来源，文件捕获一次现读加必要权限复查。保留 N56 的预算验收，避免逐条发现或轮询。 |
| 10 升级与数据 | 两套待处理数据分别走 §2 与 §3，已有固定引用、事件、同步和偏好用隔离回读证明。真实 Home 另约。 |
| 11 成果与过程项 | 四插件固定供人引用，走既有 `artifacts.produces`。三种资料输出供插件交换，仍属过程项。 |
| 12 页面与外壳 | S1 仅后端合同。公共文件界面与 Coding/侧栏需先定样。S3 维持现有组件、挂载和生命周期，译文按现有机制，涉及新增资源或超过预算按原规则处理。 |
| 13 错误 | 复用原 owner 的版本、来源、权限、端口和版本冲突码。必要的新码经 `defineErrorCodes`，按原 HTTP 分类。 |
| 14 冲突面 | C 轨独占 contracts、SDK、artifacts、Runtime 和快照。Host 枢纽包括 `plugin-host-services.ts`、`plugin-platform.ts`、项目库基线与注册。四个文档归 E，Coding 归 B，工作台归 D。#1999/#2000 占用按文件确认。S1/S3/S7 的共享核心串行交接。 |
| 15 全局最优 | **插件**用同一个 join 与浏览器 SDK，保留各自数据和业务行为。**平台**用一个 Runtime resolver 和一份资料登记，A 的跨库回滚日志成本先实测并评审。**助理**通过现行已授权的动作发现、固定和读取，人工主路径独立。**平台能力**保留现有 WMD 来源、成果/过程项、工作流/MCP 引用、同步与同意契约；接入 S4/S5 而非重复生产。**后续开发**与 16 批语言迁移、26 批状态能力、55 批输入余项分开；新资料类型加登记与生产动作，后续版本走同一升级链。比较过跨库日志、同库改造与恢复账，及合成插件与窄 resolver，取舍见 §2、§3。 |

待决由主会话归口。N12 候选 A 先补隔离耐久性与并发证据，再核预检和动作调度。Files 优先验证双 Home 同步切换与存量同意恢复。已有 Files 2→3 隔离验证和 N56 授权继续有效。
