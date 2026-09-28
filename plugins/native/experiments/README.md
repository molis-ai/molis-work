# 实验插件

Status: `partial`

Contract: `@molis-ai/molis-work-contracts/platform/plugin`

同材料多组离线 Choice 对照。原生插件，由宿主构建期装配；独立于 Functions 产品，不是运行时隔离安装的 App 插件。实验服务只接收宿主提供的私有存储和执行端口。

先定义任务或引用函数配置，再保存材料/参考答案/参试模型快照。执行不会发送参考答案，运行结束后逐条复核，原始快照不变。

宿主插件边界承接：goal-reorg-f2。

创建页提供证据判断和内容筛选模板、批量粘贴、可选参考答案。结果页提供答案分布、材料×模型矩阵、联动筛选、真实概率条与就地复核。

操作说明、设计来源与验证边界见 `docs/experiments/可视化实验工作台.md`。

## 开发要求

- 负责：同一材料多组模型的离线对照实验。
- 不负责：凭据、模型执行、其他插件的实现。
- 公开入口：`@molis-ai/molis-work-plugin-experiments`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 独立于 Functions 产品，只接收宿主提供的私有存储与执行端口。
  - 执行不发送参考答案，结束后逐条复核，原始快照不变。
  - `experiments.run` 立即返回、在后台运行，因此可以留在串行队列（见调度门禁的名单）。
- 改动后必跑：`node scripts/run-tests.mjs tests/experiments-actions.test.ts tests/experiments-plugin.test.ts tests/experiments-http.test.ts`
- 相关手册：[docs/experiments/可视化实验工作台.md](../../../docs/experiments/%E5%8F%AF%E8%A7%86%E5%8C%96%E5%AE%9E%E9%AA%8C%E5%B7%A5%E4%BD%9C%E5%8F%B0.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
