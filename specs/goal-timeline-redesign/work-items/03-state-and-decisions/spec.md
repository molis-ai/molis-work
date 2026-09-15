# 03：显式状态效果、用户介入与新旧归属

状态：accepted。depends_on：02-runtime-entry（已验收）。执行者为直接 Grok CLI（grok-4.6 / xhigh，no-subagents），主 Session 独立验收。本项已完成，由主 Session 衔接 04。

## 最终独立验收（2026-09-09）

主 Session 独立构建、指定 41 项测试、boundary 全部通过，0 fail / 0 skipped，boundary errors=[]、legacyHugeFiles=0。日志 `/private/tmp/molis-work-grok/03-accepted-{build,tests,boundary}.log`。四组公开 Host/MCP/Native + 临时 SQLite 复现均通过：`03-review-{repro,gates,upgrade,effects}.mjs`，原脚本及实际 JSON 在同一目录。冻结时钟生产回归确认同毫秒当前读取和本次回执正确，原失败断言未放宽。

通过：可信决定效果及范围、当前与历史决定、拒绝/反证重开、约定 CAS、真实收尾门禁、取消恢复、父 Goal 独立结果、旧入口 owner 阻断、原文回读、重启、非空旧库判断保留、错误输入无事件副作用。03 无未完成项；历史 Goal 的显式转交策略、新版 UI/接续与最终清理由 04/05 实施，不以本项后端证据宣称完整产品已完成。

## 用户结果

Runtime 能记录进展和下一步、提出具体 Concern、请求一个决定、说明哪些要求已经得到结果支持，并显式提交完成或取消。用户可以作决定或验收；新会话恢复后仍区分已经授权、待决定和失败。读取旧事件不把整体进展退回旧状态；普通记录不会消除不相关的阻塞或人工验收。

## 已知问题与调用链

01 保存类型、报告和要求判断；02 暴露到真实 Host/MCP；此时尚未改变旧 completion owner。`modules/goals/src/lifecycle-completion.ts` 负责 `goals.fulfillment_state` 的写入，存在叶子自动满足及 `satisfyClosedCompoundGoalIfReady` 的父目标自动满足。`plugins/native/goals/src/lifecycle-application.ts` 调用 `planGoalLifecycleReconciliation`，可因旧 Evidence/Review/Claim 状态关闭或重开目标。新版必须有显式归属，使这些路径不会同时决定同一 Goal。

相关 Host 路径：`plugins/native/work/src/http/panels.ts` 仍按 `closed_compound` 禁止父 Goal 的终端/推进，`plugins/native/work/src/ui/terminal.ts` 和 Goals navigation model 也做同样表达。新版父目标需要自行整合结果，不能被旧“子目标自动完成父目标”的前提挡住。本项处理正式 owner/Host 门禁，04 处理对应 UI；实际终端的项目归属、显式启动授权及不会自动发送等边界继续保留。

## 行为合同

- 当前 Goal 的意图、有效约定和实际授权分别记录。沿用已有 accepted criteria 及可信决定；Runtime 可在已有授权内追加局部要求，不通过新协议删除或降低旧承诺。
- 进展摘要保存 Runtime 原文、根据的事件游标、下一步及责任人。更晚事实使摘要过时但不删除它；当前要求、Concern 和待决定来自当前事实，不能被摘要抹去。Runtime 建议某人继续不等于 Host 已开始执行。
- Concern 通过明确的关联事件打开、解决、接受或推翻；只影响所引用 Goal/要求，不以任何新事件自动解决所有 Concern。解决/接受记录保留理由及来源；真正依赖未解决事项的动作才等待。
- 决定请求包含具体问题、选项/影响和作用范围。用户决定走可信入口，Runtime 不能靠普通领域字段获得 user 身份。同一明确授权可由可追溯的原记录复用；不要求每次报告重新确认。更改已承诺结果或扩大权限需对应授权，普通追加事实不制造审批。
- 用户验收与 Runtime 报告分别保留。human_decision 要求必须由可信用户结论满足；反证、拒绝和未知不能算支持。已满足的其他要求保持不变。
- 收尾有明确结果和理由，并检查所基于的约定/配置版本。完成需要具体结果约定、当前要求支持及适用的决定/阻塞处理；允许保存尚不成立的完成报告，回执分开给出已记录和未完成原因。成功上报本身永不自动完成。
- 父 Goal 完成需要独立的整合结果与显式收尾，子 Goal 全完成不足以自动完成父 Goal。之后出现指向相关要求/依赖的反证时更新当前差距，并保留历史完成结论及变更原因。
- 取消保存独立结论和理由，不要求伪造交付/验证。重新继续必须是明确操作，不由下一条无关观察默默重开。
- 新版 Goal 的状态 owner 唯一。旧写入调用要么有明确映射并进入同一服务，要么在副作用前拒绝并指向新版工具。历史 Run/Evidence/Review/Decision 不删除、不捏造验证结论；仍由旧链路管理的 Goal 暂时保持原路径，供 04 映射切换。

