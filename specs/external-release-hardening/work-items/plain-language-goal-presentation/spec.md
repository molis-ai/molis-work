# Goal 内容可读性与正文组织

## 背景与目标

当前问题有两层：Runtime 写入 Goal 的标题、Outcome、Why 和 `business_logic` 时容易使用模块名、
协议名和实现术语代替用户真正要解决的问题；Web 正文又把 Contract、关系、阻塞、验收、执行、风险、
Policy 和历史作为大量同级区块连续排列，阅读路径不够清楚。

本 Work Item 不新增字段或状态。它要求 Runtime 把现有业务字段写成人能直接理解的内容，并把 Goal
正文整理为少量、连续的阅读章节。

Molis Work Goal：`MOLIS_WORK-PLAIN-LANGUAGE-GOAL-PRESENTATION`。

## 当前行为与证据

- Skill 强调自然对话，但没有足够具体地约束每个 Goal 的持久化文案；例如“实现 MCP Session Context
  Resolver”仍可能被写成 Goal 标题或业务逻辑，而用户看不出最终体验。
- Web 当前顺序是业务逻辑、阻塞、验收、Draft 编辑、Runtime、关系、Contract、风险、Policy、历史；
  十余个同级标题没有表达“定义目标 → 判断完成 → 推进工作 → 管理风险 → 回看历史”的关系。
- 把这些内容全部放进一个默认收起的“执行细节”会丢失连续阅读路径，并在内部继续保留原有碎片，
  已由用户明确否定。

## 范围

- Skill 与协议要求 Runtime 在创建 Draft、澄清和提交 Goal Tree Proposal 前，对每条 Goal 的
  `title`、`outcome`、`why`、`business_logic` 和承诺输出做一次人话检查。
- `business_logic` 说明用户如何使用、谁做什么、关键规则和结果如何产生；数据库、MCP 方法、Session
  Resolver、Claim、Run、模块名等只作为必要的执行细节，不能代替业务说明。
- 提供正反例，明确技术约束继续放在 constraints、inputs、acceptance 或执行说明中，不丢失技术事实。
- 内置可重建 demo 使用同一套写作标准：Goal 标题、Outcome、Why、业务逻辑和 Candidate 默认先说明
  用户问题与结果，技术名词只作为验收、约束或历史辅助信息。它不能继续把旧的工程状态记录当成产品示范。
- Web 保持一张连续文档，不使用总括式“执行细节”折叠；正文收敛为五个阅读章节：
  1. 目标是什么；2. 怎样才算完成；3. 现在怎么推进；4. 风险与规则；5. 历史。
- 现有表单、锚点、关系、Risk、Policy、Claim、Run、Evidence、Review 和事件历史全部保留。

## 非目标

- 不新增、迁移或自动推断第二套业务说明字段。
- 不新增工作状态，也不从 Web 生成另一份“下一步”状态。
- 不把完整正文藏进一个大折叠区，不把连续文档改成卡片墙。
- 不自动改写已经 accepted 的历史 Goal；新内容和 Draft 在正常澄清、提案、确认流程中改善。

## 方案与关键决策

- “目标是什么”继续消费现有 Outcome、Why、`business_logic`，不派生新事实。
- “怎样才算完成”集中验收、范围/输入输出和 Goal 关系；Draft 编辑器也属于这段定义工作。
- “现在怎么推进”集中阻塞与 Claim/Run/Evidence/Review；仍只显示现有派生工作状态。
- “风险与规则”集中 Risk、Impact 和 Runtime/Review Policy。
- “历史”保留事件摘要和完整工程记录。
- 每个章节是连续页面里的一个一级区块；内部用较弱的子标题区分内容，不再让所有子系统拥有相同视觉权重。

## 文件与模块边界

- `skills/goal-advance/SKILL.md`：Goal 持久化文案的人话规则和正反例。
- `skills/goal-advance/references/protocol.md`：Draft/Proposal 提交前的字段可读性检查。
- `src/web/render.ts`：五段连续正文与必要样式，不改变数据消费和写入接口。
- `src/v1/demo.ts`：用人话内容示范复合 Goal、叶子 Goal、依赖、Risk、待决定事项与可恢复删除。
- `tests/mcp.test.ts`、`tests/web.test.ts`、`tests/project-catalog.test.ts`：Skill 指引、正文顺序和 demo 内容回归。
- `DESIGN.md`、`.impeccable/surfaces/src-web-render-ts.md`：记录最终阅读结构。

## 验收标准

- `PLAIN-C1`：Skill 明确要求业务字段写人话，并用 Molis Work 场景给出“技术名词标题”与“用户结果标题”
  的正反例；Proposal 前逐条检查所有父、子和叶子 Goal。
- `PLAIN-C2`：Web 正文只有五个清楚的阅读章节，内容顺序符合目标定义、完成判断、当前推进、风险规则、
  历史；没有总括式“执行细节”折叠。
- `PLAIN-C3`：原有 Goal 数据、唯一工作状态、表单、锚点和操作能力不变，自动化回归通过。
- `PLAIN-C4`：新建或重建 demo 后，首屏 Goal 与待决定事项默认使用业务语言；demo 同时提供已完成、
  推进中、依赖阻塞、待澄清、Risk 和回收站示例，用户无需先自己造数据就能理解主要状态。

## 验证

```bash
node --import tsx --test tests/mcp.test.ts tests/web.test.ts
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm typecheck
pnpm test
git diff --check
```

## 假设与开放问题

- 用户的老 Goal 不会被无授权批量重写；它们在之后的正常澄清或变更流程中逐步改善。内置 demo
  是明确标记为可重建的数据，因此会随 reset 使用新版示范内容。
- 技术词可以出现，但必须服务于理解或验收，不能成为默认业务表达。
