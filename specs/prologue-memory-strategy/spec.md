# Prologue 记忆策略与 Molis Work 接入

状态：需求已整理（2026-10-21），六个方向已确认；spec 待评审后实施。负责人：待分配。本 spec 同时约束 Prologue SDK 与 Molis Work；Prologue 先落 P0 通用能力，Molis 先迁召回、再迁历史。

## 1. 背景与结论

Prologue 现在提供的是**记忆内核**：一条条可版本化的条目、作用域隔离、唯一写入口、墓碑、候选箱、预算和审计。它没有提供**记忆策略**，也没有提供 App 直接可用的**记忆应用面**。

认真做记忆的 App 一定会在这层内核上重写一套策略。Molis Work 已经是这样：

- [记忆服务](../../horizontal/memory/src/service.ts) 自己在 `list` 上做过滤、打分、预算和冲突处理，主路径没有使用 SDK 召回。
- [Agent Host 适配器](../../horizontal/agent-host/src/adapters/prologue-memory.ts) 负责 scope、hydrate、候选、pin 和字段翻译。
- `meta` 被当成业务事实的容器，`disabled/paused` 被编码进 `paused.reason`，证据引用被压成 JSON 字符串。
- 历史正文、最近变动、使用记录、冲突配对、整理标记放在 Host 旁表 `memory.db`。
- 导出使用自己的 `molis.memory` 包，因为 SDK 导出不带 `meta`。

问题不是 Molis 做错了，而是 SDK 的边界切错了：**通用机制没提供，App 只好自己补；补完之后，SDK 后续的策略升级就传不到 App。**

本 spec 的结论：

1. **内核不配，策略可选。** 单写口、模型不自批、默认不自动、召回是数据、删除是真删——这些不进入任何策略开关。
2. **拆三层：内核 / 策略 / 应用面。** 内核固定；策略用四个预设加可换执行逻辑；应用面让 App 不用重造候选、历史、回执、分页、批量。
3. **预设先给四个：** `off`、`manual`、`reviewed`、`assisted`。`assisted` 不是默认自动，必须由 App 显式选择，并带版本化策略和逐条可撤销。
4. **新增两个槽：** `memory-recaller`、`memory-extractor`。槽是活对象，预设是数据；两者分开。
5. **Molis 先换召回，再换历史。** 召回是主路径，收益最大、风险最小；历史迁移动静大，放第二步。

Prologue 侧只改 `memory/`、`runtime/`（槽表）、`kernel/`（错误码）、`composition/`、`agent/`、`context/` 和公开入口，不新增模块。Molis 侧只改 `horizontal/memory`、`horizontal/agent-host`、`packages/contracts`、`packages/storage`、Local Host 装配和设置页，不新建第二套记忆运行系统。

## 2. 目标与非目标

### 2.1 目标

- App 选一个预设，就能得到一条完整的记忆链路：形成、批准、召回、注入、回执、删除、导出。
- App 可以只替换一段执行逻辑（召回排序、提炼），不重写写入口、过滤、预算、回执和删除。
- Molis Work 的主路径改用 SDK 召回；`MemoryService` 只保留产品策略、写入门表和 UI 协作。
- 现有硬边界一条不少：默认关/手动、模型不自批、单写口、作用域隔离、召回是数据、删除真删、预算有界。
- 新增能力可观察、可撤销、可迁移；旧数据有一次性迁移路径。

### 2.2 非目标

- 不把 Molis 的开关、使用方权限、写入门表、UI、工作标题搬进 SDK。
- 不在 memory 内核里调用模型；提炼、摘要、冲突判断由 App 的 `memory-extractor` 提供。
- 不内置向量数据库、图数据库或嵌入模型；向量/图是可选召回器实现。
- 不新增第 30 个模块；所有改动落在现有 `memory/` 及其装配、上下文、Agent 接线。
- 不做默认自动记忆；`assisted` 必须显式选择。
- 不为旧实现保留第二套写入路径或第二套召回循环。
- 不把记忆变成 App 产品数据库；业务事实仍向所有者读取。

## 3. 已定决策

| 编号 | 决定 | 理由 |
| --- | --- | --- |
| D1 | SDK 只做通用策略；Molis 的开关、使用方、写入门表留在 App | 这些是产品规则，不是所有 App 的共同语义 |
| D2 | 批准新增 `memory-recaller`、`memory-extractor` 两个槽 | 召回排序和提炼是两段会换的执行逻辑，且都需要 App 提供模型/规则 |
| D3 | 接受 `assisted` 自动写入：App 显式选择 + 版本化策略 + 逐条可撤销 | 保留“模型不自批”的硬边界，同时不强迫每个 App 重造门闩 |
| D4 | 历史放 SDK，做有界历史 | 避免 App 旁表复制正文；删除可级联；版本可统一 |
| D5 | 扩展现有 `meta`，并增加 App 命名空间的 `data` | 向后兼容，避免为产品字段新开一层数据模型 |
| D6 | Molis 先迁召回，再迁历史 | 召回是主路径，收益最大；历史迁移涉及旁表正文，风险更高 |
| D7 | 提炼候选统一进持久候选箱；`memoryInbox` 冻结，不再新增能力 | 两套候选箱会分叉；持久候选箱已经是 Molis 在用的那一套 |

## 4. 分层与策略

### 4.1 三层

