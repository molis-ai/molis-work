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
| 删除项目 | 项目库目录暂存后删除并留回执；回执同时为每个登记的数据所有者记一步（`project_deletion_steps`），目录提交后各所有者清掉自己按 `project_id` 保存的数据：Pages、Form（含全部回答）、Dataset、PPT、Workflows、Todo、Functions 的场景绑定与判断记录、灵光、Images（含图片文件）、炼金术士（关闭并移出运行环境、删除其目录）、插件创作台（构建、发布包、已保存的密钥）、记忆（项目与其角色，含账本历史）、助理工作。某一步失败、被所有者推迟，或所有者不在收尾的进程里，回执都保持 pending 并带着错误，用同一个删除请求重试，和暂存目录的清理一样；运行中的 Molis Work（Web 服务）启动时和运行期间每分钟都会把所有这样的回执接着做完；确认框列出这些数据。记忆放在 Agent 运行环境里，只有执行进程（Web 服务、进程内嵌入式 MCP）会为这一步启动它：命令行、卸载程序和只转发到常驻 Host 的 stdio MCP 在 Home 有 Agent 运行环境时把记忆一步留给 Web 服务（Home 有搜索索引时命令行、卸载程序同样留下搜索一步），执行进程里运行环境正被另一个进程使用时也先推迟。演示项目的 id 固定：再创建（之前删除过）前所有所有者都会先清一遍，回执里这些步骤没做完、或所有者在当前进程里不可用而没有回执证明它已做过时，演示项目不会再创建；重建不写回执：能清的所有者先清，运行环境正被占用（只需等待）就在改动任何东西之前拒绝，服务属于另一个进程的所有者（命令行没有 Agent 运行环境和搜索索引）留给运行中的 Molis Work，结果的 `owners_left` 列出它们。**尚未清理**：工作 Session 记录（`sessions/`）与助理工作在 Prologue 里的对话记录（Session 注册表和 Agent Host 都没有删除入口）、Feed 证据库里按内容寻址且全 Home 共用的加密正文（见下一行） | 该项目的索引内容全部删除（运行中的 Host 在所有者步骤里直接删；否则项目不在目录、也没有打开运行环境时下次查询追平） |
| 删除 Feed 来源并连同本地历史 | 来源的 Item、Material、拉取记录与故障条目从项目库删除；Home 证据库（`{home}/feed/evidence`）里按内容寻址、全 Home 共用的加密正文，和项目库里 SEL 为每次拉取保存的记录，在同一次删除里清理：只删没有任何项目的 Material 或拉取收据引用的正文，任何一个项目库读不出来时一律保留（事件 `feed_source.history_released` 记结果）。删除整个项目不走这条路径，其正文留在证据库里 | 不涉及 |
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
