# Molis Work 独立仓库：旧逻辑兼容边界

## 1. 目标

把当前混合了 Clarification Agent V3 与 Molis Work V1 的包收敛为独立 Molis Work 产品。最终发布包只保留 SQLite 真相源、Coordinator、CLI、MCP、Web 和 Runtime Skill；旧 V3 只保留一次性 JSON 导入入口，不再保留可运行的旧 Runtime、领域 Profile 或旧渲染链路。

本文是后续 `LEGACY-RUNTIME-REMOVAL` Goal 的删除依据。本文只确定边界和证据，不在本 Goal 中删除产品代码。

## 2. 决策词

- **保留**：继续作为 Molis Work 正式产品能力维护。
- **替换**：用户能力仍存在，但实现或入口改为 V1-only 版本。
- **删除**：不进入独立仓库，也不作为隐藏兼容 Runtime 保留；历史由 Git 保存。

一条硬边界：兼容只意味着“读取一份 V3 JSON 并写入一张全新的 V1 SQLite Board”。它不意味着运行 V3、覆盖已有 Board、恢复旧完成状态，或继续暴露旧 CLI/MCP 工具。

## 3. 当前证据

- `package.json` 当前把整个 `dist`、`domains`、`skills` 和 `README.md` 打进包；`pnpm pack --dry-run --json` 因此包含 `dist/core/**`、`dist/renderers/**` 和 `domains/**`。
- `src/cli/main.ts` 同时路由 V1 和旧 `init/strategy/split/...` 命令，并直接依赖 `src/core/**` 与 `src/renderers/**`。
- `src/mcp/server.ts` 同时暴露 `molis_work_v1_*` 和旧 `molis_work_*` 管理工具；Runtime audience 已过滤旧工具，但旧实现仍被编译和发布。
- `src/index.ts` 仍公开导出旧 Core、Renderer 与 `core/types.ts`，所以旧逻辑也是 npm API 的一部分。
- `src/v1/migration.ts` 对旧代码唯一必要的编译期依赖是 `MolisWorkData` 类型；实际只读取其中一小部分字段。
- `yaml` 只被旧 `src/core/registry.ts` 使用；删除领域 Profile 运行时后不再需要。
- 当前 Git 根目录仍是 `trick-catalog`，远端是 `https://github.com/adeptify/trick-catalog.git`；独立仓库和远端发布属于后续 Goal，不在本 Goal 操作。

## 4. 文件与能力处置清单

### 4.1 正式保留

| 路径 / 能力 | 决策 | 独立仓库中的职责 |
|---|---|---|
| `src/v1/coordinator.ts` | 保留 | Goal Contract、Claim、Run、Evidence、Review、Candidate、Rewire 与门禁的唯一业务实现 |
| `src/v1/store.ts` | 保留 | 共享 SQLite 真相源与事件记录 |
| `src/v1/types.ts` | 保留 | V1 canonical 数据和接口类型 |
| `src/v1/demo.ts` | 保留 | 明确标记的示例 Board，仅用于演示和 UI 验证 |
| `src/v1/migration.ts` | 替换 | 只接收本文定义的最小 V3 导入输入，不依赖旧 Core |
| `src/v1/cli.ts` | 保留 | 用户/管理 CLI 实现，包括显式 `import-v3` |
| `src/web/server.ts`、`src/web/render.ts`、`src/web/icons.ts` | 保留 | 人查看和确认同一 SQLite Board 的 Web 产品面 |
| `skills/goal-advance/**` | 保留 | Runtime 先校验宿主连接、读 Contract、Claim，再按角色工作 |
| `PRODUCT.md`、`DESIGN.md`、`.impeccable/**` | 保留 | 当前 Molis Work 产品与 shipped UI 说明 |
| `specs/molis-work-mvp/**`、当前 V1 specs | 保留 | Contract、存储、协议和验收依据 |
| `tests/v1.test.ts`、`tests/web.test.ts` | 保留并整理 | V1 Coordinator、CLI/MCP、迁移和 Web 回归 |

### 4.2 必须替换的混合入口

| 当前路径 | 替换结果 | 不允许残留 |
|---|---|---|
| `src/cli/main.ts` | 变成 V1-only 可执行入口；继续支持 `molis-work v1 ...`，尤其 `molis-work v1 import-v3` | 旧 `init/load/strategy/coverage/split/assign/io/ask/answer/defer/out/promote/mark/audit/context/root/status/render/handoff/reflect/dry-run/explain/replay/profiles` 路由及旧持久化文件 |
| `src/mcp/server.ts` | 只编译和暴露 V1 tools；Runtime/management audience 边界保持 | 所有旧 `molis_work_*` tool 定义、旧 Pipeline 状态和旧 JSON Board 文件读写 |
| `src/index.ts` | 只导出 V1 Store、Coordinator、迁移输入/报告和 V1 types | `core/**`、`renderers/**` 与旧 `MolisWorkData` 公共导出 |
| `README.md` | 只讲 Molis Work 的产品模型、启动协议、CLI/MCP/Web、Runtime Skill 和一次性导入 | “仓库同时保留 V3”、旧安装/命令/结构/MCP tools 说明 |
| `tests/mcp.test.ts` | 保留 V1 MCP audience、连接、Contract URL、权限与协议测试；移除旧 full scenario | 任何对旧 `molis_work_init/strategy/...` 工具的成功路径断言 |
| `package.json` | 测试列表只含 V1/Web/MCP；files 不再包含 `domains`；移除 `yaml` | 编译后 `dist/core/**`、`dist/renderers/**` 和领域资料进入 tarball |

