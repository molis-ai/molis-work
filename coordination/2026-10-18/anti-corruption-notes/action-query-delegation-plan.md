# 原调用者的 query 委托：公共前置实施草案

负责人：主会话本线；消费者PPT归DSH。状态：只读候选，2026-10-18；尚未写入唯一spec、未实现。基于M当前main同步后的代码读取，S仅核对现公共validateResult差异。没有修改工作树源码、共享spec或DSH文件，没有构建/测试。

## 1. 要交付的最小行为

插件正在执行自己的真实动作时，可通过一个窄方法调用已声明consumes的外部query；用户/Agent/MCP的身份、项目、audience、allowed_actions与动态授权均不变，同时受到来源插件manifest/grant与实例寿命的约束。此接口不给“作为本地用户任意执行”的权力，不接caller/control/路径，不调command，不替换现actions.invoke的plugin自主消费语义。

第一消费者是PPT前台outline/outline_ai的Pages来源及outline_pages列表。共享前置用独立真实Runtime消费者fixture调用现Pages content动作证明，不改PPT实现。无后台任务、恢复/持久授权、token registry、第二动作目录、复制Pages schema或新增业务动作。

## 2. 已核实的实际链与缺口

### 外部原调用直达Runtime

Agent/MCP/工作流 → Host ActionClient → Kernel ActionService → Runtime action-provider的runInPluginAction → handler。scope.caller是Kernel原执行上下文，已有actor/project/audience/permissions/allowed_*、beforeEffect、最终同步assert与retainAuthority。直接使用它可以保留外部限制，不得替换成安装全grants。

### 实际HTTP当前丢掉的部分

- 项目页面与catalog的`/projects/<id>`项目路由由web-request创建CodingSurfacePorts，再经coding-surface.handleCodingPluginHttp、dispatchRuntimePluginRoute、SDK bindPluginActionRoute调用services.actions.invoke。
- coding-surface当前只传installation grants与pluginRouteControl。`pluginHostActions.actionCaller`重建audience=user、permissions=context.grants、allowed_actions=own+required；其assertAuthority拒绝非本插件定义。因此只新增invokeQuery并读取scope.caller仍无法读Pages。
- Home Runtime入口home-plugin-http已计算localWebActionContext，但只取permissions用于route grant检查，完整caller没有进入动作；Home挂项目的projectRouteControl另有既有WeakMap保存client/project有效期。
- localWebActionContext是现有可信本机用户授权入口：按真实已登记目录、安装grant及原generation确定allowed_actions，动态validate_authority复核原owner。它只适用于已通过Host/Origin/token检查的本机HTTP，不能用于Agent/MCP。

### Pages真实两层query

`pages.content.list@1` → `pages.list@1`；`pages.content.read@1` → `pages.get@1`。生产文件`plugins/native/pages/src/content-actions.ts`通过bindActionClient(actions,()=>caller)调用内部动作，保留caller；外层还用retainActionAuthority保留原content动作的检查。两层均是query，audiences为user/agent/workflow/mcp，要求pages:read。现workflow content工厂没有为这两个动作声明required_actions。

**required_actions不转授权。** Kernel dependencyAvailability仅检查依赖注册/可用性；pluginHostActions把required加入合成页面caller的allowed_actions，也不能代表原Agent/MCP获权。不能给PPT outline无条件required Pages：text-only不应依赖Pages存在。不能通过给Pages扩plugin audience或清空allowed_actions修复。

## 3. 公共合同草案

只给PluginHostServices.actions增加方法，普通BoundActionClient维持现合同：

```ts
export interface PluginActionClient extends BoundActionClient {
  /** Uses this installation's active action and its original caller. No caller/control input. */
  invokeQuery<Input = unknown, Output = unknown>(reference: ActionReference, input: Input): Promise<Output>;
}
// PluginHostServices.actions?: PluginActionClient
```

reference使用现ActionReference：capability_id、version、可选provider_id，不收ActionDefinition/调用者自报schema或operation。输入输出仍由Kernel目标当前schema校验；消费者按已有公共WorkflowStartItem/WorkflowPayload类型使用。consumes现为string[]，只约束id；版本/provider由引用与目录解析核对，不改consumes形状、不建另一schema表。

