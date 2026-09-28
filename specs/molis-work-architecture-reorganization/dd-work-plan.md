# Draft Dialogue / Goal Tree Decision 入口迁移计划

2026-09-06。沿用已接受 Goal `goal-1cb5db42-232a-426a-ac79-36c6320d621e` 的结果与非目标。原拆分提案 11 项全部 applied；DD1/DD2 现均 canonical completed，验收分别见 dd1-validation.md、dd2-validation.md。父项收口审查见 dd-parent-closure-audit.md，正式状态以 Molis Work 为准。下文保留实施时计划与决定历史。项目架构 SSOT 仍为本目录 `spec.md`，Goals/Execution/Governance/Workbench 的 README 与 public Contract 分别拥有模块事实。

## 实施前证据与问题（历史基线）

- DV1 已建立 `plugins/native/goals/src/draft-dialogue-contract.ts`、`goal-tree-contract.ts` 和 capability client，CLI/MCP adapter 已消费这些类型。不能重复建立同名端口或声称这些接口缺失。
- 真正实现仍在 `src/v1/coordinator.ts`：start/turn/resume 位于 1826/2006/2147；proposal submit/list/check/decide 位于 2266/2580/2607/2883。`src/local-host/composition.ts` 160–173 仍把七个 capability 转发给 Coordinator。
- Web 决定与预检仍有 root route composition；Proposal/Decision 复合 UI 仍在 root renderer。它们不属于刚完成的 GW5，不能漏到“页面已经全迁”的结论里。
- Governance 已拥有正式 Proposal/Decision/clarification records、来源校验和事务物化；Goals 拥有 Goal/关系/Policy/Planning 规则，Execution 拥有 Claim/Run；本项不重做 Store/schema，不复制权限或原子性规则。

## 保留、替换、忽略

保留现有功能、参数/返回值、错误码、权限、幂等、原子写入、cursor/history、恢复和可信用户决定来源。替换旧 Coordinator 的应用编排与各入口的旧 caller；使用已存在的公开 Contract 和 native Goals 应用组合，不新造总线或通用 workflow class。忽略旧大类的文件组织，不以简单复制成新大类算迁移完成。

完成等级：每项现有功能可用且本项前后端行为无损；全产品内部完整/发布验收仍由最终 Cutover 与用户要求的详细 E2E 承担。

## 两个可独立验收的结果

### DD1：迁移草稿澄清与恢复入口

用户/Runtime 能开始同一个草稿、记录事实与假设、记录下一问题或待确认摘要，中断后恢复原对话；不重复创建 Goal、Session、Claim/Run，不把 Runtime 推断变成用户确认。

- 生产/消费：Goals Plugin 的 DraftDialogueApplicationApi 实现消费 Goals/Governance/Execution 的公开端口；Local Host 注册新实现，CLI/MCP/Workbench 已有相关入口继续消费同一 capability。不存在 Web start UI 时不新增假想页面。
- 修改边界：新 draft-dialogue application/service 与必要 owner public API；对应 Coordinator 方法/私有 helper 退出；Local Host registration、CLI/MCP adapter、现有 Workbench 澄清呈现/就近文案及相关测试/文档。共享 helper 只在 caller 清零后移除，不迁另一条 Decision 流程。
- 验收：新旧同场景输入的返回、正式状态、历史和错误对账；重复请求与真正交错、错误 actor/Goal、租约过期恢复、进程重开与分页无损；输入/保存失败后用户可继续；旧七方法中的三项 caller/实现清零，无第二事实 owner。

### DD2：迁移目标树提案与决定入口

用户能看到完整方案、预检冲突、确认/拒绝/要求修改；只有明确决定才改变正式 Goal Tree，失败不部分落地，重试不重复，历史 Proposal 与 legacy handle 可恢复。

- 生产/消费：Goals Plugin 的 GoalTreeApplicationApi 组合公开 Planning 校验、Governance Proposal/Decision 原子写入和 Execution 状态；Host 保有可信决定来源与项目鉴权；Workbench mount 对应提案/决定 contribution，CLI/MCP 只适配。
- 修改边界：submit/list/check/decide 应用实现、相关 native/legacy 决定 helper；对应 root Web route、Proposal/Decision UI/文案/客户端与 Workbench adapter；Local Host 注册、CLI/MCP caller、契约/E2E 测试及文档。原已有 Candidate/Rewire/Contract 的独立执行能力不扩功能，统一决定入口消费到的 legacy 分支必须一起保留，不可绕回旧巨型实现。
- 验收：真实浏览器打开提案 → 检查 → 确认/拒绝/修订 → 刷新结果；无确认拒绝、错误身份、过期 baseline、整份冲突原子回滚、部分决定与重试、legacy 恢复；CLI/MCP 同输入结果一致；余下四项 Coordinator caller/实现清零。

两项各自包含完整应用、入口切换、旧职责退出、测试和文档，不再按前端/后端/测试拆任务。两项可以用既有稳定 Contract/fixture 独立验证，不以执行顺序制造 DD2 depends_on DD1；共享 Coordinator/Host/public index 改动按用户要求串行，先 DD1 后 DD2。

## 方法与依赖审查

采用迁移重构、软件开发、开发者工具、AI 人工复核四个方法；目录一致且已读完整正文。迁移提供行为基线/回退，软件边界提供公开端口，CLI/MCP/Web 消费并验证兼容，人工复核保证提案不能自行成为正式决定。无需新市场/商业/模型评测工作；不新增 AI 模型或自动决定。

逐条依赖规则归并核对：

