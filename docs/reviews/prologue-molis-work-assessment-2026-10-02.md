# Prologue 更新与 Molis Work 接入评估

评估完成，2026-10-02。本文逐项列出当前问题、升级适配和交互优化建议；建议尚未实施。

推荐顺序：先处理预算、授权、状态、工具副作用与回执保护，再推进模型控制、真实变更和流式交互，最后接通 Coding 子代理与助理 Work 委托的续做闭环。共用 Runtime、Action 权限、审查和恢复链继续沿用。

## 评估依据

- Molis Work 快照：`/Users/yijunwang/code/goalboard`，`main@3b038660`。Prologue 快照：`/Users/yijunwang/code/prologue`，`main@3f9d5ff6`。评估基于本地代码、公开合同、对应文档、定向测试和隔离探针。
- Molis Work 声明、锁定并实际安装的是 `@prologue/sdk@0.0.0-rc.1` 的 `prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz`，构建来源为 `9fc3b173`。Prologue 主线也标为 `0.0.0-rc.1`，因此应比较构建来源与提交，不能只比较版本号。[依赖声明](/Users/yijunwang/code/goalboard/horizontal/agent-host/package.json:29)、[构建来源](/Users/yijunwang/code/goalboard/vendor/prologue-sdk/README.md:3)、[主线包](/Users/yijunwang/code/prologue/packages/sdk/package.json:3)。
- 比较范围是 `9fc3b173..3f9d5ff6`。相关更新包括推理力度、模型切换、微压缩、只读工具提前执行、逐轮变更、写后诊断、子任务回灌与让出、休眠、App 会话条目、记忆边界、密钥扫描、副本血缘、租约排队、Host 代理/CA、审计导出和点名扩权。主要功能来自 `62e2a44e` 及后续提交，`3f9d5ff6` 主要整理架构与存量实现。
- Prologue 根 README 仍有早期状态描述；能力判断以现役实现和公开合同为准。部分公开积木标为 experimental，导出名存在不等于稳定产品承诺。[公开面说明](/Users/yijunwang/code/prologue/packages/sdk/README.md:11)。

## 需要保留的现有能力与边界

- Pages、灵光、Form/Dataset、Alchemist 等生成经 `hostTextGeneration/hostCompleteText → Agent Host inference → 同一 Runtime 的临时 Session/Run`。插件拥有材料、提示词和业务校验；Host 负责模型、权限与凭据。已有原图输入、结构校验、进度和真实用量端口。[共用推理](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-inference.ts:6)。
- Coding 与 Characters 已有冻结角色、工具、模型和授权目录，以及暂停、继续、停止、取消、追加要求、问题回答、检查点、子任务和恢复；文件、命令和动作沿现有审查链执行。[Coding 角色](/Users/yijunwang/code/goalboard/plugins/native/coding/src/roles.ts:41)。
- 系统助理已使用无代码目录的 App 模式和共同动作网关；侧栏界面归属会话。个人/项目记忆已有候选、保存与撤销规则。Schedule 和插件创作台也借用同一 Agent Host/Runtime，并保留各自的沙箱、检查器及业务流程。[助理角色](/Users/yijunwang/code/goalboard/apps/local-host/src/assistant/assistant-agent.ts:77)、[Home 装配](/Users/yijunwang/code/goalboard/apps/local-host/src/agent-host-composition.ts:109)。
- Goals 拥有目标、约定和显式完成；插件拥有业务对象与成果；Prologue 拥有执行状态与回执。Run 完成、子任务完成和文件写入都不能替代 Goal 验收。模型调用继续只经 `horizontal/agent-host`，一个 Home 只有一个执行进程。[AI 手册](/Users/yijunwang/code/goalboard/docs/platform/PROLOGUE-AI.md:9)。

## 逐项结论与建议

### 1. 修正思考模式覆盖输出预算的问题

**当前缺陷，已复现。** `prologue-node.ts` 先将 `budget.max_output_tokens` 放入 `start.params`，随后思考配置整体覆盖 `params`，将上限改成 `THINKING_OUTPUT_TOKENS = 32768`。[实际组参](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-node.ts:1427)。

生产 adapter、真实 Node Host 和本机 HTTP 替身的结果是：冻结记录为 `{max_turns: 1, max_output_tokens: 7}`，实际请求为 `max_tokens: 32768`；请求一次，Run 完成。证实的是请求上限偏离约定，未测真实供应商消耗。

