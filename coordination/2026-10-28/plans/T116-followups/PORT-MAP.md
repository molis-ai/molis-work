# T403 客户端闭包与公共端口差分

负责人：Codex 起草线；静态候选，未实现/编译/运行/实测资源。不重写PLAN，不占号。绑定当前本地main `b6f92222fce89dfba756a580768889292cfe9967`（本轮rev-parse仍相同，未fetch）。五文件均从该Git对象读，不读主检出源码或未合T377候选。

结论：五文件不是五份独立插件客户端。navigation-feed中大部分是shell/Goals导航；其余四份有可搬的Feed/Inbox逻辑，但依赖bootstrap状态和五文件之外的事件调用者。应将业务代码归插件、shell导航仍归shell，以现有frame端口/声明消费，不能复制整个Workbench闭包到Feed。以下只列影响实际拆分的自由变量，省略标准JS/DOM内置名；来自另外一个Feed子片段的函数是插件内部依赖，不误报公共端口缺失。

## 1. 先区分三种“已有端口”

1. **SDK/contract公开形状**：`packages/contracts/src/platform/ui.ts` 的 UiPluginClientHost（SDK index已有re-export）含root、scope、translate、pluginId、projectId/Title、route/pluginRoute、surfaceFor、invokeAction、drafts及dialog/file等能力。UiClientScope提供fetch/assertCurrent/signal/own/frame/whenVisible；不要假称其公开类型已有listen/observe（FrameScope另扩了这两项）。原生listener可用scope.own清理。
2. **已有frame运行桥，未全纳入UiPluginClientHost静态形状**：`apps/workbench/src/browser/plugin-frame/child.ts:68～96` 实际给factory api、openItem/openBeside/openPlugin、hideDirectory、showToast、view等；`types.ts::FrameHost/FrameUp`有相应导航消息，initialization:118～125接到tabWorkspace。此为真实现成桥，不等于插件能import shell/tabWorkspace，也不等于SDK类型已承诺全部字段。需要使用时最小具名补齐现有公开类型/适配，不能用any或只写插件本地假接口掩盖平台缺口。
3. **现成frame环境全局**：child.ts安装globalThis.molisWorkRequest（UiRequest请求+错误呈现）、翻译、受控fetch和storage代理。它们不是任意Host网络授权；parent fetch带x-molis-plugin-page交服务端核身份/允许路径。api桥当前未自动给每次call传mount scope，必须沿UiRequest实际scope/signal使用或通过已有scope.fetch，不能仅搬过去继续无scope异步。不要新写第二份请求/诊断/一次性键算法。

Schedule仅证明已有 `(host)=>…` factory/build/registration路径：其browser/types.ts只Pick若干Host字段并用view.readDocument/showToast，不能据此推它已给Feed提供了shell状态写入。插件代码按当前deferred loader在opaque frame执行；parent DOM、window.document的其他插件节点和shell sessionStorage均不是可偷读的端口。

## 2. 按原五文件的实际映射

