# DD2 实施说明

2026-09-06。执行 accepted `goal-reorg-dd2` revision 1；总范围、非目标和验收沿用 `dd-work-plan.md` 与 canonical Contract，不新增子 Goal，不请求重复授权。

## 当前调用链与问题

DD1 已 canonical completed，Evidence `evidence-4a0cc5ee-ba83-4d4b-a828-b5da26e0368a`，Review `review-8bca2c40-37c6-4d02-aa6b-6cc1df332898`。其最终 182 项回归也是本项开始时的行为基线。

本项开始时 Coordinator 为 8,496 行，submit/list/check/decide 位于 1826/2140/2167/2443；这些位置只记录迁移前基线。当前实现、旧职责退出与最终验收以 `dd2-caller-audit.md`、`dd2-validation.md` 为准。

事实副本主要是 Coordinator 的 Goal/Relation/Policy/Risk 写入和 baseline SQL，不是现有 Module 缺包。不能把这些 SQL 搬进 Plugin，不能仅把大类切为几个仍互相直接访问 Store 的文件。Goals/Governance/Execution 必须保持各自事实、校验、状态机的唯一 owner。

## 顺序与边界

1. 提案读取：Goals Plugin 的具名 Query 应用组合公开 Goals 身份查询、Governance native/legacy facts 与 cursor；迁真实 Host/Web/内部 caller，删原读取方法。决定后的会话关闭由 Governance clarification 公开记录端口接管，保留原事务、事件和关闭条件。
2. 物化：按 Goal Contract、Relation、Policy、Risk 分别通过 Goals owner 的有限 Command 承接原已授权写入；不改变事件、版本、失效/恢复语义，不放出任意 SQL 或通用对象修改入口。Candidate/Rewire/Proposal/Decision 状态仍由 Governance。
3. 应用：按提交、预检、决定、legacy 兼容与来源/基准组合完整用例；公开 facade 只组合有限方法，禁止循环回调原 Coordinator 的产品实现。复用 EX4 的执行端口，不另造权限副本。
4. 入口与呈现：Host/CLI/MCP/Web 统一调用新应用；Goals Native Plugin 拥有提案/决定 UI/copy/client，Workbench 只挂载并提供通用能力，可信用户来源仍由 Host 注入。
5. 完整验证后删除剩余旧四方法/独占 helper，更新开发文档、调用清单与验收；未完成的切片不作为 DD2 完成。

## 已复现问题

提交后的自动收尾仍调用 Coordinator `reconcileLifecycle`；只把 submit 方法搬走会留下产品回调。该链需要各 owner 的版本记录与 lifecycle history Query，再由 Plugin 组合既有 reconciliation 规则。先迁出 root Store 的 Contract/coverage 查询和 lifecycle event 查询：Goals、Execution、Evidence、Governance 各自只读自己现有事件类型，保留原 seq 顺序；Storage Contract 仅承载原事件记录的技术字段，不建新事件库、通道、表或状态机。随后再搬收尾组合，不将旧 Store 作为 Plugin 依赖。

预检与正式决定各自硬编码 goal/contract/candidate → policy/risk → relation/dependency/rewire 的顺序。父 Goal 收口读取尚未写入的同批 part_of，因此合法的原子提案被拒。修复必须统一两条链对真实依赖的处理；不得跳过生效子项检查、先写用户数据再补关系，或为放过错误而弱化 coverage/整份回滚要求。先加入能失败的真实提案回归，明确只读预检不落地、正式决定一次落地、关系失败仍不能完成父项，再改实现。

## 验证

决定呈现切片：先把 Web 风险修订与整份退回理由整理移至 Goals Plugin 的输入准备应用，Host 保留鉴权、可信用户来源、HTTP 状态和调用决定 API；不能让页面准备逻辑自行写入。随后按原生提案呈现、历史提案呈现、决定列表组合、客户端提交/刷新与文案/样式拆分。Workbench 挂载既有 UiContribution，通用图标、转义、语言和页面布局继续由 Host 提供；不从 Plugin 回调 root 的提案产品函数，不一次性搬成另一个 huge renderer。原 DOM/中文英文/按钮状态/焦点/错误恢复不变，并用原页面输出和真实浏览器路径验收。

决定链的 Contract revision 收尾：原 `transitionGoalRevisionDependents` 仍由 Coordinator 直接改 Claim/Run 并撤销旧 Review obligation。迁为 Execution 的有限 revision 命令和 Plugin 的 Execution→Governance 组合；保留 metadata 仅前移 Claim revision、其他变化结束旧 Run/撤销 Claim/豁免旧 obligation 的顺序与事件。Goals revision hook 不再回调旧产品方法，整份 Goal Tree 决定事务保持不变。

提交入口剩余持久化：`submit_goal_tree_proposal` 原幂等记录与 submitted/revised 事件归 Governance records 的有限提交端口，继续使用原表、operation key、hash、保存时间和外层原子事务。应用仅组合规范化、公开 Goal 查询/Planning、Run 权限、提案/条目与收尾；禁止把 `store.immediate/replay/remember/appendEvent` 作为 Coordinator 回调带入 Plugin。提交前的规范化仍在事务外；幂等重放仍先于 Run 活性检查，保证已完成 Run 的重试兼容。

2026-09-06 边界补充：普通 Draft 编辑的 `updateDraftGoal` 仍直接读写 Governance `contract_proposals`。这属于本项旧提案失效/恢复链清理，不新增功能。把该查询/更新移入既有 Governance records 的 supersession 方法，返回原创建时间顺序的 proposal IDs；Goals 通过必需的窄 port 消费，不提供静默空实现。Host 在同一连接装配，保留原事件内容和外层回滚。增加真实 pending/非 pending/其他 Goal 隔离、注入 supersession 后失败的整份回滚、同 key 重试和重放验证；直接 Module 测试也装配真实 Governance owner。

每个切片按影响面重建 contracts/Module/Plugin/App/root，跑相关 V1、跨 CLI/MCP/Runtime、Web 测试及边界检查。最终增加真实浏览器方案检查→确认/拒绝/修订→刷新路径，覆盖过期 baseline、无确认、错误身份、整份冲突回滚、部分决定、重试/重启和旧提案恢复。断言返回、持久化事实和副作用，不只返回字段。

命令沿用 DD 计划；新增本项测试加入串行验收。不运行无改动的 DV4 安装链，不停止现用 4173，不修改用户 Home/Applications 或模型配置。最终详细全产品 E2E 和总清理仍不是本项局部回归能代替的。
