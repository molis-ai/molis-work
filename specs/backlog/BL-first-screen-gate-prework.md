# BL-first-screen-gate-prework

分组：9. 平台小项与工程流程 / 首屏加载与资源

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-first-screen-gate-prework | 第 16 批开工前要单开一个门禁 PR，不和功能混：① 第一屏总字节检查（起固定种子的临时 Home 和真实 Host，不开浏览器，按页面和语言算第一次和再次打开的总字节，对照 merge-base 只许变少，不设绝对上限；收到达页、项目选择、工作台·新项目、工作台·全部项目插件四页，示例项目只报告）；创建 `tooling/gates/first-screen.json`；项目 id 写死、两边的 Home 用同样长度的路径，让同一提交的字节稳定；`page-assets-policy.mjs` 的许可文件加 `pages` 字段并放宽 `assets` 必填。② 防漏报告：给 `scripts/first-screen-report.mjs` 加「真开浏览器，把实际请求和清单对比，列出清单没有的路径」，不挡合并。③ 门禁前先修 `scripts/first-screen-report.mjs` 的两处：Host 在报告中途被杀时，报告仍以退出码 0 结束，结果可能不完整；`startHost`（第 105～119 行）只看 `host.exitCode`，启动中被信号杀掉时 `exitCode` 是 null、`signalCode` 才有值，它要等 150 次重试（每次隔 200 毫秒，至少约 30 秒）才报「没有回应 /health」。门禁拿这个脚本的结果做对照，退出码和结果不全不能靠。改门禁是红线，开工前要问用户的有两件：防漏报告放夜间 CI（建议，新增一个不挡合并的作业）还是每批开工前在本机跑；第一屏门禁 PR 本身 | [字体皮肤语言的首屏实测与资源预算方案](../font-and-skin-system/resource-budget.md) 第 6.1、7、8 节；用户 2026-11-07 定方案二（需求书 §12）；③ 是 2026-11-08 第 14 批文档整理时读 `scripts/first-screen-report.mjs`（#1941 修过打断之后的版本）核出的 | 明确后续做 | A 段不做（用户定）；门禁和 CI 属于红线，要先问用户 | 无；是第 16 批开工的前置，起点是它合入后的那次实测 | 高 | D 外观与语言（第 16 批主会话）；门禁文件找 `tooling/gates/` 的主人 |
