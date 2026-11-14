# 规格书怎么放

根目录放：**在做的** spec、**现行规范**、[统一待办清单](BACKLOG.md)（正文在 [`backlog/`](backlog/README.md)）和 [`archive/`](archive/)；除此之外不放散落的临时文档。

接续任务从下面的索引进入对应 spec，读当前状态、验收与证据；「在做的」也包括尚未实现的需求，不表示都已开工。现行规范按规则使用，归档按开头的判定与剩余事项阅读，归档不等于全部完成或用户验收通过。其他使用、开发与维护入口见[文档导航](../docs/README.md)，权威来源的分工见 [SSOT](../docs/SSOT-MATRIX.md#1-文档各管什么)。

## 怎么读

1. **现行规范**：产品、架构或执行规则，仍被 `AGENTS.md`、SSOT、Skill 或包 README 引用；不归档，改规则就改它。
2. **在做的**：已有需求、正在实现或等验收的 spec；状态句、验收和证据以每份 spec 为准，不按本索引猜完成度。
3. **统一待办**：[BACKLOG.md](BACKLOG.md) 是未完成事项的唯一来源；已删除、已并入或只在分支的编号查[墓碑](../docs/backlog-removed.md)。
4. **归档**：已完成、已被取代或只等用户验收的历史 spec；按开头判定读，剩余事项看它指向的待办。
5. **相关族**：同一产品方向下暂未合并的 spec，先看文末「相关 spec 族」，不要当重复需求。

截至 2026-11-13：53 个在做的、11 个现行规范、386 个归档目录、514 条待办。

## 在做的

刚合入、等真实 Home 采用或本人验收的项也留在这里，状态写在条目上。

- [batch-06-shared-tools](batch-06-shared-tools/spec.md)：第 06 批成果固定、平台资料产生者与 SDK 公用工具；已随 #2009 合入 `a720834a09`（2026-11-13），剩余真实 Home 采用与本人验收。
- [batch-06-call-cost](batch-06-call-cost/spec.md)：第 06 批调用成本整治；已随 #2009 合入 `a720834a09`，剩余 N42 首片范围与 BL-943 后续；BCC-09 直测已补。
- [batch-06-runtime-cost](batch-06-runtime-cost/spec.md)：第 06 批各包调用成本；已随 #2009 合入 `a720834a09`，N47/N48/N49/N50/N51 的实现与定向证据见文内，绝对计数为探针证据。

- [workbench-experience-upgrade](workbench-experience-upgrade/spec.md) 工作台体验走查与升级方案。含现状截图、界面样稿、交互动效和六项待评审决定。2026-11-13 方案整理，需求维护 Codex；第一轮全局设计语言（色彩搭配、动效语法、组件板分章）在分支实现，待用户定样，其余实施待分配。
- [documentation-consolidation](documentation-consolidation/spec.md)：文档状态、索引与事实来源收口；2026-11-13 审计后立项，P0 状态修正、五份已完成 spec 归档与批次回填已完成；P1 主体完成、P2 主体完成（工作线保留两份），见正文。

- [state-machine-platform](state-machine-platform/spec.md)：状态与状态机的平台能力——平台能力状态统一登记、插件声明状态与迁移、启动兑现、只读登记、统一家族显示、可选的插件自管流水账；内置先强制、第三方先提示、对外开放后的阶段二第三方也强制，创作台生成必须申报，公开家族照搬现有 21 类。2026-11-08 需求已整理、用户就十二项方向拍板，并确认按 §13 并入路线书 26-7／27-6／47-2／48-5、迁移进统一待办；尚未实现。

- [plugin-equal-standing](plugin-equal-standing/spec.md)：插件同等地位收口——Goals 减负（项目指导、可信决定、规划方法搬出，平台合同去掉 Goal 一等概念，宿主与工作台去私路，Goals 可移除），并清掉 Feed、Coding、Inbox、Todo、Pages、灵光、Images 在平台里被点名的地方；只保留此前定过的平台部件（Shelf、成果库、Sessions、创作台、Alchemist、Characters）。2026-11-13 需求已整理、用户已拍板 D1～D8（新项目不默认装 Goals，删桌面胶囊、CLI 的 Goals 命令与 `goal-advance` Skill；要求—证据—认可与工作终端抽成平台能力），排期为路线书第 44 批（原 44～89 顺延为 45～90；可信决定并进 39、规划方法并进 41），并含对路线书后续批次与已合入代码的复查（§9a）；尚未实现。

- [unified-account](unified-account/spec.md)：WORK-01 至 WORK-09 的本地隔离实现与 V2 账号统一已完成，并随 [#2013](https://github.com/molis-ai/molis-work/pull/2013)、[#2021](https://github.com/molis-ai/molis-work/pull/2021)、[#2025](https://github.com/molis-ai/molis-work/pull/2025) 合入 main（2026-11-11；合入提交 `ef06fed603`、`93eb5590ac`、`4d025ff4c6`）；真实存量迁移、外部服务与最终全量回归仍待补验。

- [ci-acceleration](ci-acceleration/spec.md)：CI P0/P1 提速，普通文档从 PR 到合并队列走轻量路径，增加单个 PR 分片并按耗时和浏览器容量平衡；2026-11-06 已获实施授权，负责人 Codex；本地实现与验证完成，待云端实测。

- [team-memory](team-memory/spec.md)：独立团队记忆需求（BL-022）；像持续在线的 PMO 观察获准项目、沟通和工作，积累决策、风险、知识、偏好及协作模式，减少人与人／人与 AI／AI 与 AI 的上下文交接，支持主动协作、工作习惯与交付质量改善。成员个人发布仍需最终确认并告知不可撤回，管理员维护团队认知；形成、融合及使用策略待细化，尚未实现或验收。需求维护 Codex，实现待分配；不改变现有记忆 P0 边界。

- [team-collaboration](team-collaboration/spec.md)：团队协作按项目明确共享，首版需要多人实时共同编辑，整体参考 Codex Projects；2026-10-28 已定成员只访问获准项目内容，个人空间、其他项目与个人外部 AI 会话不自动公开；工作记录、简报与 AI 输出遵守相同边界。首版查看／编辑／管理三档、后续插件／资产粒度，以及成员发布／管理员管理团队记忆已定；团队记忆已另立需求，本需求保留身份与访问衔接；实时编辑、人与 AI 共同工作及恢复已纳入目标，协作协议、覆盖清单与细粒度规则待细化，尚未实现或验收。需求维护 Codex，实现待分配；阶段 1 与个人同步共同设计，阶段 2 验关键并发与恢复，阶段 3 收拢方案、阶段 4 完整实施。

- [sessions-rebuild](sessions-rebuild/spec.md)：Sessions 按平台能力重做，覆盖国内外主流 AI 开发工具的冷启动导入、持续了解进展，以及恢复／消息／交接；2026-10-28 三类场景、厂商范围、获准后自动发现及明确关联自动归入项目已定；不明确时 AI 建议、用户确认，不自动建项目；运行中交接由用户选择停止原任务或保留并行，其他交互与技术方案待细化，尚未实现或验收。需求维护 Codex，实现待分配。

- [product-flow-governance](product-flow-governance/spec.md)：全平台产品与架构系统性审查和优化——覆盖全部功能、入口、设置、交互与公共机制，核功能完整性、流程依赖、AI 效果和检查审查；Onboarding 与服务连接为已暴露案例，全平台覆盖与优化验证后才算专项完成。2026-10-27 首轮静态盘点已完成，具体发现与五批优化顺序见[核查记录](product-flow-governance/audit-2026-10-27.md)；真实路径实操与整改未完成。需求维护/本轮核查 Codex，后续整改统筹待分配。

- [plugin-builder-upgrade](plugin-builder-upgrade/spec.md)：插件创作工作台整体升级；首要解决用户至今未跑通的端到端交付与整体体验，平台同时提供手动／个人助理共用的场景组装能力，保留新能力插件的创作，Alchemist 并为完整落地场景；2026-10-27 需求已整理，尚未实现。需求维护 Codex，实现待分配；与三项场景包／Onboarding 需求独立。

- [prologue-memory-strategy](prologue-memory-strategy/spec.md)：以记忆更精准、好用、省 token 为目标；App 自定义分类与读写策略矩阵、Prologue 多策略组合、首期质量闭环及 40 项验收。C0/Q0 已独立交付，Prologue C0 与 S1 已合并。Memory V0 按路线书决定 36 单独成批收口（[#2020](https://github.com/molis-ai/molis-work/pull/2020)），原验收、历史失败及 BL-1071～BL-1077 的去向见正文。
- [unified-input-voice](unified-input-voice/spec.md)：平台统一输入组件与本地语音；第 10 批已实现公共组件、首页与助理接入（#1991，2026-11-09 合入 main）；第 11 批 K4 Coding 与 K5「待办」来源随 #2016 合入（2026-11-11），框架页来源按 BL 留待 K6 灵光之前；其余入口与语音待后续批。10-27 已定整体体验归属、插件开放注册与补充／排队／打断操作。
- [observation-collection](observation-collection/spec.md)：观测和采集层，统一记录全平台获准的用户行为、过程、结果与历史条件，供评测和主动助理共用；2026-10-27 从主动助理需求迁出，需求已整理，尚未实现。需求维护 Codex；实施沿用 C 轨（Claude），防腐收尾后阶段 1 设计、阶段 2 接通、阶段 3 验证下游效果。
- [proactive-assistant](proactive-assistant/spec.md)：个人助理的主动协助、场景 Skill 与后台任务；需求已整理，尚未实现（§13 的 PWA-27／PWA-137 常驻运行与错过提示已随第 25 批 #2034 于 2026-11-12 实现，其余未实现）。含工作记忆例程、路由、技能生成与跨源搜索；2026-10-28 补讨论中的诉求识别、主对话持续可用、连续交办和任务可视化。明确交办先在阶段 2 接通，主动工作阶段 3 复用；共用采集与维护由 observation-collection 承接，助理与评测分别消费。
- [work-brief](work-brief/spec.md)：项目综合首页与工作简报；10-27 已定可选安装、未安装时的基础首页、共用公开来源／呈现、承接生成页面及 Feed 归属。基础首页已随第 15 批 #2017 实现并合入（2026-11-13，`b819373250`）；Work Brief 本体、周期报告、living page 与风险总览仍未实现。需求维护 Codex，实施沿原 E 轨并与 C/D/A 协作。
- [coding-harness-optimization](coding-harness-optimization/spec.md)：Coding 与平台性能；需求已整理，尚未实现。
- [visual-ui-experience](visual-ui-experience/spec.md)：视觉细节、个人助理信息与 UI 性能；59 项验收与 21 组设计机制。原视觉工作实现中，输入框的低频设置与引用（VUX-16 其余、VUX-17）、VUX-33 其余与本人验收未做。2026-11-02 补全产品文案与按需帮助：减少常驻解释，名称、按钮和下一步易懂，与渐进式引导接续（VUX-51～59）；新增需求尚未实现或验收。负责人：Claude（2026-10-19 起接手实现）；本次需求维护：Codex。
- [intelligent-surfaces](intelligent-surfaces/spec.md)：智能呈现与操作层（Intelligent UI）。插件声明对象的字段、形态、操作和允许别人放东西的挂载位；平台的确定组合加上助理在候选内的组合，把插件内容、平台内容、MCP 与 Skill 拼成此刻最合适的展示与操作面，注入插件内、插件之间、对话、项目讨论、首页、Shelf、等你等位置。第一片已随第 15 批 #2017 合入（2026-11-13，`b819373250`）；实际文字、页面授权与项目成员接入已接回，整批验证与本人验收待完成，后续三片仍按路线书推进。
- [work-mainline](work-mainline/spec.md)：主线。事项是平台的轻量容器（可以只起名字，Goal、待办等可以变成事项），用户把手头的事项按自己的分组和顺序排好，从事项线线头的切换器一下切到某件事，工作台状态、相关对象、助理范围与等你随之切换；插件对象的内容仍归插件。
- [work-line](work-line/spec.md)：事项线。工作台底部是当前事项的一条线（已办、现在的输入框、接下来），线上的每一项是事件，由插件和助理按同一份登记放上来（待办、日程、Coding 会话、结果、值得跟的交办、建议）；点事件移到中间展开成卡，点和说都能办；后台任务是事件背后的执行，全部任务在输入框上方的后台任务面板里；输入后助理或所选的 Character 先回应、再写明去处，任务的结果回到它；线头切换事项。线只读各插件的登记、任务板、工作记录与呈现声明，不另存。2026-11-12 需求已整理、用户定四项并入路线书 32-3／36-2／37-2／53／58／64；2026-11-14 用户改方向（线是事件登记能力、任务在背后、面板在输入框上方、结果回流，路线书决定 45）；尚未实现，定样随第 32 批。
- [upgrade-continuity](upgrade-continuity/spec.md)：升级后持续可用。库的升级链从统一起点起算（先快照、再升级、失败回退、只影响主人），新程序先在副本上演练再替换，从 M1 起合同有过渡期、保存的引用自动接上，每个发布版本留金样 Home 回放；用户只感觉到功能升级。
- [sqlite-driver-switch](sqlite-driver-switch/spec.md)：SQLite 第二步（路线书 05 ③）。项目库从 better-sqlite3 换到 node:sqlite，适配层保持语义，Alchemist 例外保留；Node 升到 24.15.x 并锁定（用户 2026-11-06 定）；已实现：SQLD-a/c/d/e 随第 05 批 #1979 于 2026-11-08 合入 main，SQLD-b（锁 Node）随 #1917 合入；正式 24.15 包与打包冒烟（SQLD-11）见 [BL-sqlite-sqld11](backlog/BL-sqlite-sqld11.md)。
- [action-input-contracts](action-input-contracts/spec.md)：动作的版本字段与输入类型（路线书 05 ④）。N14 判断规则改用 `expected_updated_at`，过期的提交就地接住；N22 处理器迁到从 schema 推导的类型（用户 2026-11-06 定）：N14 两段（#1913、#1961）与 N22-01/02/04/06（#1909、#1939、#1923、#1893）、防回潮计数（#1951）已在第 05 批合入，N22 余片按决定 29 移到第 56 批第 3 项（第 57 批开工前全部合入，范围不变）。
- [draft-and-return](draft-and-return/spec.md)：草稿与返回（路线书 12 第三项）。平台共用的「回程」：从哪里进的设置、配好后回到哪里、回来后只接着做依赖新配置的那一步；插件页面用 `host.returns`，普通链接自动得到回到原处，第 13 批⑤是第一个消费者。R0～R4 已实现并随 #1952 合入（2026-11-08，`ad25b414e0`）；DRT-21 的实操与本人验收见 [BL-draft-return-acceptance](backlog/BL-draft-return-acceptance.md)。
- [font-and-skin-system](font-and-skin-system/spec.md)：字体、皮肤与语言系统；A 段与第 16 批 B/C 已随 #2031 合入（2026-11-11，`206884b447`），D/E（自定义制作、助理外观）归第 71 批；真实模型、胶囊外观与本人验收待，整套未完成。
- [assistant-service-connections](assistant-service-connections/spec.md)：助理统一服务接入；Codex 实施中，交互切片和连接侧首组回归已完成，37 项整体验收仍未完成；2026-10-18 补充内容层连接器占位符与未支持工具的接入路径（ASC-38–44，未验证）；2026-10-27 补服务连接页面的默认直接连接、技术配置收起及连接后可用要求（ASC-45～50，需求阶段）。
- [subagent-interaction](subagent-interaction/spec.md)：个人助理与 Coding 的子代理固定入口、直接对话和父子动线；明确 Prologue/Molis Work 分工，需求已整理，尚未实现。
- [ai-development-handbook](ai-development-handbook/spec.md)：内部 AI 能力开发手册；context over control、prompt/Skill/context/tool 分工、基础实现与评测方法，手册正文已写入 `docs/platform/PROLOGUE-AI.md` 第二部分（2026-10-16），存量清理清单已做完。2026-10-18 补充技能包渐进披露、从一次过程生成 Skill、评测循环与作者侧校验，正文 2026-10-19 写入（第 13.2、13.5、16.6、16.7 节），一个技能包在两处各用一次那条等技能包实现；用户验收未做（BL-320）。
- [ai-input-receipts](ai-input-receipts/spec.md)：输入回执与会话排队；SDK S1–S4 已在 Prologue main，Molis 现用的过渡包带 S1–S3，Molis 接入（阶段 1）进行中。
- [daily-quality-low-a1](daily-quality-low-a1/spec.md)：2026-11-08 日评低优先级 A-1 的 50 项修复；2026-11-09 获批，主体已随 [#1999](https://github.com/molis-ai/molis-work/pull/1999) 于 2026-11-10 合入 main；D0328 暂缓，D0069 与 D0205/D0229/D0238 的剩余见 [BL-daily-a1-residuals](backlog/BL-daily-a1-residuals.md)。
- [feed-bounded-reads](feed-bounded-reads/spec.md)：Feed 完整快照改为分页与按需读取；#2026 已合入（2026-11-11，`96a1c70c37`）；#2045 的 FBR-08～11 补修在评审，待验收，不归档。
- [prologue-adoption](prologue-adoption/spec.md)：Prologue 完整能力采用——原 1–23 项及存储/预算决定，加 TaskBoard 统一协作与零模型外部等待；P1–P4、A0、A1、A2-1、A2-2、A2-3 已合；采用线 2026-10-20 交接，换包 #887 已合，接续见 spec 开头的「交接（2026-10-20）」与 BL-302、BL-306～308；A5 已按 main 重核（2026-11-11，[A5 重核](prologue-adoption/a5-recheck-2026-11.md)）。
- [context-program](context-program/spec.md)：情境动作完整总纲与分期；三份子需求书已并入本目录：[情境浮条](context-program/context-toolbar.md)、[快速创建](context-program/quick-create.md)、[Side Shelf](context-program/side-shelf.md)。W0 原型已实操；W1、W2（浮条取代底栏、Pages 迁移）已在交接分支 #411 里通过工程用例，未验收。接续入口见第 20 节「远端交接」。
- [personal-cloud-sync](personal-cloud-sync/spec.md)：联网个人版同步总纲，记录每账号 100 MB、删除保留 30 天的约定；五份子文档（Goals、关联资产、Pages、插件复制、同步基础）已并入本目录，见总纲的「子文档」。
- [coding-quality-assurance](coding-quality-assurance/spec.md)：Coding 质量保证（已定方向，防腐收尾后做）。2026-10-18 补充多代理 PR 评审、置信分、安全评审、真人批准门、有界迭代与对抗验证。
- [risk-plugin](risk-plugin/spec.md)：专门记录风险的插件（风险已移出 Goals）。
- [plugin-tab-groups](plugin-tab-groups/spec.md)：既有插件组已合入，PTG-10 待本人看实物；现行标签合同保留，统一分屏、右栏与底栏按产品治理在 03／07 接续。
- [ai-interaction-experience](ai-interaction-experience/spec.md)：跨插件 AI 交互；I0 预览已在工作台框架里按实物重做并走查，待用户看实物；共享组件与产品接入未开始。
- [computer-use](computer-use/spec.md)：个人助理的完整 Computer Use——操作 macOS 桌面应用，过程与结果在侧栏的「电脑」「文件」与对话里交给用户（等真机验收，BL-325）。能力切片已合入，门禁与全量由 CI 证明；二十步、带截图的 Shelf、五类拒绝和同进程 sheet 等真机验收。
- [capability-pack](capability-pack/spec.md)：能力包——技能、提示词、角色、工具、MCP 的声明与元数据进同一份聚合目录，执行仍走原机制；在技能包之上扩展；2026-11-08 新立，第 09 批已实现（#2015 + 收尾 #2019，2026-11-11）；余项自组包（[BL-kit-user-packs](backlog/BL-kit-user-packs.md)）等见 BACKLOG；CPK-11 的一手验收记录见 [BL-capability-cpk11](backlog/BL-capability-cpk11.md)；用户 11-10 的「视作我通过了」不免除这条记录。
- [skill-packs](skill-packs/spec.md)：技能包（内容包）与个人助理 / Coding 的装配；只有内容、没有运行时/动作/存储的包可以安装，两边共享一份目录；第 08 批基础能力由 Codex 接续完成并随 #1984 合入，消费方随第 09 批（#2015 + 收尾 #2019，2026-11-11）接入同一目录、按精确版本冻结；SKP-10 的 Coding「自动」档 2026-11-11 审计整改补做（BL-coding-skill-auto 已补做并删除），SKP-09 脚本沙箱记 [BL-skill-scripts-sandbox](backlog/BL-skill-scripts-sandbox.md)；SKP-12 的真实项目/卸载/业务事实与本人验收 2026-11-10 以「视作我通过了」免走验收（未实际走查，11-11 追认范围），本人验收另行跟踪（[BL-skill-packs-acceptance](backlog/BL-skill-packs-acceptance.md)）。
- [agent-approval](agent-approval/spec.md)：Agent 变更的授权复用与显式人审；有效委托内持续执行，明确启用的人审按人员与版本校验，Coding 可选 AI 代批不计真人票数；2026-10-28 对齐，尚未实现。
- [automation-recommender](automation-recommender/spec.md)：项目自动化建议；只读扫描项目，按 hooks/技能包/MCP/子代理/命令各推荐 1–2 个，有证据、可保存、不自动安装；2026-10-18 新立，尚未实现。
- [code-modernization](code-modernization/spec.md)：代码现代化工作流；评估 → 地图 → 业务规则 → 计划批准 → 增量改造 → 行为等价证明 → 报告；2026-10-18 新立，尚未实现。
- [onboarding-coverage](onboarding-coverage/spec.md)：先接通真实文件选择、模型整理、失败恢复与材料进入项目/Coding；再扩场景包、动态引导、全局/项目/任务设置、项目助理团与 AI 交互首页；2026-11-02 补页面帮助与下一步进入引导、复用配置并返回原任务（ONB-47～49）。整项尚未实现，本轮只改文档，F 轨统筹；需求维护：Codex。
- [plugin-frame-desktop-load](plugin-frame-desktop-load/spec.md)：桌面 WebKit 里沙箱插件框要能加载脚本；页面策略写上本次请求自己的回环 origin。2026-10-26，待验收。
- [prologue-strategies](prologue-strategies/spec.md)：Prologue Context、MCP、Skill、Tool 四份策略合并为一份总纲 + 四份子文档；需求已整理，尚未实施。
- [post-anticorruption-roadmap](post-anticorruption-roadmap/spec.md)：防腐后的执行目录，01～90 与服务端批每项一行；交付详情、需求来源、依赖、轨道、决策、阶段验收及历史分别放在 [reference 分类](post-anticorruption-roadmap/spec.md#reference)。[开发手册](post-anticorruption-roadmap/reference/development-workflow.md)规定每项／每片开工前先讲清具体工作。01 已交单；02～27 中至少 18 个批次已有合入记录，最近合入包括 15 #2017、16 #2031、22 #2038、25 #2034、27 #2010；实时认领与分支看[认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743)。

- [ci-conflict-reduction](ci-conflict-reduction/spec.md)：减少页面资源预算与其他高频生成记录的冲突及重复 CI；2026-11-06 已获实施授权，历史 PR 核查、实现与本地回归完成，待独立 CI 实测，负责人 Codex。



## 现行规范

仍被 `AGENTS.md`、SSOT、Skill 或包 README 引为现行规则的 spec。它们不归档；改规则就改它们。

- [account-switch-refresh](account-switch-refresh/spec.md)：单活动账号与平台刷新规范；工程、本机与用户桌面候选操作的证据分开记录，当前更新见第 13 节，最终 CI、合并队列及 main 核对以 [PR #1932](https://github.com/molis-ai/molis-work/pull/1932) 实际记录为准。
- [action-architecture](action-architecture/spec.md)：能力怎样注册、发现、调用、授权（§3「基本合同」）。
- [plugin-platform-v2](plugin-platform-v2/spec.md)：插件能声明什么、宿主怎么装配、插件之间怎么交换。2026-10-18 补充 Skill Pack、目录元数据、hooks 与 LSP 声明。
- [molis-work-architecture-reorganization](molis-work-architecture-reorganization/spec.md)：架构与包重组基线。
- [coding-plugin](coding-plugin/spec.md)：Coding 的单一需求来源，下一阶段见 [next-requirements.md](coding-plugin/next-requirements.md)（2026-10-18 补充 LSP 声明、钩子规则、多代理评审、真人批准门、结构化输出、有界迭代与计划页）。
- [craft-finish](craft-finish/spec.md)：界面设计规范。
- [ui-craft-floor](ui-craft-floor/spec.md)：界面工艺底线。
- [shell-page-exceptions](shell-page-exceptions/spec.md)：哪些页面可以整页打开；从 artifact-positioning §4 拆出，`AGENTS.md` 与 `tests/shell-page-gate.test.ts` 引用。
- [scene-and-page-contract](scene-and-page-contract/spec.md)：场景与生成页面公共合同（路线书 20 ①）；公共合同、SDK 校验与必要接入已实现并合入（2026-11-09，main `6df7285c31`）。页面运行与真实安全归 37，采用／另存归 45，官方场景包成品归 52。
- [shared-sources-and-surfaces](shared-sources-and-surfaces/spec.md)：公共来源与呈现合同（路线书 05 ②）；C-1 #1894、C-2/C-3 与目录实现随 #1979 合入，组合服务与呈现组件随第 15 批 #2017 合入。后续「接着做」与助理组合分别归第 21／28、64 批。
- [surface-composition](surface-composition/spec.md)：确定组合平台服务（路线书 15 ①）；S-1、公共组件与 S-2 首页随第 15 批 #2017 合入，实际取词、页面授权与项目成员接口的整批验证、本人验收待完成。

## 还没做的事

都在 [BACKLOG.md](BACKLOG.md)（条目正文在 `backlog/`，一项一文件），那是唯一来源。spec 里不再另记「未完成」。

## 相关 spec 族

这些 spec 目前各自保留，因为状态、负责人或验收不同；读之前先看本组关系，不要当成重复需求。

| 族 | 成员 | 读法 |
| --- | --- | --- |
| 个人同步 | [personal-cloud-sync](personal-cloud-sync/spec.md)（含五份子文档） | 已合并为一份总纲 + 五份子文档；子文档管各集合的接入与验证。 |
| Prologue 策略 | [prologue-strategies](prologue-strategies/spec.md)（四份子文档） | 已合并为一份总纲 + 四份子文档，共同消费 SDK；不要按一份的完成度推断其他三份。 |
| 情境与输入 | [context-program](context-program/spec.md)（含情境浮条、快速创建、Side Shelf 三份子文档）、[unified-input-voice](unified-input-voice/spec.md) | 情境三份已并入总纲；统一输入仍独立，状态分别判断。 |
| 工作线 | [work-mainline](work-mainline/spec.md)、[work-line](work-line/spec.md)、[work-brief](work-brief/spec.md)、[intelligent-surfaces](intelligent-surfaces/spec.md) | 主线与事项线各自有 MLN/WLN 验收编号，暂不合并；综合首页与呈现按各自 spec 判断。 |

## 规则

**开工。** 新任务在根目录建 `specs/<task>/spec.md`，第一段写状态句：`状态：<执行中/待验收/…>（日期）。`。进度与证据写在同一份 spec 里，不另开进度文件。验收标准写在标题含「验收」的一节，逐条带编号（见下面「验收编号」）。

**归档。** 任务做完（包括只差用户验收的），在开头补一句归档状态，写明判定、依据和日期，然后整个目录移到 `archive/`：

```
> 归档（YYYY-MM-DD）：判定为**已实现 / 部分实现 / 未实现 / 已被取代 / 已作废**。<依据>。剩余事项已移到统一待办清单：BL-xxx。
```

- 模板照抄：开头的 `>` 引用块和「剩余事项已移到统一待办清单：BL-xxx」那句保留（没有剩余事项就省掉后一句）；判定只用上面五个词，补充说明写在判定后面的依据里，不扩写判定词。
- 判定以 main 上的代码和真实行为为准，不只看原状态句。
- 已被取代的，写明被哪份 spec 或哪个决定取代。
- 部分实现或未实现的，先把剩下的事逐条抽进 [BACKLOG.md](BACKLOG.md)，再归档；只差用户验收的，列进清单的「待你验收」。
- 判断不了的不归档，在 BACKLOG 的「待你决定」里写明缺什么证据。
- 归档时同步改仓库里所有指向它的链接（代码注释、README、`docs/`、`skills/`、测试），再跑 `pnpm health:check`（断链、文档引用）和 `pnpm boundary:check`。

**验收编号。** spec 的验收标准逐条带一个编号，测试引用它；改需求时一查编号，就知道哪些测试要跟着改。

- **写法**：验收标准在标题含「验收」的一节里（`## 验收标准`），每条以编号开头，有序列表、无序列表、表格第一格都行：`1. **DOCK-03** 静止时条目的按钮不可见……`。编号是 2 到 8 个大写字母、一个连字符、2 或 3 位数字。字母是这份 spec 的前缀（目录名的缩写）：一份 spec 一个前缀，一个前缀只属一份 spec，也不用 `BL`、`PMR`（待办与合入后审查的编号）。数字在这份 spec 里往上数。
- **不改号、不复用**：删掉一条标准，把它写成 `~~DOCK-04~~ 已取消：<理由>`，编号继续占着；改一条的内容，编号不变；新加的条目从最大的号往后排。同一个标题下只要有一条带编号，其余的列表项和表格行也都要带。
- **归档以后编号还在**：spec 移进 `archive/` 以后，它的前缀仍然属于它，别的 spec 不能再用；它的编号仍然算「有人定义」，老测试里引用的 `DOCK-03` 不会因此变成没人认的引用。检查读 `archive/<目录>/spec.md` 里的编号，只当定义用：归档的 spec 不要求测试覆盖，也不要求补编号。
- **测试引用编号**：证明这一条的测试，把编号写进测试名（`test("DOCK-03 at rest an entry shows no buttons", …)`），或写在测试旁的注释里。一个测试证明几条就写几个；写成范围（`DOCK-01..05`）只算第一个。引用的是 `tests/` 下的测试文件和各处的 `*.test.*`；任何 `fixtures/` 目录里的文件都不算，叫 `*.test.*` 也一样（`vendor/`、`node_modules/`、`dist/`、`.impeccable/` 同；这几个目录在仓库根还是嵌在哪一层都一样）。
- **不能用测试证明的**（真机、要人来判断、等用户自己试用）：在那一条里写 `[人工]`，不再要求测试，证据写进 spec 的证据节。
- **整份 spec 没有可编号的标准**（程序性的 spec，验收在别处逐项闭环）：开头状态句附近写一行 `验收编号：不适用（理由）`。
- **检查**：`node scripts/check-spec-coverage.mjs`。现在是**报告模式**，不管找到什么退出码都是 0（只有参数写错、或 git 读不了仓库才退出 2），CI 里只当信息：列出有验收一节却没有编号的 spec、没有测试引用的编号、测试里引了 spec 里没有的编号，以及重号、串用的前缀（含已归档 spec 占着的前缀）。`--strict` 是它变成门禁以后的样子；在做的 spec 都编好号、报告里没有问题之后再把 CI 那一步改成 `--strict`。

**现行规范** 不归档。规则变了就改原文；一份规范被新 spec 整体取代时，新 spec 成为现行规范，旧的按上面的规则归档。

## 梳理记录

- 2026-11-13：个人同步六份、Prologue 四份、情境三份分别合并为一份总纲 + 子文档；原正文保留，子文档开头注明原路径，现行文档的入链已改到新位置，历史研究里的旧 URL 保留。工作线两份保留，见「相关 spec 族」。
- 2026-11-13：文档收口 P0 归档五份已完成 spec：[D0002](archive/daily-quality-d0002/spec.md)（#1970）、[D0071](archive/daily-quality-d0071/spec.md)（#1972）、[D0039](archive/daily-quality-d0039/spec.md)（#1971）、[D0244](archive/daily-quality-d0244/spec.md)（#1974）与 [D0038](archive/daily-quality-d0038/spec.md)（#1982）；五份均判定已实现、无剩余。Feed 有界读取因 #2045 补修在评审，保留在「在做的」。同期立项 [documentation-consolidation](documentation-consolidation/spec.md)，记录审计结论与 P0/P1/P2。

- 2026-11-10：[D0033 侧栏与打印隔离](archive/daily-quality-d0033/spec.md)归档（已实现）；既有隔离与打印回收专项 42 项通过，Chrome 验收不替代真实桌面 IPC。
- 2026-11-10：[中优先级 A54 修复](archive/daily-quality-medium-20261108/spec.md)归档（已实现）；#2004 经最终 CI、Full 32 分片与正常合并队列通过后合入 main，B/C 未决项仍见对应日评。

- 2026-11-07：[单机构建与测试各三个槽位](archive/machine-slots-three/spec.md)归档（已实现，负责人 Codex）；#1953 经 PR CI 与合并队列通过后合入 main，本机主检出已同步并确认两个三槽池。

- 2026-11-07：[路线书审查复核与修复](archive/roadmap-audit-repair/spec.md)归档（已实现，负责人 Codex）；#1898、#1899、追加授权的 #1897 已合入 main，#1900 已合入 gh-pages 并部署；最终 CI、Full 与队列成功，保留首次失败和验证边界。

- 2026-11-06：[Frame 相机同步修复](archive/frame-camera-pointer-sync/spec.md)归档（已实现，负责人 Codex D 轨）；#1859 已合入 main，真实回归、普通 CI 与保护队列通过，02 组合 Full 的其它首败另由原负责人结算。

- 2026-11-04：[系统性代码与架构防腐整理](archive/repository-anti-corruption/spec.md)归档（部分实现；工程项随 #1725 合入，剩余 BL-928～930，其中 BL-928 已于 2026-11-07 随 #1914 完成）。同批归档本线的三份卫星：[项目库里的插件表](archive/plugin-project-database/spec.md)（已实现，BL-377）、[Home 级插件的库按项目分开](archive/plugin-project-partition/spec.md)（已实现，BL-639）、[双实例](archive/dual-instance-plugins/spec.md)（部分实现，BL-933）。防腐目录里另有早先归档的 6 份历史文件与 `evidence/`；`assistant-service-connections`、`repository-cleanup`、`pr-review-remediation` 不属本线，留在根目录。未实现的 C 端方案与依赖／SDK 方案的剩余在 BL-931、BL-932。
- 2026-11-03：[第 01 批主线核对](post-anticorruption-roadmap/reference/batches/01.md#baseline-01)按合入提交归档三项性能修复、复审修正、双仓清理、状态环、五项 Goals／首页／引导小需求和 Issue V0；历史限制与待本人验收分别保留。
- 2026-10-23：[系统评审问题修复](archive/system-review-fixes/spec.md)归档（本轮已实现，负责人 Codex）；#1018、#1058、#1061、#1062 已合入，#1049 收尾衔接随本 PR 合入。按一骏明确的完成边界，三项偶发测试与安装验收分别转 BL-412、BL-413。
- 2026-10-21：`logic-diagnosis-fixes`、`goal-closure-identity`、`artifact-positioning` 归档（已实现；goal 与 artifact 的用户验收见 BL-401、BL-400）；`project-knowledge` 归档（部分实现，剩余 BL-396～399）。`artifact-positioning` §4 的整页例外清单拆成现行规范 [shell-page-exceptions](shell-page-exceptions/spec.md)。
- 2026-10-17：[合作源码与商业授权](archive/commercial-source-license/spec.md)归档（已实现，负责人 Codex）；#636 已合入 main，许可、分发材料及安装器许可传递通过定向验证、PR CI 和合并队列检查。
- 2026-10-01：全量梳理根目录 193 份 spec。7 份确认为现行规范；186 份归档（已实现 104、已被取代 70、部分实现 8、已作废 4），剩余事项抽进 BACKLOG。逐份判定与依据见 [合入后审查 §8](archive/post-merge-review/spec.md#8-spec-梳理)。
- 2026-10-02：`home-one-screen` 归档（已实现，只差用户试用，BL-111；负责会话确认）。#150 带进根目录的两份归档：`performance-preserving-fixes`（部分实现，BL-109）、`project-management-freeze`（诊断记录，BL-110）。同时把仓库里 109 处指向本机路径（`/tmp`、`/Users/…`、`node_modules`）的链接改成仓库内相对链接；仓库外的只写成路径文本。
- 2026-10-10：`casebook-plugin` 归档（已作废；用户决定删除 Casebook，插件以后重做，防腐整理 §1）。
- 此前两批（158 份）按开头状态句与代码核对归档。
