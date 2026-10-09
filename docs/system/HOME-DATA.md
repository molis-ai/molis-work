# Home 数据：库与文件的 owner 表

一个 Home（默认 `~/.molis-work`，用 `MOLIS_WORK_HOME` 或入口的 `--home` 改写，解析在 `packages/storage/src/adapters/local-security-paths.ts:19`）下，每个库、每类文件归谁、怎样记版本、要不要备份、`uninstall --purge-user-data` 清不清。这是反腐败计划交付第 11 项（路线图 `specs/repository-anti-corruption/roadmap-2026-10-07.md` §4.11，进度见同目录的 `spec.md`）。

- 基线是 origin/main `15c20920`（2026-10-07）。每一行都由代码推出，并写出打开它的代码位置；代码改了，对应行跟着改，行号会漂移。
- 第 10 节的真实 Home 清单只用 `ls`、`stat`、`find`、`du` 看了名字、大小和日期，没有打开任何库或数据文件，也没有读任何密钥文件。所以真实库当前盖的是哪个版本，没有核对。只有一处例外，是为了回答旧启动脚本还有没有人在用：读了启动脚本 `bin/goalboard-mcp` 本身（约 1 KB，不含密钥），用 `grep -o` 只取出 Runtime 配置里含 `molis-work` 或 `goalboard` 的路径，用 `ps` 看了在跑的进程的命令行。
- 还没有的：Home 存储的统一登记（`PERSONAL_HOME_SQLITE_STORES` 只列了 17 项，见第 9 节）、产品里的备份命令、检查“每个库都登记、都有版本”的门禁。这些落地之前，本表是唯一的清单；不要假设有别的清单在替它兜底。

## 1. 怎么读

路径从仓库根写起；`installer/X` 指 `apps/local-host/src/installer/X`；一行里以 `src/` 开头的文件，相对这一行前面写出的包目录；`:N` 紧跟在上一个文件后，指同一个文件的第 N 行。Prologue SDK 的文件写作 `node_modules/@prologue/sdk/<路径>`：包本体是 `vendor/prologue-sdk/` 里的 .tgz，里面的文件在 `vendor/` 下找不到；`pnpm install` 后解在 `horizontal/agent-host/node_modules/@prologue/sdk/`（只有 agent-host 依赖它）。

| 列 | 含义 |
| --- | --- |
| owner | 定义这个库或文件的结构、并且是唯一写者的目录。写“宿主”的，结构定义在 `apps/local-host`，宿主是事实上的 owner，这是否合理见第 11 节。 |
| 种类 | SQLite 带版本：经 `applySqliteBaseline`（`packages/storage/src/sqlite-baseline.ts:31`）建库，版本不符就拒绝，不就地升级。SQLite 自带版本：用自己的 meta 表或自己读写 `user_version`。SQLite 无版本。JSON 文件。加密文件。目录。WAL 表示打开时设了 `journal_mode = WAL`，旁边会有 `-wal`、`-shm`；没写 WAL 的是 SQLite 默认回滚日志，旁边可能有 `-journal`。 |
| 版本 | 版本方案和现行版本。 |
| 备份 | 必备份：用户事实或配置，丢了不可再得。密钥：密钥或凭据，必须和它加密的数据取同一时点，不进共享位置与日志。可重建：删了代码会重建。日志：不必备份。前四类是路线图的分类；程序（安装器写入，可由安装包重装）和临时（锁、暂存、残留，从不备份）是本表为了把安装物和锁文件放进同一张表加的。 |
| 卸载 | `purge` 指 `uninstall --purge-user-data`，删除 `apps/local-host/src/installer/uninstall.ts:44-56` 列出的路径。“普通”指不带 purge 的 `uninstall`，只删安装器自有的程序文件（`apps/local-host/src/installer/uninstall-files.ts:15-48`）。“否”表示两者都不碰。 |

## 2. 总览

Home 里有 29 种 SQLite 文件：权威库 25 种（Home 级 22 种，按项目 3 种）、派生库 1 种、锁库 3 种。25 种权威库按版本方案分：

| 版本方案 | 个数 | 哪些 |
| --- | --- | --- |
| `PRAGMA user_version`，经 `applySqliteBaseline` | 20 | 项目库（6）、Alchemist 工作室库、assistant（2）、memory（2）、placement、agent-definitions、connectors、context-onboarding、functions（3）、10 个个人插件库、server |
| 自己的 meta 表 | 2 | `projects/catalog.db`（`catalog_meta`，22）、`sessions/sessions.db`（`session_meta`，7） |
| 自己读写 `user_version` | 1 | `characters/characters.sqlite`（1） |
| 没有版本 | 2 | `plugins/experiments/private.sqlite`、`alchemist/projects/<id>/search.sqlite` |

派生库 `search/search.db` 用 `search_meta`，版本不符就重建，不属于“拒绝”。

真实 Home 一级条目 41 个（第 10 节）：37 个有 owner，4 个没有。

## 3. SQLite 权威库

### 3.1 项目、会话与目录

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| `projects/catalog.db` | 宿主；`apps/local-host/src/project-catalog.ts:246-248` 打开，`apps/local-host/src/catalog-schema.ts:11-22` 建表，表归各模块（4.1） | SQLite 自带版本 · WAL · `catalog_meta.schema_version` = 22（`apps/local-host/src/project-catalog-contract.ts:1`），不符拒绝（`assertCurrentCatalog`，`apps/local-host/src/catalog-schema.ts:32`） | 必备份。存各项目库的绝对路径（`modules/projects/src/project-service.ts:61`），只能恢复到原路径（`docs/installation.md` 离线备份一节） | purge（`installer/uninstall.ts:46`） |
| `projects/<project_id>/molis-work.db`，旁边 `-wal`、`-shm` | 宿主；`apps/local-host/src/project-database.ts:21` 套基线，`apps/local-host/src/project-database-schema.ts:37` 拼 29 段建表（4.2）；文件名 `packages/storage/src/adapters/local-security-paths.ts:8` | SQLite 带版本 · WAL · `user_version` = 6 | 必备份，连同 `-wal`、`-shm`，或先 `LocalSqliteStorage.checkpoint()` | purge（`installer/uninstall.ts:46`，整个 `projects/`） |
| `projects/.staging-<project_id>-<uuid>/` | `apps/local-host/src/managed-project-files.ts:42`：新建项目库时的暂存目录 | 目录 | 临时 | purge（在 `projects/` 内） |
| `projects/.staging-<project_id>/` | `apps/local-host/src/demo-project-lifecycle.ts:56`：新建示例项目的暂存目录，建成后改名为 `projects/<project_id>/`，失败时删（`:69`） | 目录 | 临时 | purge（在 `projects/` 内） |
| `projects/.resetting-<project_id>-<uuid>/`、`projects/.reset-backup-<project_id>-<uuid>/` | `apps/local-host/src/demo-project-lifecycle.ts:87-88`：重置示例项目时的新库暂存目录，和被换下的旧库。成功后 `.reset-backup-*` 被删（`:121`），失败时尝试改回（`:113`）；改回也失败就抛 `AggregateError`，消息里写出两个路径（`:116`） | 目录 | 临时（进程在中途被杀时 `.reset-backup-*` 是示例项目的旧库，示例项目可重建） | purge（在 `projects/` 内） |
| `sessions/sessions.db` | `modules/private-work-context`；`src/session-registry.ts:72` 打开，`src/session-schema.ts` 建表（4.3） | SQLite 自带版本 · WAL · `session_meta.schema_version` = 7（`modules/private-work-context/src/session-schema.ts:9`） | 必备份，与 `sessions/content/` 同一时点 | purge（`installer/uninstall.ts:51`） |
| `sessions/content/blobs/**` 与 `sessions/content/content.key` | `modules/private-work-context/src/content-store.ts:30-31`，由 `modules/private-work-context/src/session-registry.ts:79` 创建 | 加密文件（AES-256-GCM，每个 blob 封套 `v: 1`）；密钥是一个 32 字节文件 | blobs 必备份；`content.key` 是密钥：有 blob 而缺密钥时拒绝写入（`modules/private-work-context/src/content-store.ts:46`），不会换新密钥 | purge（`installer/uninstall.ts:51`，整个 `sessions/`） |

