# T402/T403 挂载接缝窄审

负责人：Codex 独立评审。**结论：同bundle、多独立root、可信mount与有限openView的方向可保留；当前MOUNT-PLAN尚不能整体冻结，有下列四处必须具体修正。** 均是现行调用链与方案的接缝，不要求新消息框架、产品选择或重审A/B/C。父片/锁、PR2等T148、T403资源审批与API-MAP七条缺口保持原WAIT。

只读依据为MOUNT-PLAN、已接受PLAN、PORT-MAP/API-MAP及Git对象 `b6f92222fce89dfba756a580768889292cfe9967` 的frame/slot/view与相关点击/选择代码。未实施、build/test/浏览器、fetch、改coord/GH或真实Home；仅新增本文件。API七条权限问题只引用API-MAP，本轮未扩审。

## 1. 须纠正：来源入口不能统一改成激活source-workbench

§5的source-selection明确让“Feed目录点击source row”激活source-workbench。E的实际入口有两类，不能按标签相似混并：

- `events-primary.ts:327–330` 的data-source-entry-id只调用selectSource；后者在navigation-feed-sources.ts更新来源目录选中、source detail显隐/overview，并按窄屏条件切document，没有调用tabWorkspace打开新view。
- `events-secondary.ts` 的data-feed-task-toggle和data-open-source-record打开Feed并setFeedTask；`navigation-feed.ts:34–36,90–92` 还明确把sources工作面导航归到feed。该链的结果是Feed消息/配置，不是一个新的source-workbench标签。

因此，候选不能仅因source-workbench已有HTML且列在stage_surfaces，就将这些入口都导航到它，或把此前未触发的新视图激活写成“保留现行”。原T402接受的是按声明保留附加main输出；声明能绘制不等于批准改变点击/标签行为。

修订需按上述真实入口固定迁移结果：原Feed任务/打开来源记录仍打开默认workbench并选择来源；原source-entry选择只传给承接原source detail的同owner mount，保留原预览/选中/窄屏行为，不额外制造标签。若原source detail在最终PR2已有明确视图表达，就沿其accepted结果写准确映射；未冻结时保留该局部WAIT，不能自行挑一个新交互。规则仍在默认Feed workbench的section内，settings/rules/添加来源三种入口也不要被“只支持messages/rules”的例子漏掉；不为此新增modal。

## 2. 须补齐：slot wrapper、内层root与文档刷新都消费可信mount

可信 `{contribution_id,surface,target_slot_id}` 与pack.id/bundle分开是正确选择。现行parent.ts把config.surface赋成pack.id，deferred loader又按root.dataset.workSurface找pack；这两处必须随metadata一起改，不能只给factory新增host.mount.surface。

还缺两项已存在消费者的明确处理：

- sidebar source-directory的原根是带hidden的data-directory-panel，没有data-work-surface；现行frame child会回退document.body，root.hidden=false不会解除内层section的hidden。renderPluginFrameSurface当前又总产desktop-work-surface/main风格容器。slot-aware包装须让shell的目录容器继续承担目录显示/尺寸，让frame内被选surface有确定的自有root和正确初始显隐；不能让sidebar容器混入main pool/topLevelSurface选择。只规范当前选中surface的根，不批量去掉业务子面板hidden。空directory/overlay不挂frame的原则继续保留。
- `browser/plugin-frame/view.ts::readPageDocument` 当前重取整页，再按data-work-surface等于旧root值找script[data-plugin-document]。源HTML的sources短名、包feed、声明source-workbench不是同一身份，sidebar更没有该属性。这条已有刷新口也必须按服务器/壳层生成的可信owner/contribution/surface/slot定位实际文档，并保留前后view-revision及scope检查；不能让child自报surface或沿document全局首个feed匹配。若改用现有stage数据读取而不用readDocument，也须写清准确读口和返回形状，不能仍声称旧readDocument天然可复用。

这些修改落在书已列的wrapper/deferred/parent/child/view接缝，可有限完成，不需要高度测量消息或第二个DOM协议。

## 3. 须补齐：source-workbench的首次选择与后续数据刷新

