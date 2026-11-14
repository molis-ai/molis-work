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

**改名。** `home-events` 改叫 `work-events`（事件），类型标识、定义函数、三家提供方的动作名一起改，免得作者以为只给首页用。纯机械改动；评审认为不值可以不改名，只加字段。

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
- **新登记方。** 助理：系统提供方 `assistant.events`，报登记成事件的交办（对象种类 `assistant_work`），在办的是 `active`，办完的是 `occurred`、打开目标指向交回的结果。Coding：`coding.events`，报在跑、等你和最近结束的会话。待办、Feed、Inbox 沿用，只换形状。
- **发现与调用。** 仍按输入输出类型发现。今天 `home.events.read` 一次读取发现两遍、逐个串行调提供方，改成发现一遍、并行、每家带时限。

## 3. 线读取与安放（`horizontal/mainline`）

新包照 `horizontal/kit`：只有系统动作，不存东西。把今天宿主里汇集事件的那段（`apps/local-host/src/home-event-actions.ts` 的 `collect`）搬进来，`home.events.read` 改为调它，不留两份。

```ts
// mainline.line.read@1（查询，项目范围，concurrent；user、agent、workflow、mcp）
input:  { window: { from, to, now } }                 // 第二片加 item（事项）
output: {
  events: Array<WorkEvent & {
    id: string; source: ActionReference; origin: { surface, title, icon };
    wing: "done" | "now" | "next"; rank: number;      // 排法
    tasks: { running: number; waiting: number; refs: ActionSubject[] };  // 背后的任务，取自总表
  }>;
  issues: string[];                                   // 读不到的来源
}
```

- 一次读取：发现一遍；并行调各登记方；读一次后台任务总表，按每行的 `serves` 对上事件，推出进行中与等你（WLN-38）。不调模型。
- 助理和外部 Agent 直接读这个动作的结果，不另做一个「文本形态」的动作；它固定在助理角色的动作工具里，不用先查目录。

```ts
// mainline.place@1（命令）：安放与「改」共用
input: { task: ActionSubject;
         to: { kind: "event"; subject: ActionSubject }   // 挂到线上的一个事件
           | { kind: "new_event" }                       // 登记成新事件
           | { kind: "none" } }                          // 不属于事件
output: { task: ActionSubject; serves: ActionSubject[]; event?: ActionSubject }
```

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
  open: OpenTarget | null;
}
```

- **命令改成动作引用。** 今天是插件自己的路径（`stop_path`），装上的插件给不了；改成动作引用后，停止走动作网关、有授权与诊断行。
- **谁报。** Coding 沿用。助理：系统提供方，报主对话名下在办与等你的子工作；个人范围的工作在每个项目的面板里都列，标「个人」。平台：正在执行的调度任务（调度库里已有开始时间与状态）和经后台服务起的在途作业（运行时要记一份在途名单：开始时间、名字、可中止，只在内存）。
- **不报的。** 插件常驻的守护作业（Manifest 的 `background.jobs`）空转时不是任务，不列；它开始干一件具体的事时经上面两条路出现。这和[平台能力审查](../../docs/reviews/platform-capability-audit-2026-11-14.md)第 3 项写的「`background.jobs` 自动报」不同，理由是面板列的是正在办的事，不是进程；记作偏离。
- **读取。** 面板读 `background.tasks.read@1`（系统动作，项目范围）：这个项目的各提供方加助理的个人任务。首页标题栏原来跨项目的读取沿用同一份合同。`/api/attention` 里的后台任务一段删掉。

## 5. 任务为哪个事件办

placement 已有「主人记关联、平台按声明操作」的机制：主人给几个动作标上 `placement_relation`（列出、挂上、解开、候选、新建），placement 在目录里按声明找到它们，今天只服务一个关联名。改动：

- placement 的关联解析从「固定一个名字」改成按调用给的关联名解析；同一个关联名在一个项目里仍只许一个主人对一种对象声明。
- 任务主人声明关联 `serves`：助理声明在 `assistant_work` 上（记在助理工作里），Coding 的运行归会话是它本来就有的，只在总表的行里给出、不提供改挂。
- 面板里的「挂到事件」「移开」和助理的安放都经 `mainline.place`，它转给 placement 的这组声明。

待核：placement 里与 Goal 关联绑在一起的几处（`placement.goals`、`placement.goal.bind`）是否顺手并到通用入口，还是留给第 44 批；本批只保证不为新关联再写一份。

## 6. 等你的统一读取

```ts
// attention.waiting.read@1（查询，项目范围）
output: { items: Array<{ subject: ActionSubject; source: "attention" | "task" | "event" | "missed_run";
                         since: string; task?: ActionSubject; open: OpenTarget | null }>;
          counts: { total: number } }
