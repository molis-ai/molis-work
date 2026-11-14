# 平台能力通用化审查（2026-11-14）

状态：只读审查报告，2026-11-14。不改代码、不改批次文件；建议的批次归属由主会话写进批次文件。

审查基于 main `9aab01f8e4`，在途批次按[认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743) 当天正文：12、17、19、26、28、33、36、37、39 在途（已认领、实施中或待评审），01～11、13～16、18、20～22、24、25、27、31 已合入，其余未开工。在途批次的分支只读看过 `origin/batch/12`、`origin/batch/17`。

找的是：本该是平台通用能力（或需要一份跨插件设计）的东西，今天在某个插件、宿主私路里单独实现，或在路线书里按一次性做法排着。已排除：第 44 批的 Goals 去特权（`specs/plugin-equal-standing/spec.md` 已列的 C1～C8、H1～H9 与第 4.5 节盘点）、`docs/reviews/adversarial-review-2026-11-01.md` 的 N42～N56、已有批次或待办的条目。批次本身的做法是一次性、而平台能力才对的，照样列出。

## 汇总

| # | 名称 | 严重度 | 建议批次 | 主人 |
| --- | --- | --- | --- | --- |
| 1 | 接收与挂接的声明分成七八套 | 挡后续 | 44-1（合同）；44-5、46-1、53、69-2、75-3 消费 | 合同台：`packages/contracts/src/platform/item-intake.ts` ＋ `packages/kernel` 情境候选 |
| 2 | 对象引用与「打开它」的地址没有一份 | 挡后续 | 32-2（合同子分支）；32-3、53-2、56-1 消费 | 合同台：`packages/contracts` ＋ SDK ＋ 工作台 `return-trips.ts` |
| 3 | 后台工作的状态只有 Coding 报到总表 | 挡后续 | 32-3（线读取合同子分支）；32-1 消费 | 合同台＋宿主：`packages/contracts/src/platform/home-background-tasks.ts`、`apps/local-host/src/home-background-tasks.ts` |
| 4 | 「等你」与提醒有六个来源 | 挡后续 | 32-3（读侧）；56-1（写侧收拢）；53-2 消费 | Attention（`services.attention`）＋合同台 |
| 5 | 设置：`settings_entries` 已定、没人用，各处各写 | 挡后续 | 38-1；44-6 的 H3「设置节」改为消费它 | 合同台＋SDK `settings-declaration.ts`；各主人迁 |
| 6 | 对话附件：助理一条路、Coding 将另开一条 | 挡后续 | 35-2（先做附件合同子分支） | 平台材料服务（`apps/local-host/src/material-*`、`packages/contracts/src/platform/project-materials.ts`、`packages/contracts/src/platform/composer.ts`） |
| 7 | 插件数据分段：同步、资产包、整份导出、业务导出各一份 | 挡后续 | 44-5（段声明）；68-2、73-3、73-4 消费 | 同步合同（`packages/contracts/src/platform/plugin-sync-sections.ts`）＋宿主快照／恢复 |
| 8 | 重复规则：平台调度只有固定间隔 | 挡后续 | 52-1；55-1 消费 | `horizontal/scheduler` ＋ `packages/contracts/src/platform/plugin-scheduler.ts` ＋ SDK |
| 9 | 新建与起步入口的声明有五种 | 挡后续 | 44-1（与第 1 项同一子分支）；45-1、46-1、53-3 消费 | 合同台：`packages/contracts/src/platform/ui.ts`、`packages/contracts/src/platform/item-intake.ts`、`packages/contracts/src/platform/presentation-declaration.ts` |
| 10 | 插件之间点对点钉住提供方，不按角色发现 | 应收 | 44-5 | 各消费方插件（PPT、Shelf、Images、Inbox）；角色协议归合同台 |

批次选择按 `specs/post-anticorruption-roadmap/reference/dependencies.md`：合同先于消费者，只放进未开工的批次。第 1、2、5、7 项的天然位置都已经在 44、32、38 的原文里出现了「按声明」「通用引用」字样，问题是没写清楚用哪一份已有合同、在哪里建，所以各消费批会各自补一份。

## 1. 接收与挂接的声明分成七八套

**证据。** 「这个插件能收什么、收进新对象还是放进已有对象」今天有这些声明，彼此不认识：

