# BL-feed-sql-driver-name · 把 Feed 连数据库的旧函数名改准确

Feed 已换过数据库驱动，函数名还写着旧驱动。把名字和调用处一起对齐，行为照旧。

预计 **1.5–3 工时**。维护范围为Feed。正式交付项为 [95-1](../../batches/95.md#batch-95-item-1)。[原始待办](https://github.com/molis-ai/molis-work/blob/3a6f2289a0b526d0496481ee060807c23ed337f3/specs/backlog/BL-feed-sql-driver-name.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-feed-sql-driver-name。正式交付项为 95-1，批次文件在 specs/post-anticorruption-roadmap/reference/batches/95.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 https://github.com/molis-ai/molis-work/blob/3a6f2289a0b526d0496481ee060807c23ed337f3/specs/backlog/BL-feed-sql-driver-name.md（已完成删除）。产品决定与验收按该 BL 的现行记录。

目标
把 Feed 连数据库的旧函数名改准确。Feed 已换过数据库驱动，函数名还写着旧驱动。把名字和调用处一起对齐，行为照旧。

实施
从 plugins/native/feed/src/store/sql.ts 的 fromBetterSqlite 开始，用 git grep 找齐演示宿主、同步任务、Feed、本仓测试和插件 README。改成说明「从项目连接取得 Feed 的数据库接口」的名字，检查包公开出口和 API 快照。保留读写和事务语义。

验收
全仓核旧符号和所有调用方的类型。构建 Feed 及实际受影响的调用包，跑相关 Feed 存储和同步测试。若有公开 API 变更，按仓库合同流程更新快照并说明调用方影响。 定向入口可用 node scripts/run-tests.mjs tests/feed-module-repositories.test.ts，另跑 git grep 命中的同步调用测试。

协作
可先做。机械改名会扫到 Feed 测试，与同组两项安排前后顺序。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
