# 状态与状态机平台能力（State Machine Platform）

状态：需求已整理，尚未实现（2026-11-08）。用户已就 §3 的十二项方向拍板（含 Skill 单独一章、家族照搬现有 21 类、第三方最终也强制），并在复查后确认按 §13 并入路线书批次（26-7、27-6、46-2、47-5；迁移进统一待办）；实施未开始，本 spec 是方案与验收依据，不是完成记录。

依据：[全仓隐式状态机盘点（2026-11-08）](../../docs/reviews/implicit-state-machines-2026-11-08.md)（对象 `main` 的 `5945c0271a`）、[AGENTS.md](../../AGENTS.md)、[CONTRACT-CHANGES.md](../../docs/system/CONTRACT-CHANGES.md)、[SSOT-MATRIX.md](../../docs/SSOT-MATRIX.md)、[插件开发 Skill](../../skills/molis-plugin-dev/SKILL.md)、[第三方插件安装方案](../../docs/system/THIRD-PARTY-PLUGINS.md)。

## 白话说明

平台给「状态」立一份统一规则，分三层：

1. **平台能力的状态名字**：所有对外可见的状态（安装、升级、删除、连接、会话、Run 相位……）在一处登记，类型、界面、文档、门禁都从这一份来。
2. **插件自己的状态机**：插件在清单里申报「有哪些状态」，在代码里声明「允许怎么变」，平台在启动时核对两边是否一致；平台只登记、校验、展示，不替插件写业务数据。
3. **可选流水账**：两段提交、中断恢复这类流程，平台给模板，数据存在插件自己的库。

带来的变化：用户、市场、安装预览能提前看到插件管哪些状态；插件不用各自发明状态词和颜色；平台自己的能力也只剩一份状态词；审计里「状态散落、只写不读、中断后不知道走到哪」的问题有了统一解法。

不做：平台不替插件写业务状态，不建第二份业务状态库，不把页面里的流程状态收归平台，也不要求一次把审计里的 144 条全部改完（那是独立迁移工作流，按批推进、计数只减）。

## 1. 问题

- 审计盘出 **144 条状态机候选 = 隐式 89 + 半显式 55**，其中 **32 条高风险**；真正显式的只有 4 个（Attention 条目、SQLite 存储升级链、外部 Prologue SDK 内部、Gmail 同步游标）。数字与逐条证据见[审计报告](../../docs/reviews/implicit-state-machines-2026-11-08.md)。
- 反复出现的七类问题：迁移规则散落/多写点、只枚举不约束、多字段乘积、状态藏在 JSON、双写、两段提交无持久中间态、页面自己再推一遍状态。
- 每新增一个功能或插件就多一份散落状态；第三方安装路径开工后，Manifest 合同再改代价更大。所以状态词汇与声明要在大批新插件出现前定下来。
- 审计报告是**快照**：它给出迁移基线、顺序建议与证据，不等于本 spec 承诺一次交付。

## 2. 目标与非目标

### 2.1 目标

1. **公开状态词汇**在 `packages/contracts` 一处登记；类型、界面家族、文档、门禁从它派生；平台服务仍拥有各自的迁移实现。
2. 插件（内置、签名第三方、创作台生成、本地开发）用同一套 Manifest 声明与 SDK 工具声明状态；平台在启动时核对清单与实现，不一致不启动。
3. 平台登记表能回答：某个已安装/已停用插件声明了哪些状态、属于哪个家族、由哪些动作触发；安装预览与市场在安装前可见。
4. 界面显示只按家族渲染，不再每个插件一套状态→颜色；未映射状态中性显示、不崩溃。
5. 给两段提交、中断恢复提供可选流水账模板（数据在插件自己的库），不做平台业务状态。
6. 审计高危条目有明确迁移顺序；存量计数只减不增，进度台账放统一待办清单。

### 2.2 非目标

- 不做平台代写业务状态、不做中央状态库、不做跨插件业务状态查询。
- 不把页面/内存里的瞬时流程收归平台；只统一词汇和家族，禁止页面复制持久状态机。
- 不强制第三方插件立刻申报；先内置强制、第三方提示（见 §3）。
- 不新增第三套「状态→颜色/图标」映射：以 contracts 的家族为准，SDK/设计系统只做家族→现有视觉的映射。
- 不把**平台内部**状态（升级账本、恢复日志、首次运行等文件/内存格式）搬进 contracts；它们只在自己的包里声明机器与迁移表（§4.7）。
- 不新增 workspace 包作为第一步（放现有 `contracts`/`plugin-sdk`/`plugin-runtime`；将来需要跨插件审计视图再加 `horizontal/*`）。
- 不在这一项里一次迁移完 144 条状态机；本 spec 交付能力与样板，迁移是独立工作流（§8）。

## 3. 已拍板的决定（用户 2026-11-08，弹窗确认）

| 编号 | 白话问题 | 决定 | 影响 |
| --- | --- | --- | --- |
| D1 | 别人自己开发的插件改状态时，平台要不要替它把关？ | **只登记和展示**（不做代写） | 平台登记、校验、展示插件申报的状态；插件自己写自己的库。改动小、不碰业务数据；代价是插件代码硬要绕过，平台拦不住（§5.5 明说这个边界）。 |
| D2 | 「有哪些状态」和「允许怎么变」写在哪里？ | **清单写状态，代码写转换** | 平台能在安装前展示和校验；合法转换在代码里，启动时与清单核对，不一致启动失败；不维护两份转换表。 |
| D3 | 跟随平台发布的内置插件要不要先强制？ | **先强制内置，第三方只提示** | 平台自己的插件先统一；第三方用 `validate` 提示和工具引导，等合同进入下一阶段再收紧（§8 批 2/批 3）。 |
| D4 | 创作台生成的插件要不要必须申报？ | **必须申报** | 生成模板、创作台校验、离线回放和隔离冒烟一起改；否则生成插件又会变成平台看不见的状态。 |
| D5 | 要不要状态变更流水账？ | **插件自己库里的可选模板** | 平台只给模板与收据规则（CAS、幂等、中断恢复），数据在插件自己的库；平台不存业务数据，也不新增平台业务状态表。 |

| D6 | 「状态机怎么写」放哪儿？ | **单独新增一章** | 新增 `skills/molis-plugin-dev/state-machine.md`；SKILL.md 的「读哪份」加一行；创作台只挂精简段落，`CHAPTERS` 与回放语料同批补 |
| D7 | 要不要单独新建一个代码包？ | **不新建** | 放现有 `contracts`/`plugin-sdk`/`plugin-runtime` 三个包；不动包清单、归属、边界门禁；将来真需要跨插件审计服务再加 |
| D8 | 第三方插件最终是否强制申报？ | **将来也强制** | 阶段一/过渡期先提示；第三方安装正式对外开放后的阶段二，未申报的第三方插件不能上架/安装；合同、validate 与文档同批收紧（见 §9、SMP-21） |
| D9 | 状态机编号怎么定？ | **插件 id 开头** | `machine_id` 以 `<plugin_id>.` 开头；`platform.*` 保留给平台；安装时检查前缀归属 |
| D10 | 先拿哪两个真实场景做样板？ | **一个简单状态 + 一个两段提交** | 简单样板选 Form 收集状态（审计 T3-14）；两段提交样板选成果固定（审计 T3-04），后者放批 3 与流水账一起 |
| D11 | 界面状态分几类？ | **照搬现有 21 类** | contracts 的 `StateFamily` 就是现有 `STATE_RING_FAMILIES` 的 21 个键；不改视觉表、不新增映射；两份键集合用穷尽测试互相对照 |
| D12 | 现在开工吗？ | **先评审一轮方案再开工** | 本 spec 先评审；评审通过后再开批 0。评审不改代码 |

