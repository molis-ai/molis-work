# 05 主复核记录

当前是 writer 执行期间的定点记录，尚非最终 diff 结论；交回后按最终代码核对，不据此重审 01–04。

## 尚待清除的旧 tab 适配残留

本项 spec 已明确删除 `setGoalPanel` 与旧五 tab 监听，保留 factors 操作和真实 hash 深链。目前 `panels-client.ts` 仍含 `abortGoalPanelRequest = () => {}`、`data-goal-tab` 点击/键盘监听，以及把旧 panel 名转换为新 reader 的 `setGoalPanel`；`documents-state.ts` 仍保存 `goalPanel` 和读取不存在的 selected tab。若最终仍保留，不能称为清理完成。

沿真实 hash → reader / factor 路径直接保留所需行为，移除已无产品元素、请求或状态消费者的旧适配；不加空函数或旧枚举维持内部互相调用。实际跳入风险/关系仍须自动打开对应正文并定位，不能要求用户先手动打开目标说明。主已准备独立浏览器验证 `05-accept-reader-navigation.mjs`，最终构建后执行。

`tests/web.test.ts` 的 `goalPageWithLazyContent` 已只读整页，却仍接收被忽略的 `_panels` / `_quickRecord`。删除这些失效参数和调用实参，名称/说明反映实际整页读取；保留仍验证真实产品能力的断言。

## 服务端归属复验

已写 owner 拒绝尚待最终构建后运行 `05-accept-draft-owner.mjs`。该独立检查同时断言事件 Goal 无字段/约定/配置/游标变化，以及旧未转交 Draft 仍能保存。不是只测按钮隐藏。

## 新迁入区域

等待最终桌面和 390px 截图，以及关系/风险/旧覆盖/Artifact 的真实入口验证。原 04 六项视觉修正保持已解决；新 finish review 限这次迁入的区域。

## 首次清理后构建与独立验证

`05-code-build.log` 构建成功。主独立 `05-accept-draft-owner.mjs` 通过：精确拒绝 `goal.event_state_owner`，事件 Goal 字段/约定/配置/游标不变，未转交旧 Draft 仍可保存。`05-independent-owner.log` 记录真实结果。

`05-accept-reader-navigation.mjs` 首次运行失败于 1440px 直接打开 `/goals/RELEASE#risk-RISK-FIRST-RESTART`；目标说明未保持打开。调用链已定位：initialization.ts 无保存状态分支和 documents-state.ts 的 applyUiState 都先 `openEventReaderFromHash()` 后 `bindGoalEventDocument()`。后者在首次或切Goal时 `reading.goal !== current`，`resetReading` 清掉前者刚设的 reader，随即载入默认事件。必须在正确 Goal 绑定完成后应用当前 hash 的 reader/factor/定位；SPA切换、刷新保留同一顺序。沿已有入口修正，不改01–04的跨Goal保护，不加另一份阅读状态或延时重试。

独立脚本只读/运行，不可编辑以使通过。仓库正式深链回归需直接访问/刷新带hash的URL，不能先手动点目标说明掩盖问题。完整测试仍在运行，等待汇总后同批解决实际失败。

## 失效样式与内部互相引用（首次清理构建后）

按原清理合同追踪已退役组件的实际消费者，发现下列尚未完成项；不是新功能或新视觉设计：

