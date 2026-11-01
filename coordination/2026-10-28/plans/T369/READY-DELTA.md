# T369 alias 等待点只读接线差量

状态：准备完成，**T369仍WAIT**；只读待采用T384 H=`4404e142662cbd7895f46c1c6df6e5efe5e6e135`，不是已采用main。唯一合同沿用 [tasks/T-369.md](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-369.md)，原RAC2764～2766和唯一新增测试路径不变。未建作者树、运行测试、改生产/coord/GH/编号。完成本差量即停止准备，后续准确基点由根给。

**结论：现有公开接口足以构造可定位的alias deferred屏障，不需要生产测试API或私有导出。** 以下是静态可执行设计，尚未编译/动态验证，不能写成已复现。

## 准确调用链

`apps/local-host/src/mcp-server.ts:58–103` 的构造参数 `withMolisWorkProjectCatalog` 是传入的 `LocalWebCatalogRunner`（该名字是参数，不是绕过注入的import）；linker闭包调用它，再提供 `aliasTerminalSession: async input => await catalog.commit(() => catalog.terminalPanels.aliasSession(input))`。

公开 `createRuntimePanelSessionLinker` 在 `runtime-panel-session.ts:5–15` 去空白并要求host、非空panelId/nativeSessionId，await provider.withCatalog里的真实alias。`callToolResult:237–255` 顺序是ensureCatalog→捕获`connection=this.runtimeConnection`→assertMcpToolAllowed→本地await linkPanelSession→find真实action entry→**比较runtimeConnection引用**，不相同则精确`mcpErrors.context_changed`→authorizedActions→dispatch。目标是第250行这一个action分支，不是forwardContext/checkContext的其他raiser。

LocalMcpServer、MolisWorkProjectCatalog、MolisWorkLocalHost从local-host公开包取，desktop公开`withMolisWorkProjectCatalog`负责真实catalog生命周期；app-host公开RuntimePanelCatalogApi/Provider和RuntimeTerminalSessionAlias。LocalWebCatalogRunner未在local-host根直接导出，可用 `ConstructorParameters<typeof LocalMcpServer>[0]` 取现有公开构造参数类型，不深引web-project-settings。不要只测公开linker本身，它不能证明LocalMcpServer的后续引用复查。

## 最小真实夹具

1. 独立临时Home、真实catalog创建项目，真实Host与项目reference；按现有 `tests/action-gateway.test.ts` 的公开Host registry路径登记一个可由mcp调用、无外部依赖的fixture action，handler只计数并返回固定值。正常权限/目录发现不得替换。可选用权限为空的mcp query来避免伪造授权；若复用有权限动作，必须走真实grant流程。构造server时不给actionServiceUrl/ensureResident，显式注入host、非空project connection及runtimeContextHost。
2. host字段取可信测试侧：同一home、`panelId`、runtimeContext.runtime_id（例如codex）；callContext给非空合法`runtimeSessionId="019a-b2"`、相应真实来源标识。用公开catalog的`commit`＋`terminalPanels.insert`创建合法panel记录（install/project/actor/key/subject/runtime/command/args/title按公开参数类型），不写SQL、不造旧DesktopPanel，不需要启动PTY/外部Agent。insert会按原owner建立记录/工作上下文，aliasSession会调用真实bind并写host_session_id；在屏障到达时公开get读回精确panel/session作为alias确已发生的证据。若现有公共fixture能提供相同记录，直接复用而不引入私有import。
3. 先经公开 `server.handleMessage` 的MCP `tools/list`路径确认目标action tool name存在；工具名由`molisWorkActionToolName`生成，不能任填一个未知tool。此发现阶段不arm屏障。真正callTool才arm一次，避免把首次catalog/Host配置当成alias entered。

## 屏障应放在哪里

