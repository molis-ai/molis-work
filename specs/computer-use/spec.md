# 个人助理的完整 Computer Use

状态：进行中（2026-10-11）。最小真机切片已在用户的 Mac 上证明（§5）。桌面步骤措辞、跨项目确认、没选项目的操作记录和确认卡，以及四条威胁的代表性拒绝，已由发出去的函数测通（§4、§7）：终端与系统设置的输入记成 refused，被挡住的落点和显示着 Molis Work 的窗口在注入前拒绝，与请求矩形相交的密码框不让截图离开助手。真实模型 MiniMax-M3 在隔离 Home 上走过 TextEdit 和计算器，操作记录有 29 步；锁屏、用户在场、驱动不可用三种拒绝都在真机上出现过。那次走查里模型没有调用终端打字、系统设置、被挡住的落点和自批，所以这些拒绝还没有真机记录。全量回归已对干净基线 `72137e89a` 跑完，没有新的产品失败（§7、§8）。对 `db9cbddca` 的又一次全量已经跑完：基线失败文件 1 个，Computer Use 多出 5 个。重新构建后 `tests/install.test.ts`、`tests/npm-package.test.ts`、`tests/runtime-payload.test.ts`、`tests/uninstall.test.ts` 共 30 项通过（先前是 `source.build_stale`）。`tests/goals-document.e2e.test.ts` 单独重跑 4 项通过（全量里是页面脚本执行超时）。带截图的 Shelf 放入还没有真机记录。这次准备再走真机时屏幕是锁着的，没有启动走查，也没有改先前的记录。接到当前 origin/main `a28d7584b` 之后的全量：基线 5560 项、失败 5、失败文件 2 个；Computer Use 5571 项、失败 5、失败文件还是 `tests/immersive-directory.e2e.test.ts` 和 `tests/touch-targets.e2e.test.ts`，没有新的失败文件。二十步整格和带截图的 Shelf 仍未勾。再接到 origin/main `4fb2db83f` 之后的全量：基线 5569 项、失败 7、失败文件 4 个（`tests/agent-action-selection.e2e.test.ts`、`tests/functions-authoring-actions.test.ts`、`tests/immersive-directory.e2e.test.ts`、`tests/touch-targets.e2e.test.ts`）；Computer Use 5580 项、失败 5、失败文件是 `tests/immersive-directory.e2e.test.ts` 和 `tests/touch-targets.e2e.test.ts`，没有新的失败文件。合入之后屏幕会话仍打印 `locked`，没有启动走查，没有发 Ctrl+Cmd+Q。再接到 origin/main `02ceba8c9` 之后的全量：基线 5606 项、失败 5、失败文件 3 个（`tests/alchemist-mcp.test.ts`、`tests/immersive-directory.e2e.test.ts`、`tests/touch-targets.e2e.test.ts`）；Computer Use 5618 项、失败 7、失败文件 4 个。两边共同的失败文件是 immersive-directory 和 touch-targets。基线独有 Alchemist MCP 超时，Computer Use 全量里这条通过，不把它写成产品修复。Computer Use 全量多出 `tests/goals-document.e2e.test.ts`（选中后 `goalView === 'RELEASE'` 超时）和 `tests/model-first-setup.e2e.test.ts`（清理 Chrome profile 时 `ENOTEMPTY`）。这两个文件在基线树和 Computer Use 树上各单独重跑，都是 8 项通过、0 失败，所以不是这条线的产品回归。挂上的桌面驱动会记下这一轮的项目，并在无参 `release()` 时结束记录、放开电脑。二十步整格和带截图的 Shelf 仍未勾。2026-10-12 复查时屏幕没有锁（`cu-session` 打印 `unlocked`），人在控制台。同一时刻另一会话的全量还在跑，走查脚本因此停在启动前，没有新的 transcript，没有发 Ctrl+Cmd+Q。2026-10-12 18:05Z 前台是 ChatGPT，鼠标和滚轮刚动过，`browser.lock` 空着，走查没有启动。二十步整格和带截图的 Shelf 仍未勾。目标原文见 [goal-prompt.md](goal-prompt.md)。

