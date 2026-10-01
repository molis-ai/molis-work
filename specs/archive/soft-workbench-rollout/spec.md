# Soft Workbench 正式升级

> 归档（2026-10-01，合入后梳理）：判定为**已实现**。#101 合 main；待用户验收；原生 macOS 包与胶囊、OAuth 授权成功态未验。剩余事项已移到[统一待办清单](../../BACKLOG.md)：BL-008。

状态：已完成本地升级与验证（2026-09-28），待用户验收；未提交、未发布。任务书：`docs/prompts/soft-workbench-ui-upgrade.md`。视觉基准：`docs/design/soft-workbench/` 原型（用户已认可）。原型自己的需求仍在 `specs/archive/soft-workbench-ui/spec.md`，那是原型验收，不是本次正式验收。迁移清单：同目录 [inventory.md](inventory.md)。

## 目标

把用户认可的 Soft Workbench 方向落进正式产品的全部界面：珍珠灰桌面、连续白色工作面、石墨主操作、铜色焦点与链接、400/500/600 字重层次、柔和浮层阴影、130/250/420ms 的反馈节奏，以及横向小窗的 Onboarding。底部统一对话栏与菜单栏保留为唯一全局入口。已有功能、数据、契约和入口不减。

## 范围

全部存量插件与页面，见 inventory.md。包括：项目目录、项目首页、底栏（Dock 菜单、常驻插件、插件切换、Assistant、Shelf/灵光、项目讨论、项目与账户菜单）、全局搜索、标题栏标签与分屏、全局设置与项目设置（含插件贡献的设置页）、能力服务、插件市场、25 个内置插件、6 个官方集成的设置与授权界面、群聊（im-ui）、桌面胶囊、Onboarding（首次、新项目、更新）、组件板、生成插件的渲染器与已安装生成插件。

不在范围：与 UI 无关的架构重构、新业务功能、对外发布、替换用户已安装的应用。

## 关键冲突与处理

| 冲突 | 处理 |
| --- | --- |
| `typeface.ts` 的 `html body * { font-weight: 400 !important; }` 压平全部字重 | 删除。基础层定义字重角色：正文 400，控件与条目 500，标题 600。`strong`/`b`/`th` 不再走浏览器默认 700 |
| 旧 README/DESIGN.md「一律纯色，不用渐变」「字重默认 400」「焦点只用内侧 1px ink」 | 改写为新规范：业务表面仍然纯色，冷暖柔光只用于 Onboarding；焦点改为 2px 铜色描边（偏移 1px），字段是铜色边框加 3px 铜色光晕 |
| 字体：Inter Variable + 仅 400 的 Noto Sans SC | 改为系统无衬线（`-apple-system` / SF / PingFang SC / Hiragino / 微软雅黑），Inter Variable 作为非 Apple 平台拉丁后备，Noto Sans SC 400 只作最后的离线中文后备，避免对它做伪粗体。等宽保持原栈 |
| 壳层是「锌灰桌面 + 1px 发丝线纸页」 | 改为珍珠灰桌面 + 圆角 14 的连续白色工作面，工作面用极轻的柔影而不是描边；目录列进入工作面内部（原型的分栏关系） |
| 底栏 48px、控件各自带线框 | 按原型：76px 高（手机两行 116px），Dock 按钮 38px/圆角 11，当前项白底 + 柔影 + 3px 铜色小点；Assistant 输入是 50px 高的白色抬升条，圆角 15 |
| 强调色是靛蓝（`--blue`/`--focus`/进行中） | 强调色改为铜色（原型 `copper`）：链接、焦点、选中细节、进行中。`--blue*` 作为既有 token 名保留，值指向铜色系，避免 273 处消费者改名 |
| 动效 token 110/140/220/320ms | 改为 130（按压与悬停）/ 250（状态）/ 420（到达）/ 640（时刻）；Onboarding 步骤按方向 480ms 进入（带轻微模糊），减少动态效果时不动 |

不通过新增 `!important` 或插件私写覆盖来对抗旧规则：token 在 `palette.ts` 一处改值；终层 `craft-finish.ts` 就地改写为 Soft Workbench 终层（模块名保留，避免无意义改名）；与新方向冲突的旧规则在原位置删除或改写。

