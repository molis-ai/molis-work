# T402/T403 多surface挂载最小方案候选

负责人：Codex 起草线。只补PORT-MAP最上游的mount/选择接缝，供根裁定，不重写PLAN，不新增总书/任务号。只读本地main `b6f92222fce89dfba756a580768889292cfe9967`；未取T377候选，未写源码/测试/coord/GH、未构建或测资源。父片与锁、PR2等T148、T403资源具体审批均不解除。API/gateway映射归开发线3，本书不重复。

## 1. 当前真实链与两处必须纠正的假设

- Host `project-plugin-stages.ts::renderProjectRuntimeStages/runtimeStage` 按实际运行贡献画workbench；Home半边来自 `home-plugin-http.ts`。Workbench `declared-stages.ts`仍有catalog fallback，后继须按已定A绑定实际owner，不能对象读取后回此fallback。
- `shell-page-renderer.ts:263～300` 当前将Feed source-directory塞进sidebar的inline HTML，source-workbench直接塞main pool，overlays直接塞main末尾；Runtime/declared的stage HTML才经defer。当前不是所有surface都已经自动进frame。
- defer只识别完整根带`data-work-surface`的stage HTML，是否隔离由 `pluginSurfaceClients()` 是否有clientFactory决定。Feed当前没有clientFactory，因此五文件还在shell主bundle、业务DOM跨sidebar/main使用。设置clientFactory后不能假设原side目录也自动进frame。
- `deferred-plugin-client.ts` → `molisPluginFrames.mount` → `parent.ts::mountFrame`取得page授权、建立scope/MessageChannel → `frameDocument`将root内data-plugin-document的HTML放opaque iframe → child.ts造root/Host并执行factory。插件不能读parent DOM；一个factory调用只拥有一个mount，不因同owner就共享DOM。
- **Feed `ui.ts:451` 的renderFeedOverlays当前返回空串。** 规则/来源配置所谓“dialog”实际是renderFeedWorkbench:215嵌入的renderFeedSetupPanel（普通section `data-feed-sources-dialog`），不是overlay slot中的独立dialog，也不是跨frame DOM。此链无需新overlay通信/全局弹窗状态。未来非空overlay不在此片发明通用框架。
- **Inbox对象选择已有可用桥。** parent监听root的molis-work:select-item→FrameDown.select；child的pageSelection先原样派发own root事件，再按recordRow/searchRow找item并点击。无需新增Inbox专用选择消息。

## 2. 建议冻结的mount拓扑

T402输出仍是按真实owner/贡献+surface的HTML，每次stage数据读一次，渲染去重按已定PLAN。T403装客户端时，**使用同一bundle、每个实际slot独立root/scope/frame**，不把目录业务脚本留在parent执行，也不把目录DOM搬进main破坏布局：

| 实际内容 | 壳层位置与frame边界 | 谁拥有客户端状态 |
| --- | --- | --- |
| Feed directory/source-directory | sidebar槽中各自贡献surface的inline容器；有内容且需交互时将该surface HTML作为一个opaque frame文档，复用同feed.js factory。容器本身由shell放置/定尺寸，frame填满容器，目录自身滚动；不为每行挂frame。 | 每个root仅目录筛选/行焦点。不得找main的feedWorkbench或写shell treePane。跨main选择走§4唯一新增意图。 |
| Feed workbench | main pool中的默认舞台frame；展开的reader、来源rail、来源/规则配置section都在本frame自己的HTML/root。 | 消息选择/筛选、详情、规则草稿与请求由该mount持有；规则panel切换在此局部完成。 |
| Feed source-workbench | 按已定stage_surfaces显式选择的附加main root/frame，保留其source detail内容；同feed.js按mount.surface选择分支，不把它作为另一个插件id或复制service状态。 | 自己的来源detail/tab，不能直接改workbench的来源rail/规则section。需要跳去消息/规则时发同owner视图意图。 |
| Feed overlays | 当前空串，不建空frame、不创建第二份规则panel、不绑定listener。仍按T402声明选择/去重保留空输出事实。 | 无客户端状态。规则编辑不是此surface。 |
| Inbox directory与workbench | 各放原sidebar/main slot；交互surface各自root/frame，同inbox.js factory按surface分支。compose及结果面板留workbench内。 | 目录只发对象选择，主区自己加载/选择/展开及compose；不共享另frame DOM。 |

