# PG-031 余项：宿主与 horizontal 替别的插件钉提供方、import 别的插件包

状态：工程验证中，待评审与合入（2026-10-25）。负责人：ac-kernel。本片按统筹 10-25 的归类口径，逐处核对 main（`54437998c`）上宿主与 `horizontal/*` 里所有 `retainActionAuthority(…, { provider_id })`、`provider_id:` 字面量，以及 import `@molis-ai/molis-work-plugin-*` 的文件，分四类处理。

## 1. 本片改的

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| `apps/local-host/src/context-onboarding-service.ts`（引导把材料存进 Pages） | import Pages 插件包的 `pagesActions`（`bodyFromMarkdown`、`importDocuments`） | 调 Pages 公开的 `pages.documents.body_from_markdown@1`（markdown 由 Pages 转成正文，太大时 Pages 返回 `pages.body_too_large`、引导对半再转，PG-088）和 `pages.documents.import@1`（带 `request_id` 与 `request_hash`，重试返回原文档）。动作从调用者的动作目录按 `capability_id@version` 找，提供方精确钉随宿主发布的 Pages（`PAGES_PLUGIN_ID`，来自 contracts），与 Goals 的做法一致（#1207：第三方同名能力不会被选中，分发器在处理前拒 `actions.provider_changed`）。宿主不造 Pages 的正文结构（batch-39 整合时取 PG-088 的精确拆分与 import 幂等，不再用本片原先的 `pages.create@2` 加上界估算） |
| 同上（引导整理待办） | import Todo 插件包的 `todoOrganizeActions`（extract、get、apply）与常量 `TODO_ORGANIZE_MATERIAL_CHARS` | 三个动作同样按 `todo.organize.*@1` 从目录找、精确钉随宿主发布的 Todo（`TODO_PLUGIN_ID`）；常量搬进 `@molis-ai/molis-work-contracts/modules/todo`，Todo 自己也从那里取 |
| `apps/local-host/src/artifact-native-plugin-http.ts`（成果库「用 Pages 打开」的筛选） | import Pages 插件包的 `PAGES_READABLE_FILE` | 随 A3（PG-079，RAC-418、419）由 Manifest 声明取代：导入文件的续写名单来自 `artifacts.consumes[].file`，宿主不再需要这个正则，本片不再搬它 |

`context-onboarding-service.ts` 已不再 import 任何插件包。对行为的影响：

- 存进 Pages 的文档和原来一样：正文由 Pages 转换，按实际大小对半拆，标题和「第 k / N 部分」的分法不变，幂等仍是 `documents.import` 的 `request_id` 加 `request_hash`。
- 变的只是怎样找到 Pages：从目录按公开身份找、精确钉提供方，不再 import 插件包；Pages 不在目录里（或只有别的提供方的同名动作）时什么都不写，引导说明原因。

## 2. 平台自己的提供方，不动

这些地方钉的都是平台自己正在跑的那个动作，或者宿主自己登记的提供方，不是替别的插件做事，不算特权：

- `information-actions.ts`（`INFORMATION_PROVIDER_ID`）、`home-actions.ts`（`HOME_PROVIDER_ID`）、`functions-actions.ts` 两处（`FUNCTIONS_PROVIDER_ID`）、`connector-usage-actions.ts`（`system.connectors`）、`scene-configuration-actions.ts`（正在跑的 origin）。
- `horizontal/knowledge` 的 `index.ts` 与 `workspace.ts`（`KNOWLEDGE_PROVIDER_ID`）；`horizontal/search` 的 `index.ts` 与 `references.ts`（`SEARCH_PROVIDER_ID` 或正在跑的 origin）。
- `characters-http.ts`（`CHARACTER_PLUGIN_ID`：Characters 已并进宿主，CHR-1）；`artifact-actions.ts`（成果库是平台能力）。
- `plugin-actions-client.ts` 的 `ownProvider`、`plugin-scheduler-owner.ts` 的 `ports.provider_id`：两处都是调用插件自己的提供方。
- `goals-actions.ts` 的 `invokeShippedGoals`：按 #1207 的裁定，宿主入口精确钉随宿主发布的 Goals，保留。

## 3. 随 FI 迁走，这里不碰

Feed/Inbox 正由 ac-sandbox-sched 迁 Runtime（FI-3～6，分支 `claude/ac-feed-inbox-designs`）。下面这些文件这里不动：

- `content-action-providers.ts`：Feed 的处理器、`linkedContext` 钉 `feedManifest.plugin_id`、`NATIVE_CONTENT_PERMISSIONS` import Pages、Lingguang、Inbox 包取权限。
- `feed-goal-promotion.ts`（钉 `FEED_PLUGIN_ID`）、`inbox-actions.ts`（import Inbox、Feed、Pages 包）。
- `plugins/native/inbox/src/actions.ts`、`plugins/native/inbox/src/pages.ts`（Inbox 声明的跨插件依赖，原按裁定保留精确提供方）。
- 宿主里其余 import Feed、Inbox 包的 `feed-*`、`inbox-scene.ts`、`information-planner.ts`、`workflow-feed-options.ts`、`official-integrations.ts`、`research-library-source.ts`、`demo-plugin-seed.ts`，以及 `web-request.ts`、`web-view.ts`、`web-panel.ts`、`web-types.ts` 里的 Feed/Inbox 部分。

## 4. 别的线，或不属于本行

- **Goals 的宿主私路**（`goal-project-application.ts`、`personal-planning-actions.ts`、`project-database.ts`、`web-goals-read.ts`、`web-planning.ts`，以及 `web-*` 里的 Goals 部分）：随 Goals 的 S 线删宿主私路。MCP 直接 import Goals 的三个文件已在 #1218 改用 contracts 的 `goalEntryActions`，main 上已不存在这种 import。
- **Alchemist 的旧装配路径**（`alchemist-native-plugin-http.ts`、`alchemist-prologue.ts`、`alchemist-search.ts`、`alchemist-service-host.ts`）：在 `tests/builtin-plugin-assembly-gate.test.ts` 的冻结名单里，随 Alchemist 迁 Runtime。
- **Coding 设置页的宿主特例**（`web-catalog.ts` import `codingAgentManifest` 与 `CODING_SETTINGS_UI_CONTRIBUTION_ID`，为 Coding 单独拼设置页的模型）：这是给一个插件在宿主里开的私路，要改成插件设置贡献的通用路径。`web-catalog.ts` 是巨大单元，单独做，记 BL-522。
- **创作台**（`agent-definitions/builtin-instructions.ts` import plugin-builder）：2026-10-18 起创作台不算插件，是平台能力，不在本行。
- **`project-plugins.ts`、`web-assets.ts`**：Plugin Runtime 监督器的装配与插件客户端包的分发，是规定的装配口，不是特权。

## 验收

| 编号 | 标准 |
| --- | --- |
| RAC-660 | 引导的 Pages 文档与 Todo 整理只经动作目录里随宿主发布的提供方：`tests/context-onboarding.test.ts`、`tests/context-onboarding-todo.test.ts` 的原断言不改照样通过（含 ONB-LIM-04 超长材料分段）；`context-onboarding-service.ts` 不再 import 插件包。 |
| RAC-661 | 目录里没有随宿主发布的那个提供方（没登记、没授权，或只有第三方同名能力）时，引导不写任何文档，按 `actions.dependency_missing` 拒绝；测试在注释里写 RAC-661。 |
