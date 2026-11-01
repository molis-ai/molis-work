# T403 API接缝最小工程方案候选

负责人：Codex 起草线；接续API-MAP，不重做七行扫描、不加任务/RAC号。只读绑定main `b6f92222fce89dfba756a580768889292cfe9967`。本轮只写此文件，无源码/测试/coord/GH/真实Home/凭据操作、构建或动态验证。T402/完整PR1/PR2/T148及文件锁仍WAIT，资源审批不变。

结论：可以复用真实Runtime page activation、已有Functions动作和availability。**不能把原shell页面有权限推导为Feed安装已有管理权限**。五个Functions动作的plugin准入仍须根对下面具体权限选项作决定；连接账号列表/绑定保留可信Host本人选择面，不授予插件全Home管理读。账户流程还须等待T121 #1677实际采用和最终slot合同，不能按本书原基点旧“换账号创建新来源/暂停旧来源”语义设计第二套绑定。其余接线可以按以下范围准备，不能先加HTTP放行或伪装user。

## 1. native clientFactory的page action activation：复用真实安装

已存在生产链：`plugin-platform.ts::createPluginPlatform` 将home/actions/actor/project和同一Runtime records交PluginHostExecutor；`plugin-executor.ts::start`调用 `plugin-host-services.ts::openHostSession`，后者在definition.start前将真实 `{manifest,install_id,project_id,actor_id,assertCurrent,invoke:pluginPageActions(...)}` connect到该Home的PluginPageAuthority；stop/revoke/dispose调用withdrawPages。此链不限sandbox，不能只看 `plugin-page-http.ts` 的registered pageRequests fallback就判native没有invoke。

T403最小装配：Feed/Inbox仍由实际Plugin Runtime启动，frame以可信mount对应的正在运行安装打开page；`plugin-page-http.ts`在已显示检查、Host/项目准备后，通过同一个authority.open选该真实activation。fallback的install_id=null/requestAllowed只服务原注册HTTP路径，**不得为Feed新造invoke、赋全权限或借clientFactory/pageRequests冒充安装**。有有效Runtime activation就不需要加Feed pageRequests。实例尚未启动、未显示、已撤权则拒打开页面，不降级成注册表user代理。

`plugin-page-actions.ts`保现行规则：own动作走它已有受限页面调用；跨owner明确audience=plugin、可信host_plugin及plugin_install_id，consumes与每个requireGrant都检查，provider由真实目录选唯一项；前端reference只选能力不提供actor/install。一个project/Home双实例同时存在时，当前authority.open优先Home resolveFiles等候选排序并不等于T402已选舞台owner：同PLAN的实际scope/安装绑定必须延伸到page授权，可信Host按已选安装精确选activation，不能拿Home Feed activation代项目舞台，不能接受child报install_id。必要增量在authority.open及其Host装配参数，而非第二页授权表。

文件：`plugin-page-http.ts`、`plugin-page-authority.ts`、`plugin-page-actions.ts`、`plugin-host-services.ts`（仅若最终通用接线确缺字段）、`home-plugin-executor.ts`对应现有Home activation；T402实际owner选择接缝将相同可信binding传来。Frame/child现有host.invokeAction继续只走 `/api/host/plugin-page-actions`，不改成跨ownerHTTP。所有安装生命周期的撤销/页面close必须同时撤销page请求；前置调用、await后、最终返回均核同一page/实例与当前项目显示/原grant，不能仅开frame时核一次。

## 2. 五个Functions动作：真实可用接口与权限决定

API-MAP已给准确schema，直接复用 `functions.authoring.{create,list,update,preview,publish}@1` / `system.functions`；不新建Feed同名代理、不把它们替换为只读已发布目录。update必须从旧HTTP平铺body转 `{id,updated_at,patch}`；preview为 `{id,updated_at,input}`；publish为 `{id,updated_at}`。create的function_key、丢响应后list查同key、published reference版本、旧updated_at与“先预览再发布”不变。

