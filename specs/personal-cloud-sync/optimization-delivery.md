# Molis Work 个人版云同步优化交付记录

**记录日期** 2026-11-20

**交付状态** Phase 0～3（`PCSYNC-OPT-01`～`19`）全部工程改造与仓库本地门禁均已通过验证；Phase 4（`PCSYNC-OPT-20`～`22`）真实云端与双机人工验收待批准后执行。本记录的核验数据来自合入最新 main 前的同步分支。PR #2179 的合并提交需要重新验证。

依据个人版云同步优化方案 `PCSYNC-OPT-01`～`22` 汇总。产品行为及完整项目生命周期以现行规格为准：[个人版云同步规格](spec.md)。

## 1. 代码位置

| 仓库 | 当前分支 | 本地 HEAD | 本轮范围 |
| --- | --- | --- | --- |
| Molis Work | `codex/environment-unification` | `2bb49bc6c` | `server/src/sync/*`、`packages/plugin-sdk/src/sync-content.ts`、`modules/sync-replication/src/*`、`apps/local-host/src/*`、`apps/workbench/*`、测试及合同快照 |
| Auth | `codex/simple-health` | `4886ef2` | 短期同步读取凭证、JWKS 公钥端点、环境密钥声明及会话测试 |

两处 HEAD 均为基线提交。本轮自动化验收在隔离临时 Home、Miniflare D1/R2 和本机 Chrome 中完成，未触碰任何真实云端资源或用户真实 Home。

## 2. 本轮核心实现摘要

- **Auth 与签名读取（`OPT-01`）**：桌面端保持现有会话令牌；启用签名读取后由 Auth 签发最多 30 秒的 Ed25519 短期凭证，Work 的 `/v1/round` 与 `/v1/changes` 本地验签（核对签发方、应用、主体、作用域、有效期与令牌哈希），写入、历史与附件仍实时向 Auth 核验。[Work 验签实现](../../server/src/sync/signed_identity.rs)
- **云端同步核心（`OPT-02`、`03`、`04`、`05`、`10`、`11`、`12`、`16`）**：
  - 边缘限流绑定替代空闲轮询 D1 限流写入；实例内只读 Schema 校验缓存（写操作与损坏检测严格校验并失效缓存）；变更拉取支持 20 条上限与约 2 MiB UTF-8 动态分页。
  - `/v1/blobs/complete` 与过程项割接 `seed-blobs/complete` 改为 R2 `HEAD` 零字节重读校验 + 有序分块 SHA-256 清单锚点（`partsDigest`），50 MB 完成耗时远低于 2 秒。[分块存储](../../server/src/sync/blob_store.rs) · [附件路由](../../server/src/sync/blobs.rs)
  - `createSyncJsonContent` 增加确定性 `deflate-raw` 内联压缩与按分块 `deflate-raw-chunks` 压缩（含 `maxOutputLength` 解压炸弹防护与旧未压缩信封兼容）；服务端 `changes.rs` 对 5 分钟连续编辑突发做中间草稿折叠并将非基线连续编辑保留期缩短为 24 小时，冲突分支（`sync_history_pins`）与回收站严格保留 30 天。[内容编解码](../../packages/plugin-sdk/src/sync-content.ts) · [变更提交](../../server/src/sync/changes.rs)
  - 维护清理每次有界处理 20 项，并在项目目录头到期清理时按通用平台项目归属级联清理全部子集合 head 与无共享引用的 R2 附件，保留子集合 `purged_at` 墓碑防离线复活；支持受控二次确认的回收站永久清理与 5 项配额明细。[维护与级联清理](../../server/src/sync/maintenance.rs)
- **本机协调器与 Host（`OPT-06`、`07`、`08`、`09`、`13`、`14`、`15`、`16`）**：
  - 本机变更 1.5 秒防抖合并触发（覆盖 Web API、MCP HTTP 与动作网关非 `/api/sync` 写操作），空闲轮询退避至 120 秒，`Retry-After` 统一节流。
  - 上传/下载预算解耦 + 拓扑分层并发（`projects` 目录层 → 平台 `artifacts` 固定版本层 → 引用提供层 → 其他独立集合 3 路有界并发）+ 单附件分块双路并发 + 实时字节传输进度（`transfer: { done, total }`）。[同步协调器](../../modules/sync-replication/src/index.ts)
  - 普通大附件下载分块落盘私有 `0600` 文件暂存并支持重启续传（`sync.db` 保持 `< 1 MB`），受保护内容严格沿用 S-110 加密缓存；`sync.db` v2 持久化失败重试次数与截止时间并提供 v1 → v2 连续升级。[分块文件暂存](../../modules/sync-replication/src/blob-files.ts) · [本机数据库](../../modules/sync-replication/src/database.ts)
  - 彻底移除 Host 中 Goals/Todo 插件名特判；补齐未启用插件分区被动检查边界；新增 `ProjectDeletionService.finalizeExpiredPersonalProject`（核验云端 `server_purged_at`、全部子 owner 未结算队列、活动任务与终端后才执行本机最终删除）；新增本地→个人多选整项目复制预览、隐藏暂存、原子发布与幂等重试链路（`/api/sync/copy/{projects,preview,execute}`）。[整项目复制](../../apps/local-host/src/personal-project-copy.ts) · [项目删除服务](../../apps/local-host/src/project-deletion-service.ts)
