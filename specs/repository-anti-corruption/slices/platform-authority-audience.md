# 授权与受众：隐藏的个人插件、自调用的受众、跨项目读取范围

状态：统筹已审、照稿开工（2026-10-24，防腐线 ac-platform，按 `origin/main` `df5527f27` 重核；§9 是统筹的裁定与必改）。做的是 `privileges.md` 的 PG-013、PG-028、PG-014 三行，合成一个 slice。验收号 RAC-580～593，S 号全是暂定（见 §6）。

## 1. 重核结果（对着 `df5527f27`）

三行的缺口在 main 上都还在，行号有两处和 `privileges.md` 不同，下面写现在的。

### 1.1 PG-013：隐藏了的个人插件，动作还能调

- 个人插件（`personal: true`）在项目里只是「默认显示、人可以隐藏」，隐藏的名单存在目录里（`catalog.listHiddenPlugins(projectId)`）。页面、标签、侧栏文件源的口径是 `shownProjectPlugins(启用, 隐藏)`（`apps/workbench/src/plugin-catalog.ts:58`；常开插件即 Shelf 忽略隐藏）。
- 动作可用性不用这个口径：`apps/local-host/src/project-action-availability.ts:7-10` 的 `projectPlugin()` 遇到个人插件返回 `null`，`live()` 与 `snapshotForDiscovery()` 因此一律放行。`availableProjectPluginIds`（`plugin-catalog.ts:71`）也把所有个人插件无条件加进可用集合。
- **同一个洞还在路由层，`privileges.md` 的行没点到**：`apps/local-host/src/web-project-platform-routes.ts:169` 的 `runtimeEntry?.personal ||` 对 `/api/plugins/<插件>/…` 的个人插件直接放行，不看隐藏。只修动作可用性的话，隐藏了的 Pages 还能经路由调。
- 用到 `projectActionAvailability` 的入口：项目 MCP（`mcp-server.ts:88-92`，动作可用性与场景可用性）、Web（`web-server.ts:75-86`，单库夹具模式照旧例外）。Agent、工作流经同一个动作目录，所以只改这一处就覆盖。
- 受影响的个人插件（`personal: true`）：alchemist、cognia、dataset、form、images、issues、jelly、lingguang、pages、plugin-builder、ppt、shelf（常开，不能隐藏）、todo、workflows。
- 没有「隐藏」可言的调用保持放行：无项目（Home，`project_id` 为 null）、项目已删（`catalog.project_not_found`）。个人空间是目录里的真项目（`personal-space.ts`），可以隐藏插件，按普通项目处理。

### 1.2 PG-028：插件调自己的动作时丢了外层受众

