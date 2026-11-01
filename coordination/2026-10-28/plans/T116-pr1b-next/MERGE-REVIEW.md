# PR1b 正常双亲 merge：最小解冲突二审

状态：**方案通过，可以按本报告解冲突；不是已解决、构建通过或最终 H 二审通过。** 无需重开设计。当前必须落实的是以准确 M 为底的完整 slice 投影和保父核对；不能只处理 Git 标出的 19 处冲突。

## 准确绑定与只读结论

- M：`db29f18d4f602fa8d9efb689a6a766aa9b07625f`。
- 冻结 H1680：`d37ec34c8498ab755bf9e34ba430e5648dacb0a8`。
- PR1b 自有增量基点 B：`7f389082cc2440875d3a42376a03309efe2b043e`。
- 实际共同祖先：`31315ea6c7a12aec35cceb0b064cc0d649d53237`，本线以 Git 对象重新核实。
- `/private/tmp/t116-pr1b-dev` 回读 HEAD=M、MERGE_HEAD=H1680，仍有 19 个 unmerged 文件；相对 M 的当前 index 列出 47 路径，其中 slice 外只有 Goals README、page/ports.ts、golden.json 三处冲突。
- 独立 `git diff B H1680` 是 44 路径、827 加行/148 删行。M 相对 T384 `4404e142662cbd7895f46c1c6df6e5efe5e6e135` 只有 T369 新测试与 T388 stop-feedback 等待修改，相关生产输入没有漂移。

B 是内容增量的基点，不能把它描述为 M/H 的 merge-base。已采用父片的 squash 历史使本次正常 merge 看见旧父差异；旧隔离预测树 `2d8c5c…` 不证明本次普通 merge 零冲突，更不是本次实际结果树。

本线另做了只读内存差量核对：读取准确 B→H 的 unified hunks，在 M 内容中定位，不改源文件、index、对象库、refs 或工作树。42 路径的 U3 原上下文逐块唯一匹配；manifest 的首块因新增 terminal import 使 U3 不匹配，核清相邻内容后 U1 唯一匹配；privileges 的首块因邻接 PG-058 已更新使 U3 不匹配，仅取确切 PG-060/PG-094 全行替换后唯一匹配。合计 **44 路径、74 块均可投影，逐块反向撤去 slice 后精确回到 M**。这证明内容投影可行，不是 Git merge 执行、运行时验证或已生成的 tree。初次 U3 的两处未匹配如实保留；未把它们当作源码错误或用模糊匹配掩盖。

## 必须遵循的解法

保留当前 HEAD=M / MERGE_HEAD=H1680 的正常双亲 merge。以“全部 M 内容 + 准确 B→H 自有差量”作为**全树期望**：44 路径以逐块投影核对，其余路径全部保持 M。不要从 H1680 整文件取回 slice 文件，也不要用旧父整树覆盖 M；slice 外三处冲突恢复为准确 M 是保父，不是对两侧源码整体选边。不能只清冲突标记而放任自动合并区未经检查。

先取得并保存纯合流结果的实际 tree/scoped diff，再补已接受三必修；最终 H 的差量应能分清原 44 路径投影与三修复，新增范围只允许 frame-stage/factories 两叶子及原范围内的配套断言/API生成结果。不要求额外提交体系，也不改旧分支/rebase/force。44/975 是本次准确 delta 的核对值，不是新增仓库门禁。

## 必须关注的文件与 hunk