- **工作台 UI 与资源体积（`OPT-18`）**：
  - 同步设置按「平台与项目 / 插件内容」分组展示，状态栏与常驻指示器均展示实时附件字节进度，新增「从本地复制项目」多选预览与二次确认弹窗，完善 Markdown 行级差异与图片缩略图对比，所有文案 100% 走中英双语词表。
  - 通过复用已有本地翻译别名清理冗余 `globalThis.t.text` 展开，`/assets/molis-work-workbench.js` 较 merge-base 净缩减 651 字节（`1,350,265 → 1,349,614`）。[同步设置](../../apps/workbench/src/settings-sync.ts) · [版本对比](../../apps/workbench/src/settings-sync-comparison.ts) · [常驻指示器](../../apps/workbench/src/sync-indicator.ts)

## 3. 逐项验收总览

| 编号 | 验收项 | 状态 | 验证证据与说明 |
| --- | --- | --- | --- |
| `PCSYNC-OPT-01` | Auth 外网降载 | 通过 | 20 次连续轮询仅 1 次签发 + 1 次 JWKS、`/users/me` 0 次；伪造/过期/错误签发方/哈希不匹配/重定向均拒绝；写操作实时核验 Auth（[cloud.test.mjs](../../apps/sync-worker/cloud.test.mjs)）。 |
| `PCSYNC-OPT-02` | 空闲轮询零 D1 限流写入 | 通过 | 26 集合连续轮询 10 次 `sync_rate_windows` 为空表；超限返回 `429` + `Retry-After: 60`（[cloud.test.mjs](../../apps/sync-worker/cloud.test.mjs)）。 |
| `PCSYNC-OPT-03` | Schema 校验缓存 | 通过 | 20 次读命中实例缓存；移除触发器后读命中缓存、写立即拒绝并失效缓存；旧库或缺结构拒绝（[cloud.test.mjs](../../apps/sync-worker/cloud.test.mjs)）。 |
| `PCSYNC-OPT-04` | 大附件完成零重读（`partsDigest`） | 通过 | R2 `HEAD` 零字节重读 + 有序 `partsDigest` 清单校验；50 MB `complete` 实测 `< 2s`，缺/错 `partsDigest` 拒返 `409`，2×50 MB 100 MB 满额通过（[attachments.test.mjs](../../apps/sync-worker/attachments.test.mjs)）。 |
| `PCSYNC-OPT-05` | 动态分页 | 通过 | 50 条 2 KiB 首批返 20 条；400 KiB 多字节记录按约 2 MiB 截页且无游标遗漏（[cloud.test.mjs](../../apps/sync-worker/cloud.test.mjs)）。 |
| `PCSYNC-OPT-06` | 本机秒级触发与空闲退避 | 通过 | 1.5s 防抖合并、空闲阶梯退避至 120s、`Retry-After` 统一节流；Web/MCP/动作非 `/api/sync` 写入口均触发 `notifyLocalChange`；指示器监听 `online` 与 `visibilitychange`（[sync-device.test.ts](../../tests/sync-device.test.ts)、[space-web-server.ts](../../apps/local-host/src/space-web-server.ts)、[sync-indicator.ts](../../apps/workbench/src/sync-indicator.ts)）。 |
| `PCSYNC-OPT-07` | 读写预算解耦与分层并行 | 通过 | 下载积压不耗尽上传预算；拓扑分层并发实测 3 路峰值并发并保持依赖顺序与提速；附件双路分块并发（[security-invariants-personal-sync.test.ts](../../tests/security-invariants-personal-sync.test.ts)、[sync-device.test.ts](../../tests/sync-device.test.ts)）。 |
| `PCSYNC-OPT-08` | 附件私有文件暂存与进度 | 通过 | 50 MB 续传与 24 MiB 下载全程 `sync.db < 1 MB`、`0600` 暂存并在提交后清理；受保护分块保持 S-110 加密缓存；上报字节传输进度（[security-invariants-sync-attachments.test.ts](../../tests/security-invariants-sync-attachments.test.ts)、[security-invariants-sync-cache-protection.test.ts](../../tests/security-invariants-sync-cache-protection.test.ts)）。 |
| `PCSYNC-OPT-09` | 连接复用与轻量指示器即时刷新 | 通过 | 单轮复用连接；关闭自动同步时 `notifyLocalChange` 即时刷新指示器待上传数且空闲零 `refreshCatalog` 扫描（[sync-device.test.ts](../../tests/sync-device.test.ts)）。 |
| `PCSYNC-OPT-10` | 正文压缩与连续编辑保留折叠 | 通过 | 30 次 ~200 KiB 结构化编辑实测配额节省 `>= 70%`、仅保留 2 条写事件且折叠回执幂等、冲突档案与回收站均保留 30 天、解压炸弹被拒绝（[retention.test.mjs](../../apps/sync-worker/retention.test.mjs)）。 |
| `PCSYNC-OPT-11` | 有界批量清理 | 通过 | 单轮清理上限 20 项，次轮清理剩余项，活跃 R2 引用与计费保留（[retention.test.mjs](../../apps/sync-worker/retention.test.mjs)）。 |
| `PCSYNC-OPT-12` | 受控永久清理与配额明细 | 通过 | 默认关闭、开启需二次确认且绑定确切版本、跨账号拒绝、文本配额原子释放与 5 项分项明细通过（[retention.test.mjs](../../apps/sync-worker/retention.test.mjs)、[personal-sync.e2e.test.ts](../../tests/personal-sync.e2e.test.ts)）。 |
| `PCSYNC-OPT-13` | 临时失败持久化重试 | 通过 | `sync.db` v1 → v2 升级保留延迟队列，重启后遵循退避截止时间，依赖恢复或手动单项重试即恢复（[sync-device.test.ts](../../tests/sync-device.test.ts)）。 |
| `PCSYNC-OPT-14` | Host 去特判（插件同等待遇） | 通过 | 无 Goals/Todo 插件名分支；无 Goals 个人项目经真实 Host 与 Rust/D1 完整同步、回收站往返与恢复通过（[projects.test.mjs](../../apps/sync-worker/projects.test.mjs)）。 |
| `PCSYNC-OPT-15` | 本地到个人多选整项目复制 | 通过 | 一次多选 2+ 本地项目预览（项目/资产数/预计容量）、隐藏暂存防半成品可见、离线/中断幂等重试无重复副本、原本地项目字节零改动，Workbench E2E 通过（[personal-project-copy.test.ts](../../tests/personal-project-copy.test.ts)、[personal-sync.e2e.test.ts](../../tests/personal-sync.e2e.test.ts)）。 |
| `PCSYNC-OPT-16` | 项目云端级联过期与本机最终清理 | 通过 | 云端项目过 30 天清理后级联释放全部子集合正文与无共享 R2 附件（计费归零）并保留防复活墓碑；本机 `finalizeExpiredPersonalProject` 强制核对 `server_purged_at`、子 owner 未结算队列与活动任务/终端（[projects.test.mjs](../../apps/sync-worker/projects.test.mjs)）。 |
| `PCSYNC-OPT-17` | 剩余 Owner 与嵌套 GC 收尾 | 通过 | Coding 真实 SDK 会话历史、Builder、Alchemist、Feed、Images、Cognia、Shelf、Sources、Attention、Runtime、Process Items 全部 20 份 Worker 集成测试 60/60 通过。 |
| `PCSYNC-OPT-18` | 语义对比、分组进度与资源预算 | 通过 | 0 翻译问题；Chrome E2E 10/10 通过（含 Markdown/图片对比、分组、附件字节进度、本地复制预览/确认与 1440/1024/390 深浅色零溢出）；`page-assets:check` 67 项全通过且 `workbench.js` 净减 651 字节。 |
| `PCSYNC-OPT-19` | 仓库工程门禁 | 通过（本机全绿） | 全量构建、Rust `fmt`/WASM `clippy`、`pnpm health:check`、`pnpm boundary:check`、`pnpm page-assets:check`、翻译、API/Schema/动作合同快照与 `pnpm secrets:check` 全部通过；待推送后由远端 CI 复验。 |
| `PCSYNC-OPT-20` | `[人工]` 真实云端 24 小时压测 | 已完成 `test` 部署与连通性探针（待完整压测） | 已部署 `molis-auth-test`（Version `2c749c9a-f715-4ea7-b173-acbebe2c0c85`）与 `molis-work-test`（`https://work.test.molis.ai`，Version `56bd3b07-b2fa-4da8-a0ed-2f906ab486a8`，启用 `SYNC_READ_AUTH=signed`）；实测 `/.well-known/molis-sync-jwks.json` 200（`kid=molis-sync-test-2026-11`）、`/api/v2/auth/sync-read-proof` 200（TTL 30s）、5 次连续签名 `/v1/round` 延迟 `1667ms → 336–410ms`、`/v1/quota/breakdown` 5 项明细正常、注销后读凭证即刻 `401`，且远程 `molis-work-server-db-test` 的 `sync_rate_windows` 写入 **0 行**。24 小时双端长稳、50 MB 附件往返与 100 MB 满额压测待按计划执行。 |
| `PCSYNC-OPT-21` | `[人工]` 生产迁移与配对备份演练 | 未执行 | 本地已验只读维护模式拒绝写入/清理；真实 D1/R2 配对备份、隔离恢复与回退拒绝演练待窗口执行。 |
| `PCSYNC-OPT-22` | `[人工]` 两台实体 Mac 验收 | 未执行 | 待在两台实体 Mac 覆盖完整登录、新设备确认、大附件续传、离线冲突、30 天回收、多选整项目复制及退出/切号。 |

