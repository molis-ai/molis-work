# 第 44 批第 1 项：合同去插件化，合同设计稿

状态：设计稿第 5 版，2026-11-17，评审通过（第 5 轮，附 3 处文字已改）。第 1～3 版经 Opus 5.5 high 评审均为「需改后再审」（11 条、6 条、5 条、4 条，见第 8 节逐条去向；第 3、4 轮只剩 2.5 节）；本版评审通过后提交到本批分支，合同代码叠在后面（`batch-runbook.md` 第四节「合同怎么走」）。范围来自本批文件第 1 项、需求书第 5.2 节（C1～C8）与平台能力审查分给 44-1 的第 1、2、9 项；验收编号 PEQ-04、PEQ-05，另加本稿的核对编号 CD-01～CD-03（第 7 节）。存量怎么搬已由用户在 `docs/system/CONTRACT-CHANGES.md`「第 44 批存量搬迁」D1～D4 定下，本稿不重复。

## 0. 版本与影响的规矩

- 首个外部安装之前是合同阶段一（`CONTRACT-CHANGES.md` 第 3 节第 3 条）：动作、Manifest、MCP 工具名、宿主 API **按现行版本改，版本号留 1**，形状变化写进 `pnpm actions:update`／`pnpm api:update` 的快照差异和 PR 的「对调用方的影响」一栏。`scripts/gates/initial-versions.mjs` 也要求动作版本恒为 1。本稿里出现的新动作一律 `@1`。
- 工作流内容协议号（`protocol.workflow-content*`）同样留 1；`workflow-content.ts` 第 28 行「改形状就升号」的注释改成阶段一的说法。
- 持久化的库与带版本文件按第 3 节第 4 条升版本、带连续升级与金样：项目库 4→5、Goals 库 v6、放置库 1→2（D1、D2，已实现）；上手旅程库 1→2（2.5 节，D5，用户 2026-11-17 确认）。同步改：`pnpm schemas:update`；`docs/releases/CHECKLIST.md` 第 3 节的库版本表（`:44` 项目库、`:69` 放置库）；`CONTRACT-CHANGES.md` 的库版本登记行。

## 1. 对象引用（审查第 2 项「接」，C2、C4、C6）

**一条规则。** 动作的输入输出与声明里，「某插件的某个对象」一律写 32-2 的 `ActionSubject { kind, id }`，不写插件名；主人是这个项目动作目录里声明了该 `kind` 读取器的插件，一个项目里一个 `kind` 只认一个主人，两个就拒绝并点名（`findSubjectReader`、`placement.relation_ambiguous`）。**落盘后要比目录活得久的记录**（账本的边、存下来的情境焦点）另存 `plugin_id`：插件换了、停了，记录仍精确指向原主人；读取时只拿它做精确比对，不拿它去找提供方。D1 改账本 `ObjectRef` 的理由（同一种类可能先后有两个主人）就是这一条。

| 处 | 原来 | 改成 |
| --- | --- | --- |
| 主体上下文 `ActionSubjectContext`（C2） | `goal_ids?: string[]` | `attached_to?: ActionSubject[]`：主人自己把它挂到的对象，最多 100 个，去重（已实现） |
| 情境焦点 `SurfaceFocus`（C4） | `goal?: { id, title, state }` | `belongs_to?: { plugin_id, kind, id, title, state?, noun?, noun_text? }`：落盘的焦点，按上面的规则带 `plugin_id`；kernel 的提示写「【所属对象】{noun} · {title}」（已实现，补 `noun_text`） |
| 片段动作 `FragmentOfferChoice`（C4） | `requires: "goal"` | `belongs_to?: string[]`：要求所属对象是这些 kind 之一（已实现） |
| 账本 `ObjectRef`（C6） | `module: "goals" \| "feed" \| …` | 插件对象一律 `module: "plugins"`，带 `plugin_id` 与 `object_type`，精确匹配（已实现） |
| 同步分段（C6） | 平台分段 `goal-context` | `relation-edges`（已实现） |
| 内容站 `WorkflowItemRef`（审查第 2 项列过） | `{ plugin, item_id, title }` | `{ subject: ActionSubject, title }` |
| 内容站载荷 `WorkflowPayload` | `feed_item_id?: string \| null` | 删；来源写 `source_ref?: ActionSubject` |

`feed_item_id` 的消费者一并改：`workflows/src/handoff.ts:75`、`workflows/src/model.ts:355,381`、`feed/src/out-rules.ts:181`，以及 Pages、Jelly、Inbox、灵光 `content-actions.ts` 回填 `null` 的地方。工作流已存的实例里若存了这个字段：先查 workflows 库的存量形状；存了就按「合同只认现行取值」处理——形状变化写进 PR 影响栏，旧实例由使用者重新选择（`CONTRACT-CHANGES.md` 第 3 节第 3 条），不加读取兜底。核对结果写进 PR。

打开对象一律经 `objectLink()`／`objects.open@1`（32-2），本项新写的地方不再手拼 `?openPlugin=`。

## 2. 「能接收什么」与「能新建什么」只声明一处（审查第 1、9 项，C1）

`packages/contracts/src/platform/item-intake.ts` 是唯一的落点声明，挂在提供方自己的动作上：`intake` 建新对象，`attach` 放进已有对象。本项给它补「收什么」（材料种类）、「挂到…」（`attach.relation`）和「起步」（`intake.start`），再把散在各处的近义声明收进来。

### 2.1 材料种类，分两类