| 文件/具体函数 | 真正依赖 | 可搬部分与现成替代 | 缺口/留在shell的部分 |
| --- | --- | --- | --- |
| `navigation-feed.ts` restoreLastGoal | currentGoalUiStorageKey/goalUiStorageKey、desktopNavigationStateVersion、visibleGoals、state.active_goal_id、sessionStorage、location/global navigation URL | 无Feed业务可据此搬走。返回Goal应由shell现有导航/标签实现；插件若只需打开已知对象用frame openItem，表面位置不是权限。 | “回到最后Goal”选择谁/读Goals缓存属于shell事实；不能把state/visibleGoals/Goals存储key作为Feed host参数。若原交互确需此意图，最小语义端口为shell-owned返回上个工作面，而不是读写任意Goals状态；正式映射待PR2及完整PR1稳定。 |
| 同文件 setDesktopWorkSurface / setDesktopDirectory / syncPluginDirectory / setPluginSectionExpanded | desktopWorkSurfaces/Panels、workspace/treePane/documentPane、desktopSurfaceScroll/activeDesktopSurface、deferredClients/pluginWorkbench/frameContainer/immersiveNavigation、setWorkspaceMode/openCreate、queueSave、OWN_DIRECTORY_SURFACES | setSourceDetailTab可搬，限Feed own root。openWorkbenchSurface/openDirectorySurface中“打开对象/插件”的意图可复用frame openItem/openPlugin；mode=preview/commit目前Host桥参数与实际tab签名须按真实实现核，不把parent的undefined占位传参泄露给插件。 | 全局工作面、目录展开、滚动/移动布局/Goals模式仍shell-owned；不能把这些大函数原封搬进Feed或新增Feed专用Host adapter。OWN_DIRECTORY_SURFACES是工作台私有目录名单，留shell；插件用host.surfaceFor或明确自身声明，不import plugin-catalog。 |
| `navigation-feed-stage.ts` refreshFeedStage / loadFeedItemDetail / publishFeedContext / selectFeedItem | feedList/Workbench/DetailEmpty/各filter DOM、selectedFeedItem/Task、feedDetailRequest、activeFeedPreset、findFeedNodes、markFeedItemRead、molisWorkRequest、route、FL、showToast | 选择/筛选/排序/展开、详情占位/请求序号/Controller、DOM选中态、规则定位均Feed自有；findFeedNodes的Feed节点部分、markFeedItemRead一起移到Feed。route/pluginRoute、translate、scope与frame导航已有；publishFeedContext写自己root的data-assistant-context，由现有childContext/child.ts context消息读给shell，无须parent DOM。 | 当前全局document选择器须全部限定own root；刷新后重新查当前root中的节点，不拿bootstrap旧引用。setMobileView、setTreeFilterOpen、noteSearchActivity、immersiveNavigation和布局queueSave没有等价公开插件端口，见§4。 |
| 同文件 setFeedPreset / remember/restoreFeedPresetState / adoptFeed | feedPresetState/defaultFeedPresetState、selectedSource/activeSourceFilter、desktopDirectoryPanels、bindSourceDirectory、treePane、molis-work:plugins-changed的next文档 | Feed过滤/选中/来源/排序是插件自有UI状态，放本mount内并用host.drafts保存必要未提交状态；bootstrap初始读取部分要随业务搬。 | adoptFeed当前替换parent的四块DOM、改全局目录数组并读nextDocument，不能在frame内照搬。启用/停用由现有membership→deferred frame装卸处理；新frame从当前T402数据挂载，不能同时保留旧adoptFeed重填与新factory两个owner。shell现有事件消费者按§3交接。 |
| `navigation-feed-sources.ts` selectSource/filterSources/showFeedSetup/setFeedTask/ensureFeedWorkbenchLoaded | sourceList/Workbench/Directory、selectedSource/Task、activeSourceFilter、feedSourcesDialog/Workbench、feedWorkbenchRequest、FL/route/request/showToast；Feed各片段互调 | 来源筛选、tab、配置/添加草稿、规则dialog、任务选择、详情占位和stage加载都可搬；同一Feed客户端自有状态替代闭包全局。跨Feed片段调用如filterFeedItems/hydrateFeedRuleDrafts/refreshFeedStage不增加Host端口。 | 当前source-directory、source-workbench、overlay和stage可能是不同surface/mount，不能假设一个root能看见所有DOM；按T402最终surface/frame装配核定（§4）。loadFeedConnections读 `/api/settings/connectors/connections?service_id=…` 是跨owner管理读，现有api桥不证明授权放行；不能改为读私有配置/密钥。 |
| 同文件 workbench-open-group监听 / workbench-feed-task派发 | document级CustomEvent、queueSave、setMobileView | 两事件已登记contracts/platform/dom-events.ts，分别owner navigation-feed/tab-workspace；它们是表现意图，不能授予账号/动作权限。 | frame里的document事件不会自动穿到parent。同名dispatch不是已有跨frame端口。复用通用选中消息若可表达既定group选择，否则仅补受限group意图转发，不能传DOM/任意Host函数；精确建议见§4。 |
| `feed-rule-authoring.ts` read/remember/preview/publish规则 | LF(FEED_PLUGIN_ID)→FL、feedApi、api/request、feedSourcesDialog、refreshFeedStage/showToast、sessionStorage；Functions公共scene/option常量 | 规则表单/缓存/preview匹配展示、function_key/request幂等意图、发布后绑定逻辑归Feed。FL→host.translate，own route→pluginRoute，草稿→host.drafts（异步hydrate后再允许编辑/保存，不能丢draft.functionKey）；契约scene/option常量仍从contracts取，不引入另插件实现。 | 自然语言规则直接HTTP调 `/api/functions` GET/POST、`/:id`更新、`/settings`、`/:id/preview`、`/:id/publish` 是Functions owner操作，不是Feed自身API；判断目录经Feed `/out-rules/judgments`、preview-judgment仍是Feed公开入口。必须核这些既有HTTP路径对plugin-page身份是否允许，或沿已有公开动作+Manifest consumes精确绑定；本轮不编造functions动作id、不默认gateway全部允许。能力不足交根准确HTTP→已有动作映射缺口，不能直接调用Functions包代码或加无界api权限。 |
| `navigation-inbox.ts` 选择/重画/判断/合成Pages | inboxDirectory/List/Workbench（当前文件自己找）、L/api/request/route、queueSave、tabWorkspace、sessionStorage、location、document.body.projectId；composeDraft/request_id | Inbox显示/选中/过滤、stage刷新与输入/compose状态、evaluate、pages处理结果/恢复和幂等request_id归Inbox。L→host.translate；Inbox API→pluginRoute；Pages打开与返回Inbox→现有frame openItem，不直接import Pages/Feed实现；host.drafts替代shell composeStorageKey。现有 `/inbox/pages` 已由Inbox后端拥有跨owner写入，本片不搬到浏览器直写Pages。 | document捕获a[href]?inbox_entry和首屏URL query是shell导航；已存在initialization:137后的同类入口，不保留两份全局拦截。`[data-inbox-functions]`派molis-work:open-settings-path目前只发生在child document，不会自动到parent；需§4有限settings意图。queueSave全局布局无现成插件端口。 |

