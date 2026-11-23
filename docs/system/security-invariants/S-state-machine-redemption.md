# S-state-machine-redemption

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-state-machine-redemption | 有代码声明的插件，代码运行的状态机必须和 Manifest 的 `state_machines` 逐台一致（编号、版本、状态与家族、起始与终止状态）。随宿主发布的内置插件双向核对：Manifest 写了而代码没给、代码给了而 Manifest 没写、或两边不一致，都不启动，报错指到 `machine_id`，同一平台里的其他插件照常启动。开发态插件代码给了声明才核对；沙箱里的生成插件没有代码声明，由创作台校验与回放保证 Manifest 和宿主生成结果一致。转换上的触发动作引用不在声明里，不查动作目录。 | `packages/plugin-runtime/src/contribution.ts`（`assertStateMachines`）、`packages/plugin-runtime/src/index.ts`（按安装信任决定是否必须兑现） | `tests/security-invariants-state-machine-registry.test.ts`「a built-in plugin whose code runs other machines than its Manifest declares does not start」「a development plugin is checked when its code gives machines」 | — |
