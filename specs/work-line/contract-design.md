# 第 32 批合同设计稿：事件登记、后台任务总表、等你、对象引用与结果回流

状态：设计稿（2026-11-14），待评审；评审后提交到 `batch/32`，再写合同代码。需求在[事项线](spec.md)（§5、§6、§15 的开工前检查）、[主动助理](../proactive-assistant/spec.md) §7.5.4、[Prologue 采用](../prologue-adoption/spec.md) §4.6.11。第 2 项交付的审查合同（要求、证据、决定请求）另写进[授权需求书](../agent-approval/spec.md)，不在这份稿里。

现状在 main `392f3bdd71` 上核对，文件位置是当时的。字段名是建议，写合同代码时对照现有类型定稿；标「待核」的是写代码前还要读实现才能定的。合同按阶段一做：原版本改，不留兼容期，一个 PR 改完所有消费者（`docs/system/CONTRACT-CHANGES.md`）。

## 1. 一览

| # | 合同 | 现在 | 改成 | 主人轨道 |
| --- | --- | --- | --- | --- |
| 1 | 事件登记 | 首页事项读取 `platform/home-events.ts`，待办、Feed、Inbox 在报，宿主按输入输出类型发现 | 同一份扩成事件登记，线、首页、项目简报、助理的材料扫描读同一份；助理与 Coding 新接 | C1 |
| 2 | 线读取与安放 | 没有 | 新包 `horizontal/mainline` 的两个系统动作 | C3 |
| 3 | 后台任务总表 | `platform/home-background-tasks.ts`，只有 Coding 在报，停止是插件自己的路径 | 行补对象引用、所属事件、谁在办、当前这一步、状态家族；命令改成动作引用；平台与助理也报 | C1 |
| 4 | 任务为哪个事件办 | placement 的关联声明只服务一个关联名（Goal） | 放开成能服务任务主人声明的关联 | C1（声明）、C3（placement） |
| 5 | 等你的统一读取 | 八处来源各读各的 | 一个读取动作，线头、事件、面板共用 | C1 |
| 6 | 对象引用与打开 | 六种引用形状、十二处手拼地址，没有通用打开 | `ActionSubject` 扩字段、`objectLink`、`objects.open` | C1 |
| 7 | 呈现形态 | 四种：名字片、行、卡片、速览 | 加活卡、决定请求、验收卡 | C1、D |
| 8 | 结果回流 | 接续停在可接续，助理与 Coding 各自长请求去问 | 宿主实现启动接续；Prologue 补四处 | C2、A；上游 |

## 2. 事件登记

**做法。** 不另起一份。今天的首页事项读取已经是「插件报此刻该让人看到的事项」：有对象引用、时间、位置（已发生／进行中／今天）、要不要你处理、怎么打开，宿主按类型发现提供方、核对对象种类、单个提供方失败只记一条问题。线读它，首页照旧读它。

**改名。** `home-events` 改叫 `work-events`（事件），类型标识、定义函数、三家提供方的动作名一起改，免得作者以为只给首页用（用户 2026-11-14 定：在首页事项上扩并改名）。

**怎样登记。** 插件在 Manifest 里声明一个查询动作，输入输出用事件读取合同的两个类型标识，并写它报哪些对象种类；SDK 的声明检查已经要求这类动作用完整的规范合同（`packages/plugin-sdk/src/action-declarations.ts`），装上的插件与内置的走同一条路，宿主按类型发现。没有另一处名单。

**字段。**

```ts
interface WorkEvent {            // 原 HomeEvent
  event_id: string;
  subject: ActionSubject;        // 事件对应的对象
  title: string;                 // 胶囊上的名字，登记方当次给出
  summary: string;               // 胶囊上的状态词或一句（「今天截止」「查资料」）
  content: string; facts: Array<[string, string]>;   // 首页与简报用，线不显示
  category: "personal" | "organization";
  placement: "occurred" | "active" | "today";        // 线的左翼／现在旁边／右翼
  occurred_at: string;           // 发生于
  scheduled_at?: string;         // 新增：排在（开始或到期），右翼按它排；没有就按 occurred_at
  state?: StateFamily;           // 新增：状态家族的现行取值，胶囊的颜色与状态环取它
  needs_attention: boolean;      // 等你
  open: OpenTarget | null;       // 改用 §7 的通用打开目标
}
```

