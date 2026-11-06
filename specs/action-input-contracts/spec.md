# 动作的版本字段与输入类型（路线书 05 第 4 项）

状态：设计稿（2026-11-06），没有实现。N14 的界面用户 2026-11-06 选了「就地接住」（设计台实物 `docs/design/rule-stale-reload/`，定样 PR 另开）；N22 的范围用户同日定为一次迁完（§9）。排进[第 05 批第 4 项](../post-anticorruption-roadmap/reference/batches/05.md#batch-05-item-4)，来源是[对抗式审查台账](../../docs/reviews/adversarial-review-2026-11-01.md) N14、N22。依据是 main `242d75d03`，#1790 头 `3585974c5` 只读对照。

验收编号前缀 `AIC`，见 §12。

## 0. 给人讲清楚

这份设计管两件小而散的事，都关于「动作收到的输入」。

- **N14。** 判断规则的编辑动作用一个特别的字段（`updated_at`）表示「我读到的版本」，内核为此写了一条按名字认它的分支；而且不带版本也能过，等于「两个人同时改，后保存的悄悄盖掉先保存的」。改完以后，它和别的动作一样必须带上读到的版本；过期了不覆盖，页面能重新载入。
- **N22。** 平台在调用处理器之前已经按声明检查过输入，处理器却拿不到类型，只好再检查一遍，于是同样的读值小函数写了几十份。做一份类型推导，全部处理器一次迁过去，补上声明里缺的约束，删掉重复的检查。这件事很大（约 30 片），第 06 批的实现要等它做完，§8 写了怎样派工、怎样尽量缩短。

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
| `store.ts:155`、`:279`（`savePreview`、`writeSamples`）、`:207`（`publish`） | 试跑、样例、发布都把 `updated_at` 往前推 | 别处只试跑一次，这边的保存就失败，其实内容没变（设计台查到） |
| `client-events.ts:232,274`（试跑、发布按钮）→ `client-records.ts:152`（`saveDraft`） | 点试跑或发布之前，总先把整张表存一遍，内容没变也存 | 所以「别处只点了一下试跑」连定义这一步也会推版本，光改 `savePreview` 不够（合同台查到） |
| `client-records.ts:128`、`:138` | 列表里找不到这条规则就 `closeEditor()` | 规则被别处删除时，输入直接丢了（设计台查到） |
| `authoring-actions.ts:86`、`store.ts:191`、`:212-215` | 已发布就直接返回成功，不看调用方读到的是哪一版 | 别处改了内容再发布，这边点发布也「成功」，Feed 会接着绑上一条它没预览过的规则（设计台查到；后半句合同台核 `rule-authoring.ts:87`） |

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

### 2.4 `updated_at` 从此只代表定义内容

这是设计台三个事实的共同答案。**`updated_at` 改成「定义内容的版本」：只有定义字段真的变了才往前走。** 定义字段是 `update` 能写的那些：`name`、`function_key`、`instructions`、`criteria`、`scene_id`、`scene_version`、`scene_provider_id`、`subject_kinds`、`scene_map`、`action_map`。

| 写操作 | `updated_at` 变吗 | 现在 |
| --- | --- | --- |
| `update`，定义字段有变化 | 变 | 变 |
| `update`，规整之后和现有内容完全一样 | **不变，不写库，返回现有记录** | 变 |
| 试跑（`savePreview`） | **不变** | 变 |
| 加样例、删样例（`writeSamples`） | **不变** | 变 |
| 发布（`publish`） | **不变**，发布时间写在 `published_at` | 变 |

为什么这样就够了：

- **只试跑不再打扰任何人**，包括 Agent、MCP 和 Feed，不用每个调用方都学会「重读、比较、再存」。不写库的 `update` 那一行不能省：编辑器点试跑前总先存一遍，少了它，别处点一下试跑仍然会推版本。
- **试跑不会被盖。** 试跑结果靠 `config_hash` 绑内容，内容一变，`update` 就把它清掉（`store.ts:118`），发布前 `assertReadyToPublish` 还查一遍。
- **样例不会丢。** `update` 不写 `samples_json`；`addSample`、`removeSample` 读和写之间没有 `await`，在同一个连接上不会交错。
- **发布可以分清两种情况。** 发布不推版本之后，已发布记录的 `updated_at` 就是被发布的那一版。调用方传的值和它相等，说明读到的正是发布的内容，重试或别处发布都没有害处；不相等，说明发布的内容它没读过（§2.6）。**不加列、不加字段，这个判断就成立。**

否掉的两个做法：

- **另加一个内容版本列。** 要改表、升版本，N14 就得等 U1，而且一条记录上有两个「版本」，调用方要学哪个算数。
- **`updated_at` 照旧推，只让页面重读后比较**（设计台原型的做法）。工作台和 Feed 各写一份，Agent、MCP 还是会因为别人试跑一次而收到冲突。页面的比较仍然保留，只用来接住「改了又改回」（§2.7）。

**一个看得见的小变化：** 列表按 `updated_at` 排序（`store.ts:48`），试跑和改样例不再把规则顶到最上面。发布仍然要顶上去，排序改成 `ORDER BY datetime(COALESCE(published_at, updated_at)) DESC`。

`tests/functions-store-versions.test.ts` 开头写着「每次写都推版本」，这一条要改：**这是合同有意改变，不是放宽。** 改成断言试跑、样例、发布、无变化的保存都不推版本，并保留「定义变了之后旧版本被拒」的全部断言。

### 2.5 service 与 store

`updateDraft`、`addSample`、`removeSample`、`deleteDraft`、`preview`、`publish`、`savePreview` 的 `expectedUpdatedAt` 改必填，删掉全部 `??`（`service.ts:158`、`store.ts` 6 处、`authoring-actions.ts:90` 和各处理器的 `?? undefined`）。类型一改，漏掉的调用方编译不过。

**预览先比再调模型**：`preview` 读到 `current` 后马上比版本，不符直接 `draft_stale`，不花模型钱；调用完成后 `savePreview` 再比一次（并发期间可能有人改了），`scheduling: "concurrent"` 与 `beforeEffect` 不变。`savePreview` 把版本比较放到 `config_hash` 比较前面，否则内容变了会报 `stale_preview`，页面就分不出这是过期。

依赖「不带版本也能过」的测试（`tests/functions-effect-boundaries.test.ts:80,81,110-113`）改成带上读到的版本，不放宽断言；要断言什么不变。

### 2.6 每种情况得到什么

检查顺序固定：记录在不在 → 已发布吗 → 版本对不对 → 其余校验。所以 `assertReadyToPublish` 和 `validatePublication` 排在版本比较之后，过期的发布不会先报「还没试跑」。

| 情况 | `update`、`delete` | `publish` | `preview`、`sample.add`、`sample.remove` |
| --- | --- | --- | --- |
| 记录不在 | `functions.not_found` | 同左 | 同左 |
| 已发布，传的是发布的那一版 | `functions.published_immutable` | **幂等返回成功** | 照常（已发布的规则现在就能试跑、加样例） |
| 已发布，传的是更早的版本 | `functions.published_immutable` | **`functions.published_immutable`**（现在是成功） | `functions.draft_stale` |
| 草稿，版本过期 | `functions.draft_stale` | `functions.draft_stale` | `functions.draft_stale` |
| 样例不在（只有 `sample.remove`） | - | - | **`functions.sample_not_found`**（现在和「规则不在」共用 `not_found`，页面分不清） |

`store.publish` 的写库条件没抢到时（`store.ts:212-215`）按同一张表判断：读出最新记录，已发布且版本相等才返回，已发布但版本不同报 `published_immutable`，还是草稿报 `draft_stale`。

**错误码**：`modules/judgment-rules/src/errors.ts` 的 `defineErrorCodes("functions", …)` 加两个，不写新的 Error 子类：

```ts
draft_stale: "conflict",      // HTTP 409，由 actionHttpStatus 决定
sample_not_found: "not_found",
```

`store.ts:215,229,241` 的「草稿已被更新」改用 `draft_stale`。`functions.conflict` 留给「草稿用途已变化」（场景变了），这两个对用户的出路不同：前者载入最新版就行，后者要重新检查。`details` 只给 `{ id }`，不回显内容。`tests/host-pages-error-model.test.ts:77` 的表加这两行。

### 2.7 就地接住要的数据

用户选的是方案 A：提示就地出现，载入不丢输入，两边都改的字段摆出「你写的」。合同只负责让页面判断得出来、拿得到数据；版面和文案按设计台定样。

**页面的判断（编辑器和 Feed 同一套）：**

| 收到 | 接着 | 对应定样的状态 |
| --- | --- | --- |
| `draft_stale` | `get(id)`，往下走 | |
| `get` 得 `not_found` | | 已被删除 |
| `get` 得 `status === "published"` | | 已在别处发布 |
| `get` 得草稿，定义字段和页面的基准版相同 | 接上新的 `updated_at`，静默重存，不打扰 | 只是元数据变了（改了又改回才会走到这里） |
| `get` 得草稿，定义字段不同 | | 发生冲突 |
| `not_found` | | 已被删除 |
| `published_immutable` | `get(id)` 拿版本号，供「查看 v1」 | 已在别处发布 |
| `sample_not_found` | `get(id)` 刷新样例列表，不当成规则没了 | 不提示 |

**页面要握住的数据：**

| 数据 | 从哪来 | 用来 |
| --- | --- | --- |
| 基准版 | 最后一次成功保存或载入的记录，工作台是 `sel`，Feed 是 `saved.function` | 比出「只有你改的」「只有别处改的」「两边都改的」 |
| 最新版 | `functions.authoring.get`，现有动作，返回完整记录，带新的 `updated_at`。**不需要新动作** | 载入、比较。比较的字段就是 §2.4 那份定义字段 |
| 你写的 | 还在表单里。合同不碰它。`draft_stale` 时页面**不要**自动覆盖表单 | 放回、换回 |
| 规则的 `primitive` 和原 `function_key` | 基准版 | 「存成新规则」 |

**「存成新规则」用现有的两个动作，不加新动作：** `create({ primitive, name })` 拿到新 id 和新版本，再 `update` 写其余定义字段。

- 不传 `function_key`，让 `create` 生成一个；只有用户在这次编辑里亲手改过 key 才传。已在别处发布的规则还占着原来的 key，传了就是 `key_conflict`。
- 两步不是原子的。第二步失败时留下一条空草稿，页面把新 id 记成当前规则，表单还在，可以再存。失败不丢输入。
- 不带样例和试跑结果：新规则内容没人试过，发布前要重新试跑。

**实现时要动的（不是合同，但不做就撑不起定样）：**

- 工作台 `client-records.ts` 的 `saving` 串行链：每次保存用上一次响应里的 `updated_at`，不用表单打开时的。现在靠 `??` 掩盖了这件事，改完以后必须是对的，否则连续保存第二次就冲突。
- `client-records.ts:128`、`:138` 两处 `closeEditor()`：有未保存输入时不关，进「已被删除」；没有未保存输入才照旧关掉。
- 编辑器的输入现在只在内存里。冲突期间写一份到会话存储，刷新页面才不丢；Feed 已经这样做了。
- Feed `rule-authoring.ts` 把 `saved.function` 存在会话存储：`draft_stale` 载入后必须用新记录替换它，并清掉 `previewContent`（启用前要求预览过当前内容，`:87`），否则下次提交还是旧值，永远失败。
- Feed 碰到 `published_immutable` 时走现有的「已发布就重建草稿」路径（`:48`），但要一起删掉 `functionKey`，否则新草稿和已发布的规则撞 key。碰到 `not_found` 同样删掉 `function`、`functionContent`、`previewContent`，下一次预览会再建好，这正是定样的「重新预览」。

## 3. 消费者清单（一个 PR 改完）

| 类别 | 文件 |
| --- | --- |
| 内核 | `packages/kernel/src/version-precondition.ts`；调用方 `packages/kernel/src/action-service.ts`、`apps/local-host/src/assistant/assistant-authority.ts`（只是收窄 Pick） |
| 动作与服务 | `modules/judgment-rules/src/{authoring-actions,service,store,errors}.ts`；动作说明里「`updated_at` 用于拒绝过期编辑」「读取时的修订号」一起改（说明文字不进动作哈希） |
| HTTP | `apps/local-host/src/judgment-rules-http/route-handlers.ts` |
| 工作台 | `apps/workbench/src/judgment-rules/client-events.ts`（`:70,193,204,236,277`）、`client-records.ts`（`:128,138,149,157,200`）。`settings-client.ts`、`client-render.ts` 查过，没有这个用法。界面部分按定样，部件走 D 轨 |
| Feed | `plugins/native/feed/src/browser/rule-authoring.ts`（`:55,80,87`，**E 轨**）。Inbox 没有直接消费者 |
| 快照 | `tooling/gates/actions/host-actions.tsv`：`functions.authoring.*` 14 行里输入哈希变 6 行，`pnpm actions:update`。公开 API 快照预计不变，开工时跑 `pnpm api:update` 确认 |
| 测试 | `action-version-precondition`（`:23,26,59-64`）、`feed-capture.e2e`、`functions-authoring-actions`、`connector-consumer-usages`（`:70-72`）、`functions-draft-retention`（`:62` 的假服务要改字段名）、`functions-store-versions`（§2.4 的合同变化）、`functions-scene-configuration`、`personal-plugins-review-fixes`、`workbench-functions-late.e2e`、`functions-effect-boundaries`、`host-pages-error-model`（`:77`） |
| 文档与 Skill | `docs/mcp.md:62`、`packages/kernel/README.md:106`、`skills/goal-advance/SKILL.md:17`（全量回归期间不能改 `skills/`，排好时段）、`docs/releases/CHANGELOG.md` 的升级须知一条（**F 轨独占**，由 F 落或经 F 同意：MCP 客户端的 `updated_at` 改成 `expected_updated_at`） |
| 不用改 | `tests/fixtures/studio-replay/recorded.json` 只有动作 id，不带这个字段；开工时再 grep 一次 |

`tests/action-version-precondition.test.ts` 的 W3-09-3-02 下半段（`updated_at: null` 被拒）改成断言 `expected_updated_at: null` 被拒，不删。

**开工条件**：统筹定等 #1790 合入（它在 `version-precondition.ts` 改 2 行）；界面部分等定样 PR 合入（方案 A 用户已选，组件板新增走 D 轨）；`packages/kernel` 本批按 C1 对待，`modules/judgment-rules`、`apps/workbench/src/judgment-rules/`、`apps/local-host/src/judgment-rules-http/` 随 N14 一起改（统筹 11-06 裁定）；Feed 文件发预警。

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
  : S extends { readonly type: "array"; readonly items: infer I } ? InferActionInput<I>[]
  : S extends { readonly type: "object"; readonly properties: infer P } ? Prop<P, S extends { readonly required: infer R extends readonly string[] } ? R : readonly []>
  : S extends { readonly type: "object"; readonly additionalProperties: infer A } ? (A extends object ? Readonly<Record<string, InferActionInput<A>>> : Readonly<Record<string, unknown>>)
  : S extends { readonly type: infer T } ? (string extends T ? unknown : Simple<T>)
  : unknown;
```

推不出来的情形（`$ref`、`allOf`、`if/then`）退回 `unknown`，读字段编译报错，安全。只写 `{ type: "object" }` 的推成 `Record<string, unknown>`：读字段不报错，但读到的是 `unknown`，当字符串用才报错，同样不会悄悄变 `any`。

### 4.3 工具合同（N22-01）

下面三样都在 `packages/contracts/src/platform/actions.ts`，本机 TS 5.9.3 跑过原型，`@ts-expect-error` 验过必填、enum、字段类型和宽 schema。

| 名字 | 给谁用 | 做什么 |
| --- | --- | --- |
| `InferActionInput<S>` | 所有人 | §4.2，只有类型 |
| `bindActionHandler(definition, run, extra?)` | 所有处理器 | 把定义和处理函数接成 `ActionHandlerBinding`。**全仓只在这里写一次 `input as I`**，这里是 kernel 校验过的边界。各包的 `bind` 小包装改成调它；要多包一层的（写入检查、取权限）还留自己的包装，但不再各写一次 `as` |
| `inputSchemaFor<I>()(schema)` | 手写接口的公开合同 | 证明 schema 放进来的输入，手写接口都接得住；接不住就编译失败。返回类型是 `ActionSchema`，所以 `.d.ts` 和公开 API 快照都不变 |

SDK 的 `defineAction` 加一个不写 `Input`、从 schema 推的重载。收口片（N22-Z）删掉手写 `Input` 的那个写法：N35 阶段一不留第二种写法。

### 4.4 两种写法，看输入类型归谁

| 情形 | 写法 | 为什么 |
| --- | --- | --- |
| 包内部的动作（插件、宿主动作、模块私有） | 从 schema **推导**，删掉手写的 `I` | 类型没有别的用处，一份事实 |
| 输入类型是公开合同的一部分（`packages/contracts/src/services/*`、`modules/*`、`platform/{placement,file-sources,search-sources,artifact-pins,workflow-content}`，共 118 个定义加 5 组共享帮手） | **留着手写接口**，schema 外面包 `inputSchemaFor<I>()` | 调用方在用这些接口的名字；改成推导类型会把 schema 字面量写进 `.d.ts`，14 份 API 快照一起变，还和 05② 抢队列。证明它们一致，效果相同，代价小得多 |
| 输入形状运行时才知道（`connector-mcp-actions.ts`、`external-mcp-actions.ts`、`plugin-builder/exposed-actions.ts`、`functions.published.*`） | `input: unknown`，不断言形状，原样转发 | 没有东西可推。名单写进收口片的记录 |
| Alchemist | **不迁**，核一遍就结束 | 它已经是一份事实：`operation.input.safeParse(input)`，处理函数拿到 `parsed.data`（`action-operations.ts:176-187`），没有手写检查可删。它是用户批过的例外，由 BL-377 重做。这是对「全部处理器」的解读，不是缩范围：它的处理器已经拿着解析后的类型 |

### 4.5 字面量怎样保住（迁移写法）

`ActionSchema = Readonly<Record<string, unknown>>`（`actions.ts:33`）不改，留作上界。擦掉字面量的是「把 schema 先赋给标注了 `ActionSchema` 的变量」，所以：

- 各包的 `define<I, O>` 用 `const` 泛型接 schema。TS 不支持只推一部分泛型，要写成柯里化：`define<O>()("suffix", …, input_schema, …)`。
- 共享片段（`const text = { type: "string" }`）加 `as const`。`object()`、`array()`、`nullable()`、`choices()` 这类帮手改成 `const` 泛型。**这些都只改类型，值不变，动作快照哈希不变。**原型里 Todo 那套帮手（`object` 默认全部必填、`choices` 用 `map` 生成 `oneOf`）都推得出来，`choices` 要在返回处写一次类型。
- 数组推出来是可变数组：现有存储函数签名多是可变数组，这样少改很多。
- 推出来的类型和存储函数的入参对不上，就是真发现：要么 schema 太松（记进 S 清单），要么存储函数的类型太窄（当场改）。

### 4.6 类型检查的代价

实测（TS 5.9.3，本机）：2000 个 schema，每个 3～14 字段，321,778 次实例化，检查 1.26 s，内存 300 MB（空项目 58 MB）。`tooling/gates/actions/*.tsv` 全部 986 行是全仓动作数的上限，而且分散在各包，按此估全仓只读入口约 0.6 s 以内，单包更少。

**还有一个风险原型量不出来**：各包导出的动作表（`export const goalsActions = { … }`）现在 `.d.ts` 里只写接口名，推导之后要展开整段类型，Goals（76 个动作）、Jelly（53 个）可能碰到 TS7056（推出来的类型太长，序列化不了）。所以试点选 Jelly，N22-04 必须量；超过估计三倍或碰到 TS7056，就停下回到这里，办法是给动作表写一个具名类型，或者只导出定义、不导出表。**试点通过之前不扇出。**

## 5. 怎样迁一个包：先换类型，再收约束

把一个包的迁移拆成两种片。**这是本方案缩短时间的主要办法，判断见 §8.3。**

### 5.1 T 片：只换类型

**规则：schema 的值一个字都不动。** 证明办法是跑 `pnpm actions:update` 后 `tooling/gates/actions/` 没有差异，并写进 PR。所以 T 片不进快照队列，不同的包可以同时做。

1. `define`、帮手按 §4.5 改写；`bind` 改调 `bindActionHandler`。
2. 处理器里的 `input as X`、手写的 `I` 全部删掉。公开合同按 §4.4 包 `inputSchemaFor`。
3. 编译报错的地方逐个判断：
   - 存储函数类型太窄：当场改。
   - **schema 比处理器要的松**（可选写成了必填、`{ type: "object" }` 没写字段）：T 片不能改 schema，这一处的 `as` 留着，记进 **S 清单**。
4. 不删任何运行时检查，不改错误码和文字。行为零变化。
5. PR 描述列出 S 清单和处理器里的重复检查。**清单是空的，这个包的 S 片就取消。**

### 5.2 S 片：收约束

**规则：先补 schema 约束，再删重复检查，不能反过来**，否则中间有一段没人查。S 片要占快照队列。

1. 把 S 清单和处理器里的检查分成三类：schema 能表达的（必填、类型、`minItems`、`pattern`、长度、enum）、schema 不能表达的（跨字段、要读库）、已被别处保证的。
2. 第一类**且已被处理器执行**的，补进 schema。只搬已有的检查，不新增拒绝。新的收紧单独一个 PR，写明。
3. 确认这个处理器只经 kernel 调用（§5.3）。
4. 删掉第一类的检查和读值小函数；T 片留下的 `as` 也删掉。
5. `pnpm build`、`pnpm actions:update`，每个搬进去的约束配一个断言拒绝的用例（AIC-12）。

Jelly 的例子：`action-schema.ts:11` 的 `ids` 加 `minItems: 1`（`uniqueItems` 已有），`:42` 的 `text` 加 `pattern: "\\S"`，再删 `jelly/src/ai.ts:26` 的那一行。`:27` 起按选区核对块的部分要读库，留下。

### 5.3 S 片要逐条判断的三件事

- **绕过 kernel 的调用。** `apps/local-host/src/plugin-builder/exposed-actions.ts:137,140`、`computer/computer-record-source.ts:110,116` 直接 `handler.handle`。前者是转发，后者是内部调用，都没过 `validateActionInput`。迁到这些处理器前先核：这条路要么也校验，要么这个处理器的检查不能删。
- **错误码和文字会变。** 检查搬进 schema 后，错误从插件自己的码变成 `actions.input_invalid`，文字变成通用的。**用户在界面上能走到的检查不能这样搬**，要么页面先拦，要么留着：只有程序调用方才会碰到的检查才搬。逐条判断，PR 里列出来。所以「删重复检查」不会删到一个不剩，留下的每条在 PR 里写理由。
- **改哈希。** 补约束改输入 schema 的哈希。按 N35 在原版本改，不升版本。只搬已有检查，所以过去被处理器拒的输入现在被 schema 拒，已存的调用（工作流程步骤、固定引用）结果还是失败，只是错误码变了。每片 PR 写明对调用方的影响。

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

N22 只动 N12 第 ④ 块（`normalizeProjectId`）；①②③⑤（两段固定、跨项目移动、复制、搜索与读正文）留在 [06 第 2 项](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-2)。按「按批推进」，06 的实现要等第 05 批全部合入，所以两边**不会同时改代码**，不用互相 rebase。06 的设计稿可以照常写，开工时对着 N22 迁完的 store 和动作文件再核一次。

重复读值函数的现状（台账有出入）：`text` 读值型 38 个定义／21 个包；`optionalText` 10／5；`required` 真正读值的只有 `plugin-builder/agent-experience.ts:23`，其余是 `browser/dom.ts` 取元素（台账写 15）；`field` 8 个包（台账写 6）。`project(caller)` 小包装 12 份不算在 N22 里，迁移时顺手收到 SDK 一个函数的话单独说明。

## 8. 分片与派工

### 8.1 真实规模

账上写的「120 个文件、28 个包」只数了写出 `ActionHandlerBinding` 这个名字的文件（实数 121）。按 `handle` 的写法再找一遍，多出这些，一并迁：

| 多出来的 | 处理器 | 处理 |
| --- | --- | --- |
| `modules/artifacts/src/plugin-client.ts` | 8 个，7 处 `as` | T13 |
| `modules/judgment-rules/src/actions.ts`、`apps/local-host/src/judgment-rules-actions.ts` | 8 个，7 处 `as` | N22-05 |
| `apps/local-host/src/information-actions.ts` | 1 | T11 |
| `apps/local-host/src/{external-mcp-actions,connector-account-actions}.ts` | 各 1 | T12 |
| `apps/local-host/src/local-host.ts:74` `registerAction<Input, Output>` | 宿主自己 58 个 `platform` 动作的共同入口，只有 1 处 `as`，类型来自 `contracts/services/*` 的手写接口 | N22-03 |

全部算上约 **130 个文件**。下表的文件数只算处理器文件，不含消费者和测试。

### 8.2 分片表

除 N22-06 外，所有片都等 **#1837 合入**（02 的三个 PR 碰了 33 个处理器文件，Goal Prompt 写明 02 收尾前不碰）。「同时最多 3 个写手」把 N14 也算在内。写手一律子代理。

**第一段：工具和样板**

| 片 | 做什么 | 包（文件数） | 轨道 | 快照 | 档位 | 前置 |
| --- | --- | --- | --- | --- | --- | --- |
| N22-01 工具合同 | §4.2、§4.3，类型测试 | contracts `platform/actions.ts`、SDK `actions.ts`（2） | C1 | `api/contracts/platform/actions.txt`、`api/plugin-sdk/index.txt` | Opus 5.5 high，全量 | #1837（共用 `index.txt`）。**不等 05② C-1**，文件和快照都不重叠；和 05② C-2、U1-f、08 C-1 共用 `index.txt`，谁先准备好谁先，一前一后 |
| N22-06 `normalizeProjectId` | §6 | Dataset、Form、Lingguang、Pages、PPT 的 `store.ts`（5） | E | 无 | Sonnet 5.5 high | **不依赖工具，也不等 #1837**：02 的 PR 没碰这五个 store（已查）。统筹可以最先开它 |
| N14 | §2、§3 | §3 | 无归属（kernel 按 C1），Feed 一个文件 E | `host-actions.tsv` 6 行 | Sonnet 5.5 high，全量 | #1790；定样 PR；E 轨预警 |
| N22-04 试点 Jelly | T＋S 同一个 PR，把两种片都走通，**定下写法样板**，量 §4.6 | Jelly（5） | E | `actions.tsv` | Opus 5.5 high | N22-01。**它通过之前，下面的 T 片不开** |
| N22-02 共享帮手 | 共享定义 `bind*` 改调工具，schema 包 `inputSchemaFor`。T 片 | contracts `platform/{artifact-pins,file-sources,placement,search-sources,workflow-content}.ts`、SDK `routes.ts`（6） | C1 | 预计无（实测为准，有变化排 api 队列） | Sonnet 5.5 high，全量 | N22-01 |
| N22-05 判断规则 | T＋S 同一个 PR：包小，N14 刚改过 | `modules/judgment-rules/src/{authoring-actions,actions}.ts`、宿主 `judgment-rules-actions.ts`（3） | 无归属 | `host-actions.tsv` | Sonnet 5.5 high，全量 | **N14**（同一个文件）、N22-01 |

**N14 和工具谁先：** 互不依赖，可以同时开。只有 N22-05 必须排在 N14 后面。

**第二段：T 片（13 片，不占快照，可以 3 个写手同时做）**

| 片 | 包（文件数） | 动作行 | `as` 处数 | 轨道 | 档位 | 排序依据与要注意的 |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Goals（18） | 76 | 63 | E | Sonnet 5.5 high | 最大，最先开。它的写法是 `Input<"submitGoalTreeProposal">`，类型来自应用层接口，方向和别的包相反：推出来的类型要能赋给接口 |
| T02 | Feed（9） | 48 | 12 | E | Sonnet 5.5 high | |
| T03 | Todo、Schedule（9） | 44 | 12 | E | Sonnet 5.5 high | Schedule 的 `bind` 包了写入检查 |
| T04 | Pages、PPT、Form（9） | 96 | 7 | E | Sonnet 5.5 high | |
| T05 | Dataset、Lingguang、Cognia、Images（8） | 86 | 11 | E | Sonnet 5.5 high | |
| T06 | Shelf、Workflows（5） | 49＋27（宿主表） | 8 | E | Sonnet 5.5 high | Workflows 的 `bind` 包了权限 |
| T07 | Inbox、Issues、Text Stats（3） | 29 | 13 | E | Sonnet 5.5 high | |
| T08 | Coding（5） | 28 | 1 | B | Sonnet 5.5 high | 和 #1851（文案）撞文件的话 rebase |
| T09 | Git、Diff、Files（3） | 18 | 3 | B | Sonnet 5.5 high | 手写检查最多（28 处），S 片才动 |
| T10 | 宿主 `assistant/`（3） | - | 9 | A | Sonnet 5.5 high | 和 #1870 共用 `assistant-rule-actions.ts`，等它合入。A 轨预警 |
| T11 | 宿主其余（11） | 约 60 | 52 | 无归属 | Sonnet 5.5 high | `home-actions.ts` 等，规则 4 的热文件不碰 |
| T12 | 连接器与模型（17） | 29＋ | 31 | 无归属 | Sonnet 5.5 high | 第 13 批正在这里写，**排在 T 片最后**。动态 schema 的两个文件照 §4.4 |
| T13 | `modules/{artifacts,characters}`、宿主 `memory/`、`computer/`、`plugin-builder/`（8） | 56＋ | 13 | 无归属 | Sonnet 5.5 high，全量 | `modules` 是共享核心。`plugin-builder` 走 §5.3 |

还有一片和上面同等地位、但要排合同队列：

| 片 | 包（文件数） | 轨道 | 档位 | 前置 |
| --- | --- | --- | --- | --- |
| N22-03 合同服务动作 | `services/{agent-host,memory,placement,knowledge,search,agent-task-grants,agent-collaboration,agent-inputs,agent-host-write-checkers,agent-host-offers}.ts`、`modules/{projects,workspace-artifacts,workspace-writers,characters}.ts`（14，118 个定义）；`local-host.ts` 那一处 `as` 改调工具 | C1 | Sonnet 5.5 high，全量 | N22-01；**排在 05② C-1 之后**（C-1 改 `services/agent-host`、`modules/projects`）。预计不改任何快照；若实测要改就停下，按子路径排队 |

**第三段：S 片（按改哪份快照串行，每片一个 PR）**

| 片 | 包 | 轨道 | 快照 | 档位 | 前置 |
| --- | --- | --- | --- | --- | --- |
| S0 合同里的共享 schema（清单空就取消） | N22-02、N22-03 记下的 | C1 | 两份都占，可能还有 api | Opus 5.5 high，全量 | 这两片之后；占两份，这一轮别的 S 片让开 |
| S1 | Goals | E | `actions.tsv` | Sonnet 5.5 high | T01 |
| S2 | Feed、Inbox、Issues | E | `actions.tsv` | Sonnet 5.5 high | T02、T07 |
| S3 | Todo、Schedule、Workflows | E | `actions.tsv` | Sonnet 5.5 high | T03、T06 |
| S4 | Pages、PPT、Form、Dataset、Lingguang | E | `actions.tsv` | Sonnet 5.5 high | T04、T05 |
| S5 | Git、Diff、Files、Coding | B | `actions.tsv` | Sonnet 5.5 high | T08、T09 |
| S6 | Shelf、Cognia、Images、Text Stats | E | 两份都占（Shelf 两边都有） | Sonnet 5.5 high | T05、T06、T07 |
| S7 | 宿主其余、`assistant/` | 无归属，A 预警 | `host-actions.tsv` | Sonnet 5.5 high | T10、T11 |
| S8 | 连接器与模型 | 无归属 | `host-actions.tsv` | Sonnet 5.5 high | T12 |
| S9 | `modules/*`、`memory/`、`computer/`、`plugin-builder/` | 无归属 | `host-actions.tsv` | Sonnet 5.5 high，全量 | T13 |

**第四段：收口**

| 片 | 做什么 | 轨道 | 档位 | 前置 |
| --- | --- | --- | --- | --- |
| N22-Z 收口 | 全仓再找一遍（其他批新加的处理器）；删 `defineAction` 手写 `Input` 的写法；`examples/probe-plugin`、`tooling/plugin-cli` 模板、`skills/molis-plugin-dev`（全量回归期间不能改 `skills/`）；核 Alchemist；动态 schema 名单写进这份 spec；防回潮按 §9.2 | C1 | Opus 5.5 high，全量 | 全部 T、S |

**合并分片的理由。** 账上按包算 28 片。这里把 20 个插件的 T 片并成 9 片（Jelly 是试点，Alchemist 不迁），宿主和 `modules` 按主题拆成 4 片，S 片也一样并。规矩是：

- **同一条轨道、文件总数不超过约 20、没有在途 PR 撞文件才并。** 一片就是一个评审上下文，PPT、Form、Pages 的写法几乎一样，放一起评审反而省事。
- **Goals、Feed 不并**：够大，写法也独特。
- **宿主要拆**：连接器在第 13 批的施工区，单独一片才能错开；`assistant/` 归 A 轨；`modules` 要跑全量，别拖累别的文件。
- **小包的 S 片并到邻居**：T 片之后很多小包的清单预计是空的（比如 Coding 只有 1 处 `as`），并着写免得占一轮快照。

### 8.3 判断：类型和约束能不能分开、并行

**能，而且应该分开。这是最能缩短时间的一步。**

| | 不分开（每片 T＋S） | 分开 |
| --- | --- | --- |
| 占快照的片 | 全部（约 13 片长片），`actions.tsv` 那一路要串 8 到 9 片 | 只有 S 片，`actions.tsv` 那一路 6 片，还可能取消几片 |
| 同时能开工的写手 | 2 个（每份快照一个），第 3 个没活 | 3 个都有活：T 片和 S 片不抢 |
| 每片的难度 | 每片都要逐条判断错误文字 | T 片基本靠编译器，判断全压在 S 片 |
| 代价 | - | 有 S 内容的包要出两个 PR，多一轮评审 |

为什么分得开：

1. **T 片不动 schema 的值，快照就不变**，这是门禁能证明的（§5.1），不是约定。而 T 片不碰别的快照：`tooling/gates/api/` 只收 contracts 和 SDK，插件包不进。
2. **T 片碰到 schema 太松不算卡住**：`as` 留着记进清单，留给 S 片。合并前行为零变化，所以中间任何时候停下来都是干净的状态。

分不开的地方：**同一个包不能两片同时做**（同一批文件）。S 片必须排在本包 T 片之后，因为 T 片的编译报错就是 S 清单的来源。

### 8.4 快照怎么排队

**不是每包一份。** `tooling/gates/actions/` 一共 4 个文件：

| 文件 | 行数 | 里面是 | N22 碰吗 |
| --- | --- | --- | --- |
| `actions.tsv` | 586 | 22 个插件 Manifest 声明的动作，按提供方连续排 | S1～S6、N22-04 |
| `host-actions.tsv` | 367 | `platform` 58、`sdk.artifacts.*` 128、`system.*`、Characters、Artifacts、Shelf 27 | S0、S6～S9、N14、N22-05 |
| `scenes.tsv`、`host-scenes.tsv` | 8、7 | 消费场景 | 不碰 |

**规则（轨道规则 1、4）：同一份快照同一时间一个写手。** 所以：

- **`actions.tsv` 一路、`host-actions.tsv` 一路，可以同时走**，互不等。
- **S0 和 S6 不能和任何 S 片并行**（两份都占）。T 片不受影响。
- T 片、N22-01～03、N22-06 不进这两路。N22-03 若实测要改快照，就是判断错了，停下来。
- 和别的片抢 `host-actions.tsv` 的：N14、05② C-1、U1-f。排序看谁先准备好，不互相等；05② C-1 在 S 段之前就该合入。

快照行互相独立，改不同提供方的行 git 能自动合。所以如果 S 段成了最慢的一段，统筹可以按**规则 4 合成批 PR**：两三个 S 片在一个集成分支上合、一次刷新快照。这是统筹的调度手段，不用改规矩。

### 8.5 排程：三个写手怎样排满

用「轮」计数：一轮是一个写手从开工到合入。这里不估天数，真正的上限是整台机器一次一个构建（`PARALLEL-DEVELOPMENT.md` 第 5 节）。

| 轮 | 写手一 | 写手二 | 写手三 |
| --- | --- | --- | --- |
| 1 | N22-01 | N22-06 | N14 |
| 2 | N22-04 试点 | N22-02 | N22-05 |
| 3 | N22-03 | T01 | T02 |
| 4 | T10 | T11 | S1 |
| 5 | T03 | T04 | S0 |
| 6 | T05 | T06 | S7 |
| 7 | T07 | T13 | S3 |
| 8 | T08 | S9 | S4 |
| 9 | T09 | T12 | S2 |
| 10 | S8 | S5 | |
| 11 | S6 | | |
| 12 | N22-Z | | |

这是一个排得下的例子，不是死规定：约 12 轮，31 片（含 N14）。05② C-1 没合入时 N22-03 往后挪，空位给下一个 T 片；S0 没有内容时那一轮给 T 片。最后三轮有空位，因为只剩快照串行的片和收口。**清单为空的 S 片取消后，总轮数还能少。**

**尽量缩短的办法，都已经写进上面了：**

1. T 片和 S 片分开（§8.3）。
2. 工具不等 05② C-1，只等 #1837。
3. `normalizeProjectId` 不等工具也不等 #1837，可以最先开。
4. 两份快照分两路走。
5. 小包合并；S 清单为空就取消。
6. 试点通过之前不扇出：只损失一轮，却防住「全部 T 片按错误写法做完」这种最贵的返工。

**还有一个杠杆要用户定，不在这份方案里：** T 片全部合入后，处理器已经全部有类型，S 片只在已有包内收约束。如果嫌等得久，可以问用户：要不要在 T 段结束时就放行第 06 批里不碰这些包的项。这改的是「按批推进」的规矩，本方案不假定它。

### 8.6 和在途 PR 怎样避让

截至 main `7f960b38b` 查到的真实重叠（处理器文件）：

| 在途 | 重叠 | 办法 |
| --- | --- | --- |
| #1790、#1836、#1837（02） | 33 个文件，遍布各插件 | **全部等 #1837 合入。**这是硬前置 |
| #1870（13） | `assistant-rule-actions.ts`、`connector-call-observation.ts` | T10、T12 等它合入 |
| #1865、#1858、#1817（13） | 不碰处理器文件，但在连接器区域施工 | T12 排在 T 片最后；开工时重查 |
| #1851（10） | Coding、Diff、Git、Schedule 的其他文件 | 无重叠，碰上了后到的 rebase |
| #1869（18） | `platform/plugin.ts` | N22-01 不碰它，无冲突 |
| 05② C-1 | `services/agent-host`、`modules/projects`、`host-actions.tsv` | N22-03 排在它后面；S 段错开 |
| 05② C-2、U1-f、08 C-1 | `api/plugin-sdk/index.txt` | 和 N22-01 一前一后 |

每片开工前重查一次（把路径换成这片的文件）：

```bash
gh pr list --state open --json number,title,files --jq '.[] | select(any(.files[]; .path == "plugins/native/goals/src/actions.ts")) | "#\(.number) \(.title)"'
```

**别的批新加的处理器**：N22-01 合入后通知在跑的批，新处理器直接用 `bindActionHandler` 和推导写法；来不及的由 N22-Z 兜住。

**第 06 批**：不会同时改代码（§7）。

### 8.7 一片做完的标准

T 片：`pnpm --filter <包> run build` 通过；`pnpm actions:update` 无差异；`pnpm api:update` 无差异；`node scripts/affected-tests.mjs` 选的用例通过；PR 带 S 清单。

S 片：再加每个约束一个拒绝用例，PR 列出留下的检查和理由、对调用方的影响。

## 9. N22 范围（用户 2026-11-06 定）

### 9.1 一次迁完

**全部处理器迁到推导类型，补约束，删重复检查。** 合同台原来推荐的是工具加试点（A），用户选了 B。否掉的是 A 和「全量只换类型」（C）。代价用户知道：跨 A、B、C1、E 约 30 片，第 06 批之后的实现要等它。**不降级。**

### 9.2 防止回潮（要加门禁，超出用户已同意的范围，统筹再问）

原来那条「`input as` 只许减少」是方案 A 的配套，用来容忍两种写法并存。一次迁完之后没有存量要容忍，**不留它**。但类型本身挡不住回潮：`ActionHandlerBinding.handle` 的 `input` 还是 `unknown`，谁都能再写一句 `input as X`，同样能手写一份和 schema 对不上的 `I`。

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A. 一条绝对门禁（推荐）** | N22-Z 之后开：用 Biome 的 grit 规则（`tooling/gates/lint/`）或一个小 AST 脚本，**处理器的输入参数上不许有 `as`**（`handle` 的第二个参数，以及传给 `bindActionHandler` 的函数的第一个参数）。基线就是 0，不许新增，不用「只许减少」的账本。例外只有 `bindActionHandler` 那一处和 §4.4 的动态 schema，名单写在门禁里，带理由。测试不查 | 改门禁，单独一个 PR。规则窄，误报少，查的是最常见的回潮方式；手写 `I` 靠 N22-Z 删掉重载那一步挡住 |
| B. 不加门禁 | 靠工具写法和评审，`skills/molis-plugin-dev` 写清楚 | 不用改门禁。但这正是 N22 想根治的「各写各的」，几个月后会慢慢长回来 |
| C. 类型上封死 | `ActionHandlerBinding` 改成只能由工具函数造出来（品牌类型），对象字面量编译不过 | 不用门禁，最彻底。但测试里有 189 个文件、475 处 `handle:`，都要跟着改，这片的量顶得上好几个 T 片 |

推荐 A：一条规则，成本最小，也能防止这几十个 PR 的成果被慢慢磨掉。**不管选哪个都不影响分片和排程**，门禁在最后一片之后才开。

## 10. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。版本字段的语义归动作合同；`updated_at` 归 `modules/judgment-rules` |
| 2 | 插件同等待遇 | 过：N14 删掉内核给一个提供方的分支；N22 的工具在 SDK，内置和外部同一份 |
| 3 | 能力注册 | 不新增动作。可信身份不变（项目 id 取自调用上下文，§6 正是核实这一点）；预览是 `concurrent`，保持 |
| 4 | 合同 | N14 改 6 个动作输入和 `updated_at` 的语义，原版本上改（N35），一个 PR 改完所有消费者；N22-01 加公开类型和两个函数，单独排合同队列；T 片不改公开 API 和动作快照；S 片只改 schema 约束 |
| 5 | 放在哪个包 | 类型和两个小函数在 contracts（`bindActionHandler`、`inputSchemaFor` 都不到 20 行，无副作用），SDK 只依赖 contracts，不加第三方（§4.1） |
| 6 | 表与存储 | 不改表。`updated_at` 语义收窄，存量值继续有效，不用升级 |
| 7 | 兼容与迁移 | 不加。旧字段名直接拒绝 |
| 8 | 安全边界 | 不改表。N14 收紧（缺版本拒绝）；§6 的放宽（81～120 字符）已写明，项目 id 仍来自可信上下文。`SECURITY-INVARIANTS.md` 没有登记版本前提这一条（查过 `version_required`），不需要新行 |
| 9 | 调用次数 | N14 预览少一次无效的模型调用；无变化的保存不写库；载入最新版是用户动作一次 `get`，只有收到冲突才多这一次。N22 只有类型，运行时不变，删检查略省 |
| 10 | 升级与数据 | 库不变。MCP 客户端和已存的固定调用：字段名变了，按现行 schema 明确失败，升级须知写一条。S 片补约束不改取值范围之外的行为，只改错误码（§5.3） |
| 11 | 成果与过程项 | 不涉及 |
| 12 | 页面与外壳 | 「载入最新版」是新状态，用户选了方案 A，定样 PR 另开，组件板新增走 D 轨；不加 DOM 事件。页面资源：工作台和 Feed 有增长，一个资源涨超过 10 KB 先问用户（`AGENTS.md`） |
| 13 | 错误 | `functions.draft_stale`、`functions.sample_not_found` 用 `defineErrorCodes` 声明 |
| 14 | 冲突面 | 见 §8.4、§8.6。枢纽 `actions.tsv`、`host-actions.tsv`；跨 A、B、C1、E 和不归轨道的宿主文件；F 轨 `CHANGELOG.md`；N22-01 走公共合同队列 |

## 11. 决策记录

| 日期 | 定了什么 | 否掉的 | 理由 |
| --- | --- | --- | --- |
| 2026-11-06 | `expected_updated_at` 必填、非空，不留 `null` | 留 `null` 表示从未保存 | 没有 create 就没有 id，从未保存在这一层不存在 |
| 2026-11-06 | HTTP 体字段同样改名 | 体里留 `updated_at`，路由层翻译 | 不留第二个名（N35） |
| 2026-11-06 | 新错误码 `functions.draft_stale`，`functions.conflict` 留给「用途变了」 | 共用一个码 | 两者出路不同，前端要靠码分 |
| 2026-11-06 | 预览先比版本再调模型 | 只在保存时比 | 过期的预览不该花模型钱 |
| 2026-11-06 | 载入最新版不加新动作，用 `functions.authoring.get` | `draft_stale` 的 `details` 带回最新记录 | 错误里不回显内容；`get` 已有 |
| 2026-11-06 | **「载入最新版」的样子用方案 A 就地接住**（用户定）：底部提示加一个按钮，只有两边都改的字段摆出你写的，可放回、可换回；不提供一键覆盖 | B 对比后决定、C 拦下来问 | 定样 PR 记录；合同上的要求见 §2.7 |
| 2026-11-06 | **`updated_at` 只代表定义内容**：试跑、样例、发布、无变化的保存都不推它 | 另加内容版本列；照旧推、让页面重读比较 | 不改表、不等 U1；所有调用方一起受益。`functions-store-versions.test.ts` 的旧断言是这条合同，要改 |
| 2026-11-06 | **发布时读到的版本和已发布的不同，报 `published_immutable`**，相同才幂等成功 | 一律幂等成功；输出加 `already_published` 字段 | 版本不同说明调用方没读过这次发布的内容，不能当成功；发布不推版本之后，这个判断不用加列 |
| 2026-11-06 | 新错误码 `functions.sample_not_found` | 和规则不在共用 `not_found` | 页面只看码就要分清「规则没了」和「样例没了」，后者不该提示 |
| 2026-11-06 | 「存成新规则」用 `create` 加 `update`，不传原 key，不带样例和试跑结果 | 新动作、原子的 `create` | 不加动作；已发布的规则还占着原 key；新规则内容没人试过 |
| 2026-11-06 | 不加第三方类型依赖 | `json-schema-to-ts` | 外部作者只装两个包 |
| 2026-11-06 | 80 字符上限删掉不搬 | 搬到 SDK | 和放置 schema 的 120 不一致，谁都不是主人 |
| 2026-11-06 | **N22 一次迁完**（用户 2026-11-06 定） | 工具加试点、全量只换类型 | 代价是约 30 片、第 06 批之后等它，用户知道 |
| 2026-11-06 | 拆成 T 片和 S 片，T 片不动 schema 值、不占快照 | 每包一个 PR 两件一起做 | §8.3 |
| 2026-11-06 | 公开合同的输入类型留手写接口，用 `inputSchemaFor` 证明和 schema 一致 | 全部改成推导类型 | 不用把 schema 字面量写进 `.d.ts`，14 份 API 快照不动，不和 05② 抢队列 |
| 2026-11-06 | Alchemist 不迁，核一遍；动态 schema 留 `unknown` | 硬迁 | Alchemist 已是解析后的类型，且是用户批过的例外（BL-377）；动态的没有东西可推 |
| 2026-11-06 | `input as` 只许减少的门禁不做 | 留作过渡 | 那是方案 A 的配套；一次迁完没有存量要容忍。防回潮见 §9.2，要用户定 |

## 12. 验收

| 编号 | 证明 |
| --- | --- |
| AIC-01 | 6 个动作缺 `expected_updated_at`：Agent、MCP 得 `actions.version_required`，页面得 `actions.input_invalid`；记录不变 |
| AIC-02 | 传 `null`、空串：被拒，记录不变 |
| AIC-03 | 传旧值：`functions.draft_stale`（HTTP 409），`details` 只有 `id`，记录不变 |
| AIC-04 | 发布不带版本被拒；已发布的记录传发布的那一版：幂等返回；传更早的版本：`functions.published_immutable`，记录不变；过期的发布不先报「还没试跑」 |
| AIC-05 | 预览传旧值：不调模型（假模型计数 0）；调用期间被别人改了内容：`savePreview` 得 `draft_stale`，不写 |
| AIC-06 | 内核里没有能力名字面量：`version-precondition.ts` 不再读 `capability_id` |
| AIC-07 | 工作台连续保存两次都成功（第二次用第一次响应的版本）；两个页面同时改，后保存的得 `draft_stale`，未保存的输入还在，载入最新版后拿到新内容（界面断言按定样补） |
| AIC-08 | Feed：`draft_stale` 后存的旧版本作废，下一次提交用新版本成功；载入后要求重新预览；已发布后走重建草稿，新草稿不撞 key |
| AIC-09 | 试跑、加样例、删样例、发布、规整后无变化的保存，都不改 `updated_at`；定义字段真的变了才改。别处点一下试跑（含它先存一遍），这边的保存照常成功，不提示。列表顺序：发布顶到前面，试跑不动 |
| AIC-10 | 类型测试：必填、可选、enum、`oneOf`、`["string","null"]`、数组、`additionalProperties` 推导正确；只写 `{ type: "object" }` 时字段值是 `unknown`；`inputSchemaFor` 在 schema 比接口松、字段类型不符时编译失败，`.d.ts` 不含 schema 字面量 |
| AIC-11 | SDK 只依赖 contracts（`pnpm boundary:check`），公开 API 快照写明新类型和两个函数 |
| AIC-12 | 每个 S 片：包内处理器不再有 `input as`；每个搬进 schema 的约束都有一个断言拒绝的用例，错误码写明；留下的检查有理由；动作快照刷新 |
| AIC-13 | 试点量一次 `tsc` 时间与内存，记进 PR；超过 §4.6 估计三倍或碰到 TS7056，回到设计 |
| AIC-14 | 五个 store 没有 `normalizeProjectId`；Home 级调用没有项目时仍得 `actions.project_required`；`to_project_id` 带空白、超 120 被放置 schema 拒；81 字符的项目 id 可用 |
| AIC-15 | 规则被别处删除：有未保存输入时编辑器不关，输入还在，「存成新规则」得到一条带这些内容的新草稿；第二步失败时输入还在；没有未保存输入时照旧关掉。`sample.remove` 得 `sample_not_found` 时不当成规则没了 |
| AIC-16 | 规则在别处发布：保存得 `published_immutable`，页面进「已在别处发布」，输入还在；「存成新规则」不撞 key；传发布的那一版点发布按成功 |
| AIC-17 | 每个 T 片：`pnpm actions:update`、`pnpm api:update` 无差异，运行时检查和错误码没动，PR 带 S 清单 |
| AIC-18 | N22-Z：全仓处理器的输入参数上只剩 `bindActionHandler` 一处 `as` 和 §4.4 名单里的例外；`defineAction` 没有手写 `Input` 的写法；模板和 Skill 用新写法；读动作输入的 `text`、`optionalText` 只剩有理由的 |
