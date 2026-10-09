# 接到本仓库产品

Manifest 写完不等于底栏插件切换里有入口：内置插件还要加目录条目和 Plugin Runtime 监督器条目（见「内置插件：经 Plugin Runtime 装配」）；第三方插件看 [authoring.md](authoring.md)。不要抄冻结名单的短名 HTTP。

## 内置插件：经 Plugin Runtime 装配

新的内置插件（任何 kind）只走 Plugin Runtime：由监督器启动，得到安装记录、升级检查、崩溃恢复和每个安装独立的私人存储。不再新增 `apps/local-host/src/<插件>-native-plugin-http.ts`，也不再往构建期名单加条目；冻结的旧名单只许减少（门禁 `tests/builtin-plugin-assembly-gate.test.ts`）。

典型目录：`plugins/native/<id>/src/{manifest,ui,client,styles,en,routes,index}.ts`。私人库对照 Pages / 灵光；不要新建第二张业务 Module 表。

包：`@molis-ai/molis-work-plugin-<id>`。`pnpm-workspace` 已含 `plugins/**`。还要登记依赖，否则 workbench / local-host 解析不到。

### 必改（插件切换里能看见、点得动）

1. **合同类型**（有私人记录时）：`packages/contracts/src/modules/<id>.ts`，并在 `packages/contracts/package.json` 加 `./modules/<id>` export。
2. **插件包**：`package.json` 的 `molis-work` 块（path/kind/ssot），以及 `README.md`、`tsconfig.json`、`src/index.ts`（`workspace-packages.mjs` 缺一个就报错）。`index.ts` 必须再导出 Manifest、`createXPlugin`、contribution、stylesheet、client factory，Workbench / Host 从包根 import。
3. **`scripts/workspace-packages.mjs`**：加一条 `entry(...)`，并在 workbench、local-host 的 `extraWorkspaceDependencies` 里加上这个包名。再在 `docs/SSOT-MATRIX.md` 对应的表里加这个包的一行，运行 `node scripts/package-owners.mjs --write` 生成「归属」列和 `.github/CODEOWNERS`。然后 `node scripts/workspace-packages.mjs` 核对（它也检查归属列与 CODEOWNERS）。
4. **`apps/workbench/src/builtin-plugins.ts`**：内置 build 在 `BUILTIN_PLUGIN_CATALOG` 加一条，绑定 `project_plugin_id`、包导出的 `manifest`、可选 `personal`、`summary`（进内建市场还要有 `navigator` 或 `island` 视图）及 `agent` 正文。`plugin-catalog.ts` 只派生产品目录，不再维护第二份名单。
5. **同一条目的 `workbench`**：声明 `order`（静态资源加载顺序）、`contributions`、`stylesheet`、`clientFactory`、可选 `settingsClient`、`searchRow`。`plugin-workbench.ts` 自动派生，无须另登记。Pages 族照 Pages；Feed/Inbox **没有**插件包里的 factory，客户端在 `apps/workbench/src/scripts/client/navigation-feed.ts` / `navigation-inbox.ts`。
   工作面还须在 `ui-composition.ts` 通过 UiHost mount，`renderer.ts` 注入 primitives，再由 `goals-page-renderer.ts` 渲染到主页面；只登记 pack 不会产生页面 DOM。对照图片插件 `renderImagesContribution`。
6. **监督器条目**：`apps/local-host/src/project-plugins.ts` 的 `startPlatform` 里，在 `entries` 加 `{ definition: createXPlugin(ports), bundled: true, releaseArtifact: nativePluginReleaseArtifact(包名, "createXPlugin", factory => factory(ports)) }`。`bundled: true` 让内置插件随宿主版本升级，不写 `upgrade_compatibility`。`start()` 要兑现 Manifest 的每一条（见下面「app 一等」一节）。
7. **门禁名单**：`tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED` 加一行 `项目短名 → 包名`；短名要与第 4 步目录条目的 `project_plugin_id` 相同，包名要出现在 `project-plugins.ts` 里。
8. **HTTP**：写 Manifest `routes`，由 Plugin Runtime 挂在 `/api/plugins/<plugin_id>/`，处理器用 `bindPluginActionRoute` 转调动作；不写 Host 文件，也不要往 `personal-native-plugin-http.ts`、`web-request.ts` 加分支。`project_id` 由 Host 从当前项目注入，不要从请求 body 或 MCP schema 收。工作面的渲染今天有两条现存路径，没有统一规则，照最接近的同类插件走：像 Shelf 那样在 workbench 的 `ui-composition.ts` 写 `render<X>Contribution`、由 `renderer.ts` 注入（同第 5 步）；或像 Characters 和 Coding 族那样由 `apps/local-host/src/coding-surface.ts` 渲染（`charactersWorkbenchPanel`、`codingCompanionStages`，由 `web-goals-read.ts` 调用）。
9. **英文**：插件 `src/en.ts` 导出 `X_EN`，还要在 `apps/workbench/src/i18n/en.ts` `import` 并 `...X_EN`。只写插件文件，英文界面仍是中文 key。
10. **构建**：`pnpm --filter @molis-ai/molis-work-plugin-<id> build`。根目录 `pnpm build` 含 workspace。
11. **会点名插件名单的测试**：`tests/plugin-declarative-mounting.test.ts`（插件切换/常驻/个人插件）、`tests/creative-tools-plugins.test.ts` 的 `PERSONAL_PLUGIN_IDS`、`tests/uninstall.test.ts` 的 `{home}` 库名、有列表时 `tests/list-silent-refresh.test.ts` 的 factory 表。按需改 `tests/plugin-catalog-companions.test.ts`。

