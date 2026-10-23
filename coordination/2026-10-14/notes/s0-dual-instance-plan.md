# S0-2 计划：同一个 `plugin_id` 同时有 Home 实例和项目实例

> 只读调研，未改代码。事实核对到 origin/main `71e4b9b69f610ae4363f632f431fc6bcfb0902c8`（2026-10-20）。在途 PR 只读过文件清单和 diff：#840、#843、#848、#857、#851、#847、#853、#812、#826。
> 前提（用户已定，见 `migration-todo.md` 第 22 行）：Shelf 迁 Plugin Runtime 采用「同一个 id 双实例」。本计划不重开这件事，只回答平台要补什么、怎么补、谁来定。
> 名词：**Home 实例** = 由 Home 监督器（`apps/local-host/src/home-plugins.ts`）装配的那一个；**项目实例** = 由项目监督器（`project-plugins.ts` 的启动名单）每个项目装配的那一个。

## 0 结论

1. **按 `(provider_id, capability_id, version)` 取键的地方不用改。** 前提是两个实例的 `provider_id` 都等于 `plugin_id`（现在内置插件就是这样），并且两个实例登记的动作 id 互不相交。第二个前提不用另写规则：内核登记时同一动作 id 且「任一方没有 `project_id`」就抛 `capability_duplicate`（`packages/kernel/src/index.ts:88-94`）。MCP 授权、MCP 工具名（`apps/mcp/src/action-tools.ts:19-21`，名字只由动作 id 和版本拼成，不含提供方和安装编号）、工作流步骤的精确引用、情境入口、搜索的 `search.changed(provider_id, project_id)`（`project-host.ts:141`）都因此不变。拆成两个 `plugin_id` 才会断这些钉死的引用，所以不拆。
2. **有一处现成的实现缺陷，双实例一启用就暴露，S0-2 要先修：`install_id` 是确定性的，Home 库和每个项目库里的同一插件拿到同一个 `install_id`**（`runtime-rules.ts:39-44`，取 `plugin_id` 和发布者签名的哈希）。`apps/local-host/src/local-web-actions.ts:14-17` 把两个库的安装记录合进一张按 `install_id` 取键的表，Home 的记录盖掉项目的（第 17 行），之后授权（第 20、30-33 行）和嵌套调用的 `validate_authority`（第 60 行，拿项目库读出的记录和合并表里的记录比 `installation_generation`，两条记录各有一个随机 UUID）都会读错记录。结果是项目实例的动作被判 `actions.forbidden`（失败时拒绝，不是放行），授权的权限集合也取错了记录。现在没人暴露它，因为 Shelf 的 Home 一半是宿主手写登记、没有 `plugin_install_id`；**Shelf 的 Home 一半一变成 Runtime 实例（S2）就会暴露**。
3. **「声明了就必须兑现」在四层都是整套精确匹配，一份 Manifest 两个实例过不去：**
   - `assertContributionMatchesManifest`（`packages/plugin-runtime/src/contribution.ts:109-146`，在 `index.ts:654` 调用）：动作、路由、视图、输入端口的 `onUpstreamReady`、命令，声明了就必须提供；
   - `pluginActionProvider` 把 `manifest.actions` 整个当作 `definitions`（`action-provider.ts:22`），内核 `registerProvider` 再做一次 `exactBindings`（`action-service.ts:483-492`，缺一个就抛 `actions.unredeemed`）；
   - `HomePluginExecutor.start` 只要 Manifest 里有端口、事件、成果、过程项的声明就整体拒绝（`home-plugin-executor.ts:38-41`）。Shelf 的 Manifest 同时有 `ports.inputs`、`artifacts.consumes`、`process_items.consumes`（`plugins/native/shelf/src/manifest.ts:37-40`），Home 实例按现状根本起不来；
   - 启动名单互斥：同一个 `plugin_id` 不能同时在 Home 与项目名单里（`plugin-scope-entries.ts:17,30`）。
4. **还有一处会在双实例下答错：Home 路由对自己没有的路径直接答 404「插件没有这个入口」**（`home-plugin-http.ts:118`），而 Home 路由在请求链里排第一（`web-request.ts:80,117`）。项目实例的 `/project-results`、`/project-result` 会被它盖住。
5. **授权：每个实例各一条记录（今天的机制），不改机制。** 人在 `/plugins/shelf` 看到和能管的是 Home 那一条；项目那条看不到。建议用一条可检查的约束消除分歧：双实例插件的 Manifest 权限一律写成必需（`required: true`），必需权限人关不掉，两条记录就不会分叉（S-15）。要用可选权限，再做「项目实例的有效授权 = 项目记录 ∩ Home 记录」。这一条涉及授权语义，需要用户弹窗（见第 6 节 U1）。
6. **声明放哪（问题 4）：一份注册、一份 Manifest、一个 `catalog_order`。** `runtime` 仍是 Home 一半（S2 才加）；在 `runtime` 里加一个可信的可选标记，表示「这个插件另有一个由项目监督器装配的项目实例」。标记只从宿主自己的启动名单读，不进 Manifest（和 `bundled` 同一信任规则）。它只做三件事：放行互斥检查、放行「只兑现自己那一半」、触发 Home 路由的回落。门禁查「标记 ⇔ 同时出现在两份名单」。
7. **叠不叠 #840：平台这部分不依赖 #840，可以先合。** #840 不改 `apps/local-host/src/*`。Shelf 自己的声明（`registration.ts`，#840 才有）留给 S2。只有「标记的门禁」要改 #840 动的脚本（`scripts/gates/home-runtime-entries.mjs`、`catalog-entries.mjs`），那一小块等 #840 合入后再做。
8. **笔记里要核的两项：**
   - (a) **项目实例能调 Home 实例的动作**，两条路，权限都要两边记录各自满足：Manifest 自有路径（`plugin-actions-client.ts:121-122`，audience 为 `user`，Shelf 的所有动作都在同一份 Manifest 里，所以够得着只给 `user` 的动作）；`capabilities.consumes` 路径（`:123-130`，audience 为 `plugin`，只够得着受众含 `agent` 的动作，如 `shelf.items.admit`，Images 现在就这样用）。反方向：Home 实例的动作内部 `project_id` 为空，调项目范围的动作答 `actions.project_required`；只有 Home 路由在项目路径下被调时，宿主放进控制里的项目才让它调项目范围动作（`plugin-actions-client.ts:47-54`，S-31）。
   - (b) **个人范围的 `processItems.record` 归录入的人**：`fixed()` 把 `actor_id` 定成 `author() ?? actor_id`，`scope` 定成 `"personal"`（`plugins/native/artifacts/src/plugin-operations.ts:42-44`），`author()` 只在当前动作属于本安装时取调用者（`plugin-host-services.ts:59`），不读输入；读取时 `owner_actor_id !== actor_id` 就 `plugin_denied`（同文件 45-49、117-121）。
