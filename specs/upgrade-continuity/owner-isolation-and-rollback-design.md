# U3 按主人隔离与回到上一版：设计

状态：设计（2026-11-11，路线书第 25 批第 2、3 项，在本批分支 `batch/25` 上实现）。行为与验收以[升级后持续可用](spec.md) §4.2、§4.3、§7、§9 和 §10 决策记录为准，本文只写怎么做。「回到上一版」原是 U6 的一半，用户 2026-11-11 定提前到第 25 批（§10）；副本演练、接更新器仍是第 26 批的 U6。界面照 11-04 定样（[`docs/design/runtime-and-recovery`](../../docs/design/runtime-and-recovery/README.md)「某块暂不可用」「更新与回退」），不重新出样。

验收编号沿用 `UPG-04`、`UPG-05`、`UPG-06`、`UPG-13`、`UPG-19`；本文新增的检查用 `UPG3-`（隔离与显示）和 `UPGR-`（回到上一版）前缀，在 §8 列出。

## 0. 给人讲清楚

升级链（U1）已经做到：一个库升不上去，就放回升级前的样子，别的库照常升。可是用户看不出来是哪一块出了问题：只有 Home 插件库有一页说明，项目目录出问题时整站都报错，「升级没成功」和「数据来自更新的版本」也分不出来。

这一步把「哪一块暂不可用、为什么、怎么办」做成平台的一件事：升级过程把每个失败的库记成「某个主人暂不可用」，页面打开那一块时换成一张说明卡，Dock 上那一块带一个点，其余照常。说明卡上能直接「回到上一版」：平台保留上一版程序和升级前的备份，一个按钮或一条命令把两者放回去，默认先把现在的数据另存一份。升级超过两秒时开场显示一行进度；上次没做完的升级进来后在首页说明结果。

## 1. 现状里决定设计的几条

| 事实 | 依据 | 对设计的影响 |
| --- | --- | --- |
| 升级记录 `upgrade/ledger.json` 每个单元有 `owner`、`relative_path`、`state`（`failed`／`too_new`）和 `error`（码与固定原因） | `apps/local-host/src/home-upgrade-ledger.ts` | 「谁暂不可用」不用另记一份：从这份记录读。记录本身不改格式 |
| 单元的 `owner` 是包或插件 id（`apps/local-host`、`modules/shelf`、`horizontal/appearance`、`packages/storage`、插件 id） | `platform-upgrade-stores.ts` | 这不是用户认得的「一块」。要在描述符上加一个「这块在哪」的字段，见 §2.1 |
| 打开路径见到失败的库报 `storage.upgrade_failed`，较新的报 `storage.store_too_new`，都带 `details.path`（相对 Home） | `packages/storage/src/sqlite-baseline.ts`、`upgrade-inspection.ts` | 页面层能从错误认出是哪个单元，不用再开库 |
| 目录库打不开时 `web-catalog-access.ts` 的 `withCatalog` 每次都抛，所有页面 500 | 同文件 | 目录库是「项目」这一块的主人，要能就地说明，不能整站 500，见 §2.4 |
| Home 插件库已经有专门的说明页（`plugin-store-unavailable.ts`、`web-home-plugin-recovery.ts`） | 同文件 | 换成通用的说明卡，原来的专页删掉，不留两套 |
| 维护态监听只答 `/health` 和 503 | `upgrade-maintenance.ts` | 开场那一行由这个监听给一张页面（§4） |
| 发布目录按版本命名 `releases/molis-work-<version>`；同一版本重装时原目录先改名备份、成功后删掉；不同版本的旧目录留着不清 | `installer/home-release.ts`、`home.ts` | 开发期版本号都是 0.1.0，「上一版程序」不能靠版本号找，要在换上新程序时明确留一份（§5.1） |
| 桌面只在内置运行时的版本比 Home 里新时才装进 Home | `apps/desktop/adapters/tauri/src/web_service.rs` 的 `embedded_runtime_upgrade_available` | 回退之后新 `.app` 会马上把新版装回去、再升一次库。要一个「停在上一版」的标记（§5.3） |
| 升级快照保留到下一次成功升级，就是为 U6 留的 | `upgrade-chain-design.md` §5.4 | 回退放回的就是这份快照，不另拍 |

