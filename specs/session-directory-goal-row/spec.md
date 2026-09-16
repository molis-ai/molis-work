# Sessions 目录行对齐 Goal 行

状态：完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它补在 `specs/home-directory-visual-unify/spec.md` 之上：Feed 仍用 44px 两行；Sessions 不再跟 Feed，改跟 Goals。

## 背景目标

左侧 Sessions 列表项是 44px 两行：标题、Runtime·Goal 副标题、「已归档」和日期各占一角。Goals 是 36px 单行：13px/450 标题 + 11px 无芯片状态。同一目录里两种语法，Session 显得又高又碎。

目标：Sessions 目录行用 Goal 同一套条目语法。完成等级 3。

## 当前行为与问题证据

- `plugins/native/work/src/ui/render.ts` 的 Session 行包含 `strong` + `small`（Runtime · Goal）+ `directory-row-state` + `project-record-meta`（Goal 名 + 日期）。
- `apps/workbench/src/styles/immersive-directory.ts` 把 `.project-record-row` 做成 44px、两行 grid。
- 实屏：选中的 Codex 已归档 Session 高 44px，副标题几乎重复标题，状态和日期挤在右上/右下。

## 范围与非目标

做：

- 沉浸式目录里的 Session 行：单行、36px（窄屏抽屉 40px，与 Goal `.tree-node` 一致）。
- 可见内容：标题 + 状态（可查看 / 已归档）。副标题、日期、重复 Goal 名隐藏，仍留在 DOM 供筛选/搜索。
- 状态用 `.goal-status` 语法：无第二层芯片，11px，archived / waiting 色。
- 悬停 `nav-hover`。选中与 Goal 相同：浅色 `blue 8%`，深色 `nav-active`。标题选中仍 450。
- 点选、筛选、拖到 Frame、归档语义不变。
- 插件分段展开时去掉 nested directory panel 的 `hidden`，否则列表看不见。

不做：

- 不改 Feed / Inbox / Artifacts 行高。
- 不改 Session 详情、新建/关系/归档对话框。
- 不改 Runtime 筛选数据来源（仍读隐藏的 `small`）。
- 不完成 `specs/directory-plugin-sections/spec.md` 的其余工作。

## 使用场景

1. 打开 Sessions：列表和 Goals 一样密，一眼扫标题和状态。
2. 选中已归档 Session：和 Goal 一样的浅色蓝底，没有浮起或第二行日期。
3. 长标题省略，不盖住右侧状态。
4. Runtime 筛选仍能列出 Codex 等选项。

## 方案

目录 CSS 把 `.project-record-row` 改成与 `.tree-entry` 同结构的横向 flex。状态包进 `goal-status--archived` / `goal-status--waiting`。`setPluginSectionExpanded` 展开时 `panel.hidden = false`。

## 文件边界

- `plugins/native/work/src/ui/render.ts`
- `apps/workbench/src/styles/immersive-directory.ts`
- `apps/workbench/src/styles/immersive-navigation.ts`
- `apps/workbench/src/scripts/client/navigation-feed.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md` 中目录行描述
- `specs/home-directory-visual-unify/spec.md` 中 Sessions 行高约定
- 测试：`tests/work-session-ui.test.ts`、`tests/immersive-directory.e2e.test.ts`

## 验收

1. Session 目录行高 36px（桌面），标题 13px/≤500、单行省略，状态无边框，标题不覆盖状态。**通过**（4180 CDP：36px、13px、450、border 0）。
2. 副标题与日期在目录中不可见。**通过**（`small`/`meta` 为 `display:none`；无障碍名是「Codex 已归档」）。
3. 浅色选中与 Goal 相同（`blue 8%`），无浮起。**通过**（Session 与 `.tree-entry.is-selected` 同为 `color(srgb 0.36 0.36 0.79 / 0.08)`）。
4. Feed 行高仍约 44px。**未在本轮重跑 Feed 断言**；未改 `.feed-list-item` 的 44px。
5. Runtime 筛选、点选打开 Session 详情仍可用。**通过**（筛选仍有 Codex / Claude Code；点行打开详情标签）。

`tests/work-session-ui.test.ts` 通过。`tests/immersive-directory.e2e.test.ts` 在分段目录 chrome 断言处失败，未跑到 Session 行断言；Session 行改用 4180 实屏。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-work build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/work-session-ui.test.ts tests/immersive-directory.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`，禁止打默认 home。

## 假设

- 用户点的是 Sessions 目录行，不是 Feed。
- 工作目录管理若复用 `.project-record-row`，沉浸式目录里一并单行化；详情页不受影响。
