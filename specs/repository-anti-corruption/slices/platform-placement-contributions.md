# 放置的关联由声明登记、UI 贡献的 plugin_id 由平台填

状态：实现中（2026-10-25，防腐线 ac-platform，叠在 `d13fd0f48` 上；统筹已按 D1～D5 裁定，见 §5）。做的是 `privileges.md` 的 PG-032、PG-098、PG-100，PG-099 的剩余部分核实后不用写代码（§1.4）。验收号用 RAC-630～645（§3），BL 号不新增。Codex 的放置歧义后继修复固定从 `43049e2ab` 开始，保留原作者的关系 guard 和 RAC-639，只补移动/复制选择与同根拒绝副作用。

## 1. 重核结果

### 1.1 PG-032：放置服务把 Goals 写在代码里

`privileges.md` 的行号已过期，现在是：

| 位置 | 写死了什么 |
| --- | --- |
| `horizontal/placement/src/index.ts:185,206,447,461,510` | 按能力 id 字符串找 Goals 的动作：`goals.inputs.release`、`goals.inputs.bind`、`goals.inputs.list`、`goals.list`、`goals.create`（`placementAction(scope, "goals.…")`、`views.find(view => view.capability_id === "goals.create" …)`） |
| `index.ts:93-109,117-125,182,201-221` | 关联类型 `"goal"`、`placement.goal_in` 边、`kind === "goal"` 的分支、「Goal「…」」「来自 Goal《…》」「已建成 Goal《…》」这些文案、`removable` 的 `["goal", 项目, goal_id, binding_id]` 键 |
| `packages/contracts/src/services/placement.ts:35-42,151` | `PlacementAssociationType` 含 `"goal"`，`target` 有 `{ kind: "goal", goal_id }` 一支；`placementGoalActions`（`goals`、`bindGoal`、`create`）是放置服务自己的三个系统动作 |
| `apps/local-host/src/placement-http.ts:12,18-31`、`placement-actions.ts:93-98` | 三条路由 `/api/placement/goals`、`bind-goal`、`create` 和对应的处理器 |
| `packages/contracts/src/platform/action-subjects.ts:6-21,26-41` | `ActionSubjectContext.goal_ids` 是必填：输出 schema 的 `required` 是 `Object.keys(properties)`，含 `goal_ids`，每个对象读取器都得回一个（没有 Goal 的回 `[]`） |

放置服务找「这个位置能移动、复制、接收」用的已经是声明（`subject_kinds`、`isObjectMover`、`workflow_content.role === "receive"`，`placementTools` 与 `convert`），只有 Goals 这一支是按名字找。所以做法不用发明新机制，沿用动作上的声明。

行里点的另外三处（成果库提供方的 `goalTitle` 端口 `artifact-actions.ts:22`、Coding 的端口、Feed 的 `exists`）不在本 slice：Goals S4 的第 3 节已经把它们定为等 T1 解冻、随 Coding 一族（PG-091）和 Feed（PG-093）一起改，登记在 BL-500。

### 1.2 PG-098：UI 贡献里的 plugin_id 和 Manifest 对不上

现在是 **16 处**，比 GLOSSARY 写的 17 处少一处（Schedule 已经改对了）：Goals 12（`context-ui`、`decision-results-ui`、`dialogs-ui`、`document-ui`、`factors-ui`、`momentum-ui`、`planning-ui`、`policy-ui`、`proposal-ui`、`relation-ui`、`status-ui`、`tree-ui`）、Feed `ui.ts`、Inbox `ui.ts`、成果库 `browser-ui.ts`、`reference-ui.ts`；写的是 `io.molis.work.native.<x>`，Manifest 是 `io.molis.work.<x>`。行里点的 `plugins/native/work/src/ui/contribution.ts` 已经不存在。

读 `descriptor.plugin_id` 的只有两处：`packages/plugin-runtime/src/contribution.ts:53`（启动返回的视图，对不上就失败）和 `packages/ui-host/src/plugin-client.ts:35`（`ui:register`，对不上就 `plugin_denied`）。经 `registration.workbench.contributions` 进工作台的内置贡献（`apps/workbench/src/declared-stages.ts:25`、`plugin-catalog.ts:287`）谁也不查，所以 16 处错值一直没被发现。另有 20 多个插件的描述写对了，但每个都在自己的文件里再写一遍，是同一类可以写错的东西。

