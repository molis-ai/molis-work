# Linear × Coss 交互质感升级

## 背景与目标

Coss 全界面重设计把结构、密度和控件语言统一了，但表达层停在"能用的中性灰"。用户要求继续参照 Linear 与 Coss UI，升级**交互质感、视觉效果、图标、颜色与颜色质感**。本次不改结构、不改信息架构、不改领域行为，只重做表达层：颜色阶、层次深度、动效、焦点与按压反馈、图标标定。

目标等级 3「功能可用」：真实页面在隔离预览里完成浅/深色与三档宽度的目视核对，定向回归通过。不宣称原生安装包已验收。

## 证据

在隔离预览（1440×900，deviceScaleFactor 2）逐面核对当前构建，得到五条具体缺口：

- **深色层次塌陷。** 画布 `#141416`、导航 `#171719`、纸面 `#1c1c1f` 相差不到 6 级，整屏读作一块无差别的炭灰，深度只能靠 1px 线表达。
- **颜色没有家族关系。** 中性色是纯灰，强调色是靛紫，两者不同源；语义绿/琥珀/红来自更早的层，明度和彩度互不对齐。
- **交互反馈不成体系。** hover 有、按压基本没有；过渡时长与缓动散落在各层；目录选中与 hover 只差一档灰，"我在哪"不明确。
- **图标偏轻。** Lucide 画在 24 网格上，基础层给 `stroke-width: 1.7`，16px 下实际描边仅 1.13px，比 Linear 的 1.5px 明显虚。
- **升起面不像升起。** 弹层只有一层淡投影，深色下遮罩用 10% 主墨（近白），反而把背景洗亮；画布状态标签外层还套着一只多余的胶囊。

## 范围与场景

范围是工作台、全局/项目设置与项目选择三张页面的共享表达层。首次引导（`onboarding-styles.ts`）自带命名空间 token，本次不动。

场景：浅/深色切换；1440 / 1024 / 390 三档宽度；目录定位与选中；标签切换；画布读图与选节点；打开搜索与确认弹层；表单聚焦输入；窄屏抽屉。

## 方案与取舍

新增 `packages/design-system/src/styles/interaction-texture.ts`，由 `renderer.ts` 在三张页面样式表的**最后**拼接。选这种"最后一层"而不是改写既有各层，是因为既有层同时承载结构与密度契约，逐处改写会把版式风险带进纯表达层的改动；单独一层可整体加载、整体回退，且不触碰任何 DOM。

- **颜色。** 中性阶带极轻靛青偏色，与强调色同源。深色重排为 场 `#0e0f12` → 导航 `#121316` → 纸面 `#17181c` → 升起 `#212328`。四级文字（ink / ink-soft / muted / faint）在各自表面上均 ≥ 4.5:1。强调色靠向 Linear 的靛紫（浅 `#5a63d6`、深 `#9aa2fb`），语义色按同一明度/彩度重排。标签分组色从 Chrome 原生那套高饱和色换成同族低饱和色。
- **颜色质感。** hover / active / press 改为主墨低透明度（5.5% / 9% / 13%），一套配方在任何表面、任何主题上叠加都成立，不再为每种底色写一个灰值。
- **深度。** 升起面统一"发丝边 + 多段投影 + 深色顶部高光"。遮罩收敛为一个 `--scrim`，深色 55% 纯黑，修掉近白遮罩洗亮背景的问题。
- **动效。** 三档时长（90 / 130 / 190ms）与两条缓动（`--ease-standard` 交互、`--ease-out` 到场）。按压是色调下压，不做位移与缩放；打开浮层的控件排除按压滤镜，避免菜单在按下瞬间偏移。
- **焦点。** 输入类控件用自绘强调色环（1px 实线 + 3.5px 光晕）取代浏览器描边。
- **图标。** 应用面统一 `stroke-width: 2`（16px 下 1.33px），空态大图标降到 1.6；静止 `--faint`，hover/当前解析为 `--ink-soft` 或插件色。当前插件在左栏带自己的身份色，与标签图标同一张色表。
- **取舍。** 目录选中加了 2px 前缘强调条——这改变了 DESIGN.md 原先"扁平选中"的记述。保留它，因为只靠一档灰在密集目录里读不出"当前"；记为新的现行规则而不是偷偷改动。

