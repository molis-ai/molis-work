# Molis Work 审查报告与优化策略

状态：代表入口审查与三批本地定向验收完成；首屏路径已获批准，CI Verify通过；Full因Linux几何检查失败，阶段尚未结项。负责人 Codex；基线 `efdaa3376`（2026-11-15 拉取）。[需求与验收](spec.md) · [逐包覆盖](coverage.md)。

## 当前判断

平台已有统一动作、授权、事务、插件装配和对象链接能力。当前重点是核实实际消费与恢复路径，而不是继续增加抽象。旧报告中有多项建议会破坏已有语义：把表单关闭设成终态会取消重新开始收集；删掉搜索的第二次目录读取会撤掉异步等待后的权限复核；审批投递失败自动重试可能重复执行已经接受的批准。

构建通过只支持工程判断，尚不能宣称整个平台内部完整。登记表有 73 个包；统一 BL 现有 527 条，其中 64 条为待本人验收、202 条明确后续做，不能直接当作死账删除。需求族判断与逐项清理决定见下文；不按条数计算完成率。

本轮选择的三批改造已经落在工作树：导入保留剩余选择与准确重试、Feed 等待清理、三组纯动作绑定迁移。用户因此少重选文件、少重复导入已成功文件、少看错位的结果；开发者少维护 DOM 派生的队列事实、遗留的取消回调和三份换参包装。其余问题按影响与合同成本排入后续策略，不能把本报告的全部建议都算作已修复。

## 发现与处置（是否实施逐项注明）

### QF-01 / P1：资料批量导入丢失尚未处理的选择，并让重试结果错位

- 基线位置：`apps/workbench/src/browser/knowledge/import.ts:179,203-204`；`take:151-155`；目录遍历 `:24`。
- 正常链：侧栏资料 → 导入对话框 → `bindKnowledgeImport` → `/api/artifacts/import` → 成果服务保存固定版本 → 每个文件的结果行。待处理选择归工作台客户端；业务结果归成果服务。
- 触发：选择 201 份时只处理前 200 份，完成后 `picked = queue.filter(...)` 覆盖全部选择；处理中追加文件会重画结果行，持有旧行引用的异步循环继续更新已移走的节点；失败重试没有先按新队列重画，沿用旧行号。目录拖入超过 400 份时还会静默截断。
- 影响：用户重选遗漏文件、重复导入已成功项，不能信任失败标记；等待中的文件状态由数组和 DOM 类共同决定，难以追踪。
- 决定：客户端只移除明确成功的条目，处理队列与当前结果行一一对应；追加只进入下一批，尚未处理条目优先于本批失败项，避免200份全失败挡住后续；重试前重画，显示本批尚待导入数量；目录遍历先排除隐藏/依赖目录，保留其余选择。维持每批 200 份和服务端既有幂等规则。不增加平台队列或存储。
- 成本与验证：低，限客户端与词条。`QEA-05/06/07` 在隔离 Home 通过真实文件选择/拖入、真实 HTTP 写入和成果记录验收。基线 `QEA-06` 已复现追加使结果行失效；`QEA-07` 已复现超过 400 不可达。首轮 201 份实导超过新测试的 90 秒等待预算，只算等待不足，未冒称其失败已直接证明丢尾。

### QF-02 / P2：Feed 常驻连接监听每次唤醒遗留取消监听器

- 位置：`plugins/native/feed/src/runtime-reconcile.ts:21-30`，消费者 `keepFeedReconcile:112`。
- 触发：每轮 `next(signal)` 注册新的 `abort` 回调，正常 `changed()` 唤醒后不移除；同一个后台 job 的 signal 可活到插件停用。
- 证据：调用生产构建的 `createConnectionWatch`，连续 12 次 `next → changed → await` 后 `getEventListeners(signal, "abort").length === 12`。
- 影响：长期运行随账号连接变化累积闭包，停用时重复唤醒早已完成的等待。属于明确的资源生命周期缺陷，不需给业务另造状态机。
- 决定：正常唤醒和取消共用同一个清理出口；保留忙时通知合并与取消结束等待的语义。归 Feed 自有后台监听，不新增共享层。已修改，QEA-08 与原 FI-C-07 等 10 条定向测试通过。

### QF-03 / P2：Git 的草稿工具与实际编辑入口脱节

- 位置：`plugins/native/git/src/drafts.ts:52-108` 仅由本包导出与 `tests/git-plugin.test.ts:70-79` 使用；实际页面 `plugins/native/git/src/browser/source.ts:28-38,100-101` 只读取 Coding 交来的提交说明，`plugins/native/git/src/browser/conflicts.ts:70-86` 每次打开冲突直接用文件正文替换编辑区。
- 影响：用户自己输入的提交说明、分支/PR 表单与冲突解决文本没有共同的恢复路径；尤其再打开同一冲突文件会覆盖尚未提交的编辑。现有草稿 round-trip 单测不证明页面保留输入。这里指整页重载/重新挂载及重新打开冲突文件；同一页面内刷新 summary、隐藏再恢复 PR 表单已由 `tests/git-source-controls.e2e.test.ts:152-249` 覆盖保留，不能一概说“刷新就丢稿”。本轮未新增 Git 浏览器复现。`parseStoredDrafts` 还截短字段为 4096，但没有实际页面调用，不能把它冒称为当前入口的数据截断事故。
- 决定：留后续 Git 完整草稿恢复批。状态归 Git 编辑器，以项目/工作目录/文件与读取修订定位；复用现有页面草稿机制前确认冲突正文大小与隐私边界。先接正常页面、切换/刷新/冲突改版实操，再删被替代的工具和镜像单测。公开导出先走合同废弃核对，不直接删除。成本中。