## 设计系统落点

- `packages/design-system/src/palette.ts`：`renderShellTokens(theme)`（面、字色、状态、阴影、遮罩）、`renderShapeTokens()`（圆角、焦点、动效，可在后层重复声明）、`renderControlMetrics()`（控件高度，只在早层声明，让紧凑 28 / 触控 44 规则能赢）；旧 `renderLinearShellTokens` 删除。新增 `--desk`、`--surface-soft`、`--wash`、`--accent*`、`--action-hover`、`--shadow-*`；`--plugin-*` 全部指向 `--ink-soft`；`--content-*`（Shelf 阅读面）改为别名。
- `packages/design-system/src/typeface.ts`：系统字体栈与字重角色，删除 400 强制。
- `packages/design-system/src/styles/craft-finish.ts`：终层——桌面与工作面、底栏、目录列、控件形态、浮层阴影、动效、减少动态效果。
- `packages/design-system/src/styles/primitives.ts` / `coss-controls.ts` / `interaction-texture.ts`：按钮、字段、分段、菜单、对话框等共享控件的圆角、高度、字重与状态。
- `apps/workbench/src/styles/context-onboarding.ts` + `context-onboarding-renderer.ts` + `scripts/context-onboarding.ts`：Onboarding 新窗口；旧 `packages/design-system/src/onboarding-styles.ts` 删除。英文见 `apps/workbench/src/i18n/onboarding-en.ts`。
- `packages/design-system/src/primitives/catalog.ts`：组件板补齐组件与组合。
- `packages/design-system/src/plugin-components.ts`：生成插件组件，存量生成插件经共享渲染器获得新外观。

## Onboarding

正式步骤以现有能力为准：

- 首次使用（`first_run`）与新项目（`new_project`）：真实流程是「从已有工作开始」——选择来源 → 授权与预览 → 整理与采用（建项目），另有空白开始、连接文字模型、Gmail OAuth、失败重试与恢复。外观、语言是已有的本地偏好（主题/密度/语言），作为前置步骤接入真实偏好接口；不虚构 Runtime 连接或通知授权。
- 更新（`update`）：保留一页说明 + 继续。
- 视觉：横向小窗、左侧问题与选项、右侧联动的小型预览、石墨选中 + 勾、短线进度、暖冷柔光、方向性转场；完成后进入工作台。老用户已完成的引导状态（`config/onboarding.json`、journey 存储）不重置。

## 功能基线

改版前在 `main@8b609527` 构建、以演示项目为数据截图 27 个界面（scratchpad `shots-base/`），并以同一提交跑全量回归作为失败基线。任何入口、快捷键、深链接、Action、权限确认、数据与偏好都不删。视觉断言调整须引用本需求对应条目。

## 验证

- 工程：`pnpm build`、`pnpm typecheck`、`pnpm boundary:check`、`pnpm test:run`，与基线比对新增失败。
- 功能：清单中每个插件/页面的主要行为与状态，走真实代码路径和隔离 Home 数据。
- 体验：1440×1000、1422×800、1024×768、390×844，浅色/深色，标准/紧凑，中文/英文；组件板实际操作；减少动态效果。
- 首次与再次使用：新 Home 走完 Onboarding；已有 Home 进入升级版本不被强制重走。

## 实现中定下的口径