### 3.2 助理与平台服务（Home 级）

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| `assistant/assistant.db` | 宿主；`apps/local-host/src/assistant/assistant-http.ts:43` 打开，`apps/local-host/src/assistant/assistant-store.ts:18` 基线、`:158` 套用。基线末尾拼进 `modules/context-ledger` 的 `context_edges`（`:63`），所以这个库有 13 张表，其中一张不归宿主 | SQLite 带版本 · `user_version` = 2 | 必备份 | 否 |
| `memory/memory.db` | `packages/storage/src/adapters/memory-ledger.ts:62-64`，基线 `:22` | SQLite 带版本 · WAL · 2 | 必备份。记忆的正文在 Prologue 条目里（即 `agent-runtime/`），账本只存修订、候选、使用回执等（`packages/storage/src/adapters/memory-ledger.ts:13-17`），两者取同一时点 | purge（`memory` 在 `PERSONAL_HOME_SQLITE_STORES`） |
| `placement/placement.db` | 宿主；`apps/local-host/src/placement-actions.ts:63-64` 打开，`:58` 基线 | SQLite 带版本 · 1 | 必备份 | 否 |
| `agent-definitions/agent-definitions.db` | 宿主；`apps/local-host/src/agent-definitions/agent-definitions.ts:316` 打开，`:20` 基线、`:57` 套用 | SQLite 带版本 · 1 | 必备份（用户改过的提示词与历史） | 否 |
| `connectors/connectors.db` | 5 张表的结构归 `horizontal/connector-host`（`src/connection-store.ts:51`、`src/protocol-store.ts:19`）；第 6 张 `connector_authorization_results`（授权回执）由宿主自己定义（`apps/local-host/src/connectors-store.ts:9-12`）；宿主 `:8` 组装、`:15` 打开 | SQLite 带版本 · 1 | 必备份。只存 `credential_ref`，凭据本体在 `feed/secrets.json` | purge |
| `context-onboarding/context-onboarding.db` | 宿主；`apps/local-host/src/context-onboarding-store.ts:46` 打开、`:51` 套用，`:44` 基线 | SQLite 带版本 · 1 | 必备份 | purge |
| `functions/functions.db` | `modules/functions/src/store.ts:452`，基线 `:399` | SQLite 带版本 · 3 | 必备份 | purge |
| `characters/characters.sqlite` | `modules/characters/src/open.ts:12-24`，由 `apps/local-host/src/characters-host.ts:19` 打开 | SQLite 自带版本 · 自己读写 `user_version`，现行 1，只拒绝更高的版本（`modules/characters/src/open.ts:16-17`）；不走 `applySqliteBaseline`，用 `CREATE TABLE IF NOT EXISTS` 建表 | 必备份 | 否 |

各库的表（除注明的外都归该库的 owner）：assistant（13 张）：`assistant_works`、`assistant_rounds`、`assistant_cards`、`assistant_settings`、`assistant_notices`、`assistant_followups`、`assistant_undos`、`assistant_jobs`、`assistant_usage`、`assistant_unsettled`、`assistant_observed`、`assistant_requests`，以及来自 `modules/context-ledger` 的 `context_edges`（`apps/local-host/src/assistant/assistant-store.ts:63` 把 `CONTEXT_LEDGER_SCHEMA` 拼进基线）。memory：`memory_revisions`、`memory_candidates`、`memory_changes`、`memory_prefs`、`memory_signal_events`、`memory_uses`、`memory_owners`、`memory_pairs`、`memory_markers`。placement：`context_edges`（来自 `modules/context-ledger`）、`placement_titles`。agent-definitions：`prompt_overrides`、`prompt_history`、`prompt_uses`。connectors：`connector_connections`、`connector_bindings`、`connector_connection_targets`、`connector_protocols`、`connector_authorization_sessions` 归 `horizontal/connector-host`，`connector_authorization_results` 由宿主定义（`apps/local-host/src/connectors-store.ts:9-12`）。context-onboarding：`journeys`。functions：`functions`、`function_judgments`、`function_scene_bindings`。characters：`character_drafts`。

### 3.3 个人插件库（Home 级，`{home}/<名>/<名>.db`）

路径由 `homeSqlitePath` 给出（`packages/storage/src/home-sqlite.ts:28`），目录权限 0700、文件 0600（`:32-43`）。备份都是必备份，卸载都是 purge（目录在 `PERSONAL_HOME_SQLITE_STORES`，`packages/storage/src/home-sqlite.ts:6-24`）。库里按 `project_id` 分区的行，删除项目时由各 owner 清理（`docs/platform/STORAGE-AND-EXCHANGE.md:21`；各插件包的 `project-data.ts`，登记在 `apps/local-host/src/project-deleted-owners.ts`）。`lingguang/` 目录里除库以外还有 `imports/`、`models/`、`material-upload-*`，见 6.2。

| 路径 | owner 与打开它的代码 | 版本 · 日志 | 表 |
| --- | --- | --- | --- |
| `images/images.db` | `plugins/native/images/src/store.ts:50`、`:57`，基线 `:17` | 1 · 回滚 | `connections`、`jobs` |
| `pages/pages.db` | `plugins/native/pages/src/store.ts:463`，基线 `:433` | 1 · 回滚 | `pages`、`folders`、`page_generations`、`page_changes`、`page_imports` |
| `form/form.db` | `plugins/native/form/src/store.ts:381`，基线 `:350` | 2 · 回滚 | `forms`、`submissions`、`form_copies` |
| `dataset/dataset.db` | `plugins/native/dataset/src/store.ts:310`，基线 `:283` | 1 · 回滚 | `datasets`、`dataset_versions`、`dataset_receipts` |
| `ppt/ppt.db` | `plugins/native/ppt/src/store.ts:239`，基线 `:218` | 1 · 回滚 | `presentations`、`presentation_copies` |
| `lingguang/lingguang.db` | `plugins/native/lingguang/src/store.ts:282`，基线 `:246` | 1 · 回滚 | `sparks`、`conversations`、`spark_requests`、`messages` |
| `todo/todo.db` | `plugins/native/todo/src/store.ts:522-524`，基线 `:464` | 1 · WAL | `todo_items`、`todo_changes`、`todo_requests`、`todo_batches`、`todo_source_memory` |
| `jelly/jelly.db` | `plugins/native/jelly/src/store.ts:97-100`，基线 `:89` | 1 · WAL | `jelly_workspace`、`jelly_note_versions`、`jelly_history`、`jelly_previews` |
| `cognia/cognia.db` | `plugins/native/cognia/src/store.ts:146-148`，基线 `:136` | 1 · WAL | `cognia_domains`、`cognia_sources`、`cognia_materials`、`cognia_versions`、`cognia_previews`、`cognia_drafts` |
| `workflows/workflows.db` | `plugins/native/workflows/src/store.ts:195-197`，基线 `:166` | 1 · WAL | `workflows`、`instances` |

