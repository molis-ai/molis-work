# V2 账号统一：最新主线集成与 PR 检查（2026-11-10）

状态：Auth 最终本地全套与 PR #5 CI 已通过；Work 已合入主线 07840084，完成定向与真实 Auth 联调，最后收尾见本文末尾；Work 最终全量按现行流程在 PR 的 full-suite CI 执行，未完成前不标记全量通过。历史睡眠中止记录保留作证据，未部署。

## 候选与范围

Work 以 `02d2443f1b79b70092745714c938cc75b1826074` 为主线基点，Auth 以 `40126f1` 为基点，在两个 `codex/unify-v2-pr-20261110` 独立工作树集成。Auth 合同来源提交 `782cb36`，Work 原始合同、摘要与生成 DTO 已核对。未修改主检出、运行中的预览 Home 或真实 Home。

集成保留主线的浏览器会话证明、`viewScope` 和凭据库写前拒绝：Home 控制令牌不返回浏览器；V2 登录发出请求前确认密钥库可写，失败保留原账号租约。Auth 保留主线新加入的 GitHub LIVE 适配与测试。本轮提供方 HTTP 和验证码投递使用隔离夹具，不证明正式第三方服务送达。

真实联调发现旧业务 Home 撤销会截断切换账号的登录完成响应。安装登录窗口现使用独立传输会话，仍校验本次登录 nonce 与原账号 cookie，不授予业务 Home 权限。`WAS-10` 验证错误 nonce、缺失 cookie、跨业务范围拒绝和成功响应完整返回。旧页面、消息流及业务 Home 仍按原租约撤销。完成后的安装登录标识只允许读取状态，重新创建登录和活动写入均在入口拒绝；底层原有 ACTIVE 会话拒绝再次登录的 409 保护仍保留。

## 已完成检查

| 检查 | 当前结果 |
| --- | --- |
| Auth 合同、Rust、Worker、Web、SDK | 8、16、113、1、2 个测试通过 |
| Auth Web / SDK / Worker dry-run 构建、格式 | 通过；未执行部署 |
| Auth 真实 Chrome + WASM/D1 | 11 组页面流程通过 |
| Work 整体构建 | 通过；临时诊断产物已由最后构建清除 |
| Work 包边界、公开 API、合同原始字节 / DTO、版本 | 通过；包边界在最终 socket 等价提取之前执行，全量继续覆盖 |
| Work 最新主线健康门禁 | 通过；没有增加巨大单元例外或放宽门禁 |
| 同步服务 Rust | 格式及 wasm32 clippy `-D warnings` 通过 |
| Work 浏览器会话安全 | 原有 5 项通过；账号切换 14 项含新增 WAS-10 通过 |
| 真实 Auth + Work 安装联调 | A→B→A、原数据保留、旧凭据拒绝、重启与原生附着通过；新增真实 UI 退出在一次 503 后两次连续通过，保留该次失败记录，不能称零偶发；最终无诊断构建的同一完整流程再次通过 |
| 跨仓库账号专项脚本 | 资料管理、租户、计费通过；3 个旧脚本失败仍保留，见下文 |

## 最终全量

整体构建后冻结产品代码、测试、脚本、依赖和 Skill。标准运行器默认清单共 **1,937 个不同文件**，分为独立浏览器组 3 个及三组 645 / 644 / 645；分区校验无遗漏或重复。每组 `--jobs 1`，共享机器槽限制并发。固定 Node 24.15.0、pnpm 11.9.0、专用 Chrome 156，测试使用临时 Home。

第一次运行在补充完成后写入拒绝之前主动中止，三组退出码均为 130，不计入最终通过数。最终候选提交 `8b73883c8`，冻结 SHA-256：`0321952e4c975f661cbc501c951ae643d1fab99fabc713ee3d94348211f34fbf`。最终清单 `/private/tmp/work-v2-pr-full-final-manifest.json`，三组日志 `/private/tmp/work-v2-pr-full-final-{1,2,3}.log`，独立组重跑 3/3 通过；三组在 2026-11-10 09:25（本地时间）主动中止，退出码均为 130。三组共返回 66 个文件结果（11 通过、20 失败、35 超时），加独立组共执行到 69/1,937 个文件；其余 1,868 个未完成。系统 `pmset` 日志显示反复进入 Deep Idle、仅短暂 DarkWake 后再睡眠；大量用例出现 CDP 断开及 1,900–2,000 秒超时。该批次受环境污染，20 个失败与 35 个超时均未归因为产品回归，也不计作通过。中止后源码摘要仍与冻结值完全一致。睡眠证据 `/private/tmp/work-v2-pr-sleep-evidence.log`，逐文件结果 `/private/tmp/work-v2-pr-full-final-interrupted-summary.json`。精确主线基线工作树已构建完成，但没有用环境污染结果作基线归因。后续需在持续清醒的环境重跑完整清单，再对仍失败的用例作同环境基线对照。

