# T389 同单最小修复与受控回归草案

状态：只读修复计划，供根与独立书审；不是实施授权、不占writer。accepted任务为 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-389.md`，其阶段2目前只授权诊断。已读独立二审 `/private/tmp/t389-menu-second/REPORT.md`，其核收第①类且无需补跑；独立验证线1与根最终采用另记。根在**同一WO**补充修复/回归范围与验收后才可实施；不另开任务、号段或恢复Full。

## 已证问题与边界

准确M=`15ad4f397018241c8b31625aff8014b89259f239`。`/private/tmp/t389-menu-evidence/REPORT.md`、`probe-corrected.ts`、`experiment.json`分别给叙述、实际执行程序和原件：一个390视口、一个新project、一次公开Goal POST、一次自然attention/cursor/compact响应暂挂与原样释放；响应完整正常恢复后，同一连接着的Feed来源menu从open变closed，task仍all、无用户关闭/选择输入。首尝试缺Goals board失败单列，seedBoard补正后才首次进入业务实验。本稿不把诊断exit0称产品通过，不代替正在进行的独立审验。

本片只修“对当前同一Feed/task进行被动UI恢复时，保留来源菜单的展开状态”。显式同task选择仍关闭菜单；显式不同task选择仍关闭菜单并执行原有stage/chooser重置；不存在的task回退仍沿现行行为。chooser原本的打开/关闭合同不改。旧Linux Hidden custom_rss是否由此触发仍UNKNOWN，不称390专属，不试图修helper采样/原生点击间的所有布局竞态。

## 调用核对与最小设计

不能用persist区分意图：false控制的是保存/广播，多处显式导航、tab选择同样传false。不能仅以changed=false跳过关闭：用户再次选择当前来源也有关闭菜单的明确意图。

建议复用 `setDesktopWorkSurface` 已有的 `intent="open"/"restore"` 概念，在内部Feed函数增加同样的可选intent，默认open；不加全局状态、保存menu.open到storage、延迟恢复、快照后强制重开、异常兼容或新DOM事件。

1. `navigation-feed-sources.ts`：`setFeedTask(taskId, persist=true, intent="open")`。现有selectedSource更新无条件保持；**仅menu关闭的三项**（railOpen=false、summary aria-expanded=false、details.removeAttribute(open)）改为 `intent !== "restore" || changed` 时执行。changed计算、任务可用性回退、过滤/保存/广播及 `if(changed){collapseFeedStage();setFeedAddOpen(false)}`原样。restore同task时不写这三项，让details toggle原有同步保持真实状态；不强制展开原本关闭的menu。
2. `navigation-feed-stage.ts`：`setFeedPreset(preset, restoreSavedState=true, intent="open")`。内部setFeedTask传intent；它再次调用setDesktopWorkSurface时也传同一intent。原restoreSavedState含义不变，不把true等同restore（用户导航也会恢复筛选）。
3. `documents-state.ts`：applyUiState中setFeedPreset(...,true,"restore")；末尾已有setDesktopWorkSurface(...,"restore")保留。
4. `navigation-feed.ts`：setDesktopWorkSurface已有intent，向两处setFeedTask传递（sources映射入口及feed分支）。open默认保原导航行为；restore才承接此次被动恢复。需要这些传递是因为同一次applyUiState会在preset内外多次调用setFeedTask，单改第一处会被后续关闭覆盖。

不增公开API/Manifest/schema，不改生产计时或生命周期。restoreFeedPresetState目前先把saved.task赋给selectedFeedTask，再由setFeedTask归一化；这属于既有语义，本片不重构任务选择模型。只沿本次已证applyUiState链透传intent，不擅自把其它数据同步都定义为restore。

| 当前setFeedTask来源（准确M） | 本片处理 |
| --- | --- |
| events-secondary:6来源按钮、:51打开来源记录、:214显式Feed入口；events-primary:392保存来源、:498配置、:550创建成功；sources:207用户open-group；stage:460规则视图 | 保默认open；同task仍关闭，变化仍保现行stage/chooser行为 |
| navigation-feed:35/76；stage:480 preset内调用及其后setDesktopWorkSurface；documents-state:212及末尾surface恢复 | 只按明确传入intent透传；applyUiState标restore，显式events-secondary:87/184的setFeedPreset仍默认open |
| stage:51 refreshFeedStage；initialization/adoptFeed的setFeedPreset(false) | 保原行为，不把真实列表/成员变化等扩成此次修复；将来另有体验合同再讨论 |
| tab-workspace-panes:48/175；tab-workspace-plugins:45；tab-workspace:479 feed-task消息、:560初始frame恢复 | 保原调用语义；这些false不是此次board applyUiState传递链，不批量替换。若实际diff后受控回归证明它们也在同一恢复内关闭menu，先交根补最小必要传递，不能靠加一次“重开”补偿 |

本稿已核全部静态setFeedTask调用；上表是范围裁定，不声称每个未改调用都是用户事件。共享tab/frame协议、Feed列表refresh、项目成员变更不在已证故障修复范围。

## 永久回归：旧代码稳定红，修后验证完整路径

建议一个新完整文件 `tests/feed-source-menu-refresh.e2e.test.ts`（根fresh查路径/锁后定），沿用公开goal-browser、公共Host/LocalHostHttpClient及现有seedBoard，不能照搬临时probe的any、输出目录、庞大记录缓冲或内部函数hook。只测试真实用户合同；小型本文件局部Response gate、原生point/click与cleanup即可，若已有fixture恰好可用则复用，不改共享helper。验收号由根同WO指定。

受控主case沿已成功实验流程：390、新project与Feed、空Goals board、单pane；无刷新原生summary→rail-add对照成功并取消；公开Goal POST提升C0→C1；等待自然attention/cursor链首次真实compact Response；只在Response暂挂，核准确session/project/current/no goal_id/2xx及真实HTML公开cursor/newGoal；原生开menu并核同引用；原样continue一次。**预期改为完整正常提交后同menu仍open，随后一次不自动reveal的native add命中，chooser choices实际显示，再正常选择custom_rss看setup并取消。** 旧代码必须红在menu保留断言，不能让带reveal的helper自动打开它后绿。

完整提交证据保持阶段2已证有效条件：公开state cursor与新Goal正确；task后快照documentSyncing=false；同project/body/Feed tab、mobileView=document、无dirty、无refresh异常/导航/成员改变/第二个compact或fallback；graphLoaded=false排除本case不适用的后置async分支。**前态documentSyncing也为false，不能把此谓词当作已采到rAF或true→false收尾事件**；完整恢复依据准确M同步尾段、task后适用状态及无异常的组合，不额外补跑或加hook凑完成信号。workspaceMode按当前正常恢复语义断言，不能误断言focus不变。只看marker不够；发生“Goal refresh failed”或后置状态不足即失败，不当作保留菜单通过。失败截图捕获，正常无需保存临时诊断海量事件。

另一个轻量用户选择case（同文件，独立Home，**不额外制造Goal刷新**）：用公开Feed创建接口准备真实来源S，原生展开summary→点当前all，断言menu关闭、task仍all；再次原生展开→点S，断言menu关闭、task=S；再展开→点S验证同task也关闭。保留对应aria-current/summary状态和chooser hidden。这样能拦住“changed=false就不关闭”的错误修复。来源须真实公共写入并由正常页面载入，不直接插DOM/改selectedFeedTask；当前公开Feed写合同实施前重核。

chooser合同：受控case的add/choose/cancel成功覆盖常规行为；显式不同task原有changed分支不动，现有完整journey/feed用例继续覆盖其余保存和切换。无需为证明已知状态丢失再跑旧H/M诊断；正常同task的无刷新对照与显式选择不是概率复现矩阵。

有效性验证：在准确未修M、仅加入新回归，按相同构建/公共槽完整文件跑一次，须红在“真实正常refresh后menu仍open”的业务断言，原件保留；再按修复后匹配build跑完整文件通过。**永久测试不得照搬probe将异常/第③类仅写status后正常返回的做法**：任何前提不足、采集回调异常、恢复异常或断言失败必须使测试失败，finally清理不能吞原错。若旧版红在初始化/预算/别的异常，不算有效红，回证据诊断，不重复试到目标断言。已有阶段2同输入实操可核抵根同意的重叠控制证据，但不能把其“期望关闭”的诊断pass冒充新回归旧版红。

网络与时间预算沿已接受阶段2：POST15s/公开cursor10s/自然response30s/挂起5s（watchdog4s且保证释放余量）/完整commit5s；固定整体上限，不sleep猜提交、不mock timer/手发attention、不重复arm。支持正常自然poll，不能为压测试时长改生产15s。所有成功、断言失败、timeout路径分别finally尝试放行本次pending、Fetch.disable、解绑并settle callbacks，再fixture清理，单步失败不跳过后续。无真实Home/凭据/模型，公共browser槽jobs1/retries0；不启动日常Chrome。

## 验证、产物体积及Full裁定

拟源码边界为上面四个client片段加新测试，必要现行文档验收留同WO；无共享helper/CI/runner/门禁脚本改动。源代码变化先公共build槽整体pnpm build，新测试必须消费准确修复构建，不能复用原main dist。任务定向完整文件明确为 `tests/feed-source-menu-refresh.e2e.test.ts`（拟新增）、`tests/project-user-journey.e2e.test.ts`、`tests/workbench-pane-feed.e2e.test.ts`、`tests/feed-sources.test.ts`、`tests/workbench-ui-platform.test.ts`；不存在的feed-sources.e2e文件不在执行合同。包README强制项另列如下，affected只补建议，不覆盖mandatory；不能静态预签全部通过。新回归可在Linux跑，但不得未经实测就加入限额3～5的CI browser smoke清单。

准确M的 `apps/workbench/README.md:145–149` 执行合同（每项均为完整文件，下面分组只为核对与复用，不增加case或复现矩阵）：

**改动后必跑（18项）**：

```sh
node scripts/run-tests.mjs --jobs 1 --retries 0 tests/style-has-scope.test.ts tests/plugin-declarative-mounting.test.ts tests/builtin-plugin-agent-texts.test.ts tests/builtin-manifests-contract.test.ts tests/builtin-plugin-composition.test.ts tests/workbench-ui-platform.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts tests/ui-request-client.test.ts tests/ui-request-client-pages.test.ts tests/settings-requests-through-helper.test.ts tests/web-service-settings-client.test.ts tests/assistant-island-script.test.ts tests/plugin-client-served.test.ts tests/plugin-list-developer-mode.test.ts tests/plugin-picker-pins.test.ts tests/settings-call-diagnostics.test.ts tests/capabilities-page.test.ts
```

**界面改动加跑（10项，本片适用）**：

```sh
node scripts/run-tests.mjs --jobs 1 --retries 0 tests/workbench-tab-workspace.e2e.test.ts tests/call-id-lookup.e2e.test.ts tests/ui-request-client.e2e.test.ts tests/request-failure-call-id.e2e.test.ts tests/model-first-setup.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts tests/model-ready-cross-tab.e2e.test.ts tests/assistant-send-intent.e2e.test.ts tests/assistant-page-cards.e2e.test.ts tests/assistant-stale-refresh.e2e.test.ts
```

**跨请求目标、成员刷新、标签恢复或停止反馈条件加跑（6项）**：本片明确改变applyUiState恢复链，保守按恢复条件纳入，不让affected将它豁免：

```sh
node scripts/run-tests.mjs --jobs 1 --retries 0 tests/tab-workspace-ops.test.ts tests/workbench-current-tabs.e2e.test.ts tests/workbench-browser-targets.e2e.test.ts tests/workbench-async-targets.e2e.test.ts tests/workbench-functions-late.e2e.test.ts tests/workbench-stop-feedback.e2e.test.ts
```

README其余条件逐项核范围：写后检查设置未改，故其 `tests/write-checkers-settings-http.test.ts`、`tests/write-checkers-settings.e2e.test.ts` 条件当前不触发；助理错误响应路径未改，其额外 `tests/assistant-error-recovery.e2e.test.ts`、`tests/assistant-page-written.e2e.test.ts` 当前不触发（assistant-island-script已在必跑组）。不改分栏窗格/设置链接，`tests/cognia-embedded-settings.e2e.test.ts` 当前不触发；不改进入工作台前页面，`tests/project-arrival-chooser.test.ts`、`tests/project-brief.test.ts`、`tests/project-arrival.e2e.test.ts`、`tests/onboarding-journey.e2e.test.ts` 当前不触发。作者实际diff一旦触发相应条件，按README增加原有完整文件，不擅自以本计划豁免。

以上组与任务定向批按文件去重，workbench-ui-platform等重叠只执行/核抵一次。已有证据可逐项复用，前提是该文件所消费的生产/测试/helper/依赖/构建及实际解析和执行合同均匹配，保留原准确输入、结果与来源；不能因整树head不同就机械重跑，也不能把原main的旧client构建当本次修复证据。旧版业务红阶段可用匹配原生产构建；修后需整体build或有效同修复输入产物。每个mandatory文件最终逐项列“本次通过／匹配证据核抵／失败／未运行及缺口”，affected未选中不是未运行理由。公共build/browser槽和独立临时Home/profile/系统隔离沿仓库要求；README清单是正式验证合同，不是新增概率诊断轮次。

工作台脚本是宿主资源，须按实际workspace build核page-assets；测修前后同资源准确字节并优先省回。不能预签零增长或直接抬基线。若仍增长，按现有规则说明必要性/准确字节/节省尝试，由根安排适用评审及一次放行；若单资源>10KB或新资源需用户决定。本片预计小幅，但以实测为准，不绕门禁、不在此计划改APPROVED_CEILINGS。API/actions未改无需机械更新快照。health/boundary/test-imports及适用page-assets/文档检查以实际diff和项目必需规则执行。

**Full不能从本计划确定**：四个client片段涉及workbench切换/恢复，是否命中shell assembly/full条件须实际 `affected-tests --base <准确M> --json`、包规则和根裁定；不按“四文件”或“内部参数”预签full=false，也不自行启动本机或CI Full。即使当前菜单修复工程通过，旧Linux归因仍UNKNOWN，根对T385历史失败及下一合法CI入口另行结算，不能用本片绿色直接解除Full暂停。

作者交实际diff、原版业务断言红/修后完整文件绿、所有原断言/完整提交证据、build/资源字节、真实affected full与清理；独立审验证据有效性，根最后裁决。同WO在独立审验阶段2后才更新授权；本稿完成即停止。

## 最终文字收口（仅计划修订，未实施）

- 独立书审提到的旧is-syncing句属于读版差：本稿完整提交段已明确前后均false，不能据此证明rAF执行；组合判据保留，不加hook/任意等一帧、不要求补跑。
- 严禁永久测试将category3或异常记录后成功返回；catch只保必要证据并重抛，预算/初始化/协议/污染/恢复后置不足均不得吞错，原有条款保持。
- 实际路径固定为 `tests/feed-sources.test.ts`；README必跑/界面加跑及条件组已逐项纳入，并明确mandatory优先、匹配输入复用与文件去重，不由affected替代。
- 根说明当前采用头为db29（仅新增T369测试、相关生产不漂移）；本稿未取得其完整SHA，不将15ad诊断原件改署db29。正式writer由根绑定完整实施基点，逐项核生产/README/测试输入及匹配产物，15ad受控证据保原来源。本轮不占writer，不改生产、WO、CI或任何case，不新增复现矩阵；最终PLAN交根串行补同WO后才可开工。
