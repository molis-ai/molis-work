# S-upgrade-ledger-verified

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-upgrade-ledger-verified | 升级记录被改、外来或指向不存在的单元时拒绝，不照着做：`home_identity` 不符、`relative_path` 离开 Home、是绝对路径或对不上当前描述符、单元的 `to` 不是这个程序升到的版本、状态或字段不合写法、`run_id` 里带路径、同一单元出现两次、不是 JSON、`upgrade/` 是符号链接，一律报 `storage.upgrade_failed`（`ledger_invalid`），不放回，库文件不变，`upgrade/` 指向的目录不写，锁交还。真实路径永远从可信 Home 和描述符现算，不读记录里写的路径。指向的快照不在时记 `snapshot_invalid`，不动库文件，也不重试。设计 `specs/upgrade-continuity/upgrade-chain-design.md` §10 的暂定号是 S-144；记录的 `to` 指纹与当前程序不同，算程序换了版本、上一轮被打断，只把放回做完再开新一轮（路径和主人照样核），不算伪造 | `apps/local-host/src/home-upgrade-ledger.ts`、`apps/local-host/src/home-upgrade.ts` | `tests/security-invariants-home-upgrade.test.ts`「the record as it was written is followed」「a record from another Home」「leaves the Home, is absolute, or names no store」「a unit's `to`」「a record that cannot be read」「a link at `upgrade/`」「a snapshot that is not there」 | 无 |
