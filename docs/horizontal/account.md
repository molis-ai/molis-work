# 中央账号服务

状态：WORK-01 至 WORK-09 已实现并完成所记录的隔离验证，AUTH-12 已汇总跨仓库矩阵和交付记录（2026-11-05）。统一账号的业务合同与实际验收状态由 Auth 仓库 `docs/unified-account/`、`contracts/unified-account/` 持有；Work 使用固定字节快照，不另定义账号、租户、订阅和权益事实。真实存量及外部服务未切换。

## 边界与入口

`horizontal/account` 是 Host 内的中央协议适配器，公开合同为 `packages/contracts/src/services/account.ts`。它只通过固定 operationId 调用已配置的 Auth，严格检查请求、响应和身份绑定。凭据是 opaque Token，不解成 JWT；浏览器、插件和 Agent 均不获得 Token 或密钥引用。中央用户、当前个人／租户 Scope、本地 actor 与 Home 是不同概念，登录不替换本地身份、不搬动内容。

Host 为每个拥有者实例装配一份适配器。挂载 `GET /api/account/session`、`POST /api/account/activity` 和 `POST /api/account/logout`，分别使用产品合同的安全会话视图、显式活动和退出协议；需要本机 Host、控制 Token 与同源 Origin。写请求另经现有一次性写键边界，退出保留中央 Idempotency-Key。GET 未带 Origin 时可使用同源 Referer，显式错误 Origin 不回退。无账号配置时安全返回 ANONYMOUS，不妨碍本地功能；错误配置只影响账号入口。未知账号路径、方法、参数及正文拒绝，不落入项目路由。Host 结束前取消在途账号请求，单独关闭借用该 Host 的 Web 监听器不改变账号。

Web 共用请求助手通过显式 `control: true` 为账号 GET 添加页面拥有的控制 Token，仍拒绝跨来源请求和调用方伪造控制头。其他普通 GET 行为不变。认证协议留在窄入口；资料更新及登录方式读取由唯一 `system.account` 提供方登记为用户动作，固定 HTTP 映射调用同一动作目录。租户和商业管理已复用该动作目录接入；`centralAccountOperationForProduct` 提供同源合同映射，不增设任意代理。

## 环境配置

启动时通过 `MOLIS_WORK_ACCOUNT_CONFIG` JSON 或受信任的 `WebServerOptions.account` 注入，HTTP 输入不能覆盖这些值。以下是配合 Auth 隔离 seed 的本地示例；邮箱/手机表单与 Google/GitHub 回跳均已接入：

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

每个拥有 Home 的 Host 只有一个 `AccountSessionManager`，浏览器与桌面借用同一实例；HTTP 不接受外部提交 Token。认证协调器通过 `accountSessionForHost` 获取受信任端口，使用 `beginLogin` / `completeLogin` 完成经过 Auth 验证的 TokenSet 交付。对象身份与 epoch 绑定原登录尝试；取消、退出或 Host 关闭后，迟到结果不得安装。切换账号先结束当前登录。

会话格式由 `horizontal/account` 管理，Host 用现有 SecretStore 加密、原子替换整个记录。引用绑定 canonical Home、环境、Auth 来源、应用、客户端与产品来源；中央身份不参与本地 actor 或 Home 的切换。没有账号记录时不创建 vault 或触发 Keychain。正常关闭保存会话，重新启动后向 Auth 核验；存储失败不伪装成功。

刷新由 Host 内单飞任务协调；发出请求前先持久写入不含旧 Token 的 REFRESHING 状态。只有原 epoch、仍有效的参与调用可以保存新 Token。进程中断、响应丢失或保存失败后不重用旧 refresh Token；恢复时最多显示资料缓存，须重新登录。普通网络读取失败也只给 OFFLINE_CACHED 的 UserView，不使用缓存授予管理操作或权益。

会话截止时间遵循 Auth 的闲置 30 天与最长 90 天。读取和刷新不记活动；账号弹窗在用户打开且页面可见时调用 activity；后续页面在真实交互时调用 activity，使用事件 id 去重。中央判定 access 已过期时仅允许一次只读刷新恢复，写操作不会自动重放。

退出先取消登录尝试和在途权限、推进 epoch，并持久移除恢复材料，再使用内存快照请求 Auth 撤销。普通退出只影响当前 Host 对应的中央登录；全部退出要求中央撤销两产品所有登录。断网或无法确认撤销时明确返回 UNCONFIRMED，不能表示其他设备已经退出；本机重启仍保持退出。同一幂等键保存无凭据回执。中央撤销在下一次受保护请求重新核验，凭据与撤销证明从不进入浏览器响应或动作目录。

## 账号页面与后续接续

入口页和工作台的账号按钮使用同一弹窗，支持邮箱注册/验证、密码登录、+86 验证码、重发和找回密码。浏览器只调用固定的 `/api/account/auth/transactions` 及其查询/submit/resend/cancel 路由、`/api/account/password/reset`；写请求仍需一次性键、控制头及同源来源。中央 secret 不写浏览器存储。Google/GitHub 使用 Auth mock 授权页和精确 `/account/callback` 回跳，原页面只轮询状态，不接收 Token；桌面复用系统浏览器端口。

WORK-05 提供昵称、PNG 头像上传/移除、登录方式列表、绑定/换绑/解绑和设置或修改密码。敏感操作可选择任一可用登录方式再次验证，新方式还需独立验证。操作证明固定到原登录、目标和期限，仅保留在 Host 内存；取消、退出、重启及到期后不能继续操作。页面使用中央版本与幂等键，冲突不覆盖、身份冲突不合并、最后一种可用方式不能解绑。改密保留当前登录，撤销其他产品和设备的登录。租户与订阅席位页面已由 WORK-06/07 实现；支付、业务共享及真实存量账号迁移尚未实施。

`origin/personal` 的历史实现可参考 PKCE、epoch 和迟到刷新拒绝用例，以及本机能力文件保护；其中旧认证协议、托管确认页、临时会话和空间同步不整批移入。实际部署及存量凭据是否有人使用尚无证据，由 AUTH-11 盘点确认，真实 Home 不读取、不迁移。

验证与验收见 [统一账号规范](../../specs/unified-account/spec.md)，包边界与回归命令见 [account README](../../horizontal/account/README.md)。

WORK-08：`account.features.list@1` 与 `account.entitlements.check@1` 是中央只读动作；后者虽为 HTTP POST，不要求中央写操作幂等键。权益展示复用 `scripts/account-billing.test.mjs`，不缓存离线授权。


WORK-09 复用当前独立会话记录，不读取 `origin/personal` 的旧 SecretStore、native 文件或 Cookie。旧材料保留但不具备认证能力；用户重新登录后按现行会话恢复。合成演练同时验证换号、离线、退出、退租户和中央回退不改变 Home、项目、内容或历史本地 actor。专项拒绝在 `tests/security-invariants-account-host.test.ts`；三仓库联合入口在 Club 的 `scripts/test-account-cutover.mjs`，复现和范围见上述统一账号规范。真实存量仍按 AUTH-11 / D-09 另行审核。


AUTH-12 的完整验收矩阵、版本摘要和管理说明在 Auth 仓库 `docs/unified-account/acceptance-matrix.md`、`delivery.md`、`integration-guide.md`。本轮复验 6 文件、71 项和合同/资源检查通过，同一 Auth 的跨端商业联调也通过。源码尚未提交，基础 Git SHA 不是完整交付版本。矩阵明确保留全部登录方式丢失的帮助动线、共享资源夹具、已知知识处理基线问题和 CI Full/安装包等待办，不把本地通过当作发布验收。