| 层 | 内容 | 谁改 |
| --- | --- | --- |
| 内核 | 条目、作用域、版本、墓碑、状态、唯一写入口、预算、审计、删除级联 | Prologue，App 不可配 |
| 策略 | 形成、批准、召回、维护；预设 + 单面覆写 + 两个槽 | App 选择/实现 |
| 应用面 | scope handle、候选箱、历史撤销、使用回执、冲突配对、分页、批量、导出导入、健康报告 | App 直接调用 |

### 4.2 四个预设

| 预设 | 形成 | 批准 | 召回 | 维护 | 适用 |
| --- | --- | --- | --- | --- | --- |
| `off` | 无 | — | 无 | — | 不需要长期记忆 |
| `manual` | 只有 App/用户显式写 | 调用方（可信） | 点名 + App 主动查询 | 手动 | 强可控、合规 |
| `reviewed` | 收工/会话末提候选 | 人 | 关键词/混合 | 去重建议、TTL | 个人助理、工作台 |
| `assisted` | 候选 + 策略门 | 版本化策略，人可撤销 | 画像优先 + 混合 | 巩固、衰减、冲突 | 高频、低风险偏好 |

预设只是四个策略面的固定组合，不是一个大 switch。App 可以在预设上覆写单个面；覆写不能越过硬边界。

预设与批准入口的对应：`manual` 走 `write`；`reviewed` 走 `candidates.accept`；`assisted` 走 `candidates.promote` + `memoryPromotion`；`off` 没有入口。不新增第三个批准入口。

`assisted` 必须有 `memoryPromotion`；没有就在 `createRuntime` 报 `MEMORY_STRATEGY_UNAVAILABLE`，**不静默降级为 `reviewed`**。`reviewed` 选 `run-summary` / `session-summary` 但没有 `memory-extractor`，同样在装配时失败。

`off` 不召回、不形成；App 仍可 `list/get/page/delete` 已有条目做管理，但 `write` 和候选被拒绝（`MEMORY_STRATEGY_OFF`），不静默接受。

### 4.3 四层分工

| 层 | 记忆里是什么 |
| --- | --- |
| 硬边界 | 单写口、模型不自批、默认不自动、召回是数据、删除真删、预算有界、密钥不入库 |
| 插件/可换 | `memory-recaller`、`memory-extractor`、晋升策略、存储后端 |
| App 可配 | 预设、作用域、预算、条数、TTL、权重、历史条数、写入门 |
| 用户可调 | 接受/拒绝/编辑/停用/删除/导出，全在 App 的 UI |

### 4.4 策略面

| 面 | 可选值 | 默认 |
| --- | --- | --- |
| 形成 | `none` / `run-end` / `session-end` / `periodic` / `manual` | `none` |
| 批准 | 可信 App 直写 / 人 / 版本化策略 | 人（有候选时） |
| 召回 | `pinned` / `search` / `profile-first` / `none` | `search`（档案允许时） |
| 维护 | `none` / `dedupe` / `supersede` / `decay` / `ttl` / `capacity` | `ttl` |

## 5. Prologue 合同

### 5.1 条目与事实模型

在现有 `MemoryEntry` 上增量增加，不重写旧字段：

```ts
interface MemoryEntry {
  // 现有字段保持不变
  ref; scope; owner; text; origin; tags; version; tombstoned;
  meta; paused?; createdAtMs; updatedAtMs;

  // 新增
  key?: string;                                  // App 定义的稳定键，≤ 200
  state?: "active" | "paused" | "disabled";      // 一等状态；优先于 paused
  stateReason?: string;                          // ≤ 200
  stateAtMs?: number;                            // 状态改变的时刻
  supersedes?: ExactRef<"memory">;               // 这条替代了哪条
  supersededBy?: ExactRef<"memory">;             // 被哪条替代（只读）
  validFromMs?: number;                          // P2 时间有效性预留，P0/P1 不读写
  validUntilMs?: number;                         // 同上
}
```

`meta` 增量：

```ts
interface MemoryMeta {
  // 现有：kind / source / basis / appliesWhen / evidence / expiresAtMs / approvedBy / namespace
  confidence?: number;   // 0..1
  importance?: number;   // 0..1
  data?: Record<string, unknown>; // App 命名空间，SDK 不解释；≤ 4096 字符
}
```

规则：

- `state` 是权威；`paused` 保留用于旧 SDK 回滚兼容。写 `state` 时同时写 `paused`（`paused.reason` 仍用现有格式），旧 SDK 仍能过滤。
- `state: "paused"` 表示依据失效、可恢复；`state: "disabled"` 表示人停用、可恢复；两者都不召回。
- 状态转换：

  | 当前 | 操作 | 结果 |
  | --- | --- | --- |
  | `active` | `pause(reason)` | `paused` + `stateReason` + `stateAtMs` |
  | `active` | `disable(reason)` | `disabled` + `stateReason` + `stateAtMs` |
  | `paused` / `disabled` | `resume()` | `active`，清 `stateReason`/`stateAtMs`/`paused` |
  | 任意 | `remove()` | `tombstoned`；召回、读取、分页都不返回 |
  | `tombstoned` | `purge()` | 物理清除，级联 SDK 历史/候选 |

- `key` 在 **active** 条目内唯一，唯一性是 `scope + owner + namespace + key`（没有 namespace 就是 `scope + owner + key`）；paused/disabled 不占 key，不同作用域可以有同名 key。`resume` 遇到同 key 已有 active 条目时拒绝 `MEMORY_KEY_EXISTS`。`key` 写入后不可改；换 key 等于新条目；`setMeta` 不能改 key。
- `key` 查找必须按 `scope + owner + namespace + key` 建索引，不靠全量扫描；`page` 的 `state/kind/source` 过滤也应有索引或等价下推。
- `meta.data` 不参与召回、不参与匹配；导出时按 `includeData` 决定是否带。
- 正文上限由 `config.memory.maxTextChars` 控制，默认 2000，范围 1–20000；超了拒绝，不截断。
- `meta` 的 4096 字符上限**不含** `meta.data`；`data` 单独 4096，且必须是普通对象；超了拒绝。`key` 200；`stateReason` 200。

