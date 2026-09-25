# 系统判断编辑器

从「能力 → 能力库 → 编辑判断规则」进入 `/capabilities/rules`。定义、样本、试跑和发布继续写入原 Functions 存储，判断不再是可安装的插件。

本目录只拥有界面、浏览器交互、样式与翻译。业务和动作合同在 [modules/functions](../../../../modules/functions/README.md)，HTTP 适配在 [Local Host](../../../local-host/src/functions-http.ts)。草稿操作要求 `functions:manage`，试跑另需 `functions:invoke`，通过同一 Host 动作客户端执行。凭据由服务连接管理，编辑器不保存密钥。

`project` 指定使用场景的项目，`rule` 打开稳定记录 ID；`desktop` 保留桌面外壳。旧 Functions 页面链接和 HTTP 插件前缀仅转到同一系统入口。关闭或删除草稿后清除详情 URL；失效引用展示错误，不假装打开了另一条规则。

当前编辑流程为「选择用途 → 判断规则 → 试跑与启用」。旧 Feed/Home 用途配置仍在迁移，不能把这部分固定选项当成通用场景发现已经完成。系统能力详情读取已注册的兼容场景与真实绑定。

验证：

```sh
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-local-host build
node --import tsx --test tests/functions-authoring-actions.test.ts tests/functions-draft-retention.test.ts tests/capabilities-page.test.ts
```

真实 Host/SQLite 的隔离浏览器 fixture 在 `.impeccable/review/action-service/serve-fixture.mts`，模型为明确的本地模拟；不会使用真实账号。`scripts/preview-functions.mts` 是仅编辑器的独立调试页面，不是产品组合根。

完整范围与未完成项见 [统一动作架构](../../../../specs/action-architecture/spec.md)。