## 尚未放行的事项

1. `scripts/central-account.test.mjs` 仍通过安装 Host 装配直接账号模块夹具，启动时报告 `Account Host is not configured`。需要使夹具入口与其直接会话测试职责一致，保留全部会话恢复及隔离断言。
2. `scripts/account-authentication.test.mjs` 和 `scripts/account-provider.test.mjs` 的 HTTP 验证通过，但独立账号模块夹具仍断言旧版账号弹窗的「已退出 / 返回登录」。退出如今归安装层。拟将登录用例之间的夹具复位与真实安装 UI 退出分别验证；现有断言尚未替换。真实安装 UI 退出已新增验证，未替代或抹除原脚本失败。
3. 最新主线隔离构建实测 `workbench.js` 为 1,028,175 → 1,030,596 字节（+2,421），原许可 +2,366，差 **55 字节**；`plugin-frame.js` 增长 92 字节，与原许可相同，无新增资源。资源门禁当前失败，许可未增加。

自动审批拒绝了更新资源许可和替换旧 UI 断言的命令；当前保留原许可、原失败断言和所有测试分组。若要采用上述测试职责调整及追加 55 字节许可，需要用户明确批准。没有用调大基线、删除断言或减少全量文件使检查变绿。

## 用户后续决定

用户已明确批准第二项资源增长：workbench.js 许可由 +2,366 调整至 +2,421 字节（追加 55 字节）。修改前再次测量当前资源仍为 1,030,596 字节，plugin-frame.js 仍为 231,908 字节；没有新增资源。许可已更新，本次未重跑全量。第一项三个测试脚本的职责适配仍待说明和确认，尚未修改。

## 测试适配获批后的结果

用户明确批准修改测试脚本后，已完成：

- `central-account.test.mjs` 改用直接账号模块对应的 Core 宿主，保留持久化恢复、刷新并发、离线拒绝、跨产品和全局退出断言。
- 邮箱/验证码及提供方脚本在两轮登录用例之间显式复位独立模块会话，并断言 ANONYMOUS；实际安装退出仍由 `account-installation.test.mjs` 的真实浏览器点击、匿名身份、Cookie 清除和入口导航断言覆盖。
- 三个调整脚本全部通过。安装用例首轮点击阶段 CDP 超时，独立复验发现账号按钮已绘制但页面仍处于登记期间的 inert 状态；测试增加等待登记解除，并将登录窗口置前，保留真实点击及可达性检查。修改后真实 A→B→A、重启恢复和浏览器退出完整流程通过。
- 整体构建、差异检查通过；资源门禁以主线隔离构建对照通过，共 52 个资源，只有已批准的 +2,421 / +92 字节增长。

证据：`/private/tmp/work-v2-pr-adaptation-results.json`（三个脚本通过及首次安装用例失败），`/private/tmp/work-v2-pr-adaptation-installation-ready.log`（时序修正后安装完整流程通过），`/private/tmp/work-v2-pr-assets-approved.log`（资源门禁通过）。本轮没有重跑全量、没有推送或创建 PR，先前受睡眠干扰的全量仍不能算通过。

## 2026-11-10 登录入口后续修正（WUA-29）

用户要求打开未登录 Work 与退出后直接显示已有登录表单，移除未登录按钮和账号菜单的中间步骤。同浏览器未完成的匿名登录重新打开时恢复原请求，不取消其他浏览器的请求；失效入口重新开始。直接登录成功在当前页继续既有首页／首次引导，换号弹窗的通知协议保留。

