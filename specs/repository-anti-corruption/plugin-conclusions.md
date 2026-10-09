# 逐插件的实现、契约、接入与体验结论（W2-18，交付第 10 项）

状态：结论（2026-10-09，main `11878059`）；本文只读代码、不改代码。26 个内置插件和 6 个官方接入逐个对着代码核过，核对用到的证据在 §0 写明，能复现的方法在 §9。

任务要求：`docs/prompts/repository-anti-corruption.md` 交付第 10 项（逐插件的实现、契约、接入与体验结论），以及 `docs/prompts/repository-systematic-review.md` §6（用户任务闭环；占位与半实现；生命周期；空数据、首次使用、无模型；横向比较；组合场景；平台接点）。路线上的位置见 [roadmap-2026-10-07.md](roadmap-2026-10-07.md) 的 W2-18 与「覆盖缺口」；进度与决定在 [spec.md](spec.md)。同一片的另外两份产出：[AI 入口清单](ai-entry-inventory.md)、[前端动线走查](frontend-flow-walk.md)（截图编号写作「截图 NN」，指那份文档里的图）。包级的结构审查（职责、变化原因、放错位置）是 §4.4 的另一片（W1-18 后续），不在这里。

## 0. 怎么读

**五个维度**，每个插件一行，每格先写结论词再写事实：

| 维度 | 问什么 |
| --- | --- |
| 闭环 | 用户要做的事能不能从头做到尾：入口在哪、每一步有没有动作、结果去了哪、能不能继续用 |
| 占位与半实现 | 有没有占位文案、假数据、没人调用的入口、死字段 |
| 生命周期 | 加入或移出项目、停用、升级、删除项目、卸载之后，动作、界面、数据对不对 |
| 空、首次、无模型 | 空数据时界面怎么说；第一次用有没有引导；没有模型或连接时有没有合理路径 |
| 组合 | 和别的插件一起用时，上下文、数据、成果能不能流下去 |

结论词三个：**通**（我核到的路径都对）、**部分**（主路径对，有已列出的缺口）、**缺**（用户会卡住）。

**证据**五种，写在每格或每节的末尾：

- **P 目录探针**：在隔离的临时 Home 里开一个项目、加上全部项目插件，用 `MolisWorkLocalHost.inspectActions` 读动作目录（方法见 §9）。动作数、受众、权限、可用性、接点都出自它。
- **U 界面**：同一个临时 Home 里用无头 Chrome 开真实页面操作，截图在 [frontend-flow-walk.md](frontend-flow-walk.md)；这些页面都是「没有配置任何模型」的状态。
- **R 读码**：路径写在条目里。
- **T 测试**：README「改动后必跑」里点名的文件我核对过都存在（26 个插件、共 167 条引用，同一个文件会被几个插件各引一次，没有一个缺）；本片另外在这棵树上跑了 §8 列的两批，结果写在 §7 与 §8。
- **B 已登记**：`specs/BACKLOG.md` 的编号；我核了现状，没改变它们的结论。

标注 `[已确认]` 读了代码或跑了命令；`[推断]`；`[未验证]` 没有跑通或没覆盖。

**范围与分类。** 26 个内置插件按装配方式分：构建期装配 19（Goals、Sessions、Inbox、Schedule、Feed、Artifacts、Cognia、Plugin Builder、Images、Jelly、Experiments、灵光、Todo、Pages、Form、Dataset、PPT、炼金术士、工作流程），Plugin Runtime 监督器启动 7（Characters、Shelf、Coding、Files、Git、Diff、Text Stats）。范围分项目级 11（可以按项目加入或移出：Goals、Sessions、Inbox、Schedule、Feed、Artifacts、Coding、Files、Git、Diff、Text Stats）和个人级 15（对每个项目常驻，只能「隐藏」，见 §2 的 K-1）。数字取自 `scripts/gates/package-inventory.mjs` 同一份证据，与 [spec.md](spec.md) §5.1 一致。

## 1. 总表

行按族排：目标与工作、写与做、个人、研究、编码与工作区、平台。「§4.n」指向下面逐插件的证据。

| 插件（目录） | 闭环 | 占位与半实现 | 生命周期 | 空、首次、无模型 | 组合 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| Goals（`goals`） | 通 | 通 | 通 | 部分：画布有空状态，空项目没走查 | 通 | 通 §4.1 |
| Sessions（`work`） | 部分：看 Runtime 能力 | 通 | **缺：删项目留下 Session 记录** | 部分：空状态只有一行字 | 通 | 部分 §4.2 |
| Inbox（`inbox`） | 通 | 通 | 通 | 通 | 通 | 通 §4.3 |
| Feed（`feed`） | 通 | 部分：示例项目里有一整套「演示」前端 | 部分：Goals 停用后升格仍写（E-15） | 通 | 通 | 部分 §4.4 |
| Schedule（`schedule`） | 部分：只能按钟点跑，没有「立即跑一次」 | 通 | 部分：服务不在就不响（BL-030） | 部分：创建时不查模型与工作区 | 部分：只读 Agent，到点才暴露缺什么 | 部分 §4.5 |
| 工作流程（`workflows`） | 通 | 通 | 通 | 通：无模型时在衔接处写明 | 通：它就是组合器 | 通 §4.6 |
| Pages（`pages`） | 通 | 部分：`stub` 死字段与「未接模型」残留 | 通 | 通：写作命令灰着并写原因 | 通 | 通 §4.7 |
| Form（`form`） | 通 | 通 | 通 | 通 | 部分：与数据表的衔接靠导出再粘贴 | 通 §4.8 |
| Dataset（`dataset`） | 通 | 通 | 通 | 通 | 部分：同上 | 通 §4.9 |
| PPT（`ppt`） | 通 | 通 | 通 | 通 | 通：可从 Pages 文稿出大纲 | 通 §4.10 |
| 成果（`artifacts`） | 通 | 通 | 通 | 部分：空列表缺使用说明；搜索摘要露出内部 id | 通 | 部分 §4.11 |
| 图片（`images`） | 部分：真实厂商没测；生成的图不进成果库 | 通 | 通 | 通：先连接服务有引导 | 部分 | 部分 §4.12 |
| 灵光（`lingguang`） | 通 | 通 | 通 | 通 | 通：转文档、Jelly、Goal、待办 | 通 §4.13 |
| 待办（`todo`） | 通 | 通 | 通 | 通 | 通 | 通 §4.14 |
| Jelly（`jelly`） | 通 | 通 | 通：个人库、不按项目分区 | 通：拆解有手工路径 | 部分 | 通 §4.15 |
| Cognia（`cognia`） | 通 | 通 | 通 | 通：横幅 + 打开模型设置 | 部分 | 通 §4.16 |
| Shelf（`shelf`） | 通 | 部分：兼容入口 `shelf.jobs.run`、首次自动放示例 | 通 | 通：`shelf.no_model` | 通：材料交给 Coding | 部分 §4.17 |
| Characters（`characters`） | 通 | 通 | 部分：要并进宿主设置（决定 #26） | 通 | 部分 | 部分 §4.18 |
| 实验（`experiments`） | 部分：本地 grok/laya 要自己配 | 通 | 部分：库没有版本，卸载不清 | 通 | 缺：没有别的插件消费它的结果（个人研究工具，按设计） | 部分 §4.19 |
| 炼金术士（`alchemist`） | 通 | 部分：死的测试用运行时放在 `src`、README 数字过期 | 通 | 部分：失败后卡片露出原码 | 部分 | 部分 §4.20 |
| Coding（`coding`） | 通 | 通 | 通 | 通 | 通 | 通 §4.21 |
| Files（`files`） | 通 | 通 | 通 | 通：说明要绑定工作区 | 通 | 通 §4.22 |
| Git（`git`） | 通 | 通 | 通 | 通 | 通 | 通 §4.23 |
| Diff（`diff`） | 通 | 通 | 通 | 通 | 通 | 通 §4.24 |
| Text Stats（`text-stats`） | 通 | 部分：它是平台的最小参考插件，却在用户的插件列表里 | 通 | 通 | 通 | 部分 §4.25 |
| 插件创作台（`plugin-builder`） | 通 | 通 | 通 | 通：选模型与打开设置都在顶栏 | 缺：目录里没有任何动作，助理、MCP、工作流用不了 | 部分 §4.26 |

数字：结论列通 15、部分 11，没有「缺」；单个维度里的「缺」有 3 处（Sessions 的生命周期、实验与插件创作台的组合），原因都在 §2；E-1 至 E-16 共 16 条新发现。

## 2. 本片新发现

按建议先后排。**K** 是「已有 BACKLOG 编号、我复核了现状」的，**E** 是本片新发现、之前没有登记的（E-15 是写完正文后补查生命周期时加的、E-16 是复核出站网络时加的，所以表里排在 E-14 后面、K 组前面）。严重度：中 = 用户或数据会受影响；低 = 体验、清理或文档。「去向」写建议的处理片或需要的决定。

