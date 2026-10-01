# 执行状态

## v14 收尾验收（2026-09-16）

状态：可独立完成的代码、表单与复杂布局收尾完成；真实Gmail同步等待用户重新授权，不能标为全部完成。其他真实集成已经执行。
- 规划：全局/项目新建与编辑表单字段内部滚动，固定保存/取消和反馈；移除保存范围的胶囊外框。原“以下可选”与后端必填条件冲突，现明确步骤/覆盖问题/依赖判断各至少一项，提交前展开并聚焦缺失组。请求期间字段和本地返回/取消锁定；失败草稿保留，编辑取消不增加版本。
- 关系：复现原POST建立/解除路由404，补回薄HTTP适配调用已有领域命令，保持方向/图校验/原因/历史。新增在途guard和字段/取消保护；客户端固定同次提交幂等键，宿主仅放行关系这两条持久幂等路径的完成重放，保留控制令牌/Origin/in-flight校验。
- 组合保存：类型写入成功、完成要求失败时明确显示“类型已登记，但完成要求没有写上”；网络和HTTP失败均验证重试后只有一个类型和一项绑定要求，刷新持久化正确。
- 复杂布局：12个长标题Goal标签、80条长Feed内容、横向+向下三分屏，实际滚轮/展开长正文、刷新恢复、390窄屏焦点切换均通过，根页和iframe不被撑高/撑宽。明暗实际截图见`.impeccable/review/closing-v14/`；全局/项目规划1024×400和390×500错误反馈与操作栏截图已检查。
- 完整构建通过：`/private/tmp/molis-v14-full-build.log`；最终39/39定向回归通过：`/private/tmp/molis-v14-final-tests.log`，包括UI、HTTP安全/项目隔离/幂等/历史、Feed连接器领域契约与渲染，不能都称为浏览器或真实外部测试。此前10项基线覆盖Kanban、Frame、长内容和标签等：`/private/tmp/molis-v14-baseline.log`。不重复累计重跑用例。
- 真实RSS：通过生产管道读取公开Atom源，实际内容持久化，第二次拉取零新增，界面阅读后加入Inbox；见`/private/tmp/molis-v14-live-final.log`的RSS通过项（该日志Codex最后一步期望200错误，正式API是201，见下一项修正后的结果）。未将fixture当作公网成功。
- 真实Codex：本机0.154.0，生产app-server transport/adapter创建隔离工作目录Session，执行只回显固定文本的指令，真实读回并关联CORE，刷新只有一条关联；`/private/tmp/molis-v14-codex-final.log`通过。早期一次未打开工作台导致测试缺控制header函数，一次误期望200而实际201，均为测试错误；无需修改正常工作的Runtime启动参数。测试清理调用仅针对自建Session归档。
- 真实GitHub：已有授权只读同步成功50条通知；`/private/tmp/molis-v14-accounts.log`的GitHub通过项。未输出私人通知正文，隔离数据库已清理。
- Gmail阻塞：同日志Google拒绝token refresh，错误码connector_needs_auth；不是可重试网络故障。已通过异步问题要求用户在Feed中重新授权，等待回复后仅重跑Gmail实际同步。修正用户恢复信息不再指向旧Settings→Connectors；Provider原始诊断仍存于历史。未撤销/替换用户凭据，未假装成功。
- 测试纠错记录：窄屏Goal信息默认折叠，先展开再点击；新规划成功返回列表而非详情；非法请求最初key不足8字符，改为合法key后重新验证字段校验；关系HTTP重放最初由宿主409拦住，已按生产幂等契约修复并复验。未用放宽领域规则让测试通过。
- 设计说明和inventory已更新；git diff --check通过，无Git提交或发布。4186预览已更新到最终构建，PID33312，health.status=ok；未主动刷新用户页面。

## v13 连续用户动线（2026-09-16）

