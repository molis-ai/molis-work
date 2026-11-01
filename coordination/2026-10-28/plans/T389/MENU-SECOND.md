# T389 阶段2独立二审

**结论：已采业务原件足以核收第①类——准确M `15ad4f397018241c8b31625aff8014b89259f239` 上，无关Goal刷新在本次受控交错中关闭用户刚打开的同一Feed来源菜单。没有必须补跑项；作者最终报告有一处完成信号措辞须改，见下。** 这不是旧Linux Hidden custom_rss的归因、chooser关闭或add点击丢失证明。当前没有产品修复候选。本线只读脚本、准确M调用链、原始JSON/log/绑定/清理并实际看两图，没有执行probe、build、测试/浏览器或修改源码、coordination、refs/GH。独立验证线1的结论另计，不冒署其输入审验。

## 输入和执行次数

业务树 `/private/tmp/t389-menu-dev` 仍clean，HEAD准确M，tree `eca97df70b0c53182d70b32ba184508ac1a4f996`。business-M-result中matching生产摘要为`1daeedd848e8d1a5f41a444f4df57771d828db9a4fd9fd329a2ae20f581b65a5`，manifest及独立重算相等，六个public入口解析到本树dist。来源T369 head89119b9不是M整树，沿prepare记录的生产输入匹配核抵；本线没有重建或重复独立验证线的完整输入审计。

首次初始化失败必须保留：seedDemoBoard没有创建fixture首次snapshot需要的Goals board，在browser fixture返回前报goals.board.not_found，业务对照/POST/Response控制均未达到。原件在attempt-1，不能把它改成首次启动就成功。根已在同WO明确允许只改临时probe的seed import/参数；我逐字比较probe.ts与probe-corrected.ts，除此两行无差异。现行seedBoard调用owner初始化建空board、不种样例Goal；这属于显式批准的前置，不冒称它是公共HTTP写，也不计入处理期唯一Goal POST。更早INIT-CORRECTION中的临时Host建议标为superseded，没有实施证据。

corrected probe实测SHA为`80d48011a2313e84115890b3bcf4e09502268cd79750296d213f315ea1cd755c`，与corrected-binding一致。实验business log为一份临时文件、jobs1/retries0、1pass/0fail/skip/cancel/todo、exit0；但脚本catch会记录category3而非让Node用例必红，因此**通过计数本身不证明实验成立**。本结论来自下列status、原始事件、断言路径及截图，不能只引用1/1。

## 已核真实链与菜单状态

同project/session的原件序列如下（ms为Node本轮起点，页面可信事件另有自己的performance.now，二者不直接相减）：

| 事实 | Node ms / 关键值 |
| --- | --- |
| 无刷新对照开始与公开cursor | 1775.672 / 页面C0=Host C0=1，Goal列表空、Feed/all、单顶层、同引用 |
| 正常summary→rail-add→chooser→cancel | 1827.541～1849.656；可信输入到指定summary/add/close，chooser可见后恢复messages，cursor仍1；无compact提交 |
| 唯一公开Goal POST成功与Host cursor | 1851.202～1874.635；唯一新Goal `28f110e3-e18e-4e41-a3e3-98b8d0a1e583`，C1=3 |
| 自然attention读 | network51301.42请求16456.061、响应16487.251，读回board_cursor=3；页面被动attention记录cursor3 |
| 对应cursor读→compact | network51301.43请求16494.866、回observed=3；51301.44请求16519.316，GET/current/无goal_id |
| 真实Response暂挂 | 16580.834；interception-job-3.0关联51301.44，HTTP200，真实body同project、cursor3、新Goal在内 |
| 原生summary打开、释放前快照/图 | 16586.458～16617.293；页面cursor仍1，同menu.open=true，Feed/all/messages |
| 原样放行 | 16617.359～16617.703；Fetch.continueRequest一次，无fulfill/响应重写，挂起36.855ms |
| 提交后快照/图 | 16666.594～16680.632；页面cursor3及新Goal，同menu/root/add/dialog仍连接，menu.open=false；无后续关闭/选择点击 |

Network body-fields回读经异步CDP采集，所以其日志到达可晚于后续请求；不能把“attention字段落盘在cursor请求之后”误读为页面在收到attention之前自行刷新。原页面attention事件、同一个attention响应与紧随的cursor/compact，加准确M initialization的off-Goals监听器，足以支持此轮自然链；没有脚本手发attention或调用refreshBoard。

probe按唯一Feed root查菜单内完整rail-add选择器，保存测试侧引用，原生point检查连接、可见几何、hidden/inert、disabled及elementFromPoint，再发一次press/release；没有共享helper自动reveal、替换函数或直接写业务DOM。处理期只原生点击summary；menu关闭后未点add，未人为制造或“修好”旧坐标竞态。页面记录共13条，包含自然attention及四组可信输入，远低100上限；Node共36条，低于400上限，未截断。对照期间可观察区间很短，只证明当次add通路，不证明长期不自动关闭。

## 正常提交、污染及可点击性边界

本M refresh-decisions在marker更新之后同步调用applyUiState、关系预览/事件绑定和graph分支；本次graphLoaded=false，未走loaded=true时的异步loadGoalGraph。脚本用task后读取cursor+newGoal，并核同body/menu/root身份、Feed/all、mobile=document、选中Feed tab、dialog仍hidden、source未变、无dirty、workspaceMode符合当前有graph节点的分支、documentSyncing=false。workspaceMode实际由focus变graph，**不是所有UI状态全等**；这是既有setWorkspaceMode恢复分支的结果，不据它额外签另一个缺陷。

