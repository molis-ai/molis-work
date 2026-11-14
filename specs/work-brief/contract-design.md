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

**问题。** 原需求 §1.1 要「通过通用首页挂载能力承接项目综合首页」。插件今天能给首页的只有卡片，放不下一页简报；首页归平台，插件不出自己的整页。

**做法。** 首页多一个位置：最上面的一块主区内容，由一个插件的侧栏视图画。不新开视图位置（场景合同 §6.2：不在 `UI_VIEW_SLOTS` 加 `home`），用已有的 `side` 视图和它的同源框架文档（侧栏今天就这样装插件视图，`apps/workbench/src/side-view-document.ts`）。同一个视图在右侧栏和首页是同一份内容（WBR-02）。

### 2.1 声明

```ts
// packages/contracts/src/platform/presentation-declaration.ts
interface PresentationOverviewDeclaration {
  // …已有字段
  /** 首页最上面的一块主区内容：本 Manifest 自己的一个 `side` 视图。 */
  readonly lead?: { readonly view_id: string };
}
```

SDK 的 `validatePresentationDeclaration`（作者与平台同一份检查）新增：`lead.view_id` 必须是本 Manifest `ui.views` 里 `slot: "side"` 的视图；多余字段拒绝。任何插件都能声明，包括沙箱包与第三方。

### 2.2 组合

```ts
// packages/contracts/src/services/surface-composition.ts
interface SurfaceGroup {
  kind: "attention" | "continue" | "plugin" | "slot" | "lead";
  /** 只在 `lead` 组：哪一个安装的哪一个视图。 */
  lead?: { installation: SurfaceInstallationRef; view_id: string };
  // …
}
```

- 只在 `slot: { kind: "home" }` 的描述里出现，至多一组，排在最前；`items` 为空、`state: "ok"`、带 `owner_plugin_id`。
- 候选：这次目录读取里 `running`、对这个项目的首页可见、声明了 `lead`、宿主核过那个 `side` 视图此刻确实由这个安装提供（`SurfaceHomePlugin.side_view_ids`，与 `stage_view_id` 同一次目录读取给出）的安装。
- 多个候选只取一个：先按本人固定的顺序（`home_order`），再按 Dock 顺序、插件 id。其余候选照旧只是卡片。被选中的插件也照旧有自己的卡片。
- 不调概况动作就能决定（声明是静态的），所以概况读不到时主区内容照挂；插件停用、卸载、不可用时没有这一组。
- `lead` 进描述的 `revision`：换了插件、换了发行物、换了视图，revision 都变。
- 组合服务不点任何插件名；`assertSurfaceDescription` 增加 `lead` 组的形状检查。

### 2.3 页面

- 宿主给首页的显示数据（`SurfaceHomeDisplay`）多一项 `lead: { owner_plugin_id, title, src }`：`src` 是这个视图的侧栏文档地址，由宿主按与侧栏标签同一条规则算出，页面不拼地址。
- 首页在「等你」上面放一个同源框架装它；高度跟内容（同源，直接量），不出第二个滚动条。读取失败、框架加载失败或 8 秒内没画出内容时撤下这一块，写一句「综合首页这次没打开，显示基础首页」，并给「重试」。
- 「看基础首页／回到综合首页」是首页上的一个切换，只记在这台浏览器这个项目的页面状态里，不写业务事实。
- 访问首页只是加载这个视图：不启动模型、任务或外部操作（WBR-21／24）。视图自己的读取照它的动作授权。
- 写文稿时安装或启用插件不打断当前标签：首页回到前台时按最新描述刷新（沿用第 15 批）。

### 2.4 与第 37 批的关系

`services/home` 的「项目用哪个首页」（基础或某一版生成页面）不改。第 37 批建 `horizontal/home` 并跑生成页面以后：选了生成页面时显示生成页面；选基础首页时照本节。生成页面里要放简报，和放别的插件内容一样经公开动作取（原需求 §1.3）。37 批文件随本批 PR 改一句前置。

### 2.5 安全

不新增授权主体。框架就是侧栏今天用的那一种（同源文档只给宿主自己装配的内置插件，签名包走不透明框架），视图里的每次读取都是那个插件自己的动作、按本人身份核。要断言的拒绝：`lead.view_id` 不是本 Manifest 的侧栏视图时 Manifest 被拒；停用或对项目不可见的安装不出 `lead` 组；别的插件的视图 id 不能被指到。

