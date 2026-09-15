# 通用任务拆解与叶子 Goal 判定

## 背景与目标

Molis Work 当前只检查 Goal 是否填写了结果、原因、业务逻辑和至少一条验收条件。Runtime 因此可以把仍然很大的目标直接标成 `closed_leaf`，也可以只拆出一层领域分类后停止。

更根本的问题是，复杂任务的拆解可能只停留在用户当前最关注的“事情本身”，没有继续交代让它真正成立所需的能力和基础。例如做一个产品不能只列功能，做一套 AI 能力不能只列模型效果，做内容或研究也不能只列主题；Runtime 还要沿着最终结果、实际执行或使用流程、核心能力、基础能力与基建、质量、交付和持续运行继续拆清楚。Footballnia 只是暴露这个问题的一个回归样例，不是规则的适用边界。

本任务让“叶子 Goal”成为有证据的结论，而不是 Runtime 自报的状态：只有范围已经收敛、剩余关键决定已经解决、可以独立推进、输出和验收彼此对应时，Goal 才能关闭为叶子。大型目标可以分阶段拆解，但只要仍有开放前沿，Molis Work 就必须保持“还没拆完”和明确的继续入口，不能把一层分类呈现成完成结果。

同时，任何复合任务在宣告拆解完成前都必须检查一条通用结果链：最终要做成什么、实际如何运转、需要哪些核心能力、这些能力依赖哪些基础能力与基建、如何验证和交付并保持可持续运行。游戏、App、AI/数据、内容/研究、运营流程及其他任务可以在通用结果链上追加场景专属检查；每个维度可以成为独立 Goal、明确归入已有 Goal，或说明为何不适用，但不能静默跳过。

## 当前行为和问题证据

- `validateGoalInput` 对可执行 Goal 只要求 `outcome`、`why`、`business_logic` 和至少一条验收条件，无法判断范围是否仍含多个独立结果、是否还有未决问题、验收是否覆盖承诺输出。
- 原生 Goal Tree Proposal 和旧 Contract Proposal 都允许 Runtime 直接提交 `accepted / closed_leaf`，没有“为什么已经可以独立执行”的结构化依据。
- 父 Goal 可以在提案中标为 `closed_compound`，同时保留 `abstract / frontier_open` 子 Goal；用户确认后容易误解为拆解已经完成。
- Molis Work Skill 虽然说明 Goal 可以逐步拆解，但没有要求遍历开放前沿、记录暂停状态或检查产品成立路径。
- 当前实现以 `game / app / other` 为主要场景，游戏和 App 的专项维度较完整，但通用任务只压缩为结果、流程、支撑基础、质量交付，没有明确区分核心能力、基础能力与基建，也没有覆盖 AI/数据、内容/研究和运营流程等不同任务。
- 会话 `019fe5e8-8e31-7602-906a-8eb466e8e036` 的大型游戏目标只形成一层领域分类，证明“先写 frontier_open、以后再拆”缺少实际继续机制。
- 上一版方案被用户退回，因为“具备独立执行与验收依据”仍可能被理解为 Runtime 自己声明已经够细，缺少可检查的拆分粒度。修订版必须明确一条叶子能包含什么、出现什么信号时必须继续拆。

## 范围