## 2. 主人暂不可用（UPG-04、UPG-05）

### 2.1 「一块」在哪：描述符上的 `block`

升级描述符（`HomeUpgradeDescriptor`）加一个必填字段 `block`，说这个单元坏了时用户在哪一块看到它：

| `block` | 含义 | 谁用 |
| --- | --- | --- |
| `{ kind: "projects" }` | 项目目录：项目列表、切换、新建 | 目录库 |
| `{ kind: "project" }` | 某个项目整体（由路径推出 `project_id`） | 项目库 |
| `{ kind: "plugin", plugin_id }` | 一个插件（在某个项目里，或 Home 级） | 插件的表、插件的 Home 库 |
| `{ kind: "setting", page }` | 设置里的一页（`appearance`、`models`、`mcp`、`browser`、`computer`、`assistant`） | 外观、模型偏好、MCP 工具偏好、侧栏浏览器站点、电脑操作、助理 |
| `{ kind: "shelf" }` | Shelf | Shelf 目录 |
| `{ kind: "home" }` | 整个 Home 都受影响（密钥文件、引导记录） | `feed/secrets.json`、`onboarding.json`、`project-arrival.json` |

它和 `owner` 同写在 `platform-upgrade-stores.ts` 的一行里，再加一种库只改这一行。`home` 是少数：密钥文件读不了，所有连接都用不了，只能整体说明（§2.4）。

### 2.2 认出是哪一块：只在被拒的那一刻读

不另建一张「谁不可用」的表。打开路径已经各自拒绝（U1），错误里带 `details.path`（相对 Home）；页面层在接到这个拒绝时才问一次 `describeUnavailable(home, error)`：

```ts
interface UnavailableOwner {
  readonly block: UpgradeBlock;          // §2.1，按 details.path 对描述符的 pattern 匹配（只比字符串，不读目录、不开库）
  readonly reason: "upgrade_failed" | "store_too_new" | "upgrade_no_space" | "snapshot_invalid";
  readonly diagnostic_id: string;        // §2.3
  readonly rollback: boolean;            // 有回退点（§5.2）
}
```

- `reason` 从错误码与升级记录里这个单元的 `error.reason` 来；记录读一次（一个小文件），只在失败时读。
- 平时没有任何额外开销：没有拒绝就没有这一步。打开路径不升级（§10 已定），所以一次启动里结论不变，也不用推送变化。
- 插件拿不到它：插件只会在自己的库被拒时收到 `storage.*` 错误，平台已经停掉这个插件的实例。

### 2.3 诊断号

`diagnostic_id` = `D-` 加 sha256(`run_id` + `\n` + `relative_path`) 的前 8 个十六进制字符（大写，如 `D-3F9A2C81`）：短到能念出来、写进反馈，碰撞对一个 Home 里几十个库无关紧要。记录里没有这个单元（比如手工放进来一个坏库）时 `run_id` 记 `none`。

- 同一轮、同一个库，每次显示都一样；换一轮就换号。
- 升级过程把单元记成 `failed`／`too_new` 时，宿主日志写一行 `home_upgrade_unit_failed`，带 `diagnostic_id`、主人、码与固定原因（不带路径），拿着号能在日志里找到它和同一轮里的 `cause`。号里没有路径和内容。
- 「发送诊断」（第 26 批诊断导出）以后用同一个号定位，本批说明卡上只给「复制诊断号」。

### 2.4 显示

**说明卡**（`mw-empty`，定样「某块暂不可用」）：标题是这一块的名字，正文按 `reason` 一句原因，下面是出路按钮和诊断号。