### QF-04 / P2：Home 后台汇总把读取失败显示为空任务

- 位置：`apps/local-host/src/home-background-tasks.ts:23-36` 丢弃聚合的 `issues`，只写诊断；`apps/local-host/src/attention-http.ts:46-51` 将数组传到 Home；`apps/workbench/src/scripts/client/attention.ts:43,95-96` 收到 `[]` 就画「现在没有后台任务」。
- 触发与影响：所有已安装来源超时或报错时，用户看到“没有任务”；部分来源失败时总数也无不完整标记。与查询整体失败时返回 null、保留上次显示的策略不同。这会让仍在执行的任务看起来消失。
- 决定：补齐 Home 汇总结果合同，保留 `tasks + issues`，复用项目后台表已有的 `MainlineIssue` 语义（`horizontal/mainline/src/index.ts:116-127`），由工作台显示一次“部分任务暂时读不到”和重试入口。来源负责事实，汇总负责完整性，页面不推断任务结束。不加弹窗、不把诊断原文直接曝光。成本中，需合同与 HTTP/UI 迁移，列后续批；验证全失败、部分成功、恢复和停用来源正常不计错。

### QF-05 / P2：动作绑定有现成公共实现，局部包装仍重复维护

- 位置：`packages/contracts/src/platform/action-input.ts:8-12` 已提供 `bindActionHandler`；相同换参包装仍在 Dataset `plugins/native/dataset/src/actions.ts:69`、Form `plugins/native/form/src/actions.ts:84`、Todo `plugins/native/todo/src/organize-actions.ts:101`、Cognia `plugins/native/cognia/src/actions.ts:60`、Images `plugins/native/images/src/actions.ts:45`。
- 影响：各插件重复把 Kernel 已验证的 unknown 转为输入类型，后续扩执行元数据容易各自漏接；这些包装没有独立业务职责。
- 决定：直接复用现有公共绑定，不新建平台抽象；逐个迁移调用方，保留 availability。Pages/PPT 的本地包装还固定授权，Workflows 还构建业务上下文，不能用文本替换一刀切。成本低但跨包，本轮第三批已迁移 Feed 的 query-actions、inbox-actions、rule-actions 共三处纯绑定，其他包留后续；以真实动作入口的拒绝、异步撤权和正常保存回归证明。

## 旧报告复核：不能直接执行的建议

| 原线索 | 当前代码与反证 | 处置依据 |
| --- | --- | --- |
| Coding 查询边读边写 | `plugins/native/coding/src/session-observation.ts:11,25,43,54,58` 默认 `persist=false`，普通查询投影不写；持久观察显式传入写入模式并复核原记录 | 删除“普通读取必写库”的缺陷结论。观察缓存是否仍必要继续按调用方审，不因为存在投影列就删库 |
| Work Brief 未知执行会重放 | `plugins/native/work-brief/src/next.ts:39-46,84-87` 拒绝 unknown，再由用户核对原主人后清除记录 | 已有保守恢复边界，不能改成后台无条件重试 |
| Form `closed` 应设成终态 | `tests/form-actions.test.ts:194-200,263-272` 明确验证关闭后重新开始收集；`FormStore.publish` 支持该路径 | 旧报告的 draft→published→closed 终态方案不符合现行产品语义。若收敛声明，必须保留 closed→published |
| 审批先消费再投递，应改成投递成功后才消费并可重试 | `horizontal/agent-host/src/adapters/prologue-approvals.ts:210-232` 保存决定并交出一次性授权；异常注明 answer 可能已提交。`reviews.ts:118-129,225` 有核对入口和投递失败结果 | 超时不证明未执行；修改必须区分“明确未送达”和“结果未知”，不能扩大批准复用。继续检查恢复真正可用性 |
| SearchService 两次 discover 属于重复查询 | `horizontal/search/src/index.ts:247-266` 第二次在 catchUp/authority.validate 后，紧接同步授权 fence；`:568-575` 索引目录也保留前后权限 | 这是 TOCTOU 边界。若优化应缓存与失效机制由原 owner 证明，不直接删复核 |
| Images 请求封装可直接换 pluginRequest | `plugins/native/images/src/browser/request.ts:10-17` 支持 DELETE；SDK `browser.ts:184` 只接受 GET/POST | 两者当前合同不完全相同。先判断是否补齐 SDK 方法集合，再迁移真实 DELETE 调用方，不能机械替换 |
| 公开 Contract 常量仓内零引用就删除 | `packages/contracts/package.json` 是对外发布入口，包外消费者不在本仓搜索范围 | 只能给出废弃候选及合同影响，不能把搜索零命中当删除证明 |
| 对象链接平台能力缺失；后台汇总只有 Coding | `packages/contracts/src/platform/object-link.ts:12-21`、`packages/plugin-sdk/src/index.ts:98` 已有共同链接；`apps/local-host/src/home-background-tasks.ts:22-37` 按声明聚合，Images `plugins/native/images/src/background.ts:13` 已贡献 | 旧报告/11-14 平台审查已部分过时；转查剩余手写地址及 Feed/Schedule 等真实缺口，不再重建底座 |

## 六个方向的独立结论

