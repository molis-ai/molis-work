# 第 36 批第 2 项合同设计稿：事项容器、事项来源与主线服务

状态：已实现（2026-11-16，第 36 批第 2 项），落地时的改动记在 §10。设计稿 2026-11-15，已评审（M1～M7 已改入）。需求在[主线](spec.md) §2、§5、§6 与[事项线](../work-line/spec.md) §5、§6（第二片）；本批交合同与服务，切换器、列表菜单与按事项的工作台状态在第 37 批第 2 项。主线服务包第 32 批已建（线读取、安放、后台任务，不存东西），本批在它上面加事项容器与存储。

验收：MLN-12、MLN-13、MLN-14、MLN-18、MLN-22，以及本稿 §9 的 MLC-01～MLC-14（服务层，界面验收随第 37 批）。

## 1. 一览

| # | 做什么 | 落在哪 |
| --- | --- | --- |
| 1 | 事项与主线的类型、动作 | `packages/contracts/src/services/mainline.ts` 增量 |
| 2 | 事项来源声明：呈现声明里一种对象可以带 `item` 一节（新建、自家关联、下一步三个可选动作） | `platform/presentation-declaration.ts`、SDK 的 `validatePresentationDeclaration`；动作形状 `platform/work-items.ts` |
| 3 | 主线存储：每人每项目的事项、分组、顺序、固定、当前、最近、已完成，事项里装的对象 | `horizontal/mainline` 新 Home 库 `mainline/mainline.db` |
| 4 | 「装进事项」是一条 placement 关联，由主线服务用 `placement_relation` 声明（关联名 `holds`） | 主线服务的五个关联动作 |
| 5 | 线读取按事项给；事项来源的下一步上线；安放多「另一件事项」「不归事项」 | `readWorkLine`、`placeTask` |
| 6 | 首批来源：Goals（`goal`：新建、下一步）、Coding（`coding_session`） | 两个插件的呈现声明与动作 |

## 2. 事项与主线

```ts
// 事项本身是一种 ActionSubject：{ kind: "work_item", id: item_id }。placement、搜索、组合服务都按它认。
interface WorkItem {
  item_id: string;
  /** 直接新建的轻量事项的名字；由插件对象变成的事项没有名字，名字、状态、完成向 source 的主人读。 */
  name?: string;
  source?: ActionSubject;
  created_at: string;
}
interface MainlineGroup {
  group_id: string;
  /** 默认三组：现在、接下来、等别人。改了名字就有 name，界面文字只按 default 取键，不存译文。 */
  default?: "now" | "next" | "waiting";
  name?: string;
  /** 组内先后；固定的在前，顺序也在这里。 */
  items: Array<{ item_id: string; pinned: boolean }>;
}
interface Mainline {
  /** 写入凭据：排列的每次写都要带上读到的这一个，别处改过就拒（conflict），带当前值。 */
  revision: string;
  items: WorkItem[];
  groups: MainlineGroup[];
  /** 已完成：用户确认后收进去的，最近的在前；可撤销、可放回。 */
  completed: string[];
  current: string | null;
  /** 最近切过的，最近的在前，最多 3 件（MLN-23），不含已完成。 */
  recent: string[];
}
```

- **事项只是容器（MLN-22）。** 合同里只有名字、由哪个对象变成、装了什么、排在哪；没有状态流、负责人、截止、评论。已完成只是排列的一部分（收进「已完成」折叠区），不是事项的状态：由插件对象变成的事项是否「完成」向主人读，用户确认后才收进去。
- **每人每项目一条主线**，本人、项目从调用上下文取；第一次读时给出默认三组、空事项。
- **一个对象只变成一件事项**：同一 `source` 再「设为事项」返回已有那件。
- 名字最多 120 字；分组最多 20 个；一条主线最多 500 件**未完成**事项；一件事项最多装 500 个对象。超出时拒绝并说明（`mainline.limit`）。已完成的不计入上限，读取只给最近 100 件和总数。
- **当前事项按人与项目各一件**，不按窗口；每个窗口自己的工作台状态归第 37 批。最近切过的列表后写为准。

## 3. 动作（`system.mainline`，项目范围）

每件事项有独立的整数修订，从 1 起步。实际改名或转成对象时与事项同笔递增；原名改回也算一次。同名写入、移动事项及改动其他事项均保留该版本。正式对象的正文修订同时计入来源对象当前的修订。

