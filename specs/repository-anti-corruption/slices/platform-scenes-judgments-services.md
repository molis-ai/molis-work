# 平台服务：场景回调的写域（P4）、`services.scenes`（P1）与 `services.judgments`（P2）

状态：设计稿；P4 已实现并测试，P1、P2 实现中（2026-10-26，防腐线 ac-platform，分支 `claude/ac-platform-scenes`，基于 main `2b3dc51de`）。号段 RAC-830～849（P1 用 830～837，P2 用 840～846，P4 用 847～849），S 号先写「S-暂C」（P1）、「S-暂D」（P2）、「S-85」（P4），落地前由统筹给。三片叠在同一个分支，顺序 P4、P1、P2（P4 独立，先做）。

来源：Feed、Inbox 迁进 Plugin Runtime（FI-6）要用的场景客户端与判断账，今天是宿主私路。需求出自 ac-sandbox-sched 的 FI 设计 §1.2.6（`claude/ac-feed-inbox-designs` 头 `3dfd0fbb9`）P1、P2；统筹 2026-10-26 裁定：

| 项 | 裁定 | 本稿 |
| --- | --- | --- |
| P1 场景客户端 | 做 | §2 |
| P2 判断账 | 做；放 Home 库、不进项目事务、先记账再写项目库、不声称原子，写进 SI 行与已知限制 | §3、§4 |
| P3 Functions 绑定 | **不做平台服务**：`inbox.next` 的绑定搬进 Inbox 自己的表，由 ac-sandbox-sched 在 Inbox 一侧做 | 不在本稿 |
| P4 场景作用域里写 Attention 与情境账 | 先别动 → **用户 2026-10-26 弹窗定：有条件放开**。条件三条：场景自己声明了 `attention:write`（情境账是 `context-ledger:write`）、作用域可写（`!read_only`）、写之前 `beforeEffect()` 已经通过；写入并进插件当前的项目库事务。只读回调、没声明的、撤权之后一律照拒；只改 `gate.write` 对 `"scene" in scope` 那一刀，其他服务（通知、连接、Agent、动作依赖）的场景拒绝不动 | §2a |
| 情境物化（`ContextMaterializationApi`） | 不需要服务（FI 设计 §1.2.5），Feed 一侧去掉材料化器 | 不在本稿 |

## 1. 现状核对

- 宿主今天的做法：Feed 的 `createFeedSceneRuntime`、Inbox 的 `createInboxSceneRuntime` 由 `apps/local-host/src/feed-scene.ts`、`inbox-scene.ts` 装配。判断账读写走 `withFunctionsService(home, …)`（`recordSceneJudgment`、`latestSceneJudgments`），场景客户端是内核的 `ActionSceneClient`，调用者是动作的原调用者。
- 判断账 `function_judgments` 在 Home 的 Functions 库（`FUNCTIONS_HOME_STORE`，`modules/functions/src/store-schema.ts`），行有 `project_id` 列。它是 Functions 持有者的表、另一个 SQLite 文件，**与插件的项目库事务不能合并成一次提交**。
- Runtime 已经支持插件登记场景处理器：Manifest `action_scenes` 是场景定义，`PluginContribution.action_scenes` 是处理器；`pluginSceneHandler`（`packages/plugin-runtime/src/scene-provider.ts`）把 `bindings/availability/targets/prepare` 包成**只读**场景作用域，`bind/consume/failed` 包成**可写**场景作用域（`runInPluginScene`，`read_only` 区分）。Feed、Inbox 的 Manifest 已声明各自的场景（`feedCaptureScene`、`inboxNextScene`）。
- 可写场景回调拿到的 `caller` 是内核的 `ActionSceneExecutionContext`（`runSceneEffect`，`packages/kernel/src/action-scene-execution.ts`）：它的 `assert_authority_current` 同步检查取消、撤权、场景与函数是否换了提供方，回调一结束就失效（`actions.expired`）。所以服务写之前调现成的 `assertPluginActionCurrent(instance)`（`action-scope.ts`）就够，**`PluginSceneScope` 不需要新字段**；只读场景作用域在同一函数里已经被拒（`pluginInvocationReadOnly`）。
- `services.actions`（`plugin-action-delegation.ts`，S-43）是写法样板：`grant()`（实例在跑、授权没撤）→ `originOf()`（必须是本安装正在跑的动作，且项目一致）→ 以原调用方的身份与权限转给内核，每次 await 前后再检查。它故意把调用拓宽成 `workflow` 受众（用户 2026-10-20 定）；**场景客户端不这样**：今天宿主传的就是动作的原调用方，场景的权限与受众沿用，所以 P1 以原调用方原样转交、不拓宽。

