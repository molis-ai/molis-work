# PPT 迁 Plugin Runtime 实施计划（负责人：DSH；公共平台前置：主会话本线）

状态：只读方案，2026-10-18。基于 M=`wt-model-selection`（主会话指定已合main236f3a57d），未创建工作树、未改M或DSH文件、未构建/测试。唯一需求归 `specs/repository-anti-corruption/spec.md`；本文件供根接受并合入该spec，PPT已由用户明确申领归DSH，正式实施由DSH按交接推进；本线只负责公共平台前置。Dataset亦由DSH负责，不复制/依赖其在途内部实现；本案参照已在M存在的Form及公共合同。已读取PPT README/实际调用链、Runtime迁移手册、molis-plugin-dev与molis-prologue-ai相关规则。

## 1. 结果与真正前置

目标：PPT每项目一个Runtime实例，仍使用唯一 `{home}/ppt/ppt.db` 的项目分区；界面、幻灯片ID/顺序/颜色/备注、固定成果及恢复、工作流交接、移动复制、JSON/PPTX导出均保持。删除PPT专用Host动作/HTTP装配。不是重做幻灯片产品，不引入富排版、Agent、后台队列或新存储。

大部分能力现已齐备：`services.database`、`model`、`artifacts.publish/head/readOwn`、Manifest路由及字节上限、项目删除既有owner。因此无需新数据库分区平台，PPT与Alchemist不同，它本就是一份Home表按project_id分区。

**一项必需的共享动作前置尚不齐备：从Pages按原caller读取。** 旧`apps/local-host/src/ppt-actions.ts`把原caller传给Pages公开content.list/read；PPT的text来源可没有pages:read，page来源必须由原caller拥有该权限。现`plugin-actions-client.ts`对外部invoke使用plugin audience+安装grants，Pages content.list/read及其内部pages.list/get只有user/workflow/agent/mcp，且控制参数只保留原效果检查，不把原caller的子动作权限带入。单加consumes不能等价迁移，直接加plugin audience又可能把安装授权当人授权。

推荐先补一个**原调用下、声明过的跨插件query委托**窄接口，再迁PPT；依现ActionClient执行，不开第二个平台。具体合同由根先接受：例如PluginActionClient新增`invokeQuery(reference,input)`（名字可统一），从真实currentPluginAction取得原caller，校验本安装活动及目标所需安装grant、清单consumes中的capability id、传入ActionReference的version/可选provider与目标当前唯一query提供方、原caller对目标的权限/audience/允许动作、父与子注册代次；派出前及返回后复查，拒绝command/无scope/过期/任意caller输入。保留原caller身份，不伪造user、固定owner或用插件grants扩权。现`invoke`的plugin自主调用语义保持。`capabilities.consumes`现型是string[]，只限制id，不声称已有版本/provider白名单；精确版本与provider由ActionReference及当前目录核定。已核对的`bindActionClient`只携带原effect control，`required_actions`是入口前提声明，两者都不能替代原caller与consumes的双重约束；若实施时公共主线已补等价委托，直接复用，不再新增接口。真实页面入口还须修通：pluginHostActions的own action caller目前由安装重建、allowed_actions仅own+required且assertAuthority拒外部引用；不能只取currentPluginAction.caller便宣称HTTP委托已成立。共享前置须在可信HTTP入口保留原用户授权与请求/项目边界，并在Runtime里与父scope、安装grant及consumes取交集；不得清空allowed_actions或无条件把Pages设为outline必需动作，text-only不依赖Pages。Pages content.list/read内部仍调用pages.list/get，真实子链须保留原caller限制，不复制或绕开底层读取。只为Pages传入两个引用，返回使用现WorkflowStartItem/WorkflowPayload合同，必要的owner action引用放公共合同，不能把Pages插件实现import到PPT，也不能复制一份Pages完整schema。

另一项是**硬前置：复用S已有公共模型结果validateResult合同，先集成到实施基线**。M当前PluginModelResult没有最终提交校验，S的公共成功结果与失败已带同次配置/调用guard；不得复制S私有实现或新增另一API。PPT保留完整结果或窄{text,validateResult}端口，在database.transaction已完成授权等待后的同步callback内、首条业务SQL前调用validateResult，再做版本检查和写入；不能照现Form把模型结果降成text丢掉guard，也不能只在调用stores.write之前验证。该守卫只属原action，不跨调用缓存。没有此公共合同与相应真实配置交错证据不得启用AI迁移，不保留降低到M传输期保障的实施选项。

## 2. 当前数据、入口和行为

