# 已定与待决事项

[执行目录](../spec.md) · [参考分类](../spec.md#reference)

<a id="section-7"></a>

## 待决定或继续细化

按最早影响的批次排列，保留原编号。这些要你定：按[开发流程第 6 节](development-workflow.md#6-预警与讨论)，要用户回答的不因到时没回改由统筹代定；只暂停依赖必要答案的部分，已定项和已有授权直接使用。方案细化沿原需求的决定范围，不因列在这里新增一次审批。

| 原编号 | 还缺什么 | 最早影响与继续工作的边界 |
| --- | --- | --- |
| <a id="decision-11"></a>11 | Sessions 会话交互和技术方案；创作台原 spec §7 的合同与交互；团队剩余细粒度规则、同步交互及团队记忆形成／融合／管理／使用策略 | 创作台 [03](batches/03.md)、Sessions [22](batches/22.md) 分别细化；团队部分到 [SRV-1](batches/srv-1.md)／[SRV-4](batches/srv-4.md)，不让团队方案阻塞个人路径。已定范围见下表，原负责人保留 |
| <a id="decision-23"></a>23 | 新增字体路径；Folio 实际字体及分发依据；额外首批语种 | [14](batches/14.md) 交方案，[16](batches/16.md) 前处理对应字体、语言及预算，[70](batches/70.md) 核发行物。中英文完整覆盖已定，首批语种已定：只做中文和英文（[需求书 §12](../../font-and-skin-system/spec.md#12-决策记录)，2026-11-04），未指定语种不算交付；真实 Home 发布文案转换沿原维护授权。依据：[实现方案 §12.2](../../font-and-skin-system/implementation-plan.md) |
| <a id="decision-18"></a>18 | 是否收窄 M1 的发行门槛。原建议仅要求第二台 Mac 安装、升级不丢数据、材料基础路径、统一输入和技能包，其余后续接入；尚未采纳 | [26](batches/26.md) 准备、[56](batches/56.md) 交付；决定前仍按阶段 2 完整退出条件。同步与团队已移服务端批，不能再列作 M1 前置；读取兼容仍从 M1 起算 |
| <a id="decision-9"></a>9 | Skill／Context／MCP／Tool 四份策略的其余内容尚未整体评审 | [41](batches/41.md)／[61](batches/61.md) 只等对应未定内容；已定的选择、恢复、权限与动态上下文直接使用，见下表 |
| <a id="decision-19"></a>19 | 是否先交不带 AI 生成首页的基础场景闭环，再接生成首页；这是退出条件拆分建议，尚未采纳 | [44](batches/44.md)；决定前保留生成首页在完整闭环内，材料基础路径仍独立推进 |
| <a id="decision-16"></a>16 | 引用声明之间是否检查语义一致（BL-128） | [61](batches/61.md) 的相关子项；不阻塞其他已定策略和服务 |
| <a id="decision-14"></a>14 | CGS 的七项 Skill 改内容技能包之外，插件本体按新 SDK 重做、改成场景组装，还是放下 | [71](batches/71.md) 定场景方案，[81](batches/81.md) 前定本体；与 Alchemist 同批已定，不重新讨论这一顺序 |
| <a id="decision-24"></a>24 | 服务端批什么时候开工 | [SRV-1～8](server-batch.md#server-batch)；同步、团队、团队记忆与 M2 已移出 01～89，部署、真实账号及费用由用户办理，01～89 不等它 |
| <a id="decision-13"></a>13 | 个人同步采用按收尾后形状重接、整支变基，还是先停；重接是原建议，尚未决定 | [SRV-1](batches/srv-1.md) 对账后、同步合同前；不把建议写成既定合入方式 |

原需求另有局部待决：H4 对外用词在 10；审查台账 N12／N14 的主人与合同、N47 的 Runtime 主人裁定，按对应批次保留（BL-880 的门禁改动用户 2026-11-04 确认接受，见 [07 核账](batches/07.md#batch-07-audit)）。02 核账时已定的 A4、N3、N16 和 BL-937 见下表。批次详情和[审查台账](../../../docs/reviews/adversarial-review-2026-11-01.md)维护具体条件，不因本表未单独编号就视为已批准。

## 已定结论与出处

这里只摘要产品决定；实现和验收状态回到原需求与批次证据，不以“已定”表示“已完成”。部分已定事项保留同一编号，与上表剩余问题对应。

| 原编号／日期 | 已定结论 | 依据与原需求 |
| --- | --- | --- |
| <a id="policy-a4"></a>A4 · 11-03 | 官网采用简明许可说明，区分个人或企业内部使用与须事先书面授权的对外分发、对外商业使用，并链接许可证。11-04 已合入官网仓库，正式发布和双域验收按用户决定留到产品完整开发后。 | [产品建议 A4](../../../docs/product-operations/产品优化建议.md)、[官网口径与待办整理](batches/02.md#batch-02-item-5) |
| <a id="policy-n3"></a>N3 · 11-03 | 安全表已有的 CI／本地证据列必须为每个测试文件注明对应测试名，缺引用时 CI 失败。 | [审查台账 N3](../../../docs/reviews/adversarial-review-2026-11-01.md)、[第 27 批](batches/27.md#batch-27-item-5) |
| <a id="policy-n16"></a>N16 · 11-03 | 随公共截断函数接入，只检查源码中直接 `slice` 后加省略号的写法；既有数量只减不增。 | [审查台账 N16](../../../docs/reviews/adversarial-review-2026-11-01.md)、[第 06 批](batches/06.md#batch-06-item-2) |
| <a id="policy-bl-937"></a>BL-937 · 11-03 | 重建时直接删除旧助理轮次。新库从空库开始，不迁入旧轮次，不补写 `written_by`。由 BL-928 的维护窗口执行。 | [维护待办](../../BACKLOG.md)、[第 02 批重建清理](batches/02.md#batch-02-item-3) |
| <a id="policy-bl-943"></a>BL-943 · 11-04 | 打开多个 Goal 窗格时，宿主可合并重复的插件目录读取。每次数据库操作仍检查当前权限，每次写入前仍检查撤权。 | [第 06 批宿主调用整治](batches/06.md#batch-06-item-3)、[待办](../../BACKLOG.md) |
| <a id="policy-t071"></a>T-071 · 11-04 | 本人取消一个已经不存在的助理定时，或删除一个已经不存在的规则，仍成功返回当前列表。重复点击或重试不影响其余项目。助理在工作中取消定时，仍须核对它属于这项工作。 | [第 02 批遗留事项](batches/02.md#batch-02-item-1)、[助理规则和定时](../../archive/system-assistant/implementation.md) |
| <a id="policy-t057"></a>T-057 · 11-04 | 工作入口已经存在、库里却缺少指向项目的有效关联时，仍以 `work.context.project_relation_missing` 拒绝，归为内部数据错误（HTTP 500）。调用方无需修改输入；读取不会猜测或补建关联。 | [工作入口绑定](../../../docs/modules/private-work-context.md)、[第 02 批遗留事项](batches/02.md#batch-02-item-1) |
| <a id="policy-n22-scope"></a>N22 · 11-06 | 一次迁完：全部动作处理器迁到从 schema 推导的输入类型，补约束，删重复检查，约 120 个文件、28 个包或目录，按包分片。合同台提醒会卡第 06 批之后的实现，用户接受 | [第 05 批用户定的](batches/05.md#batch-05-user-decisions)、[审查台账 N22](../../../docs/reviews/adversarial-review-2026-11-01.md) |
| <a id="policy-node-pin"></a>C3 · 11-06 | 换 `node:sqlite` 前把 Node 升到 24.15.x 并锁定：换完后 SQLite 版本跟着 Node 走，而插件语句检查钉着 3.51.3。开发机不再用 Homebrew 的 Node 跑服务；分两步的决定不变 | [第 05 批用户定的](batches/05.md#batch-05-user-decisions)、[审查台账 C3](../../../docs/reviews/adversarial-review-2026-11-01.md) |
| <a id="policy-u1-rebuild"></a>U1 · 11-06 | 升级链写进「当前保留机制」，四处检查按设计改，`golden-replay` 与「改建库语句必须升版本」全开；真实 Home 重建不等 05② 的改表，这几段升级算已同意 | [第 05 批用户定的](batches/05.md#batch-05-user-decisions)、[升级后持续可用](../../upgrade-continuity/spec.md) |
| <a id="policy-upgrade-parity"></a>U1 · 11-06 | 升级段的跑法和范围检查对所有插件同一份，内置也过检查；只有「装上的插件暂时不能写」一个差别，U4 时打开。N22 迁完后加门禁：处理器的输入参数上不许写 `as`。换完驱动后 `project-sqlite-driver` 改严，旧驱动只许 Alchemist 用 | [第 05 批用户定的](batches/05.md#batch-05-user-decisions)、[升级后持续可用](../../upgrade-continuity/spec.md) |
| <a id="policy-public-contract-proof"></a>N22 · 11-06 | 公开合同定义留手写接口，由 `inputSchemaFor` 证明和 schema 同形，不全部推导。第 05 批 C-1、N22-06 在 02 收尾前放行。实量规模约 130 个文件、31 片（含 N14）加门禁片 | [第 05 批用户定的](batches/05.md#batch-05-user-decisions)、[N22 设计](../../action-input-contracts/spec.md) |
| <a id="policy-output-directory"></a>05② · 11-07 | 默认输出目录：Home 快照不带，永久删除时非空才问一句（MCP、CLI 留着）。另一台设备上的本机文件引用加「指定文件夹」，不只是说清楚。还剩的静默读接受并写明；目录实现片早于首次外部安装 | [第 05 批用户定的](batches/05.md#batch-05-user-decisions)、[公共资料与目录](../../shared-sources-and-surfaces/spec.md) |
| <a id="decision-1"></a>1 · 10-27 | 多输入目录、一个固定且可改输出目录，输入输出可相同；默认联动，临时查看不改执行位置；共用资料源，迁完消费者后退役 Files | [资料与目录](../../product-flow-governance/workspace-and-materials-design.md)，BL-023 |
| <a id="decision-2"></a>2 · 10-27 | 一份平台输入组件，公共合同／SDK 扩展；Enter 换行，Command/Ctrl + Enter 发送或默认补充，Command/Ctrl + Shift + Enter 排队；打断用明确按钮／菜单，Esc 不直接停止；原回执与领域主人保留 | [统一输入](../../unified-input-voice/spec.md)，H2 |
| <a id="decision-3"></a>3 · 10-27 | AI 判断长期保存与去处：记忆存偏好／背景／经验，项目说明存规矩，Skill 存复用做法；沿原主人、授权和可纠正回执 | [用途合同](../../prologue-memory-strategy/spec.md)，E3；Memory 原暂停未解除 |
| <a id="decision-4"></a>4 · 10-27 | 风险独立记录，Goal 按需引用且不机械同步状态；项目总览、按需复查、结果入简报，通知沿有效设置 | [风险需求](../../risk-plugin/spec.md)、[Work Brief](../../work-brief/spec.md) |
| <a id="decision-5"></a>5 · 10-27 | Apple 使用现有个人开发者账号；正式 OAuth 应用优先由现有中国公司管理，逐服务核资格，例外单独处理 | [服务接入 §8.1](../../assistant-service-connections/spec.md#81-常用服务的直接连接体验2026-10-27)，BL-021 |
| <a id="decision-6"></a>6 · 10-27 | 标签／标签组、分屏、右栏和底栏共用导航与恢复；右栏是窗格布局，底栏负责进入／召回，“＋”原地出列表菜单 | [产品治理 §4.6](../../product-flow-governance/spec.md#46-分屏标签右栏与底栏统一2026-10-27-用户已定)，H3 |
| <a id="decision-7"></a>7 · 10-27 | 可选 Work Brief 承接综合首页，未安装保留基础首页；公开来源、呈现和挂载共用；Feed 原始更新不直接计作工作 | [Work Brief](../../work-brief/spec.md)，BL-098 |
| <a id="decision-8"></a>8 · 10-27 | 回看范围、报告周期／时刻由引导与设置共用；记录默认本地长期保留，可定期／手动清理但不删业务内容和已存简报；显示占用，提醒线不自动删除，到期清理照常 | [采集 §2.6](../../observation-collection/spec.md#26-覆盖保留与性能)、[主动助理](../../proactive-assistant/spec.md)、[Onboarding](../../onboarding-coverage/spec.md) |
| 9 · 已定部分 · 10-27 | Skill 启用后默认自动查找选用、点名优先、可仅手动，未启用不参与；部分失败保留已完成，独立获准工作继续。上下文由 AI 动态取材／压缩／重读且可纠正。工具从统一目录按任务发现，发现不扩权。MCP／服务共用三档权限；有效授权持续复用，短暂断线自动接续，未知写入先核对 | [Skill](../../prologue-skill-strategy/spec.md)、[Context](../../prologue-context-strategy/spec.md)、[MCP](../../prologue-mcp-strategy/spec.md)、[Tool](../../prologue-tool-strategy/spec.md)、[服务接入](../../assistant-service-connections/spec.md)；其余仍见上表 |
| <a id="decision-10"></a>10 · 10-28 | Coding Q1～Q8 全部收口：公开查询默认允许且可关闭，公共搜索与统一来源；受限命令沿执行目录，长期放行须明确同意，可选低风险 AI 审批；获准开发可下载公开依赖；Hooks 首次／变更确认且可停用；记忆复用原方案，工具按需隔离获取；页面选 Character、取消多模型对比，语音共用本地输入；GitHub 复用账号与任务授权；本阶段不做 VS Code 扩展／Tab 补全／行内编辑，ACP 未排期 | [Coding CNW／CEX／CHK／CLS／CGH](../../coding-plugin/next-requirements.md)、[目录 WMD-11～12](../../product-flow-governance/workspace-and-materials-design.md)、[服务 ASC-54～55](../../assistant-service-connections/spec.md)；已有许可不等长期规则保存，失败／重启恢复按原验收 |
| 11 · 已定部分 · 10-28 | Sessions 覆盖国内外主流工具的导入、持续跟进、控制三类；获准后自动发现，唯一目录关系自动归项目，否则建议并确认；看历史不启动执行，运行中交接需明确停止或并行选择，逐入口保留缺口。创作台完整升级含场景组装与 Alchemist。团队按项目明确共享，首版查看／编辑／管理三档，实时共同编辑、成员光标和人与 AI 修改保护；团队记忆独立，个人发布最终确认且说明不可撤回，管理员维护 | [Sessions](../../sessions-rebuild/spec.md)、[创作台 §7](../../plugin-builder-upgrade/spec.md)、[团队 TCO-11～15](../../team-collaboration/spec.md)、[团队记忆](../../team-memory/spec.md)；未共享个人空间／项目／外部会话不得自动公开 |
| 14 · 已定部分 · 11-03 | CGS 作为自媒体创作场景与 Alchemist 同在 81；七项 Skill 改内容技能包 | [CGS 原需求](https://github.com/molis-ai/molis-work/blob/codex/cgs-formal-integration-20261013/specs/cgs-formal-integration/spec.md)；插件本体仍待上表决定 |
| <a id="decision-15"></a>15 · 10-26／10-30 | R-B1～8 不做，原名记 R-C；R-B9 源码已改，存量随真实 Home 清空重建、不迁移，真实操作另等用户“开始” | [术语表](../../../docs/system/GLOSSARY.md) |
| <a id="decision-20"></a>20 · 11-03 | 字体皮肤语言 C 段保持一次整体切换，不逐插件切换、不加双格式过渡；前移到 16，B 段验完即切，新格式消费者随后合入 | [字体实施方案](../../font-and-skin-system/implementation-plan.md)、[16](batches/16.md)；窗口内冻结 E 的界面文字和样式 |
| <a id="decision-22"></a>22 · 11-03／11-04 | 每轨一个写手，轨道间按依赖并行（11-03）。11-04：统筹归 Claude（本机）统筹会话，Codex 只做 01、02 的写手、不再兼路线书总维护；会话按轨道跨批做到底，不按批次另开（这半句 2026-11-05 由第 26 项取代）；在做什么看认领板 | [轨道与冲突规则](tracks.md#section-5)、[认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743) |
| <a id="decision-17"></a>17 · 11-04 | （2026-11-05 由第 26 项取代）不拆写手：C1～C3 仍是一个写手，由 Claude（本机）C 轨会话担任；Codex 交完 02（共享核心、SQLite 驱动、合同复位）并在认领板贴【C 轨交接】后接手，此前 C 轨会话只做不碰 C 轨文件的设计、盘点与自己那份快照的小合同。同包、同快照不并写照旧 | [轨道与冲突规则](tracks.md#section-5-1) |
| <a id="decision-21"></a>21 · 11-04 | 允许提前启动：不碰真实 Home 的核账、定样与实现照常往下做。02 的版本归一与重建、依赖它的 U0 生效与 05 的 U1 实现，等真实 Home 维护窗口；窗口在 02 其余项合入、重建步骤写清后，由统筹提前一天和用户约，当天在用户在场时按清单执行 | [02](batches/02.md)、[05](batches/05.md) |
| <a id="decision-12"></a>12 · 11-04 | 验收分开办：界面与体验类（视觉、动线、文案）由用户本人看实物；纯行为与工程类委托统筹在隔离 Home 实走并留证据，用户可抽查。委托验证不记作「本人认可」；已有的委托与接受保留 | [01 试用单](acceptance-01.md)、[开发流程第 9 节](development-workflow.md#9-验证) |
| 23 · 已定部分 | 中英文完整覆盖；首批语种已定：只做中文和英文（[需求书 §12](../../font-and-skin-system/spec.md#12-决策记录)，2026-11-04）；额外语种未指定不算完成；资源与真实 Home 操作各沿原批准边界。下载量按真实打开算总字节，只许变少，不设绝对上限，第 16 批前单开门禁 PR；语言目录工作台一份、插件按需，第 16 批带实测按类一次批准（2026-11-07，用户弹窗定） | [字体实施方案 §12.2](../../font-and-skin-system/implementation-plan.md) |
| 24 · 已定部分 · 11-03 | 同步、团队、团队记忆、M2 移到 01～89 之后的服务端批；01～89 不等它，后续服务端需求继续并入该批；同步合同在 M1 后按兼容流程增加 | [服务端批](server-batch.md#server-batch) |
| <a id="decision-25"></a>25 · 11-04／11-05 | Goals 要求的满足与完成批准（PWA-144）：执行者自述不能单独满足要求，每条要求都要可信用户认可，一次决定可认可多条；凭可查证据自动通过等第 24-3 批的证据合同（BL-1036）（用户 2026-11-04 定）。「两件事分开」（用户 2026-11-05 定）：认可某条要求只说明这条要求满足了；项目规定完成要人批准的，还要用户在当前这一轮单独批准完成（`authorize_action complete` 一类的决定），点完成的人自己不算，上一轮的批准不算，要求的认可不再放行项目审批规则。「收回后要重新认可」（用户 2026-11-05 定）：可信认可之后出现反证或「不确定」的报告，这份认可即作废，执行者再报满足只回到「待你认可」，要用户重新认可；要人决定的要求同一规则；用户不认可的要求单列原因 `requirement_rejected` | [proactive-assistant PWA-144](../../proactive-assistant/spec.md)；PR #1820 |
| <a id="decision-26"></a>26 · 11-05 | 每批独立安排，轨道只管文件：每批由它的主会话独立安排，独立任务开子会话，写手一律用子代理，一批可以同时有多个写手；会话不再按轨道跨批。轨道规则只留文件独占：一条轨道独占的文件、同一份合同快照，同一时间只有一个写手在改；同轨的片按依赖先后叠分支；借用别的轨道的文件仍由那条轨道落（规则 7），合同仍先单独开小 PR（规则 1）。取代第 17 项和第 22 项中「会话按轨道跨批做到底」；统筹归属不变。批 02 由 Codex 收尾不变 | [轨道与冲突规则](tracks.md#section-5)、各批 Goal Prompt 第十节；PR #1833 |
| <a id="decision-27"></a>27 · 11-07 | 批次开发追加要求：方案按插件、平台、助理、各类平台能力、后续开发逐个看，选全局最优（开工前检查第 15 项）；批次文件是默认方案，有更好的做法可以换，记下来、说一声，不等回话，验收、红线和用户定过的事不变；本批没合完不开下一批的实现，只允许把下一批的一小块并进本批；边做边清理，以这一片碰的模块为界；写法要优雅；每批一次收尾检查（防腐、平台能力、代码质量、清理、全局），平台能力不强求。不加门禁。已开的 PR 不回头补第 15 项和评审第 7 行，批次已完成的不补收尾检查 | [开发流程第 4、8、10.1、11.1 节](development-workflow.md) |
| <a id="decision-28"></a>28 · 11-07 | 批内分组提速：防腐之后这批需求周期紧，产品还没有用户，现在是集中攻坚，所以同批的小任务能合就合，一起开发、统一测一次、合成一个 PR，省掉反复测试、反复改 PR 和 PR 过碎带来的冲突。提速只省开发过程里的重复，验收、评审、用例、门禁和本人验收一项不减，质量不能降；分组不考虑回退。背景写进每批 Goal Prompt，批次文件的「粒度」只是建议，执行时可按目的和条件判断（用户当天补）。已定四件事：① 接口约定和功能同 PR：只有这一组用、也没人排队改同一份时可以，设计稿先审过，公共合同台合审在最终的头上，这组跑全量；其余照旧先合约定。② 不相关的小功能按文件、依赖或用例是否重叠来合，完全不相关的只合小修，一组最多两个包，所以第 54、69 批大多合不了。③ 定样：组件板没有新增部件的，定样记录跟实现同一个 PR，有新增的照旧先合；用户拍板前不写代码，评审走查不省。④ 在途批次：已开的 PR 不重开，剩下的片立即适用，在认领板发一条公告。部分取代第 26 项「合同仍先单独开小 PR」 | [开发流程第 8.4 节](development-workflow.md#batch-grouping)、[轨道规则 1](tracks.md#section-5)、[并行开发](../../../docs/system/PARALLEL-DEVELOPMENT.md)第 1～4 节 |
| <a id="decision-29"></a>29 · 11-08 | N22 拆成独立需求：范围不变，仍是 11-06 定的一次迁完；第 05 批只留工具和样板（N22-01、N22-02、N22-04）和已合入的 N22-06，第 05 批和第 06～54 批不再等余片。余片（N22-03、N22-05、T01～T13、S0～S9、N22-Z、N22-G）移到第 55 批第 3 项，前置就绪后随时可开，是按批推进的明确例外，第 56 批开工前全部合入，因为第一个外部版本之后再收紧输入要升版本、留过渡期。防回潮提前：加一道只许减少的计数（处理器输入上的 `as`，按文件比，新文件从 0 开始），排在第 05 批的 #1926 之后；N22-G 开绝对门禁时删掉。这条改 11-06「不留只许减少的计数」，那时的前提是一口气迁完。代价：新旧写法并存到第 56 批之前，后面改同一个插件的批次可能撞文件 | [N22 设计稿](../../action-input-contracts/spec.md) §9、[55](batches/55.md#batch-55-item-3)、[05](batches/05.md#batch-05-item-4) |
| <a id="decision-30"></a>30 · 11-08 | 侧栏浏览器的站点决定文件（`browser/sites.json`）读不了，或版本比程序新时，维持现在的做法：当作没有拦过任何网站，助理照常可以用侧栏浏览器。保存仍然报错，原文件不动（#1958）。代价：文件坏的这段时间，用户拦过的网站助理也能打开；这时新设的拦截只在这次运行里生效。「电脑操作设置」读不了时关掉总开关，两处方向相反，是有意不统一的 | 原 BL-browser-site-decisions-unreadable（已删）、[发布检查单第 3 节](../../../docs/releases/CHECKLIST.md#3-各库版本表) |
| <a id="decision-31"></a>31 · 11-07 | 一批一个 PR（放宽决定 28）：决定 28 合组后仍有约 50 个文件、最多两个包和多种单独开 PR 的限制，实际一批还是好几个 PR，每个都要同步 main、重测、排队。改成：每批从 main 切出本批分支，批内各项开子分支、做完合回本批分支，不开 PR；开发途中不同步 main，全批写完同步一次、解一次冲突、统一测一次，开一个 PR 合入 main；不限文件数和包数。文档不单独开 PR，spec、决策、BACKLOG、批次文件的记录、收尾检查都随本批 PR。用户当天弹窗定四项：① 取消文件数与包数上限，PR 里一项一组提交、描述按项分节；② 合同默认随本批 PR，只有别的批或别的片确实在等时才切出一个只改合同的小 PR；③ 门禁、脚本、CI 并进本批 PR，单独一个提交，描述单列「门禁改动」，改门禁仍先问用户；④ 评审在本批 PR 上做：按子分支同时开几个评审，另开一个审全 PR（兼做收尾检查）。另外提前切出的只有：main 红或安全修复、有固定窗口的事、等外部的、原需求要求单独验证的。代价：问题发现得晚、最后一次冲突大、PR 难审。已开的 PR 不重开，剩下的项立即适用。取代决定 28 的组的条件与「这些不和无关的任务合」表、决定 26 和轨道规则 1 的「合同先单独开小 PR」 | [开发流程第 8.4 节](development-workflow.md#batch-grouping)、[轨道规则 1](tracks.md#section-5)、[并行开发](../../../docs/system/PARALLEL-DEVELOPMENT.md)第 1、4、7 节、各批 Goal Prompt 第四、五、八、十节 |