需要一个**只减权的调用上下文限制**在Kernel实际派发时保持query性质，建议在ActionCallContext加`readonly query_only?: true`，由此方法的内部派出上下文设置。visibleAction/availability核实际注册definition.operation为query，invoke/invokeSync共用现目录检查；发现与派发之间把同id/version重新登记为command也拒绝。所有本链spread/bind上下文保留它，Pages内部query继续正常。

这一个字段的理由是避免“discover看到query，await后目标换成command仍执行”的真实目录竞态；仅在Host手工检查ActionView.operation不是足够证据。它不是新权限或token，也不改变动作schema/version。若实施基线已有等价Kernel限制则复用，不再加字段。该限制只保证通过动作派发的目标是query，不声称隔离可信进程代码直接IO的恶意行为。

无需在公共API暴露retained子查询票据。内部复用caller.retainAuthority捕获目标注册，最终返回前仍检查；原父beforeEffect/同步assert始终独立检查，retain不延长父动作寿命。若调用上下文没有这项Kernel能力，明确拒绝而非恒成功兜底。第一片只要求PPT前台调用；现background-service特意去掉retainAuthority，不以此片为它补后台委托授权系统。

## 4. query方法内部顺序与信任交集

可以在现Host `pluginHostActions`旁拆一个小的`plugin-action-query.ts`，复用Runtime已导出的currentPluginAction。它是现actions client方法的实现，不新增另一个服务或executor。

1. 同步复制reference三个字段，验证形状；取scope，要求install_id匹配当前安装；实例active、当前父caller signal/assert、当前manifest声明consumes此id。没有scope、start/普通route/timer、另一安装或已结束ALS均拒绝。目标输入不承载任何身份。
2. 采用scope.caller的actor/project/audience/permissions/allowed_*。项目实例要求caller.project_id就是可信实例project；Home实例无project用Home client，有可信project时只用Host已知活动project引用对应的client，不从业务输入或裸数据库路径开新项目。所有路径保持原父beforeEffect作为父检查。
3. await父beforeEffect，再同步复核。用上述caller+query_only在现目录discover当前引用：id/version匹配，可选provider匹配，唯一候选且operation=query；无候选/歧义明确拒绝。保留该provider_id，本调用不改投另一个provider。
4. 目标声明的permissions必须在来源插件manifest内且实时grant存在，原caller也具备；动态validate_permissions/assert使用实际目标所需permissions再次检查，不能只在发现时检查旧权限列表。原allowed_actions与allowed_capability_ids原样保留，不加入目标、不清空、不以插件自己的allowlist覆盖。
5. 在当前父动作仍活跃时用现retainAuthority([pinnedReference])保留目标注册；这一步是子查询登记的接受点。接受后提供方卸载/重登记不得复活旧调用；注册不能仅按字符串id前后相等判断。实际invoke又受Kernel自己的registration token与query_only约束，发现之后、授权等待之中的替换均有拒绝路径。
6. 构造派出context：保留原caller字段、query_only=true；组合而非覆盖原validate_authority/validate_permissions/assert，使每个目标授权等待前后都复核父、来源安装及目标permission；原caller的目标检查仍执行。可复用retainActionAuthority固定父引用，但不能把它误当已检查consumes/安装grant。
7. await现ActionClient.invoke(context,pinnedReference,input)。返回前await父beforeEffect及保留目标guard，随后同步检查原scope identity/原caller/signal/实例grant/目标guard.assertCurrent，才交付结果。途中拒绝不生成业务写；本片没有失败记账/重试。

原父动作scope与子Pages handler的scope是自然嵌套：委托方法从父scope开始，子动作由现Runtime或native handler执行，await后回到父scope。不能把子scope当新的来源安装，也不能在后续新动作里复用旧guard。project/Home现session gate负责实例代次，不另造generation。

来源consumes只约束**本次直接委托目标**，不改成贯穿子链的allowed id单名单：否则Pages content→pages.get会被误拒。子链仍完全受原caller allowed_*、query_only、实际目标权限与已保留父授权限制；来源安装对实际被使用的权限持续requireGrant。不能自动把Pages内部id加给原caller。