9. **笔记第 5 项「Home 实例的 `registerVersion` 放哪」已过期，不属于 S0-2，也不属于 S2。** `publishShelfMaterial`、`shelf-material:` 和 Shelf 自己调 `registerVersion` 都已被 #839 删掉（`git log -S` 见 `5b996f603`、`34859d0d9`）。现在「存到项目资料」是 `saveShelfToProject`（`apps/local-host/src/shelf-actions.ts:56-62`）：以确认的调用者经成果库自己的导入动作写（`artifact-document-import.ts` 的 `importThroughArtifacts`）。Home 实例不持有成果库和过程项服务（`skills/molis-plugin-dev/host.md:17`、`home-plugin-executor.ts:40`），所以这一步留在项目实例（S4），或将来用 #843 的 `directory` 以原调用者调用。

## 1 事实（file:line，均对 `71e4b9b69`）

### 1.1 安装身份

| 事实 | 位置 |
| --- | --- |
| `installIdentity` = `plugin-install-` + sha256(`plugin_id\0publisher.signature`) 前 32 位，确定性；`definitionKey` = `plugin_id\0version\0signature`。所以同一插件在 Home 库和每个项目库里 `install_id` 相同，每个库各存一条记录，`installation_generation`（随机 UUID）不同 | `packages/plugin-runtime/src/runtime-rules.ts:39-51` |
| 提供方编号：宿主启动名单标了 `bundled` 的定义对象用 `plugin_id`，其余用 `install_id` | `apps/local-host/src/plugin-entry-identity.ts:18`；Home 侧 `home-plugins.ts:135-136` |
| 动作登记：`provider_id`、`plugin_install_id`、`plugin_id`，`project_id` 只在项目实例上带；可用性读自己仓库的记录（`state.record()`） | `packages/plugin-runtime/src/action-provider.ts:19-21`（提供方字段）、`:13-18`（可用性） |
| 现在 Shelf 的 Home 一半和 `shelf.material.*` 两个动作是宿主手写登记，`provider_id = plugin_id`、没有 `plugin_install_id`，靠「宿主自己登记的动作，用本地用户的内置权限」放行 | `apps/local-host/src/shelf-actions.ts:12-13,16,43`；`local-web-actions.ts:23-24` |
| 项目实例在项目监督器里：`createShelfPlugin(shelfPorts)`，`bundled: true` | `apps/local-host/src/project-plugins.ts:192-197`，名单交给 `platform.start(projectScopeEntries(...))` 在 `:230` |
| 端口只在项目实例上：`shelfPorts` 读项目成果和过程项（Coding 报告、变更集）并写个人 Shelf | `project-plugins.ts:137-148` |
| 各处按 `install_id` 取键的位置：私有存储主键 `(install_id, item_key)`，每个库一张表，不串（`private-storage.ts:20-23`）；限速键含 `project_id`（`action-service.ts:106`）；`events` 表另带 `project_id`；`registerPluginAgentDefinitions` 已按 `(owner, installId)` 引用计数，多个持有者没问题（`plugin-instructions.ts:30-64`） | 如左 |
| 模型、主人文件、材料、后台这四个服务各自按 `scope.install_id !== gate.install_id` 拒绝（`model-service.ts:79,90`、`owner-files-service.ts:26`、`materials-service.ts:32`、`background-service.ts:22`）。两个实例同一个 `install_id`，这一比较分不出它们。句柄在各实例自己的 `start` 闭包里，除非插件把句柄存进模块全局，否则够不着；这是双实例新增的、需要一条拒绝测试的边界（见 4.3） | 如左 |

### 1.2 内核与动作目录

| 事实 | 位置 |
| --- | --- |
| 登记重复：同一动作 id 和版本，且任一方没有 `project_id` 或两方 `project_id` 相同 → `capability_duplicate`。所以 Home 与项目两个提供方不能共用动作 id；两个不同项目的实例可以 | `packages/kernel/src/index.ts:88-94` |
| 带 `project_id` 的提供方遇到别的项目 → `actions.scope_mismatch` | `packages/kernel/src/action-service.ts:71` |
| `scope: "project"` 的动作没有项目 → `actions.project_required`；不带 `project_id` 的提供方可以承载项目范围的动作（Issues、Cognia、Images、Jelly、Todo 已经这样） | `action-service.ts:90,164,171`；动作快照 `tooling/gates/actions/actions.tsv` |
| 因此实例归属不能由 `action.scope` 推出：同一份 Manifest 里两种 scope 混着（jelly 50 个 home、3 个 project；images 4 个 home、10 个 project；todo 23 个 home、2 个 project；goals 2 个 home、67 个 project；alchemist 2 个 home、57 个 project；cognia 25 个 home） | `tooling/gates/actions/actions.tsv` |
| 钉死提供方的引用：`provider_changed` | `action-service.ts:120,207,222,420,474` |
| MCP 授权键 `(client_id, project_id, capability_id, version, provider_id)` | `apps/local-host/src/mcp-action-grants.ts:19-28,50-53`；`mcp-action-client.ts:9-49` 用目录的可用性加授权偏好，不直读安装 |
| 插件受众到得了的动作：受众含 `agent` 且没有 `plugin: false`、不是不可逆。Shelf 的 `SHARED = [user, workflow, agent, mcp]` 够得着，`LOCAL = ["user"]` 够不着 | `packages/contracts/src/platform/actions.ts:272-274`；`plugins/native/shelf/src/actions.ts:24-25` |