## 3. 五文件以外必须交接的实际调用者

这些是本轮静态查到的具体接缝，**不是允许任意改这些文件**；根冻结T403逐文件范围时纳入最小差分，否则五文件搬走会产生ReferenceError或双监听：

- `bootstrap.ts:35` findFeedNodes/Feed DOM与状态初值，`:73` markFeedItemRead：Feed业务部分搬入自有client；workspace/Goal/state/API总定义留shell，不复制整bootstrap。
- `events-primary.ts:153` bindSourceDirectory键盘监听、`:492` handleFeedRuleAction及附近Feed setup/配置/注册/规则操作，`:584`规则evaluate后连刷Feed/Inbox：业务事件需随各owner迁，旧监听删除；shell不留下调用已消失闭包的Feed业务dispatcher。
- `events-secondary.ts:110` Inbox状态提交后refreshInboxStage、`:156` Feed动作完成后刷新Feed且必要时刷新Inbox：自己的API/状态处理迁对应owner；另一插件刷新是跨owner通知缺口，不让Feed factory直接拿Inbox.refresh函数。
- `editing-graph.ts:198～210` 给tabWorkspace注入setFeedTask/setFeedAddOpen/selectFeedItem/selectInboxEntry；`tab-workspace.ts`消费这些回调：应沿现有通用frame选择/打开对象/折叠消息完成，不能继续把插件内部函数暴露为shell全局。Feed task=来源group不是feed_item，现有选中消息能否表达由§4明确。
- `documents-state.ts:119,212` 读取/恢复Feed过滤、来源等，且保存Inbox相关选择；PR2统一view尚待T148，不抢写旧layout转化。最终布局owner只保位置/对象引用，Feed/Inbox局部过滤/未提交draft由各插件保存；不要把host.drafts当旧整布局迁移器。确需旧行为的准确state序列在最终PR2上冻结。
- `initialization.ts:137` inbox_entry URL打开与`navigation-inbox.ts`开头捕获重叠：由shell单一处理URL/导航，插件通过现有选择消息更新自己root。同文件deferred host构造可复用导航桥，不额外暴露tabWorkspace对象。