完成等级：本地功能可用。本轮把已有页面级检查串为真实操作路径，修复两项可复现问题。
- Session创建/关联：提交中禁止模式切换、字段修改、关闭/Escape和重复提交；保留已禁用控件的原状态。连接失败显示中文说明、保留草稿并恢复操作；重试后真实数据库只有一条关联。没有启动外部Runtime。
- 窄屏新Goal导航：初始化末尾旧目录状态覆盖了显式Goal导航，创建后目录遮住Frame。现在直接导航优先显示Goal内容；用户主动展开目录后刷新仍保留目录，设置返回和标签/分屏恢复回归通过。
- 1440×900/390×640连续操作：创建Goal→外层Frame→备注记录→添加RSS来源→阅读Feed→加入Inbox→查看原消息→返回Inbox→标记已处理。验证备注实际时间线和持久事件、关联/已读状态、Inbox历史为done、原Feed正文保留及刷新后根页面无滚动。外部正文明确由隔离fixture注入，来源任务通过真实表单创建。
- 构建通过：`/private/tmp/molis-v13-work-build.log`、`/private/tmp/molis-v13-workbench-build.log`，分别为work插件和workbench所属包；未重复全仓构建。
- 最终19/19通过：`/private/tmp/molis-v13-final-tests.log`，其中15项为实际Chrome浏览器用例，4项为Work渲染/VM客户端契约测试。覆盖新增连续动线和Session在途/失败、Goal草稿/回收恢复、Feed多层分屏/迁移、设置返回和低窗口。没有将渲染/VM测试算成真实Runtime。
- 基线另有2项Session API/领域集成通过，使用模拟Runtime transport：`/private/tmp/molis-v13-baseline.log`。该日志其余9项已包含在最终回归中，不重复计数。
- 实屏检查：`.impeccable/review/journeys-v13/` 的Session保存中、Goal备注和Inbox引用，桌面及窄屏。两种尺寸动作栏、内容和状态反馈均可达；其他明暗密度证据沿用v12，不将本轮浅色截图算作重新验证深色。
- 初始试验区别：Session桌面缺少在途保护、Goal窄屏目录遮挡是产品问题；测试第一次误用readState查备注（备注属于listEvents时间线），以及已展开目录时再点击被遮挡打开按钮是测试错误，已纠正，未弱化持久化或点击断言。
- 4186原预览进程已不在监听；重新启动当前构建，PID12849，health.status=ok。未刷新用户原标签页，未改用户主题/草稿。`git diff --check`通过。
- 未运行：真实账号Feed拉取、真实原生Runtime创建/执行、原生发布及硬件触觉。全产品旧低频表单的全部排列组合也不因本轮通过而视为已验；保持此前inventory边界，没有Git提交。

## v12 信息密度（2026-09-16）

- 完成：延续连续工作区，Feed行最小104→88px、工具栏64→52px，标题14px/摘要12px；设置内容840→920px、顶部36→24px、行padding20→14px；主要内容标题18–20px。贴边编辑器字段gap18→12px，短Session字段桌面并排、窄屏单列；Goal折叠项44px点击行，避免重复空白。正文可读性、手机16px输入/44px动作、外层标签和组件滚动保留。
- 构建通过：设计系统与工作台`/private/tmp/molis-v12-build.log`；该命令一个Goal包名未匹配，已用实际包名补建Goals插件和工作台，`/private/tmp/molis-v12-goals-build.log`通过。没有把未匹配包计作已构建。
- 17/17浏览器用例全部通过：`/private/tmp/molis-v12-tests.log`，覆盖continuous-surfaces/product-interaction/goal-form-viewport/settings-viewport/long-content-viewport/low-viewport/attention-journey。真实字段滚动、保持首尾、焦点对比度、保存/重试/取消、Kanban滚轮与Frame引用通过。无新增领域行为。
- 1440×900、390×640与1024×400/390×500明暗证据：`.impeccable/review/density-v12/`。独立布局复查8张截图确认建议达到、未发现阻塞可用性的回退，见layout-review.md；移动Session下方字段滚动由low-viewport真实输入/取消测试验证，不把单张截图当作证明。
- DESIGN.md、设计sidecar与surface已同步当前密度；git diff --check通过。保持本地功能可用等级；本轮为视觉布局调整，未重跑全仓/原生发布和外部执行。
- 本地4186预览已重启到v12构建，health.status=ok；未刷新用户正在编辑的页面。

