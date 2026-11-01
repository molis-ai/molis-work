# T380 独立只读二审

负责人：Codex 二审线1。**结论：准确 H 的本次修复可采用；未发现 Blocker、P1 或当前必须修改项。P2 无新增。** +199 B 资源放行仍待根的最终串行窗口；本报告不预签独立动态验证、CI/Full、场景5/W6 或用户验收。

对象：accepted `coordination/2026-10-28/tasks/T-380.md`；B `3fd857792a27352030ac8f3544a3b57d418febc1`；H `b4382ea8f7ef1c21981dc31d1c4ee1432efe8f5b`，tree `098753789223205b66a86a42621155a4a0aaba93`。Git 确认 H 单亲为 B，实际 diff 仅 `frame-container.ts` 四行与现有 `plugin-tab-groups.e2e.test.ts` 94 行，作者检出为 H 且干净。

## 根因与责任边界

已读 `ROOT-CAUSE.md` 及 `raw/first-right-snapshot.json` 原始命中，并把五个断点位置与保留的 served `workbench-script.js` 对照。context 27 的 URL 精确属于右 pane `towb30rk8` 的 Goals 首页、没有 paneItem；不是左页或右 CORE item 文档。命中包含 mount 的 append/清 hidden、Frame applySurface、Goals sync 和 Frame restore：

- 项目存储带 `activeTab=CORE,lastBoardView=list`；右页内部原为 list。
- mount 清 hidden 后，restoreBoard 曾令 curTab=list、shell 可见；随后 `Object.restore` 再令 curTab=CORE/showFrame=true，按此隐藏已经挂载的 shell。
- 后续 refreshBoard/applyUiState 中 Goals sync 读取 frameActive=true 再隐藏；最后记录的 Frame surface 同样读取 CORE/showFrame=true。最终快照的 shell 父链确在该文档内部 pane 中，shell 自身 display:none；INTERFACES 存在但零 rect。

这些命中与源码赋值一致，足以支持本次窄根因。新 B 观测的 HTTP 200 只属于新运行，原 E 首败网络仍 UNKNOWN。

修复在读取存储并校验 lastBoard 之后、prune/sync 之前处理明确页面意图：仅当真实嵌入、带 workbenchPane、panePlugin=goals 且没有 paneItem 时令 curTab=lastBoard。`tab-workspace` 同样用 paneItem 的存在区分 item/page，父 `tab-workspace-panes` 仅给 item URL 写 paneItem，因此条件与现有 owner 接线一致。当前 pane 的 page/item 意图来自父 tab 与 URL，不再由项目共享 activeTab 抢占；没有增加 pane 镜像状态或改写布局存储。

lastBoard 原先已只接受 list/canvas/kanban，非法或读取失败回 list；修复保留这一校验与偏好，不强制所有首页为 list。普通单栏、非 Goals 嵌入以及带 paneItem 的明示条目不进入新条件。没有 CSS 强显、清存储、隐藏 setter 包装、产品调试钩子或新的合同。

## 回归与原件核抵

已审新测试的实际操作与 oracle：准备 CORE 和右侧 INTERFACES 均为 CDP 双指针，右目标从所属活动 iframe 文档取 rect，加外层 iframe 偏移并检查命中；正确右文档的 pointerdown 收据断言两次 isTrusted，URL 绑定右 pane 且无 paneItem。固定 CORE/INTERFACES 标题与正文不从被测状态反算。测试同时断言首页真实行可见/正文、右 item URL/tab/内容、左 CORE tab 身份与正文、返回右首页、reload 后左右内容、关闭右栏后的原左 CORE tab/正文及一次可见工作区操作。该路径未用 openGoalFrame 合成事件或 DOM.click 触发绿。

`baseline-final-red.log` 是同一完整文件在 B 的真实可见行超时：2过/1失败/0 skip；`candidate-final-green.log` 完整文件3过/0失败/0 skip，均 retries=0。失败位置正是右 INTERFACES 零可见 rect，不是初始化或 fixture 缺失。旧红能发现本缺陷，修后后续两栏/reload/关闭 oracle 实际执行到结尾。

原日志 HEAD 标 B，属于提交前 B+候选改动的运行，不改称提交 H 后重跑。本人从 H Git 内容计算的源码 SHA-256 `6317790295f7fa66271770544fa81a3b8bee51d0142478713a191d29d989f8f7` 与测试 SHA-256 `a9edbbcc771122c7d8c11bdebe03577fae1813dc369a01c17d30d74181926276` 均与作者绑定记录相符；匹配整体构建的原始命令及退出0保留在 final-build 日志。作者来源继续保留。

已读18份 unit、12份 README browser及5份 tabs扩展的逐文件成功行和退出0，另核新目标完整文件，不重跑。已有 Frame/current-tabs/layout 回归继续守普通单栏与恢复；新路径守住本单真实双栏失败。boundary、test-imports、secrets、health 的成功只核抵作者工程检查，不改署为二审执行。早期诊断/误将 --help 解释为全量计划的记录不作为 Full 证据。

## 交接

资源原件绑定 H，对 B 的 workbench.js 为 1,150,291→1,150,490 B（+199）；严格 gate 当前失败、预算/ceiling 未改的状态保留。源码四行与功能有直接关系，是否最终放行由根完成资源窗口后决定。后继 PR2 须保留本次首页/双栏 oracle；本二审不扩入它的 view 统一、T116 搬迁或其他 W6 场景。

本线只读源码/Git/保存原件，仅写此报告；没有新 build、test、浏览器、GitHub 或产品写入。可供根核收本次增量二审；full=true 与其余采用门槛保持原约定。
