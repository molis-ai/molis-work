# Host 能力注册与调用

按明确的 capability 身份注册处理器，使 Host 能发现和调用功能而不把业务逻辑塞进分发器。

包名：`@molis-ai/molis-work-kernel`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

ActionService.registerProvider 注册同一提供方的合同、处理器与消费场景，并返回注销函数；discover 从底层唯一 CapabilityRegistry 派生授权目录。invoke 在实际派发前检查宿主策略（`admit`）、授权、提供方实例、可用性及输入输出合同。

`discover(context, filter?)` 先完成原完整目录的可见性和授权计算，再按公共 `ActionDiscoveryFilter` 精确求交；筛选不跳过原 provider 检查，不改变 allowed_actions。它只收窄返回值，Host 的投影优化另由 Host 在完整依赖目录上执行。回归见 `tests/action-directory-pass.test.ts`。

每次调用有一个调用编号（`call_id`）：同一次入口级操作（一个页面请求、一次工具调用、一轮助理、一条命令）引起的所有调用共用它，只用于诊断，不是身份、不授予权限。内核给没带编号的调用补上：沿用此刻打开的作用域（[call-scope.ts](src/call-scope.ts)）里的编号，没有就新生成一个；处理器拿到的执行上下文里一定有。每次 `invoke` 与 `invokeSync` 恰好结算一次（[action-settlement.ts](src/action-settlement.ts)）：处理器的结果或失败，以及处理器之前的每一种拒绝（缺失、提供方变化、无权、输入不合、限流、宿主策略、同步入口自己的检查），都交给宿主的 `settled` 钩子；拒绝带 `refused: true`，表示处理器根本没跑。

事务内的插件数据接口使用 invokeSync，处理器必须由可信注册方显式声明 `execution: "sync"`，与异步调用复用原记录和校验。它不等待 Promise：异步授权、未声明同步的处理器和意外 Promise 返回均被拒绝。此声明是处理器实现合同，Kernel 不为违反合同的处理器回滚已发生的副作用。Local Host 的同步端口只接收 plugin audience 的私有 SDK 动作；公共动作仍走异步调度，不能借同步端口绕过队列或异步策略。

## 从哪里读代码

公开入口有两个：根入口 [src/index.ts](src/index.ts) 和情境排序的子入口 [src/contextual.ts](src/contextual.ts)（`@molis-ai/molis-work-kernel/contextual`）。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | CapabilityRegistry、错误与处理器类型；包的根入口，转出核心，不转出情境排序 |
| [src/call-scope.ts](src/call-scope.ts) | 核心：调用编号的作用域：生成、沿用、随操作结束关闭；记下「这个编号下留了调用记录」 |
| [src/action-settlement.ts](src/action-settlement.ts) | 核心：一次调用的结算：补编号、描述被调的动作、告诉 `settled` 钩子它怎样结束 |
| [src/action-service.ts](src/action-service.ts) | 核心：`ActionService`（注册、发现、授权、调用、`beforeEffect`、场景） |
| [src/action-scene-execution.ts](src/action-scene-execution.ts) | 场景只读回调与有限的绑定/消费写入控制 |
| [src/action-schema.ts](src/action-schema.ts) | 核心：schema 编译与输入校验 |
| [src/subject-offer-choices.ts](src/subject-offer-choices.ts) | 核心：从目录派生事项动作选项，供判断规则与场景引用的兼容检查用 |
| [src/action-authorship.ts](src/action-authorship.ts) | 核心：`authorship: "session"` 的唯一检查点 |
| [src/contextual.ts](src/contextual.ts) | 情境排序（平台产品服务，纯函数），子入口 `@molis-ai/molis-work-kernel/contextual`，见下一节 |

可对照现有调用方 [apps/local-host/src/local-host.ts](../../apps/local-host/src/local-host.ts) 阅读装配方式。

## 情境排序（平台产品服务）