### 1.3 PG-100：灵光的 `fateLabel` 写死别的插件的对象种类

`plugins/native/lingguang/src/browser/list.ts:26-34`：`target.kind === "goal"`、`kind.includes("todo")`、`"page"`/`"document"`、`"jelly"`，其余是「其他」。放置服务给 `derived_into` 的目标永远是 `{ kind: "object", object }`（`origin()` 在 `index.ts:112-120`，转成 Goal 的目标 `found.kind === "goal"` 也走这一支），`target.kind === "goal"` 那一支其实不会出现。放置服务本来就算出了对方的所属插件（`otherRead.plugin`，只用在文案里），没有放进目标。

### 1.4 PG-099：剩下的只有 Alchemist

`privileges.md` 那行的状态格已经写了：Git 的旧函数和转出随 GS（S-53）删掉，Coding 的 `coding-surface.ts`、`filesDirectoryPanel`、`gitDirectoryPanel`、`diffStagePanel` 随 C9（#1191，batch-32）删掉。我对着 `d13fd0f48` 核了：`git-status.ts`、`coding-surface.ts` 不存在，仓库里没有这几个函数名的引用，`workspace-files.ts` 只剩被三处用着的 `readWorkspaceFile`。Alchemist 自带的 `localSecurity` 守卫（`app.ts:10-11`）：10-21 用户定 Alchemist 不迁、防腐收尾后删除重做（BL-376，V-07 不再核）。所以 **PG-099 没有可做的代码**；状态格请统筹改成「已做（GS、C9）；Alchemist 随 BL-376」，我在 PR 正文里写这句。

## 2. 做法

### 2.1 PG-032：关联由动作上的声明登记，放置服务按声明找

`ActionMetadata` 加一项可选的 `placement_relation: { relation: string; role: "list" | "bind" | "release" | "candidates" | "create"; target?: { kind: string; noun: string } }`（`target` 只在 `list` 角色上写：对方的对象种类和人读的名词；紧挨 `project_reach`，由 SDK 的声明检查把关）。一个关联（今天只有 `goal`）由同一个插件的五个动作各带一个角色：

- `list`：这个对象挂在哪些目标上（Goals 的 `goals.inputs.list`）；
- `bind` / `release`：挂上、取消（`goals.inputs.bind`、`goals.inputs.release`）；
- `candidates`：能选的目标有哪些（`goals.list`）；
- `create`：把内容建成一个目标（`goals.create`）。

放置服务的 `placementAction(scope, "goals.…")` 和 `capability_id === "goals.create"` 换成 `placementRelationOf(ports, scope)`：在目录里一次按这项声明找出五个角色，找不到或不可用就是现在的 `placement.target_unavailable`。要找哪个关联由 `PlacementPorts.relation` 给，缺省是线上名字 `goal`（夹具用它换成别的关联名）。`horizontal/placement` 里不再出现 `goals.` 字符串。显示用的名词（「Goal」）由 `list` 角色的声明带（`noun`），文案「Goal「…」」「已建成 Goal《…》」按它拼；关联键、边类型（`placement.goal_in`）按关联名拼，今天仍是同样的值。

不变的：放置规则（谁能移动、复制、转成；账本里的边；`describe` 的结果形状）；Goals 的动作 id、版本、输入输出；路由和系统动作的名字（见 D2）。

`ActionSubjectContext.goal_ids` 改成输出里可选（D3）：读取器不属于任何 Goal 关联时不写；`subjectContext()` 不再替它补 `[]`。放置服务读的本来就是 `read.context?.goal_ids ?? []`。**一轮评审后（ac-review，统筹裁）：输出 schema 变了，所有对象读取器（`defineSubjectContextAction` 一处）升到 `version: 2`**（`docs/system/CONTRACT-CHANGES.md` 第 3 节第 3 条；阶段一不留旧版本）；仓库里钉在 `@1` 的引用同一片改完，`pnpm actions:update`。

