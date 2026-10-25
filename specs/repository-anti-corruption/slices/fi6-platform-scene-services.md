# FI-6 缺的平台服务：消费场景与判断台账、Functions 绑定、情境物化（设计稿）

状态：设计稿，待统筹过目，没有写代码（2026-10-26，防腐线 ac-platform，分支 `ac-platform/fi6-platform-services`，基于 `batch/1025-40`）。号段 RAC-830～849（本稿用 830～842），S 号暂写「S-暂C/D/E」，落地前由统筹给。已对齐 ac-sandbox-sched 的 FI 设计 §1.2（`claude/ac-feed-inbox-designs` 的 d25584baa）：它的 P1 对应本稿片 C 的场景客户端，P2 对应片 C 的判断台账，P3 对应片 D，P4 对应 §5；§1.2.4 与 §1.2.5 的结论本稿照用。

FI-6 把 Feed、Inbox 迁进 Plugin Runtime，卡在 `PluginHostServices` 少三样：消费场景加判断台账、Functions 绑定、`ContextMaterializationApi` 里 `contextLedger` 没覆盖的部分。这些今天都是宿主的私路。本稿先核清现有宿主实现，再给每一样的设计。

## 0. 结论，以及要统筹先裁的三件事

- **片 C**（消费场景客户端加判断台账，= P1+P2）、**片 D**（Functions 绑定，= P3）做成平台服务，见 §2、§3；场景回调的写域（= P4）见 §5。
- **片 E 不需要服务**（§4，与 FI §1.2.5 一致）：`ContextMaterializationApi` 只有 Feed 的 `readLinkedFeedContext` 一个使用者，Feed 写的 `feed.goal` 边是「事项 → Goal」一跳、两端是身份引用（`version: null`），整个物化就是 `FeedGoalLinks.find(goalId)`，读的正是 `services.contextLedger.list`，已经够。物化器随 FI-6 的这一处改动一起删，不新增服务。
- **三个判断回调不需要平台件**（FI §1.2.4）：`inboxJudgment`、`homeJudgment` 跑的是别人的场景，Feed 不能 `runScene` 它们；改走两个已有的公开动作 `inbox.judgment.evaluate`、`home.judgment.evaluate`（经 `services.actions`，Feed 在 Manifest 声明可选依赖）。这与「服务只作用在自己声明的场景」一致，归 Feed 一侧，不在本稿。
- 下面三件事要统筹裁（两件是照 FI 设计的假设请确认，一件是 FI 设计留给平台线定的备选）：