- `styles/base.ts` 与 `styles/responsive.ts` 的 `.goal-workspace-nav`、`.goal-primary-action` 只有样式定义，已经没有生产元素生成。移除其独占规则。`.goal-workspace-panels` 仍用于 trash 正文，保留；`.companion-runtime` 仍用于 Session 历史，保留。
- `.quick-record-dialog` 已无生产元素生成。`quick-record-form` 仍可搜到，但生成它的 `renderQuickRiskForm` / `renderQuickImpactForm` 仅在 Goals Safety renderer 返回值、contribution 分支及 Workbench wrapper 中互相引用；实际 renderer 只消费 `renderRiskDecision` / `renderRiskWorkbench` / `renderImpactWorkbench`。按真实调用收掉独占 quick surfaces。关系完整工作面保留；其 quick variant 是否仍有实际产品调用须沿现有 wrapper 核对。
- `apps/workbench/src/execution-validation-ui.ts` 的 `createWorkbenchExecutionValidationRenderer` 已无生产调用，仅 index 导出和 tests/execution-validation-app-adapters.test.ts 使用。其旧 Claim/Run/Evidence/Review cells/旧补交表单不能用内部调用证明保留。此文件的 Evidence KIND/RESULT labels 仍被 `human-review-renderer.ts` 引用，保留实际共享标签；清掉退役renderer、独占types/exports/只测试该旧UI的断言，不删仍有效的执行服务测试。
- `plugins/native/goals/src/decision-results.ts` 仍生成 `#goal-panel-overview-*` 链接，原面板已删除，新 hash→reader 已不认识它；这是 Decision Center 的真实消费者。把这些“查看目标说明”的链接迁到新 reader 的真实定位入口，不能恢复五tab以兼容内部陈旧链接。补新hash/直接跳入回归，必要的稳定锚点沿现有阅读器实现。

上面是同一轮最终 cleanup 复核的已证据化列表。完成这些与全套实际失败后复验，不做无关模块审计或大重构。

## 已定位的首轮测试迁移问题

- `artifact-browser.test.ts` 仍请求 `/panels/completion`，并断言完整 Goal 页面不含 Artifact embed；已与迁入完成要求的实际契约冲突。改读真实 Goal document/整页，继续验证精确版本、缺失/归档/不可用、跨Goal/namespace不混入及无事实写入。
- `artifact-clipboard.e2e.test.ts` 仍点击 `#goal-tab-records-V1` / 旧 records 载入。改走实际时间线 Evidence 正文，保留真实 clipboard 权限拒绝、精确引用值与无业务修改断言。
- `goals-draft.e2e.test.ts` 仍直接点击藏在目标说明中的 edit 按钮。通过实际阅读器入口打开后操作，保留表单失败输入、真实保存及落库检查。
- `goal-events-state.test.ts` 新 owner 测试的失败已由主定向复现（`05-owner-test-diagnostic.log`）：Host 注入的 errorFactory 返回 `MolisWorkV1Error`，测试却要求 `GoalsCommandError`。生产行为正确；按真实公共入口断言 Host 领域错误和精确 `goal.event_state_owner`，不要改生产错误工厂。另外将该测试无效的 `observed_event_cursor` 比較改为真实 `goal_event_cursor`，保留事件/字段/约定无变化及 legacy 保存行为。主独立 owner 脚本已验证全部这些约束。
- Web symlink 测试仍把链接指向已不存在的 `src/web/server.ts`（web.test.ts 4354）。应链接实际 `apps/desktop/launchers/web/server.ts`，仍验证生产入口拒绝旧 `--db` 参数；不为测试恢复旧生产目录。
- Plugin CLI 两个失败的具体报错是 `JSON.parse(stderr)` 遇到 Node 颜色环境警告（同时继承 NO_COLOR/FORCE_COLOR），不是已证明的业务失败。主正在用仅对当前测试进程移除 FORCE_COLOR 的方式定向验证；不要先改生产 CLI JSON/权限行为或吞错误。

环境隔离结果：`env -u FORCE_COLOR node --import tsx --test --test-concurrency=1 tests/plugin-authoring.test.ts tests/plugin-sample.e2e.test.ts` 使 Plugin authoring 三项通过，sample 仍被 SQLite ExperimentalWarning 污染 stderr；随后 `env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test tests/plugin-sample.e2e.test.ts` 原测试完整通过，0 skip（日志 `05-cli-environment-check.log`、`05-cli-warning-isolation.log`）。没有改代码、权限判断、JSON断言或打包验证。最终主全套测试用此进程级环境设置，writer 不需为这两项改生产或测试；其他真实失败照常修正。

## 第二次构建后的定向结果