### 5.2 写入管线

所有写入走同一个 `write`，包括 App 直写、候选接受/晋升、导入、提炼。管线：

```text
输入（text / key / scope / origin / meta / state?）
→ 规范化与长度上限
→ 写前检查（秘密：拒绝；像指令：候选或拒绝）
→ 去重与冲突（同 key / 相似文本 / supersedes）
→ 批准（可信 App / 人 / 版本化策略）
→ 落盘（先盘后表）
→ 事件 + 可撤销记录
```

写入模式：

| 模式 | 用法 | 语义 |
| --- | --- | --- |
| `append` | 无 `key` | 新增一条；允许同文并存（App 自己去重） |
| `replace` | 有 `key` | 同 key 旧条目标 `supersededBy`、`state: "disabled"`、`stateReason: "superseded"`、`paused.reason = "superseded:…"`；写新条目；旧条目保留历史 |
| `reject` | 有 `key` | 同 key 已有 active 条目则拒绝 `MEMORY_KEY_EXISTS`；用于幂等写入 |

补充规则：

- `idempotencyKey` 与 `key` 是两件事：前者防重试重复创建，后者防同一业务事实多条。
- `replace` 必须在同一 `scope + owner + namespace` 内；跨作用域或跨插件命名空间不能替换。
- `supersedes` 只能指向同 `scope + owner` 的活条目；被替代的旧条目不再召回，历史仍可查。
- 写前秘密检查是硬边界：扫正文、出处和 `meta.data` 的字符串值（最多 4 层），命中即拒绝，零写入；App 只能加模式，不能去掉内置模式。
- 像指令的文字：`write` 默认拒绝 `MEMORY_WRITE_REFUSED`，可信 App 显式 `allowInstruction: true` 才直写；要保留就显式 `candidates.propose`。候选记 `reviewReason`，`promote` 对带 `reviewReason` 的候选一律拒绝；人 `accept` 可以确认。
- 写入事件带 `memoryId`、`version`、`key`、`state`、`mode`，不带正文。
- 新增稳定错误码：`MEMORY_KEY_EXISTS`、`MEMORY_WRITE_REFUSED`、`MEMORY_STATE_INVALID`、`MEMORY_RECALL_FAILED`、`MEMORY_STRATEGY_OFF`、`MEMORY_STRATEGY_UNAVAILABLE`；进 kernel 错误码表与公开类型，不进 Provider 原始错误。

### 5.3 提炼策略

`memory-extractor` 是可选槽；不装时：

- `formation.mode: "none"`：零调用。
- `formation.mode: "final-answer"`：SDK 只用收工回答原文生成候选（现役行为），不调模型。
- 现有 `config.memory.extraction` 作为兼容别名：`true` = `final-answer`，`false` = `none`；新配置优先，P1 后只留新字段。

装了之后：

```ts
interface MemoryExtractor {
  extract(input: {
    run: {
      id: string;
      goal?: string;
      conclusion: string;          // 有界
      userMessages: readonly string[]; // 有界、只有本人原话
      toolSummary?: string;        // 有界摘要，不是原始输出
    };
    scopes: readonly { scope: MemoryScope; owner: string }[];
    kinds: readonly string[];
    maxCandidates: number;
  }): Promise<readonly MemoryCandidateDraft[]>;
}

interface MemoryCandidateDraft {
  text: string;
  key?: string;
  kind?: string;
  scope: MemoryScope;
  owner: string;                 // 必须来自 input.scopes 里的一个 owner
  tags?: readonly string[];
  origin: string;
  basis?: "explicit" | "repeated" | "inferred";
  appliesWhen?: MemoryMeta["appliesWhen"];
  evidence?: MemoryMeta["evidence"];
  expiresAtMs?: number;
  confidence?: number;
  importance?: number;
  data?: Record<string, unknown>;
  supersedes?: ExactRef<"memory">;
}
```

规则：

- extractor 只出候选，不写库；SDK 校验、去重、过写前检查、走候选箱。
- 候选的 `scope + owner` 必须是 `input.scopes` 里的一对；不是就整条拒绝，不猜归属。
- 候选数量不得超过 `maxCandidates`；超了整批拒绝，不截断。
- `basis` 省略按 `explicit`；`inferred` 必须带证据，没有证据整条拒绝；`confidence` / `importance` 省略按 0.5。
- `expiresAtMs` 已经过去就拒绝，不创建一条出生即过期的候选。
- 候选统一进 `memoryCandidates`（D7）；`memoryInbox` 不再新增能力。
- 带 `reviewReason` 的候选不进入 `memoryPromotion`，只留给人 `accept`；`promote` 看到就拒绝。
- 候选默认 14 天过期（`config.memory.candidateTtlDays`，1–90）；App 在维护任务里调 `expireDue`，SDK 不内置定时器。
- 提炼失败不影响这一跑的收场；失败进审计 `memory-extraction-failed`。
- SDK 不内置摘要模型；`run-summary` / `session-summary` 必须由 extractor 实现。
- `assisted` 的自动晋升仍然是 `memoryCandidates.promote` + 版本化策略；模型没有接受工具。

### 5.4 读取与召回

