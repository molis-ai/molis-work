# 常驻、休眠与错过的事：设计

状态：已实现（2026-11-12，路线书第 25 批第 1 项，本批分支 `batch/25`；实现时改的地方写在 §10，以那里为准）。行为以[主动助理](spec.md) §13、PWA-27、PWA-137 与 §18 决策记录为准（11-04 菜单栏面板、桌面是本机服务的主人；11-11 错过的事归各自的主人、Home 里的地址文件），本文只写怎么做。界面照 11-04 定样（[`docs/design/runtime-and-recovery`](../../docs/design/runtime-and-recovery/README.md)「运行状态」），不重新出样。第一片（Dock 重开主窗口、退出项写明后台服务继续运行、BL-645／BL-352 对账）已随 #1815 合入。

验收编号用 `RES-` 前缀，在 §9 列出；它们细化 PWA-27、PWA-137。

## 0. 给人讲清楚

Molis Work 关掉窗口后还在后台跑，可你看不到它在做什么；电脑睡一觉醒来，定时任务会悄悄补跑一次，错过了什么你也不知道；退出时不提醒哪些事不会再做。这一步做五件事：

1. 菜单栏面板写清楚现在在不在运行、错过了什么、接下来做什么；错过的每件给「现在做」「跳过」，不自动补跑；没联网、模型连不上时写明哪几件在等。
2. 退出前列出退出后不会运行的事，确认了才退。
3. 再次打开时，首页先说停了多久、错过了什么。
4. 设置 › 运行里有两个开关：登录时启动、关掉窗口后继续运行。
5. 桌面和命令行从 Home 里的地址文件得知本机服务开在哪个端口，不再只认 4173。

## 1. 现状里决定设计的几条

| 事实 | 依据 | 对设计的影响 |
| --- | --- | --- |
| 定时任务、定时操作、插件提醒由 Schedule 拥有，到点经 Scheduler 唤醒；唤醒输入带 `due_at`；醒来晚了照样执行（间隔任务只补一轮） | `plugins/native/schedule/src/runtime-wakeups.ts`、`docs/horizontal/scheduler.md` | 「晚过宽限就记错过」改在 Schedule 的唤醒处理里，Scheduler 不动 |
| 助理跟进晚过 10 分钟已经记 `missed`、发一条通知，从不补做 | `apps/local-host/src/assistant/assistant-followups.ts:220` | 助理已经是「错过」的主人，只缺「现在做／跳过」和交出来的格式 |
| Feed 的定时拉取有自己的调度（`next_pull_at`） | `plugins/native/feed/src/source-scheduler.ts` | Feed 也是主人，同一条规则 |
| 宿主按类型找提供方已有先例：到期提醒按 `input_type`／`output_type` 从动作目录发现（Todo 提供，助理读） | `packages/contracts/src/platform/due-reminders.ts`、`assistant-followups.ts:262` | 「错过的事」照同一个写法：主人声明动作，平台按类型发现，不另写名单 |
| 菜单栏的 Capsule 是宿主提供的网页，挂在托盘图标下 | `apps/desktop/adapters/tauri/src/main.rs`、`apps/workbench/src/capsule.ts` | 运行面板放进 Capsule；宿主不在时由桌面原生显示「已停止」 |
| 桌面的本机身份检查和 Tauri 授权写死 `127.0.0.1:4173` | `web_identity.rs`、`capabilities/*.json`、S-14 | 端口改由地址文件给，授权在启动时按核过的端口加 |
| `MOLIS_WORK_WEB_URL` 可以覆盖默认地址；启动器（MCP）按需拉起宿主时用 `--port` | `runtime-context.ts`、`mcp-resident-start.ts` | 默认地址改成先读地址文件 |

## 2. 错过的事与接下来的事（合同）

新文件 `packages/contracts/src/platform/scheduled-runs.ts`（与 `due-reminders.ts` 同一种写法），两个类型：

