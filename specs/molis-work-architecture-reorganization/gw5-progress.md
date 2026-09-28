# GW5 执行进度与验证

2026-09-05。accepted revision 1，执行中，**未完成整个 GW5**。生命周期以 Molis Work 为准。

## 已迁移的实际职责

- Goals Native Plugin 提供真实 Policy contribution（项目默认表单、Goal 额外规则、最终规则、只读态），以及 Safety contribution（Risk/Impact 表单、关联 Goal、风险解决依据、停用历史、组合及快捷记录表单）。Workbench 仅注册、mount 并注入语言/转义/图标/日期/引用等宿主能力。
- 旧 renderer 不再实现上述模板。风险状态说明和树排序由 Plugin 公共呈现函数提供；原 Decision/tree callers 暂时消费，不复制业务规则。GoalPresentationState 保持原联合类型，旧 human-language 只转出类型。
- Risk 新增/编辑、Impact 新增/编辑/停用、Policy 保存和 Risk picker 的客户端片段已归 Plugin；Workbench 在原位置拼接。Policy 原本跨两个任意脚本段、从函数中间切开的处理器已合成一个完整片段。共享启动器、表单基础验证和跨 owner 决定处理仍待后续清理，不能宣称整个浏览器客户端已经完成模块化。
- 对应英文目录移到 `policy-en.ts` / `safety-en.ts`，聚合层只展开。原翻译和最后写入优先级保留；共享基础词未擅自改变。
- 没有改 Policy/Risk/Impact HTTP 路由、持久化或生命周期。Risk/Impact 使用公开事实 Contract；Policy 用传入的 resolved_policy，不在 Plugin 重算权威门槛。风险决定链接只消费已返回的 user/risk action。
- 关系 contribution 已迁入 Plugin：九种关系、上下游/其他关系、建立/解除/历史、快捷表单与对应预览/提交客户端；60 条既有英文文案就近。依赖提案历史仍由 Decision renderer 生产 trusted HTML，再在原位置注入，未吸收其他 owner。
- 目标树/list 和搜索/筛选/归档/回收站工具栏通过 `workbench.directory` contribution 提供。树层级、依赖提示、子项进度和编号消歧离开根 renderer；共享 helper 只读已返回的事实，不重算权限。17 条英文文案就近且保留最后写入优先级。状态 markup 仍注入，推进态势/详情及共享浏览器启动器未假称完成。

## 实际发现并修复的问题

原 Risk picker 的 aria-label 直接插入含用户描述的翻译结果，描述内双引号会突破 HTML 属性。新增转义测试先失败；对完整翻译结果做属性转义后通过。描述存储值未改写，真实浏览器重载后 title/aria-label 均与原文本一致。

关系“取消解除”原本错误定位到表单自身，无法收起；真实浏览器先失败，改为找 `.relation-record` 后，取消、重开、解除、历史重载全链通过。解除表单的必填项由原生 required 校验，测试已纠正为检查 `validity.valueMissing` 和记录仍 active，不为测试改变产品校验行为。

桌面样式原本用 `display:none` 隐藏唯一 Goal 搜索框，真实点击失败；按原设计恢复该框在 Goals 工具栏的单行位置，按钮保留下一行。只改 Design System 的两条局部布局规则，查询算法和原窄屏样式不变。借助 impeccable 窄范围流程检查既有设计和桌面/窄屏截图，没有重做视觉。

## 验证记录

- Policy 首切片：3 项公共 mount 测试通过；真实 HTTP 项目/Goal Policy 保存及 Human Review 回归通过；中文/英文 26 份含 Policy 页面与迁移前 compiled renderer 逐字相同。
- Safety 首切片：中文/英文 72 份 factors、quick-record、history 页面与迁移前 compiled renderer 逐字相同（正常 demo 内容）。恶意文本属性转义是上文声明的修复，不宣称该输入字节不变。
- 客户端：迁移前 compiled Workbench 与迁移后源 Workbench 拼出的生产脚本 **234,437 字符逐字相同**，并通过 JavaScript parse。比较发生在覆盖 compiled baseline 前，不能用覆盖后的 dist 自证同样结论。
- `node --import tsx --test tests/web.test.ts tests/goals-policy-ui.test.ts tests/goals-safety-ui.test.ts`：**66 通过，0 失败，0 跳过**。覆盖真实 HTTP Risk facts/关联/状态效果、Impact 写入和停用历史、Policy、归档/回收、权限/错误、Chrome tree/desktop tab/Decision deep link。它不是整个产品端到端验收。
- `node --import tsx --test tests/goals-safety.e2e.test.ts`：**1 通过，0 跳过**。真实 Chrome 点击风险表单；缺必填项不写库；阻断真实请求后恢复提交按钮和原输入；解除阻断重试只写入一次；逐项核对存储事实；重载页面后核对标题、属性值及关联 Goal。数据库、Chrome profile、端口均隔离，未碰当前 4173 服务。首版测试误把 reload 回执当作新页面加载完成，已改为等 Chrome load 事件；没有修改产品来绕过测试。
- Plugin/Workbench/root TypeScript 构建通过；边界检查 48 packages / 371 sources / 1,039 imports / 71 dependency edges，0 errors；diff whitespace 检查通过。快捷表单收口后最终运行 `node --import tsx --test tests/web.test.ts tests/goals-policy-ui.test.ts tests/goals-safety-ui.test.ts tests/goals-safety.e2e.test.ts`：**67 通过、0 失败、0 跳过**，17.6 秒，含真实浏览器。最后 source renderer 5,511 行，Policy UI 190 行、Safety UI 284 行；未将旧 Huge Class 整块换名搬入 Plugin。
- 快捷表单的第二次 compiled baseline 比较未形成有效证据：旧 dist root 引用了已删掉的临时表单 helper 出口，无法与新 Workbench 配套运行。没有为了让比较通过恢复无 caller 的兼容 API；首次 72 份比较仍是原切片证据，最终状态另用生产 root/Web/浏览器回归验证。

## 关系与目标树追加验证（2026-09-05）