尚未定死的只有内部技术节奏（Manifest schema 是否在阶段一升版），按 [CONTRACT-CHANGES.md](../../docs/system/CONTRACT-CHANGES.md) 与发布检查单决定，不需要用户拍板。

## 4. 分层与归属

原则：**平台管「声明与结构」，插件管「事实与逻辑」；每项事实只有一个主人；插件不分官方、个人、创作台生成还是第三方，同一套 SDK、同一份 Manifest 声明、同一个 Plugin Runtime 装配、同样的生命周期与授权规则**（[AGENTS.md](../../AGENTS.md) 用户 2026-10-18 决定）。

借现有先例生长，不新造引擎：

- [action-cards.ts](../../packages/plugin-sdk/src/action-cards.ts)：共享迁移规则写成纯函数，存储由调用方实现（`CardStore` + revision CAS）→ 状态机 helper 用同一模式。
- [actions.ts](../../packages/plugin-sdk/src/actions.ts) 的 `defineAction` + `inspectActionDeclarations`：定义时自校验 → `defineStateMachine` 同样在定义时校验。
- [contribution.ts](../../packages/plugin-runtime/src/contribution.ts) 的 redemption：Manifest 声明 ↔ 启动兑现双向核对 → 状态机声明按执行形态核对（§4.3）。

### 4.1 公开状态词汇（contracts：只放数据与类型）

新增 `packages/contracts/src/platform/state-vocabulary.ts`（新 subpath `./platform/state-vocabulary`，合同变更）：

- `StateFamily`：**平台闭合的语义家族**，照搬现有 `STATE_RING_FAMILIES` 的 21 个键（idle、connected、running、done、waiting、answer、paused、blocked、syncing、retrying、failed、partial、interrupted、verify、stale、disconnected、unsaved、unread、read、archived、trashed）。contracts 不能反向依赖 SDK，所以键集合以数据形式放在 contracts，SDK 的视觉表保留并**用一条穷尽测试互相对照**（任何一边增删都失败）；见 §4.5。
- `STATE_VOCABULARIES`：**纯数据表**，每个平台能力一段：`owner`、`states`（状态 → 家族）、`public`（是否对外可见）。**不放转换表、不放函数**——转换属于实现（§4.7）。
- 现有 31 个命名状态类型改成从表派生（`export type X = keyof typeof VOCAB.states`），**类型仍留在原文件**并 re-export，避免 25 个文件与 177 个 `PluginManifest` 级联改动；38 个内联联合按“公开且被界面/接口消费的”逐个升级成命名类型，其余留在原处并记入基线（§8）。
- contracts 的纯度门禁（`scripts/gates/contracts-purity.mjs`）只数副作用、可变状态和 ≥20 行函数：本表是 `as const` 数据，不加函数；helper 一律放 SDK。

### 4.2 机器声明（SDK，插件与平台实现共用）

新增 `@molis-ai/molis-work-plugin-sdk/state-machine`：

```ts
const session = defineStateMachine({
  machine_id: "coding.session",        // <plugin_id>.<object>；平台内部用 platform.<owner>.<object>
  version: 1,
  states: { idle: "idle", running: "running", waiting_answer: "answer", done: "done" },
  initial: "idle",
  terminal: ["done", "cancelled", "stopped"],
  transitions: {
    "round-started": { from: ["idle", "queued", "done", "failed"], to: "running",
      trigger: { capability_id: "coding.sessions.start", version: 1 } }, // 可选：哪个动作会触发
    "answer-received": { from: ["waiting_answer"], to: "running" },
  },
});
```

提供 `can / assert / next / family / describe`；`assert` 抛通过 `defineErrorCodes("state_machines", …)` 声明的错误（kind 用现有 `invalid` / `conflict`，HTTP 映射仍只在 [errors.ts](../../packages/plugin-sdk/src/errors.ts) 一处）。`machine.apply(port, { expectedFrom })` 给出带当前状态的 CAS 写入约定，插件在自己的 `projectDatabase` / `homeDatabase` / `storage` 上执行；**采用是可选的，不改成查询构造器**，现有 SQL 写法可以只加 `assert`/CAS 条件。

定义时自校验：状态唯一、initial 存在、转换只引用已声明状态、终态无出边、非终态至少一条出边（或显式 `allow_any`）。`trigger` 在 v1 只登记、展示，不校验动作是否存在（`molis-work-plugin validate` 只看清单、看不到代码转换；动作目录在启动后才齐），要强校验另立条目。`beforeEffect`、取消、撤权、并发动作的既有规矩不变：helper 与流水账模板都不绕过它们，异步等待后要重新核对授权。

平台包已经依赖 SDK（`packages/plugin-runtime`、`kernel`、`apps/local-host`、`horizontal/agent-host` 均如此），平台能力的状态机也用同一个 helper；区别只是它们不放进 Manifest，而在自己包里声明。

### 4.3 Manifest 声明、启动核对与“兑现矩阵”

Manifest 增加 `state_machines`（合同变更）：每条只放平台需要的元数据 `{ machine_id, version, states + families, initial, terminal }`；**转换表在代码里**（决定 D2）。解析放在 SDK 的新声明模块，接入 [manifest.ts](../../packages/plugin-sdk/src/manifest.ts) 的 `inspectOptionalDeclarations`。

**按执行形态核对**（这是复查修正的重点：不是所有插件都能“代码兑现”）：

| 形态 | 声明来源 | 启动核对 | 为什么 |
| --- | --- | --- | --- |
| 内置、随宿主执行的插件（`execution: "host"`，含 `native`/`app`/`integration`） | `src/manifest.ts` + 插件 `start()` 返回的机器声明 | **双向核对**：清单说的与代码做的不一致（多、少、状态集不同）→ 启动失败 | 两边都由我们写，核对能防漂移 |
| 创作台生成插件（沙箱，宿主代写 Manifest） | 创作台设计合同（[SandboxPluginContract](../../packages/contracts/src/platform/plugin-sandbox.ts)）由宿主生成 Manifest；宿主按合同构造 contribution | **不需要代码核对**：Manifest 与 contribution 都由宿主生成；由创作台校验 + 回放负责一致性 | 生成插件没有手写 `defineStateMachine`；硬套核对没有对象 |
| 未来第三方沙箱 app/integration（当前形态未实现） | Manifest（安装包） | 先做**声明式**：只校验形状；等其执行形态支持回报 contribution 再核对 | 当前 [THIRD-PARTY-PLUGINS.md](../../docs/system/THIRD-PARTY-PLUGINS.md) 已说明第三方 native/app/integration 沙箱形态还不存在 |
| 本地开发 `plugin dev` | Manifest + 开发 loader 加载的定义 | 有代码声明就核对；没有则只校验清单 | 开发态允许逐步补 |

Manifest 字段是**可选**的：没声明就不登记、不展示，不破坏老插件；申报了就必须过 §5.2 的规则。Manifest 解析器当前不拒绝未知顶层字段，老宿主读到新字段会忽略——阶段一可以接受；第三方安装路径一旦对外，按 [CONTRACT-CHANGES.md](../../docs/system/CONTRACT-CHANGES.md) 升 Manifest schema 版本。

### 4.4 登记表的来源与只读动作

登记表是**投影**，不新增平台表：

- 来源一：运行中的定义（内置插件启动列表随宿主构建）——从 `PluginDefinition.manifest` 读。
- 来源二：安装记录对应的 release artifact（非 host 信任插件、生成插件都存 `plugin_runtime_release_artifacts.artifact_json.manifest`），**停用/未启动也能读**。
- 来源三：创作台生成插件的 release（宿主代写 Manifest，同一 artifact 表）。
- 查不到 Manifest 或形状失效 → 该条目标「未知」并带原因，不猜、不补。

只读动作（合同定义在 contracts，provider 实现在 `packages/plugin-runtime`，宿主只多一行注册）：

