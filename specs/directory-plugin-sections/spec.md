# 工作台目录：插件分段，列表收进对应插件

状态：本地已验收。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不发布、不安装新 App。

本文件是这次目录信息架构的唯一需求书。它取代：

- `specs/directory-plugin-switcher/spec.md` 里「上面目的地、下面独占一块当前列表」；
- `specs/workbench-tab-workspace/spec.md` 里「左边仍是目的地 + 下面换列表」；
- `specs/feed-stage-directory/spec.md` 里「选中 Feed 时左边不挂列表」。

右边分组标签、分栏、各插件主表面与领域事实仍以 `specs/workbench-tab-workspace/spec.md` 和既有插件合同为准。本文件只改左边目录怎么挂列表。

## 背景与目标

当前左边是两段：上面永远是项目首页和已启用插件，下面再开一块 `directory-list-region` 只显示当前插件的列表。Goals 出现两次（入口 + 列表标题），首页还空出一块标题区。列表看起来像壳层另开的一栏，不像插件自己的内容。

目标：每个有内容的插件是一段。列表嵌在该段下面。多个插件可以同时展开。中区超出就滚，不画滚动条。

## 当前行为与问题证据

- `renderImmersivePluginStrip` 和各插件 `data-directory-panel` 是兄弟：条在上，panel 全部塞进 `wrapDirectoryListRegion`。
- `setDesktopDirectory` 一次只显示一个 panel，其它 `hidden`。
- 共享 `directory-list-chrome` 再写一遍插件名；`display: contents` 网格把各插件工具条拼到标题行。
- Feed 来源任务已在左边（`DESIGN.md`），条目在右边；不要再把 Item 流水塞回目录。

## 范围与非目标

### 范围

- 左边中区改成插件分段：项目首页、已启用插件、插件市场。有列表的插件把现有 directory panel 挂在自己下面。
- 同时可展开多个插件。展开状态按项目记在本机。
- 中区（插件分段）共用一个滚动容器。超出可滚；滚动条不出现（含悬停时的 overlay 拇指）。滚轮、触控板、触摸、键盘、把焦点行滚进视口仍可用。
- 各插件列表不再自建滚动层，避免套两层滚动。
- 点插件名：在焦点栏添加该插件母标签（`specs/additive-tabs/spec.md`）；若该段收着则一并展开。
- 点段的展开控件：只开/收列表，不换右边。
- 点列表里的 item：在焦点栏添加一张该 item 标签，不替换已有标签。
- 当前插件高亮跟焦点栏走，与各段是否展开无关。
- Feed 左边挂来源任务（含「全部」）；条目列表和详情仍在右边。不再把「来源」做成会换掉整列的第二目录。
- 首页、插件市场没有内容列表，不出现空标题区。
- 插件操作（筛选、新建、归档等）在该段标题下方单独一行，展开时可见；收起时只留图标和名称。当前壳层以 `specs/chrome-plugin-rail/spec.md` 为准。
- 项目头和账号底栏不滚。
- 窄屏 600px 抽屉同一套分段。

### 非目标

- 不改右边标签、分栏、Frame、插件市场页、设置页。
- 不改 Goal 树父子展开、Feed 拉取、Inbox/Session/Artifact 领域行为。
- 不把段标题做成吸顶。
- 不给目录画自定义滚动条或底部渐隐提示。
- 不把账号收进某个插件。
- 不把快捷方式挂在目录里；快捷方式位置以 `specs/home-shortcuts-return/spec.md` 为准。
- 不恢复目录内搜索框；全局搜索仍在项目头。

## 使用场景

1. 打开项目：首页、Goals、Sessions、Inbox、Feed、Artifacts、插件市场都在。有列表的插件默认展开。右边仍是首页标签。
2. Goals 树和 Feed 来源同时看得见。点某个 Goal 开标签；Feed 段不必收起。
3. 内容超出中区：触控板往下滚能看到后面的插件；轨道上没有滚动条。
4. 点 Goals 段的展开控件收起树；Sessions 仍开着。右边若正在看某个 Goal，高亮仍在 Goals。
5. 点 Feed 名称：Feed 组母标签激活；若 Feed 收着则展开。点某个来源任务：右边换成该范围的条目。
6. 全局搜索落到某条 Session：Sessions 段若收着则展开，并把该行滚进中区。
7. 刷新同一项目：哪些段开着还在。
8. 手机拉开目录抽屉：同样可多段展开，同样无滚动条。

## 方案与关键决策

1. **插件是段，不是上面一条目的地加下面一块独占列表。** 取消 `directory-list-region` 作为唯一列表舞台。每个有列表的插件：`段头 + 该插件已有 panel`。
2. **展开和当前插件分开。** `data-desktop-directory` / `aria-current` 只表示当前插件。各段 `aria-expanded` 独立。`setDesktopDirectory` 不再把它人的 panel 藏掉。
3. **默认全开。** 有列表的已启用插件第一次进入项目时展开。之后按项目记住用户收起过哪些。首页和市场永远不是一段列表。
4. **一个滚动口。** `.directory-content-scroll` 是唯一 `overflow` 容器。`.tree-scroll`、Feed/Session/Inbox 列表外壳改为随内容增高，不自己出滚动口。
5. **无滚动条。** `scrollbar-width: none`、`::-webkit-scrollbar { width: 0; height: 0 }`。禁止 `overflow: hidden` 冒充「没有滚动条」。
6. **点名与展开分开。** 段头左侧展开控件只管开收；名称/图标走现有 `data-work-surface-open`。点 item 走 chrome-tabs-preview-groups 的预览/钉住合同。
7. **Feed 与其它插件同一语法。** 左边是任务/来源；右边是该任务的条目与详情。旧 `data-directory-panel="sources"` 不再作为与 Sessions 同级的目录页。

