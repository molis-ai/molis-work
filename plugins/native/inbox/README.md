# Inbox 注意力入口

把需要介入的 Attention 引用展示为独立 Inbox 目录与详情，并提供完成 / 忽略。

包名：`@molis-ai/molis-work-plugin-inbox`。工作区内部包，是每个项目 Plugin Runtime 的一个插件（`createInboxPlugin()`，登记上的 `project_runtime`），不在宿主里手写装配。

## 一次典型调用

项目的 Plugin Runtime 注册本插件声明的动作和 `inbox.next` 消费场景。条目经 `services.attention` 读写，Feed 的事实（正文、能否重开、名字、加入 Inbox）与 Pages 的文稿经动作目录以调用者的身份取得。HTTP 路由将已认证调用转给同一动作客户端，列表、状态修改、文稿生成和显式判断共用注册处理器。`inbox.next` 场景的绑定存在 Inbox 自己声明的项目库表 `inbox_scene_bindings`（带修订号，冲突是 `inbox.revision_conflict`），不在 Functions 的库里；对象上下文和首页可用动作也由插件查询提供；首页的完成/忽略调用原状态动作，附带当前修订，不单独写 Attention。UI 继续接收 Attention 条目与关联对象的展示投影；插件不直接读取 Feed 或 Goals 表，也不依赖 Functions 插件实现。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/plugin.ts](src/plugin.ts) | `createInboxPlugin()`：把平台服务（Attention、项目库、场景、判断账、动作目录）接到动作与场景处理器上 |
| [src/ui.ts](src/ui.ts) | 目录与详情 HTML |
| [src/projection.ts](src/projection.ts) | Attention 记录到展示模型 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/route-handlers.ts](src/route-handlers.ts) | HTTP 参数与动作客户端的薄适配 |
| [src/actions.ts](src/actions.ts) | 能力合同、对象上下文、具体动作准备及业务端口 |
| [src/scenes.ts](src/scenes.ts) | 判断场景、事件上下文准备和结果消费校验 |
| [src/scene-runtime.ts](src/scene-runtime.ts) | 下一步场景的判断：哪些已发布规则可绑定、哪些建议仍成立、怎样记录；跑在 `services.scenes` 与 `services.judgments` 上，Feed 条目的正文由 `inbox.judgment.evaluate` 先读到、暂存给这一次运行的回调（PG-034） |

可对照现有调用方 [apps/workbench/src/inbox-projection-ui.ts](../../../apps/workbench/src/inbox-projection-ui.ts) 与 [apps/local-host/src/inbox-native-plugin-http.ts](../../../apps/local-host/src/inbox-native-plugin-http.ts)。

## 接入与边界

不依赖 Feed / Goals 插件实现。关联对象的名字与正文经 Feed 的公开动作取得（`feed.briefs.read`、`feed.items.content`、`feed.items.admission`、`feed.items.admit`）；Feed 没装时条目照常列出（名字缺），重开被拒并说明。完成 / 忽略只改 Attention 状态，不删除原 Feed Item、Goal 或来源。

详情里的“转为待办”只是带数据的按钮（`data-context-intake="todo"`，带事项的 id 与标题）：工作台按页面声明的对象种类，把这件事项交给 Todo 声明的「记成待办」创作入口（`todo.items.create` 的 intake），由 Todo 自己起草、新建并记下来源；Inbox 不认识 Todo 的输入。Todo 不可用时点击会得到拒绝提示。转为待办不改事项状态，处理事项也不会完成那件待办。

“判断下一步”依赖当前项目的真实场景绑定。`prepare` 从事项引用读取内容，`consume` 核对事项和内容未变化后保存建议；建议不会自动完成或忽略事项。兼容性来自注册能力的输入输出合同，其他插件的判断也可以绑定。关闭判断保留引用。`inbox.judgment.read` 返回共同目录中的判断与实际绑定摘要，网页不再根据静态系统函数列表猜测名称或可运行状态。`inbox.judgment.recommendations` 校验当前绑定、提供方、版本、权限和事项原文，只返回当前仍有效的结果；停用、撤权或原文变化会撤回当前建议，原历史保留。新增记录在原历史的 `scene_provenance` 保存这些依据，旧记录缺少依据时仅用于历史查阅。