这是现有多个slot及opaque frame的有限补齐，不改变业务信息结构；T402不提前执行插件客户端。显式mount元数据需由可信shell从已选贡献生成 `{contribution_id,surface,target_slot_id}` 交frame config/Host（现有config.surface目前是pack短id，不足以分支）；不能信child自己报slot/owner。原pack.id/bundle仍feed/inbox，不把source-workbench当bundle名。wrapper/deferred定位需用该受信surface元数据，不能靠改data-work-surface="sources"来误配另一个pack。

布局实现复用原slot容器和frame填充/滚动规则；不加全站自适应高度协议。sidebar、main容器若现有CSS尚依赖子DOM天然高度，作者须在原布局边界补明确高度/overflow并验证原键盘/滚动，不能以parent查询child尺寸回避opaque边界。新增网络资源仍只有原候选三项；同bundle多实例不等于新增多份资源，实际请求缓存/字节待独立产物实测。

## 3. 现有消息能做什么，不能做什么

- `UiPageMessages` 当前类型是molis:side-*；`plugin-frame/messages.ts`也只路由stage↔side上下文，不是任意同owner surface bus。不能把来源选择塞side-context-command、冒充side视图或声称已支持目录↔main广播。
- `FrameDown.select` 的pageSelection接受detail并向本root派select-item；itemId有recordRow可触发实际点击，collapse清选中。它可用于**Inbox entry对象**和**Feed item对象**，带原itemId/quiet，继续既有openItem/Host选中路径。它没有现成child→parent“打开来源视图/面板”的上行语义，也不自动同步另目录frame的选择高亮。
- 已有openItem/openPlugin/openBeside桥用于对象/插件导航，不能把source_id假装feed_item塞openItem，或把settings/rules伪装对象surface。PR2已accepted通用view约束恰好要求这类视图状态不再用feedTask专有标签字段；本书只按此约束设计，不提前采用PR2。
- 现有stage消息context/expanded由child→parent让shell知道当前对象和展开状态，不授予动作权限，也不承载任意UI状态同步。

## 4. 唯一新增有限通道：同owner舞台视图选择

建议给现有frame UI意图增加 **openView**，公开Host最小形状为 `openView({surface, id?, panel?, intent?:"open"|"select"})`；open用于原本打开工作面的入口，select仅选择已有详情、不新建/激活标签：

- surface必须是该frame绑定的**同一实际owner/contribution**在stage_surfaces列出的main表面；id是可选的来源/组等视图选择，panel是可选的局部面板键。均单值短字符串（沿现有256码点路由值上限），不接受HTML/DOM、callback、actor/project/install、URL、动作引用或任意字典。Host不解释“Feed来源”或“规则”，只核绑定/目标main/值形状，插件解释自己的选择。
- child→parent复用FrameUp ui增加openView；可信main mount/外层workbenchPane relay绑定发送pane；共享sidebar则由shell在收到本次用户意图的同步边界捕获其作用pane。paneId不得来自child。open先写该pane的PR2通用view/layout选择，再解析目标root；select仅投既有detail选择，不新建标签。随后用现有FrameDown.select投有限view detail（含上述intent）；不能直接把当前按focused pane的openPlugin/openItem冒充按pane入口，最终PR2准确端口仍WAIT。
- 同意图只向同作用pane、同owner/contribution目录root同步高亮；共享目录已不代表该pane时忽略通知。pending只保最后意图，绑定项目、固定pane、owner/contribution/surface及sender/target运行世代；现有WeakMap<root,detail>本身不足，须接sender scope清理。每次await/挂载/投递前复核原sender、固定pane仍在和原目标世代，不能重新读取focused pane，不能用旧intent激活新安装。sender结束、目标/项目/pane变化即清pending，不新增持久状态容器。
- 通用view的持久化仍由PR2最终layout owner处理；插件局部草稿走drafts，不能另写一份feedTask状态图。PR2尚未采用时，T402先做服务端/实际owner/surface合同与无客户端的等价绘制，T403此上行视图意图/布局接线仍WAIT最终PR2合同，不能把parent当前goalView/feedTask直接当最终view实现。
- 目标不存在/未显示/owner换代则拒绝该意图并沿原导航失败显示，不fallback到catalog，不让旧intent激活新安装；有数据访问仍经目标自己的公开动作校验。此端口只选择视图，不写业务、不扩账号授权。

