# PPT Runtime 计划独立复核

2026-10-18。只读检查 `ppt-runtime-plan.md`、M当前调用链及S在途公共模型结果合同。未改M/S/源码，没有构建、测试或Chrome。本报告评审尚待接受的计划，不构成实现授权。

结论：单Store异步迁移、保留Home共享库中的project_id分区、三阶段发布及同片移除旧Host入口，整体方向正确。两个公共前置均真实存在，不能用现Form接线直接复制替代。query委托的真实页面入口还缺一段信任接线，是当前P1；模型前置应明确依赖S已有公共合同并把最终校验放在SQL提交同步段内。另有两条验收措辞应纠正，避免无意改变产品行为或增加Pages修订协议。

## P1：只从 currentPluginAction 取caller仍不能打通真实PPT页面→Pages

已核实调用链：

1. 旧 `apps/local-host/src/ppt-actions.ts` 把真实caller用bindActionClient原样传给Pages content.list/read，故Pages仍按人的audience、权限、项目与allowed_actions检查。
2. 新Runtime页面走SDK route→`pluginHostActions` ownActions。`apps/local-host/src/plugin-actions-client.ts` 的actionCaller会重建caller：audience=user、permissions=context.grants、allowed_actions仅本插件动作+required_actions；assertAuthority看到非本插件动作直接拒绝。它不是可以再拿去调用Pages的原外部授权上下文。
3. 普通services.actions.invoke对consumes外部调用改用plugin audience，Pages content与底层pages.list/get均只收user/agent/workflow/mcp。计划正确识别不能简单改成plugin audience放行。
4. 即便新invokeQuery保留scope.caller，第二步的allowed_actions/校验闭包仍会拒Pages。反之清掉allowed_actions或换成安装全grants会扩大原调用权限。把Pages列为outline/outline_ai无条件required_actions也不是修复：Kernel dependencyAvailability在父动作可用性阶段检查所有required引用，text-only输入不应因Pages未启用而不可用。

接受前应把共享前置写成完整链：可信入口把可用于目标query检查的原授权保留下来，Runtime内部获取并组合父动作scope与这份委托权威；外部插件不能传caller/control/项目来构造它。只接受当前目录确认的query目标、匹配consumes、当前安装活动及其相应grant，保持原audience、actor、project、allowed_actions/allowed_capability_ids和动态验证；原caller或插件任一边撤权均拒绝。具体是否在现内部scope扩一份可信委托上下文由共享前置决定，不必先发明通用“以用户身份执行任意动作”API。

Pages content.read内部还调用pages.get，list内部调用pages.list。测试必须穿透这层，不能仅mock第一个query返回：PPT只声明消费公共content引用，Pages内部继续使用自己公开合同，但不能让caller允许content不允许底层get时绕过其限制，也不能把PPT consumes扩散成所有Pages动作的通行证。父/子原注册被替换的等待交错要按Kernel现registration检查钉住，不能只在前后按同id重新发现成功就认定同一提供方。

`capabilities.consumes`现型是string[]（plugin.ts:225），不是带version/provider的“精确consumes引用”。最低改动是consumes约束id，调用的ActionReference与实际唯一目录约束version/provider及operation=query；若真的需要版本化声明，必须明确作为共享合同变化，不能假称现类型已具备。PPT引用可从现公共workflow content工厂/合同获得，避免为两个引用复制Pages schema或新建完整Actions目录。

必要增补验收：真实Runtime HTTP页面成功读Pages；同一页面走text-only且Pages停用仍可生成；真实MCP/agent受限allowed_actions不能借PPT多读；PPT的可选pages:read安装grant撤回但原caller仍有时拒绝；原caller无pages权限但插件已grant时也拒绝；Pages content→get子链按限制工作。无scope、串改caller、command目标、另install、旧父调用/子provider均拒绝。不要仅以直接Kernel调用PPT的测试代替真实页面入口证据。

## 模型最终提交：复用S公共合同，禁止丢失guard

M `PluginModelResult`确无validateResult；S `packages/contracts/src/platform/plugin-model.ts`已公开成功结果`validateResult():void`及失败可选guard，Runtime model-service绑定原action scope/权限/安装，Host host-complete-text绑定原模型快照；S README已经要求beforeEffect之后、同步提交前调用。它是一份可合入共享基线的公共能力，不需要PPT再加“revision/token/validateModel”第二API，不要复制S私有实现。

