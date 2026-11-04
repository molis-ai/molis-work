# 动作迁移历史：Goals 与对象读取

状态：2026-09-25 至 2026-09-28 的迁移过程与验证记录，2026-11-03 分册。原文的“下文”“末尾”指整组历史记录，可从总入口查找。下文“当前”“尚未提交/发布”“本轮”“待迁移”均为原记录时点的陈述；不作为今日状态、执行授权或现行兼容策略。现行规则见[动作合同](../spec.md)与[SSOT](../../../docs/SSOT-MATRIX.md)。防腐阶段的决定见[历史归档](../../archive/repository-anti-corruption/spec.md)。

[迁移历史总入口](../migration.md) · [2026-09-28 复查报告](../review-2026-09-28.md)

## 本册目录

- [Goals 目录、创建与便笺（2026-09-25）](#goals-目录创建与便笺2026-09-25)
- [Goals Web 消费与异步操作记录（2026-09-25）](#goals-web-消费与异步操作记录2026-09-25)
- [Goals 三项 MCP 兼容入口收敛（2026-09-25）](#goals-三项-mcp-兼容入口收敛2026-09-25)
- [Goals 状态与历史查询收敛（2026-09-25）](#goals-状态与历史查询收敛2026-09-25)
- [Goals 普通工作写入收敛（2026-09-25）](#goals-普通工作写入收敛2026-09-25)
- [Goals 当前目标、归档和回收站（已接线验证）](#goals-当前目标归档和回收站已接线验证)
- [Goals 独立关系与项目规则迁移](#goals-独立关系与项目规则迁移)
- [个人规划方法：实时读取与已有工作保留](#个人规划方法实时读取与已有工作保留)
- [Home 个人规划方法：共同动作与实际使用](#home-个人规划方法共同动作与实际使用)
- [MCP 连接摘要：当前客户端授权与唯一执行方](#mcp-连接摘要当前客户端授权与唯一执行方)
- [目标正文：网页与公开动作共同读取](#目标正文网页与公开动作共同读取)

## Goals 目录、创建与便笺（2026-09-25）

Goals Manifest 新增 goals.list/create/note 三项 project 动作，完整声明业务输入和目录/回执输出，使用 goals:read 或 goals:write。Host 仅装配原 GoalEventApplication 和 board；处理器仍由 Goals 插件提供，不新增业务 Store。公共输入拒绝 actor、board 和权限字段，按可信调用上下文绑定真实身份；模型调用创建缺省使用 runtime 来源。

旧 createGoalIntentCapability、listGoalDirectoryCapability、recordGoalNoteCapability，以及 Coding 消费的 goalContextCapabilities.list 已转调同一 Host ActionClient。内部适配器保留原可信身份、来源默认值和 idempotency key，检查 board 与已绑定项目一致，限制到精确提供方/动作，并将原 beforeEffect checkpoint 传给新调用。新增的可选 ActionCallContext.actor_kind 是可信审计元数据：null 保留原未记录分类，不把它补写为用户；业务参数不能设置它，字段本身不授予决策权限。已有记录和幂等回执不改写。

验证：

- `/tmp/goals-actions-contract-final.log`：13 项通过，含官方 MCP SDK 启动实际产品 launcher，通过常驻 Web Host 发现逐项授权后的动作、创建目标、保存便笺、读取目录及原事件正文；伪造身份拒绝、撤销便笺动作授权后公共工具不可见且不可写。新旧 typed/动作入口共享幂等回执，验证真实分页、原未知 actor kind 保留、跨项目/board 拒绝及旧 typed 入口确实经过实时动作策略。其余覆盖旧 MCP 状态/决策、Session 身份和 Local Host 共用写入/恢复。
- `/tmp/goals-actions-final-tests.log`：47 项通过，覆盖 Goals 事件、状态、规划及 Session 活动，含新集成测试的早期版本；不与最终组重复计数。`/tmp/goals-actions-regression.log`：12 项通过，包括 Coding 的真实目标上下文与重开关联。
- `/tmp/goals-actions-boundaries.log`：23 项中 22 通过；唯一失败为既有页面断言把整个 HTML 的“补充说明”和其他表单“可选”串到一起。现限定实际 data-goal-tree-decision-form，保留必填理由、预填冲突和真实 HTTP 提交检查。`/tmp/goals-actions-recheck.log`：该项及两项动作集成共 3 项通过，未修改生产页面来匹配测试。
- Contracts、Goals、Local Host 构建通过，见 `/tmp/goals-actions-contracts-build.log`、`/tmp/goals-actions-build-final.log`、`/tmp/goals-actions-host-build-final.log`。`/tmp/goals-actions-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-actions-test-types-final.log` 新增测试严格类型检查通过。scoped diff --check 通过。

本步之后的 Web 迁移见下节。旧 MCP 三项业务虽经 typed 适配调用动作，其目录授权与进程仍走平台兼容路径，尚未切到精确动作授权/常驻通道；本轮公共 MCP 验证不覆盖这个遗留缺口。状态/事件/决策等其余 Goals 能力、工作流用途和其他总清单项目继续执行，不把三项动作注册视为 Goals 全量完成。

## Goals Web 消费与异步操作记录（2026-09-25）

Web 创建目标、记录便笺及首页胶囊目录现在使用 Host 绑定的同一动作客户端，执行原输入校验和实时动作策略。GoalsHttpContext 及同步观察代理不再提供这三项旧方法。HTTP 仅保留旧表单字段转换、状态码及回执，用户/项目上下文由 Host 绑定；Casebook 在 await 后记录一次结果或失败，沿用 web.goal-events.v1、操作身份及原业务引用，不重复记录公共动作。

目标树批准事务内部调用 createIntent 是同插件内的事务实现，保留此调用；此前将其列为需直接异步替换的旁路不准确。需要迁移的是目标树对外能力及实际消费边界，不能拆开批准事务。

验证：

- `/tmp/goals-web-actions-test.log`：真实 Web 服务、SQLite 和 Casebook 授权下验证无控制令牌拒绝、异步等待只记尝试、返回后保存原文与作者、重试复用业务事件、胶囊读取经过动作策略，以及等待中停用后记录失败且不写业务事件。
- `/tmp/goals-web-regression.log`：25 项通过，覆盖现有 HTTP 目标/事件/决定/树结构、Casebook 同意与撤销、观察渠道及操作回执。
- Goals、Local Host 构建通过，见 `/tmp/goals-web-build.log`、`/tmp/goals-web-host-build.log`；`/tmp/goals-web-workspace-types.log` 全工作区类型检查通过，`/tmp/goals-web-test-types.log` 新集成测试严格类型检查通过。

该步发现的旧 MCP 会话作者与授权兼容问题在下节处理。Feed 提升、项目恢复摘要、其他 Goals 事件/决策及总清单其余项仍待迁移。本步无页面布局变更，未新增浏览器视觉或用户本人验收结论；Goal 保持执行中。

## Goals 三项 MCP 兼容入口收敛（2026-09-25）

goal_intent_create、goal_list、event_note 现在只把旧名称映射到 goals.create/list/note，schema 从动作合同派生，保留 goal_url 和 JSON 回执。发现及调用均依赖精确客户端/项目/provider/version 授权；原全局开关只决定该名称是否可用。正式 launcher 通过原通道调用常驻 Host，management 同样需要绑定项目与授权，不能再从这三个工具传入任意数据库或作者。其他管理工具合同未在本步隐式改变。

授权主体 actor_id 与可选可信审计作者 audit_actor_id 分开。兼容写入从宿主 Session 生成原 runtime:<client>:<session> 作者，原数据和幂等域不变。传输只携带独立 Runtime Session 元数据，服务端根据客户端推导作者，不接收自由作者覆盖。新公共动作保留原客户端作者语义；重试需保持原工具与身份上下文。Session 活动仍在成功后记录，并按原业务键去重。

Host 原观察点新增可信 caller 参数，Casebook 把 MCP Goals 动作投影为原事件观察合同，保留 local-host.capability.v1 渠道及实际业务引用。Web 和 typed 观察不重复；等待、失败、重试沿用原结果语义。删除三项旧事件 schema、处理器、switch 分支、身份注入分支及无消费者的旧事件名称集合；其余事件工具继续列为待迁移。

验证：

- `/tmp/goals-alias-final-tests.log`：70 项中 67 项通过。包含真实 stdio launcher 的旧回执重试、作者保持、共享权限策略、旧/新名撤权、伪造拒绝、管理参数边界、Casebook 单次记录、Session 去重及既有 Web/Coding/Goals/通道回归。失败为两处旧规划 fixture 缺少显式动作授权及并行负载下 Web launcher 超过原启动观察时限；未放宽生产权限或更改启动断言。
- `/tmp/goals-alias-recheck.log`：14 项全部通过，覆盖补齐授权后的规划回归、原 Web launcher 检查、真实 MCP 集成及新增传输伪造作者拒绝。重复用例不累计为新增覆盖。
- `/tmp/goals-alias-packaged-e2e.log`：实际 npm 打包、全新安装、常驻 Web 服务、通过正式设置 HTTP 授权、旧 MCP 创建/便笺、重启重试、卸载与升级全流程通过。
- `/tmp/goals-alias-cleanup-tests.log`：最后删除旧身份注入分支后，真实 MCP 和事件/状态回归 9 项通过。Runtime Skill 已补充精确动作授权、保持原工具/会话重试及服务离线的只读诊断；不把打开页面当成执行前置条件，也不允许自授权限或偷偷安装常驻服务。
- Contracts、Goals、MCP 与 Local Host 构建通过；`/tmp/goals-alias-host-build.log` 为最后 Host 构建记录。`/tmp/goals-alias-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-alias-test-types.log` 新集成和调整的事件/规划/入口测试严格类型检查通过。

仍待：其他 Goals 状态/事件/决策/规划工具、Feed 提升和项目恢复摘要、其余插件与完整工作流/场景/Character 消费，以及 Files/Git 成果归属选择和整体系统岛体验验收。没有新增视觉布局或用户本人验收结论；Goal 保持执行中。


## Goals 状态与历史查询收敛（2026-09-25）

Goals 新增 goals.state.read、goals.directory.read、goals.events.list/latest/read、goals.timeline.list、goals.history.list/read 八项动作，现共 11 项。状态及事件输出合同包含约定、要求、来源、完整类型版本、动态报告文本、决定、关闭和迁入完成历史；不存在的目录项/历史正文保留 null。业务所有权仍在插件，Host 只注入本项目原 owner、快照和日志。混合历史排序与读取在原同步组合内完成。

typed 的状态、事件正反向列表、时间线和正文，Coding 的目标状态，以及项目恢复摘要的目录/焦点查询已转调共同动作，保留 Host 原组合调度范围。HTTP 四类读取转为 await 动作；历史缺失返回 404，旧分页参数保留默认/上限规范化，HTML 转义和旧 Run/Evidence/Review/Journal 正文保持。删除 HTTP 旧 lookup 实现及无消费者的快照/日志/读取端口。

旧 goal_state/event_list/event_read 改为共享授权动作的薄别名，保留 goal_url/JSON 返回，删除三项重复工具 schema、旧处理器、switch 和身份注入名单。新旧名发现和调用均校验客户端/项目/provider/version 授权；读取撤权不影响另行授权的查询。Casebook 每个公开查询只保留一组尝试/结果，Web、MCP 原渠道保持，历史组合内部不重复观察。SDK/插件说明、MCP 中英文文档及 Runtime 使用说明同步六个旧名称的授权要求。

验证证据：

- `/tmp/goals-query-tests.log`：首轮 25 项中 24 通过；一处故障注入测试在故意破坏 Home 后继续读取授权查询，已改为读之前恢复真实 Home，未放宽生产授权。最终复核见 targeted 组。
- `/tmp/goals-query-targeted.log`：17 项中 16 通过，包含真实 stdio 六个旧名称、读写独立撤权、查询单次观察、输入伪造拒绝、Web 实际策略和原 Session 故障处理。唯一失败是 v35 fixture 的历史 board ID 与现 demo 常量不同；改用旧 dump 的真实 ID，原 SQL 数据不改，`/tmp/goals-query-history.log` 单独通过。
- `/tmp/goals-query-final-tests.log`：清理旧 HTTP 端口后 31 项通过，包括四类真实 v35 dump 的状态/事件输出、原文与 HTML 转义、双向事件分页、混合历史连续分页及旧正文、缺失 null/404、作用域拒绝、typed/Coding/恢复查询实时策略、Web 单次观察，以及原决定/状态回归。
- `/tmp/goals-query-consumers.log`：6 项通过，覆盖同一 Host 写入/重启、竞争写入不拆散组合、Runtime Skill 流程。`/tmp/goals-query-resume-planning.log`：9 项通过，包括目录窗口外的 Host/Session 焦点恢复和原规划行为。
- `/tmp/goals-query-public-mcp.log`：2 项通过，官方 stdio + 标准 MCP SDK 实际读取公共状态、完整事件、历史 HTML，以及缺失目录项的 null 回执；MCP 对联合/可空输出按现有 result 信封返回。`/tmp/goals-query-public-types.log` 对这组测试的严格类型检查通过。
- `/tmp/goals-query-packaged-e2e.log`：打包后的真实安装、Web、设置 HTTP 授权、旧 MCP 状态/事件查询、重启、卸载与升级流程通过。测试通过后仅删除未使用的 HTTP 注入端口；相关包重建和清理后回归通过，没有改变包入口。
- Goals/MCP/Host 构建通过，`/tmp/goals-query-build.log` 与最后清理后的 `/tmp/goals-query-cleanup-build.log`；`/tmp/goals-query-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-query-test-types-final.log` 新查询、Web/MCP、旧数据和状态 fixture 的严格类型检查通过。

边界：此轮没有新增视觉布局，不产生浏览器视觉或用户本人验收结论。其他 Goals 写入/决策/规划、文档页组合、Feed 提升、MCP 连接/恢复摘要的外层权限，以及其他插件、工作流/场景/Character 和 Files/Git 归属问题继续推进。Goal 保持 active。

## Goals 普通工作写入收敛（2026-09-25）

新增九项插件动作：goals.events.configure/report、goals.progress.record、goals.concerns.apply、goals.decisions.request/cite、goals.agreement.set、goals.closure.submit、goals.work.resume，当前 Goals 共 20 项。输入输出使用同一组事件/状态合同，报告输出明确为 report 类型；版本、至少两个决定选项等约束与实际业务对应，进展保留 Artifact 来源和原 CAS 条件。处理器仍调用原 GoalEventApplication，审计 actor/分类及 board 从可信上下文绑定，事务、批量原子性、幂等域和完成判定不另建实现。

九项 typed 消费和 Coding 的 goalProgress.record 已转调共同动作。Web 的八个原写路由（引用决定原本没有单独路由）转为 await 动作；唯一保留的同步 goalEvents 口是尚待单独迁移的受保护用户决定。Casebook 的普通工作写入均在实际返回后记录一次结果，保留事件引用；原 Proxy 已缩为仅包装用户决定。

九个旧 MCP 工作名称改为动作别名，现共 15 个兼容名称通过精确客户端/项目/provider/version 授权及常驻 Host。删除对应旧 handler、工具 schema、switch 和身份注入集合，以及五组无消费者的参数定义。错误展示只在共同 schema 拒绝后保留原非法收尾种类、缺少版本、Concern 动作及继续原因诊断；不另跑旧业务或退回本地路径。旧管理模式不能再通过已迁移名称自填数据库/作者，无项目授权时拒绝；用户决定原受保护管理入口的合同暂留。

验证证据：

- `/tmp/goals-command-final-tests.log`：4 项通过，包括正式 stdio + 标准 MCP SDK 实际执行九项公共写入、完整报告正文和作者、独立撤权后无新增报告、Web 配置及报告在异步策略等待后单次记录、领域版本/批量失败/用户验收/收尾和继续。新增测试最初缺少真实 Concern 范围、两个可区分选项及问题后的支持事件，按原业务约束补全输入，未修改领域规则。
- `/tmp/goals-command-restart.log`：新增拒绝后事件游标不变、关闭 Host 后再打开并重试原报告的检查通过；原 event_id 与游标保持，无重复记录。历史配置回执按持久化 JSON 比较，避免把 undefined 键和对象原型误当成业务差异。
- `/tmp/goals-command-compat-final.log`：11 项通过，覆盖旧 MCP 工作/状态/决定流程、请求时约定与过期批准拒绝、稳定 Session 作者、正式 stdio 的配置/报告重试、精确授权与 Casebook 单次观察，以及 Session 索引实际故障和重试修复。故障注入改为临时 SQLite trigger 只拒绝辅助 report 索引，不破坏承担授权身份的 Home；主报告仍提交，恢复索引后同一报告重试不会重写业务。
- `/tmp/goals-command-regression.log`：首轮 30 项中 24 通过，覆盖 HTTP/Coding/规划等原行为；6 个失败来自旧诊断码、一个仍用无授权管理参数做用户修改的 fixture、两处破坏整个 Home 的故障注入，均在上述最终组处理。fixture 的用户修改改由可信 Host typed 入口建立，旧管理 MCP 仍验证过期批准被拒绝，并明确验证未授权普通工作别名不可用。
- `/tmp/goals-command-targeted.log`：Coding 报告持久化与用量 6 项通过；同组早期新增业务测试失败已由 final/restart 组修正。`/tmp/goals-command-formal-mcp.log` 中 CLI/同一 Host、原六项别名扩展、默认工具面等 11 项通过，公共写入新测试的输入缺口已由 final 组修正。
- `/tmp/goals-command-packaged-e2e.log`：现有打包后的安装、Web 设置真实授权、MCP 目录/状态、重启、卸载与升级流程通过；新工作名称已要求显式授权，不能因旧全局开关开启而自行获得权限。
- Goals/MCP/Host 构建通过，见 `/tmp/goals-command-final-build.log` 和删除最后废弃 schema 后的 `/tmp/goals-command-cleanup-build.log`。`/tmp/goals-command-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-command-test-types-final.log` 新业务、正式 MCP、Web、旧状态和故障注入测试严格类型检查通过。对应 diff --check 和旧分发残留搜索通过。

剩余：用户决定需要单独迁入受保护来源合同，不能用 goals:write 或 Runtime 的 actor/user_confirmed 字段代替；进展回执、规划/树、页面组合、Feed 提升及 MCP 连接摘要授权继续迁移。其他存量插件、完整工作流/场景/Character、Files/Git 归属及系统岛实际体验仍属于总目标。此轮没有新增视觉布局或用户本人验收；Goal 保持 active。

### Goals 进展回执查询（2026-09-25）

在上述九项写入之后补齐 `goals.progress.receipt`，Goals 共 21 项动作。沿用原 owner 的 actor/goal/idempotency 查询和持久回执，作者由可信审计上下文绑定；结果不存在返回 null，不新建进展。Coding 原 typed receipt 删除直达 owner 的接线，转入同一动作与策略检查；标准 MCP 自动发现并按精确授权提供查询，未增加兼容别名。

进展来源检查确认原业务只校验引用格式，并不会读取 Artifact 验证内容。已修正动作说明，明确来源是提交者的引用，只有 Goal 预期版本在原事务中比较；不新增“来源已验证”的语义或第二套验证状态。

- Goals → Local Host 构建通过：`/tmp/goals-receipt-build.log`。
- `tests/goals-command-actions.test.ts`、`tests/goals-actions.test.ts`、`tests/coding-report-persistence.test.ts`、`tests/coding-report-usage.test.ts`：9 项通过，日志 `/tmp/goals-receipt-tests.log`。包括标准 MCP 保存后读取/null/伪造作者拒绝、真实 Coding 路由、同作者不同目标/不同作者同键隔离、typed 停用拒绝及重启回执保留。
- 两个修改的测试文件严格 TypeScript 检查通过：`/tmp/goals-receipt-test-types.log`；修改范围 diff 空白检查通过。

前一段待迁移项中的进展回执已完成；用户决定、规划/树、页面组合、Feed 提升、连接摘要及其他插件/系统消费仍继续。未宣称整体完成或用户验收。

### Goals 用户决定与旧 SDK 旁路（2026-09-25）

新增 `goals.decisions.record`，当前共 22 项动作。它要求 user audience、独立 goals:decide 权限及 Host 注入的 user_action 出处。普通 Agent/MCP/workflow/plugin 不能发现或执行，也不能通过权限配置导出为普通 MCP。参数不能自填 actor、authority 或 user_confirmed；原 Governance 校验、请求承诺基线、事务、决定身份和回执保持不变。Host 对等待中的调用保存出处快照。

Web 决定路由改为 await 共同动作，删除 GoalsHttpContext.goalEvents、同步 observedWebGoalEvents 及其装配。旧 typed 决定适配转入同一动作并检查项目 board；受保护管理 MCP event_decide 继续薄转发此适配，业务 schema 改由 canonical action 派生。清除三个无人使用的旧参数定义（requirement revision、agreement change、scope）。Casebook 异步后只观察一次结果，并保持旧决定 author-under-authority 的观察形状，以兼容既有 request-key 比较。

实际检查发现旧 PluginCapabilityClient 仅凭 consumes 就能调用 typed 决定并自填 authority。已将该旧入口声明为 host_only；Plugin SDK 在查询及调用时固定携带 plugin 消费者限制，经 PluginHostExecutor 转发到 Host。Host 按注册定义检查，参数中的假描述、host_only:false、consumer:undefined 不能解除限制。限制以 Host 内部调用标记保存，保留其他旧 typed 消费已有 audience 行为，不把整个 SDK 统一改成另一类调用者。未知 ID 的正式 Runtime 插件声明这一接口仍被拒绝；Host 原用户适配可继续调用。

验证：

- 初始决定/领域状态/标准 MCP/管理 MCP/Casebook 定向回归 40 项通过：`/tmp/goals-decision-tests.log`。
- 进展后的决定原子性、Web、管理 MCP 5 项通过：`/tmp/goals-decision-final-tests.log`。通过在 Governance 已写入后的事件 INSERT 处制造真实失败，验证事务回滚、恢复重试及无重复决定。
- SDK 边界较宽回归 37 项中最初 36 项通过；一项项目设置读取暴露“将所有旧 SDK audience 改成 plugin”不兼容。已调整为 Host 内部限制标记，相关决定/未知插件/项目设置/checkpoint 9 项全部通过：`/tmp/goals-decision-consumer-tests.log`；其他原通过项保留其验证范围。
- 正式未知 Runtime 插件、Web 决定、管理 MCP 及 Casebook 回归 14 项通过：`/tmp/goals-decision-production-tests.log`。最终观察兼容调整后的 Web 回归通过：`/tmp/goals-decision-observer-web.log`。原 Web 测试一次失败源于 fixture 在等待前判断停用状态，已改为等待后读取当前策略，无生产语义放宽。
- Contracts、Kernel、Runtime、Goals、MCP、Local Host 构建通过；全工作区 typecheck 通过（`/tmp/goals-decision-workspace-types.log`）。最后的 Host 调整重新构建通过；六个修改测试文件严格类型检查通过（`/tmp/goals-decision-final-type-tests.log`），修改范围 diff 检查通过。

前述待迁移的用户决定已完成。下一步继续规划/树/生命周期、页面组合、Feed 提升及 MCP 连接摘要；其余插件、工作流/场景/Character、系统岛完整实操及 Files/Git 归属选择仍在总体范围内。没有修改用户数据结构或宣称整体完成，Goal 继续 active。

### Goals 项目规划与真实设置入口（已实现验证）

新增五项项目动作 read/save/apply/impact/graph.check，Goals 当前共 27 项，26 项可按精确授权导出普通 MCP，用户决定仍为受保护动作。Planning Engine 保留方法规范化、版本、事务、项目覆盖和图算法；Host 从同一个人方法快照提供采用来源。采用完整复制事件类型和默认要求，版本继续遵守原 owner 规则，不新增自动重试或幂等承诺。

原 typed 四个接口、Web 项目 API、方法详情/编辑及 settings hub 的实际优先读取入口改走共享策略。真实 HTTP 测试发现 settings hub 曾提前消费规划页，现已封住此读取旁路。网页编辑器原来会清空未展示的事件类型/默认要求，也已随本次修复，经过转义的表单数据保留完整配置。现有抽屉式设置交互保持，浏览器测试更新到当前按钮和异步面板路径。

四个规划 MCP 旧名称变成薄别名，目前共 19 个 Goals 兼容名称；保留轻量目录、按 ID 顺序选择、正文及 catalog_id 展示，实际读写和授权只有一条路径。旧 handler、工具总表、switch、身份注入集合和五组无消费者 schema 已删除。普通模型仍不能通过规划确认字段获得 Goal 用户决定权。

验证：
- `/tmp/goals-planning-final-regression.log`：60 项通过，覆盖原规划算法/循环检查/版本、三组规划采用与真实报告、旧 MCP 行为、事件状态和 UI 渲染。
- `/tmp/goals-planning-version-tests.log`：5 项通过。正式 launcher + 官方 MCP SDK 执行全部五项规划动作、撤权后不可发现/执行且版本不变；实际 Host/SQLite 验证项目隔离、旧 typed 策略拒绝、完整配置、版本及重启；真实 Web API/设置页面均受策略约束；个人覆盖采用后以项目方法配置 Goal 并实际保存工程交付记录。
- `/tmp/goals-planning-browser-http.log`：3 项通过，其中实际 Chrome 完成个人复制、网络失败保留输入、重试保存、项目采用、面板编辑停用和刷新。事件类型和默认要求全程保持，个人源不受项目修改影响。
- `/tmp/goals-planning-alias-tests.log`：7 项通过，包括正式 MCP 历史作者/回执及协议无重试行为。其规划用例在保留原版本规则后再次通过上面的最终 5 项。
- Goals、MCP、Local Host 构建通过（`/tmp/goals-planning-final-build.log`、`/tmp/goals-planning-hub-build.log`、`/tmp/goals-planning-version-build.log`）；四个相关非浏览器测试文件严格类型检查通过（`/tmp/goals-planning-test-types.log`）。单独加入浏览器夹具的临时类型命令暴露既有 source/dist 私有类型混用，未扩大本次生产接口；浏览器运行验证通过。scoped diff 检查通过。

剩余 Home 个人方法管理/运行时刷新、目标树/生命周期/长期说明、整页组合及连接摘要；其他插件、完整工作流/场景/Character 与系统岛仍继续。此处是项目规划范围完成，整体 Goal 保持 active，未宣称内部完整或用户本人验收。

### Goals 长期说明及 Prompt 消费（已实现验证）

新增 guidance.read/add/update 三项，Goals 共 30 项，其中 29 项可按授权导出 MCP。原 GuidanceCommands 仍负责规范化、去重、容量、不可变修订、Prompt 前缀和幂等回执。动作绑定项目及可信审计作者；保留精确内容、原因、确认摘要和用户确认前提，不能借此产生 Goal 用户决定。

typed、三个旧 MCP 名称、Web API/settings hub、Work 的开始提示词及 Agent Host 项目层已共用动作。旧 MCP 共 22 个兼容名称，删除独立 goal-commands handler、导出、工具表、switch、身份列表和无消费者的编译产物。原 wire 测试替换为真实 Host/SQLite 集成，保留历史回执与项目隔离检查。连接摘要原 typed 读取也转入共同动作；摘要外层客户端权限仍按总迁移清单继续审计。

Agent 的项目 Prompt 原来用启用条数作为版本，编辑不增版；现在使用已有修订数。真实 Host 起跑交给探针适配器的两份正文及版本不同，之前的运行不受后续编辑影响，读取策略拒绝时不注入不可读说明。适配器为测试探针，没有调用外部模型。

Web 写入和后续刷新分别授权：已保存后刷新被拒绝时仍返回真实保存回执，project_guidance 为 null 并给出 project_guidance_error；正常结构不变。HTTP 验证持久化成功和刷新失败分别呈现，不误报保存失败。

验证：
- `/tmp/goals-guidance-first-tests.log`：31 项通过，包含原事件状态、回执、受保护决定、共享 Host、MCP 连接恢复和新增长期说明契约。
- `/tmp/goals-guidance-product-tests.log`：16 项通过，含正式 launcher/官方 MCP SDK 的新增、读取、兼容名称编辑、停用、撤权及原会话作者；真实 Chrome 的设置页面、失败重试、说明编辑修订及刷新；真实 HTTP/Work Prompt 和 Agent 装配。
- `/tmp/goals-guidance-final-tests.log`：最终 9 项通过，覆盖实际 Host 起跑的正文/版本冻结、策略拒绝、历史回执兼容、去重、编辑/停用/恢复、重启、Web 刷新部分成功等。
- `/tmp/goals-guidance-consumer-tests.log`：52 项中 50 通过；两个旧夹具问题为首页文案断言过时，以及 Inbox 测试未显式启用插件。改为检查实际项目首页结构，并在该 Inbox 用例安装插件，未放宽生产权限。`/tmp/goals-guidance-tui-recheck.log` 两项最终通过，含面板实际调用及 Inbox 保存/开始/重启不重复 Goal。
- Goals/Work/MCP/Local Host 构建通过（`/tmp/goals-guidance-build.log` 初次发现 settings 旧参数无消费者，删除后 `/tmp/goals-guidance-host-build.log`、`/tmp/goals-guidance-final-build.log`、`/tmp/goals-guidance-refresh-build.log` 通过）。四个相关测试严格类型检查 `/tmp/goals-guidance-types.log` 通过；scoped diff 检查通过。

下一步是目标树、生命周期、Home 个人方法、整页组合和 MCP 连接摘要外层授权。其他插件、工作流、场景、Character、系统岛实操和 Files/Git 归属选择仍在总体范围；Goal 保持 active，未宣称整体完成或用户验收。

## Goals 当前目标、归档和回收站（已接线验证）

新增 active.set、archive.set、trash.set、trash.list 四项，当前 Goals 共 34 项动作、33 项可授权 MCP 动作、26 个兼容名称。原 BoardCommands/GoalArchiveCommands 继续负责选择限制、完成条件、活动工作阻塞、关系停用及恢复、当前目标清除、原事务和历史回执。完整 Goal、未恢复关系及阻塞 Claim/Run 均按原结果返回；blocked 不表示删除成功。公共回收站动作要求 user_confirmed，不能提供用户决定权。

Web active/archive/trash、CLI/typed 当前目标、typed 回收站组合/列表及四个 MCP 名称使用同一动作。旧 trash/restore 名称固定方向且共用授权，撤权同时移除并阻止新旧三种写入口；work_state 从原回执派生，排队恢复不会污染先前删除的返回值。旧任意数据库/作者/嵌套 payload 管理输入撤下，原 CLI 正式合同及领域回执保留。删除独立 goal-trash-commands、未再使用的 mcpBoardPayload、工具定义/switch/身份特判及旧编译产物；MCP Runtime 别名列表从动作声明派生，避免新的别名漏在另一份名单之外。处理器装配改为命名业务端口，原业务 owner 没有迁入 Host 分发器。

真实浏览器发现明确 /goals/CORE 链接被已保存 WEB 标签覆盖，造成地址与实际目标不一致。修复为恢复前先选中请求目标，避免旧目标异步读取抢写；去掉第二次重复恢复，保留 Frame 恢复后的视图应用。新链接优先，刷新/历史返回仍恢复工作区。归档用例通过真实工作视图操作，保留网络失败可重试、完成事实及原历史记录断言。删除一条依赖旧脚本排列的正则断言，行为由浏览器验证。

验证证据：

- `/tmp/goals-lifecycle-combined-final.log`：16 项全部通过。真实 SQLite/Host、HTTP、CLI、正式 stdio MCP SDK；原领域回执重放、冲突不写入、跨项目/身份/权限拒绝、两端关系恢复、历史保留、注入事件写入失败后完整回滚、同键恢复执行、重启后旧回执不重新删除、活动历史工作阻塞、网页原作者及 MCP 精确撤权。
- `/tmp/goals-lifecycle-owner-tests.log`：30 项通过；原事件工作及原生命周期模块回归。`/tmp/goals-lifecycle-domain-tests.log`：4 项原归档/回收站/关系恢复用例通过。
- `/tmp/goals-lifecycle-dialogs-final.log`：最终导航修复后的创建草稿及创建重试→取消→回收站→刷新→恢复两项真实 Chrome 通过。早期整文件运行的三个旧导航用例失败；其中归档已按当前工作视图修正并通过 `/tmp/goals-lifecycle-archive-browser-final.log`。另外两个分别停在隐藏的旧 tree-node 点击和 Feed Sources 切换等待，未将其计作通过，留在导航/Feed 后续收尾。
- `/tmp/goals-lifecycle-tabs-regression.log`：31 项全部通过，其中两个真实 Chrome 验证标签保留、分屏、Frame 引用及项目隔离。`/tmp/goals-lifecycle-desktop-check.log`：现有桌面/网页渲染检查通过。
- `/tmp/goals-lifecycle-entry-browser-verified.log`：项目首页→目标工作→刷新保留→直接打开另一目标→进入工作→返回首页通过。该旧 fixture 补上桌面视口并按现行 Frame→工作入口操作；新断言使用不同 Goal ID，同时核对可见正文和地址，防止保存标签覆盖新链接。
- Goals、MCP、Workbench、Local Host 构建通过；`/tmp/goals-lifecycle-types-verified.log` 中四个相关集成测试最终严格类型检查通过；限定范围 diff 检查通过。

归档测试最初缺少有效结果要求及支持事实，原业务正确拒绝归档；fixture 现通过正式创建→配置→报告→完成准备已完成目标，并明确断言 completion_applied/work_status，不放宽生产完成条件。历史活动 Claim fixture 使用未到期租约，验证真实阻塞，而不是误把过期租约视为活动。

目标树/可信树审批、关系/项目策略、Home 个人方法、文档组合与 MCP 连接摘要外层权限仍待继续；其他插件、工作流/场景/Character、系统岛完整实操与 Files/Git 归属选择仍属总范围。这里只完成生命周期切片，整体 Goal 保持 active，未宣称内部完整或用户本人验收。

### Goals 结构提案与用户审批（已实现验证）

新增 tree.submit/read/check/decide 四项，当前共 38 项 Goals 动作，其中 36 项可按授权导出 MCP。原 Submission、Query、Check、Decision owner 保留：提交不创建正式目标，检查保存结果但回滚预检物化，用户审批负责目标/关系写入，逐项修订生成仍待审批的新提案。历史 Proposal/Candidate 等保留原始 ID 与映射 ID 读取，退役写入仍拒绝。

typed 四入口、CLI、Web 审批、三个普通 MCP 兼容名与管理审批已接通。schema 从 Goals 插件派生，旧 MCP 重复 schema、普通分发、身份注入分支、Runtime 对话自报确认帮助器、Web 决定转换器及无消费者的编译产物已删除。管理审批只保留传输薄适配，并剥离数据库等传输字段。原整组确认出处及 submitted_session_id 保留，后者由可信上下文经网关注入，业务输入不能覆盖。

结构审批为 user-only / goals:decide；旧 typed 同时 host_only。未知插件不能用 consumes、自填 authority 或覆盖描述获得用户审批权。原历史 runtime_dialogue 记录仍可读，模型无法生成新的受保护决定。Casebook 新 MCP/Web 动作映射至原记录合同，保留用户/会话请求键及 Web 渠道，避免漏记或重复记录；仅增加两个已知错误码，不导出任意业务文本。

验证：
- `/tmp/goals-tree-final-products.log`：6 项通过，含正式 stdio launcher / 官方 MCP SDK / 常驻 Host 的三项普通动作及兼容名、会话来源、权限撤销、历史读取、旧 CLI 与管理 MCP 回执、项目隔离和重启。
- `/tmp/goals-tree-final-revisions-receipts.log`：12 项通过，补充修订/拒绝分支、新提案仍待审批、事务中断后无部分目标/关系/审计写入、真实 Web 批准及整组冲突全回滚、真实 v35 历史读取、Casebook 单次记录和隐私。
- `/tmp/goals-tree-receipts-built.log`：9 项通过；Casebook 测试统一使用编译 Host 后，正式 Web 审批与重试仍只生成一组尝试/结果。`/tmp/goals-tree-receipts-tests.log` 另有 21 项相关回归通过，覆盖原受保护事件决定、Attention/Inbox、Casebook 授权及 Web 渠道。
- `/tmp/goals-tree-entry-final.log`：11 项通过，含 CLI、MCP 工具面、连接与管理重放。`/tmp/goals-tree-products.log` 的 4 项网关回归及 2 项原目标树领域测试通过；该轮唯一失败是新增 SDK 测试把标准 `{ result: null }` 响应误断言为裸 null，已改正并在 final-products 中通过。
- `/tmp/goals-tree-browser-current.log`：实际 Chrome 审批通过，覆盖空意见校验、断网保留意见、重试后仅一次物化、退回不创建目标、刷新保持状态。旧测试等待隐藏的旧目标工作区，已改为当前 Frame → 工作视图；Inbox 行由独立 Attention/Inbox 测试覆盖。v35 测试改用夹具真实的 `goalboard-v1-demo`，没有改写历史数据。
- Contracts、Goals、MCP、Workbench、Local Host 构建通过：`/tmp/goals-tree-final-build.log`；关系方向说明补充后 Goals 构建通过：`/tmp/goals-tree-schema-build.log`。五个相关非浏览器测试文件严格类型检查通过：`/tmp/goals-tree-final-types.log`。scoped diff 检查通过。

本轮完成目标树入口迁移，不代表全局 Goal 已达内部完整。继续处理 Home 个人方法、独立关系/策略、页面组合与连接摘要，以及剩余插件、工作流/场景/Character 和系统岛整体验证；Files/Git 跨调用者归属仍依赖此前待答选择，其他工作不受阻。


## Goals 独立关系与项目规则迁移

新增六项动作：relations.list/add/deactivate、policy.history/resolve/save。现在共 44 项 Goals 项目动作，39 项可按授权导出普通 MCP，5 项为受保护用户操作；旧 MCP 兼容名称仍为 29 个。关系/规则此前没有独立 typed/MCP 写入名，不制造额外兼容入口。

Web 建立/解除关系与保存项目默认规则已转共同动作；规则设置页和所选目标正文读取也通过共同查询。原 `GoalsHttpContext.commands/query` 删除，所有 Goals HTTP 业务操作只接受 BoundActionClient。普通模型、工作流、插件和 MCP 不能自填用户出处直接改变关系/规则；三个直接写动作只接受 user audience、goals:decide 和 Host 注入的真实用户 web/management 出处。模型提出关系变化仍走结构提案，不能因统一目录而扩大权限。

原 GoalCommands、ProjectPolicyCommands 和 GoalsQueryApi 继续拥有记录、事务和规则：关系方向、proposed/active/inactive、创建理由、解除理由及原作者保留；默认规则替换保留旧绑定，目标更严格要求继续合并；旧幂等哈希/作者域和返回游标不改变。故障发生在关系/规则已写入而审计事件尚未写入时，整个事务回滚，随后能以同键成功重试。重启后仍读原记录并重放旧回执。

清理了已无生产消费者的 Workbench/CLI/MCP GoalsApplicationApi 转发工厂、对应包元数据与原身份相等测试。边界检查改为检查当前 scoped Host/BoundActionClient 入口，结构提案 owner 检查跟随 goals-actions 装配；旧已删除 Dialogue/Proposal 文件的测试改为验证当前 owner 与退役入口不回归。历史迁移文档中的当时测试证据保留。

验证证据：

- Goals、CLI、MCP、Workbench、LocalHost 构建通过：`/tmp/goals-configuration-build-current.log`、`/tmp/goals-configuration-adapters-build.log`。
- `tests/goals-configuration-actions.test.ts` 三项通过：原请求回执、方向/历史、原图校验、缺失/已丢弃目标、身份/项目/权限、用户专用授权、故障回滚/恢复、重启，以及真实 Web 写入和读取的实时停用。`/tmp/goals-configuration-integration.log`。
- `tests/goals-actions.test.ts` 两项通过：官方 SDK 使用正式 stdio 进程与常驻 Host，读取真实关系/规则历史/最终规则；三项受保护写入不在目录且伪造字段不能调用；撤回查询授权后目录和执行同时更新。原标准 MCP 的创建/事件/规划/树/生命周期路径同次通过。`/tmp/goals-configuration-mcp.log`。
- 实际 Chrome 四项通过：关系 HTTP 的类型/方向/项目/重试，关系历史与重载，1024×400 和 390×500 的项目规则与说明编辑、取消、无效输入、网络失败保留/重试、保存等待及重载。`/tmp/goals-configuration-browser.log`；截图只写 `/tmp/goals-configuration-browser`，未覆盖用户截图。
- 原规则/关系 UI、领域保存、事件状态、结构提案及旧 MCP 别名 40 项回归通过：`/tmp/goals-configuration-regression.log`。
- 当前 owner 与 UI 注册边界七项通过：`/tmp/goals-configuration-boundary-tests.log`。新增集成、标准 MCP 和受影响事件 fixture 的严格 TypeScript 检查通过：`/tmp/goals-configuration-types.log`；修改范围 diff 检查通过。
- 全仓边界检查仍有五个报错：Dataset README 三项元数据缺失；Connector 两个文件直接导入 node:sqlite。见 `/tmp/goals-configuration-boundaries.log`。本次 Goals 相关边界报错已清除，未把全仓检查报告为通过。

当前接续盘点：Home 个人规划方法还有独立 HTTP 直读/写 Catalog；全局保存会关闭全部项目 Runtime，而项目路由另存个人方法未使已打开 Runtime 更新。`GoalsPlanningEngine` 的个人方法仍是构造时数组。后续迁移须统一 Home 方法目录/保存与真实项目采用，保留个人/项目独立版本、内置模板覆盖规则和原用户数据，并解决已打开项目的更新；不能只再注册两个静态动作。此段仅完成代码盘点，未修改个人方法实现。

完整 Goal 仍 active：Home 个人方法、整页组合/连接摘要授权、其余插件与全部消费方、工作流、动态场景/引用、Character/Agent、系统岛完整路径和 Files/Git 归属选择仍在范围内。以上不是整体内部完整或用户本人验收，无提交或 PR。


## 个人规划方法：实时读取与已有工作保留

已修复两条旧路径不一致：全局个人方法保存此前会关闭所有项目 Runtime 并清空 Feed scheduler，项目 URL 的另存个人方法却不刷新构造时数组。GoalsPlanningEngine 现接受同步读取端口（保留静态数组的原调用合同）；项目 Host 默认从自己 Home 的原个人方法 owner 读取，项目动作的 baseMethods 也使用同一读取端口。Web/MCP 构造处重复的默认装配已删除。

查询、后续采用与项目页面都读取当前个人版本；一次事件采用固定同一份个人/项目方法快照。项目覆盖继续优先，项目副本和 Goal 已保存 config 不变。页面缓存键包含 method_id/scope/version，Home 保存没有项目事件时也能更新方法选项。删除了保存时强制关闭所有项目、清空 Feed scheduler 以及失去用途的路由参数。

证据：

- Module Goals 与 LocalHost 构建通过；最终 Host 构建为 `/tmp/goals-personal-live-final-build.log`。
- `tests/goals-planning-actions.test.ts` + `tests/planning-engine.test.ts` 20 项通过，`/tmp/goals-personal-live-tests.log`。新增真实 Web 两项目路径：先打开两个 Runtime，全局保存与项目 URL 保存均立即可见；项目采用副本保留旧版，冻结 Goal 要求保持原配置；失败保存不增加版本，后续 Goal 能采用新要求；页面缓存更新但项目游标不变；Runtime 对象身份不变、关闭次数为零；重启后保留结果。
- `tests/goals-actions.test.ts` + `tests/goal-events-planning.test.ts` 最终五项通过，`/tmp/goals-personal-live-mcp-final.log`。正式 stdio/官方 SDK 连接保持期间，Home owner 连续保存后的方法名称/版本可实时读取，并能把最新版本采用到项目。保留原模板升级后的配置重放、记录与冲突原子性回归。第一轮 MCP 新用例复用了前面已撤销的 apply 授权而失败，测试现明确重新授权该独立操作；未放宽生产权限。
- `tests/goals-planning.e2e.test.ts` 实际 Chrome 通过，`/tmp/goals-personal-live-browser.log`：复制内置模板、保存失败保留输入、恢复后保存、重载、采用为独立项目版本、停用与读取均通过。
- 严格类型检查与本次修改范围 diff 检查通过；此项不增加动作数量，仍为 44 项 Goals 项目动作 / 39 项普通 MCP。

下一步仍须完成 Home 个人方法的共同目录/保存动作及旧 HTTP 旁路清理。当前 `web-planning.ts` 仍直接读个人 owner、两处调用 Catalog save；这些尚未完成。复用原 Catalog 创建/升级 owner：`MolisWorkProjectCatalog.open` 需要现有 LocalCatalogPlatform，不能另建不完整 Catalog、把桌面包反向导入 Host，或只在打开页面后注册服务。应沿现有平台组合入口注入目录 owner 端口，并覆盖无项目、Home 隔离、撤权与生产 MCP 查询。全量 Goal 保持 active，用户本人验收未进行，未提交或创建 PR。


## Home 个人规划方法：共同动作与实际使用

已注册 `goals.planning.personal.list/save`，共 44 项项目动作和 2 项 Home 动作（39 项项目及 1 项 Home 查询可供普通 MCP 授权）。Host 构造声明 Home 能力，Web/MCP 平台启动注入原 Catalog runner；不依赖项目安装或页面，不反向依赖桌面包，也不另建个人方法数据库。未配置保存后端时目录说明不可用；不同 Home 不能复用绑定，关闭后不能重新配置。

`web-planning.ts` 全局和项目 URL 的个人保存，以及 Home 页/API 的方法查询均调用共同动作，已删除直接个人 Catalog 保存/查询。原版本、完整方法字段与实时采用保持。个人保存属于用户设置，要求可信用户和 web/management 出处；普通 MCP 仅在独立 Home 授权后查询，不能授予或伪造保存能力。

验证：

- `/tmp/goals-home-planning-tests-final.log`：6 项通过，含真实 Host 无项目首次保存、缺少后端、双 Home 隔离、关闭/重启、完整方法版本、伪造身份/权限拒绝，两个真实 HTTP 保存入口，以及官方 MCP SDK/正式 launcher 在无项目状态的发现、实时版本、撤权和禁止写入。
- `/tmp/goals-home-planning-consumers.log`：12 项通过，含新增两种 URL 同受 Home 策略约束断言、正式 MCP 项目采用、Goal 已保存事件配置、系统判断与实际模型连接回归。
- `/tmp/planning-layout-fixed.log`：1440px 与 390px 真实 Chrome 完整复制→失败保留/重试→采用→编辑停用→重载均通过。窄屏原绝对定位正文高度为零已修复为自然展开；实际 DOM 高度和截图已核实，未用程序点击绕过可见性。临时诊断已删除。共享浏览器 fixture 统一使用与生产 launcher 相同的 Host 包，消除源码/产物私有类型混用。
- Goals/Host 构建通过；`/tmp/goals-home-planning-types-checked.log` 的新增 Home、规划动作及浏览器严格类型检查通过，范围 diff 检查通过。边界检查仍只有此前 Dataset README 三项及两个连接模块 SQLite 导入问题，没有本轮新增问题。

这部分完成 Home 个人方法迁移。Goals 页面完整组合和 MCP 连接摘要的外层授权仍继续，其他存量插件、工作流、场景、Character 和系统岛总清单仍未完成；Goal 保持 active，未提交或创建 PR，未宣称用户本人验收。


## MCP 连接摘要：当前客户端授权与唯一执行方

`context_resolve/bind/create_and_bind` 原先通过 Host typed 身份读取项目说明和恢复目录，现在使用当前客户端的已授权动作及生产常驻服务通道。复用 `goals.guidance.read/list/directory.read`，不新增摘要动作；typed 与 MCP 的目录窗口和焦点补查已合并为插件内 `readGoalResumeFacts`，删除旧重复组合与焦点辅助函数。

连接先接受原 Catalog 的真实结果。说明和恢复目录分别读取，未授权、插件停用或服务离线时返回 null 和对应 `project_guidance_error`/`resume_error`，不把已有绑定伪报为失败，也不把缺权限显示为空项目。生产 launcher 不再为这两项内容回退到本地数据库。整个等待期间项目连接或客户端寿命改变时拒绝旧结果，保留新连接；项目读取不自动开始工作。SDK/Skill 协议说明已更新，正常授权结果和原排序保持。

验证：

- `/tmp/mcp-context-actions-final.log` 三项通过：官方 SDK 启动正式 launcher，真实 Web Host/项目/Catalog 验证无授权、局部授权、完整读取、实时撤权、停用、解析/绑定/创建并绑定、项目隔离、关闭常驻服务后的 bound 结果和内容不可用；原绑定/项目事件在只读恢复中不变。独立等待测试验证项目和客户端改变后拒绝混合摘要。
- `/tmp/mcp-context-regression.log` 15 项通过：焦点在首 100 项之外时单独要求 directory.read；授权后保留 Host/Session 焦点、重启恢复与不自动 claim；原连接确认、解绑、项目删除、工作区匹配、Session 覆盖、JSON-RPC 记录及幂等恢复均通过。
- `/tmp/mcp-context-actions-tests.log` 首轮八项含 Goals typed 查询、完整旧事件和恢复回归通过。Goals/MCP/Host 构建、修改测试的严格类型检查及 scoped diff 检查通过。

Goals 动作数量仍 46；此轮消除了连接摘要外层授权旁路，页面整页组合/contract/snapshot 仍待迁移。整体 Goal 保持 active，其余插件、工作流/场景/Character、系统岛及 Files/Git 主体归属选择仍在范围中。未做额外 UI 改版或用户本人验收，未提交/PR。


## 目标正文：网页与公开动作共同读取

新增 `goals.document.read`（45 项项目动作 / 40 项普通 MCP，另 2 项 Home 动作）。输入仅 goal_id，可信项目由 Host 绑定。插件沿用原 createGoalEventDocumentView、状态及历史 owner，完整 schema 描述状态、原始说明、混合历史首屏/游标、关系、带原关联的风险、当前规划方法、继续方式与事件类型；没有新建事实表或返回 UI HTML。

Web 完整页、正文/刷新 fragment 的所选目标使用共同动作。原 Host 直调事件与规划 owner 的所选正文路径已删除，移除未使用的 attachEventDocument helper 和关联参数/导入。关系/规则和可选 Artifact 阅读继续沿现有动作及错误处理。整页目录/snapshot/contract 仍在原清单中，不将所选正文等同于全量页面完成。

验证：

- `/tmp/goals-document-tests.log` 九项通过：真实 Host 的正文/状态/原文/缺失目标/输入身份及跨项目拒绝、原 v35 迁入历史与完成事实、归档和回收站保留正文/关系，标准 MCP 发现、真实结果与撤权，以及 Web 完整页和 fragment 热缓存下停用/恢复。
- `/tmp/goals-document-planning.log` 四项通过：Home 个人方法保存后正文可选模板显示新版本，而已采用的 Goal config 保持原版本；两种保存 URL、原项目副本和当前 Runtime 均保持。
- `/tmp/goals-document-browser.log` 五项真实 Chrome 通过：规划、报告、问题、用户决定及收尾完整交互；历史未完成目标只读、分页失败恢复及原日期/类型；窄屏抽屉/视图恢复与桌面并排几何。
- `/tmp/goals-document-protected.log` 受保护 Web 决定定向回归通过。Goals/Host 构建、相关测试严格类型检查 `/tmp/goals-document-types-final.log`、范围 diff 检查通过。

整体 Goal 继续 active。当前接续：完整页面目录、snapshot 与 Session handoff 的 contract 读取仍直接组合原 owner，需要保留完整历史合同并纳入共同动作；其余存量插件、工作流/场景/Character、系统岛及 Files/Git 主体归属选择仍未完成。未提交/PR，未宣称用户本人验收。


### Goals 完整快照及 Session 交接资料

新增 `goals.snapshot.read` / `goals.contract.read`，47 项项目动作中 42 项可导出普通 MCP，加上 Home 两项为 49 项/43 项普通 MCP。原 BoardSnapshot 和 GoalContractView 全字段保留，包括 Execution/Evidence/Governance、历史提案与修订；schema 复用已有 Goal/规则/长期说明定义，不另建数据或把历史审阅解释为当前审批。

CLI/typed snapshot 和新接通的 typed contract 均检查 board 并调用动作；旧 MCP snapshot 为第 30 个薄兼容名，删除旧 schema/switch 及任意数据库分发。Web Session handoff 等待共同 contract/state 读取，原内容、编辑、发送确认和目标 Session 保持；任一读取被拒绝时没有持久化半成品。

验证：
- `/tmp/goals-snapshot-query.log` 两项通过：真实 Host 新/typed 读取、身份/权限/board 拒绝、实时停用；四种原 v35 数据库完整快照与每个目标约定逐项对照原 owner，非空 claims/runs/evidence 保留。
- `/tmp/goals-snapshot-consumers.log` 中 MCP、CLI 与 Local Host 八项通过；真实 SDK 新旧 snapshot 同内容、contract 原文、伪造参数拒绝、撤权后两个名称同时隐藏并拒绝；CLI 导入与重启仍保留记录。该首次组交接夹具两项失败已单独修正并复验，不将首次整组称为通过。
- `/tmp/goals-snapshot-handoff.log` 15 项交接/恢复通过：Web 实际拒绝 contract/state 后无包，恢复读取后创建、编辑、确认发送及目标内容；失败发送、重启恢复和原历史资料。旧夹具改用历史库实际 board ID，并将无效验收方式 test 修正为正式 automated_check。
- `/tmp/goals-snapshot-build.log` Goals/Work/MCP/Host 构建通过，`/tmp/goals-snapshot-types.log` 三个相关测试严格类型检查通过。

接续完整页面目录组合；其余插件、工作流/场景/Character、系统岛、Files/Git 归属及全量清理保持原范围。Goal active，未提交/PR，无用户本人验收结论。

### Goals 完整页面集合与异步消费

新增 `goals.collection.read`，复用插件原 buildGoalsDocumentCollection 和原领域查询，返回完整当前/归档/回收站集合及历史、覆盖/输入/规则绑定。schema 复用 snapshot 记录和规则定义，原 Journal unknown payload 保持可读；纯查询不产生历史或 Attention 写入。现为 48 项 project + 2 项 Home，44 项普通 MCP/6 项受保护用户动作。

Host 删除直接装配 Goals 集合与规划方法缓存读取。Web 整页、Board JSON、fragment、胶囊及 Feed/Inbox/Schedule/Work/规划页的复用路径等待授权集合；业务回调支持异步，同时保留同步测试/插件调用合同。缓存命中仍执行当前动作策略，所选正文另读当前方法，原 Inbox attention 维护留在 Web 组合层。修复异步间隔发生写入时缓存游标错配：缓存标记来自返回集合的原游标，不能用随后数据库游标标记旧内容。生产纯 UI builder 接收资料，原 owner 级测试装配移至专用 fixture，不留下生产直读兼容入口。

验证：
- `/tmp/goals-collection-tests.log` 14 项通过：真实 SDK 完整集合与回收站原文、撤权；HTTP 热缓存下整页/Board/fragment/胶囊拒绝并可恢复；原四种 v35 全集合与 owner 对照，以及交接路径。
- `/tmp/goals-collection-regression.log` 31 项通过：最终新增实际读写交错缓存用例、查询旧数据/实时停用、原风险/依赖/覆盖/规则、历史提案与 attention，以及 Feed/Inbox/Schedule 路由消费。
- `/tmp/goals-collection-browser.log` 四项 Chrome 通过：窄屏抽屉/原视图恢复、窄屏/桌面几何，1440/390 规划复制、失败恢复与独立采用。
- `/tmp/goals-collection-cache.log` 原缓存重开/写入失效用例通过；`/tmp/goals-collection-types-final.log` 相关测试严格类型检查、`/tmp/goals-collection-root-types.log` 根启动器类型检查通过。Goals/Work/Feed/Inbox/Schedule/Workbench 构建及最终 Host 构建通过，后者日志 `/tmp/goals-collection-host-final.log`。

继续审计初始化/导入的剩余管理入口；全部其他插件、通用工作流、动态场景与使用位置、Character、首页动作、MCP Client、生命周期和调用记录保持原全量范围。没有将本轮集合迁移视为整个 Goal 完成，未提交/PR，未宣称用户验收。

### Goals 管理初始化/导入及 Coding 约定读取

注册 `goals.board.initialize/import-v3` 两项 user-only 管理动作，复用原 BoardCommands、importLegacyV3Board 和事务。旧 CLI/管理 MCP 的 typed 入口检查绑定 board，再注入可信 management 出处；两个 typed 合同标为 host_only，插件不能覆盖该声明获得权限。管理 MCP 的业务 schema 从动作定义派生，保留原兼容 wire shape、存储准备和错误顺序。输入不能指定目标 board/作者；V3 合同明确安全映射字段，允许原文件附加字段。初始项目创建和持有 Store 的 SDK 领域 owner 保留内部 bootstrap，不建立第二个 registry。

现在 Goals 共 52 项动作：50 项项目/2 项 Home，其中普通 MCP 可授权 44 项，8 项管理/用户操作受保护，普通 MCP 兼容名仍 30 个。另将 Coding 目标上下文的 GoalRecord 从直接 owner 读取改为 contract 动作，state 仍通过同一动作服务；归档/回收站拒绝和冻结结果结构保持。

验证：
- `/tmp/goals-board-tests.log` 八项通过：新动作和 typed 的可信管理/权限/board 校验、插件 host_only 不能覆盖、原初始化回执、旧数据实际映射、末尾事件故障整笔回滚、禁止覆盖和重启；真实 CLI 及管理 MCP 共享 Host。
- `/tmp/goals-board-mcp-tests.log` 十项通过：正式 stdio SDK 仍只发现授权普通动作、原业务写入/撤权，以及 MCP 上下文/删除/旧目录兼容回归。
- `/tmp/goals-context-query-final.log` 和 `/tmp/goals-context-coding-final.log` 各一项通过：撤销约定读取时 Coding 不能补读；真实 Coding HTTP 保留冻结的目标、引用变更拒绝、进展归属和重启。
- Goals/Host/MCP 构建通过；`/tmp/goals-board-types.log` 管理动作测试严格类型检查、`/tmp/goals-board-root-types.log` 根启动器检查通过；本次修改范围 diff 检查通过。

接续首页判断/动作实际链路。Character 已初步核对：13 个 HTTP 路由仍在插件内部直接操作个人草稿/项目固定发布版本及本地 Agent 导入/运行；原 owner 与冻结内容不能在迁移时改变。其完整公共能力与生命周期仍未迁移，后续需连同实际 Coding 消费完成。总体 Goal 保持 active。

首页下一段已核对的实际断点（尚未修改实现）：
- `apps/workbench/src/scripts/client/project-home.ts` 的提交监听只调用 talkFromEvent，不读取 textarea；talkFromEvent 对非 Session 事项选择任意首个 Session，既丢文本又可能关联错误对象。
- 同文件 home.ask 和 feed.reauth 都调用 continueEvent；未知行为按钮最终被改写成 home.continue。行为名称、点击结果和推荐目录不一致，不能用改文案掩盖执行缺失。
- `home-dock-http.ts` 仍读写旧 Functions 场景；FeedApplication.flushPendingJudgments 的 feed.capture/home.dock 仍直接走 judgments.judge/judgeScene，未经过通用场景服务。
- `behavior-catalog.ts` 仍维护 SYSTEM_BEHAVIORS、HOME_DOCK_ACTION_IDS 与场景特判。需要从共同动作/消费合同派生可选项，不能为每个新插件追加首页分支。
- Work Session 内容页当前以读、恢复和 Handoff 为主；终端的 autofill 是按 Goal 的 Feed/Onboarding 提示链，不能直接当作任意 Session 的可靠消息投递。下一段应先确认原 Session/Runtime 可用投递合同，再定首页输入的承接与失败恢复；必须保留文本及对象，禁止任意选择其他 Session 或声称已发送。
