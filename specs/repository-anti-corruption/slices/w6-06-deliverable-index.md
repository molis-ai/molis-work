# W6-06：交付1–23索引

状态：既有交付入口与已核证据已汇总；最终交付、整线完成及归档未验收。负责人：Codex 根统筹，沿原 W6-06 接续，不改变专门事实的 owner。

文档基准为 `8315c6936745c992d75b4ef21f800baeffa81f8e` / tree `cc6654467265d7764fc26d0a469451773fa3a902`，不是最终共同树 F。要求沿[原任务书 §6](../../../docs/prompts/repository-anti-corruption.md#6-交付)；映射采用 `/tmp/codex-w6-closeout/w6-06-deliverable-index-draft.md` 及其 `w6-06-index-review.md`／`w6-06-index-reply.md`，第9项漏列插件版本回放的 P1 已在原稿修正。历史代码头、执行者、失败与替身边界保留，本次没有重跑或重审各 owner。

表中入口表示可复用文档／既有记录，不代表本基准已独立动态通过；复合项沿[主 spec §12](../spec.md)汇总，专门结论仍回原文件。当前规则和机器输入已由 T404 迁出到下列现行入口，不重复迁出旧归档计划的第一片。

| 原交付 | 现行入口与可复用内容 | 尚缺证据／接续 |
| --- | --- | --- |
| 1 首尾度量 | [主 spec](../spec.md) §12.5 的历史序列与方法；原 T370 证据线 | 候选F1517单次实测、B/M/旧F对照与增长解释已核收，见主spec§12.5；B/M未重算，仍待最终main采用绑定 |
| 2 兼容清理、保留理由、库与 Home | [合同保留机制／版本登记](../../../docs/system/CONTRACT-CHANGES.md)、[Home 数据](../../../docs/system/HOME-DATA.md)；主 spec §4 留历史 | 当前代码差集和真实干净 Home 最终结果；旧迁移已取消，不恢复维护八或存量转换 |
| 3 包与审查深度 | [现行包清单](../../../docs/system/PACKAGE-BOUNDARIES.md#7-现行包清单)、[SSOT](../../../docs/SSOT-MATRIX.md)；原源码审查见主 spec §12.7／12.9 | 只接现行成员相对历史切点的增量；源码审完不等于整改或运行通过 |
| 4 问题、证据、根因与结果 | 主 spec §12.8／12.11 及原修复证据 | W5 后继实际采用与最终核收；旧“待整合”不自动重开同一实现 |
| 5 主链及修后变化 | [CALL-CHAINS](../../../docs/system/CALL-CHAINS.md) | 后续变动链的文档／实际返回差集，归 W6-05 AC 与真实场景 |
| 6 分层与能力收敛 | [ARCHITECTURE](../../../docs/system/ARCHITECTURE.md)、[PACKAGE-BOUNDARIES](../../../docs/system/PACKAGE-BOUNDARIES.md)、[去特权表](../privileges.md) | 相关 W5 最终采用与原 PG 裁决；不把 I6 数字当现状 |
| 7 巨大单元 | [判定与迁移表](../../../docs/system/HUGE-CLASS-MIGRATION.md)、[有效例外](../../../tooling/gates/giant-exceptions.json) | F1517的50项巨大登记全部匹配；后继仅样本去重未改变核心测量，最终main另绑；登记不等于体量消失 |
| 8 扩展点与演练 | [EXTENSION-POINTS](../../../docs/system/EXTENSION-POINTS.md) 的现行操作入口与注明切点的历史成本／推演 | 已实现方向与真实探针的最终对应；推演不算实际演练，成本不重算 |
| 9 并行、合同、API、回放、CI、反馈与上手 | [协作规则](../../../docs/system/PARALLEL-DEVELOPMENT.md)、[合同流程](../../../docs/system/CONTRACT-CHANGES.md)、[API／门禁](../../../tooling/gates/README.md)；[插件回放工具](../../../scripts/replay-plugins.mjs)、[corpus](../../../tests/fixtures/replay-plugins/corpus.json)、[正反测试](../../../tests/replay-plugins.test.ts) | 两真实来源样本已入库，计数器与人工适配清单各有独立真签包回放，见各README；[答卷回放](../../../docs/platform/STUDIO-SKILL-REPLAY.md)不能互代。反馈／热点归 W6-04，上手归 W6-03，最终 CI 归 W6-05 |
| 10 逐插件实现、契约、接入、体验 | [plugin-conclusions](../plugin-conclusions.md)、[前端动线](../frontend-flow-walk.md) | FR／LC按既有原件接续；Pages跨搜索/MCP停启及Coding中断恢复差量已核收，剩最终组合适用性和下列真实边界 |
| 11 数据、状态、事件、权限、生命周期 | [Home owner](../../../docs/system/HOME-DATA.md)、[共写表](../../../tooling/gates/table-owners.json)、[安全不变量](../../../docs/system/SECURITY-INVARIANTS.md)、[W6-02](w6-02-lifecycle-rest.md) | Shelf／Goals原生命周期及Pages、Coding新增差量已核收；T409恢复、T122/T141 Home/origins、S8自动调度沿用；最终组合与真实Home仍归W6-05 |
| 12 AI 下沉、共享、业务保留与暂缓 | [AI 入口分类](../ai-entry-inventory.md)、[AI 手册](../../../docs/platform/PROLOGUE-AI.md) | 后续改变入口及恢复／取消路径的差集；原暂缓边界不解除 |
| 13 术语 | [GLOSSARY](../../../docs/system/GLOSSARY.md) | 已知术语／手册指针与T414合同差集已接回原文档；终局随W6-03核收，不重走六路线 |
| 14 静态检查 | [门禁规则集](../../../tooling/gates/README.md) | 准确最终头的检查／CI 与告警处置；接入不等于零告警，不放宽配置 |
| 15 依赖与 SDK | [依赖／SDK 方案](../dependencies-and-sdk-plan.md)、[当前包来源](../../../vendor/prologue-sdk/README.md)、[Memory 合同](../../prologue-memory-strategy/spec.md) | 当前组合、恢复与产品采用；provenance、上游合入和本产品实操分别记录 |
| 16 安全不变量 | [SECURITY-INVARIANTS](../../../docs/system/SECURITY-INVARIANTS.md) | 最终共同安全集、适用 Mac 边界及 HOLD 的原限制；Verify 绿不等于所有安全用例均已跑 |
| 17 切换、清理、去留与发布 | 主 spec §1、[Runtime 迁移](../../../docs/system/RUNTIME-MIGRATION.md)、[W6-01](w6-01-aliases.md)、[仓库卫生](../../../docs/system/REPOSITORY-HYGIENE.md)、[发布策略](../../../docs/releases/POLICY.md) | 剩余切换／实际采用／自有现场清理；两项获批装配例外保留，发布与真实 Home 仍按原授权 |
| 18 门禁及突变验证 | [门禁说明](../../../tooling/gates/README.md)、[规则实现入口](../../../scripts/gates/README.md)；主 spec §5a 留历史 | 各原变更到有效红／绿的对应；不因统一收尾重演全套突变或改门禁 |
| 19 原报告、附录 A、第一步交接 | 主 spec §12.2、[体检报告](../../archive/repository-systematic-review/spec.md)、[第一步基线](../../archive/post-merge-review/spec.md) | 当前剩余条目的证据闭环；主 spec R-01～14 与协调 R-01～73 不能同号销账 |
| 20 预期修正、回归与行为基线 | 主 spec §12.3 TE／§12.5；各原失败及干净基线证据 | FR／LC／TE／AC沿原件与Pages/Coding差量接续；旧审批未实调decide、真实模型及辅助技术边界保留，最终CI／Full仍待 |
| 21 手册／Skill | [W6-03 接续与原 smoke](w6-03-skill-replay-smoke.md)、[开发要求](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)、[插件 Skill](../../../skills/molis-plugin-dev/SKILL.md)、[Prologue Skill](../../../skills/molis-prologue-ai/SKILL.md) | 六路线、原smoke、已修手册、T414及两样本回放均分源核收；reading历史unknown与新提示词模型质量未验保留，RAC-11终局随最终承载结算 |
| 22 用户待决与 C 端方案 | 主 spec §1 的后续决定、[C 端就绪方案](../c-end-readiness.md) | 保留真正未决事项与原产品验收；方案已交不等于实现，不重问已决事项 |
| 23 未验证范围及原因 | 主 spec §8／§12 与下列剩余边界 | 最终由根按 W5／W6 原证据结算；不把已取消迁移、已补跑路线继续记成待执行 |

最新后继（2026-11-02）：W4两样本已入既有corpus。清单在 `c2cac66ce` 完成一次明确人工来源的公开修订、实际G1–G7与签包；随后独立单样本CLI安装／pin／兼容升级／Host关闭重开自然通过，唯一add后的完整id/time/正文/数量保持，零新增模型。计数器此前有效生成与独立回放沿用，没有重跑。两来源与旧失败在样本README分开记录；下列清单旧失败保留历史，不再代表本轮尚未签包。最终承载CI/Full与实际采用仍开放。

当前剩余及历史失败：

原清单生成空态失败、T412漏helper、T413负向验收缺口已由T414工程、明确人工修订和独立生命周期补齐。下文未执行／未签包只描述当轮，旧原件不改署新头，也不再作为当前同一项待执行。

- W4 计数器在原 `8315c693` 上已完成真实生成、四例完整数值验收、签包，以及独立安装／升级／Host 重启回放（`/tmp/codex-w6-closeout/w4-live-counter-submit-only-run1/independent-replay/RESULT.md`），不再重跑。清单单次生成于 2026-11-02 14:27Z 停止：首个空态界面断言失败，后续修复请求 11 次、用量回执 10 份，原件在 `w4-live-list-generate-run1`，清理完成；未签包或回放通过。后继 T412 清单修订于 15:31Z 停止：2 次请求均有用量回执，数组投影修正成功，但修订目录缺少原共享 helper，G2 失败、G3–G7 未执行，未签包，清理完成；原件在 `w4-live-list-revise-run1`。当时W4两样本整体尚未核收；现已由上方后继补齐。T411 的真实隔离 smoke 已完成 2/2 设计冻结、3 次内置修正（`/tmp/t411-evidence/REAL-SMOKE-RESULT.md`）；它只证明设计生成，费用／用量 unknown，不替代真实包验收。
- W6-05 场景4尚未执行。场景1已在 ef7719da 的原材料、提示词和断言下完成真实隔离安装、摘要、Todo 提取与采纳、普通及带日期待办创建、撤销和同一 work 回读，run3 于 2026-11-02 12:56Z 通过；其原两次失败保留，欢迎向导、受保护 Memory、真实 Home 与本人质量验收不由此签过。原件为 `/private/tmp/molis-minimax-01a19287/w605-scene1-run3/result.json`。其余场景沿各自已有结果，不由本稿重新签名。
- 场景2 run3 已完成 Pages／TypeSafe／当前 Memory 的原隔离链，场景3 run7 已完成 RSS→Inbox→Todo、移动及三种原身份搜索；分别沿 `/tmp/codex-w6-closeout/W605-SCENE2-RESULT.md`、`W605-SCENE3-RESULT.md`。场景5的右栏 Goals 空白已由 T380 修复，独立完整文件3/3覆盖可见列表、真实双击、双栏隔离和 reload，并经 T386 采用；原首败与网络 unknown 留存，不再列待修。场景6项目签包子链、7两项目 Todo 主链、8正常 Host 重启及原详情 reload 均有既有独立局部核收，沿 `/tmp/w6-scene6-execution` 至 `/tmp/w6-scene8-execution` 的报告；Home签包与origins沿T122/T141既有核收；T409完整恢复独立113/113保留原切点。运行中Coding确认卡的中断恢复已由下述差量补齐，真实模型后续仍不由局部结果代签。
- W4 清单在 b2635c20b 的原答案续跑通过 G1–G6 及前三项 G7；负向提交被现行仅支持成功提交的执行器拒绝，后两项未执行，未签包。原两答案完整保留、新模型请求0、清理完成，负向验收合同缺口见 [W6-03 接续](w6-03-skill-replay-smoke.md)。原三 brief 也已有 notes／reading／expenses 设计冻结；这些结果不代替清单签包及真实生命周期，计数器不重跑。
- dcf6af499 的两条独立差量已核收（`/tmp/w6-final-execution/LC-RESULT.md`、`CODING-RESULT.md`）：Pages同一安装移出后搜索与真实stdio MCP撤下、旧引用实调拒绝且owner零误写，加回后原文与身份恢复；主批16项有效、1项目录metadata误判保留，仅补目录可调用集为0。Coding真实SDK待批准写入时仅中断自有Host，同Home/profile/origin重开后保留原会话/轮次、显示核对界面，文件仍为原文、无模型/工具重放；7项自然通过。旧审批为cancelled且真实父文档无入口，未实调旧decide。两批均已清理，不重跑已绿路径。
- FR/LC/TE/AC与S1–S11沿既有原件归回，详见本机 `FINAL-EVIDENCE-DELTA.md`。S8的持久任务重启、无项目页面时由Host自动执行、关闭后迟到拒绝已有09e329371的完整 `schedule-resident-runtime` 5/5；所属旧Full整批失败仍保留，后继目标链无实质变化，沿用而不改署dcf新跑。当前Todo真实HTTP→timer提醒也已通过。真人读屏/中文输入法、具体多窗口重连unknown及真实模型主动跟进/后台回报继续单列，不因未重复读旧日志而重开整套矩阵。
- 候选F1517的四组同口径测量及增长解释已核收；已有build、63包匹配、typecheck／boundary及定向结果沿原切点有效差量复用，最后文档差量单独检查。准确最终承载的CI／Full、适用Mac终态、main实际采用及最终场景适用性尚待，不能把局部结果改署为新头全量。
- 干净真实 Home 的搬开重建、安装／重开／使用、原恢复与本人验收仍未完成；沿原用户窗口，旧存量迁移不恢复。

本次只把已有入口与证据接回原切片。W6-04／05 及适用 W5 边界核收前，整目录移动及其最终分类／引用切换、自有已合干净分支清理仍未完成；现行规范与未完成 accepted 合同继续保留活动入口。风险责任接续已在原协调表采用，本文件不复制风险登记、不改变关闭条件，也不新建任务或状态系统。
