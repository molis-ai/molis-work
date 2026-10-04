# 历史依据与文件引用

读取历史 Evidence、原始更正及 Review 关联，并提供项目文件引用的读取与路径边界校验。

包名：`@molis-ai/molis-work-module-evidence-verification`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 通过 `EvidenceVerificationModule.query` 查询原始依据及更正，历史正文按原 ID 展示。Artifacts 与 Web 文件读取复用引用工具；纯查询可用 `createEvidenceQueryApi`。当前工作结果由 Goals 的事件上报入口保存。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Module 查询与文件工具公开入口 |
| [src/repository.ts](src/repository.ts) | 历史依据、更正和关联查询 |
| [src/verification.ts](src/verification.ts) | 历史查询服务与项目引用来源 |
| [src/locator.ts](src/locator.ts) | 引用预检、项目文件读取与路径边界 |

可对照现有调用方 [apps/local-host/src/goal-project-application.ts](../../apps/local-host/src/goal-project-application.ts) 阅读装配方式。

## 接入与边界

原始依据、更正、Artifact 正文和 Review 结论各自保留。旧提交、纠正和覆盖门禁写服务已退役；当前要求是否满足由 Goals 事件事实及可信用户决定判断。历史读取不得改写原依据或把旧自验证标成用户验收。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-evidence-verification typecheck
pnpm --filter @molis-ai/molis-work-module-evidence-verification build
```

历史正文、原提交事件与文件引用行为可参考 [evidence-verification-module.test.ts](../../tests/evidence-verification-module.test.ts)、[goal-event-document-history.test.ts](../../tests/goal-event-document-history.test.ts)、[artifact-clipboard.e2e.test.ts](../../tests/artifact-clipboard.e2e.test.ts)。完成仓库构建后运行；浏览器用例需要测试环境中的浏览器：

```bash
node --import tsx --test --test-concurrency=1 tests/evidence-verification-module.test.ts tests/goal-event-document-history.test.ts tests/artifact-clipboard.e2e.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：旧 Evidence、不可变更正、验收覆盖与项目文件引用的读取。
- 不负责：Artifact 正文、Goal 约定、Run、Review 结论。
- 公开入口：`@molis-ai/molis-work-module-evidence-verification`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/evidence-verification`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 历史读取不改写原依据，不把旧自验证标成用户验收。
  - 可读文件不等于当前要求已经通过；文件引用读取校验路径边界。
  - 不再经旧 Action Projection 决定 Goal 是否完成。
- 改动后必跑：`node scripts/run-tests.mjs tests/evidence-verification-module.test.ts tests/artifact-project-reference.test.ts tests/v1.test.ts`
- 相关手册：[docs/modules/evidence-verification.md](../../docs/modules/evidence-verification.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/evidence-verification.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/evidence-verification`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ex2`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
