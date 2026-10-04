# 跨对象关联与上下文读取

保存 Goal、Feed、Artifact、Session 等对象之间的引用边，让上下文关系有统一历史而不复制对象正文。

包名：`@molis-ai/molis-work-module-context-ledger`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createContextLedger(db, { authorize }) 提供边的查询、写入和删除；createContextMaterializer 从选定关系出发，通过注入的 owner Query 读取临时上下文，返回节点和来源边。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | Ledger 与 materializer 工厂 |
| [src/service.ts](src/service.ts) | 授权与关联操作 |
| [src/materialization.ts](src/materialization.ts) | 上下文解析 |
| [src/repository.ts](src/repository.ts) | 关联持久化 |

可对照现有调用方 [apps/local-host/src/session-registry.ts](../../apps/local-host/src/session-registry.ts) 阅读装配方式。

## 接入与边界

精确 Artifact 引用包含版本；历史未知版本保持 null。物化会显式报告 missing/denied/unavailable/stale 或预算截断；循环只访问一次。没有第二份正文缓存，也没有实现未来异步物化或 Publication Receipt 生命周期。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-context-ledger typecheck
pnpm --filter @molis-ai/molis-work-module-context-ledger build
```

已有行为示例与回归：[context-ledger.test.ts](../../tests/context-ledger.test.ts)、[handoff-ledger.test.ts](../../tests/handoff-ledger.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/context-ledger.test.ts tests/handoff-ledger.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

`createContextLedger` 默认准备原 schema；已完成 owner/schema 校验的 Host 可传 `initializeSchema: false`，只装配已有表，避免普通查询触发 DDL。该选项不省略引用或内容权限检查。

- 负责：对象引用、跨 owner 关系、发布与物化记录。
- 不负责：被引用对象（Goal、Artifact、Feed、Session）的内容。
- 公开入口：`@molis-ai/molis-work-module-context-ledger`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/context-ledger`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只存引用边，不复制正文、不跨 Store Join。
  - 存在一条边不等于授予内容权限；物化经目标 owner 的查询，owner 可以拒绝。
  - 新 Artifact 引用必须带精确版本；旧引用指向缺失的 Goal 时保留引用，不制造、不猜测。
- 改动后必跑：`node scripts/run-tests.mjs tests/context-ledger.test.ts tests/context-materialization.test.ts tests/context-owner-isolation.test.ts tests/handoff-ledger.test.ts`
- 相关手册：[docs/modules/context-ledger.md](../../docs/modules/context-ledger.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/context-ledger.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/context-ledger`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ar2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