## 1. 要解决的事

个人助理现在只能在侧栏的浏览器里动手（`specs/archive/side-panel` D02）。本任务让它能操作 macOS 上的其他应用、完成跨应用的多步任务，并在侧栏里把过程和结果交给用户：实时画面、确认、停止与接手、操作记录。

## 2. 决策记录

| # | 决定 | 来源与理由 |
| --- | --- | --- |
| D01 | 原生助手进程归 Molis，Prologue 只扩合同与策略，继续不带任何驱动 | 用户 2026-10-07 |
| D02 | 桌面上看到用户自己的浏览器时，当普通应用，按应用批准，不能记住 | 用户 2026-10-07。桌面驱动认的是应用身份，认不出网站；网页的事仍用侧栏浏览器 |
| D03 | 侧栏新增「电脑」标签，每轮操作记录进「文件」 | 用户 2026-10-07 |
| D04 | 分级边界：禁区 / 只看只点 / 其余经批准，附通用禁令 | 用户 2026-10-07 |
| D05 | 只做 macOS，界面不暗示 Windows 与 Linux | 用户 2026-10-07；现有发布只有 macOS 双架构 |
| D06 | 批准粒度：确认卡上加「本轮内允许在这个应用里操作」。到本轮结束收回，不持久、不记住；禁区与只看只点不适用；交出或取出文件、发送 / 付款 / 删除 / 提交这类不可撤回动作、切到没批准过的应用仍逐步问 | 用户 2026-10-09 弹窗（推荐项）。实现见 D19 |
| D07 | 截图记录的保留期 30 天：到期删掉记录里的截图，文字步骤与回执保留；用户随时可删整份记录；用户选择保留成成果的那份按成果库规则走，不自动删 | 用户 2026-10-09 弹窗 |
| D08 | 发布签名与公证（BL-021）继续待定。开发期用本机已有的稳定证书「Tauri Local Development」签助手；发布构建若没有稳定身份，界面如实说明「更新后可能要重新授权」 | 用户 2026-10-09 弹窗（推荐项） |
| D09 | 助手的形态：独立的 `.app`（`LSUIElement`，不进程序坞），由 local-host 经 LaunchServices（`open -n -g`）拉起；它自己是负责进程，系统设置里显示为「Molis Work Computer Helper」；与 local-host 用 Unix 套接字传 JSON 行，套接字一断即退出 | §5 的真机证明：从终端、launchd 任务（网页模式的 LaunchAgent）、GUI 应用的子进程（桌面应用）拉起，负责进程都是助手自己 |
| D10 | 助手放在 `apps/local-host/native/computer/`（Swift，`swiftc` 直接编，不引 SwiftPM），随 local-host 构建、随它的包发出，local-host 按包的位置找到它；`MOLIS_WORK_COMPUTER_HELPER` 可指向别处 | 照 `native/materials` 的先例：local-host 自己用的原生助手住在它的 `native/` 里，桌面应用与网页模式都不用另传路径。起初放在 `apps/desktop/adapters/`，但那里是 Tauri 外壳的适配，local-host 又不能依赖桌面应用 |
| D11 | 助手要求 macOS 14 及以上（ScreenCaptureKit 的截图接口）；Molis 支持 13，在 13 上「电脑」显示不可用并说明原因 | `SCScreenshotManager` 自 14 起；`CGWindowListCreateImage` 在新系统已不可用 |
| D12 | 输入：前台合成输入（带助手自己的标记）；文字优先经辅助功能插入（不经键盘与输入法、不碰剪贴板），插不进去才按键入，按键入时临时切到 ASCII 键盘布局、结束即复原；每个事件都显式写修饰键 | 真机：搜狗拼音下按键入的文字会被吞掉；事件源会记住上一次的 Cmd，下一个字会变成快捷键（§5） |
| D13 | 菜单作为有类型的动作（按菜单路径、经辅助功能按下），不靠点菜单栏坐标 | 菜单栏不属于目标应用的窗口，落点校验必然拒绝；按路径选比按坐标更可核对、更好给人看 |
| D14 | 落点校验在助手里、紧挨着注入之前做：该点最上层的窗口和该点的辅助功能元素都属于目标应用；拖动两端都要在目标应用里；需要前台的动作先把目标应用提到前台再核 | 真机：普通窗口在提到前台后不再盖住；始终在上层的窗口（浮动面板、通知条、锁屏）照样拒绝（§5） |
| D15 | 截图：只拍目标应用的窗口（ScreenCaptureKit 只含该应用），裁到它前窗的范围，按 1 倍点数出图。密码类输入框只要和请求矩形相交，png 就不得离开助手（拒绝，不涂黑后放行）；驱动把助手的 `capture.password` 记成 refused。Prologue 的脱敏器只放行驱动自己产出的截图（同侧栏浏览器 D10）。辅助功能树看不到密码框时，像素仍可能离开，这是已知限度 | 真机：被访达盖住一半的 TextEdit 截图里没有访达的像素（§5）。相交即拒绝由 `tests/computer-use-gaps.test.ts` 覆盖，还没有对着真密码框跑过助手 |
| D16 | 模型看辅助功能树的文字（带可点击坐标），截图给人看、进记录，不进模型 | 与侧栏浏览器相同；Prologue 现在不能把一轮中途的截图交给模型（§3 第 1 行），本目标不扩这一项，能力对照表如实写 |
| D17 | 只看只点名单含终端、IDE，以及能执行脚本的应用（脚本编辑器、Automator、快捷指令） | 它们能跑命令，命令走 Coding |
| D18 | 禁区识别 Molis 自己：Molis Work 桌面应用（`com.molis.work`）、助手本身，以及窗口标题带 Molis 标记的浏览器窗口（网页模式下 Molis 页面的标题带标记）；另加时间闸：助手注入输入后 1.5 秒内收到的、属于桌面操作的确认答复一律不算 | goal 第 3 条「识别办法由实现定」；标记谁都能加，加了只会让那个窗口不可碰，方向是关着的 |
| D19 | 「本轮内允许」用 Prologue 的带寿命批准实现：只认这一轮的副作用、不落盘、轮次结束即收回，只覆盖可撤回的本机动作（`mutate-local` / `user-visible`）与列出的动作种类；驱动判定为不可撤回的动作归 `mutate-external`，不在其内 | goal 第 2 条「Prologue 只扩合同与策略」；批准寿命原在 Prologue 的「以后」里 |

