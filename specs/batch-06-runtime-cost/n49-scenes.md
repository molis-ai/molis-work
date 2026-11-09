# N49 候选场景一次读取

状态：实施前设计，真实 HTTP 基线已取得（2026-11-09），优化代码尚未实施。完成标准沿 [06-4 原验收](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-4)，本稿不降低要求。

基点 `d2dcffa0257f`，产品构建来自 `9e8583022`，两者之间仅文档变化。现行需求见[各包调用成本](spec.md)，N43／46 另见[宿主成本](../batch-06-call-cost/spec.md)。用户已明确本批取消新增升版，本项沿当前合同版本增加方法，不升动作、存储或同步版本。第 27 批 BL-097／BL-131 可直接消费本次投影入口和调用数字。本文只覆盖 Inbox 与 Feed 的两个候选目录读。

## 两条路径与成本

- `GET /projects/:project_id/api/plugins/io.molis.work.inbox/judgment` 经 `web-request.ts:162` 的 `localWebActionContext`、`project-plugin-http.ts:31–68`、`dispatchRuntimePluginRoute`、Inbox manifest 的 `inbox.judgment.read` 和 `inbox/route-handlers.ts:35`。`inbox/plugin.ts:137–140` 用 `services.actions.invoke(..., request.execution)` 转给已注册动作，`actions.ts:203` 调 `scene-runtime.ts:124–140`。`judgmentActions` 是 `services.actions.directory.discover()`。筛 `kind === "judgment"`，逐候选以动作 id、版本、provider 查询 `services.scenes.discoverScenes`。Inbox 保留兼容的 capabilities，从其中筛已发布 Functions 生成 `functions`。绑定本行 `bindings.get()` 和 `scenes.usages()` 共同产生 summary，已暂停、不可用、无权场景各走现行原因。
- `GET /projects/:project_id/api/plugins/io.molis.work.feed/out-rules/judgments` 同一 Runtime HTTP 入口，经 `feed/plugin.ts:195–201`、`out-rule-route-handlers.ts:14`、`feed.rules.judgments@1`，到 `rule-actions.ts:84` 的 `selection.catalog` 和 `feed/scene-runtime.ts:78–88`。`runtime-judgments.ts:54–65,99–103` 把 `ActionClient.discover` 接到 `services.actions.directory.discover()`，把 `ActionSceneClient` 接到 `services.scenes`。Feed 先筛 judgment 和 `feed_item`，并行逐精确引用查 `feed.capture@1`，保留所有候选、顺序、原 title、`compatible`/场景 availability 合成的 `available` 与 reason 优先级，最后独立读取 `usages`。
- 两者候选初查经 S-43 `plugin-action-delegation.ts:25–67` → `MolisWorkLocalHost.actionClient` → `LocalHost.actionClient.discover` → `HostAvailability.discover/views` → `ActionService.discover`。HTTP 原用户的候选初查按 `workflow` 受众，原 plugin caller 仍按 `plugin` 受众。`HostAvailability.views` 里的依赖场景和绑定有自己的每目录惰性 pass，真实绑定可在 `ActionService.usages` 内另外触发一次 `discover`。这是 kernel 成本，计数上和候选初查入口分开。
- 每次场景调用经 `plugin-scene-service.ts:24–82` 的 S-89 guard、`MolisWorkLocalHost.sceneClient` 的 `prepareHomeActions()`、`local-host-scenes.ts:25–59` 的 `prepare`（snapshot/verify/项目 runtime/signal）到 `ActionService.discoverScenes`。这里保留原受众，HTTP 为 `user`，只附 `delegated_by`。`action-service.ts:239–256` 每个带 ref 的查询都 `discover(context)`、扫描并复制场景声明、计算兼容及两种可用状态。若任一场景是兼容的 `subject-offers`，宿主又走 `host.discoverActions` 取带 live policy 的推荐动作。`PluginSceneClient` 最后仅留 `plugin_id` 与 Manifest 场景版本匹配的行。`usages` 走自己的查归属、绑定回调和读取后的可用性处理，绑定数和依赖可导致多个固定成本。

## 合同与最小实现

