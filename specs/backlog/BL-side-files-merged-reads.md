# BL-side-files-merged-reads

分组：9. 平台小项与工程流程 / 首屏加载与资源

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-side-files-merged-reads | 对抗式审查 N52：侧栏「文件」与放置面板仍按来源逐个请求（`apps/workbench/src/scripts/client/side-panel-files.ts`、`placement.ts`），一个项目接了几个来源就在打开右侧或放置时发几次读取，应合成一次 | [第 07 批](../post-anticorruption-roadmap/reference/batches/07.md#batch-07-item-2)交付项 2 的 07-2b | 未实现 | 要等第 06 批的 06-1（公共资料与迁移清单，决定「文件」怎样并进「项目资料」）和 06-3（N42，改 `side-files-http.ts` 建上下文的方式）；第 07 批合入时 06 还没合入，按本批「粒度」移出 | 06-1、06-3 | 中 | 第 06 批 S4/S5 工作台写手（Codex 06 统筹，2026-11-09 接盘） |

2026-11-09：06 的公共资料界面替换同一批调用方，按该批拆片调整一并消除重复读取；先做 N42，再做合并首屏响应与两个消费者，详细验收见 [BSH-13](../batch-06-shared-tools/spec.md#5-验收标准)。本条保留到真实多来源 HTTP 验证完成。
