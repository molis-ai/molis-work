# Planning Method Markdown Catalog

## 背景与目标

Molis Work 当前把所有内置规划方法直接写在 `src/planning/method-packs.ts` 中。继续扩充工作类型、专业领域、行业和场景约束时，这个文件会持续膨胀；方法内容、Runtime 代码和 UI 分类也会互相牵连，新增一个行业需要修改代码。

本任务把内置方法迁移为可校验的 Markdown 目录，并扩展为五层组合：工作类型、专业领域、行业、场景叠加层和项目自定义。每个方法只占一个 Markdown 文件，尤其保证每个行业一个文件，不建立汇总所有行业正文的巨型文件。

本次完成等级：**内部完整**。仓库源码、构建产物、本地安装包、Runtime、MCP 和 Web 方法库都应能使用新目录。

## 当前行为与问题证据

- `src/planning/method-packs.ts` 同时承载类型、编译逻辑、组合逻辑和 17 个内置方法正文，新增方法会扩大核心代码文件。
- `PlanningMethodKind`、MCP schema 和 Web 筛选只识别 `meta`、`work_type`、`domain`、`custom`，不能表达行业方法和跨行业风险叠加层。
- 内置方法随 TypeScript 编译，不支持通过新增一个内容文件完成扩充。
- `skills/goal-advance` 已随 npm、本地 Runtime 和 macOS 发行物一起打包，适合作为方法内容的唯一发布目录。

## 用户与调用场景

1. Runtime 根据 Goal 的工作类型、专业领域、所在行业和特殊约束选择多套正交方法，共同规划同一棵 Goal Tree。
2. 用户在 Web 方法库按工作类型、专业领域、行业和场景叠加层筛选并查看方法。
3. 维护者新增行业时，只增加 `industries/<method-id>.md`，无需修改 TypeScript 注册表。
4. 个人和项目方法继续保存在 SQLite 中，并可用相同 `method_id` 覆盖内置方法。
5. 旧项目和旧数据库中的方法仍能被补齐 Runtime instructions，不因目录迁移失效。

## 范围

### 1. 目录与文件边界

内置方法的唯一正文位于：

```text
skills/goal-advance/methods/
├── meta/
├── work-types/
├── domains/
├── industries/
└── overlays/
```

- 每个方法一个 `.md` 文件，文件名与 `method_id` 一致。
- 每个行业只对应一个 canonical Markdown 文件；不复制翻译版正文，不建立行业总正文。
- `SKILL.md` 只负责在需要规划时引导 Runtime 使用 Molis Work 返回的有效方法，不加载整套目录。
- 个人和项目自定义方法仍使用现有 SQLite JSON 结构，不迁移为本地文件。

### 2. Markdown 契约

每个文件使用受限 frontmatter 和固定章节：

- frontmatter：`method_id`、`version`、`kind`、`name`、`summary`、`applies_to`、`domain_tags`、`source_refs`、`confidence`。
- 正文：`规划路径`、`必须覆盖`、`依赖规则`、`完成证据`、`收口检查`、`常见误拆`。
- `必须覆盖` 是 `area | label | question` 三列表格。
- `依赖规则` 是 `rule_id | statement | direction_hint` 三列表格。
- 其他章节分别使用有序或无序列表。

加载器必须拒绝缺失字段、未知章节结构、非法 kind、文件名与 `method_id` 不一致、重复 `method_id`、空步骤或无效表格。错误信息应包含文件路径和具体原因。

### 3. Runtime 领域模型

`PlanningMethodKind` 扩展为：

```text
meta | work_type | domain | industry | overlay | custom
```

组合顺序用于稳定呈现，不代表串行执行：`work_type → domain → industry → overlay → custom → meta`。

Markdown 只写该方法独有的专业判断。通用的产出消费依赖、层级不等于依赖、证据后收口等规则由加载器统一追加，再由现有 instructions 编译器生成完整 Runtime 正文，避免每个文件重复通用段落。

### 4. 迁移与首批扩充

- 迁移现有 17 个内置方法，保持 method ID 和当前行为兼容。
- 新增 6 个专业领域方法：增长与分发、品牌与传播、定价与商业化、安全与隐私、可靠性与发布、客户成功与服务。
- 新增 8 个行业方法：教育、医疗健康、银行与支付、投资与财富管理、电商、企业 SaaS、开发者工具、游戏。
- 新增 6 个场景叠加层：敏感数据与隐私、未成年人、双边市场、支付与资产、UGC 与信任安全、AI 人工复核。