| 方向 | 检查方式与已确认结果 | 处置 |
| --- | --- | --- |
| 隐式状态 | 对照持久事实、内存执行句柄和 DOM 状态；导入队列曾由数组与 DOM 共同决定，Feed 等待没有完成清理。Coding 的业务归档和执行归档是不同 owner 的事实，不能强并 | QF-01/02 已改；Run 显示时间耦合另列 QF-06；业务状态声明按第 47 批兑现 |
| 过度防御 | 从 HTTP/动作 schema 到 owner 写入核对校验；Home 把读取故障降成空列表确实掩盖故障。Search、SQLite、RSS 的重复外观检查分别保护等待后的权限、实际 SQL 和实际网络地址 | QF-04 待补完整性；保留真实信任边界，不按 catch/if 数量删代码 |
| 用户干扰 | 核资料导入/重试、任务查看、Git 编辑、模型接入返回、审批、角色启停和账号切换 | 导入减少重选与无效重试提示；“取消”仅关闭的剩余语义差异见 QF-10；审批无效按钮 QF-07、Git 恢复 QF-03 列后续。删除、账号权限与模型下载等有实际决定的确认保留 |
| 冗余代码 | 从注册到实际调用方，区分私有重复、公共导出和未完成能力 | Feed 三处纯绑定已删；Git drafts、WebQuery/YouTube 工厂与旧 Home events 是待核退役候选，不能连仍被使用的 channel 工具一起删 |
| 边界与调用链 | UI/HTTP、Agent、后台、CLI/MCP 沿公开动作追到事务和反馈；73 包静态边界门禁通过 | 明确事实 owner、执行身份、最终写入与反馈；发现搜索取消传递中断 QF-08。没有把边界门禁通过误作所有业务正确 |
| 平台化 | 同时从平台声明向下追消费者、从插件特判向上找 owner | 下表 12 项处置逐项区分已有能力、采用缺口、合同待补、共享工具及插件业务；优先补采用，不再建第二套目录或任务事实 |

## 其他已确认问题和设计风险

### QF-06 / P2：显示时间保存影响了执行终态与下一轮准入

`horizontal/agent-host/src/adapters/prologue-run-store.ts:131-133,214-228` 在执行账本已经终结后，仍把公开 phase 暂时设为 running，等待 `saveRunTiming`；`latestEnded` 又依据该公开 phase 判断是否结束。`tests/prologue-recovery.test.ts:449` 已有用延迟提交控制这条路径的测试。因此这是现行设计耦合，不是本轮声称复现的随机卡死：非业务的显示时间写入会延长用户等待；无限等待的极端场景本轮未实测。

处置：中成本，归 agent-host。保留“执行账本提交后才终结”的正确边界，把时间元数据的保存/失败与执行终态分开；不得直接删账本等待。需验证下一轮可启动、重启后的时间未知、迟到完成不改写新 Run、取消与保存失败。涉及共享核心及现行恢复合同，留后续专项。

### QF-07 / P2：当前不能批准的待审项仍有批准按钮

`horizontal/agent-host/src/reviews.ts:140,265-268` 恢复的插件操作没有当前进程授权，批准会拒绝；`apps/workbench/src/agent-review-surface.ts:203,235-243` 对可决定的 pending 项仍画批准与拒绝。现有 [BL-360](../backlog/BL-360.md) 经本轮代码复核仍成立，用户会多点一次后收到拒绝。

处置：中成本，审查队列投影提供当前可执行决定及原因，页面照投影显示，保留服务端最终拒绝；批准权限不由页面猜，不恢复旧授权。验重启、撤权、停用、过期与正常批准。并入原 BL，提升体验修复顺序，不另立重复事项。

### QF-08 / P2：搜索请求取消没有穿过 HTTP 入口

`apps/local-host/src/search-http.ts:11,17-28` 创建无 signal 的 BoundActionClient，四个路由没有请求中止绑定；实际调用方 `web-project-platform-routes.ts:244` 与 `web-catalog-routes.ts:70,100` 也未给绑定客户端传 signal；[BL-search-query-abort](../backlog/BL-search-query-abort.md) 所述缺口仍在。浏览器放弃旧查询，来源仍可能继续读，浪费工作并拖慢新查询；本轮是调用链确认，没有新增耗时测量。

处置：低到中成本，归 Host 传输适配；沿 composer 已有方式把请求/连接关闭接到动作 signal，保留 Search 的异步后权限复核。验来源确实收到取消、迟到结果无写入、下一请求正常只执行一次、监听释放。不把取消做成失败弹窗。并入原 BL。

### QF-09 / P2：需求索引与现行 spec 的阶段不一致

`specs/README.md` 的 state-machine-platform 条目仍写“尚未实现”；`specs/state-machine-platform/spec.md` 开头已明确第 26 批交付 Manifest、SDK、词表首片与只报告门禁；生产实现位于 `packages/plugin-sdk/src/state-machine.ts:16-38`。索引读者会把“采用未完成”误认为“底座未实现”，重复开工或错误清账。

处置：低成本，本轮已依据原spec校正索引，明确第26批交付范围与第47/48批接续；没有改成“全部完成”，没有更改原spec或各批验收结论。存量迁移与待本人验收继续保留在原待办。

### QF-10 / P2：导入中的“取消”实际只关闭对话框

`apps/workbench/src/side-panel-files.ts:78` 的取消按钮与标题栏关闭使用同一 `data-knowledge-import-close`；`apps/workbench/src/browser/knowledge/import.ts:244-245` 只执行 `dialog.close()`，busy 时还特意保留队列。`importFiles:188-210` 不检查关闭或取消，继续处理本批。QEA-06 实操证明关闭/重开后仍完成真实导入；这证明恢复原界面有效，不证明“取消操作”已提供。

