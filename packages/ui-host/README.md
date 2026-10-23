# UI 扩展注册与装载

让 Workbench 按 contribution 和 slot 组合 Plugin 界面，并在注册与挂载时检查身份和格式。

包名：`@molis-ai/molis-work-ui-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

UiHost.register 保存 contribution，render 调用对应渲染器；mount 检查 surface 与目标 slot 的兼容性；mountDeclared 只要 contribution 与 surface，按 surface 声明的 `target_slot_id` 从宿主构造时给的 slot 里取出那一个，再走 mount 的同一套检查，调用方不再自己维护 surface→slot 表（W5-06）。createPluginUiClient 为 Plugin 提供受权限约束的注册接口，以及让自己页面重新读取的 `invalidate()`：宿主给它这次激活的推送函数和「是否仍在运行」，client 检查声明了视图、激活没停，再推。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | UiHost 注册、渲染与挂载 |
| [src/surface-renderers.ts](src/surface-renderers.ts) | 按插件给的「方法→surface」表造一组渲染方法：每个方法把 `{ kind, args, primitives }` 挂到声明的 slot，外壳不再为每个插件写挂载转接文件 |
| [src/plugin-client.ts](src/plugin-client.ts) | Plugin UI 访问边界 |
| [src/client-lifecycle.ts](src/client-lifecycle.ts) | 浏览器挂载、取消及资源释放，由 Host 注入 |
| [src/call-id.ts](src/call-id.ts) | 诊断编号（调用编号）给人看的短形式 `shortCallId`：前 8 位，设置页服务端渲染用；怎样显示一个编号归界面，所以不在内核 |
| [src/request-client.ts](src/request-client.ts) | 浏览器共用请求助手：控制头、一次性键、同源检查、错误形状与诊断编号按钮，由 Host 注入 |

可对照现有调用方 [apps/local-host/src/plugin-executor.ts](../../apps/local-host/src/plugin-executor.ts) 阅读装配方式。

## 接入与边界

UI Host 不解释 Goal、Feed 或 Artifact 状态。Plugin 客户端的注册释放由 Host 生命周期负责；注册/渲染协议不等于任意 HTML 或脚本都获得隔离执行。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 浏览器生命周期

浏览器 Host 每页实例化一次 `UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT`，向原生插件 factory 注入 `mountPluginClient(root)`。同一根节点重复挂载返回 null；插件必须停止第二次初始化。scope 在 DOM 移除或页面离开时取消请求并释放资源，BFCache 隐藏时暂停可见性资源，恢复时重新读取。

`listen`、`timeout/clearTimeout`、`frame/cancelFrame/nextFrame`、`observe`、`own` 和可取消的 `delay` 归挂载生命周期；`whenVisible(signal => cleanup)` 和 `poll(read, delay, onError)` 归可见性生命周期。隐藏由文档 visibility 与根节点祖先的 `hidden` 合同确定；Host 不把业务内容是否为空当作可见性。

请求通过 `scope.fetch` 传递卸载信号；读完 response body 后必须 `scope.assertCurrent(signal)`，再修改状态。可见性查询使用 `whenVisible` 的 signal，写命令保持挂载 signal，离开页面不代表取消服务端任务，更不允许自动重试。SSE 在 `whenVisible` 的 cleanup 里关闭，恢复时先读取服务端状态。一次性键、错误形状和诊断编号归共用请求助手（下一节）；错误文案和放在页面哪里、要不要保留输入仍归各界面。

已接入 Images、Coding 及子面板、Files/Git 伴随面板和独立 Diff/Text Stats、Host 审查视图、Builder 创作台/Studio 及其记录组件、Shelf 及结果面板。Pages 与灵光在页面被藏起来时用 `whenVisible` 收回空白项；文档关闭则在活跃时通过 `host.view.onClosing` 登记自身的条件撤销动作，由可信宿主发送后撤销页面授权。只是标签页或窗口被藏起来（`document.hidden`）不算离开。同源 iframe 同时观察外层页面的隐藏和移除，避免父视图已离开、内部订阅仍保留。

## 浏览器请求

`createUiRequest`、`createUiFailureView` 和把它们装到页面的 `UI_REQUEST_CLIENT_SCRIPT` 是浏览器向宿主发请求的唯一助手（W3-10）；类型在合同 `@molis-ai/molis-work-contracts/platform/ui`（`UiRequest`）。两个工厂各自独立，用 `toString()` 嵌进页面，所以不引用模块里的任何名字，页面的 `fetch`、origin、令牌、翻译、剪贴板和时钟都从端口传入（`UiRequestPorts`、`UiFailureViewPorts`）。页面预算按字节算（工作台主程序里就有这段），所以页面程序嵌的是去掉编译缩进的工厂源码，工厂里因此不能有跨行的字符串（不写模板字符串），`tests/ui-request-client.test.ts` 守着。页面程序每页只装一次，挂出 `molisWorkRequest`；插件客户端从 W5-04 起经宿主给的 `host.request` 拿到同一个。

- 只发本页同源：别的源、别的端口、协议相对地址一律 `ui_host.cross_origin`，不发请求（安全不变量 S-03 的浏览器一侧，`tests/security-invariants-browser-request.test.ts`）。
- 变更带控制令牌、一次性键和 JSON 类型，读取不带；调用方的 `headers` 盖不掉这三个。每个请求 `cache: "no-store"`，只发一次，不自动重试。
- 失败是带 `code`、`status`、`callId`、`body` 的普通 `Error`（不是子类）；错误体只认 `{ error, code?, call_id? }`。没有回答时读取报 `ui_host.unreachable`，写入报 `ui_host.outcome_unknown`，都不显示浏览器英文原话。
- `request.stream(url, { body, signal, scope, onProgress })` 发送一次 POST 并读取 Runtime 的 NDJSON：UTF-8 跨块分行，进度先交给视图，以唯一 result/error 末行收尾。HTTP 失败与 error 行使用相同错误对象，详情保留在 `body.details`；流无末行或中途断开报 `ui_host.outcome_unknown`，格式或末行后的数据报 `ui_host.invalid_response`。每块和每行都检查取消与挂载状态，结束时释放 reader；预览文字不代表已保存。
- 诊断编号只读错误体里的 `call_id`（宿主只在调用记录里查得到时才写），不读响应头；`show`、`toast` 在错误区域或吐司里加一个「诊断编号 xxxxxxxx」按钮，点一下复制完整编号。显示的短编号是编号的前 8 个字符。
- 码前缀 `ui_host.*` 归本包：`cross_origin`、`unreachable`、`outcome_unknown`、`invalid_response`、`uncoded`。

**保留到 W5-04 的两处**（不是兼容层，各有删除条件）：
- `molisWorkControlHeaders()` 是同一助手只给头的入口，供还没迁的调用方使用（工作台主程序里还没迁的脚本、编进主程序的 Goals 工厂、插件客户端和约 25 个浏览器用例）。它会把令牌加到调用方给的任何地址上，所以「令牌只发同源」只对经助手本身发出的请求成立。删除条件：W5-04 迁完最后一个插件客户端、用例改用 `molisWorkRequest` 之后，若再无调用方就删（W5-04 收尾 PR 决定）。
- PTY 客户端包（`apps/workbench/src/character-terminal-client.ts`，与 Shelf、工作台 `src/terminal/` 的终端客户端一起打成 `dist/web/pty-client.js`）认证 PTY socket 时自己读页面 meta：它是打包的 TypeScript，不发 HTTP 请求，读不到模板脚本里的全局。删除条件：W5-04 把工作台客户端段落改成打包代码时，从宿主注入的 `request.token()` 取。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-ui-host typecheck
pnpm --filter @molis-ai/molis-work-ui-host build
```

