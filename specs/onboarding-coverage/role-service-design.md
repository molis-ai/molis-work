# 第 36 批第 1 项设计稿：角色的保存、生效与恢复

状态：设计稿（2026-11-15），待评审；评审后提交到 `batch/36`，再写合同与实现。合同形状沿[提前角色层次合同](role-scope-contract.md)（#1995 已合入），本稿补服务、存储、动作、执行冻结和消费者的改法。界面照[方案 C 定样](../../docs/design/role-scope/README.md)，不重出样。

依据：[Onboarding §3.9、§3.11、§3.12、§10](spec.md)、[PF-A11](../product-flow-governance/audit-2026-10-27.md)、[第 36 批第 1 项](../post-anticorruption-roadmap/reference/batches/36.md#batch-36-item-1)与本批核账。验收：ONB-17、ONB-31、PFG-19，RSC-C01～C04 的运行时部分，以及本稿 §9 的 ROLE-01～ROLE-14。

## 1. 现状与改法一览

| 现在 | 改成 | 为什么 |
| --- | --- | --- |
| 草稿覆盖写，没有历史；要先「发布到当前项目」成成果，任务才能选 | 原件每次保存都固定成不可变版本（`character_versions`）；项目里是**成员**，两节各自跟随或覆盖（`character_members`、`character_member_versions`） | PF-A11「保存并使用自动固定版本」；方案 C；恢复要有版本 |
| 选角色只有「这一次」，没有项目默认、个人默认 | 两层默认（`character_defaults`），任务开始时按「本次 → 项目 → 个人 → 助理」解析 | §3.11 取值从近到远 |
| 执行冻结的是成果库里的一个发布版本（`ArtifactReference`），个人工作被拒 | 执行冻结 `CharacterRoleVersionRef`（个人原件版本，或成员版本加原件版本），个人工作也能用 | 合同 §1；用户 11-04 定个人工作能用角色 |
| 助理、Coding 各自读 `characters.list` 的发布物，再逐个问 `characters.runnable` | 一次 `characters.roles.list` 给出可选角色、可用与否、两层默认和新任务的有效值；任务开始时一次 `characters.roles.resolve` | 调用次数（N42～N56）：今天每个发布物多一个请求 |
| 停用的角色连进行中的任务也拦（每轮核 `requireActive`） | 进行中的任务按冻结版本继续，只拦新的选择；版本本身不可变，只核它还读得到 | 核账第五节「进行中的任务照旧」 |

不改的：选角色不授权，角色只能收窄任务开放的工具与动作（`role_execution_exceeded` 照旧）；同一个 Prologue 运行时；`characters.publish` 作为「存进成果库」的高级路径保留（PFG-19「真正需要独立发布的高级路径保留」），它不再是任务能选角色的前提。

## 2. 存储：`characters/characters.sqlite` 1 → 2

只新增表，升级步骤只建表（`upgrades: [{ from: 1, sql }]`，同 `agent_definitions` 1→2 的写法），不搬数据、不加兼容读取：

```sql
CREATE TABLE character_versions (            -- 个人原件的固定版本，只增不改
  character_id TEXT NOT NULL, owner_actor_id TEXT NOT NULL, version INTEGER NOT NULL,
  draft_revision INTEGER NOT NULL, saved_at TEXT NOT NULL, content TEXT NOT NULL,
  PRIMARY KEY (character_id, version));
CREATE TABLE character_members (             -- 项目成员：当前配置，revision 是写入凭据
  member_id TEXT PRIMARY KEY, owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, character_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','disabled','removed')), revision TEXT NOT NULL, member_version INTEGER NOT NULL,
  sections TEXT NOT NULL, origin TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX character_members_live ON character_members (owner_actor_id, project_id, character_id) WHERE state != 'removed';
CREATE TABLE character_member_versions (     -- 成员的固定版本：只存两节的模式与覆盖值，跟随的节由原件版本给
  member_id TEXT NOT NULL, member_version INTEGER NOT NULL, saved_at TEXT NOT NULL, sections TEXT NOT NULL,
  PRIMARY KEY (member_id, member_version));
CREATE TABLE character_defaults (            -- 两层默认：project_id 为 '' 是个人默认
  owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, selection TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id));
CREATE TABLE character_adoptions (           -- 模板采用回执：同键重放原结果
  owner_actor_id TEXT NOT NULL, scope TEXT NOT NULL, request_id TEXT NOT NULL, receipt TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, scope, request_id));
```

- **原件版本。** `content` 是 `CharacterRoleContent`：`title`、`instructions`、`host_tools`、`action_tools?`、`import_snapshot?`（与 `CharacterDraft` 的内容字段同义，`null`／省略／空表各自的意思不变）。草稿仍是可编辑稿，`revision` 照旧做冲突凭据；新建和每次内容有变的保存在同一个事务里写一版。没有任何版本的草稿（升级前就有、或从另一台设备同步来的）在列表里标「还没保存成版本」，保存一次才能被选，不在升级时代为补版本（不新增迁移逻辑）。
- **成员的两节。** `sections` 是 `{ work_style: Section; capabilities: Section }`，`Section = { mode: "follow" } | { mode: "override"; based_on_original_version; value; acknowledged_original_version }`。`work_style` 的值是 `instructions`；`capabilities` 的值是 `host_tools` 与 `action_tools`。读出的 `original_changed` 是现算的：原件当前版本里这一节与 `acknowledged_original_version` 那版不同。标题始终沿原件。
- **成员版本。** 每次成员保存（覆盖一节、恢复跟随、恢复某个版本、首次加入）都写一版 `member_version`；`revision` 是不透明串（`<member_version>.<随机>`），复用采用时换新串而不加 `member_version`（合同 §3）。「保持本项目的」只改 `acknowledged_original_version` 与 `revision`，不加版本（正文不变）。
- **同步。** 现有的草稿复制（`character_drafts` 的同步触发器）不动；新表在个人同步（服务端批）落地之前只在本机，同主线 §6 的写法。
- 一张表只由 Characters 读写；表主人登记照 `tooling/gates/table-owners.json` 的现行口径核对（同一个库，不需要新增共写登记）。

## 3. 动作

全部在 Characters 的提供方上声明一次（`modules/characters/src/actions.ts`），本人、项目从调用上下文取。读动作 `audiences: user, agent, workflow, mcp, plugin`；写动作 `user, agent, mcp`（助理和外部 Agent 也能替你改角色，但都经同一组动作和授权）。项目层的动作在项目里调用，个人层的也能在个人范围调用。

| 动作 | 输入 → 输出 | 说明 |
| --- | --- | --- |
| `characters.create@1`（改） | `{ title, instructions, host_tools, action_tools? }` → `{ draft, version }` | 新建即保存成 v1；原来的「建一个空草稿」去掉 |
| `characters.update@1`（改） | `{ id, expected_revision, title, instructions, host_tools, action_tools? }` → `{ draft, version }` | 内容有变就写下一版；过期修改照旧拒绝 |
| `characters.state@1` | 不变 | 停用不影响已开始的任务（§5） |
| `characters.roles.list@1`（新，查询） | `{}` → `CharacterRoleCatalog` | 一次给选择器、项目设置、全局设置要的全部：我的原件（当前版本、状态、几个项目在用、其中几个改过一节）、本项目成员（`CharacterRole` 加解析后的标题、两节状态、原件改过的提示）、两层默认、新任务的有效值（`EffectiveCharacterSelection`）、每个可选项能不能用和原因。能力包目录要的作用范围、继承来源与用量也取这一份 |
| `characters.roles.read@1`（已声明，接上） | 合同 §3 | 批读角色与采用回执，1～128 项 |
| `characters.from_template@1`（已声明，接上） | 合同 §3 | 新建或复用，同请求重放原回执 |
| `characters.versions.read@1`（新，查询） | `{ role: PersonalCharacterRef \| ProjectCharacterMemberRef }` → `{ versions: [{ ref, saved_at, content, current }] }` | 抽屉里的「版本」、看差异；按固定版本取正文的公开入口（合同 §3 末段要的） |
| `characters.members.add@1`（新） | `{ character_id }` → `{ role }` | 加进当前项目，两节都跟随 |
| `characters.members.save@1`（新） | `{ member_id, expected_revision, expected_original_version, work_style?, capabilities? }` → `{ role }` | 只覆盖给出的节，另一节保留原模式 |
| `characters.members.section@1`（新） | `{ member_id, section, expected_revision, expected_original_version, to: "follow" \| "keep" }` → `{ role }` | 恢复跟随（新版本）或保持本项目的（只确认差异） |
| `characters.members.state@1`（新） | `{ member_id, expected_revision, state: "active" \| "disabled" \| "removed" }` → `{ role }` | 移出本项目只解除成员，原件保留 |
| `characters.versions.restore@1`（新） | `{ version: CharacterRoleVersionRef, expected_revision, expected_original_version? }` → `{ role }` | 存成新的一版，不盖掉之后的修改；历史上跟随的节如今取不到当时内容时，在项目里覆盖该节还原（合同 §2 表） |
| `characters.defaults.set@1`（新） | `CharacterDefaultSelection` → `{ defaults }` | 个人层只收个人原件，项目层收成员、助理或 `null`（沿用） |
| `characters.roles.resolve@1`（新，查询） | `{ selection?: CharacterTaskSelection }` → `{ effective, character?: CharacterRoleSnapshot }` | 任务开始时调用一次：给有效值和固定下来的正文；读不到或不能用时拒绝并说原因 |

`characters.list@1` 与 `characters.runnable@1` 删去（合同阶段一，一个 PR 改完消费者）：它们只服务「先发布、再按发布物选」，新的选法由 `roles.list`／`roles.resolve` 给。`characters.publish@1` 保留，作用改述为「把当前原件存进成果库」。`characters.launch@1`、`execution@1`、`publications.file@1` 用发布物运行本机 Agent，属于本机运行的高级路径，照旧。

错误码沿 `characterErrors`：版本或成员过期是 `conflict`（带当前值，界面给「看差异」），引用不属于本人或不在本项目是 `not_found`（不区分「不存在」与「别人的」），停用的选择是 `disabled`。

## 4. 取值

```
新任务的有效值 = 本次另选 ?? 项目层 ?? 个人层 ?? 助理自己
```

- 项目层为 `null` 是沿用；显式选「助理自己」时 `source: "project"`。个人工作从个人层开始。
- 项目层指向的成员停用、移出，或它跟随的原件停用、删除：结果是 `{ kind: "assistant", source: "assistant", stopped_project_default }`，**不退到个人默认**（用户 11-08 定）；项目层配置保留。
- 个人层指向的原件停用或删除：退到助理自己，个人层配置保留。
- 本次另选不能用：拒绝，不悄悄换成别的（核账第五节）。
- 解析在 Characters 里做一次，助理、Coding、页面不各写一份。

## 5. 执行：冻结与之后各轮

- `AgentStartRequest.character` 由 `ArtifactReference` 改为 `CharacterRoleVersionRef`；Manifest 的 `characters` 声明由 `{ selection: "optional-exact-artifact", scope: "project-owner" }` 改为 `{ selection: "optional-role-version", scope: "owner" }`（个人与项目都可，本人从上下文取），SDK 校验同改。
- `AgentFrozenCharacter` 改为：`{ role: CharacterRoleVersionRef; character_id; title; instructions; host_tools; action_tools?; import_snapshot?; project_id: string | null; owner_actor_id; saved_at }`。`content_digest`、`producer`、`published_at`、`reference` 是成果库发布物的字段，去掉。运行记录里旧形状的 `character` 是历史，只按现行形状显示，不为旧值写兜底；显示只用 `title` 与版本（个人 `v n`，项目 `本项目 v m · 原件 v n`）。
- 宿主的 `resolveCharacter(ref, actorId, projectId)` 读 Characters：成员只在本项目里查，原件只查本人；内容由原件版本加成员版本的覆盖重建。
- **之后各轮**：守卫只核这个版本还读得到（成员没被移出、原件没被删除），不核停用；固定版本不可变，所以不再比较内容。能力被撤由原有的能力核对拦下，这一轮停在原处（`role_execution_exceeded`／授权拒绝），不换版本。
- **谁冻结**。助理：一件工作开始时，或用户另选角色后从下一轮起，调 `roles.resolve` 得到版本存在工作上（`StoredWork.character` 改为 `{ role: CharacterRoleVersionRef; selected: CharacterTaskSelection; title }`），之后各轮用同一版本。Coding：每个会话的选择存稳定引用（`CharacterTaskSelection`），会话第一轮解析并固定，之后各轮沿用；换选从下一轮起。主对话按对话对方（稳定引用）各一件，换版本不另起一件。
- 委派给专业角色：委派工具的 `character` 参数改为按 `roles.list` 里的名字或稳定引用找，找不到或不能用就拒绝（照旧不换成别的）。

## 6. 界面（方案 C，照定样）

| 位置 | 做什么 | 读写 |
| --- | --- | --- |
| 助理输入框旁的选择器 | 列「助理自己」、本项目成员（项目里）或我的原件（个人工作），标「项目默认」「我的默认」；要的工具超出这次执行方式的标出原因、不能选；另选后出「只用于这一次」和「设为本项目默认」「设为我的默认」；「改默认」就地换成选默认的模式 | `roles.list`、`defaults.set` |
| 项目设置 › 角色 | 默认一行加来源阶梯；成员列表（跟随／改过一节、恢复跟随、调整）；原件改过本项目覆盖的那一节时提示一次，就地看差异、改为跟随、保持本项目的；「添加角色」就地展开 | `roles.list`、`members.*`、`defaults.set` |
| 全局设置 › 角色 | 我的默认；我的角色（几个项目在用）；每行「调整」「更多」（复制成新角色、停用…）；停用就地确认影响 | `roles.list`、`state`、`create` |
| 抽屉（调整／新建） | 做事方式、能用什么；项目里改时「改到：只本项目／我的原件」；保存后「已保存」可撤销（撤销 = 恢复上一版）；别处改过时看差异、保留我的或丢掉；版本折叠区恢复成某一版；有没保存的改动时关闭就地问 | `versions.read`、`update`、`members.save`、`versions.restore` |
| Coding 会话的角色弹层 | 与助理同一套选择与来源说法 | `roles.list` 经 Coding 路由 |

组件板新增：来源阶梯 `mw-source-ladder`、抽屉里的说明行 `mw-note`。先在组件板补标本，D 轨合审后进产品。页面资源合计按 `pnpm page-assets:check` 量，超 10 KB 先问用户。

## 7. 开工前检查（15 项）

| # | 结论 |
| --- | --- |
| 1 事实主人 | Characters 拥有原件、版本、成员、默认与采用回执；成果库只在「存进成果库」时持有发布物；运行记录归 Agent Host，冻结的是角色版本引用和正文 |
| 2 插件同等待遇 | Coding 与助理同经 `roles.list`／`roles.resolve`；第三方插件在 Manifest 声明 `characters` 即同样能选角色 |
| 3 能力注册 | 新动作在 Characters 一处声明，页面、助理、MCP 同用；不另写名单 |
| 4 合同 | `modules/characters`、`services/agent-host-start`、`platform/plugin-agent` 按原版本改（阶段一），一个 PR 改完消费者；跑 `api:update`、`actions:update`、`versions:generate` |
| 5 包边界 | 存储与解析在 `modules/characters`；宿主只装配与冻结；Agent Host 不读 Characters 的库 |
| 6 表与存储 | 新表都在 Characters 自己的库；库 1→2，升级只建表 |
| 7 兼容与迁移 | 不新增：不补版本、不读旧形状；旧运行记录与旧选择按现行形状读，读不出就是「这个版本不能用了，另选」这一条现行路径 |
| 8 安全边界 | 引用按本人与本项目查归属；跨项目或别人的引用一律 `not_found`；选角色不授权。新增 `S-character-role-scope`：跨项目成员引用、伪造本人、超出执行方式的工具三种拒绝各有测试 |
| 9 调用次数 | 选择器、设置页一次 `roles.list`；开始任务一次 `roles.resolve`；每轮守卫只读一次版本存在；去掉今天按发布物逐个 `runnable` 的 N 次请求 |
| 10 升级与数据 | 库版本 1→2，金样随 `pnpm` 的升级回放重生；没有版本的旧草稿保存一次才可选 |
| 11 成果与过程项 | 不新增成果类型；`character.definition.v1` 只由「存进成果库」产生 |
| 12 页面、外壳与文字 | 不出整页：设置页里的一节、抽屉和就地展开；文字走 `t()`，存下来的是键和参数 |
| 13 错误 | 沿 `characterErrors`，冲突带当前值供看差异 |
| 14 冲突面 | Characters、assistant、Coding 的角色部分、Agent Host 的冻结、工作台角色页；第 34 批 PR 只碰 `tests/characters-appearance.test.ts`，按依赖顺序合并 |
| 15 全局最优 | 插件：Coding 与第三方同一份声明与动作；平台：一处解析、一种冻结；助理：主对话与委派用同一份可选列表；平台能力：来源阶梯以后给记忆、运行时、模型共用；后续：第 45 批助理团直接用成员与采用回执 |

## 8. 偏离与留后

- 本批文件的「粒度」写层次合同切小 PR 先合：#1995 已合，本批不再单开。
- 旧运行记录里的成果库式 `character` 只显示标题，不再显示版本与发布者；不为它写兜底（§5）。
- 新表暂不进同步复制，随个人同步（服务端批）补，记 `BL-character-roles-sync`。

## 9. 验收

| 编号 | 怎样验 |
| --- | --- |
| ROLE-01 | 保存原件得到新版本；同内容再存不加版本；过期修改被拒并能读到当前值（`conflict`） |
| ROLE-02 | 成员两节都跟随时用原件最新版；覆盖一节后另一节仍跟随；先覆盖做事方式再只改能用什么，前一个覆盖不丢 |
| ROLE-03 | 原件改了成员覆盖过的那一节才提示；「保持本项目的」后不再提示，那一节再改才再提示；「改为跟随」存新版本 |
| ROLE-04 | 恢复某一版存成新版本，不盖掉之后的修改；项目里恢复时，跟随节取不到当时内容就覆盖还原 |
| ROLE-05 | 取值：本次 → 项目 → 个人 → 助理；项目显式选助理与沿用可区分；个人工作从个人层开始 |
| ROLE-06 | 项目默认的成员或原件停用：新任务由助理做、带 `stopped_project_default`，不退到个人默认；项目配置保留 |
| ROLE-07 | 任务固定开始时的版本；之后原件、成员改版、停用都不改这件任务；另选从下一轮起 |
| ROLE-08 | 固定版本被移出或删除：这一轮停下说明原因，不换版本；能力被撤同样停下 |
| ROLE-09 | 个人工作能用角色（取我的默认），不再被拒 |
| ROLE-10 | 改一个项目的成员，不改别的项目与原件；同一原件在两个项目的成员各自独立（ONB-17） |
| ROLE-11 | 别的项目或别人的成员、版本引用一律拒绝（`S-character-role-scope`）；选角色不扩权：超出执行方式的工具在选择时就标不能选、开始时拒绝 |
| ROLE-12 | 模板采用：新建与复用、同请求重放原回执、复用使原创建者的解除凭据失效、并发解除与复用只有一个成功（RSC-C03 运行时部分） |
| ROLE-13 | 一次 `roles.list` 给出选择器与设置页要的全部；开始任务只一次 `roles.resolve`（调用次数） |
| ROLE-14 | [界面] 选择器、项目设置、全局设置、抽屉照方案 C 定样，三宽、中英、深浅，键盘与焦点照 README 的焦点规则；本人看实物验收 |