用户同时明确要求记住：退出必须清理所有账号内容、连接和缓存，防止影响换号／下一位用户。已补清理 Host 认证事务和在途登录引用；原有账号租约撤销、工作区关闭和连接断开仍按既有协议执行。整站 `Clear-Site-Data: storage` 方案被自动审批拒绝，未写入代码，因会误删非账号数据；浏览器存储仍需逐项核对账号归属，不能把“已退出”当成全部缓存已经验收。项目文件保留隔离，不在退出时删除。

本次只运行定向回归，不启动全量；提交 PR 前仍需完成此前中断的全量验证。

最终定向结果：整体构建通过；`personal-http` 11、`account-reconnect.e2e` 1、`space-surface-account-race` 14 项通过（含 WUA-29：旧 Home 释放期间匿名入口不得覆盖新登录）；此前 `personal-auth` 6 项与 `personal-menu.e2e` 5 项通过。真实 Auth/D1/Chrome 最终完整通过直接登录、同浏览器重新打开原请求、A/B/A、旧凭据拒绝、重启／原生附着、真实 UI 退出和再次直接登录。日志 `/private/tmp/work-v2-direct-login-installation-final.log`、`/private/tmp/work-v2-direct-login-final2-tests.log`；截图在忽略的 `.impeccable/qa/review/account-installation-v2/direct-login.png`。

真实换号曾暴露自动入口竞争：旧页面撤权后打开匿名入口，可能覆盖尚在读取最终账号视图的登录响应。安装事务现在一直保留到响应 `finish`／`close`，身份与请求完成分别管理；没有放宽其他浏览器拒绝和旧页面保存协议。测试也按真实双窗口换号，并等待原页面保存确认，未跳过任何隔离断言。

资源实测 workbench.js 1,030,838 字节，相对主线 +2,663；超出已批准 2,421 字节的部分为 242 字节，用户已于 2026-11-10 明确批准这 242 字节增长，许可已调整为 2,663 字节。首次结构门禁通过；最终仅追加 HTTP 事务结束时机修复与定向拒绝断言。账号缓存完整清理审查和完整全量回归仍未完成，当前不具备提交 PR 的全部证据。

4307 预览使用本候选代码及原测试 Home 的完整副本 `/private/tmp/molis-v2-preview-20261109/work-home-direct-20261110`；原目录完整保留。启动器 `/private/tmp/molis-v2-preview-20261109/start-work-direct.mjs`，Auth 8877 沿用原服务；4207 未修改。

资源许可批准后复核：使用已构建且源码干净的主线基线工作树（HEAD 经核对等于 merge-base `02d2443f1`）重新实测，结果通过全部 52 个资源：workbench.js +2,663 字节、plugin-frame.js +92 字节。为避免重复构建基线，通过门禁 `--base-sizes` 输入该次实测映射（日志标为 fixture，未生成可信 CI artifact）；未手填或放宽实测值。日志 `/private/tmp/work-v2-direct-login-assets-approved.log`。本轮未运行全量回归。

## 2026-11-10 退出重登后首页显示 JSON（WUA-30）

用户在 4307 首页看到 `正在处理旧页面的未保存内容，请稍候。` JSON。只读检查当时安装已 authenticated/ready，loginPending=false、preparation=null：准备过程已结束，但导航得到的 JSON 不会恢复。现仅页面 GET 在准备期间返回带 1 秒 Refresh 的 HTML 等待页，不启动登录或注册页面参与者；业务 API 仍 409 JSON 拒绝。准备解除后浏览器自动继续；初始化失败的消息页只提供重试，不再擅自发起另一笔登录。

同时新增用例确认原先相同 userId 的新登录未撤销旧租约（修复前用例失败）。真正采用新登录现在总是撤销上一登录租约，即使 userId 一样；只验证并附着现有会话的路径不受影响。旧浏览器 cookie 被拒绝、旧 Home 退出、准备状态正常结束。

定向结果：personal-auth 7、space-surface-account-race 15、account-reconnect.e2e 1 项通过。真实 Auth/D1/Chrome 通过同账号新登录、A/B/A、真实退出再登录，以及准备页自动恢复且不产生另一笔登录。日志 `/private/tmp/work-v2-logout-navigation-tests.log`（最初夹具漏传取消 id）、`/private/tmp/work-v2-logout-navigation-race-final.log`、`/private/tmp/work-v2-logout-navigation-browser.log`；缺失 id 的测试夹具修正为按既有合同传入 id，未放宽取消保护。52 个资源核对通过，仍是已批准的 workbench +2,663／plugin-frame +92 字节。没有运行全量回归。