## 3. Work Brief 插件

- 包 `plugins/native/work-brief`，`plugin_id: io.molis.work.work-brief`（以仓库现行命名规则为准），内置、经 Plugin Runtime 装配。
- **Home 级、双实例**（与 Goals、Feed 同一种写法）：Home 那一半管个人范围和设置；项目那一半提供项目范围的动作，以调用者身份经动作目录读各来源（`actions:delegate`），并把固定版本发成成果。数据只有一份，在 Home 库（`databases.home`，项目的行随项目删除）。
- 不声明 `task_subjects`、不调 `host.taskGrants`：定时生成是 Schedule 的任务（开工前核对第 5 条）。
- 不 import 任何别的插件；代码里没有别的插件的动作名或状态词。来源来自目录：各插件的首页概况（`presentation.overview`）、对象读取器、呈现取值。没装 Goals 的项目照常。

### 3.1 事实与主人

| 事实 | 主人 | 说明 |
| --- | --- | --- |
| 简报（范围、标题、现行版本号） | Work Brief | 范围是一个项目或个人；每个项目有一份「项目简报」（首页那一页），另可有专题简报 |
| 版本（正文块、截至时间、依据清单、当时的来源状态、谁生成的） | Work Brief | 只追加；固定（保存或分享）过的版本不可改 |
| 冻结的依据（每条引用当时读到的标题、状态与版本号） | Work Brief | 只为「当时」服务；不是对象的第二份事实，不可编辑 |
| 人工修改（哪一句、改成什么、基于哪一版） | Work Brief | 再生成时保留，冲突逐处处理 |
| 下一步的处置（暂不、已处理的回执引用） | Work Brief | 只记「这一条在这份简报里怎么处置了」；执行进度与结果仍归原插件或助理 |
| 对象的标题、状态、动作 | 各插件 | 现读；读不到标缺口 |
| 调度、授权、执行 | Schedule、平台、助理 | 简报只引用 |

### 3.2 正文的形状

一版简报是一组有序的段，闭集：

```ts
type BriefSection =
  | { kind: "sources"; rows: SourceRow[] }                 // 各来源此刻怎么样（宿主的字）
  | { kind: "claims"; title_key: "now"; claims: Claim[] }   // 助理写的句子，每句带依据
  | { kind: "attention"; items: AttentionItem[] }           // 要你处理：对象引用加一句原因
  | { kind: "next"; options: NextOption[] };                // 下一步选项

interface Claim { claim_id: string; text: string; cites: Cite[]; supplied_by?: "owner" }   // owner = 本人口述，不冒充读取
interface Cite { subject: ActionSubject; revision: string; title: string; state?: string; read_at: string }  // 冻结的依据
interface SourceRow { plugin_id: string; read: "ok" | "stale" | "unreadable" | "unauthorized" | "none"; read_at?: string;
  turn?: "idle" | "moving" | "waiting" | "blocked" }        // 轮到谁：只有 waiting 是「等你」
interface NextOption { option_id: string; text: string; why: string; subject?: ActionSubject;
  act: { kind: "owner_action"; action: ExactActionReference } | { kind: "assistant" } }
```

- 每句没有口述标记的断言至少一条 `cite`；`cite` 必须是保存时以调用者身份读得到的对象（经对象读取器核对），读不到的让保存当场失败并指出是哪一条（WBR-03），不静默丢掉。
- 「和上次比」不存：由两版的依据和来源状态算出（新增、状态变了、不再出现、读不到）。
- 文字一律按数据处理、转义后显示；正文不收 HTML（WBR-11）。

### 3.3 动作

提供方是 Work Brief 自己；项目范围的由项目那一半答。读取 `work_brief:read`，写入 `work_brief:write`。

