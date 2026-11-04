# 已定与待决事项

[执行目录](../spec.md) · [参考分类](../spec.md#reference)

<a id="section-7"></a>

## 待决定或继续细化

按最早影响的批次排列，保留原编号。这些要你定：按[开发流程第 6 节](development-workflow.md#6-预警与讨论)，要用户回答的不因到时没回改由统筹代定；只暂停依赖必要答案的部分，已定项和已有授权直接使用。方案细化沿原需求的决定范围，不因列在这里新增一次审批。

| 原编号 | 还缺什么 | 最早影响与继续工作的边界 |
| --- | --- | --- |
| <a id="decision-11"></a>11 | Sessions 会话交互和技术方案；创作台原 spec §7 的合同与交互；团队剩余细粒度规则、同步交互及团队记忆形成／融合／管理／使用策略 | 创作台 [03](batches/03.md)、Sessions [22](batches/22.md) 分别细化；团队部分到 [SRV-1](batches/srv-1.md)／[SRV-4](batches/srv-4.md)，不让团队方案阻塞个人路径。已定范围见下表，原负责人保留 |
| <a id="decision-23"></a>23 | 字体资源登记／预算与实测节省，新增资源／字体路径或必要门禁调整；Folio 实际字体及分发依据；额外首批语种 | [14](batches/14.md) 交方案，[16](batches/16.md) 前处理对应字体、语言及预算，[70](batches/70.md) 核发行物。中英文完整覆盖已定，未指定语种不算交付；真实 Home 发布文案转换沿原维护授权。依据：[实现方案 §12.2](../../font-and-skin-system/implementation-plan.md) |
| <a id="decision-18"></a>18 | 是否收窄 M1 的发行门槛。原建议仅要求第二台 Mac 安装、升级不丢数据、材料基础路径、统一输入和技能包，其余后续接入；尚未采纳 | [26](batches/26.md) 准备、[56](batches/56.md) 交付；决定前仍按阶段 2 完整退出条件。同步与团队已移服务端批，不能再列作 M1 前置；读取兼容仍从 M1 起算 |
| <a id="decision-9"></a>9 | Skill／Context／MCP／Tool 四份策略的其余内容尚未整体评审 | [41](batches/41.md)／[61](batches/61.md) 只等对应未定内容；已定的选择、恢复、权限与动态上下文直接使用，见下表 |
| <a id="decision-19"></a>19 | 是否先交不带 AI 生成首页的基础场景闭环，再接生成首页；这是退出条件拆分建议，尚未采纳 | [44](batches/44.md)；决定前保留生成首页在完整闭环内，材料基础路径仍独立推进 |
| <a id="decision-16"></a>16 | 引用声明之间是否检查语义一致（BL-128） | [61](batches/61.md) 的相关子项；不阻塞其他已定策略和服务 |
| <a id="decision-14"></a>14 | CGS 的七项 Skill 改内容技能包之外，插件本体按新 SDK 重做、改成场景组装，还是放下 | [71](batches/71.md) 定场景方案，[81](batches/81.md) 前定本体；与 Alchemist 同批已定，不重新讨论这一顺序 |
| <a id="decision-24"></a>24 | 服务端批什么时候开工 | [SRV-1～8](server-batch.md#server-batch)；同步、团队、团队记忆与 M2 已移出 01～89，部署、真实账号及费用由用户办理，01～89 不等它 |
| <a id="decision-13"></a>13 | 个人同步采用按收尾后形状重接、整支变基，还是先停；重接是原建议，尚未决定 | [SRV-1](batches/srv-1.md) 对账后、同步合同前；不把建议写成既定合入方式 |

原需求另有局部待决：H4 对外用词在 10；审查台账 N12／N14 的主人与合同、N47 的 Runtime 主人裁定及 BL-880 的门禁，按对应批次保留。02 核账时已定的 A4、N3、N16 和 BL-937 见下表。批次详情和[审查台账](../../../docs/reviews/adversarial-review-2026-11-01.md)维护具体条件，不因本表未单独编号就视为已批准。

## 已定结论与出处

这里只摘要产品决定；实现和验收状态回到原需求与批次证据，不以“已定”表示“已完成”。部分已定事项保留同一编号，与上表剩余问题对应。

| 原编号／日期 | 已定结论 | 依据与原需求 |
| --- | --- | --- |
| <a id="policy-a4"></a>A4 · 11-03 | 官网采用简明许可说明，区分个人或企业内部使用与须事先书面授权的对外分发、对外商业使用，并链接许可证。 | [产品建议 A4](../../../docs/product-operations/产品优化建议.md)、[官网口径与待办整理](batches/02.md#batch-02-item-5) |
| <a id="policy-n3"></a>N3 · 11-03 | 安全表已有的 CI／本地证据列必须为每个测试文件注明对应测试名，缺引用时 CI 失败。 | [审查台账 N3](../../../docs/reviews/adversarial-review-2026-11-01.md)、[第 27 批](batches/27.md#batch-27-item-5) |
| <a id="policy-n16"></a>N16 · 11-03 | 随公共截断函数接入，只检查源码中直接 `slice` 后加省略号的写法；既有数量只减不增。 | [审查台账 N16](../../../docs/reviews/adversarial-review-2026-11-01.md)、[第 06 批](batches/06.md#batch-06-item-2) |
| <a id="policy-bl-937"></a>BL-937 · 11-03 | 重建时直接删除旧助理轮次。新库从空库开始，不迁入旧轮次，不补写 `written_by`。由 BL-928 的维护窗口执行。 | [维护待办](../../BACKLOG.md)、[第 02 批重建清理](batches/02.md#batch-02-item-3) |
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
| <a id="decision-22"></a>22 · 11-03／11-04 | 每轨一个写手，轨道间按依赖并行（11-03）。11-04：统筹归 Claude（本机）统筹会话，Codex 只做 01、02 的写手、不再兼路线书总维护；会话按轨道跨批做到底，不按批次另开；具体写手见轨道表，在做什么看认领板 | [轨道与冲突规则](tracks.md#section-5)、[认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743) |
| <a id="decision-17"></a>17 · 11-04 | 不拆写手：C1～C3 仍是一个写手，由 Claude（本机）C 轨会话担任；Codex 交完 02（共享核心、SQLite 驱动、合同复位）并在认领板贴【C 轨交接】后接手，此前 C 轨会话只做不碰 C 轨文件的设计、盘点与自己那份快照的小合同。同包、同快照不并写照旧 | [轨道与冲突规则](tracks.md#section-5-1) |
| <a id="decision-21"></a>21 · 11-04 | 允许提前启动：不碰真实 Home 的核账、定样与实现照常往下做。02 的版本归一与重建、依赖它的 U0 生效与 05 的 U1 实现，等真实 Home 维护窗口；窗口在 02 其余项合入、重建步骤写清后，由统筹提前一天和用户约，当天在用户在场时按清单执行 | [02](batches/02.md)、[05](batches/05.md) |
| <a id="decision-12"></a>12 · 11-04 | 验收分开办：界面与体验类（视觉、动线、文案）由用户本人看实物；纯行为与工程类委托统筹在隔离 Home 实走并留证据，用户可抽查。委托验证不记作「本人认可」；已有的委托与接受保留 | [01 试用单](acceptance-01.md)、[开发流程第 9 节](development-workflow.md#9-验证) |
| 23 · 已定部分 | 中英文完整覆盖；额外语种未指定不算完成；资源与真实 Home 操作各沿原批准边界 | [字体实施方案 §12.2](../../font-and-skin-system/implementation-plan.md) |
| 24 · 已定部分 · 11-03 | 同步、团队、团队记忆、M2 移到 01～89 之后的服务端批；01～89 不等它，后续服务端需求继续并入该批；同步合同在 M1 后按兼容流程增加 | [服务端批](server-batch.md#server-batch) |