`intake` 与 `attach` 增加 `accepts?: readonly ItemMaterial[]`。省略等于 `[{ kind: "text" }]`（今天的行为）；`accepts: []` 表示**不带材料也能建**（空白新建）。

| 类 | 种类 | 谁送来 | 输入输出 | 出入口 |
| --- | --- | --- | --- | --- |
| 手里的 | `text` | 人选中的文字 | 提供方自定，`material_field`／`prepare` 照旧 | 浮条、「✦」 |
| 手里的 | `object { item_kinds? }` | 人选中的别的对象（按引用） | 由平台固定（2.2 节） | 只经「挂到…」 |
| 手里的 | `artifact { artifact_types: [{ artifact_type_id, schema_version }], file?: ArtifactFileDeclaration }` | 人在成果库点「从这一版继续」 | 由平台固定（`defineArtifactContinueAction`，不变） | 成果库的「继续」 |
| 平台送的 | `handoff` | 工作流把内容交过来 | 由平台固定（内容站 `receive` 的输入输出） | 无 |
| 平台送的 | `notification` | 平台的通知服务 | 由平台固定（`PluginNotificationDelivery` → `…DeliveryReceipt`） | 无 |
| 平台送的 | `code_root` | 上手引导 | 由平台固定（`ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA`） | 无 |
| 平台送的 | `documents` | 上手引导（2.5 节） | 由平台固定（新） | 无 |
| 平台送的 | `drafts { get, apply }` | 上手引导（2.5 节） | 由平台固定（新） | 无 |

类型拆成联合：`ActionIntake = PersonIntake | DeliveredIntake`。`PersonIntake` 即今天的 `ActionIntake` 加 `accepts`、`start`（`title`、`verb`、`describe`、`examples` 照旧必填，`accepts: []` 时 `examples` 可空）；`DeliveredIntake` 只有 `intake_id`、`item_kind`、`accepts`。`ITEM_DECLARATION_LIMITS.id` 由 40 放到 50，容下平台生成的 `<站>.receive`／`<站>.create`（站点 id 最长 41）。

SDK 在登记时检查（`plugin-sdk/src/source-declarations.ts`）：

- 一份声明的 `accepts` 只含一类；「平台送的」一份只收一种。
- 「平台送的」声明不得写 `title`、`verb`、`describe`、`examples`、`start`、`material_field`、`prepare`、`places`（它不产生给人点的入口；选择承接方时显示插件名），动作的输入输出必须与该种类的平台形状逐字一致（与挂接部分同一个比对函数）。
- `object`、`artifact` 不得写 `material_field`、`prepare`；`artifact` 的动作必须是 `defineArtifactContinueAction` 的形状。
- `accepts: []` 时 `examples` 可以为空；`accepts` 含 `text` 时 `examples` 至少一句（今天的规则）。
- `drafts` 的三个动作必须是 Home 级（`scope: "home"`），项目里可达（今天 Todo 的整理动作就是这样，`todo/src/organize-actions.ts:49`）：起草在项目建成之前就经 Home 动作跑。`documents` 的动作必须是项目级。

**按 id 直呼也要拒。** 页面可以按 `intake_id` 直接起草（`contextual-request.ts:126` 的 `readEntry` → `contextual-draft.ts:22-43`、`contextual-create.ts:48`）。宿主在这条路上只接受收 `text` 的 `PersonIntake`；点名平台送的或空白 intake 时拒绝（`actions.input_invalid`），CD-02 有测试。

kernel 的情境候选（`kernel/src/contextual/destinations.ts`）只取收 `text` 的声明，与今天相同。

**不收进来的两种，理由：** `artifacts.links` 是插件自己写的关联种类（「被谁引用」的边），平台不往插件里送东西，不是落点；`process_items.consumes` 是插件自己去读别人记的过程项，同样没有平台送达。两者留在 Manifest 原处。

### 2.2 挂到…（C1）：`attach.relation`

「挂到…」就是收 `object` 材料、由目标的主人记成一条关系的 `attach`。声明它的动作本身是「挂上」；`attach` 增加：

```ts
relation?: {
  readonly noun: string;                  // 人读的对方名词，也是语言文件没有这句时的原文：「Goal」
  readonly noun_text?: TextRef;           // 对方名词的语言键
  readonly list: ActionReference;         // 一个对象此刻挂在哪些目标上
  readonly release: ActionReference;      // 取下一条
  readonly candidates?: ActionReference;  // 这里可以挂的目标，分页
  readonly create?: ActionReference;      // 「建成…」：用一段内容新建一个目标
}
```

形状沿用已实现代码的名字（`target_*`、类型 `molis.placement.attach.v1.<part>.input|output`），第 1 版稿里的 `item_*` 不用：

| 部分 | 输入 | 输出 |
| --- | --- | --- |
| 挂上（声明 `attach` 的动作） | `{ target_id, subject, title, read_revision? }` | `{ binding: { binding_id } }` |
| `list` | `{ subject }` | `{ bindings: [{ binding_id, target_id, created_at }] }` |
| `release` | `{ target_id, binding_id }` | `{ released }` |
| `candidates` | `{ limit?, after_cursor? }` | `{ targets: [{ id, title }], next_cursor }` |
| `create` | `{ title, body, source, idempotency_key }` | `{ target: { id } }` |

SDK 检查：带 `relation` 的 `attach` 必须 `accepts: [{ kind: "object" }]`（可带 `item_kinds`），不得写 `material_field`、`positions`、`prepare`、`places`；`relation` 引用的每个部分都必须是**同一份 Manifest** 里的动作，输入输出与上表的平台形状逐字一致。`item_kind` 必须是本插件有读取器的种类（今天的规则）。

