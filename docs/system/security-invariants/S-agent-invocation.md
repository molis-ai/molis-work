# S-agent-invocation

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 只在本机跑 |
| --- | --- | --- | --- | --- |
| S-agent-invocation | Agent 注册包装缺少真实调用控制或控制已拒绝时，拒绝执行处理器及业务写入；不得补空授权检查 | `horizontal/agent-host/src/capability-registration.ts` | `tests/agent-start-authority.test.ts`「D0134 missing invocation and failed authority never reach Agent Host」 | 无 |
