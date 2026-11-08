# S-unified-account-credentials

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-credentials | 注册、登录与找回仅经 Host 认证窄入口；拒绝错误来源、缺少控制头、注入身份/客户端/证明、错误步骤或句柄。取消及重启使原事务失效，换取 Token 中的迟到完成不可安装会话。 | `apps/local-host/src/account-auth-http.ts`、`horizontal/account/src/authentication.ts` | `tests/security-invariants-account-host.test.ts`「S-unified-account-credentials」 | `scripts/account-authentication.test.mjs`（WUA-11） |