| # | 严重度 | 发现 | 证据 | 去向 |
| --- | --- | --- | --- | --- |
| E-1 | 中 | **删除项目不清 Sessions 记录。** 项目的 Session 登记在 Home 的 `sessions/sessions.db`，项目删除的登记表（`apps/local-host/src/project-deleted-owners.ts` 的 `homeProjectOwners`，探针取到的 owner 为 pages、form、dataset、ppt、workflows、todo、functions、lingguang、images、alchemist、plugin-builder、assistant、memory、search）里没有它 | P：建项目、`registry.createSession({ project_id })`、`catalog.deleteProject(...)`，`cleanup_state: "complete"`，之后 `registry.list({ project_id })` 仍返回 1 条 | 给 Sessions 加 `project_data` 声明（`plugins/native/work`，和 Todo 的 `project-data.ts` 同形）并补 `tests/project-deletion-owners.test.ts` 一例；属 W2-07（项目删除统一）的收尾 |
| E-2 | 中 | **Characters 的草稿写入没有权限声明，且对助理、MCP、工作流开放。** `characters.create`、`characters.update`、`characters.state` 的 `permissions` 是空数组、受众是 `SHARED`（用户、工作流、助理、MCP）；角色决定将来 Agent 的工具范围与提示词 | R：`plugins/native/characters/src/actions.ts` 第 34–38 行；P：这三个动作在 agent 与 mcp 受众的目录里都出现 | 加 `characters:write`，或把受众收到仅用户；Characters 本来要并进宿主设置（决定 #26），可以随那一片做，但不要等太久 |
| E-3 | 低 | **Feed 在示例项目里带一整套「演示」前端。** 示例项目的 Feed 没有消息时，客户端凭空补出三条消息（「GitHub · adeptify」「Gmail · product@adeptify.ai」「RSS · Latent Space」）和对应来源，按钮只改页面状态、「拉取」是 `setTimeout` 模拟；还有一整条 prototype 详情渲染 | R：`apps/workbench/src/feed-projection-ui.ts:37-40`、`:118`、`:122-197`、`:319-371`；`apps/workbench/src/scripts/client/events-primary.ts:497-632`；`plugins/native/feed/src/ui.ts` 的 `renderPrototypeFeedDetail`（`:370`）与 `renderPrototypeSourceDetail`（`:578`）；U：把示例项目 Feed 的消息清掉后出现（截图 23） | 删掉，示例项目的内容由种子写成真实的 Feed 行（现在 `demo-seed` 已经写了真实消息与来源）；属 W2-02 死代码批；页面资源预算会因此下降 |
| E-4 | 低 | **成果的搜索摘要露出内部 id。** 搜索条目的摘要把成果载荷里所有字符串拼起来，没有字段白名单，第一个字符串是文档 id | R：`plugins/native/artifacts/src/actions.ts:43-49`（`payloadText`）、`:155`；U：搜「周报」，成果那条摘要是「…8a4cf60-5069-4cf5-aab8-a313f6f607ae 周报草稿」（截图 13）。同类已登记：BL-096（Feed 摘要露出内部值） | 只取标题、正文、文件名这类声明过的字段；顺带让「搜内部 id 能搜到成果」这件事消失 |
| E-5 | 低 | **成果空列表缺使用说明。** 说明文字写在详情区的空状态里（`browser-ui.ts` 的 `detail()`），而主区的空列表只渲染一行「还没有成果」（`browser-ui.ts:46`），所以用户看到的是一行字和「导入」按钮 | R；U：截图 06 | 把 `detail()` 里那句话挪进列表的空状态，用和别的插件一样的 `mw-empty` 块 |
| E-6 | 低 | **Sessions 空状态只有一行字**：「这个项目还没有 Session」，没有图标、没有说明、没有主操作（主操作在右上角） | U：截图 05；对比 Feed、Pages、Schedule、Workflows 的空状态都是图标 + 标题 + 说明 + 主操作 | 同上，用共用的空状态块 |
| E-7 | 低 | **炼金术士无模型时的卡片露出内部名与原码**：「失败 / Prologue · 等待执行」「……可重新炼化。RUNTIME_NOT_CONFIGURED」。同一页的讨论区里另有一条写得好的提示和「打开模型设置」。另外 README 写「Studio 的 41 项业务」，目录里是 54 个动作；`studio/server/runtime/fixture-research-runtime.ts` 里有个只被插件测试引用的 `FixtureResearchRuntimeAdapter`（会生成 `fixture://research/…` 的假证据），而生产代码从同一个文件导入端口类型 | U：截图 18；P：alchemist 54；R：`plugins/native/alchemist/README.md:21`、`fixture-research-runtime.ts:30` 与 `research-runtime-selector.ts:3` | 卡片只显示「还没有可用模型」一条并带按钮；把端口类型挪到 `host-port.ts` 一类的文件，测试用的假运行时移进 `tests/`；README 改数字。无模型的可用性声明见 [AI 入口清单](ai-entry-inventory.md) §7 第 4 项 |
| E-8 | 低 | **Pages 的 `stub` 死字段与「未接模型」残留**（`pages.ai` 的输出合同写死 `stub: false`，编辑器与 `actionItemsFromText` 里还有占位文稿时代的分支） | R：`plugins/native/pages/src/actions.ts:107`、`ai.ts:77`、`:85-86`、`editor-browser.ts:3333` | 同 [AI 入口清单](ai-entry-inventory.md) §7 第 3 项；输出合同变了要刷新 API 快照 |
| E-9 | 低 | **Pages「新建文档」立刻落库一条空的「未命名文档」，退出不清理**：点完马上返回，列表里留下这一条，刷新后还在 | U：Pages 点「新建文档」后立刻返回、再刷新，列表里仍有「未命名文档」（截图 11 的左栏也能看到留下的那一条）；灵光点「记下第一条灵光」也立刻出现「未命名灵光」，离开时是否丢弃没有验证 [未验证] | 产品行为，先问；我倾向「内容为空就在离开时丢弃」，`pages.discard` 已经有 |
| E-10 | 低 | **Pages 灰色命令的标签被挤成逐字换行**（「解/释」「提出反/例」「读者视/角」），因为原因文字占掉了标签列的宽度 | U：截图 11 | 样式调整，标签不换行或原因放到第二行 |
| E-11 | 低 | **Shelf 的兼容入口 `shelf.jobs.run` 没有任何内置调用方**：界面走 `jobs.extract` 与 `jobs.generate`（`plugins/native/shelf/src/route-handlers.ts:90`），只有测试调用；声明写着「兼容入口」「旧调用兼容」，成本是 `unknown`，AI 分支的 `model:invoke` 只在处理器里查、没写进它的声明权限 | R：`plugins/native/shelf/src/actions.ts:79`、`:165-176`；T：`tests/shelf-ai-host.test.ts:137-143` | 删掉（不留兼容，合同变了要刷新快照）；这是兼容标记门禁里该减的一处 |
| E-12 | 低 | **Shelf 首次打开自动放一份「试用示例.pdf」**（`modules/shelf/src/store.ts` 的 `ensureSample`，只放一次，可删除） | R；U：截图里 Shelf 一打开就有一份材料 | 产品行为，保留也可以；只是和「不生成演示数据」的口径要写明是有意的 |
| E-13 | 低 | **Text Stats 是平台的最小参考插件，却出现在用户的插件列表里**（「更多」一栏） | R：`plugins/native/text-stats/README.md`（「The smallest complete Plugin in the system … keep the platform honest」）；U：截图 03、30 | 产品行为，先问：保留作示例、隐藏进开发者模式，或删 |
| E-14 | 低 | **Diff 与 Text Stats 的页面版式偏离 DESIGN.md 的「插件舞台」**：内容从窗口边缘约 46px 起、全宽，页头与说明贴左，空状态是一行小字，而不是「居中最宽 960px、页头在左、操作在右、空状态用 `mw-empty`」（`DESIGN.md` Layout 的 Plugin stage 与 Toasts, alerts and empty states 两节）。别的插件页都是后者 | U：截图 30、31（对照 24、25、27） | 按插件舞台的版式重做这两页的 UI 贡献，样式不新写 |
| E-15 | 中 | **Goals 从项目里移除后，Feed 的「升格为 Goal」仍然成功并写进 Goals 的数据。** `feed.items.promote` 的可用性只看宿主有没有给它 `promote` 端口（`enabled = !!ports.promote`），不看 Goals 在这个项目里是否启用；Goals 自己的动作全部是 `actions.plugin_disabled`，所以这条 Goal 用户看不见，加回 Goals 才出现 | P：同一个临时项目，加入全部项目插件、造一条 Feed 消息，移除 Goals 后目录里 `feed.items.promote` 仍 `available: true`，调用返回成功；同一时刻 `goals.list` 报 `actions.plugin_disabled`（移除 Goals 时目录里变化的非 Goals 动作只有 `feed.goals.context` 一个）；R：`plugins/native/feed/src/item-actions.ts:46`、`:86-90`（`promote` 端口，`bind(…, !!ports.promote)`） | 让这个动作的可用性与 `offers` 里的「升格为 Goal」都跟 Goals 的项目启用状态走（和 `feed.goals.context` 一样），或把升格改成经 Goals 动作写；属 W2-08（Goals 无生产调用方的桥删除）要一起看的那一类宿主端口 |
| E-16 | 中 | **炼金术士的市场脉搏自带三个公开来源，其中 GitHub 的令牌直接读环境变量 `GITHUB_TOKEN`。** `createLocalRuntime` 在没有指定 `pulseSourceMode: "fixture"` 时（宿主从不指定，只有测试指定）建 Toolify、观猹、GitHub 三个来源，GitHub 来源的第二个参数是 `process.env.GITHUB_TOKEN`；它不经连接器，也不是 Settings 里的密钥引用，所以开发机或服务环境里碰巧有这个变量，令牌就会被带到 `api.github.com` 的搜索请求里，用户在界面上看不到、也关不掉。出站范围本身是收紧的（固定主机名单、跳转复验、12 秒、8,000,000 字节上限，但上限是读完整个响应后才检查），README 也写了这三个来源；问题只在令牌的读法和这条出站没有登记进统一的出站清单 | R：`plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.ts:118-130`、`sources/http-source-client.ts:30-60`（`SafePublicHttpClient`）、`sources/github-source.ts`；`apps/local-host/src/alchemist-service-host.ts:14,50`（`pulseSourceMode` 只透传）；`git grep -n pulseSourceMode` 的非测试命中只有这两处；对照：官方 GitHub 接入的令牌来自 Settings 绑定（`plugins/official-integrations/github/src/provider.ts:136-155` 的 `resolveToken()`，没绑定时提示去设置里绑定） | 建议：脉搏的 GitHub 来源改用连接器的密钥引用（没绑定就不带令牌，GitHub 搜索匿名也能用，只是限额低），删掉 `process.env.GITHUB_TOKEN`；三个来源的主机登记进 AI 清单 SE-3 并让界面写明「市场脉搏会访问 Toolify、观猹、GitHub」。改动小，但属于插件行为与密钥口径，先问；我倾向这样做 |
| K-1 | 中 | **个人插件在项目里「移除」只是隐藏，动作仍可用**：插件选择器里 13 个个人插件有「移除」按钮；逐个移除（含选择器里没有的 Characters 与插件创作台，共 15 个）后，目录里它们的动作一个都没有变成不可用；助理与 MCP 仍然调得到 | P：逐个移除后「无可用性变化」；R：`apps/local-host/src/project-action-availability.ts` 只处理非个人插件。已登记：BL-088（用户 2026-10-01 已定「停用」，高优先级、未做） | 按 BL-088 做 |
| K-2 | 低 | **Schedule 创建时不查模型与工作区**：Prologue 与已绑定的工作区在到点才查，缺了就「叫醒失败」 | R：`apps/local-host/src/schedule-task-runner.ts:33`、`:38`；U：截图 17（创建成功、已启用、下次 09:00） | 见 [AI 入口清单](ai-entry-inventory.md) §7 第 5 项，先问 |
| K-3 | 低 | **插件创作台在 Dock 里显示内部 id `plugin-builder`**，插件列表里却是「插件创作工作台」 | U：打开创作台后底栏左下角写 `plugin-builder`（截图 29），插件列表里是「插件创作工作台」（截图 03）。已登记：BL-114 | 按 BL-114 |
| K-4 | 低 | **Schedule 与定时只在服务进程活着时运行**；Todo 提醒在关闭期间也不送达 | R；已登记：BL-030 | 按 BL-030 |

