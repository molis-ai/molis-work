# 修复 Evidence Correction 迁移漂移

## 背景与证据

安装当前 Molis Work Runtime 后，桌面端打开 Footballnia 项目返回：

`no such table: evidence_corrections`

只读检查确认该项目的 `schema_migrations` 已包含 migration 17，但数据库中不存在 `evidence_corrections`。当前启动迁移只检查 migration 17 的账本记录，因此不会补建缺失的表。

## 目标

让 Molis Work 在打开这类历史项目时自动修复 migration 17 的结构漂移，使桌面端可以正常加载项目，同时不改写任何 Goal、Evidence 或事件事实。

## 范围

- `src/v1/store.ts`：migration 17 同时校验账本记录与 `evidence_corrections` 表是否存在。
- `tests/v1.test.ts`：覆盖“账本存在但表缺失”的真实回归形态。
- 本地重新构建、安装并重启 Molis Work Web 服务，验证 Footballnia 项目可打开。

## 非目标

- 不修改 Footballnia 的 Goal 数据。
- 不手工编辑用户数据库。
- 不扩展其他迁移的通用修复框架。
- 不改变 Evidence Correction 的表结构或产品行为。

## 方案

1. 读取 migration 17 记录。
2. 同时查询 `sqlite_master` 中是否存在 `evidence_corrections`。
3. 若记录或表任一缺失，运行现有幂等建表迁移。
4. 迁移写入账本时使用 `INSERT OR IGNORE`，兼容记录已存在的漂移数据库。

## 验收标准

- migration 17 已记录但表缺失时，重新打开 Store 会补建表且不产生重复账本记录。
- 新数据库和正常历史数据库行为不变。
- TypeScript 检查和相关 V1/Web 测试通过。
- 重装后 Footballnia 桌面项目页不再返回数据库缺表错误，并显示新版单目录工作台。
