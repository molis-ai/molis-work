# 风险

把项目的风险记成自己的对象：总览按状态分组，详情里看描述、影响 × 可能性、应对、关联对象与进展，到点由 Schedule 开一轮复查。别的插件引用风险（Goal 的顾虑写 `cited_subjects`，Work Brief 读 `risk.list` 与读取器），不复制它的内容。

包名：`@molis-ai/molis-work-plugin-risk`。工作区内部包，是每个项目 Plugin Runtime 的一个插件（`createRiskPlugin()`，登记上的 `project_runtime`），不在宿主里手写装配。需求见 [specs/risk-plugin/spec.md](../../../specs/risk-plugin/spec.md)，设计见 [implementation.md](../../../specs/risk-plugin/implementation.md)。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/plugin.ts](src/plugin.ts) | `createRiskPlugin()`：项目库、动作目录接到动作处理器上 |
| [src/actions.ts](src/actions.ts) | 动作合同（输入类型由 schema 推出）与处理器 |
| [src/store.ts](src/store.ts) | 三张表的读写；每次写与它的进展行在同一个事务里提交 |
| [src/search.ts](src/search.ts) | 系统搜索来源与对象读取器 `risk.subject.read` |
| [src/presentation.ts](src/presentation.ts) | 呈现声明：状态环、行与卡片的字段、首页概况 |
| [src/methods.ts](src/methods.ts) | 助理方法 `risk-review`，正文在 [methods/](methods/) |

## 开发要求

- 负责：项目里的风险记录、它们的关联对象与进展时间线，以及读取它们的公开来源（列表、读取器、搜索、呈现）。
- 不负责：复查的时间与结果（Schedule 的任务，本插件不存第二份）；被关联对象的内容（各自主人的读取器）；调用模型（本插件不调 AI）。
- 公开入口：`@molis-ai/molis-work-plugin-risk`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只读写自己的三张表（`risk_items`、`risk_links`、`risk_events`）；别的对象经它主人的读取器、以调用者身份读（`actions:delegate`）。
  - 写按读到的 `revision` 提交：不对报 `risk.conflict`（`details.current` 带当前内容），已关闭的风险改字段或关联报 `risk.closed`。
  - 进展只存取值、字段名和人写的原话，不存译好的句子。
  - 失败都是 `ActionError`，码是 `risk.<原因>`（`riskErrors`）。
- 改动后必跑：`node scripts/run-tests.mjs tests/risk-plugin.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-plugin-risk typecheck
pnpm --filter @molis-ai/molis-work-plugin-risk build
```