- provider：`system.state-machines`；能力：`state_machines.list@1`、`state_machines.get@1`，`operation: "query"`。
- 入参按 caller 所在范围（Home / 项目）过滤；只返回元数据（plugin_id、version、安装/启用状态、机器、状态、家族、触发动作引用），**不含业务值、密钥、正文**。
- 不新增 Manifest 权限；按现有动作目录与受众规则；MCP 工具名会进动作合同快照，PR 里写清。
- 没有 Home 或当前范围没有安装时，provider 仍注册，查询返回空清单与原因，不报错、不触发插件启动。页面/市场/安装预览可以走动作，也可以由宿主把同一份投影填进页面数据；两条路共用同一个投影函数，不各算一遍。

### 4.5 界面家族

- contracts 定义**21 个语义家族**（与现有 `STATE_RING_FAMILIES` 的键一一对应）；SDK/设计系统把家族映射到现有视觉：状态环、图标、文案（`STATE_RING_FAMILIES`、`STATE_RING_LABELS`、`MwStatusTone` 的既有消费方保持不变）。不新增第三套颜色表，不重命名现有视觉 API。
- 现有 `StateRingState`/`stateRingFamily` 保留兼容；新增安全映射：未知状态 → 中性家族，**不再 `.find(...)!.key` 崩溃**（当前实现会崩，见复查记录）。
- 插件自己的状态文案可选：第三方用 `ui.messages`/`ui.locales` 的静态键；内置插件在第 16 批语言改造前继续用现有 `L`/`p.text`，**本 spec 不要求内置插件新增 `ui.locales`**（否则会被 `tests/ui-text-locale-files.test.ts` 拦）。
- 家族标签是平台界面文字：沿用现有 21 类的文案，不改既有中文/英文；只补“未知状态回退中性”的文案，并过翻译门禁。

### 4.6 可选流水账（决定 D5）

SDK 提供 `defineOperation` / `createStateLedger` 模板：状态事件 + 当前进度 + CAS + 幂等回执，数据存在**插件自己的库**（与 [sync-document.ts](../../packages/plugin-sdk/src/sync-document.ts) 同思路：只给协议，不给库）。必须与既有规矩兼容：并发动作的 `beforeEffect`、取消/撤权后不写、迟到结果不复活、恢复不重复已发生效果。平台不存流水、不做业务状态投影；模板格式版本进 `tooling/versions.json`（`format.*`）。

首批受益场景来自审计：成果固定版本（T3-04）、跨分区移动（T5-21）、Home 升级单元（T4-01）、项目删除收据（T4-03）、页面授权等待（T7-03）；是否迁、先迁哪一组由迁移工作流排。

### 4.7 平台能力状态的迁移

- **公开**状态（界面/接口/动作能看到的）进 contracts 词汇表；**内部**状态（升级账本、恢复日志、首次运行、安装器计划等文件/内存格式）不进 contracts，只在自己的包里用 SDK helper 声明机器与迁移表。
- 平台服务的迁移实现留在各自包；转换表**不写进 contracts**，避免实现与声明两份规则。
- 首批迁移的公开类型先选 4～6 个高频的（如插件生命周期、连接状态、Run 相位、知识卡、调度），每个文件配一条“表 ↔ 类型 ↔ 实现”的一致性测试；其余按基线只减推进。
- 审计里的重复实现按报告 §5 归并：先定唯一主人，再收口（成果固定、跨分区移动、授权等待、插件生命周期优先）。

## 5. 自定义插件（同一待遇）

### 5.1 现状与同一待遇

内置、创作台生成、本地开发、将来的签名第三方**走同一条路**：同一份 `parsePluginManifest`（[manifest.ts](../../packages/plugin-sdk/src/manifest.ts)）、同一套 SDK、同一个 Runtime 登记与只读动作、同一套界面渲染。不为第三方开特权，也不给第三方换机制。

需要如实说明现状（据 [THIRD-PARTY-PLUGINS.md](../../docs/system/THIRD-PARTY-PLUGINS.md)）：第三方安装命令、信任根、第三方 native/app/integration 沙箱形态都还没实现；今天真正的自定义插件是创作台生成的沙箱插件与 `plugin dev` 本地开发。方案按“将来第三方也走同一条 Manifest 路”设计，但批 3 之前不会承诺它能跑 native 形态。

### 5.2 未受信插件的硬规则（声明是数据，不是代码）

1. **校验不执行入口**：安装、`validate`、预览只读 Manifest，沿用 [validate.ts](../../tooling/plugin-cli/src/validate.ts) 头注释的规矩。
2. **有上限**：每插件机器数、每机器状态数/转换数、id 与标签长度有界；超限在解析时拒绝，不崩宿主。
3. **命名空间**：`machine_id` 必须以 `<plugin_id>.` 开头；`platform.` 保留；同一插件内不重复，挡住伪装/遮蔽。
4. **声明不产生权限**：只是元数据；迁移仍是普通写动作，照常受 grant 与动作授权约束。
5. **文案是静态界面文字**：只允许静态字符串或插件 `ui.messages`/`ui.locales` 的静态键，不承载用户内容；平台渲染转义。
6. **签名与摘要覆盖声明**：声明进 Manifest digest，`pack/sign/verify` 与升级校验自然覆盖；同版本改声明被拒。
7. **失败隔离**：畸形声明 = 该插件安装/启动失败（错误码明确），其它插件不受影响。
8. **Home / 项目两半**：同一 Manifest；登记表按安装+范围投影；两半不串。

### 5.3 三种来源的落地位置

| 来源 | 今天 | 本 spec 要补的 |
| --- | --- | --- |
| 内置/自研 | Manifest + registration + Runtime 兑现 | 声明与兑现核对；不变量 + 门禁强制；迁移到 SDK helper |
| 签名第三方（方案，未实现） | 只有 `create/validate/pack/sign/verify` 与 `dev` | 安装预览显示状态/机器；签名摘要覆盖声明；升级规则；明确不做强制；沙箱形态限制写清 |
| 创作台生成（沙箱） | 宿主用 `sandboxPluginManifest` 从设计合同生成 Manifest；[installed.ts](../../apps/local-host/src/plugin-builder/installed.ts) 构造 contribution | 设计合同、`sandboxPluginManifest`、创作台校验、代理提示词、同步形状、回放语料一起支持 `state_machines`；宿主生成的部分由创作台校验负责一致 |
| 本地开发 `plugin dev` | `--allow-unsigned-development` 试跑 | 同一 Manifest 校验；`validate` 输出机器清单；开发态错误可读 |

### 5.4 自定义插件的情况矩阵

| 情况 | 规则 | 兜底 |
| --- | --- | --- |
| 未声明机器 | 允许；无登记条目；界面用插件自绘 | `validate` 提示 |
| 声明了但入口没兑现（有代码声明的形态） | 启动失败，错误指到 machine_id | 契约测试 fixture |
| 声明与兑现不一致（多/少/状态集不同，有代码声明的形态） | 启动失败 | redemption 测试 |
| 生成插件声明与宿主生成结果不一致 | 创作台校验/回放失败；安装时不启动为不合法 | builder 测试 |
| 声明了但代码从不使用 | 平台无法强制；只登记展示 | 文档明说（§5.5） |
| 畸形/超限声明 | 解析拒绝，安装/validate 失败 | `parsePluginManifest` 夹具 |
| 伪装 id / 跨插件冲突 | 前缀不是自己的 `plugin_id` → 拒绝 | parser + 登记测试 |
| 升级改状态集合 | 必须升 machine version；去掉状态还要过 `validateUpgrade` | 升级测试 |
| 降级/回滚 | 旧 Manifest 声明重新登记；旧数据匹配由插件 `validateUpgrade` 负责 | 回滚测试 |
| 卸载 | 登记表是投影，不写平台表 → 无残留 | 无需清理逻辑（刻意） |
| 卸载保留数据后重装新版本 | 声明要覆盖旧状态，否则 `validateUpgrade` 拒绝 | 升级/回滚测试 |
| Home 范围插件 | 同一 Manifest；登记按安装+范围 | 双实例测试 |
| 同一插件多版本并存（不同项目） | 登记按 install_id 分开 | 多版本测试 |
| 沙箱/生成插件 | 声明由宿主生成；创作台校验 | builder/sandbox 测试 |
| 签名第三方包 | 声明进 digest；预览可见；升级同一规则 | 安装预览测试（形态落地后） |
| 本地 `plugin dev` | 同一 validate；开发态改声明给明确错误 | CLI 测试 |
| 插件未启用/未启动 | 仍展示声明，但标未运行；不注入动作 | 登记读动作测试 |
| 市场/安装预览 | 展示机器、状态、家族（本地化） | 预览/市场测试 |
| 权限/隐私 | 声明只含元数据，不含用户内容、密钥、业务值 | 安全不变量测试 |