- 动作上的 `intake`／`attach`：`packages/contracts/src/platform/item-intake.ts`（Todo、Pages、灵光、Goals 声明，`packages/kernel/src/contextual/destinations.ts:44-48` 只读这一种）。
- 工作流内容站 `receive`／`create`：`packages/contracts/src/platform/workflow-content.ts`，Dataset、Feed、Form、Inbox、Jelly、灵光、Pages、PPT 八个插件都有。载荷里写死了 Feed 的字段 `feed_item_id`（`workflow-content.ts:25`），Pages、Jelly、Inbox、灵光的 `content-actions.ts` 都回填 `feed_item_id: null`。第 44 批 C1～C8 的清单里没有这一处。
- 放置关联 `placement_relation`：`packages/contracts/src/platform/actions.ts:325`、`packages/contracts/src/platform/placement.ts:65`。
- 成果的 `artifacts.consumes[].continue`／`file` 与 `artifacts.links`、过程项 `process_items.consumes`：`packages/contracts/src/platform/plugin-manifest.ts:196-205`。
- 通知接收方 `notifications.receive`：`plugins/native/feed/src/manifest.ts:55`。
- 第 12 批在途新加一种：`origin/batch/12` 的 `specs/coding-harness-optimization/batch12-design.md` §7（提交 `93ca673772`）设计 Manifest `onboarding: { takes: [{ kind: "code_root", … }] }`，与 `intake` 平行。

同一个插件为同一件事声明多次：Pages 有 `intake`（`plugins/native/pages/src/actions.ts:92`）、`attach`（`landing-actions.ts:27`）、内容站 `receive`（`content-actions.ts:34`）、成果库导入 `file`（`manifest.ts:66`）四份；灵光有 `intake`（`actions.ts:43`）和 `receive`（`content-actions.ts:28`）。`specs/context-program/quick-create.md` 第 69 行原定「从内容站 `receive` 派生创建入口」，代码里没有做（`destinations.ts` 不读 `workflow_content`）。

路线书还要再加：第 44 批「交给的执行方从声明了可接收的插件里列」（`specs/plugin-equal-standing/spec.md:168`）、46-1「attach/find 建关联用目标插件声明的关联类型」、53-1「关联类型由对象主人插件声明」（BL-314）、53-2／64-2「挂到…」「交给…」只取声明了可挂接／可接收关系的插件、69-2「作为依据附上」由对象主人声明落点、75-3 其他应用送入 Work。每一批都读「声明了可接收」，但没有一批说是哪一份。

**为什么要通用。** 现有使用者已有 12 个插件；已排的消费者是 44-5、46-1、53-1、53-2、64-2、69-2、75-3 和 12-2。各批照字面做，会再多出三四套声明，第三方作者在第 47 批第一次拿到的就是一堆近义词。

**平台形状。** 以 `item-intake.ts` 为唯一的「落点」声明：`intake`（建新对象）与 `attach`（放进已有对象，带 `relation`，取代 `placement_relation` 与各批要的「关联类型」）；把「收什么」写成一个材料种类表（选中文字、文件按扩展名、某主人某种对象的引用、某个成果类型、代码根目录、通知），内容站 `receive`、成果 `file`、`onboarding.takes`、`notifications.receive` 都改写成它的一种或由它派生；来源统一用第 2 项的对象引用，删 `feed_item_id`。迁移：Pages、灵光、Todo、Goals、Feed、Inbox、Jelly、Dataset、Form、PPT、Coding。

**严重度：挡后续。** **建议批次：44-1**（合同去插件化，本来就在改 placement 与上手承接声明，且须在 47 之前合入）；消费方 44-5、46-1、53、64-2、69-2、75-3 只读这一份。12 在途，不改它的范围；建议 12 的设计稿注明 `onboarding.takes` 是过渡形状，由 44-1 收进 `intake`。

## 2. 对象引用与「打开它」的地址没有一份

**证据。** 指向「某插件的某个对象」至少有六种形状：`ActionSubject {kind,id}`（`packages/contracts/src/platform/action-subjects.ts:29`，第 17 批在途的风险插件用它，`origin/batch/17` 的 `plugins/native/risk/src/model.ts:32`）、`ObjectRef`（`packages/contracts/src/modules/context-ledger.ts:17-34`，`module` 枚举写着 `goals`、`feed`）、`AssistantObjectRef`（`packages/contracts/src/services/assistant.ts:170`）、`WorkflowItemRef`（`packages/contracts/src/platform/workflow-content.ts:27`）、`PluginAttentionSubjectReference`（`packages/contracts/src/platform/plugin-attention.ts:32`）、记忆证据的 `ref`（`packages/contracts/src/services/memory.ts`）。