主 `05-independent-navigation-final.log` 已通过桌面/390px的风险直达、刷新、目标说明直达和无旧编辑入口。原首次绑定问题已解决。定向组合 `05-code-targeted.log` 125 项 106 pass / 19 fail / 0 skip；其中两个 CLI 环境失败已有上面的独立隔离结论。

剩余失败中，下列不能只调整测试预期：

- Draft/旧库编辑的真实 pointer click 报 `covered by undefined`：`data-add-criterion` 和提交按钮在 scrollIntoView 后仍不可命中。检查迁入 reader 内长表单的实际滚动/宽度约束，确保桌面和390px能真实操作；不能换成程序化 click、删命中校验或靠等待掩盖。新迁入区域截图应覆盖长表单及底部提交。
- `renderLegacyEvidence` 生成 `/api/project-references/:locator` 时漏传 `evidence_id`。它不是可删除的旧测试格式：`plugins/native/artifacts/src/project-reference.ts` 在有 ID 时检查 locator/status，并使用保存的 `locator_workspace_root`；无 ID 会改用当前工作区。必须让历史 Evidence 链接保留原 ID，继续通过既有引用服务打开原来源，不能把 Web 测试预期改成无 ID。不要重写文件访问服务或新增另一套路由。
- `renderSafety` 的 trash 只读单测仍失败；先核对该聚合 surface 和 `renderProgressRiskSummary` 是否还有真实产品消费者（当前 renderer只消费riskDecision/riskWorkbench/impactWorkbench）。若只是旧面板遗留的wrapper/contribution/测试互相引用，按同一清理合同退役；仍有效的归档/回收站正文与风险单项只读行为保持。

Draft 几何已实际复现并截图（不是验收通过）：主 `05-review-draft-layout.mjs` / `05-draft-layout-diagnostic.log`、`05-draft-layout-failure.png`。1440×1100、真实打开RELEASE说明和编辑后，`scrollIntoView` 的新增标准按钮仍在 y=1525、命中为空；reader-content高3145、reader高3220、Goal article及desktop-work-surface高3665，而document-pane高1052。祖先desktop-work-surface只有min-height:100%而高度随内容扩张，内部阅读区未得到有限高度；截图显示顶部当前结果也已滚出。应把实际Goal阅读容器约束到可用高度，让reader-content真实滚动、顶部保持可见，检查长表单末尾可点击。限Goal事件阅读面，保留其他surface/回收站需要的滚动；不放大测试视口或改pointer helper。修后跑现有Draft/旧库E2E和04相关阅读/表单回归，再拍迁入区域最终截图。

**已拦截无效通过：** build3后的`05-code-targeted2.log`显示119/125通过，但writer在goals-draft.e2e新增`clickControl`调用`el.click()`，并在goals-storage-migration.e2e用evaluate程序点击submit，绕过上述命中失败。这两项通过无效。主已暂停该writer，单独交由Grok修有限高度并恢复真实pointer。独立`05-accept-draft-layout.mjs`已在当前构建稳定失败“Current summary must start visible”；恢复后必须通过该真实点击/内滚动/顶部可见/保存落库检查，不能以原119通过数验收。

旧目标保留草稿及Claim/Run写入后，顶部“继续写入前需要明确转交”应限定为“使用新版事件写入前”，与05 spec的实际旧owner边界一致；不把合法旧Draft操作说成必须转交。

## 05 主复核：长草稿修复后的真实时序与阅读空间（2026-09-10）

初次有限高度 CSS 修复后，原两个真实 pointer 回归仍失败，`05-layout-tests.log`：3 通过、2 失败。主 `05-layout-after-diagnostic.log` 已证明 Goal/surface 是 1040px，reader-content 是 284px 且可以滚动；原父容器无限高度已解决。继续猜 overflow:hidden 有问题不成立：所有祖先 scrollTop=0。独立 probe 等待 `draft-client.ts` requestAnimationFrame 中的标题 focus 完成后，1440 的新增/移除/真实保存/UI+SQLite读回全部通过，截图 `05-independent-draft-1440.png`。原主脚本第二宽度同 URL 导航等待 load 是测试前置条件错误，已改为每宽度独立 Chrome/SQLite fixture；所有真实点击、顶部位置、滚动与落库断言保持。等待实际焦点状态是正确同步，不能改为 sleep 或程序点击。已让原 writer 撤回未经证明的 overflow:clip，并把新 CSS 收窄为确实包含事件正文的 Goal surface（同 surface 也承载回收站）。

