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

### 2.2 读：`HomeUnavailableOwners`

宿主在升级过程之后（维护态跑完，或 `acquireUpgradedHomeOwner` 返回之后）读一次升级记录，得到一张表，放在内存里，进程内只有这一份：

```ts
interface UnavailableOwner {
  readonly block: UpgradeBlock;          // §2.1
  readonly project_id: string | null;    // block 为 project／plugin 时由路径推出；Home 级为 null
  readonly reason: "upgrade_failed" | "store_too_new" | "upgrade_no_space" | "snapshot_invalid";
  readonly diagnostic_id: string;        // §2.3
  readonly units: readonly string[];     // relative_path，只用于日志与诊断，不显示
}
```

- 来源只有升级记录里 `failed`、`too_new` 的单元，以及记录里 `upgrade_no_space`（这一轮没动的 Home）。不读库、不扫目录：升级过程已经扫过，开库 0 次。
- 同一块有几个单元失败，合成一行，`reason` 取最重的（`snapshot_invalid` > `upgrade_failed` > `store_too_new` > `upgrade_no_space`）。
- 换版本或回退之后升级过程重跑，表随之更新；进程运行期间不变（打开路径不升级，§10 已定），所以不用推送变化。
- 打开路径照旧各自拒绝（U1 不变）。这张表只回答「哪一块该显示说明」，不替代拒绝。

表经宿主内部端口给页面层和 Dock 用，不是动作，也不进合同：它只描述这个宿主进程自己的状态。插件拿不到这张表（插件只会在自己的库被拒时收到 `storage.*` 错误，平台已经停掉这个插件的实例）。

### 2.3 诊断号

`diagnostic_id` = `run_id` 与这一块所有 `relative_path` 排序后拼接的 sha256 的前 10 个十六进制字符，分两段显示（`3f9a2-c81d0`）。

- 同一轮、同一块，每次显示都一样；换一轮就换号。
- 宿主日志在单元失败时已经写 `home_upgrade_failed`（`home-upgrade.ts`），这一行加上 `diagnostic_id`，所以拿着号能在日志里找到原因和错误的 `cause`。号里没有路径和内容。
- 「发送诊断」（第 26 批诊断导出）以后用同一个号定位，本批说明卡上只给「复制诊断号」。

### 2.4 显示

**说明卡**（`mw-empty`，定样「某块暂不可用」）：标题是这一块的名字，正文按 `reason` 一句原因，下面是出路按钮和诊断号。

| `reason` | 原因（中文） | 出路 |
| --- | --- | --- |
| `upgrade_failed` | 「升级没有成功，已经退回到升级前的样子，这一块暂时不能用。」 | 「回到上一版」（有回退点时，§5）；「重新加载」；复制诊断号 |
| `store_too_new` | 「这份数据来自更新版本的 Molis Work，这个版本不读也不改它。」 | 「更新到最新版」说明（更新器归第 26 批：本批写「装上更新版本的 Molis Work 后就能打开」，不给按钮）；复制诊断号 |
| `upgrade_no_space` | 「磁盘空间不够，这次没有升级。」 | 「重新加载」（腾出空间后下次启动再升）；复制诊断号 |
| `snapshot_invalid` | 「升级前的备份对不上，没有放回，这一块保持现状。」 | 「回到上一版」不出现（回退要用这份备份）；复制诊断号 |

文字照 `t("workbench.owner-unavailable.<reason>")` 写进工作台的语言文件；第 16 批已经合入，按现行写法用 `t`。

**出现在哪：**

