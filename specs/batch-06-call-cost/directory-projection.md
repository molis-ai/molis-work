# 06-3 N43／46 投影与归属

状态：N43／46 已实现，预算与拒绝路径已在批次工作树验证（2026-11-10）。见[宿主调用成本需求](spec.md)和[第 06 批交付](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-3)。设计对照第 06 批 `a12e8cd8a` 和本地 `origin/main` `c7873a0f2`，合并基点为 `54a12642c`。实现与改前后实测见下文，批次最终集成验证另记。

## 接回主线已有实现

- #1999 `fad49e455` 收紧 `inDirectoryPass` 签名，拒绝 PromiseLike 和混合返回，并补嵌套/异常回收用例。ActionService 改为从 SDK `/execution` 取工具。同步 pass 已合并每个提供方的状态及无引用的调用者权威检查。带引用、失败及下一轮仍现查。N43 的宿主数组查找仍在。
- #2000 `6df7285c3` 已有 Projects owner 的成员版本、CAS、Catalog 提交后 Runtime 切换、串行 refresh、等待后的成员重读、按安装代恢复及 exact Catalog 写入口。`projectMembershipReach` 共用于成员变化前后比较。版本观察与执行授权读是两个入口。refresh 仍会再读，也没有完成跨请求展示失效。#2002 `2ced02436` 对本片的扫描无改动。#2004 `46a28f456` 的 Catalog 现行结构、回滚和项目 Runtime 启动接线须随最终集成保留。Web Catalog 的 retained connection 仍逐次检查 owner、版本和结构。
- `local-web-actions.ts` 已按 `plugin_install_id` 分开索引项目与 Home 的运行安装，用于同次准备。同 id 可同时存在于两库，安装代和 grants 独立。项目现查走 `SqlitePluginRuntimeRepository.get` 的主键和已准备的语句，#2000 的 refresh 也按安装 id 读并核插件 id/代。Home 授权尾检现读安装，主线区分 Home 未就绪/失效与空结果。N46 的索引只回答内置登记归属。

## N43 最小实现

1. `local-host-availability.ts` 的 `HostAvailability.views` 已把同次 `discover(caller)` 的原始数组传为依赖目录；`inspectActions` 的宽元数据走另一条惰性、受当前 caller 约束的 `discover`。在这一份原始依赖数组上惰性建首行索引，一次实际遍历。按 id/version 取首行，保留目录原顺序。现有 `required_actions` 查到首行后才核 provider，缺少/不可访问与提供方变化分开；绑定函数在现有 usage 可用性之后按同一首行查；推荐的 source/action 按精确 provider 匹配。Registry 拒绝同作用域及全局/项目重叠注册，同一个 caller 目录中同 id/version 只有一行，故精确查找可在首行后核 provider，跨项目数组不能借用这个推论。
2. `DiscoveryPass` 继续属于这一次 `views`。scene 按 id/version 保留首行，enabled usages 保留原绑定顺序。可以先记住同键已选结果，避免一次只用一项却扫描全部场景；待实际绑定夹具显示多键复用再决定是否一次分组。惰性共享从同一数组派生的 `subjectOfferChoices`，保留 choice 声明顺序及 source→action 检查顺序。候选输出、递归路径及第一个可用/首条拒绝优先级沿现实现。每条分支保留自己的 ancestor set，菱形共享与真正的环分别测试，不把 availability verdict 记在引用索引里。
3. **真实重复与必须重读的位置。** `HostAvailability.discover → views` 已共用原数组，`discoverScenes(caller)` 无 ref 时没有动作目录读取。当前 BCC 夹具没有真实绑定，`ActionService.usages` 也没有内部动作发现。有普通绑定时，它的 `known ??= this.discover(context)` 在首次 `await scene.handler.bindings(context)` **之后**，同 caller 仍可能已撤权、停用或换 provider。保留第一次 fresh discovery，从该数组一次建索引供其余普通绑定；严禁把 pre-await 的 `pass.actions` 塞给 usages。保留 stage metadata 的独立窄 caller、重新读 binding revision 和两端注册 token。另有可独立实测的重复，`local-host-scenes.targets` 同一 `Promise.all` 中 `scenes(bound, judgment)` 遇兼容 subject-offers 就做 `host.discoverActions(bound)`，另一个 sibling 无条件做同一带 Host policy 的发现。让这两个同一轮起步的展示分支借同一个局部懒 Promise。保留 kernel targets 等回调后另取目录、配置写 live 复查和 provider/权限尾检。该合并可在配置读取现有入口中计数，不能拿已有 BCC 请求假称已覆盖。其他重复须核出原 caller、模式和读取点后再并。
4. **与 N49 的接口。** N49 在 `ActionService.discoverScenesFor` 仅索引本次自己的 caller 目录，同样先按 `actionKey` 取首行，再由 `actionSceneCompatibilityReason` 检查精确 provider、intent、schema 等。先由 N49 writer 完成局部索引。S2 在确认同一首行语义后，把该索引从 N49 局部提为一个 kernel 共用构造，给普通 usages 和 Host pass 复用。若需要 Host import，只经私有 workspace kernel 入口。无需为 N49 预加公共合同或另一份索引。N49 workflow 候选与 user 场景、宽 inspection 和普通 discovery、pre/post-await、不同 actor/项目/authority 都保持各自的数组。Host `local-host-scenes.ts` 的共同 hunk 等 N49 交接，动作服务的注册、invoke、requireCompatible、bind/runScene 不借展示投影。保留 #1999 的同步签名和 #2000 的装配语义。