1. 在现有 `PluginSceneClient` 与 `ActionSceneClient` 加一个同步形状的批量读方法。插件端是 `discoverScenesFor(judgments: readonly ExactActionReference[]): Promise<readonly (readonly ActionSceneView[])[]>`。结果与输入逐下标对应，场景仍按登记顺序，重复 ref 保留位置。内部 client 多收可信 `context`，另可收宿主提供的 `{ plugin_id, scenes: readonly { scene_id, version }[] }` 选择范围，Kernel 同步实现，Host 可异步。`PluginSceneClient` 沿现有 `call("none", ...)` 取得原 caller。先复制精确三元组、沿 `checkedReference` 校验值，要求 provider，空输入经 guard 后直接回 `[]`。从现有 Manifest 声明构造选择范围，入内核时仅收窄可见场景，回到插件边界再用原有 own 过滤。普通 `discoverScenes(judgment?)` 保持原合同。窄化到自身声明很重要，默认 Inbox 目录可有 Home judgment，旧逐候选查可能对后来被滤掉的 Home `subject-offers` 场景额外查一整份目录。
2. Kernel 复用 `sceneDeclarations`、`sceneVisible` 和 `actionSceneCompatibilityReason`。将单项和批量共用的投影收在 `action-service.ts`。批量同步取一次 `this.discover(context)` 和一次可见场景枚举，在目录上按 `actionKey` 建本次索引。Registry 已拒绝同 scope 的同 id/version 重叠，仍保留旧 `find` 取首行和 `actionSceneCompatibilityReason` 校对 provider 的语义。逐 ref 检查精确提供方、judgment kind、固定 intent 的 scene id/version/provider、subject/input/output/schema、推荐来源。场景登记及 callback 状态只在当前同步投影内共用，结果不持有授权或写入口。现有 `inDirectoryPass` 是同步读通道，适合包住同步 kernel 投影或复用其目录，不跨 await，不改 `directory-pass.ts`。单项缺 ref 仍零动作目录扫描。
3. 在 `local-host-scenes.ts` 共用单项和批量的 host policy/recommendation 处理。保留 `prepare`、`sceneAvailability(caller, view)` 对当下 caller/scene view 的检查及旧 reason 优先级。只在兼容 `subject-offers` 行确实需要时共享一次带 policy 的目录 Promise，仍按候选核推荐动作。当前 Inbox 与 Feed 的自身场景无 `subject-offers`，批量路径只需一次 kernel 目录发现。用相同 `prepareHomeActions` 转发，维持 `usages` 独立现读、stage metadata 的降权与 provider 归属校验。`HostAvailability.views` 自身的依赖读和 live 检查照旧。保留 Feed 原有 choice 语义，它取场景 availability，判断动作本身的不可用状态会从 usage 和实际 invoke 显示。测试里可同时让场景 policy 和已有绑定的判断连接断开，证明两类 reason。
4. Inbox 和 Feed 仅在这两个候选循环构造 exact refs 后一次调用。Inbox 用相同的 scene id/compatible 条件过滤原候选，Feed 用批量结果里的本场景行生成原选择和原因。Feed `runtime-judgments.ts` 在现有 `sceneClientOf` 上转发。动作/schema/Manifest/HTTP 形状/MCP/存储版本不涉及修改。公开 TS 快照由 `pnpm api:update` 生成，直接形状在 contracts `platform/actions`、`platform/plugin-scenes`、`platform/plugin`。SDK 的 `ActionSceneClient` 快照是指向 contracts 的转出行，类型形状在 contracts；SDK 与平台现有 `services.scenes` 继续引用合同，无需加 SDK 运行时代码。生成差异以实际结果为准。动作合同快照用现有校验确认。批内先合同与公开快照、再 kernel/host、最后 owner 与证据。全批最终头按现行 Goal 做 C 合审与根安排 CI Full。

## 授权与拒绝验收

- 候选 workflow 目录和 scene 原 user 目录始终是两个独立权限上下文。禁止用前者的 `ActionView` / caller 充当后者的权限或省掉后者可见性核对。按 S-89 保留 `holding` 对安装 active、`scenes:use`、generation/grants 的前后校验，保留 `currentPluginAction`／`inPluginInstance`、同项目和原 `assert_authority_current`。`prepare`/guard 随原 signal；若在待 host policy 时撤权、停止、替换安装或取消，返回前拒绝，调用方拿不到部分结果。其他 owner 的场景及未声明版本不可返回。空批也不能借用服务或脱离原动作调用。
- 固定 provider 不自动替换。同 id/version 换 provider，兼容结果仍是现有 provider 变化原因。仅 workflow 可见、用户场景不可见的 ref 用原场景逻辑得出不可访问，反向也不会凭 scene 扩张 owner 的候选初查。S-89 单项/批量对比覆盖 exact ref、错 provider/版本、缺少权限、错 intent、schema、兼容但场景不可用及相同顺序。现有 `tests/security-invariants-plugin-scene-client.test.ts` RAC-833 已有 awaited seam，在批量真实返回后、`call` 后检前暂停，分别撤原调用权、取消，验实际错误且不回结果；沿 RAC-834/839 验借用和他方 provider。
- 显示后另一个请求的配置、预览、执行重新走原 live 链。Inbox 写绑定使用现 `scenes.bind`，宿主 `check` 与 `checkActionAvailability`，内核 `requireCompatible`、注册 token、权限与写前复查。Feed `selection.validate` 仍走单项 live，`preview` 还走 S-43 `directory.invoke` 固定提供方、检查权限和 schema。生产场景执行 `runScene` 保留 `beforeConsume`、binding revision、source/target token、权限、`beforeEffect`。使用已经从真实 GET 展示的 ref，在下一次操作前撤权限、撤注册或换 provider，断言旧 ref 实际被拒、绑定 revision/规则列表/判断账无本次写入。测试撤目标只选原来能拒绝的权限/provider 断点，单纯关闭判断连接时 Feed 目录的 choice 仍取场景状态，绑定 usage 显示不可用，实际预览拒绝断开的判断动作。不要把这一点混作兼容过滤回归。

