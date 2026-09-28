# 系统级搜索：存储基础、公共合同与插件接入

状态：执行中（2026-09-28 起）。目标完成等级为**内部完整**：用户能搜索真实内容并打开准确位置，个人助理经同一系统能力检索并读取上下文，数据变化与异常恢复可验证。本文件是本任务唯一需求与实现方案；进度与证据见第 12 节。

工作树 `~/code/goalboard-search`，分支 `feature/system-search`（基于 origin/main 21cdfbf8）。与个人助理任务（`specs/system-assistant/`，分支 `feature/system-assistant`）的分工见第 10 节，双方已确认。

完成等级分开记：**工程通过**（构建、定向测试）／**真实场景通过**（真实 Host、真实插件数据、浏览器操作）／**用户验收**（只由用户本人给出）。

## 1. 要解决什么

用户在工作台按 ⌘K 搜索时，结果只来自当前页面已经渲染的列表行：没打开的插件、没加载的文档、正文里的字都找不到。个人助理要找资料时，也没有一个“在这个项目里搜一下”的系统能力可用，只能逐个插件调列表动作。

判断标准：

- 在项目里输入一个词（包括两字中文、`Q4` 这类短词、中英混排），能找到这个项目和个人范围里所有已接入插件的真实内容，不管那个插件或对象有没有打开过。
- 点击结果打开正确对象，并尽可能滚动到命中的文字。
- 新建、修改、删除后，结果随之更新；不靠某个页面或助理主动触发。
- 插件停用、卸载、来源读取失败时，结果如实标明，不泄露无权读取的内容。
- 助理、工作流、MCP 与界面用同一个系统动作，得到同一份结果与同一种对象引用。
- 索引坏了或删了可以重建；重启后继续可用；更新失败不会丢掉原来能搜到的内容。

## 2. 核对现状（2026-09-28，origin/main 21cdfbf8）

| 观察 | 核对结果 |
| --- | --- |
| Workbench 全局搜索只收集当前页面 DOM | 属实。`apps/workbench/src/scripts/client/global-search.ts` 从 `[data-tree-item]`、`[data-inbox-row]`、`[data-feed-entry-id]` 等已渲染行取标题做子串匹配；插件没打开就是空组。没有服务端搜索 API（`specs/archive/global-plugin-search/spec.md` 明确写了“不新增服务端搜索 API；只索引当前页已渲染的目录行”）。无结果回车会自动转给 `askAssistant`。 |
| 各插件拥有自己的 Store，多处用 `packages/storage` 的共同入口 | 属实。Pages、Form、Dataset、PPT、灵光、Jelly、Cognia、Images、Alchemist、Workflows 用 `openHomeSqliteDatabase(home, name)` 打开 `{home}/{name}/{name}.db`；Goals、Feed、Inbox、Artifacts、Schedule 与插件私有值在项目库（`LocalSqliteStorage`）；Shelf 在 `{home}/shelf/`；Sessions 在 Home 的会话登记。 |
| 插件平台与公共合同已存在、接入程度不一 | 属实。动作服务（`packages/kernel` ActionService）已统一注册、发现、授权、调用与调用记录；已有“协议型动作”（按 `input_type/output_type` 识别、`inspectActionDeclarations` 校验规范 schema、消费方用调用者权限 `discover` 后逐个调用）：对象上下文 `platform/action-subjects.ts`、首页事项 `platform/home-events.ts`、工作流内容站 `platform/workflow-content.ts`、事项动作 `platform/action-offers.ts`。对象上下文读取器目前只有 Goals、Inbox、Feed（材料与来源）、Artifacts、Sessions、Alchemist 方法；个人助理分支补了 Pages 与 Coding。 |
| 已有“搜索” | 没有系统搜索能力。`packages/storage` 里的 `search-storage.ts` 是 Feed 联网搜索（Search Evidence Layer）的密文缓存，不是内容索引。Cognia 有自己的 `cognia.material.search`（全表读出后 JS 子串过滤）；Pages、Feed 等目录内有本地列表筛选。它们保留为插件内局部功能，不是系统搜索。 |

真实缺口：