## 5. 真实HTTP保留入口authority的最小接线

推荐复用`plugin-actions-client.ts`现routedControls WeakMap，扩为同一组Host创建的route control记录：除现client/ended外保存完整可信localWeb caller。不是新token registry；不序列化、不写Manifest/PluginExecutionControl公共caller字段、不接受插件构造的对象。记录只对原control对象身份有效，结束后ended拒绝；克隆同字段control不能取得authority。

- `web-request.ts`在实际Host/project reference处给CodingSurfacePorts一个私有`localActionContext(signal)`回调，调用现localWebActionContext(host,reference,LOCAL_OWNER_PERMISSIONS,signal)。这是已认证本机HTTP入口的组合闭包，不是可由JSON提供的端口。
- `coding-surface.ts`调用回调取得原caller，以现pluginRouteControl+实例/请求检查形成control，再在上述既有WeakMap登记完整caller与当前项目client。root standalone与catalog `/projects/<id>`都沿相同实际reference，调用finally结束记录与signal；非HTTP/没有可信入口回调的embedding不能借默认全grants得到delegate权限。
- `home-plugin-http.ts`保留其完整localWebActionContext结果，传signal；若允许读当前尚为native owner的Pages，按现已认证本机owner入口使用LOCAL_OWNER_PERMISSIONS，而不是只用[]再以插件grants补权。Home无项目仍不能读project query；挂项目时复用projectRouteControl的已验证路径/project存在与显示检查，并保存同一完整caller。
- `pluginHostActions`的**带真实Host route记录的own action调用**以记录中的原caller为底，保留其allowed_*与动态验证，同时加当前插件parent动作grant/active检查及原route control，不再把它换成own+required合成caller。actor/project须与现context、已验证route一致。普通invoke的外部plugin自主调用分支不变。
- Agent/MCP直接进入已注册动作，不走localWebActionContext或route记录。invokeQuery直接继承它们scope.caller的限制；所有原始工具/场景动态撤权仍走原validate与同步assert。不允许“发现自己无scope就当页面用户”fallback。

Home query方法需要选中原caller的现client时，最小可给HomePluginHost/Executor一个私有`clientForCaller`闭包，由MolisWorkLocalHost按自己已打开/核对的project reference选择actionClient或homeActionClient（可参照现systemFunctions同类装配）。只认scope里的可信project_id；查不到则scope_mismatch，不创建路径、不搜索任意磁盘。项目实例直接用自身固定client，不加第二解析器。如果实施只覆盖项目PPT，仍需Home负向验证无项目拒绝project target，不能静默把Home调用送到任意当前项目。

## 6. Pages子链与权限预期

成功的最小外部授权：PPT父动作 + Pages content目标 + Pages实现实际调用的pages.list或pages.get，各自现版本/provider；并持有所需ppt/pages/model权限。原caller只允许content但不允许pages.get时，现子动作应拒绝，不借“委托”增加引用；原来直接Pages content调用也如此。本片不修改Pages读取实现或引入新的内部免授权读取接口。

本机HTTP原caller由真实目录形成完整allowed列表，故可走两层；Agent/MCP只按其已授权列表运行。不能通过required_actions默默替人勾选底层引用。PPT的Pages依赖保持条件性：text-only不调用delegate，Pages停用不影响文本路径。outline_pages可以把Pages不可用投影为现空列表+原因，但撤权不能转成成功写入。

PPT只引用现公共workflow content工厂生成的list/read定义或公共ActionReference，使用现schema/types；平台不import Pages/PPT实现来判定权限。真实集成测试可以启动现Pages provider，以断言生产链。

## 7. 拟改文件与明确不改

