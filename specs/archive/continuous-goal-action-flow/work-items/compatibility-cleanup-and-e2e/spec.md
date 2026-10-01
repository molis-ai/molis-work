# Work Item：兼容、清理与端到端验收

## depends_on

前三项全部完成。

## 允许修改

`src/mcp/**`、`skills/goal-advance/**`、文档和全套测试；只清理由本任务取代的逻辑。

## 输出

单一 MCP legacy adapter、兼容 release/complete、简化 Skill、删除重复状态/Risk/手动收尾生产逻辑、migration 与 fresh Session 验收记录。

## 验收与验证

- 静态搜索确认内部无第二套状态机，历史读兼容保留。
- `pnpm test` 通过。
- 手动 E2E 覆盖完整用户旅程；未运行项和残余风险如实记录。