1. 没有“插件怎样把可搜索对象交给系统”的合同，也没有消费合同。
2. 对象上下文读取器缺少大多数插件；协议原先强制 `scope: project`，Home 作用域对象（Cognia、Jelly、Images）读不了（助理分支 28d3d161 已放开，本任务在其上补读取器）。
3. 没有可持久、可重建的全文索引；两种 SQLite 驱动（Node `node:sqlite` 3.51.2、better-sqlite3 3.51.3）都带 FTS5，但实测 trigram 分词对“预算”“法务”“Q4”这类两字查询**查不到**（第 7 节）。
4. 工作台只能按“点目录里的行”打开对象，未加载的对象打不开；没有命中位置定位。
5. 数据变化的通用信号：动作服务每次调用结束有宿主钩子（`effects.settled`，`project-host.ts` 用来写调用记录），但没有被索引利用；后台写入（Feed 同步、Coding 运行）不经用户动作。

## 3. 现有插件盘点与接入结论

“对象读取”指对象上下文协议读取器（`*.subject.read`）。“条目列出”是本任务新增的搜索条目协议（第 5.1 节）。“打开”指工作台怎样按 id 打开对象。

| 插件 | 业务事实 owner / 数据位置 | 公共存储能力 | 现有读取 / 变更接口 | 可搜索内容 | 打开 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| Goals | `modules/goals`，项目库 | `LocalSqliteStorage` | `goals.subject.read`、events 查询与命令 | 标题、意图、为什么、业务逻辑、预期结果、进展摘要 | 条目标签 `goals` | 已接入：`goals.search.entries`，版本与读取器一致 |
| Work（Sessions） | `modules/private-work-context`，Home 会话登记 | Home SQLite | `sessions.subject.read`、会话动作 | 会话标题、Runtime、关联 Goal（私人终端正文加密，不入索引） | 条目标签 `sessions` | 已接入（仅摘要）：`sessions.search.entries` |
| Inbox | `modules/attention-resumption`，项目库 | 同上 | `inbox.subject.read`、`inbox.list`、`inbox.entry.status` | 事项标题、进入原因、关联对象摘要 | 条目标签 `inbox` | 已接入（仅摘要，关联材料正文留在 Feed）：`inbox.search.entries` |
| Feed | `modules/feed`/`sources`，项目库；保留正文在 Feed 安全目录（AES-GCM 加密） | 同上 + SecretStore | `feed.subject.read`、`feed.source.subject.read`、Feed 查询与处置 | 材料标题、摘要、来源名；来源名称与说明。**正文加密存放，不进明文索引** | 条目标签 `feed`；来源走目录行 | 已接入：`feed.search.entries`（材料仅摘要，来源名称与说明） |
| Schedule | 插件，项目库 `schedule_conversation_tasks` | 项目库 | `schedule.list`、任务命令 | 对话任务标题与提示词 | 目录行 `schedule` | 已接入：`schedule.subject.read`、`schedule.search.entries`（任务说明与每次运行的回报） |
| Artifacts | `modules/artifacts`，项目库 | 同上 | `artifacts.subject.read`、浏览 | 成果标题、类型、内联正文（最新版本） | 条目标签 `artifacts` | 已接入（仅摘要）：每个成果最新可用版本的标题与负载文字 |
| Coding | Runtime app，插件私有存储（项目库） | Plugin Runtime 私有存储 | `coding.subject.read`（助理分支）、16 项 `coding.*` | 会话标题、任务、最近轮次摘要 | 条目标签 `coding` | 已接入：`coding.search.entries`（Runtime 路由，Coding 升到 1.50.0） |
| Files | 工作区文件（外部事实） | — | `files.*` 读授权目录 | 工作区文件属外部，快照已是 Artifact | — | 不接入：文件内容由工作区与 Git 拥有，按代码检索是另一类功能；Files 产出的快照经 Artifacts 可搜 |
| Git | 工作区 Git（外部事实） | — | `git.*` | 同上，变更集是 Artifact | — | 不接入：同上 |
| Diff | 无自有内容 | — | `diff.compare/state` | 无 | — | 不接入：只呈现已有快照的比较 |
| Text stats | 无自有内容 | — | `text-stats.*` | 无 | — | 不接入：只统计已有快照 |
| Cognia | 插件，`{home}/cognia/cognia.db`（Home 作用域） | `openHomeSqliteDatabase` | `cognia.material.*`（含自带搜索） | 资料标题、正文、标签、领域 | 目录行 `cognia` | 已接入（个人范围）：`cognia.subject.read`、`cognia.search.entries`；自带搜索保留为插件内功能 |
| 插件创作台 | 插件，安装私有存储里的设计草稿与发布记录 | Plugin Runtime 私有存储 | 只有创作台自己的 HTTP 路由；平台动作在打开创作台后才懒加载登记 | 草稿标题与一句话需求 | 创作台页 | **真实缺口，未接入**：草稿没有动作层，宿主组合只在创作台打开后才登记提供方；要可搜需在项目打开时为草稿补读取与条目动作，属创作台 v3 组合（`specs/plugin-builder/work-items/studio-v3/spec.md`）。影响：创作台草稿搜不到；已发布的生成插件目前也不能声明协议型动作（见第 12 节） |
| Images | 插件，`{home}/images/images.db`（生图服务在 Home，生成记录按项目分区） | `openHomeSqliteDatabase` | `images.*` | 生成描述（提示词）与模型 | 目录行 `images` | 已接入（项目）：`images.subject.read`、`images.search.entries` |
| Jelly | 插件，`{home}/jelly/jelly.db`（单一工作区 JSON + 修订号，Home） | 同上 | `jelly.*`（读 workspace、命令） | 日程标题与备注、笔记、灵感 | 目录行 `jelly` | 已接入（个人范围）：日程、笔记、灵感三种对象与读取器 |
| Experiments | 插件，Home | Home 文件 | `experiments.*` | 实验名称与状态 | 目录行 `experiments` | 已接入（仅摘要）：材料与答案是可能敏感的测试数据，不入索引 |
| Shelf | `modules/shelf`，`{home}/shelf/` | 文件 + SQLite | `shelf.snapshot` 等 | 材料名称、抽出的文字 | 条目标签 `shelf` | 已接入（个人范围，仅摘要）：材料名称与抽出的文字（`shelf.search.entries`，与 `shelf.items.read` 同样对外）；剪贴板历史单独一个只对本机的人开放的来源（`shelf.clipboard.search.entries`，受众 `user`） |
| 灵光 | 插件，`{home}/lingguang/lingguang.db`（按项目分区） | `openHomeSqliteDatabase` | `lingguang.list/get` 等 | 灵光标题与正文 | 条目标签 `lingguang` | 已接入：只含未丢弃的灵光 |
| Characters | `modules/characters` 草稿 | SQLite | `characters.list/state` 等 | 角色名称、做事方式说明 | 目录行 `characters` | 已接入：Runtime 插件以本人绑定动作提供（升到 1.5.0） |
| Pages | 插件，`{home}/pages/pages.db`（按项目分区） | `openHomeSqliteDatabase` | `pages.subject.read`（助理分支）、`pages.list/get/update` | 标题与正文 | 条目标签 `pages` | 已接入：`pages.search.entries`，正文经助理分支的 `pages.subject.read` |
| Form | 插件，`{home}/form/form.db`（按项目分区） | 同上 | `form.list/get` | 问卷标题、说明、题目与选项 | 目录行 `form` | 已接入：问卷本身；填写结果不入索引（见下） |
| Dataset | 插件，`{home}/dataset/dataset.db` | 同上 | `dataset.list/get` | 表名、说明、列名、单元格文字（截断） | 目录行 `dataset` | 已接入 |
| PPT | 插件，`{home}/ppt/ppt.db` | 同上 | `ppt.list/get` | 标题、说明、每页标题与正文 | 目录行 `ppt` | 已接入 |
| Alchemist | 插件，`{home}/alchemist/` 项目隔离 | 同上 | `alchemist.*`、`alchemist.playbook.context` | 方向、Idea 的标题与核心问题 | 目录行 `alchemist` | 已接入（仅摘要）：方向与 Idea 的标题、核心问题与机制 |
| Workflows | 插件，`{home}/workflows/workflows.db`（按项目分区） | 同上 | `workflows.list/get` | 流程标题与步骤说明 | 条目标签 `workflows` | 已接入：流程标题、步骤与交接规则（不含运行记录） |
| 6 个官方集成（catalog、github、gmail、rss、web-query、youtube） | Provider 适配，不持有业务内容 | Connector/Listener Host | 连接与同步 | 拉到的内容成为 Feed 材料与来源 | — | 不单独接入：内容经 Feed 可搜 |

