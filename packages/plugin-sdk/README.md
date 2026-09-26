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

场景兼容性同时检查输入、输出语义及对象类型。判断能力的 `subject_kinds` 必须覆盖场景声明的全部对象；例如只能判断 `inbox_entry` 的能力不能绑定同时接收 `feed_item` 和 `inbox_entry` 的场景。不能用相同 JSON 形状代替对象适用性。发现、保存绑定及实际执行使用相同检查。

已注册场景会进入系统规则编辑器的用途目录，无需添加 Host 场景 ID。当前编辑器支持 `molis.behavior-recommendation.v1` 的有限结果映射：在 `result_schema.properties.suggested_behavior_ids.items.enum` 声明可接受的符号，并可用 `recommendation_labels` 提供同名键的显示名称。名称只属于本场景，不能覆盖其他场景的同名结果。使用 `recommendation_source: "subject-offers"` 时名称由原动作查询声明，不能再提供 `recommendation_labels`。尚不支持的结果合同、同 ID 多版本用途明确显示不可配置；底层场景客户端仍按具体版本工作。

`functions.authoring.catalog`、`functions.authoring.usages`、`functions.authoring.targets` 和 `functions.authoring.configure` 是系统注册的查询/配置能力，网页、内部客户端和 MCP 共用实现，要求规则管理权限。使用调用者当前项目及已有授权，不接受项目或权限覆盖参数。管理权限不代替消费场景的配置权限或判断执行权限。

要让系统规则编辑器直接启用插件场景，在场景声明中加入 `configuration_permissions`，并在 handler 中提供 `targets(caller)`。每个位置返回原业务配置的 `binding_id`、`title`、可选本地 `href` 及 `revision`；尚未绑定的固定位置返回 `revision: null`，已有规则返回原配置版本。只有真实存在或业务明确提供的固定位置才能返回，不能靠发现查询创建规则。Feed 返回已有来源规则，Home/Inbox 返回各自单一项目位置。只贡献场景的插件也能从自己的安装授权进入本地用户目录，不必伪造一个动作。

通用服务附加准确场景版本、提供方、项目、原绑定和状态。场景的 `permissions` 控制执行，`configuration_permissions` 独立控制查看和停用原配置。`configuration_availability` 表示能否停用；`availability` 表示能否启用，还包含判断兼容性及运行条件。安装授权也分别检查这两组权限；handler 可通过 `configuration_availability` 声明原配置自身的可用条件。位置可通过 `activation_permissions` 声明仅启用时需要的权限，或通过 `activation_availability` 说明其他启用条件，不能因此阻止停用原引用。例如 Feed 自动入箱位置需要 `inbox:write` 才能启用。

配置请求固定场景提供方和 `expected_revision`，系统编辑器自动使用此合同。原 `bind(caller, binding, options)` 必须在原存储中原子核对 `options.expected_revision`：null 仅允许创建未绑定位置，已有版本仅允许条件更新；并发修改、删除或重建后拒绝旧写入。不要把 options（特别是可信回调）序列化进配置。服务核对真实位置、调用者与安装授权、判断提供方和兼容性，再调用同一个 owner；不存在的目标不自动补建。停用只改变原绑定的启用状态，保留函数版本、来源和历史。

Host 为每个提供 `targets` 的场景自动注册三项真实动作：`scenes.targets:<scene_id>`、`scenes.enable:<scene_id>` 和 `scenes.disable:<scene_id>`。它们沿用原场景版本和提供方，随原注册一起撤回。通过 SDK 的 `sceneConfigurationActions(scene)` 可获取相同定义，不要在插件中重复注册。查询参数可带准确 `judgment` 引用；启用/停用参数为 `binding_id`、`expected_revision` 和准确 `judgment` 引用。处理器使用同一个场景 owner 和原配置存储。

只提供场景的插件也会在“能力 → 对外接入”出现这三项动作。MCP 客户端通过现有逐动作授权获得查看、启用或停用权限；本地安装授权不会自动授权外部客户端。授权查看不授予停用，授权停用也不授予运行判断。启用还须获得原场景运行权限、准确判断动作及位置附加权限。系统规则编辑器的配置动作同样转发到这些派生动作。保存前重新核对准确动作授权和 `validate_permissions`，保存中撤权会阻止写入；可信回调不是业务输入。其他作者合同、Agent 目录和消费者迁移进度见[迁移清单](../../specs/action-architecture/migration.md)。