- 胶囊的名字和状态词用登记方当次给的 `title`、`summary`，不再为它另调一次呈现取值；事件卡在聚焦时才经组合服务取。所以需求里 WLN-21「线读取的返回查不到标题」要改成「主线服务不存标题、状态词或正文；返回里的名字是登记方当次给出的，不当成事实缓存」。这是做法的调整，不改用户看到的结果，随这份稿一起改需求。
- 读取的输入仍是时间范围；第二片加「哪件事项」。
- **新登记方。** 助理：系统提供方 `assistant.events`，报登记成事件的交办（对象种类 `assistant_work`），在办的是 `active`，办完的是 `occurred`、打开目标指向交回的结果。Coding：`coding.events`，报在跑、等你和最近结束的会话（已落地，2026-11-14：在办或还握着步骤、命令的会话是「进行中」，窗口里结束的最近 20 个是「已发生」；事件自己不说等你，等你来自任务总表里同一个会话的那一行）。待办、Feed、Inbox 沿用，只换形状；五家第一片都上线（用户 2026-11-14 定）。Feed、Inbox 现在报的事项直接成为线上的事件，线上偏吵时在各自的读取里收紧，不在线上按来源过滤。
- **发现与调用。** 仍按输入输出类型发现。今天 `home.events.read` 一次读取发现两遍、逐个串行调提供方，改成发现一遍、并行、每家带时限。

## 3. 线读取与安放（`horizontal/mainline`）

新包照 `horizontal/kit`：只有系统动作，不存东西。把今天宿主里汇集事件的那段（`apps/local-host/src/home-event-actions.ts` 的 `collect`）搬进来，`home.events.read` 改为调它，不留两份。

```ts
// mainline.line.read@1（查询，项目范围，concurrent；user、agent、workflow、mcp）
input:  { window: { from, to, now } }                 // 第二片加 item（事项）
output: {
  events: Array<WorkEvent & {
    id: string; source: ActionReference; origin: { surface, title, icon };
    wing: "done" | "now" | "next"; rank: number;      // 排法；rank 0 最靠近「现在」
    line_state?: StateRingState; waiting: boolean;    // 线上显示的状态；它或背后的任务等你
    tasks: { running: number; waiting: number; refs: ActionSubject[] };  // 背后的任务，取自总表
  }>;
  table: { tasks: BackgroundTaskRow[]; issues: [...] };  // 排线用的那份总表（与 background.tasks.read 同形）：页面画线与任务面板只读一次（2026-11-15 评审，N42）
  issues: Array<{ source: ActionReference; title: string; code: string }>;  // 读不到的来源：只有标题和错误码
}
```

实现时定下的几点（2026-11-14，已随代码落地，`horizontal/mainline/src/index.ts` 的 `readWorkLine`、`gatherWorkEvents`）：

- **排法。** 主人的 `placement` 定在哪一翼（已发生→已办，进行中→现在旁边，今天→接下来）；背后有任务在办或等你时，不管主人放在哪都移到「现在」旁边。翼内：已办按发生时间，新的靠近现在；接下来按 `scheduled_at`（没有就按 `occurred_at`），早的靠近现在；现在旁边等你的在前，其余按时间新的在前。
- **显示的状态。** 背后有任务等你显示「等你处理」，有任务在办显示「进行」，否则是主人给的 `state`；任务结束后事件回到主人的位置和状态，`refs` 里仍列着它（WLN-38）。任务的进度、标题不抄进事件；总表随线原样放在 `table` 里，不另加工。
- **读不到的来源只给错误码。** 登记方自己写的错误信息不进返回（首页事项的那份读取照旧显示提供方的话，是它自己的事）。在项目里停用的登记方不算问题、也不调用。
- **与首页事项共用一段。** 逐家调用、限时（每家 5 秒）、核对事件 id 不重复和对象种类在声明里，是 `gatherWorkEvents` 一段；`home.events.read` 改调它（并行、带时限），建议合并、插件是否在项目里的判断、读取后复查来源是否撤回仍留在首页那边。
- **Agent 读到的线没有背后的任务。** 任务提供方的读取按 S-49 只回答本人，所以 `mainline.line.read` 以 Agent、工作流、MCP 身份调用时，事件照常给出、都在主人放的位置，`tasks` 是空的；`background.tasks.read` 因此只给本人。助理要知道自己派出的任务办到哪，靠结果回流（§9）和它自己的记录，不靠读总表。要不要让任务读取也回答 Agent，是动 S-49 的事，留到结果回流那一步和用户确认。**2026-11-15 用户定了：允许助理的 Agent 读。** 做法不动提供方（它们仍只回答本人，`mainline.line.read` 给 Agent 的 `tasks` 仍是空的）：助理多一个只给自己 Agent 的只读动作 `assistant.background.read@1`，由助理服务以本人身份在这一轮所在的项目里读 `background.tasks.read`，交给 Agent 一份抄本——名字、状态、步骤、谁在办、为哪个事件办、在问什么——不带命令和回答动作；只认助理自己的一轮（宿主写的 `skill_round`），别的 Agent、工作流、MCP、页面和个人范围的一轮都拒（S-49）。

