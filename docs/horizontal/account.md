# 中央账号服务

状态：安装登录与 Home 已统一 V2；首轮完整回归结果见 [统一账号回归记录](../../specs/unified-account/v2-regression-20261109.md)。2026-11-09 追加删除无消费者的 V1 服务凭据合同，修改后完整回归已执行 1,879 文件，复验后 1,874 通过、5 个已知基线失败保留，详见同一回归记录；历史 WORK-01 至 WORK-09 验证不代表本轮已经完成。统一账号的业务合同与实际验收状态由 Auth 仓库 `docs/unified-account/`、`contracts/unified-account/` 持有；Work 使用固定字节快照，不另定义账号、租户、订阅和权益事实。未上线，本轮不实现旧体系兼容，不操作真实存量或外部服务。

## 边界与入口

`horizontal/account` 是 Host 内的中央协议适配器，公开合同为 `packages/contracts/src/services/account.ts`。它只通过固定 operationId 调用已配置的 Auth，严格检查请求、响应和身份绑定。凭据是 opaque Token，不解成 JWT；浏览器、插件和 Agent 均不获得 Token 或密钥引用。中央用户、当前个人／租户 Scope、本地 actor 与 Home 是不同概念，登录不替换本地身份、不搬动内容。

Host 为每个拥有者实例装配一份适配器。挂载 `GET /api/account/session`、`POST /api/account/activity` 和 `POST /api/account/logout`，分别使用产品合同的安全会话视图、显式活动和退出协议；需要本机 Host、控制 Token 与同源 Origin。写请求另经现有一次性写键边界，退出保留中央 Idempotency-Key。GET 未带 Origin 时可使用同源 Referer，显式错误 Origin 不回退。无账号配置时安全返回 ANONYMOUS，不妨碍本地功能；错误配置只影响账号入口。未知账号路径、方法、参数及正文拒绝，不落入项目路由。Host 结束前取消在途账号请求，单独关闭借用该 Host 的 Web 监听器不改变账号。

Web 共用请求助手通过显式 `control: true` 为账号 GET 添加页面拥有的控制 Token，仍拒绝跨来源请求和调用方伪造控制头。其他普通 GET 行为不变。认证协议留在窄入口；资料更新及登录方式读取由唯一 `system.account` 提供方登记为用户动作，固定 HTTP 映射调用同一动作目录。租户和商业管理已复用该动作目录接入；`centralAccountOperationForProduct` 提供同源合同映射，不增设任意代理。

## 环境配置

启动时通过 `MOLIS_WORK_ACCOUNT_CONFIG` JSON 或受信任的 `WebServerOptions.account` 注入，HTTP 输入不能覆盖这些值。以下是本地配置形状示例，使用前须在 Auth 登记匹配的应用、客户端、环境和精确回调；Auth 自身的默认 Web seed 不会自动创建 Work 客户端。邮箱/手机表单与 Google/GitHub 回跳均已接入：

```json
{
  "environmentId": "unified-local",
  "environmentKind": "LOCAL",
  "authOrigin": "http://127.0.0.1:8787",
  "productOrigin": "http://127.0.0.1:4207",
  "applicationId": "molis-work-unified-local-app",
  "clientId": "molis-work-unified-local",
  "policyProfile": "unified-account-v2",
  "redirectAllowlist": ["http://127.0.0.1:4207/account/callback"],
  "providerMode": "MOCK",
  "deliveryMode": "MOCK"
}
```

本地地址必须为数字回环地址；Work 产品仍使用本机 HTTP，隔离测试／正式环境的 Auth 使用 HTTPS；正式环境拒绝 MOCK。回调是精确登记，不支持通配、查询或片段。没有配置时不猜测客户端或读取其他产品凭据。

## 持久会话与撤销

安装级 `PersonalAuth` 持有当前 `AccountSessionManager`，选中的 Home 仅借用该实例并检查原账号租约；浏览器与桌面使用同一中央登录，HTTP 不接受外部提交 Token。新登录在独立内存候选中通过 `beginLogin` / `completeLogin` 验证，成功接手后才撤销原登录并交接 Home；失败或取消保留原账号。普通浏览器只允许附着当前同一用户，不能借登录切换安装账号。独立创建的单 Home Host 仍可自己拥有会话。对象身份与 epoch 绑定原尝试，退出、取消、换出或关闭后的迟到结果不得安装。

