# 主线服务

按调用方自己的授权，现读一个项目的事项线（各登记方此刻报的事件，排好位置与先后）和后台任务总表，并在重新问过提供方之后执行任务自己给出的命令（[事项线](../../specs/work-line/spec.md) §5、§6）。线与任务总表什么也不存，每次都重新问。

它还管每个人在每个项目的主线（[主线](../../specs/work-mainline/spec.md)、[合同设计](../../specs/work-mainline/contract-design.md)）：事项、分组与排列、当前事项，以及「装进」关联。这是它唯一存的东西，放在 Home 的 `mainline/mainline.db`，只存轻量事项的名字、对象引用和排列；对象的标题、状态和下一步每次以调用方身份向来源读。

包名：`@molis-ai/molis-work-service-mainline`。工作区内部包，由 Host 装配成 `system.mainline` 的 `mainline.line.read@1`、`attention.waiting.read@1`、`mainline.place@1`、`background.tasks.read@1` 与 `background.tasks.command@1`，有 Home 时再加主线的十六个动作（`mainlineItemActions`：读主线、事项作主体、新建、变成对象、改名、移动、完成、移出、分组、切换、事项里的东西，以及 `holds` 关联的五步）。

## 一次典型调用

工作台画底部的线：Host 的 `mainline.line.read@1` 交给 `readWorkLine`。它 `discover` 一次，按事件读取合同的两个类型挑出登记方，并行各问一次（只读、各限 5 秒），同一次调用里读一遍后台任务总表，按每行的 `serves` 对上事件，给每件事件定在哪一翼、排第几、线上显示什么状态；这份总表随线放在 `table` 里一起返回，页面的线与后台任务面板只读这一次（N42）。

本人打开后台任务面板：Host 的 `background.tasks.read@1` 把调用方和它自己的客户端交给 `readBackgroundTasks`。它 `discover` 一次，按输出类型（`BACKGROUND_TASKS_OUTPUT_TYPE`）和聚合查询的规则挑出任务提供方，并行各问一次（只读、各限 2 秒），逐行检查后按更新时间排好给出；读不到的提供方只留标题和错误码。项目里自己会跑的事（定时任务、Feed 拉取等）的主人已经用运行概况的两个类型报「错过的」，总表直接读这份回答（`src/missed-runs.ts`）：错过的一次是一行等你的任务（`scheduled_run`），带「现在做一次」「跳过」两个回答，都是那个主人自己的决定动作；还没到点的不是任务，主人没有决定动作时这行只显示、没有可按的。本人点一行上的「停止」：`background.tasks.command@1` 交给 `runBackgroundTaskCommand`，它再问一遍那个提供方，命令与此刻给出的完全相同才以本人身份调用命令写明的动作。本人在事件卡或任务卡上答一项决定请求（同意、改一下、拒绝）：`background.tasks.decide@1` 交给 `decideBackgroundTask`，同样再问一遍提供方，这个任务还在问这个编号、还给这种回答才调用它写的动作；「改一下」必须带修改意见，别的回答不能带。

本人在主线上「建成目标」：`mainline.items.create@1` 交给 `createItem`。它 `discover` 一次，从调用方项目里已启用的安装的呈现声明（Host 给的 `declarations`）找出写了 `item` 的种类，只认这个安装自己的、形状由 `platform/work-items` 给定的动作；以调用方身份调来源的新建动作（`request_id` 由调用方的请求 id、人、项目、种类和名字派生，重试得到同一个对象），返回后先 `beforeEffect()` 再写主线。按事项读线时，`readWorkLine` 带上 `itemLineScope`：只留来源、装进的对象和来源自己的「相关」里的事件与任务，再把装进的、带时间角色的对象按主人的显示字段放上线，来源给的下一步排在「接下来」第一位。

## 从哪里读代码

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | `readWorkLine`、`gatherWorkEvents`（逐家问登记方，首页事项读取也用它）、`readWaiting`（等你的统一读取）、`placeTask`（安放与改去处，带 `item` 时放进事项）、`readBackgroundTasks`、`runBackgroundTaskCommand`，以及一行、一份回答的检查（`backgroundTaskRow`、`backgroundTaskRows`、`backgroundTaskOrigin`） |
| [src/items.ts](src/items.ts) | 主线的动作：`readMainline`（可带每件、每组的等你与在办数，任务总表只读一次）、`createItem`、`convertItem`、排列与分组、`holds` 关联、`placeInItem`、`itemLineScope`；事项来源的发现（`itemSources`）与以调用方身份读对象（`readable`） |
| [src/store.ts](src/store.ts) | 主线的库：`MAINLINE_BASELINE`、`MainlineStore`（每条语句带主人与项目；排列一行 JSON，带修订号）、`purgeMainlineProject` |