```ts
export const RUNS_OVERVIEW_INPUT_TYPE = "molis.runs.window.v1";   // { now: string; upcoming_until: string }
export const RUNS_OVERVIEW_OUTPUT_TYPE = "molis.runs.overview.v1";
export interface ScheduledRun {
  run_id: string;               // 这一次的稳定 id：同一任务的下一次是另一个 id
  title: string;                // 用户的话
  due_at: string;
  project_id: string | null;
  open: { surface: string; id: string } | null;
  needs: ("network" | "model")[];  // 跑这一次要什么；平台据此标「等着」
}
export interface MissedRun extends ScheduledRun { missed_at: string }
export interface RunsOverview { source: { surface: string; title: string }; upcoming: ScheduledRun[]; missed: MissedRun[] }

export const RUN_DECISION_INPUT_TYPE = "molis.runs.decision.v1";   // { run_id: string; decision: "run_now" | "skip" }
export const RUN_DECISION_OUTPUT_TYPE = "molis.runs.decided.v1";   // { state: "started" | "skipped" | "gone" }
export function defineRunsOverviewAction(...): ActionDefinition<RunsWindow, RunsOverview>;   // query，scope home，concurrent
export function defineRunDecisionAction(...): ActionDefinition<RunDecision, RunDecided>;     // command，scope home
```

- `upcoming` 只给窗口内的，每个来源最多 20 件；`missed` 只给还没处理的，最多 50 件。
- 「现在做」是主人用和到点同一条路跑一次，结果回到原处（任务的对话、Feed 的列表、跟进的那一轮）；返回 `started` 就算接下了，不等跑完。「跳过」只把这一件标成已跳过。`gone` 表示这件已经不在了（任务删了、已经处理过），页面刷掉这一行。
- 两个都按类型发现：平台只认同时声明了这两对类型的提供方。SDK 的声明检查（`packages/plugin-sdk/src/action-declarations.ts`）照到期提醒的样子查形状。
- 改合同：跑 `pnpm api:update`、`pnpm actions:update`，合同部分请公共合同台合审。

### 2.1 各主人怎样记

**宽限**：晚过 10 分钟就算错过（和助理跟进一样，`RUN_MISSED_GRACE_MS` 放进合同，三处用同一个数）。宽限内醒来照常执行。

**Schedule**：唤醒处理（`scheduleRuntimeWakeup`）先比 `due_at`：晚过宽限就不执行，写一行错过记录，照常排下一次（对话任务照旧登记下一天的那一次；间隔操作由 Scheduler 排下一周期），返回成功回执并在 `detail` 里写 `missed`。错过记录放进 Schedule 自己项目库里的新表：

```sql
CREATE TABLE schedule_missed_runs (
  project_id TEXT NOT NULL, run_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('task', 'operation', 'reminder')),
  ref TEXT NOT NULL, title TEXT NOT NULL, due_at TEXT NOT NULL, missed_at TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('run_now', 'skip')), decided_at TEXT,
  PRIMARY KEY (project_id, run_id)
);
```

Schedule 的表从第 1 版升到第 2 版，升级段只有这一句 `CREATE TABLE`（插件段走 U1 的检查，只碰自己的表，S-147）。提醒错过了也记：「现在做」就是现在提醒一次。`run_id` = `<kind>:<ref>:<due_at>`。

Schedule 的提供方是 Home 级读（它在每个项目里都有表）：照 Todo 的 `withProjectReach` 写法读各项目，按 `project_id` 标出来源。

**助理跟进**：已有 `missed` 结果。加两件：一是交出 `runs.overview` 与 `runs.decision`（系统提供方 `system.assistant`，宿主登记，没有 Manifest）；二是「现在做」照 `attach()` 里到点的同一条路开一轮。跟进的「接下来」就是已排定、还没到的那些。

**Feed**：拉取调度见到 `next_pull_at` 晚过宽限的来源，不拉，记一行错过，`next_pull_at` 照常推到下一个时刻。错过记录放在 Feed 存来源的那个库里（那个库升一个版本，加一张同形状的表）。「现在做」就是立刻拉这一个来源。

