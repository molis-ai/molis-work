# Chrome 式标签组底线

**已被取代。** 插件自动组底线不再使用。用户手动分组的色线以 `specs/chrome-tabs-preview-groups/spec.md` 为准。

# Chrome 式标签组底线（历史）

## 背景目标

分栏后，同一插件的多张标签只靠图标颜色认组，一组和邻组的边界不够清楚。用户要求按 Chrome 标签组：在一组底下用一条彩色线把这些 Tab 连起来。

完成等级 3：功能可用。不改标签数据、固定、分栏。

## 当前行为

`.tab-group` 已有 `--group-color`，只涂在图标和折叠控件上。没有整组范围的标记。紧凑标签栏当时去掉了「整条彩色底线 + 大块组名」，那是铺满整条 titlebar 的旧做法，不是 Chrome 那种按组的短线。

## 方案

插件组（首页除外）用 `::after` 画 2px 底线，颜色用该组 `--group-color`，左右各收 4px，贴在该组标签下面。首页组不加线。折叠、固定、单栏 titlebar 与分栏栏内 strip 共用同一规则。

## 验收

1. Sessions 组底线 2px，颜色不是透明。
2. Goals 与 Sessions 底线颜色不同。
3. 首页组没有这条线。
4. 底线宽度落在该组盒子内，不画进邻组。

验证：`pnpm --filter @molis-ai/molis-work-app-workbench build`；`node --import tsx --test --test-concurrency=1 tests/workbench-tab-workspace.e2e.test.ts tests/compact-icon-tabs.e2e.test.ts`。

## 验收结果

- 通过：工作台构建；2 项定向 e2e。
- 通过：Sessions / Goals 底线 2px 且颜色不同；首页组无底线。
- 通过：实屏 Goals 两张标签共一条蓝线，其它插件组各一条对应色线。
