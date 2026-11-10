# BL-delete-files-writer-worktrees

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-delete-files-writer-worktrees | 删除项目选「删除项目和文件」时，默认输出目录下 `outputs/.molis-work-writers/` 里写手的 Git 工作树没有一起清掉（工作树登记在仓库的 `.git/worktrees` 里，目录删了登记还在）。删除服务要先按登记移除写手工作树，再删文件夹 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批评审台 | 已知缺口 | 写手工作树的移除归 Coding 的写手分配，本批只做删除确认 | `ProjectDeletionService`、BL-remove-standalone-worktree | 中 | C1（执行会话待分配） |