### 5.5 边界（必须写清）

**第三方插件的代码不能从外部强制。** 平台能保证：声明格式合法、有代码声明的形态下声明与启动兑现一致、登记表展示的是插件自己申报的东西。平台不能保证：插件每次写状态都真的走了它声明的迁移表。对内置与生成插件，我们通过门禁和模板保证；对第三方，靠 `validate` 提示、文档和未来合同阶段收紧。若将来要硬保证，只有「托管式」一条路（平台代校验/代写），按 D1 决定不做，另行立项。

## 6. 文档、Skill、门禁影响面

### 6.1 插件开发 Skill

| 位置 | 改什么 |
| --- | --- |
| [SKILL.md](../../skills/molis-plugin-dev/SKILL.md) | 「读哪份」加「给对象定义状态/状态机」；description 加关键词；开头那句「合同变了，同一任务更新本目录和 PLUGIN-DEVELOPMENT」照旧适用 |
| 新增 `skills/molis-plugin-dev/state-machine.md`（用户 2026-11-08 定） | 独立一章：公开词表/家族、Manifest 声明、SDK 用法、非法迁移、升级规则、创作台生成插件的写法；SKILL.md「读哪份」加一行；创作台 `CHAPTERS` 只挂精简段落 |
| [authoring.md](../../skills/molis-plugin-dev/authoring.md) | SDK 一节加状态机入口并指到新章；「生命周期」扩成「自定义插件的状态与状态机」；validate 输出 |
| [ui.md](../../skills/molis-plugin-dev/ui.md) | 状态只按家族渲染；页面不得复制持久状态机；返回条/连接卡等只做投影 |
| [text-and-appearance.md](../../skills/molis-plugin-dev/text-and-appearance.md) | 状态 label 的 `t()`/locale 写法；家族文案平台给；内置插件第 16 批前不新增 `ui.locales` |
| [host.md](../../skills/molis-plugin-dev/host.md) | 内置插件 registration/Manifest 声明与 Runtime 兑现；平台能力词表位置 |
| [process.md](../../skills/molis-plugin-dev/process.md) | 八步中加「声明状态与迁移」，放在想清楚能力之后、写 Manifest 之前 |
| [generated-code.md](../../skills/molis-plugin-dev/generated-code.md)、generated-design.md | 生成插件必须申报；创作台如何校验；章节字数上限 |
| [examples.md](../../skills/molis-plugin-dev/examples.md)、[examples/plugin-sample](../../examples/plugin-sample/README.md) | 加最小状态机样例（声明 + 存储 + 非法迁移拒绝 + 家族渲染） |
| [capabilities.md](../../skills/molis-plugin-dev/capabilities.md) | 迁移仍是写动作；状态机不是权限 |
| [placement.md](../../skills/molis-plugin-dev/placement.md)、[continuity.md](../../skills/molis-plugin-dev/continuity.md) | 跨模块移动/发布读 owner 的状态，不复制 |

约束：插件创作台挂载同一批章节（[skill.ts](../../apps/local-host/src/plugin-builder/skill.ts) 的 `CHAPTERS`），改 Skill 章节或创作台提示词（[agent-prompts.ts](../../plugins/native/plugin-builder/src/agent-prompts.ts)）要跑 `pnpm studio:replay` 与隔离 Home 的 `pnpm studio:replay smoke`；`skills/` 被安装类测试拷贝比较，Skill 改动要在同批改完、先 `pnpm build` 再跑全量。

### 6.2 平台手册

| 文件 | 改什么 |
| --- | --- |
| [AGENTS.md](../../AGENTS.md) | 硬约束加一条（公开词表只从 contracts 来、声明与兑现不一致不启动、状态机变更走合同变更）；「先读哪里」加一行 |
| [docs/README.md](../../docs/README.md) | 按任务阅读表加「定义状态/状态机」入口 |
| [ARCHITECTURE.md](../../docs/system/ARCHITECTURE.md) | 新增「状态与状态机」一节：公开词汇在 contracts、helper 在 SDK、登记/投影在 Runtime、事实归主人；不设中央状态库 |
| [SSOT-MATRIX.md](../../docs/SSOT-MATRIX.md) | 事实 owner 行：公开状态词汇=contracts；插件机器声明=插件；登记投影=Plugin Runtime；流水账=插件自己的库；内部机器=各自包 |
| [PACKAGE-BOUNDARIES.md](../../docs/system/PACKAGE-BOUNDARIES.md) | 新 subpath 与边界句子 |
| [CONTRACT-CHANGES.md](../../docs/system/CONTRACT-CHANGES.md) | 登记新合同面、阶段一/阶段二、对第三方作者与固定引用的影响 |
| [CALL-CHAINS.md](../../docs/system/CALL-CHAINS.md) | 新增「安装/启动 → 声明校验 → 登记 → 页面/Agent 读」链；在插件生命周期、发布、跨分区链里标状态位置 |
| [SECURITY-INVARIANTS.md](../../docs/system/SECURITY-INVARIANTS.md) + `docs/system/security-invariants/S-*.md` | 新增 3 条语义 ID 不变量：未知状态/非法迁移拒绝；有代码声明的形态下声明与兑现不一致不启动；未受信声明不执行入口、不产生权限、不含业务数据。每条带拒绝测试并进 `test:security`/`test:contracts`/CI |
| [PLUGIN-PLATFORM.md](../../docs/platform/PLUGIN-PLATFORM.md)、[PLUGIN-DEVELOPMENT.md](../../docs/platform/PLUGIN-DEVELOPMENT.md) | Manifest 新块、三种执行形态的规则、升级校验、validate 输出 |
| [UI-PLATFORM.md](../../docs/platform/UI-PLATFORM.md) | 家族渲染规则；收编 `STATE_RING_FAMILIES` 说明 |
| [THIRD-PARTY-PLUGINS.md](../../docs/system/THIRD-PARTY-PLUGINS.md) | 安装方案加状态机声明一节（预览、签名、升级、沙箱、明确不做强制与形态限制） |
| [GLOSSARY.md](../../docs/system/GLOSSARY.md) | 新词：公开状态词汇、状态家族、机器声明、兑现、登记、流水账、machine_id |
| [DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md) | 各层通用要求补一句（平台包从 contracts 取公开词表；插件声明自己的状态；内部机器留在自己包） |
| 各包 README `## 开发要求` | `packages/contracts`、`packages/plugin-sdk`、`packages/plugin-runtime` 更新负责/不负责/不变量/必跑测试；被改造的插件包加不变量与测试 |
| [cli-and-development.md](../../docs/cli-and-development.md) | `molis-work-plugin validate` 输出机器清单 |
| `docs/platform/STATE-VOCABULARY.md`（新，生成） | 由门禁 `--table` 生成：owner、状态、家族、公开/内部、消费者；作者、评审、模型读同一份 |
| [tooling/versions.json](../../tooling/versions.json) + `pnpm versions:generate` | 新合同 subpath 的 `contract.*` 入表；流水账模板的 `format.*` 入表；Manifest schema 是否升版按合同流程定 |