影响：用户在导入中点“取消”，仍可能继续写入后续文件；当前文字与执行语义不同。已成功保存的文件不应因取消而回滚。处置：中成本，工作台负责区分“收起继续”和“停止剩余”，Host/成果 owner 负责当前请求中止与最终写入回执；停止后保留未处理项，结果未知按既有幂等身份核对再重试。需要实际点击取消、等待中止、已完成/未处理/结果未知分开验收。本轮只修队列与恢复，不把关闭悄悄改成取消，不宣称导入全生命周期已经完整；与 QF-03/04 同属下一批连续性修复。

## 平台化与通用化检查及处置

| 候选与当前实现/消费者 | 定制造成的问题 | 事实与规则 owner；处置 | 顺序/成本 |
| --- | --- | --- | --- |
| PF-01 对象引用、跨插件呈现：`packages/contracts/src/platform/object-link.ts:12`、`horizontal/surfaces/src/position.ts:20-34`、`apps/local-host/src/surface-slot-http.ts:75,122` 已有受控 plugin-slot；Inbox `plugins/native/inbox/src/browser/client.ts:40`、Risk `plugins/native/risk/src/browser/client.ts:45`、Work Brief `plugins/native/work-brief/src/browser/client.ts:22` 已使用，PPT `plugins/native/ppt/src/plugin.ts:35-45` 经 Pages 公开动作读内容 | 未发现这条 PPT→Pages 路径跨实现直连。组合槽已有 UI contribution 声明、Host 兑现和真实消费者，不能只搜 manifest.ts 就误报未采用，更不应重建底座 | 插件拥有内容/修订；平台拥有位置、身份及授权。保持 surfaceSlot 与 objectLink；新增组合沿相同入口验停用、撤权、对象删除和返回，不开放任意 iframe、不解除 mountDeclared 的 owner 限制 | 保持现有方案 |
| PF-02 输入的材料来源：`apps/workbench/src/browser/plugin-frame/composer-parent.ts:215` 固定 sources:false；底栏菜单和来源服务已存在 | 框架插件用户仍需复制粘贴，统一输入的能力因承载方式不同而缺一截 | 平台父页持本人身份获取选择，向插件传受限材料引用；补引用续接/大小/失效验证，复用原菜单。归 [BL-composer-frame-sources](../backlog/BL-composer-frame-sources.md)，不是取消 frame 权限隔离 | P1体验/中 |
| PF-03 Memory 会话来源：`apps/local-host/src/memory/memory-sources.ts:13`、`apps/local-host/src/memory/memory-session-binding.ts:51-64`、`apps/local-host/src/memory/memory-runtime.ts:20` 点名 Coding/Assistant | 第三个插件有合法 Agent 会话也要改 Host；来源资格和业务状态检查散在宿主 | 平台拥有可信会话身份/授权与记忆策略；插件提供来源可读性/业务状态的声明 reader。随 plugin-equal-standing 收口，迁移 Coding 实际路径再删特判，不能把资格交给输入字符串 | P2/高 |
| PF-04 后台任务：`apps/local-host/src/home-background-tasks.ts:22` 与 mainline；Coding/Images 已贡献，项目引导整理仍只有后台执行 | 有工作却不在任务入口；汇总失败又看似无工作 | 任务状态仍归业务 owner，平台管发现/完整性/可执行命令。接入既有 background_tasks/reports_to，修 QF-04；引导归 [BL-107](../backlog/BL-107.md) | P1体验/中 |
| PF-05 设置：`packages/contracts/src/platform/settings.ts:16,30` 有层级/CAS/request_id；`packages/plugin-sdk/src/sandbox-agent-declarations.ts:51` 仍拒绝沙箱 settings_entries；原生插件没有声明消费者 | 有合同不等于作者可用，局部设置仍各做继承、修订、返回 | 设置值/规则归 owner，平台管声明、继承呈现和调用。先完成 Runtime 读写兑现、选一个真实设置迁入再推广；本轮不建立全局配置大仓 | P2/高 |
| PF-06 草稿/返回：`packages/design-system/src/composer-rules.ts` 与 frame drafts 已有；Git 自有 drafts 未进正常编辑入口 | 同样离开再回来，不同编辑器丢失情况不同；未用工具及单测形成“已支持”的错觉 | 草稿文本归编辑器，平台提供按 Home/项目/安装/入口隔离与返回。Git 按工作区/文件修订接入，冲突正文不套输入框 4KB 限额；成功后才清草稿 | P1体验/中 |
| PF-07 来源拉取：Feed/Alchemist 用 `services.sourcePull`；`apps/local-host/src/source-vocabulary.ts:13-31` 的 presentation 已走 IntegrationRegistry，另保留 RSS/YouTube 专属纯函数；`plugins/official-integrations/web-query/src/index.ts:29` 与 `plugins/official-integrations/youtube/src/index.ts:28` 工厂无仓内生产调用 | 新声明路径与旧工厂并存，旧专属词汇又固化在服务合同；但新增来源的展示已经可走登记表，不能泛称所有新增来源都要改 Host | 集成拥有 URL/cursor/格式规则，平台管受控网络/凭据/证据。优先复用已有 presentation 登记；迁移剩余专属调用方时评估声明式输入是否足够，再废弃旧词汇/工厂。先核包外导出，保留 channel 工具；RSS 固定 IP 与 OAuth 刷新不硬并成普通 fetch | P2/中高 |
| PF-08 等待/调度/取消：`packages/plugin-sdk/src/execution-lifetime.ts`、`packages/plugin-runtime/src/activation-jobs.ts`、`horizontal/scheduler/src/index.ts:252,274,392` 租约、Workflow/Alchemist 自有进程记录 | 散落的计时器容易泄漏；但不同业务终态强并会破坏恢复 | 复用资源生命期工具；业务流程状态及租约回执留原 owner。Feed QF-02 已修；不再造通用万能 Job 表 | P2/低到中 |
| PF-09 调用追踪：`packages/kernel/src/action-settlement.ts:107,152,175`、`horizontal/observation/src/records.ts:164` 已有 call_id/invocation_id/parent_invocation_id；本轮 request-failure-call-id 浏览器回归覆盖故障详情 | 这部分已有跨层身份，不是应重新建设的缺口；本轮未证明所有插件业务写入均已完整关联 | Kernel 管调用身份，owner 管 subject/revision/事务结果，Workbench 管可见反馈。保留现有观测/查询；后续按具体未关联写入补证，不把泛化风险登记成已复现缺陷，不建立第二套日志身份 | 保持现有方案 |
| PF-10 HTTP 中止：Search 入口未透传、composer 已透传 | 调用方取消了，后台继续做；重复请求叠加 | Host 负责 transport→Action signal，SDK/Runtime 负责停止和写入 fence；修 QF-08，不为每插件造 AbortController 框架 | P2/低到中 |
| PF-11 动作绑定：公共 bindActionHandler 与多插件本地副本 | 纯换参/类型断言重复、元数据接入容易漂移 | 公共合同管绑定，插件保留业务上下文。Feed query/inbox/rule 三处已迁移；其他包按同样的真实消费者验收逐批跟进 | 本轮已做/低 |
| PF-12 固定成果与过程项：`plugins/native/dataset/src/promote.ts`、`plugins/native/ppt/src/promote.ts` 已用 owner 事务与 artifacts 联合提交；成果导入走同一服务 | 局部再存一份最终正文或把过程项当成果，会产生两个版本主人 | 业务编辑稿归插件；固定可引用成果归 artifacts，过程项走声明。复用已有联合提交，不统一各插件的编辑状态 | 保持并检查采用/中 |