通过系统发布能力发布场景规则时，当前调用者须能发现该场景，且草稿满足共同输入输出及对象合同。发布失败仍保留草稿；异步校验期间草稿被修改则拒绝提交，必须重新检查。独立规则无须选择项目，项目消费规则通过对应项目客户端发布；发布不会替代绑定和执行阶段的再次检查。

规则作者选择用途时保存 `scene_id`、`scene_version` 和 `scene_provider_id`。同名场景的不同版本可分别选择，其结果标签按版本与提供方隔离；失效来源不自动换成新来源。新发布判断把这项意图放入动作的 `result_scene`，共同核心在兼容性发现、绑定和执行时核对。它限制消费场景，不是判断的运行依赖：原场景失效后仍可独立调用判断。旧草稿只有唯一兼容场景时，才在发布的同一次条件更新中补齐引用；已发布旧规则不猜测历史来源、不自动修改。

保存启用绑定时，服务将实际 `provider_id` 固定在判断引用中，场景 owner 应完整保存这个引用。提供方被替换后，即使动作 ID 和版本相同，原绑定也不可用；重新选择新提供方才可继续。停用绑定仍保留原引用和历史。

读取旧绑定时缺少 `provider_id`，共同服务会保留使用位置并标记不可用；不能根据当前目录替它猜一个来源。已知属于系统 Functions 的旧函数键由原存储 owner 恢复其固定系统身份。插件自己的持久化适配必须保存服务返回的完整引用，包含提供方和版本。

当触发事件和判断输入不同，用 `event_schema` 描述事件参数、`prepare` 读取实际业务对象并返回 `{ input, state }`。`input` 满足场景的 `input_schema`，`state` 是消费方私有快照。`consume` 的第四个参数包含本次绑定和私有状态；消费方须核对业务对象版本后落地，不能把模型结果直接当作写入授权。Host 会在准备后和判断后检查绑定修订、提供方实例及实时策略。场景可用 `failed` 显式消费判断失败；失败消费同样经过这些检查。已准备的上下文不满足函数输入合同也可进入该失败路径，事件参数校验或对象读取失败则直接拒绝。失败记录应标明需要人工处理及错误码，不能伪装成功或自动重试。

依赖判断绑定才能执行的动作可声明 `action.required_scene: { scene_id, version }`。LocalHost 的目录与排队执行检查会读取实际绑定，显示缺配置、提供方失效或合同不兼容。此依赖是入口可用性要求，实际触发仍须调用同作用域 `ActionSceneClient.runScene`，不能据此绕过绑定与结果校验。

依赖其他动作的组合能力可声明 `action.required_actions: [{ capability_id, version, provider_id? }]`。Kernel 在同一注册目录递归检查依赖，LocalHost 补充实际安装和连接状态；发现与执行共用这些检查。固定版本和提供方不会静默替换，缺失、权限不足和循环依赖均不可执行。声明不会自动授予依赖权限，也不会替你调用依赖：处理器仍通过同作用域 ActionClient 使用原调用者上下文。只声明执行必需的能力，不把可选增强列成强制依赖。

授权上下文由可信 Host 传入。除权限集合外，`allowed_actions` 可以将调用限制到准确的能力 ID、版本和提供方；旧 `allowed_capability_ids` 不能扩大该限制。组合处理器调用其他能力时保留原上下文，不重新拼一份权限更大的 context。`validate_authority` 是 Host 在实际分发前调用的授权检查回调，处理器不能删除或替换它来绕过撤权；它不是业务输入，也不写入任务 JSON。长期后台任务仍需由业务 owner 接入自己的取消和生命周期规则。

组合能力触发嵌套动作或场景时，可使用 contracts 的 `retainActionAuthority(caller, { capability_id, version, provider_id })` 保留发起动作的精确授权校验。它原样保留项目、调用者、权限和取消信号，不授予权限。等待后的副作用边界仍需调用该上下文的 `validate_authority`；共同场景在消费结果前执行此校验。事件队列必须只消费本次操作拥有的事件，不能拿当前调用者去排空其他来源的待处理事件。