Form 填写结果：属于填写人的回答，数量不受控；首期只索引问卷本身。原因写进插件适配说明，结果查看仍在 Form 里。

以上“补……”都是**需要补接口**，不是迁移：每个插件继续用自己的库、表和校验，只多声明一个条目列出动作（和缺的对象读取器）。本盘点不要求任何插件搬库。

## 4. “统一”的边界

统一的是：存储技术能力（索引适配放 `packages/storage`）、互通协议（条目列出与对象读取、搜索消费合同）、生命周期规则（停用、卸载、项目删除、Home 隔离、备份恢复时索引怎么办）。

不统一的是：插件的表结构、业务状态、版本号与校验规则。插件自己决定哪些字段可以进入索引、版本怎么算、对象在哪打开。

- 不强制同一张表或同一个物理库；搜索服务不读任何插件的私有库，只经动作目录调用插件声明的条目列出与对象读取动作。
- 搜索索引是**派生缓存**：可以整个删掉重建，永远不作为业务事实被读取或写回。点开结果前按原 owner 重新核对；Goals 等领域模块仍是各自事实的权威来源。
- 不另建助手专属搜索库或事实库；助理用同一个 `search.query`，读正文用原有对象读取器。

## 5. 合同

### 5.1 内容提供合同（插件实现）：`platform/search-sources.ts`

