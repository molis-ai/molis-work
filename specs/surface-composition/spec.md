# 确定组合平台服务（路线书 15 ①）

状态：第 15 批实施中，尚未交付。S-1 已合回本批并完成定向验证；公共组件已合回，S-2 设计合审通过并进入服务实现。2026-11-08 用户指定 Codex 本批主台接续；原 C3 设计与 D 定样成果保留。`batch/15` 从 main `226ce892a8` 开始；[05② 的呈现合同](../shared-sources-and-surfaces/spec.md)（C-2、C-3，#1979）与第 14 批 A 段（#1976）已进入该基线。按用户同日后续更正，本批独立开发首页与入口，最终统一同步时接回第 16 批页面授权和取词切换、第 20 批项目成员能力，再以实际采用的接口验收；不再逐文件等待交接。开工检查及证据范围见 §14；全批统一验证、产品实操与本人验收未完成。第 7 节对着[基础首页定样](../../docs/design/basic-home/README.md)写，D 轨 11-04 共审过；合同缺口已由 C-2、C-3 接收，挂载位已并进 slots。早期核查保留在[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md#baseline-15)。

## 0. 给人讲清楚

现在首页、对话、讨论、「等你」各自决定一件东西显示成什么样、带哪几个按钮，代码散在宿主和页面里，有的还写死了插件名。这份稿子定一个专门的平台服务来做这件事：给它「谁在看、在哪个位置、看哪些东西」，它按各插件的声明和固定规则，排出该显示哪些东西、各用什么样子、显示哪几项、带哪些按钮。不调模型，同样的输入每次结果一样。

做完以后，首页、对话、讨论、「等你」都向它要同一份结果，同一件东西在各处一致；插件不用为每个位置各写一套，第三方插件写同一份声明也能出现在这些地方。用户直接看到的是第 15 批第 2、3 项：几种展示样子和基础首页。这一项本身不改界面。

## 1. 这份稿子做什么

