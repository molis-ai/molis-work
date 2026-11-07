# S-upgrade-snapshot-confinement

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-snapshot-confinement | 升级快照目录 0700、文件 0600，不含密钥（清单只记依赖）；路径只从可信 Home 和描述符推导，不读记录里写的路径。离开 Home 的路径、路径上的符号链接（库文件、旁路文件、上级目录、`upgrade/`、运行目录）、多一个硬链接的库文件、不合写法的运行 id 都在打开连接和写任何东西之前拒绝，目标外文件不变；不持这个 Home 的存储主人锁时不拍、不放回、不清理：锁目录只能是这个 Home 本身或它的直接子目录，别的 Home 的活锁（连同它自己的锁目录）、嵌在这个 Home 里的 Home 的锁都拒绝。`upgrade/`、运行目录在打开连接之前查过之后才换成链接的，在写之前再拒绝一次（`snapshot_write_failed`），不写穿。设计 `specs/upgrade-continuity/upgrade-chain-design.md` §10 的暂定号是 S-143；其中账号 Home 的 `spaces` 符号链接那半由枚举它的 U1-g 接上 | `packages/storage/src/upgrade-snapshot.ts` | `tests/security-invariants-upgrade-snapshot.test.ts`「the directories are 0700」「a path that leaves the Home」「a link on the way」「a path written into the manifest」「keys stay out of the snapshot directory」「without this Home's live lock」「a Home nested in this one」「a link put there after that check」 | 无 |
