# S-unified-account-sensitive-operations

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-sensitive-operations | 账号敏感操作只接收 Host 临时句柄；拒绝浏览器注入证明、错误来源，以及退出后或重新登录后使用旧句柄。绑定、换绑、解绑和改密验证固定到原会话与操作目标，凭据不进入动作目录。 | `horizontal/account/src/authentication-management.ts`、`apps/local-host/src/account-auth-http.ts` | `tests/security-invariants-account-host.test.ts`「S-unified-account-sensitive-operations」 | `scripts/account-management.test.mjs`（WUA-17） |