## 输入输出与模块边界

输入：既有 DOM、主题偏好、插件色表。输出：一层新 CSS 与两张色表的取值。

允许改动：`packages/design-system/src/styles/interaction-texture.ts`（新增）、其导出入口、`apps/workbench/src/renderer.ts` 的样式表拼接、`apps/workbench/src/scripts/client/tab-workspace.ts` 的 `PLUGIN_COLOR` / `GROUP_COLOR`、`DESIGN.md`。不改领域写入、MCP、凭据、插件协议与任何用户数据。

## 验收

1. 浅/深色下场、导航、纸面、升起四级可分辨；四级文字对比度 ≥ 4.5:1。
2. hover / 选中 / 按压三态在目录、标签、按钮、图标按钮上一致可辨；选中另有前缘强调条。
3. 弹层有发丝边与投影，遮罩在深色下压暗而非提亮。
4. 输入聚焦显示强调色环；`prefers-reduced-motion` 下过渡、按压反馈与到场动画全部关闭。
5. 图标描边一致，当前插件带身份色。
6. 1440 / 1024 / 390 无页面级横向溢出，窄屏抽屉可用。
7. 定向回归通过，未验证路径明确报告。

## 验证

```
pnpm --filter @molis-ai/molis-work-design-system build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/visual-foundation.test.ts tests/coss-control-language.test.ts \
  tests/workbench-ui-platform.test.ts tests/web.test.ts tests/tab-workspace-ops.test.ts \
  tests/goals-kanban-ui.test.ts tests/goals-tree-ui.test.ts tests/feed.test.ts
```

结果：90 项全部通过，0 skip。

隔离预览 home `/private/tmp/molis-ui-upgrade`，端口 4187，未触碰用户真实项目数据。证据图 `.impeccable/review/interaction-texture/`：`canvas-1440-{dark,light}`、`feed-1440-dark`、`search-1440-dark`、`settings-1440-light`、`index-1440-dark`、`workspace-1024-dark`、`directory-390-light`。

## 第二轮：把统一落到还没盖住的地方

第一轮上线后逐面复核，发现三类"看起来统一、其实没统一"的情况，以及两处层级倒置。

- **升起面与遮罩没真正生效。** `.global-search-dialog`、`.navigator-project-menu-popover` 等在 `immersive-navigation.ts` 里自带 `body.immersive-workbench …`（深色再加 `html[data-resolved-theme]`）的投影与遮罩，特异度高于本层的 `body :is(…)`，所以发丝边、`--control-shadow` 和 `--scrim` 都被压住了——实测全局搜索遮罩仍是 `#0809104d`。本层把这两条规则按工作台与深色两级特异度各写一遍，并接管窄屏抽屉的 `.immersive-sidebar-scrim`。
- **分段控件两种极性。** 画布/看板是"白底轨 + 深色当前片"，设置与语言切换是"灰底轨 + 白色当前片"，正好相反。统一为一种：`--control-fill` 凹轨 + `--hairline` 边 + 9px 圆角，当前片是 `--nav-raised` 抬起片，带发丝边、共享投影与深色顶部高光。目录内嵌的那只保留自己的紧凑尺寸，只共享色调。
- **目录空态六种写法。** `.feed-list-empty`、`.source-list-empty`、`.project-record-empty`、`.artifact-empty`、`.goal-collection-empty`、`.tree-filter-empty` 各有各的内边距、对齐与底色（其中一个还是浅灰块）。统一成一块左对齐的安静区块。
- **首页最响的是次要动作。** 「添加快捷方式」是整页唯一的靛紫实心圆。改为空槽：`--line-strong` 发丝圆环 + `--muted` 图标，hover 才填色。首页"从上往下排、空在下面"的构图是 [首页从上往下排](../home-top-stack/spec.md) 的既有决定，本轮不动。
- **空列提示看不见。** 看板空列的 `1px dashed var(--line)` 在深色下几乎不可见，改用 `--line-strong` 与 `--faint`。

