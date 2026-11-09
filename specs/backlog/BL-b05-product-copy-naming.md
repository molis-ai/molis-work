# BL-b05-product-copy-naming

分组：9. 平台小项与工程流程 / 翻译与界面用词

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b05-product-copy-naming | **2026-11-09 修复片已把产品内旧叫法统一到「输入与输出」**：Schedule `schedule.hint.workspace-link`、Files `files.stage.manage`、Git `git.stage.manage` 的 zh/en 与 `tests/schedule-readiness.test.ts` 断言已改，三份插件 README 与设置页导航标签一致。剩下两件：① 设置页分区 id/URL 仍是 `/settings/workspaces`（导航标签已是「输入与输出」，分区 id 与 URL 未跟着改；改名要动路由、合同与测试，需用户拍板）；② 这些文字与断言随第 16 批换成稳定键与语言文件（`t`、`locales`），不再用 `L`/messages 里的中文键。 | #1979 第 05 批独立审计；2026-11-09 修复片更新 | 明确后续做 | 分区 id/URL 改名是公开路由变化，需用户决定；稳定键迁移归第 16 批 | 第 16 批文字与外观能力；设置页分区 id/URL 改名的决定 | 中 | 内置插件（E 轨）／工作台外壳（执行会话待分配） |