### 1.3 本机页面调用的授权上下文（漏洞所在）

`apps/local-host/src/local-web-actions.ts`：

- `:14` 项目库的记录：`SqlitePluginRuntimeRepository(runtime.store.db).list()`。
- `:16-17` 先放项目的运行中记录，再 `grants.set(record.install_id, record)` 放 Home 的，同键覆盖。
- `:20` `installOf(provider)` 只用 `plugin_install_id` 取键。`:28-33` 目录里的动作按它的授权过滤；`:41-44` 场景同样。
- `:55-61` `validate_authority`：安装记录按提供方的 `project_id` 从正确的库读（项目库或 Home），但第 60 行拿它和 `installOf(...)` 即合并表里的记录比较 `installation_generation`。双实例下项目提供方永远比不上（两个库的记录各有一个 UUID），一律 `actions.forbidden`。

另见 #851（在途）：`rememberInDirectoryPass(rows, installId, …)`（新文件 `plugin-install-records.ts`）的缓存作用域是仓库对象，两库不会串，这是安全的，但要有一条测试钉住（DUAL-15）。#851 同时改 `local-web-actions.ts` 的 `bindLocalWebActions`（第 68-80 行），与本计划要改的第 14-61 行不重叠。

### 1.4 声明与兑现

| 事实 | 位置 |
| --- | --- |
| `PluginRegistration.runtime` 的类型：`scope: "home"`、`create`、`database?`、`files?`、`model_configuration?`、`image_generation?`、`package_name`、`factory_export`、`keys?` | `packages/contracts/src/platform/plugin-registration.ts:73-84`（main，来自 #808；#826 也改这个文件） |
| main 的目录还是手写的 `apps/workbench/src/builtin-plugins.ts`；Shelf 的条目 `catalog_order: 11`、`personal: true`、没有 `runtime`（171-186 行）；带 `runtime` 的有 issues（35）、cognia（41）、images（70）、jelly（87）、todo（206） | 同文件 |
| #840 把目录改成生成物（`scripts/generate-plugin-registry.mjs`，各插件 `src/registration.ts`），冻结 `builtin-plugins.ts`；Shelf 的 `registration.ts` 就是现在目录条目照搬（`personal: true`、没有 `runtime`） | #840 的 diff |
| w5-02 计划的裁定：范围只放在可信的 `runtime.scope`，Manifest 不加 `runtime_scope`（§3.3）；有端口的条目（characters、shelf、coding、files、git）仍手写在 `project-plugins.ts`，等 PG-005 和项目库 L2（PR-1b-4，第 224 行） | `w5-02-pr1-plan.md` |
| Shelf 的 Manifest：`kind: "native"`、`always_on: true`、权限 `storage:private` 和 `artifact:read`（都必需）、`actions: SHELF_RUNTIME_ACTIONS`（3 个）、`artifacts.consumes`、`process_items.consumes`、`ports.inputs`、3 条路由、`ui.views`（side、settings） | `plugins/native/shelf/src/manifest.ts:18-54` |
| `createShelfPlugin` 返回 `kind: "app"` 的贡献（视图、`onUpstreamReady`、3 个动作、3 条路由），所以视图、路由、处理器检查都生效 | `plugins/native/shelf/src/plugin.ts:11-28` |
| Home 实例的 Manifest 不能有端口、事件、成果、过程项 | `apps/local-host/src/home-plugin-executor.ts:38-41` |
| 笔记的「Manifest 声明 5 个项目动作」不准确：Manifest 里是 3 个（`shelf.results.*`），另外 2 个 `shelf.material.preview/save` 是宿主登记的（`actions.tsv` 536-538；`host-actions.tsv` 229-254 共 26 行 shelf，其中 24 个 Home） | 如左 |
| 加字段到 `ActionDefinition` 会改合同哈希、要升版本，所以不走这条路 | `tooling/gates/README.md` 的动作合同快照一节 |

### 1.5 启动名单与 HTTP

| 事实 | 位置 |
| --- | --- |
| 夹具互斥 | `plugin-scope-entries.ts:14-17` |
| 目录与夹具对项目名单的互斥（对 `entry.runtime?.scope === "home"` 和 Home 夹具） | `plugin-scope-entries.ts:25-33`；被 `project-plugins.ts:230` 调用 |
| 重复的 Home 标识只在 Home 名单内部检查 | `home-plugins.ts:118` |
| Home 路由先于项目路由；只要 Home 登记了这个插件就接管 | `web-request.ts:80`（调用）、`:117-118`（定义）、`:135`（也在 `PROJECT_ROUTES` 里）；`home-plugin-http.ts:36` |
| 命中 Home 的插件但 `dispatchRuntimePluginRoute` 返回 false → 404 | `home-plugin-http.ts:118` |
| 路由分发本身对没声明的路径已经返回 false，不抛：回落是现有设计留下的口子 | `plugin-route-operations.ts:43-116`；`plugin-runtime/src/routes.ts` 的 `PluginRouteTable.dispatch` 返回 null |
| 项目路径下的 Home 路由：宿主核对项目、放进控制里的 `project_id`（S-31） | `home-plugin-http.ts:127-136`；`plugin-actions-client.ts:20-54` |
| 项目路由 `runtimePluginsRoute` | `web-project-platform-routes.ts:101-113`；`web-request.ts:290` |

### 1.6 授权现状

- S-15：`bundled` 的插件只在全新安装时拿到 Manifest 声明的全部权限；人关掉的可选权限之后不再打开；`bundled` 只来自宿主启动名单。每个库一条记录，所以全新安装对每个项目库各发生一次：人在 Home 关掉的可选权限，会在项目库的全新安装里重新打开。这就是分歧的来源，今天没有人暴露它，因为 Shelf 的权限全是必需。
- `plugin-route-operations.ts:95` 路由的授权读该实例自己的记录。
- Shelf 是 `always_on`，不进任何项目的插件设置（S-34）；人能看到的授权页只有 Home 那条。
- S2 之后 Home 动作还需要 `shelf:read`、`shelf:write`、`model:invoke`（现在不在 Manifest 权限里），`grantAvailability` 会要求 Home 记录持有（`action-provider.ts:13-18`）。这是 S2 的事，但它决定了 U1。