首批目录用于验证分类和组合机制，不声称覆盖所有行业。后续扩充应以单文件增量完成。

### 5. Web 与 MCP

- MCP `planning_method_pack.kind` schema 接受 `industry` 和 `overlay`。
- Web 方法库、项目方法选择页和编辑表单显示“行业方法”和“场景叠加层”。
- 中英文 UI 标签完整；方法正文保持 canonical 中文，不维护派生翻译副本。
- 筛选逻辑沿用 `data-kind`，新增两个明确筛选项。

## 非目标

- 本轮不把 Markdown 编辑能力做进 Web；内置文件由仓库维护，个人/项目方法仍通过现有表单维护。
- 本轮不新增 `ssot_review` 或把正交性升级为数据库中的结构化实体。
- 本轮不自动推断行业或叠加层，不引入向量检索、外部知识库或复杂注册服务。
- 本轮不一次性覆盖所有行业，也不为每个行业复制完整通用方法论。
- 本轮不改变 Goal、depends_on 或执行状态协议。

## 输入、输出与依赖

- 输入：仓库或安装发行物中的 `skills/goal-advance/methods/**/*.md`。
- 输出：`BUILTIN_PLANNING_METHOD_PACKS`，保持现有调用方接口不变。
- 内容目录跟随现有 `skills` 打包和安装链路，不引入新的运行时依赖。
- 加载路径必须同时适用于 `src/planning` 的开发运行和 `dist/planning` 的构建运行。
- 加载顺序必须确定性稳定，不能依赖文件系统返回顺序。

## 验收标准

1. `src/planning/method-packs.ts` 不再包含内置方法正文；内置方法全部来自 Markdown 目录。
2. 目录中每个方法恰好一个文件，所有文件通过统一解析和校验；重复 ID、错误文件名和错误表格有定向失败测试。
3. 原 17 个 method ID 仍存在；新增 6 个 domain、8 个 industry、6 个 overlay 方法，且总数与分类数可测试。
4. `domain-software-development` 之前新增的项目 SSOT、纵向/横向模块与并发规则迁移后仍完整存在。
5. Runtime composition 能组合 work type、domain、industry 和 overlay，并按稳定顺序返回独立 method paths。
6. 个人/项目覆盖和 legacy instructions hydration 继续通过原有测试。
7. MCP schema 接受新 kind；Web 页面能显示并筛选行业和场景叠加层，编辑表单能保存这两类方法。
8. npm/package 和 macOS 现有 `skills` 打包路径包含方法目录；构建后的 `dist` 运行时能找到该目录。
9. `skill-creator` 快速校验通过，`pnpm typecheck`、`pnpm build` 和全量测试通过。

## 验证命令

```bash
pnpm typecheck
pnpm build
node --import tsx --test tests/planning-engine.test.ts tests/mcp.test.ts tests/web.test.ts tests/e2e.test.ts
pnpm test
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
```

## 风险与处理

- **开发态和构建态路径不同**：从当前模块位置向上解析包根目录，并以存在性测试覆盖 `src` 与 `dist` 两种入口。
- **Markdown 过度自由导致解析漂移**：只支持明确的 frontmatter、固定章节和简单表格，不实现通用 Markdown AST。
- **迁移内容丢失**：对旧 method ID、关键技术 SSOT 规则和分类数量做回归断言。
- **启动时读取失败**：失败应显式中止并指出具体文件，不静默回退为空方法库。
- **方法文件再次膨胀**：通用依赖和完整 Runtime 模板继续由代码统一编译，单个方法只保留领域差异。

## 开放问题

无阻塞开放问题。首批行业以本 spec 列表为准；其余行业作为后续单文件扩充。

## 执行结果（2026-08-28）

- 验收 1–8：通过。17 个既有方法已迁移，新增 6 个 domain、8 个 industry、6 个 overlay，共 37 个内置方法；`dist` 直接加载和安装发行物端到端验证均通过。
- 验收 9：通过等价本地验证。pnpm wrapper 因沙箱内无法访问配置的全局 store，尝试联网刷新 registry 后中止；未改动依赖，改用仓库现有二进制执行相同的类型、构建和测试步骤。
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`：通过。
- 完整构建步骤（clean、tsc、esbuild、fingerprint）：通过；`dist/planning/method-packs.js` 加载 `37 industry` 验证通过。
- 完整测试清单：213/213 通过；Web 与 e2e 在允许本机回环监听后通过。
- 最终定向回归：39/39 通过。
- `skill-creator/scripts/quick_validate.py skills/goal-advance`：通过。
- `git diff --check`：通过。
