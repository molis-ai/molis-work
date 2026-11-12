# 第 27 批 B9：引导、审批、助理三组 HTTP 写入改成动作

状态：设计稿，第 27 批主会话 2026-11-11 写；按本稿逐组实施，实施记录写在文末。

## 目标与边界

用户 2026-11-01 定（[审查台账 B9](../../../../docs/reviews/adversarial-review-2026-11-01.md)）：只走 HTTP 的写入先逐条登记进 [CALL-CHAINS §10.1.1](../../../../docs/system/CALL-CHAINS.md#1011-b9-接入前登记)，再逐组改成动作；新写入一律走动作。首页一组已经走现行动作（§10.1 末），本稿管其余三组：首次引导的整理旅程、Agent 审批、助理面板。插件创作台一组属于用户批过的构建期例外（BL-377 重做），不在本批。

改完以后，这三组的每个 POST 都是动作目录里登记过的一个动作：有输入 schema、受众、调用记录、取消信号，同一条授权与派发路径。HTTP 只剩传输：读请求、把路径里的标识与请求体交给动作、把结果写回（含现有的「画好再给页面」）。GET 照旧是 HTTP 读取：它们读时做的恢复与结算已在 §10.1.1 逐条登记，归各自主人，不是本人的新决定，本稿不改。

## 入口门：只有本人从这扇页面门进来才算

这三组都是本人在受保护页面上的操作。今天它们靠 HTTP 本身不是能力来防 Agent、MCP 和插件（`agent-review-http.ts` 开头写明「审批不是能力，插件够不到」）。改成动作后，这一条由入口门守住，做法与设置页的四扇门相同（`plugin-consent-settings-entry.ts`，S-94）：

- `apps/local-host/src/web-entry-actions.ts` 的 `webEntryDoor(name)`：HTTP 适配器每次请求签发一个冻结的 `user_action`，登记在门自己的 `WeakMap` 里，值是这次请求的入口数据（项目、请求的页面授权、宿主端口）。调用经 `bindLocalWebActions` 以本人身份发出，`user_action` 由入口给，不从输入读。
- 处理器第一步 `door.entry(caller)`：受众必须是 `user`、操作者是本机本人、没有 `host_plugin` 与 `delegated_by`，且 `user_action` 正是这扇门签发的。不是的一律 `actions.forbidden`。所以动作虽然在目录里，Agent、MCP、工作流、插件、别的页面门都调不动它。
- 宿主排队快照调用者时，门签发的 `user_action` 保持原对象（`snapshotHostUserAction` 认门的登记），复制品拿不到门的资格。
- 受众只写 `user`；不为 Agent 开放，不进助理的能力清单。

入口数据带宿主端口，是因为这几组的主人服务按项目、按进程装配（审批在转发进程里没有桌面，助理按 Home 装配一份）。动作的定义与授权由动作服务管，处理器从门拿到的只是今天 HTTP 已经在用的同一组端口。

## 共同取舍

- 每组一个 `system` 提供方，挂进宿主平台提供方清单（`project-host.ts` 的 `registerHostPlatformProviders`），不新增 `registerProvider(` 调用。
- 都写 `scheduling: "concurrent"`：其中有等模型（助理发送、引导整理），也有在处理器里再调别的动作（助理运行操作卡），放进项目队列会互等。今天 HTTP 也不排队，语义不变。
- 输入 schema 写成字面量，处理器输入由 `defineAction` 推导，不写 `as`。schema 只收今天页面真的会发的字段与形状；字段之间的关系与消息照旧由主人服务检查，原来的错误文字与码不变。
- 输出 schema 宽松（对象），结果照旧由 HTTP 画成页面要的样子；调用记录本来就不存输入与结果，大附件和长正文不进日志。
- 处理器调用的就是今天 HTTP 调用的那个主人方法，参数相同；本稿不改任何主人的行为。

## 三组的动作

**引导**（提供方 `io.molis.work.onboarding`，作用域 home）。`onboarding.context.create`、`select`、`start`、`reopen`、`draft`、`adopt` 各对应一个 POST，输入是旅程标识加原请求体。上传原文件 `onboarding.context.stage_file` 例外：字节仍走流式传输，HTTP 先只读核对这一轮还在挑选阶段，再把请求体流进这一轮暂存目录下的请求临时文件，然后以 `original_file`（宿主收到的文件，主人是本提供方）调用动作；动作再核一次阶段，按内容摘要把文件移进暂存。不限大小照旧；代价是摘要要再读一遍文件。

**审批**（提供方 `io.molis.work.agent-reviews`，作用域 project）。`agent.reviews.decide` 与 `agent.reviews.recover`。项目归属、插件页面的页面授权核对（`pluginPageRequest(...).assertCurrent()`）、桌面持有轮次的「自己不能马上批准自己」等待期都留在处理器里，入口数据带着今天的那组端口；HTTP 的状态码与错误体（404、409、`computer.self_approval`）不变。

**助理**（提供方 `io.molis.work.assistant.page`，作用域 home）。§10.1.1 表里每个 POST 一个动作，命名 `assistant.page.<路径>`，如 `assistant.page.send`、`assistant.page.works.control`、`assistant.page.works.cards.run`。已经走动作的（`assistant.threads.*`、连接卡的 `connectors.authorization.*`）不变。两条记忆建议（`memory-candidates/<id>/accept|discard`）不另起：改走现有的 `memory.candidates.accept` 与 `discard`，页面把所见版本带上（读取接口已经回它）。

## 证据

- 门的拒绝：新的安全不变量（登记进 `docs/system/SECURITY-INVARIANTS.md`），每组至少一个用例：同一个动作从 Agent、MCP、别的门、复制的 `user_action` 调用都被 `actions.forbidden` 拒绝，原主人的数据不变。
- 动作合同快照（`pnpm actions:update`）新增三组的行，PR 写明对调用方的影响：没有新的 Agent、MCP 或工作流调用方，页面路径不变。
- 现有的引导、审批、助理用例照跑，作为「行为不变」的证据。