- `apps/local-host/src/plugin-actions-client.ts:99` 的 `actionCaller`（`:85`）给「插件经 `services.actions.invoke` 调自己的动作」造的调用者，`audience` 写死 `"user"`，只有 `actor_id`、`signal`、`query_only` 取自外层（`outer`）。外层是 agent、mcp、workflow、plugin 的，嵌套的自调用一律升成 `user`。入口是 `:175` 的 `if (own && !job)`；后台作业里的自调用另走依赖路径，是 `plugin` 受众，没问题。
- 谁把 `audience === "user"` 当特权读（升成 user 就拿到的东西）：材料模型下载（`packages/plugin-runtime/src/materials-service.ts:77`，`allowModelDownload`）、原始文件认领（同文件 `:105`）、成果库导入（`apps/local-host/src/artifact-actions.ts:46-48`）、终端服务（`plugin-terminal-service.ts:27`）、Goals 的人确认类动作（`tree-actions.ts`、`decision-action.ts`、`board-actions.ts`、`configuration-actions.ts`、`deliverable-actions.ts`、`input-actions.ts`）、Todo 的全部项目读写（PG-014）、记忆的「立即整理」（`memory-host.ts:136`）。`privileges.md` 只点了 `allowModelDownload`，实际是整类。
- **还有一条洗法**：别的插件按 `consumes` 调来的动作（外层 `plugin` 受众）自调用，被洗成 `user`，再用 `services.actions.directory` 升成工作流受众；`pluginActionDirectory.originOf`（`plugin-action-delegation.ts:30`）拒的是外层 `plugin`，拒不到洗过的。
- 外层之外（`start`、`start` 里设的定时器、没有 Host 签发 control 的地方）的自调用：同一处，也是 `user`。S-39 的现有用例（`tests/security-invariants-plugin-materials.test.ts` 的「S-39 RAC-26」）证明 agent、mcp、workflow、plugin 的**直接**调用不能下载，没覆盖自调用。
- 带 Host 签发 control 的路由里的自调用（`routedActions`）取的是路由的调用者，受众由入口给，是对的，不改。`plugin-page-actions.ts:35` 的 `own ? "user"` 是人自己的页面发来的调用（页面请求带 Host 的 `assertCurrent`），也不改。`discover()` 只列自己的动作，不执行，不改。
- 现有一条用例把现状当合同：`tests/security-invariants-plugin-action-delegation.test.ts`「W5-01-DELEGATE-03」`assert.equal(inner.audience, "user")`，注释说「user 受众让 originOf 放行」。它的外层 `s.caller` 是 `user`，改后内层仍是 `user`，断言不变，只改注释。

### 1.3 PG-014：Todo 自己判断能不能读全部项目

- Todo 是 Home 级插件（`registration.ts` 的 `runtime.scope: "home"`），所有待办在一个库里，`project_id` 是一列。
- `plugins/native/todo/src/actions.ts:179-182` 的 `todoAccess`：`everything` 只在 `caller.audience === "user"` 时给，否则 `actions.forbidden`。读的 `list` 看输入 `all_projects`（页面的 `all=1`，`plugin.ts:51`）；写的 `status`、`archive`、`update`、`delete`、`batch`、`revert`、`link`、提醒、整理（`organize-actions.ts:134-140`）一律 `todoAccess(caller, caller.audience === "user")`，也就是本人在任何项目里都能按 id 改任何项目的待办。`search.ts:61` 的 `own` 同理。
- 读取范围（哪些项目）是插件用受众猜的，平台没给过清单：隐藏了 Todo 的项目、已删的项目，照样出现在 `all=1` 里（V-11）。
- 受众由 PG-028 的洞污染：自调用升成 `user`，Todo 就把它当本人。所以 PG-028 必须先于 PG-014 落。
- 测试直接构造 `TodoAccess { everything }` 的有 4 个浏览器用例（`todo-assistant`、`todo-draft-recovery`、`todo-placement`、`todo-from-inbox`），形状改了要同步。
- V-19（个人空间语义不一致）归 ③，不在本片。

## 2. 做法

### 2.1 PG-013：可用性按「此刻在这个项目里显示不显示」判

- `projectActionAvailability` 对个人插件不再返回 `null`：读项目的启用名单和隐藏名单，用 `shownProjectPlugins(启用, 隐藏)` 判；不在其中返回 `actions.plugin_disabled`（沿用现有文案「此项目未启用该插件」）。常开插件始终显示，所以不受影响。`ui.embedded_plugins` 的闭包照旧，但隐藏是终局：个人插件被隐藏后，不论有没有显示的插件嵌入它，都不可达（可用性判断分不出调用是不是经嵌入来的，统筹 2026-10-25 定）。
- 无项目、`catalog.project_not_found` 的调用，个人插件放行；项目级插件的行为不变（无项目或项目不存在仍拒）。
- 路由层 `runtimePluginsRoute` 去掉 `runtimeEntry?.personal ||`，改用同一个判断（一份函数，动作可用性与路由共用，不各写一份）。
- 每次调用读目录，不跨调用缓存，取消隐藏后立即可用。

### 2.2 PG-028：自调用沿用外层受众

