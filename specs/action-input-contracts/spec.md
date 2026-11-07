# 动作的版本字段与输入类型（路线书 05 第 4 项）

状态：实现中（2026-11-06 设计）。N22-06（#1893，`2d6c7b56b`）、N22-01（[#1909](https://github.com/molis-ai/molis-work/pull/1909)，`077073d7b`）已合入；N14 的标本在 #1913，第一段在分支上；N22-04 试点在写。N14 的界面用户 2026-11-06 选了「就地接住」（设计台实物 `docs/design/rule-stale-reload/`，定样 PR 另开）；N22 的范围用户同日定为一次迁完（§9）。排进[第 05 批第 4 项](../post-anticorruption-roadmap/reference/batches/05.md#batch-05-item-4)，来源是[对抗式审查台账](../../docs/reviews/adversarial-review-2026-11-01.md) N14、N22。依据是 main `242d75d03`；#1790 合入（`a942bd9c3`）后复核过路径和行号，2026-11-07 按 #1877 勘误一轮。

验收编号前缀 `AIC`，见 §12。

## 0. 给人讲清楚

这份设计管两件小而散的事，都关于「动作收到的输入」。

- **N14。** 判断规则的编辑动作用一个特别的字段（`updated_at`）表示「我读到的版本」，内核为此写了一条按名字认它的分支；而且不带版本也能过：工作台每次都带，只有省略版本的调用才可能盖掉别人的改动。改完以后，它和别的动作一样必须带上读到的版本；过期了不覆盖，页面就地接住，输入不丢。
- **N22。** 平台在调用处理器之前已经按声明检查过输入，处理器却拿不到类型，只好再检查一遍，于是同样的读值小函数写了几十份。做一份类型推导，全部处理器一次迁过去，补上声明里缺的约束，删掉重复的检查。这件事很大（约 30 片），第 06 批的实现要等它做完，§8 写了怎样派工、怎样尽量缩短。

用户能看到的只有第一件：编辑判断规则时，别处改过内容或删掉了规则，页面就地说明，能载入最新版，正在写的内容不丢。第二件纯属内部整理。

## 第一部分：N14 版本字段

## 1. 现状

| 位置 | 现在 | 问题 |
| --- | --- | --- |
| `packages/kernel/src/version-precondition.ts:16` | `fields()` 认四个版本字段，另加「能力名以 `functions.authoring.` 开头且有 `updated_at`」 | 内核按提供方名字开分支，违反「不另写名单或宿主分支」 |
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

**平台里还有另外 4 种「读到的版本」字段（#1877 带来），都不在 `VERSION_FIELDS`，N14 不收：**

| 字段 | 动作 | schema | 谁能调 |
| --- | --- | --- | --- |
| `etag` | `cognia.material.update`（`plugins/native/cognia/src/actions.ts:35`） | 必填，64 位十六进制内容指纹 | agent、mcp、user、workflow |
| `expected_content_hash` | `shelf.items.edit@2`（`plugins/native/shelf/src/actions.ts:77`） | 必填，同上 | agent、mcp、user、workflow |
| `expectedEtag` | `alchemist.directions.update`、`alchemist.memory.playbook.revise`（`studio/shared/contracts/actions.ts:203,161`） | 必填（zod），同上 | agent、mcp、user、workflow |
| `expected_input_revision` | `coding.sessions.update`（`plugins/native/coding/src/route-actions.ts:46`） | 可选，整数 | 只有 user |

它们和 `expected_updated_at` 的形状不同，含义也不同：这几个是内容指纹或编辑序号，为的是「读到的内容变了就拒绝」；`functions` 用读到的 `updated_at`，因为它从此只代表定义内容（§2.4），不需要另算指纹。所以 N14 不照 etag 做。不把它们加进 `VERSION_FIELDS`：那是内核的通用判断，加了就要给每个动作的语义负责，而它们靠 schema 已经必填（Coding 只给 user）。Agent、MCP 漏带时得到的是 `actions.input_invalid`，不是 `actions.version_required`，提示没有那么明确。这是个可以单独收的小差别，N14 不碰。

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

`tests/functions-store-versions.test.ts` 开头写着「每次写都推版本」，这一条要改：**这是合同有意改变，不是放宽。** 文件里的旧版本大多靠样例或试跑造出来（`:31`、`:33`、`:39`、`:42`，只有 `:25` 靠定义），新合同下这些版本不再旧，照字面改就会变成「成功」，所以不能删。改法写在 AIC-09：update、addSample、removeSample、preview、publish 五种拒绝都留，旧版本改由定义写入造出来，错误码改 `draft_stale`；`:30`、`:35`、`:41`、`:46` 的「版本前进」翻成「不变」；同一毫秒那半段（`laterThan`）留着。文件头注释和 `store.ts:31` 的注释一起改成「定义内容变了才往前走」。

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

**页面的判断（编辑器和 Feed 同一套）：** 下面的「未保存内容」指表单和基准版不同。状态名对应设计台定样（`docs/design/rule-stale-reload/README.md`，随 #1873 合入）。

| 收到 | 条件 | 接着 | 对应定样的状态 |
| --- | --- | --- | --- |
| `draft_stale` | | `get(id)`，往下走 | |
| `get` 失败（断网、服务不可用） | | 这时还不知道落在下面哪一行。表单不动，「再试一次」重新 `get`，回到这张表判断，不是直接载入 | 重新载入失败 |
| `get` 得 `not_found`，或保存直接得 `not_found` | 有未保存内容 | 不关编辑器，输入留着 | 已被删除 |
| 同上 | 没有未保存内容 | 工作台关掉编辑器，给一句「这条规则已被删除」；Feed 删掉草稿，不提示（草稿只是载体），下一次预览再建 | 定样没画这一格，见它「实现时要动的」第 3 条 |
| `get` 得 `status === "published"`，或保存得 `published_immutable` | 有未保存内容 | `get(id)` 拿版本号，供「查看 v1」 | 已在别处发布 |
| 同上 | 没有未保存内容 | 直接进只读的 v1 | 只读查看（定样 `viewing`） |
| `get` 得草稿，定义字段和基准版相同 | | 接上新的 `updated_at`，静默重存，不打扰 | 别处改了又改回 |
| `get` 得草稿，定义字段不同 | 没有未保存内容 | 直接换成最新版；这次提交是发布或试跑就拦下，再点一次才走。不自动重跑：重跑花模型钱 | 没有未保存内容 |
| 同上 | 有未保存内容 | 提示，等用户点「载入最新版」（再 `get` 一次，拿那一刻最新的） | 发生冲突；载入后是已载入最新版 |
| 放回之后保存又得 `draft_stale` | | 同上，多一条出路「存成新规则」 | 连续第二次冲突 |
| `sample_not_found` | | `get(id)` 刷新样例列表，不当成规则没了 | 不提示 |

**页面要握住的数据：**

| 数据 | 从哪来 | 用来 |
| --- | --- | --- |
| 基准版 | 最后一次成功保存或载入的记录，工作台是 `sel`，Feed 是 `saved.function`（存的是完整的 `JudgmentRuleRecord`，定义字段都在，够比较） | 比出「只有你改的」「只有别处改的」「两边都改的」 |
| 最新版 | `functions.authoring.get`，现有动作，返回完整记录，带新的 `updated_at`。**不需要新动作，但要给 Feed 打开**（下面） | 载入、比较。比较的字段就是 §2.4 那份定义字段 |
| 你写的 | 还在表单里。合同不碰它。`draft_stale` 时页面**不要**自动覆盖表单 | 放回、换回 |
| 规则的 `primitive` 和原 `function_key` | 基准版 | 「存成新规则」 |

**Feed 现在调不到 `get`，两道关都要开：**

- `get` 的 `audiences` 不含 `plugin`：`authoring-actions.ts:34-37` 的 `define` 默认不开，`:45` 没传，而 list、create、update、preview、publish 都传了。改成打开。`list` 已经对插件开放，权限同样是 `functions:manage`，并且返回全部记录，所以没有多放开什么。
- Feed 没声明消费它：`plugins/native/feed/src/manifest.ts:38` 的 `capabilities.consumes` 加这一项，否则 `apps/local-host/src/plugin-page-actions.ts:29-30` 报 `actions.forbidden`。`rule-authoring.ts:21` 的 `action` 联合类型加 `get`，文件头注释「five exact」改成六个。

否掉的路：Feed 用 `list` 再按 id 找，不改合同，但每次冲突都拉全部规则。

**「存成新规则」用现有的两个动作，不加新动作：** `create({ primitive, name })` 拿到新 id 和新版本，再 `update` 写其余定义字段。

- 不传 `function_key`，让 `create` 生成一个；只有用户在这次编辑里亲手改过 key 才传。已在别处发布的规则还占着原来的 key，传了就是 `key_conflict`。
- 两步不是原子的。第二步失败时留下一条空草稿，页面把新 id 记成当前规则，表单还在，可以再存。失败不丢输入。
- 不带样例和试跑结果：新规则内容没人试过，发布前要重新试跑。

**实现时要动的（不是合同，但不做就撑不起定样）：**

- 工作台 `client-records.ts` 每次都带版本（`:149`），`saving` 串行链已经用上一次响应里的 `updated_at`（`:157`），不用改。版本必填之后这里错了连续保存第二次就冲突，所以 AIC-07 钉住。
- `client-records.ts:128`、`:138` 两处 `closeEditor()`：有未保存输入时不关，进「已被删除」；没有未保存输入才关掉，并给一句「这条规则已被删除」。
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
| Feed | `plugins/native/feed/src/browser/rule-authoring.ts`（`:21,55,80,87`）、`plugins/native/feed/src/manifest.ts:38`（消费 `get`，§2.7），**E 轨**。Inbox 没有直接消费者 |
| 快照 | `tooling/gates/actions/host-actions.tsv`：`functions.authoring.*` 14 行里输入哈希变 6 行，`get` 一行的「谁能调」加 `plugin`，共变 7 行，`pnpm actions:update`，PR 里写明影响。公开 API 快照预计不变，开工时跑 `pnpm api:update` 确认 |
| 测试 | `action-version-precondition`（`:23,26,59-64`）、`feed-capture.e2e`、`functions-authoring-actions`、`connector-consumer-usages`（`:70-72`）、`functions-draft-retention`（`:62` 的假服务要改字段名）、`functions-store-versions`（§2.4 的合同变化）、`functions-scene-configuration`、`functions-agent-references`、`functions-choice-validation`、`functions-plugin`、`functions-system-capability`、`home-action-scenes`、`home-offers.e2e`、`inbox-action-scenes`、`mcp-scene-effect-authority`、`scene-default-rule-lifecycle`、`scene-default-rule-same-scope`、`secret-store-keychain-retry`、`security-invariants-artifact-declarations`、`system-functions-actions`、`workflows-judgment-link`、`function-agent-authoring.e2e`、`personal-plugins-review-fixes`、`workbench-functions-late.e2e`、`functions-effect-boundaries`、`host-pages-error-model`（`:77`） |
| 文档与 Skill | `docs/mcp.md:62`、`packages/kernel/README.md:106`、`skills/goal-advance/SKILL.md:17`（全量回归期间不能改 `skills/`，排好时段）、`docs/releases/CHANGELOG.md` 的升级须知一条（**F 轨独占**，由 F 落或经 F 同意：MCP 客户端的 `updated_at` 改成 `expected_updated_at`） |
| 不用改 | `tests/fixtures/studio-replay/recorded.json` 只有动作 id，不带这个字段；开工时再 grep 一次 |