本人、Agent、MCP 都能调（MLN-13）；工作流只能读。改排列的写动作（移动、改组、完成、移出、改名、变成）带 `expected_revision`，排列冲突回 `mainline.conflict` 并带当前主线；只追加的写（新建事项、`holds` 的新建与放进）和切换不带，免得两个窗口互相冲突。权限：读 `mainline:read`，写 `mainline:arrange`（新）；宿主像给角色的权限一样把它加进本机本人的权限，Agent 与 MCP 经同一套授权取得，不另开名单。

**要等别的主人的写（评审 M1）。** `items.create` 的 `from`／`create_as`、`items.convert`、`holds.bind`／`holds.create` 要先以调用方身份读或建来源对象，都声明 `scheduling: "concurrent"`，返回后先 `beforeEffect()` 再提交主线这边。新建来源对象的输入带 `request_id`（由主线服务从调用方给的 `request_id`——没给就用调用号——连同人、项目、种类和名字或事项派生），来源主人按它重放同一个对象；主线这边按来源唯一索引幂等，所以取消或冲突后重试不会多出一个 Goal。

`items.convert` 在请求来源创建前核对主线修订。提交时已经过期的请求直接返回当前排列。来源已创建后发生的排列冲突返回同一错误，使用同一请求号重试会取回该对象并继续绑定。

| 动作 | 输入 → 输出 | 说明 |
| --- | --- | --- |
| `mainline.read@1`（查询） | `{}` → `{ mainline, sources }` | `sources` 是这个调用方目录里声明了事项来源的种类：`[{ kind, owner, create: boolean, next: boolean }]`，供「设为事项」「建成 xx」 |
| `mainline.read@1`（查询） | `{ counts?: true }` → `{ mainline, counts? }` | 主线；带 `counts` 时一次给出每件事项与每组的等你、在跑数（评审 M2：切换器不按事项逐个读线，MLN-17、MLN-23、WLN-19） |
| `mainline.subject.read@1`（查询） | 平台的主体读取形状 | `work_item` 作为主体：轻量事项给名字，由对象变成的给来源对象的标题（以调用方身份读）；placement、搜索、组合服务按它认事项（评审 M3） |
| `mainline.items.create@1` | `{ name } \| { from: ActionSubject } \| { create_as: { kind, name } }`，可带 `group_id`、`request_id` → `{ mainline, item }` | 起个名字；把对象设为事项（先以调用方身份读一次对象，读不到就拒）；「建成 xx」以调用方身份调来源的新建动作，再把新对象设为事项。默认放进第一组的最后 |
| `mainline.items.convert@1` | `{ expected_revision, item_id, kind }`，可带 `request_id` → `{ mainline, item }` | 「变成 xx」：在来源里新建对象并和轻量事项绑上，装的东西不变，名字改向来源读（MLN-21 在第 37 批走界面） |
| `mainline.items.rename@1` | `{ expected_revision, item_id, name }` | 只对轻量事项 |
| `mainline.items.move@1` | `{ expected_revision, item_id, group_id, index, pinned? }` | 组内拖动、移到别的组、固定在前 |
| `mainline.items.complete@1` | `{ expected_revision, item_id, completed: boolean }` | 收进已完成、撤销、放回；修订匹配时，事项不存在或已在所求状态就返回当前排列 |
| `mainline.items.remove@1` | `{ expected_revision, item_id }` | 从主线移出：删容器和它的「装进」关联，不删装的对象、不删来源对象（MLN-10） |
| `mainline.groups.edit@1` | `{ expected_revision, op: "add" \| "rename" \| "delete" \| "move", ... }` | 删组时组里的事项并到相邻的组（前一组，没有前一组就后一组），一件不丢（MLN-04） |
| `mainline.switch@1` | `{ item_id: string \| null }` | 切换当前事项；`null` 是不选事项；更新最近切过 |
| `mainline.items.contents@1`（查询） | `{ item_id }` → `{ held: ActionSubject[], related: [{ source, subjects }], issues }` | 「这件事的东西」：装进的对象，加上来源插件声明的自家关联（以调用方身份调一次）；只给引用，标题与形态由组合服务取 |

**「装进事项」的 placement 关联**（批次文件：用 placement 已有的 `placement_relation` 声明写，声明方是主线服务）。主线服务在自己的提供方上声明关联 `holds` 的五步，输入输出照 `defineTaskServesAction` 的写法在合同里固定：