- `pluginHostActions` 里自调用（`own && !job`）按外层决定调用者：
  - 外层是动作或场景（有 `outer`）：受众取 `outer.caller.audience`。外层是 `plugin` 的，走现成的 `dependencyCaller`（带 Host 签发的 `host_plugin` 与 `plugin_install_id`，`allowed_actions` 只含这个动作），不手造 `plugin` 受众的调用者。外层是别的受众，仍由 `actionCaller` 造，其余字段（`actor_id`、`permissions: context.grants`、`allowed_actions`、`signal`、`query_only`、`validate_authority`）不动，只把写死的 `"user"` 换成外层受众。
  - 没有外层、也没有 Host 签发的路由 control（`start`、`start` 里的定时器）：**受众是 `plugin`**（同后台作业，S-52），走 `dependencyCaller`。动作的 `audiences` 到不了 `plugin` 的（`actionReachesAudience`），自调用被拒。
- `allowModelDownload` 的判断不用改：`materials-service.ts:77` 本来就读执行上下文里的受众，受众对了它就对了。S-39 的字句改成「本人的直接调用，或自调用且最外层是本人」。
- 不改：路由里的自调用、`plugin-page-actions.ts`、`discover()`、依赖调用、`services.actions.directory`。

### 2.3 PG-014：读取范围由平台给，插件只用清单

- 两样都要（S-15 的口径，统筹 10-24 定）：Manifest 声明一条权限 `projects:reach`，由人在安装时授予，安装确认里看得到；动作上写 `project_reach: "person"`，只许写在 `scope: "home"` 的动作上（SDK 的 Manifest 检查是同一条规则）。只有写了它、并且安装持有 `projects:reach` 的动作拿得到清单。
- 新增调用上下文字段 `readable_project_ids?: readonly string[]`（`ActionCallContext`，Host 填、不读输入，每次调用现算、不缓存）。Host 在派发带声明的动作时，对 **受众是 `user` 且操作者是本机这个人**、**安装此刻持有 `projects:reach`** 的调用，给出清单：目录里没在关闭或删除中的项目里、该插件还在显示（与 §2.1 同一个判断）的那些。授权没有或被撤回、别的受众（agent、mcp、workflow、plugin）、本人以外的操作者，都不给这个字段。内置的 Todo 也照这条走，没有特例。
- 清单与「调用在哪个项目」是两件事：`caller.project_id` 仍是调用所在项目，清单只管读写别的项目的 Home 级记录。
- Todo：`TodoAccess` 的 `everything: boolean` 换成 `projectIds: readonly string[]`（可见项目）；`todoAccess` 里不再出现 `audience`：`list` 带 `all_projects` 时可见项目 = 清单，没有清单就是 `actions.forbidden`（保持现在对 agent 的行为）；其余写动作用清单（有就用，没有就只有调用所在的项目）。`search.ts:61` 同改。
- 自调用（PG-028 之后）继承外层的受众，也就继承外层有没有清单；插件不能给自己升。

## 3. 验收

