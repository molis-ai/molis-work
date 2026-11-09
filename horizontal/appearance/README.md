# Home 外观

Local Host 为每个 Home 装配一个外观服务。外观的读取、应用和撤销走 `system.appearance` 的三个 Home 动作。服务按 Design System 的资源登记读取内置版本，通过 Plugin SDK 校验并生成有效投影。

## 开发要求

- 负责：Home 的外观选择、提交修订、恢复组合、幂等回执，以及没有页面的工作所读的最近使用语言。
- 不负责：工作台绘制、页面语言、设备主题与密度、网络字体和模型。
- 公开入口：`@molis-ai/molis-work-service-appearance`。动作合同在 `@molis-ai/molis-work-contracts/platform/ui`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-plugin-sdk`、`@molis-ai/molis-work-storage`。
- 不变量：
  - `interface/state.json` 的写入把选择和回执一起提交。每次命令在最终授权检查后同步读取和写入，旧修订不能覆盖新选择。重试按可信 actor 和原请求匹配，已提交的重试不重复通知。
  - `config/ui-locale.json` 只记本人最后使用的语言。入口提供可用语言及默认值，并决定何时更新记录。
- 改动后必跑：`node scripts/run-tests.mjs tests/appearance-owner.test.ts tests/appearance-home-snapshot.test.ts`。
- 相关手册：[第 16 批 B/C 运行接入合同](../../specs/font-and-skin-system/bc-runtime-contract.md)。