| 动作 | 种类 | 受众 | 做什么 |
| --- | --- | --- | --- |
| `work_brief.briefs.list@1` | query | user、agent、plugin、mcp | 本范围的简报与各自的现行版本 |
| `work_brief.briefs.get@1` | query | 同上 | 一份简报的某一版（默认现行）：正文、依据、人工修改、版本列表、待处理的再生成提案；可带 `compare_with` 取另一版供「当时／现在」 |
| `work_brief.briefs.save@1` | command，并发 | user、agent | 助理或本人交一版草稿：核对每条依据、冻结、存成新的一版。有未合并的人工修改时不覆盖：存成提案，逐句列出冲突。带 `request_id`，重复提交返回同一结果（WBR-07） |
| `work_brief.briefs.refresh@1` | command，并发 | user、agent、workflow | 不调模型：重读各来源的概况与每条依据的现状，存成新的一版，只返回变化；读不到的标过期或缺口。固定的旧版本不动（WBR-10／18） |
| `work_brief.briefs.edit@1` | command | user | 本人改一句或补一句；按读到的版本提交，冲突拒绝 |
| `work_brief.proposals.resolve@1` | command | user | 逐处处理提案里的冲突：保留我的、用新的、合并后的文字；全部处理完才成为新的一版（WBR-05） |
| `work_brief.versions.fix@1` | command，并发 | user | 把一版固定下来并发成成果（类型 `molis.work-brief.v1`，带预览动作）；之后这一版只读（WBR-04） |
| `work_brief.next.set@1` | command | user | 标一条下一步「暂不」或撤回；记下已处理的回执引用 |
| `work_brief.presentation.overview@1`、`…values@1`、对象读取器与搜索来源 | query | 照呈现合同 | 首页卡片、名片与搜索；对象种类 `brief` |

- 所有等别的插件或外部的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再按读取时的版本提交。取消、撤权、停用后的迟到结果不写。
- 「交给助理」不由 Work Brief 执行：页面把这条选项连同简报引用交给平台已有的助理入口；Work Brief 只记本人选了它。
- 「原插件的真实动作」不由 Work Brief 代调：选项里的动作引用在保存时核对存在、属于那个对象的主人；执行由平台的对象挂载位（§4）按本人身份发起。对象变了、动作不可用或授权撤回时，旧选项不可执行（WBR-06）。

### 3.4 拒绝

| 码 | 什么时候 |
| --- | --- |
| `work-brief.not_found` | 简报或版本不存在，或不在调用者的范围里 |
| `work-brief.conflict` | 按读到的版本提交时已有更新的版本 |
| `work-brief.cite_unreadable` | 草稿里有一条依据读不到（`details` 指出是哪一句的哪一条） |
| `work-brief.fixed` | 要改一版已固定的版本 |
| `work-brief.invalid` | 草稿形状不对：断言没有依据、段落种类不认识、超出上限 |

上限：每版至多 40 句、每句 600 字、每句 8 条依据、12 个下一步、每份简报留 60 版（固定的版本不计入、不删）。

## 4. 对象引用与打开（等第 32 批）

Work Brief 的视图声明一个收对象的挂载位（`accepts_forms: ["chip", "card"]`），来源角标点开的名片、「要你处理」的行、下一步卡片上的对象都经 `host.view.surfaceSlot` 交给平台画：名字、状态、打开、速览和动作都是平台按主人的呈现声明给的。Work Brief 的代码里不出现 `?openPlugin=`，也不自己读「等你」。

第 32 批的 `objects.open@1` 与 `attention.waiting.read@1` 合入后：平台的挂载位自己换成通用打开；Work Brief 这边只有 `src/browser/objects.ts` 一处封装要看一眼。

## 5. 授权去处

一版简报记着 `produced_by`：本人、助理的一次工作，或一个任务（对象引用）。来源状态是 `unauthorized` 且这一版是任务生成的：按钮打开那个任务（经 §4 的挂载位，落在 Schedule 的任务详情，平台区域在那里）；没有任务信息时打开项目设置的「授权与放行」页（页面发平台已有的打开设置事件，不拼地址）。

## 6. 存储

Home 库 `work-brief`，第 1 版：`briefs`、`brief_versions`、`brief_edits`、`brief_proposals`、`brief_next_marks` 五张表，只由本包读写；项目的行按 `project_id` 随项目删除。结构快照、表主人登记、版本表条目随合同代码一起加。

## 7. 对别人的影响

- 公共 API 快照：`platform/presentation`、`services/surface-composition` 各加一个可选字段／一种组；SDK `/presentation` 的检查多一条。已有声明不受影响。
- 动作快照：新增 Work Brief 的动作；`surfaces.compose@1` 的输出 schema 多一种组（原版本改，消费者只有首页，本批一起改）。
- 第 37 批：前置改成「综合首页的挂载已由 19 批给出，生成页面优先于主区内容」。第 52 批：每日简报用 `work_brief.briefs.save@1` 与 `refresh@1`，不另建存储。