- **面的语义：** `--page`/`--desk`/`--nav-bg` 都是桌面色（标题栏、底栏、独立设置页底色）；`--paper`/`--surface`/`--canvas` 是工作面白（`--canvas` 用于工作面内的全幅画布）；工作面内的目录列、窗格标签条、内层块用 `--surface-soft`；局部分组、只读字段、次按钮静止态用 `--rail`。曾把 `--nav-bg` 改成近白，手机标题栏出现灰块，已退回并把面板内消费者迁到 `--surface-soft`/`--rail`。
- **字重：** 删除全局 400 强制后，按选择器角色用 codemod 把 450/550/560/620/650/700 等收敛到 400/500/600（标题 600、控件与条目 500、正文 400），压缩写法的 CSS 也覆盖到。
- **插件身份色：** 全部中性化，插件靠图标、名字和位置识别；`MW_PLUGINS[].hue` 只作组件板数据。
- **Shelf：** 保留 DropAgent 的结构与手感，颜色经 `--da-*` 别名到共享 token（石墨主操作、铜色焦点/链接/开启态）。
- **插件创作台：** 315 处写死颜色按色相与 CSS 属性映射到 token，之后逐条复核了低彩度深色被误判为铜色的几处（正文墨色、灰色边框、灰色悬停）。
- **旧的 `!important` 皮肤：** quiet-paper / calm-desktop 里主按钮与危险按钮的 `!important` 覆盖在原位删除，按钮状态由 `mw-*` 原语决定；`.tree-create` 等 Coss 层的 `!important` 描边块改为无 `!important` 的浅洗底。
- **组件板：** `/__ui/catalog` 新增「空间 · 层次 · 动效」「选项」「组合」；`/__ui/catalog/bar` 用生产的 `renderWorkbenchBar` 等渲染真实底栏。

第二轮（用户验看后要求「首页、目标、信息流按原型的版式做到位，并扩展到所有插件」，并授权按推荐方案直接做）：

- **项目首页：** 换成原型的版式——「今天的工作」标题与一行日期问候、横向七日条、「正在推进」的 Goal 卡、当天事件原位展开、右侧 252px 边栏（随手记 + 回到手边的内容）。随手记只存在本浏览器（`localStorage`），界面上写明；事件不自动展开，离开首页即收起。
- **目标：** Goal 先以文档（概览）打开，终端在头部一个开关之外。有终端会话的 Goal 默认进终端，否则进概览；从未选过视图的 Goal 在出现终端会话时跟随一次；选择按 Goal 记住。表单与阅读器在文档视图里铺满文档区（矮窗口下页脚也在可见范围）。窄列表的 Goal 条目改为两行。
- **信息流：** 换成原型的「文章列 + 阅读页」。来源从常驻左栏收进列顶的来源菜单（数量与状态都在菜单里，状态有图标不只靠颜色）；按来源分组的折叠改成一条时间线，每行仍写明来源并带 `data-feed-entry-task`，选中来源就只显示它的消息；新增「全部 · 未读 · 已保存」（已保存 = saved 去向），原有来源 / 类型 / 时间 / 状态 / 排序筛选全部保留在搜索框内的菜单。阅读页不自动打开第一条（打开即记已读）。钉住旧分组结构的断言（渲染与 e2e）按此改为验证归属、数量、空来源、状态标记与来源筛选，逐条写了依据。
- **插件列表页（所有共用 plugin-stage 的插件，以及 Sessions）：** 标题取自各面自身的 label（经 `--stage-title` 写在外壳上，插件重绘列表也不丢；只作画出的文字，读屏仍以标签页与面名称为准），居中 960px 一栏，第一个新建动作是本页唯一的石墨按钮，行高至少 44px，分组读作安静的小节标题；打开条目后列表变成 `--surface-soft` 侧栏、新建动作回到浅洗底。单表单编辑器居中（Forms 52rem、Dataset 72rem），灵光改为写作页（46rem 一栏、24px 文档标题、15px 正文、悬停洗底 + 共享焦点环）。嵌套在插件自己列表里的空状态（实验、炼金术士、Cognia）也居中。
- **问卷提示色：** `.form-note` 默认从完成绿改为静音色——「请先配置可用的文字模型」「发布状态保存在本机」都不是成功反馈。
- **打开工作区：** Goal 框里的「打开工作区」是明确要终端的动作，进终端并记为该 Goal 的视图（回归发现：新默认会把它落在概览）。
- **首页空日期：** 任何没有事件的日期都保留「从这里开始」的入口；不是今天时，另写「这一天还没有事件」并给「回到今天」（回归发现：只给回到今天等于拿掉了创建入口）。
- **披露控件：** Artifacts 的原始数据折叠、Coding 的来源与检查点折叠并入共享的 chevron 语法，不再露出系统三角。
- **标题语言：** 列表页标题经 `L()` 取界面语言（实验、炼金术士的面名写死中文，英文界面下曾显示中文）。