另外补上排版层的两处：标题 `text-wrap: balance`、正文 `text-wrap: pretty`、无类名链接的下划线偏移。以及修正 DESIGN.md frontmatter——它声明"列出实际取值"，但第一轮改了 token 却没同步，属于本轮引入的文档欠账。

### 第二轮验证

```
pnpm workspace:build
node --import tsx --test --test-concurrency=1 tests/visual-foundation.test.ts tests/coss-control-language.test.ts \
  tests/workbench-ui-platform.test.ts tests/web.test.ts tests/tab-workspace-ops.test.ts tests/goals-kanban-ui.test.ts \
  tests/goals-tree-ui.test.ts tests/feed.test.ts tests/project-settings-stage.test.ts \
  tests/project-settings-accordion.test.ts tests/i18n.test.ts
```

结果：103 项中 100 通过，3 项失败为下文所述的既有失败，未变化。1440 / 1024 / 390 均无页面级横向溢出。

复核中抓到本层自己的一个缺陷并修掉：分段控件的"当前片"原先按 `[aria-current]` 匹配，而语言切换把非当前项写成 `aria-current="false"`，于是两片都被抬起。改为只匹配 `true` / `page`。

第二轮证据图同样在 `.impeccable/review/interaction-texture/`，新增 `board-1440-dark`、`settings-1440-dark`、`home-1440-dark`、`sessions-1440-light`。

## 第三轮：三处微交互（参考 React Bits / reactbits.dev/c/micro）

用户提出参考 React Bits 的 micro 分类。那 30 个组件是 React + `motion` 的实现，本产品没有 React 也没有动画运行时，所以**借的是行为，不是代码**：每条用 CSS 加几个自定义属性实现，`packages/design-system/src/styles/micro-interactions.ts` 一个文件装样式与测量脚本。

选取标准只有一条：**这个动作是否在传递信息**。传递信息的做了，纯装饰的没做。

### 做了的三条

- **Rubber Segment → 分段控件的滑块行进。** 原先当前片是在新槽位上直接出现。现在一个滑块在轨道内行进并微微过冲落位（`cubic-bezier(.32, 1.22, .52, 1)`，240ms），槽位宽度不等时宽度一起过渡。覆盖画布/看板、主题、界面语言、界面密度、终端外观与项目设置的分段控件。
- **Glide Select → 全局搜索的高亮行进。** 原先 `.global-search-hit[aria-selected="true"]` 与 `:hover` 用的是同一个 `--nav-hover`，鼠标停在别处时看不出回车会打开哪一条。现在键盘选中是一块行进的药丸（`--nav-active`），hover 退回更浅的一档——这条不只是动效，它修掉了一个真实的歧义。
- **Status Mark → 焦点 Goal 的不定进度弧。** 正在推进的状态（clarifying / executing / reviewing / revalidating / in_progress）在**焦点位置**（`.goal-node-toolbar`、`.frame-goal-heading`、`.tui-owner-actions`、`.reader-header`、`.goal-info-popover`）把静态字形换成一段旋转弧。只在"一条 Goal 一个状态"的地方生效；目录、画布节点与看板卡片保持静态标记，不做满屏转圈。

三条都在客户端脚本不执行时退回当前的静态表现（滑块与药丸靠 `data-*` 开关，弧靠 CSS），`prefers-reduced-motion` 下取消行进与旋转（弧直接换回原字形），已用 `Emulation.setEmulatedMedia` 实测：`arcContent: "none"`、`arcAnim: "none"`、过渡时长归零。