## v11 连续工作区（2026-09-16）

- 用户最新纠偏取代旧浮窗视觉：Goal内容贴齐pane、返回在左侧；记录表单直接呈现在页面，保留固定操作/字段内部滚动。统一创建Goal、Feed任务、Session、Frame选择器为右侧贴边编辑面板；原生dialog焦点隔离仍保留。
- 共享表面样式取消面板阴影/外圆角/缩放弹起，弱化背景；Session字段靠上排列，字体与提示统一，确认框对齐。短搜索与危险操作保留轻量浮层。
- 完整构建通过：`/private/tmp/molis-v11-final-build.log`。代码中的`continuous-workspace-v11`设计合同存在于构建输出。
- 17个不重复浏览器用例通过：首批`/private/tmp/molis-v11-tests.log`的15项通过；其余两个新增连续工作区用例原先错误假设demo事件cursor为1，改为真实创建后的基线对比，`/private/tmp/molis-v11-final-ui.log`通过2项，另复验2项低窗口。未更改生产语义或放宽取消无写入断言。
- 实屏来自隔离项目，包含1440×900、390×640和1024×400/390×500，明暗主题、字段失败/重试及长内容。证据位置`.impeccable/review/continuous-v11/`；没有操作用户原窗口或改变用户偏好。
- 独立审查发现并单批修正V11-F01（Goal创建内层旧圆角框、字段拉伸）与V11-F02（Feed旧高优先级CSS取消focus outline）。实际内层shell已去边框/圆角/阴影，字段网格靠上；Feed输入/选择共享2px主题焦点轮廓，无竞争光圈。对相邻表面的焦点对比度实测浅色3.686、深色6.826。
- 修正后工作台构建通过`/private/tmp/molis-v11-fix-build.log`，6/6定向回归通过`/private/tmp/molis-v11-fix-tests.log`：连续表面、低窗口、Frame引用与Kanban。创建Goal展开后真实wheel滚动、固定首尾及内层无框均有断言；Feed真实Tab进入select和深浅主题focus均有断言。原11张评审图已原路径更新，附低窗口展开与深色Feed图。
- 独立复核结论：V11-F01/F02均resolved，disposition为ship；只覆盖这两项修正，见`.impeccable/review/continuous-v11/fix-verdict.md`。初次完整范围与限制见同目录finish-review.md。
- 4186预览已重启到当前构建（PID32096，health.status=ok），未刷新用户有可能持有草稿的页面。独立documenter已同步DESIGN.md、PRODUCT.md、设计sidecar和immersive-workbench surface，移除旧浮窗/70:30描述并保留领域事实；最终git diff --check通过。完成等级保持本地功能可用，不宣称全产品无缺陷、原生发布或真实外部Runtime/OAuth接通。

## v6 注意力、连续动线与组件滚动

