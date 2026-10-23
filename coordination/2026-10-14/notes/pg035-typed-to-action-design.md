# PG-035 typed 宿主能力改登记成动作：设计短稿（②，2026-10-22，待 ① 审）

代码按 main `be959727d` 核过（#987 只动了 Coding 的 manifest 里与本稿无关的一行）。还没开分支，没写代码。批了再从 `origin/main` 开 `feat/pg035-typed-to-action`。

## 结论

- **范围同意 ① 的倾向。** 这一片交三样：
  - 写法；
  - 一个只收动作的登记口；
  - 一个示范。

  Git 的 4 个留给 ③ 的 G3，writer 的 4 个留给 G4。agent 剩下的 37 个、scheduler 的 4 个记成 ② 自己的后续行，这一片不改。
- **示范选 `agent.draft-text.v1`（`draftText`），不选 `listRuntimes`。**
  - 它和 Git G3 的 4 个登记在同一个文件、用同一种写法（`agent-host-composition.ts` 里直接 `registerCapability`）。处理器的形状也一样：等外部、`beforeEffect`、插件身份从调用上下文来。③ 做 G3 时照抄就行。
  - 它也带出一处真缺口（见 Q5）：插件经它可以花模型调用，却不用声明 `model:invoke`。
- **顺手把已经是动作、却还走旧登记口的 7 条换到新登记口。** 这 7 条在 `project-capabilities.ts`，是平台自己的：
  - 行为不变，动作快照不变；
  - 门禁 −7；
  - 换完后旧口 `register` 只收 typed，一种东西只有一个登记口。

  ① 若要更小，可以拿掉这一项，见「要 ① 定的」第 2 条。
- **不取新 S 号。**
  - 改成动作，就是让调用走现有的动作网关（S-15）。网关只会多查，不会少查。
  - `draftText` 补上的 `model:invoke` 拒绝，就是 S-15 模型服务那段规则的同一条，写进 S-15，不另开一行。
  - S-54 核过是空的：main 最后一条是 S-53，32 个在途 PR 都没碰 `SECURITY-INVARIANTS.md`。① 若要单列，就用它。

## Q1 现存的 typed 宿主能力（按主人）

门禁基线合计 187 处（`tooling/gates/baseline.json:703`，main 与 `d5a3b179a` 相同）。分三类。

### A. 没有 `action` 的描述符：50 个，就是要改的对象

| 主人 | 描述符所在 | 个数 | 登记处 | 调用方 |
| --- | --- | --- | --- | --- |
| `horizontal/agent-host`（错误码主人 `agent`） | `contracts/src/services/agent-host.ts:222` `agentHostCapabilities` | 38（命令 17、查询 19、`wait` 2） | 37 个在 `horizontal/agent-host/src/capability-registration.ts`，经 `agent-host-composition.ts:120` 的适配器；`draftText` 单独在 `agent-host-composition.ts:174` | Coding（manifest 用 `Object.values` 全量 consumes，13 个文件）、Characters（`listRuntimes`、`listActions`）、Schedule、plugin-builder 各 1 |
| `horizontal/scheduler`（主人 `scheduler`） | `contracts/src/services/scheduler.ts:102` `scheduleCapabilities` | 4（`schedule.register/cancel/setEnabled/list`） | `horizontal/scheduler/src/index.ts:525-539`，经 `project-capabilities.ts:75` | **未见插件调用方**：按 contracts 导入和 id 字符串都查过，Schedule 插件用的是自己的 `scheduleActions` |
| Git 的宿主一侧（处理器现在在 `agent-host-composition.ts`，错误码主人 `host`；C12 要挪进 `git-*`，主人 `git`） | `contracts/src/modules/workspace-artifacts.ts` | 4，**G3** | 见下 | Git（`actions.ts:46,64,107,130,139`） |
| 同上（writer） | 同上 `:145-152` | 4，**G4** | `agent-host-composition.ts:230,242,293,297` | Coding（`routes-writers.ts`、`start-round.ts:111`） |

