# 能力包与委派带技能的合同设计（路线书 09）

状态：设计稿第 4 稿，2026-11-09，公共合同台合审已过（`0eb704f6fe`）；随后补进合审的三条小意见（会话键清理、`unknown.issues` 的含义、系统提供方报到插件包的核对），本稿冻结。
- 第 3 稿（`e3ed862d06`）按用户当天的决定把能力包改成「包 → 条目」；公共合同台复审时，B1～B6 与读取次数已过。
- 本稿改复审退回的三处阻塞（`role_id` 的校验位置、`KitRoleRef` 与第 36 批对齐、插件上报者不能报工具），以及主会话定的六条非阻塞处理。

待复审，没有实现。

第 09 批合同台（Opus 5.5 high）出稿，只写合同长什么样、归谁、怎么拆子分支；合同代码交写手，定样归设计台。对照的代码：
- main `416ee8cef0`（第 08 批 #1984 已合）；
- 第 10 批在途分支 `origin/batch/10`（#1991）；
- 定样分支 `claude/b09-design-kit-page-2eda30`（用户选定 A）。

第 1～3 稿的待决都已定，见第 11 节。

## 0. 这份稿子覆盖什么

| 片 | 本稿定下的 | 节 |
| --- | --- | --- |
| 9-1 委派协议带上技能 | <ul><li>工作执行方 `run.start` 的新形状。</li><li>`AgentSkillRef`、`SignedAgentReference` 的方法引用、`AssistantMethodSelection.method_id` 收成 `SkillRef`。</li><li>点名名单怎样绑定、由谁写、只给谁读。</li><li>`run.start.skills` 与会话里存的选择怎样合。</li><li>回复语言。</li><li>新安全不变量与拒绝测试。</li><li>旧数据一次清掉。</li></ul> | 第 2 节 |
| 9-5 Agent Host 按 `SkillRef` 冻结 | <ul><li>一轮怎样解析、冻结技能，用谁的身份读目录。</li><li>`tools` 只当说明的两道检查。</li><li>登记给 Prologue 的键。</li><li>读取次数表与计数夹具。</li><li>SKP-09 落在哪。</li></ul> | 第 3 节 |
| 9-8 能力包合同 | <ul><li>包是什么、谁说包里有什么。</li><li>角色与提示词怎样连。</li><li>一条能在几个包里。</li><li>包的状态怎样读出。</li><li>条目字段与「包 → 条目」的返回形状。</li><li>上报与来源盖章。</li><li>以包为单位的导出导回。</li><li>错误码与安全不变量。</li></ul> | 第 4 节 |
| 9-9 工具全集与 MCP 收口 | <ul><li>Agent Host 一处的工具全集，以及与 SDK 对齐的测试。</li><li>合同只留两张表。</li><li>`host_tools` 不在全集即拒。</li><li>MCP 视图类型统一。</li></ul> | 第 5 节 |
| 9-10 上报与汇总、导出导回 | 各主人的上报动作与文件（形状在第 4 节） | 第 4.6、4.9 节 |