## 2a. P4：场景回调的写域（S-85，RAC-847～849）

**改的只有一处**：`apps/local-host/src/plugin-attention-service.ts` 的 `gateFor.write`（Attention 与情境账共用）。原来 `"scene" in scope` 一律拒；现在场景作用域满足这三条才放行，其余照拒：

1. **场景自己声明了这项权限**：`scope.scene.permissions` 含 `attention:write`（情境账：`context-ledger:write`）。安装持有授权、Manifest 声明，仍由 `holding(permission)` 先问，场景的声明是在它之上多一道。没声明的场景（哪怕安装持有授权）拒。
2. **作用域可写**：只读场景回调（`bindings/prepare/targets/availability`）在 `pluginInvocationReadOnly` 那一行已经被拒，不动。
3. **写之前 `beforeEffect()` 已经通过。** 可写回调（`bind/consume/failed`）里插件拿到的 `beforeEffect` 由 Runtime 包一层（`packages/plugin-runtime/src/scene-provider.ts`），返回之后才在场景作用域上记 `effect.passed`（`PluginSceneScope.effect`，新字段，只读回调没有）。**不复用动作作用域的 `checked`**：`checked` 在服务写之前的同步检查（`assertPluginActionCurrent`）也会置位，而这一条要的是内核的整套复核（绑定与判断没变、权限、调用方）真的等过。插件传一个空等待给 `project_database.transaction(...)`，场景作用域上仍然没有 `effect.passed`，写被拒。

写入并进插件当前的项目库事务（`joinPluginTransaction`），不变；每次调用仍问一遍安装、授权、原调用方（`assertCapturedPluginActionCurrent`：回调结束后 `actions.expired`、取消、撤权、换提供方都拒）。

**不动的**：通知、连接、Agent、动作依赖等服务对场景的拒绝；动作作用域与作业作用域的规则。S-68 里「场景不行」改成指向 S-85。

**对 FI-6 的提示**：场景的 `permissions` 里加 `attention:write` 之后，内核对这个场景的调用方也会按 `validate_permissions(scene.permissions)` 复核这项权限；这是 Feed、Inbox 的 Manifest 改动，不在本片。

**验收**：RAC-847 声明了权限的场景在 `beforeEffect` 之后写条目和关联边，与插件自己的行同一事务；RAC-848 拒绝三条——只读回调去写被拒、场景没声明被拒（含「只声明 Attention、写情境账」被拒）、没等 `beforeEffect`（空等待）被拒；RAC-849 撤权（调用方在等待之后被撤）被拒、回调结束后留着的写入者被拒。测试 `tests/security-invariants-plugin-scene-writes.test.ts`。

## 2. P1：`services.scenes`（S-暂C）

**权限与出现条件**：Manifest 声明并获批 `scenes:use`，且 Manifest 有 `action_scenes`，才有这项服务；沙箱不给（`NOT_GIVEN`，S-60 的测试对表）。登记进 `HOST_SERVICE_PERMISSIONS`。

**形状**（新文件 `packages/contracts/src/platform/plugin-scenes.ts`；`PluginHostServices` 加 `scenes?`）。方法名同内核 `ActionSceneClient`、去掉 `caller` 参数，插件现有 `createFeedSceneRuntime` 等换一个对象即可：

