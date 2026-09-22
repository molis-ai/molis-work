# Accepted Compound Closure

## 背景与目标

已有部分父 Goal 的业务 Contract 已被接受，且已有已确认的子 Goal；但父 Goal 仍是 `abstract` 或 `frontier_open`，因此 UI 和 MCP Contract 显示“待澄清”。这与实际进度不符。

目标是在用户通过 Goal Tree Proposal/Decision 明确确认“该父 Goal 的拆分已经结束”时，安全地把它收口为 `accepted / closed_compound`，并立刻按子 Goal 的完成情况派生唯一工作状态。

## 当前行为和问题证据

- `deriveGoalWorkState()` 已能把 `accepted / closed_compound` 且有未完成 active 子 Goal 的父 Goal 派生为 `waiting_children`，并把全部子 Goal 完成的父 Goal 派生为 `satisfied`。
- `reconcileCompoundAncestors()` 已能从完成的子 Goal 向上推进复合父 Goal。
- Goal Tree Proposal 对任何已有 accepted Goal 都报 `goal.accepted_contract_immutable`，所以无法只确认其拆分状态，历史 accepted 父 Goal 会一直停在“待澄清”。

## 范围与非目标

范围：

- 在 Goal Tree Proposal/Decision 中支持一个严格受限的已有 accepted 父 Goal 收口。
- 仅允许 `abstract` 或 `frontier_open` 转为 `closed_compound`。
- 收口时要求至少一个 active `part_of` 子 Goal，并在同一事务中重算父级和可完成祖先。
- 为成功、拒绝和状态派生补充回归测试。

非目标：

- 不修改任何 accepted Goal 的业务 Contract 或验收条件。
- 不根据普通关系新增、直接 API 或历史扫描静默收口父 Goal。
- 不新增第二套工作状态或批量修复历史数据。

## 用户与调用场景

1. Runtime 与用户确认现有 accepted 父 Goal 的完整拆分后，提交一个只把 `decomposition_state` 设为 `closed_compound` 的 Goal Tree 条目；仍有未完成子 Goal 时，父级显示“已澄清，等待子 Goal”。
2. 如果直接子 Goal 已都满足，确认收口后父级立即满足，并继续向已经收口的祖先传播。
3. Runtime 尝试改标题、范围、验收条件、`definition_state`，或没有 active 子 Goal 时确认收口，系统拒绝这条提案，原 Contract 不变。

## 方案与关键决策

1. 将“受限 accepted 复合收口”识别为单独的 Proposal materialization 分支；普通 accepted Contract 仍完全不可变。
2. 该分支只接受完整 payload 中与现有业务 Contract 完全相同的值，唯一可变字段是 `decomposition_state`，且目标必须是 `closed_compound`。
3. 物化成功后记录专门的审计事件，并调用已有的 `reconcileCompoundAncestors()`；不复制状态机或完成传播逻辑。
4. 保持现有 Web 文案与 MCP Contract 由同一 `deriveGoalWorkState()` 提供，因此不需要另建状态同步路径。

## 模块边界

- `src/v1/coordinator.ts`：判断和物化受限收口、触发已有重算逻辑、记录审计事件。
- `tests/v1.test.ts`：Goal Tree 集成、不可变边界、无子 Goal 拒绝、已完成子树及祖先传播回归。
- `tests/web.test.ts`：仅当现有状态展示无法覆盖 Contract/Web 一致性时补充；本次不重做 UI。

## 验收标准

1. 用户确认后，accepted/abstract 或 accepted/frontier_open 且有 active `part_of` 子 Goal 的父 Goal 只能变为 accepted/closed_compound；标题、Outcome、Why、业务逻辑、范围、约束、输入、输出、优先级和验收条件完全不变。
2. 收口后有未完成子 Goal 时，MCP Contract 和 UI 使用同一工作状态 `waiting_children`（“已澄清，等待子 Goal”）。
3. 若直接子 Goal 已全部满足，收口立即将父 Goal 及可满足祖先更新为 `satisfied`，并保留审计事件。
4. 没有 active 子 Goal、目标状态不合法，或 payload 改动任何 accepted 业务字段时，提案被拒绝且原状态不变。
5. 普通 accepted Contract 的不可变规则与普通关系新增不变。

## 验证

```bash
node --import tsx --test tests/v1.test.ts
pnpm typecheck
pnpm test
git diff --check
```

## 假设与开放问题

- “当前 Runtime 中的受信用户确认”已经由 Goal Tree Decision 的 authority 审计字段保证。
- 历史父 Goal 不会被本改动自动修复；后续 Runtime 必须在和用户的对话中明确确认对应收口。
