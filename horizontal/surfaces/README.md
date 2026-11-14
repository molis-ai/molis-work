# 确定组合

按插件声明与调用方授权组合项目中的挂载位、对话、讨论、「等你」和本人的首页。项目中的位置可以记住当前用户对形态、移走和固定的选择。需求见[确定组合平台服务](../../specs/surface-composition/spec.md)。

## 开发要求

- 负责：确定组合规则与用户对位置的纠正。
- 不负责：插件对象的值和正文、动作授权、「等你」条目、对象关系与页面绘制。
- 公开入口：`@molis-ai/molis-work-service-surfaces`（`src/index.ts` 经 `dist` 导出），合同 `@molis-ai/molis-work-contracts/services/surface-composition`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。由宿主传入现有项目库连接和调用控制。
- 不变量：
  - 纠正记录只保存对象引用和选择，按项目、调用方及位置隔离；只有当前调用能按位置的最新版本提交。由项目库的建库和升级流程创建纠正表。
  - 一次组合使用同一份动作发现结果和当次登记的授权证明。组合只复核实际读取的路由和最终显示的操作。规则读取每批最多 50 个对象、32 个字段；概况、对象规则取值和受保护首页的显示投影共用四个真实读取槽与三秒截止；已超时、未停下的调用不释放新槽。结果保留对象引用、形态、字段位置和动作引用，首页卡片可带本轮概况与静态说明的文字引用。
  - 首页只消费宿主给当前项目本人的可见目录和路由。开始动作校验实际空输入或绑定的表单，恢复入口保留读到的安装和成员 revision，服务不执行操作。跨概况和对象读取复查原目录与已采用的动作授权。概况可读但对象首次读取失败时，该卡标为读不到，保留本轮成功的概况和可用的独立开始入口。
- 改动后必跑：`node scripts/run-tests.mjs tests/surface-corrections.test.ts tests/surface-composition.test.ts tests/security-invariants-surface-composition.test.ts tests/project-database-baseline.test.ts tests/surface-home-composition.test.ts tests/surface-home-contracts.test.ts`
- 相关手册：[确定组合平台服务](../../specs/surface-composition/spec.md)、[包的开发要求](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