## 3. 开工前的复查（对照 Prologue `b14c6686`、Molis Work `6e62652d`，2026-10-07）

| # | 发现 | 证据 |
| --- | --- | --- |
| 1 | 模型看不到屏幕：截图观察只回资源引用；图片只在一轮开头随材料进入模型 | Prologue `composition/core/system-tools-surface.ts`、`agent/core/loop-model-call.ts`、`model/plugin/anthropic-compatible.ts` |
| 2 | 一步两次来回：`surface-act` 的回执只有状态与动作次数，动作又必须绑定一次新观察 | 同上 |
| 3 | 观察时效 10 秒、单次观察 4 MiB、一轮 24 步 | Prologue `ui-control/core/control.ts` 的 `DEFAULT_UI_LIMITS`；`apps/local-host/src/assistant/assistant-service.ts` 的 `ROUND_TURNS` |
| 4 | 一个会话只能挂一台界面；驱动合同的 `kind` 只有 browser | `horizontal/agent-host/src/adapters/prologue-surfaces.ts`、`packages/contracts/src/services/ui-surfaces.ts` |
| 5 | 本地构建是 ad-hoc 签名，macOS 通常把每次重新构建当成新应用，授权会失效 | `apps/desktop/tooling/build-macos-release.sh`、BL-021 |
| 6 | 主 CI 跑在 ubuntu，发布在 macOS 双架构 | `.github/workflows/ci.yml`、`release-macos.yml` |

## 4. 威胁与挡法

