# 交付物身份与版本

保存 Artifact 身份、版本、内容引用、隐私范围及生产者信息，让交付物能被精确引用和读取。

包名：`@molis-ai/molis-work-module-artifacts`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ArtifactsModule 通过 query/commands 发布和读取；身份与版本分开记录，引用使用 artifact_id + version。内容服务保存规范化的 opaque JSON 或经存储端口验证的外部内容引用。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | ArtifactsModule |
| [src/service.ts](src/service.ts) | 身份与版本写入规则 |
| [src/content.ts](src/content.ts) | opaque 内容处理 |
| [src/repository.ts](src/repository.ts) | 记录与查询 |

可对照现有调用方 [apps/local-host/src/goal-project-application.ts](../../apps/local-host/src/goal-project-application.ts) 阅读装配方式。

## 接入与边界

平台不解释 Plugin 自定义 payload，也不凭旧字符串虚构 Artifact。个人范围是默认路径，Team 共享需要授权；缺少兼容消费者时仍可作为 opaque 数据读取。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-artifacts typecheck
pnpm --filter @molis-ai/molis-work-module-artifacts build
```

已有行为示例与回归：[artifacts-module.test.ts](../../tests/artifacts-module.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/artifacts-module.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/modules/artifacts.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/artifacts`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ar1`, `goal-reorg-ar3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
