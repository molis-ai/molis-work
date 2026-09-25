# Plugin 作者接口

帮助 Plugin 作者声明 Manifest、生命周期和 UI/Artifact 接口，用公共协议对接 Molis Work。

包名：`@molis-ai/molis-work-plugin-sdk`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

definePlugin 校验定义；definePollingIntegrationPlugin 把 Provider port 组合成 Connector Driver 与 Raw Event → Signal Adapter。Host 通过 context.services 提供私人存储、Artifact 和 UI 客户端，作者不需要访问数据库。

`context.services.artifacts.publish/read` 是同步接口，由 Host 根据 Manifest 自动注册到同一动作 Kernel；作者只提交成果正文和固定版本。项目、用户、生产者签名及安装身份均由 Host 绑定，不能通过参数覆盖。声明所需 `artifact:read/write` 和 `artifacts.produces/consumes` 后，Runtime 授权才使接口可用；停止或崩溃后的旧客户端不能继续操作。Inputs/Outputs 同样经这个接口交换固定版本，无需另注册一套成果读写或维护 Host 名单。

公开业务能力放入 Manifest `actions`，从 `start` 返回对应 `actions` 处理器。已有 HTTP 入口可用 `bindPluginActionRoute(context, definition, request => input, routeId?)` 转发；仍需声明原 `routes`。这个适配器只转换参数/HTTP 结果，实际执行经过同一 Kernel 的 schema、项目策略和权限检查，禁止缺少动作服务时直调业务兜底。`context.services.actions` 只允许调用本插件声明的公开动作，绑定当前本地入口用户，停止、崩溃或启动失败后失效；外部 MCP 使用自己的逐客户端授权，不能借用此客户端冒充本地用户。私有同步成果 SDK 不通过这个异步入口递归调用。

存量处理器仍依赖固定用户的私人存储/成果 SDK 时，可用 `bindOwnerPluginAction` 明确限制真实调用者与 owner 一致。它返回可解释的不可用原因，不把 MCP/Agent 身份改为启动用户。处理器拿到 `beforeWrite()`，必须在外部等待后、保存之前调用；它重查原授权、项目启停、Runtime grant 和取消。此适配用于渐进迁移，不能据此宣称跨调用者接线完成；新业务处理器应直接以可信 `ActionCallContext` 处理归属。

调用旧 Host Capability 后仍要创建审阅等副作用时，将 `before_effect` 放在 `capabilities.invoke(definition, input, { before_effect })` 的第三个参数中。Host 为服务处理器提供 `invocation.beforeEffect()`，服务在实际副作用前调用；它检查原授权、注册实例和调用是否仍有效。回调不是业务 input，不能接收自 HTTP/MCP JSON、序列化或保存在审阅记录中。审批后的实际执行继续由 Review owner 自己校验，不能复用已经结束的调用上下文。

`context.services.capabilities.availability(reference)` 只读检查 Manifest 已声明消费的宿主能力及版本。它查询同一个 Host 注册表，不执行 handler，也不打开项目实例；未声明、缺失或无法检查均有明确原因。它不代表给定参数必能执行，不替代实际调用的权限、目录及异步策略检查。`bindOwnerPluginAction` 的第四个参数可填写该动作必需的宿主能力引用，目录、调用和 `beforeWrite` 会共用检查。不要将所有可选消费能力一律当成每个动作的依赖，也不要将此旧 SDK 检查替代公共动作的 `required_actions` 权限依赖。

嵌入其他插件的界面时，在 `ui.embedded_plugins` 声明其完整 Plugin ID。已启用父插件和其传递嵌入关系共用目录可用性规则，移除最后一个父入口后子能力也变为不可用；单独启用子插件仍有效。声明只表明使用关系，不安装新导航项、不授予调用权限，也不猜缺失插件。不要在 Host 再维护嵌入白名单。当前内置项目组合已使用该声明；第三方加载、通用场景和全部旧路由迁移仍以总迁移清单为准。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | definePlugin、轮询 Integration helper 与公开类型 |

可对照现有调用方 [examples/plugin-sample/index.mjs](../../examples/plugin-sample/index.mjs) 阅读装配方式。

## 接入与边界