| 编号 | 事 | 推荐 | 备选 |
| --- | --- | --- | --- |
| **D-C1** | 要求「写入并进插件当前的项目事务」，但判断台账（`function_judgments`）和场景绑定（`function_scene_bindings`）在 Home 的 Functions 库（`FUNCTIONS_HOME_STORE`，`modules/functions/src/store-schema.ts`），**不在项目库**；它们和插件的项目事务是两个 SQLite 文件，不能并进同一次提交（FI §1.2.6 P2 也这样假设） | 台账与绑定行仍留在 Functions 库，服务在那里单独提交，**先于**插件的项目事务（今天就是这个顺序：`recordJudgment` 先、`feed.recordCaptureJudgment` 后）；提交前 `beforeEffect()` 认一次权。项目库一步失败时留下的判断行无害：采用判断前本来就核对 `scene_provenance`（绑定号与修订、函数、主体修订），对不上的不采用 | 把两张表搬进项目库基线，才能并进事务：升基线版本、写一次维护把每个项目的行从 Functions 库搬来、Functions 里「哪里用了这条规则」和卸载声明规则时的清理都要改读项目库，还要真实 Home 的维护时段。面大，不建议在 FI-6 里做 |
| **D-C2** | 现有写门（Attention 与情境账的 `gateFor.write`、通知、Agent）对 `"scene" in scope` 一律拒绝。Feed 捕捉场景的 `consume` 要写 Attention 和情境账，Inbox 的 `consume` 要写日志（= FI 的 P4） | 把「**自己声明的场景**的非只读回调（`bind`、`consume`、`failed`）」承认为可写调用，条件：场景定义的 `permissions`（`bind` 用 `configuration_permissions`）含这项权限、安装持有授权、`beforeEffect()` 在提交前认权、原调用方仍有效。只读回调（`bindings`、`prepare`、`targets`、`availability`）、没声明权限的场景、别的插件的场景仍拒。**这扩大了「可写调用」的种类**，所以请裁（如果认为必须放宽到「场景不声明也能写」，按统筹要求我停下，本稿没有这样做） | 场景里不写、只返回结果再由动作去写：做不到，`consume` 本来就是内核在判断返回后调的那一次写 |
| **D-C3** | P3：Inbox 的 `inbox.next` 绑定存在 Functions 的 `function_scene_bindings`。FI 设计推荐「搬回 Inbox 自己的项目表」，由平台线定 | **保留在 Functions，做片 D 服务。** 理由：`forgetDeclaredRules`（`modules/functions/src/declared-rules.ts`）靠这张表判断「某条声明规则还有别的项目的绑定在用，不能删」，并在卸载声明方时清掉引用它的绑定；绑定搬走后 Functions 看不见 Inbox 的使用，会把仍被引用的规则删掉，Inbox 的绑定变成悬空。另外 `home.dock` 的绑定无论如何还在这张表里（首页没有项目表），表和它的清理逻辑不会消失；搬 `inbox.next` 一项只多一次真实 Home 的维护、少一个只有 Inbox 用的小服务，不划算 | 把 `inbox.next` 的绑定搬进 Inbox 自己的表：事实回到主人，但要一次维护搬行、Functions 要增加「向插件问还有谁在引用规则」的口子（新合同），再核首页 dock 的读取。若统筹倾向此项，片 D 整片取消，只剩片 C |

**D-C2 不放宽边界**（只在已声明的权限与已有的认权点上多认一种调用）；D-C1 改变了「并进事务」的字面要求；D-C3 是备选的取舍。三项都等裁。

## 1. 现状核对

### 1.1 谁用了什么（宿主私路在哪里）

| 使用方 | 用到什么 | 现在由谁给 |
| --- | --- | --- |
| Feed 捕捉场景 `createFeedSceneRuntime`（`plugins/native/feed/src/scene-runtime.ts`） | 判断台账：`latestJudgments(sceneId)`、`recordJudgment(input)`；场景客户端：`scenes.usages`、`scenes.discoverScenes`；动作目录：`actions.discover`、`actions.invoke`（试跑一条规则） | 宿主 `apps/local-host/src/feed-scene.ts`：台账读写走 `withFunctionsService(home, …)`（每次开一次 Functions 库）；场景客户端与动作客户端是 Kernel 的 |
| Inbox 下一步场景 `createInboxSceneRuntime`（`plugins/native/inbox/src/scene-runtime.ts`） | 上面的台账，加 **Functions 绑定**：`binding()`、`saveBinding()`、`publishedRules()`、`functionKey()`；场景客户端：`usages`、`bind`、`runScene`、`discoverScenes`；以及 Feed/Attention 的 `subject()`、`recordEvent()` | 宿主 `apps/local-host/src/inbox-scene.ts` |
| Feed 应用里的三个判断回调 `captureJudgment`、`homeJudgment`、`inboxJudgment`（`application-ports.ts`） | 各一次 `scenes.usages` 加 `scenes.runScene`，分别跑 `feed.capture`、`home.dock`、`inbox.next` | 宿主 `content-action-providers.ts`、`workflow-feed-options.ts` 构造 `createFeedCaptureTrigger` 等，用 Kernel 的场景客户端 |
| Feed 的 `readLinkedFeedContext`（`linked-context.ts`） | `ContextMaterializationApi.rebuild` | 宿主用项目库的原连接造 `createContextMaterializer`（`content-action-providers.ts` 第 49 行） |

