# 信息流用例与原生界面

把来源配置、同步、Signal、Feed 处置和注意事项接成完整的信息处理流程，并提供页面与路由。

包名：`@molis-ai/molis-work-plugin-feed`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

FeedApplication 组合注入的 Module API；FeedSourceService、FeedConnectorSync 和 FeedSourceScheduler 处理来源同步用例。用户将条目推进为 Goal 时，promoteFeedItemToGoal 协调正式命令与来源关联，Host 提供文件、凭据和网络适配。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/application.ts](src/application.ts) | 信息流应用组合 |
| [src/source-service.ts](src/source-service.ts) | 来源操作 |
| [src/connector-sync.ts](src/connector-sync.ts) | Connector 同步 |
| [src/goal-promotion.ts](src/goal-promotion.ts) | Feed 推进为 Goal |
| [src/route-handlers.ts](src/route-handlers.ts) | HTTP 用例适配 |

可对照现有调用方 [apps/local-host/src/feed-application.ts](../../../apps/local-host/src/feed-application.ts) 阅读装配方式。

## 接入与边界

本包不拥有 Source/Signal/Feed 数据表，也不直接实现 GitHub/Gmail 协议。正文渲染在 rich-content 中处理；Provider 失败、部分接收与重试不能混成同一个成功状态。

`research_library` 来源由 Host 注入 `syncRepository`，沿用 Sources 的 `public_source` 同步入口与计划。GitHub integration 验证固定提交上的发布包和哈希，Feed 每条研究发现保存正文、原始引用、阅读范围与包版本。来源规则默认 `admission: "suggest"`；明确选 `inbox` 时，Feed 将匹配内容或需复核的判断结果写入 Attention。`evaluateItems` 可对最近至多 20 条消息重新运行规则；Functions 本身不执行写入。

入箱后的下一步判断走 `inboxJudgment` 注入端口，Host 将它接到统一 `inbox.next` 场景。`subscribeInboxCreated` 连接 Attention 的实际创建事件，覆盖直接携带 attention 的导入及来源故障；去重后在业务提交后的 `flushPendingJudgments` 中执行。已回滚或关闭的事项不触发判断。每个应用实例拥有自己的队列，来源、连接器、定时器和工作流须传入绑定可信调用上下文的 `feedOptions`；仅传 Home 路径不产生 Inbox 调用授权。Feed 筛选和首页建议仍是迁移中的旧 JudgmentPort 消费方。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-feed typecheck
pnpm --filter @molis-ai/molis-work-plugin-feed build
```

已有行为示例与回归：[feed-native-plugin.test.ts](../../../tests/feed-native-plugin.test.ts)、[feed-goal-promotion.test.ts](../../../tests/feed-goal-promotion.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/feed-native-plugin.test.ts tests/feed-goal-promotion.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/feed.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