`user_action` 由受保护 Host 渠道注入，表示真实用户操作的出处，不能由插件或模型根据文本构造。它不单独授予操作权限。旧 typed 接口若声明 `host_only`，Manifest 的 consumes 也不能使其可调用；SDK 的依赖检查和调用都保留 plugin 消费者身份，传入另一个描述或调用选项不能解除限制。用户决定应交给产品的受保护入口处理。

生产 MCP 的新动作由用户在「能力 → 对外接入」按客户端与范围授权。界面从同一注册表读取名称、合同、权限和状态，新插件不需修改该页白名单。版本、提供方或权限变化不能继承旧授权；移除插件后保留原记录供撤销。默认开放的系统查询可以被单独撤销。目录注册不等于授权，也不自动授予组合动作的依赖。旧 `mcp_exports` 别名仍沿用原全局规则，不能用它们证明新动作授权生效。

需要等待模型、网络或材料处理的能力，可声明 `action.scheduling: "concurrent"`。这只适用于业务 owner 已使用短事务和版本/来源校验保证安全的处理器；Host 默认仍串行执行。调度方式从正式注册定义读取，调用方不能自行打开并发；Host 关闭时等待这些调用完成。使用可信 `ActionCallContext.signal` 取消，`on_progress?.({ stage, progress })` 回传传输进度；回调不是能力参数，也不替代需要持久保存的运行记录。

场景配置由插件自己的存储 owner 持有，`bindings` 返回真实引用，`bind` 检查配置写权限并持久化。Host 场景客户端提供发现、绑定、使用位置及执行接口；它不是所有旧插件已经自动迁移的承诺。可参考 [Inbox 场景](../../plugins/native/inbox/src/scenes.ts)、[正式 Runtime 注册回归](../../tests/action-service.test.ts) 和 [Host 场景集成](../../tests/inbox-action-scenes.test.ts)。

### 为事项提供上下文

需要让首页或其他消费者围绕插件对象发消息时，用 `defineSubjectContextAction(capabilityId, subjectKind, title, permissions)` 声明查询，把定义放入 Manifest 的 `actions`，并在 `start()` 返回对应处理器。处理器从插件自己的数据读取当前对象，以 `subjectContext({ subject: { kind, id }, revision, title, content, goal_ids, session_id })` 返回正文快照和真实关联。`goal_ids` 只填实际关联；没有明确 Session 时用 `null`，不能猜测或选择最近会话。正文超过上限会标记节选；转述其他对象时传入原 `truncated`，不要丢掉节选标记。

消费者使用 `resolveActionSubject(client, caller, subject)`，从同一个能力目录按语义类型与对象类型发现查询，并以原调用者、固定提供方调用。无需在 Home 增加插件白名单；合同不一致会在注册时拒绝，多个可用提供方则要求消除歧义。权限、安装 grant、停用及升级仍走共同服务。对象查询只提供事实，不授予消息发送权限；首页随后从 Work 目录选择关联会话，没有关联时要求用户明确选择。

这个协议负责读取已知对象的上下文；首页事件贡献和其他可执行动作仍须分别实现，不能把上下文声明当成自动创建首页事件。正式 Runtime 与原业务数据的验证见 [home-talk-actions.test.ts](../../tests/home-talk-actions.test.ts)。

首页与能力库的本地用户入口会读取原 Plugin Runtime 安装记录中的 grants；未知权限名不需要加入 Home 权限名单。仅已运行、身份匹配且实际授予所需权限的安装可扩展本地用户调用范围，权限绑定准确的能力版本和提供方，不能借给另一个只声明同名权限的提供方。停用、撤权、重启后重新读取当前状态；其他入口（包括 MCP）的独立授权不受影响。声明不等于安装授权，缺 grant 时仍不可用。真实 Web 接线见 [local-web-actions.test.ts](../../tests/local-web-actions.test.ts)。

### 为事项提供可执行动作