## 3. 横向比较

同类插件放在一起看，找重复的框架与不一致的语义，同时保留合理的业务差异。

**H-1 文档族（Pages、Form、Dataset、PPT）合同面一致。** 四个都有：`*.artifacts.pin/compare/continue`、`*.placement.move/copy`、`*.content.list/read/receive/create`、`*.search.entries`、`*.subject.read`、「存为固定版本」入口、`ai_available` 随列表给出并让界面禁用 AI 按钮（P+R）。差别是合理的：Pages 的 AI 是 16 个写作命令，走选区旁的情境条；Form 拟一道题、Dataset 拟一列名（不发表内数据）、PPT 出大纲。不一致的有两处：**撤销**只有 Pages（2 个动作声明了 `undo`）、灵光（1）、Todo（8）声明，Form、Dataset、PPT 的改写与删除没有撤销声明（Dataset 另有版本与回退）；**侧栏文件**只有 Pages、Dataset、PPT 提供（`files.entries`），Form 没有。[已确认，P]

**H-2 模型选择入口分散。** 默认模型没有「默认」设置项，取的是供应商列表里第一个可用的（`apps/local-host/src/configured-models.ts` 的 `selectConfiguredTextModel`）；助理、Pages、Form、Dataset、PPT、Todo、灵光、Workflows、Inbox 都吃这个默认，界面不显示用的是哪一个。另外 5 处有自己的选择入口：Jelly（`jelly.model.configure`，偏好存 `{home}/jelly/preferences.json`）、Alchemist（`alchemist.runtime.configure` 与「研究偏好」）、Shelf（设置页）、插件创作台（顶栏）、实验（「参试模型」）；Cognia 用默认，但页面写出用的是「Prologue · 供应商 · 模型」。「设置 › 模型设置」说明文字是「配置后可在聊天时选择使用」，但助理面板里没有看到模型选择入口 [未验证]。[已确认，R+U]

**H-3 空状态用了两套。** 共用的 `mw-empty` 块（图标 + 标题 + 说明 + 主操作）：Pages、Form、Schedule、工作流程、实验、图片、灵光、Coding、Cognia、炼金术士、Feed。裸短句：Sessions、成果、设置里的「还没有配置供应商」；Inbox 的短句是有意的（「只看需要你介入的事项」，空就是好事）。[已确认，U]

**H-4 项目数据的删除声明有三种写法。** 构建期插件在目录条目上声明 `project_data`（images、lingguang、todo、pages、form、dataset、ppt、workflows，加 Functions 模块）；炼金术士、插件创作台、助理、记忆、搜索由宿主在运行服务里登记 owner；Sessions 没有（E-1）。Runtime 插件（Coding、Shelf、Characters、Files、Git、Diff、Text Stats）不需要：Coding 的会话在项目库，Shelf 与 Characters 是个人库不按项目分区。[已确认，R+P]

**H-5 「需要工作区」的插件文案一致但没有直达。** Coding、Files、Git、Diff（间接）、Text Stats 依赖项目设置里的浏览目录，页面都写「请在项目设置的工作目录中选择可用浏览目录」，只有页面左上角的「工作目录设置 >」能走过去，说明文字里没有按钮。[已确认，U]

**H-6 命名中英混用。** 插件列表里 Goals、Inbox、Feed、Sessions、Schedule、Pages、Forms、Dataset、PPT、Jelly、Cognia、Shelf、Coding、Files、Git、Diff、Text Stats 是英文，工作流程、成果、图片、灵光、待办、实验、炼金术士是中文。`docs/system/GLOSSARY.md` 的「界面用词待批清单」已经收这类问题，这里不另开。[已确认，U]

**H-7 有些动作只给用户。** `coding.runs.start`、`coding.sessions.update`、`coding.reports.save`、`coding.changesets.save`、`coding.plans.save`、Sessions 的管理类（创建、归档、关联、交接）、Goals 的受保护决定（`goals.tree.decide`、`goals.relations.*`、`goals.policy.save`、`goals.decisions.record`）只对用户受众开放；助理启动 Coding 走委托工具与 `agent.run.*` 能力，不走 `coding.runs.start`（[AI 入口清单](ai-entry-inventory.md) AG-1、AG-2）。这是对的（写入与决定要人批），差别只在于这些动作在助理的能力搜索里看不到。[已确认，P]

## 4. 逐插件证据

每节固定顺序：定位、闭环、占位与半实现、生命周期、空与无模型、组合、测试、已登记。动作数与受众来自 P。

### 4.1 Goals（`plugins/native/goals`）

- **定位**：构建期装配、项目级、67 个动作、导航与设置两个视图。
- **闭环（通）**：新建 Goal → 列表、树、看板、规划图 → 记事件（`goals.note`、`goals.progress.record`、`goals.events.report`）→ 约定与要求（`goals.agreement.set`）→ 收尾（`goals.closure.submit`）→ 交付物与输入（`goals.deliverables.*`、`goals.inputs.*`、`goals.artifact_inputs.*`）→ 历史（`goals.history.*`、`goals.timeline.list`）。受保护的决定（`goals.tree.decide`、`goals.relations.*`、`goals.policy.save`、`goals.decisions.record`）只给用户本人，对不受保护的入口探针显示不可用并写原因。界面：新建 Goal 对话框叠在 17 条的树上（截图 04）。
- **占位（通）**：标记搜索 9 处，全是真功能；`renderMomentumPlaceholder` 是加载占位，画布另有真实的空状态「还没有 Goal」（`momentum-ui.ts:51`）。
- **生命周期（通；一处跨插件的写入见 E-15）**：移除后 59 个动作新变为不可用，另 7 个本来就只给受保护入口，剩下 1 个个人范围的动作（`goals.planning.personal.list`）不受项目影响；Feed 的 `feed.goals.context` 随之不可用（P）。数据在项目库，删项目随库走；个人规划方法包在 `catalog.db`，卸载并清除时删。
- **空与无模型（部分）**：不用模型。空项目的呈现靠 `tests/onboarding-journey.e2e.test.ts`、`tests/project-user-journey.e2e.test.ts`；本次走查没有空项目的 Goals 截图 [未验证]。
- **组合（通）**：灵光「建成 Goal」、Pages 选区「拆成目标步骤」（截图 10）、Feed「升格为 Goal」、四个文档族「存为固定版本」→ 成果 → Goal 交付物与输入。
- **测试**：`tests/goals-actions.test.ts`、`goal-event-create-flow.test.ts`、`goal-tree-event-flow.test.ts`；浏览器用例 `tests/goal-*.e2e.test.ts`、`goals-*.e2e.test.ts` 共 25 个文件。
- **已登记**：BL-098（首页把 Feed 消息算成个人事件，待决）。

