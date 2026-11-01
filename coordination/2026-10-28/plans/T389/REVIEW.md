# T389 有限诊断候选独立书审

结论：范围和假设方向可接受，**有一处实施前必须补清的观测合同**；除此没有当前 Blocker/P1 或必须扩展项。H/M各一个完整文件、jobs1/retries0、原点击/断言/时限、失败后停止及禁止第三次Full的安排足够。这里只审诊断，不预签根因或产品修法。

必须修订 [T-389.md 的 RAC-2832](/private/tmp/project-journey-triage/T-389.md:16)：明确“观测不能改变点击顺序”还包括**不在原59两次调用与60调用之间插入额外await、CDP往返、日志落盘、等待或重采样**。否则作者即使没写sleep，`await evaluate(snapshot)`也可能给showFeedSetup/后续pane同步额外收敛时间，使本来要区分的同步假设被诊断自身掩盖。

建议直接补入：在关键步骤前安装测试侧被动事件/MutationObserver记录器，关键窗口只把有限、脱敏的事件/属性变化写入页面内有界缓冲；原有 `plugin('feed') → click(add-toggle) → click(custom_rss)` 的await序列和helper不变，在原60成功或失败后再读取/落盘并finally移除观察器。不要在每次mutation中遍历全DOM并强制布局；geometry/style按初始及终态最小采样记录，确需窗口内采样时单列其触发布局的可能扰动，不把未复现判为原CI已修复。记录身份用测试侧引用/编号，不为观测给生产节点加属性或替换函数。旧PLAN的内部showFeedSetup/setFeedTask“before/after”表述按现候选WO的自然可得附录处理，不为收全它们增加生产hook。这个补充不要求通用追踪框架、无观测对照轮或额外H/M执行。

已读原Full失败日志对应段：1440两次通过，390首轮与内部retry均在第60行Hidden custom_rss。`goal-browser.ts`先取顶层document首个匹配，等待原helper的geometry/disabled条件后才原生点击；Hidden本身不能判断弹层是否打开、哪个祖先隐藏或是否还有另一文档的可见匹配。H/M在journey、helper、Feed及相关workbench客户端上无差异，storage归因仍未成立；T384的2/2不是M对照。

候选其余观测足以支撑本轮有限裁决：按document/pane和节点身份记录所有匹配及原可信add事件，可区分首个隐藏副本/错误文档；dialog/choice hidden与feedView/selectedSource变迁，可区分未打开和打开后关闭；hidden/inert祖先、display/visibility与rect可区分窄屏布局隐藏。若记录不到内部调用，只能报告已观测DOM状态及尚不能归因的调用，不应为“区分每个函数”补生产追踪。仅凭MutationObserver的最终状态也不能外推同步setter的全部中间步骤或确切调用者；WO允许unknown并停止，足以避免过度要求。

RAC-2831已有准确H/M/tree、诊断delta、实际模块解析和matching build要求，能防止把测试侧source/helper与旧dist混用；诊断仅改测试侧时可核抵匹配生产构建，不能以整树dirty一概要求重建。RAC-2833将CI merge输入、H/M本地与兄弟证据分开，保未复现/环境阻塞，不循环试绿，合理。独立Home/profile、公共槽、专用浏览器、失败finally清理及不读正文/输入值/查询串边界已足够；同源iframe不可访问时记unknown，不绕隔离或当作没有匹配。

无需加第三棵树、T384再跑、整片Full或扩大storage审查。根更新同一WO后才可能授权已证故障的最小修复，这条执行边界应保留。发工前落实上述一个观测合同修订即可；本线只写本报告，未改任务书、代码、refs/GH，未运行构建、测试或浏览器。