## N46 最小实现

由 `plugin-registry.ts` 在 `catalogProblems` 通过后，从同一生成数组各派生一份按 Manifest id 和 project key 的私有 Map。导出只读 lookup 函数给宿主内部调用，`reachEntry` 仍内置优先，`entryFor` 沿 project key。默认 `availableProjectPluginIds` 当前每次为同一数组各建 `byProjectId`、`byManifestId`，可直接复用 owner 两张表。只有 `catalog === PLATFORM_PLUGIN_REGISTRATIONS` 时复用，调用方显式传自定义目录仍按其输入构造。依赖栈、原顺序、隐藏个人插件的最终过滤以及 #2000 的 `projectMembershipReach` 都保留。

| 当前单项读取 | 迁到 owner lookup 后保留的限定 |
| --- | --- |
| `agent-definitions/builtin-agents.sourceOf`、`agent-host-composition` | Manifest id。前者 system instruction 优先、空版本和原 owner 名兜底，后者正在运行的 caller 声明优先。静态声明不替它提供 Agent roles/prompts/skills。 |
| `agent-question-surfaces.builtinOf`、`declared-types.shippedDeclaration` | Manifest id。前者由 `plugin_id ?? provider_id` 取键并核 `provider_id === pluginId`，后者仍优先 Host artifact producer。 |
| `home-plugin-http` 的项目可达、Home stage、dual half | 可达查询在 Manifest id 命中后继续判 `runsInHome`。stage / dual half 两处以 `entry.key` 查 project key 后，仍核同一 Manifest id。保留 shown、stage 声明和 dual-instance 限定。 |
| 其他同形单项读 | `plugin-directory` Manifest 命中后仍比较 publisher signature。`web-project-platform-routes` 启用继续拒个人插件。`side-files-http` 保留 provider fallback 和隐藏判定。 `plugin-page-http`/`web-request` 继续先内置，再查当前 Home 自己的数组。`personal-sync`、`project-plugin-stages` 使用 project key，其余 `native-content-permissions`、`plugin-page-workspaces`、`plugin-scope-entries`、`project-plugin-http`、`web-project-context` 用 Manifest id 并留原后续校验。 |
| 实际枚举与身份判断 | catalog 顺序的 filter/map、派生 required companions、`plugin-project-rows` 以同一 Manifest 对象判断受信定义的逻辑保留。后者即使改到 lookup，也须比较对象 identity，不能改成只认 id。 |

`projectActionAvailability` 的 `state` 接收已解析的 entry。live 对确定的内置登记只调一次 `reachEntry`，传给 await 后的 state。内置值是静态声明，可按是否含 `manifest` 与外装的个人登记形状区分。外装 Home fallback 仍从对应 Home 的当前登记查，保留原有 await 后的第二次动态检查，未知项目 Runtime 和无 plugin id 保留现有放行给 Runtime 自判的分支。展示 policy 每行正常调用同一 resolver。不可把外装 miss、Home 尚未就绪或目录故障记成跨请求结论。真实 Home Runtime 绕过仅限原条件，可信 plugin kind、install id、Home provider、Home caller、内置 runtime 同时成立。缺项目时仍走个人插件规则。执行和写前的 reach、运行态及原 grant 现查。

## 计数和拒绝验收