| `reason` | 原因 | 出路 |
| --- | --- | --- |
| `upgrade_failed` | 升级没有成功，已经退回到升级前的样子，这一块暂时不能用 | 「回到上一版」（有回退点时，§5）；「重新加载」；复制诊断号 |
| `store_too_new` | 这份数据来自更新版本的 Molis Work，这个版本不读也不改它 | 写「装上更新版本的 Molis Work 后就能打开」（更新器归第 26 批，不给按钮）；复制诊断号 |
| `upgrade_no_space` | 磁盘空间不够，这次没有升级 | 「重新加载」（腾出空间后下次启动再升）；复制诊断号 |
| `snapshot_invalid` | 升级前的备份对不上，没有放回，这一块保持现状 | 不给「回到上一版」（回退要用这份备份）；复制诊断号 |

文字写进工作台的语言文件（`workbench.owner-unavailable.*`），中英两份。

**出现在哪，接在已有的两层上：**

- **插件**：平台已经把表被拒的插件实例停掉，工作台主区给「插件暂不可用」的那一格（`unavailable-plugin-stage.ts`），Dock 上这一颗已经带琥珀点（`nav-warn-dot`，`navigation-presentation.ts`）。U3 只把这一格的内容换成说明卡：宿主组装这一格时（`project-plugin-stages.ts` 的 `unavailableStage`、`home-plugin-http.ts` 的 `homeUnavailableStage`）见到拒绝是升级一类，就带上 `upgrade` 字段；带了它就不给「重新启动」（重启升不了库）。点的 `aria-label` 改成「暂不可用」。定样里的「组件板新增 Dock 点」用的就是这颗现成的点，不新造部件。
- **其余各块**：页面请求已经在一处包着 `withHomePluginStorePageRecovery`（`web-request.ts` 的两次分派）。把它推广成 `withOwnerUnavailablePage`：接到 Home 插件库的拒绝照旧，另外接住任何库与文件的版本／升级拒绝（`isSqliteVersionRefusal` 与带版本文件的同类码），GET 页面给一张说明卡页（按 `block` 写标题，项目块保留项目名与「回到项目列表」），`/api/` 的 GET 回 `unavailable`，写操作照旧拒绝。原来的 `renderPluginStoreUnavailablePage` 改成这张页的一种情况，不留两套。
- **项目目录**：`resolveOrChooser` 在目录库被拒时现在给一张空的项目选择页（`load_error`）。升级一类的拒绝改给说明卡；别的读取失败照旧。设置里不读目录库的几页（外观、记忆、连接、外部访问）照常能开，只是没有项目可选；模型的服务商记在目录库里，模型页给同一张卡。这就是「其余照常」。

不加全局提示（11-04 定）。再加一块，只在描述符那一行写 `block`。

### 2.5 回退点与「回到上一版」按钮

说明卡和设置 › 更新共用一个回退点查询（§5.2）：有回退点才出按钮，按钮打开同一个确认对话框（§5.4）。

## 3. 上次没做完的升级（UPG-06、UPG-19）

升级过程启动时发现记录里有未完成的单元（`unfinishedUnit`）就接着做（U1 已实现）。U3 只加显示：

- 接着做完的这一轮，升级过程在 `upgrade/` 下写 `notice.json`（`{ schema_version: 1, run_id, unavailable }`，`format.home.upgrade.notice` 第 1 版，登记在 `tooling/versions.json`）。它和记录、戳记一样归升级过程，不进升级描述符；只对记录里那一轮有效，新一轮自动作废。放在文件里而不是内存里，是因为人常在重启之后才看到首页（实现时改，比内存标记加 `seen.json` 少一个文件）。
- 首页顶部一张卡（`mw-alert`）：全部成功是「上次没做完的升级已经接着做完」（success）；有暂不可用的是「……其中 n 块暂不可用」（warning），并说「打开那几块就能看到原因和出路」。
- 卡可以关：`POST /api/upgrade/notice/dismiss` 带 `run_id`，删掉这一轮的提示；别的轮的不动。