## 真实 HTTP 基线和回归

基线脚本 `/private/tmp/molis06-n49-baseline.test.mjs`。在 `/Users/yijun/code/molis-work/.claude/worktrees/codex-batch-06` 用 Node 24.15.0 与现有 dist 执行。

```sh
node scripts/machine-slot.mjs run browser --label '06 N49 baseline' -- node scripts/run-tests.mjs --jobs 1 /private/tmp/molis06-n49-baseline.test.mjs
```

`openTestHome` 以 loopback 临时端口与隔离 Home 跑产品 server。Feed 启用会带 Inbox。真实路由创建 Feed Source、写一条带精确引用的捕捉规则及 Inbox 绑定。每项 GET 在计数窗内完整读取 HTTP JSON，固定 Date、停周期工作、推进时钟，取各项三次样本中位数。`inspectPreparedActionMetadata` 的 test-only fixture 仅在测量时收窄判断候选的精确 allowlist，真实 Web 权限构造、调用和视图不替换。Inbox 1→3 候选，Feed 1→2 候选，后者额外的测试登记是 `feed_item` judgment、输出合同不匹配。断连样本切换临时 Functions 配置，另通过现有 `sceneAvailability` 测试端口为 Feed 自己的场景返回确定原因。报告须标记为受控规模，不把 1/3 或 1/2 当默认目录规模。脚本用于同夹具 before/after，不把依赖新方法存在与否的 benchmark 分支提交成回归断言。

| 计数点 | 基点应观察 | 实现后固定断言 |
| --- | --- | --- |
| `MolisWorkLocalHost.actionClient().discover` 中原 user 委托 workflow 的 owner 初查及实际候选数 | 初查 1，候选分别为 1/3 与 1/2 | 初查 1，候选数与顺序照旧 |
| `MolisWorkLocalHost.sceneClient` 中 owner 的带 ref 场景请求数、refs 总数和 caller audience | N 次，N 个精确 ref，user | 1 次，N 个精确 ref，user |
| `ActionService.discover`、`sceneDeclarations` 实际入口和枚举行数，分 audience/来源 | 每候选加一次 user 全量发现与场景枚举，可能另有 subject-offers 与依赖读取 | 单候选和多候选的实际全量发现/枚举次数相同，候选检查数仍随 N 增。不能只断言 sceneClient 批量入口数 |
| owner 的 `sceneClient.usages`、`ActionService.usages` 和原生 `StatementSync.get/all` 对三张绑定表实际执行次数 | owner `usages` 一次，内部依赖读另计，绑定表执行数随相同绑定 fixture 固定 | 同绑定情况下每插件读取数固定，启用/断开结果依然从原数据读。只记录 SQL 归类和数字，勿记录参数或路径 |

旧探针把同 audience 的内部依赖读误算作第二次 owner 初查。修正版在真正 action client 边界计初查，kernel 探针保留额外读与来源，并在断言前打印计数。功能断言保留 Inbox `functions`、精确 capability/绑定/summary，Feed `choices`、精确引用、不可用原因、真实 usage 和绑定 revision。为正式回归固定优化后总量及单/多相等，增加一个受控重复全量调用证明会失败。可加默认 Home judgment 到混合场景用例，钉住未声明的 `subject-offers` 不会引起一次额外全量发现。短夹具可并入现有测试或单列 BRC-05 文件，按包 README 与项目产品子集规则选测试。定向沿 `feed-inbox-scene-runtime`、`inbox-action-scenes`、`functions-scene-configuration`、`security-invariants-plugin-scene-client` 和两条 owner HTTP 用例。

## 允许范围与在途差异

