# T389：来源菜单跨真实board刷新的一轮受控实验建议

状态：仅方案；未执行、未写源码/coord/refs/GH。实验输入须由根另给**实际已采用main的准确SHA**，不拿本地origin/main或旧H/M冒充。目标仅证明或排除该输入上“无关Goal刷新关闭当前Feed来源菜单”的确定状态丢失，不预签缺陷，不归因旧Linux Hidden custom_rss。

## 可行性与静态前提

`STATIC-FOLLOWUP.md`所列旧H/M链可设计为公共页面/Host实验：真实Goal HTTP写入提升project board cursor，Feed前台的自然attention读取带回cursor，触发body-owned refreshBoard；在真实compact refresh响应返回处暂挂，原生打开来源details，再释放响应。测试不调用refreshBoard/setFeedTask/applyUiState或手发attention事件，不修改生产函数/共享helper，不伪造response内容。

已有 `tests/assistant-stop-settles.e2e.test.ts`使用 `Fetch.requestPaused` 的Response阶段读取真实响应，`tests/late-list-responses.e2e.test.ts`的网络闸门支持指定Request/Response阶段并用 `Fetch.continueRequest` 放行；本probe禁止前例的response改写。现有goal-browser返回command/sessionId/on/web/evaluate；`tests/plugin-frame-readiness.e2e.test.ts`用公开 `web.post(prefix + '/api/plugins/io.molis.work.goals/goals', {title,…})` 创建Goal。这些只是可行机制线索，根给main后先只读核当前公开路由、响应结构、CDP读取后原样继续的支持情况和fixture仍有效；不保证旧代码在新main重现。

## 输入、隔离与一次性预算

根在同T389更新实验授权后，唯一writer在准确main的独立树用现有公开Host、页面与test-kit准备一个临时probe。只做一个390×640视口、一个全新project、同一页面的一次无刷新对照和一次受控刷新；不是重跑H/M或整个journey，不建永久工具/测试框架。该宽度沿旧症状选择，不能据此称390专属；不加1440矩阵。专用Chrome/profile、临时Home、file secrets、无真实模型/个人凭据/4207，公共build/browser槽，匹配构建经输入/实际解析核抵，否则按现行要求整体build。执行前记录main SHA/tree、probe delta和构建/模块解析。

## 顺序与闸门

1. **准备稳定的公共页面。** 用项目catalog公开操作安装Feed，初始导航在安装完成之后；页面从项目根进入Feed，确保顶层单pane、无选中Goal、Feed task=all、无打开输入/记录菜单/dirty表单、页面visible且body连接。仅读 `#molis-work-data` 的project id/cursor及允许的DOM状态；项目路由、HTTP客户端project和frame/session三者一致。不在同窗口改插件成员，不制造Feed sync/后台业务写。
2. **无刷新成功对照。** 不写Goal，确认Host公开cursor与页面cursor C0一致，当前没有board-refresh请求在途。原生点 `[data-feed-rail-toggle]`，只读确认同一来源details.open及rail-add可见，然后用原native click选择rail-add，确认chooser可见；原生取消chooser回messages。这验证正常add通路。其间监听实际网络以确认没有board-refresh提交；若出现一次，标为对照不满足，不重复对照。attention/cursor读取无变化不等于刷新提交，可保留其事实。
3. **准备有限网络闸门。** 只对准确origin、准确project的 `/api/board/refresh?...` 在**Response**阶段拦截；当前session且第一个匹配响应暂挂，其余按明确策略立即放行并记录，禁止通配挂住attention/Host写/资产。安装页面公开状态节点的被动MutationObserver或Node侧只读条件等待，用于提交判定；不给节点加属性，不替换函数、不采点击坐标、不制造业务状态。该probe不同于旧失败后取证，允许这些测试侧控制，但须单列它们对时序的影响。
4. **正常公开写入，等待自然链。** 在Node侧通过fixture授权HTTP客户端调用本project Goals公开创建动作（不直写库，不调用内部application，actor/project由公开调用合同处理），用唯一固定测试标题/idempotency键，等HTTP业务成功。再用公开board/cursor读取得C1，须C1>C0；Host派生视图有catch-up则按现有公共等待条件有界读取，不改数据库。Feed前台由自然attention poll（旧实现15秒；切插件也会触发read）得到board_cursor并触发refreshBoard，不手发CustomEvent、不切visibility、不mock timer、不另开页面触发。等确实出现匹配的真实response-paused事件，整段只允许一个固定预算，例如30秒；按事件/状态等候，禁止sleep后猜测刷新已发生。没有请求就是本次前提未满足，不能改为直调函数或再跑一轮。
5. **响应暂挂时开菜单。** 核被挂请求确为预期project、compact refresh，HTTP2xx、响应可正常读取；如需 `Fetch.getResponseBody`，只读真实响应并脱敏提取公开state project/cursor，响应体不落盘、不改写。须确认携带预期新cursor（或一个明确更新的Ccommit）且页面仍C0，页面没导航/reload，Feed前台、同task all、selected仍null、body同一引用。原生summary点击打开来源details，只读记录open=true、同一menu/rail-add引用及最小rect，并截“释放前”。不得用helper去点尚隐藏的add，以免helper自动展开掩盖状态。
6. **释放并判真实提交。** 一次 `Fetch.continueRequest` 放行原始response，不fulfill伪造内容；记录回执不作为提交证明。等待页面公开 `#molis-work-data` 的snapshot.cursor成为Ccommit（并核project仍一致）及预期新Goal id进入公开state；这是refreshBoard写入新state的可观察证据。旧链中state节点赋值在applyUiState之前，但二者在同一同步JS task中，MutationObserver回调/随后一次CDP读取在该task结束后才运行。因此提交判定需在该回调或task后同次快照读menu.open/task/dialog，不能只用Network.loadingFinished或response回执。当前main若引入后置async恢复，必须按其真实合同另找完成信号；找不到就判提交边界不足，不拿任意rAF/sleep替代。
7. **判定后停止。** 在任何后续native click前，保存同一menu是否仍连接、open、rail-add几何、Feed/task/mobile状态及截图“提交后”。若open变false，且同menu、同task all、无用户关闭/选择事件、无membership/其它刷新，支持“无关刷新丢失已打开菜单”的当前缺陷。若menu替换也记录新旧引用与新menu状态，不能把旧node.open当当前菜单。若open保持且add可见，原生点击add并确认chooser作为受控分支成功；不再制造第二次刷新。若已关闭，**不再调用会自动reveal的click(add)**，以免掩盖事实，也不继续模拟旧CI的坐标竞态。

