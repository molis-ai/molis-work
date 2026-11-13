# 风险插件：实施方案、开工前检查与合同设计稿（第 17 批）

状态：设计稿（2026-11-13，第 17 批主会话写）；交公共合同台与 D 轨合审后实现。行为与验收以[原需求](spec.md)为准，界面以[定样决定](spec.md#design-decisions)与原型 [`docs/design/risk-plugin`](../../docs/design/risk-plugin/README.md) 为准。

## 1. 这一片说什么（需求开发流程 §2.1）

- **做什么**：新的内置项目插件「风险」：风险记录（两栏整页 + 从别处点开先在右侧栏打开）、项目风险总览（按状态分组）、复查（详情里的复查段，按需安排，到期给建议、人采纳才改）；对外提供读取、搜索、呈现与概况，供 Goal、助理、首页和第 19 批的 Work Brief 引用。Goals 的顾虑可以引用风险（或任何对象）。
- **为什么现在**：前置 06、14、15、16 都已合入；第 19 批 Work Brief 的「风险接续」以本批的风险来源为前置。
- **不做**：Work Brief 本体与简报里的风险段（第 19 批，见 §6 验收归属）；旧风险数据迁入（原需求「不做」）；团队成员目录（产品还没有，负责人先记名字，见 §3.2）。

## 2. 开工前检查（需求开发流程 §4，15 项）

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 风险（说明、影响、可能性、处置、负责人、状态、进展、关联、复查安排与结果）只归风险插件，存在它自己的项目库表里。Goal、顾虑归 Goals；Goals 只存「这条顾虑引用了哪个对象」（kind + id），不复制风险字段。复查任务、时间、暂停与历次结果都归 Schedule（一次性助理任务，按对象找回），风险库不存复查状态；提醒走 Schedule 已有的通知。读别人的对象（关联的 Goal、会话、Feed 消息、成果）只经对象读取器（`resolveActionSubject`）。 |
| 2 | 插件同等待遇 | 经 Plugin Runtime 装配（`registration.project_runtime`），只用 SDK 与平台服务；不改 `project-plugins.ts`，不加宿主文件或构建期接线。「从别处点开先在侧栏打开」做成任何插件都能声明的侧栏视图字段（§4.3），不在工作台写风险的分支。 |
| 3 | 能力注册 | 全部能力在风险 Manifest 声明一次（§4.1），页面路由只转调动作，助理、工作流、MCP 用同一套。可信身份取自调用上下文。风险插件不调模型、不声明 Agent 角色（用户 2026-11-13 定：插件只登记任务，到点由后台助理开一轮，解耦）；转调 Schedule 的动作声明 `scheduling: "concurrent"`。 |
| 4 | 合同 | 现在处在 M1 之前，不留兼容期。改四处：① 新插件的动作（动作快照新增，不改别人的）；② Goals 顾虑加可选的 `cited_subjects`（Goals 动作 schema 原版本内改，阶段一；同一个 PR 改完 Goals 的页面与用例）；③ Manifest 侧栏视图加 `opens_items`（contracts `platform/plugin-manifest` 与 SDK 校验）；④ Schedule 定时任务加一次性与对象（§4.5，库 v+1 带升级段）；另有 SDK `/ui` 新增一个渲染函数（§4.4）。没有别的批在等这几份合同，随本批 PR 走，公共合同台在最终头上合审一次。 |
| 5 | 放在哪个包 | `plugins/native/risk`（`@molis-ai/molis-work-plugin-risk`），只依赖 contracts 与 plugin-sdk。侧栏优先打开的处理在工作台已有的 `openItem` 一处；矩阵小格进 `packages/plugin-sdk/src/ui`。不新建 horizontal 包（没有新的平台服务）。 |
| 6 | 表与存储 | 风险的五张表在 Manifest `databases.project`（store `risk`，第 1 版，`storage:private`），只由风险插件读写；不进 `table-owners.json` 共写名单。新库从第 1 版起，进 `tooling/gates/schemas/stores.tsv` 快照。Goals 的顾虑记录多一个 JSON 列存引用、Schedule 的任务表多四列：两个库各升一版并带升级段（§4.2、§4.5）。 |
| 7 | 兼容与迁移 | 不加兼容读取。风险从空开始（原需求已定）。Goals 库加列走升级链的正式升级段，不是兼容读取。 |
| 8 | 安全边界 | 不碰回环、令牌、网关、MCP 授权等。新增的是一个插件的普通动作，授权走网关；复查到期由平台调度以安装身份唤醒，读别人的对象仍受动作目录授权（读不到如实记成「读不到」）。送给模型的风险与对象正文按数据传（`instructed`），不当指令。侧栏打开只把对象 id 交给同一插件已声明的侧栏视图，不扩大任何权限。 |
| 9 | 调用次数 | 总览一次请求：`risk.list@1` 一次读库（列表与关联、复查摘要一起取，不按条目逐个请求），关联对象的名字只在详情里批量读一次（同一个 kind 一次，经 `presentation.values` 一类的批量读取，不逐个）。详情一次请求（`risk.get@1`）。页面不在后台轮询；改完一条只回读这一条。复查段一次：读 Schedule 按对象筛出的任务一次（含历次结果），不逐个读。 |
| 10 | 升级与数据 | 新库第 1 版；以后改结构升版本带升级段。复查任务归 Schedule，升级与重装照 Schedule 的规则。Goals 已有顾虑升级后 `cited_subjects` 为空数组，照常可用。 |
| 11 | 成果与过程项 | 风险是插件自己的活对象，不是固定版本的成果，不进成果库；不声明 `artifacts.produces`。复查结果也不进成果库。 |
| 12 | 页面、外壳与文字 | 插件只出舞台（总览与整页详情，`navigator` 视图）和一个侧栏视图（单条风险）；不出自己的整页、不开新标签。跨模块只用已登记的 `molis:side-open` 与 `molis-work:select-item`，不新增 DOM 事件。文字用 `risk.*` 稳定键，Manifest `ui.locales` 声明 `locales/zh.json`、`locales/en.json`；状态、影响等存英文枚举，不存译文；给模型的指令跟平台给的回复语言。颜色、字体只用语义变量。页面资源：新插件客户端是新增资源，按规则先问用户（§7）。 |
| 13 | 错误 | 风险的错误码用 `defineErrorCodes("risk", …)` 声明（`risk.not_found`、`risk.conflict`、`risk.closed`、`risk.invalid`、`risk.review_unavailable`），不写 Error 子类；主人表 `tooling/gates/error-owners.json` 加 `plugins/native/risk/`。 |
| 14 | 冲突面 | 改到的枢纽：`apps/workbench/src/builtin-plugins.ts` 与宿主生成登记（脚本生成）、根与两个应用的 `package.json` 依赖（生成器写）、`pnpm-lock.yaml`、`docs/SSOT-MATRIX.md`、`docs/system/PACKAGE-BOUNDARIES.md` 清单、`.github/CODEOWNERS`、`tooling/gates/actions/`、`tooling/gates/api/`（plugin-manifest、SDK ui）、`tooling/gates/schemas/stores.tsv`。Goals 包（顾虑引用）、Schedule 包（一次性对象任务）与工作台 `openItem`（侧栏优先）属于别的轨道的文件；当前没有在途 PR 改这几处（#1743 与在途 PR 已核：#2051、#2047、#2045 不碰）。 |
| 15 | 全局最优 | 见 §3。 |

## 3. 全局最优（五个场景）

| 场景 | 看法 |
| --- | --- |
| 插件 | 风险是普通的项目插件，用同一套 Manifest、项目库、呈现，复查交 Schedule；「一次性、关于某个对象的助理任务」是 Schedule 的通用能力，Todo、Goal 跟进同样能用；「从别处点开先在侧栏」做成侧栏视图的声明字段 `opens_items`，以后 Todo、Issue 一类想这样打开的插件只加一个字段；「顾虑引用对象」是 Goals 的通用字段，不只认风险。第三方插件同样能声明，没有内置专用的路。 |
| 平台 | 没有新的平台服务：调度、通知、对象读取、呈现、搜索都是现成的。平台只多两处小能力：侧栏优先打开（工作台 `openItem` 一处读声明）和组件板的矩阵小格。 |
| 助理 | 动作向 `user`、`agent`、`workflow`、`mcp` 开放（写入要授权），助理能列、读、记、改状态、安排复查；带 `risk-review` 方法（Skill）说明什么时候该记风险、怎样复查、什么时候只引用不新建。复查到期是 Schedule 的助理一轮：任务说明由风险插件按这条风险写好，人在 Schedule 的任务授权里勾「风险」等分组，那一轮才读得到风险与关联对象；读不到就如实写缺口。没有界面时，助理照样能经 MCP 完成全部操作。 |
| 各类平台能力 | 搜索（`risk.search.entries`）、对象读取（`risk.subject.read`）、公共呈现四形态与首页概况（`presentation`）、按任务授权读取分组（`read_groups`：定时任务可以被允许读风险）、Schedule（一次性对象任务与通知）。不接成果库、端口、连接器；不重叠。 |
| 后续开发 | 第 19 批 Work Brief 按风险的呈现与 `risk.list`／`risk.subject.read` 取材，并从这里打开同一条风险（不另建台账）；第 37、52、64 批的主动助理与评测用同一组动作。再加一种状态或字段：改风险自己的 schema 与库版本，一处。 |

比较过的做法：

- **复查到期谁来判断**（用户 2026-11-13 定）：风险插件只登记任务，到点由后台助理（Schedule 的助理任务）开一轮；插件本身不调模型。比较过「插件调一次模型」（更省，但插件和 AI 耦合）与「插件声明自己的 Agent 角色」（第二套任务状态）。复查结果留在 Schedule 的任务记录里，风险详情读出来；后台一轮按授权只读，改风险由人点「采纳」后经风险动作完成。
- **负责人**：产品没有项目成员目录，先记一个名字（可空），筛选按已用过的名字；有了成员目录再换成成员引用（升库版本）。
- **关联放在哪**：关联对象（Goal、会话、Feed、成果）是风险的事实，存在风险库；Goals 那边只有「顾虑引用对象」。「关联 Goal」筛选查风险库自己的关联表，不去问 Goals。

## 4. 合同设计稿

### 4.1 风险插件（新包，`plugin_id: io.molis.work.risk`，`project_plugin_id: risk`，对象种类 `risk`）

取值（存英文，界面经词表翻译）：

- `status`: `open` | `mitigating` | `accepted` | `closed`（打开、缓解中、已接受、已关闭）。状态环：open → `waiting`（要处理）、mitigating → `running`、accepted → `paused`（搁置）、closed → `done`，以 15 的状态环为准。
- `impact`、`likelihood`: `high` | `medium` | `low`。
- 关联对象：`{ kind, id }`（`ActionSubject`），一条风险最多 20 个；`goal`、`coding_session`、`feed_item`、`artifact` 等任何有读取器的种类。

库（`databases.project`，store `risk`，第 1 版；复查不在这里，见 §4.5）：

| 表 | 列（要点） |
| --- | --- |
| `risk_items` | `risk_id` PK、`project_id`→`project_root`、`title`、`statement`、`impact`、`likelihood`、`treatment`、`owner_name`（可空）、`status`、`revision`（整数，每次写 +1）、`created_by`、`created_at`、`updated_at`、`closed_at` |
| `risk_links` | `risk_id`、`subject_kind`、`subject_id`、`added_by`、`added_at`；PK (risk_id, subject_kind, subject_id)；索引 (subject_kind, subject_id) 供「关联 Goal」筛选 |
| `risk_events` | 进展时间线：`event_id`、`risk_id`、`kind`（`created`、`updated`、`status`、`note`、`linked`、`unlinked`）、`detail_json`（只存枚举与原话，不存译文）、`actor_id`、`at` |

动作（权限 `risk:read`／`risk:write`；受众 `user`、`agent`、`workflow`、`mcp`、`plugin`，复查唤醒只给 `plugin`）：

| 动作 | 种类 | 输入 → 输出 |
| --- | --- | --- |
| `risk.list@1` | query | `{ status?: "open"\|"closed"\|"all"（默认 open）, impact?, owner_name?, goal_id?, unlinked?: boolean }` → `{ risks: RiskRow[], owners: string[] }`；`RiskRow` = 风险字段 + `links`（kind/id） |
| `risk.get@1` | query | `{ risk_id }` → `{ risk, links, events }`（复查段另读 `risk.review.get@1`） |
| `risk.subject.read@1` | query | 标准对象读取器（`defineSubjectContextAction`），`open: { surface: "risk", id }` |
| `risk.search.entries@1` | query | 标准搜索来源（`defineSearchEntriesAction`），未关闭与已关闭都列，摘要 |
| `risk.presentation.values@1`、`risk.presentation.overview@1` | query | 15 的呈现取值与概况；概况给未关闭风险数与最该看的几条 |
| `risk.create@1` | command | `{ title, statement, impact, likelihood, treatment?, owner_name?, links? }` → `{ risk }`；`result_subject` 指向新风险 |
| `risk.update@1` | command | `{ risk_id, expected_revision, title?, statement?, impact?, likelihood?, treatment?, owner_name? }` → `{ risk }`；版本不对报 `risk.conflict`，附当前内容（页面两边对照，不覆盖）；已关闭报 `risk.closed` |
| `risk.status.set@1` | command | `{ risk_id, expected_revision, status, note? }` → `{ risk }`；关闭提交后归档这条风险的复查任务（转调 Schedule；失败照实告诉人，可重试）；重新打开不自动恢复复查 |
| `risk.links.add@1`／`risk.links.remove@1` | command | `{ risk_id, subject }` → `{ links }`（加之前用读取器核一次对象存在且读得到） |
| `risk.notes.add@1` | command | `{ risk_id, text }` → `{ event }` |
| `risk.review.get@1` | query | `{ risk_id }` → `{ tasks }`：经 Schedule `tasks.list` 按对象 `{risk, id}` 筛出的任务（时间、状态、历次结果）；Schedule 没装或读不到时如实返回 `unavailable` |
| `risk.review.schedule@1` | command，`concurrent` | `{ risk_id, run_at, focus }` → `{ task }`：按这条风险写好任务说明（读原件、关联对象与上次结果，判断变化与下一步，不改风险），新建或改期 Schedule 的一次性对象任务；已关闭的风险拒绝 |
| `risk.review.enabled@1`、`risk.review.cancel@1` | command，`concurrent` | `{ risk_id, task_id, enabled }`／`{ risk_id, task_id }`：先核这个任务的对象就是这条风险，再转调 Schedule 的暂停／恢复、归档 |


`read_groups`：`{ group_id: "risk", actions: [list, get, subject.read, search.entries] }`：复查任务（以及别的定时任务）可以被允许读风险（第 18 批的按任务授权）。

方法 `risk-review`（助理什么时候记风险、只引用不新建、复查一轮怎样判断、不自动改风险）。风险插件不登记指令、不声明 Agent。

### 4.2 Goals：顾虑引用对象

- 顾虑（`concern`）加 `cited_subjects: ActionSubject[]`（默认空，最多 8 个）；`concern_opened` 操作可带它。Goals 只存 kind + id，不读、不复制对象内容；页面按 15 的名字片画出来（读不到时照 IUI-02 只画图标、名字与「打开」），点开走工作台 `openItem`。
- 原合同的证据与授权规则不变：引用不让顾虑自动打开、接受或解除，风险状态变化不碰顾虑（RISK-02、RISK-03）。
- Goals 项目库：顾虑记录多一个 `cited_subjects_json` 列，库升一版，带正式升级段与金样（`specs/upgrade-continuity/upgrade-chain-design.md`）。
- Goals 动作 schema 原版本内改（阶段一，`docs/system/CONTRACT-CHANGES.md`），刷新动作快照，在 PR 里写对调用方的影响：只多一个可选字段。

### 4.3 Manifest：侧栏视图 `opens_items`

- `ui.views[]` 里 `slot: "side"` 的视图可以写 `opens_items: true`，一个插件至多一个。意思是：从这个插件以外的地方打开它的对象（`openItem(surface, id)`）时，先在这个侧栏视图里打开（`molis:side-open { tab: "plugin", view, target: { item } }`），原页面留着；视图里给「展开成整页」，走原来的舞台打开。
- 在插件自己的舞台里打开不受影响。窄屏（侧栏占下半屏）同样适用。
- 校验在 SDK 的 Manifest 检查里（`side` 以外的槽写了就拒绝；多于一个就拒绝）；工作台 `openItem` 读登记派生的表，不写插件名。

### 4.5 Schedule：一次性的对象任务

- `schedule.tasks.create@1`／`tasks.update@1` 加 `repeat: "daily" | "once"`（默认 daily）与 `run_at`（once 时必填，ISO 时间）；加可选 `subject: { kind, id }`（这个任务关心的对象，存 kind + id，不复制内容）。`tasks.list@1` 加可选输入 `subject` 按对象筛。受众加 `plugin`，让风险插件以调用者身份转调（`actions:delegate`）。
- 一次性任务跑完一次就停（不再排期，记录保留）；带对象的任务到点那一轮，任务说明里点名这个对象，读取仍只按人给这个任务的授权。
- Schedule 项目库升一版带升级段：任务表加 `repeat`、`run_at`、`subject_kind`、`subject_id`。
- 动作 schema 原版本内改（阶段一），刷新快照，PR 里写对调用方的影响：只多可选字段。

### 4.4 组件板新增（D 轨补标本）

- `renderSeverityGrid({ impact, likelihood, size?: "small" | "large", label })`（SDK `/ui`）：3 × 3 小格，亮的一格按严重程度取 `--tone-blocked`／`--tone-attention`／`--tone-quiet`；`label` 给读屏。总览行用小号，详情要点用大号。原型里的 `.rk-mm`。
- 提示里的按钮：`renderAlert` 已有 `actions`，不新增。
- 长链接按钮折行：原型 README 提的问题，交 D 轨定；本批不加。

## 5. 拆片（批内子分支，按依赖叠）

1. `b17/contracts`：§4.2～4.4 的合同与 SDK（Goals schema、Manifest 字段、SDK 矩阵小格与标本），快照刷新。
2. `b17/risk-core`：插件包、库、动作、搜索、读取器、呈现、指令与方法、登记与清单。
3. `b17/review`：Schedule 一次性对象任务（§4.5）与风险的复查段（安排、改期、暂停、取消、读结果、采纳）。
4. `b17/risk-ui`：舞台（总览、整页详情、复查段）、侧栏视图、工作台 `openItem` 侧栏优先、Goals 顾虑引用的页面。
5. 收尾：同步 main、统一构建与测试、文档与批次记录。

## 6. 验收归属

| 编号 | 本批 | 说明 |
| --- | --- | --- |
| RISK-01 | 全做 | 一份风险事实，多个 Goal 引用；Goals 只存引用 |
| RISK-02 | 全做 | 记录与关联不自动开顾虑；顾虑可选引用 |
| RISK-03 | 全做 | 状态互不覆盖 |
| RISK-04 | 全做 | 总览：未关联、默认未关闭、筛选、已关闭、普通读取不调模型 |
| RISK-05 | 风险一侧全做 | 总览、Goal、侧栏打开同一条；通过公开动作更新后回读；简报一侧由第 19 批验（它以本批来源为前置） |
| RISK-06 | 风险一侧 | [人工] 风险详情、处置更新、返回总览；空数据、来源失败、未关联 Goal 的状态；「简报 → 风险 → 刷新简报」一段由第 19 批验 |
| RISK-07 | 全做 | 安排、到期读取、改期、暂停、取消、重启与重试不重复、停用撤权后无写入 |
| RISK-08 | 风险一侧全做 | 无变化安静、重要变化按通知规则只一次、失败与无变化可区分、不自动接受／关闭；「并入简报」由第 19 批取用复查结果 |

## 7. 用户决定

已定（2026-11-13 用户弹窗与补充）：

1. 复查到期由后台助理开一轮（插件只登记 Schedule 任务，不调 AI，解耦）。
2. 同意新增页面资源（风险插件的客户端脚本与样式），合入前按实测字节写许可。