**读取**（hydrate/list/get）：

- 新增 `scope handle`：第一次用时按 scope 自动 hydrate 记忆和候选；App 不再自己维护 `hydrated` 集合。
- `hydrate(scopes)` 保留；按 scope 读，不一次读全部。
- 新增 `page(query)`：`{ scope, owner, query?, kinds?, states?, sources?, tags?, cursor?, limit? }`，返回 `{ entries, nextCursor, total? }`。
- 现有 `list(query)` 保留为不分页的兼容入口；设置页等大范围读取必须用 `page`。
- 读取不改写、不递增版本。

**召回**：

```ts
interface RecallQuery {
  scopes: readonly { scope: MemoryScope; owner: string }[];
  mode?: "pinned" | "search" | "profile-first" | "none";
  pinned?: readonly ExactRef<"memory">[];
  text?: string;
  keywords?: readonly string[];
  kinds?: readonly string[];
  situation?: {
    pluginId?: string;
    objectKind?: string;
    goalId?: string;
    task?: string;
  };
  limit?: number;        // 默认 8，最大 50
  budgetChars?: number;  // 默认 2000，最大 20000
  receiptId?: string;
  exclude?: readonly ExactRef<"memory">[]; // App 已判定不用的（例如冲突输家）
  fallback?: "keyword" | "none";          // 自定义 recaller 失败时；默认 none
}
```

管线：

```text
作用域与权限（App 传入的 scopes）
→ 硬过滤：state / 墓碑 / 到期 / appliesWhen / exclude
→ 候选生成：pinned / 关键词 / 向量 / 自定义 recaller
→ 排序：相关性 + 类别权重 + 来源权重 + 新旧 + importance
→ 冲突：同 key 只留最新；superseded 不召回
→ 预算：条数 + 字数 + 每作用域配额 + 去重
→ trace：带了谁、没带谁、为什么
```

规则：

- `pinned`：逐条重读；删了、暂停、停用、到期、被替代的进 `unavailable`，不注入旧副本。
- `search`：关键词是底线；中文按相邻两字切；有向量后端就用，没有就如实报 `method: "keyword"`。
- `profile-first`：先带 `config.memory.recall.alwaysKinds` 指定的类别（默认 `[]`），再按 `search` 补足预算。
- `situation` 只收窄：`appliesWhen` 不匹配的不召回；不能用它放宽作用域或权限。
- `receiptId` 由 App 生成；`memory-recalled` 事件原样带回。
- 事件带 `method`（`pinned | keyword | vector | hybrid | custom`）、`segmentation`（沿用 `given | cjk-bigram`）、`injected`、`omitted`（带 `limit/budget/conflict/expired/paused/disabled/not-applicable/duplicate` 原因）、`unavailable`（带 `deleted/paused/disabled/expired/superseded` 原因）；只带 id/version/score/reason，不带正文。

**`memory-recaller` 槽**：

```ts
interface RecallRanking {
  hits: readonly { entry: MemoryEntry; score: number; reason?: string }[];
  omitted?: readonly { id: string; reason: string }[];
}

interface MemoryRecaller {
  recall(input: {
    query: RecallQuery;
    candidates: readonly MemoryEntry[]; // 已经过硬过滤
  }): RecallRanking | Promise<RecallRanking>;
}
```

- 槽只负责排序和额外的过滤；SDK 仍会再过一遍预算、去重和 trace，槽不能绕过硬过滤。
- 槽返回的 `hits` / `omitted` 必须来自 `candidates`；出现外来条目整次失败 `MEMORY_RECALL_FAILED`，不注入。
- 槽抛错：本次召回按 `unavailable` 失败，不注入任何条目；不静默回落，除非 App 显式选择 `fallback: "keyword"`。
- 不装槽：用内置关键词/向量召回。

### 5.5 维护与遗忘

- `dedupe`：相似重复合并；只自动合并自动写入的条目；人的原话只提议，不自动合并。
- `supersede`：同 key 新值覆盖旧值；旧条目 `state: "disabled"` + `supersededBy`，不召回，历史可查。
- `decay`：长期不用的自动条目降权/停用（可恢复）；人工条目不动。
- `ttl`：到期自动停用，不物理删；`expiresAtMs` 到期后召回不中，条目仍在。
- `capacity`：每作用域条数上限；超了先停用最旧的自动条目，不静默删。
- `purge`：只有人明确删除才物理清除；SDK 侧级联候选、历史；App 侧的使用、配对、变更由 App 的删除收据一起清。
- 维护只“停用/合并/降权”，不替人做永久删除。

**历史**：

- `history(ref, { cursor?, limit? })` 返回有界版本列表：`version / text / origin / tags / meta / state / at / by / reason`。
- `restore(ref, version)` 追加一个新版本（内容取旧版），不删除后面的历史，不回退版本号；恢复后 `state` 置回 `active`，清 `stateReason`/`paused`；墓碑条目不能 restore；已被 `supersededBy` 标记的旧条目不能 restore 成 active（会把同 key 变回两条），要恢复内容就恢复到当前条目。
- `config.memory.history.maxRevisions`：`reviewed`/`assisted` 默认 3，`manual`/`off` 默认 0；范围 0–20。
- 历史存储独立于条目行；`purge` 必须删除该条全部历史。
- 历史只保留正文和必要事实；不保留密钥、绝对路径和原始工具输出。
- 历史按**内容版本**记录；`setMeta`、`pause/disable/resume` 不造新的内容版本，它们的变更由事件和 App 的变更记录承载。

### 5.6 应用面

