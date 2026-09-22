# 接到本仓库产品

Manifest 写完不等于侧栏有入口。一等插件还要改 Host。第三方只走 Plugin Runtime 的，看 [authoring.md](authoring.md)，不要抄这一页的短名 HTTP。

## Native 一等入口

典型目录：`plugins/native/<id>/src/{manifest,ui,client,styles,en,routes,index}.ts`。私人库对照 Pages / 灵光；不要新建第二张业务 Module 表。

包：`@molis-ai/molis-work-plugin-<id>`。`pnpm-workspace` 已含 `plugins/**`。还要登记依赖，否则 workbench / local-host 解析不到。

### 必改（侧栏能看见、点得动）

1. **合同类型**（有私人记录时）：`packages/contracts/src/modules/<id>.ts`，并在 `packages/contracts/package.json` 加 `./modules/<id>` export。
2. **插件包**：`package.json` 的 `molis-work` 块（path/kind/ssot），以及 `README.md`、`tsconfig.json`、`src/index.ts`（`workspace-packages.mjs` 缺一个就报错）。`index.ts` 必须再导出 Manifest、contribution、stylesheet、client factory、routes，Workbench / Host 从包根 import。
3. **`scripts/workspace-packages.mjs`**：加一条 `entry(...)`，并在 workbench、local-host 的 `extraWorkspaceDependencies` 里加上这个包名。然后 `node scripts/workspace-packages.mjs` 核对。
4. **`apps/workbench/src/plugin-catalog.ts`**：`BUILTIN_PLUGIN_CATALOG` 加一条。`project_plugin_id`、`manifest`、可选 `personal`、`summary`（有 summary 才进内建市场）。
5. **`apps/workbench/src/plugin-workbench.ts`**：`BUILTIN_PLUGIN_WORKBENCH` 登记 `contributions`、`stylesheet`、`clientFactory`、可选 `settingsClient`、`searchRow`。Pages 族照 Pages；Feed/Inbox **没有**插件包里的 factory，客户端在 `apps/workbench/src/scripts/client/navigation-feed.ts` / `navigation-inbox.ts`。
6. **HTTP**：个人插件（Pages 族、Functions、Shelf、灵光）实现 `apps/local-host/src/<id>-native-plugin-http.ts`，再挂进 `personal-native-plugin-http.ts` 的 handler 列表。项目插件（Feed、Inbox、Schedule）挂进 `web-request.ts`。`project_id` 由 Host 从当前项目注入，不要从请求 body 或 MCP schema 收。
7. **英文**：插件 `src/en.ts` 导出 `X_EN`，还要在 `apps/workbench/src/i18n/en.ts` `import` 并 `...X_EN`。只写插件文件，英文界面仍是中文 key。
8. **构建**：`pnpm --filter @molis-ai/molis-work-plugin-<id> build`。根目录 `pnpm build` 含 workspace。
9. **会点名插件名单的测试**：`tests/plugin-declarative-mounting.test.ts`（侧栏/岛/个人插件）、`tests/creative-tools-plugins.test.ts` 的 `PERSONAL_PLUGIN_IDS`、`tests/uninstall.test.ts` 的 `{home}` 库名、有列表时 `tests/list-silent-refresh.test.ts` 的 factory 表。按需改 `tests/plugin-catalog-companions.test.ts`。

导航、设置位置、项目启用：catalog 说由 Manifest 推导。HTTP、客户端、MCP adapter、i18n **不会**自动出现。

### 按需

| 有这个 | 再改 |
| --- | --- |
| `mcp_exports` | `apps/local-host/src/mcp-native-plugins.ts` 的 `NATIVE_MCP_ADAPTERS`；`default_enabled: false`。私人库对照 `mcp-store-plugin-adapter.ts`。缺 adapter、有导出，Host 启动抛错 |
| `behaviors` / Functions 去向 | 下面「接到 Functions」 |
| 插件事件总线 | 下面「接到插件事件总线」；Native 不要抄 |
| 新 Artifact 类型 | 合同 + Artifacts Module，不要只写在插件里 |
| 设置页 | contribution + `settings` 槽 + `settingsClient` |
| 图标名 | 必须是 `packages/design-system/src/icons.ts` 的 `MolisWorkIcon`（灵光用 `idea`）。写了不存在的名字，侧栏那一行还在，图标是空的；不写 `icon` 才落到 `package`。不要往壳层塞 SVG |
| `agent` | `apps/workbench/src/plugin-catalog.ts` 的 `BUILTIN_PLUGIN_AGENTS`。今天只给 Coding、Schedule 填了提示词正文。第三个带 `agent` 的插件不改这里，角色会登记成空正文 |
| 重编辑器 IIFE | `apps/local-host/src/web-assets.ts` 挂 `/assets/…`，页面再引 script。只打 bundle、不挂路径，浏览器 404 |
| 项目启用连带 | `PROJECT_PLUGIN_COMPANIONS`（今天只有 Feed→Inbox） |
| 全局搜索 | Pages 族：`searchRow`。Feed/Inbox/Goals：`apps/workbench/src/scripts/client/global-search.ts` 写死，不会跟 searchRow 走 |
| SSOT | `docs/SSOT-MATRIX.md` 加一行 owner |