宿主已有的「错过的提醒」（`sweepReminders`，读的是 Todo 一类插件的到期提醒）不变：那是提醒用户，已经晚了就说晚了，不是要补跑的工作。

### 2.2 平台汇总：`runtime.overview@1`

宿主登记一个系统动作 `runtime.overview@1`（query，scope home，受众 user、agent）：按类型发现全部提供方，并发调一次，合成：

```ts
interface RuntimeOverview {
  state: "running";                       // 宿主答得出来就是在跑；停了由桌面显示（§4）
  waiting: { network: boolean; model: boolean };
  gaps: { from: string; to: string; cause: "quit" | "crash" | "sleep" }[];   // 最近没在运行的时段，最多 5 段（§3）
  upcoming: (ScheduledRun & { provider: ProviderRef; waiting: boolean })[];  // 按时间排，最多 20 件
  missed: (MissedRun & { provider: ProviderRef })[];
}
```

- 一个提供方失败或超时（2 秒），其余照常，这一路写进 `unavailable_sources`，不让整张表失败。
- 「现在做／跳过」页面直接调那一件的提供方的 `runs.decision`（`provider` 给出准确引用），平台不转一层。
- `waiting.network` 取宿主现有的联网探测（模型连接检查的同一个结果），`waiting.model` 取默认文字模型的连接状态；`needs` 里有对应项的那一件标 `waiting`。
- 调用次数：一次面板打开 = 一个 `runtime.overview` 请求 = 每个提供方一次调用，每个提供方各开一次自己的库（Schedule 读各项目时按项目开，和 Todo 读到期提醒一样）。面板开着时 30 秒刷新一次，关着不刷。

## 3. 没在运行的时段

宿主在 Home 里写 `run/presence.json`（`format.home.run.presence` 第 1 版，主人 `apps/local-host`）：

```json
{ "schema_version": 1, "started_at": "…", "last_alive_at": "…", "stopped_at": null, "gaps": [ { "from": "…", "to": "…", "cause": "quit" } ] }
```

- 每 60 秒更新一次 `last_alive_at`（原子写）。正常退出时写 `stopped_at`。
- 启动时读上一份：有 `stopped_at` → 记一段 `quit`（`stopped_at` 到现在）；没有 → 记一段 `crash`（`last_alive_at` 到现在）。
- 运行中两次更新之间隔了超过 3 分钟（机器睡着了，计时器没走）→ 记一段 `sleep`，并立刻让 Schedule、Feed 各跑一次检查（不等下一个 30 秒节拍），错过的马上记下。
- `gaps` 只留最近 20 段，`runtime.overview` 给最近 5 段。
- 只记时间，不记内容。登记进 `homeStores()`（快照时 `reset`，卸载随之删除），`HOME-DATA.md` 加一行。

## 4. 菜单栏面板与退出

**面板**（Capsule 里加「运行」一节，宿主渲染）：

- 状态：`mw-status`「在运行」；有 `waiting` 时写「没联网，要联网的 n 件先等着」「模型连不上，要模型的 n 件先等着」，并给去设置 › 模型的链接。
- 错过的：`mw-alert`（warning）「睡眠时错过 n 件」或「hh:mm–hh:mm 没在运行，错过 n 件」，每行 `mw-dir-row` + 「现在做」（primary）「跳过」。全部处理完换成「错过的都处理了」（success），下次打开不再出现。
- 接下来：最多 5 行，等着的那件写「等着」。
- 托盘图标在有未处理的错过时带一个点（原生绘制，跟随菜单栏模板图标的明暗）。

**宿主不在**：桌面原生判断（健康检查失败），Capsule 窗口加载本地的一张静态页（和主窗口的 `bootstrap_view` 同一种写法），写「Molis Work 没在运行」和「打开」按钮；托盘标题写「已停止」。不显示「仍在运行」（PWA-137）。