PPT的完整接法应明确：保留模型结果对象或窄 `{text,validateResult}` 端口；await stores.write的database.transaction授权后，**在同步transaction callback内、第一条业务SQL之前**调用该结果的validateResult。仅在调用stores.write前验证仍有授权等待窗口；只在model.complete返回后验证也一样。现Form plugin把result映射成text，不能照搬到PPT丢掉guard。守卫不能跨action缓存，失败也不为了提示而写业务状态；PPT现AI错误直接返回，不需额外新建失败记账。

计划已把这项标为前置，不应再提供“只保留M传输期保障”的实施出口：根的最终提交政策已定，就等公共前置合入/验证。校验正常、取消、provider配置改变、安装停用与数据库beforeEffect barrier交错；注入completeText的Host替身没有真实配置快照，不能证明配置变化这一项。默认120秒/5000tokens与现公共PLUGIN_MODEL_LIMITS一致，无需新增PPT模型配置。

## Store / 发布 / 数据库：可按现框架完成，不需新平台

- PPT现一份ppt.db以project_id隔离，与Alchemist项目分库不同；PPT_DATABASE复用PPT_STORE_BASELINE，项目Runtime各自持有同库连接符合当前Form模式。无需新增路径分区、迁schema或双Store。read适配只提供get/all，写适配显式transaction；本地owner/测试适配委托同一领域实现即可。
- 需要按每个mutation同步迁移全部调用方，包括artifactPin现同步解构promote、placement回调、content.receive/create及search。仅把promote改Promise而漏artifactPin会返回undefined字段；计划已列调用方，验收应落到真实公共动作。
- 发布保留intent→artifact→complete三个事实，失败保留已发生状态，重启/list无恢复写是正确选择。事务回调内重新核原记录与expected version/pending intent，而不是使用等待前快照。最后完成原pending时可以保留其后用户编辑的正文，不能因“CAS”口号把既有恢复策略改成一律覆盖或拒绝；对照现beginPublication/completePublication逻辑迁移。
- artifacts.publish/readOwn/head可沿公共服务，但producer/type/schema/body校验必须与旧creative-artifacts对应；不能只信返回id。不要引入跨PPT库与Artifacts库的假事务/补偿平台。
- 现PluginDatabase.transaction只等待beforeEffect再开同步事务，PPT stores.write需提供原caller最终同步检查；如果提交还依赖模型结果，则再加上述同次结果检查。不能因为Host只读/写grant检查存在就忽略原调用authority。

## 需要纠正的两处行为/验收措辞

1. 计划§4“完整deck未replace且非空时先拒绝”容易被实现成任何非空deck都不能追加。现`assertRoomForOutline`只在非replace、非唯一空starter且已满40页时拒绝；1–39页可以追加，title-only页不是空starter应保留。明确保持现语义，模型请求前满40页拒绝，不新增非空拒绝。
2. PPT-RT04把“在read barrier改稿”与撤权并列要求全部不写PPT，但现WorkflowPayload只给title/body，没有Pages revision校验合同；计划正文又要求按已接受来源文本生成。若是改PPT deck，明确写PPT expected_version冲突；若是改Pages源文，现行为是读取时返回的文本快照，不应未经决定新增跨模型等待的Pages版本锁/重读比较。保持正常来源快照语义，权限/提供方变化与内容后续编辑分开验收。

## HTTP、入口与范围

11条新Manifest routes、保留每条POST 1,000,000字节上限和业务文本限制方向正确；一般Runtime默认256,000不能悄悄收紧。root catalog与项目页都应走一次统一host.route，真实请求验证跨project/重复project参数与坏JSON/413，而不是只比路由字符串。重复query归一化现有能力须核实际Host入口；若不存在，相邻通用入口最小拒绝可以做，但不要在PPT私自选择最后一个参数掩盖冲突。

同片删除ppt-actions/ppt-native-plugin-http和注册/路由/导出，保留catalog UI、原Home owner、project_data及PPT动作id，符合最小切换。creative-artifacts只删PPT段，不碰在途Dataset；Form仅作结构参考，不把它的任何潜在授权缺口扩成此片额外重构。公共前置先集成，PPT再以接受后的真实基线实现，不独立复制API。

当前没有运行证据，也没有Blocker性质的产品待决；P1为共享委托实现链尚不完整。补清上述链路与验收后，可把计划转入唯一spec；最终模型guard作为硬前置，不降低验收。