### 4.2 Sessions（`plugins/native/work`，目录 id `sessions`）

- **定位**：构建期装配、项目级、18 个动作、导航视图。Runtime 会话的登记簿（Home 的 `sessions/sessions.db`，`modules/private-work-context`）。
- **闭环（部分）**：新建 Session（选 Runtime、当前 Goal、工作目录，确认后才请求 Runtime 创建，不自动发消息；入口 `data-open-session-add`，对话框是探索所见、未收进截图集）、关联已有、发消息与重试、恢复、归档、交接（准备、更新、发送、取消）。能不能读内容、发消息取决于所选 Runtime 声明的能力，不支持时写「这条 Session 的 Runtime 暂不提供内容读取能力」（`plugins/native/work/src/ui/read-model.ts:60`），这是如实的能力降级，不是占位。
- **占位（通）**。
- **生命周期（缺）**：E-1，删项目不清 Session 记录。卸载并清除时 `sessions/` 整个删（HOME-DATA §3，`installer/uninstall.ts`）。
- **空（部分）**：E-6，只有一行字。
- **组合（通）**：Session 带当前 Goal；交接把一份 Goal 上下文交给另一个 Session（`sessions.handoffs.prepare` 需要 `goals:read`）；示例项目的种子写了两个 Session（`demo-plugin-seed.ts`）。
- **测试**：`tests/work-session-actions.test.ts`、`session-handoff.test.ts`、`session-association-journey.e2e.test.ts`。

### 4.3 Inbox（`plugins/native/inbox`）

- **定位**：构建期装配、项目级、15 个动作。
- **闭环（通）**：条目来自 Feed 的「加入 Inbox」或别的插件的内容交接（`inbox.content.receive`）→ 处理（完成、忽略）→「转为待办」（Workbench 调 Todo 新建，原条目保留为来源，不改状态）→「整理材料到 Pages」（`inbox.pages.generate` 复用 Pages 生成）→「下一步建议」（`inbox.judgment.*` 经已绑定的判断规则）。
- **占位（通）**。
- **生命周期（通）**：移除 Inbox 会把 Feed 一起移除（Feed 要求 Inbox 同行，`PROJECT_PLUGIN_COMPANIONS`），Feed 的 35 个动作也一并不可用（P）；数据在项目库。
- **空与无模型（通）**：空「现在没有需要你介入的事项」（截图 24）。无模型：它的 AI 动作 `inbox.pages.generate` 的可用性与 Pages 一致，目录显示不可用、历史仍可读（`tests/pages-cross-module.test.ts` 第一例，本片跑过通过）。`inbox.judgment.evaluate` 没有绑定规则时不可用（`actions.binding_required`）。
- **组合（通）**：Feed → Inbox → Pages → 成果（§7 S2）。
- **测试**：`tests/inbox-plugin.test.ts`、`inbox-prepared-pages.test.ts`、`inbox-pages-actions.e2e.test.ts`、`attention-journey.e2e.test.ts`。

### 4.4 Feed（`plugins/native/feed`）

- **定位**：构建期装配、项目级、35 个动作。
- **闭环（通）**：添加来源（研究库、RSS/Atom（含目录里 61 个现成源）、网页搜索、YouTube 频道、GitHub 未读通知、Gmail）→ 手动或定时拉取 → 读（打开即已读）→ 保存为资料、加入 Inbox、升格为 Goal、忽略；捕捉规则（`feed.rules.*`）按判断规则建议动作，可预览再启用。
- **占位（部分）**：E-3，示例项目的演示前端。已登记的体验问题：BL-094 至 BL-097（失败提示、「创建任务」按钮、内部值、首次打开慢）。
- **生命周期（部分）**：移除 Feed 后 35/35 动作不可用；Goals 被移除时「升格为 Goal」不跟着停（E-15）；定时拉取随服务；失败后不再每 30 秒重拉等项已在 #302 修掉（`specs/repository-anti-corruption/spec.md` §11）。
- **空与无模型（通）**：空「添加一个来源，开始收集消息」并给「添加来源」（截图 25）。判断规则依赖判断连接，无连接时 `functions.*` 显示「请先连接判断服务」。
- **组合（通）**：§7 S2；`feed.goals.context` 读 Goal 作为判断材料。
- **测试**：`tests/feed-inbox-lifecycle.test.ts`、`feed-goal-promotion.test.ts`、`feed-item-actions.test.ts`、`feed-capture.e2e.test.ts`。

### 4.5 Schedule（`plugins/native/schedule`）

- **定位**：构建期装配、项目级、11 个动作。两件事：用户建的定时对话任务（到点在任务自己的对话里跑一轮只读 Agent）、别的插件登记的到点提醒（Todo 的提醒通过它响）。
- **闭环（部分）**：创建、编辑、暂停、归档，详情有「下次」「上次」。没有「立即运行一次」，用户无法在创建后马上验证任务能不能跑 [已确认，动作表与界面按钮]。
- **占位（通）**。
- **生命周期（部分）**：只在服务进程活着时运行（K-4）；创建对话框写着「本地服务没开时闹钟不响」。
- **空与无模型（部分）**：K-2：创建与启用时不检查模型与项目工作区，到点才失败，界面显示「叫醒失败」（`ui.ts:204`）。截图 17 是创建后的状态：已启用、下次 09:00，没有任何就绪提示。
- **组合（部分）**：Todo 的提醒窗口 `todo.reminders.window` 由 Schedule 当钟；助理的定时（`schedule.*`）受同一限制。
- **测试**：`tests/schedule-actions.test.ts`、`schedule-task-runner.test.ts`、`schedule-reminder-recovery.test.ts`、`schedule-operation-recovery.test.ts`。

### 4.6 工作流程（`plugins/native/workflows`）

- **定位**：构建期装配、个人级、16 个动作；数据在 Home 的 `workflows/workflows.db`。
- **闭环（通）**：把插件串成「站」，站间用「手动 / 判断规则 / AI」衔接；一次运行从第一站选一条内容开始，每次运行内容互不相串，历史可回看。UI 的站清单只列声明了内容读写动作的 9 个插件（成果、数据表、Feed、问卷、Inbox、Jelly 笔记、灵光、Pages、演示稿），其余写「其余 N 个插件暂不能串进流程」。
- **占位（通）**。
- **生命周期（通）**：`project_data` 声明「工作流程及其运行记录」；`tests/workflows-stop-and-token.test.ts` 守停止与令牌。
- **空与无模型（通）**：空状态有示例「Feed → 手动 → Inbox → AI → Pages」和「用这个例子新建」（截图 19）；没有模型时编辑器在 AI 衔接处写「Inbox → Pages（还没有可用的文字模型）」，「开始」在第一站没有内容时置灰。`workflows.instances.continue` 在目录里仍是可用的，调用时才报 `workflows.not_ready`（AI 清单 TX-11）。
- **组合（通）**：它就是组合器。
- **测试**：`tests/workflows-plugin.test.ts`（一次实例走完 Feed → Inbox → Pages → 灵光）、`workflows-action-steps.test.ts`、`workflows-judgment-link.test.ts`、`workflows-handoff-idempotency.test.ts`；本片跑过前三个、通过。

### 4.7 Pages（`plugins/native/pages`）

- **定位**：构建期装配、个人级、36 个动作；数据在 Home 的 `pages/pages.db`。
- **闭环（通）**：新建、模板、导入、写（块编辑器、选区工具条）、AI 写作（16 个命令）、版本回退（`pages.revert`）、导出、「存为固定版本」→ 成果（截图 12 显示「周报草稿 v1 可用」）、提升到 Goal 交付物。
- **占位（部分）**：E-8、E-9、E-10。选区工具条的浮层会盖住标题（截图 10），为浮层的常见位置问题，不单列。
- **生命周期（通）**：`project_data`；`tests/project-deletion-owners.test.ts` 守。
- **空与无模型（通）**：空状态有「从模板新建」「导入已有文档」（截图 27）；无模型时「更多 › 全部操作」里 Pages 的 17 项写作命令（16 个命令，改写按 4 种风格拆成 4 项）全部灰着并写「请先配置文字模型，再使用写作助手」，Goals 与灵光的片段动作仍可用（截图 11）。
- **组合（通）**：选区旁的情境条一键「拆成目标步骤」「记下灵光」「记成待办」（截图 10）；Inbox 整理材料生成文稿；PPT 从 Pages 文稿出大纲；Workflows 的 Pages 站。
- **测试**：`tests/pages-actions.test.ts`、`pages-cross-module.test.ts`、`pages-publication.test.ts`、`pages-generation-lease.test.ts`、`pages-actions.e2e.test.ts`；本片跑过前两个、通过。