首页的 `home.dock` 场景（`home-actions.ts`）同样用 Functions 的绑定与台账，但它是 Host 自己的场景，不在本稿范围。

### 1.2 数据在哪里，归谁

- Functions 库（Home 级，`FUNCTIONS_HOME_STORE`，基线版本 3）有三张表：`functions`（规则）、`function_judgments`（判断台账，按 `project_id` 列分项目）、`function_scene_bindings`（`(scene_id, project_id)` 为主键，一个场景在一个项目一行）。归 `modules/functions`。
- Functions 自己也读写绑定表：声明规则被撤销或重新播种时删引用它的绑定（`declared-rules.ts`），删项目时清（`project-data.ts`）。所以绑定行的主人是 Functions，不是消费场景的插件。
- 项目库里的 Attention、情境账、日志是平台的表，`services.attention`、`services.contextLedger`、`tx.journal` 并进插件的项目事务（`plugin-attention-service.ts` 是写法的样板：`gateFor` 认安装、认权限、认原调用方，`join(transaction, write)` 绑到当前写事务）。

### 1.3 Runtime 已经有的

- 插件的场景处理器已经走 Runtime：`PluginContribution.action_scenes` 加 Manifest 的 `action_scenes`，`pluginSceneHandler`（`packages/plugin-runtime/src/scene-provider.ts`）把 `bindings/targets/prepare/availability` 包成**只读**场景调用，把 `bind/consume/failed` 包成**可写**场景调用（`runInPluginScene`，`read_only` 区分）。Feed、Inbox 的 Manifest 已经声明了各自的场景（`feedCaptureScene`、`inboxNextScene`）。
- `PluginSceneScope` 现在只带 `caller: ActionCallContext`，没有 `beforeEffect`；Kernel 传给 `consume` 的其实是带 `beforeEffect` 的执行上下文（`ActionSceneExecutionContext`）。可写场景调用的 scope 需要把它带上（片 C 的一部分）。

## 2. 片 C：`services.scenes`（场景客户端加判断台账）

**给谁**：Manifest 声明了 `action_scenes` 并申请权限 `scenes:use` 的 Host 内运行的插件。登记在 `HOST_SERVICE_PERMISSIONS`，沙箱写「不给」（`NOT_GIVEN`，S-60 的测试对表）。

**形状**（新文件 `packages/contracts/src/platform/plugin-scenes.ts`，`PluginHostServices` 加 `scenes?`）：

方法名与 Kernel 的 `ActionSceneClient` 相同、只是去掉 `caller` 参数，插件现有代码（`createFeedSceneRuntime`、`createInboxSceneRuntime`）换个对象即可：

```ts
interface PluginSceneClient {
  /** 只看得到这个安装自己在 Manifest 里声明的场景。 */
  usages(judgment?: ActionReference): Promise<readonly ActionSceneUsage[]>;
  discoverScenes(judgment?: ActionReference): Promise<readonly ActionSceneView[]>;
  targets(judgment?: ActionReference, scene?: { scene_id: string; scene_version: number }): Promise<readonly ActionSceneTarget[]>;
  bind(binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): Promise<void>;
  runScene(scene: { scene_id: string; version: number }, bindingId: string, event: unknown): Promise<unknown>;
  readonly judgments: PluginJudgmentLedger;
}
interface PluginJudgmentLedger {
  /** 自己场景在这个项目里每个主体最新的一条。 */
  latest(sceneId: string): readonly JudgmentRecord[];
  /** 只在自己场景的可写回调里。项目、判断号、时间、函数键由平台定。 */
  record(input: PluginJudgmentInput): JudgmentRecord;
}
```

**规则**（每条有测试断言拒绝本身）：