动作合同快照：Goals 的 5 个动作多一项声明，traits 哈希变了，**版本不升**（输入输出 schema 不变；同 Todo 那次的理由，统筹 10-24 同意过一次，这里再确认，D1）。对象读取器（23 个 Manifest 里的动作，含 `alchemist.playbook.context`，加宿主的 `characters.subject.read`，共 24 个）输出 schema 变，**升到 2**。

一个关联在一个目录里只有一个提供方：放置服务按提供方分组，同一个关联名被不止一个可用的提供方声明，所有操作（`describe`、候选、挂上、取消、建成）一律 `placement.relation_ambiguous`（kind `conflict`，信息点出各个提供方），一个提供方的动作也不调，五个角色不混着取。

放置歧义后继修复（2026-10-25，FIRST 非阻塞 3）：移动、复制也按当前分区、对象种类、协议和可用性筛选动作。匹配超过一个时明确拒绝为现有的 `placement.target_unavailable`（kind `conflict`、`details.actions` 列出可信提供方及动作引用，沿用现有不可用文案），不取首项；移回原处使用相同的选择规则。只执行移动或复制时，仅解析所需协议；另一协议的歧义不阻断唯一的所需动作。描述会解析两种协议，歧义拒绝不能被工具发现的 catch 吞成空结果；分区打不开或目录读失败仍保留现行空工具语义。

验证使用真实 `ActionService` 的注册目录和生产 `PlacementService` 公开入口，调换注册和能力排序；关联用两个可信 `provider_id`、同一 `plugin_id` 检查原 guard，不另写一份关系选择。歧义动作零调用、放置账本零写入、对象和副本不变。`describe`、`bindGoal`、`convert` 选择目标前的既有对象读取及其标题缓存另行核对，不算歧义动作调用。无可用读取器而带 payload 的 convert，只在目标创建成功且原调用控制允许写入后缓存标题。回退目录才发生歧义时，初始成功的搬移属于已发生的部分效果；保留原拒绝并附回退失败原因，不调用任一歧义 mover。

### 2.2 PG-098：贡献的 plugin_id 由平台填，插件不写

- `packages/contracts/src/platform/ui.ts`：插件写的 `UiContribution.descriptor` 换成 `UiContributionDeclaration`（没有 `plugin_id`）；`UiContributionDescriptor`（带 `plugin_id`）是平台这一侧的，`OwnedUiContribution` 是进了登记表的那份，`ownedContribution(声明, 插件 id)` 合成它；`declaresOwner(声明)` 判断一份声明有没有自己写了 `plugin_id`。
- `ui-host` 的 `register` 只收 `OwnedUiContribution`：`plugin-client.ts` 用安装上下文的 `context.plugin_id` 合成，声明自带 `plugin_id`（哪怕等于自己的）一律 `plugin_denied`，不覆盖、不兜底；内置的 `registration.workbench.contributions` 在 `pluginWorkbenchPacks` 里用登记项的 `manifest.plugin_id` 合成；Runtime 的视图契约检查（`contribution.ts`）把「`plugin_id` 对不上」换成「声明里不许有 `plugin_id`」，其余照旧。
- 各插件 UI 文件里的描述（实数 60 个文件含测试、示例与脚手架）各删 `plugin_id`，类型换成 `UiContributionDeclaration`；SDK 多导出 `UiContributionDeclaration`；GLOSSARY 的「UI 描述里的 `plugin_id` 与 Manifest 不一致」那条改成「已由平台填」。

这样「插件冒用别的插件的名字登记贡献」不是被检查拒绝，而是没有地方写（类型上不能写，运行时写了也拒）。`plugin_denied`（不在 Manifest 的 `ui.contributions` 里就拒）保留。外部插件作者的影响：声明里写了 `plugin_id` 的插件，类型检查和注册都会失败，删掉那一行即可。

### 2.3 PG-100：对象种类的显示名从登记读