## 2026-11-10 快速登录／换号／退出（WUA-31）

真实 Auth/D1、安装 Host 与 Chrome 连续操作复现了前端竞态：旧页面撤权会过早关闭仍在完成的新登录窗口；新载体在父页准备期间登记会取消准备；换号未完成就退出会与原准备意图冲突。现保留旧业务撤权，等待匹配当前请求的完成通知再交接；丢弃早于当前登录请求的状态回复；仍 inert 的新载体待准备结束再加入，已有参与者变化仍按原保护取消；退出先取消本窗口的在途换号再执行正常退出。Auth 服务和插件业务代码未改。

新增 `scripts/account-rapid-cycle.test.mjs`，两次独立临时 Home/Auth 环境分别通过 60 与 120 次动作：合计 45 轮登录→换号→退出，加 15 轮登录→发起换号→立即退出，共 180 次。断言包含两账号项目隔离、旧 Cookie/令牌拒绝、退出后零账号事件连接、无残留准备或登录请求、完成或取消后窗口关闭；还主动延迟旧状态响应并发送不匹配的完成通知。验证码使用测试投递，每轮清理隔离夹具的限流桶，因此验证账号生命周期竞态，不是验证码限流或负载测试。

最终整体构建通过；账号菜单 5、重连 1、页面准备 14，共 20 个相关测试通过；对照 origin/main 的结构／静态门禁通过。日志：`/private/tmp/work-v2-rapid-final-first.log`、`/private/tmp/work-v2-rapid-final-second.log`、`/private/tmp/work-v2-rapid-final-related.log`、`/private/tmp/work-v2-rapid-health.log`、`/private/tmp/work-v2-rapid-build-final.log`。4307 候选预览已用本次构建重启，仍用原测试 Home 副本；4207 与 Auth 服务未动。

资源实测 workbench.js 1,031,093 字节，相对主线 +2,918，比已批准 +2,663 多 255 字节；plugin-frame 仍 +92，无新增资源。追加 255 字节已向用户请求确认，尚未调整许可，资源门禁当前仅此项未通过（`/private/tmp/work-v2-rapid-assets-final.log`）。本轮未跑全量；全量回归和账号缓存完整审查仍为 PR 前待办。

用户随后明确批准 WUA-31 额外 255 字节增长，累计许可已更新为 2,918 字节。资源门禁使用之前对干净主线构建的实测映射重新核对，全部 52 个资源通过（日志 `/private/tmp/work-v2-rapid-assets-approved.log`）；无新增资源，未重跑全量。


## 2026-11-10 账号最高／高／中三组专项（WUA-32～34）

用户授权拆为三组并行推进，只跑定向验证，最终 PR 前再安排完整回归。三个子任务均使用本候选工作树、隔离 Home/Auth/Chrome；Auth 产品源码未改。

| 分组 | 实现与验证 | 证据 |
| --- | --- | --- |
| 最高 | 真实浏览器复现退出后账号缓存残留。新增公共浏览器缓存 owner，使用 Host 页会话的公开 scope 分区，初始化先于业务脚本；退出只清当前 scope 的 local/session/CacheStorage，拦截旧页迟到写并等在途缓存写结束。未提交浏览器草稿先确认放弃，取消保留原文和身份；同源 iframe 的共享缓存由主窗口统一提示。双窗口验证实际删除、连接关闭、无关数据和其他 scope 保留。实际 PersonalAuth + ActionService 验证等待外部结果的动作撤权后零业务写。独立检查另发现草稿检查可能重新创建已删空 Cache，现把完整检查纳入清理等待。 | 初始失败 `/private/tmp/account-critical-before.log`；20 项最终定向 `/private/tmp/account-critical-final2.log`；强化跨 scope `/private/tmp/account-critical-scope-preservation.log`；读／清理竞态 `/private/tmp/account-cache-race-final2.log`；连续三次 `/private/tmp/account-cache-repeat-1.log` 至 `-3.log` 均通过。 |
| 高 | 真实 Auth/Core Host 验证 pending 登录跨重启拒绝、后台禁用后的失权；真实 Auth/安装 Host/Chrome 验证关登录页、重启 Host、旧入口恢复、Auth 503 时退出及恢复重登。会话与准备迟到结果 26 项通过。只修测试事件 ID 的随机格式和重定向时 CDP 上下文等待，无产品后端变更。 | `/private/tmp/account-high-central.log`、`/private/tmp/account-high-unit.log`、`/private/tmp/account-high-browser-final.log`。 |
| 中 | 实际 COMPLETE 请求重放拒绝且当前身份仍有效；同账号历史恢复保留缓存，退出后历史恢复清除旧物理缓存；旧登录 URL 恢复可用入口。错误、过期验证码分别拒绝；重复状态提交 400 与真正 resend 429 分别断言，未清限流桶。退出后关闭整个 Chrome 进程，同 profile 重启也不恢复身份，旧凭证拒绝。 | `/private/tmp/account-medium-final2.log`；正常关闭 Chrome，不等同强杀或断电。 |