导航、设置位置、项目启用由 catalog 和 Manifest 推导；客户端与 i18n 仍需接线。公共动作注册后自动进入 MCP 目录，没有另外的 MCP 适配。

### 构建期 Native（冻结名单，只许减少）

`BUILD_TIME_ASSEMBLED` 里的旧插件仍是手写接线：Host 里的 `registerProvider(...)`（`project-host.ts`）、`apps/local-host/src/<id>-native-plugin-http.ts` 和 `builtin-plugins.ts` 条目。只有改这些旧插件时才看这一段，新插件不照抄。

- 手写 HTTP 文件：实现 `<id>-native-plugin-http.ts`。其中 Experiments、Alchemist 再挂进 `personal-native-plugin-http.ts` 的 handler 列表；Pages、灵光、Feed、Inbox、Schedule 等由 `web-request.ts` 直接调用各自的 `handle<X>NativePluginHttp`。
- Shelf 不属于这一份：它已由监督器启动（在 `RUNTIME_ASSEMBLED`，不在 `BUILD_TIME_ASSEMBLED`），只是还留着冻结的 `shelf-native-plugin-http.ts`（`/api/shelf`，同样挂在 `personal-native-plugin-http.ts`），新插件不照抄。
- `project_id` 同样由 Host 从当前项目注入，不要从请求 body 或 MCP schema 收。

### 按需

| 有这个 | 再改 |
| --- | --- |
| 新的 MCP 能力 | 声明公共 `actions` 与处理器，`audiences` 含 `mcp`，经 Runtime 注册后由用户授权；不增加 Host 适配表 |
| `actions` / 判断消费场景 | 下面「接到统一判断场景」 |
| 插件事件总线 | 下面「接到插件事件总线」；构建期 Native 不要抄 |
| 新 Artifact 类型 | 合同 + Artifacts Module，不要只写在插件里 |
| 设置页 | contribution + `settings` 槽 + `settingsClient` |
| 图标名 | 必须是 `packages/design-system/src/icons.ts` 的 `MolisWorkIcon`（灵光用 `idea`）。写了不存在的名字，插件切换里那一行还在，图标是空的；不写 `icon` 才落到 `package`。不要往壳层塞 SVG |
| `agent` | 在 `builtin-plugins.ts` 的同一条目绑定 `agent.prompts/skills` 包正文；`BUILTIN_PLUGIN_AGENTS` 自动派生。Manifest 声明不等于已经提供正文，缺失由现有回归拒绝 |
| 重编辑器 IIFE | `apps/local-host/src/web-assets.ts` 挂 `/assets/…`，页面再引 script。只打 bundle、不挂路径，浏览器 404 |
| 项目启用连带 | `PROJECT_PLUGIN_COMPANIONS`（今天只有 Feed→Inbox） |
| 全局搜索 | 内容一律经系统搜索：声明搜索来源（[search.md](search.md)），不改 `global-search.ts`。打开到具体对象：在工作台条目声明 `searchRow`；按标签打开（`molis-work:select-item`）的插件列在 `global-search.ts` 的 `SEARCH_ITEM_TAB_SURFACES` |
| SSOT | `docs/SSOT-MATRIX.md` 加一行 owner |

## 接到统一判断场景