**退出**：托盘「退出 Molis Work」和主窗口 ⌘Q 都先打开面板的退出确认：`mw-alert`（warning）「退出后，这些不会运行」+ 接下来 24 小时内的事（最多 5 行，多的写「还有 n 件」），「取消」「退出」。没有要运行的事就直接退。确认后照现在的退出：停掉桌面拉起的宿主（写 `stopped_at`）；宿主不是桌面拉起的，照 #1815 写明后台服务继续运行、不列清单。

**再次打开**：首页顶部（`mw-brief` 之上）同一张错过的提示，加上已核对、不再提醒的那几件（助理跟进里结果是「已不需要」的，来自跟进自己的结果，不另判断）。

## 5. 两个开关（设置 › 运行）

新设置页「运行」（`apps/workbench/src/settings-running.ts`），只在桌面里出现（浏览器里不列这一页）：

- **登录时启动**：开的是桌面本身（11-04 定）。用 `tauri-plugin-autostart`（macOS 写一个登录项的 LaunchAgent），状态以系统为准，页面每次打开时读。
- **关掉窗口后继续运行**：默认开。关掉时，关主窗口就走退出（先确认清单）。存在 `config/desktop.json`（`format.home.desktop` 第 1 版，主人 `apps/desktop`，由 Rust 读写，宿主不读）。

两个开关都经桌面原生命令改（`runtime_settings_get`／`runtime_settings_set`），只开给主窗口本机主文档（同 S-14 的规则）。

## 6. 端口与地址文件（BL-108）

宿主开始监听后写 `run/endpoint.json`（`format.home.run.endpoint` 第 1 版）：`{ schema_version: 1, port, process_id, started_at }`，不含令牌；正常退出时删掉。只是指路：读的人照旧用 `/health` 的挑战证明核对身份（S-07、S-14），对不上就当没有。

- **桌面**：先读地址文件，核过身份就连那个端口；没有或核不过，照旧在 4173 上找或起宿主（起的时候传 `--port`：4173 被别的程序占了就从 4174 往上找一个空的，最多到 4199）。Tauri 授权（远程地址）改成启动时按核过的端口加（`app.add_capability`），静态文件里的 4173 那几条删掉，换成运行时生成的同一份内容；S-14 的拒绝测试改成「只认核过的端口，别的端口与来源都拒」。
- **启动器与命令行**：`runtime-context.ts`、`resident-host-request.ts`、`mcp-resident-start.ts` 的默认地址改成：`MOLIS_WORK_WEB_URL` > 地址文件 > `127.0.0.1:4173`。按需拉起时照旧传 `--port`。
- 这是 Runtime 配置合同的读法变化（端口不再写死），在 `docs/system/CONTRACT-CHANGES.md` 记一行；Runtime 配置本身的形状不变。

## 7. 一个 Home 一个执行进程与恢复

已做（#1815 对账）：宿主启动时取存储主人锁，别的入口转发；锁随进程消失；未知结果按主人对账。本批只补和运行状态有关的两件：崩溃后的那一段由 §3 记成 `crash` 并显示；恢复后不集中补发过时提示、不重做已成功的（错过的只报告，§2.1）。「上次意外退出」的诊断与恢复卡归第 26 批第 4 项。

## 8. 文件与包

| 改动 | 位置 | 轨道 |
| --- | --- | --- |
| 合同 `scheduled-runs.ts`、SDK 声明检查 | `packages/contracts/src/platform/`、`packages/plugin-sdk/src/action-declarations.ts`、`tooling/gates/api|actions` | C1（合同） |
| Schedule：宽限、错过表（第 2 版）、两个动作 | `plugins/native/schedule/src/` | Schedule 主人 |
| Feed：宽限、错过表（存来源的库升一版）、两个动作 | `plugins/native/feed/src/` | Feed 主人 |
| 助理跟进：两个动作、「现在做」 | `apps/local-host/src/assistant/` | A |
| `runtime.overview@1`、presence、地址文件、睡眠检测 | `apps/local-host/src/`（新 `runtime-overview.ts`、`host-presence.ts`、`host-endpoint.ts`；`web-server.ts`） | C1（宿主启动，枢纽） |
| 面板、首页提示、设置 › 运行 | `apps/workbench/src/`（`capsule.ts`、首页、新 `settings-runtime.ts`） | D |
| 桌面：退出确认、托盘点、停止页、两个开关、地址文件、运行时授权 | `apps/desktop/adapters/tauri/src/`、`src-tauri/runtime-capabilities/`、`Cargo.toml`（`tauri-plugin-autostart`） | F |