**真实缺口**：authoring-actions.ts的define统一排除plugin，五个动作需要functions:manage（preview还需functions:invoke）；Feed只有invoke、未声明五个consume。函数记录归Home Functions；现有list是全部draft/published完整记录，update/publish按id取记录，**没有“此Feed创建的记录”owner字段**。因此“只加plugin受众”会使持manage的插件获得Home范围现有记录管理能力，不能声称它仅能碰本Feed草稿。发布输入可包含scene/action映射，既有validatePublication/caller检查必须保留。

供根裁定的两个具体选择（当前均未授权实施）：

- **A：复用现有管理权限（最小代码，用户明确批准完整范围后才可实施）**。只为这五个动作加plugin受众，define不能使get/delete/sample/context等一起开放；Feed精确声明五个consume、可选functions:manage用途，保留invoke。可选允许本人沿现有权限设置关闭，但**不等于默认关闭或逐安装先确认**：host-build首次安装会给全部声明权限，跟随构建新增声明按现行hostBuildGrants政策打开新可选权限；consent账本不是functions:manage授权确认器，不能声称当前流程会为每台安装弹新增权限确认。required=true又不能被单项关闭，因此建议optional，仍默认开启。用户必须先明确批准这次新增Home管理能力及该发放方式，不能用自动grant倒推同意。关闭此可选grant时，需管理权的创作操作按真实拒绝保输入，Feed其余已授权功能不因该项变成必停；继续用真实plugin caller，不伪造user或改host信任规则。
- **B：不授Home管理权**。把这段authoring留给Functions owner的可信本人编辑/预览/发布面，Feed仅给合成输入，用户在该可信面确认，返回已发布ActionReference，Feed再保存自己out-rule。这保留权限边界，但会把现有内嵌预览/保存变成跨面交接，属于可见产品流程取舍，并非本次纯搬迁可自动采用。不要为了避免选A临时新增record_owner/私有草稿表/平台代持授权或五个受限代理动作。

A若获准，精确文件增量：`modules/functions/src/authoring-actions.ts`按五项显式audience开放；`plugins/native/feed/src/permissions.ts`声明optional functions:manage，manifest/runtime-actions精确consume；权限说明沿现有permission设置入口准确展示，不改consent种类、不改install-rules自动发放政策；`tooling/gates/actions/host-actions.tsv`等实际动作快照与合同要求同步。无输入/输出schema变化时不复制@2别名；必要版本变更按现行合同一次处理全部真实调用者，不留双路径。API-MAP的宽last_preview schema不能冒称严格保证outcome/noul，不借机重写整schema。

**动作拒绝与await点**：调用前page当前/consumes/明确grant/plugin受众/唯一provider/availability全部满足；create/list/update都是Functions同步owner操作，dispatcher最后授权复核到业务写之间不能插异步；preview已有concurrent且service.preview在evaluate await后调用caller.beforeEffect、signal检查，再savePreview；publish已有validatePublication await后beforeEffect再publish，保原CAS/试跑/scene限制。撤权、停用或page关闭后的晚到结果不能保存preview/publish或Feed绑定，原合法草稿保留，不能失败后重新生成function_key造成重复。发布成功但Feed规则保存失败时重试复用同已发布reference，不自动再发布/重复规则。

## 3. 模型就绪预检：复用preview availability，不开settings接口

现有 `functions.authoring.preview` handler availability直接读ports.credentialAvailable，返回 `{available:false,code:"actions.connection_required",reason:"请先连接判断服务"}`；Functions Host配置探测用functionsCredentialConfigured，不解密Keychain。它是“当前配置可用性”而非模型实际成功承诺。不给插件 `{source:env|ui}` 或凭据引用，不能用connector connected替代。