**G3 的 4 个：**

| 描述符 | id | 种类 | 合同行 | 登记行 |
| --- | --- | --- | --- | --- |
| `prepareGitIndexCapability` | `projects.workspace.git.prepare-index.v1` | 命令 | `:104` | `agent-host-composition.ts:133` |
| `prepareGitOperationCapability` | `projects.workspace.git.operation.prepare.v1` | 命令 | `:82` | `:155` |
| `readGitOperationsCapability` | `projects.workspace.git.operations.v1` | 查询 | `:99` | `:180` |
| `readGitResultsCapability` | `projects.workspace.git.results.v1` | 查询 | `:156` | `:199` |

两个 prepare 经 `reviewAuthority(invocation.plugin, …)`（`plugin-callers.ts:57`）认 `review:git-index` / `review:git-operation`。抛的是不带码的 `new Error`（BL-221、C15b）。

### B. 已经是动作、却还经旧口登记：7 条

`project-capabilities.ts:48-70` 的 `host.register(...)`：
- `workspaceReadActions.git` / `.file`；
- `projectsCapabilities.listWorkspaces` / `readWorkspace`；
- `projectSettingsCapabilities` 三条。

它们走 `LocalHost.register` 的 `definition.action` 分支，进了动作目录。门禁看不出区别，照样算 7 处登记。

### C. typed 通路本身的类型引用（基础设施，最后一步整体删）

| 文件 | 门禁计数 |
| --- | --- |
| `contracts/platform/app-host.ts` | 4 |
| `contracts/platform/actions.ts` | 1（`ActionDefinition extends`） |
| `contracts/platform/plugin.ts` | 1 |
| `kernel/src/index.ts` | 5 + 2 |
| `kernel/src/action-service.ts` | 1 |
| `plugin-runtime/src/services.ts` | 2（`createPluginCapabilityClient`） |
| `local-host.ts` | 5 + 1 + 1 |
| `project-host.ts` | 1 + 1（`registerCapability` 包装） |
| `agent-host/capability-registration.ts` | 2 |
| `scheduler/index.ts` | 1 |

**`registerCapability` 的调用**（门禁里的 register-calls 一项）：

| 文件 | 处数 |
| --- | --- |
| `agent-host-composition.ts` | 10（适配器 1 + Git 4 + writer 4 + draftText 1） |
| `capability-registration.ts` | 38 |
| `project-capabilities.ts` | 7 |
| `scheduler/index.ts` | 4 |
| `project-host.ts` | 1 |
| `local-host.ts` | 1 |
| kernel | 3 |

## Q2 统一写法

### 1. 描述符

- 写在主人的 contracts 文件里，类型是 `ActionDefinition<Input, Output>`，带 `action` 元数据，不再 `as HostCapabilityDefinition`。
- `operation` 只能是 `query` 或 `command`。
- 必填：`title`、`description`、`kind`、`scope: "project"`、`audiences`、`permissions`、`subject_kinds`、`input_schema`、`output_schema`。
  - 输入照旧可以是元组：现有动作里 `[workspaceId]` 这种已经有了。
  - 原来在处理器里手查的长度、格式，搬进 schema。处理器里的检查留着作纵深，但抛带码的错。

### 2. id

- **改形态不改名。** 沿用原 `capability_id` 和 `version`。
  - 身份是 id 加版本。改名是另一项合同变化：要动每个 consumes 和测试，又换不来什么。
  - 带 `.v1` 尾巴的旧名，和已经转过来的 `projects.*` 一样留着。
- 新登记的动作照 W2-09 的写法：`<主人>.<对象>.<动词>`，不带 `.vN`，版本只写在 `version`。

### 3. 谁能调

