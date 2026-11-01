# T116 PR1b：19 个冲突的只读归属与合流计划

状态：**只读计划完成，当前 merge/index 冻结；未解冲突、未构建测试、未更改 refs。** 本文件是原 accepted 合同的合流说明，不另立需求书。待根登记二审结论并更新同书后继续。

- 当前父 M：`db29f18d4f602fa8d9efb689a6a766aa9b07625f`；原 PR1b H：`d37ec34c8498ab755bf9e34ba430e5648dacb0a8`。
- 实际 Git 共同祖先 A：`31315ea6c7a12aec35cceb0b064cc0d649d53237`；slice 增量基点 B：`7f389082cc2440875d3a42376a03309efe2b043e`。
- B→H 是原 PR1b 的 44 路径增量。A→M 已含父线采用及其后续修正；B 不是 M/H 的共同祖先，不再把旧显式基点预测写成普通 merge 零冲突。
- 19 个冲突中：16 个在 slice，3 个不在；16 个中 **11 个 M=B，5 个 M≠B**。有父新增差量的片内文件为：`apps/local-host/src/web-goals-read.ts`、`apps/workbench/src/index.ts`、`scripts/check-package-boundaries.mjs`、`tests/goals-page-golden.test.ts`、`tests/workbench-entry-exports.test.ts`。
## 逐文件贡献与保留点

“父贡献”指 M 中已采用的结构/行为；“M=B”只表示该文件从 slice 基点至准确 M 没有变化，不表示没有父线贡献。下表的每行证据包含 B→H、B→M 原始 diff 与 A→M 文件统计。

| # / 文件 | 父贡献 | 本片贡献 B→H | M 保留点与拟解法 |
| --- | --- | --- | --- |
| 1. `apps/local-host/src/web-goals-read.ts` （原始diff保留作者证据目录） | Host 调用 Goals/page 的请求组合；作用域读数、挂载与响应仍在现有链 | 切到 matchPageRoute；read request 异步先 load 后 renderer，page request 接 match | 保留 M 的 artifact-library-http.js 导入及其余宿主上下文；只合两处 request 与导入增量 |
| 2. `apps/local-host/src/web-planning.ts` （原始diff保留作者证据目录） | Host 提供个人/项目作用域方法，Goals 负责规划页组合 | matchPageRoute 替换 Host 自行 Goals matcher；load 内异步读方法，保既有 400 错误返回 | M=B；应用原增量，保个人/项目权限与方法选择、无匹配不读数 |
| 3. `apps/workbench/src/index.ts` （原始diff保留作者证据目录） | 工作台已迁移 Goals/page，保精确公共出口 | 增加 mountContributionsOf、stageDataInput 导出 | 保 M 的 renderHomePluginNavigation/HomePluginNavigationEntry、HOME_MODEL_SETTINGS_CLIENT_SCRIPT 与 settings-address-params 出口，不恢复退役 Goals 绘制出口 |
| 4. `apps/workbench/src/renderer.ts` （原始diff保留作者证据目录） | 工作台通过 createGoalsPage 注入 owner renderer | mount 换为 mountContributionsOf(GOALS_PLUGIN_ID)，同步 import | M=B；仅更换该挂载入口，其余 ports、绘制函数和格式保持 |
| 5. `packages/ui-host/src/declared-mount-host.ts` （原始diff保留作者证据目录） | 已采用的 UiDeclaredMountHost 公共端口 | mountDeclared 增可选 owner?: string | M=B；保泛型 request/UiMountResult；只加该参数 |
| 6. `plugins/native/goals/README.md` （原始diff保留作者证据目录） | Goals 开发要求与已采用终端所有权说明 | 无，本文件不在 44 路径 | 完整保 M blob：终端进程归 services.terminal/S-103，Goals 只拥有四动作与提示；mandatory 集合中的 goals-terminal-session-actions 不丢 |
| 7. `plugins/native/goals/src/page/index.ts` （原始diff保留作者证据目录） | Goals/page 已采用公开组合入口 | 仅补 GoalsPlanningRefusal 类型导出 | M=B；其它所有出口逐字保留，不借冲突改 API 范围 |
| 8. `plugins/native/goals/src/page/planning-request.ts` （原始diff保留作者证据目录） | 已迁入 Goals/page 的规划请求组合 | 输入 DeclaredPageRouteMatch；异步 load；GoalsPlanningRefusal；拒绝非法 route 后不 load | M=B；保当前 Goals/page 路径，不复活旧 apps/workbench/goals-planning-request.ts；保原方法选择及 scope 翻译 |
| 9. `plugins/native/goals/src/page/ports.ts` （原始diff保留作者证据目录） | 父终端 UI 模型端口 | 无，本文件不在 44 路径 | 完整保 M blob，promptRoute 和 terminalsRoute 均必填 string；对应 documents.ts 两条真实路由保持 M |
| 10. `plugins/native/goals/src/page/routes.ts` （原始diff保留作者证据目录） | Goals/page 负责页面/片段请求的 owner 组合 | 输入 matcher 结果；goalsReadRouteOf/goalsPageRouteOf；read load 与 renderer 异步顺序 | M=B；保集合限制/选择、无效请求不读数；不更改 renderGoalsReadRoute 绘制 |
| 11. `scripts/check-package-boundaries.mjs` （原始diff保留作者证据目录） | 父边界约束验证已迁移的 Goals owner 和 Artifact HTTP | 只更新 checkProposalUiOwnership 中 owner mount 的检查和错误信息 | 保 M 的 checkArtifactsOwnership 使用 artifact-library-http.ts；其余边界、阈值和例外不变 |
| 12. `tests/fixtures/goals-page-golden/golden.json` （原始diff保留作者证据目录） | 父独立基准的页面 hashes 与长度 | 无，本文件不在 44 路径 | 完整保 M blob；不选原 H、不录候选、不以旧结果覆盖父期望 |
| 13. `tests/goals-document-routes.test.ts` （原始diff保留作者证据目录） | 原 Goals 读路由/页面正反控及 HTTP 入口 | 测试走公开 Manifest matcher 和 routeOf；异步请求；保/补 decode、长度、owner、懒加载断言 | M=B；原有效测试不删，不把旧 URIError 语义带回已更改的 matcher 拒绝合同 |
| 14. `tests/goals-page-golden.test.ts` （原始diff保留作者证据目录） | 父固定 NOW/TZ、恢复环境、真实 custom-method id 与完整 HTML DUMP | 只增加受 MOLIS_WORK_GOLDEN_VIEW=1 控制的 view 重建测试及说明 | 保 M 的 NOW、t.mock Date.now、TZ 恢复和不掩码规则；正常运行 RECORD/VIEW 均关闭。新分支默认 skip，不能把 skip 冒充验证 |
| 15. `tests/goals-planning-ui.test.ts` （原始diff保留作者证据目录） | 原规划 library/new/edit、作用域和渲染断言 | 公共 matcher + goalsPlanningRouteOf；await 请求；拒绝编码/超长/外来 owner | M=B；保后半渲染、转义、桌面链接断言，拒绝分支不 load |
| 16. `tests/package-boundary-must-contain.test.mjs` （原始diff保留作者证据目录） | 边界规则本身的必须命中回归 | owner mount 正则替换并增加 COMPOSITION 的 pluginId 传递检查 | M=B；其余 PATTERNS 原样，不能放宽规则 |
| 17. `tests/workbench-entry-exports.test.ts` （原始diff保留作者证据目录） | 精确出口与插件文案实际调用者检查 | 仅 UI_COMPOSITION_NAMES 添加 mountContributionsOf | 保 M 的 withPluginWords 用户路径 artifact-library-http.ts；其余出口与调用者断言不变 |
| 18. `tests/workbench-registration-boundaries.test.mjs` （原始diff保留作者证据目录） | 现有 owner 边界 guard 的负例 | 改 otherMount 反例，加移除 owner 参数反例 | M=B；保其余旧 guard；三必修阶段才在此追加 L/icon 与 factory 叶子 import AST 断言 |
| 19. `tests/workbench-ui-platform.test.ts` （原始diff保留作者证据目录） | 真实工作台 UiHost mount、slot 和各声明的验证 | 新增真实 own/foreign owner 拒绝及正常 owner 后续校验对照 | M=B；保其它测试；该原增量尚不覆盖三可信字段，两道拒绝须另外实现 |