书中“本root定位/显示来源详情”可作为目标，但目前没有闭合它用什么数据、如何在来源改变后刷新。E的selectSource依赖另一个surface里的sourceList行，refreshFeedStage只读取默认 `/api/stage/feed`，替换消息列表/rail/config；旧adoptFeed才另外更新source-workbench。拆成多个opaque frame后，原函数不能直接复用，否则无sourceList会提前return，或者附加root永久持有初始数据。

请明确沿T402同一次stage读取模型为各surface提供初始内容；source-workbench分支只依据自己模型/自有data-source-detail核source id并处理不存在状态，不跨root读目录行。刷新时使用上一节确定的实际surface文档/既有数据口，刷新完成后再应用当前选择；不能从默认stage响应假定一定带source detail。`feed.items.reader/object_action`读Feed item，不得把source_id塞进去冒充对象读取。

来源配置保存/暂停/删除/拉取等现行变更后，哪些已挂目录/默认main/附加main需失效重取，应沿已有变更通知或一次有限shell失效请求写清；选择高亮通知只带view id，不会使另一root数据自动更新。无需所有surface共用业务状态，也不重开API七条授权设计。

每个异步读取/选择须绑定本mount scope、当前source id及请求序号；hide/detach、owner/项目/安装世代变化或新选择后旧响应不更新DOM、busy/finally、草稿或发新导航。PORT-MAP已给生命周期规则，MOUNT-PLAN应将其落实到本新增surface数据链。复用同owner局部数据不能改称“一次stage query永久够用”，也不为刷新重放业务写。

## 4. 须补齐：openView按发送者绑定pane，不按当时focused pane

有限上行intent复用FrameUp.ui与FrameDown.select可行，pageSelection已能把非item detail派给own root；UiPageMessages的side协议确实不适用，不应扩成通用bus。

但E的initialization仅把frame的host.openItem/openPlugin直接转给tabWorkspace，后者按ops.focused(state)操作；多pane则还有带workbenchPane的同源外层iframe转发。scope/page授权本身没有证明一个sidebar root属于哪个pane。仅写“校当前pane”和“目标就绪前保留最后选择”，不足以证明不误开到焦点后来切换的pane。

冻结前明确以下有限映射即可：发送main root时从其可信mount/外层pane relay取得pane身份；共享sidebar交互由shell在接收该次用户意图时捕获其作用pane，并绑定后续投递，不从child接收paneId，也不在await之后重新取focused pane。选择先写该pane的PR2通用view/layout owner，再由它解析目标root并下发select，不能只在frame内改UI而漏掉刷新恢复。接入函数须复用/最小扩展PR2实际提供的按pane导航入口，不能直接复用当前面向focused pane的openPlugin冒称已完成。

目标查找及就绪缓存key须含已选owner/contribution/surface、项目、pane及本次运行世代；同bundle不是同目标。当前deferred selections是document级监听加WeakMap<root,detail>，受board scope清理，不能原样证明sender scope结束删除和旧intent不激活新安装。异步挂载/延迟选择投递前复核原sender、目标世代与pane仍有效，过期则丢弃并清最后意图。广播目录高亮只能投同一作用pane对应的目录mount；共享目录若不属于该pane，则只更新它当前代表的pane或忽略该通知，不能把两个pane的选中态互相覆盖。

这不需要新增持久状态容器：PR2仍唯一拥有布局，pending选择只在本次mount/路由生命周期内存在。PR2尚未采用且准确按pane端口未冻结，保留T403此接线WAIT是正确边界；不能把它连同书面目标一起预签可实施。

## 可保留部分与裁定边界

同feed.js/inbox.js在不同root/frame独立实例化、目录保sidebar/主区保main、pack身份与mount元数据分离、空Feed overlay不建frame、规则section留默认workbench、Inbox对象复用openItem/select、parent不解释Feed业务名，这些选择与当前平台边界相容。source detail的选择函数须拆掉跨frame DOM依赖，shell仍拥有目录布局与通用view持久化。

本轮要求仅为：纠正入口语义映射，补实际root/刷新消费者，闭合来源数据世代与pane路由。修订后可冻结对应有限方案；API-MAP七条、资源审批、T377最终采用差分与原父片等待不被本审解除。没有要求新框架、整套回归矩阵、兼容旧路由或重新审核此前A/B/C。

— Codex，2026-10-31
