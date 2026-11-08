# BL-coding-changeset-deleted-kind

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-coding-changeset-deleted-kind | 一轮里删了文件，「本轮固定变更」里看不到：`CodingFileChangeKind` 的 `deleted` 没有写入方，`createCodingChangeSet` 只写 `modified` 和 `added`。删文件走 `run-command` 的回执（`coverage: "text-reviews"` 说的就是这件事）或子任务合并的 `target: "deleted"`，都不进固定变更。先判断要不要把删除收进固定变更：要，就补写入方；不要，就收窄这个取值 | 第 02 批复查（2026-11-08） | 明确后续做 | 这是产品判断，收窄会把现在的缺口写死。SDK 的 `DiffFileEntry.kind` 和 `diff.state@1` 的 `files[].kind` 也有 `deleted`，第三方能画，不能随手去掉 | 无 | 低 | B／Coding、Files 与 Git（执行会话待分配） |
