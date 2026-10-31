# 干净 Home：连接库完整结构归起点 1

版本号相同、结构不同的旧库不在检查范围内；重建前不要用新构建打开旧 Home。已知例子：旧角色库曾为1但没有 `character_runs`；#661之前的连接库也曾为1；记忆账本旧1曾带 `facts` 表；MCP授权、Shelf目录、`feed/secrets.json` 和讨论库以前也有过版本1。数字重新从1起算不证明这些旧形状会被拒绝；原有明确的结构、路径、权限与密钥检查仍保留。这里只引用既有记录，没有重新读取真实Home。

状态：执行中，负责人 Codex（设备 A）。按统筹 #1332 6520836999 对6520787724的答复，连接库单独先交本线；原等待#1564的顺序取消。冻结main946cf30e2a，真实Home、旧副本、服务、安装与Keychain不操作。

只把 `apps/local-host/src/connectors-store.ts` 的现行完整DDL起点2→1，结构和业务字段不变。补齐当前冻结DDL中的 `connector_authorization_results`，去掉旧真实Home夹具缺懒建表的豁免，完整结构逐项比较。不添加迁移、读取兼容或启动修补；OAuth、连接操作、context-onboarding、index及其合同不改，不碰#1564分支。T-134排本片之后，合本片并merge main后再把新表写入版本1的现行结构，本片不提前加它的表。

- RAC-2382：通过现有公开连接/协议owner入口新建并重开库1，完整schema与冻结DDL相同，integrity_check=ok、foreign_key_check为空。
- RAC-2383：完整当前结构和真实行但版本2时，两条owner入口均在回调前拒绝；错误给出该库路径、found2/expected1，文件字节、行与结构不变。
- RAC-2384：冻结DDL包含当前授权结果表，通用Home基线对完整schema逐项比较，不再允许省略该表；不依赖运行时生成预期或真实Home数据。

证明文件为 `tests/clean-home-connectors.test.ts`、`tests/home-store-baselines.test.ts` 与Host README必跑和直接连接用例。先在未改常量的2上运行新用例确认失败，再改1、整体build并定向复核；所有构建/测试经公共machine-slot、jobs1、临时Home和专用浏览器。health/base、boundary、版本表、secrets；甲档Codex B验证、Opus high二审和Full由统筹排，不本机全量、不合并。

更新CHECKLIST、HOME-DATA和防腐spec维护账；源码范围只有上述常量文件，horizontal/connector-host的DDL与操作无须改。所有存储片合入/构建就绪后，真实重建仍须统筹另问用户“开始”。

变更前证明：未改常量的main946cf30e2a整体build通过；新文件2项均按预期红，分别为新库实际版本2而期望1、完整当前版本2被接受而缺少预期拒绝。不是缺构建/环境导致的失败，日志保留；随后仅改常量1并进入同一用例复核。

工程候选结果（2026-10-30，冻结main946cf30e2a）：变更前后整体build通过；新用例红2/2→绿2/2，核心4文件38项+README/直接影响其余67文件全部通过，共71个不同文件703项。health/base、boundary、40项版本表、48项资源7,493,290B通过。初次文档门因新spec未加入Git索引而拒绝，加入后按原门禁重新通过，未改门禁或基线。生产代码只有版本常量一行变化，DDL/操作/合同/Scope和其他分支未改；当前只有作者工程候选，B/Opus high/Full、合入、新Home实测和用户验收仍未完成。

后续（T-134，2026-10-30）：本片合入后，`connector_connection_declarers` 已按上面的约定直接写进版本 1 的现行结构，冻结夹具 `tests/fixtures/home-store-schemas/connectors.sql` 同步加了这张表，不写迁移（`slices/bl530-sandboxed-integrations.md` §7.2，S-103）。
