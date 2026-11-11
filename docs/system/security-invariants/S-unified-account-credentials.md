# S-unified-account-credentials

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-credentials | 注册、登录与找回仅经 Host 认证窄入口；拒绝错误来源、缺少控制头、注入身份/客户端/证明、错误步骤或句柄。匿名登录恢复仅限原浏览器会话，拒绝其他浏览器接管，拒绝的并发入口不得改写已有登录 Cookie。同一浏览器的匿名入口与退出通过页面间锁串行处理 Cookie 更新。退出清空认证事务；重新建立同用户登录也撤销旧租约与浏览器会话，准备时的 HTML 等待页不授予业务权限；取消及重启使原事务失效，换取 Token 中的迟到完成不可安装会话。 | `apps/local-host/src/account-auth-http.ts`、`horizontal/account/src/authentication.ts` | `tests/security-invariants-account-host.test.ts`「S-unified-account-credentials」、`tests/personal-http.test.ts`「ASR-02/03 web login binds the installation account」（WUA-29）、`tests/personal-auth.test.ts`「WUA-30 signing in to the same user replaces the login lease」、`tests/space-surface-account-race.test.ts`「WUA-30 pending account navigation returns recoverable HTML」 | `scripts/account-authentication.test.mjs`（WUA-11） |