插件为每类可搜索对象提供两样东西：

1. **条目列出**（新增协议 `molis.search.entries.v1`，查询动作，`scheduling: "concurrent"`）：
   - 输入：`{ cursor: string | null, limit: 1..500 }`，按插件自己稳定的顺序分页列出**全部**当前可搜索条目。
   - 输出：`{ entries: SearchEntry[], next_cursor: string | null, collection_revision: string }`。
   - `SearchEntry = { subject: {kind,id}, revision, title, summary, updated_at, content: "context" | "summary", open: {surface,id} | null }`。
   - `revision`：owner 自己的版本记号，条目任何可索引内容变化时必须变化；只做相等比较。
   - `collection_revision`：整个集合的版本记号，任一条目新增、修改、删除都必须变化；无法廉价算出时每次返回新值（搜索服务就每次完整比对）。
   - `content: "context"`：搜索服务按同一提供方的对象读取器读取正文并写入索引；`"summary"`：只把 `title` 与 `summary` 写入索引，正文留在 owner（例如 Feed 加密正文、会话私人正文）。
   - `open.surface` 是工作台插件标识（`^[a-zA-Z0-9_-]+$`），`open.id` 是该插件里对象的 id；与对象上下文的 `open` 同形。这就是“对象种类 → 打开位置”的声明：提供方在动作元数据 `search_source.kinds` 里静态列出 `{ kind, title, surface }`，发现目录即可读（个人助理的底栏兜底表改为读这里）。
2. **对象读取**：`content: "context"` 的种类必须由同一提供方的对象上下文读取器（`*.subject.read`）提供正文。读取器是对象读取的唯一路径，助理与搜索读到同一份正文。

可选的**按需查询**（协议 `molis.search.query.v1`）：内容不能持久化（如需要解密、外部服务）时，插件实现 `{ query, limit } → { hits }`，搜索服务在查询时带调用者权限调用、合并结果，不写索引。首期协议与服务端合并实现并用测试插件验证；是否有官方插件使用见第 12 节。

SDK（`packages/plugin-sdk`）导出 `defineSearchEntriesAction(capabilityId, kinds, title, permissions, scope, audiences)`、`searchEntriesPage()`（按 id 排序分页、计算集合版本的辅助）、`defineSearchQueryAction`；`inspectActionDeclarations` 校验规范 schema，声明不合合同的动作不能进入目录。

**来源的受众不能比插件原有的读取更宽。** 默认受众是 `user`、`agent`、`workflow`、`mcp`、`plugin`；插件只让本机的人看的内容（例如 Shelf 的剪贴板历史，原有动作只对 `user`）单独声明一个来源并把受众限为 `["user"]`。索引照常建立（建索引用本机用户上下文），但助理、工作流、MCP 客户端发现不到这个来源，它的条目就不会出现在它们的结果里。来源必须对 `user` 开放，否则无法建立索引，声明检查会拒绝。

### 5.2 搜索消费合同（系统动作）：`services/search.ts`

