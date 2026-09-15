# Compound State Reconciliation

## 背景与目标

Molis Work 已能在叶子 Goal 完成时向上结算复合父级，也能在已有 `accepted / abstract` 父 Goal 收口时结算；但普通 Draft 父 Goal 通过 Goal Tree Decision 变为 `accepted / closed_compound` 后，没有进入同一条结算调用链。

真实 Board 已出现两个反例：`MOLIS_WORK-PROJECT-CATALOG-BINDING` 与 `MOLIS_WORK-DIALOGUE-GOAL-TREE` 的 active 子 Goal 全部 `satisfied`，父 Goal 仍为 `unmet`。目标是在 canonical Goal Tree 决定实际物化内容后，在同一事务内统一修复当前与历史复合父级的派生完成状态。

## 当前行为和问题证据

- `materializeGoalTreeGoal()` 的 accepted 父级收口分支调用 `reconcileCompoundGoalAndAncestors()`。
- 普通 Draft 更新分支只更新 Goal 和验收条件，不调用复合状态结算。
- `reconcileCompoundAncestors()` 只从本次刚完成的子 Goal 向上走，无法发现此前已经形成的 stale `accepted / closed_compound / unmet` 父级。
- Board 事件顺序证明两个历史父级是在子 Goal 已全部完成后才通过 Goal Tree 更新为 `accepted / closed_compound`，但未产生 `goal.compound_satisfied`。

## 范围与非目标

范围：

- Goal Tree 决定至少成功物化一个条目后，统一结算同一 Board 中满足条件的复合父 Goal。
- 按子 Goal 事实由下到上处理多层父子树。
- 继续复用 `satisfyClosedCompoundGoalIfReady()` 作为唯一完成判断和事件写入点。
- 覆盖当前确认、历史 stale 父级、未完成子级、Contract/Relation 不变和事件幂等测试。

非目标：

- 不根据关系自动接受 Draft 或结束拆分。
- 不新增公开 CLI、MCP、Web 入口或第二套状态。
- 不在读取、启动或普通 Available 查询时写数据库。
- 不直接修改真实 Board 的 SQLite 来掩盖调用链缺口。

## 用户与调用场景

1. 用户确认一份 Goal Tree 提案，Draft 父 Goal 被更新为 `accepted / closed_compound`；如果其 active 子 Goal 已全部完成，决定返回前父 Goal与可完成祖先即为 `satisfied`。
2. 同一 Board 中存在历史 stale 复合父级；下一次实际物化 canonical Goal Tree 变更时，它们被同一结算器可审计地修复。
3. 仍有未完成 active 子 Goal 的父级保持 `unmet`，现有工作状态继续显示“已澄清，等待子 Goal”。

## 方案与关键决策

1. 在 `decideGoalTreeProposal()` 完成全部已确认条目的物化后，仅当 `appliedItemIds` 非空时触发 Board 级复合状态结算。
2. 新增一个私有协调方法，选出尚未完成的 `accepted / closed_compound / valid` Goal，排除回收站和归档 Goal，并重复调用现有 `satisfyClosedCompoundGoalIfReady()`，直到本轮不再产生状态变化。
3. 结算只更新 `fulfillment_state` 与 `updated_at`，事件仍由现有函数写入；不复制资格判断、SQL 更新或事件结构。
4. 不在 rejected、revise-only 或无物化结果的决定中触发历史修复。

## 输入、输出与依赖

- 输入：已物化的 Goal Tree 决定、当前 Board 的 Goal/active `part_of` 关系、子 Goal 的 canonical `fulfillment_state`。
- 输出：正确的父 Goal 与祖先 `fulfillment_state`，以及每个新完成父 Goal 的单次 `goal.compound_satisfied` 事件。
- 依赖：现有 Goal Tree 决定事务、`activePartOfChildren()`、`satisfyClosedCompoundGoalIfReady()`。

## 文件与模块边界

- `src/v1/coordinator.ts`：增加唯一 Board 级结算编排，并从 Goal Tree Decision 的物化路径调用。
- `tests/v1.test.ts`：新增当前确认、历史多层结算、安全边界和幂等回归。
- 不改 Store schema、MCP、CLI、Web 或 Runtime Skill。

## 验收标准

1. active 子 Goal 已全部完成的 Draft 父 Goal，在同一 Goal Tree 决定确认为 `accepted / closed_compound` 后立即 `satisfied`。
2. 多层 stale `accepted / closed_compound / unmet` 父级在一次实际物化的 Goal Tree 决定中自底向上全部正确完成。
3. 存在未完成 active 子 Goal 的父级保持 `unmet`；结算前后业务 Contract、definition/decomposition 状态和 Relation 完全不变。
4. 已完成父 Goal 再次经过结算不重复产生 `goal.compound_satisfied` 事件。
5. 定向测试、类型检查、完整测试和 `git diff --check` 通过。

## 验证命令

```bash
node --import tsx --test tests/v1.test.ts
pnpm typecheck
pnpm test
git diff --check
```

## 假设与开放问题

- `part_of` 已禁止新循环；若旧数据存在循环且没有可完成叶子，本次固定点结算会安全停止，不猜测完成。
- Board 级结算只处理派生完成事实，不承担历史 Contract 或拆分状态迁移。
