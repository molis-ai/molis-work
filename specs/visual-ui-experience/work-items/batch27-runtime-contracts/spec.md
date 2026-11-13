# 第 27 批插件权限、Goals 委托与停止期限

状态：三项已在第 27 批实现（2026-11-11，各节开头的「实现记录」）；用户已定权限接法与停止语义（2026-11-09）。基点 `bfccbeb66`。本人验收与整批全量未做。

## 交付边界

[27-4](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-4) 的目标仍是交付、验收原有余项。本人能在「插件」里收回、恢复沙箱插件的一项权限，安装和数据都保留。本人直接从 Feed 升格时，Goals 确认来源和输入，其余调用者只能提议。插件的清理钩子失去响应时，宿主在规定时间内结束对它的等待，完成自身清理，停用、重启、卸载和关闭能继续。最终要在隔离 Home 走实际入口，带持久记录和拒绝证据。权限界面复用已有开关和确认，按第 27 批的界面要求核实成品和本人验收。工程、实操、本人验收分别记录。

三项都属于横向能力和底层安全／可靠性，BL-701 还涉及工作台体验，BL-803 涉及 Feed／Goals 产品线。基点已有 02、07 提供的动作、安装及测试入口，日志衔接 [26-4](../../../post-anticorruption-roadmap/reference/batches/26.md#batch-26-item-4)。范围取自 BL-701（已实现，待办已删）、BL-803（已实现，待办已删）、BL-367（已实现，待办已删） 和 [需求清单](../../../post-anticorruption-roadmap/reference/requirements.md#section-3-8)。旧生成器的读取清理随 [47](../../../post-anticorruption-roadmap/reference/batches/47.md)，本机统计随 [75](../../../post-anticorruption-roadmap/reference/batches/75.md)，可选上报随 [SRV-8](../../../post-anticorruption-roadmap/reference/batches/srv-8.md)。

## BL-701 沙箱插件的可选权限

**实现记录（2026-11-11，第 27 批，按用户定的 A）**：

- **SDK**（`packages/plugin-sdk/src/sandbox-manifest.ts`）：一张 `PROJECTED_ROWS` 表把 `networkDomains`、`secretRefs`、`capabilities`、`background`、`connections` 映射到 `network:request`、`secret:use`、`capabilities:call`、`background:start`、`connections:use`。`sandboxProjectedPermissions(manifest, effects)` 给签名 Manifest 里还没有的行（app 的 Manifest 已有 `connections:use`，所以只有集成会投影它），`sandboxOperationSwitches(effects)` 给一个操作要的开关，`sandboxRequestedPermissions` 把投影的名字算进「请求了」。签名 Manifest、`sandboxDerivedPermissions` 与包的严格重建都没动，摘要不变。四个新权限名在 `platform/plugin-trust` 有平台释义。
- **Runtime**（`packages/plugin-runtime/src/index.ts`）：可选端口 `permissionDeclarations(definition)`，由 Home（`home-plugins.ts`）与项目（`plugin-platform.ts`）在构造时接入；`grantCeiling` 把它的行附在 Manifest 后面，用在安装、同版本兼容、`grant`、`regrant` 与版本切换的上限里。升级时，原定义投影过、目标 Manifest 没有的已持授权先去掉再比，所以目标不再请求的开关被丢下，而不是让升级被拒。
- **宿主**（新文件 `apps/local-host/src/installed-permission-projection.ts`）：投影按「插件、发布者签名、版本」记在宿主建沙箱定义时（`installed-plugin-definition.ts`、`sandbox-integration.ts`），只对 `sandbox` 定义与记录给出，插件或请求都提交不了。`grantedEffects` 在建 runner 之前把开关关着的类别从 effects 里拿掉，broker 那一道门因此直接没有这类 effects；`assertOperationGranted` 在 `studio.call` 和后台运行里、插件代码之前核这次操作的开关，拒绝是 `actions.forbidden`（路由 403，`{ error, code }`，暴露的动作处理器转成 `ActionError`）；`operationGrantAvailability` 让动作目录把缺开关的操作标为不可用（`actions.plugin_permission`），曝光一侧每次现读当前记录，开关变了不用等重新登记。签名集成在交出来源连接前核 `connections:use`。列表与安装预览用同一份投影（`plugin-installed-view.ts`、`plugin-install-service.ts`）。
- **和设计稿不同的三处**：① 预检只核新投影的开关，Manifest 原有的行照旧由宿主服务逐次检查，全核会改掉 RAC2865 一类「Manifest 权限关着时由服务在插件里面拒绝」的既有语义；② 投影按发行物身份记，而不是挂在定义对象上，因为 PLIB-10 那条路会把定义展开复制一份，挂在对象上的投影会丢；③ `connections` 不进 broker 的过滤：app 的 Manifest 本来就有 `connections:use` 行，由连接服务逐次查，集成在交出连接处查，过滤掉反而改了 RAC2868 的拒绝码。设置页没有改：`network:request`、`secret:use` 已落在页面原有的宽权限确认里（`/^(network|secret):/`），确认文字是行上平台给的释义；`capabilities:call`、`background:start` 单击生效。
- **预期变化**：新装与已有安装里这四类开关都是关的，已经跑着的联网、目录能力、后台和来源拉取会停在开关处，要本人在「插件」里打开。为此改了一批既有用例的夹具，都是在安装后打开它要用的开关（`fixture.switchOn`、`runtime.regrant` 或伪造上下文的 `grants`），没有删或放宽断言。
- **证明**：`tests/security-invariants-sandbox-permission-switches.test.ts`。B27-PERM-01：真实签名 Home 包，列表里默认关、未请求的不出现；关着时目录动作不可用且插件代码没跑，不需要开关的操作照常；经真实设置 HTTP 开、关、再开；安装 ID、摘要、签名、版本与数据不变；未请求的开关被拒；重启后仍关，重开后可用。B27-PERM-02 两例：插件自己的 `/call` 403 且代码没跑；网站开、密钥关时带密钥的操作被拒、纯网站的照常，只开密钥也到不了网站。B27-PERM-03：SDK 的投影与按操作的开关。B27-PERM-04：Runtime 上限认投影、没投影的被拒、升级丢掉不再请求的开关。集成的来源连接拒绝在 `tests/sandbox-integration.test.ts`。后台目标与签名资源沿用 `tests/security-invariants-sandbox-signed-background.test.ts`、`tests/security-invariants-sandbox-signed-resources.test.ts`，打开开关后原断言不变。
- **没有另写用例的**：项目里的 app 与创作台生成的发行物走同一个 `installed.ts` 与同一个投影（`tests/agent-built-plugins-workflow.test.ts` SCOPE-1 现在要先开 `capabilities:call`）；B27-PERM-03 的「调用途中关权」沿用 S-94 的 RAC-942 与 RAC2874，关开关仍是同一个 `regrant` 撤掉原激活；真实浏览器里的宽权限确认沿用 RAC-959；计划派发与签名同发布者升级的真包路径没有单独的新用例。


### 基点和调用链

原登记在 [PG-002 §7](../../../archive/repository-anti-corruption/slices/pg002-plugin-permission-settings.md#7-裁定统筹2026-10-26) 记的是当时仅有 `storage:private` 的清单。当前 [SDK 派生](../../../../packages/plugin-sdk/src/sandbox-manifest.ts) 已区分清单声明、版本实际请求、单个操作要求。签名 app 在 [readSandboxPackage](../../../../apps/local-host/src/sandbox-package.ts) 由合同重建清单并严格比对包带的内容。签名资源的 RAC2865、后台操作的 RAC2872／2874 已有真实包测试覆盖部分开关、重启及拒绝。例子中可选权限安装后仍需在设置里打开，恢复从 `record.grants` 读，不能把安装时勾选「同意」当作给全部可选 grant。基点的这些证据可核回。 [签名资源测试](../../../../tests/security-invariants-sandbox-signed-resources.test.ts)、[签名后台测试](../../../../tests/security-invariants-sandbox-signed-background.test.ts)

- **安装与恢复。** 验签及预览／确认进 `PluginInstallService` → `SandboxPackageStore` → Home 的 `openHomeInstalledPlugins` 或项目的 `ensureInstalledPlugins` → `installedLifecycle`。创作台已发布工件经同一 `installedLifecycle`。首次安装仅给清单必需项，批准的精确 effects 写入该范围的既有 `APPROVED_KEY` 记录，版本切换经 `covered` 或本人重新确认，恢复无批准则拒绝。Runtime 独占安装身份、启停和 `PluginInstanceRecord.grants`，Home 与项目各读本范围的库。发布者信任由现有账本核查。 [安装服务](../../../../apps/local-host/src/plugin-install-service.ts)、[安装生命周期](../../../../apps/local-host/src/installed-plugin-lifecycle.ts)、[版本切换](../../../../apps/local-host/src/installed-plugin-version.ts)
- **显示与设置。** 项目 `POST /api/plugin-trust/permissions/set`（项目路由前缀下）→ `plugins.permissions.set@1`。Home `POST /api/settings/plugin-permissions/set` → `plugins.home.permissions.set@1`。各自列表 `plugins.installed.list@1`、`plugins.home.installed.list@1` 投影相应安装。S-94 的设置入口凭据、本人受众、Origin 及传输凭据经过现有检查，项目、本人由 Host 取。setter 比对安装世代、版本、摘要及发布者，再由所属 Runtime 持安装锁 `regrant`。收窄先撤当前激活，写新 grant 再停／起；放宽在旧激活收尾后写；同值重放不重启。页面已有 `actions:delegate`、`network:*`、`secret:*`、`model:invoke` 的开权限确认。 [S-94](../../../../docs/system/security-invariants/S-94.md)、[设置](../../../../apps/workbench/src/settings-plugins.ts)、[作用域端口](../../../../apps/local-host/src/project-plugin-ports.ts)、[regrant](../../../../packages/plugin-runtime/src/regrant.ts)
- **执行。** 动作目录经 `registerInstalledActions` 或既有动态曝光，随后到 `studio.call`。后台动作的静态 Manifest 和动态依赖政策共用公开动作入口。已安装组件请求走 Home／项目插件路由或生成插件的 `agent-surface.ts`，可以直接到同一 `studio.call`，未必先走动作目录。Schedule 的唤醒固定安装世代，经依赖动作客户端调用同一已注册操作。后台 lane 在接受时保留原授权，在实际运行前再检查。 `installedDefinitions` 建已批准发行物的定义，`sandboxedPluginDefinition` 为激活建 quick／slow／background runner。 `SandboxBroker.guards().permit` 核精确操作声明与安装批准，Host 服务检查身份、地址、连接、grant 及 `beforeEffect()`。 `network.request`、`secretRefs` 与 `capability.call` 没有独立的现行 grant 条目，不能靠关别的开关阻止。组件直达也不能只依靠动作目录把动作标为不可用。 [定义](../../../../apps/local-host/src/installed-plugin-definition.ts)、[调用路由及后台](../../../../apps/local-host/src/plugin-builder/installed.ts)、[动作曝光](../../../../apps/local-host/src/plugin-builder/exposed-actions.ts)、[定时唤醒](../../../../plugins/native/schedule/src/runtime-wakeups.ts#L61)、[Broker](../../../../packages/plugin-sandbox/src/broker.ts)
- **签名集成。** Home 签名 `integration` 的 `health`、`poll` 用合同固定的来源连接槽，`account` 和 `presentation` 无 effects。由 Home 集成登记 → Feed 来源绑定 → `sandboxIntegrationContribution` → 沙箱 → 每次调用专有的连接客户端。现行 Manifest 仍只有必需存储，批准、来源连接和 origin pin 限定请求。这个分支没有 app 的组件路由、目录动作，也不能借 app 沙箱的通用网络出口。 [集成合同](../../../../packages/contracts/src/platform/plugin-sandbox.ts#L462)、[集成代理](../../../../apps/local-host/src/sandbox-integration.ts)、[S-95](../../../../docs/system/security-invariants/S-95.md)

### 建议合同

一份授权记录，一页开关。以设置页读取 effects 的方案为推荐。SDK 从**已验证发行物**的精确操作 effects 派生现行权限的有效声明，已签 Manifest 和包验证继续使用原字节及现有静态派生合同。新增有效声明的形状与 Manifest 权限行相同，`{ permission: string, required: false, reason: string }`，由 Host 在可信安装定义关联的发行物上计算一次。正常清单行和派生行在 PG-002 仍是一组权限。另存的批准仍是逐值上限，真正开关只写 Runtime 的 `grants`。只有 Host 从已验签包或已发布创作台工件建的沙箱定义可附这份投影，用原定义对象（现有 `definitionOrigin`）和安装记录的签名、世代、版本、摘要关联。插件或安装请求不能提交这份投影。缺批准、发行物失配或发布者已撤销时，拒绝启用或放宽。原件继续用于签名、`manifest_digest`、升级匹配和恢复。SDK 一处映射可复用给安装预览、设置列表、实际请求与操作门禁，标清签包静态派生已有的行与只给安装态投影的行。动作曝光用同一逐操作推导。 [Manifest 快照机制](../../../../packages/plugin-runtime/src/platform-definitions.ts)、[签包保存与验证](../../../../apps/local-host/src/sandbox-package-store.ts)

有效声明的接入点按以下边界交 C 审。

- SDK 在现有 `sandbox-manifest.ts` 里给一个派生入口（建议 `sandboxPermissionProjection(manifest, effects) → { declarations, requested }`）。`declarations` 是原行和补充行，`requested` 是实际使用的权限名加必需权限。现有 `sandboxDerivedPermissions`／签包动作构建继续取静态部分，按操作取同一映射的实际要求。项目库如有可信声明，从清单取 read／write 名；其余按下表。只将共用投影入口暴露给平台消费者及 SDK 快照，包的 JSON 与 `SandboxSdk` 工人接口不加字段。
- Host 的 `installedDefinitions` 先拿已验证发行物和当前 `covered` 的批准，再把这份只读投影附在现有 `installed-action-registration.ts` 所用的定义来源上，以 `definitionOrigin` 回查。集成定义同样登记来源。包预览可直接用已验签内容计算投影，只有正式安装的可信定义才可授予。Home／项目列表和设置入口使用同一安装定义的投影，停止、冷启和恢复通过原 release 重建定义。批准或包损坏时展示原恢复错误，授权入口不从历史清单或包目录猜测。静态派生可按原版本定义重用，grant 和活性每次仍问原激活。
- `PluginRuntime` 增一个仅 Host 构造时接入的查询端口（建议 `permissionDeclarations(definition): readonly PermissionDeclaration[] | undefined`），Home 在 `home-plugins.ts` 组装，项目在 `plugin-platform.ts` 的 installed composition 组装。Host 只返回投影中实际请求的声明，留着形状行供显示。Runtime 在 `index.ts` 把该结果一次交给 `install-rules.ts` 的统一 grant 上限和必需项检查，`regrant.ts` 用同一检查。覆盖 install、直接 grant、regrant、start／recover、upgrade／rollback；普通插件仍用自己的清单。签包验证、Runtime 静态 Manifest 校验、签名／摘要及各声明归属，继续读取原 Manifest。在实际 grant 上限的地方替换读取来源即可，不能另加一套事后准入或由 setter 单独扩权。

| 精确声明来源 | 对应 grant 及执行规则 |
| --- | --- |
| `storage: [read, write]` | 沿用必需 `storage:private`。Broker 仍按精确读写检查，query 写入拒绝。 |
| `model: [read, invoke]`、`modelSettings: [read, save]` | 沿用 `model:read`、`model:invoke`。分别按读、调用或保存映射，保存仍限本人已启用的模型。模型设置仅 Home。 |
| `imageGeneration: [read, bind, generate]` | 沿用 `image-api:read`、`image-api:write`、`image-api:generate`。生图也需 `model:invoke`。绑定与生成都检查获准的 `networkDomains` 和 `network:request`，仍只给 Home，连接 pin、图数和字节上限沿现行规则。 |
| `homeDatabase: [read, write]`、`ownerFiles: [read, write]` | 沿用 `home-database:read/write`、`owner-files:read/write` 和必需存储。清单为库／文件形状保留读写两行，只有版本实际请求的项可授予。实际调用核本操作的精确成员。 |
| `projects: [exist]`、`materials: [read, fetch, fetch_local, original]` | 沿用 `projects:exist` 和对应的 `materials:*` 四个精确权限。补齐 `projects:exist` 到安装态操作准入。公共网页读取需同过 `materials:fetch`、`network:request` 和精确域名；本机页及已提交的原文件继续按各自现有服务拒绝规则。 |
| `connections: [slot_id, …]` | app 沿用 `connections:use`；签名集成的固定来源槽也投影同名可选权限。每次仍检查所用槽、记录键、绑定、发布者、origin pin 和调用授权；已有账号绑定保留。 |
| `networkDomains: [exact_dns, …]` | 新增可选 `network:request`，一类一个开关。允许访问的仍只有此操作声明且安装已批准的精确 DNS 名，Host 按现有 HTTPS、解析结果、地址及重定向规则发出请求。确认用平台文字说明是「访问此插件安装时获准的网站」；详细域名仍由安装预览的 effects 显示。 |
| `secretRefs: [reference, …]` | 新增可选 `secret:use`。`network.request` 带引用时，同时核网络 grant、逐个引用的声明／批准和 `secret:use`。值只由 Host 在派发时写到已限定的请求头；界面和日志只写用途，关开关保留原引用与值。平台确认说明「在已获准的请求中使用为此插件保存的密钥」。 |
| `capabilities: [capability_id, …]` | 新增可选 `capabilities:call`，平台释义说明只调用安装时获准的目录能力。实际目标沿现有目录固定提供方与版本、插件受众、安装批准、原调用、费用、query-only 和尾检查。与 `actions:delegate` 分开，通用目录委托仍被沙箱拒绝。 |
| `background: [operation_id, …]` | 新增可选 `background:start`；精确目标与已有 `background_job` 绑定。发起及取消仍按这次操作持有的目标和执行句柄，发起前核目标会用的权限，实际运行再核。待办保持 Schedule 自己的未知结果／恢复协议。 |
| `projectDatabase: [read, write]` | 有受信 Host 定义真的声明 `databases.project` 时，沿其 `read_permission`、`write_permission` 逐操作复查。签包重建及当前生成清单未提供项目库声明入口。PLIB-10 是 Host 注入该声明的真实沙箱回归，和签名包装入口的证据分开。 |
| `artifacts`、`events`、`resources` | 当前可安装路径未提供这三个独立 broker 端口，沿现有拒绝，列表无可用开关。已获准目录能力的输出仍由目标能力主人处理。UI 绘制 `interaction` 没有 effect。 |

请求的权限是这版已验证 effects 所需的集合，grant 保存成该安装原有的字符串列表。实际派发的许可是**当前操作精确值 ∩ 当前版本安装批准精确值 ∩ 本激活有效 grant**，再过原调用、作用域、发布者和目标服务检查。具有几种 effects 的操作先核本安装的授权集合，未用到此类的操作仍可运行。目录动作另保留现有下游动态依赖权限作为调用者条件，不能把目录目标的权限凭空写进沙箱安装 grant。即使预检已经通过，逐次 broker 及实际外部派发／事务提交仍核原激活。被撤权的激活不可用后来同一安装的新 grant、缓存的 runner 或新会话通过。关开关后立即撤原激活，取消在途及队列，释放 quick／slow／background lane、连接租约与调用作用域，再在新激活中恢复其余操作。恢复只影响新调用，未确认的外部动作交付现有 `actions.outcome_unknown`／`outcome: "unknown"`，不自动重跑。外部已经收到的请求无法撤回，响应到达后不能交付或触发本地新写；S-95 已定的轮换凭据例外沿原证据和限制。 [S-18](../../../../docs/system/security-invariants/S-18.md)、[Runner](../../../../packages/plugin-sandbox/src/runner.ts)、[网络代理](../../../../apps/local-host/src/plugin-builder/network.ts)

设置请求仍为 `{ install_id, permission, granted }`，响应仍为 `{ install_id, permissions, changed }`，权限项仍为 `{ permission, required, requested, reason, meaning, granted }`。关必需、开未请求或超出已批准上限，沿 `plugin.grant_denied`。范围或不可读安装沿当前设置入口的拒绝，版本／世代变化沿 `plugin.definition_conflict`。动作目录按原调用者权限及安装有效 grant 分别判定，缺调用者权限用 `actions.forbidden`，缺安装 grant 用不可用原因 `actions.plugin_permission`。组件或内部 operation 直达统一预检，权限不足在运行插件代码前结束，`studio.call` 用现有动作错误体 `{ error, code: "actions.forbidden" }` 与其类别的 HTTP 状态交付，已公开动作入口保留该错误码。Broker 内精确值未声明、未批准或权限已失效用 `sandbox.not_authorized` 或原调用真实取消／撤权错误。预检拒绝不是结果未知。包清单或合同被改动仍按验签和 `plugin.declaration_invalid` 原有顺序拒绝。

既有普通可选权限初始给法不变。推荐新增行在新装和已安装开发包均缺省关闭，已运行的联网、目录能力、后台及来源拉取会停在相应授权边界，用户可在旧安装中明确打开。升级只带入仍在目标声明和批准里的已持 grant，去掉目标已不请求的项，保留关着的项。新版本扩大精确值时仍须先在既有预览和安装批准路径确认，候选激活在批准尚未落定时不能用新增值。版本切换失败用原版本、批准和原 grant 复原，禁止把回滚当成补授。恢复依旧核销被替换或撤销的安装。已有项目触达同意和 Home 安装授权分别核对，不用一个项目的同意给另一项目补权。 [版本转换合同](../../../../docs/system/CONTRACT-CHANGES.md)、[运行时版本转换](../../../../packages/plugin-runtime/src/index.ts)

**用户决定（2026-11-09）：采用 A，保留签包，从已验证发行物派生开关，新增类别默认关闭；已有安装首次使用这些类别需明确开启。** 下表保留选项与取舍，B 未采用。

| 选项 | 代价 |
| --- | --- |
| A · 在设置里给已有包开关（推荐） | 旧签包、安装 ID、摘要和数据都可继续使用。新增类别默认关，已有用户第一次要打开所需项。Runtime 需统一读取 Host 的有效声明投影，C 合审要核签名与授权声明的分界。 |
| B · 让发行包把所有可选权限写入清单 | 统一验签清单为权限目录来源，包作者能直接审查清单。会改变签名内容及摘要，既有带这些 effects 的包按严格重建会拒读，升级预览和确认也读旧包。须先盘点受影响安装，安排同发布者重新发行并在切换前按已授权方式处理旧安装，或另批维护／兼容路径。不能直接覆盖旧包或改摘要冒充原签名，停用、卸载和保留数据按已定规则。 |

每类一个开关、已批准目标仍逐值收窄、同一权限名复用，以及依赖何时求交是实现安排。每个域名／引用一个开关会把动态目标塞进当前最多 200 字符的 setter，现行 effects 容许更长值，也会让相关操作及依赖跨许多行。仅在产品另定逐目标控制时才评估。 `network:request`、`secret:use` 走既有宽权限确认，平台给两条准确释义以免显示成名为 request 的网站或名为 use 的密钥。 `capabilities:call` 是已批准目标的受限入口，用独立的平台释义，不借 `actions:delegate` 的本人委托含义。确认范围沿 PG-002 的四类决定，其余开关及错误提示复用现有设置布局。 [权限释义](../../../../packages/contracts/src/platform/plugin-trust.ts#L125)、[设置原方案](../../../archive/repository-anti-corruption/slices/pg002-plugin-permission-settings.md)

### 实施与验收

1. C1 先定有效声明接入点。保留签名清单及原静态 `sandboxOperationActions` 的派生。安装定义上的只读权限投影交同一套 Runtime grant 上限检查，覆盖 install、grant／regrant、start、recover、upgrade／rollback。避免只放宽 setter 后在重启时被 Runtime 的清单检查拒绝。批准缺失／无效或版本不符先拒绝。 SDK 投影、Runtime 入口形状以及设置释义有意变化时更新相应 API 快照。动作目录的动态权限更严格，固定引用保持原动作 ID、版本及提供方，调用者可能需新增授权。安装设置和内置动作 schema、版本、固定提供方不因此改变，按实际快照差异核对。推荐路径不升 Manifest、沙箱合同或持久格式版本。
2. 现有 `installed-plugin-definition.ts` 的发行物来源串起设置投影和激活执行。 `plugin-builder/installed.ts` 在组件、目录和后台共同入点按已解析 operation 核 grant。 `installed-action-registration.ts`、`plugin-builder/exposed-actions.ts` 的启动操作的闭包包括后台目标及现有目录依赖，状态查询按自己的权限和现有定义校验处理。两者随激活撤下和恢复。 `plugin-sandbox` 的 broker 核真实使用的 effect； `sandbox-integration.ts` 在固定连接端口之前核 grant。撤权以原激活的 `requireGrant`、`assertLive`、signal 和尾检查为准，旧回调不能读新安装授权替自己继续。没有增加每次 effect 的包重读或每行目录发现。
3. `plugin-install-service.ts`、`plugin-installed-view.ts`、`project-plugin-ports.ts` 用当前安装版本的同一投影，列表复用已验证发行物而非为每个权限再读包；变更后重读现行记录。 `settings-plugins.ts`／现行词典接现有确认及文案。同步 [S-94](../../../../docs/system/security-invariants/S-94.md)、[S-60](../../../../docs/system/security-invariants/S-60.md) 及受涉及的拒绝证据和插件开发手册／Skill。 [BL-910（已并入第 27 批验收）](../../../backlog/BL-batch27-acceptance.md) 保留交互终端启动拒绝及本人可见原因，BL-915（已完成）损包依可信记录卸载、不明数据保留，两项已定；本片只防止不可读包放宽授权。

| 验收编号 | 实际路径和断言 |
| --- | --- |
| B27-PERM-01 | 用临时测试发布者通过真实预览、安装确认，启动 Seatbelt 的 Home、项目 app 和 Home 签名集成。列表可见请求、未请求、已授予的区别；默认关闭的新行不能运行。项目生成发行物走同一准入。经真实设置 HTTP 开启，受控 HTTPS／目录／来源连接收到一次调用，关掉后对应项被拒且计数不增。独立只读操作仍返回，安装 ID、世代、库数据、连接绑定和签名原件不变。恢复后新请求成功。 |
| B27-PERM-02 | 同一 app 分别从组件 `/call`、已固定的目录动作、后台目标及计划派发请求。禁止只在一条路径生效。网络开启时，关 `secret:use` 使带引用的操作失败，纯网络操作仍可运行。尝试额外域名、引用、其他槽、未批准能力、伪造 grant 及 shape-only 写权限，验证具体拒绝和外部零请求、库零写。本人以外、错误设置入口、伪造身份及旧版本确认均被拒。 |
| B27-PERM-03 | 让实际 sandbox worker 在受控 TLS、模型或目录响应等待时触发关权、断线或停用。记录何时派出，检查旧 worker／连接终止、迟到结果无业务回执与 SQL／文件／缓存写。已派出但未确认的结果保持未知，重新授权不能把旧调用救活。相邻新调用在新激活可完成。 |
| B27-PERM-04 | 重启同一隔离 Home，验证已关权限仍关。签名同发布者升级实际缩小请求或新增已批准域名，关闭保持关闭；失败升级和生成插件回滚保留原授权及数据。原包/签名/批准缺失或被撤销，恢复与放宽拒绝，卸载依 BL-915 的批准范围。用同一夹具在真实设置页验证宽权限确认、取消不发 setter、重开后调用成功。 |

## BL-803 Goals 只认实际的 Feed 升格

**实现记录（2026-11-11，第 27 批，按推荐 A）**：合同 `ActionExecutionContext.direct_person_entry?: true`、`ActionCallContext.delegated_action?`（`platform/actions`，字段写在 `action-source.ts` 再由两个接口继承，免得 `actions.ts` 超过巨大单元的行数；API 快照已更新，动作快照无变化）。Runtime 在 `action-provider.ts` 的 `entrySource` 里只在 `current_action` 正是这条登记时记下精确动作，并在受众 `user`、无 `delegated_by`、无 `scene_binding`、`currentPluginInvocation()` 为空时加 `direct_person_entry`；存进 `PluginActionScope.source`，插件视图上的同名字段先删后按它设（`callback-context.ts`）。后台执行接续时 `source` 置空；场景的嵌套调用者与委托的嵌套调用者先去掉原调用者带的两个字段。Host 委托从 `scope.source` 给 `delegated_action`。Goals 的 `PERSON_SOURCE_ACTIONS` 把 `feed`、`feed_item` 都收到 `feed.items.promote@1`／`io.molis.work.feed`，Feed 的 `by_person` 改读 `direct_person_entry`。证明：`tests/security-invariants-plugin-self-call.test.ts`「B27-DELEGATE-02 B27-DELEGATE-03」（真实 Home Runtime：本人直接调用带标记、Agent 的不带、插件改自己视图不算、本人经插件自己另一个动作转调不带，目标只拿到一跳）；`tests/security-invariants-goals-person.test.ts` 与 `tests/feed-goal-promotion.test.ts` 加了「只有插件名没有动作」「Feed 别的动作」「未本人进入」「错版本」「错提供方」各一行，都只提议；真实本人升格（B27-DELEGATE-01）由 `tests/feed-goal-promotion.test.ts` 第一例照旧断言 `confirmed` 与渠道 `feed`。B27-DELEGATE-04 的取消、撤权交错沿用该文件已有的「withdrawn while Goals worked」几例，没有改动。**断言的预期变化**：两份测试原来把「只带 Feed 插件名、没有动作证明」的手造调用者当本人，现在按本设计算提议，改为带上证明，并另加一行断言没有证明时只提议。

### 基点和调用链

[S-99](../../../../docs/system/security-invariants/S-99.md) 已定直接本人和 Feed 来源主人代本人调用的业务语义。 `personAsked` 当前把 `feed` 渠道、`feed_item` 输入映射到 `io.molis.work.feed`，只比较 `delegated_by`、`delegated_audience` 和 `scene_binding`。同一个 Feed 下直接由本人调用的其他动作如果转来，会获相同判断。 `pluginHostActions` 的同安装动作转调还保留外层 `audience`，一个非升格动作能在 `user` 受众下调用该安装自己的升格。仅比较目标看到的受众和动作 ID，仍不足以区分这条转调。 [Goals 判定](../../../../plugins/native/goals/src/action-contract.ts)、[插件绑定调用](../../../../apps/local-host/src/plugin-actions-client.ts)

1. Feed 页面及阅读器的动作进入受保护的 Host 页面动作／Feed Manifest 路由 `feed.item.action`，转 `feed.items.promote@1`，提供方为 `io.molis.work.feed`（内置项目实例）。MCP、Agent、Workflow 经各自已有授权进入同一个动作服务。输入是 `{ item_id, expected_revision }`，输出是 `{ item, goal_id, created }`。内核 `ActionService` 固定实际 provider、版本与注册令牌，`actionExecutionContext` 已经设置冻结的 `current_action: ExactActionReference`。Runtime `pluginActionProvider` 把真实执行上下文、声明、安装 ID 与世代带进 `runInPluginAction`，给插件回调的是另一个可编辑视图。 [Feed 路由](../../../../plugins/native/feed/src/item-route-handlers.ts)、[执行上下文](../../../../packages/kernel/src/action-execution-context.ts)、[Runtime 绑定](../../../../packages/plugin-runtime/src/action-provider.ts)
2. Feed 的升格处理器从自己的库核 Item revision，按需读 `goals.directory.read@1`，通过 `services.actions.directory.invoke` 调 `goals.create@1`、`goals.inputs.confirm@1`，三个目标都固定到 `io.molis.work.goals`。Host 的 `pluginActionDirectory` 从 `currentPluginAction` 取真上下文，核本安装、`actions:delegate`、项目及调用生命期，保留原 actor、授权与 signal。user／agent／MCP／workflow 的目标受众为 workflow，原本是 plugin 的继续用原 plugin 的身份、允许清单和授权。Feed 最后用原 revision 检查写回本库关联。Goals 独占渠道、输入状态、幂等和事件记录。 [Feed 升格](../../../../plugins/native/feed/src/goal-promotion.ts)、[委托服务](../../../../apps/local-host/src/plugin-action-delegation.ts)、[S-43](../../../../docs/system/security-invariants/S-43.md)

### 建议合同

| 位置 | 值和签发条件 |
| --- | --- |
| Runtime 的 `ActionExecutionContext` 及其插件回调视图 | `readonly direct_person_entry?: true`。Runtime 在进入注册的插件处理器时由可信原调用计算，条件是原受众 `user`、原调用不是目录委托／判断场景、进入此处理器前没有外层插件动作、作业或场景。判断外层用 Runtime 当前 invocation 作用域，不能从传给 SDK 的调用参数取。本人经 Host 路由转交同一个注册动作属于入口；在另一个插件动作中转调自己的动作不算入口。没有证明就省略。 |
| S-43 真正派发的目标 `ActionCallContext` | `readonly delegated_action?: Readonly<ExactActionReference & { readonly direct_person_entry?: true }>`。 `directory.invoke` 只用原 Runtime scope 上内核已解析的 `current_action`，核 capability 和 version 等于该安装登记的 scope.definition，provider 等于当前激活的 provider。真实 `current_action` 缺失或无法归属时不给此字段。原 `delegated_by` 和 `delegated_audience` 仍由 Host 给出，目标可读冻结的单跳事实。此字段可用于目标处理器判定出处，无独立授权作用。 |

签发只在活的真实目录调用上发生。构造调用时丢掉继承的旧 `delegated_action`、`current_action` 和 `direct_person_entry`；再委托按当前真实处理器重新计算。普通插件自调用／依赖、查询委托、场景和后台 continuation 沿它们原有的调用控制，不转交前一跳的证明。外部网关、HTTP/MCP JSON、输入 schema、`PluginExecutionControl`、Manifest、场景绑定、跨进程消息、日志与持久记录没有新增此字段。处理器可编辑自己的上下文视图，不能回写源 scope。来源授权和选中的注册仍由原 guard 每次核，不给一个可脱离调用复制、保留或重放的令牌。

在 Goals 的来源策略中，把原 `SOURCE_OWNERS` 的两项收窄为同一固定来源动作 `{ capability_id: "feed.items.promote", version: 1, provider_id: "io.molis.work.feed" }`，所有者仍为 `io.molis.work.feed`。在已有本人直达分支之外，仅当目标为真实 workflow 委托、原委托受众是 user、无场景，且来源、单跳引用与 `direct_person_entry` 都相符时，认可这两种来源。没有出处的委托、非升格、错版本／提供方、两跳、场景与非本人入口都无资格。Feed 的 `by_person` 同步改为用同一 Runtime 事实，避免真正的非本人转调误送 `source_kind: "feed"`。平台委托代码不按插件名判断。Goals 保有自己的允许策略，不 import Feed 实现，也不新增公共的 Feed 专用子路径。Feed 的动作升级时将这条固定消费者策略随声明一起核。

`goals.create` 对非本人显式要求 `feed` 等本人渠道继续报 `actions.input_invalid`，未指定时写 `runtime`。 `goals.inputs.confirm` 仍按原输出 `{ binding, replayed }`，无资格的调用只提议。已提议的输入由本人从 Goals 接受，既有 `goals.input_proposed` 和幂等不变。直接创建和直接确认走现行本人路径。动作 ID、输入／输出、受众、依赖和版本原样，现有固定引用仍能解析，原来误被当本人者的归属会收窄。C1 核 `platform/actions` 的进程内 API 快照，动作快照应无合同形状差异。 [动作快照](../../../../tooling/gates/actions/actions.tsv)、[Goals 创建](../../../../plugins/native/goals/src/actions.ts#L190)、[Goals 输入](../../../../plugins/native/goals/src/input-actions.ts#L84)

Home 级委托仍从同一 Host 的实际调用项目出发，有无项目、项目触达和各自安装世代都按原检查。Home 动作即便合法携带自己的真实动作，也不能变成另一个项目的 Feed 动作。Workflows 的本人交接、助理的委派、个人空间直达、Agent 任务和 MCP 客户端继续按已有受众、精确授权与稳定 Session 判定，不能仅凭说自己代表本人而确认输入。保留 S-43 的 `beforeEffect`、目标的固定引用及源／目标同步复查。取消、撤 `actions:delegate`、移除 Feed／Goals 或调用结束后才到的响应都拒绝新写。已有合法提交按原升格补跑与幂等键处理，验收分别测创建前、确认前和关联前的拦截，不能假定先前已完成的目标事务随取消回滚。

[C 批原实现与裁定](../../../archive/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md#13-固定-wip-的批-c-接续合同2026-10-27) 已保留本人的真实升格。

**设计取舍交公共 C。** 推荐 A，Host 给出真实单跳动作并由 Goals 决定该来源可信的精确动作。只需传现行上下文，授权仍归 S-43。备选 B，在 Manifest 声明「能替本人做」的来源动作，还需由 Host 核真运行、受众及目标同意，否则插件自报就可提升归属。当前只有 Goals 接受 Feed 升格，B 会多一份作者声明和发行审查。原决策已经给出哪些行为算本人；A 的技术选型可由 C 合审，若改成允许作者声明新的本人业务语义，才需用户另定。

### 实施与验收

1. C1 先落 `packages/contracts/src/platform/actions.ts` 和 API 快照。Runtime 侧在 `action-provider.ts`／`action-scope.ts` 建入口事实，核 `callback-context.ts`、`plugin-actions-client.ts` 和 `plugin-scene-service.ts` 的复制边界。Host `plugin-action-delegation.ts` 从真 scope 给本次派发签出单跳来源。已知授信检查、调用次数和 call log 字段不扩。
2. E 轨同步 Feed `plugin.ts` 与 Goals `action-contract.ts` 的消费者。核 `actions.ts`、`input-actions.ts` 的生产分支，若现行错误与输出可复用就不改。更新 S-99、S-43 和动作开发手册／Skill，再走真实 Feed 页面及目录调用。另核 Host 回调的上下文传递和内核构造目标执行上下文，在跨新派发时消除从先前目标继承的来源，保留这次目录调用实际携带的新来源。

| 验收编号 | 实际路径和断言 |
| --- | --- |
| B27-DELEGATE-01 | 经本人受保护 HTTP 升格 Feed Item，查真实 Goals 动作和库，渠道为 `feed`、输入 `confirmed`、Feed 只关联一次。直接创建／确认本人操作同样可用，重试沿原 revision 与幂等约定。 |
| B27-DELEGATE-02 | 真实 Runtime 隔离项目装带测试绑定的 Feed 定义，绑定使用同一正式 Feed Manifest／提供方注册。本人调用另一条 Feed 动作直接委托 Goals，再从另一动作转调真的 promote。前者显式请求本人渠道拒绝、无渠道记 runtime、确认只存 proposed。后者虽有 user 受众和真 promote ref，仍按非本人提议。错提供方、错版本、只带插件名无证明的调用也各断言相同业务结果。 |
| B27-DELEGATE-03 | 公开入口送伪造的 `delegated_action`、`direct_person_entry`、`delegated_by`／受众字段，网关或输入拒绝，库无更改。从 plugin 控制参数／回调视图伪造值、两跳、场景、Home 到项目、Workflows／Agent／真 MCP 入口分别证明不会写 confirmed 或本人渠道。原 MCP Session 和精确授权条件仍决定能否跑。 |
| B27-DELEGATE-04 | 控制真实升格的等待点，分别撤原入口授权、撤委托 grant、断线、停用／替换提供方，释放等待后验证新目标写或新 Feed 关联被拒、旧链失效，既有事务的幂等修复照常。只调用 `personAsked` 或给 handler 手塞字符串不能作为拒绝证据。 |

## BL-367 停止钩子的期限和记法

**实现记录（2026-11-11，第 27 批）**：两个执行器的停止都经 `apps/local-host/src/plugin-stop-hook.ts` 的 `awaitPluginStopHook`。执行种类在 `start` 时从已接纳定义捕获（项目执行器存在按安装的表里，Home 执行器存进 session）。沙箱定义照旧等宿主自己的 stop；进程内的同步返回与同步抛错照原路径，异步的用 SDK `createExecutionLifetime` 计 2 秒（`PLUGIN_STOP_HOOK_MS`），只有这次计时器签发的 `plugin.stop_timeout`（新错误码，`kind: "timeout"`，只作日志的码，不抛给调用方）结束等待，写一行 `plugins/plugin_stop_timeout`（`code`、`plugin_id`、`install_id`、`installation_generation`、`scope`、`timeout_ms`），session 照常在执行器的 `finally` 里 dispose。证明在 `tests/plugin-stop-timeout.test.ts`：B27-STOP-01（Home 经 `/api/plugins/<id>/disable`，项目经真实 Runtime 与项目库；旧路由不答、旧服务按 BL-411 什么都不做）、B27-STOP-02（超时后重启开新激活，旧钩子迟到 resolve 或 reject 不动新激活、无未处理拒绝、无第二行）、B27-STOP-04（`state`、`last_error_code`、`recovery_count`，与按时返回、按时抛错两种对照）；每个卡住的用例都在 10 秒看门狗下跑，旧实现会在看门狗处失败。B27-STOP-03 的「关闭时一个卡住加一个正常」与真实沙箱 runner 的失败路径没有另写用例：关闭走同一个执行器 `stop`，沙箱分支没有改。作者文档在 `skills/molis-plugin-dev/host.md`。

2026-11-09 关闭链交接：第 06 批候选 `8982fad38` 将项目 SQL 子进程的真实退出承诺接到 `project-statement-process.ts`、`plugin-project-library.ts`、`plugin-host-services.ts`、`plugin-executor.ts`，构造／启动失败与正常停止均等待资源释放后再交还 Home 租约。统筹已核该提交的实际差异；其 `tests/installed-plugin-host.test.ts` 用例「BSH-03 S-59 a real installed project SQL child exits before the Host releases the Home lease」延迟真实 PID 的终止信号，断言退出前租约仍忙、退出后 PID 消失且租约可取。该候选仍在第 06 批工作分支，本批尚未集成，也未重跑其用例；最终采用第 06 批完成头并保留这些等待，复核 S-59 的双方证据。下述 2 秒只限制作者钩子，不能包住 `session.dispose()`、库关闭或子进程退出。

### 基点和调用链

`PluginRuntime.stop` 先撤动作登记和激活授权，保留旧 context 让安装锁内的 `stopOnce` 清理。 `PluginSupervisor.revoke` 先使启用 epoch、登记实例与排队工作失效，再触发同一 Runtime stop。restart 等 stop 后按 Runtime 记录启动或恢复。卸载先通过常开协议检查，在安装锁内撤权、停、记 uninstalled，之后清理其拥有的登记及权限。regrant、版本升级／回滚、恢复出错和缺安装记录的释放也会走 executor。 `reportCrashOnce` 与兑现失败的清理另有入口，最终错误仍分别归原故障／兑现失败，不能把它们改报成正常停用。 [Runtime](../../../../packages/plugin-runtime/src/index.ts)、[监督器](../../../../packages/plugin-runtime/src/supervisor.ts)、[缺记录释放](../../../../packages/plugin-runtime/src/activation-context.ts)

`PluginHostExecutor.stop` 和 `HomePluginExecutor.stop` 从旧 session 撤路由／caller／后台等授权，项目执行器还撤事件登记，然后直接等待 `definition.stop`。最后才 dispose 服务、清 session，BL-411 的 stopped 门才生效。项目或已安装插件关闭经 `closePlugin`，Home 经 `closeHomePlugins` 逐安装调用 preserve-enabled stop；Home 对外已有独立 10 秒的 `host.close_timeout`，它结束调用方等待，持锁直到真实资源释放。钩子永不返回会使实际关闭悬着，重试也只等原关闭。 [项目执行器](../../../../apps/local-host/src/plugin-executor.ts#L171)、[Home 执行器](../../../../apps/local-host/src/home-plugin-executor.ts#L186)、[关闭插件](../../../../apps/local-host/src/plugin-platform-close.ts)、[Home 关闭](../../../../apps/local-host/src/home-storage-lifetime.ts#L18)

目前普通 hook 拒绝走 `plugin.executor_failed`，Runtime 记 `crashed` 与 `last_error_code`，卸载可重试。 `reportCrash` 记原错误，`recovery_count` 是实际恢复尝试数，由 `recoverOnce` 增加，默认上限 3，耗尽后按原规则隔离，启动被停用打断不占额度。BL-411 已把 stop **之后**的残留代码请求做成同步被拒返回 `undefined`、异步被拒不结算，记录首次调用，不影响仍活着的请求及钩子在截止前应看到的拒绝。F9 的进程崩溃处理和 26 的日志属于不同层。 [BL-411 实现](../../../../packages/plugin-runtime/src/stopped-services.ts)、[拒绝测试](../../../../tests/plugin-stopped-services.test.ts)、[F9](../../../archive/repository-anti-corruption/c-end-readiness.md#35-c-5-可观测性与崩溃上报a-在-m1b-在-m2)

### 建议合同

两种执行器调用同一个宿主内部停止钩子等待点，复用 SDK `createExecutionLifetime` 的有限等待、定时器清理和迟到 reject 观察。时限从旧激活已撤权且实际进入异步钩子开始，锁前排队、宿主 dispose 和 OS 子进程真实退出不算在这段。钩子按时返回，正常收尾；按时抛错，照原错误路径。只有宿主这次计时器签发的到期原因可结束等待，不能按插件返回的错误码判断。到期产生一次结构化 warn `area: "plugins", event: "plugin_stop_timeout"`，诊断 `plugin.stop_timeout`（`kind: "timeout"`，在既有 `pluginErrors` 处定义），字段 `plugin_id`、`install_id`、`installation_generation`、`scope: "home" | "project"`、`timeout_ms`。不写钩子错误正文、输入、路径或凭据，不触发进程级崩溃或新业务诊断表。

推荐诊断记法下，超时只结束本次等待。 `PluginDefinition.stop`、`PluginExecutor.stop` 的签名和 `PluginLifecycleReceipt` 不改。撤权保持到旧 session 真正 dispose 并移出。显式停用进 `disabled`，preserve-enabled 停止进 `installed`，升级、重启、regrant 和卸载按它们已有的后续步骤继续。单纯超时不设置 `last_error_code`，不计 `recovery_count`，已有故障路径仍记原故障。宿主清理失败依原路径上报真实失败，不能因钩子超时吞掉库、目录、子进程或资源释放失败。并发、重复的生命周期操作沿当前安装锁及监督器 gate，旧钩子迟到完成只结算它自己的 Promise，不能再清 session 或登记，不能写失败回执。

停止路径在同一个执行器里区分钩子和宿主清理。开始激活时从 Runtime 已接纳定义的 `execution` 捕获清理方式，随各自 session 保存。`definition.execution === "sandbox"` 是当前两个执行器在 `refuseUngivenSandboxServices` 已经用的可信执行种类，由 Host 给已验签、已发布定义，包的 JSON 无这个选择。捕获之后不受插件回调改定义影响。缺 session 时从 Runtime 交来清理的原定义取同一规则。

- 对进程内定义，在已撤该 session、项目事件及调用登记之后，只把 `definition.stop(oldContext)` 交给共用的限时等待。基点 Git、Diff、Text stats、Coding 的 `onStop` 注入点没有随正式登记传入宿主资源释放器。同步完成与原同步错误照原路径。新增的必需 Host 资源释放属于 session 的 dispose。
- 对沙箱定义，直接等待已接纳定义的 Host stop。app 的 `plugin-builder/installed.ts` 清 lanes，`sandbox-integration.ts` 先撤该激活并关闭其 runner，`installed-plugin-definition.ts` 的包装按原顺序释放 agent 声明。runner 停止队列与 broker，向本次实际进程组发终止信号并等待退出和临时目录移除。这个分支等真实结果，失败保留原语义，版本、发布者及插件名称均不参与选择。两个执行种类都经过相同的授权撤销和生命周期接口。
- 两路都在执行器自己的 `finally` 对捕获的旧 session dispose、移出一次，`stopped` 自此生效。宿主的库、视图、终端、连接和其他占用释放由各自原 owner 完成。即使撤权或 dispose 另有异常，也要走其余已适用的清理，保留真实失败。这样跳过的只是插件钩子还没结算的等待。

钩子或残余计时器只能使用已失效的服务。同步死循环、事件循环阻塞及插件私自持有的外部资源无法靠异步期限终止。进程崩溃恢复及 Host 总等待和锁各管其事，多安装串行收尾总时长仍可超过 10 秒。 [已有沙箱辨识](../../../../apps/local-host/src/plugin-sandbox-start.ts)、[SDK 执行生命周期](../../../../packages/plugin-sdk/src/execution-lifetime.ts)、[沙箱退出](../../../../packages/plugin-sandbox/src/runner.ts#L243)、[S-18](../../../../docs/system/security-invariants/S-18.md)

**用户决定（2026-11-09）：每个作者异步停止钩子等待 2 秒；超时只记本机诊断，继续收尾，不消耗崩溃恢复额度。宿主进程退出和必需资源释放仍按真实结果等待。** 下表保留已选项与备选取舍，5 秒和持久故障方案未采用。

| 项目 | 已选 | 未采用的备选与代价 |
| --- | --- | --- |
| 每次异步 stop 等多久 | 2 秒。给让出事件循环的本地清理一段时间，单个不返回的钩子只占已有 10 秒 Home 对外等待的一小部分。 | 5 秒。慢的自有清理多 3 秒，但两个同时失灵的安装就可能耗掉整次 Home 对外等待。基点缺少真实钩子时长分布，两个值都是候选，实施时用现行插件代表路径验证。 |
| 超时怎样记 | 只写本机诊断，按已停止推进，`last_error_code` 和恢复额度保留给真正的故障与恢复。插件列表不会因一次旧钩子拖住而显示崩溃。 | 作为故障记录。显式停用／卸载仍完成并撤权，可留 `last_error_code: "plugin.stop_timeout"`；需要继续运行的路径须进入现有 crashed／recover 策略，下一次实际恢复才计额度。要给 Runtime 区分「钩子超时且资源已收尾」和真正清理失败，增加生命周期传递及状态分支。反复重启会更早达到恢复上限，旧钩子拖住也会影响下一次使用。 |

统一计时位置、何时清 timer、晚到结算如何隔离、使用现有日志及测试方式均由实现按已选语义执行，不另给每插件一个期限或新增通用调度器。

### 实施与验收

1. 选定期限和记法后，C1 与宿主维护人按 `plugin-executor.ts`、`home-plugin-executor.ts`、`plugin-host-services.ts` 的真实顺序设计共用等待点。计时只包可挂起钩子；同步撤权和释放始终走原 owner。兑现失败、`reportCrashOnce` 及缺记录释放的调用点逐个核对是否已先切旧授权并按原错误结算，尤其 `reportCrashOnce` 当前先进 executor、后清 Runtime 上下文。补必要的早撤权但保留原失败／取消分支。主线使用现有锁和登记，不为计时改持久化结构。已选记法若新增公开错误码，C1 更新 `platform/plugin` 的 API 快照；无动作 schema 或引用版本变化。
2. 同步 S-18 的停止后拒绝和包开发说明，沿 26 的本机日志。现有 BL-411 停之前、钩子内和停之后的边界都有回归；不用新的观察面、统计或上报来证明完成。

| 验收编号 | 实际路径和断言 |
| --- | --- |
| B27-STOP-01 | Home 用现有 Host 夹具注册异步永不返回的 stop；项目用正式项目平台与真实 SQLite repository 做同一例。经公开 HTTP 停用（Home `/api/plugins/<id>/disable`）或项目的公开生命周期 API，钩子进入后在期限附近返回，状态、动作目录、路由、旧服务和真实 KV／SQLite 分别核对。先用坏实现跑，卡住必须稳定失败。仍活着的旧动作立即拒绝，过期后定时器调旧服务符合 BL-411，日志一行且无输入。 |
| B27-STOP-02 | 对同一原安装交错 stop、restart／regrant 和卸载，分别验证持锁一次、旧 epoch 与 session 失效、新激活能真实读写、撤权保持、卸载保留选定的数据。人工释放迟到 resolve 和 reject，观测无未处理拒绝、无迟到业务写、无误删新登记、无重复统计。 |
| B27-STOP-03 | Home／项目关闭各跑有一个卡住的钩子和另一个正常插件的场景，验证真实关闭后可立即重开同一隔离 Home，停用意图、安装记录和数据按原规则读取。另用真实沙箱 runner 和真实宿主资源失败路径验证：未退出或未释放时不得提前释锁，正常及失败清理的行为可分辨。 |
| B27-STOP-04 | 以已选记法断言日志、`last_error_code`、`state` 和 `recovery_count`；一个正常钩子、一次钩子按时抛错和一次真正崩溃恢复作对照，复核预算耗尽仍按原隔离条件。真实计时含明确测试 watchdog，避免用 sleep 或只测 Promise helper 自证。 |

## 开工前检查

| 项 | BL-701 | BL-803 | BL-367 |
| --- | --- | --- | --- |
| 1 事实主人 | Runtime 持 grants，已签／已发布合同是逐值声明，安装批准给上限，设置只读投影。 | Host 持真实调用身份，Goals 拥有来源认定和记录，Feed 拥有 Item。 | 执行器持 session 和钩子等待，Runtime 持安装状态、恢复额度，宿主 logger 写诊断。 |
| 2 插件同等待遇 | 生成、签名 Home／项目共用 SDK、Runtime 和设置权限。现有集成连接限制各自沿用。 | 通用证明由 Host 签发，Goals 按来源合同决定。 | Home／项目用同一钩子等待，沙箱 Host 清理沿现有 owner。 |
| 3 能力注册 | 现有动作、组件、计划及后台共用一次操作声明，等外部的仍 concurrent。 | 由 dispatcher 读取已注册动作，不登记第二个； Feed 升格仍 concurrent。 | 不涉及新能力，原生命周期入口。 |
| 4 合同 | 推荐保留签包 wire，核 SDK／权限释义和有效声明 API，动态可用性收窄。 | `platform/actions` 新的进程内来源事实，Feed／Goals 同片接。 | 推荐只新增诊断码，钩子、回执 shape 原样。 |
| 5 包与分层 | SDK 派生，Runtime 检查和持久，Host 绑定发行物和执行，sandbox broker 核 effect。 | contracts → Runtime／kernel → Host 绑定 → Feed／Goals 消费。 | 两个 Host 执行器共用 SDK 生命周期，Runtime 仍持锁和保存。 |
| 6 表与存储 | 无新表，原项目／Home 安装库及批准 KV 各归原 owner。 | 无表变更，原 Goal、输入、Feed 记录。 | 无表变更，已有 last_error_code、额度及 logger。 |
| 7 兼容与迁移 | 推荐单一现行投影，签包校验和持久形状原样。备选 B 的旧包窗口另定。 | 仅当前 Host 证明可用，缺失不当本人。 | 无兼容读取或迁移。 |
| 8 安全边界 | S-94／S-60／S-18 及相关沙箱边界，逐值与当前 grant 的拒绝，保留 S-95 例外。 | S-43／S-99 和 S-18 的真实嵌套拒绝。 | S-18／BL-411 的撤权及无迟到写入，清理失败仍可观察。 |
| 9 调用次数 | 沿设置一笔 setter 与现有前后读取，逐权限不发请求；按发行物一次投影，无每 effect 重开库或发现场景。 | 在已有调用作用域读一个引用，无新请求、全量目录、表读或按目标授权一遍。 | 一次真实 stop 钩子一次期限，无轮询或重放。 |
| 10 升级与数据 | 不改安装摘要、业务数据与固定引用；新增权限默认关，明确打开才生效；保存已有授权选择。 | 固定引用与旧渠道／输入照读，不补写旧数据。 | 授权和保留数据按原合同，已写入的合法结果照常读。 |
| 11 成果与过程项 | 不涉及。目录能力原 owner 仍决定输出落点。 | 不涉及。原输入确认是 Goals 自有记录。 | 不涉及。停止诊断是宿主本机日志。 |
| 12 页面、外壳、文字 | 现有设置开关和确认。释义归 Host，工作台现行本地化，验证分辨率／中英／深浅，资源比较沿既有门禁。 | 不涉及新增页面和文案，验 Feed 真实入口。 | 不涉及新增页面，公开状态按选定记法。 |
| 13 错误 | 复用授予、调度、沙箱、包验证的现有码。 | 沿 Goals `actions.input_invalid`、S-43 原拒绝码。 | `plugin.stop_timeout` 由 `defineErrorCodes` 声明，无错误子类。 |
| 14 冲突面 | C1 的 SDK／Runtime／快照，D 设置及语言；#2000 信任、沙箱包与 Host，#1999 设置投影／终端。 | C1 actions 快照及 #2000、#1999 内核；E Feed／Goals，#1999 涉 Goals 动作和 Feed 部分文件。 | Host executor、安装关闭及 SDK 执行，Runtime 共享；#1999 SDK 执行／终端，#2000 Home 装配／Runtime。 |
| 15 全局最优 | 插件用同一设置。平台从 Runtime 单一 grant 取事实。助理按已有目录不可用理由处理。连接器、Schedule、MCP 同受限。46 继续接生成器和 SDK，签包没有第二套开关。 | 插件通用来源事实。平台无 Feed 名单。助理和 MCP 不继承本人权。Workflows 仍走原授权。未来具体消费者自定许可策略，Feed 动作变更时随固定引用核。 | 插件可恢复，平台保有真正资源清理。助理会话不会因插件钩子多等一轮，仍按原授权结束。74／SRV-8 沿 26 日志界限。未来同种 hook 走同一等待点。 |

### 交接与验证安排

- [#2000](https://github.com/molis-ai/molis-work/pull/2000) 核对头 `755d369ba`，写手占 `apps/local-host/src/home-plugins.ts`、`plugin-install-service.ts`、`plugin-trust-actions.ts`、`plugin-install-actions.ts`、`plugin-platform.ts`、`project-plugins.ts`、`sandbox-package.ts`、`sandbox-package-store.ts`，以及 `packages/plugin-runtime/src/index.ts`、`install-rules.ts`、SDK Manifest／入口、`platform/actions.ts`、`platform/plugin-trust.ts` 和对应 API 快照。BL-701 与 BL-367 接实际 Home 装配及登记时先交这些主人核差异，BL-803 的公共 actions 合同与该快照串行。
- [#1999](https://github.com/molis-ai/molis-work/pull/1999) 核对头 `3afeeffdc`，重叠 `apps/local-host/src/plugin-installed-view.ts`、`plugin-terminal-service.ts`、`packages/kernel/src/action-service.ts`、SDK 执行与入口、`platform/plugin-errors.ts`、Goals `actions.ts`／`plugin.ts`、动作和 API 快照及 S-103。BL-910 的终端拒绝由该处维护，BL-701 在其后复验；BL-803 的 Goals 策略和 BL-367 的错误码／SDK 等共享区写手由统筹交接。主会话在最终头核合审，按[轨道规则](../../../post-anticorruption-roadmap/reference/tracks.md#section-5)由文件主人落代码，公共 C 负责合同评审。两张在途 PR 的头只用于判断冲突。
- BL-701 的包／授权映射与 BL-367 期限、记法已由用户选定。公共 C 合审后，在本批分别先合同、后生产接入、最后消费者；不重复询问上述决定。BL-803 可独立准备，合同时排 C1 共享文件。三项交同一批 PR，按最终合同内容刷新快照，由批次评审台与公共 C 在最终头审。没有新增 CI 门禁。
- 写手定向用 `node scripts/run-tests.mjs --jobs 1`，按[机器槽约定](../../../../docs/system/PARALLEL-DEVELOPMENT.md#5-构建与浏览器用例排时段)跑。BL-701 复用 `tests/security-invariants-sandbox-signed-resources.test.ts`、`tests/security-invariants-sandbox-signed-background.test.ts`、`tests/sandbox-integration-home.test.ts`、S-94 的权限 HTTP 用例及 `tests/plugin-permission-switch.e2e.test.ts`。BL-803 复用 `tests/feed-goal-promotion.test.ts`、`tests/feed-promote-reader.test.ts`、`tests/feed-promote-mcp.test.ts`、`tests/security-invariants-plugin-action-delegation.test.ts`。BL-367 复用 `tests/plugin-stopped-services.test.ts`、`tests/home-plugin-model-lifecycle.test.ts`、`tests/plugin-lifecycle-states.test.ts` 和 `tests/security-invariants-home-storage-host.test.ts`。按编号将新边界放进会实际执行的用例。整批合成后由统筹按各包 README、受影响用例及共享核心规则执行构建、真实权限页和安全验证、API／动作快照检查以及最终头全量。用独立测试浏览器和临时 Home，测试签名、模型和外部 HTTPS 使用隔离夹具。