已有行为示例与回归：[workbench-ui-platform.test.ts](../../tests/workbench-ui-platform.test.ts)、[plugin-host-executor.test.ts](../../tests/plugin-host-executor.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/workbench-ui-platform.test.ts tests/plugin-host-executor.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：UI 贡献、Slot、嵌入、隔离与宿主桥。
- 不负责：插件产品行为、Module 业务事实。
- 公开入口：`@molis-ai/molis-work-ui-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/ui`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 挂载前检查 surface 与目标 slot 兼容、身份与格式。
  - `mountDeclared` 只在宿主自己的 slot 里找 surface 声明的那一个；找不到就拒绝（`ui_host.slot_incompatible`），不退回别的 slot。
  - 注册与渲染协议不等于任意 HTML 或脚本获得隔离执行。
  - 插件客户端的注册释放由 Host 生命周期负责；不解释 Goal、Feed、Artifact 状态。
  - `invalidate()` 只推调用者自己的 revision，没有参数；没声明 `ui.views`、激活已停时拒绝（`ui_host.plugin_denied`），不记任何东西。
  - 请求助手只发本页同源，令牌不随它发到别的源；不自动重试；诊断编号只取错误体的 `call_id`。
- 改动后必跑：`node scripts/run-tests.mjs tests/workbench-ui-platform.test.ts tests/plugin-host-executor.test.ts tests/plugin-declarative-mounting.test.ts tests/ui-client-lifecycle.e2e.test.ts tests/ui-request-client.test.ts tests/security-invariants-browser-request.test.ts tests/client-script-undeclared.test.ts tests/ui-request-client-pages.test.ts tests/ui-request-client.e2e.test.ts tests/request-failure-call-id.e2e.test.ts tests/ui-call-id.test.ts tests/plugin-ui-invalidate.test.ts`
- 相关手册：[docs/platform/UI-PLATFORM.md](../../docs/platform/UI-PLATFORM.md)、[skills/molis-plugin-dev/ui.md](../../skills/molis-plugin-dev/ui.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/UI-PLATFORM.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/ui`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd4`, `goal-reorg-ap3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`scope.watchRevision(read, refresh)` 复用可见轮询，每两秒核对不透明 revision；首次进入、变更和断线恢复后重新读取事实。refresh 返回 false 表示当前忙，下一轮保留变更继续尝试；隐藏和卸载释放请求与定时器。真实消费者是 Files/Git。revision 由插件服务端的 `services.ui.invalidate()` 推动（PG-061）。