- **RAC-580**（新 `tests/security-invariants-hidden-personal-plugin.test.ts`）：被嵌入（`ui.embedded_plugins`）的个人插件被隐藏后，嵌入也不放行（隐藏是终局），它的动作被拒；个人插件在项目 A 隐藏后，`projectActionAvailability` 的 `live` 与 `snapshotForDiscovery` 两条路对它的动作都返回 `actions.plugin_disabled`；没隐藏的项目 B 可用；常开的插件（Shelf）由目录的列表带进来、隐藏改变不了它，判断里没有它的名字（T3 之后列表来自同意账本）；无项目、项目已删的调用，个人插件可用，项目级插件仍拒。
- **RAC-581**（同文件，走项目 MCP 的真实路径）：隐藏了 Pages 的项目，MCP 的工具列表里没有 `pages.*`；直接调用被拒 `actions.plugin_disabled`，处理器没跑。
- **RAC-582**（同文件，走项目 Runtime 路由）：隐藏了的个人插件的 `/projects/<id>/api/plugins/<插件>/…` 返回 `actions.plugin_disabled`；没隐藏的照常；Home 级路径（无项目）不受影响。
- **RAC-583**（同文件）：取消隐藏后立即可用，加上不缓存的断言（隐藏、调用被拒、取消隐藏、再调用成功，同一个 Host 里连续做）。
- **RAC-584**（新 `tests/security-invariants-plugin-self-call.test.ts`）：外层是 agent、mcp、workflow 的动作 A，经 `services.actions.invoke` 调自己的动作 B，B 看到的 `audience` 与外层相同；外层是 `user` 的，B 仍是 `user`（`actor_id`、`allowed_actions` 与现在一致，DELEGATE-03 的断言保持）。
- **RAC-585**（同文件）：外层是别的插件按 `consumes` 调来的（`plugin` 受众），A 自调用后 B 仍是 `plugin`；B 里用 `services.actions.directory` 被拒 `actions.forbidden`，目标处理器没跑（原来能被洗成 `user` 再升工作流受众）。
- **RAC-586**（同文件）：`start` 里、`start` 里设的定时器里自调用，受众是 `plugin`；动作的 `audiences` 到不了 `plugin` 的被拒，处理器没跑。
- **RAC-587**（`tests/security-invariants-plugin-materials.test.ts` 加在「S-39 RAC-26」旁）：agent、mcp、workflow 的外层动作经自调用要 `allowModelDownload`，语音助手没带 `--allow-model-download`，`material.model_required`；`user` 外层则带；定时器里的自调用不带。变异检查：把自调用的受众改回 `user`，这条失败。
- **RAC-588**（同文件）：S-39 的表（agent、mcp、workflow、plugin）再加「自调用」一栏，每一栏都不下载、不落地模型。
- **RAC-589**（`tests/plugin-manifest-v2.test.ts`）：`project_reach` 写在 `scope: "project"` 的动作上，`parsePluginManifest` 拒；写了 `project_reach` 却没声明 `projects:reach` 权限也拒；写在 `scope: "home"` 的上放行；合同快照（`pnpm actions:update`）出现这一项。
- **RAC-590**（新 `tests/security-invariants-project-reach.test.ts`）：本人调带声明的动作，上下文里的清单 = 此刻显示该插件、没在关闭或删除中的项目；隐藏该插件的项目、已删的项目不在；agent、mcp、workflow、plugin 调同一个动作，上下文里没有这个字段；**没授 `projects:reach` 的安装（或授权被撤回之后）拿不到清单**；清单每次现算（隐藏、取消隐藏之间连续两次调用，清单跟着变）。
- **RAC-591**（`tests/todo-actions.test.ts`，改现有「scope」用例并加一条）：`all_projects` 对没有清单的调用（Agent，或没带 `readable_project_ids` 的）仍 `actions.forbidden`；有清单的本人调用只看到清单里的项目；`actions.ts` 里决定范围的行（带 `projectIds`、`readable_project_ids` 的）与 `search.ts` 里没有 `audience` 的比较（源码断言；`actions.ts` 的操作者标签 `actor` 只用来写历史，不决定范围，不在此列）；`store-types.ts` 的 `TodoAccess` 是 `projectIds`。
- **RAC-592**（`tests/security-invariants-project-reach.test.ts`，走真实 Host，因为隐藏要经项目目录；`todo-actions.test.ts` 的 `ActionService` 夹具没有目录）：隐藏了 Todo 的项目 B 的待办，不出现在本人的 `all=1`，按 id 的 `get`、`update`、`status` 读为 `todo.not_found`；取消隐藏后出现，版本不变。
- **RAC-593**（`tests/security-invariants-project-reach.test.ts`）：插件拿不到升级：处理器输入、返回里带 `readable_project_ids` 无效（只读 Host 的上下文）；agent 外层的自调用没有清单、`all_projects` 被拒；本人外层的自调用有清单。

