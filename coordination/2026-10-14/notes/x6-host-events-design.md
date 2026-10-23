# X-6 宿主发起的事件：设计稿（② 10-22，交 ① 审）

**状态**：草稿，等 ① 批。
- 基于 main `3a4ffe46d`；代码事实见同目录 `x6-facts-1022.md`。
- 要它的是 ③ 的 G2（① 说的 G2b；`git-hybrid-exit-plan.md` 的 C1、C16，PG-044 的 Git 行）。
- 需要 ① 裁的四项列在 §7，每项都给了推荐。

## 1. 先把 X-6 的定义补上

**现在的情况。**
- `docs/system/EXTENSION-POINTS.md` §4.3 有 X-6，写的是「领域事件订阅口（项目库事件流，按声明订阅）」，为的是 F5 自动化规则：构建期插件发的事件也能触发规则。
- PG-033（Goals 写入后发事件、Inbox 订阅）和 PG-044（工作区变化与 git 结算改成平台事件）引用的就是它。
- 但那一行只说了来源是项目库事件流，没说宿主自己能不能发、怎样只投给一个安装。G2b 要的恰好是这两件。

**补成的定义**：X-6 是**插件按 Manifest 声明订阅、发布者不是运行中插件的事件**。
- 插件用同一处声明订阅（`events.subscribes`），用同一个入口接收（`onEvent`）。
- 来源有两种：
  - **宿主事件**：宿主自己发。本片只做这一种，第一条是审查结算。
  - **领域事件**：构建期插件与 Module 写进项目库事件流的事件（F5、PG-033）。这一种留到 F5 或 PG-033 动手时，到时沿用本片的声明与接收写法。
- 本片改 EXTENSION-POINTS 那一行，写明两种来源与本片做了哪一种。privileges 的 PG-044 改成「部分已做」，PG-033 不动。

## 2. 第一条宿主事件：审查结算

- **类型**：`host.review.settled`，版本 1。用 `host.` 前缀，这是宿主保留、插件不能发的命名空间（`plugin-events.ts:18`）。
- **什么时候发**：人批准的插件操作执行完、结果定下的时候，也就是现在通知 Git 的同一个时刻（`reviews.ts` 的 `settle`、`uncertain`）。
  - `outcome` 是 `succeeded`、`failed` 或 `unknown`，和今天 `GitOperationUpdate` 的三个值一致。
  - 拒绝、取消、过期不算结算，不发（今天也不发）。
- **内容**：`{ review_id, kind, operation_id, workspace_id, outcome }`。
  - `kind` 是 `PluginReviewKind`。
  - 只有协调用的事实，不带文档、路径或命令。
- **发给谁**：只发给**发起这个审查的那个安装**。
  - 收件人取发起时记下的 `ReviewAuthority { plugin_id, install_id }`（`reviews.ts:21-25`）。
  - 结算通知把它一并交给观察者。这只在 agent-host 和宿主组合之间传，不写进审查记录，`AgentReviewRequest` 不加字段。
- **不发的**：
  - 没有发起安装的审查不发：Agent 自己的改动、`checkpoint-rewind` 一类会话操作，以及重启后从账本恢复出来的审查（恢复时 `install_id` 不在，今天恢复出来的结算也不通知）。
  - 今天宿主里按 Git 的口径跳过 `checkpoint-rewind`（`git-operation-notifications.ts:8`）。换成按「有没有发起安装」判断以后，宿主里就不用再写 Git 专用的规则。

## 3. 投递：即时，不落库（推荐）

宿主事件走插件事件总线的投递那一半，但**不写事件日志**：
- **至多一次。** 投递时，收件人必须满足三条：
  - 正在运行，`install_id` 与事件上记的相同；
  - 当前 Manifest 声明订阅了这个类型和版本；
  - 没有被停用。

  三条有一条不满足就不投，也不为它启动插件、不留着重投。