用 `defineSubjectOffersAction(capabilityId, subjectKinds, title, permissions)` 声明查询，将定义与处理器按常规方式注册。查询接收 `{ subject: { kind, id }, request_id }`，从自己的数据读取当前状态，返回 `{ offers: [{ offer_id, title, action: { capability_id, version }, input }] }`。`action` 指向本插件已经注册的能力，`input` 必须完整且符合该能力的输入合同；例如 Inbox 返回原状态动作和当前 `expected_revision`。已经完成或不适用时返回空数组，读取失败应报错，不能用空数组掩盖故障。

Home 从同一个能力目录发现查询，无需修改首页按钮名单。它固定查询与目标动作的提供方，检查输入和实际权限；点击后重新读取原查询，核对标题、动作和完整参数再调用。输入变化要求用户重新选择，不能悄悄执行新参数。查询不能借用另一个插件的能力；跨插件编排应由自己的组合能力通过共同服务明确实现。来源撤权、停用或目标缺失时拒绝执行。

准备查询不得写业务数据。原执行能力继续负责版本冲突、事务、幂等和恢复，可将 `request_id` 纳入自身幂等合同；Home 不会自动为任意业务操作实现去重。响应未知时首页保留原请求并禁止直接重发，重新读取只核对当前事项。对象变化或原动作消失并不证明上次执行成功；调用者仍须查看原业务结果。此协议不自动创建首页事件，也不替代对象上下文合同。

为规则声明候选动作时，给 `defineSubjectOffersAction` 的第五个参数传入 `[{ offer_id, title, action: { capability_id, version }, subject_kinds? }]`。选项 ID 在该查询内唯一；目标属于本提供方，不能声明别人的 `provider_id`。可省略 `subject_kinds` 以继承查询的对象类型，填写时必须是非空子集。实际返回同一个 offer_id 时必须兑现声明的目标版本和对象类型，不能临时换成另一项操作。

`home.actions.choices` 从当前授权目录派生这些声明，不调用对象查询、不执行操作；返回名称、来源、适用对象、固定 `key` 与能力可用状态。`home.actions.prepare` 在真实事项上准备输入，已声明选项附带相同的 `recommendation_key`。身份包括提供方、原查询与版本、offer_id、目标与版本；显示名称和当前输入不属于身份。更换提供方会产生新 key，同名不能继承。目录可用仅说明能力当前可访问，具体对象参数仍须通过 prepare 和执行前检查。该 key 可作为规则映射中的稳定值，不能把裸 offer_id 当成跨插件身份。

Home 判断与规则编辑器使用这些 key。选择项目后，首页规则的动作选项来自该项目的授权目录；Choice 的自定义结果或 Noul 的 true/false 可通过 scene_map 对应到选项 key。判断动作须在 suggested_behavior_ids.items.enum 声明完整的可能结果；场景声明 recommendation_source: "subject-offers"，共同服务在发现、绑定和运行时检查每个引用。不能以任意字符串输出代替完整声明。

Home 判断前会读取原对象、准备其实际可用动作，并把当前选项传给规则；不存在可推荐动作时不调用模型。结果只接受当次准备的选项，保存前重查对象、动作参数、绑定和权限。建议显示时再次校验，停用、撤权或原输入变化后保留历史、撤回建议。规则编辑器保留失效映射并说明不可用，不会因编辑其他字段而清除引用。未声明的动态按钮可继续由用户手动执行，但不会进入规则候选目录。其他旧场景的作者目录仍在迁移，不能把首页接通视为全部工作流或场景已完成。

完整例子见 [Inbox 动作](../../plugins/native/inbox/src/actions.ts)；未知插件正式注册、真实写入、失效拒绝及 MCP 共用执行测试见 [home-offer-actions.test.ts](../../tests/home-offer-actions.test.ts)，浏览器真实执行见 [home-offers.e2e.test.ts](../../tests/home-offers.e2e.test.ts)。

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

### 首页事项

用 `defineHomeEventsAction(capabilityId, subjectKinds, title, permissions)` 声明事项查询，并把定义与处理器注册到同一套 `actions`。查询接收 `{ from, to, now }`，均为带时区的时间字符串；窗口含 `from`、不含 `to`，`now` 位于窗口内。处理器先调用 `assertHomeEventWindow` 检查窗口顺序，再用 `withinHomeEventWindow` 筛选普通事项。处理器读取插件自己的原记录，返回 `{ source: { surface, title, icon }, events }`，不要另存一份首页数据。