- `plugin`：工作台主区本来渲染插件内容的地方。插件实例没有起（平台已停），主区直接给说明卡；Dock 上这一颗带「暂不可用」点（组件板新增 `mw-dock-pin--unavailable`，琥珀色，`aria-label` 加「暂不可用」）。Home 级插件在每个项目里都这样。原来的 `renderPluginStoreUnavailablePage`、`withHomePluginStorePageRecovery` 只为 Home 插件库开了一张整页，改成同一张卡，删掉旧的专页与 `isHomePluginStoreRefusal` 的页面分支（拒绝本身留着，那是打开路径）。
- `project`：进这个项目时主区给说明卡，底栏、项目切换照常，可以切到别的项目。
- `projects`：目录库是项目列表的主人。页面请求不再 500：`withCatalog` 见到目录库被拒（`isSqliteVersionRefusal`），GET 页面给一张整页说明卡（只有这一种是整页，因为没有项目可以进），`/api/` 的 GET 回 `unavailable`，写操作照旧拒绝。设置页里与项目无关的几页（模型、外观、MCP）照常能开，这正是「其余照常」。
- `setting`：设置里那一页的内容区给说明卡，左侧导航照常；那一页在导航里带同样的点。
- `shelf`：Shelf 面板里给说明卡。
- `home`：首页顶部一张 `mw-alert`（危险），说明哪些功能受影响；其余能用的照常。

不加全局提示（11-04 定）。

**HTTP 一处收口。** 现在各页各自 catch 拒绝。改成页面路由表上一处：路由声明它属于哪一块（插件路由已经知道 `plugin_id`，项目路由知道 `project_id`，设置页知道 `page`），渲染前查 §2.2 的表，命中就给说明卡，不进业务代码。这样「再加一块」只在描述符那一行写 `block`。拒绝仍由打开路径抛：表没命中却被拒（升级记录之外的情况，比如手工放进来一个坏库），落到同一张卡的 `upgrade_failed`，诊断号用 `relative_path` 单独算（`run_id` 记为 `none`）。

### 2.5 回退点与「回到上一版」按钮

说明卡和设置 › 更新共用一个回退点查询（§5.2）：有回退点才出按钮，按钮打开同一个确认对话框（§5.4）。

## 3. 上次没做完的升级（UPG-06、UPG-19）

升级过程启动时发现记录里有未完成的单元（`unfinishedUnit`）就接着做（U1 已实现）。U3 只加显示：

- 接着做的这一轮，宿主在内存里记 `resumed: true`；做完后首页顶部一张卡（`mw-alert`）：全部成功是「上次没做完的升级已经接着做完」（success）；有失败的是「上次没做完的升级已经接着做完，其中 n 块暂不可用」（warning），点开就是那几块的说明卡。
- 卡可以关；关掉的记在 `upgrade/` 下的 `seen.json`（`{ schema_version: 1, run_id }`，`format.home.upgrade.seen` 第 1 版，登记进 `tooling/versions.json` 与升级描述符），同一轮不再出现。新一轮自动作废。

## 4. 开场那一行（UPG-19）

维护态监听（`upgrade-maintenance.ts`）多答两种请求：

- `GET /`（以及任何 `Accept: text/html` 的 GET）：一张静态的开场页，结构照产品的到达页（`arrival.css` 的标题栏、空主区、底栏中间 `mw-bar-status`）。页面自带一小段脚本，每 500 毫秒读一次 `/upgrade-progress`。`started_at` 起不到两秒不显示进度（只有空开场），超过两秒显示「正在升级 n / m」；收到 `done` 后整页刷新，宿主已经开始正常服务。
- `GET /upgrade-progress`：`{ done, total, started_at, state: "upgrading" | "done" }`，只有数字，没有库名和内容。守 S-01（回环）、S-02（Host 头），不带令牌：内容与 `/health` 的 `upgrade` 一样，只是不带挑战证明。

页面与样式随宿主包走（不新增页面资源：用现有的 `molis-work-arrival.css`）。桌面：`wait_for_upgrading_web` 见到 `upgrading` 时，把主窗口导航到 `http://127.0.0.1:<端口>/`（维护态那张页），不再停在 Rust 的启动画面；端口取第 25 批第 1 项的地址文件。

## 5. 回到上一版（UPG-13）

### 5.1 保留上一版程序

安装器换上新程序时（`installMolisWorkHome`，发布目录内容或版本变了），把**当前在用的那一版**留成回退点：

