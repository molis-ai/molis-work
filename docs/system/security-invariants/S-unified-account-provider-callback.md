# S-unified-account-provider-callback

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-provider-callback | 账号第三方回跳只接受精确本机地址的无正文 GET 导航，以 Host 保留的 state、事务、提供方和当前尝试校验，向 Auth 确认真正结果后一次性完成。外层按协议参数把统一账号回跳交给当前 Home，回跳仍由该 Home 验证。错误来源、未知或重放回调、取消及重启后完成均拒绝。浏览器和桌面只打开经过校验的 Auth 地址，不安装 Token。成功或取消仅返回不可缓存的纯文本提示，nosniff、无来源泄漏和禁止脚本/嵌入的 CSP 保持，不生成整页或携带凭据。 | `apps/local-host/src/space-web-server.ts`、`apps/local-host/src/account-callback-http.ts`、`horizontal/account/src/provider.ts`、`horizontal/account/src/authentication.ts` | `tests/security-invariants-account-host.test.ts`「S-unified-account-provider-callback」 | `scripts/account-provider.test.mjs`（WUA-14、T01-CALLBACK-01） |
