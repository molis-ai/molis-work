# GW5 Goals Native Plugin UI 与文案

## 整项审查补齐项目工作规则页面

审查发现 `renderMolisWorkProjectSettings` 仍在 root 定位项目默认 binding、合并预填并渲染项目规则说明/回执/脚注；专属保存脚本和样式仍在 Workbench settings 聚合。该页面属于已接受的 Policy UI，不可归入笼统 Shell later 后声称 GW5 完成。将完整 settings document body 与预填交由既有 Policy contribution 的 project surface，脚本/样式/专属英文文案归 Goals。共享项目导航、head/meta/token/桌面标识继续由 Host 组装。旧 public asset 名作为 Workbench mount/export 保留，但不复制实现。

保留 last active project_default binding 选择、系统默认预填、所有说明/回执 DOM、表单字段/验证/失败恢复、sessionStorage 一次性回执与保存后 reload。比较迁移前后的中英文/桌面/空项目页面及脚本/样式；真实浏览器使用隔离项目验证缺失原因、失败重试、保存后恢复字段与回执、后台唯一更新及后续 Goal 继承。界面视觉与产品策略不改；公共 raw IIFE 保留既有 CONTROL/L Host 入口，不改整个 settings bootstrap。

## 完整页面与刷新页面的公开装配

随后将 personal/project Planning GET 的定位/404/页面选择接入统一 Workbench request adapter，消费 Goals route owner。Host 仍按原顺序提供有效 methods、Project context 和已 mount 的 renderer；project 新建页不增加 methods 查询，personal 路由保留原有效方法加载。保留两个 scope 不同的 404 文案、project 仅选择 project 方法、非法编码的原异常路径、GET-only 和响应头；Planning 写入、采用确认和权限不变。验证生产公共请求入口与真实 Planning 浏览器/HTTP 回归。

将根 `renderMolisWorkWeb` / `renderMolisWorkRefreshFragment` 的页面编排整体迁入 Workbench 有限 renderer，保留两个公共函数名和原参数默认值。输入仅约束集合、项目导航及 route prefix；完整 Web read model 通过泛型传给既有 owner，不复制根类型、Store 或执行规则。Goal document/tree/dialog、Feed、Work terminal/project operations 都通过明确的 owner 渲染入口装配，公共 HTML 外框、语言、图标、导航前缀仍是 Host 原语。Goals 在一级目录的入口模板由既有 Tree contribution 提供；Workbench 决定位置，不复制该按钮产品内容。

保留完整页与 refresh 页的 DOM、调用顺序、Decision/归档/回收的 TUI 与态势显示条件、空集合、项目链接前缀、桌面标识和客户端数据。迁移前保存隔离输出，再比较中英文完整页面/refresh，并验证真实 HTTP、浏览器导航/刷新、Desktop 回归。不会因此把跨 owner Decision/Execution 内容移进 Goals，或宣布全局 Cutover 完成。

## HTTP 读入口与页面集合装配

同段继续退出根 renderer 中正文/面板/记录/事件/快速记录/态势的重复集合路由：Goals 提供只读集合与 fragment 适用性选择，Workbench 的有限 fragment renderer 注入各 owner 函数并保持 prefix 顺序、默认参数与 null 语义。事件页排序/分页 HTML、Execution/Decision 和 Quick Record 的复合内容不搬入该路由适配器；仍由原内容 owner 提供。根公开函数名保持，改为装配结果的导出，不保留一套重复实现。定向测试必须检查只有被选中的 owner 被调用、trash 禁止的 fragment 不渲染、Quick Record 要求 current 且未归档/回收、事件输出不擅自套链接前缀。

原 server 对 GET 先解析路径，再读 Web view，选择 read renderer；完整页还内联判断 requested Goal 实际在 current/archive/trash 哪个集合，并在读取 Session/Workspace 前拒绝缺失 Goal。本段将请求方法/路径→公开 parser→惰性 renderer→结果响应模型的编排交给 Workbench，集合定位和原 404 文案归 Goals route owner。Workbench 可装配 Decision 页入口，但不迁移其内容、权限或执行验收规则。

Root HTTP host 保留 Project 解析、控制权限、view 查询、Artifact/Context Ledger 和 Session/Workspace 数据提供、响应头及 socket 写入。Workbench 不依赖 Node HTTP 或根 Web 类型；Plugin 的集合输入仅需 goal_id。保留错误优先级、只解码一次、集合只读语义、非法 GET 不读数据、不触发 Project operations 加载、POST/其他路径不误消费、current URL 可读已归档/回收同 id。验证公开请求入口的惰性调用/错误分支，以及真实 HTTP status/headers/body/Project 隔离和原浏览器导航/刷新/Planning。仅完成本段不能宣称整个 server retired。

## 共享刷新中的 Goals contribution 收口

