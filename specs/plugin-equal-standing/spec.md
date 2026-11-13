# 插件同等地位收口：Goals 减负与去特权（Plugin Equal Standing）

状态：需求已整理，用户 2026-11-13 已就第 6 节 D1～D8 拍板（只剩 CLI 怎么改一项待确认）；待排进路线书，尚未实现（2026-11-13）。本文盘点取自 main `6f6ac8d060`，行号以该提交为准。

需求维护：Claude（本会话）；实现：待分配。类型：底层与架构（主）、横向能力、产品线（Goals、Feed、Coding、Inbox、Todo、Pages、灵光、Images）。决策标记：**直接做**（D1～D8 已定，见第 6 节）；**要决策：CLI 怎么改**（第 6 节 D6b）。

## 白话说明

**这件事做什么。** 让 Goals 回到和 Todo、Pages 一样的普通插件；顺带把其他插件在平台里被点名、被特殊照顾的地方一起清掉。只有之前明确定为平台部件的几样（第 3 节）保留特殊地位。

**解决什么问题。** 2026-10-18 已经定过「插件不分官方还是个人，待遇一样」和「Goals 是普通插件」，但一个月后 Goals 反而更重了：宿主、工作台、合同、设计系统、MCP、CLI、桌面壳里有 2197 处提到 goal（218 个文件）；Goals 自己约 3 万行、80 个动作，都是全仓第一。原因主要是 Goals 收进了很多本不属于 Goal 的平台级事实（项目指导、可信用户决定、规划方法、验收依据），平台合同也把 Goal 当成了一等概念。后果是：拔不掉 Goals；第三方插件做不出 Goals 能做的事；后面每批需求顺手往 Goals 里加，越滚越大。其他插件（Feed、Coding、Inbox、Todo、Pages 等）也有一些同类的私路。

**做完能看到什么。** 用户：新项目不再默认带 Goals，要用时和别的插件一样添加、也能移除；没有 Goals 的项目里，项目指导、决定记录、Agent 运行、MCP 连接照常工作。桌面胶囊整个删掉，以后重做。开发者：平台代码与合同里不再出现某个插件的名字或业务词；任何插件（含第三方）都能用同一套声明拿到今天只有 Goals、Feed 等才有的位置。

**为什么排在这里。** 第三方插件安装、统一状态词表（[状态机平台能力](../state-machine-platform/spec.md)）、智能呈现与主线这些在排的批次，都会把今天的「Goals 特例」固化进新合同；合同还没对外开放（[合同变更流程](../../docs/system/CONTRACT-CHANGES.md)：首个外部安装之前不留兼容期），现在改代价最小。

**需要你做什么。** D1～D8 已在 2026-11-13 定下；还剩 CLI 怎么改一项（D6b）。之后路线书排期由统筹定。

## 1. 现状

### 1.1 数字

| 项 | 数 | 对照 |
| --- | --- | --- |
| Goals 源码 | 约 30,200 行（`plugins/native/goals/src`） | Coding 22,100、Pages 17,000、Feed 11,800 |
| Goals 动作 | 80 个（`tooling/gates/actions/actions.tsv`） | Alchemist 61、Jelly 53、Feed 53 |
| 平台代码里提到 goal | 2197 处 / 218 个文件（宿主、工作台、合同、kernel、设计系统、horizontal、MCP、CLI、桌面壳） | Feed 约 860 处（多是样式），其余插件都在 250 以内 |
| 宿主直接 import Goals 包 | 8 个文件 | Inbox 3、Pages 1、Shelf 1（演示数据），其余插件 0（生成的登记表不算） |
| 宿主直接调 Goals 动作 | 13 个文件、27 个不同动作 | 其余插件只有个别 |

### 1.2 已经做掉的（不再列）

10-18 起防腐线已改掉：Goals 迁到 Runtime 装配（`registration.ts` 的 `project_runtime` + `runtime`）；Goals 不再只信内置调用者（PG-006）；项目库身份不再是 Goals 的看板（PG-021，`managed-project-database.ts:8`）；页面请求前不再对账 Goals 决定（PG-033）；工作台手写舞台已由声明替代（PG-060）。防腐线已归档（[repository-anti-corruption](../archive/repository-anti-corruption/spec.md)），剩下的项没有人接，本需求接手。