### 4.8 Form（`plugins/native/form`）

- **定位**：构建期装配、个人级、27 个动作。
- **闭环（通）**：新建 → 加题（本地或 AI 拟题）→ 发布 → 填写（本机填写页 `form.fillpage`；别人在这台电脑上填，或用导出的填写页）→ 逐题汇总（`form.results`）→ 导出 CSV（`form.results.csv`）→ 停止收集（`form.close`，停止后拒绝非本人提交，#326）→ 固定版本。外网公开链接按设计不做（BL-045）。
- **占位（通）**。
- **生命周期（通）**：`project_data` 声明「问卷及收到的全部回答」。
- **空与无模型（通）**：空状态有「新建问卷」；AI 拟题按钮随 `ai_available` 禁用并写原因。
- **组合（部分）**：和 Dataset 的衔接是「导出 CSV → 在 Dataset 里粘贴或选文件导入」，没有一键（Workflows 可以串，因为两个都有内容读写动作）。
- **测试**：`tests/form-actions.test.ts`、`form-actions.e2e.test.ts`、`form-mcp.test.ts`。

### 4.9 Dataset（`plugins/native/dataset`）

- **定位**：构建期装配、个人级、27 个动作。
- **闭环（通）**：新建、加行列、AI 拟列名（不发表内数据）、导入 CSV（粘贴或选文件，**替换当前列与行**，有版本可回退）、导出、版本与回退、「存为固定版本」。
- **占位（通）**；**生命周期（通）**（`project_data`「Dataset 数据表」）；**空与无模型（通）**（`ai_available`）；**组合（部分）**：同 Form。
- **测试**：`tests/dataset-actions.test.ts`、`dataset-actions.e2e.test.ts`。

### 4.10 PPT（`plugins/native/ppt`）

- **定位**：构建期装配、个人级、24 个动作。
- **闭环（通）**：新建 → 大纲（本地、AI、从 Pages 文稿 `ppt.outline_pages`）→ 编辑幻灯片 → 放映 → 导出 PPTX（`ppt.pptx`）或其他格式 → 固定版本。富排版（图片、图表、母版）按设计不做（BL-045）。
- **占位（通）**；**生命周期（通）**；**空与无模型（通）**：`ai_available` 为假时 AI 按钮置灰、大纲模式回到本地；**组合（通）**。
- **测试**：`tests/ppt-actions.test.ts`、`ppt-actions.e2e.test.ts`。

### 4.11 成果（`plugins/native/artifacts`，目录 id `artifacts`）

- **定位**：构建期装配、项目级、17 个动作。成果库只收人要留存、引用的固定版本与导入文件（AGENTS.md）。
- **闭环（通）**：浏览、读版本、导出 JSON、导入文件、导入外部文档（Notion、飞书/Lark、Google Docs）、被谁引用（`artifacts.links`）、绑定到插件输入端口（`artifacts.plugin_inputs.bind`）。
- **占位（通）**。
- **生命周期（通）**：项目级，数据在项目库；移除后 17/17 不可用（P）。
- **空（部分）**：E-5；搜索摘要 E-4。
- **组合（通）**：四个文档族固定版本进来，Goal 交付物与输入从这里取，Diff 比较固定版本，Coding 与 Shelf 的端口读它。
- **测试**：`tests/artifacts-actions.test.ts`、`artifact-document-import.test.ts`、`artifact-walkthrough.e2e.test.ts`；浏览器用例本片跑过（§8）。

### 4.12 图片（`plugins/native/images`）

- **定位**：构建期装配、个人级、13 个动作；数据在 `images/images.db` 与 `images/assets/`。
- **闭环（部分）**：连接生图服务（`openai-images` 或 `gemini` 协议，端点与密钥由用户的图像连接给出）→ 写描述 → 生成（后台任务，可取消）→ 记录与图片 → 删除。**真实厂商生成没测过**（BL-046）；生成的图片不进成果库（manifest 没有 `artifacts.produces`），只通过侧栏文件（`images.files.entries/content`）与搜索可见。
- **占位（通）**。
- **生命周期（通）**：`project_data`「图片生成记录和已生成的图片」，删项目时先停掉该项目还在跑的任务再删。
- **空与首次（通）**：「新建图片」页写「先连接一个生图服务。密钥加密保存在这台电脑，配置可跨项目使用」并给「连接生图服务」（截图 20）。
- **组合（部分）**：图片不能一键放进 Pages 文稿 [未验证]。
- **测试**：`tests/images-service.test.ts`、`images-providers.test.ts`、`images-plugin.e2e.test.ts`。

### 4.13 灵光（`plugins/native/lingguang`）

- **定位**：构建期装配、个人级、19 个动作；视图在底栏右侧与侧栏。
- **闭环（通）**：记下 → 导入文件 / 读取链接 → 转成文档、转成 Jelly 笔记、建成 Goal、转为待办 → 头脑风暴 / 交给助理 → 丢掉；对话（`lingguang.conversation.message`，AI）。创建声明了撤销。
- **占位（通）**；**生命周期（通）**：`project_data`「灵光里的想法与对话」；**空（通）**：「记下第一条灵光」。无模型：对话动作目录里不可用，其余不受影响。
- **组合（通）**：§7 S1。
- **测试**：`tests/lingguang-actions.test.ts`、`lingguang-plugin.test.ts`、`lingguang-one-place.e2e.test.ts`。

### 4.14 待办（`plugins/native/todo`）

- **定位**：构建期装配、个人级、25 个动作；数据在 `todo/todo.db`。
- **闭环（通）**：快速记下（日期不靠模型，确定性换算，输入时就显示「截止 明天」，探索所见，未收进截图集）→ 六个视图 → 完成与撤销 → 批量 → 详情编辑 → 提醒 → 整理批次的审阅、采用、关闭。撤销按历史进行，删除不可撤销并先确认（README）。
- **占位（通）**。
- **生命周期（通）**：`project_data`「放在这个项目里的待办」，个人待办不带项目、保留。
- **空与无模型（通）**：Todo 界面没有 AI 入口；AI 整理（`todo.organize.extract`）只被项目上手与助理、MCP 调用，界面只审阅批次（AI 清单 TX-7）。小摩擦：在「今天」视图记下一条有截止日期的待办后，停留在「今天」的空状态，新条目在「即将到期」里，提示条写了位置但没有一键跳过去（截图 09）。
- **组合（通）**：Inbox、灵光的「转为待办」（来源保留）、Pages 选区「记成待办」、助理的提醒查询；Schedule 当钟。
- **测试**：`tests/todo-actions.test.ts`、`todo-organize.test.ts`、`todo.e2e.test.ts`；本片跑过第一个、通过。

### 4.15 Jelly（`plugins/native/jelly`）

- **定位**：构建期装配、个人级、53 个动作；数据在 `jelly/jelly.db`。
- **闭环（通）**：日历（月、周、列表）、笔记、回顾、导入（文字、文件，音视频走本机 OCR 与转写）、撤销与重做、导出、AI 拆解或手工拆解成待采纳的任务、排期。
- **占位（通）**；**生命周期（通）**：个人库不按项目分区，没有项目数据要清；`jelly.content.*` 三个项目范围动作只做内容交接。
- **空与无模型（通）**：空月历没有行动提示（日历天然如此）；AI 拆解没有模型时目录里不可用，「手工拆解」不要模型（`plugins/native/jelly/src/ai.ts` 的 `manual`）。自带模型选择，见 H-2。
- **组合（部分）**：灵光「转成 Jelly 笔记」（`jelly.content.receive`）；Jelly 的待办任务与 Todo 不是同一个库，两边各管各的 [已确认，R]。
- **测试**：`tests/jelly-plugin.test.ts`、`jelly-model.test.ts`、`jelly-actions.e2e.test.ts`；本片跑过第二个、通过。

### 4.16 Cognia（`plugins/native/cognia`）

- **定位**：构建期装配、个人级、25 个动作；数据在 `cognia/cognia.db`，所有项目可见。
- **闭环（通）**：导入 Markdown 目录或添加材料 → 搜索全文 → 选 1–5 份整理成带引用的草稿，或提问（按问题分词、数标题与正文里出现的词选材料，再让模型带引用作答；没有向量或 BM25）→ 草稿保存、归档。
- **占位（通）**；**生命周期（通）**：个人库；卸载并清除时删。
- **空与无模型（通）**：空状态「把已有的知识带进来」，无模型横幅「当前没有可用的文字模型……导入、搜索和阅读仍可使用」并给「打开模型设置」（截图 07）。
- **组合（部分）**：草稿不会自动变成 Pages 文稿 [未验证]。
- **测试**：`tests/cognia-ai.test.ts`、`cognia-prologue.test.ts`、`cognia-actions.e2e.test.ts`；本片跑过第二个、通过。

### 4.17 Shelf（`plugins/native/shelf`，Runtime 装配）