根页面后续只保留跨插件 Shell 组合；Goals 集合选择、标题/搜索/阶段计数文案、完整目录和刷新目录由同一 Goals Tree contribution 提供。两种页面共用最小集合模型，保留 requested → 当前 active（仅当前集合）→ 首项的选择顺序，以及 Decision 页不自动选择 Goal。归档/回收、空集合、刷新无 class 包装与完整目录的既有 DOM 差异均保留。验证中英完整 HTML/refresh 输出对比、公开 contribution 的选择/空态/计数，以及已有 Tree/刷新真实浏览器；不移动 Execution/Decision 页内容。

共享游标请求、搜索/脏表单保护、Decision/Feed 刷新、全应用 UI 状态与导航链接归 Workbench。Goals Plugin 只准备 Goal 集合选择/迁移回执及树、正文、筛选、计数、新建候选项的 DOM 更新；准备阶段不得改页面。Host 确认请求期间没有切换 Goal、没有新的输入后才调用更新，并在原位置更新 Shell 链接、恢复共享状态。保留 compact refresh → 完整详情 → 集合页 fallback、归档/回收/恢复时同 id 跳转、未保存新建内容及光标；不改变网络策略和后台数据。

修改范围为 Goals refresh client、Workbench 原刷新调用点、公开出口、对应浏览器测试及开发说明。用真实页面刷新验证外部归档/恢复、刷新请求中切换 Goal、compact 返回失败时完整页面 fallback，以及现有新建输入/Tree/Momentum/导航回归。Preparation 与 commit 分离只为保留现有异步请求保护，不引入通用事件总线或另一套状态管理。跨 owner 执行/Decision 内容仍由原 owner 提供，GW5 保持未完成直到根页面装配与所有对应旧职责退出。

accepted Goal `goal-reorg-gw5` revision 1。完成等级：现有页面和操作真实可用、前后端行为保持不变；最终全产品 E2E 仍归整体目标，不以单个表单迁移代替本 Goal。

## 现状与边界

当前 renderer 6,029 行，全局英文目录 3,532 行。Goals 列表/树、详情/关系、编辑、Planning、Risk/Policy 仍由根 renderer 持有；Goals Plugin 已有 Application API 与执行验收入口，但没有这些页面的真实 UI contribution。保留页面结构、CSS/选择器、路由、提交字段、权限与错误。替换 UI 的代码归属、全局文案归属与装配方式。忽略“已有 Plugin 包就已完成 UI 迁移”的历史判断。

Goal 事实及规则仍归 Modules；Plugin 只消费公开 Contracts/read models 并生产 UI。Workbench 注册贡献、注入转义/日期/图标/语言等宿主能力。跨 owner 执行、Evidence、Review、Decision UI 不并入本切片；不改视觉方向、不新增功能、不读写用户当前项目。

## 顺序

1. 工作规则面板形成完整可验切片：项目默认表单、Goal 额外规则、最终生效规则、只读态；同一 Plugin contribution 提供 form/editor 两个 surface，Workbench 只 mount。对应源模板及英文文案退出旧 renderer/全局目录。后端 policy 写入路由、约束和 HTTP 字段不变。
2. Risk、关系与树/列表、详情/编辑、Planning 依次迁移；需要的页面模型和路由 descriptor 由 Plugin 公开，根 Web 只装配公开 Query/Application/UI 端口。共享业务规则不在 Plugin 复制。
3. 迁移关联客户端交互与文案，核对根 renderer/server/i18n 剩余职责和退出条件，运行 Goals 定向与浏览器回归。不得留下只迁 helper 却声明整个页面迁移完成的状态。

## 工作规则切片

输入：现有 goal id、policy bindings、resolved policy、scope 和 edit flags；输出：原 HTML/form payload/选择器不变。旧 mergePolicy 只是预填表单值的浅合并，不能代替 Module 的权威 policy resolution；命名中标清 form values。只读最终规则继续使用传入 resolved_policy，Project baseline 不允许在 Goal 表单降低。现有 WebPolicyBinding 的 legacy scope 字符串保持，不误替换成另一套 Module binding scope。

修改范围：plugins/native/goals UI/copy/public exports、apps/workbench contribution registration/adapter/catalog、src/web/render.ts 对应 caller、相关 tests 和说明。首切片不改 HTTP route、CSS 或客户端提交脚本；后续退出仍在本 Goal 未完成清单内。

验收：现有 Web tests 的项目设置/Goal policy 继承、归档只读、错误与 HTTP 写入回归；新增公共 contribution 和 Workbench mount 测试覆盖真实表单输入/disabled/min/max、转义、只读与两种语言；定向浏览器操作按需要验证页面操作与持久化。类型、boundary、diff checks 同时通过。当前服务 4173 不参与测试，使用临时 DB/临时监听端口。所有剩余页面、路由与交互退出前，不关闭 GW5。