| API | 行为 |
| --- | --- |
| `scope(scope, owner)` | 返回 handle；首次使用时自动 hydrate 记忆和候选 |
| `write(input)` | 唯一写入口；支持 `key` + `mode` |
| `page(query)` | 过滤、分页、计数 |
| `recall(query)` | 统一召回管线；返回 hits + trace |
| `history(ref)` / `restore(ref, version)` | 有界历史与恢复 |
| `pause` / `disable` / `resume` | 一等状态转换 |
| `delete(ref, { mode })` | `tombstone` 或 `purge`；默认 tombstone |
| `deleteMany(refs, { mode })` | 批量；返回逐条结果 |
| `previewScopes(scopes)` | 多作用域预览 + 联合指纹 |
| `clearScopes(scopes, fingerprint)` | 先核全部指纹，再逐作用域删；部分失败如实报 |
| `candidates.propose/list/accept/promote/discard/expire/purge` | 持久候选箱；新增 `key`、`expiresAtMs`、`expireDue`、`reviewReason`、分页；`accept/promote` 默认按 `replace` 使用候选的 `key`，冲突时保留历史 |
| `exportMemories` / `importMemories` | 包版本 2；带 `meta`/`key`/`state`；导入逐条走 `write` |
| `stats(scope, owner)` | 条数、候选数、过期数、重复建议数；最近使用由 App 提供 |

导出/导入：

- `MemoryPackage.version = 2`；`entries` 带 `key`、`meta`、`state`、`stateReason`、`stateAtMs`、`createdAtMs`、`updatedAtMs`。
- 正文和出处继续脱敏（密钥、绝对路径）；`meta.data` 递归脱敏（最多 4 层），超界拒绝导出。
- 版本不认识整份拒绝；v1 包可读，但回执明确 `metaMissing: true`。
- 导入仍逐条走 `write`；冲突按 `key` 优先、否则同 scope 同正文；不覆盖、不半导入、重放不重复。

### 5.7 装配与冻结

| 层 | 装什么 |
| --- | --- |
| Runtime | `memory.profile`、`memory.formation`、`memory.approval`、`memory.guard`、`config.memory.*`（含 `history.maxRevisions`）、`slots["memory-recaller"]`、`slots["memory-extractor"]`、`memoryPromotion` |
| Session / 场景包 | `memory: { profile?, scope, write }`；包只能收窄 App 的选择 |
| Run | `memory: { recall, pinned, scopes, budgetChars, receiptId }`；开跑冻结 |

- 预设与参数进 `createRuntime({ memory })`；阈值仍按模块分组进 `config.memory`。
- `approval.mode: "policy"` 复用现有 `memoryPromotion`（策略名 + 版本 + 判定）；不新增第三个批准入口。
- 场景包的 `memory.write` 从“只校验”变成“运行期执行”：

  | 包策略 | 该包会话允许什么 | 不允许什么 |
  | --- | --- | --- |
  | `deny` | 无 | 写、提候选、接受、晋升；App 在 Run 外管理记忆不受影响 |
  | `explicit-only` | 提候选、人接受 | 自动晋升 |
  | `policy-governed` | 提候选、人接受、策略晋升 | 绕过写入口或自批 |


- 角色档案的 `memoryPolicy` 仍是天花板：`recall: false` 不召回；`write: false` 不允许该角色的 Run 产生候选或晋升；只能收窄，不能放宽。
- 一次 Run 的召回口径、预算、receiptId 在开跑时冻结；跑到一半改配置不影响这一跑。
- 槽依赖 Host 能力：内置实现或声明了 `requires` 的槽在装配时检查，缺能力在 `createRuntime` 或建 Session 时失败，不等跑起来才炸。自定义槽由 App 自己保证；SDK 只检查它声明的 `requires`，不猜它内部调了什么。

### 5.8 硬边界

| 边界 | 本 spec 的处理 |
| --- | --- |
| 默认不自动 | 默认 `manual`；`assisted` 必须显式选择 |
| 模型不自批 | extractor 只出候选；晋升只经 App 策略；模型无接受工具 |
| 单写口 | 所有路径走 `write`；导入、候选、提炼都不另开写入口 |
| 作用域隔离 | 每条写入/召回/删除都带 scope + owner；跨作用域不能 supersede |
| 召回是数据 | `memory-recall` 来源仍是 `data`；不标必需；伪标记中和 |
| 删除真删 | `purge` 级联 SDK 的候选与历史；App 的使用、配对、变更随删除收据清；墓碑对读取就是不存在 |
| 预算有界 | 正文、meta、data、条数、字符预算都有上限 |
| 密钥不入库 | 写前检查拒绝；导出再脱敏；`data` 也脱敏 |

## 6. 新增槽

| 槽 | 实现什么 | 不实现什么 |
| --- | --- | --- |
| `memory-recaller` | 候选排序、额外过滤、打分理由 | 硬过滤、预算、trace、权限、写入 |
| `memory-extractor` | 从一次工作产出候选（含摘要、证据、key） | 写库、批准、召回、删除 |

- 两个槽都进 `SLOT_NAMES` 与 `SlotImplementations`；类型由槽名决定。
- 不装 `memory-recaller`：内置关键词/向量召回。
- 不装 `memory-extractor`：`formation.mode` 只能是 `none` 或 `final-answer`；选 `run-summary` / `session-summary` 时装配报 `unavailable`，调用次数为零。
- 槽只能收窄，不能绕过写入口、硬过滤、预算或信任等级。
- 槽的实现是活对象，只能装在 Runtime；场景包只声明预设和配置，不装 `impl`。