```ts
export const PLUGIN_SCENES_PERMISSION = "scenes:use";
export interface PluginSceneClient {
  usages(judgment?: ActionReference): Promise<ReadonlyArray<ActionSceneBinding & { availability: ActionAvailability }>>;
  discoverScenes(judgment?: ActionReference): Promise<readonly ActionSceneView[]>;
  targets(judgment?: ActionReference, selection?: ActionSceneSelection): Promise<readonly ActionSceneTarget[]>;
  bind(binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): Promise<void>;
  runScene(scene: { scene_id: string; version: number }, bindingId: string, event: unknown): Promise<unknown>;
}
```

**宿主实现**：`apps/local-host/src/plugin-scene-service.ts`（新），仿 `plugin-action-delegation.ts`，在 `plugin-host-services.ts` 的 `projectServices` 里装进 `services`；插件没声明权限、没有 `action_scenes`、没有项目时没有这项服务。

**规则**（每条有断言拒绝本身的测试）：

1. **只认自己声明的场景。** 调用传入的 `scene_id@version`、`binding.scene_id/scene_version` 必须在这个安装的 Manifest `action_scenes` 里；别人的场景（`inbox.next`、`home.dock`）、没声明的、版本不符的，一律 `plugin.scene_not_declared`（`defineErrorCodes("plugin", …)`）。`usages/discoverScenes/targets` 的结果过滤到自己声明的，别人的场景不出现。
2. **原调用方。** 只能在本安装正在跑的动作里用（`currentPluginAction()` 且 `inPluginInstance`，项目一致，调用方可保留权限），转给内核时用这个动作的原调用方，插件传不进调用者；`delegated_by` 记插件号。调用前后、每次 await 后都重新 `grant()` 与 `original.assert_authority_current()`（同 S-43）。动作外（`start`、路由、定时器、场景回调里）一律拒。
3. **内核检查一条不放宽。** `bind` 的函数兼容、`validate_authority`、`validate_permissions`，`runScene` 的 `recheck/beforeConsume/consumeScene` 的 `beforeEffect` 全沿用；服务只在进出处加上面第 1、2 条。被取消、撤权、停用的调用不再写任何业务记录（硬约束）。
4. **`runScene` 对动作的要求。** 场景要等模型，所以调用它的动作必须声明 `scheduling: "concurrent"`，并像 `services.actions.invoke` 那样保留权限（`retainAuthority`）；非并行动作调用以 `actions.forbidden` 拒。
5. **只读调用。** `query_only` 的调用方只能 `usages/discoverScenes/targets`；`bind/runScene` 拒。

## 3. P2：`services.judgments`（S-暂D）

**权限与出现条件**：`judgments:read`、`judgments:write`（读写分开，同 `attention` 的做法），Manifest 有 `action_scenes`，项目级插件才有；沙箱不给；登记进 `HOST_SERVICE_PERMISSIONS`。（FI 设计允许并进 `services.scenes.judgments`；单列是为了读写权限与 SI 行各自成立，两片也能分别落。）

**形状**（新文件 `packages/contracts/src/platform/plugin-judgments.ts`；类型复用 `modules/functions` 的 `JudgmentRecord`）：

```ts
export const PLUGIN_JUDGMENTS_READ_PERMISSION = "judgments:read", PLUGIN_JUDGMENTS_WRITE_PERMISSION = "judgments:write";
export interface PluginJudgmentInput {
  readonly function: ActionReference;            // 平台由它推出 function_key，插件不传
  readonly subject: JudgmentRecord["subject"];
  readonly scene_id: string;
  readonly scene_provenance: NonNullable<JudgmentRecord["scene_provenance"]>;
  readonly outcome: JudgmentRecord["outcome"];
  readonly suggested_behavior_ids: readonly string[];
  readonly error_code: string | null;
}
export interface PluginJudgmentsClient {
  /** 自己声明的场景、当前项目里，每个主体最新的一条。 */
  latest(sceneId: string): readonly JudgmentRecord[];
  /** 记一条；Home 库先写、不并进项目事务（见 §4）。 */
  record(input: PluginJudgmentInput): JudgmentRecord;
}
```

**宿主实现**：`apps/local-host/src/plugin-judgments-service.ts`（新）。读写 Functions 持有者的函数（`withFunctionsService(home, service => service.latestSceneJudgments / recordSceneJudgment)`），不新增表、不绕过 Functions 的函数直接写 SQL。