放置服务（`horizontal/placement`）只读这份声明：可挂的种类 = 声明了 `relation` 的 `attach.item_kind`；同一项目里一个种类只能有一个主人。线上合同（版本都留 1）：`placement.goals`、`placement.goal.bind` 删，换成 `placement.attach.targets@1`（按种类分组列可挂目标）、`placement.attach@1`（`target: { kind, id }`）；`placement.create@1` 的 `goal_id` 换成 `attach_to?: { kind, id }`、`goal_key` 换成 `attached_key`；`placement.convert@1` 的 `{ goal: true }` 换成 `{ attach_kind }`，结果带 `noun`；`placement.describe@1` 的关联类型 `goal` 换成 `attached`，对端是 `{ kind: "attached", project_id, object: { kind, id }, noun, title }`。工作台「关联到 Goal…」改「挂到…」，DOM 事件 `molis:placement-convert` 的 `goal` 换成 `attach_kind`。「建成…」只读 `relation.create`，2.4 节的新建入口不读它，所以不是两份声明。

`placement_relation` 这个 Action 字段删掉。它的另一个用户是后台任务的 `serves` 关系，那不是「挂到…」：改名 `task_serves: { role, target? }`，只由 `defineTaskServesAction` 写；读它的地方一并改：`horizontal/mainline/src/index.ts:309-312`、`apps/local-host/src/assistant/assistant-line-actions.ts:47-50` 与测试夹具 `tests/fixtures/home-background-plugin.ts`。另两处读挂接部分的消费者改读 `attach.relation`：`apps/local-host/src/assistant/assistant-material-scan.ts:72`、`plugin-sdk/src/source-declarations.ts:163-203`。

Goals 的「挂到 Goal」：`goals.attach.bind@1` 声明 `attach { attach_id: "goal", item_kind: "goal", title, verb, describe, accepts: [{ kind: "object" }], relation: { noun: "Goal", noun_text, list, release, candidates, create } }`；五个部分按平台形状写，内部转给 Goals 原有的输入绑定、目录与创建处理（已实现，`plugins/native/goals/src/attach-actions.ts`），Goals 自己的 `goals.inputs.*`、`goals.list`、`goals.create` 不变。

### 2.3 其余几种并过来

| 原来的声明 | 并到 | 消费方改成 |
| --- | --- | --- |
| 内容站 `receive` 角色（8 个插件） | `defineWorkflowContentActions` 生成 `receive` 时同时写 `intake { intake_id: "<站>.receive", item_kind: subject_kind, accepts: [{ kind: "handoff" }] }`；作者仍只声明站点一次 | 工作流仍按站点 id 调四个角色（协议留着）；「交给…」类消费者（44-5、53-2、64-2）读 `handoff` 落点 |
| 内容站 `create` 角色 + 视图 `creates` | 站点 spec 的 `create` 取 `true`（只给工作流，不进新建列表：灵光，`lingguang/content-actions.ts:4`）或 `{ title, title_text }`（原视图 `creates` 的词，进新建列表：Pages、Form、Dataset、PPT）；只有后一种生成的 `create` 角色动作带 `intake { intake_id: "<站>.create", item_kind: subject_kind, title, verb, describe, accepts: [], examples: [] }`；视图 `creates` 删 | `creatableKinds` 读站点 `create` 角色上的空白 intake，仍是今天那四家（RAC-78）；`placement.create` 仍按 `station` 调（不变） |
| `onboarding.takes` | 承接动作上的 `intake { accepts: [{ kind: "code_root" }] }`（及 2.5 节的 `documents`、`drafts`）；Manifest `onboarding` 删 | `onboardingTakers(kind)` 读 intake |
| `notifications.receive` | 接收动作上的 `intake { accepts: [{ kind: "notification" }] }`；Manifest `notifications` 删；一个项目仍只认一个，两个就拒绝 | 平台通知服务按种类找 |
| `artifacts.consumes[].continue`／`file`、`produces[].continue` | 「继续」动作上的 `intake { accepts: [{ kind: "artifact", artifact_types, file? }] }`，`stored_text` 随 `file` 带过来；`consumes`／`produces` 只留类型清单 | `artifact-type-registry.ts:31-48,196` 按 intake 列「继续」方与可读文件 |

### 2.4 能新建什么、起步在哪（审查第 9 项）

`intake` 增加可选的 `start`，承接视图 `start` 与概况 `start` 的全部字段：

```ts
start?: {
  readonly title: string; readonly title_text?: TextRef;   // 起点的名字（原文与语言键，同今天的视图 start）
  readonly hint: string;  readonly hint_text?: TextRef;    // 一句提示
  readonly icon?: string;                                  // 省略用视图的图标
  readonly open?: PresentationStartForm;                   // 选中时打开本插件舞台上的表单，不直接调用
}
```

视图的 `creates`、`start` 两个字段删掉；概况声明的 `start` 留着「最多 3 个、概况动作从中挑」的语义，但每一项必须指向带 `intake.start` 的本插件动作，`open` 从那里取（`PresentationOverviewDeclaration.start` 改为 `{ capability_id, version }[]`）。概况动作输出里的 `start`（`presentation.ts:98,108`、`horizontal/surfaces/src/home.ts:117`）形状不变，仍是动作引用。

**各入口读哪类声明：**

