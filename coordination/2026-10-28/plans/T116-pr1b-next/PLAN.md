# T116 PR1b #1680 父片采用后只读接续

状态：准备完成，等待PR1a实际采用与根交writer；未实现。观察对象：main `3fd857792a27352030ac8f3544a3b57d418febc1`，父1a `7977190e1889b8583310db2423788e88aff6be1d`（仍open），1b `d37ec34c8498ab755bf9e34ba430e5648dacb0a8`（stacked基点旧父`7f389082cc2440875d3a42376a03309efe2b043e`），远端均回读一致。

隔离对象库的两步merge-tree：当前main+父1a无冲突，预测树`520cf441…`；以它作临时双亲提交再合1b亦无冲突，预测树`4cf8e79d…`。这不是已采用树。1b相对旧父的44路径，在预测父上的路径集合、975条增删行及顺序完全相同；10个同路径最终blob因父新增而不同。父增量带入`web-request`的Home导航、`page-view`字段、Goals manifest终端动作、`ui.ts`图标约束说明和golden测试输入；保留父renderer/接口、1b的`page_routes`、`stage_data.input`、`StagePageModel.request`及API快照，不能整文件取一边。当前main自8a46后无1b自有路径交集。父实际采用或main再变时重算，不拿预测树签运行。

原验证评论6543868013**尚未签通过**：三个可信字段`actor_id`、`idempotency_key`、`control_token`若被Manifest声明仍会进舞台request；另有Goals `frame-stage.ts` L/icon方法类型和`factories.ts`包根import两项待修，正文66页基点表述待校正。它们是1b原缺项，不能用无冲突合流消除。旧28/28请求文件、9/9真实UiHost、101/101所有权/入口、Goals HTTP 5/5和两个临时库view 209911B一致仍按旧头/执行者沿用；旧对象的golden六红、两录入skip和额外探针三红保留为历史结果，不能作为新组合允许失败的基线。

具体锁：#1679未采用前不改1b；#1694 T362占`packages/contracts/src/platform/ui.ts`及资源/API接缝，须先由根交接；T380仅客户端tab/Frame/Goals可见性候选池，当前不取其修复或在此片并写。PR1c/T402/T403仍按正式父序与共享文件串行，不借本同步做后片。

获根派writer后，先核真实父/main/旧CI终态与锁，正常接续1b，修上述原必修；匹配build后定向完整`stage-data-input`（含三可信字段拒绝）、`workbench-ui-platform`（owner）、`goals-pages-through-registration`（父manifest+路由），必要时补完整Goals路由文件，不机械重跑旧19文件。刷新公开API快照只按最终源码实际差分，核路由/API、health/boundary/secrets与served；full=true、新head CI/Full及采用由根另结。T380诊断/修复、T402/403及真实Home均不在本片。

金样按实际采用父/main重新冻结：保留最终父的测试、`golden.json`、原始`view.json`及固定Date.now/TZ规则、真实ID与新预期。匹配build后以正常模式完整运行`tests/goals-page-golden.test.ts`，明确关闭`MOLIS_WORK_GOLDEN_RECORD`，开启`MOLIS_WORK_GOLDEN_DUMP=1`；业务失败和原录入skip分别记。全部66份具名完整HTML与准确父的同输入原始DUMP逐字节比较，保留scripts/styles/JSON/真实ID/业务属性，不追加剥字段或归一化。参考侧优先核抵已有效父原始DUMP；仅父或输入改变使它失效时补参考运行。旧31315/7f→d37的66/66不倒签新组合。出现新输出变化先定位具体上游差异、适用参考并交根裁定，不在候选重录压红。

原件：`merge-analysis.json`、三份隔离merge-tree输出、`old-1b.diff`、`predicted-1b.diff`、`patch-readback.json`、`parent-overlap.diff`、PR及评论只读记录。仅本目录临时Git对象/计划写入，无源码、工作树、refs、构建、测试或GH写入。