[第 15 批第 1 项](../post-anticorruption-roadmap/reference/batches/15.md#batch-15-item-1)：在独立的 `horizontal/` 包实现组合服务，确定组合在服务里做，宿主只装配，SDK 只留作者和平台共用的校验。

本稿回答：

- 包边界、表和存储（第 2、3 节）；
- 消费哪些合同：05② 的呈现与来源合同、14 的文字合同、07 的读取（第 4 节）；
- 宿主只做装配（第 5 节）；
- 组合规则（第 6 节）与基础首页的对应（第 7 节）；
- 调用次数和缓存（第 8 节）；
- 降级与跨位置的操作（第 9、10 节）；
- 拆片和验收编号（第 11、13 节）；
- 要 C 轨、D 轨和统筹定的事（第 12 节）。

产品规则不在这里定：

- 形态、字段角色、挂载位、组合依据：[智能呈现](../intelligent-surfaces/spec.md) §4、§5、§12，IUI-01～26；
- 公开合同的形状：[05②](https://github.com/molis-ai/molis-work/pull/1771) §5～§7（`PresentationDeclaration`、`PresentationValues`、`SurfaceRequest`、`SurfaceDescription`、`surfaces.compose@1`、`surfaces.correct@1`）；
- 基础首页：[Work Brief](../work-brief/spec.md) §1.1～1.4（WBR-21～28）与第 15 批定样（#1778，用户 11-04 选「先等你和接着做，再插件卡片表」）；
- 插件领头的样子：第 03 批定样方案 B。

本稿写服务怎样消费合同。C-2、C-3 已合入；2026-11-08 按真实装配核到的剩余缺口在 §14.2 收敛，经过本批独立合同评审后随 S-1 补齐，合同形状只在 [05② §5～§7](../shared-sources-and-surfaces/spec.md#6-组合服务的公开合同) 维护。

## 2. 包边界

新包 `horizontal/surfaces`，包名 `@molis-ai/molis-work-service-surfaces`，成熟度 `slice`。依赖 contracts 和 plugin-sdk（取共用校验，和 `horizontal/knowledge` 一样），不依赖宿主、工作台、别的 horizontal 包和任何插件。写法照 `horizontal/placement`：服务类收端口（ports），宿主为每次调用造一份带调用上下文的端口。

| 负责 | 不负责（谁负责） |
| --- | --- |
| `surfaces.compose@1`：按调用方、位置和对象排出 `SurfaceDescription` | 字段的值（主人插件的 values 动作；页面另取） |
| 确定组合的规则：选形态、选字段、选操作、分组、排序、去重、降级 | 呈现声明的解析与安装校验（Plugin Runtime，用 SDK 的 `validatePresentationDeclaration`） |
| `surfaces.correct@1`：记住用户的纠正（换形态、移走、固定） | 「等你」条目本身（`modules/attention-resumption`） |
| 纠正记录这一张表 | 对象之间的关系（Context Ledger） |
| 组合结果的进程内缓存 | 最近在做什么（观测和采集层的工作记录） |
| 按位置给出通用操作（打开、速览、放进、交给……）的引用 | 执行操作（动作网关，用点击时的授权） |
| 第三片：助理组合（经端口调 agent-host） | 画出来（design-system 的组件，插件经 SDK `/ui`）；挂载位在页面上的位置（工作台）；谁接管首页（工作台的通用挂载，见第 7.4 节） |

包里不出现任何插件 id 或插件名；门禁见第 11 节。

## 3. 表和存储

只有一张表，归本包（写进 `tooling/gates/table-owners.json` 不需要，本包独占）：

```text
surface_corrections        项目库
  actor_id      调用方（取自调用上下文）
  slot_key      位置：kind + plugin_id + slot_id 归一后的串（如 "plugin-slot:goals:evidence"、"home"）
  subject_kind, subject_id   针对哪个对象；为空表示对整个位置（如密度）
  correction    "form" | "remove" | "pin"
  value         form 时是形态名；pin 时是顺序
  revision      整数，按 (actor_id, slot_key) 递增；surfaces.correct@1 用 expected_revision 提交
  recorded_at
```

- **为什么在项目库**：位置属于项目，同一个人在两个项目里对同一位置的纠正互不影响。个人跨项目的偏好（如密度）以后再说，第一片不做。
- **怎样建表**：经第 02 批的 storage 驱动（#1790「项目数据库归 storage」），包里不自己开库（C 轨评审 11-04）。
- **不存组合结果**：描述只在进程内缓存（第 8 节），重启后重算；描述里本来就没有值，丢了不影响事实。
- **不存值、不存正文**：纠正只记对象引用和形态。
- **库结构怎样进升级链**：和 05② §8 同一个分界，看 02③ 真实 Home 重建。重建之前落，就写进第 1 版建表；重建之后落，就是一步升级，属于「新增迁移逻辑」的红线，开 PR 之前由统筹先问用户。
- **助理组合的记录**（第三片）写进观测和采集层的工作记录，不在本包另建表（IUI-23）。

## 4. 消费哪些合同

### 4.1 05② 的呈现与来源合同

| 合同 | 怎样用 |
| --- | --- |
| `PresentationDeclaration`（Manifest 的 `presentation`） | 经插件目录端口读已装、已启用插件的声明。声明已在安装时校验过，服务不再解析 Manifest |
| `PresentationValues`（主人的 values 动作） | 只取**规则要用的字段**：状态字段（选操作的 `when.status`、排「等你」）和关系字段。显示用的字段由页面另取。按精确提供方和 values 动作批量读取，每批最多 50 个对象、32 个字段；同一路由合并，不按条目逐个请求（§14.2） |
| `SurfaceRequest`、`SurfaceDescription`、`SurfaceItem` | 服务的输入和输出，原样照 05② §6 |
| `presentationFormFields(object, form)`（SDK） | 算一个形态要显示哪些字段，和页面单独画形态时用同一份 |
| `assertSurfaceDescription(value, candidates)`（SDK） | 第一片用来自查输出；第三片校验助理组合 |
| `SearchOpenTarget` | 没有声明的对象兜底「打开」的去处 |
| `ActionSubject` | 一切对象引用 |

### 4.2 14 的文字合同

[字体皮肤语言 A 段](../font-and-skin-system/implementation-plan.md)定的 `TextRef`：主人、稳定键、参数。

- 描述里所有给人看的字都写成 `TextRef`，服务不翻成某种语言的字。切换语言不用重新组合，缓存也不分语言。
- 插件声明里的 `label_key` 变成 `TextRef`，主人是声明它的那个安装，从插件目录取，不从声明里自称（AGENTS「可信身份不从输入读」）。
- 平台的通用操作和分组标题（「等你」「接着做」「另有 N 件在上面」）用工作台共有词的稳定键。
- 动作按钮的字用动作自己的键 `action.<capability_id>.title`（字体皮肤语言 §6 ⑥），服务只给动作引用，不另写按钮字。
- 05② 的 `SurfaceDescription.groups[].title_key?: string` 要改成 `TextRef`（第 12 节第 3 条）。

### 4.3 07 的读取

[第 07 批第 2 项](../post-anticorruption-roadmap/reference/batches/07.md#batch-07-item-2)（对抗式审查 N52～54）定的读取规矩，页面调组合服务时照着做：

- 一个位置画一次只调一次 `surfaces.compose@1`；同一屏几处位置各一次，不按条目逐个调；
- 不轮询：靠事件刷新（第 8.3 节），页面在后台不刷新，回到前台补一次；
- 必然失败的不重试：插件已卸载、对象已删除、没有权限，服务在描述里如实给出状态，页面不再为它发请求；
- 返回 404（位置所在的插件卸载了）停止这一位置的刷新。

### 4.4 别的平台读取

| 读什么 | 主人 | 用在哪 |
| --- | --- | --- |
| 已装、已启用插件和它们的声明、启用状态 | Plugin Runtime 的插件目录 | 每次组合 |
| 动作是否存在、调用方当前能不能调（`availability`）、后果（外发、费用、不可逆） | 动作目录的 `discover()`，按调用上下文给，助理的 `methods()` 也是这样用；不另开授权核对接口（C 轨评审 11-04） | 选操作：不可用的不放（IUI §4.3），必须让人知道原因的写原因；`consequence` 从动作元数据来，不由声明自称 |
| 「等你」条目 | `modules/attention-resumption` | `attention` 位置、首页「等你」 |
| 对象之间的关系 | Context Ledger（`ContextLedgerApi` 按边查） | 同一件事只算一次（第 6.6 节） |
| 最近在做什么 | 观测和采集层的工作记录（第 21、28 批） | 首页「接着做」 |

## 5. 宿主只做装配

宿主做三件事，此外不写组合逻辑：

1. **造端口**：插件目录、动作目录（`discover()`，带可用性）、主人 values 的调用、「等你」读取、Context Ledger 读取、工作记录读取、纠正表、时钟。每次调用按调用上下文造一份（照 `apps/local-host/src/placement-actions.ts` 的 `forCall`），身份、项目、安装都从调用上下文来。
2. **登记两个动作**：`surfaces.compose@1`（query，`scheduling: "concurrent"`，因为要等各插件的 values 动作）和 `surfaces.correct@1`（command，按 `expected_revision` 提交），提供方 `system.surfaces`，没有 Manifest；进动作合同快照的宿主一半（`tooling/gates/actions/host-actions.tsv`），改了跑 `pnpm actions:update`。受众第一片只给 user、plugin（05② §10 第 4 条）；外部 Agent 读文本形态，不调组合。
3. **关闭时停**：宿主关闭或项目卸载后，在途组合不再写纠正、不再发 values 调用（照 placement 的 `closed` 检查）。

工作台页面同样只装配：调 `surfaces.compose@1`，按描述用 SDK 的 `renderPresentationForm` 和组件板组件画，值另取；页面里不再写按插件分支的显示代码。现有的分支怎样退出，见核账。

## 6. 组合规则

确定组合用智能呈现 §5 的依据 1、2、3、5、6（位置、对象内容、对象与用户的关系、纠正、能力与授权），不用依据 4（此刻的任务）。同样的输入每次得到同样的结果。

一次组合按下面的顺序做：

### 6.1 位置

| 位置 slot | 接受的形态 | 对象从哪来 | 默认形态 | 最多 |
| --- | --- | --- | --- | --- |
| `plugin-slot` | 挂载位声明的 `accepts_forms` | 请求带的对象；挂载位声明的 `refuse_kinds` 先排除 | `accepts_forms` 里最大的一种 | 挂载位声明的 `max` |
| `conversation` | 名字片、卡片 | 请求带的对象（助理回答里提到的、交回的） | 正文里提到的是名字片，交回的是卡片 | 请求带几个给几个，超过 6 个时多出的收成「另有 N 件」 |
| `discussion` | 卡片、名字片 | 请求带的对象（消息里贴的） | 卡片 | 同上 |
| `attention` | 行 | 「等你」条目 | 行 | 不限，按第 6.7 节排 |
| `home` | 行、卡片 | 见第 7 节 | 见第 7 节 | 见第 7 节 |

`home` 在 05② 里列为「以后」，第 15 批第 3 项的基础首页要用，所以第一片就要（第 12 节第 2 条）。

没有声明挂载位的插件，`plugin-slot` 什么都不放（IUI-13）。

### 6.2 形态

按这个顺序定一个对象的形态：

1. 用户在这个位置对这个对象（或这类对象）纠正过的形态；
2. 位置的默认形态；
3. 插件没声明这种形态，按梯度降一级：速览 → 卡片 → 行 → 名字片（IUI-03）；
4. 一种都没声明，或这个对象的 kind 没有声明：兜底（图标、名字、所属插件、「打开」，IUI-02）。

位置不接受的形态不用；降到位置接受的最大一种为止。`accepts_forms` 是集合，不以声明数组的先后决定大小；按 `PRESENTATION_FORM_KINDS` 的既有形态顺序选择。

### 6.3 字段

`presentationFormFields(object, form)`，SDK 里和页面共用的那一份。描述只写显示哪些字段（`key`、`role`），值由页面去取。

### 6.4 操作

对每个对象：

1. 取声明里的操作，按 `when.status`（用 6.5 读到的状态）和 `when.slots` 筛；
2. 动作目录里不存在的丢掉，并记一条诊断（声明在安装时校验过，这里只防安装之后动作被移除）；
3. 动作目录 `discover()` 给的 `availability` 不可用的不放；声明了必须让人知道原因的（对象被锁、等别人），放一个不可点的说明，写原因与去处；
4. 至多一个 `primary`；声明里多个都写了 primary，取第一个；
5. 按位置补通用操作：名字片和行补「速览」「打开」，卡片补「打开」「放进」「交给」；
6. `consequence` 从动作目录的现行语义填，不信呈现声明；不可逆复用平台的 `actionEffect(action, capability_id)`，包括省略 effect 时的现有判断和显式 effect 的覆盖，不在组合服务另写一套名称规则；
7. `prepared_input` 保留 `input_from` 的「输入键 → 字段键」映射，不填字段值；点击时在当时的授权下读取值并准备输入（05② 已合入合同）。

点下去时走动作网关，用点击时的授权，不用组合时的（IUI-07）。

### 6.5 规则要读的值

为了 6.4 的 `when.status` 和 6.7 的排序，服务要知道每个对象的状态。按 §8.1 的动作路由批量调用 values，只要状态字段和关系字段：

- `ok`：照常；
- `forbidden`：对象照放，`state: "forbidden"`，不给字段、不给操作，页面写「没有权限查看」；
- `deleted`：`state: "deleted"`，不留可点的操作；
- `stale`：`state: "stale"`，操作照 6.4 筛，页面写「x 分钟前的值」（IUI-10，05② SSC-13）；
- 调用失败或超时：当作 `stale`，没有 `read_at` 时只留名字片和「再读一次」。

### 6.6 同一件事只算一次

两个对象由 Context Ledger 里「派生」一类的边连着（比如待办「回复王小姐」是从 Inbox 那条记下的），在同一个位置只放一个：

- 留哪个：在「等你」里留进了「等你」的那个；别处留被派生的那个（源头）；
- 被合并的那个不消失，挂在留下的那个下面，写一句「待办里的『回复王小姐』是同一件事」（`TextRef`，参数是两边的标题由页面填）；
- 认哪些边：只认 contracts `modules/context-ledger` 里平台关系类型表登记的类型，不按标题猜；表由 C 轨在 C-3 里加，先放 `created_from`（第 12 节第 5 条）。这条边由执行「从这件新建」的平台路径写，不由插件自称。现在 main 上已有的同类边是 `placement.derived_from`，由 `placement.convert@1` 写（`horizontal/placement/src/index.ts:608`），类型是包里自定义的字符串（`:42`），没有登记处；Inbox 的「交给」「记成想法」是不是都经这条路，开工时再核（核账第 5 节）；
- `merged[].owner_plugin_id` 由服务按插件目录填，不用插件给的值；调用方读不了的被合并对象不放进 `merged`。

### 6.7 分组与排序

- `attention` 和首页「等你」：先「要你决定」，再「要你验收」，再「失败」，同一类按进来的时间，新的在前；
- 其余位置：按请求带来的顺序；纠正里固定过的排最前；
- 一个位置超过上限，多出的收成一行「另有 N 件」，点开在同一位置展开，不另开页面。

### 6.8 revision

`revision` = 对下面这些做稳定哈希：请求（调用方、项目、位置、对象）、相关插件声明的版本、规则字段的值版本、调用方的授权版本（动作目录 `discover()` 给的可用性版本）、纠正的 revision、「等你」与关系读取的版本。授权要算进去：只换了授权、别的没变时，可点的操作已经不同，revision 也要变，页面才会重画（C 轨评审 11-04）。同样的输入得到同样的 revision（IUI-04，05② SSC-07），页面拿它判断要不要重画。

## 7. 基础首页（与 #1778 对齐）

用户 11-04 定的基础首页从上往下是「等你」「接着做」「各插件的卡片」。服务给首页一份 `SurfaceDescription`，分成三组：

### 7.1 「等你 N」

| 定样里的 | 服务给什么 |
| --- | --- |
| 跨插件，同一件事只算一次 | 「等你」条目对应的对象，经 6.6 去重；组上给计数 |
| 「合并了哪件」 | 被合并的对象挂在留下的那个下面（第 12 节第 5 条：`SurfaceItem` 要能带被合并的对象） |
| 行用主按钮 | 每行的 primary 操作；「等你」组之外的行只给次按钮 |
| Inbox 停用时「少算了几件」 | 停用插件的「等你」条目不放，组上写 `excluded: [{ plugin_id, count, reason: "disabled" }]`（第 12 节第 4 条）。`reason` 只有 `disabled`，没有 `forbidden`：「有几件你看不了」本身就是泄露 |
| 点了某一行的操作，这一行就地变成回执「已验收 · 撤销」（D 轨共审补） | 服务不另给回执字段，回执由页面按第 10 节画：字取自动作元数据里结果的说法（同 6.4，不由声明自称）；「撤销」只在动作声明了反向操作时才给；回执留到下一份描述的 revision 到来为止，之后按新描述画（这件事已不在「等你」就消失）。同一件事在对话里那张卡也跟着变，靠的是同一个变更事件和调用记录（第 10 节） |

「等你」只从 attention-resumption 来；呈现声明里的 `attention` 只管色点和状态标签，不产生条目（05② SSC-11）。Feed 同步来的资料不进「等你」，所以首页的「等你」本来就不把它算成工作（WBR-24、BL-098）。

### 7.2 「接着做」

最近在做的几件，从工作记录读，最多 3 件，形态是行。工作记录的读取由第 21、28 批交；没交之前这一组不出（不拿别的东西凑）。

### 7.3 各插件的卡片

每个已启用的插件一张卡：

| 定样里的 | 服务给什么 | 现行合同与本片接线 |
| --- | --- | --- |
| 插件色带 | `owner_plugin_id`；颜色由平台分配（05② §10 第 1 条） | 有 |
| 一句概况，如「2 个目标在推进 · 1 件等你验收」 | 插件给的概况 | 已有 overview 声明与返回；S-2 通过 §14.5 的 `plugin_card.summary` 返回本轮文字引用 |
| 概况下的说明，如 Feed 的「同步来的资料不算你接下的工作」 | 插件给的说明 | 已有 overview.note 声明；S-2 绑定可信文字 owner 后放入 `plugin_card.note` |
| 两三行内容（行形态） | 插件概况给出的前几个对象，按 6.2～6.6 组合 | 对象有；「哪几个」要概况声明给 |
| 上面已列过的不重复，写「另有 N 件在上面」 | 服务按当前可读对象去重，组上给 `hidden_above: { count, label }` | 结构已有；S-2 接实际去重与文字引用，未授权对象不进计数 |
| 「打开」 | 去可信 Host 选定的插件主区 | S-2 的 `plugin_card.open` 固定原安装与 view，点击继续复核 |
| 新项目：「还没有内容」加插件自己的开始入口 | 概况在声明白名单里选择开始动作 | 已有选择协议；S-2 区分真实空输入调用与已有输入表单，见 §14.5 |
| Goals 读不到：显示真实上次读取值及时间，给「再读一次」 | 卡片 `state: "stale"`、`read_at`；行照 6.5 | 结构已有；只有主人本次授权读取返回的旧值才可显示，首次失败不造旧值 |
| Inbox 已停用：「已停用，内容都还在」，给「启用」 | 卡片 `state: "disabled"`；原生项目成员走 `projects.plugins.set@1`，项目签包走安装启用，Home 插件打开现有设置 | S-2 的三种精确安装恢复入口见 §14.5，不把成员关系当签名安装记录 |
| 没有声明首页内容的插件：只显示名字和「打开」 | 卡片 `state: "undeclared"` | 结构已有；S-2 接可信可见目录，不伪造概况 |
| Feed 的行标「本项目」「个人」 | 字段角色 `held_in`，值由 Feed 按真实关联给；只在一处同时出现两种值时才显示 | 字段角色已有；真实 values 与消费由本批接入 |
| Inbox 的「要紧 · 对上『手机排版』」 | 字段角色 `judgment`：标签加理由，主人给 | 字段角色已有；本批消费主人提供的现有有效判断 |

卡片的顺序：有「等你」的插件在前，其余按插件在 Dock 里的顺序；不按插件名写死。

### 7.4 首页的几种情况

以 Work Brief §1.1 前 2026-11-04 的更正为准：首页始终归平台，Work Brief 和其他插件一样注册卡片。原型里的「插件接管首页」只保留为历史模拟，不作为实现合同；生成页面采用、版本与恢复归第 20／37 批。

| 情况 | 谁管 |
| --- | --- |
| 后台在刷新：不清空，「更新了 1 处」 | 页面：比较新旧描述的 revision 和每项的值版本，只换变了的；服务保证同样输入同样 revision |
| 安装或启用声明了首页概况的插件 | 按相同目录和呈现声明显示插件卡，不按 Work Brief 名称分支，不替换平台首页 |
| 某个插件的首页内容读不到 | 该插件卡显示 unreadable 或真实旧值的 stale 状态；其余卡和基础首页仍可用 |
| 已采用的生成首页不可用 | 后续平台页面运行时负责回到基础首页；本服务照常提供 `home` 描述，不拥有页面定义或恢复状态 |
| 写文稿时安装或停用插件，不打断当前标签 | 工作台保留当前标签与草稿；回到首页时按最新目录刷新 |

## 8. 调用次数和缓存

### 8.1 一次组合

| 读 | 次数 | 说明 |
| --- | --- | --- |
| 插件目录与声明 | 0 或 1 | 按目录版本缓存在进程里，版本变了才重读 |
| 动作目录 `discover()`（带可用性） | 1 | 对本次所有候选操作一起取，不按操作逐个 |
| 主人 values（规则字段） | 每个精确提供方＋values 动作的最少批次数 | 每批最多 50 对象、32 字段；同对象不重复读取，最多 4 个真实在途调用；整次组合共用 1 秒截止，过期不再派发 |
| 「等你」 | 0 或 1 | 只有 `attention` 和 `home` |
| Context Ledger | 0 或 1 | 本次所有对象的边一起查 |
| 工作记录 | 0 或 1 | 只有 `home` |
| 插件概况 | 每个已启用、声明了概况的插件 1 次 | 只有 `home`；与 values 共用四个真实在途槽和整次一秒截止，见 §14.5 |
| 纠正表 | 1 | 一次读出这个调用方在这个位置的全部纠正 |

不按条目逐个请求，不重复读同一份数据（对抗式审查 N42～N56）。

### 8.2 页面一次画

一个位置：1 次 `surfaces.compose@1`，加上按主人精确 values 动作合并的显示字段批次；批次按同样的 50 对象、32 字段上限计算，不按对象各发一次请求。消费者在其实施片证明真实调用成本。

### 8.3 缓存与刷新

- 服务在进程里按（调用方、项目、位置、对象）缓存描述，键里带 6.8 的全部版本；下面任何一项变了就作废：插件目录版本、授权变化、主人的变更事件、「等你」变化、纠正写入。
- 描述里没有值，所以缓存不会让过期的值或撤权后的内容露出来；值由页面按需现取，撤权在取值时如实反映。按钮点下去时动作网关还会再核一次授权。
- 页面不轮询：主人发变更事件（智能呈现 §4.6），工作台转成对相关位置的一次刷新；页面在后台不刷，回到前台补一次（07）。
- 宿主重启后缓存是空的，第一次组合按 8.1 的真实成本算。

## 9. 降级

第一片不调模型，所以没有「模型不可用」这一级；第三片的助理组合失败时退回确定组合。

| 出了什么事 | 服务给什么 | 页面显示什么 |
| --- | --- | --- |
| 某个主人的 values 失败或超时 | 它的对象 `state: "stale"`；有 `read_at` 就带上 | 「x 分钟前的值」，「再读一次」；没有旧值只留名字片 |
| 撤权 | `forbidden`，不给字段与操作 | 「没有权限查看」 |
| 对象删了 | `deleted`，不给操作 | 「已删除」 |
| 插件停用 | 它的对象不放；组上写少了几件、为什么 | 停用卡片与「启用」 |
| 插件卸载 | 它的对象和挂载位都不放 | 不显示；挂载位所在页面已不在 |
| 插件没写声明 | 兜底 | 图标、名字、所属插件、「打开」 |
| 声明里的动作已不存在 | 丢掉这个操作，记诊断 | 少一个按钮 |
| 「等你」读不到 | 「等你」组 `state: "unreadable"`，不给 0 | 「暂时读不到」，与「没有要你处理的」分开 |
| 工作记录读不到 | 「接着做」组不出，记诊断 | 不显示这一组 |
| 整次组合失败 | 错误码 `surfaces.compose_failed` | 保留上次的画面，顶上一条说明和「再试一次」；不清空 |

错误码用 `defineErrorCodes("surfaces", …)` 声明：`surfaces.compose_failed`、`surfaces.slot_unknown`、`surfaces.mount_not_declared`、`surfaces.correction_conflict`。主人表 `tooling/gates/error-owners.json` 加一条 `horizontal/surfaces/` → `surfaces`。

## 10. 跨位置的操作

同一个对象可能同时出现在首页、对话和「等你」里。在一处操作以后：

1. 操作经动作网关交给主人执行；描述里的 `prepared_input` 只是预备，不写入；
2. 主人改了状态，发变更事件；
3. 所有放着这个对象的位置收到刷新：值变了就重取值，规则字段（状态）变了就重组合，所以「等你」里的那一行消失，首页卡片里的状态跟着变；
4. 回执：操作的那一处显示回执和撤销（撤销能不能做，由动作声明）；别处显示对象的新状态。定样里「在首页点验收，对话里那张卡也收成回执」：对话里的卡归助理（ai-interaction-experience），它收成回执靠的是同一个变更事件和同一条调用记录，不靠组合服务传话。卡片撤销的语义归 ai-interaction-experience BL-343。

批量操作照智能呈现 §7：按条显示成功、失败和原因，失败的可单独重试；服务只给每个对象各自的操作引用，批量由页面按条调网关。

服务不新增 DOM 事件；工作台把主人的变更事件转成位置刷新时，要新加的事件按 `dom-events.ts` 登记，由工作台的那一片加。

## 11. 拆片

按[开发流程 §8.4](../post-anticorruption-roadmap/reference/development-workflow.md#batch-grouping)，合同先做、服务接着、消费者最后；本批各片在子分支上开发，合回 `batch/15`，只开一个批 PR。05② 已合入的合同直接消费，不重新开合同 PR。

| 片 | 内容 | 谁写 | 前置 |
| --- | --- | --- | --- |
| C-2、C-3（05② 已排） | 呈现声明与组合服务的合同，**加上第 12 节要补的** | C 轨 | 02 交接；D 轨把状态环取值下沉到 contracts |
| S-1 服务骨架与四处位置 | 新包、端口、纠正表、`plugin-slot`／`conversation`／`discussion`／`attention` 的规则、6.2～6.8；宿主装配与两个动作登记；动作快照；包清单与 SSOT 行 | C3 | C-2、C-3 合入；C 轨交接 |
| S-2 首页位置 | `home` 的三组、插件概况读取、去重与「另有 N 件在上面」、停用与读不到 | C3 | S-1；第 12 节第 1、4 条进合同；工作记录读取（21／28，没交就先不出「接着做」） |
| 消费者 | 四种形态的组件、页面接线、Goals／Inbox／Coding 的声明（第 15 批第 2 项）；基础首页与 Feed 归属（第 3 项）；现有分支退出（核账） | D 轨、E 轨、各插件 | S-1；首页用 S-2 |

两片服务按依赖在本批分支上叠；子分支不开 PR。S-1 按第 12 节第 7 条的四个条件不等 16，随本批 PR 合入；S-2 和接页面的片在第 16 批切换之后合入，届时仍未就绪的按本批文件「粒度」及开发流程 §8.4 明确移交，不能把 S-1 完成写成整项或整批完成。

门禁与测试：

- 包里不出现插件 id：测试按已装插件列表在源码里找，一个都不许有；
- 不调模型：第一片的端口里没有 agent-host，测试断言组合时没有任何模型调用；
- 调用次数：测试用计数端口，断言第 8.1 节的次数（同一路由最少批次、关系一次……）；
- 内置插件和测试用的第三方插件走同一条路，结果同形。

## 12. 要定的事

前五条是合同缺口，C 轨 2026-11-04 评审已同意收进 C-2、C-3（[#1798 评论](https://github.com/molis-ai/molis-work/pull/1798#issuecomment-6636296876)），形状照下面写；C 轨等 #1771 合入后用一个文档 PR 并进 05② 第 5、6 节，合同的写法只留那一处。第 6 条 D 轨已定，第 7 条统筹已定，都写在下面。

1. **插件级的概况声明（C 轨已收）。** 首页每张插件卡要「一句概况、说明、前几个对象、开始入口」，05② 原来只有对象级的声明。
   - 在 `presentation` 里加 `overview: { capability_id, version, note_key? }`，指向本插件自己的一个 query 动作。
   - 输入输出 schema 由平台定死，声明者必须一字不差。输出是 `{ summary: TextRef; subjects: ActionSubject[]（≤5）; start: Array<{ capability_id; version }>（≤3） }`；`effect: "read"`，不调模型、不花钱。
   - `note`（如 Feed 的「同步来的资料不算你接下的工作」）是不变的一句话，写在声明里作 `note_key`，动作不返回。
   - `start` 里的动作必须在同一次注册里（`inspectActionCrossReferences` 查），后果照 6.4 从动作元数据取。
   - Home 级插件（如 Todo）的概况动作按调用上下文给可达的项目（`project_reach`），不在输入里带项目。
   - 没声明就是 `undeclared` 卡。
2. **`home` 进合同的第一片（C 轨已收）。** 05② §10 第 3 条说的是消费者的第一片，首页排第二片；合同里的 `SurfaceSlotKind` 现在就带 `home`，不影响 D 轨的消费者顺序。不选的路：首页像 MLN-23 一样绕过服务直接画，那样「等你」去重、「另有 N 件在上面」又成了页面里的一份组合代码。
3. **给人看的字都用 `TextRef`（C 轨已收）。** 不只是分组标题，「另有 N 件」「同一件事」也是。所以 C-3 排在第 14 批 A 段的 `TextRef` 合入之后。
4. **按种类区分的组（C 轨已收）。** `SurfaceGroup = { kind: "attention" | "continue" | "plugin" | "slot"; owner_plugin_id?（只在 plugin 组）; state: "ok" | "unreadable" | "stale" | "disabled" | "undeclared"; read_at?; excluded?; hidden_above?; title?: TextRef; items }`。`undeclared`、`disabled` 只用在 plugin 组，用错了 `assertSurfaceDescription` 拒绝；`excluded` 的 `reason` 只有 `disabled`。停用卡的「启用」引用 `plugins.installed.enable@1`。
5. **被合并的对象（C 轨已收）。** `SurfaceItem` 加 `merged?: Array<{ subject; owner_plugin_id; relation }>`；contracts 的 `modules/context-ledger` 加平台关系类型表，先放 `created_from`，由执行「从这件新建」的平台路径写（context-program §3.3 的 `intake`）。现有的 `placement.derived_from` 怎样并进这张表，随 C-3 定。
6. **两个字段角色（D 轨定，2026-11-04，[#1798 评论](https://github.com/molis-ai/molis-work/pull/1798#issuecomment-6636597572)；由 C 轨在 C-2、C-3 里收进合同）。** 现有 16 个角色都画不出这两样，硬套会把意思弄错：「要紧」不是生命周期状态，放进 `status` 会去改状态环；「本项目」「个人」不是来源，放进 `origin` 会和「从邮件来」这类值混在一起。加上这两个，一共 18 个角色。
   - **`judgment`：判断标签加理由。** 值的形状是 `{ label: TextRef; reason?: string }`：`label` 是主人声明过的词（「要紧」）；`reason` 是主人给的一句话（「对上『手机排版』」），平台不生成、不改写。理由里提到的对象如果要能点开，另放一个 `relation` 字段，不塞进 `reason`。这个词和术语表里的「判断规则」（`modules/judgment-rules`）是同一个：Inbox 的判断标签就是判断记录的结果。四种形态怎么画：名字片不显示；行里是一个带主人色的徽标，标签和理由写在一起，太长先省略，600px 以下不显示（卡片里还有）；卡片里一行徽标；速览里是徽标，理由写全。
   - **`held_in`：这一项挂在哪里，值只有 `"project"` 和 `"personal"`。** 不叫 `scope`（和动作的 `scope`、`AssistantScope` 撞名，C 轨评审），也不叫 `reach`（合同里的 `project_reach` 说的是 Home 级插件能到哪些项目，是另一件事）。值由主人按真实关联给出（Feed 按订阅属于项目还是个人），平台只校验是不是这两个值之一，不推断。只在一处同时出现两种值时才显示，比如基础首页的 Feed 卡，用中性的徽标写「本项目」「个人」；全是 `project` 的地方不显示。
7. **合入时机（统筹 2026-11-04 定，[#1798 评论](https://github.com/molis-ai/molis-work/pull/1798#issuecomment-6636404522)）。** 批次文件「在 16 的切换之后合入」管的是声明稳定键的部分和接到页面上的消费者。S-1 两样都不碰，所以**不等 16，可以先合**，条件四个：
   1. S-1 不改任何页面，不登记 DOM 事件，不加界面翻译；四处位置在 S-1 里只有组合规则和测试，接页面归消费者那一片；
   2. S-1 里给人看的字只引用插件目录已经声明的 `TextRef` 键，本片不新声明稳定键；测试用的键只放在测试夹具里；
   3. S-2（首页）和各处位置接页面的片，照批次文件在 16 的切换之后合入；
   4. S-1 排在 05② 的 C-2、C-3 和第 14 批 A 段的 `TextRef` 合入之后；动作快照变了，在 PR 里写对调用方的影响。

## 13. 验收编号（候选）

实现时测试名或注释写出这些编号。

| 编号 | 要达到的结果 | 对应 |
| --- | --- | --- |
| SCS-01 | 同样的调用方、位置、对象和版本，`surfaces.compose@1` 给出同样的描述和 revision；组合时没有模型调用 | IUI-04、SSC-07 |
| SCS-02 | 形态按纠正、位置默认、声明梯度、兜底的顺序定；位置不接受的形态不出现 | IUI-02、IUI-03 |
| SCS-03 | 描述里的操作都在动作目录里、调用方当前能调；`consequence` 来自动作元数据；至多一个主操作 | IUI-07、IUI-08、SSC-08 |
| SCS-04 | 撤权、删除、读不到分别给 `forbidden`、`deleted`、`stale`，撤权的不带字段和操作 | IUI-09、IUI-10、SSC-13 |
| SCS-05 | 没有声明挂载位的插件，`plugin-slot` 什么都不放；挂载位的 `max`、`refuse_kinds` 被遵守 | IUI-13、SSC-09 |
| SCS-06 | 由 Context Ledger 关系连着的两个对象在同一位置只算一次，被合并的挂在留下的下面 | WBR-24 |
| SCS-07 | 首页「等你」只来自 attention-resumption；停用插件的条目不算，并写明少了几件；Feed 同步来的资料不进「等你」 | WBR-21、WBR-24、SSC-11 |
| SCS-08 | 首页插件卡在读不到、停用、没有声明、新项目四种情况下各给对应状态，与「没有内容」分开 | WBR-21、WBR-25 |
| SCS-09 | 一次组合按精确提供方和 values 动作合并最少批次，每批最多 50 对象、32 字段；最多 4 个真实在途调用，整次截止后不再派发；关系与「等你」各一次，不按条目逐个请求 | 开工前检查第 9 项；§14.2 |
| SCS-10 | `surfaces.correct@1` 按 `expected_revision` 提交，冲突被拒；同一位置下次先照纠正来；被拒或取消的调用不写纠正 | IUI-06 |
| SCS-11 | 包里没有任何插件 id；内置插件与测试用第三方插件走同一条路，结果同形 | IUI-01、WBR-23 |
| SCS-12 | 描述里给人看的字都是 `TextRef`，主人取自插件目录；切换语言不重新组合 | FSS-34 |
| SCS-13 | 组合候选先经 `assertSurfaceDescription(候选, 候选)` 自查；重复的同种同主人分组被拒。呈现声明只在同一次动作目录里找到唯一且属于声明者的对象读取器时生效；没有、多个或属于别人的读取器均按未声明处理；停用、启用后重新判定 | IUI-02、SSC-19；05② 交接 |
| SCS-14 | 同一对话可混排正文引用与交付；默认前 6 件、原处展开，计数只含可读对象；对话之外拒绝交付子集，挂载位上限不能被展开绕过 | §6.1、§6.7；§14.2 |
| SCS-15 | 普通操作固定提供方；不可用说明与按钮互斥，原因取 owner 的文字键，去处复用同对象声明的可用只读或导航动作；同名提供方与助理改写不能重指向 | IUI-07、IUI-08；§14.2 |
| SCS-16 | 安装、换版及外部确认写入之前用同一完整目录验证跨提供方引用；停用但已装的声明仍参与，换版移除的旧动作不能满足引用 | SSC-06；§14.2 |
| SCS-17 | 「等你」只读活动持久条目；未授权或尚未核实的对象不进入对象引用或可读对象计数；停用遗漏只按 §7.1／§14.2 的已授权 Attention 事实聚合；关系仅两端已授权且位置相符时合并，伪造平台关系被拒 | SSC-11、SCS-06；§14.2 |

## 14. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 新事实只有一种：用户对位置的纠正，归本包。值归各主人插件，「等你」归 attention-resumption，关系归 Context Ledger，最近在做归观测层，都经公开读取，不另存 |
| 2 | 插件同等待遇 | 包里不出现插件 id（第 11 节门禁）；内置、生成、第三方插件用同一份声明、走同一条路；宿主不按插件开分支 |
| 3 | 能力注册 | 两个动作在动作目录登记一次，提供方 `system.surfaces`；`compose` 等插件的 values 动作，声明 `scheduling: "concurrent"`；可信身份取自调用上下文 |
| 4 | 合同 | 本包不改合同；用 05② 的 C-2、C-3，第 12 节的缺口由 C 轨在那两个合同 PR 里补；阶段 1，不留兼容期 |
| 5 | 放在哪个包 | 新包 `horizontal/surfaces`，依赖 contracts 与 plugin-sdk；不进宿主（用户 2026-11-01 定） |
| 6 | 表与存储 | 一张纠正表，在项目库，归本包，经 storage 驱动建表；进升级链的分界照 05② §8 |
| 7 | 兼容与迁移 | 不加。重建之后落库结构就是红线，先问用户 |
| 8 | 安全边界 | 读动作目录 `discover()` 的可用性，不执行；值不进描述、点击时网关再核，所以撤权不会因缓存露出。开工时在不变量表加一行：组合结果不含值、点击用当时的授权，带「拒绝」测试（撤权后描述里不带字段、点击被拒且不写业务记录） |
| 9 | 调用次数 | 第 8 节：每个主人一次 values，关系、「等你」、纠正各一次；页面一处一次组合，不轮询 |
| 10 | 升级与数据 | 纠正记录随项目库保留；描述不持久，重启重算 |
| 11 | 成果与过程项 | 不涉及：不产生成果，也不交过程项 |
| 12 | 页面与外壳 | 服务不出页面；页面接线归消费者那一片，新的 DOM 事件在那一片登记 |
| 13 | 错误 | `defineErrorCodes("surfaces", …)`，第 9 节四个码；主人表加一条 |
| 14 | 冲突面 | 新包无冲突；宿主装配碰 `apps/local-host/src/` 的动作登记处（枢纽文件，按并行开发第 2 节先查在途 PR）；包清单、SSOT、CODEOWNERS 由脚本生成 |

### 14.1 S-1 当前开工检查（2026-11-08）

目标是让四处位置的确定组合与用户纠正通过真实动作入口工作，达到 SCS-01～06、09～17；SCS-07～08 的首页行为归 S-2。没有模型、没有页面接线，不以纯函数样例代替宿主装配、持久化与拒绝路径。以下检查取代上一表在 `226ce892a8` 上已经过时的前置判断；实施完成后以实际 diff 和证据复核。

| # | 当前回答 |
| --- | --- |
| 1 事实主人 | 组合规则与纠正归 `horizontal/surfaces`；对象值、Attention 条目、Context Ledger 关系仍由现有主人给。服务不复制正文，不新增首页工作事实。 |
| 2 插件同等待遇 | 从可信插件目录取声明和 owner，内置与第三方走同一路径。复用 `findSubjectReader` 核对唯一读取器与声明 owner，不在宿主列插件名单。 |
| 3 能力注册 | 消费已有 `surfaceCompositionActions.compose`／`correct`，以 `system.surfaces` 登记一次；compose 为 concurrent query，correct 只给 user。actor、project、调用控制来自真实上下文。 |
| 4 合同 | 05② C-2/C-3 已合入；先复用现有形状、`presentationFormFields`、`assertSurfaceDescription`。自查能拒重复组，不再改 SDK 另建校验。宿主动作快照的两条新登记排在在途占用之后；发现形状缺口先交公共合同合审。 |
| 5 包边界 | 新包只做确定组合和本服务纠正记录；Host 只装配端口、生命周期与动作。持久化使用已有 storage 公开驱动，不由 Host 写本服务的业务 SQL。包注册、依赖和 README 随同一片更新。 |
| 6 表与存储 | 项目库已经是第 2 版。完整 S-1 需要本服务拥有的 `surface_corrections`，在当前 schema 加表并提供 2→3 连续升级；不修改旧段，不从普通读取路径补表。用户已批准此组升级与必要登记，见下。 |
| 7 兼容与迁移 | 不加兼容读取。第 3 版升级只新建空纠正表，已有项目内容、目录与插件表保持原样；先在 CONTRACT-CHANGES 记下具体版本维护，再写升级段。 |
| 8 安全边界 | 声明 owner 与读取器 owner 一致；不可达对象不泄露字段、操作与被合并引用。correct 在实际事务写点复查取消、授权与 expected revision；关闭后不再发起插件读取或写纠正。同步补安全记录与断言拒绝本身的测试。 |
| 9 调用次数 | 每次 compose 共用一份动作发现与调用上下文，插件目录至多一次；每个 owner 批量取规则值，纠正和关系各一次，attention 仅该位置一次。禁止逐对象调用会再次 discover 的解析入口；端口计数与真实装配都验，不能用短缓存遮住冷路径。 |
| 10 升级与数据 | 通过现有升级链验证 1→2→3、新建 v3、过新版本拒绝、升级失败保留旧数据，以及纠正重开后生效。保留旧金样，补存着项目库 v2 的金样并回放；仅隔离 Home 验证。 |
| 11 成果与过程项 | 不涉及：描述是即时投影，纠正是本服务自己的偏好记录，不写成果或过程项。 |
| 12 页面、外壳与文字 | S-1 不改页面、DOM 事件、翻译和资源；只引用目录已有 TextRef。四形态与基础首页沿已定样，组件板实件与页面消费者由后续 D 片接入，并受 16 切换约束。 |
| 13 错误 | 用 `defineErrorCodes("surfaces", …)` 与现有 ActionError 类别，不新增 Error 子类。候选自查失败归服务生成错误，不冒充模型输出错误或静默发布坏候选。 |
| 14 冲突面 | 独占新包；宿主动作装配、项目库 schema、包登记、版本表、错误 owner 表、宿主动作快照与金样为串行接线面。#1984 占用的 SDK／Manifest／动作快照不并发写；主台先安排交接，再由本批写手落地。 |
| 15 全局最优 | **插件**：Goals／Inbox／Coding 和第三方只提供同一声明，不为四处位置各做适配；**平台**：复用目录、授权、Attention、Context Ledger、storage，新增服务只拥有组合与纠正；**助理**：对话通过同一组合入口，外部 Agent 仍读已有文本形态；**平台能力**：复用公开动作和放置能力，不复制 Skill／连接器／工作流程，也不提前做采集；**后续**：15 S-2、52 第二片、63 助理组合共享此服务，20 的生成页面消费描述，不把生成页面生命周期塞进本包。相比继续在页面各排一份，统一规则可消除重复；相比把组合放 SDK，独立服务不迫使作者安装平台运行时。 |

**已核回的现成能力。** `findSubjectReader` 在 contracts 的 `platform/action-subjects.ts`，接同一份 discover 结果；SDK `surface-description.ts` 的 `checkedGroup` 在自查时已经拒绝同 kind／owner 重复组。S-1 通过调用这两处和行为测试证明，不再添第二个查找器或重复校验。

**用户已批准的准确范围（2026-11-08）。** 项目库 `database.project_database_baseline` 从 2 升 3；新建空 `surface_corrections` 的连续升级段，保留旧数据和旧升级段；补 v2 金样、结构快照及维护记录。新包还需要在 `scripts/workspace-packages.mjs` 登记、在 `tooling/gates/error-owners.json` 增加唯一 owner，并刷新派生包清单、CODEOWNERS、锁文件和宿主动作快照，不改门禁算法、阈值或 CI。用户在本会话选择「授权上述升级与必要登记」。v2 金样从基点 `226ce892a8` 的干净构建生成，使用独立的开发金样标签，保留 `0.1.0` 原样；此标签不是产品发版。

升级设计 §14 写过「组合服务的纠正表……同样不再问」，本稿 §3／§14 与用户本轮却仍要求红线先问；本次已将准确范围交用户确认并获准。真实 Home、发布、凭据与 vendor 不在本批许可范围内。

**验证安排。** 写手只运行自己新增的用例，均经机器槽、`--jobs 1`；交回前查健康门禁。本批写完才统一同步 main、构建，并按 affected-tests 与包 README 跑完整受影响集合；本机不跑 Full，最终头由统筹安排 CI Full。产品代码、工程结果、隔离实操和本人验收分别记，不把此检查表当成通过证据。


### 14.2 S-1 装配缺口与合同合审（2026-11-08）

公共合同台在 `85d54e86e0f10e53c1fb4ec8bd9b4271b8bd4074` 对本节至 §14.4 及公共来源 §7 的呈现承载设计合审通过，无 Blocker/P1（`gpt-6-astra / high`，只读，未跑测试）。此结论只覆盖设计，不覆盖尚未固定的 Host 接线或最终 PR。首页接入还须把原生 `definePresentationOverviewAction` 与 overview 校验补成同一自动读取门槛：明确 `execution.cost: "none"`、read/query、无模型和 external；不能只拦 values 和签名协议。

在 `efafe16f5e` 上按实际调用链核查，合同设计台给出的最小补充经过独立 `gpt-6-astra / high` 只读合审。以下是本片实施约定，尚不是代码或验收证据。公开形状维护在 [05② §5～§7](../shared-sources-and-surfaces/spec.md#6-组合服务的公开合同)，S-1 不重复定义类型。

- **对话用途、折叠与时间。** 请求的 `delivery_subjects` 是 `subjects` 的去重子集，仅对话可给；交付默认卡片、其余引用默认名字片。对话和讨论默认显示前 6 个，`overflow` 只记可读的折叠件数；`expanded:true` 在原位置展开，不改变 50 项输入上限和插件挂载位硬上限。它与首页上方已显示的 `hidden_above` 不共用语义。S-1 省略可选的折叠标签，不伪造词表键。条目的 `read_at` 只转发本次授权读取给的真实旧值时间；无时间的失败组是 unreadable。
- **动作和说明。** 普通操作固定精确 provider；同名跨提供方有歧义时不任选。`unavailable` 只有声明与输出两处：先筛外层 `when`，内部 status/codes 至少一个非空，两项同时给时为 AND；codes 只比可见的不可用行。命中时把按钮替换为 owner 文字键的 notice。去处只引用同一对象已声明的另一动作、复用其输入映射，且最终必须可用并为只读 query 或 navigation。权限隐藏的动作不出原因；provider、notice、后果由候选决定，助理不能改写。外发由动作 owner 的 `external:true` 显式声明，计费和不可逆用既有元数据，不按名称猜。
- **批量和截止。** SDK 允许一个主人不同 kind 使用不同 values 动作，旧“每 owner 一次”不能覆盖现行合法声明。按精确提供方和 values 动作合并最少批次，每批最多 50 对象、32 个规则字段，同一对象不重复读取；最多 4 个真实在途调用，整次 compose 共用 1 秒截止。截止停止派发并取消本轮子调用，不能把 Promise 超时当成底层已经结束后继续补槽。父取消或撤权直接传播，不能当作 stale 成功。动作必须符合现有 values schema、只读、不调模型、非 `external:true` 且明确 `execution.cost: "none"`；省略、unknown 和 metered 均不能作为自动 values 读取，标准声明 helper 显式给 none；复用 `presentationValuesProblems`。签名与原生自动读取采用同一边界，不能借组合触发外发。发现型 Attention 条目指向的对象尚未证明可读就不输出，也不进入 merged、overflow、hidden 或可读对象计数；有未完成读取时组给 unreadable，不伪装成空组。停用条目的独立聚合按下一条，不把 Attention 自身事实等同于对象正文。
- **Attention 的事实与排序。** 由 `modules/attention-resumption` 的窄批量读取只投影活动持久条目的 owner、规范对象引用、reason、revision、进入时间，不带 detail。现有 subject_type 到 kind 的对应由这个事实 owner 维护，不在服务抄 Inbox 分支；null owner 不猜。goal_decision 是决定，source_fault/artifact_out_failed 是失败，其余已存在且可读的条目可以按主人状态分类，无分类排在三类之后。状态只影响排序，绝不产生条目（SSC-11）。当前 Coding/Goals 的其他待验收没有进入此表，不假造；新增生产者与生命周期另议。本片不接 `/api/attention` 的后台任务和 AssistantNotices 聚合。插件枚举继续服从现有 attention:read 和原调用人的对象权限。
- **停用遗漏的准确口径。** §7.1 原有 user 停用计数保留：Attention 自身事实已有独立读取授权（`PluginAttentionClient` 的本项目显式 owner 条目），不以对象 reader 可用为前提。仅 user、当前项目、原 caller 授权仍有效时，按 owner＋规范 subject 去重统计活动 Attention 事实，且准确安装状态必须为 `disabled`；输出 owner 与数量，不输出其对象引用、正文或关系，也不算进可读对象数。它表示因停用未参与的 Attention 项，不声称对象仍存在、可读或已跨关系合并。crashed、quarantined、启动失败和权限拒绝不能压成 disabled；目录须保留真实状态。无授权的事实不计，非 user 不带 owner 和数字。该口径经独立只读复核，纠正本节先前“任何计数”的过宽措辞，不改变原首页验收。
- **关系只读与身份。** Context Ledger owner 提供限定候选引用的 active latest 批量读取，复用原有 scope、namespace、引用和访问校验。Placement 在自己的 Home 分区批读复制／派生边，并核对当前位置；Host 一次逻辑端口合并主人结果，不跨包写 SQL。两端必须都是本轮已授权候选且位置、kind、身份一致；不向候选外扩图。当前没有可信 created_from 生产来源，不能仅凭插件可自写的 type/cause 把它认成平台关系。真实链用 placement.copy/convert 验证。
- **安装目录。** Runtime 的安装、换版和外部确认 pin/save 前复用同一套 `validatePresentationDeclaration`、完整 `presentationCatalog`。Host 注入同作用域完整可信声明：已装（含停用和未授权）、待启动声明、系统定义、候选自身，去掉被替换旧版本；不能用 caller discover 代替完整目录，也不递归启动插件。Runtime 和安装 Service 遇到有呈现声明却没有可信校验端口时，按 `plugin.declaration_invalid` 拒绝。这里只核引用存在；组合每次另用同一份 discover 和 `findSubjectReader` 判唯一 reader 与 owner。保留现成 `presentationFormFields` 及自查重复组拒绝，`assertSurfaceDescription(候选, 候选)` 必须无 dropped。Home 串行、动态系统声明和同发行物重挂的边界见 §14.4。
- **纠正写点。** slot 与 subject 使用无碰撞键，位置级 form 不依赖 NULL 唯一性。form、pin、remove 是独立偏好，remove 优先；换形态不丢 pin。actor 从上下文来，项目库隔离。user compose 按本人 actor 读纠正；plugin compose 给空纠正及 revision 0，不因共享 actor_id 读到本人的偏好。await `beforeEffect` 后，最后同步控制检查与同一事务里的 revision 比较、写入递增紧邻；关闭、取消、撤权和冲突都不留业务记录。

文件边界：新服务包、contracts 的动作/呈现/组合与 Attention/Ledger 读取合同、SDK 共用声明/描述校验、事实 owner 的公开读取、Plugin Runtime 安装检查、Host 装配，以及相应 API/动作快照与拒绝用例。首页 S-2、页面、语言切换、DOM 事件、模型和生成页面均不在 S-1。每项必要扩展都为了补当前公开需求的接线，不新增持久事实或第二套权限目录；遇到无法通过现有端口闭合的信任边界须先向主台报告。

验证用 SCS-09、14～17 覆盖混排及原处展开、同名 provider 不重指向、说明和去处的输入复用、跨 kind 批次与真实在途上限、整体截止及撤权、隐藏项零泄露、跨项目和伪造关系拒绝、停用依赖的安装与换版旧动作剔除。其余保持 §14.1；`0.1.1-dev.1` v2 金样已从相同基线产品代码生成并重复检查逐字节一致（4,467,044 bytes，官方 Node v24.15.0，签名插件和 Home 库样本齐备），候选 v3 回放尚未运行。

### 14.3 签名插件的同一路径（2026-11-08）

本节设计及协议已分别经过独立复核；S-1 接线 `18502c873a` 与修复 `9851ae4bd10b` 已在 `ac3e527c71` 合回本批。独立 `gpt-6-astra / high` 在修复头关闭两项 P1，无剩余 Blocker/P1。真实同包预览、严格读取、安装、三个协议、compose/correct 与 Host 重开恢复纠正 5/5 通过；安装目录与集成包拒绝等原 8 项通过，两项新增拒绝反例亦通过，其中补权夹具首轮身份不合法，修正合法 Host 身份后单独 1/1。固定修复头 health 通过。以上为定向工程证据；旧金样回放、全批统一验证和最终 PR 合审仍未运行，不代表全批完成。以下实施条件保持。

- 协议查询用一份明确的本地只读 effects 白名单。普通 query 现有的联网能力不能沿用；`resources`、`capabilities` 等间接调用入口也必须拒绝。真实 runner 还须拒绝未声明的服务调用。
- 版本方案的直接依据是[合同变更 §3 第 3 条及当前保留机制](../../docs/system/CONTRACT-CHANGES.md#3-阶段一现在不留兼容期)：阶段一动作和 Manifest 按现行版本扩展，发行物留存属于现行产品功能。复核确认本方案无须新增审批；若实现须改变持久业务格式、重写旧包或增加历史读取分支，仍先回到红线确认。
- 同一个真实插件完成预览、打包签名、严格读取、确认安装、三个读取协议调用及 compose；关 Host 后从留存签名包重新启动，再验 discover、三个协议与 compose。另用现有旧金样原件完成候选回放，不重新生成旧包替代。

**真实缺口。** 现行签名包从 `contract.json` 经 SDK 的唯一动作投影生成 Manifest，再由 Host 比对投影后安装；运行时再次使用这份投影。目前投影没有呈现声明和三个读取协议的语义字段，普通 `SandboxSchema` 也不接受这些协议已有的开放映射等结构。仅给 Runtime 测试注册一个第三方 Manifest 不能证明签名插件能用；SCS-11 必须补真实打包、读取与运行证据。

**最小补充。** `SandboxPluginContract.presentation` 直接使用已有 `PresentationDeclaration`；操作只增加闭集 `read_protocol`：对象上下文（一个 kind）、呈现取值（kinds）和插件概况（无 kinds），外发继续用 `external:true`。SDK 的 `sandboxOperationActions` 从现有三个 `define*Action` 取得固定 schema、语义类型、只读 kind/effect；不接受包传入任意 ActionMetadata、提供方、权限、执行成本、超时或项目范围。普通操作仍使用原声明。协议查询只允许现有本地只读 effects，拒绝网络、连接、模型、图像生成、委托能力与写入；运行权限和费用仍由现有 effects 与运行策略决定。kind 沿现有唯一 reader 和 owner 规则，不为签名插件另加命名前缀要求。

签名 operation 的 input/output 必须与该协议的现行公共 schema 深等；用明确的协议类型分支表达，不将公共 schema 强转为有限 `SandboxSchema`。普通操作仍走原 `assertSchema`／`assertMatches`。三个固定协议的 examples 和真实 runner 输入、输出共用一个校验入口：先守住现有 JSON 与消息大小限制，再由 Kernel 的公开 schema 编译器校验平台选定的固定 schema。只为私有 sandbox 包登记现有 Kernel 依赖，SDK 不依赖 Kernel，也不新造 schema 解释器或放宽普通 operation 的关键词。

`sandboxPluginManifest` 在声明协议、外发或呈现时启用同一静态动作投影，并保留 contract 的呈现声明；旧 `interface.presentation` 是插件自身页面布局开关，语义不变。Host 的签名验证、原有完整投影比对和 `parsePluginManifest` 保持；CLI 继续原样传 contract，不加第二个呈现入口。运行 definition 保留静态协议字段，原动态授权、身份与 effects 检查不能被声明覆盖；Home 概况不因此得到额外项目范围。

**版本边界。** 本方案按阶段一公开分发合同在现行 v1 增加可选作者声明，不改持久业务格式、不提供双版本读取、不改写或重签已安装发行物。[Home 数据 §1](../../docs/system/HOME-DATA.md#1-怎么读) 把 `plugin-packages/` 定为原样保留的软件发行物，[金样 §2](../upgrade-continuity/golden-replay-design.md#2-一份金样里有什么) 单列已签字节，且它不在现行持久格式升级名单。没有新增声明的现有签名包须得到逐字相同的 Manifest 投影并原样回放；这是上述阶段一规则的适用范围，不是新增历史兼容许可。

**文件与交接。** 写手可改 contracts 的 `plugin-sandbox.ts`、SDK `sandbox-actions.ts`／`sandbox-manifest.ts` 及专用协议工具、sandbox 的 schema／runner、正常包依赖登记与独立 `tests/security-invariants-sandbox-presentation.test.ts`。第 10、16 批均核实并释放了 design-system 的 `plugin-components.ts`／`plugin-component-records.ts`，只在普通组件绑定中排除固定读取协议，不改界面或样式。创作台 `build-checks.ts` 的 G5 合成测试壳只移除真实 query 的协议标记；生产声明、样例和 G6 的真实权限保持。#1984 正占用的 SDK 根导出与共享 API 快照、Host `sandbox-package.ts`、CLI、两包 README、`tests/sandbox-pack.test.ts` 及其公共 fixture 保持串行交接；可读取复用，不覆盖。本批独立代码不得绕开原入口来避开占用。

现有 `apps/local-host/src/plugin-development.ts` 明确只运行 Integration；app 作者预览走真实沙箱预览及项目 Host 装配。该 Integration 入口不新增呈现 checker，也不把它当作 app 预览证据；签名 Integration 的呈现／读取协议仍在包边界拒绝。app 的正式安装和项目 Host 共用可信检查器，Runtime 遇到声明呈现却缺检查器时拒绝，不能为开发用途默认放行。

**验证。** SCS-11／16：上述同包预览、安装、运行与重开均须保留呈现、values、reader 与 external；伪造投影、未知协议、普通操作中的开放 schema、协议写入／联网／计费 effects、坏输入输出与撤权都被拒。没有新增声明的旧包原样回放。服务测试与真实安装证据分开；未完成安装、运行和重开前，不宣称第三方同等待遇已实现。

### 14.4 Home 安装的串行边界（2026-11-08）

在 `b6a7274fd8ac` 上完成调用链核查与独立设计复核，以下 SCS-16 接线已在 `18502c873a`／`9851ae4bd10b` 实现并完成定点实现复核，证据范围见 §14.3。修复前确认动作只串行同一个项目，两个项目能同时改一个 Home 的安装目录，导致最终声明检查通过后、Runtime 复查前目录变化，在 pin/save 后才拒绝。

**串行范围。** 唯一 `HomePluginHost` 复用现有 `HomeLine` 类，拥有一份专用实例。正常 `ready()` 完成后进入这条线，从最终版本、发布者与声明检查，经过 pin/save，持有到 Runtime 安装、换版及其内部启动或恢复结束。签名包的安装、换版、卸载与启用，包括直接 HTTP 入口，使用同一条线；内置 Home 插件的 enable 也必须进入，因为它可经 `recordToFollow` 跟随当前构建、改变目录。撤权和停用的立即失效不等待这条线。不能借用 LocalHost 全局 Home 动作队列：现有 Placement 会从 Home 等待项目动作，安装确认反向等待该队列会死锁。现有签名包启动只等沙箱 ready/stop；项目委托发生在业务 operation 内。曝光刷新用 Home caller 的原始 inspect，不启动或派发项目动作；实现改变此调用链时重新核对。

**排队后的授权。** 可信调用 control 从动作入口传到确认临界段。出队并完成最后异步准备后重新 `beforeEffect()`，紧邻同步目录检查和 pin/save 再核取消、调用权限与 closed，随后同步复查发布者 pin。不能只沿用入队前的授权检查。关闭先标 closed，拒绝尚未写入的排队回调，排空在途安装操作后再释放库。声明不合法、排队期间取消或撤权均不留下本次 pin、留存包或安装记录。

**系统声明取样。** 系统动作并非全是静态定义：已发布判断规则可重新登记，MCP 也可能有 system 身份。用现成 `isMcpToolCapability` 排除 MCP，并排除其它项目；在本次确认的最后检查复制系统能力 id/version 对，供该候选的预检及 Runtime 复查共用。取样只证明引用存在，不能保存调用权限；实际组合和执行继续现查。最小注入放在 Host 私有安装 helper 的调用上下文，绑定 scope、plugin id、版本、发布者签名及现有 `manifest_digest`，结束即失效。其它候选、下一次请求和普通 Runtime 入口重新读取。没有新增持久状态、摘要格式或 SDK 合同。

**已装发行物与目录完整性。** 同一安装记录、严格身份和 `manifest_digest` 的现行发行物重挂、enable 或恢复，不重新当作接纳新声明；仍做形状、可信 hook 和身份检查，依赖后来卸载只影响组合时的可用性。首次安装、卸载后重装、`recordToFollow`、新声明和换版均须完整检查；跨版本 rollback 不能按同发行物重挂免验。同范围旧签名 app 的 Manifest 可能没有 actions，目录读取须用现有 `SandboxPackageStore.load(id, signature, version)` 严格读取留存原件，再复用真实曝光的 `sandboxOperationActions`，含停用项；不改写或重签原件。已装记录覆盖待启动同 id，候选整体替换旧版，目录 reader 本身不启动 Runtime。

**失败后的原状恢复。** 第 08 批的 `changeInstalledVersion` 已有提交后失败补偿；本片复用它，不另建恢复流程。只有该 catch 的 `same(moved)` 成立后，Host 才可用私有、结束即失效的上下文包住原有 `platform.rollback`，对本次操作前的确切 release 免外部引用存在性重验。写前核对 scope、Runtime、plugin id、publisher signature、version 和现有 `manifest_digest` 与原 record 一致；Runtime 取得锁、实际执行 hook 时再核 active、closed、epoch、install id、installation generation 及当前仍是本次 moved 的 version/digest。形状、可信 hook、身份及生命周期检查不豁免。保留 `actions.provider_replaced` 直接退出，以及替换、卸载、关闭、epoch 变化不补偿的保护；跨 await 仍核归属，恢复后仍核原 version/digest/state，再恢复原批准值、曝光及提示词。失效的 caller `assertCurrent` 不能充当补偿许可，也不能复活撤销的执行权限。普通回滚、其它请求、同版本不同 digest 和上下文结束后的调用均完整校验；首次安装失败仍走 `abandonInstall`。这项窄边界已由独立 `gpt-6-astra / high` 只读裁定，不是运行证据。

第 08 批先在 [#1984 交接](https://github.com/molis-ai/molis-work/pull/1984#issuecomment-6732774500) 固定 `8fc71a40e879deec31c4ac3cb36a5571920f9215`。本批按其调用控制、恢复保护和成功启动后取消清理接续。最终头 `2703ca8b15` 已于 2026-11-09 UTC 经 [#1984](https://github.com/molis-ai/molis-work/pull/1984) 合入 `main` 的 `416ee8cef0`。最后的修复保留该安装生命周期实现，另带入限项目读取的 `heldInstalls`、助理定义库 v2 快照和共享浏览器夹具修复。第 15 批写完后统一同步实际合入版本，保留这些修复并按两批实际库生成快照，再跑受影响的安装拒绝、关闭与恢复用例。

**SCS-16 验证。** 两个项目共用隔离 Home，制造真实确认与卸载／换版的交错，验证两种先后：确认持线时目录变更不能插入；目录先变更时确认引用旧动作被拒，pin、留存包、安装记录均不变。另覆盖出队前取消／撤权、关闭排队、内置 enable 跟随构建、取样后系统规则消失而下一次确认重新取样、缺可信端口拒绝、依赖卸载后同发行物恢复，以及 Placement Home→Project 与安装确认并行不死锁。已有 SCS-11 同签名包的真实安装测试接上 compose/correct 后再记完整链路通过。

补偿反例：原 A 的外部依赖已卸载，B 不再引用该依赖；采用 B 后取消，原操作须拒绝并恢复 A。普通用户回滚到 A 仍拒绝；等待恢复时安装被替换不能覆盖新安装；恢复上下文结束后不能再次复用。测试走实际 Host/Runtime 入口，断言最终安装、实例、批准值和业务副作用，不只测上下文工具。

两项实现复核补充已固定在 `9851ae4bd10b`：同版本、同 digest 因补 required grant 而 `recordToFollow`，仍须在写入前完整校验声明；只有非 follow 才走同发行物重挂。失败恢复的私有控制区分“提交前仍属 moved 版”和“本次已写回原版”，后者延续至 executor 返回后与 redeem 后；关闭或换代时清理已启动实例，不登记 running 或发布激活，也不借用已取消调用的授权。对应安装测试分别断言拒绝且记录不变，以及实际恢复启动等待期间关闭后零激活、无 contribution、持久状态未变成 running。

### 14.5 S-2 首页接线设计（2026-11-09，服务片已复核，Host 与页面待实施）

在已合回的 S-1 `ac3e527c71` 上核对首页实际缺口。2026-11-08 用户明确 15、16、20 各自在独立工作树开发，取消跨批文件占用、逐段确认和会话交接。第 15 批按已定公共合同开发本批代码，统一同步 `main` 时处理重叠、接回准确的第 16 批页面授权和取词接口及第 20 批成员动作，再用实际合入版本验收。内置稳定词和页面在完整切换后的路径验收。本节复用 §14.1 的十五项检查，补充 SCS-07／08 特有边界，不新增库、升级段、事实缓存或插件特例。

**一份结果。** 现行 `SurfaceGroup` 没有概况、说明与开始入口，不能用页面第二次调用概况或把数据塞进 `title` 补缺。仅 `kind: "plugin"` 的组增加 `plugin_card`：可选 `summary`、`note`（均 `OwnedTextRef`）；`start` 至多三个，分为直接执行 `invoke` 和打开输入表单 `form`，两者均绑定精确目录动作与安装，表单分支再带 `view_id`、`panel`；动作沿用 `SurfaceItemAction` 的引用、必填 provider、primary 和后果，不接受通用操作或 `prepared_input`。`open` 固定为 `stage`，带可信 Host 选出的安装与 `view_id`；`enable` 明确区分 `project_membership`、`project_installation` 和 `home_plugin_settings`，前两种带精确动作，后一种只打开现有设置。安装引用统一带 `scope`、`install_id`、`installation_generation`、`version`、`manifest_digest`，前两种启用只能指项目 scope，设置分支只能指 Home。组的 canonical owner 与当前目录决定目标，不携带任意输入或 URL。SDK 把整段作为候选事实原样保留，助理不能改写文字、路由或启用类型，非 plugin 组带它直接拒绝。

“描述只有引用”在首页的准确含义是：不带对象字段值或准备输入值；本轮已授权的插件概况与静态说明允许带文字引用及参数，不带译好的句子。`summary` 来自本轮概况，`note` 来自确切 Manifest；文字 owner 从该读取器的可信插件身份绑定，不信返回值自报 owner。完整引用与参数、概况状态、目录与授权版本进入本轮 revision。现有描述缓存只有在本次所有读取和授权复核后才可命中；概况失败／被拒的卡不回退旧 summary，不能借命中跳过读取或 retain。无须另加与 groups 平行的展示结果。

**目录与顺序。** 只为当前可信项目的本人调用组合首页，插件 audience 在任何首页事实读取前被拒。Host 给服务同一份当前安装、项目成员关系和工作台主区投影；canonical plugin id 是唯一 owner，shell key 只留在导航适配。双实例只出一张卡；打开复用现有 `dualStageOwner` 的实际 view owner，概况独立绑定唯一可用的声明、scope、install 和 provider，不拿没有概况的 Home 半部替代项目半部。两份有效概况无法按现有可信路由唯一决定时不任选，卡为 unreadable。真正 disabled、项目隐藏、卸载、启动失败不能互相替代。

Dock 的个人固定顺序目前只在浏览器，不在 Host 存储。首页请求可给有界、去重的 `home_order`（canonical plugin id 列表）；页面沿已有目录把 shell key 投影为 canonical id，不另存一份顺序。该输入只排序服务已经取得的可见候选，未知或已不可见 id 不产生卡片或权限。可读「等你」所在插件优先，其余按当前固定顺序及既有导航默认顺序；不能宣称 Host 已持有浏览器 pin 状态。

**一次读取。** 保持一次目录、一次 discover、一次纠正和至多一次 Attention 读取。每个已启用且合格的概况最多调用一次；现行 `definePresentationOverviewAction` 补明确 `execution.cost: "none"`，SDK 声明校验和运行前检查都要求 query、read、无模型、非 external，与 values 相同。概况与规则 values 共用四个真实在途槽和整次一秒截止，截止后不补派。概况失败只影响本卡；父取消、撤权直接传播。保留本轮所有实际依赖的精确路由授权，并在等待后及结果交付前重新检查。

动作目录的元数据和原注册身份须在同一次同步目录取样中绑定，再跨异步边界交给组合服务；不能 `await discover()` 后仅凭 ref/provider 重新保留当前注册，让旧 schema 配上新注册的授权。注册身份仍由 Kernel 的现有登记表拥有，Host 只转发同次取得的保留能力，不比较元数据冒充身份、不另存代次。潜在候选可先捕获，但取值前只激活真实 reader／values 依赖；状态和形态选定后再激活实际返回的操作、notice 去处和通用操作依赖。未命中 `when` 的声明操作、未展示的 placement 操作不能因变化而拒绝整页。 同次目录分批激活的依赖共用一次当前性检查：先执行所有已激活依赖的授权回调，再对它们的原注册作不执行回调的同步尾检，防止后一个授权回调替换前一个刚核过的注册。

合并 Attention 与各概况给出的对象后，先按真实 reader 和来源 owner 核对，再对同一个对象去重；规则 values 按既有精确 provider／动作、50 个对象、32 个字段合最少批次。对象全部有当前读取结果后仅批查一次关系，两端可读才合并。先产出「等你」，插件卡再扣掉上方已经表示的对象，`hidden_above` 只计本次可读对象。工作记录还没有交付，本片省略「接着做」。页面一次 compose 后只补显示字段的合批 values，不再读一次概况。

**Feed 的本批最小接入。** 真实 Attention 记录保留 Feed owner，条目和来源故障分别指向 `feed_item`、`source`；Inbox 的 `inbox_entry` 只是事项壳，不能代读。S-1 先匹配同主人声明再选同 scope 的唯一 values，因此只补 values 仍不会进入可读候选。本片在 Feed 项目 Runtime 同时声明这两种对象的行形态、实际使用的标题／状态／时间／来源／归属字段及一支共用只读 values，复用现有两支 subject reader；概况按固定协议提供本轮文字引用、至多五个可读对象和现有打开入口。无真实开始动作或表单绑定时不给 start；可选建议只读已有有效结果，不为首页启动模型或同步。第 52 批仍负责完整 Feed 卡片、跨位置挂载和研究呈现。

归属按授权分区内的条目 `source_id` 读取来源原记录，以 `SourceRecord.project_id` 与 `PERSONAL_SPACE_PROJECT_ID` 判定；来源对象用自己的项目，空来源或无法核实就省略，不能按 Gmail／RSS 类型猜。个人分区走同一个项目 Runtime；Feed 的 Home 实例是证据账本，不能借它跨分区聚合。只在同一可读组确有本项目／个人混合值时显示归属标签。Feed Item 的 `read_at` 是用户阅读时间，不能当作旧值的上次成功读取时间。同步材料不自动产生 Attention 或工作计数；同一可读对象在「等你」和概况之间去重，撤权后不留隐藏计数。WBR-24 验同项目 Gmail 与 RSS 同属项目、个人分区、缺源不猜、无 Attention 的同步资料不计工作、现有条目／来源故障可读与去重，以及撤权拒绝。

**空态与旧值。** 新项目从插件真实空结果给概况与开始；没有声明只给插件名字和可达的打开；停用只给保留内容的说明及真实可用恢复入口。概况失败／超时给 unreadable，不带其动态 summary、候选和开始操作，其余卡仍可用。概况成功而某行只能读到旧值时，只用主人在本次授权读取下返回的旧字段及原 `read_at`；卡内全是旧行才沿 S-1 最早真实时间标 stale，新旧混合逐行标。不得把旧首页内存或描述缓存当作当前授权证明。Goals 若实现上次成功行投影，只能由 Goals Runtime 有界保留并在基础读口再次核存在性及当前权限后返回；删除、撤权和切项目均不能返回旧行。

概况成功但其对象首次取值失败或共用截止耗尽，也须把该插件组标为 unreadable，不能因不可读行省略后变成 `ok` 的空组。失败只归实际受影响的 owner；forbidden／deleted 对象不作为失败计数或恢复旧值的依据。已成功读取的本轮概况与已核可用的独立开始入口不因此伪装为旧值，也不把其它插件的成功卡降级。

**点击。** 开始动作必须同时属于 Manifest 的 start 白名单和本轮概况返回，固定同一 owner／install／provider，当前可用。声明项增加可选 `open: { view_id, panel }`，概况仍只选择动作引用，不另回路由。无 `open` 时，空输入须通过实际 schema 才可生成 `invoke`；有必填业务字段的动作不假造输入。有 `open` 时只生成 `form`，点击复核当前安装、声明、概况选择、动作权限与实际表单后，沿已有 `UiViewSelection.panel` 和 `molis-work:select-item` 导航；仅打开和取消均零业务写入，用户填表并提交后才走既有动作网关。

Goals 在自身声明中把 `goals.create@1` 指向 `stage/create-dialog`，自身页面消费选择并调用原 `openCreate()`。Host 不识别 Goals 名字：SDK 校验只接受本 Manifest 的主区与有界 panel，Host 匹配同贡献的实际浮层；签名包匹配其已签组件中绑定该动作的真实输入表单。签名页面只接受当前父 pane 的选择，复用组件已有打开和聚焦行为。原生与签名安装共用声明、权限与点击复核，不能以 Goals 专用分支绕过第三方同等待遇。

**签名表单提交。** 源码核对发现，当前已装签名组件的 `submit` 仍把组件和表单值送到 `/call` 后直接执行，不能仅接通首页导航便宣称经过统一动作网关。本片让所有已安装签名页的表单提交共用现有 `/api/host/plugin-page-actions`，增加封闭模式 `{ mode: "component_submit", component_id, payload }`；不收客户端给的动作、提供方、安装或项目身份，不保留首页专用提交分支。普通组件读取及未安装的创作台预览仍走各自现有读取／试运行路径。

项目与 Home 签名文档均通过现有 `PluginPageAuthority.open` 的 `selected` 绑定确切 scope、安装和发行物检查，Home 从项目打开时保持原 `assertProject`。Host 从原激活的可信 `definitionOrigin`／`rememberInstalledActionSource` 取已验证 node，复用 `resolvePluginComponentCall(node, "submit", payload)`，动作引用复用实际曝光投影：`exposedActionId`、曝光动作的数值版本（不是安装记录的版本字符串）及 `plugin:<canonical>`，不能误用页面通用分支默认的 install id 提供方。现行合法签包没有 `Manifest.actions` 时也只取同一安装真实注册的曝光，不改写或重签包。提交继续用 `pluginActionView`、当前页与安装检查、现有 bound action client 及 `withPluginPermissionChecks`，在本人精确动作范围内执行，并核目录行的 `plugin_install_id` 与 scope。

签名组件提交须保留现有两种授权的区别：本 operation 的自身服务 effects（含声明的本地后台闭包）沿 SDK 唯一投影，由原 activation 的 requireGrant 核对；受委托 capability 由原安装的 sandboxGrants 核对声明和批准交集，不把目标的权限名当成本包自身服务授权。原曝光登记已经计算该 operation 的完整权限闭包，网关只从这份现有登记读取，并捕获原登记／policy 的当前性检查；不第二次扫描目录推算、不解析 binding 字符串。两种证明均通过后，本人 caller 只获得这一条精确曝光动作的闭包与 allowed_actions；等待后、写前继续核原安装、同一 policy 和两种授权，不能更新到新 policy 后继续旧请求。实际委托仍由既有 sandbox broker 与 catalogCapabilities.call 再核 capability id 和精确目标；仅另一 capability 持有同名权限不算批准，自身服务 grant 缺失也不能借委托闭包补足。此适配仅用于原页绑定的签名 component_submit，不放宽普通页面或公共 ActionClient。

原文档的异步写前检查也必须保留：`pluginPageRequest(request).beforeEffect()` 含 Home `packageDocument` 捕获的项目可达性检查，不能用仅查 `page.assertCurrent` 和动作可见性的闭包替换。网关把原文档检查与同步的页／安装检查组合后，经现有 `withProjectReachInvocation` 传入实际执行 control，每次写前仍检查原项目。

旧签名 `/call` 拒绝 `binding: "submit"` 和外部原始 `{ operation, input }`。内部动作桥只在 `currentPluginAction()` 与原激活、安装代次、实际提供方和动作 `local_id` 全部相符时进入原沙箱执行段；HTTP 同样有 `execution`，不能再以它存在作为内部调用证明。保留现有 `withProjectReachInvocation` 和生命周期 control，执行段不回调页面网关，避免递归。项目已装页 GET 和 `/call` 目前只匹配 `io.molis.work.generated.<uuid>`，须改为现行合法插件 id 后再核当前项目的确切签包／生成安装记录；未知、内置或 Home 仍沿原分流，不增页面或授权路由。

打开、开始及启用都按原卡的完整安装引用比对当前记录；同名不同 scope、卸载重装、换代、同版本不同 digest 均拒绝旧卡。主区继续走既有 `dualStageOwner` 与挂载 producer，签名懒加载页取文档时再核原安装，不能先验旧记录、等待后打开新包。导航意图由可信 Host 适配为现有工作台选择，不把 `UiViewSelection` 当作已经具备跨 owner 权限的公开入口。

原生项目插件的“启用”事实属于 Projects 的成员关系，不能伪装成只控制签名安装记录的 `plugins.installed.enable@1`。第 20 批在固定头 `3a8a3703ed`（合同与 owner 前置 `33cd1028c6`）已交 `projects.plugins.get@1`／`projects.plugins.set@1`，设置 HTTP、市场、选择器和 Coding 共用同一写口；本片直接复用，不新增 `projects.plugins.enable` 或第二份 HTTP 桥。`project_membership` 候选额外保留本次 compose 同一次可信 Catalog 读取的 `expected_revision`，该值进入组合 revision，点击原样交给 set，不能读一个新 revision 代用户重试。项目和操作者从调用上下文来，Host 按可信注册、发布者和当前安装把 canonical id 映射到 `ProjectPluginId`。

普通卡的可见性沿 Projects 的实际成员／隐藏计算，不拿包含嵌入依赖的运行可达集合代替。原生项目插件被移除时会退出成员列表，因此在普通可见卡之外补恢复卡：须未被主动隐藏、已有成员移除事实、当前已非成员且不再因嵌入而应运行，同时可信的原安装确为 disabled。移除事实在同一次 Catalog 取样里复用既有 `wasProjectPluginRemoved`，不另存状态；只有嵌入运行经历的安装不能因此冒出首页卡。恢复卡不授予主区或概况读取，只保留原安装与本次成员 revision。从未安装、已卸载、仍应运行却未启动、crashed／quarantined／blocked 和切换未完成均不冒充已停用。常开与有效隐藏规则仍由 Projects 计算。

成员 revision 不含安装代次或 digest，所以旧卡仍须独立核原安装。受保护首页入口复用第 20 批 `projectPluginSetter`，把当前页面检查与仅限本请求的确切安装检查合成可信 `assert_authority_current`：从已打开项目的现有 `pluginInstallRecords` 同步比较 scope、owner、host trust、install id、generation、version、digest 与仍可启用，再进同一个动作网关。`project-workspace-actions.ts` 已在 `catalog.commit` 出队、最后 await 后、调用 `setProjectPlugin` 前同步执行该检查，随后 Projects 在自己的事务内核成员 revision。无需改变公共 set schema、Projects owner 或 Runtime 枢纽。提交后的 Runtime 切换和 503 沿用第 20 批语义：成员选择已经保存，重试只读、重开项目恢复；不能误报未保存，也不能在本次合法启用后仍要求 disabled。

项目签名插件仍走 `plugins.installed.enable@1` 与受保护页面入口，但其 `expected_installation` 改为必填，现有设置列表及按钮一并携带当时看到的代次和 digest；没有发现当前 CLI 消费者，实现前再以实际引用核对。比较在 ProjectLine 出队并取得实际记录后进行，沿既有生命周期 control 贯穿 Supervisor 等待和 Runtime 启动；首个写点要求仍为 disabled，本次成功启用后只核同发行物及当前授权，不再要求 disabled。写前继续 `beforeEffect` 和同步当前检查。Home 签名插件去现有设置入口完成 S94，不给首页或插件 frame 伪造设置凭据。服务只给候选，不启用插件；界面回执仅在真实成功后显示。

当前基线的安装启用链尚未完整传递该 control：`plugin-install-actions.ts` 的调用须保留原 caller，经 `plugin-trust-actions.ts`、`project-plugin-ports.ts` 和 `installed-plugin-lifecycle.ts` 传到 `PluginSupervisor.enable`。Supervisor 的 gate 出队及 `restart`／激活路径继续传递原检查，最后交给已有支持 control 的 `runtime.start`；不能只在进入队列前检查一次。此处只补既定授权与安装身份的贯穿，不另建启用服务或状态记录。

**文件与验证。** contracts 的组合／呈现及签名安装动作，SDK 声明和描述校验，`horizontal/surfaces` 的首页编排及共用读取，Host 的 `surface-actions.ts`、主区／安装控制和薄适配，以及各自派生快照。生产页面、Dock 输入、Goals 选择消费、签名组件选择接线和插件声明由本批后续消费者片接入。复用现有 DOM 选择事件。第 20 批的成员能力为依赖，已知固定头 `33cd1028c6`、`37a5eb8b55` 定 owner／合同／常开语义，`5b520337f9`、`295dd67801`、`3a8a3703ed` 定 Runtime 切换、本人入口和已保存回执。生产接线使用实际合入的成员能力，最终只生成一次两批共用的宿主动作快照。

签名提交接线增加的精确范围为 Host `plugin-page-http.ts`／`plugin-page-actions.ts`、项目与 Home 页面激活装配、`installed-action-registration.ts`、`plugin-builder/exposed-actions.ts`／`installed.ts`／`agent-surface.ts`，以及 Builder 的 `agent-studio.ts` 已装分支。页面凭据和 Runtime 控制沿用现有能力，相关页面身份安全不变量与拒绝测试同步更新。统一集成保留第 16 批对原会话、原激活、项目和取词来源的围栏。

SCS-07／08／09／11／12／17 验真实空 Goals 和已签安装包从首页打开表单，打开与取消零写、提交一次；Inbox 停用及恢复、双实例主区、同对象跨组扣除、概况返回后撤权、隐藏计数零泄露、首次失败与真实旧值恢复，以及冷路径实际调用次数。拒绝反例涵盖伪 panel、跨贡献、同名不同 scope、换代、同版本不同 digest、排队期间撤权，以及懒加载期间换包。原生启用分别制造排队期间成员变化和成员 revision 不变的安装换代，均零成员写入；真实提交后切换失败返回 503，重试只读。不改门禁算法、阈值或 CI，不用 Mock 的状态常量代替最终首页实操。2026-11-08 的两处设计 P1（Goals 必填输入无入口、旧卡缺安装绑定）按上述方案处理，仍须实现复核与公共合同合审后关闭。

签名表单验收使用普通第三方 id 的真实签包，从首页和插件主区分别打开同一表单：正常提交经同一网关只写一次；提交前及写前撤权／换包、原页关闭、旧 `/call` 直接 submit、伪造 raw operation、跨项目复用页面均零写。现有 Home 项目可达性用例的合法提交迁到新入口，旧入口保留明确拒绝断言；未安装 preview 的有效验证保持。公共合同台已在 `a179bc797a` 定点通过此设计，关闭签名提交设计 P1；网关实现与定向运行证据见下，从首页打开同一表单仍待消费者片。实际提供方可直接取既有 `currentPluginAction().caller.current_action` 的精确引用，无须增加另一份动作上下文。

**服务片证据（2026-11-09）。** `49a73dc803` 实现首页编排与公共卡片合同，`b0e5049188`、`2f626ce4f6` 修复独立复核指出的三项 P1；最终头经同一评审人定点复核全部关闭，无剩余 Blocker/P1，于 `8bcc6cc3ff` 合回本批。Host 依赖闭包构建及 server/browser 类型检查通过，`tests/surface-home-composition.test.ts` 10/10，`tests/surface-home-contracts.test.ts` 最终 8/8；其中三项真实 Kernel 尾检反例修复前均漏拒、修复后均拒绝，未跳过。最终 Kernel 定向构建、API 快照检查、health 门禁及 diff 检查通过；原 S-1 三处已登记巨大单元提示未在本片增加。生产首页的可信目录投影、插件声明、Feed 和页面接入尚未完成，后续签名表单网关证据见下；这些局部证据不代表最终 Host 实操、全批统一验证、公共合同最终合审或本人验收。

**生成插件的声明闭包修复（2026-11-09，已定向验证）。** 网关片沿真实 Studio G2 检查发现，S-1 为 SandboxReadOperation 和 presentation 增加的类型引用未进入原 SDK 声明文件清单，生成插件因此在类型检查报缺失 actions／presentation。本批负责修复：将唯一 ActionSchema 别名与呈现声明的数据形状抽到纯合同叶子，原公开入口继续导出同一份；沙箱合同只引用必要叶子，生成 SDK 仅补这些声明及其 ui-text／ui-state-rings 依赖。不复制第二套类型，不改变 schema、版本或 G1～G6 检查，不为通过而放宽 authoring 同步文件范围。验证真实生成插件门禁和带 read_protocol 的签包声明；原浏览器 frame 定位失败单独诊断，不作为网关验证通过或产品缺陷的替代证据。

**签名网关片证据（2026-11-09）。** 固定头 `e8626e303b`（含声明闭包修复 `3d4ea2f703`）经独立完整复核无剩余 Blocker/P1，于 `bfcc55bb43` 合回本批。真实第三方签包验证正常提交一次、旧 submit／raw 拒绝、伪身份／跨项目／关闭页拒绝、同版本不同 digest、仅提供方或仅 scope 更换、委托批准与自身服务 grant 在等待期间撤回均零写；Home 原项目撤回后同样零写。固定协议 3 项、旧原始调用拒绝 1 项、Home 可达性 RAC-2647、Studio 发布安装提交主流程、英文界面与真实 HTTPS 升级分别通过；Studio 测试复用真实 HTTP 核心并在后续同步检查前正常释放其 Home owner，最终主流程自然退出。Host 依赖构建、health 和 diff 检查通过，声明提取未改变公开 API 快照；真实 Host 51 条资源无遗漏，Builder 脚本 101,303 字节，对基点 101,339 字节减少 36。一次 Home 测试发生原因未明的 `ECONNRESET`，原断言单独复跑通过，未将断线当作拒绝证据，整批验证继续跟踪。最终统一检查仍须覆盖完整 Studio 与既有 agent-built-plugins-workflow 路径；本片不代表首页导航、启用、Feed、跨位置消费者或本人验收完成。