系统提供方 `system.search`，动作对 `user`、`agent`、`workflow`、`mcp`、`plugin` 开放，`scheduling: "concurrent"`，权限 `search:read`（重建为 `search:manage`，只对 `user`）：

- `search.query`：输入 `{ query (1..200 字), scope: "project" | "personal" | "all", kinds?: string[], plugins?: string[], cursor?: string | null, limit?: 1..50 }`。
  - 范围由可信调用上下文决定：有项目的调用者 `all` = 本项目 + 个人；无项目的调用者只有个人。项目不从输入读取，不做跨项目搜索（一个客户端的项目作用域不能被输入改变）。
  - 输出 `{ status, hits, next_cursor, sources }`：
    - `status`：`complete`（所有相关来源已就绪）｜`partial`（有来源失败、过期或仍在首次索引，结果仍有效）｜`indexing`（首次索引尚无结果可用）｜`empty_scope`（范围内没有可搜索来源）。
    - `hit = { hit_id, subject, project_id, plugin_id, plugin_title, source: {capability_id, version, provider_id}, title, snippet, highlights, revision, updated_at, open, locator: { field, offset, length } }`。
    - `sources[] = { plugin_id, title, state: ready | indexing | stale | failed | unavailable | disabled, reason, indexed_at, entries }`。
- `search.open`：输入 `{ hit_id }`（或 `{ subject, source }`），按原提供方重新核对对象仍存在且调用者能读，返回当前 `{ state: "ok", open, title, revision }`；对象已删除返回 `{ state: "missing" }` 并从索引删除该条；来源不可用返回 `{ state: "unavailable", reason }`。不修改业务数据。
- `search.status`：本调用者范围内各来源的索引状态，供界面显示“首次索引中”、失败原因。
- `search.rebuild`：删除本范围索引并重新建立（管理用）。

权限与泄露防护：一次查询先用**调用者自己的**权限发现目录；只有调用者当前可用的条目列出动作（且 `content: "context"` 时对应读取器也可用）的来源，其条目才会出现在结果里，摘要也一样。Web 用户、MCP 客户端的逐项授权、助理对能力的单独关闭、生成插件的安装授权因此自动生效，不另建权限表。

## 6. 模块划分与依赖

| 位置 | 负责 | 依赖 |
| --- | --- | --- |
| `packages/contracts/src/platform/search-sources.ts` | 提供合同（条目列出、按需查询）与校验常量 | contracts 内部 |
| `packages/contracts/src/services/search.ts` | 消费合同、系统动作定义、索引端口 `SearchIndexPort` | contracts 内部 |
| `packages/storage/src/adapters/text-search-index.ts` | SQLite FTS5 索引适配：切分、写入、删除、查询、状态表、完整性检查 | contracts |
| `horizontal/search`（新包 `@molis-ai/molis-work-service-search`） | 搜索业务服务：来源发现、首次构建、增量比对、删除清理、失败恢复、查询聚合、排序、去重、权限过滤、打开核对 | 只依赖 contracts |
| `apps/local-host` | 装配：打开 `{home}/search/search.db`、创建服务、注册系统动作、提供建索引用的可信本机用户上下文、把 `settled` 钩子接到“标脏”、项目删除与插件停用的生命周期 | 组合根 |
| 各插件 | 条目列出与对象读取的业务解释 | 各自已有依赖 + contracts |
| `apps/workbench` | 全局搜索界面：调 Host 路由（转发到 `search.query/open`），范围切换、状态、打开与定位 | 组合根 |
| 助理、工作流、MCP | 经共同动作目录发现并调用 `search.*` | — |

不把搜索业务写进 Host：Host 只装配与提供上下文。不维护第二份能力名单：来源由目录里声明协议的动作自动发现，新插件照 SDK 声明即接入，Host 与搜索服务都不改。

## 7. 索引方式（实测后决定）

2026-09-28 在两种驱动上实测 FTS5：`trigram` 分词对 `预算`、`法务`、`Q4` 均 0 命中（trigram 至少三字符），`LIKE` 能命中但无法用索引。

决定：自己切分后放入 FTS5 `unicode61` 无内容表（`contentless_delete=1`）：