- 一次读取：发现一遍；并行调各登记方；读一次后台任务总表，按每行的 `serves` 对上事件，推出进行中与等你（WLN-38）。不调模型。
- 助理和外部 Agent 直接读这个动作的结果，不另做一个「文本形态」的动作；它固定在助理角色的动作工具里，不用先查目录。

```ts
// mainline.place@1（命令）：安放与「改」共用
input: { task: ActionSubject;
         to: { kind: "event" | "new_event" | "none"; subject?: ActionSubject };  // 挂到线上的一个事件（带 subject）、登记成新事件、不属于事件
         window?: WorkEventWindow }                      // 挂到事件时必填：调用方正在看的那条线
output: { task: ActionSubject; serves: ActionSubject[] }
```

实现时定下的几点（2026-11-14，已随代码落地，`placeTask`）：

- **先问主人，再核对事件，最后才改。** 先调主人的 `list`：调用方读不到的任务由主人自己拒绝，原样返回主人的错误码。挂到事件时，事件必须出现在调用方读得到的登记方这一窗口的回答里，否则 `mainline.event_unreadable`。已经在要去的地方就不再写。
- **主人的回答要对得上。** 改完以后主人返回的 `serves` 必须正是要求的结果（只为那个事件、空、或一个新事件），否则 `mainline.owner_answer_invalid`。
- **受众与权限。** 本人、Agent、MCP 可调，工作流不可；权限是 `mainline:place`，主人的那一步仍按它自己的权限单独授权。
- **拒绝码。** `mainline.task_not_placeable`（没有主人为这类任务声明关联，或不提供这一步）、`mainline.relation_ambiguous`（两个提供方为同一类任务声明）、`mainline.event_unreadable`、`mainline.owner_answer_invalid`。

- 它自己不记任何东西：按任务的种类找到主人声明的关联动作（§5）去挂上或解开；「登记成新事件」调主人声明的登记动作（助理的是把这件交办标成事件）。主人没声明的任务不能改挂，返回明确的拒绝。
- 只接受调用方读得到的任务与事件，别的引用被拒并留诊断行（WLN-34）。不改任务的授权、预算与数据范围。
- 「补充给已有任务」不是新动作：就是今天带目标的发送（输入回执）。
- 错误码用 `defineErrorCodes("mainline", …)`。

## 4. 后台任务总表

沿用首页聚合的机制（`home_aggregate` 标记、每家带时限并行、失败只记问题），合同改名 `background-tasks`，行改成：

```ts
interface BackgroundTask {
  subject: ActionSubject;                  // 任务本身：能挂关联、能打开
  title: string;
  state: StateFamily;                      // 排队、在办、等你、暂停中、已暂停、失败、需核对…取状态家族
  step?: Phrase;                           // 当前这一步或等待的原因
  waiting: boolean;                        // 等你
  started_at?: string; updated_at: string;
  executor: { kind: "assistant" | "character" | "plugin" | "platform"; label: string };
  serves: ActionSubject[];                 // 为哪些事件办；空就是不属于事件
  scope: "project" | "personal";
  commands: Array<{ role: "stop" | "pause" | "resume"; action: ActionReference; input: unknown; summary: string }>;
  decisions: Array<{                       // 它停下来要人定的事（WLN-10，2026-11-15 加）；没有就是空
    id: string;                            // 主人给这个问题这一版的编号：回答只到它
    ask: string; why?: string;             // 要定什么、为什么问
    changes: Array<{ label: string; value: string }>;   // 同意后会改动的地方，一处一行
    answers: Array<{ role: "approve" | "revise" | "reject"; action: ActionReference; input: unknown; summary: string }>;
  }>;
  held_reviews?: { session_id: string; ids: string[] }; // Agent 会话与待审记录编号
  open: OpenTarget | null;
}
```