## 4. 开场那一行（UPG-19）

维护态监听（`upgrade-maintenance.ts`）多答两种请求：

- `GET /`（以及任何 `Accept: text/html` 的 GET）：一张静态的开场页，结构照产品的到达页（`arrival.css` 的标题栏、空主区、底栏中间 `mw-bar-status`）。页面自带一小段脚本，每 500 毫秒读一次 `/upgrade-progress`。`started_at` 起不到两秒不显示进度（只有空开场），超过两秒显示「正在升级 n / m」；收到 `done` 后整页刷新，宿主已经开始正常服务。
- `GET /upgrade-progress`：`{ done, total, started_at, state: "upgrading" | "done" }`，只有数字，没有库名和内容。守 S-01（回环）、S-02（Host 头），不带令牌：内容与 `/health` 的 `upgrade` 一样，只是不带挑战证明。

页面与样式随宿主包走（不新增页面资源：用现有的 `molis-work-arrival.css`）。桌面：`wait_for_upgrading_web` 见到 `upgrading` 时，把主窗口导航到 `http://127.0.0.1:<端口>/`（维护态那张页），不再停在 Rust 的启动画面；端口取第 25 批第 1 项的地址文件。

## 5. 回到上一版（UPG-13）

### 5.1 保留上一版程序

安装器换上新程序时（`installMolisWorkHome`，发布目录内容或版本变了），把**当前在用的那一版**留成回退点（`installer/home-rollback.ts` 的 `keepPreviousRelease`）：

```text
releases/previous/
  release/                 同一版本重建时：新程序占了旧目录的名字，旧目录（安装器的备份）rename 进来
  installation.json        换之前的 config/installation.json 原样
  rollback.json            { schema_version: 1, version, content_digest, release_path, home_fingerprint, kept_at }
```

- 不同版本：旧程序的目录名不同（`releases/molis-work-<版本>`），**留在原处不搬**——还在跑的旧宿主会按需加载里面的模块，搬走会让它中途坏掉；`rollback.json` 的 `release_path` 指向它。只有同名重建才搬进 `previous/release/`，`release_path` 写 `releases/previous/release`。读时 `lstat` 核是 Home 内的普通目录，路径不许绝对、不许 `..`（实现时改）。
- 留回退点是顺手的事：失败（比如盘满）不让安装失败，设置 › 更新就说没有可回的上一版。

- `home_fingerprint` 是换程序那一刻 Home 的升级戳记（`upgrade/state.json` 的 fingerprint，没有戳记就是 `null`）：它说明上一版程序是在哪一组库版本上跑的。
- 只留一个：已有 `releases/previous/` 时先删旧的再放新的（rename 到临时名、换好再删）。不同版本的更老目录照现状不清（C-3 第 7 条「保留当前 + 上一个」的清理留给更新器，第 26 批）。
- 同一版本、同一摘要的重装（`valid`）不动回退点。修复（`repairable`）也不动：修的是同一个程序。
- `rollback.json` 是新的带版本文件 `format.home.release.rollback` 第 1 版，登记进 `tooling/versions.json`；`releases/` 由安装器拥有，不进升级描述符（和 `installation.json` 一样由安装器读时处理，U1 设计 §2.6）。
- 卸载：`releases/` 本来就在清除范围里，`previous/` 随之删除。

### 5.2 回退点

`readRollbackPoint(home)` 只读，回答能不能回、回去会怎样：

```ts
type RollbackPoint =
  | { available: true; version: string; data: "unchanged" | "restore"; written_since: string | null }
  | { available: false; reason: "no_previous" | "snapshot_missing" | "snapshot_invalid" | "upgrade_unfinished" };
```