| 威胁 | 挡法 | 守住它的测试 |
| --- | --- | --- |
| 自批：助理点自己的确认卡 | Molis 窗口、助手、显示 Molis 的浏览器窗口属禁区（观察与动作都拒）；窗口标题或 owner 含「Molis Work」时，助手在比 pid 之前就拒绝落点；注入后 1.5 秒内的桌面确认答复不算 | `tests/computer-use-gaps.test.ts`：Molis 自己的 bundle、标题带「Molis Work」的窗口被拒绝；驱动注入前拒绝；持有电脑的那一轮在注入后 1.5 秒内确认返回 409。2026-10-11 又通过 |
| 越界落点：点到盖在上面的窗口或通知条 | 助手在注入前原子地核落点（D14）；Prologue 在执行前核观察新鲜、窗口身份与应用 scope | 真机 §5；同一测试里落点 pid 不是目标应用时驱动拒绝，文案含「落点不在目标应用」。2026-10-11 的真机补测没有把遮挡窗盖住落点，所以还没有新的真机拒绝记录 |
| 屏幕内容外带：截图带出别的应用、密码 | 只拍目标应用（D15）；密码框与请求矩形相交就拒绝外带，png 不离开助手；脱敏器只认驱动自己产出的截图；记录只在本机、30 天删截图、不进搜索与记忆 | 真机 §5；同一测试里截图带别的 pid、密码框多于已处理数、或助手抛 `capture.password` 时，驱动拒绝并记下 refused |
| 提示注入：窗口里的文字冒充指令 | 观察正文框在不可信内容里交给模型；提示词写明；禁区与分级在驱动和 Prologue 规则两处挡，不靠模型自觉。终端、IDE、远程桌面的文字、按键和菜单在激活应用之前拒绝（`input.look_only`），驱动记成 refused。观察和动作后的截图若撞上禁区，也先记 refused | 同一测试：窗口正文要求输入时，终端的文字和菜单仍只能看和点并记下 refused，系统设置仍是禁区并记下 refused；正文不参与判定。助手抛 `input.look_only` 时同样拒绝。对着显示 Molis Work 的窗口观察，以及动作后补截图，各记一条 refused。点击或切应用之后如果补截图被拒绝，这一步不再另记成功的 act |

## 5. 最小真机切片（2026-10-09，MacBook Pro M5，macOS 26.3.1，内建 Retina 屏一块，输入法搜狗拼音）

助手 `apps/local-host/native/computer/`，开发签名「Tauri Local Development」（指定要求 = bundle id + 证书叶子），用 `/tmp` 下的测试替身 local-host 驱动。

| 要证明的 | 结果 |
| --- | --- |
| 只截目标应用的窗口 | 通过。TextEdit 窗口右下被访达盖住时截 TextEdit：700×480，约 250 ms，图里没有访达的任何像素（被盖住的区域是 TextEdit 自己的内容） |
| 读到辅助功能树 | 通过。TextEdit 10 个节点 31 ms；Electron 类（Claude 桌面）打开 `AXManualAccessibility` 后 600 个节点（上限）259 ms；Chrome 291 个节点 |
| 注入输入并校验落点 | 通过。落点被另一进程的置顶窗口盖住：点击与拖动都拒（`landing.covered`），置顶窗口消失后同一点击成功；中文经辅助功能插入成功；按键入在搜狗拼音下先失败、切换 ASCII 布局与显式修饰键（D12）后成功；Cmd 组合键、Shift+1 成功；输入法事后复原 |
| 监听用户输入与锁屏 | 通过。助手自己的事件 0 条被当成人的；另一进程的事件被识别；用户亲手锁屏（Ctrl+Cmd+Q）与解锁都报出；锁屏期间的动作落在 `loginwindow` 上被拒；用户亲手晃鼠标，正在执行的动作当场停下（`person.present`） |
| 权限归属可控 | 通过。从已授权的终端拉起时助手自己是负责进程、三项权限均为未授权（证明不借终端的授权）；用户在系统设置里给「Molis Work Computer Helper」授权后三项为真；用同一证书重新构建、换了存放位置后授权仍在 |
| 桌面应用与本地网页模式 | 通过。launchd 任务拉起的 node（网页模式 LaunchAgent 的情形）与 GUI 应用的子进程 node（桌面应用的情形）各自经 `open` 拉起助手：node 的负责进程分别是它自己与那个 GUI 应用，助手的负责进程都是它自己，三项权限都在 |