这是一项受限导航意图，不是通用同owner消息框架。Inbox对象已可用openItem，不为它新增另一条专用selectInbox消息；directory→main和main→directory的视图高亮都沿上面一次选择意图，无另一套状态同步协议。

## 5. 三条实际流向与局部状态

**source-selection分两类**：原 `data-source-entry-id`（events-primary:327～330）只调用selectSource，不开新标签。目录将source id传给承接原source detail的已有同owner mount，仅改预览/选中/overview；moveToDetail=true时沿原窄屏document切换，键盘原false不触发。窄屏由shell按作用pane外层宽度判断，不能用sidebar iframe宽度误判。可将有限openView意图补 `intent:"select"` 与 `intent:"open"` 两种，前者不创建/激活标签，后者才交布局owner打开视图；不是另建消息系统。原 `data-feed-task-toggle` / `data-open-source-record` 及sources→feed导航仍打开默认workbench并setFeedTask：`openView({surface:"workbench",id:source_id,panel:"messages",intent:"open"})`。source-workbench可绘制不等于所有source row获准开其标签。最终PR2若已有source detail的accepted view表达，准确沿它映射；此表达未冻结前保持局部WAIT，不自行选新交互。

**rule-dialog**：默认Feed workbench内部点“规则” → 直接showFeedSetup/config/rules，读写同root section；从目录/来源详情点规则 → openView默认workbench、来源id、panel=rules、intent=open。settings入口同理传panel=settings；添加来源入口打开默认workbench的添加section，无source id，保原choose/setup序列，不能漏掉settings/添加。草稿/preview/request保本mount，关闭回消息是本root切换。当前是section面板，不新增modal或将它搬成overlay独立frame。

**inbox-selection**：Inbox目录root点击entry → 现有host.openItem("inbox",entryId,title) → shell激活当前项目Inbox对象标签 → 已有parent root select-item→FrameDown.select→主区pageSelection/Inbox root listener选中同entry并loadInboxEntryResults。主区context现有对象消息可让shell更新选中对象；若需要目录高亮，parent仅将自己已有的同pane选中对象detail同步给同owner目录root（复用select下行，不新增总线）。Inbox目录只高亮，不执行compose/判断动作。主区compose打开Pages继续现有openItem("pages",id)，那是显式跨插件导航，不是本同owner通道的目标。

来源id/entryid不存在时由目标当前数据给“已不可用”，父壳不能凭目录旧文字合成业务数据；隐藏/卸载后不自动重放业务写。选择到达前mount可只保最后view/item意图，旧已关闭scope的回复不得改变新frame。

## 6. 精确落点与冻结建议

以下三项是本轮必须并入精确落点的补正，与上文一起生效：

**slot wrapper / 内层根 / readDocument同批切换。** 原sidebar根是带hidden的data-directory-panel、没有data-work-surface，现有renderPluginFrameSurface却总造desktop-work-surface壳，不能原样套用。shell目录wrapper保sidebar布局/尺寸/显隐，不加入main pool；可信mount另给唯一own-root标记，child按此找被选surface根并仅解除该根初始hidden，保业务子面板hidden，不回退body猜根。deferred pack定位、parent config.surface、child host.mount与根选择消费同一受信owner/contribution/surface/slot，pack.id/bundle仍feed/inbox。

现有 `browser/plugin-frame/view.ts::readPageDocument` 重取整页后按data-work-surface首匹配，必须同步改为依据parent可信mount（项目、实际owner/安装世代、contribution、surface、slot、pane）定位唯一wrapper及data-plugin-document；sources短名、feed包名、source-workbench声明名不能混用。child仍只发read-document请求id，不提供surface/URL。保取页前后view-revision、原owner世代及scope检查，多个匹配/缺失/失效拒绝，不返回全页或首个feed。既有UiPageView.readDocument仍回该surface HTML字符串；类型/parent/child/wrapper/view这条完整链同批改。

**source-workbench初始模型与刷新。** 初始HTML来自T402同一次stage读取模型的renderSourceWorkbench输出；选择函数只查本root的data-source-detail核source id，不再因另frame无sourceList提前return。缺id显示原已不可用/空详情，不从目录文字合成数据。重取使用上段精确readDocument，不能从默认 `/api/stage/feed` 消息响应假定带source detail，更不能把source_id传feed.items.reader/object_action（后者只读Feed item）。每次重取捕获本mount scope、作用pane/owner世代、当前source id和递增request序号；新选择、hide/detach、实例/项目变更后旧响应及error/finally均不改DOM/busy/草稿或发导航。成功重取后仅重用当前仍有效选择，不重绑全局listener、不重放业务写。