- 中日韩字符：每个字单独成词，再加相邻两字的双字词。查询时 1 字用单字，2 字及以上用双字词 AND；
- 拉丁字母与数字：按连续片段取小写词，查询用前缀匹配（`prefix='2 3'` 前缀索引）；
- 文本先做 NFKC 与小写（全角 `ＯＫＲ`、`５０万` 与半角同等）；
- 候选再用原文子串核对（对双字 AND 的误命中做精确过滤），并据此算出摘要与命中位置；
- 排序：FTS5 bm25（标题权重高于正文）+ 标题完全包含加分 + 更新时间次序。

向量检索与模型调用不是基础搜索的依赖。

## 8. 新鲜度、生命周期与恢复

- **首次构建**：某个来源第一次被查询范围用到时开始，分页列出、按批读取正文写入；查询在时间预算内（约 1.5 秒）返回已有结果与“首次索引中”状态，构建在后台继续，界面稍后重查。
- **增量**：每次同步先取第一页的 `collection_revision`，与上次完成值相同则跳过；不同则完整列出条目的 `(id, revision)`，只读取新增或版本变化的正文，删除这次没出现的条目。
- **变化信号**：动作服务每个成功的命令结束时，宿主把该提供方标脏（不管来自页面、助理、工作流还是 MCP）；查询时对标脏或超过新鲜期（数秒）的来源先做增量同步；后台写入（Feed 同步等）也因此在下次查询前被发现。不依赖某个页面或助理主动触发。
- **失败**：一个来源列出或读取失败，保留它原有索引行，状态记为 `failed`/`stale` 与原因，查询结果标 `partial`；下次查询再试。中途失败的构建不提交半截删除。
- **重启**：索引持久在 `{home}/search/search.db`；启动后第一次查询按 `collection_revision` 追平。
- **重建**：索引文件缺失、完整性检查失败或 schema 版本不符时，自动删除重建；`search.rebuild` 可手动触发。
- **插件停用 / 卸载**：来源在目录里不可用（`actions.plugin_disabled`）或已消失时，删除它的索引行并在状态里显示“已停用”；重新启用后按首次构建处理。
- **项目删除**：删除该项目的全部索引行。
- **Home 隔离**：索引属于创建它的 Home；不同 Home 各自一份。`{home}/search` 加入卸载清除名单；备份是 Home 的离线拷贝，索引随之或缺失都能自行修复。
- **权限变化**：见 5.2，查询时实时按调用者目录过滤，撤权立即生效。
- 业务数据在 Home 隔离、迁移、备份恢复、停用、卸载、删除项目时的现行规则（按代码核实）写在 `docs/platform/STORAGE-AND-EXCHANGE.md` 1.1 节；本任务没有改变任何插件的业务数据规则。

## 9. Workbench 用户路径

- 入口不变（放大镜、⌘K、⌘F）。输入后查询 `search.query`（去抖），结果按插件分组；“插件”与“快捷操作”组保留，仍在本地筛选。
- 范围切换：本项目＋个人（默认）｜仅本项目｜仅个人；在项目列表页（无项目）只有个人。
- 状态：首次索引中（显示正在建立索引的插件）、没有匹配的内容、部分来源不可用（列出哪个插件、原因）、对象已删除（点开后提示并从结果移除）、插件已停用。
- 打开：先调 `search.open` 核对，再按 `open.surface`：有条目标签的插件用 `openTabItem`，否则用插件声明的目录行选择（`searchRow`）。打开后工作台在该窗格里查找命中文字、滚动到位并临时高亮（CSS Highlight）。
- 无结果时回车不再自动转给助理；显示一行明确的“问助理：…”，用户选择才转交（助理 spec 4.2）。

## 10. 与个人助理任务的分工（2026-09-28 与助理会话确认）

| 归本任务 | 归个人助理任务 |
| --- | --- |
| 搜索协议、搜索服务、索引、`search.*` 系统动作、Workbench 搜索界面 | 会话、工作、`data-assistant-context` 页面上下文、底栏交互 |
| 各插件的条目列出；**其余官方插件的对象读取器**（Pages、Coding 已由助理分支提供） | Pages、Coding 读取器；`actionResultSubject`、`isSubjectReader`、对象上下文 `open` 字段、Home 作用域读取器放开（28d3d161） |
| 搜索来源里“种类→打开位置”的静态声明 | 底栏把兜底表换成读这份声明 |
| — | Context Ledger 的 `assistant`/`plugins` 命名空间与工作关系 |