- 用户追加的整体验感复查已转入 spec 的 v6 合同；前轮完成记录仅代表前轮范围。当前实现、独立审查修正与设计文档同步均完成。
- 当前 Goal 的 Frame、目录选中和页面标题同步；折叠标签组仍保留当前标签。显式“打开 Frame”切回已有标签的 Frame，普通分屏保留当前 Frame/工作区视图。
- 消除同一分屏点击时重新搬移 DOM 导致的焦点丢失；备注进入首个输入框，Feed 详情重试/收起留住条目焦点，终端菜单关闭返回正确入口。终端菜单 visibility 过渡曾令焦点落在隐藏元素上，已删除该过渡，保留 opacity/transform 动效。
- Goal 信息优先显示真实待满足要求/决定/阻塞事项；不把存在依赖等同阻塞。历史默认收起，显式阅读和恢复保留。空终端提供原地添加；Frame 可搜索/筛选已有项目内容并添加本地引用，不创建领域对象。
- 首页增加可用 Goals 入口，引用改手动切换；保留日期/日历/原文及未开放 Agent 事实。
- 一屏外壳、组件内滚动：Feed 工具栏全宽固定且边界完整，列表及长正文独立滚动；长 Goal 表单操作栏粘在自身底部；设置页保持 settings-content 滚动。390×844 高级规则页实测文档高度 844，滚动容器 689/1473；1440×900 Goal 文档高度 900；1312×936 上下分屏文档高度 936。
- Kanban 真实 wheel 输入验证：指向长列纵向读卡片，横向/Shift 横移，标题和空区可横移；列到底不突然转轴；页面不滚动。
- 最新构建 `/private/tmp/molis-v6-build.log` 通过。`/private/tmp/molis-v6-confirm-tests.log` 26 项中 25 通过，最后一个是测试主动收起标签组后直接点隐藏母标签；修正测试为先展开组，`/private/tmp/molis-v6-attention-confirm.log` 2/2 通过，包含上述滚轮和 Frame/焦点完整路径。没有改变产品语义来迎合旧测试。
- Feed 五项（长正文滚轮、失败重试、收起/筛选焦点）、独立设置两项、Goal review 在 `/private/tmp/molis-v6-final-tests.log` 通过；该日志的终端焦点及旧分屏重置预期失败由上述新结果取代。首页三项与原 Frame 容器在 `/private/tmp/molis-v6-new-tests.log` 通过。不把重复运行相加为独立用例数。
- 当前有效截图及独立审查输入：`.impeccable/review/attention-journey-v6/review-packet.md`。实屏确认覆盖 1440、390 和模拟用户已知 1312×936；不声称已再次操作用户原窗口。旧 assessment 截图只用于问题来源。
- 独立审查发现并修正 V6-F1 原生换句按钮、V6-F2 共享样式覆盖44px热区；同一 reviewer 针对这两项评分 **ship / resolved**，见 `attention-journey-v6/fix-verdict.md`。结论不扩展为全产品不存在其他缺陷。
- 最终构建 `/private/tmp/molis-v6-review-fix-build.log` 通过；首页三项回归在 `/private/tmp/molis-v6-review-fix-tests.log` 通过；`/private/tmp/molis-v6-touch-confirm.log` 2/2 通过，包含窄屏/粗指针实际热区、真实动画完成后的尺寸、Frame完整交互及Kanban滚轮。五张受影响截图已原路径重拍并获复核。
- 测试视口、临时主题均已还原；没有修改用户持久主题、启动Runtime、提交Git或发布。预览4186已重启到最终构建。
- 独立 documenter 已依据最终代码更新 DESIGN.md、设计 sidecar 与 immersive-workbench surface；保留既有 schema/tokens 和历史证据，移除自动换句旧描述并标记旧移动端热区限制已被 v6 替代。最终 `git diff --check` 通过。
- 等级保持本地功能可用；真实 Runtime 执行、外部 OAuth/拉取、原生发布和触觉硬件仍未验证。

## 前轮全产品改造记录（v4/v5）

- 26 组页面/交互已完成审视与必要改造，逐项记录见 inventory.md。独立设计审查的 F1–F6 和 Feed V5-1 均已解决，设计文档已同步，本 session Goal 达到约定的功能可用等级。
- 构建通过：`pnpm build`，日志 `/private/tmp/molis-product-build.log`。
- 最后定向回归 6/6：`/private/tmp/molis-last-functional.log`。覆盖创建 Goal 草稿/失败重试/回收恢复、Frame 外层标签/向下分屏、Feed 创建与计划部分失败重试、工作区标签切换。
- Goal 完整生命周期、分页失败恢复：`/private/tmp/molis-goal-final-regression.log` 中三个 event-document 测试通过；指针操作/写后读失败重试：`/private/tmp/molis-goal-diagnostic2.log` 对应测试通过；关系历史与刷新：`/private/tmp/molis-goal-acceptance.log` 对应测试通过；母画布拖拽/平移/重载：`/private/tmp/molis-goal-navigation-regression.log` 对应测试通过。早期失败由新日志的对应结果替代，不视为整份旧日志全绿。
- 第二轮截图已完成：`.impeccable/review/product-interaction-v4/final-*.png`。涵盖 1440、390、用户实际 1312×936；坏的加载截图不进入验收。
- 动效实测：普通模式弹窗动画 180ms，过渡 120/160ms；模拟 reduced-motion 后均为 0.01ms。视口及媒体覆盖已还原。触觉仅 guarded 浏览器能力；未声称 macOS 原生触觉已验证。
- 检测器仅执行一次，结果 `[]`：`/private/tmp/molis-product-detector.json`。
- 独立 finish review 的按钮陈列、Session 空态/弹窗、Artifacts 空态、全局设置子页返回上下文六项修复已获 ship；详见下方最终记录。
- 无真实外部账号授权、后台外网任务、原生 macOS 打包或触觉硬件验证；本轮等级为功能可用，不能称为可发布。