- **定位**：Plugin Runtime 监督器启动、个人级；目录里 32 个动作（Manifest 只声明 5 个成果相关的，其余由宿主注册）；数据在 `{home}/shelf/`。
- **闭环（通）**：放材料（文件、文件夹、文字、剪贴板历史）→ 提取文字（本机 OCR）→ 用 AI 处理（配方）→ 结果 → 「结果转为材料」→ 保存到项目材料（`shelf.text-material.v1` 过程项，Coding 消费）；「对话」终端井里与本机命令行 Agent 说话（AI 清单 EX-3）。
- **占位（部分）**：E-11、E-12。
- **生命周期（通）**：个人库，卸载并清除时删。
- **空与无模型（通）**：`shelf.jobs.generate` 目录里不可用（`shelf.no_model`），提取与手动处理不受影响。
- **组合（通）**：材料交给 Coding；生成结果可再当材料。
- **测试**：`tests/shelf-plugin.test.ts`、`shelf-ai-host.test.ts`、`shelf-recipes.test.ts`、`shelf-terminal-recovery.test.ts`；本片跑过第二个、通过。

### 4.18 Characters（`plugins/native/characters`，Runtime 装配）

- **定位**：Plugin Runtime 监督器启动、个人级、18 个动作；界面在「设置 › 角色」（15 个系统与插件登记的角色加用户自己的）。按决定 #26 将并进宿主设置（`docs/system/GLOSSARY.md`）。
- **闭环（通）**：新建、编辑、从本机导入（Codex、Claude Code、Cursor、OpenCode、Grok Build 的规则与 Skill）、发布固定版本到项目、选给 Coding 用；「用本机 Agent 运行」依赖本机 CLI（BL-052）。
- **占位（通）**。
- **生命周期（部分）**：库 `characters/characters.sqlite` 自管版本、卸载并清除时不删（HOME-DATA §3.4，已定决定 #20 要覆盖所有登记的库）。
- **空与无模型（通）**；**组合（部分）**。
- **契约**：E-2。
- **测试**：`tests/characters-actions.test.ts`、`characters-import-http.test.ts`、`characters-publication-http.test.ts`。

### 4.19 实验（`plugins/native/experiments`）

- **定位**：构建期装配、个人级；Manifest 没有声明动作，页面走私有路由 `/api/plugins/experiments/…`，目录里的 15 个动作由宿主注册（`apps/local-host/src/experiments-actions.ts`，AGENTS.md 冻结名单里的旧路径插件）。
- **闭环（部分）**：新建实验（判断任务、材料、参试者）→ 后台运行（`experiments.run`，metered）→ 比较判断与成本；参试者可以是 Jev（经 Prologue）、本机 `grok` 命令行、`laya` Python 检查点，后两者要自己配环境（AI 清单 EX-1、EX-2）。
- **占位（通）**。
- **生命周期（部分）**：库 `plugins/experiments/private.sqlite` 没有版本（W2-05）、卸载并清除时不删（HOME-DATA §3.4）。
- **空与无模型（通）**：空状态写明新建判断任务；没有判断连接时 Jev 参试者不可配置。
- **组合（缺）**：它的 15 个动作只有界面、助理、MCP、工作流能用，没有任何别的插件消费它的结果；这是个人研究工具，不算缺陷，但在「组合」一栏如实记为没有。
- **测试**：`tests/experiments-plugin.test.ts`、`experiments-http.test.ts`、`experiments-actions.test.ts`；README 的必跑列表里没有浏览器用例，是点名测试最少的插件之一（Text Stats 2 个、Diff 3 个）。

### 4.20 炼金术士（`plugins/native/alchemist`）

- **定位**：构建期装配、个人级、54 个动作；每个项目一个研究空间（`{home}/alchemist/projects/<项目>/studio.sqlite`）。
- **闭环（通）**：写方向 → 炼化（探索、候选卡）→ 保留或丢弃 → 研究（计划、搜索、交叉核对、综合）→ 决策 → 导出；市场脉搏与来源；上下文 Copilot；Research Playbook 与 Founder Taste 记忆。
- **占位（部分）**：E-7。
- **生命周期（通）**：宿主在项目删除时先关闭该项目的 worker 与搜索库、再删目录（`apps/local-host/src/alchemist-service-host.ts`）；执行中的任务续租、取消与失租后不再迟到写入（README 不变量）。
- **空与无模型（部分）**：空状态「这里还是空的」有主操作；无模型时「保存并炼化」可点，提交后方向保存、任务失败并露出原码（截图 18）；目录里它的 5 个动作没有无模型的可用性声明（AI 清单 §6）。
- **组合（部分）**：研究会用 AnySearch 检索（AI 清单 SE-1）；方向转 Goal（`alchemist.opportunities.convert`）。市场脉搏另有自己的三个公开来源（Toolify、观猹、GitHub），GitHub 的令牌读环境变量 `GITHUB_TOKEN`（AI 清单 SE-3，E-16）。
- **测试**：`tests/alchemist-actions.test.ts`、`alchemist-host.test.ts`（本片跑过、通过）、`alchemist-runtime.test.ts`、`alchemist-workbench.e2e.test.ts`。

### 4.21 Coding（`plugins/native/coding`，Runtime 装配）

- **定位**：Plugin Runtime、项目级、19 个动作 + 约 67 条私有路由；会话在项目库（`CodingSessionStore`）。
- **闭环（通）**：新建编码会话（要选已授权工作区）→ 发任务 → Agent 读代码、提方案、改文件、跑检查，每次写入与命令先进审查队列等人批 → 报告、计划、变更集作为成果或过程项保存 → 交给 Git/Diff。
- **占位（通）**：`agent-host` 里的 `CliAgentAdapter`（`claude` 命令行）默认注册、没有内置调用方（AI 清单 EX-6），不在插件里。
- **生命周期（通）**：移除后 19/19 动作 `actions.plugin_disabled`（P）；嵌入的 Files、Git、Diff、Text Stats 在 Coding 启用期间保持可用（`manifest.ts:179` 的 `embedded_plugins`）。
- **空与无模型（通）**：空状态有「开始新会话」和四个例子；输入框下写「还没有模型」（截图 08）。
- **组合（通）**：Shelf 材料、Characters 固定版本、Goal 上下文、Files/Git/Diff 的端口。
- **测试**：`tests/coding-actions.test.ts`、`coding-delegation-waits.test.ts`、`coding-workbench.e2e.test.ts`。
- **已登记**：BL-050（下一阶段 20 项）、BL-051、BL-100。

### 4.22 Files（`plugins/native/files`，Runtime 装配）

- **定位**：项目级、6 个动作（宿主列目录与读文件，插件只把结果变成树、预览和过程项）。
- **闭环（通）**：浏览绑定的工作区 → 读一个文件 → 记下选区或两份快照（`files.snapshot.v1`、`files.text-selection.v1`）→ 交给 Diff、Text Stats。
- **占位（通）**；**生命周期（通）**（嵌入关系见 4.21）；**空（通）**：没有绑定工作区时写「请在项目设置的工作目录中选择可用浏览目录」（截图 28），在我的临时 Home 里它的动作显示 `actions.dependency_missing`（所需宿主能力未注册），这是没有工作区服务时的诚实降级。
- **组合（通）**；**测试**：`tests/files-plugin.test.ts`、`files-git-actions.test.ts`、`companion-client-lifecycle.e2e.test.ts`。

### 4.23 Git（`plugins/native/git`，Runtime 装配）

- **定位**：项目级、10 个动作。宿主运行 `git`，插件只解析 porcelain v1、把改动发布成可比较的变更集，并持有「把 Coding 一轮的改动带进工作区」的决定。
- **闭环（通）**：看工作区改动 → 选一项看固定差异 → 准备暂存或提交、分支、推送、PR 的操作，由宿主审查面确认后才执行。
- **占位（通）**；**生命周期（通）**；**空（通）**（「查看工作区的改动」）；**组合（通）**；**测试**：`tests/git-plugin.test.ts`、`git-operations.test.ts`、`git-operation-review.test.ts`。

### 4.24 Diff（`plugins/native/diff`，Runtime 装配）

- **定位**：项目级、2 个动作（`diff.state`、`diff.compare`），三种输入：Files 的两份快照、Coding 的变更集、Git 工作区的改动。
- **闭环（通）**；**占位（通）**；**生命周期（通）**：被 Git、Files、Coding 嵌入，所以从项目移除后动作仍可用（`apps/workbench/src/plugin-catalog.ts` 的 `availableProjectPluginIds` 把嵌入依赖算进去，P 验证）；**空与组合（通）**；**测试**：`tests/diff-plugin.test.ts`、`workspace-plugin-graph.test.ts`。

### 4.25 Text Stats（`plugins/native/text-stats`，Runtime 装配）

- **定位**：项目级、2 个动作；数数文件快照的字数、字节与行数。
- **结论**：这是 README 明说的「The smallest complete Plugin in the system」，存在是为了让平台保持诚实：消费一份绑定的成果若比它要的还多，就是平台要得太多。它在用户的插件列表（「更多」）里，E-13；页面版式见 E-14。**闭环、生命周期、空、组合**都通；**测试**：`tests/text-stats-plugin.test.ts`、`workspace-plugin-graph.test.ts`。

