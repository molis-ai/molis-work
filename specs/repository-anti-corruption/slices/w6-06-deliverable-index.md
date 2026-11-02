# W6-06：交付1–23索引

状态：既有交付入口与已核证据已汇总；最终交付、整线完成及归档未验收。负责人：Codex 根统筹，沿原 W6-06 接续，不改变专门事实的 owner。

文档基准为 `8315c6936745c992d75b4ef21f800baeffa81f8e` / tree `cc6654467265d7764fc26d0a469451773fa3a902`，不是最终共同树 F。要求沿[原任务书 §6](../../../docs/prompts/repository-anti-corruption.md#6-交付)；映射采用 `/tmp/codex-w6-closeout/w6-06-deliverable-index-draft.md` 及其 `w6-06-index-review.md`／`w6-06-index-reply.md`，第9项漏列插件版本回放的 P1 已在原稿修正。历史代码头、执行者、失败与替身边界保留，本次没有重跑或重审各 owner。

表中入口表示可复用文档／既有记录，不代表本基准已独立动态通过；复合项沿[主 spec §12](../spec.md)汇总，专门结论仍回原文件。当前规则和机器输入已由 T404 迁出到下列现行入口，不重复迁出旧归档计划的第一片。

| 原交付 | 现行入口与可复用内容 | 尚缺证据／接续 |
| --- | --- | --- |
| 1 首尾度量 | [主 spec](../spec.md) §12.5 的历史序列与方法；原 T370 证据线 | W6-04 同口径最终终点及首尾解释；不能把旧正则或消失的临时脚本拼入 AST 序列 |
| 2 兼容清理、保留理由、库与 Home | [合同保留机制／版本登记](../../../docs/system/CONTRACT-CHANGES.md)、[Home 数据](../../../docs/system/HOME-DATA.md)；主 spec §4 留历史 | 当前代码差集和真实干净 Home 最终结果；旧迁移已取消，不恢复维护八或存量转换 |
| 3 包与审查深度 | [现行包清单](../../../docs/system/PACKAGE-BOUNDARIES.md#7-现行包清单)、[SSOT](../../../docs/SSOT-MATRIX.md)；原源码审查见主 spec §12.7／12.9 | 只接现行成员相对历史切点的增量；源码审完不等于整改或运行通过 |
| 4 问题、证据、根因与结果 | 主 spec §12.8／12.11 及原修复证据 | W5 后继实际采用与最终核收；旧“待整合”不自动重开同一实现 |
| 5 主链及修后变化 | [CALL-CHAINS](../../../docs/system/CALL-CHAINS.md) | 后续变动链的文档／实际返回差集，归 W6-05 AC 与真实场景 |
| 6 分层与能力收敛 | [ARCHITECTURE](../../../docs/system/ARCHITECTURE.md)、[PACKAGE-BOUNDARIES](../../../docs/system/PACKAGE-BOUNDARIES.md)、[去特权表](../privileges.md) | 相关 W5 最终采用与原 PG 裁决；不把 I6 数字当现状 |
| 7 巨大单元 | [判定与迁移表](../../../docs/system/HUGE-CLASS-MIGRATION.md)、[有效例外](../../../tooling/gates/giant-exceptions.json) | W6-04 当前实测及原分片状态；合理例外不再强拆，登记不替代业务验证 |
| 8 扩展点与演练 | [EXTENSION-POINTS](../../../docs/system/EXTENSION-POINTS.md) 的现行操作入口与注明切点的历史成本／推演 | 已实现方向与真实探针的最终对应；推演不算实际演练，成本不重算 |
| 9 并行、合同、API、回放、CI、反馈与上手 | [协作规则](../../../docs/system/PARALLEL-DEVELOPMENT.md)、[合同流程](../../../docs/system/CONTRACT-CHANGES.md)、[API／门禁](../../../tooling/gates/README.md)；[插件回放工具](../../../scripts/replay-plugins.mjs)、[corpus](../../../tests/fixtures/replay-plugins/corpus.json)、[正反测试](../../../tests/replay-plugins.test.ts) | 已有公开 SDK／打包 Text Stats 样本不等于 W4 两份真实生成样本及真签包回放已核收；[答卷回放](../../../docs/platform/STUDIO-SKILL-REPLAY.md)不能互代。反馈／热点归 W6-04，上手归 W6-03，最终 CI 归 W6-05 |
| 10 逐插件实现、契约、接入、体验 | [plugin-conclusions](../plugin-conclusions.md)、[前端动线](../frontend-flow-walk.md) | 现行成员的 FR／LC／组合差集；不把旧成员数与局部截图推广为全集 |
| 11 数据、状态、事件、权限、生命周期 | [Home owner](../../../docs/system/HOME-DATA.md)、[共写表](../../../tooling/gates/table-owners.json)、[安全不变量](../../../docs/system/SECURITY-INVARIANTS.md)、[W6-02](w6-02-lifecycle-rest.md) | 已记 Shelf 第6次／Goals 第7次不再列“没跑”；最终 LC／AC／UI 组合仍归 W6-05 |
| 12 AI 下沉、共享、业务保留与暂缓 | [AI 入口分类](../ai-entry-inventory.md)、[AI 手册](../../../docs/platform/PROLOGUE-AI.md) | 后续改变入口及恢复／取消路径的差集；原暂缓边界不解除 |
| 13 术语 | [GLOSSARY](../../../docs/system/GLOSSARY.md) | 最终实现／手册对齐，沿 W6-03；不把旧待批句当新问题 |
| 14 静态检查 | [门禁规则集](../../../tooling/gates/README.md) | 准确最终头的检查／CI 与告警处置；接入不等于零告警，不放宽配置 |
| 15 依赖与 SDK | [依赖／SDK 方案](../dependencies-and-sdk-plan.md)、[当前包来源](../../../vendor/prologue-sdk/README.md)、[Memory 合同](../../prologue-memory-strategy/spec.md) | 当前组合、恢复与产品采用；provenance、上游合入和本产品实操分别记录 |
| 16 安全不变量 | [SECURITY-INVARIANTS](../../../docs/system/SECURITY-INVARIANTS.md) | 最终共同安全集、适用 Mac 边界及 HOLD 的原限制；Verify 绿不等于所有安全用例均已跑 |
| 17 切换、清理、去留与发布 | 主 spec §1、[Runtime 迁移](../../../docs/system/RUNTIME-MIGRATION.md)、[W6-01](w6-01-aliases.md)、[仓库卫生](../../../docs/system/REPOSITORY-HYGIENE.md)、[发布策略](../../../docs/releases/POLICY.md) | 剩余切换／实际采用／自有现场清理；两项获批装配例外保留，发布与真实 Home 仍按原授权 |
| 18 门禁及突变验证 | [门禁说明](../../../tooling/gates/README.md)、[规则实现入口](../../../scripts/gates/README.md)；主 spec §5a 留历史 | 各原变更到有效红／绿的对应；不因统一收尾重演全套突变或改门禁 |
| 19 原报告、附录 A、第一步交接 | 主 spec §12.2、[体检报告](../../archive/repository-systematic-review/spec.md)、[第一步基线](../../archive/post-merge-review/spec.md) | 当前剩余条目的证据闭环；主 spec R-01～14 与协调 R-01～73 不能同号销账 |
| 20 预期修正、回归与行为基线 | 主 spec §12.3 TE／§12.5；各原失败及干净基线证据 | 最终 F 上的场景、能力／UI 差分及 FR／LC／TE／AC；作者定向或旧 Full 不替代 |
| 21 手册／Skill | [W6-03 接续与原 smoke](w6-03-skill-replay-smoke.md)、[开发要求](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)、[插件 Skill](../../../skills/molis-plugin-dev/SKILL.md)、[Prologue Skill](../../../skills/molis-prologue-ai/SKILL.md) | 六类静态及限定动态已有核收；首次 reading 失败未定因，最终样板／手册对 F 的适用性与 RAC-11 仍未验证 |
| 22 用户待决与 C 端方案 | 主 spec §1 的后续决定、[C 端就绪方案](../c-end-readiness.md) | 保留真正未决事项与原产品验收；方案已交不等于实现，不重问已决事项 |
| 23 未验证范围及原因 | 主 spec §8／§12 与下列剩余边界 | 最终由根按 W5／W6 原证据结算；不把已取消迁移、已补跑路线继续记成待执行 |

仍开放的完成边界：

- W4 计数器在原 `8315c693` 上已完成真实生成、四例完整数值验收、签包，以及独立安装／升级／Host 重启回放（`/tmp/codex-w6-closeout/w4-live-counter-submit-only-run1/independent-replay/RESULT.md`），不再重跑。清单单次生成于 2026-11-02 14:27Z 停止：首个空态界面断言失败，后续修复请求 11 次、用量回执 10 份，原件在 `w4-live-list-generate-run1`，清理完成；未签包或回放通过。W4 两样本整体仍未核收。T411 的真实隔离 smoke 已完成 2/2 设计冻结、3 次内置修正（`/tmp/t411-evidence/REAL-SMOKE-RESULT.md`）；它只证明设计生成，费用／用量 unknown，不替代真实包验收。
- W6-05 场景4尚未执行。场景1已在 ef7719da 的原材料、提示词和断言下完成真实隔离安装、摘要、Todo 提取与采纳、普通及带日期待办创建、撤销和同一 work 回读，run3 于 2026-11-02 12:56Z 通过；其原两次失败保留，欢迎向导、受保护 Memory、真实 Home 与本人质量验收不由此签过。原件为 `/private/tmp/molis-minimax-01a19287/w605-scene1-run3/result.json`。其余场景沿各自已有结果，不由本稿重新签名。
- 最终 F 及其 build／typecheck:all／boundary、CI／Full、适用 Mac 边界、场景适用性和能力／UI 差分未核收；旧头或不同切点的局部通过按实际差量沿用，不能改署 F。
- 干净真实 Home 的搬开重建、安装／重开／使用、原恢复与本人验收仍未完成；沿原用户窗口，旧存量迁移不恢复。

本次只把已有入口与证据接回原切片。W6-04／05 及适用 W5 边界核收前，整目录移动及其最终分类／引用切换、自有已合干净分支清理仍未完成；现行规范与未完成 accepted 合同继续保留活动入口。风险责任接续已在原协调表采用，本文件不复制风险登记、不改变关闭条件，也不新建任务或状态系统。
