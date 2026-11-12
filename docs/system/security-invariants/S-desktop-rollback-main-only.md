# S-desktop-rollback-main-only

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-desktop-rollback-main-only | 回到上一版会停掉本机服务、把库放回升级前的快照、换回上一版程序，所以只有主窗口里本机地址（`http://127.0.0.1:<核过的端口>`，默认 4173，见 S-14；不带用户信息）的文档能叫桌面壳做：能力文件只把 `rollback_to_previous` 给 `main` 窗口的 `/settings/update*`；命令自己先按 S-14 同一条规则核窗口名和地址（`rollback_source`），不符就拒绝，什么都不停、不跑。Capsule、别的窗口、`localhost`、别的端口或协议、带用户信息的地址都拒绝。回退本身离线、持存储主人锁（`home rollback`），被拒或中途失败不写业务数据，失败时照原来的程序重新起服务。设计 `specs/upgrade-continuity/owner-isolation-and-rollback-design.md` §5.4、§7 | `apps/desktop/adapters/tauri/src/rollback.rs` 的 `rollback_source`、`rollback_to_previous`（Rust 用例 `s_desktop_rollback_main_only_…`，`cargo test`）；`apps/desktop/src-tauri/runtime-capabilities/main-rollback.json`、`permissions/rollback.toml`；`apps/local-host/src/installer/home-rollback.ts` | `tests/security-invariants-desktop-ipc.test.ts`「S-desktop-rollback-main-only」 | - |