### 4.26 插件创作台（`plugins/native/plugin-builder`）

- **定位**：构建期装配、个人级；Manifest 没有动作，界面走私有路由；设计与代码 Agent 在 agent-host（AI 清单 AG-4）。
- **闭环（通）**：说想法 → 主线设计师给方案、UI Agent 从规格板取组件、代码 Agent 写功能 → 试用 → 安装成生成插件（生成插件的执行见 `packages/plugin-sandbox` 与 `tests/installed-plugin-execution.test.ts`，我没有逐项核这一环）。
- **占位（通）**：BL-055 写着「当前进程内执行器不是任意代码沙箱」，现在有 `plugin-sandbox` 包，这条登记可能已经过期，我没有逐项核 [未验证]。
- **生命周期（通）**：生成插件的安装、停用、升级、卸载按 Runtime 生命周期（`tests/plugin-lifecycle-states.test.ts`、`installed-plugin-host.test.ts`，本片跑过第一个、通过）；项目删除由宿主登记的 `plugin-builder` owner 清。
- **空与无模型（通）**：顶栏有「模型」选择与「打开模型设置」，输入框下写「请选择构建使用的模型 · Jev 未配置（优先使用 UI Agent 的设计）」（截图 29）。
- **组合（缺）**：没有任何目录动作，所以助理、MCP、工作流看不到创作台，创作台草稿也不可搜（BL-040）；Dock 里的名字是内部 id（K-3）。
- **测试**：`tests/agent-built-plugins-workflow.test.ts`、`installed-plugin-host.test.ts`、`agent-studio.e2e.test.ts`。

## 5. 官方接入（6 个）

这六个不是 Runtime 插件，也没有界面，是被宿主装配的库：Feed 的来源提供方、连接器、文档导入。

| 包 | 它做什么（读码） | 谁在用 | 结论 |
| --- | --- | --- | --- |
| `integration-catalog` | 其余官方账号连接（Notion、飞书/Lark、Google Docs 等的只读协议：令牌解析、identity、list、whoami）与外部文档导入（`readExternalDocument`） | `connector-access.ts`、`connector-directory.ts`、`artifact-document-import.ts`、`artifact-native-plugin-http.ts`、`feed-connector-sync.ts` | 在用；成果的「导入外部文档」闭环靠它 |
| `integration-github` | GitHub 提供方、设备授权流程、账户呈现 | `github-connector.ts`、`github-oauth.ts`、`connector-account-actions.ts`、`feed-connector-sync.ts` | 在用 |
| `integration-gmail` | Gmail OAuth、历史游标、邮件提供方 | `gmail-connector.ts`、`feed-connector-sync.ts`、`feed-source-service.ts` | 在用 |
| `integration-rss` | RSS 目录来源、自定义 RSS、HTTP 条件请求、正文处理；白名单传输 | `feed-source-runtime.ts`、`feed-source-service.ts` | 在用 |
| `integration-youtube` | YouTube 频道地址与公开订阅 | `feed-source-runtime.ts`、`feed-source-service.ts` | 在用 |
| `integration-web-query` | Web Query 提供方工厂 | **没有任何包、脚本或测试按包名引用它**，根包依赖里也没有；Feed 的网页搜索来源由 Feed 自己的 `source-request.ts` 处理 | **非产品**（`scripts/gates/package-inventory.mjs` 同样判定）；`specs/action-architecture/migration.md:98` 仍写它驱动 Feed 来源服务，与代码不符（spec.md §5.2 已记，W1-02 对齐文档时改） |

在用的这几个包出站都经注入的 `fetch` 端口（默认是全局 `fetch`），范围与上限由宿主的连接器与白名单传输限定（AI 清单 §1 第 1 项的（1）（2））；真实第三方账号验收未做（BL-060）。[已确认，R]

## 6. 平台接点

按任务书 §6 的清单核：导航、搜索、命令入口、设置、连接管理、权限、通知、活动记录、执行历史、产物预览、后台任务、取消、恢复。「不是所有功能都要接入全部位置，但需要的接点必须完整」，所以下表是**存在与否**，缺的格子要看那个插件需不需要。数据来自 P（每个插件的目录动作里有没有对应声明）；`—` 表示没有。

| 插件 | 导航 | 搜索来源 | 对象读取 | 侧栏文件 | 预览或结果视图 | 放置 | 内容交接 | 情境片段 | 撤销 | 取消或停止 | 到点提醒 | 首页事件 | 助理、MCP、工作流 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Goals | 有 | 有 | 有 | — | — | — | — | 有 | — | — | — | — | 有 |
| Sessions | 有 | 有 | 有 | — | — | — | 有 | — | — | 有（交接） | — | 有 | 有 |
| Inbox | 有 | 有 | 有 | — | — | — | 有 | — | — | — | — | 有 | 有 |
| Feed | 有 | 有 | 有 | — | 有 | — | 有 | — | — | — | — | 有 | 有 |
| Schedule | 有 | 有 | 有 | — | — | — | — | — | — | — | 有（提供时钟） | — | 有 |
| 工作流程 | 有 | 有 | 有 | — | — | — | — | — | — | 有（停止） | — | — | 有 |
| Pages | 有 | 有 | 有 | 有 | 有 | 有 | 有 | 有 | 有 | — | — | — | 有 |
| Form | 有 | 有 | 有 | — | 有 | 有 | 有 | — | — | — | — | — | 有 |
| Dataset | 有 | 有 | 有 | 有 | 有 | 有 | 有 | — | — | — | — | — | 有 |
| PPT | 有 | 有 | 有 | 有 | 有 | 有 | 有 | — | — | — | — | — | 有 |
| 成果 | 有 | 有 | 有 | 有 | 有 | — | 有 | — | — | — | — | — | 有 |
| 图片 | 有 | 有 | 有 | 有 | — | — | — | — | — | 有 | — | — | 有 |
| 灵光 | 有（岛与侧） | 有 | 有 | — | — | 有 | 有 | 有 | 有 | — | — | — | 有 |
| 待办 | 有 | 有 | 有 | — | 有 | 有 | — | 有 | 有 | — | 有（消费方） | 有 | 有 |
| Jelly | 有 | 有 | 有 | — | — | — | 有 | — | 有（自带撤销与重做） | — | — | — | 有 |
| Cognia | 有 | 有 | 有 | 有 | — | — | — | — | — | 有（取消导入） | — | — | 有 |
| Shelf | 有 | 有 | 有 | 有 | 有 | — | — | — | — | 有（取消任务） | — | — | 有 |
| Characters | 设置里 | 有 | 有 | — | 有 | — | — | — | — | — | — | — | 有（写入受 E-2 影响） |
| 实验 | 有 | 有 | 有 | — | — | — | — | — | — | 有 | — | — | 有 |
| 炼金术士 | 有 | 有 | 有 | — | — | — | — | — | — | 有 | — | — | 有 |
| Coding | 有（舞台、导航、设置） | 有 | 有 | — | 有 | — | — | — | — | 有（运行控制） | — | — | 有 |
| Files | 有 | — | — | 有 | — | — | — | — | — | — | — | — | 有 |
| Git | 有 | — | — | — | — | — | — | — | — | — | — | — | 有 |
| Diff | 有 | — | — | — | — | — | — | — | — | — | — | — | 有 |
| Text Stats | 有 | — | — | — | — | — | — | — | — | — | — | — | 有 |
| 插件创作台 | 有 | — | — | — | — | — | — | — | — | — | — | — | 无（没有目录动作） |

另外几个接点不按插件分：**设置**（`设置` 覆盖层有 15 节，其中插件自己的节只有 Coding、Shelf、Goals，Characters 在「AI」下；炼金术士与实验的偏好在自己的页面里，Jelly 的模型选择也在自己的页面里）；**连接管理**（「服务连接」一节统管 OAuth 与密钥，图片、判断、Feed 来源都从这里取连接）；**权限**（「对外接入」按项目与能力逐项授权 MCP；动作自己声明权限，调用时核对）；**执行历史**（「调用记录」一节，所有动作调用；助理的运行记录在助理面板与诊断页）；**后台任务**：只有炼金术士声明了 `background_job`（`alchemist.explorations.start`、`alchemist.research.start`）；图片任务、实验运行、Shelf 作业、Coding 运行、工作流运行都有自己的状态与取消，但没有声明成后台任务，所以不会出现在统一的后台任务入口（已登记 BL-107 的同类问题）；**通知**：插件通知只对 Runtime 插件生效（BACKLOG BL-009），构建期插件靠首页事件与 Inbox。**活动记录**：首页事件只有 Sessions、Inbox、Feed、Todo 提供。

## 7. 组合场景

沿真实用户路径把几个功能串起来，看上下文、数据和成果能不能继续流转（任务书 §6：逐模块通过不能代替组合使用验证）。每个场景写：路径、核对方式、结果、缺口。

