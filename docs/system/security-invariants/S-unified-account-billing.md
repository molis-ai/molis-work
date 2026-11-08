# S-unified-account-billing

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-billing | 订阅与席位页面复用固定动作网关；拒绝用户/租户主体注入、非法数量/查询、GET 正文和错误来源，中央权限是唯一授权依据。 | `horizontal/account/src/management-actions.ts`、`apps/local-host/src/account-host.ts` | `tests/security-invariants-account-host.test.ts`「S-unified-account-billing」 | `scripts/account-billing.test.mjs`（WUA-23/24/25） |