建议显式预算优先，未指定时才采用思考默认值；模型或协议不支持组合时，在派出前明确拒绝。成本小到中，收益是让用户设置的限制真正生效。验证思考开关、显式/默认预算及不兼容组合的实际请求体。

### 2. 把动作授权检查贯穿每次模型派出

**当前缺陷，四条路径均已复现。** 灵光对话、Form 加题、Dataset 加列、PPT 大纲只传 `signal`，模型返回后才调用 `caller.beforeEffect()`；Pages、Workflows、Jelly 已传 `beforeDispatch`。撤权不会必然 abort 原调用，MCP 在检查回调中重新读取授权，因此等待推理服务期间撤权后仍可能外发材料。[灵光](/Users/yijunwang/code/goalboard/plugins/native/lingguang/src/actions.ts:126)、[Form](/Users/yijunwang/code/goalboard/plugins/native/form/src/actions.ts:83)、[Dataset](/Users/yijunwang/code/goalboard/plugins/native/dataset/src/actions.ts:78)、[PPT](/Users/yijunwang/code/goalboard/plugins/native/ppt/src/actions.ts:134)、[派出检查](/Users/yijunwang/code/goalboard/apps/local-host/src/host-complete-text.ts:139)、[MCP 授权](/Users/yijunwang/code/goalboard/apps/local-host/src/mcp-action-client.ts:14)。

隔离探针沿生产 Action、插件 handler、Host completion、当前 SDK/Node Host 到本机 HTTP，在推理服务等待期间撤销 `validate_authority` 后释放等待。四条路径各请求 **1 次**，最终均为 `fixture.revoked`；灵光保存消息 **0 条**，其余业务对象均未改变。

建议传入原动作的派出前检查，同时保留返回后的授权和原版本检查。成本小到中，收益是撤权能阻止后续模型请求。验证等待期间撤权、停用和取消后零派出且不保存业务结果；“不落库”不能单独证明授权正确。

### 3. 适配新状态与事件，保留等待和完成的区别

**升级差距，类型和投影预检已确认。** 将 Agent Host 的 SDK 类型临时指向主线 `dist`，得到 `TS2322`：新增 `sleeping` 不能赋给当前 `PrologueControlState`。生产投影收到 `turn-changes`、`model-switched` 时只增加 `unknown_frames`；收到 `completed{yielded}` 时直接呈现 `completed`，没有保留让出信息。[状态投影](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-stream.ts:26)、[产品状态](/Users/yijunwang/code/goalboard/packages/contracts/src/services/agent-host.ts:90)、[事件投影](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-stream.ts:527)、[SDK 状态](/Users/yijunwang/code/prologue/packages/sdk/src/agent/core/control.ts:10)、[SDK 事件](/Users/yijunwang/code/prologue/packages/sdk/src/model/core/types.ts:203)。

建议同步 Contract、状态投影、历史回放、页面和终态清理，使休眠、等子任务与实际完成有明确语义；未接通的续做路径先明确拒绝。成本中，是 SDK 升级的共同前置。当前旧包尚未产生这些事件，预检不代表已经换包；实施后需通过类型、构建、历史兼容和消费者状态回归。

### 4. 按真实副作用分类工具，再启用只读提前执行

**当前分类问题，升级后的执行风险已复现。** `suggest-action`、委托 start/follow/stop、记忆 remember/forget/propose 都被标为 `safe-read`，实际会保存提议、改变 Work 或记忆。主线 SDK 按该标签在模型响应流结束前启动工具。[注册分类](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-action-gateway.ts:207)、[记忆实现](/Users/yijunwang/code/goalboard/apps/local-host/src/assistant/assistant-service.ts:2450)、[提前执行判据](/Users/yijunwang/code/prologue/packages/sdk/src/agent/core/loop-model-call.ts:155)。

生产 gateway、主线 Runtime、真实 Node Host 和本机 SSE 探针只发送 `forget-memory` 的完整 tool block，保持响应流打开，夹具记忆端口已执行磁盘删除记录；随后取消，Run 为 `cancelled`。证实修改会被提前派出，未证明取消后发生新写入，未删除真实平台记忆。

