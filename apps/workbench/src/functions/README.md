# 系统判断编辑器

从「能力 → 能力库 → 编辑判断规则」进入 `/capabilities/rules`。定义、样本、试跑和发布继续写入原 Functions 存储，判断不再是可安装的插件。

本目录只拥有界面、浏览器交互、样式与翻译。业务和动作合同在 [modules/functions](../../../../modules/functions/README.md)，HTTP 适配在 [Local Host](../../../local-host/src/functions-http.ts)。草稿操作要求 `functions:manage`，试跑另需 `functions:invoke`，通过同一 Host 动作客户端执行。凭据由服务连接管理，编辑器不保存密钥。

`project` 指定使用场景的项目，`rule` 打开稳定记录 ID；`desktop` 保留桌面外壳。旧 Functions 页面链接和 HTTP 插件前缀仅转到同一系统入口。关闭或删除草稿后清除详情 URL；失效引用展示错误，不假装打开了另一条规则。

当前编辑流程为「选择用途 → 判断规则 → 试跑与启用」。消费场景和配置位置从共同服务发现；Home、Inbox、Feed 与未知插件共用通用启停入口，配置按原 revision 写回 owner。用途保存准确场景版本与提供方，同名多版本分别选择，停用插件后仍保留原引用和映射。旧草稿在发布时只有唯一兼容场景才能补齐引用；已发布旧数据保持不变。使用位置按真实绑定展示，配置权独立于运行权。Agent 选项也从当前授权动作目录生成，Choice/Noul 可为结果选择准确能力版本，或只返回判断。失效映射保留，发布和调用会复查；推荐不执行动作。非推荐结果合同、来源完全撤回后的持续用途展示及内置 Agent/Character 执行接入仍在迁移。

验证：

```sh
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-local-host build
node --import tsx --test tests/functions-authoring-actions.test.ts tests/functions-draft-retention.test.ts tests/functions-agent-references.test.ts tests/function-agent-authoring.e2e.test.ts tests/capabilities-page.test.ts
```

真实 Host/SQLite 的隔离浏览器 fixture 在 `.impeccable/review/action-service/serve-fixture.mts`，模型为明确的本地模拟；不会使用真实账号。`scripts/preview-functions.mts` 是仅编辑器的独立调试页面，不是产品组合根。

完整范围与未完成项见 [统一动作架构](../../../../specs/action-architecture/spec.md)。
