# 动作迁移历史：首页、场景与 Agent

状态：2026-09-25 至 2026-09-28 的迁移过程与验证记录，2026-11-03 分册。原文的“下文”“末尾”指整组历史记录，可从总入口查找。下文“当前”“尚未提交/发布”“本轮”“待迁移”均为原记录时点的陈述；不作为今日状态、执行授权或现行兼容策略。现行规则见[动作合同](../spec.md)与[SSOT](../../../docs/SSOT-MATRIX.md)。防腐阶段的决定见[历史归档](../../archive/repository-anti-corruption/spec.md)。

[迁移历史总入口](../migration.md) · [2026-09-28 复查报告](../review-2026-09-28.md)

## 本册目录

- [首页判断场景、实时建议与存量旁路清理](#首页判断场景实时建议与存量旁路清理)
- [Work Session 目录、内容与恢复接入共同动作](#work-session-目录内容与恢复接入共同动作)
- [Session 普通消息、持久回执与安全重试](#session-普通消息持久回执与安全重试)
- [首页“说一句”：上下文合同、会话选择与真实发送](#首页说一句上下文合同会话选择与真实发送)
- [本地 Home / 能力库自动读取已授予的插件权限](#本地-home--能力库自动读取已授予的插件权限)
- [首页具体动作：插件准备、共同执行与失效处理](#首页具体动作插件准备共同执行与失效处理)
- [首页事项与声明式导航](#首页事项与声明式导航)
- [首页判断的共同对象读取与绑定来源修复](#首页判断的共同对象读取与绑定来源修复)
- [推荐选项身份与原动作准备](#推荐选项身份与原动作准备)
- [首页规则消费、作者目录与旧选项迁移](#首页规则消费作者目录与旧选项迁移)
- [共同场景作者目录、真实用途与发布校验](#共同场景作者目录真实用途与发布校验)
- [Feed 捕捉规则的共同管理入口](#feed-捕捉规则的共同管理入口)
- [Feed 捕捉场景与真实消费完成迁移](#feed-捕捉场景与真实消费完成迁移)
- [Inbox 的当前绑定与建议改为共同查询](#inbox-的当前绑定与建议改为共同查询)
- [工作流交接保留调用者及发起动作授权](#工作流交接保留调用者及发起动作授权)
- [通用配置位置、真实启用与原存储条件更新](#通用配置位置真实启用与原存储条件更新)
- [生成插件模板默认注册系统动作](#生成插件模板默认注册系统动作)
- [场景管理动作与独立授权](#场景管理动作与独立授权)
- [作者用途固定场景版本与提供方](#作者用途固定场景版本与提供方)
- [Agent 作者目录与精确能力推荐](#agent-作者目录与精确能力推荐)
- [Agent 实际工具执行与 F1–F3 审查修复](#agent-实际工具执行与-f1f3-审查修复)
- [注册性能、无工作区角色与共享推理合流](#注册性能无工作区角色与共享推理合流)

## 首页判断场景、实时建议与存量旁路清理

- 新增系统 Home provider（`apps/local-host/src/home-actions.ts`），在项目 Runtime 启动时注册 `home.dock` 场景和四项共同能力：读取配置、保存配置、执行判断、读取当前建议。不依赖打开页面或安装 Functions；支持未知 ID 的兼容判断能力。旧 `/api/home/dock-judgment` 只转发共同动作，原 `functionSceneHttpBody` / `bindBoardFunctionScene` 无消费者辅助实现已删除。
- 原 Functions 绑定行及历史表继续作为唯一 owner。旧首页 Functions 绑定读取时补齐确定的系统提供方；新记录保存绑定版本、提供方及事项内容/版本依据。旧历史原样保留，缺少来源依据的历史不冒充当前有效建议，重新判断后生成新记录。修正同一时间写入历史时按 UUID 随机选择“最新”的问题。
- Feed 新建/更新、Attention 入箱、Web Sources/Connectors/Scheduler 和 Host 内容入口使用 Home 场景触发端口。删除 Feed 内 Home `judgeScene`、对象白名单 helper 和旧 JudgmentPort 的 Home 调用；Feed capture 仍使用原端口，尚未迁移。仅启用新端口时也会产生 Feed 判断事件，已回滚的 Feed/Inbox 事件不触发判断。
- 结果消费前重新核对事项、原材料、绑定和可用性；同函数改绑、停用、撤权、提供方撤回或内容改变后不使用旧建议。模型失败保存 needs_review 与空建议，不替用户执行动作。初始网页及 `/api/feed` 定时刷新均经同一建议查询；热缓存不绕过当次授权。系统能力库已显示 Home 实际场景和绑定。
- 公共场景合同补齐两项校验：判断的 subject_kinds 必须覆盖消费场景全部对象；新启用绑定固定实际 provider_id，提供方被替换时同 ID/版本也不能自动接替。SDK 文档已同步，未引入 Home 专属函数名单。

验证证据：

- `/tmp/home-scene-ready-test.log`：38 项通过，含未知判断绑定、Feed/Inbox 真实自动事件、回滚、重启、同函数改绑、内容变化、失败恢复、历史顺序、缓存撤权、旧 Home HTTP 和原 Inbox 自动链路。
- `/tmp/home-poll-tests.log`：20 项通过，含正式 stdio MCP SDK 客户端与实际 Web 初始/刷新 API、Feed 路由及 capture/out-rule 回归。真实模型调用使用可控 provider fixture，未调用付费外部模型。
- `/tmp/home-system-ui-tests.log`：2 项通过，正式 SDK 授权/撤权、网页建议一致性及停用后无建议；能力详情的实际 Home 使用链接、停用状态，以及原系统能力页面回归。这里验证真实 HTTP 输出，未将其算作浏览器交互或用户本人验收。
- Contracts/Functions/Feed/Kernel/Host 构建及根启动器、相关新增测试严格类型检查通过；限定修改范围 diff 检查通过。提供方固定的最后一组回归结果补记于下。

本切片不是完整首页迁移：现有 dock 行为目录及点击分支仍需替换；“说一句”的文本、准确对象/Session 投递和异常恢复仍待完成。Inbox 的旧建议投影仍缺完整的来源/当前绑定过滤，需要接入共同查询；通用场景在自动事件执行身份下的权限呈现、未知能力的产品配置入口也需继续核对。整体 Goal 保持执行中。

最终补验：`/tmp/home-provider-tests.log` 14 项通过（公共场景、Home、Inbox），`/tmp/home-provider-mcp-final.log` 正式 MCP 与网页 1 项通过；固定提供方后原 Inbox 绑定/重启仍兼容。最后将事项来源权限检查改为纯读取已解析状态，避免异步等待期间删除事项时在权限检查里裸读失效引用；`/tmp/home-complete-tests.log` 13 项通过，Kernel/Host 最终构建见 `/tmp/home-complete-build.log`。首页定时刷新、MCP 授权和系统使用位置的真实 HTTP 证据已覆盖本切片；首页动作执行与 Session 文本投递仍按上述未完成范围继续。


## Work Session 目录、内容与恢复接入共同动作

- Work manifest 自带 `sessions.directory.read`、`sessions.list`、`sessions.content.read`、`sessions.resume` 四项定义及处理器，项目 Runtime 启动注册。目录返回原公开 Session、目标关联历史、事件数量和原 Runtime 支持情况；不暴露 correlation token 或私有 metadata，不为 UI 创建第二份会话事实。
- 网页 Session 目录和工作区会话摘要改为消费 `sessions.directory.read`；原列表、内容与恢复 HTTP 只转发共同动作，删除其原 Registry/Content 直接调用。目录纯投影收窄为所需公开读接口。项目停用插件后拒绝调用，首页跳过未启用的可选会话目录；重新启用保留数据及授权引用。
- 新 `SessionRuntimeService` 由系统 Host 持有同一 Registry、Runtime adapter、内容/交接服务及 recorder；Web 只借用。允许项目先启动再配置资源，禁止跨 Home 替换、运行中替换连接或关闭后访问；关闭借用 Web 不关闭 Host，重启后读取原数据库。删除 Web 的独立创建/销毁路径与无消费者的旧工厂导出，工厂成为资源 owner 内部实现。
- 原生读取/恢复前后重新验证调用权限、提供方和项目；等待期间撤权、转项目或改变原生身份/目标/工作区/状态时拒绝失效结果。恢复仍只是原生加载，不发送用户文本，不把 Handoff 包冒充普通消息。
- SDK 正式 stdio 客户端无需增加 MCP 工具表，授权后自动出现四项能力；MCP 和网页内容一致，恢复只针对给定原生 ID。调用输出保留完整对象 schema，包含原恢复成功/失败/不支持语义。

验证：

- `/tmp/work-all-final.log`：5 项通过，覆盖原 Session 目录完整 HTTP 流程、共同动作的权限/关联变化、资源共享及重启，以及正式 MCP 的授权/撤权、跨项目、停用/重新启用与 Web 借用生命周期。
- `/tmp/work-owner-regression.log` 中其余 22 项原内容、目录 owner、恢复及交接/故障恢复通过；其中旧目录 HTTP 测试曾假设未启用插件也能读取，现已补验证拒绝后启用再读取，在上述最终 5 项中通过。
- `/tmp/work-web-ready-tests.log`：实际网页会话呈现/HTTP 和原操作渲染 2 项通过。`session-web.test.ts` 的另外一个旧导航静态夹具仍失败：它未提供插件目录面板却要求 Inbox 等展开分区；本次未修改导航渲染来迎合该断言，留作产品整体验证时按实际面板合同处理。
- Work、Host、根启动器构建/类型验证见 `/tmp/work-http-build.log`、`/tmp/work-cleanup-build.log`；新增测试严格类型检查见 `/tmp/work-action-types.log`。限定改动 diff 检查通过。Runtime 使用可控原生传输 fixture，未声称已连接用户真实 Codex 或完成浏览器/本人验收。

当前仍未完成：Session 创建/发现/关联/归档/交接/终端的其余旧入口、普通消息的持久请求与不确定送达恢复、首页准确选择会话并实际传递文本、动态动作消费。整体 Goal 保持执行中。


## Session 普通消息、持久回执与安全重试

- 原 Work provider 新增 `sessions.message.send/read/retry`，自行声明供内部、Web、workflow、MCP 使用；没有新增 Host 名称白名单或 MCP 分发表。发送固定 Session、预期当前 Goal、调用者/项目/幂等键和原文/可选上下文；查询不能访问其他调用者的私人请求。上下文为调用方材料，本层不据此创建跨对象关系，首页实际对象需在消费端核实。
- 在原 Session 数据库新增消息事实，复用原加密内容存储。状态为 pending、uncertain、failed、accepted：外部调用前原子标记 uncertain，重复与并发请求不会重复发送；只有明确未接收可显式重试。超时、无有效回执、重启或本地落盘失败均不自动重发，也不凭打开数据库判定另一个进程死亡。accepted 与原会话时间线事件同一事务；先保存已发生的外部事实，再做返回前权限复核。
- Runtime 能力矩阵增加 message；Codex Adapter 只向已有 threadId 调用 turn/start，回执要求原生 turn ID。消息不复用 Handoff 业务包，不另开 Session。Fallback 明确声明 unsupported。Work 消息动作使用公共 concurrent 调度，其短事务负责并发约束，查询不会被发送的网络等待阻塞。
- 新增三个薄 HTTP 入口：Session messages POST、session-messages/:requestId GET 和 retry POST；200 表示接收，202 表示未确认，409 表示明确拒绝或请求冲突。MCP 自动发现同一合同，发送结果可从原网页会话内容接口读取。
- Session schema 升至 6；初始化、旧结构重建、Ledger 关联迁移和消息表升级现在同一事务发布。修复原 v1 结构升级后 Ledger 初始化失败时只回滚关联的缺口。已有身份、历史、加密内容和关联不改写；升级失败回滚原结构与版本。

验证：

- `/tmp/session-message-built-tests.log`：19 项通过，含消息动作并发去重、准确原生调用参数、同键不同文本拒绝、跨项目/调用者、等待期间撤权仍保留回执、明确拒绝显式重试、未知送达重启不重发、并行打开 Registry 不重置状态、v5 数据升级，以及正式 MCP 发送与网页时间线一致。
- `/tmp/session-message-http-tests.log`：25 项通过，含正式 MCP 与真实 Web 发送/查询/重放/冲突、原生恢复、停用/恢复授权，以及既有 Handoff 故障恢复、旧数据迁移和实际 PTY 生命周期回归。Runtime 使用可控传输 fixture，未发送到用户实际原生会话。
- Contracts、Private Work Context、Runtime Host、Work、Local Host 构建通过，日志 `/tmp/session-message-build.log`、`/tmp/session-message-fix-build.log`、`/tmp/session-message-http-build.log`；新增测试严格类型检查通过。额外回执落盘失败的事务回滚验证见后续补记。

仍需继续：首页“说一句”不再丢文本的实际接线、事项上下文的权威解析、明确/多候选/无候选会话选择、发送中/明确失败/结果未知状态及重新打开后的恢复体验。该后端闭环不算首页产品验收；全量插件及其他剩余项保持原范围。

消息回执最终补验：`/tmp/session-message-atomic-tests.log` 4 项通过；数据库触发器注入回执写入失败，证明已经追加的时间线事件同事务回滚，请求保留 uncertain 且再次提交不产生第二次原生调用。`/tmp/session-message-final-types.log` 和 `/tmp/session-message-launcher-types.log` 严格类型检查通过。

消息接口收尾验证：未知内部异常返回 500 与查询原请求的提示，避免误报为输入问题或已发送。`/tmp/session-message-complete-build.log` Work/Host 构建、`/tmp/session-message-complete-mcp.log` 正式 MCP + Web 完整往返通过；限定范围 diff 检查通过。整体 Goal 继续，尚未修改首页客户端或完成其浏览器验收。

## 首页“说一句”：上下文合同、会话选择与真实发送

- Contracts/SDK 增加对象上下文语义合同，沿用 input_type/output_type 和共同注册表；输出包含对象身份、版本、标题/正文快照、节选标记、Goal 关联及明确 Session。规范 schema 在注册时校验；同对象存在多个可用提供方或返回不同身份时拒绝，不猜测来源。
- Feed 材料/来源、Inbox、Goal、Work Session 各自注册上下文查询。Inbox 经共同服务读取原对象并复核修订；保留原材料节选标记。Goal 进展按真实 summary/next_step 输出正文，避免对象被转换成 `[object Object]`。Work 现有八项共同能力（目录、列表、内容、恢复、三项消息、对象上下文），原 owner 继续拥有数据。
- `home.talk.prepare` 发现上下文查询并调用原 Work 目录。Session 事项只选本会话；有 Goal 关联只列当前同 Goal 会话；无关联列项目候选但不预选；多个关联候选要求选择，没有候选提供会话列表入口。外部等待后重读上下文，变化则重新准备。
- 首页消息客户端删除任取第一条 Session 的跳转逻辑，真实调用消息动作的薄 HTTP。按事项保留草稿、目标、冻结文本/上下文、幂等键和已返回的请求 ID；每个浏览器标签页的 sessionStorage 只承担草稿与请求恢复缓存，服务端原加密存储仍是送达事实来源。缓存不可写时明确提示刷新会丢草稿，未声称浏览器缓存经过加密。
- 确认接收后显示打开会话/继续说一句；明确拒绝可重试原请求；未知结果只能核对原请求/查看会话，刷新及重复点击不产生第二次发送。弹层底部锚定输入框，展开正文与异步刷新不会把输入位置推走；使用事件原传播路径避免按钮重绘触发误关闭，Escape/关闭后焦点回到入口。保留现有首页和设计系统。
- SDK 导出 helper 并补充开发说明，明确“读取对象上下文”不等于自动贡献首页事件。未改 MCP 单独工具表，新查询沿用已有共同导出和授权。

验证证据：

- `/tmp/home-talk-regression.log`：17 项通过，覆盖未知 SDK 插件正式 Runtime 注册、撤权/停用、错误协议与歧义来源，原 Feed/Inbox/Goal/Session 数据、准确候选、上下文变化，以及原 Home 判断、Session 消息与资源生命周期回归。
- `/tmp/home-talk-mcp-regression.log`：正式 stdio MCP SDK 与真实 Web 的 Session 查询、消息发送/状态、恢复及共享 Host 生命周期通过。Runtime 为可控原生传输 fixture，未向用户真实会话发送消息。
- `/tmp/home-talk-browser-final.log`：Chrome 实际页面操作通过，覆盖原文及正文发送到正确 threadId、不同事项草稿隔离/刷新恢复、等待时关闭/重开/刷新不重发、确认接收与原时间线一致、未知送达只读核对、明确拒绝显式重试、Session 本身精确选中、关联会话缺失、Escape 焦点恢复。桌面 1440、窄屏 390 和低高度 650 截图在 `.impeccable/review/home-talk-actions/`，已人工查看。
- Contracts、SDK、Feed、Inbox、Goals、Workbench、Host 定向构建通过；新增测试严格类型检查通过（`/tmp/home-talk-test-types.log`），限定改动 diff 检查通过。此为自动化真实产品路径证据，不代替用户本人验收。

仍待全量迁移：Home 动态事件/动作贡献与旧点击分支、网页调用者手写权限集合（未知插件新权限可能被漏掉）、剩余工作流与 Character/Agent 接线，以及总表列出的其余存量插件与旁路。未知插件的对象合同在已具备授权的调用者中已验证；尚未把所有真实网页授权入口称为自动接入完成。整体 Goal 继续。

## 本地 Home / 能力库自动读取已授予的插件权限

- 新增 `local-web-actions.ts` 作为可信本地网页适配器。固定 web-user / 当前项目身份；从原 Plugin Runtime 安装记录读取运行状态和 grants，按实际安装、插件身份、能力版本与提供方扩展可调用范围，不从声明或请求 JSON 生成权限，不另建授权数据库。
- Home 的实际准备/配置/建议查询和能力库使用该适配器。未知插件的新权限不再要求修改 Home 权限集合；仅声明权限、未授予安装 grant 时仍不可调用。扩展授权固定到准确动作，另一个只声明同名权限的提供方不能借用。执行复核直接读取原安装授权；不在每个嵌套调用里重复发现整个目录。定义、连接和来源生命周期仍由共同分发器检查。
- 本地用户上下文不用于 MCP、Agent 或自动事件；原 MCP 独立客户端授权保持有效。已有内置插件的静态用户权限策略暂保留，未冒充全部旧权限集合清理完成；此适配器解决正式 Runtime 插件在 Home/能力库的具体漏发现问题，后续消费方仍须接线。

验证：

- `/tmp/home-local-grants-complete-tests.log` 两项通过：完整 Home Chrome 主流程在新适配器后仍可用；未知 SDK 插件经正式 Runtime 与原 SQLite 安装记录注册，真实 HTTP 验证未授权拒绝、授予后自动读取、目录呈现、撤权/停用、跨项目拒绝、同权限另一提供方拒绝、MCP 无独立授权仍拒绝、提供方替换后旧上下文失效而新请求读取新提供方。
- `/tmp/home-local-grants-regression.log` 中能力库实际绑定/生命周期与正式 MCP Home 判断、Web 建议往返两项通过；该次浏览器重载遇到异步列表尚未呈现的夹具时序失败，已改为等待真实事项出现，随后上述最终完整浏览器测试通过，没有改变生产语义来放宽断言。
- `/tmp/home-local-grants-final-build.log` Host 构建通过；`/tmp/home-local-grants-complete-types.log` 新增/相关测试严格类型检查通过；限定 diff 检查通过。SDK 文档与总规格同步。整体仍按全量 Goal 继续，Home 动态贡献、自动事件身份、其他配置消费者和旧权限集合清理尚未完成。

## 首页具体动作：插件准备、共同执行与失效处理

- Contracts / SDK 增加规范事项动作查询合同及 `defineSubjectOffersAction`。插件从原数据返回 offer_id、用户可读标题、自身已注册动作和完整输入；查询不执行业务写入。Home 从同一目录按语义与对象类型发现，无新增插件 ID 白名单。输入合同使用 Kernel 原校验器，重复 offer_id、跨提供方借用、错误协议及不完整参数会被拒绝或显示不可用。
- `home.actions.prepare/execute` 固定查询与目标提供方、能力版本和原参数；点击时重新准备并逐项核对，调用原动作前再次检查来源及原调用者授权。对象修订变化后拒绝原按钮，不能静默换输入。各 owner 仍负责业务事务、版本及幂等；这层不承诺任意外部副作用恰好一次。
- Inbox 自己注册 `inbox.actions.prepare`，提供“做完了／忽略”，调用原 `inbox.entry.status` 和当前 expected_revision。原 Attention 状态是唯一事实来源。首页删除旧直接状态 HTTP 写入、重复本地状态合并、专用错误样式和陌生行为 ID 回退分支；现有 Inbox 自己页面的公开薄 HTTP 仍转给同一状态动作。
- 首页根据真实 offers 渲染按钮与不可用原因；收到执行回执立即显示原结果，再刷新首页。未确认响应保留原请求，按钮不可重发；提供方消失不能清除不确定状态，重新读取成功后才依据 owner 的当前 offers 判断原选择是否仍适用，不将“已不适用”误报为执行成功。页面刷新、停用与恢复均不产生重复写入。
- 异步列表放在固定底部操作行上方，同内容刷新保留按钮节点，避免鼠标按下/松开之间按钮位移或替换；结果展开状态在刷新期间保留。触控动作至少 44px，网络中断使用可理解的提示。仍保留的导航、“问问怎么回事”及重新授权行为明确列为后续迁移，不宣称已经符合最终文案合同。
- Host 一次发现/管理检查只读取一份当前安装快照，避免每项能力及其依赖重复打开同一目录。快照仅属于本次目录投影；执行、后续发现及副作用前策略检查继续使用实时读取。Web 组合根保留单数据库模式的原授权边界，未新增跨请求授权缓存。

验证：

- `/tmp/home-offers-final-browser.log` 两项 Chrome 实操通过：未知 SDK 插件按原 SQLite 安装 grants 自动出现，点击后原业务表变化；Inbox 原状态/修订更新、完成事项退出首页，未使用旧状态 HTTP。覆盖桌面 1440、触控窄屏 390、延迟动作加载不移动底部按钮、响应丢失后的保留/重载、提供方停用/恢复不重发，以及原 Inbox/来源导航与空消息不发送。截图位于 `.impeccable/review/home-offer-actions/`，已查看桌面结果与窄屏操作/未知状态。
- `/tmp/home-offers-final-regression.log` 中目录快照、未知 SDK 动作合同、正式 stdio MCP 与完整 Home Talk 四项通过。MCP 实际发现并执行 Inbox 完成，写权限缺失时不可用，授权后结果与真实 Web 一致，旧 offer 重放被拒绝。未知插件覆盖参数篡改、旧修订、缺权限、跨项目、错误输入、来源撤权及停止；撤掉查询权限时，即使目标写权限仍有效，也不会进入写处理器。该次组合中的动作浏览器曾因成功回执等到整页刷新后才显示而失败；已改为立即呈现回执，最终上述两项浏览器测试通过。
- 最终 Host 构建见 `/tmp/home-offers-discovery-build.log`，Workbench 构建见 `/tmp/home-offers-receipt-build.log`；相关新增测试严格类型检查 `/tmp/home-offers-complete-types.log` 通过，限定 diff 检查通过。SDK 与 Inbox 文档已更新。以上是自动化产品实操证据，不代替用户本人验收。
- `/tmp/home-offers-policy-regression.log` 七项最终回归通过：目录单次安装读取与执行实时停用、未知插件上下文/真实 Home HTTP 授权、准确 Session 选择、等待期间对象变化、Inbox 自动事件及正式 MCP / Web 会话共享与生命周期。没有扩大 MCP 或后台事件的授权。

仍待完成：Home 动态事件贡献、剩余导航/授权/问询、判断结果的固定动作名单、其他配置消费者的动态发现与授权、全部工作流/Character/Agent 接线，以及总清单中剩余插件和旧旁路。整体 Goal 保持执行中。

## 首页事项与声明式导航

2026-09-26：已接通共同 Home events 合同与 SDK 声明。Feed、Inbox、Work 从自己的原数据提供事项，Home 处理日期与展示；首页原来的 Feed/Inbox/Session 拼装、来源“重新授权”和只导航的“问问怎么回事”分支已删除。“说一句”继续使用已验证的对象上下文和真实消息能力。

`home.events.read` 从共同目录发现已授权查询，按提供方、查询能力与原事件 ID 隔离身份；重复事件或未声明对象类型不能混入结果。`home.events.open` 重读固定提供方并核对对象/分组/页面目标；Feed 控制器接收共同分组导航事件。停用、撤权、原对象完成或目标变化后不能继续使用旧入口。单个来源读取失败时保留其他来源，显示明确错误与重读入口，不把失败显示成空首页。

原内容、目标关联与状态继续归业务 owner。Goal 名称通过已授权的共同对象查询取得，无权读取时只显示原 owner 已有的关联 ID。Feed 抑制已经进入 Inbox 的同一材料/来源故障，完成或忽略后不会作为原始 Feed 事件重复冒出；Inbox 保留窗口外尚未处理的事项；Work 只返回当前项目的原 Session。直接调用三个原生查询和聚合查询都会检查时间窗口关系。

首页刷新现在合并排队，慢请求不会被后续轮询反复作废；排队后的请求读取新事实。成功刷新同时更新当前事项的具体动作，修复“正文和版本已更新，按钮仍带旧参数”的问题；执行时仍重读原 offer，陈旧参数被拒绝，不静默替换。

读取成本修复有实际采样依据：失败浏览器用例约 65 秒 CPU profile 中，`structuredClone` 自耗时约 30 秒，主要来自只查一个能力却复制全目录。原 Kernel Registry 新增按能力 ID、版本、项目取单个描述的查询，Host 和 ActionService 的正常定位及依赖检查改用它；返回描述仍是隔离副本。目录发现中的依赖遍历复用同次可见目录，管理 inspection 单独取得可见依赖目录；快照不跨请求，执行、副作用授权和后续发现继续读取当前状态。保留原外项目拒绝语义和提供方变更检查。定向测试确认普通调用和依赖检查不复制全目录，完整目录发现只复制一次。

验证证据：

- `/tmp/home-events-lookup-regression.log`：24 项通过，覆盖共同服务、目录安装策略、单能力查找、项目隔离、提供方重载、场景绑定变化、排队时权限变化、真实本地 Web 安装 grants，以及原生/未知插件首页事项。原生用例检查真实正文、Goal 名称、完成/忽略去重、来源错误、跨项目 Session 和失效导航。
- `/tmp/home-events-final-ui-regression.log`：3 条实际浏览器路径通过。未知插件在原 SQLite 表拥有自己的事项、上下文与写入动作，首页无需新增 ID 分支；旧响应等待期间新的刷新合并后显示最新正文，按钮执行新版本，完成后事项撤回。还覆盖提供方读取失败与恢复、停用、桌面和 390 窄屏触摸、原 Inbox 完成/忽略、执行结果丢失后的禁止重发、真实消息草稿和送达不确定状态恢复。
- `/tmp/home-events-final-browser-paths.log`：原 Inbox 对象打开、来源分组导航、Inbox 完成及空消息不发送通过。这里的未知插件用例与上一条重合，不重复计算。
- `/tmp/home-events-functions-final-tests.log`：正式 stdio MCP 完整用例通过，含新事项查询、当前判断建议、导航、Web 原事实对照、授权撤回和原 Inbox 写入；Functions 测试其余用例通过。该轮 Home HTTP 测试的旧“项目没有事项”假设与自动创建的未连接来源不符，已修正为核对绑定前无判断建议；修正后的完整 Home HTTP 绑定用例在 `/tmp/home-events-home-binding-final-test.log` 单独通过。原首页专用 DOM 分支断言已改为共同 API 行为验证。
- Kernel、Contracts、SDK、Feed、Inbox、Work、Local Host、Workbench 构建通过；相关严格类型检查和 scoped diff whitespace 检查通过。最终类型检查见 `/tmp/home-events-complete-types.log`。
- 最终内容核对补齐 Feed 无内联正文时读取保留材料的路径；`/tmp/home-events-material-test.log` 两项通过，其中原生用例将正文写入原加密材料存储，验证 Home 实际读到解密原文而不是摘要。Feed 构建通过。

已实际查看 `.impeccable/review/home-plugin-events/` 的桌面事项、390 触摸事项与来源错误截图。新动作和重读入口在触摸模式保持至少 44px 点击高度，页面无横向溢出。浏览器 fixture 激活受测页面、关闭 headless 后台限速，DOM 等待独立于动画帧；导航等待与失败诊断单独调整，业务条件仍验证实际服务和原存储。SDK 与三个原生插件 README 已同步。

本段工程验证与上述真实路径通过，未代替一骏本人验收。完整 Goal 保持执行中：下一段优先处理 `HOME_DOCK_ACTION_IDS`、旧 HomeSubject/native 判断接线和其他存量注册/消费/清理；Work 创建/关联/Handoff、其他平台服务、工作流及完整产品审计仍按前述清单继续。

## 首页判断的共同对象读取与绑定来源修复

2026-09-26：Home 判断输入现在使用共同 `ActionSubject`，经正式对象上下文查询读取原记录、正文与版本；删除 Home 对 Feed/Inbox 存储的直接依赖、对象类型枚举和原读取能力名单。首页场景接受合同兼容的文本判断；非空 `subject_kinds` 限定它实际处理的对象，空集合表示通用文本判断。按单个对象检查适用范围，批量先校验全部对象再调用模型，按 kind/id 去重而不受 JSON 字段顺序影响。自动事件遇到不适用类型时跳过，原 Feed/Inbox 触发路径保留并已回归。

原 Functions owner 新增按项目和场景读取每个对象最新判断的查询，时间相同时以插入顺序确定最新结果。Home 不再通过 Feed 快照枚举可显示建议的对象。提交与读取建议核对固定读取来源、原上下文版本/内容/关联、当前授权、判断提供方及绑定 revision；内容变化、对象删除、多个上下文来源、停用、撤权或来源替换时撤回建议，保留历史。Home 内容限制为 8000 字符；全文来源版本仍用于判断过期。未带新上下文身份的旧结果保留为历史，重新判断后产生有效建议。

首页判断的项目事件现在由 Host 写原 `LocalSqliteJournal`，记录实际 caller，不再经 Feed 代写。删除 `recordHomeJudgmentEvent`、`applyHomeRecommendations`、Feed 投影的 `home_dock_suggested_behavior_ids`、WebView 与 Feed HTTP 的重复建议读取，以及相关无用参数。首页从 events/recommendations 获取实时建议，旧 Board 缓存不再承载副本。

真实回归暴露原 `setActionSceneBinding` 丢弃 `provider_id`：现在完整保存共同服务固定的提供方引用。已知系统函数的旧键由存储 owner 恢复 `system.functions`，原版本、revision、启用状态和标题不变；旧插件绑定缺少来源时保留可见配置，由统一 usages 标记不可用、runScene 拒绝，明确重新绑定后恢复。Kernel 不再让持久化时丢失来源的引用自动跟随当前同名提供方。Inbox 的旧系统函数接线同步固定来源。

验证证据：

- `/tmp/home-subject-scene-final.log`：4 项通过，覆盖原生 Home、正式安装陌生插件的独立 SQLite 对象、实际判断与原 journal、事件中的建议、批量不兼容与重复对象、原内容变化、权限撤回、多个读取提供方、替换来源、对象删除、旧绑定迁移及历史最新结果的项目/场景隔离。
- `/tmp/home-subject-final-regression.log`：18 项通过，覆盖共同服务、来源固定、异步判断期间绑定/提供方变化、失败及取消，Home 原路径，Inbox 原绑定与重启、HTTP/工作流/调度器自动触发，以及正式 stdio MCP 的判断、Web 一致读取、撤权和真实 Inbox 动作。
- `/tmp/home-subject-host-regression.log`：8 项通过，覆盖 Host 嵌套调用、生命周期、排队期间权限变化、场景判断及消费策略。
- `/tmp/home-subject-ui-regression.log`：陌生插件实际首页浏览器路径通过，含自己的原记录、刷新后的真实动作、失败/恢复与停用；Functions 其余回归通过。该轮 Home HTTP 的旧断言要求排除仅适用 Inbox 的规则，与本段按对象适用的合同冲突；已改为明确允许该规则处理 Home 中的 Inbox 事项，不放宽输入/输出合同。修正后的完整 HTTP 用例在 `/tmp/home-subject-home-http.log` 通过。
- Contracts、Kernel、Functions、Feed、Inbox、SDK、Workbench、Local Host 构建通过；最终 Host 构建见 `/tmp/home-subject-host-final-build.log`，其余消费方构建见 `/tmp/home-subject-consumers-build.log`。相关严格类型检查见 `/tmp/home-subject-final-types.log` 与 `/tmp/home-subject-final-changed-types.log`。SDK 文档已说明对象接入、来源固定和当前推荐选项限制。

完整 Goal 仍未完成。下一段处理 `HOME_DOCK_ACTION_IDS`、`SYSTEM_BEHAVIORS`、函数场景选项和旧作者目录：必须先明确推荐选择与真实 offer 的稳定身份、提供方和可执行输入关系，再迁移规则编辑/绑定/展示及存量数据，不能只把结果 enum 放宽成字符串。当前陌生插件对象能参与判断，不等于它任意自定义动作已能成为判断选项。其他 Work/工作流/平台服务/产品审计及旧实现清理按此前全量清单继续；本段验证也不代替一骏本人验收。

## 推荐选项身份与原动作准备

2026-09-26：正在接通固定推荐名单的替代链路。第一步已经实现插件 `subject_offer_choices` 声明：规范 offers 查询可以声明稳定 offer_id、显示名、本提供方目标动作与版本，以及可选的对象类型子集。SDK/Runtime 在注册时拒绝重复 ID、跨提供方目标、无效版本和未声明对象类型。Inbox 已声明完成/忽略这两个原业务动作，不复制执行逻辑。

Kernel 的 `subjectOfferChoices` 只从一次授权目录快照派生选项，包含原查询与提供方、目标动作、对象范围及可用状态；无写权限、目标缺失、对象类型不匹配或来源不可用时给出明确原因，不用执行 handler 探测。稳定 key 由提供方、查询 ID/版本、offer_id、目标 ID/版本确定，符合现有 Jev 的选项 key 长度和字符限制；显示名和具体事项参数改变不改变选项身份。更换提供方时身份改变，不能继承另一个安装的选项。

共同 `home.actions.choices` 查询已注册，可从内部、正式 MCP adapter 和受保护 `/api/home/actions/choices` 读取。`home.actions.prepare` 对已声明选项返回同一 recommendation_key，同时核对真实 offer 的目标及对象类型；声明与实际不符时拒绝整批。执行继续重读原查询、固定原参数和动作版本，传入的推荐身份不符时也拒绝。未声明的动态 offer 保持人工可执行，但不伪装成已配置的规则选项。

清理了没有实际消费者的 `home_dock_functions`、`dock_behaviors`、`hostHomeDockBehaviors` 及相关 WebView 类型/序列化，避免保留第二份首页选择目录。现有实际首页判断候选继续由共同场景接口取得，Feed/Inbox 的尚未迁移部分仍明确保留。

本步不是推荐名单迁移完成：`HOME_DOCK_ACTION_IDS`、规则作者目录、Home 判断结果消费和旧规则映射仍待下一步接通。不得将此候选查询当作已经可在旧判断里直接使用；SDK 已明确此限制。下一步必须同时处理场景发现/绑定兼容、保存的选项引用、运行时真实 offer 检查以及默认规则/用户历史迁移，不能单改输出 schema。

已取得证据：`/tmp/offer-choices-tests.log` 的陌生 SDK 插件测试通过，验证目录不调用对象 handler、候选 key 与实际参数一致、输入/推荐身份篡改拒绝、权限与来源撤回、来源替换、目标版本偷偷变化拒绝及 MCP 共用查询/执行。`/tmp/offer-choices-final-regression.log` 8 项通过，含正式 stdio MCP 的真实 Home/Inbox 写入和原 Keychain/Functions 读取回归。`/tmp/offer-choices-browser.log` 的实际首页操作通过，验证未知插件和已声明推荐身份的 Inbox 原动作都能真实执行；`/tmp/offer-choices-http.log` 的 Home 配置与旧投影清理回归通过。Contracts、Kernel、SDK、Inbox、Workbench、Local Host 构建通过，相关测试严格类型检查见 `/tmp/offer-choices-final-types.log`。本步已验证，继续推进同一推荐链路的消费端，完整 Goal 保持执行中。


## 首页规则消费、作者目录与旧选项迁移

2026-09-26：已把上段声明的推荐 key 接入实际 Home 判断。消费场景声明 `recommendation_source: subject-offers`，Kernel 从同一目录检查判断规则完整输出 enum 的每个引用；LocalHost 补齐异步安装/权限策略，发现、绑定、usages、required_scene 可用性及执行前后使用一致判断。原调用者没有目标执行权限时，不因推荐声明而扩大授权。

Home 通过共同事项上下文和 offers 查询准备输入，将当次实际可用 key/名称交给规则。没有对应动作时在模型调用前拒绝或跳过自动事件；选择未准备动作时保存 needs_review，不生成虚假推荐。保存及展示建议时重查原对象、动作来源、完整输入、绑定与权限。历史附加原准备 request_id 与所选 offer 的摘要，重用原查询恢复校验，不复制业务输入。选项本身超出 8000 字符输入上限时明确拒绝。前端按 recommendation_key 排序，执行继续经过已验证的原 offer 核对与原插件动作。

Functions 发布调用返回定义中的映射结果，不再经 Host 静态行为名单截断。scene_map 保留仍存在的判断结果键及其原目标，即使目标当前缺失；可用性由真正消费端检查。注册缓存除模型配置 hash 外比较完整输出合同，修复仅映射/对象元数据变化后目录继续展示旧枚举的问题。无场景的独立判断及 agent.mcp 使用纯判断输出；其完整动作选择迁移仍在总清单内。

规则编辑器的首页选项使用当前项目的授权目录。实操发现编辑器虽选择项目，原目录请求仍走全局 HTTP；已修正目录读取使用项目 transport，管理数据继续由原全局 owner 保存。陌生插件安装 grants 可使其声明自动出现，无需 Host ID 名单。停用/撤权后的原映射显示不可用并保留，修改条件后保存不会清空；界面不展示推荐 key 的内部摘要。没有选择项目时明确要求先选择项目，不假装拥有完整的项目选项。

存量迁移仅处理明确标注 home.dock 的规则，将 inbox.done/inbox.dismiss 映射到历史原生 Inbox 的固定提供方、查询及目标版本。已知原别名以外的条件/引用不猜测替换；home.continue/home.ask/重新授权等已不存在的动作保留在旧规则和历史中，由兼容检查标为失效。迁移只改 scene_map，保留原条件、预览、model hash、版本、时间戳、绑定和历史；重复打开不再改写。新安装的默认规则只推荐已声明的 Inbox 完成/忽略，适用于 inbox_entry。原来共享 Inbox 结果符号的其他规则不会自动变成 Home 规则，需明确映射到当前声明选项。

清理：删除 HOME_DOCK_ACTION_IDS、HOME_DOCK_PRIMARY_BEHAVIOR_IDS、defaultHomeDockBehaviorIds、visibleDockBehaviorIds、offeredHomeDockBehaviorIds、homeDockSubjectKinds 及过时测试；SYSTEM_BEHAVIORS 不再声明已删除的 Home 导航/询问动作。静态作者合同不再提供 Home 动作名单，旧 functionFitsScene 不能再批准 Home 绑定；实际 Home 使用共同场景服务。Feed/Inbox 的旧行为目录及 legacy judge 尚有真实消费者，因此仍保留并继续迁移，不能宣称整个 SYSTEM_BEHAVIORS 已删除。

证据：

- `/tmp/home-choice-final-regression.log`：49 项通过，包含共同场景、Host 异步策略、原生 Home、陌生正式 PluginRuntime 自有 SQLite 对象和真实写入、标准 stdio MCP、规则迁移。陌生插件用例还创建/试跑/发布系统 Noul 规则，验证自定义对象、scene_map、输出注册及 Home 实际推荐。
- `/tmp/home-choice-cleanup-regression.log`：删除旧辅助后的 48 项中 47 项通过；唯一失败为旧测试仍要求“亮哪些按钮”文案，已按实际推荐行为修正。最终完整 Functions/迁移回归 `/tmp/home-choice-cleanup-final-tests.log` 23 项通过。该轮其他通过项含原 Inbox HTTP/工作流/调度器自动判断、连接器、锁定 Keychain，以及正式 Home MCP 的权限隔离与原 Inbox 写入。
- `/tmp/home-choice-browser-final.log`：真实 Chrome 路径通过。陌生插件声明出现在项目规则编辑器，停用后原映射仍显示并在修改条件后保留；随后实际 Home 执行陌生插件原记录和 Inbox 状态，含窄屏及结果不确定恢复。已查看 `.impeccable/review/home-offer-actions/rules-declared-choice.png` 和 `rules-missing-choice.png`，修复后失效提示不再暴露内部 key。
- Contracts、Kernel、Functions、Workbench、LocalHost 构建通过，相关日志 `/tmp/home-choice-contracts-build.log`、`home-choice-core-build.log`、`home-choice-host-build.log`、`home-choice-workbench-final-build.log`；SDK/Feed/Inbox 构建通过见 `/tmp/home-choice-consumers-build.log`。本段相关测试严格类型检查 `/tmp/home-choice-final-types.log` 通过；scoped diff whitespace 检查通过。SDK 文档同步实际 Home 接入方式。

完整 Goal 保持执行中，本段不等于全部插件/工作流内部完整，也不代替一骏本人验收。下一步仍需迁移其他消费场景与作者目录（静态 functionAuthoringDestinations/isFunctionDestinationId、Feed capture、Inbox 结果选项）、发布阶段场景检查、工作流映射与恢复、系统后台事件的明确调用授权及绑定委托。后台目前保留原有限权限，缺少原目标写权限时不能自动执行 Home 判断；不能为恢复自动触发而给任意插件或 MCP 客户端自动加权。Work 创建/关联/Handoff、其他平台服务、MCP 连接收敛及全量清单闭环按此前范围继续。


## 共同场景作者目录、真实用途与发布校验

2026-09-26：规则用途不再由编辑器的固定按钮和 Functions 存储枚举决定。场景从共同服务注册的实际合同派生，插件可使用 Host 未知的有效场景 ID；存储读写均保留身份，来源停用后修改其他字段不会丢失原用途、对象类型或结果映射。UI 按当前项目读取目录，有限推荐结果标签由场景自身的 recommendation_labels 声明，两个场景同名结果不会串用名称。Home 继续从 subject-offers 声明取得选项。非推荐结果合同或同 ID 多版本的作者选择暂明确不可配置，底层场景客户端仍支持显式版本。

目录及用途读取已注册为 functions.authoring.catalog / functions.authoring.usages 系统查询，由当前调用者上下文选择真实 Host 项目，网页仅转发。内部客户端、受授权 MCP adapter 和正式 stdio MCP 使用相同实现；输入不能覆盖项目或权限。发布规则的实际使用位置取自原场景 owner，可展示名称、链接、启用及不可用原因；独立规则也会查询实际引用，不因作者用途为空而误报未绑定。旧 Functions authoring legacy-usages 动作已删除。尚未迁移的旧绑定临时按当前 board 过滤并排除正式场景重复，最终随 Feed 等消费方迁移删除。

系统发布能力新增实时场景检查，使用 Kernel 与绑定/执行相同的对象覆盖、输入输出与推荐引用兼容检查。场景缺失、不可用、版本歧义或映射不兼容时保留草稿并明确拒绝发布。项目编辑器通过项目 transport 发布；独立规则仍可全局发布。异步目录检查结束后再核对发布授权，并以检查前的草稿 revision 写入；并发修改对象范围不能把未经检查的新状态发布。已发布版本重复请求保持幂等，不因后来停用插件而改写旧版本。Feed 尚未迁移的旧作者合同保留临时原兼容检查，不宣称已经走共同场景执行。

清理：删除编辑器 SSR 的固定场景/对象导入和固定按钮，删除 HTTP 私有 catalog/usages 拼装和可选覆盖分支；这些路径改为系统查询。删除旧公开 legacy-usages 注册及 handler。isFunctionDestinationId 改为合同身份语法校验，不再维护四个目的地 ID。旧 SYSTEM_BEHAVIORS、functionAuthoringDestinations 中 Feed/Agent 的仍有真实消费者部分尚未删除。

证据：

- tests/function-scene-authoring.e2e.test.ts 使用正式 SDK/PluginRuntime 注册随机未知场景、插件自己的 SQLite 原笔记与绑定表，在真实 Chrome 编辑器选择用途、对象、Noul 映射、保存、试跑及发布。停用后编辑草稿不丢失引用；恢复后共同 runScene 调用注册写入能力，把原记录改为 ack。编辑器读取真实用途链接，重启后 provider_id 仍固定 system.functions。目录与用途同时经过实际 MCP adapter/授权存储查询，撤权撤回场景，全局查询不显示项目绑定，输入伪造项目被拒绝。
- /tmp/function-context-final-regression.log：47 项通过，包含动态场景实操、Functions 生命周期、草稿失败保留、正式 stdio MCP 目录/用途查询以及既有系统规则回归。
- /tmp/function-context-scenes-regression.log：33 项通过，包含 Kernel 场景协议、原 Home/Inbox 消费、实际 HTTP/工作流/调度器触发及新推荐标签合同校验。该命令曾包含一个不存在的 local-host-action-scenes.test.ts 路径（tsx 没有执行它）；实际 Host 策略另用存在的 local-host-actions.test.ts 验证，/tmp/function-publish-host-policy.log 8 项通过，包含异步可用性与场景策略；不把不存在的路径计作通过。
- /tmp/function-publish-regression.log：发布校验加入后 47 项通过，包含缺失、停用、歧义版本、错误对象和错误映射拒绝，以及真实并发修改拒绝；其他项覆盖 HTTP、内部调用和正式 stdio MCP。/tmp/function-publish-tests.log 的陌生场景实操及作者 API 4 项通过。并发测试兼容 ES2022 后单独复核见 /tmp/function-publish-cas-final.log。
- /tmp/function-publish-browser.log：陌生场景作者链路和原 Home offers 实操两项通过，含 390px 窄屏、来源停用恢复和真实业务结果；已查看 .impeccable/review/function-scenes/missing-scene.png、real-usage.png、real-usage-narrow.png。修正实际启用用途旁仍显示“发布后启用”的误导文案，现显示“已启用”。
- Contracts、Kernel、Functions、Workbench、LocalHost 构建通过；最终 Kernel/Functions/Workbench/Host 日志为 /tmp/function-publish-{kernel,module,workbench,host}.log。相关测试严格类型检查 /tmp/function-publish-types.log 通过，scoped diff whitespace 检查通过。SDK 文档已写明场景声明、标签范围、系统查询与发布合同。

未完成：通用作者界面的显式场景版本/提供方选择、非推荐 typed Choice/Noul/Score 合同、通用启用控件（当前 Home/Inbox 仍有原生配置入口）、scene-only 插件授权发现、提供方完全撤回后的使用位置持久可见性；Feed capture、Inbox 旧符号、Agent 旧行为目录仍需迁移与清理。目录新增系统查询不代表全部旧行为项已符合实时授权，也不代表每个旧平台/MCP 查询都已清理。后台自动事件明确授权/绑定委托、工作流映射与恢复、Work 创建/关联/Handoff、其他平台服务和 MCP 连接收敛继续按总清单推进。完整 Goal 未完成，本段实操不代替一骏本人验收。


## Feed 捕捉规则的共同管理入口

2026-09-26：上一轮共同作者目录、MCP 查询和发布校验属于已验证进展，本轮继续处理真实 Feed 消费方。代码核对发现捕捉规则本身在项目 feed_out_rules，函数绑定在 Home Functions 库，HTTP 则直接调用临时 FeedApplication。按依赖顺序先统一规则管理入口，再切换绑定与触发；完整 Feed 场景迁移仍未完成。

Feed manifest 已声明 feed.rules.list/create/update/delete/preview，插件自己提供合同和处理器。Host 的原内容 provider 一起注册这些处理器，没有新增总表或并行规则目录。HTTP 的这五条路由已删除直接业务调用与独立预览实现，只保留旧字段解析并转发共同客户端。目录、关键词预览要求 feed:read，规则写入另需 feed:write；正式 MCP 按原客户端/项目/提供方的精确动作 grants 使用。输入不接受 board_id/project_id，显式来源必须属于当前项目，编辑其他字段保留已有失效来源引用。

规则仍由原 FeedApplication 和 feed_out_rules 保存，管理操作不补跑已有消息。预览读取最近五条原消息（含解封后的正文），不调用模型、不写 Inbox、不生成成果、不修改规则。旧函数绑定创建失败仍撤销新规则；没有判断服务时不再默默保存未经校验的函数配置。更新先通过原存储的全部字段校验、确认规则存在，再调用旧绑定适配，修复无效名称或不存在的规则先改绑定后报错的问题。尚未解决的跨库提交及运行时授权边界随共同场景迁移处理，不能把此顺序修复宣称为跨库原子事务。

证据：

- /tmp/feed-rule-actions-tests.log：22 项通过，原 Feed 规则/界面及未知插件工作流内容合同回归。
- /tmp/feed-rule-actions-final-tests.log：28 项通过，包括原 Feed 捕捉、Inbox/Pages 流程、HTTP CRUD 和正式跨进程 MCP。tests/home-mcp-actions.test.ts 使用实际 desktop MCP launcher 与官方 SDK：无 grant 时不可见，授权后创建、预览原文、读取、停用、删除规则，网页读取同一条原记录；撤权、伪造 board_id、外来来源均被拒绝。预览期间判断 provider 调用数保持零。
- /tmp/feed-rule-actions-owner-final.log：原 owner 的两项定向回归通过，确认无判断服务不创建残留规则，无效修改/不存在规则不改变旧函数绑定。
- /tmp/feed-rule-actions-browser.log：真实 Chrome 创建来源及拉取计划，再进入捕捉规则页面预览、保存并读取原规则通过。原测试曾依赖已移除的 dialog.open 和创建来源时的规则字段，已按当前 section.hidden 与独立规则页面更新；保留计划校验，并新增预览前后规则完整相等断言。只运行此用例，未将同文件其他旧场景计作通过。
- Feed、Workbench、LocalHost 构建通过，日志 /tmp/feed-rule-actions-plugin.log、feed-rule-actions-workbench-final.log、feed-rule-actions-host.log；变更测试严格类型检查 /tmp/feed-rule-actions-types.log 通过，scoped diff whitespace 检查通过。两处旧 Feed UI fixture 的非法 disposition=feed 改为原模型现用的 inbox，运行断言仍通过。

下一步：把捕捉规则的精确判断引用与版本收敛到规则 owner，接通 feed.capture 的 bindings/bind/prepare/consume/failed；迁移已存函数键及原判断历史，并接通现有消息 evaluate、来源 ingestion/connector/scheduler 事件及真实入箱结果，然后删除旧 JudgmentPort、静态 Feed 候选与临时作者兼容。当前 evaluate HTTP 与自动判断仍走旧路径，未注册成已完成共同场景执行；不得将管理入口的 MCP 成功等同于它们也已完成。其余全量插件、工作流、平台服务、权限与产品闭环继续保留在原 Goal 内。


## Feed 捕捉场景与真实消费完成迁移

2026-09-26：在上一段规则管理基础上，feed.capture 已由 Feed 声明及实现 bindings/bind/prepare/consume/failed。精确判断引用及每次配置 revision 保存在原 feed_out_rules。旧全局绑定在项目保存后清理，无法恢复的旧函数键原样保留为失效配置；历史不删。没有新建规则表或判断历史副本，也不宣称两个数据库间原子事务。

来源 ingestion、连接和调度器使用共同触发；手动处理、工作流透传原调用者及发起动作的授权校验。共同执行核心在成功/失败结果消费前重查授权，再检查原绑定和原文。规则写入验证后按 revision 保存，自动入箱配置另需 inbox:write。只有规则明确允许入箱时，肯定结果或 needs_review 才写入原 Attention；原 Attention owner 负责后续 Inbox 事件。捕捉历史已写入但后续处理失败属于部分完成，不承诺跨库回滚或自动重试。

Feed 选择器、原文试跑、已有消息处理及当前建议均消费共同能力；插件判断无需系统函数键。晚到的目录响应不会清空新选择。使用位置能直接打开对应来源规则。当前建议核对原绑定、精确引用、原文摘要和实时授权，失效后保留配置/历史但撤回建议。删除旧 JudgmentPort 执行分支、Host 静态 Feed 候选、旧 offered-behaviors 辅助函数和临时 Feed 发布绕过。

证据：

- /tmp/feed-capture-verified.log：49 项通过，覆盖共同执行核心、Feed 原业务、Inbox/Home 自动处理及正式跨进程 MCP。
- /tmp/feed-capture-effects-final.log：4 项通过，包括真实来源入箱后触发 Inbox 下一步。此测试发现并修复来源实例与场景实例的事件队列归属问题。
- /tmp/feed-capture-owner-final.log：13 项通过，新增执行期间撤权、手动处理期间修改绑定、配置异步校验期间并发修改、无入箱权限不能创建自动入箱规则；不产生旧判断或覆盖新配置。
- /tmp/feed-capture-authoring-regression.log：7 项通过，系统规则编写、发布、试跑取消、连接选择与重启回归。
- tests/home-mcp-actions.test.ts 使用实际 desktop MCP launcher 与官方 SDK 创建精确绑定、处理原消息、核对原判断/Attention/网页及当前建议。撤权后处理拒绝、当前建议撤回、历史保留。
- tests/feed-capture.e2e.test.ts 使用正式 SDK/PluginRuntime 安装随机未知判断，真实 Chrome 完成选择、原文试跑、保存、处理已有消息和实际入箱；停用后保留引用及失效提示，实际 usage 链接定位对应规则，390px 无横向溢出。最终日志 /tmp/feed-capture-browser-final.log；截图 .impeccable/review/feed-capture/unavailable-narrow.png 已查看。
- Kernel、Feed、Inbox、Workbench、LocalHost 构建通过，变更测试严格类型检查 /tmp/feed-capture-types.log 通过。

剩余：Inbox 静态 Functions 展示与旧建议投影正在接续迁移。通用作者版本/提供方及启用控件、typed Choice/Noul/Score、scene-only grants、后台绑定委托、全部工作流/Work/其他平台服务与系统岛闭环仍在完整 Goal 中。原生来源事件采用有限既有权限，不等于任意插件获得后台执行授权；本段实操不等于一骏本人验收。

## Inbox 的当前绑定与建议改为共同查询

2026-09-26：接续 Feed 切片，发现 Inbox 执行已支持未知插件判断，但网页仍用旧 function_key 与静态系统函数列表拼装绑定名称，并把无来源依据的旧判断当作当前建议。本段消除这条展示旁路。

`inbox.judgment.read` 现在返回真实绑定的名称、启用与实时可用状态；`inbox.judgment.recommendations` 由原场景 owner 核对精确提供方/能力/版本、绑定 revision、事项状态和原文后返回当前结果。新历史使用原 `scene_provenance` 字段；缺少依据的旧历史保持可读，但不进入当前建议。判断读取已有材料解封服务提供的正文。展示结果和重新判断使用同一绑定，插件判断不再被界面误报为“未绑定”。

网页、Inbox fragment 与 Feed JSON 都读取相同的授权查询。删除 `readFunctionScenesView`、静态 publishedChoicesForScene、网页 function_scenes 属性及 Functions 数据库时间戳缓存依赖；Inbox manifest 只声明真实 action_scenes，不再重复声明旧 function_scenes。仅保留仍有消费方的兼容 function_key 输入及作者启用入口，它们转发同一场景服务，不新建绑定或执行路径。旧“在 Functions 配置”文案改为“配置判断规则”。

Inbox HTTP 改用已有 `bindLocalWebActions`，读取安装记录中的实际 grants；未知插件拥有自定义权限时可以在本地用户授权下真实执行，无需给 Host 增加权限名单。MCP 继续使用独立客户端/项目 grants，不借用本地用户身份。

验证：

- `tests/inbox-current.e2e.test.ts`：正式 PluginRuntime 安装随机未知判断及自定义权限，真实 Chrome 显示其名称、点击更新建议，核对模型实际收到原文和原数据库历史；事项仍保持待处理。停用后 390px 界面保留失效绑定、禁用更新按钮、撤回建议，原历史保留。日志 `/tmp/inbox-current-browser-final.log`，截图 `.impeccable/review/inbox-current/unavailable-narrow.png` 已查看。
- `tests/home-mcp-actions.test.ts`：实际 desktop MCP launcher 与官方 SDK 读取、绑定、运行 Inbox 判断；MCP 与网页看到同一条原历史。撤销 MCP 判断 grant 后该客户端当前建议消失，本地用户独立授权仍有效；暂停原绑定后网页当前建议也撤回，原历史仍在。
- `tests/inbox-action-scenes.test.ts`：未知判断、原绑定重启、原事项与原文变更后撤回建议、旧历史无来源依据时不冒充当前结果，以及停用/失效回归。旧测试直接注入原材料时误用了逻辑 project_id 列，已按原数据库实际 board_id 修正，单独回归 `/tmp/inbox-current-owner-final.log` 通过。
- Feed/Inbox owner、原 HTTP 及正式 MCP 的最终并发回归 `/tmp/inbox-current-final-regression.log` 中 24 项通过，自动事件用例发生一次本地 HTTP `ECONNRESET`。单独复核同一用例 `/tmp/inbox-current-automatic-final.log` 通过（6.1 秒），未修改生产逻辑或放宽断言；并发时连接重置的原因尚未确定，不将该并发运行写成全绿。移除静态场景快照后的 Home 配置与声明回归 `/tmp/inbox-current-functions-regression.log` 两项通过。严格类型检查 `/tmp/inbox-current-types.log` 通过，Inbox、Workbench、LocalHost 构建 `/tmp/inbox-current-{plugin,workbench,host}.log` 通过，scoped diff whitespace 检查通过。

未完成范围不变：通用作者的版本/提供方/启用控件、Inbox 既有推荐符号与 Agent 静态行为目录、所有后台绑定委托和工作流输入映射/恢复、Work 创建/关联/Handoff/终端、Schedule/Shelf/Experiments/Builder/Workspace/Character、连接与对外接入的产品收敛、全插件清单闭环与系统岛最终实操。尚未迁移的 Inbox 工作流 flush 仍须透传发起调用者并核对外层动作授权，不能把本段本地用户入口迁移等同于全部后台身份已收敛。没有将完整 Goal 标为完成，也没有替代一骏本人验收。

## 工作流交接保留调用者及发起动作授权

2026-09-26：上一轮属于有实质进展，本轮核对实际代码后修复 Inbox 内容接收的 `flush()` 丢失上下文问题。Inbox 向 Feed 转交新材料及消费入箱事件均透传原调用者；交接没有模型权限时仍保存有权写入的材料/Attention，不借原生后台身份运行判断。

contracts 新增 `retainActionAuthority`，仅组合已有授权回调，保留原调用者、项目、允许动作、权限及信号。Feed 的已有专用 helper 删除，Feed evaluate/receive 与 Inbox evaluate/receive 共用该实现。固定发起能力及提供方后，嵌套执行和消费前检查同时覆盖发起动作和目标判断；Inbox 在异步 Feed 接收返回后、创建 Attention 前也复核发起授权。没有增加授权存储、权限名单或并行执行核心。

Inbox 工作流只清理本次 entry_id 的原待判断事件；`FeedApplication.flushPendingInboxJudgments` 支持限定事件，其余事件保留给原生产方。这样一个用户操作不会拿自己的身份排空其他来源队列。事件仍在原内存队列中，不宣称有持久投递或中断恢复；材料已写入而后续失败仍属于部分完成，不自动重建材料或伪装回滚。

证据：

- `/tmp/nested-authority-tests.log` 13 项通过：实际工作流接收在缺少 model:invoke 时保持材料/事项但不调用判断；显式 Inbox 判断中撤销发起动作后不写历史；原 SQLite/Feed 事件队列只消耗选中条目，其他来源事件保留；既有 Feed 精确绑定、迁移、撤权、原文变化及 Inbox/Pages 路径回归。
- `/tmp/nested-authority-transport.log` 4 项通过：真实 desktop MCP launcher/官方客户端原 Home、Feed、Inbox 调用链，以及正式 Runtime 未知插件的工作流保存、执行和 MCP 业务数据读取。
- Contracts、Feed、Inbox、LocalHost 构建通过，日志 `/tmp/nested-authority-{contracts,feed,inbox,host}.log`；相关严格类型检查 `/tmp/nested-authority-types.log` 通过，scoped diff whitespace 检查通过。SDK 和 Inbox README 已同步。

下一处已核实的缺口：`apps/workbench/src/functions/client.ts` 的 boardScenePath 和启用按钮仍只认识 home.dock / inbox.next。未知消费场景虽可被发现、发布并通过场景客户端运行，作者界面仍只能提示去消费方配置。需由消费方声明真实可配置位置及创建/修改合同，提供通用启用入口，不能由 Host 猜测绑定 ID、制造不存在的规则或维护新白名单。Feed 的多条来源规则与 Home/Inbox 的项目单一绑定必须沿用各自 owner。其他全量迁移范围继续有效，完整 Goal 未完成。


## 通用配置位置、真实启用与原存储条件更新

2026-09-26：场景 owner 可声明配置权限并返回真实 targets。Home/Inbox 的固定项目位置和 Feed 的已有来源规则共用此合同，未知 Runtime 插件不需要修改 Host ID 分支。系统 authoring.targets/configure、HTTP 和编辑器使用相同服务；已删除编辑器 boardScenePath 及 Home/Inbox 专用启停请求。配置固定场景版本、提供方与读取时 revision，原 Functions/Feed/插件数据库原子检查后保存；未绑定位置才允许空 revision。旧内部入口继续使用同一 owner，不新增绑定库。SDK 已导出相关类型并更新开发文档，旧文档要求往 function_scenes 行为池加名单的说明已删除。

配置状态与判断运行状态分别返回，判断断连时可以停用原引用；启用时核对兼容性、执行权限和位置额外权限（如 Feed 自动入箱）。Runtime 在最终写入前核对本安装的完整所需权限。MCP 的可信 validate_permissions 回调重读原授权，防止调用期间撤销场景写权限后继续落库；该回调不作为业务输入或配置持久化。网页发现也已覆盖仅贡献场景的插件，其权限来自原安装记录，不能用别人的动作权限放行未知动作。

证据：

- `/tmp/scene-targets-contract-tests.log` 37 项通过，含共同核心、Manifest 与 Runtime。未知 SDK 插件的真实 SQLite 配置验证空位置、来源固定、旧 revision、异步校验期间原 owner 并发修改、提供方重载、管理撤权、仅启用权限撤销及停用保留。
- `/tmp/scene-targets-native-final.log` 1 项通过，真实 Home/Inbox/Feed 存储逐个核对。Feed 只列已有来源规则，自动入箱权限影响启用但不阻止停用；Home/Inbox 在异步检查后发生原库修改时拒绝覆盖。
- `/tmp/scene-targets-transport-tests.log` 15 项通过，包括官方 SDK 经真实 desktop stdio MCP 与常驻 Host 配置 Inbox、拒绝旧请求、读取原判断与网页一致结果，并在判断授权撤销后停用同一绑定。
- `/tmp/scene-targets-browser-final.log` 1 项真实 Chrome 通过：未知插件从编辑、预览、发布到真实按钮绑定，判断更新原笔记状态；MCP 修改同一插件配置后网页恢复启用；调用中撤销场景写权限不改原绑定。1280px 与 390px 操作和截图已检查，窄屏实际完成停用/启用，无横向溢出。截图 `.impeccable/review/function-scenes/real-usage.png` 与 `real-usage-narrow.png`。
- `/tmp/scene-targets-regression.log` 12 项通过，覆盖 Feed、Home、Inbox、系统 Functions 和本地授权；独立 scene-only 插件无动作也能进入本地配置目录，撤权/停用后同步失效。此前作者服务回归 `/tmp/scene-targets-initial-tests.log` 18 项通过。
- Contracts、Kernel、Runtime、Functions、Feed、Workbench、LocalHost、SDK 构建通过；相关严格类型检查 `/tmp/scene-targets-types-final.log` 无错误，限定 diff whitespace 检查通过。首次浏览器扩展在页面重新载入后过早点击隐藏步骤失败；改为等真实配置控件加载后操作，后续真实路径通过，未修改生产语义来绕过断言。

仍未完成：作者用途的显式场景版本/提供方选择和非推荐 typed Choice/Noul/Score；提供方完全撤回后原使用位置的持续可见性；仅有场景、没有承载相关权限动作的插件对外 MCP 授权；缺失场景运行权限时的独立配置管理。当前场景发现仍按运行权限过滤，不能把“判断失效可停用”扩称为任意撤权后仍可管理。Agent 旧目录、Inbox 旧符号、后台绑定委托、工作流映射/恢复、其他存量插件与系统岛最终闭环仍按总 Goal 推进。未提交/PR，未将 Goal 标完成，未代替一骏本人验收。

下一处已核实缺口：`tooling/plugin-cli/src/create.ts` 仍生成 schema/API v1 的 Integration 插件，`sample-source.ts` 只有直接轮询、Artifact 与 UI，没有注册公共动作；仓库 `examples/plugin-sample` 也是相同旧模板。需在保留真实私有存储/Artifact/轮询价值的前提下，使生成项目默认进入同一动作服务，并用打包后的公共 SDK、真实 Runtime/Host 和 MCP 验证。不能只改示例声明而不接执行或破坏正式 plugin dev 路径。


## 生成插件模板默认注册系统动作

2026-09-26：CLI create 和仓库 plugin-sample 更新为 v2/API v2（模板版本 2.0.0）。三项 public definition 统一写入 Manifest，生成源码从同一份声明绑定 handler：公开 health、owner 的 results.read/results.publish。删除没有实现引用的 connector.sample.v1 capabilities 标签；Connector driver 仍通过原 Integration 合同运行。

原 poll 改为调用 services.actions 中已注册的 publish；Artifact 版本写入、读回和私人计数只保留一份业务实现。UI 继续读取原计数，崩溃恢复/卸载保留原 Artifact。个人状态动作使用已有 bindOwnerPluginAction，限制为本地用户，不假装已解决外部客户端的个人成果归属；MCP 可明确授权公开 health。没有新增自动 grant、Host 模板 ID 白名单或私有 SDK 深层引用；生成项目不伪造缺少业务用途的判断场景。

证据：`/tmp/plugin-template-final-tests.log` 6 项通过。实际 CLI create/validate、pnpm pack 公开 SDK/Contracts、离线安装到干净目录、应用 plugin dev 两个进程、仓库样例、正式 Runtime/PluginHostExecutor 的查询与写入均运行成功。轮询实际经过共同分发器，读取结果与原 Artifact/UI 一致；拒绝跨用户个人写入、缺权限和注入 actor 字段。MCP 协议端点列出并调用同一 health 动作，拒绝私人入口；卸载后目录撤回，原数据保留。此处协议验证使用 createActionMcpPorts/handleMcpMessage，未冒充额外一次跨进程官方 MCP SDK 验证。CLI pack/sign/verify 的篡改与身份校验通过，未触及用户密钥。

Plugin CLI 构建 `/tmp/plugin-template-build-final.log` 与相关严格类型检查 `/tmp/plugin-template-types-final.log` 通过；scoped diff whitespace 检查通过。模板变为 v2 后，原打包测试把 permissions 清空会先触发 Manifest 无效；测试改为修改仍合法的外层名称，继续验证它与内嵌 manifest 不一致会拒绝，未放宽生产检查。首次扩展测试的局部变量遮蔽和既有 union 类型收窄问题均已修正。CLI/样例 README、SDK 和总 spec 同步。

两段已完成的增量是“通用位置配置”与“生成模板注册”。完整 Goal 继续 active。下一段优先核对场景作者的准确版本/提供方意图，以及运行授权与配置管理授权的边界；仅场景插件对外 MCP grant、停用后使用位置可见性、旧 Agent/Inbox 目录与全量消费者、工作流、Character/系统岛审计仍未完成。未新建任务、提交或创建 PR，也未宣称整个系统已达到内部完整。

## 场景管理动作与独立授权

2026-09-26：补齐上一节的场景管理授权缺口。共同 Host 在原 provider 注册中派生 `scenes.targets:<scene_id>`、`scenes.enable:<scene_id>`、`scenes.disable:<scene_id>`，版本和提供方来自场景原声明，随原注册撤回。公共 SDK 暴露定义帮助函数，插件只需兑现原 targets/bind 合同。没有新增授权表、绑定副本、业务分发名单或第二套 MCP 工具表。

共同核心和 Runtime 分开检查配置权限与运行权限：查看/停用只需配置权；启用还需场景执行权、准确判断动作及位置附加权限。系统 authoring 配置改为转发自动生成的动作，目标查询仅调用当前授权的准确场景查询。Host 返回的启用/停用状态也按实际管理动作授权计算。管理动作及原发起作者动作的授权沿嵌套调用保留，在最终写入前复核；即使其他动作仍授予同名权限，也不能代替已撤销的准确管理动作授权。

证据：

- `/tmp/scene-management-final-regression.log` 37 项通过，覆盖共同核心、Host、系统作者、原生配置、安装权限、MCP grants/设置和协议。新 `tests/scene-only-mcp.test.ts` 使用无自定义动作的未知正式 Runtime 插件，自动生成三项管理动作，经受保护 HTTP 设置和生产 LocalMcpServer 授权/调用。真实原 SQLite 配置和消费结果均验证；只查看不能停用，缺运行/判断权仍可停用，启用拒绝，保存期间撤销准确动作后零写入，跨项目/提供方/过期 revision 拒绝，停用和重启不丢配置。本用例是生产 MCP 消息端点验证，不冒充额外一次跨进程 stdio 实测。
- `/tmp/scene-management-native-tests.log` 两项通过，含 Home/Inbox/Feed 原生配置和官方 SDK/真实 stdio MCP。本轮原生配置扩展验证仅配置权限、没有运行/判断权限的停用；正式 MCP 授予自动生成的 Inbox 管理动作后配置同一存储。
- `/tmp/scene-management-browser-final.log` 真实 Chrome 一项通过，未知插件编辑、试跑、发布、绑定、实际笔记状态消费、网页/MCP 同配置和窄屏启停。撤权场景改为撤销准确生成的 disable 动作，保留其他同名权限，最终写入仍被拒绝。
- Contracts、Kernel、Runtime、Functions、SDK、LocalHost 构建通过；`/tmp/scene-management-types-final.log` 严格类型检查通过。扩展范围发现 Host 旧测试将可同步/异步接口直接传给 assert.rejects 的类型错误，改为 async 回调，保留原断言。新夹具初次误用 judgment operation 和过短测试 token 均已修正，生产契约未放宽。

SDK 与开发文档已移除“仅场景插件尚无 MCP 授权入口”的过时说明。提供方完全撤回后的持久使用位置、作者显式场景版本/提供方和非推荐结果编辑仍未完成。旧无 options 的 bind 兼容入口仍执行原运行权限合同；通用作者/MCP 管理走新的带 revision 配置路径。其余全部存量插件、工作流、Character/Agent 和系统入口清理继续，总 Goal active，未宣称内部完整或用户验收。

## 作者用途固定场景版本与提供方

2026-09-26：Functions 原表增加可空 `scene_version` / `scene_provider_id`，草稿编辑、持久读取和系统作者 schema 共用字段。同名不同版本在目录和编辑器分别显示，选择/切换不会只比较 scene_id；结果标签按场景/版本/提供方匹配，不能借另一个版本的同名符号。失效后保存无关编辑保留原引用。已发布记录保持不可变，旧数据不猜历史来源。

发布阶段验证准确场景，并在原草稿 revision 的同一次条件更新中保存解析出的引用。旧未固定草稿只有唯一兼容来源才能完成此升级，歧义或原来源缺失保留草稿。新发布动作的可选 `result_scene` 是消费合同约束，不是调用依赖：共同 Kernel 在发现、绑定和实际运行核对场景 ID/版本/提供方，来源替换不能接走原持久绑定；独立调用判断仍可进行。此前“多个版本一律不可配置”的限制已移除。SDK、共同作者选项 helper、编辑器和文档同步，没有增加平行存储。

证据：

- `/tmp/scene-intent-final-regression.log` 扩大回归 83 项，80 项当次通过（包括核心、发布、原数据、草稿保留、Home/Inbox/Feed 场景、配置和 Manifest）。另两项为旧测试仍要求原生分支/全局 Feed 固定选项，一项标准 MCP 在并发负载中超时。未将该次结果记为全绿。
- 旧 Functions 测试已清除过时原生路由期望；无项目目录中的 Feed 应标为未注册并返回空配置选项。`/tmp/scene-intent-plugin-final.log` 全部 18 项通过，保留真实连接配置/密钥不回显、草稿与发布行为。旧行为夹具从 Feed manifest 继承了新 action_scenes 而未兑现，已在该隔离 behavior 夹具中明确清空；前一轮 `/tmp/scene-intent-backend-final.log` 39 项全部通过。
- `/tmp/scene-intent-stdio-final.log` 单独复核官方 SDK/真实 desktop stdio MCP 通过，约 31 秒；保留原 90 秒超时阈值，未放宽生产检查。目录、网页事实、判断、管理动作和撤权保持一致。
- `/tmp/scene-intent-authoring-final.log` 5 项通过，含正式 Runtime 未知插件的 Chrome 实操和作者服务。真实界面选择同名 v2、读取 v2 标签、切回 v1，仅一个当前选项；停止来源后编辑保留 ID/版本/提供方/映射；发布、原 SQLite 绑定和实际笔记消费、MCP 修改同一配置、精确撤权、390px 启停和重启后原引用保留均通过。
- 核心新增用例用原持久绑定执行成功，再替换消费提供方；共同运行拒绝且原 consumer 不再产生副作用，独立判断仍能调用。作者用例拒绝不完整引用、错误提供方、未固定的多版本歧义和错误版本绑定，验证旧草稿唯一匹配时原子固定。共同作者 helper 在 ID 歧义时不猜测，在显式版本下返回该版本标签。
- Contracts、Kernel、Functions、SDK、Workbench、LocalHost 构建通过（`/tmp/scene-intent-*-build.log` 及 `contracts-final`、`workbench-final`、`host-final` 日志）；相关严格类型检查记录 `/tmp/scene-intent-all-types-final.log`。测试 provider 旧 union 推导导致空 probabilities 含可选 undefined，补显式真实返回类型，未改变 fixture 行为。限定 diff whitespace 检查通过。

已查看桌面和窄屏实际截图：`.impeccable/review/function-scenes/version-selection.png`、`version-selection-narrow.png`、`real-usage.png`、`real-usage-narrow.png`。首次扩展窄屏测试把另一版本已有的“启用”按钮误认为停用请求完成；选择器改为准确场景版本后，验证原绑定真实变化并通过，没有绕过异步保存。图片与自动实操属于覆盖路径的证据，不代替一骏本人验收。

完整 Goal 继续 active。下一段仍需非推荐 typed Choice/Noul/Score 作者合同、提供方完全撤回后的持久用途显示、旧 Agent/Inbox 目录与符号、后台绑定授权、工作流通用映射/恢复、其余存量插件消费者及系统岛最终闭环。未提交、未创建 PR、未将本阶段当作整体内部完整。

## Agent 作者目录与精确能力推荐

2026-09-26：完成 Agent 判断用途的注册目录、原记录映射、返回合同与真实编辑/调用链。本段不代表内置 Agent/Character 工具执行整合完成。

作者选项由当前授权 ActionView 派生，仅包含声明 agent/mcp audience 的实际能力。稳定选项键基于能力 ID、版本和提供方，显示原标题、来源、版本与不可用原因。页面场景的输出符号与 Agent 能力选项分开按用途查询，空对象限制表示通用能力；不再通过旧 Manifest/MCP/System 名称猜测能力，也不在全局目录凭空展示项目场景。

原 Functions 表新增 action_map_json，Choice/Noul 输出键可对应准确能力/版本/提供方。空映射只返回判断，Score 暂仅评分。发布验证准确引用、对象类型和当前授权；已发布定义声明 required_actions，通用 functions.invoke 与直接发布动作都在模型前后重查。推荐通过 recommended_actions 返回并保存在原判断历史新增字段中，不填参、不执行，也不扩大权限。旧规则的字符串选项、版本、试跑和历史保持不变，不按旧名称猜测新能力。

真实界面可从目录添加 Choice 结果，或为 Choice/Noul 选择目标；清空映射后编辑其他条件不会自动恢复。停用/缺失原提供方保留原映射，重启后原引用恢复。来源失效或无权时拒绝发布/调用；不同版本、替换提供方和不兼容对象类型不能接替原引用。

清理：删除 Host 静态 SYSTEM_BEHAVIORS、Manifest/凭据派生目录与白名单辅助函数；删除 Contracts 的固定作者目的地/目录组装；删除已经无生产调用者的 FunctionsService.judge、allowed_behavior_ids 与旧 JudgmentPort。历史读写和现有场景存储保留。旧兼容 MCP 名称继续薄转发共同动作。独立编辑器预览脚本迁到实际注册目录，删除过时 catalog 注入。连接说明不再把账号绑定宣传为 Agent 能力注册；旧 GitHub/目录连接的 whoami 仍经设置路由执行，正式动作迁移待继续，未以删掉虚假选项冒充迁移完成。

验证证据：

- `/tmp/agent-rule-browser-final.log` 两个真实 Host/SQLite/浏览器用例通过：新 Agent 用途与此前未知插件场景编辑。未知 Runtime 插件通过正式注册出现，桌面/390px 可保存精确引用；停用保存、重启、Choice 增加/清空/改映射均验证。最终增加对象兼容与旧 judge 清理后，Agent 浏览器用例再次通过，见下一条。
- `/tmp/agent-rule-final-transport.log` 14 个用例通过，含最终 Agent 编辑与生产 LocalMcpServer tools/call、原插件 SQLite 查询/写入、模型中途撤权/停用不留错误历史，以及官方 MCP SDK + 正式 stdio 兼容名称/逐客户端授权回归。新推荐链路通过 LocalMcpServer 消息入口验证；官方 stdio 用例验证判断执行与授权回归，二者不混称。模型为明确的本地模拟，业务存储、注册、授权和传输路径真实。
- `/tmp/agent-rule-cleanup-regression.log` 57 项中 56 通过，唯一失败是连接说明仍断言旧 github.whoami 宣传文字；已改为检查实际账号检查说明，相关连接用例在上述最终 14 项中通过。通过范围含 Functions 原发布/作者 API、旧历史、Inbox 场景与自动触发。
- `/tmp/agent-rule-store-final.log` 3 项通过：精确 Choice 结果与不确定/未映射结果、草稿引用/清理边界、删除新列模拟旧库后重新升级，原已发布身份/模型版本/试跑/历史不变。
- `/tmp/agent-rule-retention.log` 原编辑器失败保存、切换与快捷键草稿保留回归通过。新 Agent 浏览器测试首次因只等待静态按钮存在、未等编辑器加载就点击而失败，改为等待实际映射加载，未修改生产语义绕过断言。
- Contracts、Functions、Workbench、LocalHost 构建通过（`/tmp/agent-rule-*-cleanup.log`、`functions-final.log`、`host-complete.log`）；相关测试与独立预览脚本严格类型检查 `/tmp/agent-rule-types-final.log` 通过。范围 diff whitespace 检查通过。桌面与窄屏截图已查看：`.impeccable/review/function-agent/recommendations-desktop.png`、`recommendations-narrow.png`。

完整 Goal 继续 active。内置 Agent/Character 授权工具整合、旧连接/MCP 客户端与平台能力迁移、非推荐 typed 结果作者合同、提供方完全撤回后的持久用途展示、后台绑定授权、工作流映射/恢复、其余插件消费者与系统岛最终闭环仍未完成。未提交、未创建 PR，未将工程或浏览器验证当作一骏本人验收。

## Agent 实际工具执行与 F1–F3 审查修复

2026-09-26：内置 Agent/Character 的精确 Action 选择已接入原 AgentHost、Prologue SDK 正式工具扩展和原审查队列。Character 只能缩小本轮显式选择；每次调用回到原 ActionClient，复查精确客户端授权、项目、提供方、取消和角色状态。原 SQLite 写入与真实 SDK 交错用例通过（`/tmp/agent-actions-sdk-final.log` 2 项；`/tmp/agent-actions-regression.log` 29 项），但浏览器能力选择最终复跑、Coding/Character 公共管理动作以及全量消费者尚未完成。

F1：PluginHostExecutor 从真实激活固定身份与声明，SDK 不接受 options 覆盖；未知插件无需加入内置角色名单。会话持久 owner 增加 actor，旧记录仅按明确的 web-user 兼容，不改写历史。所有 typed Agent 会话、run、审查、恢复与控制使用原归属。复查发现并修复停用清理期间未立即撤权、校验后可变输入可换成 foreign run 两个 P1；模型配置后到最终 Node 网络派发的竞态正与 Prologue 整文件 owner 收口。beforeStart 与持续 beforeDispatch 分开，后者不保留短命 invocation。

F2：共同 ActionExecutionContext.beforeEffect 在异步工作后、实际提交前复查原注册实例、权限、安装、项目生命周期和取消；Form、Dataset、Lingguang、Pages、Cognia 使用同一检查。Pages 检查拒绝不额外写失败状态，保留原租约恢复机制。typed Action 保留原 Runtime 绑定。测试已覆盖替换提供方、等待期间撤权/停用/取消、原 SQLite 不变与授权恢复。首次 standalone 17 项通过，2 项是夹具错误（JSON 可选字段与 personal Form 不受项目安装控制）已修；后续混合回归 31 项通过、3 项完整 Host 重复启动超时，不能记成全绿。轻量原 LocalHost/Form/SQLite 探针三种交错均通过，仍需修正后的单独回归完成最终证据。

F3：max_turns、max_output_tokens、max_total_tokens、max_duration_ms 已校验并映射 SDK；`/tmp/agent-budget-prologue-final.log` 5 项通过真实 SDK 请求、token/轮次终态与 fetch AbortSignal。证据不扩大为任意长工具/人工等待的全程硬截止保证。

本轮新增证据：`/tmp/agent-plugin-identity-final.log` 未知插件真实 Runtime 身份、伪造拒绝、跨安装隔离与清理中撤权 1 项通过；`/tmp/agent-start-authority.log` 输入篡改和 Prologue/CLI 模型配置期间撤权 3 项通过；`/tmp/plugin-host-executor-final.log` 3 项通过；修复既有 agent-host.test.ts 缺失闭合括号后 `/tmp/agent-host-syntax-fixed.log` 22 项通过。Host-only 夹具原 actions.project_id 错用 board_id，已改为原 client 项目身份，未放宽生产授权。

共同 schema 注册在单次 provider 内复用相同原 schema 对象的编译结果，保留不可变快照与重新注册校验；对应 ActionService 回归通过。整站仍有导航/事件派发超时，独立 AJV 微基准未复现，不据此宣称性能已修好。体验 owner 已验证 Search 分屏与灵光主路径；Form/Shelf 完整 Host 路径未通过，最终系统岛验收待继续。

共享构建遵循单写窗口。Contracts、AgentHost、Workbench、LocalHost、Desktop 增量通过；运行时 smoke 随后发现 Connector 新 export 尚未 emit，补编 connector-host 后原 project-host 动态导入通过（`/tmp/action-host-import-smoke.log`）。不以 TSC 单项通过替代依赖齐全。纯推理/SDK 收敛、个人助理与 WorkReuse 接线、Connector MCP 正式 Action provider、F4 工作流幂等恢复及其余迁移仍未完成，Goal 保持 active。

## 注册性能、无工作区角色与共享推理合流

2026-09-26 后续验证：F2 修复后的完整 Host/原 SQLite 单独回归 19/19 通过（`/tmp/action-before-effect-after-compiler.log`，66.46 秒，原 15 秒用例时限未扩大）。覆盖 Form、Dataset、Lingguang、Pages、Cognia 等待期间撤权、停用、取消、提供方替换与授权恢复；撤权后不能写成功结果或失败账目，已有运行记录仍由原租约恢复。

注册编译器按 provider/dialect 复用 AJV，每次清理业务 schema 引用，保留系统 meta alias。限定审查发现并修复 `removeSchema()` 会删除默认别名的问题；隔离、重复 ID、外部引用、失败清理、旧 validator、两个 dialect、严格校验与原输入保持共 10 项通过，kernel 构建通过。相同 Host 构造→Form create→关闭清理工作负载中，AJV 实例 637→31，构造加首次操作 11.166→4.969 秒（下降 55.5%）；31 次 provider 注册一致，期间新增 Artifact reader 后 schema 637→639，不宣称目录字节完全相同。导入耗时和 meta 编译计时位置也变化，不把总耗时下降全部归因于优化。原记录见 `/tmp/action-dist-schema-profile-after.json`、`/tmp/action-dist-schema-comparison.md`。

正式 AgentWorkspace 区分 required 与 none：Session 固定模式、原 owner 和 actor；none 角色不得携带目录、文件工具、MCP、Action、工作区方法、子任务或执行计划。CLI 与 Coding 保留目录约束。Character 精确版本/digest/board/owner 检查从动作分支提到通用 beforeStart/beforeDispatch，原异步授权回调完成后仍复查。10 项 source 合同/撤权回归及 34 项原 Host/Character source 回归通过，限定复核无剩余 P1。Artifact 精确 subject reader 的 source 与 built 5 项通过，不改变历史 browse/read/export 语义。

Prologue v1 精确源码/消费者补丁与 bounded-inference SDK 已合入主树，原版本包保留追溯。冻结依赖安装通过，SDK 路径同步原 workspace inventory；无复制其他任务全树、清理或提交。共享文字、图片、TypeSafe 通过原 Runtime；无工作区 Agent 保留会话和 Character。独立审查发现 native inference 在最终业务授权后仍等待凭据的窗口，已按 owner 窄补丁将业务 guard 移到凭据检查之后并重建。owner 已在实际 SDK 屏障验证零 fetch，正式回归文件待交接；不以助理 Agent 路径代替此项检查。

新依赖批次 functions、Connector、Catalog、Gmail、Inbox、Pages、Images、Alchemist（含 Studio）、AgentHost、Coding、Workbench、LocalHost、Desktop、app-server 最终构建通过。初次构建命令的 Catalog 路径错误已改为正式 integration 路径；Builder 旧 TypeSafe import 由 owner 精准转到共享端口，未恢复 HTTP 旁路。主树正常依赖的完整助理 27 项加 Character 真实 SDK 2 项共 29/29 通过（`/tmp/action-shared-main-assistant-character.log`）；compiled standalone launcher 启停、原 Catalog 恢复与授权撤回 1 项通过（`/tmp/action-cross-device-launcher-main.log`）。工程证据不等于 Home 产品全链完成。

Inbox 原 provider 增加“整理成文稿”声明与完整 prepared offer，固定原 request_id 派生身份和材料版本/内容依据，采集时刻不改变参数。旧手动请求哈希保持；嵌套 Pages 保留原 invocation 授权与生命周期，异步材料检查完成后再次复核。Pages 将 guard 传入 Host completeText 最终派发入口。9 项生产 ActionService+Pages SQLite 用例通过（`/tmp/inbox-prepared-pages-final.log`），覆盖自动目录、输入变化、模型准备及材料检查期间撤权、成功后当前编辑稿恢复。模型为显式测试端口，不等于正式 Home→助理→SDK→Pages 浏览器闭环。

Goal 仍 active。个人助理 Home/HTTP/事件与成果恢复接线、Alchemist 原 Runtime/Artifact/Ledger 接线、Connector MCP provider、F4、其他全量迁移与系统岛最终实操继续。当前 Form390 在完整 Host 重验，IM 在完成新的表现层验收，未以阶段工程通过宣称“内部完整”。
