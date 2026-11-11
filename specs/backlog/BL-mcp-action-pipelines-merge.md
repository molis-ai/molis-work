# BL-mcp-action-pipelines-merge

分组：6. 连接、来源与 Onboarding

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-mcp-action-pipelines-merge | 两条「MCP 工具登记成动作」的流水线合成一条：`apps/local-host/src/external-mcp-actions.ts` 与 `connector-mcp-actions.ts` 各写一遍登记、版本与授权；合并后由动作主人记 MCP 工具的真实用量（今天能力包里 MCP 工具的用量是 `not_counted`） | [能力包需求](../capability-pack/spec.md) §8、§12（11-08 复查）；[设计稿](../capability-pack/contract-design.md) §10 | 技术债 | 它们是 MCP 调用链：四份 JSON（`config/*-mcp-actions.json`、`*-mcp-tools.json`）存着动作版本，工作流程与对外授权按这些版本固定引用，合并要改带版本文件的结构（升版本、写升级段），越出第 09 批的边界 | 带版本文件的升级链（`specs/upgrade-continuity/upgrade-chain-design.md`） | 中 | 连接器线；去处第 61 批第 1 项 |
