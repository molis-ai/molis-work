# 干净 Home：Functions、助理、角色与 Home Runtime 起点 1

状态：执行中，负责人 Codex（设备 A）；依统筹 #1332 6517794305、6518319207、6518340875 已确认的第三片。旧迁移取消，真实Home重建未开始。

保留四个owner的现行完整DDL与正常新库产品行为，Functions4、助理3、角色2、Home Runtime3的存储起点改成1。动作/Manifest/成果协议、实体版本、产品版本不变；Runtime信任证据、授权/撤销与私有KV不变，不保留读取兼容或开库升级。删除四套离线升级SQL/演练与Runtime旧v1/v2结构夹具；独立现行结构夹具保留，重命名其旧版本标签。只有已取消迁移本身的测试删除，现行拒绝、权限和生命周期断言转用完整现行结构及故障注入继续验证。

- RAC-2364：四库新建/重开是1，完整现行schema与独立冻结DDL相同，integrity_check=ok、foreign_key_check为空；事实和权限行为不因重编号改变。
- RAC-2365：其他版本、无版本非空库仍拒绝，不改原文件/业务行；Home Runtime同版本缺表仍拒绝，不修补、不当作缺库继续。
- RAC-2366：真实Host在新Home登记安装、publisher信任和常开同意；重启不重复生成、撤销不复活；Runtime损坏时不借恢复页恢复业务权限。
- RAC-2367：四套升级SQL与演练、Runtime旧结构夹具删除，所有保留负例从独立现行完整schema改错版本/删表，不需要旧格式。

当前证明文件：`tests/clean-home-core-stores.test.ts`、`tests/home-store-baselines.test.ts`、`tests/home-runtime-trust-records.test.ts`、`tests/home-plugin-private-store.test.ts`、`tests/security-invariants-always-on-records.test.ts`；原RAC-381-T1的实际Host信任/同意/重启/撤销断言从升级演练移到现行新Home用例，未删除产品边界。

验证：先整体build，Host/Functions/Characters README必跑并集、修改到的schema/拒绝/常开/私有KV用例；machine-slot、jobs1、独立Home与测试浏览器。health对照main ea05b7690b、boundary、40库版本核对、secrets。storage/shared-core Full只由统筹排；甲档Codex B验证和Opus high二审另交接，不冒称已独立验收。

本片不打开真实Home或旧副本，不停服务、不安装、不碰Keychain；所有代码合入且构建就绪后，真实重建仍须用户另说“开始”。连接库等#1564交接，Memory/SDK与JSON/IM在各自后续片，不顺手改。

工程候选验证（2026-10-30，冻结main ea05b7690b）：整体build、health/base、boundary与40项存储版本表通过；核心7文件68项、README/直接影响其余72文件均已结算，共79个不同文件。README先71通过，Characters项目清理的错版负例仍用1（已成为当前版本），改为完整现行结构但版本2，并明确expected=1后单文件3项通过，原字节不变与项目/草稿保留断言不变。源码未为测试放宽，未重跑无变化的已通过文件；独立验证、二审、合入、真实Home与用户验收另计。