## 最终审查修正与 Feed 阅读重做
- 已完成独立审查 F1–F6 的实现：12 种 Goal 表单取消/提交同栏；规则安全重置；Feed 配置底栏与独立计划撤销；Session 标题不重叠、首用主按钮；全局设置和规划导航贯穿项目上下文；Artifacts 三种空态。
- 用户追加的 Feed 列表和阅读已重做：紧凑来源/日期/已读元信息、单标题连续阅读、正文优先、资料折叠、底部操作与状态，390 动作双列；展开指示与短入场动画，减少动态效果无位移。真实用户 1312×936 已刷新并检查。
- 最新构建通过：`/private/tmp/molis-review-fixes-build.log`。
- `/private/tmp/molis-review-fixes-tests.log` 31/33：Goal 生命周期/读写失败/回收、Artifacts 三态、规则取消/失败/保存、分屏页面保留等通过；其两个导航失败已定根因修正（引导迁移旧测试预期；全局规划错误采用项目导航）。
- `/private/tmp/molis-review-fixes-final-tests.log` 13/13：上述导航修正、全局设置跨页返回并恢复 Goal Frame、Feed 行为及共享控件通过。
- `/private/tmp/molis-feed-final.log` 5/5：进一步确认配置取消不写入、计划单独保存不丢任务草稿、保存后暂停计划的撤销保持暂停、配置失败保留重试、已读/详情失败重试/收起/筛选通过。
- F1–F6 同一 reviewer 定向复核为 **ship**，六项均 resolved：`.impeccable/review/product-interaction-v4/fix-verdict.md`。结论仅针对原六项，不等于全产品不存在其他问题。
- 用户重新提出的 Feed 列表/阅读经过 fresh full review；唯一 V5-1 重复 Feed 标题已移除，八张桌面/390/用户实际 1312 截图在同一路径重新捕获。同一 reviewer 修复评分 **ship / V5-1 resolved**：`feed-v5-finish-review.md` 与 `feed-v5-fix-verdict.md`。
- 最终构建通过：`/private/tmp/molis-feed-v5-finish-build.log`。补充领域与浏览器回归 **28/28**：`/private/tmp/molis-redesign-final-contracts.log`（Feed、规划、关系历史、母画布、工作区标签恢复）。不将重复运行数量相加为独立用例数。
- 预览已重启并更新用户窗口，保留新版 Feed 展开阅读；测试窗口的视口与媒体覆盖已恢复，空白 Session 测试弹窗已关闭。
- 独立 documenter 已按最终代码合并更新 `DESIGN.md`、`.impeccable/design.json`、`.impeccable/surfaces/immersive-workbench.md`；保留既有设计语言和 tokens。最终 `git diff --check` 通过。
- 无第二次 detector。保留真实外部 OAuth、原生触觉、真实 Runtime 启动及发布物未验证边界；本轮没有发布或提交 Git。