`src/contextual.ts` 不是内核核心，而是放在内核里的一项平台产品服务（[系统架构 §3](../../docs/system/ARCHITECTURE.md)「平台产品服务」，与记忆、放置、系统搜索同类）：用户在文档里选中一段内容、或手里拿着一个对象时，工作台选区条先给他看什么。它是纯函数：从一次授权目录快照派生候选（片段推荐与事项动作推荐，会写入的一律先确认，不可撤回的不推荐），按结构给规则分，拼出交给判断服务的材料和题面，读回判断的答案，排出前三个、强调、按意图分组的「更多」、「整篇」与助手出面的形式。题面的说明文字（两道题）的默认值也在这里（`DEFAULT_JUDGMENT_WORDING`）：宿主把用户在“设置 › 提示词”里改过的版本传给 `judgmentQuestions`，开头句、按选中范围给的提示句、选项键、助手的五种形式和材料开头的声明仍由这里给出。它不持有任何业务事实，对象事实总向所有者读。

为什么在这里：决定 N-03 选了「平台产品服务」这一类，代码位置不变。内核的核心（上面表格里除 `contextual.ts` 以外的文件）保留目录、分发、可用性、授权与场景兼容。宿主那一半在 `apps/local-host/src/contextual/`，负责 I/O：目录缓存、模型调用、记忆召回、取消、计时与凭据。

它只给工作台自己的选区条用，没有登记成系统动作：HTTP 在 `apps/local-host/src/contextual/contextual-http.ts` 的 `/api/contextual/*`，准备输入与上报信号都经调用者自己的动作，判断只排序、不执行。这是 2026-10-10 的日常取舍，删除条件：助理、工作流、MCP 或插件要用情境推荐时，把它做成只读的系统动作，HTTP 改为调这个动作（[spec 决策记录](../../specs/repository-anti-corruption/spec.md)）。

用的人从子入口取：`import { planContextualLayout } from "@molis-ai/molis-work-kernel/contextual"`；根入口不再转出它，所以只用核心的人加载不到它。边界由 `pnpm health:check` 的规则 K1–K5 守着（`scripts/gates/kernel-contextual.mjs`，见 [门禁说明](../../scripts/gates/README.md)）：核心不依赖情境排序；只有情境排序读合同的 `services/contextual`；它只读 `platform/actions`、`services/contextual`、`node:crypto` 与内核自己的文件；它无副作用、无模块级可变状态；从目录派生候选的代码不点名任何能力 id 或插件。

## 接入与边界

