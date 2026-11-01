# T116 PR1c / T402 / T403 接续差分

负责人：Codex 起草线；已按同目录REVIEW的A/B/C补正的只读准备候选，不是实现/READY，不占新任务/RAC号。已有总图与accepted WO足够，不再重写总书；这里只补实际接口缺口、当前锁和分阶段最终输出。PR2继续等T148采用。

## 1. 直接复用的工程入口及绑定

- 总依赖图：`/private/tmp/t116-successor-plan/PLAN.md`。其中旧PR状态/锁/head只作当时快照，下面当前核对优先。
- T116 accepted WO：同目录 `plan-t116.txt`（原评论6541306409）、`decision-t116.json`（根裁定6541316193）；原RAC2680～2687及2688/2689评审预留。裁定覆盖旧“registration回调路由”提案，必须Manifest数据+通用matcher；request只含声明允许的字符串参数，可信身份/控制键不得进入。
- T402/403 accepted WO：同目录 `decision-t133.txt`（6519062770；BOARD确认采用），片2=RAC2507～2514，片3=RAC2515～2519；原片1Schedule与通用stage_data已采用，不重做。
- 当前PR1a同步工程：协调 `plans/T116-current-sync/PLAN.md`（磁盘 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-current-sync/PLAN.md`），含两冲突、promptRoute真实必填、独立main金样与正常/RECORD口径。必须沿该书，不在本书重排其作者/验证。

源码本轮只读本地origin/main M=`b6f92222fce89dfba756a580768889292cfe9967`，未fetch；M包含T378 #1708，仅两文档，未据此假称T377已采用。协调HEAD=`f4e3ce432d13019bc8736e2899f10acea3a5609b`。实时PR API：#1679 open/unmerged，H=`92e406ed914997b751c46e67169fc5302613be6e`；#1680 open/unmerged，H=`d37ec34c8498ab755bf9e34ba430e5648dacb0a8`，仍base task/T116-ca@7f389082而非main；#1654 open/unmerged，H=`4d6f5766dc1a7323433d104405591fb74cd1f3d2`。三者完整分页文件列表已读，不能把旧Full/独立金样当当前组合已采用。

## 2. 顺序与准确交接

1. PR1a按当前同步书采用；PR1b正常接最终父片/main，先闭合其参数隔离、UI端口等既有必修与准确审验。不能提前取1b旧stacked头来实现后片。
2. **PR1c**补原PR1未完舞台/词典/旧拼装删除；完整PR1实际采用后才释放同文件给T402。1a搬文件、1b页面路由都不等于完整PR1。
3. **T402**做Feed/Inbox数据owner、通用objects路由、目录/overlay挂载和旧查询删除；下面已接受但未落地的object接口缺口也在此接续中明确负责。T402不等PR2，但涉及共享文件要根串行。
4. **PR2**仍须T148 #1654真实采用，按原RAC2687统一goalView/feedTask→view、旧整布局重置一次、不迁移。正式外壳脚本名单用最终main冻结；不能把当前无文本交集当放行。推荐T402→PR2→T403，减少同客户端/状态文件反复交接；这是排程建议，根可按实际依赖调序，不能免T148。
5. **T403**在T402最终接口/路由稳定、共享客户端文件可交接后搬家；三个新资源的具体审批仍必需。T117等完整PR1/T402移出真实模型后收类型边界，T118最后核状态/文档，已有书继续用。

## 3. PR1c真正缺口与最终输出

当前M `shell-page-renderer.ts` 仍import Goals模型/常量、构建collection/goal画布并带Goals端口；1b H的Goals manifest仅见page_routes，未声明stage_data/目标stage。不能报告原PR1已经完整。

**输入→输出合同**：当前项目/actor从Host上下文来；已批准的page_routes、stage_data.input及经隔离的request进入Goals自有只读舞台动作；动作返回原withSelectedGoalDocument/集合等必要数据，Goals自己的workbench contribution画原HTML；Host只给通用StagePageModel/primitives及确需的已定义端口。浏览器原GET地址保持，宿主不回头import Goals路由函数。真实Runtime/UiHost挂载与外壳declared fallback须避免同一贡献画两次，缺/停用的实例仍原不可用行为。

**范围仍按原WO**：Goals `src/page/`及stage/fragments/manifest/词典/现有公开page出口；Workbench `ui-composition.ts`、`renderer.ts`、`shell-page-renderer.ts`、`stage-renderers.ts`和对应旧Goals出口；Host只删搬走的专用拼装/接线，不动Goals事实读取职责。`page-view.ts`剩余真实类型归T117，不借1c造镜像DTO或把业务模型全放contracts。旧Schedule死构造同原计划删除，不重实现Schedule通道。最终manifest/action/schema需按实际新只读动作刷新动作快照，原参数安全校验沿1b不弱化。

**原验收与最终产物**：RAC2682真实Goals stage声明/挂载，外壳无goal-canvas-shell业务拼装；2684无Goals ui-composition引入/死Schedule构造，出口名单同步；2685实际外部点名清单下降并保T117明确余项；2686英文键归Goals词典。2680金样仍是逐字节硬约束，2681/2683前片证据只按实际未变输入核抵。最终main若带新promptRoute/终端或shell属性，先用独立准确main输出冻结合法金样，候选不得自行RECORD重写期望；66份完整HTML的正常断言与RECORD运行分账，保留旧首败/skip/UNKNOWN。交付完整PR1采用清单、准确base/head/tree、scoped diff、词典迁移实际键/数量、金样与挂载正反控来源及未运行边界。

## 4. T402：需补明确的通用接口缺口

**当前事实**：M的 `UiStageDataDeclaration` 仅action，`StagePageModel`仅route_prefix/shown_plugins/data/primitives；没有object_action/object模型。`plugin-stage-fragment-http.ts`仍有FEED_ITEM_STAGE、feedItem端口及feed/inbox具名分支；`project-stage-data.ts`是已存在的通用零输入读取；renderDeclaredStages消费同步model。T133原WO曾把object_action放片1目标，但实际未落地，不能当现成API调用，也不能重开整个片1。

**本片须在原accepted范围内补齐的准确接口**：

| 接缝 | 输入→输出及拒绝 |
| --- | --- |
| contracts `platform/ui.ts`、SDK `view-placement-declarations.ts` | 沿原T133定义 `stage_data: { action, object_action? }`，保留最终前片实际采用的T116 input等字段；object_action也必须同Manifest、唯一版本、只读query、audience user。StagePageModel补原accepted `object?: { id, surface }`，数据仍在data；不新造另一个对象协议。确切合成类型以最终1b接口为基，更新公开API快照。 |
| Host `plugin-stage-fragment-http.ts` +现有 `project-stage-data.ts`/Workbench `declared-stages.ts` 必要接缝 | `GET /api/stage/<project_plugin_id>`调用原stage action；`.../objects/<id>?surface=<s>`调用声明object_action，输入固定 `{object_id}`，actor/project仍context；返回同声明贡献的指定surface HTML。只接已显示插件；surface须同一实际owner贡献声明且target main；读取/HTML绑定顺序及失效拒绝见§4.1，URL与固定输入见§4.3。通用Host不识别feed/items，不以catalog fallback/空200掩盖对象拒绝。 |
| `Feed feed.stage.read@1` / `feed.items.reader@1` | 原accepted名称：stage返回snapshot/来源词汇目录/连接状态/出口规则/推荐/Inbox活跃状态；reader返回条目/推荐/inbox_active/promote_available。跨插件依赖经公开动作并在Manifest声明，不读别插件实现/表；名字是否在最终父片已存在先核，不能重复注册。 |
| `Inbox inbox.stage.read@1` | 返回entries/判断/推荐/摘要；主体由Inbox经Feed/Goals公开查询解析。主体已删或Feed不在→已不可用，页面其他有效主体仍可用；区分整体拒绝与单主体缺失，不吞真实故障成空。 |
| 整页 `workbench.directory` / `workbench.overlay` /第二main surface | 默认与附加main选择按§4.2的有限stage_surfaces字段；directory/overlay复用现有target_slot_id。使用同一实际owner的单次stage数据与模型，按贡献+surface去重，不枚举所有main；删Feed专用表。双实例继续dualStageOwner只读/画选中一半。 |

这使正式路径清单比旧T133片2表多出**确有必要的contracts/ui、SDK声明校验、公开API快照及现有stage数据/渲染接缝测试**；这是补原已接受未实现接口，不是新产品决定，但根派单必须明确该文件增量和锁，不能让writer默默扩范围。不要把同步renderer泛化成第二个异步框架：沿现有Host先取得数据、再画HTML的顺序，仅补对象数据/通用surface所需部分。

**URL生产者/消费者必须同批切换**：现有 `navigation-feed-stage.ts` reader和 `frame-container.ts` 的loadFeedBody仍请求 `/api/stage/feed/items/<id>`。若T402删除服务器旧路由而把这些字符串等到T403才改，会出现两片之间阅读器坏掉；仓库也不准加旧路由兼容。最小分工候选是T402在客户端原位置只同步objects URL（及相关快照/调用测试），不搬文件/不改loader分派；T403再搬已生效的客户端。根正式领单时把这些原T403文件的**仅路由差分**交给T402，串行交接后T403不重复实现；若根另选原子合并方式也必须保证无断档，不预签旧路径可留。

其他允许文件沿原WO：Host `web-request.ts`、`web-view.ts`、`index.ts`、`source-vocabulary.ts`；Workbench `ui-composition.ts`、`renderer.ts`、`shell-page-renderer.ts`、`stage-renderers.ts`，删除feed/inbox-projection-ui；Feed/Inbox manifest/ui/query-actions或actions；动作快照、web-route-table快照及原相关测试。`page-view.ts`删除Feed业务字段属原接续，剩余纯类型归T117；相关共享出口与模型必须跟实际caller同改，不能用unknown/any掩盖。

**原验收不变**：RAC2507 stage真实数据/实例目录；2508通用目录与overlay；2509 persisted-detail/frame-block对象路由；2510未声明/非main/未显示拒；2511主体缺失降级；2512两布尔行为与原一致；2513无Feed整页正常且零多余调用行；2514无Feed的Inbox主体已不可用。原完整文件 feed-native-plugin、inbox-plugin、feed-promote-reader、plugin-query-consumers、optional-areas-call-log、web-route-table、list-silent-refresh按真实路径改输入不放宽断言。新对象字段沿原片1同等校验负例，不能只测字段存在。最终交生产目录/对象/整页真实调用→owner读回/HTML结果、精确路由替换清单、旧专用拼装删除、API/动作影响、原RAC逐项实际结果，未执行UI和Full分别列出。

### 4.1 A｜对象读取与HTML绑定同一实际舞台owner

一个对象请求严格按此顺序，不把前述Workbench catalog fallback当运行实例：

1. 在现有fragment HTTP入口解析project_plugin_id、一个非空/仅一次decode的单段object id、一个显式surface；坏编码/多段/缺字段按现有HTTP错误或路由不匹配责任拒绝，业务动作计数为0。
2. 从当前项目显示集合与 `project-plugin-stages.ts` / `home-plugin-http.ts::homeStageHalves` 的当前实际贡献事实，经dualStageOwner选一半，得到本次绑定 `{scope, plugin_id, install_id/运行世代, manifest, contribution, actionClient}`。这是请求内引用/快照，不新建持久账、路由registry或Host插件名单。不存在/失效则拒；不借同名catalog contribution补画。Home实际owner也须保留当前项目caller范围，不能把Home数据视为本人无限授权。
3. **调用前**在该绑定的同一Manifest找到object_action；在该绑定的同一contribution.descriptor确认surface存在且target_slot_id=workbench.main；动作须已核同Manifest/单版本/user/只读。其他实例同名surface、另一个contribution有该surface均不可借用。用该owner对应、沿 `bindLocalWebAction` 现有单动作权限收窄与Runtime授权路径的本人client读，固定输入只有 `{object_id}`，不用原Feed宽权限client。可信actor/project/install来自context，不来自URL/query/request。
4. await后先按原Runtime可用性/运行世代与调用control复核原绑定；停用、撤权、升级/换实例、贡献被撤/改时拒绝，不把旧数据交给新owner或另一半，也不重读另一实例“补成功”。再将同份结果作为StagePageModel.data、`object:{id,surface}`交同一有效contribution.render。若渲染前有其他await，之后再次核原绑定。返回原对象HTML/错误，不用 `optionalPluginQuery` 吞拒绝为undefined，再渲染200空对象页。

整页已有missing/disabled/forbidden→不可用占位规则不改变，但对象端点须断言其实际拒绝；不允许整页的容错流传入对象读路径。双实例仅被选owner读取/绘制，非选半边action计数0；读取期间失效则新内容未进入响应、另一owner/catalog render计数0。沿原RAC2509/2510与原片1身份/双实例要求落测试，不新占号。

### 4.2 B｜有限整页surface选择，不枚举所有main

当前 `UiSurfaceDescriptor` 只有surface_id/target_slot_id/format，`UiViewDeclaration.contribution_id`只选择贡献；既有字段无法区分workbench、source-workbench与workbench-fragment/persisted-detail/frame-block这些同为main的表面。故只加一个有限列表：**stage-opening view的 `stage_surfaces?: readonly string[]`**，含义为此贡献在整页自动挂的main surface集合；不造surface框架或请求路由字段。

- 未写时严格默认 `["workbench"]`，保留现有插件行为；写了则是完整非空列表，必须含workbench一次、不能重复。Feed写 `["workbench", "source-workbench"]`；Inbox默认即可。字段只在实际打开舞台的stage view/否则navigator view使用，和stage_data相同归属，不能在无关settings/side view声明。
- SDK只校能从Manifest看见的列表形状/唯一值/适用view；Manifest的ui.contributions是ID引用，不能假称SDK能静态证明运行descriptor的所有surface。Host在选中同一实际owner贡献后、读stage action前，校每个列名确由该贡献descriptor声明且target main；未知/错误target拒声明挂载并给原不可用诊断，不静默跳过“看起来像合法”的项。
- **不枚举所有main**。没有列进stage_surfaces的object/fragment表面不参与整页自动挂；Feed的workbench-fragment、persisted-detail、frame-block不在列表中，只走对应片段/对象请求。本次不为判断“fragment”在Host写名称表；仅显式选择决定。独立surface GET也须经§4.1实际owner/声明检查。
- `workbench.directory` / `workbench.overlay`无需新字段：取同一被选贡献现有descriptor中target恰为这两个槽的surface。默认main+额外main+directory/overlay先形成请求内有序集合，key=`contribution_id + surface_id`（绑定owner/scope后处理），保持描述顺序/显式main列表顺序；同一key恰好一次。
- 当前 `plugin_stage_ids`/返回ids只有贡献级去重，不能因Runtime已画默认workbench就整贡献跳过附加main/directory/overlay。在现有页面渲染结果/模型里以 `surfaces: ReadonlyArray<Pick<UiRenderRequest, "contribution_id" | "surface">>` 和 `plugin_stage_surfaces` 传实际绘制对，直接复用现有UiRenderRequest字段，不新增共享DTO；同批替换这里的ids/plugin_stage_ids及Host→shell消费者（project-plugin-stages、home-plugin-http、web-goals-read、web-request、page-view、shell-page-renderer、declared-stages），不保留一套粗ids猜测补绘的新兼容分支。阶段owner只选择一次；同一请求同一owner的stage action **恰读一次**，所有整页surface复用该数据/模型，禁止每个surface重复查询或分别选Home/project半边。请求结束即释放这些局部集合，不持久化。

可观察oracle：Feed默认舞台一次、source-workbench一次、原directory/source-directory及overlay各按声明一次；整页不出现persisted-detail/frame-block/workbench-fragment自动渲染，stage读取计数1；Runtime已画默认surface仍有附加surface且不重复默认；双实例非选半边读取/绘制0。缺/停用/撤权仍无catalog复活。原RAC2507/2508及双实例验收承担这些准确预期，不扩全站矩阵。

### 4.3 C｜两处对象URL与固定输入

- `apps/workbench/src/scripts/client/navigation-feed-stage.ts` 普通reader改为 `route("/api/stage/feed/objects/" + encodeURIComponent(itemId) + "?surface=persisted-detail")`；显式写surface，通用Host不按Feed补默认值。返回须仍有匹配entryId的 `[data-feed-detail]` 和原交互，不仅200。
- `apps/workbench/src/scripts/client/frame-container.ts` 改为 `toRoute("/api/stage/feed/objects/" + encodeURIComponent(itemId) + "?surface=frame-block")`；保留当前项目前缀/编码/request/错误处理及原reading结构，不改loadFeedBody/loadArtifactBody种类分派。
- `/api/stage/feed`、`/api/stage/inbox`整舞台URL不变。对象surface是单个显式非空值；缺/非法/重复歧义surface、空/多段/坏编码object在动作前拒。对象动作仅收 `{object_id}`，不合并任意query，不借T116 stage_data.input把query塞进对象动作。额外query不进入StagePageModel.request或固定动作输入；actor/project/控制键继续context/网关规则，不能伪造。

**A/B/C精确文件增量（最终父片未采用，仍WAIT根冻结）**：在§4原路径基础上，明确纳入 contracts `packages/contracts/src/platform/ui.ts`（stage_surfaces/object模型；绘制对复用现有UiRenderRequest字段）、SDK `packages/plugin-sdk/src/view-placement-declarations.ts`（可见形状/归属校验）；Host `apps/local-host/src/project-plugin-stages.ts`、`home-plugin-http.ts`、`project-stage-data.ts`、`plugin-stage-fragment-http.ts`、`web-goals-read.ts`、`web-request.ts` / `web-view.ts` 中实际stage模型及绘制结果传递处；Workbench `declared-stages.ts`、`stage-renderers.ts`、`shell-page-renderer.ts`、`page-view.ts`、`renderer.ts`与必要 `index.ts`具名出口；Feed/Inbox实际manifest/贡献descriptor配置。不新增同义dispatcher/registry，也不重做1a/1b。绘制对替换若最终父片还有其他实际caller，先给根准确调用清单再领额外路径，不写“全包必要文件”兜底许可。

原§4.3两客户端URL文件由T402只改路由，T403后续搬迁；两单不同时writer。公开API快照以最终出口实际diff更新 `tooling/gates/api/contracts/platform/ui.txt`（若platform/plugin汇总受同一类型影响，按原api工具实际差异同步，不手造快照）；动作快照仍按实际动作。现有 `tests/stage-data-declarations.test.ts`、`view-placement-declarations.test.ts`、`declared-stages.test.ts`、`home-plugin-stage-pages.test.ts` / `home-plugin-stage-navigation.test.ts`与§4既列Feed/Inbox/route完整文件中补原RAC的A/B/C断言；最终选择以实际被测链为准，不拿名字相同或测试存在签通过，不借新测试文件逃共享锁。

## 5. T403：客户端边界与三个资源的具体审批准备

已有WO足够定义范围；缺的是最终父片上的闭包依赖和资源实测。原五个文件为 `navigation-feed.ts`、`navigation-feed-stage.ts`、`navigation-feed-sources.ts`、`feed-rule-authoring.ts`、`navigation-inbox.ts`。它们当前在Workbench IIFE里，Feed import OWN_DIRECTORY_SURFACES，Inbox直接用document/tabWorkspace/route/showToast/L，不能原样把字符串搬进插件就称factory可用。

**客户端合同**：依Schedule的现有 `(host)=>…` clientFactory与公共mount生命周期，Feed/Inbox只在自己的挂载root里查询/监听；原route/request/语言/标签/打开对象能力从已有Host端口取得，命令写入仍经公开动作/授权，hide/detach中止查询、移除监听，晚响应不能进旧DOM，重新挂载只一个监听。清点每个旧闭包变量→已有公共端口/插件自有状态的准确映射，是正式实施前的最后技术输入；没有现成端口的真实依赖交根具体调用点，不偷import工作台私有实现或为Feed另加宿主特例。T377若先采用，navigation-feed的恢复/重挂载逻辑随搬迁保留，不从旧文件副本覆盖。

**范围**：Workbench browser-assets去两段、客户端原位置删除搬走部分；Feed/Inbox registration.clientFactory和自己的browser实现/构建入口、确需的package.json build/出口；frame-container仅同步既定objects路由，不重写loadFeedBody/loadArtifactBody类型分支（若T402已切则不重复）。样式归插件registration，生成registry沿脚本不手改；Host已有web-assets通用插件js/css路由可复用，不新增Feed私路。现行Feed目录表/历史数据不在本片迁移。

**审批保留为具体最后步骤**：新增 `/assets/molis-work-plugins/feed.js`、`/assets/molis-work-plugins/feed.css`、`/assets/molis-work-plugins/inbox.js` 必须用户明确批准，当前书/原统筹接受方案不等于获批。作者先完成可审阅源码/独立构建实测准备，根提交三份资源各自字节、原workbench.js/css减少量、served总量净变化、为何已有资源不能承载、已试的减量与实际动线证据，再按既有约定与真实Home事项由根组织具体审批；两者授权独立，不以资源批准推导真实Home操作批准。批准前不发布资源路由/预算增长或伪造APPROVED_CEILINGS绕门禁。静态准备不需要先问泛泛“能否新增资源”；资源若最终名字/数量改变，按实际可审阅结果重核，不能沿旧三项批准无限扩展。

**原验收及最终输出**：RAC2515实际served主bundle不含Feed/Inbox客户端（源码扫描只是其中静态证据）；2516～2518真实Feed刷新/reader/frame-block、Inbox重画/状态、出口规则编辑；2519启用/停用随mount装卸。用真实浏览器/Runtime正反控证明隐藏/卸载/晚响应/重复绑定，不能以脚本可编译代签。交客户端闭包映射、资源精确字节及审批引用、构建/资源/生命周期与原RAC实际结果、最终剩余专用表和未验证边界。

## 6. 文件锁和交付核验

本轮完整分页已核三PR的**当前已知硬锁**：

| 当前PR | 与后继的实际交集 |
| --- | --- |
| #1679 PR1a | Workbench renderer/shell-page-renderer/ui-composition/index、Goals src/page及README、ui-host、boundary脚本、金样/出口测试等；PR1c不可并写。 |
| #1680 PR1b | contracts/ui、SDK manifest/page-routes/index、Host project-stage-data/web-goals-read/web-planning/web-request、Workbench declared-stages/page-view/renderer/stage-renderers/ui-composition/index、Goals manifest/page路由、API快照/金样/路由测试等；PR1c/T402均等最终采用与明确交接。 |
| #1654 T148 | web-request/index、Workbench goals-documents/terminal/pane、共享终端合同与web-route-table快照/测试、README/SECURITY/HOME-DATA/资产相关owner；PR2明确等它采用，前片promptRoute/后续terminalsRoute按最终真实TerminalPaneModel不猜可选。 |

这里只是三PR当前完整文件交集，不是全open PR无锁证明；其余资源表、README、privileges、保护分支及同期T377路径需根领取前fresh完整求交。不同段不默认并写，不能新建测试/换路径逃锁。资源预算与共享状态根串行维护。后片采用后才将类型/文档余项交T117/T118，不提前关PG060/064/094。

原三片均full=true，根安排准确头CI Full/SI/Verify；本机仅匹配整体build后的定向完整文件，machine-slot/jobs1，独立临时Home/浏览器，实际影响选文件且不重跑无变化历史整批。API/动作快照与资源/health/boundary/test-import/secrets按实际diff执行；原红/skip/HOLD/UNKNOWN保留，golden正常与RECORD分账，源码审阅不签实际UI。每单最终交base/head/tree、scoped diff、原RAC的作者/独立/CI来源、已采用回读及剩余边界。

本书没有实现、构建/测试、真实Home/模型、coord/GH/ref写入。真正剩余准备仅是：最终前片接口/head冻结；T402对象合同与消费者同批路径责任；T403闭包端口映射和可审阅资源实测/审批；其余沿上述已有accepted WO，不再起同等总书。

## DECISION｜供根冻结的窄增量

认可原归属/顺序和T402同批URL切换；A对象读与HTML绑定同一实际scope/Manifest/contribution/实例，await后失效拒、不fallback；B仅新增stage-opening view的stage_surfaces列表（默认workbench，Feed显式workbench+source-workbench），复用现有directory/overlay目标槽，按贡献+surface去重、同次stage数据读一次；C reader显式persisted-detail、frame显式frame-block，动作固定object_id不并query。上述精确路径/公开形状增量供根冻结，不重审1a/1b、不生成代码；完整PR1/T148等父片采用、路径锁、T403闭包映射及三资源具体审批WAIT不变。本轮只有同PLAN修订和静态合同读取，无源码/coord/GH/build/test或运行通过结论。

## 根裁定（2026-11-01 00:19Z）

A/B/C按上述具体字段、固定对象输入与实际owner绑定采用为后继执行合同；原独立书审增量已关闭，根核现行UiRenderRequest及project runtime绘制链，有限stage_surfaces与绘制对替换不引入第二套名单。完整PR1/T148等各自前置及路径锁仍保留，T403客户端端口映射正在准备；无当前实现/运行完成声明，不预准三资源增长。


## 2026-11-01 W5加速：PR1c开发窗口（根）

一骏要求优先W5并去掉非必要串行核验。原PR1b已在80e3bf2197d2d0ae9adf789fe1c4814288e53568冻结并独立审验通过，进入T394最终承载；解除仅为等待其Full/采用而停止PR1c源码开发的排程限制。开发线3可在独立树从实际main be0c777创建分支，再普通合入该准确PR1b，只实施本书§3及原RAC2682/2684/2685/2686。原父候选并非已采用，PR1c发布/最终采用仍排T394之后；届时普通合真实main并只核实际差量。

T393当前生产写集与PR1c Goals舞台/词典/旧拼装范围无交集；T394保已审成员而不改此处渲染业务。共享API/actions、词典总表的各自hunk及文档/资源根串行，不能取T393未冻结内容。保完整原HTML/路由和可用性语义，T117类型/T402对象挂载/T116 PR2不偷带。作者直接实施，不重写总方案；仅实际缺契约/新产品取舍或同hunk冲突回根。必要golden/声明挂载正反和出口回归按原文件；旧未变验证沿用，不做全套重复matrix/多轮书审。独立验证和加强二审在最终候选各一次。