`PlacementAssociation.target` 的 `object` 一支加 `plugin: { plugin_id, title } | null`（放置服务已经在 `origin()` 里读到 `otherRead.plugin`）；灵光的 `fateLabel` 只读它：有就显示「已转到 {所属插件}」，没有就「已转出」。删掉 `lingguang.fate.goal/todo/page/jelly` 四个文案键。放置服务的「来自 Goal《…》」「已建成 Goal《…》」仍按对方是不是关联的目标种类（`list` 声明的 `target.kind`）分两套，名词读声明的 `noun`，不再有 `found.kind === "goal"`。

不新建种类登记表：对象种类已经是读取器动作的 `subject_kinds`，所属插件是读取器的提供方，放置服务早就按这个找人（`describe` 返回 `plugin`）。

## 3. 验收

- **RAC-630**：`horizontal/placement/src` 里没有 `goals.` 能力 id 字符串（读源码的测试）；
- **RAC-631**：一个夹具提供方用另一个关联名（`topic`）声明五个角色，放置服务能列出、挂上、取消、列候选、建成，用的是同一套代码；换掉提供方后原来的提供方不再被调用；
- **RAC-632**：关联的提供方缺任何一个角色或不可用：对应的操作是 `placement.target_unavailable`，别的角色的动作没被调；
- **RAC-633**：`goal_ids` 缺省的读取器能被 `describe` 照常处理；带 `goal_ids` 的读取器仍显示「挂接」；
- **RAC-634**：Goals 的 5 个动作带声明；SDK 的声明检查拒绝：角色不在列表里、同一个关联同一角色出现两次、`relation` 不是小写词、`target` 写在非 `list` 角色上、`list` 角色缺 `target`；
- **RAC-635**：内置贡献的声明里没有 `plugin_id`（读 TypeScript 语法树，不论属性顺序、简写、带引号的键）；工作台登记后的描述 `plugin_id` 等于登记项 Manifest 的；声明自带 `plugin_id`（哪怕等于自己的）时 `pluginWorkbenchPacks` 抛错，信息里有插件和贡献 id，不覆盖；
- **RAC-636**：插件经 `ui:register` 登记不在自己 Manifest `ui.contributions` 里的 id，`plugin_denied`；声明自带 `plugin_id`（哪怕等于自己的），`plugin_denied`，且没有登记；
- **RAC-637**：启动返回的视图声明里没有 `plugin_id` 才能兑现，自带 `plugin_id` 的失败；对不上 Manifest 声明的 `contribution_id` 仍失败；
- **RAC-638**：`derived_into` 的目标带所属插件的名字，灵光的标签读它；所属插件缺失（插件已停用）时显示「已转出」；灵光的 `list.ts` 里不再有 `todo`/`page`/`jelly`/`goal` 字符串（读源码）。
- **RAC-639**：同一个目录里两个可用的提供方声明同一个关联名（五个角色全在两边，或分在两边）：`describe`、候选、挂上、取消、建成都是 `placement.relation_ambiguous`，两个提供方的动作都没被调；其中一个不可用时，另一个独自管这个关联；
- **RAC-640**：真实动作目录中，同一 `plugin_id` 下两个可信 `provider_id` 的 `topic` 角色完整或拆分，调换注册与能力排序后，五个公开入口均保持 `placement.relation_ambiguous`；只有既有源对象读取，关系动作零调用、放置账本零写入。
- **RAC-641**：同种对象有多个可用 mover 或 copier 时，`describe` 及对应 `move`/`copy` 明确拒绝；两种顺序下均零协议调用、零账本写入、对象位置和副本数不变；Home mover 和同一 provider 的多个匹配动作也不能任意选择。
- **RAC-642**：单一提供方、不可用或其他分区的竞争者、用户受众/权限、目录失败和有效移动/复制保持；另一协议的歧义不阻断所需的唯一动作。拒绝后停用竞争者再重试，只有剩余提供方执行，后续描述和位置索引与业务对象一致。
- **RAC-643**：源读取器不可用而 convert 带 payload，目标关联歧义仍明确拒绝；关系动作、账本和 payload 标题缓存均零写入。
- **RAC-644**：初始移动已提交、原调用随后被拒绝，回退分区有多个 mover 时不调用任何回退动作；原拒绝保留且原因明确，已发生的初始移动单独报告，不伪造回退成功。
- **RAC-645**：唯一关联提供方缺少/不可用某个角色时，不从不可用的另一提供方补齐；对应操作保留现行拒绝或空结果，其余唯一角色仍可用。