## 9. 验收

| 编号 | 检查 | 测试 |
| --- | --- | --- |
| RES-01 | Schedule 的任务、操作、提醒晚过宽限不执行、记一行错过、照常排下一次；宽限内照常执行 | `tests/schedule-missed-runs.test.ts` |
| RES-02 | 「现在做」用到点的同一条路跑一次并标 `run_now`；「跳过」只标 `skip`；已删的任务返回 `gone` | 同上 |
| RES-03 | Feed 晚过宽限的来源不拉、记错过、推到下一时刻；「现在做」立刻拉这一个 | `tests/feed-sources.test.ts` |
| RES-04 | 助理跟进的错过与接下来按同一格式交出，「现在做」开一轮 | `tests/assistant-followups-collaborator.test.ts` |
| RES-05 | `runtime.overview@1` 按类型找到全部提供方；一个提供方失败其余照常；每个提供方只调一次 | `tests/runtime-overview.test.ts` |
| RES-06 | presence：正常退出记 `quit`、被杀记 `crash`、计时器隔了 3 分钟以上记 `sleep` 并立刻检查一次 | `tests/host-presence.test.ts`（注入时钟） |
| RES-07 | 地址文件：监听后写、退出时删、不含令牌；启动器按 环境变量 > 文件 > 4173 选地址，文件里的端口身份核不过就不用 | `tests/host-endpoint.test.ts`；桌面 `res07_…`（`host_port.rs`、`web_service.rs`） |
| RES-08 | 桌面只对核过的端口开授权；别的端口与来源被拒（S-14 改写后的拒绝测试） | `res08_s14_…`（`host_port.rs`、`runtime.rs`）、`tests/security-invariants-desktop-ipc.test.ts` |
| RES-09 | 退出前列出 24 小时内不会运行的事；没有就直接退；宿主不是桌面拉起的照 #1815 写明后台继续运行 | `res09_…`（`main.rs`）+ 浏览器用例 `tests/runtime-panel.e2e.test.ts` |
| RES-10 | 面板：在运行、等着、错过（现在做／跳过）、处理完；宿主停了显示「没在运行」，不显示仍在运行（PWA-137） | `res10_…`（`main.rs`、`runtime.rs`）+ 浏览器用例同上 |
| RES-11 | 设置 › 运行的两个开关只在桌面出现，经原生命令读写；「关掉窗口后继续运行」关掉时关窗走退出确认 | `res11_…`（`runtime.rs`）、`tests/plugin-global-settings.test.ts` + 浏览器用例同上 |
| RES-12 | [人工] 真机：关窗仍跑、睡眠醒来看到错过、退出确认、再打开首页的提示、登录时启动 | 本人验收 |

## 10. 实现时改

以下几处与上文不同，以这里为准（2026-11-12）：