- **`audiences: ["plugin"]` 是默认**，接 git-hybrid-exit-plan 的 U3。只有在 manifest `capabilities.consumes` 里列了它的插件能调，调用时带宿主签发的调用者（S-15）。
- 开放给 `user` / `agent` / `workflow` / `mcp` 不算本写法的一部分：那会生成 MCP 工具、让 Agent 看得到，是信任边界的决定，一条一条单独定。
- **`permissions` 写这次调用的效果真正要的权限：**
  - 发模型请求的 → `model:invoke`；
  - 发起 Git 审查的 → `review:git-index`、`review:git-operation`；
  - 读工作区的 → `workspace:read`。

  调用方在 manifest 里声明。内核按「声明 ∩ 授权」核，不够就 `actions.plugin_permission`。
- **调用方从 `services.capabilities` 换成 `services.actions.invoke(definition, input)`，consumes 不变。**
  - 这一步必须同片做。旧的 typed 客户端经 `LocalHost.invoke` 进动作服务时，调用者的 `permissions: []`（`typed-capability-invocation.ts:49`），带权限的动作一律被拒。
  - 插件自己的动作里依赖它的，写 `required_actions`，照 W2-09。
- 不可撤回的效果（`effect: "irreversible"`）按合同不给插件。G3 的 prepare 只是发起一条要人批准的审查，`effect` 是 `write`；③ 在 G3 里按这一条核一遍。

### 4. `scheduling`

- 等模型或外部服务的，在 **`action.scheduling: "concurrent"`** 声明。
  - 动作通路读的是这一处（`local-host.ts:242,557`）。顶层的 `scheduling` 是 typed 的写法，转过来后删掉，不留两处。
  - 处理器在写之前（或者发出请求之前）调 `invocation.beforeEffect()`。被取消、撤权、停用的调用不写任何业务记录（硬约束）。
- 不等外部的查询不写，默认 serial。

### 5. 登记

- **新增 `LocalHost.registerAction(definition: ActionDefinition<I, O>, handler)`**，以及 `MolisWorkLocalHost` 上同签名的转交。
  - 它就是 `register` 里现有的 `definition.action` 分支原样搬出来：provider 用 `HOST_PROVIDER_ID`（`"platform"`，快照里就是这个名字）。处理器拿到项目运行时，`invocation` 照旧给 `plugin: caller.host_plugin`、`consumer: "plugin"`、`call_id`、`beforeEffect`、`assertAuthorityCurrent`。
  - **这不是新发明，是把现成的写法往下挪一层。** Agent Host 已经这么做：`session-actions.ts:11` 的 `Register<C>` 就是「只收动作」的登记助手，`agent.collaboration.*`、`agent.inputs.*`、`agent.offers.run.v1` 都经它登记成受众 plugin、并发的动作（快照 `host-actions.tsv:8-13`）。只是它最底下仍然落到 `LocalHost.register`。
- **`register` / `registerCapability` 从此只收没有 `action` 的。**
  - 类型上写成 `HostCapabilityDefinition & { action?: never }`，运行时传进动作就抛错。
  - 等 typed 条目清零，这两个口连同 typed 注册表、`LocalHost.invoke` 的 typed 分支、`createPluginCapabilityClient` 一起删。
- **不用 `actionRegistry().registerProvider`。** 宿主文件里每多一行 `registerProvider(` 就违反「宿主不手写 provider」那项门禁（`assembly.mjs`），而且那个口拿不到项目运行时。

### 6. 错误码

- 码的主人是抛它的文件在 `tooling/gates/error-owners.json` 里的主人，用 `defineErrorCodes("<主人>", …)`。不新写 `Error` 子类，不抛不带码的 `Error`。
- 能用平台码的就用平台码：
  - 输入不合 schema 的，由网关给 `actions.invalid_input`；
  - 没有可用模型、执行方没接通的，给 `actions.connection_required`。`model-draft.ts` 已经在用这个码。
- 只属于某个插件宿主一侧的处理器，挪进那个主人的文件。G3 照 C12，挪进 `apps/local-host/src/git-*`，码就是 `git.*`；不留在 `agent-host-composition.ts`，否则码只能是 `host.*`。

### 7. 可信身份

- 人、项目、安装、插件只从调用上下文来：
  - 插件身份用 `invocation.plugin`，即网关核过的 `host_plugin`；
  - 项目用 `executionScope` 给的运行时。