- `plugins/native/ppt/src/store.ts:218`唯一 `PPT_STORE_BASELINE` v1（user_version），表 `presentations`、`presentation_copies`；pending JSON原样保存。`PPT_HOME_STORE` path=ppt，现catalog owner已为PPT；库名、列顺序、版本、数据均不迁移。增加 `PPT_DATABASE` 声明复用此schema（store_name ppt、read ppt:read、write ppt:write），不另列同SQL字符串。
- 项目实例登记在`apps/local-host/src/project-plugins.ts:homeLibraryPlugins()`，与Form同路；builtin目录仍personal=true/workbench pack/home_store/project_data，不误改Home实例。provider_id仍io.molis.work.ppt；安装/停用代次归Runtime。
- 当前`project-host.ts:181`注册pptActionProvider；`ppt-actions.ts`每次开关Store并绑定Pages/模型/成果；`ppt-native-plugin-http.ts`+`web-request.ts:213`+`web-catalog.ts:110`服务项目页和首页入口；`native-plugin-api.ts`把短别名转旧HTTP。全部旧PPT专用链同片删除。
- 当前动作在`actions.ts`：list/get/create/update/delete/export/promote/pptx/outline/outline_ai/outline_pages，artifact preview/pin/compare/continue、placement move/copy、search entries/files/subject；`content-actions.ts`另有content.list/read/receive/create。subject_kind已经使用合同PPT_SUBJECT_KIND（presentation），历史spec“两套种类”不当成未做的新任务。
- `promote.ts`三事实步骤：持久intent→成果固定→关联完成。actor隔离、原快照/source_version、后来编辑不覆盖、移走又移回按artifact head继续版本、固定成果损坏/他人producer拒绝。新实现必须保留，不用一次横跨两库的假事务抹掉部分成功。

## 3. 唯一 Store 与提交边界

`PptStore`改依赖公共get/all/run窄SQL；仍只有一个领域实现。新增PptStores `{ read(run), write(caller,run):Promise<T> }`，runtime write用database.transaction，读用只读reader。当前Store内部BEGIN/COMMIT移到外层授权事务；delete、relocate、duplicate、receive、beginPublication、completePublication各自仍原子，receive内create+update+receipt同一个tx。`changes`按Number核1，reader无行null显式处理，不强转成原driver。

既有openPptStore如果被测试/离线owner使用，可像已合Form保留同一Store的本地连接适配（相同SQL/领域逻辑），不得加新RuntimePptStore或“有新参数用新、否则旧driver”的双模式constructor。生产Runtime不从Home路径开库，不调用close；清理owner仍clearInExistingHomeSqlite只对已有v1库操作，库不存在不创建。

action mutations统一await stores.write(caller)。createArtifactContinue的create+payload验证/update放同事务，失败零空deck，不再用跨事务delete补偿。move/copy继续由共享placement binder核from/to与请求幂等，不能把业务输入project当可信实例项目；Home-wide查询仅用于已存在的moved判断，不扩大读取正文范围。

promote改async：读当前/head/版本→write事务记intent→复核原caller同步有效后publish→write事务完成关联；每次await后核原授权，publish前也核。第二/三阶段失败保留实际已发生intent/artifact，下一次明确授权恢复；启动、list/get不自动publish。原actor只能恢复自己的intent。并发promote或其它项目实例并发编辑时，以原记录/intent/CAS和artifact immutable版本冲突决定，不能复用等待前已过时的预期版本。

content.receive用workflowDeliveryKey，同tx保证失败无半份deck/重复receipt；content.create同样授权写。导出纯查询，不因runtime接入修改内容格式。read接口不通过伪writer隐式写。

## 4. 插件装配、AI与Pages等待

新`src/plugin.ts:createPptPlugin()`要求必要grant及database/artifacts，组装stores、actions、ui contribution和routes；不保留Home路径/凭据/Host completeText选项。PPT_INSTRUCTIONS在原catalog继续唯一登记，definition如按既有项目插件约定需instructions则沿同一数据源，不复制提示词。prompt正文不改。

AI接`services.model.complete(instructed(PPT_DRAFT_OUTLINE,{text…}),{signal})`，沿默认配置和现120秒/5000tokens，不新增独立模型设置。model availability继续区分没有模型与原caller未获AI动作权限；不能因availability探测开密钥/跑模型。outline_ai仍concurrent+metered，后续提交用最初读取deck.version、冻结input.id/text/page_id/replace及输入副本；读取Pages/等待模型/数据库前后取消、原权限撤销、provider重登记、安装停止均拒绝。仅未replace且已满40页的deck先拒绝，零模型；非空1–39页仍可追加，空返回不写；title-only页保留，只有标题/要点/备注全空的唯一starter可填。

