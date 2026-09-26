# 并行任务派发记录

2026-09-26。用户授权已派发。所有新增任务要求 AI 经 Prologue，使用当前工作代码的独立工作树，原 checkout 只读，共享入口由原 owner 串行接线。

| 任务 | 标识 | 启动状态 |
| --- | --- | --- |
| 实现启发式个人工作助理 | 01a0dba5-828b-7270-a20d-41f2818ec6e2 | 已回报接手；/Users/yijunwang/.codex/worktrees/d62d/goalboard；feature/personal-work-assistant |
| 实现跨任务成果与方法复用 | 01a0dba5-8298-7b32-976d-0c5a9385f0bb | 已回报接手；/Users/yijunwang/.codex/worktrees/6385/goalboard；feature/work-reuse |
| 实现跨端接续与团队协作 | 01a0dba5-8292-7f72-9a0c-d1f3bdbeff62 | 已回报接手；/Users/yijunwang/.codex/worktrees/573f/goalboard；feature/cross-device-team |
| 统一现有 AI 能力至 Prologue | 01a0dbaa-54dd-7b60-be5a-fc07ce030e8d | 已回报接手；/Users/yijunwang/.codex/worktrees/2f9d/goalboard；feature/prologue-convergence |

四个创建回执均已解析为正式标识，已收到各 owner 的目录、分支与首条验证路径回报；后续协作使用表内 task ID。

## 原 owner 与交接

| 原任务 | 正式 task ID | 本轮同步职责 |
| --- | --- | --- |
| 解释首页动作执行架构 | 01a0d468-fe5c-7410-8ae8-63a608d76f6d | 共用动作、Prologue/Character、Agent Host、流程衔接/恢复；新任务提交精确接线需求 |
| 优化 Connector 图标与接入方式 | 01a0db94-6a0f-71b3-b621-83ee75f9c47a | 授权内容、来源/版本、断连与更新信号，不另做助理 |
| 实现生产级 Plugin Builder | 01a0db8f-e3b4-7593-a020-c3f485d4d9d5 | Builder/Cognia 2，和 Onboarding 确认新资料归属/读取协议 |
| 重新设计 Onboarding 和项目创建流程 | 01a0d1ba-0b99-7940-a945-3ef906af02b5 | 导入侧唯一 owner，原文/引用/续跑接线，第二次任务入口 |
| 全面打磨产品体验 | 01a0db91-34e5-77c3-8db7-8c59c067b55b | 公共导航/状态/返回/人工接手，业务页面由新 owner 提供契约 |
| 设计 Molis Work Thread 群聊 | 01a0db96-629f-7911-b104-1230f78d2158 | 群聊界面与 Thread 交互；服务端草稿交给跨端 owner |
| 全面复查仓库架构与代码 | 01a0db8f-26a6-7951-9e90-62990912666e | 原审查已定稿；后获其任务内用户授权，独占修复无人承接的门禁/迁移夹具/SSOT/SDK发布清理，不进入新增工作树成为第二 writer |

以上七条同步消息均已发送成功；Onboarding、体验、动作和 Thread 任务已回报接收。三个新增任务均已确认独立目录/分支和第一条真实路径，互相及相关原 owner 的 task ID 已同步。Shelf 保持原独立任务，不增加重复开发。

## 启动时的新情况

Thread owner 回报群聊已进入实施，存在 `specs/molis-work-im/spec.md`、`packages/contracts/src/services/im.ts` 及 `server/src/{auth,database,errors,reads,writes}.ts` 未接线后端草稿；其后端 writer 已暂停。跨端任务需核对并接管这些草稿，与群聊 owner 协商身份、room/member/thread、分页消息、消息建 Thread、SSE/恢复和幂等 client_id；不要根据早先审计的“无正式 Server”再独立建一套。草稿存在不代表服务可用。

Onboarding 的一次 PDF 文本解析依赖更新需求已转给 Builder，双方直接协调原 checkout 根依赖/锁文件的串行交棒。现有 Host 构建的 `connector-mcp.ts` 未使用类型报告已交给 Connector owner 核对修复，不由统筹任务越界改写。

后续启动回报：Builder 已把依赖写入窗口交给 Onboarding；Connector owner 回报上述 unused 类型已修复。Cognia2 与 Onboarding 已达成资料归属：通用原文/原件/不可变版本归 Host Artifacts，Cognia2 只持有学习关系和用户理解；Home 暂存资料在项目采用后幂等登记 Artifact。

群聊与跨端进一步收窄：跨端 owner 管 server 公共身份/session/设备/入口及 continuity；群聊 owner 只管独立 `server/src/im/**` 聊天领域和界面，均不另建身份/同步。跨端工作树基线的 design-system `payload unknown` 报告已转 Builder 组件池 owner 核对；不是已确认的当前主目录故障，独立部分继续验证。