## 4. 最新测试与门禁实测记录

| 检查项 | 结果 | 实测详情 |
| --- | --- | --- |
| 全量工作区构建 (`pnpm build`) | 通过 | 76 个工作区包 + 根 `dist/` + `pty-client.js` + bundled drafts 全部构建成功（Node `v24.15.0`） |
| Rust 格式与 WASM Clippy | 通过 | `cargo fmt --check` 通过；`cargo clippy --target wasm32-unknown-unknown --lib -- -D warnings` 0 警告；`worker-build --release` 成功 |
| 客户端同步、复制与 Chrome E2E | 通过 | 12 份测试文件全部通过（125 项用例，含 `personal-sync.test.ts` 28/28、`personal-sync.e2e.test.ts` 10/10 Chrome、`personal-project-copy.test.ts` + `security-invariants-project-copy*.test.ts` 33/33）；`ui-text-locale-files.test.ts` 21/21 通过 |
| Sync Worker WASM/D1/R2 全套集成 | 通过 | 全部 20 份测试文件合计 60/60 用例通过（18 份 56 项在 Node `v24.15.0` 通过；依赖原生 `better-sqlite3` ABI 147 的 `projects.test.mjs` 3/3 与 `alchemist.test.mjs` 1/1 在 Node `v26.4.0` 通过） |
| 翻译、API、Schema、动作合同与密钥门禁 | 通过 | `translations.mjs` 0 问题（16,884 词条 / 134 语料文件）；`api-snapshot.mjs` 111 份 / 5,311 声明匹配；`store-schema-snapshot.mjs` 44 库匹配；`action-contract-snapshot.mjs` 640 Manifest + 617 Host 动作匹配；`secrets:check` 通过 |
| 页面资源门禁 (`pnpm page-assets:check`) | 通过 | 67 项 served assets 全部通过，`/assets/molis-work-workbench.js` 由 `1,350,265` 降至 `1,349,614` 字节（`-651` 字节） |
| 健康门禁 (`pnpm health:check`) | 通过 | 对照 merge-base `6b0e8a4f` 全部通过（0 root strays、0 split test processes、0 translation problems） |
| 架构边界检查 (`pnpm boundary:check`) | 通过 | 76 个包 / 4,392 源文件 / 23,969 条导入，`errors: []`；`tests/release-profile.test.mjs` 5/5、`tests/work-managed-sync.test.ts` 1/1 通过 |