合并顺序：助理分支先合；本分支在需要其合同时把 `feature/system-assistant` 合入，再补读取器；本分支不改 `action-subjects.ts` 与 Context Ledger 合同，对方不动本任务的新文件。

## 11. 验收

| 编号 | 场景 | 通过的样子 |
| --- | --- | --- |
| S01 | 新 Home、未打开任何插件，Pages 里有一篇正文含“预算控制在 50 万以内”的文档 | 在项目里搜“预算”“50万”“控制”，第一次返回“首次索引中”或直接命中；命中后点开进入该文档并高亮命中文字 |
| S02 | 新建、修改、删除 | 新建文档后立即可搜；改掉关键词后旧词不再命中、新词命中；删除后不再出现；点开一个刚被别处删除的旧结果，提示对象已删除并从结果移除 |
| S03 | 项目与个人隔离 | 项目 A 的内容在项目 B 搜不到；Cognia、Jelly 的个人内容两个项目都能在“个人”范围搜到；无项目入口只有个人 |
| S04 | 授权隔离 | MCP 客户端只授权了 `search.query` 与 Pages 条目列出：只看到 Pages 结果，看不到 Goals；撤销 Pages 授权后立即看不到；助理关闭某个来源能力后同样看不到 |
| S05 | 中文与短查询 | 1 字、2 字中文，`Q4`、`OKR`、`sea`（前缀）、全角 `ＯＫＲ`、中英混排 `search方案` 都能命中且无明显误命中 |
| S06 | 打开与定位 | Goals、Pages、Feed、Inbox、灵光、Form、Dataset、Cognia 等结果点开后到正确对象；文字可见时滚动并高亮 |
| S07 | 重启、重建、失败恢复 | 重启服务后结果仍在并能追平重启期间的变化；删除索引文件后自动重建；让某来源读取失败，结果标“部分来源不可用”，原有该来源结果仍可搜，恢复后状态回到正常 |
| S08 | 停用、卸载、来源不可用 | 在项目里停用灵光：灵光结果消失、状态显示已停用；重新启用后又能搜到 |
| S09 | 同一合同 | 页面、助理（能力网关读取 `search.query`）、MCP `tools/call` 对同一查询得到同一批对象引用；助理能用结果的 subject 读取上下文 |
| S10 | 新插件接入 | 一个经 Plugin Runtime 注册的未知插件只声明条目列出与读取器，不改 Host、搜索服务与工作台，就能被搜到与打开 |

工程门禁：`pnpm build`、`pnpm workspace:typecheck`、`pnpm boundary:check`，本任务定向测试与受影响的既有测试；浏览器用例覆盖全局搜索。

## 12. 进度与证据

| 步 | 内容 | 状态 |
| --- | --- | --- |
| P1 | 合同（提供与消费）、storage 索引适配、`horizontal/search` 服务 | 工程通过（bda1333c） |
| P2 | Host 装配：`system.search`、建索引上下文、成功命令与提供方注册/撤下即标记、项目删除与卸载清理、Web 路由 | 工程通过（50ab6c6c、90495cc9） |
| P3 | 20 个插件接入（第 3 节）；插件创作台为真实缺口 | 工程通过（7ae69d7e、37c75970、1cf17d7b、90495cc9） |
| P4 | Workbench 搜索界面 | 工程通过、真实界面实操通过（5c24af3c、90495cc9） |
| P5 | SDK、Skill、手册、包说明、SSOT、架构需求书、产品范围 | 完成（3715bdfc 及之前） |
| P6 | 真实场景：隔离 Home 预览与浏览器实操、真实 MCP 进程、助理授权 | 见下 |

与助理分支：已合入 `feature/system-assistant` c50288ea（含 origin/main 21cdfbf8），本分支须在其后合入 main。

### 工程通过（定向）