PF-03/05/07 是采用或职责收口候选，即使目前只有一个实际消费者也须按 owner 判断；PF-08/12 同时列出不该平台化的业务部分。PF-01/09/12 是保留现有方案的判断，不冒充新发现。以上是本基线处置建议，不是全部已经交付。

## 需求整体实现度

判断：平台骨架、核心插件的大量功能已经真实实现，但整套 Molis Work 仍不能标为“内部完整”或“可发布”。这不是按代码量或 BL 数量算百分比：需求条目粒度不同，包的 production 登记也不等于整份产品需求验收。

本轮核对基线索引的 53 份活跃 spec（加本任务共 54）的状态与目标范围，并按以下11个需求族交叉查看代表实现与统一 BL；没有逐条重做53份 spec 的全部验收。可分为：

| 需求族 | 当前实现与证据层级 | 剩余实际结果 |
| --- | --- | --- |
| 动作合同、公开边界、SQL owner、升级链 | 已有生产路径与回归；本轮边界门禁和构建支持工程判断 | 存量 owner 采用、真实升级与各批最终验收不能被本轮替签 |
| 状态机平台 | 第26批已有声明/SDK/词表；本轮确认代码存在 | 第47批 Runtime 兑现、创作台、只读登记与第48批展示；144条旧盘点需逐条复核而非机械迁移 |
| 项目首页、工作线、明确交办 | 第15/32批已有实际组件、后台汇总、持续接单；工作线 spec 列了首片编号 | 事项容器/后续组合与多工作输入模型判断未完整；[BL-b32-acceptance-test-gaps](../backlog/BL-b32-acceptance-test-gaps.md) 保留 |
| 输入、语音、草稿和返回 | 第10/11批及 draft-and-return R0～R4 已做 | 框架来源、旧 Home 草稿版本与 DRT-21 实操/本人验收；Git 类非对话编辑器仍有缺口 |
| Account/安装/发行 | V2 登录和 Home 统一已合入，曾有 CI 证据 | unified-account 仍列最终候选 Full/存量迁移/外部服务；0.3.0 候选不等于公开可发布 |
| 插件同等待遇 | 注册装配与公开服务已成主路；规划方法片已交 | Goals 平台特判、Memory 会话点名等按第44批迁移，不能宣称同等化已完成 |
| 观测/评测/Memory | 第28/29批与 Memory P0/P1 已有具体代码 | 已知局限、部分真实输入验证/产品入口仍在原 BL；不能用本轮静态检查替代真实模型质量 |
| 资料导入、Feed、Inbox、常用编辑插件 | 核心路径工作，本轮修复导入/后台资源并有隔离实操 | Inbox 主线程性能、通用恢复一致性、各插件独立体验验收仍需跟进 |
| 创作台/Alchemist/智能呈现 | 有沙箱、job/replay、组合首片 | 完整创作→修订→安装→长期使用闭环尚未完成；Jev 质量/延迟及后续生成页面不是“只有文档”的问题，也不是已验成品 |
| Sessions 重做、团队协作/团队记忆、主动建议、Agent 显式人审 | 各有 spec；部分底座或在途实现 | 整项未实现/未合入的部分保持原状态；在途 PR 不能计作本基线完成 |
| 同步/桌面/计算机使用 | 已有实现、隔离测试及历史实操证据 | 本轮未接真实云、系统 WebKit、真实账号/模型，不据此签发布与真实环境验收 |