第三轮 · 视觉精修（用户要求在图标、配色、动效、视觉四方面按成熟商业产品的完成度精修全部页面与插件，取舍按推荐直接做）。自查清单与发现—修复记录在 `visual-refinement-checklist.md`；规则由 `tests/soft-workbench-refinement.test.ts` 守住。

- **图标：** 仍只用 Lucide（24 栅格、线性）。尺寸只用 12/14/16/20（`--icon-xs`…`--icon-lg`）；描边 16px 及以下为 2、20px 及以上为 1.6（`foundation.ts` 的 `svg` 默认 2，20px 图标由 codemod 写 1.6）。每个插件一个图标，`PLUGIN_ICON`（`packages/design-system/src/icons.ts`）是唯一来源，测试核对它与各 Manifest 一致且互不重复。改动两处：PPT 从 `image`（与图片插件重复）换成 `presentation`；实验从 `sparkles`（与 AI/助理标记重复）换成 `flask`。Cognia 仍是 `book`（已是 BookOpen）。
- **状态图标：** `STATUS_ICON` 固定七个：待办 Circle、进行中 CirclePlay、等待 CircleEllipsis、需要你 CircleUserRound、受阻 Ban、完成 CheckCircle2、取消 CircleX。Goals 的状态映射与 Agent Review 的取消都改用它；状态从不只靠颜色。
- **空状态插图：** 统一成原型的「抽象纸张」——`.mw-empty__mark`（以及 `.tui-empty-mark`、`.coding-start-mark`）画两张错开的纸（后一张 `--surface-soft` 转 9°、前一张 `--popover` 带三条墨线转 −4°），中间 20px 线性图标。原先裸露的空图标（Agent Review、Coding 受阻、Schedule 计时器）都收进这个标记。
- **插件图标淡色底：** 评估了低饱和色相底（对比图 `.impeccable/review/soft-workbench-rollout/refine-tint-market.jpg`、`refine-tint-home.jpg`），**不采用**。原因：一屏里同时出现 6–20 个插件图标，每个带色底后彩色面积远超「颜色要少」的约束，且会和状态色、铜色焦点争注意力；原型本身也是中性底。插件继续靠图标、名字和位置识别。
- **颜色：** 石墨 = 主操作，铜色 = 焦点、链接、进行中。去掉的残留：写死十六进制（110 处阴影改 `--lift-1/2/3`、21 处遮罩改 `--scrim`、onboarding `--ob-*` 改为派生自壳 token、终端选区、头像、设置页品牌块、搜索高亮、桌面标题栏）；蓝/靛色（`#3b82f6`、`#5e6ad2` 等回退值）；浏览器默认（`accent-color`、`caret-color`、`::selection`、`mark`、`::placeholder`、自动填充底色都接 token；`a:visited` 不强制继承，以免吃掉铜色链接）。插件分类色（Functions、Workflows 的 kind 标签、`plugin-stage-kind`）改中性，只有状态保留状态色。Jelly 的 `toneColors` 与 `--hue-*` 调色板是用户挑的分类色、存进数据的标识，**保留**并加注释。
- **对比度：** 浅色 `--muted #636569`、`--faint #6a6c70`、`--accent #93604b`、`--green #42775d`；深色 `--faint #979693`——正文与辅助文字在各自底色上都 ≥4.5:1（深浅色分别核算）。`--on-accent #fff` 用于铜色/石墨底上的文字。
- **状态梯度：** 悬停 / 选中 / 按下统一走 `--nav-hover`、`--nav-active`、`--nav-press`（codemod 改了 78 + 17 + 2 处各自写的混色）。
- **深色三层：** 桌面 `--desk` → 工作面 `--paper` → 浮层 `--popover #2c2d31`（菜单、弹出层、筛选面板、对话框、侧板、Assistant 面板、首页「说一句」都用它），层与层之间用 `--lift-3` 里的 1px 亮边而不是更重的投影（投影在深色里看不见，只会发脏）。浮层两种主题下都不描边。
- **动效：** 时长只用 130/250/420/640（`--dur-press`与`--dur-hover` 130、`--dur-move` 250、`--dur-arrive` 420、`--dur-moment` 640），曲线只用 `--ease-quint` 与 `--ease-spring`；旧名 `--ease-swift`/`--ease-out`/`--ease-standard`/`--ease-settle` 作为别名保留，避免第三方插件样式失效。只在真实状态变化时动：首次进入的列表级联（最多 12 行）经 `.is-arriving` 触发，刷新、重绘、切回都不重放；`details`/首页事件行只在用户刚打开时 `data-just-opened` 上浮。去掉了 26 个装饰性循环，只留加载指示（`mw-spin`、`capsule-spin`、`as-spin`、`coding-spin`、导航进度条）。只动 `transform`/`opacity`（24 处布局属性过渡已剪掉；首页快捷行悬停改为洗底而不是缩进）。对话框与侧栏的退出用 `transition … allow-discrete`，不拦输入。`prefers-reduced-motion` 下过渡与动画都停，状态与焦点照常变化。组件板「动效」一节有 12 个可点的样例。
- **空状态与失败：** 页面级空状态一律用纸张插图（本轮补了炼金术士、Cognia、项目目录、Goal 画布）；设置里的小节空态与 Assistant 面板保持一行字，不放大图。列表读不到时在列表位置显示原因和「重试」（Forms、Dataset、PPT、Pages、灵光、实验、角色的内置角色区；Goals 的工作规划 / 工作规则、设置分区、规划方法详情同理），不再只把错误写进看不见的编辑区。列表页里空状态重复页头的新建时降为次按钮，保证一页只有一个石墨主操作。
- **页头：** 插件市场补上一句说明、标题 24px，与列表页一致；其余非列表页（首页、目标文档、信息流、设置、能力、项目目录）按原型各自的页头。
- **加载：** 一条规则——已知结构的内容（列表、卡片）用骨架；未知结构或一次性等待用 `.mw-loading`（250ms 后才出现的小转圈 + 一句话，减少动态效果时不转）。Workflows、Cognia、炼金术士、信息流、首页、设置页四处、Goal 画布的加载都换成它。
- **字号：** 阶梯 11/12/13/15/17/20/24/30，字重 400/500/600，不用随窗口变化的 `clamp()` / `vw` 字号（22 处旧规则换成固定值）。例外写死在测试里：手机表单控件保留 16px（iOS 不缩放），30px 以上只给内容本身（Pages 文档标题、Onboarding 的问候词）。每页最多 4 档，实测逐页核对后收敛：首页、信息流、设置导航分组、项目卡类型的 11px → 12px；Goal 文档的小节与时间线标题 15px → 13px 半粗；信息流阅读标题 30px → 24px；能力页空状态标题 17px → 15px；项目索引标题 `clamp(27–34px)` → 30px；角色列表状态的浏览器默认 `small`（10.8px）→ 12px。
- **间距与形状：** 间距只用 4/8/12/16/24/32/48；1px 发丝线、2px 焦点环偏移与更大的 4 的倍数（如 56、64）视为合规。阴影三级 `--lift-1/2/3`：小的抬起（当前标签、分段滑块）用 1，组合器与内层面板用 2，所有浮层（菜单、弹出层、筛选面板、对话框、侧板、命令面板）用 3——阴影 codemod 曾把几处浮层映射成 1，已逐条改回 3。浮层两种主题下都不描边。
- **底栏组合器：** ≤1100px 先压缩（间距 4px、目标 ≤96px、执行者 ≤72px）；≤860px（且 ≥601px）输入框旁只留一个选择器，沿用 main 手机底栏的规则：Character 或执行者选定后、或助理面板打开时才出现，未选的不占位（面板里仍可选，不丢入口）。选择器是安静的幽灵控件（无描边、悬停 `--nav-hover`）。这样 1024 以下输入框仍有可用宽度。
- **焦点：** 控件（按钮、摘要、原生小字段）用 2px 铜色描边；字段式控件（`mw-input`、`mw-textarea`、`mw-select` 触发器）用整铜色边框加 16% 光晕，不再叠加描边。两种都 ≥ 3:1。
- **减少动态效果 / 自动化：** 过渡时长为 0s（不是 1ms），状态一变尺寸就到位；自动化（`navigator.webdriver`）下同样不过渡，截图与测试读到的就是最终值。
- **矮屏写作：** ≤560px 高时，打开 Goal 记录表单底栏让开（现在手机宽度也适用）；≤640px 高时终端视图的侧栏整列可滚，时间线至少 240px。Goal 文档视图由侧栏整页滚动。
- **Goals 列表行：** 标准密度 34px 一行，紧凑 28px（第二轮定的，本轮核对后保留）。
- **信息流极矮分屏：** 容器 ≤420px 高时页头收紧、条目一行，入口不变。
- **手机底栏：** 第二行的目标都是 40px，间距 4px（分隔线居中），这样有目录的插件多出一个目录按钮时（最宽的状态）也放得下 390px；目录抽屉打开时只显示「收起目录」，关着时只显示「展开目录」。

