# 第 19 批合同设计稿：首页主区内容的挂载与 Work Brief 的动作

状态：设计稿（2026-11-14，第 19 批主会话）。回答[第 19 批开工前五项核对](../post-anticorruption-roadmap/reference/batches/19.md#preflight-19)第 1、4、5 条落到合同上是什么样。行为与验收以 [Work Brief 需求](spec.md)为准；本稿只定形状、主人和拒绝，合同代码随本批 PR 合入，最终头上请公共合同台（C 轨）合审。阶段一：按原版本改、不留兼容期，一个 PR 改完所有消费者。

## 1. 现在有什么

| 合同 | 现状（main `e0a3b23893`） | 本批要改的 |
| --- | --- | --- |
| `platform/presentation` 的 `PresentationOverviewDeclaration` | 插件给首页一句概况、对象和开始入口 | 加可选的 `lead`（§2） |
| `services/surface-composition` 的 `SurfaceGroup` | `attention`、`continue`、`plugin`、`slot` 四种组 | 加 `lead` 组（§2） |
| `services/home` | 生成页面的选择与版本，`contract-only`，运行在第 37 批 | 不改；§2.4 写两者的关系 |
| Work Brief | 没有包、没有动作 | 新插件 `plugins/native/work-brief`（§3～§6） |

## 2. 首页主区内容（平台能力）

**问题。** 原需求 §1.1 要「通过通用首页挂载能力承接项目综合首页」。插件今天能给首页的只有卡片，放不下一页简报。

**用户决定（2026-11-14，弹窗）。** 装着声明了主区内容的插件时，简报占满首页，右上角一个「看基础首页」切换，随时切回插件卡片那一页；读不到或停用自动退回基础首页。否掉：简报在上、卡片在下同一页滚动（要给插件框架加报告高度的消息，改 S-47）；不挂首页只给卡片（WBR-22 做不到）。这是新的平台能力，改写了 11-04「不替换平台首页」的说法：首页仍归平台（外壳、切换、回退、基础首页都是平台的），主区内容可由一个插件的主区视图承接，本人可切回。[确定组合 §7.4](../surface-composition/spec.md) 与[场景合同 §6.2](../scene-and-page-contract/spec.md) 的原文随本批 PR 改。

**做法。** 走主区（stage）同一条装载路，不走侧栏文档：宿主在目录读取里已经给出每个安装此刻真实的主区视图（`SurfaceHomePlugin.stage_view_id`，双实例也由宿主选那一半），地址带安装身份、载入时复核；原生插件与签名、沙箱包同一条路，第三方同等可用；不动 S-30、S-47。

### 2.1 声明

```ts
// packages/contracts/src/platform/presentation-declaration.ts
interface PresentationOverviewDeclaration {
  // …已有字段
  /** 首页的主区内容由本 Manifest 的主区视图承接（装着时占满首页，本人可切回基础首页）。 */
  readonly lead?: { readonly view_id: string };
}
```

- `lead` 挂在 `overview` 下：要承接首页的插件必须先有概况动作（它同时也有自己的卡片）。
- SDK 的 `validatePresentationDeclaration` 新增：`lead.view_id` 必须是本 Manifest `ui.views` 里主区（`navigator` 或 `stage`）的视图；多余字段拒绝。沙箱包只有一个 stage 视图，同样可以声明。

### 2.2 组合

```ts
// packages/contracts/src/services/surface-composition.ts
interface SurfaceGroup {
  kind: "attention" | "continue" | "plugin" | "slot" | "lead";
  /** 只在 `lead` 组：宿主此刻选定的那个安装的主区视图。 */
  lead?: { installation: SurfaceInstallationRef; view_id: string };
}
```

- 只在 `slot: { kind: "home" }` 的描述里出现，至多一组，排在最前；`items` 为空、`state: "ok"`、带 `owner_plugin_id`（原注释「只在 plugin 组」改成「plugin 与 lead 组」）；`GROUP_SCHEMA` 照 `plugin_card` 的写法加 if/then。
- 候选：这次目录读取里声明了 `lead`、且 `lead.view_id` 正是宿主给的 `stage_view_id`、有且只有一个在跑的安装提供它（与 `openFor` 同一个判断）。停用、不可用、对项目不可见的没有这一组。
- 多个插件都是候选时只取一个：先按本人固定的顺序（`home_order`），再按 Dock 顺序、插件 id。其余照旧只是卡片；被选中的也照旧有卡片。
- 声明是静态的：概况读不到时主区内容照挂。`lead` 进描述的 `revision`。
- 组合服务不点任何插件名；SDK 的 `assertSurfaceDescription` 增加 `lead` 组的形状检查。`surfaces.compose` 的受众含 `plugin`，新的组会出现在插件读到的输出里，只有安装引用和视图 id，没有内容。

### 2.3 页面

- 宿主给首页的显示数据 `SurfaceHomeDisplay`（`packages/design-system/src/surface-home-display.ts`，由 `apps/local-host/src/surface-home-display.ts` 拼）多一项 `lead: { owner_plugin_id, name, target }`：`target` 是与卡片「打开」同一种主区打开目标，页面不拼地址。
- 首页有 `lead` 且本人没切到基础首页时：首页这一块用主区同一种装载画那个视图（占满首页的工作面，滚动归视图自己），上面留一条平台的细栏：左边项目名，右边「看基础首页」。切到基础首页后，细栏右边是「回到 <插件名>」。切换只记在这台浏览器这个项目的页面状态里。
- 装载失败或宿主复核不过时：显示基础首页，写一句「<插件名> 这次没打开，显示的是基础首页」，给「重试」。
- 访问首页只是装载这个视图：不启动模型、任务或外部操作（WBR-21／24）。
- 写文稿时安装或启用插件不打断当前标签：首页回到前台时按最新描述刷新（沿用第 15 批）。

### 2.4 与第 37 批的关系

`services/home` 的「项目用哪个首页」不改。第 37 批建 `horizontal/home` 并跑生成页面以后：选了生成页面时显示生成页面；选基础首页时照本节。37 批文件随本批 PR 改一句前置。

### 2.5 安全

不新增授权主体，不新增消息。视图就是插件自己的主区视图，装载、凭据和页面网关都是主区现有的那一套。要断言的拒绝：`lead.view_id` 不是本 Manifest 的主区视图时 Manifest 被拒；停用或对项目不可见的安装不出 `lead` 组；`lead` 指向的不是宿主选定的那个视图时不出这一组；首页装载带的安装身份与当前不符时被拒、退回基础首页。

## 3. Work Brief 插件

- 包 `plugins/native/work-brief`，`plugin_id: io.molis.work.work-brief`，目录名与 `project_plugin_id` 是 `work-brief`；内置、经 Plugin Runtime 装配。
- **Home 级、双实例**（用户 2026-11-14 弹窗定：项目简报与个人简报都有）。数据只有一份，在 Home 库 `work-brief`：不分区，项目的行用 `project_rows` 随项目删除；项目那一半经 `context.services.database` 用同一个库（没有 Home 时拿不到，项目那一半照样启动，动作答「不可用」）。
- **个人简报**（用户同日定）：个人事项的集合汇总，每一项带「项目」或「个人」标签，项目的项能跳到对应项目。来源两种：Work Brief 自己库里各项目简报「要你处理」与「下一步」的项（自己的行，经 `project_reach: "person"` 只在本人调用时读本人够得到的项目）；Home 级插件的来源（经目录读它们 Home 范围的概况与对象）。它不直接读各项目插件的对象：Home 路径上调不到项目范围的动作，这是平台现有的边界，不绕。跳转用平台已有的「打开项目里的对象」，不拼地址。
- 不声明 `task_subjects`、不调 `host.taskGrants`（开工前核对第 5 条）。
- 不 import 任何别的插件；代码里没有别的插件的动作名或状态词。来源来自目录。没装 Goals 的项目照常。

### 3.1 两半各管什么

| 一半 | 管什么 | 为什么 |
| --- | --- | --- |
| 项目那一半 | 项目简报的全部动作（列出、读取、保存、刷新、修改、处理提案、固定、下一步）、首页概况与取值、对象读取器、搜索来源、主区视图 | 要以调用者身份读项目里的来源（`actions:delegate`）、发成果、在主区视图里用对象挂载位（Home 那一半的页面没有项目，挂载位被拒） |
| Home 那一半 | 个人简报的读取与刷新（`scope: "home"`，`project_reach: "person"`）、个人简报的视图 | 无项目也可用，跨项目汇总 |

对象种类分开：项目简报是 `brief`（读取器只在项目那一半，一个项目里目录只找到一个）；个人简报不是可引用的对象，不设读取器。每条权限明写 `required`。

### 3.2 事实与主人

| 事实 | 主人 | 说明 |
| --- | --- | --- |
| 简报（范围、标题、现行版本号） | Work Brief | 每个项目一份项目简报（首页那一页），另可有专题简报；个人一份 |
| 版本（正文段、截至时间、当时的来源状态、谁生成的） | Work Brief | 只追加；固定过的版本不可改 |
| 冻结的依据（每条引用当时读到的标题、状态与版本号） | Work Brief | 只为「当时」服务；不是对象的第二份事实；读取时按调用者现在读不读得到遮蔽 |
| 人工修改（哪一句、改成什么、基于哪一版） | Work Brief | 再生成时保留，冲突逐处处理 |
| 下一步的处置（暂不、已处理的回执引用） | Work Brief | 只记这一条在这份简报里怎么处置了；执行进度与结果归原插件或助理 |
| 对象的标题、状态、动作 | 各插件 | 现读；读不到标缺口 |
| 调度、授权、执行 | Schedule、平台、助理 | 简报只引用 |

### 3.3 正文的形状

```ts
type BriefSection =
  | { kind: "sources"; rows: SourceRow[] }                 // 各来源此刻怎么样（Work Brief 按读取结果写，助理改不了）
  | { kind: "claims"; claims: Claim[] }                     // 助理写的句子，每句带依据
  | { kind: "attention"; items: AttentionItem[] }           // 要你处理：对象引用加一句原因
  | { kind: "next"; options: NextOption[] };                // 下一步选项

interface Claim { claim_id: string; text: string; cites: Cite[]; supplied_by?: "owner" }   // owner = 本人口述，不冒充读取
interface Cite { subject: ActionSubject; revision: string; title: string; status?: string; read_at: string }
interface SourceRow { plugin_id: string; read: "ok" | "stale" | "unreadable" | "unauthorized" | "none"; read_at?: string;
  summary?: OwnedTextRef; turn?: "idle" | "moving" | "waiting" | "blocked" }
interface NextOption { option_id: string; text: string; why: string; subject?: ActionSubject;
  act: { kind: "card"; card: ActionCard } | { kind: "assistant" } }
```

- 每句没有口述标记的断言至少一条 `cite`；`cite` 必须是保存时以调用者身份读得到的对象，读不到的让保存当场失败并指出是哪一条（WBR-03）。
- `SourceRow.turn` 只从平台的公共词推出，不认任何插件自己的状态词：这个来源的概况对象里，按主人呈现声明的 `status.map` 映射出的 `attention`（`needs_decision`、`needs_acceptance` → `waiting`；`failed` → `blocked`）和状态环家族（`blocked`／`failed` → `blocked`；`answer` → `waiting`；`running` → `moving`）；与上一版比概况对象有增减 → `moving`；其余 `idle`。
- 「和上次比」不存：由两版的依据和来源状态算出。
- 下一步里「原插件的真实动作」是 SDK 的操作卡（`packages/plugin-sdk/src/action-cards.ts` 的 `ActionCard`：动作引用加准备好的输入）：保存时用 `directory.check` 核对动作存在、输入合 schema；本人点了才由 Work Brief 以本人身份经动作目录执行（`runActionCard`），执行前用 `sweepActionCard` 核对象没变，变了的旧卡不可执行（WBR-06）。「交给助理」由页面发平台已有的 `molis:assistant-message`（`purpose: "delegate"`，真实手势之后），Work Brief 只记本人选了它。
- 文字一律按数据处理、转义后显示；正文不收 HTML（WBR-11）。

### 3.4 动作

前缀 `work-brief.`（与 `project_plugin_id` 一致），权限 `work-brief:read`、`work-brief:write`；等别的插件的都声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交。版本前提一律是顶层的 `expected_revision`。

| 动作 | 一半／scope | 种类 | 受众 | 做什么 |
| --- | --- | --- | --- | --- |
| `work-brief.briefs.list@1` | 项目 | query | user、agent、plugin、mcp | 本项目的简报与各自的现行版本（不含依据文字） |
| `work-brief.briefs.get@1` | 项目 | query，并发 | 同上 | 一份简报的某一版（默认现行）：正文、依据、人工修改、版本列表、待处理的提案；可带 `compare_with`。每条冻结的依据按调用者此刻读不读得到复核，读不到的只给缺口标记，不给当时的标题与状态（原需求 §1.5） |
| `work-brief.briefs.save@1` | 项目 | command，并发 | user、agent | 交一版草稿：核对每条依据、冻结、存成新的一版。有未合并的人工修改时存成提案，逐句列出冲突。`request_id` 存在自己的表里（唯一），重复提交返回同一结果（WBR-07） |
| `work-brief.briefs.refresh@1` | 项目 | command，并发 | user、agent、workflow | 不调模型：重读各来源的概况与每条依据的现状；有变化才存成新的一版，返回变化；读不到的标过期或缺口。固定的旧版本不动（WBR-10／18） |
| `work-brief.briefs.edit@1` | 项目 | command | user | 本人改一句或补一句 |
| `work-brief.proposals.resolve@1` | 项目 | command | user | 逐处处理提案里的冲突；全部处理完才成为新的一版（WBR-05） |
| `work-brief.versions.fix@1` | 项目 | command，并发 | user | 把一版固定并发成成果（类型 `io.molis.work.work-brief.brief`，带预览动作）；库里的行与成果在一个事务里提交（`project_rows.artifact_join`，照 Form 的写法）。之后这一版只读（WBR-04） |
| `work-brief.next.run@1` | 项目 | command，并发 | user | 执行一条下一步的操作卡；结果记成回执引用 |
| `work-brief.next.set@1` | 项目 | command | user | 标一条下一步「暂不」、撤回，或记下已交给助理 |
| `work-brief.presentation.overview@1`、`…values@1`、`work-brief.subject.read@1`、搜索来源 | 项目 | query | 照呈现合同 | 首页卡片、名片与搜索；对象种类 `brief` |
| `work-brief.personal.get@1` | Home | query，并发 | user | 个人简报：各项目简报里要你处理与下一步的项（带项目标签与打开目标）加 Home 级来源的项（带「个人」标签） |
| `work-brief.personal.refresh@1` | Home | command，并发 | user | 重读 Home 级来源，存成个人简报新的一版，只报变化 |

个人简报固定后不发成果（Home 实例不能发项目成果），只在库里标固定。

### 3.5 拒绝

错误码主人名 `work_brief`（目录名的连字符换下划线），用 `defineErrorCodes("work_brief", …)`。

| 码 | 什么时候 |
| --- | --- |
| `work_brief.not_found` | 简报或版本不存在，或不在调用者的范围里 |
| `work_brief.conflict` | 按读到的版本提交时已有更新的版本 |
| `work_brief.proposal_pending` | 还有没处理完的提案时又交一版 |
| `work_brief.cite_unreadable` | 草稿里有一条依据读不到（`details` 指出是哪一句的哪一条） |
| `work_brief.fixed` | 要改一版已固定的版本 |
| `work_brief.invalid` | 草稿形状不对：断言没有依据、段落种类不认识 |
| `work_brief.too_large` | 超出上限 |
| `work_brief.option_stale` | 下一步的对象已变或动作不可用，旧卡不能执行 |
| `actions.project_required` 等平台码 | Home 路径上调项目动作，照平台现行 |

上限：每版至多 40 句、每句 600 字、每句 8 条依据、12 个下一步、每份简报留 60 版（固定的版本不计入、不删）。

## 4. 对象引用与打开（等第 32 批）

Work Brief 的主区视图声明收对象的挂载位（`accepts_forms: ["chip", "row", "card"]`），经 `host.view.surfaceSlot` 交给平台画：名字、状态、打开、速览都是平台按主人的呈现声明给的。一个页面至多 4 个挂载位，所以按段用：依据名片一个（当前点开的那一条角标）、「要你处理」一个、「和上次比」一个、下一步的对象一个。Work Brief 的代码里不出现 `?openPlugin=`，也不自己读「等你」。挂载位只在主区装载下可用（§2 走主区这条路的原因之一）。

第 32 批的 `objects.open@1` 与 `attention.waiting.read@1` 合入后：平台的挂载位自己换成通用打开；个人简报的「跳到对应项目」换成 `objects.open@1`。Work Brief 这边只有 `src/browser/objects.ts` 一处封装。

## 5. 授权去处

一版简报记着 `produced_by`：本人、助理的一次工作，或一个任务（对象引用）。来源状态是 `unauthorized` 且这一版是任务生成的：按钮经 §4 的挂载位打开那个任务（落在 Schedule 的任务详情，平台区域在那里）；没有任务信息时打开项目设置的「授权与放行」页（页面发平台已有的打开设置事件，不拼地址）。

## 6. 存储

Home 库 `work-brief`，第 1 版，不分区：`briefs`、`brief_versions`、`brief_edits`、`brief_proposals`、`brief_next_marks`、`brief_requests`（`request_id` 唯一）六张表，只由本包读写；`project_rows` 声明项目的行随项目删除，`artifact_join` 把固定版本与成果连在一个事务里。个人的行没有 `project_id`，不随删项目走。随合同代码一起加的登记：结构快照、表主人、`tooling/versions.json` 的库与动作条目、Home 存储登记、`docs/releases/CHECKLIST.md` §3 的库行、双实例覆盖测试。两半共用一个库没有先例，补三条测试：两半读写同一份、删项目只删项目的行、没有 Home 时项目那一半照样启动且动作答不可用。

## 7. 对别人的影响

- 公共 API 快照：`platform/presentation`（`overview.lead`）、`services/surface-composition`（`lead` 组）；SDK `/presentation` 的声明检查与 `assertSurfaceDescription` 各多一条；`packages/design-system` 的 `SurfaceHomeDisplay` 多一项；`horizontal/surfaces` 不加端口（复用 `stage_view_id`）。已有声明不受影响。
- 动作快照：新增 Work Brief 的动作；`surfaces.compose@1` 的输出 schema 多一种组（原版本改，画它的消费者只有首页，本批一起改）。
- 文档原文：确定组合 §7.4、场景合同 §6.2 改写「首页主区内容」。
- 第 37 批：前置改成「综合首页的挂载已由 19 批给出，生成页面优先于主区内容」。第 52 批：每日简报用 `work-brief.briefs.save@1` 与 `refresh@1`，不另建存储。

## 8. 评审记录

2026-11-14 评审子代理（Opus high，只读）对 `b7bf6f8402` 退回六项，本稿已改：主区内容由侧栏文档改走主区装载（侧栏那条路不支持签名与沙箱包、与双实例冲突、撞 S-30、量不到高度）；与 11-04 写法的冲突经用户弹窗定；错误码主人名改 `work_brief`、动作与权限前缀改 `work-brief`；每个动作写明归哪一半；读取时按调用者现状遮蔽冻结的依据；下一步改用 SDK 操作卡。不挡合并的几条（概况是 `lead` 的前提、§7 补全受影响处、登记清单、`turn` 的推法、「固定」不与「保存」混用）一并收进。