### 6.3 门禁、快照与测试

| 门禁 | 动作 | 从哪批 |
| --- | --- | --- |
| 新 `scripts/gates/state-vocabulary.mjs` | contracts/SDK 里导出的 `*Status/*State/*Phase` 裸字符串联合按文件计数只减；新公开词汇必须走 `defineStateVocabulary`；家族必须合法 | 批 0 report-only，批 2 转强制 |
| 新声明检查（可并入上一条） | Manifest 声明形状/上限/命名空间/终态；有代码声明的形态与兑现一致 | 批 2 |
| [api-snapshot.mjs](../../scripts/gates/api-snapshot.mjs)（已有） | 新 contracts/SDK subpath 的公开面进 `tooling/gates/api/`；`pnpm api:update` | 批 0/1 |
| [action-contract-snapshot.mjs](../../scripts/gates/action-contract-snapshot.mjs)（已有） | `state_machines.list@1`/`get@1` 进 `tooling/gates/actions/`；`pnpm actions:update` | 批 2 |
| error-scan / error-owners（已有） | 新 `state_machines` 错误码家族要加 owner 条目（带理由，表只变严）；码以主人名开头；HTTP 映射只一处 | 批 1 |
| security-invariants（已有） | 每条新不变量有拒绝测试并进 CI 集合；门禁逐行核对测试存在 | 批 2 |
| doc-links / doc-citations（已有） | 新文档不断链；`skills/`、`AGENTS.md`、`CALL-CHAINS.md` 里的路径/命令/动作 id 必须存在 | 每批同 PR |
| package-dev-requirements（已有，`boundary:check`） | 包 README 的负责/依赖/不变量/必跑测试与代码一致 | 每批 |
| table-owners（已有） | 不新增平台业务状态表；登记是投影、流水账在插件自己的库 | 批 3 若做流水账 |
| translations（已有） | 家族与插件状态 label 的英文/词表 | 批 1/2 |
| product-subset（已有） | 新增快用例进 [ci-product-subset.txt](../../tests/ci-product-subset.txt)（契约/安全测试不进） | 批 1/2 |
| page-assets（已有） | 家族渲染复用现有资源，不新增；增长按许可 | 批 2 |
| versions（已有） | 合同 schema/动作/格式版本进 `tooling/versions.json`；`verify-release-versions` 拦绕过 | 批 0/1 |
| `pnpm boundary:check` | SDK 只依赖 contracts；新 subpath 不引私有包 | 批 1 |
| `pnpm test:security` | 新拒绝型测试进集合 | 批 2 |
| `pnpm studio:replay`（已有流程） | 改 Skill 章节/创作台提示词时离线回放 + 隔离 Home 冒烟 | 批 1/2 |
| 新门禁自身的测试 | 新 gate 要有「规则会拒绝」的夹具测试（沿用 health-gate-rules 作业做法） | 批 0 |

## 7. 验收标准

1. **SMP-01** 公开状态词汇单一来源：平台能力对外状态只在 `packages/contracts/src/platform/state-vocabulary.ts` 登记，类型从表派生；全仓导出的 `*Status/*State/*Phase` 裸字符串联合按文件计数不再增加（门禁可报告、可挡合并）。
2. **SMP-02** 基线与范围：审计 §8 的 31 个命名状态类型与 38 个内联联合逐条分类（公开/内部/派生/非状态机）；公开的进词汇表，内部的记入基线并只减；不要求批 0 一次转换完。
3. **SMP-03** 定义自校验：重复状态、未知迁移、终态出边、坏 `machine_id` 在 `defineStateMachine` 或 `molis-work-plugin validate` 定义时被拒绝，错误码稳定可测。
4. **SMP-04** 作者可用：`pnpm build` 后，`plugin-sample` 与 `molis-work plugin create` 模板自带一台状态机；`molis-work-plugin validate` 输出机器清单；作者按 Skill 能跑通。
5. **SMP-05** 非法迁移拒绝：内置样板与生成样板的非法转换被拒绝（错误码/kind 有断言），测试名或注释写出本编号。
6. **SMP-06** 兑现矩阵成立：有代码声明的形态（内置/开发插件）在清单与兑现不一致时启动失败、错误指到 `machine_id`、其它插件不受影响；生成插件的 Manifest 与宿主生成结果不一致时创作台校验/回放失败，不进入安装。
7. **SMP-07** 未受信声明安全：超限、伪装 id、畸形形状被拒绝且不执行插件入口；声明不产生权限、不含业务数据；拒绝测试进 `pnpm test:security`。
8. **SMP-08** 登记来源与只读动作：`state_machines.list@1`/`get@1` 注册进动作目录与快照，provider 为 `system.state-machines`；能从 release artifact 读到停用/未启动插件的声明；查不到时显示未知+原因，不猜；响应只有元数据。
9. **SMP-09** 界面统一：状态显示只按家族渲染，沿用现有 21 类；未映射状态中性显示且不崩溃（修掉现有 `.find(...)!` 崩溃）；不新增第三套状态→颜色映射；contracts 与 SDK 的家族键集合穷尽测试一致；组件板与页面用例覆盖。
10. **SMP-10** 内置先强制：新增状态列/新状态机必须声明；存量状态机与写点计数按文件只减；门禁从报告模式转为挡合并的批次与证据可查。
11. **SMP-11** 生成插件必须申报：创作台设计合同、`sandboxPluginManifest`、校验、离线回放与隔离冒烟通过；生成插件的 Manifest 与宿主构造一致；相关测试覆盖。
12. **SMP-12** 第三方插件可申报：`validate` 与安装预览能看到机器、状态、家族；阶段一/过渡期不申报仍能安装并给提示；声明随签名摘要，同版本改声明被拒；形态限制写清。
13. **SMP-13** 升级/降级/卸载：机器版本规则与去掉状态需要 `validateUpgrade` 的规则生效；登记表是投影，卸载无残留；测试覆盖。
14. **SMP-14** 可选流水账：模板落在插件自己的库，带 CAS/幂等/收据/`beforeEffect`/取消语义；没有新增平台业务状态表；至少一个两段提交场景迁移验证（审计 T3-04/T5-21/T4-01 之一）。
15. **SMP-15** 可选触发引用不阻塞：声明里的 `trigger` 只做登记展示；缺失或当前不可用的触发动作不让插件启动失败（v1 不强制核对动作目录）；后续要强校验另立条目。
16. **SMP-16** 迁移工作流：审计 144 条与 32 条高风险的顺序建议在附录 A；实际进度台账进统一待办清单（[BACKLOG.md](../BACKLOG.md)），计数只减；本 spec 不承担 TODO 台账。
17. **SMP-17** 文档与 Skill 同批：Skill、平台手册、生成的 `docs/platform/STATE-VOCABULARY.md`、`validate` 文档与代码同一个改动；文档门禁通过。
18. **SMP-18** 门禁完整：新门禁有拒绝测试、支持 `--report` 与 `--base` 对比；`pnpm health:check`、`pnpm boundary:check`、`pnpm test:security` 与 api/actions/versions 快照全部通过，并在 PR 里写清对插件作者与调用方的影响。
19. **SMP-19** 分层不乱：contracts 只加数据与类型（不加函数、不放转换表），SDK 只依赖 contracts，平台内部状态不搬进 contracts；`contracts-purity`、`boundary:check` 通过。
20. **SMP-20** 样板：至少一个平台能力（插件生命周期或 Run 相位）用同一 helper 完成迁移与一致性测试；简单插件样板为 Form 收集状态（T3-14）完成声明与家族渲染；两段提交样板为成果固定（T3-04）在批 3 与流水账一起验证。
21. **SMP-21** 第三方最终强制：阶段一/过渡期未申报仍可安装并提示；第三方安装正式对外开放后的阶段二，未申报的第三方插件不能上架/安装（用户 2026-11-08 定），合同、`validate` 与安装预览同批收紧。

