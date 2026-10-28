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
- **Coding 设置页的宿主特例**（`web-catalog.ts` import `codingAgentManifest` 与 `CODING_SETTINGS_UI_CONTRIBUTION_ID`，为 Coding 单独拼设置页的模型）：这是给一个插件在宿主里开的私路，要改成插件设置贡献的通用路径。`web-catalog.ts` 是巨大单元，单独做，记 BL-522（已做：#1300，`fc1e03c3c`，2026-10-27）。
- **创作台**（`agent-definitions/builtin-instructions.ts` import plugin-builder）：2026-10-18 起创作台不算插件，是平台能力，不在本行。
- **`project-plugins.ts`、`web-assets.ts`**：Plugin Runtime 监督器的装配与插件客户端包的分发，是规定的装配口，不是特权。

## 验收

| 编号 | 标准 |
| --- | --- |
| RAC-660 | 引导的 Pages 文档与 Todo 整理只经动作目录里随宿主发布的提供方：`tests/context-onboarding.test.ts`、`tests/context-onboarding-todo.test.ts` 的原断言不改照样通过（含 ONB-LIM-04 超长材料分段）；`context-onboarding-service.ts` 不再 import 插件包。 |
| RAC-661 | 目录里没有随宿主发布的那个提供方（没登记、没授权，或只有第三方同名能力）时，引导不写任何文档，按 `actions.dependency_missing` 拒绝；测试在注释里写 RAC-661。 |

## 首评收尾 WO（2026-10-25）

