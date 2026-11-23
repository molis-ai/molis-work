# S-state-machine-lifecycle-steps

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-state-machine-lifecycle-steps | 插件安装记录的生命周期状态只按平台状态机 `platform.plugin-runtime.lifecycle` 列出的步子写入。机器没列的步子（如隔离中直接回到运行、已卸载直接进入停用、第一条记录不是已安装）和词表之外的状态，在写安装库之前以 `state_machines.transition_invalid` 或 `state_machines.state_unknown` 拒绝，库里的记录保持原样。机器的状态与家族就是公开词表 `pluginLifecycle` 那一份，不另抄。 | `packages/plugin-runtime/src/lifecycle-machine.ts`、`packages/plugin-runtime/src/index.ts`（构造时给安装库套上守卫）、`packages/contracts/src/platform/state-vocabulary.ts` | `tests/security-invariants-state-machine-registry.test.ts`「a lifecycle step the platform machine does not list is refused and nothing is written」 | — |