## 8. 批次与里程碑

**本 spec 的四批只交付能力与样板；144 条状态机的迁移是独立工作流**（每个插件/每个平台服务一小片，按审计顺序，计数只减；台账进 BACKLOG）。

| 批 | 范围 | 平台代码 | Skill / 手册 | 门禁 / 快照 | 可见结果 |
| --- | --- | --- | --- | --- | --- |
| **0 词汇基线** | 公开词表与 21 类家族；不改行为 | contracts 数据表（21 类照搬）+ 4～6 个高频公开类型派生；SDK 家族映射与穷尽对照 | README/SSOT/ARCHITECTURE/GLOSSARY/CONTRACT-CHANGES | vocabulary gate report-only；`pnpm api:update`；versions | 同一份公开词表可查；无用户可见变化 |
| **1 SDK 与作者工具** | 插件能声明、能校验 | SDK `/state-machine` + 错误家族 + Manifest 解析（可选字段）；plugin-cli validate；`plugin create` 模板 | SKILL/authoring/ui/process/examples（按挂载上限）；PLUGIN-DEVELOPMENT、CLI 文档 | api 快照；error owner；样例 e2e；gate 规则测试；`studio:replay`（若改章节） | `validate` 能看到机器；样例可跑 |
| **2 Runtime 与界面** | 登记、核对、展示 | 兑现矩阵实现；登记投影（definitions + release artifacts）；`system.state-machines` provider；简单内置样板 Form 状态（T3-14）；生成插件合同/Manifest/校验 | host/generated-code/process；创作台章节 + replay；PLUGIN-PLATFORM/CALL-CHAINS/UI-PLATFORM | `actions:update`；3 条不变量 + 测试；vocabulary gate 转强制；生成插件测试 | 安装预览/市场/页面显示状态；不一致启动失败；界面统一家族 |
| **3 升级与流水账** | 升级规则、可选流水账、两段提交样板、第三方强制 | 升级/回滚规则；`defineOperation` 模板；成果固定两段提交（T3-04）；第三方安装预览接入（形态落地后），合同加“阶段二未申报不能上架/安装” | THIRD-PARTY-PLUGINS、continuity/placement、市场文案 | 升级/回滚/流水账测试；第三方预览测试 | 升级不会悄悄丢状态；中断后能看到走到哪一步 |

开工前按[开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)对照：界面先定样（市场/安装预览/组件板在批 2 开始前给用户看实物）；合同变更按 [CONTRACT-CHANGES.md](../../docs/system/CONTRACT-CHANGES.md)；共享核心（contracts + SDK）改动合成集成分支跑一次全量；PR 写清对插件作者、第三方与调用方的影响。

## 9. 合同、版本与兼容

- **新合同面**：contracts `./platform/state-vocabulary`、SDK `./state-machine`、Manifest `state_machines`、动作 `state_machines.list@1`/`get@1`、错误码家族 `state_machines.*`、流水账 `format.*`。按 [CONTRACT-CHANGES.md](../../docs/system/CONTRACT-CHANGES.md) 阶段一在原版本改形状、阶段二（第一个装到开发机之外的版本起）升版本并设过渡期。
- **Manifest 兼容**：字段可选；解析器当前不拒绝未知顶层字段（老宿主会忽略新字段）。第三方安装路径对外之前把字段定下来；一旦对外，按合同流程决定是否升 `manifest.schema`。
- **子路径与描述符**：新 subpath 要有 `ContractDescriptor`（`contract.io.molis.work.platform.state-vocabulary`）、进 [tooling/versions.json](../../tooling/versions.json) 的 `contract.*`、并刷新 api 快照；`scripts/gates/contract-placeholders.mjs` 要求它不是“只有描述符、没人用”的空壳，第一个消费者与它同一个 PR。
- **快照**：`pnpm api:update`、`pnpm actions:update`；PR 里写对固定引用的影响。
- **版本表**：新合同 subpath 的 `contract.*`、流水账模板的 `format.*`、动作版本进 [tooling/versions.json](../../tooling/versions.json)；机器 `version` 是插件自己的数据，不进版本表；Manifest schema 是否升版单独拍板（建议阶段一不升）。
- **第三方最终强制（用户 2026-11-08）**：阶段一/过渡期提示；第三方安装正式对外开放后的阶段二，未申报不能上架/安装。合同、`validate`、安装预览与市场文档同批收紧；这项不改变阶段一的“先提示”。
- **读取不兜底**：未知状态/未知机器版本硬拒绝，不读旧值回退；去掉状态必须带迁移步骤与 `validateUpgrade`。
- **回滚**：每批独立可回滚；合同批次与实现批次分开合，失败不牵动数据。
- **一致性**：迁移每个公开类型/每个内置机时，同一 PR 加一条“表 ↔ 类型 ↔ 实现”一致性测试；避免新旧两份来源长期不一致。

## 10. 侵入性与工作量评估（2026-11-08 复查）

已按代码事实核对，不是估算口径的猜测：

| 改动面 | 事实 | 侵入性 | 说明 |
| --- | --- | --- | --- |
| contracts 公开词表 | 31 个命名类型分布在 **25 个文件**；38 个内联联合分布在 **33 个文件**；`PluginManifest` 被 **177 个非测试文件**引用 | 中（机械） | 类型留在原文件、只改声明来源，避免 import 级联；不要求一次转 38 个内联联合；加数据表不改行为 |
| SDK 新 subpath | SDK 已有多个 subpath，`package.json` 加一条、`index.ts` 加导出、api 快照 | 低 | 纯函数 + 小表；不碰现有行为 |
| Manifest / Runtime 核对 | `PluginContribution` 仅 **11 个非测试文件**引用；`PluginManifest` 面大但字段可选 | 中 | 新字段 + 可选 contribution 字段 + redemption；生成插件由宿主代写，不套代码核对 |
| 登记投影 | `plugin_runtime_release_artifacts` 已存完整 Manifest（`artifact_json.manifest`）；内置定义随宿主构建注册 | 低 | 不新增表；停用/未启动可读；缓存按 install+digest |
| 只读动作 | 平台 system provider 集中在 `project-host.ts` 的一处列表；provider 函数可放 plugin-runtime | 低 | 合同动作 + provider + 一行注册 + 快照 |
| 家族映射 | `STATE_RING_FAMILIES` 仅 3 个文件、`stateRingFamily` 2 处调用；`MwStatusTone` 7 个文件引用 | 低 | 家族→现有视觉的映射；修未知状态的崩溃；不重命名现有视觉 API |
| 23 个内置插件 Manifest | `plugins/native/*/src/manifest.ts` **23 个**（另有 6 个 official-integrations 的 JSON Manifest，多为 integration，可能不需要机器） | 中 | 每插件加一段元数据；是否全部加按迁移工作流走，不是批 2 一次做完 |
| 内置插件迁移 | 审计覆盖 89 隐式 + 55 半显式；每个插件 store/SQL 写点改造量不同 | **大** | 独立工作流；每个机器一个 PR；本 spec 只做 1 个样板 |
| 生成插件链路 | `SandboxPluginContract` 被 **24 个非测试文件**、`BuildManifest` 被 8 个引用；创作台章节/提示词/校验/回放都要动 | 中大 | 必须改设计合同、`sandboxPluginManifest`、builder 校验、Skill 与语料；`pnpm studio:replay` |
| 门禁与测试 | 新 gate + 拒绝测试 + 快照 + 安全不变量 | 中 | 批 0 先 report-only，避免挡在途 PR |
| 文档与 Skill | 约 20 个文档/章节，另有生成文档 | 中 | 与代码同批；文档门禁会拦断链/引用 |

