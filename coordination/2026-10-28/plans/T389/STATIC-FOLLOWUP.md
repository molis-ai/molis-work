# T389 有限静态跟进：rail add → chooser

结论：**没有足以直接裁定本例产品/测试修法的已证缺陷。** 静态可确认一个条件性的“来源 disclosure 被刷新关闭，原采样坐标可能失效”窗口；不能把它改签为旧CI发生事实，也不能把普通Feed刷新或窄屏CSS认定为稳定关闭chooser的原因。准确输入仍为H `44efe84d925b7f01e6f8f837c0bf284471ae7659`、M `6729a2d4655caa603daa369f99884e09c4726bde`。本次只读限定调用链，写此报告；无源码/refs修改、build/test/浏览器/第三树或CI操作。两输入的本链源码无差异，阶段1结果与UNKNOWN保持原记，不追新main。

## 1. 原点击路径与同步边界

- `tests/project-user-journey.e2e.test.ts:59–60`先选择Feed，再用原helper点击rail add，再点custom_rss。`tests/fixtures/goal-browser.ts:144–208`先等既有surface加载谓词，顶层`document.querySelector`取首个节点；必要时通过真实summary点击打开details，等rAF，持续重新取节点，scrollIntoView后再等两帧，测几何/disabled/hit，返回坐标。若covered则有一次move+重新hit检查。随后用**原坐标**依次发`mousePressed`/`mouseReleased`；两命令之间没有再次核节点、坐标或连接身份。这里存在“测量后页面变化”的普通窗口，helper不承诺冻结DOM。
- rail结构在 `plugins/native/feed/src/ui.ts:226–234`：add是`type=button`，在来源details内的aside header，既不是summary、submit，也不是task-toggle；不会按自身默认行为提交表单或切来源。原custom_rss在独立dialog的choices中（同文件467–474），不在这个details内。
- `apps/workbench/src/scripts/client/events-primary.ts:269–276`的document click先处理项目菜单和Feed**filter**面板；不是“点外部关闭Feed来源dialog”。同文件492行先`await handleFeedRuleAction(target)`，对于add/choice目标，`feed-rule-authoring.ts:130–140`返回false；因此后续业务分派并非整个click回调无异步边界。但该分支对这两个目标没有发请求或固定延时，不能仅凭一个await判丢点击。
- add随后进入`events-secondary.ts:10–12`，调用`tabWorkspace.addFeedTask()`。`tab-workspace-plugins.ts:200–204`顺序是`openPlugin('feed') → setFeedAddOpen(true) → setMobileView('document')`。普通顶层openPlugin（74–84）同步修改pane、apply、persist；apply对Feed调用`setFeedTask`（`tab-workspace-panes.ts:175,48`），这些调用处于**本次showFeedSetup之前**。不能把这次先关菜单/重置选择说成“异步在show之后再关dialog”。applyQueued也在apply finally里同步排空（同文件309–312），不是此处额外挂一个网络任务。
- `navigation-feed-sources.ts:123–163,166–172`：open=true调showFeedSetup；只有dialog不存在或aria-busy=true会在默认choose入口提前退出；若add form已有createdSourceId，choose会转setup；否则同步显示choices、隐藏其它stage，设置dialog.hidden=false、feedView=add、railOpen=false，并focus当前可见stage入口。没有等待外部服务才显示chooser的合同。custom_rss成功click分派在`events-primary.ts:493–494`切到setup，届时choices隐藏是正常后置行为。

## 2. 窄屏与外部点击：未见稳定丢目标链

`plugins/native/feed/src/styles.ts:39–43`的rail为details下的绝对定位滚动菜单，带craft-drop动画；helper不是“坐标永久稳定”的证明。原测试已设置prefers-reduced-motion，helper还等待rAF/滚动后两帧并重新取几何；源码与本轮成功事件都不足以断言390px会固定移走add。仅动画声明也不能证明某个CI采样瞬间的位移、命中或运动覆盖情况。

