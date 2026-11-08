# BL-set-output-revision

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-set-output-revision | 插件页面经 `UiPageWorkspaces.setOutput` 改输出目录时，工作台先读目录、按读到的问人，但发给 `/api/host/plugin-page-workspaces` 的请求不带读到的 `expected_revision`；两次之间目录被别处改了，人确认的是旧状态。要把读到的 revision 一路传到 `projects.directories.set_output` | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批评审台 | 已知缺口 | 插件页面这条路的请求体不在本批合同里 | 05② 目录合同（#1979） | 中 | C1（执行会话待分配） |