- 没有 `releases/previous/` → `no_previous`。
- 换程序之后没有开始过一轮升级（没有记录，或记录那一轮的 `started_at` 早于 `kept_at`）→ `data: "unchanged"`：库没升过，只换回程序。按时间而不按戳记相等判断，是因为一轮里有库失败时不写戳记，戳记相等说不出「没升过」（实现时改）。
- 否则要放回快照：最近一轮升级记录的 `from` 必须等于 `home_fingerprint`，并且这一轮每个 `committed` 的单元都在快照清单里、快照文件还在（插件表单元随它所在文件的快照）→ `data: "restore"`。对不上 → `snapshot_missing`（比如又升过一轮，快照已经被下一轮替换）。摘要在回退时、动手之前逐个核（`verifyUpgradeSnapshot`），对不上就整件不做、报 `snapshot_invalid`。
- 记录里有未完成的单元，或记录读不了 → `upgrade_unfinished`（先让它做完）。
- `written_since` 是那一轮开始的时间（记录的 `started_at`），对话框据此写「这之后写的内容会回到那时的样子」。

开库 0 次：只读记录、清单和目录。

### 5.3 回退做什么

`molis-work home rollback --confirm [--save-current <目录>] [--home <Home>] [--json]`，离线、持存储主人锁，按顺序：

1. `--save-current` 时先读一次回退点，不能回就停（免得白存一份整个 Home）；能回就先做一次离线快照（`home snapshot` 的同一个编排，到给定目录，它自己取锁、放锁）。失败就停，什么都不动。
2. 取锁（`acquireStorageOwner`，不升级）；有未完成的 `home restore` 就拒绝。再读一次回退点，`available: false` 就停（`installer.rollback.unavailable`，`details.reason` 是原因），什么都不动。
3. `data: "restore"`：先逐个核快照摘要，有一个对不上就整件不做；再删戳记，按清单把每个 `committed` 单元放回（U1 §5.2 的放回步骤）。中途失败：已经放回的不再退（它们都是完整的旧版），程序不换、回退点还在，再跑一次 `home rollback` 从头核、从头放，结果一样（实现时改：不另写 `rolling_back` 状态，放回本身可重复）。
4. 换程序：当前发布目录 rename 到 `releases/.rolled-back-<run>`；`releases/previous/release/` rename 回 `releases/molis-work-<旧版本>`；`config/installation.json` 换成 `previous/installation.json`；重写启动器（`bin/`）。和安装器的提升同一套原子换目录。完成后删 `.rolled-back-*` 与 `previous/`（回退之后不能再「回到上一版」的上一版）。
5. 戳记在第 3 步已删（下次启动全量扫一遍，旧程序见到的都是它的版本）；写 `config/rollback-hold.json`：`{ schema_version: 1, held_version, held_digest, rolled_back_from: { version, content_digest }, at }`（`format.home.release.rollback_hold` 第 1 版）。
6. 放锁。

**停在上一版**：桌面（`embedded_runtime_upgrade_available`）见到 `rollback-hold.json` 且内置运行时的版本或摘要等于 `rolled_back_from`，就不装进 Home，只在设置 › 更新写「已回到上一版 <版本>；需要时可以更新到最新版」。用户点「更新到最新版」（第 26 批接更新器；本批这一处按钮做的是「重新装上刚才那一版」：删掉 hold，下次启动照常装内置运行时）。内置运行时比 `rolled_back_from` 还新（真的出了新版）时照常装；任何一次真的换了程序的安装都删 hold（能走到安装，就是人或新版本要换了）。

### 5.4 从界面回退

确认对话框（`mw-dialog`，定样「更新与回退」）：标题「回到 <版本>」，正文按 `data` 写会发生什么；「先把现在的数据另存一份」默认勾上（`mw-check-row`，11-04 定），另存到 `~/Documents/Molis Work 回退前的数据/<时间>`（用户能在 Finder 里找到；不放进 Home，免得卸载时一起删）；按钮「回到上一版」（危险）和「取消」。