额外验证：工作台规定的 28 个相关测试文件共 217 项通过（`/private/tmp/account-three-workbench-tests.log`）；最终缓存与草稿检查修复后再跑 10 轮登录→换号→退出及 5 轮换号中退出，共 45 次动作全部通过（`/private/tmp/account-three-rapid-final.log`）。整体构建 `/private/tmp/account-three-build-final3.log` 通过。包边界 `/private/tmp/account-three-boundary.log` 通过。`account-inflight-effects.test.ts` 是快速、无外部依赖的拒绝用例，已追加到产品子集。查询在途清单 PR 时本环境 gh 未认证，未登录或发布外部消息；只追加这一行，未重排清单。

保留一次未定原因的失败：新增 Cache 读／清理断言首轮通过，但后续退出导航 15 秒等待超时（`/private/tmp/account-cache-race-final.log`）；不改产品代码、不增超时，独立复验及连续三次均通过。不能仅凭并发负载推断原因，PR 前最终回归继续观察。没有跳过或放宽断言。

资源：workbench.js 1,034,969 字节，相对基线 +6,794；plugin-frame.js 235,074 字节，相对基线 +3,258。用户明确批准本次增量 3,876 + 3,166 = 7,042 字节，许可已更新；对干净主线构建的实测映射核对全部 52 资源通过（`/private/tmp/account-three-assets-approved.log`，`--base-sizes` 日志标记 fixture，不替代 CI 可信 artifact）。无新增资源。

边界：进行中任务验证共用租约、动作 beforeEffect 和客户端生命周期，不声称每个真实模型／上传／同步提供方均跑过；验证码只 mock 投递，Auth/D1、状态机和限流真实；没有磁盘提交瞬间 SIGKILL 或断电测试，存储不确定路径有故障注入单测。浏览器未提交草稿确认放弃后删除，已保存项目文件不删除。本轮没有全量回归、推送或创建 PR。

最终结构／静态门禁在新增文件纳入跟踪后通过：`/private/tmp/account-three-health-tracked.log`。新增文件此前未跟踪导致安全表检查误报“文件不存在”，纳入跟踪后按原规则检查通过，未改门禁。4307 预览已重启到最终构建，日志 `/private/tmp/account-three-preview.log`；继续使用测试 Home 副本，原 Home、4207 与 Auth 未改。

### Dev 环境启动闭环（2026-11-10）

- Auth `npm run dev` 自动构建、迁移、登记本地 Work 客户端及初始化固定普通测试账号；不覆盖已有账号密码。Work `pnpm dev` 使用独立 Home `~/.molis-work-environments/dev`。
- 固定入口 Auth 8787、Work 4207。test 使用现有 staging 配置；prod 客户端 SQL 已准备但没有执行云端部署。
- 首次本地联调发现 Auth UserView 新增 email，而 Work 固定合同未同步；已整体同步原始合同、摘要与生成 DTO/API 快照，未放宽响应验证。
- 验证：Auth 首次启动、重复初始化保留账号、重复启动拒绝端口冲突；Auth 与 Work 真实 Chrome 账号密码登录成功；账号客户端 14、会话 23、Host 安全 17 项测试通过；完整构建通过。没有运行全量回归（按用户要求留到 PR 前）。
- 本机验证日志：/private/tmp/auth-dev-startup.log、/private/tmp/account-dev-smoke.log（Auth 成功，随后测试导航中断）、/private/tmp/work-dev-smoke.log（修复后 Work 成功）、/private/tmp/dev-account-regression.log。旧预览数据库未删除。


