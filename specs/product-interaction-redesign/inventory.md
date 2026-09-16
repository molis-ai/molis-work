# 页面与交互审视清单

### v12 信息密度

Feed列表/工具栏、Goal创建/记录/Frame/看板、Session编辑、Inbox/Artifact/Session阅读标题、项目/全局设置统一收紧空间。Session短选择器桌面双列、窄屏单列；设置列拓宽。保留正文、16px移动输入、44px触控与内部滚动，未整体缩放。17项浏览器回归与独立布局复查见progress.md。

### v11 连续工作区统一语言

- Goal工作区/记录：取消浮窗外框，贴齐当前pane；左上返回，外层标签保留。创建Goal与Frame添加已有内容改为贴边编辑面板。
- Feed/Session：共用贴边面板与固定操作栏，字段内部滚动；Session字段/说明恢复可读尺寸和自然间距。原生焦点隔离与确认契约保持。
- 设置与内容页：继承同一中性色阶、细边界和控件；独立设置、Inbox/Artifact/Session的既有内部滚动通过定向回归。状态、创建/重试等原行为验收仍见下表。
- 最新实现与审查状态见progress.md；v11替代下列历史描述中的视觉容器，不改变数据语义。

逐项从路由、renderer、表单和调用者审视入口、对象、主操作、必需字段、成功去向、失败恢复与退出。保留表示检查后延续业务设计，不表示每一个外部账号都已真实接通。最终测试结果以 progress.md 为准。

