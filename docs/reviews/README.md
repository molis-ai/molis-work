# 评审记录索引

按日期与主题查评审、日评与复审记录。它们是当时基线的记录，不是实时状态；当前状态看 `specs/README`、对应 spec 和 BACKLOG。

| 日期 / 文件 | 标题 | 当时状态 / 范围（未回写，当前看 spec） |
| --- | --- | --- |
| [adversarial-review-2026-11-01](adversarial-review-2026-11-01.md) | 全仓对抗式审查：问题台账 | 现行台账（2026-11-03 起只维护这一张表）。用户定只出报告，审查本身不执行整治；什么时候做、放在哪一批，看[路线书执行目录](../../specs/post-antico |
| [anthropic-capability-assembly-2026-10-18](anthropic-capability-assembly-2026-10-18.md) | 能力装配笔记：个人助理与 Coding | 设计笔记（2026-10-18，只读分析）。回答的是“Anthropic 那些能力在 Molis Work 里放在哪、由谁消费、怎么装”，不是实施 spec。 |
| [anthropic-ecosystem-assessment-2026-10-18](anthropic-ecosystem-assessment-2026-10-18.md) | Anthropic 插件生态对照评估 | 评估记录（2026-10-18，只读）。对照 Anthropic 的五个公开仓库，给出 Prologue、Molis Work 平台、Coding、个人助理的补充建议。本文不是实施 |
| [anti-corruption-checklist-c1531e6dd](anti-corruption-checklist-c1531e6dd.md) | Anti-corruption checklist | — |
| [anti-corruption-review-2026-10-16](anti-corruption-review-2026-10-16.md) | 代码防腐审查（2026-10-16） | — |
| [anti-corruption-review-c1531e6dd](anti-corruption-review-c1531e6dd.md) | Molis Work 代码防腐审查报告 | — |
| [cleanup-audit-2026-10-20](cleanup-audit-2026-10-20.md) | 系统清理检查报告（2026-10-20） | 只读检查。没有改产品代码、门禁、测试、规格或真实 Home；本报告只记录发现与建议的清理批次。2026-10-20 复查后修订了公开面口径与附录 A；第二轮复查（origin/ma |
| [code-boundaries-and-callchains-2026-11-11](code-boundaries-and-callchains-2026-11-11.md) | 代码边界 / 调用链 / 逻辑完整性 / 冗余重复 专项复审（2026-11-11） | 第二轮专项复审报告，接在第一轮《最新代码质量复审》（`docs/reviews/code-quality-review-2026-11-11.md`）之后。对象仍是 `origin |
| [code-quality-fixes-2026-11-11](code-quality-fixes-2026-11-11.md) | 2026-11-11 审查问题修复记录 | 已修复并在本工作树完成工程验证；未推送、未开 PR（用户 2026-11-11 授权全部修复、人工验收免掉、允许本地 commit）。详细审查见同目录两份报告（`code-qual |
| [code-quality-review-2026-11-11](code-quality-review-2026-11-11.md) | 最新代码质量复审（2026-11-11） | 一次性只读复审报告。审查对象为 `origin/main` `2630160877`（2026-11-11 15:17 UTC，PR #2028）；基线为 `5945c0271a` |
| [implicit-state-machines-2026-11-08](implicit-state-machines-2026-11-08.md) | Molis Work 隐式状态机盘点 | 审计报告（现行快照）。对象是本机 `main` 的 `5945c0271a`（2026-11-08）。只记录现状，不改代码，不含改造决定。 |
| [page-asset-allowances-review-2026-11-11](page-asset-allowances-review-2026-11-11.md) | 已采用页面资源许可的评审记录（2026-11-11 审查修复） | — |
| [performance-fix-review-2026-10-01](performance-fix-review-2026-10-01.md) | 性能修复复查（2026-10-01） | — |
| [platform-capability-audit-2026-11-14](platform-capability-audit-2026-11-14.md) | 平台能力通用化审查 | 只读审查报告（2026-11-14）。10 处该是平台能力、现在各写一份的地方，已分进批次（决定 44），去处见路线书依赖图 11-14 一节。 |
| [pr-review-2026-10-17-to-20-checklist](pr-review-2026-10-17-to-20-checklist.md) | 最近三天 PR 复审 checklist（227 个已合入 PR） | — |
| [pr-review-2026-10-17-to-20](pr-review-2026-10-17-to-20.md) | 最近三天 PR 复审（2026-10-17 至 2026-10-20） | 报告完成；只审不改。审计基线为 `origin/main` `3ba9185d7`（2026-10-20 16:07 UTC，含 16:25Z 合入的 #828）。共 227 个已 |
| [prologue-molis-work-assessment-2026-10-02](prologue-molis-work-assessment-2026-10-02.md) | Prologue 更新与 Molis Work 接入评估 | — |
| [2026-11-07-low-a](daily-quality/2026-11-07-low-a.md) | 2026-11-07 日评：低优先级 A 批修复记录 | 2026-11-08 用户已批准 A 批实施，ZCode 执行，Codex 监督与独立验收；本地功能验收已完成；集成分支 `codex/fix-20261108-low-prior |
| [2026-11-07-low-b](daily-quality/2026-11-07-low-b.md) | 2026-11-07 每日质量报告：低优先级 B 批复核 | D0070、N0704、N0705 已实现并通过本地定向验收，待 PR / CI（2026-11-08）；其余编号未实施。用户授权本轮先修把握高的项，由 ZCode GLM 协助、 |
| [2026-11-07](daily-quality/2026-11-07.md) | 2026-11-07 每日质量报告：第二版评估与修复方案 | 本轮仅处理已批准高项，分别提交独立 PR；中低项未实施。下文保留评估、批准和各次执行快照，最新合入结果以文末 PR 链接、在线 task list 及 main 回读为准。 |
| [2026-11-08-d0033](daily-quality/2026-11-08-d0033.md) | 2026-11-08 日评：D0033 打印边界补修 | #1994 已合入 main；2026-11-10 在 `98bcdd13e` 复验原场景与后续打印回收通过，详见[专项关闭记录](2026-11-10-frame-closure |
| [2026-11-08-low](daily-quality/2026-11-08-low.md) | 2026-11-08 日评：低优先级 A/B 分类与方案 | 2026-11-09 用户已批准 A-1（50项修复候选）实施并统一提交一个 PR；实施中。A 表示无需额外产品取舍、可由 Agent 处理；不表示每条都应再打补丁。B 表示需要用 |
| [2026-11-08-medium-gates](daily-quality/2026-11-08-medium-gates.md) | 2026-11-08 中优先级：独立门禁前置 | 2026-11-10 用户授权 tasklist 与 CI 通过后合并；PR #2003 全部适用检查和 Verify 通过，经正常合并队列合入 main（85cec224793d |
| [2026-11-08-medium-resources](daily-quality/2026-11-08-medium-resources.md) | A 类修复的页面资源实测 | 用户已明确批准这组最终体积变化与一次性放行记录（2026-11-09），记录在 `tooling/gates/page-asset-allowances/daily-quality |
| [2026-11-08-medium-supplement](daily-quality/2026-11-08-medium-supplement.md) | 2026-11-08 中优先级A类：四项分层补充方案 | 四项补充方案均已获用户批准并完成代码实施（2026-11-09），定向回归通过；最终结构门禁与 CI Full 状态见[中优先级 A54 spec](../../../specs/ |
| [2026-11-08-medium](daily-quality/2026-11-08-medium.md) | 2026-11-08 日评：中优先级处理方案 | 2026-11-09 用户批准A类54项，进入分批实施；B/C/D保持原裁定。103 个编号已全量列项；并不表示103条均确认为当前缺陷，待补证据项未关闭。 |
| [2026-11-08-test-types](daily-quality/2026-11-08-test-types.md) | 2026-11-08 D0069：tests 类型检查阶段交付 | 2026-11-09 用户批准先交付可运行检查命令与真实诊断；存量修复和必过CI另批。本命令当前非零退出，不表示已通过。 |
| [2026-11-10-copy](daily-quality/2026-11-10-copy.md) | 2026-11-10 日评：低风险文案修复 | — |
| [2026-11-10-frame-closure](daily-quality/2026-11-10-frame-closure.md) | 2026-11-10：插件 frame、打印隔离专项关闭 | D0033 / N0801 在 main 已有实现，本轮逐场景验收通过；D0103 测试清理缺陷已本地补修，尚未提交 PR。没有产品行为或安全权限变化。 |
| [2026-11-10-memory-closure](daily-quality/2026-11-10-memory-closure.md) | 2026-11-10：记忆分段清理与重试核回 | D0170 / D0176（关联 D0181）已完成现行调用链核查与专项补证；本轮只增加测试，不改变产品的分段提交语义。最终验证结果见下，尚未提交 PR。 |
| [2026-11-10-safety-closure](daily-quality/2026-11-10-safety-closure.md) | 2026-11-10：D0039、D0244 / D0242 验收闭环 | 最新 main 基准的定向验收通过；本轮仅补回归测试与验收记录，没有产品代码补丁。新增测试尚未合入。 |
| [2026-11-10](daily-quality/2026-11-10.md) | 2026-11-10 每日质量报告：首次分类 | 本轮只做报告分类与高项静态复核；未改产品代码、未运行测试。分类不等于缺陷确认，完整修复方案与逐场景验收尚未完成。 |
| [2026-11-11-feed-closure](daily-quality/2026-11-11-feed-closure.md) | 2026-11-11：Feed 分页验收与交付记录核回 | 用户已批准完整消费者改造，产品实现与本地定向验收已完成；待 CI Full 与合入，不把本地通过标为已上线。 |
| [2026-11-11](daily-quality/2026-11-11.md) | 2026-11-11 日报：第一批高项复核 | 待 review；只做静态评估，未改产品代码、未运行测试。 |