### 1.7 其他核过的

- 项目实例调 Home 实例：见结论 8(a)。`plugin-actions-client.ts:77` 自有路径的 `allowed_actions` 是整份 Manifest 的动作带上本实例的提供方编号，权限取本实例记录；Home 动作自己的处理器再按 Home 记录的授权判一次，所以两边都要有权限。
- `bindOwnerPluginAction` 按 `row.provider.plugin_install_id === context.install_id` 找自己的登记（`packages/plugin-sdk/src/routes.ts:62-63`），双实例下每个动作 id 只有一行，不歧义。
- `discover` 过滤也按 `plugin_install_id === context.install_id`（`plugin-actions-client.ts:116-117`）：同一插件的两个实例互相看得见，这是同一个插件，可以接受。
- `agent-question-surfaces.ts:63`（`installed:${plugin_install_id ?? pluginId}`）、`contextual/contextual-create.ts:36-39`、`goals-actions.ts:19` 都是读同一个插件的行，不会把两个实例当成两个插件。
- #843 的 `directory`：Home 实例（`options.project_id` 为空）跳过项目检查，持有 `actions:delegate` 的 Home 实例可以以原调用者（受众 workflow）调项目范围的动作；这本身不是 S0-2 的事，但 DUAL-10 的测试要覆盖。

### 1.8 笔记与 main 不符的地方

- 笔记里「`publishShelfMaterial` / `shelf-material:` / `processItems.commands.registerVersion`」在 main 上没有（#839 删了，笔记的基线 `c17504473` 早于 main）。
- 「Manifest 声明 5 个项目动作」应为 3 个加宿主登记的 2 个。
- #843 和 #822 在补丁里写的是 S-41，**main 上 S-41 已经是项目资料那一行**（`docs/system/SECURITY-INVARIANTS.md:55`，来自 #839），#848 写 S-43。这几个 PR 合入前都要重取空号；本计划不预写号。

## 2 设计

### 2.1 不变的东西（写进 host.md 的规则）

- 两个实例 `plugin_id`、`install_id`、`provider_id` 相同。`provider_id` 由「定义对象是否在宿主启动名单里标了 `bundled`」决定，所以**两份名单里这个插件都必须标 `bundled`**，否则一个是 `plugin_id`、一个是 `install_id`，钉死的引用和 MCP 授权就分叉。
- 两个实例的动作 id、路由 id、路径加方法互不相交；每个 Manifest 动作恰好由一个实例提供。
- 记录各归各库：Home 的读 Home 库，项目的读本项目库；一个实例的授权、停用、重装、世代不影响另一个。

### 2.2 实例归属怎么表达（三个选项）

| 选项 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **P1（推荐）** 隐式 + 可信标记 | 每个实例的 `start` 只返回自己那一半的处理器；宿主名单条目带可信的「部分兑现」标记，运行时只放宽「声明了没提供」，保留「提供了没声明」；两半合起来等于 Manifest 由一条通用测试查 | 不改合同、不改动作哈希、不升版本；改动集中在 plugin-runtime 和宿主；对第三方沙箱插件没有任何放宽（标记只存在于宿主自己的条目对象上） | 「并集等于 Manifest」不是运行时强制，只有 CI 里的覆盖测试；漏登记的动作在运行时表现为「动作不可用」（失败时拒绝） |
| P2 Manifest 加 `instances` 一节，显式写各实例的动作、路由、视图 | 声明式；每个实例仍按精确匹配；授权页可以显示每个实例做什么 | 最干净的长期形态，与 PG-012 的第一条做法一致 | 改 Manifest 合同（`pnpm api:update`、`CONTRACT-CHANGES.md`），同时碰 `plugin.ts`，与 #843、#848、#857 都撞 `plugin.ts` 和 API 快照；动作 id 要再抄一遍 |
| P3 每个实例各一份 Manifest（同 id、同版本、同签名） | 现有精确检查全保留，权限按实例最小化 | 不用放宽任何检查 | 同一身份两份内容不同的 Manifest，签名意义变虚；目录、市场、动作快照、授权页都要一个「并集」，又要一条并集检查；与「一个插件一份 Manifest」的所有文档相冲 |

**建议 P1。** 理由：不碰合同，不与在途 PR 撞 `plugin.ts`，改动小且可回退；P2 作为终局留着，等第二个双实例插件（PG-012 点名的 Goals 个人规划）出现时再评。这是实现层取舍，② 自己定；它不放宽任何信任边界（见第 6 节）。

### 2.3 P1 的具体放宽（刚好够用，不多）

1. **`assertContributionMatchesManifest` 加第三个参数 `{ partial }`。** 把各个 `assert*` 的问题分成两类：「提供了没声明」（保留）和「声明了没提供」（`没有兑现`、`没有提供 onUpstreamReady`、`没有提供 executeCommand` 这几类，partial 时跳过）。`redeem`（`index.ts:648-660`）从 `this.options.actions` 取 `partial?.(definition)`，和现有 `providerId?.()`、`project_id` 同一个位置。
2. **`pluginActionProvider` 的 `definitions` 改成「由处理器反查 Manifest」**（`action-provider.ts:22`）：`definitions = handlers.map(h => manifest.actions.find(...))`。不 partial 时精确检查已经保证等于整份 Manifest，所以这一改对现有插件逐字节等价；partial 时只登记本实例的那几个，内核的 `exactBindings` 不再抛。`action_scenes` 同理。
3. **`HomePluginExecutor.start` 的端口、事件、成果、过程项拒绝，对 partial 的条目跳过**（`home-plugin-executor.ts:38-41`）。Home 实例照旧拿不到项目的成果库、端口和事件服务：Home 执行器有自己的服务集，刻意不含项目成果、事件和接线客户端（`home-plugin-executor.ts:18` 的注释）；项目侧的同类服务也只在宿主给了对应选项时才建（`plugin-host-services.ts:146-176`）。所以跳过这个拒绝不会让 Home 实例多出任何服务，只是不再因为 Manifest 里有这些声明就拒绝启动；声明由项目实例兑现。没有标记的 Home 条目照旧整体拒绝。
4. **启动名单互斥改成「只许显式声明的双实例」**（`plugin-scope-entries.ts:14-17,27-31`）：同一 `plugin_id` 在两份名单里，只在带标记（目录的 `runtime.<标记>`，夹具的同名选项）且两边都 `bundled` 时放行；其他情形仍在启动前抛错。
5. **Home 路由回落**（`home-plugin-http.ts:118`）：`dispatchRuntimePluginRoute` 返回 false 且这个插件带标记时，函数返回 false，请求继续走到 `runtimePluginsRoute` 去找项目实例；没有标记的插件仍然答 404，行为不变。
6. **`local-web-actions.ts` 按作用域取记录：** 把一张合并表拆成两张，`homeRecords` 与 `projectRecords`；`installOf(provider)` 在 `provider.project_id` 有值时只查项目表，没有时只查 Home 表；`validate_authority` 的 `generation` 比较也走同一个函数。不再在 `grants.set` 里覆盖。这一条不依赖 P1，是 S0-2a。
7. **服务 gate 加实例区分（加固，建议做）：** `PluginActionScope` 带上该实例的 `installation_generation`，模型、主人文件、材料、后台四个服务除了 `install_id` 再比较它。让一个实例的动作不能拿另一个实例的服务句柄。读代码推断的缺口，见 4.3，未做过实测。