## 接到 Functions

函数本身在 Functions 插件里写。本插件只让那个画面能被绑。缺一步，函数页或现场都不会动。

1. 现场按钮已接线（点了真改状态）。
2. Manifest：`behaviors`、需要判断时再加 `function_scenes` + `judgment_subjects`。要判断就写可选 `requires: functions.evaluate`，并把它放进 `capabilities.consumes`。
3. `apps/local-host/src/behavior-catalog.ts` 的 `NATIVE_BEHAVIOR_MANIFESTS` 加上本插件 Manifest。
4. **不要指望新 `scene_id` 出现在「用在哪」。** 去向表是 `functionAuthoringDestinations()` / `sceneBehaviorIds()` 写死的：`home.dock`、`inbox.next`、`feed.capture`。新去向要改合同、绑定 HTTP（对照 `/api/inbox/judgment`、`/api/home/dock-judgment`、Feed 捕捉规则）、`functions-host.ts` 的 `FunctionScenesView`、现场吃建议的 UI。那是平台任务。
5. 对象到来时调用 `JudgmentPort`（Host 用 `createFunctionsJudgmentPort` 注入；Feed 在 `judgeScene`）。
6. 画面读 `suggested_behavior_ids`（Feed：`visibleFeedDispositionIds`；首页：`dock_behaviors`）。判断不自动写。

`home.dock` 属于 Host 首页，不是某个插件的 scene。系统行为（`inbox.done`、`feed.save`…）与插件 `behaviors` 撞号时系统项保留。MCP 工具进 Agent 去向，不进这三处卡底。

现有插件：Feed 用 `feed.capture`，Inbox 用 `inbox.next`。Pages / 灵光有对象处置，但今天没有场景和落地调用，不要新开去向。

## 接到插件事件总线

只给 **Runtime 托管的 app**。Host 接线在 `apps/local-host/src/coding-surface.ts` 的 `createPluginPlatform`。

发布者：

1. 事件 id + payload 形状写进合同（`workspace-artifacts` 一类），让订阅方不 import 你的插件包。
2. Manifest `events.publishes`。
3. `PluginDefinition.event_types`：每种一个 `validate`。
4. `start()` 里 `context.services.events.publish(...)`。

订阅者：

1. Manifest `events.subscribes`，`from_plugin_ids` 写死来源，不许通配。
2. `start()` 返回 `onEvent`。

Native（Feed/Inbox/Pages/…）今天没有这条总线。不要为了「完整」给它们加 `events:`。Integration 的进来走 Signal，不是这条总线。Functions「事件去向」也不是。

## app 一等（Coding 族）

`kind: "app"` 必须真的经 Plugin Runtime `start()`。今天：Coding、Files、Git、Workspace、Diff、Text stats。Host 接线在 `coding-surface.ts` 一类：`createXPlugin`、会话 store、渲目录。

`start(context)` 返回 `kind: "app"`，并且：

- Manifest 每条 `views` → `contribution.views`
- 每条 `routes` → `contribution.routes`
- 每条 `mcp_exports` → `contribution.mcp`（生产 tools/call 未接就不要声明）
- 每条 `behaviors` → `contribution.behaviors`
- 有 `commands` → `commandAvailability` + `executeCommand`
- 有 `events.subscribes` → `onEvent`
- 有 `ports.inputs` → `onUpstreamReady` / `onUpstreamUnavailable`

缺一条或多一条都是启动失败，只影响自己。`stop` 不消耗崩溃恢复额度。

Text stats 是最小完整 app：一个必选输入口、一个 `stage` 视图、无存储、无事件。新端口消费者先抄它的声明形状，再抄 Diff 的 `input_groups`。产品里还没有连线页，抄它不会让输入口自己接上。端口何时投递见 [elements.md](elements.md)。

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
| 本机文档/问卷/表/函数/置物架/灵光 | `{home}/<id>/<id>.db`，按 `project_id` 分区；不要冒充 Module |
| 凭据 | secret 引用 |
| 给别的插件的瞬时协调 | 事件总线（仅 app，≤16 KiB） |

卸载停代码和 binding；已形成的 Goal/Artifact/Signal 引用仍可显示。私人库默认不跟卸载清掉。

## 验证这一步

- `node scripts/workspace-packages.mjs` 无错误。
- 类型：`pnpm --filter @molis-ai/molis-work-plugin-<id> typecheck`
- 定向测试：`node --import tsx --test --test-concurrency=1 tests/<id>-*.test.ts`
- 点名插件名单的测试仍过。
- 真开 Workbench：侧栏或岛出现、点进主路径、刷新后状态还在、增删后列表自己更新且不整页闪白。