## 2. 目标与判断标准

### 2.1 判断标准（逐条可测，见第 10 节）

1. **拔掉测试。** 一个项目移除 Goals（或任一普通插件）后：项目能打开、Agent 与助理能运行、MCP 能连接、设置页能打开、项目简介与胶囊能显示；只少了这个插件自己的内容。
2. **平台不认识插件。** 宿主、工作台外壳、合同、kernel、设计系统、horizontal、MCP、CLI、桌面壳里，不 import 任何插件包（生成的登记表、第 3 节的保留项除外），不写任何插件的 id、业务词（goal、feed、inbox…）或它的动作 id。
3. **同一条路。** 今天某插件独有的位置（常开、双实例、受保护的决定入口、胶囊、CLI 命令、情境焦点、放置关联、设置节、首屏默认面），要么删掉，要么做成任何插件都能声明的平台能力，第三方按安装信任同样可用。
4. **Goals 只管 Goal。** Goals 的事实收窄到：Goal、Goal 之间的关系、Goal 的工作状态与历史、对 Goal 的要求及其认可。其他事实各归其主（第 5.1 节）。

### 2.2 不做

- 不重写 Goals 的产品功能（Goal 树、画布、看板、事件文档照旧），只搬走不属于它的东西、去掉平台对它的点名。
- 不动第 3 节保留的平台部件。
- 不改真实 Home 的数据；涉及存量的按[合同变更流程](../../docs/system/CONTRACT-CHANGES.md)与升级链走，动真实 Home 先弹窗问。
- 不一次删光所有测试里的 goal 字样；测试随实现改。

## 3. 保留特殊地位的平台部件（白名单）

只有下面这些是用户此前明确定过的，保留；名单之外的任何插件都按普通插件处理。

| 部件 | 保留什么 | 出处 |
| --- | --- | --- |
| Shelf | 常开（`always_on`）、右栏第一格 | `docs/system/GLOSSARY.md`「常开插件」；S-34 |
| 成果库（Artifacts） | 平台事实，不算插件 | 防腐 spec §1 2026-10-18「四个构建期例外」 |
| Sessions | 平台事实（已清理，BL-177 重做） | 同上 |
| 插件创作台 | 平台能力；构建期接线例外，防腐收尾后删除重做 | 同上，2026-10-21 改；`AGENTS.md`、BL-377 |
| Alchemist | 构建期接线例外，删除重做 | `AGENTS.md`（2026-10-21）、BL-377 |
| Characters | Module（`modules/characters`） | 防腐 spec §1 2026-10-18 |

注意：成果库仍以插件身份登记（PG-077），这是它自己「回平台」的余项，不在本需求范围。名单是否完整由 D8 确认。

## 4. 盘点

### 4.1 Goals 收进的非 Goal 事实（最主要的原因）

| # | 事实 | 现在在哪 | 谁依赖它 |
| --- | --- | --- | --- |
| G1 | **项目指导**：每次 Agent Run、助理回合的项目层提示词 | Goals 的 guidance 动作；宿主 `goal-callers.ts` 的 `readProjectGuidance` 经 `goals.guidance.read` 读 | `agent-host-composition.ts:388`、`assistant/assistant-authority.ts:167`、`mcp-context-tools.ts:15`；项目没有 Goals 就没有项目指导 |
| G2 | **可信用户决定、项目审批规则、策略绑定**（原 Governance Module，S9-3 并入） | `plugins/native/goals/src/governance/`、`contract/governance-collaboration.ts` | MCP 只为 Goals 开受保护的管理入口 `initialize`、`event_decide`、`goal_tree_decide`（`apps/mcp/src/tool-dispatch.ts:5`、`goal-tools.ts`）；设置页 rules 节；页面视图的 `policy_bindings`（`apps/workbench/src/page-view.ts:53`） |
| G3 | **规划方法库**：37 个方法、个人副本、项目>个人>内置的取用顺序 | `plugins/native/goals/methods/`；Goals 的 Home 半实例 `home-plugin.ts`（`dual_instance`） | 设置页 planning 节、规划页（`web-planning.ts`）；待决 `BL-goals-methods-as-skills` |
| G4 | **逐项依据与验收**：要求的认可、完成批准、证据档位 | Goals（第 24-3 批、[决定 25、35](../post-anticorruption-roadmap/reference/decisions.md)） | 第 65-3 批「Goals 依据三档与同一验收卡」、第 27-4 批 Goals 余项还要继续加 |

