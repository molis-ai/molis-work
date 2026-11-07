# S-upgrade-restore-verified

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-restore-verified | 放回前核快照的 sha256 和大小：快照或清单被改、缺失、换成链接时报 `storage.upgrade_failed`（`snapshot_invalid`）并停下，库文件和旁路文件一个字节不动。放回时先删 `-wal`、`-shm`、`-journal`（不跟随链接），删不掉就不替换库文件：留着旧 `-wal`，放回的库会读出升级后的版本，`integrity_check` 还是 ok。设计 `specs/upgrade-continuity/upgrade-chain-design.md` §10 的暂定号是 S-145 | `packages/storage/src/upgrade-snapshot.ts` | `tests/security-invariants-upgrade-snapshot.test.ts`「a snapshot that does not match its hash」「restoring removes a stale WAL first」「side files are removed without following them」 | 无 |