| 页面/流程 | 结论与处理 | 验证证据 |
|---|---|---|
| 工作区 Tab / 分屏 | 重做：常驻外层栏，等宽插件色组，布局菜单明确四方向；拖动、复制、合并、尺寸调整保留页面实例 | product-interaction / workbench-pane-feed / tab-workspace-ops；布局截图 |
| Goals 关系画布 / 看板 | 保留内部节点展开、拖动与定位；目录点击打开外层 Goal，内部关系图不混用 Frame | goals-momentum / workbench-frame-container；方向与事件路由检查 |
| 单 Goal Frame | 重做：顶部真实名称、结果、状态；工作区与定位入口；按 Goal 持久化引用，跨项目隔离 | product-interaction / workbench-frame-container：4 类真实引用及刷新恢复 |
| Feed 添加任务 | 重做：来源选择 → 对应字段及频率 → 创建；取消与创建同一底栏，Enter 提交；失败保留、部分成功重试不重复创建 | product-interaction：真实来源和计划持久化、失败注入与恢复；390/1440 截图 |
| Feed 任务配置 | 重做：每个任务旁的配置入口，名称/地址/范围/计划/拉取记录分层；底栏取消与保存配置配对，计划单独保存/撤销且保留上方草稿；公开来源范围只读，Gmail 才提供有效筛选；移除保留历史 | Feed sources / product-interaction 取消无写入、局部保存与失败重试；F2 resolved；外部 OAuth 未实连 |
| Feed 列表/详情/转 Inbox/升格/保存 | 重新设计：来源/时间/已读、标题、摘要分层；展开保留单标题、正文优先、附带资料折叠、去向与处理动作集中在底部；窄屏双列操作；演示动作仍只影响页面 | product-interaction 真实已读、详情失败重试、收起重开与筛选；feed-v5 桌面/390/用户1312截图；原领域测试保留 |
| Inbox 列表/筛选/处理/返回 Feed | 保留引用式阅读，进入原因/下一步优先；“完成”改为“标记已处理”，来源异常直达对应任务配置 | inbox-native-plugin；Frame 引用读取；空态截图 |
| Goal 创建 | 改造：名称/预期结果在前；补充说明、归属依赖、标识优先级分层；依赖含义改为收尾依赖 | goals-dialogs：失败重试、取消无写入、创建关系及历史 |
| Goal 备注/进展/报告/风险 | 改造统一表单宽度与操作；报告先选要求再给判断；问题新建与处理分开，接受风险才显示决定引用 | goal-event-document / goal-event-review：生产 UI 写入、读回与异常恢复 |
| Goal 完成要求/类型/约定/采用规划 | 改造选中方法才显示其默认要求；技术字段后置；保留类型版本及约定冲突检查 | goal-event-document / goals-planning：实际配置、报告与采用 |
| Goal 决策/提案/收尾/继续 | 保留明确作用对象与收尾检查；互斥决定不能同时勾选；保存后清理旧表单状态，收尾未生效保留原因 | goal-event-document / goal-event-review；读写状态回归 |
| Goal 关系新增/解除 | 依赖与归属使用人类意图选项，方向预览、原因与解除历史保留 | relation-ui / relation client 调用链；goals-relation 定向检查 |
| Goal 时间线/状态枚举 | 重做关系事件：类型、方向、Goal 名称、建立/解除标记、变更原因；原 ID 折叠；事件种类图标，运行/检查枚举转语义标签，首屏和分页一致 | goal-event-document-history / goal-event-history；时间线截图 |
| Goal 归档/回收/恢复 | 保留不同后果和二次确认，修正回收视图进入普通 Frame 的路径 | goals-dialogs；归档/回收渲染及状态恢复检查 |
| 项目目录/创建/迁移/引导 | 改造入口用语与迁移链接、路径提示；保留步骤后退、必填校验、可跳过 Runtime 和创建回执 | project-catalog / project-home-start / workspace-project-actions；引导截图 |
| 首页/搜索/快捷方式 | 保留已有日历和内容组织、搜索目的地及快捷方式编辑；未接 Agent 的输入明确不可用 | project-home-start；共享首页/搜索脚本与状态审视 |
| Sessions 目录/详情/新增/关联 | 保留创建/关联分流、能力说明和确认；新增空态真实创建入口；窄屏模式切换与关闭分开；原生/回退/不可读状态不混淆 | session-workspace / work-session-ui；桌面及390截图；F3/F4 resolved |
| Goal 终端/选择 Runtime/自定义/恢复 | 改造恢复 ID 为可选折叠项；保留打开、复制、填入不发送、发送的区别；不可用 Runtime 给理由 | work-session-ui / session-workspace；Runtime 选择截图；真实进程启动不作为本轮证据 |
| Artifacts 列表/版本/详情/下载 | 保留精确版本与真实导出，引用 JSON 后置；区分尚无成果、未选版本、精确引用缺失；不可用/跨项目不能假装打开成功 | artifact-browser：三种空态、版本、HTTP 导出、跨项目隔离；F6 resolved |
| 插件市场/启用停用 | 保留项目作用域、依赖和未满足条件说明；市场作为独立管理表面，返回工作区保留状态 | project-plugins / tab-workspace-ops；市场截图 |
| 全局外观/工具/诊断/项目管理 | 保留偏好即时保存与 Runtime 变更预览分离；项目路径后置，“打开工作台”纠正行为名称；跨设置页及规划新建/取消保留返回项目上下文并恢复原 Goal Frame | visual-foundation / project-home-start / project-settings-deletion / project-settings-navigation；F5 resolved |
| 项目常规/说明/规则/规划 | 独立设置路由及内容；原混合页面拆开，旧 embed 不再是页面加载前提；失败保留编辑与版本 | project-settings-standalone / project-policy-save；完整页与390截图 |
| 规划库/详情/新建/编辑/采用/历史 | 改造说明优先、路径/覆盖/依赖等高级结构折叠；保留复制模板与独立项目版本 | goals-planning / goals-planning-ui；桌面和390编辑截图 |
| 全局对话框/错误/空态/按钮陈列 | 改造相邻主次操作、可读标签、适应内容高度、可见错误、取消返回、移动触控尺寸 | product-interaction / goals-dialogs / project-settings-standalone；代表性截图 |
| 动效/微交互/视觉与触觉反馈 | 统一快速按下/焦点反馈、菜单及对话框进入退出、分屏落点提示、状态反馈；不延迟拖动；减少动态效果去空间动画；触摸设备支持时确认选项轻震 | coss-controls / preferences；浏览器 reduced-motion 检查；macOS 浏览器无振动能力，未宣称原生触觉 |
| macOS 菜单栏胶囊 | 审视后保留只读当前目标和进入工作台；无独立配置表单 | 共享路由/renderer 源码；本轮未运行原生打包验收 |


