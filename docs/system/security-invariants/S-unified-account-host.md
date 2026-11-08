# S-unified-account-host

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-host | 中央账号读取需要本机 Host、控制 Token 与同源 Origin（缺省时可用同源 Referer）；显式错误来源不回退。环境、客户端、上游地址与凭据引用仅由 Host 注入，中央身份不替换本地 actor；不回传 Token。错误绑定、未知参数、取消、换号与 Host 关闭后的迟到响应均拒绝。当前 Home 的 Personal 租约在异步验证后和中央写入前重新检查，失效时拒绝发出写入。 | `apps/local-host/src/account-host.ts`、`apps/local-host/src/space-web-server.ts`、`apps/local-host/src/web-http.ts`、`horizontal/account/src/client.ts` | `tests/security-invariants-account-host.test.ts`「S-unified-account-host」 | `tests/account-client.test.ts` |