## 4. 碰的文件（预计）

`horizontal/placement/src/index.ts`、`packages/contracts/src/{platform/actions.ts,platform/action-subjects.ts,platform/ui.ts,services/placement.ts,modules/goal-entry-actions.ts,modules/goal-actions.ts}`、`packages/plugin-sdk/src/action-declarations.ts`、`packages/plugin-runtime/src/contribution.ts`、`packages/ui-host/src/plugin-client.ts`、`apps/workbench/src/{plugin-catalog.ts,declared-stages.ts,ui-composition.ts}`、`plugins/native/lingguang/src/browser/list.ts`、约 35 个插件的 `ui*.ts`、`apps/local-host/src/{placement-http.ts,placement-actions.ts}`（只在 D2 选泛化时）、`tooling/gates/api/contracts/platform/{actions,ui}.txt`、`tooling/gates/actions/actions.tsv`、GLOSSARY、相关 README 与 `skills/molis-plugin-dev`。

和别的线的重叠：Goals 五个动作的定义在 `packages/contracts/src/modules/goal-*.ts`，ac-sc3 的 S8/S9 在改 Goals 的存储与提供方，不改动作定义，冲突应该只在 `goal-entry-actions.ts` 附近；约 35 个 UI 文件里有 12 个是 Goals 的，ac-sc3 若在那边改 `*-ui.ts` 会撞。落地顺序由统筹定。

## 5. 统筹的裁定（2026-10-25）

1. **D1**：做 PG-032。Goals 5 个动作只多 traits；`pnpm actions:update` 之后输入输出 schema 的哈希不变就不升版，变了就升版；PR 写对调用方的影响。
2. **D2**：只搬实现，线上名字不改（`"goal"`、`placementGoalActions`、三条 `/api/placement/*` 路由）。
3. **D3**：`goal_ids` 改成输出里可选，读它的一侧同一片里改，读取不兜底。
4. **D4**：PG-098 按 §2.2 做，是合同变更：平台在登记时按受信任的 Manifest 填 `plugin_id`，插件不写，声明自带 `plugin_id` 一律拒；跑 `pnpm api:update`；PR 写对外部插件作者的影响；SDK 是共享核心，由统筹跑全量。
5. **D5**：验收号 RAC-630～649，BL 号 625～634，不加 S 号。
6. **PG-099**：状态格由统筹改；本片不写代码，PR 正文写一句。

## 6. 开工前再核

- `origin/main` 若又动了 `horizontal/placement`、`placement.ts`、`ui.ts`、`plugin-client.ts` 或 Goals 的动作定义，再核行号；
- 这些 UI 文件里是否有别的线在改；
- 夹具提供方（RAC-631）：`tests/work-placement.test.ts` 已有「假客户端 + `PlacementService`」的写法，夹具直接用一个返回自己拼的 `ActionView`（带 `placement_relation`）的假客户端，不起整个 Home。第一步的探测已做：真实的 Goals 动作经目录带着声明到了放置服务，`work-placement.test.ts` 17 个用例原样通过。

## 7. 本机验证计划（做完代码后）

只构建改到的包（contracts、plugin-sdk、plugin-runtime、ui-host、placement、workbench、local-host、改过的插件）；`pnpm api:update`、`pnpm actions:update`；`check-health-gates --base origin/main`、`boundary:check`、`secrets:check`；直接相关的非浏览器用例：`work-placement*`、`placement*`、`plugin-manifest-v2`、`action-contract-snapshot`、新测试文件；不跑 affected-tests 的全集、浏览器用例和全量。

### 放置歧义后继验证（Codex，2026-10-25）

固定父提交 `43049e2abba79b6d01d108f9eba27a7a31162ff5`。保留该提交的关系 guard、RAC-639、Reader @2 及 UI 修复；本后继仅修改放置实现、README、本节与 RAC-640～645 的真实目录回归。