## 开放问题

- 原生桌面（Tauri）壳：本机可构建时验证；否则只报告 Web 验证，不冒充原生通过。
- 外部账号相关（Gmail/Notion/GitHub OAuth）：无测试账号时只验证未连接、失败、重试等可达状态。

## 验证结果（2026-09-28）

- 工程：`pnpm build`、`tsc --noEmit`（主工程与 SDK）、`pnpm workspace:typecheck`、`pnpm boundary:check` 全部通过。
- 回归：基线（未改的 main@8b609527）全量 90 项失败。改版后第一次全量发现的新增失败全部查清：钉旧视觉的断言按本规范更新（每条写明依据）；三处真回归已修（手机底栏搜索被隐藏、项目圆钮不足 40px、矮窗口底栏盖住记录菜单）。第二次全量：2877 通过，93 项失败，其中 89 项与基线相同，另有 1 项基线失败被修好（英文文案覆盖）；新出现的 4 项里 3 项单独重跑通过（与截图并行时的负载抖动），1 项（Goal Frame 下分屏）在未改的基线上单独跑同样时过时不过（基线 5 次失败 3 次），属既有不稳定测试。
- 体验：`.impeccable/review/soft-workbench-rollout/` 下 141 张真实界面截图——1440×1000、1422×800、390×844、1024×400，浅/深色，标准/紧凑，中/英，长文本，减少动态效果；首次使用在空 Home 上从语言一路走到建好项目；老用户走「新项目」与「更新」两条路，不被强制重走语言与外观。
- 生成插件：演示 Home 里没有已安装的生成插件，用真实渲染器（`plugin-component-client` + 组件样式 + 设置页样式）渲染了一个代表性插件截图；未在 Home 里真实安装一个。
- 未验证：原生 macOS 包与桌面胶囊（本机未构建原生包）；Gmail 等 OAuth 的授权成功态（没有测试账号）。