- 为 Runtime 提交的叶子 Goal 增加结构化 `leaf_readiness`：唯一主要结果、承诺输出归属、候选拆分项、结论、剩余未决问题和验收条件覆盖。
- 新提交的 `closed_leaf` 必须满足：结论为可执行；没有未决产品决定；没有仍可独立交付的子结果；范围、输入、输出和明确不做均已填写；每条验收条件有证据要求；所有验收条件都被 readiness 引用。
- 叶子粒度使用“一个主要可验收结果”作为硬门槛，不用工时、标题长度或固定树深。某块工作若能单独交付、单独验收、失败后独立返工三项中满足两项，就必须拆成独立 Goal；只有为同一结果服务且必须一起验收的步骤或辅助产物可以留在同一叶子。
- `leaf_readiness` 必须逐项覆盖 `promised_outputs`：标明它是主要结果、主要结果不可分割的一部分，还是应拆出的独立结果；不能只写一句“已经够细”。
- 为复合目标增加结构化 `decomposition_review`：拆解状态、任务类型、通用结果链与场景覆盖结论，以及仍开放的 Goal。
- `closed_compound` 只能用于拆解已经完成的复合 Goal：没有开放 Goal，通用结果链和必要场景路径检查完整，当前或同一提案中的全部后代均为 `closed_leaf / closed_compound`。
- 允许大型目标分阶段暂停；暂停时父 Goal 保持 `abstract / frontier_open`，开放 Goal 和下一步写入提案，澄清流程保持可继续。
- 所有复杂任务先检查同一条通用结果链：
  - 最终结果：要交付什么、给谁使用、成功后发生什么变化。
  - 实际流程：结果如何被产生、使用、维护，关键参与者如何协作。
  - 核心能力：完成主任务必须具备的业务、产品或专业能力。
  - 基础能力与基建：数据、内容资产、工具、权限、运行环境、集成、部署或必要流程。
  - 质量与持续交付：如何验证、上线或交付、监控、恢复和持续改进。
- 在通用结果链上按任务类型追加遗漏检查：游戏关注玩法、玩家旅程和视听；App 关注核心功能、端到端旅程和交互信息；AI/数据任务关注数据、评测、运行成本和安全；内容/研究任务关注资料来源、生产流程、审核和发布；运营流程关注角色、权限、工具、例外处理和衡量方式。
- 每个路径维度必须选择：独立 Goal、由已有 Goal 完整承担、不适用；后两者都要写清理由。
- 决定中心展示“为什么这条 Goal 可以直接执行”和“这次拆解覆盖了什么”，让用户能判断 Runtime 是否拆得过粗或漏项。
- 决定中心先展示当前待处理方案，再展示“最近处理结果”；历史核对不能把当前要做的决定挤出首屏。
- Molis Work Skill 与 protocol 明确 Runtime 的递归推进责任、暂停规则和提案字段。
- 对新规则增加领域、MCP、Web 和 i18n 回归测试，并至少用游戏、App、AI/数据和非软件任务验收；Footballnia 只作为游戏回归样例之一。

## 非目标

- 不用标题长度、字数、固定树深或预计工时机械判断叶子。
- 不要求所有项目生成完全相同的一套 Goal。
- 不自动替用户决定产品方向、审美、优先级或风险接受。
- 不迁移或批量改写已经接受的历史 Goal；新规则约束新提交的 Runtime Proposal。
- 不新增第二套 Goal 状态；继续使用 `abstract / frontier_open / closed_leaf / closed_compound` 和现有派生工作状态。
- 不在本任务中开发 Footballnia 游戏本身。

## 用户场景

1. Runtime 把“设计并交付完整足球游戏”直接标为叶子时，Molis Work 在提案进入决定中心前拒绝，并说明仍需拆分的独立结果或未决问题。
2. Runtime 拆出一层游戏领域后需要暂停，父 Goal 显示“拆解未完成”，记录下一批开放 Goal；用户稍后可以从同一 Goal 继续，而不是误以为已经得到可执行计划。
3. Runtime 提交真正可执行的叶子时，用户能看到为什么它可以独立完成、还剩哪些决定以及完成条件如何覆盖输出。
4. Runtime 把“完成交互设计、实现全部页面、接入数据、上线并监控”塞进同一叶子时，即使字段齐全也会因为存在可分别交付、验收和返工的结果而被要求继续拆。
5. Footballnia 的复合拆解必须逐项交代玩法、玩家流程、交互与 UI、视听、技术、质量和发布；足球内容不能替代这些结果。
6. 通用 App 必须交代核心功能、端到端流程、交互与 UI、技术、质量和发布；已经完整归入某个 Goal 的维度不重复创建同义 Goal。
7. AI/数据任务不能只写模型或分析功能，还要交代数据来源与质量、评测、运行方式、成本、安全和监控。
8. 内容、研究或运营任务不能因为没有代码就跳过基础能力；资料、工具、角色权限、审核流程、发布渠道和例外处理按实际需要进入 Goal Tree。