### 4.2 平台合同把 Goal 当一等概念

| # | 位置 | 现状 |
| --- | --- | --- |
| C1 | `packages/contracts/src/services/placement.ts:34`；`horizontal/placement/src/index.ts:48,118-122` | 放置关联类型写死 `goal`（`placement.goal_in`），放置服务按 `goal` 路径解析并以 Goals 的文案报错 |
| C2 | `packages/contracts/src/platform/action-subjects.ts:14,69` | 每个动作的主体上下文带 `goal_ids` |
| C3 | `packages/contracts/src/services/memory.ts:53,215,600` | 记忆适用范围有 `goal_ids`、`situation.goal_id` |
| C4 | `packages/kernel/src/contextual.ts:52,214` | 情境提示写死【当前目标】，选项可声明 `requires: goal` |
| C5 | `packages/contracts/src/platform/dom-events.ts:118,242-254` | 外壳持有 `goal-selection` 状态，监听 `goal-changed`、`goal-document-loaded`、`goal-panel-presence` |
| C6 | `packages/contracts/src/modules/context-ledger.ts:25` | 账本的 `module` 枚举写死 `"goals"`、`"feed"` |
| C7 | `apps/mcp/src/resume-view.ts` | MCP 项目连接工具里内置「Goals 接续摘要」 |

### 4.3 宿主、工作台、端点按名字给 Goals 开的私路

| # | 位置 | 现状 |
| --- | --- | --- |
| H1 | `apps/local-host/src/web-goals-read.ts`、`web-view.ts`、`web-request.ts:30,189-311`、`web-planning.ts`、`capsule.ts`、`goal-callers.ts` | 直接 import Goals 包；页面视图类型叫 `GoalsWebView`，含 `BoardSnapshot`；Goal 页、片段、设置、规划、胶囊各有专用路由 |
| H2 | `project-arrival-http.ts:119`、`web-onboarding.ts:99`、`local-plugin-development.ts:60`、`continuity-admin.ts:17`、`demo-seed.ts` | 宿主替 Goals 取数或写数（`BL-project-arrival-goals-direct-read`） |
| H3 | `apps/workbench/src/project-settings-pages.ts:47-98` | 设置页 guidance、rules、planning 三节归 Goals，按 `project_plugin_id === "goals"` 找主人 |
| H4 | `apps/workbench/src/scripts/client/bootstrap.ts:69`、`initialization.ts`、`editing-graph.ts`、`refresh-decisions.ts`、`navigation-surfaces.ts:19-41`、`shell-page-renderer.ts:158` | 外壳启动脚本默认面是 `"goals"`，有 `goalData` 分支，内联 Goals 的页面客户端 |
| H5 | `apps/workbench/src/styles/goal-canvas.ts`、`packages/design-system/src/styles/momentum.ts` | Goals 的画布与动量样式放在工作台和设计系统里 |
| H6 | `apps/cli/src/command-dispatch.ts:4-37` | CLI 写死 7 个 Goals 动作 |
| H7 | `apps/desktop/src/capsule-shell.ts`、`apps/local-host/src/capsule.ts:2-19` | 桌面胶囊就是 Goals 的快照 |
| H8 | `plugins/native/goals/src/manifest.ts:79` | `always_on: true`，工作台里不能移除 |
| H9 | `apps/workbench/src/page-plugin-visibility.ts:5` | 无项目选择时默认显示 `["goals", "inbox", "feed"]` |

### 4.4 叙事与命名

| # | 位置 | 现状 |
| --- | --- | --- |
| N1 | `PRODUCT.md`「Goals Plugin」一章、`AGENTS.md` 首段、`docs/SSOT-MATRIX.md:179` | 把 Goals 写成「每个项目都带、不能移除」，Goal 树与拆解规则写成产品承诺 |
| N2 | `skills/goal-advance/` | 平台唯一的统一 Skill 以 Goals 命名，正文以建 Goal、记工作为主线 |
| N3 | 路线书批次 24-3、27-4、65-3 | 持续把新能力挂在 Goals 上（「不另建任务中心或验收事实库」） |

