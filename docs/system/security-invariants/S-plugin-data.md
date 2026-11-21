# S-plugin-data

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-plugin-data | `plugins.data.sections@1` 与 `plugins.data.export@1` 只允许本人直接调用（拒绝 Agent、插件、工作流、MCP、受托与伪造宿主插件身份）；项目范围调用禁止跨项目读取；发现阶段跳过 `quarantined` 与损坏包且不让第三方覆盖内置清单；第三方 Home 库导出前经 `installed-plugin-libraries` 账本核验库名、发布者签名、版本与结构摘要，无归属或跨发布者一律拒绝；在项目范围导出非按项目分区的 Home 库时，缺失 `project_id` 列的表按 `actions.scope_mismatch` 拒绝，绝不退化为全表导出；查询固定排序并显式汇报截断。 | `apps/local-host/src/plugin-data-export.ts`；`apps/local-host/src/installed-plugin-libraries.ts` | `tests/security-invariants-plugin-owner-files.test.ts`「S-plugin-data plugins.data refuses non-person, delegated, quarantined, unowned Home DB, and non-partitioned Home tables without project_id under project scope」 | `tests/plugin-data-export.test.ts`「Audit #7 plugins.data.sections and plugins.data.export serve built-in and installed third-party plugins through the same contract」 |