- **决定请求（2026-11-15，用户定本批把合同做了）。** 回答和命令同一条规矩：只能是回答方自己的动作，一种回答最多一条；写了别家动作、同一种回答两条或编号重复的行整行不列。回答走 `background.tasks.decide@1`（只给本人，权限同命令）：输入是行的来源、任务对象、决定的 `id`、回答的种类，「改一下」必须带 `note`、别的回答不能带；服务先再问一遍提供方，这个任务还在问这个 `id`、还给这种回答才以本人身份调用它写的动作（「改一下」把 `note` 加进输入），否则 `mainline.decision_changed`。所以同意只作用于这个任务的这个问题、这一版（PWA-135）。助理：等你确认的工作把每条待审操作列成一项决定（编号用待审记录自己的编号，改动处用待审记录给页面看的那几栏），回答走 `assistant.background.decide@1`，和对话里确认卡记下的是同一个决定；「改一下」是带理由的拒绝，工作按理由接着办。

- **Agent 待审操作（2026-11-23）。** Coding 的任务行通过 `held_reviews` 给出绑定的 Agent 会话和待审编号。本人从受保护的页面读取时，平台从队列读取原提案，并核对项目、插件、安装及会话。本人在事件卡提交同意或拒绝时，`background.tasks.decide@1` 复核提供方和卡片送回的 `review_version`。原审批队列保存决定前再核对任务仍引用该提案。计算机操作静默期也适用。见[规格书](../work-line-held-reviews/spec.md)。

- **命令改成动作引用。** 今天是插件自己的路径（`stop_path`），装上的插件给不了；改成动作引用后，停止走动作网关、有授权与诊断行。
- **谁报。** Coding 沿用。助理：系统提供方，报主对话名下在办与等你的子工作；个人范围的工作在每个项目的面板里都列，标「个人」。平台：正在执行的调度任务（调度库里已有开始时间与状态）和经后台服务起的在途作业（运行时要记一份在途名单：开始时间、名字、可中止，只在内存）。
- **不报的。** 插件常驻的守护作业（Manifest 的 `background.jobs`）空转时不是任务，不列；它开始干一件具体的事时经上面两条路出现。这和[平台能力审查](../../docs/reviews/platform-capability-audit-2026-11-14.md)第 3 项写的「`background.jobs` 自动报」不同，理由是面板列的是正在办的事，不是进程；记作偏离。
- **读取。** 面板读 `background.tasks.read@1`（系统动作，项目范围）：这个项目的各提供方加助理的个人任务。首页标题栏原来跨项目的读取沿用同一份合同。`/api/attention` 里的后台任务一段删掉。

## 5. 任务为哪个事件办

placement 已有「主人记关联、平台按声明操作」的机制：主人给几个动作标上 `placement_relation`（列出、挂上、解开、候选、新建），placement 在目录里按声明找到它们，今天只服务一个关联名。改动：

- 任务主人在自己的动作上用 `placement_relation` 声明关联 `serves` 的四步：`list`（现在为哪些事件办）、`bind`（改为只为给定事件办）、`release`（不属于事件）、`create`（登记成新事件）。合同里有现成的定义函数 `defineTaskServesAction`（`platform/background-tasks.ts`，SDK 同名导出），输入输出形状固定。
- 主线服务按声明和任务的对象种类在调用方的目录里找到主人：同一类任务只许一个提供方声明，两个就拒绝、谁也不调。**实现时的调整（2026-11-14）：** 主线服务自己读这份声明，不经 `horizontal/placement` 的服务代码——那里的解析与返回是按 Goal 关联的形状写的（`goal_id`、候选 Goal），按名字泛化要动它的线上词汇，留给第 44 批；声明合同是同一份，没有为新关联另写一套。
- 助理声明在 `assistant_work` 上（记在助理工作里），随结果回流那一步做；Coding 的运行归会话是它本来就有的，只在总表的行里给出、不提供改挂。
- 面板里的「挂到事件」「移开」和助理的安放都经 `mainline.place`。

待核：placement 里与 Goal 关联绑在一起的几处（`placement.goals`、`placement.goal.bind`）是否顺手并到通用入口，还是留给第 44 批；本批只保证不为新关联再写一份。

## 6. 等你的统一读取

```ts
// attention.waiting.read@1（查询，项目范围；输入与线读取相同的时间窗口）
output: { items: Array<{ subject: ActionSubject; source: "event" | "task";
                         event_id?: string; task?: ActionSubject; since: string; open: OpenTarget | null }>;
          counts: { total: number };
          issues: Array<{ source: ActionReference; title: string; code: string }> }
```