- `tests/system-search.test.ts` 13 项：协议校验与分页辅助；未打开内容的中文 1–2 字、`Q4`/`q4`、全角 `ＯＫＲ`、前缀 `sea`、混排 `search方案`、`50万`、“算控”不误中；命令成功后的新建/修改/删除，无人通知的后台写入在新鲜期后被发现；项目、个人、MCP 授权与“只有列出没有读取器”的隔离；仅摘要内容不入索引也不读正文；打开核对与已删除移出；失败保留、状态为 stale/failed 与恢复；停用/启用/卸载/重装；重启不重读、删除与写坏索引文件后重建；翻页游标；按需查询来源不落盘。
- `tests/system-search-host.test.ts`：真实 Home/目录/Host/Web 服务/Plugin Runtime——Pages、Form、灵光、Goals 的真实内容可搜；修改、删除、丢弃即时反映；两个项目互不可见；Cognia 个人内容在两个项目与项目外都可搜、限定本项目不出现；MCP 调用上下文逐项授权；未知 Runtime 插件只声明协议即被搜到、停用后消失；`/api/search/*` 需要控制令牌、项目外只有个人范围。
- `tests/system-search-lifecycle.test.ts`：项目里停用 Goals 后结果消失且状态为已停用、重新启用后重建；重启后 `indexed_at` 不变（未重建）；索引文件丢失后重建；真实 stdio MCP 进程只授予 `search.query` 看不到内容、授予来源与读取器后可搜到正文、撤销来源立即消失；助理经 `assistantAuthority` 调用 `search.query` 并用命中对象的读取器读到正文与打开位置，对助理关闭来源只影响助理。
- 20 个插件的搜索来源在真实宿主注册时经 `inspectActionDeclarations` 校验无问题；`pnpm workspace:typecheck` 通过；`pnpm boundary:check` 仅剩助理分支 3 条既有错误（已由其在 1a98afed、bdf417c3 修复，待再次合入）。

### 真实场景实操（隔离 Home，`search-dev` 4270，本分支构建）

- 预置两个项目与 Pages、Form、灵光、Goals、Dataset、Cognia 真实内容，均未打开过。
- ⌘K 搜“法务”（只在第 31 段正文里）：命中“第四季度计划要点”，摘要高亮；点开进入该文档，编辑器滚动到第 31 段，页面里 `CSS.highlights` 标出“法务/OKR”。
- 搜“预算”只返回本项目文档，另一个项目的“另一个项目的预算”不出现。
- 切到“仅个人”搜“鲸落”：命中 Cognia 资料；回车后 Cognia 打开的正是这份资料，并高亮“鲸落”。
- 搜到“周会纪要”后从 Pages 接口删除它，再点这条旧结果：提示“这条内容已被删除或归档，已从结果中移除”，该条消失；再搜不到。
- 无结果时显示空状态与一个不预选的“问助理”按钮，回车不触发。
- 发现并修复：结果返回前选中项被钳成 -1 导致回车无效；Esc 后立即 ⌘K 重开时延迟的关闭事件作废新查询；单库看板页被当成无项目；Home 级清理误删单库模式的索引。

### 浏览器既有用例

`global-ui-interaction`、`immersive-directory`、`product-experience-polish`、`goals-tree`、`goals-narrow-navigation`：本任务引入的只有“分屏打开”一项（内容结果改为异步，用例改为先等结果出现，已通过）。其余 4 项在基线 c50288ea 上以相同位置失败（窄屏下 `[data-global-search-open]` 被隐藏；“产品旅程”第 97 行 Cognia 打开模型设置），与搜索无关，已告知助理会话。

### 全量回归

（进行中）

## 13. 未完成与限制

- **插件创作台草稿**不可搜（第 3 节）；**生成插件**不能声明协议型动作（搜索来源、对象读取器），其内容不可搜。两者都需要创作台 v3 的组合补动作层。
- **Feed 保留正文**加密存放，不进明文索引；Feed 只按标题、摘要、来源与标签可搜。首期没有官方插件使用按需查询协议（协议、服务端合并与测试插件已验证）。
- **项目列表页**（无项目）工作台没有搜索入口；个人内容可在任何项目里用“仅个人”搜，助理与 API 在无项目时也可用。
- **跨项目搜索**不提供：调用者的项目作用域由可信上下文决定。
- 命中定位依赖正文在页面上是可见文字；Dataset 单元格、Jelly 日历中未显示在当前视图的对象只能打开到对象，不一定高亮。
- 助理的真实模型轮次（MiniMax）未跑搜索场景；已用助理运行时同一授权对象验证调用链。
- **工作流**：`search.query` 对工作流受众开放，但现有工作流的“动作步骤”只提供命令类动作，查询类（搜索、对象读取）不能作为步骤；这是工作流步骤模型的范围，未在本任务改动。
- 用户验收：未进行。