| 步 | 动作 | 形状 |
| --- | --- | --- |
| `list` | `mainline.holds.list@1` | `{ subject }` → `{ targets: ActionSubject[] }`（`target: { kind: "work_item", noun: "事项" }`） |
| `bind` | `mainline.holds.bind@1` | `{ subject, target }` → `{ targets }`：放进事项（可以同时在几件事项里） |
| `release` | `mainline.holds.release@1` | `{ subject, target }` → `{ targets }`：只删这条关联 |
| `candidates` | `mainline.holds.candidates@1` | `{ subject }` → `{ targets: [{ subject, current }] }`：「放进事项」可选的事项，当前事项在前 |
| `create` | `mainline.holds.create@1` | `{ subject, name }` → `{ targets }`：新建一件轻量事项并放进去 |

放进之前以调用方身份读一次这个对象（`resolveActionSubject`），读不到就拒（`mainline.subject_unreadable`），所以不能把读不到的东西装进来。placement 的服务代码今天按 Goal 关联写（第 32 批记过）。为免第 44 批再对两种形状（评审 M4），本批在 `platform/placement.ts` 加按角色通用的关联动作定义器（`definePlacementRelationAction(role, …)`：`list`／`bind`／`release`／`candidates`／`create`，主体与目标都是 `ActionSubject`），`holds` 用它；Goals 的 `goal` 关联照旧，第 44 批改 placement 服务读多个关联名、让对象菜单的「放进事项」经 placement 走时再换。本批不为事项另写关联名或通道。

## 4. 事项来源声明

写在呈现声明里那种对象上（主线 §5：和呈现声明同一段）：

```ts
interface PresentationObject {
  // ……现有字段
  /** 这种对象能变成事项。标题、状态、是否完成读这一份声明的字段与状态映射（状态环取 done 家族即完成），不另写一份。 */
  readonly item?: {
    /** 「建成 xx」「变成 xx」：本 Manifest 自己的动作，形状见 `defineItemCreateAction`。没有就不出现在这两处的选项里。 */
    readonly create?: string;
    /** 自家关联：这个插件里和这个对象相关的东西（`defineItemRelatedAction`）。 */
    readonly related?: string;
    /** 下一步：一句话、能不能直接开始、开始时调哪个动作（`defineItemNextAction`）。 */
    readonly next?: string;
  };
}
```

- 三个引用都是 `capability_id@version`，必须是本 Manifest 自己的、形状对得上的动作；SDK 的 `validatePresentationDeclaration` 检查，作者和平台跑同一份（`parsePluginManifest`）。装上的插件与内置插件同一条路，宿主没有按插件名的分支（MLN-14）。
- **完成信号**（主线 §5 的一行）不另声明：完成就是状态映射到 done 家族；变化经第 32 批的「等你」读取那一个订阅送到页面（事项线合同设计稿 §11），不另起事件。
- 动作形状（`platform/work-items.ts`，SDK 转出）：
  - `create`：`{ name, request_id }` → `{ subject }`；同一 `request_id` 返回同一个对象。
  - `related`：`{ subject }` → `{ subjects: ActionSubject[] }`，最多 200 个。
  - `next`：`{ subjects: ActionSubject[] }` → `{ items: [{ subject, next: null | { text: string; waiting_on?: string; start?: { action: ExactActionReference; input: Record<string, unknown> } } }] }`：一次批量；`text` 是动词开头的短句，`waiting_on` 是「还差什么、在等谁」（本批文件设计语言建议）；`start` 只能是来源自己的动作。
- 主线服务读声明：宿主从同一份可信目录交给它（同组合服务的 `SurfacePlugin`），插件不能自报别家的种类。

## 5. 线读取与安放

- **线读取按事项给。** `mainline.line.read@1` 的输入加可选的 `item`（事项 id）。不带时照第 32 批（项目的线）。带上时：
  - 只留主体在这件事项里的事件：事项的来源对象、装进的对象、来源的自家关联里的对象；
  - 装进的对象里没有登记方报、但呈现声明有时间角色的，从主人的呈现取值（一种对象一次批量）读出：有 `due_at` 的放「接下来」、有 `happened_at` 的放「已办」、状态映射带 `needs_decision`／`needs_acceptance` 的放「现在」旁边并算等你；三样都没有的不上线，只在「这件事的东西」里；
  - 来源有 `next` 的，下一步作为一个建议事件放在「接下来」的最前（`suggestion` 种类，`open` 为来源对象）；
  - 背后任务照第 32 批：任务总表里为这些事件办的，以及装进这件事项的任务。
  - 时间角色：沿用呈现声明已有的 `due_at`（排在）、`happened_at`（发生于），不新增角色；日程的「开始于」随第 53 批接日程时再看（事项线合同设计稿 §8 已定）。
