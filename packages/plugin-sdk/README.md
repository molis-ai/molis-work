# Plugin 作者接口

帮助 Plugin 作者声明 Manifest、生命周期和 UI/Artifact 接口，用公共协议对接 Molis Work。

包名：`@molis-ai/molis-work-plugin-sdk`。工作区内部包，通过仓库构建和 Host 装配使用。

## Home 插件服务

SDK 导出 `PluginDatabaseDeclaration`、`PluginDatabase`、读事务接口和 SQL 值类型。可信 Home 目录声明当前库基线，Host 绑定路径和安装授权；业务查询归插件，写入使用 `database.transaction(caller.beforeEffect, tx => …)`，事务回调不能异步。Home 激活的 `context.provider_id` 是插件 ID，`install_id` 仍是安装身份。

`services.artifacts` 是可选的：Home 没有项目成果服务，项目插件使用前应明确要求。HTTP 转动作时 `bindPluginActionRoute` 保留取消、授权复查与带来源的页面上下文，版本冲突返回 409。详见 [Home Runtime 合同](../../docs/platform/PLUGIN-DEVELOPMENT.md#个人-home-runtime-与插件-sqlite)。

## 一次典型调用

definePlugin 校验定义；definePollingIntegrationPlugin 把 Provider port 组合成 Connector Driver 与 Raw Event → Signal Adapter：插件只启动一次，`createProvider(context, binding)` 在每个来源绑定时被问一次，来源之间的差别（连接、凭据引用、配置）以引用的形式随 binding 给，不含密钥。Manifest 的 `connection_services` 与 `integrations` 声明插件接触的服务和对它做的事，形状由 `integrationDeclarationProblems` 检查（PG-046）。Host 通过 context.services 提供私人存储、Artifact 和 UI 客户端，作者不需要访问数据库。

`context.services.artifacts.publish/read` 是同步接口，由 Host 根据 Manifest 自动注册到同一动作 Kernel；作者只提交成果正文和固定版本。项目、用户、生产者签名及安装身份均由 Host 绑定，不能通过参数覆盖。声明所需 `artifact:read/write` 和 `artifacts.produces/consumes` 后，Runtime 授权才使接口可用；停止或崩溃后的旧客户端不能继续操作。Inputs/Outputs 同样经这个接口交换固定版本，无需另注册一套成果读写或维护 Host 名单。 `artifacts.listConsumable()` 返回当前安装可消费的所有固定版本摘要；`processItems.head/readOwn` 读取本插件同签名、同个人 owner 的过程版本供恢复使用，即使归档或内容失效也可读取自己的记录。这些项目服务需要 `artifact:read`，Home 执行器尚不提供。

公开业务能力放入 Manifest `actions`，从 `start` 返回对应 `actions` 处理器。已有 HTTP 入口可用 `bindPluginActionRoute(context, definition, request => input, routeId?)` 转发；仍需声明原 `routes`。这个适配器只转换参数/HTTP 结果，实际执行经过同一 Kernel 的 schema、项目策略和权限检查，禁止缺少动作服务时直调业务兜底。`context.services.actions` 调本插件声明的公开动作时绑定当前本地入口用户；另外，Manifest 在 `capabilities.consumes` 里写了宿主自己登记的动作 id 时（现在是工作区的两个读 `projects.workspace.files.read` 与 `projects.workspace.git.inspect`），它也能调这一个动作：按插件受众、用插件自己的 grant（要在 Manifest 里声明并持有该动作的权限，这两个是 `workspace:read`）、只放行写明的那个动作，受众、可用性与入参 schema 照常检查；别的插件的动作、没写进 `consumes` 的动作一律拒绝。`consumes` 非空的插件就有这个客户端，自己没有动作的插件也一样；`consumes` 为空而又没有自己的动作时没有。整份文件（`kind: "bytes"`，图片与 PDF 预览）只给宿主运行的这类插件：宿主按调用里由它确认的插件身份判断，生成（沙箱）插件以插件受众调用也没有这个身份，会被拒绝。它在停止、崩溃或启动失败后失效；外部 MCP 使用自己的逐客户端授权，不能借用此客户端冒充本地用户。私有同步成果 SDK 不通过这个异步入口递归调用。

存量处理器仍依赖固定用户的私人存储/成果 SDK 时，可用 `bindOwnerPluginAction` 明确限制真实调用者与 owner 一致。它返回可解释的不可用原因，不把 MCP/Agent 身份改为启动用户。处理器拿到 `beforeWrite()`，必须在外部等待后、保存之前调用；它重查原授权、项目启停、Runtime grant 和取消，并复用原 invocation 的 `beforeEffect` 与同步尾检，目录中的新登记不能替旧调用授权。此适配用于渐进迁移，不能据此宣称跨调用者接线完成；新业务处理器应直接以可信 `ActionCallContext` 处理归属。

调用宿主动作后仍要创建审阅等副作用时，把原调用的控制（含 `beforeEffect`）放在 `services.actions.invoke(definition, input, control)` 的第三个参数中。动作服务为处理器提供 `beforeEffect()`，服务在实际副作用前调用；它检查原授权、注册实例和调用是否仍有效。回调不是业务 input，不能接收自 HTTP/MCP JSON、序列化或保存在审阅记录中。审批后的实际执行继续由 Review owner 自己校验，不能复用已经结束的调用上下文。

`context.services.actions.availability(reference)` 只读检查 Manifest 已声明消费的宿主动作及版本（R8 删掉了 typed 的 `services.capabilities`，宿主动作与别的动作一样经 `services.actions.invoke` 调）。它查询同一个 Host 注册表，不执行 handler，也不打开项目实例；未声明、缺失或无法检查均有明确原因。它不代表给定参数必能执行，不替代实际调用的权限、目录及异步策略检查。`bindOwnerPluginAction` 的第四个参数可填写该动作必需的宿主能力引用，目录、调用和 `beforeWrite` 会共用检查。不要将所有可选消费能力一律当成每个动作的依赖，也不要将此旧 SDK 检查替代公共动作的 `required_actions` 权限依赖。

嵌入其他插件的界面时，在 `ui.embedded_plugins` 声明其完整 Plugin ID。已启用父插件和其传递嵌入关系共用目录可用性规则，移除最后一个父入口后子能力也变为不可用；单独启用子插件仍有效。声明只表明使用关系，不安装新导航项、不授予调用权限，也不猜缺失插件。不要在 Host 再维护嵌入白名单。当前内置项目组合已使用该声明；第三方加载、通用场景和全部旧路由迁移仍以总迁移清单为准。

`services.actions.invokeQuery(reference, input)` 是正在执行的 Runtime 动作读取另一个插件 query 的入口。Host 从当前动作获取原 actor、项目、audience、精确 allowed refs 与动态权限，再与来源插件的 consumes、Manifest 权限和当前 grants 取交集；不借本机 owner 身份补权。引用带 capability_id/version，可固定 provider_id；缺失、歧义、command、结束后的 scope、另一安装及等待中撤权/停用均拒绝。目标的内部 query 仍需原 caller 授权，后代不能转 command。只在需要该内容的分支调用，不用 required_actions 把文本分支也绑到另一个插件；本插件普通 invoke 仍保留原自主消费语义。模型返回的 text/数据写入前仍须执行该返回值的 validateResult（如有），query 委托不替代模型结果检查。

## 错误：一个模型

一个错误是一个码、一句消息，可选一个 kind 和 details。码说明它是谁的：`<主人>.<原因>`，主人的名字开头（`actions.` 是平台自己的，插件不能用）；kind 说明它是哪一种失败（`invalid`、`forbidden`、`not_found`、`conflict`、`too_large`、`rate_limited`、`cancelled`、`internal`、`upstream`、`unavailable`、`timeout`）；HTTP 状态只由 kind 推出，插件不自带状态表。插件用 `defineErrorCodes("notes", { not_found: "not_found", stale: "conflict" })` 把自己的码一次声明好，抛 `notesErrors.not_found("找不到这条笔记")`；平台自己的码（`actions.missing`、`actions.plugin_disabled` 等）在合同的 `ACTION_ERROR_KINDS` 里一码一行，已经有 kind。`actionHttpStatus`、`actionErrorBody`、`actionErrorResponse` 给出状态和统一的响应体 `{ error, code, details? }`（Host 的 Native 插件 HTTP 分发器不传 `mapError` 时，Functions、成果入口与 Host 的几个入口（W3-02 G2）、本包的 `bindPluginActionRoute`（`src/routes.ts`）和 Plugin Runtime 路由器自己的拒绝都这样答；还没换的是仍带 `mapError` 的 Native 入口，见 [Plugin 开发 · 错误](../../docs/platform/PLUGIN-DEVELOPMENT.md#错误码kind-与状态)）；`actionErrorFromResponse` 把响应还原成同样的错误。错误一律按形状读（有 `code` 和 `message`），不用 `instanceof`：Runtime 包和创作台页面里可能有另一份 `ActionError`。有码但没人给 kind 的错误按调用者的错误处理（400），没有我们的码的错误（没有码、码不是 `<主人>.<原因>` 的写法如 `ENOENT`、不是 Error）按内部失败处理（500），响应体的码是 `actions.execution_failed`，原来的码与 details 不带出去。

可用性拒绝可以给 `kind`。`bindOwnerPluginAction` 在开始时的依赖检查、以及命令写入前重读自己登记的可用性时，都把这个分类与原码、原因一起抛出；无 kind 的拒绝仍按共同规则处理。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | definePlugin、轮询 Integration helper 与公开类型 |

可对照现有调用方 [examples/plugin-sample/index.mjs](../../examples/plugin-sample/index.mjs) 阅读装配方式。

## 接入与边界

SDK 不包含 Runtime 或业务 Store。Manifest 解析与版本比较、动作与 Agent 与方法的声明检查都是 SDK 自己的规则：`parsePluginManifest`、`comparePluginVersions`（`src/manifest.ts`）和 `inspectActionDeclarations`（`src/action-declarations.ts`；`defineAction` 当场用它检查，内核注册动作时用的也是它），SDK、内核、Plugin Runtime 和命令行共用这一份，不另写第二套。四种来源协议（搜索、片段动作、文件、放置）的细则在 `src/source-declarations.ts`，Agent 与方法的检查在 `src/agent-declarations.ts`，端口与事件的检查在 `src/wiring-declarations.ts`，都只有 `parsePluginManifest` 与 `inspectActionDeclarations` 调用，不对外导出；成果类型的声明规则在 `src/artifact-declarations.ts`（写法见 [成果类型声明](../../docs/platform/PLUGIN-DEVELOPMENT.md#成果类型声明)），也由 `parsePluginManifest` 在同一次解析里检查，所以 `definePlugin`、命令行 `validate`/`create`、Runtime 安装和本地开发加载都会拒绝没有显示名或预览的成果类型；这些检查的文案与先后顺序是作者读到的内容的一部分，`tests/plugin-declaration-rules.test.ts` 把它们逐条锁住。授权的实际执行由 Host/Runtime 控制。把动作挂到 HTTP 路由上的 `bindPluginActionRoute`、把动作限定在本机所有者名下的 `bindOwnerPluginAction`（`src/routes.ts`）也是 SDK 自己的实现：路由按失败的 kind 给状态（状态数字只在 `src/errors.ts` 一处），不再带合同包里的那张状态表。有界的逐行文本比较（`compareTexts`、`splitLines`、`textDiffRow`、`alignSplitRows` 等，`src/text-diff.ts`）也在这里：工作台的 Agent 审查界面、Coding 和 Diff 取同一份，比较结果与行的类型（`TextDiff`、`TextDiffRow` 等）留在合同包的 `modules/workspace-artifacts`；把比较画成页面的 `/diff-view` 子路径（见下文）用的也是它。当前工作区包是 private，不能把包名当作已经发布到 npm 的承诺。插件对外的能力就是它声明的动作，MCP 名称与授权都在 Host。步骤见 [Plugin 开发 · 对外 MCP](../../docs/platform/PLUGIN-DEVELOPMENT.md#对外-mcp)。

Manifest、定义与 Runtime 拒绝共用 `ActionError`；作者捕获 SDK 导出的 `ActionError` 并检查现行 `plugin.*` 码。原因声明 `pluginErrors` 在 contracts 的 `platform/plugin` 公开子路径，SDK 与 Runtime 读取同一份；不再导出 Manifest、Definition 或 Runtime 专有错误类。

工作区依赖：只有 `@molis-ai/molis-work-contracts`。Plugin SDK 属于公共发布面（外部作者装的只有 contracts 与 SDK），不依赖任何私有包：边界规则 `public-sdk-private-dependency` 在 `pnpm boundary:check` 里拦住（源码 import 与 `package.json` 声明的依赖都查），`tests/plugin-sample.e2e.test.ts` 只用打包后的 contracts 与 SDK 离线安装，在本机再兜一层。`createExecutionLifetime`（及 `ExecutionLifetime`、`ExecutionLifetimeOptions`）是 SDK 自己的实现（`src/execution-lifetime.ts`），不是转出；SDK 同时是平台自己的公共运行时底座：内核、宿主、调度服务、Shelf 模块和沙箱都直接从这里取，所以改它按共享核心对待（要跑全量）。第三方运行依赖只有 `/rich-text` 子路径要的 `marked` 与 `sanitize-html`，写成可选 peer 依赖：作者的项目只装 contracts 与 SDK 就能离线装好，用 `/rich-text` 的插件自己加这两个依赖（工作台、Coding 就是这样）。见 [package.json](package.json)。

可从[本地 Plugin 示例](../../examples/plugin-sample/README.md)开始：示例使用 context.services 存取私人状态、发布 Artifact 并注册 UI，完整授权和开发步骤见开发指南。

沙箱 Manifest 的唯一生成模块是 SDK 的 `sandbox-manifest`（由根入口具名导出）：`sandboxPluginManifest` / `sandboxIntegrationManifest` 生成平台认可的形状，`effectsFromContract` 合并并排序操作的效果，`sandboxDerivedPermissions` / `sandboxRequestedPermissions` / `sandboxOperationPermissions` 分别派生资源形状、整包实际请求与单次操作权限；read/write 形状不把只读操作变成写授权。创作台、Host reader 与 CLI 使用同一实现。整页呈现的协议标识 `PLUGIN_PRESENTATION_CAPABILITY` 来自 contracts 的 `platform/ui`；渲染器实现仍属于 design-system。

schema/API 2 的 Integration Manifest 用 `source_presentations` 声明纯展示；`definePollingIntegrationPlugin` 的 `presentSource(id, input)` 只收展示 id 与普通数据，不接收启动 context 或来源 binding。输入只含可选 cursor，返回只含可选 `scope_options`、`conditional_request`、`home_url`（可为 null），由同一 `checkedSourcePresentationInput` / `checkedSourcePresentation` 检查。沙箱展示固定 query、`effects: {}`，不取得拉取的连接效果。回归：`tests/integration-registry.test.ts`、`tests/sandbox-integration.test.ts`。

签名 app 包的原始清单使用 `parsePluginPackageManifest` 校验；验签后由 `sandboxAgentDeclarations` 唯一派生纯文字角色与空工具方法，启动时用 `assertSandboxAgentDefinition` 核对同一限制。`sandboxAgentBodyIdentity` 保留完整 plugin/kind/name 身份；派生数字版本不代替签名包的完整版本。包内正文格式与上限见[插件开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#沙箱包格式与安装)。这些文字只作为有来源的不可信材料，不授予执行权限。

## 富文本子路径 `/rich-text`

`@molis-ai/molis-work-plugin-sdk/rich-text` 的 `renderRichText`、`richPlainText` 要用 Markdown 解析器和 HTML 消毒器。SDK 把这两个包写成可选 peer 依赖，不替你装：用这个子路径的插件在自己的 `package.json` 里加 `marked@^18.0.11` 和 `sanitize-html@^2.17.7`（范围与 SDK 的 `peerDependencies` 相同；TypeScript 项目另加开发依赖 `@types/sanitize-html`）。没加就导入 `/rich-text`，加载时会报找不到模块；SDK 根入口和 `/highlight` 不加载这两个包，不用装。工作台和 Coding 声明的就是这两个范围，`tests/plugin-sdk-subpaths.test.ts` 核对 README、peer 范围与仓库里每个导入 `/rich-text` 的包一致。

## 比较视图子路径 `/diff-view`

`@molis-ai/molis-work-plugin-sdk/diff-view` 把一处改动画成页面上的比较视图，Diff、Coding 和第三方插件用同一份（PG-062）。输入是通用的改动：`compareChange(group, sides, { before, after, created?, removed? })` 比两份全文，`compareHunks(group, sides, diff, …)` 读一段 unified diff，`emptyDiffView` 给还没有内容可比时的空态；得到的 `DiffView` 交给 `renderDiff({ view, labels, primitives, line_feedback?, fold_context?, sides? })` 画成 html。`parseUnifiedDiff`、`hunkRows`、`countChangedLines`、`unifiedPatch`（把画出的行写回可复制的补丁）也从这里取。

- SDK 不带词。每个标签（两侧的标题、各条提示、行号上的评论按钮、行首符号的读屏文字、展开折叠的那一行）用调用方自己词表里的哪个键，由 `labels`（`DiffViewLabels`）给：`before`、`after` 填 `{path}`、`{version}`，`pinned` 填 `{workspace}`，两个评论标签填 `{number}`，`reveal` 填 `{count}`。头部的三个只在画头部时需要（`sides` 不为 false），不给就不画头部。
- 转义、文字和图标都由调用方传进 `primitives`（`escape`、`text`、`icon`），SDK 自己不转义、不翻译、不画图标。插件一般传 SDK `/ui` 的 `escapeHtml`、`icon`，`text` 用 `diffViewText(messages, locale, templates)` 从自己的词表里取：带值的句子（包括 `parseUnifiedDiff` 拒绝时的三句）把键列进 `templates`，视图里写成中文的这类句子会先认出是哪一句，再按页面语言带着同样的值说出来。插件有自己的翻译函数时作为第四个参数 `say` 传入。词表照常在插件自己的 `messages` 里登记（翻译门禁要求每个键归它的主人）。
- 这个子路径只加载 SDK 自己的文件和合同包，不需要任何第三方包；页面上的行号评论（`data-coding-line-side`、`data-coding-line`）、折叠（`data-diff-unfold`、`data-diff-folded`）与切换文件（`data-action="diff.show-file"`）这些属性的名字是合同的一部分，工作台的页面脚本按它们找元素。
- 改动来自哪里、怎样合并多次写入（例如 Coding 的净改动）是插件自己的事，SDK 只比较和画。`tests/plugin-sdk-subpaths.test.ts` 的 PG062-08 核对只加载合同包，PG062-10 核对仓库里只有这一份比较和画法。

## 界面部件子路径 `/ui`、`/browser`、`/page-globals`

插件画界面的部件由 SDK 公开，内置插件、创作台生成的插件和第三方插件用同一套（PG-055，2026-10-18「插件同等待遇」）；插件不再 import 私有的 design-system（边界规则 `plugin-private-ui-dependency`，只有创作台例外）。

- `@molis-ai/molis-work-plugin-sdk/ui`：纯字符串部件，数据进、HTML 出，不碰 DOM、不依赖任何包。`icon(name)`（名字表是 `PluginIconName`，一份名单，design-system 的图标表按它逐个画）、`renderPluginStageShell`（插件整页舞台的外壳）、`renderButton`、`renderStateRing` 与 `renderStatusMark`、`renderBadge`、`renderEmpty`、`renderAlert`、`renderToast`、输入类（`renderInput`、`renderField`、`renderCheckbox`、`renderSelect`、`renderSwitch` 等）、`renderCalendar` 与 `renderDatePicker`、目录与侧栏（`renderDirectoryPanel`、`renderDirectoryRow`、`renderSidebar` 等）、`processFold`（折叠样式文本）。`icon()` 只写一行引用 `<use href="#icon-名">`，图形在宿主页面带的图标雪碧图里，所以 SDK 不带图形数据。
- `@molis-ai/molis-work-plugin-sdk/browser`：会被打进插件自己页面包的 DOM 工具，没有 import、不碰 Node。`placeFloating`、`placeOverlay`、`pinAt`（浮层放哪里）、`followScroll`、`scrollShouldFollow`（跟随滚动）。
- `@molis-ai/molis-work-plugin-sdk/page-globals`：宿主往每个插件页面注入的全局（`window.molisReflow`、`molisShowMore`、`molisMediaZoom` 等）与页面端口（`InteractionClient`、`Reflow` 等）的类型。插件的浏览器文件用 `import type {} from "@molis-ai/molis-work-plugin-sdk/page-globals"` 纳入，运行时什么也不加载。
- 标记和类名是合同：部件写出的 `mw-btn`、`data-slot`、`data-work-surface` 等由宿主的样式表和页面脚本定义，一个类名都不能没有规则。`tests/sdk-ui-markup.test.ts` 把每个部件用典型输入渲染一遍，收集类名，逐个核对宿主样式表里有规则（RAC-551）；公开形状进 `tooling/gates/api/plugin-sdk/` 的快照，改它走 `pnpm api:update` 并在 PR 里写对插件作者的影响。
- 伙伴页面舞台（Files、Git、Diff、Text Stats 嵌进 Coding 页的那种）不在这里：四个插件各自用上面的部件写自己的舞台。

## 动作与判断消费场景

`defineAction` 让同一份定义用于 manifest 的 `actions` 和运行实例的 `actions` 处理器。`action_scenes` 描述消费场景，运行实例的 `action_scenes` 提供 `bindings`、`bind`、`consume`；Runtime 激活时检查声明是否全部兑现。身份、输入输出、权限和作用域来自 contracts/platform/actions，声明本身不授予权限。

`bind`、`consume`、`failed` 接收真实 `ActionSceneExecutionContext`。异步等待后、写入前调用 `await caller.beforeEffect()`，再原子核对 owner 的对象版本；它重新检查原调用者、取消、场景与判断注册及权限，回调返回或抛错后不能继续写入。`bindings`、`targets`、`prepare`、`availability`、`configuration_availability` 是只读回调，允许普通查询及查看原授权目录里的判断/写动作元数据，拒绝直接写入、嵌套写动作和付费查询；宿主从已注册目标读取操作与费用，不接受插件自报的替代值。场景经 `services.actions` 发起嵌套调用时仍保留原场景控制。场景不是动作，不取得模型、后台执行或动作专属查询委托的资格。

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

读取旧绑定时缺少 `provider_id`，共同服务会保留使用位置并标记不可用；不能根据当前目录替它猜一个来源。插件自己的持久化适配必须保存服务返回的完整引用，包含提供方和版本。

当触发事件和判断输入不同，用 `event_schema` 描述事件参数、`prepare` 读取实际业务对象并返回 `{ input, state }`。`input` 满足场景的 `input_schema`，`state` 是消费方私有快照。`consume` 的第四个参数包含本次绑定和私有状态；消费方须核对业务对象版本后落地，不能把模型结果直接当作写入授权。Host 会在准备后和判断后检查绑定修订、提供方实例及实时策略。场景可用 `failed` 显式消费判断失败；失败消费同样经过这些检查。已准备的上下文不满足函数输入合同也可进入该失败路径，事件参数校验或对象读取失败则直接拒绝。失败记录应标明需要人工处理及错误码，不能伪装成功或自动重试。

依赖判断绑定才能执行的动作可声明 `action.required_scene: { scene_id, version }`。LocalHost 的目录与排队执行检查会读取实际绑定，显示缺配置、提供方失效或合同不兼容。此依赖是入口可用性要求，实际触发仍须调用同作用域 `ActionSceneClient.runScene`，不能据此绕过绑定与结果校验。

依赖其他动作的组合能力可声明 `action.required_actions: [{ capability_id, version, provider_id? }]`。Kernel 在同一注册目录递归检查依赖，LocalHost 补充实际安装和连接状态；发现与执行共用这些检查。固定版本和提供方不会静默替换，缺失、权限不足和循环依赖均不可执行。声明不会自动授予依赖权限，也不会替你调用依赖：处理器仍通过同作用域 ActionClient 使用原调用者上下文。只声明执行必需的能力，不把可选增强列成强制依赖。

授权上下文由可信 Host 传入。除权限集合外，`allowed_actions` 可以将调用限制到准确的能力 ID、版本和提供方；旧 `allowed_capability_ids` 不能扩大该限制。组合处理器调用其他能力时保留原上下文，不重新拼一份权限更大的 context。`validate_authority` 是 Host 在实际分发前调用的授权检查回调，处理器不能删除或替换它来绕过撤权；它不是业务输入，也不写入任务 JSON。长期后台任务仍需由业务 owner 接入自己的取消和生命周期规则。

组合能力触发嵌套动作或场景时，可使用 contracts 的 `retainActionAuthority(caller, ownDefinition, caller.beforeEffect)` 保留发起动作的精确授权校验与副作用检查。正在执行的动作可省略 `provider_id`，平台使用本次分发解析出的提供方；其他动作必须明确提供方。它原样保留项目、调用者、权限和取消信号，不授予权限。等待后的副作用边界仍需调用该上下文的 `validate_authority`；共同场景在消费结果前执行此校验。事件队列必须只消费本次操作拥有的事件，不能拿当前调用者去排空其他来源的待处理事件。

`user_action` 由受保护 Host 渠道注入，表示真实用户操作的出处，不能由插件或模型根据文本构造。它不单独授予操作权限。Goals 决定只走现行动作与独立用户权限，插件开发不提供 typed 入口。SDK 的依赖检查与调用始终保留真实插件身份；Manifest consumes、复制的描述符或调用选项不能恢复已删除入口，用户决定交给产品的受保护入口。

生产 MCP 的动作由用户在「能力 → 对外接入」按客户端与范围授权。界面从同一注册表读取名称、合同、权限和状态，新插件不需修改该页白名单。版本、提供方或权限变化不能继承旧授权；移除插件后保留原记录供撤销。默认开放的系统查询可以被单独撤销。目录注册不等于授权，也不自动授予组合动作的依赖。

需要等待模型、网络或材料处理的能力，可声明 `action.scheduling: "concurrent"`。这只适用于业务 owner 已使用短事务和版本/来源校验保证安全的处理器；Host 默认仍串行执行。调度方式从正式注册定义读取，调用方不能自行打开并发；Host 关闭时等待这些调用完成。使用可信 `ActionCallContext.signal` 取消，`on_progress?.({ stage, progress })` 回传传输进度；回调不是能力参数，也不替代需要持久保存的运行记录。

场景配置由插件自己的存储 owner 持有，`bindings` 返回真实引用，`bind` 检查配置写权限并持久化。Host 场景客户端提供发现、绑定、使用位置及执行接口；它不是所有旧插件已经自动迁移的承诺。可参考 [Inbox 场景](../../plugins/native/inbox/src/scenes.ts)、[正式 Runtime 注册回归](../../tests/action-service.test.ts) 和 [Host 场景集成](../../tests/inbox-action-scenes.test.ts)。

### 为事项提供上下文

需要让首页或其他消费者围绕插件对象发消息时，用 `defineSubjectContextAction(capabilityId, subjectKind, title, permissions)` 声明查询，把定义放入 Manifest 的 `actions`，并在 `start()` 返回对应处理器。处理器从插件自己的数据读取当前对象，以 `subjectContext({ subject: { kind, id }, revision, title, content, goal_ids })` 返回正文快照和真实关联。`goal_ids` 只填实际关联，不能猜测。正文超过上限会标记节选；转述其他对象时传入原 `truncated`，不要丢掉节选标记。

消费者使用 `resolveActionSubject(client, caller, subject)`，从同一个能力目录按语义类型与对象类型发现查询，并以原调用者、固定提供方调用。无需在 Home 增加插件白名单；合同不一致会在注册时拒绝，多个可用提供方则要求消除歧义。权限、安装 grant、停用及升级仍走共同服务。对象查询只提供事实，不授予消息发送权限；首页随后从 Work 目录选择关联会话，没有关联时要求用户明确选择。

这个协议负责读取已知对象的上下文；首页事件贡献和其他可执行动作仍须分别实现，不能把上下文声明当成自动创建首页事件。

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
node scripts/run-tests.mjs tests/plugin-authoring.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：面向插件作者的稳定 API、UI 扩展类型与测试入口，以及作者和平台共用的运行时工具：执行生命周期（`createExecutionLifetime`）、Manifest 解析与版本比较（`parsePluginManifest`、`comparePluginVersions`）、动作声明检查（`inspectActionDeclarations`，逐个动作的形状）和同一次注册里的交叉引用检查（`inspectActionCrossReferences`，撤销、后台任务、片段与事项选项、结果对象，见 `src/action-cross-references.ts`；查 schema 里的路径用不对外导出的 `src/schema-paths.ts`）；端口与事件、Agent 与方法、四种来源协议、成果类型的检查（每个产出类型有显示名和本插件的预览查询，固定要配比较，继续指向本插件的命令；v1 不能产出成果类型）分别在 `src/wiring-declarations.ts`、`src/agent-declarations.ts`、`src/source-declarations.ts`、`src/artifact-declarations.ts`，不对外导出；动作的两个绑定函数（`bindPluginActionRoute`：HTTP 路由兑现动作，失败按 kind 答；`bindOwnerPluginAction`：动作只对本机所有者开放，`src/routes.ts`）；有界逐行文本比较（`compareTexts`、`splitLines`、`joinLines`、`reconstructSides`、`textDiffRow`、`alignSplitRows`、`DIFF_STEP_BUDGET`，`src/text-diff.ts`；CRLF 与 LF 是不同的行，超过步数预算时退化为整块删加整块插入，结果仍然完整）；Git 工作树状态的读法（`parsePorcelainStatus` 读 `git status --porcelain=v1 -z --branch` 的输出，`src/git-porcelain.ts`；宿主的工作区 Git 服务和 Git 插件读的是同一份，重命名占两条记录、七种未合并字母对都算冲突，越界或带控制字符的路径抛 `git.path_unsafe`，读不懂的记录抛 `git.status_unreadable`）；问卷的读答与检查（`questionAnswer` 把共享问卷卡的字段值读成答案（字段按题型命名：`q`/`t`/`n`/`d`/`w` 加题号，名字只是读法，答案对不对以问过的题为准），`questionProblems` 按问过的题逐题给出原因，`questionSetFlaw` 检查一组题本身，`QUESTION_LIMITS`，`src/question-answers.ts`、`src/question-rules.ts`）：不经 Agent 运行、自己先问人的插件（结果形状是合同的 `InteractionRequest`）用它，规则与 Prologue 的 `validateQuestionnaireAnswer` 同结论，由 `tests/question-rules-consistency.test.ts` 锁住；操作卡的判断规则（`draftActionCard`、`runActionCard`、`dismissActionCard`、`sweepActionCard`、`cardSubject`，端口 `CardStore` 与 `CardAuthority`，`src/action-cards.ts`；卡上控件的值读成输入用的字符串 `cardInputValues`、`instantIn`、`wallClockIn`，`src/card-values.ts`）：一张卡只按它显示的 revision 与精确引用执行一次，先认领再执行，过期、对象改过、能力不再提供都不执行，未知结果不当普通失败重试；助理与 Coding 各用自己的存储实现端口（specs/ai-interaction-experience D26），规则由 `tests/action-cards.test.ts` 锁住；整字截（`/whole-units` 子路径，`cutHead`、`cutTail`、`cutCharacters`、`exceedsCharacters`，`src/whole-units.ts`；一处规则，各处不再各自 `slice` 再补代理判断）与代码着色（`/highlight` 子路径，`codeTokens`、`growCodeTokens`、`diffRowTokens`、`codeLanguage`，`src/highlight.ts`）：零 import、每个函数自包含，页面可以把源码带进脚本，Coding 与工作台的助理用同一份；富文本（`/rich-text` 子路径，`renderRichText`、`richPlainText`，`src/rich-text.ts`）：GFM Markdown 加白名单 HTML，结果一律消毒，链接只留 http(s)；密钥脱敏（根入口的 `redactSecrets`，`src/redact-secrets.ts`）：外部文字交给模型或显示之前遮住常见的凭据形状。三样原来分别住在 Coding 和 Feed，2026-10-22 搬来（PG-062，`specs/coding-plugin/spec.md` §K），由 `tests/plugin-sdk-subpaths.test.ts` 锁住。比较视图（`/diff-view` 子路径，`emptyDiffView`、`compareChange`、`compareHunks`、`renderDiff`、`diffViewText`，`src/diff-view.ts`；unified diff 的读写 `parseUnifiedDiff`、`hunkRows`、`countChangedLines`、`unifiedPatch`，`src/unified-diff.ts`，错误码 `diff.unified.*` 的主人是 diff）：2026-10-23 从 Diff 插件搬来，Diff 与 Coding 的变更阅读器都用它画（PG062-08..10）。连接器 OAuth 声明共用的模板与取值规则（`/oauth` 子路径，`src/oauth.ts`：占位文法 `oauthPlaceholder`、地址与路径模板、请求头和值的写法、setting 值的规则、租户来源、JSON Pointer 转义、码点排序）：Manifest 解析里 `kind: "oauth"` 方法的形状检查（`src/oauth-declarations.ts`，不对外导出）和宿主的解释器（`apps/local-host/src/connector-oauth-declarations.ts`）读同一份规则，不各写一套（W5-11，`specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md` §2.1）；根入口不导出它们。
- 远程 MCP 的方法形状由 `src/integration-declarations.ts` 校验（字段见 [Integration 开发说明](../../skills/molis-plugin-dev/integrations.md)）；合法数据不授予安装准入或部署客户端资格，这两项由 Host 核对。
- 不负责：Host 内部实现、自动发布的市场。
- 公开入口：`@molis-ai/molis-work-plugin-sdk`（`src/index.ts`）、`@molis-ai/molis-work-plugin-sdk/highlight`（`src/highlight.ts`）、`@molis-ai/molis-work-plugin-sdk/rich-text`（`src/rich-text.ts`）、`@molis-ai/molis-work-plugin-sdk/diff-view`（`src/diff-view.ts`）、`@molis-ai/molis-work-plugin-sdk/oauth`（`src/oauth.ts`）、`@molis-ai/molis-work-plugin-sdk/whole-units`（`src/whole-units.ts`；`cutHead`/`cutTail` 按 UTF-16 单元、`cutCharacters`/`exceedsCharacters` 按字符，整字且不超限，零 import），都经 `dist` 导出，不深入 `src/` 导入；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`（公共发布面，只依赖它，不依赖任何私有包，规则 `public-sdk-private-dependency`）；`marked`、`sanitize-html` 是可选 peer 依赖（只有 `/rich-text` 加载它们），不进运行依赖，否则作者项目的离线安装要去取它们。方向：公开发布面（contracts、plugin-sdk）在最下层，其余各层都可以用它的运行时工具（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 版本比较按 SemVer precedence，预发布标识内的连字符完整保留（如 `alpha-a` 早于 `alpha-b`），build metadata 不改变先后。回归见 [plugin-semver.test.ts](../../tests/plugin-semver.test.ts)。
  - 项目、用户、生产者签名与安装身份由 Host 绑定，参数不能覆盖；停止或崩溃后的旧客户端不能继续操作。
  - `ActionExecutionPolicy` 描述提供方的时限、费用与频率；在 `action.execution` 声明，由 Kernel 执行，插件内不另写同一限额。
  - 动作适配只转换参数与结果，执行仍经同一 Kernel 的 schema、项目策略与权限；缺少动作服务时不直调业务兜底。
  - 处理器在外部等待之后、保存之前调用 `beforeWrite()`；owner binder 保留 owner、依赖、安装和 Runtime grant，最终复用原 execution fence，不能借新目录登记继续旧调用。
  - `availability()` 只读检查声明过的宿主能力，不代表给定参数一定能执行。
  - 包是 private，包名不等于已发布到 npm 的承诺。
  - 操作卡给人读的样子只有一份：`actionCardView`（`src/action-cards.ts`），助理和保管卡的插件都用它，插件再交给 `services.interaction.cardHtml` 画（PG-062）。
  - `/diff-view` 只加载 SDK 自己的文件与合同包，不带词；`renderDiff` 不自己转义、翻译或画图标，三样都由调用方的 `primitives` 给，每个标签用调用方自己的键（`labels`），仓库里只有它一份比较画法（PG062-08、PG062-10）。
  - 系统搜索的来源协议（`defineSearchEntriesAction`、`bindSearchEntriesHandler`）与 Host 用的是同一份合同，插件照此声明即可被搜到，不需要 Host 改名单。没有“查询时再搜”的来源（`defineSearchQueryAction` 已按决定 19 删除）。
  - 宿主自己运行的插件调模型用 `context.services.model`（类型 `PluginModelClient`、`PluginModelRequest`、`PluginModelResult`，限额 `PLUGIN_MODEL_LIMITS`），指令用 SDK 导出的 `defineInstructionPrompt`、`instructed`（W3-06 E）；插件在 `PluginDefinition.instructions` 里声明自己的指令，由 Host 在插件运行时统一登记，内置与安装的插件走同一条路。规则和错误码在 `packages/plugin-runtime` 与 `docs/platform/PROLOGUE-AI.md` 第 4 节，这里只导出类型和两个帮手。
  - 平台合同里给插件作者用的 `define…Action`、`bind…Handler`、`with…` 辅助函数都从这里导出：到期提醒、情境片段推荐、成果库的预览/固定/比较/继续/被引用、`withActionEffect`。新增一个辅助函数而没有导出，`tests/plugin-sdk-exports.test.ts` 会失败；确实不该给插件用的，在那个测试的 `NOT_FOR_PLUGINS` 里写明理由。
- 改了公开导出：`pnpm build` 后跑 `pnpm api:update`，提交 `tooling/gates/api/`；改了动作的形状或声明：跑 `pnpm actions:update`，提交 `tooling/gates/actions/`（两份快照与源码不同，CI 失败；PR 里写对插件作者的影响，见 [CONTRACT-CHANGES](../../docs/system/CONTRACT-CHANGES.md)）。
- 改动后必跑：`node scripts/run-tests.mjs tests/material-upload.test.ts tests/plugin-runtime-integration.test.ts tests/home-action-scenes.test.ts tests/plugin-artifact-client.test.ts tests/action-service.test.ts tests/execution-lifetime.test.ts tests/system-search.test.ts tests/plugin-sdk-exports.test.ts tests/plugin-declaration-rules.test.ts tests/plugin-manifest-v2.test.ts tests/builtin-manifests-contract.test.ts tests/side-panel-platform.test.ts tests/contextual-interaction.test.ts tests/work-placement.test.ts tests/action-error-model.test.ts tests/plugin-action-route.test.ts tests/plugin-sample.e2e.test.ts tests/action-cross-references.test.ts tests/action-artifact-references.test.ts tests/diff-plugin.test.ts tests/plugin-model-service.test.ts tests/action-availability-kind.test.ts tests/question-rules-consistency.test.ts tests/form-draft-questions.test.ts tests/action-cards.test.ts tests/assistant-card-outcomes.test.ts tests/assistant-interaction-html.test.ts tests/assistant-business-gateway.test.ts tests/plugin-sdk-subpaths.test.ts tests/feed-rich-content.test.ts tests/code-incremental-colour.test.ts tests/git-porcelain.test.ts tests/diff-patch.test.ts tests/companion-state-html.test.ts tests/coding-change-html.test.ts`
- 授权尾检与消费者改动另跑：`node scripts/run-tests.mjs tests/mcp-effect-authority.test.ts tests/mcp-scene-effect-authority.test.ts tests/action-authority-tail.test.ts tests/plugin-owner-effect-fence.test.ts tests/action-before-effect.test.ts tests/functions-scene-configuration.test.ts tests/functions-effect-boundaries.test.ts`。
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../skills/molis-plugin-dev/SKILL.md)、[docs/platform/PLUGIN-DEVELOPMENT.md](../../docs/platform/PLUGIN-DEVELOPMENT.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。


### 工作流内容站

`defineWorkflowContentActions({ id, title, icon, create, subject_kind, read_permissions, write_permissions })`（`subject_kind` 是站点内容的对象种类，要有读取它的 subject 动作，不是站点 id） 生成内容协议的规范动作（每个角色按 `WORKFLOW_CONTENT_VERSIONS` 里的现行版本：`receive` 是 2，输入是平铺的标题、正文和必填的 `request_id`；按旧形状声明、或动作 `version` 低于该角色现行版本的，登记时被拒绝；插件可以自己往上升）；将 `Object.values(actions)` 放入 Manifest `actions`，用 `bindWorkflowContentHandlers(actions, { list, read, receive, create })` 兑现处理器并从 `start()` 返回。SDK 会核对权限声明；运行时再次核对协议 schema。处理器拿到可信 `ActionCallContext`，按当前项目读写插件自己的数据。

工作流从统一目录自动发现这些角色，使用同一执行服务，不增加 Host 支持名单或逐插件分支。读写权限须由安装 grant 和调用者同时满足。`receive` 返回该站点的实际内容引用；`list` 返回完整可选内容；不要把无结构输出或另一种业务对象冒充此内容合同。新增版本应保留或明确迁移旧引用，不能靠同名替换。

此协议覆盖内容交接。流程里的其他一步用「动作步骤」：任何 `operation: "command"`、`audiences` 含 `workflow`、输入为平铺字段（字符串、数字、布尔、枚举）的动作会自动出现在流程编辑器的「加一步动作」里，按提供方分组；用户为每个字段选择交过来的标题/正文/来源/链接/日期或固定值，保存和每次运行都按当前输入合同校验。动作步骤没有交付键：若调用已开始但结果未确认，流程停在「结果未确认」，需要人核对后明确重新执行，所以命令应自己接受幂等键（如 `request_id`）或期望版本。字段在编辑器里显示输入 schema 的 `title`（没有时显示原名），请为每个字段写上用户看得懂的标题。能否看到某个动作仍由调用者的权限决定：本机用户对内置原生插件的权限来自它们的 Manifest，可安装插件来自安装时的授予，Host 不另列名单。系统判断、模板转换、AI 整理和人工交接是交接方式，与站点是不同机制。

### 使用位置

插件若保存了对其他能力的引用（例如自己的配置、角色或规则），用 `defineActionUsagesAction(capabilityId, title, permissions)` 声明一个只读查询：接收 `{ action: { capability_id, version, provider_id } }`，用 `referencesAction(saved, action)` 比较，返回 `{ usages: [{ usage_id, title, detail?, enabled, href? }] }`。能力库的「已用在哪」、Agent 与 MCP 共用的 `actions.usages.read` 会按合同类型自动发现这些查询，不需要 Host 名单；工作流程（动作步骤、判断交接、内容站）、角色范围和对外 MCP 授权都已这样上报。`title` 用使用方自己的说法，`enabled` 表示那里现在会不会调用；读不到的来源在结果的 `issues` 中列出，而不是当作没有使用。

可信动作上下文可携带 `runtime_session_id`，用于保留由 Host 识别的原会话来源；它不属于插件业务输入，也不授予权限。`user_action` 的整组确认与主体引用由受保护用户入口提供，不能从模型自报的确认字段生成。目标树审批与事件用户决定都走 Goals 的现行动作合同，普通插件通过目录只发现获准调用的能力，独立用户权限仍由 Host 强制。

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

`defineAction` 的处理器接收 `ActionExecutionContext`。等待模型、网络或其他异步工作后，写入前调用 `await context.beforeEffect()`，再验证原对象版本。该检查由 dispatcher 创建，不能由业务输入提供；它覆盖取消、注册替换、生命周期与实时授权。嵌套调用保留外层检查时使用合同层 `retainActionAuthority(context, ownDefinition, context.beforeEffect)`；自己的动作可省略提供方，其他动作须明确 `provider_id`。处理器拿到的上下文里还有 `context.call_id`：Host 给这次入口级操作的调用编号，嵌套调用沿用它。只用来写进日志或带进错误说明，方便把一份报告对到这次调用；它不是身份，不授予权限，不能当业务输入，也不能据它做任何判断，插件从请求里读到的 `call_id` 同样不可信。

长任务可使用 `createExecutionLifetime({ signal, timeout, monitor })`。`monitor.check()` 必须同步，检查失败抛出原错误以取消本次执行。将返回的 signal 交给外部等待，返回后 `assertActive()`，再执行所属插件的事务/版本/授权检查；finally 调用 `dispose()`。取消或 shutdown 不应误记成普通业务失败。这个工具不替代幂等请求、持久 lease、执行身份和未知副作用的恢复决策。

### 展示动作结果

`action.result_view` 是可选的提供方声明；不改变原业务返回值或授权。`summary` 说明实际返回的业务事实，`title_pointer` / `text_pointer` 用 JSON Pointer 从该次原输出选取标量，不运行代码。可选 `link` 的 `href_template` 必须是站内绝对路径，`{project_id}` 来自原调用上下文，`{/item/id}` 等值来自原输出并逐个 URL 编码。不要把密钥、内部路径或大段调试数据选成默认摘要。

```ts
result_view: {
  summary: "已保存笔记",
  title_pointer: "/note/title",
  text_pointer: "/note/excerpt",
  link: {
    label: "打开笔记",
    href_template: "/projects/{project_id}/?openPlugin=notes&openItem={/note/id}&openTitle={/note/title}",
  },
}
```

操作卡在成功返回后也保存同一有界展示快照；助理与 Coding 的卡片重开不会重跑原动作或改用新版声明。`ActionCardPorts.projectId` 由卡片 owner 的可信项目作用域提供，不能从卡片输入或动作输出取。卡片只保存声明选取的展示字段，站内链接按导航打开原请求或成果；失败、未知结果与后台未完成的工作没有成功入口。

工作流在成功返回后保存有界呈现和原结果；重开记录不会套用新版插件的声明。缺字段时省略对应正文或链接，无声明的旧记录只确认动作已返回，原数据可展开查看。声明不能将失败或仍在运行的工作声称为业务完成；例如启动任务的摘要应写“任务已启动”。对象页面仍负责当前读取权限、已删除对象和恢复。原生工作台插件可处理已有的 `molis-work:select-item` 事件打开准确对象，无需为每个结果增加 Host 分支。

`canonicalJsonValue(value)` 为请求比较及指纹生成返回一份按 `localeCompare` 递归排序对象键的值，保留字段值和数组顺序，不修改输入。值为 `undefined` 的对象字段仍保留在返回值中，后续调用 `JSON.stringify` 时才按 JSON 标准省略。它不负责验证输入或序列化非 JSON 类型。

FI-C-02：轮询集成的 `health(control)` 与 `sync(input, control)` 必须透传 Host 给出的本次调用控制，它不属于插件 JSON 输入。`controlledConnectorFetch(fetchImpl, control)` 为一次调用创建 fetch，组合调用信号与请求超时，在实际发送前等待 beforeEffect、同步 current。刷新、401重发和响应后写回仍须带同一次控制，不能用安装 live 检查替代原调用。