状态：三项已修，工程与有限回归通过，待独立审验及采用；本 WO 负责人 Codex，整片仍由 ac-kernel 负责。精确父提交 `b1efde0b5907f33fddb59b3c811a6ffc5266d4a9`，只落实 [PR #1298 首评](https://github.com/molis-ai/molis-work/pull/1298#issuecomment-6400190728) 的三条非阻塞意见。目标为工程修正及有限回归证据，独立审验、全量与合入由原流程接续。

`draftTodos` 在同一个 `try` 中只发现一次 `todo.organize.extract@1`，固定 `TODO_PLUGIN_ID`。仅在还有未完成批次时创建首个调用者并发现目录；空批次、所有批次已缓存时仍直接就绪。首批复用该调用者，后续批次仍各建原有的 20 分钟取消信号，不把整轮绑成一个超时窗口。发现失败仍写入 `todo.status/error`，不挡总览；调用时继续由动作分发器复核提供方、授权和取消。

对 `pageBound` 增加有限代表输入的对照（PG031-F02）。batch-39 整合时引导取 PG-088 的精确拆分（按 Pages 的 `pages.body_too_large` 对半再转，RAC-615～618），`pageBound` 与 `pages.create@2` 的分段路径一并删去，这条对照和它的测试也随之删去：它只证明那份估算，现在没有估算可证；分段是否完整由 RAC-617 的两条测试证明。

全 tracked 消费者核对后，Todo 的 `organize.ts` 改直接取 `contracts/modules/todo`，移除 `organize-model.ts` 和插件 `index.ts` 的常量重导出。数值仍为 `60_000`；contracts/SDK 的导出和动作 schema/版本不变，只有 Todo 插件包的冗余公开出口删除，原来从该出口取值的调用方须改取 contracts。仓库实际代码只有 `organize.ts` 经过内部重导出；宿主已直接取 contracts。现行 API 快照覆盖 contracts 和 SDK，不覆盖 Todo 插件入口，因此只有实际快照受影响时才刷新。

允许修改：引导服务、必要 Todo 消费者、少量相关测试及本 slice；必要时刷新确实变化的 API 快照。PG-049、原作者目录/通知 WIP、Memory、Runtime 安装、成果类型声明、共享状态及门禁不在范围内。

### WO 验收

| 编号 | 标准与证据 |
| --- | --- |
| PG031-F01 | 实际多批次整理只发现一次目录，各批次仍调用固定提供方与版本、使用独立取消信号；无待处理批次不发现目录。缺依赖、取消或拒绝时失败可见、总览继续，未执行动作不产生 Todo 草稿或待办；由 `tests/context-onboarding-todo.test.ts` 验证。 |
| PG031-F02 | 随 batch-39 整合撤销：`pageBound` 已不在生产代码里（取 PG-088 的精确拆分），没有估算可比；分段由 RAC-617 证明。 |
| PG031-F03 | 常量只在 contracts 定义，实际消费者直接导入 contracts，Todo 两处多余重导出删除；整体构建与 `tests/todo-organize.test.ts` 等有限 Todo 回归通过，无需为机械导入另建镜像测试。 |

验证计划：离线安装后按公共 FIFO 整体 `pnpm build`；`node scripts/run-tests.mjs --jobs 1` 点名有限相关文件，已有有效父证据的 ONB-LIM-03/04 不计划重跑。保留原件、实际执行数、失败/未选边界；运行 boundary、merge-base health、API/混用检查和推送前 fetch + secrets。没有新 full、浏览器批次或真实模型调用，不触碰真实 Home。

### 本轮结果（2026-10-25）

- PG031-F01 通过：`context-onboarding-todo.test.ts` 7/7，含三批次一次发现、三个独立信号、固定提供方/版本；缺依赖与调用前取消均在总览旁明确失败、实际 Todo 批次与条目为零；全部批次已缓存时不创建调用者。空批次的 `total = 0` 走同一 `total > completed` 保护，本轮未单独构造空正文的历史引用。
- PG031-F02 当时通过（对照见原件）；batch-39 整合删去 `pageBound` 后这条测试一并删去。
- PG031-F03 通过：tracked TypeScript 的唯一定义仍是 contracts；Todo 的 `organize-model.ts`、`organize.ts` 和宿主均直接导入，无其他代码消费者需要迁移。整体构建通过；Todo 四文件合计 53/53（7 + 17 + 19 + 10），覆盖真实整理、未选候选、重试/撤销、权限、等待中取消与停用零写入。Todo 插件入口删除一个导出；contracts、SDK 与动作快照无增量变化。
- 整体 `pnpm build` 两次均退出 0，第二次仅清理导出旁的遗留注释后刷新最终产物，均遵公共 FIFO。`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`node scripts/gates/page-assets.mjs --base origin/main` 均退出 0；health 的比较基点为 `54437998`，27 项资源共 7,590,829 字节。混用检查 1462 个测试进程中为 0。
- 首次有限批次命令为 `node scripts/run-tests.mjs --jobs 1 --verbose --test-name-pattern='^(?!ONB-LIM-0[34] )' tests/context-onboarding.test.ts tests/context-onboarding-todo.test.ts tests/todo-organize.test.ts tests/todo-actions.test.ts tests/todo-plugin.test.ts`，退出 1：四个 Todo 文件 53/53，引导 29/30。唯一失败是新增对照未先初始化临时 Host，触发当前 Home 格式检查，尚未执行到编码比较；按相邻夹具先初始化隔离 Host 后修复，没有改 Memory 或生产语义。
- 上述负向名称匹配实际未排除 ONB-LIM-03/04，两条意外执行且通过，原件保留。修复夹具后 `--test-name-pattern=PG031-F02` 单独实际 1/1 通过，再以 `node scripts/run-tests.mjs --test-skip-pattern='ONB-LIM-0[34]' tests/context-onboarding.test.ts` 实际 28/28 通过；此次确实未选那两条，Node 的 `skipped 0` 不代表执行过它们。四个已通过 Todo 文件未重跑，未取消任何运行。

完整构建、首失败与修后运行、门禁、推送前扫描及精确提交差异的原件在 `/tmp/molis-verify-2026-10-25/pr1298-pg031-followups/`，供 REVIEW/TEST/PIPE 直接接续。真实 Home、浏览器、真实模型、PG-049 及原作者 WIP 不在验证范围；原 PR 的独立审验、CI/full 和采用/合入结论不由本轮替代。