`tests/action-version-precondition.test.ts` 的 W3-09-3-02 下半段（`updated_at: null` 被拒）改成断言 `expected_updated_at: null` 被拒，不删。

**开工条件**：#1837 已合入；界面部分按定样（#1873，已合入）（方案 A 用户已选，组件板新增走 D 轨）；`packages/kernel` 本批按 C1 对待，`modules/judgment-rules`、`apps/workbench/src/judgment-rules/`、`apps/local-host/src/judgment-rules-http/` 随 N14 一起改（统筹 11-06 裁定）；Feed 文件发预警。

## 第二部分：N22 输入类型

## 4. 类型从哪来

### 4.1 不加第三方依赖

门禁 `public-sdk-private-dependency` 只禁工作区包，第三方在门禁上不被拦。但 `AGENTS.md` 写「SDK 只依赖 contracts」，外部作者只装两个包；纯类型依赖也会出现在发布的 `.d.ts` 里，必须是生产依赖，等于作者多装一个。`json-schema-to-ts` 仓库里没有，`zod` 只有 Alchemist 用。**结论：不加，在 `packages/contracts` 里写一份类型。** 只有类型，没有运行时代码，不碰合同包的副作用和函数长度门禁。

### 4.2 类型本身

放在 `packages/contracts/src/platform/action-input.ts`，由 `platform/actions` 转出（并进 `actions.ts` 就是 849 行，过了文件上限）。下面是设计时的原型（TS 5.9.3 通过，`@ts-expect-error` 验过必填和 enum），实现以那个文件为准，已知不同：`items` 是数组且没写 `minItems` 时按 0 算，元素都可选，因为运行时接受 `[]`；N22-02 还要改两处（本节末尾）。

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
  : S extends { readonly type: "array"; readonly maxItems: 0 } ? []
  : S extends { readonly type: "array"; readonly items: infer I extends readonly unknown[] } ? (S extends { readonly minItems: infer N extends number } ? OptionalFrom<{ -readonly [K in keyof I]: InferActionInput<I[K]> }, N> : { -readonly [K in keyof I]: InferActionInput<I[K]> })
  : S extends { readonly type: "array"; readonly minItems: infer N extends number; readonly maxItems: infer M extends number; readonly items: infer I } ? (number extends N ? InferActionInput<I>[] : N extends M ? RepeatTuple<InferActionInput<I>, N> : InferActionInput<I>[])
  : S extends { readonly type: "array"; readonly items: infer I } ? InferActionInput<I>[]
  : S extends { readonly type: "object"; readonly properties: infer P } ? Prop<P, S extends { readonly required: infer R extends readonly string[] } ? (string extends R[number] ? readonly [] : R) : readonly []>
  : S extends { readonly type: "object"; readonly additionalProperties: infer A } ? (A extends object ? Readonly<Record<string, InferActionInput<A>>> : Readonly<Record<string, unknown>>)
  : S extends { readonly type: infer T } ? (string extends T ? unknown : Simple<T>)
  : unknown;
type OptionalFrom<T extends readonly unknown[], Min extends number, Head extends unknown[] = []> =
  Head["length"] extends Min ? [...Head, ...Partial<T>] : T extends readonly [infer F, ...infer R] ? OptionalFrom<R, Min, [...Head, F]> : Head;
type RepeatTuple<T, N extends number, Acc extends unknown[] = []> =
  Acc["length"] extends N ? Acc : Acc["length"] extends 8 ? T[] : RepeatTuple<T, N, [...Acc, T]>;
```

合同里 43 个定义的输入是元组，有三种写法，都要推成元组，否则过不了 §4.3：

| 写法 | 例子 | 推成 |
| --- | --- | --- |
| `maxItems: 0` | `projects.workspaces.list` | `[]` |
| `items` 是数组 | `agent.run.control`；`minItems` 短于 `items` 时，后面的元素可选 | `[a, b]`、`[a, b?]` |
| `items` 是一个 schema，`minItems` 等于 `maxItems` | `projects.settings.runtime.select` | `[a]`。超过 8 个退回数组 |

推不出来的情形（`$ref`，没写 `type` 和 `properties` 的 `allOf`、`if/then`，以及同时有 `properties` 和顶层 `anyOf`、`oneOf` 的写法）退回 `unknown`，读字段编译报错，安全。`allOf`、`if/then` 和 `type`、`properties` 写在一起时不退回：只看 `properties`，条件里的必填不参与，推出来的字段比运行时宽，处理器读的时候还要自己判断。现在有 1 处：Jelly 的 `aiInput`（`plugins/native/jelly/src/actions.ts:18-21`），N22-04 碰到，条件里的必填照旧由 schema 查。同时有 `properties` 和顶层 `anyOf`、`oneOf` 的写法有 8 个动作：`todo.changes.revert`、`todo.items.link`、`cognia.knowledge.synthesize`、`memory.prefs.write`（`contracts/services/memory.ts:546`）、05② C-1 的 `projects.directories.set_output`、`map_source`，还有嵌套的 `goals.tree.submit`、`goals.tree.decide`（`goal-tree-action-schemas.ts:18` 的 `payload`）。**统筹 2026-11-07 定：不改写法，N22-02 改工具**（下面第 1 条），和 §5.1「T 片不动 schema」不再矛盾。这几处的分支都不带 `type`，N22-01 上本来就是 `unknown`，没有哪个推导被削弱。只写 `{ type: "object" }` 的推成 `Record<string, unknown>`：读字段不报错，但读到的是 `unknown`，当字符串用才报错，同样不会悄悄变 `any`。`required` 不是字面量（`string[]`）时一个都不算必填，所以 §4.5 的帮手漏写 `const`，接口有必填字段的定义会被 §4.3 报出来，不会悄悄放行。

**N22-02 带的两处工具改动**（[#1909 合审](https://github.com/molis-ai/molis-work/pull/1909#issuecomment-6705563344) 2.1、3.2，`actions.txt`、`plugin.txt` 它本来就占）：

1. `type: "object"` 加 `properties` 那一行挪到 `oneOf` 前面。同层的关键字都要满足，只读 `properties` 不会说多，和 `allOf`、`if/then` 同一条规则。合审在副本上实跑：`set_output`、`map_source` 包 `FlatUnion<…>` 能过，多键少键仍被拒，fixture 的 55 条拒绝不变。
2. `minItems` 是字面量、`maxItems` 不是时，现在推成定长（`maxItems: LIMITS.x`，`LIMITS` 没写 `as const`）。`number extends N` 后面加 `number extends M`。

**下面四种写法工具会说多，现有定义都没踩到，不要用：** 元组都写 `maxItems`，否则运行时放行多余元素（`minItems`、`maxItems` 都没写时 `["a", 1, "x"]` 也能过，类型却是 `[a?, b?]`；现有 35 个按位置的元组都写了，另外 8 个本来定长）；`required` 写字面量，不写条件表达式或字面量联合的数组；可空用 `nullableSchema`，不写 `nullable: true`；`objectSchema` 的属性不写条件展开（`objectSchema({ a, ...(flag ? { b } : {}) })`：类型说 `b` 必有，运行时可能没有）。SDK README 同样写明，由下一个碰它的片带。

### 4.3 工具合同（N22-01）

下面四样都在 `packages/contracts/src/platform/action-input.ts`，从 `platform/actions` 和 SDK 都能取，本机 TS 5.9.3 跑过原型，`@ts-expect-error` 验过 AIC-10 列的每一种拒绝。

| 名字 | 给谁用 | 做什么 |
| --- | --- | --- |
| `InferActionInput<S>` | 所有人 | §4.2，只有类型 |
| `bindActionHandler(definition, run, extra?)` | 所有处理器 | 把定义和处理函数接成 `ActionHandlerBinding`。`run` 是 `(input, caller)`，`extra` 是 `{ execution?, availability? }`，展开在 `capability_id`、`version` 前面，盖不掉动作 id。**全仓只在这里写一次 `input as I`**，这里是 kernel 校验过的边界。各包的 `bind` 小包装改成调它；要多包一层的（写入检查、取权限）还留自己的包装，但不再各写一次 `as` |
| `inputSchemaFor<I>()(schema)` | 手写接口的公开合同 | 四样一起查，不符就编译失败，没有关掉的参数。接口和 schema 必须说同一个形状。工具本身返回 `ActionSchema`，不把 schema 字面量写进 `.d.ts` |
| `FlatUnion<U>` | 接口是判别联合、schema 是一个扁平对象的公开合同 | 把联合压平再交给 `inputSchemaFor`。键和字段类型由编译器管，哪些字段能一起出现仍归处理器。写在定义处，一眼看得出；不是联合时不起作用，放宽不了别的定义 |

| 查什么 | 拦下的是 | 不查它会怎样 |
| --- | --- | --- |
| 正向：schema 放进来的，接口都接得住 | 接口比 schema 严（schema 只写 `{ type: "object" }`，接口却有字段） | 处理器以为有的字段，运行时可能没有 |
| 严格：接口说能传的，schema 都放行 | 接口比 schema 宽（接口可选、schema 必填；接口有枚举里没有的值） | 调用方照接口写，运行时被拒 |
| 键：接口里每一层的键，schema 都认识（不含 `Record` 的值：`additionalProperties` 的值不往里走，两边多键都放行，现有写法只在 `memory.prefs.write`） | 接口多了键，含嵌套、数组元素和元组每一位里的；schema 只写 `{ type: "object" }`，接口却有名字的键，全可选也算 | 多的键不影响赋值，前两样都看不见。`Record<string, unknown>` 能赋给全可选的对象，所以 `{ a?: string }` 配 `{ type: "object" }` 前两样也放行，运行时 `a: 5` 照样进得来 |
| 反向键：schema 每一层的键，接口都有 | schema 多一个可选键，接口没有；接口是开放的 `Record`，schema 却写了名字的键也算 | 接口删了字段、schema 还留着：Agent 和 MCP 照 schema 传这个字段，处理器不读，什么也不报 |

```ts
type StrictTarget<T> = unknown extends T ? T
  : string extends keyof T ? (unknown extends T[keyof T] ? object : { readonly [K in keyof T]: StrictTarget<T[K]> })
  : { readonly [K in keyof T]: StrictTarget<T[K]> };
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type DeepExcess<I, T> =
  unknown extends T ? never
  : true extends IsUnion<NonNullable<T>> ? never
  : NonNullable<I> extends readonly unknown[] ? (NonNullable<T> extends readonly unknown[] ? ElementExcess<NonNullable<I>, NonNullable<T>> : never)
  : NonNullable<I> extends object ? (NonNullable<T> extends object
      ? (string extends keyof NonNullable<I> ? never : string extends keyof NonNullable<T> ? (unknown extends NonNullable<T>[string & keyof NonNullable<T>] ? keyof NonNullable<I> : never)
        : Exclude<keyof NonNullable<I>, keyof NonNullable<T>> | { [K in keyof NonNullable<I> & keyof NonNullable<T>]-?: DeepExcess<NonNullable<I>[K], NonNullable<T>[K]> }[keyof NonNullable<I> & keyof NonNullable<T>])
      : never)
  : never;
