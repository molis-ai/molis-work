# Molis Work Runtime Skill 信息架构重构

## 背景与目标

`goal-advance` 已覆盖项目关联、Goal 澄清、规划方法召回、拆分、依赖、执行、证据、验收和恢复，但入口 `SKILL.md` 同时承载大量条件流程，并与 `references/protocol.md` 重复。规划主循环位于入口后半段，Skill 的发现描述和 UI 文案又偏向“启动 Web”，容易让 Runtime 抓错主线。

本次达到“内部完整”：在不改变 Molis Work 数据、状态和 MCP 行为的前提下，把 Skill 重组为清晰、渐进加载的 Runtime 工作协议，并通过结构与真实规划不变量测试证明关键规则没有丢失。

## 当前行为与问题证据

- `skills/goal-advance/SKILL.md` 约 279 行，Web 启动排在第一条主流程，规划方法召回在后半段。
- 项目关联、规划、拆分、执行和恢复规则在 `SKILL.md` 与 `references/protocol.md` 重复维护。
- `agents/openai.yaml` 的简介和默认提示突出 Web 启动，没有准确表达规划、依赖与持续纠偏能力。
- `tests/mcp.test.ts` 对 Skill 使用大量逐句正则断言，能防误删，却无法证明规划输出满足关键不变量，也让合理改写变得困难。

## 保留、替换、忽略

### 保留

- 只有用户明确调用 Molis Work 才开始关联或 Goal 工作。
- Goal 生命周期只通过 `molis_work_v1_*` Runtime MCP；Web 服务管理是唯一受控 CLI 例外。
- 项目关联、切换、删除与 Goal 回收站保持现有确认和权限边界。
- 同一对话内澄清、持久化、Proposal、用户决定、执行、证据、Review、完成和恢复闭环。
- 方法组合、跨主题提供者/消费者检查、硬依赖方向、变化影响分析、复杂父 Goal 覆盖检查和叶子可执行性检查。
- 现有 MCP、数据库、Web、Desktop 和 Runtime 集成行为。

### 替换

- 用短入口描述主循环和场景路由，条件细节按需读取 reference。
- 把规划方法召回和依赖判断整理成一条有停止条件的规划循环。
- 把项目关联、规划、执行/恢复分别放入单一事实源 reference；`protocol.md` 只保留跨流程 MCP 原子性和权限约束。
- 更新 Skill 发现描述、UI 简介和默认提示，使规划与推进成为主能力，Web 启动成为可选场景。
- 测试从逐句存在检查收敛为结构、路由、安全边界和规划不变量检查。

### 忽略 / 非目标

- 不新增数据库字段、规划 DSL、方法包类型或 MCP 工具。
- 不改变 Goal 状态机、Proposal Schema、权限模型和用户确认语义。
- 不拆成多个公开 Skill；仍保留一个 `goal-advance` 入口。
- 不重写内置规划包正文，不扩展新领域方法。
- 不在本任务中提交、推送或发布 Release。

## 用户与 Runtime 场景

1. 用户要求使用 Molis Work：Runtime 解析并在需要时确认项目关联。
2. 用户给出新想法：Runtime 建立 Draft，用一次一个关键问题澄清并保存答案。
3. 复杂 Goal 需要拆分或重连：Runtime 加载规划 reference 和方法库，循环召回相关主题，建立真实产出消费依赖，检查覆盖和叶子可执行性后提出完整 Proposal。
4. 用户确认：Runtime 应用决定并按派生工作状态继续。
5. 执行中出现新需求或失败：Runtime 读取执行 reference，复用已有 Goal 或只重规划受影响子图。
6. 用户只要求打开 Web、管理项目或回收 Goal：Runtime 只读取对应场景 reference，不加载规划与执行细节。

## 方案与文件边界

### `skills/goal-advance/SKILL.md`

保留：发现边界、不可违反的权限边界、端到端主循环、意图路由、对话输出原则、reference 路由和 MCP 能力地图。入口目标为约 100–160 行，不重复 reference 的参数、状态表和长示例。

### `skills/goal-advance/references/project-connection.md`

唯一维护项目解析、候选、绑定、切换、解绑、删除、Desktop Goal 上下文和 Goal 回收站流程。

### `skills/goal-advance/references/planning.md`

