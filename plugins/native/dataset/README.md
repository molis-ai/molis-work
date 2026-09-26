# Dataset 数据表入口

本机表格：改列改行、粘贴与导出 CSV、保存快照及回滚、发布 Artifact。业务数据仍在 `{home}/dataset/dataset.db`，按 Host 注入的 canonical project_id 分区，保留原表、快照和 Artifact 身份。

包名：`@molis-ai/molis-work-plugin-dataset`。

插件自身声明 13 个动作及输入输出合同，Host 注册同一组处理器。内部调用、原 HTTP 和原 12 个 MCP 名称都通过动作服务执行；HTTP 与旧 MCP 仅转换参数。旧 MCP 默认关闭、仍需绑定项目，其权限不因迁移扩大。新标准 MCP 目录由共同动作定义派生，客户端授权配置属于系统服务。

“按列名加列”是本地操作，不调用模型。“AI 拟列名加列”明确调用当前文字模型，只拟一个列名，不发送表内数据，额外要求 `model:invoke`。无可用模型时保留本地操作；模型失败、取消或等待期间表已改变时不追加列。

编辑和命令支持 `expected_version`；工作台串行保存并提交已读取版本。冲突保留本地输入，阻止继续发布或切表，用户可复制内容后明确重新读取。旧调用不传版本时沿用执行时当前版本。CSV 支持带逗号、转义引号、多行文本的字段；编辑多行单元格不会丢掉换行。

发布先保存固定快照，再交给原 Artifact owner。中断后显示“恢复发布”，恢复原内容及版本，保留此后本地编辑；完成后可另存新版。未恢复的发布不能删除，表和本机快照的删除在同一事务完成。

开发合同见 [Plugin 开发](../../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。对应验证为 `tests/dataset-actions.test.ts`、`tests/dataset-mcp.test.ts` 和 `tests/dataset-actions.e2e.test.ts`。这项迁移不代表全系统工作流、客户端授权或其他插件已完成迁移。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`