## 5. 环境配置与发布前置条件

| 配置项 | 含义 | 当前状态 |
| --- | --- | --- |
| Auth `SYNC_READ_SIGNING_JWK` | 各环境独立 Ed25519 私钥 JWK（公钥由 `/.well-known/molis-sync-jwks.json` 提供） | `test` 环境已注入独立密钥（`kid=molis-sync-test-2026-11`）并部署至 `auth.test.molis.ai`；`prod` 未触碰 |
| Work `SYNC_READ_AUTH` | `signed` 启用读取路由本地验签，`live` 实时回源 Auth（默认 `live`） | `test` 环境（`work.test.molis.ai`）已启用 `signed` 并通过实测探针；`prod` 未开启 |
| Work `SYNC_PERMANENT_CLEANUP` | `enabled` 且可写时开放二次确认永久清理（默认关闭） | 本地集成已验，远端默认关闭 |
| Work `SYNC_WRITE_MODE` | `read-only` 冻结写入与清理，`read-write` 恢复正常 | 本地已验，生产维护窗口待演练 |

进入 Phase 4 前需获取用户对提交/推送/部署的明确确认，并在批准的隔离 `test` 环境按[同步模块部署与恢复手册](../../apps/sync-worker/README.md)逐项完成 `PCSYNC-OPT-20`～`22`。
