# S-installed-database-upgrade

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-installed-database-upgrade | 已装签名包的迁移只在同一发布者本人确认的版本切换中受理。预检只读私有 KV，且不回传校验器产生的错误文本。SQL Worker 以现行安装和旧发行物核对库主人、结构和版本，临近提交复查启用状态和原授权。提交前退出保留原结构和安装版本，Home 库按 checkpoint 快照恢复；其他插件继续运行。提交后启动失败时保留新版本和稳定的暂不可用原因。 | `apps/local-host/src/project-statement-worker.ts`、`apps/local-host/src/installed-database-upgrade.ts`、`apps/local-host/src/plugin-sandbox-database-upgrade.ts`、`packages/plugin-runtime/src/index.ts` | `tests/security-invariants-installed-database-upgrade.test.ts`「refuses a signed migration validator with write access」 | `tests/security-invariants-installed-database-upgrade.test.ts`「an interrupted SQL worker leaves the old owned schema」「a failed Home upgrade is restored byte for byte」「a startup constraint and validator error」「switching the Home plugin off before publish」「activation failure after a committed migration」 |
