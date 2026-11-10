# 中央账号接入

包名：`@molis-ai/molis-work-service-account`。WORK-01 至 WORK-09 的 Host 私有中央协议客户端、环境校验、会话与身份验证协调器；不建立第二套账号或订阅事实。

`createAccountService` 接收冻结的环境配置及 Host 的 `currentCredential`、`resolveSecret` 端口。`readSession` 在无凭据时返回 ANONYMOUS；有凭据时真实查询中央会话和本人资料，校验 issuer/application/client/user/session 后只返回公共 AccountView。`invoke` 只接受冻结 OpenAPI 中的中央 operationId，校验路径、查询、正文与响应；它是 Host 进程内接口，不是浏览器、插件或 Agent 的任意代理。

`parseAccountEnvironment` 验证 ClientEnvironmentConfig 加 applicationId。Work 的产品地址必须为数字 loopback HTTP；LOCAL 的 Auth 同样为数字 loopback，TEST/PRODUCTION 的 Auth 为 HTTPS。回调必须精确为本产品 `/account/callback`，无通配、查询或片段。PRODUCTION 不接受 MOCK；缺失配置由 Host 表达未配置，不静默填写客户端或启用 mock。

`src/upstream/` 固定 Auth 合同 1.1.0 的原始文件，`provenance.json` 记录实际字节摘要与来源状态。更新时从 Auth 同一版整体复制并复核共用夹具；公开 DTO 从对应 schemas.json 生成，不手工改业务枚举。请求与响应都检查同一份合同，结构通过不等于通过权限或商业规则。

`node horizontal/account/scripts/check-contracts.mjs` 核对摘要及公开 DTO；同步 Auth 原始文件和 provenance 后，使用该命令的 `--write` 生成 DTO，再运行本包回归。来源是当前 Auth 已实现合同的字节快照，尚未把未提交工作描述为某个已发布版本。

`createAccountSessionManager` 是同一 Home 的会话 owner。Host 注入同步、原子、加密的单记录 storage；会话记录按环境绑定并严格检查现行格式。默认无记录即匿名，`beginLogin` / `completeLogin` 只供可信 Host 认证编排调用，TokenSet 不进入公共 DTO 或浏览器写接口。每个登录 attempt 继承原调用权限与取消状态，新的匿名 attempt、退出及关闭会使旧结果失效。已有活动登录须先退出再换号。

恢复先在线复核中央身份；离线只返回用户展示缓存，不授权管理操作。显式 activity 才延长中央闲置期，读取、刷新及重启不产生用户活动。刷新在请求发出前将持久记录改为不含 Token 的 REFRESHING，进程崩溃、结果丢失或新 Token 保存失败均不重放已消费 refresh。并发调用共用一次刷新，单个调用取消不取消其他仍有效的调用；服务端提前返回 401 时只读身份查询最多恢复一次，管理写入不自动重试。

退出先取消旧 epoch 并持久写入不含 Token 的记录，再通过独立撤销协议处理当前登录或所有产品；撤销快照只存在内存且不能恢复登录。持久清理失败不报告成功。相同退出幂等键保存无秘密回执，重复调用得到相同结果；新登录移除旧回执。`close` 取消并等待在途任务，正常活动记录保留供重启恢复。

`createAccountAuthentication` 编排邮箱注册验证、密码登录、+86 验证码注册登录和邮箱找回密码。PKCE、发起证明、验证/重设证明只存在 Host 内存，浏览器仅获得短时句柄。重新开始、取消、退出、关闭及到期会使原尝试失效；Token 换取中的迟到结果交给会话 owner 撤销。Google/GitHub 通过固定 Auth 地址发起，精确本机回跳在 Host 内校验 state、事务、提供方和中央结果，完成后由原页面读取会话；浏览器窗口与桌面系统浏览器共用同一事务。认证输入不进入动作目录。

WORK-05 的再次验证、绑定/换绑/解绑和改密共用上述验证协议。敏感事务固定到原登录 epoch、操作和目标；新身份事务依赖匹配的再次验证，取消任一事务后不得提交。操作证明与新身份证明只留在内存，成功后清除，仅保留短时无秘密幂等回执。个人资料更新与脱敏登录方式读取由 `accountActionProvider` 登记到唯一动作目录，只向 user audience 开放；提交前复核权限和会话，中央负责版本、身份占用及最后可用方式检查。

## 开发要求

- 负责：中央账号协议、可信配置、固定操作映射、DTO 校验、错误转换、会话记录格式、刷新协调、退出撤销、认证与敏感身份事务、个人资料动作和当前调用的身份/撤销复核。
- 不负责：存储加密适配、平台账号事实、订阅计算、Home 内容、界面或插件授权。
- 公开入口：`@molis-ai/molis-work-service-account`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/services/account`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（只取 `isRecord` 这一份共用判断）；不 import Host、插件、Module 或其他横向服务。密钥解析由 Host 注入，仅返回给当前调用内部。
- 不变量：
  - 输入不能控制上游 URL、HTTP 方法、任意头、主体身份或客户端。中央令牌是不透明材料，不解释成 JWT。
  - 固定配置和凭据绑定不符时先拒绝，不读取错误上下文的密钥；等待返回后复核原账号引用、调用权限和取消状态。
  - 重定向、错误响应结构、未知字段和过大正文拒绝；不把上游正文、异常消息或凭据放入本地错误。网络操作不自动重试，写请求始终保留原幂等键供调用方按合同处理。
  - 认证凭据只在 Host 内使用，不登记到普通动作目录；成员和商业动作的登记在 WORK-06/07 消费此客户端，同一操作不另开 HTTP 代理。
  - 仅持久化会话及用户展示缓存；不持久化中央业务数据，不改变本地 actor，不切换 Home。storage 只由 Host 注入，不通过插件或浏览器提供。
- 改动后必跑：`node scripts/run-tests.mjs tests/account-client.test.ts tests/account-session.test.ts tests/security-invariants-account-host.test.ts`。
- 资料与身份管理联调：先构建 Auth Rust/WASM 和 Work，再用 `MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/account-management.test.mjs`；测试使用真实中央服务、临时 Home/D1、Chrome 和外部 mock。
- 相关手册：[中央账号](../../docs/horizontal/account.md)、[边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)。

租户与成员、交接及平台租户管理使用固定中央合同生成的同一动作目录；HTTP 不接收主体身份或任意上游路径。专项联调：`MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/account-tenants.test.mjs`，使用临时 Home/D1 和 Chrome，外部提供方为 mock。

WORK-07 的订阅、席位与平台变更专项联调：构建后以 `MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/account-billing.test.mjs` 运行（按机器 browser 时段包裹）。使用真实 Auth/Host、临时 Home/D1 和 Chrome，外部服务 mock。平台库存只读合同为 Auth 1.1.0，席位写操作仍由租户管理角色授权。

WORK-08：`account.features.list@1` 与 `account.entitlements.check@1` 是中央只读动作；后者虽为 HTTP POST，不要求中央写操作幂等键。权益展示复用 `scripts/account-billing.test.mjs`，不缓存离线授权。

WORK-09：旧 personal 存储、native 凭据与 Cookie 不参与中央会话恢复，拒绝场景在上述 Host 安全测试。联合验收在 Club 检出运行 `MOLIS_AUTH_SOURCE=/absolute/path/to/auth MOLIS_WORK_SOURCE=/absolute/path/to/molis-work node scripts/test-account-cutover.mjs`，须先构建 Auth WASM 与 Work，并按机器 browser 时段执行；它使用真实 Host/Auth、临时 Home/D1 与外部 mock，覆盖换号、退租户、本地事实保留及回退。