来源配置保存/暂停/删除/拉取等原业务确认成功后，同作用pane的同owner目录、默认main、附加source main已挂root须失效重取，未挂者首次显示取当前模型。选择高亮不会自动刷新数据。优先接现有owner view-revision/invalidate路径；若它尚未直达这些opaque mount，只在现有frame桥补一次有限“本贡献显示失效”通知：无目标plugin/HTML/业务payload，parent从sender绑定取本贡献/项目/pane，让目标root经原readDocument重取。不得同时建另一份数据同步账或任意pubsub。此通知和有限openView职责分开，前者只重读自己的surface；准确协议落点由根随本接缝冻结，不扩API/gateway范围。

本候选影响T402工程形状的最上游输入为：实际owner/surface绘制对 + slot-aware frame wrapper +可信mount.surface。可在原PLAN允许文件外向根明确申请这些**必要准确接缝**，不是作者自动扩范围：

- `apps/workbench/src/plugin-frame.ts` 的renderPluginFrameSurface、`shell-page-renderer.ts` 的deferredSurfaces/sidebar/main挂载、`plugin-workbench.ts` 的pack/metadata与对应deferred loader：按slot挂同bundle不同surface，不将source-workbench错当plugin id；空overlay不建client。
- `browser/plugin-frame/{types,parent,child,view}.ts`：可信mount投影、slot内层根及readPageDocument精确定位、有限openView上行/现有select下行、必要本贡献显示失效通知；`packages/contracts/src/platform/ui.ts` 的UiPluginClientHost公开形状同补，必要SDK公开API快照沿现有流程。`messages.ts`的side协议不扩成通用bus。
- `scripts/client/initialization.ts` / `tab-workspace*.ts` 仅对接PR2最终通用view选择/落点及现有item选择，保原owner布局。parent只管理当前pane既有root的路由/待就绪选择，不能新增全局activeSource状态；DOM事件有新增或实际owner/发听路径变化按既有contracts/platform/dom-events登记同改。
- Feed/Inbox的factory按host.mount.surface分支、每root own scope；现有五文件业务迁移及外部callers沿PORT-MAP，不在这里另开第二份实现。目录是独立root，原读取main节点/全局document必须移除；默认Feed规则section保持本root，Inbox compose保持本root。

根可冻结的最小决定：保留sidebar/main空间位置且插件交互都在opaque frame；同bundle按可信surface实例化；空Feed overlay无client；Inbox item复用现有select；仅加同owner有限openView视图意图，目标/值闭合、持久化归PR2。此方案不是新增通用消息框架，也不是让T402先占T403/PR2客户端锁。

验证仍归原RAC2507～2514/2515～2519：同一stage数据一次获取、每surface一次；目录选择进准确main、规则panel在本root、Inbox进入同entry；错误owner/pane/未声明surface不接收；hide/detach abort/晚响应/单监听与空overlay不挂客户端。这里只给可观察结果，不造新测试矩阵、不宣称已测。资源审批待真实可审阅产物；T377采用后的navigation-feed恢复差异另按实际adopted diff吸收，不拉未合候选。

## 四项修订回执

按根接受的MOUNT-REVIEW修正：两类source入口保原预览/窄屏与默认workbench行为；slot wrapper、内层hidden root和readPageDocument同消费可信mount；来源初始模型/重取/变更失效/请求世代闭环，source_id不送item reader；用户意图当刻固定作用pane，await后不改focused pane。最终PR2准确按pane端口及source-detail view映射仍WAIT，不提前采用。仅修改同MOUNT-PLAN，API-PLAN已先完成且本轮未改；无源码/测试/GH/coord或构建运行。

## 根核收（2026-11-01 00:45Z）

四项准确修订已逐段回读，接受为迁移准备边界；最终PR2按pane入口/source-detail映射、真实surface失效接缝、父片采用与路径锁仍是实施前置，不宣称现成公开API已具备或原RAC通过。T121实际采用与最终slot合同是账户分支准确前置，权限选择另见API-PLAN，三资源具体审批仍独立等待。
