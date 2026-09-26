# Molis Work 群聊 UI

Status: `partial`. Contract: `@molis-ai/molis-work-contracts/services/im`.
Workspace registration: `goal-reorg-f2`.

该包只负责群聊及 Thread 的同屏视图、消息呈现、独立草稿和服务连接状态。
身份、成员权限、消息持久化和事件通知由统一 Server 提供，不在浏览器另建事实来源。

界面采用中性浅色与石墨暗色主题。桌面群聊与 Thread 左右并列，≤640px 上下分区；≤1100px 群目录改为按需展开。公开 Thread 从源消息在同屏区域内命名，按群恢复上次打开的话题，并保存各发送目标的独立草稿。SSE 更新复用未变化的消息 DOM，保留阅读位置与焦点；短促过渡遵循减少动态偏好。生产入口保持真实空态，不预置演示群聊或消息。具体界面约定见 [DESIGN.md](./DESIGN.md)。

- `page.ts`：独立页面/嵌入页面及静态 DOM。
- `styles.ts`：中性明暗主题、桌面并列与窄屏上下布局及动效。
- `views.ts`：安全的消息、成员、Thread 与历史渲染。
- `client.ts`：会话、分页、事件恢复、发送和草稿状态。
- `host.ts`：既有 Workbench 的入口与工作区挂载，保留原页面状态。

所有请求同源 `/im/api`，身份由服务端 cookie 解析；所有写入带稳定 `client_id`。
成功发送与刷新失败分别处理，重试复用同一键。

```sh
pnpm --filter @molis-ai/molis-work-im-ui build
pnpm --filter @molis-ai/molis-work-im-ui typecheck
```

完整需求和当前服务交接：`specs/molis-work-im/spec.md`。

在仓库根目录可运行真实后端的隔离预览（不读取个人项目，也不预置群聊或消息）：

```sh
node --import tsx scripts/preview-im.mts
```

终端会显示本次地址和临时数据目录。指定 `--home <目录> --port <端口>` 可在重启后使用相同消息与会话；正常工作台由 local-host 挂载 `/im`，无需另启预览。
