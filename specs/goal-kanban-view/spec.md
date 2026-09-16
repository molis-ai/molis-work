# Goal 看板视图

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它在 Goals 母标签（见 `specs/workbench-tab-workspace/spec.md`）上增加与关系画布平级的看板视图，不取代画布、Goal 工作框、item 标签或 Frame。

Goals 母标签页右上角用开关切换「画布 | 看板」。Frame 仍只在标题栏出现。主屏插件组 / item 标签仍由 tab-workspace 管。

## 背景与目标

Goals 主区现在只有关系画布（依赖、位置）和各 Goal 的 Frame。状态分布要靠扫节点或读左目录。需要同一批 Goal 的第二种主视图：按卡片上那套可见状态分列。

目标：用户在 Goals 母标签页右上角 **画布 | 看板** 之间切换；看板只读分组；点卡片展开现有 Goal 工作框。

## 当前行为

- Container 钉住一个 `Goal 画布` Tab，后面是已打开的 Frame Tab。
- 画布节点展示可见状态、标题、预期结果、父 Goal「属于」，点 maximize 展开 Goal 工作框，点 frame 打开 Frame。
- 可见状态由现有 `display_status` 计算，不是可随意改写的标签：可继续、进行中、等你、等待中、受阻、已完成。归档 / 回收站走独立集合，不在当前树画布上。
- 关掉 Frame 或再进 Goals 时，视图会回到画布，没有「上次停在哪种板」的记忆。

## 范围与非目标

### 范围

- Goals 母标签页右上角两个视图开关：`画布`、`看板`（英文 `Board`）。Frame 打开时才用标题栏的 Frame Tab。
- 看板占画布那个主区，与画布互斥；Frame 仍盖在它们上面。
- 六列固定，顺序与现有可见状态一致：可继续、进行中、等你、等待中、受阻、已完成。空列保留。
- 卡片消费与画布节点同一批当前树 Goal 与同一套字段：状态、标题、预期结果、父 Goal「属于」。
- 点卡片 = 展开该 Goal 的现有工作框（与画布 `data-graph-open` 同一条路径）。不因此新开 Frame。
- 列间、列内都不拖；不写 Goal 状态、关系、完成门槛。
- 每个项目记住最后停在画布还是看板。收起 Goal 工作框、关掉 Frame、再进入 Goals，都回到该视图。
- 左边点一条当前树 Goal：不新开 Frame。当前是画布或看板时，按工作台规则打开该 Goal 的 item 标签（现有工作框）。当前是 Frame 时，回到该项目记住的画布或看板并选中该 Goal。
- 零 Goal 时六列都空；创建仍走现有入口。不加教程空态或说明腔。
- 桌面整宽 Goals 面板：六列均分可用宽度，看板本身不出现横向滚动条。
- 看板面板窄于 840px（窄屏或分屏拉窄）时收成 Linear 那种按状态分组的列表：贴齐面板纸面，不套第二层卡片；组头是通栏 32px 细条（不是 hug 胶囊），含小 caret、16px 细线状态盘、弱化组名和计数；行通栏 36px，只保留状态盘和单行常规字重标题，完成项再降对比；不伪造 ID、经办人、日期或新建按钮；整表纵向滚动，不再横滑。
- 宽屏卡片紧凑：标题在上，预期结果最多两行，状态与「属于」同一行。列内卡片超出时仍只在该列滚动。
- 中英文、深浅色沿用现壳。

### 非目标

- 跨列改状态、列内排序持久化、自定义列。
- 看板里编依赖、改布局、当第二张关系图。
- 新插件条入口、独立路由、新后端协议或数据库字段。
- 把归档 / 回收站 Goal 放进看板。
- 点卡片打开 Frame（Frame 仍走画布节点上的 Frame 按钮，或已打开的 Frame Tab）。
- 替换左目录列表。
- 教程旁白、重复标题、教你怎么用的 overlay。

## 使用场景

1. 打开 Goals：看到上次的画布或看板；页角可点到另一侧。
2. 看板上，进行中的 Goal 在「进行中」列；点它展开工作框；收起后仍在看板。
3. 打开某条 Goal 的 Frame，关掉 Frame：回到看板（若离开前在看板），不是画布。
4. 看板上点左目录另一条 Goal：打开该 Goal 的 item 标签，不新开 Frame；收起后仍回到看板。
5. 在 Frame Tab 上点左目录 Goal：不新开 Frame，回到记住的那块板并选中。
6. 没有任何 Goal：六列空着，仍可从现有入口创建。
7. 窄屏或分屏拉窄：六组状态列表纵向排列，组头可折叠，点行仍展开工作框，不出现看板横滑。
8. 桌面整宽看板：六列同时可见，不必横滑；当前树里常见的几张卡片不必先滚动列。