marker前后documentSyncing本就都是false，故“is-syncing已清”不是本轮独有的尾部完成信号；它不能单独证明rAF执行。本结论使用的是绑定M上完整同步尾段、task后适用状态与无恢复失败/Runtime异常的组合。对照前即开启Runtime.consoleAPICalled/exception及导航/销毁监听，raw failures=[]、无Goal refresh failed，释放后的同task恢复没有已观测异常/中断；不是仅凭cursor或continue回执判成功。没有给内部setter加hook，因此只能把静态调用链与外部状态相印证，不宣称采到了每个setter的精确调用时刻。

控制期compact=0；处理期compact、POST、release均1，无第二refresh/fallback、main navigation、context clear、session detach、网络失败或plugins-changed事件。初始化导航/初次attention单列init，不与控制期混淆。membership网络classify不是覆盖所有API操作的通用探测器，结论应限于脚本唯一业务写、原生输入、现行DOM成员公告和保留的网络白名单；不能扩大为整台Host绝无其它请求。本次同menu/root保持、无成员公告或导航，足以排除这些已列污染对本次前后判据的干扰。

**addVisible只是几何字段。** raw在closed menu状态仍记非零rect/getClientRects，因此名字不能解释为可见/可点击。两图实际显示菜单从展开收回，menu.open也为false；没有在关闭后做hit测试或原生add，不证明关闭后的按钮还能操作。本轮证明来源菜单状态丢失，chooser处理前后都hidden，没有证明chooser被刷新关闭。

business-M.log另有Host `workspace-settings.opened_announce_failed`、`actions.missing` warning及Node SQLite实验性warning，均保留；不能写成“所有层零告警”。它们不是浏览器Goal refresh failed，raw没有显示其造成恢复中断；不在本次顺手修、也不以其存在撤销已采的菜单/commit事实。

## 预算、协议与清理

固定POST15s、cursor10s、自然链30s、hold5s/自动释放4s、commit5s、实验90s、清理15s。实际业务实验14.909s；POST约22ms，cursor首读即3，自然等候约14.7s，Response挂起36.855ms，放行回执到提交快照约49ms，均在预算内，planned放行而非watchdog。Fetch.getResponseBody读真实完整body后再continue成功，未用stream/fulfill/override；这是本浏览器此次实际协议路径，不外推所有版本。

public browser holder PID51252/since在完整business进程前后保持一致，public build准备记录另存；file secrets、系统独立HOME/CFFIXED/XDG/TMP、ad-hoc及专用wrapper参数可回读。business-cleanup记录Fetch.disable、page listeners stop、callbacks settle均成功，pending已释放，无本次残留fixture Home/作用域进程，九个runtime目录移除；我回读runtime目录为空、probe文件已移出、树clean且HEAD准确。未按浏览器名称kill。预算配置及正常清理成功不等于实测了所有超时/断线清理极限，Foundation原生tmp限制照留。

## 最小修法方向（仅建议，不实施）

根可据当前已证行为更新同WO，再安排最小修复：**把无关刷新/状态恢复和用户主动选择来源的收菜单语义分开；恢复同一task时保留当前menu展开及对应railOpen/aria-expanded一致。** 当前直接原因有准确M源码支持：documents-state的applyUiState→setFeedPreset→setFeedTask(...,false)，而navigation-feed-sources:197无论changed如何都remove open、railOpen=false。不要为修此事延长journey等待、自动重新展开、停掉board刷新或全局禁止收菜单。

须保留真实用户意图：summary仍能打开/收起；点来源项时即使重新选择当前all/同一来源也应收菜单；选不同task仍按现行规则重置/关闭相关stage；点Add仍能正常收来源菜单并打开chooser，取消/返回消息继续原行为；来源真正消失的fallback与显式导航/任务切换不要被“同值就不做事”误吞。persist参数当前只表达保存/公告，不宜未经调用方核对直接等同“是不是用户操作”。实现时选局部恢复或明确交互入口处理，避免新增持久化菜单状态、通用协调机制或放宽helper。配套回归只需本次真实刷新保展开并可原生add，以及显式同来源重新选择仍收菜单这两个关键约束，不扩旧CI矩阵。

## 最终报告文字收口

作者最终REPORT已成稿，本线已完整读到，输入、一次业务执行、菜单/几何、Host warning、旧CI因果与清理边界均与原件相符。**仅有一处文字必修**：真实链表中“既有is-syncing收尾已完成”，以及正文“同时观察并等待现有生产收尾rAF移除is-syncing”的完成性表述，应改为“task后观察documentSyncing=false；因前态也已false，不能单凭它证明rAF执行，完整恢复判断结合准确M同步尾段、适用后置状态与无恢复异常”。测试谓词确实检查了false，但原件没有true→false变化或rAF命中记录，不应把检查已有false写成收尾事件已发生。这个措辞修正不削弱上面组合证据，不要求重跑、加hook或增加等待。

本报告核收的是当前受控菜单缺陷证据，不签修复、Full、采用或用户验收。旧T385 Linux首败及其归属UNKNOWN保持。独立验证线1报告本线尚未读到，其成稿/来源由根另核收，不预签其工作。

文字收口回读：作者REPORT表格与正文两处均已改为task后观察false且不能单独证明rAF执行，尾部修正说明保留；唯一文字必修关闭，未补跑或改probe，阶段2原件核收结论不变。