| 范围 | 拟改文件/职责 |
|---|---|
| contracts | platform/plugin.ts（或同目录小型plugin-actions类型文件+统一导出）：PluginActionClient；platform/actions.ts：只减权query_only文档/字段；API快照由root生成 |
| Kernel | action-execution-context.ts的visibleAction（实际query限制），必要的同链context传递断言；复用ActionService与registration机制，不新建dispatcher |
| Host actions | plugin-actions-client.ts、小型plugin-action-query.ts：原scope委托、原route caller使用、consumes/grant交集、既有WeakMap扩展 |
| HTTP组合 | web-request.ts、coding-surface.ts、home-plugin-http.ts；plugin-route-control.ts/route-operations只在现端口传递需要时做最小修改，不加插件专用分支 |
| Host装配 | home-plugins.ts/home-plugin-executor.ts/project-host.ts提供Home可信client选择闭包（如需）；project plugin-host-services已有固定client，不扩大任意项目能力 |
| 真实验证 | 现action-authority/Runtime HTTP测试及新小型query委托fixture/安全测试；不复制PagesStore或PPTStore |
| 文档 | 唯一spec、安全不变量、contracts/Host/Runtime README、API快照由root串行维护 |

本片不改DSH/PPT源码、Pages动作schema/audience、模型validator、S文件服务、数据库、图像服务或门禁阈值。不为了加入一个方法将整个BoundActionClient升级成另一RPC层。现PluginHostServices测试替身需实现新增方法或使用窄Pick，不用恒成功delegate让拒绝用例失效。

## 8. 编号验收候选

- **AQD-01 原授权**：真实Runtime父动作委托现Pages content.read→pages.get成功；actor/project/audience均原值。原caller缺pages:read/目标allowed/底层allowed、来源安装缺grant或未声明consumes分别拒绝，Pages/PPT无写。
- **AQD-02 生命周期**：父beforeEffect、目标授权等待、返回前等待分别撤销原MCP/Agent授权、停用来源、重装来源同id、停用/重登记Pages同id；迟到结果不交付。原scope结束后晚到timer与另install调用拒绝。
- **AQD-03 只query**：直接command、伪造operation/schema、发现query后同id/version改注册command均拒绝且command handler零进入；目标子链仍保留query_only。引用缺失、版本不符、显式provider不符、歧义均拒绝，不退回其他provider。
- **AQD-04 真实HTTP**：standalone root项目及catalog /projects/id的Runtime路由均通过原localWeb caller读Pages；伪造/克隆control无委托权；query/body项目不改身份；断开、隐藏/停用插件后拒绝。Home无project不能读project query，Home挂已验证project按原scope工作，未知project不新开库。
- **AQD-05 MCP/Agent**：真实受限MCP只授权PPT无Pages时拒绝，补齐原grant后成功；allowed仅content缺pages.get仍拒绝；撤权期间不因安装全grant获权。不调用localWebActionContext替代外部身份。
- **AQD-06 条件依赖**：fixture的纯text分支在Pages未启用/未grant时仍成功；Pages分支明确不可用；required_actions不扩权，无需给父动作新增无条件Pages依赖。
- **AQD-07 回归**：现actions.invoke外部plugin audience/consumes行为不变，own route命令仍受原route signal、父权限与安装grant；无scope服务调用不能作为owner直接delegate。公开API只新增计划范围。

测试必须调用真实Kernel/Runtime/Host route或MCP，记录handler进入次数与实际拒绝，不以mock invokeQuery返回数据作主证据。Root排整体build、相关安全/合同/真实HTTP批次；本计划没有任何通过声明。

## 9. 版本与依赖交接

PluginActionClient新增方法及ActionCallContext字段是公开TypeScript API变化，更新API快照和所有必要调用方；不改变任何现动作输入输出schema，不为此升Pages/PPT动作version。query_only只限制调用上下文，不是业务输入参数。PPT之后新增consumes与outline scheduling由DSH更新manifest/动作快照；若DSH有意改变动作形状再按规则升version。

模型结果校验是另一已存在的S公共前置：先合S的PluginModelResult/Failure.validateResult、Runtime/Host快照实现与已核证据，PPT事务内首SQL前消费；本query片不再实现模型guard，也不以临时回调替代它。

建议根接受后并入唯一spec，先共享query与HTTP原授权fixture→验证→交DSH接口/边界/示例→DSH迁PPT。方案中的query_only及可信route caller是具体必要合同，不宜在PPT功能分支私自加；若根选择已有等价机制，应替换同一草案而不是并存两套。