按下以后，页面调桌面原生命令 `rollback_to_previous { save_current: bool }`（Tauri 命令，只开给主窗口在本机地址上的主文档，和 S-14 同一条规则，拒绝测试同 S-14 的写法）：

1. 桌面显示开场页（「正在回到上一版」，`mw-bar-status`），停掉自己拉起的宿主（`stop_owned_web_service`）；宿主是 LaunchAgent 装的（桌面不是主人），先 `molis-work service stop`，回退后 `service start`。
2. 在后台线程跑**当前**发布目录里的 `molis-work home rollback --confirm [--save-current …] --json`（回退要读当前程序写的快照，所以用当前程序的 CLI）。
3. 成功：按启动器起上一版宿主，主窗口回到首页，顶部一张卡「已回到 <版本>」，另存了的写出位置。失败：照原来的程序重新起宿主，说明卡写原因与诊断号；程序没换就还是原来那一版。

页面不直接调宿主的动作来回退：宿主不能在自己持锁、正在服务时把自己换掉，回退的主人是桌面（11-04 定「桌面是本机服务的主人」）。命令行的 `home rollback` 给不开桌面时用，也是 UPG-13 的「一条命令」。

## 6. 文件与包

| 改动 | 位置 | 轨道 |
| --- | --- | --- |
| 描述符加 `block`；`describeUnavailable`；诊断号；日志加号 | `apps/local-host/src/platform-upgrade-stores.ts`、`home-upgrade-stores.ts`、`home-upgrade.ts`、新文件 `home-unavailable-owners.ts` | C1（宿主启动，按枢纽文件处理） |
| 说明卡、插件格的说明、页面恢复 | `apps/workbench/src/`（新 `owner-unavailable.ts`，`plugin-store-unavailable.ts` 并入）、`unavailable-plugin-stage.ts`、`apps/local-host/src/web-request.ts`、`web-home-plugin-recovery.ts`（改名 `web-owner-unavailable.ts`）、`project-plugin-stages.ts`、`home-plugin-http.ts` | D（界面）、宿主枢纽 |
| 开场页、`/upgrade-progress` | `apps/local-host/src/upgrade-maintenance.ts` | C1 |
| 结果卡、`notice.json` | `apps/local-host/src/home-upgrade-ledger.ts`、首页 | C1、D |
| 回退点、`home rollback`、保留上一版、hold；卸载认得回退点与 hold | `apps/local-host/src/installer/`（`home.ts`、新 `home-rollback.ts`、`uninstall-files.ts`）、`apps/local-host/src/cli-home.ts`；放回快照 `home-upgrade.ts` 的 `putBackUpgradeRound`、`packages/storage/src/upgrade-snapshot.ts` 的 `upgradeSnapshotListed` | F（安装器） |
| 桌面：`rollback_to_previous`、hold、开场导航 | 新 `apps/desktop/adapters/tauri/src/rollback.rs`、`web_service.rs`、`main.rs`、`runtime-capabilities/main-rollback.json`（第 25 批起授权按核过的端口在运行时加）、`permissions/rollback.toml` | F |
| 设置 › 更新（当前版本、回到上一版、停在上一版时「重新装上」；演练与「重启以更新」第 26 批） | `apps/workbench/src/settings-update.ts`（新）、`settings-sections.ts`；宿主 `web-catalog-settings.ts`、`web-catalog-routes.ts`（`POST /api/update/hold/lift`） | D |

不新增动作、Manifest 字段或公开合同：`block` 和不可用表都是宿主内部；`home rollback` 是 CLI 命令；桌面命令走 Tauri。三个新带版本文件（`upgrade/notice.json`、`rollback.json`、`rollback-hold.json`）登记进 `tooling/versions.json`，走 `verify-release-versions` 的核对。

