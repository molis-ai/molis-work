# BL-runtime-mcp-actions-snapshot

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-runtime-mcp-actions-snapshot | 运行时登记的 MCP 动作（外接 MCP 服务器、连接带的 MCP 工具登记成的动作）不在动作合同快照 `tooling/gates/actions/` 里：快照只量内置 Manifest 和宿主另外登记的动作，运行时才有的这类动作的形状变了，门禁看不到 | [能力包需求](../capability-pack/spec.md) §8；[设计稿](../capability-pack/contract-design.md) §10 | 已知缺口 | 第 09 批不改门禁；要定怎样在快照里表示「随连接而来、名字不固定」的动作 | 先做 [BL-mcp-action-pipelines-merge](BL-mcp-action-pipelines-merge.md) 更省事（只量一条流水线） | 低 | C 轨（C1，动作合同快照）；去处第 62 批第 1 项，与 [BL-mcp-action-pipelines-merge](BL-mcp-action-pipelines-merge.md) 一起做（合并后快照只量一条流水线） |
