# S-unified-account-borrowed-home

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-unified-account-borrowed-home | 借用安装会话的 Home 只拥有当前账号的读取与资料/租户管理：它不能自己开始登录或切换账号（`/api/account/auth/transactions` 的 `LOGIN`/`SWITCH` 等 purpose 一律 conflict，且不发出任何中央事务），也不能替安装账号退出（`/api/account/logout` conflict，安装会话保持不变）。登录、换号与退出只由安装入口和它的准备协议完成；拒绝发生在中央 Auth 调用与账号状态变化之前。 | `apps/local-host/src/account-host.ts`（`authenticate` 的借用会话包装、`handleAccountHttp` 的 logout 拒绝） | `tests/security-invariants-account-borrowed-home.test.ts`「S-unified-account-borrowed-home」 |  |