- 输入里不放 `plugin_id`、`project_id`，schema 设 `additionalProperties: false`，多出来的字段就被拒。
- `draftText` 已经是这样（`pluginId: invocation.plugin?.plugin_id`）。
- agent 那 37 个里有几个仍收输入里的 `pluginId`，再拿它与调用者比对：`listActions`、`availableRoles`，以及 `capability-registration.ts:68-76` 的 `pluginFor`。转的时候把这个参数从输入里删掉。没有插件调用者时，这几个现在会照输入里的 `pluginId` 走，这一点记进后续行。

## Q3 这一片做什么

| 做 | 不做（去向） |
| --- | --- |
| 上面的写法，写进 `specs/action-architecture/spec.md` §3 末尾一小节，`skills/molis-plugin-dev` 讲 consumes 的地方加一句「宿主能力也是动作，用 `services.actions` 调」 | Git 4 个（③ 的 G3） |
| `LocalHost.registerAction` 加 `MolisWorkLocalHost` 转交；`register` 只收 typed | writer 4 个（G4） |
| 示范 `draftText`：描述符改成动作（`audiences: ["plugin"]`、`permissions: ["model:invoke"]`、`kind: "operation"`、`action.scheduling: "concurrent"`、schema 取自 `model-draft.ts` 的 80 / 60000 和指令名格式）；登记换成 `registerAction`；`model-draft.ts` 两处不带码的 `Error` 换成平台码 | agent 其余 37 个：记 BL-364，② 自己按主人分批做；两个 `wait` 不能照搬，动作只有 query / command，要先定等待怎样表达 |
| Coding：两处调用（`routes-changesets.ts:163`、`start-round.ts:165`）换成 `services.actions`；manifest 加必需的 `model:invoke` | scheduler 4 个：记 BL-365，先确认没人调就直接删，不转 |
| `project-capabilities.ts` 的 7 条换成 `registerAction` | Characters 的 `listRuntimes`（随 BL-364） |
| 改 `privileges.md` PG-035 行：过时的行号、这一片做了什么、剩余去向 | — |

**和在途 PR 的重叠：**
- Coding 那两行，#936、#988、#991（VUX）也改了同两个文件。只是一行调用，谁后合谁变基。
- 本片动的其他文件没有在途 PR 碰。

## Q4 门禁数字与两份快照

**`typedCapabilities`，187 → 177：**

| 键 | 变化 |
| --- | --- |
| `contracts/src/services/agent-host.ts#type-refs` | 38 → 37 |
| `contracts/src/services/agent-host.ts#without-action` | 38 → 37 |
| `agent-host-composition.ts#register-calls` | 10 → 9 |
| `project-capabilities.ts#register-calls` | 7 → 0 |

- 数字降下来是因为登记口的类型变了，不是动了门禁：
  - 门禁只把 `HostCapabilityDefinition` 和包它的类型别名算作 typed。`ActionDefinition` 是带必填 `action` 的接口，不在其中。
  - 也只把 `register` / `registerCapability` 算作登记口。
- `local-host.ts` 的计数不变：`registerAction` 的参数类型不是 typed，它里面那一行 `registerProvider(` 是从 `register` 搬过来的。宿主的 `registerProvider` 计数仍是 2，合计仍是 20。
- 不做那 7 条，就是 187 → 184。
- G3 做完再 −10：合同里 type-refs、without-action 各 −4，登记 −4，挪进 `git-*` 后不再计。

**动作快照（`actions:update`）：**
- 会碰到。`host-actions.tsv` 是从组装好的宿主现读的，Agent Host 那一半也在里面（第 8-15 行是现有的 agent 动作）。
- 会多出一行 `agent.draft-text.v1@1`：提供方 `platform`，受众 plugin，`concurrent`，权限 `model:invoke`，带 schema 哈希。是新行，不是「同版本变形」。
- 那 7 条里，快照里有 3 行（第 116-118 行）；另外 4 条只在接了 `workspacesFor` 时登记，不进快照。这 3 行应当一字不变，跑 `actions:update` 时顺带核一遍。