**规则**：

1. **`scene_id` 必须是自己声明的**，`latest` 与 `record` 都一样（别人的场景、没声明的 → `plugin.scene_not_declared`）。
2. **项目取自调用，不接受别的项目。** `subject.project_id` 必须等于当前调用的项目，否则 `plugin.scope_mismatch`；`latest` 没有项目参数。
3. **`record` 的作用域**（FI 设计 P2 的口径）：只在**可写**作用域里——自己场景的可写回调（`consume/failed`，作用域里 `scene` 是这个插件声明的、`read_only` 为假），或本安装正在跑的可写并行动作（`scheduling: "concurrent"`、非查询、动作在 `permissions` 里声明 `judgments:write`）。只读场景回调（`bindings/prepare/targets/availability`）、`query_only` 的调用、作业以外的游离调用、别的安装的动作，一律拒。`subject.kind` 必须在场景声明的 `subject_kinds` 里。
4. **提交前认权。** 写之前调 `assertPluginActionCurrent(instance)`（同步，不跨 await）：取消、撤权、停用、换提供方之后不写，也不记失败账（硬约束与 S-35）。场景回调已结束（`actions.expired`）同样拒。
5. **`latest` 是读**：任何作用域都可读，但只返回自己场景、当前项目；与 `attention` 的读一致。
6. **`function_key` 由平台推出**（`publishedFunctionKey(input.function) ?? input.function.capability_id`，在 Functions 持有者那一侧），插件传不进。
7. **删项目**：判断行随项目走 Functions 的 `project-data.ts` 已有清理，不改。

## 4. 已知限制：判断账不进项目事务

判断账在 Home 的 Functions 库，插件的项目库事务在另一个 SQLite 文件里，两者**不能在同一次提交里**。`record` 在 Home 库自己提交，调用方在 `consume` 里的顺序是：先 `judgments.record`，再写项目库（入箱、日志）。项目库一步失败时，判断账那一行已经落了。这和今天一致（今天也是 Home 库先写、`recordCaptureJudgment` 在后），不是新退步；设计稿与 SI 行都不声称原子。落下的孤儿判断无害：采用判断前本来就核对 `scene_provenance`（绑定号与修订、函数、主体修订），对不上的不采用。若以后要原子，只有把两张表搬进项目库基线一条路（升基线版本、真实 Home 维护），不在本稿。

这条限制要写进 SI 行（S-暂D 的「限制」列）和 `docs/platform/PLUGIN-DEVELOPMENT.md` 里 `services.judgments` 那一行。

## 5. 验收、提交顺序、合同改动

| 编号 | 内容 |
| --- | --- |
| RAC-830 | 没声明 `scenes:use` 或没有 `action_scenes`，没有 `services.scenes`；沙箱不给（S-60 表多一行） |
| RAC-831 | 别的插件的场景（`inbox.next`、`home.dock`）：`usages/bind/runScene/targets` 以 `plugin.scene_not_declared` 拒；`usages/discoverScenes/targets` 的结果里不含别人的场景 |
| RAC-832 | 没声明的场景、声明了但版本不符的场景同样被拒 |
| RAC-833 | 撤权之后（`scenes:use` 被撤、安装停用、卸载）所有方法被拒；动作进行中撤权，下一次调用与 `runScene` 的写之前被拒 |
| RAC-834 | 动作外（`start`、路由、定时器、场景回调里）调用被拒；另一个安装的动作、项目不一致的调用被拒 |
| RAC-835 | 内核检查不放宽：函数与场景不兼容、受众或权限不够、绑定在判断期间变了，错误码与直接调内核时相同（`actions.scene_incompatible`、`actions.binding_changed` 等） |
| RAC-836 | `runScene` 只能由并行动作调用；非并行动作被拒；`query_only` 的调用方不能 `bind/runScene` |
| RAC-837 | 外部写法验证：一个只依赖 SDK 与 contracts 的测试插件，凭 Manifest 声明 `action_scenes` 与 `scenes:use`，写出与 Feed 捕捉场景同样结构的场景并跑通（同等待遇） |
| RAC-840 | 没声明 `judgments:*`，没有 `services.judgments`；沙箱不给 |
| RAC-841 | `latest` 只返回自己场景、当前项目的最新判断；另一个项目的行、别的场景的行不出现；传别的场景号被拒 |
| RAC-842 | `record` 在自己场景的 `consume/failed` 里成功；在只读场景回调、`query_only` 调用、游离调用、另一个安装的动作、未声明 `judgments:write` 的动作里被拒 |
| RAC-843 | `record` 的 `subject.project_id` 不是当前项目、`subject.kind` 不在场景声明的 `subject_kinds`、`scene_id` 不是自己声明的，各被拒；`function_key` 由平台推出，插件传的被忽略 |
| RAC-844 | 回调进行中取消、撤权、停用之后 `record` 不写，判断账没有新行也没有失败记账；回调结束后再调（`actions.expired`）被拒 |
| RAC-845 | 判断行写进 Home 的 Functions 库，项目库事务回滚时那一行仍在、且被采用判断的核对（`scene_provenance`）拒绝（§4 的限制有测试钉住） |
| RAC-846 | 删项目之后该项目的判断被清掉（既有行为，补断言） |