- 迁移 M1/M2：每项内部先对账、切 caller，再删除旧实现；不是另设“文档/测试先行”的独立 Goal。M3/M5、软件 S3/S5/S6/S7/S9、开发工具 D1/D2/D3/D5、人工复核 H3/H5：公开契约和最终兼容产物是真实消费；两项使用已完成 EX3、EX4、GW3、DV1 的公开结果，最终 Cutover 必须消费本项完整结果。
- 软件 S1/S2：产品、项目与模块 SSOT 已确认，沿用原文，不重新规划产品或新建 SSOT Goal。S4：DD1/DD2 之间有稳定端口与真实 fixture，不互设实现依赖。
- M4/S8/D4/H4：拆分与新增关系已获本轮用户明确确认后才实施。M6/S10/D6/H6：同父、同文件和串行偏好不产生 depends_on。
- 人工复核 H1/H2：沿用原确认边界和代表性失败/恢复行为测试，不增加自动决策、模型迁移或发布工作。

现有 Draft/Decision Goal 在 canonical 图中没有 part_of，不能让总重组漏掉它。提案将它关联到总重组，并让最终 Cutover 消费其已迁入口与旧职责清零结果；不强挂到 Goals Mutation 父项，以免与已有 Execution 前置消费形成组合循环。保持所有已完成 Goal 不动；Goals Mutation 父项收口另按原承诺对账，不假装由这次提案完成。

## 验证与恢复

实施前在隔离 fixture 固定当前实际 public/HTTP/MCP/CLI 输出和持久化变化；不读写用户项目数据库。优先复用 `tests/proposal-entry-chain.test.ts`、`tests/host-entry-consistency.test.ts`、`tests/runtime-skill-flow.test.ts`、`tests/v1.test.ts`、`tests/web.test.ts`、`tests/mcp.test.ts` 及真实 Chrome fixture。新增每个测试必须能捕获对应错误语义或副作用，不只断言字段存在。

定向命令：`node --import tsx --test --test-concurrency=1 tests/proposal-entry-chain.test.ts tests/host-entry-consistency.test.ts tests/runtime-skill-flow.test.ts tests/v1.test.ts tests/web.test.ts tests/mcp.test.ts`；新增浏览器用例加入同一串行链。按依赖重建受影响 Module/Plugin/App/root，执行 `node scripts/check-package-boundaries.mjs`、`git diff --check`。类型通过不代替真正跨入口 E2E。

不改 schema/安装/现用 4173。每条完整链路先接入并验证，验证失败仅撤回本项未通过的 caller 切换，保留原事实/既有工作树；不得 git reset 或长期双写/双实现。正式完成后还要全产品 E2E → 整理 → 再 E2E → 初始架构要求审查。

## 决定与实施

用户在本对话明确回复「确认」，已通过正式决定路径采用整份拆分与关系变更。原父项 revision 2 保持 accepted/frontier_open；DD1/DD2 revision 1 均 accepted/closed_leaf，尚未完成。安装 GUI 暂停现用服务不在此次授权内。

DD1 实施边界：Goals Plugin 的独立 DraftDialogueApplication 只组合公开 Goals Query/Command、Execution Query/Validation 和 Governance clarification API。Governance 包接回现有 clarification 表的 Query/写入、事务和幂等，保持原表、记录和事件不变；不新增 schema，不复制 Goal/Claim/Run 的 Repository。旧 Coordinator 只临时负责实例装配，不保留三方法或其业务回调。CLI/MCP capability ID、输入输出和历史分页保持不变，现有 Web 草稿呈现不增加新功能。

确认后已按 semantic_review.review_order 读取 22 个受影响/相邻 Contract；图检查无问题。DD1/DD2 互补覆盖原父项，公共提供者 EX1/EX2/EX3/EX4/GW1/GW3/GW4/AP2/DV1 的接口职责不因本次新增消费关系改变。GW5 和 DV2 的已完成用户面继续复用；DV4、Developer、数据保证及 Cutover 仍保留原验收，未提前完成。总目标新增 DD 归属后的 coverage 与 Goals Mutation 父项残留写入仍须在后续收口核对（见 goals-parent-closure-audit.md），不构成阻止 DD1 先迁移的接口变化，不擅自改图。

### 预检发现与分阶段收口

已采用提案 `goal-tree-proposal-d6a1fac6-8695-4d89-8096-0d6eb3ba7f85`，11 项全部 applied，正式决定回执 cursor 1097。以下保留此前失败预检与修订原因，不再作为待确认状态。

首次提案漏填开发工具/人工复核的方法覆盖字段，提交门禁已拒绝；补齐映射后保存成功。第一版 Contract-update 仅给拆分字段，现用物化器要求完整 Contract，因此预检拒绝；已保留原 title/outcome/scope/criteria 全量修订，没有改验收。

第二版预检复现真实批次顺序问题：`goal.accepted_compound_closure_children_required`。同批 `goal/contract/candidate` 先于 `relation/dependency` 物化；已接受父项收口检查读取当前生效 part_of，而非同批尚未物化的关系。即使条目顺序/depends_on_item_ids 明确，仍先拒绝父项。当前确认路径不能原子新增子项并关闭这个已接受抽象父项。该问题归 DD2 的现有预检/决定调用链，实施时加入真实回归并明确修复边界，不借规划直接修改产品或绕过 MCP。

当前替代方案：整份提案创建 DD1/DD2、关联原父项/总重组、补消费依赖，原父项保持 `accepted / frontier_open`；完整 outcome/scope/criteria 不变，待两个子项完成后再按正式路径收口。保留失败提案并由修订版 supersede，不分批偷偷确认。这是完成顺序调整，不删除原承诺，也不把父项提前标完成。