### 2.4 授权（问题 2）

- **方案 A（建议）：沿用每个实例一条记录。** 不新增机制。约束：双实例插件的 Manifest 权限全写成 `required: true`（门禁查），两条记录始终相同，没有可选权限的分歧。人看到的授权页是 Home 那条，项目那条与它一致；**不会出现「一个插件两份授权」的界面**。代价：Manifest 权限是并集，项目记录也持有 Home 一半才用的权限（`shelf:write`、`model:invoke`）。这些权限只有对应的处理器会用，而项目实例没有那些处理器；这是过宽但不可触达的授权，要在 host.md 里写明。
- 方案 B：项目实例的有效授权 = 项目记录 ∩ Home 记录，宿主把「对方记录」作为可信回调交给项目 `PluginRuntime`，读授权时取交集。允许双实例插件有可选权限，人在 Home 收窄就同时收窄项目实例。代价：新的耦合点和失败路径（Home 记录缺失或未运行时项目实例全部不可用），要新的不变量和测试。
- 方案 C：每个实例的权限子集。要么 P3，要么 P2 里带按实例的权限，都是合同级改动。不推荐现在做。
- **授权页**：人只在 Home 那条上看到权限；项目记录不单独出现（Shelf 是常开，不进项目设置）。若将来某个双实例插件不是常开，项目设置里会再出现一条同名的，要在那时设计「合并显示」，不在 S0-2 范围。

### 2.5 目录语义（问题 3 的汇总）

| 机制 | 双实例下的行为 | 需要改吗 |
| --- | --- | --- |
| 动作登记 | 两个提供方同 `provider_id`、不同 `project_id`、动作 id 不相交；重复即 `capability_duplicate` | 否（靠内核现有规则） |
| 精确引用 `provider_id` | `plugin_id` 不变，钉死的引用继续有效；一个动作只有一个提供方 | 否 |
| MCP 工具名 | `molis_work_v1_action_<capability_id>__v<version>`（`apps/mcp/src/action-tools.ts:19-21`） | 否 |
| MCP 授权 | 按 `(client, project, capability, version, provider_id)`；`authorizeMcpActions` 用目录可用性加授权偏好，不直读安装 | 否 |
| 工作流绑定 / 情境入口 / 搜索 | 同 `provider_id` 键；`project-host.ts:141` 的 `search.changed(provider_id, project_id)`、`invalidateView(provider_id)` 对双实例也成立 | 否；测试覆盖 |
| 可用性 | 各读各库的记录（`action-provider.ts:13-18,49-60`） | 否 |
| 本机页面的授权上下文 | 见 2.3 第 6 点 | **是（S0-2a）** |
| 部分兑现 | 见 2.3 第 1-3 点 | **是（S0-2b-1）** |
| 路由 | 见 2.3 第 5 点 | **是（S0-2b-2）** |
| 视图 | 一个视图只由一个实例提供，否则侧栏出现两份（`renderHomePluginStages` 与项目侧的各渲染一遍） | 测试覆盖（DUAL-14） |

### 2.6 目录声明的形状（问题 4）

- **推荐**：在 `PluginRegistration.runtime` 里加一个可选的可信标记（暂名 `runtime.project_part: true`，名字等 `GLOSSARY.md` 条目定）。`catalog_order`、`manifest`、`summary` 仍然一份。`runtime.scope` 保持字面量 `"home"`，不碍 w5-02 的 `home-runtime-entries.mjs` 对字面量的读取。
- 另一个做法 D2：把 `runtime.scope` 放宽成联合并带第二个工厂。会打破 w5-02 对 `scope` 字面量类型的假设，并让一条注册描述两个装配，不推荐。
- **项目一半**仍然手写在 `project-plugins.ts`（w5-02 PR-1b-4 把有端口的条目留在那里），所以 S0-2 不碰 `project-plugins.ts`，避开 #847、#853 对它的改动。
- 门禁（#840 合入后加到 `scripts/gates/`）：标记 ⇔ 这个 `plugin_id` 同时在 Home 目录条目（有 `runtime`）和项目名单里；带标记的 Manifest 无可选权限；两半的 `bundled` 一致。
- 第三方、沙箱、夹具以外的插件不能带标记：它们不走启动名单（`PluginRuntime.install` 对 `bundled` 的沙箱定义一律以 `plugin.grant_denied` 拒绝，S-15）。这是平台能力，不是给 Shelf 开的私路：任何由宿主装配的插件都可以声明。

## 3 切片