- 同一个对象只算一次：线上等你的事件是一项（背后有任务等你时带上那个任务，`source` 是 `task`；主人自己说等你时是 `event`）；不为线上任何事件办的等你任务单独一项。线头的数字、事件上的等你、面板里的等你用同一次结果（WLN-39）。
- **实现时的调整（2026-11-14，已随代码落地，`readWaiting`）。** 原稿写「读时合并四处」，其中 Attention 条目和错过的运行不另读一遍：Inbox 已经把每条未处理的 Attention 条目登记成等你的事件（对象是 `inbox_entry`），再直接读一次 Attention 表会把同一件事按两个对象各算一次；错过的运行由平台的任务提供方作为等你的任务行给出。所以这个动作只从线读取与任务总表的同一次结果推出，放在 `horizontal/mainline`（原稿的待核项就此定了），输入是线的时间窗口。
- 写侧不动；第 56 批把来源收进 Attention 后，这个动作改成只问一处，调用方不用改。动作名归 Attention，暂由 `system.mainline` 提供。

## 7. 对象引用与打开

```ts
interface ActionSubject { kind: string; id: string;
  owner?: string;            // 主人插件，新增，可选
  project_id?: string | null; revision?: string }   // 新增，可选
interface OpenTarget { kind: "item" | "group" | "surface"; surface: string; id: string | null; title: string; label: string }
// SDK: objectLink(ref: ActionSubject): string      —— 服务端与插件不再手拼查询串
// objects.open@1: { subject } → { target: OpenTarget }，按主人的读取器解析并复核调用方读得到
```

- `OpenTarget` 就是今天的首页打开目标，提到公共位置；事件、任务、通知、搜索以后都带它。
- 迁掉十二处手拼地址（审查列的九处，加 `context-onboarding.ts`、创作台的 `agent-surface.ts`、Shelf 的 `contract.ts`）。其余几种引用形状在各自主人下一次改合同时并过来，本批不动。
- 这一节在第 2 项交付的子分支里先落（要求认可的挂载对象用它）。
- **实现时的调整（2026-11-15，已随代码落地）。** `ActionSubject` 没有加 `owner`、`project_id`、`revision`：主人由读取器的 `subject_kinds` 唯一确定（同一种对象有两个可用读取器时拒绝，不任选），项目是调用所在的项目，版本由读取器当场给，三个字段现在都没有读的人，加了只会多一份可以写错的事实；哪一批真要跨项目或钉版本引用时再加。地址的写法是 `objectLink(projectId, 位置或对象引用)`、`objectLinkAt(prefix, …)`、`objectLinkTemplate(…)`（`packages/contracts/src/platform/object-link.ts`，SDK 转出）：知道界面与条目时写 `?openPlugin=&openItem=`，只知道对象引用时写 `?openObject=<kind>&openItem=<id>`，页面再调 `objects.open@1`。`objects.open@1` 在 `system.mainline`（`horizontal/mainline` 的 `openObject`）：按调用方自己的目录找到这种对象唯一的读取器，以调用方身份读一次，读取器给的 `open` 就是位置，没有自己页面的对象位置为空；工作台的门是 `/api/mainline/open`（插件页面被拒，S-work-line-person-doors）。十二处手拼地址都已改用这组函数，`tests/object-link.test.ts` 拦新的手拼。

## 8. 呈现形态

- `PRESENTATION_FORM_KINDS` 加 `live`（活卡）、`decision`（决定请求）、`acceptance`（验收卡），语义照[智能呈现](../intelligent-surfaces/spec.md)已定的；先成组件板标本，D 轨合审后进产品。
- 时间角色不用加：已有的「到期」「发生于」「更新于」够表达发生于与排在；日程要的「开始于」到第 53 批接日程时再看。
- 待核：助理不是插件，它的 `assistant_work` 事件卡怎样声明呈现。首选让系统提供方也能给呈现声明（同一份形状），不在组合服务里按「是不是助理」分支。

## 9. 结果回流

**宿主（C2、A）。**