| 入口 | 读 | 今天读 |
| --- | --- | --- |
| 浮条候选 | 收 `text` 的 intake 与 attach | 同（`destinations.ts`） |
| 插件页的「✦ 一句话新建」 | 收 `text`、有 `examples` 的 intake | 同 |
| 首页起点 `homeStarts` | 带 `start` 的 intake，按视图顺序 | 视图 `start`；**今天产品里没有调用方**（只有导出与测试，第 15 批记为 `BL-home-exports-cleanup`），改后仍不出可见入口 |
| 概况的「从哪开始」`startsFor` | 概况声明 `start` 指向的 intake 的 `start` | 概况声明 `start` |
| 「从目标新建…」`creatableKinds` | 站点 `create` 角色上的空白 intake | 视图 `creates` |
| 「挂到…」「建成…」 | 带 `relation` 的 attach | `placement_relation` |
| 成果库「从这一版继续」 | 收 `artifact` 的 intake | `artifacts.*.continue`、`file` |
| 上手承接方 | 收 `code_root`／`documents`／`drafts` 的 intake | `onboarding.takes`、写死 Todo/Pages |
| 页面按 `intake_id` 直接起草 | 只认收 `text` 的 `PersonIntake`，其余拒绝 | 任何 intake |
| 通知接收方 | 收 `notification` 的 intake | `notifications.receive` |
| 工作流「交给…」 | 收 `handoff` 的 intake | 内容站 `receive` |

一个入口只读一类，所以同一插件的空白 intake、文字 intake 不会在同一处重复出现；空白 intake 不收 `text`，不进浮条。

**迁移（入口一一对应、不增不减，用 CD-01 核对）：**

- Goals：视图 `start` 与概况 `start`（`manifest.ts:120`、`presentation.ts:26`）合成 `goals.create` 上的一个 `intake { intake_id: "goal", accepts: [], start: { …, open: { view_id: "stage", panel: "create-dialog" } } }`；首页起点与概况读同一个。
- 灵光、Pages：视图 `start` 搬到各自已有的文字 intake（`lingguang/actions.ts:43`、`pages/actions.ts:94`）的 `start`。今天没有可见入口读视图 `start`，搬过去后同样只有 `homeStarts`（无产品调用方）读它，用户看不到变化。
- Coding：概况 `start` 指向的动作补 `intake { accepts: [], start }`，词取今天概况起点显示的词。
- Dataset、Form、PPT、Pages：视图 `creates` 搬到站点 spec 的 `create: { title, title_text }`。

### 2.5 上手承接（审查第 1 项分来的，12-2 的收尾）

上手引导今天写死两家：Pages（每份材料与摘要存成文档，`context-onboarding-adopt.ts`）与 Todo（抽取→读取→应用三步出待办草稿，`context-onboarding-service.ts:596-657,773-785`）。改成两种平台送的材料，宿主按声明找承接方，不再点名。**目标是今天的行为一样不少**；有意的变化只有第 7 节 CD-01 列的那几条。

**`documents`：把材料存成文档。** 动作必须是项目级（今天导入就在新项目的客户端里调，`service.ts:719-721`）。每份材料（以及最后的摘要）调用一次：

- 输入 `{ request_id, request_hash, title, markdown }`。`markdown` 可以是空串（空白开始的摘要，`adopt.ts:135`）；上限是合同常量 `ONBOARDING_DOCUMENT_TEXT_MAX`，取上手读取单份材料的上限（实现时以 staging 的读取上限为准），今天读得进来的材料都交得出去。今天宿主按 40 万字切分、正文 JSON 超过 1,400,000 再对半切（`adopt.ts:15-16,47`），这些切分搬进承接方。
- 输出 `{ parts: [{ subject: ActionSubject, open: { surface, id, title } }] }`：一份材料可能存成几份文档。`open` 带标题，摘要里来源的链接与落地页照旧带标题（今天的 `openTitle`，`adopt.ts:122`、`context-onboarding.ts:524`）。
- 分段标题由承接方出；Pages 的语言文件沿用今天宿主那句的原文（「· 第 k/n 部分」，`adopt.ts:37` 的 `part-k-n`），界面一样。
- **续跑：照今天的键与摘要原样复刻。** Pages 的导入按 `(project_id, request_id)` 认重放，`request_hash` 不同就报 `pages.unavailable(changed)`（`pages/src/store.ts:135-150`，`page_imports` 主键，`database.ts:32`）。所以：
  - 段的 id 与今天逐字相同：只有一段时用宿主给的 `request_id` 本身，分段才加 `:k`（`adopt.ts:109`）；切分是确定的，Pages 事先知道段数。
  - 每段的 `request_hash` 是宿主给的那个，**原样转交**，不拿正文另算（markdown 转换一变就会撞 `changed`）。宿主照旧给旅程 id（`adopt.ts:110`）。
  - 摘要文档的 `request_hash` 算法逐字不变：对 `{ title, body, blank, todo_selected }` 做 JSON 取 sha256（`adopt.ts:126-131`），键名仍写 `todo_selected`（值取 `adoption.keep`）。这是已存导入记录的冻结输入，改了键名，迁移过来的「采用中」「采用失败」旅程重试就会永远报 `changed`。代码里就地注明。
  - 宿主照旧每份材料一个 `request_id`（`<旅程>:sources:<标签>`、`<旅程>:summary`），记下 `parts` 才算这份做完；断在「Pages 已导入、旅程还没记下」之间的，重试按上面相同的键拿回原文档，不会多一份。

