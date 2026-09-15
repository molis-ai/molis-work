# 工作台目录：Codex 目的地 + 点插件换主区

状态：2026-09-15 锁定。切片：`docs/design/directory-plugin-list/`。完成等级 **4：内部完整**。不宣称可发布。不改用户真实库、不发布、不执行 `specs/workbench-frame-container/plan.md`。

本文件是本次行为变更的唯一需求书。它取代沉浸式工作台的两层目录（根模块卡 → 钻入后横向插件条 +「返回项目目录」），并改掉 Frame 期「Frame 开着时点插件条只换目录、主区留 Goal」的拦截。主区 Container / Goal 画布 / Frame Block 仍以 `specs/workbench-frame-container/spec.md` 为准；本文件只改目录 IA 和「点上面的插件会离开当前 Frame」。

## 背景与目标

生产目录仍是两层：首页先看到带副标题和 chevron 的模块卡；点进去才出现横向插件条，并多一步「返回项目目录」。Frame 开着时点 Feed / Sessions 只换左边列表，主区继续停在 Frame，等于用目录往看不见的 Frame 里塞东西。

目标：目录变成 Codex 侧栏语法。上面始终是项目首页和该项目已启用插件；下面只换当前选中项的列表。点上面的插件 = 离开当前 Frame，主区换成该插件；每个插件自己记住离开前的状态，再点回来原样回来。

## 当前行为与问题证据

- `renderImmersivePluginStrip` 把插件条放在 `hidden` 的 heading 里，根目录另有模块卡（`desktop-module-item` + 副标题 + chevron）。
- `immersive-navigation.ts` 在 `directory === "root"` 时藏起 heading。
- `events-secondary.ts` 在 `isFrameTabActive()` 时点 Sessions / Feed / Inbox / Artifacts 只 `setDesktopDirectory`，主区强制留 `goal`。
- 点 Goals 会 `frameContainer.showCanvas()`，把上次的 Frame Tab 清回画布。

## 范围与非目标

### 范围

- 目的地始终可见：项目首页 + 已启用插件。图标 + 名称，无副标题、无 chevron、无「返回项目目录」。
- 下面只显示当前选中项的列表。首页没有条目，下面空着（一句安静说明），主区仍是诗意首页。
- 点目的地：换下面的列表，同时换主区。Goals = Container（画布 Tab + 各 Goal 的 Frame）；Feed / Inbox / Sessions / Artifacts = 各插件主表面。
- 不是浏览器后退栈。切走是藏起来，不拆掉。再点回来：Goals 停在哪个 Frame、开着哪些 Tab、相机、Block、展开卡；Feed 停在哪一条、Feed/来源。
- 点 Goals 回来时不要 `showCanvas()`，只 `sync()`，让 persist 的 `activeTab` 回来。
- Frame 仍开着时，点可见的 Goal 树行 = 定位画布卡片（现 `locateGoal`）。本期往 Frame 进货：目录行仍在 DOM（hidden panel），用 hidden 的 `[data-frame-asset]` 或合成 drop。用户路径 later 是拖到 Frame Tab / 开左右分栏。
- Feed「来源」、Goals 归档/回收站仍是该列表自己的工具，不升成顶栏插件。
- 账号仍在目录底。「+ 插件市场」在目的地最底下，紧挨列表分割线上方。
- 视觉跟切片：目的地 32px，当前插件只加字重/颜色，不要浮起阴影芯片；列表行平面 `nav-active`。
- 目录上下分区：目的地和当前列表之间有分割线；列表区顶部有标题，放在搜索框上方，告诉用户这是哪一份列表（项目首页 / Goals / Sessions / Inbox / Feed / 来源 / Artifacts）。
- 点目的地换列表时，列表区有短切换动效；尊重 `prefers-reduced-motion`。
- 列表底部不显示「共 N 个 / N 个 Item」计数行。
- 窄屏仍是 600px 抽屉。不要把 `mobile-switch` 加回生产。

### 非目标

- VS Code 式分栏布局（单栏 / 左右 / 上下）。切片里的布局按钮本期不进生产。切片约定：点左右 / 上下时，新格子不默认填充内容，只出「+」标签，由用户选择要打开哪一套插件 Tab。
- 嵌 PTY / 浏览器进 Frame Block。
- 改用户真实库、发布、安装新 App。
- 把 Frame 做成左目录插件或市场可卸载项。
- 重写各插件自己的列表控件（归档、来源、筛选）的领域行为。
- 改 DESIGN.md 全局规则（本文件是权威；沉浸式「两层目录」描述过时）。

## 使用场景

