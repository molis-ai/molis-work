# 工作台：项目设置进插件壳，正文在右边主体

状态：纠偏已落地。完成等级 **3：功能可用**。隔离项目里点齿轮：目录只剩四分类，正文在右边 exclusive stage（约 920px 栏、行内 setting-row），不跳页；Goals 清 exclusive。定向测试 44 通过 / 1 跳过。标题栏标签在 exclusive 时仍会被 Goal 容器 `renderTabs` 重新显示，记 later。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次入口变更的唯一需求书。它覆盖 `specs/archive/settings-directory-panel/spec.md` 里「项目设置仍走独立页」，以及 chrome 上那颗项目齿轮当前整页跳到 `/projects/{id}/settings*` 的行为。全局设置按同一壳模型，见 `specs/archive/settings-directory-panel/spec.md`。四个分类的字段、保存、审计仍以 `specs/project-settings-redesign/spec.md` 为准。

## 背景与目标

插件壳是三栏：插件栏 | 目录 | 内容。目录是分类/列表，右边才是主体。项目齿轮曾整页跳到独立设置页；上一轮把分类和正文都塞进第二栏目录，240px 里压独立页 DOM，样式崩了，也违反壳模型。

目标：点项目齿轮留在同一套插件壳，不切换页面。目录只放四个分类入口；正文进右边主体，用独立设置页那套可读内容栏（约 920px、行内控件）。齿轮不是标签。直达独立页仍保留。

## 当前行为与问题证据

- `a.navigator-project-settings` 带 `data-directory-open="project-settings"`，点击不再整页跳走。
- 分类和正文都在 `[data-directory-panel=project-settings]`。目录宽度约 240px。工作台 CSS 把标题压到 14px、说明隐藏、setting-row 改纵向。
- 独立页是 `body.project-preferences-page` + 920px 内容栏、20px 标题、行内 setting-row。那套样式不在工作台 stylesheet 里。
- 右边主体（标签/exclusive 工作面）在打开设置时仍显示首页或 Goal，不是设置文档。

## 范围与非目标

### 做

- 项目齿轮打开插件壳：第二栏换成项目设置分类，右边主体换成当前分类正文。不改 URL，不把设置做成标签。
- 目录内能切 常规 / 项目说明 / 工作规则 / 工作规划；正文只出现在右边 `[data-work-surface=project-settings]`。
- 打开时走 exclusive 工作面（与市场相同：盖住分栏、标题栏标签隐藏、标签状态仍在）。点 Goals / 首页 / 其它插件 `openPlugin` 清 exclusive，分栏和标签回来。
- 齿轮在项目设置打开时高亮；插件栏全局设置齿轮不高亮。
- 工作台内未改键的 `/projects/{id}/settings*` 链接同样进这套壳，不整页跳走。
- 独立 `/projects/{id}/settings*` 直达 URL 仍渲染完整设置页。`?embed=1` 仍返回片段。
- 正文视觉对齐独立设置页内容栏，不再用目录压缩样式。

### 不做

- 不把项目设置做成可卸载插件或市场项。
- 不合并全局设置与项目设置。
- 不改四个分类的领域契约、保存 API、删除确认。
- 不重做独立设置页视觉。
- 不做账号管理。
- 不把整页 embed 再塞进目录。

## 使用场景

1. 在首页点项目齿轮：第二栏出现「项目设置」和四个分类，默认常规；右边是常规正文（项目名、本地数据、删除），可读、可改名；地址栏仍是当前项目；标题栏标签被 exclusive 盖住，状态仍在。
2. 点「工作规则」：目录高亮规则，右边换成规则正文，壳不动。
3. 点 Goals：目录离开项目设置，右边回到标签工作区，项目齿轮取消高亮；分栏仍在。
4. Goal 文档里「打开项目设置」：同样进壳的工作规则，不离开工作台。
5. 直接打开 `/projects/{id}/settings/guidance`：仍是独立设置页。
6. 390 抽屉：点项目齿轮后抽屉里是分类；关掉抽屉看到右边设置正文。

## 方案与关键决策