```text
releases/previous/
  release/                 原来的发布目录整份（rename，不拷贝）
  installation.json        换之前的 config/installation.json 原样
  rollback.json            { schema_version: 1, version, content_digest, home_fingerprint, kept_at }
```

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
- 当前戳记的 fingerprint 等于 `rollback.json` 的 `home_fingerprint` → `data: "unchanged"`：换程序之后库没升过，只换回程序。
- 否则要放回快照：最近一轮升级记录的 `from` 必须等于 `home_fingerprint`，并且这一轮每个 `committed` 的单元都有快照（`upgrade/<run-id>/manifest.json` 里有它、sha256 对得上）→ `data: "restore"`。对不上 → `snapshot_missing`（比如又升过一轮，快照已经被下一轮替换）或 `snapshot_invalid`。
- 记录里有未完成的单元 → `upgrade_unfinished`（先让它做完）。
- `written_since` 是升级完成的时间（戳记的 `completed_at`），对话框据此写「这之后写的内容会回到那时的样子」。

开库 0 次：只读文件和清单摘要。

### 5.3 回退做什么

`molis-work home rollback --confirm [--save-current <目录>] [--home <Home>] [--json]`，离线、持存储主人锁，按顺序：

1. 取锁（`acquireStorageOwner`，不升级）；有未完成的 `home restore` 或升级就拒绝。再读一次回退点，`available: false` 就停，什么都不动。
2. `--save-current` 时先做一次离线快照（`home snapshot` 的同一个编排，到给定目录）。失败就停，什么都不动。
3. `data: "restore"`：按快照清单把每个 `committed` 单元放回（U1 §5.2 的放回步骤：核摘要、删 `-wal`／`-shm`／`-journal`、临时文件、fsync、rename、再核摘要）。中途失败：已经放回的不再退（它们都是完整的旧版），记录写 `rolling_back`，下次 `home rollback` 接着做；程序不换，回退不算完成。
4. 换程序：当前发布目录 rename 到 `releases/.rolled-back-<run>`；`releases/previous/release/` rename 回 `releases/molis-work-<旧版本>`；`config/installation.json` 换成 `previous/installation.json`；重写启动器（`bin/`）。和安装器的提升同一套原子换目录。完成后删 `.rolled-back-*` 与 `previous/`（回退之后不能再「回到上一版」的上一版）。
5. 删升级戳记（下次启动全量扫一遍，旧程序见到的都是它的版本）；写 `config/rollback-hold.json`：`{ schema_version: 1, held_version, held_digest, rolled_back_from: { version, content_digest }, at }`（`format.home.release.rollback_hold` 第 1 版）。
6. 放锁。

**停在上一版**：桌面（`embedded_runtime_upgrade_available`）见到 `rollback-hold.json` 且内置运行时的版本或摘要等于 `rolled_back_from`，就不装进 Home，只在设置 › 更新写「已回到上一版 <版本>；需要时可以更新到最新版」。用户点「更新到最新版」（第 26 批接更新器；本批这一处按钮做的是「重新装上刚才那一版」：删掉 hold，下次启动照常装内置运行时）。内置运行时比 `rolled_back_from` 还新（真的出了新版）时照常装，并删 hold。

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
| 描述符加 `block`；`HomeUnavailableOwners`；诊断号；日志加号 | `apps/local-host/src/platform-upgrade-stores.ts`、`home-upgrade-stores.ts`、`home-upgrade.ts`、新文件 `home-unavailable-owners.ts` | C1（宿主启动，按枢纽文件处理） |
| 说明卡、Dock 的点、设置页导航的点、整页（目录库） | `apps/workbench/src/`（新 `owner-unavailable.ts`，删 `plugin-store-unavailable.ts`）、`apps/local-host/src/web-request.ts`、`web-route-table.ts`、`web-catalog-access.ts`、删 `web-home-plugin-recovery.ts` | D（界面）、宿主枢纽 |
| 组件板新增 `mw-dock-pin--unavailable` | `packages/design-system/`、`/__ui/catalog` 标本 | D 轨合审 |
| 开场页、`/upgrade-progress` | `apps/local-host/src/upgrade-maintenance.ts` | C1 |
| 结果卡、`seen.json` | `apps/local-host/src/home-upgrade-ledger.ts`、首页 | C1、D |
| 回退点、`home rollback`、保留上一版、hold | `apps/local-host/src/installer/`（`home.ts`、`home-release.ts`、新 `home-rollback.ts`）、`apps/cli` | F（安装器） |
| 桌面：`rollback_to_previous`、hold、开场导航 | `apps/desktop/adapters/tauri/src/web_service.rs`、`main.rs`、`capabilities/*.json` | F |
| 设置 › 更新（当前版本、回到上一版；演练与「重启以更新」第 26 批） | `apps/workbench/src/settings-update.ts`（新） | D |