`tests/home-store-baselines.test.ts` 把这些基线（以及 3.2 里的 assistant、memory、functions、placement、agent-definitions、connectors、context-onboarding）和 `tests/fixtures/home-store-schemas/` 下取自存量库的结构夹具比对；`scripts/stamp-store-baselines.mjs` 是给存量库盖版本的一次性工具。

### 3.4 其他按 Home 与按项目的库

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| `plugins/experiments/private.sqlite` | 宿主；`apps/local-host/src/experiments-native-plugin-http.ts:15`，表来自 `packages/plugin-runtime` 的 `PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL`（`plugin_private_values`） | SQLite 无版本 · WAL · 用 `CREATE TABLE IF NOT EXISTS` 建表，旧库、新库没有区别 | 必备份 | 否 |
| `server/server.sqlite` | `server`；`server/src/database.ts:34-37` 打开，基线 `:29`；本机由 `apps/local-host/src/im-server.ts:13` 挂载。右栏「讨论」页签的群聊与 Thread 存在这里（在用、还会迭代的功能，`specs/repository-anti-corruption/spec.md` §1，2026-10-08「右栏『讨论』页签与 IM 代码」） | SQLite 带版本 · WAL · 1 | 必备份（第 7 节 E 组，连同 `-wal`、`-shm`，或先 `LocalSqliteStorage.checkpoint()`）。库里有聊天正文、成员显示名和登录会话的令牌哈希，没有凭据本体 | purge（`server` 在 `PERSONAL_HOME_SQLITE_STORES`，整个目录；普通卸载保留） |
| `alchemist/projects/<编码后的 project_id>/studio.sqlite` | `plugins/native/alchemist`；路径 `apps/local-host/src/alchemist-paths.ts:4`（`alchemistProjectDirectory`；`apps/local-host/src/alchemist-service-host.ts:49` 在其下拼 `studio.sqlite`），建库 `src/studio/server/db/schema.ts:480`，基线 `:8` | SQLite 带版本 · WAL · 1 | 必备份 | purge（`alchemist` 在 `PERSONAL_HOME_SQLITE_STORES`，整个目录） |
| `alchemist/projects/<编码后的 project_id>/search.sqlite` | 宿主；`apps/local-host/src/alchemist-search.ts:14`（目录同样由 `apps/local-host/src/alchemist-paths.ts:4` 给出），表 `feed_runtime_blobs` 来自 `packages/storage` 的 `LOCAL_OPAQUE_BLOB_SCHEMA_SQL` | SQLite 无版本 · WAL | 必备份（研究报告引用的证据，重取要花外部请求）；只在用过搜索后才出现 | purge（同上） |

工作室库的表（36 张）：`workspaces`、`workspace_actors`、`directions`、`exploration_runs`、`ideas`、`idea_cards`、`idea_versions`、`jobs`、`job_events`、`ui_context`、`activity_events`、`mvp_scope_versions`、`research_plans`、`lens_runs`、`evidence`、`lens_reports`、`claims`、`claim_evidence`、`decisions`、`source_settings`、`pulse_runs`、`source_fetches`、`supply_signals`、`pulse_reports`、`pulse_report_signals`、`opportunities`、`opportunity_signals`、`annotations`、`action_proposals`、`taste_rules`、`research_playbook_rules`、`memory_rule_applications`、`conversation_messages`、`runtime_settings`、`research_playbook_revisions`、`work_reuse_receipts`。其中 `conversation_messages`、`runtime_settings` 在 `src/studio/server/db/schema.ts:412`、`:424` 用带引号的标识符建表，按 `CREATE TABLE [a-z_]+` 扫描会漏掉它们。工作室库的 `workspaces` 与目录库的同名表、`jobs` 与 Images 的同名表是互不相干的表；炼金术士的表名（`workspaces`、`jobs`、`evidence`、`claims`）与平台库重名，因为每个项目一个独立的 `studio.sqlite`，不会冲突，`specs/repository-anti-corruption/spec.md` §9.5 第 9 条定为不改。

server 库的表：`mw_server_identity`、`mw_members`、`mw_sessions`、`mw_projects`、`mw_access`、`mw_codes`、`mw_commands`、`mw_events`（`server/src/database.ts`），以及 IM 的 `im_rooms`、`im_members`、`im_threads`、`im_messages`、`im_thread_context`、`im_receipts`、`im_read_positions`（`server/src/im/schema.ts`）。

## 4. 共享文件里的表归谁

一个 SQLite 文件里可以有多个 owner 的表。结构由宿主按 owner 导出的建表语句拼出；owner 导出，宿主只拼装。

### 4.1 `projects/catalog.db`（v22）

| owner | 表 |
| --- | --- |
| `packages/storage` | `catalog_meta`（`src/catalog-metadata.ts`） |
| `modules/projects` | `projects`、`project_plugins`、`project_plugin_exclusions`、`project_events`、`project_deletions`、`workspaces`、`workspace_project_memberships`（`src/repository.ts`），`project_deletion_steps`（`src/deletion-steps.ts`） |
| `modules/private-work-context` | `runtime_context_bindings`、`runtime_context_binding_events`、`runtime_context_setup_requests`、`runtime_context_suggestion_rejections` |
| `modules/goals` | `personal_planning_method_packs`（`src/planning/personal-methods.ts`） |
| `modules/context-ledger` | `context_edges` |
| `apps/desktop` | `goal_desktop_panels`、`goal_desktop_panel_aliases`（`src/adapters/sqlite-panels.ts`） |
| `apps/local-host` | `model_providers`（`src/model-provider-store.ts`）：模型供应商配置，只存 `credential_ref` |

### 4.2 `projects/<id>/molis-work.db`（v6）

29 段建表语句，来自 16 个目录（`apps/local-host/src/project-database-schema.ts:37-70`，合并在 `:69`）：