1. **齿轮是壳入口，不是标签。** `data-directory-open="project-settings"`，没有 `data-work-surface-open`。保留 `href` 给新标签页/无脚本直达。
2. **目录只放分类。** `data-plugin-section="project-settings"` + `data-directory-panel="project-settings"` 只有 nav。标签 `apply()` 不得在它打开时把目录改回当前插件。
3. **正文是 exclusive 工作面。** 池里有 `data-work-surface="project-settings"`。打开时 `setDirectory("project-settings")` + `setExclusive("project-settings")`。分类正文按需 `?embed=1` 装进 stage，不用目录 body。
4. **独立设置页保留。** 直达 URL、刷新、浏览器历史、滚动测试仍可用。工作台内刷新若仍在项目设置，恢复 exclusive 与目录。
5. **样式。** 工作台 stylesheet 纳入独立页内容栏规则，作用在 `.settings-stage`；删除把设置压进 `.tree-pane` 的覆盖。

## 输入输出与依赖

- 输入：当前项目、四个分类的现有 HTML/API、已启用插件、工作区标签状态。
- 输出：项目齿轮打开壳内设置；目录=分类；右边=可读正文；不跳页的分类切换。
- 依赖：现有 directory 切换、tab-workspace exclusive、embed 片段、项目设置客户端绑定。
- 不改用户库、不新协议。

## 文件 / 模块边界

- `apps/workbench/src/settings-directory.ts`、`settings-navigation.ts`、`goals-page-renderer.ts`
- `apps/workbench/src/scripts/client/settings-directory.ts`、`immersive-navigation.ts`、`navigation-feed.ts`、`tab-workspace.ts`、`events-secondary.ts`、`initialization.ts`
- `apps/workbench/src/styles/immersive-navigation.ts`、`immersive-directory.ts`、`project-settings-page.ts`、`tab-workspace.ts`、`renderer.ts`
- 测试：`tests/desktop-tui.test.ts`、`tests/project-settings-stage.test.ts`、`tests/project-settings-accordion.test.ts`、`tests/project-settings-standalone.e2e.test.ts`、`tests/project-home-start.e2e.test.ts`

## 验收标准

1. 项目齿轮带 `data-directory-open="project-settings"`；工作台 HTML 有 `data-directory-panel="project-settings"` 和 `data-work-surface="project-settings"`。目录 panel 没有设置正文（无 `data-project-rename` / `data-theme-option`）。
2. 点齿轮：`#goal-tree-pane[data-desktop-directory=project-settings]`；`[data-tab-workspace][data-exclusive=project-settings]`；`[data-work-surface=project-settings] [data-project-rename]` 可见；`location.pathname` 仍是当前项目；`body` 不是 `settings-page`。工作台拦截跳转后，`body` 没有 `data-navigation-pending`，顶栏进度条消失。
3. 目录内能切到说明 / 规则 / 规划，对应表单出现在 `[data-work-surface=project-settings]`，不出现在目录 panel。从工作规划切回常规时，`.settings-content` 的 `scrollTop` 为 0，标题贴在内容栏顶部，不沿用上一分类的滚动位置。
4. 点 Goals 后目录不再是 `project-settings`，exclusive 清除，齿轮不再 `aria-current`；标签/分栏仍在。
5. 直达 `/projects/{id}/settings` 仍是独立设置页。
6. 工作台内刷新时若仍在项目设置，右边仍是设置正文。
7. 定向测试通过。完成等级 3 只在主体可编辑且样式与独立页内容栏一致之后宣称。不宣称可发布。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/project-settings-stage.test.ts \
  tests/project-settings-accordion.test.ts \
  tests/project-home-start.e2e.test.ts \
  tests/project-settings-standalone.e2e.test.ts
```

Chrome e2e 用隔离项目。禁止打用户默认 home。

## 假设与开放问题

- 目录宽度沿用当前项目已保存宽度；打开时若过窄则至少拉到 240px，与全局设置相同。
- 规划深层编辑页装进右边主体；保存后若仍写独立设置 URL，以内嵌加载消化。
- 全局设置按同一模型改，见 `specs/archive/settings-directory-panel/spec.md`。
