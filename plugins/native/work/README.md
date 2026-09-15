# 会话、终端与交接体验

组合 Session、Runtime 和项目上下文，提供会话目录、内容读取、恢复、handoff 和终端操作。

包名：`@molis-ai/molis-work-plugin-work`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

SessionDirectoryService 处理发现/创建，SessionContentService 处理内容与恢复，SessionHandoffService 准备并交付交接包。HTTP/UI 接收 Host 注入的 Project、Session、Panel 和 Runtime API；浏览器 terminal-client 负责 xterm 与连接控制。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/directory.ts](src/directory.ts) | 会话发现和创建 |
| [src/content.ts](src/content.ts) | 内容与恢复 |
| [src/handoff.ts](src/handoff.ts) | 交接用例 |
| [src/http/index.ts](src/http/index.ts) | 会话 HTTP 路由 |
| [src/ui](src/ui) | 会话与终端界面 |

可对照现有调用方 [apps/local-host/src/web-work-session.ts](../../../apps/local-host/src/web-work-session.ts) 阅读装配方式。

## 接入与边界

Session 事实归 Private Work Context，跨对象关联归 Ledger，进程归 Runtime Host。交接包保持私人内容，不自动发布 Artifact/Team 数据。发送失败、重试和取消保留对应状态，不能把准备完成视为发送成功。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-work typecheck
pnpm --filter @molis-ai/molis-work-plugin-work build
```

已有行为示例与回归：[session-handoff.test.ts](../../../tests/session-handoff.test.ts)、[session-directory.test.ts](../../../tests/session-directory.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/session-handoff.test.ts tests/session-directory.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/private-work-context.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-wk3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