SDK 不包含 Runtime 或业务 Store。Manifest 解析委托 Contracts；授权的实际执行由 Host/Runtime 控制。当前工作区包是 private，不能把包名当作已经发布到 npm 的承诺。作者可声明 `mcp_exports` 并向 Host 贡献工具；公开名和开关留在 Host。步骤见 [Plugin 开发 · 对外 MCP](../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

可从[本地 Plugin 示例](../../examples/plugin-sample/README.md)开始：示例使用 context.services 存取私人状态、发布 Artifact 并注册 UI，完整授权和开发步骤见开发指南。

## 动作与判断消费场景

`defineAction` 让同一份定义用于 manifest 的 `actions` 和运行实例的 `actions` 处理器。`action_scenes` 描述消费场景，运行实例的 `action_scenes` 提供 `bindings`、`bind`、`consume`；Runtime 激活时检查声明是否全部兑现。身份、输入输出、权限和作用域来自 contracts/platform/actions，声明本身不授予权限。

当触发事件和判断输入不同，用 `event_schema` 描述事件参数、`prepare` 读取实际业务对象并返回 `{ input, state }`。`input` 满足场景的 `input_schema`，`state` 是消费方私有快照。`consume` 的第四个参数包含本次绑定和私有状态；消费方须核对业务对象版本后落地，不能把模型结果直接当作写入授权。Host 会在准备后和判断后检查绑定修订、提供方实例及实时策略。场景可用 `failed` 显式消费判断失败；失败消费同样经过这些检查。已准备的上下文不满足函数输入合同也可进入该失败路径，事件参数校验或对象读取失败则直接拒绝。失败记录应标明需要人工处理及错误码，不能伪装成功或自动重试。

依赖判断绑定才能执行的动作可声明 `action.required_scene: { scene_id, version }`。LocalHost 的目录与排队执行检查会读取实际绑定，显示缺配置、提供方失效或合同不兼容。此依赖是入口可用性要求，实际触发仍须调用同作用域 `ActionSceneClient.runScene`，不能据此绕过绑定与结果校验。

依赖其他动作的组合能力可声明 `action.required_actions: [{ capability_id, version, provider_id? }]`。Kernel 在同一注册目录递归检查依赖，LocalHost 补充实际安装和连接状态；发现与执行共用这些检查。固定版本和提供方不会静默替换，缺失、权限不足和循环依赖均不可执行。声明不会自动授予依赖权限，也不会替你调用依赖：处理器仍通过同作用域 ActionClient 使用原调用者上下文。只声明执行必需的能力，不把可选增强列成强制依赖。

授权上下文由可信 Host 传入。除权限集合外，`allowed_actions` 可以将调用限制到准确的能力 ID、版本和提供方；旧 `allowed_capability_ids` 不能扩大该限制。组合处理器调用其他能力时保留原上下文，不重新拼一份权限更大的 context。`validate_authority` 是 Host 在实际分发前调用的授权检查回调，处理器不能删除或替换它来绕过撤权；它不是业务输入，也不写入任务 JSON。长期后台任务仍需由业务 owner 接入自己的取消和生命周期规则。

`user_action` 由受保护 Host 渠道注入，表示真实用户操作的出处，不能由插件或模型根据文本构造。它不单独授予操作权限。旧 typed 接口若声明 `host_only`，Manifest 的 consumes 也不能使其可调用；SDK 的依赖检查和调用都保留 plugin 消费者身份，传入另一个描述或调用选项不能解除限制。用户决定应交给产品的受保护入口处理。

生产 MCP 的新动作由用户在「能力 → 对外接入」按客户端与范围授权。界面从同一注册表读取名称、合同、权限和状态，新插件不需修改该页白名单。版本、提供方或权限变化不能继承旧授权；移除插件后保留原记录供撤销。默认开放的系统查询可以被单独撤销。目录注册不等于授权，也不自动授予组合动作的依赖。旧 `mcp_exports` 别名仍沿用原全局规则，不能用它们证明新动作授权生效。

需要等待模型、网络或材料处理的能力，可声明 `action.scheduling: "concurrent"`。这只适用于业务 owner 已使用短事务和版本/来源校验保证安全的处理器；Host 默认仍串行执行。调度方式从正式注册定义读取，调用方不能自行打开并发；Host 关闭时等待这些调用完成。使用可信 `ActionCallContext.signal` 取消，`on_progress?.({ stage, progress })` 回传传输进度；回调不是能力参数，也不替代需要持久保存的运行记录。

场景配置由插件自己的存储 owner 持有，`bindings` 返回真实引用，`bind` 检查配置写权限并持久化。Host 场景客户端提供发现、绑定、使用位置及执行接口；它不是所有旧插件已经自动迁移的承诺。可参考 [Inbox 场景](../../plugins/native/inbox/src/scenes.ts)、[正式 Runtime 注册回归](../../tests/action-service.test.ts) 和 [Host 场景集成](../../tests/inbox-action-scenes.test.ts)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-sdk typecheck
pnpm --filter @molis-ai/molis-work-plugin-sdk build
```

已有行为示例与回归：[plugin-authoring.test.ts](../../tests/plugin-authoring.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/plugin-authoring.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-fd3`, `goal-reorg-dv3`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。


### 工作流内容站

`defineWorkflowContentActions({ id, title, icon, create, read_permissions, write_permissions })` 生成内容协议 v1 的规范动作；将 `Object.values(actions)` 放入 Manifest `actions`，用 `bindWorkflowContentHandlers(actions, { list, read, receive, create })` 兑现处理器并从 `start()` 返回。SDK 会核对权限声明；运行时再次核对协议 schema。处理器拿到可信 `ActionCallContext`，按当前项目读写插件自己的数据。

工作流从统一目录自动发现这些角色，使用同一执行服务，不增加 Host 支持名单或逐插件分支。读写权限须由安装 grant 和调用者同时满足。`receive` 返回该站点的实际内容引用；`list` 返回完整可选内容；不要把无结构输出或另一种业务对象冒充此内容合同。新增版本应保留或明确迁移旧引用，不能靠同名替换。

此协议覆盖内容交接，不代替任意输入输出的工作流步骤映射。系统判断、模板转换、AI 整理和人工交接是不同机制。

可信动作上下文可携带 `runtime_session_id`，用于保留由 Host 识别的原会话来源；它不属于插件业务输入，也不授予权限。`user_action` 的整组确认与主体引用由受保护用户入口提供，不能从模型自报的确认字段生成。目标树审批与事件用户决定都走 host_only 兼容桥，普通插件通过目录只发现获准调用的能力。
