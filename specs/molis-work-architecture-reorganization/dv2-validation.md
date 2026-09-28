# DV2 验收：Skill 与 Runtime 正式协议

2026-09-05；对应 accepted `goal-reorg-dv2` revision 1，实施范围见 [工作计划](dv2-work-plan.md)。完成等级：本切片功能可用，未代替整体用户 E2E 或发布验收。

## 验收逐项对照

| 条件 | 所需证据 | 结果与位置 |
| --- | --- | --- |
| dv2-boundary | dv2 boundary audit；dv2 contract conformance | 通过。Skill 只消费公开工具，明确 Contract/Available/transition 的动作字段，不读取 Store、Coordinator 或 Web route，不重算资格；`apps/mcp` 公开具名 launcher validator，安装服务只导入包入口。边界检查 48 packages、306 source files、0 errors。 |
| dv2-legacy-exit | dv2 caller inventory；dv2 legacy responsibility diff | 通过。`src/install/runtime-integration.ts` 的默认验证 caller 已切到 MCP App；旧函数删除，新函数体与 HEAD 旧函数体直接比较一致，超时、初始化、tools/list、退出与失败语义未改。Skill 的每次写后轮询要求和目录默认说明矛盾已移除，中英文 MCP/Runtime 文档移除 workspace_default 与正常流程手动 complete/release 的指导。 |
| dv2-result | dv2 targeted test or inspection；dv2 primary deliverable | 通过。真实 MCP 协议完成创建/绑定、同一 Draft 重启恢复、答案重放、用户决定、执行、文件 Evidence、Review 和自动完成；真实 launcher 子进程接入及失败回滚通过。方法正文/优先级、宿主权限、Session 故障不丢主写入的相关回归通过。 |

## 实际调用与交付

- Skill distribution：`skills/goal-advance/SKILL.md`、`references/protocol.md`、`references/project-connection.md`。其余规划/执行/服务参考保留；方法正文仍由 Goals Module 的 planning 实现提供，未复制到 Skill。
- Runtime 安装接入：原 `RuntimeIntegrationService` → `@molis-ai/molis-work-app-mcp` 的 `validateMolisWorkMcpLauncher` → 实际 stdio launcher。有限上下文只包含 runtime、launcher、home 和 plan；原公开上下文保留 SupportedRuntimeId 限制。
- 当前开发说明：`docs/mcp.md`、`docs/mcp.en.md`、`docs/runtime.md`、`docs/runtime.en.md`、MCP App README。工具 schema/展示归 MCP App，业务事实归 Modules，跨模块能力归官方 Goals Plugin，宿主装配归 Local Host。
- `tests/runtime-skill-flow.test.ts` 通过生产 `MolisWorkServer.handleMessage` 调用真实工具；拒绝未确认决定后 snapshot 不变；重放答案后 snapshot 不变；重启后 Evidence/Review 各一条、Goal satisfied、无活动 Claim、Review Run completed。没有通过测试直接操纵 Store。
- `tests/runtime-integration.test.ts` 新增默认验证器真实子进程测试；失败接入不会残留目标 Runtime 配置/Skill，也不改此前成功接入的配置。

## 验证记录

- MCP App build、根 TypeScript：通过。
- `node --import tsx --test tests/runtime-integration.test.ts tests/runtime-skill-flow.test.ts tests/mcp.test.ts`：46 通过，0 失败/跳过。日志 `/private/tmp/molis-work-dv2-protocol-regression-20260905.log`。
- `node --import tsx --test tests/planning-engine.test.ts tests/mcp-protocol.test.ts tests/runtime-context-entry.test.ts tests/mcp-session-activity.test.ts`：20 通过，0 失败/跳过。日志 `/private/tmp/molis-work-dv2-owner-regression-20260905.log`。
- `pnpm boundary:check`、`git diff --check`：通过。Skill quick_validate 通过，仅作为格式辅助，不作为功能证据。
- DV1 的 601 项全量回归发生在 DV2 改动前，不冒充本项之后的全量结果。本项共 66 项针对性回归。

## 明确未完成的整体事项

本项未更新用户已安装的 Skill、Runtime 配置或发布物。当前宿主仍报告 Session Registry schema 5 / reader 3，DV4 更新分发后必须验证真实恢复，不允许切换数据库绕过。安装预览、配置 parser、备份/回滚与供应链仍由 DV4 拆分；Runtime Integration 仍是 1,393 行，不能宣称 Huge Class 治理完成。完整前后端用户行为 E2E、随后清理与重复 E2E、最终包边界/调用链审计仍属总目标。

自动协议测试证明公开工具可以承载工作流，不证明模型永远正确遵守 Skill，也不证明真实 UI 已无损。