这些跨文件回边是当前最重要的未闭合部分。原WO说五文件搬迁不是“只删五个import就完整”；根需按实际责任明确上述最小接线范围与原相关用例，不借此重写events或整个tab系统。

## 4. 没有现成端口的具体点与最小合同建议

| 缺口/事实 | 最小建议与边界（供根冻结，非已实施/自动获批） |
| --- | --- |
| shell-owned导航大函数还在navigation-feed中，setMobileView/setTreeFilterOpen/setDirectoryCollapsed/immersiveNavigation/queueSave不能随插件读写 | 把通用shell导航责任留/移到shell已有导航模块，保现有公共frame openItem/openPlugin/hideDirectory意图；插件不拿parent root/state。移动布局在shell收到打开对象时依原规则处理。确实还需“返回前一工作面/关闭另一个filter”才提单个无权限意图，不能端口化所有setter。noteSearchActivity仅shell搜索活动记账，不应为Feed过滤输入授予搜索状态写接口；保留原可观察行为或由根裁定准确计量，不自删业务行为。 |
| group选择与layout记忆：workbench-open-group/Feed-task document事件、setFeedTask不是对象选择；现有FrameDown select/collapse是明确已存在但未确认group语义 | 优先核现有selection detail可否以已声明对象/插件视图参数表达当前来源组；若不能，只扩现有frame选择协议的受限view/group输入 `{id}` 并绑定本frame插件/当前项目，shell写自己的通用view标签/恢复数据，Feed只改自己UI。禁止新建私人任务/状态账、向parent发任意方法名。DOM事件的现有owner登记随实际新跨边界路径同步，不制造同名自动转发假象。 |
| Inbox打开“能力规则设置”跨frame不通；child现有ui intents没有settings路径类型 | 可在既有受控link导航解析中支持当前明确的settings目标，或对现有frame UI消息增一项受限settings意图（仅现行规则页/允许settings目标，由shell解析project上下文），复用settings-directory；不新增外部任意URL跳转/JS执行。原 `molis-work:open-settings-path` payload中的project不能作可信身份。需修改FrameUp/父分派和既有导航入口及公开Host类型，不只加Feed本地方法。 |
| 目录/overlay/main不同surface：一root看不到另frame DOM，sources/setup又同时操作来源目录与主区 | T402最终装配须先给出实际mount拓扑：同一贡献可用同数据画多个surface，不代表浏览器共享一个DOM或scope。每个client只管自身root；跨surface只传选择/打开配置等有限表现状态，经已有messages/选择通道按可信贡献路由，不能发DOM/HTML或共享parent querySelector。若现有messages仅限stage↔side而不能表达此路径，交根最小同owner表面消息补充；不能把UiPageMessages的side枚举伪称已支持任意surface。未定前不实现一份查全document的Feed factory。 |
| Functions/连接列表HTTP在opaque frame中的授权与取消 | 复用已存在的UiRequest/受控api/host.invokeAction及Manifest consumes，对上面列出的每一真实接口核允许受众/输入/返回；缺正式公开动作只给根具体入口与所缺合同，不造通用“平台任意HTTP”端口。调用失败保原draft/幂等键，晚到结果不改已卸载UI；不能因取消重复publish/写规则。 |
| Feed写入引起Inbox重画 | 原events-primary/secondary现直接调另一闭包函数。复用平台实际已有变更/失效通知（先核订阅owner与范围）；若无合适通知，只给现有frame桥补owner限定的显示失效请求，由shell使已挂载目标重新取自己数据，未挂载的不调用。不能让Feed拿Inboxclient对象或伪装Inbox身份，不能为重画重复执行原业务写。准确通知名/合同须根冻结，不编造现成能力。 |

