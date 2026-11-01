# 共享核心承载计划独立增量审阅

结论：**计划须补两项具体合成修复，再作为执行依据；没有发现必须把 T143 排除在四片之外的新安全冲突。建议满足共同等待条件后采用四片普通承载 PR，同一最终 H 跑一次 `full-suite`。** 本结论是只读源码与计划审阅，未构建、未跑测试、未触发 CI/Full、未修改仓库或 PR；不代表预测树已可用或可合并。

审阅对象：`PLAN.md` SHA-256 `0cb549070f0aa05196438be6b8defdbfe7ea633e1ef0db9b1cecc0183d790069`；main M `328d5b612ef47214378ecd55e32a648228c120f3`。仅四候选：T362 #1694 `64abea988ccd65416beb74bfc3d278e2afbff7bc`、T148 #1654 `b35298d08d58cbfca089b8f928724558452460c8`、T116 #1679 `7977190e1889b8583310db2423788e88aff6be1d`、T143 #1675 `420e6c7c8534e6a5bed27ff9f01d755dc7832841`。源码证据读取计划对象库中的三片树 `38c208fe5a67b004cf689da917bfde5266a39781` 与四片树 `0aa887e7cff0718753a7277b633ff485b19190ff`，不是未来最终 H。

## 必须修正的执行合同

1. **[P1] T148 × T116 的新增必填字段没有贯穿迁移后的页面端口。** 四片树 `plugins/native/goals/src/page/documents.ts:120` 已由 rename 合并带入 `terminalsRoute`；`apps/workbench/src/terminal/pane.ts` 的 `TerminalPaneModel` 要求 `terminalsRoute: string`，实际 HTML 也读取它。但 `plugins/native/goals/src/page/ports.ts` 的 `GoalsTerminalPaneModel` 仍只有 `promptRoute`，没有 `terminalsRoute`，而 `apps/workbench/src/renderer.ts` 将生产 `renderTerminalPane` 直接传给该端口。端口特意采用函数属性保持严格参数检查，因此这里是可定位的合同不一致，不能把“Git 已带入路由”当成集成正确。本审阅未运行编译，不把静态判断写成已观测的 build failure。计划应给唯一 writer 明确允许的最小合成修复：补齐此必填字段及必要说明，保留函数属性，不用类型断言或双向参数检查绕过；最终 build 与 Goals 页面→终端路由→动作实际测试验证。三片同样需要此修复，退到三片不能规避它。

2. **[P1] 金样必须随已接受的 T148 HTML 变化建立独立参照，不能只写“保 66 份金样”。** T148 的生产终端 pane 新增 `data-tui-terminals-route`；T116 原头到预测四片树的 `tests/goals-page-golden.test.ts` 和 `tests/fixtures/goals-page-golden/golden.json` 无差异。该属性不被当前 golden 的 markup 过滤器去除，因此旧期望与组合产品输出存在明确变化来源。计划应照该测试已有重录说明：用包含同批非 T116 产品变化、但不含 T116 renderer 迁移的干净生产参照，复制同一冻结测试与 view，固定时钟/UTC，独立构建并生成期望；候选只消费期望，不对候选自身 RECORD。保留双方 66 份完整 HTML 并比较，不仅比较删去 scripts/styles 后的 hash；检查相对旧期望的变化确由已接受产品改动造成。允许这项有依据的 golden 更新进入合成差异，由独立增量审验核收。不能删属性、放宽断言或把失败当迁移原本就允许的差异。

以上是组合带来的必要修复，应在计划中显式允许、归责并审阅，不必为单字段和独立期望更新重开整片设计。原 PR 的作者/独立证据仍绑定原 H；新增修复证据绑定承载最终 H。

## 四片收益与安全接缝

修订版已正确保留 T116/T143 重复首败记录：旧 aggregate success 不能免 README §9 所需的新组合 Full，当前 T143 运行也不替代修复采用后的新 Full。四单片四轮、双片加两单片三轮、三片加一单片两轮、四片一轮是合理的理想成本比较，不包含失败与重试。

三片和四片都必须解决上述 T116/T148 接缝；四片新增 T143 的共享路径主要是 Host 出口、文档、安全不变量与登记，没有发现另一片修改其模型 broker / relay / 图片处理实现的情况。T143 当前 Full 未终态与 T383 未处置，是所有新 Full 的共同等待条件，不是永久只选三片的理由。根已明确希望一起解锁 Home/Goals/资源/终端前提，因此在真实新 main 上重算后，四片收益明确；没有必要先默认三片、再为 T143 单跑一轮。

安全边界需要区分两件事：T362 的 `settings_address` 是页面导航地址声明，不能成为 T143 模型设置的权限或配置输入；T143 的安装身份来自调用上下文、模型选择受现行声明/授权约束，不能接受页面 query/hash 提供可信身份或地址。现有源码未见两者合成后新增绕过。T362 仍需维持 reserved query（含 embed）与客户端当前导航项检查；T143 保持 relay 生命周期、取消/撤权后 held-result 拒绝。没有证据要求新建一套“设置 × 模型 × PTY”笛卡尔测试矩阵。

沿用 T143 原强审与当前同步二审、独立验证的限定结论：未变的签名包、Seatbelt、TLS 与模型安全输入可继承既有 Mac 执行证据；Linux skip 仍是 skip。最终合成必须检查相关源码、fixture、依赖及安全文档的实际差集；出现影响这些边界的变化，再补准确的 Mac 动态验证。不能因“同属共享核心”要求整套旧证据无差别重跑，也不能因文本无冲突宣称所有安全运行已经通过。T362 已有证据覆盖声明→内置 catalog→section→客户端；不能把它扩说成已证明动态安装插件的设置入口支持。

