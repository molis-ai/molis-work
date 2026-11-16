# 登录 P1 验收

状态：本地回归完成，GitHub CI 验证中；尚未部署。

本次只实施五项 P1：行为规范、回归、Auth 回调完成、统一能力清单、固定合同 CI。共享 SDK、跨窗口事件通知及单点登录拓展不在本次范围。

## Task list

- [x] 登录行为以 Auth `docs/unified-account/login-p1.md` 为准：成功、取消、超时、重试、迟到回调、退出、切号的安全边界一致，保留各端会话和 Home 归属。
- [x] 密码、邮箱、手机号回归；Google/GitHub 弹窗和桌面浏览器桥接回归；A→B→A、旧 Cookie、旧控制凭据及退出后清理回归。
- [x] Work 保持绑定回调完成、事务 GET 只读；Auth 对齐该语义。
- [x] Auth 能力清单通过受保护 Host 入口读取；客户端身份仅来自 Host 配置。查询失败显示错误，缺失能力隐藏；浏览器覆盖失败及只有密码可用两种情况。
- [x] CI 从 provenance 的固定 SHA 检出 Auth，检查六份合同、版本、摘要、来源和生成类型，并运行真实 Auth WASM + Work 浏览器及 Auth Web 回归；失败、取消、跳过不能通过 Verify。

## 验证依据

`account-authentication.test.mjs`、`account-provider.test.mjs`、`account-installation.test.mjs`、`central-account.test.mjs` 覆盖上述场景。中央跨产品撤销用独立的 Work/Club 中央会话验证；Club BFF 的真实联调在 Club 自身 CI 运行，不把中央会话测试描述为 Club 界面测试。外部提供方均为隔离替身，不是生产 Google/GitHub 验收。

账号客户端、会话、安全边界及 CI 判定定向测试通过；健康门禁通过。完整产品套件在 GitHub 分片运行，最终结果记录于 PR。真实部署不是本次任务。

## 合同与资源评审

新增生成的 `LoginCapabilities` 只读类型，不修改现有插件动作或账户权限。Auth 先发布，Work/Club 后发布；旧 Auth 缺少能力接口时明确失败，不默认为全部可用。固定来源见 `horizontal/account/src/upstream/provenance.json`。

相对 `0dceaca0970bcd9d77e86fcad519841e9d8d2887`，页面 JS 增加 338 B，两份样式各增加 48 B；没有新增资源路径。中英文首屏分别为到达页 +96 B、选择页 +463 B、默认/全部插件工作台 +386 B；再次加载仅选择页 +367 B。按 `docs/cli-and-development.md` 的小额增量规则登记本次精确许可，不修改共享门禁阈值、不复用历史许可，也不声称取得额外用户批准。