- `horizontal/agent-host` 的协作口实现 SDK 已留的 `startContinuation`：按接续所在的板与步骤找到会话的主人，转给主人登记的启动器，回「起了哪一跑」或拒绝的原因码。
- 助理的启动器：复核工作没被停、没在等用户输入、会话没在跑、当前授权有效、当日与这件工作的用量没超、这件交办的自动接续没到上限，然后用同一个请求键派出一轮宿主写的话。任何一条不满足就拒绝，接续记为受阻；不重试、不换键。
- 助理派出子工作时就登记等待：等这个子步骤落定（任一个，不等全部）、允许自动接续。今天「子任务全部交回才接着做」的那条路和后台作业「只发通知」的那条路都并进来，只剩一条。
- 去掉两处长请求循环（助理的接续循环、Coding 的唤醒循环）和只为它们存在的等待动作。
- 子任务的提问分两种：要信息的先回到派出它的对话，它能答就答、答不了只问用户那一处；要授权或要用户认可的留在任务上直接给用户（面板里等你），派出方只被告知，不能代批。
- 自动接续的上限记在主对话那件交办上，取设置；到了就停下汇报（PWA-156）。
- 「每步先问我」（PWA-156，用户 2026-11-15 定）：助理办的工作（主对话与交办都算，插件接手的、评论回复不算）可以在侧栏「路径」里打开。开着时，子任务交回与等待有结果这两种自己接着做，都先在工作上记一条宿主自己的确认（`kind: "next-step"`，按这次接续的请求键记一次），对话里是「接着做下一步？」的卡，任务行上是「接着做／先不做」两个答复，两处是同一个答复（`assistant.background.decide`）。答「接着做」才按原来的路起那一轮；答「先不做」不起轮，这次接续不再问，等用户下一句；用户自己说话、停止、关掉开关都收回这次询问（关掉时这一步接着做）。连续自动接续的上限照旧算。
- 没有对话来源的任务（定时触发、插件自己起的、外部 Agent 经 MCP 起的）落定时，回到所在范围的助理主对话：起一轮只汇报并给建议，不带「可以接着做」的授权，这一轮不能派新任务或做写操作（用户 2026-11-14 定）。

**Prologue（上游，随本批换包）。**

| 改动 | 为谁 | 位置 |
| --- | --- | --- |
| 一个会话同时只起一轮：按会话互斥，第二个起跑请求明确被拒 | 所有使用者；用户输入与接续同时到 | 会话起跑 |
| 子任务等回答成为父可等的一种条件，落定时带上问题与所属步骤 | 助理、Coding | 等待条件、接续 |
| 后台派出默认带「落定即接续」，可显式关掉 | 用 SDK 派发工具的（Coding） | 派发工具、子任务回写 |
| 重启后：已落盘的结果满足等待并接续一次；明确没开始的按原意图继续；其余停在需核对并回到父 | 所有使用者 | 恢复 |

不变：等待期间不发模型请求；取消与撤权先让等待与接续失效、提升代次，迟到的回调什么都不提交；接续不重置上限。

**实现时的调整（2026-11-14，已随代码落地）。** 动手前先核对了宿主与 SDK 现有的东西：助理的工作图（每件工作一张图、子工作是根下面的一步）、宿主登记的等待、接续与「子任务交回」那一轮都已经在，缺的只是「任一个落定就回来」。所以这一步没有改 Prologue、没有换包：

- **任一个落定就回来。** SDK 的等待在「都落定才算」时不看 `mode`，但它有「提前接着做」（`continueEarly`）。宿主在一个被等的子步骤落定、而同一个等待里还有别的没落定时，对自己登记的那个等待调它：根的接续立刻可以继续，其余子步骤照常办（`horizontal/agent-host/src/adapters/prologue-work-waits.ts` 的 `partEnded`）。最后一个落定仍由等待自己结束。
- **接着等其余的。** 接续被接走（那一轮开始）后，宿主在根上重新登记等待，只等上一个等待里还没落定的那几步（`waitForRest`）；用户停下这件工作后再说话，同样接着等剩下的。只动宿主自己登记的等待，一轮自己登记的等待不碰（一步一个接续的规则不变）。
- **助理一侧。** 交回的一轮写明这次回来的是哪几件、还有几件在办（「（子任务交回）…还有 N 个子任务在办」），都回来时仍是「（子任务都已交回）」。一轮结束时再看一次图：这一轮在跑的时候回来、又没被它接走的结果，现在接着做。连续 8 轮没有用户的话就停下并告知（PWA-156 的次数上限；用户再说一句重新计数）。
- **留到后面的**（记在 `specs/backlog/BL-work-line-result-return-followups.md`；其中接续回调、删长请求、后台派出叫醒父已在 2026-11-15 做了，见下面「结果回流落地」）：用 SDK 的 `startContinuation` 回调取代助理的接续循环与 Coding 的唤醒循环；子任务「要信息」的提问先回到派出它的对话（要给等待加一种条件，是上游改动）——现在子任务的提问一律留在任务上给用户，面板里显示等你；用 SDK 派发工具的后台派出默认带接续（Coding）；「每步先问我」的开关；上限取设置。表里的四项上游改动因此都没有做，用户对 Prologue 的授权留给这几项。
- ~~还没做、仍在本批的：没有对话来源的任务落定时回到主对话汇报~~ 已做，见下一段。