本地outline虽不调模型，也会等Pages；应按当前外部等待约束声明concurrent（目前只有outline_ai有），防嵌套动作排队和编辑阻塞。outline_pages是query，采用共享原caller query委托，保留无Pages/无权限的空列表+原因合同；权限拒绝不能转成成功写。Pages原始正文跨await之后只用于此次接受输入，deck版本变化明确conflict。委托前置保证原caller pages:read及allowed actions受限，不能由PPT安装全grants补权。

## 5. HTTP与客户端

新Manifest routes使用完整插件id `/api/plugins/io.molis.work.ppt/presentations` 下11条（collection GET/POST，outline-pages GET，/:id GET/POST、delete、export GET、pptx GET、promote、outline、outline-ai）。静态outline-pages在/:id前，所有POST声明`max_body_bytes: 1_000_000`：当前native默认是1000000，项目Runtime默认256000，遗漏会收紧现合法长deck。UTF-8按字节，超限413，坏JSON400；不要同时改业务40页、12要点、2000备注、20000文本等限制。

route handler仅bindPluginActionRoute参数映射；query/body project_id若仍带必须等于可信context.project_id，所有重复project参数应由现Host归一化边界拒绝/核对，不能最后一个覆盖掩盖不一致。GET expected_version仍数值校验。完整action结果仍JSON/base64导出，不改二进制路由。

client当前request只拼query/body project且走`/api/plugins/ppt`；改为一次统一base `host.route('/api/plugins/io.molis.work.ppt/presentations')`，保留原AbortSignal、保存队列、冲突草稿保护和对话框attempt/editRev校验。root catalog与项目页都必须真点通，不仅在测试替换字符串。旧专用HTTP和export删后旧短路径不继续由PPT提供；不加alias兼容表。nativePluginApi现由catalog派生别名可能仍含project插件短名，但不能据其字符串断言旧路由可执行，真实请求证明无旧handler即可；不要扩大修改所有原生路由。

客户端806行已巨大单元、ppt.js现31055字节门禁：优先替换统一base减重复路径；若为必要实现拆函数只做本片相邻内容，不进行整个浏览器TS重写，不提高资源预算/巨大单元基准。

## 6. 生产文件、导出及调用方

允许PPT文件：plugin.ts（新增）、manifest/actions/store/promote/content-actions/search/route接线/client/index/README；project-data只随唯一baseline引用必要改动，pptx/parser/颜色算法保持。

Host共享热点由根排串行窗口：project-plugins增加factory/PPT_DATABASE/releaseArtifact；project-host删provider；web-request/web-catalog删PPT专用route/import；index删handlePptNativePluginHttp导出；creative-artifacts仅删PPT函数/import，保留Dataset/Pages其它行。删除ppt-actions.ts、ppt-native-plugin-http.ts。Workbench仅PPT目录条目必要调整，home_store/project_data维持。实际包依赖已含PPT，无需新增workspace包。

公共导出增加createPptPlugin/PPT_DATABASE/PptStores；PptActionPorts withStore→read/write、promotePpt同步→Promise是包API变化，全部调用方同片改。删除旧PPT_NATIVE_PLUGIN_ROUTES/PptPluginRouteTable/createPptRouteHandlers及相关type、Host HTTP导出；不要为了旧测试保留无生产用途路由层。保持PPT动作id/现v1输入输出，加入artifact:read清单以用head/readOwn，调用方真实权限在动作提交链保持。outline scheduling变化及新增required/consumed query声明刷新动作快照；若修改公开形状按合同规则升版本，不仅改snapshot。新委托公共API必须先走共享前置spec/API快照及安全测试。

已检索需同步适配的旧导出消费者：tests/fixtures/ppt-actions.ts；ppt-actions、ppt-mcp、creative-tools-plugins、creative-artifact-promote、document-plugins-error-model、document-plugins-limits、action-before-effect、content-owner-regressions、artifact-compare-moved、work-placement、project-deletion-owners、ppt-actions.e2e、content-editing-regressions.e2e。其它Host动作调用（Goal pin、workflows/placement/search/context/侧栏）保留公共id并做相关回归；不新造MCP名单。ppt-mcp-server目前多进程各自Host共享Home，是明确fixture，不能用它替代实际停用代次/路由证据。

结构文档由根更新：冻结门禁PPT移BUILD_TIME→RUNTIME且native HTTP名单删PPT；spec§5.1包清单、SSOT/RUNTIME-MIGRATION、README与API/动作快照/health快查。不更改门禁脚本或阈值。删creative-artifacts共享文件里的Dataset部分禁止；DSH合并后以实际新基线复核，只改PPT段。