## 最小新增验证与结算

- 唯一 writer 实际合成，完成端口与独立 golden 更新后，执行整体 build、计划中完整测试文件。补入已有终端路由合同的完整 `tests/web-route-table.test.ts`；保留完整 golden、goals-terminal、desktop-tui（含真实 PTY/T377 断言）、plugin-global-settings、security-invariants-plugin-pages，以及 T383 指定完整失败文件和 goals-dialogs。不是只挑曾失败的单个 assertion。T143 的适用安全文件由最终 H 的 SI/Full 覆盖；如实际合成改变安全输入，再定向追加。继承的旧运行与这次新运行分开记。
- 保留计划的 boundary、merge-base health、test-import graph、API/actions 合同、48 served 资源/page-assets 与 secrets 检查；T362 +324B 一次性许可按最终 main 的真实基数重核，不机械复制旧放行。若 T382 在等待期采用，重算 rename、入口、web-goals-read/web-composition 等真实交集；不把当前预测树当冻结未来 main。
- **把步骤 3 改为普通承载 PR + 一次 `full-suite`，删除默认 integration 镜像路径。** 最终 H 的 Verify/适用 SI 与入场审验满足后再启动该 PR Full；本任务不需要验证额外 ref 的 rollup 归属，也不需要修改 workflow、门禁或调度器。当前运行终态与 T383 处置前不启动。实际 checkout/head/tree 必须记录；main 漂移按实际差异重新裁定，不能背签旧 H。
- §8 结算只落实际承载 PR 的同一最终 H。未变范围继承原准确头审验，端口、golden 与真实共享差异给独立增量结论；任何新 H 重新界定证据。旧失败、首轮重试、skip、UNKNOWN 全部保留，不写成四原 PR 自身都满足了新 H。
- 原四 PR 仅在承载实际采用且 main 回读后关闭并标“由承载采用”。按路径/blob/rename/合同/快照与必要逐行差异核收；完整 patch-id 不等不自动拒绝，因为已明确的端口/golden 合成修复本来就可能导致不等，但每个不等必须解释并由最终 H 证据覆盖。未解释差异对应任务保持 open；不把原 PR 标为自身 merged。

决策建议：**四片，附上述两项最小合成修复与单 PR Full 路径。** 若新 main 或实际安全差集出现未能解释的变化，再依据具体证据缩小批次；当前没有证据支持仅因 T143 仍在跑或安全范围较大就预先排除它。此审阅没有启动实施的授权效力，由根按已有授权裁定执行。

## 追加：共享文件与资源基数只读核对

根已接受两 P1 并安排改计划；根另已核 T143 16 片及聚合 success，本线未重查该运行，也不改变其历史首败账。此次 GitHub main 回读仍为 `328d5b612ef47214378ecd55e32a648228c120f3`，尚未采用 T382。四片各自 `merge-base(M,H)→H` 的同名共享路径仅七处：T362/T143 的 `docs/platform/PLUGIN-DEVELOPMENT.md`；T148/T116 的 `apps/workbench/README.md`、`scripts/workspace-packages.mjs`；T148/T143 的 `apps/local-host/src/index.ts`、`docs/system/SECURITY-INVARIANTS.md`、`specs/BACKLOG.md`、`tooling/gates/giant-exceptions.json`。读到的文档/导出/登记 hunk 分属不同条目；巨单元分别是 project catalog 与 SandboxBroker/Home 安装工厂，没有同一单元的大小覆盖。另有前述必须按 rename 看见的 Goals documents 接缝。未发现新增阻塞。

资源账本核对：M 为 **48 项、7,469,195 B**，四片预测树为 **48 项、7,469,519 B**，唯一差异是 `/assets/molis-work-workbench.js` **1,150,291→1,150,615（+324 B）**，与 T362 的 `APPROVED_CEILINGS` 精确元组一致。T148/T116/T143 的自有 diff 均未改资源账本、资源门禁或 `web-assets.ts`；它们旧头的 images.js 19,877 B 不能覆盖当前 M/组合里的 19,897 B。这里核的是已提交账本和许可，不是本线重测 48 项 served 字节；最终实际构建测量仍由承载验证完成。

T382 当前候选 `4f3d4d03e07a5701b74060e14d6bf9c8fa47881f` 的资源账本与 M 逐项相同，也不改上述门禁/服务路由，故其**已审候选本身不会改变 +324 B 的基数**。它与四片并集共有九路径：除 index/SI/BACKLOG 外，还有 `web-composition.ts`、`web-goals-read.ts`、`tests/host-pages-error-model.test.ts`、`scripts/check-package-boundaries.mjs`、`tests/workbench-entry-exports.test.ts`、`specs/repository-anti-corruption/privileges.md`。当前实质代码交点是 artifact 导入改名与 T148 移除 panel/T116 迁移 Goals 的不同 hunk；无新增安全机制冲突。采用后须以实际 main 重核这些引用及 artifact 新名存在/旧生产引用已消除，保留既定 build/boundary/完整文件验证即可，不额外造矩阵。若等待期还有别的资源改动，才按新 main 与实测重新裁许可，不能仅因“T382 已采用”机械重绑或抬高上限。本次仅追加本报告，无测试、构建或实现改动；强模型窄审到此结束，日常调度交回根按 Sol 处理。
