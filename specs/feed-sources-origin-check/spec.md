# 重建 feed_sources.origin CHECK

## 背景目标

最新代码写来源时固定 `origin = "molis_work"`。本机已有项目库的 `feed_sources` 仍是旧 CHECK `origin IN ('relay', 'goalboard')`。`CREATE TABLE IF NOT EXISTS` 不会改已有表，保存/添加来源会直接被 SQLite 拒绝。

完成等级 **3：功能可用**。不发布，不改用户 Home 路径。

## 当前行为与问题证据

- 打开 4174 后保存来源返回 `{"error":"CHECK constraint failed: origin IN ('relay', 'goalboard')"}`。
- `~/.molis-work/projects/*/molis-work.db` 里 14 个库的 `feed_sources` 仍是该旧 CHECK；行值是 `goalboard` 或 `relay`。
- `modules/sources` 写入 `'molis_work'`，读取时也按这个契约映射。

## 范围与非目标

做：

- 打开库时若 `feed_sources` 的 origin CHECK 不是现行 `molis_work`，重建表并加上现行 CHECK。
- 复制行时把 origin 收成 `molis_work`；`imported` 状态仍改成 `disconnected`。
- 保留引用这张表的子行（例如 `feed_source_runs`），不因 DROP 被 CASCADE 清掉。
- 之后 `SourcesModule.commands.save` 能写入新来源。

不做：

- 不认 `~/.goalboard`、旧 catalog owner、旧 MCP 名。
- 不改 Session source CHECK。
- 不改用户真实 Home 里的文件，除非用户打开该项目、走生产迁移。

## 使用场景

1. 已有 RSS/GitHub 来源的项目：打开后列表仍在，再保存或新增来源不再报 CHECK。
2. 库里同时有 `relay` 和 `goalboard` 行：打开后都变成 `molis_work`，来源配置其余字段不变。

## 方案与关键决策

SQLite 不能 ALTER CHECK。这是表结构迁移，不是把 GoalBoard 当活身份继续兼容。重建时必须改写 origin，因为新 CHECK 装不下旧值。

## 输入输出与依赖

- 输入：已有 `feed_sources` 表 SQL 与行。
- 输出：现行 CHECK 的表、`origin = molis_work` 的行、可继续 save。
- 依赖：Sources Module `migrateSources`；Local Host 打开项目时构造 `SourcesModule`。

## 文件 / 模块边界

允许改：`modules/sources`、本 spec、`specs/drop-goalboard-identity/spec.md` 的 origin 条款、`tests/feed.test.ts`。

不改：Catalog、安装、MCP 工具名、Session Registry owner。

## 验收标准

1. 旧 CHECK `origin IN ('relay', 'goalboard')` 的库打开后，sqlite_master 含 `CHECK (origin = 'molis_work')`。
2. 旧 `relay` / `goalboard` 行变成 `molis_work`；`feed_source_runs` 行还在。
3. 打开后 `SourcesModule.commands.save` 能新增来源，不再抛该 CHECK。
4. 已经是现行 CHECK 的库只处理 `imported → disconnected`，不无故重建。

## 验证命令

```bash
node --import tsx --test --test-concurrency=1 tests/feed.test.ts
```

## 假设与开放问题

- 假设打开项目时 `migrateSources` 不在未关闭 foreign_keys 的外层事务里提交 DROP。用户现有库走 `SourcesModule` 构造，不包在 `storage.immediate()` 里。
