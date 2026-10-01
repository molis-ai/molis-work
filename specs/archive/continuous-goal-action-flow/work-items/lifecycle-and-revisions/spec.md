# Work Item：生命周期、Risk 与 Contract revision

## depends_on

`action-projection-and-migration`。

## 允许修改

`src/v1/coordinator.ts`、`src/v1/parent-completion.ts`、新增 reconciliation/revision 模块、`src/mcp/server.ts`、相关 v1/MCP 测试。

## 输出

action-aware select、token 冲突恢复、自动 release/complete、Human Review、Risk 闭环、同 Goal Contract revision 和父子/下游传播；写操作返回 transition receipt。

## 验收与验证

- 正常、无 Review、Human、返工、Risk、revision 和父 Goal 状态序列通过。
- 旧 revision Runtime 写入被拒绝且返回恢复动作。
- blocked 保留 Claim、failed 自动释放。
- `tests/v1.test.ts tests/mcp.test.ts` 通过。
