# T379 + T380 双片承载独立书审

结论：**双片合成方向可行，未发现必须维持单片的语义冲突。** 现有计划的三份完整e2e加窄组合实操足以作为最小新增验证；执行合同需补清下述两处oracle，避免把不同frame路径或终端DOM证据混署。本文不是实现授权、资源许可或最终M/H采用结论。

已读PLAN、两accepted WO、准确两H生产/测试差分、原独立与二审报告、T379配套文档patch，并只读T384在途树的终端渲染/端口接线。未建分支、合成、运行测试/构建或写GitHub；PLAN列出的预测merge-tree不是本线新执行结果。

**实际接缝与充分性。** T379两生产两测试与T380一生产一测试确无路径交集。T379的真实边界是可信owner发快捷键名单、child排除handled/composing/repeat及`[data-tui-pane],.xterm`、现有parent scope/MessagePort、嵌套侧栏实际source/current/open/visible/inert检查；T380只在Frame恢复时兑现嵌入Goals首页URL，无paneItem才curTab=已校验lastBoard。它不更改快捷键身份或MessagePort。共同风险是恢复后的节点真实可见/当前归属，不是文本冲突；无理由新增统一快捷键框架、布局状态或扩大owner写范围。

T384当前`plugins/native/goals/src/page/documents.ts`把现行`/api/plugins/io.molis.work.goals/goals/:goalId/terminals`传给renderTerminalPane，ports为必填string；真正markup仍由`apps/workbench/src/terminal/pane.ts`产生`[data-tui-pane]`、`data-tui-terminals-route`和自定义命令input，client/panels消费这个route。迁移没有静态证据令T379排除selector失效；最终实际采用M仍须核这条链，不能拿T379旧Host装配或T384预测树代签。

**执行书补清两点（不新增实现范围）：**

1. “右Goals可见时打开/关闭搜索”要预先指定输入来源与目标dialog。应在当前范围已支持的真实插件主区/嵌套Issue来源或现有shell搜索入口操作，同时保持右Goals首页与左CORE，记录实际source frame、owner document及唯一预期dialog。若要直接从右Goals宿主pane按键，先核它现有转发合同，不能把T379的opaque plugin-frame桥默认推广为所有split-pane文档的跨窗搜索。oracle至少钉住左右paneId、左CORE tab/id/固定正文、右无paneItem页面的可见INTERFACES行及可点击性，搜索开关/聚焦前后均不串页，不只比iframe数或hidden字段。三份完整文件已覆盖独立正负例，组合只补这一条交互，毋须重跑scene5/7整链。
2. 终端负例要沿最终组合**生产UI**进入正确Goal的“打开工作区→添加终端→自定义命令”，记录真实输入所属document/frame/goalId、实际`[data-tui-pane]`祖先、可见且非inert、准确非空terminals-route与该Goal的现行route一致。确认activeElement确为该input后发原生K/F，留trusted/handled前后回执、搜索dialog状态、空value与owner terminals读回、terminal创建/执行非GET为0；用真实取消退出。Goals宿主文档的global-search终端排除和opaque child的childNavigation排除是两条路径：前者由这次真实菜单核，后者由现有完整global-ui测试核，不能合称运行中xterm/PTY已验。无需启动PTY/Agent；若最终DOM不再匹配selector，先交具体接缝差异，不用插DOM或强改hidden补绿。

**原证据沿用边界。** T379独立准确H的两完整文件7/7、Todo/嵌套Issue原生K/F、生产终端菜单空输入负例可以继承其未变输入的结论；作者28文件188项仍是作者来源，三条driver准备首败、运行中xterm/PTY未验均保留。T380独立准确H完整plugin-tab-groups首轮3/3及右双击/左隔离/reload/关闭路径可以沿用；RAC2804～2806属于一个case，不算三个case。新M/组合build改变运行输入后，旧结果不能称为组合通过；完整三文件在最终H执行一次jobs1/retries0，加上述窄实操是合理补证。只在差集改变其他既有合同输入时扩大验证，不机械复制README188或T384全部矩阵。

资源结算按T384**已采用**新M重新整体/workspace构建、实际served集合及bytes/hash逐项比较。+559/+179只是估计，旧+324若已在M不能再计增量；旧资源gate失败保持原记录。README新增不变量及S-30只按当前行串行合入，不整段覆盖T143/T148安全条目；门禁/资源tuple精确放行由根处理。三份完整文件、窄组合实操、最终增量审验和准确H的CI/所需SI/一次普通PR Full分别结算；T384旧Full不背签两个新修复，未解释差异不关闭原任务。

因此可在T384实际采用后交唯一writer按该窄范围落地，freeze新M/H/tree/build、重查锁并做增量验证。是否合批仍由根裁；当前无代码证据要求纳入T065/T121，也无理由因旧资源估计或同名模块推定冲突。

## T386候选书窄终核

已只读核`/private/tmp/w6-pair-carrier/T-386.md`，此前两处修订均已落实，**无新增必修项**。A明确固定顶层shell真实入口、原生K/F、唯一搜索dialog及焦点，左右pane/tab/固定正文与右首页URL/可见行/关闭后真实点击均有oracle，不再借此宣称右Goals宿主pane跨窗转发。B明确最终生产菜单的真实input/document/frame/goalId、终端祖先及准确route、trusted/handled回执、空值/owner读回/非GET零副作用；并与opaque child的DOM target完整测试分开，不扩大到运行中PTY/Agent。

作者开发线2、验证线3、二审线5及甲档无一审已写明；三完整e2e一次jobs1/retries0、旧证据保持原来源、T384实际采用后才由根冻结M/交writer、资源实测tuple另由根许可均落实。RAC2823～2825仍是拟登记，本终核未重新查号或授予READY/执行/资源许可。无需重做双片方案审；后续仅按新M实际差集和最终H结算。本次只读候选书并追加此段，无产品/GH/分支/构建/测试操作。
