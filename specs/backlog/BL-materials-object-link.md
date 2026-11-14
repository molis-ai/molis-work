# BL-materials-object-link

分组：4. 搜索、放置与工作流

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-materials-object-link | 资料阅读器（工作区 `materials` 舞台）没有对象链接：`/?openPlugin=materials&openItem=<工作区:路径>` 打开页面后不进舞台，因为 `apps/workbench/src/scripts/client/tab-workspace.ts` 只按插件字形表与「本项目提供的插件」放行 `openPlugin`，`materials` 是外壳自己的面不在其中。退休的 Files 插件原有 `?openPlugin=files` 直达；`returnLink`（`apps/workbench/src/browser/return-trips.ts`）对 `materials` 面同样会拼出这种打不开的链接。要让外壳自己的 `materials` 面也能被对象链接打开，并补一条浏览器用例 | [第 06 批](../post-anticorruption-roadmap/reference/batches/06.md)同步第 15 批后整理全量失败时发现（`tests/appearance-side-windows.e2e.test.ts` 改成从侧栏读文件） | 已知缺口 | 第 06 批收尾只修全量失败；补链接要定外壳对象面怎样进链接白名单、回程怎样落位，属界面动线，不在收尾里做 | 无 | 中 | 工作台外壳（执行会话待分配） |