**`drafts { get, keep }`：从材料起草、给人确认。** 三个动作都由平台定形状，都必须是 Home 级、项目里可达（今天 Todo 的整理动作就是这样，`todo/src/organize-actions.ts:49`；起草在项目建成之前就经 Home 动作跑）。

- **Todo 新增三个动作，不改原有的。** `todo.organize.extract/get/apply` 还给 Todo 自己的页面、助理、agent、mcp 用（观众 `user`、`agent`、`workflow`、`mcp`，`organize-actions.ts:49-50`），形状不动。新增 `todo.onboarding.draft`、`todo.onboarding.get`、`todo.onboarding.keep`，共用 `TodoOrganizer`，**并与原动作共用同一套请求键** `todoRequestKey(actor, project, request_id)`（`store-types.ts:49-51`，键里不含动作 id），所以同一个 `request_id` 不论从哪个动作来都是同一批。
- 起草：`{ origin: "onboarding", title, request_id, materials: [{ title, text }] }`，最多 50 份 → `{ batch }`。每份 `text` 的上限是合同常量 `ONBOARDING_DRAFT_PART_CHARS = 60_000`（今天钉在 Todo 自己的数上，`service.ts:597-598`）；宿主照旧按它分段、50 份一批、按 `request_id` 续跑，承接方据此声明自己读得下。
- `get`：`{ ids }`（最多 50 个，批次更多时按段调用）→ `{ batches }`。`keep`：`{ id, expected_revision, keep: candidate_id[] }`（每次最多 80 条）→ `{ batch }`。**重试安全：** 采用时先 `get(ids)` 取各批最新的 `revision`（今天 `service.ts:779`），分段 `keep` 时逐段沿用上一段返回的 `revision`（`:782-783`），不用快照里起草那一刻的 `revision`；Todo 的 `keep` 遇到已决定的候选跳过、不报错（今天宿主在 `:780` 跳过）。采用到一半失败的旅程重试时不会撞版本冲突。留哪些由人定；怎样落（新建、合并、更新、完成、重开）由 Todo 的 `keep` 自己按今天宿主那张表（`same→merge` 等，`service.ts:775`）做，这张表搬进 Todo，这些词不进平台合同。
- 批次 `OnboardingDraftBatch`：

```ts
{ batch_id, revision,
  notes: TextRef[],                // 起草时的说明
  reference_only: number,          // 只供参考、不列成草稿的条数
  candidates: [{ candidate_id, title,
    selected: boolean,             // 默认勾上（Todo 已存，organize.ts:148；遇到冲突时改写，:93）
    label: { text: TextRef, state: StateWord },   // 今天的四种状态签，语气走平台词表
    meta: TextRef[],               // 最多 4 句：截止（日期用 TextRef 的 date 参数，get 时现算，不入库）、等谁、负责人不明、与已有一条相关
    evidence?: string,             // 原文摘一句，最多 500 字
    decision: { item_id: string | null } | null }] }
```

  Todo 由已存的批次换算（`kind`→`label`、`due_date`/`due_phrase`→`meta`、`evidence[0].excerpt`→`evidence`、`reference_only` 取长度）。`notes` 与材料的 `note` 今天是起草时拼好的中文、存在 todo.db 的 `body_json`（`organize.ts:119,150-155`），所以给 `{ literal }`（TextRef 支持，`ui-text.ts:21-23`）；改存语言键是 Todo 库的结构变化，本项不做。四种状态签：Todo 的语言文件沿用今天工作台那四句的原文与语气（`context-onboarding.ts:321` 的 `workbench.context-onboarding.todo-*`），界面一样，工作台那四个键删掉；工作台词包因此变小、摘要改变，在 PR 的页面资源说明里列出（第 15 批 `BL-home-exports-cleanup` 的前例，`batches/15.md:151`）。
- **词怎么到上手页。** 照首页的受保护词授权（surface-composition §14.6）：旅程接口返回批次时，宿主按批次里实际用到的键给承接方发词授权（Home 级，requester 为 null，同 `surface-home-text.ts:63` → `pages.grantText`，`plugin-page-authority.ts:275-285`）；上手页带 `surface_text=<授权 id>` 取语言包（`web-ui-locales.ts:20-45`），装进本页的读词器（`installLanguageText`），换语言时由 `retext` 重排。授权要求承接方有在运行的激活：Todo 是 Home 级，起草时已在运行。
- **旅程存平台形状的快照。** 起草返回的 `OnboardingDraftBatch` 原样存进旅程（平台形状，不再是 Todo 私有的），页面看到的仍是起草那一刻的快照，与今天相同（不改成读 Todo 的 `live()`，那会因冲突改写 `selected`、让在 Todo 里处理过的候选消失）。读材料时的轮询只用批次个数（页面 `context-onboarding.ts:293-298`，服务 `draftTodos` 的续跑点 `service.ts:637-650`），不调 `get`。
- **`get` 收 `ids[]`。** 只给两处用：第 1 版迁移过来、快照为空的批次（见下面的 D5），和采用时补齐。补取只放在旅程接口与采用的异步层，`readContextJourney` 是同步的、16 处调用（`service.ts:77-78`），不碰它。采用开头校验勾选（`service.ts:684-686` 的 `drafted`）照旧用快照里的候选 id；快照为空的批次先在 Home 级 `get` 一次（同上，不落盘），失败就把这一批的勾选原样留着，到 `keep` 那步再失败，与今天「到 `adoptTodoDrafts` 才失败」相同。

**谁来承接、什么时候选、没有时怎样：**

