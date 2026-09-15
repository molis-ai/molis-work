# Connector Host

**提供：** Provider driver 注册、connection create/test/refresh/revoke、Secret reference 解析、限流/超时、health 和标准化 Connector Receipt。

**技术状态：** connection handle、provider health、rate-limit window、短期 token refresh 状态；Secret 正文只在安全 Adapter 中出现。

**不拥有：** Source desired state、Signal、Feed、Action 或 Provider-specific 业务规则。GitHub/Gmail 等协议实现跟随各自 Integration Plugin。

**调用关系：** Sources 保存用户期望；Listener/Actions 请求连接；Connector Host 调用获准 Driver 并返回 Receipt。

**当前实现与 Goal：** Connector Host 提供通用连接技术能力，Integration Plugin 拥有 Provider/OAuth/scope，Native Feed 组合账号与同步用例；FD1/FD3/Cutover 已退出旧连接目录。

**FD1 当前实现：** `@molis-ai/molis-work-service-connector-host` 提供 Driver 注册、Connection handle、health、超时和标准 Receipt。现有 GitHub/Gmail port 由兼容 caller 注入；Host 源码不导入任何 provider 实现。
