# W6 场景5右 Goals 首页首败：独立只读诊断

负责人：Codex 一审线1，与原验证线4分离。**E 的右分屏 Goals 首页空白是已证UI失败；根因尚未动态闭合。最可能是嵌入窗格初始化时，标签页的“显示Goals首页”与旧Frame/Goal工作区状态恢复共同控制可见性，最终没有形成可见首页。现行候选没有已证覆盖这条失败。** 不签场景5通过，不以driver TAP 1/1或后续正常内容标签冲销首败。

本报告补充并取代此前 `/private/tmp/w6-scene5-diagnosis/REPORT.md` 对可见状态owner的未完整清点；旧报告原件保留。已完整读取执行REPORT、right-goals-first-failure.json、journey相关命令/结果与首败截图，并用Git对象读取E和候选。只写本报告，无产品/Host/浏览器输入、build/test、源码/coord/GH/refs写入；真实Home/4207/Keychain未接触。

## 已证事实

E=`8a46c2cb7c596ffec0241dcfcfcfb3cf7552f987`，tree=`6de1342b398a5a0b3736cdacf2e44975f3b3fbab`，沿执行线匹配构建与原环境来源，不移用候选。运行已正常清理，后续观察需由根另排隔离环境，不能再向旧Host发命令。

- journey:93–95及首败JSON固定真实右组头点击（pane tp6rt1wr2，tab trj4je1wy），当时左CORE正常。右组头成为当前项，item CORE不再当前。截图 `raw/failure-step5-right-record-pointer.png` 实际显示右正文空白，与DOM一致。
- journey:96–97在发送记录点击**之前**等待INTERFACES行有rect，10秒失败；行节点存在并不代表它可见。不能归成记录点击驱动失效，也不能声称记录点击已执行。
- journey:99：右frame URL有workbenchPane/panePlugin=goals、无paneItem；readyState complete、desktopSurface=goals、paneEmbedded=true、body可见文字为空。Goals shell为list、goalActive=true但hidden，DOM仍有CORE Frame。它不证明CORE可见或其父链已挂到活动pane。
- 首败网络监听未启用，初始HTTP status/body **UNKNOWN**；DOM complete不能补签200。无已观测Runtime exception不等于无产品问题。后续左右内容标签、刷新/关闭窗格的成功有各自覆盖，未重走这条右首页路径。

## 可见状态的实际owner

以下路径/行号绑定E，不依赖已清理的执行工作树。

| 职责 | 实际代码与行为 |
| --- | --- |
| 父层选择首页/条目并生成嵌入URL | `apps/workbench/src/scripts/client/tab-workspace-panes.ts:238–253`，组头不给paneItem，item才给；原件URL符合首页语义。 |
| 嵌入文档选择应挂的节点 | `tab-workspace.ts:56–94` 的embedded restore；`tab-workspace-panes.ts:14–48,254–277` 在Goals item挂Frame，plugin页挂goal-canvas-shell；`:53–56` mount会清hidden。其后surfaceShows记page并可能不再重复applyPluginDefault。 |
| Frame容器决定“Goals board还是具体Frame” | `frame-container.ts:72–80` applySurface写shell.hidden；`:18,484–497`从项目级`molis-work-frame-container:<project>`恢复activeTab/openFrames/lastBoardView，没有pane限定；`:330–336` restoreBoard回到board。该状态是视图状态，不是Goals业务事实。 |
| Goals工作区同时改shell可见性 | **`plugins/native/goals/src/momentum-client.ts:89–107`** syncGoalWorkspace按active及host.isFrameTabActive决定showBoard，`:93`写goalActive、`:94`写shell.hidden，并改内部workspace frame.hidden。这才是原件goalActive=true的直接写入点，不能只看Frame容器。 |
| 工作台桥接两套状态 | `apps/workbench/src/scripts/client/editing-graph.ts:124–148` setWorkspaceMode在Goals活动时调用syncGoalWorkspace；`:173–215`给两套组件接isFrameTabActive、restoreBoard等端口。`initialization.ts:242` tabWorkspace.restore，`:314` frameContainer.restore，**`:315`又tabWorkspace.apply**。不是“Frame restore后再无校正”的单向顺序。 |
| 静态内容/绘制 | `shell-page-renderer.ts:206`产生Goals shell；`ui-composition.ts`的mountDeclared是服务端绘制入口，不直接拥有浏览器hidden/当前tab。运行时pool/挂载由tab-workspace负责，Goals的列表内容由Goals绘制/客户端负责。 |