## 7. Molis Work 接入

### 7.1 现状与目标

| 现状 | 目标 |
| --- | --- |
| `MemoryService.recall` 全量 `list` + 自建排序 | 用 SDK `recall` + `memory-recaller`；Molis 只提供权重和冲突处理 |
| `paused.reason` 编码 `disabled:` / `paused:` | 用 SDK `state/stateReason`；旧数据一次性迁移 |
| `memory.db` 存历史正文 | 用 SDK `history/restore`；旁表只留变更、使用、配对、开关、信号 |
| `chosenMemory` 映射 run → receipt | `receiptId` 进 `startAgentRun` 和 `memory-recalled` |
| 设置页全量 `list` 再筛 | SDK `page` + filter + cursor |
| 删除直接 `purge` | SDK `delete({ mode })`；用户删除走 `purge`，归档走 `tombstone` |
| `MAX_TEXT = 400`、自己扫秘密/指令 | SDK `config.memory.maxTextChars = 400` + 写前检查；Molis 保留产品规则 |
| 候选 14 天 TTL 自己算 | SDK `candidates.expiresAtMs` + `expireDue` |
| 多作用域清空自己循环 | SDK `previewScopes/clearScopes` |
| 自己的 `molis.memory` 包 | SDK v2 包 + Molis 产品信封；逐步对齐 |

### 7.2 各模块改什么

**`horizontal/memory`（产品策略层，保留）**

- 保留：开关、使用方权限、写入门表、界面信号、冲突配对、整理、工作标题、UI 动作。
- 改召回：删掉 `located` 全量扫描和自建排序；构造 `RecallQuery` 调 `runtime.memory.recall`；把类别/来源/新旧/常驻权重做成 `memory-recaller`；把冲突输家通过 `exclude` 或 recaller 的 `omitted` 交出。
- 改状态：用 `pause/disable/resume`；不再拼 `paused.reason` 前缀；旧数据迁移时把 `disabled:` / `paused:` 转成 `state`。
- 改历史：`history/restore` 走 SDK；旁表只留 `MemoryChange`（谁、何时、为什么、能不能撤）和 `MemoryRevision` 的必要元数据，不再存正文。
- 改候选：`propose` 带 `expiresAtMs`、`key`、`meta`；用 SDK `expireDue` 代替自己扫 TTL。
- 改删除：用户删除走 `delete({ mode: "purge" })`；项目删除用 `previewScopes/clearScopes`。
- 改导出：优先用 SDK v2；`molis.memory` 只作为产品信封，不再自己写正文。

**`horizontal/agent-host`（适配层）**

- `prologue-memory` 映射新增字段：`key/state/stateReason/stateAtMs/supersedes/supersededBy/confidence/importance/data`。
- `forRun` 返回 `receiptId`；`startAgentRun` 的 memory 入参带 `receiptId`。
- `prologue-stream` 投影 `memory-recalled` 的新字段（`receiptId`、`method`、`omitted` 原因）。
- `memoryForAgentRun` 不再自己组 pinned；直接用 SDK 召回结果或 `forRun` 返回的 pinned。
- 删除 `chosenMemory` 旁路映射；`settleUses` 用事件里的 `receiptId`。

**`packages/contracts`**

- `AgentMemoryMeta` 增加 `confidence/importance/data`。
- `AgentMemoryEntry` 增加 `key/state/state_reason/state_at_ms/supersedes/superseded_by`。
- `AgentMemoryRecallFact` 增加 `receipt_id`、`method`、`omitted` 原因。
- `MemoryRecallResponse` / `MemoryUseRecord` 对齐 SDK trace。
- 跑 `pnpm api:update`、`pnpm actions:update`（动作形状变了时）和 `pnpm test:contracts`。

**`packages/storage`**

- 旁表保留：`changes`、`uses`、`pairs`、`prefs`、`signals`、`markers`、`owners`、`candidate notes`。
- 历史正文迁到 SDK 后，`revisions` 只留迁移期只读数据；验证后退掉写路径。
- 删除级联仍由 Host 的事务负责：记忆删除 → 候选、历史、使用、配对、变更一起清。

**Local Host 装配**

- 注册 `memory-recaller` / `memory-extractor` 的具体实现（Molis 的排序器和提炼函数）。
- 启动时按用到的 scope 懒 hydrate；不再全量 hydrate。
- 项目删除：用 `previewScopes` 一次核对项目 + 角色作用域，再 `clearScopes`；失败如实报，重试由删除收据驱动。
- 角色 owner 继续用 `pc-` + 摘要；SDK 只把它当普通 owner。

**文档**

- 更新 [`docs/horizontal/memory.md`](../../docs/horizontal/memory.md)：数据主人、召回/历史/回执的新边界，指向本 spec。
- 更新 [`docs/system/CALL-CHAINS.md`](../../docs/system/CALL-CHAINS.md) §8：召回、候选、历史、收据的调用链。
- 若写入门或召回信任边界变化，同步 [`docs/system/SECURITY-INVARIANTS.md`](../../docs/system/SECURITY-INVARIANTS.md) 与 `pnpm test:security`。

**设置页**

- 使用 `page` 分页和过滤；不再一次拉全量。
- 显示 `state/stateReason`、`key`、`confidence/importance`（可选）、历史版本、删除模式。
- “最近用于”用 `receiptId` 关联；预算/上限裁掉的条目显示原因。
- 冲突配对来自 SDK 或旁表；两边只留一个真相，不能双写。

### 7.3 留在 Molis 的部分