| owner | 段 | 表 |
| --- | --- | --- |
| `modules/goals` | `GOAL_BOARDS_SCHEMA_SQL` | `boards` |
| | `GOALS_SCHEMA_SQL` | `goals`、`acceptance_criteria`、`goal_relations`、`goal_trash_records`、`goal_trash_relation_records`、`policy_bindings`、`project_guidance_entries`、`project_guidance_revisions`、`planning_method_packs` |
| | `GOAL_INPUT_BINDINGS_SCHEMA_SQL` | `input_bindings` |
| | `GOAL_EVENT_FACTS_SCHEMA_SQL` | `goal_event_configs`、`goal_event_config_versions`、`goal_event_types`、`goal_event_requirements`、`goal_event_requirement_bindings`、`goal_work_events`、`goal_work_event_judgments` |
| | `GOAL_EVENT_STATE_SCHEMA_SQL` | `goal_event_state_owners`、`goal_event_agreements`、`goal_event_progress_summaries`、`goal_event_concerns`、`goal_event_decision_requests`、`goal_event_applied_decisions`、`goal_event_requirement_conclusions`、`goal_event_closures`、`goal_event_work_status` |
| `modules/governance-collaboration` | `GOVERNANCE_SCHEMA_SQL` | `goal_tree_proposals`、`goal_tree_proposal_items`、`goal_tree_proposal_decisions`、`goal_event_trusted_decisions` |
| `modules/artifacts` | `ARTIFACTS_SCHEMA_SQL` | `library_artifacts`、`library_artifact_versions`（成果库） |
| | `PROCESS_ITEMS_SCHEMA_SQL` | `process_items`、`process_item_versions`（过程项，不进成果库） |
| `packages/storage` | `LOCAL_JOURNAL_SCHEMA_SQL` | `events`、`idempotency_records`（共享日志，见 4.5） |
| | `LOCAL_OPAQUE_BLOB_SCHEMA_SQL` | `feed_runtime_blobs` |
| `modules/context-ledger` | `CONTEXT_LEDGER_SCHEMA` | `context_edges` |
| `modules/sources` | `SOURCES_SCHEMA_SQL` | `feed_sources`、`source_events` |
| `modules/signals` | `SIGNALS_SCHEMA_SQL` | `signals`、`signal_revisions`、`signal_events` |
| `horizontal/listener-host` | `LISTENER_HOST_SCHEMA_SQL` | `listener_instances`、`listener_deliveries`、`feed_source_runs` |
| `modules/attention-resumption` | `ATTENTION_SCHEMA_SQL` | `inbox_entries`、`attention_events` |
| `modules/feed` | `FEED_SCHEMA_SQL` | `feed_items`、`feed_materials`、`feed_item_events` |
| `plugins/native/feed` | `FEED_OUT_RULES_SCHEMA_SQL` | `feed_out_rules` |
| `packages/plugin-runtime` | `PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL` | `plugin_runtime_installs` |
| | `PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL` | `plugin_runtime_release_artifacts` |
| | `PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL` | `plugin_private_values`（每个启用的 Runtime 插件的私有值） |
| | `PLUGIN_EVENTS_SCHEMA_SQL` | `plugin_events`、`plugin_event_cursors`、`plugin_event_resolutions` |
| | `PLUGIN_WIRING_SCHEMA_SQL` | `plugin_port_bindings`、`plugin_port_artifact_bindings`、`plugin_input_groups`、`plugin_port_outputs` |
| `horizontal/scheduler` | `SCHEDULER_SCHEMA_SQL` | `schedule_jobs`、`schedule_wakeups` |
| `plugins/native/schedule` | `SCHEDULE_TASKS_SCHEMA_SQL` | `schedule_conversation_tasks`、`schedule_conversation_turns` |
| | `SCHEDULE_REMINDERS_SCHEMA_SQL` | `schedule_plugin_reminders` |
| | `SCHEDULED_OPERATIONS_SCHEMA_SQL` | `schedule_operations`、`schedule_operation_occurrences` |
| `plugins/native/coding` | `CODING_SCHEMA_SQL` | `coding_sessions`、`coding_plan_drafts` |
| `apps/local-host` | `PROJECT_BROWSING_SETTINGS_SCHEMA_SQL`（`src/project-browsing-settings.ts`） | `project_browsing_settings` |
| | `CASEBOOK_SCHEMA_SQL`（`src/casebook/journal.ts`） | `casebook_interaction_scopes`、`casebook_interaction_facts`、`casebook_goal_contexts`、`casebook_interaction_audit_keys`、`casebook_interaction_actions` |

owner 们仍会在打开时对自己的表执行 `IF NOT EXISTS`，在这里是空操作；改任何一段都要提高项目库的版本（`apps/local-host/src/project-database-schema.ts:31-35`）。

### 4.3 `sessions/sessions.db`（v7）

`session_meta`、`sessions`、`session_messages`、`session_events`、`session_handoffs` 归 `modules/private-work-context`（`src/session-schema.ts`）；`context_edges` 归 `modules/context-ledger`，由 `apps/local-host/src/session-registry.ts:10` 注入。

### 4.4 `placement/placement.db`、`assistant/assistant.db`、`server/server.sqlite`

见 3.2、3.4：placement 是 `context_edges` 加宿主的 `placement_titles`；assistant 是宿主的 12 张 `assistant_*` 加 `context_edges`；server 是 `server` 包的 `mw_*` 与 `im_*`。`modules/context-ledger` 的 `context_edges` 因此在 5 个文件里各有一份同样的表：目录库、项目库、`sessions.db`、`placement.db`、`assistant.db`。

### 4.5 共享日志表与已知的跨 owner 直接 SQL

- `events` 和 `idempotency_records` 由 `packages/storage` 定义（`src/sqlite.ts`），由 `modules/goals`（`src/repository.ts:246`、`:282`）、`modules/governance-collaboration`（`src/repository.ts:87`、`src/proposal-operation-store.ts:68`）和 storage 自己的 `LocalSqliteJournal`（`packages/storage/src/sqlite.ts:65`、`:113`）直接写。`modules/artifacts`（`src/repository.ts:121`）不写，但直接读 `events` 取游标（`MAX(seq)`）；goals（`src/repository.ts:239`）和 governance（`src/repository.ts:39`）也直接读同一个游标。路线图把 goals、artifacts、governance 三个模块都算作直接读写者，W2-06 的允许名单要把读者一起列上。这是有意共享，但还没有门禁约束只能经日志 API 读写。
- 还在的跨 owner 直接 SQL 共 4 处，计划在 W2-06 去掉：`apps/local-host/src/coding-background-tasks.ts:44` 读 Coding 的 `coding_sessions`；`apps/local-host/src/demo-seed.ts:622` 更新 Goals 的 `boards`；`apps/local-host/src/im-server.ts:56`、`:60` 读 `server` 的 `mw_projects`、`mw_members`；`modules/projects/src/installation-inspection.ts:10` 读 storage 的 `catalog_meta`。

## 5. 派生库与锁库

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| `search/search.db` | `packages/storage/src/adapters/text-search-index.ts:128-146` | SQLite 自带版本 · WAL · `search_meta` 的 `schema` = "2"（`:22`）。缺失、损坏或版本不符时清空重建，这是唯一不拒绝的库 | 可重建 | purge（`search` 在 `PERSONAL_HOME_SQLITE_STORES`） |
| `agent-runtime/.molis-runtime-owner.db` | `horizontal/agent-host/src/adapters/prologue-storage-owner.ts:8`：宿主持有 `BEGIN EXCLUSIVE` 来证明自己是 `agent-runtime/` 的唯一执行者 | 锁库，0 字节 | 临时 | 否 |
| `images/runners/<uuid>.db` | `plugins/native/images/src/store.ts:48`：每个 Images 进程一个锁文件，用来判断“运行中”的任务属于已死进程 | 锁库 | 临时 | purge（`images` 目录） |
| `feed/secrets.lock.sqlite` | `packages/storage/src/adapters/file-secret-store.ts:86`：跨进程互斥用，从不存密钥 | 锁库 | 临时 | 否 |

## 6. 非 SQLite 状态

