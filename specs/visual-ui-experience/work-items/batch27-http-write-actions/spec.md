# 第 27 批 B9：引导、审批、助理三组 HTTP 写入改成动作

状态：已实施，第 27 批主会话 2026-11-11 写稿并按稿实施，三组写入都已改成动作；实施时与初稿不同的地方写在文末「实施记录」。

## 目标与边界

用户 2026-11-01 定（[审查台账 B9](../../../../docs/reviews/adversarial-review-2026-11-01.md)）：只走 HTTP 的写入先逐条登记进 [CALL-CHAINS §10.1.1](../../../../docs/system/CALL-CHAINS.md#1011-b9-接入记录)，再逐组改成动作；新写入一律走动作。首页一组已经走现行动作（§10.1 末），本稿管其余三组：首次引导的整理旅程、Agent 审批、助理面板。插件创作台一组属于用户批过的构建期例外（BL-377 重做），不在本批。

改完以后，这三组的每个 POST 都是动作目录里登记过的一个动作：有输入 schema、受众、调用记录、取消信号，同一条授权与派发路径。HTTP 只剩传输：读请求、把路径里的标识与请求体交给动作、把结果写回（含现有的「画好再给页面」）。HTTP 只剩传输：读请求、把路径里的标识与请求体交给动作、把结果写回（含现有的「画好再给页面」）。GET 照旧是 HTTP 读取：它们读时做的恢复与结算已在 §10.1.1 逐条登记，归各自主人，不是本人的新决定，本稿不改。

## 入口门：只有本人从这扇页面门进来才算

这三组都是本人在受保护页面上的操作。今天它们靠 HTTP 本身不是能力来防 Agent、MCP 和插件（`agent-review-http.ts` 开头写明「审批不是能力，插件够不到」）。改成动作后，这一条由入口门守住，做法与设置页的四扇门相同（`plugin-consent-settings-entry.ts`，S-94）：

- `apps/local-host/src/web-entry-actions.ts` 的 `webEntryDoor(scope, refusal)`：HTTP 适配器每次请求签发一个冻结的 `user_action`（审计定位沿用 `entryUserAction`，消息号取请求的一次性键），登记在门自己的 `WeakMap` 里，值是这次请求的入口数据（项目、请求的页面授权、宿主端口、原文件的请求流），请求结束即撤销。调用以本人身份、按动作的确切身份发出（`allowed_actions` 只有这一个动作），`user_action` 由入口给，不从输入读。
- 处理器第一步由 `door.define` 包好（处理器忘不掉）：受众必须是 `user`、操作者是本机本人、没有 `host_plugin` 与 `delegated_by`，且 `user_action` 正是这扇门在这次请求里签发的、项目与签发时相同。不是的一律 `actions.forbidden`。所以动作虽然在目录里，Agent、MCP、工作流、插件、别的页面门都调不动它。
- 宿主排队快照调用者时，门签发的 `user_action` 保持原对象（`snapshotHostUserAction` 认门的登记），复制品拿不到门的资格。
- 受众只写 `user`；不为 Agent 开放，不进助理的能力清单。

入口数据带宿主端口，是因为这几组的主人服务按项目、按进程装配（审批在转发进程里没有桌面，助理按 Home 装配一份）。动作的定义与授权由动作服务管，处理器从门拿到的只是今天 HTTP 已经在用的同一组端口。

## 共同取舍

- 每组一个 `system` 提供方，挂进宿主平台提供方清单（`project-host.ts` 的 `registerHostPlatformProviders`），不新增 `registerProvider(` 调用。
- 都写 `scheduling: "concurrent"`：其中有等模型（助理发送、引导整理），也有在处理器里再调别的动作（助理运行操作卡），放进项目队列会互等。今天 HTTP 也不排队，语义不变。
- 输入 schema 写成字面量，处理器输入由 `defineAction` 推导，不写 `as`。路径里的标识写成有界的字符串，请求体是一个对象：体里每个字段的检查与消息原本就由主人服务做（`selectContextSources`、`checkSendRequest`、审批的 400 检查等），照旧由它们做，不在 schema 里再写一份会走样的规则，原来的错误文字与码不变。
- 输出 schema 宽松（对象），结果照旧由 HTTP 画成页面要的样子；调用记录本来就不存输入与结果，大附件和长正文不进日志。
- 处理器调用的就是今天 HTTP 调用的那个主人方法，参数相同；本稿不改任何主人的行为。

## 三组的动作

**引导**（提供方 `system.onboarding`，作用域 home）。`onboarding.context.create`、`select`、`start`、`reopen`、`draft`、`adopt` 各对应一个 POST，输入是旅程标识加原请求体。上传原文件 `onboarding.context.stage_file`：字节仍从请求流式写进暂存、不限大小，请求流是入口数据，跟着凭据交给处理器，动作输入只有旅程与文件名；处理器先核这一轮还在挑选阶段，再按内容摘要存下（与原来一次读完、同一个函数）。

**审批**（提供方 `system.agent-reviews`，作用域 home：无项目的入口用个人空间的主人，项目页的入口由处理器按原规则核对归属，项目从入口数据来）。`agent.reviews.decide` 与 `agent.reviews.recover`。项目归属、插件页面的页面授权核对（`pluginPageRequest(...).assertCurrent()`）、桌面持有轮次的「自己不能马上批准自己」等待期都留在处理器里，入口数据带着今天的那组端口；HTTP 的状态码与错误体（404、409、`computer.self_approval`）不变。

**助理**（提供方 `system.assistant-panel`，作用域 home，新工作的项目照旧取页面的项目）。§10.1.1 表里每个 POST 一个动作，命名 `assistant.panel.<路径>`，如 `assistant.panel.send`、`assistant.panel.works.control`、`assistant.panel.works.cards.run`。已经走动作的（`assistant.threads.*`、连接卡的 `connectors.authorization.*`）不变。两条记忆建议（`memory-candidates/<id>/accept|discard`）不另起：改走现有的 `memory.candidates.accept` 与 `discard`，面板读到的建议带上 `version`，处理时作为 `expected_version` 送回，建议在这之间被改过就按 Memory 的规则拒绝，不覆盖。

## 证据

- 门的拒绝：新的安全不变量 [S-page-entry-actions](../../../../docs/system/security-invariants/S-page-entry-actions.md)，`tests/security-invariants-page-entry-actions.test.ts` 对三组的每个动作断言：Agent、MCP、工作流、插件看不到；没有凭据、手写或冻结的复制品、代表他人、别的门的凭据、请求结束后的同一个对象都被 `actions.forbidden` 拒绝，处理器一次也没跑。
- 动作合同快照（`pnpm actions:update`）新增三组的行，PR 写明对调用方的影响：没有新的 Agent、MCP 或工作流调用方，页面路径不变。
- 现有的引导、审批、助理用例照跑，作为「行为不变」的证据。

## 实施记录

- 2026-11-11（第 27 批主会话）：三组按稿实施，分支 `b27/b9-actions` 合进 `batch/27`。
- 与初稿不同：① 门的调用不经 `bindLocalWebActions` 推算本人的整份目录，而是按动作确切身份发一次调用（与 `invokeLocalWebCatalogAction` 同法）：门的动作都是宿主自己的、不要权限，推算整份目录每个请求要几十次检查，助理面板写草稿这种高频写入不该付这个代价；页面会话的检查照旧每次都做。② 原文件不经 `original_file` 先落临时文件，请求流直接作入口数据交给处理器，省掉一遍摘要重读。③ 审批的作用域是 home（初稿写 project）：无项目的入口用个人空间的主人，不是真实项目。④ 助理的动作前缀用 `assistant.panel.`，与面板这扇门同名。
- 页面只改了一处：助理面板处理记忆建议时带上看到的版本（`apps/workbench/src/scripts/client/assistant-island.ts`）；`AssistantMemoryCandidate` 加了 `version`（公开 API 快照随之刷新）。
- 页面资源：`tooling/gates/page-asset-allowances/batch-27.json` 的 reason 写「12,000 bytes」，实测这段页面资源是 13,907 bytes；allowance 已按 adopted 处理，`page-assets:check` 不允许改它，所以偏差记在这里，下一次页面资源收紧时以实测为准。不要为了改这句话去动 adopted allowance。
- 取消信号：三组 HTTP 适配器都为每个 POST 从 response close 取一个 `AbortSignal` 并随动作传入；门在入口和每次授权复查时同步 `throwIfAborted`。助理 `send`、`works.answer`、`cards.redo`、`works.archive` 在 `beforeEffect`/最终检查前检查它，审批 `decide`/`recover` 在写前检查；其余处理器是同步写或只读，入口检查已经足够。引导的 `stage_file` 以请求流为入口，流断即结束；`start` 只启动后台作业，后台有独立授权。这样页面在等模型或外部服务时关闭，不会把回答、卡片或归档留到没有页面的地方。
