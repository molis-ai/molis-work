# 工作区边界检查工具

帮助维护者发现深层导入、跨 owner 实现依赖和依赖环，保护重组后的模块边界。

包名：`@molis-ai/molis-work-test-kit`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

脚本收集源码 import 与包清单，交给 evaluateImportBoundary；extractImportSpecifiers 提取导入，findDependencyCycles 查找依赖环。仓库级扫描入口是 scripts/check-package-boundaries.mjs。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/boundaries.ts](src/boundaries.ts) | 导入边界与依赖环规则（含层与层之间的方向：Module 不向上依赖 Horizontal、Plugin、App；Plugin 不依赖 App、Horizontal、Module 实现包（合同包不算）；App 之间只有登记的边；例外名单按包路径记，只许减少，`unusedLayerExceptions` 找出仓库里已经没有的边） |
| [src/index.ts](src/index.ts) | 公开检查 API |
| [tests](tests) | 规则回归 |

可对照现有调用方 [scripts/check-package-boundaries.mjs](../../scripts/check-package-boundaries.mjs) 阅读装配方式。

## 接入与边界

本包提供与业务无关的检查规则，不替代模块测试、浏览器验收或数据迁移验证。新增边界规则应同时提供允许/拒绝案例，避免仅检查固定文件数量。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-test-kit typecheck
pnpm --filter @molis-ai/molis-work-test-kit build
```

```bash
pnpm boundary:check
pnpm boundary:test
```

边界检查会扫描实际工作区源码；规则测试覆盖允许导入、拒绝导入和循环依赖。

## 开发要求

- 负责：确定性时钟、假能力、临时存储、合同检查与导入边界规则。
- 不负责：属于某个 Module 的业务夹具、规则或断言。
- 公开入口：`@molis-ai/molis-work-test-kit`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/testing`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 规则与业务无关，不替代模块测试、浏览器验收或迁移验证。
  - 新增边界规则同时提供允许与拒绝案例，不靠检查固定文件数量。
  - 本包自己的测试用 `pnpm --filter @molis-ai/molis-work-test-kit test`。
- 改动后必跑：`node scripts/run-tests.mjs tests/import-boundary-template.test.ts tests/workbench-registration-boundaries.test.mjs tests/health-gates-structure.test.ts`（例外名单的条目另由健康门禁对照 merge-base 只许减少）
- 相关手册：[docs/platform/CONTRACTS-AND-OPERATIONS.md](../../docs/platform/CONTRACTS-AND-OPERATIONS.md)、[docs/system/PACKAGE-BOUNDARIES.md](../../docs/system/PACKAGE-BOUNDARIES.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/system/PACKAGE-BOUNDARIES.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/testing`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-f3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