没验证：多显示器（这台只有一块屏）；Intel Mac；macOS 14、15。

## 6. 结构与归属

| 部分 | 位置 | 负责 |
| --- | --- | --- |
| 合同与策略（桌面动作、应用 scope、切换按目标判断、一等拒绝原因、不可撤回、带寿命的批准） | Prologue 分支 `feat/desktop-computer-use`（工作树 `~/code/prologue-computer-use`） | 本任务 |
| 原生助手 | `apps/local-host/native/computer/`（`build.sh`） | 本任务 |
| 助手的拉起、协议、桌面驱动、分级与禁区、记录 | `apps/local-host/src/computer/`（与 `browser/` 并列） | 本任务 |
| 一轮同时挂浏览器与桌面 | `horizontal/agent-host/src/adapters/prologue-surfaces.ts`、`packages/contracts/src/services/ui-surfaces.ts` | 本任务 |
| 「电脑」标签、设置 | `apps/workbench/src/side-panel-computer.ts`、助理设置、`apps/workbench/src/i18n/` | 本任务 |

不在本任务内：Windows 与 Linux；远程与云桌面；插件声明会操作哪些应用；右栏 Shelf 格（PR #180）；截图进模型与文字识别（D16）。

## 7. 进度（2026-10-10）

分支：Molis `feat/computer-use-land`（已合入 `origin/main` `72137e89a`；`feat/prologue-adoption` 的 `8b1a05220` 不是祖先）。Prologue `feat/desktop-computer-use`（叠在 `feat/molis-adoption` c4b9fde3 上）。