建议纠正工具标签，并核对 `prologueActionTools` 的 `operation` 与实际 `actionEffect`；沿用现有用户授权策略。仅明确无副作用的 find/read/check 等读取提前执行。成本中，依赖新 SDK。验证响应流结束前的执行时机、取消和审查归属；真实延迟收益仍需测量。[提前执行合同](/Users/yijunwang/code/prologue/docs/slices/agent-streaming-tools.md:7)。

### 5. 保护修改回执和工作事实，再启用微压缩

**升级风险，模型可见事实丢失已复现。** 主线微压缩只判断 tool-result、大小、轮次及 preserve/retained，普通 `toolResultRecord` 不自动保护修改回执。较早的大回执可能被替换成 `call it again if you need it`，丢掉对象 ID、版本或“结果未知，不要重试”等内容。[压缩判据](/Users/yijunwang/code/prologue/packages/sdk/src/context/core/compaction.ts:494)、[观察记录](/Users/yijunwang/code/prologue/packages/sdk/src/agent/core/compaction-history.ts:575)。

生产 gateway、主线 Agent 循环和本机 HTTP 探针先修改一次，再做五批读取，最后回答：共 **7 次请求、1 次修改**。最终模型请求丢失对象 ID 和禁止重试说明，出现“再调用”标记；Session 磁盘仍保留完整回执。未观察到重复修改，重复副作用属于待防止的风险。

建议 SDK 按副作用保留不可重放回执、未知结果及关键事实；没有有效保护入口时，先用现有配置保持微压缩不收缩。再与 Molis 已有原文选段机制组合，保留用户要求、纠正、拒绝、对象版本、已发生操作和未完成工作。现有助理整理阈值为 48,000 tokens，平台记忆也已有选择及注入回执。[整理要求](/Users/yijunwang/code/goalboard/apps/local-host/src/assistant/assistant-agent.ts:53)、[原文整理](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-compaction.ts:40)、[配置](/Users/yijunwang/code/prologue/packages/sdk/src/composition/core/config.ts:282)。

成本中，回执保护可能需 SDK 配合。验证压缩后关键事实仍可用、一般材料能按引用重读、取回操作回执无需重做操作。主线压缩发生在请求投影，整理阈值和窗口检查仍按完整 history；须分别测请求大小、整理次数和任务质量，不能直接承诺整理调用会减少。[发出前检查](/Users/yijunwang/code/prologue/packages/sdk/src/agent/core/loop-model-call.ts:86)、[请求投影](/Users/yijunwang/code/prologue/packages/sdk/src/agent/core/loop-model-call.ts:264)。

### 6. 按任务选择推理力度，并回显实际生效选项

**交互机会。** Prologue 新增 `reasoningEffort`；当前 Agent 主要使用 provider 的 thinking 开关，单次文字端口没有 thinking 字段，创作台也自行选择输出限制。[模型映射](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/model-configuration.ts:76)、[单次端口](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/inference.ts:19)、[创作台组参](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/plugin-builder.ts:174)。

建议在工作输入区按支持情况提供“快速/平衡/深入”等任务选项，明确哪些调用适用，并回显实际生效值。成本中，需要模型元数据、共用配置和预算约束。接口差异不必全部消除，短生成是否需要思考应按场景选择。验证供应商实际接受的档位、费用、质量和延迟；字段支持不等于所有模型都支持。

### 7. 接入运行中换模型，同时处理窗口、参数、凭据和整理策略

**交互机会，边界已从源码确认。** `switchModel` 可改后续调用目标；当前 Coding 的模型选择只作用于下一轮。SDK 切换不会修改已冻结的力度和参数，上下文窗口及 Molis 整理连接仍沿用原设置。[切换合同](/Users/yijunwang/code/prologue/docs/slices/agent-model-switch.md:7)、[原窗口](/Users/yijunwang/code/prologue/packages/sdk/src/agent/core/loop-state.ts:260)、[整理连接](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-node.ts:1417)。

建议允许用户在同一工作遇到难点时换更合适的模型，保留已有工具结果与权限，明确显示“已请求切换/下一次调用生效”。换较小窗口、换凭据或跨协议时，派出前验证兼容性；整理阶段的模型也要有明确策略。成本中，需要共用控制口、凭据解析、事件投影、用量归属与恢复。

验证两个本机模型服务之间的切换边界、不兼容时零误派出、凭据和用量归属、总预算及工具权限不扩大，再用真实模型验证体验。界面按轮次设置力度，不能承诺 `switchModel` 会同步改变本轮已冻结力度。

