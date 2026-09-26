# 跨任务成果与方法复用

2026-09-26，用户授权实施。总约定：`../../spec.md`。目标：内部完整；所有 AI 经 Prologue。首要结果是第二次任务减少重新解释和准备。

## 要交付的结果

以「资料研究→形成判断→制作提案」为首个连续场景。第一次留下可编辑成果、来源与确认标准；第二次开始时找到适合的历史成果/方法，说明适用条件和需重核的信息，由用户采用或修改；第三次仍能使用改进后的方法。方法允许查看、修改、停用，采用与实际效果可追溯。

## 范围与边界

- 跨任务候选发现、固定版本引用、来源、适用条件、时效疑点及人工确认；旧结论未经检查不能当成本次事实。
- 把有效修改建议成方法，经确认后保存，后续适用任务实际消费；沿用 Artifact 和 Alchemist 已有「批注→确认 Playbook→后续应用」基础，先核对能否下沉复用，不另造平行成果/角色/配置库。
- 提供助理可调用的候选与方法能力。方法内容/生命周期由本任务负责，何时打扰、提醒及通用用户偏好由助理任务负责。
- 配合原体验/Onboarding owner，让用户在真实任务中从局部 AI 辅助逐步进入流程委托，保留明确接手位置；本任务拥有复用业务及专用界面，不接管整个工作台重设计。
- 不改 Builder、Cognia 2 学习教学产品、Connector 授权或云端同步；不把文件更多/方法成功保存当成复利证明。

## 并行与文件

depends_on：既有 Artifact、项目/成果身份、Prologue、Action。可独立完成手动选择与复用路径，再向助理提供候选接口；不等待其建议界面。使用独立工作树；先核对具体模块与测试路径并补到本文。共享 Artifact 契约只做必要扩展，共享入口由原 owner 串行接线。

## 验收

三次同类工作连续验证真实存储、版本、采用、编辑反馈与后续生效；覆盖不适用旧方法、过期材料、删除/撤回、权限不足、模型低质量及重启后继续。记录每次需要重新解释、准备和纠正的内容，用真实任务差异说明收益及局限，不编造节省百分比。AI 真正经 Prologue，实际业务动作由既有能力执行。

先做含真实或逼真内容的交互切片，再跑相关包 build/typecheck、定向业务与集成测试和隔离 Home 实操。精确命令由入口检查后补充；区分工程、真实模型和用户本人验收，未通过项保留。

## 实施合同（2026-09-26）

工作树 `/Users/yijunwang/.codex/worktrees/6385/goalboard`，分支 `feature/work-reuse`。起点 `0387c9b8` 及派发时带入的未提交基线；原 checkout 只读。已核对当前 Action、Alchemist 项目隔离 SQLite 与 Host Prologue 适配存在。README 的早期非 Agent 表述不覆盖本次明确授权。

沿用 Alchemist 研究→批注→确认 Playbook→下一次研究路径，新增“接着上次做”的局部界面，不建第二方法库或全局入口。方法正例、反例明确展示为适用和失效条件。方法修改采用版本递增及乐观并发检查；已创建计划保存方法正文/版本快照，执行前检查停用及版本变化，变化则要求重建计划。选用不计作实际应用；成功交叉核对才记录 plan/run 与固定方法版本，失败不会制造采用收益。

Artifact 仍是成果身份和内容的唯一来源。Host 注入当前项目 ArtifactsApplicationApi、ContextLedgerApi 与每次读取权限判断；复用模块只读明确授权的固定版本，展示时间、来源及需要重核的信息。可手选，亦可主动请求 Prologue 判断候选适用性；模型建议只能引用给定候选，空/坏输出可重试，不自动采用。旧材料仅作为背景，研究依然收集当前证据。确认计划持久化 Artifact 引用和用户采用理由；执行前及交叉核对后复核权限、归档/撤回、版本与方法状态，Context Ledger 记录实际消费关系。数据库与 Ledger 分属现有 owner，采用记录持久化后可幂等补写关系，不虚构跨库事务。