- [x] 三项决定弹窗问过（D06–D08）
- [x] 最小真机切片（§5，全部通过）
- [x] SDK 一条线：产出 `prologue-sdk-0.0.0-rc.1-computer-use.tgz`（4f7110fe → c4b9fde3 → 5 个桌面提交），两次构建逐字节相同，替换在途包；来源与重建写进 `vendor/prologue-sdk/README.md`，`.sha256`/`.provenance.json` 与门禁测试更新
- [x] Prologue 合同（另一会话实现）：桌面有类型动作、应用身份作 scope 且切应用按目标判、四种一等拒绝、不可撤回归改外部、只活一轮的批准；类型检查与构建通过，单元 2593 项全过，46 个变异全杀，真机 live 6/6
- [x] Molis 助手：Swift 原生助手（截图、辅助功能树、输入、前台、锁屏与输入监听、权限、落点校验、中文输入），随 local-host 构建与分发
- [x] Molis 桌面驱动与会话装配：`HostSurfaceDriver` 桌面一支、一轮同时挂浏览器与桌面、分级与禁区、确认卡（含「本轮内允许」）、记录、拉起与协议、权限引导。宿主挂上的那一次 `surface()` 转发 `describeRound` 和 `noteRun`，并把这一轮的 Molis 会话记在这次返回的对象上；无参 `release()` 用这个会话结束记录并清掉租约。`tests/computer-use-gaps.test.ts` 从 `desk.driver()` 走通：项目、run、目标写进记录，助理项目不是当前打开的项目时确认落到这一轮，释放之后下一次观察不再被「另一项工作」拒绝（2026-10-12，11 项里含这一项，通过）
- [x] 「电脑」标签、助理设置（总开关默认关、禁区、权限引导）、记录进「文件」
- [x] 对话步骤展示（`presentActivity`，桌面与浏览器共用 surface-* 工具）。成功的桌面 `surface-act` 回执与浏览器相同，仍读成「操作应用」；同样的浏览器回执仍是「操作网页」（`tests/assistant-tool-words.test.ts`，2026-10-10 通过）
- [x] 整体 `pnpm build`、`pnpm boundary:check`、`pnpm health:check` 全通过（2026-10-11 又在 `feat/computer-use-land` 上跑过；`health:check` 与 `node scripts/check-health-gates.mjs --base origin/main` 都通过，merge-base 仍是 `72137e89`。`handleMolisWorkWebRequest` 保持在已提交快查的 424 行）。页面资源门 `page-assets --base origin/main` 同一天通过。不再叠在 `feat/prologue-adoption` `8c0b60fb` 上。2026-10-11 在合入 origin/main `4fb2db83f` 的 `3b5ff992` 上又跑过 `pnpm build`、`pnpm boundary:check`、`pnpm health:check`、`node scripts/check-health-gates.mjs --base origin/main` 和 `node scripts/gates/page-assets.mjs --base origin/main`，退出码都是 0。2026-10-12 在合入 origin/main `02ceba8c9` 的 `90b5c6928` 上又跑过这五项，退出码都是 0；页面资源相对 merge-base `02ceba8c` 通过，workbench.css 1870521、workbench.js 1349868
- [x] 本分支的 Web 服务在独立 Home、独立端口上启动并冒烟（无模型）：`/api/computer/*` 可用，总开关默认关、开关与禁区应用持久，`state`/`records` 正常；**助手在 Web 服务下连通、三项系统权限均已授权**（`helper: ready`）
- [x] 2026-10-10 又在两个隔离 Home 上各启动一次，`GET /api/computer/state` 两次正文一致：总开关 `enabled: false`，`helper.state` 为 `stopped`。2026-10-11 在合入 `4fb2db83f` 之后又用 `pnpm web` 对两个空 Home 各启动一次，两次正文仍一致，总开关仍是关，助手仍是 `stopped`
- [ ] 真实模型的跨应用验收（一次说完、二十步、过程在「电脑」标签、记录进「文件」、放上 Shelf、对话引用、中途动鼠标暂停、拒绝不换办法、禁区/终端/落点/自批/密码/锁屏各一遍）——二十步和两种应用发生了，整格仍未完成。2026-10-11 用已配置的 MiniMax-M3，隔离 Home，工作 `work-b54e167e-8ba5-438e-87fb-691d95a86de9`：`computer-list` / `computer-look` / `computer-act`，TextEdit 与计算器，记录 29 步，没选项目的文件列表取到 `4afeae77-34c3-41ee-9259-a6924a238da8`，现有 `POST /api/shelf/items` 返回 200。观察过期后模型重新观察，没有改用别的办法。脚本的一次鼠标移动被记成 `paused` / `person-input`，交还后同一任务继续。更早一轮 `computer-use-live-lock.log` 里，第一次观察是 `screen-locked`，模型停下。终端打字和系统设置：模型引用桌面规则后用文字停下，没有调用工具；发出去的驱动在单测里会拒绝并记下 refused。落点：补测 `work-17b25b0d-c721-4460-a55b-f58876cd4fb5` 对计算器窗口 (100, 40) 的点击返回 `completed; 1 action(s) performed`，遮挡窗没有盖住这个点，所以真机没有形成拒绝；驱动在落点 pid 不是目标时拒绝。自批：2026-10-12 工作 `work-2576a251-de6b-4cb6-a335-9a2a4a0f6f6d` 对 TextEdit 输入文字的确认，在上一步落下后立刻批准，返回 409 `computer.self_approval`（「这一步刚落到屏幕上，助理不能马上批准自己」），约 1.7 秒后同一张卡批准成功。这一轮 `computer-act` 为 12，随后被浏览器用例打断，整格仍未完成。2026-10-12 工作 `work-6b369b25-7a8e-49b8-9949-703c43781a4c` 的 `computer-act` 停在 12，模型随后改走浏览器。13:43:01 一次动作返回 `outside-target`（英文说明落点会落到这台 surface 的应用之外，遮挡窗或拖出应用）。操作记录里出现「截图会带出没有涂黑的密码框」，日志没有单独的 activity 行。终端、系统设置和驱动不可用没有形成拒绝。人在场是脚本自己的 takeover，不是真实鼠标。这一轮没有把截图放入 Shelf。整格仍未完成。2026-10-12 18:05Z 前台是 ChatGPT，鼠标和滚轮刚动过，`browser.lock` 空着，走查没有启动。整格仍未完成。右栏 Shelf 仍未接。带截图放上现有 Shelf 的真机观察还没有。2026-10-13 这一格没有跑：这台机器上有人在用，没有启动走查，没有发 Ctrl+Cmd+Q，没有输入或猜测密码。完成与否改为看窗口标题、文件或操作记录；模型说完成但这些事实没有到，仍算没完成。格子保持未勾。
- [x] 「文件」里没选项目时的操作记录：`tests/computer-use-gaps.test.ts` 走 `handleUnscopedComputerFiles`，列表和预览只返回 `project_id` 为空的记录，选了项目的记录预览为 404。浏览器里的空 Home 画面没有另拍
- [x] 没选项目时的确认卡：项目列表上的 `/api/agent/reviews` 和 `/api/agent/reviews/decide` 走个人工作的 owner。同一测试在 2026-10-11 通过：个人那条能列出并批准，别的项目的卡不出现；点击落下后 1.5 秒内批准仍是 409
- [x] 锁屏、用户在场、驱动不可用三种拒绝在真机上触发。锁屏是 `computer-use-live-lock.log` 的 `presence.locked` / `screen-locked`，模型没有改用别的办法。用户在场是记录备注「用户动了鼠标或键盘，助理暂停」，控制状态 `paused` / `person-input`；助手自己的点击带标记，不会被记成用户。驱动不可用是 `work-17b25b0d-c721-4460-a55b-f58876cd4fb5`：桌面已经挂上、总开关关掉之后，下一次点击被拒绝，模型引回 `refused: driver-unavailable`。没有用 Ctrl+Cmd+Q 再锁一次屏
- [x] 全量回归对干净基线——2026-10-11 对 `72137e89a`。基线 5136 项，失败文件 6 个；Computer Use 5144 项，失败文件 2 个。只有 `tests/goals-narrow-navigation.e2e.test.ts` 不在基线失败名单里，基线全量里这条是通过的。当时还有别的全量在跑，页面等事件光标超时，提示里留着测试自己挡住请求时的「Failed to fetch」。槽空后单独重跑该文件：2 项通过，0 失败，0 跳过。其余失败文件都已在基线出现。2026-10-11 又把这条线接到 `a28d7584b`（当时的 origin/main，另含未推送的 AI 交互提交）后重跑：基线 5560 项、失败 5；Computer Use 5571 项、失败 5。两边的失败文件都是 `tests/immersive-directory.e2e.test.ts` 和 `tests/touch-targets.e2e.test.ts`，没有新的失败文件。2026-10-11 再对 origin/main `4fb2db83f` 重跑：基线 5569 项、失败 7、失败文件 4 个；Computer Use 5580 项、失败 5、失败文件 2 个，仍是 `tests/immersive-directory.e2e.test.ts` 和 `tests/touch-targets.e2e.test.ts`，没有新的失败文件。2026-10-12 对 origin/main `02ceba8c9` 重跑：基线 5606 项、失败 5、失败文件 3 个；Computer Use 5618 项、失败 7、失败文件 4 个。共同失败是 immersive-directory 和 touch-targets。基线独有 `tests/alchemist-mcp.test.ts`。Computer Use 全量多出 `tests/goals-document.e2e.test.ts` 和 `tests/model-first-setup.e2e.test.ts`；这两个文件在两棵树上单独重跑都是 8 项通过，不是产品回归
- [ ] Shelf 放入记录/截图：界面先把记录文字 POST 到现有 `/api/shelf/items`。文字失败，或成功返回里没有 `item_id`，就不再放截图。截图请求抛错、不是成功、或幂等键仍在提交（409，`request.in_flight`）时，删掉刚放进去的文字；第一次删除失败会再试一次。同一张截图的幂等键若已经提交过（409 且不是 `request.in_flight`），文字留下。`tests/computer-use-gaps.test.ts` 调用的就是页面脚本里的 `putComputerRecordOnShelf`（2026-10-11 通过）。走查只看到文字那次返回 200，还没有带截图的一次放入。右栏 Shelf 仍不在本任务内