唯一维护 Draft 澄清、方法选择、跨主题召回循环、依赖判断、覆盖审计、叶子可执行性、Proposal/Decision 和变化影响分析。

规划循环必须明确：

1. 恢复用户原始结果，识别工作类型、专业主题、交付物、环境、不确定性和风险。
2. 读取项目必选方法以及所有具有未覆盖专业检查的方法。
3. 建立“主题 → 提供产出 → 消费主题 → 消费用途”地图。
4. 若消费者需要未覆盖的提供者产出，再扫描方法库并补充召回；重复直到没有缺失提供者或未覆盖检查。
5. 逐条判断所选方法的依赖规则；真实消费存在时建立 `consumer depends_on provider`，否则保持并行并说明缺少的消费关系。
6. 检查覆盖、循环、伪依赖、开放决策和叶子可执行性，再提出完整变更。

### `skills/goal-advance/references/execution.md`

唯一维护 Available 选择、工作状态、执行、Evidence、Review、完成、异常结果、新范围、纠正工作和恢复。

### `skills/goal-advance/references/protocol.md`

只维护所有场景共用的 MCP 不变量：固定当前项目连接、用户权限确认、原子选择、幂等、Proposal 非 canonical、失败停止和禁止 CLI/SQLite fallback。不得再次复制完整项目、规划或执行流程。

### `skills/goal-advance/references/service-start.md`

保持独立，仅在用户明确要求启动或打开 Web 时读取。

### `skills/goal-advance/agents/openai.yaml`

简介和默认提示表达：连接 Molis Work、澄清、组合规划方法、建立依赖、执行和纠偏。保留自动发现策略默认值，不新增无依据的 UI 字段。

### 测试

- 结构测试验证入口长度、所有 reference 可发现、规划主循环与安全边界只有清晰的单一入口。
- 规划引擎测试继续验证全部内置包含专业硬依赖和跨主题召回说明。
- 增加至少四类规划行为夹具/不变量：产品→技术、数据/评测→AI、研究→内容、一般相关但无产出消费时并行。
- 删除仅为了锁死完整句子的重复断言；保留权限、安全和不可逆操作所需的关键约束断言。

## 输入、输出与依赖

- 输入：用户当前对话、宿主提供的 Session/Goal 上下文、`molis_work_v1_*` MCP 返回、项目规划组合与方法正文。
- 输出：可读的 Goal 内容、持久化澄清记录、完整 Proposal、真实依赖、Evidence/Review/完成记录。
- 依赖：现有 MCP 工具 Schema、Goal Tree Proposal 校验器、方法包编译器和安装器。
- 边界：Skill 指导 Runtime 做专业判断；Molis Work 继续负责图不变量、权限、状态和原子写入，不解析自然语言正文来替 Runtime 决策。

## 验收标准

1. `SKILL.md` 不超过 180 行，并在前半部分清楚说明端到端主循环和规划循环入口。
2. 项目、规划、执行、服务四类条件流程都有可发现且互不重复的 reference 路由。
3. 规划 reference 明确递归主题召回、真实产出消费、依赖方向、停止条件和非依赖反例。
4. 现有权限、用户确认、MCP-only、Web 可选、同会话推进和派生工作状态语义全部保留。
5. Skill 的 description、short description 和 default prompt 不再以 Web 启动为主，且准确限定为用户调用 Molis Work 的场景。
6. 现有旧规划包兼容和全部 17 个内置包硬依赖测试继续通过。
7. Skill validator、TypeScript、定向测试、全量测试、构建和 `git diff --check` 通过。
8. 本地安装刷新后，Molis Work 服务健康；新 Runtime Session 可读取新 Skill 结构。

## 验证命令

```bash
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm typecheck
node --import tsx --test tests/mcp.test.ts tests/planning-engine.test.ts
pnpm test
pnpm build
git diff --check
```

## 假设与开放问题

- 保持一个公开 Skill 能避免不同 Runtime 在多个 Skill 之间形成分叉状态；本次通过 progressive disclosure 解决体积问题。
- 真实模型级独立前向评估需要可控的 Runtime harness；当前先使用规划不变量夹具和现有端到端集成测试，不为了评估引入新编排系统。
- 新安装的 Skill 只在 Runtime 新 Session 启动时被读取，当前已经运行的 Session 不会热更新。
