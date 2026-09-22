# Feed：左边只留目的地，右边是可展开目录

状态：已被 `specs/archive/plugin-stage-master-detail/spec.md` 覆盖。主区改为 Goals 同源的列表主从；分类进集合 fold，不再行内展开详情。

原状态：方向已锁定（2026-09-15 视觉稿确认）。完成等级目标 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它补在 `specs/directory-plugin-switcher/spec.md`、`specs/inbox-feed-plugin-split/spec.md`、`specs/archive/home-directory-visual-unify/spec.md` 之上：不改目的地一层、不改 Inbox 边界、不把来源升成顶栏插件。只改 **Feed 选中后，工作发生在哪一栏、如何展开**。

已确认视觉：左边只有目的地；右边是 Feed 目录（全部 / 各来源任务），任务展开成条目，条目在同一目录里展开详情，不切页。

## 背景与问题

当前 Feed 把 Item 放在左边列表，主区是阅读页；「来源」是插件内第二目的地，会同时换掉左边列表和右边主区，并走整列进场动效。日常路径是扫流水、快处理、偶尔长读、偶尔加源，却被做成「进了另一个插件」。

产品决定：Feed 的对象是 **任务**（一个来源 + 它的拉取），第一项是 **全部**。条目是任务拉到的内容。处理发生在右边这份目录里：列表上快处理，点开后在同一行下面展开详情。左边只负责换插件。

## 范围与非目标

### 范围

- 选中 Feed 时，左边只保留目的地（项目首页 + 已启用插件 + 插件市场）和账号。不再渲染 Feed Item 列表、不再出现 Feed / 来源 子页签，也不再把来源做成独立 `work surface`。
- 右边主区是 Feed 目录，不是切页阅读器：
  - 第一项 **全部**：该项目所有来源拉到的条目；
  - 下面每一项是一个任务 = 已配置来源 + 拉取状态；
  - **添加任务**：在目录里展开表单，配源并开始拉取，不另开一页；
  - 点任务：在该任务下展开条目列表（标题 + 一条次要事实 + 行内快处理）；
  - 点条目：在同一行下面展开详情（正文、加入 Inbox、升 Goal、查看来源），再点可收起。不进入第二页，没有「返回列表」。
- 快处理留在行上，至少保留现有 **忽略**。详情里做完整处理。
- 点 Feed 目的地进来：恢复上次展开的任务、打开的条目、滚动位置。
- 查看来源：选中并展开对应任务，不跳到来源专用页。
- 视觉：左边任务目录仍用目录行；右边条目行对齐 Goal 舞台列表，见 `specs/archive/feed-stage-list-row/spec.md`。详情展开是同一目录的延伸，不是大卡空状态。
- 窄屏：左边目的地仍是抽屉；右边仍是这份可展开目录，同样不切页。
- 尊重 `prefers-reduced-motion`。展开用高度/内容显现，不要整页位移进场。

### 非目标

- 不把来源升成目的地或第三插件。
- 不在主区再拆「列表 | 正文」第三栏。
- 不重做 Inbox、Goals 树、Sessions、Artifacts、诗意首页。
- 不改拉取、规则出 Artifact、Connector 领域语义；只改它们出现的位置。
- 不把「任务」做成 Goal；界面可叫任务，对象仍是来源。

## 使用场景

1. 点 Feed：左边目的地高亮 Feed，下面没有 Item 列表；右边看到全部 / 各任务。
2. 全部已展开：扫混流，点 **忽略** 去掉一条；点标题展开正文和处理，再点收起，下一条仍在下面。
3. 点 GitHub：全部收起（同时只展开一个任务，避免同一条出现两次），只看这个源拉到的条目。
4. 添加任务：目录底部展开名称和来源地址，开始拉取后该任务出现在全部下面，条目进来后可展开。
5. 去 Goals 再回来：还停在刚才那个任务和展开的那一条。
6. 详情里点查看来源：右边展开该来源任务，条目仍在这份目录里。

## 方案与关键决策

1. **Feed 是目的地的例外。** `specs/directory-plugin-switcher/spec.md` 的「下面只换当前选中项的列表」对 Feed 改为：下面不挂列表，列表搬到主区。Goals / Inbox / Sessions / Artifacts / 首页不变。
2. **主区是目录，不是页面栈。** 任务 → 条目 → 详情都是同一棵树的展开。禁止 Feed 主区 `hidden` 整页切换成「列表页 / 详情页 / 来源页」。
3. **全部是第一个任务，不是筛选芯片。** 它的子级是跨源条目。
4. **同时只展开一个任务。** 避免全部和 GitHub 下出现两条相同 Item。条目详情同时只展开一条。
5. **来源配置属于任务。** 添加时设置；已有任务的配置从该任务进入（行内或该任务下展开），不再占用独立 work surface。

## 输入输出与依赖

- 输入：现有 Feed Item、Source、同步状态、忽略/Inbox/升 Goal 动作。
- 输出：Feed 选中时的壳层 DOM（左无 Feed 列表，右为可展开目录）、状态恢复、窄屏抽屉。
- 依赖：Feed Plugin 仍拥有来源与流水；Workbench 只改壳与目录呈现。
- 不改 MCP、Artifact 版本规则、用户真实库。

## 文件 / 模块边界

- `apps/workbench/src/scripts/client/navigation-feed.ts`、`events-secondary.ts`、`immersive-navigation.ts`：去掉 Feed/来源双 surface 切页；点 Feed 只换主区这份目录。
- `apps/workbench/src/goals-page-renderer.ts`、`immersive-shell.ts`：选中 Feed 时不渲染左边 Feed/来源 panel 与 `data-feed-views`。
- `plugins/native/feed/src/ui.ts` 与 workbench Feed 投影 UI：主区改为任务树 + 行内详情。
- `apps/workbench/src/styles/immersive-directory.ts`、`immersive-navigation.ts` 及 design-system Feed 样式：主区目录语法，去掉来源页进场。
- 测试：`tests/immersive-directory.e2e.test.ts` 及现有 Feed 目录/详情相关测试，按新 IA 改断言。
- 必要时更新 `DESIGN.md` 当前工作台段落与 `.impeccable/surfaces/immersive-workbench.md`。

## 验收

1. 选中 Feed：左边只有目的地，无 Item 行，无 Feed / 来源 子页签。
2. 右边第一项是全部，下面是来源任务；点任务展开条目，点条目展开详情，再点收起；地址栏/主区不出现第二页。条目标题占满行内剩余宽度，不能被挤成一两字省略号。
3. 行上可忽略；详情可加入 Inbox、升 Goal；查看来源展开对应任务。
4. 添加任务在目录内展开表单并开始拉取，不弹独立来源工作台。
5. 离开 Feed 再回来，任务展开与打开的条目还在。
6. 浅色 / 深色 / 窄屏抽屉可用。定向测试按新选择器通过。

## 验证命令

```
npx --yes pnpm@9 --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/immersive-directory.e2e.test.ts \
  tests/feed-native-plugin.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`，禁止打默认 home。

## 假设与开放问题

- 假设：一骏确认的是「左边目的地 + 右边 Feed 目录展开」，不是把任务树放进左边。
- 搜索、筛选面板是否迁到右边目录顶：执行时按现有 Feed 搜索能力原样迁过去，不新发明筛选。
- 任务行是否显示同步失败：沿用现有来源状态文案，放在 11px 次要行。
- 往 Frame 拖 Feed 条目：本期仍可从展开的条目行拖；不为此恢复左边 hidden 列表。