合同在 `@molis-ai/molis-work-contracts/platform/actions`（任务行的形状、`defineBackgroundTasksAction`）和 `@molis-ai/molis-work-contracts/services/mainline`（两个系统动作、读到的行、拒绝的错误码）。Host 装配在 [apps/local-host/src/mainline-actions.ts](../../apps/local-host/src/mainline-actions.ts)，工作台的入口在 [apps/local-host/src/mainline-http.ts](../../apps/local-host/src/mainline-http.ts)；跨项目的聚合（[apps/local-host/src/home-background-tasks.ts](../../apps/local-host/src/home-background-tasks.ts)）用这里的同一份行检查。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-service-mainline typecheck
pnpm --filter @molis-ai/molis-work-service-mainline build
```

## 开发要求

- 负责：发现事件登记方与任务提供方、并行只读调用与限时、逐行检查、给事件定位置与先后、把读不到的来源写进 `issues`；执行命令前重读提供方并核对命令；安放时按声明找到任务的主人、核对事件读得到、让主人记下去处；主线的事项、排列与「装进」关联，以及它们的库。
- 不负责：事件与任务本身、它们的状态和命令的效果（都归登记方与提供方：Coding、助理、待办、平台调度等）；对象的内容、完成与否和下一步（归来源插件）；动作的注册与授权（Host 装配，授权走动作网关）；哪些安装在这个项目里可达（Host 给 `declarations`）；任务面板与主线的界面。
- 公开入口：`@molis-ai/molis-work-service-mainline`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/services/mainline`、`@molis-ai/molis-work-contracts/platform/actions`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（执行生命周期、聚合查询的判定）、`@molis-ai/molis-work-storage`（主线库的基线与打开）。方向：只依赖合同、SDK 与存储；不读任何别的主人的库与文件，不依赖宿主和插件（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 只用调用方自己的客户端：调用方读不到的提供方不问；提供方按合同类型发现，不维护名单。
  - 命令只认回答方自己的动作：行里写了别的提供方的动作，不给出；执行时用的动作与输入是这次调用里从提供方读到的，不是页面传来的（WLN-34）。
  - 提供方声明的对象种类之外的任务不给出；登记方报了重复的事件 id 或声明之外的对象种类，它这一次的回答整份作废。
  - 事件的名字、状态词是登记方当次给的，不当成事实留存；任务的进度不抄进事件（总表只原样放在 `table`）（WLN-21、WLN-38）。
  - 读取不写任何业务记录；读不到的提供方只留错误码，不带它说的话。
  - 安放不改任务的授权、预算与数据范围；任务为哪个事件办只记在主人那里；调用方读不到的任务或事件被拒，主人什么也不改（WLN-34）。
  - 等你的件数只从线读取与任务总表的同一次结果推出，同一个对象只算一次；不另读 Attention 的表（WLN-39）。
  - 线与任务总表不存任何东西，不缓存上一次的回答。
  - 主线是一个人在一个项目里的：主人与项目只从调用上下文来，别人的、别的项目的事项当作没有（`S-mainline-own-line`）。库里只有名字、引用与排列（MLN-12）。
  - 对象先以调用方身份读到才能装进或设为事项；「建成」只调来源自己声明的、形状由平台给定的动作；要等别的主人的写在返回后先 `beforeEffect()` 再提交。排列的写带 `expected_revision`，旧的被拒并带回当前主线；「装进」与切换不动排列的修订号。
  - 下一步只许开始来源自己的动作，别家的不显示、记为问题。
- 改动后必跑：`node scripts/run-tests.mjs tests/mainline-line-read.test.ts tests/mainline-place.test.ts tests/mainline-background-tasks.test.ts tests/mainline-missed-runs.test.ts tests/mainline-items.test.ts tests/security-invariants-mainline-own-line.test.ts tests/work-item-sources.test.ts tests/clean-home-core-stores.test.ts tests/object-link.test.ts tests/home-event-actions.test.ts tests/coding-background-tasks.test.ts tests/home-aggregate.test.ts`；改了合同再跑 `pnpm api:update`、`pnpm actions:update`，改了库结构再跑 `pnpm schemas:update` 并升版本。
- 相关手册：[specs/work-line/contract-design.md](../../specs/work-line/contract-design.md) 第 3、4、5 节，[specs/work-mainline/contract-design.md](../../specs/work-mainline/contract-design.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
