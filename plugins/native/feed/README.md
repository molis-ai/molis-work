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

入箱后的下一步判断走 `inboxJudgment` 注入端口，Host 将它接到统一 `inbox.next` 场景。`subscribeInboxCreated` 连接 Attention 的实际创建事件，覆盖直接携带 attention 的导入及来源故障；去重后在业务提交后的 `flushPendingJudgments` 中执行。已回滚或关闭的事项不触发判断。每个应用实例拥有自己的队列，来源、连接器、定时器和工作流须传入绑定可信调用上下文的 `feedOptions`；仅传 Home 路径不产生 Inbox 调用授权。首页建议通过 homeJudgment 接到共同 Home 场景。Feed 筛选通过 captureJudgment 接到本插件声明的 feed.capture 场景；手动处理和工作流向后续判断传递原调用者。捕捉结果由常驻实例入箱时，该实例立即消费新 Inbox 事件，避免把事件留在另一实例的队列。

捕捉规则的目录、创建、修改、删除和关键词预览由本插件的 `feed.rules.*` 能力提供，定义及处理器位于 [src/rule-actions.ts](src/rule-actions.ts)。Host 只提供原 FeedApplication、项目范围和原文读取；HTTP 将旧字段转换后调用同一能力，MCP 按具体动作与项目授权。读规则和预览需要 `feed:read`，修改配置另需 `feed:write`；输入不能指定其他项目。指定来源必须属于当前项目，已有失效来源引用在修改其他字段时仍保留。

关键词预览读取该来源最近五条原消息，不调用模型、不保存规则、不产生捕捉成果或 Inbox 条目。`feed.rules.judgments` 从共同目录返回带版本、提供方和可用状态的判断能力；`preview-judgment` 对原消息调用所选兼容能力，不保存捕捉结果或入箱；`evaluate` 才应用原规则并实际消费结果。界面不维护另一份 Functions 下拉名单，插件判断也使用相同预览、保存和运行路径。

规则与精确判断引用保存在原 `feed_out_rules`，每次编辑更新 revision，异步验证后以 revision 比较保存。Host 首次接通场景时，将旧函数键解析成精确引用；项目提交后清理对应旧全局绑定，历史不删。未能恢复的旧键保留为失效配置，不能自动变为关键词入箱规则。未知或停用能力可保留并编辑其他字段；重新启用须通过当前共同兼容检查。

`feed.capture` 自己实现 prepare/consume/failed：用原消息准备内容，结果落地前复核规则 revision、消息内容、提供方和授权。只有 admission=inbox 时，inbox.admit 或 needs_review 才进入 Inbox。原判断历史增加绑定和消息版本依据，`feed.rules.recommendations` 只返回当前仍有效的建议；停用、改绑、内容变化或撤权后撤下建议，历史保留。系统“已用在哪”链接可直接打开来源内的具体捕捉规则。

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

首页通过 `feed.home.events` 读取 Feed 的原事项与来源状态。已进入 Inbox 的材料或来源故障由 Inbox 提供，完成或忽略后不会作为原始 Feed 事项重复出现。普通材料按请求窗口筛选；需要处理的来源放到今天，并提供“查看来源”的分组导航。断连和同步异常分别说明，不把任意错误称为需要重新授权。关联 Goal 名称通过共同对象查询读取；无权读取 Goal 时保留 Feed 自己拥有的关联 ID。首页不再持有 Feed 分类或数据拼装分支。
