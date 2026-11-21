# S-work-terminal

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-work-terminal | 平台工作终端动作（`work_terminals.open/list/close/prompt@1`）只允许本人在项目页面直接调用，拒绝 Agent、插件、工作流、MCP、受托与无项目或跨项目身份；起终端前与提交前同步复核调用者与目标插件实例的当前授权、项目可见性与发布者状态，失活/撤权/停用时零面板记录且零进程派生；存活面板表在登记时清理已退出的死面板，插件停用、项目隐藏或发布者撤销时同步终止对应面板进程。 | `apps/local-host/src/work-terminal-service.ts`；`apps/local-host/src/work-terminal-http.ts`；`apps/local-host/src/plugin-terminal-panels.ts` | `tests/security-invariants-plugin-terminals.test.ts`「S-work-terminal platform work-terminal actions refuse non-person, delegated, plugin, and cross-project callers with zero spawned panels」 | `tests/goals-terminal.test.ts`「RAC-2563 the four platform work-terminal actions are the person's only」「PEQ-17 work-terminal open refuses mid-flight caller revocation or plugin disablement」「PEQ-17 work terminals refuse mid-flight regrant revocation」 |
