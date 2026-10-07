# 个人助理的完整 Computer Use

状态：目标已定、未开工（2026-10-07）。目标原文见 [goal-prompt.md](goal-prompt.md)；开工前对照最新代码的复查结论见 §3，待开工后弹窗问用户的决定见 §5。

## 1. 要解决的事

个人助理现在只能在侧栏的浏览器里动手（`specs/archive/side-panel` D02）。本任务让它能操作 macOS 上的其他应用、完成跨应用的多步任务，并在侧栏里把过程和结果交给用户：实时画面、确认、停止与接手、操作记录。

好用的标准写在 goal-prompt 开头：一件二十来步的任务，用户说一次就能做完，不用盯着每一步点确认、不用说「继续」、自己的鼠标键盘不被抢走、随时能一键拦下。

## 2. 决策记录

| # | 决定 | 来源与理由 |
| --- | --- | --- |
| D01 | 原生助手进程归 Molis，Prologue 只扩合同与策略，继续不带任何驱动 | 用户 2026-10-07。Prologue 的立场是「驱动由 App 提供」；原生助手由 local-host 拉起，桌面应用与本地网页模式都能用 |
| D02 | 桌面上看到用户自己的浏览器时，当普通应用，按应用授权，不能记住 | 用户 2026-10-07。桌面驱动认的是应用身份，认不出网站，按网站授权那套用不上；网页的事仍优先用侧栏浏览器 |
| D03 | 侧栏新增「电脑」标签，每轮操作记录进「文件」 | 用户 2026-10-07。实时画面与确认在「电脑」标签，结果在「文件」，记录可放上 Shelf、可在对话里引用 |
| D04 | 分级边界：禁区 / 只看只点 / 其余经批准，附通用禁令 | 用户 2026-10-07 |
| D05 | 只做 macOS | 复查补充：现有发布只有 macOS 双架构；界面不暗示 Windows 与 Linux |
| D06 | 后台优先：辅助功能的语义动作，其次把事件投递给目标应用，最后才提到前台 | 复查补充：用户与助理共用一套鼠标键盘，一动手就接管会让功能没法用；每一档在各类应用上能走多远要真机证明 |
| D07 | 屏幕上放一个点击穿透、不进截图的悬浮条，带停止、暂停、接手与批准 | 复查补充：助理操作别的应用时，侧栏可能被盖住 |
| D08 | 助理使用电脑有总开关，默认关闭 | 复查补充：它要系统授权、影响整台电脑；浏览器默认开，是因为每个动作本来都要问 |
| D09 | 确认的节奏：用户批准「本轮内允许在这个应用里操作」，到本轮结束收回；不可撤回动作、上传下载、切到没批准过的应用仍逐步问 | 复查补充，**改变了 D04 之前「每步都问」的口径，待用户确认**（§5） |
| D10 | 观察以文字为主（辅助功能树加文字识别），截图为辅；按模型设置的 `vision` 标记决定是否把截图交给它，不支持就明确降级 | 复查补充：Prologue 现在不能把一轮中途的截图交给模型（§3 第 1 行） |
| D11 | 操作记录默认只留本机 Home、按保留期清理、不自动进搜索与记忆 | 复查补充：截图含屏幕内容 |

## 3. 开工前的复查（对照 Prologue `b14c6686`、Molis Work `6e62652d`，2026-10-07）

Prologue 远端 main 没有比 `b14c6686` 更新的提交；Prologue 与 Molis 两边都没有看到别的分支或工作树在做桌面驱动。Molis 现用的 SDK 包是 `af7375c7` 加补丁，Prologue main 比它多 39 个提交，且已含它依赖的界面控制与记忆提交。