### 6.1 Agent 运行时、凭据与证据

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| `agent-runtime/records/<kind>/<id>.json` | Prologue SDK 的 `NodeStorage`（vendored 包 `@prologue/sdk`，文件 `node_modules/@prologue/sdk/dist/host/plugin/node-storage.js`），根目录由 `apps/local-host/src/agent-runtime-paths.ts:4` 给出（`apps/local-host/src/system-agent-service.ts:48` 传给 Agent 服务）。`<kind>` 有 SDK 的（`dispatch`、`io.molis.work~runs`、`~sessions`、`~effects` 等）和宿主的 `molis-agent-index-<hash>`、`molis-git-review-<hash>`、`molis-project-work-<hash>`（`horizontal/agent-host/src/adapters/prologue-node.ts:530`、`:278`、`:582`） | JSON 文件，临时文件加 fsync 加原子改名；元数据明文，安全正文（若有）用 `storage.key` 加密 · 没有存储格式版本，只有每条记录乐观并发用的 `version` | 必备份（运行、会话、副作用回执、记忆条目都在这里），与 `storage.key` 同一时点 | 否 |
| `agent-runtime/checkpoints/` | SDK（`node_modules/@prologue/sdk/dist/host/plugin/node.js:181`）：检查点索引，重启后还在 | JSON 文件 · 无版本 | 必备份（与 `records/` 同一时点） | 否 |
| `agent-runtime/leases/` | SDK（`node_modules/@prologue/sdk/dist/host/plugin/node.js:174-177`）：持有者写成 `pid-<进程号>` | 目录 · 无版本 | 临时 | 否 |
| `agent-runtime/storage.key` | SDK `node_modules/@prologue/sdk/dist/host/plugin/node-storage.js`（`KEY_FILE`，`:6`）：32 字节，首次以 `wx` 创建，0600 | 密钥文件 | 密钥：丢了 `records/` 里的加密正文读不出 | 否 |
| `agent-runtime/image-intake/` | `horizontal/agent-host/src/adapters/prologue-node.ts:876` | 目录 | 临时 | 否 |
| `git-operation-details.json`（Home 根目录） | `apps/local-host/src/agent-host-composition.ts:162`：Git 操作审查产生的细节文字，按审查键存 | JSON 文件 · 无版本 | 必备份，与 `agent-runtime/` 同一时点（`molis-git-review-*` 记录里只有回执） | 否 |
| `feed/secrets.json` | `packages/storage/src/adapters/file-secret-store.ts:82`；`SecretStore` 的密文，含模型 API Key、连接器凭据、Feed 证据密钥（`apps/local-host/src/project-catalog.ts:179`、`apps/local-host/src/agent-connector-ports.ts:33`） | JSON，AES-256-GCM 封条 · 文件字段 `version` = 2（`packages/storage/src/adapters/file-secret-store.ts:60`），旧格式拒绝 | 密钥。主密钥在 macOS Keychain，不在 Home 里（第 8 节） | 否 |
| `feed/secrets.key` | `packages/storage/src/adapters/file-secret-store.ts:134`：没有 Keychain、没有 `MOLIS_WORK_ENCRYPTION_KEY` 时的安装密钥文件 | 密钥文件 · 0600 | 密钥；真实 Home 里不存在，用的是 Keychain | 否 |
| `feed/evidence/blobs/**`、`feed/evidence-recovered-v2/blobs/**` | `packages/storage/src/adapters/evidence-content.ts:46-47`（恢复根目录是 `<根>-recovered-v2`，`:47`）：Feed 证据正文，引用形如 `molis-work-feed/sha256/<hash>` | 加密文件 · 无存储版本 | 必备份，但没有 `secrets.json` 加 Keychain 主密钥就读不出（密钥引用 `system:feed:evidence-content-key:v1`、`:v2`，`:15-16`） | 否 |
| `alchemist/projects/<id>/search-content/`，及其 `-recovered-v2` | `apps/local-host/src/alchemist-search.ts:23`：同一个证据存储，根目录换了 | 加密文件 · 无存储版本 | 必备份，同上需要密钥 | purge（`alchemist` 目录） |

### 6.2 文件型状态

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| `shelf/catalog.json`、`shelf/files/<item>/`、`shelf/jobs/<job>/` | `modules/shelf/src/store.ts:848`（`catalog.json` 路径）、`:132-133`（建 `files/`、`jobs/`）、`:877`（打开）；桌面壳也读 `catalog.json`（`apps/desktop/adapters/tauri/src/shelf_http.rs:118`） | JSON 加文件 · `catalog.json` 的 `version` = 1（`modules/shelf/src/store.ts:64`） | 必备份 | purge（`installer/uninstall.ts:52`） |
| `browser/sites.json` | `apps/local-host/src/browser/browser-surfaces.ts:36`：侧栏浏览器允许、拒绝了哪些站点，助理能否使用浏览器 | JSON · `version` = 1（`:61`） | 必备份 | 否 |
| `browser/profile/` | `apps/local-host/src/browser/browser-host.ts:81`：侧栏浏览器的 Chrome 用户数据目录（`--user-data-dir`，`:147`），含该浏览器里登录过的站点的 Cookie 等登录态 | 目录（Chrome 自己的格式） | 密钥（登录态）；除登录态外可重建 | 否 |
| `browser/downloads/`、`browser/uploads/`、`browser/browser.pid` | `apps/local-host/src/browser/browser-host.ts:82-83`、`:206` | 目录、PID 文件 | 临时 | 否 |
| `plugin-builder/<project_id>/{design,builds,releases,runs}/` | `apps/local-host/src/plugin-builder/agent-surface.ts:133`（根）、`:244`（design）、`:253`（builds）、`:297`（releases）、`:247`（runs）。`runs/<build>/` 是一份独立的 Prologue 存储根，有自己的 `storage.key` | 文件目录 · 无版本 | 必备份（Agent 生成的插件源码、设计稿、发布包） | 否 |
| `cache/research-library/<sha256>/` | `apps/local-host/src/research-library-source.ts:17`：研究库仓库的 bare Git 缓存 | Git 目录 | 可重建 | 否 |
| `jelly/preferences.json` | `apps/local-host/src/jelly-model.ts:16`：Jelly 选中的模型 | JSON · `schema_version` = 1 | 必备份 | purge（`jelly` 目录） |
| `characters/runs/character-*/` | `apps/local-host/src/character-native-execution.ts:18-20`：交给外部 Agent 执行时临时写出的角色包 | 目录 | 临时 | 否 |
| `images/assets/` | `plugins/native/images/src/service.ts:37`：生成的图片文件 | 文件目录 · 无版本 | 必备份 | purge（`images` 目录） |
| `lingguang/imports/<sha256><ext>` | 旧版本留下的上传原始副本；现行 `apps/local-host/src/jelly-native-material.ts` 不再写，也没有代码读，上传的文件只在内存里提取文字（读取不保存灵光，副本没有读者也没有主人）。旧 Home 里已有的文件可以直接删除 | 文件目录 · 无版本 | 可重建（不会再被读取；删除不影响任何记录） | purge（`lingguang` 目录） |
| `lingguang/models/` | `apps/local-host/src/jelly-native-material.ts` 的 `modelCacheDirectory`：音视频素材转写用的模型缓存目录（报错文案里叫“素材模型缓存目录”），用户允许下载时本机辅助程序往里下载（`apps/local-host/src/material-native.ts:52`、`:61`）；只在上传音视频素材时创建 | 目录 · 无版本 | 可重建（重新下载） | purge（`lingguang` 目录） |
| `directory-access/bookmarks.json` | `apps/desktop/adapters/tauri/src/context_directories.rs:109-125`：桌面壳保存的目录授权书签。设了 `MOLIS_WORK_HOME` 时在 Home 里，否则在应用数据目录（第 8 节） | JSON · 无版本 | 授权书签与机器绑定，换机后失效，按可重建对待 [推断，未读格式] | 否 |

