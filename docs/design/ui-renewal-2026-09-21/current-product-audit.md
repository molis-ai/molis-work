# Molis Work UI 升级：当前产品与约束审计

审计日期：2026-09-21。范围：当前 `codex/ui-visual-renewal` 工作树的产品文件、规格、Workbench 和原生插件源码。这里只记录事实与设计建议，不改生产实现，不把其他分支、历史对话或规格中的完成标记当成当前完整可用性。

## 结论

Molis Work 最值得放大的特色是：**让人从“这件事现在怎么样”直接走到“我需要做哪个决定、能依据什么继续、结果为什么算完成”**。Goal 已有约定、要求、报告、待决定、问题和显式收尾，Feed、Inbox、Session、Artifact 又有来源与引用关系；把它们连成可读的工作现场，比增加看板、Agent 数量或装饰性数据更有价值。

当前产品已具有专业工具的基础：固定外壳、插件入口、连续工作面、多个工作标签、分屏、共享控件、浅深主题、精确版本、历史追溯。主要设计机会是减少跨模块找事实的成本，以及把“需要我”和“正在发生”表达得更清楚。不能把全局 AI 助手、团队协作、自动派单和 TaskBoard 的愿景画成已接通功能。

本审计是静态源码核对。历史规格记录的浏览器/原生验收不是本轮产品实操证据；本轮没有打开、修改真实项目业务数据，也没有启动 Runtime。

## 1. 事实与文档的使用顺序

1. `PRODUCT.md` 定义用户价值、授权与完成边界。
2. `docs/SSOT-MATRIX.md` 和各 owner 公开入口用于核对事实归属、当前状态。
3. 对当前是否有入口、如何呈现，以当前 renderer、client、route 和业务 owner 的调用链核对。
4. `DESIGN.md`、`taste.md`、交互规格提供品味与行为约束；历史阶段验收只覆盖当时的范围。
5. 本次可以提出新的表达与布局，但概念改变与已有事实必须分开；尚未接受的方案不直接改写当前规格。

### 已发现的漂移或冲突

| 文件说法 | 当前证据 | 升级时如何处理 |
| --- | --- | --- |
| `PRODUCT.md` 多处仍写未转交 Goal 可以使用旧 Claim/Run、Evidence/Review 写入 | `SSOT-MATRIX.md` 已写旧执行/证据写入退役；`apps/cli/src/command-dispatch.ts` 只分发 init/snapshot/import/active-goal 和树提案操作；`plugins/native/goals/src/event-document-ui.ts` 的无事件 owner 提示是“这里不能写入” | 不在新 Demo 加入“领取 Run”主路径。后续产品文档应按正式 owner 逐项校正，保留历史读取与当前事件写入的差异 |
| `DESIGN.md` 一部分总述仍像固定“插件轨 + 当前插件目录 + 舞台”，并说打开插件总是新建 durable tab | `apps/workbench/src/plugin-catalog.ts` 的 `DIRECT_WORK_SURFACE_IDS` 包含 Goals、Sessions、Inbox、Feed、Schedule、Artifacts 和个人插件；`taste.md` 明确插件母页默认全屏列表、点详情再收、母页不自动开标签 | 以“入口母页 → 对象工作面”为当前更近的行为依据；不要为了旧三栏几何把空目录强塞回来。标签规则需单独核对，不把历史总述复制进新规范 |
| `product-interaction-redesign/inventory.md` v11 写新建 Goal 改为贴边 | 更新后的 `DESIGN.md` 和 `taste.md` 写新建为居中、按内容长高 modal，编辑已有关系贴边 | 新建/编辑分开：轻创建居中，现有对象就地编辑贴边；不照抄较早修订 |
| `DESIGN.md` frontmatter 有选中目录 leading accent bar | 同文正文明确目录选中使用 tint，无第二条 leading bar；`taste.md` 偏好平行、薄边界 | 新方案只保留一种选中语法，不叠加边条、底色、描边三重强调 |
| `docs/cli-and-development.md` 同文出现 56 包、48 包和旧 18 contract-only/30 partial；SSOT 仍有 39 包总数 | 当前 `plugin-catalog.ts` 已收录大量后加插件；包数量说明不同步 | 不据这些数量推导当前能力或完整迁移等级；本次无需为视觉研究扩大为包清单修复 |
| 工艺底线禁止系统控件 | 当前仍有 `plugins/native/ppt/src/ui.ts` 的 `type=color`、Schedule 的 `type=time`、Functions 的 `window.confirm`，项目设置也有 confirm | 这是明确已知欠账；新 Demo 使用统一产品控件，生产迁移按组件切片替换，不能宣称现状已全面一致 |
| Coding 规格 C3/C8/C9 等标“已完成” | 当前有 SQLite/session/projection/问答卡片等能力与目录挂接；C12 Character、C13 Plan→SubAgent→TaskBoard 明确计划中，TaskBoard 仍是导航常量 | 组件/投影完成不等于产品全过程完成。Coding Demo 为方案演示，不能宣布正式问答续跑、子代理协作或管理流程已经接通 |
| Home 存在“个人/组织”分组 | `home-flow.ts` 根据 GitHub/Gmail/YouTube 来源种类将事件分组为 org；并非 Team membership 或协作数据 | “组织”不能视觉演绎成团队工作量、在线成员或多人执行事实；建议使用更具体的“项目动态/我的工作”文案概念 |