## body lifetime、poll与scope的必须核点

旧实现boardLifetime绑document.body，Feed隐藏Goals本身不会令body不可见；Goals前台4秒poll，Feed前台改由attention的15秒自然读取触发。probe全程Feed前台、body visible，故不依靠Goals poll在切屏前恰好启动。若main改成surface lifetime，当前链可能不会发请求：如实记前提不成立，不绕过生命周期。记录attention响应中本project board_cursor、真实board cursor请求及compact refresh的顺序；Home attention的board_cursor=null或其它project请求不能核抵。控制期不聚焦input/textarea/select，不开保护中的Goal表单；来源summary/button focus本身是否拦刷新要按当前代码核。刷新selected/generation检查若导致返回、导航或延后，记录实际分支可观察证据，不能把已收到HTTP当apply成功。

## 原件、预算、清理与裁决

保留：准确输入与probe diff；公共POST成功的目标project/新Goal id和C0/C1/Ccommit（不含控制令牌/body）；网络事件的session/request id、脱敏路径种类、状态和相对时间；response暂停/放行/页面提交三个独立信号；对照与处理分支的menu引用/open、同task/Feed和body状态；最小前后截图、异常与清理原件。不上报正文/完整响应/URL查询串/凭据，Screenshot仅全新隔离fixture。记录观测与闸门有意改变调度，仅证明该可发生交错的当前行为，不测自然发生频率。

最多一轮：无刷新对照一次、公开Goal写一次、受控response一次；各阶段预算及总预算执行前固定，失败不自动retry，不以增加sleep或第三棵树补洞。所有exit路径finally放行/终止本次仍挂的request、Fetch.disable、移除本次listeners/observer，原fixture关闭Host/浏览器/profile/Home，按本次pid清理；body已销毁/连接断开则记录无法释放但仍完整teardown。不能让挂起请求泄漏到其它用例。

有效结果只有三类：①可靠commit后菜单关闭，当前缺陷得到受控证据；②可靠commit后菜单保持且add成功，本输入这一交错未显示缺陷，不能排除别的交错或旧CI；③未能建立真实公共写→自然refresh→可靠commit链（或对照被污染），**无有效复现结论**。第三类不换成内部setter实操，交根具体缺口后停。任何产品修法或永久回归均待实验结果后由根更新同一WO；此方案不授权实施。