| 种类 | 只有一个承接方 | 有几个 | 装进新项目 | 一个都没有 |
| --- | --- | --- | --- | --- |
| `drafts` | 自动用它（今天总是 Todo） | 选来源那一步出单选组：起草在读材料时就开始，必须先选定 | 不装：承接方是 Home 级（今天 Todo 是个人注册，不加进项目） | 草稿区说「没有能起草的插件」，其余照常（今天：起草失败，页面说原因，`service.ts:639-657`、页面 `:328`） |
| `documents` | 自动用它（今天总是 Pages） | 起名那一步出单选组 | 装（今天写死装 Pages） | 采用前就说「没有能保存文档的插件」，不建项目（今天：采用走到一半失败，`adopt.ts:62-73`） |
| `code_root` | **默认不选**，人自己勾（ONB-44，`context-onboarding-take.ts:3-5`） | 单选组，默认不选 | 选了才装（今天如此） | 不出这一项（今天如此） |

今天内置的只各有一个承接方，所以单选组不会出现。落地页（`projectLocation()`，`context-onboarding.ts:520-525`）：交了代码文件夹去承接方打开的地方；留了草稿去 `drafts` 承接方的页面（它导航视图的 surface）；否则去 `documents` 返回的工作摘要的 `open`。一次最多交 30 份材料的种类（`code_root`）超出时，页面按 `take_result.materials`／`of` 说出「交了前 30 份，共 N 份」。`personal` 注册的排除已去掉（`onboarding-takers.ts:18-21`），本项不再改。

**存着的旅程（D5，用户 2026-11-17 确认升 1→2；下列「保留」做法是评审后的修订，用户同日再确认）。** 旅程库 `database.context_onboarding_baseline`（第 1 版，`context-onboarding-store.ts:155`）的正文 JSON 存着 `todo`（Todo 批次的原样）、`adoption.todo_selected`、`document_id`、每份材料的 `documents: string[]`。升第 2 版，1→2 一步：

- `todo` → `drafts { plugin_id, status, key, batches: [{ batch_id, snapshot: OnboardingDraftBatch | null }], total, error, added?, timing }`：Todo 私有形状的批次正文换算不了，`snapshot` 置空，只留 `batch_id`（Todo 按 id 读得回，候选 id 不变）；旅程接口读到空快照时按 id 调 `get`，**只填进响应、不落盘**（旅程是整份正文覆盖着存的，读路径写回会冲掉采用任务并发写的 `phase`、`adoption`、`parts`，`service.ts:696-735`）；采用路径本来就自己 `get`。
- `adoption.todo_selected` → `adoption.keep`，**原样保留**：它只在点了「采用」之后才存（`service.ts:684-690`），重试时 `adoption ??=` 不再收新输入，删了就会在重试时悄悄不建那些已勾的待办。还没采用的旅程，勾选只在页面内存里，没有可丢的。
- `document_id` → `summary_open { surface, id, title }`，每份材料的 `documents` → `parts`：补 `documents` 承接方的 surface 与对象种类（即 Pages 的；这一步只认第 1 版的事实，与 D2 认 Goals 同理）。
- 遇到第 1 版不该有的形状就拒绝升级、旅程库保留。同步改 `docs/releases/CHECKLIST.md:73` 与库版本登记行；金样补一份第 1 版旅程库，含一个做到一半（已起草、未采用）和一个采用失败（已勾选）的旅程。

## 3. 其他点名（C3、C5、C7、C8 与 `agent-inputs`）

- **C3 记忆**：`applies` 的通用引用与场景已随 31-2 落地；本项只收尾仍按 `io.molis.work.goals` 筛记忆的消费者（`memory-host.ts`、工作台 `settings-memory.ts`、`assistant-memory-bridge.ts`），改按对象读取器所属插件。
- **C5 外壳的 `goal-*` DOM 事件**（`dom-events.ts:122-148,255-267`）：发出者是外壳里替 Goals 画界面的代码，第 6 项（H4）整块删掉；在本项删会让 Goals 页面在替代落地前先坏掉。**改批次文件**：C5 与 PEQ-04 中「`dom-events` 无 Goal 事件」这一检查点从第 1 项移到第 6 项（按手册第六节记下并在 PR 说明）。
- **PEQ-04 的 `coding`**：按 D4，`skills.ts:93,141` 的 `coding` 是调用情境给的通用类别，不算点名插件，检查脚本把它列为已定例外并注明 D4。
- **C7 接续摘要**：新声明 `defineResumeSummaryAction(capabilityId, version, title, permissions)`，输入 `{ focus?: ActionSubject }`，输出 `{ title, focus: ResumeItem | null, next: ResumeItem[] }`（`ResumeItem = { subject, title, next_hint, status_label, open: { surface, id } }`，`open` 与主体上下文的 `open` 同形；MCP 用 `objectLink` 逐条生成地址。`objectLinkTemplate` 只收 `ObjectLinkPlace`、不收对象引用（`object-link.ts:23`），不用它）。前置：`MolisWorkRuntimeContextHost` 的 `focusId: string`（今天被当成 goal id，`context-presentation.ts:47-50`）改为 `focus?: ActionSubject`。MCP 的项目连接工具汇总项目里所有声明了它的插件，按插件分节；`goal_url_template`、`next_goals` 与 `buildMcpResumeView` 搬进 Goals 的这个动作。**影响栏**：`buildMcpResumeView` 是 `apps/mcp/src/index.ts:9` 的公开导出，删；MCP 输出的 `goal_url_template`、`next_goals` 变成按插件分节的 `sections[]`。
- **C8 等你**：类型与原因由主人在 Manifest 的 `attention` 申报（已实现，D3）。
- **`agent-inputs` 的 `targets`：已核实，不改。** `{ kind: "todo" }` 是 Prologue S4 `acknowledge-inputs` 的运行时目标词（`board-node`、`todo`、`pending`，`specs/ai-input-receipts/handoff-records.md:56`），指「这一轮的待办」，`prologue-inputs.ts:42` 原样转交 SDK 给的值，不是 Todo 插件。本项在 `agent-inputs.ts:148` 补一句注释写明，并改批次文件第 1 项那一行的说法。
- **设置节**：接 38-1 的 `settings_entries`，不另定声明（审查第 5 项「接」）。
- **可信决定入口**：消费 39-2 的平台决定服务，Goals 不再自己出受保护决定入口。

