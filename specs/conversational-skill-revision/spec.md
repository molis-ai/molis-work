# Molis Work Skill 对话与结构化确认改写

## 背景与目标

统一 `goal-advance` Skill 已覆盖项目解析、Draft 澄清、Available 选择、Goal Tree 提案和执行闭环，但它主要描述“调用什么”，没有把“怎么跟用户说”写成可执行的对话合同。Runtime 容易直接抛状态和工具术语、连续追问字段，或在关键确认前只给零散结论，让用户不得不一句句追问整个流程。

本 Work Item 让 Skill 在不增加第二套状态或入口的前提下，以自然对话持续推进：先复述理解和当前动作，解释下一问为什么重要，一次只问一个真正影响结果的问题；在恢复、方向变化和提案节点提供可修改的结构化摘要，并把用户原话、事实、假设和建议分别保存到现有 MCP 流程。

## 当前行为与问题证据

- Skill 已要求每个 material answer 调用 `draft_dialogue_turn`，但没有规定用户可见回复的基本组成。
- Skill 已要求完整 Goal Tree Proposal，但没有给出用户可读的确认摘要结构，Runtime 可能把工具 payload 或抽象条目直接交给用户。
- 项目 `suggested`、Available 选择、Draft resume 等入口有状态规则，但缺少自然的示例话术和“说清影响”的要求。
- 当前 `SKILL.md` 126 行，仍有足够空间在 500 行限制内加入必要规则；详细 payload 可继续放在 protocol reference，避免主 Skill 膨胀。

## 范围

- 主 Skill 增加统一对话合同：匹配用户语言、先对齐、解释原因、一次一问、少量选项、关键节点结构化摘要、纠正优先。
- 为项目候选、新想法、已有 Draft 恢复、Available 自主选择和 Goal Tree 决定给出代表性前向话术与状态转换。
- 明确每轮用户可见内容与 MCP 持久化顺序：先保存 material answer，再继续下一问；工具术语和内部 ID 不作为正常回复正文。
- 结构化摘要区分：用户已确认事实、可验证项目事实、Runtime 假设、Runtime 建议；假设和建议不能伪装成 canonical Goal。
- Proposal 摘要覆盖目标结果、Goal 族/子树、关系与依赖、验收、风险、明确不做和确认后状态变化；支持整份或点名条目修改。
- protocol reference 补充精确的对话持久化和恢复规则；不复制主 Skill 的全部用户话术。
- 增加静态前向契约测试和 `quick_validate` 验证。

## 非目标

- 不改变 MCP schema、Coordinator 状态机或 Goal Tree 决策权限。
- 不增加 Web 表单式澄清或要求主动打开 Web。
- 不强制所有回复使用固定标题或模板；结构是语义要求，Runtime 应自然表达。
- 不让 Runtime 自动替用户确认整份提案、绑定项目、删除或切换。
- 不把安装说明塞进对话主流程；安装与 Runtime 配置继续由共享服务/UI 处理。

## 用户场景

1. 新想法：Runtime 用一句话复述目标，说明当前只创建可继续澄清的 Draft，再问一个会改变结果边界的问题。
2. 用户回答模糊：Runtime 说明为什么需要区分，给 2–3 个差异明确的选项和取舍，而不是让用户填写字段清单。
3. 继续已有 Draft：Runtime 先说上次已确认、仍是假设和接下来只需要决定的一件事，再从原 question 恢复。
4. “继续推进”：Runtime 从 Available 自主选择一项，说明为什么选它和状态已更新，然后直接工作，不反问用户选择唯一下一份。
5. 提案就绪：Runtime 展示可扫描的 Goal Tree 和结构化摘要，说明确认后哪些 Goal 会变成 waiting children / execution pending，允许用户整份确认或点名修改。

## 方案与关键决策

- 主 Skill 新增“Conversation contract”，定义每个用户可见 turn 应完成的语义，而不是僵硬模板。
- 常规轮次保持短：理解 + 提问原因 + 一个问题。只有恢复、方向变化、信息积累或提案节点展示结构化 checkpoint。
- 建议选项最多三个，差异必须是真实产品取舍；没有可靠选项时直接问，不为了形式编造。
- 用户纠正优先于 Runtime 既有摘要：先承认并重述新理解，再用新 `draft_dialogue_turn` 保存，不为旧推断辩护。
- internal payload 继续按 protocol 保存；用户可见摘要只显示理解所需内容，不暴露 `actor_id`、`run_id`、`binding_id` 或工具名堆栈。

## 输入、输出与依赖

- 输入：用户当前语言与原话、Molis Work context resolution、Draft dialogue、Available item、Goal Tree proposal/check 结果。
- 输出：自然对话、结构化 checkpoint、持久化 dialogue turn、可决定的 Goal Tree 摘要。
- 依赖：现有 Runtime MCP 工具、`references/protocol.md`、Skill validator。

## 文件与模块边界

- `skills/goal-advance/SKILL.md`：用户对话合同、入口话术和确认摘要。
- `skills/goal-advance/references/protocol.md`：持久化顺序、来源分类和恢复精确规则。
- `skills/goal-advance/agents/openai.yaml`：短描述和默认 prompt 对齐自然对话目标。
- `tests/mcp.test.ts`：代表性入口与对话合同静态前向回归。
- `README.md`：简要说明 Skill 的用户体验，不复制完整协议。

## 验收标准

- 新想法、已有 Draft 和 Available 三类代表性前向路径都明确：当前 Runtime 自己继续、自然说明当前状态、只问必要问题或直接执行。
- 对话 checkpoint 能区分已确认事实、项目事实、Runtime 假设和建议；提案摘要可逐项修改。
- Skill 明确禁止字段审问、内部 ID/工具术语倾倒、重复询问和无理由追问。
- `quick_validate.py` 通过，frontmatter 仅含有效字段，`SKILL.md` 不超过 500 行。
- 现有 MCP authority、项目确认、Goal 状态和回收站规则回归不变。

## 验证命令

```bash
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
wc -l skills/goal-advance/SKILL.md
node --import tsx --test tests/mcp.test.ts
pnpm test
```

## 假设与开放问题

- Runtime 应匹配用户当前语言；示例可使用中文说明行为，但 Skill 规则保持对多语言 Runtime 可执行。
- 结构化摘要不是每轮固定模板，是否展示由信息量和决策节点决定；提案就绪时必须展示。