- 开关与使用方权限（助理/Agent/界面/插件/MCP）。Molis 的“自动记住”是上位条件：关着时，即使 SDK 的 profile 是 `assisted`，也不得晋升；SDK 不替 Molis 判断这个开关。
- 写入门的产品规则：哪些类别自动、哪些只进候选、秘密/指令的产品文案。
- 界面信号计数与候选门槛。
- 工作标题、项目标题、使用方标签。
- 冲突/重复的产品处置（保留哪条、合并、升级为项目说明）。
- 设置页、工作面板、撤销 UI。
- 旁表的变更/使用/配对/开关事实。
- 调用 SDK 前按 consumer 过滤 scopes；SDK 不解释 consumer。
- 插件命名空间可见性由 Molis 在 scopes / recaller 里处理；SDK 只存 `meta.namespace`。
- 所有读 `paused.reason` 的地方（`fromEntryMeta`、`stateOf`、`upkeep`、`pairs`、设置页）改成 `state/stateReason`；`upkeep` 的停用/恢复/合并同步改。

### 7.4 迁移顺序

1. **Prologue P0**：state、key、guard、recall 管线 + `memory-recaller`、trace、receiptId、page、delete、clearScopes、export v2、修小缝。
2. **Molis P0**：换 vendored SDK（按 `vendor/prologue-sdk/README` 重建，更新 `.sha256` / `.provenance.json`，不并行留两版）→ 适配新字段 → 召回切到 SDK + ranker → 状态迁移 → receipt 切到事件 → 设置页分页。
3. **Prologue P1**：四个预设、`memory-extractor`、持久候选 TTL、有界历史。
4. **Molis P1**：`reviewed`/`assisted` 预设接入；历史从旁表迁到 SDK；候选 TTL 交给 SDK。
5. **Prologue P2**：冲突/合并/衰减/容量、episode/profile、混合召回。
6. **Molis P2**：维护任务改用 SDK 原语；导出格式对齐；健康报告。

### 7.5 回滚与兼容

- P0/P1 期间 Prologue 同时写 `state` 和 `paused`；旧 SDK 只认 `paused`，回滚不会把停用条目放出来。
- `supersede` 把旧条目标成 `state: "disabled"` + `paused.reason = "superseded:…"`；旧 SDK 也不会召回旧条目。
- `key` / `meta.data` / `history` 旧 SDK 会忽略；回滚后不会产生错误召回，只是丢掉新语义。禁止在回滚后继续写新字段。
- `purge` 不可回滚；用户删除前仍走预览确认。
- Molis 旧包回退只回退代码，不回退已迁数据；迁移脚本必须可重复执行、先读后写、失败不动原表。

## 8. 分期与验收边界

| 期 | Prologue | Molis |
| --- | --- | --- |
| P0 | 内核可用性 + 召回管线 + `memory-recaller` | 召回/状态/receipt/page/delete 迁移 |
| P1 | 预设 + `memory-extractor` + 历史 | 预设接入 + 历史迁移 |
| P2 | 维护/冲突/情景/画像 | 维护与导出对齐 |

P0 不包含：自动晋升默认打开、`run-summary` 默认开启、向量/图默认开启、历史默认 3 条（预设里才开）。