## BL 与事项清理建议

基线 527 条：待本人验收 64、明确后续做 202、已知缺口 170、未实现 46、部分实现 37、待用户决定 8。这里只给经核实的清理处置；未逐条销账的 527 条不统称过时。统一待办正文仍以 `specs/backlog/` 为准。本轮没有删除用户验收项或替其他会话结项。

| 条目 | 当前证据与可清理部分 | 应保留什么/执行方式 |
| --- | --- | --- |
| [BL-1039](../backlog/BL-1039.md) | 现行首次使用按钮已区分未连接/已连接，`tests/context-onboarding-action-copy.e2e.test.ts:22` 覆盖；第27批 action-copy spec §验证已有隔离实操证据 | 可关闭“未实现”的工程记录；本人验收并入 BL-batch27-acceptance，保留原编号到墓碑，不代签本人验收 |
| [BL-1040](../backlog/BL-1040.md) | `plugins/native/git/src/browser/source.ts:103-124` 已将状态改普通文字、缺远端隐藏 PR；`tests/git-source-controls.e2e.test.ts:18` 覆盖真实本地仓库、AX 与键盘 | 可关闭重复工程记录，剩余体验认可并入第27批验收；与 QF-03 的刷新/冲突草稿恢复不是同一问题 |
| [BL-040](../backlog/BL-040.md) | `packages/contracts/src/platform/plugin-sandbox.ts:121` 和 SDK sandbox-read-protocol 已有 subject_context；“生成插件不能声明对象读取器”过宽 | 改写为搜索来源与创作台草稿动作层缺口，保留未支持的 search_source；不能整条删除 |
| [BL-055](../backlog/BL-055.md) | `packages/plugin-sandbox/src/runner.ts:31` 已是真实子进程沙箱，“当前进程内执行器”描述失效 | 删过时括注，分别保留 Jev 质量/延迟、跨项目草稿；沙箱剩余平台限制链接当前专项 |
| [BL-observation-b28-known-limits](../backlog/BL-observation-b28-known-limits.md) | 正文已记录第29批补齐①②③、后续修⑥ | 完成子项移到来源 spec 的证据段，BL 只留④⑤等当前残余；不因列表里有已做项删整条 |
| [BL-115](../backlog/BL-115.md) | 正文记录离线备份/恢复/续接已在 main，真实 Home 2026-11-07 已做 | 将已完实施转为来源说明；只保留登记覆盖核对与 C 端在线定时备份，避免再次立离线备份实现 |
| [BL-117](../backlog/BL-117.md) | 策略、版本检查与0.3.0候选已有；公开发布资格仍在发布记录 | 与发行检查单保持一个剩余清单入口，不删除 Developer ID/公证/公开发布待办 |
| [BL-943](../backlog/BL-943.md) | 第06批有70→66、68→64的历史探针；仍未到原预算 | 与 Inbox 性能项关联同一目录 owner 代次方案；合并技术实施，不删原验收约束、不删权限复核。本轮未重测这些绝对数字 |
| [BL-inbox-update-blocks-host](../backlog/BL-inbox-update-blocks-host.md) | 当前 scene→availability→安装记录链仍存在；旧实测10秒级，不是本轮新测 | 保留高优先，先复测/剖析，再做一次操作内有失效代次的复用与让出事件循环；不通过放宽 UI 超时消账 |
| [BL-360](../backlog/BL-360.md) | 当前审批投影/按钮与服务端拒绝仍不一致，见 QF-07 | 保留并提前；修可执行决定投影后用重启/撤权 UI 证明，不能只靠服务端拒绝测试关闭 |
| [BL-search-query-abort](../backlog/BL-search-query-abort.md) | 当前 HTTP 路由仍没有 signal，见 QF-08 | 保留；可单独低成本修，验真实来源收到取消后再删除 |
| [BL-home-events-endpoint-unused](../backlog/BL-home-events-endpoint-unused.md) | 全仓生产客户端查询无调用；路由与测试仍在。MCP 使用公开动作，不证明包外 HTTP 没人用 | 代码退役候选：核对既有外部公开约定后，路由、只读放行、专属用例一起删；目前不据零命中直接删公共端点 |
| [BL-plugin-release-module-source](../backlog/BL-plugin-release-module-source.md) | 已有明确待用户决定，涉及库内保留内容及恢复路径 | 保留决定；“现在通常用不到”不等于授权删库/兼容机制 |
| [BL-composer-frame-sources](../backlog/BL-composer-frame-sources.md) | 旧阻碍“框架不能直接读”已部分被父页底栏接管替代，但 sources:false 仍在 | 保留真实缺口，技术方案转为父页受控材料交接，见 PF-02 |
| [BL-107](../backlog/BL-107.md) | 引导已经 Host 后台执行，缺后台任务登记 | 收窄为登记/进度/返回入口，复用现有任务贡献，不新做执行引擎 |
| [BL-177](../backlog/BL-177.md) | Sessions 新实现有在途 PR，当前基线尚不包含其完整目标 | 保留原归属；合入并对照全部三类场景后再拆完成/剩余，不能按 PR 标题销账 |
| [BL-state-machine-migration](../backlog/BL-state-machine-migration.md) | 144/89/55/32是旧盘点口径；SDK 已有，但所有布尔组合不都是真状态机 | 按实际 owner/合法迁移/取消恢复复核，剔除纯派生与资源句柄；保留逐批迁移，不宣称本轮确认了全部144条 |
| [BL-acceptance-first-slice-limits](../backlog/BL-acceptance-first-slice-limits.md) | modules/acceptance 已有项目范围事实；个人范围及可信决定接线未齐 | 保留对39/44批的依赖，别再开第二套“要求—证据—认可”存储 |
| [BL-1064](../backlog/BL-1064.md) | 锁定 Node 已有；本轮也发现默认24.14与要求24.15不符，切换后相关初始化恢复 | 保留 Homebrew 动态库/发行入口的未验证部分；开发环境切对 Node 不能证明所有安装用户问题已解决 |
| 待本人验收64条/第32批验收缺口 | 工程通过与本人认可分开，且部分真实模型/多事项场景没有确定证据 | 不批量删除、不代签；只合并重复的“验收入口”，保留原编号与负责人 |