## 验证结果（第二轮，2026-09-29）

- 工程：`pnpm build` 通过。
- 回归：全量 3005 项，2902 通过、95 失败、1 取消。对照基线 90 项：基线里的「静态标签都有英文」这次通过；新出现的 7 项逐条查清——2 项是真回归并已修（「打开工作区」落在概览、首页非今天的空日期拿掉了创建入口），修后单跑通过；4 项单跑通过（dense-workspace、关系 HTTP、两项设置导航，都是全量负载下的超时）；1 项是基线上本来就时过时不过的「Goal Frame 下分屏」。第一次全量在第 165 项时整批被取消（进程收到信号退出，与代码无关），重跑完整。
- 钉旧版式的断言按本轮设计更新并写明依据：Feed 渲染与 e2e（按来源分组 → 时间线 + 来源菜单，验证归属、数量、空来源、状态标记与来源筛选）、目录 e2e 的 Feed 行（单行 28px → 阅读卡片）、首页滚动容器（`.home-tl` → `[data-home-scroll]`）。
- 截图：第一轮的证据按新构建整套重拍，另加第二轮的新状态（Goal 概览 / 终端、Goal 表单在 1440 与 1024×400、Feed 来源菜单 / 单个来源 / 来源设置 / 已保存为空 / 800 宽、Sessions 打开、深色 Inbox、Form / Dataset / 灵光编辑器、390 的 Forms）；README 的首页、目标、信息流图同步重拍。


## 验证结果（第三轮 · 视觉精修，2026-09-29）