最小建议：同page action入口增加**只针对own/consumed reference的availability操作**。在pluginPageActions内共享reference校验、own/consumes判定、真实caller构造及pluginActionView / ActionClient.discover(caller)的唯一provider解析，仅末端区分返回view.availability或invoke，不复制权限判定器。原invoke `{reference,input}` 保持；查询严格 `{mode:"availability",reference}` 不收input、身份、权限或完整动作元数据。Activation/frame Host新增有限availability方法（当前尚无），没有真实invoke activation的registered fallback不自动获得查询权。文件为plugin-page-actions / plugin-page-authority / plugin-page-http、frame child/types、contracts UiPluginClientHost及实际装配接线。跨owner始终plugin受众，权限来自当前安装grants；保own动作原受限user语义及provider pin。不能把查询caller设query_only:true而隐藏本身为command的preview。读取前、await discover后及返回前均执行page beforeEffect/assertCurrent与目标动作每个context.requireGrant，核安装活动/项目显示；不能仅依pluginActionView的signal复查。缺consume/grant/provider的真实拒绝可能为dependency_missing，不能统一改成connection_required。

流程保持：本人点预览→先查preview availability→若connection_required，显示原“AI判断还未连接，请在能力服务的连接设置中配置模型；当前输入已保留”，不创建新Functions草稿、不清表单、不跑样本；若其它权限/供方错误显示其真实错误并保输入。可用才执行原create/update/逐sample preview。查完到实际preview之间撤连接/撤权仍以真实动作再次检查为准；失败不写last_preview/Feed rule，不能把缓存availability当lease。前后page scope校验、序号/当前输入快照防旧应答覆盖新输入；恢复连接后本人可重试同一意图。

此处是同权限下的元数据入口补齐，不新增模型执行权或管理权，仍依§2所需grant/受众决定。删除原services.actions.availability等价备选：其consumer依赖就绪检查可能按目标所需权限/非plugin受众查询，不代表当前安装实际grants，不能作为安全预检。只沿上述真实page caller共享解析；不得执行假preview或先建草稿再用失败模拟原无副作用提示。

**S95取消语义原样保留**：复用page.bind的AbortController、page.close/withdraw及现有route control。本人离开自己的页面为cancelled，实例/授权withdraw为forbidden；不能统一改为撤权、普通错误或“未连接”。availability await中关页/撤权不回旧可用结果，invoke仍保原错误含义。preview/publish不借background authority延长页面创作；写前beforeEffect后同步写，Feed后续规则绑定另核自身实时授权。

## 4. 服务账户选择：复用T121 slot语义，Host持列表/绑定权

**新增准确前置**：T121 #1677候选H=`c2502b62dc2af4cb090ce740f12d394646e7bdeb`。本轮仅定向读该对象的navigation-feed-sources、Feed ui和slot动作合同，不重审T121、不采用候选实现。其来源控件已写data-plugin-record-slot/account，读服务账号列表并GET `/api/settings/connectors/plugin-slots/record`取真实绑定，change时POST同路径；只显示非project账号，已有绑定时disabled，提示“要换账号，先断开来源”，无绑定时“选好就保存”。来源已断开时保存账号并不自动恢复，提示另点“恢复来源”。这与旧main提示不同，T403要等其实际采用、最终完整页面/来源编辑/断开合同及同文件锁交接，不预用候选代码。

可复用的是现有Connector slot owner合同与上述accepted候选UI行为，不是现成opaque-frame安全控件：`connectors.plugin_slot.read@2` / `bind@2`均user-only、scope=project；read输入install_id/plugin_id/slot_id/record_key，bind再含service_id/connection_id（可null）；可信project来自caller。候选的控件仍是shell inline select+用户HTTP入口，没有找到可直接复用、已通过frame可信Host通道暴露的通用slot picker。因此下文只建议把同一个slot UI/owner流程托管到可信Host，不新造另一套source保存/账号绑定语义；控件桥本身仍须根冻结。

