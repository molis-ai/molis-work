# S-upgrade-maintenance-listener

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-maintenance-listener | 升级时占着端口的那个监听只绑回环，和正式服务一样拒绝不是回环名字的 `Host`、拒绝别的来源的 `Origin`。它只答 `/health`：503，只有数字（进度和进程号），带了合法挑战才给证明，没有控制令牌就不给证明，也不会生成令牌；其余一律 503（`storage.upgrade_in_progress`、`Retry-After: 1`），不泄露库名和内容，也不做任何事。启动前枚举账号 Home 时没有登录，所以只认真在 `spaces/` 下、不经链接、并且自己的身份写着这个账号的目录：`spaces` 或账号目录是链接、身份对不上的都跳过，不取那边的锁，不写那边的 `upgrade/`。设计 `specs/upgrade-continuity/upgrade-chain-design.md` §4.2 | `apps/local-host/src/upgrade-maintenance.ts` | `tests/security-invariants-upgrade-maintenance.test.ts`「S-upgrade-maintenance-listener」 | - |