## 拟执行顺序（尚未执行）

1. 保持当前正常 merge 的双亲语义：HEAD=M，MERGE_HEAD=H；不 abort 后 cherry-pick、不 rebase/force，也不把旧作者树改成新候选。
2. 以准确 M 为内容参考，逐 hunk 加回 B→H 的原 44 路径差量。上表 3 个非 slice 冲突无 PR1b 贡献，解决后须与 M 完整 blob 相等。其余 16 个按上表同时保留父行为与 slice 增量，不能按冲突标记整侧覆盖。
3. 正常 merge 的非冲突结果也要检查：剩余 28 个 slice 路径只含原增量；所有非 slice 路径与 M 相同。重点检查未冲突的 documents.ts、view.json、settings_address 与现行 Manifest、T148 terminal 动作、Home 导航、privileges 的父行，以及 T369 新测试。这一步避免自动合并静默带回过时父代码。
4. 三必修开始前，记录实际解决树相对 M 的 44 路径与逐 hunk 差量；原 B→H 增删行等价是检查目标，不能用“只有44文件”替代内容复核。API 最终仍须从源码生成；此阶段不手拼快照。
5. 然后仅实施已授权三必修：三可信名声明与投影独立拒绝、frame-stage 的 L/icon 函数属性、factories 叶子 import；追加范围仅两叶子及已定测试。后续再按原合同构建、四负例、完整文件、66 HTML 与48资源核验；Full/CI/GH仍归根。

## 当前已核事实与未验证项

- 当前冻结状态与首次保存的 status、unmerged index 和 conflict diff 完全相同；HEAD/MERGE_HEAD 未变。没有源码/暂存区写入，没有 refs 操作。
- ports.ts 与 golden.json、Goals README 在 B→H 中无差量；documents.ts 的 promptRoute/terminalsRoute 是 B→M 父贡献，view.json 的 B/M blob 相同。
- 未生成或应用期望合成树，没有运行 merge-tree/apply、构建或测试。因此本计划不宣称 44 路径投影可无冲突应用、不宣称实际解法已通过，也不替代二审。
- 原三必修与原验证问题 6543868013 仍全部待实现/验证；旧 28/9/101/HTTP5 等来源不改写成新组合证据。
