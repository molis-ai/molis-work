# 插件同步接入（个人空间本机联调阶段）

当前有公共契约、Pages/内嵌 Artifact 增量适配、Form/Dataset/PPT/Lingguang owner 适配、SQLite 持久队列、空间配置页，以及 Rust Worker/D1 本机联调链路。默认关闭，只允许显式启用的 localhost 服务；尚未部署公网，也没有第三方 Runtime 自动发现。不要把 Manifest 声明当成上线承诺。

## 作者提供什么

Manifest 可选 `sync: { protocol_version: 1, collections: [{ id, title, schema_version, requires }] }`。集合是用户能理解的业务资产，不是数据库表。`requires` 引用本插件内其他集合，不能缺失、重复或成环。文件夹如果只是正文的结构依赖，和文档放在同一个集合，不制造可取消的半份资产。

SDK 导出 `PluginSyncSnapshotAdapter`、`PluginSyncSnapshot`、`parsePluginSyncDeclaration`、`expandPluginSyncSelection`。依赖展开不会授予权限，不会自动选中新版本加入的可选集合。新增字段须增加插件版本；数据格式版本与插件版本分开。

contracts 只保存同步类型和 schema；声明解析/依赖展开归 SDK，空间策略解析归 sync-replication。失败使用 owner 的 `defineErrorCodes` 与共同 `ActionError`，不得新建跨层 Error 子类。需要等待关联资产时，在错误 details 中给出 `sync_waiting: true`，协调器不猜其他 owner 的错误码。

快照用完整的 `spaceId + projectId + plugin_id + publisher_id + publisher_signature + collection_id + schema_version` 定位，`source_revision` 只在源设备上有效。`apply(snapshot, expectedRevision)` 的前提须来自目标设备的 `read`，不能传源版本代替。插件自己解释 payload，不导出 SQL、Home 路径、密钥或运行中任务。

## 空间配置与授权

`SpaceSyncPolicy` 属于 spaceId，而不是某一台设备或直接属于 userId。选择固定发布者、签名、集合与数据格式版本；升级改变依赖/格式时需要明确复核，不借旧配置自动扩大同步范围。未知但合法的旧选择保留供修复，不静默删除。本地空间不允许上传；个人空间由本人配置，团队权限仍未实现。

真实 Host 同时核对配置、账号、项目权限、插件生命周期和实现可用性，再注入可信回调；异步等待后重查授权。不能从网络 JSON 传 `authorize` 或自己拼 userId；配置不是授权。Manifest 声明但没有已注册适配器时必须显示未支持。

## Pages 试点

`openPagesStore(home).syncAdapter(context)` 只供可信组合根/测试使用，不直接暴露为 HTTP 方法。一个项目的文档与文件夹形成一致快照，正文、稳定 ID、收藏及 Goal/Artifact 引用保留；生成历史、导入幂等记录、发布中的意图和本机编辑版本不作为可移植内容。Goal/Artifact 必须通过同空间同项目 owner 检查准确引用，缺失返回等待依赖，不删引用。

原 Store 的触发器在业务事务内增加持久修订计数，并为个人空间写逐资产变更日志。`store.replica(trustedContext)` 将单记录封装交给公共 `SyncReplicaAdapter`；队列由 storage 提供，格式和落库验证仍归 Pages。目标在一个事务里应用内容、游标和回执；远端写入不产生回传。并发冲突保留，用户明确选择版本后双方原文存入恢复日志。这不是公开的跨空间搬迁功能。

正文内嵌 data 图片保留，HTTP 链接仅保留链接、不获取内容；blob/file/本地相对链接拒绝，不能冒充已同步附件。运行中生成、待恢复发布和超限集合明确停止；不绕过保护复制数据库。

## 后续增量接入要求

新插件实现集合的稳定键、导出、事务应用与语义验证，由可信 Host 注册 `SyncRegistration`，复用队列/重试/传输/配置，不自行调用云接口。多集合须隔离各自日志与游标。声明本身不注册运行时实现；附件依赖、Schema 迁移、第三方 Runtime 接线和完整项目生命周期仍须扩展。Pages 仅同步最小项目定位信息；内嵌 Artifact 有独立适配器。

内置插件在现有 `BUILTIN_PLUGIN_CATALOG` 的同一条目提供 `sync` 工厂（Home、Home+项目或项目库），Host 从目录派生注册，不另维护第二份逐插件名单。首次收到内容可启用从未安装的插件，但不得重新启用用户明确移除的插件；移除事实经 Projects 的公开只读口查询，不跨 owner 读事件表。

同步日志、编辑高水位及策略缓存都属于当前 Store 基线，必须在 owner 当前 schema 中声明并更新版本/fixture/发布表。错版拒绝且保持原文件；同步启动不通过 ALTER 或临时补表修复旧库。插件只能调用 Storage 的公开日志端口，不直接查询它的 replica 表。真实 Home 的备份与重建需要单独批准，不属于代码升级的隐式步骤。

Goals 的 `project_goals` 集合由 Goals、Governance 和 ContextLedger 各自声明可移植字段，Host 组合、Storage 原子恢复。目标关系、决定、约定与工作历史作为项目一致性单元；历史序号在传输中改用稳定事件 ID，恢复时重新映射。不能复制本机 seq，也不能调用执行或批准动作来恢复历史。Goal 引用边只带定位与精确版本，内容仍经被引用 owner 授权读取。项目聚合受 512 KiB 上限约束，并发修改由用户明确选择。

表结构稳定、业务对象可聚合的 owner 可使用 storage 的 `initializeAggregateReplication` / `createAggregateReplica`：明确列出可移植字段、子记录及顺序、语义验证、发布阻塞字段、编辑版本及关联依赖。它不是任意 SQLite 导出；SQL 名称仅来自 owner 常量，网络输入不决定表名。必须在 Store schema 建好后安装事务触发器；不要等第一次同步才开始监听删除。普通本地空间不安装同步日志。

问卷以一份问卷及其答卷为冲突单元；数据表携带保存版本；演示稿保留全部页和备注；灵光按想法/对话分别记录，对话等待关联想法。同一聚合两端同时修改保留双方，当前不自动合并答卷或行。数字编辑版本使用目标端高水位，删除后恢复不回退；灵光时间版本在目标端递增。当前单条传输上限 512 KiB，超限保留本机数据并报错，不截断内容。附件及大对象还不能据此声称已同步。

回归：`node scripts/run-tests.mjs tests/plugin-sync-foundation.test.ts tests/personal-sync.test.ts tests/personal-sync.e2e.test.ts`。真实 WASM/D1 测试和启动边界见 `apps/sync-worker/README.md`；隔离测试不等于公网生产验收。