**API 快照（`api:update`）：**
- 会碰到 `tooling/gates/api/contracts/services/agent-host.txt`：`draftText` 的类型和新的 schema 常量。
- `LocalHost` 在 app 里，不进快照；SDK 不变。
- PR 里写对调用方的影响：只有 Coding。

**其他门禁：**
- 错误码、巨大单元、兼容标记都不涨。
- `local-host.ts` 的类和 `project-host.ts` 的类各多一个方法：开工先 `--report` 看这两个类离阈值多远。超了就把 `register` 的动作分支整个移走，正好不增方法数。

## Q5 要钉住的拒绝与 S 号

**新写的测试 `tests/host-action-registration.test.ts`**：编号 PG035-01 至 06，经组装好的宿主跑，不用 Agent。

| 编号 | 断言 |
| --- | --- |
| PG035-01 | 插件 consumes 了 `agent.draft-text.v1`，但没持有 `model:invoke`，经 `services.actions` 调用被拒 `actions.plugin_permission`，模型没被请求。**这是今天缺的拒绝**：typed 通路下这次调用会发出去 |
| PG035-02 | 同一插件经旧的 `services.capabilities` 调也被拒（调用者没有权限），没有第二条路 |
| PG035-03 | 以 `user` / `agent` / `mcp` 身份 discover 看不到它，直接 invoke 被拒（受众） |
| PG035-04 | 输入多带 `plugin_id`，或 `material` 超长，被拒 `actions.invalid_input`，没进处理器 |
| PG035-05 | 调用在 `beforeEffect` 前取消或撤权，模型没被请求，也没有业务记录 |
| PG035-06 | `register` 收到带 `action` 的定义时抛错；`registerAction` 登记的那 7 条照旧在目录里。`typed-registry-inventory.test.ts` 不用改：它按有没有 `action` 过滤，`draftText` 自动出列 |

- **S 号：不取。** PG035-01 是 S-15 模型服务那段（「发请求只认 `model:invoke`」）的同一条规则，宿主替插件起草时漏掉了。做法：
  - 在 S-15 那段加一句「宿主替插件起草（`agent.draft-text.v1`）同样只认 `model:invoke`」，证据列加 PG035-01、02；
  - 提交说明照 AGENTS.md 写明：「写测试时发现缺这条拒绝，已补」。
- 若 ① 认为该单列，用 S-54；开 PR 时再核一遍 main 和在途 PR。

**相关用例**（只跑这些，`--jobs 2`，重命令走 heavy.sh）：
- 新文件；
- `typed-registry-inventory`；
- `coding-commit-draft`、`coding-history-summary-http`；
- `files-git-actions`、`workspace-read-one-id`；
- `agent-host-wiring`；
- `action-contract-snapshot`；
- `health-gates-structure`；
- 按 `affected-tests.mjs` 再补。

## 要 ① 定的

1. **Coding 加必需的 `model:invoke`。** 这是在收紧：今天它不声明就能经 `draftText` 花模型调用。但 Coding 的 manifest 注释写着「不声明 `model:invoke`」，加上以后它在自己的并发动作里也能用 `services.model.complete()` 了。
   - 我推荐照做：权限说的是实情，Coding 是随宿主发布的插件，必需权限没有确认弹窗。
   - ① 若认为这碰到 HANDOFF §10「安装同意」，就由 ① 攒进给用户的那一批问，我先把示范换成 `listRuntimes`。那样不带权限，但要先给 agent-host 的登记器加动作分支，示范价值对 G3 小一些。
2. **那 7 条要不要放进本片。** 推荐放：零行为变化，让 `register` 从此只收 typed。不放的话，`register` 得暂时同时收两种。
3. 后续行用 **BL-364（agent 37 个）、BL-365（scheduler 4 个）**：main 上 350–369 已用到 362，#989 占 363。开 PR 时再核一遍。