BL-1039/1040 可在保留第27批本人验收和墓碑映射后清理工程待办。其余条目没有足够证据整条删除；可立即做的是删除失效子描述、把已完成子项移回证据、合并同一实施路径的剩余工作。新增的 QF-03/04/06/10 本轮未实施，需在下批认领时进入统一 BL，不能把这份报告当成第二套持续更新的任务台账。

## 分批优化策略

1. **本轮三批**：导入队列与准确反馈 → Feed 取消监听释放 → Feed 三组动作绑定迁移。范围小、真实路径明确，不涉及库/公开 API 版本、权限或新依赖。验收以 QEA-05～09 和现有业务回归为准。
2. **下一批用户连续性**：Git 草稿恢复、Home 任务完整性、待审项可执行决定、搜索取消、导入“收起/停止”的明确语义；先写各自输入/结果/恢复合同，再走正常入口。用户少重写、少点无效按钮、少把正在工作的任务看成消失。不同 owner 分片串行整合。
3. **下一批性能与平台采用**：优先 Inbox 主线程阻塞与目录读取代次（关联 BL-943），再做 composer 材料、设置首个真实消费者、Memory/来源声明迁移。先量一次真实操作的调用/开库/阻塞，再定缓存失效；不以删除权限检查换速度。
4. **最后退役**：迁移消费者且证明包外合同后，删除旧 factory、旧 Home events 和未用草稿工具；不要先删再给调用方加兼容兜底。大状态/存储/核心改造保留版本、连续升级与 CI Full。

## 从一次操作追到事实与反馈

| 正常入口 | 合同/编排 | 最终 owner 与写入 | 页面/开发者如何确认 |
| --- | --- | --- | --- |
| 侧栏导入 | workbench import → artifacts HTTP → importDocument | artifacts 固定版本/原件与既有去重 | 当前文件结果行、失败原因、未处理队列；测试直接读真实成果记录 |
| Feed 选消息入箱/规则 | Feed 公开动作 → Kernel schema/authority → Feed/attention | 原消息归 Feed，入箱状态归 attention；事务/版本检查 | 原条目状态与 Inbox 可见结果；已有入箱/重开/取消用例 |
| Agent 提案→用户决定 | agent-host review queue → 原授权 → Prologue answer | 决定/一次性消费归 review owner，实际执行账本归 runtime | 回执区分失败与未知；call_id 连 invocation 与父调用；不能把投递超时当没执行 |
| 后台排期 | 插件声明 → scheduler claim/lease → 公开动作 | 排期业务记录归插件，租约/唤醒记录归 scheduler | mainline/tasks 读取 owner 的实际状态和命令；Home 完整性缺口见 QF-04 |
| 跨项目复制 | placement 预览/确认 → 持久身份计划 → 各 owner prepare/apply | 各 owner 只写自己的事实，最后发布项目 | 稳定 operation 回执；失败保留未完成副本，同一身份接续 |

所有结论都以本基线为准。真实模型、外部账号、线上云同步、用户真实 Home 和本人认可没有在本轮被代替验证。

## 验证记录