```

- 读时合并四处：Attention 条目、总表里等你的任务、事件登记里要你处理的事件、错过的运行；同一对象只算一次。线头的数字、事件上的等你、面板里的等你用同一次结果（WLN-39）。
- 写侧不动；第 56 批把来源收进 Attention 后，这个动作改成只问一处，调用方不用改。
- 放在哪：动作名归 Attention；合并要读事件与总表，实现放在宿主装配的一小段里调两边的端口。待核：公共合同台是否要求合并逻辑进 `horizontal/mainline`。

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

**Prologue（上游，随本批换包）。**

| 改动 | 为谁 | 位置 |
| --- | --- | --- |
| 一个会话同时只起一轮：按会话互斥，第二个起跑请求明确被拒 | 所有使用者；用户输入与接续同时到 | 会话起跑 |
| 子任务等回答成为父可等的一种条件，落定时带上问题与所属步骤 | 助理、Coding | 等待条件、接续 |
| 后台派出默认带「落定即接续」，可显式关掉 | 用 SDK 派发工具的（Coding） | 派发工具、子任务回写 |
| 重启后：已落盘的结果满足等待并接续一次；明确没开始的按原意图继续；其余停在需核对并回到父 | 所有使用者 | 恢复 |

不变：等待期间不发模型请求；取消与撤权先让等待与接续失效、提升代次，迟到的回调什么都不提交；接续不重置上限。

## 10. 助理一侧（A）

- **主对话。** 每个范围（个人、每个项目）和每个对话对方（助理、一个 Character）有一件常驻的助理工作当主对话，在工作上标出；第一次用到时建。后台任务是它名下的子工作。存量的几件工作照旧能打开，在面板与历史里。
- **限制重定。** 子工作仍只一层。「总共六个、同时三个」改成：同时在办的上限取设置，超出的排队并如实显示（PWA-131）；总数不设硬顶，由用量上限管。
- **提示词。** 平台维护两段，带版本标记，随角色下发：主对话的做法（先答、能后台办的派出去、这一轮不做长活、结果回来怎样判断）和安放说明（五种去处、什么算值得跟、什么时候问）。Character 当对话对方时在它自己的角色层之外加同样两段。
- **工具。** 委派工具加「为哪个事件办」；线读取与安放两个动作固定在角色的动作工具里。
- **「发给」。** 加一组 Character，只列平台能跑的；不再要求有页面的收件人在前台才出现。本机导入的原生 Character 不列，写明原因。
- **存储。** 助理工作新增的字段（是不是主对话、对话对方、是不是事件、自动接续计数）都是可选字段，不动建表语句。

## 11. 变更通知

线、面板、等你三处都不轮询。待核后定一种：首选把页面今天已有的两个信号（项目事件游标、助理工作变化的长请求）收成外壳的一个订阅；登记方的对象变了，经它已声明的插件事件进入。如果插件事件带不了「我的事件登记变了」，加一个平台事件类型，所有登记方发同一种。这一条定下来之前不写线的页面代码。

## 12. 要更新的快照与消费者

- 公共 API 快照：contracts 的 `platform/*`（事件、后台任务、对象引用、呈现、placement）、`services/*`（主线、助理、agent-host 协作），插件 SDK。动作快照：三家事件提供方改名、新增助理与 Coding 的事件提供方、`mainline.*`、`background.tasks.read`、`attention.waiting.read`、`objects.open`，删掉等待接续的动作。
- 版本表 `tooling/versions.json`：改名与新增的类型标识、动作、提示词版本。
- 新包登记：`scripts/workspace-packages.mjs`、归属与 CODEOWNERS、包清单表、错误主人表、README 的开发要求、`docs/horizontal/` 的手册。
- 安全不变量表：启动接续的复核、安放只收读得到的引用、未授权的线读取，各一条带拒绝测试。
- GLOSSARY：加「事项」「事件」「任务」「主线」。

## 13. 风险与待核

1. 变更通知用哪一种（§11）。
2. 系统提供方的呈现声明（§8）。
3. 两处改名的改动量（§2、§4）；评审可定不改名。
4. 守护作业不进面板，和审查稿的写法不同（§4）。
5. 页面资源：外壳、线、面板、事件卡合计会涨，超过 10 KB 或新增资源要先问用户。
6. 浏览器用例：断言现在的底栏、助理面板、右侧后台任务页的约六十个文件要按新位置重写。
7. Prologue 四处改动里，「子任务等回答成为可等条件」改到等待的核心类型，要对着它的切片文档做，并补它自己的用例。