## 风险与影响范围切片

把风险事实表单、关联 Goal 选择、风险记录/解决依据、影响范围表单/停用历史以及组合面板迁入 Goals safety UI contribution。输入使用公开 Risk/Impact 事实及最小 Goal/read-action projection，不接 Store；用户决定入口只检查已返回的 user/risk action，不重新判定权限。共享风险状态文案供旧 Decision caller 暂时消费，Decision 本身不迁入本切片。列表排序是纯 UI 顺序，迁成 Goals 公共呈现函数供旧树和新选择器共享，避免两套排序。

保留原 HTML、字段、route、readOnly/editable 语义和归档关联。新增公共 mount 测试检查字段与转义、已解决/历史无依据、归档只读、只有用户 action 才显示决定入口、影响停用历史；定向 HTTP 回归检查真实保存和状态变化。已有英文翻译原值迁移；共享基础词留宿主。本切片不重写客户端或后端生命周期。

本切片测试复现旧模板缺陷：风险描述插值进入筛选 input 的 aria-label 时未进行 HTML 属性转义，描述里的双引号可突破属性边界。允许对此真实外部输入边界做最小修复：对完整翻译结果转义；不改描述本身或存储值。正常文本页面仍与旧输出一致，恶意文本以安全属性值显示，并保留故障敏感测试。

本切片继续移出对应浏览器提交逻辑：Risk 创建/编辑、Impact 创建/编辑/停用、Policy 保存及 Risk picker 的表单辅助。沿用现有脚本组装方式，Plugin 持有完整功能片段，Workbench 在原位置插入；暂不重做整个客户端启动器。Risk 状态决定、Human Review、Evidence 处理保留原 owner，不夹带迁移。比较组装后的生产脚本与迁移前字符串，并测试生产处理器的 payload、失败恢复和成功刷新，再进行真实浏览器风险表单保存/刷新验证。

## 关系切片

迁移上下游/其他关系、方向与类型文案、建立/解除表单、解除历史和快捷关系表单；共享树排序仍消费 Plugin 唯一实现。输入为公开 Goal/Relation 事实、解除事件摘要和只读开关。依赖提案历史属于 Decision 组合 UI，不并入关系编辑实现：根装配层先由原 owner 渲染，通过明确的 trusted dependencyHistoryHtml 输入放回原位置。该 HTML 只能由内部渲染器生产，不接受外部任意 HTML。

对应浏览器关系预览、方向选择、新增/解除提交和展开/取消行为迁入 Goals 插件，Workbench 仍在原位置组装；后端 direct user writes 与 Runtime proposal 区别保持，不能把关系操作变成自动执行。保留所有九种关系、方向、归档只读、无其他 Goal 空态、解除原因和历史、HTTP 字段、错误恢复；不改视觉或持久化。先作正常内容 HTML/脚本对比，再用公共 contribution 测试和现有全关系 HTTP 回归；真实浏览器检查选择方向、建立关系、解除及重载历史。同步 README/进度，不关闭整个 GW5。

Risk 和关系浏览器回归复用一个小型临时 Chrome/project fixture（从已通过的 Risk 测试提取），避免复制启动、导航同步、清理逻辑。它不提供产品能力或另一份进度系统；两项测试仍各自驱动真实 UI 并断言独立的持久化结果。

真实关系浏览器回归复现旧 bug：取消按钮使用 `closest('[data-relation-id]')` 找到的是同样带该属性的解除表单，之后 querySelector 不包含自身，因此无法收起表单或恢复打开按钮。允许最小修复为定位 `.relation-record` 外层记录；“取消”不写数据。原脚本逐字对比证据记录在修复前，修复后的差异明确限于此定位。

## 目标树列表切片

迁移目标树节点、子项进度、依赖展示、编号消歧、状态筛选栏和搜索/归档/回收站工具栏到 Goals 的 directory contribution。输入是公开 Goal/Relation 事实的最小只读投影；完成/阻塞提示沿用已有呈现判断，不调用 Store、不决定执行权限。共享编号与进度 helper 在 Plugin 只有一份，根详情和 Decision caller 通过 Workbench 公共出口暂时消费。状态图标/标签渲染继续由现有宿主注入，后续详情切片再清理其归属。

保留状态顺序、排序、关系方向、缺失/归档依赖、循环/孤立节点、搜索属性、筛选计数和快捷键/选择器；不顺便修改树算法或 UI。推进态势、详情以及浏览器启动器不整块搬入此文件。验证公共 mount 的层级、排序、依赖/子项进度、编号冲突、过滤和空态；现有浏览器用真实搜索、折叠、状态筛选和详情选中路径验证。正常页面在覆盖旧 compiled baseline 前进行逐字对比。关系取消修复与共用浏览器 fixture 随本轮一起回归；未取回的旧运行结果不记为通过。