## 2. 当前模块、用户问题与设计方向

| 入口 | 核心用户问题与当前入口 | 事实归属/关键边界 | 建议的升级方式 |
| --- | --- | --- | --- |
| **Home** | 今天哪些事值得先看？日期流、当天事件、快捷方式、选中事件后显示详情/动作 | Workbench 聚合 Inbox/Feed/来源/Session；不是新任务 Store。`project-home.ts`、`home-flow.ts`、`scripts/client/project-home.ts` | 保留留白和日期节奏；把“继续上次工作”“需要我”“最近变化”做成同一纸面的短清单，最多展开当前一项。不要大数字 KPI、满屏卡片或对话框当首页主角 |
| **Goals** | 目标是什么、哪条可继续、缺什么、为什么还不能完成？列表/图/看板 → Goal Frame → 约定/要求/记录/决定 | Goals 拥有事件与完成效果；Workbench 不重算。`event-document-ui.ts` 的 currentJudgment 已优先待决定→阻塞→验收→未满足要求；`event-state-completion.ts` 检查约定、结果、要求、问题、依赖、风险、有效决定 | 首屏形成“当前结果约定 → 当前差距 → 下一步动作”；要求旁展示精确证据与状态，历史渐进展开。图是解释依赖的辅助视图，不用节点数量制造完成感。满格要求仍显示“等待收尾” |
| **Inbox** | 哪件事必须由我介入，为什么是现在？待处理/历史列表 → 引用式详情 → 原对象或处置 | Attention owner 保存引用、原因、状态；处理 Inbox 不等于完成 Goal、不删除来源。当前 `renderInboxDirectory()` 返回空，列表拥有舞台 | 建议使用“问题句 + 原因 + 关联目标 + 处理动作”，优先到待决定/失败恢复现场。动作固定在标题附近；保留处理结果与来源回链。可设计逐项处理节奏，但不把所有 Feed 都变待办 |
| **Feed** | 外界发生了什么、哪些值得保留或行动？来源任务与消息流、正文、保存/进入 Inbox/升格 | Sources 管监听配置；Signals 管观察与 provenance；Feed 管消息、正文、已读和去向；Attention 管介入引用 | 邮件式紧凑列表，来源/标题为主；展开正文保持原位置。已读和已处理分开。来源健康只在需要时出现；规则在来源任务现场配置。升格后明确显示新 Goal 的回链与原文保留 |
| **Artifacts** | 最终交付物在哪里、当前看到哪一版、它来自哪次工作？列表 → 精确版本/预览/下载 | Artifacts 唯一拥有版本与 provenance；Goal 关联应指向精确版本，不能“latest”偷换历史证据 | 优先显示作品/文档预览，再给版本条、来源 Goal/Run/Session 和相关要求。把“新版本出现，但已验收依据仍为旧版”视觉区分清楚。类型无 renderer 时诚实退到可读数据，不假装成品预览 |
| **Shelf** | 临时资料怎样安全收进来、处理后找得到？材料/结果/剪贴板、多选、Recipe、终端井 | Home 下副本、抽字与 job；不直接写项目 Goal/Artifact，原文件不动 | 保留暖纸阅读面、文件类型 glyph 与自然让位的 hover。把选中材料的适用动作放手边，运行与结果沿同一材料链展示。Shell 语法统一，阅读材料保持性格，不为统一而抹平信息差异 |
| **Sessions** | 哪段工作在哪个 Runtime、能不能恢复、怎样继续或交接？目录 → 内容/运行记录 → 关系编辑/恢复/Handoff | Private Work Context 管 Session 与私有上下文，Ledger 管关联，Runtime Host 管进程。Project/Goal/native Session ID 各有语义；准备交接不等于发送成功 | 行内显示“Runtime + 当前 Goal + 最近结果/等待原因”；详情先显示恢复位置和可读能力，原始记录后置。交接预览明确“带走什么、去哪里、会产生新会话”，关联编辑保留原现场 |
| **Coding** | 我开的这轮执行在做什么、等我什么、改了什么？目录有 Session/TaskBoard/目标/产物/文件面；工作台为对话+工具区 | Coding 管会话/本轮产物；执行与审批属于 Agent Host，模型凭据属于 Host，Workspace 由宿主授权。当前 C12/C13 未完成 | 作为深工作模式：中间对话/执行流，右侧结果、diff、浏览器/终端按需出现；“等你回答”“等你审查”“需要核对结果”必须可区分。模型/角色、工作目录、批准范围显示在真实发起处。不要做没有计划数据的热闹 TaskBoard |
| **Schedule** | 到点会做什么、下次什么时候、上次有没有结果？对话任务/其他插件闹钟、创建/暂停、任务对话 | Scheduler 管持久叫醒技术状态；Schedule 插件管对话任务；本地服务未开不会响。不是团队共享日历，也未接 Jelly | 以“下一次 → 做什么 → 最近结果”为列表三条稳定列轨，日历只是可选视图。清楚区别对话任务与插件闹钟。结果直接回到该任务的对话，不将失败静默显示为“已执行” |
| **Functions** | 怎样把重复判断写下来、试清楚、让现场复用？新建判断→看什么/用在哪→规则/样例→试跑→发布 | Functions Module 管函数库与判断记录；Host 注入 TypeSafe；不拥有 Goal/Artifact；场景自己的开关仍归场景 | 用真实输入和选择结果组成左右对照试验台；“草稿/已发布版本/本次试跑”分清。展示被哪些场景使用，跳回现场配置；函数 key 等技术字段后置，避免整个页面像后台表单 |
| **创作插件** | Pages、Forms、Dataset、PPT、灵光各有内容创建和编辑流程 | 本机文档/问卷/表格/演示稿/灵感；SSOT 标明若干 AI 生成是 stub，PPT 导出 JSON 而非 PPTX | 保留各自真正的创作工作面，统一导航、标题、保存、空态、版本和动作语法。AI stub 不演示成“已生成可交付 PPTX”，灵感也不静默变为已确认 Goal |
| **插件与设置** | 哪些能力可用、属于哪个范围、为什么某项不能用？市场/项目启用；全局独立设置、项目独立设置 | Manifest 驱动入口；个人插件总是可用，项目插件按项目启用。Host 管模型/凭据/Runtime 接入与全局 MCP，插件只管本插件设置 | 市场突出用途、能力条件、已安装/启用与个人/项目范围。设置为独立文档，分类轨+约 760px 内容栏，显式保存与即时偏好分开；返回恢复原工作标签、表单与滚动位置 |

