# Storage and Exchange

## 1. Storage

`packages/storage` 提供 SQLite、Filesystem、Blob、事务、单一现行结构基线（`applySqliteBaseline`，版本不符即拒绝、不就地升级）和备份恢复的技术端口。每个 Module/Plugin 逻辑隔离自己的 Store 与 schema；共享 SQLite 进程不等于允许跨 Store 查询。

- Module 是表和字段业务含义的 owner。
- Plugin 私有 Store 不能成为其他 Plugin 的查询接口。
- 跨 owner 写入使用本地事务、幂等 Event 和补偿；Durable Outbox 是后续目标（[BL-070](../../specs/BACKLOG.md)）。
- Secret 只存安全引用；日志、Artifact 与普通数据库不保存明文。

### 1.1 数据生命周期规则（2026-09-28 按代码核实）

| 情形 | 业务数据（各 owner 的库） | 派生数据（系统搜索索引） |
| --- | --- | --- |
| Home 隔离 | 每个库跟随打开它的 Home（`openHomeSqliteDatabase(home, name)`、项目库路径由目录记录）；不同 Home 不共享库、密钥或索引 | `{home}/search/search.db` 只属于这个 Home |
| 结构版本 | 每个库只有一份现行结构加版本号：新库一次建好，版本不符拒绝打开、不就地升级。基线库（项目库 `PROJECT_DATABASE_BASELINE`、Pages 等，经 `applySqliteBaseline`）版本在 `PRAGMA user_version`；项目目录库 `projects/catalog.db` 在 `LocalCatalogMetadata`（`CATALOG_SCHEMA_VERSION`）；Session Registry 在 `session_meta.schema_version` | schema 版本不符时清空重建，不做迁移 |
| 备份与恢复 | Home 整体离线拷贝，恢复到同一绝对路径（目录记录保存库路径）；加密正文需要原密钥（`tests/home-backup-recovery.test.ts`） | 可随备份一起恢复，也可缺失：下次查询按各来源版本追平或重建 |
| 插件在项目里停用 | 数据保留，动作不可用（`actions.plugin_disabled`） | 该来源的索引内容删除；重新启用后从 owner 数据重建 |
| Runtime 插件卸载 | 安装记录置为已卸载；未要求保留时，Host 删除其私有存储（`retain_private_data` 可保留） | 来源从目录消失后删除其索引内容 |
| 删除项目 | 项目库目录暂存后删除并留回执；Home 级个人库（Pages、Form 等）里按 `project_id` 分区的行**目前不清理**，不要假设删除项目会清掉它们 | 该项目的索引内容全部删除（项目不在目录、也没有打开运行环境时） |
| 卸载 `--purge` | 清除 `PERSONAL_HOME_SQLITE_STORES` 列出的 Home 级库（含 `search`）与用户项目，须再次确认 | 随之删除 |

派生数据只是可重建的缓存，从不被当作业务事实读取或写回；业务事实的读取总是回到 owner 的动作。

## 2. Exchange

`packages/exchange` 目前不存在（`absent`），下面是目标设计：它提供 Envelope、路由、顺序、CAS、ACK、Cursor、Replay、Blob、Quota、Retention 与审计，Server 只理解官方 Envelope 外壳和平台控制字段，不解释 Plugin payload。

```text
Local Module / Plugin
→ Artifact Envelope
→ Exchange client
→ Lightweight Server
→ Exchange client
→ Receiving Local Host
→ compatible Module / Plugin consumer
```

接收方没有兼容 Plugin 时，opaque Artifact 仍可保存、同步和重放；以后安装 consumer 再解释。

## 3. Exchange 与 Sync 分工（目标设计）

- Exchange 拥有传输事实：接受、顺序、重放、Blob、ACK/Cursor、CAS。
- Sync & Replication Module 拥有业务事实：发布意图、replica、冲突、等待 consumer、用户处置和 materialized version。
- Server Receipt 只表示传输结果，不表示本地业务对象已成功 materialize。
- 默认按 Team Project 使用独立数据密钥；Plugin 只声明共享目标，不实现密码学。

当前没有 Exchange/Sync 实现：`packages/exchange` 与 `modules/sync-replication` 都是 `absent`，未来实现需独立 Spec。
