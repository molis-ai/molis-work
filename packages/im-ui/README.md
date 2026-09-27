# Molis Work 项目讨论 UI

Status: `partial`。Contract: `@molis-ai/molis-work-contracts/services/im`。
Workspace registration: `goal-reorg-f2`。

本包负责每个项目的主群、公开 Thread 标签与单个当前会话。项目成员都能发现并参与话题；不提供私聊。当前行为和验收以 [标签版 spec](../../specs/molis-work-im/redesign-v2/spec.md) 为准，视觉规则见 [DESIGN.md](./DESIGN.md)。

## 模块边界

- `src/page.ts`：嵌入/独立页面的语义 DOM、会话区、搜索和输入控件。
- `src/styles.ts`：中性明暗主题、标签、消息、响应式及局部动效。
- `src/views.ts`：消息、引用、来源上下文、成员与标签的安全渲染。
- `src/message-format.ts`：先转义再处理基础 Markdown，不接受原始 HTML。
- `src/client.ts`：组装已编译、有类型的浏览器函数；不再维护不可检查的 JavaScript 字符串。
- `src/browser/controller.ts`：会话选择、DOM 事件和功能之间的编排。
- `src/browser/history.ts`：连续历史窗口、缓存追赶与分页游标。
- `src/browser/drafts.ts`：成员/会话草稿、稳定提交版本及条件清理。
- `src/browser/transport.ts`：同源 HTTP、SSE 与经过来源/请求标识校验的宿主连接。
- `src/browser/types.ts`：临时客户端状态类型；领域 DTO 仍来自 contracts。
- `src/host.ts`：历史兼容导出；旧宿主样式和脚本为空。实际入口和分屏由 Workbench 拥有。

`apps/workbench/src/discussion-split.ts` 负责右下角项目菜单入口打开后的布局：工作区真实让出宽度，右侧默认 35%，拖拽/键盘可调整，≤760px 切为上工作、下讨论。关闭仅隐藏 iframe，保留当前会话。宿主与 iframe 的可见性、主题和项目接入消息核验同源及发送窗口；聊天领域事实不放在宿主。

`server/src/im` 负责成员权限、消息和话题持久化、搜索、读游标、事务回执与事件。每项目唯一主群，权限来自 `mw_access`；旧群不自动绑定或公开。本地项目首次接入由 local-host 校验既有控制凭证并读取真实项目目录，普通浏览器不能自行取得项目权限。

## 状态与交互

所有服务请求同源 `/im/api`，身份由 HttpOnly cookie 解析。消息写入携带稳定 `client_id`，同一次不确定结果的重试复用原键；具名成员回执跨恢复后的设备会话识别，匿名命名仍按原会话隔离；成功发送与后续刷新失败分开处理。通过本机控制凭证与实际项目目录验证的宿主，可在匿名/失效会话时恢复该项目持久化 owner 身份，复用共享 Identity；不按名字匹配，不替换另一具名成员，不开放远端自动授权。

主群和 Thread 在同一区域切换，每个发送目标独立保存草稿、引用与阅读位置。新话题允许没有来源，要求标题及首条正文；服务端一次事务创建正式话题与首条消息，未发送的表单只作为本地草稿。成功回执只清除相同 client_id 的版本，不会删除期间编辑的新草稿。引用只指向同群真实消息，来源定位可回到主群并补载历史。

SSE 触发查询刷新，消息按 ID 复用 DOM；阅读历史时保留位置并提供“回到最新”。重新打开缓存话题先逐页补齐到旧边界；搜索/隐藏区不采集零尺寸锚点。只有当前对话可见、宿主展开、文档前台且消息进入视口时才推进对应读游标。消息与话题标题搜索在服务端限定于当前群。

动效作为本包设计 sidecar：按钮 130ms、输入边线 150ms、话题切换 150ms、新消息 160ms；宿主宽度/边距 340ms 连续变化。拖动过程中停用布局过渡；减少动态偏好停用过渡、动画和平滑滚动。焦点使用 2px 中性描边；消息操作同时支持键盘焦点和无 hover 设备。

## 验证与边界

```sh
pnpm --filter @molis-ai/molis-work-im-ui build
pnpm --filter @molis-ai/molis-work-im-ui typecheck
node --import tsx --test --test-concurrency=1 tests/im-browser-state.test.ts tests/im-domain.test.ts tests/im-local-project.test.ts
```

复查发现的 5 项缺陷及模块边界调整已修复；14 项定向状态/领域/HTTP 回归通过。真实源码工作台复跑跨页缓存、延迟发布、搜索锚点、清除 Cookie 后恢复和实际发送、390×400 短屏与桌面/常规窄屏。范围仍仅为功能可用切片；修复证据见 spec 和 `review/e2e-audit/fixes.md`。

文件上传、持久化表情/提及通知、消息修改/删除、结论流程、工作资源引用和 AI 总结尚未实现。插入成员名字只写入正文。实体设备软键盘、中文输入法组合事件、跨设备完整流程与超长历史性能未验收，不能据此宣称完整通信产品或可发布。

正常工作台由 local-host 挂载 `/im`。旧群服务的隔离调试入口仍可使用 `node --import tsx scripts/preview-im.mts`；它不替代真实项目工作台的分屏验收。生产空项目不预置示例成员、消息或话题。