真实浏览器发现桌面 CSS 的 `.desktop-goal-directory .tree-search { display: none; }` 隐藏唯一搜索框；搜索和快捷键处理器仍指向它。此已发生的功能缺口归 GW5 搜索保真验收：仅在原工具栏恢复已有搜索框、占一整行，保留下方原按钮与窄屏样式，不新增搜索功能或改变查询逻辑。补真实点击/键盘搜索、空态恢复及桌面/窄屏截图验证。关系解除表单没有 novalidate，缺原因由浏览器原生 required 阻止提交；测试改为断言原生 validity 与持久化不变，不为测试添加自定义 aria-invalid。

继续移出树浏览器的完整功能片段：搜索/多状态交集、父层级保留、过滤器展开/关闭、单项/全部折叠、键盘查找和列表滚动。保留原 lexical 拼接位置、共享 refresh/save/Graph 依赖和跨模块导航，不把共享启动器或 Feed/Decision handler 一起迁移。比较 assembled production script 后跑树浏览器回归；新增快捷键聚焦、Escape 关闭/焦点返回验证。临时片段装配仍在剩余客户端清理清单中，不能把它描述成独立浏览器模块已经全部建成。

## 推进态势切片

现有 `src/web/goal-momentum.ts` 是 619 行纯展示派生代码；只消费调用方提供的 Goal/Relation/执行历史摘要，不拥有事实，也不执行 Goal。按模型类型、事件节奏统计、布局排布和展示视图装配拆入 Goals Plugin，保留提供者→消费者方向、part_of 分组、循环/缺失关系诊断、7/30 天历史不足处理、动作建议顺序和 300 Goal/900 关系性能要求。`startable` 和动作队列只是原呈现提示，不替代 Module 的权限或 Claim 判断。测试改走公开包出口；旧无 caller 源文件删除，不留下仅为测试存在的 re-export。

将根 renderer 的完整态势与惰性加载占位迁为同一个 UI contribution 的两个 surface；Workbench 只注入语言/转义/图标/状态 markup 并 mount。UI 消费最小公开 Goal 投影，禁止导入根 Web view 或 Store。对应图选中、筛选、时间窗口、连线/缩放/拖动、惰性请求/失败重试及原英文文案随迁；共享工作区模式、刷新和状态存储仍由宿主装配，不混入 Feed/Decision/TUI 的处理器。

先对源/旧 compiled 正常态势 HTML 与组装后的客户端做逐字比较，再运行既有拓扑/节奏/队列/性能测试、公共 contribution 测试及真实浏览器。浏览器从用户点击切换开始，检查失败重试、节点/队列选中、30 天窗口、未完成过滤、缩放、跳转 Goal 和刷新恢复，同时核对后端 Goal/Relation/Run 未改写。保持原视觉，不以本切片替代详情/Planning/route 的后续退出或最终全产品 E2E。

## 详情正文与当前概览切片

迁移正常/归档正文、回收站正文、详情 tab 与惰性占位、下一步按钮和当前概览。Plugin 用最小公开 Goal/关系/action projection 投影显示已返回事实，不决定是否允许领取或写入。正文模板与概览分别成文件，Workbench 只注册/mount；已完成状态下的归档、草稿编辑、用户决定、阻塞锚点和 Runtime 按钮保留原条件与选择器。

Draft 缺口提示和 Companion Runtime 卡片分别仍由 Draft/执行组合 owner 渲染，以明确的内部 trusted HTML 输入概览；Decision 数量由原 Decision owner 提供。不是任意外部 HTML 插槽，也不复制其计算。共享 actor 标签需供旧技术详情调用时使用单一公开函数。状态 markup、通用 heading/date/escape/locale 作为宿主原语，后续收口另行记录。编辑/Planning、上下文/进展/关系组合、记录与路由本切片仍未结束。

验证先在覆盖旧 dist 前比较中英正文/回收站输出，保留 archive/trash/selected 行为；新增公共 mount 测试覆盖全部主动作、只读集合、外部文本转义、标准进度和外部 owner 的插入位置，再通过真实浏览器 tab/惰性载入、编辑入口、返回树/刷新等路径，以及现有真实 HTTP 归档/回收恢复回归。测试不能自动接受用户决定或对真实项目写入。沿用已有视觉，不修改 CSS。

真实浏览器已复现草稿主按钮首次点击不能展开编辑器：setGoalPanel 启动异步载入后立即返回，handler 在模板到达前查找 disclosure，找不到后不再继续。允许最小修复：面板切换仍立即更新可见状态/hash/持久化，但返回加载完成的结果，编辑 handler 等待后只在原 Goal、原面板仍有效时展开并聚焦。保留请求取消、失败按钮和通用 tab 行为，不更改保存或执行权限。真实测试须先确认编辑面板尚未加载，不能靠测试提前加载来掩盖缺陷。