## 4. Goals 公开合同收窄

规则：**只去掉没有别的插件在用的动作上的 `plugin` 观众**；`user`、`agent`、`mcp`、`workflow` 一律不动（外部 Runtime 的行为不变）。别的插件今天在用的动作留在 Goals 的公开合同里——插件同等待遇下，任何插件都可以公开动作给别人调；按 `provider_id` 钉死 Goals 的写法属于审查第 10 项，由 44-5 改按角色发现。

| 调用方 | 动作 | 去向 |
| --- | --- | --- |
| Coding `goals-actions.ts:19-23` | `goals.list`、`goals.contract.read`、`goals.state.read`、`goals.progress.record`、`goals.progress.receipt` | 留（`progress.record` 是写操作，通用引用代替不了）；Coding 改用 1 节引用的部分随第 6 项 |
| Feed `goal-promotion.ts:12-14`、`item-actions.ts:14-16` | `goals.directory.read`、`goals.create`、`goals.inputs.confirm` | 留；钉提供方改按角色发现在 44-5 |
| Feed `runtime-actions.ts:80`、`query-actions.ts:62`；Inbox `actions.ts:46` | `goals.contract.read` | 留；同上 |
| Pages `browser/menus.ts:105`、`browser/context.ts:43-44`（`GOALS_PROVIDER`）与 Manifest `consumes` | `goals.collection.read` 等 | 留（页面以人的身份调用，观众 `user`，`plugin-page-actions.ts:56`） |
| Feed `store/items/goal-links.ts:11`（`GOALS_OWNER`） | 按主人认 Goal 的边 | 留；同上 |
| 挂接（2.2 节） | `goals.attach.*` | 新增，公开 |
| 平台；Coding `manifest.ts:91` | 主体读取、搜索条目、呈现、接续摘要 | 留 |
| 其余（树、规划、配置、终端等） | — | 去掉 `plugin` 观众 |

收窄后由测试列出「Goals 带 `plugin` 观众的动作」清单并与上表比对。

**本节不动、交给第 6 项（PEQ-01）的：** 这几个插件把 Goals 写成必需的声明——Feed `permissions.ts:16-17` 与 `item-actions.ts:47` 的 `required_actions`、Coding `manifest.ts:67-68,156`、Pages `manifest.ts:58`、Inbox `actions.ts:102,151`。Goals 不在时它们决定这些插件能不能用，第 6 项让 Goals 可移除时一并改成「有就用、没有照常」。

## 5. 示例第三方插件（PEQ-05）

`examples/plugin-sample/` 只用 contracts 与 plugin-sdk，声明：一个设置节（`settings_entries`）、一个接续摘要（3 节）、一个需要可信决定的动作（39-2）、一个带 `relation` 的 `attach`（2.2 节，证明「挂到…」不只给 Goals）、一个带 `start` 的空白 intake（2.4 节）。测试在工作台与 MCP 里各验一次。

## 6. 顺序

1. 已实现（未提交）：C2、C4、C6/D1、C8/D3，项目库 4→5 与 Goals 库 v6，D2 放置库 1→2，C1 的放置部分（过渡写法 `placement_relation` + 类型）。本稿评审后改成 2.2 节的 `attach.relation`、`task_serves` 改名、`noun_text`，金样 0.1.1-dev.6 补挂接边。
2. 1 节内容站引用与 `feed_item_id`；2.1、2.3 的材料种类与收拢；2.4 起步与新建；2.5 上手承接（含引导页单选组与 30 份提示）。
3. 3、4 节；5 节示例插件；批次文件按 3 节两处改写。
4. 每一步：受影响的测试、`api:update`／`actions:update`／`schemas:update`／`versions:generate`、门禁；最后整批共享核心全量。

## 7. 核对编号

- **CD-01 入口一一对应。** 固定夹具（全部内置插件装在一个项目里，另有一个对象焦点与一个落点），在 merge-base 与改后各跑一次，按插件枚举并比对：首页起点（`homeStarts`、`startsFor`）、「✦」的占位句、给定焦点与落点的浮条候选、`creatableKinds`、「挂到…」可挂种类与「建成…」、上手承接方（三种）、通知接收方、成果库「继续」方与可读文件、工作流可交给的站点。上手页另比对两样渲染：草稿区（四种状态签、说明、截止等）与存成文档后的标题、链接。差异只许是下列有意的变化，PR 里逐条列出：上手页的单选组（今天内置的各种材料只有一个承接方，不出现）、超过 30 份的提示、承接方的安装规则（结果与今天相同：装 `documents` 承接方，不装 `drafts` 承接方，`code_root` 选了才装）、没有承接方时的说法（2.5 节表的最后一列）。另加一项：按 `intake_id` 直接起草，改后只接受收 `text` 的 intake。
- **CD-02 SDK 与宿主拒绝。** 2.1、2.2 节列出的每条 SDK 检查、按 id 直呼非文字 intake 的拒绝，各有一个拒绝的测试。
- **CD-03 Goals 收窄。** 第 4 节的清单测试。