在测试的runner适配器里继续调用真实desktop `withMolisWorkProjectCatalog(options, catalog => operation(proxy))`。proxy只透明包装该真实catalog的两个**公开**成员：`commit`及`terminalPanels.aliasSession`，其他成员/方法绑定真实接收者，保留同一catalog/db与实际事务。类型分别从callback推断的catalog及`typeof catalog.commit`、`typeof catalog.terminalPanels.aliasSession`取得；不使用any/as unknown as、不访问private字段或复制catalog。

- aliasSession包装只观察精确 `{panel_id,runtime_id,host_session_id}`，调用真实方法一次并返回真实返回值；记录该次commit确实包含目标alias。不能以所有commit都算alias，也不能吞`actions.missing`并冒称成功。
- commit包装先 **await真实catalog.commit原操作成功返回**；仅本次已arm且观察到精确alias时，记录返回/持久panel/session，触发entered，再await普通deferred release，最后返回真实commit值。屏障因此落在 `aliasTerminalSession` 的async Promise尚未settle、上层linker仍await的位置，且事务已结束；不持SQLite写锁等待控制端，不改alias存储或运行结论。
- Proxy必须将普通方法bind到真实对象，aliasSession也以真实terminalPanels作this；每次commit的观察标识局部化，后续正常调用不会误复用旧entered。没有必要改aliasSession为async或返回一份伪成功；它实际同步写后由现有async wrapper形成等待边界。

这是可控异步port适配，非完全无替身：仅延长真实commit已成功后的Promise返回时间，不替Host/Runtime/授权/alias业务写。代码实现若泛型commit或Proxy不能在公开类型下表达，先报告具体TS位置；不因此扩大生产接口。原书允许只测公开层并明确接缝性质。

## 两对照、精确拒绝及变异

**正常对照**：调用公开`server.callTool(toolName,input,callContext)`；entered后确认alias参数及真实panel session精确匹配、handler尚0；不改connection，release后固定返回正确、handler=1。所有控制等待有有界超时，finally必release并await pending，不用sleep。

**拒绝例**：同样等entered后，通过公开setter将 `server.runtimeConnection` 换成另一个引用或null，保持runtimeContextHost不变；释放普通deferred。捕获callTool真实throw同时断言code=`mcp.context_changed`、kind=`invalid`（公开mcpErrorKind/actionErrorKind按实际错误取），handler=0；不得把plain Error/abort message当该拒绝。`RuntimeProjectConnection.connection`setter确会abort旧signal，但此屏障后的alias返回不await该signal，下一步直接到第250行引用复查，故设计能隔离目标raiser。调用前就注册reject observer，避免悬挂拒绝。恢复合法connection并再次正常call，证明失败后可用。

**RAC2766变异**：在根允许的隔离故障副本，仅将mcp-server中第250行action分支的`mcpErrors.context_changed(...)`换`mcpErrors.tool_unknown(...)`；保持捕获connection/比较/alias、其他raiser、signal逻辑不变。匹配整体构建后跑新增完整文件：拒绝例应在code/kind断言红（实际tool_unknown/not_found）、handler仍0，正常对照仍绿；恢复、匹配构建后文件通过。不能删分支或全局替换。故障源码不提交，最终diff仍只新增原书允许测试文件。

## 未验证和交接

动态缺口仅为实际TS/fixture和时序落地：public catalog insert所需全字段、MCP tools/list action可见性、commit透明代理的泛型/this、真实alias读回与deferred到达、精确raiser红绿。本轮未观察它们运行成功；若正常对照失败，先查该具体阶段，不伪造callTool/authorizer/error或降低oracle。项目/安装记录只为真实owner结构，不宣称启动了终端或走了MCP wire传输。

T384实际采用后由根给新M，按原书fresh核目标调用顺序/唯一测试文件锁、公共build及原三完整文件批与固定门禁；不继承候选H为已采用事实。cleanup关闭server/Host、释放屏障等待pending、删除本次Home，无真实Home/4207/凭据或浏览器需要。不重写T369书、不增加编号/执行任务；本准备到此停止。