| # | 场景与路径 | 核对 | 结果 |
| --- | --- | --- | --- |
| S1 | **想法到任务**：灵光「转为待办」或 Pages 选区「记成待办」→ Todo，原对象保留为来源 | U：灵光页有「转成文档 / 转成 Jelly 笔记 / 建成 Goal / 转为待办」四个入口，Pages 选区旁有「拆成目标步骤 / 记下灵光 / 记成待办」（截图 10）；T：`lingguang-one-place.e2e.test.ts`、`contextual-interaction.e2e.test.ts`、`work-placement-journeys.e2e.test.ts` | 通；本片跑过 `lingguang-one-place.e2e`（灵光 → Jelly 笔记并在 Jelly 里打开）与 `contextual-interaction.e2e`（选区 → 情境条 → 候选 → 写回，1440 与 390），通过（§8） |
| S2 | **来信到文稿**：Feed 拉到消息 → Inbox → 整理材料到 Pages（AI）→ 成果 | T：`feed-inbox-pages-loop.test.ts`、`pages-cross-module.test.ts`（含无模型时 Inbox 的可用性随 Pages、历史仍可读）、`feed-inbox-lifecycle.test.ts`，本片跑过通过；`attention-journey.e2e.test.ts` 本片跑过，通过（§8） | 通 |
| S3 | **文稿到交付**：Pages「存为固定版本」→ 成果（版本、引用）→ Goal 交付物或输入 → Diff 比较 | U：新建 Pages 文稿、存为固定版本，成果里出现「周报草稿 v1 可用」（截图 12），全局搜索同时命中 Pages 与成果（截图 13）；T：`artifact-walkthrough.e2e.test.ts` 本片跑过通过（成果库 1440 与 390），`artifact-goal-input.e2e.test.ts`、`artifact-continue.e2e.test.ts`、`document-pin-after-move.test.ts` 未跑 | 通；搜索摘要有 E-4 |
| S4 | **问卷到数据表到演示稿**：Form 结果 CSV → Dataset 导入 → PPT 从 Pages 出大纲 | R：每一步的动作都在（`form.results.csv`、`dataset.import`、`ppt.outline_pages`），但 Form 到 Dataset 要导出再粘贴或选文件；Workflows 因为两边都有内容读写动作可以串 | 部分；一键衔接是新功能，不是缺陷 |
| S5 | **材料到编码**：Shelf 放材料、提取或 AI 处理 → 保存到项目材料 → Coding 会话带着材料工作 | R：`shelf.text-material.v1` 过程项、Coding 的 `materials` 输入端口；T：`tests/shelf-coding-materials-http.test.ts` | 通；未跑 |
| S6 | **编码到审查**：Coding 一轮产出变更集 → Git 准备暂存或提交 → Diff 看差异；需要人批准 | R：`coding.changesets.save`、`git.select-diff`、`git.prepare-operation`、`diff.compare`；T：`companion-client-lifecycle.e2e.test.ts`、`git-operation-review.test.ts` | 通；未跑 |
| S7 | **助理做事并可撤销**：助理按需发现能力、写入前弹确认、撤销 | U：无模型时的提示与「打开模型设置」（截图 14）；T：`assistant-undo-refresh.e2e.test.ts`、`agent-action-tools-prologue.test.ts` | 无模型路径通；有模型的完整路径靠真实模型，本片没有真实模型 [未验证] |
| S8 | **定时与提醒**：Todo 提醒 → Schedule 响；定时 Agent 任务到点跑 | R+U：创建不查就绪（K-2）；T：`schedule-reminder-recovery.test.ts`、`schedule-task-runner.test.ts` 本片跑过后者通过 | 部分 |
| S9 | **流程串联**：Feed → Inbox → Pages → 灵光 | T：`workflows-plugin.test.ts` 的「一次实例按每段衔接走完」，`workflows-action-steps.test.ts`、`workflows-judgment-link.test.ts` 本片跑过通过；U：编辑器、无模型提示（截图 19） | 通 |
| S10 | **加入与移出插件、再进入**：项目里加减插件，动作、界面与数据跟着变 | P：项目级 11 个逐个移除，动作变不可用并写 `actions.plugin_disabled`，同伴关系按声明生效（移除 Inbox 会带走 Feed，移除 Files 会带走 Text Stats）；个人级 15 个移除无变化（K-1）；T：`companion-client-lifecycle.e2e.test.ts`、`plugin-lifecycle-states.test.ts` 本片跑过后者通过 | 项目级通，个人级未做 |
| S11 | **删除项目**：所有 owner 一起清 | P：owner 列表见 E-1；T：`project-deletion-owners.test.ts` 本片跑过通过 | 部分：Sessions 不在 |

## 8. 本片的验证记录

- **跑了两批用例**，都在 `MOLIS_WORK_SECRET_BACKEND=file`、隔离临时 Home 下：
  - 非浏览器 23 个文件：`action-model-scheduling`、`prompt-registration`、`host-inference-completion`、`pages-cross-module`、`feed-inbox-lifecycle`、`feed-inbox-pages-loop`、`plugin-lifecycle-states`、`project-deletion-owners`、`project-deletion-declarations`、`schedule-task-runner`、`inbox-prepared-pages`、`shelf-ai-host`、`experiments-http`、`todo-actions`、`workflows-action-steps`、`workflows-judgment-link`、`companion-actions`、`action-directory-installation`、`cognia-prologue`、`alchemist-host`、`jelly-model`、`lingguang-actions`、`pages-actions`：**155 通过、0 失败、0 跳过**。
  - 浏览器 5 个文件：`attention-journey.e2e`、`artifact-walkthrough.e2e`、`lingguang-one-place.e2e`、`contextual-interaction.e2e`、`cross-plugin-recovery.e2e`：**12 个用例全部通过、0 失败**（耗时 206 秒，机器负载很高）：成果库 1440 与 390 两个宽度、Kanban 滚轮、框架选择器、情境动作 1440 与 390 加两个边界例（拒绝的结果不写入、改过的范围拒绝）、P2 搜索调色板、Characters 升级后打开且不丢草稿、Shelf 离开前保存最后一次输入、Schedule 草稿稳定且只打开一次、灵光读入文件变成灵光再变成 Jelly 笔记并在 Jelly 里打开。
- **探针**（P）跑了七种：模型动作清单、无模型的可用性、移除插件的可用性变化、Runtime 插件的嵌入关系、项目删除后的孤儿数据、平台接点、工具描述质量；方法在 §9，结果数字都写在上面各处。本片没有改任何代码，也没有碰真实 Home。
- **界面走查**（U）见 [frontend-flow-walk.md](frontend-flow-walk.md)：隔离的临时 Home、无头 Chrome、1440 宽，26 个插件页面逐个打开（全部加载成功、没有脚本错误、没有横向溢出），关键路径手动操作，窄屏 390 宽看 8 个页面。
- **没有核的**：Goals 空项目的呈现；Form 与 Dataset 的真实填写与导入；Shelf 的 AI 配方在真模型下；真实厂商的图片生成；Coding 在真实仓库上的一轮；所有「有模型」的路径（没有可用的模型凭据，也不动真实 Home）；`placement` 库里按项目分区的标题缓存在项目删除后是否残留（它的表 `placement_titles` 没有项目列，只有 kind 与 id，读码没有发现项目删除的清理钩子，我没有造数据验证）。

## 9. 复现方法

- **动作目录与可用性**：在 `tests/` 下临时放一个测试文件：`openMolisWorkProjectCatalog({ homeDirectory })` 建临时 Home 与项目，`PROJECT_SCOPED_PLUGIN_IDS`（`@molis-ai/molis-work-app-workbench`）逐个 `addProjectPlugin`，`new MolisWorkLocalHost({ homeDirectory, actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home) })`（不传 `actionAvailability` 就看不到「此项目未启用」），用空权限先 `inspectActions` 一遍取全部权限的并集，再以并集为权限、`audience` 取 `"user"` 或 `"agent"` 重读。动作数、受众、可用性、接点都从 `view.action` 与 `view.availability` 取。
- **移除插件的影响**：同一个夹具里 `catalog.removeProjectPlugin({ project_id, plugin_id, actor_id })`，每一步前把所有项目插件加回，再读目录，比较「新变为不可用」的数目；个人插件用 `PERSONAL_PLUGIN_IDS` 同样操作。
- **项目删除的孤儿**：同一个 Home 里先写数据（`openWorkSessionRegistry(...).createSession({ project_id })`），再 `catalog.deleteProject({ project_id, actor_id, delete_confirmed: true, idempotency_key })`，最后读登记簿；`projectDeletedHooksFor(home).owners()` 给出 owner 清单。
- **界面走查**：`tests/fixtures/goal-browser.ts` 的 `openGoalBrowser(t, "seeded")`（项目插件全加上、种子目标）与 `openGoalBrowser(t, true)`（示例项目），用其中的 `command`、`evaluate`、`click` 开页面、点按钮、截图；每步截图后读 DOM 文字。夹具自己起 Chrome（`MOLIS_WORK_TEST_CHROME` 或 `/Applications/Google Chrome.app`）和临时 Home，不碰真实 Home。
- **README 必跑测试都在**：`bash -c 'for p in plugins/native/*; do grep -m1 "改动后必跑" $p/README.md | grep -o "tests/[A-Za-z0-9._/-]*\.test\.ts" | sort -u | while read f; do [ -f "$f" ] || echo "missing $f"; done; done'`（注意 zsh 下 for 里的未加引号变量不会分词，要用 bash）。