## 3. 必须保留的真实行为

- **定位 → 看清事实 → 下一步。** 第一个可见问题不应是协议、数据库路径、Run ID 或日志。
- **打开不执行。** 打开 Goal 不启动 Runtime；看 Session 不改关联；填入终端和实际发送不同；用户批准不能由 Runtime 自填身份。
- **完成必须有语义。** 普通支持报告不会自动完成；父 Goal 子项都完成也不自动证明整合完成。UI 不用进度环替代真实要求、当前阻塞、真人结论。
- **读与处置不同。** Feed 已读不等于有去向；Inbox 处理不等于其 Goal 完成；Artifact 发布不等于用户验收。
- **关系与来源不能丢。** 输入、产物、原始消息、会话与具体版本可回溯；返回原现场保留选中、滚动、标签、草稿和 Runtime 身份。
- **本机与项目作用域清楚。** Shelf/Functions/若干创作插件为个人能力；项目事实不可跨项目借用。Session 私人内容不自动发布给未来团队。
- **失败可恢复。** 在途防重复、失败保留草稿、重试不重复成功步骤、部分成功说清楚；取消返回入口并还焦点。
- **高密度有可读底线。** Desktop 28px 控件/列表和约 32px tab bar 是当前参考，窄屏与触控 44px；移动输入 16px；正文不被密度压成小字。
- **外壳一屏，内部滚动。** 1024×400 低窗口也能到达动作；窄屏先看当前 pane，保留布局再切换，不让 3 栏一起缩小。

