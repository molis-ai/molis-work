# 本地应用装配中心

把数据库、业务 Modules、横向服务和 Plugins 接成同一个本地产品。CLI、MCP、Web 要执行真实项目操作时，经这里取得已装配的能力。

包名：`@molis-ai/molis-work-app-local-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createMolisWorkLocalHost 为项目创建运行实例与 Host Client；同一项目复用运行实例，capability 调用进入受控队列。project-host 负责连接生命周期，project-capabilities 绑定各 owner；GoalProjectApplication 组合跨 Module 用例。Web 工厂在入口统一解析显式 Home、MOLIS_WORK_HOME 和默认目录。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/project-host.ts](src/project-host.ts) | 项目运行实例装配 |
| [src/local-host.ts](src/local-host.ts) | Host Client 与调用生命周期 |
| [src/project-capabilities.ts](src/project-capabilities.ts) | 能力绑定 |
| [src/web-server.ts](src/web-server.ts) | Web 请求与 Home 装配 |
| [src/goal-project-application.ts](src/goal-project-application.ts) | 跨 Module 应用组合 |

可对照现有调用方 [apps/desktop/src/web-host.ts](../desktop/src/web-host.ts) 阅读装配方式。

## 接入与边界

本包负责连接、事务装配、文件与 HTTP/进程 IO，不复制 Module 的业务规则。withScope 保持响应组合期间的资源存活，内部 invoke 仍进入正常队列。当前 Host Client 是进程内实现，不代表已有独立守护进程协议。

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

安装/分发也由本包装配：installMolisWorkHome 要求显式 sourceDirectory；RuntimeIntegrationService 和 MolisWorkWebServiceManager 保留检测、计划、确认与恢复流程。Web 自重启先返回 202，再运行 afterResponse，不能在响应发出前停止当前进程。createMolisWorkNpmPackageDirectory 与 createMolisWorkRuntimePayload 分别准备 npm 和 Desktop 资产，不会自动发布。

PluginHostExecutor 提供私人存储、Artifact 和 UI clients；这是受信任的进程内开发执行。应用通过 openWorkSessionRegistry 组合 Work 与 Ledger，关闭 Registry 时释放其拥有的连接。

## SDK 兼容发布面

`sdk/` 保留 0.1.x 的根 SDK 名称与类型别名；它独立于本包 `src/index.ts`，由根 `tsconfig.sdk.json` 编译到 `dist/index.js` 及对应声明。消费者仍使用 `@molis-ai/molis-work`，内部代码继续使用明确的 Module/Host 入口。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-local-host typecheck
pnpm --filter @molis-ai/molis-work-app-local-host build
```

已有行为示例与回归：[local-host.test.ts](../../tests/local-host.test.ts)、[web-home-isolation.test.ts](../../tests/web-home-isolation.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/local-host.test.ts tests/web-home-isolation.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/platform/LOCAL-HOST.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