- **汇总不是动作，是宿主的两条路由**：`GET /api/runtime/overview` 与 `POST /api/runtime/runs/decide`（`apps/local-host/src/runtime-overview.ts`、`runtime-overview-http.ts`），没有登记 `runtime.overview@1`。汇总只给本机的人看，Agent 要的是各主人自己的 `runs.overview`；「现在做／跳过」由宿主按 `scope_project_id`＋`provider_id` 在同一处重新按类型找到那位主人再交给它，页面不拿动作引用，平台也不另判。主人超时 2 秒（首页汇总的同一个 `home-aggregate` 读法），一位失败只在 `unavailable_sources` 里留错误码，它说的话不带出来。
- **项目里的主人按项目找**：Schedule、Feed 的 `runs.overview`／`runs.decide` 是 scope project 的动作，宿主在每个打开的项目里各问一次（与首页汇总同一套 `home_aggregate`）；助理定时的两个动作挂在 `io.molis.work.assistant.rules` 这个系统提供方上（scope home）。动作 id 是 `<主人>.runs.overview@1`、`<主人>.runs.decide@1`。
- **`waiting.model`** 是「没有设好可用的文字模型」，不是连接探测；`waiting.network` 是本机有没有网络。
- **醒来立刻检查**只让宿主的周期任务马上跑一次（`onHostWake` → `periodic.wake()`），Schedule、Feed 的错过在它们各自的唤醒里记。
- **胶囊的「运行」一节**用胶囊自己的样式类，经桌面命令读和决定（`runtime_overview`、`runtime_decide`、`runtime_missed_dot`、`runtime_quit_confirmed`、`runtime_open`），不加载页面的共享请求客户端：那个客户端比这一节本身还大，胶囊整页会超过 10 KB 的增长线。首页的提示用组件板的 `mw-*` 与 `molisWorkRequest`。
- **「已核对、不再提醒」那几件今天没有来源**：助理跟进的结果里没有「已不需要」这一种，首页只列错过的。等跟进有了这个结果再接（不在本批另判断）。
- **设置 › 运行**一份页面两种样子：设置区把页面抓取进来时不带桌面标记、页面里的内联脚本也不执行，所以由 `molisWorkBindRunningSettings` 看有没有桌面命令，有就显示两个开关，没有就说开关在桌面里；目录只在桌面里列这一页，地址在浏览器里也打得开。
- **胶囊能打开的主窗口页**在 `/projects/…` 之外只多了正好 `/settings/models`（「去设置模型」那一下）。
- **宿主不是桌面起的**：LaunchAgent 装的本机服务仍固定在 4173（服务的 plist 不随地址文件变）；只有桌面自己起宿主、4173 被别的程序占着时才换到 4174–4199。
- **宿主不答时**：桌面命令分发先核宿主身份，核不过的命令一律拒；只有「打开」（`runtime_open`）与「确认退出」（`runtime_quit_confirmed`）不等这一步（`main.rs` 的 `answers_without_host`），它们本来就是给宿主不答时用的，仍按窗口与来源拒。
- **退出前问**：有主人这次没答（`unavailable_sources` 不空）时，即使没有一天内要跑的也不直接退出，确认框说明这份列表不全；「还有 n 件」按各主人各自给的列表算，每位主人最多给 20 件。
- **回到上一版**：从停宿主到重新起来的整段时间，桌面的健康监视既不救宿主也不显示「没在运行」（`rollback.rs` 的 `going_back`）；另存现在数据的目录在停宿主之前建，建不了就什么都不停。
- **地址文件**：桌面先在文件指的端口上核身份，核过才把端口用上（`answer_at`），别的线程读不到没核过的端口。
- **运行时授权**：`src-tauri/capabilities/` 不再有静态授权，六份模板在 `src-tauri/runtime-capabilities/`，启动核过端口后按端口填好再 `add_capability`（`host_port.rs`、`main.rs` 的 `grant_host_capabilities`）；同一个端口只加一次。

### 10.1 已知局限（评审 #2034 提出，本批不改）

- **退出被拦住时的系统注销与关机**：桌面在 `ExitRequested` 上先问，macOS 注销或关机时也会先等这一问；系统会提示应用没退出。系统发起的退出不问直接退，另立事项 [BL-desktop-quit-on-system-logout](../backlog/BL-desktop-quit-on-system-logout.md)。
- **换端口后旧端口的授权**：Tauri 运行时加上的能力不撤下，留到桌面退出；两个端口都只在本机回环、都要过核身份才会被用到。
- **Feed 的「现在做」**：把下次拉取设成当下；如果之后十分钟以上没有轮到（例如马上睡眠），会再记一次错过，人再决定一次即可（[BL-feed-run-now-missed-again](../backlog/BL-feed-run-now-missed-again.md)）。
- **没决定的错过不过期**：一直列着，直到人选「现在做」或「跳过」，或来源被删（[BL-missed-runs-never-expire](../backlog/BL-missed-runs-never-expire.md)）。
- **面板读不到时**：读失败一律显示「没在运行」，不区分宿主没起和一次读超时；30 秒后再读。