## 4. 可以继承、可以重做与应当延后

**当前必须继承**：事实 owner 与授权语义、状态文字、连续工作面、可恢复导航、键盘路径、明确作用域、共享控件状态、浅深主题、减少动态效果、来源和精确版本。

**值得重新设计**：插件轨的发现性与分组、母页和详情的关系、Home 的注意力组织、Goal 的事实与证据阅读、跨对象回链、列表列轨、颜色分工、tab 的信息负担。用户本轮允许挑战旧视觉规格，因此 48px/240px、全站字重 400、冷锌/靛配色是可讨论的表达决定；不能把这些历史数值视为不可触碰的产品行为。

**应当延后**：新增团队权限/实时同步、多人在线与分派、自动 Agent 调度、Jelly/外部日历写入、统一自动化平台、新的持久 Action 对象。这些都改变领域能力与验收，不能当成 UI 升级顺手补上。

**应当删除的复杂度**：概览大数字、装饰性完成图表、同一事实多处可写、为了“眼前一亮”强加的全局 Chat、每个插件一套按钮和动效、所有内容初始同时展开、没有实际作用的空白目录、无数据来源的 TaskBoard。

## 5. 从审计落到本轮 Demo

使用一组明确标为**演示数据**的“改进 Molis 官网报名体验”内容，复用同一批对象。下列是与最终[主方案](proposal.md)对齐的探索范围，不改变前文对当前生产实现的静态审计结论。

1. **Home 到变化判断**：首页恢复上次文稿，同时呈现一条尚未采纳的反馈。`#change` 对照当前与候选要求，明确只影响首页参与按钮和加入指引，五类导航保留；采用与留到下轮产生不同的本地状态。
2. **变化判断到 Pages**：采用后进入 `#writing` 原稿的相关段落，携带新的写作依据，但不自动改写内容。草稿可保存与恢复；正式交回一版才生成可审阅的本地成果。
3. **成果到审阅、再回原稿**：`#workreview` 对照上版和本版，意见输入紧邻所选段落；已阅和返工意见绑定具体版本。回稿修订后形成新版，保留旧版与旧意见。
4. **状态返回首页与目标**：待审、返工、未提交草稿改变继续入口。没有可执行对象的手机验收项安静保留，不作为持续催促；已阅不完成 Goal。
5. **资料的不同用途**：Feed 保存回项目资料，阅读与去向分开；个人 Shelf 保留原件，演示处理副本，不自动进入项目。两者统一控件与返回工艺，保留各自的工作目的。
6. **其他模块与共用工艺**：保留 Sessions 接续预览、Schedule 固定样张、Functions 固定试跑和专业应用设计说明；不把它们列为已实现的完整生产链。搜索、创建、取消、失败保留输入、浅深色及窄／矮窗口的实际检查见[验证记录](verification.md)，分屏与原生输入法仍待后续验证。

本轮把 **“依据带”** 落到变化、写作和审阅中的可操作关系：选择会影响写作依据，交回形成固定版本，意见定位具体内容。静态关联行只作辅助；生产能否无损组合这些关系仍须核对现有 Contract，不另建业务状态。

另一个候选是 **“回到刚才”**：跨插件打开引用时保留一个安静的来源锚点，明确返回原 Goal/消息/Session，而不是让用户在 tab 森林里找路。现有历史与多 pane 状态可以作为实现基础；不必新增统一工作流引擎。

## 6. 资源、启动方式和可复用实现

当前栈是 TypeScript 输出 HTML Slot，不是 React SPA。独立 Demo 可用 HTML/CSS/JS；若后续进产品，仍应接现有 `mw-*` 原语与 owner 贡献，不为概念稿先迁框架。