变异检查：RAC-580 去掉新判断、RAC-585 去掉对 `plugin` 外层的处理、RAC-590 去掉对受众的筛，各自失败。

## 4. 碰的文件（预计）

- 平台：`apps/local-host/src/project-action-availability.ts`、`web-project-platform-routes.ts`、`plugin-actions-client.ts`（自调用的调用者）、`plugin-host-services.ts` 或 `home-plugin-executor.ts`（填清单，开工前核）；`packages/contracts/src/platform/actions.ts`（`readable_project_ids`、`project_reach`）、`platform/plugin.ts` 的 Manifest 动作类型；`packages/plugin-sdk` 的 Manifest 检查（`pnpm api:update`）。
- Todo：`plugins/native/todo/src/actions.ts`、`organize-actions.ts`、`search.ts`、`store-types.ts`、`store-support.ts`、`manifest.ts`（动作声明）、`caller.ts`；`tests/todo-*.e2e.test.ts` 4 个的 `TodoAccess` 形状。
- 动作合同快照 `tooling/gates/actions/`（Todo 动作加声明，`pnpm actions:update`）、SDK 与 contracts 的公开 API 快照（`pnpm api:update`）。
- 文档：`docs/system/SECURITY-INVARIANTS.md` 三行、`apps/local-host/README.md` 等「开发要求」里写到可用性、自调用受众的地方、`docs/system/CALL-CHAINS.md` 如有引用。
- 不碰：`modules/projects`（目录读口径用现成的 `listProjects`、`listProjectPlugins`、`listHiddenPlugins`）、`privileges.md` 状态列（写进 PR 正文）。

## 5. 要统筹定的

1. **PPT 依赖 Pages**：PPT 的 Manifest `consumes` 了 `pages.content.read`、`pages.content.list`。隐藏 Pages 之后，那个项目里 PPT 读 Pages 会得到 `plugin_disabled`。建议：照 `privileges.md` 的字句，隐藏就拒；依赖的显示由 PPT 的页面解释（和项目级插件被关一样）。要保住的话，另选「被显示的插件 `consumes` 的个人插件也算可用」，那会多一条规则和一类测试，建议不做。
2. **无外层的自调用（§2.2）改成 `plugin` 受众**：仓库里自调用都是带 control 的路由或动作里的嵌套，没有发现 `start`/定时器里的（开工前再扫一遍，见 §7）。发现有就按那处的需要处理，不为它保留 `user`。
3. **`project_reach` 的名字与 Manifest 位置**：建议写在动作上、只许 Home 级动作用；备选是写在插件权限里（`projects:reach`）让安装确认直接问。前者简单，后者对第三方更明白。信任边界（安装确认的展示）归统筹定。
4. **S 号**：三行暂定 S-68、S-69、S-70（§6），落地时按顺序定。

## 6. SECURITY-INVARIANTS（暂定）

- S-68（PG-013）：个人插件在项目里隐藏后，动作（目录、MCP、Agent、工作流）和路由都拒，返回 `actions.plugin_disabled`；常开插件不能隐藏；无项目、项目不存在没有隐藏可言。测试：RAC-580～583。
- S-69（PG-028）：插件调自己的动作沿用外层受众，`plugin` 外层不被洗成 `user`，没有外层的自调用是 `plugin`；`allowModelDownload`、原始文件认领、`directory` 都据此。测试：RAC-584～588。
- S-70（PG-014）：跨项目读取范围只来自 Host 填的 `readable_project_ids`，只给本人、只给声明了 `project_reach` 的 Home 级动作，清单里没有隐藏了该插件和不存在的项目；插件不判断受众。测试：RAC-589～593。

## 7. 开工前再核

