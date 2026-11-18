# Molis Work 审查报告与优化策略

整项进行中，负责人 Codex。第 118 批 `cea504b68d` 已在主干 `6c88cba611` 上通过 Verify，第 119 批补上 Full 发现的长回复停顿。登记范围覆盖候选中的 75 个包、84 个 contracts 子路径及根入口，另复核本轮从主干移除的 WebQuery 包。报告有 97 项编号发现和 16 项平台候选，列明处置和实测结果。[逐包覆盖](coverage.md) · [六方向结论](#六个方向的独立结论) · [平台候选及处置](#平台化与通用化检查及处置) · [需求实现度](#需求整体实现度) · [BL 清理与保留事项](#bl-与事项清理建议) · [验收编号](spec.md)

第 53–55 批 8 文件 78 项定向通过。第 56–59 批 8 文件 144 项及长材料 2 项通过，验证改写、回放、起草、引导、信息方案和真实采用。固定 `4c54241e96` 的受影响包级复验 55/55 文件、463/463 项通过。第 60 批 Git、Coding 与工作台 77 文件、521 项通过，含真实提交、拒绝、暂存和编辑恢复。第 62 批 Placement 与工作台 22 文件、194 项通过。第 52 批冻结头的 104/105 个包回归文件通过，唯一失败定位到 Feed 已失效的发布版本例外。

第 63–65 批签名插件相关的 11 文件、123 项均有通过证据。另有真实 Home 更新签名包、Inbox 更新建议和 Home 提供事项 3 个浏览器用例通过。这一检查点的 66 条静态资源的原始与压缩字节和第 62 批逐条相同。包边界和健康通过，准确组合 CI 待结算。

冻结 `630481472a` 的完整安全批次结束，447 次调度中 442 次通过，覆盖 444 个不同文件。五个失败文件之中三个需调整测试入口，两个暴露已确认的生产回执退化。五个文件均在更新的安装回归中复验通过。第 66–67 批的 18 个安装及界面回归文件共 164 项均有通过证据。公开合同批次 68 文件、970 项通过，公开 API、动作、43 个库的结构及生成版本均匹配源码。

第 82 批已按用户批准登记实际首屏和资源、清除 Feed 的失效版本例外。组合提交 `03ed575a31` 的常规 Verify 已通过。第 87 批按获准合同实施并本地验收导入警告。第 88 批修复第三轮 Full 中复现的 Goal 建议折叠，原 Pages 到 Goals 的正常入口主用例 3/3 通过。两批组合的实际资源已对照正式政策核准，组合 Verify 与 Full 沿草稿继续。[第 87 批验收](#第-87-批获准的导入警告合同) · [草稿 PR #2101](https://github.com/molis-ai/molis-work/pull/2101)

第 74 批的已测组合相对 `dbcf562a67` 涉及 499 个文件，包含源码、测试、公开合同快照和验收文档。本地签名安装生命周期补验见 `613991fcd1` 和 `f77365233c`。第 68–71 批复核双 Goal 窗格预算、修复分栏覆盖层与灵光历史，并沿恢复后的 Goal 工作区走视觉对照。第 72–73 批修复签名换版的项目同意呈现和同意清理，正常路径 8 文件 73 项及工作台、Runtime 包要求 64 文件 917 项通过。第 74 批修复 Inbox 已处理事项的建议读取，9 文件 71 项通过。

第 75 批的整合提交 `45246676e6` 相对新 main 涉及 502 个文件。第 76 批的生产代码候选 `a39c573cf5` 拦下已过期事项转换。第 77 批补齐真实冲突交错和签名浏览器验收，该组合相对新 main 涉及 506 个文件。第 78 批在隔离 Home 复现 Inbox 前台操作期间发出多次后台 Goal 集合读取。第 75–79 批的验证与资源数据见末节。

本地生产构建 `4776b778c1` 相对 `6b0e8a4f83` 涉及 506 个文件，包含源码、测试、生成合同及文档。登记后本轮组合涉及 508 个文件。第 79 批通过 10 文件 44 项。第 80 批合并头 `ed5416f420` 的浏览器 15 文件 48 项通过；其余定向 14 文件 211/212 项，唯一失败已在第 82 批补过。第 81 批组合构建、健康、边界、API、动作、44 个库结构、生成版本和密钥检查通过，停止及浮窗 7 文件 28 项通过。

正式本地审查树的 `c32594095a` 再跑冻结批次发现的五个失败文件和跨项目签名 UI，6 文件 44 项全部通过。完整构建、健康、包边界和密钥检查通过。日志 `quality-audit-final-candidate-{signed,health,boundaries,secrets}.log`。这是针对当前已实施路径的本地验收，组合 Full CI 随资源及推送许可继续。

## 逐批检查点

以下保留各批当时的状态和证据。当前判定以上文、各发现最后一次验证和原验收编号为准。

第52批已修复 Skill 采用失败却更改正式版本。最新构建4及两文件8项定向回归通过，原地重试的浏览器验收、真实案例转移、普通签名安装和 Home 恢复已有构建3的六文件85项通过证据。独立停用保留原安装和草稿，迟到撤销不能影响后来版本。包要求、当前头资源与最终 CI 继续。详见文末 QF-58。

第51批已整合 main `dbcf562a67` 的恢复能力，当前在最终本地验收：新认可保持两库一次原子提交，既存提交意向继续幂等恢复；Skill保留本轮输入/并发修复，同时接入主干7天找回与可信trial来源。合并已保存为 `67433d5851`；最终构建、补强恢复及动作合同2文件31项通过，受影响包62文件907项通过（10.3分钟），公开API拆分零变化，只读复核无新增生产Blocker/P1。准确main基线的健康门禁通过，错误表仍按精确路径归原skills主人，尚未推送本次提交，最终资源/CI及剩余原任务继续。

第50批本地验收通过：后台Goal只读集合，正文按实际可见性读取；分别确认已应用的平台游标，在途新变化和强制保存刷新不会丢失。57个相关包文件607项、实际UI20项、构建4/健康及最终五样本路径通过，详见文末QF-51追加。固定规则20条建议较空闲样本p50为5.4秒，末次有其他工作树并发测试时9.1秒，保留波动，不宣称已稳定达到响应目标。最新main dbcf562a67已拉取，下一批整合79文件交集；最终资源/CI、其他平台候选与整项目标仍未完成。

第49批本地验收完成：Settings统一维护缓存页地址与实际释放，Kit同步消费一次性草稿链接；暂时隐藏保留未存输入和在途读取，实际替换前保存，保存失败继续显示原输入，迟到的旧地址读取不覆盖新内容。组合27文件215项通过，最终完整构建/API零差异/健康通过，只读窄复核无剩余Blocker/P1。详见QF-56。Home回执链接、QF-51性能、平台候选及最终资源/CI仍未结算。

第48批已收回Sessions的非必要浏览器代码：`apps/workbench/src/sessions/ui.ts:24` 用现行合同生成搜索框maxlength，`browser/sessions/client.ts:2` 回到类型导入。正式Host脚本67,374→49,185 B，减少18,189 B；相比同一main只增2,020 B。用户少下载/执行一份服务动作初始化，浏览器不再为一个静态输入约束承担服务声明装配；搜索、分页、取消、权限与提示规则保留。构建/健康、5文件50项通过，含14项真实Chrome路径；资源总策略与首屏仍须最终头验收。日志 `quality-audit-sessions-size-assets.json`、`quality-audit-sessions-size-acceptance.log`、`quality-audit-sessions-size-boundary.log`；前一测试命令含一个误写的不存在文件，未计成功。

固定b63f404345的86文件包要求完整结算85通过/1失败（版本文件）。第47批已在受影响定向验证中消除其中的新基线声明错误，剩余Feed退役例外待批准。此证据不等于最终头全部通过；原任务仍有QF-51后台刷新、设置深链/输入保护、平台候选和最终CI等未完成项。

第47批定向结果：第43批的派生结构对象被版本门禁误当第二份库声明，这是本轮引入的表达问题，已修正。`apps/local-host/src/home-plugin-store.ts:19` 只传现行基线和当次绑定事实；`packages/storage/src/sqlite-baseline.ts:140,218` 统一组合空间元数据，按比较模式和绑定形式复用成功结构比较。版本/归属继续逐次读取，未改库版本或门禁。QEA-108 先在旧实现取得缺少拒绝的反证；修复后10文件154项通过，包括实际Home缺绑定行、WAL额外表、损坏恢复和升级回滚。第11个版本文件34/35通过，剩余仅旧Feed例外待批准，不能记全绿。完整构建/API零差异/健康通过，只读复核无新增Blocker/P1；固定头86文件回归继续。日志 `quality-audit-space-shape-acceptance.log`、`quality-audit-space-shape-health.log`。

资源检查点 b63f404345：正式门禁以main 4cf1c742e6隔离构建实测，Sessions脚本+20,209 B；首屏最大冷增6,021 B、热增3,694 B，已超过早期批准额度，两项检查均未通过。只读消除实验已证明约20 KB来自客户端仅为长度常量引入的服务动作初始化，第48批先收回这部分成本，再按最终下发量审阅许可。日志 `/tmp/quality-audit-b63-page-assets.log`、`/tmp/quality-audit-b63-first-screen.log`；尚未新增资源批准或宣称最终验收。原六方向、平台化候选、QF-51端到端性能与准确头Full CI保持进行中。

第46批本地结算：同Home草稿跨项目采用、并发模型尾写、案例与回放的事务、授权等待后的可写状态/数量均有真实反证及修复。完整构建、API生成（一个conflict错误码）、健康门禁和组合16文件189项通过；新增测试已纳入Git索引后再验门禁。当前75包/84个contracts子路径范围保持，QF-51性能、平台化后续、待批事项和准确头Full CI仍未完成，不把第45/46批当作整项结束。

第45批已在最新主干交集发现并修复 Skill 草稿输入丢失、回放事实过期和重复确认问题。main `4cf1c742e6` 经 `3f9fc4c6b4` 合入；75包、84个contracts子路径（另加根入口），全部已有成果保留。完整构建、10文件83项定向验收通过，包括6项新增真实浏览器恢复及原创建/回放/采用/版本恢复/通用包定制。采用等待中同草稿修订的独立风险还在核实，整项、最终准确头Full CI和资源验收均未完成。详见 QF-52，不能把此检查点当作原任务完成。

第41批本地结算：`apps/local-host/src/home-dock-http.ts:14` 删除两个无生产调用的Events POST转发，`web-request.ts:87` 删除其专用只读放行。公开 `home.events.read/open@1`、原事件聚合和MCP保留。旧地址带正常控制头仍404，插件reader和写入均未触发；未知插件完成后撤回、故障隐私、实际regrant撤权/恢复/停用与正式MCP独立授权通过。3个原测试通过公开Host客户端读取同一事实，不新导出内部权限适配器；HTTP session/目录捕获仍由现行HTTP消费者安全套件覆盖，不把此读取称Events HTTP验证。构建、健康和8文件50项通过（`/tmp/quality-audit-events-retirement-acceptance.log`）；BL-home-events-endpoint-unused已本地落地，待最终头CI后清理。用户路径未新增步骤，Host少维护两个无调用入口和专用方法分类。

当前包表已按登记逐项对齐75包，83个contracts子路径另加根入口；补列Sessions、automation-recommender、project-approvals并移除已退役WebQuery工厂包，相关深入结论仍见各批。另核SQLite行复制候选：Node24.15.0下原对象复用与复制在交替样本无稳定差异（`/tmp/quality-audit-sqlite-row-bench.log`），未改生产实现，不用微基准代替真实体验或新增通用优化层。

第44批本地结算：`packages/kernel/src/action-execution-context.ts:82` 单目标的反复复核继续逐条匹配，遇第二个不同目标才建原轮内索引；名单可变，不缓存首答。QEA-98经公开同步动作旧版遍历100个无关项、新版0，provider/版本/移除/恢复与原实时授权均验。完整构建、健康、12文件92项通过（`/tmp/quality-audit-allowed-list-acceptance.log`），只读复核无新增Blocker/P1。真实20条采样 allowedAction 自身3.143→0.972秒，但五样本总耗时p50=14127ms，未证端到端改善；QF-51和性能BL继续。用户等待问题尚未宣称解决，代码只减少不必要的全名单索引构建，没有承担第二份授权状态。

第 45 批检查点（2026-11-17）：已整合 main `4cf1c742e6`，75 包、84 个 contracts 子路径。合并 `3f9fc4c6b4` 保留此前成果。第 41–44 批已有本地定向验收，第 45 批加入 Skill 草稿、回放与采用交集。QF-51 的端到端性能仍待稳定复验。

第42批 / QF-51 后续：正常网络探针证明8次 Goal 刷新均来自顶层工作台（`/tmp/quality-audit-inbox-refresh-probe.log`）。`web-goals-read.ts:153` 的片段读取经 `web-request.ts:202` 重读所有显示插件舞台并渲染 Home 内容，放大 Inbox 批次成本。QEA-94 在旧构建真实 HTTP 入口失败：无关 Schedule reader 被调用一次（`/tmp/quality-audit-goal-stage-baseline.log`）。现按声明路由匹配 owner 准备舞台，保留目标正文/关系/策略/成果与创建输入所需目录；移除无生产消费者的 Inbox 摘要转发和 StagePageContext.client_data。完整构建通过、API 快照仅删除该可选字段，定向验收进行中，不预报性能通过。

第42批本地结算：上述13文件最终均有通过证据、共161项；无关 Schedule 读取从1变0，真实未知 Home 插件的“新建输入”入口保留，成果归档和输入确认后刷新正确，Feed 菜单/Goal迟到响应/原保存交错通过。二文件补验24+14项见 `/tmp/quality-audit-goal-stage-final.log`。会话滚轮测试先观察 follower 的真实落底再测量向上滚动，未修改产品滚动语义或放宽原断言。五次20条判断p50从22595ms降至10768ms，health在3–4/20条返回（`/tmp/quality-audit-goal-stage-performance.log`）；等待仍偏长，QF-51及性能BL保留。构建/API/健康/只读复核通过；离线Skill回放和替身3简报通过，真实模型因隔离Home无可用模型未运行。后续第43批复用Storage现有结构校验机制，版本/归属/授权事实继续逐次读取；整项、最终CI与资源验收均未完成。

第43批本地结算：`packages/storage/src/sqlite-baseline.ts:214` 提取现行成功结构比较，`apps/local-host/src/home-plugin-store.ts:22` 复用 exact 模式；原 Inspector 保留允许额外表及声明触发器的检查。暖读反证旧版132≠66，新版不再增加结构扫描，8次读取仍分别检查版本并关闭连接；WAL暖读后主文件字节不变但结构变化拒绝，两种比较模式互不冒充，损坏/外来归属/恢复均通过。完整构建/API/健康和14文件149项通过，日志 `/tmp/quality-audit-home-schema-acceptance.log`。未改变存储版本、授权事实或只读事务寿命。总耗时p50=11721ms，未证明优于上一批，故保留QF-51；当前CPU采样聚合显示允许动作名单匹配自身约3.14秒、SQLite行转换与get合计约2.23秒，Home开库自身约0.15秒。继续沿真实许可名单来源和当前读取核根因，不把查询数减少当作体验已达标。采样 `/tmp/quality-audit-schema-cpu/CPU.20261117.055750.75612.0.001.cpuprofile`，临时测试已清理。

主干登录交集首轮历史：9文件中8文件104项通过，子任务会话文件12/14项通过但滚轮位置验证失败（`/tmp/quality-audit-login-merge-acceptance.log`）；该观察时序问题已在第42批修正并补验14/14通过，见上文，首轮记录保留。第42批首个定向命令误用默认并发，已按本次PID终止，仅成果输入4项有效通过，其余未完成；改用公共机器槽和 `--jobs 1` 后重新执行，日志 `/tmp/quality-audit-goal-stage-acceptance-serial.log`。

最新交集记录（2026-11-17）：第39批两个新服务已沿真实生产路径核对。建议由项目到达、Assistant、创作台读取目录和 Workspace，偏好归 recommender，文稿由 Pages 按固定 request_id 保存；临时报告绑定 actor/project/incarnation 并有期限。审批经 Web/CLI/管理 MCP 和 Kernel 单次可信凭据进入原业务 owner，平台规则与决定归 project-approvals。等待后的权限与安装复核有真实边界依据；新包不是无职责转发层。静态结论不替代视觉和运行验收。

**QF-48/P1 已复现并修复，定向通过、最终验收继续：认可与平台审批跨库部分提交。** 基线 `040f161a40` 的 `apps/local-host/src/acceptance-actions.ts:100–118` 在项目库事务里调用 `modules/acceptance/src/store.ts:17–19` 的独立 Acceptance 提交，后者先 COMMIT。QEA-84 从正常 HTTP 决定入口，仅用延迟外键让项目最终 COMMIT 拒绝；返回失败后实际读取 r2.person 仍为 accepted，预期 pending。日志 `/tmp/quality-audit-acceptance-commit-baseline.log`。这违反 Acceptance README 和授权 spec 的同事务承诺，可能使用户看到失败却留下认可，且缺少可信来源账。原 INSERT 阶段的撤权反证没有覆盖此窗口。

QF-48 已实施：保留 Acceptance 原库、表、ID 和动作，用同一 attached 连接单次提交；复用现有成果固定的文件/空间校验、DELETE/EXTRA 和恢复协议，不冒充成果声明。规则和逐项状态仍归 Acceptance，平台决定仍归 project-approvals。必须同时验最终拒绝零写、同键恢复、COMMIT 后回包/清理失败与启动/U1/快照恢复，不能交换两个 COMMIT 顺序或事后删除补偿。

本批结果：完整构建通过，8个定向文件41项全部通过（`/tmp/quality-audit-acceptance-atomic-recovery.log`）。最终 COMMIT 拒绝、提交后清理故障、两个真实 SIGKILL 恢复场景、原 Dataset/Form 消费者及安全反证均已验；认可栏1440/390正常操作与回读通过。只读复核要求补强的重复记录计数和恢复后原 key 重试已通过（两文件5项，`/tmp/quality-audit-acceptance-atomic-retry.log`），未发现新增Blocker/P1。健康门禁退出0，公共API/动作/库快照无变化。用户不再需要猜测失败后的认可是否保存；开发者沿同一事务和原回执追踪结果，少维护一份独立事务提交顺序。共享核心必跑90文件已完成：88通过，版本例外遗留及 Functions 本地读取触发钥匙串两文件失败；后者在同头单独复跑稳定复现（`/tmp/quality-audit-keychain-exact-repro.log`），正在查真实调用链。最终头 CI 尚未完成。

**QF-49/P2 已实施、正常入口实操通过：认可栏文本被省略。** `apps/workbench/src/styles/work-line.ts:291,302` 把要求、理由和历史单行截断，`work-acceptance-parts.ts:52,55` 仅用 title 提供完整文案。390触屏无法悬停，用户可能须进入编辑才能读完认可依据；1440侧栏也复现。已让要求、方法/观察、决定理由与展开历史完整换行，移除以 title 代替正文的表达，沿原栏位与审批流程验证，不新增确认步骤。

主干交集首轮23文件20过/3失败：Run 时间与待核交集10项、真实恢复22项、流33项、业务 gateway80项、安装恢复41项、安装拒绝11项及三个真实审查界面已过。HTTP 旧断言409按主干现行权限拒绝保留403，修正后20项过。Goals 的16份快照反向还原已实施导入批次说明与按钮文案后均与 main 原 hash 相同；保留业务 view，合并重绘后56项过（2个生成模式默认跳过）。Feed AX读取两次出现 notRendered；后续远程对象身份核对捕获真实刷新替换。夹具现仅在原对象已脱离/被替换时重取，当前对象缺名或不可访问仍按原断言失败；全部23项通过，日志 `/tmp/quality-audit-feed-control-lifetime.log`，未改生产或放宽名称断言。提交合并后 health 已按 a717e442 重算，仅发现报告仍链接已归档 BL-360；链接已转现行授权验收，最终健康复验退出0（`/tmp/quality-audit-main-merged-health-final.log`），未改阈值。

状态：进行中，负责人 Codex。原六方向审查、逻辑 Bug、需求实现度、BL 清理和本轮改造验收均保留；不以包清单或局部测试宣称整项完成。2026-11-17 已拉取并整合 main `a717e44284`（#2105），当前登记 **75 包、83 个 contracts 子路径**。完整构建通过，公开 API、动作、存储及版本快照已重算；合并交集23文件均有通过证据（首次失败与修正详见上文），合并检查点为 `040f161a40`。

已有成果保存在原分支：Pages/共享选择 `67288d2e47`、Feed 公开 SourcePull/首次引导恢复 `29f6d1383e`、无关安装声明隔离 `03b3a58f76`，以及此前搜索、后台操作、Sessions、Git 草稿、共享材料、Coding、Memory、Workflows 批次。QF-47 本地定向已过，当前头复验中。固定 `29f6d1383e` 的205文件包回归已结束：202通过，desktop-tui/verify-release-versions因退役 Feed 版本例外失败，editor-control-names因旧控件对象读取失败；日志 `/tmp/quality-audit-feed-onboarding-required.log`。后者已在主干整合批修夹具并通过23项，前两项待已提交的门禁删除审批。旧运行不能记全绿，也不能挪作新头证据。

Git 冲突主区及迟到反馈 QF-23/46 已保存于 `ff006e19f0`，冻结该头的11文件109项全部通过（`/tmp/quality-audit-git-frozen-acceptance.log`）；认可正文 QF-49 保存于 `b82dd631b3`，2文件7项通过。自动采集钥匙串 QF-50 已保存于 `d7d146a2da`，10文件73项有通过证据。仍在本轮：Inbox 阻塞 QF-51 的改造验收、平台候选/后台入口的余下深查、最新主干交集、资源和最终准确提交的 Full CI。QF-15 固定版本警告迁移及 Feed 废弃版本例外删除有具体方案待既有批准请求回复；不阻断其他工作。用户已明确延后的 PF-03 第三个会话记忆消费者条件保留，不报告为已平台化。旧头 `77e2cc0d5` 的 CI 只覆盖旧批次。草稿 [PR #2101](https://github.com/molis-ai/molis-work/pull/2101) · [需求与验收](spec.md) · [逐包覆盖](coverage.md)。

以下按发现保留代码依据与逐批证据；带旧基线的历史记录不表示当前状态。
## 早期批次判断与依据（历史基线）

2026-11-16 已整合基线：`4a08c41ca`（Sessions #2097）已整合到工作树，74包构建通过，合并提交 fc4e39e38 已保留，后续 Git 批保存于 84987a6c3 与 8ac8b806e。新增 `horizontal/sessions` 及其 UI/搜索/助理链纳入接续范围，不能继续沿用 73 包作为最新主干总数。BL-177 在该主干已改“部分实现”，保留 35/45/60 批和本人验收，不按新实现标题关闭整项。前批改造保存于 `a31a745e6`。现已保存共享输入材料检查点 `ba93f5c0b5`，并合入 `6359987103`（Sessions 合后复查 #2106 与公共子任务部件 #2108），合并提交 `31b0cba134`。两边新增的权限/会话回归均保留，公共 composer 的 ready/local placement 与本批来源/ack合同同时保留；API快照已重新生成，完整构建通过，组合验收19文件183项全部通过（13.9分钟，`/tmp/quality-audit-main-635-acceptance.log`）。新增重试用例第一次排队被主动撤下，未运行；后续已在这次组合验收实际执行通过。随后健康门禁发现 pageComposer 153行，已把独立的提交结果转换移到同文件函数，不改阈值，复验通过。QF-30 真实断连基线复现接受/拒绝晚写，最小信号修复与相关8文件96项验收通过，保存于56afa9c44e；仍不能据此将本轮全部六方向结项。QF-31读取故障、分区失败与原位重试已通过真实界面及写入读回；QF-32候选读写分离和QF-31旧入口清理也已完成本地验收，细节见各项记录。

第九批视觉补验已通过，12 张中英文/三宽/两主题截图生成，人工复核英文390深色与中文1440浅色，Git 固定差异已加载。第十/十一批14文件126项通过，第十二批11文件65项通过，具体边界见下文。英文导入中的旧中文警告另列 QF-15，未宣称语言全通过。

平台已有统一动作、授权、事务、插件装配和对象链接能力。当前重点是核实实际消费与恢复路径，而不是继续增加抽象。旧报告中有多项建议会破坏已有语义：把表单关闭设成终态会取消重新开始收集；删掉搜索的第二次目录读取会撤掉异步等待后的权限复核；审批投递失败自动重试可能重复执行已经接受的批准。

构建通过只支持工程判断，尚不能宣称整个平台内部完整。退役WebQuery后的检查点曾有73个包；整合第39批两个新服务后当前为75包；初始审查基线的统一 BL 有 527 条，其中 64 条为待本人验收、202 条明确后续做，不能直接当作死账删除。需求族判断与逐项清理决定见下文；不按条数计算完成率。

前四批成果保留；第五至十二批已落实搜索取消、Home 列表完整性、停止/切项目交错、Run 终态、三个审查 UI、导入停止/断连、五插件纯绑定迁移和正文可用性反馈，相关定向验证通过。尚未取得本次最终提交的 CI 证据，不能与旧头 CI 混算；原代表检查也不能冒称全部真实入口均已查深。Sessions 增量已补定向验收，框架材料来源、Git 冲突版式及其余未查深入口仍在原任务内按优先级推进，不以改动文件数或局部通过结项。

## 发现与处置（是否实施逐项注明）

第十二批验收：`/tmp/quality-audit-transcription-acceptance.log` 11 文件65项全部通过（10.3分钟），涵盖三个原生结果失败/恢复实操、实际原件下载、固定版本、模型同意、HTTP取消、MCP/公开动作和真实插件成果消费。API生成无新增差异，动作输出快照仅两个 import 行变化，包边界检查零错误。去掉 warnings 必填数组的两处可选链是此构建后的等价合同清理，随主干整合重新构建；最终门禁/CI仍待完成。原中文警告 QF-15 保留未解决，不用功能回归替代语言验收。

最新定向验收（第十/十一批构建）：`/tmp/quality-audit-import-binding-acceptance.log` 的 14 个文件、126 项全部通过（16.9 分钟）。其中导入队列 8 项、HTTP 断连/流上限 6 项、正常 Git 审查与 12 幅视觉采样 1 项，五个插件动作及知识/模型授权/流式生命周期回归均过。第十二批新增 `text_available` 及新断言是在该构建之后修改，须另行构建验收。构建首次发现 control 缺必填 beforeEffect，已按 signal 边界修正后重建通过；没有改公开 control 合同或加空检查来绕过类型要求。

### QF-01 / P1：资料批量导入丢失尚未处理的选择，并让重试结果错位

- 基线位置：`apps/workbench/src/browser/knowledge/import.ts:179,203-204`；`take:151-155`；目录遍历 `:24`。
- 正常链：侧栏资料 → 导入对话框 → `bindKnowledgeImport` → `/api/artifacts/import` → 成果服务保存固定版本 → 每个文件的结果行。待处理选择归工作台客户端；业务结果归成果服务。
- 触发：选择 201 份时只处理前 200 份，完成后 `picked = queue.filter(...)` 覆盖全部选择；处理中追加文件会重画结果行，持有旧行引用的异步循环继续更新已移走的节点；失败重试没有先按新队列重画，沿用旧行号。目录拖入超过 400 份时还会静默截断。
- 影响：用户重选遗漏文件、重复导入已成功项，不能信任失败标记；等待中的文件状态由数组和 DOM 类共同决定，难以追踪。
- 决定：客户端只移除明确成功的条目，处理队列与当前结果行一一对应；追加只进入下一批，尚未处理条目优先于本批失败项，避免200份全失败挡住后续；重试前重画，显示本批尚待导入数量；目录遍历先排除隐藏/依赖目录，保留其余选择。维持每批 200 份和服务端既有幂等规则。不增加平台队列或存储。评审补正：选择层不以显示文件名去重，防止同名不同正文被丢掉；重复内容是否复用仍由成果服务决定。
- 成本与验证：低，限客户端与词条。`QEA-05/06/07` 在隔离 Home 通过真实文件选择/拖入、真实 HTTP 写入和成果记录验收。基线 `QEA-06` 已复现追加使结果行失效；`QEA-07` 已复现超过 400 不可达。首轮 201 份实导超过新测试的 90 秒等待预算，只算等待不足，未冒称其失败已直接证明丢尾。

### QF-02 / P2：Feed 常驻连接监听每次唤醒遗留取消监听器

- 位置：`plugins/native/feed/src/runtime-reconcile.ts:21-30`，消费者 `keepFeedReconcile:112`。
- 触发：每轮 `next(signal)` 注册新的 `abort` 回调，正常 `changed()` 唤醒后不移除；同一个后台 job 的 signal 可活到插件停用。
- 证据：调用生产构建的 `createConnectionWatch`，连续 12 次 `next → changed → await` 后 `getEventListeners(signal, "abort").length === 12`。
- 影响：长期运行随账号连接变化累积闭包，停用时重复唤醒早已完成的等待。属于明确的资源生命周期缺陷，不需给业务另造状态机。
- 决定：正常唤醒和取消共用同一个清理出口；保留忙时通知合并与取消结束等待的语义。归 Feed 自有后台监听，不新增共享层。已修改，QEA-08 与原 FI-C-07 等 10 条定向测试通过。

### QF-03 / P2：Git 的草稿工具与实际编辑入口脱节

- 位置：`plugins/native/git/src/drafts.ts:52-108` 仅由本包导出与 `tests/git-plugin.test.ts:70-79` 使用；实际页面 `plugins/native/git/src/browser/source.ts:28-38,100-101` 只读取 Coding 交来的提交说明，`plugins/native/git/src/browser/conflicts.ts:70-86` 每次打开冲突直接用文件正文替换编辑区。
- 影响：用户自己输入的提交说明、分支/PR 表单与冲突解决文本没有共同的恢复路径；尤其再打开同一冲突文件会覆盖尚未提交的编辑。现有草稿 round-trip 单测不证明页面保留输入。这里指整页重载/重新挂载及重新打开冲突文件；同一页面内刷新 summary、隐藏再恢复 PR 表单已由 `tests/git-source-controls.e2e.test.ts:152-249` 覆盖保留，不能一概说“刷新就丢稿”。本轮已补真实 Git 与 Coding 内嵌浏览器复现：四项均有效失败，说明重载后为空、长冲突文本切文件后被原文覆盖；日志 `/tmp/quality-audit-sessions-recheck-git-baseline.log`。`parseStoredDrafts` 还截短字段为 4096，但没有实际页面调用，不能把它冒称为当前入口的数据截断事故。
- 决定：第十四批已接入 `browser/editing.ts` / `form-drafts.ts` / `draft-operations.ts` 的真实编辑路径，使用 `host.drafts`；Coding 经 `offerCommitDraft` 明确交接且不回退错误目录。正常编辑及恢复12项、原客户端生命周期14项、源码控制1项、Host操作19项、打包2项以及真实 Coding SDK/人审/模型交接1项已通过；最终头CI与资源许可仍待完成。状态归 Git 编辑器，以项目/工作目录/文件与读取修订定位；复用现有页面草稿机制前确认冲突正文大小与隐私边界。先接正常页面、切换/刷新/冲突改版实操，再删被替代的工具和镜像单测。核对 Git private 包、contracts/SDK 外部边界、全仓引用与 Home 清单后，已删除只被镜像单测调用的旧 drafts.ts/出口/format 标记，不留截短或坏值转空的替代分支。成本中。

### QF-04 / P2：Home 后台汇总把读取失败显示为空任务

- 位置：`apps/local-host/src/home-background-tasks.ts:23-36` 丢弃聚合的 `issues`，只写诊断；`apps/local-host/src/attention-http.ts:46-51` 将数组传到 Home；`apps/workbench/src/scripts/client/attention.ts:43,95-96` 收到 `[]` 就画「现在没有后台任务」。
- 触发与影响：所有已安装来源超时或报错时，用户看到“没有任务”；部分来源失败时总数也无不完整标记。与查询整体失败时返回 null、保留上次显示的策略不同。这会让仍在执行的任务看起来消失。
- 决定：补齐 Home 汇总结果合同，保留 `tasks + issues`，复用项目后台表已有的 `MainlineIssue` 语义（`horizontal/mainline/src/index.ts:116-127`），由工作台显示一次“部分任务暂时读不到”和重试入口。来源负责事实，汇总负责完整性，页面不推断任务结束。不加弹窗、不把诊断原文直接曝光。成本中，第六批已实施合同与 HTTP/UI 迁移；全失败、部分成功与恢复的定向验收通过，最终门禁/CI 待完成。未安装来源跳过，已安装但不可用仍报告问题；不把所有停用来源一律忽略。

接续真实入口补查（第六批，2026-11-16）：`apps/workbench/src/arrival/chooser.ts:137` 将 attention 绑到选中项目，旧项目入口没有 Home 后台任务；这使选择项目后的 Home 列表一直拿不到跨项目任务。新 HTTP 聚合测试已通过，但第一轮浏览器在部分恢复等不到任务、停止用例在首屏等不到按钮，属于真实入口接线缺口，不能把它们当成停止交错已复现。正在同批修正 Home 投影范围与变更订阅，保留项目助理上下文；Home 不消费项目事项线，避免重复读选中项目的任务。

复核另发现 `attention.ts` 重画会丢失停止按钮的 DOM disabled 状态；本批以页面持有的命令进行中/结果投影跨重画保留，等待真实 Home 实操。相邻项目入口 `apps/workbench/src/browser/work-task-panel.ts:191` 没有进行中保护，列为下一项真实交错检查；不把项目旧测试当作 Home 的验收证据。chooser 切换时在途 attention 的归属与迟到通知也待核对。

### QF-05 / P2：动作绑定有现成公共实现，局部包装仍重复维护

- 位置：`packages/contracts/src/platform/action-input.ts:8-12` 已提供 `bindActionHandler`；相同换参包装仍在 Dataset `plugins/native/dataset/src/actions.ts:69`、Form `plugins/native/form/src/actions.ts:84`、Todo `plugins/native/todo/src/organize-actions.ts:101`、Cognia `plugins/native/cognia/src/actions.ts:60`、Images `plugins/native/images/src/actions.ts:45`。
- 影响：各插件重复把 Kernel 已验证的 unknown 转为输入类型，后续扩执行元数据容易各自漏接；这些包装没有独立业务职责。
- 决定：直接复用现有公共绑定，不新建平台抽象；逐个迁移调用方，保留 availability。Pages/PPT 的本地包装还固定授权，Workflows 还构建业务上下文，不能用文本替换一刀切。成本低但跨包，本轮第三批已迁移 Feed 的 query-actions、inbox-actions、rule-actions 共三处纯绑定，第十一批已将上述另外五包迁到同一公开绑定，9 个 availability 调用保持，尚待构建/验收；以真实动作入口的拒绝、异步撤权和正常保存回归证明。

### QF-14 / P2（定向验收通过，待最终 CI）：转写失败的回执不足以支持准确完成提示

`apps/local-host/src/artifact-original-text.ts:36-44,62-65` 在原生读取失败/超时时返回空正文和 warning，仍可保存原件；`apps/workbench/src/browser/knowledge/import.ts` 的转写分支只用 `model_required` 是否缺省判断完成，因此可能把“仅保存原件、没有转写文字”累计为转写完成。前者是保留文件的正确业务语义，后者需要明确文本提取结果，不能由页面解析翻译后的 warning 猜测。

处置：第十二批成果 import owner 输出 `text_available`，从实际保存/复用的正文推导，工作台转写消费同一公开类型并保留无正文项重试；保留原件保存与既有取消 fence。原生失败、超时回复及空正文的正常入口旧构建 3/3 有效失败（52.0 秒），失败后原件实际下载正常，错误在重试入口消失。修复完整构建通过，11文件65项正常路径/恢复验收通过。API 生成无新增差异；两个 import 动作输出快照更新（现行阶段一原版本），没有输入、权限或持久结构变化。不增加第二套转写任务表。超时 helper 回复不等于实测平台 30 分钟截止，模型替身也不算真实语音效果验收。

### QF-15 / P2：原件提取提示仍以中文正文跨层保存并显示

位置：`apps/local-host/src/artifact-original-text.ts:18-45,65` 组装中文 warnings，`modules/artifacts/src/artifact-document-import.ts:20-35,128-147` 随固定版本保存，`apps/workbench/src/browser/knowledge/import.ts:100,232` 直接呈现。英文 390px 转写实操截图 `import-stopped-transcription-en-390-dark.png` 已出现“正文是转写出的文字，可能有错字；原件完整保存。”，因此是实际语言混用，不只是字符串扫描命中。

影响是英文界面的提取反馈仍为中文。QF-14 已把完成判断交还 owner 的正文事实。用户于 2026-11-17 批准提示与固定版本合同的调整。本地实现以稳定键和参数保存新导入，旧版本的正文、原警告、时间、摘要和精确引用沿历史记录读取。新旧入口已隔离实操。词包与接续远端验收见第 87 批。

## 最新主干 Sessions 增量：已整合与复现，修复验收中

以下问题位置指 `origin/main=4a08c41ca` 的原实现。主干已整合到本工作区并完成 74 包构建，合并提交待验证收口。QEA-29/31 在旧构建有效复现7项失败，QEA-30/32又复现4项；追加 Droid 查询/范围变化迟到回填2项亦有效失败。修复构建后13文件首轮11文件通过：新增9个界面路径、服务与Host模型派发/缓存复核均通过。非本人 history 摘要的新增测试错把现行 `return_target:null` 当作字段缺席，已按现行合同更正，安全14项复跑通过。正常移动端旧用例暴露 loading 清空返回按钮；另补等待中返回/读取失败2项，在旧构建有效复现，修复已构建待复跑。日志前缀 `/tmp/quality-audit-sessions-`，包括 `scope-baseline`、`navigation-baseline`、`droid-baseline`、`acceptance`、`recheck-git-baseline`、`mobile-baseline`；不把局部通过写成本批全过。

| 发现 | 位置与实际路径 | 影响、归属和处置 |
| --- | --- | --- |
| QF-16 / P1 模型前缺少读取范围复核 | `horizontal/sessions/src/suggest.ts:214,232,308`：读取开头消息后调用模型，只传通用 caller.beforeEffect；`apps/local-host/src/sessions-ports.ts:401-408` 转交此闭包。Sessions 范围只在初始和模型后重读 | 在异步读取期间撤回来源，原文仍可能发给模型。Sessions owner 在实际派发前复核本批材料的当前范围，保留最终提交检查；通用动作权限不能代替业务范围。先卡住真实 adapter 读取验证模型外发为零。 |
| QF-17 / P1 列表未消费分页，旧搜索直达打不开 | `apps/workbench/src/browser/sessions/client.ts:80,107` 只读默认50条，搜索只滤当前数组；缺失 key 再读 all 第一页后静默返回 | 用户无法浏览或找到较早会话。补正常分页与完整检索；按 key 读取详情所需元数据归 Sessions 公开合同，不遍历全部列表冒充直达，不把上限改大当修复。 |
| QF-18 / P1 撤回范围后详情和迟到结果未失效 | 同 `client.ts:88,179`：列表找不到原行时不清正文，范围保存后也不递增 detailSeq；`detail-view.ts:80,89` 只有清空详情才移除助理上下文 | 已撤回原文及上下文继续展示，旧历史响应仍可回填。范围变更须取消/隔离旧读取，再按 owner 当前可读性核对所选项；当前分页没找到不等于撤权。覆盖撤回前后响应交错和仍合法的当前项。 |
| QF-19 / P1 云账号切换后再保存范围会拒绝 | `scope-sheet.ts:102-112` 遍历 owner 保留的同来源多个账号行，却从同一 entry_id 下拉取当前账号；`scope-commands.ts:273-275` 正确拒绝重复完整身份 | A→B 后再次保存或取消来源时两行都变成 B。表单只序列化实际选择的唯一目标，保留 owner 历史账号与重复拒绝，验证连续换账号、再保存、关来源。 |

三个 P2 补查均纳入本轮：范围保存后的额外 discoveryRun 已去除，实际表单验收证明没有额外调用；“开头消息”原取最新100条中的前三条用户消息（`suggest.ts:121`），真实 Claude 文件/Codex 协议两项均复现误取末尾请求，改为适配器从已解析记录选择最早三条；文件流每次注册 abort、正常结束未清监听（`apps/local-host/src/sessions-file-roots.ts:218`），完整读取/消费者取消两项实际复现残留1个，外部取消原已通过，改用 Node 流原生 signal。后两项修复构建及 QEA-36三项、QEA-37两项通过，首轮夹具根目录/空库错误不计作产品复现。日志 `/tmp/quality-audit-sessions-lifecycle-goals-baseline.log`（opening两项）和 `/tmp/quality-audit-file-goals-baseline.log`（文件两项）。

QEA-29～32 的最新界面验收 `/tmp/quality-audit-sessions-browser-final.log`：13/13通过，包括中英文、1440/1024/390、两主题零横向溢出，以及等待中返回/失败后重试。补充 `/tmp/quality-audit-sessions-lifecycle-goals-acceptance.log` 8文件94项通过，golden另有2个生成模式按默认跳过，QEA-36/37与真实HTTP/安全拒绝及Goals画布均通过；外部云/模型质量及本人验收未冒称完成。

### QF-20 / P2：Goals 无选中项时反复发出不合法的画布请求

位置：`plugins/native/goals/src/momentum-client.ts:124` 总拼接 `goal_id=`，经 `apps/local-host/src/project-stage-data.ts:39` 进入 `goals.stage.read`；`plugins/native/goals/src/stage-action.ts:20` 正确要求提供的 id 非空。真实 Sessions 搜索用例打开空项目 Goals 页面时诊断到同一 call_id 的400，随后独立正常空画布复现连续两次400；页面停在失败/重试，重试仍发空参数。修复由 Goals 客户端省略缺席的可选选择，不放宽动作约束或给平台解析加空值兜底。QEA-38正常200及已有布局/失败重试两项通过，原选中项和普通错误重试回归保留。成本低，减少用户无效重试。

### QF-21 / P1：平台草稿较早写入覆盖新编辑或复活已删除内容

位置：`apps/workbench/src/browser/plugin-frame/drafts.ts:38` 的 parent handler 对每条消息并发打开 Cache、put/delete/match；child 同文件 `:6-30` 已登记 pending 并为账号准备等待。真实 Cognia/Todo 的公开 `host.drafts` 调用，暂停最早实际 Cache.put 后，最新正文和删除结果均被旧文本覆盖（QEA-39两项旧构建有效失败，`/tmp/quality-audit-draft-order-baseline.log`）；此前夹具未截获实际 Cache wrapper 的两次失败不作为产品证据。影响所有使用该平台入口的草稿消费者，Git 接入前必须解决。

决定：现有 parent broker 只按同键串行读、写、删，完成释放队列项；保留安装/项目命名空间、写入限额、scope复核和失败回执。一次保存失败不阻止后续调用，不自动重试。合同明确调用顺序及输入时立即交给平台，避免插件私队列让账号准备漏等。成本低；完整构建通过，QEA-39新排序3项及现有插件隔离/账号准备2项、Coding草稿1项、Todo草稿15项全部通过（`/tmp/quality-audit-draft-order-acceptance.log`，4文件21项，7.1分钟），API生成0差异。单个页面的顺序保证不宣称跨页面编辑合并。

### QF-22 / P1：冲突解决后立即中止合并失败

位置：`apps/local-host/src/workspace-git-operations.ts:375-408` 的 `resolveConflict` 先将固定正文写入 blob/临时索引，再写实际文件，但原实现未补索引 stat；Host 报告成功，下一次 `merge-abort` 拒绝 Entry not uptodate。QEA-34 实操发现后，独立 QEA-40 从 owner 的 resolve/abort 入口有效复现，磁盘与暂存 blob 均为已审正文，排除正文不一致（红日志 `/tmp/quality-audit-git-abort-baseline.log`）。用户无法从正常放弃合并入口继续，系统却已报告上一操作成功。

决定：原 Host owner 发布私有索引前调用 `workspace-git.ts:70` 的无路径 `update-index --refresh`，仅匹配 stat，不更改 blob；[Git 官方语义](https://git-scm.com/docs/git-update-index#_using_refresh)。复用原过滤器禁用规则，禁止子模块检查和额外 hook。原锁、HEAD/index/文件身份复核及部分写入未知回执保留。成本低；定向2项通过，包括其他暂存文件/后续修改/缺失文件不变、无无关过滤器执行、原 hook 只执行一次。完整 Git owner 回归19项、真实编辑10项及客户端包2项通过（`/tmp/quality-audit-git-editing-acceptance2.log`）；只读复核无 Blocker/P1。这些是定向工程与隔离 Home 证据，尚非最终头 CI。

### QF-23 / P2：长冲突正文仍被挤在目录栏

位置：`plugins/native/git/src/ui.ts:49-59` 把完整冲突编辑器放在 directory；同文件 `:72-85` 的主结果区域可以承载正文却在编辑冲突时闲置。隔离 Home 的实际桌面截图 `.impeccable/qa/review/quality-audit-git/current-conflict-light-1440.png` 显示手写正文和只读当前文件均挤在窄目录栏，移动截图没有横向越界，但这不能证明长正文核对顺畅。此次草稿恢复已防止丢失，尚未改善这一版式责任。

处置：保留本轮待实施项，优先完成 P1 的 PF-02 材料交付边界后，将冲突内容放回现有 Git result 主区域；复用 `mount.ts` 的 openResult/closeResult，让独立 Git 与 Coding 内嵌使用同一内容，不做第二页面或宿主 Git 特判。需先在真实内容上提供可操作切片，核对列表返回、切文件、diff/历史切换、读取失败、审查后继续编辑和两入口桌面/移动，再判完成。成本中，不能以现有两张无越界截图关闭。

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
| 隐式状态 | 对照持久事实、执行句柄和 DOM。导入队列、Feed 等待、Run 终态、Git/Pages 输入、Skill 草稿/案例/采用、Settings 缓存及 Goals 刷新都追到 owner | 集合与正文各自应用已读游标，安装尝试按现生命周期回退，草稿冲突按实际修订收尾。业务状态声明按原路线兑现，跨进程安装崩溃边界见 QF-58 |
| 过度防御 | 从HTTP/动作schema到写点核校验。查Home/Memory读取故障降为空、Coding环境异常降为ready、Feed重复plan、Goals隐藏正文fallback及项目同意清理的批准明细依赖 | 已实施对应修复。Search等待后的权限、SQLite严格结构、RSS实际网络地址和清理的主体归属校验有真实边界依据。第50批collection失败保留旧结果并由原poll恢复 |
| 用户干扰 | 沿正常导入、停止、重试，Git 独立及 Coding 内嵌，材料交付，Pages，引导，Skill 创作/设置，Goals 后台、分栏及签名插件换版走查 | 实际写入及浏览器已验证减少重选、重写、重开建议及项目重审中的重复操作。Home 助理结果可回到原草稿。资源已核准，组合 CI 和原本人验收待结算 |
| 冗余代码 | 注册与实际调用方逐条核对，区分私有重复、公开合同和未完成能力 | 已退役 Git 旧草稿工具、WebQuery/YouTube 旧工厂、Events 无人调用 HTTP 转发、Feed 重复拉取计划及多插件绑定副本。YouTube 频道工具保留。旧 Feed 版本例外已按原批准删除并复验 |
| 边界与调用链 | 75 包及 84 个 contracts 子路径另加根入口。从 UI/HTTP、Agent、后台、CLI/MCP 沿公开动作追事务和反馈 | 已修 HTTP 取消、共享输入/草稿、模型结果校验和跨库提交断点。main `eaa6b47492` 的审查引用变化已整合，真实路径与静态核对的限制见覆盖记录 |
| 平台化 | 从平台能力下追消费者，从插件、页面和后台特判上查归属，纳入单调用方已属平台的行为 | 下表与 Skill/Goal 交集分别判定现有能力复用、补合同、共用工具和原业务规则。已迁移的能力以真实消费者取证，后续见原 BL |

## 其他已确认问题和设计风险

### QF-06 / P2：显示时间保存影响了执行终态与下一轮准入

`horizontal/agent-host/src/adapters/prologue-run-store.ts:131-133,214-228` 在执行账本已经终结后，仍把公开 phase 暂时设为 running，等待 `saveRunTiming`；`latestEnded` 又依据该公开 phase 判断是否结束。`tests/prologue-recovery.test.ts:449` 已有用延迟提交控制这条路径的测试。因此这是现行设计耦合，不是本轮声称复现的随机卡死：非业务的显示时间写入会延长用户等待；无限等待的极端场景本轮未实测。

处置：中成本，归 agent-host。保留“执行账本提交后才终结”的正确边界，把时间元数据的保存/失败与执行终态分开；不得直接删账本等待。需验证下一轮可启动、重启后的时间未知、迟到完成不改写新 Run、取消与保存失败。第八批已实施，公开 Adapter 四终态 × 时间延迟/失败及真实 Node 恢复等共 7 文件 58 项通过；时间与启动意图在真实 Node 仍共享 index.update 队列，不承诺跳过挂起磁盘事务。最终门禁/CI 未完成。

### QF-07 / P2：当前不能批准的待审项仍有批准按钮

`horizontal/agent-host/src/reviews.ts:193-215,252-278`：当前插件操作的批准仍要求原安装持有授权；`apps/workbench/src/agent-review-surface.ts:136,240` 原来只按 pending 与文档可读提供批准/拒绝。第九批 HTTP 旧构建已复现：原 authority 失效后批准按钮仍在，服务端拒绝。

[BL-360 的现行授权验收](../agent-approval/spec.md) 的重启前提已过时：`prologue-git.ts:98-104`、`prologue-checkpoints.ts:181-189` 和 `prologue-review-documents.ts:297-304` 会撤回失去执行方的原等待。没有当前决定处理器的 raw pending 也不能称“能拒绝”。处置：队列按状态、处理器、原安装授权实时投影 `decisionOptions`，页面只画可执行按钮；保留决定与派发复核，不恢复旧授权。正常 Git 关闭最后依赖入口、重新激活后旧操作只能拒绝的实操已通过（47.5 秒），暂存区与 HEAD 不变；服务/侧栏与真实 SDK 恢复回归通过。原 BL 保留到最终资源、门禁与 CI 验收完成。

### QF-08 / P2：搜索请求取消没有穿过 HTTP 入口

`apps/local-host/src/search-http.ts` 的四条路由及 `web-project-platform-routes.ts` / `web-catalog-routes.ts` 原来都不把断连交给 BoundActionClient。[BL-search-query-abort](../backlog/BL-search-query-abort.md) 的传输缺口成立，但“每次搜索把各来源跑完”需纠正：`horizontal/search/src/index.ts` 的 `catchUp → sync → indexer` 是由 Search owner 维护、供多个查询复用的索引工作，不能随某个查询取消。`docs/horizontal/search.md` 明确没有按查询触发的外部来源协议。

2026-11-16 深查又确认两处同链缺口：`SearchService.open` 切到个人空间时整体替换 access，丢失原信号；对象读取 catch 会将取消降为不可用并继续查存在。`horizontal/search/src/references.ts:ownerRead` 则把取消吞成 null，直接服务调用方无法区分放弃与对象缺失。根因是传输生命周期、共享索引和单请求读取没有被分别保留。

处置：第五批已实施并通过定向验收。Host 采用已有 `responseAbortSignal`；Search 保留个人空间调用的原信号，并让取消越过不可用兜底；共享索引及异步后权限复核保持。修复前的隔离 Home 实操测试已复现 Home/项目 HTTP 断连后 owner 读取继续；直接服务测试复现个人空间 open 与引用读取缺少预期拒绝。共享索引测试在修复前通过：两次查询共用一次列表和正文读取，取消第一请求后第二请求取得真实落库正文，这条正确语义作为回归保留。第五批完整构建、HTTP/服务/权限与 MCP 消费者定向验证通过，明细见接续批次验证；最终整合门禁/CI 未完成。

### QF-09 / P2：需求索引与现行 spec 的阶段不一致

`specs/README.md` 的 state-machine-platform 条目仍写“尚未实现”；`specs/state-machine-platform/spec.md` 开头已明确第 26 批交付 Manifest、SDK、词表首片与只报告门禁；生产实现位于 `packages/plugin-sdk/src/state-machine.ts:16-38`。索引读者会把“采用未完成”误认为“底座未实现”，重复开工或错误清账。

处置：低成本，本轮已依据原spec校正索引，明确第26批交付范围与第47/48批接续；没有改成“全部完成”，没有更改原spec或各批验收结论。存量迁移与待本人验收继续保留在原待办。

### QF-10 / P1：导入停止与传输生命周期脱节，失败回复仍可能写入成果

`apps/workbench/src/side-panel-files.ts:78` 的取消按钮与标题栏关闭使用同一 `data-knowledge-import-close`；`apps/workbench/src/browser/knowledge/import.ts:240-241` 只执行 `dialog.close()`，busy 时还特意保留队列。`importFiles:188-210` 不检查关闭或取消，继续处理本批。QEA-06 实操证明关闭/重开后仍完成真实导入；这证明恢复原界面有效，不证明“取消操作”已提供。

影响：用户在导入中点“取消”，仍可能继续写入后续文件。第十批改为明确“停止后续”，等待当前真实回执、不再发出下一项，保留剩余与失败项；标题栏/Escape 收起可恢复，在线单项处理中页脚写“收起”。转写队列不再持有旧 DOM 行作为事实，续传前重画真实待处理项，失败与未开始项保留。两个忙碌入口归为一个当前批次对象，running/stopping 与控件从它推导。

Host JSON、原件上传原来都没有把断连传给已支持取消的 artifacts concurrent 动作；现在在 HTTP 中用既有 responseAbortSignal 和 BoundActionClient control 传入，NDJSON 超界也撤销本次控制。owner 的读取/写入前 fence、固定版本身份与临时原件 finally 清理保持原样。主动停止后续不切断当前回执，避免人为制造结果未知；真正断连发生在已提交之后仍不承诺回滚，不自动重试。旧构建 QEA-23 两项、QEA-25 两项已复现界面行为；正常初始化后 QEA-24 六项也复现：四种断连没停提取，两种流式超界返回 actions.output_invalid 后仍有真实成果版本，故传输部分升级为 P1。修复正构建，尚未计为验收完成。

### QF-11 / P2：侧栏标签的近似溢出判断漏掉真实一像素位移

- 位置：`apps/workbench/src/side-panel.ts:405-415`；真实入口为项目页顶部侧栏标签，focusin/悬停 → grow → keep → scrollLeft；锚点归侧栏控制器，滚动合法范围归浏览器。
- 证据：CI Full两次运行各自重试仍在dark@2x发现图标偏移；本机打开多个插件后逐像素调整窗口，在1408/1480宽度复现。展开后scrollWidth=301、clientWidth=300，而精确容器宽度为299.891/300.016，图标移动1.109/0.984 px，scrollLeft仍为0。
- 根因：`scrollWidth > clientWidth + 1` 用取整尺寸重复判断可滚动性，排除了正好一像素的真实溢出；原0.5 px的位移标准本身没有问题。属于第32批已有路径，本轮导入/Feed改动未涉及此逻辑。
- 决定：第四批先验证删除门槛能够修复此复现（QEA-10原位移1.125、滚动0，修复后通过）。最终同步的主干#2098包含同一修复及小于1px残余位移处理，采用其完整实现；本轮side-panel生产差异归零，只新增QEA-10回归；几何诊断最终采用#2094主干完整文件，不重复建设或重复记功。最新共享消费者、视觉与Full按PR记录验收。

### QF-12 / P1：项目任务重绘丢失停止操作的进行中状态，并保留旧命令参数

位置：`apps/workbench/src/browser/work-task-panel.ts:takeTasks/stopTask`，调用方是任务列表、任务卡及事件卡；`work-bar.ts` 从同一个 attention 回答交入投影。原 `stopTask` 每次点击都会生成新请求；`takeTasks` 只比较 `commands.length` 等局部字段，等长新命令不进入 `tasks`。前者可能重复命令，后者让用户点仍可见的按钮却被 Mainline 的当前命令检查拒绝。

依据：旧构建的真实 Coding 路径持有停止回执、刷新 owner 状态后 disabled 为 false；真实第三方插件只把命令 `input.job` 从 `export-1` 改为 `export-2`，页面已收到新回答，实际 POST 仍发 `export-1`。均为独立断言失败，不以超时推断。

处置：第七批已实现并通过定向验收，最终门禁/CI 待完成。工作台唯一面板控制器维护本页尝试，三个展示位置共用；成功后的新读取交回 owner，明确失败可由用户再试。比较完整任务投影，删除不完整缓存键；Mainline 原执行前复核保持。QEA-17 的真实停止重画、同数命令新输入及同插件双来源已通过，原真实进程停止/未知回执不自动重试继续保留。

### QF-13 / P2：切换项目后旧 attention 请求阻塞并可能覆盖新上下文

位置：`apps/workbench/src/scripts/client/attention.ts:read/listen`，真实入口 `arrival/chooser.ts:chosenRoute` 和 chooser 项目选择。原全局 reading 布尔值跨路由继续持有旧请求；成功回答无目标核对，404 分支还读取当前路由登记 gone。用户切到 B 后仍等 A，旧失败可能使 B 看起来已删除或离线。

依据：正常 chooser 持有 A 的真实回答后切 B，成功/404/网络失败三种旧结果均让 B 的读取超时；这直接证明阻塞。迟到覆盖与错误 gone 归属来自调用链检查，修复后通过释放旧回答的消费者事件断言验收，不冒称基线已动态覆盖每个副作用。

处置：第七批已实现并通过定向验收，最终门禁/CI 待完成。每个读固定地址与 AbortController，切换取消旧等待并使其回调失效，旧 finally 不能收走新请求；同地址仍合并刷新。沿原单一事件流，不新增轮询或业务状态。QEA-18 已验证切回 A、迟到错误不污染当前上下文，Home 列表回归通过。

## 平台化与通用化检查及处置

| 候选与当前实现/消费者 | 定制造成的问题 | 事实与规则 owner；处置 | 顺序/成本 |
| --- | --- | --- | --- |
| PF-01 对象引用、跨插件呈现：`packages/contracts/src/platform/object-link.ts:12`、`horizontal/surfaces/src/position.ts:20-34`、`apps/local-host/src/surface-slot-http.ts:75,122` 已有受控 plugin-slot；Inbox `plugins/native/inbox/src/browser/client.ts:40`、Risk `plugins/native/risk/src/browser/client.ts:45`、Work Brief `plugins/native/work-brief/src/browser/client.ts:22` 已使用，PPT `plugins/native/ppt/src/plugin.ts:35-45` 经 Pages 公开动作读内容 | 未发现这条 PPT→Pages 路径跨实现直连。组合槽已有 UI contribution 声明、Host 兑现和真实消费者，不能只搜 manifest.ts 就误报未采用，更不应重建底座 | 插件拥有内容/修订；平台拥有位置、身份及授权。保持 surfaceSlot 与 objectLink；新增组合沿相同入口验停用、撤权、对象删除和返回，不开放任意 iframe、不解除 mountDeclared 的 owner 限制 | 保持现有方案 |
| PF-02 输入的材料来源：旧 parent 固定 sources:false，底栏菜单和来源服务已存在；实施见 QF-24～29 | 已采用父页受控交接和 Coding 消费；首次/后续/steer、未知回执、来源撤回、混合材料失败与同child重挂已有真实验收，最终组合CI待完成 | 平台父页持本人身份获取选择，只在本人发送时交材料引用；当前 onMaterials 即时回传与 child composer-send 必须一起约束，不能让子页绕过本人发送。Coding 要实际消费 input.materials，并核首次/后续/steer 及失败引用留存；大小约束须与 owner 对齐，复用原菜单。归 [BL-composer-frame-sources](../backlog/BL-composer-frame-sources.md)，不是取消 frame 权限隔离 | P1体验/中 |
| PF-03 Memory 会话来源：`apps/local-host/src/memory/memory-sources.ts:13`、`apps/local-host/src/memory/memory-session-binding.ts:51-64`、`apps/local-host/src/memory/memory-runtime.ts:20` 点名 Coding/Assistant | 未来第三调用方须改Host；当前未找到必须提前迁移的第三消费者。用户2026-11-12已批准两消费者例外，详见BL-memory-session-kinds | 平台拥有可信会话身份/授权，插件提供来源可读性/业务状态。按原批准在第三真实消费者出现时一并迁移公开binding、Host mapping和session-clear-plan持久结构；不能只扩字符串或将资格交输入。不记“已平台化” | 按用户已定后续条件保留；P2/高 |
| PF-04 后台任务：`apps/local-host/src/home-background-tasks.ts:22` 与 mainline；Coding/Images 已贡献，项目引导整理仍只有后台执行 | 有工作却不在任务入口；汇总失败又看似无工作 | 任务状态仍归业务 owner，平台管发现/完整性/可执行命令。接入既有 background_tasks/reports_to，修 QF-04；引导归 [BL-107](../backlog/BL-107.md) | P1体验/中 |
| PF-05 设置：`packages/contracts/src/platform/settings.ts:16,30` 有层级/CAS/request_id；SDK现行拒绝沙箱settings_entries | 有合同不等于作者可用；用户2026-11-08已将沙箱设置兑现明确后置，当前拒绝是边界，不是应删除的过度防御。BL38-1与BL44-6不可混作同一完成项 | 设置业务规则归owner，平台管声明、继承呈现和调用。按原路线补Runtime并迁一个真实消费者后再推广；本轮已检查并保持拒绝，不建全局配置仓，不声称底座已全面采用 | 按用户已定后续条件保留；P2/高 |
| PF-06 草稿/返回：Git已采用公共frame drafts，旧无生产读写工具已删除；QF-03/21/23/46 | 修复刷新/返回丢编辑、同键旧写覆盖、迟到回执干扰当前文件；独立Git及Coding内嵌的11文件109项通过，最终组合CI待完成 | 草稿文本归编辑器，平台提供按 Home/项目/安装/入口隔离与返回。Git 按工作区/文件修订接入，冲突正文不套输入框 4KB 限额；成功后才清草稿 | P1体验/中 |
| PF-07 来源拉取：Feed已沿公开SourcePull plan消费；Alchemist研究走Host Search Runtime、市场脉搏用插件来源适配器；旧WebQuery/YouTube工厂已退役，YouTube频道工具保留 | 已删除Feed重复intent/计划与两项SEL依赖，复用平台预算/来源可用性。真实 Runtime 与 RSS 消费者通过，失效 Feed 版本例外已获准删除，版本检查通过 | 集成拥有 URL/cursor/格式规则，平台管受控网络/凭据/证据。优先复用已有 presentation 登记；迁移剩余专属调用方时评估声明式输入是否足够，再废弃旧词汇/工厂。先核包外导出，保留 channel 工具；RSS 固定 IP 与 OAuth 刷新保持各自的安全边界 | P2/中高 |
| PF-08 等待/调度/取消：`packages/plugin-sdk/src/execution-lifetime.ts`、`packages/plugin-runtime/src/activation-jobs.ts`、`horizontal/scheduler/src/index.ts:252,274,392` 租约、Workflow/Alchemist 自有进程记录 | 散落的计时器容易泄漏；但不同业务终态强并会破坏恢复 | 复用资源生命期工具；业务流程状态及租约回执留原 owner。Feed QF-02 已修；不再造通用万能 Job 表 | P2/低到中 |
| PF-09 调用追踪：`packages/kernel/src/action-settlement.ts:107,152,175`、`horizontal/observation/src/records.ts:164` 已有 call_id/invocation_id/parent_invocation_id；本轮 request-failure-call-id 浏览器回归覆盖故障详情 | 这部分已有跨层身份，不是应重新建设的缺口；本轮未证明所有插件业务写入均已完整关联 | Kernel 管调用身份，owner 管 subject/revision/事务结果，Workbench 管可见反馈。保留现有观测/查询；后续按具体未关联写入补证，不把泛化风险登记成已复现缺陷，不建立第二套日志身份 | 保持现有方案 |
| PF-10 HTTP 中止：Search 入口未透传、composer 已透传 | 调用方取消了，后台继续做；重复请求叠加 | Host 负责 transport→Action signal，SDK/Runtime 负责停止和写入 fence；修 QF-08，不为每插件造 AbortController 框架 | P2/低到中 |
| PF-11 动作绑定：公共 bindActionHandler 与多插件本地副本 | 纯换参/类型断言重复、元数据接入容易漂移 | 公共合同管绑定，插件保留业务上下文。Feed query/inbox/rule 三处已验；另五插件已迁移，9 处 availability 因实际业务职责保留；QEA-26消费者定向通过，最终组合CI待完成 | 本轮已做/低 |
| PF-12 固定成果与过程项：`plugins/native/dataset/src/promote.ts`、`plugins/native/ppt/src/promote.ts` 已用 owner 事务与 artifacts 联合提交；成果导入走同一服务 | 局部再存一份最终正文或把过程项当成果，会产生两个版本主人 | 业务编辑稿归插件；固定可引用成果归 artifacts，过程项走声明。复用已有联合提交，不统一各插件的编辑状态 | 保持并检查采用/中 |
| PF-13 批量证据读取：`horizontal/evaluation/src/observation-bridge.ts:71-85` 的fetchObservationEvidenceMap对每条记录调用 `observation.evidence.get@1`；当前消费者为评测执行器 | 新main已修复500条静默截断，完整大样本随后产生N次解封动作；正确性保持，但调用成本随证据数线性增加 | 观测层拥有证据解封、用途及跨项目授权；评测拥有样本选择和unknown判定。归现有[BL-evaluation-read-cost](../backlog/BL-evaluation-read-cost.md)，补观测批量公开动作并迁移实际评测消费者；保留逐项拒绝/不可读原因，不跨读私有表、不让评测复制授权规则 | P3/中 |
| [PF-14](#pf-14--p3复用能力包的导航控件) 能力包导航控件 | 工作坊页签、比较分段和创作页范围分段重复写样式及无障碍标记 | 页面拥有动作与当前选择，复用 Design System 导航控件 | 本轮实施 |
| [PF-15](#qf-83--p3-英文资料侧栏仍显示中文的来源分组pf-15) 资料来源显示名 | 成果和置物架通过动作的固定标题展示，英文页面仍显示中文分组 | 提供方声明 TextRef，平台按当前语言取名，迁移侧栏的正常消费者 | P3/中，后续合同 |
| [PF-16](#qf-94--p3-原件关系卡的目标类型名未随中文界面切换pf-16) 原件关系的类型名 | Placement 公共 `noun` 在目标关系卡上直接显示 | 提供方声明类型名，Placement 维护关系并按页面语言呈现。迁移现有灵光等读取端 | P3/中，后续合同 |

PF-03/05/07/13 是采用或职责收口候选，即使目前只有一个实际消费者也须按 owner 判断；PF-08/12 同时列出不该平台化的业务部分。PF-01/09/12 是保留现有方案的判断，不冒充新发现。以上是本基线处置建议，不是全部已经交付。

## 需求整体实现度

判断：平台骨架、核心插件的大量功能已经真实实现，但整套 Molis Work 仍不能标为“内部完整”或“可发布”。这不是按代码量或 BL 数量算百分比：需求条目粒度不同，包的 production 登记也不等于整份产品需求验收。

当前索引 56 份活跃 spec 均指向现行文件，包括[第 36 批合后修复](../batch-36-audit-fixes/spec.md)。本轮复核状态与目标，按下表核对代表实现与 BL，独立产品验收仍以原 spec 各自的编号和证据为准。[逐屏打磨](../screen-polish/spec.md) 的十项 P0 缺陷已随 #2110 合入，整体方案尚有第 36A 批等任务待实现。

| 需求族 | 当前实现与证据层级 | 剩余实际结果 |
| --- | --- | --- |
| 动作合同、公开边界、SQL owner、升级链 | 已有生产路径与回归；本轮边界门禁和构建支持工程判断 | 存量 owner 采用、真实升级与各批最终验收不能被本轮替签 |
| 状态机平台 | 第26批已有声明/SDK/词表；本轮确认代码存在 | 第47批 Runtime 兑现、创作台、只读登记与第48批展示；144条旧盘点需逐条复核而非机械迁移 |
| 项目首页、工作线、明确交办 | 第15/32批已有实际组件、后台汇总、持续接单；最新#2098修复首屏旧版式闪现与聚焦抖动；工作线spec列了首片编号 | 事项容器/后续组合与多工作输入模型判断未完整；[BL-b32-acceptance-test-gaps](../backlog/BL-b32-acceptance-test-gaps.md) 保留 |
| 角色设置、事项容器（#2111、#2121） | 助理与 Coding 通过 Characters 选择、保存和恢复角色，每轮由 Agent Host 确定固定版。主线沿公开动作和原库事务维护事项、原对象关联和任务归属，组合安放把排列权限带到任务所有者的写前检查 | 角色由本人按 ROLE-14 验收。第 37 批事项界面、个人同步及原评审遗留沿各自事项处理。当前组合按 QEA-148、149、191、192 验收 |
| 助理与 Coding 子任务（#2115、#2122） | 正式助理与 Coding 消费同一 SDK 浮窗。Work 与 Prologue 拥有各自的原问卷、审批和回执。主干的合后修复已接通浮窗加额、关闭期间的回执和目标读取。原 SAI 与 QEA-151/152、175 核对其整合路径 | 本人体验沿 [BL-b59-subtask-acceptance](../backlog/BL-b59-subtask-acceptance.md)，助理团完整实现仍属原第 43 批 |
| Coding 与首次引导 | 新基线第33批及#2099已交上下文/完成报告、环境准备、轮次材料、ONB-35～46材料与恢复；本轮复核改动边界，沿用原批工程证据 | BL-batch33-acceptance仍待本人验收；BL-106/107已排45/57批，不因第33批完成而关闭 |
| 输入、语音、草稿和返回 | 第10/11批及 draft-and-return R0～R4 已做。候选头新增真实 Coding 框架材料、Git 草稿持久恢复、设置回程与 Skill 冲突恢复验证 | 旧 Home 草稿版本与 DRT-21 原验收仍须逐条对照；组合 Full 及本人体验待验证 |
| Account/安装/发行 | V2 登录和 Home 统一已合入；最新#2094对齐账号密码、短信/邮箱验证码合同，认证句柄与中央令牌仍归Host协调 | unified-account 仍列最终候选 Full/存量迁移/外部服务；0.3.0 候选不等于公开可发布 |
| 插件同等待遇 | 注册装配与公开服务已成主路；规划方法片已交 | Goals 平台特判、Memory 会话点名等按第44批迁移，不能宣称同等化已完成 |
| 观测/评测/Memory | 第28/29批与Memory P0/P1已有具体代码；第30批最小真实评测路径及#2100整改已随新main带入 | 已知局限、部分真实输入验证/产品入口仍在原 BL；不能用本轮静态检查替代真实模型质量 |
| 资料导入、Feed、Inbox、常用编辑插件 | 核心路径工作，本轮修复导入/后台资源并有隔离实操 | Inbox 主线程性能、通用恢复一致性、各插件独立体验验收仍需跟进 |
| 创作台/Alchemist/智能呈现 | 有沙箱、job/replay、组合首片 | 完整创作→修订→安装→长期使用闭环尚未完成；Jev 质量/延迟及后续生成页面不是“只有文档”的问题，也不是已验成品 |
| Sessions | 第 34 批已合入会话目录、10 个来源适配、历史、搜索、归属及界面。候选头的真实分页、旧命中直达、连续换账号保存与撤回范围路径见 QF-16–19 | 按 [BL-177](../backlog/BL-177.md) 保留冷启动引导接入、后续观察、直接控制与未接入来源；第 34 批本人验收独立 |
| 团队协作/团队记忆、主动建议、Agent 显式人审 | 团队两项仍是需求；主动助理与人审已有合入的若干实施片，第 39 批将可信决定接入工程入口 | 尚未交付的场景沿原 spec；真实云、多人协作和本人体验以相应验证为准 |
| 同步/桌面/计算机使用 | 已有实现、隔离测试及历史实操证据 | 本轮未接真实云、系统 WebKit、真实账号/模型，不据此签发布与真实环境验收 |

## BL 与事项清理建议

初次统计 527 条。合入 #2111、#2116 和 #2115 的工作树用 `node scripts/backlog-index.mjs` 实算 547 条，待本人验收 69、明确后续做 208、已知缺口 177、未实现 45、部分实现 40、待用户决定 8。下表列经核实的清理决定，正文以 `specs/backlog/` 为准，原本人验收和其他工作线归属继续保留。

| 条目 | 当前证据与可清理部分 | 应保留什么/执行方式 |
| --- | --- | --- |
| [BL-1039](../backlog/BL-1039.md) | 现行首次使用按钮已区分未连接/已连接，`tests/context-onboarding-action-copy.e2e.test.ts:22` 覆盖；第27批 action-copy spec §验证已有隔离实操证据 | 可关闭“未实现”的工程记录；本人验收并入 BL-batch27-acceptance，保留原编号到墓碑，不代签本人验收 |
| [BL-1040](../backlog/BL-1040.md) | `plugins/native/git/src/browser/source.ts:103-124` 已将状态改普通文字、缺远端隐藏 PR；`tests/git-source-controls.e2e.test.ts:18` 覆盖真实本地仓库、AX 与键盘 | 可关闭重复工程记录，剩余体验认可并入第27批验收；与 QF-03 的刷新/冲突草稿恢复不是同一问题 |
| [BL-040](../backlog/BL-040.md) | `packages/contracts/src/platform/plugin-sandbox.ts:121` 和 SDK sandbox-read-protocol 已有 subject_context；“生成插件不能声明对象读取器”过宽 | 已纠正正文：保留搜索来源与创作台草稿动作层缺口，区分read_protocol与ui.subject_context，未删除整条 |
| [BL-055](../backlog/BL-055.md) | `packages/plugin-sandbox/src/runner.ts:31` 已是真实子进程沙箱，“当前进程内执行器”描述失效 | 已删除过时进程内括注；保留Jev质量/延迟、实际平台边界验证及跨项目草稿，负责人不变 |
| [BL-observation-b28-known-limits](../backlog/BL-observation-b28-known-limits.md) | 正文已记录第29批补齐①②③、后续修⑥ | 完成子项移到来源 spec 的证据段，BL 只留④⑤等当前残余；不因列表里有已做项删整条 |
| [BL-115](../backlog/BL-115.md) | 正文记录离线备份/恢复/续接已在 main，真实 Home 2026-11-07 已做 | 将已完实施转为来源说明；只保留登记覆盖核对与 C 端在线定时备份，避免再次立离线备份实现 |
| [BL-117](../backlog/BL-117.md) | 策略、版本检查与0.3.0候选已有；公开发布资格仍在发布记录 | 与发行检查单保持一个剩余清单入口，不删除 Developer ID/公证/公开发布待办 |
| [BL-943](../backlog/BL-943.md) | 现行双 Goal 窗格探针 main 为 47/48，候选为 35/36，低于原预算 60/58。候选逐次授权及拒绝后的实际读写已复验 | 列为组合验收后可清理项。继续用同一个门禁检验，删除目录代次作为本事项的假定依赖。Inbox 的实际等待另见 QF-51 |
| [BL-inbox-update-blocks-host](../backlog/BL-inbox-update-blocks-host.md) | 候选的批次中独立 HTTP 正常返回，取消后剩余逐条重试，隐藏 Goal 请求已按周期合并。固定规则背景见第 78–79 批 | 保留高优先和现行测试时限。累计等待、同宿主负载及准确组合的 Full 仍依实际结果结算 |
| BL-360（main 第39批已归档） | 最新主干已实现 owner 的 `decisions/readMany`、版本与持久决定；本轮旧投影被覆盖 | 接受主干删除，迁移并保留 QEA-21/22 的撤权、重启及三个界面反证；合并交集复验中，不复活重复待办 |
| [BL-search-query-abort](../backlog/BL-search-query-abort.md) | 第五批已补 HTTP/个人空间/引用 signal，真实取消与共享索引测试通过，见 QF-08 | 已改正文去除“每次查询把所有来源跑完”的错误前提；待最终 CI 后按原流程关闭 |
| [BL-home-events-endpoint-unused](../backlog/BL-home-events-endpoint-unused.md) | 第 41 批已查公开约定，删两条无生产调用的旧 POST 转发及只读放行。隔离 Home 验旧地址 404 且触发零读取/写入，MCP 继续使用现行动作 | 候选头有 8 文件 50 项定向证据。最终组合通过后可按原流程关闭工程遗留 |
| [BL-first-screen-duplicate-requests](../backlog/BL-first-screen-duplicate-requests.md) | 两个构建的真实首屏均见 Placement 读取两次。第 62 批修复后，窄宽两条正常流只读取一次，再打开及移动同一个原件。两边均未观察到旧 Home Events POST | 待首屏样本及最终组合验收结算，具备关闭两项原工程缺口的依据。隐藏侧栏文档的加载另归原 BL |
| [BL-plugin-release-module-source](../backlog/BL-plugin-release-module-source.md) | 已有明确待用户决定，涉及库内保留内容及恢复路径 | 保留决定；“现在通常用不到”不等于授权删库/兼容机制 |
| [BL-composer-frame-sources](../backlog/BL-composer-frame-sources.md) | 父页受控交接及 Coding 的首次、后续、steer、未知回执、撤回与重新挂载已有实际验收 | 最终组合通过后收口，见 PF-02/QF-24，保持父页身份与共享组件职责 |
| [BL-107](../backlog/BL-107.md) | 引导已经 Host 后台执行，缺后台任务登记 | 收窄为登记/进度/返回入口，复用现有任务贡献，不新做执行引擎；新main已注明45/57批排期，保留该归属 |
| [BL-177](../backlog/BL-177.md) | 第 34 批已合入，原 BL 已标部分实现。索引中的「尚未实现」已按现行 spec 更新 | 保留已安排的场景与来源缺口，实际整合随后续，原本人验收继续 |
| [BL-b42-followups](../backlog/BL-b42-followups.md) | ③ 地址消费与 Home 草稿回执，④ 共用导航控件，已本地验证。① 本轮修复了文字调用的结果有效性 | ③④待最终头验收后归档子项。① 用量采集仍归 Observation，②、⑤–⑧沿原事项保留 |
| [第 36 批角色与主线遗留](../backlog/BL-b36-review-followups.md) | 主干已补角色过期选择恢复、撤销及事项归属事务。本轮核对主线与任务的写入仍归不同服务，现有任务面板只提交事件去处 | 保留 [ROLE-14 本人体验](../backlog/BL-b36-roles-acceptance.md)、[角色细节](../backlog/BL-b36-review-followups-roles.md) 和第 37 批项。事项页面若同时提交两种去处，应明确分别结算的结果；另跟进独立的事项修订与两份下一步 schema |
| [BL-state-machine-migration](../backlog/BL-state-machine-migration.md) | 144/89/55/32是旧盘点口径；SDK 已有，但所有布尔组合不都是真状态机 | 按实际 owner/合法迁移/取消恢复复核，剔除纯派生与资源句柄；保留逐批迁移，不宣称本轮确认了全部144条 |
| [BL-acceptance-first-slice-limits](../backlog/BL-acceptance-first-slice-limits.md) | modules/acceptance 已有项目范围事实；个人范围及可信决定接线未齐 | 保留对39/44批的依赖，别再开第二套“要求—证据—认可”存储 |
| [BL-1064](../backlog/BL-1064.md) | 锁定 Node 已有；本轮也发现默认24.14与要求24.15不符，切换后相关初始化恢复 | 保留 Homebrew 动态库/发行入口的未验证部分；开发环境切对 Node 不能证明所有安装用户问题已解决 |
| 待本人验收 69 条及第 32 批验收缺口 | 工程证据与本人认可分别记录，部分真实模型与多事项场景仍待验 | 合并重复的验收入口时保留原编号与负责人 |

BL-1039/1040 可在保留第 27 批本人验收和墓碑映射后清理工程待办。其他清理按表中证据执行，已完成子项可回原 spec，重叠事项沿同一实施路径，等待最终验收的保留编号。Git 草稿、执行终态、导入停止的实际结果分别见 QF-03/06/10。

PF-03 当前复核补正（6359987103）：Coding业务映射已通过 `coding.sessions.binding.read` 读取，Host没有直接读Coding表。剩余第三插件采用缺口在 `memory-sources.ts:57`、`memory-runtime.ts:17`、`memory-learning-owner.ts:93`、`memory-learning.ts:107` 与公开 `services/memory-session.ts:6` 的封闭绑定类型；不可只删白名单，把安装身份和业务授权交给输入。平台负责真实安装/generation、canonical Session、原件作者/版本、权限与SDK生命周期；Coding的归档/映射、Assistant的work/delegation/hold仍归各自业务owner。正常召回的common场景已经可用，与自动形成/Session管理的采用缺口分开。来源形成前后复核、SDK提交观察和原队列补账有实际边界依据，保留；第三插件采用需要补公开owner声明并迁移真实调用方，仍在原任务范围内。

## 分批优化策略

1. **先保障已受理的操作和实际写入**。按各 owner 的公开入口处理导入停止、认可事务、Skill 采用、换模型后旧结果及 Git 审查。分别核实际持久结果、拒绝或回执丢失与原位继续。涉及历史固定版本的警告写法要先结算连续升级决定（QF-15）。
2. **再减少当前操作中的重做和等待**。继续沿同一入口读回工作项的实际状态，保留 Git 和 Skill 输入，使用原提交或审查回执恢复；收敛后台刷新和目录读取。QF-51 的实时可用性和重复请求已有实测，仍保留五样本性能波动及原 BL 的结算条件。
3. **把已验证的共同职责交给现有平台入口**。材料交接、草稿排序、来源拉取、Home 回执和导航均有生产消费者。已迁移旧工厂、Events POST 和草稿工具，并清除获批的 Feed 失效版本例外。引导后台任务与 Observation 用量沿原 owner 和 BL 接入，其他采用候选见平台表。
4. **按组合构建收口**。独立 Home 的功能证据按实际测试提交保存。最新候选的资源许可与 Full CI 结算后，逐条对照原验收，将已证实的工程 BL 或子项按仓库流程归档，继续保留已有的本人验收归属。

## 从一次操作追到事实与反馈

| 正常入口 | 合同/编排 | 最终 owner 与写入 | 页面/开发者如何确认 |
| --- | --- | --- | --- |
| 侧栏导入 | workbench import → artifacts HTTP → importDocument | artifacts 固定版本/原件与既有去重 | 当前文件结果行、失败原因、未处理队列；测试直接读真实成果记录 |
| Feed 选消息入箱/规则 | Feed 公开动作 → Kernel schema/authority → Feed/attention | 原消息归 Feed，入箱状态归 attention；事务/版本检查 | 原条目状态与 Inbox 可见结果；已有入箱/重开/取消用例 |
| Agent 提案→用户决定 | agent-host review queue → 原授权 → Prologue answer | 决定/一次性消费归 review owner，实际执行账本归 runtime | 回执区分失败与未知；call_id 连 invocation 与父调用；不能把投递超时当没执行 |
| 后台排期 | 插件声明 → scheduler claim/lease → 公开动作 | 排期业务记录归插件，租约/唤醒记录归 scheduler | mainline/tasks 读取 owner 的实际状态和命令；Home 完整性缺口见 QF-04 |
| 跨项目复制 | placement 预览/确认 → 持久身份计划 → 各 owner prepare/apply | 各 owner 只写自己的事实，最后发布项目 | 稳定 operation 回执；失败保留未完成副本，同一身份接续 |
| 项目设置重审签名插件 | 签名包文件升级 → Host 项目同意视图 → Workbench 项目设置 | Host 同意服务写 Runtime 的同意记录。实际目标进展归 Goals，只在获准调用后写 | 版本扩充时看见独立新增条目和费用。取消、重审、撤回后的真实写入取证见 QEA-145 |
| 删除项目或卸载个人空间插件 | Host 项目删除服务或个人空间卸载入口 → HomeConsentLedger → Runtime 账本 | Runtime 核项目或安装主体，在一个事务写原行的撤回时间 | 正常入口返回实际清理状态。历史和周边项目实读，以及失败后重试见 QEA-146 |
| 回看 Inbox 里的已处理事项 | `inbox.stage.read@1` → Inbox 建议查询 → Attention 状态与 Feed 的公开原文读取 | Attention 保有事项状态，Feed 管原文，已保存判断由判断账保留。读工作区没有业务写入 | 并列看到事项和当前建议。已忽略条目不再因读取正文失败拖住列表，见 QEA-147 |

所有结论都以本基线为准。真实模型、外部账号、线上云同步、用户真实 Home 和本人认可没有在本轮被代替验证。

## 接续批次验证（main 70aaa976b，尚未整体验收）

- 第五批搜索：修复后 HTTP 取消 4/4、服务 37/37、Host 1/1、刷新预算 1/1、引用 4/4、对象引用权限 3/3 通过；独立重跑真实 stdio MCP 授权 12/12 通过。保留前次 7 项超时，原因未确认，不以重复通过删除记录；未调等待上限或放宽断言。Search 健康检查通过，giant 数量不增。
- 第六批 Home：构建后 7 文件 41 项通过；原 Coding 子进程停止 1/1、插件页拒绝 Home attention 扩权 34/34 通过。QEA-14～16 的来源失败、超时、恢复、实际 Home/项目入口与等待中重画均有覆盖。12 张截图与实看结果见 coverage；资源增量、其他必跑、最终 CI 待完成。
- 第七批：旧构建三项问题已复现，修复构建通过。最终 QEA-17 同插件双来源 1/1、QEA-18 三种迟到结果 3/3 通过；原 Coding 停止、Home 完整性及相关客户端/工作线/chooser 通过，详见 coverage。错误场景首轮切回失败来自测试拦截器未关闭，修正后通过；没有调整产品断言。尚无最终提交或 CI 证据。
- 第八批：公开 Adapter 的完成/失败/取消/停止 × 时间保存延迟/失败 8 项在旧构建全部复现错误 running；控制先结束但 SDK 账本未终结的拒绝边界在同一用例成立。已移除显示时间覆盖 phase 的逻辑，完整构建通过；7 文件 58 项通过（运行交错 8、恢复 22、停止 1、预算 6、SDK effects 13、运行观测 4、搜索取消 4）。只读评审未见 Blocker/P1。真实 Node 的时间与启动意图仍共用串行 index.update；本批不声称磁盘挂住时可以绕过持久队列。完整门禁/CI 未完成。
- 第九批审查选项：旧 HTTP 用例已复现撤权后仍提供批准。Queue 即时投影与 Host、主审查面、浏览器/电脑侧栏三个消费者已迁移，完整构建通过。首轮 13 文件中 9 文件通过；另外新增 HTTP 的状态码预期应为现行 409 而非 403，两个浏览器夹具分别漏一次性操作键/显式 Host，另有一个命令文件名误写，均已修正并在复验。第二轮 6 文件中 5 文件通过：侧栏 2、HTTP 11、checkpoint 4、浏览器目标 4、Coding 时间线 3；Git 实操发现测试误把隐藏独立 Git 页当停用实例，实际 Coding 仍嵌入 Git，故继续可批准正确。已加断言保留该语义，再关闭最后的 Coding 入口检验旧激活失效，待复验。原 Git 正常批准/拒绝 2、review kinds 安全 14、浏览器目标 4、电脑消费 13、审查渲染 19、SDK Git 7、反馈 2、Queue 2、standing 3 项通过；不能算新增正常入口已验收。
- 第九批正常入口补验：Git 关闭最后依赖后旧操作只能拒绝，再激活仍不能继承旧权，实际拒绝后索引/HEAD 不变，1/1 通过（47.5 秒）。四张中英文 1440/390 图已生成并查看英文390、中文1440；截图当时 diff 还在读取，已补等内容完成与1024/深浅色采样，扩大视觉复验待跑。该结果不覆盖后续新增导入改动。
- 第十批导入：旧构建 QEA-23 两项均在真实当前回执等待后复现“停止关闭窗口”；转写停止和在线 Cancel/Hide 两项也在旧构建复现。首轮 6 个 HTTP 用例尚未到达提取进程，不计作缺陷复现；补正常项目初始化后，第二轮 6 项均有效失败：四种断连后提取未退出、两种进度超界仍登记实际版本（77.8 秒）。修复构建/验收中。静态只读复核未见 Blocker/P1，指出缺少超界取消分支验证，已补 JSON/raw 两个真实 helper 超界场景；尚未运行，不能以代码评审代替通过。原件缓存与成果版本分开，断言零版本不承诺磁盘零文件。
- 第十一批公共动作绑定：Dataset、Form、Todo organizer、Cognia、Images 已迁移，删去 5 份换参/断言，保留 9 个 availability 与全部业务/授权规则。既有公开动作及实际 owner 测试标注 QEA-26，尚待构建/验收。必跑及新增验收清单累计 181 个去重文件，未将清单数量当已通过数量。
- 额外执行 `pnpm typecheck:tests` 未通过，首次有 4,095 条诊断，最新为 4,090 条；忽略行列号比较未增加诊断、消除 5 条。新审查入口及侧栏测试没有直接诊断；另移除旧 HTTP 测试中不存在且未使用的 AgentHost 导入（尚未重跑类型检查）。本轮新测试的三处直接问题（未用导入、未声明 caller 类型、旧 steer 返回形状）已修正。检查到 Coding、Host 日志、插件页及 MCP 授权的列出错误位于未修改行，但尚未完成全量基线归因，不将此命令算通过，也不把诊断条数当作业务 Bug 数。

下列记录属于接续前批次，保留原证据与限制，不能覆盖本次新改动。

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
| QEA-01 | 75 包代表入口与逐批实际追踪已记在 coverage。按原范围汇总仍待补验的真实路径。 |
| QEA-02 | 缺陷、平台候选和排除判断有源码、影响、责任与证据；各批实际结论见本报告。 |
| QEA-03 | 已通过的定向及隔离实操见各批。资源和版本例外已按批准结算，准确组合的远端验收继续。 |
| QEA-04 | 已按 55 个活跃索引链接与现行 spec 复核主要交集。可清理、可合并和原须保留事项见 BL 表。 |
| QEA-05 | 通过：201份真实文本文件分200+1导入，逐份核对title、正文和唯一成果id；第二批无须重选；200份超限文件整批失败后，下次点击仍保存后面的正常文件及准确正文，已先复现阻塞再验修复。 |
| QEA-06 | 通过：处理中追加、切换类型、关闭/重开、部分失败重试；已成功项不重复写，结果行对准文件。中英文1440/1024/390、浅深色均无横向溢出；截图复核含英文动作按钮。关闭不等于取消，剩余见QF-10。 |
| QEA-07 | 通过：真实拖入401文件的目录，依赖目录不进入选择，下一批显示200且总选择完整。 |
| QEA-08 | 通过：生产等待器连续12轮唤醒、预先/合并通知、取消均清理监听；原后台失败恢复、停止/重启用例也通过。 |
| QEA-09 | 通过：查询、入箱和规则迁移后的真实Runtime、权限拒绝、撤权、实际保存/重开、来源可用性与界面消费；有独立业务职责的包装未删除。 |
| QEA-10 | 定向回归先失败后通过；完整侧栏9项、几何783个控件状态及组件板通过，最终Full待完成。 |

可复核位置：`tests/knowledge-import-queue.e2e.test.ts`、`tests/feed-content-ledger.test.ts`、Feed动作/Runtime/授权及Inbox消费用例；截图位于已忽略的 `.impeccable/qa/review/quality-experience-audit/`。终端日志位于 `/tmp/molis-quality-*.log`，不作为持久事实源；报告保留实际结果与复现入口。没有真实模型、线上同步、安装升级、系统WebKit或本人认可的本轮证据，不签整个平台内部完整/可发布。

### CI补验（2026-11-15）

提交 `a7f6122c8` 的 [CI Verify #8009](https://github.com/molis-ai/molis-work/actions/runs/43823056147) 全部通过，包含Linux实际首屏预算。[Full #1024](https://github.com/molis-ai/molis-work/actions/runs/43823067427) 第22片在 `geometry-boundaries.e2e.test.ts` 的 dark@2x 图标聚焦检查失败：右侧图标移动1px；首次及单独复跑各自自动重试后均失败，其余47片被取消。未放宽断言或登记隔离，Full未通过。

本机 Chrome .38 与对齐CI的 .50 起初各自通过原几何检查（783个控件状态），常见宽度也未复现。随后在真实项目中打开多个插件并检查1400～1600窗口宽度，1408/1480处复现图标位移1.109/0.984 px，整数溢出仅1、scrollLeft为0，确认QF-11的范围门槛遗漏。新QEA-10在原实现稳定失败，删除原门槛后通过；不调整0.5 px容差。通用几何检查保留精确坐标输出，定位用的临时滚动采样已移除，专门回归仍检查真实滚动。

诊断提交 `9ec5b9063` 的 [CI Verify #8016](https://github.com/molis-ai/molis-work/actions/runs/43826783097) 通过。[Full #1030](https://github.com/molis-ai/molis-work/actions/runs/43826860125) 在本机根因确认后取消，待其终止再修改生产实现，不计为通过。第四批完整构建通过，31个必跑及共享消费者文件30通过；仅model-ready-surfaces中两个Jelly关闭设置后返回超时，完整文件隔离复核仍失败；新主干f45994e97的干净构建使用同版本Chrome也在相同138/180行失败（10/12通过），因此不是本轮新增回归，根因未确认。原侧栏9项、几何检查及组件板均通过。

第四批实测资源（同名补正前、初始基线）：65条路径无遗漏，资料脚本仍+166 B，工作台脚本-33 B，静态策略通过。沿用同一真实基线重测首屏：到达/选择页中英文冷加载+9/+18 B、热加载-39 B；工作台冷加载+202/+228 B、热加载+21/+38 B，已批准额度内，首屏策略错误0。

评审补正：新增同名文件回归已在修改前失败（期望保留2份、实际1份）；已删除客户端以path作为身份的去重，完整构建后导入文件4/4通过，三份同名正文均保存、再次导入成果ID集合不变。

### f45994e97阶段本地整合记录（2026-11-16）

- 合入 `f45994e97` 后，候选与干净主干完整构建均通过；包边界73包、4,189源文件、22,475个import，无错误；健康门禁通过，输入断言248→245，其余受控计数未增。
- 6文件48项通过：导入队列4、i18n9、Coding第33批10、引导第33批5、引导文档18、引导恢复界面2。前三批和第四批旧运行是历史阶段证据，不与这48项重复累加。
- 同名补正删除了选择层的路径身份假设。新增回归原实现保留1份而非2份；修复后同批两份、跨次第三份均按真实正文保存，重复选同一文件复用原成果ID。
- Jelly两个关闭设置后的返回超时，在候选完整文件复核与干净新main同版本Chrome均发生于138/180行，新main10/12通过。已证明不是本轮新增回归；未确认其根因，不用更改断言/超时换取通过。
- 最终真实资源比较以新main冷构建为基线：65路径无遗漏，资料脚本+96 B、工作台脚本−33 B；首屏到达/选择页中英文冷加载+9/+18 B、热加载−39 B，工作台冷加载+132/+158 B、热加载+21/+38 B。原批准额度内，静态与首屏策略错误均为0。
- 全壳比图在该阶段曾启动，后因同步主干取消，未生成完成报告；最终差异不再触发此项，见下方范围校正。局部导入截图和正常入口实操继续保留。
- 只读评审逐批及整体通过，审查代码头 `cb55dcdcc`；没有Blocker/P1，同名P2已修复。评审使用当前可用模型（指定Opus不可用），未替代工程/实操或本人验收。

### 同步最新侧栏实现（2026-11-16，main 0d45ba58b / #2098）

最终推送前主干合入同一VUX-07边界修复：删除整数溢出门槛，并在scrollLeft取整后对小于1px残差做图标平移。保留主干完整实现，撤去本轮重复的side-panel生产改动；新增QEA-10回归与精确几何失败坐标保留。本轮贡献不重复计为主干已有的侧栏实现。主干还修复首屏旧版式先闪现，观察器后续整理归新BL-work-line-layout-observers，本轮不接管。

原f45994e97视觉采样在基线侧进行到一部分时主动取消，不计为通过；只清理该次进程组和隔离Home。新基线的构建、共享消费者、资源与视觉将重新验证。此前f459的测量是历史记录，不当作新基线结果。

新增main事项：`BL-work-line-layout-observers` 是最新主干新增的明确后续做条目；初始527条统计不包含它。保留工作台线owner与待复现场景，不将已合入的聚焦修复等同于全部观察器整理完成。

0d45ba58b阶段验证：两边完整构建通过；静态65路径通过，仅资料脚本+96 B。本地首屏采样在基线全插件页GET超时；随后CI #8027在Linux实际重测，静态/首屏/插件样式预算全部通过，采用该正式证据，不重复本地采样或放宽超时。共享消费者5/6文件通过：Jelly12/12、几何、工作区标签2/2、导入4/4、组件板通过；侧栏8/9，唯一失败是PFG-22/24完成后的HTTP服务清理超时，其功能断言与QEA-10通过，随后QEA-10与该PFG-22/24单例隔离复核2/2通过；未修改任何清理断言或超时。

最终验证范围校正：本PR相对合并基线的生产差异只有import、locale和Feed，侧栏/共享样式/外壳差异为0。按 `docs/system/PARALLEL-DEVELOPMENT.md:138`，全壳 `visual:compare` 的触发已不适用；旧采样取消且未通过，不声称有对比报告。导入正常入口、中英文三宽两主题12张失败状态截图仍有效，另补英文390宽首批完成后剩余文件提示。只读评审已核对该范围解释，不省略局部界面实操。

最新同步bd537b7d9带入第30批评测整改（#2100），无本轮生产文件冲突：unknown、证据读取完整性、记录回填及文档索引校正采用主干；新增BL-evaluation-read-cost保留在评测owner，批量读取须先补公开合同。初始527条BL统计不包含截至bd537b7d9同步新增的两个条目。相关评测用例与最终CI覆盖整合。

### 本地验收收口（bd537b7d9整合，2026-11-16）

完整构建通过。最新UI整合的6文件中5文件通过；侧栏唯一失败为 `tests/fixtures/goal-browser.ts:38` 的HTTP服务清理5秒超时，未发生功能断言失败。随后保持原断言/超时，QEA-10及同一PFG-22/24完整单例2/2通过；原清理超时不冒称已定位或修复。Jelly完整12/12、几何、标签工作区2/2、导入4/4和组件板通过。

补充英文390宽首批完成后剩余提示，QEA-05通过真实200+1写入、整批拒绝后的尾部写入、提示文字与无溢出断言；已目视复核截图 `import-remaining-en-390-light.png`，原12张失败/重试图仍保留。新main评测整合3文件20项全部通过（service9、安全7、CLI4），覆盖完整读取、unknown、真实Todo消费、取消与隔离拒绝。

Full #1035在24片通过后暴露Goals整页的预期文案未同步，第33片失败、23片取消。独立bd537b7d9完整构建后，Goals用例56项通过、2项录制开关用例跳过，52条原快照全部匹配。沿原测试正规化，只在基线HTML替换本轮导入帮助文字和英文Import按钮，16个整页分别增加7/38字符，候选52条draw逐字节匹配派生预期、36条片段记录不变。只同步这16条快照及来源注释，不放宽断言、不使用候选RECORD模式。

同头Verify #8032首次Inbox候选目录BRC-05发生HTTP连接关闭，两次失败；同头Full第9片与本机独立文件均首次4/4通过，单独重跑失败子集后82文件通过、flaky 0，Verify成功。未修改该用例、重试次数或超时，连接关闭根因尚未确认。该Full侧栏完整9/9和几何检查首次通过，但整轮仍为失败，最终补齐后的CI由PR记录。

[CI Verify #8027](https://github.com/molis-ai/molis-work/actions/runs/43839021837) 在提交56f235922对照0d45基线全部通过；官方实际首屏最大冷增191 B、热增38 B，静态65路径通过。后续仅带入主干评测整改、补强一个已有UI测试和报告；最终提交的Verify/Full状态统一见[PR #2101](https://github.com/molis-ai/molis-work/pull/2101)，不将旧头CI冒称最终头CI。

### 最后同步main 0dceaca09（2026-11-16）

#2094的账号入口采用现行Auth合同：`apps/local-host/src/account-auth-http.ts:10-35` 三条固定可信HTTP入口，`horizontal/account/src/authentication.ts:37-65` 负责登录世代、权限/取消复核及Host句柄映射，`authentication-protocol.ts:70-77` 负责一次性授权换取，工作台只消费公共结果；中央账号与验证码事实仍在Auth。保留主干实现和原批资源许可，不将其计作本轮改造。唯一冲突在几何失败诊断，采用主干完整测试文件，QEA-10独立回归保留。新基线的构建、相关账号/正常入口回归及最终CI结果见PR。

#2102补入[后台提供方缺口](../backlog/BL-work-line-background-provider-gaps.md)、[同拍汇报合并](../backlog/BL-work-line-report-batch.md)、[本人认可入口待决定](../backlog/BL-b32-acceptance-entry.md)。分别接PF-04采用缺口、助理汇报连续性及既有可信决定依赖；不新建平行BL、不替用户作出认可入口决定。初始527条统计保持历史快照，同步累计新增的5条不混进原分类数字。

新基线完整构建、包边界和健康门禁通过（输入断言248→245）。整合6文件中5文件通过：账号client15、session23、Host安全18、几何1、Goals快照56（另2个原录制开关用例跳过）。到达页18项中16通过，方向键切换及快速切换两个场景在简介aria-busy结束前超时；保持原断言和超时单独复核，2/2通过（72.5秒）。首次超时保留为未确认根因的运行失败，不声称已修复；最终CI仍须覆盖完整到达页文件。

### 资源许可随基线校正（2026-11-16）

Verify #8036在0dceaca09基线实测：资料脚本+96 B；到达/选择页中文冷+54 B、英文冷+63 B、热0；默认/全插件工作台中文冷+171 B/热+21 B、英文冷+197 B/热+38 B。中英文词包新地址已被现有entryApprovals正确识别。相较旧基线，到达/选择页各增加6 B，超出了本任务旧逐入口记录48/57，因此该作业失败；不是新增业务资源或规则失效。

用户已明确批准同一词包新地址和首屏冷加载最多261 B、热加载最多38 B。本次最大197/38仍在已有授权内，仅将本任务四个逐入口值校正为54/63，并将脚本166→96及工作台235/261→171/197收紧到实测值；保留原审批记录，不修改门禁脚本、共享基线、入口范围或生产代码。Full #1036因需更新最终提交主动取消，不计为通过；新最终头重新运行Verify和Full，结果由PR记录。

### Feed 消费用例的刷新交错（2026-11-16）

b5e52d390 的 [Verify #8037](https://github.com/molis-ai/molis-work/actions/runs/43856421963) 全部通过，实际资源最大冷增197 B/热增38 B。其 [Full #1037](https://github.com/molis-ai/molis-work/actions/runs/43856462891) 第14片在 `tests/product-interaction.e2e.test.ts:241-248` 两次等待旧按钮被替换超时，2片通过、45片取消，整轮失败。此Feed路径与此前Full #1035首次5/5通过时没有代码差异。

旧用例先注册来源再抓按钮。宿主notice可在两步之间刷新；`plugins/native/feed/src/browser/factory.ts:75` 对相同HTML保留节点，测试可能把已经正确更新的页面判失败。隔离Home中经现有DOM通知入口制造两次真实刷新：第一次替换写入前的按钮，第二次读回相同HTML，保留写后抓到的按钮，诊断1/1通过（54.3秒）。这证明观察顺序对合法交错不成立；并未完整复原首次CI的自动通知时序。本地原样及完整自动通知尝试有60秒总超时，缩小的自动通知场景有5秒等待超时，均不计验收通过。

仅调整测试：在写入前抓旧节点，另确认新增来源实际显示；原节点替换、保存中忙碌/禁用、单次提交、草稿、真实排程写入和失败恢复断言及60秒超时全部保留。生产代码、测试清单、重试和门禁不变。临时诊断已移出仓库。补正后本地完整消费者4/5通过，排程设置仍为60秒总超时（cancelled 1、断言失败0），不能判完整通过；独立受控交错1/1通过只证明观察顺序的漏洞。只读复核认可改动及证据边界，最终头CI须完成同一完整文件，结果统一见PR。

### Goal 表单保存状态的观察窗口（2026-11-16）

07029fc93 的 [Verify #8038](https://github.com/molis-ai/molis-work/actions/runs/43861032526) 首次全部通过，两组产品子集152文件、flaky 0；[Full #1038](https://github.com/molis-ai/molis-work/actions/runs/43861248358) 的Feed完整交互首次5/5通过、所在14片44文件通过，但第11片Goal表单两次失败，整轮10片通过、37片取消，未完成全量。

`tests/goal-form-viewport.e2e.test.ts:87-95` 用800ms网络延迟假设检查时仍在保存。生产 `plugins/native/goals/src/event-document-client.ts:338-350,442-445` 在实际响应完成后恢复控件。本地只延后1秒观察，实际已持久化1条、表单hidden=true、busy=null、文案恢复、请求次数2（一次拒绝加一次重试），原inert断言失败，证明旧测试依赖短暂时间窗口；不将该受控复现冒称首次CI全部时序。

测试改为一次性挂起本次重试的真实fetch响应，确认服务端已写入后观察进行中状态、触发重复submit，在finally释放原Response；继续检查原请求次数、内容和事件流水、重载后的唯一记录。所有原断言、60秒超时及生产行为保留，无假响应或额外重试。补正后完整两宽度2/2通过（1024×400为40.6秒、390×500为32.0秒），含真实保存/刷新与无重复写入。为一次列齐剩余失败，后续Full用现有integration入口指向PR同一SHA，不改workflow或验收标准、不合并集成分支；最终CI结果以PR为准。

### 本次检查点的未完成门禁

合入 Sessions 主干后的 `pnpm typecheck:tests` 输出4,108条诊断；按实际变更行定位的两处新诊断（ArtifactImportResult断言和ArtifactVersionRecord类型）已修正，尚未重跑。没有完成所有诊断的干净主干归因，不将其算通过，也不宣称其余全部是基线。`health:check` 对4a08c41c失败于两个本轮新增 giant：bindKnowledgeImport152行、AgentReviewQueue309行26方法。已分别提取文件选择/拖放输入适配与审查状态/选项投影，所有队列/决定/权限事实仍留原owner；不改阈值或新增例外。后续 `/tmp/quality-audit-git-editing-health.log` 已通过，giant总数50无新增，handler input casts248→240；导入队列8、审查侧栏2、companion生命周期14及原Git控件1项均已通过，其他本批用例仍在运行。日志 `/tmp/quality-audit-sessions-tests-typecheck.log`、`/tmp/quality-audit-sessions-health.log`。


第十四批最新定向结果（2026-11-16）：

- 平台 QEA-39 的4文件21项、Git Host QEA-40及原操作19项、客户端包2项保留有效结果。`git-final-paths.log` 的7个通过文件另包括真实 Coding交接1项、产品HTTP1项、writer整合7项、worktrees12项、英文回执4项、Git插件9项、porcelain8项。该轮编辑文件10/11失败不隐藏：新增输入目录恢复在“设为输出”后卡在空白禁用的读取状态，独立诊断重复确认，日志 `git-input-refusal-diagnose.log`。
- 根因是冲突读取错误地依赖摘要 generation。现改为原目录/文件/ticket/可见信号；解除冲突清引用并禁用编辑器，旧文件回答不能回填。最终 `/tmp/quality-audit-git-lifecycle-acceptance.log` 3文件27项全部通过：编辑恢复12项、独立/嵌入生命周期14项、原源码控制1项。新增受控实际 owner 回答验证同目录刷新保留、切文件不覆盖和合并解除不回填；真实输入目录拒绝不写磁盘，转输出后读取新版，用户再次核对并批准才实际写入。
- 同路径还修复本批引入的未完成操作关联：尚未派出或 owner 明确因输入目录拒绝时，不等待不存在的审查；实际缓存从1条残留复现到0条，编辑正文保留，其他未知结果继续等待原 owner。重载、审查拒绝/成功、保存/删除交错、读取失败重试和目录切换由上述真实路径覆盖，不新增后台重试。
- 完整构建通过；`/tmp/quality-audit-git-final-health2.log` 对 `4a08c41ca` 健康门禁通过，50个巨大单元仍为既有登记、翻译/语法/混用构建进程均0问题，未改阈值。版本生成检查通过，删除旧无调用格式的唯一版本项；先前未删源表项造成的生成/构建失败已按原版本流程纠正，没有修改生成脚本。
- 界面生成1440/1024/390与浅深色6张真实图，已查看1440浅色、1024深色和390深色：当前文件可读、按钮可用、无横向越界。但长正文位于窄目录栏的体验问题另列 QF-23，保留本轮实施，不以截图生成宣布该问题完成。截图目录 `.impeccable/qa/review/quality-audit-git/`。
- 用户少重写提交/冲突正文，交接失败不必重新生成；开发者从提交快照可追到原 operation_id、owner 实际结果和精确草稿清理。平台统一承担草稿顺序，Git不再维护旧serializer/截短兜底，Coding不再约定Git私有storage键。范围仍为原六方向全仓审查；PF-02 已写第十六批需求，未以本批工程通过结束任务。

## 第十六批进展：共享输入来源（重试交错补验中，必跑回归与最终 CI 待完成）

### QF-24 / P1：材料来源在框架入口断开，补充与等待没有完整消费

当前位置：`apps/workbench/src/browser/plugin-frame/composer-parent.ts:216,225,313`；`plugins/native/coding/src/browser/main/composer-mount.ts:126`；`plugins/native/coding/src/routes-sessions.ts:277,355`；`plugins/native/coding/src/materials.ts:45`。原父页与Coding都关来源，onMaterials会提前交全部引用、child可代按发送；Coding submit不读input.materials，steer合同不接材料，wait分支先创建Runtime Session/改标题/入队再保存材料选择。影响是用户重复进入私有材料选择，或看似选好却未给模型；仅翻sources开关还会越过本人发送边界。

处置已写：复用父页菜单、本人动作目录、现有材料owner读及Coding回执；引用只随本人底栏发送交回，含来源时拒child代发，框架直接来源/搜索HTTP仍403。正常开轮将本次引用与已保存选择按完整ref去重，不污染长期选择；补充三种模式共用owner读取与100000字符总上限，原话保留在原Runtime原件记录，读取失败不得写业务输入。wait入队前读取，真正开轮再读，标题允许平台来源合法1000字符。调用方同批采用现行schema；不另建材料账或读取兼容。

### QF-25 / P1：迟到回执只清正文，材料残留；失败序号可能指错选择

当前位置：`plugins/native/coding/src/browser/input-receipts.ts:133,148`、`browser/main/composer.ts:58`、`browser/main/mount-composer.ts:93`；平台 `packages/design-system/src/browser/composer-send.ts:32,76`。原重试身份未包含Run/材料，bubble确认后只清文本；混合选择的失败序号被当作长期数组序号。新增本次提交成功回调，owner真实Run或queued_inputs确认后由公共组件结算原快照，旧回调/旧HTTP回包不能结算新提交；显式重试签名包含目标/模式/文本/材料。失败按原提交引用映射回来源条或长期选择，删除直接清正文和恢复按钮自动代发；用户移除后由底栏正常发送。

本批真实验收还发现 detail 把已入队且无Run的会话写成idle（`routes-timeline.ts:187`），以及请求failed遮住仍在运行的模式/停止（`packages/plugin-sdk/src/ui/composer.ts:203,227`）。实现已改从原等待事实/独立running事实计算，实际 wait 排队与运行中失败模式切换均已通过；不增加业务状态字段。

已取得的局部证据：父页来源与安全回归20项通过（`/tmp/quality-audit-frame-source-acceptance1.log`）；公共composer原18项、Coding旧回执浏览器1项通过；后端固定版本/after-run、next-boundary、interrupt及拒绝的4项通过（`/tmp/quality-audit-composer-receipts-acceptance1.log`）。同日志新增测试中的菜单丢失、队列idle是产品发现，两个浏览器等待/选择器错误已修正测试；失败日志保留，不能记作全部通过。API快照两项、动作快照仅coding.runs.control@1输入变化。最终测试、资源预算、健康门禁与当前头CI仍待完成。

### QF-26 / P1：同一输入框重挂丢选择、断开提交与草稿身份

位置：`apps/workbench/src/browser/plugin-frame/composer-parent.ts` 的 options/make（原211行）每次 shape 变化新建 draft adapter；`packages/design-system/src/browser/composer-retained.ts:20` 以 adapter 对象为草稿身份。来源、附件或停止能力变化仍属于同一 child id，但材料和 revision 被分到另一份 retained 状态。旧结果与后来编辑不能再通过同一 revision 比较。

正常框架复现：仅等来源登记变化的首个测试曾通过，但尚未证明底栏实际重挂；增加旧 file input 已卸载的断言后，QEA-45 在原实现有效失败，原附件消失（`/tmp/quality-audit-frame-remount-baseline2.log`）。最小修复由 parent 保持当前 child id 的单个 draft adapter，shape 重画继续复用，真正 drop 才释放。第七次构建通过，实际重挂、旧 ack/普通回包和新文字/附件保留已随 frame 5/5通过（`/tmp/quality-audit-composer-receipts-acceptance3.log`），同批其他验收仍在继续。

材料验收纠偏：Coding 当前引用在开新轮时读最新内容是既有明确合同，更新 Todo 后拒绝的初始断言错误，已改为真实知识排除，补断言新轮确实取得更新正文。下一轮队列在活跃Run时按 RC-18/D31 不返回；诊断确认会话 GET 持续成功，未结算并非轮询停止。验收改为结束原轮再观察 owner 队列，不为测试改运行时合同或新增轮询。这些测试假设失败不计为产品缺陷。后端材料5/5、回执客户端8/8已通过；新浏览器混合选择恢复/响应丢失已在 required 日志3/3通过。

### QF-27 / P2：把本地控件当外部正文净化，恢复操作失去绑定

已复现位置：`plugins/native/coding/src/browser/main/composer.ts:91`；净化边界 `packages/plugin-sdk/src/browser.ts:259` 按明确的 inert 合同删除任意 data-coding 属性。真实材料先删除、再恢复健康长期选择、然后排除该长期材料，HTTP 正确返回 failed_materials；界面提示中可见按钮却没有绑定所需的属性，正常点击无路可走。诊断 `/tmp/quality-audit-material-recovery-diagnosis.log` 记录实际请求、失败与 DOM，不是只有静态字符串匹配。该材料恢复调用已改用本页公共 renderer 的逐字段转义输出；不放宽正文净化白名单，真实按钮与恶意格式标题回归已在 required 日志通过，未弱化净化边界。

六处本地renderer安装已迁移：`browser/main/configuration.ts`、`run-block.ts`、`browser/subagent-cards.ts`和`subagents.ts`。模型回复、报告、外部预览与diff正文仍沿原净化边界。环境卡的创建、更新、删除统一归`drawEnvironmentReadiness`，由当前末轮和目录事实推导；删除轮次模块重复匹配/安装，修复轮次先到导致重载后缺卡的隐式顺序依赖。按钮仍只准备草稿、切换明确意图或打开原面板，不代用户执行命令。

定向验收：`/tmp/quality-audit-coding-recovery-acceptance10.log` 两个真实浏览器场景通过。QEA-47覆盖新会话、结束轮次、切回/重载及三宽两主题的实际点击，保留草稿和真实Git冲突，无额外模型或命令。QEA-48由真实SDK派发两个子任务并耗尽额度，从主卡和侧栏分别扩额度；一次真实owner写入失败后预算不变且可重试，扩额度不自动执行；明确重试沿原模型及只读权限成功，原尝试历史和实际预算可重读，进度语义及外部正文净化保留。三宽两主题图已生成，1440浅色和390深色均实看；包必跑与最终门禁待完成。

排除项：SDK `continue`明确在同一子Session发起新尝试，不重绑已经归还的task-board步骤（当前`composition/core/runtime.d.ts:260–262`）；因此重试不再有board-read/report是现行合同，不按完整工具数组相等制造回归。原只读工具上限与冻结模型仍验证。原测试的模型配置、派发审批和活跃父轮次假设已纠正，不计产品缺陷。材料失败在卡片与底栏重复说明仍待同链收敛，控件恢复不代表QF-27全部体验问题关闭。

PF-02 新增正常入口证据：`/tmp/quality-audit-composer-required.log` 15文件全部通过，含 Coding 材料3项、安全17项、设计系统与HTML边界回归。Coding 的 `+` 只随当次发送交材料、原 `@` 仍选择工作区文件、下一轮不重复来源；混合长期/临时引用去重、真实 owner 删除/排除后准确移除且不自动重发；实际已受理响应被丢弃后，原轮结束、正常读取 owner 队列结算旧材料，保留后来输入，额外POST与模型调用均0。材料恢复的桌面浅色1440与手机深色390已实看，按钮可操作、无横向越界、HTML格式标题不成为元素。另记录本轮待收敛的重复提示：同次失败在材料卡和底栏重复说明，修复控件可用不代表该体验已简化。generic frame 的系统 `@` 入口与完整5项已通过（`/tmp/quality-audit-composer-frame-final.log`）；清理诊断后的 Coding3项中2项通过，混合材料项在创建会话的测试点击安装监听时耗尽30秒预算，尚未进入本项行为（`coding-materials-final.log`），保留记录并补跑三宽截图；完整包必跑、资源与最终头CI仍待完成。

### QF-28 / P1：重试遭拒不能证明上一次未知发送未受理

位置：`plugins/native/coding/src/browser/input-receipts.ts:109–133,149–151`；真实下游 `routes-sessions.ts:355` 先读取当前材料再交 `agent.inputs.send`，后者明确同 key 异文拒绝。当前材料变化可能使派生文本变化，撤回会在读取处拒绝；原客户端将这些明确拒绝直接清空 lost item，第三次点击便换新 key，已受理的原输入可能再排一条。读取失败只证明本次尝试未完成，不能推翻前次未知结果。

旧构建调用真实客户端工厂的 QEA-45 新用例有效失败：重试拒绝后 lost bubble 消失（期望1、实际undefined），原8项仍通过，日志 `/tmp/quality-audit-lost-retry-baseline.log`。最小修复保留相同意图原 key 与先前未知事实；首次拒绝照常恢复，成功或原 owner 可见后才结算，另给准确的重试提示。合入6359987103并构建后，实际 current 修改/排除→连续重试→原轮结束→一条队列及固定原件正文通过；同一文件5项237秒全部通过，见 `/tmp/quality-audit-main-635-acceptance.log`，其余组合验收继续进行。不新增材料正文缓存或键账；SDK虽有 knownInputKeys 查询，但它不能独自证明材料不同仍是同一请求，本项不为立即回执扩平台。

### QF-29 / P2：环境检查把读取失败投影成不存在或已就绪

已实现，定向验收通过；包必跑、主干整合与最终门禁待完成。原`plugins/native/coding/src/environment-prep.ts`的三段catch把Git、目录、工作树失败回退成空事实，`routes-sessions.ts`又把外层异常转null并缓存15秒。旧构建真实binary模板、超限package.json及损坏Git索引三项均误报ready（`/tmp/quality-audit-coding-environment-failure-baseline2.log`），无法告知用户环境是否真正读过。

处置：`environment-state.ts`统一后端与界面形状，失败仅有目录身份、检查时间和unavailable，不带伪造false/0/空数组；`environment-prep.ts`按实际公开outcome判断完整性，保留非Git、合法空目录和无HEAD语义，尾部取消/授权检查继续拒绝失效调用。`routes-sessions.ts:96`按原Promise身份删除失败缓存，不吞取消。`recovery-parts.ts`与`browser/main/click-round.ts`原位显示单个重新检查入口，复用正常state读取，不改变草稿或发送任务。不新增检查任务、权限、表或宿主专路。

验证：完整构建通过，API生成0差异；QEA-54三种真实读取失败及修复后立即恢复3/3通过（`/tmp/quality-audit-coding-environment-failure-acceptance.log`）；QEA-55实际Git/文件/工作树动作拒绝、截断目录、合法空/默认未创建/无HEAD目录及服务端已观察的HTTP取消5/5通过（`coding-environment-boundaries2.log`）。隔离Home正常新会话和已结束轮次、失败重试、修复恢复、草稿/模型调用不变及三宽两主题真实点击1/1通过（`coding-environment-failure-ui.log`）。未创建默认目录的首次夹具缺少正常Host的prepareDirectory端口，补齐夹具后通过，生产未加例外。只读复核无Blocker/P1；补测确认coding.state按项目串行；按真实队列验证失败后下次读取恢复并复用成功结果，边界最终6/6通过（`coding-environment-boundaries4.log`）。最初强制超越读取的测试超时属错误调度假设，未改生产调度或放宽原断言。当前health通过（`coding-environment-final-health.log`）；最终回归与资源批准仍需完成。

### QF-30 / P1：助理候选卡的决定未接 HTTP 断连控制

正常入口 `apps/workbench/src/scripts/client/assistant-island.ts:228` → `apps/local-host/src/assistant/assistant-http.ts:503` → `settleMemoryCandidate:599` → Memory公开动作。该分支提前返回，未走原有panelWrite取消控制；bindLocalWebActions没有signal，通用JSON body读取结束后的断连不传到写入。权限撤销检查仍在，但不能替代传输取消。旧构建 QEA-49 接受/拒绝两项均有效失败：实际服务端断连后接受仍产生正式记忆、accepted 变动与候选版本2；拒绝仍写 discarded 与版本2。日志 `/tmp/quality-audit-memory-candidate-baseline.log`（测试初名 assistant-memory-candidate-cancellation，现按同一安全测试入口命名 security-invariants-assistant-memory-candidates）。

最小修复已验收：在这一入口复用现有 responseAbortSignal，把同一signal交公共绑定与原Memory提交检查；不另建取消状态或写后回滚。接受/拒绝在提交前断连时candidate与正式版本/ledger均不新增，随后新请求正常恢复，并等待正常响应 close 后确认不会误取消。QEA-49 两项通过，连同原助理输入/记忆、Memory动作、local-web-actions与框架回归8文件96项全部通过（6.5分钟，`/tmp/quality-audit-memory-candidate-acceptance.log`）。完整构建 `/tmp/quality-audit-memory-candidate-build.log` 与健康门禁 `/tmp/quality-audit-health-boundary-split.log` 均退出0；门禁未改阈值或新增例外。当前头Full CI与页面资源验收仍待执行；本片通过不关闭QF-31或整体审查。

### QF-31 / P2：助理把候选读取故障显示成没有待处理事项

原 `apps/local-host/src/assistant/assistant-memory-bridge.ts:65` 将异常转成[]，`assistant-service.ts:181` 据此省略候选分区，页面无从区分空集合与暂时读不到。旧构建正常入口故障用例有效失败（期望null、实际undefined，`/tmp/quality-audit-memory-read-baseline.log`）。已让桥保留错误，聚合只将该分区投影为null，正常空继续省略；工作台显示原位重试、移除旧决定按钮，不把整个work伪造成失败。独立候选HTTP未知错误映射为固定通用说明，合法业务拒绝保留；原始诊断只经repeatingFailure记录无正文的错误类型/码及work_id，不暴露给用户。

`/tmp/quality-audit-memory-read-final.log` 中 QEA-50 已通过真实UI故障、失败重试、恢复候选、接受后Memory公开管理读回一个正式版本1/一条accepted变动、再次故障后恢复为空，草稿保留；六张三宽两主题图已生成，复核1440浅色与390深色。最初实操因把并发日志误定为固定两段而失败，测试已改为等待在途真实成功读取后检查稳定失败期不继续增长。该批6/7文件通过，唯一未通过是主脚本773行超过原770行限制；现按原片段装配方式把待处理分区整体归既有 assistant-side-path.ts 侧栏片段，主脚本降至739行；保留可静态展开的原装配和结构断言，阈值与门禁不改。最终侧栏归并构建退出0（/tmp/quality-audit-memory-sidepath-build.log），3文件23项复验全部通过（/tmp/quality-audit-memory-sidepath-acceptance.log），健康门禁退出0（/tmp/quality-audit-memory-sidepath-health.log）。三宽两主题图均生成，另已实看1024浅色：提示与单一重试完整可见、草稿未丢。中间新增独立片段因静态展开器不认识而使健康检查失败；最终复用已有侧栏片段，未改门禁映射、阈值或例外。公开API快照已更新，当前Full CI与资源审批仍待执行。

同链清理核对：原 `apps/local-host/src/memory/memory-host.ts:419,421` 两条相同GET pairs分支，后一条不可达；原 `assistant-memory-bridge.ts:73,79` 的accept/discard方法只有 `tests/assistant-memory.test.ts:328,332,339` 调用，正常卡片已迁Memory公开动作。QEA-53现已将原本人改写认可/拒绝后不重复建议测试迁到真实注册Memory动作并携带所见版本，删除两个旧桥方法和第二条不可达GET，业务断言保留。64df918968保存清理结果，构建与6文件44项通过（/tmp/quality-audit-memory-legacy-cleanup-build.log、/tmp/quality-audit-memory-legacy-cleanup-acceptance.log）。提交后健康检查发现新安全登记未按规定格式标测试标题，已修正引文格式；最终门禁退出0（/tmp/quality-audit-memory-legacy-cleanup-health2.log），不改门禁规则。

### PF-07 来源链复核与退役边界（只读结论，未实施）

补核 `source-pull-service.ts` → Host `plugin-source-pull-service.ts` / `source-pull-intent.ts` / `source-pull-runtime.ts` → RSS/YouTube 规则与 Search Runtime → Feed `runtime-source-pull.ts` / `source-sync.ts`。Feed 拥有来源/游标/重试及提交前配置复核，平台拥有实例身份、授权与取消、正文 hold 后写入和证据清理；RSS 的 DNS/固定地址、跨主机跳转限制、ETag/304 是实际网络边界，不能因精简重复逻辑删除。presentation 已有 IntegrationRegistry，不另建平台目录。

报告此前把 Alchemist 列作 sourcePull 消费者不准确，现已纠正：`apps/local-host/src/alchemist-service-host.ts:72` → `alchemist-search.ts:20` → 共享 Search Runtime；市场脉搏由 `plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.ts:140` 装配来源。Alchemist 保留自己的作业 lease/checkpoint，和 Feed 来源游标不是同一事实。复核未确认新的P1，也没有证据支持为退役工厂统一两套业务状态。

可退役对象：WebQuery 整包没有生产依赖入边；YouTube 保留包根 channel 工具及原包名，移除无调用的工厂与安装 Manifest。两包虽 private:true，旧工厂是 package exports 的包根导出，不能称为文件私有函数。YouTube 的真实 Host 调用在 source-vocabulary/source-pull-intent/source-pull-runtime，运行时依赖经 `apps/local-host/src/installer/npm-package.ts:29` 打入产物；移除 Manifest 必须同时调整 package.files，验实际产物仍能导入 channel。WebQuery 不在当前运行时依赖产物链。保留现行 Source 的 youtube_channel/web_query 数据和 SourcePullRequest，无需迁移用户来源。

实施前置已核实：`scripts/check-package-boundaries.mjs:247–274` 硬编码五个旧集成包的 Manifest/包文件/入口身份，退役需要精确移除这两个退役对象的检查，不能改成文件缺失就跳过。仓库要求门禁修改先获用户批准；先准备具体退役差异、包清单/锁文件/六个专属版本声明及生成物同步，再提交该规则调整供审阅。共享 schema/host/listener/signals 版本与仍使用的集成检查保留。BL-unused-integration-packages 此时仍未完成。

另有独立重复实现：Feed `source-request.ts:74` 生成的 intent 只用于本地指纹，`runtime-source-pull.ts:40` 的实际 pull 忽略它，Host 又生成一份；平台已有 sourcePull.plan。后续迁移实际消费者时，必须比较原 operation/key 指纹、终态重放及取消/引用回收，不能直接删掉本地检查。候选验收沿 Runtime Feed 的 YouTube 注册→实际拉取→同key重放、integration-registry/source-pull拒绝、RSS socket、AnySearch single owner及真实npm产物；目前只有静态证据，未宣称这些路径已验收。


### QF-32 / P1：仅有读取权限的候选查询会结算过期状态，期限也未使用原件事实

旧位置 `horizontal/memory/src/service.ts:659–673` 的 candidates query 按账注 created_at+14天调用 settleCandidate，写 SDK expired/version、操作marker和候选账注；`memory.candidates.list@1` 只有memory:read，Assistant聚合/独立列表和设置overview均到达该服务。SDK的manage-read不改候选state，因此分支真实可达；Assistant原服务有Host存活检查，问题不能误写成完全无控制。候选创建已保存min(正式期限,14天)，但查询忽略更短实际期限；到期pending还占提议去重和每工作三条额度。

旧构建4个有效反例均失败、原13项通过（`/tmp/quality-audit-candidate-expiry-baseline2.log`）：1天到期、精确14天仍显示；15天查询实际增加SDK版本及expired状态、operation和账注；未先打开列表时，过期同文仍拒绝新提议。第一轮反例只测精确期限，尚未到读中写分支；第二轮独立增加15天快照，才证明了实际副作用。

处置：SDK拥有期限/状态/版本；Memory query和propose复用实际期限判断，读取无写。`horizontal/memory/src/candidates.ts` 收回原件合读、条件结算和维护恢复，Service公共用例调用同一实现，主文件1269→1241行。原upkeep先处理候选独存及使用关闭的范围；固定候选expiry子操作，SDK先保留决定但终态未写时续原决定，已expired但账注仍pending时只补原投影。无新定时器、状态账或正式记忆变动计数。

角色候选独存没有正式owner，原upkeep只枚举正式owners，SDK本人管理也拒绝。现在维护合并原candidateOwners，Host仅为当前项目的本人management、candidate manage-read/delete认可该归属，target/before分别复核，不扩大正式记忆、accept/promote或模型读取。初次定向验收18/19通过，角色项揭示遗漏before围栏；修正后真实SDK的范围拒绝、读取纯度、额度释放、SDK保留决定后的实际SQLite写失败重启恢复及账注失败重启恢复，2文件42项均通过（`/tmp/quality-audit-candidate-expiry-acceptance2.log`）。完整构建2次退出0；正常HTTP/公开只读动作、实际服务器断连、维护取消/撤权后零追加写入及恢复，连同README必跑集合19文件209项全部通过（3分钟，`/tmp/quality-audit-candidate-expiry-required.log`）。两批合计21文件251项；健康检查初次仅要求登记缩小后的巨大单元实际尺寸，随后同步class 1110行/54方法→1081行/52方法、file 1270→1242，规则/阈值未改，第二次退出0（`/tmp/quality-audit-candidate-expiry-health2.log`）。本片已获本地工程及实际HTTP验收证据；当前头Full CI/跨批资源验收和整项逐包深查仍未完成。

本片不关闭角色候选的完整本人管理：没有正式owner时accept仍按原权限拒绝，已用反例保留该边界，如何接通完整认可归属另需沿真实角色入口确认。后台已开始的定时维护按原调度合同不可取消；这里验证的是受控手动维护，不新增调度承诺。

### QF-33 / P1 已修复、本地验收通过：配对查询替用户写入已处理决定，且忽略正式期限

位置：`horizontal/memory/src/service.ts:1092–1103`。公开`memory.pairs.list@1`只有读取权限，原pairs在一方缺失或非active时直接savePair(resolved)；重新启用后原冲突已永久隐藏，召回不再按pending冲突避让。正常HTTP写入两份真实SDK记忆→原upkeep形成配对→公开管理停用→只有memory:read的query，实际ledger由pending变resolved，反例有效失败（`/tmp/quality-audit-memory-pair-baseline2.log`）。首次测试从错误包根导入内部Host测试端口未启动，不算产品缺陷。

处置：查询只根据当前可读正式事实投影，不写配对。明确resolvePair拥有本人决定，已有Storage遗忘清理拥有删除后的配对回收（`memory-ledger-retention.ts:64–65`），不增加维护状态或任务。停用/启用/明确保留两条的召回效果、真实SDK读取故障和取消、成功删除清理两项已通过（`memory-management-acceptance.log`）。追加正式到期反例又证实meta仍active时，普通列表已投影disabled但pairs仍提供操作（`memory-pair-expiry-baseline.log`）；已复用现有isExpired按正式期限过滤，正常HTTP维护形成配对后的3项通过，原分页合同6项通过（`/tmp/quality-audit-memory-pair-final.log`）。分页管理页有意保留原始active并单独返回expired，设置界面按expired显示/续期；早期测试把普通list的disabled投影误套到分页，已按现行MEM-15合同修正，没有改生产分页语义。每对重复owner读取属于可优化成本，未为一行正确性修复新增跨请求缓存。

### QF-34 / P1 已修复、本地验收通过：文档保留的旧Memory写入口丢版本且未接本次取消

`apps/local-host/src/assistant/assistant-http.ts:490–499` 的memories/memory-prefs仍可达，`docs/system/CALL-CHAINS.md:291`和归档memory-system规格明确保留。现行设置已用`/api/memory/*`，模型工具另走受控memoryInvocation；未找到当前生产UI/插件/后台对旧HTTP的调用，但不能据此删公共端点。GET在mixed-input-originals仍有真实调用；旧POST的error-model测试只覆盖缺失对象和非法动作。

旧memories POST丢弃输入expected_version，Bridge.changeMemory直调service且无本次HTTP signal；GET的AssistantMemory投影也不带version。这和已修候选卡不是同一写分支，Host存活及SDK范围围栏仍存在。先用真实v1→v2和旧版本POST复现忽略确认，再暂停真实SDK提交、HTTP断连、放行核写入。保留路径的方向是GET给真实版本、POST经公共Memory动作保留原版本及信号；不得服务现读版本代替本人确认。未经动态验收不记完成。

旧memory-prefs有独立产品语义：MemoryPreferences.saveAssistantPrefs原子更新personal与project-default，现公共savePrefs写personal或具体project，不能用两次现动作冒充等价迁移。保留原主人的原子写入并核实际默认/覆写效果；不因“转发”命名删除有职责的协调，不新增第二份偏好事实。

QF-34真实反例：`/tmp/quality-audit-memory-management-baseline.log`七项均有效失败。正常保存v1→公开动作更新v2后，旧POST更新/停用/启用/删除全部返回200；GET无version。实际SDK更新等待及删除目标读取等待期间，服务端已观察HTTP断连后仍更新版本/流水或接受遗忘并删除。测试未伪造成功回执或生产结果；当前版本恢复、项目隔离与旧偏好默认/覆写已纳入后续验收。

主干4aa5496e3f已由b45f75bba1合入，完整构建通过。Coding README全部41文件加11个新增/共享消费者合计52文件全部通过（8.3分钟，`/tmp/quality-audit-coding-main-required.log`）。补强的原Session新Run/历史次数、原权限和冻结模型断言亦通过；环境失败390深色截图重取后已实看，提示和重试完整可见。此结果只关闭Coding该批包回归，不替代当前头Full CI/资源许可或整项逐包深查。

QF-34实现与证据：旧POST已迁memory.change并传原项目/版本/取消，GET投影正式version；删除Bridge.changeMemory及重复校验，原启停和失败后开轮用例迁真实注册动作。构建通过，API仅AssistantMemory增加version一项。最终定向9/9通过（`/tmp/quality-audit-memory-management-acceptance2.log`），项目隔离和偏好覆写保留；首次8/9中enable对已启用条目不会增加SDK版本，改用真实已停用v2验证重新启用，未改生产幂等语义。健康门禁通过（`/tmp/quality-audit-memory-management-health2.log`）；Host/Memory/合同必跑与相关消费者103文件全部通过：6文件定向证据加其余97文件（17.1分钟，`/tmp/quality-audit-memory-required.log`），未重复已有效通过的6文件；最终Full CI待完成。

### QF-35 / P1 已修复、本地验收通过：工作流迟到预览可能把A的内容交给B

`plugins/native/workflows/src/browser/handoff.ts:99–124`在等待preview/continue后不核导航身份；`click.ts:28–44`可打开另一实例，`nav.ts:88`只在打开成功时清handoff、不清旧busy。A回执把A正文放到共享handoff，后续表单经`root-events.ts:103`使用当前B实例；错误分支还重新打开旧实例。影响可能是目标内容错配，必须验证真实目标与handoff，不只断言标题。最小方向是原导航/实例/步骤约束所有迟到效果，沿已有navId实现，不改变owner写入合同。

### QF-36 / P1 已修复、本地验收通过：人工交接失败重载没有恢复冻结提交

`actions.ts:211–217`的preview重新读取源正文，`browser/handoff.ts:107`用input初始化；owner已有pending.output时`continuation.ts:40–42`正确拒绝不同正文。原人工改写后接收失败，重载再预览会进入内容冲突循环。preview本身读取当前源的合同正确，错误在于页面把它用于恢复已经接受的固定提交。恢复应来自当前owner的pending原提交，保留固定交接身份和幂等接收，不能删除pending或替换已发内容解锁。

### QF-37 / P1 已修复，定向通过：人工确认过程丢掉明确重试意图

`browser/click.ts:87`传retry:true，`handoff.ts:103–111`却只打开人工预览后返回；`root-events.ts:103`再提交未带该意图，最终`step-runner.ts:134–135`按结果未知拒绝。后端拒绝与显式重试合同应保留，修复页面意图随原实例、步骤、固定提交到达retry_action。验证真实首次已执行后报错及本人再次执行的目标次数。

### QF-38 / P2 已修复，定向通过：判断拦下仍提示交接成功

`browser/handoff.ts:115–119`无条件选下一站并提示交接/动作完成，实际continuation可以返回stopped且目标未执行。现有判断浏览器测试先从后台生成终态再打开，未覆盖这次点击的反馈。按返回实例当前步骤、handoff和停止事实反馈，验证零目标调用和无成功提示。上述四项已由下段正常入口反例确认，最终处置及验收见本节末。

Workflows动态证据：`/tmp/quality-audit-workflows-handoff-baseline2.log`中，B的实际handoff正文为A正文；迟到成功与真实CAS拒绝均把页面恢复为A；Pages真实接收已落一份文档、回答失败后重载，人工表单重新变为旧源正文；判断真实stopped且Pages零写，页面选中下一站。目录离开控制项通过。明确动作重试首次真实Shelf写入后丢回执，点击重试只完成preview却不出现表单/继续，实际请求完成断言进一步确认：仅preview已返回，目标次数仍为1，未派出带retry_action的continue（`/tmp/quality-audit-workflows-retry-baseline.log`）。第一轮6项夹具失败不作为产品证据。

Workflows首轮处置：`browser/nav.ts:setMode`清理离开页的临时等待/草稿；`handoff.ts:resumeRun`用原navId/实例约束预览、继续、重读、焦点和反馈，busy按原对象身份清理，切步骤使旧请求失效；继续失败读回真实owner，无pending才保留未受理草稿。pending直接展示原output并继续，无需重新改写/确认，明确retry_action到达原动作；成功提示以真实handoff、选中步骤以current为准。首轮8/9与null断言修正单项合计9项通过，18图已收集并实看代表状态；最终B在途交错、包回归、健康/资源及Full CI继续。AI型pending的模型可用性前置是相邻未验证变体，仍在本轮检查范围。

Workflows第二十五批本地验收：最终构建和健康门禁通过，README要求的23文件（含6个浏览器文件）全部通过，6.2分钟（`/tmp/quality-audit-workflows-handoff-required.log`）。补强的B仍等待时A的finally到达不解除B等待；18图已更新，去掉重复外框后的390深色待交接已复看。

QF-36扩展：`browser/state.ts:readyState`仍把原模型可用性当作已有pending的恢复条件。真实SDK已生成、Pages已写、原模型经设置HTTP停用后，继续按钮消失，反例有效失败（`workflows-pending-model-baseline2.log`）。当前站点检查保留，只有已经完成的准备条件按owner.pending跳过；真实交付进度不冒充重新生成。修复已构建，目标去重/原交接键/无新增模型请求及新实例仍需模型的验收在进行。

Workflows最终本地验收（2026-11-17）：最终构建通过；QEA-64真实SDK/配置/Pages恢复1文件通过（`/tmp/quality-audit-workflows-pending-model-acceptance.log`），随后同构建README必跑及交错23文件全部通过（6.2分钟，`/tmp/quality-audit-workflows-final-required.log`），共24文件。最终健康门禁通过（`/tmp/quality-audit-workflows-pending-model-health.log`）。18张三宽两主题图已刷新，root复看最新390深色pending：固定正文及继续按钮完整可见，没有重复准备说明。原目标仅一份、原交接键不变、模型请求不增加，新实例仍需模型。用户少重做一次人工预览/改写，后台继续由原owner决定幂等与未知结果；页面不再跨实例拥有迟到结果。当前头Full CI和整项逐包深查仍未完成。

QF-27反馈收敛（第二十七批）：旧构建新增正常入口断言有效复现重复retry（`material-feedback-baseline.log`）。SDK ComposerOutcome.failed以可选feedback:page明确已有恢复UI的归属，统一输入与框桥保留失败草稿/材料，普通错误和unknown保持；Coding只对当前会话已完整解释的材料失败采用。首版3文件30项、构建与健康通过，只读review无本片Blocker/P1。实看390深色后进一步删除材料卡内重复名称/原因长段及两语言失用词条，最终构建通过，130文件包回归进行中；新增同时失败场景在再次打开来源菜单的准备步骤超时，尚未到本次失败处理，待单独诊断，不能把首版通过当作最终全过。Skill固定答卷回放与隔离Home替身smoke3/3通过，不作为真实模型质量结论。

PF-07退役准备：已核真实注册builtin-integrations仅消费GitHub/Gmail/RSS工厂及Catalog，YouTube频道工具仍进入Host/npm产物。独立只读复核无阻塞退役的运行时P1；用户2026-11-17批准spec§28两处门禁改动，待当前回归完成后实施。另补实际采用证据：FeedSourceService的生产createRuntime仅见`plugins/native/feed/src/plugin.ts:129`，旧底层Host runtime注入仅存tests/fixtures/feed-assembly；Feed本地构造完整搜索intent再由Runtime忽略，平台sourcePull.plan/pull重建同一intent。后续迁移应让平台独有计划/指纹、取消/hold与受控读取，Feed继续拥有来源配置/游标/幂等run和写入，不移除真实网络/权限边界。该采用收敛尚未实施，工厂退役不等于PF-07全部完成。

第二十七批最终本地验收：构建、健康门禁通过；130文件运行129通过，唯一失败在新增混合失败场景的来源菜单准备步骤。补等待当前输入框/加号可操作后，最终整文件6/6通过，真实失败/草稿/删除恢复/模型次数断言保持。日志：`/tmp/quality-audit-material-feedback-required.log`、`material-feedback-final-ui.log`；另两份普通composer与框架证据有效，合计132文件有通过证据，不改写首轮失败。12张截图已生成，root实看390深色与1440浅色混合失败。共享合同仅新增可选反馈归属，不改变受理身份或未知结果；用户少看重复错误/重试，卡内亦不再重复各材料名称/原因。最终Full CI及新内容地址资源核准仍待完成。

PF-07工厂退役本地完成（2026-11-17）：按用户批准的边界删除WebQuery六文件及YouTube工厂/安装Manifest，保留频道工具原包名和真实Host/npm入边。唯一包登记同步为73包；删六个专用版本键、十六个carrier和两条失用签名例外，锁只删对应12行依赖。生成器与离线冻结安装通过；离线重算锁曾额外裁剪无关可选平台依赖，已保留原依赖解析，仅采用本批importer差异，再由frozen-lockfile验证。

构建通过；`retired-integrations-gates.log`129项通过，明确验证三个活跃集成缺Manifest及未声明安装文件均拒绝。`retired-integrations-required.log`12/12文件通过，含Runtime Feed实际YouTube频道登记/Atom拉取/正文留存/同键重放零追加抓取和写入，以及真实npm压缩包解压后通过原包名导入频道工具。公网响应为注入，不宣称真实公网/账号验收。健康门禁首次因未暂存删除、git文件清单仍包含旧Manifest失败；仅暂存删除后复验通过（`retired-integrations-health2.log`），没有第三处门禁变更。该清理让开发者少维护两套未接入安装生命周期、版本和签名；现有用户来源与数据不需操作或迁移。BL-unused-integration-packages实现可结清，最终头CI仍待；PF-07的Feed/Host计划重复另行推进，不随工厂退役关闭。

QF-39/QF-40动态确认：`/tmp/quality-audit-pages-ownership-baseline2.log`三项有效失败。真实发布409→正常GET恢复→本人改标题，另一写入者正文实际被原正文覆盖（有/无等待中输入均发生）；正常全局搜索选择B→真实GET等待期间编辑A→实际CAS保存拒绝，页面已切到B，A草稿不可见。没有伪造业务回执；第三项QF-41翻译另存仍待动态复现。

### QF-39 / P1：发布失败读回不能把旧正文配上新版本

位置：plugins/native/pages/src/browser/document.ts:170（publishPage）及editor.ts:adoptSaved/remember。正常发布等待期间另一窗口写入，真实409后catch把任意GET当成保存回执，只推进版本、不展示对应正文；本人下一次改标题实际覆盖另一窗口正文。pages-ownership-baseline2.log有/无后来输入两种实际SQLite反例。处置已实施：保存回执仍按本次draft采纳，恢复读取仅更新列表；当前原编辑代次且无后来输入才完整重画owner文稿，否则保留本人草稿和原版本。成本低，沿原CAS/owner事实，不加合并缓存或自动重试。QEA-69两种冲突及实际发布提交丢回执均通过。

### QF-40 / P1：目标读取期间的新输入必须先保存，再切换

位置：plugins/native/pages/src/browser/document.ts:206（select-item）、editor.ts:fillEditor、click.ts返回分支。原先GET前保存、GET后先切页，再异步补存A，实际拒绝后A草稿已不可见。现切换前再次等待当前草稿保存，每个等待后核原selectionSeq；返回/明确新选择先撤销旧导航资格。fillEditor不再承担离开文稿的后台补写，打开入口拥有保存与导航顺序。成本低；本人不必找回或重写刚才输入，失败留在原稿。QEA-70正常全局搜索、真实版本拒绝、成功保存、后续选择及返回交错已通过；明确重选补验随包回归。

### QF-41 / P1：翻译另存要保留候选与同一次创建身份

位置：plugins/native/pages/src/editor-ai.ts:39、browser/editor.ts的onCreateFromAi、browser/document.ts:132、editor-popup.ts:26。原候选调用void回调即关闭，真实SQL拒绝和提交成功丢回执均丢掉本人修改。处置：等待创建结果，进行中防重复点击；未知结果保留冻结正文/request_id，本人明确重试不再生成模型；明确未受理的输入错误可编辑后重试。创建POST成功与随后列表/原稿保存失败分开，后者不能释放创建身份；取消在每次导航等待后复核，不抢回页面。两条附加反例已复现旧候选取消后仍打开、同一次翻译生成第三篇文稿（pages-create-navigation-baseline.log），修复后通过。popup复用SDK placeOverlay在resize重新定位，监听随原transient释放，修复390宽重试按钮落在屏幕外。

规则与状态归Pages：候选面板拥有一次提交及导航意愿，owner拥有实际文稿与请求去重，框架不接管业务重试。成本中低，无数据库/动作合同变化。QEA-71覆盖真实拒绝、未知写入、后续4xx不误解锁、明确首次拒绝可编辑、取消/新候选、创建后导航失败、重试后保留其他写入者修改；13条Pages交错验收通过。模型正文是注入的本机回答，实际Host/Editor/SQLite路径运行，不宣称云端模型质量。6张三宽两主题截图已实看390深色和1440浅色，重试与取消均可见。用户少重跑模型、少重写候选、少清理重复文稿。

### QF-42 / P2：对象打开有两个执行者，平台会重新打开用户刚离开的对象

位置：apps/workbench/src/browser/plugin-frame/view.ts:9–34；公开说明packages/contracts/src/platform/dom-events.ts的select-item。frame先通知插件、又观察列表代点目标行；Pages读B/等A保存时本人返回，loadList出现B后平台再次clickB（pages-return-diagnosis.log明确记录实际click）。不是页面随机抖动或测试坐标问题。平台投递意图、插件执行自身保存/读取/导航，应有明确接管合同。

已补现有DOM事件的cancelable/preventDefault语义：完整处理方同步接管，框架不再代点；未接管的行驱动页继续原能力。14个迁移方：Pages、Risk、Issues、Alchemist、Shelf、灵光、Coding、Feed条目、Workflows、Todo（含batch）、Jelly、Schedule、Inbox、创作台installed open分支。各自只在原来能完整处理的分支接管，Goals仅创建对话框监听不迁。成本中，涉及公开文档/API与消费者回归；不用插件名称特判，也不新增跨框确认消息或第二套选择状态。PPT真实openRecord仍代点准确一行；Schedule真实openItem接管且零代点，原有/open标已读恰好一次。

Host侧tab-workspace-plugins.ts的jumpToRecord另有Feed来源、Characters/Sessions实际消费者，不等同当前frame分支，本批保留其职责；不据相似代码删除。既有真实消费者验收选用Risk直达、Shelf全局搜索/链接、Todo来源链、灵光直达编辑、签名插件Home对象、Coding对象标签、Feed条目标签、Workflows搜索/标签、Jelly跨插件打开等。当前279文件包要求/消费者集合的276文件正在回归，3文件同构建已有通过证据；尚不能写成全量通过或将14方均称正常搜索验收。Skill固定回放及隔离Home替身smoke通过，后者只证明接线。最终头Full CI与资源核准仍待完成。

BL复核补正：BL-record-gone-from-framed-plugins仍不能清理。当前context-child.ts:19和context.ts:62已转发的是item-unreadable（让助理不再把不可读对象当上下文）；tab-workspace.ts:141监听的record-gone（标签标已不在及退出入口）是另一份公开合同，框桥确实尚无对应通道。仓内唯一发送方仍是Goals document-client.ts:48；Pages等仅报item-unreadable。已有side-pane-workspace的窗格页转发与S-30拒绝测试证明的是同源工作台窗格，不等同不透明源插件框。原BL关于没有框内采用者的时点说明已过时，但缺口本身仍在；需要按框的可信身份报告，并从真实对象404验证，不可把403/网络故障一律标为删除。本次尚未动态验收，不标已修复。

QEA-72追加消费者：Issues与Alchemist分别通过真实Host创建→正常openPlugin/openItem链接→不透明frame→准确标题/原对象读回，均同步接管且零行代点，打开没有重建或改写对象（selection-direct-consumers.log两项通过）。这补足原有用例只覆盖失效对象/直接派发事件的不足，不冒充两者已覆盖真实全局搜索。

### QF-43 / P2：首次引导的两次启动绘制替换正在操作的欢迎区（已实施、定向通过）

正常首次进入→新journey创建/保存（`apps/workbench/src/scripts/context-onboarding.ts:601-607`）→材料恢复→启动最终绘制（`:779-785`）。restart内置render与调用方render共同维护展示顺序，快速进入语言问题后，晚到的第二次绘制替换cx-app内的欢迎区，影响焦点与连续操作。三次有目的验证定位到startup绘制栈；语言替换服务不承担该重绘。处置依据是事实由准备流程维护、可操作页面由入口完整准备后展示；删除restart的内置绘制，由两个真实调用方现有收尾负责。成本低；QEA-75/76待实施与验收，基线独立运行未完成。

### QF-44 / P1：来源已暂停后，等待中的Home持有回执仍放行正文写入（已实施、定向通过）

`plugins/native/feed/src/source-sync.ts:76-83`先登记run引用、await Home ledger，却未在等待后复查Feed来源；`apps/local-host/src/plugin-source-pull-service.ts:61-63`随后写正文，平台检查的调用身份仍有效。真实Runtime同步→Home真实写账后持有回执→正常Feed enabled动作暂停→放行：最终sync拒绝、Item与完成流水为0，但正文从不存在变为存在（`/tmp/quality-audit-feed-hold-baseline.log`）。处置：Feed在hold返回前复查原guard，平台继续负责调用身份，保留已登记引用用于恢复/清理。与PF-07合同迁移同批修复，不给平台添加Feed特判；QEA-74覆盖恢复与实际正文状态。

### QF-45 / P2：过期材料重新开始失败后，没有错误且按钮无法再按（已实施、定向通过）

`apps/workbench/src/scripts/context-onboarding.ts:745-747`手动禁用按钮，finally只render；`:403-409`缓存HTML相同就跳过绘制，无法恢复手动修改的disabled。`:385`的reselect视图未显示本次error。正常按钮→真实SQLite拒绝→HTTP400后，busy=false、按钮仍禁用、当前错误缺席；用户必须刷新才能再试。正常创建对照通过。拟将临时禁用在原finally配对恢复，再由视图决定最终状态，并以现有errorLine展示失败。属于页面行为与绘制缓存的职责问题，不新增持久状态/重试器。QEA-76最终验收待完成。

### QF-46 / P2：Git前一个文件的迟到审查回执隐藏后来文件的操作（已实施，本地验收通过）

`plugins/native/git/src/browser/diff.ts:74-93`的prepareIndex只核工作区generation；返回/切文件只改变ticket，旧回执仍写共享action.hidden和diffNotice。正常独立Git与Coding嵌入入口：文件A发起暂存审查→持有真实成功回执→返回列表→打开B→释放A，B标题仍正确但暂存按钮被隐藏（`/tmp/quality-audit-git-result-owner-baseline2.log`，两个消费者均复现）。没有批准、index未变。处置：展示反馈绑定原结果选择；后台审查事实仍保留，明确打开原结果可查看。随QF-23统一Git主结果区域归属和迟到读写验收，不在Host按插件特判。成本中，QEA-78已实施；最终冻结头11文件109项通过，当前头CI另验。

PF-05再次核对：`packages/contracts/src/platform/settings.ts:58`仍明确无仓内设置声明owner，SDK `sandbox-agent-declarations.ts:51`仍拒绝签名包的未接通设置。`BL-settings-sandbox-execution`记录的是尚缺安装私有库内同步owner事务/持久回执，路线书38-1负责现有配置采用，44-6负责公共设置呈现；它们不是重复或已完成BL，不能因为合同/SDK单测存在而清理。需要先选真实owner设置迁移、保留同事务CAS/回执/回读与撤权，再核签包执行，未用本轮审查替代该产品实现。


### 第三十一/三十二批结果：Feed 合同归属与引导恢复

`plugins/native/feed/src/source-sync.ts:31` 直接取得平台 plan 的指纹，等待后核原来源，再按原运行键决定重放/执行；`:80` 在run命名和Home hold之后复核来源，阻止暂停、改配置、删除、取消或撤权后正文迟到写入（QF-44 / P1）。来源配置与运行/CAS归Feed，计划/预算/网络/正文归平台；移除runtime-source-pull适配器、重复intent/字段转换/引用集合及空shutdown。`source-request.ts`只转换公开请求，去掉Feed两项SEL依赖；旧Host有实际测试调用的runtime保留。用户暂停后不再落下不该新增的正文，明确重试沿原身份恢复；系统少维护一份计划和两份可用性集合。退役materials_v1门禁条目待用户批准，未擅改。

`apps/workbench/src/scripts/context-onboarding.ts:601` 删除restart内绘制，首次准备完成后只展示一次可操作问题（QF-43 / P2）；`:747` 配对恢复操作按钮，`:385` reselect展示本次错误（QF-45 / P2）。保存失败后用户可直接重试，不必刷新或重新找入口；页面少承担中途绘制和依赖HTML缓存碰巧重建按钮的隐式顺序。

最终生产构建、API和健康门禁通过；Feed来源/并发/权限/实际Runtime七文件155项通过，新增custom RSS hold四种交错、plan六种交错、暂停hold及真实web query共12项通过。测试只控制网络/DNS/TLS响应，真实Runtime/Host/引用账/SQLite/正文存储执行，未声称公网可达。onboarding16项和Feed反馈3项通过，QEA-76两项补验及6张三宽两主题图通过；已实看390深色。日志分别为feed-public-acceptance、feed-hold-network、onboarding-feed-ui和onboarding-refusal-views。custom RSS首版夹具误用fetch导致四项超时，现改测实际通道，不算产品故障；全Runtime/network及包必跑尚在执行。

### QF-47 / P1：未打包生成插件的恢复顺序阻断无关插件启动（已实施、定向通过）

位置：`apps/local-host/src/surface-installation.ts:71-96`；实际正常安装链`plugins/native/plugin-builder/src/agent-workflow.ts:757` → `apps/local-host/src/plugin-builder/studio-ports.ts:113` → `installed-plugin-lifecycle.ts:154`，重启由`installed-plugin-host.ts:144`恢复。未打包生成插件在恢复reader前已有安装事实，声明目录对该无关项直接抛错；Feed仅引用自身呈现动作也因此启动失败、缺后台wake。两次Home启动的SYS-15原断言稳定失败，诊断确认Feed监督器declaration_invalid且无数据库拒绝；没有用加等待或捏造archive替代修复。处置为只承认实际可证明动作，缺声明项不冒充可用；真实引用缺失仍拒绝，且已装同ID覆盖pending的规则保留。低成本，纳入本轮QEA-81/82并验证安装/信任/包零新增及原安全套件。

PF-03 补正：`specs/backlog/BL-memory-session-kinds.md`已有用户2026-11-12的明确延后决定，触发条件是第三个真实会话记忆消费者。实际Coding/Assistant绑定通过各自公开reader，无直接跨表读取；形成前后核来源与SDK写围栏有真实职责。保留该已批例外和BL，不报已通用化，不为猜想第三消费者新增架构。未来迁移除公开绑定类型/Host映射外，还涉及`horizontal/memory/src/session-clear.ts`的持久恢复计划，须按合同整体处理。其他未获延后决定的PF候选不适用此例外。

第三十一批补验结束：完整 feed-runtime-plugin 75/75、AnySearch唯一owner 4/4、RSS真实TLS安全4/4，共3文件83项通过（`/tmp/quality-audit-feed-runtime-network-final.log`）。自定义RSS与web query真实消费覆盖已取得，包必跑205文件尚未执行。


QF-47本地实现已验证：surface-installation只在非pinned且无精确声明时贡献空动作，完整目录及pending遮盖规则保持；原安装恢复40项及新增正常lifecycle恢复通过，后者明确开启可选平台调用权限后原数据/定时/Feed wake全部成立。SCS-16整文件11项通过，包括缺失引用及同ID pending拒绝、真实安装/pin/包零新增；无新生产导出。测试首版Home unsigned/签名标签和缺可选授权被正确拒绝，修正夹具后通过，不算产品缺陷。日志surface-build、surface-acceptance、surface-targets-final、surface-refusals-final分别保留结果，最终健康与CI仍独立核对。

2026-11-17最新主干a717e44284（#2105第39批，959文件）已fetch。当前固定29f6d1383e的205文件回归继续；根主线准备整合，审查/授权/SDK及真实入口交集纳入QEA-83。此前“最新主干4aa”及包清单为历史检查点，未将旧头验收挪作新头证据；原六方向目标不变。

QF-47最终健康门禁退出0（`/tmp/quality-audit-surface-health-final.log`），测试内部导入违规已消除，未放宽规则。

PF-04 进一步沿实际入口核对：`context-onboarding-actions.ts:40` 的 start 是 Home scope，`context-onboarding-service.ts:60–64` 的 running/controllers 只是单宿主执行与取消索引，持久事实由 ContextJourneyStore 保存；`readContextJourney` 对重启后失去执行者的 reading/adopting 转为可继续的失败。`web-context-onboarding.ts:24` 的正常入口通过 latestIncomplete 提供续办。现行 `home-aggregate.ts:57` 仅枚举 openProjects，`contracts/services/mainline.ts:34` 的任务行必须有 project_id；项目尚未创建的整理不会因多声明一个项目 provider 就被发现。故原“接 background_tasks/reports_to 即可”的表述不足：该候选须补 Home scope 的发现、归属及目标定位，再让 Onboarding 按原旅程事实投影，禁止借假项目、复制 phase 或给聚合器加 Onboarding 名单。用户影响是离开引导后少一个统一任务入口，并非整理停止或记录丢失；本轮已修的重选/失败恢复与它分别验收。BL-107（Home 引导接续）和 BL-work-line-background-provider-gaps（Alchemist/平台后台作业）不是重复项，仍有不同生产 owner 与 scope 缺口，不可一并清理。PF-05 同样保留已明确后续的沙箱 owner 事务执行要求，不能把当前入口拒绝当作过度防御删除。

**QF-50/P1 已实施、定向通过：自动观测把本地只读操作变成钥匙串访问。** 入口是 `tests/secret-store-keychain-retry.test.ts:198–233` 的真实 Host/HTTP/新鲜 MCP Functions list/describe。在 `project-host.ts:565` close 时，`horizontal/observation/src/writer.ts:156` 解析证据，`keys.ts:30` 主动创建摘要密钥，`packages/storage/src/adapters/file-secret-store.ts:688` 开原密钥库，触发 Keychain；3进程各一次。临时仅写调用栈证实此链，已移除注入，没有记录参数或密钥。不是本地 Functions 业务需要凭据。处置按 spec §39 提供 Storage 原事实源上的非交互访问给自动采集，按现有缺失合同保留元数据；显式业务/证据解封仍正常请求凭据。摘要不可得时 writer 的 coalesce 不能用空摘要误并不同输入，须配对验证。自动采集不得创建替代 key、绕过 HMAC、污染真实钥匙串失败缓存。

第三十三批 Git 实施结果（QF-23/46，本地最终包验收通过）：`plugins/native/git/src/ui.ts` 将原冲突编辑、磁盘对照及草稿错误/重试移入现有 result；Git 与 Coding 实际挂载共用客户端。`browser/result-selection.ts` 一份选择管理 diff/conflict/history/review，替代 displayed/preparing/conflictPath 及分散 ticket；目录 generation 只管目录读取。prepareIndex 的 ready/waiting/review 由可辨识类型约束，waiting/review 必有 operationId，review 必有 reviewId，未知回执显式重试用原 ID，已知审查的显示失败只读。`results.ts` 的列表应用保留当前选择，save 按原工作区和审查结算，错误不串到后来行；`source.ts` 读取实际 owner 回执后反馈与清草稿，不以通知状态冒充成功。离开/隐藏统一收起主结果，重新进入可正常选文件、重开固定 diff 与保存的草稿；同目录 refresh 不等于离开。

真实入口当前22/22通过（`/tmp/quality-audit-git-result-acceptance.log`）：两个入口各覆盖旧成功/失败、同ID重试只留一条待审且批准后实际暂存；历史读取/保存有真实交错与固定成果回读；拒绝、磁盘变化、后写草稿、缓存读失败重试及成功清理保留。两入口三宽两主题12截图已生成，root实看1440浅色Git与390深色Coding的原稿/当前磁盘/动作。第二轮20/22中的两个失败为测试误把未解决冲突文件当作可暂存diff，生产按原合同拒绝；夹具先结束原合并再建立普通改动，最终两项正常导航已过。原必跑列表及新增已知review展示失败用例仍在跑，不以22项当整批/整项验收。

Git 收尾复核的两个窗口已以正常入口动态证实并修复：打开历史再返回的目录选择不复用 null，设为输出成功后的回调再次核原选择。基线4/4失败，修复后4/4通过（`/tmp/quality-audit-git-final-windows-fixed.log`），原审查依然仅一条且批准后实际提交；权限回执不再额外准备B的审查，也不重开A。第五次完整构建和最终健康门禁通过（`/tmp/quality-audit-git-result-build5.log`、`/tmp/quality-audit-git-result-health-final.log`）。此前11文件105项全过是尾部修复前的证据；最终固定 `ff006e19f0` 已重跑11文件109项全过，日志 `/tmp/quality-audit-git-frozen-acceptance.log`。资源与最终整合头CI仍独立核对。

第三十八批QEA-87：完整构建通过，认可栏与工作事件真实入口2文件7项通过（`/tmp/quality-audit-acceptance-text-ui.log`）。实际requirements/decide/read验证长要求、含连续长路径的退回理由及保存后的历史；1440中文/390英文均检查正文真实换行、字形范围不被元素裁切、原认可/退回/改要求与按钮触达。核验observed从title移到已有说明行直接显示，既有机器/本人状态不变。root实看1440首屏及390长理由/展开历史截图：用户不必进入编辑或依赖悬停才能读完整依据。机器检查证据仍为受控种子，只证明页面与决定写入，不冒称真实外部工程检查。最终资源/共享核心CI仍待完成。

QEA-88/89 本地结果：完整构建通过；10个相关文件合计73项已有通过证据。首轮9/10文件通过，新增真实Host解封用例误用本人的页面query，其结果按OCL-11只保摘要，断言被正确拒绝；改用真实MCP读取产生密文、本人公开evidence.get解封后，密钥文件整文件14/14通过（`/tmp/quality-audit-key-host-recovery.log`），其余9文件59项原通过结果保留（`/tmp/quality-audit-passive-key-acceptance.log`）。三个新鲜MCP进程的6条记录各自保留、零security访问；实际Functions调用失败仅一次原钥匙访问；同进程显式解封后新记录恢复加密，旧missing记录不改写。env/file/keychain三种原backend、无替代钥匙、用途/跨项目拒绝均已验。未知摘要误合并的旧构建反例1≠2已转通过（`/tmp/quality-audit-observation-digest-baseline.log`）。公开API生成无差异（Storage不在contracts/SDK快照范围）；健康、包要求剩余与最终CI分别结算。

QF-50最终健康门禁退出0（`/tmp/quality-audit-passive-key-health.log`），无门禁阈值调整；完整包要求和最终Full CI继续。

### QF-51 / P1：批量更新普通判断反复扫描无关目录，宿主持续阻塞（修复验收中）

现行基线 `ff006e19f0` 经 `tests/inbox-evaluate-reads.e2e.test.ts:77` 正常20条更新复现：CDP等待18.6秒，Host事件循环active18591ms/idle0、CPU15051ms，日志 `/tmp/quality-audit-inbox-performance-baseline.log`。固定规则不含模型耗时；同机竞争未排除，不能将一次样本称稳定p50，但此进程自身连续占用已证实。旧BL-inbox-update-blocks-host仍有实际依据。

代码链：Inbox `scene-runtime.ts:112` 写判断前校验 → Host `local-host-scenes.ts:51,118` 场景检查/初始绑定 → Kernel `action-service.ts:260,278,498` 已知场景兼容性与usages → 全目录可用性；Host `local-host-availability.ts:132` 依赖绑定也原先枚举所有场景。Inbox `scenes.ts:4` 是固定结果场景，只有 Kernel `actionSceneCompatibilityReason` 的 subject-offers 分支真正消费整个推荐目录。新增正常Kernel调用反例证明无关provider可用性被问4次（`/tmp/quality-audit-scene-cost-baseline.log`，4≠0）。

处置：Kernel普通场景现读已知判断和实际依赖；Host按已知场景引用先选择再运行availability/bindings，普通usages只投影实际绑定，offers继续核完整授权目录。事实仍归原注册表/插件绑定，Host策略仍现读；不缓存跨等待授权、不放宽超时、不改变判断账与事件归属。场景投影没有注册所有权，移为同文件函数，ActionService实测从474行/25方法降至468/24；仅同步缩小登记，不调阈值。代价中，跨Kernel与Host；用户少等整台宿主失去响应，代码少为无关插件重复读取可用性。

完整构建通过，只读复核未见新增Blocker/P1；10文件真实消费者/拒绝/UI回归进行中。QEA-90/91及实际回读为本批验收，不能只凭调用数下降关闭BL，也不能据此宣称BL-943双Goal窗格预算满足。

QF-50冻结头d7d146a2da包要求续跑已通过8/86文件（Home升级81项、进程删除16项、Runtime HTTP27项、维护12项、项目删除20项、删除hooks11项、Feed授权22项、维护安全9项），随后主动SIGINT释放本任务机器槽，让当前Inbox性能定位先运行；子进程均已退出。78个剩余文件未完成，日志 `/tmp/quality-audit-key-required.log`，不记全绿，后续组合头按影响面补验。

QF-51追加根因与处置：收窄目录后CPU采样仍指向项目归属/常开插件的现读链，整批本地结果连续占用微任务；不跨等待缓存这些授权。在Inbox原批读与逐项判断之间让出事件循环，整批输入仍先验证，原提交前复核保留。QEA-91旧构建反例稳定出现“Missing expected rejection”：取消排入事件循环后整批先跑完；修复后实际Host仅保留第一条账本，剩余重试各一条，三条对应事件各一次。QEA-90真实20条页面新增同Host `/health` 请求，已确认在第20条前返回，建议及完成提示顺序和单次重读保持；完整17文件仍在验。首轮BRC-05八种业务/目录预算均过，额外discover反证已正确拒绝，但断言仍匹配旧错误文字而失败；只同步该精确文字，保留受控额外读取与预算断言，整文件待复验。只读复核新增部分无Blocker/P1；不据单次HTTP响应宣称最大延迟已达标。

第四十批定向检查点已通过：17文件153项有通过证据（BRC精确报错文字修正后5/5，额外调用反证保留），完整构建/API零差异/健康通过。最新真实20条五样本中，另一个HTTP请求都在4/20条时返回，最大事件循环延迟1.09–2.65秒；但总耗时p50为22.6秒，且每批出现6–8次Goals刷新。`apps/workbench/src/scripts/client/initialization.ts:460`把非Goals舞台的全平台cursor变化转为Goals刷新，`refresh-decisions.ts:128`再读取全平台cursor；Inbox原历史事件也触发它。原连续占用遮住了这部分重复工作，故**不能宣称QF-51或BL-inbox-update-blocks-host已完成**。继续追实际Goals投影依赖及当前可见性，保留已验证的取消/写入与目录收敛，不靠放宽时限或暂停其他工作掩盖总成本。

### QF-52 / P1–P2：Skill 草稿恢复与回放事实失配（第45批本地定向通过）

入口及归属：Assistant 工作中的公开草稿动作、本人能力包页和 `/api/plugin-trust/skills/drafts/adopt` → Host Agent definitions → `SkillDraftStore`；采用继续经原签名/安装服务，正式正文和版本不写回草稿历史。最新主干 #2107 的这条真实链纳入原六方向，未把已有 BL 或主干测试通过当作无缺陷依据。

| 发现与位置 | 用户影响与处置依据 | 本次处置 |
| --- | --- | --- |
| `apps/workbench/src/browser/kit/draft-turns.ts:106`、`writing.ts:99` 忽略保存失败或直接清编辑区；`draft-editing.ts:113` 只认正在保存 | 保存失败后关闭/新建丢输入，用户被迫重写；原“不增加离开确认”的承诺须以内容已保存为前提 | `flush`绑定原编辑对象，离开核成功；未保存的失败仍保护窗口关闭，不加自动重试和新确认 |
| `draft-turns.ts:69` 迟到采用回执清当前界面；冲突后读新draft但仍保留旧fields | 旧操作关闭后来新建的草稿；下一次输入可能以他人的新版本号覆盖其正文 | 结果只更新原对象；`draft-editing.ts:75` 刷新案例/回放时核原revision，不前移本地编辑基线 |
| `apps/local-host/src/agent-definitions/skill-workshop.ts:319`、`skill-drafts.ts:186` 只核草稿修订/案例存在 | 等模型时更换已知答案，旧结果可冒作新答案的有效回放并解除采用门 | 在原存储事务比较模型实际使用的任务/材料/答案；拒旧结果，不写trial，其余案例无需重跑 |
| `apps/local-host/src/skill-authoring.ts:172` 检查所有保留回放的差异 | 最新已匹配仍再次确认，界面反馈与采用行为不一致 | 每条当前案例取最近有效回放；其他案例仍不同则仍确认 |
| `skill-drafts.ts:198` 原全草稿只留最近5次 | 反复试一条会挤掉另一条已过结果，要求无关重跑 | 原表每案例保留最近结果；最多案例数仍由原合同约束，无新表/状态/版本 |

证据：旧浏览器两条丢输入反证均失败，`/tmp/quality-audit-skill-save-baseline.log`；旧后端错收回放与历史差异两条失败，`/tmp/quality-audit-skill-replay-baseline.log`；旧保留策略真实Host反证要求重跑另一条，`/tmp/quality-audit-skill-retention-baseline.log`。修复后完整构建通过，10文件81项全过（`/tmp/quality-audit-skill-recovery-acceptance.log`），包括4项新增浏览器、3项新增Host交错/恢复及原完整创作、权限/签名、存储基线、Memory真实owner消费者。实际采用回执是在Host成功安装后延迟返回，第二份草稿的文本与真实保存仍保留；并发修订用另一真实HTTP写入，拒绝后回读对方正文与修订均未变。

边界：模型替身只证明调度、事实绑定、采用门和存储恢复，不证明模型质量。真实签名安装、HTTP与浏览器路径已经运行；本人验收没有代签。采用等待中其他入口或已开始的并发 revise 更新同一草稿后被清理的独立风险，仍在构造真实交错，不冒称由本批解决。设置遮罩缓存/深链消费还需继续核，不能把页内离开测试扩称所有导航均通过。

新增 BL 对照：`BL-b42-acceptance` 保留用户本人/真实模型验收；`BL-b42-followups` 不整项关闭。①用量应由HostCompleteText与现有Observation统一补平台合同，实际调用方为起草、修订、回放、信息动作，不在Skill另造账；②组合失败提示随词包变更合并处理；③深链消费应回到设置地址owner，包含Home回执；④页签/开关应复用现有设计系统并补id/子路径合同，不新建Skill专用组件库；⑤两份草稿覆盖现行政策已明记后续，不能与同一草稿并发丢修订混为一谈；⑥删除后仍可读/放弃的草稿有保留用户内容的职责，不能当死代码删除。①③④继续按本任务平台化方向审查并裁决批次，待实际实施/验收后才更新BL状态。

第45批补充结算：只读复核指出本次close→reload新增等待可接收新输入，正常浏览器反证确实失败；现保存成功后同步收起编辑器，再刷新当前目录。6项新增UI最终全过（`/tmp/quality-audit-skill-close-final.log`），原完整创作UI在最终生产实现上另过1项（`/tmp/quality-audit-skill-close-acceptance.log`），与先前未改后端的76项组成10文件83项。中途测试曾在目录实际重画期间点击旧节点失败，现等待该节点被真实刷新替换且新正文仍在，再严格点击；未改点击工具、时限或产品语义。保存中的后续输入实存两次修订，回退未存改动后安全离开不覆盖另一入口。API重新生成0差异。实际查看1440回放与390深色编辑截图，原布局保持；截图在已忽略的 `.impeccable/qa/review/skill-authoring/`，不代表模型质量或本人验收。

第45批最终健康门禁通过（`/tmp/quality-audit-skill-close-health-final.log`），门禁未放宽；前次仅报告中的BL简称无法解析，已改为真实条目全名后重验。第46批继续处理采用期间的写入生命周期，另发现案例写入与回放清理尚非同事务，须以实际SQL失败反证处理。

### QF-53 / P1：采用旧快照后删除已经成功的新修订（第46批验收中）

真实入口为两个项目的本人HTTP与已开始的模型修订，目标是同一Home草稿。`apps/local-host/src/skill-authoring.ts:175` 原先读取r1后等待签名/安装，随后`SkillDraftStore.adopted`无条件清草稿。Skills登记在项目system provider，实际走ProjectLine；同一Home的两个项目不共享这个排队事实，concurrent revise/trial的尾写也可穿过等待。反证在实际Home新装前、安装后返回前两处持有：采用200、revise200、另一项目update200，读到草稿r3，采用完成后404（`/tmp/quality-audit-skill-owner-baseline.log`）。这不是两份草稿覆盖政策，而是成功回执对应的用户修改被删除。

处置：`apps/local-host/src/agent-definitions/skill-drafts.ts:82` 在原单Home store 内只占用正在采用的draft，从首个await前到原安装返回及同步adopted事务结束；失败/取消finally释放。update、discard/restore、案例增改删、trial尾写和二次adopt在原写点拒绝，普通读及其他draft继续。`packages/contracts/src/services/skills.ts:569` 声明 `skills.draft_adopting`（既有conflict分类），给准确的进行中原因，页面不误说成版本已经被他人修改。API仅新增此错误码。原安装授权、回滚和发布者检查保留，没有把领域CAS塞进安装后的授权尾检，没有另建持久状态、队列或自动重试。

定向证据：新装前/后与实际换版回执通过，期间模型及另一项目写入409，正式版本仅1或2、草稿仅结算一次。失败用例覆盖每个上述写入口、等待中的trial、另一个draft正常保存，原案例与trial保持，明确恢复后安装一次。真实HTTP请求取消发生在安装前，原草稿/版本保持，随后编辑和采用正常；日志 `quality-audit-skill-adoption-recovery.log`（4项）、`quality-audit-skill-adoption-cancel.log`（1项）。不把这个进程内生命周期称作跨包安装与草稿存储的崩溃原子事务；安装实际提交后的独立故障/恢复仍需另核。当前更广16文件验收在跑，整项未完成。

### QF-54 / P1、P2：案例写入与回放清理半次成功，以及改标题强迫重跑（第46批验收中）

`apps/local-host/src/agent-definitions/skill-drafts.ts:181` 原putCase先提交答案、再删trial；removeCase同样两次独立提交。通过Storage公开连接在原表注入清理拒绝trigger后，公开动作报错但新答案已存在，或案例已被删；旧trial仍存且revision没变。前者会把旧匹配当新答案的采用依据，后者回报失败却已删除并遗留界面结果。反证的两个实际状态差异见 `quality-audit-skill-owner-baseline.log`，不是虚构无await两句之间的普通取消。

处置：复用原store事务，让案例写入和相关trial清理一起提交/回滚。`sameCaseInput`（:71）统一模型实际使用的task/material/expected，与recordTrial写入检查同口径；title仅作界面识别，改名保留有效回放。第三条旧反证显示改名后trial_id消失，修复后仍为同一记录且模型调用数不增加。SQL故障后案例、trial、修订均不变；去掉故障后明确重试成功，新答案需要重新回放才能采用，删除则一次结算。三条QEA-106及原Skill流程通过（`quality-audit-skill-owner-focused.log`）；不增加库结构、兼容reader或独立恢复账。

### QF-55 / P1：案例的可写状态与数量只在等待前判断（第46批本地定向通过）

`SkillWorkshop.putCase`原先open/数量检查后等待dispatcher的beforeEffect，`SkillDraftStore.putCase`新增分支不再核草稿事实。正常公共ActionClient在原owner已读草稿后持有最终授权等待，另一项目依次真实采用、放弃或写入第五条；旧实现仍返回成功，前两种各留1条不应写的case，第三种实际存6条（`/tmp/quality-audit-skill-late-case-baseline.log`）。不是向handler输入伪造beforeEffect，也没有替换业务处理器。

现 `apps/local-host/src/agent-definitions/skill-drafts.ts:181` 在原事务内核草稿仍存在且未放弃、读取当前数量再插入；`skill-workshop.ts:249` 删除等待前数量检查，输入文本与调用范围验证仍留真实边界。removeCase同样在写入事务核草稿可编辑，已放弃的内容留待用户恢复/清理。四项QEA-107覆盖采用后孤儿、放弃后新增、第六条与放弃后迟到删除，实际owner记录和错误码均核对。

第46批定向结算：完整构建通过；16文件185项先通过（`/tmp/quality-audit-skill-owner-acceptance.log`），增加QEA-107及修复后，受影响3文件33项补过（`/tmp/quality-audit-skill-owner-final.log`），组合覆盖16文件189项。含正常Skill完整UI、6项UI恢复、Home真实安装/升级、签名/权限、Runtime回滚、实际HTTP取消、所有草稿写入口、SQL拒绝及明确重试。API只新增`skills.draft_adopting`错误码（现有conflict分类），无库结构、状态枚举或动作输入输出变更。只读复核先指出两处缺口，均取得反证并修复；末次窄复核无新增Blocker/P1。最终健康、整合头CI、资源与原QF-51性能继续，不能据此关闭整项。

第46批最终健康通过：`/tmp/quality-audit-skill-owner-health-tracked.log`，新增生命周期测试已纳入索引。初次门禁指出第45批测试里的两次双重强转，现由同一个泛型HTTP助手正确声明各响应类型；不改测试运行、不放宽门禁。所有本次模型/安装等待在Home fixture之前注册清理，正常、失败与取消都释放；原finally仍等待请求结算。

### QF-56 / P1–P2：设置页地址和缓存寿命失配，旧草稿读取覆盖新输入

下表源码位置均相对 `apps/workbench/src/`。

真实链为草稿回执链接/工作台设置分类/前进后退 → Settings 缓存与地址端口 → Kit 初始化、草稿编辑 → 原草稿动作和 SQLite → 原编辑器的保存反馈。地址与历史归 Settings/工作台，待打开意图及编辑输入归 Kit，正式草稿及修订仍归 Skills；没有增加存储或第二份保存状态。

| 问题与具体位置 | 用户影响与反证 | 处置及依据 |
| --- | --- | --- |
| `browser/kit/writing.ts:67` 原关闭保护只看 `root.isConnected`，Settings 分类切换却把根保留在缓存、暂时移出DOM | 保存失败后切另一分类，窗口关闭不再受保护；QEA-110旧实现实际 `false≠true`，原库仍是旧正文 | 保护条件继续来自原 `edit.pending`。`scripts/client/settings-directory.ts:73,226` 登记替换前保存与销毁，普通隐藏保留；真正替换前保存失败则回到原编辑器，成功替换才移除窗口监听。迁移成本中，现有page端口内完成。 |
| `browser/kit/writing.ts:76` 原只改 `settingsSearch`；`settings-directory.ts:75` 的source/address、遮罩历史仍留draft | 关闭编辑器后后退再次打开；QEA-111旧实现 `true≠false`。失效链接还可能造成“草稿不在了”假警告 | 地址owner同步所有表示，消费替换当前历史位置。Kit在首次挂载、任何await之前消费一次性参数；比较分类身份时排除仅用于响应布局的embed参数。删除私改镜像和两处提前丢缓存；不新增确认。 |
| `browser/kit/page.ts:30,165` 原目录回执以脱离DOM为失效，而返回缓存只看语言，不续初始化 | 持有真实`kit/list`响应→切General→放行，原缓存永久读取。持有草稿list响应也留下旧历史入口 | 缓存控制器继续接收已发读取；同一`disposed`事实只由Settings真正替换触发。目录、草稿和绘制据此拒收淘汰后的结果，不给导航另加一份初始化状态机。 |
| `browser/kit/writing.ts:117` 原地址读取等待后直接openDraft | 持有实际draft/read→正常新建并输入→释放，后来的正文变回原正文；原已释放根仍被装回旧编辑器。`quality-audit-settings-owner-late-baseline3.log` 两条有效失败 | 原地址意图在本人后续操作时撤销；读取成功/失败均核原ID与同一控制器存活事实，再打开或显示错误。旧回执不再覆盖新操作，不作重试或拿新修订强存。 |

六方向归类：①实际缓存寿命替代DOM连接隐式状态；②移除错误的连接防御及重复重载，保留真实替换前保存；③减少重开草稿、重输正文和无法恢复的读取态；④删除地址镜像写入和提前清缓存路径；⑤地址、缓存、编辑和持久化分别归原owner；⑥替换/释放属于Settings已有page端口，即使目前只有Kit登记编辑器也应由缓存owner兑现，未新增Skill专用导航服务。其他连接设置、MCP、Functions的page.replace保持默认历史语义，正在回归实际调用方。

当前证据：完整构建4/API零差异，16项真实Chrome恢复与迟到场景通过（`quality-audit-settings-owner-recovery-final.log`，含10项新增和6项原回归）；只读窄复核无剩余Blocker/P1。资源失败/重试覆盖项目cover和无项目Home独立页。原草稿恢复后仅一次成功修订，新输入实存、旧草稿不额外修改。26文件调用方/包要求、采用/放弃后的返回、健康正在结算。初次点击命中失败由缓存页下一帧scroll reset尚未完成、项目菜单未打开引起，改测试等待真实页面帧并经菜单点击；整页重载等Page加载事件，保留命中/原数据断言。两次不工作的回执观察旗标不计反证，改为实际网络响应完成；临时诊断已移除。

BL-b42-followups③只处理了项目/独立页的地址消费与缓存恢复；Home公开动作回执缺少草稿入口仍待补合同，不关闭整条BL。其他条目、真实模型/本人验收及整项任务的最终资源/CI也不能由本批替代。

### QF-51 追加 / P1–P2：后台目录读取正文、刷新确认错位及迟到导航（第50批）

入口为 Inbox 更新建议、Feed 后台创建/菜单、Goal 正文与 Frame、工作台 Home/Settings、分栏及窄屏恢复。真实链：平台 attention/原4秒poll → Workbench 可见性和刷新协调 → Goals 声明的 board-refresh 路由及 `goals.stage.read@1` → Goals 集合/正文 reader → Host 的关联成果与策略装饰 → Goals HTML/客户端贡献 → Workbench 当前选择与已应用游标。所有读取仍通过原授权和owner；没有新增业务写入、后台服务或插件名分支。

| 位置与发现 | 影响、依据与优先级 | 处置及责任 |
| --- | --- | --- |
| `plugins/native/goals/src/stage-action.ts:39`、`apps/local-host/src/web-goals-read.ts:155`、`plugins/native/goals/src/page/workbench-stage.ts:66`：省略goal_id仍默认读取active正文，Host又读取关联成果/规则，渲染完整正文 | P2，正常Inbox每批多次读取与替换隐藏正文。只删goal_id无法消除成本，Feed仍需后台集合。迁移成本中 | 沿原动作、路由、Manifest声明可选collection投影；Goals拥有投影含义，Host按声明跳过正文装饰。省略参数保持现行完整语义，非法值仍在边界拒绝。 |
| `apps/workbench/src/scripts/client/refresh-decisions.ts:123`、`initialization.ts:447`：平台游标与Goals日志游标混用，单一syncing丢弃在途force/新hint | P1，最后变化/保存回执可能不显示；真实持有两次响应、失败后无第二事件及实际关系保存验收。迁移成本中 | 同一刷新owner串行合并待读意图，集合与正文分别确认平台游标；attention提供同源hint，失败不确认、原poll恢复。删除syncing和错误初始赋值，不另建持久刷新账。 |
| `refresh-decisions.ts:91,118,173`、`plugins/native/goals/src/refresh-client.ts:6,44`：后台替换隐藏正文，未存表单阻挡无关目录；焦点/舞台可见不能代表正文可见 | P1–P2，隐藏输入丢失、目录过期和重复重读。分栏未聚焦窗格仍必须更新。迁移成本中 | Workbench拥有DOM及祖先窗格可见性，Goals贡献只应用请求的区域；集合不替换正文、不恢复全局UI、不受正文dirty阻挡。正文重新出现时补读，包括独立成果/输入事实。未扩SDK生命周期为第二份布局状态。 |
| `refresh-decisions.ts:190`：集合读开始后用户切到另一Goal，旧归档响应仍按原选择跳转 | P1，实际CORE→RELEASE后被导航到CORE归档地址；旧构建CDP记录见selection-baseline3。迁移成本低 | 跟随移动前核当前选择仍是原Goal且Goal区域可见；集合仍可更新，后来选择不被夺回。完整正文原代次/选择保护保留。 |

六方向处置：①已观察hint、已应用集合及正文是不同事实，由原owner维护；②保留动作授权、未知投影拒绝和可见正文已有fallback，collection失败不借完整页掩盖故障；③用户少等待隐藏正文重读，少恢复丢失输入或找回被抢走的选择，无新确认；④删除syncing及重复cursor读取，隐藏投影不再承担正文渲染/绑定/全局UI恢复；⑤布局归Workbench、内容与投影归Goals、关联事实归原模块；⑥复用现有stage动作/路由/贡献合同，不造通用刷新框架或把Goal正文逻辑移进SDK。单调用方的可见性属于工作台布局职责，集合语义仍属于Goals。

已验证：`quality-audit-collection-build4-ui.log` 2文件16项通过（刷新15、多窗格1）；`quality-audit-collection-ui-final.log` 的Feed菜单3项和成果/输入返回1项通过，后者确认Goals日志未变而平台游标变化，返回后仍显示实际归档与确认结果。QEA-112公开动作/HTTP读链及route文件此前通过，补充关联成果零读取断言随57文件复验。失败、持有两次响应、真实关系保存、切Home/Settings后完整回执只应用集合、dirty输入、归档/恢复、完整页fallback均覆盖，实际业务记录无额外写入。原分栏失败源于错误要求隐藏iframe另接attention；现按原`attention.ts:25`只由外层维护后台目录，可见窗格读当前、隐藏正文保留、恢复后追到当前事实。

性能证据：`quality-audit-collection-inbox-performance.log` 五样本5416、5404、4649、9144、8746ms，p50=5416ms；每次20条固定规则建议显示后才完成提示，Inbox只重读1次，7–14次Goal后台请求均为collection。health在3–4/20条返回，最大事件循环延迟407–759ms。此为隔离Home真实HTTP/Chrome与固定规则结果，不证明真实模型质量/延迟。最终增加请求投影断言后的性能复核、57文件、健康、资源和准确提交Full CI待结算。

分栏设置覆盖层的鼠标与触控出口已进入第 69 批，根因和实际退出见 [QF-71](#qf-71--p2-分栏设置覆盖层缺少可点的关闭入口)。

第50批结算：57文件初轮56通过，唯一Goals golden未反映已退役的`inbox_judgment:null`（-22字符）和Sessions SSR maxlength（全页+16字符）。固定b63亦失败；仅逆转这两处变更，52份原hash/长度全部复现，据此更新24份期望，其余28不变，完整补验56项通过、2个生成模式按默认跳过。组合57文件607项通过；未改断言、归一化或开候选RECORD模式。证据 `quality-audit-collection-required-final.log`、`quality-audit-collection-golden-proof.json`、`quality-audit-collection-golden-final.log`。

最终性能断言亦过（`quality-audit-collection-inbox-performance-final.log`）：五样本11246、8794、9115、10459、8577ms，p50=9115ms，所有后台Goal刷新均collection；Inbox重读1次、20条实际建议先显示再提示。此时机器还有两个其他工作树测试批次，主会话没有并发构建/重测试；不能将其与较空闲5.4秒样本当作严格对照，也不能隐去变慢样本。保留QF-51/BL的最终环境与CI结论。健康 `quality-audit-collection-health-final.log` 在main 4cf1c742e6基线上退出0；新main整合后仍按新基线复核。

第 65 批当前组合复跑 QEA-115，五次真实点击的完成耗时为 10,159、9,396、9,937、9,148、9,210 ms，中位数 9,396 ms。20 条实际写入投影先全部显示，随后才完成提示。每轮只重读一次 Inbox，后台 Goals 全部是集合请求。独立健康查询均在第 3–4 条判断返回，事件循环最大延迟 733–978 ms。运行时另外有本轮安全回归和其他工作树测试。早先的长时间整宿主无法响应在本样本未出现。耗时会随负载变化，实际模型端到端体验和当前 Full CI 仍未验证。真实 Home 提供事项浏览器回归另通过。日志 `quality-audit-b65-{committed-and-inbox,form-inbox}.log`。

最终结算：26文件197项调用方与Workbench要求通过（`quality-audit-settings-owner-acceptance.log`）；保持语义提取目录匹配后，最终构建通过、Skill创作与恢复2文件19项复验通过（`quality-audit-settings-owner-extraction-final.log`），去重组合27文件215项。健康通过（`quality-audit-settings-owner-health-final.log`），mountKit精确巨大单元记录155→153，无脚本或阈值放宽；首次158行失败记录保留。API零差异。覆盖实际Home持久化、失败/重试、采用/放弃、缓存/历史及资源加载，不替代Home动作回执链接、真实模型质量或最终头CI。

### QF-57 / P1：项目清除回滚可能先丢失尚未恢复的验收决定

主干合入前路径 `modules/acceptance/src/store.ts` 的 `purgeAcceptanceProject` 在 `clearInExistingHomeSqlite` 回调内删除提交意向；该函数退出回调后才 COMMIT（`packages/storage/src/sqlite-baseline.ts:422`）。因此最终提交拒绝时数据库回滚，恢复文件却无法回滚，用户可能失去补全原平台决定的依据。

处置：Acceptance owner 在数据库删除提交返回后再清理既存意向；正常认可继续 QEA-84–86 的同连接 ATTACH 单次 COMMIT。新主干两次提交专用的意向写入回调、Service转发和无生产调用writer删除；既存格式的读取/清理及Host幂等restore保留，不新建第二份决定事实或新兼容取值。`modules/acceptance/src/store.ts:81`、`apps/local-host/src/acceptance-recovery.ts:14`、`horizontal/project-approvals/src/decisions.ts` 分别负责清除、组合与平台决定恢复。

首轮真实隔离Home通过：QEA-117在原库加deferred FK，最终COMMIT拒绝后要求/对象和意向均保留；移除故障后同一清除成功。正常认可不写旧意向；原主干未落平台记录能够恢复。QEA-84–86最终提交拒绝、清理故障和真实SIGKILL等原测试继续通过。9文件63项见 `/tmp/quality-audit-main-integration-focused.log`。只读复核要求补“平台决定已恢复、文件未清除”的重入：已补完整内容/行数/意向清理断言，最终6项安全回归与25项动作合同全部通过，见 `quality-audit-main-integration-recovery-final.log`。

六方向处置：状态事实仍归两库各自owner及唯一正常事务；去掉第二条正常写路径和无调用转发；失败不会迫使人重新认可；恢复协调由Host调用公开owner端口；已有Storage原子与维护恢复能力继续复用。文档已纠正主干“库1→2”误写，实际数据库仍为1，没有结构迁移。

继续查深的已定位缺口：Skill并发冲突保住输入，但只有刷新提示、缺少能继续编辑的恢复入口；采用时签名安装成功后的目录刷新/草稿结算仍在原安装补偿范围之外。前者需真实双入口恢复验证，后者需真实SQL/异步故障反证再按owner边界落地；均不能算本次整合已解决。


### QF-58 / P1（已实施，最终验收中）：Skill采用失败后正式版本已改变

`apps/local-host/src/skill-authoring.ts:175–178` 先等待签名安装成功，再调用草稿owner结算。真实路径是本人设置HTTP → `PluginInstallService.confirm` → Home/Project安装 → Runtime版本/目录 → `SkillDraftStore.adopted`。目录刷新和外层授权尾检也有部分位于原安装补偿返回之后（`home-plugins.ts:141`、`project-plugin-ports.ts:85`、`plugin-install-service.ts:380`）。

QEA-118隔离Home使用真实SQL触发器拒绝草稿DELETE：项目新建返回500但目录已有Skill v1；项目换版返回500但已变v2；Home按页面实际personal安装入口得到同样两项结果，草稿仍是原版本。这会让用户误以为没采用，重试新建遇同名、重试换版额外增加版本，正式做法与页面结果不一致。初次Home用错根安装路由得到400是夹具错误，已保留日志并纠正，不算产品证据。有效日志 `quality-audit-adoption-commit-baseline.log` 项目两项及 `quality-audit-adoption-commit-home-baseline.log` Home两项。

拟处置见spec§52：既有安装补偿包住必要刷新、授权尾检及同步草稿结算；各owner仍写自己的事实，Host组合，不建立第二套通用恢复账。还需实际取消/撤权与重试、目录/版本/草稿写入和正式设置入口验收。未将静态方案或反证记作修复完成。


QF-58 实施和验收记录。`apps/local-host/src/installed-plugin-lifecycle.ts:68` 的收尾把必要目录刷新、安装身份和原调用授权检查都纳入已有回退范围。`installed-plugin-version.ts:62` 复用同一收尾顺序。`skill-authoring.ts:180` 把唯一的草稿/案例/来源事务交给草稿 owner 同步完成。操作返回成功后无需再解释刷新或提交结果。Runtime 安装撤销根据原安装、世代、版本和摘要决定，旧安装补偿不会撤销同安装上后来的版本（`packages/plugin-runtime/src/install-rules.ts:119`）。原发布者 pin 和签名包留存按既有规则，历史只看实际已装链。没有公开动作字段、库版本或跨进程事务变更。

真实反例与进度：构建2的三文件61项通过（`quality-audit-adoption-commit-focused2.log`）。包含同一草稿并发、安装等待断连、成功后丢响应拒绝重复采用、及真实Runtime换版。新版QEA-104等待真实目录活动期，保持并发修改409和提交后404。构建3的真实设置浏览器19项通过，原SQLite诊断露出反例见 `quality-audit-adoption-ui-baseline.log`。QEA-120改用现有本地化失败提示，调用ID与异常分类由Host日志保留，用户从原位重试，不需重写正文。构建3故障补验增加了实际案例与回放保留；移除SQL故障再成功采用后，新草稿可读已转移的已知答案。独立停用交错的真实反证已取得：正常设置HTTP成功停用，原撤销令其从安装列表消失（`quality-audit-adoption-disable-baseline.log`）。补上原运行世代的补偿边界，构建4及同一真实反例复验通过。后来的停用保有其真实决定，原草稿保留供继续编辑。

冻结提交 `7cef3d20d5` 由 `SandboxPackageStore.packageForControl`（`apps/local-host/src/sandbox-package-store.ts:161`）复用原签名包与版本核对。Home 装配 193→191 行，精确巨型单元记录同步缩小，门禁规则保持。冻结构建及健康检查退出 0。105 个包回归文件中 104 个通过，剩余 `tests/verify-release-versions.test.ts` 34/35，指向 `tooling/gates/version-exceptions.json` 中 `plugins/native/feed/src/source-request.ts#materials_v1` 的退役例外。清单变更待原批准。日志 `quality-audit-adoption-frozen-{build,health,required}.log`。

### QF-59 / P1：草稿冲突让用户停在无法保存的原窗口

旧 `apps/workbench/src/browser/kit/draft-editing.ts:63` 收到 `skills.draft_conflict` 后显示刷新提示，旧修订和本地字段一直留在窗口。用户关闭前仍试同一个失效修订。两条真实浏览器反证见 `quality-audit-draft-conflict-baseline.log`。Host 已有原 `read` 及 CAS `update`，无需新后台同步或草稿表。

`draft-save.ts:9` 拥有一份可观察的保存状态、待执行定时器与在途写入。它用现草稿动作重新取得最新事实，能合并的更改在原窗合并并补一次 CAS。需要决策时，`draft-revisions.ts:18` 产生两种选择实际会提交的内容，`workshop.ts` 用现有 diff 展示。占位词与展开正文是一个编辑单位，另有非冲突字段会保留。明确选择后仍按所见修订提交。保存终态、草稿原时间和回放条件各按实际事实呈现，Workbench 移除重复的失败和时间字段。采用、回放、改写出现冲突可读最新；原动作由人按实际新内容重新发起。

先行样本：四条定向实际浏览器通过 `quality-audit-draft-conflict-focused.log`，覆盖延迟读期间输入、再次冲突、失败重读和原采用恢复。重构后完整回归的恢复文件 21/22，新增窄屏键盘行为待复验；草稿创作完整文件通过，覆盖实际占位词及正文/非冲突填写提示的存储。清理巨大保存函数后健康已通过。尚未解决原草稿被另处采用或放弃且本窗还有输入的路径。此时原动作返回 `skills.draft_unknown`，保存不会覆盖真实数据，后续需按撤销或明确另存恢复输入，并保留原业务范围。

### QF-60 / P2：Home 助理写成草稿却缺少回到草稿的入口

`packages/contracts/src/services/skills.ts:708` 旧模板要求项目 ID。Home 助理成功写入后，`apps/local-host/src/assistant/assistant-result-card.ts:7` 和 `packages/contracts/src/platform/action-result.ts` 因缺参没有可显示结果链接。真实浏览器测到 1 份 Home 草稿、正文归助理、版本 1，但缺少按钮；同一测试的项目链已通过。证据 `quality-audit-home-skill-receipt-baseline.log`、`quality-audit-home-result-contract-baseline.log`。

处置：结果提供方声明 Home 和项目目的地，由 Contracts 共用现行验证和插值，助理、SDK 卡片和 Workflows 沿原消费入口。Workbench 的设置参数表只保留 Home Kit 实际读到的 `draft`。此处一个真实 Home 消费者已足以证明能力应归平台，Skills 仍只管草稿和声明。组合构建及再次点击后的无新增写入待验。BL-b42-followups③需组合通过后结算。

### PF-14 / P3：复用能力包的导航控件

`apps/workbench/src/browser/kit/workshop.ts` 原两套页签及比较分段，和 `authoring.ts:79` 原适用入口、范围分段，都自行渲染已有样式和无障碍标记。`packages/design-system/src/primitives/navigation.ts:3,20` 的规格板控件能承接全部实际操作；`attrs.id` 已支持关联。浏览器使用包根入口的实测报 Node 模块无法解析，因此开放现成 `./navigation` 再迁真实调用方。页面负责动作与当前选择，控件负责结构和选中状态。QEA-126、资源与 BL-b42-followups④随组合验收结算。

第53–55批定向验证结果。完整构建退出0。实际 Skill 恢复22/22、创作完整路径1/1、助理回执3/3，包含 390 px 键盘选择后回到编辑器、三宽度两主题截图、真实范围/适用入口读回、占位词与正文成对保存、Home和项目分别打开已保存原草稿且零额外写入。Workflows 执行1项、SDK卡6项、助理原回执含重启7项、结果合同4项通过。设置过滤首次33/34，夹具缺少现行 Home Kit 设置行，补真实导航行后原文件34/34通过。去重合计8文件78项，见 `quality-audit-b55-combined-focused.log`、`quality-audit-b55-settings-fixed.log`，初轮失败仍保留。API更新只增加 `platform/actions` 和转出的 `platform/plugin` 两行，动作输入输出快照无变化。第53批窄屏首轮失败来自 CDP Enter 缺字符事件，补生产同样的键盘激活后复验同时证明焦点回到正文。BL-b42-followups③④本地定向通过，合入前保留记录。

页面资源检查点使用 main `dbcf562a67` 和独立构建。24 个实际下发路径净增，Kit +3,912 B、工作台脚本 +4,578 B、Sessions +2,020 B、Git脚本 +8,452 B。完整差异见 `quality-audit-b55-page-assets.log`。已有授权覆盖知识脚本96 B与之前词包/首屏限额，当前结果尚未通过资源门禁。

首屏检查点 `90833e3a36` 的最大净增为冷加载 8,674 B（全插件工作台中文）、热加载 3,694 B（项目选择页中文）。空到达页为冷增 1,086–1,159 B、热增 42 B。当前两个词包路径后缀分别为中文 `d85c717edcc9c1ba2c6fcd35`、英文 `79a94289b42aca0dc10dc0e5`。旧许可中的冷 261 B 与热 38 B 上限均不足。基线及逐入口结果见 `quality-audit-b55-first-screen.log`，以最终实测复核许可覆盖。

### QF-61 / P1：模型在最终提交检查中被替换，旧改写和回放仍写入

`apps/local-host/src/host-complete-text.ts:59` 的文字便捷口只保留字符串，`agent-definitions/skill-workshop.ts:275,300` 在最后一次等待后直接写当前草稿及回放。保持动作可用且替换当前模型时，调用的授权检查仍然通过，原结果的模型凭据快照已无法校验。隔离 Home 经注册的两条动作连接本机模型夹具，在 Agent Host 和 Host 对返回结果的两次检查之后、最终写入检查中切换真实模型配置。旧改写实际保存新正文及修订，旧回放实际落下 match 并影响是否需要继续试用。日志 `quality-audit-skill-model-write-proof.log`；先前过早切换的测试拒绝符合原合同，它不能证明提交边界安全。

第 56 批沿现有模型执行回执保留校验能力，原 owner 在末次授权检查后、SQLite 提交前同步验证。QEA-128 还通过正常回放入口证明，旧实现会用更换后的连接派发已失效的两份回答（`quality-audit-skill-model-judge-baseline.log`）。现在先核对原回答，再派发判定，最终检查各回答与判定结果。定向 7 文件 86 项通过（`quality-audit-b57-model-acceptance.log`）。复验过改写与回放拒绝旧结果、原修订/案例完整和换模型正常重试。

同类问题在引导写入（QF-63）、初稿和信息方案（QF-64）均已取得独立反例。用量归 Observation，取现有 `HostTextGeneration` 执行回执。BL-b42-followups①保留完整用量覆盖。

### QF-62 / P1–P2 能力包改写按钮失效，等待中部分字段仍可编辑

在第 53–55 批隔离基线点击刚保存的定制草稿「让助理改」，浏览器找不到可提交按钮（`quality-audit-skill-companion-busy-detached-baseline.log`）。`apps/workbench/src/browser/kit/workshop.ts:43,96` 把 `type=submit` 作为普通属性，SDK 已先输出默认 `type=button`。案例另有一次点击转发能保存，键盘和原表单各行其道。旧 `workshop.ts:48` 的占位词和关停原技能也没有使用正文的在途禁用状态，改写回执可能覆盖新输入或在采用等待中改变后续关停选择。

工作台 `common.ts:29` 直接转交 SDK 的按钮类型，改写和案例保存由 `writing.ts:54` 的 form submit 提交。移除案例点击转发，复用正文已有在途事实，保护本次改写/采用字段。QEA-129 从标准能力包页经真实改写及签名采用，等待原成功 HTTP 回执取证，再以技能来源动作和实际原技能状态读回。

### QF-63 / P1 引导摘要在等待待办时丢失原模型校验

`apps/local-host/src/configured-text-port.ts:22` 曾将生成结果转成字符串。`context-onboarding-service.ts:385–399` 在收到摘要后继续等并行待办，之后发布旧摘要。QEA-130 通过引导 HTTP 和模型设置，在摘要检查点完成、Todo 请求在途时换为仍可用的模型。旧版原轮实际变成 `review`，持久保存了原模型摘要（`quality-audit-onboarding-final-model-settings-baseline.log`）。

`context-onboarding-service.ts:384` 由引导 owner 在最后一次等待后复核取消、运行 epoch 和原模型。新批次笔记由 `context-onboarding-staging.ts:90` 先写临时内容，核对同次校验后发布到原缓存路径。模型选择、原指令解析及恢复提示归 `configured-text-port.ts:17`。有效材料及已保存的批次可继续使用，原 Todo 动作和创建项目的本人采用步骤照旧。测试读回原材料、实际项目清单及同一旅程重试后的新摘要。引导真实出现在后台任务面板仍属 [BL-107](../backlog/BL-107.md)。

第 57–58 批先行结果。浏览器首次引导 16/16、Skill 草稿恢复 22/22、HTTP 模型设置 12/12。引导 HTTP 61/62，QEA-130 已读到旧结果被拒绝，随后曾把旅程预分配的项目编号误判为已建立项目。复验改用实际项目设置清单并读原暂存材料。Skill 完整路径首次点通真实改写，但夹具给的是现行改写合同不消费的点名提示字段。复验改「什么时候不用」，核已手写的点名提示仍在，另核采用中改写控件随同一状态禁用。健康首轮发现引导服务 809 行，模型职责迁回原端口后为 800 行；阈值未调整。

### QF-64 / P2 换模型后仍会返回旧起草及信息建议

`apps/local-host/src/skill-authoring.ts:195` 与 `information-planner.ts:27` 在模型已回复后还有一次业务授权等待。QEA-131 经实际注册的两条动作在这个等待中换到另一可用模型。旧实现两条均返回原建议（`quality-audit-host-proposal-baseline.log`）。能力包在 `apps/workbench/src/browser/kit/writing.ts:94` 收到初稿会开一份持久草稿。信息方案由 Feed/Inbox 当前目录供材料，后续本人动作有单独授权和写入。

两条查询迁入原 Host 结果校验，末次授权通过后同步复核原模型。模型设置界面的可用性判断直接读同一个存在性查询。信息方案的真实生产注册在 `project-host.ts:258`，`information-actions.ts:16` 只开放本人动作。`skills/molis-plugin-dev/host.md:198` 记载的 `POST /api/assistant/plan` 已无现行路由。旧产品运营链把它写成 Feed/Inbox 向助理提出的当前界面入口，本轮未找到该专用入口或 Agent 调用权。底层方案、依赖及本人调用可验，产品入口覆盖仍有缺口。

第 59 批完整构建、健康与包边界通过。组合 8 文件 144 项通过（`quality-audit-b59-focused.log`）。引导 HTTP 62/62，Skill 真实浏览器 1/1，模型真实传输 20/20，Skill 授权 6/6，页面权限 34/34，Feed、Inbox、Pages 与方案余下三份 21/21。QEA-129 等待实际成功回执时锁定原字段，采用后读到新的「什么时候不用」、原替换词、手写提示及原技能已关闭。目视复核了 1024 浅色和 390 深色。QEA-130 经模型设置、引导和项目清单确认旧摘要拒绝、原材料完整、同一旅程重试且项目未创建。QEA-131 的两条注册动作拒绝旧建议，新模型各调用一次后成功返回。

只读复核确认本片的代码与原提交边界一致，并要求单独验证分批笔记的发布。QEA-132 让正常引导处理足够长的材料，保持实际文件写入及原模型传输。临时笔记写入完成时切换模型，旧轮诊断为配置变更，目录无临时或正式笔记，完成数为零。原旅程重试只发布新笔记、保有原材料引用，读到新摘要。QEA-130/132 的 2 项定向复验均通过（`quality-audit-b59-note-acceptance.log`）。

最新实际下发测到 66 个静态路径，无发现遗漏。与同基准检查点对照，Kit +3,855 B，低于第 55 批的 +3,912 B。其余已测净增范围、两个词包地址和所有首屏冷/热字节保持。最大静态路径 +8,452 B，首屏最大冷增 8,674 B、热增 3,694 B。见 `quality-audit-b59-{assets,first-screen}.json` 与第 58 批官方比对日志。现有许可仍不足，准确头资源许可和 CI 保持待定。

### QF-65 / P1 临时打开设置后失去原待审的 Git 提交

`4c54241e96` 的 `plugins/native/git/src/browser/client.ts:30` 在子页隐藏时清空所有选中结果，隐藏了同一结果区中的宿主审查挂载位。既有 S-47 浏览器测试在安全回归和单独复跑都失败。干净 main `dbcf562a67` 的原用例两项通过。按真实 `document.body.hidden` 同步的新反证在旧候选头 `7cef3d20d5` 失败，返回设置时原待审结果区仍隐藏。日志见 `quality-audit-review-main-test.log`、`quality-audit-review-head-retry.log` 和 `quality-audit-review-hidden-proof.log`。

`plugins/native/git/src/browser/client.ts:17,26,36` 从原结果选择判断是否已有 Host 受理的审查。这个选择随同一个挂载短暂隐藏而保留，原读取被取消。可见后由原刷新入口向 Host 重读，并给这次显示新选择与信号。旧回调仍按 `result-selection.ts:37` 拒绝写到新选择。关闭结果、换工作区、释放挂载及普通差异/冲突/历史沿原返回合同处理。Host 审查身份、本人确认、Git 工作区写入均由原主人维护。差异、历史和冲突的显示准备复用 `result-selection.ts:17` 一处初始化。

首轮隔离 Home 的两项真实 S-47 用例均通过。实际提交穿过两次设置遮罩，准备请求只有一次。受信确认前 HEAD 未变，确认后只新增一笔提交。伪造调用与脚本点击仍被拒，原回执清除已提交的草稿。逐次可见回读、真实暂存及 Coding 内嵌待审恢复纳入最后一版包级回归。用户从设置返回后可直接继续当前审查，Git 结果各入口少处理一遍共用区域的初始化。覆盖前尚未读到受理回执的情形继续沿既有未知回执和原审查入口恢复。

第 60 批完整构建后的真实 HTTP 测量共 66 条静态路径，零遗漏。结果入口初始化消重后，Git 脚本为 39,400 B，对 main 的 30,997 B 净增 8,403 B，比第 59 批少 49 B。gzip 实测从 12,495 B 到 12,520 B。2 种语言、5 种首屏的冷/热响应字节与第 59 批全部相同，两个词包地址一致。待许可的最大首屏净增仍为冷 8,674 B、热 3,694 B。实际测量见 `quality-audit-b60-{assets,first-screen}.json`。

冻结上述构建的 13 文件 125 项回归有 12 文件、124 项通过。独立 Git 的双遮罩提交和暂存回归均过，同一审查的拒绝与展示重试仍只发原准备。Coding 在 800×600 中回到同一审查时按钮被裁切。诊断版先用真实滚轮让按钮可点击，记录遮罩前宿主审查槽高 320 px、返回后只有 6 px。旧版再次滚动才能拒绝，新验收保留第二次滚动前的真实命中条件，旧构建在该条件失败。日志 `quality-audit-b60-test.log`、`quality-audit-b60-coding-scroll-evidence.log` 和 `quality-audit-b60-coding-scroll-negative.log`。

`plugins/native/coding/src/browser/main/mount-events.ts:31` 的会话选择更新使起始区重新占位，尽管同一 Git 结果仍然打开。Coding 将现有 `companionOpen` 事实放在工作台根部，布局和结果索引共同消费，删掉打开结果时重复写会话详情和结果元素的操作。Workbench `apps/workbench/src/browser/plugin-frame/review-slots.ts:13,45` 在同一文档短暂隐藏时保留空占位的实测高度。旧审查槽仍关闭，读请求取消，重新可见时由受信 Host 读回和重算。扩展验收正在验证恢复后无需再滚及原 Coding、Git、平台审查消费者。

完整构建后，用同一窗口、原滚轮及真实点击复验 QEA-133。原实现失败、现实现通过。返回设置后直接命中同一条审查，不发第二次滚轮事件。真实拒绝保持提交和草稿，原重提路径只在确认后实际提交，后写草稿继续有效。见 `quality-audit-b60-coding-scroll-final.log`。固定代码头 `b65c5de0ea` 的 Git、Coding 和 Workbench 组合回归共 77 文件、521 项全过（`quality-audit-b60-integrated.log`）。隔离 Home 的三宽两主题冲突界面取样，目视复核 390 深色 Coding 与 1440 浅色 Git。

第 59 批旧安全运行中的签名呈现槽失败发生在 CDP 命令超时，当前独立构建经同一个真实签名入口复跑 2/2 项通过，公开动作合同 25/25 项通过（`quality-audit-b60-signed-slots.log`）。旧头 `4c54241e96` 的安全回归在 101/447 文件后结束，99 文件通过，两处失败为 Git 恢复和此次浏览器传输超时。两处均有新头的实际入口复验。保留旧运行日志和最终组合头的完整安全验收要求，见 `quality-audit-b59-security.log`。

### QF-66 / P2 资源清单曾采样已替换的任务和 Goal 请求

`tooling/gates/first-screen.json:12,26,45,64` 的选择页任务与工作台 Goal 路径仍为旧查询。实际调用由 `apps/workbench/src/scripts/client/attention.ts:24,119` 选择 Home 任务，由 `refresh-decisions.ts:160` 选择当前集合。干净 main 和候选的十组浏览器冷、热记录证实，本轮改变的入口是选择页 Home 任务和事件流、三个项目工作台的 Goal 集合。两边共同出现的个别动态词包/会话、项目级事件流等遗漏需另按启动清单维护。

采用原 HTTP 计量器，只替换本轮改动的采样行并加入实际新 Home 事件流的只读探针。候选 `4031decbef` 中，选择页原采样读 4,593 B、实际 Home 读 344 B、首个事件 259 B。候选对同一正式主干基点的选择页热加载由旧估计净增 3,694 B/3,689 B 改为实测缩小 296 B/298 B。默认/全插件工作台实际 Goal 集合每次少 207 B，示例工作台少 54,752–56,097 B。该次修正测量的最大净增为冷 8,467 B、热 1,062 B。候选与主干浏览器记录见 `quality-audit-b60-{first-screen-browser,main-first-screen-browser}/audit.json`，探针见 `quality-audit-b60-observed-requests-first-screen.json`。清单和最终许可按第 61 批重新核定，原先的净增数字留作旧测量证据。

补齐 Coding 审查恢复后的当前候选，沿拟定清单重跑真实 HTTP。66 条静态路径无遗漏，其中 24 条既有路径增长。最大为 Git 脚本 8,403 B，其次工作台脚本 4,578 B、Kit 3,855 B、Sessions 2,020 B。两个词包内容地址仍为中文 `d85c717edcc9c1ba2c6fcd35`、英文 `79a94289b42aca0dc10dc0e5`。实测见 `quality-audit-b60-scroll-assets.json` 和 `quality-audit-b60-scroll-observed-first-screen.json`。

| 首屏 | 中文冷/热净变化（B） | 英文冷/热净变化（B） |
| --- | ---: | ---: |
| 到达 | +1,423 / +42 | +1,350 / +42 |
| 项目选择 | +1,368 / −296 | +1,293 / −298 |
| 默认工作台 | +7,483 / −214 | +7,427 / −197 |
| 全插件工作台 | +8,731 / +1,034 | +8,686 / +1,062 |
| 示例工作台（报告） | −46,313 / −54,010 | −47,711 / −55,335 |

这一次复测的首屏最大净增为冷 8,731 B、热 1,062 B。许可的测量行涉及选择页 Home 任务、Home 事件流和三个工作台的 Goal 集合，旧主干的实际采样保留。当前只读探针已完成，门禁清单及许可待批准。

### QF-67 / P2 项目首页重复读取关联资料

`apps/workbench/src/scripts/client/placement.ts:594,636,652` 在脚本装配时直接请求真实关联，随后首次可见的重绘又进入同一入口。两个独立构建的浏览器记录都包含重复请求。默认、全插件和示例项目的两种语言、冷和热均有两次。默认和示例样本来自同一主文档，两个 200 回答各 254 B，发生在页面加载前。现行浏览器记录里，原 BL 还包括的 `/api/home/events` 重复 POST 已无调用。

第 62 批删掉装配中的独立读取，保留首次可见、重新聚焦和失效后的原读取。关联资料和归属继续由 Placement 提供，Workbench 沿同一路径显示和打开原件。QEA-135 随现有个人资料放入项目真实流程核首次读取次数、原件打开与后续移动。用户进入原首页即可打开关联资料。页面少发一次相同读取，工作台少维护一个初始化入口。[原重复读取 BL](../backlog/BL-first-screen-duplicate-requests.md) 待本批和最终组合验收收口。

完整构建通过。正常个人空间建资料、用到项目、首页一次读取、继续编辑和移动在 1440 与 390 均通过（`quality-audit-b62-package.log`）。真实静态资源保持 66 条路径，工作台脚本少 4 B。沿拟定清单的同源 HTTP 测量再次小幅减少，现有组合候选相对实际主干的首屏最大净增为冷 8,704 B、热 1,039 B，两个词包及申请审核的路径范围相同。项目选择页热加载净减 319–321 B。见 `quality-audit-b62-{assets,observed-first-screen}.json`，真实冷、热请求次数纳入随后浏览器复验。

最终生命周期构建 `613991fcd1` 再走五种页面、两种语言、冷热共 20 次浏览。12 个项目工作台样本都只有一次 Placement 读取且响应 200，已退役的 Home Events POST 仍为零。选择页的任务 GET、SSE 及项目 Goal 集合的 20 条请求观测与第 62 批字节一致，同一口径的 HTML 原始体积和静态资源一致。实际首屏登记仍待许可。证据 `quality-audit-final-first-screen-browser/{audit,browser,http}.json`。

第 62 批本地验收完成。Placement、其真实页面消费者和 Workbench 必跑的 22 文件、194 项全部通过。第 62 批浏览器记录含两种语言、三种项目工作台、冷热共 12 次真实打开，每次关联资料 GET 一次并响应 200。所有 20 个样本中旧 Home Events 路径为零。可在最终组合验收完成后结算重复请求 BL。隐藏的 Issues 侧栏文档仍在首屏取走完整 HTML，沿 [BL-first-screen-hidden-side-doc](../backlog/BL-first-screen-hidden-side-doc.md) 保留，报告未纳入本片改行为的范围。

本地审查分支已快进至代码检查点 `6df79f442d`，相对 main 有 480 个文件的差异，含代码、测试、快照与文档。该树完整构建通过，准确版本的包边界、健康与密钥检查通过，密钥检查覆盖 14,320 行。已在该代码树启动原 `pnpm test:security`（`quality-audit-current-security.log`）。当前安全状态和 Full CI 以各自最终结果为准。

### QF-68 / P1 签名数据库升级漏掉已提交结果的回执检查

实际入口为本人调用 `plugins.install.confirm@1`。签名包经本机 Host 确认，Runtime 在实际 SQLite worker 内提交现行版、数据库变更和批准，Host 继续公开可用动作。第 52 批把 `plugin-install-service.ts` 尾部授权收进可补偿的 Skill 采用窗口。`installed-plugin-version.ts:57,62` 的数据库路径在 SQLite 提交后只核对安装范围，使取消或撤权的调用仍收到成功。干净 main 的 17 个原用例全过。审查分支在同一真实 SQL 回执到达时两个 Project 拒绝都未发生（`quality-audit-{b64-main-baseline,current-security}.log`）。

第 64 批由状态 owner 先完成已提交版本的发布，再在 `installed-plugin-version.ts:120` 复核原签名确认调用是否可接收回执。回执失败离开激活恢复分支，已提交 SQLite、审批和当前目录继续由原 owner 维护。Install 服务把无动作码的取消归到已有 `actions.cancelled`，保留传输给出的动作错误码。普通安装及 Skill 草稿采用照现有可补偿流程，用户可从当前安装读回实际结果，无须重新安装。QEA-137 复验 Home 和 Project 的两种迟到拒绝、实际版本与正常动作。

当前构建的升级验收 19/19。Home 和 Project 分别在真实 SQL 回执时取消与撤回调用授权，原调用收到对应错误，新库结构、安装行和动作仍可读。同版本再次确认被拒，每次只出现一笔真实迁移。真实 Home 签名包更新的文件选择、取消和确认浏览器用例也通过。见 `quality-audit-b65-committed-and-inbox.log`。

### QF-69 / P2 签名插件安全用例的准备脱离了现行用户路径

| 证据及影响 | 处置和依据 |
| --- | --- |
| `tests/security-invariants-sandbox-home-instance.test.ts:32,57` 直接调用 Home 安装端口生成正例和冷启动记录，绕过 `plugin-install-service.ts:380` 本人固定发布者。收尾复核 `installed-plugin-lifecycle.ts:192` 是正常拒绝，旧准备让测试到不了想验证的冷启动 | 第 63 批经实际预览、确认和动作写入准备三份记录，再独立制造冷启动的撤销与缺失固定。原五种拒绝保留，补缺固定时不留安装和公开动作。冷启动核对两份已有原件及第三份继续可写。 |
| `tests/security-invariants-sandbox-permission-switches.test.ts:97` 原来直走已经退役的写入口，撞上 `plugin-builder/installed.ts:33` 的原动作校验。另三条签名表单用例在进入原页面交错前，被未开启的 `capabilities:call` 拦下。两组在干净 main 复现 | 第 65 批用实际签名组件和 `plugin-page-actions.ts:41` 验开关关闭零执行、开启后退役入口仍拒、原页只执行一次。准备表单时从真实设置开启该许可，再验证原拒绝、停用、依赖替换及实际数据。安装权、权限和页面范围的生产规则继续归原 owner。 |

Home 签名包 6/6、沙箱开关 5/5、签名表单 3/3 通过。Home 签名表单撤下原项目使用真实设置读取的成员修订，并在原操作到达写入之前验证拒绝。保留安全表的测试定位和原拒绝条件。原页面失败反馈还会显示技术许可名。`installed-permission-projection.ts:69` 生成动作原因，`plugins/native/plugin-builder/src/agent-studio.ts:191` 交给当前传输，`packages/design-system/src/plugin-component-part.ts:51` 直接显示错误文字。正文语言和设置的许可标签需要同一套平台展示合同，列为后续体验事项，具体名称仍由插件授权 owner 提供。

### 隐藏问题收集的首屏取舍

`apps/workbench/src/side-panel.ts:487` 按声明的组合键预载文档，触发真实首屏观测中的 Issues iframe。路由、文档和录入由工作台与 Issues 各自负责。现有 ISSUE-35 明确要求第一次按键前已经预载，项目测试也会查已加载的 iframe，再发送真实按键。`BL-first-screen-hidden-side-doc` 提议首开才取，两者的时点要求需要统一。可先量出能否缩减预载文档，同时保留首次按键后立即录入与原稿恢复。到达页、项目选择页和工作台分别实测。当前保留该 BL 与已验快捷键约定。[ISSUE-35](../archive/issue-home-v0/spec.md#首期体验重构issue-35-至-issue-412026-10-12) · [首屏事项](../backlog/BL-first-screen-hidden-side-doc.md)

### QF-70 / P1 当时的启用状态阻碍同一已保存安装的确认回执

`apps/local-host/src/home-plugins.ts:166` 允许本人停用绕过正在安装的队列，后续启用仍按队列等。真实来源登记等待期间，原登记在停用后返回跳过。冻结分支的 `installed-plugin-lifecycle.ts:189` 要求所有确认使用原启用世代，报 `actions.provider_replaced`。同一版确已保留，后来启用能够继续，用户却可能被提示重新查看或重新安装。干净 main 的 8 项来源回归均通过，冻结候选这项失败。

第 66 批将已写安装版本和当前启用决定各自校验。安装记录仍是原发行物且发布者信任有效时，普通确认可以返回已写结果。旧启用世代的回执不重复发布提示或清理后来状态。依赖原启用结算的 Skill 采用仍因换代拒绝，保留草稿和后来停用决定。Runtime 拥有安装行，监督器拥有启用世代，集成登记由 Registry 按原有效 token 处理。复用已有精确安装检查和原登记队列。

QEA-139 从本人设置发出真实停用和启用，原确认返回同一安装版本，登记结果依次为跳过和登记，只有一个来源和服务声明，普通拉取通过。最终停用移除声明。完整来源 8/8、Skill 采用与撤销验证 17/17，见 `quality-audit-b66-{installed-regression,queue-current,main-baseline}.log`。冻结完整安全批次所见该项失败保留于 `quality-audit-current-security.log`。

第 67 批补验 QF-69 的真实跨项目签名界面。Workbench 通过 `apps/workbench/src/scripts/client/deferred-plugin-client.ts:38` 读取原项目的投影地址，再由 `apps/workbench/src/browser/plugin-frame/parent.ts:163,224` 装入隔离 iframe。干净主干同样已使用现行投影，旧测试选择器等不到工作台的隔离子页。测试现在用真实工作区插件入口、隔离子页及原项目投影继续验证。专用浏览器的入口覆盖实际输入、刷新、文件升级、许可增加重审、撤回、切项目及 Home 开启，3/3 通过。独立 Home 能力开关经真实设置开启，项目同意仍逐项目验证，复制控制以及原页撤回都不能写入。项目 A 的实际 Goals 写入和项目 B 原事实保留已有断言。1440、390 像素的设置截图已核，项目、能力效果及操作按钮可读。证据 `quality-audit-b67-opaque-project-reach.log`，截图在 `.impeccable/qa/review/quality-audit-signed-reach/`。

实操同时测见新增动作在「它声明的动作」和「新增声明的动作」各出现一行。第 72 批沿同一真实设置入口复现、修复并验证，见 QF-73。

### 第 68 批双 Goal 窗格预算与逐次授权

BL-943 引用的 66 次目录读取、64 次开库来自第 06 批。用现行 Home 路由复测后，原结论和拟议的目录提交代次都需要更新。 `tests/call-budget.test.ts:204` 在同一个隔离 Home 中并发读取两个已有 Goal 的正文，各返回 200 和自己的正文标识。三个样本以中位数结算。探针包装真实 SQLite 构造与 `apps/local-host/src/project-catalog.ts:337` 的目录读取，原方法照常执行。

| 同一口径 | 项目插件目录读取 | SQLite 开库 |
| --- | ---: | ---: |
| 最初验收上限 | 60 | 58 |
| 已重建的 main `dbcf562a67` | 47 | 48 |
| 审查候选 `fe52722a63` | 35 | 36 |

主干和候选的 15 个探针场景逐项都在现行预算内。候选也按原门禁模式跑过完整预算，合计 5 文件 43 项通过。正常启用变化及时生效。原 MCP 调用者撤权后下一次 native、沙箱或流水账读取无结果，拒绝的写入没有开启事务、没有新记录，另一获准调用者继续读取。回归在 `tests/security-invariants-plugin-read-original-caller.test.ts` 和 `tests/security-invariants-plugin-project-database.test.ts`。

已有目录、读协作和授权合同足以满足双窗格目标。目录提交代次从本事项的依赖移除。候选相对当前主干在两项各少 12 次调用，用户照常打开两个 Goal。计数反映宿主工作量，实际等待通过各自的端到端体验用例衡量。日志 `quality-audit-b68-{main-call-budget,current-call-budget,budget-acceptance}.log`。原 BL 保留至组合验收结算。

### QF-71 / P2 分栏设置覆盖层缺少可点的关闭入口

`apps/workbench/src/scripts/client/tab-workspace-panes.ts:120` 打开覆盖层时隐藏实际窗格，同时以窗格数决定是否隐藏标题栏标签条。覆盖层按钮由 `tab-workspace-strip.ts:272` 产生，分栏时用户只能另走历史、菜单或键盘。实际两个窗格保留 Goals 与 Inbox，从个人菜单打开设置，旧构建立即在「可见且有名称的关闭按钮」断言失败。依据是现行 [DESIGN](../../DESIGN.md) 的工作台触控规格和[原导航约定](../archive/page-interaction-flow/spec.md)。

覆盖层由外层工作台绘制现行标题栏芯片。 `tab-workspace-places.ts:146` 的关闭与历史恢复继续接管恢复原窗格。正常分栏各用自己的标签条。用户点覆盖层旁的关闭按钮即可回到原来的两个窗格。代码少维护一个按窗格数量同时决定覆盖层出口的条件，隐藏窗格也无需绘制覆盖层芯片。

QEA-142 在隔离 Home 用真实布局菜单切分、开设置并以 1440 像素鼠标及 390 像素触控退出，两个窗格的内容、布局和焦点读回一致，触控命中区达到 44×44。原历史、重复菜单入口和 Esc 层优先级通过，项目设置真实保存和 Cognia 的嵌入设置入口也通过。首轮关联批次 87 项通过，灵光历史前进 1 项失败。修复前后构建单独复测均在同一步失败，纳入后续修复。证据 `quality-audit-b69-{split-cover-baseline,focused,lingguang-baseline,lingguang-candidate}.log`。

完整构建与健康门禁通过。66 条静态资源路径全部读回，工作台脚本实际响应少 82 B。两种语言下 5 种页面的同源 HTTP 采样，6 个项目样本的冷加载同减 82 B，热加载、动态请求及页面字节相同。资源申请用第 71 批的最终测量。全套视觉对照见第 71 批，组合 Full CI 待结算。

### QF-72 / P2 灵光的历史前进停在列表

`apps/workbench/src/scripts/client/tab-workspace-places.ts:108` 从历史恢复原记录。工作台回到列表时，`apps/workbench/src/browser/plugin-frame/view.ts:37` 按隔离帧约定折起正文和选择。写过的灵光编辑器由插件保留。 `plugins/native/lingguang/src/browser/load.ts:33` 把相同保留 ID 当成已经显示，丢弃正常前进。修复前及分栏修复后的构建都在需要恢复第二条笔记时失败，客户端定向反证也得到折叠状态 `false`。

`plugins/native/lingguang/src/browser/editor.ts:5,108` 统一显示编辑区的动作，保留的编辑器据实际可见性恢复原输入、选中行和当前对象。保存提示由当前编辑器提供，历史导航归 Workbench。用户前进一次就能回到笔记，打开动作直接复用原正文和保存状态。

QEA-143 两项定向回归通过。在隔离 Home 写入两条灵光，切换与重载、后退回列表再前进，恢复第二条的实际输入与选择。同时，经正常 HTTP 读回前进前后的记录内容、个数及版本完全一致。编译后客户端验证保留的失败状态和未提交输入以及已显示时的幂等打开。证据 `quality-audit-b70-{lingguang-reopen-before,build,focused}.log`。工作台、灵光的包级回归在 `e57761dd70` 通过 45 文件 408 项，包括 16 项交互及 9 项内容编辑。初版闭包将 `installEditor` 推到 153 行。将显示动作放到模块内函数后，最终候选完整构建、健康和 3 文件 32 项定向回归通过。证据 `quality-audit-b70-package.log` 与 `quality-audit-b71-{build,health,runtime}.log`。

第 71 批保留 66 个静态路径。灵光原资源相对第 69 批增加 176 B 原始响应、61 B gzip 测量值，相对 main 的原始响应净增 195 B。它由灵光实际打开时读取。5 种页面的冷热首屏 HTTP 响应与第 69 批逐条相同。组合候选按先前同一基点的最大首屏增量为冷 8,622 B、热 1,039 B。两个词包地址与已申请的测量路径相同。页面资源申请应使用这组实际数值。

### 第 71 批已恢复 Goal 的视觉入口

首轮对照在 main 采得 66 张图，候选共采得 62 张图，Goal 工作区有四张缺失。 `tests/visual-surfaces.e2e.test.ts:82` 在每个宽度都重复点击 Goals 插件入口，然后等待关系图已加载。1024 像素的诊断记录显示点击前已恢复 CORE 工作区，点击后清掉当前条目，前后均未发起新的关系图加载。用例沿真实显示的 CORE 工作区继续，按当前入口需要经过插件导航和目录，截取展开的 CORE。完整的截图与样式断言沿用同一口径。

定向真实采集的 Goal Frame 和工作区各有 1440、1024、390 三个宽度的明暗截图，共 12 张。实看窄窗和 1024 像素工作区的内容及导航。关系图正常、失败、重试另在最终构建的 `tests/goals-momentum.e2e.test.ts` 通过。最新组合候选的健康、包边界、密钥检查及公开 API、动作、43 库结构、生成版本快照都通过。

正式对照的基线与候选各通过 13 项采集检查，各生成 66 张截图和 22 份样式快照，CORE 工作区六张图完整。两边 65 张图逐像素一致。1024 像素浅色项目资料的标题栏入口边缘有 20 个像素差异，22 份样式快照均记录到差异。对照工具按差异返回 1，并生成 `.impeccable/qa/review/quality-audit-b71-visual/report.html`。日志 `quality-audit-b71-visual.log`。

### QF-73 / P2 签名插件换版在项目设置重复列出新增动作

隔离 Home 安装真实签名包，从项目设置完成初次同意，再从文件升级到声明增加的版本。旧 `apps/workbench/src/settings-plugins.ts:174` 先渲染完整清单，再追加新增清单，「调用模型」出现两次。QEA-145 在旧构建准确失败，两个原有 Goal 动作和「调用模型」同时落在完整清单里，新增清单又出现「调用模型」。用户要在重审时反复核对同一个动作及费用。反证见 `quality-audit-b72-reach-before.log`。

`apps/local-host/src/plugin-project-reach-consent.ts:48` 提供声明、差集和当前同意。工作台沿同一读回在 `apps/workbench/src/settings-plugins.ts:174–177` 优先呈现新增动作，再呈现余下声明。每项只出现一次。动作介绍和模型费用仍取原动作目录。授权、写入和撤回由原项目同意入口处理。这样无需引入另一份授权状态或新词包。

此处是签名权限扩展时的阅读负担，优先级 P2。呈现沿既有字段实施，成本低。

真实签名换版、同声明换版、取消、重新同意和撤回均已通过。原有动作和使用模型的费用说明在 1440 和 390 宽度可见。取消后目标进展无新写入，重新同意后实际写入一次，项目 B 和无项目 Home 入口仍受各自范围约束。证据见 `tests/home-package-project-reach.e2e.test.ts:171`、`quality-audit-b72-reach-after.log` 和 `.impeccable/qa/review/t145/`。

### QF-74 / P2 项目删除和卸载撤回时读取了无关批准明细

从 `apps/local-host/src/project-deleted-owners.ts:143` 的项目删除和 `apps/local-host/src/plugin-installation-cleanup.ts:23,55` 的卸载进入 `HomeConsentLedger`，最后由 Runtime 的同意账本撤回。旧 `packages/plugin-runtime/src/consent-ledger.ts:261` 解码每份活动同意的全部批准动作后才筛选，撤回选中行后又解码一次。SQLite 接受 `[7]` 这样的 JSON 数组，授权读取按动作合同正确拒绝。旧的撤回因此也失败，真实项目删除停在「待清理」，另一个项目的坏行也能阻断处理。安装范围的账本反证复现同一条拒绝，为 [D0301 的原记录](../../docs/reviews/daily-quality/2026-11-08-medium.md)补上实际入口证据。日志 `quality-audit-b73-cleanup-before.log`。

`packages/plugin-runtime/src/consent-ledger.ts:262` 在原事务只读活动行的同意 ID 和主体。使用原主体解析来决定撤回范围，全部主体可确认后才为目标行写撤回时间。批准集合由授权路径和完整历史读取继续按原合同校验。删除能正常完成已知归属的撤回，账本少解码无关的批准动作、少逐行读取刚更新的回执。当前存储仍须核对活动主体。无法确认归属或写入失败时，原事务与删除恢复流程提供可观察的失败和重试。

此处是受损记录下可复现的清理阻塞，优先级 P2。改动限于 Runtime 账本内的读取和撤回，沿既有 SQL 结构和 Host 入口部署，成本低。

QEA-146 的真实项目删除完成，目标行的撤回时间落库，其他项目的行和原批准明细保持原值。账本按安装撤回时覆盖活动主体无效的拒绝、修复重试、同一安装跨项目撤回和重复处理零写入。原删除失败后重新打开目录、固定 ID 重建，以及真实签名插件保留和清除数据两种卸载均通过。证据见 `tests/project-deletion-owners.test.ts:124,162`、`tests/plugin-trust-rules.test.ts:142`、`tests/home-package-project-reach.test.ts:222` 和 `quality-audit-b73-real-entries.log`。组合实际存在的 8 个文件共 73 项通过，其中一次命令误写了第九个文件名，未计入结果。工作台和 Runtime 的包级复验另按实际文件执行。

第 72–73 批完整构建、健康、包边界、API、动作、43 个库结构、生成版本检查和密钥检查通过。静态资源仍为 66 条，只有工作台脚本原始响应增加 5 B，gzip 测量增加 13 B。两种语言的五类首屏 HTTP 行中，六个项目工作台的脚本冷响应各增加 5 B。热响应和已测动态行保持原值。沿之前相同主干与采样口径，组合最大净增为冷 8,627 B、热 1,039 B。两个词包地址相同。见 `quality-audit-b73-assets.json` 和 `quality-audit-b73-first-screen/http.json`。资源登记、许可及这份组合的 Full CI 待结算。

### QF-75 / P2 Inbox 当前建议为已处理的事项读取 Feed 正文

`plugins/native/inbox/src/actions.ts:174–180` 为工作区保留已处理事项的状态与名称，并读取当前建议。旧 `plugins/native/inbox/src/scene-runtime.ts:153` 在取得 Feed 正文后才检查 Attention 的事项状态。旧构建的 QEA-147 从真实注册动作生成、读回判断，启动 Feed 正文故障后成功忽略事项，再读当前建议仍收到正文故障。工作区沿相同查询准备列表时会被此失败牵连。证据 `quality-audit-b74-inbox-before.log`。

`plugins/native/inbox/src/scene-runtime.ts:151–160` 先按 Attention 的同一次读取排除已处理事项，再让 Feed 的公开动作读取仍有资格显示建议的原文。规则绑定、原文修订与当前建议继续由 Inbox 核验。旧判断作为原历史保存。用户可在原文能力故障期间回看已处理事项，Inbox 少一次无用的读正文检查。改动只收敛原场景的查询顺序，优先级 P2，迁移成本低。

完整构建和 9 文件 71 项通过。QEA-147 经实际注册动作将事项从进行中置为已忽略，从工作区读回事项及空的当前建议，原判断记录数量保持。进行中的事项仍报告正文故障，恢复服务后显式重新判断已忽略事项按原状态被拒。隔离 Home 浏览器打开 Inbox、运行真实注册的插件判断、显示建议、停用后撤回建议及窄屏失效反馈通过。证据见 `tests/inbox-action-scenes.test.ts:111`、`tests/inbox-current.e2e.test.ts:18` 和 `quality-audit-b74-inbox-after.log`。

第 74 批候选的 66 条静态响应及十组首屏响应字节与第 73 批相同。这组测量使用合入角色设置前的主干比较点。当前代码的发布版本测试 34/35，唯一失败为旧 Feed 例外 `plugins/native/feed/src/source-request.ts#materials_v1` 指向已不存在的用法。保留该授权事项，见 `quality-audit-b74-release.log`。

### 第 75 批主干增量与 QF-76 / P3 角色库登记版本

主干 #2111 将已有 Characters 与 Mainline 包扩为正式的角色层次、固定版本、事项容器。包清单仍是 75，contracts 仍为 84 个子路径与根入口。Mainline 增登记 `mainline.items.v1` 和 Storage 依赖。#2116 核实已经合入的批次，补记原遗漏，随主干保留原编号与归属。

| 方向 | 新增入口、归属与决定 |
| --- | --- |
| 状态 | `modules/characters/src/roles.ts:363` 区分任务明确选择、项目默认、个人默认和助理。当前任务保存稳定引用，`apps/local-host/src/characters-host.ts:108` 在执行前取固定版本。主线排列与修订归 `horizontal/mainline/src/store.ts:55` |
| 防御 | 角色版本与成员须对应当前人和项目，由角色服务读回。主线从可信上下文取得调用者和项目，再核来源声明和对象可读，见 `horizontal/mainline/src/items.ts:148,211`。保留等待后的副作用检查 |
| 用户体验 | 角色草稿在当前设置抽屉恢复，固定版本供执行回溯。事项的名字、位置与顺序通过同一服务读回。角色原件多次写的恢复和界面细节已登记，见 [角色后续事项](../backlog/BL-b36-review-followups-roles.md) |
| 冗余 | `modules/characters/src/roles.ts:311` 的角色列表为选择器和设置共同提供完整数据。主线合用原任务总表及关系合同。继续沿真实 Coding List Runtimes 调用核原 BL 中的重复读取 |
| 边界 | `apps/local-host/src/mainline-actions.ts:31` 负责开关服务连接。事项只保存名字、对象引用和排列，源插件写业务对象。Coding 会话角色选择和材料校验按原路由合并，见 `plugins/native/coding/src/routes-sessions.ts:221,279,362` |
| 平台化 | 事项来源、关联和主线呈现沿 `platform/work-items` 和 Placement。Sources 要申明可创建和打开的动作，以受信安装身份匹配。角色版本与继承沿模块服务，Agent Host 复用同一执行核定 |

QF-76。当前主干的 `docs/system/HOME-DATA.md:80` 仍把角色库写作 v1，表名也只列草稿与原生运行。实际 `modules/characters/src/open.ts:23,50` 已提供 v2 和受控的 1→2 空表升级。沿实际 open 和升级持有人更正登记，并补当前角色表。影响是开发者判断角色持久化与升级时可能查错表或版本，迁移成本仅文档。

角色与角色库的组合已通过 15 文件 134 项，含真实角色设置抽屉、保存、两窗版本冲突、保留输入、再次保存、范围拒绝、角色冻结以及当前 Home 结构。新主干实际画出的 52 份 Goal 标记均符合其已存基线。只对这些独立参考应用先前已经验证的导入短句、Sessions 输入长度与旧 `inbox_judgment` 清理，52 份均与合并候选实际绘制相同，据此更新 24 份预期，28 份逐条一致。证据 `quality-audit-b75-roles.log`、`quality-audit-b75-golden-proof.json`。主干首轮 Chrome 断言缺少专用浏览器参数，未计该项通过。

补用同一专用浏览器后，主干 FSS-36 通过。合并候选的完整 Goal 金样和浏览器用例 56 项通过，另两项生成模式按原规则跳过。健康、包边界、密钥、公开 API、动作合同、44 个库结构和生成版本检查通过。独立发布版本测试 34/35，仍只报退役的 Feed 例外。证据 `quality-audit-b75-golden-{main-browser,and-release}.log` 及同批门禁日志。

主线及签名、Inbox 真实消费者的首轮组合共 18 文件，17 文件全过、合计 97/98 项。未通过项为 QEA-145 的 `Page.loadEventFired` 导航等待，签名范围拒绝与逐项目凭据两个用例均通过。另一次 Coding 包级运行在进入后台列表前，未打开项目的准备前提与同一提交第一轮不同。未调整断言。固定 CODING-33 分别在独立 main 和候选各通过一次。保留两次不同结果，并以现在的代码继续验证 QEA-145 与相关 Coding 调用。证据 `quality-audit-b75-{mainline,coding,coding-open-main,coding-open-candidate}.log`。

Coding 44 个文件、190 项均有本地通过证据。长组为主线反证让出测试槽后续跑，保留初次 CODING-33、材料夹具 JSON 解析与 FSS-35 的失败日志。材料失败恢复用例同断言单独通过，未复现夹具的空正文解析。主干与候选分别通过 FSS-35 的真实切语言及会话草稿恢复。证据 `quality-audit-b75-coding-resume.log` 与 `quality-audit-b77-coding-{request,language-main,language-candidate}.log`。

签名插件实际换版的复跑还显示过已到新帧而提交反馈未出现。用例现在同时等待正式安装组件已有的就绪标记和原输入，再执行真实点击。实际设置、范围拒绝和不同项目的原断言均保留。QEA-145 已在新基线通过，真实浏览器和 HTTP 共 2 文件 10 项，清除临时诊断后的同一路径再通过。证据 `quality-audit-b77-signed-{ready,final}.log`。

新主干 `8d9f1fb01e` 与合并候选分别完整构建。两边以同一口径实测 66 条静态路径，24 条现有路径增长。最大是 Git 脚本 8,403 B，工作台脚本次之，为 4,510 B。正式清单的旧采样为冷最多增加 8,774 B、热最多增加 3,671 B。沿此前真实浏览器确认的 Home 任务 GET、首个事件和 Goal 集合请求，用当前构建实际 HTTP 逐条复算，最大为冷 8,567 B、热 1,039 B。主要差异仍是全插件工作台，选择页热加载少 319–324 B。新的工作台词包地址为中文 `172f41259a4548e001854a27`、英文 `cc8e3c8a877efd99be0e0e6b`。候选首轮在 Issues 采样超时，独立复测完整成功。证据见 `quality-audit-b75-{assets,main-assets,current-read-bytes}.json` 和两份 HTTP 记录。测量口径、资源登记和推送许可待结算。

### QF-77 / P1 已过期的事项转换返回冲突但实际新建目标

个人在当前项目转换事项走 Host 注册的 `mainline.items.convert@1`。主干 `horizontal/mainline/src/items.ts:169–176` 取得事项名后，先调用来源新建，再由 `horizontal/mainline/src/store.ts:159` 核对主线修订。QEA-149 在独立主干构建中从正常入口改名并保留旧修订，再发起转换。收到 `mainline.conflict` 和新排列后，Goals 的公开目录已多出一个真实目标，原主线保持未转换。使用者可能因失败回执再建一个。日志 `quality-audit-b76-convert-before.log`。

候选在 `horizontal/mainline/src/store.ts:76` 由 Mainline owner 以同一修订规则核准备转换的轻量事项，然后才向已登记来源请求创建。实际来源仍保存自己的对象。原主线事务在写入时继续核对修订和对象归属，来源已受理的操作可按原请求号恢复。优先修复实际业务副作用，迁移成本低，沿现有公开合同与存储结构上线。QEA-149 验收分开读回主线与 Goals，核冲突的零写入、原身份与关系、刷新修订后的单次创建。

完成构建及 QEA-149 的旧反证和修复后对照。相同旧修订的转换只返回主线冲突，真实 Goals 目录保持空。用当前修订重试同一请求后，新建一个以当前名字写入的 Goal，并保留原事项 ID 和那条真实装进关系。证据 `tests/mainline-items.test.ts:95`、`quality-audit-b76-convert-before.log` 和 `quality-audit-b76-convert-after.log`。第 76 批 66 条静态资源和第 75 批按真实入口测量的十组首屏字节完全相同。

原 MLC-13 用提交时已过期的请求制造冲突，同时要求来源完成一次写入。改为真正的等待交错验证原恢复意图：安装式测试来源先记录对象并暂扣回答，另一次已登记动作移动同一事项，原转换返回排列冲突。重试使用同一请求号并绑定原来源对象，来源数量保持。QEA-149 与 MLC-13 合在同文件的 13 项全部通过。第 76 批的 Mainline 包要求 12 文件 72 项均有通过证据。日志 `quality-audit-b76-mainline-package.log`、`quality-audit-b77-mainline-interleaving.log`。新代码组合的构建、健康、包边界、密钥、API、动作、44 个库结构及生成版本检查通过。

### 第 78 批 Inbox 响应性对照与第 79 批重复后台读取

同机顺次运行当前候选和独立 main，五轮均从隔离 Home 点击更新二十条固定规则建议。候选耗时 5,288、7,150、6,907、6,051、6,738 ms，中位 6,738 ms。main 为 4,851、4,826、4,871、4,852、4,935 ms，中位 4,852 ms。两边均在建议全部显示后提示完成，Inbox 每轮只重读一次。候选额外发出的健康查询每轮在产生第 4 条判断时返回，最大事件循环延迟 534–759 ms。候选 8–13 次后台 Goal 集合请求，main 一次含正文请求。该比较使用固定规则，候选带有额外探针，保留完整耗时差，并将请求数作为独立观测。日志 `quality-audit-b78-inbox-{candidate,main}.log`。

`plugins/native/inbox/src/scene-runtime.ts:190` 逐条让出后项目流水继续推进。`apps/local-host/src/attention-changes.ts:38` 按已提交事件发送原变动提示，原 `apps/workbench/src/scripts/client/initialization.ts:456–460` 收到每次新游标即准备后台读取。用浏览器网络单调时间确认，旧候选在一轮发出 14 次集合请求，相邻间隔 451–754 ms。重复读取占用与前台操作相同的宿主，影响等待时间和渲染，故列为 QF-51 下 P2，收敛集中在现有刷新入口。QEA-150 由正常请求反证，见 `quality-audit-b79-before.log`。

第 79 批 `35b2b406a8` 完整构建通过。工作台保留最新观察游标，整个 Goal 舞台隐藏时沿原四秒刷新周期读取集合。可见 Frame、正文恢复和显式保存读仍由同一控制器负责。实际 10 文件 44 项通过，覆盖 Inbox 隔离浏览器、取消后真实剩余写入、后台集合失败重试、在途提示、分栏、Feed 及成果/输入回读。之前主干上的 66 项静态对照只变化工作台脚本，原始 +16 B，gzip −86 B。日志 `quality-audit-b79-real-entries.log` 和 `quality-audit-b79-assets.json`。当前主干另行重测。

### 第 80 批主干子任务入口及 QF-78 / P2 同键读回绕过共享草稿锁

主干 #2115 改动 273 个文件，范围与候选交集 43 个路径，出现 8 处内容冲突。沿现有公开子任务接口核了两种原来源、工作台浮窗、SDK 和 Coding。沿 `apps/local-host/src/assistant/assistant-http.ts:380,393` 的原请求，经 `assistant-sdk-subtasks.ts:144`、`assistant-work-subtasks.ts:95` 或 Coding 正式路由进入精确的任务与执行身份，`horizontal/agent-host/src/subagent-actions.ts:28,35` 经原 owner 核处置并读回。候选在主干提取的 `assistant-work-view.ts:98` 保留记忆候选读取失败的独立反馈。原迟到确认与 Coding 材料授权继续由现有 owner 校验。用户在父任务的原面板中打开、关闭子对话，继续由主干浮窗管理焦点。Vendor 包采用已合入主干的同一产物。

主干新 `apps/workbench/src/browser/page-drafts.ts` 以浏览器缓存管理两种草稿消费者，写和比较写已按 owner 与键排队，读回直接访问缓存。将本轮 QEA-39 的同键顺序用例原样跑在独立 main，先暂停实际保存，再发后一笔保存和读取，得到 `null`，应为最新编辑。使用者可能在重挂时看到空草稿，后续编辑也可能基于过期值。日志 `quality-audit-b80-draft-before-corrected.log`。

合并候选在 `apps/workbench/src/browser/page-drafts.ts:10` 用同一缓存锁保护读、写和比较写。两个页面来源都沿这个 owner，frame 直接转发，删去本轮早先只在 frame 内按键排队的映射。保留前置缓存命名、权限、生效前核定和账号切换入账。迁移成本低，继续使用现行浏览器缓存。QEA-152 用已安装实际页面的公共草稿入口和助理真实子任务覆盖回读交错、失败后恢复及草稿保留。

QEA-151/152 当前构建实操通过。隔离浏览器 15 文件 48 项，包括 Cognia/Todo 三种真实保存及删除、失败后继续、账号准备、助理的 Home/项目与 Work/SDK 四个组合、Coding 三种真实入口、同组件的迟到确认和记忆失败后原地恢复。单独的 owner 组 14 文件 211/212 项，覆盖原问题与审批、失权零写入、材料调用和实际包来源。唯一失败是现已退役的 `plugins/native/feed/src/source-request.ts#materials_v1` 例外。构建首轮遇到浏览器 TypeScript 的锁回调 Promise 类型，按实际等待语义修好后完整重建。日志 `quality-audit-b80-{real-entries,owner-tests,regenerate-retry}.log`。

### 第 81 批项目任务停止职责

组合 `ed5416f420` 的健康门禁指出 `apps/workbench/src/browser/work-task-panel.ts` 的 `installTaskPanel` 同时维护布局和本页停止尝试。将尝试记录、原命令派发及 owner 刷新结算移到同模块的 `installTaskStops`。面板消费当前是否繁忙和刷新后的变化，列表、任务卡及事件卡仍可请求同一个原动作。本地读回还用来源能力和版本判定本次是否完整，未生成额外的业务状态。原门禁按 `6b0e8a4f83` 通过。QEA-153 实际七文件 28 项全部通过，包括明确拒绝、未知回执无自动重发、同一真实进程停止、保留读回、不同来源、浮窗和工作线。证据 `quality-audit-b81-{health,real-entries}.log`。

### 第 81 批 Inbox 真实路径复量

固定规则每轮二十条，在同一机器先测独立 main `6b0e8a4f83`，再测候选 `4776b778c1`，各五轮均通过。候选五轮各两次后台 Goal 集合请求，两次相隔 4,196–4,757 ms。main 各一次含正文的请求。两边每轮各重读一次 Inbox，同时显示二十条实际建议后提示完成。候选健康响应均在第 4/20 条判断时返回，最大事件循环延迟 449–711 ms。

候选耗时 7,188、6,221、7,674、8,805、6,973 ms，中位 7,188 ms。main 为 6,000、5,258、6,162、7,453、11,442 ms，中位 6,162 ms。两轮样本区间交叉，候选额外发送健康查询。本批证明了隐藏工作合并与宿主批次中可用，更新总时间仍保留性能待办。固定规则结果与真实模型延迟分别记录。证据 `quality-audit-b81-inbox-{main,candidate}.log`。

### 第 81 批首屏验收与待确认事项

独立 main 与当前候选各测 67 条静态资源，无发现或回放遗漏。25 条现有资源增加，最大为 Git 脚本 +8,403 B，工作台脚本 +4,663 B，Kit +3,855 B。候选的中英文工作台词包为 `3fe0daf45edd25f7db45b5e7` 和 `d7655fca1743ac25d692e8ae`。正式旧清单回放最大冷增 8,788 B、热增 3,671 B。

两个构建的独立浏览器抓取均见项目选择页的运行概况，以及三组工作台的首页 Attention 读取和首个事件。选择页实际由普通项目 Attention 换为 Home 读取和首个事件。当前候选启动样本未发 Goal 游标或正文请求。main 的示例项目实际会读该正文，两边新项目和全插件起始页均未观察到原登记的 Goal 请求。后台刷新和实际打开 Goal 后的读取由 QEA-113–115/150 单独验收。

以实测的 Attention、运行概况和 Goal 行校正量法，其余清单继续正常回放。下表为逐页实际 HTTP 字节净增，前者冷加载，后者热加载。

| 页面 | 中文冷／热 | 英文冷／热 |
| --- | ---: | ---: |
| 到达 | +1,156 / +19 B | +1,160 / +19 B |
| 项目选择 | +842 / −578 B | +841 / −583 B |
| 新项目工作台 | +7,530 / −8 B | +7,551 / +9 B |
| 全插件工作台 | +8,851 / +1,313 B | +8,885 / +1,343 B |
| 示例工作台 | −268,397 / −275,935 B | −270,065 / −277,607 B |

示例项目的大额差异来自首屏前未读 Goal 正文，切回或后续刷新仍单独读取。以现行门禁的主干旧清单比较，仅替换分支采样行时，受限页面最大增量为冷 1,437 B、热 19 B，仍需批准新采样行、内容地址和各静态增量。实际测量与政策模拟分开留证。日志和原始报告见 `quality-audit-b80-{main-live-first-screen,first-screen}`、`quality-audit-b81-{main,candidate}-actual-http.json`、`quality-audit-b81-assets.json`。新采样行只在临时测量文件中。

待完成的是首屏登记与资源许可、在准确候选头上的远端 Full、Feed 版本门禁的一行失效例外，以及固定版本导入警告的有限合同。前次资料导入首屏许可针对当时的词包及冷 261 B、热 38 B 范围。第 28 批批准的是其两项旧工厂门禁。现行候选的两个决定和原历史只读方案均有单独证据与本轮处置边界。

### 第 82 批获准的组合资源与版本验证

用户于 2026-11-17 批准 `04fb175c75` 已测的首屏、静态资源及草稿 PR 更新与 Full，并批准只删除 Feed 失效版本例外。版本例外清理独立提交 `b3426dd027`。发布版本测试 35/35 和现行 Feed 来源、动作、租约的三个文件全部通过，合计 4 文件 52 项。工作中的 Host 同名用法继续由其现有例外登记。证据 `quality-audit-b82-release-and-feed.log`。

资源登记独立提交 `8567f7b83b`。首屏清单使用实测新路径，旧采样标记仅供既有基点比较。新的许可记录 25 项静态增量、6 组需补足的首屏上限和 7 组具体入口，保留原资料导入许可。区域前后相同度量的绝对差异以第 81 批表为准。按正式测量策略用独立基点和候选 HTTP 实报计算零差异错误。门禁相关 3 文件 42 项通过，准确组合的远端运行以 PR 检查为准。[批准记录](../../tooling/gates/page-asset-allowances/quality-experience-audit-combination.json)

### 第 83 批远端失败与 QF-79 / P2 Coding 问答轮询丢失焦点

组合 `53e5435b93` 的 Full 第 21 分片两次失败，其余 47 片按分片配置取消。常规 CI 的包边界作业在首屏字节失败，产品子集第 2 片 82/83 文件通过，失败文件为 Pages 名称与上下文夹具。[首轮 Full](https://github.com/molis-ai/molis-work/actions/runs/44234525548) · [首轮常规 CI](https://github.com/molis-ai/molis-work/actions/runs/44234500384)

`plugins/native/coding/src/browser/main/configuration.ts:139` 把环境提示放在本轮用户输入后，`run-block.ts:117` 在轮询逐个复用消息，顺序游标遇到提示后把后面的问卷插到提示前。问卷节点及其字、光标仍在，重新插入使浏览器清除焦点，打断填写、输入法和字段拒绝反馈。独立 main 的正常浏览器 6/6，本轮旧候选 4/6。由原消息排列越过独立环境提示，保持已在正确位置的问卷及焦点。QEA-156 直接运行原真实问答，对环境准备、恢复和失败另做原入口回归。迁移成本低，沿当前工作台下发到正在使用的 Coding 页面。

`tests/pages-surface-naming.test.ts:55,180` 原夹具直接传普通对象，候选 `plugins/native/pages/src/browser/document.ts:210` 处理真实插件帧的可取消事件以避免双开。候选夹具 1/7，独立 main 7/7。夹具现沿 `apps/workbench/src/browser/plugin-frame/view.ts:18` 构造正常事件，保留捕获、目标、冒泡和取消语义，原断言 7/7 通过。真实页面使用正常 DOM 事件。

Linux CI 中全插件冷加载两种语言各比本机的门禁差额多 52 B。两边初始工作台 HTML 都随规范化目录长度缩短两次，主干旧采样另有一次附在 Goal 正文片段。将本机隔离 Home 路径由 56 缩到 12 字符，观测该片段对应少 44 B，候选只失去了两处共同的 HTML 差额。Linux 的目录为 4 字符，对应原额外片段少 52 B。已在同一个获批增量记录中按两种环境校正，真实首屏请求清单一致，原对照工具及阈值逻辑不改。修复焦点只增加现有 Coding 脚本 71 B，相对 main +844 B，组合最大静态增量仍为 8,403 B。

另用正常英文工作台导入 HTML，当前实际显示的中文提示与固定版本中保存的 schema 1 警告完全相同。界面和实际记录均来自隔离 Home。合同决定见 QF-15，证据 `quality-audit-qf15-real-current-corrected.log`。

### 第 84–86 批第二轮远端反馈

组合 `be56d98502` 的 Linux 首屏与静态资源均通过，Pages 产品子集第 2 片通过。常规 CI 后续报共享样式、安全第 3 片和产品子集第 1 片。Full 的第 15 片在 Coding 到 Git 的交接用例中失败，46 片取消，另有一片已经通过。[第二轮常规 CI](https://github.com/molis-ai/molis-work/actions/runs/44237115568) · [第二轮 Full](https://github.com/molis-ai/molis-work/actions/runs/44237138837)

#### QF-80 / P3 Coding 私有样式进入共享表

`plugins/native/coding/src/styles.ts:31,380` 只控制 Coding 的空白起始页和窄窗目录。它们原先通过共享根标记落在工作台表里，导致每页多带两条私有规则，Coding 共享预算由 9 实测到 11。给插件自己的起始面和目录使用现有命名空间，继续从同一布局状态判断。样式分配归工作台既有登记，具体可见性归 Coding。共享规则回到 9。基于实际 Host 路径，相对第 83 批，工作台共享 CSS 少 220 B，Coding 按需 CSS 多 174 B，两者合计少 46 B。Coding 按需 CSS 相对 main 增 64 B，登记为已有资源的小额变动。版本和 CSS 路径使用现有合同，迁移成本低。[资源记录](../../tooling/gates/page-asset-allowances/quality-experience-audit-coding-styles.json)

`tests/coding-git-handoff.e2e.test.ts:64,75,82` 在两次远端执行分别碰到确认框尚未准备和窄窗会话目录隐藏。测试现在等宿主原确认框可用，重载等原会话恢复，并在窄窗从真实返回控件进入 Files。核心交接、触发次数、写入、缓存失败、重开和目录移除前后的业务断言继续执行。记录 QEA-160。

`tests/goals-refresh.e2e.test.ts:146` 的产品子集第一轮用时 208.2 秒，第二轮 13 项已过后触及文件总时限 240 秒。QEA-113/114 的七个投影场景改用普通项目，只启动它们用到的 Goals 和 Workbench。原八项及跨插件探针仍走示例项目，产品子集继续执行原文件和全部 15 项。记录 QEA-161。

#### QF-81 / P1 Git 临时索引写入调用无关文件的过滤器

`apps/local-host/src/workspace-git-operations.ts:399–403` 在准备受审文件的临时索引时走原 `update-index --index-info`。Git 写索引时会复核其他条目的状态。安全分片两次失败，本机构建同版 Git 2.56.1 后用原真实用例复现。过程跟踪明确是准备索引时执行了无关过滤器，现有仅在 stat 刷新时禁用配置的做法覆盖不到。过滤器可能引入本次审查未说明的外部副作用。

索引准备和原有刷新统一使用 `apps/local-host/src/workspace-git.ts:53` 的配置覆盖。读取配置后再核调用权限，受审文件的转换和一次原 hook 保持原流程。实际锁、暂存与工作文件保持各自原写入边界。迁移成本低，已有索引无需改版。仓库配置被其他进程并发改写的原窗口保留在 S-53。QEA-162 检查预览、写入、刷新和原钩子次数。[安全边界](../../docs/system/SECURITY-INVARIANTS.md)

本地复验中，插件样式预算通过，相关构建规则与源码边界 7 文件 102 项通过。Coding 的布局、生命周期、Git 交接 3 文件 6 项通过，最终夹具加三倍 CPU 节流再验交接 1/1。Goal 原产品子集在有其他本地任务运行时 162.3 秒通过 15/15，同一时限在 Linux 上重新验证。Git 2.56.1 的全部 20 项操作测试通过，系统 Git 下操作、Host 动作、真实产品 HTTP 和状态共 4 文件 30 项通过。记录 `quality-audit-b84-browser.log`、`quality-audit-b85-local-goals-subset/report.json`、`quality-audit-b86-{handoff-throttle,gate-tests,git-v256-operations,git-system-corrected}.log`。

提交 `03ed575a31` 相对 main 涉及 512 个文件。[常规 Verify](https://github.com/molis-ai/molis-work/actions/runs/44241235505) 通过，含资源、包边界、安全与产品子集。[Full](https://github.com/molis-ai/molis-work/actions/runs/44241265336) 的第 22 片在 `tests/contextual-pages-goals.e2e.test.ts:279` 检查无效链接与建议展开状态时失败两次。几何用例一次失败、重跑通过。该 Full 仍未通过。

### 第 87 批获准的导入警告合同

`apps/local-host/src/artifact-original-text.ts`、`modules/artifacts/src/artifact-document-import.ts` 与 `plugins/official-integrations/catalog/src/document-import.ts` 提供键及参数。导入 owner 用可信 Workbench 身份绑定回执。`apps/local-host/src/artifact-display-words.ts` 按实际类型、schema 和生产签名读取固定记录，`apps/workbench/src/artifacts/browser-ui.ts` 及其导入面板按当前语言显示。旧版本照原文读取。成功导入 Google Docs 的说明聚焦这次实际保存的内容，连接授权处理仍从原入口给出。

`apps/local-host/src/artifact-type-registry.ts` 的继续处理按确切类型及 schema 匹配。Host 建议展示和实际派发复用同一判断，Pages 声明两种可读 schema，同一版本只显示一个入口。SQLite 与同步 envelope 无结构变化。`artifacts.import.file/external@1` 的 `warnings` 从字符串改为 OwnedTextRef，现有工作台调用方已迁移，直接消费回执的 MCP 或工作流调用方按新输出结构读取。版本门禁只接入已批准的导入固定格式 2，未知 3 与无关格式 2 的反证通过。[合同登记](../../docs/system/CONTRACT-CHANGES.md#当前保留机制)

QEA-79 在真实隔离 Home 新导入及固定版本预览验证中、英文，三种宽度和两种主题生成 12 张本地验收图，切换语言后固定记录及摘要逐项相等。原转写失败、空正文、超时回复及恢复 3/3 通过。QEA-80 的独立 Host 实操通过原 schema 1 的下载、重启后逐字段导出、重导追加、重复导入复用、两种版本分别走 Pages，以及未知格式拒绝。当前发布动作也实际拒绝新写 schema 1。同步记录的原文与键参数在同一真实 codec 往返后相等。定向回归累计 9 文件 80 项有通过证据。第一次新历史夹具缺少 media_type、随后碰到当前写入拒绝，夹具改为准备已存在的历史快照并保留写入拒绝断言。单独隔离 Home 复验两种宽度继续到 Pages 共 2/2 通过，包含新建和实际读回。首次和其他浏览器同跑时 1440 项超时。证据 `quality-audit-qf15-continue-retry.log`。

同口径实报相对 `03ed575a31`，最大冷加载再增 921 B，热加载实测相同。现有 `molis-work-knowledge.js` 再增 38 B。中文词包内容地址 `edfbad487ed13f33cb345453`，英文 `d2cfe764e8fa4c8bc25d0542`。该测量使用 `6b0e8a4f83` 为门禁基点，随最新 main 比较后登记到同一草稿 PR。原实操日志 `quality-audit-qf15-{browser,tests,legacy,http-retry}.log`。

### 第 88 批 QF-82 / P2 先前展开的 Goal 建议被后台集合更新收起

`plugins/native/goals/src/page/workbench-stage.ts:81,102` 把建议放在原 Goal 集合中。`apps/workbench/src/scripts/client/documents-state.ts:126` 读出展开状态，`refresh-decisions.ts:10–14` 用当前项目的浏览器缓存保存。实际打开建议再重载，记录中可读到展开。随后 `refresh-decisions.ts:205–227` 应用集合投影，只恢复层级折叠、筛选和选择，建议节点的 `open` 因重绘回到关闭。原候选可观察到缓存依次保存展开、展开、关闭。账户分区用逻辑键读取，之前只枚举原始物理键的探针无法判断是否已保存。证据 `quality-audit-b88-disclosure-stored.log`。

工作台现以同一规则恢复整页和这次替换的集合。Goals 的建议正文、是否可决定、受信批准和固定记录仍由原路径维护。原地展开只更新浏览器布局。迁移成本低，沿已有状态字段恢复。QEA-163 在原 Pages 来源里走拒绝、重试、批准和读回，后续重载及无效链接均等投影真正应用后检查同一条建议。

修复构建的原实操 3/3 通过，其中两项检查独立建议和关联已有 Goal 的建议。旧候选的直接建议重载探针可稳定复现合上。旧候选同份长链路的两项另在有效建议链接处超时，不能作为尾部断言的反证。工作台已在两种入口验证保留另一份展开的建议与未提交的意见，已批准的目标、关系和建议持久记录逐项相等。证据 `quality-audit-b88-{acceptance,actual-baseline,disclosure-stored}.log`。

原 Goal 刷新、分窗和后台投影另 3 文件 17 项通过，含可见/隐藏投影的失败恢复、当前数据、刷新时窗格的变化。正式首屏和静态资源规则 2 文件 31 项通过。本批追加共 5 文件 48 项，证据 `quality-audit-b88-related.log`。

现有工作台脚本相对以下第 89 批测量再增 35 B，实际工作台冷加载同增 35 B，热加载、目录发现和请求路径相同。最大静态净增的既有批准范围不变。此小额资源与 QF-15 两个新词包分开登记。[资源记录](../../tooling/gates/page-asset-allowances/quality-experience-audit-goal-disclosures.json)

### 第 89 批主干整合与首屏复量

已整合 main `eaa6b47492`。主干删除从无生产方的 `goal-acceptance` 审查 owner。合同由 `packages/contracts/src/platform/reviews.ts:13,31` 声明，Agent Host 回执、Mainline 投影和项目审批核对现有的生产 owner。主干的删除与本轮导入、Sessions、Coding、Goals 的动作变更都已重新生成公开快照。工作线读取、Agent 审查 HTTP、项目审批共 3 文件 30 项通过。本地 Golden 验证启动后撤出未计入，随 Full 结算。111 个 API 文件、640+617 个动作、44 个库快照和现行内容版本规则都通过。[本批主干 PR](https://github.com/molis-ai/molis-work/pull/2119)

候选 `70d7f3659e` 与最新 main 均用独立 Home 回放同一正式量法，静态资源各 67 条，零发现遗漏。下表比较上一获批并已推送的 `03ed575a31`，两边热加载实测差额为 0。

| 页面 | 中文冷增 | 英文冷增 |
| --- | ---: | ---: |
| 到达、项目选择 | 883 B | 844 B |
| 默认、全插件和示例工作台 | 902 B | 863 B |

这次实际增加的静态文件为 `/assets/molis-work-knowledge.js` +38 B，工作台脚本减少 19 B。以最新 main 合并基点计算，最大冷增 2,100 B，最大热增 19 B。正式量法还需到达与项目选择的中英文冷额度 663／624 B，全插件工作台中英文冷额度 693／654 B。按第 83 批验证过的路径长度，再计全插件 Linux 冷额度各 8 B。新增词包为 `/assets/locale/workbench.zh.edfbad487ed13f33cb345453.js`、`/assets/locale/workbench.en.d2cfe764e8fa4c8bc25d0542.js`。用户于 2026-11-17 批准这两个内容地址和所列增量。原实报 `quality-audit-b89-{main,candidate}-{http,assets}.json`，对比 `quality-audit-b89-gate-comparison.json`。[批准记录](../../tooling/gates/page-asset-allowances/quality-experience-audit-import-warnings.json)

加入第 88 批后，将 67 条实际静态资源及各页面的冷、热读回交给现行检查，两个检查均通过本机对照，已知 Linux 目录差额的对照也通过。组合相对上一推送最大首屏冷增 937 B、热增 0 B。新资源仅为已批准的两个词包地址。证据 `quality-audit-b90-resource-gates.log`。

首次组合提交 `e944553a63` 的本机健康检查拒绝了本轮改写的 spec 状态行。已恢复仓库要求的格式，组合源码及资源与原实测相同。组合验收以此后更正的提交为准。

### QF-83 / P3 英文资料侧栏仍显示中文的来源分组（PF-15）

QEA-79 的英文宽屏实操中，导入警告和成果详情已是英文，资料侧栏仍显示「项目成果」「置物架」。两个标签来自 `modules/artifacts/src/artifact-actions.ts:59` 与 `plugins/native/shelf/src/search.ts:45` 的动作声明。`apps/local-host/src/side-files-http.ts:48,94` 转发动作标题，工作台 `apps/workbench/src/side-panel-files.ts:263` 原样绘制。隔离 Home 实证 `qf-15-en-1440-light.png`。

资料侧栏与 Goal「加输入」已经共用这一个发现与首批读取入口。补充平台文件来源的显示合同是候选处置。来源 owner 声明自己的标签，Host 按该次界面语言和真实提供方取词，两个页面消费同一显示结果；动作标识、文件名和用户目录仍由原主人负责。复用现有 TextRef 与词包解析，保留外部声明的原文。还需确认来源分组与系统生成的虚拟文件夹标签如何声明，至少迁移成果、Shelf 与一个项目插件，经两个真实消费者验证切换语言。影响为界面语言混用，处置需要补充公开来源合同和迁移多方声明，排在当前审批写入与已确认的正常路径回归之后。

### 第 91 批 Linux 发布检查和资料目录消费者迁移

组合 `2d95751704` 的 Linux 源码健康检查和 Package boundaries 已通过，含静态资源、首屏和原包边界。发布版本检查指向 `apps/local-host/src/artifact-display-words.ts:30` 重复写入旧 schema 数字。本机用同一检查复现，修复后实际发布版本和生成值均通过。现行写入标记继续由成果公开合同维护，同一份警告编码声明用于历史读取和可继续处理格式。动作快照一致，公开 API 只更新成果快照。

该头的 Full 第 17 片中，`tests/knowledge-fresh-catalog.test.ts:49–54` 仍把导入回执当作字符串，两次失败后其余片随原流程取消。夹具采用导入 owner 的公开结果类型，检查可用正文和精确警告，保留目录入库、状态、引用和实际内容可检索的断言。QEA-79/80、资料目录、资料 HTTP、资料隔离及发布版本共 6 文件 28 项通过。新旧版本、取消、实际写入与真实界面继续入验。资源复测与已批准组合逐项相同，静态 67 行及逐页 HTTP 冷热读回一致。证据 `quality-audit-b91-{release-before,release-after,acceptance,api}.log`。[本次 Full](https://github.com/molis-ai/molis-work/actions/runs/44249906400)

同一头的 Auth 浏览器失败发生于固定 Auth 源 `82341ae269` 的 `web/scripts/v2-browser.test.mjs:541`。正常绑定流程在换号码后只等输入框存在，该轮点击时控件还处于「发送中」。本轮对 Auth 固定版本、工作台提供的公共测试工具和该工作流均无差异，同一固定源在第 86 批 Verify 通过。账号合同、隔离和 Web 用例随新头复验。[Verify](https://github.com/molis-ai/molis-work/actions/runs/44249861825)

### 第 92–96 批集成全量与资源复验

候选 `ce1ad92513` 的 Verify 已通过发布版本、Auth、产品子集、安全和包边界。按批准将同一提交推到临时集成分支，48 个 Full 分片执行结束，36 片通过、12 片失败。先前 Pages 到 Goals 的三个场景全过。根据逐片证据继续处理确认的问题。[Verify](https://github.com/molis-ai/molis-work/actions/runs/44252658863) · [集成 Full](https://github.com/molis-ai/molis-work/actions/runs/44253362203)

单份待转写的英文把 `file` 写成了复数。工作台导入页按真实待处理数量请求同一翻译键，由词包提供一份与多份两种词形。相对 `ce1ad92513`，这条文字使英文首屏冷加载增加 13 B，热加载相同，中文内容地址相同。新的英文内容地址是 `/assets/locale/workbench.en.15bd7a4fb32d9806c1333c91.js`，用于到达页、项目选择、默认和全插件工作台。示例工作台同样量得 13 B。现有静态资源无新路径，当时工作台脚本增加 148 B、Coding 脚本增加 67 B。该轮组合实测最大首屏冷增 161 B，热加载相同。原数据 `quality-audit-b96-{http,assets}.json`，最终组合与批准见第 100 批。

#### QF-84 / P2 首页后台读取移动当前行

`apps/workbench/src/browser/project-home.ts:203,226` 的同步提示占据列表上方一行。集成几何实测「更多操作」的按钮和父行同时上下相差 30.40625 px，按钮大小仍是 32 px。隔离 Home 在一次真实 Goals 写入后持有响应，旧版出现「正在更新…」且聚焦行移动。Workbench 用当前已显示数据决定需要哪种提示。已有内容的后台读取保持布局，首次加载、失败和主动重试使用原状态位。第 96 批 QEA-164 验证原行和焦点、迟到结果取消、下一项目隔离、暂时失败后的显式重试和实际 Goal 读回。三倍 CPU 下候选验过 785 个控件和 16 个边框。改动成本低。

#### QF-85 / P2 Coding 环境卡无法在窄窗显示 Files

`plugins/native/coding/src/browser/main/click-round.ts:167` 原先向隐藏的 Files 控件转发点击。选择状态已变，`plugins/native/coding/src/styles.ts:377` 管的窄窗目录仍被正文遮住。390 宽的隔离 Home 复现后，让 Coding 沿现有目录可见状态露出 Files，焦点落在实际控件。QEA-166 走真实仓库、依赖状态和环境卡，复验返回原会话、显式发送、结束后的基线准备、草稿读回及磁盘的 Git 冲突仍在。用户一次点击即可看到文件。成本低，无数据迁移。

#### QF-86 / P2 填写 Goal 标题时看不到新关系候选

`apps/workbench/src/scripts/client/refresh-decisions.ts:87` 曾把创建对话框内的全部输入视作集合更新的阻塞。实际新增 Goal 已返回 201，仍聚焦标题时原候选没有出现。现按哪些控件将被替换来判断是否延后，只有关系选择期间保留旧候选。Goals 的原表单刷新 `plugins/native/goals/src/dialogs-client.ts:257,297,302` 保留草稿、关系、焦点和选区方向。QEA-167 证实用户不用关开或失焦便可看到新选项，关闭草稿后核回真实数据。迁移成本低。

#### QF-87 / P3 待转写提示的英文单数

`apps/workbench/src/browser/knowledge/import.ts:112` 给出真实待处理数，`apps/workbench/resources/locales/en.json:9986` 曾只定义复数。继续使用现有按计数选词机制，在同一翻译键下补齐两种形态，转写队列和按钮继续消费原状态。QEA-165 在 Host 和浏览器取同一份词。新地址和实测见本节上方，改动成本低。

#### QF-88 / P2 连接设置普通返回销毁 OAuth 草稿

在 Jira 展开 OAuth、输入未保存地址，切外观设置换语言后返回。候选和 Linux 均复现原组件不再连接，独立 main 同一用例通过。`apps/workbench/src/scripts/connectors-settings.ts:107` 更新页内地址，`apps/workbench/src/scripts/client/settings-directory.ts:85,217` 曾把它同时当作先前按显式地址加载的缓存；点击普通设置分类时因此重新加载。控制器区分两种现行入口，按分类打开的原组件可回到界面，显式深链使用设置自己的替换和保存流程。QEA-168 复验英文与中文、原焦点及草稿、从其他深链进入和 Kit 的消费后返回。成本低，改动共享设置入口。

#### QF-89 / P2 Home 与项目的通知连接消耗同一连接池

Linux 的第四窗能读项目文件，后续保存外观超时。隔离 Home 用同一组页面确认当时四条外观流和两条注意力流都打开。注意力流的地址由 `apps/workbench/src/scripts/client/attention.ts:162,196` 与 `apps/local-host/src/web-project-platform-routes.ts:313` 装配，聚合首页和项目读回各持一把锁。复用已有 Home 无内容的失效流，按源只保留一个浏览器监听者。每窗从原 `readAddress` 按自身权限加载实际数据，切选中项目时取消旧读回，各窗仍核对自己的外观。迁移成本中，需验证窗间接棒、跨项目任务、原授权拒绝和首屏实际地址。Home 的失效会让多个可见窗口按现有合并时限各读一次，读取仍走各原 scope。

第 92 批的 QEA-48 正常浏览器通过。Coding 卡片和任务面板均增加本子任务预算，失败恢复后只执行本人点击的重试。问卷能力与冻结的原角色一致，原派出时附属的看板工具不带进重试。第 96 批首页、Goals、Coding 正常入口合计 10 项通过，QEA-164/166/167 和候选几何验收有本机证据。第 94 批的清单、金样格式、导入错误、Coding 材料断言，以及第 99 批 Git 夹具仍沿同一 Full 流程结算。助理原问卷在首轮等待超时后由 CI 复跑通过。文字截断还在核对出现时的实际元素和尺寸。

### 第 100 批共享通知与首屏实测

2026-11-18 用户批准上节的英文词包地址 `15bd7a4fb32d9806c1333c91`。合并第 97–100 批后按原独立 Host 工具复量。项目选择、默认工作台、全插件及示例工作台各将已登记的项目注意力流换到现有的 Home `/api/attention/events`。每页仍一项首帧请求，每次取首帧都是 259 B，冷、热均与原流相同。用户同日批准这项首屏地址替换及随原草稿和集成分支验收。

| 页面 | 中文冷差额 | 英文冷差额 | 中文及英文热差额 |
| --- | ---: | ---: | ---: |
| 到达页 | 0 B | +13 B | 0 B |
| 项目选择 | −361 B | −348 B | −361 B |
| 默认、全插件与示例工作台 | +59 B | +72 B | 0 B |

相对已推送的 `ce1ad92513`，组合最多增加 72 B 冷加载。67 项静态资源仍为原路径，Workbench 增 59 B，Coding 增 67 B。实际数据为 `quality-audit-b100-{http,assets}.json`，对照原报告 `quality-audit-b91-{http,assets}.json`。[词包登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-transcription-english.json) · [首屏地址登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-shared-attention.json) · [脚本增量](../../tooling/gates/page-asset-allowances/quality-experience-audit-refresh-recovery.json)

| 复验 | 本机实证 |
| --- | --- |
| QEA-168 设置缓存 | 原 FSS-35/36 失败用例修复后通过。Kit 草稿、连接页和设置行为另 3 文件 50 项通过，保留相同的保存、失败和恢复条件。 |
| QEA-169 通知和外观 | 5 文件 11 项通过。四个真实窗口共用一条注意力流，第四窗读真实项目文件且外观选择写入修订 1，另外三窗原侧栏更新。选中 Alpha 后由 Beta 的真实 Goal 写入唤醒首页聚合。旧项目的三种迟到回答均未到达新项目；空闲请求约束通过。 |
| QEA-170 Git | 7 项通过。Git 2.56.1 禁用机器身份回退，测试仓库使用自己的配置。Coding 走可见目录控件，Git 与 Coding 实际都只提交获批记录。 |
| QEA-171 截断 | 三倍 CPU 的旧顺序录到鼠标先进入完整标签，再落到标签带空白。用现行取点跑完整 VUX-05，两个宽度所有原入口与键盘、触屏共两项通过。悬停在同一文字时仍要求完整提示。 |
| 清单、错误和金样 | 修复后原 6 个定向文件 67 项通过。另 7 个文件 141 项通过，包含 34 项插件页授权、完整的外观资源与首屏规则、通知合同和 Goals 金样。金样 52 项记录的哈希与长度均沿用原值，只恢复文件缩进。金样文件内两个原录制开关保留。 |

上述组合完整构建、源码健康、包边界、发版版本和密钥检查通过。准确推送头 `2eef54d545` 的两个远端验收中，Verify 的其余 66 项产品用例文件通过，只有 Goal 刷新文件两次触及 240 秒上限。集成 Full 的 48 个分片全部结算，46 个通过。第 31 片暴露组件板样本提醒，第 32 片暴露 Coding 的两条窄窗路径。上一轮暂存和提交失败已经在第 32 片恢复。 [Verify](https://github.com/molis-ai/molis-work/actions/runs/44266457909) · [集成 Full](https://github.com/molis-ai/molis-work/actions/runs/44266449597)

### 第 101–103 批 Goal 产品冒烟、组件板和 Coding 窄窗

QEA-172 将仅依赖 Goals 的六个原旅程放进同样种了 Goal 数据的普通项目。写入和读回使用该项目 ID。归档与恢复、Feed 组合继续用原多插件项目。相同本机三倍 CPU 条件下全部 15 项从 150.680 秒降到 139.751 秒。原产品子集命令在 133.7 秒完成，同样使用 240 秒上限。[测试文件](../../tests/goals-refresh.e2e.test.ts)

#### QF-90 / P2 共用注意力流使助理组件板漏掉样本提醒

组件板模拟 Host 同时拥有样本数据和注意力通知，只有其独立前缀下的地址会收到样本流。正常页面复用 Home 流后，组件板也去请求它拒绝的根路径，原铃铛测试在远端及本机均失败。共享客户端接受由页面 owner 注入的通知地址，组件板继续读自己的样本，真实工作台沿第 100 批批准的 Home 流。负例之后，组件板、四窗外观写入和注意力范围隔离 3 文件 9 项均通过。[模拟 Host](../../apps/workbench/src/browser/board/assistant-frame.ts#L126) · [组件板装配](../../apps/workbench/src/assistant-board-frame.ts#L97) · [通知客户端](../../apps/workbench/src/scripts/client/attention.ts#L23)

QF-65 的窄窗回归在 780 × 493 的内容区复现。待审面在打开设置时仍保存 301 px 占位，返回时滚动已经恢复到 146 px。真实审查读取在途时，父页随后发布空容器的 0 px，滚动被截回 0，原拒绝按钮下移到工作面外。工作台按实际绘制内容或确定为空的结果回报尺寸，重复尺寸不再发送。Coding 目录切换的第二轮则经 Sessions 的当前行回到会话，继续实际操作可见控件。整合候选的四项 QEA-174 通过。四次切换各读回原目录编辑。等待真实 Host 回答时仍在原位置，返回后直接拒绝同一请求，HEAD 保持，重试及后来批准只清理对应草稿快照。两笔获批提交均只写一次。[审查槽](../../apps/workbench/src/browser/plugin-frame/reviews.ts#L107) · [Git 和 Coding 实操](../../tests/git-edit-drafts.e2e.test.ts#L119)

### 第 104 批主干子任务修复交集

两条实际入口分别从助理工作和 Coding 工作台到 SDK 的同一个对话适配。SDK 复用带版本的等待投影，主动读取与订阅交错时检查代次。草稿比较和原请求的结算绑定编辑器当时持有的版本。子任务历史与预算由 Agent Host 读原运行，Host 和插件分别校验本人及父工作，运行前复核权限，写入后由原回执报结果。主干清理首读重复取历史和无变化时重绘助理问题卡。工作台同时保留本轮停止命令去重及主干按原始点击路径判断浮窗归属的修复。[助理入口](../../apps/workbench/src/browser/assistant-subtasks.ts#L60) · [Coding 入口](../../plugins/native/coding/src/browser/subtask-conversation.ts#L31) · [SDK 适配](../../packages/plugin-sdk/src/browser/agent-subtask-source.ts#L29) · [草稿结算](../../packages/plugin-sdk/src/browser/subtask-draft.ts#L47) · [Agent Host](../../horizontal/agent-host/src/adapters/prologue-subagent-conversation.ts#L91) · [任务面板](../../apps/workbench/src/browser/work-task-panel.ts#L248)

### 第 104 批资源复量

用同一测量器回放本轮候选和独立主干构建的 67 条静态资源、五种页面和两种语言。主干 `565840cce4` 相对构建基准 `2315213aba` 只补子任务 spec 记录。候选与上次推送 `2eef54d545` 相比，中英文共十组首屏的冷加载最多加 124 B，热加载相同或少 8 B。两个词包和实际首屏请求地址与已推送版相同。对最新主干，所有页面最大净增为冷 1,942 B、热 19 B，静态资源最大净增仍为 Git 脚本 8,403 B。

本轮新增许可覆盖既有插件帧 123 B、工作台新的基线差额 15 B、助理子任务脚本组合差额 2 B。到达页按各语言 123 B 登记。全插件页按各语言实际冷差额 130 B，加第 83 批已验证的 Linux 路径差额 8 B。默认项目和选择页仍在已有许可内。原始数据 `quality-audit-b104-{http,assets,main-http,main-assets}.json`。[实测登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

实际测量、按已验证 Linux 路径差额复算及静态资源政策比较均为零问题，22 条实际新增首屏要求仍由原批准匹配。完整重建及包边界、111 份 API 快照、动作合同、44 个结构快照和生成版本检查通过。组合的远端结论沿草稿 PR 保存。[草稿 PR #2101](https://github.com/molis-ai/molis-work/pull/2101)

### 第 104 批远端结论

`704773fe8e` 的 Verify 通过，Goal 产品子集 67 个文件全部通过，其中原刷新文件 15 项用时 169.3 秒，沿用 240 秒上限。临时集成分支同一提交的 Full 首轮 46/48 通过，Inbox、组件板，以及 Git 和 Coding 实际拒绝与批准用例均通过。第 23 片的长代码块和第 32 片的 Coding 目录恢复有失败，分别在下文追踪。[Verify](https://github.com/molis-ai/molis-work/actions/runs/44277560925) · [Full](https://github.com/molis-ai/molis-work/actions/runs/44277548609)

只复跑这一提交的第 23 片。长代码块在同一文件的首轮又超帧，文件自动重试通过，该片通过。第 32 片沿用原失败结论。这些都保留为旧提交的结果。[第 23 片复跑](https://github.com/molis-ai/molis-work/actions/runs/44277548609/job/134740577371)

本机额外复跑中，独立 Git 的等待曾超时，同一用例单独复跑通过。Inbox 在负载较高时出现两次 CDP 超时，独立主干也未能挂载该场景，保留这组本机结果。Linux 第 25 片完成了 Inbox 真实批量路径；重复刷新移除已有实测，整段处理耗时仍按 QF-51 留作后续跟踪。[Full 第 25 片](https://github.com/molis-ai/molis-work/actions/runs/44277548609/job/134709422122)

### QF-91 / P2 重开助理长代码块时，首次布局与着色争占一帧

隔离 Home 的正常入口发送八段助理回答并等待真实工作完成。代码原文约 90,000 字符，重新打开同一工作时，Linux 首次测得最长帧 141.7 ms，超过原 VUX-33 的 100 ms。本机 3 倍 CPU 限速诊断中，着色回调及其观察器合计最长约 34 ms，另一次读取处理在着色前触发了约 160 ms 的同步布局。整段着色对照计算在该诊断的采样之后。可直接移除的强制读取位于助理渲染入口，只有用户已离开尾部时才需要前后高度比较。[Linux 第 23 片](https://github.com/molis-ai/molis-work/actions/runs/44277548609/job/134709421749) · [助理渲染](../../apps/workbench/src/scripts/client/assistant-island.ts#L408)

Workbench 先交付完整原文，给初次布局一帧，从下一帧按现有片段图着色。流式更新保留已经处理的前缀、复制原文和用户的折叠选择。片段图仍经 Host 的回复读取，着色、跟尾和离开后的提示由原视图判断。无需数据迁移，对页面影响限于首次接入大代码块和跟随窗口的重复高度读取。保留原逐帧推进、整段色标、首帧原文、原节点和时间上限，新验收还记录先显示原文的帧数。[着色任务](../../apps/workbench/src/scripts/client/assistant-code-grow.ts#L60) · [QEA-176](../../tests/code-scale.e2e.test.ts#L231)

第 105 批首次定向结果。完整构建通过，三倍 CPU 下已读到完整的 90,038 字符，前两帧为原文，后续逐帧推进并吻合整段色标。最长帧仍达 194.7 ms，时间验收保持失败，继续定位首次页面工作的具体来源。日志 `quality-audit-b106-frozen-focused.log`。

### 第 106 批 Coding 目录恢复实操顺序

窄窗重载后，Coding 恢复原会话并将正文置前。旧测试在恢复完成前看到 Files 控件，随后点击到 CSS 已隐藏的控制项。夹具现在读回同一会话选中值及其工作栏归属，再经可见返回按钮进入 Files。四次目录切换、两份提交与分支草稿、两个真实 Git 仓库和原 780 × 493 尺寸保留。[QEA-177](../../tests/git-edit-drafts.e2e.test.ts#L119) · [Linux 第 32 片](https://github.com/molis-ai/molis-work/actions/runs/44277548609/job/134709422258)

在同版 Git 2.56.1 和三倍 CPU 限速下，Git 与 Coding 两项定向实操均通过。保留目录选中、独立草稿和提交次数原断言。日志 `quality-audit-b106-frozen-focused.log`。

### 第 107 批主干文案、规格书和存档交集

同步 main `43a3c3fa2f`，其中逐屏打磨新增设计文档和原型，路线书重排 36A、63A 及 72/77，产品文案更新沿原事实与权限返回。中文补充回执的词汇由公开 `RECEIPT_WORDS.FACT` 提供，工作台即时反馈和 Coding 由账本及同一组文字解释。资料排除动作仍由 Knowledge 掌管结果，入口更新名称。核对了 55 个活跃 spec 的有效路径及 547 条 BL 的原分类，未把方案或点击样稿算为实现。WebQuery 是主干有而本轮已批准移除的唯一包，现行 YouTube 频道和来源拉取不受此合并调整。[回执合同](../../packages/contracts/src/platform/ui.ts#L705) · [资料动作](../../packages/contracts/src/services/knowledge.ts#L469) · [逐屏打磨](../screen-polish/spec.md) · [第 36A 批](../post-anticorruption-roadmap/reference/batches/36a.md)

独立主干构建重现 52 个 Goals 存档原字节。以其输出推导四项已验变化，中英文 16 个整页分别净增 1 和 32 字符，8 个完整刷新片段各少 22 字符，其余 28 项保持原期待。候选按相同规范化口径比较，原词表、完整段落及数据断言保留。首次独立重放遗漏专用浏览器配置，词表用例另按固定浏览器补跑。原样本及推导日志 `quality-audit-b107-main-golden.log` 和 `quality-audit-b107-golden-derived.json`。[存档验收入口](../../tests/goals-page-golden.test.ts#L248)

候选生成的全部 52 个规范化页面逐字节吻合独立推导，未用候选重新录制预期。候选存档测试 56 项通过，两项录制模式按原条件跳过，包含专用浏览器的 Goals 真实取词。第 107 批整段着色对照在重开前生成，重开后只采帧，收齐色标后才一次性比较 HTML。三倍 CPU 的一次直接复跑 110.6 ms，随后带布局归因的实测为 61.8 ms，明确了下批处理位置。[颜色对照](../../tests/code-scale.e2e.test.ts#L262)

### 第 108 批输入栏跟随实际位置

三倍 CPU 的布局追踪中，工作区深层内容变化调用事项线的全子树观察器。输入栏重设列后再读 `.tab-pane.is-focused`，一次同步读取 107.4 ms。同宽同高的隔离 Home 反证捕获两次列重设。将位置监听交给标签工作区既有事件，只观察当前窗格自身的定位样式，保留视窗、舞台尺寸与当前插件列宽通知。[位置事件](../../packages/contracts/src/platform/dom-events.ts#L319) · [输入栏布局](../../apps/workbench/src/browser/work-line-layout.ts#L300)

更新后原反证为零次重设，用户实际拖分隔条时输入栏的列同步变化，原取消拖动、键盘、窄窗、侧栏与多行输入验收通过。90,038 字符助理回复重开仍先显示完整原文，着色过程采到七帧，最终吻合独立对照，最长帧 39 ms，原上限 100 ms。完整构建与三文件三项定向实操通过。日志 `quality-audit-b108-{build,placement-before,real-placement}.log`，存档字节证据 `quality-audit-b108-golden-byte-proof.json`。[长回复实操](../../tests/code-scale.e2e.test.ts#L231) · [输入栏反证及视窗验证](../../tests/work-line-shell.e2e.test.ts#L53) · [分隔条实操](../../tests/split-divider.e2e.test.ts#L13)

### 第 107–108 批资源复量

main `43a3c3fa2f` 与候选独立构建并实测了 67 个静态资源和十组首屏，未发现遗漏。下表每格为冷、热加载字节变化。两栏均包括公开的实际 HTTP 响应头与响应体。

| 页面及语言 | 相对 `43a3c3fa2f` | 相对 `704773fe8e` |
| --- | --- | --- |
| 到达 / 中文 | +2,071、+19 | +337、0 |
| 到达 / 英文 | +1,967、+19 | −204、0 |
| 选择 / 中文 | +2,094、−241 | +451、+114 |
| 选择 / 英文 | +1,985、−246 | −94、+110 |
| 默认项目 / 中文 | +258、−8,461 | +279、−177 |
| 默认项目 / 英文 | +167、−8,448 | −1,469、−1,384 |
| 全插件项目 / 中文 | +1,506、−7,213 | +305、−151 |
| 全插件项目 / 英文 | +1,426、−7,189 | −1,522、−1,437 |
| 示例项目 / 中文 | −267,009、−275,728 | +717、+261 |
| 示例项目 / 英文 | −268,420、−277,035 | −1,612、−1,527 |

主线已批准的文案与本轮批准的词条在构建中按原规则生成 `/assets/locale/workbench.zh.fbd9103995793c87f7326dbc.js` 和 `/assets/locale/workbench.en.3025abfe45e9518b994c95d7.js`。第 105–108 批未添加工作台词条，22 条需批准的动态或内容地址由原许可匹配。相对上次推送，既有工作台脚本增 119 B，其余静态资源相同。对主干最大静态净增仍为 Git 脚本 8,403 B。本机既有资源与页面许可按实测登记，全插件页原已验证 Linux 差额另计 8 B。原始 `quality-audit-b107-main-{http,assets}.json` 与 `quality-audit-b108-candidate-{http,assets}.json`。[资源登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

### 第 109 批主干的滚动中断交集

读取方向的事实仍由共享设计系统滚动组件维护。主干补入本人的反向滚轮主动中断平滑回尾，脱离后等待用户回到末尾或点击「新消息」。助理与子任务复用同一读取行为；运行、回执和草稿仍由各自原服务维护。合并后的子任务用例等浏览器真实滚到底，收到滚轮与 `scrollend` 后验证读点；保留本轮的迟到回执和后来编辑保护。[滚动主人](../../packages/design-system/src/browser/scroll-follow.ts#L25) · [子任务实操](../../tests/subtask-conversation.e2e.test.ts#L84)

第 108 批的标准浏览器 QEA-176 通过。本机并行检查期间另做一次三倍 CPU 限速，完整原文、两个原文帧及最终着色仍成立，最长帧 251.2 ms。保留该压力样本和窄窗重复重排已经移除的反证，继续以准确组合的实际浏览器结果结算 100 ms 约束。压力和长工作区的尾延迟留在 QF-91 性能跟踪。日志 `quality-audit-b108-code-scale-stress.log`。

合并后的实际长回复 QEA-176 最长帧 52.8 ms，有两个纯原文帧，原完整着色和复制原文均通过。助理脱离、子任务持久化位置和组件板两项消费者共 4 文件 21 项通过。第 5 个文件的共享滚动状态失败，独立主干同一原测试通过，按明确的交错反证继续定位。日志 `quality-audit-b109-{assistant-frame,scroll-consumers,main-scroll-test}.log`。

### QF-92 / P2 打开旧回复时，先前滚轮会让页面又跟随尾部

助理跳到引用的旧回复前调用 `release`，子任务重开通过 `restore` 复原读点，Coding 历史也调用共享滚动组件。原实现通过 700 ms 输入窗口归属滚动，页面接管时仍留着上一个人的滚轮时间。晚到的页面滚动可让跟随恢复，用户刚选中的阅读位置再次交给自动跟尾。QEA-181 固定滚轮、恢复或放开与页面滚动的顺序，旧实现两个结果都是 `following`。独立主干原测试偶发通过与该竞态相符。[助理跳转](../../apps/workbench/src/scripts/client/assistant-strip.ts#L27) · [子任务读点](../../packages/plugin-sdk/src/browser/subtask-dom.ts#L126) · [Coding 历史](../../plugins/native/coding/src/browser/main/read.ts#L143) · [反证](../../tests/scroll-follow.e2e.test.ts#L138)

共享滚动组件在恢复页面位置时清除上一手势，在放开跟随时沿原离开尾部的转换截停未结束的自动回尾。新一笔真实手势继续经原监听器识别。处理在取得归属的同一个组件内，所有已接入界面共同受益，无存储迁移。旧反证日志 `quality-audit-b110-scroll-before.log`。[滚动转换](../../packages/design-system/src/browser/scroll-follow.ts#L99)

修复后 QEA-181 两个交错均保持 `detached`。助理实际脱离与回尾、子任务 18 项、子任务和条件组件板，以及共享滚动的合计 5 文件 22 项通过。日志 `quality-audit-b110-scroll-consumers.log`。

### 第 109–110 批资源复量

主干基点为独立构建的 `e56bd6701a`。67 条静态资源及十组页面冷、热回放完成，22 项待核对的首屏内容地址及动态请求仍由原许可匹配。两条工作台词包继续使用上节的内容地址。相对含主干滚动中断的第 109 批，插件帧加 2 B、工作台脚本加 1 B，单页冷加载加 3 B，热加载最多加 1 B。当前基点上页面净增最多冷 2,096 B、热 20 B，最大静态净增仍是 Git 脚本 8,403 B。

相对上次推送 `704773fe8e`，四类入门页面中最大冷增 759 B、热增 266 B，另外测量的示例项目最大冷增 1,069 B、热增 261 B。静态只有原工作台和插件帧脚本各净增 315 B、156 B，这包含第 108 批在内的改动和主干滚动中断。首次测量项目选择页的资料摘要超时，原量法重跑已完整收集。基线实报 `quality-audit-b109-main-{http,assets}.json`、候选实报 `quality-audit-b110-candidate-{http,assets}.json`、逐页比较 `quality-audit-b110-resources-verified.json`。[登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

### 第 111 批持久化界面文字和事实归属

主干 `#2118` 将卡片结果的常见反馈转为 SDK 生成的键和参数，由原卡片持久化并随 Workbench 语言显示。Assistant 自有库从 1 到 2 对历史内容转为原文引用。项目库从 4 到 5 沿 Runtime 的私值转换，只迁移 Coding 正式安装声明的值。Work Brief 自有库从 1 到 2，保留已写历史原文，新来源取 Manifest 的名称引用。该版本已审批的转换与本轮资料导入固定版本是不同事实，结构与回读分别验收。[卡片结果](../../packages/plugin-sdk/src/action-cards.ts#L124) · [项目升级](../../apps/local-host/src/project-database-schema.ts#L67) · [简报升级](../../plugins/native/work-brief/src/database.ts#L43) · [原批准 PR](https://github.com/molis-ai/molis-work/pull/2118)

PF-15 复核。合并后的资料侧栏入口仍按原动作 `title` 展示成果和置物架来源，现行 Work Brief 已提供真实的 Manifest `name_text` 读取场景。后续资料来源合同可复用现有 TextRef 和实际语言读取，需先统一两个页面消费的同一个来源描述。[资料来源](../../apps/local-host/src/side-files-http.ts#L48) · [置物架声明](../../plugins/native/shelf/src/search.ts#L45)

候选完整构建及本地 7 文件 168 项通过。三条连续升级、实际项目打开、Assistant 网关与卡片结果、导入历史及现行版本、隔离浏览器切换前后的警告和发布版本均已验证。包边界核对 75 包、4,398 个源文件和 24,022 条 import，公开合同及源码健康均通过。动作、44 个数据库结构、版本和 111 份 API 快照匹配源码。日志 `quality-audit-b111-{stored-words,boundary,health,regenerate}.log`。[存储与显示验收](../../tests/stored-text-refs.test.ts#L59) · [实际导入界面](../../tests/artifact-import-warning.e2e.test.ts#L10)

### 第 111 批资源复量

独立构建 main `feffe94db0` 与候选，同样采集 67 条静态资源及十组首屏实报。合并主干后静态变化仅为主干批准的 Work Brief 脚本 116 B。主干新词包与本轮既有获准词条重新生成为 `/assets/locale/workbench.zh.aae6b6b26daff45c74ef27f1.js` 和 `/assets/locale/workbench.en.be9e464f384a6edb7b4da725.js`，22 条首屏要求仍匹配原许可。相对第 110 批，中文首屏每页冷增 378 B、英文 423 B，热量相同。相对 `704773fe8e`，四类页面最大冷增 1,137 B、热增 266 B，其余报告样本中示例项目最大冷增 1,447 B、热增 261 B。

相对独立主干，冷加载最大净增 2,084 B、热加载 20 B，静态最大净增仍为 Git 脚本 8,403 B。英文到达及全插件页另各登记现测 5 B，后者含既有 Linux 路径差额。并发检查期间的两次本机测量分别在 chooser 的简报和到达页 Issues 入口超时，随后沿同一时限、原 HTTP 采样器和完整清单逐页回放通过。实际脚本体积、首屏策略及已验证 Linux 差额复算通过。原数据 `quality-audit-b111-{main,candidate}-{http,assets}.json` 与 `quality-audit-b111-resource-proof.json`。[登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

### 第 111 批准确提交的实操与远端结果

`9ce951d49b` 同时推到草稿与集成分支。其实际 Git 与 Coding 目录恢复、分隔条、输入栏和长回复 4 文件 5 项通过。90,038 字符重开有两个完整原文帧，着色期最长 19.7 ms。Goals 存档 56 项、四窗外观、首页后台入口及 Inbox 批量路径也通过。Inbox 批量更新期间，另一个 `/health` 在批处理完成前返回。整段性能和更多负载条件仍见 QF-51。组件板的单个词汇不一致仍有失败，下文补验。日志 `quality-audit-b111-{final-frame-and-git,final-consumers}.log`。

真实浏览器记录五个页面 × 中英文 × 冷热共 20 次。Home 共用通知在项目选择及三种工作台的 16 次观测每次请求一次。到达页没有发该请求。第 60 批以来，未登记 API 的路径与查询字段没有新增组合，仍有当前四类动态组合及缺少完整账号条件的采样项。证据 `/tmp/quality-audit-b111-browser-first-screen/{audit,browser}.json`。

Verify 首轮只有固定 Auth 浏览器子项失败，之前的 Work 认证与安装隔离步骤已通过。Auth `82341ae269` 的 v2 用例在 :541 未找到安全编辑框中的电话输入，对应第 91 批同一触发点。Molis Work 分支与当前基点的 Auth 固定值和工作流相同。同提交单独复跑 Auth 成功，Verify 第二轮以通过结束。Full 是另一组结果。[Verify](https://github.com/molis-ai/molis-work/actions/runs/44300285782/attempts/2) · [Auth 首轮](https://github.com/molis-ai/molis-work/actions/runs/44300285782/job/134787933009) · [Full](https://github.com/molis-ai/molis-work/actions/runs/44300274321)

Full 按集成分支完成 48 片。38 片通过，10 片失败。第 10、13、20、24、29、31、38、42、45、46 片失败的用例和日志已核对，分别在第 112–115 批处理。第 46 片 Coding 中英路径失败的是中文说明的旧称，已由主干 #2128 接收。[第 46 片](https://github.com/molis-ai/molis-work/actions/runs/44300274321/job/134787910424)

### QF-93 / P2 助理的参考内容标题在资料到达后被旧称覆盖

首绘给同一个材料组写 `workbench.assistant-dock.context`，收到资料后填标题的代码另取 `workbench.assistant-side-context.context`。更新后从「参考内容」回到「上下文」。独立主干和候选在 VUX-39 同一位置失败。首绘和更新统一用已批准的「参考内容」与 “Reference”，另一组词条经全仓入口核对只有此处使用，予以移除。材料读写、已用与待发送判定、原点击反馈继续由已有组件处理。[初绘](../../apps/workbench/src/assistant-dock.ts#L58) · [更新](../../apps/workbench/src/scripts/client/assistant-side-context.ts#L77)

独立工作树方式先运行原组件板与实际助理资料路径。会话工作视图、历史引用、材料状态、中英文标题和组件板任务通知均通过，待整合头复验。日志 `quality-audit-b112-main-board.log`、`quality-audit-b113-repro-fixed.log`。[实际资料组](../../tests/assistant-side-groups.e2e.test.ts#L137) · [VUX-39](../../tests/board-assistant.e2e.test.ts#L15)

### QF-94 / P3 原件关系卡的目标类型名未随中文界面切换（PF-16）

灵光转目标后，Workbench 的确认回执显示「已转为目标」，Placement 读回的关系卡显示「已建成 Goal」。实际关系来自同一转化，关系类型名则由公开 `placement_relation.target.noun` 的当前 Goals 声明提供。Full 第 24 片已收到指向项目内 Pages 与目标的两条关系。QEA-184 保留两处原状的严格文字断言，增加通过公开读取核对实际目标与原件的完整链。[回执](../../apps/workbench/src/scripts/client/placement.ts#L194) · [关系描述](../../horizontal/placement/src/index.ts#L418) · [提供方声明](../../plugins/native/goals/src/contract/goal-action-definition.ts#L18) · [第 24 片](https://github.com/molis-ai/molis-work/actions/runs/44300274321/job/134787904428)

PF-16 的现行消费者是 Placement 描述、灵光和其他关联原件的界面，目前一个实际提供方声明该目标类。编号、关系和公开读取继续由原服务维护。后续给提供方的类型名复用 TextRef，并由平台按显示语言取词，再一起迁移所有实际读取端。公开合同和外部提供方需要同批验证，当前按显示影响列后续。

### 第 113 批现行服务连接与项目目录验收

第 10 片真实模型配置拒绝了直接传入密钥，旧测试仍匹配退役页名 Connectors。QEA-185 对当前 Host 错误码和「设置 › 服务连接」精确匹配，保留原有供应商、密钥与实际推理读回。第 20 片的 Coding 已列出真实目录内容，`coding.files.working` 已显示「项目目录」。QEA-186 保留真文件、固定快照、Diff 和 Git 的原验收，匹配现行标签。Cognia 同片的首轮超时按原 25 秒用例重试通过。[模型设置](../../apps/local-host/src/model-configuration.ts#L59) · [第 10 片](https://github.com/molis-ai/molis-work/actions/runs/44300274321/job/134787904192) · [第 20 片](https://github.com/molis-ai/molis-work/actions/runs/44300274321/job/134787904551)

上述改动在独立工作树跑过实际 Coding 的两条浏览器路径和 Jelly 的 12 项模型配置及归属测试。QEA-184 同一隔离 Home 的灵光、Pages、目标与两项目置物架全路径也通过。日志 `quality-audit-b113-{coding-fixed,jelly-fixed,repro-fixed}.log`。

### 第 114 批主干一致性与实操验收准备

第 29 片的 Goals 合并驱动验收发现记录缩进变成两格。按原记录器的一格格式复原，逐项顺序、52 份哈希和字节数均保持一致。QEA-187 的格式修复对比 `9ce951d49b` 只有空白差异。第 38 片的逐项审阅文案对齐已批准的自述及证据说明，QEA-188 进一步核对实际认可和退回按钮，保留已请求版本与实际决定的读取。[Goals 记录器](../../tests/goals-page-golden.test.ts#L305) · [自述与证据显示](../../apps/workbench/src/work-acceptance-parts.ts#L21) · [第 29 片](https://github.com/molis-ai/molis-work/actions/runs/44300274321/job/134787904645) · [第 38 片](https://github.com/molis-ai/molis-work/actions/runs/44300274321/job/134787907411)

同步 main `651432a3ba` 的现行文案断言。此前第 13 片引导的文件清点与首次建项目、第 42 片 Pages 只读保护、第 45 片目标留在主画布使用的是尚未同步的旧文字。合并接收这三处及 Coding 英文工作台的断言，保留每条原用户路径，助理组标题以经 QEA-183 修正的首绘词汇为准。[主干 #2128](https://github.com/molis-ai/molis-work/pull/2128)

### QF-95 / P2 位置后台刷新会收起正在使用的菜单和确认

等你位置收到助理效果或目标列表更新时，普通读取和重绘原先各调用一次 `suspend`。它会中止位置纠正并关闭当前确认。默认设置菜单还会因 open 属性与新 DOM 不同而被替换。第 13 片的浏览器在既有移走后的真实回执之后等不到确认。工作台现在复用不变的菜单渲染，普通重读交同一个位置控制器按实际修订保留或失效确认。位置退出、读取失败及新修订仍关闭过期内容。清除的位置范围照原已批准确认，实际纠正、本人身份和修订由 Host 和 Surfaces 核对。成本低，未改合同或持久结构。[重读](../../apps/workbench/src/browser/project-position.ts#L38) · [菜单](../../apps/workbench/src/browser/project-home.ts#L44) · [确认](../../apps/workbench/src/browser/project-position-corrections.ts#L26) · [Surfaces 写点](../../horizontal/surfaces/src/corrections.ts#L70) · [第 13 片](https://github.com/molis-ai/molis-work/actions/runs/44300274321/job/134787904522)

QEA-189 在原位置实现上接收相同修订的真实 HTTP 回答后，复现当前菜单被收起。未插入此刷新交错的原用例也有一次通过记录。候选 `01539451ea` 沿相同隔离 Home 路径验证菜单、对话框与焦点都能保留，取消前后修订相同。另一笔实际写入生成新修订时关闭旧确认、返回菜单，重新进入且确认后只增一次修订，原 Feed 条目保持原修订。候选测试用时 14.4 秒。日志 `quality-audit-b115-position-{base,before,actual}.log`。[实际路径](../../tests/surface-cross-positions.e2e.test.ts#L598)

`01539451ea` 的 Linux Full 第 13 片也通过，包括这一位置交互与引导。 [Linux 第 13 片](https://github.com/molis-ai/molis-work/actions/runs/44309173320/job/134818540367)

### 第 115 批首屏复量

同口径实测 67 条静态资源、十组首屏 HTTP。相对 `9ce951d49b` 只新增 258 B 的工作台脚本内容，静态路径没有新增。删除重复词条后内容地址为中文 `/assets/locale/workbench.zh.ae54fb08ac73d15bb50b32f3.js`、英文 `/assets/locale/workbench.en.84c25955f4ea98463078b005.js`。既有授权的按语言内容定址范围及其他入口共匹配 22 条实际请求。相对产品源文件相同的主干构建，控量页面最大冷增 2,070 B、热增 20 B，静态最大净增仍为 Git 脚本 8,403 B。全插件页依既有 Linux 路径证据额外复算冷加载各 8 B。[资源登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

| 页面 | 中文冷 / 热，B | 英文冷 / 热，B |
| --- | ---: | ---: |
| 到达页 | −6 / 0 | −26 / 0 |
| 项目选择 | −14 / −8 | −34 / −8 |
| 默认工作台 | +252 / 0 | +232 / 0 |
| 全插件工作台 | +252 / 0 | +232 / 0 |
| 示例工作台 | +252 / 0 | +232 / 0 |

表内相对 `9ce951d49b`。原静态及首屏策略比较零超额，按已验证 Linux 路径长度复算也通过。完整构建、源码健康、包边界、111 份 API 快照、640 项清单动作及 617 项宿主注册动作、44 个结构快照和自有版本一致。源数据 `quality-audit-b115-candidate-{assets,http}.json` 与 `quality-audit-b115-resource-proof.json`。

### 第 116 批 Linux 首屏实测

`01539451ea` 的远端静态预算通过，67 条资源齐备。Linux 首屏的默认工作台中英文冷增 508／414 B，各比本机估值多 8 B。全插件工作台冷增 1,756／1,673 B，符合此前按每种语言各 8 B 的登记。到达页、选择页和热加载额度均通过，最大冷增仍是项目选择中文的 2,070 B。此次提交仅补默认工作台两条各 8 B 的冷加载记录及验收证据。 [Linux 作业](https://github.com/molis-ai/molis-work/actions/runs/44309181949/job/134818804848) · [资源登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

本机沿实际工作台、组件板和位置等入口复验 32 文件、301 项通过，Goals 的两个原录制用例按既有运行模式跳过。覆盖引导建项目和 3,000 份资料清点、Pages 只读拒写、Coding 两种目录读回及两种语言、Jelly 密钥隔离、灵光及两个真实关系目标、认可退回和改要求、共享位置的 9 项浏览器和 8 项服务、52 份规范化页面快照，以及工作台包必跑。日志 `quality-audit-b115-consumers.log`。

用 CI 的全部十组实际总量复算，默认、全插件和示例工作台相对本机的冷热净额均多 8 B，热轮仍整体减少。正式策略对本机和 Linux 都零超额，22 条需批准入口的匹配相同。补记提交 `9c4087e1e9` 仅改报告、规格与任务资源登记。GitHub 生成的 PR 合并树与其候选树一致。 [当前 Verify](https://github.com/molis-ai/molis-work/actions/runs/44312190871) · [上一候选 Full](https://github.com/molis-ai/molis-work/actions/runs/44309173320)

`9c4087e1e9` 的 Linux 包边界作业通过。实际重测默认工作台冷增仍为中文 508 B、英文 414 B，热量分别减少 8,453 B、8,440 B，静态 67 路径和首屏两项通过。 [资源及包边界](https://github.com/molis-ai/molis-work/actions/runs/44312190871/job/134829224828)

当前 Verify 首轮的产品子集第 1 片有 66 文件通过。Goals 刷新文件内完成的 13 个场景都通过，文件到 240 秒时被统一超时终止。准确生产构建的本机复验保留 240 秒上限，15 项在 122.2 秒通过，含在途覆盖保护、失败恢复、关系写入、侧栏焦点及图刷新。同一提交的远端第 1 片已复跑。 [首轮日志](https://github.com/molis-ai/molis-work/actions/runs/44312190871/job/134829225273) · [同提交复跑](https://github.com/molis-ai/molis-work/actions/runs/44312190871/attempts/2)

`9c4087e1e9` 的同提交复跑中，Goals 刷新 185.2 秒通过，产品子集第 1 片 67/67 文件通过。远端 Verify 已成功。 [复跑分片](https://github.com/molis-ai/molis-work/actions/runs/44312190871/job/134842565410) · [Verify](https://github.com/molis-ai/molis-work/actions/runs/44312190871/job/134847310471)

上一提交 Full 第 31 片的助理组件板 3 项通过。同片项目设置导航的引导返回测试在原单项 60 秒处结束。本机复验原文件 8 项全过，浏览器在 Web、桌面和窄窗真实点击返回用时 4.8 秒，保留进入前后的原项目目录比较。日志 `quality-audit-b116-heavy-browser.log`，同源代码由最终提交 Full 继续复验。 [上一轮第 31 片](https://github.com/molis-ai/molis-work/actions/runs/44309173320/job/134818540650)

上一提交的 Full 完成 48 片，47 片通过。核对唯一失败后，将草稿和集成分支推至同一 `9c4087e1e9`，启动完整 48 片。期间最新主干 `72ee7666e4` 是 iframe 任务焦点独立修复，四个文件与本轮差异无重叠，Git 合并检查无冲突。当前验收固定在已有实际测量的 `651432a3ba`。 [上一轮 Full](https://github.com/molis-ai/molis-work/actions/runs/44309173320) · [当前 Full](https://github.com/molis-ai/molis-work/actions/runs/44317467475)

当前 Full 的第 31 片已通过，含上一轮超时的三种布局引导返回。第 13 片的 QEA-189 已通过，同片的讨论用例在实际点击 Pages 原件后等待目标标签页超时。正常速度本机复跑 1 次通过。另在四倍 CPU 限速下分别重建隔离 Home，记录三次真实按下、松开、点击、同一消息位置的打开请求及浏览器最后标签。每次正好一条打开请求，HTTP 200，真实 Pages 标签页均打开。远端未打开的具体阶段仍待同提交复跑确认。源码和等待上限维持现行用例。日志 `quality-audit-b116-discussion-{probe,stress}.log`。 [讨论发起](../../apps/workbench/src/browser/project-position-discussion.ts#L51) · [Host 读取](../../apps/local-host/src/im-discussion-surfaces.ts#L125) · [工作台导航](../../apps/workbench/src/scripts/client/tab-workspace-plugins.ts#L396) · [第 13 片](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134847280233) · [第 31 片](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134847280331)

第 47 片的 QEA-124 在点 Home 助理的草稿回执后得到浏览器调试连接的「目标已导航或关闭」。同一构建本机三个现行场景全过，实际进入对应编辑器、读回原 ID、正文及同一 SQLite 记录。临时诊断在真实文档请求暂停期间遇到旧页面读取超时，释放同一真实请求后可进入目标编辑器并保持零新增写入。该诊断展示导航期间的读取时序。远端首轮的具体调用需要结合复跑判断。日志 `quality-audit-b116-draft-receipt{,-stress,-release}.log`。 [实际路径](../../tests/assistant-chooser-open-result.e2e.test.ts#L92) · [第 47 片](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134847286582)

第 32 片的 QEA-34 在进入实际 Git 冲突前未找到 Coding 「＋」中的 `/context`。本机正常路径 14.5 秒通过，四倍 CPU 限速路径 19.0 秒通过，真实输入目录拒写、修改磁盘后重新读取、拒绝使用旧版本、后续原审查批准一次写入的断言均保持。限速时观察到会话已接管输入栏且公开命令已登记，输入框和「＋」仍因首次草稿读取而停用，稍后同一接管状态内启用。旧用例单核对已接管，未等控件可操作。已定位待增强的验收时序，远端实际复跑沿相同源码和上限。日志 `quality-audit-b116-git-context{,-stress}.log`。 [用例等待](../../tests/git-edit-drafts.e2e.test.ts#L45) · [实际命令](../../plugins/native/coding/src/browser/main/commands.ts#L54) · [第 32 片](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134847279824)

首轮完成 48 片，45 片通过。三片失败已按同一 `9c4087e1e9` 提交复跑。 [Full 复跑](https://github.com/molis-ai/molis-work/actions/runs/44317467475/attempts/2)

第 13 片复跑 46/46 文件通过，跨位置的全部 9 条浏览器用例通过。第 47 片复跑 46/46 文件通过，助理的回执文件 3/3 项通过。 [复跑第 13 片](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134878307987) · [复跑第 47 片](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134878307753)

第 32 片复跑 48/48 文件通过，Git 草稿的 26 条真实用例通过。候选 `9c4087e1e9` 在同提交复跑后累计 48/48 片通过，汇总成功。草稿 Verify 构建的合并树 `12bb0e786649` 与候选树完全相同。此次通过的范围固定于主干 `651432a3ba`。 [复跑第 32 片](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134878306846) · [Full 汇总](https://github.com/molis-ai/molis-work/actions/runs/44317467475/job/134895689835)

### 第 117 批主干组合

同提交验收完成后，主干已合入任务 iframe 回焦与角色及事项归属修复。以 `8c844c5bb6` 计算，出现 Home 数据说明、spec 索引与主线测试三处实际文本冲突，助理调用、事项事务和生成快照也有重叠。上一候选证据归档。新组合按 QEA-191～193 复验。 [回焦修复](https://github.com/molis-ai/molis-work/pull/2129) · [角色与事项修复](https://github.com/molis-ai/molis-work/pull/2121) · [当前验收](spec.md#第-117-批整合任务回焦角色与事项归属合同)

角色入口共用 Characters 目录与编辑抽屉。助理从可信动作读取稳定选择，Coding 续办读取原轮固定版，Agent Host 核实际版本、范围和授权，角色原件与跟随事务由 Characters 写入。保留本轮的助理资料推荐降级及滚动处理。 [工作台选角](../../apps/workbench/src/browser/characters/task-picker.ts#L159) · [助理角色合同](../../apps/local-host/src/assistant/assistant-characters.ts#L19) · [Coding 续办](../../plugins/native/coding/src/start-round.ts#L159) · [执行固定版](../../horizontal/agent-host/src/run-start.ts#L246) · [角色事实](../../modules/characters/src/service.ts#L70)

事项安放从公开动作进入。主线在一次本地事务切换任务归属，任务主人仍写事件关系。工作台任务面板只发送事件去处。公开动作允许同时提交两个字段，事件写入在事项事务前。第 37 批接入两种去处时应明确两个服务各自的结算反馈和重试，避免把失败回执当作都未写入。保留主线服务的过期转换预检及来源请求键，快照重生成保留助理角色字段、资料建议的失败值，以及导入和 Sessions 合同。 [工作台入口](../../apps/workbench/src/browser/work-task-panel.ts#L265) · [公开声明与顺序](../../horizontal/mainline/src/index.ts#L379) · [事务](../../horizontal/mainline/src/store.ts#L297) · [转换预检](../../horizontal/mainline/src/items.ts#L169)

本地完整构建与重生成通过，111 份公开 API 快照、640 项 Manifest 动作、617 项额外宿主动作、44 个库结构、版本与包边界一致。真实事项动作 14/14 与归属不变量 5/5 通过，保存和撤销的角色服务 11/11，通过原 Coding HTTP 验证固定版实际生效。隔离 Home 的 3 条回执用例全部通过，两种现行 Skill 草稿打开后记录不变。Git 只读目录的用例在本机四倍限速与构建争用期间到原单项时限，正常速度同一用例 28.1 秒通过，失效审查无写入及最终磁盘结果保持。角色抽屉同文件的三条用例通过，窗口草稿用例在首次点设置前的页面加载命令超时，已安排同条件单独复验。日志 `quality-audit-b117-{regenerate,contract-gates,action-checks,browser-entries,git-context,git-context-normal}.log`。

两次独立构建各测到 67 条静态资源，路径相同。相对新主干，最大静态净增仍为 Git 脚本的 8,403 B，工作台脚本实际净增 5,152 B，比上一额度多 2 B，按任务资源登记记录差额。 [资源登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

两个构建均完成十组首屏实测。下表相对新主干 `8c844c5bb6`。22 条相对主干需要许可的请求均匹配既有授权，相对上一已批准组合无新增请求路径或词包地址。按上一候选实际 Linux 工作台的冷热净额各多 8 B 复算，默认和全插件工作台的四个冷量比原预留各多 2 B，已据此登记。热量额度和共享门禁口径沿用。工作台项目摘要首次采样及另一次 Host 健康等待分别在共同构建期间超时，顺序重测的实际结果列在表内。源数据 `quality-audit-b117-{main,candidate}-{assets,http}.json`。 [资源登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

| 页面 | 中文冷 / 热，B | 英文冷 / 热，B |
| --- | ---: | ---: |
| 到达页 | +2,055 / +20 | +1,948 / +20 |
| 项目选择 | +2,070 / −248 | +1,958 / −253 |
| 默认工作台 | +502 / −8,461 | +408 / −8,448 |
| 全插件工作台 | +1,750 / −7,213 | +1,667 / −7,189 |
| 示例工作台 | −266,765 / −275,728 | −268,179 / −277,035 |

组合后的 `MainlineStore` 触及现行 25 方法上限。分组放置只读写传来的排列，提为原模块的 `placeInGroup`。创建方式和完成后恢复沿相同事务调用容量、分组和次序规则，没有新增公开方法、状态或库写入。QEA-194 沿原事项用例复验。 [分组规则](../../horizontal/mainline/src/store.ts#L49) · [真实公开动作](../../tests/mainline-items.test.ts)

角色抽屉跨窗口草稿保持、版本冲突和覆盖前重试单独复验通过，61.0 秒。初次服务验收合计 9/9 文件通过。Coding 的卡片、结果两类入口已通过回焦与维持原输入的用例。任务板入口首轮在新建会话前遇浏览器调试超时，单独复验以及最终组合另记。 [角色草稿和选角](../../tests/characters-window-drafts.e2e.test.ts) · [三个真实子任务入口](../../tests/coding-subtask-real-entry.e2e.test.ts)

Coding 任务板同源码单独复验，92.5 秒通过，涵盖 Escape 回焦、任务完成刷新后定位同一入口和重开后再次回焦。合计六组浏览器文件中 21 项有通过证据，两项浏览器调试超时用例分别按原断言复验。事项线 6/6、触控目标 4/4、共享浮窗 1/1。准确候选的健康检查与密钥检查通过，`MainlineStore` 未增加门禁例外。日志 `quality-audit-b117-{browser-entries,role-draft,coding-focus,final-health}.log`。

`811e28f368` 已同提交推送至草稿与集成分支。两者使用的代码树为 `7584e19308b9`，PR 合并树等同。 [Verify](https://github.com/molis-ai/molis-work/actions/runs/44337310588) · [Full](https://github.com/molis-ai/molis-work/actions/runs/44337291824)

准确提交再次完整构建。67 条实际静态资源、十组首屏总量和 22 条审批匹配，与双独立构建的已记录结果逐项相同。主线事项、安放及不变量三文件共 21 项通过，包含 QEA-149、191、194。报告源数据 `quality-audit-b117-final-{build,mainline}.log` 及 `quality-audit-b117-final-resource-proof.json`。

`811e28f368` 的 Linux 包边界作业通过。两项资源门禁均过。默认工作台中英文冷增 510／416 B、热减 8,453／8,440 B，全插件工作台中英文冷增 1,758／1,675 B、热减 7,205／7,181 B，四组冷热净量均和先前确定的平台差额相符。 [Linux 包边界与资源](https://github.com/molis-ai/molis-work/actions/runs/44337310588/job/134918005025)

Verify 首轮的产品子集第 1 片 66 份通过。Goals 刷新文件触及 240 秒时限，报告记录已完成的 14 项均通过，最后的真实关系图刷新未结算。远端会沿同一提交与原时限复跑失败分片。 [首轮作业](https://github.com/molis-ai/molis-work/actions/runs/44337310588/job/134918005277) · [用例](../../tests/goals-refresh.e2e.test.ts#L528)

准确构建在本机隔离 Home 直跑得到 15/15，包括实际关系图刷新。单文件直跑沿用用例时限，总用时 276.2 秒。CI 产品子集自己的整文件上限是 240 秒，单文件结果只证明行为。日志 `quality-audit-b117-goals-240.log`。

当前提交启动原失败分片的同提交复跑，首轮其余 Verify 作业均已返回。 [Verify 复跑](https://github.com/molis-ai/molis-work/actions/runs/44337310588/attempts/2)

复跑仍在 Goals 文件的 240 秒上限结束，其余 66 份通过。第 118 批用实测核对重复启动成本，保留各原场景、原浏览器请求及写入断言。 [同提交失败分片](https://github.com/molis-ai/molis-work/actions/runs/44337310588/job/134946772301)

`811e28f368` 的 Full 首轮完成，48 片全部通过。Verify 的两次 Goals 整文件超时单独保留。 [Full 汇总](https://github.com/molis-ai/molis-work/actions/runs/44337291824/job/134959528054)

### 第 118 批主干逐屏修复组合

主干 `afaeabdd4a` 合入十项现行界面修复。与本轮有 14 个文件交集，模拟合并时有两处冲突，均在验收文件。共同修改的工作台和 Coding 源码按真实入参及调用顺序复核。已有结果随原提交留存，重新构建和对账目标页面记录。 [主干修复](https://github.com/molis-ai/molis-work/pull/2110) · [验收 QEA-195～197](spec.md#第-118-批整合主干的逐屏-p0-修复)

验收文件保留双方入口。新盖层用例也读回关闭设置后的原输入。Goals 页面按正规化后的实物对照，给右侧工作线放回唯一的 `data-overflow-fade` 后，52 条先前已验记录的哈希和字符数逐项吻合。16 份整页各减少 19 字符，36 份片段原样匹配。录制开关未启用。 [输入栏用例](../../tests/composer-bar-receiver.e2e.test.ts) · [页面记录对账](../../tests/goals-page-golden.test.ts#L250)

相对 `afaeabdd4a`，实际 67 条静态资源中最大净增仍是 Git 的 8,403 B，工作台脚本净增 5,168 B，比上一组合多 16 B。原消息和词包的 22 条首屏许可继续命中。中文项目选择文档的实测增加 96 B，页面净增 2,166 B，扣除已有额度后登记 66 B。默认及全插件工作台的四组既有冷量各增 16 B，按上一组合实测的 Linux 平台差额复算通过。源数据 `quality-audit-b118-resource-proof.json`。 [资源登记](../../tooling/gates/page-asset-allowances/quality-experience-audit-review-catalog.json)

后续 main `73e8349007` 修正评估结果、业务交付计数及 Schedule 的拒绝分类。比较差异有两处共同改动，分别是 Observation 的 README 和动作快照。合并模拟通过，生产源码与本轮修改没有文本冲突。新界面组合的实测基点仍为 `afaeabdd4a`。 [后续主干修复](https://github.com/molis-ai/molis-work/pull/2131)

### QF-96 / P2 相同文字的新回执会被当作已经收起

主干工作线把上一条收起的回复正文和其指纹作为身份。浏览器重开后，第二条不同 ID 的回复即便是一次新工作，只要文字相同也不会显示在输入栏上方。用浏览器复现，原回复收起及重开断言通过，接着加入不同 ID、相同文字的回复等待显示超时。处置归工作台，以回复已有的工作、轮次与消息 ID 投影到同一 DOM 节点。窗口只保存当前收起的回复 ID，连续写入这条回复保持收起，另一条回复即使同字仍会出现。正文由原助理和原渲染器维护。按 QEA-198 复验两次真实发送、显示和持久化。 [回复身份](../../apps/workbench/src/scripts/client/assistant-conversation.ts#L233) · [窗口回执](../../apps/workbench/src/browser/work-task-panel.ts#L83) · [真实入口与读回](../../tests/work-line-done-card.e2e.test.ts)

隔离 Home 用本地录制模型走两次正常发送。第一条回执经设置盖层收起，第二条同字但不同 ID 正常展示，Host 的原工作读取返回两个真实轮次及各自的回复 ID。现行 Markdown 渲染、原件名称、设置覆盖及窗口重开用例保持。工作线及 Coding 的六组浏览器用例共 86 项通过，另两个页面录制用例沿原模式跳过。Coding 材料服务十项中一项本机连接重置，同源码定向复跑通过，保留后台失败恢复、轮次固定版本和溢出项读回。完整构建、本机健康、包边界、111 份 API、44 个库结构、版本和动作快照一致。日志 `quality-audit-b118-{browser,coding-quick,coding-materials-retry,reply-build,health,contracts}.log`。

QEA-199 原 15 个场景仍由产品子集执行器运行。三个组内复用各自的隔离 Home，共少启动六次。每个场景仍进入实际页面、用自己的对象及原写入断言。一次带组复验暴露了前一场景的界面偏好会恢复成工作区，两个需要 Frame 的场景改用原界面动作进入并确认目标。保留整文件 240 秒上限，最终本机实跑 172.2 秒通过，零重试、跳过和隔离。日志 `quality-audit-b118-goals-strict3.log`。 [真实场景](../../tests/goals-refresh.e2e.test.ts)

主干 `6c88cba611` 同步决定 53、底栏第十三版和第 36A、37 批的需求拆分。这一提交是文档变更，合并预检无冲突。逐屏 P0 已交付的缺陷和后续新底栏、事项首页仍按各自验收。 [决定 53](https://github.com/molis-ai/molis-work/blob/6c88cba611/specs/post-anticorruption-roadmap/reference/decisions.md#decision-53)

当前候选 `cea504b68d` 相对实测基点 `afaeabdd4a` 改动 569 个文件，其中生产源码 277 个，测试与夹具 184 个。Full 直接运行候选代码树 `982f89bfad7e`，Verify checkout 为 GitHub 使用主干 `6c88cba611` 和该候选生成的合并树 `1cb8694d2819`，与本机预检一致。 [Verify](https://github.com/molis-ai/molis-work/actions/runs/44353379926) · [Full](https://github.com/molis-ai/molis-work/actions/runs/44353367194)

`cea504b68d` 的 Verify 已通过。此前超时的 Linux Goals 用例 190.6 秒通过，同片 67/67。包边界在最新主干 `6c88cba611` 构建比较，67 条静态资源及首屏通过。中文项目选择冷增 2,166 B，默认中英文冷增 526／432 B，热减 8,453／8,440 B。 [Verify](https://github.com/molis-ai/molis-work/actions/runs/44353379926/job/134990219925) · [Goals](https://github.com/molis-ai/molis-work/actions/runs/44353379926/job/134975172548) · [资源](https://github.com/molis-ai/molis-work/actions/runs/44353379926/job/134975172045)

### 第 119 批 QF-97 / P2 长回复重开时回执反复重绘

`cea504b68d` 的 Full 第 23 片两次失败同一文件。首次 QEA-176 完整原文和色标通过，最长帧 242.8 ms。本机同源码重开也得 106.3 ms，原断言要求低于 100 ms。实际诊断的 10 个样本均见会话收起而回执可见，后几帧随着两份 DOM 变大出现 176～350 ms 间隔。浏览器采样记录了回执观察器的复制和替换，以及全页状态圆环的可见性检查。日志 `quality-audit-b118-long-code{,-trace}.log`。 [Linux 首轮第 23 片](https://github.com/molis-ai/molis-work/actions/runs/44353367194/job/134974784887)

回执归 Workbench，按原回复 ID 和完整源文字更新。同一条回复的空格、换行与正文增量仍能更新预览。代码节点由原着色器推进，彩色标记的变化省掉整份回执的序列化及重建。迁移成本低，集中在同一个维护预览的函数。通过 QEA-200 在着色期间检查同一个实物回执节点，原全文、复制、色标准确性及 100 ms 断言保持。本机正常及三倍 CPU 限速各通过，最长帧 20.1／45.6 ms，均先出现两帧完整原文。补核源文字后，准确构建的长代码文件 10 项通过。日志 `quality-audit-b119-code-{normal,stress}.log`、`quality-audit-b119-exact-consumers.log`。 [状态读取与预览](../../apps/workbench/src/browser/work-task-panel.ts#L91) · [真实入口](../../tests/code-scale.e2e.test.ts#L231)

以 `afaeabdd4a` 独立构建为基准，准确构建的 67 条静态资源、十组首屏、22 条许可匹配均通过。相对上一批，工作台脚本与六组工作台冷加载各减 6 B，各页热加载总量相同，中文项目选择冷增仍为 2,166 B。最大单项净增仍是原 Git 脚本的 8,403 B。源数据 `quality-audit-b119-exact-resource-proof.json`。

准确构建的长代码、工作线回执、共享输入栏与助理正文四文件全部通过，共 23 项。实际恢复的同字新回复仍会显示，打开设置后能回原收件人及输入，原代码全文和最终颜色一致。日志 `quality-audit-b119-exact-consumers.log`。