不重定已定的事：
- 第 08 批：`system.skills` 的四个动作、`SkillRef`、`SkillCatalogEntry`、三档、`skill_settings`／`skill_uses`（[08 合同稿](../skill-packs/contract-design.md)）。
- 能力包需求的范围、边界与用户决定（[能力包需求](spec.md)）。
- 第 09 批第八节的统筹裁定（[09 批文件](../post-anticorruption-roadmap/reference/batches/09.md#batch-09-conditions)）。
- 定样 A：定样分支 `claude/b09-design-kit-page-2eda30` 的 `docs/design/capability-pack/README.md`「模型」一节。

## 1. 现状核对（main `416ee8cef0`）

只列和 09 批文件、能力包需求写法不一样或它们没写到的：

| 事实 | 位置 | 对设计的影响 |
| --- | --- | --- |
| 08 的「本轮点名」是宿主进程内的 `AsyncLocalStorage`（`withSkillSelection`／`currentSkillSelection`），按 `actor_id`＋`project_id` 认。今天只有技能设置页的预览在用 | `apps/local-host/src/agent-definitions/skill-selection.ts`、`skill-settings-http.ts` | 它有两个问题：<ul><li>跨不过插件边界：沙箱里的执行方回调宿主是一条新的异步链，名单丢了。</li><li>会被这条链上启动的整轮运行原样继承，包括之后的工具调用、打到别的插件动作的调用。</li></ul>9-1 把它换成调用上下文里绑定了安装与动作的宿主字段（第 2.3 节） |
| 插件页面的「原始输入」走宿主取下的传输信封：<ul><li>路由请求体里的 `original_input` 由宿主取走。</li><li>它绑在同一安装第一个被调的自有动作上：`routedControls` 记下 `original_action`，别的动作拿不到。</li><li>`agent-host-composition.ts` 再从 `currentPluginInvocation()` 读出。</li></ul> | `apps/local-host/src/plugin-route-operations.ts` 的 `takeOriginalInput`、`plugin-actions-client.ts` 的 `callScope`／`offered`、`agent-host-composition.ts` 的 `currentOriginalInput` | 插件页面的点名信封照这条现成的路走，绑定方式一样（第 2.3 节） |
| Agent Host 解析方法时按 `skill_id@version` 认，登记给 Prologue 的键也是它 | `horizontal/agent-host/src/index.ts` 的 `readSkill`、`adapters/prologue-methods.ts` 的 `inlineMethods` | 会撞键：共同目录里两个插件可以有同名 `skill_id`，自己的技能也可能与目录里的同名。9-5 改按内容摘要认（第 3.3 节） |
| `recordSignedUse` 遇到方法直接返回，`prompt_uses.source_ref` 里没有 `kind: "method"` 的行 | `apps/local-host/src/agent-definitions/agent-definitions.ts` | 去掉 `SignedAgentReference` 的 `"method"` 不改任何已存的行 |
| 插件开的一轮（Coding）今天没有回复语言：`startAuthority` 不给 `reply_language`。第 14 批 T10 已在 main，只覆盖助理自己的一轮 | `apps/local-host/src/agent-host-composition.ts`、`apps/local-host/README.md`「回复语言」 | 9-1 的前置 T10 已满足；委派的一轮由宿主带语言（第 2.4 节） |
| 工作执行方合同自己的注释写的是「阶段一在原版本改形状，首次外部安装后才升号」 | `packages/contracts/src/platform/work-executors.ts` 的 `ROLE_TYPE_VERSIONS` | 与 09 批文件写的「走 `.v2`」相反，第 2.1 节按合同变更流程定 |
| 有两个先例：<ul><li>`actions.usages.read`：按合同类型找上报者，用调用方自己的客户端逐个调，由汇总处给每条盖 `source`／`reporter`。</li><li>系统搜索 `horizontal/search`：同一模式，放在 `horizontal/` 新包里。</li></ul> | `apps/local-host/src/action-usage-actions.ts`、`horizontal/search/README.md` | 能力包汇总照它们（第 4.6 节） |
| **角色已经点名自己的提示词**：`AgentRoleDeclaration.prompts?: string[]`。不写就是「这个插件声明的全部提示词」 | `packages/contracts/src/platform/plugin-agent.ts` | 「角色带着自己的提示词」用这条现成的关系，不在 Manifest 加新键（第 4.2 节） |
| **直接调模型的提示词没有角色**：`InstructionPrompt`（`defineInstructionPrompt`，15 个插件与宿主的 `system:*`）只有 `owner_id`、`used_by`。宿主登记时，它与角色的提示词并在同一个主人下，靠 `kind: "instruction"` 分开（`withInstructions`） | `packages/contracts/src/platform/model-prompts.ts`、`apps/local-host/src/agent-definitions/agent-definitions.ts` | 今天说不出这一类属于哪个角色。用户定默认归个人助理（第 4.2 节） |
| 「个人助理」在第 36 批的合同里是一个选择 `{ kind: "assistant" }`（`CharacterTaskSelection`、`EffectiveCharacterSelection`） | `packages/contracts/src/modules/character-role-scope.ts`（#1995 已合） | 能力包里的个人助理角色用同一个引用写法，不另起 id |
| 插件卸载后，安装记录可以作为「已卸载、数据保留」留着，`installations` 能读到 | `packages/contracts/src/platform/plugin-installations.ts` | 「已卸载」的包从安装记录读出，不另存（第 4.4 节） |
| Coding 页面每开一轮，都把会话里存的方法选择重发一遍（`executor.ts` 的 `roundOf`、`client.ts` 的 startRound） | `specs/coding-harness-optimization/audit-2026-11-batch12.md` 第 3.3 节 | 「每轮重发」就是页面在点名，第 2.3 节的信封规则直接管到它 |
| 第 10 批 #1991（`origin/batch/10`）改了下面这些：<ul><li>`platform/actions.ts`、`services/assistant.ts`；</li><li>`assistant-dispatch.ts`、`assistant-round-materials.ts`、`assistant-send-materials.ts`；</li><li>「/」菜单拼 `method_id` 的地方（`assistant-composer.ts`）。</li></ul> | `git diff origin/main...origin/batch/10` | 与 9-1、9-2、9-3 的文件重叠，第 8 节排基点 |

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

- Schema：`skills: { type: "array", maxItems: SKILL_BODY_READ_MAX_REFS, items: SKILL_REF_SCHEMA }`（`services/skills` 已导出）。
- `session.update` 不变，仍只有 `mode`：点名是一轮的事，不是会话设置。

**版本：在原版本改，不升 `.v2`。**
- 09 批文件写的是「走 `.v2` 类型」。它与两处相反：
  - 合同变更流程第 3 节第 3 条：阶段一按现行版本改形状，刷新快照、写影响；首次外部安装起才升号；
  - 这份合同自己的注释。
- 原版本改不会悄悄丢技能：输入是封闭 schema，没跟上的执行方收到 `skills` 会拒绝输入，不会不带技能跑一轮；不带技能的委派照旧能走。
- 升 `.v2` 换不来别的保证，代价是 `tooling/versions.json` 多一条，助理按类型找执行方的比较也跟着变。

记进偏离（第 10 节）。

### 2.2 方法引用收成 `SkillRef`

| 现在 | 改成 | 消费者（同一批改完） |
| --- | --- | --- |
| `services/agent-host-start.ts` 的 `AgentSkillRef { skill_id, version }`，`AgentStartInput.skills?: AgentSkillRef[]` | 删 `AgentSkillRef`；`skills?: SkillRef[]`。插件自己 Agent 的 `agent.skills`（Coding 的四个 `codingSkills`）也用 `SkillRef` 指：来源是开这一轮的插件自己的安装（第 3.1 节） | Coding 的 `route-selections.ts`、`start-round.ts`、`executor.ts`（9-4）；`horizontal/agent-host`（9-5） |
| `services/agent-host-ports.ts` 里的四项：<ul><li>`AgentSkillLibrary`（`list`／`read`／`discover`／`install`）；</li><li>`AgentSkillCatalogEntry`、`AgentSkillCandidate`；</li><li>`AgentSkillsCapability`（没有实现者）。</li></ul> | 全删。`AgentSkillOwner` 名字留着不动：`AgentMcpLibrary` 还用，改名不是这批的事 | 9-4、9-5，SKC-11：<ul><li>`horizontal/agent-host` 的 `skillLibrary`，`prologue-methods.ts` 的存储与发现；</li><li>Coding 的 `routes-setup.ts` 三个路由、`routes-sessions.ts` 的 `agent.listSkills`、`browser/settings/methods.ts`；</li><li>`services/agent-host.ts` 的对应动作。</li></ul> |
| `services/agent-definitions.ts` 的 `SignedAgentReference.kind: "role" \| "method"` | 改成 `kind: "role"`。保留这个字段：已存的 `prompt_uses.source_ref` 都是角色，字面量不变，库里的行一个不改 | `assistant-send-materials.ts` 的材料核对、`agent-definitions.ts` 的 `methods()`／`signedMaterial()`（9-2） |
| `AgentSkillView.kind?: "role" \| "method"`、`default_ref` | 去掉 `kind`：签名角色只在 `roles()` 里出现一次。方法的引用换成 `ref: SkillRef` | `agent-definitions.ts`、`assistant-work-reads.ts`（9-2） |
| `services/assistant.ts` 的 `AssistantMethodSelection { method_id, version?, default_ref?, installation? }` | 分成两种：`{ kind: "skill"; ref: SkillRef } \| { kind: "role"; method_id: string; version?: number; default_ref?: SignedAgentReference; installation?: SignedAgentInstallation }`。`AssistantMethod` 的方法部分改读 `SkillCatalogEntry`，只留角色资料 | `assistant-round-materials.ts`、`assistant-composer.ts` 的「/」菜单（9-2，基点见第 8 节） |
| 动作 `assistant.methods.read@2` 输入收方法与角色 | 只收角色资料（`method_id`＋`default_ref`＋`installation`）。方法正文一律走 `skills.body.read@1`；是否改名由 A 轨定 | `assistant-rule-actions.ts`、轮内给模型的读取说明（`assistant-round-materials.ts` 的「按需读取资料」一段） |
| SDK 的 Manifest 检查允许同一插件的 `agent.skills` 与 `methods` 用同一个 `skill_id` | 改成拒绝：`inspectSkillDeclarations` 遇到同一 Manifest 里两处同名，报 `plugin.declaration_invalid`，`problems` 指到这个 `skill_id`。不拒的话，插件可以拿「自己的技能」的身份，去读一个在目录里是 `off`／`manual` 的同名方法，绕过三档 | `packages/plugin-sdk/src/agent-declarations.ts`（C1，随 `b09/contract`）；三个内置插件核过没有重名 |

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
| 宿主取下插件页面路由请求体里的传输信封 `named_skills`（与 `original_input` 并列，在 `plugin-actions-client.ts` 同一处取） | `page` | 这个页面所属安装（`active.install_id`）第一个被调的自有动作，照 `original_action` 的绑定 | 信封里 `ref.install_id === active.install_id` 的那些引用。别的安装的技能宿主直接丢掉，不进名单：跨插件点名只认宿主入口（D-1，已定） |
| 宿主把活交给执行方（`AssistantDispatch.executorDispatch` → 执行方的 `run.start`） | `host` | 执行方的安装与它的 `run.start` 动作 | 委派这一轮已冻结的点名名单，原样 |

**谁读、读到什么为止：**

- 派发处只把 `named_skills` 交给它绑定的那一个调用的处理器上下文。
  - 那个处理器发出的嵌套调用、别的动作、别的安装都看不到。
  - 插件传回一个自带 `named_skills` 的调用者对象时，宿主建上下文不抄这个字段。
- 处理器开 Agent Host 一轮时，组装处从 `currentPluginInvocation()` 读它，只认安装与动作都对得上的那一份（照 `currentOriginalInput`）。再连同 `consumer`、`engine`，冻结成这一轮的 `skill_round.named`。
- `skill_round` 只出现在组装处对 `system.skills` 发出的调用上：开轮时的目录与正文读取，以及这一轮的工具调用里打到 `system.skills` 的那些。
  - 这一轮的工具调用打到别的插件动作时，两个字段都不带。
  - 那个动作再开一轮，名单是空的。
- 宿主自己的入口不经信封，即助理输入框（工作台页面）与技能设置页的预览。
  - 由宿主代码直接冻结名单，同样以 `skill_round` 带。
  - 只用于宿主自己发出的 `system.skills` 读取：助理自己的一轮，以及预览的那一次读。

**`skill_round.consumer` 怎样定**：宿主组装一轮时按冻结的角色定，不按插件名。
- 助理的一轮是 `assistant`。
- 角色 `workspace: "required"` 是 `coding`：在目录里工作的执行方，今天是 Coding。
- 别的插件的一轮是 `agent`。
- 本机 Agent 引擎开的一轮带 `engine: "local"`。
- 第三方执行方与 Coding 同一待遇。

**读的一侧**：
- `SkillCatalog` 的 `applicable()` 改读 `caller.skill_round?.consumer`，`not_named` 改读 `caller.skill_round?.named`。
- 删掉 `skill-selection.ts`，以及它在 `apps/local-host/src/index.ts` 的导出。
- 目录照旧每次读都核引用是不是当前的；名单只决定「点没点名」。

**`run.start.skills` 与会话里存的选择怎样合**（执行方一侧，Coding 照做）：

- 一轮要用的 = `run.start.skills` ∪ 会话里存的 `methods:<会话>`。
  - 按完整引用去重，委派来的在前。
  - 合计超过 20 个就拒绝这一轮。
  - 两边不互相覆盖：会话里存的是本人在 Coding 里的长期选择，委派带来的是这一轮的。
- 同一个技能两处版本不同时，至少一边已不是当前的。目录读取对那一边答 `not_current`，整轮拒绝并点名它；不另写优先规则。
- 点名名单：委派来的一轮用 `from: "host"` 的那份；Coding 页面开的一轮用 `from: "page"` 的那份。页面每轮把会话里存的选择放进信封重发，就是页面在点名。所以会话里存的 `manual` 技能分两种：
  - **Coding 自己安装**的：页面重发算点名。今天没有这种技能：Coding 的方法都在 `agent.skills`，不受三档管。
  - **别的插件**的：页面点不了，委派来的一轮也只有助理这一轮点了它才算。读到时整轮拒绝 `not_named`，说明写「这个技能只能在助理里点名」。Coding 的方法菜单对这类技能标同一句、不让存进会话（9-4 的界面，随第 12 批的定样）。

### 2.4 回复语言

不进 `run.start` 输入：按 `AgentStartAuthority.reply_language` 的规矩，开轮请求不带语言，插件定不了。

- 宿主调执行方时，把委派这一轮的语言放进调用上下文的 `locale`。同一改动里改 `ActionCallContext.locale` 的注释：
  - 现在写「没有页面就不带」；
  - 改成「页面的语言，或宿主替一次委派定下的语言；只选回给人看的字与一轮的回复语言，不授予任何东西」。
- 组装插件的一轮时，`reply_language` 从这次开轮所在的调用记录读：`currentPluginInvocation()` 的调用者的 `locale`，照 `currentOriginalInput` 只认同一安装。没有就读最后用的语言，与宿主发起的一轮同一处（`ui-locale-memory.ts`）。
- 冻结记录加 `frozen.reply_locale?: "zh" | "en"`。`services/agent-host.ts` 的 `frozenOutput` 是动作输出，原版本改、刷快照。有了它，委派过去的一轮用了什么语言看得出来，也是测试的断言点。
- 只改 `AgentStartAuthority`、组装处与冻结记录，不改提示词正文。

### 2.5 冻结记录里的技能

`AgentRunView.frozen.skills` 每项从 `AgentSkillDefinition` 去掉正文，改成：

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

Coding 页面的「本轮方法」，与助理看委派过去的一轮，都读这一项（CPK-05、CHO-03）。

### 2.6 新安全不变量 `S-skill-delegation`

独立记录 `docs/system/security-invariants/S-skill-delegation.md`，文字：

> 一轮能读的 `manual` 技能只认宿主冻结的点名名单。名单只来自两处：插件页面路由的点名信封（只收这个页面所属安装自己的技能，绑在这次路由第一个被调的自有动作上）、宿主把活交给执行方的那次调用（绑在执行方的安装与 `run.start` 上）；宿主自己的入口（助理输入框、技能设置页预览）直接冻结。名单不随处理器的嵌套调用、也不随一轮的工具调用进别的插件动作；`skill_round` 只出现在宿主对 `system.skills` 的调用上，插件的处理器看不到。任何动作输入里的 `SkillRef`（`run.start` 与 `agent.run.start` 的 `skills`、模型的工具参数、插件页面的业务字段）都不算点名；名单不跨轮继承。

代码位置：
- `packages/contracts/src/platform/actions.ts`
- `apps/local-host/src/plugin-route-operations.ts`
- `apps/local-host/src/plugin-actions-client.ts`
- `apps/local-host/src/agent-host-composition.ts`
- `apps/local-host/src/agent-definitions/skill-catalog.ts`
- `apps/local-host/src/assistant/assistant-dispatch.ts`
- `horizontal/agent-host/src/index.ts`

**拒绝测试**放在新文件 `tests/security-invariants-skill-delegation.test.ts`，进 `test:security`。每条断言拒绝本身：原因码、没有冻结记录、没有 `skill_uses` 行。

1. 助理委派给 Coding，`run.start.skills` 里有一个 `manual` 技能，助理这一轮没点它：Coding 的这一轮不开，`not_named`；没有冻结记录、没有 `skill_uses`。（CPK-09、SKC-06）
2. 同上，点了：开轮，冻结记录里 `named: true`。这一条是对照，不算拒绝。
3. Coding 页面把 `manual` 技能的引用写进业务字段 `methods`（不走信封）开一轮：`not_named`。
4. 点名信封绑在安装 A 这次路由第一个被调的自有动作上。A 的处理器再嵌套调 A 的第二个动作、调安装 B 的动作，这两处开的一轮读同一个技能都是 `not_named`。
5. 页面 A 的信封点名插件 B 的 `manual` 技能：宿主丢掉这一项，A 开的一轮读它 `not_named`（D-1）。
6. 插件处理器把一个自带 `named_skills` 或 `skill_round` 的调用者对象传回宿主，发嵌套调用：被调的那一侧上下文里两个字段都没有，读正文 `not_named`。
7. 插件处理器拿到的上下文里没有 `skill_round`。三种情况都断言：
   - 委派来的 `run.start`；
   - 页面路由来的第一个动作；
   - 一轮工具调用打到的插件动作。
8. 助理这一轮点了 X；这一轮的工具调用打到某插件动作，该动作开一轮读 X：`not_named`。
9. 委派这一轮点了 X；同一会话下一轮从 Coding 页面开，信封里没有 X，且 X 不是 Coding 自己的：`not_named`（名单不跨轮）。
10. 委派过去的一轮里，模型经网关用工具参数读一个没点名的 `manual` 技能（正文或附带文件）：`not_named`。
11. 沙箱执行方的 `run.start` 输入里夹带 `named_skills` 或 `skill_round`：输入 schema 拒绝（封闭对象）。
12. 委派过去的一轮中途，点名的技能所在插件被停用：下一次读被拒 `plugin_disabled`，不换版本（SKC-08 在执行方一侧）。

已有的 `tests/security-invariants-skill-catalog.test.ts`「…refuse Skill reads」改读新字段，不删断言；`S-skill-catalog` 记录的代码位置去掉 `skill-selection.ts`。

### 2.7 旧数据：一次清掉（用户 2026-11-09 定）

现在没有用户，所以一次性清干净：
- Coding 的技能统一由能力包和共同目录管理。
- 旧的发现、安装、存储与旧形状全删。
- 不管存量数据、不做读取兜底、不做迁移，也不做「请重新选择」提示。

落到代码上：

- **Coding**：
  - 会话里的技能选择**换一个新存储键** `skills:<会话>`，值是 `SkillRef[]`；旧键 `methods:<会话>` 从此不读、不写、不删。
  - 不写认旧形状 `{ skill_id, version }[]` 的分支，不做迁移，不加专门的错误码（第 2 稿的 `coding.server.method-stale` 删掉）。
  - 换键的作用：页面每轮把会话选择放进信封重发（第 2.3 节）；要是沿用旧键，存着旧形状的会话每轮都会被拒、卡住。换了键，旧会话读出来就是「没有选择」，照常能用，本人再选就存新键。这不是兼容代码：没有任何读旧值的路径。
  - 清理：删 Coding 会话时，新键 `skills:<会话>` 跟着一起删。今天 Coding 只有归档、没有删会话的路，也没有按会话前缀统一清理的地方：别的按会话存的键（`budget:`、`goal-context:`、`compact-next:`）同样留着。所以 9-4 不为它另造删除路；以后加删会话的路时，把 `skills:<会话>` 与这些键一起清。旧键 `methods:<会话>` 不读也不删，记为已知遗留。9-4 的 PR 里写一句。
  - 删掉 `molis-coding-method` 的存储与读取、`agent.skills.discover`／`install`、`routes-setup.ts` 的三个路由和方法页（SKC-11）。
- **助理历史材料**：已存的轮次材料里 `kind: "method"` 的 `method`（`AssistantMaterial.method`）同理，只认第 2.2 节的新形状，不写旧形状的读取分支。
- **不动的东西**：`docs/system/CONTRACT-CHANGES.md` 不加保留机制，不动兼容计数、升级段与金样。

## 3. 9-5 Agent Host 按 `SkillRef` 冻结

### 3.1 一轮怎样解析技能

`AgentStartInput.skills: SkillRef[]` 分两类。Agent Host 按来源认，不另加字段：

- **自己的**技能，同时满足：
  - `ref.install_id` 与 `ref.source` 是开这一轮的插件自己的安装（宿主从调用上下文的 `plugin_install_id` 核）；
  - `skill_id`／`version` 在它 Manifest 的 `agent.skills` 里（第 2.2 节保证它不会同时是 `methods` 里的一项）。

  正文取 `authority.skills`（随安装登记，不读存储）。工具照旧与角色的 `host_tools` 比。
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

**用谁的身份读**：开这一轮的插件自己的调用方身份（`audience: "plugin"`、它的安装与授权交集），宿主只另写 `skill_round`。
- 插件要在 Manifest 里声明 `skills:read` 并获授予，才能在自己开的一轮里用共同目录的技能。内置与第三方一样，Coding 的 Manifest 随 9-4 加这一项。
- 插件没有 `skills:read` 时，目录读取被拒，这一轮只能用自己的技能，说明里写原因。

**唯一的例外**：`named_skills.from === "host"` 里的引用，即宿主委派、绑在执行方安装与 `run.start` 上的那些。
- 宿主以委派那一轮的本人读这几项：`audience: "user"`，操作者、项目取自那次委派的调用上下文。
- 本人已在助理里点了它们，所以执行方没有 `skills:read` 也能用这几项；别的项不跟着放开。

一轮只要有一项读不了（`SkillReadRefusal`，或插件缺 `skills:read`），就整轮不开：
- 报 `agentErrors.capability_unavailable`，说明写这一项的名称和原因；
- 不跳过、不换版本（SKP-07）。

`skill_owner` 随旧方法库删掉。

### 3.2 `tools` 只当说明：两道检查都改

统筹裁定第 3 条：共同目录技能的 `tools` 只当说明，永远不能扩大角色的 `host_tools`。

1. **开轮检查**：`index.ts` 现在对每个方法比 `tools ⊆ hostTools`，越界报 `role_execution_exceeded`。改后只对「自己的」技能保留，共同目录的不比。
2. **适配层登记**：`adapters/prologue-methods.ts` 的 `inlineMethods` 现在把 `definition.tools` 原样登记，再调 `prepareSkillIntent({ parentTools, hostTools })`；vendored SDK 对越界抛 `SKILL_PERMISSION_ESCALATION`。改后登记给 Prologue 的清单取 `definition.tools ∩ characterTools`。
   - 选求交而不是「不带工具」：留着技能与角色都有的工具，Prologue 里看得到这条技能用到了哪些。
   - 不动 vendored 包。

**现有断言**：`tests/agent-host.test.ts:715` 断言「比角色宽、开轮被拒（`/未开放的工具/`）」。
- 它用的是插件**自己的** `agent.skills`（`manifest.skills` 与 `authority.skills`），按本节仍成立，原样保留。
- 统筹裁定里「由底线测试替换」的前提是两类不分。这里分开了，所以改成保留它，另加共同目录的底线测试。
- 已记进偏离（第 10 节），不删、不放宽。

**底线测试**（SKC-13，新增）：

- Agent Host 层：给 Coding 角色选一个共同目录技能，它声明了角色没有的 `change-capability`。开轮不再被拒，冻结记录的 `host_tools` 不含它。
- 适配层：同一轮登记给 Prologue 的技能清单 `tools` 不含 `change-capability`；用 Prologue 的工具表断言模型拿不到这个工具。
- 对照：「自己的」技能工具比角色宽，开轮仍被拒。

### 3.3 登记给 Prologue 的键

`inlineMethods` 的缓存键与 Prologue 技能 `id` 改成登记内容的摘要：
- 对 `{ body, label, tools }` 做 SHA-256，`tools` 是求交之后的。
- `id` 取一个固定前缀加摘要前若干位；写手按 SDK 的 `id` 规则核长度与字符。

这样：

- 两个插件同名的 `skill_id`、自己的技能与目录里同名的，内容不同就是两项，不撞键。
- 升级后正文变了就是新键，不会读到旧缓存。原来「同版本正文变化」的拒绝随之删掉，它防的就是旧键读到新正文。
- 同一份签名包装在项目和个人空间两处，内容相同，共用一项。

冻结记录与「这一轮用的是谁」仍按 `SkillRef` 记，键只是 Prologue 侧的登记身份。

### 3.4 一轮只取一次目录：读取次数表

| 一轮选了 N 个技能（N ≤ 20），其中 C 个来自共同目录 | 改之前（main `416ee8cef0`） | 改之后（要达到） |
| --- | --- | --- |
| 目录读几次 | N 次 `skillCatalog()`，每次 `library.list()` 分页读一遍 Prologue 存储（每页 100 条） | **1 次** `skills.catalog.list@1`（C = 0 时 0 次）。委派例外的几项与其余几项身份不同时，各 1 次，最多 2 次 |
| 正文读几次 | 方法库里的每个各 1 次 `library.read` | **1 次** `skills.body.read@1`，C 个引用一起：`SKILL_BODY_READ_MAX_REFS` = 20 = 选择上限，不会分批。身份分两组时最多 2 次 |
| 宿主为每个请求读安装与设置几遍 | — | 每个请求一遍：`SkillCatalog.snapshot` 一次（安装记录、包、设置各一次） |
| 自己的技能 | 每个 1 次 `skillCatalog()` | 0 次 I/O（随安装登记的定义） |
| Prologue 存储 | N 次 `list` ＋ ≤N 次 `read` | 0 次（方法库删掉） |

**计数夹具**放在 `tests/agent-host-skill-reads.test.ts`（SKC-07 与本条），只数调用，不用时间：
- 选 20 个共同目录技能开一轮，全部同一身份：`skillCatalog.list` 1 次；`skillCatalog.readBodies` 1 次，收到 20 个引用；`SkillCatalogPorts.skills` 每个请求 1 次。
- 委派来 5 个、页面另选 5 个时：各 2 次。
- 选 0 个时：都是 0 次。

助理一侧，9-2 同样写改前改后并断言：
- 改前：`methods()` 对每个签名方法各调一次 `bindSigned`，每次进项目库读安装记录。
- 改后：读一次 `skills.catalog.list@1`；助理这一轮点名的方法，开轮时一次 `skills.body.read@1`。
- 用例选 20 个，断言项目库安装记录只读 1 遍。

### 3.5 编译期锁

照 09 批文件 9-5：`adapters/prologue-methods.ts` 断言合同的 `MAX_SKILL_BODY_CHARS`（`platform/plugin-agent`）与 `@prologue/sdk` 的同类型，一边改了另一边编译不过。

### 3.6 SKP-09（技能脚本执行）落在 9-5（结论）

第 08 批 #1902 小修第三条问：SKP-09 落在 9-4 还是 9-5。结论是**落 9-5，单列子片 9-5b**，理由：

- **执行脚本是 Agent Host 的事。**
  - 脚本要在这一轮的权限岛和沙箱里跑，用的是角色已开放的 `run-command`。
  - 失败、超时、越权的如实报错，都在 Agent Host 与 Prologue 适配层。
  - Coding 只负责选、显示，不碰执行。能力包需求 §3 也写明：「技能正文与脚本的执行」归会跑脚本的 Agent。
- **做法。** vendored SDK 的技能核心里没有执行 `scripts/` 的现成接口（`dist/skill/` 只有 `api`、`core`、`plugin`），所以：
  1. 宿主经 `skills.resource.read@1` 按声明的路径读脚本、核摘要。
  2. 脚本放进这一轮的宿主临时目录，不写进用户的项目目录；沙箱规则只读放开这一个目录。
  3. 角色开放 `run-command` 时，由模型调起脚本。

  角色没有 `run-command` 时，技能照常能用，但脚本跑不了，说明里写原因。
- **它碰安全边界**（沙箱路径与命令执行）。9-5b 自带一条不变量 `S-skill-scripts`，配拒绝测试：
  - 只跑声明过、摘要相符的脚本；
  - 只在这一轮的临时目录里、按角色的执行权限跑；
  - 读写项目目录照角色原样；
  - 超时与失败按失败报。
- **排期。** 排在 9-5 之后。做不进本批时按第 8.4 节拿掉，记进下一批，SKP-09 跟着走。

**结果（2026-11-09，主会话）：移出本批。** vendored Prologue 的 Node Host 报 `sandbox: "absent"`：`run-command` 只受沙箱档管（只读档拒命令，可写档不另隔离），也没有给命令另开一个只读目录的接口（`readRoots` 只给父轮看子轮的工作区，只管读文件的工具）。第 2 步「沙箱只读放开这一个目录」现在做不到真，换包是红线。所以 9-5b 按第 8.4 节拿掉，SKP-09 与 `S-skill-scripts` 一起记进 [BL-skill-scripts-sandbox](../backlog/BL-skill-scripts-sandbox.md)；宿主照旧不执行技能脚本，工具全集里 `bounded-script`、`run-script`、`invoke-skill` 不提供的原因随之改写。

## 4. 9-8 能力包合同

### 4.1 包是什么、谁说包里有什么

用户 2026-11-09 的模型：能力包是**装东西的对象**。页面先是能力包列表；一个包下面列它的技能、MCP、工具，以及搭配的角色，角色带着自己的提示词。

合同里的包**不存、不登记**：每次调用按下面的规则现算，主人的事实照旧在主人那里（能力包需求 §3「不新建注册表」）。

| 包 | `pack_id` | 谁说它装了什么 | 装的东西 |
| --- | --- | --- | --- |
| **一个插件的安装**（应用插件与 08 的内容包都是） | `plugin:<install_id>` | 插件自己的 Manifest：插件本身就是一个包，不加新的 Manifest 键 | <ul><li>角色：`agent.roles`、`agent.subagents.roles`，沙箱包的签名角色。</li><li>提示词：`agent.prompts`，以及它登记的直接调模型的提示词（`InstructionPrompt`）。</li><li>技能：`agent.skills` 与 `methods`。</li><li>MCP：Agent Host 的 MCP 库里主人是它的那些（今天是 Coding 的项目 MCP），以及它提供连接驱动的连接所带的 MCP。</li><li>工具：它的角色 `host_tools` 里的名字（第 4.3 节）。</li></ul> |
| **Molis Work 自带** | `system:builtin` | 平台：宿主内置的 Agent 定义与 Agent Host | <ul><li>宿主自有主人的角色与提示词：助理、创作台、Alchemist、`system:*`（它们不经插件安装登记，没有 `install_id`）。</li><li>个人助理角色（`{ kind: "assistant" }`）与它的提示词：宿主内置提示词，以及没有归属角色的提示词。</li><li>全部 Agent 工具：工具的「家」在这里。</li><li>对外的 Molis Work MCP 与 `goal-advance` 技能。</li><li>平台自己注册的连接驱动所带的 MCP。</li></ul> |
| **你的角色** | `system:characters` | `modules/characters` | 你写的 Character（角色），各带自己声明的工具 |

- **用户自己组的包**（定样里的「我的研究」）本批不做（用户 2026-11-09 定）：
  - 不新建用户数据与注册表，`pack_id` 也不留 `user:` 一类的空位。
  - 记 BL，号由主会话给，主人能力包（`horizontal/kit`），去处第 72 批。
- 自带包与「你的角色」的显示名、说明由设计台定，合同只给 `pack_id` 与 `kind`。
  - 定样示例的「目标推进」包装着对外 MCP。对外 MCP 的主人是对外接入，不是 Goals，所以按本表它在自带包里。
  - 示例的「日常助理」就是自带包。

**为什么是主人上报（9-8 比较的三种放法）**：包不存、每次现算，汇总要读五类主人的事实。定「主人上报，汇总放 `horizontal/kit`」前比较过三种：

| 放法 | 怎么做 | 代价 | 结论 |
| --- | --- | --- | --- |
| 宿主扩展 Agent 定义登记 | 把五类的汇总塞进宿主已有的 Agent 定义登记（`apps/local-host/src/agent-definitions/`），页面从它读 | 它只登记「插件声明的角色、提示词、技能」，不拥有工具全集（在 Agent Host 与 SDK）、MCP 视图（在 Agent Host 的库与连接器）、Character（`modules/characters`）、作用范围（第 36 批）。要它当聚合器：要么把别的主人的事实复制进宿主，两份维护、随升级漂移；要么在宿主枢纽文件里直接读各主人的内部实现，越权且加重宿主耦合。五类各有各的 audience 与范围规则，宿主还得重写一遍过滤 | 否掉 |
| `horizontal/` 新包直接读各主人内部 | 新包代替主人读：直接读连接器、Agent Host 的 MCP 库、`modules/characters`、第 36 批的内部，汇总后出目录 | 守 `horizontal/` 的放置规矩，但跨包依赖别人的内部实现（或要新开一批只给这个包用的公开读口），事实主人变成汇总包；插件的私有数据它读不到，第三方插件无法参与；任一主人的读法变化都要改这个包 | 否掉 |
| 主人上报，汇总放 `horizontal/kit` | 每个主人登记一个上报动作（合同用同一对 `input_type`／`output_type` 发现，第 4.6 节），只读自己的事实；`horizontal/kit` 用调用方自己的客户端逐个调，按登记盖来源与所属的包、拼成包 | 9-10 里每个主人多写一个上报动作，汇总处要拼包与盖章；打开一次要每个上报者调一次（第 4.7 节）；一个上报者失败时，它可能在的包只能显示「没读到」 | 选它：主人边界不动（SSOT 一个事实一个主人），能力包不读连接器与 MCP 库等内部实现，宿主只装配；插件与宿主同一条路，第三方插件以后也能上报自己的条目（CPK-12），audience 仍按主人的规则过滤 |

- 与两个先例同构：`actions.usages.read`（`apps/local-host/src/action-usage-actions.ts`）与系统搜索 `horizontal/search`——都按合同类型找提供方、用调用方自己的客户端逐个调、由汇总处盖来源。放 `horizontal/` 而不是宿主，照用户 11-01 的放置规矩（第 10 节）。

### 4.2 角色与提示词怎样连

用户 2026-11-09 定：没有归属角色的提示词**默认归个人助理**，因为默认都由个人助理执行。

| 提示词 | 关系写在哪 | 谁写 | 不写时 |
| --- | --- | --- | --- |
| 插件 Agent 的提示词（`agent.prompts`） | **现有的** `AgentRoleDeclaration.prompts?: string[]`：角色按顺序点名它由哪些提示词组成 | 插件作者，在 Manifest | 现有规则：角色不写 `prompts`，就由这个插件声明的全部提示词组成，所以每条都归它 |
| 直接调模型的提示词（`InstructionPrompt`，`kind: "instruction"`），以及宿主的 `system:*` 提示词 | **新加**可选字段 `InstructionPrompt.role_id?: string`：这段指令为哪个角色做事。它必须是同一个主人在 `agent.roles` 里声明的角色 | 插件作者，在 `defineInstructionPrompt`；宿主的由宿主写 | 归个人助理 |
| 沙箱包的签名角色正文 | 角色自己的正文就是它的提示词（宿主已用 `sandboxAgentBodyIdentity` 认） | 包作者 | — |
| Character 的工作方式 | 第 36 批的 `work_style` 一节。它是角色自己的内容，不是登记的提示词 | 本人 | 不出现在提示词里 |

- 一条提示词可以属于同一个包里的几个角色：几个角色都没写 `prompts`，或都点名了它。它在每个角色下各出现一次，条目只有一个。
- **校验**：`role_id` 不是同一主人声明的角色，就拒绝这个主人的登记，报 `agent_definitions.instruction_role_unknown`，带 `owner_id`、`prompt_id`、`role_id`。核的位置有两处：
  - 插件与沙箱包：`apps/local-host/src/plugin-instructions.ts` 的 `registerPluginAgentDefinitions`，对 `definition.manifest.agent.roles` 核，与那里已有的 `owner_id` 核对同一处、同一时机。沙箱包走同一路，插件装配时就看得到。
  - 宿主自己的：`builtin-agents.ts` 的 `builtinRegistrations` 合完内联提示词与创作台等内联角色（`BUILTIN_INLINE_AGENT_ROLES`）之后，对合并后的角色表核。`withInstructions` 只处理宿主的 `BUILTIN_INSTRUCTIONS`，不是插件的入口，不在那里核。
  - `defineInstructionPrompt` 只核 `role_id` 是合法的 token，因为它看不到角色表。
- **显示**：在一个插件包里，归个人助理的提示词挂在包里一行「个人助理」下面。
  - 这一行引用自带包里的个人助理角色，不复制条目。
  - 所以个人助理会在几个包里出现，条目只有一个，主人是自带包。
- 内置插件今天都不必填 `role_id`：不填就归个人助理，与现在的执行事实一致。哪几条能说清属于哪个角色，由各插件写手在 `b09/kit` 里顺手补，不强求。

### 4.3 一条能在几个包里

| 类 | 能在几个包里 | 为什么 |
| --- | --- | --- |
| 工具 | **能** | <ul><li>工具是系统的，家在自带包。</li><li>一个插件包「有」某个工具，是因为它的角色在 `host_tools` 里点了这个名字。这由汇总处从角色条目算出，不另上报。</li><li>工具详情列出「在这些能力包里」。</li><li>谁真正能用，仍由角色的 `host_tools` 决定。</li></ul> |
| 角色 | 只在一个包；个人助理例外 | 角色有唯一的主人。个人助理在别的包里只作为提示词的挂处出现（第 4.2 节） |
| 提示词 | 只在一个包，可挂在包内几个角色下 | 提示词的主人是声明它的插件 |
| 技能 | **只在一个包** | `SkillRef` 带 `install_id`，一个技能只有一个安装。两个包里同名的 `skill_id` 是两个技能 |
| MCP | **只在一个包** | 一个服务器只有一个主人：插件的 MCP 库、连接的驱动，或对外接入 |

### 4.4 包的状态从内容读出

没有「整包停用」开关（主会话定；用户 R3「不另造第二套启用」）。包的状态由汇总处按下面的顺序算，第一条命中的就是：

```ts
export type KitPackState =
  | { kind: "uninstalled" }   // the installation is kept as uninstalled, its data kept for a reinstall
  | { kind: "disabled" }      // the plugin is disabled: nothing in the pack is used; the way out is enabling the plugin
  | { kind: "unknown"; issues: number[] }   // a reporter whose entries could be in this pack failed: 0-based indexes into the same `kit.catalog.list` result's `issues`
  | { kind: "attention"; items: Array<{ entry: KitEntryKey; reason: string }> }   // one or more entries cannot be used now
  | { kind: "active" };
```

- `uninstalled`、`disabled` 来自插件安装记录（第 4.6 节的包头上报）。
- `unknown`：某个上报者失败了，而它的条目可能在这个包里（第 4.7 节）。这时说不准包里有没有用不了的东西，不报「在用」，带上对应的 `issues`。
  - `issues` 是同一份 `kit.catalog.list@1` 返回里 `issues` 数组的下标，从 0 起，不跨请求有效。schema 写成 `{ type: "array", items: { type: "integer", minimum: 0 }, minItems: 1 }`，汇总处保证每个下标都在那份数组的范围内。
- `attention` 来自包里条目的 `availability`，逐项写出。工具没有可用与否，不算。
- 自带包与「你的角色」只有 `unknown`／`attention`／`active`。
- **已卸载的包只给包头**：名称、版本、「重新添加」的去处。
  - 条目不列：主人已经不在，能力包不为已不在的东西造条目（第 4.10 节）；用量历史仍在各主人那里。
  - 定样里「只剩历史」那一屏，09 写成包头加一句说明。
  - 要列历史条目，得各主人上报「已不在」的条目：记 BL，去处第 72 批。
- 没有存储，状态不落库。改状态的唯一办法是改它的内容或插件：启用插件、去连接、改技能三档。

### 4.5 条目与包的形状

合同放在：

| 文件 | 内容 |
| --- | --- |
| `packages/contracts/src/platform/kit-report.ts`（经 `platform/actions` 转出，像搜索来源协议） | <ul><li>条目与包头类型；</li><li>上报的两个合同类型与 schema；</li><li>`defineKitReportAction`；</li><li>工具来源枚举 `KIT_TOOL_ORIGINS`。</li></ul>插件实现它，SDK 从 contracts 转出（同 `defineActionUsagesAction`）。角色引用直接引第 36 批 `modules/character-role-scope` 的类型；`platform/` 引 `modules/` 已有先例（`artifact-pins.ts`、`file-sources.ts`） |
| `packages/contracts/src/services/kit.ts`（新子路径） | <ul><li>描述符；</li><li>`KIT_PROVIDER_ID = "system.kit"`、`KIT_READ_PERMISSION = "kit:read"`；</li><li>`kitCatalogActions.list`、`kitErrors`；</li><li>`KitPack`、`KitPackState`、能力包文件类型。</li></ul> |
| `packages/contracts/src/platform/model-prompts.ts` | `InstructionPrompt.role_id?` |
| `packages/contracts/src/services/agent-definitions.ts` | 提示词改写的导出与导回三个动作与文件类型（第 4.9 节） |
| `apps/local-host/src/plugin-install-actions.ts`（宿主动作，`host-actions.tsv`） | `plugins.package.export@1`，与 `plugins.install.preview`／`confirm` 同一个提供方 |

```ts
export const KIT_KINDS = ["skill", "prompt", "role", "tool", "mcp"] as const;
export type KitKind = (typeof KIT_KINDS)[number];
/** Where an Agent tool comes from (the Agent Host's tool set uses this type; contracts never import the Agent Host). */
export const KIT_TOOL_ORIGINS = ["runtime", "gateway", "business", "subagent", "plan-step", "builder"] as const;
export type KitToolOrigin = (typeof KIT_TOOL_ORIGINS)[number];

/** `plugin:<install_id>`, `system:builtin` or `system:characters` (§4.1). Never stored. */
export type KitPackId = string;
/** `<reporter provider_id>/<entry_id>`: one entry, wherever it is shown. */
export type KitEntryKey = string;

/** Where an entry comes from. Never a credential, an endpoint with a secret or a raw local path. */
export type KitSource =
  | { kind: "plugin"; plugin_id: string; title: string; version: string; install_id: string; publisher_label: string; trust: SkillPackTrust }
  | { kind: "system"; module: string; title: string }
  | { kind: "runtime"; package: string; version: string }          // the Agent runtime's own tools
  | { kind: "character"; role: PersonalCharacterRef | ProjectCharacterMemberRef; title: string; revision: number }   // batch 36's refs
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
  | { kind: "not_counted" };      // tools without a cheap last use; the page shows no count and no reason

export type KitAvailability = { available: true } | { available: false; reason: string; detail?: string };

/** Where to change it: a path on the reporter's own surface (checked, §4.6). The kit itself changes only Skills' states. */
export interface KitManageLink { href: string; label: string }

/**
 * Which role a prompt belongs to, or a role entry is. Characters and the personal assistant use batch 36's own references
 * (`modules/character-role-scope`), imported, never redefined.
 */
export type KitRoleRef =
  | { kind: "plugin"; owner_id: string; role_id: string }
  | PersonalCharacterRef            // { kind: "personal"; character_id }
  | ProjectCharacterMemberRef       // { kind: "project"; member_id }
  | { kind: "assistant" };

/** What a reporter returns for one entry. `source` and the pack are stamped by the aggregator for a plugin reporter (§4.6). */
interface KitReportedCommon {
  /** Stable within its reporter; with the reporter it is the entry's `KitEntryKey`. */
  entry_id: string;
  name: string;
  description: string;
  version: KitVersion;
  declares: KitDeclared;
  /** The project of the call context, or the personal space (shown as 「个人空间」). */
  scope: "project" | "home";
  /** Where it takes effect, in the owner's words: the features a prompt serves, who an MCP server is for. */
  where: string[];
  availability: KitAvailability;
  usage: KitUsage;
  manage?: KitManageLink;
  /** How it leaves this Home (§4.9). */
  export: "package" | "user_data" | "reference" | "none";
  /** Only a named system reporter may give these (§4.6); a plugin reporter's entries get its own installation and pack. */
  source?: KitSource;
  pack?: KitPackId;
}

export type KitReportedEntry =
  | (KitReportedCommon & { kind: "skill"; skill: SkillCatalogEntry })
  | (KitReportedCommon & { kind: "prompt"; ref: { owner_id: string; prompt_id: string };
      /** The roles it belongs to (§4.2); empty means the personal assistant. */
      prompt: { use: "agent" | "instruction"; edited: boolean; roles: KitRoleRef[] } })
  | (KitReportedCommon & { kind: "role"; ref: KitRoleRef;
      /** `host_tools` as declared: the pack's tools are computed from these (§4.3). */
      role: { subagent: boolean; execution?: AgentRoleExecution; host_tools: string[] } })
  | (KitReportedCommon & { kind: "tool"; ref: { tool: string }; tool: { origin: KitToolOrigin; writes: boolean } })
  | (KitReportedCommon & { kind: "mcp"; ref: KitMcpRef; mcp: KitMcpState });

/** One entry as `kit.catalog.list` returns it. */
export type KitEntry = KitReportedEntry & {
  key: KitEntryKey;
  source: KitSource;
  reporter: { provider_id: string; title: string };
  /** The pack it belongs to; a tool's is `system:builtin`. */
  pack: KitPackId;
  /** Tools only: every pack that has it (§4.3). */
  in_packs?: KitPackId[];
};

/** A pack as the page lists it: the header and what it holds, by entry key; entries are listed once, in `entries`. */
export interface KitPack {
  pack_id: KitPackId;
  kind: "plugin" | "builtin" | "characters";
  name: string;
  description: string;
  /** For a plugin pack: its installation (stamped from the install record); absent for the two system packs. */
  source?: Extract<KitSource, { kind: "plugin" }>;
  version?: KitVersion;
  /** The last upgrade, from the install record: SemVer before and after. */
  upgraded?: { from: string; to: string; at: string };
  state: KitPackState;
  /** Roles in order; each with its own prompts. A plugin pack's role-less prompts hang under `{ kind: "assistant" }` (§4.2). */
  roles: Array<{ role: KitEntryKey; prompts: KitEntryKey[] }>;
  skills: KitEntryKey[];
  mcp: KitEntryKey[];
  /** Tool entry keys, computed from the pack's roles' `host_tools` (§4.3). */
  tools: KitEntryKey[];
  manage?: KitManageLink;
  /** What 「导出这个包」 can carry (§4.9). */
  export: { package: boolean; prompt_overrides: boolean; references: boolean };
}

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

- **技能条目**：
  - `skill` 原样是 `SkillCatalogEntry`，不改 08 的类型。
  - 外层的 `name`、`description`、`availability`、`declares.tools`、`declares.connector_categories` 从它抄。
  - `usage` 来自 `skill_uses`。
  - 状态与启用操作照 08（CPK-01、CPK-03）。
- **`KitAvailability`**：`reason` 是主人自己的原因码（技能是 `SkillUnavailableReason`），`detail` 是给人看的字。界面按 `manage` 给去处。
- **上限**（schema 写死）：
  - `name` ≤200 字，`description` ≤2000；
  - `where` ≤20 项，各 ≤200；
  - `declares` 各 ≤64 项；
  - 一个上报者 ≤2000 条；
  - 一个包的 `roles` ≤64。
- **不进条目的**：提示词正文、改写原文、凭据、端点、本机路径。MCP 服务器的 `directory`、`executable`、`argv`、`endpoint` 都不进条目，schema 里也没有放它们的字段（CPK-09）。
- **工具用量**：能便宜取到最近一次就是 `last_only`，否则 `not_counted`。界面只显示「最近一次」或什么都不显示，不出现「次数随第 61 批」这类内部说法（主会话定）。

### 4.6 上报协议与来源盖章

```ts
export const KIT_REPORT_INPUT_TYPE = /* @version type.molis.kit-report.input "molis.kit-report.input.v{version}" */ "molis.kit-report.input.v1";
export const KIT_REPORT_OUTPUT_TYPE = /* @version type.molis.kit-report.output "molis.kit-report.output.v{version}" */ "molis.kit-report.output.v1";
/** Closed and empty: a reporter reports everything it owns in the call's scope; filtering by kind is the page's. */
export interface KitReportInput {}
/** A pack header a named system reporter gives for a plugin installation (§4.4); never from a plugin reporter. */
export interface KitReportedPack {
  install_id: string;
  status: "enabled" | "disabled" | "uninstalled";
  upgraded?: { from: string; to: string; at: string };
}
export interface KitReport { entries: KitReportedEntry[]; packs?: KitReportedPack[] }

/**
 * One owner's report of its own kit entries in the call's scope. Read-only, never connects a server, calls a tool or refreshes a
 * credential. Audiences are the owner's rule, `user` at least.
 */
export function defineKitReportAction(capabilityId: string, version: number, title: string, permissions: string[],
  options?: { scope?: "project" | "home"; audiences?: ActionAudience[] }): ActionDefinition<KitReportInput, KitReport>;
```

- 默认 `scope: "home"`、`audiences: ["user"]`、`kind: "query"`；不等模型，但和 `kit.catalog.list@1` 一样声明 `scheduling: "concurrent"`（第 10 节）：项目线上串行会让一个慢的上报者挡住其他上报者；它只读、不提交，不需要 `beforeEffect`。
- 输出 schema 封闭，派发处按它校验：多一个字段（比如 `body`），这个上报者的整份回答作废，进 `issues`。

**汇总处盖章**：来源、包与信任不取自上报者，照 `action-usage-actions.ts` 的 `source`／`reporter`。

| 上报者 | 能报的 | `source` 与 `pack` 怎样来 |
| --- | --- | --- |
| 插件的提供方（登记里 `kind: "plugin"`） | `prompt`、`role`、`mcp` 条目；不能报 `skill`、`tool`，不能报 `packs`。工具是系统的（第 4.3 节），插件报一个工具就能冒充系统工具 | <ul><li>汇总处按它的登记与安装记录盖：`source = { kind: "plugin", … }`，`pack = plugin:<它的 install_id>`。</li><li>回答里自带的 `source`、`pack` 一律丢掉。</li><li>`role.ref` 只能是 `{ kind: "plugin" }` 且 `owner_id` 等于它的插件 id；`prompt.roles` 只能是这样的角色或 `{ kind: "assistant" }`。别的丢掉这一条，进 `issues`。</li></ul> |
| 点名的系统提供方（`horizontal/kit` 里一张小表，键是提供方 id，写手按实际登记核） | 表里给它的类，以及表里给它的 `packs` | 在表里允许的来源种类与包内，用它给的 `source`、`pack`；超出就丢掉这一条，进 `issues` |

系统提供方表（初稿）：

| 提供方 | 能报的类 | 允许的来源 | 允许的包 |
| --- | --- | --- | --- |
| `system.skills` | `skill` | `plugin`（它从安装记录得来，是这件事的主人） | `plugin:*` |
| `system.agent-definitions` | `prompt`、`role` | `plugin`、`system` | <ul><li>插件与沙箱包的主人：`plugin:<install_id>`，取 `registerPluginAgentDefinitions` 注册时的 `installId`。</li><li>宿主自有主人（助理、创作台、Alchemist、`system:*`）：一律 `system:builtin`。</li></ul> |
| 工具上报者 | `tool` | `runtime`、`system` | `system:builtin` |
| Characters 的提供方 | `role` | `character` | `system:characters` |
| Agent Host 的 MCP 库上报者 | `mcp` | `mcp_server` | 主人插件的 `plugin:*` |
| 连接器 | `mcp` | `mcp_server` | 驱动所属插件的 `plugin:*`，或 `system:builtin` |
| 对外接入的上报者 | `mcp` | `outbound` | `system:builtin` |
| 插件安装服务 | 只报 `packs` | — | — |

- `skill` 类只认 `system.skills`，`tool` 类只认工具上报者，`packs` 只认插件安装服务。
- **所有**系统提供方报到 `plugin:<install_id>` 的条目，汇总处都核两件事：这个 `install_id` 在插件安装服务的包头里；它的插件 id 等于条目 `source.plugin_id`。不只 `system.agent-definitions`，`system.skills`、Agent Host 的 MCP 库上报者与连接器也一样。不合的丢掉这一条，进 `issues`。
- 这张表是信任边界，不是能力名单：上报者照样按合同类型发现，表只管「谁可以替别人说来源、说属于哪个包」。

**怎样拼成包**：
1. 插件包从插件安装服务的 `packs` 起，名称、版本、发布者从安装记录盖。两个系统包是 `horizontal/kit` 里的常量。
2. 条目按 `pack` 分进各包。
3. `roles` 取角色条目的上报顺序，即 Manifest 里的顺序。
4. 每个角色下挂 `prompt.roles` 指向它的提示词。插件包里 `prompt.roles` 为空的，挂到 `{ kind: "assistant" }` 一行下；这一行引用自带包的个人助理条目。
5. `tools`：把包内角色的 `role.host_tools` 并起来，对上工具条目的 `ref.tool`，同时算出工具条目的 `in_packs`。对不上的名字不进包：按第 5.2 节，它在装配时就已被拒。
6. 指向不存在的角色或条目的，丢掉那一项，记 `issues`。

**`manage.href`**：只能是同源路径，且在上报者自己的地方。
- 插件上报者只能指向它自己的页面路径（宿主按它的登记算出的前缀）。
- 系统提供方只能指向宿主的设置路径。

不合的去掉这条的 `manage`，条目保留，记一条 `issues`。

同一上报者的 `entry_id` 重复：报 `kit.report_invalid`，该上报者进 `issues`。

### 4.7 `kit.catalog.list@1`

| 项 | 取值 |
| --- | --- |
| 提供方 | `system.kit`，Home 级登记一次（每个项目看到同一个查询） |
| 谁能调 | <ul><li>`audiences: ["user"]`，`permissions: ["kit:read"]`，宿主在 `local-owner-permissions.ts` 给本人。</li><li>Agent、插件、MCP 调用被拒（CPK-09）。</li><li>以后第 61、63 批要读时按类开受众，每个上报动作仍按主人的规则过滤（能力包需求 §6）。</li></ul> |
| 输入 | `{}`，`additionalProperties: false`；范围从调用上下文来。不按类筛：只读一部分类，包的状态会被误报成「在用」，所以按类筛在页面里做 |
| 输出 | `{ packs: KitPack[]; entries: KitEntry[]; issues: Array<{ provider_id: string; title: string; message: string }> }`<ul><li>包的顺序：要处理的在前，其余按名称排。</li><li>`entries` 每条只出现一次，包用 `KitEntryKey` 引用。</li></ul> |
| 怎样汇总 | <ol><li>用调用方自己的客户端 `discover` 一次，按两个合同类型过滤出上报者。</li><li>对每个可用的上报者 `invoke` 一次（并行）。</li><li>按第 4.6 节盖章、拼包、核对。</li></ol>不可用的、拒绝的、超时的写进 `issues`，不拖垮整页。一个上报者失败时：<ul><li>它的条目可能在的包，状态给 `unknown` 并带这条 issue；</li><li>页面在那些包里把它那一类显示「没读到」，计数写「—」；</li><li>其余照常。</li></ul>插件上报者只影响它自己的包；系统提供方影响它表里允许的所有包 |
| 调用次数 | 打开能力包：1 个请求，其中 1 遍目录发现、每个上报者 1 次调用、各自一遍授权核对。打开一个包或一条不另发请求，技能的开头在 `excerpt` 里。只有 MCP 工具与动作的「用在哪」按需另调一次 `actions.usages.read` |
| 调度 | 照 `actions.usages.read` 声明 `scheduling: "concurrent"`：它在等别的提供方的动作，不提交任何东西，不需要 `beforeEffect` |
| 筛选与搜索 | 都在页面里做（照 08）：按类筛，同时搜包和包里的东西。系统搜索不收能力包条目 |

### 4.8 各类条目的取值

| 类 | 上报者（主人） | `ref` | 版本与差异 | `where` | 状态与去处 | `usage` |
| --- | --- | --- | --- | --- | --- | --- |
| `skill` | 只认 `system.skills` | `SkillRef`（在 `skill` 里） | `pack.version` 与 Skill 的整数版本 | `applies_to`、启用范围 | 三档，就地改；`requires_unmet` 等照 08 给去处 | `skill_uses`：`recent` |
| `prompt` | Agent 定义登记（新 provider `system.agent-definitions`） | `owner_id`＋`prompt_id` | 默认版本；有改写且默认更新了，给 `default_updated` | `used_by` | 只看；去「提示词」编辑页 | `prompt_uses`：`recent`，`kept.rows_per_key = 200` |
| `role`（插件角色、子代理、签名角色） | 同上 | `{ kind: "plugin"; owner_id; role_id }` | 角色声明的版本 | 用到它的插件功能；第 36 批之后加作用范围 | 只看；去「角色」 | `prompt_uses`：`recent` |
| `role`（个人助理） | 同上 | `{ kind: "assistant" }` | 产品版本 | 助理的每一轮 | 只看；去「助理」设置 | `prompt_uses`：`recent` |
| `role`（Character） | `modules/characters` | 第 36 批的 `PersonalCharacterRef`（个人的）或 `ProjectCharacterMemberRef`（项目成员） | 修订号 | 第 36 批之前只给声明与来源 | 只看；去「角色」 | `character_runs`：`recent` |
| `tool` | Agent Host 的工具全集（第 5 节）。上报动作 `agent.tools.kit.report@1` 由宿主装配处登记，随 9-10 | 工具名 | 系统工具：SDK 包版本＋形状指纹；平台工具：产品版本 | 开放给哪些角色 | 只看，不能开关 | `last_only` 或 `not_counted` |
| `mcp`（项目 MCP 服务器与其工具、资源） | Agent Host 的 MCP 库（读已存视图） | `server`／`action_tool`／`tool`／`resource` | 最近一次发现的差异 | 哪个插件的设置 | 「开」分开写；去 Coding 的 MCP 设置 | 已登记成动作的工具：读动作调用记录，`recent`（只留近期）。未登记的：`none` |
| `mcp`（连接带的 MCP） | 连接器 `horizontal/connector-host` | 同上，`owner: "connection"` | 同上 | 哪个连接 | 去「服务连接」 | 同上 |
| `mcp`（对外：Molis 自己的 MCP 服务器、`goal-advance` 技能） | 对外接入的主人（`mcp-settings-store` 与安装器） | `outbound` | 产品版本 | 开给哪些客户端（`action_grants`，已知运行时按 `ExternalToolId`） | 去「对外接入」 | `none`（对外调用另有调用记录，09 不读） |

- 签名角色只上报一次：`methods()` 去掉 `kind: "role"`（第 2.2 节）。
- 创作台的 `BUILDER_PROMPTS` 若不在 Agent 定义登记里，就不上报，记候选（主人创作台，随 BL-377）。

**「用在哪」**：
- 动作与 MCP 工具复用 `actions.usages.read`，在条目详情打开时按需调一次。这是「用在哪」，不是正文。
- 技能、提示词、角色的 `where` 由主人在上报里给。

### 4.9 导出与导回

每一部分走主人的路。导出、导回都只给本人，不开给 Agent、工作流、插件与 MCP（CPK-09）。第 09 批交最小路径：导出、导回、版本核对。完整体验在第 72 批。

**以包为单位（「导出这个包」）**：一个文件，里面是这个包能带走的几部分；导回时各部分仍走自己的路。导出菜单（定样的 `mw-menu`）有三项，都出同一种文件，只是带的部分不同：
- 整个包；
- 只导出你的提示词改写；
- 只导出引用。

```ts
/** What 「导出这个包」 writes: each part goes back its own owner's way (capability-pack §5). Never an installable package by itself. */
export interface KitPackFile {
  format: "molis.kit-pack";
  format_version: 1;                 // tooling/versions.json: file.molis.kit-pack
  exported_at: string;
  pack: { name: string; plugin_id?: string; version?: string };
  /** The signed content package exactly as kept (`plugins.package.export@1`), when the pack is an exportable content package. */
  package?: PluginPackageExport;
  /** The person's own edits of this pack's prompts (`agent-definitions.prompt-overrides.export@1`). */
  prompt_overrides?: PromptOverridesFile;
  /** References to what the file cannot carry: roles, tools, MCP, and a package that cannot be exported. */
  references: Array<{ kind: KitKind; ref: KitReportedEntry["ref"] | SkillRef; name: string; source_title: string; needs?: { connector_categories: string[] } }>;
}
```

| 部分 | 导出 | 导回 |
| --- | --- | --- |
| 内容包（技能、签名角色） | `plugins.package.export@1`（下文） | 页面把 `package.content` `JSON.parse` 后，作为 `bundle` 交给 08 的 `plugins.install.preview`，再 `confirm`，不另开 |
| 这个包的提示词改写（`owner_id` 是这个插件的，或自带包的 `system:*`） | `agent-definitions.prompt-overrides.export@1`，`keys` 只给这个包的 | `import.preview`／`confirm`：逐条看差异、逐条确认 |
| 引用：角色、工具、MCP、导不出包的技能 | 页面从 `kit.catalog.list@1` 的结果拼 | 页面调一次 `kit.catalog.list@1` 逐条对：在的标「已有」；不在的标「用不了」，并按 `needs` 给去处 |

- 文件的组装与解析在工作台页面代码里（只有平台用），不进合同包：合同包不放 20 行以上的函数。
- 不加新动作：三部分各调各的动作，授权仍在各动作上。
- 文件里没有服务器配置、端点与凭据，类型上就放不进去。
- 导回时文件不能当安装包用：`package` 一部分仍要过 08 的签名核对与安装确认。
- 重新序列化不影响验签：08 的签名对的是 `canonical(payload)` 的字节（`packages/plugin-runtime/src/package-verification.ts` 的 `pluginPackageSigningBytes`），不是文件原文。所以导出原样给留存的 bundle 文本，导回 `JSON.parse` 成对象再交 `bundle`，验的是同一份规范字节。`tests/kit-export.test.ts` 断言这一点：原样导出、解析、导回、验签通过，签名者不变。
- 「你的角色」包只有引用；自带包有提示词改写与引用。

**技能：`plugins.package.export@1`**。插件安装服务的动作，与 `plugins.install.preview`／`confirm` 同一个提供方，`audiences: ["user"]`。

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

- **只导内容包**（`kind: "content"`）：导出的就是 `SandboxPackageStore` 里安装时留存、验过签的 bundle JSON，原文本，**不重新签名**。
  - 本机做的、本机导入的，本来就是这个 Home 的发布身份签的（`home_local`）；
  - 第三方的带原签名（`pinned`）；
  - 所以「第三方不被换成本机签名」由「从不重签」保证（CPK-06）。
- **页面入口**：能力包页的 `POST /api/kit/package-export`（项目里是 `/projects/<id>/api/kit/…`，见第 10 节）。
  - 宿主受保护入口，只认本人，拒插件页面（`pluginPageRequest`）；能力包页的其余动作同在 `/api/kit/` 下。
  - 「导出这个包」在页面里把动作的回答放进能力包文件再存盘；不另开下载路由。
- **拒绝**：`plugin.export_unavailable`，`details.reason` 三种：
  - `host_build`：随宿主构建的内置插件，没有可分发的包，只带引用；
  - `not_content_package`：带运行代码的应用包，只带引用；
  - `package_missing`：留存的包读不到或验签不过。
- 内容包白名单不加键。

**提示词改写**：Agent 定义登记的动作，`agent_definitions` 主人，都是 `audiences: ["user"]`。文件是用户数据，不是插件。

```ts
/** The person's own edits of prompts, never a package and never installed. Also the `prompt_overrides` part of a kit pack file. */
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
| `agent-definitions.prompt-overrides.export@1`（query） | `{ keys?: string[] }`，不给就是全部改过的 | `PromptOverridesFile` |
| `agent-definitions.prompt-overrides.import.preview@1`（command，不写） | `{ file: PromptOverridesFile }` | `{ preview_id; rows: Array<{ row_id; owner_id; prompt_id; title; base_version; default_version: number \| null; status: "applicable" \| "base_mismatch" \| "prompt_missing" \| "same"; diff: DiffView }> }`<ul><li>`title` 取登记表里这个提示词的标题，不用文件里的。</li><li>`diff` 用 SDK 已有的逐行文本比较（`packages/plugin-sdk/src/diff-view.ts` 的 `compareChange`）。</li></ul> |
| `agent-definitions.prompt-overrides.import.confirm@1`（command，要 `user_action`） | `{ preview_id; row_ids: string[] }` | `{ applied: Array<{ key; revision }>; skipped: Array<{ row_id; reason }> }` |

主会话已定的四条限制：
1. 文件超过 200 行，或某行 `body` 超过 `AGENT_PROMPT_MAX_CHARS`：预览整份拒绝。输入 schema 写死上限。
2. 显示登记表的标题，不用文件里的。
3. 预览绑定发起的本人与项目，只用一次（照 `skills.import.preview`）。别人、别的项目、第二次确认，都报 `agent_definitions.overrides_preview_unknown`。
4. 只有 `applicable` 的行能确认。另外两种标出、不套用，确认里点了它们报 `agent_definitions.overrides_row_not_applicable`：
   - `base_mismatch`：文件基于的版本不是现在的默认版本；
   - `prompt_missing`：主人不在了。

其余：
- 写入经主人现有的改写保存（带修订号），与在「提示词」编辑页保存同一条路。
- 这三个动作只服务导出导回，不是在能力包里改提示词的入口；能力包需求 §4.3 那一步仍要另问用户。
- 装任何包都不改提示词：内容包白名单不变，`S-content-package` 加一条断言（第 4.11 节）。
- 两种新文件格式（`file.molis.kit-pack`、`file.molis.prompt-overrides`）进 `tooling/versions.json`，按「持久化格式」登记（写手核 `scripts/gates/initial-versions.mjs` 的名单）。第 1 版，没有升级段。

### 4.10 §9 的边角

| 边角 | 合同怎样处理 |
| --- | --- |
| 主人不在了 | <ul><li>插件卸载后，它的包只剩包头（第 4.4 节），技能、提示词、角色不再上报。</li><li>用量历史仍在各自主人那里：`skill_uses` 保留当时的名称与 `SkillRef`（08）。</li><li>删掉的 MCP 服务器、Character 同样。</li><li>能力包不为已不在的东西造「已删除」条目。</li></ul> |
| 文字 | 条目与包是每次调用现算的，不存。<ul><li>插件的名称与说明：按调用上下文的 `locale` 取它的语言文件或 `ui.translations`，同 08 技能目录的做法。</li><li>平台工具与两个系统包的说明：第 16 批前照当时写法（`L`），第 16 批切换时一起转成键与语言文件（16 批文件已注）。</li><li>代码不拿译文做判断：筛选、匹配、拼包都按 `kind`、`ref`、`pack_id`、原因码。</li><li>英文界面名 **AI kits**（主会话定）。</li></ul> |
| 范围 | 能力包按调用上下文的项目汇总，带个人空间的条目；`scope: "home"` 的标「个人空间」。不带项目时只有个人空间 |
| 搜索 | 页面内搜；系统搜索不收 |
| 调用次数 | 第 4.7 节 |

### 4.11 错误码与安全不变量

**错误码**：

| 错误码 | 声明在哪 | 什么时候报 |
| --- | --- | --- |
| `kit.report_invalid: "invalid"` | `defineErrorCodes("kit", …)` | 上报者回答里 `entry_id` 重复 |
| `plugin.export_unavailable: "not_found"` | 插件安装服务现有的错误声明（`plugin` 主人，写手核它的路径已在表里） | 第 4.9 节 |
| `agent_definitions.overrides_preview_unknown: "not_found"`、`agent_definitions.overrides_row_not_applicable: "conflict"`、`agent_definitions.instruction_role_unknown: "invalid"` | `packages/contracts/src/services/agent-definitions.ts` | 第 4.2、4.9 节 |

`tooling/gates/error-owners.json` 改两处：
- 新加 `kit` 一条，带理由，覆盖 `packages/contracts/src/platform/kit-report.ts`、`packages/contracts/src/services/kit.ts`、`horizontal/kit/`、`apps/local-host/src/kit-actions.ts`（D-4，已定）。
- `agent_definitions` 一条加 `packages/contracts/src/services/agent-definitions.ts` 这个路径。

**新不变量 `S-kit-catalog`**：独立记录，测试在 `tests/security-invariants-kit-catalog.test.ts`。

> 能力包只给本人：`kit.catalog.list@1` 只收 user 受众，用调用方自己的客户端发现并调用上报者，调用方看不到的上报者不调；上报回答按封闭 schema 校验，带正文、凭据、端点或路径的整份作废；来源与所属的包由汇总处按登记与安装记录盖章，插件上报者不能给自己报别的来源或别的包、不能报技能、工具与包头、不能把提示词挂到别人的角色下，只有点名的系统提供方能报 `system`／`runtime`／`outbound` 等来源；`manage.href` 只能指向上报者自己的地方；列能力包不连 MCP 服务器、不调工具、不刷新凭据；包导出与提示词改写的导出导回只给本人，确认要受保护入口；导出不重签。

拒绝测试：

1. Agent、插件、MCP 客户端调 `kit.catalog.list@1` 被拒。
2. 本人看不到的上报者（只给插件受众）不被调用。
3. 假上报者回答多带 `body`：整份作废，进 `issues`。
4. 插件上报者在条目里自称 `source: { kind: "system" }`、别的插件，或 `pack: "system:builtin"`：汇总后的 `source` 与 `pack` 是它自己的安装。
5. 插件上报者报 `kind: "skill"`、`kind: "tool"`（比如自称系统工具 `run-command`）或 `packs`：丢掉，进 `issues`；工具条目仍只有工具上报者的那一份。
6. 插件上报者把提示词挂到别的插件的角色：这一条丢掉，进 `issues`。
7. 非点名的系统提供方报 `runtime`／`outbound` 来源，或报不在它表里的包：丢掉，进 `issues`。任一系统提供方（`system.skills`、`system.agent-definitions`、Agent Host 的 MCP 库上报者、连接器）报到 `plugin:<install_id>` 的条目，而那个安装不在包头里，或它的插件 id 与条目来源的插件 id 不同：丢掉，进 `issues`。四个提供方各一个用例。
8. 插件上报者的 `manage.href` 指向别的插件页面、宿主设置页或外站：`manage` 被去掉。
9. 列一份有项目 MCP 与连接 MCP 的能力包：`AgentMcpLibrary.control`／`call` 与连接器刷新的调用次数都是 0。
10. Agent 调 `plugins.package.export@1` 与三个提示词改写动作被拒。没有 `user_action` 的确认被拒。插件页面请求能力包页的路由被拒。
11. 导出的第三方包字节与留存的一致，签名者不变。
12. 提示词改写的几种拒绝：
    - 预览的 `preview_id` 不能用于确认：别人的、别的项目的、用过一次的；
    - `base_mismatch` 的行确认被拒；
    - 超上限的文件预览被拒。
13. 一个插件上报者超时：它自己的包状态是 `unknown`、带这条 issue，不是 `active`；别的包照常。

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

- **由现有名单派生，不重抄**：
  - Agent Host 里的：`GATEWAY_TOOLS`、`childRoleTools` 的取值范围、`STEP_TOOLS`、创作台适配层的 `TOOLS`；
  - 合同的 `BUSINESS_HOST_TOOLS`；
  - 宿主名到 SDK 名的映射里的系统工具（今天在 `prologue-node-kit.ts`）。

  这几个名字原来的位置改成从这里取，不再各自声明字面量。
- **替掉手写的排除**：`prologue-taskboard.ts:31` 现在手写排除了 `board-report`、`board-wait`、`session-send`、`command-output`、`await-commands`、`APP_MODE_SURFACE_TOOLS`。改读 `RUNTIME_TOOLS_NOT_OFFERED` 与条目，不另起一份清单。
- **呈现不进全集**：`assistant-present.ts` 的名字到动词表留在助理，呈现归它。
  - 只是键改成受全集约束：类型写成以全集名字为键，或加一条测试，断言表里每个名字都 `isAgentTool`。
  - A 轨文件，排在 `b09/delegation` 之后（第 8 节）。
- **合同里只留** `BUSINESS_HOST_TOOLS`、`SKILL_TOOLS`（作者写声明要用）。`SKILL_TOOLS` 的注释补上为什么没有 `change-reversible`：
  - 它是可撤回的改动不经本人确认、直接执行的通道，由角色的执行方式与本人「每次确认」的设置授予；
  - 一段技能文字不能替本人决定跳过确认，所以技能不能声明它。
- `AGENT_TOOLS`、`isAgentTool` 从 `horizontal/agent-host` 的包入口导出，在 `b09/tools` 里做完；`b09/kit` 只消费，不改这个文件。
- **工具上报动作** `agent.tools.kit.report@1` 不在 9-9 做，随 9-10（`b09/kit`）由宿主装配处登记。条目来自 `AGENT_TOOLS`；包内的工具由汇总处从角色算（第 4.6 节）。

### 5.2 两条检查

1. **`host_tools` 不在全集即拒。**
   - Agent Host 核一个插件的角色声明时（`roles` 的可用性检查，与 `assertBusinessRole` 同一处），`host_tools` 里有 `isAgentTool` 认不出的名字，这个角色就不可用，原因写出那个名字。
   - 插件装配时就看得到，不等开轮；错误码 `agent.role_tool_unknown`。
   - SDK 的声明检查做不了这一条（SDK 不能依赖 Agent Host），所以只在这里。
   - 这也保证能力包里包的工具不会出现全集外的名字。
2. **与 SDK 对齐的测试**（`tests/agent-host-tool-catalog.test.ts`，CPK-07）。
   - 每个 `origin: "runtime"` 的条目，`runtime_name` 都在 `SYSTEM_TOOL_NAMES` 里。
   - `SYSTEM_TOOL_NAMES` 的每一项，要么被某个条目映射，要么在 `RUNTIME_TOOLS_NOT_OFFERED` 里。
   - 换包时多了、少了、改名了都红。
   - 另一条：内置插件所有角色的 `host_tools` 都过第 1 条检查。

### 5.3 MCP 收口

- Coding 设置页 `plugins/native/coding/src/browser/settings/mcp.ts` 自己声明的 `McpServer` 删掉，改用 `AgentMcpServerView`（`services/agent-host`；`WorkExecutorState.mcp` 已经是它）。B 轨文件。
- `apps/mcp/src/tool-catalog.ts` 的 `MANAGEMENT_GOAL_TOOL_NAMES` 从 `goal-tools.ts` 的定义派生，不再写一遍；`docs/mcp.md` 补这三个工具。
- MCP 上报只读已存的清单，不为列能力包去连服务器（第 4.11 节的拒绝测试）：
  - `AgentMcpLibrary.catalog()` 的安全视图；
  - 连接器已存的工具清单；
  - `action_grants`。
- 不在本批，照能力包需求 §8 记 BL：两条「MCP 工具登记成动作」的流水线合并；运行时登记的 MCP 动作进快照。
- GLOSSARY（随 9-7）区分两个词：
  - 「Agent 工具」：`AGENT_TOOLS`，角色 `host_tools` 里的名字；
  - 「外部工具」：第 22 批 `platform/external-tools` 的 `EXTERNAL_TOOLS`，指 Codex、Claude Code 这类本机运行时产品。

## 6. 开工前检查

### 6.1 能力包部分（9-8～9-12，以能力包需求 §10 为底）

| # | 项 | 答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实，包不存、现算（第 4.1 节）。各类的主人：<ul><li>技能：插件声明与 Agent 定义登记（08）。</li><li>提示词、插件角色、提示词属于哪个角色：插件声明与 Agent 定义登记。</li><li>Character：`modules/characters`；作用范围与继承归 36。</li><li>工具全集：Agent Host。</li><li>MCP：项目 MCP 归 Agent Host 的 MCP 库，连接带的归连接器，对外的归对外接入。</li><li>包头（已安装、停用、已卸载、上次升级）：插件安装服务。</li></ul>能力包只汇总，`horizontal/kit` 不存任何东西；来源与所属的包由汇总处按登记盖章，不由上报者自称。用户自组包不做。两份新文件是用户自己的数据 |
| 2 | 插件同等待遇 | <ul><li>插件本身就是包，内置、第三方、08 内容包一样。</li><li>上报者按合同类型发现，宿主不点名；第三方插件登记 `defineKitReportAction` 就进能力包（CPK-12）。</li><li>系统提供方表只管「谁能替别人说来源、说包」；插件给自己说的规则与内置插件一样。</li></ul> |
| 3 | 能力注册 | <ul><li>各登记一次：`kit.catalog.list@1`、每个上报动作、`plugins.package.export@1`、三个提示词改写动作。</li><li>可信身份（项目、操作者）取自调用上下文。</li><li>汇总与各上报动作都声明 `concurrent`（第 4.6、4.7 节，第 10 节）：汇总在等别的提供方；上报动作在项目线上也一样，串行会让一个慢的挡住其他。都不提交。</li><li>「导出这个包」不加动作。</li></ul> |
| 4 | 合同 | 新增与改动：<ul><li>新增 `platform/kit-report.ts`、`services/kit.ts`；</li><li>`InstructionPrompt.role_id?`；</li><li>`services/agent-definitions.ts` 加动作；</li><li>宿主 `plugins.package.export@1`；</li><li>两种文件格式进 `tooling/versions.json`。</li></ul>刷新快照：`tooling/gates/api/`（新子路径 `services/kit`、`platform/actions`、`platform/model-prompts`，以及插件 SDK 的公开 API：SDK 在 `packages/plugin-sdk/src/index.ts` 转出 `InstructionPrompt`）与 `tooling/gates/actions/`（`host-actions.tsv` 新增几行）。`role_id` 是插件作者合同的改动，不是 Manifest 改动。阶段一，不留兼容；没人在等这份合同，随本批 PR，不单开 |
| 5 | 放在哪个包 | <ul><li>汇总 `horizontal/kit`（第 4.1、4.6 节；三种放法的比较见第 4.1 节末：宿主扩展 Agent 定义登记、`horizontal/` 新包直接读主人内部、主人上报，选主人上报）；宿主只在 `kit-actions.ts` 装配。</li><li>工具全集在 `horizontal/agent-host`，用合同的 `KitToolOrigin`。</li><li>新包要登记包清单、归属、README「开发要求」。</li></ul> |
| 6 | 表与存储 | 不新增表，包不落库。用量读 `skill_uses`、`prompt_uses`、`character_runs`、动作调用记录；提示词改写预览存内存，只用一次 |
| 7 | 兼容与迁移 | 不加。MCP 流水线合并移出本批 |
| 8 | 安全边界 | 碰：新不变量 `S-kit-catalog`（第 4.11 节 13 条拒绝），`S-content-package` 加断言 |
| 9 | 调用次数 | <ul><li>打开能力包 1 个请求、1 遍目录发现、每个上报者 1 次；打开包与条目不另发请求。</li><li>不连 MCP。</li><li>`prompt_uses` 等按键批量读，一个上报者内不逐条开库（写手按 N42～N44 量）。</li></ul> |
| 10 | 升级与数据 | <ul><li>包头带上次升级；技能照 08。</li><li>提示词显示基于的版本与默认版本，导回时版本对不上不套用。</li><li>MCP 显示发现差异。</li><li>导出不重签，升级后的包照常导。</li></ul> |
| 11 | 成果与过程项 | 导出的文件是给人留存的文件，不进成果库（与 08 的内容包一样）；Character 定义沿用已有成果类型 |
| 12 | 页面、外壳与文字 | <ul><li>能力包是设置里的一节，定样 A 已选；设置页合并按第 9.1 节。</li><li>条目文字按第 4.10 节。</li><li>不加 DOM 事件，要加就登记。</li><li>导出走宿主受保护路由。</li><li>页面资源增长写明，超 10 KB 先问。</li></ul> |
| 13 | 错误 | `defineErrorCodes`，第 4.11 节；主人表加 `kit` 一条（已定） |
| 14 | 冲突面 | <ul><li>`agent-definitions/`（C）、`agent-host-composition.ts`（C）、`plugin-install-actions.ts`（C）、`apps/mcp`（C）；</li><li>`horizontal/agent-host`（C2）；</li><li>`modules/characters`（规则 7）；</li><li>Coding 设置页（B）、`assistant-present.ts`（A）、设置页与组件板（D）。</li></ul>枢纽文件：`tooling/gates/actions/host-actions.tsv`、`tooling/gates/api/`、`tooling/versions.json`、`tooling/gates/error-owners.json`、`docs/system/security-invariants/` |
| 15 | 全局最优 | <ul><li>插件：插件就是包，作者只多写一个上报动作，可选地给直接调模型的提示词写 `role_id`。</li><li>平台：不建注册表、不存包，复用使用位置与系统搜索的上报模式，放 `horizontal/` 守 11-01 的规矩。</li><li>助理：个人助理成了没归属提示词的挂处，与执行事实一致；Agent 继续读 08 的 `skills.catalog.list@1`，以后按类开受众不用改上报者。</li><li>各类平台能力：授权、连接、MCP 调用链不动；第 74 批的统计读同一批记录。</li><li>后续开发：用户自组包（BL）以后只加一种 `pack_id` 前缀与一个主人，条目与上报不改；第 61-3 批的候选读上报，不另建；第 72 批在同两种文件上补冲突与恢复。</li><li>代价：多付在 9-10，每个主人都要写一个上报动作，汇总处要拼包；换来主人边界与第三方可用。</li></ul> |

### 6.2 助理与 Coding 接点（9-1～9-7，以 09 批文件第五节为底）

| # | 项 | 答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实。<ul><li>技能目录与启用：Agent 定义登记（08）。</li><li>一轮用了哪些技能：运行记录的冻结（`frozen.skills`，含 `ref` 与 `named`）。</li><li>点名名单不是事实，是一次调用绑定的上下文，不落库。</li><li>Coding 会话里存的是选择，改存 `SkillRef`。</li></ul> |
| 2 | 插件同等待遇 | <ul><li>助理与 Coding 读同一目录；`consumer` 按角色的工作区定，不按插件名。</li><li>页面点名走所有插件共用的信封，只对自己的技能有效。</li><li>读目录用插件自己的身份、要 `skills:read`，内置与第三方一样。</li><li>委派来的引用对任何执行方都一样可读。</li></ul> |
| 3 | 能力注册 | 不新增动作。`run.start` 是工作执行方现有角色，读正文用 08 的动作；都不等模型 |
| 4 | 合同 | 改：<ul><li>`ActionCallContext` 加 `named_skills`（绑定安装与动作）、`skill_round`，改 `locale` 注释。</li><li>`run.start` 加 `skills`（原版本改）。</li><li>删 `AgentSkillRef`、方法库端口、`AgentSkillsCapability`。</li><li>`SignedAgentReference` 只剩角色。</li><li>`AssistantMethodSelection` 分两种；`assistant.methods.read@2` 只收角色。</li><li>`frozen.skills` 每项改形状，加 `frozen.reply_locale`。</li><li>SDK 拒绝 `agent.skills` 与 `methods` 重名。</li></ul>刷 `api` 与 `actions` 快照。PR 写对 Coding、助理与第三方执行方的影响：第三方执行方要声明 `skills:read`，才能用页面点的目录技能 |
| 5 | 放在哪个包 | 不新建包：<ul><li>助理：`apps/local-host/src/assistant/`；</li><li>Coding：`plugins/native/coding/`；</li><li>冻结：`horizontal/agent-host/`；</li><li>上下文绑定与信封：宿主派发处。</li></ul> |
| 6 | 表与存储 | 不新增表；删 Prologue 存储里的 `molis-coding-method`；Coding 会话的技能选择换新键 `skills:<会话>`，旧键 `methods:<会话>` 不再读（第 2.7 节） |
| 7 | 兼容与迁移 | 不加。旧形状一次清掉，不认、不迁、不提示；会话选择换新键，旧键不读，所以旧会话不会卡住（第 2.7 节，用户 2026-11-09 定） |
| 8 | 安全边界 | 碰：<ul><li>新不变量 `S-skill-delegation`（第 2.6 节 12 条拒绝）；</li><li>`S-skill-catalog` 改位置；</li><li>9-5b 另加 `S-skill-scripts`。</li></ul> |
| 9 | 调用次数 | 第 3.4 节读取次数表与计数夹具；助理 `methods()` 改成一次取 |
| 10 | 升级与数据 | <ul><li>一轮冻结精确版本。</li><li>升级、换安装后，存着的选择不再是当前的，读取被拒，不悄悄换（SKP-07）。</li><li>Prologue 登记键按内容摘要，升级不读旧缓存。</li></ul> |
| 11 | 成果与过程项 | 不涉及：技能不产成果，Coding 报告不变 |
| 12 | 页面、外壳与文字 | <ul><li>不新增页面。</li><li>两处菜单（`assistant-composer.ts`、Coding 的 `slash-menu.ts`／`palette.ts`）改读目录；Coding 菜单对别的插件的 `manual` 技能标「只能在助理里点名」。</li><li>Coding 方法页删掉。</li><li>不加 DOM 事件。</li><li>Coding 页面资源量一下，超 10 KB 先问。</li></ul> |
| 13 | 错误 | 新码 `agent.role_tool_unknown`（C2）。Coding 现有 `coding.server.method-*` 核一遍写法，旧方法路的删掉 |
| 14 | 冲突面 | 第 8 节，含与第 10 批 #1991 的重叠 |
| 15 | 全局最优 | <ul><li>插件：任何执行方（含第三方沙箱执行方）同一条信任路；绑定的上下文字段替掉只在宿主进程里成立的存储。</li><li>平台：沿用 `original_input` 的绑定、`call_id` 的逐轮带法，不另造。</li><li>助理：点名一次，自己用和交给执行方用同一份。</li><li>各类平台能力：技能目录（08）不改；能力包读同一份 `SkillCatalogEntry`。</li><li>后续开发：第 12 批只等 9-1～9-5；第 41 批的选用照读 08 目录；第 61 批的组合候选可读 `frozen.skills`；以后宿主出一个能嵌进插件页面的技能选择器时，跨插件点名多一个宿主入口，合同不用改。</li></ul> |

## 7. 验收对照表

| 编号 | 片 | 证明它的测试或走查 |
| --- | --- | --- |
| CPK-01 | 9-10、9-11 | `tests/kit-catalog.test.ts`：<ul><li>能力包列表出插件包、自带包、你的角色；</li><li>包里分角色（带提示词）、技能、MCP、工具；</li><li>按类筛、能搜；</li><li>技能条目与 `skills.catalog.list@1` 逐字段一致。</li></ul>另有页面走查 |
| CPK-02 | 9-10、9-2、9-4 | 同上。另外：<ul><li>同一技能在能力包、助理、Coding 三处的 `SkillRef` 与 `pack.version` 相等：`tests/kit-catalog.test.ts`（能力包技能条目与 `skills.catalog.list@1` 逐字段相同）、`tests/assistant-methods.test.ts`（助理读同一目录、同一 `SkillRef`）、`tests/security-invariants-skill-delegation.test.ts`（助理点名的同一 `SkillRef` 到 Coding 的一轮）；</li><li>来源与包盖章（`S-kit-catalog` 第 4、5 条）。</li><li>**部分**：包上次升级（`KitPack.upgraded`）与 MCP 发现差异（`KitVersion.change.discovered`）本轮没有数据主人，见第 10 节偏离记录；`tests/capability-pack-closeout.test.ts` 钉住这条偏离写进了合同稿。</li></ul> |
| CPK-03 | 9-10、9-11 | `tests/kit-catalog.test.ts`：<ul><li>只有技能条目有改状态的操作，其余只有 `manage`；</li><li>包没有开关字段，状态随插件停用、条目不可用而变；</li><li>MCP 三种「开」各一个字段；</li><li>代码里搜不到能力包自己的启用状态。</li></ul> |
| CPK-04 | 9-10 | `tests/kit-catalog.test.ts`：<ul><li>`prompt_uses` 写满 200 行后，`usage.kind === "recent"`、`kept.rows_per_key === 200`；</li><li>工具是 `last_only` 或 `not_counted`；</li><li>没有能力包用量表（表主人门禁）。</li></ul> |
| CPK-05 | 9-1～9-5 | <ul><li>`tests/assistant-methods.test.ts`（SKP-02、SKP-04、SKC-07）、`tests/agent-host-skill-reads.test.ts`（SKC-07：一轮只读一次目录与正文）、`tests/security-invariants-skill-delegation.test.ts`（S-skill-delegation 2、CPK-05）。</li><li>助理点名的技能进 Coding 的冻结记录 `named: true`：`tests/security-invariants-skill-delegation.test.ts` 的 CPK-05 用例；`tests/coding-work-executor.test.ts` 的 CODING-80 只证会话里**已存的**技能选择冻结进轮，不是这一条。</li></ul> |
| CPK-06 | 9-10 | `tests/kit-export.test.ts`：<ul><li>「导出这个包」的文件装回另一个临时 Home，内容包可用、版本相同；</li><li>第三方包导出字节与留存一致；</li><li>提示词改写 `base_mismatch` 不套用，逐条确认；</li><li>引用部分不含凭据与端点。</li></ul> |
| CPK-07 | 9-9 | `tests/agent-host-tool-catalog.test.ts`；`host_tools` 未知名的拒绝用例 |
| CPK-08 | 9-12 | `tests/capability-pack-closeout.test.ts`：在源码树里搜不到收口表要删的旧标识，记下的 BL 每条带具体批次去处；收口表逐行 `git grep` 结果写进 PR；BL 与候选每条带主人与去处 |
| CPK-09 | 9-1、9-10 | `tests/security-invariants-skill-delegation.test.ts`（第 2.6 节 1～12）、`tests/security-invariants-kit-catalog.test.ts`（第 4.11 节 1～13） |
| CPK-10 | 9-7、9-12 | 文档 diff：<ul><li>SSOT、`PACKAGE-BOUNDARIES.md`；</li><li>作者手册「怎么做能力包」：插件就是包、`role_id` 怎么写；</li><li>GLOSSARY：能力包与组件板 kit、Agent 工具与外部工具；</li><li>三种放法的比较正文（第 4.1 节末；`tests/capability-pack-closeout.test.ts` 钉住它存在、第 6.1 节第 5 项引到它）。</li></ul> |
| CPK-11 | 9-11 | `[人工]` 本人验收 |
| CPK-12 | 9-10 | `tests/kit-catalog.test.ts`：样例插件（`examples/plugin-sample` 风格的测试夹具）登记上报动作，不改宿主就出现在它自己的包里；它只拿到调用方的权限，来源与包被盖成它自己 |
| CPK-13 | 9-10 | `tests/kit-catalog.test.ts`：<ul><li>角色点名的提示词挂在这个角色下；</li><li>带 `role_id` 的指令提示词挂在那个角色下；</li><li>都没有的，挂在包里的「个人助理」一行下，条目只有一个；</li><li>`role_id` 不是同一主人的角色，登记被拒。</li></ul> |
| CPK-14 | 9-10 | `tests/kit-catalog.test.ts`：<ul><li>插件停用后包是 `disabled`；</li><li>卸载、数据保留后是 `uninstalled`，只有包头；</li><li>一个技能缺连接时，包是 `attention`，`items` 指到它；</li><li>一个工具被两个包的角色点名时，`in_packs` 有两个，条目只有一个。</li></ul> |
| SKP-02、SKP-04、SKC-07 | 9-2、9-4、9-5 | `tests/assistant-methods.test.ts`（助理读目录、同一 `SkillRef`）、`tests/agent-host-skill-reads.test.ts`（SKC-07：一轮只读一次目录与正文）、`tests/skill-catalog-runtime.test.ts`（SKC-05～09：三档设置、冻结命名与精确读取）；`tests/assistant-methods.test.ts`、`tests/plugin-methods-runtime.test.ts` 的旧「按动作过滤」断言改成读目录（预期变化，PR 写明） |
| SKP-03 | 9-4 | `applies_to: "assistant"` 的技能不在 Coding 的菜单与目录读里 |
| SKP-06、SKP-07、SKC-08 | 9-4、9-5 | `tests/agent-host-skill-reads.test.ts`：停用、撤销、卸载、世代变化后开轮被拒；`S-skill-delegation` 第 12 条 |
| SKC-06 | 9-1 | `S-skill-delegation` 第 1、3～11 条；原 `security-invariants-skill-catalog` 用例改读新字段 |
| SKC-11 | 9-4、9-5 | `git grep` 不到 `molis-coding-method`、`agent.skills.discover`、`agent.skills.install`、`AgentSkillLibrary` 和 Coding 方法页 |
| SKC-13 | 9-5 | 第 3.2 节两层底线测试 |
| SKP-09 | 9-5b（移出本批，见第 3.6 节结果） | 记进 BL-skill-scripts-sandbox，本批不验 |
| CHO-03/04/05 | 9-3、9-4 | `tests/security-invariants-skill-delegation.test.ts`（S-skill-delegation 2、CPK-05）：助理点名的技能随开始的一轮到达 Coding 的冻结记录（技能一半）。`tests/coding-work-executor.test.ts` 的 CODING-80 只证会话里**已存的**技能选择冻结进轮，不证方法与 MCP 随助理开始的一轮到达；MCP 到达、助理与页面冻结等价没有用例（第 12 批核账 G7 记的缺口）；不可用原因随第 12 批项 1 |
| SKP-12、ADH-23 | 9-6 | `[人工]`；隔离 Home 里用 MiniMax 的工程核对另记 |
| 读取次数 | 9-5、9-2 | 第 3.4 节计数夹具 |

CPK-13、CPK-14 是第 3 稿新加的，同一提交写进能力包需求 §11。

2026-11-11 第 09 批审计整改：本表把三处原本写错的用例文件名换成实际断言的文件（同一技能在能力包、助理、Coding 三处各由哪份测试证），改正 CODING-80（只证会话里已存的技能冻结进轮）与 CHO-03 的对应，CPK-02 标「部分」（两类升级差异见第 10 节）；收口与三方案比较正文由 `tests/capability-pack-closeout.test.ts` 钉住。

## 8. 子分支拆法建议

按第 8.4 节：
- 合同先、服务再、消费者最后；
- 两个写手不碰同一批文件；
- `platform/actions.ts`、`tooling/gates/api/` 的同一子路径，同一时间只一个写手。

**与第 10 批 #1991 的重叠**（`git diff origin/main...origin/batch/10`）：
- `packages/contracts/src/platform/actions.ts`（加 `composer_source`，3 行）；
- `services/assistant.ts`；
- `assistant-dispatch.ts`、`assistant-round-materials.ts`、`assistant-send-materials.ts`；
- `assistant-composer.ts` 拼 `method_id` 的那段。

建议：
- `b09/contract`、`b09/assistant`、`b09/delegation` **以 #1991 合入 main 后为基点**。本批分支届时同步一次 main：第 8.4 节第 4 条允许「本批真要用到 main 上新合入的东西」时合一次。
- `b09/freeze`、`b09/scripts`、`b09/tools` 不碰这几个文件，可以先开。
- 主会话定：`b09/contract` 等 #1991 合入后再开工，本批分支届时从新 main 重切（现在还没有代码提交）。

| 子分支 | 内容 | 写手 | 前置 | 碰的文件 |
| --- | --- | --- | --- | --- |
| `b09/contract` | 只加不删的合同：<ul><li>`named_skills`（`ActionNamedSkills`）、`skill_round`、`locale` 注释、`run.start.skills`；</li><li>`platform/kit-report.ts`、`services/kit.ts`、`InstructionPrompt.role_id?`；</li><li>错误码、版本条目；</li><li>SDK 的 `agent.skills`／`methods` 重名检查；</li><li>两个快照。</li></ul> | C1，Opus 5.5 high | 本稿过复审；#1991 合入（见上） | `packages/contracts/src/platform/{actions,work-executors,kit-report,model-prompts}.ts`、`services/kit.ts`、`packages/plugin-sdk/src/agent-declarations.ts`、SDK 转出、`tooling/` |
| `b09/freeze` | 先 9-5：<ul><li>目录端口与身份、委派例外；</li><li>编译期锁、两道检查、内容摘要键、计数夹具；</li><li>上下文绑定与信封，换掉 `skill-selection.ts`；</li><li>回复语言：组装处读调用记录的 `locale`，加 `frozen.reply_locale`。</li></ul>接着同一分支 9-4：<ul><li>Coding 改读目录，Manifest 加 `skills:read`；</li><li>合并规则；</li><li>删旧路与方法页，旧形状一次清掉。</li></ul> | 先 C2 再 B 接力，各 Opus 5.5 high／medium | `b09/contract` | `horizontal/agent-host/`、`services/agent-host*.ts`、`agent-host-composition.ts`、`plugin-route-operations.ts`、`plugin-actions-client.ts`、`agent-definitions/skill-*`、`plugins/native/coding/` |
| `b09/assistant` | 9-2：<ul><li>`SignedAgentReference` 只剩角色；</li><li>`methods()` 读目录，`bindSigned` 一次取；</li><li>签名角色只出现一次；</li><li>助理历史材料只认新形状。</li></ul> | 先 C（`agent-definitions.ts`、`services/agent-definitions.ts`）再 A 接力；Opus 5.5 medium | `b09/contract`；#1991 合入；与 `b09/freeze` 并行，文件不重叠 | `apps/local-host/src/agent-definitions/agent-definitions.ts`、`apps/local-host/src/assistant/*`、`services/assistant.ts`、`assistant-composer.ts` |
| `b09/delegation` | 9-3：委派时带 `run.start.skills`，宿主写绑定的 `named_skills` 与 `locale`；`S-skill-delegation` 全部拒绝测试 | A，Opus 5.5 high（安全） | `b09/freeze`、`b09/assistant` 合回 | `assistant-dispatch.ts`、`assistant-executor.ts`、`assistant-round-materials.ts`、`docs/system/security-invariants/`、`tests/security-invariants-skill-delegation.test.ts` |
| `b09/scripts` | 9-5b（SKP-09）；2026-11-09 移出本批，只留移出记录（第 3.6 节结果） | C2，Opus 5.5 high | `b09/freeze` | `horizontal/agent-host/`、沙箱规则 |
| `b09/tools` | 9-9：<ul><li>工具全集；</li><li>`RUNTIME_TOOLS_NOT_OFFERED` 替掉 `prologue-taskboard.ts` 的排除；</li><li>`host_tools` 检查、对齐测试；</li><li>MCP 收口。</li></ul>`AGENT_TOOLS` 与 `isAgentTool` 从 `horizontal/agent-host` 导出，在本片做完。接力：`assistant-present.ts` 的键约束由 A 在 `b09/delegation` 之后做；Coding 设置页由 B 做 | C2 起；Opus 5.5 medium | `b09/freeze`（同包串行）；与 `b09/scripts` 不能并行（同包） | `horizontal/agent-host/src/{tool-catalog,…}.ts`、`apps/mcp/`、`docs/mcp.md`、`plugins/native/coding/src/browser/settings/mcp.ts`、`assistant-present.ts` |
| `b09/kit` | 9-10：<ul><li>`horizontal/kit`：汇总、来源与包盖章、拼包、状态、系统提供方表；</li><li>`kit-actions.ts`；</li><li>各上报者，含插件安装服务的包头与 `agent.tools.kit.report@1`；</li><li>`role_id` 的登记校验（`plugin-instructions.ts`、`builtin-agents.ts`）；</li><li>只消费 `horizontal/agent-host` 导出的 `AGENT_TOOLS`，不改它。</li><li>`plugins.package.export@1`；</li><li>提示词改写三个动作。</li></ul> | C，Opus 5.5 high；Characters 一侧按规则 7 | `b09/assistant`（`methods()` 去角色）、`b09/tools`（工具全集） | `horizontal/kit/`、`apps/local-host/src/kit-actions.ts`、`plugin-install-actions.ts`、`plugin-instructions.ts`、`agent-definitions/`、`modules/characters/`、`services/agent-definitions.ts` |
| `b09/kit-page` | 9-11：<ul><li>按定样 A 实现；</li><li>设置页合并（第 9.1 节）；</li><li>「导出这个包」的组装与导回的解析。</li></ul> | D，按定样 | `b09/kit` | 设置页、组件板、`apps/workbench/src/settings-skills.ts` 一带 |
| `b09/docs` | 9-7、9-12 收口与归属 | 任一写手，Sonnet 5.5 xhigh | 9-1～9-4 写法稳定 | `skills/molis-plugin-dev/`、`docs/` |

并行窗口（最多 3 个写手）：
1. `b09/contract`
2. `b09/freeze` ‖ `b09/assistant`
3. `b09/delegation` ‖ `b09/tools`（`assistant-present.ts` 一步等 `b09/delegation` 合回）
4. `b09/scripts` ‖ `b09/kit` ‖ `b09/docs`
5. `b09/kit-page`
6. 9-6

第 12 批只等到第 3 步的 `b09/delegation`。能力包部分卡住时，按批次文件「顺序」一段拿掉 `b09/kit`、`b09/kit-page` 的提交；工具全集与 CPK-07 留在 9-9。

## 9. 对快照与登记的影响清单（给写手核）

- `tooling/gates/api/`：
  - `platform/actions`：`ActionNamedSkills`、`ActionCallContext` 两个字段、`locale` 注释、`kit-report` 转出；
  - `platform/work-executors`；
  - `platform/model-prompts`：`role_id`；
  - 插件 SDK 的公开 API 快照：SDK 转出 `InstructionPrompt`（`packages/plugin-sdk/src/index.ts`），`role_id` 跟着进快照。这是插件作者合同的改动，不改 Manifest；PR 写对插件作者的影响（可选字段，不写就归个人助理）；
  - `services/agent-host`：删 `AgentSkillRef` 等，改 `frozen.skills`，加 `frozen.reply_locale`；
  - `services/agent-definitions`、`services/assistant`；
  - 新 `services/kit`；
  - SDK 转出 `defineKitReportAction` 与类型。
- `tooling/gates/actions/`：
  - 新增 `kit.catalog.list@1`、各 `*.kit.report@1`、`plugins.package.export@1`、三个提示词改写动作；
  - 输入形状变：`assistant.methods.read@2`、Coding 工作执行方 `run.start`；
  - 删除 `agent.skills.discover`／`install` 相关。
- `tooling/versions.json`：两个上报类型、`file.molis.kit-pack`、`file.molis.prompt-overrides`、新动作的版本条目。
- `docs/system/security-invariants/`：
  - 新记录 `S-skill-delegation`、`S-kit-catalog`，以及 9-5b 的 `S-skill-scripts`；
  - 改 `S-skill-catalog`、`S-content-package`。
- 新包 `horizontal/kit`：登记 `scripts/workspace-packages.mjs`、`docs/system/PACKAGE-BOUNDARIES.md`「现行包清单」、`docs/SSOT-MATRIX.md`，再跑 `node scripts/package-owners.mjs --write`。
- `tooling/gates/error-owners.json`：新加 `kit`；`agent_definitions` 加 `packages/contracts/src/services/agent-definitions.ts`。
- `docs/system/GLOSSARY.md`（随 9-7）：
  - 「能力包」：代码 `kit`（动作 `kit.*`、类型 `Kit*`、包 `horizontal/kit`），英文 AI kits；
  - 「能力库」是动作目录；
  - `docs/design/kit/` 和 design-system 里的「kit」指组件板的实件，不是能力包；新代码在这两处之外出现 `kit` 一律指能力包；
  - 「Agent 工具」与「外部工具」分开。

### 9.1 设置页合并（主会话按设计台建议定）

| 页 | 怎么办 |
| --- | --- |
| 技能（全局设置 AI 组，第 08 批；项目设置里的技能） | **并进**能力包：导航里「技能」换成「能力包」；旧地址打开能力包 |
| 提示词 | **列表并进，编辑页保留**：导航去掉「提示词」，从提示词详情进编辑页（第 40 批在这上面做） |
| 角色 | **保留**，能力包里的角色链过去 |
| 能力库、服务连接、对外接入、调用记录、AI 与执行工具 | **保留**，从 MCP 和工具详情链过去 |
| Coding 的 MCP 页 | **保留**，能力包链过去 |
| Coding 的方法页 | **删**（9-4、9-5） |
| Goals 的规划方法库 | **保留**，不并 |

- 合并后「AI」组是：模型设置 · 助理 · 角色 · 能力包。
- 设置页文档列今天被 `:is(body.project-preferences-page, …) .settings-content > .settings-document` 限在 760px，第 08 批 `.skill-settings` 写的 1100px 被它盖住。
- 能力包要并排列表与详情，`b09/kit-page` 改这一处；08 的技能目录跟着变宽。

## 10. 偏离记录（交主会话写进 09 批文件）

| 原来怎样 | 现在怎样 | 为什么 |
| --- | --- | --- |
| `run.start` 新形状「走 `.v2` 类型」 | 原版本改 | 合同变更流程第 3 节与合同自己的注释；封闭输入已防住静默丢技能（第 2.1 节） |
| 「只重签本机的包」 | 导出从不重签，原样导出留存的签名包 | 本机的包本来就是本机身份签的；不重签直接保证第三方不被换签名（第 4.9 节） |
| 汇总放哪「9-8 再定」 | `horizontal/kit` 新包，宿主只装配 | 用户 11-01 的放置规矩；系统搜索先例 |
| 08 的点名用进程内存储 | 调用上下文里绑定安装与动作的 `named_skills`，加只给 `system.skills` 的 `skill_round` | <ul><li>跨插件边界、跨进程都成立；</li><li>不被整轮继承；</li><li>不随嵌套调用和工具调用漏进别的插件。</li></ul>（第 1、2.3 节） |
| 插件页面可以点名任何技能（第 1 稿） | 页面只能点名自己安装的技能，跨插件点名只认宿主入口 | 公共合同台合审 B2，主会话定 D-1 |
| 宿主以本人身份为一轮读目录（第 1 稿） | 以开这一轮的插件身份读，插件要 `skills:read`；只有宿主委派绑定的引用以委派的本人读 | 公共合同台合审 B3 |
| SKP-09 归属未定 | 9-5 单列 9-5b | 第 3.6 节 |
| 统筹裁定第 3 条：`tests/agent-host.test.ts:715` 的拒绝断言由底线测试替换 | 保留它，另加共同目录技能的底线测试 | 那条断言测的是插件自己的 `agent.skills`；只有共同目录的技能改成「只当说明」，自己的仍比（第 3.1、3.2 节） |
| 第八节第 5 条：`methods:<会话>` 等用户定，推荐「不认不迁、提示重选」 | 一次清掉：旧路、旧存储、旧形状全删，不认、不迁、不兜底、不提示 | 用户 2026-11-09 定：现在没有用户（第 2.7 节） |
| 能力包是「五类按类汇总的一张目录」 | 「包 → 条目」：<ul><li>插件就是包，另有自带包与「你的角色」；</li><li>角色带提示词；</li><li>包的状态从内容读出。</li></ul> | 用户 2026-11-09 更正模型、选定样 A（第 4.1～4.4 节） |
| 导出按类各出一份文件（第 1、2 稿的引用文件） | 「导出这个包」出一种文件，几部分各回主人的路；按类的引用文件去掉 | 以包为单位导出（设计台缺口第 4 条） |
| 下载路由 `GET /api/plugins/packages/:install_id/export` | 能力包页的 `POST /api/kit/package-export`（与列包、提示词改写三个动作同一个入口），不单开下载路由 | 「导出这个包」总是写能力包文件，内容包放在文件里；页面只要动作的回答，一个入口少一扇门（9-10 先放在 `/api/plugin-trust/`，9-11 页面接上时收进 `/api/kit/`） |
| MCP 工具登记成动作的，「读动作调用记录，`recent`」 | MCP 工具的用量是 `not_counted` | 调用记录是诊断日志，全 Home 共一个上限（留最近 1000 条命令），既不是每键行数也不是天数，读出来的计数会误导；真正的用量要等两条 MCP 动作流水线合并（BL，9-12）后由动作主人记（9-10） |
| 连接 MCP 的 `configuration_version` | 取连接最近一次修改的时间（秒） | 连接没有自己的配置版本号；修改时间单调、读得到，不另造计数（9-10） |
| 对外 MCP 一条（开给谁在 `granted_to`） | 每个开着授权的客户端一条，`ref` 是那个客户端 | `KitMcpRef` 的 `outbound` 一部分本来就带 `client_id`；一条一个客户端，「去处」直接到它的授权页（9-10） |
| 项目 MCP 的资源也上报 | 只报服务器与工具，资源不单列 | 资源名常是带路径或地址的 URI，与「不带端点与路径」相冲；条目里不放（9-10） |
| 上报者没有时限 | 每个上报者限 5 秒（`KIT_REPORT_TIMEOUT_MS`），上报动作与 `kit.catalog.list@1` 都声明 `scheduling: "concurrent"` | 不声明并行的动作在项目线上一个接一个跑，一个慢的上报者会挡住其他上报者；第 4.11 节第 13 条要求超时只影响它自己的包（9-10） |
| `AgentDefinitions` 加 `useCounts()` | 提示词用量另成 `PromptUses`（`record`／`list`／`counts`），`AgentDefinitions.uses` 指向它 | 巨大单元只许变小：把用量这一件事拆出去，类不再是巨大单元，登记的例外删掉（9-10） |
| 包头带上次升级（`KitReportedPack.upgraded`、`KitPack.upgraded`） | 合同保留形状，本轮没有产出者：`pluginKitHeaders` 只给当前版本与状态，`upgraded` 不设 | 安装记录 `PluginInstanceRecord` 只有当前 `version`；`updated_at` 在授权、状态变化时也改，不是升级时间。包留存 `SandboxPackageStore.releases()` 是所有留存发行包（内置插件与宿主构建的包不在里面），分不出「上次从哪版升来」、也给不出时间。要产出得给安装记录加旧版本字段或升级回执——改库结构与版本号、写升级段；本轮红线不做。**CPK-02 部分**，留后续批（与第 61 批的 SDK 补缺一起看） |
| MCP 显示最近一次发现的差异（`KitVersion.change.kind: "discovered"`） | 合同与页面保留形状，本轮没有产出者 | 连接器只留服务器最近一次列到的工具清单（`config/connector-mcp-tools.json`，`connector-mcp-actions.ts` 的 `remember` 覆盖写），项目 MCP 库只存安全视图；没有「上一次清单」可比。要产出得存上一份清单或差异记录——新数据，带版本文件／库结构与升级段；本轮红线不做。**CPK-02 部分**，随 [BL-mcp-action-pipelines-merge](../backlog/BL-mcp-action-pipelines-merge.md) 一起看 |

## 11. 待决

第 1～3 稿的待决都已定，正文按定下的写：

| # | 问题 | 定了什么 | 谁定 |
| --- | --- | --- | --- |
| D-1 | 插件页面路由带的点名信封算不算「本人点名」 | 折中：只对这个页面所属安装自己的技能算；跨插件点名只认宿主入口 | 主会话按推荐，2026-11-09 |
| D-2 | Coding 已存的 `methods:<会话>` 与助理历史里的旧方法形状 | 一次清掉，不认、不迁、不兜底、不提示 | 用户，2026-11-09 |
| D-3 | 提示词改写第一次成为动作 | 只给本人的三个动作，加四条限制（第 4.9 节） | 主会话按推荐，2026-11-09 |
| D-4 | 错误主人表加 `kit` | 加 | 主会话，2026-11-09 |
| D-5 | 用户能不能自己组包 | 本批不做，记 BL | 用户，2026-11-09 |
| D-6 | 没有归属角色的提示词放哪 | 归个人助理 | 用户，2026-11-09 |
| D-7 | 要不要「整包停用」 | 不要，状态从内容读出 | 主会话，2026-11-09 |

主会话 2026-11-09 定的三件事，本稿已按它写：

1. **排期**：`b09/contract` 等 #1991 合入后再开工，本批分支届时从新 main 重切（第 8 节）。
2. **两条 BL 的号**：用户自组包（第 4.1 节）、已卸载包列历史条目（第 4.4 节），由 9-12 写手按 `specs/BACKLOG.md` 取下一个空号。**结果（9-12）**：`specs/BACKLOG.md` 现在用语义名，记为 [BL-kit-user-packs](../backlog/BL-kit-user-packs.md) 与 [BL-kit-uninstalled-history](../backlog/BL-kit-uninstalled-history.md)。
3. **定样示例**：设计台已按本稿改了示例数据：对外 MCP 进「Molis Work 自带」，已卸载的包只显示包头。

没有仍开着的待决。