### 6.3 配置、日志与安装物

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| `config/installation.json` | 安装器；`apps/local-host/src/installer/home.ts:27`、`:92` | JSON · `schema_version` = 4（`installer/home-contract.ts:9`） | 程序 | 普通（`installer/uninstall-files.ts:22`） |
| `config/web-control-token` | `apps/local-host/src/web-control-token.ts:6`；缺失时生成 32 字节随机值，0600；桌面壳也读（`apps/desktop/adapters/tauri/src/shelf_http.rs:348`） | 文本 · 无版本 | 密钥，可重建（重建会使旧持有者失效） | 普通（有效时，`installer/uninstall-files.ts:25-29`） |
| `config/web-service.json` | `apps/local-host/src/installer/web-service-platform.ts:36`：常驻 Web 服务的所有权收据 | JSON · `schema_version` = 1（`installer/web-service-contract.ts:54`） | 程序 | 普通（移除服务时随 plist 删，`installer/web-service-operations.ts:110-111`） |
| `config/uninstall.json` | `installer/uninstall.ts:20`：卸载进度收据 | JSON · `schema_version` = 1 | 临时 | purge 成功后删（`installer/uninstall.ts:190`）；普通卸载保留 |
| `config/onboarding.json` | `apps/local-host/src/onboarding.ts:6`：首次引导状态，0600（`:99`） | JSON · `schema_version` = 1 | 必备份（很小） | 否 |
| `config/project-arrival.json` | `apps/local-host/src/project-arrival.ts:11`：最近打开的项目与到达状态，0600（`:66`） | JSON · `schema_version` = 1 | 必备份（很小） | 否 |
| `config/mcp-tools.json` | `apps/local-host/src/mcp-settings-store.ts:16`：MCP 客户端的动作授权 | JSON · `version` = 2（`:15`） | 必备份（授权不能丢，也不能凭空恢复） | 否 |
| `config/external-mcp-tools.json`、`config/connector-mcp-tools.json` | `apps/local-host/src/external-mcp-actions.ts:10`、`apps/local-host/src/connector-mcp-actions.ts:12`：见过的工具清单 | JSON · 无版本 | 可重建；真实 Home 里还没有 | 否 |
| `config/casebook.json` | `apps/local-host/src/casebook/config.ts:10`：用户提供的 Casebook 授权，可选 | JSON · `version` = 1（`:16`） | 必备份 | 否 |
| `logs/web-service.log`、`logs/web-service.error.log` | `installer/web-service-platform.ts:37-38`：LaunchAgent 的标准输出与错误 | 文本 | 日志 | purge（`installer/uninstall.ts:48`） |
| `logs/action-calls.jsonl` | `apps/local-host/src/action-call-log.ts:24`：只存命令的结果，不存输入输出，保留最近 1000 条（`:25`） | JSON Lines | 日志 | purge（`installer/uninstall.ts:48`） |
| `bin/molis-work`、`molis-work-mcp`、`molis-work-web` | 安装器；`installer/home.ts:24`，名字 `installer/home-contract.ts:26` | 启动脚本 | 程序 | 普通（`installer/uninstall-files.ts:31`，改过的启动脚本算冲突并停止） |
| `releases/molis-work-<version>/` | 安装器；`installer/home.ts:21`，清单 `release.json` 的 `schema_version` = 4（`installer/home-release.ts:112`）；暂存目录 `.staging-*` | 目录 | 程序 | 普通（`installer/uninstall-files.ts:38-48`，不带当前安装器标记的 release 算冲突并停止） |
| `runtime-integrations/<runtime>.json` | `installer/runtime-integration.ts:315`：Molis Work 往用户 Runtime 配置里写了哪些条目的所有权收据 | JSON · `schema_version` = 1 | 必备份（很小；没有它，卸载无法证明条目是自己写的） | purge（`installer/uninstall.ts:55`）；移除接入时单独删（`installer/runtime-integration.ts:177`） |
| `runtime-config-backups/<runtime>/<plan>.bak` | `installer/runtime-integration.ts:319`：改动前的 Runtime 配置副本，可能含那个 Runtime 自己的密钥 | 文本 | 必备份，按密钥对待 | purge（`installer/uninstall.ts:54`） |
| `runtime-integration-attempts/<plan>-<uuid>.json` | `installer/runtime-integration.ts:342`：回滚记录 | JSON · `schema_version` = 1 | 日志 | 否；真实 Home 里还没有 |
| `backups/` | 没有任何代码写它；只出现在卸载的清除与保留清单里（`installer/uninstall.ts:47`、`:81`） | 保留名，没有内容可分类 | 无 | purge |

## 7. 备份：必须取同一时点的组

产品里没有备份命令；`docs/installation.md` 的“离线备份与恢复边界”只说明退出后整份拷贝，`tests/home-backup-recovery.test.ts` 的两条用例只覆盖目录库、项目库、会话库（含加密正文与密钥）和成果版本，不覆盖下面其余的组。SQLite 文件在 WAL 模式下旁边有 `-wal`、`-shm`，只拷 `.db` 会丢最近的提交。

| 组 | 成员 | 为什么要同一时点 |
| --- | --- | --- |
| A 目录与项目 | `projects/catalog.db`、全部 `projects/<id>/molis-work.db`（带 `-wal`、`-shm`） | 目录库存项目库的绝对路径，只能恢复到原路径 |
| B 会话 | `sessions/sessions.db`、`sessions/content/blobs/`、`sessions/content/content.key` | blob 没有密钥读不出，密钥不能换新 |
| C Agent 与记忆 | `agent-runtime/`（`records/`、`checkpoints/`、`storage.key`）、`git-operation-details.json`、`memory/memory.db`、`assistant/assistant.db`、`agent-definitions/` | 记忆正文在 Prologue 条目，账本在 `memory.db`；Git 审查回执与细节分在两处 |
| D 凭据 | `feed/secrets.json`、Keychain 里的主密钥（没有 Keychain 时是 `feed/secrets.key`）、`feed/evidence*/`、`alchemist/projects/*/search-content*/` 加同目录的 `search.sqlite`，以及存 `credential_ref` 的 `connectors/connectors.db` 和目录库的 `model_providers` | 引用与密文必须配对；证据索引 `search.sqlite` 和它指向的 `search-content*` 要取同一时点；主密钥不在 Home 里 |
| E 个人内容 | 10 个个人插件库、`images/assets/`、`lingguang/imports/`、`shelf/`、`jelly/preferences.json`、`plugin-builder/`、Alchemist 工作室库、`characters/`、`plugins/experiments/`、`server/`（讨论库 `server.sqlite`，带 `-wal`、`-shm`）、`placement/`、`functions/`、`context-onboarding/` | 彼此独立；按 `project_id` 分区的行引用 A 里的项目 |
| F 配置 | `config/` 里的 `onboarding.json`、`project-arrival.json`、`mcp-tools.json`、`casebook.json`，`runtime-integrations/`、`runtime-config-backups/`、`browser/sites.json` | 很小，授权类的丢了不能凭空重建 |

不必备份：`releases/`、`bin/`（可重装），`search/`、`cache/`、`lingguang/models/`（可重建），`logs/`，`browser/profile/`、`browser/downloads/`、`browser/uploads/`，所有锁与暂存。

## 8. Home 之外的状态