Registry 负责身份、重复注册、生命周期及派发；ActionService 负责声明合同、权限、消费场景和通用输入输出校验。Host 提供可信上下文与实时策略，实际 handler 继续拥有业务校验、事务和状态转换。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-kernel typecheck
pnpm --filter @molis-ai/molis-work-kernel build
```

已有行为示例与回归：[local-host.test.ts](../../tests/local-host.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/local-host.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：能力注册、发现、授予、动作服务调度（`ActionService`）、调用编号与结算、场景兼容与事项动作选项派生，注册时按 SDK 的 `inspectActionDeclarations` 检查动作与场景声明、按 `inspectActionCrossReferences` 检查同一次注册里的交叉引用，以及按动作声明落实时限与取消（计时与取消的工具 `createExecutionLifetime` 和声明检查都来自 `@molis-ai/molis-work-plugin-sdk`，内核不转出）；另外承载平台产品服务「情境排序」（`src/contextual.ts`，纯函数：派生候选、规则打分、判断材料与题面、读回答案、陈列方案）。
- 不负责：业务状态机、提供方实现、界面渲染、模型调用与凭据、记忆召回、缓存、计时与取消（这些在宿主 `apps/local-host/src/contextual/`）、任何插件或 Module 的业务事实。
- 公开入口：`@molis-ai/molis-work-kernel`（`src/index.ts`）与情境排序的子入口 `@molis-ai/molis-work-kernel/contextual`（`src/contextual.ts`），都经 `dist` 导出，不深入 `src/` 导入；合同 `@molis-ai/molis-work-contracts/platform/kernel`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（只用它的执行生命周期和动作声明检查）；第三方依赖见 `package.json`。方向：平台包只依赖 contracts/platform 与更低层平台包，公开发布面（contracts、plugin-sdk）在最下层（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 目录从唯一的 `CapabilityRegistry` 派生，不另存名单。
  - 系统来源读后提交（MEM-SYSTEM-SOURCE-CAPTURE）：`ActionProviderRegistration.sourceRevision` 是 Host system 注册提供的纯同步 owner 读口，只收冻结的 actor/project，不获得执行上下文、不派动作、不写状态、不调用授权回调。读口按精确动作注册 token 固定，分批注册互不覆盖；`project_data_instance_id` 来源未提供读口时拒绝来源捕获。`ActionClient.captureSources([{ context, references }])` 按各组原调用上下文，在已准备好的原注册和精确项目运行实例上同步捕获全部来源；跨项目仍统一三阶段检查，返回的临时否决 guard 不授权、不执行、不后台保留 handler；异步、非法或抛错读数均拒绝。最终顺序为全部授权/可用性/Host 回调、全部 owner 读数、纯注册/取消/Host 生命周期及命令活动尾检，随后由业务 owner 同步 CAS。`retainAuthority(..., { providerCommands: "unchanged" })` 复用同一 owner 读口并在尾检保留原 handler 生命周期；默认 retained/background 不变。owner 读口纯度属于可信 Host 合同，不能用它代替 retention 权限、来源状态或业务版本。LocalHost 转发不得 prepare、打开 Runtime 或创建 entry，关闭或重开不跟随同名注册。定向回归：`tests/action-source-capture.test.ts`、`tests/action-provider-commands.test.ts`。
  - `retainAuthority(refs, { providerCommands: "unchanged" })` 限原 handler 活跃期间的读后提交，可在初读前捕获来源命令活动：已有活动即拒绝，之后同提供方任何命令入场均使捕获永久失效。活动只在现 `execute` 的真实 handler 入场/终态计数，按可信注册的 project/provider 共享；分批注册共用，Home 跨项目共享，项目相互隔离，nested 不按调用编号去重。取消或超时停止等待不代表 handler 已结束；状态在注册与真实活动均归零后释放。最终同步检查先完成全部授权/可用性回调，再纯复核原执行生命周期、来源注册和活动。此选项只能否决，不能授权、断言业务状态或保护外部/后台写入；默认保留授权和后台授权语义不变。回归：`tests/action-provider-commands.test.ts`（MEM-BIND-FENCE-02/03/04）。
  - 同一个 `captureSources` 批次也接可信 `plugin-installation`，只追加原注册、Runtime 当前 grants/state/live、取消/项目实例及已有公开命令 marker 的否决；不为插件造 Host owner reader。Host 不在此同步口调用异步 Catalog policy，也不把 Promise 当通过；原 discover/invoke/validate_authority/beforeDispatch 的异步权限复核保留。系统来源仍完整走原同步 Host 检查与 owner stamp。消费者在异步复核前捕获全部可信来源，最后一次 SDK 等待后的同一 guard 先做全部回调、再 owner 读数、再全部注册/命令纯尾检；同代 Coding 公开归档因此使旧材料失效。它不证明 Catalog 已同步重验，不覆盖没经过 ActionService 真实 command handler 的 raw、脱离 handler 的后台或外部进程写入。
  - 输入与结果按合同校验：查询与判断不合合同报 `actions.output_invalid`；已提交的写动作报 `actions.output_invalid_after_effect`。
  - `action.execution` 明确声明的时限与调用频率由统一执行器落实；费用只作声明，未声明为未知。计数按 actor、项目、安装隔离且跨入口共享，注册退出时释放，不承担持久计费。超时转发 signal 并停止等待，迟到处理器必须经写入 fence，不能承诺抢占同步代码或撤销外部请求。
  - `beforeEffect` 每次复查注册版本、可用性、授权与权限；最后一次异步检查后以可信 `assert_authority_current` 同步核对精确来源/目标及原注册、时限和取消，Promise 尾检被拒绝。场景绑定与成功/失败消费在最后等待后使用同一尾检，同时核对当前场景/启用声明的独立权限；停用绑定仍核原配置权限和来源，不新增目标函数授权。调用结束后不能再产生副作用。 可用性拒绝的可选 `kind` 与码、原因一起抛出；动作派发与 Registry 的 typed 派发使用同一分类。
  - 一次同步目录是一轮（`directory-pass.ts`）：提供方自身状态及经 `rememberInDirectoryPass` 读的设置在轮内各读一次，轮外（含每次调用）现读，读失败不留存，轮内一次写（`forgetInDirectoryPass`）让同一轮后面的读重新读；不能把轮内结果带到调用或下一次目录。目录无外部回调的 metadata 初始过滤对固定 `allowed_actions` 建一次 capability/version/provider 局部索引；带 getter 的调用者仍逐项实时匹配。提供方可用性回调之后、调用、保留授权及来源捕获不使用该索引，撤权和同长度许可替换即时生效；`inspect` 仍展示 metadata 与真实可用性。
  - 场景读回调只能查询；绑定与成功/失败消费获得 `ActionSceneExecutionContext.beforeEffect`，原场景和判断被替换、原调用者撤权或取消、回调结束后都拒绝写入。嵌套调用不能移除只读约束，付费查询也不在只读范围内（`tests/security-invariants-plugin-scenes.test.ts`）。
  - `invokeSync` 只接受显式声明 `execution: "sync"` 的处理器，不等待 Promise，不能借它绕过异步策略。
  - 声明了 `authorship: "session"` 的动作，在派发处拒绝调用上下文带 `runtime_session_missing`（可信的 MCP 适配器给没有稳定 Session 的外部 Runtime 标上）的调用，直接调用和包装动作（首页事项动作、工作流步骤）发起的嵌套调用一样，只在这一处检查（`kernel.runtime_identity_missing`）。
  - 注册时检查同一次注册里的交叉引用（规则在插件 SDK 的 `inspectActionCrossReferences`）：撤销命令、后台任务状态查询、片段与事项选项的目标要在同一次注册里、种类与范围对，被指的字段和位置要在输入输出合同里。检查在 `registerProvider` 原有的一行里调用，不往函数里加行；谁能用目标留到使用时按调用者核对。
  - 调用记录只写谁调了什么、怎样结束，不写输入与结果；业务校验与事务留在处理器里。
  - 调用方可以声明哪些拒绝码是它要的答案（`expectingRefusal`，在 `src/call-scope.ts`；作用域随异步调用传下去）：页面找项目可能没有的插件的区域，「未启用」就是答案，宿主不为这样的拒绝留调用记录行。只对作用域内、调用方自己那一次、处理器之前的、码在声明里的拒绝生效：进入处理器时清空（`startHandler` 经 `insideHandler`，动作的 `execute` 进一次），所以处理器再调的、它派出去还在跑的，被拒了照常记；声明也有终点：它像 `CallScope` 的 `open` 一样，在 `run` 结束（返回、抛出、拒绝）时关闭，所以调用结束后才触发的计时器、流、子进程、插件平台启动里的同一个拒绝照常记；别的拒绝和作用域之外的同一个拒绝也照常记（`tests/action-call-log.test.ts`）。
  - 调用编号只由宿主给：从调用上下文、此刻的作用域或新生成取，不从请求头、工具参数、`_meta`、业务输入或插件交来的字段读。它不是身份，处理器可以记录或返回它，不能凭它做任何决定。作用域随操作结束关闭，之后才触发的回调拿到新编号。入口答复里的编号只在 `recordedCallId()` 有值（这个编号下留了调用记录行）时给，所以人复制到的编号一定查得到（网页：`apps/local-host/src/call-id-response.ts`；MCP：`apps/local-host/src/mcp-call-id.ts`，经网关转发时编号由 MCP 进程写进请求体、常驻宿主在同一个编号下运行，答复体在写了行时带回它）。
  - 一次调用只结算一次：动作的注册表条目只能经 `ActionService.invoke` / `invokeSync` 到达（宿主项目客户端 `LocalHost.invoke` 也走 `invoke`），`execute` 只经 `startHandler` 进入处理器（标记「已开始」、清空免记拒绝的声明），不结算。源码里直接调用 `registry.invoke` / `capabilities.invoke` 的只剩 `ActionService` 自己（R8 删掉了不带 `action` 的 typed 条目与它们的宿主结算）。
  - `admit` 是宿主的异步策略，在解析与授权复查之前跑；`invokeSync` 不跑它（事务里不能等），同步入口自己的检查用第四个参数传入，在结算范围内先跑，它的拒绝同样结算。
  - 核心代码不调用情境排序：核心文件不导入它，也不经入口转手导入它的名字（`pnpm health:check` 的 K1）。根入口不转出它，情境排序走子入口 `@molis-ai/molis-work-kernel/contextual`，所以核心的导入闭包里没有情境排序。它只读 `contracts/platform/actions`、`contracts/services/contextual` 和 `node:crypto`（K2、K3）。
  - 情境排序无 I/O、无计时器、无模块级可变状态，同样的输入得到同样的陈列（K4）。候选只从授权目录来，不点名插件或能力 id（K5）；陈列不删候选；答案里不在候选中的键一律丢掉，模型不能编出动作。会写入的先确认，不可撤回的不推荐。
- query_only 调用在发现和实际派发（含同步）都拒绝 command；传入 assert_authority_current 的权限取当前注册定义，避免发现后权限变化而只读 handler 未调用 beforeEffect 的漏洞。绑定的后代调用保留此收窄。定向验证：`tests/action-query-only.test.ts`、`tests/plugin-action-query.test.ts`。
- 改动后必跑：`node scripts/run-tests.mjs tests/action-service.test.ts tests/action-sync.test.ts tests/action-schema-compiler.test.ts tests/action-dependencies.test.ts tests/action-call-log.test.ts tests/action-concurrency.test.ts tests/execution-lifetime.test.ts tests/action-authorship-dispatch.test.ts tests/contextual-interaction.test.ts tests/contextual-fragment-offers.test.ts tests/contextual-dock-parity.test.ts tests/home-action-scenes.test.ts tests/health-gates-kernel-contextual.test.ts tests/security-invariants-injection.test.ts tests/action-call-id.test.ts tests/action-cross-references.test.ts tests/action-availability-kind.test.ts tests/action-directory-pass.test.ts`
- 授权尾检与消费者改动另跑：`node scripts/run-tests.mjs tests/mcp-effect-authority.test.ts tests/mcp-scene-effect-authority.test.ts tests/action-authority-tail.test.ts tests/plugin-owner-effect-fence.test.ts tests/action-before-effect.test.ts tests/functions-scene-configuration.test.ts tests/functions-effect-boundaries.test.ts`。
- 相关手册：[specs/action-architecture/spec.md](../../specs/action-architecture/spec.md)、[docs/platform/PLUGIN-PLATFORM.md](../../docs/platform/PLUGIN-PLATFORM.md)、[docs/system/ARCHITECTURE.md](../../docs/system/ARCHITECTURE.md)、[docs/horizontal/README.md](../../docs/horizontal/README.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/LOCAL-HOST.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`createExecutionLifetime` 统一进程内取消、时限和同步周期监测。实现在 `@molis-ai/molis-work-plugin-sdk`（`src/execution-lifetime.ts`）：外部作者装的只有 contracts 与 SDK，工具放在这里，SDK 不必依赖私有的 Kernel；内核、宿主、调度服务、Shelf 模块和沙箱都直接从 SDK 取同一份，内核自己不再转出。取消后停止监测，异步等待后调用 `assertActive()` 再进入原事务/版本校验；`dispose()` 在 finally 中释放资源并拒绝迟到回调。它不登记任务、不保存状态、不恢复或重试。Alchemist 用于租约续期，Images 用于持久取消检查及 180 秒时限。


AI来源（Agent、内置助理与外部MCP）的顶层command若声明版本字段，必须提交读到的前提：`expected_version`、`expected_revision`、`expected_revisions`、`expected_updated_at`，以及Functions authoring的`updated_at`。版本表覆盖全部`ids`；缺字段、空表、部分表及Functions的null前提由共同输入校验报`actions.version_required`，其他schema错误仍为`actions.input_invalid`。同一输入只经一次schema校验；助理preflight复用`assertActionCommandInput`。本人页面、非AI工作流、可信插件自调与无版本字段的独立创建沿用合同。嵌套豁免只认dispatcher实际发出的活跃execution上下文，不认ALS继承或JSON标志；原权限、signal、provider和beforeEffect继续检查，handler返回/超时/取消后豁免结束。回归：`tests/action-version-precondition.test.ts`。

后台动作所有者可在处理器仍存活时调用 `ActionExecutionContext.retainAuthority(references)`，保留已有动作的授权和注册实例检查。返回的函数不延长 `beforeEffect`，不授予新能力；后台开始新调用之前应执行它，并在新调用的可信 `validate_authority` 中继续执行。原提供方重新注册、外部撤权或原入口取消均拒绝旧结果。它不持久化：宿主重启后恢复投递需要新的显式用户请求。第二个参数 `{ audience: "workflow" }` 只改看目标时用的受众：接纳和每次复核时，目标见不见得到、可不可用，都按工作流受众看，不按调用者自己的受众；注册实例、原调用的授权与权限、取消照原调用者检查，也不授予任何东西。这是给宿主替原调用者以工作流受众调目标时用的，即插件的动作目录委托（S-43）。验证：`node scripts/run-tests.mjs tests/action-retained-authority.test.ts`。

返回的临时 `RetainedActionAuthority` 同时提供 `assertCurrent()`：新调用者须在 `validate_authority` 里执行原异步guard，并把它的同步断言与自己的断言合成到 `assert_authority_current`，覆盖下游最后一次权限等待；不复用已结束处理器的 `beforeEffect`。同步断言不得返回Promise。真实Host/Pages交错回归见 `tests/assistant-thread-reply.test.ts` 的S-18-102-02/03。

显式受理的后台执行另用 `retainBackgroundAuthority()`：只在活跃处理器内捕获本动作，固定原注册与可见性，并在异步检查后再次同步核权。可信 HTTP/MCP 入口通过 `retain_background_authority` 分开传输与可撤销授权；没有该入口钩子就仍服从原取消。原始入口钩子不交给处理器，绑定客户端同时保留父调用与自己的授权，不能用子动作的权限替换原调用。这个 guard 不延长旧 `beforeEffect`，后台执行控制由 Runtime 建立。验证：`tests/action-background-authority.test.ts`。

`registeredActionMetadata` 只读当前登记的动作声明，沿目录的同一项目与 audience 过滤，先筛后出行，不调用提供方、处理器、依赖或 Host 可用性策略；结果没有 `availability`，不代表执行许可。常规目录把原可见性检查并进同一次筛选，再给每行算可用性。取消操作的诊断可借它命名，实际动作仍经完整调度与最终授权。

登记的描述在注册时复制一次并整个冻结（`CapabilityRegistry.register`）：`descriptors()`、`descriptor()` 与目录各行（`discover`、`inspect` 的 `action`、`provider`）共用这一份，不再每读一次深拷贝一次（Goals 一家的合同就约 350 KB，目录每页、每次调用都读）。读者改不了它，写入直接抛 `TypeError`，提供方事后改自己的对象也不影响登记；要改的读者自己复制，交给第三方运行时的合同同样先复制（MCP 工具、Agent 工具参数）。回归：`tests/action-service.test.ts`。

显式后台受理的额外权限只收窄原 authority：`retainBackgroundAuthority(additionalPermissions?)` 固定原注册与权限，原 handler 的 beforeEffect 不延长；有入口 hook 时由其复核后台授权，无 hook 时保留原取消。父子 bound 身份分别检查。改这条链补跑 `tests/action-background-authority.test.ts`、`tests/security-invariants-alchemist-resumption.test.ts`。