## 上下文与草稿编辑切片

Goals Plugin 接管上下文页面组合、完成标准的完整/摘要呈现、工作范围/输入绑定/需求覆盖、父子 Contract 覆盖/子项进度/前置事项，以及草稿表单与缺口提示。按上下文模板、覆盖呈现、草稿编辑模板划分文件；各自只用公开 Contract 的必要字段，不复制根 WebGoalView、Store 或权威判定。完成状态/标准进度使用既有唯一只读 helper，父级意义及状态文案暂由现有公共原语注入，后续文案退出单独收口。

Artifact 内容作为其 owner 已渲染的 trusted HTML 插入原卡片位置；引用链接、通用 section deck/heading 是显式宿主原语。Draft 缺口与编辑都是 Goals 产品 UI，不把 Draft Dialogue 或 Proposal 的写入和决定搬入 Plugin。完整记录的 acceptance/scope 调用通过 Workbench mount，清零旧对应模板；编辑后仍是 Draft，accepted 不可从表单原地修改，确认仍需原用户流程。

保留表单所有字段、criterion id、target/证据拆分、原因必填、四种拆分选项、Risk/Impact/Policy 链接、错误恢复及保存后刷新。先比较中英上下文/记录输出，再运行公共 mount（空缺/accepted/目标值/历史 coverage/父子与依赖方向/转义）和真实浏览器：首次主按钮打开、增删标准、阻断保存后保留输入、重试只保存一份、刷新恢复且 Draft 未被接受。关联客户端提交片段随迁时比较原组装脚本；共享 loader/通用表单辅助不整块吸收。

## Planning 页面切片

迁移方法库、方法详情/新建/编辑、项目工作规划与专属样式和客户端。按目录/组合、详情、编辑、文案与交互拆文件，不把压缩成单行的巨型模板视为已治理。Native Goals 只消费公开 PlanningMethodPack / PlanningMethodComposition、项目必要导航字段；组合规则仍由 Goals Module 生产，Plugin 只呈现返回的组合。通用设置页外框、导航、桌面 URL/上下文、控制 token 和公共脚本由显式宿主原语装配。页面 body 和 Planning 产品链接归 Plugin；Web 路由的权限与保存调用保持原实现，本轮不宣称整个 server route 已退出。

保持系统模板生成个人版本、项目版本独立、启停、重复采用、方法正文/结构化字段、筛选与增删行、失败保留输入、重试和回跳行为。迁移前后比较完整中英文页面（个人/项目、浏览器/桌面）与样式/客户端；公共 mount 测试覆盖渲染输入边界，现有真实 HTTP 覆盖保存/采用/权限，隔离浏览器补方法筛选、编辑失败恢复及重载。仅迁移归属，不重做视觉或修改用户服务；局部回归不替代开发完成后的全产品用户验收。

真实浏览器在完成个人模板复制后复现“加入组合”必然失败：旧 adoption client 只发送 method_id，但既有 /apply HTTP 入口要求 body.user_confirmed === true；原 HTTP 回归手工带该字段，所以没有捕获 UI 缺口。允许仅在用户明确点击现有“加入组合”按钮的请求内补 user_confirmed:true。保留后端确认门槛、不自动采用、不在加载页面时发送；补缺失确认被拒且不写状态的 HTTP 断言，并继续真实点击/失败/重试/项目独立版本验证。迁移的逐字比较证据在该修复之前，不能将修复后脚本也声称完全相同。

Planning 的页面路径识别同时迁为 Plugin 公开 route descriptor/matcher，由 Workbench 转出供 HTTP host 使用。保留个人/项目现有匹配差异、method id 只解码一次、新建/edit 模式与缺失方法 404；只在 GET 页面请求匹配，不接管写入口、控制 token、项目解析或错误映射。测试覆盖正常/编码/非匹配路径和真实 HTTP 页面回归。

## 状态呈现与剩余详情切片

先迁根 human-language 的 Goal 状态判读、状态/父级说明与 action-presentation 中按钮/摘要文案，再迁状态 badge/icon 的真实 UI contribution。只消费公开 Goal/Action Projection 与所需 Proposal/Run 摘要；优先显示替代/归档/回收、Draft 待决定、父级覆盖缺口等原行为不变。所有输出仅为呈现，不能决定是否可 Claim 或确认。翻译函数由宿主按请求注入，专属文案就近。Decision 问题/推荐说明留在原 owner，不把其 workflow 搬入本切片。无生产 caller 的旧 action-presentation 文件退出，既有测试改走公开出口，不留仅供测试的兼容层。