### 8. 在工作时间线展示真实的逐轮变更

**交互机会。** Prologue 新增 `turn-changes`；Molis 已有工具活动、Diff、报告和检查，但没有逐轮变更事实投影。[逐轮变更](/Users/yijunwang/code/prologue/packages/sdk/src/model/core/types.ts:203)。

建议在现有时间线显示“本轮已改 2 个文件”，点击进入已有 Diff/检查点，连接成果与审查。成本中，依赖第 3 项事件适配。验证显示内容与实际写入回执一致，恢复及历史回放保留事实；命令和插件对象变化继续消费各自回执。

### 9. 让写后诊断及时回到模型和用户面前

**功能机会。** Prologue 已支持写后诊断，SDK 本身不带 LSP；Molis 已有检查器。[诊断合同](/Users/yijunwang/code/prologue/docs/slices/coding-diagnose-after-write.md:7)。

建议先接已有检查器，让写入观察带回局部诊断，并在时间线显示“检查未过”，帮助模型在继续工作前修正。成本中，需要诊断执行器和范围约束。验证检查对应实际修改、失败可读、取消后不提交新结果，并测量额外等待是否值得。

### 10. 把文字增量、停止和错误接成完整用户路径

**现有能力利用不足，不依赖新 SDK。** 共用 inference 已有开始、文字增量及用量事件；部分页面仍只等最终文字。Action 的 `on_progress` 只有 stage/progress，灵光 NDJSON 仅开放材料与来源读取，对话仍等完整 JSON，聊天提交没有对应的请求取消控制器。[进度端口](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-inference.ts:47)、[Action 合同](/Users/yijunwang/code/goalboard/packages/contracts/src/platform/actions.ts:81)、[流式路由](/Users/yijunwang/code/goalboard/apps/local-host/src/lingguang-native-plugin-http.ts:10)、[聊天提交](/Users/yijunwang/code/goalboard/plugins/native/lingguang/src/client.ts:584)。

建议先选 Pages 写作或灵光对话，完成“生产事件 → 可信传输 → 增量预览 → 停止/断连 → 最终提交”，复用现有传输。成本中。增量作为预览，最终领域校验、原版本和 `beforeEffect` 检查通过后才提交。用浏览器验证成功、失败、取消、断连和冲突，不能仅以接入回调作为完成证据。

### 11. 让结构化生成使用已有结构合同

**现有能力利用不足。** Alchemist 已有 `jsonSchema`，当前写入提示词后再解码、业务 parse；共用端口已支持 `structured`。[现有消费](/Users/yijunwang/code/goalboard/apps/local-host/src/alchemist-prologue.ts:32)、[结构端口](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/inference.ts:23)。

建议从简单且 SDK 支持的 schema 开始使用 `local`，或供应商明确支持的 `native`，提前发现格式错误，继续保留插件领域校验。成本小到中。验证格式错误、领域错误和部分有效结果；任意 Zod/JSON Schema 不能直接强转，local 校验不等于供应商保证，也不自动增加付费重试。

### 12. 复用变化等待口，减少重复快照读取

**现有实现优化机会。** 助理活动时每 1,200ms 读取整个工作，Schedule 每 400ms 读 Run；`agent.run.wait.v1` 已按订阅等待变化并在 40ms 内合并，Coding 也已有 live wait。[助理刷新](/Users/yijunwang/code/goalboard/apps/workbench/src/scripts/client/assistant-island.ts:1884)、[Schedule](/Users/yijunwang/code/goalboard/apps/local-host/src/schedule-task-runner.ts:14)、[等待口](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/capability-registration.ts:220)。

建议复用等待口，根据实际变化更新局部内容；加入模型、变更和让出投影后，同步扩充 `runViewVersion` 的观察字段。成本小到中。测量 CPU、响应体积和首个变化延迟，并验证新事件会唤醒页面，无需另建全局推送框架。

### 13. 接通 Coding 子代理回报、让出与原工作续做

**长任务机会，接线缺口已确认。** 主线 SDK 能回灌子任务结果，并在原 Session 启动新父 Run。Molis 目前有 `onStarted` 子任务桥，没有父 Run 的 `onWake` 桥；现有 `completed` 会释放动作控制器、结清部分消息并通知完成。SDK 的 `onWake` 在新 Run 已启动后通知，无法单独承担派出前检查。[子任务续做](/Users/yijunwang/code/prologue/packages/sdk/src/composition/core/agent-run-collaborators.ts:202)、[现有桥](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-node.ts:1362)、[终态清理](/Users/yijunwang/code/goalboard/horizontal/agent-host/src/adapters/prologue-node.ts:1494)、[醒来顺序](/Users/yijunwang/code/prologue/packages/sdk/src/composition/core/subagent-writeback.ts:92)。