### 没做的，以及为什么

- **Hold Button / Slide Commit（按住或滑动确认）。** 本产品对不可逆领域操作用的是显式确认弹层，这是既有产品决定；用"按住 800ms"替换它会把一次明确的确认换成一次可能误触的手势。不做。
- **Warm Tooltip。** 本产品目前一律用原生 `title`。换成自绘 tooltip 是新增组件加一整套可访问性工作，不属于"微交互"这一轮。
- **Swipe Toast。** 已有 toast，且已有位移与淡入。
- **Jelly Radio / Squish Switch / Pulse Heart / Peek Rating / Comet Dial / Voice Pill / Call Chip / Bell Toggle / Sling Button / Fuse Button / Folder Float / Dodge Field / Code Slots / Scrub Field / Wake Slider / Slosh Gauge / Prompt Bar / Branched Menu / Refine Frame / Thought Line / Lattice Loader / Swipe Row。** 要么属于别的产品类别（通话、评分、语音、验证码），要么是纯装饰。一个长时工作台记账本里，弹跳和果冻会让每次普通操作都像在庆祝。不做。

### 第三轮验证

同一套定向回归：123 项中 122 通过。唯一失败仍是 `tests/i18n.test.ts` 的静态文案英文翻译——本轮不新增任何用户可见文案，与本轮无关。

实测确认：分段滑块从 `--seg-x: 3px` 行进到 `99px`、宽度 46→70；搜索高亮随方向键从 `--hit-y: 89px` 到 `141px`；焦点状态强制为 `executing` 后 `animationName: mw-status-arc`、原字形 `display: none`。证据图 `.impeccable/review/micro-interactions/`：`segment-thumb-1440-light`、`search-glide-1440-dark`、`status-arc-1440-light`（弧的截图用脚本临时把焦点状态置为执行中，因为演示数据里没有正在推进的 Goal）。

## 第四轮：创建改为居中弹窗

用户指出：在任何插件里创建新 item 都是右侧滑入窗，希望改成居中弹窗，并把弹窗内的内容、UI、交互与引导一起优化。这推翻了 [product-interaction-redesign](../product-interaction-redesign/spec.md) v11 的"临时编辑器贴工作区边缘"决定——**是用户的决定，按新规则记入 DESIGN.md，而不是偷偷改掉**。

### 分界

按"是否在创建/选取一个 item"分：

- **改为居中弹窗**：新建 Goal（`data-create-dialog`）、Feed 任务配置（`data-feed-sources-dialog`）、启动 Session（`data-session-add-dialog`）、Frame 内容选取（`data-frame-picker`）。
- **保留右侧边栏**：Session 关系编辑（`data-session-relations-dialog`）与 Handoff 编辑器。前者是改既有记录不是创建，后者是双栏长文编辑，贴边更合适。若也要改，说一声即可。

### 几何

`mw-dialog--form`：`min(560px, 100vw - 48px)` 宽，高度随内容、上限 `min(100dvh - 96px, 720px)`，表面圆角 + 发丝边 + 共享投影 + 共享 `--scrim`；头尾固定、中间一条滚动；≤760px 时四边内缩 12px。

一个实现坑值得记：**`inset: 0` + `margin: auto` 只能居中"尺寸确定"的盒子**。高度 auto 时绝对定位会被上下 inset 拉满，再被 `max-height` 夹成 720px——表现就是弹窗居中了但底下空一大片。改用 `top/left: 50%` + `translate: -50% -50%`（用独立的 `translate` 属性，把 `transform` 留给入场动画）。

另一个坑是我自己引入的：给可选分组加了 `overflow: hidden` 做圆角裁切，结果它作为 grid item 被夹到 389px，展开的内容既被裁掉又不计入滚动容器的 `scrollHeight`，于是**后两个分组完全够不到**。改成不裁切、首尾子元素各自圆角。

