# Plugin 安装与生命周期

管理 Plugin 定义、安装身份、权限授予、启动、崩溃恢复和卸载，让 Host 能追踪一次安装的状态与访问权。

包名：`@molis-ai/molis-work-plugin-runtime`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

PluginRuntime 使用注入的 repository 和 executor；启动或恢复产生新的 grant context，失败和卸载撤销旧 context。SQLite repository 保存安装事实，private storage 按安装 ID 隔离 opaque string 数据。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | PluginRuntime 与 executor/repository 端口 |
| [src/repository.ts](src/repository.ts) | 安装状态持久化 |
| [src/private-storage.ts](src/private-storage.ts) | 按安装隔离的数据 |
| [src/package-verification.ts](src/package-verification.ts) | 包和签名验证 |

可对照现有调用方 [apps/local-host/src/plugin-development.ts](../../apps/local-host/src/plugin-development.ts) 阅读装配方式。

## 接入与边界

这是受信任的进程内执行，不是 OS sandbox。包签名验证认证 bytes 与受信公钥，不代表官方审核。普通卸载保留私人数据；成功执行不保留数据的卸载后，Host 还须调用 deleteInstallationData，不能顺手删除交换出的 Artifacts。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-runtime typecheck
pnpm --filter @molis-ai/molis-work-plugin-runtime build
```

已有行为示例与回归：[plugin-runtime-integration.test.ts](../../tests/plugin-runtime-integration.test.ts)、[plugin-private-storage.test.ts](../../tests/plugin-private-storage.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/plugin-runtime-integration.test.ts tests/plugin-private-storage.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`, `goal-reorg-dv3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