## 方案与关键决策

### 1. 叶子准备度

Runtime 在 Goal 或 Contract Proposal 中提交：

```text
leaf_readiness:
  verdict: ready | split_required
  primary_deliverable: 这条叶子唯一要交付并验收的主要结果
  output_coverage:
    - promised_output: 对应 promised_outputs 中的一项
      role: primary | supporting | independent
      reason: 为什么它和主要结果一起验收，或为什么必须拆出
  split_candidates:
    - work_item: 可能需要独立成 Goal 的工作
      separately_deliverable: true | false
      separately_acceptable: true | false
      independently_reworkable: true | false
      decision: keep | split
      reason: 为什么保留或拆分
  rationale: 为什么整条 Goal 仍然只有一个主要结果，或为什么还要继续拆
  unresolved_decisions: 尚未由用户或事实解决的问题
  independent_deliverables: 仍可独立交付和验收的结果
  acceptance_criterion_ids: 支撑“可执行”结论的完成条件
```

`closed_leaf` 只接受 `ready`。它必须有且只有一个非空的 `primary_deliverable`；`output_coverage` 必须逐项且不重复覆盖 `promised_outputs`，不能包含 `independent`；两个待办数组必须为空；验收 ID 必须完整覆盖这条 Goal 的验收条件。

候选工作在“可单独交付、可单独验收、可独立返工”中满足两项时，`decision` 必须是 `split`，整条 Goal 的 verdict 必须是 `split_required`，不能提交为 `closed_leaf`。满足不足两项时可以保留，但必须解释它为什么只是同一结果的步骤或辅助产物。这个门槛让用户能核对拆分粒度，同时避免按工时、文件或固定层数机械过拆。

### 2. 通用结果链与场景检查

复合任务先用跨场景的结果链检查“事情本身、核心能力、基础能力与基建、质量和交付”是否都有明确承担者，再追加当前任务类型特有的遗漏项。场景清单只负责发现遗漏，不决定固定树形；同一个边界清楚的 Goal 可以承担多项，一项需要独立交付或验收时才拆成新 Goal。

### 3. 复合拆解状态

Runtime 在关闭复合 Goal 时提交：

```text
decomposition_review:
  status: complete | paused
  task_context: game | app | ai_data | content_research | operations | other
  coverage:
    - area: 路径维度
      disposition: goal | owned | not_applicable
      goal_ids: 承担该结果的 Goal
      reason: 归属或不适用理由
  open_goal_ids: 仍需继续澄清或拆分的 Goal
  next_step: 暂停时下一步继续什么
```

`closed_compound` 只接受 `complete` 且 `open_goal_ids` 为空。`paused` 必须有开放 Goal 和下一步，父 Goal 保持开放拆解状态。

现有 `product_context` 作为兼容输入继续读取；新提案和用户界面使用更通用的 `task_context`，避免把所有工作都假设成软件产品。

### 4. 单一校验来源

新增无副作用的拆解校验模块，供 Proposal 提交、确认前预检和 Web 展示共同调用。单条校验负责 leaf/readiness 字段，整份 Proposal 校验负责父子关系、后代状态和产品路径覆盖，避免 Coordinator、Web 和 Skill 各写一套不同规则。

### 5. 向后兼容

历史已接受 Goal 保持不变；历史待决定 Proposal 若缺少新依据，页面说明需要 Runtime 重新提交，不尝试猜测或补写。用户手工维护 Draft 仍可保存，只有 Runtime 宣告其可执行或拆解完成时触发新门禁。

