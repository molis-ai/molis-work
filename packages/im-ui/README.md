# Molis Work 项目讨论 UI

Workspace registration: `goal-reorg-f2`。

本包负责每个项目的主群、公开 Thread 标签与单个当前会话。项目成员都能发现并参与话题；不提供私聊。当前行为和验收以 [标签版 spec](../../specs/archive/molis-work-im/redesign-v2/spec.md) 为准，视觉规则见 [DESIGN.md](./DESIGN.md)。

## 模块边界

- `src/page.ts`：嵌入/独立页面的语义 DOM、会话区、搜索和输入控件。
- `src/styles.ts`：中性明暗主题、标签、消息、响应式及局部动效。
- `src/views.ts`：消息、引用、来源上下文、成员与标签的安全渲染。`createViews` 为每个根节点持有独立的两份 WeakMap；同文件 `updateViewMarkup` 接收这一实例的 chrome 缓存，处理更新与焦点恢复，消息节点在语言切换后的正常 SSE 更新中继续复用。
- `src/message-format.ts`：先转义再处理基础 Markdown，不接受原始 HTML。
- `src/browser/entry.ts`：装配同一个浏览器入口。构建产出的 `/im/client.js` 由本地宿主和独立 Server 共用。
- `resources/locales/`：讨论界面自有的语言包。两种装配使用同一套 SDK 读词；工作台原位切换时从讨论的静态页面准备词包，保留打开的会话、消息和草稿。
- `src/browser/controller.ts`：只做装配（页面状态 `ImState`、按顺序调用各层）；具体工作分在 `controller-shell.ts`（路径、状态行、输入框可用性）、`controller-composer.ts`（草稿、引用、绘制、阅读位置、已读）、`controller-sync.ts`（事件流、刷新、历史分页）、`controller-rooms.ts`（选群、选话题）、`controller-topics.ts`（话题面板与新话题）、`controller-navigate.ts`（发送、来源与搜索结果定位）、`controller-dialogs.ts`（各弹窗）、`controller-startup.ts`（连接与取名）、`controller-page.ts`（页面级监听）、`controller-clicks.ts`（`data-action` 点击分发）。构造方法工厂时只给已就绪的 `ImBaseCtx`（元素、状态、基础服务）；返回的处理函数被调用时才取得完整 `ImCtx` 以跨层调用。完整上下文在装齐方法和邀请控制器后由类型检查确认，再交给页面监听与启动；不把初始对象断言成完整上下文。各层由浏览器入口装配。
- `src/browser/history.ts`：连续历史窗口、缓存追赶与分页游标。
- `src/browser/drafts.ts`：成员/会话草稿、稳定提交版本及条件清理。
- `src/browser/transport.ts`：同源 HTTP、SSE 与经过来源/请求标识校验的宿主连接。
- `src/browser/types.ts`：临时客户端状态类型；领域 DTO 仍来自 contracts。

项目讨论是平台侧栏的一个标签（`apps/workbench/src/side-panel.ts`，specs/archive/side-panel）：侧栏负责布局——工作区真实让出宽度，右侧默认 35%，拖拽/键盘可调整，≤760px 切为上工作、下侧栏。切换标签或收起侧栏仅隐藏 iframe，保留当前会话与草稿。宿主核验 iframe 的同源窗口与项目。可见性通知触发原有阅读逻辑，外观和语言只投影到当前讨论页面。

`server/src/im` 负责成员权限、消息和话题持久化、搜索、读游标、事务回执与事件。每项目唯一主群，权限来自 `mw_access`；旧群不自动绑定或公开。本地项目首次接入由 local-host 校验既有控制凭证并读取真实项目目录，普通浏览器不能自行取得项目权限。

## 状态与交互

所有服务请求同源 `/im/api`，身份由 HttpOnly cookie 解析。消息写入携带稳定 `client_id`，同一次不确定结果的重试复用原键；具名成员回执跨恢复后的设备会话识别，匿名命名仍按原会话隔离；成功发送与后续刷新失败分开处理。通过本机控制凭证与实际项目目录验证的宿主，可在匿名/失效会话时恢复该项目持久化 owner 身份，复用共享 Identity；不按名字匹配，不替换另一具名成员，不开放远端自动授权。

邀请采用安全状态合同。打开弹窗只读状态；本人明确生成/更换时，页面用至少 32 字节安全随机数和稳定 `client_id` 表达一次意图，原文只在当前页面内存，不存草稿或 localStorage。同一未知结果重试沿用原值，服务端当前哈希不匹配时不展示旧链接有效。刷新或换设备后无法取回原文；已分享链接仍有效，只有明确更换才使旧链接失效。新建群没有尚无人持有的令牌。复制走既有 `molisCopy`。真实路径与浅深色三宽度验证：`tests/im-invitations.e2e.test.ts`；服务端/维护见 [Home 数据](../../docs/system/HOME-DATA.md)。

