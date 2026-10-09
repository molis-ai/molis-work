# 私人会话与工作上下文

保存 Session 身份、私人内容引用、恢复/handoff 状态及 Runtime 项目绑定语义，使会话能在正确项目中继续。

包名：`@molis-ai/molis-work-module-private-work-context`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

应用通常通过 Local Host 的 openWorkSessionRegistry 打开 Registry。直接装配 MolisWorkSessionRegistry.open 时必须提供 createLedger，并复用事务连接；跨模块关联交给 Ledger，私人内容仍由本模块维护。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/session-registry.ts](src/session-registry.ts) | Registry 与资源生命周期 |
| [src/content-store.ts](src/content-store.ts) | 加密内容引用 |
| [src/session-surfaces.ts](src/session-surfaces.ts) | 终端面板与 Runtime 绑定写入时记下的会话 |
| [src/project-binding-commands.ts](src/project-binding-commands.ts) | 项目绑定命令 |

可对照现有调用方 [apps/local-host/src/session-registry.ts](../../apps/local-host/src/session-registry.ts) 阅读装配方式。

## 接入与边界

私人的恢复包不会自动发布为 Artifact 或 Team 内容。历史未知 Project/Goal revision 保持未知。环境变量解析和 Runtime 进程启动由 Host 完成。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-private-work-context typecheck
pnpm --filter @molis-ai/molis-work-module-private-work-context build
```

已有行为示例与回归：[private-work-context-module.test.ts](../../tests/private-work-context-module.test.ts)、[session-associations-atomic.test.ts](../../tests/session-associations-atomic.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/private-work-context-module.test.ts tests/session-associations-atomic.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：私人 Session、内容引用、工作目录关联、恢复与交接事实。
- 不负责：执行 Run、Goal、Artifact、Runtime 进程句柄。
- 公开入口：`@molis-ai/molis-work-module-private-work-context`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/private-work-context`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 默认只在本机；私人恢复包不自动发布为 Artifact 或 Team 内容，共享必须由用户显式发布。
  - 关系事实只存在 Context Ledger，不另建关系表；打开时必须提供 `createLedger` 并复用事务连接。
  - 终端面板与 Runtime 绑定在写入时记下会话（读取时不再搬运）；面板的绑定与面板共用一个会话。
  - 项目被删除时，Home 里属于这个项目的 Session 记录由本模块自己清：`sessionsProjectData` 是它的声明（标签与 `purgeSessionsProject`，宿主与 Functions 的声明一起列出）。Session 靠 Ledger 边 `work.project` 属于项目，由 Ledger 的查询找出；清除一次事务里经 Ledger 取消这些 Session 与交接包的关联边（Ledger 只追加，已取消的边留在历史里，只有 id、没有内容），删这些 Session 的事件、交接、消息请求，再删没有别的行引用的内容块；本模块不对 Ledger 的表写 SQL；只读已存在的库文件，不创建，版本不符照常拒绝，重复运行没有副作用。别的项目的 Session 和移到别处的 Session 不动。
- 改动后必跑：`node scripts/run-tests.mjs tests/private-work-context-module.test.ts tests/session-handoff.test.ts tests/session-directory.test.ts tests/session-content-privacy.test.ts tests/project-deletion-owners.test.ts`
- 相关手册：[docs/modules/private-work-context.md](../../docs/modules/private-work-context.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/private-work-context.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/private-work-context`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-wk1`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
