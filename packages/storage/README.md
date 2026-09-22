# 本地存储基础设施

为各 owner 提供 SQLite 连接、共享日志、幂等记录、原子文件写入和本地安全存储适配，避免每个模块各建一套底层机制。

包名：`@molis-ai/molis-work-storage`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

LocalSqliteStorage 打开连接并配置 WAL、FULL synchronous、外键和 busy timeout；LocalSqliteJournal 借用连接处理日志/幂等。Host 负责模块 schema 的迁移顺序。runWithMolisWorkHome 将文件适配限定到当前 Home。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/sqlite.ts](src/sqlite.ts) | 连接、事务、事件日志和幂等 |
| [src/schema.ts](src/schema.ts) | schema 辅助与 opaque blob |
| [src/adapters/local-security-paths.ts](src/adapters/local-security-paths.ts) | Home 作用域 |
| [src/adapters/file-secret-store.ts](src/adapters/file-secret-store.ts) | 本地凭据适配 |

可对照现有调用方 [apps/local-host/src/project-database.ts](../../apps/local-host/src/project-database.ts) 阅读装配方式。

## 接入与边界

借用连接的 Journal 不负责关闭连接；连接拥有者负责释放。Secret/body 存储跟随创建时的 Home，不能靠切换全局变量混用用户目录。这里没有实现 Outbox 或 Exchange。

已有钥匙串加密凭据的主密钥读取失败（拒绝、取消、超时或无效返回）后，同一进程、Home 和凭据配置停止自动重试，避免页面刷新或状态轮询反复触发授权。错误为 `KeychainUnavailableError`；恢复本机钥匙串访问后重启应用或对应 MCP 连接再试。此失败只保留在进程内，不改现有密文、密钥、后端或钥匙串权限，不自动降级文件存储。不同进程的首次读取仍分别发生；这不是跨进程授权合并机制。

只在部分操作需要凭据的服务使用 `createLazyFileSecretStore(homeDirectory)`：创建时固定 Home，调用时才沿用原凭据库与锁；只读取尚未保存的凭据引用时直接返回空值，不初始化后端。Functions 的 Host、HTTP、MCP 和设置装配使用此入口，因此本地列表、说明、草稿与场景查询不因服务初始化而请求钥匙串。已有凭据的读取、写入、迁移与后端诊断仍走原保护；配置了环境凭据的 Functions 也不提前打开无关的本地凭据库。这里不承诺消除所有钥匙串提示，模型健康检查和实际需要本地密钥的调用仍可能读取钥匙串。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-storage typecheck
pnpm --filter @molis-ai/molis-work-storage build
```

已有行为示例与回归：[feed-security.test.ts](../../tests/feed-security.test.ts)、[web-home-isolation.test.ts](../../tests/web-home-isolation.test.ts)。完成上述构建后运行：

```bash
pnpm test:run tests/feed-security.test.ts tests/web-home-isolation.test.ts tests/secret-store-keychain-retry.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/storage`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
