# 去掉 Goals 目录「折叠全部」

状态：本地已验收。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次体验变更的唯一需求书。它取代：

- `specs/directory-title-toolbar/spec.md` 里「折叠全部保留」；
- `specs/global-plugin-search/spec.md` 里「折叠全部保留」；
- `specs/directory-plugin-sections/spec.md` 里「折叠全部仍只折叠 Goal 节点」。

筛选、新建、归档、回收站、行级折叠与折叠状态持久化仍以既有 Goals 目录合同为准。

## 背景目标

Goals 目录工具栏有一颗「折叠全部」：树形图标、`data-collapse-all`，一点就把当前树所有节点收起或展开。主工作面已经是画布/看板，左边只是定位列表；有子 Goal 的行自己还有箭头。这颗按钮重复、图标又和「返回 Goal Tree」撞车。

目标：工具栏不再出现「折叠全部」。完成等级 **3：功能可用**。

## 当前行为与问题证据

- `plugins/native/goals/src/tree-ui.ts` 的 `renderTreeChrome` 始终渲染该按钮（归档/回收站视图也在）。
- `tree-client.ts` 的 `handleTreeCollapseAllClick` 对所有 `[data-tree-item]` 统一 `is-collapsed`，再写 `saveUiState`。
- 工作台点击委托 `events-secondary.ts` 单独接这条路径。
- 实测：图标是 `icon("tree")`，桌面只显示图标，文案藏在 `span` 里；`aria-label` / `title` 为「折叠全部」。

## 范围与非目标

做：

- 删除按钮、点击处理、英文词条 `折叠全部`。
- 生产代码与 Goals 目录测试不再引用 `data-collapse-all` / `handleTreeCollapseAllClick`。
- 旧 spec 里「保留折叠全部」的句子改成指向本文件。

不做：

- 不删行上 `[data-tree-toggle]`，不改折叠态按项目恢复。
- 不改筛选、新建、归档、回收站。
- 不改画布、看板、Goal 工作框、MCP、用户库。
- 不改 `docs/design/immersive-workbench/` 历史原型。

## 使用场景

1. 打开 Goals 目录：工具栏只有筛选、新建、归档、回收站，没有树形「折叠全部」。
2. 有子 Goal 的行：点箭头仍可单独收起/展开，刷新后该行折叠态还在。
3. 归档 / 回收站：同样没有这颗按钮；「返回 Goal Tree」仍用树形图标。

## 方案与关键决策

一键全折叠从目录 chrome 拿掉，不改成「展开全部」，也不藏到菜单。批量折叠不再是目录能力。

## 输入输出与依赖

- 输入：现有 Goal 树 HTML、行级折叠、UI 状态存储。
- 输出：无 `data-collapse-all` 的 tree chrome；客户端工厂不再导出 collapse-all 处理。
- 依赖：Goals Native Plugin 的 tree UI/client，Workbench 点击委托装配。

## 文件 / 模块边界

允许改：`plugins/native/goals/src/tree-ui.ts`、`tree-client.ts`、`tree-en.ts`；`apps/workbench/src/scripts/client/events-secondary.ts`、`refresh-decisions.ts`；本 spec 指向的旧 spec 句子；`tests/goals-tree-ui.test.ts`。

不改：Goals 事件、看板、画布、安装发布。

## 验收标准

1. Goals 目录 chrome（含归档/回收站）没有 `data-collapse-all`，也没有「折叠全部」按钮文案。
2. 生产脚本没有 `handleTreeCollapseAllClick` / `[data-collapse-all]` 处理。
3. 英文目录不再翻译「折叠全部」。
4. 行级折叠按钮仍在有子节点的行上。
5. 筛选、新建、归档、回收站入口仍在。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts
```

`tests/i18n.test.ts` 不作为本次门禁：当前目录里另有一批与本改动无关的缺口。本改动的英文合同由 `GOALS_TREE_EN` 不再包含「折叠全部」覆盖。

## 假设与开放问题

- 已保存的节点折叠列表继续有效；只是不能再靠工具栏一次改全部。
- 无未决产品问题。

## 验收结果

| 项 | 结果 |
| --- | --- |
| 1 chrome 无折叠全部（含归档） | 通过。`tests/goals-tree-ui.test.ts` |
| 2 生产脚本无 collapse-all 处理 | 通过。工厂脚本断言；`apps/`、`plugins/` 无 `data-collapse-all` / `handleTreeCollapseAllClick` |
| 3 英文目录无「折叠全部」 | 通过。`GOALS_TREE_EN` 不含该键 |
| 4 行级折叠仍在 | 通过。嵌套树仍渲染 `data-tree-toggle` |
| 5 筛选/新建/归档/回收站仍在 | 通过。同一 chrome 测试仍匹配对应标记 |

`docs/design/immersive-workbench/` 历史原型未改。