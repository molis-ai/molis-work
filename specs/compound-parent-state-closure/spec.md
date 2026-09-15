# Confirmed Compound Parent State Closure

## 背景与目标

当前 Board 中已经有父子关系的父 Goal 仍显示“待澄清”。这不是状态机无法表达复合 Goal：Coordinator 已经把 `accepted / closed_compound` 且有 active 子 Goal 的父级派生为 `waiting_children`。缺口在于此前确认子树时，只写入了子 Goal 与 `part_of` 关系，没有同时把已确认的父级 Contract 确认为复合 Goal。

目标是让正常 Runtime 对话流程明确完成这一步，并让 UI 用一个状态清楚表达：**已澄清，等待子 Goal**。这不是新增第二个“澄清完成”状态字段。

## 当前行为和问题证据

- `deriveGoalWorkState()` 已在 `accepted + closed_compound + active children` 时返回 `waiting_children`。
- `tests/v1.test.ts` 已覆盖完整 Goal Tree 决定把父 Goal 变为 `accepted / closed_compound` 后得到该状态。
- 当前真实 Board 的 `MOLIS_WORK-PROJECT-RUNTIME-ONBOARDING`、`MOLIS_WORK-PROJECT-CATALOG-BINDING` 和 `MOLIS_WORK-DIALOGUE-GOAL-TREE` 仍是 Draft，尽管已有用户确认记录的子 Goal 关系，因此显示“待澄清”。
- `STATUS_LABELS.waiting_children` 只写“等待子 Goal”，没有直接告诉用户澄清已经完成。

## 范围与非目标

范围：

- 统一 Skill 和协议明确：用户确认完整拆分时，同一 Goal Tree Proposal 必须包含父 Goal 更新为 `accepted / closed_compound` 的条目。
- UI 将 `waiting_children` 表达为“已澄清，等待子 Goal”。
- 为“直接新增 `part_of` 关系不自动确认 Draft 父 Goal”的边界增加回归测试。
- 对已有、且历史中已有明确用户确认的父级，用可审计 Goal Tree 决定补记确认状态。

非目标：

- 不增加第二个可变状态字段或状态维度。
- 不根据任何父子关系静默接受所有 Draft 父 Goal。
- 不改写尚未由用户确认的父 Goal Contract。
- 不改变 Runtime、Session 或项目绑定逻辑。

## 用户与调用场景

1. Runtime 与用户完成一个 Goal 的拆分，提议“确认父 Goal 为复合 Goal、确认子 Goal、建立父子关系”。用户确认后，父级显示“已澄清，等待子 Goal”，Runtime 从 Available 中选择可推进的子 Goal。
2. 用户只是把一个发现的子 Goal 挂到仍在讨论的 Draft 父级。父级继续显示“待澄清”，不会被系统猜测为已确认。
3. 旧 Board 已经留有用户明确确认的树结构时，维护者通过同一 Goal Tree 决定补记父级确认；没有明确确认记录的 Draft 不迁移。

## 方案与关键决策

1. 保留现有单一派生状态机：`waiting_children` 仍是内部状态，不另设 `clarification_complete`。
2. 改 UI 文案为“已澄清，等待子 Goal”，同时传达已完成的澄清和下一步等待关系。
3. 强化 Skill/协议的完整提案要求，而不是让 `relation_add` 推断并接受父级。单条关系不等于用户确认完整 Contract。
4. 旧数据采用显式、可审计的 Goal Tree Proposal/Decision 修复，不写 SQLite 或批量猜测。

## 文件与模块边界

- `src/web/render.ts`：唯一工作状态的呈现文案。
- `skills/goal-advance/SKILL.md`：当前 Runtime 的完整树提案指引。
- `skills/goal-advance/references/protocol.md`：Runtime MCP 流程与状态解释。
- `tests/v1.test.ts`：父子关系与 Draft 确认边界。
- `tests/web.test.ts`：`waiting_children` 文案回归。
- Molis Work SQLite：只通过 CLI 的 Goal Tree Proposal/Decision 记录历史父级确认。

## 验收标准

1. 已确认的 `accepted / closed_compound` 父 Goal 有 active 子 Goal 时，仍派生 `waiting_children`，Web 显示“已澄清，等待子 Goal”。
2. 仅新增 `part_of` 关系不会把 Draft 父 Goal 静默转换为 accepted，且它仍是 `clarification_pending`。
3. Skill 与协议要求“完整拆分”的确认提案包括每个完成拆分的父 Goal 的 `accepted / closed_compound` 更新；不再让 Runtime 只提关系。
4. 已有的三个历史明确确认父级通过可审计决定更新；未明确确认的 Draft 保持不变。
5. 定向测试、Skill 验证、类型检查和完整测试通过。

## 验证命令

```bash
node --import tsx --test tests/v1.test.ts tests/web.test.ts
pnpm typecheck
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/generate_openai_yaml.py skills/goal-advance --interface 'display_name=Molis Work Runtime' --interface 'short_description=让当前 Runtime 通过 MCP 连续推进一个 Molis Work 项目' --interface 'default_prompt=Use $goal-advance to connect this work to Molis Work and continue the current Runtime flow.'
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm test
```

## 假设与开放问题

- “已澄清，等待子 Goal”是一个用户可见的单一状态文案，而不是两个独立状态。
- 历史修复只覆盖事件中已经有用户确认上下文的父级；其他 Draft 由后续 Runtime 对话澄清。
