# Host 能力注册与调用

按明确的 capability 身份注册处理器，使 Host 能发现和调用功能而不把业务逻辑塞进分发器。

包名：`@molis-ai/molis-work-kernel`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

CapabilityRegistry.register 绑定定义与 handler，并返回注销函数；descriptors 提供已注册能力；invoke 根据定义找到处理器，将调用上下文和输入传入并返回输出。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | CapabilityRegistry、错误与处理器类型 |

可对照现有调用方 [apps/local-host/src/local-host.ts](../../apps/local-host/src/local-host.ts) 阅读装配方式。

## 接入与边界

Registry 负责身份、重复注册和缺失能力错误。参数的业务校验、用户权限、事务和状态转换由 Host 与实际 handler 负责。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-kernel typecheck
pnpm --filter @molis-ai/molis-work-kernel build
```

已有行为示例与回归：[local-host.test.ts](../../tests/local-host.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/local-host.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/platform/LOCAL-HOST.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/kernel`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-f3`, `goal-reorg-ap2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