## 已确认入口与模块边界

沿 Goals 模块持久化和正式状态 owner、Governance 的可信决定职责、Native Goals 应用组合、Host 身份与能力、MCP 新工具扩展。不得在 UI/MCP 各自计算 fulfilled，不用固定角色代替真实来源，不新增第二套 EventStore、任意规则执行器或笼统协调类。正式更新应在同一事务中写入事件、状态及幂等回执；失败重试无重复副作用。

02 已验收 API：`GoalEventApplication` 的 createIntent/readState/configure/report/listEvents/readEvent，公开 capability 在 `goal-event-entry-capabilities.ts`；`GoalProjectApplication` 持有 `goalEvents` 并由 `project-capabilities.ts` 注册。Module `events` 的 configureRequested 在事务内按原始请求幂等，再调用 planning.resolveEventAdoption；listLatestReports 有界读取。MCP 六个新入口位于 `goal-event-tools.ts` / `goal-event-commands.ts`，Runtime 身份由 Host `mcp-event-identity.ts` 注入。保留这些已验收普通事实/配置行为，在当前应用上扩展状态操作及读取。

新增状态操作应先在 Contracts 定义有限 typed 输入/输出，再接对应 Module、应用、Host/MCP。工具名称围绕上述真实行为，沿用 molis_work_v1 前缀；不是为每种自定义类型新建工具。交回完整公开 API 与具体调用示例，供 04 消费，不需要临时 UI 或工具占位符。

## 实施约束