- **BCC-05 候选实访。** 主台的改前脚本 `/private/tmp/molis06-s2-baseline-1110.test.mjs` 和运行日志 `/private/tmp/molis06-s2-baseline-1110.log` 已量真实隔离 HTTP，构建 `9e8583022`，Node 24.15.0，11 组各三次。简介归属/内置比较为 1421/15477，动作依赖 6 次实际触及 975 行。右侧资料 2855/31227、12 次 1950 行，首样归属/内置比较为 2861/31277。双 Goal 归属/内置比较 252/1848，原项目目录读 70。两种展现成本和旧六项分别报数。复跑用下面的命令。原探针匹配改前 dist 的查找点，改后要继续计每次建索引实际访问的元素，不能用旧谓词归零代替。例如用测试侧 load hook 给该投影数组加数字下标访问计数，或在实际索引构造循环旁观测迭代，分记 lookup 次数、线扫与 build 访问。同口径包括索引初始化；原 `buildRegistryRows` 只覆盖 `reachEntry` 内的内置比较。若要计全目录原始候选，在 `CapabilityRegistry.descriptors` 转发真实过滤谓词，单独记录，再在 before/after 双跑。scene/binding/offer 有数据后分别量，以实际迭代为准。
- **BCC-06 同快照反例。** 复用 BCC-02 测试和 `tooling/gates/call-budget.json`。owner 计实际 `reachEntry` 入口，包括内联调用和 Map 查找。固定 after 上限，先跑正例，再在同一真实 GET 的每个样本对已经参与生产的同一个目录数组额外执行一次完整扫描，丢弃结果。另跑一个确定的已解析内置 id，在同一读上对生产 resolver 真正调用第二遍，丢弃结果。两次变异独立，应各自因行访问数/解析次数超限而红，业务断言、discover 计数和 SQLite 开库保持相同。优先选简介或侧栏来源这类可重放样本；用确定性夹具避免右侧首样波动掩盖单次重复。固定非零正常采样和 fault 确实命中，禁止测试里直接给计数加数。沿已授权的代表请求预算补投影实际访问数，后续只许下降。门禁脚本、静态范围和 CI 接线沿现有约定。
- **BCC-07 依赖/绑定拒绝。** 复用 `action-directory-pass`、`action-service`、`plugin-capability-availability`、`home-action-scenes`、`functions-scene-configuration`。覆盖同 id/version 分属两个项目、Home、不同 audience/allowed_actions、宽 inspection 不能补普通依赖权限、缺项与错 provider、真实 action/scene/binding 环、菱形、混合启停的多个绑定及首个拒绝顺序、精确推荐 source/action 被换。增加一条真实启用 binding、一个兼容 subject-offers 夹具；暂停 bindings/targets 后撤权或替换原注册再释放，确认后续发现确实拒，原绑定 revision 无变。校验 stage metadata 隔离及撤权，沿 S-89 的 FULL17 和 N49 的既有矩阵。
- **BCC-08 归属/执行拒绝。** 复用 `local-web-actions`、`security-invariants-hidden-personal-plugin` 的 RAC-580/581/582 与 PG094-HOME-02，以及 `plugin-catalog-companions` 的自定义 catalog。相邻读取按已有 agent、Home stage、资料来源与拒绝用例定向验证。检查内置/外装个人、嵌入后隐藏、项目缺失/关闭、真实与伪造 Home provider、同安装 id 的 Home/项目不同代、目录故障。发现或命中后撤 scope/grant、停用、重装再调用，返回现行拒绝码且 owner handler/库未写。保留同步 VUX-37/RAC-1130～1134 的通过才共用与 named check。配置读取合并须证两个原 host 查变为一个，而过 await 的 provider/权限拒绝仍命中。

```sh
MOLIS_WORK_CALL_BUDGET_REPORT=1 node scripts/machine-slot.mjs run browser --label '06 S2 before' -- node scripts/run-tests.mjs --jobs 1 /private/tmp/molis06-s2-baseline-1110.test.mjs
```

从隔离的批次检出、使用与基点一致的 dist 运行。最终集成后若 #2000/#2004 改了调用形态，用相同输入重比相关基线并归因。目录计数/拒绝用例走定向测试，最终共享核心按根安排 CI Full。

## N44／BL-943 接点