- 同步：工作树先快进到 main 22f383cb（#96 之后），再做本轮；基线改用这个提交的全量结果（3155 项，9 失败 + 1 取消，清单见下）。
- 守护：`tests/soft-workbench-refinement.test.ts` 7 项全过——插件图标与 Manifest 一致且唯一、状态图标唯一、只用 4 档时长 2 条曲线、不过渡布局属性、只有加载在转、字号在阶梯上且无 `clamp`/`vw`、浏览器默认与遮罩走 token、界面 CSS 无系统蓝/靛。
- 实测：28 个页面逐页读可见文字字号（每页 ≤ 4 档）与图标—文字中线（0 处错位）；逐页数石墨主按钮（每页 ≤ 1 个）；深色下打开菜单、插件切换、对话框读计算样式（底色 `--popover`、无描边、1px 亮边）；Forms / Pages / 灵光 / 实验的列表请求在真实页面上强制 503，四处都在列表位置显示原因与「重试」，恢复后重试成功；手机宽度下逐个插件与项目设置检查底栏按钮互不重叠。
- 截图：每个页面精修前后对比 `refine-<页面>.jpg`（28 张，上排精修前、下排精修后，1440 浅色 / 1440 深色 / 390），组件板 `refine-catalog-icons.jpg`、`refine-catalog-motion.jpg`，列表失败与重试 `refine-error-form*.jpg`，淡色底对比 `refine-tint-*.jpg`；前两轮的证据集（1422×800、紧凑、英文、长文本、减少动态效果、首次使用）按本轮构建整套重拍；README 的图同步重拍。
- 回归（最终，2026-09-29）：`pnpm build` 通过；全量 3162 项，3150 通过、5 失败。对照 main 22f383cb 的基线（9 失败 + 1 取消）：其中 4 项在基线上同样失败（Goal Frame 下分屏、产品旅程、UI 审计、面板内打开关联 Goal）；基线的 6 项这次通过；唯一的「新」失败是钥匙串重试（`lazy credentials preserve their Home…`），单独重跑 3 次全过，第一次全量里同一文件也因钥匙串超时失败过，本轮没有碰这部分代码。第一次全量发现的 19 项新增失败全部查清：真问题在代码里修掉（Goal 文档视图滚不动、矮屏记录菜单被挤出、减少动态效果下尺寸晚一拍、字段焦点对比度与双重指示、Dataset 列名宽度、标题栏右缘、触屏下拉字号、插件创作台画板、Sessions 筛选菜单溢出、信息流极矮分屏），其余是钉旧视觉的断言或负载下的超时（单跑通过）。
- 本轮按新规范改过的断言（每条在测试里写了依据）：`capsule`、`shelf-plugin.e2e`（铜色值）；`chrome-inner-scroll`、`desktop-tui`、`project-index-arrival`、`project-settings-stage`、`visual-foundation`（间距 / 字号 / 时长吸附到阶梯、对比度调整后的 muted/faint、浮层 `--lift-3`、类型标签中性化）；`coss-control-language`、`primitives`（焦点：字段整铜色边框、信息流不叠两层指示；空状态纸张在终层）；`goals-status-ui`（状态图标）；`plugin-market-catalog`、`plugin-declarative-mounting`（实验 `flask`、PPT `presentation`）；`tab-split-drop`（130ms + quint）；`list-silent-refresh`（刷新失败的提示带失败标记）；`continuous-surfaces.e2e`（每个控件恰好一个焦点指示且 ≥ 3:1）；`goal-kanban.e2e`、`immersive-directory.e2e`（Goals 行 34px、Sessions 行 44px、列表页页头动作在右、工具栏安静洗底、信息流标题 13px）；`goal-canvas-workspace.e2e`（没有终端会话的 Goal 先以文档打开，测试先切到终端视图）。
- 同步 main b2826932（#97–#100）后再跑全量：3387 项，3372 通过、8 失败。3 项在旧基线上同样失败；另外 5 项里，Goal 事件文档单跑通过（负载抖动），其余 4 项（Shelf 设置页的 Grok 文案、Shelf DropAgent 对照、Feed → Shelf 动作流程、SDK 打包样例的离线安装）在未改动的 main b2826932 上单独跑同样失败、失败位置相同，属 main 既有。main 基线失败中的 7 项在本分支通过。
