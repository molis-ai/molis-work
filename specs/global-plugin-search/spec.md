# 工作台全局搜索（按插件分组）

状态：已完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它改写 `DESIGN.md` 里「Goals 下钻目录保留内嵌搜索框」的旧约定：搜索入口上收到项目选择旁，打开 Spotlight 式全局面板，按插件类型列出可跳转对象。

## 背景与问题

Goals 目录工具栏里有一条「在当前 Goal Tree 内搜索」。它只过滤当前树，占掉列表上方一行，也找不到 Session、Inbox、Feed、来源或 Artifact。用户要的是：入口在最上沿、项目选择旁边一枚放大镜；点开后是居中浮层，结果按插件分组；原来那条搜索框去掉。

## 范围与非目标

### 范围

- 项目选择右侧加放大镜按钮（与通知、设置同一排图标）。目录收起或窄屏抽屉关上时，标题栏补同一入口。
- 点击放大镜，或 ⌘K / ⌘F（焦点不在终端里时），打开居中全局搜索浮层。
- 浮层按插件分组：Goals、Sessions、Inbox、Feed、来源、Artifacts。无关键词时每组最多 8 条；有关键词时每组最多 12 条匹配项。空组不出现。
- 选中一项即关闭浮层，并打开对应插件目录与对象（Goal 走现有 `selectGoal`；其余点击已有目录行）。
- 底部「快捷操作」：新建目标、项目首页、插件市场。无关键词时始终出现；有关键词时仅标题匹配才出现。
- 去掉 Goals 目录 `tree-chrome` 里的搜索框。状态筛选、新建、归档、回收站保留。「折叠全部」已由 `specs/goals-directory-remove-collapse-all/spec.md` 删除。关键词不再过滤 Goal 树；旧 sessionStorage 里的树搜索词不再恢复。
- Sessions / Feed / 来源目录里的列表内搜索框去掉；筛选菜单保留。关键词跳转走全局搜索。

### 非目标

- 不改 Goal 画布、Frame、终端、插件市场内容页。
- 不新增服务端搜索 API；只索引当前页已渲染的目录行。
- 不为 Artifacts 在打开搜索时强制预取；该插件尚未载入则该组为空。
- 不把搜索做成根目录常驻输入条，也不按 Spotlight 做跨项目、跨设备索引。

## 使用场景

1. 在任意插件（含项目首页）点项目名旁放大镜：浮层出现，光标在输入框，按插件看到当前项目里的对象。
2. 输入 Goal 标题片段：Goals 组出现匹配项，选中后进入该 Goal 工作区。
3. 输入 Session / Feed 标题：对应组出现，选中后切到该插件并选中该行。
4. 无匹配：正文显示「没有匹配的内容」；若快捷操作也不匹配，快捷操作区隐藏。
5. Escape 或点遮罩关闭；焦点回到打开它的放大镜。
6. 窄屏先打开目录抽屉再点放大镜，或直接点标题栏放大镜。

## 方案与关键决策

- 工作台拥有入口和浮层；各插件仍拥有自己的对象与打开行为。索引来自已有 DOM（`data-goal-search`、`data-record-search`、Feed/Inbox/来源/Artifact 行）。
- 用 `<dialog>` + `showModal()`，避免被侧栏 `overflow` / `inert` 裁剪。
- ⌘F 从「聚焦 Goal 树搜索框」改为打开此浮层。终端内不拦截，避免和 TUI 抢快捷键。
- 视觉跟现有石墨工作台：`--paper` 面板、`--nav-hover` 选中、`--muted` 分组名与插件标签，不用第二套设计语言。

## 文件边界

- `apps/workbench/src/settings-navigation.ts`：项目选择旁放大镜
- `apps/workbench/src/immersive-shell.ts`：标题栏入口与浮层 markup
- `apps/workbench/src/goals-page-renderer.ts`：挂入口与浮层
- `apps/workbench/src/scripts/client/global-search.ts`：打开、检索、键盘、跳转
- `apps/workbench/src/scripts/client/{bootstrap,initialization,documents-state}.ts`：与旧树搜索解绑
- `plugins/native/goals/src/{tree-ui,tree-client,collection-model,tree-en}.ts`：去掉目录搜索框
- `plugins/native/work/src/ui/directory-client.ts`：Sessions 不再抢 ⌘F
- `apps/workbench/src/styles/immersive-navigation.ts`、`i18n/en.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- 测试：`tests/desktop-tui.test.ts`、`tests/goals-tree.e2e.test.ts`、`tests/goals-tree-ui.test.ts`、`tests/immersive-directory.e2e.test.ts`、`tests/goals-narrow-navigation.e2e.test.ts`、`tests/i18n.test.ts`

## 验收

1. Goals 目录工具栏没有搜索输入；状态筛选仍可用。
2. 项目选择右侧有放大镜；点击后出现居中浮层，输入框聚焦。
3. 浮层结果按插件分组；选中 Goal / Session 会打开对应对象，不改 SQLite 事实。
4. ⌘K / ⌘F（非终端）打开同一浮层；Escape 关闭。
5. 定向测试与相关 e2e 通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/goals-tree-ui.test.ts \
  tests/i18n.test.ts \
  tests/goals-tree.e2e.test.ts \
  tests/immersive-directory.e2e.test.ts \
  tests/goals-narrow-navigation.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`，禁止打默认 home。