- **在动作之外投递**（同 S-18）：沿用总线的按订阅者串行和 `outsidePluginAction`。上下文是订阅者自己的（`actor_id: plugin:<id>`、它的 `signal`、`beforeEffect`），不是批准的那个人，也不是触发结算的那个调用。
- **失败的处理**：处理器抛错，报给 `observeFailures`，不重投；投递中被撤权或停用，`beforeEffect` 拒绝。
- **`onEvent` 收到的记录**：
  - `source_plugin_id`、`source_install_id` 都是 `"host"`。插件 id 是反向域名，`host.` 是保留前缀，所以不会和任何插件撞；
  - `sequence` 是 0（不在日志里），`correlation_id` 是 `review_id`。

**为什么不落库。**
- 要落库，就得在 `plugin_events` 加一列收件安装，并让匹配、待投查询、游标都认它。
- 项目库是整份基线，换表就要从 v8 升到 v9，再做一次「维护九」（#867 的 v7 → v8 就是这样做的，带一份演练测试），这牵涉真实 Home 的维护流程。
- 这条事件只是「去重读」的提示：插件拿 `operation_id` 能读到操作的现状，错过一次不丢事实。今天的端口本来就是内存里的，也不落库。
- 以后哪条宿主事件真要保证送达，再按那时的需要升库版本，单独设计。

## 4. Manifest 写法

```ts
events: { subscribes: [{ event_type_id: "host.review.settled", type_version: 1 }] }
```

- **不写来源。** `host.` 前缀的类型来源只能是宿主，所以 `from_plugin_ids` 省略；写了就拒绝。别的类型照旧必须点名来源插件。
- **只能订宿主登记过的类型和版本。** 宿主事件的清单放在合同里（`platform/plugin-events.ts`：类型、版本、载荷的 TypeScript 形状），SDK 的 Manifest 检查（`wiring-declarations.ts`）按这份清单查。不在清单里的 `host.` / `molis.` 类型，读 Manifest 时就拒绝，报现有订阅检查的同类错。
- **不要新权限。** 能收到的只有自己发起的审查的结果。发起本身已经要求 `review:<kind>`（S-50）。
- 插件仍然不能发 `host.` 前缀的事件（已有拒绝：`plugin.event_type_reserved`）。

## 5. 安全不变量：单列一条（推荐）

单列一条新的 S 行，不往 S-18 里加。理由：
- 这是插件之间的保密边界：A 发起的操作结果不能让 B 知道。今天其实没守住，结算会交给 Git，不看是谁发起的；只是现在只有 Git 一个在听。
- S-18 管的是「在动作之外跑、撤权后不写」，已经很长。保密这条有自己的拒绝，应该单独有测试。

**号。** 10-22 核过：main 上最高是 S-53，在途 PR 里只有 #999 改了 S-15，没有新号。所以现在的下一个空号是 S-54。设计稿不写死，开 PR 时照规矩再核 main 和在途 PR，撞了后合的顺延。

**条文要点。**
- 宿主事件只由宿主发出。
- 定向的宿主事件只投给事件上记着的那个安装。别的插件即使声明订阅同一类型，也收不到。
- 收件人要在当前 Manifest 里声明订阅。
- 换了安装（卸载重装、换提供方）的，收不到旧安装发起的。
- 不落库，不重投。
- 在动作之外投递，订阅者用自己的身份。

**拒绝测试**（编号到 PR 里定，暂记 X6-01 至 X6-07）：
1. 插件 B 也声明订阅 `host.review.settled`，A 发起的审查结算时，B 收不到；A 收到。
2. A 发起了审查，但 Manifest 没订阅这个类型，A 收不到，也不会为它启动。
3. 插件发 `host.review.settled`：`plugin.event_type_reserved`（已有，补进这条的证据）。
4. Manifest 给 `host.` 类型写了 `from_plugin_ids`、或订阅了清单外的 `host.` 类型：读 Manifest 时拒绝。
5. A 卸载后重装（新 `install_id`），旧审查结算时新安装收不到；A 停用时也收不到。
6. Agent 自己的改动、恢复出来的审查结算时，谁也收不到。
7. 结算发生在一个动作里面时，投递在动作之外跑。处理器拿到的是订阅者自己的上下文；处理器抛错不影响结算，只报 `observeFailures`。

## 6. 这一片做什么、不做什么