## 9. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| MEM-01 | `write` 命中秘密形状时拒绝，库、候选、历史零写入；内置模式不能被 App 去掉 | Prologue 单测 + 真实 Node Host |
| MEM-02 | 像指令的文本 `write` 默认拒绝；显式 propose 进候选并记 `reviewReason`；`promote` 拒绝、人 `accept` 可确认；可信 App 显式 `allowInstruction` 才直写 | Prologue 单测 |
| MEM-03 | 同 scope/owner 的 `key` 用 `replace` 后，旧条目不召回、`supersededBy` 正确、历史可查；`reject` 冲突拒绝；候选 `accept/promote` 带 key 时同样保留历史 | Prologue 单测 + live |
| MEM-04 | `pause/disable/resume` 后召回与读取符合状态；`resume` 遇到同 key 已有 active 条目拒绝；旧 `paused.reason` 数据迁移后状态正确 | Prologue 单测 + Molis 迁移测试 |
| MEM-05 | 召回过滤墓碑、停用、暂停、到期、`appliesWhen`、`exclude`；trace 给出每条原因 | Prologue 单测 |
| MEM-06 | 自定义 `memory-recaller` 只改排序；硬过滤、预算、trace 仍生效；槽抛错时零注入并如实报失败 | Prologue 单测 |
| MEM-07 | `memory-recalled` 带 `receiptId/method/injected/omitted/unavailable`，不含正文 | Prologue 单测 + Molis 投影测试 |
| MEM-08 | `page` 支持过滤、游标、总数；设置页不再全量 `list` | Prologue 单测 + Molis 设置页测试 |
| MEM-09 | `delete({ mode })` 与 `clearScopes` 先核全部指纹；部分失败如实返回已完成/剩余，不假装整批成功 | Prologue live + Molis 删除收据测试 |
| MEM-10 | 历史有界；`restore` 追加新版本；`purge` 级联 SDK 的历史与候选；App 的使用记录由删除收据清 | Prologue 单测 + live + Molis 删除测试 |
| MEM-11 | 导出 v2 带 `key/meta/state`；导入两次不重复；v1 包明确 `metaMissing`；正文/出处/data 脱敏 | Prologue 单测 + live |
| MEM-12 | 四个预设行为符合 §4.2；`assisted` 未显式选择时不生效，缺 `memoryPromotion` 时 `createRuntime` 失败而不是降级；晋升写策略+版本；模型无接受工具；每条可撤销 | Prologue 单测 + 工作台实操 |
| MEM-13 | 场景包 `deny/explicit-only/policy-governed` 在运行期生效；包不能放宽 App 的选择；角色 `write:false` 不产生候选/晋升 | Prologue 单测 |
| MEM-14 | Molis 主路径改用 SDK 召回 + ranker，自建全量扫描删除；相同输入下注入集合与原因可解释 | Molis `memory-service` 测试 + 真实运行 |
| MEM-15 | Molis 状态改用 SDK `state`；旧 `paused.reason` 迁移；停用/暂停/恢复在设置页正确 | Molis 迁移测试 + 设置页测试 |
| MEM-16 | Molis `settleUses` 用事件 `receiptId`；重启后“最近用于”仍正确 | Molis live + 重启测试 |
| MEM-17 | Molis 大作用域设置页用分页；不一次拉全量；搜索/过滤可用 | Molis 设置页测试 |
| MEM-18 | Molis 删除一条/清空项目后，记忆、候选、历史、使用记录、配对、导出包都不再带出 | Molis live + 重启测试 |
| MEM-19 | Molis 历史正文迁到 SDK 后，旁表不再写正文；旧版本可查看/恢复；删除级联 | Molis 迁移测试 + live |
| MEM-20 | 现有硬边界不回归：默认不自动、模型不自批、单写口、作用域隔离、召回是数据、删除真删、预算有界 | Prologue 回归 + Molis 回归 + 人工 |
| MEM-21 | 提炼候选统一进持久候选箱；`memoryInbox` 不再新增调用；候选 TTL 由 SDK 执行 | Prologue 单测 + Molis 测试 |
| MEM-22 | Prologue 需求分册、模块 README、AGENTS 槽表、公开导出与类型检查同步；两个新槽在 `SLOT_NAMES` 与 `SlotImplementations` 里可见 | 人工 + `pnpm typecheck` / `pnpm build` |
| MEM-23 | Molis `docs/horizontal/memory.md`、`CALL-CHAINS` §8、动作合同快照、`SECURITY-INVARIANTS`（如涉及）与 `molis.memory` 导出说明同步 | 人工 + `pnpm api:update` + `pnpm actions:update` + `pnpm test:contracts` |
| MEM-24 | `off` 预设拒绝 `write` 与候选 propose/accept/promote，但仍可 list/get/page/delete；策略关闭不静默接受 | Prologue 单测 |

## 10. 风险与待定

| 风险 | 处理 |
| --- | --- |
| 记忆变成大框架 | 只做通用机制与四个预设；产品规则留在 App；每个新增能力必须有真实消费者 |
| 自动写入被误用 | `assisted` 显式选择；只允许低风险类别；逐条可撤销；模型无接受工具 |
| 回滚把停用条目放出来 | 同时写 `state` + `paused`；supersede 也写 `paused`；旧 SDK 仍能过滤 |
| 历史复制正文、删除不干净 | 历史独立存储；`purge` 级联；导出默认不带历史 |
| 提炼模型幻觉 | 候选必须带证据；无证据的 `inferred` 拒绝；人/策略批准 |
| 大作用域性能 | `page` + 索引；召回先硬过滤再排序；不一次读全部 |
| 元数据膨胀 | `meta` 4 KB、`data` 4 KB、正文 2000；超了拒绝，不截断 |
| `memoryInbox` 冻结造成兼容问题 | P1 前保留只读兼容；新提炼只走 `memoryCandidates`；删除另开决定 |

**待定（实施前确认）：**

1. `assisted` 的默认允许类别是否只限 `preference` 与 `convention`，`fact` 一律进候选。
2. Molis 旁表 `revisions` 在迁移验证后保留只读一个版本，还是同一 PR 删除。
3. SDK `MemoryPackage` v2 是否直接作为 Molis 导出包，还是继续包一层 `molis.memory` 信封。

## 11. 参考

- Molis 记忆产品文档：[`docs/horizontal/memory.md`](../../docs/horizontal/memory.md)
- Molis 记忆系统历史需求：[`specs/archive/memory-system/spec.md`](../archive/memory-system/spec.md)
- Molis Prologue 采用需求：[`specs/prologue-adoption/spec.md`](../prologue-adoption/spec.md)
- 合同变更流程：[`docs/system/CONTRACT-CHANGES.md`](../../docs/system/CONTRACT-CHANGES.md)
- Prologue 记忆模块：`packages/sdk/src/memory/`（core / api / README）
- Prologue 记忆需求：`docs/product/requirements/modules/memory/`
- [Claude Code memory](https://code.claude.com/docs/en/memory)
- [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank)
- [Anthropic memory tool](https://platform.claude.com/docs/zh-CN/agents-and-tools/tool-use/memory-tool)
- [LangMem](https://www.langchain.com/blog/langmem-sdk-launch)
- [Mem0: How it works](https://mem0.mintlify.app/core-concepts/how-it-works)
- [Zep concepts](https://help.getzep.com/v2/concepts)
- [Letta memory](https://docs.letta.com/configuration/memory/index.md) · [Sleep-time compute](https://www.letta.com/blog/sleep-time-compute)
- [MemoryOS](https://aclanthology.org/2025.emnlp-main.1318/)
- [A-MEM](https://neurips.cc/virtual/2025/loc/san-diego/poster/119020)
- [Memobase](https://docs.memobase.io/practices/tips)
- [Cognee](https://pypi.org/project/cognee/0.1.37/)