1. **只认自己声明的场景。** `scene_id@version` 必须在这个安装的 Manifest `action_scenes` 里，且场景的提供方是这个安装；别的插件的场景（`inbox.next`、`home.dock`）、没声明的、版本不符的，一律以 `plugin.scene_not_declared` 拒（错误码归 `plugin` 主人，`defineErrorCodes`）。`usages/discover/targets` 的结果也只含自己的。
2. **作为原调用方。** 内部转给 Kernel 的场景客户端，调用方上下文取当前调用的（和 `services.actions` 一样，插件不传 caller）；受众、权限、`beforeEffect` 全部再问一次。没有当前调用（定时器、停了的安装）一律拒。
3. **台账读**：只读自己场景、当前项目，不接受 `project_id` 参数。
4. **台账写 `record`**（D-C1 的做法）：
   - 只在**自己场景的可写回调**里（`bind/consume/failed`）；动作、作业、只读回调、别的场景的回调都拒；
   - `subject.project_id` 必须等于当前项目，`subject.kind` 必须在场景声明的 `subject_kinds` 里，`scene_id` 必须是这个回调所属的场景；`scene_provenance.binding_id` 必须是这个场景现有的绑定；`function_key` 由 Functions 主人从 `function` 引用推出，不收插件给的；
   - 提交前调 `beforeEffect()`，取消、撤权、停用后什么都不写，也不记失败账（硬约束与 S-35）；
   - 在 Functions 库里单独提交，先于插件的项目事务。
5. **删项目**：判断行随项目走 `project-data.ts` 已有的清理，不改。
6. **沙箱**：不给；`tests/security-invariants-sandbox-services.test.ts` 的表加一行。

**宿主实现**：`apps/local-host/src/plugin-scene-service.ts`，仿 `plugin-attention-service.ts` 的 `gateFor`；Functions 库用 `withFunctionsService` 开，不新开第二条连接路。

## 3. 片 D：`services.functions`（Functions 绑定）

**给谁**：声明 `action_scenes` 并申请权限 `functions:bind` 的 Host 内插件（现在只有 Inbox 要）。沙箱不给。

**形状**（`packages/contracts/src/platform/plugin-functions.ts`）：

```ts
interface PluginFunctionsClient {
  /** 自己某个场景在当前项目的绑定行（Functions 持有），没有则 null。 */
  binding(sceneId: string): ActionSceneBinding | null;
  /** 只在自己场景的 bind 回调里；带 expected_revision 时原子拒绝过期写（`functions.conflict`，同今天的行为）。 */
  saveBinding(binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): void;
  /** 已发布、且与自己某个场景兼容的规则：只有键、名字和引用。 */
  publishedRules(): readonly { function_key: string; name: string; reference: ActionReference }[];
  /** 引用对应的已发布规则键，不是 Functions 规则则 null。 */
  functionKey(reference: ActionReference): string | null;
}
```

**规则**：

1. 场景必须是自己声明的（同片 C 第 1 条）；项目是当前调用的，不收参数。
2. `saveBinding` 只在自己场景的 `bind` 回调里（Kernel 已先验过函数与场景兼容、调用方权限），再检查 `binding.scene_id/scene_version` 就是这个回调的场景、`binding.project_id` 等于当前项目；修订过期以 `functions.conflict` 拒；先 `beforeEffect()`。
3. `publishedRules()` 只列与自己某个场景的 `subject_kinds` 兼容的已发布规则，字段只有键、名、引用，**不含**规则的指令、样本、试跑结果（那是 Functions 的内容）。
4. Functions 撤销声明规则时删绑定（`declared-rules.ts`）照旧；插件下次读到 `null`。
5. 不另存一份：绑定行的主人还是 Functions，数据不搬（备选与不选的理由见 §0 的 D-C3）。
6. `publishedRules/functionKey` 留在片 D 里的理由：Inbox 对外的动作 `inbox.judgment.read/write` 用 `function_key` 做用户可见的规则标识，而「规则键 ↔ 引用」的对应（引用是 `functions.published.<键>`）是 Functions 的内部约定，插件不该自己解析；FI §1.2.1 认为 `actions.discover` 加纯函数就够，但那个纯函数在 `modules/functions` 里，插件拿不到。若统筹宁可改 `inbox.judgment.*` 的入参为引用，这一项可以删。