建议形成“分派调查/检查 → 原工作等待 → 子任务交回 → 原工作整合”的闭环。新父 Run 在派出前建立持久归属、轮次、当前授权、剩余工作预算、审查桥及停止入口；需要 SDK 开跑前检查入口，或由 Molis 的 start 服务控制续做。成本中到大，依赖第 3–5 项。

验证父子完成顺序、失败、重复回报、取消、撤权、预算耗尽、进程强杀、会话忙和重启；续做不重复，副作用不重放，待审项归属正确。接入前只按 SDK 自然终态判断用户工作完成会产生错误，尚未在升级后的 Molis 中实测完整续做。

### 14. 沿已有 Work 关系完善助理委托的交回与续做

**长任务机会，现有能力应保留。** 助理使用自定义 `delegate-work` 创建独立 Work，已能等待、读取结果、追加、停止和收回，并共享父工作用量上限。它与 Coding 的 SDK `dispatch-subagent` 是两条路径；主线 App 模式不允许 SDK `dispatch-subagent`。[助理委托](/Users/yijunwang/code/goalboard/apps/local-host/src/assistant/assistant-service.ts:2524)、[App 工具边界](/Users/yijunwang/code/prologue/packages/sdk/src/composition/core/agent-run-admission.ts:182)、[完成通知](/Users/yijunwang/code/goalboard/apps/local-host/src/assistant/assistant-service.ts:595)。

建议沿独立 Work 关系接通完成后的交回与原工作续做，保留用户停止和收回的含义，失败保留报告及可续引用。成本中到大；不能直接套用 SDK `onWake`。验证父工作已结束后的子工作处理、收回、重复通知、累计预算、当前授权和重启，用户工作在约定成立后才呈现完成。

### 15. 将休眠用于短等待，持久跟进继续用 Schedule

**功能边界。** `sleep` 是同 Run 的有界等待，墙钟预算继续计时，定时器不跨进程复活；主线 App 模式未把该工具列入模型白名单。

建议仅在适合的执行角色中用于短暂等待；跨重启和未来时刻的跟进继续沿 Molis 现有持久 Schedule/Follow-up。按实际场景接入，成本小到中，依赖状态适配。验证等待期间的取消、预算和恢复语义，避免承诺休眠会跨重启续接。

### 16. 将会话展示事实收敛到 App 会话条目

**记录优化机会。** Prologue 提供 `session.appendEntry/entries`，Molis 的部分观察时间仍放在 Host 归属索引。[App 条目合同](/Users/yijunwang/code/prologue/docs/slices/session-app-entries.md:7)。

建议把确属会话展示的时间等附属事实放入 Session 条目，让导出和分叉保留这些内容；可信身份、安装与业务状态继续由原 owner 持有。成本中，收益间接，按需求推进。验证历史兼容、条目限额、导出与分叉，不将全部业务记录迁入 SDK。

### 17. 接入记忆边界加强，保留现有候选和撤销规则

**升级检查项。** Prologue 加强了记忆作为外来数据的边界及伪身份标记中和；Molis 已有确定性记忆门、候选/保存策略和来源管理。

建议消费 SDK 的边界加强，沿用个人/项目记忆的来源、批准者和撤销规则。成本小到中。验证原文保留、身份标记处理、权限与误判；现有证据不支持再增加一套自动记忆机制。

### 18. 接入写前密钥扫描，并明确实际覆盖范围

**升级检查项。** 扫描入口是 workspace `preparePatch` 的新增行，未覆盖任意命令写文件、业务对象或全部网络外发。[扫描入口](/Users/yijunwang/code/prologue/packages/sdk/src/workspace/core/mutate-patch.ts:111)。

建议沿现有写入审查提供可操作提示，验证误报和原文处理。成本小到中。界面和文档按已覆盖的写入路径说明能力，不能将其描述成统一防泄漏机制；其他路径保留各自真实边界。

### 19. 为已有 writer worktree 登记副本血缘