### 4.5 其他插件的同类情况

| 插件 | 位置 | 现状 |
| --- | --- | --- |
| Feed | `apps/workbench/src/tab-workspace-ops.ts:11`、`scripts/client/navigation-surfaces.ts:80-153`、`immersive-navigation.ts:32-36`、`tab-workspace-plugins.ts:145`、`documents-state.ts:145`、`search-rows.ts:14`、`settings-connectors.ts:66` | 外壳导航写死 `sources`→`feed` 的别名和 Feed 专用分支；搜索、连接器设置点名 Feed |
| Feed | `packages/design-system/src/styles/source-feed.ts`、`directory-ledger.ts:396-397`、`apps/workbench/src/styles/immersive-directory.ts` | Feed 的样式放在平台（违反 2026-10-25 PG-070「插件样式随插件包」） |
| Feed、Goals、Shelf | 各自 `registration.ts` 的 `dual_instance: true` | 双实例今天只许宿主装配的插件用（2026-10-20 U2 选 A「先只给宿主装配的」），第三方没有 |
| Coding | `horizontal/memory/src/classification.ts:8`、`service.ts:322`、`apps/local-host/src/memory/memory-sources.ts:13` | 记忆按 `plugin_id === "io.molis.work.coding"` 推断场景 |
| Coding | `packages/contracts/src/services/skills.ts:117,297`；`horizontal/agent-host/src/index.ts:346,353` | 技能使用记录的调用方枚举写死 `"coding"` |
| Coding | `apps/workbench/src/artifacts/handoff-client.ts:8-22` | 成果「交给」按钮写死 Coding 为执行方 |
| Inbox | `apps/local-host/src/web-request.ts:42`、`native-content-permissions.ts:1`、`apps/workbench/src/page-view.ts:18` | 宿主 import Inbox 包；页面视图带 `inbox_judgment` |
| Inbox | `packages/contracts/src/modules/attention-resumption.ts:139` | Inbox 的错误码定义在合同包里 |
| Todo、Pages | `apps/local-host/src/context-onboarding-service.ts:356-395` | 项目上手服务写死 Todo、Pages 的 id，直接调 `todo.organize.extract` |
| Todo | `apps/local-host/src/personal-plugin-sync.ts:36` | 个人同步写死 `todo` 键 |
| Pages、灵光 | `apps/local-host/src/web-assets.ts:156-187`、`native-content-permissions.ts:4-13` | 宿主写死 Pages 编辑器资源路由；内容权限点名 Pages、灵光 |
| Images、灵光 | `apps/local-host/src/home-stores.ts:80-82`、`material-home.ts:20` | Home 库快照策略按库名分支；材料模型目录建在 `lingguang/models` |

待核（像是平台能力但名字取自插件，实施时逐条判断，不预设结论）：`packages/contracts/src/modules/workspace-artifacts.ts:676-677` 的 `io.molis.work.git.*` 事件名；`apps/workbench/src/assistant-board-*.ts` 的样例数据。

## 5. 方案

### 5.1 事实各归其主（对应 G1～G4，用户 2026-11-13 按 D2～D5 定）

| 事实 | 去处（已定） | 理由 |
| --- | --- | --- |
| 项目指导 | 平台的项目服务（`modules/projects` 或 horizontal 新包），设置页「项目指导」由平台画 | 每个 Run 都要，与 Goal 无关；不能因为移除一个插件就没了 |
| 可信用户决定、审批规则 | 平台的决定服务：任何插件声明「这个动作要可信用户决定」，平台给受保护的决定入口（含 MCP），记录归平台 | 授权与可信来源本是平台的事（PG-029）；今天只有 Goals 能用 |
| 规划方法 | 变成技能，进能力包（`BL-goals-methods-as-skills`）；Goals 只消费 | 方法是给 Agent 的长内容，正属技能；Goals 随之不再需要 Home 半实例 |
| 要求的认可与完成批准 | 留在 Goals，作为 Goal 自己的事实；证据核验（`agent.evidence.check@1`、命令回执、成果版本）本就在平台 | 认可「某 Goal 的某条要求」是 Goal 的事；但别的插件与平台不依赖它 |

