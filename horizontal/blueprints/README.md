# 场景采用

保存场景草稿，预览每项设置的影响，按本人选中的范围写入各设置主人。重新打开后可继续，也可撤销仍由这次采用持有的更改。

## 开发要求

- 负责：保存 `blueprints/blueprints.db` 中的草稿、采用记录和逐项进度，协调预览、继续和撤销。
- 不负责：项目与插件保管自己的设置，安装、授权和外部发布各走原入口。
- 公开入口：`@molis-ai/molis-work-service-blueprints` 的 `blueprintProvider`、`BLUEPRINTS_HOME_STORE` 和项目清理使用的 `AdoptionStore`。
- 依赖：`@molis-ai/molis-work-contracts` 提供动作与设置合同，`@molis-ai/molis-work-plugin-sdk` 校验场景与设置，`@molis-ai/molis-work-storage` 管理场景库。
- 不变量：
  - 嵌套动作沿用调用者的身份、项目及授权。等待主人返回后重新检查授权，再提交对应步骤的进度。
  - 同一采用只按第一次确认的范围继续。核对写入用原请求编号与原始请求。撤销先核对主人写入时返回的版本。待核对项遇原安装停用或换代，保留原请求，其他有回执的项可先恢复。
  - 第二个场景已复用同一层的设置时，撤销第一个会保留那个值。只复用过的场景在移除时只解除自己的关联。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/blueprint-adoption-service.test.ts tests/blueprint-adoption-contract.test.ts`。
- 相关手册：[场景合同](../../specs/scene-and-page-contract/spec.md#7-保存与恢复)、[插件配置采用](../../specs/onboarding-coverage/spec.md#13-第-38-批--插件配置采用)。