结论：**能力本身（批 0–2）是中等侵入**，主要风险不在 contracts/SDK，而在「23 个内置插件 + 生成插件链路 + 144 条迁移」；所以方案把“能力”和“迁移”分开，且批 2 只做样板、不承诺全量。

## 11. 风险与限制

- **第三方无法硬保证**（§5.5 已明说）：靠 `validate`、文档与合同阶段收紧，不假装平台能拦住。
- **生成插件的一致性靠创作台**：宿主代写 Manifest/contribution，没有运行时“代码兑现”可核对；必须把创作台校验、回放、测试做扎实，否则是另一个双写。
- **登记表的源不存在时**（artifact 缺失/损坏/旧安装记录）：显示未知+原因；不猜、不补；日志留诊断。
- **Manifest 变胖**：只放元数据，转换表在代码；有上限与摘要；老宿主忽略新字段的窗口要在第三方安装对外前关掉。
- **门禁成本**：新 gate 需要基线/只减口径与拒绝测试；初期只报告，避免一上线就挡在途 PR。
- **共享核心改动风险**：contracts + SDK 是共享核心，按集成支线跑一次全量；避开在途大批。
- **家族沿用 21 类**：contracts 与 SDK 各有一份键集合，必须用穷尽测试互相盯住；不新增第三套映射，不改既有视觉 API。
- **老插件兼容**：未声明、未迁移的状态机继续工作；提供提示与分批迁移，不一次性破坏。
- **页面流程仍在页面**：本 spec 只管持久状态词汇，页面内在流程只做投影约束，不集中化。
- **迁移工作流可能长期不收口**：因此计数只减 + BACKLOG 台账 + 每批样板，避免“大爆炸式重写”。

## 12. 依赖与开放问题

依赖：

- 第三方安装路径（[THIRD-PARTY-PLUGINS.md](../../docs/system/THIRD-PARTY-PLUGINS.md)）：Manifest 合同在安装命令/市场开工前定下来；本 spec 批 1 先落解析与 validate，批 3 接安装预览。
- 创作台 Skill 回放与冒烟（`pnpm studio:replay`）：生成插件强制申报的前提；设计合同、`sandboxPluginManifest`、builder 校验与语料同批。
- 审计报告：迁移清单与验收基数（快照，不承诺一次修完）。
- 现有设计系统家族与组件板：界面统一的落点。

用户已确认（2026-11-08，§3）：Skill 单独一章；不新建代码包；第三方最终也强制；`machine_id` 用插件 id 开头；样板为一个简单状态（Form）+ 一个两段提交（成果固定）；家族照搬现有 21 类；**先评审一轮方案再开工**。

评审与开工：

1. 评审本轮 spec（结构、分层、兑现矩阵、侵入性、验收编号、批次拆分）。
2. 评审通过后开批 0：只做公开词表 + 21 类家族 + 只报告的检查，不改行为。
3. 评审里若改动 §3 的决定，先把变更写回本 spec 与 [BACKLOG.md](../BACKLOG.md) 台账，再开代码。

尚未定死的内部技术节奏：Manifest schema 是否在阶段一升版（按 [CONTRACT-CHANGES.md](../../docs/system/CONTRACT-CHANGES.md) 与发布检查单决定）。

## 13. 路线书去处与影响（2026-11-08 已并入路线书）

结论：**不新增独立批次号**（用户 2026-11-08 确认）。按路线书维护规则，把它拆成四个交付行并入既有批次（26-7、27-6、46-2、47-5），迁移作为独立需求进统一待办 `BL-state-machine-migration`，第三方最终强制留在暂缓项。路线书文件已按维护规则更新。这利用了既有依赖链：**26 → 27 → 46 → 47 → 56**（第 46 批本来就依赖 26 和 27，第 47 批本来就依赖 46）。

| 去处 | 加什么 | 为什么在这里 |
| --- | --- | --- |
| **第 26 批第 7 项（26-7）**（M1 发行准备与升级 U4～U6） | 合同与基础：Manifest `state_machines` 字段、SDK 状态机子路径、contracts 公开词表首片、错误码、api／versions 快照；**只读动作的定义与注册不在这批**；**21 类家族不在这里新造**，用 D 轨状态环取值下沉（05② 的前置片）到 `platform/ui.ts` 的那一份（见下方前置） | 26-5 已在改插件升级 U4／U5 与合同过渡；第 46 批已依赖 26；合同必须赶在第 56 批（M1 第一个外部版本）前定死，否则阶段二要升版本、带读取兼容 |
| **第 27 批第 6 项（27-6）**（宿主出口、文档门禁与各包清理） | 新门禁（先只报告、后只减）、生成的 `STATE-VOCABULARY.md`、插件开发 Skill 新章、`AGENTS.md`／手册／术语表／包 README | 27 正是门禁与文档清理批；第 46 批已依赖 27；新检查按仓库习惯先报告再挡合并 |
| **第 46 批第 2 项（46-2）**（正式插件交付的平台前置） | Runtime 兑现与登记投影、`system.state-machines` 只读动作的**定义、注册与动作快照**、平台样板选**插件生命周期**（plugin-runtime；Run 相位属 agent-host，不在这批，留独立片）、生成插件设计合同与校验、3 条安全不变量与拒绝测试 | 46 是把创作台与生成插件搬上普通插件通路；47 紧接着安装预演；状态声明是“安装前看得见”的前置，正好在这一批消费 |
| **第 47 批第 5 项（47-5）**（新插件创作试用路径） | 安装预演与插件目录里的状态展示、交互定样（**D 轨独占文件，由 D 轨落**；市场展示不在本路径） | 47-1／47-3 消费 46 的登记；界面排在 16 的一次切换之后，避开窗口冻结 |
| **统一待办清单（独立工作流）** | 144 条迁移**只挂在第 26 批合入之后**的批次或独立迁移片：33／65／83 Coding（T2-12）、54-1 Schedule（T3-01）、54-3 待办（T3-02、T3-06）、60／47 连接与授权（T4-21、T5-09、T7-02、T7-03）、65 Goals（T1-01、T1-02）、69 固定版（T3-04）、46 插件生命周期（T6-01）；Run 相位（T5-01）与没有合适批次的升级／删除／跨分区（T4-01、T4-03、T5-21）开独立片 | 迁移不是能力前置；按 N22（决定 29）的先例拆独立需求、进度只减、32 条高风险优先；不让它挡其他批次 |
| **暂缓与条件项**（`deferred.md`） | “第三方市场开放后，未申报不能上架／安装”的条件 | 插件市场与审核流水线（BL-058、BL-167）不在 01～89 内；合同先预留，市场开放时启用 |

**影响面：**

