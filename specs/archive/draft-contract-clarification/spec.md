# Draft Contract Clarification

## 背景与目标

用户可以先手工录入一个只包含名称和粗略意图的 `draft / abstract` Goal。当前实现虽然把手工创建结果标成 Draft，但仍强制填写 outcome、why 和 business_logic；clarifier 也只能提交一个全新的 Candidate Goal，无法对同一个 Draft Goal 提交可审查的 Contract 补全提案。

本 Goal 要建立一条同一身份内的主流程：

```text
用户创建粗略 Draft
→ clarifier 认领并读取项目事实
→ Runtime 提交完整 Contract Proposal（仍未写入 canonical Goal）
→ 用户整体确认或拒绝
→ 确认时原子更新同一个 Goal，成为 accepted / closed_leaf
→ executor 才能领取
```

## 当前行为和问题证据

- `MolisWorkCoordinator.validateGoalInput` 对 Draft 也强制 title、outcome、why、business_logic 全部非空。
- Web 新建 Goal 表单把这些字段全部设为 required。
- `molis_work_v1_candidate_submit` 会创建新的 Candidate Goal，不能表达“补全现有 Draft”。
- SQLite 没有 Contract Proposal 记录；Contract、Snapshot 和 Web 都无法呈现字段来源、未确认状态或用户决定。
- Runtime MCP 没有同一 Draft 的补全提案工具，Management MCP 也没有相应用户确认工具。

## 范围

- 允许用户只用标题创建 `draft / abstract` Goal；其他 Contract 字段可以为空。
- 新增持久化 `ContractProposal`，绑定一个 Draft Goal 和一个 clarifier Run。
- Runtime 提交完整的 proposed Goal Contract、字段来源、Review policy、Impact、Risk，以及已单独提交的 Dependency Rewire 引用。
- 用户整体接受或拒绝 Proposal；接受时原子更新同一个 Goal，而不是创建新 Goal。
- 用户接受前 Draft canonical 字段、验收、Policy、Impact 和 Risk 都不改变。
- 接受时校验最小可执行 Goal 门禁，写入 accepted / closed_leaf、Acceptance Criteria、goal-level Review policy、confirmed Impact 和 open Risk。
- Dependency 仍使用 `molis_work_v1_dependency_propose → user rewire_confirm`；Contract Proposal 只能引用这些 Rewire，不能绕过独立依赖确认。
- Contract、Snapshot、MCP 和 Web 呈现 Proposal、字段来源和用户决定。
- Runtime Skill、协议、README 和 PRODUCT 与实现保持一致。
- Runtime Skill 明确双服务启动前置协议：宿主/管理入口启动并验证 MCP 与 Web，共用同一绝对 SQLite、`board_id` 和 Contract-derived `goal_url`；Runtime 只检查连通性与身份，失败即停止，不自行启动实例或切换真相源。

## 非目标

- 不实现字段逐项批准、多人协同编辑或 Contract 版本号。
- 不允许 Runtime 直接修改 canonical Goal 或批准自己的 Proposal。
- 不在本 Goal 中实现复杂的 compound Goal 拆分事务；拆分继续通过 Candidate Goal 提案完成。
- 不修改 accepted Goal。后续新需求创建新 Goal 并 Rewire。
- 不实现远程身份认证、云端多租户或 Runtime 进程管理。

## 用户与 Runtime 场景

### 手工 Draft

用户只填写“目标名称”即可创建 Draft。Outcome、why、业务逻辑和验收可以稍后补，页面明确显示哪些内容待澄清。用户创建时亲自指定的 parent / depends_on 仍可直接成为 active。

### clarifier 补全

clarifier 通过 Runtime MCP 领取 Draft，读取代码、文档和用户回答后提交一个 Contract Proposal。Proposal 必须引用发现它的 clarifier Run；Molis Work 不扫描仓库，也不把 Runtime 推断自动当成事实。

### 用户确认

用户在 Web 或 Management 入口查看“当前值 → 建议值”、字段来源、可信度、验收和 Review policy。用户可以：

- 接受并让同一个 Goal 变为可执行；
- 拒绝并说明原因，Draft 保持不变，clarifier 后续可重新提交新 Proposal。

## 数据 Contract

### ContractProposalRecord

```ts
interface ContractProposalRecord {
  proposal_id: string;
  board_id: string;
  goal_id: string;
  submitted_by: string;
  discovered_in_run_id: string;
  proposed_goal: CreateGoalInput;
  field_sources: ContractFieldSource[];
  review_policy: GoalPolicy;
  proposed_impacts: ProposedImpact[];
  proposed_risks: ProposedRisk[];
  dependency_rewire_ids: string[];
  state: "pending" | "approved" | "rejected" | "superseded";
  decision: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
}
```

`proposed_goal.goal_id` 必须等于目标 Draft，且必须满足：

- title、outcome、why、非技术 business_logic 非空；
- `definition_state="accepted"`；
- `decomposition_state="closed_leaf"`；
- 至少一个包含 decision method 和 pass condition 的 Acceptance Criterion。

### 字段来源

每条来源包含：

- `field`；
- `source_kind`: `user_answer | repository_fact | document_fact | runtime_inference`；
- 非空 `source_refs`；
- `confidence`，范围 0–1；
- `rationale`；
- `status="proposed"`；
- `requires_user_confirmation=true`。

Proposal 至少覆盖 `title`、`outcome`、`why`、`business_logic`、`in_scope`、`out_of_scope`、`priority`、`acceptance_criteria` 和 `review_policy`。constraints、required_inputs、promised_outputs 非空时也必须有来源。