- 历史证据保留：`c645b170e` 的整体构建与原四文件 34 项通过；旧负例 54 项中 12 通过、42 失败（含父子测试），保全提交 `b85aab384`。
- 新父源的整体构建通过，已核对本树 contracts/placement 的 `dist` 来源和读取器版本 2。原关系用例 8/8 通过；本后继新回归在未修生产代码时 63 项中 38 通过、25 失败，完整/拆角色的真实目录关系用例全部转绿，剩余失败明确落在工具选择、回退与 payload 拒绝后的缓存。
- 候选整体 `pnpm build` 通过（4 个包重建、66 个复用）；`pnpm boundary:check` 和 `node scripts/check-health-gates.mjs --base 43049e2abba79b6d01d108f9eba27a7a31162ff5` 通过。源码冻结后运行 README 指定的五文件，共 98 项通过；RAC-640～645 对应的新文件 63/63 通过，涵盖零调用/写入、重试恢复、原调用控制与已发生的部分效果。
- 原始日志：`/tmp/placement-provider-ambiguity-red.log`、`/tmp/placement-provider-ambiguity-baseline-placement.log`、`/tmp/placement-provider-ambiguity-43049-before.log`、`/tmp/placement-provider-ambiguity-candidate-build-gates.log`、`/tmp/placement-provider-ambiguity-candidate-tests.log`。独立双核按同一固定来源的后继候选交接；不重复运行共享核心全量，不把服务级验证记作一骏本人验收。

独立核验及交接裁定（2026-10-25）：生产与测试固定在 `8f4d018881d6b1d54074adc9313401beeb464634`，其后的尾提交只记录下列文档事实，不改源码、测试、时限或断言。

- [限定 REVIEW 通过](https://github.com/molis-ai/molis-work/pull/1277#issuecomment-6396782868)：已核完整差异、真实调用链、构建来源和原件，未发现 Blocker/P1。
- [独立 TEST 首批原件](https://github.com/molis-ai/molis-work/pull/1277#issuecomment-6397241703)：官方 runner、jobs=1、retry=0、隔离 Home/cache，三文件自然退出 1；新契约 63/63、主流程 17/17、重启文件 6 通过/1 取消，合计 86/87。原重启用例 60000ms 时限在 75607.497ms 报告超时。原因为 **UNKNOWN**，不能记为断言失败，也不归因为负载、环境或 flaky；作者此前 98/98 不覆盖此次取消。
- TEST 的旧生产输入 `ac7e84a2` 单标题对照自然通过（20.306s），只支持当时已核实的等价生产输入，不解释候选首次取消。其工作树后来被清理；预定配对在开跑前停止，没有冒用其他 dirty 树。为取得准确输入，另建干净 `43049e2` 临时基线并完成必要构建，再在同一标准 build FIFO 槽内串行观测父/候选原失败标题：两次独立冷 cache/Home，原 60s 及全部原断言保留；父用例 11.980s、候选 8.702s，均自然退出 0。观察包装只记录 HTTP 路径、CPU/事件循环及监听/关闭事件，未改产品；两边 16 个 HTTP 调用及两次监听/关闭均完成。它只证明该受控条件下通过，**不解释或覆盖首次取消，不证明没有回归**。
- 诊断原件在 `/tmp/placement-restart-diagnosis/`：`parent-build.log`、`pair.log`、`comparison.json`、`trace.mjs`、`run-pair.py`，以及 `parent-43049/`、`candidate-8f4/` 各自的原始结果和轨迹。准确受控基线为 `/Users/yijunwang/.codex/worktrees/placement-restart-parent-control/goalboard`；与 `8f4` 候选一同保留供核读，不再重复构建或跑单项求绿。
- 统筹裁定保留本题放置修复范围；TEST 已独立只读核收上述配对的准确输入、原断言/时限、观察包装和原件，并在同一正式 TEST 回执补记。本题源码与必要有限验证可交 carrier。首次重启 **UNKNOWN** 作为一条集成待查，剩余 owner 为 **TEST + 唯一 Claude carrier**，随下一准确组合的既定相关回归/full 结算；若再现，再按具体栈/阶段派对应 owner。本题不扩大到 Host、SDK 或全局调度的生产修改，也不长期等待整线；**整 PR/组合 Ready 仍取决于原门禁与 full，本裁定不放行它们**。