- **第 26 批**：增加合同范围与快照排队——Manifest 是最热文件，与 08／20 等已有改动排队；与 26-5 的 U4／U5 用同一份合同快照。若 26 排不下，按决定 31 用“只改合同的小 PR”在 46 前单独合，范围只合同、不写实现。**迁移不能提前到 26 之前的批次**（06、12、13、18、25 等）：那时合同和工具还没有，硬挂会二次返工；它们原本的整理照做，状态机采用放到 26 之后或独立迁移片。
- **第 27 批**：新门禁要接入 `pnpm health:check` 的只减口径并带拒绝测试；`AGENTS.md`／开发流程的文字按先例先给用户看。27 是清理批，新增“插件开发 Skill 新章 + 生成词表文档 + 新门禁”会比原来的清理重；要么压成最小文档+门禁片，要么把 Skill 新章挪到 46 前随一次小改动一起做（需统筹裁）。
- **第 46 批**：与 C1／C3／D／E 协作；改 `project-host.ts` 等热文件按轨道规则 4 一起落；创作台章节与提示词改动要跑 `pnpm studio:replay` 和隔离冒烟；新增只读动作的定义、注册与快照都在这批，避免在 26 就出现“声明了动作但没人注册”的半截快照。46 是 C1 轨道且原本只有一条大交付、全批一个 PR，再加登记／只读会明显变重；**只加最小片**。若 46 排不下，按用户 2026-11-08 定：登记片拆成独立片放到 46 之后，不并进 47。
- **第 47 批**：新增“安装预演显示状态”的界面要求，组件板先定样。
- **第 16／70 批**：界面家族与未知回退排在 16 的一次切换之后；家族沿用现有 21 类、不新增文案，语言按 16 后的格式。
- **D 轨状态环取值下沉（05② 的前置片；硬前置）**：状态环取值下沉仍列为「D 轨还没做」（[共同设计](../shared-sources-and-surfaces/spec.md) §8、§9：`platform/ui.ts` 归 D 轨，SDK 从 contracts 取）。26 的家族部分**必须等这一步合入**（不需要等 05② 的整份呈现合同），并直接使用 `platform/ui.ts` 里的 `StateRingFamily`，不再在 `platform/state-vocabulary.ts` 另抄一份 21 类；如果 D 轨下沉晚于 26，26 只能先做 Manifest/SDK 工具、家族部分顺延成第二个合同小 PR，否则 16 切换后会出现两份词表。这条目前是**未完成的前置**：D 轨已在分支 `claude/d-ring-states-contract` 的提交 `15dfbb3456` 里把 21 类下沉到 `platform/ui.ts`，但 PR 未开、未合入 main；26-7 要等它合入后引用，不另写一份。
- **26 与 26-5（U5）**：U5「合同过渡与保存引用改写」在 M1 当天生效；`state_machines` 必须和 U5 放在同一份 M1 前合同形状里一起定，不能等 26 之后另开一次合同变更——否则它会变成 U5 过渡之后的新增合同面，按阶段二规则处理。
- **门禁已批「先只报告」**：本方案的两个新检查（词表检查、声明检查）用户 2026-11-08 已批「先只报告、不挡合并」，后续是否挡合并另议；`AGENTS.md` 与开发流程文字仍先给用户看。
- **27 的容量与「去热点」目标**：27-5 本身就是「文档和门禁去热点 + 各包清理」，再加一个新门禁、一份生成文档和 Skill 新章，与这批「降热点」的方向相反；要么压到最小（只门禁+生成表，Skill 新章另放），要么单独切一条。需要统筹定。
- **D 轨与 E 轨的文件归属**：`platform/ui.ts`、`packages/plugin-sdk/src/ui*`、design-system 是 D 轨独占；`skills/`、`apps/local-host/src/plugin-builder/skill.ts`、`plugins/native/plugin-builder/src/agent-prompts.ts` 跨 E/统筹。26/46 是 C1 轨道，不能顺手改 D 的文件；这些改动要作为 D/E 的交付行排进去，不能只写在 C1 的批次里。
- **第 56 批**：合同必须在 M1 外部版本前落；晚于它就要按阶段二升版本、带读取兼容，工作量明显更大。26 加合同可能挤压 M1 准备，46 加实现可能推迟阶段 2 出口，这两处要统筹按容量决定先做多少。
- **服务端批**：若把同步状态纳入公开词表，与 SRV-1 的同步合同协调；不作为 01～89 的前置。
- **第三方市场**：插件市场与第三方安装（BL-058、BL-167）在暂缓项里，46／47 只做现有安装预览／插件目录；市场展示等市场开放时沿用同一投影，不在本路径排批。
- **路线书文档**：执行目录加交付行；26／27／46／47 的批次详情补“给人讲清楚／前置／UI／粒度”；`requirements.md` 加映射行；`tracks.md` 的批次轨道对照加行；统一待办加 `BL-state-machine-migration`；`deferred.md` 加第三方条件；认领板 #1743 已加四行（26-7／27-6／46-2／47-5，待认领）。以上是枢纽文件，改动前先查在途 PR 与认领板。

**复查更正一（2026-11-08，批次顺序）：**初版建议把迁移挂到 06-2／12／13／18／25，复查发现这些批次都早于 26，合同和工具那时还没落地，会把同一段工作做两遍；已改成只挂 26 之后的批次或独立迁移片。初版把“市场展示”写进 46／47，但市场本身在暂缓项里，已收窄为“安装预览／插件目录”。

**复查更正二（2026-11-08，第二轮）：**
- 21 类家族的来源不是“照搬 SDK 现有表”这么简单：D 轨还在把状态环取值下沉到 `platform/ui.ts`，[共同设计](../shared-sources-and-surfaces/spec.md)写明这一步「还没做」。所以 26 的家族部分有**硬前置**（先下沉、再引用）；不能各写一份。
- 26-5 的 U5 在 M1 当天生效，`state_machines` 必须进 U5 之前的同一份合同形状，不能事后补。
- 门禁是红线：两个新检查要单独得到用户批准，27 原任务也是「去热点」，不是天然能塞新门禁。
- 46 原本只有一条大交付、且全批一个 PR，再加登记/只读可能超载；平台样板改选插件生命周期（plugin-runtime），Run 相位归 agent-host（C2），留独立片。
- D 轨独占的文件（`platform/ui.ts`、`plugin-sdk/src/ui*`、design-system）和跨 E/统筹的 Skill 文件，不能由 C1 顺手改，必须作为 D/E 交付行排。

该退路没有采用：用户 2026-11-08 已确认按上表并入。若执行中发现 26 排不下，仍按决定 31 用只改合同的小 PR 在 46 前先合，但不改变批次归属。

## 附录 A：迁移顺序与基线

- 基数与证据：审计报告 [implicit-state-machines-2026-11-08.md](../../docs/reviews/implicit-state-machines-2026-11-08.md) 的 144 条（隐式 89 / 半显式 55 / 高风险 32）；§4 按领域清单、§5 跨领域归并、§6 显式对照、§7 派生附录。
- 建议顺序（最终以迁移工作流的分片为准，台账进 BACKLOG）：
  - 平台能力：插件生命周期（T6-01）、Run 相位（T5-01）、Home 升级单元（T4-01）、项目删除收据（T4-03）、连接器授权结果（T4-21）。
  - 插件：成果固定两段提交（T3-04）、Coding 会话状态（T2-12）、Goal 四列正交状态（T1-01）、Schedule 双状态（T3-01）、页面连接卡（T7-02）。
  - 样板（先做小）：Form 收集状态（T3-14）、Shelf 任务状态（T5-31）。
- 每个迁移片必须：把该机器写进声明、让所有写点过 `assert`/CAS、补拒绝测试、更新界面 family、把旧计数降下来；平台内部机器不进 contracts，只在包内加迁移表与测试。

## 附录 B：白话与术语对照

| 白话 | 术语 | 在哪 |
| --- | --- | --- |
| 平台能力对外可见的状态名字和颜色归类 | 公开状态词汇 + 状态家族 | `packages/contracts/src/platform/state-vocabulary.ts` |
| 这个对象有哪些状态、允许怎么变 | 机器声明 | Manifest `state_machines` + SDK `defineStateMachine` |
| 清单说的和代码做的是不是一回事 | 兑现（redemption） | 启动时按执行形态核对（§4.3） |
| 平台登记插件申报的状态 | 登记表 | Plugin Runtime 从定义/发行物投影，只读动作 |
| 中断后知道走到哪一步 | 流水账 | SDK `defineOperation` 模板，数据在插件自己的库 |
| 平台内部的状态（升级账本、恢复日志等） | 内部机器 | 各自包内声明与迁移，不进 contracts |