### 内容与引导

新建 Goal 原来是：两个字段 + 三个并排的折叠面板，在一个 900px 高的贴边栏里，下面空掉一大半。三个折叠面板并排读起来像"还有很多没填"，跟产品自己写的"先记录你的想法，再补全"正好相反。

改为：名称与结果保持可见；三个可选分组收进**一个**带边框的组，组头一行灰字「以下都可选，创建后随时能补」，每行 38px。另外给主操作加了键盘通路 `⌘↵`（提示放在footer左侧），并在共享客户端脚本里实现 `⌘/Ctrl+Enter` 提交当前打开的弹窗表单（走 `requestSubmit()`，保留原有校验与提交处理）。

### 第四轮验证

- `pnpm workspace:build` 通过；定向回归 130 项中 129 通过，唯一失败仍是既有的 `tests/i18n.test.ts` 文案缺英文——本轮新增的一条文案已补上英文，不在缺失列表里。
- 实测：新建 Goal 弹窗 560×484、双轴居中、12px 圆角；三个分组全部展开后高度到上限 720px，头尾固定、正文可滚、最后一个分组可达；启动 Session（560×445）、Feed 任务配置（560×357）、Frame 选取均居中；Session 关系编辑仍为 x=880 的贴边栏。390px 下居中且不溢出。⌘↵ 实测直接创建成功并跳转到新 Goal。
- `tests/continuous-surfaces.e2e.test.ts` 的编辑器几何契约已改写为居中断言（水平/垂直居中、在视口内、非满高、有圆角有投影）。该测试中 Frame 选取这一段在 1440 与 390 均通过；再往后 `[data-open-create]` 点击失败——深链进 Goal 后该按钮 `offsetParent` 为 null，属于另一条线进行中的目录改动，**与本轮无关**（已在浏览器中复现确认）。
- 证据图 `.impeccable/review/create-modal/`：`create-1440-{light,dark}`、`create-390-light`、`create-expanded-1440-light`。

## 第五轮：创建不是填表，是写下你想要什么

用户的进一步要求：不要做成填表单；希望低功耗、沉浸，用户不用花脑力想"这一格该填什么"，而是直接写"我想创建一个什么东西"。

### 判断

原来的默认状态是：两个带标签的字段 + 一组可选分组。哪怕已经收成一组，看到的仍然是"标签—输入框"的结构——人先读标签，再决定往里放什么。这就是"填表"的认知成本来源。

参照 Linear 的 New issue 与各类快速捕获：**默认状态只有书写面**。标签变成占位提示，边框消失，其余全部收进一次可选展开。

### 做法

- **两行书写面。** 标题 19px 无边框，占位问「你想让什么变成现实？」；下面是无边框的结果行，占位问「完成后会有什么不一样？可以先空着」。两者都不带标签、不带框，`aria-label` 保留给读屏。
- **一次性的例子。** 标题下一行 11px 灰字给一个真实形状的例子；**敲下第一个字就淡出**，不再占位置。引导只出现在需要的时刻。
- **焦点是一条笔线，不是一个框。** 书写面用 `data-plain-field` 从共享输入框焦点环里退出，改为底部 2px 强调色下划线 + 一档背景。既不像表单，也仍是可见的焦点指示（下划线自身对比度达标）。`interaction-texture` 里的共享环相应加了 `:not([data-plain-field])`——这是一个可复用的退出口，不是给 Goals 开的特例。
- **其余全部收进一次展开。** 原来三个并排折叠面板变成一行安静的「补充说明、归属与优先级」；展开后内部是四个分组，不再嵌套手风琴。
- **结果行随写随长。** 输入时自动增高（上限 260px），弹窗跟着长，不出现两层滚动条。
- **回车即创建。** 标题是 `input`，敲完直接回车就建；`⌘↵` 在任何位置提交。最低功耗的路径是：打开 → 打字 → 回车。