- 已有 `withReadOnlyPluginDirectory` 按 Home 共用一轮展示常开名单，释放后继承者失效。`withFreshReadOnlyPluginDirectory` 用在 Home 跨项目范围读取。`projectActionAvailability.live` 与 `snapshotForDiscovery` 仍现读，后者可能是 aggregate await 后的撤权检查。已有 ASR-12、MEM-42 用例区分展示、撤权、两 Home、库版本/结构损坏。候选缓存只能接显式展示入口，按 Home、项目和 owner 版本失效。#2000 已证成员 CAS/串行恢复；普通/个人/伴随及常开 ledger/运行态写入的完整失效覆盖仍须逐入口确认。复用常开连接若实施，读取用短快照，保留 owner/文件与版本/结构拒绝。
- 五类 N44 拒绝分别验已读展示后隐藏，撤 always_on 或停用后请求拒绝，发现与调用间撤权拒绝，旧 brief/contextual 引用的真实点击被拒，延迟或失败 refresh 不复活已停用。#2000 的 SPC-C08 有最后一刻权限、关项目、撤 Web session 和恢复已提交选择的定向用例，可复用为现有边界证据。
- BL-943 并发读保留两个 Goal 文档响应，按相同夹具实量目录读取。撤权另用真实等待点。可参照 `typed-effect-authority` 中原 MCP 权限在下游调用等待时撤回、真实 Goals note 库与日志断言，以及 `installed-plugin-execution` PLIB-10 的 Runtime 等待点。在实际 DB client 的下一次 `get/all` 前撤当前安装读权，观测 native statement 未执行。另在真正的 `beforeEffect` 等待中撤原权威或停用，恢复后让生产事务路径拒绝，检查业务表、日志/收据的业务行零写入。原生 DB 读当前走 `pluginDatabaseClient.permit` 的安装活状态与 read grant，写额外过原调用 `assertPluginActionCurrent`。仅撤原调用权且安装读 grant 仍有效的表现须单独实测，不能从写围栏推断读也拒绝。

N44 失效覆盖、BL-943 并发节省与运行中拒绝由对应实施片验证。

## 写手边界

N49 接回后从本批切隔离子树。先实现同一次展示的目录和归属索引，再补真实配置读的重复发现。允许触及 `local-host-availability`、`local-host-scenes`、`local-host-types`、`project-action-availability`、`plugin-registry` 及表中同义单项读取。内核共用索引随 N49 的既有首行语义收敛。验证沿原 HTTP、场景和安全用例，固定计数只影响已登记的代表请求。动作、Manifest 和持久版本沿现行合同。无页面、存储、成果与过程项行为变更。

开工检查沿 [06-3](spec.md)。事实 owner 分别是内核动作目录、Host 内置登记和项目 owner。执行仍经现有动作注册、实时可见性和写前检查。场景只共享同 caller 同读面内的目录，插件、助理、工作流、MCP 继续消费当前授权。保留 #1999 的同步边界及 #2000 的成员语义，复用现有拒绝码。纯索引比跨请求 verdict 缓存易验证，N44 的展示缓存单独证明失效。

## 场景配置的改前实测

2026-11-10 沿 `tests/functions-scene-configuration.test.ts` 的真实 Host 动作入口运行，1 项通过、零跳过。隔离项目在 Home、Inbox 与 Feed 原 owner 上读取、配置、撤回和重新启用绑定。临时加载探针只记录每次 `targets` 内实际的两条 Host 目录调用和 Kernel discover，不替换目录或授权结果。产物与首组扫描基线相同。

Home 的兼容 `subject-offers` 引用有 36 次配置位置读取同时命中两处 Host 发现，推荐筛选与同组调用各一次。内核总发现随既有绑定而为 5 或 7。其余场景没有这条推荐来源，只触发同组的一次 Host 发现。Home 另一次候选不可执行时也只触发一次。N43 要合并前 36 次中的同组两遍，等待后的 Kernel 发现另计。夹具继续断言配置、绑定和版本冲突结果，不能以少读为由减少检查。

探针 `/private/tmp/molis06-s2-targets-baseline.test.mjs`，日志 `/private/tmp/molis06-s2-targets-baseline.log`。这是生产 Host 动作配置路径的数据，HTTP 扫描仍按独立的代表请求表。

## N43／46 实施与定向证据

内核的首行查找随本次目录推进，已经读过的条目按动作 id 和版本保存，遇到所需条目就停。宿主只在一次展示内共用该查找、场景首行、按原顺序分组的启用绑定和从原目录派生的事项选项。普通绑定回调之后，内核用原 caller 现读自己的目录；配置查询的两个 Host 分支共用同一次发现。内置登记通过校验后一次遍历建立两张索引，自定义目录按其输入建立索引。live reach 将一次解析所得的内置登记传到等待后的判定，外装 Home 登记仍再次读取。

