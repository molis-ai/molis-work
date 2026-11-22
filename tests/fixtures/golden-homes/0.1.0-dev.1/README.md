# M1-B2 蓝图库 v1 升级金样

根 Home 使用 `0.1.0` 金样的合成项目和运行时数据，供现有主机回放执行固定的读取、写入和重启步骤。所有数据来自版本库的合成夹具。

新增的 `stores/blueprints/blueprints.db.sql` 由基准提交 `4c07d159ff2d515596442dc76f534e9c7b9d260a` 中的 `tests/fixtures/home-store-schemas/blueprints.sql` 创建。SQLite 文件通过仓库的基线 API 在临时 Home 建为 v1，写入一条 `golden-personal-blueprint` 草稿，再通过 `dumpSqliteText` 转储。清单记录转储的原版本、每表行数和摘要。

在仓库根目录执行 `node scripts/replay-golden-homes.mjs --golden 0.1.0-dev.1 --concurrency 1`。