### 第五轮验证

- `pnpm workspace:build` 通过；定向回归 121 项中 120 通过，唯一失败仍是既有的 `tests/i18n.test.ts` 文案缺英文积压；本轮新增四条文案（标题占位、例子、结果占位、展开标题）都已补英文，不在缺失列表里。
- 实测：默认弹窗 560×299，只有两行书写面与一行展开；输入标题后例子 `hidden` 为 true；结果行随内容 62→104px 且弹窗跟着从 299→319；展开后正文可滚、头尾固定。
- 证据图 `.impeccable/review/create-modal/`：`compose-1440-{light,dark}`、`compose-390-light`、`compose-open-more-1440-light`、`compose-typed-1440-light`。

## 第六轮：把前几轮欠的账还了

前几轮一直在报告"这三项失败是既有的、不是本轮引起的"。用户要求填坑，逐条处理：

### i18n 文案积压（57 条）

`tests/i18n.test.ts` 扫描渲染源里的 `L("…")` 并要求每条都有英文。缺 57 条：37 条来自 Feed 任务配置、9 条 Goal 事件表单、5 条事件历史、2 条完成要求、其余零散。

按归属补齐：Goal 相关进 `plugins/native/goals/src/document-en.ts`，Artifact 进 `plugins/native/artifacts/src/en.ts`，Feed/Inbox/设置（没有独立 EN 表）进 `apps/workbench/src/i18n/en.ts`。现在 `missing: 0`，`tests/i18n.test.ts` 8/8 通过。

### 连续界面 e2e（两档宽度）

一直卡在点不到 `[data-open-create]`。查清楚是三个独立问题叠在一起：

1. **测试路径过时。** 深链进 Goal 后，Goals 的目录 chrome 被放进 `.tab-workspace-pool`（`display: none`），页面上唯一的 `[data-open-create]` 是这个池里的副本。测试改为先 `openPlugin('goals')` 回到 Goals 面，再点创建；查完再导航回 Goal 继续原有断言。
2. **焦点环特异度是我第二轮留下的坑。** 共享输入框焦点环写成了 `input:not([type=checkbox]):not([type=radio]):not([type=range]):not(.mw-slider):not(.mw-input):not(.mw-textarea):not(.mw-select)`——七个 `:not()` 把特异度堆到 (0,9,2)，把 Feed 弹窗自己那条"保留 2px 描边、不要光晕"的规则 (0,3,3) 压死了。改成 `:is(input, select, textarea):not(…列表形式…)`，特异度降到 (0,2,2)，组件重新能覆盖它。**通用层不该靠堆特异度取胜**，这是这轮的教训。
3. **焦点环对比度不达标。** `--control-ring` 是 `color-mix(--focus 72%, transparent)`，在浅色纸面上实测只有 2.86:1，低于 3:1。改为 `var(--focus)` 全不透明，两个主题都稳过。

1440 全通过；390 见下。

### 发现的产品缺陷：390px 下无法新建 Goal

填坑过程中查出来的，**不是本轮改动引起的**：390px 打开 Goals 面后，抽屉关着时 `.goal-stage-chrome` 整体被平移到 `x = -176`（在屏幕外），抽屉开着时 `.immersive-sidebar-scrim`（z-index 35、fixed、覆盖标题栏以下整屏）盖在按钮上。全局搜索的「新建目标」快捷动作在 390 下也没能打开弹窗。即手机宽度下没有任何可用的新建入口——弹窗本身没问题，程序化 `.click()` 能正常打开并正确渲染。

这属于另一条线进行中的窄屏抽屉/导航改造。已单独记录待修。e2e 在 390 这一档暂时直接调用打开处理器，并在代码里注释了原因与恢复条件（入口可达后改回真实 `click`）。

### 第六轮验证