type ElementExcess<I extends readonly unknown[], T extends readonly unknown[]> = { [K in keyof I]-?: K extends keyof T ? DeepExcess<I[K], T[K]> : never }[number];
type InputMatches<I, S> = [InferActionInput<S>] extends [I]
  ? [I] extends [StrictTarget<InferActionInput<S>>]
    ? [DeepExcess<I, InferActionInput<S>>] extends [never]
      ? [DeepExcess<InferActionInput<S>, I>] extends [never] ? unknown : "schema 有接口没写的键"
      : "接口有 schema 不认识的键"
    : "接口比 schema 宽"
  : "schema 比接口松";
export const inputSchemaFor = <I>() => <const S extends ActionSchema>(schema: S & InputMatches<I, S>): ActionSchema => schema;

type AllKeys<U> = U extends unknown ? keyof U : never;
type ValueOf<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? U[K] : never) : never;
type IsRequired<U, K extends PropertyKey> = [U] extends [U extends unknown ? (K extends keyof U ? (Pick<U, K> extends Required<Pick<U, K>> ? U : never) : never) : never] ? true : false;
export type FlatUnion<U> = Expand<{ [K in AllKeys<U> as IsRequired<U, K> extends true ? K : never]: ValueOf<U, K> }
  & { [K in AllKeys<U> as IsRequired<U, K> extends true ? never : K]?: Exclude<ValueOf<U, K>, undefined> }>;
