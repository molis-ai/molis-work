# Server sync module

Status: `partial`. Rust library `molis-work-server-sync`; not a pnpm workspace package.

This is one server module, not the entire Molis Work server. It owns the personal sync HTTP protocol, Auth-derived account isolation, D1 event log/CAS/receipts, quota, private R2 attachments, retained history and bounded maintenance. The existing Node identity/IM/continuity module remains in `server/src`; it is not deployed by this Worker.

## Source and entrypoints

- `src/lib.rs`: public `fetch(Request, Env)` and `scheduled(Env)` functions. Internal modules and storage helpers stay private.
- `src/identity.rs`, `rate_limit.rs`, `write_mode.rs`: identity, admission and operator write controls.
- `src/changes.rs`, `round.rs`, `protocol.rs`, `quota.rs`: replication, validation, round summaries and accounting.
- `src/blobs.rs`, `blob_store.rs`: authenticated private attachment transfer.
- `src/history.rs`, `retention.rs`, `maintenance.rs`: history, trash and bounded cleanup.
- `migrations/0001_sync.sql`: the single fresh D1 baseline, still v6. Moving this file does not upgrade or reinitialize an existing database.

`apps/sync-worker` owns Cloudflare event registration, the release build, Wrangler configuration and runtime integration tests. It calls only this crate's two public functions. See its [operator and verification guide](../../apps/sync-worker/README.md).

## 开发要求

- 负责：上述同步协议与远端同步存储；所有 `sync_*` 表及附件账本由本模块拥有。
- 不负责：IM、工厂/ERP 业务、客户端插件 payload 的语义、模型执行或 Worker 部署。它不读取本地 Home 数据库。
- 依赖：当前仍依赖 `worker` 的 Request/Env/D1/R2 API，编译目标为 `wasm32-unknown-unknown`。这是职责拆分，不宣称已经实现跨云运行时适配。
- 不变量：账号由可信 Auth 派生；每次请求验证当前 D1 基线；CAS、幂等、容量和引用约束保持原事务语义；不在请求里建表或升级库；接收数据不触发客户端业务执行。
- 构建检查：`cargo fmt --manifest-path server/sync/Cargo.toml --check`；`cargo clippy --manifest-path server/sync/Cargo.toml --target wasm32-unknown-unknown --all-targets --locked -- -D warnings`。CI 同时检查本模块和 App 入口，不缩小原检查范围。
- 改动后必跑：仓库根 `pnpm build`，然后在 `examples/personal-sync-tools` 运行 `npm run build` 和 `npm test`；这是实际 WASM、临时 D1/R2 和多 Home 的集成测试，不是线上部署验证。

来源：从 `apps/sync-worker/src` 和其 `migrations` 整体迁入；旧业务实现不保留副本。HTTP 路径、绑定名、数据格式、SQL 内容和 schema 版本均未因迁移改变。