## v7 低窗口与长表单适配（2026-09-16）
完成等级：本地功能可用。实屏复现并修复两类问题：Session 弹窗首尾被整体滚动带走；低窗口目录被固定导航/快捷方式挤为零高度。
- 导航、目录和快捷方式进入侧栏中区；目录至少 180px。空间不足时中区滚动，项目与账号保留；正常窗口列表沿用独立滚动。
- Session 新建/关联及关系管理共用固定首尾和可滚动字段区；移动端按弹窗实际内部高度适配边框，Handoff 保留原编辑器结构。工作目录候选高度不再出现负值。
- 通过：完整构建 `/private/tmp/molis-v7-build.log`；最终 work 插件构建 `/private/tmp/molis-v7-work-build.log`。`low-viewport.e2e.test.ts` 两个真实浏览器用例通过（`/private/tmp/molis-v7-confirm.log`），覆盖 1024×400、390×500、Feed 创建/取消入口、Session 关联字段滚动、固定首尾、自定义路径、取消后刷新无新增 Session、根页面无滚动。
- 通过：Session 目录两项领域/API 回归和标签工作区一项浏览器回归（`/private/tmp/molis-v7-regression.log`）。同文件较早的移动端 1px 溢出失败已由上述最终回归确认修复，不计重复执行为额外用例。
- 通过：实际 Chrome 预览最终 1024×400 / 390×500 Session、1024×400 目录滚动及 1440×900 Feed 视觉检查，截图位于 `.impeccable/review/low-viewport-v7/`。预览 4186 已更新。
- 保留：Feed 任务弹窗在 400px 高度下原本已正确固定标题/底栏，本轮仅回归；Inbox 实屏只抽查到空态。没有以空态或 CSS 检查宣称 Inbox/Artifacts 长内容全面验证，没有真实 Runtime 启动、外部服务或原生发布验证。


## v8 长内容阅读适配（2026-09-16）
完成等级：本地功能可用；本轮覆盖 Inbox、Artifacts、Session 详情，不据此声称全部产品无缺陷。
- Inbox 长标题收至 20–22px；标题与处理上下文内部滚动，处理动作/错误反馈独立底栏；窄屏三动作保持可见。
- Artifacts 工作台与独立版本页都拆分标题、正文、导出；原始 JSON 有内部滚动，不再生成数千像素整页高度。Goal 嵌入摘要保留原结构。
- Session 收紧首屏标题/空白，去掉前置重复 ID（仍在身份详情）；执行搜索固定、记录内部滚动，关系/历史默认折叠到上下文。移除旧网格对齐规则对新纵向布局的影响，搜索栏与记录区使用完整宽度。
- 构建通过：`/private/tmp/molis-v8-final-build.log`；最后样式调整的 workbench 包构建 `/private/tmp/molis-v8-workbench-build.log`。
- 定向领域/渲染/API/上一轮低窗口回归 17 项通过：`/private/tmp/molis-v8-regression.log`。该轮两个长内容浏览器用例的刷新等待问题已在测试中改用真实导航等待；另修正测试的不存在 GET 路径与 iframe 尚未就绪的等待，不改变产品语义。
- 最终长内容浏览器回归：`/private/tmp/molis-v8-final-ui.log`。覆盖 1024×400、390×500；Inbox 点击处理后持久状态为 done 且原 Feed 正文仍在；Artifact JSON 可滚到末尾、导出仍是 v1/60条完整数据；Session 搜索第35条、关系取消保留原 Goal/35条记录；1280×900上下分屏加载两侧真实记录并核对可用高度和宽度；独立 Artifact 页面无根滚动。
- 截图：`.impeccable/review/long-content-v8/`。明暗两种主题，桌面/窄屏/上下分屏；`session-split-1024.png` 为该桌面用例内切换至1280×900后的截图。主题切换按实际 storage 事件更新，等待过渡结束后截图；不以过渡中间帧作为暗色验收。
- 预览 4186 已更新。没有真实 Runtime 启动、外部账号、原生硬件或发布验证；没有 Git 提交。