现有 `connectors.connections.read@1` 是Home管理读、非plugin受众；`connectors.connection.availability@1`只有available布尔，不能列账号。**不能给Feed补connectors:management:read或开放该HTTP路径来装下拉框。** 原 `connector-plugin-slot-actions.ts` 明确slot绑定仅本人user，plugin/agent/mcp不可选择账号；opaque frame中的点击不能把plugin动作caller改user。

最小工程建议为**可信Host账号选择控件**：复用现有slot/连接owner与平台picker/embedded review那类“child给锚点，Host持内容与决定”的装配模式，在原账号select位置呈现当前值及选择列表，页面仍是来源配置中选账号，不另开设置页、不让插件持管理列表。控件是平台有限能力候选，不是假称已有现成chooseConnection API。

- child仅请求 `{slot_id,record_key?,anchor}`；slot在当前真实安装Manifest connections.slots中取（Feed按服务有per_record slot），service_id/binding从该slot推导，actor/project/install从page activation。record_key由当前Feed来源记录确认属于本项目/当前可编辑对象，不以任意query覆盖；若是尚未建立的新来源，仅选择暂存引用，后续创建/本人原确认流程再绑定，不凭UI展示自动创建来源/绑定。
- Host用同一Connector owner的查询函数按service过滤，列表保留**仅UI实际需要五字段** connection_id、account_label、display_name、auth_method、state；不提供credentials/ref、protocol配置、scopes、端点、publisher、其他服务账号。列表全程留可信Host，不通过postMessage交给插件。原connected/reauth_required/disconnected显示与旧列表一致，不将connected等同此刻请求成功。
- 给插件的完成值仅显式选中项 `{connection_id,label,auth_method,state}` 或cancel；label由Host用account_label/display_name已有规则生成，原无效当前值显示“原连接已不可用”。选择结果不是连接绑定授权凭证，不可替代connection owner最终查当前service/enabled/revision。初始当前值也从该目标的真实绑定/来源当前引用读，不由插件指定任意connection_id枚举标签。
- 本人选择在可信Host完成，按T121最终采用合同**选择即保存该record slot**：调用现有user-only bind@2真实本人入口，复核页/项目/安装/slot/record及当前绑定条件，返回实际结果；已选账号disabled，换账号先走原明确断开来源流程，不在picker中暗中替换。断开来源保存新账号后仍保持disconnected，须本人另点恢复才拉取。不能沿旧main的“新来源/暂停旧来源”流程再造第二绑定语义，也不能将候选change处理器搬进plugin后伪装user。新增来源先沿T121实际建立record/slot流程，尚无合法record不得自动绑定。S57/S71权属与原检查保持。
- 打开前和选择后/每次await后校page、安装、slot声明、编辑record及本人会话；列表读完后连接被删/撤权/停用则选择提交拒，保原来源/绑定/秘密不变，刷新控件并保输入。不能持picker返回值越过之后的Runtime权限检查。无本人活动/已隐藏卸载page不允许继续选择提交。

文件落点候选：contracts `platform/ui.ts`为平台账号控件声明最小输入/输出；frame `types.ts/child.ts/parent.ts`与一个有限picker处理模块（按现有Host嵌入控件模式，非Feed特例）；Connector owner `connector-plugin-slot-actions.ts` / `connector-connection-views.ts`及现有slot scope解析；Feed sources客户端只替换原select调用/消费结果。新的公共控件必须任何满足相同slot/授权条件的插件可用，不按Feed id开分支。当前尚无此控件，需根接受其UI边界/确切命名与路径后冻结，不擅自修改权限或新增动作id。

这条推荐不授插件Home账号列表读权、不改变user-only绑定含义，属于保留原本人选择能力的通用入口补齐；**若根希望插件自己接收整份列表、自动选账号/绑定，则是新权限/产品决定**。可审阅选择是“Host可信控件只返回本人选中项”与“新增插件可读账号目录权限（须界定服务/安装/字段和用户授权）”，本书不默认选后者，也不把现有connections:use/observe解释为管理读。

