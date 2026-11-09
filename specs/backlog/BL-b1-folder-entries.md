# BL-b1-folder-entries

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b1-folder-entries | 定样 B1「就地指定」（`docs/design/05-materials-directories/README.md` 第 108 行）要在 Goal 的输入和选资料的弹层上，每组读不到的引用一个「指定文件夹」。今天 Goal 的输入只收 `feed_item` 和 `plugin_object`，工作台没有选资料的弹层，也没有页面读 `materials.origins`、`materials.recent`。这两处界面落地时，用 `apps/workbench/src/browser/project-directory-chooser.ts` 的浮层调 `projects.directories.map_source`，不另写一份。最近用过交 07-1、对话里的提示交 A 轨 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾（用户 2026-11-08 定） | 已知缺口 | 显示按文件夹引用的界面还不存在 | Goal 输入收资料引用、选资料弹层 | 中 | C1（执行会话待分配） |