- 关系正常内容：迁移前 compiled root 与源 renderer 的 72 份中英文 factors/quick/history 输出逐字相同；客户端在取消修复前仍为 234,437 字符逐字一致。此证据来自前次真实执行，不是对已覆盖 dist 的重复比较；取消定位的修复差异明确保留。
- 上次合跑句柄 92266 已不存在，最终输出未恢复，不将其记为通过。本次有新目标树代码及相关回归需要，重新运行当前受影响集合。
- 树/list：覆盖旧 compiled baseline 前对普通/归档/回收站、全页面与刷新片段做 144 份中英文逐字比较，通过。这证明模板迁移一致；CSS 搜索可见性是随后明确修复，不宣称此前后像素一致。
- 新增 3 项 tree 公共 mount 测试、3 项关系公共 mount 测试通过；真实树浏览器验证折叠/展开、键盘输入无结果、清除搜索、按已完成筛选（保留父层级）、清除筛选、点击 CORE 详情和刷新后选中恢复。逐项核对 Goal/Relation/Run 快照完全未变。390px 搜索可聚焦且无横向溢出。
- 真实关系浏览器验证 incoming/extends 方向与预览、空原因不写、新建只增加一条关系、取消不写、解除原因必填、inactive/原方向/原建立原因保留、重载展示解除历史，未启动 Run。
- 最终命令：`node --import tsx --test tests/web.test.ts tests/goals-policy-ui.test.ts tests/goals-safety-ui.test.ts tests/goals-relation-ui.test.ts tests/goals-tree-ui.test.ts tests/goals-safety.e2e.test.ts tests/goals-relation.e2e.test.ts tests/goals-tree.e2e.test.ts`：**75 通过，0 失败，0 跳过，18.4 秒**（session 28765 exit 0）。首轮受 sandbox 限制无法 listen/启动 Chrome，不计为产品失败；获准隔离运行后暴露的两个问题已按上文修复并重新验证。未跳过失败测试或放宽产品规则。
- Plugin、Design System、Workbench、root TypeScript 构建通过。边界检查：48 packages / 382 sources / 1,074 imports / 71 dependency edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。当前 root renderer 5,052 行；tree UI 207、tree presentation 159、relation UI 152、relation client 166 行。行数只是迁移范围说明，不是验收替代品。
- 桌面 1440×1100、窄屏 390×844 截图已实际查看：搜索、原工具栏、树和详情无相互遮挡，窄屏列表不溢出。截图位于本机临时目录 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-gw5-tree-Adeex0/desktop.png` 与 `mobile.png`；它们不是公开发布物。临时数据库、服务和浏览器已清理，当前 4173 及用户数据未动。

## 目标树客户端收口

- `tree-client.ts`（169 行）接管搜索输入/输入法事件、状态交集筛选、保留父层级、过滤器展开/关闭、节点/全部折叠、查找/Escape 与列表键盘滚动。四个旧 Workbench 脚本只导入并在原位置插入片段；共享刷新、UI-state 持久化、跨模块导航和 Graph 仍为显式宿主依赖。没有宣称共享浏览器启动器已完成拆分。
- 迁移前 compiled Workbench 与迁移后源 Workbench 组装生产脚本 **234,435 字符逐字一致，parse 通过**。长度比关系取消修复前少 2 字符，来自已声明的 `.relation-record` 定位修复，不是此次客户端移动改变行为。比较完成后才重建 Workbench。
- 树英文目录追加 3 条客户端文案，共 20 条原翻译；没有改译文。
- 客户端迁移后 `node --import tsx --test tests/goals-tree-ui.test.ts tests/goals-tree.e2e.test.ts`：**4 通过，0 失败，0 跳过，5.0 秒**（81667 exit 0）。除前述真实树路径，还通过真实 Cmd+F 聚焦、Escape 关闭筛选并返回按钮焦点。先前 75 项合跑是模板/关系修复后的证据；本次纯客户端归属移动追加脚本逐字对比与受影响树回归，不伪称又跑了一遍全套。
- Plugin/Workbench/root 构建及 build manifest 更新通过；最终边界统计 48 packages / 383 sources / 1,077 imports / 71 dependency edges，0 errors；diff check 通过。无仍在运行的测试句柄。

## 推进态势迁移与验证

- 旧 `src/web/goal-momentum.ts` 的 619 行展示派生实现已退出，调用方与既有测试改走 Plugin 公共出口。按类型（132 行）、历史节奏（127）、布局（112）、拓扑/行动视图（254）拆分，没有整块换名搬进另一个 Huge Class。仅使用公开只读事实，动作建议和 startable 不构成执行许可。
- `momentum-ui.ts`（218 行）提供完整图和惰性占位两个真实 contribution surface；Workbench 的 9 行 adapter 只 mount。对应 viewport（82 行）与 state/load/event（200 行）客户端、52 条原英文文案归 Plugin。共享工作区模式、刷新和持久化继续由宿主提供。
- 迁移时组装后的生产客户端与覆盖前的 compiled Workbench **234,435 字符逐字相同且 parse 通过**。旧 HTML 比较因旧 root dist 依赖已删除的 `treeDependencySearchText` 宿主出口而未能运行，**不计为通过**；没有为比较恢复无生产 caller 的兼容出口。后续源码/当前运行回归补证，但不伪称旧 HTML 已对比。
- 旧测试句柄 74066 已不存在，丢失的最终结果不记成功。新运行首先 12/13：浏览器网络拦截未启用导致请求实际成功，测试错误地等待不存在的重试按钮。补 `Network.enable` 后真实浏览器通过，未改产品。随后受影响集合 **76/76、0 跳过，15.8 秒**（18480 exit 0）：Web、9 项既有 momentum 拓扑/节奏/队列/性能、3 项 mount、momentum 浏览器和树 mount/浏览器。
- 真实 Chrome 验证加载失败/恢复重试、完整节点和 provider→consumer 连线、节点/队列选中、7/30 天、完成过滤、缩放/fit、刷新恢复、跳转同一个 Goal；Goal/Relation/Run 快照全部未变。300 Goal/900 关系性能保持在原 100ms 要求以内。

## 详情正文与当前概览迁移

- `document-ui.ts`（130 行）拥有正常/归档正文、回收站正文、操作入口、详情 tab 和惰性占位；`document-overview-ui.ts`（102 行）拥有下一步按钮和当前概览。最小公开模型单独维护，Workbench 只 mount。30 条既有专属英文文案就近；没有变更译文和用户内容。
- 原 Draft 缺口提示与 Companion Runtime 仍由各自 owner 生成，根装配层提供明确 trusted HTML；Decision 数量仍由 Decision owner 提供。Plugin 不读取 Store、不重新判定权限，action projection 的主动作仍是唯一按钮依据。上下文/进展/关系组合、编辑、Planning、records 和 route/client 后续退出仍未完成。
- 在重建 root dist **之前**，旧 compiled root 与新源 renderer 对 demo 12 个 Goal 的正常/归档/回收三种正文做中英文 **72 份逐字比较，通过**。这属于正文模板迁移证据，不包含之后声明的客户端时序修复，也不是归档写入证明；实际归档/回收写入另由 Web 回归验证。
- 3 项公共 mount 测试通过：下一步全部原分支、归档/回收操作、选中/惰性面板、6 条标准只预览 5 条、完成状态不虚构 Evidence、owner 输入位置、外部文本转义和语言隔离。
- 浏览器测试纠正一次误写的树 selector 后，确实复现旧产品缺陷：第一次点草稿主按钮，setGoalPanel 未等待异步模板，编辑器不展开、不聚焦（59821 exit 1）。修复为面板即时切换但返回加载结果，handler 等待后只处理原 Goal/仍活跃面板。没有改变保存或后端规则；没有靠预加载修改测试绕过问题。
- 修复后浏览器首次路径通过（3054 exit 0）；追加真实 390px 输入点击、焦点/无溢出与截图后通过（22554 exit 0）。1440×1100、390×844 截图已查看，原编辑区可见且无新增遮挡；位置：`/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-gw5-document-zV6LoE/desktop.png` 与 `mobile.png`。impeccable 仅指导此次已复现的时序/焦点修复，不重做视觉。

## 本轮最终回归

`node --import tsx --test tests/web.test.ts tests/goal-momentum.test.ts tests/goals-policy-ui.test.ts tests/goals-safety-ui.test.ts tests/goals-relation-ui.test.ts tests/goals-tree-ui.test.ts tests/goals-momentum-ui.test.ts tests/goals-document-ui.test.ts tests/goals-safety.e2e.test.ts tests/goals-relation.e2e.test.ts tests/goals-tree.e2e.test.ts tests/goals-momentum.e2e.test.ts tests/goals-document.e2e.test.ts`

**92 通过、0 失败、0 跳过，20.3 秒**（78777 exit 0）。覆盖本轮迁移后的真实 HTTP、Policy/Risk/Impact/关系、目录/图/详情用户路径。所有浏览器和数据库均使用隔离 fixture；当前 4173、用户项目与安装均未改变。Plugin/Workbench/root 构建和 manifest 更新通过；边界 48 packages / 398 sources / 1,114 imports / 71 dependency edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors；diff check 通过。根 renderer 当前 4,689 行，仍未 retired。当前测试句柄全部终止。

这些是 GW5 已迁切片的局部证据，不代表最终全产品用户 E2E、清理后复验或原始架构逐条验收已完成。

## 上下文与草稿编辑追加迁移

- `context-ui.ts`（61 行）提供上下文组合与独立 acceptance/summary/scope/draft-editor/draft-gaps surface；`context-records-ui.ts`（93 行）拥有完成标准、范围、输入绑定与需求覆盖；`context-coverage-ui.ts`（89 行）拥有父子覆盖/子项进度/前置事项；`draft-ui.ts`（111 行）拥有草稿编辑和缺口提示。根 renderer 的对应模板已退出，完整记录与 Human Review 的标准摘要通过 Workbench mount 复用，没有把它们的流程整体吸收。
- 页面输入在 `context-ui-model.ts` 使用公开 Goal/InputBinding 的必要字段及只读覆盖投影。Artifact 已渲染内容、引用、安全转义、通用 section deck/heading、状态/父级解释为显式输入。父级解释原函数的形参缩窄到实际四个字段，行为未变；其文案和通用 UI 原语后续仍需收口。不读 Store，不重新计算执行资格。
- `draft-client.ts`（111 行）接管增删/编号、target 解析、保存 payload、失败恢复和成功刷新；Workbench 保留原 lexical 插入位置和共享 `splitLines`、headers、refresh。86 条原专属英文文案归 `context-en.ts`；重复 key 保持原最后值。模板与客户端都保留原规则，未修复或放宽产品行为。
- 覆盖 root compiled baseline 前，12 个 demo Goal × 中/英 × 当前/归档 × 上下文/完整记录/正文，**144 份逐字对比通过**。包括 Artifact owner 的原位置插入、Draft/accepted、记录 caller 的当前输出。类型构建后再重建 root；未拿新 dist 和自己比较。
- 草稿客户端在覆盖 Workbench compiled baseline 前 **234,626 字符逐字一致，JS parse 通过**。这个长度包含前轮已声明的编辑器等待加载修复；本轮只迁归属，没有改该修复或其他交互。
- 4 项公共 mount 测试通过：完整字段/四种拆分选择/必填原因、accepted 无编辑表单、scalar/object target、原文转义/语言隔离、部分/历史父子覆盖、子→父方向、缺失前置、范围空缺与资料引用。
- 真实浏览器完成增删标准（最后一行清空但保留）、主按钮首次打开、填写所有字段和两种 target、阻断真实保存、保留原输入、恢复后重试、重载后核对表单。真实存储逐项验证列表去重、字段和 criteria 保留、只增加一次 `goal.draft_updated`，仍为 Draft/unmet、accepted_at=null；其他 Goal、Relation、Run 不变。
- 首轮浏览器测试在成功保存后误读 `snapshot.events`（该快照不提供完整事件账本），并非产品保存失败。测试改走生产 `buildMolisWorkWebView` Query 读取该 Goal 的更新事件，未加 SQL 或修改产品来满足断言。最终运行：`node --import tsx --test tests/goals-context-ui.test.ts tests/goals-draft.e2e.test.ts tests/web.test.ts tests/goals-document-ui.test.ts tests/goals-document.e2e.test.ts`，**68 通过、0 失败、0 跳过，17.5 秒**（90557 exit 0）。
- Plugin/Workbench/root TypeScript 构建、build manifest、boundary、diff check 通过。边界统计 48 packages / 406 sources / 1,135 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。根 renderer 4,416 行；仍未整体 retired。所有本轮测试句柄已终止，当前用户服务和数据未动。

## Planning 追加迁移与验证

- 方法库、详情、新建/编辑和项目工作规划已通过 `io.molis.work.native.goals.planning.v1` 的 library/method/project 真实 surface 提供。presentation/detail/edit/library/project 分文件，专属样式、客户端、66 条原英文文案与 page matcher 就近。最小模型消费公开 Planning Method/Composition 和两个 Project 导航字段，不依赖根 Web view/Store；组合规则仍由 Goals Module 计算。Workbench 的 adapter 只 mount，根通用设置页 frame/nav/control 为显式输入。
- 根 Planning 模板和专属样式/脚本已移出；根入口保留原签名但仅装配公开 contribution。GET 页面的路径匹配/单次 id 解码/模式描述已归 Plugin，HTTP host 保留项目解析、权限、查找/404 和所有保存调用。尚未宣称整个 server route composition 已退出。
- 覆盖 root dist 前，中英文 × 浏览器/桌面 × 无项目/带项目 × library / 个人与项目的 detail/edit/new（含 built-in、personal、active/disabled project、空方法）/ 项目组合共 **272 份完整页面逐字相同**，设置页样式也一致。新建临时 id 比较时固定 Date.now，不改生产生成逻辑。模板所有布局和文案均保留。
- 随后格式整理仍保持真实客户端 **5,090 字符**及 Planning 样式 **16,269 字符**逐字相同，JS parse 通过。这份比较在下述按钮请求修复之前；修复后仅多明确的 user_confirmed 字段，不能称为完全相同。
- 首轮浏览器 62/63：跨页面跳转时旧 document 的 DOM Promise 被销毁，测试缺少真实导航等待。共享 fixture 新增导航事件等待，旧 reload 复用它；新增 catalogMode 仅在自己的临时 Home 创建 demo 项目，旧单数据库测试保持原路径。第二次导航超时，通过错误状态定位出实际后端拒绝，不循环调大超时。
- 真实旧产品缺陷：adoption client 没发送 user_confirmed，但 /apply 与 Goals Module 明确要求用户确认；原 HTTP 测试手工带字段而漏掉 UI 问题。修复前浏览器 80566 exit 1，后端提示“必须由用户确认”；修复限于现有按钮点击发送 true，没有放宽权限、自动采用或改写保存规则。修复后 19286 exit 0。impeccable harden 用于这个已复现的交互错误，未重做视觉。
- 浏览器实测方法分类/我的方法空态、详情到个人副本、增删步骤和焦点、完整字段/正文保存、网络失败保留输入且无写入、重试个人版本 v1、重载；缺确认请求 400 且项目不变；明确点击采用网络失败/重试只有一份项目 v1、停用后项目 v2 不参与组合、个人 v1 完全不变、刷新可见未启用方法。其他方法、Goal/Relation/Run 都与原值一致。未触及用户 4173/安装/项目。
- 4 项公共路由/mount 测试验证一次解码、无关路径、个人/项目链接、模板只读/副本表单、外部文本转义、正文/完整字段/空行/停用、语言与组合展示只信 Module 输入。现有 Web HTTP 回归继续覆盖模板库/方法保存/采用/项目上下文/控制权限。
- 最终命令：`node --import tsx --test tests/goals-planning-ui.test.ts tests/goals-planning.e2e.test.ts tests/web.test.ts tests/goals-draft.e2e.test.ts tests/goals-document.e2e.test.ts`，**66 通过、0 失败、0 跳过，18.0 秒**（75309 exit 0）。之前截图轮 65 项也全通过；路径 `/var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/molis-work-gw5-planning-OWJ9J5/desktop.png`（1440×1100）和 `mobile.png`（390×844）已查看，原桌面目录/窄屏导航与布局保留，没有为本修复扩展视觉工作。
- Plugin/Workbench/root TypeScript 构建、build manifest、boundary、diff check 通过。最终 48 packages / 419 sources / 1,166 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。根 renderer 当前 **4,299 行**，仍未 retired。测试句柄全部 terminal。

## 状态、动作与关联组合迁移（2026-09-05）

- `goal-state-presentation.ts` 只读消费 Goal/Proposal/Run 摘要；`goal-state-copy.ts`、`goal-state-explanation.ts` 和 `action-presentation.ts` 持有原状态/父级/动作说明，不复制 Claim 或完成决策。`status-ui.ts` 提供真实 badge/icon contribution，保留归档/回收/替代优先于 action display 的规则；`factors-ui.ts` 拥有关联/风险/影响/规则 tab 与展示计数，四块内容仍由原 owner 明确输入。Workbench 两个 adapter 只 mount。
- 已移除无 caller 的 root `action-presentation.ts`；root `human-language.ts` 从 356 行减为 46 行，仅剩 Decision 解释。96 条专属 EN 文案进入 `status-en.ts`。根 renderer 在此切片后为 4,206 行，不能据此宣称整个 Huge Class retired。
- 续接前已做 240 份详情、46 份状态说明、24 份动作摘要，以及 48 份关联面板的迁移前后逐字比较。续接时最后一次旧测试输出未取回，读取进程确认已终止；没有将丢失结果算通过。重跑 Plugin/Workbench 与 i18n/Context/Tree 14 项通过（56881 exit 0）。
- 新增 6 项公共入口回归：相关 unresolved Proposal 与 Draft 状态、部分采用/conflict/关联 Run、忽略已决定/legacy/无关提案；开放父级的正确 part_of 方向/缺失与未完成子项；覆盖缺口优先于完成展示；返工 reason 优先级与原 server summary；归档/回收/替代图标及转义；Factors 生效数量与 ARIA 对应关系。首次测试有括号笔误，修正测试后通过，未改生产语义。
- 状态切片合并回归 **86 通过、0 失败、0 跳过，23.8 秒**（70479 exit 0），含真实 Document/Relation/Safety/Tree 浏览器与原 Web HTTP。实际验证面板加载失败重试、回跳/刷新、关系取消/解除、风险保存、搜索/折叠，以及 HTTP 权限/回收/归档/状态事实；不是全产品最终 E2E。

## 新建、回收与恢复对话框迁移（2026-09-05）

- `dialogs-ui.ts` 通过 overlay contribution 提供完整新建草稿与可恢复回收/恢复表单；输入为最小目录投影，沿用公共排序。`dialogs-client.ts` 持有完整打开/关闭/键盘取消、创建提交、回收恢复确认、失败恢复与运行中工作阻止反馈；Workbench 仍在原 lexical 位置注入 shared refresh/control/navigation，不留重复处理器。38 条专属 EN 原值迁入 `dialogs-en.ts`。
- 覆盖 root dist 前，中文/英文 × 浏览器/桌面 × current/archive/trash × 空/有 Goal 的 **24 份完整页面逐字一致**（2921 exit 0）。首次比较误用 dist/src 路径而未运行，查证实际 dist/web 后执行成功。组装后的 **288,126 字符浏览器脚本逐字一致**，之后 JS parse 也通过。本切片没有生产行为修复。
- 两项公共 mount 测试验证原字段/限制、父级/依赖顺序、不改输入、转义、独立 Goal 空态、required 原因与全部回收选择器。真实浏览器补用户点击新建、网络失败输入保留/无写入、重试只创建一个未接受 Draft；打开更多菜单、取消无写入、缺原因受 required 阻止、回收网络失败重试、回收页重载、恢复原 ID/创建时间/完成标准，创建/回收/恢复历史保留，其他 Goal/Relation/Run 不变。
- 新测试首轮未展开“更多操作”便点击隐藏菜单项，修正为先点击真实 summary；另一轮暴露测试假定标准按输入顺序返回，但原 Repository 按生成 criterion_id 排序，改为核对同一标准集合，保留原生产语义。完整浏览器链随后通过（41502 exit 0，4.9 秒）；不把这两个测试修正记为产品修复。
- Plugin/Workbench/root TypeScript 构建、manifest、boundary 和 diff check 已通过（44777 exit 0）；目前 48 packages / 432 sources / 1,209 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。根 renderer 为 **4,163 行**。仍不关闭整个 GW5。
- 最终合并命令：`node --import tsx --test tests/goals-status-ui.test.ts tests/goals-dialogs-ui.test.ts tests/goals-dialogs.e2e.test.ts tests/i18n.test.ts tests/goals-context-ui.test.ts tests/goals-tree-ui.test.ts tests/goals-document-ui.test.ts tests/web.test.ts tests/goals-document.e2e.test.ts tests/goals-relation.e2e.test.ts tests/goals-safety.e2e.test.ts tests/goals-tree.e2e.test.ts`。**89 通过、0 失败、0 跳过，22.0 秒**（23722 exit 0）。构建/测试句柄全部 terminal；没有修改用户 4173、安装或数据。

## 页面路由与文档加载迁移（2026-09-05）

- Native Goals 的 `document-routes.ts` 接管 current/archive/trash 页面及 refresh/momentum/document/panel/records/record-events/quick-record 路径与参数；`GoalDocumentCollection`、`LazyGoalPanel` 现在只有一个公开定义。保留一次 ID 解码、坏编码先返回 404、非法集合与事件 offset 返回 400、safe integer/前导零边界和原错误正文；只由 HTTP host 在 GET 时调用。Planning matcher 保持原实现。
- Workbench 的 `goals-document-routes.ts` 只根据解析结果选择明确 owner callback，不含 HTTP 对象、Store、HTML 模板或权限规则。root HTTP 继续提供 Query/view、Artifact owner 上下文、权限与响应头。记录和 quick-record 的路由迁移不代表把 Execution/Decision 复合 UI 吸收到 Goals。普通 Goal URL 对已归档/回收事实的展示保持原行为。
- 在原 server 上先运行同一组真实 HTTP 边界用例，通过（07e773 exit 0）；迁移后再运行原用例与公开 route/装配分支测试，3 项通过（1318bd exit 0）。覆盖编码错误与集合错误优先级、空/无效集合、offset 最大安全整数/负数/小数/前导零/溢出、非事件路径忽略 offset、缺 Goal 与 trash 面板拒绝、no-store/nosniff。公共测试还验证只调用选中的 owner、参数顺序、一次解码、不匹配路径交还宿主，以及 refresh 空结果和 fragment 空结果的不同语义。
- `document-client.ts` 持有正文替换/忙状态/请求，`panels-client.ts` 持有 hash/面板加载/tab/factor，`records-client.ts` 持有完整记录与事件翻页加载；分别 63/148/107 行。保持原 AbortController/请求身份检查、错误恢复、宿主跨 owner callbacks、草稿首次打开等待。移动了原本跨 Workbench 文件截断的完整 hash 函数，不继续把半个函数当新模块。14 条加载专属 EN 原值并入 `document-en.ts`。
- 整个组装后生产浏览器脚本仍为 **288,126 字符且逐字相同**。新增真实浏览器路径：records 网络失败后重新打开可重试、加载完成清理 busy；延迟一份已经读完的真实 RELEASE HTTP 响应，在其返回给页面前切回 V1，然后释放旧响应，正文/树选择/URL 仍是 V1，后端 Goal/Relation/Run 不变。这是实际交错，不是只检查请求字段。原 Draft 编辑首次加载/失败保存重试也通过（94190 exit 0，6 项）。
- 最终命令 `node --import tsx --test tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts`：**118 通过、0 失败、0 跳过，25.9 秒**（85154 exit 0）。包含全部当前 Goals UI 切片、公共 Command/Query/Lifecycle、Web HTTP 和真实 Document/Draft/Dialog/Planning/Momentum/Relation/Risk/Tree 浏览器。不是整体开发完成后的全产品 E2E、清理复验或初始要求最终审查。
- Plugin/Workbench/root build、manifest、boundary 与 diff check 通过（50947 exit 0）。48 packages / 437 sources / 1,216 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。root server **3,535 → 3,402 行**，renderer **4,162 行**；旧页面/面板/fragment regex caller 已退出。所有测试与构建句柄 terminal，未动用户服务、安装或项目数据。

## Goal 导航、事件与首屏内容迁移（2026-09-05）

- `navigation-client.ts`（61 行）拥有选中/失败回退、Goal 链接和 history；`work-tabs-client.ts`（107 行）拥有 Goal 标签 DOM、八个上限、关闭/焦点和键盘；`lifecycle-client.ts`（45 行）持有显式设为当前/归档恢复请求。面板点击/键盘、记录翻页点击和异步编辑入口分别归原 `panels-client.ts`、`records-client.ts`、`draft-client.ts`。原跨 Workbench 文件截断的 archive handler 现在完整归 owner，不移动半个 handler。
- Workbench 仍在原 lexical 位置组装，保留 `applySelection` 的 TUI 事件、通用 utility 标签、共享存储、跨 Feed/Decision surface、focus deck 和 refresh/bootstrap；未将这些通用能力冒充 Goals Plugin 的独立应用。根首屏 Goal 标签和完整/简短空归档回收正文由现有 document contribution 提供；Workbench 只 mount，根保留 tablist/utility/拖动区。八条原专属 EN 原值迁入 `document-en.ts`。
- 迁移前后 **288,126 字符生产脚本逐字一致**。真实浏览器随后复现原缺陷：点击顶部 Goal 标签 → shell replaceChildren 删掉焦点 button → 同 Goal select 提前返回 → body 获得焦点 → Home/End 不生效。只补点击后 `focusWorkTab(selected)`，当前脚本 **288,158 字符**；去除这一个新增调用后与原基线逐字一致，JS parse 通过。测试真实点击后发键盘，不手工 focus 绕过；初测失败可稳定反映这个缺陷。初始标签的用户标题也补属性转义，与客户端 setAttribute 一致，公共 mount 验证带引号/属性样式文本不能突破 aria-label。
- 真实导航测试通过回退/前进、顶部 tab Home/End、正文与 factor Home/End、完整记录、失败选择回退/URL 不改、解除网络阻断重试、关闭非当前/当前/最后一个标签、打开第九个淘汰最旧标签、真实 reload 恢复原八个标签。确认 Goal/Relation/Claim/Run 和 Board 当前 Goal 全部不变。另一用例验证“设为当前”只在点击后写入、网络失败不写、重试及 reload；已完成 CORE 归档失败重试、归档页重载与原 ID 恢复，其他 Goal 和 Relation/Claim/Run/Evidence 保留。
- 测试初次遗漏展开“更多”菜单，按真实用户路径补 summary 点击；另一处把 Chrome 网络阻断错当成 HTTP 中文错误，改为核对真实 `Failed to fetch`，未改生产错误文案。修复焦点后的两项完整浏览器用例 **2/0/0，7.5 秒**（58514 exit 0）。中英文 × current/archive/trash × 空/有集合的完整浏览器/桌面页面与 refresh，共 **36 份迁移前后逐字一致**（52627e exit 0）。该比较用正常标题，恶意标题属性转义由独立 mount 用例验证。
- 最终命令 `node --import tsx --test tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts`：**155 通过、0 失败、0 跳过，28.7 秒**（78431 exit 0）。含所有当前 Goals 切片及真实浏览器、Web HTTP、桌面装配与隔离 PTY。不是全产品整体开发结束后的最终 E2E。Plugin/Workbench/root build、manifest、boundary、diff 通过（42340 exit 0）：48 packages / 440 sources / 1,220 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。
- 根 renderer 当前 **4,160 行**。构建和测试句柄均 terminal；未修改现用 4173 服务、用户安装或项目数据。GW5 三项验收仍只登记部分进展，不关闭 Goal。

## 记录/进展摘要与导航投影收口（2026-09-05）

- `context-records-ui.ts` 接管 Goal id、创建/更新时间、原记录负责人、优先级、状态解释、验收和范围，以及只读关系/风险/规则分组；Context 的 `record-basics` / `record-relations` 是真实 contribution surface。Safety 的 `risk-summary` 只显示 open/triggered 风险，Policy 的 `check-summary` 显示已经解析的自检/独立检查/人工确认要求。Workbench 只 mount，根执行/历史/Companion 和外层 deck 保留原 owner。12 条原 EN 文案就近迁移，没有重译。
- `navigation-model.ts` 的 `buildGoalsNavigationItems` 接走首屏/refresh 中 Goal 导航数据构造，使用最小公开字段、原子项查询与状态 icon contribution。保持排序、状态优先级和 waiting/compound 独立标记；Host 继续组合 Project/Board/cursor 并转义 JSON。根 renderer **4,160 → 4,138 行**，不将仍有其他职责的文件宣称 retired。
- 此前实现阶段已比较中英 × current/archive 的进展与记录 **96 份输出逐字一致**（91342 exit 0）；随后导航投影迁移的 **36 份完整浏览器/桌面/refresh 输出逐字一致**（c15d13 exit 0）。这些是对应覆盖前的编译基线比较，不是后续 factory 改动后的脚本一致证明。公共 mount 增补负责人优先级与转义、只读分组、风险状态过滤、全部检查开关和导航投影保真。真实记录浏览器验证风险锚点、重载、卡片键盘和原执行/历史区块，并对照后台 Goal/Relation/Risk/Claim/Run/Evidence 未变。
- 续接发现旧测试 32647 句柄已不存在；只读进程检查无遗留构建/测试，不把丢失输出记成功。重新合跑第一次 **158 通过、2 未通过，324.9 秒**（23548 exit 1）：momentum 浏览器已退出而测试进程仍超过自身 60 秒时限数分钟未收尾，明确终止该测试子进程后运行器报告失败；关系测试在重载后点击坐标落不到 tab。未改产品/断言，按仓库正式串行策略复验两项，**2/0/0，9.9 秒**（60854 exit 0）。这些事实说明并行运行存在干扰，不能把前一轮伪记全绿，也不据此添加产品补丁。

## 正文客户端显式 Host 绑定（2026-09-05）

- `document-client.ts` 改为公开浏览器 factory，仅接 pane、collection、route、翻译、取消识别、错误反馈及替换前后回调。原全局 `goalDocumentRequest` 从 Workbench bootstrap 退出，由每个实例自己持有；旧 `GOALS_DOCUMENT_LOAD_SCRIPT` 无 caller 后删除。HTTP、no-store、true/false/null 结果、busy、取消与迟到回复身份判断保留。只有内部 caller 的 replacement 方法不对外暴露，不引入新打包器或通用注册表。
- Workbench 在原 lexical 初始化位置注入 ports；替换前的 panel/Quick Record 取消、替换后的关系/风险预览和 panel/factor hash 恢复顺序保持。跨 owner callback 的权威逻辑没有进入 Goals。此次脚本结构发生变化，不宣称组装程序逐字一致。
- 真实生产 factory 测试在 Chrome 中使用两个 DOM pane 和实际 HTTP 响应，制造已完整读取的 RELEASE 回复延迟、另一实例完成 V1、原实例转到 CORE 后再释放旧回复；验证旧回复返回 null、不覆盖新内容、不取消另一实例，404 保留旧正文、重试成功、before/after 调用顺序、标题栏/兄弟内容和后台事实保留。原文档/导航/草稿/关系/风险用户路径合跑 **8/0/0，31.0 秒**（9038 exit 0）。未修改测试 fixture 或放宽断言。
- Plugin/Workbench/root TypeScript 构建通过（55384 exit 0）。manifest/boundary/diff 通过：48 packages / 441 sources / 1,224 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。
- 最终命令 `node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts`：**161 通过、0 失败、0 跳过，82.3 秒**（62143 exit 0）。包含全部当前 Goals UI、真实浏览器、Web HTTP、Desktop/隔离 PTY 和公开 API 测试；不能代替整体开发后的全产品 E2E、清理复验和原始规范审查。构建与测试均已 terminal，没有更新用户服务、安装或项目数据。

## 面板/记录请求与事件 Host 绑定（2026-09-05）

- `panels-client.ts` 的 hash/keys、惰性面板、因素切换、点击和键盘现在由一个公开 factory 生产；`records-client.ts` 的完整记录、事件分页、点击由另一个 factory 生产。对应实现为 235/134 行，未增加通用 dispatcher、包或注册层。原片段常量内部化，Workbench 只消费两个 factory 和有限返回方法；panel/record controller 与 panel/factor keys 从共享 bootstrap 退出。原私有状态不再依赖 Workbench lexical 变量。
- `documents-state.ts` 明确注入 pane、route/collection、语言/错误、focus/reveal、记录接口、预览和延迟保存回调；原共享事件顺序保留。记录点击在未命中时同步返回 null，只有真实翻页才等待 Promise，避免所有点击都插入 await 而影响浏览器默认动作。Execution/Decision 的内容/权限和共享 refresh 未迁入这些客户端。
- 纯绑定迁移后，文档/导航/记录/草稿真实浏览器 **7/0/0，26.8 秒**（92486 exit 0）。随后补交错测试发现原面板缺陷：completion 的真实完整响应被延迟，打开 progress 取消旧请求，旧 finally 因 controller 已变化而不清理 completion 的 loading/busy，重开永远被 guard 拒绝。新增测试先失败（98038 exit 1），修复为取消时清理当前请求所属 panel、finally 按身份清理后通过（25676 exit 0）。不改 HTML、HTTP 或权限。
- 记录翻页测试在隔离项目通过实际 HTTP Draft 保存生成跨越首屏 40 条的历史，不直接造事件。首次点击早于卡片动画结束，测试改为等待实际动画完成后点击，没有修改 CSS/fixture/点击断言。随后复现取消后按钮仍 disabled（7486 exit 1）。记录 factory 以当前 controller 对应的 UI reset 清理忙态/按钮；成功与失败分支在写 DOM 前验证当前请求身份，取消后的旧页面不能追加事件。
- 修复后同一分页路径通过（86051 exit 0）：真实点击加载→响应已完整读取但延迟→切离→按钮立即恢复→释放旧响应不追加→网络失败→重试成功；后台 facts 不变，按独立构造的修改理由逆序核对全部历史，seq 唯一且最终分页计数一致。另补完整记录未返回就取消/重开，旧响应不能替换新 DOM 的对象身份；防止仅因 HTML 相同掩盖迟到覆盖。
- 最终串行命令 `node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts`：**164 通过、0 失败、0 跳过，79.3 秒**（81741 exit 0）。Plugin/Workbench/root TypeScript 构建、manifest/boundary/diff 通过；48 packages / 441 sources / 1,224 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。构建/测试均 terminal，未修改用户服务、安装或项目事实。
- 本切片是现有功能真实可用级的边界迁移及已复现缺陷修复。GW5 未完成：导航/编辑/树/态势等仍有 lexical 依赖，共享 bootstrap/refresh 和跨 owner cutover 尚待审查；164 项不替代整体开发完成后的全产品 E2E、清理复验和初始要求逐项验收。

## 导航、Goal 标签与草稿客户端 Host 绑定（2026-09-05）

- `navigation-client.ts`（77 行）现在导出公开 factory：选择、失败回退、history/hash handlers 只消费有限 Host ports。selected 与 active Goal 用 live getter 读取；Workbench 继续拥有 applySelection 的 TUI 通知、壳更新、导航 URL 和保存，监听器在原位置注册。
- `work-tabs-client.ts`（151 行）拥有打开 Goal 列表及原恢复/去重/过滤、八个上限、末项关闭限制、点击和键盘焦点。Workbench bootstrap 的 openWorkTabs 及初始化/持久化逻辑已退出；Host 只提供原存储 key 的读写、当前选择/surface 和延迟壳调用。Goal 标签 append 后仍由 Host 组合 utility tabs、replaceChildren 与 pane ARIA。
- `draft-client.ts`（139 行）统一验收行增删/编号、target 解析、首次编辑等待面板、保存与失败恢复。route/control headers、分行、refresh、翻译/提示、panel 由 Host 显式绑定；parse/renumber 内部化。未匹配异步点击/提交同步返回 null，其他默认事件不插入无关 await。旧公共片段在 Workbench 无 caller，不保留兼容出口。
- 首次构建发现导航 import 已改但插值仍为旧名（1577 exit 1），修正后 Plugin/Workbench/root TypeScript、manifest、boundary、diff 通过（96008 exit 0）。48 packages / 441 sources / 1,224 imports / 71 edges / 30 subpaths / 10 compatibility / 5 legacy huge files，0 errors。
- 两次受限环境 Chrome 在 debugger 启动前退出（68559、5307 exit 1），没有测到页面。获准在隔离目录启动后，同一导航/草稿/正文组 **7 通过、0 失败、0 跳过，23.3 秒**（53859 exit 0）。实际验证 history、焦点、八标签、关闭末项、失败回退、草稿字段/唯一保存历史及重载，后台无额外执行或事实变化。没有改 fixture、用户浏览器或 4173 服务。
- 扩展串行组首次在 Web Policy/Review 的旧源码断言失败（43453 exit 1）：仍要求 `state.active_goal_id` 出现在 history 内部，实际已迁为 `getActiveGoalId()`。断言改为分别检查调用与 Host 绑定，原真实 history E2E 不变；没有修改产品语义。最终同组 `node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts`：**164 通过、0 失败、0 跳过，73.6 秒**（83394 exit 0）。全部构建/测试 terminal。
- 此切片为现有功能的边界整理，不增加产品策略，不表示 GW5 或整体重组完成。树/态势、生命周期/对话框等其余客户端显式绑定、共享 refresh、跨 owner cutover 和最终全产品验收仍未完成。

## Tree 与 Momentum 客户端 Host 绑定（2026-09-05）

- Tree 公开 factory（230 行）拥有筛选 Set、输入法 composing、筛选/折叠/搜索/键盘事件，以及树选中高亮、祖先展开和折叠状态读取/恢复。Workbench 不再直接操作 tree-item/tree-node 或这些内部变量，只在原监听位置绑定方法。共同服务 Feed 的 search busy、延后刷新和全局 UI-state 存储仍归 Host。
- Momentum 公开 factory（245 行）拥有未完成过滤、7/30 日周期、选中 Goal、缩放/自适应和单次加载 promise；内部 viewport factory（90 行）拥有 ResizeObserver、边几何和 pointer 拖动。viewport 不再从 package root 暴露无 Host 约束的片段。Host 使用有限 read/restore/layout/remember 方法，原五个保存字段、恢复顺序、窗口/侧栏重排及延迟函数绑定保持不变。没有新增 generic registry、消息总线或重复 scheduler。
- TypeScript Plugin/Workbench/root、manifest、boundary、diff 通过（16140 exit 0）；48 packages / 441 sources / 1,224 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。旧公共片段/Host 状态 caller 已退出，没有宣称根 renderer/server 全部退出。
- 第一组原 Tree/Momentum/navigation 真实浏览器 **4/0/0，24.1 秒**（71385 exit 0）。随后在原浏览器路径加入“完成状态筛选后真实重载仍保留父层级与过滤结果”“手动缩放后真实重载保留缩放、周期、选中详情”；旧 Web 源码断言更新为检查状态 getter 与其 Set 副本实现，不放宽业务断言。
- 加入恢复验证后的共享串行回归 **164/0/0，99.5 秒**（75480 exit 0）；其后再将高亮/祖先展开/折叠恢复由 Host 移入 Tree，最终同组 `node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts` **164 通过、0 失败、0 跳过，130.0 秒**（78724 exit 0），构建与测试全部 terminal。无用户安装、4173 服务或项目事实变更；本次只做边界迁移，未改坐标、过滤、缩放范围或产品策略。
- GW5 仍未完成，剩余生命周期/对话框、关系/风险等客户端绑定、共享 refresh 与跨 owner cutover；所有开发结束后的全产品用户 E2E、清理与复验和初始要求逐项审查仍保留。

## 生命周期、对话框与普通事实表单 Host 绑定（2026-09-05）

- 新建/回收/恢复（247 行）、设为当前/归档（55 行）、关系（183 行）、普通 Risk facts（140 行）、Impact（125 行）、Policy（95 行）均改成有限 Host factory。旧事件片段出口无 caller 后内部化；Workbench 事件文件只在原顺序调用 owner 方法，不插入未匹配的异步等待。通用验证、错误/回执、refresh、导航和控制 headers 仍由 Host 提供。
- Dialog 实例拥有 trashIntent/controls、新建快照/光标恢复和候选项刷新；对应 bootstrap 控件/状态、editing-graph 快照及 refresh 中直接替换表单 options 的实现已退出。Relation 实例拥有预览、方向与解除；Risk 和 Impact payload 各回自己的 owner。Risk 处理决定、其预览、Human Review/Evidence 不混入普通 facts。
- 首次编译查出关系 import 与旧插值未同步（28857 exit 1），修正后编译通过。真实浏览器初始化失败（43064 exit 1）经隔离错误捕获确认 `currentLocale is not defined`（72260 exit 0）：浏览器不提供服务端 locale 函数。Host 改为读取既有 document language；没有新增全局兼容函数。导航、归档和关系随后通过（51004 中 3 项通过）。
- 新增父级/依赖创建用例第一次用 CORE 父级 + INTERFACES 依赖，被原执行循环检查正确拒绝（51004 的唯一失败）；改为无循环的 V1 父级，不改产品规则。同一真实新建→失败重试→取消→回收→恢复路径通过（73882 exit 0），核对创建仅一次、原 Goal identity/history 与两条 active 关系保留。
- 新增刷新用例在真实 HTTP 创建 NEW-CHOICE 后，通过应用可见页面事件触发 refresh，验证新增候选实际进入下拉列表、未保存 title/outcome、父级/依赖选择及 title 光标 2–7 保留；关闭弹窗不创建 Goal 或改变后台 facts/Claim/Run。首次 fixture 使用错误操作键 header 被 400 拒绝（94343 exit 1），改用既有正式 header 后 **2/0/0，8.5 秒**（40333 exit 0）。没有放宽门禁或改 fixture 实现。
- 最终 Plugin/Workbench/root TypeScript、manifest、boundary、diff 通过（59461 exit 0）；48 packages / 441 sources / 1,220 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。
- 最终串行 `node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts`：**165 通过、0 失败、0 跳过，74.3 秒**（4745 exit 0）。包含新增恢复、原风险失败重试、关系、Web Impact/Policy/Human Review 和 Desktop 路径。所有测试/构建已 terminal；不修改用户服务、安装或项目事实。
- 本轮完成专属客户端显式绑定，不是整个 GW5/重组完成。共享启动/refresh、根 renderer/server 产品装配、聚合 catalog 和跨 owner cutover 尚待审查；最终全产品模拟用户验收、代码清理与重复 E2E、原始需求逐项审查仍独立保留。

## Goal 刷新与集合目录装配（2026-09-05）

- 新增 `refresh-client.ts`（63 行）有限 Host factory，负责准备集合内选中项/迁移回执以及树、正文、筛选、计数、新建候选项更新。准备阶段没有 DOM 副作用，Workbench 在原搜索/选择/脏输入保护后才 apply。共享 cursor/HTTP fallback、Decision/Feed、存储、Shell links 与导航仍归 Host，不把整个刷新器搬进 Plugin。Workbench `refresh-decisions.ts` 的对应内联更新已退出，当前 404 行。
- `collection-model.ts`（51 行）统一完整页面和精简刷新中的 requested → active（仅当前集合）→ 首项选择及集合文案/计数；Tree contribution 新增 directory/refresh 两个真实 surface（tree-ui.ts 总 234 行），WorkBench 仅 mount。16 条目录/搜索/计数文案由聚合 EN 迁入 tree-en，值不变。根 renderer 4,138 → **4,057 行**，server 仍 3,402 行；没有把执行/验收组合并入 GW5。
- Plugin/Workbench/root 编译首次发现新 refresh surface 解构了两个未使用的字段（e7d41c exit 1），删除无用解构后全部通过（827442）。48 packages / 443 sources / 1,223 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge files，0 errors（4a6804）。
- 模板迁移后、中英文×当前/归档/回收/空集合×完整/refresh 的 **16 份完整输出逐字一致**（827442）。随后移动文案，英文内嵌 catalog 的键插入顺序发生变化，原逐字比较因此失败（ecb0ed）。只对该 JSON 对象键排序、保留并比较全部键和值后，16 份完整输出仍一致（4a6804）。未删除翻译、忽略页面区块或改产品 HTML。临时比较脚本 /private/tmp/gw5-page-compare.mjs，隔离基线 /var/folders/m2/tx2tqs290l913y61zqz413dr0000gn/T/gw5-page-compare-U8Zm28。
- 原新建/回收与导航真实浏览器 **4/0/0，14.7 秒**（fe1cd4）。新增三条真实刷新路径 **3/0/0，9.1 秒**（e90ea7）：外部 HTTP 归档/恢复后自动继续同一 Goal；完整 HTTP refresh 响应延迟期间点击其他 Goal，旧结果不能覆盖且下一次刷新仍补齐新增 Goal；精简接口 503 后回退完整 Goal 页面，Feed surface 节点身份保留。均比较刷新前后完整后台 snapshot，无新写入。
- 公共集合/contribution 测试覆盖 requested/active/首项优先级、archive 不选当前 active、trash/Decision/空集合、混合阶段与六类阻塞计数、完整/精简 DOM 差异及英文目录；输入对象不变。已有弹窗刷新未保存内容/关系/光标回归保留。
- 两轮串行扩大组均执行 `node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts`。第一轮（b4a56a exit 1）草稿浏览器和 Web 旧源码位置断言失败；草稿未作产品/测试修改，单独复验通过（8fafb5），第二轮整组中也通过。首次草稿失败未取得足以定位根因的保留片段，不把它解释为已修好的产品 bug。
- 第二轮（0ffc05 exit 1）真实浏览器路径通过，仍有同一 Web 测试的旧 nextState 变量名断言失败。该测试分别改为检查 fetch→共享 snapshot→公开 apply，以及 factory 的 navigation 集合字段，不改变 HTTP/用户行为断言。最后只复验这个实际失败用例，**1/0/0，1.3 秒**（d755e3）。没有把第二轮 exit 1 描述成整组全绿，也没有为纯测试定位更新再机械重跑全部浏览器。
- 本轮 scope 的功能/类型/包边界及前后输出证据已形成；GW5 三项仍 inconclusive。整体根 HTTP/跨 owner cutover、最终全产品用户验收→清理→复验→初始要求逐项审查仍未完成。下一项转向剩余根页面与 HTTP 组合；共享刷新调度应留在 Host，不能把“仍有 refresh 函数”等同于应继续搬到 Plugin。

## HTTP 请求、fragment 与完整页面装配（2026-09-06）

- Workbench 新增公开 read/page request dispatch。非法/不相关请求不读 view，完整页先定位 Goal 实际集合，再调用异步 Project operations provider；root 保留 Project/auth、Query、响应头/socket。Goals `document-routes.ts` 统一集合选择、页面 404 及 fragment 适用条件，不读取 Store。
- `goals-fragment-renderer.ts`（57 行）接管 root 六个 fragment 函数的 owner 选择和 prefix 编排，原函数名/参数默认值/null 保留；事件页仍不 prefix，quick-record 仅 current 且未归档/回收。事件排序/分页、Execution/Decision/Quick Record 内容不移入 adapter。前一段 root renderer 4,057 → 3,983，server 3,402 → 3,386。
- 前一段 Plugin/Workbench/root 构建、manifest、boundary/diff 通过（0df738）；48 packages / 444 sources / 1,225 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge，0 errors。首次 fragment 编译仅发现移走类型后未用 import，删除后通过。原 focused HTTP/导航/刷新/文档 **13/0/0，31.0 秒**（df74a9）；受限环境 listen EPERM 的首次失败保留，不用代码绕过。
- 前一段扩大串行组 **170/171，1 失败，91.7 秒**（67d24c），日志 `/private/tmp/gw5-http-regression.log`。唯一失败是文档编辑展开后立即检查焦点，原产品通过 requestAnimationFrame 在下一帧聚焦。测试增加等待实际 activeElement 进入原 draft form，再执行原断言；没有强制焦点、固定 sleep 或改生产逻辑。上次 session 51011 的最终结果未恢复，当前确认句柄 missing，定向重跑 `node --import tsx --test --test-concurrency=1 tests/goals-document.e2e.test.ts`：**4/0/0，12.1 秒**（65cacd）。这不解释更早未定位的另一草稿偶发失败。
- 本轮继续迁出完整/refresh 页面：`createWorkbenchGoalsPageRenderer`（223 行）用有限 Host/content ports 组装 Goals、Feed、Work；不导入 root Web 类型、Store 或另建执行判定。root 只导出装配结果，renderer **3,983 → 3,837 行**。Tree `root-entry` surface 接走 Goals 一级目录按钮/计数/选中态；其 mount 经 UI Host，Workbench 只决定位置。
- 首次页面编译误将 root 尾部的类型 import 一起移入 factory（3175dd exit 1），恢复为 root 顶层 import 后 Plugin/Workbench/root 构建、manifest/boundary/diff 通过（df465d）。**48 packages / 445 sources / 1,229 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge，0 errors**。
- 本轮在改动前重新保存隔离 baseline `.../T/gw5-page-compare-4eANTr`；中英文 × current/archive/trash/empty × 完整页/refresh 的 **16 份输出逐字一致**（e98ebe exit 0），最终比较不做 catalog 排序或任何规范化。脚本 `/private/tmp/gw5-page-compare.mjs`。没有修改或忽略 HTML/文案区块。
- 新 Tree public mount 测试验证一级入口的 active/非 active、0/3 计数和两个原导航动作。最终串行 `node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts`：**172/0/0，87.6 秒**（d8b756 exit 0），完整日志 `/private/tmp/gw5-page-regression.log`。随后把静态英文标签检查的源范围随页面/Tree owner 同步，定向 `tests/i18n.test.ts` **7/0/0**（693276）；未为测试-only 位置变更重复全套。
- 已同步 Plugin/Workbench 开发说明与剩余 caller 审查 `gw5-caller-audit.md`。确认最终 Cutover 有 canonical owner，未领取/重开 EX4 或 Cutover。下一具体缺口是 global/project Planning GET 页面装配仍内联在 root server；其余执行/Decision/共享 Shell 残留按原 owner 审查。所有测试/构建已 terminal，不改用户服务/安装/项目数据。

## Planning GET 页面装配收口（2026-09-06）

- `renderWorkbenchPlanningRequest`（23 行）接走 personal/project GET 的页面分发，Goals `selectGoalsPlanningPageMethod` 接走 new/已存在/缺失/项目 scope 选择与原 404 文案。Host 仍提供已 resolve 的 methods、Project context、公开 renderer 和响应头，保留 project 新建不查询 methods；不改写入/采用/权限。root server **3,386 → 3,353 行**。
- 初次机械选区多包含下一条 API GET 的 opening if，编译失败（db4ec0）；恢复原条件后再编译，未运行损坏版本测试或触及现用服务。最终 Plugin/Workbench/root 构建、manifest/boundary/diff 全通过（5b961e）：48 / 446 sources / 1,233 imports / 71 edges / 30 subpaths / 10 compatibility / 5 legacy huge，0 errors。
- 公共 request 测试覆盖 GET-only、不相关/非法编码不加载 owner、library/new/edit、重名 method 的 personal/project 选择、缺失或 scope 不符时不渲染和原不同 404。执行 `node --import tsx --test --test-concurrency=1 tests/goals-planning-ui.test.ts tests/goals-planning.e2e.test.ts tests/web.test.ts`：**65/0/0，21.4 秒**，日志 `/private/tmp/gw5-planning-request.log`。原真实 Planning 编辑/采用/项目保存和 Web 权限/状态/历史回归通过；没有为最新路由变化复用此前 172 项结果来冒充验证。
- README、Huge Class/Migration 与 caller audit 同步。下一步是 GW5 整项 Contract 的 caller/边界与无损验收整理，跨 owner 差距继续由已确认 Cutover owner 处理。当前证据仍按三项 inconclusive 提交，不报告整个 GW5 或总目标完成。

## 整项审查补齐项目工作规则（2026-09-06）

完整 Contract 对账发现项目工作规则的说明、默认 binding 预填、保存脚本、样式和 19 条专属文案仍在 root/Workbench。已归入 Goals Policy contribution 的 `project` surface；Workbench 只 mount，root 保留共享设置导航/HTTP。没有改变表单规则、文案、保存接口或项目数据。

生产代码、公开装配与新增真实浏览器测试已复核。项目规则测试验证空原因拒绝、网络失败保留输入、恢复后唯一写入、所有 Goal 继承规则、刷新持久化及一次性成功回执，并断言没有新增 Claim/Run 或改变 Goal 内容。项目页面的中英/桌面组合与原输出一致；移动文案后仅对 inline catalog JSON 键排序，所有值仍完整比较。

最终串行 `tests/goals-*.test.ts + i18n + web + desktop-tui`：**175 passed / 0 failed / 0 skipped，86.9 秒**，原始日志 `/private/tmp/gw5-acceptance-regression.log`（7f949a exit 0）。Plugin → Workbench → root 构建、manifest、boundary 通过；48 packages / 448 sources / 1,236 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge，0 errors。此后只整理文档，未重跑无变化的整组测试。

完整验收映射在 [`gw5-validation.md`](./gw5-validation.md)。旧 Claim 因中断于 16:55:42 UTC 到期，原 Run 自动 abandoned；16:57:08 UTC 按实时投影恢复同一 Goal，新 Run `run-9daddff5-6b88-4aec-89b1-df447a7b691e` 只负责证据复核和验收收尾，不假装旧 Run 连续存活。

## 整项工程验收结论

2026-09-05 17:01:04 UTC 已完成 canonical Run/Evidence/Review：`evidence-8efddec5-17d9-4437-ab5a-c78b64f2ef91` verified/passed，全三项映射；`review-15084847-4b63-438c-93fe-74e011422203` pass，projection=completed。GW5 收尾完成，不代表整体重组完成。

| 验收 | 当前结论 | 缺口 |
| --- | --- | --- |
| gw5-boundary | 通过 | 真实 contribution、公开 Contract、Workbench 装配及 Module facts 边界已逐项核对 |
| gw5-legacy-exit | 通过本项职责退出 | 对应产品模板/文案/route 职责已迁；剩余有限 binding 与跨 owner 模板在 caller audit 有明确后续 owner |
| gw5-result | 通过本项无损回归 | 175 项完整 Goals/Web/Desktop 组及页面输出对比；不替代全产品最终 E2E |

工程验收已齐，canonical 完成以正式 Run/Evidence/Review receipt 为准。正文/面板/记录 factory、记录基础/关系、进展风险/规则、导航投影、full/refresh page、Planning request 与项目工作规则已迁，不重做。跨 Execution/Decision 的块不能整块吸收进 Goals；EX4 canonical 已完成，残留复合 UI 必须在最终 Cutover 审查并按需正式纠正。根 HTTP 的完整 cutover 不能仅用 GET matcher 退出替代。DV4 App GUI 首启仍需暂停现用服务的明确授权；本项不代替该授权，也不更新用户安装。
