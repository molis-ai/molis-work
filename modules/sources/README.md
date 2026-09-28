# 信息来源配置

保存用户选择的来源、监听意图、启停状态和 Provider 绑定引用，给同步流程提供稳定的配置入口。

包名：`@molis-ai/molis-work-module-sources`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

SourcesModule.query 查询项目来源，commands.save/setEnabled/retire 等操作更新来源事实。Native Feed 按这些配置发起同步，Listener Host 记录实际运行进度。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | SourcesModule、迁移与来源命令/查询 |

可对照现有调用方 [apps/local-host/src/feed-application.ts](../../apps/local-host/src/feed-application.ts) 阅读装配方式。

## 接入与边界

来源希望何时运行与实际游标/租约是不同事实：前者在此，后者归 Listener。凭据内容不进入 Source 记录；这里只保留相关引用。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-sources typecheck
pnpm --filter @molis-ai/molis-work-module-sources build
```

已有行为示例与回归：[feed-module-repositories.test.ts](../../tests/feed-module-repositories.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-module-repositories.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：来源身份、期望的监听状态、范围、计划意图与 Provider 绑定引用。
- 不负责：凭据、监听游标、Signal、Feed 处置、Goal。
- 公开入口：`@molis-ai/molis-work-module-sources`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/sources`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 凭据正文不进 Source 记录，只存引用。
  - 只表达“想怎样听”；游标与租约归 `horizontal/listener-host`。
- 改动后必跑：`node scripts/run-tests.mjs tests/feed-receive-chain.test.ts tests/feed-sources.test.ts tests/feed.test.ts`
- 相关手册：[docs/modules/sources.md](../../docs/modules/sources.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/sources.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/sources`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd1`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