## 11. 开工前检查

对第 25 批第 1 项答（[开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)第 4 节），按实现后的样子写。

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 错过与接下来归各自的主人：Schedule（`schedule_missed_runs`）、Feed（`feed_missed_pulls`）、助理定时（跟进记录里的 `missed`），用户 11-11 定。汇总不存事实，只是宿主的读与转交。`run/presence.json`、`run/endpoint.json` 归 `apps/local-host`；`config/desktop.json` 归 `apps/desktop` |
| 2 | 插件同等待遇 | 按类型发现：声明了 `molis.runs.*` 这一对动作的任何插件都进面板与首页提示，宿主没有主人名单；内置三位主人也只走这条路 |
| 3 | 能力注册 | 每位主人的 `runs.overview@1`、`runs.decide@1` 在自己的声明里注册一次（Schedule、Feed 在 Manifest，助理定时在系统提供方 `io.molis.work.assistant.rules`）；汇总是宿主路由，不是动作（§10） |
| 4 | 合同 | 新增 `platform/actions` 的 `scheduled-runs` 一组并由 SDK 转出，`services/assistant` 的 `AssistantFollowUp` 加 `missed`；公开 API 与动作快照随本批刷新；阶段一不留兼容期；`CONTRACT-CHANGES.md` §8 记两条 |
| 5 | 放在哪个包 | 合同在 `packages/contracts`，主人各在自己的包，汇总、presence、地址文件在 `apps/local-host`，界面在 `apps/workbench`，原生部分在 `apps/desktop`；不新增包 |
| 6 | 表与存储 | 两张新表各归声明它的插件，各升一版带升级段；Home 里三个新文件登记进 `homeStores()` 与 `HOME-DATA.md`；别的包不读这几张表 |
| 7 | 兼容与迁移 | 不加兼容读取或迁移逻辑：两张表是正式升级链里的一段；地址文件与 `config/desktop.json` 只认第 1 版，不认得的当作没有 |
| 8 | 安全边界 | 碰 S-14：授权从静态 4173 改成启动后按核过身份的端口加，运行命令按窗口、来源和路径拒绝（RES-08，拒绝测试在 Rust 与 `security-invariants-desktop-ipc`）；地址文件不含令牌，读的人照旧核身份（S-07）；主人的错误只留错误码（S-12） |
| 9 | 调用次数 | 面板打开一次 = 一个请求 = 每位主人一次调用（并发，2 秒超时），开着 30 秒刷新、关着不刷；首页一次；「现在做／跳过」一个请求、在那一处按类型重新找一次主人 |
| 10 | 升级与数据 | 两张表的 1→2 走 U1 的升级链和金样回放；`run/` 快照时 reset；`config/desktop.json` 没有就按默认开 |
| 11 | 成果与过程项 | 不涉及：错过与运行状态不是成果，不进成果库、侧栏和搜索 |
| 12 | 页面与外壳 | 胶囊里的「运行」一节、首页上方的错过提示、设置 › 运行（目录只在桌面列）；照 11-04 定样，没有新页面整页；不加 DOM 事件；页面资源的增长见本批许可 |
| 13 | 错误 | 新错误码都经 `defineErrorCodes`，没有新的 Error 子类 |
| 14 | 冲突面 | 宿主启动（`web-server.ts`，枢纽）、桌面（F 轨文件）、Schedule 与 Feed 的库；本批只有主会话一个写手 |
| 15 | 全局最优 | 比较过：平台集中记错过与各主人记（用户定各主人记，插件不分内外都能接）；Runtime 配置里加地址与 Home 里放地址文件（选文件：端口每次启动可能不同，配置写进外部 Runtime 后改不了）；汇总做成动作与宿主路由（选路由：只给本机的人看，Agent 要的是各主人自己的动作） |

