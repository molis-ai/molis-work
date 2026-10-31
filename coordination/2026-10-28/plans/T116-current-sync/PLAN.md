# T116 PR1a #1679 当前 main 冲突最小接续计划

负责人：Codex 开发线4，只读准备；后续唯一 writer 由根冻结最终 base 后指定。本轮未实施。

结论：指定 H 与当前指定 M 有 **2 个文本冲突文件**，均可保留双方有效改动；另有 **1 个自动合并后必须补齐的终端端口类型字段**。不能只清冲突标记就交付。预计最小手工生产修复是工作台出口一处和 Goals 端口类型一行，另合并 README；金样按最终准确 main 的真实输出核实更新，不从候选生成预期。旧整批回归无需统一重演。

## 冻结的只读对象

- PR [#1679](https://github.com/molis-ai/molis-work/pull/1679)，分支 `task/T116-ca`，准确 H=`92e406ed914997b751c46e67169fc5302613be6e`；实时 PR API 为 open、mergeable=false。
- 本计划指定 M=`fa9b907c9c6a8243c9a9504cf6c4c8a90509965b`；读取远端 `refs/heads/main` 与 `refs/heads/task/T116-ca` 时分别等于 M/H。没有 fetch 或改任何 refs。
- 共同祖先 B=`dc544a39790c3c73cb43756ffeb847b83e960982`，也是上一轮独立金样的生产参考。
- `git merge-tree --write-tree --messages H M` exit=1，结果树 `f04b42101e5972d35f351263599edf86c16807b9` 含冲突标记，**不是候选**。对象只写进本目录的隔离 `objects/`，原仓库对象目录只作 alternate 读取，未改作者工作树、index、分支或 refs。原件：`merge-tree.txt/.exit`。
- 双方共同改动路径只有五项：`immersive-shell.ts`、`index.ts`、`shell-page-renderer.ts`、Goals README、`workspace-packages.mjs`。另外 Git 识别搬迁后将 main 的旧 `goals-documents.ts` 增量自动送入 `plugins/native/goals/src/page/documents.ts`。原件：`both-changed.txt`、`main-since-reference.diff`、`automatic-merge-relevant.diff`。

本计划不能作为未来移动 main 的固定合并答案。根正式派 writer 前重新冻结 M；若 T148 或其他端口合同在此之后采用，重新核实际差集，不预先拼入未合代码。

## 原审验与裁定保持有效的范围

已读 `/private/tmp/t116-successor-plan/PLAN.md`、现有作者报告、最新 PR 讨论及 `/private/tmp/t116-final-verify/REPORT.md`。实时讨论原文（去掉重复 HTML 渲染字段）保存在 `pr1679-comments.json`。

- [6546860074](https://github.com/molis-ai/molis-work/pull/1679#issuecomment-6546860074)：main 集成的金样预期必须取自**不含搬迁的干净准确生产 main**，保留业务 JSON、日期、真实 ID；不能候选自录、恢复已删 maxlength 或扩大排除规则。
- [6547774864](https://github.com/molis-ai/molis-work/pull/1679#issuecomment-6547774864) 与 [6547775069](https://github.com/molis-ai/molis-work/pull/1679#issuecomment-6547775069)：当前 H 的实现／正文增量已核；建议1～5仍留 #1680，不借本轮同步推进 PR1b、PR1c、T402/T403。
- [6548319596](https://github.com/molis-ai/molis-work/pull/1679#issuecomment-6548319596)：验证线2对 H/B 两份独立检出正常构建，完整金样两端各67过、0失败、1原录入专用skip，66份完整HTML原字节相同；外部时区／时钟不同，全程未开RECORD。保留为 **H/B 的独立通过证据**，不扩大为本次 H/M 组合通过。
- 原三处真实挂载负例继续保留独立执行来源。本次只读模拟中 `renderer.ts`、`ui-composition.ts`、`page/surfaces.ts` 和 `check-package-boundaries.mjs` 四个 blob 与 H 逐项相同（`guard-reuse-static.json`）。本轮新变异为0，暂不需要重复负例。
- 原 UTC 六红、前轮当前 main 集成24红及其修复记录不改。旧 Full 41222632669 的串扰等待失败上游仍 UNKNOWN；新金样绿或当前 T377 Full 不能把旧 Full 改成通过。

## 两处文本冲突：owner 与精确解法

两个包的正式 owner 均为 SSOT／CODEOWNERS 的 `@yijunw0212`；下表另列实际上游改动线，避免混淆包 owner 与本轮 writer。原上游 T401/T137 均已采用并释放，不把它们当作仍需等待的 writer。

| 冲突 | owner／来源 | 唯一 writer 应保留的最终内容 | 行为判断 |
| --- | --- | --- | --- |
| `apps/workbench/src/index.ts`，顶部 home-plugin-navigation 导出与被删 Goals 转出相邻 | Workbench 入口；本片 T116 的删除与已采用 T401/#1652 `cc67524c6` 的新增导出相交 | 保留 `export { homeToolKeysScript, renderHomePluginNavigation, type HomePluginNavigationEntry } from "./home-plugin-navigation.js";`。同时保留 T116 已删除 `createWorkbenchGoalsFragmentRenderer`/`GoalsFragmentRenderers` 及 `renderWorkbenchGoalsReadRoute`/`renderWorkbenchGoalsReadRequest`/`renderWorkbenchGoalsPageRequest`/`GoalsReadRenderers`/`WorkbenchGoalPageSelection` 转出的结果，不把 main 冲突块整段照收；规划旧转出同样不恢复。 | 无需新增产品行为；保住 T401 已有调用方的公开入口，同时维持 Goals 渲染归属。丢前者会让 Home 插件导航消费者缺导出，收回旧 Goals 转出会破坏本片迁移边界。 |
| `plugins/native/goals/README.md`，“改动后必跑”长行与新页面段 | Goals；本片 T116 页面绘制说明与已采用 T137/#1643 `0926d15a9` 终端测试登记相交 | 通用命令保留原列表并在末尾保留 main 新增 `tests/goals-terminal.test.ts`；随后完整保留 H 的“改页面绘制（src/page/，T-116）必跑”整段及整页 DUMP 比对说明。上方已自动合入的终端职责说明保留 main 现行含义：进程归 services.terminal，Goals 拥有四动作与推进提示。 | 文档合并，无新业务行为。保留测试登记不等于本轮必须把两边列出的全部历史批次重跑。 |

冲突原文副本：`apps__workbench__src__index.ts`、`plugins__native__goals__README.md`。它们只供审阅，包含 merge 标记，不可当作解决后的文件拷回。

## 必须审到的自动合并与真实输入差异

1. **T137 promptRoute 已进入调用，端口类型尚未进入。** 模拟树的 `plugins/native/goals/src/page/documents.ts` 在 `renderTerminalPane({...})` 中自动保留：

   ```ts
   promptRoute: "/api/plugins/io.molis.work.goals/goals/:goalId/advance-prompt",
   ```

   main 的 `apps/workbench/src/terminal/pane.ts` 已要求 `promptRoute: string` 并生成 `data-tui-prompt-route`；H 的 `GoalsTerminalPaneModel` 仍没有此字段。最小补齐是 `plugins/native/goals/src/page/ports.ts` 的同一模型增加必填 `promptRoute: string`（可沿用主模型注释），保留现有属性形式的 `renderTerminalPane: (model: GoalsTerminalPaneModel) => string`。不改 optional、不加默认值、不改成方法来绕过检查。源码足以判断当前接口不一致；本轮没有运行编译器，不虚报编译失败日志。

   这是采用 **main 已生效的 T137 行为**，不是为 T116 新造终端行为。当前 M 只有 promptRoute，没有 terminalsRoute；不能把仍未采用的 T148 字段提前带入。如果最终 M 已包含 T148，再按实际 TerminalPaneModel 一次补齐该时点的必填字段及相应调用。

2. **T401 的 Home 导航链自动合并要保留。** `shell-page-renderer.ts` 继续有 `home_plugin_nav?: readonly HomePluginNavigationEntry[]` 并调用 `renderImmersiveHeader(primitives, desktopShell, view.home_plugin_nav)`；`immersive-shell.ts` 接第三参并传给 `renderHomePluginNavigation(undefined, homePlugins)`。保留 T116 的 Goals ports／绘制拆分。不能只保新 index 导出而回退这里的参数传递，否则安装的 Home 包在项目页没有入口。

3. **包登记自动合并要保留两边。** `workspace-packages.mjs` 保留 T116 将 Goals 绘制能力归回 Goals 的结果，以及 T137 删除 `desktop.advance-prompt.v1`；不恢复桌面旧提示职责。包表／边界门禁按最终组合核，当前没有依据手改算法、baseline 或新增豁免。

4. **金样不是只有文本冲突才会变化。** 静态读取旧独立66份完整DUMP，8份有 `goal-tui-pane`：`page-current`、`page-current-decision`、`page-current-desktop`、`page-current-none` 各中英（`old-dump-terminal-pages.json`）。它们将消费 main 新增的 `data-tui-prompt-route`，该业务属性不会被现有 markup 排除，因此旧 golden 至少存在这一项预期漂移风险。这是已存在文件的静态影响分析，**不是本轮实跑8红**，也不是承诺只需改8条哈希。完整原HTML还可能包含已采用 main 的脚本／词典变化，须实际全66份比较。

   既有 view 没有 Home 安装包数据；T401 的 installed 列表缺省为空，不能用旧空列表金样通过证明新增 Home 导航入口。其组合覆盖由下面对应整文件承担。

## 最小执行与补验建议（全部尚未执行）

1. 根冻结最终 M、重新核 H 未变及路径锁后，交一个 writer 在自有隔离检出正常 merge；不 rebase／force，不碰 #1101 等分支，不采 #1680 的未合实现。按上表解两冲突，并补最终 TerminalPaneModel 的真实必填字段。审完整 merge diff，尤其重命名自动携带的 documents 增量。
2. 正常离线安装（仅依赖输入实际变化时）及整体匹配 `pnpm build`。另建干净准确 M 参考，只加入相同金样测试和原始 view/golden 夹具，不加入 T116 生产搬迁。遵守公共 build 槽和隔离环境。
3. **金样这一完整文件必须重新核新组合，其他历史整批不机械重跑：**
   - 先用准确 M 正常模式和旧 golden 取得真实差异／完整66份DUMP；保留其实际失败，不能把静态预测当执行结果。
   - 只有确认是已采用 M 的输出变化后，才由 M 的 RECORD 输出更新对应预期；候选不得自行重录，record 成功不算正常断言通过。
   - M 与新候选均正常模式、禁用RECORD，各跑完整 `tests/goals-page-golden.test.ts`；保持 UTC、固定夹具时刻、真实 ID、业务 JSON 和原排除规则，比较66份具名完整HTML原字节。额外逐处确认新增 prompt route 为 main 的确切路由、没有 `undefined` 或旧 Host 路由；不扩大 fixture 内容以掩盖差异。
4. **与本次新增组合有直接关系的四个完整文件**：
   - `tests/workbench-entry-exports.test.ts`：手工导出冲突、Goals 旧转出不恢复及 T401 新调用者。
   - `tests/desktop-tui.test.ts`：搬迁后的真实终端面板参数、现行提示路由与 Web/Desktop 接线；最终 base 若含 T377，保留其已有签名断言。
   - `tests/home-plugin-stage-pages.test.ts`：T401 新导出及导航元素、无包／不可用边界。
   - `tests/home-plugin-stage-navigation.test.ts`：项目 shell 经新组合传递 Home 包导航与 stage 的真实安装状态路径；Mac 隔离临时 Home，沿原文件权限／平台要求，不动真实 Home。

   这些运行均 jobs=1/retries=0、公共 browser 槽，不挑成功用例、不删skip。此清单不要求重新执行 T137 全部终端服务／安全矩阵：本轮未改服务、动作或授权。若实际 merge 范围扩大，再按实际差集增加。
5. health `--base <准确M>`、boundary、served page-assets、diff与推送前 secrets 按最终实际输入执行。四个挂载／门禁 blob 若仍等于既有独立验证值，保留原负例，不再变异；若手工合并改变它们，再针对真正变化复核。原17文件／175项、前轮12项、全部 Goals UI、原串扰用例不因“同步main”统一重跑。最终准确头 Verify／适用SI／Full 仍由根按 full=true 收证，局部文件不代替它们。

## 资源窗口与 T377 的位置

H 相对 B 没有资源门禁／预算文件修改；本轮两处冲突和 promptRoute 类型补齐是入口／服务端绘制集成，尚无证据证明相对最终 main 会增加 served JS/CSS。**先匹配构建并对最终 M 实测，不能沿用 H/B 的 7,468,092 总量，也不能预填 T377 的数。** 零差额则资源文件保持 main，不领取写窗口；若有必须保留的增长，先定位和报根，再由根串行交窗口与精确许可，算法不改。没有理由在本次只读计划里改 budget171 或许可表。

T377 目前尚未采用。本轮 merge-tree 仅用指定 M/H，没有采 T377 代码或 refs。它的三个主区客户端文件（deferred-plugin-client、documents-state、navigation-feed）及两个测试（desktop-tui、plugin-frame-readiness）仅是下一次冻结 base 的输入提示；若届时已采用，保留 main 现行恢复／重试语义和测试，不在 T116 借口“同步”撤回或重演旧六文件／A-B反证。若尚未采用，不提前 cherry-pick。T148 同样只看最终已采用合同。

## 本轮完成边界

只有源码／Git 对象／现有证据读取与计划文件输出；新构建、测试、渲染、变异、真实 Home 操作均为0，无 GH 写入，无分支/ref/index变更。作者树最后仍为 H 且干净。T377 候选未改、未推。根可据此冻结最终 M 后派唯一 writer；本报告不表示冲突已解决、当前组合已通过或 PR 可合。
