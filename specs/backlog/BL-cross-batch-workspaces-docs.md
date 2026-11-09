# BL-cross-batch-workspaces-docs

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-cross-batch-workspaces-docs | `specs/sessions-rebuild/contract-design.md` 是还没实现的设计稿，仍按 #1979 已删除的旧目录合同写：`:3` 的状态句写「所以这里写 `projects.workspaces.list@1`」，`:575` 的目录变更通知列 `projects.workspaces.add`、`repair`、`unlink`，`:662` 与 `:681` 仍用 `projects.workspaces.list@1`、`projects.workspaces.add`，`is_default` 也已被 `roles` 取代。会话重建开工前要整份改成 `projects.directories.*`（读用 `get`，改用 `add_input`、`remove_input`、`set_output`、`repair`、`map_source`、`unmap_source`），否则会照旧名写代码。`specs/post-anticorruption-roadmap/reference/batches/06.md` 的 2026-11-08 评审节已按 #1979 重核，旧名只留在标了历史的 11-04 核账节，不在本条范围 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批独立审计（materials 分册 B1/评审台不挡项） | 已知缺口 | 会话重建是另一批、设计稿还没实现；改它属该批的事实主人，05 批不改 | 05② 目录合同（#1979）；会话重建批开工 | 中 | 会话重建批／C 轨（执行会话待分配） |