### 4.3 完整删除的旧实现

| 文件族 | 文件 | 原因 |
|---|---|---|
| V3 Core | `src/core/continuity.ts` | 只服务旧 JSON Board 连续性反思 |
| V3 Core | `src/core/detectors.ts` | 只服务旧领域检测 |
| V3 Core | `src/core/molis-work.ts` | 旧内存/JSON Board，不是 SQLite authority |
| V3 Core | `src/core/handoff.ts` | 旧 Markdown Handoff，不属于 V1 Claim/Run/Evidence 闭环 |
| V3 Core | `src/core/pipeline.ts` | 旧命令式澄清管线，会形成第二套 Goal 真相 |
| V3 Core | `src/core/registry.ts` | 旧 YAML 领域 Profile 注册表 |
| V3 Core | `src/core/trace.ts` | 旧 JSONL trace；V1 使用 SQLite 事件流 |
| V3 Core | `src/core/types.ts` | 旧 V3 总类型；导入所需子集改为 V1-local 类型 |
| V3 Renderer | `src/renderers/markdown.ts` | 渲染旧 JSON Board |
| V3 Renderer | `src/renderers/html.ts` | 静态旧看板，已被 V1 Web 取代 |
| V3 Renderer | `src/renderers/adapters/codex.ts` | 旧 Runtime Goal 文本，已被 MCP Contract + Runtime Skill 取代 |
| 领域 Profile | `domains/content-creation/fixtures.md`、`domains/content-creation/profile.yaml` | 旧领域检测/澄清管线资料 |
| 领域 Profile | `domains/data-analysis/fixtures.md`、`domains/data-analysis/profile.yaml` | 同上 |
| 领域 Profile | `domains/development/profile.yaml` | 同上 |
| 领域 Profile | `domains/general/profile.yaml` | 同上 |
| 领域 Profile | `domains/research/fixtures.md`、`domains/research/profile.yaml` | 同上 |
| 旧 Skill 残片 | `skills/clarify-requirement/references/user-controls.md` | 未被当前 `goal-advance` 套件安装或引用，属于旧产品残片 |
| 旧测试 | `tests/pipeline.test.ts` | 只验证 V3 Core/Renderer |
| 旧测试 | `tests/quality.test.ts` | 只验证 V3 Profile/Audit/CLI |
| 旧测试 | `tests/domains.test.ts` | 只验证领域 fixtures 和 detectors |
| 旧设计 | `docs/design-v3.md` | 描述已删除的运行时；历史由 Git 保存，当前文档不应形成双重产品定义 |

## 5. 唯一保留的 V3 输入边界

`src/v1/migration.ts` 应在 V1 目录内声明并导出一个独立类型（命名建议 `LegacyV3ImportInput`），不再 import `MolisWorkData`：

```ts
interface LegacyV3ImportInput {
  schema_version: "3.0";
  goal_id: string;
  meta: {
    title?: string;
    source: { seed: string };
  };
  root_goal: {
    constraints: string[];
  };
  goals: Array<{
    id: string;
    parent: string | null;
    one_liner: string;
    covers: string[];
    inputs: string[];
    outputs: string[];
  }>;
  coverage_ledger: Array<{
    id: string;
    requirement: string;
    status: "now" | "later" | "out";
    owner_goal: string | null;
    reason?: string | null;
    entry_condition?: string | null;
    revisit_at?: string | null;
  }>;
}
```

### 5.1 字段映射

| V3 输入 | V1 结果 | 说明 |
|---|---|---|
| `schema_version` | 导入门禁 | 只接受精确的 `3.0` |
| `goal_id` | `v3.imported` 事件 payload | 只保留来源身份，不成为新 Board ID |
| `meta.title` / `meta.source.seed` | Board title | title 缺失时用 seed |
| `root_goal.constraints` | 每个 Draft Goal 的 constraints | 仅保留客观约束文本，不推断已接受 |
| `goals[].id` | 新 V1 Goal ID 映射 | 带目标 Board 前缀，避免碰撞 |
| `goals[].parent` | `part_of` relation | 只保留父子结构，不转换成执行依赖 |
| `one_liner` | title / outcome | 作为待确认草稿，不代表 canonical 业务逻辑 |
| `covers` | in_scope | 保留原覆盖引用文本 |
| `inputs` / `outputs` | required_inputs / promised_outputs | 保留声明，不证明交付完成 |
| `coverage_ledger` 的 id/requirement/status/owner/reason/revisit 条件 | V1 coverage item | `now/later/out` 映射为 unresolved/deferred/out/covered；owner 使用新 ID 映射 |