| 资源 | 当前路径/使用方法 |
| --- | --- |
| 字体 | `packages/design-system/fonts/inter-latin-variable.woff2`、`noto-sans-sc-400.woff2`，本地服务公开 `/assets/inter-latin-variable.woff2`、`/assets/noto-sans-sc-400.woff2` |
| 字体规则 | `packages/design-system/src/typeface.ts`；Inter 开启 cv01/ss03/calt，Noto Sans SC 400；当前尾部 `html body * { font-weight:400 !important }` 会覆盖局部粗体，生产新字重须显式调整共享层 |
| 图标 | `packages/design-system/src/icons.ts` 从 `lucide` 取 IconNode；生产从 `@molis-ai/molis-work-design-system` 导入 `icon()`、`renderIconSprite()`，可 `<use href="#icon-name">` |
| 色板与主题 | `src/palette.ts`、`src/styles/interaction-texture.ts`、`src/visual-foundation.ts`；冷壳与 Shelf 暖内容是两种表面，不是两套完整皮肤 |
| 控件 | `packages/design-system/src/primitives/`、`src/styles/primitives.ts`、`src/primitives/catalog.ts`；Catalog `/__ui/catalog` |
| 页面资源装配 | `apps/workbench/src/page-assets.ts`，原语/微动效/Typeface 放在尾部，覆盖顺序是生产改造的重要约束 |
| Shell/插件入口 | `apps/workbench/src/immersive-shell.ts`、`plugin-catalog.ts`；Manifest 驱动，不应在 Shell 写死新插件 |
| 当前母页/连续阅读 | `apps/workbench/src/styles/plugin-stage.ts`、`surface-language.ts`、`linear-density.ts`、`tab-workspace.ts` |

已有开发入口（本审计未执行构建/启动）：

```bash
# 包源码改完须先编入 dist；产物和服务不直接读取所有源码
pnpm build

# 单独设计系统构建
./node_modules/.bin/tsc -p packages/design-system

# 独立数据的预览；端口必须先检查空闲
node dist/cli/main.js demo create --home /tmp/molis-ui-renewal-preview --confirm --json
node dist/web/server.js --home /tmp/molis-ui-renewal-preview --port 4182
```

仓库 README 也给出 `node --import tsx apps/desktop/launchers/web/server.ts --port 4182 --home "$HOME/.molis-work"` 的开发入口。该命令使用真实 Home；本次设计 Demo 应优先使用独立静态预览或隔离 Home，不复用用户数据库。

本轮只读 `lsof` 与 `ps` 确认：

- `127.0.0.1:4173`：`~/.molis-work/releases/molis-work-0.2.0/dist/web/server.js --home ~/.molis-work`，用户已安装版本，未动。
- `127.0.0.1:4199`：`node dist/web/server.js --home /tmp/molis-functions-preview-data-3acd20a --port 4199`，已有隔离预览，未动。
- `127.0.0.1:4186`：另一个 Content Growth Studio 工作树服务，非本任务。

端口状态只代表审计时刻，不是可持久假设。独立 Demo 不需要对既有服务、真实账号或项目做写入。

## 7. 证据与验收边界

- 仓库边界：当前分支 `codex/ui-visual-renewal`；用户的 `docs/design/taste.md` 为未跟踪文件，本审计只读且未改动。
- 已完成：产品/视觉材料阅读、关键源码入口核对、owner 与状态边界整理、资源/进程只读核验。
- 未完成：当前所有产品页面的视觉实操、外部 Runtime 执行、团队协作、正式 Coding 全流程、原生输入法/VoiceOver/硬件表现；均不能从本审计推断已验。
- 概念 Demo 的下一阶段标准：按一条完整工作动线点通，观察真实内容布局、悬停/焦点/返回/失败与窄屏；演示成功只证明提案的交互表达，不能证明生产领域接线或用户验收。

### 主要依据

- 产品与边界：`PRODUCT.md`、`docs/SSOT-MATRIX.md`、`docs/cli-and-development.md`。
- 品味与工艺：`DESIGN.md`、`docs/design/taste.md`、`packages/design-system/README.md`、`specs/ui-craft-floor/spec.md`、`specs/product-interaction-redesign/{spec,inventory}.md`。
- Goal：`plugins/native/goals/src/event-document-ui.ts`、`modules/goals/src/event-state-completion.ts`、`apps/cli/src/command-dispatch.ts`。
- Shell/Home：`apps/workbench/src/{immersive-shell,plugin-catalog,project-home,home-flow,page-assets}.ts`、`scripts/client/project-home.ts`。
- 插件：各 `plugins/native/*/README.md`，Inbox/Feed/Schedule/Functions/Coding 的 `src/ui.ts`，`apps/local-host/src/coding-surface.ts`，`specs/coding-plugin/spec.md`。