**按需优化。** Prologue 的 `copyOf` 可记录副本来源，Molis 已有 writer worktree。[副本实现](/Users/yijunwang/code/prologue/packages/sdk/src/workspace/core/root.ts:45)。

建议在现有 worktree 流程登记血缘，便于解释来源和追踪成果。按实际流程评估成本，验证来源、分叉和回收关系；血缘记录不构成 OS 沙箱，也不替代现有隔离。

### 20. 对短暂租约竞争使用有限排队

**按需优化。** 主线新增租约排队，默认仍不等待。[租约合同](/Users/yijunwang/code/prologue/docs/slices/host-lease-queue.md:8)。

建议仅在实际存在短暂锁竞争的入口使用有限等待，改善临时占用造成的失败。验证等待、取消、超时和公平性；排队不解决内容冲突，不能替代业务版本检查。

### 21. 按企业网络需求接入 Host 代理与 CA

**按需功能。** Node Host 已有代理和额外 CA 设置。[Host 网络](/Users/yijunwang/code/prologue/packages/sdk/src/host/plugin/node.ts:51)。

建议由同一 Home 的 Host 配置网络选项，避免插件各自配置模型网络。成本按部署需求评估，验证供应商连接、代理错误和证书行为；当前没有真实企业网络验收。

### 22. 按诊断需求接入审计导出

**按需运维能力。** Prologue 新增审计 exporter，可用于执行诊断和回放材料。

建议在确有排障需求时提供脱敏导出，沿用现有业务和执行事实归属。成本按导出范围评估，验证敏感值处理、历史读取和导出内容；无需先建立另一套审计系统。

### 23. 点名扩权时展示精确范围并重新授权

**按需交互能力。** 新 SDK 支持 MCP 规则允许和 scoped sandbox grants；Molis 已有共同 Action 目录及用户授权路径。

建议在具体能力不足时展示需要增加的精确范围，获得相应授权后再执行，保持可信身份来自调用上下文。成本取决于入口，验证拒绝、撤权、范围变化和后续调用；不能把 SDK 的扩权积木解释为自动扩大已有权限。

## 推进顺序与验收

1. **接入可靠性：第 1–5 项。** 先修当前预算和生成派出前授权，再完成换包的状态/事件适配、工具分类和回执保护。未满足保护时微压缩保持不收缩，未接通的续做明确拒绝。验收实际请求预算、撤权后零派出、只读执行时机、压缩后修改事实、历史回放及升级构建。
2. **日常交互：第 6–12 项。** 优先做两块高保真切片：工作输入区的力度和换模型控制；现有时间线上的真实变更、检查结果与交回信息。选一个生成场景接通增量预览和停止。验收真实模型、页面成功/失败/取消、预算与权限不扩大，并测量质量、费用、延迟和刷新成本。
3. **长任务闭环：第 13–14 项。** Coding 与助理分别沿各自的子任务关系接续做，配套持久归属、派出前检查、累计预算和恢复。验收完成顺序、重复回报、取消/收回、撤权、预算耗尽及重启组合。
4. **升级检查与按需接入：第 15–23 项。** 记忆和密钥扫描随升级核对；休眠、会话条目、血缘、排队、企业网络、审计和扩权按具体用户需求选择。

实施行为变化前建立对应 spec，保留唯一 SDK 依赖、一个 Home 一个执行进程、共同 Action 目录、可信身份来源、原版本及副作用前检查。成本为相对工程量，真实模型收益仍需验证；本报告不承诺工期。

## 验证结果与覆盖范围

