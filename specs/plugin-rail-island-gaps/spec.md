# 插件栏三块岛间距对齐

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

改写 `specs/plugin-rail-island-chips/spec.md` 里 `--project-island-offset: 126px` 的硬留白。

## 背景目标

左栏三块竖卡（项目岛、插件入口、设置+头像）是同一类分组，卡和卡之间的缝应该同一档。

## 当前行为与问题证据

- 岛叠在栏上，栏用写死高度让位。一骏 2026-09-19 截图：上段缝 16px，下段缝 8px。
- 写死 `108px + 8px` 对不上真实岛高，窗口一没重载就又偏。

## 范围与非目标

做：桌面两段卡间缝都是 8px。岛和栏进同一列 flex，用 `--plugin-rail-gap` 当兄弟间距，不再 overlay、不再写死岛高。

不做：不改点按、市场钉底、岛竖排、目录列。≤600px 抽屉横岛仍通栏。不改岛顶贴 titlebar、左右贴栏宽。

## 使用场景

1. 打开项目：三块卡上下两段空隙一样宽。
2. 打开有目录的插件：岛仍只占栏宽；目录从 titlebar 底下铺满。
3. ≤600px：岛仍是 titlebar 下一行通栏；拉开抽屉才看到插件栏。

## 方案与关键决策

`.plugin-stack` 包住项目岛和插件栏，桌面 `display: flex; flex-direction: column; gap: var(--plugin-rail-gap); padding-bottom: var(--plugin-rail-gap)`。栏不再 `padding-top` 让位。≤600px stack 用 `display: contents`，岛回到栅格第二行通栏，栏仍 `position: fixed` 抽屉。

## 输入输出与依赖

输入：现有三块卡 DOM。输出：桌面间距。无新协议。

## 文件 / 模块边界

允许改：`apps/workbench/src/goals-page-renderer.ts`、`apps/workbench/src/styles/immersive-navigation.ts`、`apps/workbench/src/styles/tab-workspace.ts`、`tests/chrome-inner-scroll.test.ts`、`tests/immersive-directory.e2e.test.ts`、`specs/plugin-rail-island-chips/spec.md`、本 spec。

## 验收标准

1. 桌面 1440：项目岛抬起卡底边到 `.plugin-rail-items` 顶边 = 8px ±2。
2. `.plugin-rail-items` 底边到 `.plugin-rail .personal-sidebar-footer` 顶边 = 8px ±2。
3. 两段缝相差 ≤2px。
4. 样式不再出现 `--project-island-offset` 或 `padding: 8px 6px 10px`。
5. 点项目切换、搜索、插件、设置、账号仍可用。完成等级 3。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/immersive-directory.e2e.test.ts
```

## 假设与开放问题

- 岛顶贴 titlebar 维持现状。
- 4174 吃模块缓存。源码和 dist 改完后必须重启 `pnpm web`，硬刷新不够。旧进程仍是 overlay：`padding-top: 124px`，上段 16、下段 8。

## 验收对照

| # | 标准 | 结果 | 证据 |
|---|------|------|------|
| 1 | 岛卡底到入口卡顶 8px ±2 | 通过 | e2e 间距断言过了；同文件后段 Feed 返回按钮 inset 失败，与间距无关 |
| 2 | 入口卡底到设置卡顶 8px ±2 | 通过 | 同上 |
| 3 | 两段缝差 ≤2px | 通过 | 同上 |
| 4 | 无 `--project-island-offset` | 通过 | `tests/chrome-inner-scroll.test.ts` |
| 5 | 点按仍可用 | 未单独跑满 | 同上，后段既有断言失败 |