| 片 | 内容 | 主要文件 | 与在途 PR 的冲突 | 能否先合 |
| --- | --- | --- | --- | --- |
| **S0-2a** 授权上下文按作用域取记录 | `local-web-actions.ts` 拆表；`installOf` 按 `provider.project_id` 选库；`validate_authority` 同一函数；先写红测试（用假宿主，不需要 S0-2b） | `apps/local-host/src/local-web-actions.ts`；`tests/dual-instance-authority.test.ts` | #851 改同文件的 68-80 行（`bindLocalWebActions`），不重叠；其余没有 | **能，先合。** 不依赖任何别的片，也不改行为（今天没有双实例） |
| **S0-2b-1** 实例只兑现自己的一半 | `assertContributionMatchesManifest` 加 `partial`；`pluginActionProvider` 的 `definitions` 由处理器反查；`HomePluginExecutor.start` 对 partial 跳过；标记在 `plugin-entry-identity.ts` 里用 WeakSet 记（同 `bundled`）并经 `home-plugins.ts` 与项目平台传到 `PluginRuntime` 的 `actions` 选项；服务 gate 加实例区分（2.3 第 7 点，可拆出去） | `packages/plugin-runtime/src/{contribution,action-provider,index,action-scope,model-service,owner-files-service,materials-service,background-service}.ts`；`apps/local-host/src/{home-plugin-executor,plugin-entry-identity,home-plugins}.ts`；`tests/dual-instance-contribution.test.ts` | #812 同改 `plugin-runtime/src/index.ts`、`home-plugins.ts`、`plugin-entry-identity.ts`、`plugin-host-services.ts`、`plugin-actions-client.ts`；#857 同改 `plugin-runtime/src/index.ts`；#851 同改 `home-plugins.ts`。都是几行的位置冲突，后合的一方解 | 能，但它是共享核心（plugin-runtime），进批、按共享核心跑全量；建议 #812 合入后再开，或叠在其上 |
| **S0-2b-2** 声明与装配 | `PluginRegistration.runtime` 加可信标记；`plugin-scope-entries.ts` 放行显式双实例；`home-plugin-http.ts` 回落；夹具类型加同名选项；门禁；host.md、GLOSSARY、privileges PG-012、SECURITY-INVARIANTS 新行；`pnpm api:update` | `packages/contracts/src/platform/plugin-registration.ts` 和 API 快照；`apps/local-host/src/{plugin-scope-entries,home-plugin-http,home-side}.ts`；`scripts/gates/*`；`skills/molis-plugin-dev/host.md`；`docs/system/{GLOSSARY,SECURITY-INVARIANTS}.md`；`specs/repository-anti-corruption/privileges.md`；测试 `tests/dual-instance-{routes,declaration}.test.ts` | #826 改 `plugin-registration.ts`；#840 改 `scripts/gates/{home-runtime-entries,catalog-entries}.mjs`、`host.md`、`privileges.md`、`AGENTS.md`；#843、#848、#812、#847 改 SECURITY-INVARIANTS（合并时重取空号）；不碰 `project-host.ts`、`project-plugins.ts`、`web-request.ts`，避开 #847、#853 | 代码部分能在 #826 之后先合；门禁那一小块等 #840 |
| S0-2c 双实例端到端夹具与覆盖测试 | 夹具插件：Home 动作 2、项目动作 2、一个端口、两条路由、一个视图；`tests/fixtures/dual-plugin.ts`；覆盖测试遍历所有带标记的注册（现在为空，S2 起 Shelf 自动被覆盖） | `tests/`、`tests/fixtures/` | 无 | 随 S0-2b-2 同批 |

**顺序**：S0-2a →（S0-2b-1，S0-2b-2）→ S0-2c → Shelf S1 → S2。S2 要求 S0-2b-2 已合：Shelf 的目录条目一加 `runtime`，`projectScopeEntries` 就会在每个项目启动时抛「不能同时在 Home 与项目启动名单里」。

**不要做的**：
- 不改 `ActionDefinition`（会改哈希、要升版本、变 MCP 工具名）；
- 不在 `project-host.ts` 加任何按插件名的分支；
- 不预写安全不变量编号；
- 不把项目实例搬进 `runtime`（w5-02 PR-1b-4 留手写，等 PG-005 和 L2）。

## 4 安全不变量

### 4.1 现行行的变化

| 行 | 变不变 | 内容 |
| --- | --- | --- |
| S-08（MCP 授权，提供方就是登记时的 `provider_id`；登记另带 `plugin_install_id`，说明读哪一份安装的授权） | **补一句** | 同一个插件的 Home 实例和项目实例登记同一个提供方和同一个 `plugin_install_id`，各读自己所在库里的那份记录；宿主不把两个库的记录并成一张表。其余不变 |
| S-15（插件权限；`bundled` 只来自宿主启动名单） | **补一句** | 双实例要求两份名单里都标 `bundled`，且 Manifest 权限全是必需；一个实例的授权不借给另一个。标记只来自宿主的启动名单，Manifest 和安装记录里没有这个字段 |
| S-18（撤权、停用、重装后的旧句柄失效，新世代不继承） | **补一句** | 世代是每个库每条记录自己的；停用或重装一个实例，不使另一个实例的句柄失效，也不复活它的旧句柄；`validate_authority` 只拿同库的记录比世代 |
| S-31（Home 路由在哪个项目里运行只看路径） | **补一句** | 双实例插件在项目路径下：Home 声明过的路由由 Home 实例答；Home 没声明的路由回落到项目实例，不被 Home 的 404 盖住，也不由 Home 实例代跑项目的处理器；不带项目前缀的路径不在任何项目里，项目路由不可达 |
| S-34（常开插件） | 不变 | Shelf 的项目实例仍对每个项目启动 |

### 4.2 新行（不预写号，开 PR 时按 main 加在途 PR 取空号）

1. **双实例的身份与授权键**：授权上下文、嵌套调用的授权复核、MCP、路由都按（所在库、`install_id`）取记录，不按 `install_id` 单取；项目实例的权限被收窄或撤销后它的动作不可用，即使 Home 记录还持有，反之亦然。测试断言「拒绝」。
2. **双实例的声明只能来自宿主**：标记只在宿主自己的启动名单条目上；没有标记的插件（沙箱、第三方、夹具）仍要兑现全部声明，同一个 `plugin_id` 同时出现在两份名单而没有显式声明，启动前就拒绝；`partial` 只放宽「声明了没提供」，「提供了没声明」永远拒绝。
3. **实例间的服务句柄不互借**（2.3 第 7 点），若不做则此行不写，并在 S0-2 的 PR 里写明没做的理由。

