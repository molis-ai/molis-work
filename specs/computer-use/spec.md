# 个人助理的完整 Computer Use

状态：进行中（2026-10-09 开工）。最小真机切片已在用户的 Mac 上证明（§5）；Prologue 合同、SDK 换包、Molis 驱动与侧栏呈现在做（§7）。目标原文见 [goal-prompt.md](goal-prompt.md)。

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
| D15 | 截图：只拍目标应用的窗口（ScreenCaptureKit 只含该应用），裁到它前窗的范围，按 1 倍点数出图，密码类输入框在离开助手之前涂黑；Prologue 的脱敏器只放行驱动自己产出、已遮盖的截图（同侧栏浏览器 D10） | 真机：被访达盖住一半的 TextEdit 截图里没有访达的像素（§5） |
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
| 自批：助理点自己的确认卡 | Molis 窗口、助手、显示 Molis 的浏览器窗口属禁区（观察与动作都拒）；落点校验拒绝落在别的窗口上的点；注入后 1.5 秒内的桌面确认答复不算 | 待补（§7） |
| 越界落点：点到盖在上面的窗口或通知条 | 助手在注入前原子地核落点（D14）；Prologue 在执行前核观察新鲜、窗口身份与应用 scope | 真机 §5；单测待补 |
| 屏幕内容外带：截图带出别的应用、密码 | 只拍目标应用（D15）；密码框涂黑；脱敏器只认驱动自己产出的截图；记录只在本机、30 天删截图、不进搜索与记忆 | 真机 §5；单测待补 |
| 提示注入：窗口里的文字冒充指令 | 观察正文框在不可信内容里交给模型；提示词写明；禁区与分级在驱动和 Prologue 规则两处挡，不靠模型自觉 | 待补 |

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

## 7. 进度

- [x] 三项决定弹窗问过（D06–D08）
- [x] 最小真机切片（§5）
- [ ] SDK 换包：基线与差距（D20 待写）
- [ ] Prologue 合同与测试、变异测试、真机记录
- [ ] Molis：助手拉起与协议、桌面驱动、分级与禁区、会话同时挂两台界面、确认卡、记录、「电脑」标签、设置、引导
- [ ] 真实模型的跨应用验收、全量回归对基线