### 5.2 合同去插件化（C1～C7）

- 放置关联（C1）：关联类型由主人插件在 Manifest 声明（`placement_relation` 已有雏形），平台只认声明，不写死 `goal`。
- 主体上下文与记忆（C2、C3）：`goal_ids` 换成通用的关联对象引用（插件、类型、id），Goal 只是其中一种。
- 情境（C4）：情境焦点由当前插件声明「焦点对象」及其显示名，kernel 不写【当前目标】。
- DOM 事件（C5）：外壳只听通用的「记录选中」「记录文档已载入」事件（已有 `recordRow` 声明可扩展）；`goal-*` 事件如仍需要，只在 Goals 内部用。
- 账本 `module` 枚举（C6）：改为插件 id 或声明的来源。
- MCP 接续摘要（C7）：改成任何插件可声明的「接续摘要」贡献，项目连接工具汇总已装插件的贡献。

### 5.3 宿主与工作台去私路（H1～H9）

- Goal 页、片段、设置、规划、胶囊：走 Runtime 的页面与路由声明（同其他插件），宿主删 `web-goals-read.ts`、`web-planning.ts` 和 `GoalsWebView` 里的 Goals 字段。
- 宿主替 Goals 取数写数（H2）：项目简介、上手、演示数据各自改走公开动作目录（不钉死提供方）或声明式贡献。
- 设置节（H3）：插件声明自己的设置节，外壳按声明排；Goals 只留属于 Goal 的设置。
- 外壳启动（H4）：默认面取用户上次所在或首个已装插件，不写 `"goals"`；Goals 客户端只经 `pageClients` 装载。
- 样式（H5）：随 Goals 包下发（按 PG-070 的按需 css）。
- CLI（H6）：去掉写死的 Goals 动作；改成什么待 D6b（推荐：按动作目录调用任意已授权动作的通用命令）。
- 胶囊（H7，D6 已定）：整个删掉——桌面壳的胶囊窗口（`apps/desktop/src/capsule-shell.ts` 及 Tauri 一侧的接线）、宿主的胶囊路由与 `capsule.ts`、Goals 的 `createGoalsCapsuleProjection` 与 `capsule-menu.ts`；删的同一个改动里登记一条重做待办，不留兼容。
- 常开与默认安装（H8，D1 已定）：Goals 删 `always_on`，新项目也不默认装；常开只剩 Shelf。建项目、项目到达页、空项目引导里凡是假定「项目里一定有 Goals」的地方一并改。
- 默认显示名单（H9）：去掉，按登记表或首个已装插件。

### 5.4 其他插件（4.5 节）

同一原则：外壳的导航别名与分支改由插件声明；样式随插件包；双实例开放给所有插件（第三方按安装信任与沙箱）；记忆场景、技能调用方用通用分类（由调用上下文给，不从插件 id 推）；「交给」的执行方从声明了「可接收」的插件里列；Inbox 的错误码回 Inbox 包；上手服务改为「插件声明可承接上手材料」，平台按声明调，不写死 Todo、Pages；Home 库快照策略与材料目录由声明给出。

### 5.5 叙事与命名（N1～N3）