Feed 创建 Attention 时，通过注入的 `createInboxJudgmentTrigger`（宿主侧是 `plugins/native/inbox/src/judgment-trigger.ts`，它调 Inbox 自己的动作 `inbox.judgment.evaluate`）使用同一份绑定；调用者与触发上下文要有 `judgments:write`、`feed:read`。正式 Web 组合根已向 Feed HTTP、来源和连接器同步、定时调度、工作流交接传入该端口。未绑定、停用或失效时不启动自动判断；供应商失败与上下文超限保存为 needs_review，已入箱材料不因此被删除或误报入箱失败。

工作流交接透传原调用者，后续判断不会切换成后台身份。没有模型权限时仍可完成授权的入箱，但不启动判断。每次交接只排出自己创建的 Inbox 事件，不处理其他来源的待判断队列。显式判断及嵌套交接保留发起动作的精确授权，等待期间撤权后不保存结果；已经保存的材料/事项不伪装成回滚。

当前仍有迁移边界：旧 Functions 编辑器的场景选择、完整系统能力页面、其他直接创建 Attention 的业务方，以及中断后尚未执行的自动事件恢复待迁移。不能把本路径通过视为插件全量完成。

工作区依赖：`@molis-ai/molis-work-contracts`。

文稿生成通过插件的 `pages.ts` 解析 Inbox 材料，再调用 Pages 注册动作；Host 只注入同作用域动作客户端与材料读取端口。`required_actions` 固定所需 Pages 能力的版本和提供方，目录自动反映下游权限、模型配置及文档存储状态。移除 Inbox 自己重复判断模型配置的逻辑。原请求、材料快照与文稿结果仍由 Pages 保存，失败可恢复，成功重试保留后续手工修改；生成不会自动完成 Inbox 事项。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-inbox typecheck
pnpm --filter @molis-ai/molis-work-plugin-inbox build
```

已有行为示例与回归：[inbox-native-plugin.test.ts](../../../tests/inbox-native-plugin.test.ts)、[inbox-plugin.test.ts](../../../tests/inbox-plugin.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/inbox-action-scenes.test.ts tests/inbox-automatic-scenes.test.ts
```

## 开发要求

- 负责：需要介入的事项列表、详情与处置（完成、忽略）。
- 不负责：Feed 与 Goal 的事实和 Store、其他插件的实现。
- 公开入口：`@molis-ai/molis-work-plugin-inbox`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 不直接读 Feed 或 Goals 表，不依赖 Feed、Goals、Functions 插件的实现。
  - 失败都是 `ActionError`：码是 `inbox.<原因>`（`inboxErrors`，声明在合同 `modules/attention-resumption`，因为 Feed 插件找不到 Inbox 事项时也用它）；状态只由 kind 推出，本插件没有错误类和状态表。
  - 建议不会自动完成或忽略事项；停用、撤权或原文变化撤回当前建议，历史保留。
  - 场景判断（哪些建议仍成立、绑定哪条规则）在本包的 `createInboxSceneRuntime`；宿主没有 Inbox 的场景文件（`tests/feed-inbox-scene-runtime.test.ts` 钉住）。没有 `inbox.judgment.evaluate` 启动的场景回调，对指向 Feed 条目的事项不判断（`actions.subject_unavailable`）。
  - 工作流交接透传原调用者；等待期间撤权后不保存结果。
  - 文稿由 Pages 保存，生成不自动完成 Inbox 事项；相关对象不可读时保留记录与提示，不伪造正文。
- 改动后必跑：`node scripts/run-tests.mjs tests/inbox-plugin.test.ts tests/inbox-action-scenes.test.ts tests/inbox-automatic-scenes.test.ts tests/inbox-prepared-pages.test.ts tests/inbox-native-plugin.test.ts tests/feed-inbox-scene-runtime.test.ts tests/feed-inbox-schedule-error-model.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[specs/archive/feed-inbox-pages-loop/spec.md](../../../specs/archive/feed-inbox-pages-loop/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [Inbox / Feed 拆插件需求](../../../specs/archive/inbox-feed-plugin-split/spec.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`

`inbox.home.events` 从原注意力记录提供首页事项，只返回 open/in_progress；旧的未处理记录可放到今天，完成或忽略后撤回。正文和目标关联通过共同对象查询读取，读取期间原记录版本变化则不返回旧投影；相关对象不可读时保留原注意力记录与明确提示，不伪造正文。返回的对象、来源分组导航由 `home.events.open` 在点击时重新核对。完成/忽略仍经 `inbox.actions.prepare` 提供原状态动作，使用同一条记录与版本检查。
