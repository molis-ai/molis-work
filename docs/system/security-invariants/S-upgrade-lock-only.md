# S-upgrade-lock-only

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-lock-only | 升级只在持这个 Home 的存储主人锁时跑。另一个进程持锁时 `runHomeUpgrade` 报 `storage.owner.busy`，所有库文件 sha256 不变，不新增 `upgrade/`；会升级的入口（`acquireUpgradedHomeOwner`、CLI、目录库入口）在锁被占且有东西待升时报 `storage.upgrade_in_progress`，文件不变。不取锁的读者（`catalogManagementProject`、`heldInstalls`、卸载预览）只读或只拒绝，不改文件，不删戳记：删戳记的监听只在持锁进程里、锁释放就停。设计 `specs/upgrade-continuity/upgrade-chain-design.md` §10 的暂定号是 S-141；`configured-models` 这个读者查目录库版本，U1-d 接上基线后在这里补一行用例 | `apps/local-host/src/home-upgrade.ts`、`apps/local-host/src/home-storage-lifetime.ts`、`apps/local-host/src/management-action-client.ts`、`packages/storage/src/sqlite-baseline.ts` | `tests/security-invariants-home-upgrade.test.ts`「another process holds the lock」「entries that upgrade report」「readers with no lock read or refuse」「opening an older store with no lock held」 | 无 |