**结果回流落地（2026-11-15，用户弹窗定「本批做完」并授权改 Prologue、用 main）。** 上面「留到后面的」里，接续回调、同一会话一次一轮、子任务开口算等待有结果、后台派出叫醒父这几项在 Prologue #124、#125 做了；本批测出「请 App 起跑时会话授权变了，占用卡在 claimed」，在 #126 修（换包到 main `02a11ac5`，见 `vendor/prologue-sdk/README.md`）。Molis 这边：

- **谁起接续。** 宿主为 Home 起一个启动器（`apps/local-host/src/agent-continuation-starts.ts`）：助理自己的会话由助理起（`AssistantContinuations.startFor`，同一件工作一次只起一个）；插件的会话由宿主给拥有会话的那个安装发一条不带内容的 `host.agent.continuation.ready@1`，答 `later`，插件用原请求键自己起这一轮（Coding 的唤醒循环改为听这条事件）。`agent.collaboration.await@1` 与两处 25 秒长请求删了。
- **页面怎样知道变了（WLN-27）。** 项目的日志追加、插件库提交、助理自己的库变化都汇到 `apps/local-host/src/attention-changes.ts`，合并后经 `GET /api/attention/events` 推一条「有变化」；页面收到再读一次「等你」（最多每 500 毫秒一次）。没有定时读，断线由通道断开判断。
- **等你时主对话里那一行（WLN-06）。** 平台直接写，不调模型：按任务与决定去重，不再等你时收成一行灰的「已处理」，按钮「去处理」。
- **没有对话来源的任务回报助理。** 行上 `reports_to: "assistant"`；项目变了、而这个项目有主对话时，助理读一次本人的任务总表（同一项目最多每秒一次），对办完或失败的那一行在主对话里起一轮只汇报（角色 `assistant-report`，只读、不带宿主工具、不交侧栏浏览器；只给查询，命令一律拒绝，见 `S-task-report-read-only`）。没有主对话的项目不读；主对话出现之前就结束的不补报。同一次读取里同一项目一起结束的几行合成一轮，逐项列出（只有一行时措辞照旧）；不同项目各进各的主对话。主对话正在答、在恢复或有可接的接续时整批等它结束，期间新结束的并进同一批；每件任务各一条提醒，同一次结束只报一次，重启后也不重复（提醒的键）。汇报轮在轮次上记 `report_only`，不算进也不清零连续自动接续的轮数（第 97 批）。

## 10. 助理一侧（A）

- **主对话。** 每个范围（个人、每个项目）和每个对话对方（助理、一个 Character）有一件常驻的助理工作当主对话，在工作上标出；第一次用到时建。后台任务是它名下的子工作。存量的几件工作照旧能打开，在面板与历史里。
- **限制重定。** 子工作仍只一层。「总共六个、同时三个」改成：同时在办的上限取设置，超出的排队并如实显示（PWA-131）；总数不设硬顶，由用量上限管。
- **提示词。** 平台维护两段，带版本标记，随角色下发：主对话的做法（先答、能后台办的派出去、这一轮不做长活、结果回来怎样判断）和安放说明（五种去处、什么算值得跟、什么时候问）。Character 当对话对方时在它自己的角色层之外加同样两段。
- **工具。** 委派工具加「为哪个事件办」；线读取与安放两个动作固定在角色的动作工具里。
- **「发给」。** 加一组 Character，只列平台能跑的；不再要求有页面的收件人在前台才出现。本机导入的原生 Character 不列，写明原因。
- **存储。** 助理工作新增的字段（是不是主对话、对话对方、是不是事件、自动接续计数）都是可选字段，不动建表语句。

**实现时的调整（2026-11-14，已随代码落地）。**

