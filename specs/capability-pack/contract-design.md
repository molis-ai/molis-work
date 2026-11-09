# 能力包与委派带技能的合同设计（路线书 09）

状态：设计稿第 2 稿，2026-11-09 按公共合同台合审意见（对第 1 稿 `7c841d6b1d`：挡开工 B1～B6、不挡开工 10 条）改完，待复审；没有实现。第 09 批合同台（Opus 5.5 high）出稿，只写合同长什么样、归谁、怎么拆子分支；合同代码交写手，定样归设计台。对照 main `416ee8cef0`（第 08 批 #1984 已合）与第 10 批在途分支 `origin/batch/10`（#1991）。第 11 节的待决由 09 主会话攒批问用户，答复前相关片不开工。

## 0. 这份稿子覆盖什么

| 片 | 本稿定下的 | 节 |
| --- | --- | --- |
| 9-1 委派协议带上技能 | 工作执行方 `run.start` 的新形状；`AgentSkillRef`、`SignedAgentReference` 的方法引用、`AssistantMethodSelection.method_id` 收成 `SkillRef`；点名名单怎样绑定、由谁写、只给谁读；`run.start.skills` 与会话里存的选择怎样合；回复语言；新安全不变量与拒绝测试 | 第 2 节 |
| 9-5 Agent Host 按 `SkillRef` 冻结 | 一轮怎样解析、冻结技能，用谁的身份读目录；`tools` 只当说明的两道检查；登记给 Prologue 的键；一轮只取一次目录的读取次数表与计数夹具；SKP-09 落在哪 | 第 3 节 |
| 9-8 能力包合同 | 三种放法比较与结论；条目公共字段；上报协议与来源盖章；`kit.catalog.list@1`；导出导回；§9 边角；错误码；安全不变量 | 第 4 节 |
| 9-9 工具全集与 MCP 收口 | Agent Host 一处的工具全集、与 SDK 对齐的测试、合同只留两张表、`host_tools` 不在全集即拒、MCP 视图类型统一 | 第 5 节 |
| 9-10 上报与汇总、导出导回 | 各主人的上报动作与文件（形状在第 4 节） | 第 4.5、4.7 节 |