「打开到哪里」也各写一份：`SearchOpenTarget`（`packages/contracts/src/platform/search-sources.ts:13`）、`HomeOpenTarget`（`packages/contracts/src/platform/home-events.ts:8`）、`ActionSubjectContext.open`、`DueReminder.open`（`packages/contracts/src/platform/due-reminders.ts`）、`ArtifactLinkSubject.open`（`packages/contracts/src/platform/artifact-pins.ts:212`）、动作结果的 `href_template`（`packages/contracts/src/platform/action-result.ts:8`）；插件通知只能带 `open_plugin_id`，打不开对象（`packages/contracts/src/platform/plugin-notifications.ts:10`）。服务端手拼 `?openPlugin=…&openItem=…` 的地方至少 9 处：`apps/local-host/src/context-onboarding-service.ts:506`、`artifact-library-http.ts:78`、`personal-artifact-sync.ts:143`、`personal-project-sync.ts:28`、`plugins/native/feed/src/scenes.ts:30`、`plugins/native/inbox/src/scenes.ts:48`、`plugins/native/pages/src/generate.ts:47`、`plugins/native/goals/src/contract/goal-entry-actions.ts:52`，工作台自己的 `apps/workbench/src/browser/return-trips.ts:172`。`specs/backlog/BL-materials-object-link.md` 就是这种手拼链接对外壳自己的面打不开的一例。

**为什么要通用。** 已排的使用者：32-2「对象挂载用（插件、类型、id）的通用引用」、32-3 节点卡打开对象、44-1 C2 把 `goal_ids` 换成通用引用、53-2「打开到准确位置并高亮」、56-1「唤醒和通知点开经通用打开动作」。五批都假定有一份通用引用和一个通用打开动作，但没有一批负责建；56-1 要的「通用打开动作」今天不存在。

**平台形状。** contracts 定一个对象引用（主人插件、类型、id、可选项目与 revision，`ActionSubject` 扩出来，不另起名）和一个打开目标类型；SDK 给 `objectLink(ref)`，服务端与插件不再手拼查询串；平台动作 `objects.open@1` 按主人的读取器与 `accepts_objects` 声明解析，通知、提醒、搜索、首页事件都带对象引用。其余几种形状在各自主人下一次改合同时并过来（context-ledger 的 `module` 枚举已归 44-1 C6）。

**严重度：挡后续。** **建议批次：32-2**（它第一个要通用引用，按批次文件的粒度建议先做证据合同子分支，把引用与打开目标放在同一子分支）；32-3、44-1、53-2、56-1 消费。

## 3. 后台工作的状态只有 Coding 报到总表

**证据。** 平台已有「插件报自己还在跑或在等人的后台工作」的合同：`packages/contracts/src/platform/home-background-tasks.ts`（动作带 `home_aggregate`，`packages/contracts/src/platform/actions.ts:313`），宿主 `apps/local-host/src/home-background-tasks.ts` 汇总。全仓只有 Coding 报（`plugins/native/coding/src/home-background.ts:44`）。别的后台工作都不在里面：Images 生图（`plugins/native/images/src/service.ts:134` 的 `background.start`）、Feed 拉取（`plugins/native/feed/src/manifest.ts:79` 的 `background.jobs` 与 `wakeups`）、Schedule 定时执行（`plugins/native/schedule/src/manifest.ts:54`）、Alchemist 研究（`plugins/native/alchemist/src/studio/server/services/start-lens-run.ts`）。助理的交办另有自己的任务板（`apps/local-host/src/assistant/assistant-service.ts:153`）。标题栏状态项只能宿主加（`docs/system/EXTENSION-POINTS.md` §3.7，4～7 个文件）。

**为什么要通用。** 32-3 要做「线右端的后台任务列表」，32-1 要后台任务控制（暂停、停止、恢复）；事项线需求写「读任务板与各工作的主人……不另存任务清单」（`specs/work-line/spec.md` §4.5、第 230 行），但主人怎样报没有写。照现状做，列表只会有助理和 Coding 两类，或者在列表里为每个插件写分支。

**平台形状。** 后台工作只有一种投影：平台跑的 `background.jobs` 与调度任务由平台自动报成同一形状，插件自己的长任务用现有 `home_aggregate` 查询报，助理任务板也报这一形状；控制命令（停、暂停）沿用行里的 `commands`。32-3 的列表、标题栏计数只读这一处。迁移：Feed、Schedule、Images、Alchemist、助理。