`pnpm workspace:build` 通过；`tests/continuous-surfaces.e2e.test.ts` 两档宽度全过；13 个定向测试文件 **139 项全部通过，0 失败**——本会话首次全绿。

## 第七轮：修掉第六轮查出的窄屏缺陷

第六轮报告了"390px 下无法新建 Goal"并挂了待办。这一轮直接修，并在修的过程中又查出一个更严重的同区域缺陷。

### 缺陷一：返回 Goals 后整条画布工具栏消失

先纠正第六轮的描述——当时说按钮被平移到 `x = -176`，那是量在过渡中间态。真实情况是 `visibility: hidden`。

链路：`.goal-canvas-shell[data-expanded="true"]` 会隐藏 `[data-goal-stage-chrome]`、`.goal-canvas-integrity`、`.goal-canvas-tools` 和 `.goal-board-switch`——意图正确，展开的 Goal 盖住画布时工具栏本就该让位。但打开一条 Goal 再切回 Goals 插件时，`syncGoalWorkspace` 在 `showBoard` 为假的分支里提前 return，没有重算 `data-expanded`；于是画布回到前台时旗标仍是 `"true"`，而 `[data-goal-node-workspace]` 实际是 `hidden`。结果：用户看着画布，**新建 Goal、筛选、缩放、画布/看板切换四样全部不可见**。这不是窄屏专有，390 只是更容易走到这条路径。

修法不是去改那台状态机（它正在另一条线上迭代），而是让规则问真实状态而不是问旗标：

```css
.goal-canvas-shell[data-expanded="true"]:not(:has([data-goal-node-workspace]:not([hidden])))
  :is([data-goal-stage-chrome], .goal-canvas-integrity, .goal-canvas-tools, .goal-board-switch) { visibility: visible; }
```

这样谁忘了清旗标都不会再把工具栏弄丢，而真正展开时（实测 `[data-goal-node-workspace]` 390×484）四样仍然正确隐藏。`tests/continuous-surfaces.e2e.test.ts` 的 390 档已改回**真实指针点击** `[data-open-create]`，两档全过。

### 缺陷二：390px 下项目选择器的箭头是 300×150

顺带查出来的，比第一个更显眼。桌面端把项目名和箭头做了视觉隐藏（`position: absolute; width: 1px; …`），`@media (max-width: 600px)` 再用 `position: static; width: auto; height: auto` 还原。`width: auto` 对文字是对的，**对 SVG 等于交还它的固有尺寸 300×150**。后果不只是一个巨大的箭头：选择器被撑到 448px（视口才 390），把搜索、设置、分栏三个入口整个挤出屏幕。

修法：在同一段媒体查询里把箭头显式还原成 11×11。实测选择器从 448px 收回 159px，三个入口重新出现。

### 一条自己的教训

第一次改完没生效，查下来是我在模板字符串里的注释写了反引号，`tsc` 报 `Cannot find name 'auto'` 直接编译失败——而我那行命令用 `>/dev/null 2>&1` 吞掉了输出，后面用 `;` 串联的启动步骤照常执行，于是服务器拿旧 dist 继续跑，看起来像"改了没用"。**构建输出不该被吞掉**。

### 第七轮验证

`pnpm workspace:build` 通过；15 个定向测试文件 **142 项全部通过**。实测：390 下返回 Goals 后新建 Goal `visibility: visible`、`elementFromPoint` 命中按钮本体、真实点击可打开弹窗；真正展开 Goal 时工具栏仍正确隐藏；项目选择器箭头 11×11、选择器宽 159px、无横向溢出。

## 假设与开放项

- 工作树上另有进行中的目录/设置改动。前几轮报告的三项既有失败已在第六轮全部处理完毕（i18n 补齐、另两项由那条线自行修好）。
- 原生 macOS 安装包、终端配色、首次引导页与全部低频领域表单未在本轮穷举。
- 未提交、未发布、未替换用户运行中的服务。