## 8. 第 1 版评审意见的去向

| # | 意见 | 去向 |
| --- | --- | --- |
| 1 | 动作版本规则写反 | 0 节；已把 `placement.create/convert/describe` 改回 1 |
| 2 | `agent-inputs` 的 `todo` 不是 Todo | 3 节：不改，补注释，改批次文件 |
| 3 | Goals 收窄漏调用方、观众名写错 | 4 节逐个列去向，只去 `plugin` 观众 |
| 4 | 2.4 接不住消费者 | 2.4 节：`intake.start`、入口表、站点 `create` 即空白 intake、「建成…」只读 `relation.create` |
| 5 | 2.3 丢含义 | 2.1 节分两类、平台定形状、不出入口；2.3 节 `artifact` 带 `file`／`stored_text`；2.5 节上手承接；`links`、`process_items` 不收的理由 |
| 6 | 2.2 与代码对不上 | 2.2 节用代码的名字、补 `noun_text`、列全消费者、SDK 检查 |
| 7 | 第 1 节自相矛盾 | 1 节「一条规则」；`WorkflowItemRef` 并入 |
| 8 | C5 与批次文件不符 | 3 节：移到第 6 项并改批次文件；PEQ-04 的 `coding` 按 D4 |
| 9 | C7 焦点 | 3 节：先改 `MolisWorkRuntimeContextHost`，影响栏 |
| 10 | 现状写错、漏消费者 | 6 节更正；CONTRACT-CHANGES D2 原文同 PR 改；`feed_item_id` 消费者与存量核对在 1 节 |
| 11 | 一一对应无法检查 | 7 节 CD-01 |

### 第 2 版评审意见的去向

| # | 意见 | 去向 |
| --- | --- | --- |
| 1 | `drafts` 装不下 Todo：字段、`apply` 输入、Home 级、选择时机、多装插件、落地页、存着的旅程 | 2.5 节：批次形状定通用字段（`selected`、`label`、`meta`、`evidence`、`notes`、`reference_only`）；`apply` 收 `keep`，怎样落由承接方定；Home 级写进 SDK 检查；`drafts` 在选来源时选定；承接方安装规则表；落地页按承接方；旅程库 1→2（D5，用户已确认）|
| 2 | `documents` 装不下 Pages：上限、分段、续跑、空串 | 2.5 节：每份材料一次，输出 `parts[]`，切分与幂等归承接方，允许空串 |
| 3 | 入口表多出入口、改行为 | 2.3 节站点 `create: true` 不进新建列表（灵光）；`homeStarts` 照实写无调用方；按 id 直呼的拒绝；`code_root` 默认不选；CD-01 改成列出有意变化 |
| 4 | Goals 调用方漏几处、必需声明 | 4 节补齐；必需声明交第 6 项（PEQ-01） |
| 5 | `objectLinkTemplate`、id 长度、联合类型、D2 原文 | 3 节 C7 改用 `open` + `objectLink`；2.1 节 id 上限 50、联合类型；D2 原文同 PR 改 |
| 6 | C5 挪项要告诉用户 | 已在 PR 计划与本轮给用户的说明里写明 |

### 第 3 版评审意见的去向（只剩 2.5 节）

| # | 意见 | 去向 |
| --- | --- | --- |
| 1 | Todo 现有动作给不出这套形状 | Todo 新增 `todo.onboarding.draft/get/keep`，共用 `TodoOrganizer` 与 `todoRequestKey`；换算方式写明；`notes` 给 `{ literal }`，不改 Todo 库；`ONBOARDING_DRAFT_PART_CHARS` 成合同常量 |
| 2 | 上手页没有取插件词的路 | 照首页受保护词授权（§14.6）：旅程接口发授权，页面按 `surface_text` 取包，`retext` 重排 |
| 3 | 迁移不必删、删了会丢已勾选 | D5 改为保留 `batch_id` 与 `keep`；旅程只存批次 id，读时现取 |
| 4 | CD-01 漏可见变化 | 状态签、分段标题由承接方沿用原文；`open` 带标题；没有承接方时的说法进表与 CD-01；Pages 的续跑由导入的幂等按段派生，不加表 |
| 5 | 清单、项目级、上限 | CHECKLIST:73 与登记行、金样两种旅程；`documents` 项目级进 SDK 检查；`ONBOARDING_DOCUMENT_TEXT_MAX` |

### 第 4 版评审意见的去向

| # | 意见 | 去向 |
| --- | --- | --- |
| 1 | 按段幂等会在迁移过来的旅程上出错 | 段 id 与今天逐字相同（单段不加后缀）、`request_hash` 原样转交、摘要 hash 算法与键名冻结 |
| 2 | 读时现取：轮询无碍，采用要改，放在哪层 | 改为存平台形状的快照（页面看到的与今天同为快照）；`get` 收 `ids[]`，只补迁移来的空快照，放在异步层；采用的失败时机不变 |
| 3 | D5 的修订要用户再确认 | 已请用户确认；`CONTRACT-CHANGES.md:97` 随确认结果改 |
| 4 | 删工作台四个键改变词包 | 列进 PR 的页面资源说明 |