主群和 Thread 在同一区域切换，每个发送目标独立保存草稿、引用与阅读位置。新话题允许没有来源，要求标题及首条正文；服务端一次事务创建正式话题与首条消息，未发送的表单只作为本地草稿。成功回执只清除相同 client_id 的版本，不会删除期间编辑的新草稿。引用只指向同群真实消息，来源定位可回到主群并补载历史。

SSE 触发查询刷新，消息按 ID 复用 DOM；阅读历史时保留位置并提供“回到最新”。重新打开缓存话题先逐页补齐到旧边界；搜索/隐藏区不采集零尺寸锚点。只有当前对话可见、宿主展开、文档前台且消息进入视口时才推进对应读游标。消息与话题标题搜索在服务端限定于当前群。

动效作为本包设计 sidecar：按钮 130ms、输入边线 150ms、话题切换 150ms、新消息 160ms；宿主宽度/边距 340ms 连续变化。拖动过程中停用布局过渡；减少动态偏好停用过渡、动画和平滑滚动。焦点使用 2px 中性描边；消息操作同时支持键盘焦点和无 hover 设备。

## 验证与边界

```sh
pnpm --filter @molis-ai/molis-work-im-ui build
pnpm --filter @molis-ai/molis-work-im-ui typecheck
node scripts/run-tests.mjs tests/im-controller-initialization.test.ts tests/im-browser-state.test.ts tests/im-domain.test.ts tests/im-local-project.test.ts
```

初始化类型验收：`RAC-IMCTX-01`——方法工厂的构造输入不能读取尚未安装的方法或邀请控制器，缺少基础服务时编译失败；`RAC-IMCTX-02`——生产装配表达式保留结构类型，直接移去启动方法或邀请控制器时编译失败，完整装配后才能注册页面和点击监听。用例也核对工厂求值、事件注册及各返回方法。

复查发现的 5 项缺陷及模块边界调整已修复；14 项定向状态/领域/HTTP 回归通过。真实源码工作台复跑跨页缓存、延迟发布、搜索锚点、清除 Cookie 后恢复和实际发送、390×400 短屏与桌面/常规窄屏。范围仍仅为功能可用切片；修复证据见 spec 和 `review/e2e-audit/fixes.md`。

本机工作台的项目讨论主人可以从项目中选择对象，引用随消息保存；工作台在可见的消息、引用和转发处以同一套呈现组件绘制对象。普通聊天读取不返回对象引用，外部成员或缺少原工作台会话时仍可按原规则聊天。文件上传、持久化表情/提及通知、消息修改/删除、结论流程和 AI 总结尚未实现。插入成员名字只写入正文。实体设备软键盘、中文输入法组合事件、跨设备完整流程与超长历史性能未验收。

正常工作台由 local-host 挂载 `/im`，Workbench 的平台侧栏把它作为“讨论”标签装载（`apps/workbench/src/side-panel.ts`，specs/archive/side-panel）。构建后，旧群服务的隔离调试入口仍可使用 `node --import tsx scripts/preview-im.mts`；它不替代真实项目工作台的分屏验收。生产空项目不预置示例成员、消息或话题。

## 开发要求

- 负责：项目群聊与内联话题界面。
- 不负责：服务端身份、消息持久化与同步实现（在 `server/src/im`）。
- 公开入口：`@molis-ai/molis-work-im-ui`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/im`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-plugin-sdk`（页面部件 `/ui`）。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 每个项目只有一个主群，权限来自 `mw_access`；浏览器不能自行取得项目权限。
  - 具名成员不按名字匹配、不替换另一名成员，不开放远端自动授权。
  - 正式话题与首条消息由服务端一次事务创建；未发送的表单只是本地草稿，成功回执只清除同一 `client_id` 的版本。
  - 只有对话可见、宿主展开、文档在前台且消息进入视口时才推进读游标。
- 改动后必跑：`node scripts/run-tests.mjs tests/im-controller-initialization.test.ts tests/im-browser-state.test.ts tests/im-local-project.test.ts tests/im-domain.test.ts`；改了消息流的滚动、复制或页面脚本的拼装加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/im-follow-copy.e2e.test.ts`
- 消息流的滚动只有一个主人（设计系统的 `window.molisFollow`，VUX-26），复制走同一个 `window.molisCopy`（VUX-19）：两段页面脚本和它们的样式随 `IM_CLIENT_SCRIPT`、`IM_STYLES` 一起发，自己不再判断离底多少像素。
- 相关手册：[docs/platform/UI-PLATFORM.md](../../docs/platform/UI-PLATFORM.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。


讨论页语言沿用Host的当前语言，独立Server按请求语言绘制；不保存第二份语言偏好。`src/locale.ts`拥有界面词典并复用SDK的`fillMessage`，日期按页面语言格式化。构建在TypeScript完成后由`tooling/minify-client.mjs`压缩同一个`/im/client.js`资源，不在运行时加载构建器；模块公开常量和浏览器工厂行为不变。