不新增动作、Manifest 字段或公开合同：`block` 和不可用表都是宿主内部；`home rollback` 是 CLI 命令；桌面命令走 Tauri。三个新带版本文件（`seen.json`、`rollback.json`、`rollback-hold.json`）登记进 `tooling/versions.json`，走 `verify-release-versions` 的核对。

## 7. 安全与边界

- 回退只读可信 Home 推出的路径：快照清单里的 `relative_path` 只用来和当前描述符对上，真实路径现算（S-upgrade-ledger-verified 的同一条）。`releases/previous/` 用 `lstat` 核是普通目录，不跟符号链接。
- `rollback_to_previous` 只开给主窗口在本机地址上的主文档；Capsule 等别的窗口调用就拒绝（新不变量 `S-desktop-rollback-main-only`，拒绝测试在 Rust 单元测试里）。
- `/upgrade-progress` 只有数字（新不变量 `S-upgrade-progress-numbers-only`：响应体的键只有那四个，测试断言拒绝多出来的字段和非回环 Host）。
- 回退被拒、或中途失败，都不写任何业务数据；另存失败就整件不做。

## 8. 验收

| 编号 | 检查 | 测试 |
| --- | --- | --- |
| UPG3-01 | 一个平台库升级失败，只有它那一块给说明卡，别的插件、项目、设置页照常（UPG-04） | `tests/upgrade-owner-isolation.test.ts`（新） |
| UPG3-02 | 较新的库只拒这一个，说明卡写「来自更新的版本」，库的字节没变（UPG-05） | 同上 |
| UPG3-03 | 目录库升级失败时，项目页给整页说明卡，设置里的模型、外观页照常打开，`/api/` 读回 `unavailable`，写被拒 | 同上 |
| UPG3-04 | Dock 上那一颗带「暂不可用」点并读得出来；说明卡的诊断号同一轮不变，日志里能用它找到原因 | 同上 + 浏览器用例 `tests/browser/owner-unavailable.e2e.test.ts` |
| UPG3-05 | 维护态答开场页和 `/upgrade-progress`，后者只有四个键，非回环 Host 被拒（UPG-19） | `tests/upgrade-maintenance.test.ts` |
| UPG3-06 | 中断的升级接着做完后，首页出结果卡；关掉后同一轮不再出现（UPG-06） | `tests/upgrade-owner-isolation.test.ts` |
| UPGR-01 | 换上新程序时上一版留在 `releases/previous/`，只留一个；同版同摘要重装不动它 | `tests/home-rollback.test.ts`（新） |
| UPGR-02 | 回退点：库没升过是 `unchanged`；升过且快照齐全是 `restore`；快照被下一轮替换是 `snapshot_missing`；有未完成升级是 `upgrade_unfinished` | 同上 |
| UPGR-03 | `home rollback --confirm` 放回快照、换回程序、删戳记、写 hold；之后旧程序能打开全部数据（UPG-13） | 同上 |
| UPGR-04 | `--save-current` 失败时什么都不动；放回中途失败时程序不换，再跑一次接着做 | 同上 |
| UPGR-05 | 有 hold 时桌面不把同一版新运行时装回去；内置的更新时照常装并删 hold | `apps/desktop` Rust 单元测试 |
| UPGR-06 | `rollback_to_previous` 只接受主窗口本机主文档，别的来源被拒 | `apps/desktop` Rust 单元测试（`S-desktop-rollback-main-only`） |
| UPGR-07 | [人工] 在隔离 Home 里装两个构建（后一个改了库结构），从说明卡和设置 › 更新各回退一次，勾与不勾另存各一次 | 实操记录 |