**严重度：挡后续。** **建议批次：32-3**（「线读取与安放的合同」子分支，先于界面）；32-1 消费。

## 4. 「等你」与提醒有六个来源

**证据。** 「要你动手」这件事今天分散在：Attention 条目（`packages/contracts/src/platform/plugin-attention.ts`，Goals、Inbox、Feed 声明）、呈现声明的状态到 attention 的映射（`packages/contracts/src/platform/presentation-declaration.ts:43-46`，Coding、Feed、Goals、Inbox）、首页事件的 `needs_attention`（`packages/contracts/src/platform/home-events.ts:12`，Feed、Inbox、Todo）、后台工作的 `waiting`（`packages/contracts/src/platform/home-background-tasks.ts`）、到期提醒（`packages/contracts/src/platform/due-reminders.ts`，Todo 提供，宿主在 `apps/local-host/src/assistant/assistant-followups.ts` 读）、插件通知（`packages/contracts/src/platform/plugin-notifications.ts`，Schedule 发、Feed 收）。`docs/modules/attention-resumption.md` 写明系统通知和定时唤醒都还没有。

**为什么要通用。** 已排的三批各取一个来源：32-3 的「等你」节点与计数、53-2「等你的排序只看呈现声明里的状态」、56-1「接 Attention 角标／系统通知」。三处来源不同，角标数、线上的琥珀节点、首页「等你」会对不上。44-1 的 C8 只去掉 `goal_decision` 写死，不收拢来源。

**平台形状。** 「等你」只有一个主人：Attention。呈现状态映射、后台工作的 `waiting`、首页事件的 `needs_attention` 由平台在写入时投成 Attention 条目（或 Attention 读取时按声明合并，二选一在 32 定）；到期提醒和插件通知成为 Attention 的两种条目，系统通知、角标、唤醒都从 Attention 出。32-3、53-2、56-1 只读 Attention。

**严重度：挡后续。** **建议批次：32-3** 定读侧（等你只读一处）；**56-1** 做写侧收拢（到期提醒、通知并入，接系统通知）；53-2 的排序读同一份。

## 5. 设置：`settings_entries` 已定、没人用，各处各写

**证据。** 第 20 批合入了统一设置合同 `settings_entries`（`packages/contracts/src/platform/settings.ts`、`packages/contracts/src/platform/plugin-manifest.ts:268`、`packages/plugin-sdk/src/settings-declaration.ts`），取值顺序、幂等、`expected_revision` 都在 SDK 一处。仓库里没有一个插件声明它（`plugins/native/` 下搜不到 `settings_entries`）。场景合同把迁移名单写成「实现时逐项开片」，没有挂批次（`specs/scene-and-page-contract/spec.md:242`：模型设置、项目运行时、记忆偏好、助理回看范围、记录清理期限、各插件设置页里真正可配的项）。现状：模型设置另有 `model_configuration`（`plugin-manifest.ts:242`，Jelly 用，`plugins/native/jelly/src/model-configuration.ts`）；Coding、Goals、Shelf 各有自己的设置页和写入（各自 `manifest.ts` 的 `settings` 视图）；宿主自有设置分区加一个要改 9～11 个文件（`docs/system/EXTENSION-POINTS.md` §3.6）。第 44 批 H3 又计划一个新声明「设置节」（`specs/plugin-equal-standing/spec.md:158`）。

**为什么要通用。** 38-1「场景配置真实写入原主人」要求主人有公开的设置读写，SPC-09 规定没声明 `settings_entries` 的部分不能采用；45-1 的真实配置、40-1 的个人设置简化、52-1 的简报设置都要同一个东西。不迁，38 只能给每个主人写分支；44 再加「设置节」就是第二份声明。

**平台形状。** 不加新声明：现有设置按名单迁到 `settings_entries`（`model_configuration` 并入），插件设置页上能改的值改走那对读写动作；44 的「设置节」是 `settings_entries` 按主人分组的呈现，外壳按它排。

**严重度：挡后续。** **建议批次：38-1**（第一个硬依赖它的批，前置 20 已合、36 在途不挡）；44-6 的 H3 改为消费，不另定声明。

## 6. 对话附件：助理一条路、Coding 将另开一条