### v7 低窗口补充
- 目录中区：改造；1024×400 不再被压为 0，Feed 添加入口真实点击通过，项目与账号保留。
- Session 新建/关联/关系弹窗：共享布局改造；新建/关联真实低窗口回归，正文与操作分离，工作目录可选择自定义路径，取消不持久化。
- Feed 任务弹窗：保留；1024×400 与 390×500 创建/取消回归通过。
- Inbox：本轮仅空态抽查；Artifacts 长内容、本轮未重验。此前已验项见原表，不扩大本轮证据等级。


### v8 长内容补充
- Inbox：改造；长标题/处理上下文与固定操作底栏，真实处理和原消息保留通过。
- Artifacts：改造；工作台与独立版本链接都组件内滚动；60条 JSON/精确版本导出通过，Goal 嵌入结构保留。
- Session 详情：改造；固定标题/搜索、执行记录内滚动、上下文按需展开，35条真实本地记录搜索及两侧分屏加载通过。运行记录是隔离项目的本地事实，未启动外部 Runtime。

### v9 设置编辑适配
- 工作规则：高级项、原因与历史进入字段滚动区，标题/保存取消/错误反馈固定；低窗口与窄屏验证通过。
- 项目说明：编辑时专注当前表单，取消返回原入口；保存失败保留草稿、在途禁用编辑/取消；新增/停用/恢复和版本记录通过真实API验证。
- 验证证据：`tests/settings-viewport.e2e.test.ts`、`.impeccable/review/settings-viewport-v9/`、`/private/tmp/molis-v9-confirm-tests.log`。其他设置的全部低频表单不因本轮两类通过而视为额外验证。

### v10 Goal 记录表单
- 备注/进展/问题/决定/收尾与恢复/约定/模板和完成要求：统一固定首尾、字段内部滚动；避免sticky底栏盖住输入。Goal标题保留，编辑时移除重复工具栏。
- 失败保留草稿；请求中字段inert、按钮禁用且拒绝重复提交。真实写入与写后读回重试通过，既有版本冲突路径通过。
- 窄屏/低窗口实屏重点覆盖问题表单，其他模板走共用结构与既有真实浏览器功能回归；不把共用CSS视为所有排列组合已验证。
- 证据：`tests/goal-form-viewport.e2e.test.ts`、`.impeccable/review/goal-forms-v10/`、`/private/tmp/molis-v10-final-ui.log`、`/private/tmp/molis-v10-read-retry.log`。

### v13 连续动线与提交保护
- Goal→Frame→记录→Feed→Inbox：1440/390实际点击、真实本地持久化、查看原消息返回与处理历史通过；外部Feed正文为显式隔离fixture，不代表外部拉取已验。
- Session创建/关联：请求中冻结字段/模式/关闭入口，防止重复提交；失败保留草稿，真实关联重试唯一保存，设置返回可见。实际验证关联路径，共用提交处理覆盖创建保护；没有真实原生启动。
- 窄屏新Goal：显式导航优先显示内容，刷新保留主动打开的目录，避免旧状态遮挡新Frame。
- 证据：`tests/project-user-journey.e2e.test.ts`、`tests/session-association-journey.e2e.test.ts`、`.impeccable/review/journeys-v13/`；最终19项定向回归通过，其中15项实际浏览器、4项渲染/VM契约。

### v14 剩余场景收尾
- 规划全局/项目：1024×400与390×500，缺失必填组定位、保存中返回/取消保护、网络失败草稿、成功版本与编辑取消全部通过。
- Goal关系：建立/解除404已接回领域命令；创建方向、取消无写入、解除历史、重复写唯一事件、错误输入/未授权/跨项目验证通过。
- 类型/要求：真实第一步成功后，第二步网络/HTTP失败；状态明确，重试不重复类型，要求准确绑定并持久化。
- 压力布局：多长标题标签、80条内容、三分屏、正文展开、真实滚轮、窄屏切换、刷新恢复通过。
- 真实集成：公开RSS、Codex执行/读回/关联、GitHub只读通知同步通过。Gmail授权失效，等待用户重新授权，未完成。其他运行时、原生硬件和发布仍不扩展为已验。
- 证据：closing-v14截图、v14-final-tests 39/39、v14-full-build、live-final的RSS通过项、codex-final、accounts的GitHub成功/Gmail授权失败。
