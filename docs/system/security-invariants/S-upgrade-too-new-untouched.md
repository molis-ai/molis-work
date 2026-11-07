# S-upgrade-too-new-untouched

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-too-new-untouched | 比程序新的库不读业务内容、不写、不拍快照：版本 +1 的库经升级过程记 `too_new`、不写戳记，经打开路径（不持锁、持锁）报 `storage.store_too_new`，主文件 sha256 不变，也不留旁路文件。设计 `specs/upgrade-continuity/upgrade-chain-design.md` §10 的暂定号是 S-142；其中 `browser/sites.json` 那半由带版本文件的 U1-e 接上 | `apps/local-host/src/home-upgrade.ts`、`packages/storage/src/upgrade-inspection.ts`、`packages/storage/src/sqlite-baseline.ts` | `tests/security-invariants-home-upgrade.test.ts`「a store one version ahead」「a too-new store is never snapshotted」 | 无 |