- **安放的两种新去处。** `mainline.place@1` 的输入加一个与 `to` 并列的 `item`（评审 M5：「为哪个事件办」和「在哪件事项里」是两个维度）：`{ kind: "item", item_id }` 放进另一件事项——同时解除它在别的事项里的「装进」，所以只出现在一条线上；`{ kind: "none" }` 不归事项，从所有事项里拿出。任务进事项就是 `holds` 关联绑上任务对象，任务为哪个事件办以及授权、预算、数据范围照常。带 `item` 时须有 `mainline:place` 与 `mainline:arrange`；更换归属在主线库一次提交，原有归属在失败时保留。

## 6. 存储（`mainline/mainline.db`，`horizontal/mainline` 的 Home 库）

```sql
CREATE TABLE mainline_items (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL,
  name TEXT, source_kind TEXT, source_id TEXT, created_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_actor_id, project_id, item_id),
  CHECK ((name IS NULL) != (source_kind IS NULL)));
CREATE UNIQUE INDEX mainline_items_source ON mainline_items (owner_actor_id, project_id, source_kind, source_id) WHERE source_kind IS NOT NULL;
CREATE TABLE mainline_arrangements (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, revision TEXT NOT NULL, arrangement TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id));
CREATE TABLE mainline_holds (owner_actor_id TEXT NOT NULL, project_id TEXT NOT NULL, item_id TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL, added_at TEXT NOT NULL,
  PRIMARY KEY (owner_actor_id, project_id, item_id, subject_kind, subject_id));
CREATE INDEX mainline_holds_subject ON mainline_holds (owner_actor_id, project_id, subject_kind, subject_id);
```

- 存的只有：轻量事项的名字、来源引用、装进的引用、排列（MLN-12）；查不到插件对象的标题、状态或正文。测试按列名与内容核对。
- 删除项目：在宿主的项目删除主人表里加一项，删掉这个项目的三张表的行（同 Characters 的 `charactersProjectData`）。
- 同步：主线是个人数据，个人同步合同落地之前只在本机（主线 §6）。
- 事项库现为 v2，v1 经显式升级给每行补修订 1，登记进 `home-stores.ts`、版本表、`docs/system/HOME-DATA.md` 与 `tooling/gates/table-owners.json`（表主人核对）。

## 7. 记录（MLN-18）

放进、移动、切换、完成、移出都是动作调用，网关的出口记录（`horizontal/observation` 的 `exitRecord`）已经写下操作者、动作、输入与结果；这些动作的输入输出只有事项 id、轻量事项的名字和对象引用，没有对象正文。不另写一份记录通道。测试核对：一次放进留下一条 `action.call`，带操作者与事项引用，查不到对象正文。

## 8. 开工前检查（15 项）

| # | 结论 |
| --- | --- |
| 1 事实主人 | 事项容器与排列、「装进」关联归主线服务；对象内容、完成与否、下一步归来源插件；任务为哪个事件办归任务主人 |
| 2 插件同等待遇 | 任何插件在呈现声明里写 `item` 就是事项来源；Goals、Coding 走同一条；测试用装上的沙箱插件验 |
| 3 能力注册 | 全部动作注册在 `system.mainline` 一处；关联用 `placement_relation`，不另写名单 |
| 4 合同 | `services/mainline` 增量；`platform/presentation-declaration` 加 `item`；新 `platform/work-items`；跑 `api:update`、`actions:update`、`versions:generate` |
| 5 包边界 | 存储与规则在 `horizontal/mainline`；宿主只装配与给目录；插件只声明 |
| 6 表与存储 | 新 Home 库只由主线服务读写 |
| 7 兼容与迁移 | 不涉及：新库从版本 1 开始 |
| 8 安全边界 | 本人、项目从上下文取；装进、设为事项都先以调用方身份读对象；新增 `S-mainline-own-line`：别人的、别的项目的事项与读不到的对象被拒，各一条拒绝测试 |
| 9 调用次数 | 读主线一次查库；线读取按事项时，发现一遍，每家登记方一次、每种对象的呈现取值一次批量、下一步一种来源一次批量；不按对象逐个请求 |
| 10 升级与数据 | 新库版本 1；金样随升级回放重生 |
| 11 成果与过程项 | 不涉及 |
| 12 页面、外壳与文字 | 本批不出界面；默认分组名存 `default` 键，不存译文 |
| 13 错误 | `mainlineErrors` 加 `conflict`、`limit`、`item_missing`、`subject_unreadable`、`source_unavailable` |
| 14 冲突面 | `horizontal/mainline`、`services/mainline`、呈现声明、Goals 与 Coding 的呈现声明；第 39 批分支也改 Goals Manifest，按依赖顺序合并 |
| 15 全局最优 | 插件：一份声明三种可选动作；平台：主线、placement、组合服务各管一段；助理：同一组动作即可安放到另一件事项；后续：第 37 批只接界面与工作台状态，第 44 批去掉 Goal 一等概念时不用改事项（关联不按 Goal 形状写） |