## 7. 编号验收和证据缺口

以下编号并入唯一spec，测试名/注释标识。当前只有源码存在证据，未在本轮运行任何测试；README回归不能被描述为本次迁移已通过。

- PPT-RT01：真实项目Runtime安装/重启，provider稳定PPT id、route/actions注册一次；项目A/B实例共用原v1库而正文隔离；原已存slides/colors/timestamps/artifact/pending JSON不被重写；无Home/sandbox无库；停用后旧client/handler拒绝，新实例正常。
- PPT-RT02：CRUD/edit expected_version/receive和copy receipt真实原子性；两个真实实例并发同版本只一次成功；继续artifact无效payload不留空deck；移动/复制不读取别项目正文，移出再回来head续编号。
- PPT-RT03：三阶段publish分别故障，intent+artifact+关联真实状态可读；重启不自动写，原actor明确恢复同版、后编辑保留；错误producer/type/schema/body/返回id拒绝，Goal pin/compare/continue仍工作。
- PPT-RT04：Pages真实query委托：原caller少pages:read/allowed target、来源provider停用/替换、原PPT停用/撤权/取消均不写PPT；读取等待中修改PPT deck导致expected_version冲突。Pages来源按本次read返回的正文快照使用，后续编辑来源不新增跨等待revision锁或重读比较；只给text无pages权限仍可工作。query委托拒command/无scope/伪caller。
- PPT-RT05：真实Runtime model path与生产SDK替身：dispatch前/等待中/业务提交前分别撤权、停用、model/provider配置变化、超时/取消，零迟到成功/失败业务写；空输出/40页满零不当请求；正常一次准确保存且保留title-only页。M未提供最终validateResult窗口须等S公共前置集成并在事务内首条SQL前验证，不能降级或用假completeText覆盖该结论。
- PPT-RT06：真实HTTP root+项目页面新路由，合法超过256000且≤1000000 bytes的deck请求成功；>1000000拒413且无写，坏JSON、跨项目body/query拒绝；断开中止前台outline。JSON/PPTX下载内容真实完整，notes/颜色/顺序在文件中保留；旧专用handler不可调用。
- PPT-RT07：真实MCP发现/读写权限/项目隔离/固定成果恢复，工具id不变；真实项目删除清PPT及receipt，库不存在不创建、重复无副作用、其它项目不受影响。
- PPT-RT08：浏览器生成框关闭→编辑→迟到回执不覆盖草稿；重开弹窗不被旧回执关闭；版本冲突阻止发布/导出/离开；无模型→model-ready刷新；工作流接收、侧栏/search对象打开仍正确。工程测试与真实产品实操分列，不宣称用户验收。

实施后根排构建/浏览器时段，先整体 `pnpm build`；定向命令按当前文件名：

```
node scripts/run-tests.mjs tests/ppt-actions.test.ts tests/ppt-mcp.test.ts tests/creative-artifact-promote.test.ts tests/document-pin-after-move.test.ts tests/artifact-compare-moved.test.ts tests/project-deletion-owners.test.ts tests/document-plugins-error-model.test.ts tests/content-owner-regressions.test.ts tests/document-plugins-limits.test.ts tests/action-before-effect.test.ts tests/creative-tools-plugins.test.ts tests/work-placement.test.ts
node scripts/run-tests.mjs tests/action-model-scheduling.test.ts tests/plugin-model-service.test.ts tests/prompt-registration.test.ts tests/builtin-plugin-assembly-gate.test.ts
node scripts/run-tests.mjs tests/ppt-actions.e2e.test.ts tests/content-editing-regressions.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts
pnpm boundary:check
pnpm test:contracts
pnpm workspace:build
pnpm page-assets:check
```

新Runtime/委托拒绝测试另列入该批；API/动作有意变化后按要求`pnpm api:update`、build后`pnpm actions:update`，health用`--base origin/main`。共享前置改contracts/SDK需按仓库规则由根集成跑全量，PPT writer不自行启动第二份全量。当前无依赖安装/构建/测试通过声明。

## 8. 开始条件

用户已定项目实例、原Home库、身份与权限语义，不需重新问。本线先交付共享query委托与S最终模型校验公共合同的集成证据，根将本案编号写入唯一spec后交DSH实施PPT。未满足时可先实施PPT纯Store/路由准备提交供审，但不能启用丢Pages权限语义的半迁移生产入口；不以删除Pages来源功能缩小完成范围。