## 输入、输出与依赖

- 输入：Goal Contract、Goal Tree Proposal 条目、同一提案中的 Goal/关系变化、当前 Goal Tree、任务类型、通用结果链与场景覆盖说明。
- 输出：可提交的叶子/复合 Goal，或包含具体 Goal、字段、原因和修复动作的人话错误。
- 依赖：现有四种拆解状态、Goal Tree Proposal 历史、Draft clarification、决定中心和 Molis Work Runtime Skill。

## 文件与模块边界

- `src/v1/goal-decomposition-validation.ts`：readiness、通用结果链、场景路径和整树关闭条件的纯校验与人话问题。
- `src/v1/types.ts`：Proposal 可携带的 readiness/review 结构类型。
- `src/v1/coordinator.ts`：提交与决定前调用共享校验；不复制展示逻辑。
- `skills/goal-advance/SKILL.md`、`skills/goal-advance/references/protocol.md`：Runtime 递归拆解、暂停和 Proposal 结构要求。
- `src/web/render.ts`、`src/web/i18n.ts`：决定中心展示准备度、覆盖结果和修复路径。
- `tests/v1.test.ts`、`tests/mcp.test.ts`、`tests/web.test.ts`、`tests/i18n.test.ts`：领域、协议和用户界面回归。

## 验收标准

- 新的 Runtime Goal Tree 或 Contract Proposal 将 `closed_leaf` 用于缺少 readiness、仍有未决问题或独立交付项的 Goal 时，提交直接失败且不进入决定中心。
- 新叶子必须只有一个主要可验收结果；每个承诺输出都有唯一归属。候选工作命中两个拆分信号时必须成为独立 Goal，不能靠 rationale 覆盖。
- 合格叶子必须具备明确范围、非目标、输入、输出、完成条件和所需依据；readiness 引用全部验收条件。
- `closed_compound` 的当前或提议后代存在 `abstract / frontier_open` 时不能提交为“拆解完成”。
- 分阶段拆解可以保存，但父 Goal 保持“还没拆完”，开放 Goal 与下一步可见，澄清会话可继续。
- 所有复杂任务均逐项交代最终结果、实际流程、核心能力、基础能力与基建、质量和持续交付；缺项时提交失败并点名缺少的层级。
- 游戏、App、AI/数据、内容/研究和运营流程按各自场景追加遗漏检查，但不机械生成相同 Goal 模板。
- Footballnia 样例若只有足球内容分类会失败；补齐游戏设计、玩家流程、交互/UI、视听、技术、质量和发布归属后通过。
- 通用 App 样例能把 UI、交互和端到端流程归入明确 Goal；已经完整承担的维度不会要求重复建 Goal。
- 决定中心能用日常语言显示叶子成立理由、产品路径覆盖和未拆完的恢复动作。
- 决定中心在桌面和窄屏都先出现当前待处理方案，最近处理结果仍保留在后面且可核对。
- 现有权限、用户确认、Risk 校验、事务原子性和历史 accepted Goal 行为不回归。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/v1.test.ts tests/mcp.test.ts tests/web.test.ts tests/i18n.test.ts
pnpm test
pnpm build
git diff --check
```

真实验收：先用一个字段齐全但同时包含设计、实现、接入和上线的“伪叶子”验证粒度门禁，再用 Footballnia 型游戏、一个通用 App、一个 AI/数据任务和一个非软件任务分别提交过粗方案与完整方案，确认前者被明确拦截、后者能进入用户决定；在窄屏决定中心检查说明和操作无溢出。

## 假设与开放问题

- 默认允许大型目标分阶段拆解，但暂停不是完成：父 Goal 和开放前沿必须保持可继续状态。这一产品选择需要在父 Goal 提案中由用户确认。
- 首版通过结构化自证、树状态和用户确认提高质量，不引入模型评分或工时估算；后续可基于真实误判再增加更强的语义检查。