- **主对话**是助理工作上的 `main`：发送时带 `main: true`、不带 `work_id`，就落到这个范围、这个对话对方（`character`，没有就是助理）的那一件上，第一次用到时建，之后找回同一件（`mainWorkOf`）。它用单独的角色 `assistant-main`（在原有两段之上加一段 `assistant-main` 提示词：先答、花时间的交到后台、说明去处、结果回来怎样判断）；安放说明并在这一段里，没有另起一段。对话对方是 Character 时沿用现有的 Character 选择，不另加层。
- **委派工具**多两个可选参数：`for_event`（为线上哪个事件办，宿主用这件工作自己的授权读一次事项线核对，读不到就拒绝、子任务不开始）和 `track`（登记成新事件）；都不带就是不属于事件。结果写在子工作上（`serves`、`line_event`）。
- **限制。** 总数的上限去掉；同时在办的上限是 5（常量，取设置留后）。到上限时这一件被拒、不开始，助理照实告诉用户它在排队，等有任务交回再派——没有平台一侧的排队队列（留后，见同一份待办）。
- **助理在线上**（`apps/local-host/src/assistant/assistant-line-actions.ts`）：`assistant.events`（用户单独起的工作、登记成事件的后台任务）、`assistant.background.tasks`（在办或等你的工作，主对话本身不算）、`assistant.background.stop`、关联 `serves` 的四步（只有主对话派出的任务能改挂；用户单独起的工作本身就是事件）。都注册在助理已有的系统提供方上，按类型被发现，宿主里没有为助理写的分支。事件自己不说等你，等你来自任务总表里同一件工作的那一行。
- 「发给」里的 Character 分组是界面的事，随对话框那一步做。

## 11. 变更通知

线、面板、等你三处都不轮询。待核后定一种：首选把页面今天已有的两个信号（项目事件游标、助理工作变化的长请求）收成外壳的一个订阅；登记方的对象变了，经它已声明的插件事件进入。如果插件事件带不了「我的事件登记变了」，加一个平台事件类型，所有登记方发同一种。这一条定下来之前不写线的页面代码。

**定下来的做法（2026-11-14，已随代码落地）。** 用首选：外壳只有一个订阅，就是页面原有的「等你」读取（`GET /api/attention`，页面可见时按拍读、回到前台和有人请求时马上读；项目事件游标本来就在里面）。项目页的回答多两段 `line` 与 `tasks`（`apps/local-host/src/mainline-http.ts` 的 `mainlineAttention`，按本人经主线服务读；插件页面拿不到，是 null），线、线头的等你数、任务图标和面板都从 `molis-work:attention` 画，自己没有定时器。助理的工作换了状态（它的长请求先知道），页面请这一次读取马上再来（`molis-work:attention-refresh`），所以交办开始、交回、等你在线上是马上变的；插件登记方的对象变了，最迟下一拍出现，和 Goal 看板今天的节奏一样。没有加平台事件类型：线读的是登记方此刻的回答，不是事件流，按拍读一次就够；以后要更快，在这一个订阅上改成推送，线和面板不用动。

## 12. 要更新的快照与消费者

- 公共 API 快照：contracts 的 `platform/*`（事件、后台任务、对象引用、呈现、placement）、`services/*`（主线、助理、agent-host 协作），插件 SDK。动作快照：三家事件提供方改名、新增助理与 Coding 的事件提供方、`mainline.*`、`background.tasks.read`、`attention.waiting.read`、`objects.open`，删掉等待接续的动作。
- 版本表 `tooling/versions.json`：改名与新增的类型标识、动作、提示词版本。
- 新包登记：`scripts/workspace-packages.mjs`、归属与 CODEOWNERS、包清单表、错误主人表、README 的开发要求、`docs/horizontal/` 的手册。
- 安全不变量表：启动接续的复核、安放只收读得到的引用、未授权的线读取，各一条带拒绝测试。
- GLOSSARY：加「事项」「事件」「任务」「主线」。

## 13. 风险与待核

1. 变更通知用哪一种（§11）。
2. 系统提供方的呈现声明（§8）。
3. 两处改名的改动量（§2、§4）；事件登记的改名用户已定，后台任务总表的改名评审可定不改。
4. 守护作业不进面板，和审查稿的写法不同（§4）。
5. 页面资源：外壳、线、面板、事件卡合计会涨，超过 10 KB 或新增资源要先问用户。
6. 浏览器用例：断言现在的底栏、助理面板、右侧后台任务页的约六十个文件要按新位置重写。
7. Prologue 四处改动里，「子任务等回答成为可等条件」改到等待的核心类型，要对着它的切片文档做，并补它自己的用例。