## 5. 冻结次序与证据要求

先核实际Runtime activation/舞台owner绑定及通用page调用/availability入口；根对§2 Functions权限选项及§4可信账号控件作有限裁定；T121 #1677实际采用及准确slot合同/文件锁成为账户分支前置，再在最终T402/PR2合同上适配。未获Functions新增授权前不改audience/发grant或伪装user，A/B仍候选，不开放全Home管理。原MOUNT/PORT-MAP负责视图消息与mount；模型/Keychain/真实账号不参与当前准备。

原验收的必要证据：同一真实Feed安装→frame page→plugin audience调用5动作（未consume/未grant/停用/不同provider拒；若选A，Home记录管理范围明确证明）；无模型预检零create/preview写、输入保留/真实提示，恢复后重试；preview/publish真实等待中撤权零晚写/零Feed绑定；账号控件无列表/secret泄露、跨service/record/过时状态拒，按T121最终合同验证选择即保存、已有选择disabled、换账号先断开、断开后另点恢复，不沿旧main断言新来源/暂停旧来源；page关闭撤销在途请求、双实例不串activation。不得用源码扫描或T134 token绿代签这些链。

按实际合同改动同步API/动作快照、文档、安全拒绝证据与原RAC，不占新号；共享核心Full由根安排CI，本轮未运行任何检查。资源三项具体审批仍待实际产物，不由此书代批。

## 根裁定附录｜安全修订与一项用户WAIT

依据同目录API-SECURITY-REVIEW及根独立复核：审查旧08c到方案E=b6f的Functions/install-rules/核心caller未变；authority的S95 own leave与withdraw区分、Host services终端释放finally均保留。本轮不重审MOUNT、T121或已有安装信任政策，不追加安全产品方案/接口分支，也不请求第二轮安全评审。

根接受的工程边界：真实Runtime activation接线及精确舞台owner绑定、同page caller的availability共享解析、调用前/await后/返回前page与grant检查均为原迁移补齐；现有UiHost invoke尚无availability，须补adapter，不能宣称已有。services.actions.availability不是等价安全备选，已删除。S95本人离页cancelled、withdraw forbidden原样贯穿元数据与调用链，不改成统一错误。

**当前具体WAIT是一项用户选择、两个选项**，由根与准备齐的产品事项合批提交，不在本书直接问用户或发grant：

- **A：批准Feed安装取得Home判断规则管理能力**。精确五动作开放plugin；可读本Home全部定义、草稿/已发布记录、样本及试跑，修改任意可编辑草稿、试跑并发布，不限当前项目/自己创建/某次本人点击。持同grants的Runtime代码也可调用，preview可产生判断服务费用但不执行建议业务操作。functions:manage声明可选、依现行host-build政策默认开启，之后本人可在权限设置关闭；不承诺逐安装先弹窗。其他满足相同声明/授权的插件也遵循同一plugin受众合同，不按Feed白名单开放。不开放delete/sample/context等其余动作。只有明确批准这完整范围及发放方式后实施，批准后不重复索取同一授权。
- **B：不给Feed这项Home管理权**。改由Functions可信本人编辑面完成编辑/预览/发布，再带回已发布引用供Feed保存规则；这改变原内嵌创作体验，也须用户明确接受，不能自行用B绕过A的权限选择。未选前两者均候选，原搬迁授权不自动包含任一新增含义。

“只允许Feed自己的草稿”或“每台安装先弹新增权限、默认拒绝”都不是A的当前含义/现成机制，本书不新增第三分支、不造record owner/第二授权账。账号选择仍依T121实际采用及原user-only slot合同；资源审批独立WAIT。修订完成仅表示书面边界准确，无权限开放、实现、运行或安全通过结论。