```

严格比较不能裸写 `I extends InferActionInput<S>`，有两种误报，要从 schema 这一边算：只读数组（接口写 `readonly string[]`，推出来是 `string[]`）和开放对象（`interface` 没有索引签名，赋不给 `Record<string, unknown>`）。裸写时 `memory.import`、`agent.run.start`、`agent.run.control` 都是这样误报的。把接口递归改成可写也不行：`ArtifactVersionRecord` 上报 TS2589，所以递归深度由 schema 决定，不由接口决定。键检查按位置走进元组；碰到联合分支就停；碰到开放形状时，接口也开放（`Record`、`object`）不报，接口有名字的键就报。反向键是同一个 `DeepExcess` 两边对调，范围相同。

**`FlatUnion` 的写法**：`input_schema: inputSchemaFor<[runtimeId: string, input: FlatUnion<AgentStartInput>]>()(…)`，定义的 `ActionDefinition<[runtimeId: string, input: AgentStartInput], …>` 不变，调用方和处理器还是拿联合。不做成工具自动压平：`oneOf` 写的 schema 推出来本身是联合，要照常逐支比；写在定义处，才看得出这一处的组合没有编译器管。

**量到的结果**（TS 5.9.3，用这份原型套真实合同，2026-11-06，#1790 合入后重量）：公开合同的 119 个定义全量过，112 个通过（其中 2 个包 `FlatUnion`），零误报。

| 过不了的 | 原因 | 去向 |
| --- | --- | --- |
| `memory.candidates.list`、`memory.changes.list`、`memory.pairs.list` | 接口宽：`scope` 接口含 `character`，schema 枚举没有。调用方只传 `project`、`personal`（`apps/local-host/src/memory/memory-host.ts:327-334`） | S0 收紧接口：`Exclude<MemoryScope, "character"> \| "all"` |
| `memory.change` | 接口宽：`expected_version` 接口可选，schema 必填。`MemoryChangeRequest` 也是内部方法的入参（`horizontal/memory/src/service.ts:525`），助理的「忘记」故意不带版本（`apps/local-host/src/assistant/assistant-memory-tools.ts:164`） | S0：不收紧 `MemoryChangeRequest`，动作单独写 `MemoryChangeRequest & { expected_version: number }`，「忘记」继续不带版本 |
| `memory.import` | 接口严：`package` 接口是 `MemoryExportPackage`，schema 只写了 `{ type: "object" }`。这是用户选的文件，`readPackage`（`horizontal/memory/src/shapes.ts:41`）逐条查，报「第 N 条损坏」「格式不认识」；写进 schema，这些话就变成通用的输入错误 | S0：schema 不动，接口改成 `package: object` |
| `git.inspect` | 判别联合配扁平对象，而且 `path` 没写 `items`。元素是不是字符串现在由 `parseFilePath`（`packages/contracts/src/modules/workspace-artifacts.ts:263`）查 | S0：`path` 加 `items`（只搬这条检查），再包 `FlatUnion` |
| `agent.session.create`、`agent.run.start` | 判别联合配扁平对象 | N22-03 直接包 `FlatUnion`，不用 S0 |
| `memory.prefs.write` | 判别联合，schema 有 `properties` 又有顶层 `oneOf`，推成 `unknown` | §4.4 名单，不包 |

共享帮手里，`artifact-pins` 的比较和继续、`file-sources` 的预览过不了（`artifact` 只写了 `{ type: "object" }`，接口是 `ArtifactVersionRecord`），进 §4.4 名单（理由在那里）。其余量过的都过。`work-executors`（7 个角色）、`action-scene-configuration`（3 个）和 `home-background-tasks` 没量，由 N22-02 包的时候编译器给结果，按 §5.1 走。

**零误报只说明没有错拦，查不出放行。**所以另量一次：给元组定义（当时数到 39 个，N22-01 重量是 43 个，带对象元素的都是 21 个）的每个对象元素加一个多余的可选键，看键检查报不报。带对象元素的 21 个全部报出（`ElementExcess` 之前只报出 3 个）。其余 22 个没有对象元素，加不了键。`FlatUnion` 同样量过：两个压平的定义加键被拒；小用例里键多、字段类型不符、判别值不符、schema 把某一支没有的键写成必填都被拒。反向键也量过：加上它 119 个的结果不变；再把接口里的可选键删掉，有可选键可删的 39 个全部报出，`AgentCollaborationControlInput`、`AgentRunControl` 是联合，到联合就停。

**05② C-1 新增的 9 个定义**（[#1894](https://github.com/molis-ai/molis-work/pull/1894)，先量 7 个，#1895 又加了 `map_source`、`unmap_source`）：`projects.directories.set_output`、`map_source` 是 `properties` 加顶层 `oneOf`，N22-01 上推成 `unknown`，包 `FlatUnion` 也过不了，要等 N22-02 的工具改动（§4.2），N22-03 重量；`unmap_source` 推得出，在调用处包。评审台在 #1909 的头上用真实工具重量：公开合同 130 个定义，120 个通过，原来没过的 8 个还是那 8 个。上面 119 和 112 是原型的数，真实工具算上帮手生成的定义是 121 和 113。

| 要改的 | 写法 |
| --- | --- |
| `project-materials.ts` 的 `text`、`positive` | `text` 改 `const` 泛型，`positive` 加 `as const` |
| `project-materials.ts` 的 `closed` | `const` 泛型，`required` 默认全部键，在返回处写一次 `as R`，不写 `as unknown as`（那个数字只许减少） |
| `MATERIAL_REF_SCHEMA` | 去掉 `ActionSchema` 注解。它进 API 快照，所以多一份快照 |
| `projects.ts` 的 `expectedRevision`、`folderPath`、`folderId` | 加 `as const` |
| `projects.ts` 的 `closedInput` | `const` 泛型，`Object.keys(properties)` 写成 `(keyof P & string)[]`，默认全部必填不变 |
| `directoryCommand` | **不用改。**它的 `input_schema: ActionSchema` 收的是 `inputSchemaFor` 的返回值，在调用处包就够：`add_input`、`remove_input`、`repair`、`unmap_source`，N22-02 之后 `set_output`、`map_source` 包 `FlatUnion` |

改完 `project-materials` 的 `.d.ts` 只有 `MATERIAL_REF_SCHEMA` 一行变化（展开成约 115 行字面量类型），`modules/projects` 的 `.d.ts` 没有差异，所以 `modules/projects.txt` 不动。`MATERIAL_ORIGIN_SCHEMA` 是输出 schema，不包工具，注解留着。两个动作组和两个导出 schema 的运行时值序列化后逐字节相同。放行也量了：`MATERIAL_REF_SCHEMA` 留着注解、或者 `pin` 的一支少一个必填键，`materials.recent.record` 都报错；硬包 `set_output` 也报错。

SDK 的 `defineAction` 加一个不写 `Input`、从 schema 推的重载。收口片（N22-Z）把手写写法收到只剩 `input: unknown`（schema 擦除的定义要有地方去，§9.2）：N35 阶段一不留第二种手写类型的写法。

### 4.4 两种写法，看输入类型归谁

| 情形 | 写法 | 为什么 |
| --- | --- | --- |
| 包内部的动作（插件、宿主动作、模块私有） | 从 schema **推导**，删掉手写的 `I` | 类型没有别的用处，一份事实 |
| 输入类型是公开合同的一部分（`packages/contracts/src/services/*`、`modules/*`、§8.2 N22-02 列的 `platform/*`，05② C-1 合入后共 130 个定义加 15 组共享帮手） | **留着手写接口**，schema 外面包 `inputSchemaFor<I>()`（用户 2026-11-06 定） | **这些是两份事实，由编译器钉住**，这是有意的例外。调用方在用这些接口的名字；改成推导类型会把 schema 字面量写进每个定义的 `.d.ts`，动 14 份 API 快照，和 05② 抢合同队列，TS7056 也要量。这个方案也动快照，是 5 份，差异只是字面量变窄（§8.2 N22-02、N22-03） |
| 公开合同，接口是判别联合，schema 是一个扁平对象（`agent.session.create`、`agent.run.start`；`git.inspect` S0 之后） | 留手写接口，`inputSchemaFor` 里写 `FlatUnion<I>` | 现在是扁平写法，改写法要动 schema 形状和动作快照，N22 不做。键和字段类型由编译器钉住，组合由处理器查 |
| 公开合同，`inputSchemaFor` 过不了，S0 也修不了或不该修（现在是定义 `memory.prefs.write`，帮手 `artifact-pins` 的比较和继续、`file-sources` 的预览） | **留手写接口，不包**，写在这里，每条带理由 | `memory.prefs.write`：N22-02 的工具改动之后，N22-03 用真实 schema 再试，过了就从这里拿掉（合审用简化的 `prefs` 没过，不算结论）；`set_output`、`map_source` 同样的写法，改工具后能包，不进这里（§4.2）。3 个 `artifact` 帮手：`ArtifactVersionRecord` 是平台自己产出的记录，`payload`、`metadata` 是递归的 JSON，schema 推不出来；硬写全再封口，记录以后多一个字段，这些动作就全部运行时报错，它们有 10 个文件在用。**已知风险**：这几个没有编译器钉住，接口和 schema 漂了没人报，靠现有用例。N22-03、S0 碰到新的同类就加进来 |
| 输入形状运行时才知道（`connector-mcp-actions.ts`、`external-mcp-actions.ts`、`plugin-builder/exposed-actions.ts`、`functions.published.*`） | `input: unknown`，不断言形状，原样转发 | 没有东西可推。名单写进收口片的记录 |
| Alchemist | **不迁**，核一遍就结束 | 它已经是一份事实：`operation.input.safeParse(input)`，处理函数拿到 `parsed.data`（`action-operations.ts:183-190`），没有手写检查可删。它是用户批过的例外，由 BL-377 重做。这是对「全部处理器」的解读，不是缩范围。**只有项目级操作是这样；** Home 级的两个操作是 `run(input)` 直接调（`:244`），靠 `:237` 一处 `as` 和 kernel 的校验，类型来自同一份 zod（`studio/shared/contracts/actions.ts:118`）。N22-Z 核的时候把这两个写进名单 |

### 4.5 字面量怎样保住（迁移写法）

`ActionSchema = Readonly<Record<string, unknown>>`（`actions.ts:33`）不改，留作上界。擦掉字面量的是「把 schema 先赋给标注了 `ActionSchema` 的变量」，所以：

- 各包的 `define<I, O>` 用 `const` 泛型接 schema。TS 不支持只推一部分泛型，要写成柯里化：`define<O>()("suffix", …, input_schema, …)`。
- 共享片段（`const text = { type: "string" }`）加 `as const`。`object()`、`array()`、`nullable()`、`choices()` 这类帮手改成 `const` 泛型。**这些都只改类型，值不变，动作快照哈希不变。**原型里 Todo 那套帮手（`object` 默认全部必填、`choices` 用 `map` 生成 `oneOf`）都推得出来，`choices` 要在返回处写一次类型。
- 合同包里导出的常量和帮手不一样，它们的类型在公开 API 快照里，加 `as const` 或改 `const` 泛型会改快照（§8.2 N22-02、N22-03）；插件和宿主里的不进快照。
- 数组推出来是可变数组：现有存储函数签名多是可变数组，这样少改很多。
- 推出来的类型和存储函数的入参对不上，就是真发现：要么 schema 太松（记进 S 清单），要么存储函数的类型太窄（当场改）。

### 4.6 类型检查的代价

实测（TS 5.9.3，本机）：2000 个 schema，每个 3～14 字段，321,778 次实例化，检查 1.26 s，内存 300 MB（空项目 58 MB）。`tooling/gates/actions/*.tsv` 全部 986 行是全仓动作数的上限，而且分散在各包，按此估全仓只读入口约 0.6 s 以内，单包更少。

`inputSchemaFor` 的四样检查套在 §4.3 那些定义上，合同包 38 万次实例化，检查 0.73 s，没有 TS2589（量的时候每个定义查了好几遍，算上限）。N22-01 按真实工具再量一次。

**#1909 合审实跑（TS 5.9.3）：** 22 个插件 manifest 里 582 个动作的真实输入 schema，按 T 片写法各写成一张导出的表：`.d.ts` 共 156,573 字节，最大的 Goals 41,454 字节，TS7056 的上限是 100 万字符，一个都没碰到；`inputSchemaFor` 24 层嵌套还过，32 层报 TS2589，真实输入最深 7 层；全部放一个程序 225,776 次实例化，464 ms。schema 取自 11-03 的构建，内联字面量，不含宿主注册的动作，也没量共享片段，所以 N22-04、T01、T05、T13 开工时还要量。

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
   - **公开合同过不了 `inputSchemaFor`**（N22-02、N22-03）：T 片不改 schema，也不改公开接口，这一处先不包，记进 S0 的清单，S0 改完再包上。接口是判别联合、schema 是扁平对象的，包 `FlatUnion`；还过不了的才进 §4.4 名单。不许放宽工具或加关掉的参数。
4. 不删任何运行时检查，不改错误码和文字。行为零变化。
5. PR 描述列出 S 清单和处理器里的重复检查。**两样都空，这个包的 S 片才取消。** 比如 T09 的 `as` 只有 3 处，手写检查有 28 处。

### 5.2 S 片：收约束

**规则：先补 schema 约束，再删重复检查，不能反过来**，否则中间有一段没人查。S 片要占快照队列。

1. 把 S 清单和处理器里的检查分成三类：schema 能表达的（必填、类型、`minItems`、`pattern`、长度、enum）、schema 不能表达的（跨字段、要读库）、已被别处保证的。
2. 第一类**且已被处理器执行**的，补进 schema。只搬已有的检查，不新增拒绝。新的收紧单独一个 PR，写明。
3. 确认这个处理器只经 kernel 调用（§5.3）。
4. 删掉第一类的检查和读值小函数；T 片留下的 `as` 也删掉。
5. `pnpm build`、`pnpm actions:update`，每个搬进去的约束配一个断言拒绝的用例（AIC-12）。

**一条检查能不能删，读 schema，不读类型**（[#1909 合审](https://github.com/molis-ai/molis-work/pull/1909#issuecomment-6705563344) 3.1）。这些情况类型会让检查看起来多余，其实不多余：

- `FlatUnion` 的定义。处理器拿到联合，`kind: "new"` 时类型说 `title` 是 `string`，schema 不保证。`agent.session.create`、`agent.run.start`、`git.inspect` 都是。
- §4.4 名单上的定义。接口没人钉，`artifact` 帮手的 schema 只有 `{ type: "object" }`。
- 「只取已知字段」的代码。类型不说有没有多的键，先看 schema 封口没有，否则多的键会进存储。顶层没封口的 8 个：`shelf.settings.write`、`shelf.results.copy`、`coding.sessions.update`、`coding.runs.start`、`coding.runs.control`、`coding.plans.save`、`coding.plans.confirm`、`coding.executor.run.control`；嵌套的对象节点还有 13 个，同样先看。
- `text.length` 搬成 `maxLength`。Ajv 按码点数，`maxLength: 1` 放行一个 emoji（`.length` 是 2），第 2 步的「只搬」在这里有差别，要写明。
- 注册的定义和绑定的定义不是一份时。kernel 校验注册的那份，只按 id、version 和处理器配对。

Jelly 的例子：`action-schema.ts:9` 的 `ids` 加 `minItems: 1`（`uniqueItems` 已有），`:40` 的 `text` 加 `pattern: "\\S"`，再删 `jelly/src/ai.ts:26` 的那一行。`:27` 起按选区核对块的部分要读库，留下。

### 5.3 S 片要逐条判断的三件事

- **绕过 kernel 的调用。** `apps/local-host/src/plugin-builder/exposed-actions.ts:137,140`、`computer/computer-record-source.ts:110,116` 直接 `handler.handle`。前者是转发，后者是内部调用，都没过 `validateActionInput`。迁到这些处理器前先核：这条路要么也校验，要么这个处理器的检查不能删。
- **错误码和文字会变。** 检查搬进 schema 后，错误从插件自己的码变成 `actions.input_invalid`，文字变成通用的。**用户在界面上能走到的检查不能这样搬**，要么页面先拦，要么留着：只有程序调用方才会碰到的检查才搬。逐条判断，PR 里列出来。所以「删重复检查」不会删到一个不剩，留下的每条在 PR 里写理由。
- **改哈希。** 补约束改输入 schema 的哈希。按 N35 在原版本改，不升版本。只搬已有检查，所以过去被处理器拒的输入现在被 schema 拒，已存的调用（工作流程步骤、固定引用）结果还是失败，只是错误码变了。每片 PR 写明对调用方的影响。

## 6. `normalizeProjectId`（N12 第 4 块）

5 份定义（`plugins/native/{dataset:377,form:389,lingguang:333,pages:382,ppt:248}/src/store.ts`），34 行调用（dataset 6、form 6、lingguang 8，其中 `:179` 一行两次共 9 次、pages 8、ppt 6）。每份都是 `trim`、空则抛、超 80 字符抛。逐类核实值的来源：

| 类 | 来源 | 可信吗 |
| --- | --- | --- |
| ① list、create、receive、openConversation 等的 `projectId` | 各插件 `project(caller)` = `caller.project_id`，空时已抛 `actions.project_required`（`dataset/actions.ts:67` 等；Form、PPT 的 `content-actions.ts` 写的是各自的 `invalid`，经内核调用到不了，调用方同样得 `actions.project_required`，见 AIC-14） | 可信，宿主给的 |
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

重复读值函数的现状（台账有出入）：`text` 读值型 38 个定义／21 个包；`optionalText` 10／5；`required` 真正读值的只有 `plugin-builder/agent-experience.ts:23`，其余是 `browser/dom.ts` 取元素（台账写 15）；`field` 8 个包（台账写 6）。`project(caller)` 小包装 12 份不算在 N22 里，其中 `form/src/content-actions.ts:32`、`ppt/src/content-actions.ts:57` 写的是各自的 `invalid`，只是两处写法不一致，调用方看不出差别（内核在处理器之前就拒），第 06 批顺手收；迁移时顺手收到 SDK 一个函数的话单独说明。

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

#1790、#1836、#1837 都已合入，这一条前置解除。「同时最多 3 个写手」把 N14 也算在内。写手一律子代理。

**第一段：工具和样板**

| 片 | 做什么 | 包（文件数） | 轨道 | 快照 | 档位 | 前置 |
| --- | --- | --- | --- | --- | --- | --- |
| N22-01 工具合同 | §4.2、§4.3，类型测试；除了正反用例，再跑一次 §4.3 加键的量法，零误报查不出放行 | contracts `platform/actions.ts`、SDK `actions.ts`（2） | C1 | `api/contracts/platform/actions.txt`、`api/contracts/platform/plugin.txt`（`platform/plugin.ts:18` 转出 `actions.js`）、`api/plugin-sdk/index.txt` | Opus 5.5 high，全量 | #1837（共用 `index.txt`）。**不等 05② C-1**，文件和快照都不重叠；和 05② C-2、U1-f、08 C-1 共用 `index.txt`，谁先准备好谁先，一前一后；`platform/plugin.txt` 按 §8.4 |
| N22-06 `normalizeProjectId` | §6 | Dataset、Form、Lingguang、Pages、PPT 的 `store.ts`（5） | E | 无 | Sonnet 5.5 high | **不依赖工具，也不等 #1837**：02 的 PR 没碰这五个 store（已查）。统筹可以最先开它 |
| N14 | §2、§3 | §3 | 无归属（kernel 按 C1），Feed 一个文件 E | `host-actions.tsv` 6 行 | Opus 5.5 high，全量 | **#1837**；定样（#1873，已合入）；E 轨预警 |
| N22-04 试点 Jelly | T＋S 同一个 PR，把两种片都走通，**定下写法样板**，量 §4.6 | Jelly（5） | E | `actions.tsv` | Opus 5.5 high | N22-01。**它通过之前，下面的 T 片不开** |
| N22-02 共享帮手 | **先带 §4.2 末尾的两处工具改动（合审实跑的 `set_output`、`map_source` 都是 `oneOf`，Goals 那两个是 `anyOf`，用例要带一个 `anyOf`），重量 130 个定义**；共享定义 `bind*` 改调工具，schema 包 `inputSchemaFor`。T 片 | contracts `platform/{artifact-pins,file-sources,placement,search-sources,workflow-content}.ts`、SDK `routes.ts`（6）；另有 10 个只有 `define*`、没有 `bind*` 的帮手，只包 schema：`platform/{action-fragments,action-offers,action-usages,action-subjects,home-events,home-background-tasks,due-reminders,work-executors,action-scene-configuration}.ts`、`services/connector-usages.ts`（共 16）。14 个导出的输入 schema 常量（`FILE_ENTRIES_INPUT_SCHEMA` 这些）加 `as const`，不包在常量定义处：包了导出类型变成 `ActionSchema`，同样改快照，还把字面量丢了。要加 `as const` 的比这 14 个多：它们嵌着的 `ACTION_REFERENCE_SCHEMA`（`platform/action-offers.ts`）、`ACTION_SUBJECT_SCHEMA`（`platform/actions.ts`）也要加，都在下面这几份快照里，不多占队列 | C1 | **改 3 份 API 快照**：`api/contracts/platform/actions.txt`、`platform/plugin.txt`、`services/connector-host.txt`。排 api 队列，过公共合同合审。差异只是字面量变窄，对调用方兼容：现有消费者都是展开读（`apps/local-host/src/{action-usage,home-event,home-offer}-actions.ts`）。动作快照不变 | Opus 5.5 high，全量 | N22-01；`platform/plugin.txt` 和 U1-f 不固定先后（§8.4） |
| N22-05 判断规则 | T＋S 同一个 PR：包小，N14 刚改过 | `modules/judgment-rules/src/{authoring-actions,actions}.ts`、宿主 `judgment-rules-actions.ts`（3） | 无归属 | `host-actions.tsv` | Opus 5.5 medium，全量 | **N14**（同一个文件）、N22-01、N22-02（`authoring-actions.ts:21` 展开 `ACTION_REFERENCE_SCHEMA`，常量还不是字面量时推出来是 `unknown`，容易误记成 schema 太松） |

**N14 和工具谁先：** 互不依赖，可以同时开。只有 N22-05 必须排在 N14 和 N22-02 后面。

**第二段：T 片（13 片，不占快照，可以 3 个写手同时做）**

| 片 | 包（文件数） | 动作行 | `as` 处数 | 轨道 | 档位 | 排序依据与要注意的 |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Goals（18） | 76 | 63 | E | Sonnet 5.5 xhigh | 最大，最先开。它的写法是 `Input<"submitGoalTreeProposal">`，类型来自应用层接口，方向和别的包相反：推出来的类型要能赋给接口。排在 N22-02 之后：`goal-tree-action-schemas.ts:18` 的 `payload` 工具改之前推成 `unknown`，读字段编译报错，T 片又不许改 schema |
| T02 | Feed（9） | 48 | 12 | E | Sonnet 5.5 high | |
| T03 | Todo、Schedule（9） | 44 | 12 | E | Sonnet 5.5 high | Schedule 的 `bind` 包了写入检查。排在 N22-02 之后：`todo.changes.revert`、`todo.items.link` 同时有 `properties` 和顶层 `anyOf`、`oneOf`，工具改之前推成 `unknown` |
| T04 | Pages、PPT、Form（9） | 96 | 7 | E | Sonnet 5.5 high | |
| T05 | Dataset、Lingguang、Cognia、Images（8） | 86 | 11 | E | Sonnet 5.5 high | 排在 N22-02 之后：`cognia.knowledge.synthesize` 同上 |
| T06 | Shelf、Workflows（5） | 49＋27（宿主表） | 8 | E | Sonnet 5.5 high | Workflows 的 `bind` 包了权限 |
| T07 | Inbox、Issues、Text Stats（3） | 29 | 13 | E | Sonnet 5.5 high | |
| T08 | Coding（5） | 28 | 1 | B | Sonnet 5.5 high | 和 #1851（文案）撞文件的话 rebase |
| T09 | Git、Diff、Files（3） | 18 | 3 | B | Sonnet 5.5 high | 手写检查最多（28 处），S 片才动。Git、Files 的 schema 用 `workspace-action-schemas` 的帮手，排在 N22-03 之后才推得出字面量 |
| T10 | 宿主 `assistant/`（3） | - | 9 | A | Sonnet 5.5 high | 和 #1870 共用 `assistant-rule-actions.ts`，等它合入。A 轨预警 |
| T11 | 宿主其余（11） | 约 60 | 52 | 无归属 | Sonnet 5.5 xhigh | `home-actions.ts` 等，规则 4 的热文件不碰。排在 N22-02 之后：`action-usage-actions.ts:10`、`home-event-actions.ts:15`、`home-offer-actions.ts:21`、`home-actions.ts:26` 直接用合同常量，理由同 N22-05 |
| T12 | 连接器与模型（17） | 29＋ | 31 | 无归属 | Sonnet 5.5 xhigh | 第 13 批正在这里写，**排在 T 片最后**，也就在 N22-02 之后（`connector-usage-actions.ts:8` 直接用合同常量）。动态 schema 的两个文件照 §4.4 |
| T13 | `modules/{artifacts,characters}`、宿主 `memory/`、`computer/`、`plugin-builder/`（8） | 56＋ | 13 | 无归属 | Sonnet 5.5 high，全量 | `modules` 是共享核心。`plugin-builder` 走 §5.3 |

还有一片和上面同等地位、但要排合同队列：

| 片 | 包（文件数） | 轨道 | 档位 | 前置 |
| --- | --- | --- | --- | --- |
| N22-03 合同服务动作 | `services/{agent-host,memory,placement,knowledge,search,agent-task-grants,agent-collaboration,agent-inputs,agent-host-write-checkers,agent-host-offers}.ts`、`modules/{projects,workspace-artifacts,workspace-writers,characters}.ts`（14，05② C-1 合入后 130 个定义，排在 N22-02 之后）；`modules/workspace-action-schemas.ts` 的 `object`、`nullable` 改 `const` 泛型，其余常量（`text`、`id`、`path` 这些）加 `as const`，都在同一份快照里；`platform/project-materials.ts` 的 `MATERIAL_REF_SCHEMA` 和它的私有帮手按 §4.3 改（共 16）。`plugins/native/{files,git}` 也在用这份帮手，要一起编译过，B 轨预警；`local-host.ts` 那一处 `as` 改调工具 | C1 | Opus 5.5 high，全量 | N22-01；**排在 05② C-1 之后**（C-1 改 `modules/projects`）。**改 2 份 API 快照**：`api/contracts/modules/workspace-action-schemas.txt`、`api/contracts/platform/project-materials.txt`（`modules/projects.txt` 量过不变），排 api 队列，过公共合同合审。差异只是字面量变窄，对调用方兼容，值不变，动作快照不变 |

**第三段：S 片（按改哪份快照串行，每片一个 PR）**

| 片 | 包 | 轨道 | 快照 | 档位 | 前置 |
| --- | --- | --- | --- | --- | --- |
| S0 合同里的共享 schema 与接口（清单空就取消） | 工具报出、N22-02、N22-03 记下的（已知 6 个定义，§4.3）。接口宽的收紧接口，调用方照接口写的本来就被拒，行为不变，报错的调用方当场改；schema 松的把字段写全，只搬已有检查，写不全就进 §4.4 名单。**例外：用户选的文件和平台自己产出的记录，先看该不该写全**：写进 schema，处理器具体的错误话会变成通用的输入错误（`memory.import`）；封口之后记录多一个字段就运行时报错（`artifact` 帮手） | C1 | 两份都占，可能还有 api | Opus 5.5 high，全量 | 这两片之后；占两份，这一轮别的 S 片让开 |
| S1 | Goals | E | `actions.tsv` | Opus 5.5 medium | T01 |
| S2 | Feed、Inbox、Issues | E | `actions.tsv` | Opus 5.5 medium | T02、T07 |
| S3 | Todo、Schedule、Workflows | E | `actions.tsv` | Opus 5.5 medium | T03、T06 |
| S4 | Pages、PPT、Form、Dataset、Lingguang | E | `actions.tsv` | Opus 5.5 medium | T04、T05 |
| S5 | Git、Diff、Files、Coding | B | `actions.tsv` | Opus 5.5 medium | T08、T09 |
| S6 | Shelf、Cognia、Images、Text Stats | E | 两份都占（Shelf 两边都有） | Opus 5.5 medium | T05、T06、T07 |
| S7 | 宿主其余、`assistant/` | 无归属，A 预警 | `host-actions.tsv` | Opus 5.5 medium | T10、T11 |
| S8 | 连接器与模型 | 无归属 | `host-actions.tsv` | Opus 5.5 medium | T12 |
| S9 | `modules/*`、`memory/`、`computer/`、`plugin-builder/` | 无归属 | `host-actions.tsv` | Opus 5.5 medium，全量 | T13 |

**第四段：收口**

| 片 | 做什么 | 轨道 | 档位 | 前置 |
| --- | --- | --- | --- | --- |
| N22-Z 收口 | 全仓再找一遍（其他批新加的处理器）；把 `defineAction` 的手写写法收到只剩 `input: unknown`（§9.2；改 `api/plugin-sdk/index.txt`，排 api 队列，过公共合同合审）；`examples/probe-plugin`、`examples/personal-sync-plugin`（`plugin.ts:57-58`，#1877 新增，用 `bindOwnerPluginAction`，处理器里 2 处 `_input as {...}`）、`skills/molis-plugin-dev`（全量回归期间不能改 `skills/`）；`tooling/plugin-cli` 的模板是 JS，定义从 manifest 取，不用改；核 Alchemist（项目级与 Home 级两种，§4.4）；动态 schema 名单写进这份 spec | C1 | Opus 5.5 high，全量 | 全部 T、S |
| N22-G 防回潮门禁 | §9.2 的绝对门禁，带变异用例，一个小 PR。用户 2026-11-06 已同意改门禁；定义处多查的那一项用户 2026-11-07 同意 | 无归属 | Opus 5.5 high | N22-Z |

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

1. **T 片不动 schema 的值，快照就不变**，这是门禁能证明的（§5.1），不是约定。而 T 片不碰别的快照：`tooling/gates/api/` 只收 contracts 和 SDK，插件包不进。N22-02、N22-03 在 contracts 里，是例外，写在 §8.2。
2. **T 片碰到 schema 太松不算卡住**：`as` 留着记进清单，留给 S 片。合并前行为零变化，所以中间任何时候停下来都是干净的状态。

分不开的地方：**同一个包不能两片同时做**（同一批文件）。S 片必须排在本包 T 片之后，因为 T 片的编译报错就是 S 清单的来源。

### 8.4 快照怎么排队

**不是每包一份。** `tooling/gates/actions/` 一共 4 个文件：

| 文件 | 行数 | 里面是 | N22 碰吗 |
| --- | --- | --- | --- |
| `actions.tsv` | 588 | 22 个插件 Manifest 声明的动作，按提供方连续排 | S1～S6、N22-04 |
| `host-actions.tsv` | 367 | `platform` 58、`sdk.artifacts.*` 128、`system.*`、Characters、Artifacts、Shelf 27 | S0、S6～S9、N14、N22-05 |
| `scenes.tsv`、`host-scenes.tsv` | 8、7 | 消费场景 | 不碰 |

**规则（轨道规则 1、4）：同一份快照同一时间一个写手。** 所以：

- **`actions.tsv` 一路、`host-actions.tsv` 一路，可以同时走**，互不等。
- **S0 和 S6 不能和任何 S 片并行**（两份都占）。T 片不受影响。
- T 片、N22-01～03、N22-06 不进这两路。N22-02、N22-03 的 schema 值不变，动作快照有差异就是判断错了，停下来。
- 和别的片抢 `host-actions.tsv` 的：N14、U1-f。排序看谁先准备好，不互相等；05② C-1 只声明动作，不改这份快照。

**公开 API 快照另走 api 队列**（`tooling/gates/api/`，和上面两路无关）。N22-01、N22-02、N22-03、N22-Z 和 S0 进这个队列。`platform/plugin.txt` 上 N22-01、N22-02 和 U1-f 不固定先后，同一时间一个 PR，谁先准备好谁先（统筹 11-07 定，N22-02 本来就在 N22-01 之后）。它们只共用生成的快照，没有语义依赖；U1-f 前面还隔着 U1-a～c，不让 N22-05、T11 跟着等。05② 的 C-2、C-3 还早，不为它们预留，到时按开工先后排队。

快照行互相独立，改不同提供方的行 git 能自动合。所以如果 S 段成了最慢的一段，统筹可以按**规则 4 合成批 PR**：两三个 S 片在一个集成分支上合、一次刷新快照。这是统筹的调度手段，不用改规矩。

### 8.5 排程：三个写手怎样排满

用「轮」计数：一轮是一个写手从开工到合入。这里不估天数，真正的上限是整台机器一次一个构建（`PARALLEL-DEVELOPMENT.md` 第 5 节）。

| 轮 | 写手一 | 写手二 | 写手三 |
| --- | --- | --- | --- |
| 1 | N22-01 | N22-06 | N14 |
| 2 | N22-04 试点 | N22-02 | |
| 3 | N22-03 | N22-05 | T01 |
| 4 | T10 | T11 | S1 |
| 5 | T03 | T04 | S0 |
| 6 | T05 | T06 | S7 |
| 7 | T07 | T13 | S3 |
| 8 | T02 | S9 | S4 |
| 9 | T08 | T09 | S6 |
| 10 | T12 | S5 | |
| 11 | S8 | S2 | |
| 12 | N22-Z | | |

这是一个排得下的例子，不是死规定：约 12 轮，31 片（含 N14），收口之后再加一个门禁小 PR（N22-G）。05② C-1 没合入时 N22-03 往后挪，空位给下一个 T 片；U1-f 正占着 `platform/plugin.txt` 时 N22-02 等它这一个 PR；S0 没有内容时那一轮给 T 片。第 2 轮有空位，因为 N22-03 排在 N22-02 之后，T 片要等试点通过；最后三轮有空位，因为只剩快照串行的片和收口。**清单为空的 S 片取消后，总轮数还能少。**

**尽量缩短的办法，都已经写进上面了：**

1. T 片和 S 片分开（§8.3）。
2. 工具不等 05② C-1，只等 #1837。
3. `normalizeProjectId` 不等工具也不等 #1837，可以最先开。
4. 两份快照分两路走。
5. 小包合并；S 清单为空就取消。
6. 试点通过之前不扇出：只损失一轮，却防住「全部 T 片按错误写法做完」这种最贵的返工。

**还有一个杠杆，现在不用：** T 片全部合入后，处理器已经全部有类型，S 片只在已有包内收约束，所以可以在 T 段结束时放行第 06 批里不碰这些包的项。这改的是「按批推进」的规矩，本方案不假定它；统筹定了先不问，等排程实际卡住再提。

### 8.6 和在途 PR 怎样避让

截至 main `7f960b38b` 查到的真实重叠（处理器文件）：

| 在途 | 重叠 | 办法 |
| --- | --- | --- |
| #1837（02） | 已合入，不再是前置 | — |
| #1870（13） | `assistant-rule-actions.ts`、`connector-call-observation.ts` | T10、T12 等它合入 |
| #1865、#1858、#1817（13） | 不碰处理器文件，但在连接器区域施工 | T12 排在 T 片最后；开工时重查 |
| #1851（10） | Coding、Diff、Git、Schedule 的其他文件 | 无重叠，碰上了后到的 rebase |
| #1869（18，已合入） | `platform/plugin.ts`、快照 `platform/plugin.txt` | N22-01 不改这个文件，但它转出 `actions.js`，快照共用。以后动这个文件的 PR 同样按 §8.4 一前一后 |
| 05② C-1 | `modules/projects`、`platform/project-materials`，快照 `api/contracts/modules/projects.txt`、`api/contracts/platform/project-materials.txt`、`api/plugin-sdk/presentation.txt` | N22-03 排在它后面，并改其中的 `platform/project-materials.txt` |
| 05② C-2、U1-f、08 C-1 | `api/plugin-sdk/index.txt` | 和 N22-01 一前一后 |
| U1-f | `api/contracts/platform/plugin.txt` | 和 N22-01、N22-02 不固定先后，谁先准备好谁先（§8.4） |

每片开工前重查一次（把路径换成这片的文件）。下面的命令每个 PR 只回前 100 个文件，碰到大 PR 要用 `gh api --paginate repos/molis-ai/molis-work/pulls/<号>/files`：

```bash
gh pr list --state open --json number,title,files --jq '.[] | select(any(.files[]; .path == "plugins/native/goals/src/actions.ts")) | "#\(.number) \(.title)"'
```

**别的批新加的处理器**：N22-01 合入后通知在跑的批，新处理器直接用 `bindActionHandler` 和推导写法；来不及的由 N22-Z 兜住。

**第 06 批**：不会同时改代码（§7）。

### 8.7 一片做完的标准

T 片：`pnpm --filter <包> run build` 通过；`pnpm actions:update` 无差异；`pnpm api:update` 无差异（N22-02、N22-03 除外：只许改 §8.2 写明的快照，差异只是字面量变窄）；`node scripts/affected-tests.mjs` 选的用例通过；PR 带 S 清单。

S 片：再加每个约束一个拒绝用例，PR 列出留下的检查和理由、对调用方的影响。

## 9. N22 范围（用户 2026-11-06 定）

### 9.1 一次迁完

**全部处理器迁到推导类型，补约束，删重复检查。** 合同台原来推荐的是工具加试点（A），用户选了 B。否掉的是 A 和「全量只换类型」（C）。代价用户知道：跨 A、B、C1、E 约 30 片，第 06 批之后的实现要等它。**不降级。**

**一个用户定的例外（2026-11-06）：** 119 个公开合同定义（05② C-1 合入后 130 个，算上帮手生成的）和 15 组共享帮手留手写接口，证明加反向（§4.3、§4.4）。处理器这一半照样没有 `as`，编译时对照；这些是两份事实，由编译器钉住，钉不住的写进 §4.4 名单。否掉的是全部推导：动 14 份 API 快照、抢合同队列、TS7056 风险。这个方案也动 5 份（当时 4 份，05② C-1 多出 `platform/project-materials.txt`），差异只是字面量变窄。

### 9.2 防止回潮：一条绝对门禁（用户 2026-11-06 定）

原来那条「`input as` 只许减少」是工具加试点方案的配套，用来容忍两种写法并存。一次迁完之后没有存量要容忍，**不留它**。但类型本身挡不住回潮：`ActionHandlerBinding.handle` 的 `input` 还是 `unknown`，谁都能再写一句 `input as X`。

**N22-Z 之后单独一个小 PR（N22-G）开：处理器的输入参数上不许有 `as`。**

- 查什么：`handle` 的第二个参数，以及传给 `bindActionHandler`、`bindOwnerPluginAction` 的函数的输入参数（`examples/personal-sync-plugin/plugin.ts:57-58` 的 `_input as` 就在那里）。用 Biome 的 grit 规则（`tooling/gates/lint/`）或一个小 AST 脚本，N22-G 按实际能查准的选。
- 基线为 0，不用「只许减少」的账本，出现一个就失败。
- 例外只有 `bindActionHandler` 那一处和 §4.4 的动态 schema，名单写在门禁里，每条带理由。
- 测试不查。
- **手写一份和 schema 对不上的 `I`，N22-G 多查一项来挡（统筹 2026-11-07 提出，用户同日同意）：** `createActionDefinition` 的第一个类型参数只能是 `InferActionInput<…>`，定义处也不许标 `ActionDefinition<X, …>`，合同包、SDK 自己（`packages/plugin-sdk/src/actions.ts`）和 §4.4 名单除外。`assistant-executor.ts:77` 这种按调用表取输入类型的写法，N22-G 开时核。原来写的「删 `defineAction` 的手写重载」挡不住：处理器走 `bindActionHandler`，不经过 `defineAction`，合审实跑 `createActionDefinition<错的, O>` 配 `bindActionHandler` 能编译。
- `defineAction` 的手写重载不整个删，留 `input: unknown` 的写法，schema 擦除的定义（比如 TS 作者读 manifest）要有地方去。

否掉两个方案（决策记录 §11）：不加门禁，只靠写法和评审，几个月后会慢慢长回来；类型上封死（品牌类型），测试里 189 个文件、475 处 `handle:` 都要跟着改，量顶得上好几个 T 片。门禁在最后一片之后才开，不影响分片和排程。

**已知风险：新定义不包工具，没有门禁拦（统筹 11-06 定不加）。** 这条门禁不查公开合同的定义包没包 `inputSchemaFor`。新写一个定义不包，能编译也能合入，接口和 schema 漂了没人报。失败方式和今天一样，不比迁移前差；靠公共合同队列的合审、文件里全是包好的写法，和 N22-Z 那一次全仓核对（AIC-18）。风险是真的：这 119 个里查出 4 个真漂移，10-01 以来 20 个提交动过这种定义，最近的是 11-05 的 `agent.task_grants`。

## 10. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。版本字段的语义归动作合同；`updated_at` 归 `modules/judgment-rules` |
| 2 | 插件同等待遇 | 过：N14 删掉内核给一个提供方的分支；N22 的工具在 SDK，内置和外部同一份 |
| 3 | 能力注册 | 不新增动作。可信身份不变（项目 id 取自调用上下文，§6 正是核实这一点）；预览是 `concurrent`，保持 |
| 4 | 合同 | N14 改 6 个动作输入和 `updated_at` 的语义，`functions.authoring.get` 对插件打开（`host-actions.tsv` 多变一行，§2.7），都在原版本上改（N35），一个 PR 改完所有消费者；N22-01 加公开类型和两个函数，单独排合同队列；T 片不改公开 API 和动作快照，N22-02、N22-03 例外：改 5 份 API 快照，差异只是字面量变窄，排 api 队列；S 片只改 schema 约束 |
| 5 | 放在哪个包 | 类型和两个小函数在 contracts（`bindActionHandler`、`inputSchemaFor` 都不到 20 行，无副作用），SDK 只依赖 contracts，不加第三方（§4.1） |
| 6 | 表与存储 | 不改表。`updated_at` 语义收窄，存量值继续有效，不用升级 |
| 7 | 兼容与迁移 | 不加。旧字段名直接拒绝 |
| 8 | 安全边界 | 不改表。N14 收紧（缺版本拒绝）；§6 的放宽（81～120 字符）已写明，项目 id 仍来自可信上下文。`SECURITY-INVARIANTS.md` 没有登记版本前提这一条（查过 `version_required`），不需要新行 |
| 9 | 调用次数 | N14 预览少一次无效的模型调用；无变化的保存不写库；只有收到冲突才多 `get`：判断一次，用户点「载入最新版」再一次。N22 只有类型，运行时不变，删检查略省 |
| 10 | 升级与数据 | 库不变。MCP 客户端和已存的固定调用：字段名变了，按现行 schema 明确失败，升级须知写一条。S 片补约束不改取值范围之外的行为，只改错误码（§5.3） |
| 11 | 成果与过程项 | 不涉及 |
| 12 | 页面与外壳 | 「载入最新版」是新状态，用户选了方案 A，定样 PR 另开，组件板新增走 D 轨；不加 DOM 事件。页面资源：工作台和 Feed 有增长，一个资源涨超过 10 KB 先问用户（`AGENTS.md`） |
| 13 | 错误 | `functions.draft_stale`、`functions.sample_not_found` 用 `defineErrorCodes` 声明 |
| 14 | 冲突面 | 见 §8.4、§8.6。枢纽 `actions.tsv`、`host-actions.tsv`；跨 A、B、C1、E 和不归轨道的宿主文件；F 轨 `CHANGELOG.md`；N22-01、N22-02、N22-03 走公共合同队列 |

## 11. 决策记录

| 日期 | 定了什么 | 否掉的 | 理由 |
| --- | --- | --- | --- |
| 2026-11-06 | `expected_updated_at` 必填、非空，不留 `null` | 留 `null` 表示从未保存 | 没有 create 就没有 id，从未保存在这一层不存在 |
| 2026-11-06 | HTTP 体字段同样改名 | 体里留 `updated_at`，路由层翻译 | 不留第二个名（N35） |
| 2026-11-06 | 新错误码 `functions.draft_stale`，`functions.conflict` 留给「用途变了」 | 共用一个码 | 两者出路不同，前端要靠码分 |
| 2026-11-06 | 预览先比版本再调模型 | 只在保存时比 | 过期的预览不该花模型钱 |
| 2026-11-06 | 载入最新版不加新动作，用 `functions.authoring.get` | `draft_stale` 的 `details` 带回最新记录 | 错误里不回显内容；`get` 已有 |
| 2026-11-06 | **「载入最新版」的样子用方案 A 就地接住**（用户定）：底部提示加一个按钮，只有两边都改的字段摆出你写的，可放回、可换回；不提供一键覆盖 | B 对比后决定、C 拦下来问 | 定样 PR 记录；合同上的要求见 §2.7 |
| 2026-11-06 | N14 定样的取舍以路线书第 05 批记录为准（`reference/batches/05.md` 的 `batch-05-n14-sample`，随 #1873 合入），这里不重复 | - | 批次文件是定样的出处，本稿只写合同这一半 |
| 2026-11-06 | **`updated_at` 只代表定义内容**：试跑、样例、发布、无变化的保存都不推它 | 另加内容版本列；照旧推、让页面重读比较 | 不改表、不等 U1；所有调用方一起受益。`functions-store-versions.test.ts` 的旧断言是这条合同，要改 |
| 2026-11-06 | **发布时读到的版本和已发布的不同，报 `published_immutable`**，相同才幂等成功 | 一律幂等成功；输出加 `already_published` 字段 | 版本不同说明调用方没读过这次发布的内容，不能当成功；发布不推版本之后，这个判断不用加列 |
| 2026-11-06 | 新错误码 `functions.sample_not_found` | 和规则不在共用 `not_found` | 页面只看码就要分清「规则没了」和「样例没了」，后者不该提示 |
| 2026-11-06 | 「存成新规则」用 `create` 加 `update`，不传原 key，不带样例和试跑结果 | 新动作、原子的 `create` | 不加动作；已发布的规则还占着原 key；新规则内容没人试过 |
| 2026-11-06 | 不加第三方类型依赖 | `json-schema-to-ts` | 外部作者只装两个包 |
| 2026-11-07 | **`etag`、`expected_content_hash`、`expectedEtag`、`expected_input_revision` 不进 `VERSION_FIELDS`，`functions` 也不照 etag 做**（合同台定） | 全部统一成一个字段；`functions` 加内容指纹 | §1 末段。不同的字段表达不同的东西；`updated_at` 只代表定义内容之后不需要指纹 |
| 2026-11-06 | 80 字符上限删掉不搬 | 搬到 SDK | 和放置 schema 的 120 不一致，谁都不是主人 |
| 2026-11-06 | **N22 一次迁完**（用户 2026-11-06 定） | 工具加试点、全量只换类型 | 代价是约 30 片、第 06 批之后等它，用户知道 |
| 2026-11-06 | 拆成 T 片和 S 片，T 片不动 schema 值、不占快照 | 每包一个 PR 两件一起做 | §8.3 |
| 2026-11-06 | **公开合同的 119 个定义和 15 组共享帮手留手写接口，证明加反向**（用户定）：`inputSchemaFor` 加反向检查；接口宽于枚举的情形收紧接口，记进 S0；这些是两份事实，由编译器钉住 | 全部推导（`export type X = InferActionInput<typeof schema>`）；只查一个方向 | 全部推导要动 14 份 API 快照、和 05② 抢合同队列，还有 TS7056 风险；这个方案也动 4 份（N22-02、N22-03），差异只是字面量变窄。只查一个方向时，接口多键、接口宽于枚举都能编译通过，调用方照接口写、运行时被拒 |
| 2026-11-06 | **严格比较和递归键检查进 `inputSchemaFor`，没有关掉的参数**；数组的三种定长写法都推成元组；键检查按位置走进元组，开放 schema 配有名字的接口要报，`required` 不是字面量不当必填；过不了的先不包，记进 S0 | 只顶层键加一次性严格比较 | 一次性比较挡不住以后的漂移。套到真实合同上，`memory.change` 等 4 个真漂移只有严格比较查得到；放进工具后 119 个定义零误报。工具本身不改 `.d.ts`，它要吃字面量，所以 N22-02、N22-03 改 4 份快照，少于全部推导的 14 份，不改变用户定的「留手写，证明加反向」 |
| 2026-11-06 | **加 `FlatUnion`，判别联合配扁平 schema 压平再比，写在定义处**（合同台定）。`agent.session.create`、`agent.run.start` 由此钉住，`git.inspect` 在 S0 后钉住 | 这几个全进名单；工具自动压平 | `agent-host-start.ts` 10-01 以来改了 8 次，最容易漂的就是这两个。同一个工具，不加开关。不自动压平：`oneOf` 写的 schema 要逐支比，放在定义处才看得出组合归处理器 |
| 2026-11-06 | `memory.change` 不收紧 `MemoryChangeRequest`，动作单独写交叉类型；`memory.import` 改接口，schema 不动；3 个 `artifact` 帮手进名单，不写全 | 收紧 `MemoryChangeRequest`；把 `package` 和 `artifact` 写全并封口 | 助理的「忘记」故意不带版本；用户选的文件要处理器说具体的错；平台产出的记录封口之后多一个字段就运行时报错，而且 `payload` 是递归 JSON，推不出来 |
| 2026-11-07 | `platform/plugin.txt` 上 N22-01、N22-02 和 U1-f 不固定先后，同一时间一个 PR，谁先准备好谁先；05② C-2、C-3 不预留（统筹定，取代 11-06 的「U1-f 先」） | U1-f 先、N22-02 在它合入之后；为 05② 预留 | 只共用生成的快照，没有语义依赖；U1-f 前面还隔着 U1-a～c，N22-02 跟着等的话 N22-05、T11 也要等。§8.4 |
| 2026-11-07 | **`inputSchemaFor` 加反向键**：schema 多一个可选键、接口没有也报（合同台定） | 只查接口这一边的键 | §4.3 写的就是两边说同一个形状；接口删了字段、schema 还留着时，调用方照 schema 传，处理器不读，什么也不报。量过：119 个结果不变 |
| 2026-11-07 | **`properties` 加顶层 `oneOf`、`anyOf` 改工具，由 N22-02 带**（统筹定）：同层关键字都要满足，只读 `properties`；8 个动作不改写法，`set_output`、`map_source` 不进 §4.4 名单 | 进名单（合同台 11-07 的决定，当时否掉的只是「改写法」，没比较过这条路）；独立小 PR | 进名单就没有编译器钉住，刚写完的最容易漂，还和 §5.1「T 片不动 schema」矛盾。N22-02 本来就占这两份快照，不多开一个合同 PR。#1909 合审 2.1 |
| 2026-11-07 | **手写 `I` 由 N22-G 多查一项来挡**（统筹定） | `createActionDefinition` 改 `<O>()(…)` | 改 `plugin-sdk/index.txt` 要过合同队列，41 个文件和 13 个 T 片都要多改一处，还要给 §4.4 名单另开入口。门禁不动 SDK 公开面。外部作者手写 `I` 只影响他们自己。#1909 合审 2.2 |
| 2026-11-07 | **N22-01 的工具放新文件 `platform/action-input.ts`；SDK `objectSchema`、`arraySchema`、`nullableSchema` 改 `const` 泛型并进这片**（统筹定） | 放 `actions.ts`；帮手留给 T 片 | `actions.ts` 会到 849 行，过文件上限。帮手不改，用它们的 35 个文件推不出类型，包括试点 Jelly。值不变，`plugin-sdk/index.txt` 的差异写在 #1909 |
| 2026-11-07 | **05② C-1 的 7 个定义并进 N22-03**（合同台定）：6 个包工具，`projects.directories.set_output` 进 §4.4 名单（后被「`properties` 加顶层 `oneOf`、`anyOf` 改工具」那一行取代）；`directoryCommand` 不改，调用处包；多一份快照 `platform/project-materials.txt` | `set_output` 改写法；`MATERIAL_REF_SCHEMA` 留注解，`materials.recent.record` 进名单 | 改写法要动 schema 形状和动作快照，N22 不做；留注解的话引用的形状没有编译器钉住，这个形状是各插件共用的。§4.3 |
| 2026-11-06 | 新定义不包工具不加门禁（统筹定），写明已知风险 | 再加一条门禁 | 失败方式和今天一样，不比迁移前差；§9.2 |
| 2026-11-06 | **`functions.authoring.get` 对插件打开，Feed 声明消费** | Feed 用 `list` 再按 id 找 | `list` 已开放且返回全部记录，没有多放开什么；不打开 Feed 载入不了最新版 |
| 2026-11-06 | Alchemist 不迁，核一遍；动态 schema 留 `unknown` | 硬迁 | Alchemist 的类型已来自同一份 zod（项目级拿解析后的值，Home 级两个操作靠一处 `as` 和 kernel 校验），且是用户批过的例外（BL-377）；动态的没有东西可推 |
| 2026-11-06 | `input as` 只许减少的门禁不做 | 留作过渡 | 那是工具加试点方案的配套；一次迁完没有存量要容忍 |
| 2026-11-06 | **防回潮用一条绝对门禁**（用户定）：N22-Z 之后单独一个小 PR，处理器的输入参数上不许有 `as`，基线为 0，例外写明理由，测试不查 | 不加门禁；品牌类型封死 | §9.2。不加门禁成果会被慢慢磨掉；品牌类型要改 189 个测试文件 |

## 12. 验收

| 编号 | 证明 |
| --- | --- |
| AIC-01 | 6 个动作缺 `expected_updated_at`：Agent、MCP 得 `actions.version_required`，页面得 `actions.input_invalid`；记录不变 |
| AIC-02 | 传 `null`、空串：被拒，记录不变 |
| AIC-03 | 传旧值：`functions.draft_stale`（HTTP 409），`details` 只有 `id`，记录不变 |
| AIC-04 | 发布不带版本被拒；已发布的记录传发布的那一版：幂等返回；传更早的版本：`functions.published_immutable`，记录不变；过期的发布不先报「还没试跑」 |
| AIC-05 | 预览传旧值：不调模型（假模型计数 0）；调用期间被别人改了内容：`savePreview` 得 `draft_stale`，不写 |
| AIC-06 | 内核里没有能力名字面量：`version-precondition.ts` 不再读 `capability_id` |
| AIC-07 | 工作台连续保存两次都成功（第二次用第一次响应的版本）；两个页面同时改，后保存的得 `draft_stale`，未保存的输入还在，载入最新版后拿到新内容；别处只试跑或只加样例，这边保存成功，不出提示；别处删除后，未保存的输入还看得到，并有说明（界面断言按定样补；前两种情形的合同半见 AIC-09，删除的合同半见 AIC-15） |
| AIC-08 | Feed：`draft_stale` 后存的旧版本作废，下一次提交用新版本成功；载入后要求重新预览；已发布后走重建草稿，新草稿不撞 key；Feed 走通 `functions.authoring.get`（`audiences` 含 `plugin`，Manifest 已声明，不报 `actions.forbidden`） |
| AIC-09 | 试跑、加样例、删样例、发布、规整后无变化的保存，都不改 `updated_at`；定义字段真的变了才改。别处点一下试跑（含它先存一遍），这边的保存照常成功，不提示。列表顺序：发布顶到前面，试跑不动；排序只精确到秒，同一秒里的先后沿用现状。`tests/functions-store-versions.test.ts`：update、addSample、removeSample、preview、publish 五种拒绝都留，旧版本改由定义写入造出来，错误码是 `draft_stale`；`:30`、`:35`、`:41`、`:46` 的「版本前进」翻成「不变」；同一毫秒两次定义写入仍能分开 |
| AIC-10 | 类型测试：必填、可选、enum、`oneOf`、`["string","null"]`、数组、`additionalProperties` 推导正确；只写 `{ type: "object" }` 时字段值是 `unknown`；`maxItems: 0`、`items` 是数组（含 `minItems` 短于 `items`）、`items` 是一个 schema 且 `minItems` 等于 `maxItems` 都推成元组；`inputSchemaFor` 在下面每种情形编译失败：schema 比接口松、字段类型不符、接口可选而 schema 必填、接口宽于枚举、接口有 schema 没写的键（顶层、嵌套、数组元素、多元素元组的每一位，含可选的那一位，可选和必填都算）、全可选接口配 `{ type: "object" }`、`required` 不是字面量而接口有必填字段、schema 有接口没写的键（顶层、嵌套、数组元素、元组每一位）、元组长度或元素不符；`FlatUnion` 下键多、字段类型不符、判别值不符也编译失败，不是联合时类型不变；只读数组、开放对象（接口也开放）、联合分支不误报；工具的返回类型不含 schema 字面量 |
| AIC-11 | SDK 只依赖 contracts（`pnpm boundary:check`），公开 API 快照写明新类型和两个函数 |
| AIC-12 | 每个 S 片：包内处理器不再有 `input as`；每个搬进 schema 的约束都有一个断言拒绝的用例，错误码写明；留下的检查有理由；动作快照刷新 |
| AIC-13 | 试点量一次 `tsc` 时间与内存，记进 PR；超过 §4.6 估计三倍或碰到 TS7056，回到设计 |
| AIC-14 | 五个 store 没有 `normalizeProjectId`；删掉之后，没有项目的调用行为不变：仍得 `actions.project_required`，由内核在处理器之前拒（`packages/kernel/src/action-service.ts:103`），用例经 `ActionService` 调；`to_project_id` 带空白、超 120 被放置 schema 拒；81 字符的项目 id 可用 |
| AIC-15 | 规则被别处删除：有未保存输入时编辑器不关，输入还在，「存成新规则」得到一条带这些内容的新草稿；第二步失败时输入还在；没有未保存输入时关掉，并给一句「这条规则已被删除」。`sample.remove` 得 `sample_not_found` 时不当成规则没了 |
| AIC-16 | 规则在别处发布：保存得 `published_immutable`，页面进「已在别处发布」，输入还在；「存成新规则」不撞 key；直接调动作、传的是发布的那一版，按成功（幂等只对直接调动作的调用方：编辑器点发布先 `saveDraft`，`update` 对已发布记录一律 `published_immutable`，走不到这里） |
| AIC-17 | 每个 T 片：`pnpm actions:update`、`pnpm api:update` 无差异，运行时检查和错误码没动，PR 带 S 清单。N22-02、N22-03 的 `api:update` 除外：只改 §8.2 写明的 5 份快照，差异只是字面量变窄，PR 写明对调用方兼容 |
| AIC-18 | N22-Z：全仓处理器的输入参数上只剩 `bindActionHandler` 一处 `as` 和 §4.4 名单里的例外；公开合同的定义要么包了 `inputSchemaFor`，要么在 §4.4 名单里带理由；`defineAction` 的手写写法只剩 `input: unknown`；手写 `I` 被 N22-G 拦下；Skill 用新写法（`examples/plugin-sample`、`tooling/plugin-cli` 的模板是 JS，定义从 manifest 取，不用改）；读动作输入的 `text`、`optionalText` 只剩有理由的 |
| AIC-19 | N22-G：新写一处处理器输入参数上的 `as`，门禁失败（变异用例），`bindOwnerPluginAction` 的输入参数上写 `as` 也失败；定义处写 `createActionDefinition<X, …>`、标 `ActionDefinition<X, …>` 时门禁失败（变异用例），合同包、SDK 和 §4.4 名单通过；类型参数化的帮手（`Object.entries<ActionDefinition<…>>`、`<I, O>(definition: ActionDefinition<I, O>)`）也通过，N22-G 只查定义处；基线为 0；`bindActionHandler` 和 §4.4 名单里的例外通过，名单每条有理由；测试文件不查 |