`styles.ts:190–198,243–263`在窄容器把setup panel跨满列，并在feedView=add时隐藏消息列，不是隐藏setup panel或其choices。`editing-graph.ts:100–102`和`immersive-navigation.ts:38–49`按mobileView/窄屏设置pane inert；addFeedTask最后明确设document，正常路径让内容区可交互。若另一次状态恢复把mobileView切回tree，仍可能改变祖先inert，但这需要实际状态恢复交错，不能由390宽度本身推出。

`tab-workspace.ts:327–348`对当前focused pane里的content click不会重新apply/remount；未发现这次add的mousedown/pointerdown必然触发同pane重挂载。其pointerdown/focusin关闭的是tab context menu（294–299），immersive外部click关闭的是source filter menus/目录相关状态（`immersive-navigation.ts:182–207`），不是Feed sources dialog。`navigation-feed-stage.ts:389–395`的details toggle只同步railOpen/aria-expanded，也不关dialog。故不能说“同一次add点击冒泡到外部关闭分支，所以必然关掉新dialog”。

embedded openPlugin会先notifyParent再返回（`tab-workspace-plugins.ts:74–75`），随后add仍在本document开setup；这是有iframe时才需判owner的分支。原旅程不主动分屏，helper一直操作顶层document，本轮四条实际记录也都是单一顶层Feed；没有静态或旧原件证据证明旧CI走了embedded/另一个pane副本。不能用这个条件分支选择修复。

## 3. 可确认的刷新交错，以及不能跨过的因果边界

### 3.1 坐标之后关闭rail：代码允许，但旧CI命中未知

存在以下具体条件链：

1. `initialization.ts:30`的boardLifetime挂在document.body；390–396行允许Goals时4秒poll触发refreshBoard，离开Goals后attention cursor变化也可触发。`refresh-decisions.ts:128–153`有cursor及页面请求的await；本次笔记写入可以改变cursor，但**不代表旧CI一定有这个未完成请求**。
2. response返回后，guard检查可见lifetime、搜索/编辑表单交互、generation/selected是否仍一致（同文件154–177）。`liveUiInteractionActive`（86–95）保护记录菜单/表单、输入字段；**没有把来源details open、add button focus、普通pointer press当作阻止刷新条件**。切到Feed本身也不是这里的取消条件；lifetime属于body，不是隐藏的Goals root。
3. 刷新在commit前才`readUiState()`（188行），再`applyUiState(ui)`（195行），不是在网络请求发起时捕获旧Feed画面。因此不能直接说response把“请求发出时旧Goals/旧mobileView”覆盖回来。`documents-state.ts:118–153`先rememberFeedPresetState保存当前task；186–212行恢复Feed preset，再`navigation-feed-stage.ts:465–480`调setFeedTask。
4. `navigation-feed-sources.ts:197`的setFeedTask**即便changed=false**也会移除来源`[data-feed-source-menu]`的open，关闭rail。这能发生在helper测好add坐标之后、native press/release之前或期间。详情菜单折叠后add不再是那个可命中位置；原helper只等两命令回执，并不确认可信click命中了add/业务handler被分派。该条件交错因此可能导致“add调用返回而chooser未打开，下一步custom_rss Hidden”。这不是390专属，宽屏也有同类窗口；频率/宽度差异与具体浏览器retarget行为未在旧CI记录。

这是一条**源码允许的坐标/节点失效路径**，不是已经证明可稳定触发的故障或历史根因。阶段1没有采refreshBoard请求/commit、helper采样坐标、press/release与这次details关闭的精确交错；当前成功记录也不能补旧失败。若刷新在showFeedSetup**之后**仅以同一个all任务调用setFeedTask，它只关rail，并不关新dialog：`changed=false`不走199行setFeedAddOpen(false)。两者必须分开。

### 3.2 普通Feed stage refresh：不能无条件推导覆盖chooser