shell.hidden存在至少两位明确writer，tab挂载又会清hidden；`data-board-view=list`与goalActive=true单独不能证明用户处于board模式。最强假设是共享CORE恢复后，Frame模式和tab页/挂载节点不一致，再由Frame或Goal工作区同步隐藏列表。它符合“首页URL＋空白＋hidden＋CORE节点”，但**最后写入者、当刻curTab及父链未采集，尚不能认定唯一根因**。也可能是后续apply/workspace同步覆盖，不能只按初始化静态顺序选择补丁。

T377只改失败deferred通知和restore意图；这条Goals shell不据此自动归因T377。当前没有资源失败、权限拒绝或业务数据丢失证据；不扩查这些模块。

## T116/T402候选差集与锁

本轮实时只读PR状态并核Git：

- **T116 PR1a #1679**：open，H=`7977190e1889b8583310db2423788e88aff6be1d`，base=E。相较上轮旧92e头已正常同步，不能继续把旧头当当前候选。上述tab-workspace三文件、frame-container、initialization、editing-graph及Goals momentum-client共7个blob，**H与E完全相同**。shell-page-renderer只改Goals renderer导入来源；ui-composition移除旧Goals renderer wrapper，仍是搬绘制/端口。无该失败修复差分或对应运行证据。
- **T116 PR1b #1680**：open，H=`d37ec34c8498ab755bf9e34ba430e5648dacb0a8`，stacked base=`7f389082cc2440875d3a42376a03309efe2b043e`。上述运行文件中6个blob等于E；`initialization.ts`相对E多旧base携带的feed-start=1运行入口九行，PR1b相对自己的base没有改此文件，tabWorkspace.restore→frameContainer.restore→tabWorkspace.apply顺序不变，首败URL也没有feed-start参数。本片改Manifest数据路由、request隔离及mountContributionsOf权限端口，未见此可见状态修复。不能把stacked候选当main已采用。
- **PR2 / T402**：本轮open PR列表没有对应实现候选；现行accepted后继书 `coordination/2026-10-28/plans/T116-followups/PLAN.md`明确PR2仍等T148采用，统一view/布局重置；T402为Feed/Inbox owner、通用objects路由/挂载，等完整PR1。它们是计划，尚无准确实现头可核“覆盖”。二者的目标不是本条Goals首页空白，不能预支将来迁移为修复。若根另有未公开候选，需按准确头再核，当前不猜。

现有已知共享锁：#1679占shell-page-renderer、ui-composition、renderer、Goals page等；#1680占ui-composition/renderer/page-view/declared-stages、Host路由/合同等；后继PR2计划触及Frame/标签/外壳状态，T402/T403亦有顺序依赖。当前两PR没有改上述7个运行文件，但这**不是全机全PR无锁声明**。修复若落这些客户端，根仍需正式派单时fresh求交并与PR2接续串行；不借“不同段”并写，不为避锁改绘制包。

## 最小必要复现与修复方向

原首败足以保留产品问题，**无需重演整条W6链**。若根决定修复，只需一条原型路径：同一合成项目先开CORE，再右分屏，右组头点Goals；真实点击后观察右列表可见且可进入现有INTERFACES，左CORE保持。复现应继续使用E或明确固定的新基线，不能先取T116候选换掉失败输入。

为选定补丁，最少加一份被动诊断：嵌入tab实际activeTab/viewPlugin；Frame restore读到的activeTab及sync时isFrameTabActive；shell/CORE Frame的parent/hidden祖先/rect；两位shell.hidden writer和mount/apply的先后。记录一次现成失败即可，不合成点击、不强制清hidden、不加等待。若发现具体Frame从共享存储覆盖首页意图，应让**明确pane URL/tab的首页意图在该嵌入文档中保持最终一致**；若是syncGoalWorkspace覆盖挂载，修相应状态接线，不用CSS强制显示绕开。具体代码仍待上述观测，当前不授权或实施补丁。

最小文件候选为 `initialization.ts`、`frame-container.ts`、`tab-workspace{,-panes,-plugins}.ts`、必要的`editing-graph.ts`或Goals `momentum-client.ts`；不意味着应全改。既有回归可选 `tests/workbench-tab-workspace.e2e.test.ts`、`tests/workbench-current-tabs.e2e.test.ts`、`tests/plugin-tab-groups.e2e.test.ts` 中对应真实分屏/首页路径，修复时沿现有文件补能守住此失败的断言；本轮未运行这些文件。

**是否新单：需要一个由根明确归属的窄修复项，才能关闭本次W6真实失败；目前没有证据可直接并入T116/T402既有迁移承诺。** 若现有W6修复项/accepted WO已包含同一问题则复用它，不重复造书/号段；若只有迁移书，根另登记最小修复范围即可。本线不创建任务、不扩成全面分屏整治。最终应分别回报该窄修复工程证据和场景5失败路径的真实回验；原E首败、初始网络UNKNOWN永久保留其来源。