| 文件/区域 | 必须得到的内容 |
| --- | --- |
| `plugins/native/goals/README.md`、`src/page/ports.ts`、`tests/fixtures/goals-page-golden/{golden,view}.json` | 不在自有 slice，逐 blob 保 M。README 保新增 `goals-terminal.test.ts`；ports 同时保 `promptRoute`、必填 `terminalsRoute: string` 与 RAC-2817 注释。`page/documents.ts` 真实终端路由传入也逐 blob 保 M，不因其无冲突而漏核。 |
| `tests/goals-page-golden.test.ts` | B→H 仅增加 10 行受 `MOLIS_WORK_GOLDEN_VIEW` 开关控制的 view 生成说明/用例。保 M 的 NOW、Date.now mock、UTC 设置及恢复、原始 method ID、完整 DUMP 和父参考说明；不能恢复 H 的 `settled()`/custom-method-ID 归一化，也不能删固定时钟。正常验证关闭 RECORD 和 GOLDEN_VIEW。 |
| `apps/workbench/src/index.ts` | slice 只增加 `mountContributionsOf` 与 `stageDataInput` 导出；保 M 的 `renderHomePluginNavigation`、`HomePluginNavigationEntry`、HOME_MODEL_SETTINGS_CLIENT_SCRIPT 与 SETTINGS_ADDRESS_* 等现有导出。冲突里的旧 H 单独 `homeToolKeysScript` 不能覆盖当前行。 |
| `apps/local-host/src/index.ts` | slice 只把 `declaredStageRequests` 加进 project-stage-data 导出；保 M 现行 SDK/terminal/MCP 等导出、已删除的旧出口状态与 `artifact-library-http.js`，不恢复旧 web-panel/whole-units 出口。 |
| `apps/local-host/src/web-goals-read.ts`、`web-planning.ts`；Goals `page/{routes,planning-request,index}.ts` | 成套接入 `matchPageRoute` → `DeclaredPageRouteMatch` → Goals owner 解释/读取/渲染。保 await、拒绝后不加载 owner 的顺序、planning 的 400 refusal 及原个人/项目选择语义，接口、调用者和测试一并接续，不能只替 import。web-goals-read 的 Artifact import 保 M 的 `artifact-library-http.js`。 |
| `apps/workbench/src/{renderer,ui-composition}.ts`、`packages/ui-host/src/{index,declared-mount-host}.ts` | 成套保 slice 的 `mountContributionsOf(GOALS_PLUGIN_ID)`、owner 参数与 UiHost 实际 owner 拒绝；保原通用 `renderWorkbenchContribution` 路径。相应 registration/package-boundary/workbench-ui-platform 断言也保 slice 变更，不能为解冲突退回无 owner 的挂载。 |
| `apps/local-host/src/web-request.ts`、`apps/workbench/src/page-view.ts` | 合 slice request/route 变化，同时保 `home_plugin_nav` 读取、类型字段及已经移除的 desktopPanelRoute。 |
| Goals `manifest.ts`、`index.ts` | 仅加 GOALS_PAGE_ROUTES import、`ui.page_routes` 和 slice 导出；保 GOALS_TERMINAL_ACTIONS import/actions、terminal-list/open/close/advance-prompt 路由、terminal/workspace 权限与 terminal-actions 导出。首块上下文有父新增 import，不能以整段旧上下文覆盖。 |
| `packages/contracts/src/platform/{plugin-manifest,ui}.ts`、`packages/plugin-sdk/src/{manifest,index,page-routes}.ts`、API 快照 | 同时保 page_routes/stage_data.input/request 和 M 的 settings_address、T143 现行声明/校验与 T148 terminal 合同。API plugin.txt 中 program/subject/list/close/panel 等父合同不能退回旧 command/args；最终从源码生成本片差量，不手拼历史快照。 |
| `scripts/check-package-boundaries.mjs`、对应两份 boundary 测试与 workbench-entry-exports 测试 | 加 slice owner 挂载约束，保 Artifact 新路径及其现行检查。自动合并成功也必须与 M+slice 对比。 |
| `specs/repository-anti-corruption/privileges.md` | 自有变更仅 PG-060/PG-094 两行；保 T382 顶部路径说明、T147 的 PG-058/PG-068 和其它父更新。U3 中相邻 PG-058 不是本片要修改的内容。不要顺手销 PR1c/T402/T403/T117/T118 后账。 |
| `tests/goals-document-routes.test.ts`、`goals-planning-ui.test.ts` | 保 slice 的真实 Manifest matcher、异步读取/拒绝、错误与 owner load 计数对照。两份文件这次确在语义接缝和冲突里，应纳入最终完整文件验证，或提交同输入有效原件的明确核抵理由，不能只以“曾跑过”跳过。 |

其余原 slice 路径仍以准确 B→H delta 为准；未列出的 M 路径（包括 T369、T388）不能改变。尤其不能仅用“19 个冲突清零”作为合流完成判据。

## 解后验证与最终二审入口

1. 纯合流结果相对 M：路径集合恰为原 44；逐文件增删内容保持原 slice，父新增/删除内容均保留。核全部未冲突文件和文件模式；slice 外逐 blob 与 M 相同。19 冲突清零、无标记只是必要条件。保存实际 tree 与 scoped diff，最终 merge 两亲必须是所绑定 M/H1680。
2. 三必修不变：三可信名的显式声明拒绝和投影独立拒绝；L/icon 函数属性；factories 原 owner 叶子导入。沿原合同分别移除两道拒绝、恢复 MethodSignature/根 import 的负例，恢复后绑定源码/dist。不得把静态断言称为运行时拒绝证据。
3. 匹配整体 build 后，完整 stage-data-input、workbench-ui-platform、goals-pages-through-registration、workbench-registration-boundaries、普通 golden；上述两个 Goals 路由文件按真实接缝处理。各包 README mandatory 逐项核抵/执行，affected 建议不豁免它们。不新增或重演旧 19 文件矩阵。
4. golden/view 原件保 M；关闭 RECORD/GOLDEN_VIEW，DUMP 全部 66 份具名 HTML，逐字节与准确父同输入原件比较，拒绝缺项/额外项，保 scripts/styles/JSON/真实 ID。有效 T384 父原件先核抵；失效才补必要参考运行。旧六红、record skip、额外探针红保持原归属。
5. 最终头 API/actions 非 update 核验、boundary/health、imports、实际 served 48 项及清理证据照既有合同；资源历史数字不能代替当前实测。full=true，fresh secrets、远端头、CI/Full/采用仍归根，不由本报告放行调度。

本轮只审解冲突方案。作者最终 H、作者报告、独立验证齐后，继续在 `/private/tmp/t116-pr1b-second/REPORT.md` 做已接受范围的最终加强二审。未运行 build/test/Full，未改源码/refs/GH/协调文件，未碰真实 Home。主检出的本地 main 指向另一个旧头，不用于替代本次明确冻结的 M，也未据此推断远端新状态。

依据：`/private/tmp/t116-pr1b-evidence/{REPORT.md,merge-binding.json,merge-conflicts.diff}`；两份已接受 ready/PLAN、协调 T116-pr1b-next PLAN/DECISION/POST-T369、parallel-2026-11-01 PLAN；上述准确 Git 对象与作者当前 merge 状态。