后续迁 Goal 关联与约束的组合时，只组合已经属于 Goals 的关系/风险/影响/Policy 组件；依赖提案历史继续由 Decision owner 提供明确 trusted HTML。进展/完整记录里跨 Execution/Governance 的块需保持独立 owner，不因共用一个页面而混入 Goal 事实模块。检查前后完整 HTML/状态输出，再跑公开状态分支测试、i18n、现有 Web/目录/正文/Context 回归。状态/文本没有变化时不进行新视觉设计，最终全产品用户验收仍单独执行。

## 新建与回收对话框切片

将既有新建草稿与可恢复回收/恢复对话框迁入 Goals 的真实 dialog contribution；新建只消费现有目录项的 id/title/priority/status，并沿用同一排序函数。保留全部字段、required/长度/优先级限制、父级与依赖选择、原始关系预览、按钮和错误选择器。不将创建或回收变成自动操作，不移动 Module 生命周期或弱化有效 Claim/Run 的回收阻止规则。先迁模板及专属文案，Workbench 只 mount；交互的独立迁移与剩余 route 在后续收口，不能只迁空壳就宣布完毕。完整页面先比较旧 compiled 输出，公共 mount 检查字段、顺序、转义和空态，并复用真实创建/回收/恢复 HTTP 回归。

对应完整交互片段继续同轮迁出：打开/关闭/键盘取消、新建提交与失败恢复、回收/恢复确认请求及被运行中工作阻止后的提示。沿用 Workbench 原 lexical 装配位置，公共控制 headers、refresh、语言和导航仍由宿主提供，创建关系预览继续复用已迁 relation-client；不修改现有文案翻译方式或偷偷修复其他问题。组装客户端逐字比较后，浏览器验证真实新建失败重试、回收取消、缺原因、回收和原 ID 恢复，后端确认只有一次创建且历史保留。

## 页面/文档路由与加载切片

Goals Plugin 接管 current/archive/trash 页面、refresh/momentum/document/panel/records/record-events/quick-record 的路径描述与参数解析；Workbench 只组合渲染 callbacks，HTTP host 保留项目解析、权限、数据读取、响应头和跨 owner Artifact/Execution 内容供给。保留 ID 只解码一次、坏编码 404、非法集合/offset 400、缺 Goal 404、回收站不可编辑/读面板、普通 Goal URL 展示已归档/回收事实、事件安全整数检查及 no-store/nosniff。只在 GET 上解析，不借机改写写入口或错误语言。

对应浏览器文档/面板 loader 与 Goal tab/factor/hash/选中导航在后续同范围迁移，原 AbortController、请求身份检查、旧响应不得覆盖新 Goal、失败重试、原草稿首次打开等待必须保留。共享 Feed/Decision/TUI 状态和统一 refresh 不整块塞入 Goals。先以定向 HTTP 请求对原生产入口记录行为，再切包并跑同一用例；公共 route/装配测试不只检查字段存在，要验证边界分支与正确 owner 调用。真实浏览器复验切换/回跳/刷新、失败重试与不改写数据。此局部回归不替代整体开发后的最终 E2E。

## Goal 导航与事件归属切片

迁出 Goal 选中流程、浏览器回退/前进、Goal 专属 tab/factor 键盘与点击、面板重试/记录翻页、编辑入口、设为当前与归档按钮处理。仍使用公开宿主 applySelection/workspace/nav/save/refresh 回调；TUI 通知、跨 Feed/Decision surface 切换、通用 focus-deck 和共享状态存储由 Workbench 组合，不混入 Plugin。保留所有原路由差异、用户点击才写入、归档确认、八个打开 Goal 上限、关闭最后一个 Goal 的限制、焦点/ARIA、HTTP 参数与请求失败处理。

Goal 顶部标签与其他 surface 的 utility 标签共用一行，不能整体搬走通用 tabs；只将 Goal 专属呈现与开关行为归入 Native Goals，并在原装配位置保留宿主 utility tab 与 pane 标签关联。完成前比较组装客户端，真实浏览器检查 Goal/tab/键盘、history back/forward、失败恢复、选择不启动 Run、不写无关数据。剩余跨 owner 页面正文组合继续单独安置，不以本切片关闭整个 GW5。

真实浏览器复现旧顶部标签点击丢失键盘焦点：setDesktopWorkSurface → renderWorkTabs → replaceChildren 删除刚点击的 button，selectGoal 同 Goal 提前返回，document.activeElement 变为 body，随后的 Home/End 无法触发 Goal tab handler。迁包后脚本逐字一致时同样失败。允许最小修复：点击 handler 等待原 selectGoal 完成后，用已有 focusWorkTab 聚焦实际选中的 Goal（加载失败时是回退 Goal）；不改通用 surface renderer、HTTP、标签数量或执行状态。测试必须真实点击后发送键盘事件，不以手动 focus 绕过问题；逐字一致证据仅适用于修复前。