每条事项包含稳定的 `event_id`、原对象 `subject: { kind, id }`、`occurred_at`、标题/摘要/正文、`facts` 二元字符串数组、`category`（`personal` 或 `organization`）和 `needs_attention`。`placement: occurred` 按发生日显示；`active` 把窗口外仍未处理的旧事项放到今天；`today` 始终放到今天。处理完成的记录应由提供方撤回。对象类型须在声明中列出，同一查询不能返回重复 `event_id`；Home 会再按提供方与查询能力隔离身份，避免不同插件互相覆盖。

`open` 可为 `null`，或 `{ kind, surface, id, title, label }`。`item` 打开原对象，`group` 打开所属页面的分组，`surface` 打开页面且 `id` 必须为 `null`。目标必须是实际存在、由产品 UI 支持的页面或对象；它不表示执行业务操作，也不授予目标权限。Home 点击前通过 `home.events.open` 重新读取原查询，核对目标没有改变且提供方仍可访问。分组页面通过现有 DOM 事件 `workbench-open-group` 接收 `{ surface, id }`，由页面自己的控制器处理。

事项、上下文和可执行动作是三种不同查询，按需求分别注册。提供事项不会自动生成上下文或写操作。Home 的 `home.events.read`、内部调用及 MCP 都使用同一目录、调用者和原始处理器；单个来源失败时只撤回该来源的事项并显示错误，停用或撤权后的下一次读取不会保留旧事项。插件内容更新在 Home 重新读取时反映；当前页面可见时每 30 秒查询一次，已接入的产品变更也会触发刷新。

验证：[home-event-actions.test.ts](../../tests/home-event-actions.test.ts) 覆盖正式 Runtime、权限、导航变化和原业务记录；[home-events.e2e.test.ts](../../tests/home-events.e2e.test.ts) 覆盖未知插件在实际首页提供自己的事项、上下文和执行结果。

### 首页判断的对象上下文

`home.judgment.evaluate` 接收 `{ subjects: [{ kind, id }] }`，通过对象上下文合同读取原记录，不要求对象存在于 Feed 或 Inbox。提供方仍须注册 `defineSubjectContextAction`，调用者仍须拥有该查询所需权限。首页绑定接收满足输入/结果合同的判断；规则的 `subject_kinds` 非空时只用于其中列出的对象类型，为空时作为通用文本判断。批量请求在调用模型前检查全部对象；尚未提供上下文、权限不足或规则对象类型不符时拒绝调用。

判断使用原标题和正文（上限 8000 字符），在保存结果前再次读取并核对来源、版本、内容及绑定。`home.recommendations.read` 从当前项目与场景的原历史取得每个对象的最新记录，再按当前权限和内容核验；对象撤回、完成、改动或读取提供方变更后，不继续显示旧建议。事项读取本身不会自动启动模型调用。插件若需要业务事件触发判断，应通过已有场景调用接口在真实事件后触发，并保留原调用者身份。

本段只统一判断的对象接入。首页结果仍受现有推荐选项合同约束，不能把任意新 `offer_id` 当成已支持的判断选项；推荐选项和规则编辑器的动态接线仍在迁移。对象接入、具体动作准备和判断选项是独立的合同，目录出现名称不代表三者已经全部具备。

验证：[home-action-scenes.test.ts](../../tests/home-action-scenes.test.ts) 使用正式安装插件的独立 SQLite 记录，检查实际判断历史、首页建议、读取权限、版本变化、来源替换及旧绑定迁移。

判断编辑器的 Agent 用途直接读取当前授权目录中带 `agent` 或 `mcp` audience 的能力，无须声明旧 MCP 名称或增加作者白名单。能力引用同时包含 ID、版本和提供方；Choice/Noul 的可选结果映射保存该引用，调用返回 `recommended_actions`。调用者仍须根据业务输入合同构造参数，再通过共同服务单独调用。推荐不执行、不授权；发布和判断前后检查来源与授权，失效引用保留。旧连接凭据本身不代表可调用能力，只有正式注册动作才进入目录。