**证据。** 平台材料服务能读 Office、PDF、图片识别、音视频转写（`apps/local-host/src/material-extraction.ts`、`artifact-original-text.ts`）。助理的附件不走它：`apps/local-host/src/assistant/assistant-round-materials.ts:305-330` 用 Agent 运行时的 `documents.parse`，宿主给它另写了一份只读 PDF 文字层的解析器（`apps/local-host/src/pdf-document-parser.ts`，在 `agent-host-composition.ts:134` 接上），上限 8 MB，Word 等格式直接报「暂时只能读取文本文件、PDF 和图片」；图片交给运行时 `intakeImage`，第 35 批核账记了重启后失效（`specs/post-anticorruption-roadmap/reference/batches/35.md` 第 37 行 A3）。统一输入合同里「附件」和「材料」是两种条目（`packages/contracts/src/platform/composer.ts:56-58`）。

**为什么要通用。** 35-2 要给 Coding 做图片输入，核账第 51 行自己问「图片附件存在哪里，才能重启后取回、和材料一样可复查」。照现状会出现第三条读取路径。助理与 Coding 是两个现有使用者，子代理入口（58、59）随后也用统一输入。

**平台形状。** 对话附件就是材料：统一输入的附件经 `services.materials` 读取、按 `MaterialRef` 存放（重启可取回、能复查），图片作为带「可看图」标记的材料交给模型；助理与 Coding 消费同一服务，`pdf-document-parser.ts` 并进材料提取。

**严重度：挡后续。** **建议批次：35-2**，先做附件合同子分支，助理迁移同批完成（前置 08、11、31 已合，33 在途，35 未开工）。

## 7. 插件数据分段：同步、资产包、整份导出、业务导出各一份

**证据。** 每个插件已经为个人同步手写一份自己数据的描述：15 个插件各有 `src/sync-binding.ts`（如 `plugins/native/pages/src/sync-binding.ts`），段声明在 `packages/contracts/src/platform/plugin-sync-sections.ts`。资产包另有格式（`apps/local-host/src/work-assets.ts`，带固定的 `goals` 字段，44-5 已列）；整份 Home 快照与恢复在宿主 `home-snapshot-*.ts`、`home-restore-*.ts`。路线书还排着两份：68-2「为每个生成插件交业务数据导出」（来源 `docs/product-operations/产品优化建议.md` C2「每个生成插件自带导出业务数据」），73-3「整份 Home 导出的段清单由各主人声明」。

**为什么要通用。** 68-2 照字面是每个生成插件各写导出；73-3 又要一份主人声明的段清单；44-5 要「资产包与同步按声明的段」。三处说的是同一件事：一个插件有哪些业务数据、怎样完整取出与放回。内置插件和装上的插件待遇一样，导出也该一样，不该只给生成插件。

**平台形状。** 一个插件只声明一次自己的数据段（以现有同步集合与 `databases` 声明为准），平台用它做同步、资产包、整份导出与导入，并给一个对所有插件都有的业务数据导出动作；68-2 验证生成插件用这份导出，73-3、73-4 读同一份段清单。

**严重度：挡后续。** **建议批次：44-5**（已经在改「个人同步、资产包按声明」，把段声明定成导出也用的形状）；68-2、73-3、73-4 消费。动到库结构时照升级链写段。

## 8. 重复规则：平台调度只有固定间隔

**证据。** 平台调度只认「一次」和「固定毫秒间隔」（`horizontal/scheduler/src/index.ts:60`、`:90` 的表约束、`:510-517` 的 `nextDueAfter` 直接加间隔）。Schedule 把「每天」「每周」换成 24 小时、7×24 小时的间隔（`plugins/native/schedule/src/operations.ts:115-125`、`reminders.ts:63-76`），跨夏令时就漂一小时。Jelly 自己实现了按星期的重复（`plugins/native/jelly/src/contract.ts:14`、`calendar.ts:57`、`:112`）。

**为什么要通用。** 55-1 排了「Jelly／Schedule 增加按月、季、年重复」——按月不是固定间隔，照现状只能两个插件各写一套日历运算，平台调度仍算不出下一次。52-1 的简报「周期、时刻」、64-1 的周期报告也落在调度上。

**平台形状。** contracts 的 `ScheduleRecurrence`（`packages/contracts/src/platform/plugin-scheduler.ts`）加按本地时间与时区的日历规则（每天、每周几、每月第 N 天、每季、每年、截止、例外），SDK 给展开与下一次的计算，`horizontal/scheduler` 按规则算到期；Jelly 的星期重复和 Schedule 的 repeat 改用它。调度表结构变，要升版本、带升级段。