### 4.3 读代码推断出的边界缺口（未实测）

`model-service.ts:79,90`、`owner-files-service.ts:26`、`materials-service.ts:32`、`background-service.ts:22` 只比 `install_id`。双实例下两个实例的 `install_id` 相同，实例 A 的动作拿到实例 B 的服务句柄（只有插件自己把句柄存进模块全局才可能）会被放行；句柄本身的失效仍由各自记录的世代管着，所以不是越权访问别人的数据，而是跨实例用了不该用的授权。写测试时若找不到这条拒绝，就是缺陷：先补最小的拒绝（比较实例世代）。

## 5 验收标准草案（`DUAL-` 前缀；写进新 spec 的验收行，测试名带编号）

`DUAL-` 在 `specs/`、`docs/`、`tests/` 里没有占用（已 grep）。放哪个 spec 由 ② 定，建议新建 `specs/dual-instance-plugins/spec.md`（开头状态句，完成后按 `specs/README.md` 归档），或并入 `specs/repository-anti-corruption/privileges.md` 的 PG-012 行下。

| 编号 | 验收 | 测试 |
| --- | --- | --- |
| DUAL-01 | 同一个 `plugin_id` 的 Home 实例和项目实例可同时运行；两个库各一条记录，`install_id` 相同、`installation_generation` 不同 | `tests/dual-instance-actions.test.ts` |
| DUAL-02 | 两个实例的动作 `provider_id` 都是 `plugin_id`；动作 id 不相交；两边登记同一个动作 id 时第二个登记以 `capability_duplicate` 被拒，不静默覆盖 | 同上 |
| DUAL-03 | Manifest 的每个动作恰好由一个实例提供（并集 = Manifest、交集为空）；漏一个或多一个测试失败。该覆盖测试遍历所有带标记的注册，S2 起自动覆盖 Shelf | `tests/dual-instance-coverage.test.ts` |
| DUAL-04 | 带标记的条目只兑现自己的一半；提供了 Manifest 没声明的处理器仍以 `plugin.contribution_unredeemed` 拒绝；没有标记的插件（含第三方、沙箱）仍必须兑现全部声明 | `tests/dual-instance-contribution.test.ts` |
| DUAL-05 | 带标记的 Home 实例，Manifest 里有端口、事件、成果、过程项声明也能启动，且拿不到项目的成果库、端口、事件服务；不带标记的 Home 条目仍整体拒绝 | 同上 |
| DUAL-06 | 本机页面调用：两个实例的动作各按自己库的记录授权；撤销项目记录的授权，项目实例动作不可用、Home 实例动作照常；反之亦然；嵌套调用的 `validate_authority` 在授权有效时通过、撤销后答 `actions.forbidden`（不再因世代不同误拒） | `tests/dual-instance-authority.test.ts`（S0-2a 先红后绿，用假宿主） |
| DUAL-07 | MCP：一份客户端授权（`provider_id = plugin_id`）对两个实例的动作都有效；工具名不变；撤权后排队中的调用被拒 | 同上 |
| DUAL-08 | 工作流精确引用钉着 `plugin_id`，Home 动作和项目动作各自解析到自己的提供方，不报 `provider_changed`；钉着别的提供方仍报 | 同上 |
| DUAL-09 | HTTP：项目路径下 Home 声明过的路由由 Home 实例答（S-31 的项目核对不变）；项目实例的路由不被 Home 的 404 盖住；不带前缀的项目路由答 404；两边路径加方法不相交，相交则启动前拒绝；不带标记的插件对未声明的路径仍答 404 | `tests/dual-instance-routes.test.ts` |
| DUAL-10 | 项目实例调 Home 实例动作：Manifest 自有路径到得了只给 `user` 的动作，`consumes` 路径只到受众含 `agent` 的动作；Home 实例动作内部（无项目）调项目范围动作答 `actions.project_required`；Home 路由在项目路径下被调时可以调；持有 `actions:delegate`（#843 之后）的 Home 实例按原调用者的权限，不越过 | `tests/dual-instance-actions.test.ts` |
| DUAL-11 | 授权不互借：把项目记录的某必需权限撤掉，项目实例的相应动作不可用，即使 Home 记录持有；Home 记录撤掉同理。带标记的 Manifest 含可选权限时门禁失败 | `tests/dual-instance-authority.test.ts`、门禁 |
| DUAL-12 | 启动名单：同一 `plugin_id` 在两份名单里，只有显式声明且两边都 `bundled` 才放行；只标一边、`bundled` 不一致、夹具未声明，启动前抛错；沙箱定义标 `bundled` 仍以 `plugin.grant_denied` 拒绝 | `tests/dual-instance-declaration.test.ts` |
| DUAL-13 | 生命周期：停用或重装 Home 实例，项目实例的旧句柄不受影响、Home 的旧句柄不能复活；项目删除后 Home 实例的数据保留（Shelf 的数据在 Home），项目实例的记录随项目走；关闭 Home 先使全部 Home 句柄失效 | `tests/dual-instance-lifecycle.test.ts` |
| DUAL-14 | 视图只出现一次：Manifest 的每个视图在 `plugin_stages` 和项目侧栏里只由一个实例提供，不出现两份 | `tests/dual-instance-coverage.test.ts` |
| DUAL-15 | 目录缓存（#851）：同一遍目录里，两个库里相同 `install_id` 的记录不互相串；一个库的记录被改，另一个的可用性不变 | `tests/dual-instance-authority.test.ts`（依赖 #851，未合则延后） |
| DUAL-16 | 实例间服务句柄不互借：项目实例的动作拿 Home 实例的模型、主人文件、材料、后台句柄调用被拒 | `tests/dual-instance-contribution.test.ts`（2.3 第 7 点做了才有） |