首屏 Goal 标签与空归档/回收正文也由已有 document contribution 提供：只迁 Goal 内容，不迁通用 tablist、utility 标签和窗口拖动区。保留 refresh 简短空态与完整页面说明/返回链接的差异；四条空态文案就近。首屏关闭标签的用户标题按属性边界转义（与客户端 setAttribute 一致）。完整页面中英文、current/archive/trash/空集合与 refresh 与迁移前比较，另测用户标题转义。

## 进展与完整记录的 Goals 内容

Context contribution 接管完整记录中的 Goal 基础资料（id、时间、原记录负责人、优先级、状态解释、验收与范围）和只读关联/风险/规则分组；只消费最小公开 Goal/read-model 字段及已有 Goals owner 的 trusted HTML。Safety/Policy contribution 分别接管进展中的开放风险摘要和检查规则说明，保留 open/triggered 筛选、原风险链接与效果说明、已解析 policy 的自检/独立检查/人工确认组合。不重新计算权限或完成条件，不新增存储事实。

保持记录 outer deck、执行/检查/历史、Companion Runtime、当前 Run 阻塞与旧 Run 历史区分由原执行验收组合持有；这些不在 GW5 授权范围内，不能把整个 renderProgressOverview/renderGoalTechnicalDetails 一起塞进 Goals。EX4 当前 canonical 已完成，本次只记录其剩余组合检查面，不冒充已重开或完成了该部分。共享启动/refresh 与整体 cutover 继续单列未完成。

验证：迁移前后中英正常/归档记录及 progress HTML 比较；公共 mount 校验 metadata 转义与负责人 fallback、不变输入、开放/已解决风险区分、规则全部开关和只读关系内容；真实浏览器打开进展与记录、切换卡片/键盘、跳到风险、重载，后端 facts/Claim/Run/Evidence 保持不变。复用现有 HTTP/Goal 回归，不触碰现用服务。

接着收口浏览器初始/刷新数据的 Goal 部分：Native Goals 根据最小 id/title/状态/分解状态/动作摘要投影构建导航项与直接子项，子项由宿主传入既有公开 part_of 查询结果，图标调用已有状态 contribution。保持 current/archive/trash 的原顺序、替代/归档/回收状态优先级、waiting 与 compound 的独立标记。宿主仍拥有 Project/Board/cursor 和 JSON script 嵌入安全，不把整个 Board snapshot、Claim/Run/Evidence 或用户原始内容暴露给导航。不改变公共页面数据字段、TUI goal-changed 事件或 refresh 行为。用完整 HTML/refresh 前后比较和生产公共入口测试证明。

## 正文加载器的显式 Host 绑定

将 `document-client.ts` 从直接捕获 Workbench 全局变量的片段改成接收有限 Host 对象的浏览器 factory；Workbench 在原启动位置实例化，继续提供原 `loadGoalDocument` 局部调用名，只有内部 caller 的 `replaceGoalDocument` 不对外暴露。Goal 文档请求及 AbortController 状态只归 factory 实例；Host 仅提供 pane、route、collection、翻译、错误反馈和替换前后组合回调。替换前取消面板/Quick Record 请求，替换后更新原关系/风险预览和面板/hash，调用顺序保持不变。跨 owner Quick Record/Decision 初始化仍由 Workbench callback 调用，不转交其权限或业务逻辑。

不引入另一套 bundler、全局注册表、通用消息总线或默认兼容层；原浏览器全局 DOM/fetch API 继续使用。保留 no-store、失败返回 false、取消/迟到响应返回 null、请求身份 guard 和 busy 清理；共享 refresh 不趁机重写。删除无 caller 的旧 script export 和 bootstrap 请求变量。用相同的真实文档/导航/草稿/风险/关系浏览器路径复验，尤其完整旧响应延迟到新选择之后不能覆盖页面；工厂入口另验两个独立实例不互相取消请求、失败与重试，不测试只存在的字段。

## 面板与记录客户端 Host 绑定

同轮收口普通 Risk facts、Impact 和 Policy 表单：各自提供有限提交/选择器 handler，payload 读取归各自 owner，不继续把 Impact payload 挂在 Safety 的全局片段上。保留浏览器 min/max/必填提示、请求字段、错误回执、失败重试、原调度位置；后台权威验证不改。Risk 处理决定和对应预览仍留在原 Decision owner。只删除无 caller 的 lexical 出口，不搬通用表单验证或整个共享事件分发器。

实际绑定回归发现 `currentLocale` 是服务端函数，浏览器没有这个全局；新 factory 直接捕获它使启动失败。Host 改为通过现有 document.documentElement.lang 提供 locale，保留 en/中文的原连接符意图。补真实父级/依赖选择、预览和创建后关系保存检查，不添加浏览器全局兼容函数或改后端规则。

