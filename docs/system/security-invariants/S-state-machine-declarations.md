# S-state-machine-declarations

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-state-machine-declarations | Manifest 的状态机条目只接收自己命名空间内的 ID、版本、状态家族、初始状态和终态。拒绝跨插件或平台 ID、超限、未知字段、非法家族和无效引用。校验只读清单，状态声明不授予权限。 | `packages/plugin-sdk/src/state-machine-declaration.ts`、`packages/plugin-sdk/src/manifest.ts`、`tooling/plugin-cli/src/validate.ts` | `tests/security-invariants-state-machine-declarations.test.ts`「untrusted declarations reject wrong identity」「validate reads and reports metadata without executing the entrypoint」 | — |