“代码存在某个方法”可以是 repository_fact；“这个方法为什么属于业务范围”仍需用户确认。用户批准 Proposal 后，决定记录确认者和确认字段，但原始来源记录保留供审计。

### Dependency

Runtime 发现依赖时先调用正式 Dependency Proposal。Contract Proposal 可以列出 `dependency_rewire_ids`，但用户接受 Contract 前这些 Rewire 必须已经 `applied` 或 `rejected`；存在 pending Rewire 时拒绝接受并指引先做依赖决定。这样 Contract 确认不会静默激活、删除或反转关系。

## Coordinator 行为

### `submitContractProposal`

- 仅接受存在且仍为 `draft` 的 Goal。
- Run 必须存在、属于同一 Goal、role 为 clarifier、actor 与提交者一致。
- 完整校验 proposed Goal、field sources、Review policy、Impact、Risk 和 Dependency Rewire 引用。
- 同一 Goal 只能有一个 pending Proposal；新的有效提交将旧 pending 标记为 `superseded`，不引入版本号。
- 写入 Proposal 和 event；不修改 canonical Goal。

### `decideContractProposal`

- 只允许 `actor_kind=user`。
- rejected：仅更新 Proposal 决定，Draft 保持原样。
- approved：在一个 SQLite IMMEDIATE 事务中重新校验，并依次：
  - 更新同一个 Goal 的 Contract 字段和状态；
  - 替换 Draft 的 Acceptance Criteria；
  - 写入完整 goal-level Review policy；
  - 写入 confirmed Impact 和 open Risk；
  - 记录用户决定、确认字段和 event。
- 任一校验或写入失败，所有 canonical 状态保持原样。
- accepted Goal 不允许再提交或批准 Contract Proposal。

## MCP、CLI 与 Web

- Runtime MCP 新增 `molis_work_v1_contract_propose`。
- Management MCP 新增 `molis_work_v1_contract_decide`；Runtime audience 不列出也不能直接调用。
- CLI 增加 `contract-propose` 和 `contract-decide`，仅作为用户/管理和调试入口。
- `molis_work_v1_contract` 返回当前 Goal 的 Contract Proposals。
- Web 在对应 Draft 文档中展示：
  - 待补字段；
  - 建议 Contract；
  - 每个字段的来源、可信度和“待你确认”；
  - 验收、Review policy、Impact、Risk、Dependency 决定状态；
  - “拒绝提案”和“确认并设为可执行”操作。
- 页面不显示原始 JSON，不使用方格矩阵；使用连续文档列表，Goal 名称和业务内容优先于内部 ID。

## 文件与模块边界

- `src/v1/types.ts`：Contract Proposal 类型。
- `src/v1/store.ts`：migration 3、Snapshot 映射。
- `src/v1/coordinator.ts`：提交、校验、用户原子决定。
- `src/mcp/server.ts`：Runtime/Management 工具和权限表面。
- `src/v1/cli.ts`：管理/调试操作。
- `src/web/server.ts`：用户决定 endpoint 和 Draft 创建放宽。
- `src/web/render.ts`：Draft 缺口与可读 Proposal UI。
- `skills/goal-advance/`、`README.md`、`PRODUCT.md`：Runtime 协议和产品状态。
- `tests/v1.test.ts`、`tests/mcp.test.ts`、`tests/web.test.ts`：行为、权限和界面回归。

## 验收标准

1. 只填写 title 可以创建 Draft，executor 不能领取，clarifier 可以领取。
2. 缺少必填 Contract 字段、来源、验收或 Review policy 的 Proposal 被拒绝。
3. 完整 Proposal 提交后可读取，但用户决定前 canonical Draft 和协调事实完全不变。
4. Runtime 不能批准或拒绝 Contract Proposal。
5. 用户拒绝后 Draft 不变；用户批准后同一 Goal ID 原子转换为 accepted / closed_leaf。
6. 批准后 Acceptance Criteria、Review policy、Impact 和 Risk 与 Proposal 一致，executor Ready 门禁使用这些事实。
7. pending Dependency Rewire 阻止 Contract 批准；已决定 Rewire 不被 Contract 决定二次修改。
8. Runtime MCP 暴露 propose、不暴露 decide；Management 和 Web 可以做用户决定。
9. Web 使用连续列表清楚呈现当前值、建议值、来源、可信度、后果和操作；不泄露原始 JSON。
10. 新旧 SQLite 数据库都可迁移并通过完整测试。
11. Runtime Skill 将 MCP/Web 双服务启动与一致性验证归为宿主职责；Runtime 连通性或身份检查失败时停止，不能启动新实例、切换 SQLite、替换 Board 或改写 `goal_url`。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/mcp.test.ts tests/v1.test.ts tests/web.test.ts
pnpm test
pnpm typecheck
node --import tsx --test tests/mcp.test.ts tests/v1.test.ts tests/web.test.ts
git diff --check
```

UI 完成后按 Impeccable 约束执行一次 detector；桌面和移动端合并为一轮浏览器验收，最多一次批量修正和一次确认。

## 假设与开放问题

- V1 使用“整体接受 / 整体拒绝”，避免复杂的字段级合并。若用户不同意一部分，拒绝并让 clarifier 重提。
- 拆分已经有 Candidate Goal 流程，本 Goal 不重复创建第二套 split transaction。
- Actor 身份仍是本地可信宿主声明，不宣称远程认证。