**改的包。** contracts、plugin-sdk、plugin-runtime 都是共享核心，所以**进批**。
- **contracts** `platform/plugin-events.ts`：宿主事件清单、`host.review.settled@1` 的载荷类型、订阅声明里 `from_plugin_ids` 对 `host.` 类型可以省略。跑 `api:update`。
- **plugin-sdk** `wiring-declarations.ts`：照 §4 检查。跑 `api:update`。
- **plugin-runtime** `events.ts`：总线加一个只给宿主用的 `notify(收件人, 事件)`。插件拿到的 `services.events` 里没有它。匹配、串行、撤权沿用现有代码；不写日志，不建游标。
- **agent-host** `reviews.ts`：结算观察者多收一个「发起安装」（取自 `#authorities`）。不改合同。
- **local-host**：一个通用的结算转发，把审查结算转给那个项目的总线，按收件人 `notify`。文件名不带 Git。旧的 `git-operation-notifications.ts` 和 Git 端口**这一片不删**，留给 ③ 的 G2b（Git 改成订阅、宿主删端口）。在那之前两条路并存，Git 还没订阅，新事件不会投给任何插件。
- **文档**：
  - `docs/platform/PLUGIN-PLATFORM.md` 事件一节；
  - `skills/molis-plugin-dev/host.md`（怎样订阅宿主事件）；
  - `docs/system/EXTENSION-POINTS.md` 的 X-6 行；
  - `docs/system/SECURITY-INVARIANTS.md` 新行；
  - `privileges.md` 的 PG-044；
  - GLOSSARY 加「宿主事件」。
- **测试**：新文件，用测试插件，不用 Git。§5 的 7 条进 `test:security`。

**体量**：中。没有新的 Error 子类。如果要新错误码，用 `defineErrorCodes` 声明。不改库结构。

**不做**：
- 领域事件那一种来源（F5、PG-033）；
- 工作区变化事件：今天 Files 的 `onWorkspaceChanged`、Git 的 `onWorkingTreeChanged` 两个端口都只是让视图重读，改成插件自己调 `ui.invalidate`（PG-061，已合），端口由 Git 的 G2、Files 的 C6 后半删；
- 拒绝、取消、过期的通知（§7 的 D2）；
- 删 Git 的端口（③ 的 G2b）。

## 7. 要 ① 裁的四项

| # | 问题 | 推荐 | 另一种 |
| --- | --- | --- | --- |
| D1 | 宿主事件落不落库 | **不落库**：即时投给正在运行的收件安装，至多一次（§3） | 落库：`plugin_events` 加收件安装列，项目库 v8 → v9，加维护九。动真实 Home 的维护流程要先问用户 |
| D2 | 第一版发哪些结果 | **只发执行完的结算**（成功、失败、不明），和今天一致 | 连拒绝、取消、过期也发。过期今天是按时间算的，不是一次状态转换，要另做一个触发点 |
| D3 | 安全不变量 | **单列一条新 S 行**（现在看是 S-54，开 PR 时再核） | 写进 S-18 |
| D4 | X-6 的定义 | **统一成「插件按声明订阅、发布者不是运行中插件的事件」**，宿主事件与领域事件两种来源，本片只做宿主事件 | 宿主事件另起一个编号，X-6 只留给领域事件 |

D1 选「落库」的话，这一片会变大，并且要先问用户真实 Home 的维护。其余三项不影响别的线；G2b 按哪种都能接。

## 8. 和别的线

- **③ G2b**：等本片合入以后，Git 在 Manifest 订阅 `host.review.settled@1`，`onEvent` 里照旧发 `GIT_OPERATION_UPDATED_EVENT`；宿主再删端口和 `git-operation-notifications.ts`。S-18 里点名 `updateObservers` 的那句，到时由 ③ 改成指向本片的新行。
- **BL-411**（插件停止后残留回调抛错让进程退出）：排在本片之后。本片新加的投递在动作之外跑、处理器的错只报 `observeFailures`，不会给 BL-411 添新的出口。
- **在途 PR**：10-22 查过，没有别的 PR 改 `plugin-events.ts`、`events.ts`、`wiring-declarations.ts`、`reviews.ts`。开工时再查一遍。
