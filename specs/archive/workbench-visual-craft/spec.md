# 工作台视觉与动线打磨

状态：已实现。完成等级 **3：功能可用**。不换身份、不改用户库、不提交、不宣称可发布。

## 背景目标

一骏要求全局打磨视觉、UI、布局、信息陈列、动效、动线，并丰富图标与色彩。现有世界已经是 Linear × coss：锌色壳、14 色相、插件所有权色、`mw-*` 控件。问题不是缺一套皮，而是身份色停在左栏、舞台仍像灰纸、空态没有对象图标、切插件没有连续感、对话浮窗过宽压住工作面。

## 当前行为与问题证据

- `--plugin-tint` 只绑在轨按钮和目录面板上，`[data-work-surface]` / `.tab-item` 吃不到，空态标记和选中行仍是灰。
- 插件栏当前项是静态洗底；切插件时色块硬切，没有已有分段滑块那种位移。
- Dataset / Forms / Pages / Functions / PPT / 灵光空态只有文字，没有 16px Lucide 标记。
- 舞台详情栏操作和标题挤在一排，删除和导出视觉权重一样。
- Dataset 工具条、表、版本同一灰底等权；表是内容主体，却没有从工具里跳出来。
- Assistant 浮窗 `min(360px, 100vw - 64px)`，打开后像一条横幅盖在表上。
- `creative-arrive` 只活在 Form/Dataset/PPT 内部，菜单和舞台切换没有同一条到达曲线。

## 范围与非目标

做：

1. 身份色跟到当前舞台、标签图标、目录选中行、空态标记、新建按钮图标（约 8–12% 洗底，纸面仍是 `--paper`）。
2. 插件栏当前项改用已有分段滑块位移，洗底带该插件 `--plugin-tint`。
3. 舞台到达、纸面菜单、对话浮窗共用 6px 上升 + 透明度（舞台 190ms，菜单 130ms）。
4. 详情栏：标题/状态在左，动作在右，删除用危险色。
5. Dataset/Form 工具条收成一条浅身份色条，表回到纸面；标题字段 16px。
6. 对话浮窗固定约 300px 宽、约 32px 高的单行输入条，从图标右侧打开，带到达动效。
7. 六个缺图标的插件空态补上对象 Lucide。

不做：不换字体/圆角/密度，不恢复下划线标签，不把纸面涂成插件色，不新做总控台，不接通 Assistant，不改 Goal 画布节点尺寸，不改产品数据契约。

## 使用场景

1. 打开 Dataset：左栏 Dataset 洗底滑过去，列表空态是绿色数据库图标，点进表后工具条带浅绿，格子仍是白纸。
2. 切到 Forms：栏上滑块移到橙色，问卷空态是清单图标。
3. 打开对话：按钮右侧出现一条约 32px 高、300px 宽的输入条，不盖住整张表。
4. 下拉列类型：`mw-menu` 从触发器升起，不是系统菜单。
5. `prefers-reduced-motion`：滑块和到达动效停掉，静态选中仍在。

## 方案与关键决策

- Operate 精修，不换世界。色只编码所有权和找路。
- 杠杆在 `palette` / `interaction-texture` / `micro-interactions` / 共用 `plugin-stage`，插件只补空态图标和工具条节奏。
- 分段滑块已能量宽高；栏轨复用它，额外把当前项 `--plugin-tint` 抄到 `--seg-tint`。
- Goals 舞台 DOM 是 `data-work-surface="goal"`，绑定里给 alias。

## 输入输出与依赖

输入：既有 `MW_PLUGINS`、`data-plugin-id` / `data-work-surface` / `.tab-item[data-plugin]`、分段滑块脚本。  
输出：同一套 HTML 结构上的色、空态图标、到达动效、详情栏与工具条节奏。无新协议。

## 文件 / 模块边界

允许改：`packages/design-system/src/palette.ts`、`styles/interaction-texture.ts`、`styles/micro-interactions.ts`、`styles/primitives.ts`、`select-menu-client.ts`；`apps/workbench/src/styles/plugin-stage.ts`、`immersive-navigation.ts`、`project-home.ts`、`scripts/client/assistant-island.ts`；六个插件的 `ui.ts` / `styles.ts`；`DESIGN.md`、相关测试、本 spec。

## 验收标准

1. `renderPluginTintBindings()` 含 `[data-work-surface="feed"]` 与 `.tab-item[data-plugin="feed"]`，Goals 含 `data-work-surface="goal"`。
2. 插件栏 `.plugin-rail-items` 进入分段滑块选择器；当前项洗底用 `--seg-tint`。
3. `.mw-empty__mark` / `.mw-empty > svg` 颜色为 `var(--plugin-tint, …)`。
4. Dataset/Form/Pages/Functions/PPT/灵光空态带对象图标。
5. `creative-arrive` 在设计系统层，菜单与 `.is-arriving` 使用它。
6. `.assistant-composer` 宽度上限 300px。
7. 详情栏删除按钮颜色走 `--red`。
8. 完成等级 3。reduced-motion 去掉位移和到达。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/primitives.test.ts \
  tests/visual-foundation.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/functions-plugin.test.ts \
  tests/pages-plugin.test.ts \
  tests/lingguang-plugin.test.ts \
  tests/creative-tools-plugins.test.ts
```

浏览器：首页 → Dataset 空态/表 → Forms → 对话浮窗 → 列类型菜单。

## 假设与开放问题

- 栏上市场 `+` 仍无身份色，滑块不会停在它身上，除非它是当前项。
- Catalog 动效标本记 later，本切片不扩 Catalog 页。
- 续作：[舞台列表与首页事件信息紧凝](work-items/stage-list-cluster/spec.md)。
