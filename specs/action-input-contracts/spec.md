# 动作的版本字段与输入类型（路线书 05 第 4 项）

状态：设计稿（2026-11-06），没有实现。N14 的「重新载入」界面由设计台定样；N22 的范围由用户定（§9）。排进[第 05 批第 4 项](../post-anticorruption-roadmap/reference/batches/05.md#batch-05-item-4)，来源是[对抗式审查台账](../../docs/reviews/adversarial-review-2026-11-01.md) N14、N22。依据是 main `242d75d03`，#1790 头 `3585974c5` 只读对照。

验收编号前缀 `AIC`，见 §12。

## 0. 给人讲清楚

这份设计管两件小而散的事，都关于「动作收到的输入」。

- **N14。** 判断规则的编辑动作用一个特别的字段（`updated_at`）表示「我读到的版本」，内核为此写了一条按名字认它的分支；而且不带版本也能过，等于「两个人同时改，后保存的悄悄盖掉先保存的」。改完以后，它和别的动作一样必须带上读到的版本；过期了不覆盖，页面能重新载入。
- **N22。** 平台在调用处理器之前已经按声明检查过输入，处理器却拿不到类型，只好再检查一遍，于是同样的读值小函数写了几十份。做一份类型推导，让处理器直接拿到有类型的输入，删掉重复的检查。

用户能看到的只有第一件：编辑判断规则时，过期的保存不再悄悄盖掉别人的改动。第二件纯属内部整理。

## 第一部分：N14 版本字段

## 1. 现状

| 位置 | 现在 | 问题 |
| --- | --- | --- |
| `packages/kernel/src/version-precondition.ts:15` | `fields()` 认四个版本字段，另加「能力名以 `functions.authoring.` 开头且有 `updated_at`」 | 内核按提供方名字开分支，违反「不另写名单或宿主分支」 |
| `version-precondition.ts:38` | `field === "updated_at" && value === null` 时拒绝 | 只为这个分支存在的特例 |
| `modules/judgment-rules/src/authoring-actions.ts:31` | `revision = { id, updated_at: { type: ["string","null"], minLength: 1 } }`，`required` 只有 `id` | 6 个动作都能不带版本 |
| `authoring-actions.ts:90` | 发布：`args.updated_at ?? record.updated_at` | 没带就拿刚读到的比，形同虚设 |
| `service.ts:158` | 预览：`expectedUpdatedAt ?? current.updated_at` | 同上。另外**预览在调模型之前不比版本**，过期的预览要花完模型钱才被拒 |
| `store.ts:150,163,177,186,211,227` | 6 处 `expectedUpdatedAt ?? current.updated_at` | 同上，台账没列全 |

`configure` 用的 `expected_revision` 是另一个合同（没有就新建），不动。`functions.version_conflict`（已发布绑定，`service.ts:166`）也不动。

## 2. 合同决定

### 2.1 取值

`expected_updated_at` 是「读到的那条记录的 `updated_at`」，**必填的非空字符串**，6 个动作都一样（update、preview、publish、delete、sample.add、sample.remove）：

```ts
const revision = { id, expected_updated_at: { type: "string", minLength: 1 } };
// input(revision, ["id", "expected_updated_at"])
```

**「草稿从未保存」在这一层不存在。** 没有 create 就没有 id；create 返回的记录 `updated_at` 必非空（`store-schema.ts:25` 是 `TEXT NOT NULL`）。页面上还没创建的新草稿走 `create`，不走这 6 个动作。所以不留 `null`：

| 输入 | Agent、MCP | 页面、插件 |
| --- | --- | --- |
| 缺 `expected_updated_at` | `actions.version_required`（现有判断 `missingVersionErrors`） | `actions.input_invalid` |
| 传 `null` 或空串 | `actions.input_invalid` | `actions.input_invalid` |
| 传旧值 | `functions.draft_stale` | 同左 |

全部失败关闭，都不改记录。

### 2.2 字段不留第二个名

HTTP 体同样改名 `expected_updated_at`，`route-handlers.ts:19-20` 的解构跟着改，`revision` 继续透传 body。动作输入 `additionalProperties: false`，旧客户端发 `updated_at` 进 `patch` 或顶层都被拒，也是失败关闭。这是 N35 的「原版本上改」，版本号不动。

### 2.3 内核

删掉 `fields()` 的第二行和 `check()` 里的 `updated_at` 特例。`Pick<ActionDefinition, "capability_id" | …>` 不再需要 `capability_id`，一起收窄，调用方 `action-service.ts`、`assistant-authority.ts` 跟着改。内核从此不认任何能力名。

### 2.4 service 与 store

`updateDraft`、`addSample`、`removeSample`、`deleteDraft`、`preview`、`publish`、`savePreview` 的 `expectedUpdatedAt` 改必填，删掉全部 `??`（`service.ts:158`、`store.ts` 6 处、`authoring-actions.ts:90` 和各处理器的 `?? undefined`）。类型一改，漏掉的调用方编译不过。

**预览先比再调模型**：`preview` 读到 `current` 后马上比版本，不符直接 `draft_stale`，不花模型钱；调用完成后 `savePreview` 再比一次（并发期间可能有人改了），`scheduling: "concurrent"` 与 `beforeEffect` 不变。

**发布的幂等不变**：处理器读到已发布的记录直接返回（`:86`），这一步在比版本之前，重复点发布不报错。

依赖「不带版本也能过」的测试（`tests/functions-effect-boundaries.test.ts:80,81,110-113`）改成带上读到的版本，不放宽断言；要断言什么不变。

### 2.5 错误码

`modules/judgment-rules/src/errors.ts` 的 `defineErrorCodes("functions", …)` 加一个：

```ts
draft_stale: "conflict",   // HTTP 409，由 actionHttpStatus 决定
```

`store.ts:215,229,241` 的「草稿已被更新」改用它。`functions.conflict` 留给「草稿用途已变化」（场景变了），这两个对用户的出路不同：前者重新载入就行，后者要重新检查。`details` 只给 `{ id }`，不回显内容。不写新的 Error 子类。

### 2.6 页面拿到冲突后需要什么

合同只保证这几样，版面、文案、未保存的输入怎么留归设计台（「重新载入」是组件板没有的状态，统筹 2026-11-06 定由设计台定样；`renderAlert` 没有动作槽也归设计台判断）：

| 需要 | 从哪来 |
| --- | --- |
| 知道是过期，不是别的错 | `code === "functions.draft_stale"` |
| 最新的内容和版本 | `functions.authoring.get(id)`，现有，返回的记录带新的 `updated_at`。**不需要新动作** |
| 草稿被删了 | 上一步得到 `functions.not_found` |
| 已被发布，不能再改 | 上一步的 `status === "published"`（`published_immutable` 的说明照旧） |
| 用户没保存的输入 | 还在页面里；合同不碰它。`draft_stale` 时页面**不要**自动覆盖表单 |
| 保留还是丢弃、放在哪、怎么说 | 设计台。先例：Dataset 的「重新读取」（`plugins/native/dataset/src/ui.ts:80`，丢弃前问一次） |

两个前端的实现注意（不是界面决定）：

- 工作台 `client-records.ts` 有 `saving` 串行链：每次保存要用上一次响应里的 `updated_at`，不用表单打开时的。现在靠 `??` 掩盖了这件事，改完以后必须是对的，否则连续保存第二次就冲突。
- Feed `rule-authoring.ts` 把 `saved.function` 存在会话存储：`draft_stale` 时要作废这份存的版本，否则下次提交还是旧值，永远失败。

## 3. 消费者清单（一个 PR 改完）

| 类别 | 文件 |
| --- | --- |
| 内核 | `packages/kernel/src/version-precondition.ts`；调用方 `packages/kernel/src/action-service.ts`、`apps/local-host/src/assistant/assistant-authority.ts`（只是收窄 Pick） |
| 动作与服务 | `modules/judgment-rules/src/{authoring-actions,service,store,errors}.ts` |
| HTTP | `apps/local-host/src/judgment-rules-http/route-handlers.ts` |
| 工作台 | `apps/workbench/src/judgment-rules/client-events.ts`（`:70,193,204,236,277`）、`client-records.ts`（`:149,157,200`）。`settings-client.ts`、`client-render.ts` 查过，没有这个用法 |
| Feed | `plugins/native/feed/src/browser/rule-authoring.ts`（`:55,80,87`，**E 轨**）。Inbox 没有直接消费者 |
| 快照 | `tooling/gates/actions/host-actions.tsv`：`functions.authoring.*` 14 行里输入哈希变 6 行，`pnpm actions:update`。公开 API 快照预计不变，开工时跑 `pnpm api:update` 确认 |
| 测试 | `action-version-precondition`（`:23,26,59-64`）、`feed-capture.e2e`、`functions-authoring-actions`、`connector-consumer-usages`（`:70-72`）、`functions-draft-retention`、`functions-store-versions`、`functions-scene-configuration`、`personal-plugins-review-fixes`、`workbench-functions-late.e2e`、`functions-effect-boundaries` |
| 文档与 Skill | `docs/mcp.md:62`、`packages/kernel/README.md:106`、`skills/goal-advance/SKILL.md:17`（全量回归期间不能改 `skills/`，排好时段）、`docs/releases/CHANGELOG.md` 的升级须知一条（**F 轨独占**，由 F 落或经 F 同意：MCP 客户端的 `updated_at` 改成 `expected_updated_at`） |
| 不用改 | `tests/fixtures/studio-replay/recorded.json` 只有动作 id，不带这个字段；开工时再 grep 一次 |

`tests/action-version-precondition.test.ts` 的 W3-09-3-02 下半段（`updated_at: null` 被拒）改成断言 `expected_updated_at: null` 被拒，不删。

**开工条件**：统筹定等 #1790 合入（它在 `version-precondition.ts` 改 2 行）；界面部分等设计台定样；`modules/judgment-rules`、`packages/kernel`、`apps/workbench/src/judgment-rules/`、`apps/local-host/src/judgment-rules-http/` 在 `tracks.md` 里没有归属，统筹补一行；Feed 文件发预警。

## 第二部分：N22 输入类型

## 4. 类型从哪来

### 4.1 不加第三方依赖

门禁 `public-sdk-private-dependency` 只禁工作区包，第三方在门禁上不被拦。但 `AGENTS.md` 写「SDK 只依赖 contracts」，外部作者只装两个包；纯类型依赖也会出现在发布的 `.d.ts` 里，必须是生产依赖，等于作者多装一个。`json-schema-to-ts` 仓库里没有，`zod` 只有 Alchemist 用。**结论：不加，在 `packages/contracts` 里写一份类型。** 只有类型，没有运行时代码，不碰合同包的副作用和函数长度门禁。

### 4.2 类型本身

`packages/contracts/src/platform/actions.ts` 加（原型 TS 5.9.3 通过，`@ts-expect-error` 验过必填和 enum）：

```ts
type Simple<T> = T extends "string" ? string : T extends "integer" | "number" ? number : T extends "boolean" ? boolean
  : T extends "null" ? null : T extends "object" ? Record<string, unknown> : T extends "array" ? unknown[] : unknown;
type Expand<T> = T extends object ? { [K in keyof T]: T[K] } & {} : T;
type Prop<P, R extends readonly string[]> = Expand<{ readonly [K in keyof P & R[number]]: InferActionInput<P[K]> }
  & { readonly [K in Exclude<keyof P, R[number]>]?: InferActionInput<P[K]> }>;
export type InferActionInput<S> =
  S extends { readonly const: infer C } ? C
  : S extends { readonly enum: readonly (infer E)[] } ? E
  : S extends { readonly oneOf: readonly (infer U)[] } ? (U extends unknown ? InferActionInput<U> : never)
  : S extends { readonly anyOf: readonly (infer U)[] } ? (U extends unknown ? InferActionInput<U> : never)
  : S extends { readonly type: readonly (infer T)[] } ? (T extends unknown ? InferActionInput<Omit<S, "type"> & { readonly type: T }> : never)
  : S extends { readonly type: "array"; readonly items: infer I } ? readonly InferActionInput<I>[]
  : S extends { readonly type: "object"; readonly properties: infer P } ? Prop<P, S extends { readonly required: infer R extends readonly string[] } ? R : readonly []>
  : S extends { readonly type: "object"; readonly additionalProperties: infer A } ? (A extends object ? Readonly<Record<string, InferActionInput<A>>> : Readonly<Record<string, unknown>>)
  : S extends { readonly type: infer T } ? (string extends T ? unknown : Simple<T>)
  : unknown;
```

推不出来的情形（`$ref`、`allOf`、`if/then`）退回 `unknown`，读字段编译报错，安全。

### 4.3 字面量怎样保住

`ActionSchema = Readonly<Record<string, unknown>>`（`actions.ts:33`）不改，留作上界。擦掉字面量的是「把 schema 先赋给标注了 `ActionSchema` 的变量」，所以：

- 定义处的包装用 `const` 泛型：`<const S extends ActionSchema>(input_schema: S, …)`。
- TS 不支持只推一部分泛型，各包的 `define<I, O>` 要写成柯里化：`define<O>()("suffix", …, input_schema, …)`。
- 共享片段（`const text = { type: "string" }`）要加 `as const`。Jelly 的 `object()`、`array()`、`nullable()` 这类帮手改成 `const` 泛型。**这些都只改类型，值不变，动作快照哈希不变。**
- 放宽了的 schema（比如 `input()` 帮手返回 `ActionSchema`）推出来是 `unknown`，处理器读字段编译不过，逼着改，不会悄悄变 `any`。
- `bind` 不用改：`I` 随定义流下来，SDK 只在一处 `value as I`。这一处是 kernel 校验过的边界，是有依据的断言。
- 数组输出建议去掉 `readonly`：现有存储函数签名多是可变数组，能少改很多。开工试点时定。
- 合同包里手写的输入接口（如 `PlacementMoveInput`）保留，旁边加一个类型相等测试。

SDK 的 `defineAction<Input, Output>` 加一个不写 `Input` 的重载，从 schema 推。作者手写的写法继续能用（类型上是上界），这不算兼容标记，是同一个函数的两种用法。

### 4.4 类型检查性能

实测（TS 5.9.3，本机）：2000 个 schema，每个 3～14 字段，321,778 次实例化，检查 1.26 s，内存 300 MB（空项目 58 MB）。`tooling/gates/actions/*.tsv` 全部 986 行是全仓动作数的上限，而且分散在各包，按此估全仓只读入口约 0.6 s 以内，单包更少。试点量一次真实包，超过估计三倍就回到这里。

## 5. 迁移顺序

**每个包内：先补 schema 约束，再删重复检查，不能反过来**，否则中间有一段没人查。一个包一个 PR：

1. 列出处理器里的检查，分成三类：schema 能表达的（必填、类型、`minItems`、`pattern`、长度、enum）、schema 不能表达的（跨字段、要读库）、已被别处保证的。
2. 第一类**且已被处理器执行**的，补进 schema。只搬已有的检查，不新增拒绝。新的收紧单独一个 PR，写明。
3. 确认这个处理器只经 kernel 调用（下面的例外）。
4. 删掉第一类的检查和读值小函数，换成推出来的类型。
5. `pnpm build`、`pnpm actions:update`。

Jelly 的例子：`action-schema.ts:11` 的 `ids` 加 `minItems: 1`（`uniqueItems` 已有），`:42` 的 `text` 加 `pattern: "\\S"`，再删 `jelly/src/ai.ts:26` 的那一行。`:27` 起按选区核对块的部分要读库，留下。

### 5.1 三处要先核的

- **绕过 kernel 的调用。** `plugins/native/plugin-builder/src/exposed-actions.ts:137,140`、`computer-record-source.ts:110,116` 直接 `handler.handle`。前者是转发，后者是内部调用，都没过 `validateActionInput`。迁到这些处理器前先核：这条路要么也校验，要么这个处理器的检查不能删。
- **错误码和文字会变。** 检查搬进 schema 后，错误从插件自己的码变成 `actions.input_invalid`，文字变成通用的。**用户在界面上能走到的检查不能这样搬**，要么页面先拦，要么留着：只有程序调用方才会碰到的检查才搬。逐条判断，PR 里列出来。
- **改哈希。** 补约束改输入 schema 的哈希。按 N35 在原版本改，不升版本。第 2 步只搬已有检查，所以过去被处理器拒的输入现在被 schema 拒，已存的调用（工作流程步骤、固定引用）结果还是失败，只是错误码变了。每片 PR 写明对调用方的影响，排 `tooling/gates/actions/` 枢纽。

只改类型不动 schema 的 PR，动作快照不变，不进枢纽。

## 6. `normalizeProjectId`（N12 第 4 块）

5 份定义（`plugins/native/{dataset:377,form:389,lingguang:333,pages:382,ppt:248}/src/store.ts`），34 行调用（dataset 6、form 6、lingguang 8，其中 `:179` 一行两次共 9 次、pages 8、ppt 6）。每份都是 `trim`、空则抛、超 80 字符抛。逐类核实值的来源：

| 类 | 来源 | 可信吗 |
| --- | --- | --- |
| ① list、create、receive、openConversation 等的 `projectId` | 各插件 `project(caller)` = `caller.project_id`，空时已抛 `actions.project_required`（`dataset/actions.ts:68` 等） | 可信，宿主给的 |
| ② `from_project_id` | SDK `placementSourceProject(caller, to)` 或 `caller.project_id` | 可信 |
| ③ `to_project_id` | 动作输入，但 `PLACEMENT_*_INPUT_SCHEMA` 已有 `minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$"`，受众只有 `user`，放置服务还先核 `spaces.some(project_id === to)` | 可信。`pattern` 决定 `trim` 没有效果 |
| ④ store 内 `get(id, projectId)` 的比较 | 同 ①；插件层另有 `here(projectId)` 比 `context.project_id`（`dataset/plugin.ts:40`、`form/plugin.ts:41`） | 可信 |
| ⑤ Pages `generate.ts` 的 `record.project_id` | 来自 `store.create({ project_id: project(caller) })` | 可信 |

**删掉之后归谁：**

- `trim`：项目 id 在创建时已 trim（`modules/projects` 的 `prepareRecord`：`input.project_id?.trim() || this.id("project")`）。归创建处，不搬。
- 空：`project(caller)` 已查（①）。这个小包装 12 份，不在本项范围，见 §7。
- **80 字符上限谁都不是主人。** 它和放置 schema 的 120 不一致：81～120 字符的 id 能过 schema、被 store 拒。创建处也没有长度上限。定：删掉，不搬。长度上限的主人是 `modules/projects`（现在没有，要加就另开）和 `PLACEMENT` schema（120）。**这是一个行为放宽**：81～120 字符的项目 id 从被拒变成可用。真实项目 id 是生成的短串，用户能指定的只有测试夹具，影响为零；PR 里写明。测试没有断言「项目标识过长」。
- `*.error.no-project` 文案在浏览器代码里还在用（`dataset/src/browser/request.ts:12` 等），不删。store 层的 `datasetErrors.invalid("缺少项目")` 随函数一起删。

开工时再 `git grep` 一遍调用点，新增的逐个归类。五个 store 属 E 轨，02 没改它们。

## 7. 和第 06 批 N12 的边界

N22 只动 N12 第 ④ 块（`normalizeProjectId`）；①②③⑤（两段固定、跨项目移动、复制、搜索与读正文）留在 [06 第 2 项](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-2)。先后：`normalizeProjectId` 那片碰五个 store，06-2 也碰，谁先合谁简单，后合的 rebase，不互相等。建议 N22 这片先合，它小。

重复读值函数的现状（台账有出入）：`text` 读值型 38 个定义／21 个包；`optionalText` 10／5；`required` 真正读值的只有 `plugin-builder/agent-experience.ts:23`，其余是 `browser/dom.ts` 取元素（台账写 15）；`field` 8 个包（台账写 6）。`project(caller)` 小包装 12 份不算在 N22 里，迁移时顺手收到 SDK 一个函数的话单独说明。

## 8. 分片

| 片 | 内容 | 文件 | 验收 | 档位 | 前置 |
| --- | --- | --- | --- | --- | --- |
| N14 | §2 全部，一个 PR | §3 | AIC-01～08 | Sonnet 5.5 high | #1790 合入；设计台定样；E 轨预警 |
| N22-1 工具 | `InferActionInput`、`defineAction` 重载、类型测试 | `packages/contracts/src/platform/actions.ts`、`packages/plugin-sdk/src/actions.ts`；`tooling/gates/api/contracts/platform/actions.txt`、`plugin-sdk/index.txt` | AIC-10、11 | Opus 5.5 high | **公共合同队列**，建议排在 05② C-1 之后：只加类型，和 C-1 不撞；与 C-2 共用 `plugin-sdk/index.txt`，一前一后 |
| N22-2 试点 Jelly | 包内第一遍，把 §5 走通，量性能 | `plugins/native/jelly/src/*`、`tooling/gates/actions/` | AIC-12、13 | Sonnet 5.5 high | N22-1 |
| N22-3 判断规则 | 同上 | `modules/judgment-rules/src/authoring-actions.ts` 等 | AIC-12 | Sonnet 5.5 high | N14、N22-1 |
| N22-4 `normalizeProjectId` | §6 | 五个 store | AIC-14 | Sonnet 5.5 high | 不依赖 N22-1，可先做；E 轨预警 |
| N22-5 其余（范围 A 不做，B 做） | 见 §9 | - | - | - | 用户定范围 |

N14 和 N22 互相不依赖，只有 N22-3 排在 N14 后面（同一个文件）。

## 9. N22 范围（用户定）

台账和批次文件的说法不一样：批次写「从 schema 推导输入类型，同时删掉 N12 第 4 块」，台账写到「再删处理器里的重复检查」。全仓规模：`ActionHandlerBinding` 约 120 个非测试文件、28 个包或目录（`apps/local-host` 32、goals 18、feed 9、contracts 7、schedule 5、jelly 5、coding 5、todo 4，其余 3 个以下），跨 A、B、C1、E 和 `modules/`。

| 方案 | 做什么 | 代价 | 卡什么 |
| --- | --- | --- | --- |
| **A. 工具＋试点＋新代码必须用（推荐）** | N22-1～4。存量记 BL，随各包下次改动或 06-2 迁。加一条门禁：`handle` 处的 `input as` 按文件只许减少（改门禁，红线） | 一段时间两种写法并存；重复检查不会很快消失 | 不卡。第 05 批内交完 |
| B. 一次迁完 | 再加每包一个 PR（约 28 个），先类型后约束 | 约 28 个 PR 跨四条轨道；动作快照枢纽连续排队；每片都要判断错误文字（§5.1） | **卡第 06 批之后的实现**（按批推进规则），但批内干净 |
| C. 全量只改类型 | 约 28 个 PR 只换类型，快照不变，不补约束不删检查；约束逐包后做 | 改动面大而收益只有类型，真正的重复检查还在 | 部分卡，比 B 轻 |

推荐 A：批次文件的写法等于 A。重复检查是 P2，不是缺陷，放进 B 要占几十个 PR 和合同窗口，换不来用户看得到的东西。**Goal Prompt 不许自行降级，由用户定。**

## 10. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。版本字段的语义归动作合同；`updated_at` 归 `modules/judgment-rules` |
| 2 | 插件同等待遇 | 过：N14 删掉内核给一个提供方的分支；N22 的工具在 SDK，内置和外部同一份 |
| 3 | 能力注册 | 不新增动作。可信身份不变（项目 id 取自调用上下文，§6 正是核实这一点）；预览是 `concurrent`，保持 |
| 4 | 合同 | N14 改 6 个动作输入，原版本上改（N35），一个 PR 改完所有消费者；N22-1 加公开类型，单独排合同队列；N22 迁移片不改公开 API，只改 schema 约束 |
| 5 | 放在哪个包 | 类型在 contracts，SDK 只依赖 contracts，不加第三方（§4.1） |
| 6 | 表与存储 | 不涉及：不改表 |
| 7 | 兼容与迁移 | 不加。旧字段名直接拒绝 |
| 8 | 安全边界 | 不改表。N14 收紧（缺版本拒绝）；§6 的放宽（81～120 字符）已写明，项目 id 仍来自可信上下文。`SECURITY-INVARIANTS.md` 没有登记版本前提这一条（查过 `version_required`），不需要新行 |
| 9 | 调用次数 | N14 预览少一次无效的模型调用；重新载入是用户动作一次 `get`。N22 只有类型，运行时不变，删检查略省 |
| 10 | 升级与数据 | 库不变。MCP 客户端和已存的固定调用：字段名变了，按现行 schema 明确失败，升级须知写一条 |
| 11 | 成果与过程项 | 不涉及 |
| 12 | 页面与外壳 | 「重新载入」是新状态，设计台定样；不加 DOM 事件。页面资源：工作台和 Feed 有少量增长，按体积门禁看 |
| 13 | 错误 | `functions.draft_stale` 用 `defineErrorCodes` 声明 |
| 14 | 冲突面 | 枢纽 `host-actions.tsv`；E 轨 `plugins/native/feed/src/browser/rule-authoring.ts`、五个 store；F 轨 `CHANGELOG.md`；`packages/kernel` 等 tracks 没写归属；N22-1 走公共合同队列 |

## 11. 决策记录

| 日期 | 定了什么 | 否掉的 | 理由 |
| --- | --- | --- | --- |
| 2026-11-06 | `expected_updated_at` 必填、非空，不留 `null` | 留 `null` 表示从未保存 | 没有 create 就没有 id，从未保存在这一层不存在 |
| 2026-11-06 | HTTP 体字段同样改名 | 体里留 `updated_at`，路由层翻译 | 不留第二个名（N35） |
| 2026-11-06 | 新错误码 `functions.draft_stale`，`functions.conflict` 留给「用途变了」 | 共用一个码 | 两者出路不同，前端要靠码分 |
| 2026-11-06 | 预览先比版本再调模型 | 只在保存时比 | 过期的预览不该花模型钱 |
| 2026-11-06 | 重新载入不加新动作，用 `functions.authoring.get` | `draft_stale` 的 `details` 带回最新记录 | 错误里不回显内容；`get` 已有 |
| 2026-11-06 | 不加第三方类型依赖 | `json-schema-to-ts` | 外部作者只装两个包 |
| 2026-11-06 | 80 字符上限删掉不搬 | 搬到 SDK | 和放置 schema 的 120 不一致，谁都不是主人 |

## 12. 验收

| 编号 | 证明 |
| --- | --- |
| AIC-01 | 6 个动作缺 `expected_updated_at`：Agent、MCP 得 `actions.version_required`，页面得 `actions.input_invalid`；记录不变 |
| AIC-02 | 传 `null`、空串：被拒，记录不变 |
| AIC-03 | 传旧值：`functions.draft_stale`（HTTP 409），`details` 只有 `id`，记录不变 |
| AIC-04 | 发布不带版本被拒；已发布的记录重复发布仍幂等返回 |
| AIC-05 | 预览传旧值：不调模型（假模型计数 0）；调用期间被别人改了：`savePreview` 被拒，不写 |
| AIC-06 | 内核里没有能力名字面量：`version-precondition.ts` 不再读 `capability_id` |
| AIC-07 | 工作台连续保存两次都成功（第二次用第一次响应的版本）；两个页面同时改，后保存的得 `draft_stale`，未保存的输入还在，重新载入后拿到新内容（界面断言按定样补） |
| AIC-08 | Feed：`draft_stale` 后存的旧版本作废，下一次提交用新版本成功 |
| AIC-10 | 类型测试：必填、可选、enum、`oneOf`、`["string","null"]`、数组、`additionalProperties` 推导正确；放宽的 schema 是 `unknown`，读字段 `@ts-expect-error` |
| AIC-11 | SDK 只依赖 contracts（`pnpm boundary:check`），公开 API 快照写明新类型 |
| AIC-12 | 试点包的处理器不再有 `input as`；每个搬进 schema 的约束都有一个断言拒绝的用例，错误码写明；动作快照刷新 |
| AIC-13 | 试点量一次 `tsc` 时间与内存，记进 PR；超过 §4.4 估计三倍回到设计 |
| AIC-14 | 五个 store 没有 `normalizeProjectId`；Home 级调用没有项目时仍得 `actions.project_required`；`to_project_id` 带空白、超 120 被放置 schema 拒；81 字符的项目 id 可用 |