## 4. 片 E：情境物化——核对后不需要服务

- 唯一使用方：`readLinkedFeedContext`（`plugins/native/feed/src/linked-context.ts`），唯一的构造点是 `content-action-providers.ts` 第 49 行。
- 它的请求固定：根是 Goal，`direction: "incoming"`，`relation_types: ["feed.goal"]`，`max_depth: 1`。`feed.goal` 边由 `FeedGoalLinks.set` 写，源与目标都是 `version: null` 的身份引用，所以物化器里的「过期」检查对它是空操作。结果等价于 `FeedGoalLinks.find(goalId)`（同样查 `type: "feed.goal"`、`target: Goal 引用`），再逐个读事项。
- 平台一侧 `contextLedger.list` 只显示本插件自己的边（S-68）：Feed 要读的就是自己写的边，够用。读 Goal 本身已经是一次 Goals 动作调用（`goalPluginActions.contract`），不用台账。
- 做法：FI-6 里 Feed 的 `feed.goals.context` 改用 `FeedGoalLinks.find` 和事项读取；**删** `createContextMaterializer`（`modules/context-ledger/src/materialization.ts`）与合同里的 `ContextMaterializationApi`、`ContextRebuildRequest` 等（无其他使用方，已核）；`pnpm api:update` 刷新快照。这一步放在 FI-6 的 Feed 提交里，不另起服务。
- 因此片 E 没有 SI 表行；`S-暂E` 留给下面的「场景回调的写域」。

## 5. 场景回调的写域（D-C2 = FI 的 P4，S-暂E）

- 项目库的事务在场景作用域里已经允许（`plugin-database-partitions.ts`），要改的只是 Attention 与情境账服务的写门：`plugin-attention-service.ts` 的 `gateFor.write` 对 `"scene" in scope` 一律拒。这一片改它，通知、Agent 的写门暂不动（FI-6 没人在场景里用，需要时按同一写法另开）。改成：自己场景的**可写**场景调用，当场景定义的 `permissions`（`bind` 看 `configuration_permissions`）声明了这项权限、安装持有这项授权、原调用方仍有效时，和「声明了这项权限的可等待并行动作」同样放行；只读场景调用、别的场景、没声明权限的场景仍拒。
- 做这件事要让 `PluginSceneScope` 的可写变体带上 `beforeEffect`（§1.3），写门在提交前调它。
- 需要 Feed 的 `feedCaptureScene.permissions` 加 `attention:write`（和 `context-ledger:write`），Inbox 的 `inboxNextScene.permissions` 同理加所需项：这是 FI-6 的 Manifest 改动，会让动作合同快照里的消费场景行变化，随 FI-6 的提交刷新，不在本稿的提交里。
- 在 SI 表加一行 S-暂E：场景回调的写，条件与拒绝（只读回调、没声明权限的场景、别的插件的场景、撤权后）各有测试。

## 6. 验收、提交顺序、合同改动