## 输入输出与依赖

- 输入：已启用插件、各插件现有 directory HTML、按项目 UI 状态、焦点栏当前插件。
- 输出：分段目录 DOM/CSS、展开状态持久化、中区无滚动条的可滚动容器、与 tab-workspace 的点击合同保持。
- 依赖：各插件仍拥有自己的列表控件和主表面；工作台只改挂载、显隐和滚动。
- 不改 MCP、Goal 事件、Artifact 版本、用户真实库。

## 文件 / 模块边界

- `apps/workbench/src/immersive-shell.ts`：去掉独占列表区包装；段头含展开控件。
- `apps/workbench/src/goals-page-renderer.ts`：panel 挂到对应插件段内，不再集中塞进 list-region。
- `apps/workbench/src/styles/immersive-navigation.ts`、`immersive-directory.ts`：分段布局、单滚动口、藏滚动条。
- `apps/workbench/src/scripts/client/events-secondary.ts`、`navigation-feed.ts`、`immersive-navigation.ts`、`documents-state.ts`：展开与当前插件解耦；持久化展开；搜索/深链时展开并滚到目标。
- 各插件 directory 渲染只改挂载所需标记（工具条仍 `data-directory-list-actions`），不重做行模型和领域控件。
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`：目录段落改成分段而不是目的地+下列表。
- 测试：`tests/immersive-directory.e2e.test.ts`、`tests/immersive-workbench.e2e.test.ts`、`tests/chrome-inner-scroll.e2e.test.ts`、`tests/project-home-start.e2e.test.ts`、相关 Feed/Goals 目录断言。

## 验收标准

1. 打开项目：左边能同时看到至少两个已启用插件的列表（例如 Goals 树和 Feed 来源）；没有共享的「Goals / Feed」列表标题区；首页和市场下没有空列表说明。
2. 收起 Goals 后 Sessions / Feed 仍可开着；点 Goals 名称仍预览/钉住画布（见 chrome-tabs-preview-groups）；点展开控件不换右边当前标签。
3. 中区内容高于可视高度时可滚到后面的插件；计算样式下滚动条宽度为 0，不出现经典或 overlay 拇指。`prefers-reduced-motion` 下展开无位移花活。
4. 点 Goal / Session / Inbox / Artifact 行仍走预览/钉住；点 Feed 来源任务仍只换右边该范围的条目，不把 Item 铺进左边。
5. 刷新后展开状态按项目恢复。全局搜索命中某 item 时，对应段展开且该行在中区可见。
6. 窄屏抽屉可开可关；分段行为与桌面相同。
7. 定向测试通过。隔离浏览器可走：全开 → 收起 Goals 仍见 Feed → 点 Session 开标签 → 滚过长列表仍能点到后面的插件。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 \
  tests/immersive-directory.e2e.test.ts \
  tests/immersive-workbench.e2e.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts \
  tests/project-home-start.e2e.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/workbench-pane-feed.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须 `--home` 临时目录，禁止 `pnpm web` 打默认 home。

## 假设与开放问题

- 假设「支持都展开」= 能力且默认全开，不是每次进项目强制重新全开（记住用户收起过的段）。
- 假设无滚动条不等于不能滚；也不做渐隐遮罩。
- Goal 树「折叠全部」已由 `specs/goals-directory-remove-collapse-all/spec.md` 删除；行级折叠仍只折叠 Goal 节点，不收起 Goals 这一段。
- 未启用的插件不出现。市场新加的插件以展开状态插入分段。

## 验收结果

| 项 | 结果 |
| --- | --- |
| 1 多段同时展开，无共享列表标题，首页/市场无空列表 | 通过。隔离 4191：Goals 12 行与 Feed 来源同时可见；无 `[data-directory-list-title]` / `[data-directory-list-region]`；首页和市场段没有 directory panel。 |
| 2 收起 Goals 后 Feed 仍开；点展开不换右边 | 通过。Goals `aria-expanded=false` 时 Feed 仍可见；首页标签仍当前。点 Sessions 名称才换到 Sessions 预览/标签。 |
| 3 中区可滚且无滚动条 | 通过。520 高时 `scrollHeight > clientHeight`，`scrollbar-width: none`，`::-webkit-scrollbar` 宽 0。滚到「插件市场」可点开独占页。 |
| 4 点 item 走预览/钉住；Feed 来源只换右边 | 通过。`workbench-tab-workspace` 与 `workbench-pane-feed` e2e；目录里是 Feed 来源任务，条目不铺进左边。 |
| 5 刷新恢复收起；搜索展开并滚到行 | 通过。收起 Goals 后刷新仍收着。`immersive-directory`：搜索 CORE 时 Goals 段展开且树行在中区相交。 |
| 6 窄屏抽屉 | 通过。`immersive-directory` 390 抽屉 264px，选 Goal 后关闭。 |
| 7 定向测试与隔离路径 | 通过。workbench typecheck/build；spec 列出的 12 项 e2e 全绿。隔离 `--home` 走完：全开 → 收起 Goals 仍见 Feed → 点 Session 开标签 → 滚到市场。 |

试用目录 `/var/folders/.../molis-dir-sections-*`，未打默认 home。快捷方式位置仍以 `specs/home-shortcuts-return/spec.md` 为准。标签单击添加、不替代以 `specs/additive-tabs/spec.md` 为准。