部分额外端口（openItem/openPlugin/showToast/view）已有运行实现但公开UiPluginClientHost类型不完整：最小形状应复用已有消息/方法，补类型而非第二套桥；SDK共享核心受原API、Full和安全规则约束。scope.listen/observe仍只是FrameScope扩展，插件可用标准addEventListener配scope.own，不必为移监听扩公开API。

## 5. 生命周期、当前路由与采用条件

- root只包含本次mount内容，所有全document选择器改为own root或明确本frame文档的自有dialog/overlay；不能把parent/body的shell宽布局和另插件DOM当root。事件在root注册；仅真正需window/document的监听用scope.own解绑并核目标属于自己。禁止在每次refresh后再次绑定同一全局click/scroll/input；dataset.bound不是跨mount资源清理。
- `scope.whenVisible`给读取的可见期signal，hide中止查询，detach/dispose取消并清listener/controller/frame；所有await后在修改root、showToast、busy finally或draft状态前核scope.assertCurrent +当前读序号/控制器。原select.isConnected/region.isConnected不能证明当前mount未换，旧节点仍连着时也会错写。hide后的写动作不能自动重放；是否已生效由原业务回执/幂等合同决定，UI只在当前scope更新。
- 草稿由host.drafts按当前安装命名空间保存。规则functionKey/previewContent、Inboxrequest_id保原意图，异步hydrate要在编辑前完成且防旧hydrate覆盖新输入；成功后仅删对应草稿。bindStorage代理虽存在，不意味着frame可以读shell原sessionStorage键；不新增历史读取兼容/搬旧layout，若必须保留存量未提交草稿，交根准确现行合同缺口。
- **当前行为**仍是 `/api/stage/feed/items/<id>`（reader省surface，frame传frame-block）。T402采用后按已定后继改普通reader为 `.../feed/objects/<id>?surface=persisted-detail`、frame为 `...?surface=frame-block`，固定object_id不并query；本书不把它写成已生效。stage/feed与stage/inboxURL不变。T403只继承最终T402路由，不再切一次。
- 当前M不含T377；本轮未拉/读取其候选实现。已知采用前关注点仅是navigation-feed/deferred-client/documents-state的恢复、重挂载、notice与对应测试，待T377实际采用后读取准确diff再决定哪部分仍属shell、哪部分随Feed迁。不能从旧navigation-feed副本覆盖最终main，不能在此先cherry-pick未合片。
- 新feed.js/feed.css/inbox.js仍等可审阅本地实现/字节/净差额与根组织的具体审批；此静态PORT-MAP没有实现、构建或资源测量，不给预估值冒充实测，不授权发布新资源。

## 6. 真正剩余输入及交接

本表已经定位五文件的业务/壳层分界与实际回边，未枚举无关DOM/JS内置变量。静态TS符号辅助只对模板文本找线索，最后按函数正文/外部caller核读；不是编译/测试通过证据，也不声称覆盖动态生成所有调用。

根冻结T403前还需：T402最终mount拓扑与对象合同；PR2布局/selection端口；§4中确实无法复用的最小端口/消息逐项定形及允许路径（含events/bootstrap回边）；Functions/连接列表实际gateway许可/公开动作映射；T377 adopted diff；资源实测与审批。不得为了把表填满自行发明settings/group/refresh通用框架。作者实施后的真实运行须证原RAC2515～2519、单监听/隐藏/卸载晚响应、写失败保草稿/幂等、跨owner权限拒绝及实际用户动线；本书均未执行。

本轮只新增同目录PORT-MAP.md，PLAN保持未改；无源码/coord/GH/ref/真实Home/凭据写入或构建测试。
