# S-upgrade-journal-removal

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-journal-removal | 拍升级快照时只删一种 `-journal`：回滚日志模式的库旁边、空的或首字节为 0、而且这条连接拿到了独占锁。活着的写者的日志和被杀的写者字节相同，读和 checkpoint 都看不出来，所以别的连接还在时 `BEGIN EXCLUSIVE` 失败，报 `checkpoint_failed`，日志和库都不动，写者照常提交。WAL 库旁边的同样文件仍报 `sidecars_remain`；首字节不为 0 的归 SQLite 回放；是链接的在打开之前就拒绝 | `packages/storage/src/upgrade-snapshot.ts` | `tests/security-invariants-upgrade-snapshot.test.ts`「a live writer's journal has a killed one's bytes」「only an empty or zero-first-byte journal」 | 无 |
