# 本人设置

插件里「跟着人走、不跟分区走」的设置：生图用哪家服务、模型选择、外观偏好等。按（安装, 键）存在 Home，只给本机本人和这个插件自己的后台工作；插件声明为可跨设备的偏好随本人的个人配置同步到本人的其他设备。

## 开发要求

- 负责：保存 `person-settings/person-settings.db` 中各安装声明过的本人设置，提供读、写（带修订号防覆盖）、删与卸载清理；把 `portable` 的偏好交给个人配置同步（复用 `#2231` 的 `personalConfigReplica` 与 `assertPortableConfig`，不另造同步）。
- 不负责：插件的业务数据（留在各分区）；密钥本身（只存 `secret_ref` 引用，正文在 `SecretStore`）；连接器令牌（归 `horizontal/connector-host`）。
- 公开入口：`@molis-ai/molis-work-service-person-settings` 的 `openPersonSettings`、`PersonSettingsStore`、`assertPersonSettingsCaller`、`personSettingsConfigReplica`、`PERSON_SETTINGS_HOME_STORE`。
- 依赖：`@molis-ai/molis-work-contracts` 提供 Manifest 声明（`person_settings`）与记录类型，`@molis-ai/molis-work-storage` 管理库与个人配置同步。
- 不变量：
  - 下列各条合称 `S-person-settings-private`。
  - 只有本机本人（页面或管理命令，不是代本人运行的 Agent、也不是委托调用）和这个安装自己的后台能读写；项目 Agent、个人助理、MCP、工作流和别的插件一律拒，不论被授予了什么。
  - 只有 `preference` 能标 `portable`：表上有约束，SDK 在安装时拒绝，同步收到的键也要是本机安装声明为 `portable` 的键；密钥引用、连接引用、本机路径永不出本机。
  - 可同步的值写入前按同步的规则检查（`assertPortableConfig`），所以路径与密钥样的值在本机就被拒。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/security-invariants-person-settings.test.ts`。
- 相关手册：[统一工作分区 §4.2 第 4 条、§5.1](../../specs/unified-partition-plugins/spec.md)、[安全不变量](../../docs/system/SECURITY-INVARIANTS.md)。