- 写入范围为现有 BRC-05 spec、S-89 文档列表及对应拒绝用例、`packages/contracts/src/platform/{actions,plugin-scenes}.ts`、`packages/kernel/src/action-service.ts`、`apps/local-host/src/{local-host-scenes,plugin-scene-service,project-host}.ts`、`plugins/native/{inbox,feed}/src/scene-runtime.ts` 和 Feed `runtime-judgments.ts`、定向测试/夹具及生成 API 快照。`ActionService` 与 `MolisWorkLocalHost` 已有 cohesive-unit 记录，类尺寸变化时用门禁实测更新对应精确 size。无须改项目启用监督器、路由、`plugin-runtime`、授权规则或项目绑定表。若内部 client 保持原类型并以额外 port 传批量能力，会增加多个组合入口和夹具，故本稿选用现有两个 scene client 的窄扩展。
- GitHub #1999 `f25c375149faf7143debffa5f90583a3bfd1ddb6` 的 `directory-pass.ts` 实际 hunk 为拒绝 PromiseLike 的 TS 签名，`action-service.ts` hunk 是三个 SDK helper import 转到 `/execution`。无批量入口。N49 留下该签名与 import，改动作服务的场景投影处。两边均可触及生成的 `platform/plugin` 和 SDK index 快照，集成时统一重生。 [#1999](https://github.com/molis-ai/molis-work/pull/1999)
- GitHub #2000 已由指定 `d918375958d1cbc477e7bdeab89e4d38e934da96` 前进到 `fc8ccc2a3df854b636c548e9c39713b66e67249d`。已看固定点的本地 hunk 和当前头 GitHub 文件 patch。`actions.ts` 仅在 ~105 加 `HomePageSubject`，与 ~512 的 `ActionSceneClient` 分开。`project-host.ts` 的 constructor/成员刷新改动、`project-plugins.ts` 的 refresh queue、`web-request.ts` 的 membership revision 页面改动均未覆盖 `sceneClient()` ~402 转发或两个候选循环。Feed/Inbox HTTP tests 的相邻改动是项目插件安装夹具，不改该响应。保留 #2000 刷新语义与既有 Host 入口，最终重生同名 API 快照。 [#2000](https://github.com/molis-ai/molis-work/pull/2000)

顺序为先保存同一测试输入和 before 数字，再让合同台交接最小 hunk，同树按 kernel → Host → 两 owner 串行接线。对照最终 head 跑真实 HTTP、拒绝用例、快照和约定验证。工作范围内未发现需要新增产品决定的证据。

## 已取得的改前数字

主台以 Node 24.15.0、独立机器测试槽和 `--jobs 1` 运行同一探针，1/1 通过、零跳过，六种情形各三次读数一致。真实 loopback HTTP、Runtime、Kernel 和 SQLite 均执行；判断候选 allowlist 与不可用场景是受控测试配置，提供方禁止实际模型调用。首轮将 workflow 内部依赖发现误计为第二次候选入口而失败，修正观测位置后仍完整保留所有内核发现，不放宽产品行为或预算。

| 情形 | 候选数 | owner 初查 / scene 请求 / usages | 内核 discover（workflow/user） | 场景枚举（workflow/user；行数） | 绑定 SQL（Inbox/Feed/Home） |
| --- | ---: | --- | --- | --- | --- |
| Inbox 单项 | 1 | 1 / 1 / 1 | 2 / 4 | 1 / 5；18 | 4 / 3 / 0 |
| Inbox 多项 | 3 | 1 / 3 / 1 | 2 / 6 | 1 / 7；24 | 4 / 3 / 0 |
| Feed 单项 | 1 | 1 / 1 / 1 | 2 / 4 | 1 / 5；18 | 3 / 3 / 0 |
| Feed 多项，含不兼容 | 2 | 1 / 2 / 1 | 2 / 5 | 1 / 6；21 | 3 / 3 / 0 |
| Inbox 断连 | 3 | 1 / 3 / 1 | 2 / 6 | 1 / 7；24 | 4 / 3 / 0 |
| Feed 断连与不可用 | 2 | 1 / 2 / 1 | 2 / 5 | 1 / 6；21 | 3 / 3 / 0 |

每个场景的 Kernel usages 都是 workflow 1/user 2；它们是已有绑定及其依赖的固定工作，不能当作逐候选重复而删掉。所有样本验证实际绑定、候选响应及不可用原因。优化后的真实请求数字、运行中撤权与固定预算反例尚未取得；N49 不记完成。临时日志为 `/private/tmp/molis06-n49-baseline-r2.log`，首轮日志保留在同目录 `molis06-n49-baseline-first.log`。未来正式回归固定优化后预算，不能通过是否存在新方法来切换期望。
