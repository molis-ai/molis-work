# 风险插件：实施方案、开工前检查与合同设计稿（第 17 批）

状态：设计稿第 2 版，公共合同台与 D 轨设计合审通过（2026-11-13，头 `0f622090ff`，见 §8）；实现中。行为与验收以[原需求](spec.md)为准，界面以[定样决定](spec.md#design-decisions)与原型 [`docs/design/risk-plugin`](../../docs/design/risk-plugin/README.md) 为准。

## 1. 这一片说什么（需求开发流程 §2.1）

- **做什么**：新的内置项目插件「风险」：风险记录（两栏整页 + 从别处点开先在右侧栏打开）、项目风险总览（按状态分组）、复查（详情里的复查段：按需安排，到期由后台助理看一轮、给建议，人采纳才改）；对外提供读取、搜索、呈现与概况，供 Goal、助理、首页和第 19 批的 Work Brief 引用。Goals 的顾虑可以引用风险（或任何对象）。
- **为什么现在**：前置 06、14、15、16 都已合入；第 19 批 Work Brief 的「风险接续」以本批的风险来源为前置。
- **不做**：Work Brief 本体与简报里的风险段（第 19 批，见 §6）；旧风险数据迁入（原需求「不做」）；团队成员目录（产品还没有，负责人先记名字）；风险进个人空间同步（§4.1 末，记 BL）。

## 2. 开工前检查（需求开发流程 §4，15 项）

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 风险（说明、影响、可能性、处置、负责人、状态、进展、关联）只归风险插件，存在它自己的项目库表里。Goal、顾虑归 Goals；Goals 只存「这条顾虑引用了哪个对象」（kind + id），不复制风险字段。复查任务（时间、暂停、历次结果、通知）归 Schedule，按对象找回，风险库不存复查状态。读别人的对象只经对象读取器或呈现取值。 |
| 2 | 插件同等待遇 | 经 Plugin Runtime 装配（`registration.project_runtime`），只用 SDK 与平台服务；不改 `project-plugins.ts`，不加宿主文件或构建期接线。「从别处点开先在侧栏」扩展工作台已有的 `sideOpenedPlugins` 推导，由侧栏视图的声明字段决定（§4.3），不写风险的分支。 |
| 3 | 能力注册 | 全部能力在风险 Manifest 声明一次（§4.1），页面路由只转调动作，助理、工作流、MCP 用同一套。可信身份取自调用上下文。风险插件不调模型、不声明 Agent（用户 2026-11-13 定：插件只登记任务，到点由后台助理开一轮，解耦）。转调 Schedule 的动作等别的插件，声明 `scheduling: "concurrent"`。 |
| 4 | 合同 | 现在处在 M1 之前，不留兼容期，都在原版本里改（阶段一）。四处：① 新插件的动作（快照新增）；② Goals 顾虑加可选 `cited_subjects`（Goals 动作 schema，库 2→3）；③ Manifest 侧栏视图加 `opens_items`（contracts `platform/plugin-manifest`、SDK 校验）；④ Schedule 对话任务加一次性与对象（§4.5，库 v+1）。另有 SDK `/ui` 新增 `renderSeverityGrid`（§4.4）。刷新 `actions:update`、`api:update`，PR 写对调用方的影响（都只多可选字段）。没有别的批在等，随本批 PR 走，公共合同台在最终头上合审。 |
| 5 | 放在哪个包 | `plugins/native/risk`（`@molis-ai/molis-work-plugin-risk`），只依赖 contracts 与 plugin-sdk。侧栏优先在工作台 `plugin-catalog.ts` 的推导与 `tab-workspace` 的 `openInSide`；矩阵小格在 SDK `/ui`，样式在 `packages/design-system/src/styles/primitives.ts`。没有新的平台服务。 |
| 6 | 表与存储 | 风险的三张表在 Manifest `databases.project`（store `risk`，第 1 版，`storage:private`），只由风险插件读写，不进共写名单；进 `tooling/gates/schemas/stores.tsv`。Goals 顾虑表加一列、Schedule 任务表加列：两个库各升一版，带升级段与旧版本金样（§4.2、§4.5）。 |
| 7 | 兼容与迁移 | 不加兼容读取。风险从空开始（原需求已定）。Goals、Schedule 的加列走升级链的正式升级段；同步便携格式升版本（§4.2、§4.5），不留旧格式读取。 |
| 8 | 安全边界 | 不碰回环、令牌、网关、MCP 授权等。风险插件转调 Schedule 用 `actions:delegate`：以原调用者身份、workflow 受众（S-43），调用者自己要有 `schedule:read`／`schedule:write`；不给 Schedule 加 `plugin` 受众，不开以安装身份调用的路。到点那一轮读什么只按人给这个任务的授权（第 18 批）；任务带的对象不带出任何读取权（`plugin-task-subjects` 的规则）。侧栏打开只把对象 id 交给同一插件已声明的侧栏视图。 |
| 9 | 调用次数 | 总览一次请求：`risk.list@1` 两条 SQL（风险一条、关联一条，带分页与筛选），不按条目逐个请求。详情一次请求（`risk.get@1`）；关联对象的名字由页面按 15 的呈现取值批量读，每个主人一次（上限 50）。复查段一次请求：`risk.review.get@1` 委托一次 Schedule `tasks.list`（按对象筛）。加关联时用对象读取器核对一次（读取器一次一个对象，只读新加的这一个）。页面不在后台轮询；改完一条只回读这一条。 |
| 10 | 升级与数据 | 新库第 1 版；以后改结构升版本带升级段。Goals 已有顾虑升级后 `cited_subjects` 为空，Schedule 已有任务升级后是每天任务、无对象，照常可用；两边的金样存每个旧版本。 |
| 11 | 成果与过程项 | 风险是插件自己的活对象，不是固定版本的成果，不进成果库；不声明 `artifacts.produces`。 |
| 12 | 页面、外壳与文字 | 插件只出舞台（总览与整页详情，`navigator` 视图）和一个侧栏视图（单条风险）；不出自己的整页、不开新标签。不新增 DOM 事件（用已登记的 `molis:side-open`、`molis-work:select-item`）。文字用 `risk.*` 稳定键，Manifest `ui.locales` 声明 `locales/zh.json`、`locales/en.json`；状态、影响等存英文枚举，不存译文；交给 Schedule 的任务说明只放人写的「要看什么」和对象引用，不放风险插件拼的句子。颜色、字体只用语义变量。新增页面资源（插件客户端）用户 2026-11-13 已同意，合入前按实测写许可。 |
| 13 | 错误 | `defineErrorCodes("risk", …)`：`invalid`、`not_found`、`conflict`、`closed`、`review_unavailable`；Schedule 新增的码用它自己的前缀。主人表 `tooling/gates/error-owners.json` 加 `plugins/native/risk/`。 |
| 14 | 冲突面 | 枢纽：`apps/workbench/src/builtin-plugins.ts` 与宿主生成登记（脚本生成）、根与两个应用的 `package.json`（生成器写）、`pnpm-lock.yaml`、`docs/SSOT-MATRIX.md`、`docs/system/PACKAGE-BOUNDARIES.md`、`.github/CODEOWNERS`、`tooling/gates/actions/`、`tooling/gates/api/`、`tooling/gates/schemas/stores.tsv`、`tests/fixtures/golden-homes/`。别的轨道的文件：Goals 包、Schedule 包、工作台 `plugin-catalog.ts` 与 `scripts/client/tab-workspace*.ts`、`plugin-frame/parent.ts`、`packages/design-system/src/styles/primitives.ts`、`specs/context-program`（§21.6 规则）。当前在途 PR（#2051、#2047、#2045 等）不碰这些。 |
| 15 | 全局最优 | 见 §3。 |

## 3. 全局最优（五个场景）

| 场景 | 看法 |
| --- | --- |
| 插件 | 风险是普通的项目插件，用同一套 Manifest、项目库、呈现，复查交 Schedule。三处通用能力谁都能用：侧栏视图 `opens_items`（Todo、Issue 一类想从别处点开先在侧栏的，加一个字段）、顾虑 `cited_subjects`（不只认风险）、Schedule 一次性对象任务（Goal 跟进、Todo 复看同样能用）。第三方插件同样能声明，没有内置专用的路。 |
| 平台 | 没有新的平台服务：Schedule、按任务授权、对象读取、呈现、搜索都是现成的。平台多两处小能力：侧栏优先打开（扩展已有推导）、组件板矩阵小格。 |
| 助理 | 动作向 `user`、`agent`、`workflow`、`mcp` 开放（写要授权），助理能列、读、记、改状态、关联、安排复查。方法 `risk-review`（Skill）说明什么时候该记风险、什么时候只引用不新建、复查一轮怎样判断（先核风险是否已关闭）、不自动改风险、安排复查后要提醒人去给任务开读取授权。到点那一轮是 Schedule 的助理一轮，按人给的任务授权读风险与关联对象；读不到就如实写缺口。没有界面时经 MCP 也能完成全部操作（授权仍由人在平台页给）。 |
| 各类平台能力 | 搜索（`risk.search.entries`）、对象读取（`risk.subject.read`）、公共呈现四形态与首页概况、按任务授权的读取分组（`read_groups`）、Schedule（一次性对象任务、通知、错过的运行）。不接成果库、端口、连接器；不重叠。 |
| 后续开发 | 第 19 批 Work Brief 按风险的呈现与 `risk.list`／`risk.subject.read` 取材，复查结果从 Schedule 按对象取，并从这里打开同一条风险；第 37、64 批的主动助理用同一组动作和同一种任务。再加一种状态或字段：改风险自己的 schema 与库版本，一处。 |

比较过的做法：

- **复查到期谁来判断**（用户 2026-11-13 定）：风险插件只登记任务，到点由后台助理（Schedule 的助理任务）开一轮，插件本身不调 AI。比较过「插件调一次模型」（省，但插件和 AI 耦合）与「插件声明自己的 Agent 角色」（第二套任务状态）。结果留在 Schedule 的任务记录里，风险详情读出来；后台一轮只读，改风险由人点「采纳」后经风险动作完成。
- **侧栏优先打开**：扩展 `sideOpenedPlugins`（合审第 1 条）。另一种是在 Goals 里写打开风险侧栏的事件——等于一个插件点名另一个插件，不取。
- **负责人**：产品没有项目成员目录，先记一个名字（可空），筛选按已用过的名字；有了成员目录再换成成员引用（升库版本）。
- **关联放在哪**：关联对象是风险的事实，存在风险库；Goals 那边只有「顾虑引用对象」。「关联 Goal」筛选查风险库自己的关联表。Context Ledger 只看得到各自写的边（S-68），顾虑的引用也应和顾虑存在一起，不用 Ledger。

## 4. 合同设计稿

### 4.1 风险插件（新包，`plugin_id: io.molis.work.risk`，`project_plugin_id: risk`，对象种类 `risk`）

取值（存英文，界面经词表翻译）：

- `status`: `open` | `mitigating` | `accepted` | `closed`（打开、缓解中、已接受、已关闭）。状态环：open → `answer`（要处理），mitigating → `running`，accepted → `paused`（搁置），closed → `done`，以 15 的状态环取值为准；有等人采纳的复查建议时呈现带 `needs_decision`。
- `impact`、`likelihood`: `high` | `medium` | `low`。
- 关联对象：`{ kind, id }`（`ActionSubject`），一条风险最多 20 个；任何有读取器的种类（Goal、Coding 会话、Feed 消息、成果…）。

库（`databases.project`，store `risk`，第 1 版；复查不在这里，见 §4.5）：

| 表 | 列（要点） |
| --- | --- |
| `risk_items` | `risk_id` PK、`project_id`→`project_root`、`title`、`statement`、`impact`、`likelihood`、`treatment`、`owner_name`（可空）、`status`、`revision`（整数，每次写 +1）、`created_by`、`created_at`、`updated_at`、`closed_at` |
| `risk_links` | `risk_id`、`subject_kind`、`subject_id`、`added_by`、`added_at`；PK (risk_id, subject_kind, subject_id)；索引 (subject_kind, subject_id) |
| `risk_events` | 进展时间线：`event_id`、`risk_id`、`kind`（`created`、`updated`、`status`、`note`、`linked`、`unlinked`）、`detail_json`（只存枚举、字段名与原话，不存译文）、`actor_id`、`at` |

动作（权限 `risk:read`／`risk:write`；受众 `user`、`agent`、`workflow`、`mcp`、`plugin`）：

| 动作 | 种类 | 输入 → 输出 |
| --- | --- | --- |
| `risk.list@1` | query | `{ status?: "open"\|"closed"\|"all"（默认 open）, impact?, owner_name?, goal_id?, unlinked?, limit?（默认 100，最多 200）, cursor? }` → `{ risks: RiskRow[], owners: string[], next_cursor }`；`RiskRow` = 风险字段 + `links` |
| `risk.get@1` | query | `{ risk_id }` → `{ risk, links, events }` |
| `risk.subject.read@1` | query | 标准对象读取器（`defineSubjectContextAction`），`open: { surface: "risk", id }` |
| `risk.search.entries@1` | query | 标准搜索来源，未关闭与已关闭都列，摘要 |
| `risk.presentation.values@1`、`risk.presentation.overview@1` | query | 15 的呈现取值与概况；概况给未关闭风险数与最该看的几条 |
| `risk.create@1` | command | `{ title, statement, impact, likelihood, treatment?, owner_name?, links? }` → `{ risk }`；`result_subject` 指向新风险 |
| `risk.update@1` | command | `{ risk_id, expected_revision, title?, statement?, impact?, likelihood?, treatment?, owner_name? }` → `{ risk }`；版本不对报 `risk.conflict` 附当前内容（页面两边对照，不覆盖）；已关闭报 `risk.closed` |
| `risk.status.set@1` | command，`concurrent` | `{ risk_id, expected_revision, status, note? }` → `{ risk, review_left? }`；关闭提交后归档这条风险的复查任务（委托 Schedule）；归档没成功时返回 `review_left`，页面提示并可重试（`risk.review.cancel@1`）；重新打开不自动恢复复查 |
| `risk.links.add@1`／`risk.links.remove@1` | command，`concurrent` | `{ risk_id, subject }` → `{ links }`（加之前用读取器核一次这个对象在、读得到） |
| `risk.notes.add@1` | command | `{ risk_id, text }` → `{ event }` |
| `risk.review.get@1` | query，`concurrent` | `{ risk_id }` → `{ state: "ok"\|"unavailable", tasks }`：委托 Schedule `tasks.list`（按对象 `{ kind: "risk", id }` 筛）：时间、暂停、历次结果、这个任务的读取授权状态；风险已关闭而任务还在时标出来 |
| `risk.review.schedule@1` | command，`concurrent` | `{ risk_id, at, focus, task_id? }` → `{ task }`：新建（或按 `task_id` 改期）Schedule 的一次性对象任务：标题是风险标题、说明是人写的 `focus`、对象是这条风险；已关闭的风险拒绝 |
| `risk.review.enabled@1`、`risk.review.cancel@1` | command，`concurrent` | `{ risk_id, task_id, enabled }`／`{ risk_id, task_id }`：先核这个任务的对象就是这条风险，再委托 Schedule 暂停／恢复、归档 |

Manifest：`permissions` 含 `actions:delegate`（转调 Schedule、读取器核对象），`capabilities.consumes` 写 Schedule 的 `tasks.list`、`tasks.create`、`tasks.update`、`tasks.enabled`、`tasks.archive`；`read_groups`：`{ group_id: "risk", actions: [risk.list, risk.get, risk.subject.read, risk.search.entries] }`，复查任务（与别的定时任务）经人勾选才读得到风险。

方法 `risk-review`（Skill）：见 §3「助理」。风险插件不登记指令、不声明 Agent。

同步：本批不进个人空间同步（风险是新对象，同步集合与便携格式要单独设计与验收）；记 BL「风险进同步」，主人风险插件。

### 4.2 Goals：顾虑引用对象

- 顾虑（`concern`）加 `cited_subjects: ActionSubject[]`（默认空，最多 8 个）；`concern_opened` 可带它。Goals 只存 kind + id；页面按 15 的名字片画（读不到时照 IUI-02 只画图标、名字与「打开」），点开走工作台打开对象，于是风险按 §4.3 先在侧栏开。
- 原合同的证据与授权规则不变：引用不让顾虑自动打开、接受或解除；风险状态变化不碰顾虑（RISK-02、RISK-03）。Goals 里只读不写的死路径 `blocking_risks`（`module/event-state-completion.ts`、`event-facts.ts` 恒为 `[]`）随本批删掉，确保风险不会接进 Goal 的收尾判断。
- Goals 项目库 2→3：`goal_event_concerns` 加 `cited_subjects_json TEXT NOT NULL DEFAULT '[]'`，升级段只这一句；同步列清单（`module/replication.ts`）一起改，同步格式版本照 2026-11-11 v2 加列的先例不升；`stores.tsv` 刷新；金样存 v1、v2。

### 4.3 Manifest：侧栏视图 `opens_items`（扩展 `sideOpenedPlugins`）

- 现行规则（context-program §21.6）：有主区的插件即使也有侧栏视图，仍在主区打开；只有侧栏的插件在侧栏打开。本批加一条：`slot: "side"` 的视图写 `opens_items: true`（一个插件至多一个）时，**带具体对象**的打开（`openItem`、`?openPlugin&openItem` 链接）先在这个侧栏视图里打开；`openBeside` 是人明确选的分栏打开，照旧分栏，target 照现有的 `{ item, title }`；不带对象的打开（进插件）仍去主区。
- 同一插件自己的帧（舞台或侧栏，`plugin-frame/parent.ts` 拿得到发起方 `pack.id`）发来的打开不改道：所以侧栏视图里的「展开成整页」就是同一插件发 `openItem`，直接进主区，不会被改回侧栏。`parent.ts` 调宿主时把发起方插件 id 作为工作台内部参数传给 `tab-workspace` 的 `openItem`（不改 SDK `UiHost` 合同）；动这个文件前先核 daily-quality D0124／D0335（G9）的统一校验器是否在途。
- 推导写在 `sideOpenedPlugins` 旁（`sideOpenedItemPlugins`），工作台 `openInSide` 读它；`home-plugin-http.ts` 用同一推导。SDK Manifest 检查：`side` 以外的槽写了就拒绝，多于一个就拒绝。同步改 context-program §21.6 的规则原文。

### 4.4 组件板新增（D 轨补标本）

- `renderSeverityGrid({ row, column, tone, size?: "small" | "large", label, rowLabel?, columnLabel? })`（SDK `/ui`）：3 × 3 小格；亮的一格按调用方给的 `MwTone`（`danger`／`warning`／`neutral`）上色，同时有描边与填充形状，不只靠颜色；读屏文字与两个轴标题由调用方传（SDK 不认识「风险」）。样式进 `packages/design-system/src/styles/primitives.ts`，类名 `mw-severity-grid`。
- 标本：9 种组合 × 大小两号；中英文、深浅色、强制颜色；390 宽总览行里的样子；读屏文字示例。标本合入本批分支、D 轨合审过，才写风险界面里用它的部分。
- 提示里的按钮：`renderAlert` 已有 `actions`，不新增。长链接按钮折行交 D 轨定，本批不加。

### 4.5 Schedule：一次性的对象任务

- 用词沿用提醒与定时操作的：`schedule.tasks.create@1`／`tasks.update@1` 加 `repeat: "daily" | "none"`（默认 daily）与 `at`（`repeat: "none"` 时必填，date-time）；加可选 `subject: { kind, id }`（这个任务关心的对象）。`tasks.list@1` 加可选输入 `subject` 按对象筛，输出每个任务带 `repeat`、`at`、`subject` 与 `reads`（`ScheduleTaskReads` 的计数：开了几类、已授权、待确认、不可用、已移除）；Schedule 每次请求读一次平台的授权列表，风险一侧不另调。不加 `plugin` 受众。
- 库升一版：任务表加 `repeat`（默认 `daily`）、`run_at`、`subject_kind`、`subject_id`；一次性任务的 `hour`、`minute` 取 `at` 的本地时分（两列仍 NOT NULL，列表显示用），排期只看 `run_at`。升级段只加列；金样存每个旧版本。
- 同步便携格式 `format.schedule.portable` 逐列校验任务列，加列即升格式版本（`tooling/versions.json`；阶段一不留旧版本读取），回放金样一起刷新。
- 一次性任务跑完一次就停（不再排期，`enabled` 置否，记录与结果保留）；错过的一次性运行按 `missed-runs.ts` 现行规则记给人看、不补跑，任务随之结束。
- 带对象的任务，到点那一轮的说明里点名这个对象（kind + id）；读取仍只按人给这个任务（授权对象 `schedule_task`，键 task_id）的授权，没开授权就按 reader 角色跑、读不到风险，结果如实写「没有读取授权」。风险详情的复查段显示授权状态，并给入口去平台授权页（`task-grants-page`）；助理安排复查后也要说明这一步得人来做（RISK-07 的「到期读取」含这个状态）。
- 动作 schema 原版本内改，刷新快照，PR 写对调用方的影响：只多可选字段与输出字段。

## 5. 拆片（批内子分支，按依赖叠）

1. `b17/contracts`：§4.2 Goals 顾虑引用（含升级、同步、删 `blocking_risks`）、§4.3 Manifest 字段与工作台推导、§4.4 SDK 矩阵小格与标本；快照刷新。
2. `b17/risk-core`：插件包、库、动作（除复查）、搜索、读取器、呈现、方法、登记与清单。
3. `b17/review`：§4.5 Schedule 一次性对象任务，与风险的复查动作（安排、改期、暂停、取消、读结果）。
4. `b17/risk-ui`：舞台（总览、整页详情、复查段与授权入口）、侧栏视图、Goals 顾虑里的引用与选择。
5. 收尾：同步 main、统一构建与测试、文档与批次记录。

## 6. 验收归属

| 编号 | 本批 | 说明 |
| --- | --- | --- |
| RISK-01 | 全做 | 一份风险事实，多个 Goal 引用；Goals 只存引用 |
| RISK-02 | 全做 | 记录与关联不自动开顾虑；顾虑可选引用 |
| RISK-03 | 全做 | 状态互不覆盖；`blocking_risks` 删除，风险不进收尾判断 |
| RISK-04 | 全做 | 总览：未关联、默认未关闭、筛选、已关闭、普通读取不调模型 |
| RISK-05 | 风险一侧全做 | 总览、Goal、侧栏打开同一条；公开动作更新后回读；简报一侧由第 19 批验（它以本批来源为前置） |
| RISK-06 | 风险一侧 | [人工] 风险详情、处置更新、返回总览；空数据、来源失败、未关联 Goal 的状态；「简报 → 风险 → 刷新简报」由第 19 批验 |
| RISK-07 | 全做 | 安排、到期按授权读取（含未授权状态）、改期、暂停、取消、重启与重试不重复、停用撤权后无写入 |
| RISK-08 | 风险一侧全做 | 无变化安静、重要变化按 Schedule 通知只一次、失败与无变化可区分、不自动接受／关闭；「并入简报」由第 19 批从 Schedule 按对象取用 |

## 7. 用户决定

1. 复查到期由后台助理开一轮（插件只登记 Schedule 任务，不调 AI，解耦）（2026-11-13）。
2. 同意新增页面资源（风险插件的客户端脚本与样式），合入前按实测字节写许可（2026-11-13）。

## 8. 合审记录

- 2026-11-13 第 1 版（`f9c1aaa077`）公共合同台／D 轨合审：退回。挡开工三项——侧栏优先要接现有 `sideOpenedPlugins`；Schedule 扩展不加 `plugin` 受众、沿用 `at`／`repeat`、写清库与同步格式与错过的运行、按任务授权的状态与入口；改版前的旧文字。建议六项：任务说明不拷正文；关闭与归档非原子的标记与重试；Goals 同步列与删 `blocking_risks`；取数口径与分页、状态环取值；同步要写明；矩阵小格用 `MwTone`、样式进 primitives、标签由调用方给、不只靠颜色、标本清单。第 2 版全部采纳。
- 2026-11-13 第 2 版（`0f622090ff`）复审：通过。四条建议已补进第 2 版：`tasks.list` 输出 `reads`；`openBeside` 照旧分栏；发起方插件 id 作内部参数传下去；Goals 同步格式按先例不升。D 轨：标本先合进本批分支并过合审，再写用它的界面。
