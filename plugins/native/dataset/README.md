# Dataset 数据表入口

本机表格：改列改行、粘贴与导出 CSV、保存快照及回滚、发布 Artifact。业务数据仍在 `{home}/dataset/dataset.db`，按 Host 注入的 canonical project_id 分区，保留原表、快照和 Artifact 身份。

包名：`@molis-ai/molis-work-plugin-dataset`。

插件自身声明动作及输入输出合同，Host 注册同一组处理器。内部调用与原 HTTP 都通过动作服务执行，HTTP 只转换参数；MCP 客户端只经「能力 → 对外接入」授权的动作工具调用，目录由共同动作定义派生，客户端授权配置属于系统服务。

“按列名加列”是本地操作，不调用模型。“AI 拟列名加列”明确调用当前文字模型，只拟一个列名，不发送表内数据，额外要求 `model:invoke`。无可用模型时保留本地操作；模型失败、取消或等待期间表已改变时不追加列。

编辑和命令支持 `expected_version`；工作台串行保存并提交已读取版本。冲突保留本地输入，阻止继续发布或切表，用户可复制内容后明确重新读取。旧调用不传版本时沿用执行时当前版本。CSV 支持带逗号、转义引号、多行文本的字段；编辑多行单元格不会丢掉换行。文件导入从确认到提交占用编辑器，使用保存后的目标与版本；期间不能切表，表被移走后未提交的读取作废，迟到结果不再打开编辑器。读取失败保留输入，可继续编辑或重新选择同一文件。

Owner 在写入前拒绝超过 80 个 Unicode 字符的列名，仍限制最多 40 列、2000 行。Form 转表若题数或题名超出限制，保留原问卷、答卷、CSV 和已存表，由人缩短表头后重新导入。

发布先保存固定快照，再交给原 Artifact owner；固定下来的版本归本机的人，固定它的行为者记在 `created_by`。中断后显示“恢复发布”，恢复原内容及版本，保留此后本地编辑；完成后可另存新版；数据表移走又移回后，下一次固定接着项目成果库里已有的最高版号，不把旧版当作中断记录交回。未恢复的发布不能删除，表和本机快照的删除在同一事务完成。

开发合同见 [Plugin 开发](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。对应验证为 `tests/dataset-actions.test.ts`、`tests/dataset-mcp.test.ts` 和 `tests/dataset-actions.e2e.test.ts`。这项迁移不代表全系统工作流、客户端授权或其他插件已完成迁移。

页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/dataset-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂），`src/client.ts` 只读这份包；请求经共同的 `molisWorkRequest`，路径来自 `host.pluginRoute`，浏览器代码里不写插件 id。

页面上的字是稳定键（`dataset.<区域>.<名称>`），中英文都在 `src/messages.ts`，登记在 `registration.ts` 的 `messages`，不经工作台的 `i18n/en.ts` import。`src/en.ts` 的 `DATASET_EN` 只留 15 条宿主还按中文原文翻译的词（服务端标签与错误、别的主人在查的词，BL-460）。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：表格目录、编辑、CSV 与版本。
- 不负责：Goal 与 Artifact 事实、模型提供方、托管表格。
- 公开入口：`@molis-ai/molis-work-plugin-dataset`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `dataset.<原因>`，状态由错误种类决定，Dataset 不自带状态表）、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 数据按 Host 注入的 canonical `project_id` 分区。
  - 冲突保留本地输入，并阻止发布或切表。
  - 发布中断后可恢复原内容与版本并保留之后的编辑；未恢复的发布不能删除，表与快照在同一事务删除。
  - 发布的每个副作用（intent、成果、完成记录）先等这次调用的授权，库与成果服务在写入的同一回合里再问原调用方（S-18），插件不手写这一步：被取消或撤权的调用只留已经提交的阶段，不再多写成果（`tests/dataset-promote-authority.test.ts tests/dataset-client-bundle.test.ts tests/creative-tools-plugins.test.ts`）。
  - 项目被删除时宿主按目录条目上的 `project_data`（`datasetProjectData`，`src/project-data.ts`：确认框里的标签与 `purgeDatasetProject`）调用清掉数据表与保存的版本，连同创建回执；只读库文件，库不存在时不创建，重复运行没有副作用。
- 改动后必跑：`node scripts/run-tests.mjs tests/dataset-actions.test.ts tests/dataset-mcp.test.ts tests/creative-artifact-promote.test.ts tests/document-pin-after-move.test.ts tests/artifact-compare-moved.test.ts tests/project-deletion-owners.test.ts tests/document-plugins-error-model.test.ts tests/dataset-promote-authority.test.ts`
- Owner 列名与跨 Form 转表改动加跑：`node scripts/run-tests.mjs tests/content-owner-regressions.test.ts tests/work-placement-plugins.e2e.test.ts`（后一份需要本机 Chrome）。
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/dataset-actions.e2e.test.ts tests/dataset-file-import.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