**BCC-05。** 在 `a3f449b65` 和候选实现各运行一次相同的 [HTTP 预算用例](../../tests/call-budget.test.ts)，每组取三个隔离请求的中位数。下表的动作与场景行计数包含真实目录返回后所有读到的数组元素，含建索引和保留的枚举。归属数为真实 `reachEntry` 调用。静态登记行包含同请求内的原有枚举；两张内置索引初始化时共访问 23 行，一次完成。

| 请求 | 动作目录行 | 场景目录行 | 归属解析 | 内置登记行 |
| --- | ---: | ---: | ---: | ---: |
| 项目首页 | 176 → 176 | 0 → 0 | 110 → 107 | 6127 → 2714 |
| 项目简介 | 3120 → 2649 | 4 → 4 | 1421 → 1417 | 17156 → 943 |
| 右侧资料状态 | 6240 → 5298 | 6 → 6 | 2855 → 2841 | 35873 → 2622 |
| Contextual | 1040 → 883 | 1 → 1 | 471 → 471 | 5507 → 230 |
| 侧栏文件来源 | 1040 → 883 | 1 → 1 | 471 → 471 | 5639 → 207 |
| 侧栏文件列表和预览（各） | 1040 → 883 | 1 → 1 | 473 → 472 | 5872 → 322 |
| 侧栏缺参（三组各） | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| 同项目两个 Goal 窗格并发 | 352 → 352 | 0 → 0 | 252 → 230 | 12472 → 5842 |

原六项预算数与改前相同，逐项保留。36 次带兼容事项选项的 Home 配置读取各从两次 Host 发现合为一次。其中 33 次 Kernel 总发现从 7 降到 5，3 次从 5 降到 4。36 次各保留一次配置回调之后的现读，有启用绑定的 33 次也各保留一次普通绑定回调之后的现读。其余配置请求的 Host、Kernel 发现数相同。配置用例同时覆盖真实写入、停用、原 revision 冲突和管理授权拒绝。

**BCC-06。** 用 [原预算文件](../../tooling/gates/call-budget.json) 固定新增计数的上限。在真实项目简介 GET 的每个样本中，额外访问同一生产动作目录的 715 行，预算按 `3364 > 2649` 拒绝。独立反例在每个样本将同一个已解析 Goals id 交给生产 resolver 再解析一次，按 `1418 > 1417` 拒绝。两次反例各只有对应计数上升，响应和原六项预算照常通过。两处注入仅在临时探针里。

**BCC-07。** 项目内实际保存的混合启停绑定保持原顺序，首条拒绝和后续可用分支正确，菱形和真实动作／场景循环分别通过与拒绝。宽元数据展示无法补普通绑定的授权。绑定回调等待期间撤掉判断权威或换掉 provider，返回拒绝且原 binding revision 保持。真实配置回调等待期间重新注册场景，返回 `actions.provider_changed`。Home 事项推荐先核精确来源再核执行动作，替换插件的提供方后拒绝原绑定。见[依赖](../../tests/action-dependencies.test.ts)、[项目作用域](../../tests/action-service.test.ts)、[Home 推荐](../../tests/home-action-scenes.test.ts)和[配置](../../tests/functions-scene-configuration.test.ts)用例。

**BCC-08。** 内置隐藏和嵌入过滤、Home 运行态身份、外装 Home 和未知项目 Runtime 的判定沿同一条 reach。真实外装 Home 插件的写入口在项目隐藏后拒绝此前已展示的引用；恢复显示后撤安装 grant，旧引用仍被拒，原存储读到空值。见[个人插件拒绝用例](../../tests/security-invariants-hidden-personal-plugin.test.ts)。

运行记录在 `/private/tmp/molis06-s2-before-report.log`、`/private/tmp/molis06-s2-candidate-report.log`、`/private/tmp/molis06-s2-targets-after.log`、`/private/tmp/molis06-s2-repeat-scan.log` 和 `/private/tmp/molis06-s2-repeat-owner.log`。当前合并基点的整体构建、健康门禁与包边界已通过。最终集成须保留主线的同步目录签名、`/execution` 导入、`projectMembershipReach` 与安装恢复时序，并按同样输入复测预算。