- 新创建意图以及已经采用事件配置的 Goal 必须有持久的事件状态归属；不能仅由 UI 根据是否有报告猜测。转交归属和第一条事实原子保存。未切换旧 Goal 保留旧读取与处理，批量历史迁移在 04 验收。
- 最小结果约定需要可辨认的具体 outcome 和至少一项有效结果要求；意图只有标题时可工作，但收尾返回缺失约定。Runtime 在已有授权内补充初始结果说明、追加要求不机械制造人工审批；已有 accepted outcome/criteria、明确用户范围不能由这种补充覆盖或降低。采用新事件协议不要求补旧 why/business_logic、拆分数组或角色步骤。
- 新状态效果以有限、明确的 typed 输入表达；普通动态字段继续是领域文本，不从某个字段名、类型名或 semantic_family 猜出“用户已批准”或“Goal 已完成”。可在事件应用中增加清楚的专属操作；所有效果同样留下时间线记录，不能让后续 UI 再抄一份结论。
- 进展摘要包括依据的已存在 Goal 事件游标、原文、下一步及责任描述。不能引用未来游标；新事件到来后显式暴露摘要过时。游标使用当前 Goal 的事件事实，避免其他 Goal 更新使摘要无意义地过时。
- Concern 明确哪些 requirement/event/动作受影响，以及是否阻塞收尾。一般观察不能自动创建全局阻塞；只有显式作用范围参与门禁。解决需要关联后续实际事件或已有用户决定，接受风险需要适用的可信授权；拒绝跨 Goal 引用。更正某个 Concern 的结论保留前后来源。
- 决定请求至少有具体问题、可区分选项与影响、作用范围。用户入口确认选项或要求验收，Runtime 能请求及引用已持久化决定，不能通过 `actor_kind`/任意 authority/`user_confirmed=true` 自行获得 user 来源。沿用现有 Governance/Host 的可信上下文，不把 `runtime-decision.ts` 为旧对话确认生成的摘要引用误当作系统观察到了真实用户消息。
- 已承诺的人工验收不限于 criterion.decision_method：适用的既有用户验收约定/记录也要保留来源。不能为简化状态服务静默删除已明确需要的用户结论；同样不能把旧模板默认阶段全变成新 Goal 的强制门禁。
- 同一有效决定可在其 Goal/要求/动作范围内复用，无需复制决定或重问。换 Goal、扩大范围、旧版本决定应用到变化后的承诺均不得静默通过；不为了复用引入凭据、hash 确认仪式或新的授权平台。
- 正式收尾使用当前约定/配置版本与所依据事实，检查适用依赖及 Concern。只要求本 Goal 所需的验证，不重新启用全部旧 Review policy/固定阶段。失败或未知收尾报告可以保存，回执清楚区分 recorded 与 completion_applied。陈旧正式版本必须拒绝或给明确冲突结果，不能覆盖新事实。
- 完成后新要求或指向已采用支持的反证使当前状态出现差距并更新完成效果，原因可追溯；无关观察不重开。取消后的普通报告不自动恢复；恢复是显式操作。父 Goal 的自己整合结果与收尾由同一服务验证，子 Goal 数量不是支持证据。
- 检查旧状态写入的直接入口与祖先传播：`evaluateCompletion`、`satisfyForLifecycleFacts`、`reopenForLifecycleFacts`、`reopenSatisfiedCompoundParent`、`markSatisfiedGoalForEvidenceRevalidation`、`reopenCompoundAncestorsForUntrustedChild`、`satisfyClosedCompoundGoalIfReady` 及旧执行入口。事件归属的 Goal 必须在副作用前拒绝旧写操作或由同一新服务适配；祖先批处理不可因为碰到事件 Goal 而回滚另一个合法旧 Goal 的写入，也不可越过归属直接写它。

允许修改面：

- `packages/contracts/src/modules/goals.ts`、`goal-events.ts`，必要的 `governance-collaboration` 与 Host capability 类型。
- `modules/goals/src/` 内事件持久化/状态服务、装配、正式生命周期与仓储投影的相关路径；DDL 仍由模块定义，Host `project-migrations.ts` 只装配。
- `modules/governance-collaboration/src/` 仅可信决定的记录、来源校验与事务协作，不重写旧提案系统。
- `modules/execution/src/` 仅确需的新旧 Goal 归属写入门禁及相关端口；不重写 Host 运行、进程管理或增加新调度器。Module 间通过公开事实/端口协作，不跨模块写业务表。
- `plugins/native/goals/src/` 的事件应用、公开 capability、新旧状态归属门禁与既有生命周期委派；`plugins/native/work/src/http/panels.ts` 等确切父目标执行门禁。
- `apps/local-host/src/` 装配、可信身份/用户入口与能力分发；`apps/mcp/src/` 新状态工具的专属 schema/handler、catalog、dispatch、activity。
- `skills/goal-advance/` 对齐真实状态回执与接续行为；模块 README 与 `docs/modules/goals.md` 的本项事实。
- `tests/goal-events-state.test.ts`、`tests/mcp-goal-events-state.test.ts` 及真实受影响的生命周期/治理/父 Goal 执行回归。

不修改生产 GoalDetail 布局、主题、原型、spec、全局 Skill、真实用户数据库、Git 提交和发布。实际 UI 用户交互由 04 接入；本项可信用户能力需有真实 Host/受保护 Web 或等价公开管理入口验证，不能仅 mock 一个 actor_kind=user。

## 必需验收方向

真实 Host/MCP + SQLite 验证普通支持不自动完成、未知/失败的完成请求被记录但不生效、显式完成成功、取消无伪证据、可信用户确认、重复授权复用、关联 Concern 处理、相关反证重开且不影响其他要求、重启读取、过期正式版本拒绝及批次原子性。另直接调用旧完成/执行入口，证明不能绕过新 owner；父目标不能由子数或旧自动分支完成。UI 尚未替换，不宣称全项目可用。