| 位置 | 内容 | 代码 |
| --- | --- | --- |
| macOS Keychain，服务 `com.molis.work.feed.secretstore`，账户 `install-master-key` | `feed/secrets.json` 的主密钥；环境变量 `MOLIS_WORK_ENCRYPTION_KEY` 或 `feed/secrets.key` 可代替 | `packages/storage/src/adapters/file-secret-store.ts:62-63`、`:134` |
| `~/Library/LaunchAgents/com.molis.work.web.plist` | 常驻 Web 服务 | `apps/local-host/src/installer/web-service-platform.ts:35`，标签 `installer/web-service-contract.ts:2` |
| 用户 Runtime 的配置与 Skill 链接：`~/.claude.json`、`~/.codex/config.toml`、`~/.config/opencode/opencode.json`、`~/.pi/agent/mcp.json`、`~/.grok/config.toml` | 经用户确认的 Runtime 接入写入。改名前写下的 MCP 条目指向 `bin/goalboard-mcp`；真实 Home 上 2026-10-07 已改指 `bin/molis-work-mcp`（第 10 节） | `apps/local-host/src/installer/runtime-config-adapters.ts:11-90` |
| `~/.goalboard` | 指向 `~/.molis-work` 的符号链接，2026-09-13 建（改名前的 Home 路径）。当前 main 里没有任何代码引用 `.goalboard`；它让旧 Runtime 配置里的 `~/.goalboard/bin/goalboard-mcp` 还走得到 Home 里的启动脚本（第 10 节） | 无，旧安装留下的，不是当前代码建的 |
| 应用数据目录下的 `directory-access/bookmarks.json` | 没设 `MOLIS_WORK_HOME` 时的目录授权书签 | `apps/desktop/adapters/tauri/src/context_directories.rs:109-125` |
| 用户授权的工作区目录 | 项目绑定的外部目录，不归 Molis Work 备份 | `docs/installation.md` 离线备份一节 |
| 插件开发状态目录（调用时给定的 `state_directory`） | 标记文件 `.molis-work-plugin-development.json` 加 `development.db` | `apps/local-host/src/local-plugin-development.ts:10-20` |
| 用户其他 Agent 的目录：`~/.claude`、`~/.codex`、`~/.cursor`、`~/.grok`、`~/.config` | 角色导入只读扫描，不写 | `apps/local-host/src/character-import-discovery.ts:86-100` |
| 当前目录下的 `.molis-work/molis-work.db` | CLI 与管理 MCP 没给数据库路径时的默认值，相对当前目录，不是 Home | `apps/cli/src/protocol.ts:3`、`apps/local-host/src/mcp-server.ts:261` |

## 9. 卸载覆盖

`uninstall --purge-user-data` 删除的路径（`installer/uninstall.ts:44-56`）：`projects/`、`backups/`、`logs/`、`sessions/`、`shelf/`、`runtime-config-backups/`、`runtime-integrations/`，以及 `PERSONAL_HOME_SQLITE_STORES` 的 17 个目录：`images`、`pages`、`form`、`dataset`、`ppt`、`lingguang`、`todo`、`jelly`、`cognia`、`alchemist`、`workflows`、`functions`、`connectors`、`context-onboarding`、`search`、`memory`、`server`（`packages/storage/src/home-sqlite.ts:6-24`）。普通与 purge 都会删安装器自有的程序文件：当前 3 个启动脚本、`config/installation.json`、有效的 `config/web-control-token`、带当前安装器标记的 `releases/*`（`installer/uninstall-files.ts:15-48`）。清完后只有 `config/`、`bin/`、`releases/`、Home 本身是空目录时才会删（`installer/uninstall.ts:192-197`）。

测试覆盖到哪里：

- `tests/uninstall.test.ts:115-166` 的 purge 用例不遍历 `PERSONAL_HOME_SQLITE_STORES`，在 `:121`、`:132` 写死 10 个目录（`images`、`jelly`、`pages`、`form`、`dataset`、`ppt`、`lingguang`、`todo`、`alchemist`、`functions`），另放一份 `server/server.sqlite` 加 `-wal`、`-shm`。它断言：这 10 个目录、`server/` 和 `runtime-config-backups/` 在 purge 计划里；确认数不对时被拒绝、项目库文件和讨论库还在；确认后讨论库没了、状态是 `purged`、Home 目录整个没了（`projects/` 的删除只靠这一句间接证明）。同文件 `:41-83` 的普通卸载用例断言 `server/` 不在计划里、确认后讨论库还在。`cognia`、`workflows`、`connectors`、`context-onboarding`、`search`、`memory` 六个库在这个文件里没有任何断言；`sessions/`、`shelf/`、`logs/`、`backups/`、`runtime-integrations/` 也没有用例往里放内容再断言被删。
- 全部 17 个目录由另一个文件盖到：`tests/personal-plugins-review-fixes.test.ts:107-154` 用 `deepEqual` 钉死清单的 17 个名字（`:108`），再遍历它们，断言每个目录在 purge 计划里、确认后 `<名>.db` 被删。
- 讨论库的登记另有一条用例：`tests/im-local-project.test.ts:71` 起的用例启动本机的讨论挂载（`apps/local-host/src/im-server.ts`），断言它在 Home 里只写出 `server/server.sqlite`，且 `server` 在 `PERSONAL_HOME_SQLITE_STORES` 里；挂载以后改写到别的目录，这条用例会红。

purge 之后仍留下的（由代码推出，没有在真实 Home 上试过）：

- 11 个一级条目没有任何一条路径会删：`agent-definitions/`、`agent-runtime/`、`assistant/`、`browser/`、`cache/`、`characters/`、`feed/`、`git-operation-details.json`、`placement/`、`plugin-builder/`、`plugins/`。路线图原先列了 12 个中的 9 个，其中 `server/` 已在 W2-12 补进清除范围（决定 4：讨论库登记进 Home 数据）；`cache/`、`plugin-builder/`、`git-operation-details.json` 是本表推导时多发现的。
- 其中 `feed/secrets.json` 和 `agent-runtime/` 意味着加密后的凭据与全部运行记录在“清除用户数据”后还在盘上，Keychain 主密钥也还在。
- `config/` 里除安装清单、令牌、卸载收据以外的 JSON 都留下，所以 `config/` 非空，Home 目录本身不会被删。
- `bin/` 里改名前的启动脚本不在清单里，其中 `bin/goalboard-mcp` 仍有在跑的进程用它，手工清理前要先核对（第 10 节）；改名前的 `releases/goalboard-*` 会被当成冲突（第 10 节）。
- 代码会创建、但真实 Home 里还没有的 `runtime-integration-attempts/`，以及设了 `MOLIS_WORK_HOME` 时的 `directory-access/`，也不在清单里。

## 10. 真实 Home 的孤儿与残留（2026-10-07）

`/Users/yijunwang/.molis-work` 的一级条目 41 个，只读列出（`ls -A`、`find -maxdepth 3`、`stat`、`du`），没有打开任何库或数据文件（读过一个启动脚本，见开头第二条）。37 个条目对应上面的行；下面 4 个一级条目和 8 处目录内残留，当前 main 里没有任何代码拥有：对这些名字在 `apps packages modules plugins horizontal server scripts tooling skills` 里 grep，除 `plugins/native/alchemist/README.md` 提到旧演示库外都是 0 处引用，Home 根目录的 `catalog.db`、`molis-work.db` 则没有任何代码打开 `<home>/` 下这两个名字。`plugin-builder/<project_id>/model/` 的名字太泛，没有按名字 grep，改查了创建它的代码是否还在。