新能力声明 `actions` 并兑现处理器；判断消费者声明 `action_scenes` 并兑现真实绑定、触发和消费。不再为新场景增加 Host 白名单或 `functionAuthoringDestinations` 分支。合同与当前边界见 [开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#统一动作与消费场景)。

1. 先确定业务事件、对象上下文、接受的判断结果，以及结果对产品的实际影响。
2. 注册 `ActionSceneDefinition`，输入输出 schema 与语义类型要能核对；manifest 场景与运行实例 handler 一一对应。
3. `bindings` 读取插件的真实配置；`bind` 校验配置写权限并写回原 owner。关闭时保留引用和版本。
4. 触发方使用同作用域 `ActionSceneClient.runScene`。事件仅带业务参数，可信调用者与项目由组合根绑定。需要读取对象时用 `prepare` 生成函数输入与私有状态。
5. `consume` 验证业务对象仍有效后落地；`failed` 可明确记录需人工处理的失败。共同内核在两条路径上都检查绑定、生命周期及授权；建议不自动授予操作权限。
6. 如果某个入口依赖判断绑定，用 `required_scene` 声明，让 Host 根据真实使用位置计算可用性。其他插件的兼容判断无需增加 ID 分支。

Inbox 的显式判断与 Feed 入箱事件已这样接通，参考 `plugins/native/inbox/src/scenes.ts`、`apps/local-host/src/inbox-scene.ts` 及 `tests/inbox-automatic-scenes.test.ts`。Feed 各触发源通过组合根注入 `feedOptions.inboxJudgment`，共享绑定但不共享待处理队列。

要让用户在系统判断编辑器里直接启用，场景声明 `configuration_permissions` 并提供 `targets(caller)`，返回原配置位置、名称、链接和 revision。系统绑定会携带准确场景提供方及 `expected_revision`，原 `bind` 必须在同一存储中原子核对；null 只代表业务已提供但尚未绑定的固定位置。发现过程不新建规则，停用保留原引用。仅启用所需的额外权限用 `activation_permissions` 声明，详见 SDK。

迁移边界：Home、Inbox、Feed、工作流、角色与内置 Agent 及系统规则编辑器都经同一目录和共同场景；Manifest 不再有 `behaviors`、`function_scenes`、`judgment_subjects`；不要用 `requires: functions.evaluate` 作为接入方法。各消费者的现状与证据见迁移清单。

## 接到插件事件总线

只给经 Plugin Runtime 启动的插件。总线在 `apps/local-host/src/plugin-platform.ts` 的 `createPluginPlatform`，由 `project-plugins.ts`（内置）与 `installed-plugin-host.ts`（已安装）启动。

发布者：

1. 事件 id + payload 形状写进合同（`workspace-artifacts` 一类），让订阅方不 import 你的插件包。
2. Manifest `events.publishes`。
3. `PluginDefinition.event_types`：每种一个 `validate`。
4. `start()` 里 `context.services.events.publish(...)`。

订阅者：

1. Manifest `events.subscribes`，`from_plugin_ids` 写死来源，不许通配。
2. `start()` 返回 `onEvent`。

构建期 Native（Feed/Inbox/Pages/…）没有这条总线。不要为了「完整」给它们加 `events:`。Integration 的进来走 Signal，不是这条总线。Functions「事件去向」也不是。

Workbench 标签选中是另一种纯 UI 通知：Host 在当前插件根节点派发 `molis-work:select-item`，`detail.itemId` 为对象 ID，回到插件列表时为 `null`。Pages 等插件通过自己的公开 HTTP 读取对象并恢复编辑器；切换时要保存未落盘输入，忽略过期读取。这个 DOM 通知不承担跨插件业务写入，也不是 Plugin Runtime 事件合同。

## 信息整理的 Host 组合

Inbox 的 `GET/POST /api/inbox/pages` 由 Host 注入当前项目。POST 接收 `request_id`、`entry_ids`、`title`、`instructions`；Host 从 Attention 解析 Feed 正文，再调用 Pages 包的 `generatePagesFromMaterials`。Pages 自己保存输入快照、生成收据和文档，同一请求不能替换要求或覆盖后续编辑。失败可恢复，生成成功不自动完成 Inbox。

`POST /api/assistant/plan` 只产生规则或写作方案。Workbench 确认按钮调用既有判断规则 / Feed / Inbox 动作；不是外部 MCP，也没有第二份规则或文稿状态。真实写作模型由 `hostCompleteText` 提供；缺配置或网络失败明确报错，不能返回占位文稿。具体配置、实操与边界见 [闭环规格](../../specs/archive/feed-inbox-pages-loop/spec.md)。

## app 一等（Coding 族与 Characters）

已注册到当前项目 Runtime 的路由按 Manifest 和实际 contribution 自动分发，Web 外层和内部适配器均不再维护插件 ID 白名单。业务 HTTP 使用 `bindPluginActionRoute` 转调统一动作；生命周期仍由 supervisor 管理。新实例追加注册不应覆盖已有路由；停用后的请求不得重新启用实例。内置项目启用检查、控制令牌、origin 与一次性请求键继续生效。`/restart`、`/release-quarantine`、`/upgrade` 保留给 Host 生命周期，业务路由避开这些路径；不要在 Host 为新插件增加同名字段的结果加工。

`kind: "app"` 必须真的经 Plugin Runtime `start()`。今天：Coding、Files、Git、Diff、Text stats、Characters（Shelf 是 `native`，同样由监督器启动）。启动在 `apps/local-host/src/project-plugins.ts` 的监督器条目；`coding-surface.ts` 渲染 Coding 族与 Characters 的工作面（Shelf 的由 workbench 渲染），并把 `/api/plugins/<plugin_id>/` 转给运行中的插件（`handleCodingPluginHttp`）。

`start(context)` 返回 `kind: "app"`，并且：

- Manifest 每条 `views` → `contribution.views`
- 每条 `routes` → `contribution.routes`
- 每条 `actions` → `contribution.actions`（缺处理器的声明会让启动失败）
- 有 `commands` → `commandAvailability` + `executeCommand`
- 有 `events.subscribes` → `onEvent`
- 有 `ports.inputs` → `onUpstreamReady` / `onUpstreamUnavailable`

缺一条或多一条都是启动失败，只影响自己。`stop` 不消耗崩溃恢复额度。

Text stats 是最小完整 app：一个必选输入口、一个 `navigator` 入口加一个 `stage` 视图、无存储、无事件。新端口消费者先抄它的声明形状，再抄 Diff 的 `input_groups`。默认连线把它的输入口接到 Files 的 `before` 快照（`workspace-plugin-bindings.ts`）；照抄它的声明，新插件的输入口不会自己接上，要接就由人在成果库详情把某一版接给插件输入。端口何时投递见 [elements.md](elements.md)。

Kernel `registerCapability` 是 Module/Host 的事（Goals、Agent Host），不是插件包自己登记一份。插件只 `requires` / `capabilities.consumes`，由 Host 注入 `services.capabilities.invoke`。

## integration

不要在 Native 插件里写 GitHub/Gmail 分支。清单：

1. `plugins/official-integrations/<id>/`，`definePollingIntegrationPlugin`。
2. Connector Host / Listener Host 登记 Driver 与 Signal Adapter。
3. 设置 UI contribution（账号、whoami）。
4. 权限：`network:…`、需要凭据时 `secret:…`。
5. Feed 只消费 Signal/Item；来源任务留在 Feed。

OAuth、目录连接器：[integrations.md](integrations.md)。

## 数据落哪

| 内容 | 放哪 |
| --- | --- |
| Goal / 注意力 / Feed 消息 | 对应 Module，插件只调公开 API |
| 可同步、可打开的结果 | Artifact |
| 本机文档/问卷/表/置物架/灵光 | `{home}/<id>/<id>.db`，按 `project_id` 分区；不要冒充 Module |
| 凭据 | secret 引用 |
| 给别的插件的瞬时协调 | 事件总线（仅经 Plugin Runtime 启动的插件，≤16 KiB） |

卸载停代码和 binding；已形成的 Goal/Artifact/Signal 引用仍可显示。私人库默认不跟卸载清掉。

## 验证这一步

- `node scripts/workspace-packages.mjs` 无错误。
- 类型：`pnpm --filter @molis-ai/molis-work-plugin-<id> typecheck`
- 定向测试：`node --import tsx --test --test-concurrency=1 tests/<id>-*.test.ts`
- 点名插件名单的测试仍过。
- 真开 Workbench：插件切换或底栏常驻入口出现、点进主路径、刷新后状态还在、增删后列表自己更新且不整页闪白。

## 项目设置

跨插件读当前项目配置，先在 `packages/contracts/src/modules/projects.ts` 定义具名 typed capability，按项声明 consumes，Host 在 `project-capabilities.ts` 根据 runtime.project_id 装配。当前只有关联目录与浏览目录。目录关联复用 catalog，浏览偏好由 Host 持有，UI 在 `project-settings-pages.ts` 及对应客户端；不要建立第二份目录库。完整归属表见 `docs/platform/PROJECT-SETTINGS.md`。


### 工作流内容交接

内容型插件通过 SDK `defineWorkflowContentActions` / `bindWorkflowContentHandlers` 注册内容列表、读取、接收及可选空白创建。角色、输入输出及语义版本来自规范合同；Host 不再维护工作流 SUPPORTED / BLANK_START 或按插件 ID 分发。存量 Feed、Inbox、Pages、灵光已经接入，插件实现位于各自 `content-actions.ts`。

平铺输入的命令（`audiences` 含 `workflow`）可直接作为流程的「动作步骤」，字段由用户映射，编辑器显示字段的 schema `title`，请写上用户看得懂的标题；保存了能力引用的插件用 SDK `defineActionUsagesAction` 上报使用位置，能力库「已用在哪」与 `actions.usages.read` 按合同类型发现，Host 不维护名单。

配置引用会固定提供方和动作版本；停用或升级不改写旧引用。普通 Runtime 插件只需 Manifest actions 与 start 返回 handlers，工作流目录即可发现。Native 仍由组合根注入数据 owner，不能把其业务实现放回工作流 HTTP。通用 schema 步骤映射仍未完成，不把该内容协议解释为所有能力都已可连线。

## 异步提交

等待模型/网络的动作按 `scheduling: "concurrent"` 执行，读快照 → 等待 → `await caller.beforeEffect()` → 版本比较提交。嵌套调用使用 `retainActionAuthority(caller, originReference, caller.beforeEffect)`，同时保留外层注册、权限和生命周期约束。来源拉取还需逐来源独占，不能只把串行标记改掉。被撤权或取消后，不写失败记账；此前已发出的外部操作保留未确认状态供恢复。

### 已授权材料的提取

插件需要文字/HTML/PDF/OCR/媒体材料时，由 Host 注入 `contracts/services/materials` 端口。输入已授权字节，系统解析器/原生进程归 Host；原件、SHA 引用、业务转换和引用规则留给消费者。检查 coverage 和 truncated，不能把扫描空页或截断当作全文。传递取消，异步返回后与业务写入前复查 beforeEffect；媒体模型下载必须显式选择。Jelly 的 Host 适配与 onboarding 是当前接入示例，不在插件复制解析器或绕过 Prologue 生成摘要。

Shelf 的 PDF 预览和 OCR 同样复用公共提取口。语言放在 `ocrLanguages`，逐行置信度读取页面的 `lines`；不能拿页平均值冒充每行置信度。用户提示与结果命名留在消费者，多选材料逐项提取，不按第一项忽略其他内容。异步提取完成后先复查原执行与输入 hash，再写结果；取消/撤权也不能被 catch 成失败成果。已终止执行的历史 running 标签不代表进程仍在运行，不自动恢复外部工作。

文档/ZIP 导入使用同一契约的 MaterialDocumentReader：Host 产出原名、格式、内容与 coverage，插件再执行编辑器/领域转换；不把 PagesBody 或产品的图片支持写入解析器。预览与提交使用同一注入端口，解析异步等待可声明 concurrent，写入仍走领域事务、幂等键和 beforeEffect。ZIP/DOCX 依赖仅归 Host，禁止插件再解析一遍或自行启动 worker。

网页捕获使用 MaterialWebsiteReader，Host 负责受限网络与同一 HTML 提取，插件保留材料命名、链接和内容组织。传递 signal / beforeDispatch，每次跳转复核派出，返回后 beforeEffect，再同步校验原对象版本后写入；不要在更早的异步检查中校验完版本便视为永久有效。Shelf 与 Artifacts 是现有消费者。失败保留链接是业务选择，取消/撤权不能被 catch 后当普通失败保存。

HTML 解析也通过既有 Host worker 生命周期执行，不能让主线程同步解析绕过网络超时。网页复用 Kernel 执行生命周期，把异步派出检查、网络和解析包含在同一取消/时限内；Artifacts 的异步 HTML 导入保留原文和自身容量合同，提交前再检查取消和权限。

导入等待网络或 worker 的动作显式声明 concurrent。端口保留 ActionExecutionContext 的 beforeEffect，不能只把 actor / validate_authority 传下去再自己查启用状态；完整检查还包含注册世代、当前权限、宿主生命周期与取消。

账号文档读取复用 Host 的连接器请求生命周期，向 Integration 传递 signal 与每次请求前的 beforeDispatch。元信息返回后读取正文、获取令牌或 OAuth 重试前仍需复查原调用；取消不能被映射成网络故障后重试。最终账号 revision 检查放在异步授权检查之后，保留最初选择的连接，不能接受读取途中重新授权的新账号。
