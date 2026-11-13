# 未完成事项

[统一待办入口与规则](../BACKLOG.md)。本目录每个 `BL-*.md` 是一项未完成事项的唯一正文，完成后删除文件。新增使用语义 ID，保留八列信息与负责人；类型只用六种：待你验收、待你决定、未实现、部分实现、明确后续做、已知缺口。

- 摘要、分组计数与筛选：`node scripts/backlog-index.mjs`（`--group`、`--type`、`--priority`、`--owner`、`--list`）。
- 原始逐条：`node scripts/gates/backlog-rows.mjs --report`。
- 已删除、已并入或只在分支的编号：[REMOVED.md](../../docs/backlog-removed.md)。