## 7. 安全与边界

- 回退只读可信 Home 推出的路径：快照清单里的 `relative_path` 只用来和当前描述符对上，真实路径现算（S-upgrade-ledger-verified 的同一条）。`releases/previous/` 用 `lstat` 核是普通目录，不跟符号链接。
- `rollback_to_previous` 只开给主窗口在本机地址上的主文档；Capsule 等别的窗口调用就拒绝（新不变量 `S-desktop-rollback-main-only`，拒绝测试在 Rust 单元测试里）。
- `/upgrade-progress` 只有数字：并进维护态监听已有的不变量 `S-upgrade-maintenance-listener`（开场页与进度都在那个监听上，同一组 Host/Origin 拒绝），测试断言响应体的键只有那四个、开场页不带令牌和库名（实现时改，不另立一条）。
- 回退被拒、或中途失败，都不写任何业务数据；另存失败就整件不做。

## 8. 验收

| 编号 | 检查 | 测试 |
| --- | --- | --- |
| UPG3-01 | 一个平台库升级失败，只有它那一块给说明卡，别的插件、项目、设置页照常（UPG-04） | `tests/upgrade-owner-isolation.test.ts`（新） |
| UPG3-02 | 较新的库只拒这一个，说明卡写「来自更新的版本」，库的字节没变（UPG-05） | 同上 |
| UPG3-03 | 目录库升级失败时，项目页给整页说明卡，设置里的外观页照常打开，`/api/` 读回 `unavailable`，写被拒 | 同上 |
| UPG3-04 | Dock 上那一颗带「暂不可用」点并读得出来；说明卡的诊断号同一轮不变，日志里能用它找到原因 | 同上 + 浏览器用例 `tests/owner-unavailable.e2e.test.ts` |
| UPG3-05 | 维护态答开场页和 `/upgrade-progress`，后者只有四个键，非回环 Host 被拒（UPG-19） | `tests/upgrade-maintenance.test.ts` |
| UPG3-06 | 中断的升级接着做完后，首页出结果卡；关掉后同一轮不再出现（UPG-06） | `tests/upgrade-owner-isolation.test.ts` |
| UPGR-01 | 换上新程序时上一版留在 `releases/previous/`，只留一个；同版同摘要重装不动它 | `tests/home-rollback.test.ts`（新） |
| UPGR-02 | 回退点：库没升过是 `unchanged`；升过且快照齐全是 `restore`；快照被下一轮替换是 `snapshot_missing`；有未完成升级是 `upgrade_unfinished` | 同上 |
| UPGR-03 | `home rollback --confirm` 放回快照、换回程序、删戳记、写 hold；之后旧程序能打开全部数据（UPG-13） | 同上 |
| UPGR-04 | `--save-current` 失败时什么都不动；放回中途失败时程序不换，再跑一次接着做 | 同上 |
| UPGR-05 | 有 hold 时桌面不把同一版新运行时装回去；内置的更新时照常装并删 hold | `apps/desktop` Rust 单元测试 |
| UPGR-06 | `rollback_to_previous` 只接受主窗口本机主文档，别的来源被拒 | `apps/desktop` Rust 单元测试（`S-desktop-rollback-main-only`） |
| UPGR-08 | 说明卡的「回到上一版」只在升级失败且有回退点时出现，指向设置 › 更新；设置 › 更新在桌面给按钮与确认框（另存默认勾上）、在浏览器给命令，回不去时说原因，停在上一版时给「重新装上」 | `tests/home-rollback.test.ts` |
| UPGR-09 | 卸载把回退点和 hold 当作安装器自己的文件一起删，读不了的就停下不删 | 同上 |
| UPGR-07 | [人工] 在隔离 Home 里装两个构建（后一个改了库结构），从说明卡和设置 › 更新各回退一次，勾与不勾另存各一次 | 实操记录 |