| 编号 | 内容 |
| --- | --- |
| RAC-830 | `services.scenes` 只在申请了 `scenes:use` 且 Manifest 有 `action_scenes` 时存在；用 Feed 的服务对 `inbox.next`、`home.dock` 做 `usages/bind/run` 得 `plugin.scene_not_declared`，结果列表不含别的插件的场景 |
| RAC-831 | 场景客户端作为原调用方：缺受众或缺权限的调用被拒；停用、卸载、撤权后的服务拒绝；没有当前调用也拒 |
| RAC-832 | `judgments.latest` 只返回自己场景、当前项目的最新判断；另一个项目的行、别的场景的行不出现，传别的场景号被拒 |
| RAC-833 | `judgments.record` 只在自己场景的可写回调里成功；在动作、作业、只读回调、别的场景回调里被拒；主体种类不在场景的 `subject_kinds`、项目号不符、绑定号不是该场景的绑定，各被拒；函数键来自 Functions 主人 |
| RAC-834 | `record` 提交前认权：回调进行中取消、撤权、停用，各自之后判断台账没有新行，也没有失败记账 |
| RAC-835 | 沙箱不给 `services.scenes` 与 `services.functions`（S-60 表）；删项目仍清掉该项目的判断与绑定 |
| RAC-836 | `functions.binding` 只读自己场景、当前项目的行；别的场景号被拒 |
| RAC-837 | `functions.saveBinding` 只在自己场景的 `bind` 回调里成功；在动作里、别的场景里被拒；`scene_id`、`project_id` 不符被拒；过期修订被拒且不写 |
| RAC-838 | `functions.publishedRules` 只含与自己场景兼容的已发布规则，字段只有键、名、引用；响应里没有指令、样本 |
| RAC-839 | Functions 撤销一条声明规则后，`functions.binding` 读到 `null` |
| RAC-840 | S-暂E：自己场景的可写回调里 `attention.join` 与 `contextLedger.join` 的写成功（场景声明了该权限），只读回调、没声明权限的场景、撤权后被拒 |
| RAC-841 | 片 E：`feed.goals.context` 的结果与改前逐字相同；别的插件写的同名 `feed.goal` 类型边读不到；合同里不再有 `ContextMaterializationApi`（API 快照随之删） |
| RAC-842 | 同等待遇：不 import 任何宿主私有件的测试插件，凭 Manifest 声明加这两个权限，能写出和 Inbox 同样结构的场景 |

**提交顺序**（分支从 `batch/1025-40` 起，每个提交单独跑得通）：

1. 合同与登记：`plugin-scenes.ts`、`plugin-functions.ts`、`PluginHostServices` 加两项、`HOST_SERVICE_PERMISSIONS` 与沙箱 `NOT_GIVEN` 加行；`pnpm api:update`；不改行为。
2. 场景回调的写域（§5）与 scope 带 `beforeEffect`，RAC-840。
3. 片 C 宿主服务，RAC-830～835。
4. 片 D 宿主服务，RAC-836～839。
5. RAC-842 的外部写法验证；SI 表三行（暂号）。
6. 片 E 的删除放在 FI-6 的 Feed 提交（RAC-841），本分支不动 Feed。

**合同改动按 `docs/system/CONTRACT-CHANGES.md`**：contracts 新增两个 subpath（`platform/plugin-scenes`、`platform/plugin-functions`）、`platform/plugin` 的 `PluginHostServices` 多两个可选成员，权限名两个——都是新增，没有改旧形状，所以不升版本、没有升级须知；API 快照随 `pnpm api:update`；动作合同快照不变（Manifest 的场景权限改动在 FI-6 里）。

## 7. 不在本稿，以及未验证项

- 不在：Feed、Inbox 迁 Runtime 本身（FI-6 的其他提交）；Feed 一侧的三个判断回调改走 `inbox.judgment.evaluate`、`home.judgment.evaluate`（FI §1.2.4，含两处语义差与错误码容忍表）；Attention 事件的写（`recordInboxJudgmentEvent` 现在落成日志事件，FI-6 记录里说 Attention 事件仍是宿主写的，不在这三片里）。
- 与 FI P2 的差别：FI 写「`record` 要求调用在可写作用域（`consume/failed` 或可写并发动作）」，本稿收窄到只在**自己场景的可写回调**里。核对过现有两个记录点（Feed `scene-runtime.ts` 的 `record`、Inbox `scene-runtime.ts` 的 `record`）都在场景处理器里，没有动作直接记账的路径；若 FI-6 发现需要动作直接记，再放宽并回头问。
- 未验证（写代码前核，结果写进 PR）：`pluginCallbackContext` 是否保留可写场景调用的 `beforeEffect`（§1.3 说 scope 目前只带 `caller`）；Kernel `usages/discoverScenes/targets` 对「只剩自己场景」的过滤，在服务里做还是给 Kernel 加参数；`Feed` 的 `selection.preview/validate` 里 `actions.invoke` 试跑一条判断函数走现成的 `services.actions`，不需要片 C。