- `PRODUCT.md` 的 Goals 一章降为插件说明，产品定义只讲插件基座；`AGENTS.md`、`SSOT-MATRIX.md`、`GLOSSARY.md` 去掉「每个项目都带、不能移除」（D1）。
- 统一 Skill（D7 已定）：删掉 `skills/goal-advance/` 及其分发逻辑（安装时拷进外部 Runtime 的步骤、安装类测试里的比对、文档里的接入说明），不改名、不留替代 Skill；外部 Runtime 经 MCP 连接后，靠动作工具自己的描述发现能力。删之前核清谁在用（`docs/installation.md`、`docs/runtime.md`、`docs/cli-and-development.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`scripts/check-package-boundaries.mjs` 等），一并改。
- 路线书里往 Goals 加东西的批次项（24-3 余项、27-4 Goals 部分、65-3）先按本需求复核方向（D4）。

## 6. 要用户拍板

| # | 事项 | 方案（推荐在前） | 卡住哪一步 |
| --- | --- | --- | --- |
| D1 | Goals 还常开吗 | A 新项目默认装上、和别的插件一样能移除（推荐）；B 保持常开；C 新项目不默认装 | H8、N1、PEQ-01 |
| D2 | 项目指导归谁 | A 平台项目服务（推荐）；B 单独一个插件；C 留在 Goals | G1、片 2 |
| D3 | 可信用户决定、审批规则归谁 | A 平台决定服务，所有插件可声明（推荐）；B 留在 Goals，只把 MCP 入口做成通用 | G2、片 3 |
| D4 | 要求认可与验收依据 | A 留在 Goals 作为 Goal 的事实，平台和别的插件不依赖（推荐）；B 抽成平台通用的「要求—证据—认可」能力；C 先暂停 65-3 等再定 | G4、路线书 65-3 |
| D5 | 规划方法 | A 变成技能进能力包，Goals 去掉 Home 半实例（推荐）；B 留在 Goals | G3、`BL-goals-methods-as-skills` |
| D6 | 胶囊与 CLI | A 都做成插件可声明的贡献/通用命令（推荐）；B 胶囊只显示平台内容、CLI 只留通用命令 | H6、H7 |
| D7 | 统一 Skill `goal-advance` 改名 | A 改成中性名（如 `molis-work`），不留旧名（推荐）；B 保留名字只改正文 | N2；外部 Runtime 已装的 Skill 要重装 |
| D8 | 第 3 节白名单是否完整 | A 就这些（推荐）；B 另有要保留的 | 第 3 节 |

**拍板结果（2026-11-13，弹窗）：**

| # | 用户选择 |
| --- | --- |
| D1 | C：新项目不默认装 Goals（同时去掉常开） |
| D2 | A：项目指导归平台项目服务 |
| D3 | A：可信用户决定、审批规则归平台决定服务 |
| D4 | A：要求认可与验收依据留在 Goals，平台和别的插件不依赖 |
| D5 | A：规划方法变成技能进能力包，Goals 去掉 Home 半实例 |
| D6 | 用户另给：桌面胶囊（工具栏里的内容）全部删掉，以后重做 |
| D6b | **待确认**：CLI 写死的 7 个 Goals 动作改成什么（推荐：通用的按动作目录调用；或一并删掉） |
| D7 | 用户另给：删除 `goal-advance` 这部分逻辑，不再要 |
| D8 | A：第 3 节白名单完整 |

影响排期的同步到路线书[决策记录](../post-anticorruption-roadmap/reference/decisions.md)（排期时做）。

## 7. 产品检查

- **从用户结果倒推。** 用户新建项目→项目里没有 Goals，首屏是平台自己的空项目引导或首个已装插件→要用 Goal 时像加别的插件一样添加→不用时可以移除，项目指导、决定记录、助理与 Coding 照常用。中断后再进：停在上次的面。存量项目里已有的 Goals 照旧装着，只是变成可移除。
- **每一步站得住。** 本需求不加新的确认步骤；移除 Goals 时提示「Goal 数据会保留，重新添加后恢复」（按普通插件的移除规则，不另造）。
- **已有授权接着用。** Goals 改为可移除不改变既有项目的授权；已有的可信决定记录随主人搬家后可读。
- **AI 的部分。** 项目指导、决定入口、接续摘要搬到平台后，Agent 发现与调用路径不变，只是不再经 Goals；不为模型能力打补丁。
- **别漏掉的路径。** 没有任何插件的新项目、只有 Goals 被移除的项目、第三方插件声明同类贡献、中英文界面、窄屏。

## 8. 开工前检查

| # | 回答 |
| --- | --- |
| 1 事实主人 | 第 5.1 节逐项给出；搬家后每项只有一个主人，`docs/SSOT-MATRIX.md` 同步改 |
| 2 插件同等待遇 | 本需求的目的；不新增构建期接线，删宿主私路 |
| 3 能力注册 | 决定入口、接续摘要、胶囊、设置节、上手承接都做成声明 + 动作目录，一份供页面、Agent、MCP |
| 4 合同 | 改：placement、action-subjects、memory、contextual、dom-events、context-ledger、skills、Goals 公开 contract、MCP 受保护决定入口（D3）、Manifest 新声明；删：胶囊的宿主路由与原生桥（D6）、`goal-advance` Skill（D7）。首个外部安装之前，按阶段一不留兼容期，一个 PR 改完消费者；先单独开合同片（片 1） |
| 5 放在哪个包 | 新平台服务放 `horizontal/` 新包或 `modules/projects`，不进宿主 |
| 6 表与存储 | 项目指导、决定记录搬家涉及表的主人变更：升版本、写升级段、补金样（[升级链设计](../upgrade-continuity/upgrade-chain-design.md)）；真实 Home 不动，开工前弹窗问 |
| 7 兼容与迁移 | 存量数据要搬（决定记录、项目指导、个人规划方法）：这是迁移逻辑，开工前按 `AGENTS.md` 写进 `docs/system/CONTRACT-CHANGES.md`「当前保留机制」并经用户确认 |
| 8 安全边界 | 碰：MCP 受保护决定入口（可信来源）、动作网关的可信身份；改动同步 `docs/system/SECURITY-INVARIANTS.md` 与拒绝测试 |
| 9 调用次数 | 每页请求不再额外读 Goals；胶囊与接续摘要按已装插件汇总，限定一次批量读 |
| 10 升级与数据 | 现有项目的 Goal、决定、指导、方法在升级后都在、能接着用；有金样回放证明 |
| 11 成果与过程项 | 不涉及：不新增成果类型 |
| 12 页面、外壳与文字 | 插件样式随包；新文字按主人起键；外壳不再拿插件文案；页面资源工作台应变小，Goals 包相应变大，写明字节 |
| 13 错误 | 新错误码用 `defineErrorCodes`；Inbox 错误码回 Inbox 包 |
| 14 冲突面 | 枢纽文件：`web-request.ts`、`page-view.ts`、`dom-events.ts`、`action-subjects.ts`、`placement.ts`、`memory.ts`、`bootstrap.ts`；动前查在途 PR（#2009、#2020、#2047 等） |
| 15 全局最优 | 插件：第三方能拿到同样的位置；平台：决定、指导、接续回平台；助理：发现与调用不依赖 Goals；各类平台能力：与智能呈现（第 15 批）、技能包、状态机平台能力对齐，不另造；后续开发：再加一个同类插件不用改平台。代价：Goals、宿主、工作台一次性改动较大，由片 1～6 分摊 |

## 9. 分片（一批一个 PR，批内子分支）

1. **合同片**：C1～C6 与 Goals 公开 contract 收窄、新声明（设置节、接续摘要、上手承接、决定入口），一次改完消费者。
2. **项目指导回平台**（D2）。
3. **决定服务回平台**（D3），MCP 管理入口改通用。
4. **规划方法进技能**（D5），删 Goals Home 半实例。
5. **宿主与工作台去私路**：H1～H9、Goals 样式随包、CLI（D6b）、去常开且新项目不默认装（D1）。
6. **删除**：桌面胶囊（D6）与 `goal-advance` Skill（D7），各登记重做或去向；可以最先做，不依赖别的片。
7. **其他插件**：4.5 节各项。
8. **叙事与命名**：PRODUCT、AGENTS、SSOT、GLOSSARY；路线书相关批次改写。

片 2～4 互不依赖，都依赖片 1；片 5 依赖 2、3；片 6 独立；片 7 只依赖片 1。

## 10. 验收标准

1. **PEQ-01** 一个项目移除 Goals 后：项目能打开，Agent Run、助理回合、MCP 连接、项目设置、项目简介都正常；项目指导仍生效。
2. **PEQ-02** 移除后重新添加 Goals，原有 Goal、关系、历史、要求认可都在。
3. **PEQ-03** 平台目录（`apps/local-host`、`apps/workbench` 外壳、`apps/mcp`、`apps/cli`、`apps/desktop`、`packages/contracts`、`packages/kernel`、`packages/design-system`、`horizontal/*`）不 import 任何插件包（生成的登记表与第 3 节白名单除外），由门禁检查（与现有 `boundary:check` 合并）。
4. **PEQ-04** 合同里没有 `goal_ids`、`goal` 关联类型、【当前目标】、`goal-*` 外壳事件、`"goals"`/`"feed"` 枚举值、`"coding"` 调用方枚举。
5. **PEQ-05** 一个示例第三方插件（`examples/plugin-sample/`）能声明设置节、接续摘要、需要可信决定的动作，并在工作台与 MCP 里生效。
6. **PEQ-06** 双实例对签名第三方插件开放，授权与沙箱规则与内置相同。
7. **PEQ-07** 工作台首屏不再默认 Goals：无历史时取首个已装插件，有历史时回到上次的面。
8. **PEQ-08** Goals 的样式、Feed 的样式不在工作台与设计系统里；页面资源检查通过且工作台资源不变大。
9. **PEQ-09** 项目上手、个人同步、Home 库快照、材料目录都按声明工作，不写死 Todo、Pages、Images、灵光。
10. **PEQ-10** 升级金样：带 Goal、决定记录、项目指导、个人规划方法的旧 Home 升级后都能读、能继续用。
11. **PEQ-11** [人工] 用户在真实界面里添加、移除、再添加 Goals，走一遍日常动线。
12. **PEQ-12** 新建项目里没有 Goals；Goals 的 Manifest 不声明 `always_on`，常开插件只有 Shelf。
13. **PEQ-13** 仓库里没有桌面胶囊的窗口、宿主路由与 Goals 胶囊投影；重做待办已登记。
14. **PEQ-14** 仓库里没有 `skills/goal-advance/`，安装流程不再向外部 Runtime 分发它，文档里没有指向它的说明。

## 11. 预警

本需求同时属于「底层逻辑调整」与「改产品语义」（第 6 节预警情形）：改合同、存储归属、安全边界与「Goals 不能移除」的产品承诺。预警卡由负责实现的会话起草，开工前发；D1～D8 由用户回答。

## 12. 决策记录

| 日期 | 事项 | 选项 | 用户选择 | 影响 |
| --- | --- | --- | --- | --- |
| 2026-11-13 | 发起 | — | 用户：把 Goals 当普通插件；其他插件也不该有这种地位，除非是之前特殊声明的平台插件（如 Shelf） | 本需求的范围 |
| 2026-11-13 | D1 Goals 常开吗（弹窗） | 默认装、可移除（推荐）；保持常开；新项目不默认装 | 新项目不默认装 | 删 `always_on`，建项目不装 Goals；PEQ-12 |
| 2026-11-13 | D2 项目指导归谁（弹窗） | 平台项目服务（推荐）；单独插件；留 Goals | 平台项目服务 | 片 2 |
| 2026-11-13 | D3 可信决定、审批规则归谁（弹窗） | 平台决定服务（推荐）；留 Goals、只通用 MCP 入口 | 平台决定服务 | 片 3 |
| 2026-11-13 | D4 要求认可与验收依据（弹窗） | 留 Goals、别人不依赖（推荐）；抽成平台能力；暂停 65-3 | 留 Goals、别人不依赖 | 65-3 照做，但不新增平台或别的插件对 Goals 的依赖 |
| 2026-11-13 | D5 规划方法（弹窗） | 变成技能进能力包（推荐）；留 Goals | 变成技能进能力包 | 片 4；`BL-goals-methods-as-skills` 移出「待你决定」 |
| 2026-11-13 | D6 胶囊与 CLI（弹窗） | 都做成可声明（推荐）；只留平台内容 | 用户另给：胶囊（工具栏里的内容）全部删掉，后续重做；CLI 未单独回答 | 片 6 删胶囊；CLI 记为 D6b 待确认 |
| 2026-11-13 | D7 `goal-advance` Skill（弹窗） | 改中性名（推荐）；名字不变只改正文 | 用户另给：删除这部分逻辑，不用了 | 片 6 删 Skill 及分发；PEQ-14 |
| 2026-11-13 | D8 白名单完整吗（弹窗） | 就这些（推荐）；还有要保留的 | 完整 | 第 3 节 |