测试应使实际公共实现被改错时稳定失败，并验证回执、持久化状态、日志和后续读取一致；不能用字段存在或固定事件数量自证。覆盖新意图没有约定时可以记录但不能完成；摘要依据当前 Goal 游标、新事实过时、无关 Goal 更新不污染；可信用户决定与 Runtime 伪造；决定范围与复用；关联 Concern 的未解决/解决/接受；合法部分成果保存；过期正式版本与同键重试；父 Goal 独立收尾和旧入口无副作用拒绝。使用独立临时 home/SQLite，不访问 ~/.molis-work。

执行命令：

```sh
pnpm_config_verify_deps_before_run=warn pnpm build
node --import tsx --test --test-concurrency=1 tests/goal-events-state.test.ts tests/mcp-goal-events-state.test.ts tests/goal-events.test.ts tests/mcp-goal-events.test.ts tests/goal-events-planning.test.ts tests/goals-command-module.test.ts tests/governance-collaboration-module.test.ts
pnpm_config_verify_deps_before_run=warn pnpm boundary:check
```

补跑受实际修改影响的既有生命周期/执行回归；测试缺失时建立最小真实复现场景，不为了通过而保留已退役状态效果。pnpm 的 verify-deps-before-run=warn 仅用于当前依赖环境的 enableGlobalVirtualStore 预检查差异，不安装/更改依赖。

交回：实际公开 API、真实调用与响应、状态 owner 的唯一写入与旧门禁、可信用户来源边界、修改文件、运行命令与验收对照、04 可消费的当前状态/时间线/用户操作端口，以及确实未完成项。只执行本项；不使用 ForkLight，不启动其他 Agent，不提交或推送，不运行真实用户数据库迁移。

## 首轮独立验收：需修正的合同缺口

2026-09-09，主 Session 在 Grok 首轮构建及指定 32 项测试通过后，用当前构建的真实 Host/MCP、公开 Native Goals 应用和临时 SQLite 复现以下问题；当时 writer 正在完成文件拆分与边界检查。复现脚本为 `/private/tmp/molis-work-grok/03-review-repro.mjs` 和 `03-review-gates.mjs`，各自结果在同前缀 `-result.json`。这些是原合同要求的具体反例，不扩展产品范围。待首轮交回后按最终实现重验并统一修正。

- 决定效果与范围：用户选择拒绝风险，仍能被 `event_concern accept` 引用而改成 accepted。接受风险必须有可信且明确的接受效果，并覆盖该 Concern；决定存在、空范围、自然语言或任意选项 ID 均不是授权。解决/推翻所引用决定也必须适用；不存在/跨 Goal/不满足关联条件的来源不能解除阻塞。首轮不存在的 event ID 能成功推翻 Concern。
- 正式并发版本：连续两次 outcome-only `event_agree` 使用相同旧 config version，后者仍覆盖前者。初始补充、约定修订、收尾必须检查实际会变化的正式版本；在同一事务中拒绝陈旧写入并保持原回执幂等。不得让 Intent、当前约定与正式收尾依赖互相矛盾的结果说明。
- 完成门禁：明确 `depends_on` 的前置仍 open、已接受且要求人工确认的 Goal policy、已有 completion Risk、针对完成动作的待决定，首轮均可被绕过。保留这些实际适用来源并进入统一当前状态/收尾检查；不恢复旧模板默认角色阶段。完成还必须有具体的本 Goal 结果，不能以空 result 生效；取消不要求结果。
- 当前效果一致性：完成后记录相关用户拒绝，当前仍 completed/satisfied；人工要求的后续反证虽重开，随后可凭旧验收再次直接完成；complete→cancel→resume 后 work_status=open 而 fulfillment=satisfied。相关事实和决定变更必须一致更新当前状态、差距及历史结论失效原因；历史原文不改。明确不允许的状态转换也可无副作用拒绝，不能产生互相矛盾的状态。
- 授权复用：添加一个不相关的可选类型便拒绝复用原要求的有效验收。只有所适用承诺/范围真正变化才使决定失效，不用整个配置版本粗暴代替具体承诺变化；实际变更后的要求不得继承旧支持或旧批准。
- 输入边界：`event_close kind=not-a-valid-kind` 首轮会按 complete 生效。所有有限状态操作的枚举与结构在公开边界做真实校验；非法输入不写事件、状态或幂等成功回执，不从 else 分支赋予完成或推翻语义。
- 时间线可读性与类型合同：进展摘要即时 stale 已在首轮自测修正，但 `event_read` 的摘要事件缺原文，无法从历史正文恢复当时所说的内容。所有系统状态事件需是以 operation 区分的有限 typed payload，保存该动作可阅读的必要原文、版本和来源；不得以 `[key: string]: unknown` 把解释责任交给 UI。当前摘要与原回执的时效在真实依据不同的情形也应一致。