不重定已定的事：第 08 批的 `system.skills` 四个动作、`SkillRef`、`SkillCatalogEntry`、三档、`skill_settings`／`skill_uses`（[08 合同稿](../skill-packs/contract-design.md)）；能力包的范围、边界与用户决定（[能力包需求](spec.md) §2～§9、§12）；第 09 批第八节的统筹裁定（[09 批文件](../post-anticorruption-roadmap/reference/batches/09.md#batch-09-conditions)）。

## 1. 现状核对（main `416ee8cef0`）

只列和 09 批文件、能力包需求写法不一样或它们没写到的：

| 事实 | 位置 | 对设计的影响 |
| --- | --- | --- |
| 08 的「本轮点名」是宿主进程内的 `AsyncLocalStorage`（`withSkillSelection`／`currentSkillSelection`，按 `actor_id`＋`project_id` 认），今天只有技能设置页的预览在用 | `apps/local-host/src/agent-definitions/skill-selection.ts`、`skill-settings-http.ts` | 它跨不过插件边界：沙箱里的执行方回调宿主是一条新的异步链，名单丢了；又会被这条链上启动的整轮运行（含之后的工具调用、打到别的插件动作的调用）原样继承。9-1 把它换成调用上下文里绑定了安装与动作的宿主字段（第 2.3 节） |
| 插件页面的「原始输入」走宿主取下的传输信封：路由请求体里的 `original_input` 由宿主取走，绑在同一安装第一个被调的自有动作上（`routedControls` 记下 `original_action`，别的动作拿不到），`agent-host-composition.ts` 再从 `currentPluginInvocation()` 读出 | `apps/local-host/src/plugin-route-operations.ts` 的 `takeOriginalInput`、`plugin-actions-client.ts` 的 `callScope`／`offered`、`agent-host-composition.ts` 的 `currentOriginalInput` | 插件页面的点名信封照这条现成的路走，绑定方式一样（第 2.3 节） |
| Agent Host 解析方法时按 `skill_id@version` 认，登记给 Prologue 的键也是它 | `horizontal/agent-host/src/index.ts` 的 `readSkill`、`adapters/prologue-methods.ts` 的 `inlineMethods` | 共同目录里两个插件可以有同名 `skill_id`，自己的技能也可能与目录里的同名，会撞键。9-5 改按内容摘要认（第 3.3 节） |
| `recordSignedUse` 遇到方法直接返回，`prompt_uses.source_ref` 里没有 `kind: "method"` 的行 | `apps/local-host/src/agent-definitions/agent-definitions.ts` | 去掉 `SignedAgentReference` 的 `"method"` 不改任何已存的行 |
| 插件开的一轮（Coding）今天没有回复语言：`startAuthority` 不给 `reply_language`；第 14 批 T10 已在 main，只覆盖助理自己的一轮 | `apps/local-host/src/agent-host-composition.ts`、`apps/local-host/README.md`「回复语言」 | 9-1 的前置 T10 已满足；委派的一轮由宿主带语言（第 2.4 节） |
| 工作执行方合同自己的注释写的是「阶段一在原版本改形状，首次外部安装后才升号」 | `packages/contracts/src/platform/work-executors.ts` 的 `ROLE_TYPE_VERSIONS` | 与 09 批文件写的「走 `.v2`」相反，第 2.1 节按合同变更流程定 |
| `actions.usages.read` 是「按合同类型找上报者、用调用方自己的客户端逐个调、由汇总处给每条盖 `source`／`reporter`」的先例；系统搜索 `horizontal/search` 是同一模式放在 `horizontal/` 新包里的先例 | `apps/local-host/src/action-usage-actions.ts`、`horizontal/search/README.md` | 能力包汇总照它们（第 4.1、4.5 节） |
| Coding 页面每开一轮都把会话里存的方法选择重发一遍（`executor.ts` 的 `roundOf`、`client.ts` 的 startRound） | `specs/coding-harness-optimization/audit-2026-11-batch12.md` 第 3.3 节 | 「每轮重发」就是页面在点名，第 2.3 节的信封规则直接管到它 |
| 第 10 批 #1991（`origin/batch/10`）改了 `platform/actions.ts`、`services/assistant.ts`、`assistant-dispatch.ts`、`assistant-round-materials.ts`、`assistant-send-materials.ts` 与「/」菜单拼 `method_id` 的地方（`assistant-composer.ts`） | `git diff origin/main...origin/batch/10` | 与 9-1、9-2、9-3 的文件重叠，第 8 节排基点 |

## 2. 9-1 委派协议带上技能

### 2.1 `run.start` 的形状

```ts
/** A new round: the executor applies the session's own settings, else its defaults, and refuses in its own words when it cannot. */
export interface WorkExecutorRunStart {
  session_id: string;
  task: string;
  /**
   * Skills the delegating round hands this one, as exact references from the shared catalog (`skills.catalog.list@1`). What to load,
   * not who named them: a `manual` Skill here is read only if the Host bound it in `ActionCallContext.named_skills` for this call. At
   * most `SKILL_BODY_READ_MAX_REFS`. The executor adds the session's own saved choice (§2.3), freezes the union or refuses the round;
   * it never drops one silently or reads another version.
   */
  skills?: SkillRef[];
}
```

Schema：`skills: { type: "array", maxItems: SKILL_BODY_READ_MAX_REFS, items: SKILL_REF_SCHEMA }`（`services/skills` 已导出）。`session.update` 不变（仍只有 `mode`）：点名是一轮的事，不是会话设置。

**版本：在原版本改，不升 `.v2`。** 09 批文件写「走 `.v2` 类型」，与合同变更流程第 3 节第 3 条和这份合同自己的注释相反：阶段一按现行版本改形状，刷新快照、写影响；首次外部安装起才升号。输入是封闭 schema，没跟上的执行方收到 `skills` 会拒绝输入，不会悄悄不带技能跑一轮；不带技能的委派照旧能走。升 `.v2` 的代价是 `tooling/versions.json` 一条、助理按类型找执行方的比较跟着变，换不来别的保证。记进偏离（第 10 节）。

### 2.2 方法引用收成 `SkillRef`

| 现在 | 改成 | 消费者（同一批改完） |
| --- | --- | --- |
| `services/agent-host-start.ts` 的 `AgentSkillRef { skill_id, version }`，`AgentStartInput.skills?: AgentSkillRef[]` | 删 `AgentSkillRef`；`skills?: SkillRef[]`。插件自己 Agent 的 `agent.skills`（Coding 的四个 `codingSkills`）也用 `SkillRef` 指：来源是开这一轮的插件自己的安装（第 3.1 节） | Coding 的 `route-selections.ts`、`start-round.ts`、`executor.ts`（9-4）；`horizontal/agent-host`（9-5） |
| `services/agent-host-ports.ts` 的 `AgentSkillLibrary`（`list`／`read`／`discover`／`install`）、`AgentSkillCatalogEntry`、`AgentSkillCandidate`、`AgentSkillsCapability`（没有实现者） | 全删。`AgentSkillOwner` 名字留着不动（`AgentMcpLibrary` 还用，改名不是这批的事） | `horizontal/agent-host` 的 `skillLibrary`、`prologue-methods.ts` 的存储与发现；Coding 的 `routes-setup.ts` 三个路由、`routes-sessions.ts` 的 `agent.listSkills`、`browser/settings/methods.ts`；`services/agent-host.ts` 的对应动作（9-4、9-5，SKC-11） |
| `services/agent-definitions.ts` 的 `SignedAgentReference.kind: "role" \| "method"` | `kind: "role"`。保留这个字段：已存的 `prompt_uses.source_ref` 都是角色，字面量不变，库里的行一个不改 | `assistant-send-materials.ts` 的材料核对、`agent-definitions.ts` 的 `methods()`／`signedMaterial()`（9-2） |
| `AgentSkillView.kind?: "role" \| "method"`、`default_ref` | 去掉 `kind`：签名角色只在 `roles()` 里出现一次（能力包需求 §8）；方法的引用换成 `ref: SkillRef` | `agent-definitions.ts`、`assistant-work-reads.ts`（9-2） |
| `services/assistant.ts` 的 `AssistantMethodSelection { method_id, version?, default_ref?, installation? }` | 分成两种：`{ kind: "skill"; ref: SkillRef } \| { kind: "role"; method_id: string; version?: number; default_ref?: SignedAgentReference; installation?: SignedAgentInstallation }`。`AssistantMethod` 的方法部分改读 `SkillCatalogEntry`，只留角色资料 | `assistant-round-materials.ts`、`assistant-composer.ts` 的「/」菜单（9-2，基点见第 8 节） |
| 动作 `assistant.methods.read@2` 输入收方法与角色 | 只收角色资料（`method_id`＋`default_ref`＋`installation`）。方法正文一律走 `skills.body.read@1`；是否改名由 A 轨定 | `assistant-rule-actions.ts`、轮内给模型的读取说明（`assistant-round-materials.ts` 的「按需读取资料」一段） |
| SDK 的 Manifest 检查允许同一插件的 `agent.skills` 与 `methods` 用同一个 `skill_id` | `inspectSkillDeclarations` 拒绝：同一 Manifest 里两处同名报 `plugin.declaration_invalid`，`problems` 指到这个 `skill_id`。否则插件可以拿「自己的技能」的身份去读一个在目录里是 `off`／`manual` 的同名方法，绕过三档 | `packages/plugin-sdk/src/agent-declarations.ts`（C1，随 `b09/contract`）；三个内置插件核过没有重名 |

### 2.3 点名名单：绑定、谁写、只给谁读

统筹裁定：`manual` 的点名名单由宿主从调用上下文带过去，不从 `run.start` 的输入读。合同加两个宿主字段，替换 08 的 `AsyncLocalStorage`：

```ts
// packages/contracts/src/platform/actions.ts
/** Skills the person named, bound to the one action call the Host delivered them to (specs/capability-pack/contract-design.md §2.3). */
export interface ActionNamedSkills {
  /** The installation and the exact own action the Host bound them to; any other call never sees them. */
  readonly install_id: string;
  readonly action: ExactActionReference;
  /** `page`: the installation's own page named them in the route's envelope; `host`: the Host's delegation call handed them on. */
  readonly from: "page" | "host";
  readonly refs: readonly SkillRef[];
}

// ActionCallContext
/**
 * Set only by the Host, in two places: the routed naming envelope (bound, as `original_input` is, to the first own action the route
 * calls) and the Host's call to a work executor's `run.start` (bound to that executor's installation and action). It is not carried
 * by the handler's nested calls nor by a round's gateway tool calls into a plugin's action; the Host's round composition reads it only
 * to freeze that round's reads of `system.skills`. A `SkillRef` in any action's input names nothing. Never business input.
 */
readonly named_skills?: ActionNamedSkills;
/**
 * Who a round's Skill reads are for, written by the Host's round composition only on the calls it makes to `system.skills` for that
 * round (its start and the round's own tool calls to `system.skills`): `consumer` decides which Skills apply, `named` is the round's
 * frozen named list, `engine: "local"` lets a `native_only` Skill be read. A plugin's handler never sees it. Never business input.
 */
readonly skill_round?: { readonly consumer: "assistant" | "coding" | "agent"; readonly named: readonly SkillRef[]; readonly engine?: "builtin" | "local" };
```

**谁写 `named_skills`（只有两处）：**

| 写入处 | `from` | 绑定到 | 里面是什么 |
| --- | --- | --- | --- |
| 宿主取下插件页面路由请求体里的传输信封 `named_skills`（与 `original_input` 并列，`plugin-actions-client.ts` 同一处） | `page` | 这个页面所属安装（`active.install_id`）第一个被调的自有动作，照 `original_action` 的绑定 | 信封里的引用中 `ref.install_id === active.install_id` 的那些；别的安装的技能宿主直接丢掉，不进名单（D-1 折中：跨插件点名只认宿主入口） |
| 宿主把活交给执行方（`AssistantDispatch.executorDispatch` → 执行方的 `run.start`） | `host` | 执行方的安装与它的 `run.start` 动作 | 委派这一轮已冻结的点名名单，原样 |

**谁读、读到什么为止：**

- 派发处只把 `named_skills` 交给它绑定的那一个调用的处理器上下文；那个处理器发出的嵌套调用、别的动作、别的安装都看不到（插件传回一个自带 `named_skills` 的调用者对象，宿主建上下文时不抄这个字段）。
- 处理器开 Agent Host 一轮时，组装处从 `currentPluginInvocation()` 读它，只认安装与动作都对得上的那一份（照 `currentOriginalInput`），再连同 `consumer`、`engine` 冻结成这一轮的 `skill_round.named`。
- `skill_round` 只出现在组装处对 `system.skills` 发出的调用上：开轮时的目录与正文读取，以及这一轮的工具调用里打到 `system.skills` 的那些。这一轮的工具调用打到别的插件动作时，两个字段都不带；那个动作再开一轮，名单是空的。
- 宿主自己的入口不经信封：助理输入框（工作台页面）与技能设置页的预览由宿主代码直接冻结名单，用于宿主自己发出的 `system.skills` 读取（助理自己的一轮；预览的那一次读），同样以 `skill_round` 带。

**`skill_round.consumer` 怎样定**：宿主组装一轮时按冻结的角色定，不按插件名：助理的一轮是 `assistant`；角色 `workspace: "required"`（在目录里工作的执行方，今天是 Coding）是 `coding`；别的插件的一轮是 `agent`。本机 Agent 引擎开的一轮带 `engine: "local"`。第三方执行方与 Coding 同一待遇。

**读的一侧**：`SkillCatalog` 的 `applicable()` 改读 `caller.skill_round?.consumer`，`not_named` 改读 `caller.skill_round?.named`；`skill-selection.ts` 与它在 `apps/local-host/src/index.ts` 的导出删掉。目录照旧每次读都核引用是不是当前的，名单只决定「点没点名」。

**`run.start.skills` 与会话里存的选择怎样合（执行方一侧，Coding 照做）：**

- 一轮要用的 = `run.start.skills` ∪ 会话里存的 `methods:<会话>`，按完整引用去重，委派来的在前；合计超过 20 个就拒绝这一轮。不互相覆盖：会话里存的是本人在 Coding 里的长期选择，委派带来的是这一轮的。
- 同一个技能两处版本不同时，至少一边已不是当前的，目录读取对那一边答 `not_current`，整轮拒绝并点名它；不另写优先规则。
- 点名名单：委派来的一轮是 `from: "host"` 的那份；Coding 页面开的一轮是 `from: "page"` 的那份。页面每轮把会话里存的选择放进信封重发，就是页面在点名，所以：
  - 会话里存的 `manual` 技能如果是 **Coding 自己安装**的（今天没有：Coding 的方法都在 `agent.skills`，不受三档管），页面重发算点名；
  - 如果是**别的插件**的，页面点不了；委派来的一轮也只有助理这一轮点了它才算。读到时整轮拒绝 `not_named`，说明写「这个技能只能在助理里点名」。Coding 的方法菜单对这类技能标同一句、不让存进会话（9-4 的界面，随第 12 批的定样）。

### 2.4 回复语言

不进 `run.start` 输入（`AgentStartAuthority.reply_language` 的规矩：开轮请求不带语言，插件定不了）。

- 宿主调执行方时把委派这一轮的语言放进调用上下文的 `locale`。同一改动里改 `ActionCallContext.locale` 的注释：现在写「没有页面就不带」，改成「页面的语言，或宿主替一次委派定下的语言；只选回给人看的字与一轮的回复语言，不授予任何东西」。
- 组装插件的一轮时，`reply_language` 从这次开轮所在的调用记录读：`currentPluginInvocation()` 的调用者的 `locale`，照 `currentOriginalInput` 只认同一安装；没有就读最后用的语言（与宿主发起的一轮同一处，`ui-locale-memory.ts`）。
- 冻结记录加 `frozen.reply_locale?: "zh" | "en"`（`services/agent-host.ts` 的 `frozenOutput` 是动作输出，原版本改、刷快照）：委派过去的一轮用了什么语言看得出来，也是测试的断言点。只改 `AgentStartAuthority`、组装处与冻结记录，不改提示词正文。

### 2.5 冻结记录里的技能

`AgentRunView.frozen.skills` 每项从 `AgentSkillDefinition` 去正文改成：

```ts
interface AgentFrozenSkill {
  ref: SkillRef;
  /** `own`: the starting plugin's own `agent.skills`; `catalog`: another plugin's Manifest `methods`, read from `system.skills`. */
  origin: "own" | "catalog";
  name: string;
  /** Declared. For `catalog`, only a description; what the round could use is `host_tools`. */
  tools: string[];
  /** It was in the round's frozen named list. */
  named: boolean;
}
```

Coding 页面的「本轮方法」与助理看委派过去的一轮，都读这一项（CPK-05、CHO-03）。

### 2.6 新安全不变量 `S-skill-delegation`

独立记录 `docs/system/security-invariants/S-skill-delegation.md`，文字：

> 一轮能读的 `manual` 技能只认宿主冻结的点名名单。名单只来自两处：插件页面路由的点名信封（只收这个页面所属安装自己的技能，绑在这次路由第一个被调的自有动作上）、宿主把活交给执行方的那次调用（绑在执行方的安装与 `run.start` 上）；宿主自己的入口（助理输入框、技能设置页预览）直接冻结。名单不随处理器的嵌套调用、也不随一轮的工具调用进别的插件动作；`skill_round` 只出现在宿主对 `system.skills` 的调用上，插件的处理器看不到。任何动作输入里的 `SkillRef`（`run.start` 与 `agent.run.start` 的 `skills`、模型的工具参数、插件页面的业务字段）都不算点名；名单不跨轮继承。

代码位置：`packages/contracts/src/platform/actions.ts`、`apps/local-host/src/plugin-route-operations.ts`、`apps/local-host/src/plugin-actions-client.ts`、`apps/local-host/src/agent-host-composition.ts`、`apps/local-host/src/agent-definitions/skill-catalog.ts`、`apps/local-host/src/assistant/assistant-dispatch.ts`、`horizontal/agent-host/src/index.ts`。

**拒绝测试**（新文件 `tests/security-invariants-skill-delegation.test.ts`，进 `test:security`；每条断言拒绝本身：原因码、没有冻结记录、没有 `skill_uses` 行）：

1. 助理委派给 Coding，`run.start.skills` 里有一个 `manual` 技能、助理这一轮没点它：Coding 的这一轮不开，`not_named`；没有冻结记录、没有 `skill_uses`。（CPK-09、SKC-06）
2. 同上，点了：开轮，冻结记录里 `named: true`（对照，不算拒绝）。
3. Coding 页面把 `manual` 技能的引用写进业务字段 `methods`（不走信封）开一轮：`not_named`。
4. 点名信封绑在安装 A 这次路由第一个被调的自有动作上；A 的处理器再嵌套调 A 的第二个动作、调安装 B 的动作，那两处开的一轮读同一个技能都是 `not_named`。
5. 页面 A 的信封点名插件 B 的 `manual` 技能：宿主丢掉这一项，A 开的一轮读它 `not_named`（D-1 折中）。
6. 插件处理器把一个自带 `named_skills` 或 `skill_round` 的调用者对象传回宿主发嵌套调用：被调的那一侧上下文里两个字段都没有，读正文 `not_named`。
7. 插件处理器拿到的上下文里没有 `skill_round`（委派来的 `run.start`、页面路由来的第一个动作、一轮工具调用打到的插件动作，三种都断言）。
8. 助理这一轮点了 X；这一轮的工具调用打到某插件动作，该动作开一轮读 X：`not_named`。
9. 委派这一轮点了 X；同一会话下一轮从 Coding 页面开、信封里没有 X（且 X 不是 Coding 自己的）：`not_named`（名单不跨轮）。
10. 委派过去的一轮里，模型经网关用工具参数读一个没点名的 `manual` 技能（正文或附带文件）：`not_named`。
11. 沙箱执行方的 `run.start` 输入里夹带 `named_skills` 或 `skill_round`：输入 schema 拒绝（封闭对象）。
12. 委派过去的一轮中途，点名的技能所在插件被停用：下一次读被拒 `plugin_disabled`，不换版本（SKC-08 在执行方一侧）。

已有的 `tests/security-invariants-skill-catalog.test.ts`「…refuse Skill reads」改读新字段，不删断言；`S-skill-catalog` 记录的代码位置去掉 `skill-selection.ts`。

### 2.7 存量：两种答复对 9-4 的影响

`molis-coding-method` 已定不认不迁。Coding 会话里存的 `methods:<会话>`（形状 `{ skill_id, version }[]`）等用户定（第 11 节 D-2），两种结果：

| | 不认不迁、用户重选（推荐） | 迁 |
| --- | --- | --- |
| 9-4 怎么写 | `methodSelection()` 只认 `SkillRef[]`；读到旧形状就是普通的形状不符，抛新码 `coding.server.method-stale`（「这个会话之前选的方法需要重新选」）。页面上选择器显示为空并标这句，本人重选后存新形状。委派来的一轮读到旧值同样拒绝，助理照原因提示去 Coding 重选。不清除旧值，不写任何数据 | 先写进 `docs/system/CONTRACT-CHANGES.md`「当前保留机制」并经用户确认；Coding 插件存储加一步一次性改写：Coding 自己的 `codingSkills` 可按当前安装拼出 `SkillRef`，原来指向 `molis-coding-method` 的那些已无来源，只能删掉并提示重选。新增兼容标记、升级段与回放用例 |
| 代价 | 一个错误码、一条页面提示；用户重选一次 | 迁移逻辑＋兼容计数增长＋金样；而且只能迁一部分，剩下的仍要重选 |
| 开工 | 答复前 9-4 只做不碰存储形状的部分 | 同左，另加保留机制登记 |

助理一侧同类的存量：已存的轮次材料里 `kind: "method"` 的 `method`（`AssistantMaterial.method`，形状改成第 2.2 节的两种之一）。它只用来显示历史（名称、插件名两种形状都有）；9-2 写手先核历史读取是不是封闭校验：若是，归同一个待决 D-2，按同一结论处理。

## 3. 9-5 Agent Host 按 `SkillRef` 冻结

### 3.1 一轮怎样解析技能

`AgentStartInput.skills: SkillRef[]` 分两类，Agent Host 按来源认，不另加字段：

- **自己的**：`ref.install_id` 与 `ref.source` 是开这一轮的插件自己的安装（宿主从调用上下文核，`plugin_install_id`），`skill_id`／`version` 在它 Manifest 的 `agent.skills` 里（第 2.2 节保证它不会同时是 `methods` 里的一项）。正文取 `authority.skills`（随安装登记，不读存储）。工具照旧与角色的 `host_tools` 比。
- **共同目录的**：其余一律经宿主的目录端口读，`AgentStartAuthority` 加：

```ts
/**
 * The shared Skill catalog for this round, bound by the Host (`system.skills`). One `list` and one `readBodies` per round start;
 * never called per reference. Each call carries the round's `skill_round`.
 */
skillCatalog?: {
  list(): Promise<SkillCatalogEntry[]>;
  readBodies(refs: readonly SkillRef[]): Promise<SkillBodyReadResult[]>;
};
```

**用谁的身份读**：开这一轮的插件自己的调用方身份（`audience: "plugin"`、它的安装与授权交集），宿主只另写 `skill_round`。所以插件要在 Manifest 里声明 `skills:read` 并获授予，才能在自己开的一轮里用共同目录的技能——内置与第三方一样，Coding 的 Manifest 随 9-4 加这一项。插件没有 `skills:read` 时，目录读取被拒，这一轮只能用自己的技能，说明里写原因。

**唯一的例外**：`named_skills.from === "host"`（宿主委派、绑在执行方安装与 `run.start` 上）里的引用，宿主以委派那一轮的本人（`audience: "user"`，操作者、项目取自那次委派的调用上下文）读：本人已在助理里点了它们，执行方没有 `skills:read` 也能用这几项，别的项不跟着放开。

一轮只要有一项读不了（`SkillReadRefusal`，或插件缺 `skills:read`）就整轮不开，`agentErrors.capability_unavailable` 的说明写这一项的名称和原因，不跳过、不换版本（SKP-07）。`skill_owner` 随旧方法库删掉。

### 3.2 `tools` 只当说明：两道检查都改

统筹裁定第 3 条：共同目录技能的 `tools` 只当说明，永远不能扩大角色的 `host_tools`。

1. **开轮检查**（`index.ts` 现在对每个方法比 `tools ⊆ hostTools`，`role_execution_exceeded`）：只对「自己的」技能保留；共同目录的不比。
2. **适配层登记**（`adapters/prologue-methods.ts` 的 `inlineMethods` 把 `definition.tools` 原样登记，再 `prepareSkillIntent({ parentTools, hostTools })`，vendored SDK 对越界抛 `SKILL_PERMISSION_ESCALATION`）：登记给 Prologue 的清单改成 `definition.tools ∩ characterTools`。选求交而不是「不带工具」：留着技能与角色都有的工具，Prologue 里看得到这条技能用到了哪些。不动 vendored 包。

**现有断言**：`tests/agent-host.test.ts:715` 的「比角色宽、开轮被拒（`/未开放的工具/`）」用的是插件**自己的** `agent.skills`（`manifest.skills` 与 `authority.skills`），按本节它仍成立，原样保留；统筹裁定里「由底线测试替换」的前提是两类不分，这里分开后改成「保留它＋新增共同目录的底线测试」，记进偏离（第 10 节），不删、不放宽。

**底线测试**（SKC-13，新增）：

- Agent Host 层：给 Coding 角色选一个共同目录技能，声明了角色没有的 `change-capability`：开轮不再被拒，冻结记录的 `host_tools` 不含它。
- 适配层：同一轮登记给 Prologue 的技能清单 `tools` 不含 `change-capability`；用 Prologue 的工具表断言模型拿不到这个工具。
- 对照：「自己的」技能工具比角色宽，开轮仍被拒。

### 3.3 登记给 Prologue 的键

`inlineMethods` 的缓存键与 Prologue 技能 `id` 改成登记内容的摘要：对 `{ body, label, tools }`（`tools` 是求交之后的）做 SHA-256，`id` 取一个固定前缀加摘要前若干位（写手按 SDK 的 `id` 规则核长度与字符）。这样：

- 两个插件同名的 `skill_id`、自己的技能与目录里同名的，内容不同就是两项，不撞键；
- 升级后正文变了就是新键，不会读到旧缓存；原来「同版本正文变化」的拒绝随之删掉（它防的就是旧键读到新正文）；
- 同一份签名包装在项目和个人空间两处，内容相同，共用一项。

冻结记录与「这一轮用的是谁」仍按 `SkillRef` 记，键只是 Prologue 侧的登记身份。

### 3.4 一轮只取一次目录：读取次数表

| 一轮选了 N 个技能（N ≤ 20），其中 C 个来自共同目录 | 改之前（main `416ee8cef0`） | 改之后（要达到） |
| --- | --- | --- |
| 目录读几次 | N 次 `skillCatalog()`，每次 `library.list()` 分页读一遍 Prologue 存储（每页 100 条） | **1 次** `skills.catalog.list@1`（C = 0 时 0 次）；委派例外的几项与其余几项身份不同时，各 1 次，最多 2 次 |
| 正文读几次 | 方法库里的每个各 1 次 `library.read` | **1 次** `skills.body.read@1`，C 个引用一起（`SKILL_BODY_READ_MAX_REFS` = 20 = 选择上限，不会分批）；身份分两组时最多 2 次 |
| 宿主为每个请求读安装与设置几遍 | — | 每个请求一遍：`SkillCatalog.snapshot` 一次（安装记录、包、设置各一次） |
| 自己的技能 | 每个 1 次 `skillCatalog()` | 0 次 I/O（随安装登记的定义） |
| Prologue 存储 | N 次 `list` ＋ ≤N 次 `read` | 0 次（方法库删掉） |

**计数夹具**（`tests/agent-host-skill-reads.test.ts`，SKC-07 与本条）：选 20 个共同目录技能开一轮（全部同一身份），断言 `skillCatalog.list` 1 次、`skillCatalog.readBodies` 1 次且收到 20 个引用、`SkillCatalogPorts.skills` 每个请求 1 次；委派来 5 个、页面另选 5 个时各 2 次；选 0 个时都是 0 次。只数调用，不用时间。

助理一侧（9-2 同样写改前改后并断言）：现在 `methods()` 对每个签名方法各调一次 `bindSigned`（每次进项目库读安装记录）；改成读一次 `skills.catalog.list@1`，助理这一轮点名的方法开轮时一次 `skills.body.read@1`；用例选 20 个，断言项目库安装记录只读 1 遍。

### 3.5 编译期锁

照 09 批文件 9-5：`adapters/prologue-methods.ts` 断言合同的 `MAX_SKILL_BODY_CHARS`（`platform/plugin-agent`）与 `@prologue/sdk` 的同类型，一边改了另一边编译不过。

### 3.6 SKP-09（技能脚本执行）落在 9-5（结论）

第 08 批 #1902 小修第三条问落在 9-4 还是 9-5。**落 9-5，单列子片 9-5b**，理由：

- 执行脚本是 Agent Host 的事：脚本要在这一轮的权限岛和沙箱里跑，用的是角色已开放的 `run-command`，失败、超时、越权的如实报错都在 Agent Host 与 Prologue 适配层；Coding 只负责选、显示，不碰执行（能力包需求 §3：「技能正文与脚本的执行」归会跑脚本的 Agent）。
- vendored SDK 的技能核心里没有执行 `scripts/` 的现成接口（`dist/skill/` 只有 `api`、`core`、`plugin`），所以做法是：宿主经 `skills.resource.read@1` 按声明的路径读脚本、核摘要，放进这一轮的宿主临时目录（不写进用户的项目目录），沙箱规则只读放开这一个目录，脚本由模型在角色开放 `run-command` 时调起。角色没有 `run-command` 时技能照常能用，但脚本跑不了，说明里写原因。
- 它碰沙箱路径与命令执行，是安全边界：9-5b 自带一条不变量（`S-skill-scripts`：只跑声明过、摘要相符的脚本，只在这一轮的临时目录里、按角色的执行权限跑；读写项目目录照角色原样；超时与失败按失败报）与拒绝测试。
- 排在 9-5 之后；做不进本批时按第 8.4 节拿掉，记进下一批，SKP-09 跟着走。

## 4. 9-8 能力包合同

### 4.1 三种放法比较

| | 宿主扩展 Agent 定义登记 | `horizontal/` 新包读各主人 | 主人上报、汇总放 `horizontal/kit` |
| --- | --- | --- | --- |
| 做法 | 在 `apps/local-host/src/agent-definitions/` 里加能力包目录，直接读 Agent 定义、Characters、连接器、Agent Host 的 MCP 库与工具名单 | 新服务包按类读各主人的内部实现，再出目录 | 每个主人登记一个上报动作（同一对合同类型）；`kit.catalog.list@1` 用调用方自己的客户端在动作目录里按类型找到它们，各调一次，按登记盖来源后合并 |
| 事实主人 | 宿主读别人的内部实现，主人表与权限规则被绕过 | 同左，挪到另一个包 | 主人只读自己的，按自己的受众与权限给 |
| 插件同等待遇 | 第三方插件进不来，或要给宿主开分支 | 同左 | 第三方插件登记同一种上报动作就出现，宿主不改（CPK-12） |
| 耦合 | 宿主再多认识五个主人；已经很大 | 新包依赖 Characters、连接器、Agent Host | 汇总只依赖合同；主人加一个动作 |
| 授权 | 宿主读了再自己过滤，容易把只给本人的给出去 | 同左 | 用调用方客户端：调用方看不到的上报者根本不在它的目录里 |
| 调用次数 | 一次请求、多次库读 | 同左 | 一次请求、一遍目录发现、每个上报者一次调用 |
| 先例 | 08 的技能目录（它是登记本身，不是聚合） | — | `actions.usages.read`、系统搜索 `horizontal/search` |

**结论：主人上报；汇总放新包 `horizontal/kit`（`@molis-ai/molis-work-service-kit`），宿主在 `apps/local-host/src/kit-actions.ts` 装配**，照系统搜索（`horizontal/search` ＋ `search-actions.ts`）。理由：用户 2026-11-01 定「新的平台服务放 `horizontal/` 下的新包，不进宿主」；汇总很薄（预计一百多行），但它是平台服务，不是哪个主人的事实。它只依赖 `@molis-ai/molis-work-contracts`。

### 4.2 合同放在哪

| 文件 | 内容 |
| --- | --- |
| `packages/contracts/src/platform/kit-report.ts`（经 `platform/actions` 转出，像搜索来源协议） | 条目类型、上报的两个合同类型与 schema、`defineKitReportAction`、工具来源枚举 `KIT_TOOL_ORIGINS`。插件实现它，SDK 从 contracts 转出（同 `defineActionUsagesAction`） |
| `packages/contracts/src/services/kit.ts`（新子路径） | 描述符、`KIT_PROVIDER_ID = "system.kit"`、`KIT_READ_PERMISSION = "kit:read"`、`kitCatalogActions.list`、`kitErrors`、引用文件的类型 |
| `packages/contracts/src/services/agent-definitions.ts` | 加提示词改写的导出与导回三个动作与文件类型（第 4.7 节） |
| `apps/local-host/src/plugin-install-actions.ts`（宿主动作，`host-actions.tsv`） | 加 `plugins.package.export@1`，与 `plugins.install.preview`／`confirm` 同一个提供方（第 4.7 节） |

### 4.3 条目的公共字段

```ts
export const KIT_KINDS = ["skill", "prompt", "role", "tool", "mcp"] as const;
export type KitKind = (typeof KIT_KINDS)[number];
/** Where an Agent tool comes from (the Agent Host's tool set uses this type; contracts never import the Agent Host). */
export const KIT_TOOL_ORIGINS = ["runtime", "gateway", "business", "subagent", "plan-step", "builder"] as const;
export type KitToolOrigin = (typeof KIT_TOOL_ORIGINS)[number];

/** Where an entry comes from. Never a credential, an endpoint with a secret or a raw local path. */
export type KitSource =
  | { kind: "plugin"; plugin_id: string; title: string; version: string; install_id: string; publisher_label: string; trust: SkillPackTrust }
  | { kind: "system"; module: string; title: string }
  | { kind: "runtime"; package: string; version: string }          // the Agent runtime's own tools
  | { kind: "character"; character_id: string; title: string; revision: number }
  | { kind: "mcp_server"; owner: "project" | "connection"; server_id: string; label: string }
  | { kind: "outbound"; title: string };                            // Molis Work's own MCP server

export interface KitVersion {
  /** As shown: 「第 3 版」, a SemVer, a revision, an SDK version with its shape fingerprint. */
  label: string;
  /** The one kind of difference this class shows (capability-pack §4.2); absent when there is none. */
  change?:
    | { kind: "default_updated"; base_version: number; default_version: number }   // a prompt the person edited
    | { kind: "discovered"; added: number; removed: number; changed: number };     // an MCP server's last discovery
}

/** Declared, never granted (capability-pack §7). */
export interface KitDeclared { tools: string[]; permissions: string[]; connector_categories: string[] }

/** What the entry's usage can honestly say (capability-pack §4.4); never a total from records that keep only recent rows. */
export type KitUsage =
  | { kind: "recent"; count: number; last_at: string | null; kept: { rows_per_key: number } | { days: number } }
  | { kind: "last_only"; last_at: string }
  | { kind: "none" }              // no record of it
  | { kind: "not_counted" };      // tools: exact counts come with batch 61 (the page says so)

export type KitAvailability = { available: true } | { available: false; reason: string; detail?: string };

/** Where to change it: a path on the reporter's own surface (checked, §4.5). The kit itself changes only Skills' states. */
export interface KitManageLink { href: string; label: string }

/** What a reporter returns. `source` is stamped by the aggregator, never taken from a plugin reporter (§4.5). */
interface KitReportedCommon {
  /** Stable within its reporter; with the reporter it identifies the entry. */
  entry_id: string;
  name: string;
  description: string;
  version: KitVersion;
  declares: KitDeclared;
  /** The project of the call context, or the personal space (shown as 「个人空间」). */
  scope: "project" | "home";
  /** Where it takes effect, in the owner's words: the roles it is open to, the features a prompt serves, who an MCP server is for. */
  where: string[];
  availability: KitAvailability;
  usage: KitUsage;
  manage?: KitManageLink;
  /** How it leaves this Home (§4.7). */
  export: "package" | "user_data" | "reference" | "none";
  /** Only a named system reporter may give one (§4.5); a plugin reporter's entries get its own installation. */
  source?: KitSource;
}

export type KitReportedEntry =
  | (KitReportedCommon & { kind: "skill"; skill: SkillCatalogEntry })
  | (KitReportedCommon & { kind: "prompt"; ref: { owner_id: string; prompt_id: string }; prompt: { use: "agent" | "instruction"; edited: boolean } })
  | (KitReportedCommon & { kind: "role"; ref: { owner_id: string; role_id: string } | { character_id: string }; role: { subagent: boolean; execution?: AgentRoleExecution } })
  | (KitReportedCommon & { kind: "tool"; ref: { tool: string }; tool: { origin: KitToolOrigin; writes: boolean } })
  | (KitReportedCommon & { kind: "mcp"; ref: KitMcpRef; mcp: KitMcpState });

/** One entry as `kit.catalog.list` returns it: the source and reporter the aggregator stamped. */
export type KitEntry = KitReportedEntry & { source: KitSource; reporter: { provider_id: string; title: string } };

export type KitMcpRef =
  | { part: "server"; owner: "project" | "connection"; server_id: string; configuration_version: number }
  | { part: "action_tool"; action: ActionReference }                              // registered as an action: the action directory's entry
  | { part: "tool" | "prompt" | "resource"; server_id: string; name: string }     // listed by the server, not an action
  | { part: "outbound"; client_id: string };

/** The three different 「开」, each said for what it is (capability-pack §4.3). */
export interface KitMcpState {
  /** The server is switched on in its settings. */
  server_enabled?: boolean;
  health?: "connected" | "disconnected" | "unavailable" | "not-reattached";
  /** Its tool's action is callable now. */
  action_available?: boolean;
  /** Clients Molis Work's own MCP server is open to: a known Runtime by batch 22's `ExternalToolId`, or another client by its id. */
  granted_to?: Array<{ client_id: string; title: string; external_tool?: ExternalToolId }>;
}
```

- 技能条目：`skill` 原样是 `SkillCatalogEntry`；外层的 `name`、`description`、`availability`、`declares.tools`、`declares.connector_categories` 从它抄，`usage` 来自 `skill_uses`，状态与启用操作照 08（CPK-01、CPK-03）。不改 08 的类型。
- `KitAvailability.reason` 是主人自己的原因码（技能是 `SkillUnavailableReason`），`detail` 是给人看的字，界面按 `manage` 给去处。
- 上限（schema 写死）：`name` ≤200 字，`description` ≤2000，`where` ≤20 项各 ≤200，`declares` 各 ≤64 项，一个上报者 ≤2000 条。
- 不带提示词正文、改写原文、凭据、端点、本机路径（MCP 服务器的 `directory`、`executable`、`argv`、`endpoint` 都不进条目），schema 里也没有放它们的字段（CPK-09）。

### 4.4 各类条目的取值

| 类 | 上报者（主人） | `ref` | 版本与差异 | `where` | 状态与去处 | `usage` |
| --- | --- | --- | --- | --- | --- | --- |
| `skill` | 只认 `system.skills` | `SkillRef`（在 `skill` 里） | `pack.version` 与 Skill 的整数版本 | `applies_to`、启用范围 | 三档，就地改；`requires_unmet` 等照 08 给去处 | `skill_uses`：`recent` |
| `prompt` | Agent 定义登记（新 provider `system.agent-definitions`） | `owner_id`＋`prompt_id` | 默认版本；有改写且默认更新了给 `default_updated` | `used_by` | 只看；去「提示词」页 | `prompt_uses`：`recent`，`kept.rows_per_key = 200` |
| `role`（插件角色、子代理） | 同上 | `owner_id`＋`role_id` | 角色声明的版本 | 用到它的插件功能；第 36 批之后加作用范围 | 只看；去 Characters／第 36 批的角色设置 | `prompt_uses`：`recent` |
| `role`（Character） | `modules/characters` | `character_id` | 修订号 | 第 36 批之前只给声明与来源 | 同上 | `character_runs`：`recent` |
| `tool` | Agent Host 的工具全集（第 5 节）；上报动作 `agent.tools.kit.report@1` 由宿主装配处登记，随 9-10 | 工具名 | 系统工具：SDK 包版本＋形状指纹；平台工具：产品版本 | 开放给哪些角色 | 只看，不能开关 | 能便宜取到最近一次就 `last_only`，否则 `not_counted`（用户 11-08 定：精确次数随第 61 批） |
| `mcp`（项目 MCP 服务器与其工具、资源） | Agent Host 的 MCP 库（读已存视图） | `server`／`action_tool`／`tool`／`resource` | 最近一次发现的差异 | 哪个插件的设置 | 「开」分开写；去 Coding 的 MCP 设置 | 已登记成动作的工具读动作调用记录：`recent`（只留近期）；未登记的 `none` |
| `mcp`（连接带的 MCP） | 连接器 `horizontal/connector-host` | 同上，`owner: "connection"` | 同上 | 哪个连接 | 去「服务连接」 | 同上 |
| `mcp`（对外：Molis 自己的 MCP 服务器、`goal-advance` Skill） | 对外接入的主人（`mcp-settings-store` 与安装器） | `outbound` | 产品版本 | 开给哪些客户端（`action_grants`，已知运行时按 `ExternalToolId`） | 去「对外接入」 | `none`（对外调用另有调用记录，09 不读） |

签名角色只上报一次：`methods()` 去掉 `kind: "role"`（第 2.2 节）。创作台的 `BUILDER_PROMPTS` 若不在 Agent 定义登记里，不上报，记候选（主人创作台，随 BL-377）。

**「用在哪」**：动作与 MCP 工具复用 `actions.usages.read`，在条目详情打开时按需调一次（这是「用在哪」，不是正文）；技能、提示词、角色的 `where` 由主人在上报里给。

### 4.5 上报协议与来源盖章

```ts
export const KIT_REPORT_INPUT_TYPE = /* @version type.molis.kit-report.input "molis.kit-report.input.v{version}" */ "molis.kit-report.input.v1";
export const KIT_REPORT_OUTPUT_TYPE = /* @version type.molis.kit-report.output "molis.kit-report.output.v{version}" */ "molis.kit-report.output.v1";
export interface KitReportInput { kinds?: KitKind[] }
export interface KitReport { entries: KitReportedEntry[] }

/**
 * One owner's report of its own kit entries in the call's scope. Read-only, never connects a server, calls a tool or refreshes a
 * credential. A reporter outside a kind asked for answers no entries. Audiences are the owner's rule, `user` at least.
 */
export function defineKitReportAction(capabilityId: string, version: number, title: string, permissions: string[],
  options?: { scope?: "project" | "home"; audiences?: ActionAudience[] }): ActionDefinition<KitReportInput, KitReport>;
```

- 默认 `scope: "home"`、`audiences: ["user"]`、`kind: "query"`；不等模型，不声明 `concurrent`。
- 输出 schema 封闭，派发处按它校验：多一个字段（比如 `body`）这个上报者的整份回答作废，进 `issues`。

**汇总处盖章（来源与信任不取自上报者，照 `action-usage-actions.ts` 的 `source`／`reporter`）：**

| 上报者 | 能报的类 | `source` 怎样来 |
| --- | --- | --- |
| 插件的提供方（登记里 `kind: "plugin"`） | `prompt`、`role`、`tool`、`mcp`；不能报 `skill` | 汇总处按它的登记与安装记录盖：`{ kind: "plugin", plugin_id, title, version, install_id, publisher_label, trust }`；回答里自带的 `source` 一律丢掉 |
| 点名的系统提供方（`horizontal/kit` 里一张小表，键是提供方 id，写手按实际登记核） | 表里给它的类 | 表里允许的来源种类内用它给的 `source`；超出就丢掉这一条、进 `issues` |

系统提供方表（初稿）：`system.skills` → `skill`，来源 `plugin`（它从安装记录得来，是这件事的主人）；`system.agent-definitions` → `prompt`、`role`，来源 `plugin`、`system`；工具上报者 → `tool`，来源 `runtime`、`system`；Characters 的提供方 → `role`，来源 `character`；Agent Host 的 MCP 库上报者与连接器 → `mcp`，来源 `mcp_server`；对外接入的上报者 → `mcp`，来源 `outbound`。`skill` 类只认 `system.skills`。这张表是信任边界，不是能力名单：上报者照样按合同类型发现，表只管「谁可以替别人说来源」。

**`manage.href`**：只能是同源路径，且在上报者自己的地方：插件上报者只能指向它自己的页面路径（宿主按它的登记算出的前缀），系统提供方只能指向宿主的设置路径。不合的去掉这条的 `manage`、条目保留，记一条 `issues`。

同一上报者的 `entry_id` 重复，报 `kit.report_invalid`，该上报者进 `issues`。

### 4.6 `kit.catalog.list@1`

| 项 | 取值 |
| --- | --- |
| 提供方 | `system.kit`，Home 级登记一次（每个项目看到同一个查询） |
| 谁能调 | `audiences: ["user"]`，`permissions: ["kit:read"]`（宿主在 `local-owner-permissions.ts` 给本人）。Agent、插件、MCP 调用被拒（CPK-09）；以后第 61、63 批要读时按类开受众，每个上报动作仍按主人的规则过滤（能力包需求 §6） |
| 输入 | `{ kinds?: KitKind[] }`，`additionalProperties: false`；范围从调用上下文来 |
| 输出 | `{ entries: KitEntry[]; issues: Array<{ provider_id: string; title: string; message: string }> }` |
| 怎样汇总 | 用调用方自己的客户端 `discover` 一次，按两个合同类型过滤出上报者；对每个可用的上报者 `invoke` 一次（并行），输入原样带 `kinds`；按第 4.5 节盖章与核对；不可用的、拒绝的、超时的写进 `issues`，不拖垮整页 |
| 调用次数 | 打开目录：1 个请求；其中 1 遍目录发现、每个上报者 1 次调用、各自一遍授权核对。详情不另读正文（技能的开头在 `excerpt` 里）；只有 MCP 工具与动作的「用在哪」按需另调一次 `actions.usages.read` |
| 调度 | 照 `actions.usages.read` 声明 `scheduling: "concurrent"`：它在等别的提供方的动作，不提交任何东西，不需要 `beforeEffect` |
| 搜索 | 目录页内搜（照 08），系统搜索不收能力包条目 |

### 4.7 导出与导回

按类，每类走主人的路；导出、导回都只给本人，不开给 Agent、工作流、插件与 MCP（CPK-09）。第 09 批交最小路径（导出、导回、版本核对），完整体验在第 72 批。

**技能：`plugins.package.export@1`**（插件安装服务，与 `plugins.install.preview`／`confirm` 同一个提供方，`audiences: ["user"]`）

```ts
export interface PluginPackageExportRequest { install_id: string }
export interface PluginPackageExport {
  plugin_id: string; version: string;
  /** The key the kept package is signed with: this Home's own for `home_local`, the third party's for `pinned`. */
  publisher_key_id: string;
  filename: string;
  media_type: "application/json";
  /** The signed bundle JSON exactly as `SandboxPackageStore` keeps it from the install: never re-signed, never re-encoded. */
  content: string;
}
```

- 只导内容包（`kind: "content"`）。导出的就是 `SandboxPackageStore` 里安装时留存、验过签的 bundle JSON，原文本，**不重新签名**：本机做的、本机导入的本来就是这个 Home 的发布身份签的（`home_local`），第三方的带原签名（`pinned`），所以「第三方不被换成本机签名」由「从不重签」保证（CPK-06）。
- 下载路由现在定：`GET /api/plugins/packages/:install_id/export`，宿主受保护入口，只认本人、拒插件页面（`pluginPageRequest`），调同一个动作，加 `Content-Disposition: attachment`。界面用路由下载，动作是授权所在，两条路同一份字节。
- 拒绝（`plugin.export_unavailable`，`details.reason`）：`host_build`（随宿主构建的内置插件，没有可分发的包，条目 `export: "reference"`）、`not_content_package`（带运行代码的应用包，只带引用）、`package_missing`（留存的包读不到或验签不过）。
- 导回走 08 的 `plugins.install.preview`／`confirm`，不另开。内容包白名单不加键。

**提示词改写**（Agent 定义登记，`agent_definitions` 主人；都是 `audiences: ["user"]`；文件是用户数据，不是插件）：

```ts
/** A file the person keeps: their own edits of prompts, never a package and never installed. */
export interface PromptOverridesFile {
  format: "molis.prompt-overrides";
  format_version: 1;                 // tooling/versions.json: file.molis.prompt-overrides
  exported_at: string;
  /** At most `PROMPT_OVERRIDES_FILE_MAX_ROWS` (200); each `body` at most `AGENT_PROMPT_MAX_CHARS`. `title` is a reminder only. */
  overrides: Array<{ owner_id: string; prompt_id: string; title: string; base_version: number; body: string }>;
}
```

| 动作 | 输入 | 输出 |
| --- | --- | --- |
| `agent-definitions.prompt-overrides.export@1`（query） | `{ keys?: string[] }`（不给就是全部改过的） | `PromptOverridesFile` |
| `agent-definitions.prompt-overrides.import.preview@1`（command，不写） | `{ file: PromptOverridesFile }` | `{ preview_id; rows: Array<{ row_id; owner_id; prompt_id; title; base_version; default_version: number \| null; status: "applicable" \| "base_mismatch" \| "prompt_missing" \| "same"; diff: DiffView }> }`；`title` 取登记表里这个提示词的标题，不用文件里的；`diff` 用 SDK 已有的逐行文本比较（`packages/plugin-sdk/src/diff-view.ts` 的 `compareChange`） |
| `agent-definitions.prompt-overrides.import.confirm@1`（command，要 `user_action`） | `{ preview_id; row_ids: string[] }` | `{ applied: Array<{ key; revision }>; skipped: Array<{ row_id; reason }> }` |

- 文件超过 200 行、某行 `body` 超过 `AGENT_PROMPT_MAX_CHARS` 的，预览整份拒绝（输入 schema 写死上限）。
- 预览绑定发起的本人与项目，只用一次（照 `skills.import.preview`）；别人、别的项目、第二次确认都是 `agent_definitions.overrides_preview_unknown`。
- 只有 `applicable` 的行能确认；`base_mismatch`（文件基于的版本不是现在的默认版本）、`prompt_missing`（主人不在了）标出、不套用，确认里点了它们报 `agent_definitions.overrides_row_not_applicable`。写入经主人现有的改写保存（带修订号），与在「提示词」页保存同一条路。
- 这三个是提示词改写第一次成为动作；它们只服务导出导回，不是在能力包里改提示词的入口（能力包需求 §4.3 那一步仍要另问用户）。见第 11 节待决 D-3。
- 装任何包都不改提示词：内容包白名单不变，`S-content-package` 加一条断言（第 4.9 节）。

**角色、工具、MCP：引用文件**（能力包目录页读写，没有动作）

```ts
export interface KitReferencesFile {
  format: "molis.kit-references";
  format_version: 1;                 // tooling/versions.json: file.molis.kit-references
  exported_at: string;
  entries: Array<{ kind: "role" | "tool" | "mcp"; ref: KitReportedEntry["ref"]; name: string; source_title: string; needs?: { connector_categories: string[] } }>;
}
```

导回时页面读文件，调一次 `kit.catalog.list@1`，逐条按 `kind`＋`ref` 对：在的标「已有」，不在的标「用不了」并按 `needs` 给去处（去添加插件、去连接）。文件里没有服务器配置、端点与凭据，类型上就放不进去。解析写在工作台页面代码里（只有平台用），不进合同包（合同包不放 20 行以上的函数）。

两种新文件格式进 `tooling/versions.json` 并按「持久化格式」登记（写手核 `scripts/gates/initial-versions.mjs` 的名单）；第 1 版，没有升级段。

### 4.8 §9 的边角

| 边角 | 合同怎样处理 |
| --- | --- |
| 主人不在了 | 插件卸载后，它的技能、提示词、角色不再上报，目录里没有它们；用量历史仍在各自主人那里（`skill_uses` 保留当时的名称与 `SkillRef`，08）。删掉的 MCP 服务器、Character 同样。能力包不为已不在的东西造「已删除」条目 |
| 文字 | 条目是每次调用现算的，不存：插件的名称与说明按调用上下文的 `locale` 取它的语言文件或 `ui.translations`（同 08 技能目录的做法）；平台工具的说明在第 16 批前照当时写法（`L`），第 16 批切换时一起转成键与语言文件（16 批文件已注）。代码不拿译文做判断：筛选、匹配都按 `kind`、`ref`、原因码 |
| 范围 | 目录按调用上下文的项目汇总，带个人空间的条目，`scope: "home"` 的标「个人空间」；不带项目时只有个人空间 |
| 搜索 | 页面内搜；系统搜索不收 |
| 调用次数 | 第 4.6 节 |

### 4.9 错误码与安全不变量

**错误码**：

- `defineErrorCodes("kit", { report_invalid: "invalid" })`（上报者回答里 `entry_id` 重复）。`tooling/gates/error-owners.json` 新加 `kit` 一条（`packages/contracts/src/platform/kit-report.ts`、`packages/contracts/src/services/kit.ts`、`horizontal/kit/`、`apps/local-host/src/kit-actions.ts`），带理由；主会话 2026-11-09 按 AGENTS.md「新的包或区域先在表里加一条」定为加，不再问用户。
- `plugin.export_unavailable: "not_found"`，加在插件安装服务现有的错误声明里（`plugin` 主人，写手核它的路径已在表里）。
- `agent_definitions.overrides_preview_unknown: "not_found"`、`agent_definitions.overrides_row_not_applicable: "conflict"`，声明在 `packages/contracts/src/services/agent-definitions.ts`；`error-owners.json` 的 `agent_definitions` 一条加这个路径。

**新不变量 `S-kit-catalog`**（独立记录，`tests/security-invariants-kit-catalog.test.ts`）：

> 能力包目录只给本人：`kit.catalog.list@1` 只收 user 受众，用调用方自己的客户端发现并调用上报者，调用方看不到的上报者不调；上报回答按封闭 schema 校验，带正文、凭据、端点或路径的整份作废；来源由汇总处按登记与安装记录盖章，插件上报者不能给自己报别的来源、不能报技能，只有点名的系统提供方能报 `system`／`runtime`／`outbound` 等来源；`manage.href` 只能指向上报者自己的地方；列目录不连 MCP 服务器、不调工具、不刷新凭据；包导出与提示词改写的导出导回只给本人，确认要受保护入口；导出不重签。

拒绝测试：

1. Agent、插件、MCP 客户端调 `kit.catalog.list@1` 被拒。
2. 本人看不到的上报者（只给插件受众）不被调用。
3. 假上报者回答多带 `body`：整份作废进 `issues`。
4. 插件上报者在条目里自称 `source: { kind: "system" }` 或别的插件：汇总后的 `source` 是它自己的安装。
5. 插件上报者报 `kind: "skill"`：这一条丢掉进 `issues`。
6. 非点名的系统提供方报 `runtime`／`outbound` 来源：丢掉进 `issues`。
7. 插件上报者的 `manage.href` 指向别的插件页面、宿主设置页或外站：`manage` 被去掉。
8. 列一份有项目 MCP 与连接 MCP 的目录：`AgentMcpLibrary.control`／`call` 与连接器刷新的调用次数为 0。
9. Agent 调 `plugins.package.export@1` 与三个提示词改写动作被拒；没有 `user_action` 的确认被拒；插件页面请求下载路由被拒。
10. 导出的第三方包字节与留存的一致、签名者不变。
11. 提示词改写预览：别人、别的项目、用过一次的 `preview_id` 确认被拒；`base_mismatch` 的行确认被拒；超上限的文件预览被拒。

`S-content-package` 加一条：装一个内容包前后，所有提示词的有效正文与改写记录不变。

## 5. 9-9 工具全集与 MCP 收口

### 5.1 工具全集在 Agent Host 一处

新文件 `horizontal/agent-host/src/tool-catalog.ts`：

```ts
import type { KitToolOrigin } from "@molis-ai/molis-work-contracts/platform/kit-report";
export interface AgentToolEntry {
  /** The name roles' `host_tools` use. */
  name: string;
  origin: KitToolOrigin;
  /** The runtime's own name, for a `runtime` tool (must be in the SDK's `SYSTEM_TOOL_NAMES`). */
  runtime_name?: string;
  /** May change files, data or the outside world. */
  writes: boolean;
  description: string;
}
export const AGENT_TOOLS: readonly AgentToolEntry[];
/** SDK tools the Host does not offer as a role's tool, each with why (replaces `prologue-taskboard.ts`'s handwritten exclusions). */
export const RUNTIME_TOOLS_NOT_OFFERED: ReadonlyArray<{ runtime_name: string; why: string }>;
export function isAgentTool(name: string): boolean;
```

- 由现有名单派生，不重抄：`GATEWAY_TOOLS`、`childRoleTools` 的取值范围、`STEP_TOOLS`、创作台适配层的 `TOOLS`、合同的 `BUSINESS_HOST_TOOLS`，加上宿主名到 SDK 名的映射（今天在 `prologue-node-kit.ts`）里的系统工具。这几个名字原来的位置改成从这里取，不再各自声明字面量。
- `prologue-taskboard.ts:31` 现在手写的排除（`board-report`、`board-wait`、`session-send`、`command-output`、`await-commands`、`APP_MODE_SURFACE_TOOLS`）改读 `RUNTIME_TOOLS_NOT_OFFERED` 与条目，不另起一份清单。
- 呈现不进全集：`assistant-present.ts` 的名字到动词表留在助理（呈现归它），只是键改成受全集约束——类型写成以全集名字为键，或加一条测试断言表里每个名字都 `isAgentTool`。A 轨文件，排在 `b09/delegation` 之后（第 8 节）。
- 合同里只留 `BUSINESS_HOST_TOOLS`、`SKILL_TOOLS`（作者写声明要用）。`SKILL_TOOLS` 的注释补上为什么没有 `change-reversible`：它是可撤回的改动不经本人确认直接执行的通道，由角色的执行方式与本人「每次确认」的设置授予；一段技能文字不能替本人决定跳过确认，所以技能不能声明它。
- 工具上报动作 `agent.tools.kit.report@1` 不在 9-9 做，随 9-10（`b09/kit`）由宿主装配处登记，条目来自 `AGENT_TOOLS` 与各角色的 `host_tools`。

### 5.2 两条检查

1. **`host_tools` 不在全集即拒**：Agent Host 核一个插件的角色声明时（`roles` 的可用性检查，与 `assertBusinessRole` 同一处），`host_tools` 里有 `isAgentTool` 认不出的名字，这个角色不可用，原因写出那个名字；插件装配时就看得到，不等开轮。错误码 `agent.role_tool_unknown`。SDK 的声明检查做不了这一条（SDK 不能依赖 Agent Host），所以只在这里。
2. **与 SDK 对齐的测试**（`tests/agent-host-tool-catalog.test.ts`，CPK-07）：每个 `origin: "runtime"` 的条目，`runtime_name` 都在 `SYSTEM_TOOL_NAMES` 里；`SYSTEM_TOOL_NAMES` 的每一项要么被某个条目映射，要么在 `RUNTIME_TOOLS_NOT_OFFERED` 里。换包时多了、少了、改名了都红。另一条：内置插件所有角色的 `host_tools` 都过第 1 条检查。

### 5.3 MCP 收口

- Coding 设置页 `plugins/native/coding/src/browser/settings/mcp.ts` 自己声明的 `McpServer` 删掉，改用 `AgentMcpServerView`（`services/agent-host`；`WorkExecutorState.mcp` 已经是它）。B 轨文件。
- `apps/mcp/src/tool-catalog.ts` 的 `MANAGEMENT_GOAL_TOOL_NAMES` 从 `goal-tools.ts` 的定义派生，不再写一遍；`docs/mcp.md` 补这三个工具。
- MCP 上报只读已存的清单（`AgentMcpLibrary.catalog()` 的安全视图、连接器已存的工具清单、`action_grants`），不为列目录去连服务器（第 4.9 节的拒绝测试）。
- 两条「MCP 工具登记成动作」的流水线合并、运行时登记的 MCP 动作进快照：不在本批，照能力包需求 §8 记 BL。
- GLOSSARY（随 9-7）区分「Agent 工具」（`AGENT_TOOLS`，角色 `host_tools` 里的名字）与「外部工具」（第 22 批 `platform/external-tools` 的 `EXTERNAL_TOOLS`，Codex、Claude Code 这类本机运行时产品）。

## 6. 开工前检查

### 6.1 能力包部分（9-8～9-12，以能力包需求 §10 为底）

| # | 项 | 答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。技能归插件声明与 Agent 定义登记（08）；提示词、插件角色归 Agent 定义登记；Character 归 `modules/characters`，作用范围与继承归 36；工具全集归 Agent Host；项目 MCP 归 Agent Host 的 MCP 库，连接带的 MCP 归连接器，对外 MCP 归对外接入。能力包只汇总，`horizontal/kit` 不存任何东西；来源由汇总处按登记盖章，不由上报者自称。两份新文件是用户自己的数据，主人是导出它的主人 |
| 2 | 插件同等待遇 | 上报者按合同类型发现，宿主不点名；第三方插件登记 `defineKitReportAction` 就进目录（CPK-12）。系统提供方表只管「谁能替别人说来源」，插件给自己说来源的规则与内置插件一样 |
| 3 | 能力注册 | `kit.catalog.list@1`、每个上报动作、`plugins.package.export@1`、三个提示词改写动作各登记一次；可信身份（项目、操作者）取自调用上下文。只有汇总声明 `concurrent`（等别的提供方，不提交） |
| 4 | 合同 | 新增 `platform/kit-report.ts`、`services/kit.ts`；`services/agent-definitions.ts` 加动作；宿主 `plugins.package.export@1`；两种文件格式进 `tooling/versions.json`；刷新 `tooling/gates/api/`（新子路径 `services/kit`、`platform/actions`）与 `tooling/gates/actions/`（`host-actions.tsv` 新增几行）。阶段一，不留兼容；没人在等这份合同，随本批 PR，不单开 |
| 5 | 放在哪个包 | 汇总 `horizontal/kit`（第 4.1 节比较）；宿主只在 `kit-actions.ts` 装配。工具全集在 `horizontal/agent-host`，它用合同的 `KitToolOrigin`。新包要登记包清单、归属、README「开发要求」 |
| 6 | 表与存储 | 不新增表。用量读 `skill_uses`、`prompt_uses`、`character_runs`、动作调用记录；提示词改写预览存内存一次性用 |
| 7 | 兼容与迁移 | 不加。MCP 流水线合并移出本批 |
| 8 | 安全边界 | 碰：新不变量 `S-kit-catalog`（第 4.9 节 11 条拒绝），`S-content-package` 加断言 |
| 9 | 调用次数 | 打开目录 1 个请求、1 遍目录发现、每个上报者 1 次；不连 MCP；`prompt_uses` 等按键批量读，一个上报者内不逐条开库（写手按 N42～N44 量） |
| 10 | 升级与数据 | 技能照 08；提示词显示基于的版本与默认版本，导回时版本对不上不套用；MCP 显示发现差异；导出不重签，升级后的包照常导 |
| 11 | 成果与过程项 | 导出的文件是给人留存的文件，不进成果库（与 08 的内容包一样）；Character 定义沿用已有成果类型 |
| 12 | 页面、外壳与文字 | 能力包目录是设置里的一节，先定样（9-11）；条目文字按第 4.8 节；不加 DOM 事件（要加就登记）；下载走宿主受保护路由；页面资源增长写明，超 10 KB 先问 |
| 13 | 错误 | `defineErrorCodes`，第 4.9 节；主人表加 `kit` 一条（主会话已定） |
| 14 | 冲突面 | `agent-definitions/`（C）、`agent-host-composition.ts`（C）、`plugin-install-actions.ts`（C）、`horizontal/agent-host`（C2）、`modules/characters`（规则 7）、`apps/mcp`（C）、Coding 设置页（B）、`assistant-present.ts`（A）、设置页与组件板（D）；枢纽：`tooling/gates/actions/host-actions.tsv`、`tooling/gates/api/`、`tooling/versions.json`、`tooling/gates/error-owners.json`、`docs/system/security-invariants/` |
| 15 | 全局最优 | 插件：上报合同对第三方同样开放，作者只多写一个动作。平台：不建第二份名单，复用使用位置与系统搜索的上报模式；放 `horizontal/` 守 11-01 的规矩。助理：先不开口，Agent 继续读 08 的 `skills.catalog.list@1`，以后按类开受众不用改上报者。各类平台能力：授权、连接、MCP 调用链不动；第 74 批的统计读同一批记录。后续开发：再加一类能力只加一个上报者（系统提供方再加表里一行）；第 61-3 批的候选读上报不另建；第 72 批在同两种文件上补冲突与恢复。多付代价的是 9-10：每个主人都要写一个上报动作，比宿主直接读多几处，换来主人边界与第三方可用 |

### 6.2 助理与 Coding 接点（9-1～9-7，以 09 批文件第五节为底）

| # | 项 | 答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。技能目录与启用归 Agent 定义登记（08）；一轮用了哪些技能归运行记录的冻结（`frozen.skills`，含 `ref` 与 `named`）；点名名单不是事实，是一次调用绑定的上下文，不落库。Coding 会话里存的是选择，改存 `SkillRef` |
| 2 | 插件同等待遇 | 助理与 Coding 读同一目录；`consumer` 按角色的工作区定、不按插件名；页面点名走所有插件共用的信封，只对自己的技能有效；读目录用插件自己的身份、要 `skills:read`，内置与第三方一样；委派来的引用对任何执行方都一样可读 |
| 3 | 能力注册 | 不新增动作；`run.start` 是工作执行方现有角色，读正文用 08 的动作。都不等模型 |
| 4 | 合同 | 改：`ActionCallContext` 加 `named_skills`（绑定安装与动作）、`skill_round`，改 `locale` 注释；`run.start` 加 `skills`（原版本改）；`AgentSkillRef`、方法库端口、`AgentSkillsCapability` 删；`SignedAgentReference` 只剩角色；`AssistantMethodSelection` 分两种；`assistant.methods.read@2` 只收角色；`frozen.skills` 每项改形状、加 `frozen.reply_locale`；SDK 拒绝 `agent.skills` 与 `methods` 重名。刷 `api` 与 `actions` 快照，PR 写对 Coding、助理与第三方执行方的影响（第三方执行方要声明 `skills:read` 才能用页面点的目录技能） |
| 5 | 放在哪个包 | 不新建包：助理 `apps/local-host/src/assistant/`；Coding `plugins/native/coding/`；冻结 `horizontal/agent-host/`；上下文绑定与信封在宿主派发处 |
| 6 | 表与存储 | 不新增表；删 Prologue 存储里的 `molis-coding-method`（已定不认不迁）；Coding 会话键只改值的形状 |
| 7 | 兼容与迁移 | 不加。`methods:<会话>` 与助理历史材料的存量等用户定（第 2.7 节，D-2）；推荐不认不迁 |
| 8 | 安全边界 | 碰：新不变量 `S-skill-delegation`（第 2.6 节 12 条拒绝）；`S-skill-catalog` 改位置；9-5b 另加 `S-skill-scripts` |
| 9 | 调用次数 | 第 3.4 节读取次数表与计数夹具；助理 `methods()` 改成一次取 |
| 10 | 升级与数据 | 一轮冻结精确版本；升级、换安装后存着的选择不再是当前的，提示重选，不悄悄换（SKP-07）；Prologue 登记键按内容摘要，升级不读旧缓存 |
| 11 | 成果与过程项 | 不涉及：技能不产成果，Coding 报告不变 |
| 12 | 页面、外壳与文字 | 不新增页面；两处菜单（`assistant-composer.ts`、Coding 的 `slash-menu.ts`／`palette.ts`）改读目录，Coding 菜单对别的插件的 `manual` 技能标「只能在助理里点名」；不加 DOM 事件；Coding 页面资源量一下，超 10 KB 先问 |
| 13 | 错误 | 新码 `coding.server.method-stale`（B）、`agent.role_tool_unknown`（C2）；Coding 现有 `coding.server.method-*` 核一遍写法 |
| 14 | 冲突面 | 第 8 节，含与第 10 批 #1991 的重叠 |
| 15 | 全局最优 | 插件：任何执行方（含第三方沙箱执行方）同一条信任路，绑定的上下文字段替掉只在宿主进程里成立的存储。平台：沿用 `original_input` 的绑定、`call_id` 的逐轮带法，不另造。助理：点名一次，自己用和交给执行方用同一份。各类平台能力：技能目录（08）不改；能力包读同一份 `SkillCatalogEntry`。后续开发：第 12 批只等 9-1～9-5；第 41 批的选用照读 08 目录；第 61 批的组合候选可读 `frozen.skills`；以后宿主出一个能嵌进插件页面的技能选择器时，跨插件点名多一个宿主入口，合同不用改 |

## 7. 验收对照表

| 编号 | 片 | 证明它的测试或走查 |
| --- | --- | --- |
| CPK-01 | 9-10、9-11 | `tests/kit-catalog.test.ts`（五类都出、按类筛、技能条目与 `skills.catalog.list@1` 逐字段一致）；页面走查 |
| CPK-02 | 9-10、9-2、9-4 | 同上；同一技能在能力包、助理、Coding 三处的 `SkillRef` 与 `pack.version` 相等（`tests/skill-shared-catalog.test.ts`）；来源盖章（`S-kit-catalog` 第 4 条） |
| CPK-03 | 9-10、9-11 | `tests/kit-catalog.test.ts`：只有技能条目有改状态的操作，其余只有 `manage`；MCP 三种「开」各一个字段；代码里搜不到能力包自己的启用状态 |
| CPK-04 | 9-10 | `tests/kit-catalog.test.ts`：`prompt_uses` 写满 200 行后 `usage.kind === "recent"`、`kept.rows_per_key === 200`；工具 `not_counted`；没有能力包用量表（表主人门禁） |
| CPK-05 | 9-1～9-5 | `tests/skill-shared-catalog.test.ts`（SKP-02、SKP-04、SKC-07）；`tests/coding-work-executor.test.ts` 新用例：助理点名的技能进 Coding 的冻结记录 `named: true`，与会话里存的选择合并（CHO-03） |
| CPK-06 | 9-10 | `tests/kit-export.test.ts`：本机导入的包导出装进另一个临时 Home 可用、版本相同；第三方包导出字节与留存一致；提示词改写 `base_mismatch` 不套用、逐条确认；引用文件不含凭据与端点 |
| CPK-07 | 9-9 | `tests/agent-host-tool-catalog.test.ts`；`host_tools` 未知名的拒绝用例 |
| CPK-08 | 9-12 | 收口表逐行 `git grep` 结果写进 PR；BL 与候选每条带主人与去处 |
| CPK-09 | 9-1、9-10 | `tests/security-invariants-skill-delegation.test.ts`（第 2.6 节 1～12）、`tests/security-invariants-kit-catalog.test.ts`（第 4.9 节 1～11） |
| CPK-10 | 9-7、9-12 | 文档 diff：SSOT、`PACKAGE-BOUNDARIES.md`（含第 4.1 节比较）、作者手册「怎么做能力包」、GLOSSARY（能力包与组件板 kit、Agent 工具与外部工具） |
| CPK-11 | 9-11 | `[人工]` 本人验收 |
| CPK-12 | 9-10 | `tests/kit-catalog.test.ts`：样例插件（`examples/plugin-sample` 风格的测试夹具）登记上报动作，不改宿主就出现；它只拿到调用方的权限，来源被盖成它自己 |
| SKP-02、SKP-04、SKC-07 | 9-2、9-4、9-5 | `tests/skill-shared-catalog.test.ts`；`tests/assistant-methods.test.ts`、`plugin-methods-runtime.test.ts` 的旧「按动作过滤」断言改成读目录（预期变化，PR 写明） |
| SKP-03 | 9-4 | `applies_to: "assistant"` 的技能不在 Coding 的菜单与目录读里 |
| SKP-06、SKP-07、SKC-08 | 9-4、9-5 | `tests/agent-host-skill-reads.test.ts`：停用、撤销、卸载、世代变化后开轮被拒；`S-skill-delegation` 第 12 条 |
| SKC-06 | 9-1 | `S-skill-delegation` 第 1、3～11 条；原 `security-invariants-skill-catalog` 用例改读新字段 |
| SKC-11 | 9-4、9-5 | `git grep` 不到 `molis-coding-method`、`agent.skills.discover`、`agent.skills.install`、`AgentSkillLibrary` |
| SKC-13 | 9-5 | 第 3.2 节两层底线测试 |
| SKP-09 | 9-5b | `S-skill-scripts` 的拒绝测试；只读角色跑不了脚本、超时与失败按失败报 |
| CHO-03/04/05 | 9-3、9-4 | `tests/coding-work-executor.test.ts`：助理开始的一轮带方法与 MCP 到达；不可用原因随第 12 批项 1 |
| SKP-12、ADH-23 | 9-6 | `[人工]`；隔离 Home 里用 MiniMax 的工程核对另记 |
| 读取次数 | 9-5、9-2 | 第 3.4 节计数夹具 |

## 8. 子分支拆法建议

按第 8.4 节：合同先、服务再、消费者最后；两个写手不碰同一批文件；`platform/actions.ts`、`tooling/gates/api/` 的同一子路径同一时间只一个写手。

**与第 10 批 #1991 的重叠**（`git diff origin/main...origin/batch/10`）：`packages/contracts/src/platform/actions.ts`（加 `composer_source`，3 行）、`services/assistant.ts`、`assistant-dispatch.ts`、`assistant-round-materials.ts`、`assistant-send-materials.ts`、`assistant-composer.ts` 拼 `method_id` 的那段。建议：`b09/contract`、`b09/assistant`、`b09/delegation` **以 #1991 合入 main 后为基点**（本批分支届时同步一次 main，第 8.4 节第 4 条允许「本批真要用到 main 上新合入的东西」时合一次）；`b09/freeze`、`b09/scripts`、`b09/tools` 不碰这几个文件，可以先开。#1991 迟迟不合时，由主会话定：`b09/contract` 只有 `actions.ts` 一处小重叠，可先开、合入时手解；`b09/assistant`／`b09/delegation` 不先开。

| 子分支 | 内容 | 写手 | 前置 | 碰的文件 |
| --- | --- | --- | --- | --- |
| `b09/contract` | 只加不删的合同：`named_skills`（`ActionNamedSkills`）、`skill_round`、`locale` 注释、`run.start.skills`、`platform/kit-report.ts`、`services/kit.ts`、错误码、版本条目、SDK 的 `agent.skills`／`methods` 重名检查、两个快照 | C1，Opus 5.5 high | 本稿过复审；#1991 合入（见上） | `packages/contracts/src/platform/{actions,work-executors,kit-report}.ts`、`services/kit.ts`、`packages/plugin-sdk/src/agent-declarations.ts`、SDK 转出、`tooling/` |
| `b09/freeze` | 9-5（目录端口与身份、委派例外、编译期锁、两道检查、内容摘要键、计数夹具、上下文绑定与信封、`skill-selection.ts` 换掉）＋回复语言（组装处读调用记录的 `locale`、`frozen.reply_locale`），接着同一分支 9-4（Coding 改读目录、Manifest 加 `skills:read`、合并规则、删旧路、`method-stale`） | 先 C2 再 B 接力，各 Opus 5.5 high／medium | `b09/contract`；D-2 答复前 9-4 不改存储形状 | `horizontal/agent-host/`、`services/agent-host*.ts`、`agent-host-composition.ts`、`plugin-route-operations.ts`、`plugin-actions-client.ts`、`agent-definitions/skill-*`、`plugins/native/coding/` |
| `b09/assistant` | 9-2（`SignedAgentReference` 只剩角色、`methods()` 读目录、`bindSigned` 一次取、签名角色只出现一次） | 先 C（`agent-definitions.ts`、`services/agent-definitions.ts`）再 A 接力；Opus 5.5 medium | `b09/contract`；#1991 合入；与 `b09/freeze` 并行，文件不重叠 | `apps/local-host/src/agent-definitions/agent-definitions.ts`、`apps/local-host/src/assistant/*`、`services/assistant.ts`、`assistant-composer.ts` |
| `b09/delegation` | 9-3（委派时带 `run.start.skills`、宿主写绑定的 `named_skills` 与 `locale`）与 `S-skill-delegation` 全部拒绝测试 | A，Opus 5.5 high（安全） | `b09/freeze`、`b09/assistant` 合回 | `assistant-dispatch.ts`、`assistant-executor.ts`、`assistant-round-materials.ts`、`docs/system/security-invariants/`、`tests/security-invariants-skill-delegation.test.ts` |
| `b09/scripts` | 9-5b（SKP-09） | C2，Opus 5.5 high | `b09/freeze` | `horizontal/agent-host/`、沙箱规则 |
| `b09/tools` | 9-9（工具全集、`RUNTIME_TOOLS_NOT_OFFERED` 替掉 `prologue-taskboard.ts` 的排除、`host_tools` 检查、对齐测试、MCP 收口）；`assistant-present.ts` 的键约束由 A 在 `b09/delegation` 之后接力；Coding 设置页由 B 接力 | C2 起；Opus 5.5 medium | `b09/freeze`（同包串行）；与 `b09/scripts` 不能并行（同包） | `horizontal/agent-host/src/{tool-catalog,…}.ts`、`apps/mcp/`、`docs/mcp.md`、`plugins/native/coding/src/browser/settings/mcp.ts`、`assistant-present.ts` |
| `b09/kit` | 9-10：`horizontal/kit`（汇总、来源盖章、系统提供方表）、`kit-actions.ts`、各上报者（含 `agent.tools.kit.report@1`）、`plugins.package.export@1` 与下载路由、提示词改写三个动作 | C，Opus 5.5 high；Characters 一侧按规则 7 | `b09/assistant`（`methods()` 去角色）、`b09/tools`（工具全集）；D-3 | `horizontal/kit/`、`apps/local-host/src/kit-actions.ts`、`plugin-install-actions.ts`、`agent-definitions/`、`modules/characters/`、`services/agent-definitions.ts` |
| `b09/kit-page` | 9-11 实现 | D，按定样 | 定样经用户定；`b09/kit` | 设置页、组件板 |
| `b09/docs` | 9-7、9-12 收口与归属 | 任一写手，Sonnet 5.5 xhigh | 9-1～9-4 写法稳定 | `skills/molis-plugin-dev/`、`docs/` |

并行窗口（最多 3 个写手）：① `b09/contract`（设计台同时定样 9-11）→ ② `b09/freeze` ‖ `b09/assistant` → ③ `b09/delegation` ‖ `b09/tools`（`assistant-present.ts` 一步等 `b09/delegation` 合回）→ ④ `b09/scripts` ‖ `b09/kit` ‖ `b09/docs` → ⑤ `b09/kit-page` → 9-6。第 12 批只等到 ③ 的 `b09/delegation`；能力包部分卡住时按批次文件「顺序」一段拿掉 `b09/kit`、`b09/kit-page` 的提交（工具全集与 CPK-07 留在 9-9）。

## 9. 对快照与登记的影响清单（给写手核）

- `tooling/gates/api/`：`platform/actions`（`ActionNamedSkills`、`ActionCallContext` 两个字段、`locale` 注释、`kit-report` 转出）、`platform/work-executors`、`services/agent-host`（删 `AgentSkillRef` 等，`frozen.skills`、`frozen.reply_locale`）、`services/agent-definitions`、`services/assistant`、新 `services/kit`；SDK 转出 `defineKitReportAction` 与类型。
- `tooling/gates/actions/`：`kit.catalog.list@1`、各 `*.kit.report@1`、`plugins.package.export@1`、三个提示词改写动作新增；`assistant.methods.read@2` 输入形状变；Coding 工作执行方 `run.start` 输入形状变；`agent.skills.discover`／`install` 相关删除。
- `tooling/versions.json`：两个上报类型、`file.molis.prompt-overrides`、`file.molis.kit-references`、新动作的版本条目。
- `docs/system/security-invariants/`：`S-skill-delegation`、`S-kit-catalog`、（9-5b）`S-skill-scripts` 三个新记录；`S-skill-catalog`、`S-content-package` 改。
- `scripts/workspace-packages.mjs`、`docs/system/PACKAGE-BOUNDARIES.md`「现行包清单」、`docs/SSOT-MATRIX.md`、`node scripts/package-owners.mjs --write`：新包 `horizontal/kit`。
- `tooling/gates/error-owners.json`：新加 `kit`；`agent_definitions` 加 `packages/contracts/src/services/agent-definitions.ts`。
- `docs/system/GLOSSARY.md`（随 9-7）：「能力包」——代码 `kit`（动作 `kit.*`、类型 `Kit*`、包 `horizontal/kit`）；「能力库」是动作目录；`docs/design/kit/` 和 design-system 里的「kit」指组件板的实件，不是能力包，新代码在这两处之外出现 `kit` 一律指能力包；「Agent 工具」与「外部工具」分开。

## 10. 偏离记录（交主会话写进 09 批文件）

| 原来怎样 | 现在怎样 | 为什么 |
| --- | --- | --- |
| `run.start` 新形状「走 `.v2` 类型」 | 原版本改 | 合同变更流程第 3 节与合同自己的注释；封闭输入已防住静默丢技能（第 2.1 节） |
| 「只重签本机的包」 | 导出从不重签，原样导出留存的签名包 | 本机的包本来就是本机身份签的；不重签直接保证第三方不被换签名（第 4.7 节） |
| 汇总放哪「9-8 再定」 | `horizontal/kit` 新包，宿主只装配 | 用户 11-01 的放置规矩；系统搜索先例（第 4.1 节） |
| 08 的点名用进程内存储 | 调用上下文里绑定安装与动作的 `named_skills`，加只给 `system.skills` 的 `skill_round` | 跨插件边界、跨进程都成立；不被整轮继承，不随嵌套调用和工具调用漏进别的插件（第 1、2.3 节） |
| 插件页面可以点名任何技能（第 1 稿） | 页面只能点名自己安装的技能，跨插件点名只认宿主入口 | 公共合同台合审 B2；第三方页面不能替本人点别的插件的 `manual` 技能 |
| 宿主以本人身份为一轮读目录（第 1 稿） | 以开这一轮的插件身份读，插件要 `skills:read`；只有宿主委派绑定的引用以委派的本人读 | 公共合同台合审 B3；不让宿主替插件绕过授权 |
| SKP-09 归属未定 | 9-5 单列 9-5b | 第 3.6 节 |
| 统筹裁定第 3 条：`tests/agent-host.test.ts:715` 的拒绝断言由底线测试替换 | 保留它，另加共同目录技能的底线测试 | 那条断言测的是插件自己的 `agent.skills`；只有共同目录的技能改成「只当说明」，自己的仍比（第 3.1、3.2 节） |

## 11. 待决（交 09 主会话攒批问用户）

| # | 问题 | 推荐 | 另一种与代价 |
| --- | --- | --- | --- |
| D-1 | 插件页面路由带的点名信封算不算「本人点名」 | 折中：只对这个页面所属安装自己的技能算；跨插件点名只认宿主入口（助理输入框、技能设置页、宿主委派）。今天的实际影响：Coding 页面点不了别的插件的 `manual` 技能，要在助理里点名后交给 Coding；`auto` 的照常用 | 全都算（第 1 稿）：Coding 页面能点任何技能，但第三方页面也能替本人点别的插件的 `manual` 技能。全都不算：页面连自己的 `manual` 技能也点不了，要等宿主出嵌进插件页面的选择器（新部件、要定样），本批做不完 |
| D-2 | Coding 会话里已存的 `methods:<会话>`（及助理历史里方法材料若校验封闭）怎么办 | 不认不迁、用户重选（第 2.7 节左栏） | 迁：要登记保留机制、写一次性改写、加兼容计数与金样，且原来指向项目方法库的选择无从迁，仍要重选 |
| D-3 | 提示词改写第一次成为动作（只服务导出导回：导出、预览、逐条确认；200 行、正文不超过 `AGENT_PROMPT_MAX_CHARS`、显示登记表标题、预览绑定本人与项目且只用一次） | 同意：只给本人，确认要受保护入口，不开放「在能力包里直接改」 | 不做动作，导回只在「提示词」页的私有路由里逐条手动粘贴：CPK-06 的「逐条确认导回」做不成动作级的拒绝测试 |

已定、不再问：D-4 错误主人表新加 `kit`（主会话 2026-11-09 按 AGENTS.md 定）。

D-1、D-2 挡 `b09/freeze` 里 9-4 的对应部分与 `b09/delegation`；D-3 挡 `b09/kit` 的提示词改写部分。另有一个排期问题由主会话定、不问用户：#1991 迟迟不合时 `b09/contract` 是否先开（第 8 节）。其余取舍按推荐已写进正文。