1. 打开项目：左边上面是首页和插件，下面空着；右边是诗意首页。首页目的地为当前。
2. 点 Goals：下面是 Goal 树，右边是画布（或上次停着的 Frame）。Goals 为当前；首页仍看得到。
3. 点 Feed：Goals 还在上面，下面换成 Feed 列表，右边是 Feed。
4. 开着某个 Goal 的 Frame，再点 Feed：Frame 藏起，主区是 Feed。再点 Goals：刚才的 Frame Tab、Block、展开卡还在。
5. Frame 正显示时点 Goal 树某行：回到画布并选中该卡片（现逻辑）。不要把 Feed 塞进看不见的 Frame。
6. 市场新加的插件出现在目的地里。未启用的不出现。
7. 手机拉开目录抽屉：目的地仍在上，下面仍是当前列表。

## 方案与关键决策

1. **目的地是一层，不是钻入。** heading/strip 始终渲染且可见。`data-directory-panel="root"` 留给首页空列表，保存的 `directory: "root"` 仍可用。
2. **点插件就是换主区。** 删掉 Frame 激活时「只换目录」的分支。
3. **回来靠插件自己的状态，不靠后退栈。** Goals 的 Frame 构图仍在 `localStorage` `molis-work-frame-container:${projectId}`；切走不把 `activeTab` 清成 canvas。
4. **本期不做分格。** 外层容器以后才是「每个插件一套 Tab 集合 + 布局按钮」。
5. **进货路径 later 是拖拽 / 分栏。** 测试可用 hidden 行或 drop；不要为了塞 Block 把插件条改回「主区不动」。

## 输入输出与依赖

- 输入：现有项目、已启用插件、Frame 构图、各插件目录 HTML。
- 输出：目录 DOM/CSS、目的地点击、主区切走/回来、Frame 恢复。
- 依赖：现 Frame Container、插件条 `data-plugin-id` / `data-work-surface-open`、工作表面 `setDesktopWorkSurface`。
- 不改 Goal 事件、Artifact 版本、MCP。

## 文件 / 模块边界

- `apps/workbench/src/immersive-shell.ts`：垂直目的地，含首页；去掉 back 与横向滚动钮；列表区标题与 `wrapDirectoryListRegion`。
- `apps/workbench/src/goals-page-renderer.ts`：根面板改空态，不再渲染模块卡；目的地下面用列表区包住各 panel。
- `apps/workbench/src/styles/immersive-navigation.ts`、`immersive-directory.ts`：目的地、分割线、列表标题、搜索与切换动效。
- `apps/workbench/src/scripts/client/immersive-navigation.ts`：heading 始终显示；当前项按主区表面高亮（含 home）；同步列表标题。
- `apps/workbench/src/scripts/client/events-secondary.ts`：去掉 Frame 拦截；点 Goals 不要 `showCanvas()`。
- `apps/workbench/src/scripts/client/navigation-feed.ts`：切主区时 `frameContainer.sync()`；切列表时播放进入动效。
- 测试选择器从根模块卡改为 `[data-plugin-strip] [data-plugin-id=…]`；列表标题用 `[data-directory-list-title]`。

插件内部 `data-directory-back`（已被目录 heading CSS 藏住）若仍被点到，视为回到项目首页。

## 验收标准

1. 打开项目：目的地可见（首页 + 已启用插件 + 最底下「+ 插件市场」），首页为当前；下面是空说明；主区是首页。无模块卡、无 chevron、无「返回项目目录」。目的地与列表之间有分割线；列表标题为「项目首页」，在空说明上方。账号在目录底，不含插件市场。
2. 点 Goals：列表标题变成 Goals，标题在搜索框上方，下面是 Goal 树，主区是画布或上次 Frame；点 Feed：标题变成 Feed，下面是 Feed，主区是 Feed；Goals 目的地仍在上面。切列表有动效。
3. 开 CORE Frame，点 Feed：`desktopSurface=feed`，Frame 表面 hidden。再点 Goals：CORE Tab 仍在，Block 还在。
4. Frame 开着时点 Goal 树：定位画布卡片。点 hidden 的 `[data-frame-asset]` 或合成 drop 仍可往当前 Frame 加 Block。
5. 未启用的插件不出现在目的地。市场添加后出现。
6. 窄屏 600px 抽屉可开可关；没有 `.mobile-switch`。
7. 定向测试通过。隔离浏览器可走首页 → Goals → Feed → 回 Goals；若先开 Frame 再点 Feed，回 Goals 时 Frame 回来。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 \
  tests/workbench-frame-container.e2e.test.ts \
  tests/immersive-directory.e2e.test.ts \
  tests/immersive-workbench.e2e.test.ts \
  tests/goals-narrow-navigation.e2e.test.ts \
  tests/project-home-start.e2e.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts \
  tests/project-plugins.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须 `--home` 临时目录，禁止 `pnpm web` 打默认 home。

## 假设与开放问题

- 假设：用户「先这样做吧」= 先做目录 IA/视觉 + 点插件换主区并恢复状态；布局分栏 later。
- 本期 Frame 进货不走「主区停 Frame、目录切 Feed」。
- 不把搜索做成根目录常驻；搜索仍在各插件列表工具区。
