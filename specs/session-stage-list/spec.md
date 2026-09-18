# Sessions 舞台列表对齐 Goals

状态：执行完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它覆盖 `specs/session-directory-goal-row/spec.md` 和 `specs/session-directory-runtime-folds/spec.md` 里「Sessions 住在第二栏目录」的合同，对齐 `specs/goals-stage-chrome/spec.md` 与 `specs/goals-list-workspace-split/spec.md`。

## 背景目标

Goals 点插件条没有第二栏，内容区默认是拉满的列表；点一行，宽屏列表收成目录列宽，右边出正文。Sessions 仍占左边窄目录，行上不显示关联 Goal，点开只在右边换详情。

目标：Sessions 用同一套交互。完成等级 3。

## 当前行为与问题证据

- 点 Sessions：`data-directory-open="sessions"` 打开第二栏；`is-plugin-directory-empty` 为 false。
- 目录行只显示标题和「可查看 / 已归档」；Goal 名在 DOM 搜索字段里，不可见。
- 打开 Sessions 会选中第一条并显示详情，没有「先看完整列表」的默认态。
- Goals 宽屏单击是列表主从，不是整表消失。

## 范围与非目标

做：

- Sessions 不再贡献 `data-directory-panel="sessions"`。点 Sessions 只开工作面，第二栏保持收起。
- 默认内容区是拉满的 Session 列表：Runtime 分组保留；行是单行 28px，标题 | 当前 Goal | 状态。没绑 Goal 写「未关联」。
- 新建、筛选挂在舞台左上，叠在列表纸面上，不要第二栏工具条。
- 宽屏单击一行：`data-expanded="true"`，列表收成目录列宽（`--tree-width`，未拖过默认 240px），右边是现有 Session 详情（执行内容）。窄屏列表藏起，正文铺满；返回按钮回到列表。
- 打开 Sessions 不自动选中第一条。筛选在未展开时不擅自打开详情。
- 关系、新建、Handoff、归档、内容读取语义不变。

不做：

- 不给 Sessions 做画布 / 看板，不加独立 Frame 画布。拖到 Goal Frame 仍用现有 `data-frame-asset="session"`。
- 不改 Session 与 Goal 的 0 或 1 当前关系，不改 Handoff / Adapter。
- 不改 Feed / Inbox / Shelf / Artifacts 目录。
- 不改用户真实库。

## 使用场景

1. 点 Sessions：左边只有插件条；内容区是宽列表，能看到每条绑的 Goal。
2. 点一行：宽屏左边留下窄列表，右边出这条执行内容；再点另一行只换正文。
3. 点返回：回到铺满列表，没有选中项。
4. 没绑 Goal 的行显示「未关联」；点开后主按钮仍是「选择当前 Goal」。
5. 窄屏点 Sessions 进内容区列表，不打开空目录抽屉；点一行只看正文，返回回列表。

## 方案与关键决策

- Host：Sessions 与 Goals 一样，插件条不带 `data-directory-open`；没有 panel 就不打开第二栏。
- Work `directory` surface 返回空；列表和 chrome 改挂在 `main` 的 `session-stage-shell`。
- 行上 Goal 是当前 Goal 标题，不是历史。历史仍在详情关系轨。
- 宽屏展开时藏 Goal 列，只留标题和状态，对齐 Goals 窄栏藏进度/前置。
- 点 Runtime 分组标题只开合，不自动打开第一条。
- Runtime 分组下的 Session 行相对分类 caret 缩进 16px，合同见 `specs/session-list-runtime-indent/spec.md`。

## 输入输出与依赖

输入：现有 `ProjectSessionRecord`（`currentGoal`、`runtimeId`、状态）。输出：同一套选中、读取、关系、新建 API。依赖：Host 按 panel 有无开第二栏、Goals 主从目录列宽合同。

## 文件 / 模块边界

- `plugins/native/work/src/ui/render.ts`、`directory-client.ts`、`styles.ts`、`en.ts`、`browser.ts`、`contribution.ts`（directory 可空）
- `apps/workbench/src/immersive-shell.ts`、`goals-page-renderer.ts`、`scripts/client/tab-workspace.ts`、`immersive-navigation.ts`、`styles/detail-reading.ts`、`tab-workspace.ts`
- 测试：`tests/work-session-ui.test.ts`、`tests/session-web.test.ts`、`tests/desktop-tui.test.ts`、`tests/immersive-directory.e2e.test.ts`、`tests/immersive-workbench.e2e.test.ts`、`tests/chrome-inner-scroll.e2e.test.ts`、`tests/low-viewport.e2e.test.ts`、`tests/long-content-viewport.e2e.test.ts`

## 验收标准

1. 点 Sessions：工作区带 `is-plugin-directory-empty`，没有 `[data-directory-panel=sessions]`；`[data-open-session-add]` 和筛选在 `[data-session-stage-chrome]`，列表在 `[data-session-stage-list]`。
2. 未点行时没有可见详情；行上能读到当前 Goal 或「未关联」。
3. 宽屏单击后列表仍可见且宽度等于目录列，右缘与 titlebar 项目条对齐；对应 `.session-stage` 在右侧且 `hidden === false`；母页仍是 Sessions。
4. 点返回后 `data-expanded` 不是 true，详情隐藏。
5. Runtime 分组仍在；筛选/排序仍在组内重排；分组内条目相对分类 caret 缩进 16px。
6. 窄屏点 Sessions 不打开目录抽屉；点行后列表不可见、正文可见。
7. 完成等级 3。不改用户真实库。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-work --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/work-session-ui.test.ts tests/session-web.test.ts tests/desktop-tui.test.ts tests/immersive-directory.e2e.test.ts tests/immersive-workbench.e2e.test.ts tests/chrome-inner-scroll.e2e.test.ts tests/low-viewport.e2e.test.ts tests/long-content-viewport.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`。

## 假设与开放问题

- Sessions 没有独立 Frame 表面；单击只做母页主从。双击开 Frame 本期不做。
- 标题仍是 Session 标题；Goal 是单独一列，即使标题碰巧等于 Goal 名。
