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

## 假设与开放项

- 工作树上另有进行中的目录/设置改动。本轮起点包含它们；`tests/i18n.test.ts`、`tests/project-settings-accordion.test.ts`、`tests/project-settings-stage.test.ts` 各有 1 项在**本次改动之前**即为失败（已在回退本层后复现确认），属于那条线，不在本轮范围。
- 原生 macOS 安装包、终端配色、首次引导页与全部低频领域表单未在本轮穷举。
- 未提交、未发布、未替换用户运行中的服务。