- 基线：`efdaa3376`；离线安装和完整构建通过。初次默认 Node 24.14.0 下，新增测试及原有成果浏览器测试均在 Goals 初始化报错；后续统一使用仓库锁定的24.15.0，不把版本不符当作确认的产品缺陷。最后一次构建包含英文按钮、公共绑定本地名称与全失败队列顺序修正。
- 浏览器使用独立 headless-shell，通过公共 test-kit 建临时资料目录与隔离 Home；未使用日常 Chrome，未修改真实4207 Home。外部模型用本地 stand-in，未据此判断真实模型质量。
- 工作台/Feed README 必跑共58文件：首轮56通过，476/479项通过。项目目录快速切换在候选与同提交干净基线均出现2～3次 brief读取而非预期1次，保留失败；测试的输入时序原因尚未证明。两项 Jelly 返回测试在干净基线定向通过、候选完整12项复跑通过，根因未确认。
- 第三批后的13文件复验：12通过，Feed界面3项超时；当时有基线冷构建重叠，日志包含CDP超时及事件循环无空闲。停止本轮其他重活后，Feed完整4项在原断言/超时下通过。没有修改超时、断言、隔离名单或产品子集清单。
- 直接消费者补验13文件/200项全部通过：导入3、Feed界面4、Feed Runtime62、同步授权22、查询消费者7、Inbox场景4、准备页20、调用记录22、翻译与资源56。工作树累计74个文件的最新结果为73通过、1个上述主干同样失败的文件；按运行器汇总699/700项，不把重复运行相加。
- `affected-tests --full` 给出140个候选文件，含按工作台目录选中的大量静态/界面用例；本地已跑包必跑、改动用例及直接动作消费者。未在本机跑Full，余下覆盖及阶段Full按仓库规则进入CI；用户于2026-11-15已授权推送/草稿PR/CI Full。CI Verify通过，Full的失败与定位见下方CI补验记录。
- 包边界检查通过：73包、4,189源文件、22,474个import。健康门禁通过，处理器输入断言从248减为245；无API、schema、动作声明或新依赖变化。最终健康复核通过；随后只将公共绑定导入为原本地名称bind，以保留所有者静态检查可识别的真实调用位置，重新整体构建、边界检查及三个动作文件36项均通过，未改门禁。整批失败阻塞的补充场景已先失败复现、修复后重跑导入3项与i18n9项通过；最终健康与边界再次通过。
- 静态资源最终比较通过：65路径、无遗漏，只有资料导入脚本+166 B。基线已由正式门禁隔离冷构建并实际测量；最终候选复用同一基线测量，仍调用原测量器和策略比较，不使用虚构尺寸或修改门禁。首屏比较另发现中英文词包内容地址更新，已于2026-11-15获用户批准；批准增量见spec与任务独立许可。最终首屏实际字节为到达/选择页冷加载中英文+48/+57 B，工作台冷加载+235/+261 B、热加载+21/+38 B，两项内容地址批准已记录；用最终真实样本重跑现行首屏策略，错误为0。CI #8009已重新构建测量并通过首屏预算。
- 首屏浏览器五页面×中英文×冷/热共20次采样完成。`audit.json` 仍列动态locale请求、attention事件等未登记GET，采样成功不等于清单完整；账号/同步接口的400发生于明确不含安装登录与账号切换的测量宿主（`scripts/visual/selected-home-server.mjs:1-3`），未据此声称真实账号流程有回归。清单与实际请求的核对作为后续测量覆盖事项，不在本任务削减清单或改门禁。

| 验收 | 结果与证据 |
| --- | --- |
| QEA-01 | 通过代表入口静态检查：73包、六方向，范围/未验证项见coverage；不等于全仓逐行审计。 |
| QEA-02 | 通过：10项问题/风险各有位置、影响、owner、处置；12项平台化判断区分应补、应采用与保持现有方案。 |
| QEA-03 | 本轮三批定向与隔离实操通过；整体阶段验收仍待CI Full及基线失败判定，不宣称已结束。 |
| QEA-04 | 通过：53份活跃spec状态/范围分组判断及BL清理表；未代签本人验收、未批量删账。 |
| QEA-05 | 通过：201份真实文本文件分200+1导入，逐份核对title、正文和唯一成果id；第二批无须重选；200份超限文件整批失败后，下次点击仍保存后面的正常文件及准确正文，已先复现阻塞再验修复。 |
| QEA-06 | 通过：处理中追加、切换类型、关闭/重开、部分失败重试；已成功项不重复写，结果行对准文件。中英文1440/1024/390、浅深色均无横向溢出；截图复核含英文动作按钮。关闭不等于取消，剩余见QF-10。 |
| QEA-07 | 通过：真实拖入401文件的目录，依赖目录不进入选择，下一批显示200且总选择完整。 |
| QEA-08 | 通过：生产等待器连续12轮唤醒、预先/合并通知、取消均清理监听；原后台失败恢复、停止/重启用例也通过。 |
| QEA-09 | 通过：查询、入箱和规则迁移后的真实Runtime、权限拒绝、撤权、实际保存/重开、来源可用性与界面消费；有独立业务职责的包装未删除。 |

可复核位置：`tests/knowledge-import-queue.e2e.test.ts`、`tests/feed-content-ledger.test.ts`、Feed动作/Runtime/授权及Inbox消费用例；截图位于已忽略的 `.impeccable/qa/review/quality-experience-audit/`。终端日志位于 `/tmp/molis-quality-*.log`，不作为持久事实源；报告保留实际结果与复现入口。没有真实模型、线上同步、安装升级、系统WebKit或本人认可的本轮证据，不签整个平台内部完整/可发布。

### CI补验（2026-11-15）

提交 `a7f6122c8` 的 [CI Verify #8009](https://github.com/molis-ai/molis-work/actions/runs/43823056147) 全部通过，包含Linux实际首屏预算。[Full #1024](https://github.com/molis-ai/molis-work/actions/runs/43823067427) 第22片在 `geometry-boundaries.e2e.test.ts` 的 dark@2x 图标聚焦检查失败：右侧图标移动1px；首次及单独复跑各自自动重试后均失败，其余47片被取消。未放宽断言或登记隔离，Full未通过。

本机 Chrome .38 与对齐CI的 .50 各自原样通过该测试（783个控件状态）；另在真实页面用Linux平台标识、深色2倍和1440/1366/1280/1024/1441宽度记录8个侧栏标签，未复现。`side-panel.ts:405-415` 的展开/滚动补偿为第32批现有实现，本轮尚未修改；只有调用链线索，不能据此断定根因或声称已在基线CI复现。下一步保留测试规则，增强失败时精确位置和滚动数据，取得Linux证据后决定最小修复。