**SI 表**：新增「S-暂C」（场景客户端）、「S-暂D」（判断账）两行，各列「谁能用、拒什么、限制」，行里「」只放测试名（S-20 门禁）。拒绝测试放 `tests/security-invariants-plugin-scenes.test.ts`、`tests/security-invariants-plugin-judgments.test.ts`，并进 `pnpm test:security`。

**提交顺序**（分支从 `origin/batch/1025-40` 起，两片叠在同一个分支，每个提交单独跑得通）：

0. P4：Runtime 的 `effect` 记录、`gate.write` 场景分支、`tests/security-invariants-plugin-scene-writes.test.ts`、SI 行 S-85 与 S-68 的修正。
1. 片 C 合同与登记：`plugin-scenes.ts`、`PluginHostServices.scenes?`、权限登记、沙箱 `NOT_GIVEN` 行；`pnpm api:update`；不改行为。
2. 片 C 宿主服务与测试（RAC-830～837），SI 行 S-暂C。
3. 片 D 合同与登记：`plugin-judgments.ts`、`PluginHostServices.judgments?`、权限登记、沙箱行；`pnpm api:update`。
4. 片 D 宿主服务与测试（RAC-840～846），SI 行 S-暂D，`PLUGIN-DEVELOPMENT.md` 服务表两行。

**合同改动按 `docs/system/CONTRACT-CHANGES.md`**：contracts 新增两个 subpath（`platform/plugin-scenes`、`platform/plugin-judgments`），`PluginHostServices` 多两个可选成员，权限名三个——全是新增，不改旧形状，所以不升版本、没有升级须知；API 快照随 `pnpm api:update`；动作合同快照不变（本稿不改任何动作与场景的 Manifest 声明）。只跑改到的文件，`--jobs 1` 走机器槽，不跑全量。

## 6. 不在本稿，以及未验证项

- 不在：P3（`inbox.next` 绑定搬进 Inbox 自己的表，ac-sandbox-sched 做）；Feed 一侧三个判断回调改走 `inbox.judgment.evaluate`、`home.judgment.evaluate`（FI §1.2.4）；Feed 迁 Runtime 本身。
- 本稿的 `judgments.record` 有自己的门（§3 规则 3），不依赖 P4 的 `gate.write`。
- 未验证（写代码前核，结果写进 PR）：
  - 内核 `ActionSceneView/Usage` 里有没有提供方身份可以用来确认「场景属于这个安装」，没有就只靠 Manifest 声明的 `scene_id@version`；两个插件注册同一 `scene_id@version` 时注册表怎么拒（`scopedSceneKey`）。
  - 并行动作怎样把 `retainAuthority` 交给 `runScene` 的 `execution.invoke`/`beforeConsume`，写法照 `pluginActionDirectory.invoke`，但场景那一条没有现成的例子。
  - 沙箱插件的服务表（`packages/plugin-sandbox/src/services.ts`）是否需要给 `scenes`/`judgments` 写拒绝理由，照 `attention` 那一行抄。