## 8. 待验证与已知缺口

- 真实模型走完了 TextEdit 与计算器的多步操作，也触发了锁屏、用户在场和驱动不可用。终端打字、系统设置、被挡住的落点、自批和密码截图外带，发出去的驱动会拒绝并记下 refused（`tests/computer-use-gaps.test.ts`，2026-10-11）；那次真机走查里模型没有调用这些工具，遮挡窗也没有盖住落点，所以还没有对应的真机拒绝记录。全量回归对 `72137e89a` 已经跑完，没有新的产品失败。对 `db9cbddca` 的又一次全量：基线 5144 项、失败 1、失败文件 `tests/agent-action-selection.e2e.test.ts`（页面条件超时）。Computer Use 5146 项、失败 8、失败文件 5 个：`tests/install.test.ts`、`tests/npm-package.test.ts`、`tests/runtime-payload.test.ts`、`tests/uninstall.test.ts` 都是 `source.build_stale`，因为全量开始前源码又改过而 dist 还是上一次构建；`tests/goals-document.e2e.test.ts` 是页面脚本 `Runtime.evaluate` 超时。这 5 个文件在基线全量里是通过的。重新构建后那 4 个安装类文件共 30 项通过。`tests/goals-document.e2e.test.ts` 单独重跑 4 项通过。所以这 5 个新失败文件不是产品回归。接到 `a28d7584b` 之后的全量没有新的失败文件：基线与 Computer Use 都是 5 项失败，文件都是 `tests/immersive-directory.e2e.test.ts` 和 `tests/touch-targets.e2e.test.ts`（基线 5560 项，Computer Use 5571 项）。接到 origin/main `4fb2db83f` 之后又跑了一次：基线 5569 项、失败 7、失败文件 4 个；Computer Use 5580 项、失败 5、失败文件仍是上述两个 e2e，没有新的失败文件。二十步整格和带截图的 Shelf 放入仍未完成。准备再走真机时屏幕是锁着的，没有发 Ctrl+Cmd+Q，也没有改先前的走查记录。合入 `4fb2db83f` 之后屏幕会话仍打印 `locked`，没有启动 `computer-use-live.mjs`。这不是用户验收。接到 origin/main `02ceba8c9` 之后又跑了一次全量：基线 5606 项、失败 5、失败文件 `tests/alchemist-mcp.test.ts`、`tests/immersive-directory.e2e.test.ts`、`tests/touch-targets.e2e.test.ts`；Computer Use 5618 项、失败 7。多出的 `tests/goals-document.e2e.test.ts` 是选中后 `goalView === 'RELEASE'` 超时，`tests/model-first-setup.e2e.test.ts` 是清理 Chrome profile 时 `ENOTEMPTY`。两棵树上单独重跑这两个文件都是 8 项通过、0 失败。Alchemist MCP 只在基线全量里超时。二十步整格和带截图的 Shelf 放入仍未完成。2026-10-12 屏幕没有锁（`cu-session` 打印 `unlocked`）。走查没有启动：另一会话的全量还占着这台机器。没有新的 transcript，没有发 Ctrl+Cmd+Q。先前的走查记录还在。
- 记录的 `goal` 取自 attach 时的 `input.task`；`run_id` 在 attach 时还没有，记为 null。
- 没选项目时的确认卡走个人工作的 owner（`home`），由 `tests/computer-use-gaps.test.ts` 覆盖。浏览器里的空 Home 画面没有另拍。
- 右栏 Shelf、多显示器、Intel、macOS 14/15、发布签名与公证（BL-021）未做或未验证。现有 `POST /api/shelf/items` 在走查里对文字返回过 200；截图那次 POST 还没有真机记录。