**严重度：挡后续。** **建议批次：52-1**（第一个落在定时上的未开工批，简报的「时刻」本身就要按本地时间）；55-1 消费。

## 9. 新建与起步入口的声明有五种

**证据。** 「在这个插件里新建一个」有：视图的 `creates`（指向内容站的 `create`，`packages/contracts/src/platform/ui.ts:411`、`:482`，Pages 用，`plugins/native/pages/src/manifest.ts:73`）、视图的 `start`（`ui.ts:421`、`:484`，Goals、灵光、Pages）、呈现概况的 `start`（`packages/contracts/src/platform/presentation-declaration.ts:87`，Coding、Goals）、`intake`「✦ 一句话新建」（`item-intake.ts`）、内容站 `create` 角色（`workflow-content.ts`）。Goals 同时声明了两种 `start`（`plugins/native/goals/src/manifest.ts:128`、`plugins/native/goals/src/presentation.ts:26`）。

**为什么要通用。** 45-1 新首页「第一件工作的落点只取场景声明的插件」、46-1「一句话／批量／无模型创建」、53-3「变成…」「建成…」取「声明了创建动作的来源插件」——三批各会挑一种来读，插件作者不知道写哪种才会出现在哪里。

**平台形状。** 「能新建什么」只在 `intake` 上声明一次（标题、动词、示例、是否带内容），视图 `creates`、两种 `start`、内容站 `create` 都由它派生或删去；首页起点、空态、「✦」、浮条、「建成…」都读它。

**严重度：挡后续。** **建议批次：44-1**，与第 1 项同一合同子分支；45-1、46-1、53-3 消费。

## 10. 插件之间点对点钉住提供方，不按角色发现

**证据。** 已有按角色发现的协议（工作流内容站，Workflows 按 `workflow_content` 从目录找站点，`plugins/native/workflows/src/content-client.ts:78-90`；成果类型的预览动作 `defineArtifactPreviewAction`，`packages/contracts/src/platform/file-sources.ts:147`，回的是通用的 `FileContent`），但几个插件直接钉住某个提供方的动作：PPT「从文档生成」只认 Pages 的 `pages.content.list`／`pages.content.read`（`plugins/native/ppt/src/plugin.ts:36-40`，`actions.ts:108`、`:158` 报「Pages 不可用」），虽然八个插件都有内容站的 `list`／`read`；Shelf 读成果正文只认 `coding.results.document@1`（`plugins/native/shelf/src/coding-result.ts`），不用成果类型自己声明的预览；Images「放进 Shelf」钉 `shelf.items.admit@1`（`plugins/native/images/src/shelf-admit.ts`）；Inbox 生成文档钉 Pages 的 `pages.generate`、`pages.generations.*`（`plugins/native/inbox/src/plugin.ts:30-31`、`pages.ts:71`）。

**为什么要通用。** 这些调用经动作目录、合规，但等于每对插件一份私有合同：别的文档插件、第三方插件接不进来，对方改版要逐个消费方跟。第 44-5 只改「平台点名插件」，插件之间的点名不在清单里。

**平台形状。** 消费方按角色发现：「从文档生成」读内容站 `list`／`read`，「读成果正文」用成果类型声明的预览，「存一份」用第 1 项的 `intake`（文件材料）；`capabilities.consumes` 写角色而不是对方动作。迁移：PPT、Shelf、Images、Inbox。

**严重度：应收。** **建议批次：44-5**（片 7「其他插件去点名」扩到插件之间），依赖第 1 项在 44-1 定的落点声明。

## 没列进来的

- 搜索来源、动作撤销、动作进度、调用记录：已是声明驱动的通用能力。
- 生成插件不能声明搜索来源（BL-040，48-2）、`ui.subject_context` 只对内置插件兑现（`specs/backlog/BL-subject-context-sandbox.md`）、OAuth 型集成仍要改 11 处（`docs/system/EXTENSION-POINTS.md` §3.3，归 W5-11／26-2）、上手服务写死 Todo 与 Pages（44-5）、MCP 接续摘要（44-1 C7）：已有去处。
- 授权与同意的种类（39 在途）、观测采集（28 在途）：在途批次，不分配。
- 记忆作用域加一种要改 10 个文件（`EXTENSION-POINTS.md` §3.9）：目前没有已排的新作用域，暂不列。