1. 扫全部插件（含 `tests/` 的夹具）里没有外层的自调用点：`rg "services.actions.invoke|actions.invoke\("`，逐个看是不是在路由（带 control）或动作里；起一个断点式用例统计 `outer === undefined && scope.caller === undefined` 的次数。
2. `grep -rn 'audience === "user"' plugins/native`，看除 Todo 之外还有没有拿受众当「跨项目」判断的（Issues、Cognia、Dataset 等 Home 级插件）；有的并进 `project_reach`，没有就写明。
3. 清单在哪一层填：`home-plugin-executor.ts` 的 Home 实例派发与 `plugin-host-services.ts`，选离 `withCatalog` 最近的一处；看沙箱插件（PG-017）的执行上下文是整体序列化还是只传白名单字段，清单要能序列化（所以是数组，不是函数）。
4. 目录读口径的开销：一次本人调用最多多读 `listProjects` 加每个项目两次名单，只对带声明的动作做；确认 Todo 页面的列表请求没有因此变慢（本机不跑浏览器，交 CI）。
5. `plugin-picker`、Dock 对隐藏个人插件的其它路径（`agent-reference-kinds.ts`、`assistant-pages.ts`）已经按 `shownProjectPlugins` 走，确认没有第三套口径。
6. 同一批路径有无在途 PR：`gh pr list --state open` 里改 `plugin-actions-client.ts`、`project-action-availability.ts`、`todo/src/actions.ts` 的。

## 8. 本机验证计划（做完代码后）

只做构建、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`pnpm secrets:check`、`pnpm api:update` / `pnpm actions:update` 以及新写的非浏览器用例（RAC-580～593 里不要浏览器的）和 `tests/todo-actions.test.ts`、`tests/security-invariants-plugin-action-delegation.test.ts`、`tests/security-invariants-plugin-materials.test.ts`；不跑 affected 全集、浏览器用例、全量。`affected-tests --json` 的 `full` 与选中数写进 PR 正文。

## 9. 统筹的裁定与必改（2026-10-24）

1. PPT 依赖 Pages：隐藏了就拒，不加「被依赖就可用」的规则。
2. 没有外层的自调用改成 `plugin` 受众；§7 第 1 条的扫描结果写进 PR。
3. `project_reach` 要权限和动作声明两样都有（§2.3 已按此改），内置 Todo 同样。
4. S 号暂定 S-68～70 可以，落地时统筹按顺序定。
5. 「常开插件始终显示」：ac-trust T3（PR #1259）把常开改成从同意账本算（`ProjectPluginRegistry.alwaysOn()`，可撤回）。PG-013 的判断只读目录的列表（`listProjectPlugins`，已含常开的），不再有自己的常开特判；T3 进 batch-36 后，RAC-580 的常开断言改成经目录（统筹 2026-10-24 定）。
6. `ui.embedded_plugins` 的闭包保留，但隐藏是终局：被隐藏的个人插件，嵌入那条路也不放（可用性分不出是不是经嵌入来的；统筹 2026-10-25 按代码的严口径定，RAC-580 已加断言）。
7. `readable_project_ids` 每次调用现算；正在删除的项目不进清单；沙箱插件的执行上下文能带这个字段（数组），写一条沙箱路径的断言，或写明 PG-017 之后再补并开 BL。结果：沙箱 worker 没有调用上下文，声明了 `project_reach` 的沙箱插件默认拿不到清单（关着）；后续怎么给记在 BL-625。
8. 和 ac-registry 对齐：它的 B1 会把 `shownProjectPlugins` 这类平台事实搬进 `apps/local-host/src/plugin-registry.ts`。本片的判断函数只写一份，先放在 local-host 平台这一侧；两边谁后到谁重基，同批评审就照 `MERGE-QUEUE.md` §1a 同批落。
8. （统筹 2026-10-25）`homeProjectReach` 与 `project-plugin-enablement` 改用 `projectReachablePlugins` / `pluginReachable` 同一个函数，不留第二份判断；Todo 动作不升版（只改了 traits，schema 没变）；S 号由统筹落地时统一改。