以上修复沿现有 Module/Governance/Native/Host 责任边界。Tests 验证公开调用、返回、持久状态、历史与后续行为；不能改 spec、放宽门禁、删掉反例或把业务语义改成“调用方自己保证”来通过。

补充同批修正：升级保留已复现失败。`03-review-upgrade.mjs` 在临时数据库中通过生产入口写入 report + supports，构造上一版仅允许 configuration/report 的 v32 表形状并保留全部数据，再用生产 Host 重开升级；升级前 event_read.judgments 存在，升级后变成空且 current_report=null，正文仍在。`expandWorkEventKinds` 在事务内部切换 foreign_keys 实际没有关闭外键，DROP 原事件表触发判断表 ON DELETE CASCADE。需要在原子升级中保留事件与关联判断、来源及后续可观察状态，非空旧库升级和再次重开必须真实验证。复现与输出：`/private/tmp/molis-work-grok/03-review-upgrade.mjs` / `03-review-upgrade-result.json`。这属于原有历史保留合同。主 Session 在首轮修正仍读材料时暂停并补入同一批输入，避免遗漏后再追加一轮。

### 显式决定效果的最终对齐（独立复验）

首次修正后的原三组独立复现已通过；新引入 effects API 需要对齐同一授权合同。`03-review-effects.mjs` 通过真实 MCP/Host 复现：显式 accept_requirements 却因旧 bool 默认 false 写为 rejected；同作用范围后续 authorize_action 仍被历史 deny_action 永久阻断；scope.action=release 能携带 authorize_action complete 并持久化。

- effects 存在时，是明确效果的唯一输入；规范化后所有公共回执、Governance 记录、要求当前结论和完成状态必须一致。旧 accepts_requirements 仅为未传 effects 的兼容输入；互相矛盾的双输入应明确拒绝，不能各层各取一边。
- 效果不得超出声明 scope；要求效果需实际 requirement_ids，Concern 效果需实际 concern_ids，动作效果必须匹配 scope.action。错误无事件/决定/幂等成功副作用。
- 同一未改变约定、同一动作及可比作用范围的后续可信决定应更新当前有效决定；保留过去拒绝原文，但不得永久阻断后来明确允许。后来的拒绝仍会撤销当前完成；引用较早授权不能覆盖当前拒绝。不同范围或已变化约定不得自动互相替代。
- 修复落在已有决定规范化/持久化/当前投影链路，不新建状态机。添加实际公共入口回归，并重复原状态/门禁/升级回归以确认不退化。

主 Session 独立指定测试实际为36 pass/2 fail，日志 /private/tmp/molis-work-grok/03-accepted-tests.log。失败 tests/goal-events-state.test.ts:513（父 Goal 支持后收尾回执仍 false）与 :809（cancel后读到旧complete）。源码 latestClosure 按 recorded_at DESC, 随机 closure_id DESC；同毫秒并列会错误选择旧记录。该根因同样影响按 recorded_at+随机ID 的 summary/decisions 当前选择，直接影响本项“最新决定”。使用已有 goal_work_events.journal_seq 的真实接收顺序决定最新，无需新增排序协议；保存回执必须对应本次事件，当前读取对应最新事件。补可控同毫秒的生产路径回归，不以sleep、重试到绿或放宽断言解决。不要无限扩展审计，完成这条真实已发生状态/决定链路修复。
