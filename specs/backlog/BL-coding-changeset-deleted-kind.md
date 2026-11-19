# BL-coding-changeset-deleted-kind

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-coding-changeset-deleted-kind | Coding 保存「本轮变更」时，把有证据表明在本轮成功删除的文件列为「已删除」，显示文件路径。 | 第 02 批复查（2026-11-08） | 未实现 | 生成固定变更的 createCodingChangeSet 目前只写 added 和 modified。命令回执或子任务合并结果中的删除尚未进入清单。 | 无；第 02 批复查发现。执行批次 [99-1](../post-anticorruption-roadmap/reference/batches/99.md#batch-99-item-1)。 | 低 | B／Coding、Files 与 Git（执行会话待分配） |

2026-11-18 用户决定。命令执行记录或子任务合并记录能证实本轮删掉了哪个文件，就保存对应路径与 deleted 状态。只有删除命令文字、执行结果未知或只看到文件已不在工作区，都不足以把删除归给本轮。SDK 的公开 Diff 仍支持 deleted。