| 条目 | 看到的 | 为什么说没有 owner |
| --- | --- | --- |
| `catalog.db`、`molis-work.db`（Home 根目录） | 各 0 字节，2026-09-17 | 目录库在 `projects/catalog.db`（`apps/local-host/src/project-catalog.ts:246`），项目库在 `projects/<id>/`。[推断] `molis-work.db` 来自相对当前目录的默认库路径 `.molis-work/molis-work.db`，在 `$HOME` 下运行时正好落在这里（`apps/cli/src/protocol.ts:3`）；根目录的 `catalog.db` 来源没有查清 |
| `maintenance-3-replaced/` | 约 1.9 GB，2026-10-07；`home/`、`projects/`、`alchemist/`、`maintenance3-report.json`；`home/` 下有 `assistant`、`connectors`、`form`、`memory`、`config`、`sessions`、`feed`、`functions` 的副本 | 2026-10-07 真实 Home 维护留下的被换下的库，不是产品功能。它在 Home 里面，所以任何整份拷贝都会带上它，包括其中 `feed` 的副本 |
| `agent-drafts/` | 空目录，2026-09-25 | 写它的代码在 `8074b30c`（2026-09-28）删除 |
| `alchemist/alchemist.db` | 约 40 KB，2026-09-22 | 旧的 Alchemist 演示库，没有代码打开。`plugins/native/alchemist/README.md:17` 写着它被保留、可从“历史入口”只读导出，代码里没有这个入口 |
| `images/.runner-lock.db` | 一个文件 | 旧版 Images 的锁文件；`b98cf812` 加入，`703bf122`（2026-10-05）删除 |
| `images/runners/` 里的文件 | 92 个 `.db` 加 92 个 `-journal`，合计约 46 KB，2026-09-25 到 09-27 | 目录有 owner（`plugins/native/images/src/store.ts:48`），但文件没人回收：`releaseLocks` 只删 `.db`（`:72`），`recoverInterrupted` 只回收“有 running 任务的 owner”的文件（`:77-98`） |
| `cognia/runtime/runs/<uuid>/` | 9 个，各有 `records/`、`leases/`、`storage.key`，2026-09-24 | 以前每次 Cognia 运行一个 Prologue 存储根；代码在 `8074b30c` 删除。每个里有一个 `storage.key`，是没有 owner 的密钥材料 |
| `bin/goalboard`、`goalboard-mcp`、`goalboard-web` | 各约 1 KB，2026-09-13 | 改名前的启动脚本。`CURRENT_LAUNCHER_NAMES`（`installer/home-contract.ts:26`）只有 `molis-work*`，卸载不会删它们。**但 `goalboard-mcp` 还有人在用**：它读 `config/installation.json`，启动当前 release 的 `dist/mcp/server.js`；核对时（2026-10-07 21:35）有 4 个 `node ~/.goalboard/bin/goalboard-mcp` 进程在跑，启动于 19:21 至 19:28，[推断] 是配置改指之前启动的 Runtime 会话。Claude Code、Codex、Grok 三个配置的 MCP 条目现在都指向 `~/.molis-work/bin/molis-work-mcp`（`grep -o` 核对；opencode、pi 的配置文件不存在），Codex 配置里只剩一条 `.goalboard/releases/goalboard-0.1.0/dist/mcp` 的目录信任条目。所以这三个脚本和第 8 节的 `~/.goalboard` 符号链接，要等没有配置指向、没有进程在跑之后才算残留；在那之前清理会让还在用旧条目的客户端起不来 |
| `releases/goalboard-0.1.0` 至 `goalboard-0.2.0` | 11 个目录，约 1.7 GB，2026-08-24 到 09-12 | 改名前安装的版本。当前安装器只认 `molis-work-home-install-v1`（`installer/home-contract.ts:3`、`installer/uninstall-files.ts:41-48`），`INSTALLER_ID` 在 `9824f6e6`（2026-09-15）改名时换了值，所以 [推断，`release.json` 没打开] 卸载会把它们报成冲突并停止 |
| `plugin-builder/<project_id>/model/` | 3 个项目目录里有 2 个有，2026-09-26 至 09-27；里面共 4 个 `io.molis.work.generated.<uuid>/`，没有打开 | 目录属于 plugin-builder（6.2），但当前没有任何代码创建 `model/`。写它的代码（`join(root, 'model', pluginId)`，生成插件做模型调用的工作目录）在 `8074b30c`（2026-09-28）删除，所以它是残留，不是 plugin-builder 现在拥有的子目录 |
| `projects/<id>/goalboard.db-wal`、`goalboard.db-shm` | 15 个项目目录里共 30 个文件，WAL 合计约 21 MB，2026-09-11 到 09-13；`goalboard.db` 本体在整个 `projects/` 下 0 个 | 项目库现在叫 `molis-work.db`（`packages/storage/src/adapters/local-security-paths.ts:8`）。[推断] 改名前的残留。注意：WAL 里可能有尚未并入主文件的提交，改名时是否已并入没有查清，清理前要先核对 |

属于 owner 但值得注意的：`agent-runtime/checkpoints/` 有 1622 个文件，仓库代码里没有保留期限 [未核对 SDK 内部是否清理]；`agent-runtime/.molis-runtime-owner.db-journal` 是锁库旁一个 512 字节的残留日志（2026-10-01，持有进程被杀的痕迹）。没有核对 `projects/` 下的目录和目录库里的项目是否一一对应，那需要打开 `catalog.db`。

## 11. 已知缺口，与怎样维护这张表

缺口（按处理它的路线图条目）：

- 没有 Home 存储的单一登记；`PERSONAL_HOME_SQLITE_STORES` 缺 `assistant`、`placement`、`agent-definitions` 这三个带基线的 Home 库，也缺 `characters`、`plugins/experiments`（W4-11）。`server`（讨论库）已由 W2-12 补进这份名单，所以清除范围覆盖它；统一登记落地时它按登记里的 owner 与备份类迁入。
- 两个库没有版本（`plugins/experiments/private.sqlite`、`alchemist/projects/<id>/search.sqlite`），`characters.sqlite` 自管版本（W2-05）。
- 4 处跨 owner 直接 SQL，共享日志表没有写入约束（W2-06）。
- 没有备份命令和快照；第 7 节的同一时点组没有工具保证（W5-16）。
- 目录库存项目库的绝对路径（W5-17）。
- Images 的 runner 锁文件无人回收，CLI 与管理 MCP 的默认库路径相对当前目录（W2-04）。
- `purge` 漏 12 个一级条目，旧 `goalboard-*` 的 release 与启动脚本卸载不认，而 `bin/goalboard-mcp` 还有进程在用（W4-11 的清除范围决策）。
- purge 的用例清单是写死的：`tests/uninstall.test.ts` 只盖 16 个库里的 10 个，其余 6 个只在 `tests/personal-plugins-review-fixes.test.ts` 的遍历用例里盖到；`sessions/`、`shelf/`、`logs/`、`backups/`、`runtime-integrations/` 的清除没有用例。W4-11 的统一登记落地后，用例应读登记，而不是各写一份名单。
- 结构由宿主文件定义的库（assistant、placement、agent-definitions、context-onboarding、connectors、项目库的几段）按“库归 owner 包”看是错放，处理在 W3-06 与 W5-01。

维护：新增、改名或删除 Home 里任何库或文件的改动，同一个 PR 里改本表对应的行（路径、owner、版本、备份类、卸载覆盖）；提高某个库的基线版本时同时改“现行版本”和 `tests/home-store-baselines.test.ts`。这张表目前没有门禁，是否漏登靠评审。统一登记落地后，本表改成登记的说明，并由登记校验。