## 方案

Goals 插件渲染看板，输入与画布相同：当前树 Goal、可见状态、part_of 父标题。不新增查询。Workbench 扩展 Container：`activeTab` 为 `canvas` | `kanban` | `goalId`。看板与画布是两种 board 视图；Frame 仍是第三种。

上次 board 视图随现有 Frame Container 的按项目本机暂存一起写，不进 Goal 事件。切项目换整套 Tab 和该项目记住的 board 视图。

选中态与左目录、画布节点共用当前 Goal。工作框展开时，页角开关藏起来；当前项仍是看板或画布（看你从哪进来），不是 Frame，除非用户另开了 Frame Tab。

## 输入输出与依赖

- 输入：当前树 Goal 列表、`display_status`、outcome、part_of、现有展开工作框与 Frame Container。
- 输出：看板 HTML、视图 Tab、本机记住的 `canvas` | `kanban`。
- 依赖：Goals 可见状态标签、`data-graph-open` 展开路径、Frame Container 的 Tab 持久化。
- 不依赖：新 API、新完成算法、拖放写状态。

## 文件边界

- `plugins/native/goals`：看板渲染（与 momentum 画布并列的 UI 贡献或同模块新表面），复用可见状态。
- `apps/workbench/src/goals-page-renderer.ts`：挂载看板表面。
- `apps/workbench/src/scripts/client/frame-container.ts`：页角视图开关、显示互斥、记住 board 视图、关 Frame 回到该视图。
- 选中/展开接线：现有 graph/selection 客户端，看板卡片走同一 `applySelection` + 展开，不复制一套 Goal 工作框。Frame 上点目录在 `events-secondary` 走 `locateGoal`，不打开 item。
- `apps/workbench/src/styles/*`、`apps/workbench/src/i18n/en.ts`，以及 goals 的 en 目录。
- 测试：看板渲染单元、Container 切换与记忆的定向测试、一条浏览器路径（切换、点卡片展开、收起仍在看板）。
- 不改 `docs/design/` 历史原型。Frame spec 中「点目录回到画布 Tab」以本文件为准。

## 验收

1. Goals 母标签页右上角可切换「画布」「看板」；两者互斥占主区。Frame 打开时才出现标题栏 Frame Tab。
2. 六列标签与画布卡片可见状态一致；空列在；归档/回收站 Goal 不出现。
3. 卡片字段与画布节点一致（状态、标题、预期结果、属于）；点卡片展开现有 Goal 工作框，不新开 Frame。
4. 不能靠拖卡片改变 Goal 状态或顺序。
5. 项目级记住画布/看板；关 Frame、收起工作框、刷新后再进 Goals，停在离开时的那块板。
6. 左目录点当前树 Goal：在画布/看板上打开 item 标签、不新开 Frame；在 Frame 上则回到记住的板并选中。
7. 零 Goal：六列空，无说明腔；创建入口仍可用。
8. 中英文标签完整；浅色/深色/窄屏可阅读、可点开。
9. 1440 桌面整宽：看板 `scrollWidth` 不超过自身 `clientWidth`，六列并排。390 或面板宽度低于 840px：贴纸面通栏分组列表、不横滑，组头是全宽细条可折叠，caret 展开后仍清晰可见，行是状态盘和单行标题。宽屏标题在预期结果之前，预期结果不超过两行。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/i18n.test.ts \
  tests/goals-momentum-ui.test.ts \
  tests/goals-kanban-ui.test.ts \
  tests/goal-kanban.e2e.test.ts \
  tests/workbench-frame-container.e2e.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts
```

Chrome e2e 需要非沙箱。用隔离项目跑浏览器路径，不写用户库。

## 假设

- 看板与画布共用当前树，不跟左目录筛选另绑一套数据。
- 英文 Tab 用 `Board`，不用 `Kanban`。
- 看板上的卡片不需要 Frame 按钮；打开 Frame 仍从画布节点或已有 Frame Tab。
- 窄屏空组默认收起；拉宽后强制全部展开。折叠状态不跨刷新保存。
- 窄屏列表复刻 Linear issue group 的材料：通栏组头细条、小 caret、细线状态盘、贴纸面，不伪造 ID/activity 列。
