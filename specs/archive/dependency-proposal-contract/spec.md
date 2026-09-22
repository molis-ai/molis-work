# Dependency Proposal Contract

Molis Work Goal：`DEPENDENCY-PROPOSAL-CONTRACT`

## 背景与目标

当前 Runtime 只能把松散的 `proposed_relations` 放进 Candidate；`depends_on` 只要求类型和一句原因，无法让用户判断依据、方向和拒绝后果，也不能单独提议已有 Goal 之间的依赖变化。

本 Goal 建立可审查的 Dependency Proposal：Runtime 只提交待决定的 Rewire；用户确认后才新增或停用 active dependency。Proposal 必须保留足够证据，让用户能判断为什么是 A 依赖 B，而不是 B 依赖 A。

## 范围

- 定义强类型 `DependencyProposal`。
- 为 Runtime 增加独立的 `molis_work_v1_dependency_propose` MCP 能力。
- Candidate 中的 `depends_on` 也使用同一字段校验。
- 复用现有 Rewire 用户确认/拒绝入口。
- 用户确认后支持新增依赖或停用一条已确认依赖；反转由“停用旧方向 + 新增新方向”两个 Proposal 条目表达。
- 在 Goal 文档中展示待决定及历史 Dependency Proposal，包含可点击/复制的证据引用。
- 代码或其他事实变化只能提交新的 Proposal；Runtime 无权直接改 active relation。

## 非目标

- 不自动扫描代码或根据 import 自动生成依赖。
- 不实现通用图编辑器、批量拓扑算法或远程审批系统。
- 不改变用户手工创建 Goal 时直接指定 active parent/dependency 的现有逻辑。

## 数据 Contract

每条 `depends_on` Proposal 包含：

- `from_goal_id`：被阻塞/依赖的一方；
- `to_goal_id`：必须先满足的一方；
- `type: "depends_on"`；
- `action: "add" | "deactivate"`，Candidate 兼容输入缺省为 `add`；
- `reason`：依赖的业务原因；
- `basis`：`contract_output | code_reference | test_dependency | business_sequence | impact_conflict | risk_policy`；
- `evidence_refs`：至少一个代码、文档、测试或 Contract 引用；
- `impact_if_rejected`：用户拒绝该调整的后果；
- `confidence`：0–1；
- `direction_reason`：为什么是 from → to，而不是反方向。

## 行为与权限

1. Runtime 通过 `dependency_propose` 提交一个或多个 Proposal，可关联发现它的 Run。
2. Coordinator 验证 Goal、字段、证据、方向、confidence，以及 `deactivate` 是否命中 active dependency。
3. 写入一条 `pending` Rewire，不改变 `goal_relations`。
4. 用户可拒绝，active relation 不变；也可确认，Coordinator 原子应用全部 add/deactivate，并把受影响的 from Goal 标为 `needs_revalidation`。
5. Runtime MCP 不暴露 `rewire_confirm` 或直接 relation 写入口。
6. `blocking_mode=current_run` 时，相关 Run 的 Goal 在用户决定前不能完成；`none` 只记录待决定事项。

## 文件边界

- `src/v1/types.ts`：Proposal 类型。
- `src/v1/coordinator.ts`：校验、提交、确认和完成门禁。
- `src/mcp/server.ts`、`src/v1/cli.ts`：接口暴露；CLI 仅管理/调试。
- `src/web/render.ts`：文档式决策与历史呈现。
- `skills/goal-advance/`、`README.md`、`PRODUCT.md`：Runtime 协议与产品真相。
- `tests/mcp.test.ts`、`tests/v1.test.ts`、`tests/web.test.ts`：权限、数据、流程和 UI 回归。

## 验收标准

- `DEPENDENCY-PROPOSAL-C1`：缺少正式字段、证据、方向说明或有效 confidence 的 Runtime Proposal 被拒绝；完整 Proposal 可在 Contract/Web 中读取。
- `DEPENDENCY-PROPOSAL-C2`：提交 Proposal 不改变 active relation；只有用户确认 Rewire 才应用 add/deactivate，拒绝保持原状，代码变化只能产生新 Proposal/revalidation。

## 验证

```bash
pnpm exec tsc --noEmit -p tsconfig.json
node --import tsx --test tests/mcp.test.ts tests/v1.test.ts tests/web.test.ts
pnpm typecheck
node --import tsx --test tests/mcp.test.ts tests/v1.test.ts
pnpm test
git diff --check
```

UI 使用桌面与 390px 移动视口各检查一次；一次批量修正后最多再确认一次。

## 假设与开放问题

- `confidence` 使用 0–1 数字，Web 显示百分比。
- 本 Goal 不自动判断 Proposal 是否正确；它保证信息完整、权限正确、决定可审查。
- 当前无阻塞开放问题。