会话格式由 `horizontal/account` 管理，Host 用现有 SecretStore 加密、原子替换整个记录。安装记录按受信环境配置隔离，Home 借用时固定当前身份及租约；独立 Home 自有记录另绑定 canonical Home。中央身份不改写本地 actor 或插件内容。没有账号记录时不创建 vault 或触发 Keychain。正常关闭保存会话，重新启动后向 Auth 核验；存储失败不伪装成功。

刷新由 Host 内单飞任务协调；发出请求前先持久写入不含旧 Token 的 REFRESHING 状态。只有原 epoch、仍有效的参与调用可以保存新 Token。进程中断、响应丢失或保存失败后不重用旧 refresh Token；恢复时最多显示资料缓存，须重新登录。普通网络读取失败也只给 OFFLINE_CACHED 的 UserView，不使用缓存授予管理操作或权益。

会话截止时间遵循 Auth 的闲置 30 天与最长 90 天。读取和刷新不记活动；账号弹窗在用户打开且页面可见时调用 activity；后续页面在真实交互时调用 activity，使用事件 id 去重。中央判定 access 已过期时仅允许一次只读刷新恢复，写操作不会自动重放。

退出先取消登录尝试和在途权限、推进 epoch，并持久移除恢复材料，再使用内存快照请求 Auth 撤销。普通退出只影响当前 Host 对应的中央登录；全部退出要求中央撤销两产品所有登录。断网或无法确认撤销时明确返回 UNCONFIRMED，不能表示其他设备已经退出；本机重启仍保持退出。同一幂等键保存无凭据回执。中央撤销在下一次受保护请求重新核验，凭据与撤销证明从不进入浏览器响应或动作目录。

## 账号页面与后续接续

入口页和工作台的账号按钮使用同一弹窗，支持邮箱注册/验证、密码登录、+86 验证码、重发和找回密码。浏览器只调用固定的 `/api/account/auth/transactions` 及其查询/submit/resend/cancel 路由、`/api/account/password/reset`；写请求仍需一次性键、控制头及同源来源。中央 secret 不写浏览器存储。Google/GitHub 使用 Auth mock 授权页和精确 `/account/callback` 回跳，原页面只轮询状态，不接收 Token；桌面复用系统浏览器端口。

WORK-05 提供昵称、PNG 头像上传/移除、登录方式列表、绑定/换绑/解绑和设置或修改密码。敏感操作可选择任一可用登录方式再次验证，新方式还需独立验证。操作证明固定到原登录、目标和期限，仅保留在 Host 内存；取消、退出、重启及到期后不能继续操作。页面使用中央版本与幂等键，冲突不覆盖、身份冲突不合并、最后一种可用方式不能解绑。改密保留当前登录，撤销其他产品和设备的登录。租户与订阅席位页面已由 WORK-06/07 实现，自助创建受中央策略控制，不赠送付费权益；支付和业务共享不在本次范围。

旧认证协议、托管确认页、凭据与 Cookie 不读取、不转换。本次没有旧密码、身份映射或双栈回退要求，也不操作真实 Home。

验证与验收见 [统一账号规范](../../specs/unified-account/spec.md)，包边界与回归命令见 [account README](../../horizontal/account/README.md)。

WORK-08：`account.features.list@1` 与 `account.entitlements.check@1` 是中央只读动作；后者虽为 HTTP POST，不要求中央写操作幂等键。权益展示复用 `scripts/account-billing.test.mjs`，不缓存离线授权。


安装联合验收入口是 `scripts/account-installation.test.mjs`，使用真实 Auth/Host、合成数据与临时 Home/D1，验证 A/B/A、原生附着、旧 Cookie 拒绝、同一 V2 会话与重启后数据归属。安全拒绝另见 `tests/security-invariants-account-host.test.ts`。Club 不在本次两个仓库的检出和验证范围。


Auth 的现行管理说明及本轮记录在 `docs/unified-account/integration-guide.md`、`v2-consolidation.md`。AUTH-12 的矩阵和摘要只作历史交付证据；本轮准确基线、专项与全量结果由上述规范中的 V2U 章节记录，不沿用旧候选的通过结论。


2026-11-08 统一：Personal 安装入口拥有同一 V2 会话；Home 借用会话并固定原租约。候选登录验证、浏览器附着、页面准备及原生票据边界见 [统一账号规范](../../specs/unified-account/spec.md) 的 V2U 章节。旧 WORK-09 双栈切换材料只保留为历史，当前不做 D-09/存量回退。