## PR 最终收尾（2026-11-10）

Auth 已提交 [PR #5](https://github.com/molis-ai/auth/pull/5)，来源提交 `1d46e860`；合同原文 SHA-256 逐项一致，Work 来源记录已改为已提交合同。Auth `npm test` 全套为合同 8、Rust 16、Worker 114、Web 2、SDK 3，通过；真实 Chrome/WASM/D1 20 轮 A/B 登录退出、跨标签及草稿隔离通过；GitHub Auth build and tests 通过。证据 `/private/tmp/auth-pr-final-tests.log`、`/private/tmp/auth-pr-final-browser.log`。

Work 合入主线 `07840084`，保留双方页面词典、安装登录夹具和产品子集新增项。15 个账号定向文件首次通过，缓存隔离用例复测证实双标签退出后同时自动登录会互相覆盖 Cookie，未作为单纯时序失败忽略：浏览器入口和退出现在共用 Web Lock，Host 拒绝并发匿名入口时不发替换 Cookie；不允许另一个浏览器借用原登录尝试。强化 WUA-32 断言两个标签最终登录 URL 一致，连续 5 次通过，personal-http 11 项通过。证据 `/private/tmp/work-cache-multi-diagnosis.log`、`/private/tmp/work-pr-cache-fixed.log`。

真实 Auth 的 central-account、authentication、provider、installation、management、tenants、billing、rapid-cycle、high、medium 十组专项全部通过，覆盖模拟第三方登录、资料/身份管理、租户/席位、异常恢复与退出后重登；日志前缀 `/private/tmp/work-pr-integration-`。邮箱旧用例改为断言普通用户解绑邮箱返回 403 且方法列表不变，手机号仍覆盖换绑和证明隔离。共用 mock-auth 夹具补齐现行必填 `email:null`；不放宽合同。

账号浏览器产物启用 esbuild 语法压缩，收回合入主线后的资源增长；不增加资源许可。最终整体构建、健康门禁、边界、页面资源和快速切换复验日志前缀 `/private/tmp/work-pr-cookie-`。最终全量及所对应提交由 Work PR 的 full-suite 运行记录给出；本地定向不能替代全量。

Work [PR #2013](https://github.com/molis-ai/molis-work/pull/2013) 首轮 CI 指出 `account.profile.update@1` 的输出快照尚未同步 `UserView.email`。已通过 `pnpm actions:update` 更新唯一变化行，合同快照测试 25 项通过。按上线前阶段一保留动作版本；输入、权限及受众不变，返回 UserView 增加可空邮箱，仓库内消费者与 Auth 同步；Manifest、MCP 名称和工作流绑定不变。首轮全量因这项确定性遗漏主动取消，不计为通过，修复提交重新触发最终全量。

最终 CI 第二轮发现两项：返回路径安全测试仍按未分区物理键找缓存；加载几何测试在 820px 宽度真实回归。前者统一更新六个浏览器用例，按 Storage.key 的逻辑键枚举（在包装安装之前拦截 CacheStorage 的夹具则识别物理分区键），保留原隔离与拒绝断言。后者在干净主线 07840084 上同文件两项通过，候选失败，根因是目录首屏脚本未读账号分区布局；现与运行期共用 accountCachePrefix，避免加载后目录再次展开。

修复后原始 load-geometry 两项及其余七个浏览器文件共 32 项全部通过（`/private/tmp/work-pr-final-fixes-tests.log`）；主线对比 `/private/tmp/account-pr-baseline-geometry.log`，候选失败 `/private/tmp/work-pr-load-geometry.log`。最终合并重复缓存拒绝表达式后缓存隔离再验通过。健康门禁通过，无新增豁免。资源对干净主线实测 52 项通过：workbench.js +6,718、plugin-frame.js +3,247，均低于原许可，未增加预算；`--base-sizes` 日志中的 fixture 为同一干净主线实际构建的测量值。第二轮全量失败后其余分片取消，不计通过；修复推送后重新跑全量。

### 合并前完整回归收尾（2026-11-11）

常规 CI 在 `49d0ac4de`、`3b0cf2d2e` 均通过；完整集成回归 `42881985536` 跑完 32 分片，31 通过、27 分片的 Frame 用例失败，未视为全绿。首屏单测补齐 querySelector 与账号分区夹具，7 项通过；助理发送测试原先在请求发出即断言成功效果，受控 200ms 响应延迟复现，等待既有 sending 状态结束后 3 项通过，保留文字清空与无新轮次断言。

Frame 根因：缓存写入已分区，但原生 storage 事件仍暴露物理键。公共缓存 owner 现在将本 scope 的原生事件转为逻辑键，阻断其他 scope 与撤销后的事件，保留原生 isTrusted。夹具的独立原生 Window 写正确物理分区；Frame 3 项通过，WUA-32 真实同源 Window 事件隔离及退出实际清理通过。构建过程中还复现字符串池把 return 与变量名粘连的问题，替换时保留词法分隔，新增 minified return/typeof 回归；构建工具 2 项通过。

日志：`/private/tmp/work-pr-storage-events-tests2.log`（Frame 通过；新其他账号夹具首次未纳入既有保留分区，随后修正）、`/private/tmp/work-pr-storage-events-isolation-final.log`（最终 WUA-32 通过）、`/private/tmp/work-pr-storage-events-health.log`（健康通过）。资源增量许可新增 84+188=272 字节，用户 2026-11-11 明确批准；最新完整 CI 仍须按最终提交核验。

### 2026-11-11 主线集成后的最终检查

- 合入主线 f1e618f3a 的提交 2ac7348df，CI Full 42958594708 的 32 分片和汇总全部通过。常规 CI 的 macOS 原生检查第一次发生 foreign exception/SIGABRT，无断言失败；原提交原代码重跑通过。
- 主线集成改变压缩结果，workbench 资源比许可多 39 字节。将 accountTransition 内部两处锁定调用复用同一局部 lock 函数，公开 lock 方法与 prepare/invalidate 使用同一实现，不改锁定、草稿、撤销和清理顺序。
- 整体构建后对照 f1e618f3a 的 CI 实测产物（artifact 13825848326）：53 个资源，workbench +6,846 字节（许可 6,878），plugin-frame +3,371 字节（许可 3,446），无新增资源，不增加许可。
- 配套 Auth PR #5 已在全部检查通过后合并，合并提交 21b60baea72b7912c4af2602daf70ef251192b2f。Work 最终提交的全量/CI 结果以 PR #2013 的检查清单和链接记录为准。
- 局部 lock 复用后，账号菜单 5 项、缓存隔离 1 项通过，健康门禁与密钥扫描通过。主线新加入的 RAC-2516/RAC-2518 原生拖拽本机连续失败（dragend 超时 / 未截获原生拖拽），其余 Frame 两项均通过；正在独立干净主线比对，失败未计为通过。

### 2026-11-11 合并后：外部链接首次登录 403（WAS-11）

- 用户 Chrome 从外部打开 4207，首次导航实际携带 `Sec-Fetch-Site: cross-site`。WebSessions 正确拒绝跨站签发，但原安装入口仍渲染空页面证明并自动调用登录，导致会话读取和登录请求 403。
- 根安装入口对跨站顶层 GET document 返回无凭据、无账号操作的同源导航文档，后续同源导航按原规则签发 cookie 与 CSRF 证明。跨站 API、iframe、Origin、账号 nonce/绑定与旧凭据拒绝不变；不修改 WebSessions 签发规则。
- 实际用户 Chrome 已使用 dev 测试账号进入工作台。33 项定向测试通过：personal-http 11、account-host 安全 17、web-sessions 安全 5。新增 HTTP 断言确认首跳无 Set-Cookie/页面证明/账号请求且跨站写入 403。
- `scripts/account-rapid-cycle.test.mjs` 新增 localhost 外部页面到 127.0.0.1 的真实超链接，断言浏览器实际发送 cross-site 首跳且无凭据签发；1 轮登录/换号/退出 + 1 轮换号中退出共 6 动作通过，保留双账号隔离、旧 cookie/token 拒绝和准备状态恢复断言。首次测试驱动遗漏等待导航，出现 context destroyed；补齐导航事件等待后通过，未放宽断言。
- 临时布尔诊断已从构建产物移除；没有记录密码或凭据。仅相关回归，未重新跑全量；补丁在本地修复分支，尚未提交 PR。