| # | 发现 | 证据 | 写进目标的哪里 |
| --- | --- | --- | --- |
| 1 | 模型看不到屏幕：截图观察只回资源引用；图片只在一轮开头随材料进入模型 | Prologue `composition/core/system-tools-surface.ts`（screenshot 分支只返回头部）、`agent/core/loop-model-call.ts`（附件取自 `recipe.start.attachments`）、`model/plugin/anthropic-compatible.ts`（图片挂在最后一条用户消息）；Molis 模型设置的 `vision` 标记在 `horizontal/agent-host/src/adapters/prologue.ts` | 第 2 条 |
| 2 | 一步两次来回：`surface-act` 的回执只有状态与动作次数，动作又必须绑定一次新观察 | 同上 `operate` | 第 2 条 |
| 3 | 观察时效 10 秒、单次观察 4 MiB、一轮 24 步 | Prologue `ui-control/core/control.ts` 的 `DEFAULT_UI_LIMITS`（`createRuntime({ surfaces: { limits } })` 可调，Molis 现在没调）；`apps/local-host/src/assistant/assistant-service.ts` 的 `ROUND_TURNS` | 第 2 条 |
| 4 | 逐步确认配上 24 步上限，二十步的任务根本做不完 | 同 2、3 | 第 6 条 |
| 5 | 用户和助理共用一套鼠标键盘 | 设计判断，未在代码里核对 | 第 4 条 |
| 6 | 助理操作别的应用时，侧栏可能被盖住，确认卡到不了用户 | 设计判断，未在代码里核对 | 第 7 条 |
| 7 | 本地构建是 ad-hoc 签名，macOS 通常把每次重新构建当成新应用，授权会失效；发布签名与公证未定 | `apps/desktop/tooling/build-macos-release.sh`、`specs/BACKLOG.md` BL-021 | 第 9 条 |
| 8 | Prologue 有自己的改动流程：先改需求分册与合同；未经用户要求不提交、不推送；屏幕锁定与批准寿命在需求分册里标着「以后」 | Prologue `AGENTS.md` §4、§6、§8；`docs/product/requirements/modules/ui-control/observe-act.md` | 第 3 条 |
| 9 | 一个会话只能挂一台界面；驱动合同的 `kind` 只有 browser | `horizontal/agent-host/src/adapters/prologue-surfaces.ts`（`attached` 以会话为键）、`packages/contracts/src/services/ui-surfaces.ts` | 第 3 条 |
| 10 | 主 CI 跑在 ubuntu，发布在 macOS 双架构 | `.github/workflows/ci.yml`、`release-macos.yml` | 第 9、12 条 |
| 11 | 界面文案要有英文对照 | `apps/workbench/src/i18n/side-panel-en.ts`、`tests/i18n.test.ts` | 第 12 条 |
| 12 | 根目录每个 spec 目录必须有 `spec.md` 且开头有状态句 | `scripts/check-health-gates.mjs` | 本文件 |

**还没在真机上证明的假设**（第 10 条的最小切片要逐项回答）：权限归属在两种拉起方式下是否对得上同一个名字；后台三档在各类应用上各能走到哪；Electron 与 Chromium 类应用的辅助功能树能不能打开；悬浮条能不能点击穿透且不进截图；坐标换算在 Retina 与多屏下是否正确。

## 4. 结构与归属（位置是建议，开工时按 `docs/system/PACKAGE-BOUNDARIES.md` 定）

| 部分 | 位置 | 负责 |
| --- | --- | --- |
| 合同与策略（桌面动作、scope、截图进模型、回执带观察、拒绝原因） | Prologue `packages/sdk/src/ui-control`、`effect-policy`、`composition/core/system-tools-surface.ts`、`tool/core/system.ts`、`agent` 循环与 `model` 适配；需求分册 `observe-act.md` | 本任务（Prologue 新分支，独立工作树） |
| 原生助手进程 | `apps/desktop/` 下新目录，随 `pnpm desktop:build:macos` 构建；协议与拉起由 local-host 持有 | 本任务 |
| 桌面驱动与会话装配 | `apps/local-host/src/computer/`（与 `browser/` 并列）、`horizontal/agent-host/src/adapters/prologue-surfaces.ts`、`packages/contracts/src/services/ui-surfaces.ts` | 本任务 |
| 「电脑」标签 | `apps/workbench/src/side-panel-computer.ts`（与 `side-panel-browser.ts` 并列）、`apps/workbench/src/i18n/` | 本任务 |
| 对话里的步骤展示 | `assistant-service.ts` 的 `presentActivity`、`apps/workbench/src/scripts/client/assistant-island.ts` | 本任务；动前通知助理面板线的会话 |
| 操作记录 | 助理工作的「产出」关系与「文件」标签预览；归属与形态按 `specs/artifact-positioning` | 本任务，先弹窗问 |
| 设置（总开关、禁区、系统权限引导） | 助理设置（`apps/workbench/src/settings-assistant.ts`） | 本任务 |
| 助手的发布与签名 | `apps/desktop/tooling/*`、`.github/workflows/release-macos.yml` | 本任务；发布签名是用户的决定 |

不在本任务内：Windows 与 Linux；远程与云桌面（Prologue 也后置）；插件声明会操作哪些应用（`surface:desktop`，对应 side-panel D16 的浏览器声明）；右栏 Shelf 格（`specs/context-program`，PR #180，仍是设计）。

## 5. 待开工后弹窗问用户的决定

1. **确认的节奏（D09）。** 推荐：本轮内允许，到本轮结束收回。备选：每步都问（二十步的任务会被确认打断）。
2. **发布签名与公证（BL-021）。** 决定用户更新之后要不要重新授权屏幕录制与辅助功能。
3. **截图记录的保留期。**
4. **操作记录的归属与形态**（助理工作的产出，还是成果库里的成果）。
5. 替换 vendored SDK 包前，说明基线与差距，经用户同意。

## 6. 进度

未开工。