**测试计划**
- 夹具：`tests/fixtures/dual-plugin.ts`，两个 `PluginDefinition` 共用一个 Manifest（Home 动作 2 个、项目动作 2 个、一个输入端口、两条路由、一个视图），再加一个不带标记的同名对照夹具，用来证明放宽只对标记生效。
- 夹具经宿主的 Home 夹具名单与项目夹具名单装配，不碰真实 Home；只在临时 Home 里跑（本机没有真实 Home）。
- S0-2a 的授权测试用假宿主，不依赖 S0-2b。
- 新增的拒绝测试登记进 `docs/system/SECURITY-INVARIANTS.md` 新行的「测试」列，`pnpm test:security` 能跑到；`pnpm health:check` 看表。
- 门禁与快照：`pnpm api:update`（`plugin-registration.ts` 的 API 变）、`pnpm actions:update`（预期无变化，S0-2 不改动作）、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`。
- 本机运行方式：`node scripts/run-tests.mjs tests/dual-instance-*.test.ts`，重命令经 `coord-shared/tools/heavy.sh` 排队；不跑全量、不跑浏览器用例。S0-2b-1 是共享核心，合并前进批跑全量。

## 6 谁定

### 6.1 ② 自己定（实现层取舍，不放宽信任边界）

- 实例归属用 P1（隐式加可信标记），P2 留作终局；标记的名字与位置（`runtime.<标记>`）；夹具选项名。
- 切片拆成 S0-2a、S0-2b-1、S0-2b-2、S0-2c 及合并顺序；S0-2a 先合。
- Home 路由回落只对带标记的插件生效，其他插件的 404 不变。
- `local-web-actions.ts` 的两张表拆法；实例世代加进服务 gate（建议做；若 ② 认为范围太大，可单独成片，但要在新行里写明没做）。
- DUAL 编号放哪个 spec；新行不预写号；#822、#843 在补丁里写的 S-41 要在各自合入前改号，这是 ② 对这几个 PR 的协调，不需要问用户。
- 「部分兑现」放宽的是「声明了没提供」而不是「提供了没声明」：这个方向不放宽信任边界，② 可定，但要在 PR 里写明对插件作者的影响（`CONTRACT-CHANGES.md`：本方案不改合同）。

### 6.2 要用户弹窗

| 编号 | 问题 | 建议 | 为什么要问 |
| --- | --- | --- | --- |
| **U1** | 双实例插件的授权：每个实例各一条记录，人只在 Home 那条上管；要不要加「项目实例有效授权 = 项目记录 ∩ Home 记录」 | **A：沿用各一条，同时要求双实例插件的 Manifest 权限全部必需（门禁查）。** 先不做交集；真有带可选权限的双实例插件时再做方案 B | 这是授权语义和 S-15 的措辞（人关掉的可选权限不应在项目库的全新安装里重新打开）；Manifest 权限是并集，项目记录会持有它用不到的 Home 一半权限；这两件事要让用户知道 |
| **U2** | 双实例是不是只给宿主装配的插件（`bundled`，Home 夹具）开放；第三方、创作台生成的插件现在装不了 Home 实例，所以也没有双实例 | **只开放给宿主装配的插件**；写进 host.md，并在 `specs/repository-anti-corruption/spec.md` §1 记一行：与 2026-10-18「待遇一样」的关系，是同一个缺口（Home 实例对外部插件尚未开放），不是给内置插件开的私路 | 触及用户 2026-10-18「插件不分官方、个人…」的原则，值得一句确认 |
| U3（可并入 U1，不单独弹） | 「服务 gate 加实例区分」是否列为 S0-2 必做 | 做，成本小 | 安全加固，若 ② 判断不属于用户决定，可自己定 |

**用户 2026-10-20 定（② 弹窗，两项都选推荐）：**

- **U1 选 A。** 每个实例各一条授权记录，人只在 Home 那条上看和管。双实例插件在 Manifest 里的权限全部写成必需，由门禁检查。项目那条记录会持有只有 Home 一半才用到的权限，这一点写进 host.md 和 S-15 那一行。交集方案（B）等真有需要可选权限的双实例插件时再做。
- **U2 选 A。** 双实例先只开放给宿主装配的插件。写进 host.md，并在防腐 spec §1 记一行：这和 2026-10-18「待遇一样」是同一个平台缺口（外部插件还装不了 Home 实例），不是私路。
- **U3 由 ② 自己定：做。** 服务 gate 加实例区分，属于安全加固，放进 S0-2b-1。

用户已经定过、不再问：「同一个 id 双实例」（`migration-todo.md` 第 22 行）。Shelf 三件（本机页面抓取权限、`origin_realpath` 读原文件、图片上限 50）在 `platform-queue.md` 顶部另行排期，与本计划无关。

### 6.3 要在 PR 里写给评审的

- 对插件作者：没有合同变化（P1）；对宿主作者：新增一个可信标记，并写明哪些检查被放宽、哪些没有。
- 对在途 PR：#812、#857、#851 的位置冲突；#826 的合同文件；#840 的脚本；各 PR 安全不变量的编号冲突。
- 本计划没有做的：Shelf 自己的声明（S2）、Shelf 项目实例的手写部分搬进 `runtime`（等 PG-005、项目库 L2）、方案 B 的授权交集、P2 的 Manifest `instances` 一节。

## 附：未能完全核实的

- 「并集等于 Manifest」在运行时不被强制（P1 的取舍），只有覆盖测试。
- 4.3 的服务 gate 缺口是读代码推断，没跑过。
- 对 #843、#848、#857 的判断来自文件清单和 #843 的 diff，未逐行核对它们的最新分支。
- 本计划没检查 `home-side.ts` 的夹具类型怎样加同名选项（S0-2b-2 的细节）。
- 没有逐个核对所有 `apps/local-host/src` 里读取 `install_id` 的位置；已核过的是上表所列，找到的唯一真冲突是 `local-web-actions.ts`。S0-2a 的测试加上 DUAL-06～08 是兜底。

## 10-20 补：评审留下的顺手项（⑤ 评 #877、#882，不挡合并）

- **S0-2b-2** 一起做：
  - `validate_authority` 选库与 `installOf` 用同一个判断（#877）。
  - `specs/dual-instance-plugins` 的状态句写上 #877，删掉对本地笔记的引用（#877）。
  - `outside_project` 用 Runtime 自己的 `actions.project_id` 核对，合进 `redeem` 那一行（#882）。
- **S0-2c** 之后：收回测试用的入口导出（#877）。
