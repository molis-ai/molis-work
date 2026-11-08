# S-unified-account-tenants

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-tenants | 租户与平台管理只走固定动作与中央权限；拒绝伪造 actor、未知或重复查询、GET 正文、缺少幂等键及错误来源，不改变本机 Home 身份。 | `horizontal/account/src/management-actions.ts`、`apps/local-host/src/account-host.ts` | `tests/security-invariants-account-host.test.ts`「S-unified-account-tenants」 | `scripts/account-tenants.test.mjs`（WUA-20/22） |
