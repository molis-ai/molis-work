# 注意事项与恢复提示

记录需要用户关注的对象、原因、稍后提醒和恢复线索，让 Feed 等入口能表达后续处理状态。

包名：`@molis-ai/molis-work-module-attention-resumption`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

AttentionModule 通过 subject resolver 检查对象；commands 创建或更新注意事项，query 查找当前条目。状态转换由 ATTENTION_STATUS_TRANSITIONS 与校验函数约束，调用方消费处理结果。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | AttentionModule、状态转换与 subject 校验 |

可对照现有调用方 [apps/local-host/src/feed-application.ts](../../apps/local-host/src/feed-application.ts) 阅读装配方式。

## 接入与边界

注意事项不是 OS 通知、调度任务或自动执行指令。本包不启动 Runtime，也不拥有 Feed 条目、Session 或 Goal 内容。

创建、状态变化和按对象删除都由 Owner 的同库事务覆盖 Inbox 引用、Attention 事件及同步 journal 写入。独立 Feed 加入和 Goals reconcile 也具有这条原子性；调用方已有外层事务时沿用嵌套事务，不单独提交。

对象归属由 entry 与 event 的 `owner_plugin_id` 明确保存；null 表示未指定，不按 kind 或 ID 猜。去重、按对象查询及删除以 owner、kind、裸对象 ID 为边界，同 owner 的同对象与原因仍幂等，未指定 owner 的直接调用以 null 为边界。`entry_id` 保持全局身份，状态操作照旧按它定位。

插件服务只展示已明确归属的记录，读取授权允许跨插件读；写入 owner 取自当前安装的 Manifest，异主 create/delete 带码拒绝。旧 Feed/Inbox 的共用读入口暂只接 null，避免按 kind 和裸 ID 误读其他 owner 的内容。项目 schema 为本分支 v10，旧版本仍严格拒绝，真实库维护留统一窗口；这里没有自动迁移或旧 owner 推断。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-attention-resumption typecheck
pnpm --filter @molis-ai/molis-work-module-attention-resumption build
```

已有行为示例与回归：[feed-module-repositories.test.ts](../../tests/feed-module-repositories.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/feed-module-repositories.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：需要用户关注的条目、原因、稍后提醒与恢复线索。
- 不负责：Feed 条目、Action、Goal、Session、通知、Runtime 进程。
- 公开入口：`@molis-ai/molis-work-module-attention-resumption`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/attention-resumption`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 处置状态不能替代 Goal 的工作状态或完成结论。
  - 已完成或已取消 Goal 的继续归 Goals 的 `resumeWork`，必须给出原因。
  - 切换关注对象不改绑终端、不发送消息。
- 改动后必跑：`node scripts/run-tests.mjs tests/feed-out-rules.test.ts tests/context-owner-isolation.test.ts tests/goal-decision-attention.test.ts tests/attention-atomic-effects.test.ts tests/feed-inbox-lifecycle.test.ts`
- 相关手册：[docs/modules/attention-resumption.md](../../docs/modules/attention-resumption.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/attention-resumption.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
