# 确定组合

项目中的位置可以记住当前用户对形态、移走和固定的选择。需求见[确定组合平台服务](../../specs/surface-composition/spec.md)。

## 开发要求

- 负责：确定组合规则与用户对位置的纠正。
- 不负责：插件对象的值和正文、动作授权、「等你」条目、对象关系与页面绘制。
- 公开入口：`@molis-ai/molis-work-service-surfaces`（`src/index.ts` 经 `dist` 导出），合同 `@molis-ai/molis-work-contracts/services/surface-composition`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。由宿主传入现有项目库连接和调用控制。
- 不变量：纠正记录只保存对象引用和选择，按项目、调用方及位置隔离；只有当前调用能按位置的最新版本提交。由项目库的建库和升级流程创建纠正表。
- 改动后必跑：`node scripts/run-tests.mjs tests/surface-corrections.test.ts tests/project-database-baseline.test.ts`
- 相关手册：[确定组合平台服务](../../specs/surface-composition/spec.md)、[包的开发要求](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