公共server core现已与apps/server启动器拆开交付。群聊owner按冻结清单将core精确接入主树、保留server/src/im/**，主树noEmit及4项HTTP/客户端回归通过。统筹的限定只读复核确认接口与资源齐全、core仅依赖contracts/storage且无反向环。Builder随后将唯一依赖窗口交统筹，已完成server workspace/filter/inventory、local-host server/im-ui依赖、当前锁及链接更新；pnpm install --ignore-scripts通过，锁仅新增必要links和server importer，没有dist或第三方版本改动。原local-host inventory遗漏的既有node-pty/MCP/TypeScript依赖一并对齐。69包inventory仅余Builder sandbox源文件与README的2项既有maturity标记问题，已回交owner。依赖窗口已交还Builder。动作owner已顺序emit server/im-ui通过，给群聊owner两src adapter与noEmit窗口；最终Host产物仍由动作owner统一构建。apps/server和资产迁移已在随后独立批次接入，见下。

跨端资产恢复改为原Catalog+LocalHost+Artifacts登记。统筹核对到apps/server目前复用app-desktop公开Catalog适配（该适配注入现有面板schema/repository），要求其依赖交接注明原因并验证无桌面窗口/原生桥的独立服务路径；不为避依赖复制Catalog。公共server core仍只依赖contracts/storage。

架构审查报告旧文字/图片入口直连模型，统筹已读取代码核实，因此新增第四项迁移任务。共享 Agent Host/Prologue核心仍由动作 owner 维护，迁移任务仅拥有旧调用端与消费者回归。

## 审查结果交接

已阅读 2026-09-26 [独立审查报告](/Users/yijunwang/.codex/visualizations/2026/09/26/01a0db8f-26a6-7951-9e90-62990912666e/repository-review.md)。报告中的动态复现来自审查快照，当前修复状态仍由 owner 对照最新代码核对，不等于统筹已独立复现或修复。

- F1 调用身份借用、F2 异步等待后撤权仍写入：共享动作/Agent Host owner 优先修复并做业务回归。
- F3 预算映射、F4 工作流重复交接：同一 owner 在原范围处理，Prologue 收敛任务不另改共享核心。
- F5 Connector Host 直接写 Sources 状态：Connector owner 在现有范围核对、恢复唯一事实 owner。
- F7 模型直连：第四个任务负责。F6 门禁过期、旧迁移夹具、SSOT/包边界文档和SDK发布归档清理已由原审查任务按 [后续修复需求书](../repository-review-followup/spec.md) 独占承接；浏览器关闭 fixture 由体验 owner 独占。各项尚以各自验证记录为准，未宣称全部工程或真实产品验收通过。

Prologue 收敛 owner 后续核实 `modules/functions/src/provider.ts` 的 TypeSafe/SystemOne 分类推理也存在直接 HTTP 调用，已要求在同一任务迁移并保留结构化输出/状态协议。本地 OCR/Whisper 纳入能力清单，区分素材解析与模型推理，明确 Prologue 调度方式；不默认排除实际 AI，也不把本地识别改成文字大模型。

Connector owner 已直接向审查任务确认接手 F5。新官方 MCP 连接进入 Coding/Agent 的选择器与凭据回调接线，已交共享动作/Agent Host owner；Connector 保持连接及 `resolveMcpConnectionToken` 的事实归属，Agent 侧复用其刷新/断连检查并保留不同认证协议和 stdio 私密环境边界。设置页调用与 Agent 可用分别验证。

审查补修任务已交付其独占范围到原工作树，未提交/发布。统筹已读取最终 spec，核对迁移/发布/CI等实际 diff 及原始9项迁移、2项Home安装/npm pack通过日志；快照门禁仍保留F5两项真实越界。对应文件已通知统一构建owner纳入明确基线。这仅支持该补修范围的交付，不替代F1–F5/F7或主目录全产品集成验收。

Prologue收敛任务回报调用端19路径补丁已准备，图片/TypeSafe 30项回归通过；禁止单独合入未能编译的调用端。动作owner随后明确将整条共享inference实现移交给收敛owner：类型/适配/resolver、既有Runtime装配返回/close、composition代理、system-agent-service凭据绑定、SDK模态及本地调度必要扩展。收敛owner先保留主树F1/F3身份/预算/trusted caller/lazy-init修复，再完成整体；Action权限/Character/Workflow和project-host生命周期仍归动作owner。交接期间同一文件唯一writer，必要反向修改以最小diff交接，不按代码片段并写；不新建Runtime。此为职责移交，非生产联调已完成。

普通个人助理无需代码工作区：已明确采用同Runtime正式无root路径，由Action owner验证纯推理无工具角色并维护Host/角色合同，Prologue owner负责Node/SDK接入。manifest/install/actor/session/Character及最终dispatch guard照常核验；Coding/CLI/有文件能力角色仍要求授权目录，不把省略目录解释为cwd或整机访问。该行为已授权，未记录为已完成实操。

## 完成口径

个人助理已交专属commit `5a5d23eb` 及限定修复 `c890c244`（d62d/feature/personal-work-assistant，合计25个自有路径）。限定只读复核关闭recover回传缓存标题P1；模型分派P1已在专属模块与2f9d新版Host/Node/SDK配套组合中通过27项联验（9种准备/凭据/最终dispatch交错全部0fetch），统筹已读原始输出及断言。主树随后整合同一套运行时，正常依赖完整助理27项加Character2项共29/29通过，统筹已核对原始日志与新dist声明。统筹已在动作owner的源码窗口精确导入24新文件、追加既有子spec，未改共享入口/exports/dist，未启用生产。主树15项业务/来源回归通过；对齐当前正式AgentWorkspace判别联合类型后专属严格TS通过（仅类型透传，不伪造目录或cast）。动作owner负责Home/角色/HTTP接线，Prologueowner提供最终SDK联验。模块工程/隔离界面、真实模型与公开取数分别有证据，生产Home→Prologue→Inbox/Pages→编辑器及三次复用验收仍未完成。

当前共享构建窗口：此前混合产物下的浏览器结果不作为稳定集成验收。Shelf/体验已返还前一窗口，动作owner完成小批依赖/local-host/desktop构建并通过project-host实际import smoke；Onboarding本轮以“功能可用”交付并返还4173；Shelf因CUA故障保留真实picker未验证，前一全局QA读窗口已释放。统筹仅完成获准的manifest/lock/链接更新，未动dist；动作owner随后已构建server/im-ui，IM adapter接入及最终Host构建由其串行调度。启动性能仍待解决：F2串行Form测试亦超时，真实Host健康/导航延迟不能以AJV微测试通过替代。动作owner正在合并Shelf、Onboarding及跨端headless的阶段计时/CPU证据，未宣称整体验收通过。

成果复用原34文件implementation.patch及13文件P1增量现已由统筹精确应用到主树共37个Alchemist路径，保留原Action迁移，无共享Host或dist改动。限定只读复核确认缓存来源投影P1修复（receipt/feedback/reconcile/plan/JSON ZIP导出）；模型前持续guard的专属端口已覆盖assess/crosscheck/summary/纠错及原actor/来源/方法校验，但最终SDK真实分派P1仍待生产适配联验。主树Alchemist typecheck、2文件16项业务/撤权回归及diff-check通过。子任务全包26文件78测试及4HTTP测试、三轮8次真实Prologue合成研究另有证据；不替代主树生产接线。Artifact/Ledger/callerFor与sharedInference由Action owner接入，未宣称内部完整或真实市场/工时收益。

Onboarding交付范围及证据见 `docs/design/molis-work-onboarding/mac-access/verification.md`，统筹已阅读。原生授权/取消/重启/元数据预览/排除/读取和最终浏览器采用分别有实操；正式Pages/Artifacts及3份原件字节一致，目标“功能可用”。新版整轮原生最终采用未完成：health 4.18s超过400ms探针误判，之后CUA故障。未当作原生内部完整、安装发布或本人验收通过。

独立apps/server最终批次已接收：统筹阅读精确handoff/实际代码/原始CLI等日志，限定只读复核确认配置allowlist重启撤权P1已修（旧cookie读写/资产/SSE403、旧invite401、再次加入仅owner）。已精确导入20新路径，更新server README正文且保留主树metadata，追加子spec；不覆盖公共core/IM或共享Host。Builder明确交来的依赖窗口已完成inventory与7既有workspace依赖、最小lock/链接登记，随后返还；主树app-server typecheck通过，未emitdist。包检查70项仅余sandbox两项旧标记。Action统一构建后已执行当前主树compiled launcher测试并通过；隔离子树headless/业务/浏览器证据也有效，生产主入口、物理手机/LAN/云及用户验收仍未完成。

助理后续39a6e594仅将Store驱动类型改为原storage公开factory ReturnType，已精确入main；专属严格TS通过，完整边界扫描不再有assistant错误，剩余仅Builder sandbox两项metadata。workspace:none角色/可信session测试及opt-in脚本增量42223829/08c66209的7路径已精确入main，保留此前主树记录、Store/AgentWorkspace类型；旧带目录模型证据不替代无目录真实厂商调用，正式Home/Pages路径仍待验。

Prologue阶段v1 source/vendor与旧callsite迁移已由Action owner精确合流（保留其Character核心），frozen install回报通过，依赖窗口返Builder。统一dependency→Agent→LocalHost/Desktop/app-server批次构建现已由owner回报通过；main正常依赖助理27项+Character2项29/29通过（日志/tmp/action-shared-main-assistant-character.log），统筹已读取；主目录正常依赖的助理专属严格TS由统筹执行exit0。app-server compiled CLI主树1/1已通过，9.38秒，统筹核对/tmp/action-cross-device-launcher-main.log。最新IM UI已冻结并正式emit，owner已在54702切换纯built Desktop+LocalHost主入口实操：群/Thread/双草稿及灵光切换保持、115条分页、停服后Thread错误与SSE恢复回复通过。独立设计/只读review回报SHIP；用户认可仍待，不沿用旧UI截图。此为阶段合流，全部本地AI/外部CLI调度仍由Prologueowner继续，不能记为全AI收敛完成。

本记录表示派发和启动，不表示功能完成。子任务分别记录实现、真实实操与未验证项；在没有实际后台监控授权/配置前，不声称本任务会持续自动盯进度。