## 9. 验收（服务层）

| 编号 | 怎样验 |
| --- | --- |
| MLC-01 | 第一次读给出默认三组；起个名字建成轻量事项，放进第一组最后（MLN-08 服务部分） |
| MLC-02 | 移动、固定、改组后顺序立即生效，重开库后保持（MLN-03 服务部分） |
| MLC-03 | 删组时组内事项并到相邻组，一件不丢（MLN-04） |
| MLC-04 | 过期的 `expected_revision` 被拒并带回当前主线 |
| MLC-05 | 设为事项与建成 xx：以调用方身份读或建来源对象；同一对象再设返回原事项；没声明 `create` 的不出现在 `sources` 的可建里（MLN-08、MLN-14） |
| MLC-06 | 装进、移出只改关联，不删对象；移出事项不删装的对象和来源对象（MLN-10） |
| MLC-07 | 存储里只有名字、引用与排列，查不到插件对象的标题、状态或正文（MLN-12） |
| MLC-08 | 别人的、别的项目的事项，与读不到的对象，都被拒并留诊断行（MLN-13、`S-mainline-own-line`） |
| MLC-09 | 一个装上的沙箱插件在呈现声明写 `item` 后与内置插件一样出现在 `sources`，可设为事项、可给下一步（MLN-14、WLN-22 服务部分） |
| MLC-10 | 线读取按事项只给这件事项里的事件、带时间角色的装进对象与来源的下一步；没装 Goals 时照常（WLN-21、WLN-22 服务部分） |
| MLC-11 | 安放到另一件事项、不归事项：只改「装进」关联，任务不停、不重做（WLN-32、WLN-36 服务部分） |
| MLC-13 | 等别的主人的写：取消或冲突后用同一请求重试只得到一个来源对象；`next.start` 指向别家提供方的被拒；`mainline.read` 带 `counts` 一次给出每件与每组的数（调用次数） |
| MLC-14 | `work_item` 作为主体能读出名字；放进另一件事项后只在那一件里 |
| MLC-12 | 放进、移动、切换、完成各留一条工作记录，带操作者与事项引用，无正文（MLN-18）；合同里没有状态流、负责人、截止、评论字段（MLN-22） |

## 10. 落地时的改动（2026-11-16）

- 库文件名是 `mainline/mainline.db`（与 assistant、placement 等宿主的 Home 库同一写法），不是设计时写的 `.sqlite`。
- `holds` 五步的字段用 `definePlacementRelationAction` 的通用名：输入 `subject`／`target`／`name`，输出 `targets`（候选是 `targets: [{ subject, current }]`），不是 `item`／`items`。
- `request_id`：`items.create` 与 `items.convert` 都可带调用方自己的请求 id；来源收到的 `request_id` 由它（没给就用调用号）、人、项目、种类和名字（或被变成的事项）派生。所以同一次操作里建两个不同的对象得到两个，别人的请求也重放不出这个人的对象。
- 来源的发现按安装的提供方 id 对：Host 信任的安装用插件 id，别的安装用安装身份（`plugin-install-…`）；`sources` 里的 `owner` 仍给插件 id。来源各步只在调用方目录里可用时才算：`sources` 的 `create`、`next` 按调用方此刻能不能调来给，没有授权就是 `false`。种类本身仍列出，因为把已有对象设为事项不需要任何一步。
- 按事项读线时，登记方只能报自己种类的事件，所以来源对象的事件要由来源自己登记；别家登记的事件经来源的「相关」进到这件事项。
- 安放带 `item` 时，任务没有主体读取，核对的是它在调用方自己的任务总表里；读不到就拒（`mainline.subject_unreadable`）。
- `mainline.read` 的 `counts` 从任务总表一次读出：一件事项的数算它装进的任务和为它的来源或装进的对象办的任务，每个任务只算一次。