完成的研究可显式保存为固定 Artifact（含原报告/证据与时点），不自动公开；相同报告版本重试返回同一成果。Shelf 已有固定成果可经同一 Artifact 候选入口复用，不读原始私人剪贴板。首轮研究留下成果和方法，第二轮实际消费，第三轮修改条件后重新研究并形成提案判断；每轮记录解释、准备、纠正与未覆盖内容，不估算节省比例。

允许修改：`plugins/native/alchemist/src/` 中专属复用模块、Playbook/研究计划/研究运行的必要接线、专属界面和包导出；`plugins/native/alchemist/tests/` 定向测试；本子需求目录的切片与验证记录。仅增加 Alchemist 自有迁移，不修改全局 storage、Action 核心、Agent Host、导航或锁文件。Host 注入由动作 owner 串行接入，统筹负责跨任务合入。

验证命令：`pnpm --filter @molis-ai/molis-work-plugin-alchemist... build`、`pnpm --filter @molis-ai/molis-work-plugin-alchemist typecheck`、`pnpm --filter @molis-ai/molis-work-plugin-alchemist test`；必要依赖按实际包边界构建。定向测试覆盖版本固定/变化、不适用方法、过期警告、归档撤回、权限变化、坏模型输出、失败/取消/重启、重复采用和关系补写。交互在宽窄屏实操。模型实测只用无隐私材料与已配置 Prologue 服务，工程测试夹具与真实模型结果分别注明。

## 当前验收状态

具体证据与 Host 接线合同见 `verification.md`。Alchemist 实现及工程/隔离UI实操已通过；生产 Host 注入尚未完成；真实 Prologue 合成材料三轮已通过，目标仍是内部完整，不降低为“已发布”或“已验收”。真实模型给出过缺字段/重复字段/未转义引号，维持 schema 拒绝，并将输出提示收敛为每维度简短完整字段；仅按下述预算内规则纠正格式，结果仍完整校验，不虚构成功。

真实模型失败后的范围调整（Prologue owner 已明确授权）：仅研究 cross-check 在 schema/JSON 无效时允许一次格式纠错，仍调用原 Prologue，仅提交原无效输出和既有 schema，禁止补造事实。worker 在模型请求前持久化额外调用标记；只有原计划预算至少保留该次纠错及最终摘要时才启用（至少 4 次调用）。实际 callsUsed 随 checkpoint 保存，重启不丢失计费次数；模型/网络/权限错误不触发纠错，纠错仍无效直接失败，不修改校验、不自动扩预算。

Host 接线核对：规范 projectId 与原 Artifact boardId 独立，由 Host 注入；服务校验原 boardId，不伪造 Artifact 身份。夹具故意使用不同 ID 覆盖旧数据映射。

## 冻结版后的 P1 增量（2026-09-26）

统筹限定复核确认两个问题：①已保存的 title/reason/feedback 及 plan.reuse 可在原来源撤权后绕过当前读取权限。所有公开读取统一通过当前来源投影，保留固定引用、版本、run/consumedAt/关系状态等发生事实；不可读内容及无法安全分离的派生文字遮蔽，不删除真实消费记录。②generation 的调用前/后检查不能覆盖 Host 的配置、prepare、credential、queue 等异步等待。沿既有 StructuredGenerationRequest→AlchemistAiPort 传 beforeModelDispatch 回调，闭包绑定原调用者、固定引用与方法版本；同一回调贯穿 assess、cross-check、摘要及格式纠错，Host 与最终 SDK owner 负责与既有 guard 组合至实际发送边界。新增唯一私密 marker 读取回归、prepare/credential 屏障、方法/来源/调用者撤权及原 guard 拒绝回归。只交付冻结 implementation.patch 之后的增量，不改原补丁或派发基线。

业务增量为 `p1-revocation.patch`。全插件 26 文件/78 测试、包 build、原 Action/HTTP 4 项通过；当前读者投影和持续 guard 的业务侧传播完成，真实 Host/SDK 最终发送边界仍待原 owner 接线验证。细节与证据层级以同目录 `verification.md` 为准。