- **Molis Work：22 个文件、141 项通过，无跳过。** 覆盖流式投影、有界推理、恢复、预算、工作连续性、Schedule、记忆、灵光/Form/Dataset/PPT 动作、原图、TypeSafe、Alchemist 格式边界、HTTP/MCP 网关、SDK 子代理、助理 Work 委托和原文整理。包含真实 vendored SDK 路径，部分协作接口使用替身。
- **Prologue：22 个文件、133 项通过，无跳过。** 其中 23 项使用真实 Node Host 的磁盘、存储和命令路径；模型网络使用脚本替身。
- **请求和投影探针：** 生产 adapter 的思考预算覆盖、三个新事件的当前投影行为均已复现。
- **授权交错探针：** 灵光、Form、Dataset、PPT 在撤权后仍发出请求，结果拒绝保存；使用生产生成链与真实插件存储，模型为本机 HTTP 替身。
- **新 SDK 执行探针：** 主线 SDK 配合 Molis 生产 gateway 提前派出修改；修改回执从模型请求丢失、磁盘仍保留。使用本机 HTTP/SSE，记忆与业务对象端口为夹具。未观察到重复修改，未操作真实用户记忆。
- **类型适配预检：失败。** 确认 `sleeping` 缺口，当前依赖未替换。
- **代码链覆盖：** 页面/HTTP/MCP 入口、统一模型派出、工具执行与审查、领域校验/持久化、结果回放、通知、停止和恢复；图像与 TypeSafe 保留各自原图清理及原生概率语义。现有测试通过不覆盖所有新优化组合，关键交错由隔离探针补证。
- **未验证：** 升级后的完整 Molis 构建与全量回归、真实供应商质量/速度/费用、浏览器中的新交互、真实 Home 的长任务恢复和用户验收。评估未修改产品代码、未升级 SDK、未对 4207 的真实 Home 执行写入、重启或模型派出。端到端覆盖指代码链和已列出的隔离生产路径，不能推及全部页面、协议、供应商及重启组合。

## 可复现命令

在 `/Users/yijunwang/code/goalboard` 运行 Molis 定向测试：

~~~sh
node scripts/run-tests.mjs tests/prologue-stream.test.ts tests/prologue-inference-native.test.ts tests/prologue-recovery.test.ts tests/agent-budget-prologue.test.ts tests/assistant-work-continuity.test.ts tests/schedule-task-runner.test.ts tests/memory-agent-runs.test.ts
node scripts/run-tests.mjs tests/host-inference-completion.test.ts tests/lingguang-actions.test.ts tests/form-actions.test.ts tests/dataset-actions.test.ts tests/ppt-actions.test.ts tests/pages-generation-lease.test.ts tests/alchemist-structured-output.test.ts tests/typesafe-inference-port.test.ts tests/prologue-inference-images.test.ts tests/action-gateway.test.ts tests/agent-action-tools-prologue.test.ts tests/prologue-subagents.test.ts tests/prologue-compaction-continue.test.ts tests/assistant-work-budget.test.ts
node scripts/run-tests.mjs tests/assistant-delegation.test.ts
~~~

在 `/Users/yijunwang/code/prologue` 运行 Prologue 定向测试：

~~~sh
pnpm exec vitest run packages/sdk/test/model-reasoning-effort.test.ts packages/sdk/test/agent-model-switch.test.ts packages/sdk/test/agent-streaming-tools.test.ts packages/sdk/test/context-micro-compaction.test.ts packages/sdk/test/evidence-turn-changes.test.ts packages/sdk/test/subagent-writeback.test.ts packages/sdk/test/agent-sleep.test.ts packages/sdk/test/host-lease-queue.test.ts packages/sdk/test/workspace-secret-scan.test.ts packages/sdk/test/observability-exporter.test.ts --maxWorkers=2
pnpm exec vitest run packages/sdk/test/context-micro-compaction.live.test.ts packages/sdk/test/evidence-turn-changes.live.test.ts packages/sdk/test/coding-diagnose-after-write.live.test.ts packages/sdk/test/host-lease-queue.live.test.ts packages/sdk/test/session-app-entries.live.test.ts packages/sdk/test/subagent-writeback.live.test.ts packages/sdk/test/workspace-secret-scan.live.test.ts packages/sdk/test/memory-auto-promotion.live.test.ts packages/sdk/test/session-app-entries.test.ts packages/sdk/test/coding-diagnose-after-write.test.ts packages/sdk/test/workspace-copy-root.test.ts packages/sdk/test/memory-auto-promotion.test.ts --maxWorkers=2
~~~

在 Molis 根目录运行隔离探针：

~~~sh
NODE_ENV=test MOLIS_WORK_SECRET_BACKEND=file node --import tsx /tmp/molis-prologue-recheck-20261002/authority.mts
NODE_ENV=test MOLIS_WORK_SECRET_BACKEND=file node --import tsx /tmp/molis-prologue-recheck-20261002/upgrade-boundaries.mts
~~~

探针源码暂存 [授权交错](/tmp/molis-prologue-recheck-20261002/authority.mts) 与 [新优化边界](/tmp/molis-prologue-recheck-20261002/upgrade-boundaries.mts)，运行时创建并清理临时 Home；未加入产品代码或正式测试集。