## v9 设置长表单与保存反馈（2026-09-16）
完成等级：本地功能可用。本轮覆盖工作规则、项目说明编辑；保留此前已完成的其他界面改造。
- 真实浏览器复现保存栏脱离首屏：1024×400时规则约y800、说明约y485；390×500约y1154/y638。修复后操作栏分别在352–388/356–388与446–490，字段区独立滚动，根页面不滚。
- 项目说明编辑集中使用设置内容区，暂时收起列表；取消清空草稿并恢复入口焦点。修复延迟聚焦计时器在取消后可能重新抢焦点的路径。
- 规则/说明保存期间禁用当前字段和取消，拒绝重复提交，说明Escape不能假装取消在途请求；失败恢复输入与按钮。连接失败改为“无法连接本地服务，输入已保留，请重试。”，业务错误保留服务端说明。
- 通过：完整构建 `/private/tmp/molis-v9-build.log`；最后客户端修改后Goals/workbench定向构建 `/private/tmp/molis-v9-final-goals-build.log`、`/private/tmp/molis-v9-final-workbench-build.log`。
- 通过：最终5项定向测试 `/private/tmp/molis-v9-confirm-tests.log`：规则领域原子保存/幂等、设置分类与工作台返回恢复、说明版本与失败重试、两个真实浏览器低窗口流程。低窗口流程覆盖规则取消/校验/失败/重试/刷新持久化，说明取消焦点/失败草稿/慢请求锁定/Escape/真实新增/停用/恢复版本。早期一次几何断言读到动画最后一帧的微小偏差，改为等待实际动画完成，未放宽几何要求。
- 通过：明暗实屏截图 `.impeccable/review/settings-viewport-v9/`；最终截图等待反馈动画完成，确认中文错误和固定操作栏。DESIGN.md与surface已同步，设计token未改变。
- 通过：`git diff --check`。预览4186已重启更新，没有主动刷新用户页面以免丢失草稿。
- 未运行：真实外部Runtime、原生发布包。本轮不新增自动保存/离页拦截，没有Git提交。

## v10 Goal 记录表单（2026-09-16）
完成等级：本地功能可用；完成本轮Goal表单切片，未宣称全产品无剩余问题。
- 确认低窗口信息面板默认折叠是正常行为，点击Goal顶部信息按钮可达；不修改该入口。原问题表单在1024×400高223px、内容680px，sticky操作栏直接覆盖输入；窄屏同样复现。
- 12类表单模板统一显式标题/字段/底栏结构，包含备注、进展、问题、决定、收尾/恢复、约定、模板/要求。字段区内部滚动，按钮不再覆盖输入；移除表单编辑时的重复返回工具栏。外层Goal标题常驻。低窗口实际表单高度266px，窄屏375px，表单本身不滚动。
- 保存期间字段区inert，保留FormData语义；禁用按钮和重复提交、阻止本面板内切换。失败解锁并保留草稿，中文连接提示与操作同区。保留幂等键、版本冲突、类型/要求组合操作及已写入/读回失败的既有路径。
- 通过：完整构建 `/private/tmp/molis-v10-build.log`；最终反馈样式构建 `/private/tmp/molis-v10-final-design-build.log`；`git diff --check`。
- 通过：既有5项浏览器回归（Frame引用/焦点、Kanban、事件配置/报告/问题/决定/收尾/冲突、历史只读、时间线分页）见 `/private/tmp/molis-v10-tests.log`。其中新增的两个低窗口测试最初因被动等待CSS transition.finished而超时；确认是120ms background-color过渡等待未推进帧，改为有限过渡的逐帧检查，没有改生产语义或放宽几何断言。
- 通过：最终两个低窗口用例 `/private/tmp/molis-v10-final-ui.log` 中对应结果，覆盖1024×400/390×500字段真实滚动、固定首尾无重叠、取消无写入/焦点返回、失败草稿、慢请求inert/按钮状态、重复submit无额外请求、完整问题正文/范围/状态持久化及刷新。明暗截图 `.impeccable/review/goal-forms-v10/`。
- 通过：写入后读取断线/重试不重复、阅读选择保留、要求/备注/恢复目标路径 `/private/tmp/molis-v10-read-retry.log`。旧测试的返回入口改为实际可见的表单底栏取消，阅读页仍用工具栏返回；未隐藏测试失败或恢复冗余按钮。共8个不重复浏览器用例通过。
- DESIGN.md与surface已同步。预览4186已重启，未主动刷新用户页面，保留用户草稿。
- 未运行：所有12类表单的全部低窗口排列组合、类型组合保存第二步单独失败、旧关系编辑器完整低窗口流程、原生发布与外部Runtime。没有Git提交。
