# Inbox 注意力入口

把需要介入的 Attention 引用展示为独立 Inbox 目录与详情，并提供完成 / 忽略。

包名：`@molis-ai/molis-work-plugin-inbox`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Host 在项目运行时注册本插件的七项动作和 `inbox.next` 消费场景。HTTP 路由将已认证调用转给同一动作客户端，列表、状态修改、文稿生成和显式判断共用注册处理器。UI 继续接收 Attention 条目与关联对象的展示投影；插件不直接读取 Feed 或 Goals 表，也不依赖 Functions 插件实现。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 目录与详情 HTML |
| [src/projection.ts](src/projection.ts) | Attention 记录到展示模型 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/route-handlers.ts](src/route-handlers.ts) | HTTP 参数与动作客户端的薄适配 |
| [src/actions.ts](src/actions.ts) | 七项能力合同及业务端口 |
| [src/scenes.ts](src/scenes.ts) | 判断场景、事件上下文准备和结果消费校验 |

可对照现有调用方 [apps/workbench/src/inbox-projection-ui.ts](../../../apps/workbench/src/inbox-projection-ui.ts) 与 [apps/local-host/src/inbox-native-plugin-http.ts](../../../apps/local-host/src/inbox-native-plugin-http.ts)。

## 接入与边界

不依赖 Feed / Goals 插件实现。关联对象标题由 Host 解析后传入。完成 / 忽略只改 Attention 状态，不删除原 Feed Item、Goal 或来源。

“判断下一步”依赖当前项目的真实场景绑定。`prepare` 从事项引用读取内容，`consume` 核对事项和内容未变化后保存建议；建议不会自动完成或忽略事项。兼容性来自注册能力的输入输出合同，其他插件的判断也可以绑定。关闭判断保留引用，旧 Functions 绑定仍从原存储行读取。

Feed 创建 Attention 时，通过注入的 `createInboxJudgmentTrigger` 使用同一份绑定。正式 Web 组合根已向 Feed HTTP、来源和连接器同步、定时调度、工作流交接传入该端口。未绑定、停用或失效时不启动自动判断；供应商失败与上下文超限保存为 needs_review，已入箱材料不因此被删除或误报入箱失败。

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

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [Inbox / Feed 拆插件需求](../../../specs/inbox-feed-plugin-split/spec.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`