### 5.2 明确不迁移的旧字段和类型

| 旧字段或类型 | 处理 |
|---|---|
| `ReqStatus` | 只在最小输入中保留三个字面值，不保留旧公共类型 |
| `TicketStatus`、`ClarifyTicket` | 删除；旧票据不能证明 V1 Contract 已澄清，列入 regenerate |
| `GoalStatus`、`goals[].status` | 删除；所有导入 Goal 固定为 `draft` + `unmet` |
| `goals[].level` | 删除；层级从 `parent` 关系计算 |
| `AuditStatus`、`AuditResult`、`audit` | 删除；旧审计不能通过 V1 Claim/Completion 门禁 |
| `CompensationGate`、`StrategyChoice`、`root_goal.strategy` | 删除；不把旧执行策略伪造成 active dependency/policy |
| `root_goal.summary`、`verification` | 不直接迁移；业务逻辑、验收方法和证据要求必须重新确认 |
| `TraceEntry`、`trace` | 删除；不能把旧 JSONL 记录注入 V1 canonical 事件流 |
| `DomainProfile`、`RepoScan`、`DomainDetector`、`domain` | 删除；V1 Contract 补全由 clarifier 读取项目事实并提交 Proposal |
| `meta.status/created_at/updated_at` | 删除；新 Board 使用导入时刻和 V1 生命周期 |
| 完成、Review、Evidence、Risk、Impact、Policy、Dependency | 不伪造；导入报告必须列入 regenerate 或明确缺失 |

## 6. 导入行为与测试边界

保留两个受信入口，它们调用同一个 `importV3Board`：

1. 用户/管理 CLI：`molis-work v1 import-v3 --db ... --board-id ... --actor ... --key ... --file ...`
2. management MCP：`molis_work_v1_import_v3`

Runtime MCP 不列出、也不能直接调用导入。导入只创建新 Board；目标 Board 已存在时必须拒绝，不允许覆盖或合并。

现有定向夹具位于 `tests/v1.test.ts` 的 `V3 import preserves safe structure and explicitly refuses to invent completion semantics`。它独立验证：

- 两个 Goal 被导入且全部保持 `draft / unmet`；
- 父子关系只成为 `part_of`；
- coverage 映射为 `covered / deferred`；
- 报告要求重建业务逻辑与 accepted/satisfied 状态；
- 第二次导入不会覆盖已有 Board。

定向运行命令：

```bash
pnpm exec tsx --test --test-name-pattern "V3 import preserves" tests/v1.test.ts
```

后续删除旧类型时，夹具应改为 `satisfies LegacyV3ImportInput`，并删掉对 `src/core/types.ts` 的 import。该定向测试和 V1 MCP/Web 测试通过后，才允许删除旧文件族。

## 7. 下一 Goal 的执行顺序

1. 先在 `src/v1/migration.ts` 建立 `LegacyV3ImportInput`，迁移测试改用该类型。
2. 把 MCP 拆成纯 V1 server，删除旧 tools、Pipeline 状态与旧 imports；保留现有 Runtime/management 权限测试。
3. 把 CLI 主入口改成 V1-only，保留显式 `v1 import-v3`。
4. 收窄 `src/index.ts` 公共导出。
5. 删除 `src/core/**`、`src/renderers/**`、`domains/**`、旧 tests、旧设计和旧 Skill 残片。
6. 收敛 README 与 package files/dependencies/scripts。
7. 执行 typecheck、V1/MCP/Web 定向测试、全量测试、build、pack dry-run；确认 tarball 中没有 `dist/core/**`、`dist/renderers/**` 或 `domains/**`。

这组顺序先切断消费方，再删实现，避免用临时兼容层掩盖第二套 Runtime。

## 8. 本 Goal 验收对照

- **C1：每个旧文件族都有决定。** 已覆盖 Core、Renderer、Domain、CLI、MCP、公共导出、README、package、Skill、tests 和旧设计；没有把混合 `tests/mcp.test.ts` 整文件误删。
- **C2：最小输入和夹具可运行。** 已列出 `LegacyV3ImportInput`、逐字段映射、明确 regenerate/drop 的旧类型、唯一 CLI/MCP 入口与可独立执行的定向测试命令。
- **非目标遵守。** 本文没有删除产品代码、创建远端仓库或改变 active dependency。
