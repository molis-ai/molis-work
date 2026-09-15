# 注意事项与恢复提示

记录需要用户关注的对象、原因、稍后提醒和恢复线索，让 Feed 等入口能表达后续处理状态。

包名：`@molis-ai/molis-work-module-attention-resumption`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

AttentionModule 通过 subject resolver 检查对象；commands 创建或更新注意事项，query 查找当前条目。状态转换由 ATTENTION_STATUS_TRANSITIONS 与校验函数约束，调用方消费处理结果。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | AttentionModule、状态转换与 subject 校验 |

可对照现有调用方 [apps/local-host/src/feed-application.ts](../../apps/local-host/src/feed-application.ts) 阅读装配方式。

## 接入与边界

注意事项不是 OS 通知、调度任务或自动执行指令。本包不启动 Runtime，也不拥有 Feed 条目、Session 或 Goal 内容。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-attention-resumption typecheck
pnpm --filter @molis-ai/molis-work-module-attention-resumption build
```

已有行为示例与回归：[feed-module-repositories.test.ts](../../tests/feed-module-repositories.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-module-repositories.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/modules/attention-resumption.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/attention-resumption`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
