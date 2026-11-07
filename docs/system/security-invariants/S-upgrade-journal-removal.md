# S-upgrade-journal-removal

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-journal-removal | 拍升级快照时只删一种 `-journal`：回滚日志模式的库旁边、空的或首字节为 0、而且这条连接拿到了独占锁。活着的写者的日志和被杀的写者字节相同，读和 checkpoint 都看不出来，所以有连接持锁时（另一个进程的，或同一份 SQLite 的）`BEGIN EXCLUSIVE` 失败，报 `checkpoint_failed`，日志和库都不动，写者照常提交。闲置连接不持锁，不算，日志照删，它之后照常写。**看不见的一种：** 同一进程里另一份 SQLite（`node:sqlite` 和 `better-sqlite3`）的连接，文件锁按进程算，它的写者的日志会被删掉，之后 `COMMIT` 报错；这一种只靠调用方保证这个文件上没有别的连接，这里拒绝不了。WAL 库旁边的同样文件仍报 `sidecars_remain`；没人持锁时，首字节不为 0 的归 SQLite 回放；另一个进程活着的写者（`synchronous=OFF`）首字节不为 0 的日志不回放也不删，报 `sidecars_remain`，写者照常提交；是链接的在打开之前就拒绝 | `packages/storage/src/upgrade-snapshot.ts` | `tests/security-invariants-upgrade-snapshot.test.ts`「a live writer's journal has a killed one's bytes」「only a connection holding a lock stops the removal」「only an empty or zero-first-byte journal」 | 无 |