`navigation-feed-stage.ts:4–59`的refreshFeedStage有latest-seq保护，网络返回后替换list、rail内部子节点及task configs，保留dialog和choices本身；随后setFeedTask(selectedFeedTask,false)。若原选择对应的rail task已消失，next回all、changed=true，才会在`navigation-feed-sources.ts:199`关dialog；若仍all且all按钮存在，就不会因这条调用关dialog。它会替换add节点，所以在helper坐标与native event之间完成仍可能丢目标，但旧CI没有该请求/节点替换证据。

打开Feed的`ensureFeedWorkbenchLoaded`对本测试生成的`data-feed-stage-directory=true`在`navigation-feed-sources.ts:226–229`直接返回，不会因打开Feed自动发那个stage请求。其它refreshFeedStage调用来自真正的Feed同步/保存/删除/规则动作；本旅程在原60之前还没有执行这些操作，不能凭函数存在假设后台必有一份pending stage refresh。Goal备注提交await其Goal document读回（`plugins/native/goals/src/event-document-client.ts:418–443`），原测试又等新timeline正文，不能把该Goal局部读回直接等同于Feed stage替换。

### 3.3 其它会关/重置dialog的现有分支，均有额外前提

| 分支 | 具体行为 | 在原60前是否已证触发 |
| --- | --- | --- |
| setFeedTask改变任务，或任务消失回all | collapseFeedStage + setFeedAddOpen(false)，sources:179–200 | 未证；boot默认selectedFeedTask=all（bootstrap:149），本轮始终all |
| 页面apply/Feed task message/restore | 可调用setFeedTask；只有改变选择才关dialog，panes:48,175 / tab-workspace:479,551–560 | 未证旧CI值/调用者/顺序 |
| messages tab、显式close按钮 | showFeedView(messages)或close分支关dialog；sources:175 / events-primary:503–507 | 原测试未点击；外部任意click不等于它们 |
| source删除/注册成功、config保存 | 对应异步操作后关闭或刷新；events-primary:389,482–483,549–550 | 原60之前未做这些操作 |
| Feed membership adopt | `adoptFeed`替换dialog**子节点**并重找引用、setFeedPreset；stage:492–515 | 仅came/gone含feed才走；fixture在初始导航前已装Feed，本轮无该事件证据，不能认定到此时仍有membership请求 |
| showFeedSetup early return或改setup | aria-busy / 缺dialog / createdSourceId；sources:124–130 | 旧CI值未知；本轮无busy、首次创建前没有createdSourceId证据 |

## 4. 本轮裁决所缺的精确失败现场

要从上述条件交错选出真实故障，原CI首败至少还缺以下变量；阶段1成功记录不能补签：

1. **原add的实际事件链**：helper最终选中node引用/document/pane、采样点(x,y)/rect；native press/release的真实target与连接身份；可信click是否到达该add（含defaultPrevented/被截断的祖先状态），以及document handler是否进入addFeedTask。仅CDP回执不能回答。
2. **menu/dialog的前后状态**：来源details.open何时被谁移除；showFeedSetup是否被调用、其绑定dialog/root身份和connected、aria-busy、createdSourceId/实际stage；dialog.hidden、choices.hidden、feedView及其hidden/inert/layout祖先。必须区分add未发、开后关、chooser在另一实例、stage已经变setup。
3. **覆盖者的具体证据**：失败窗口是否真有refreshBoard或refreshFeedStage请求与commit（cursor/seq/generation），是否替换rail/add节点；setFeedTask调用前后selectedFeedTask/next/changed及来源；若来自restore/membership/iframe消息，准确来源/owner和顺序。没有这些值，就不能由setter静态名单反推已发生覆盖。
4. **窄屏归属与几何**：当时focused pane/tab/plugin、top/embedded/iframe身份、mobileView、来源menu open、整个祖先链的hidden/inert/rect/style与命中对象。要与原60 helper取到的**同一引用**绑定，不能拿最后goal-recorded截图或下一时刻其它副本说明。

到此结束静态阶段。没有新增执行、观测hook、等待、产品或helper补丁；不对上述条件路径做未经授权的控制实验。后续需根依据这些缺失值裁定，当前仍不具备提交某个“等待chooser即可”或产品改法的证据。