生命周期、对话框与关系的后续绑定：生命周期 factory 只负责显式设为当前/归档请求及回执跳转，不拥有权限判定；dialog factory 接管新建/回收/恢复、trashIntent、新建草稿快照/焦点恢复及刷新时更新候选 Goal，Host 只给 DOM、请求 headers、原存储清理和导航回调。关系 factory 接管创建预览、方向编辑、创建/解除与失败恢复，通用验证和回执由 Host 注入。保留用户提交才写入、原因校验、同一 Goal 恢复、blocked 回执、未命中异步事件同步返回 null 和原事件顺序。风险处理决定/Human Review 属于其他 owner，不混入普通 Risk facts factory。先跑新建/回收、导航/归档和关系真实浏览器，再验证共享 refresh、跨表单和 Web 回归；保持新建弹窗刷新中的输入及光标，不仅移动 submit 片段。

树与态势的后续绑定：Tree 实例持有状态筛选和输入法 composing 标志，提供筛选、折叠、键盘、监听器绑定及有限状态读取；树选中高亮、祖先展开与折叠状态保存/恢复也归 Tree，Host 仅组合 TUI 通知与页面选中。共享 search busy/deferred refresh 同时服务 Feed，仍归 Host。Momentum 实例持有选中、周期、未完成过滤、缩放、自适应与请求；viewport 实例拥有 ResizeObserver、几何绘制与拖动。Host 通过原 UI-state 字段读写有限状态，保留字段名和恢复顺序，不复制这些内部变量。窗口/侧栏变化只调用图布局接口，原 shell/list/graph 切换仍由 Workbench 组合。不得借迁移改动过滤、坐标、缩放范围或刷新策略。用原真实 Tree/Momentum 浏览器和共享 Web 回归验证，保留所有旧异常/重试和数据约束。

后续导航、顶部 Goal 标签和草稿编辑沿用有限 Host factory 收口。导航读取宿主当前选择与 active Goal，不复制共享状态；返回选择、点击和 history handlers，由 Workbench 保持原监听顺序。草稿的验收行处理、target 解析、保存和首次展开归同一实例，宿主仅供 route/control headers、分行、刷新、提示和面板切换。未匹配的异步事件返回 null，不能使其他表单提交或默认点击等待一个无关 Promise。Goal 标签拥有自己的打开项列表，Workbench 保留 utility tabs、pane 关联与跨 surface 切换；保持原存储 key、筛选和上限规则。复用真实导航、草稿、文档和键盘回归，不新增产品策略。

沿用正文 factory 的简单浏览器装配方式，将 `panels-client.ts` 的 hash 识别、面板/因素切换、惰性请求、点击/键盘归为一个实例；将 `records-client.ts` 的完整记录、事件翻页和点击归为另一个实例。两者分别持有自己的请求状态，原 panel/factor keys 归面板 owner。Workbench 只注入明确的 DOM pane、route/collection、翻译/错误、共享保存、focus/reveal、其他 owner 的预览初始化及记录接口；在原事件顺序调用实例 handler，处理后才终止共享事件分发。

保留所有 tab/hash/ARIA/focus、首次编辑 await、失败重试、no-store 和记录分页字段，不修改 Execution/Decision 的内容与权限。前置 helper 内部化后删除零 caller 的片段出口与 bootstrap 状态；不建立通用 handler 注册器。测试继续通过实际界面点击/键盘和真实 HTTP；新增覆盖面板请求交错/取消后返回与记录翻页取消/重试。若交错测试复现现有加载状态或迟到写入缺陷，先记录失败路径，再作可解释的本地修复；不以迁包为理由放宽已发生的行为错误。

新增真实面板交错测试已失败：V1 completion 的真实完整响应延迟期间打开 progress，原 finally 仅在全局 controller 仍相同时清理，导致旧 completion 的 loading/aria-busy 永久保留，重开被 loading guard 阻止。允许在面板实例记录当前请求所属 panel，取消时立即清理其 loading/busy；finally 按 controller 身份清理，不清除后续新请求。保持旧回复不得写入和所有 HTTP/页面结构不变。

实际记录分页测试通过隔离 HTTP Draft 写入生成超过首屏 40 条的真实历史。首次点击发生在展开动画未完成时，改为等待真实动画结束后继续；随后明确复现取消后的翻页按钮仍 disabled。记录实例采用同一 controller 所属的 UI 清理回调，取消立即释放当前记录忙态或翻页按钮，finally 不能清理后续请求。成功与失败写 DOM 前检查请求身份，防止已读取完的旧响应在取消后仍追加事件。保留实际事件顺序、offset、失败提示和重试，不改后端内容或绕过测试点击。