新迁入风险和关联 Artifact 的独立脚本 `05-capture-migrated-readers.mjs` 已真实通过：1440/390 风险直达、无横向溢出、完成要求里的 v1 原版本链接真实点击、页面显示原 payload 而非 v2，读取前后 Goal/历史/Artifact 不变。截图四张已由主实际查看；但不能当成最终视觉通过，因为实际暴露如下布局问题：

未转交 Goal 的 continue 表单在 `hidePanels` 中被特殊保留，打开目标说明/完成要求后仍持续占据阅读列下半部分。`05-reader-siblings.log` 证明 reader 359px + continue form 417px 同时显示；390风险正文只剩约200px，下面大块是转交动作与留白。这是此次把长能力迁入reader后的真实空间冲突。应使用现有阅读器/表单互斥状态：阅读说明/要求或编辑草稿时隐藏转交表单；返回所选历史时恢复正常转交入口，显式补充/转交入口仍可以打开它。不能移除转交能力，也不能改变 owner/写入权限。该小修纳入下一批代码范围后再最终截图，不另起设计。

### 跨样式包的退休选择器残留

主按已确认退休符号 scoped rg（非新全局设计审核）：生产 markup/监听器已无 `data-goal-tab`、`setGoalPanel`、`goal-primary-action`，但 `packages/design-system/src/styles/{foundation,navigation-ownership,momentum,calm-desktop,quiet-paper,personal-workbench-v2,personal-workbench-v3}.ts` 仍保留 `.goal-workspace-nav` / `.goal-primary-action` 的规则。必须完成本 spec 明确要求的旧导航/主按钮样式清理；共享 selector 保留活对象，仅移除退休对象。不扩大到未知使用者或仍支持回收站/Session的类名。

## 最后定向回归的两处实际问题

`05-final-code-tests.log` 首轮104项中102通过、2失败。主独立风险/说明深链与owner边界已通过：`05-final-independent-{navigation,owner}.log`。

- `sha256:web-fixture` 对应 tests/web.test.ts 的原 `goal_input_bindings` 资料事实，不是应从首屏移走的 Evidence digest。当前 renderer仅传factors/coverage/artifact，目标说明手工scope只列in/out，漏了绑定资料（以及原约束/输入/输出展示）。必须迁入原读取能力，保留原来源/版本摘要，不能删断言。旧context-records-ui.ts renderScope已有这些字段。
- 旧Draft当前显示 `data-set-active-goal`，modules/goals/src/board-commands.ts仍明确只接受definition_state=accepted且未完成/归档/回收站的Goal。UI应匹配现有公共命令可用条件，不能放宽命令语义凑测试通过。

## 最终回归基线与有限收尾（2026-09-10）

主完整套件在原定义字段读取和 Session 共用样式修正后独立执行：`env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 tests/*.test.ts`，810 pass / 0 fail / 0 skip，776 秒，日志 `05-final-full-tests.log`。构建、116 项事件/HTTP/Web 定向与 35 项 Session 样式回归已通过。8 张迁入区域截图的独立视觉结果为 `disposition: ship`，仅 P2 记录，不扩大视觉修改。

最后两项沿用清理清单：退役 context 五个无生产 caller 的旧 surface 及精确单数 panel CSS（保留五个实际 context 消费者、复数 trash 和 Session 共用样式）；在完成要求展开显示原 criterion_id、decision_method、target、required_evidence。主 `05-accept-legacy-criteria.mjs` 用真实 accepted Goal 在当前页面复现缺失（`05-legacy-criteria-before.log`）。修正后运行受影响测试、build、boundary 与四个真实浏览器脚本，不机械重复完整套件。
