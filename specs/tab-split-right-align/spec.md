# 「布局与分屏」钉在 titlebar 右缘

状态：已实现。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

本文件纠正 `specs/chrome-plugin-rail/spec.md` 验收 9 在桌面 `?desktop=1` 下的实现：分屏钮要贴窗口 titlebar 右缘，不是贴在被拖动热区挤窄之后的标签条右缘。

## 背景目标

合同写的是：加号和「布局与分屏」成组靠 titlebar 右缘；标签少时，标签和加号之间留空，这段空在桌面仍可拖窗口。

## 当前行为与问题证据

- `.tab-split-button { margin-left: auto }` 只把分屏钉在**标签条**右缘。
- 桌面把 `.desktop-titlebar-drag` 设成 `flex: 1`，和标签条对半分 titlebar。4174 / `?desktop=1` 实测：titlebar 宽约 1341px，标签条约 592px，分屏约在 x=711，右侧约 590px 是空白拖动区。
- 看起来分屏跟在加号后面，并没有一直靠窗口右边。

## 范围与非目标

做：

- 有 titlebar 标签时，桌面不再让尾部 drag 和标签条对半分。
- 标签条吃掉剩余宽度；分屏贴 titlebar 右内边（允许约 8–12px padding）。
- 加号贴分屏左边，两者钉在 titlebar 右缘。标签少时，标签和加号之间留空；这段空在桌面仍可拖窗口（条内 spacer + `data-tauri-drag-region`）。
- 分栏后每栏自己的标签条：分屏仍靠该条右缘（现有 `margin-left: auto`）。

不做：不改分屏菜单、加号菜单、红绿灯让位、网页无桌面 drag 的合同。

## 使用场景

1. 只有首页和画布两个标签：加号和分屏贴在 titlebar 最右侧，标签和加号之间是空。
2. 标签很多：标签在 `.tab-scroll` 里横滑，分屏仍钉在右边，不被挤走。
3. 桌面：点标签和加号之间的空白仍能拖窗口。

## 方案与关键决策

- 去掉「桌面尾部 drag `flex: 1`」这条。
- titlebar 标签条内，标签滚动区和加号之间插入 `flex: 1` spacer；桌面给它 `data-tauri-drag-region`。
- 尾部 `.desktop-titlebar-drag` 在标签可见时保持收起，避免再占一截右边。

## 文件 / 模块边界

允许改：`apps/workbench/src/styles/immersive-navigation.ts`、`apps/workbench/src/styles/tab-workspace.ts`、`apps/workbench/src/scripts/client/tab-workspace.ts`；`specs/chrome-plugin-rail/spec.md` 验收 9 一句；`tests/immersive-directory.e2e.test.ts`。

## 验收标准

1. `?desktop=1` 下，分屏钮右缘距 `.immersive-titlebar` 右缘小于 20px。
2. 加号在分屏左边并紧贴；标签少时，空隙在最后一个标签和加号之间。
3. 加号、分屏仍能打开各自菜单。
4. 网页（无 `data-native-desktop`）分屏同样靠 titlebar 右。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/immersive-directory.e2e.test.ts tests/desktop-tui.test.ts
```

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| 1 分屏距 titlebar 右缘 < 20px | 通过 | e2e；4174 实测距右缘 16px |
| 2 加号贴分屏、标签与加号之间留空 | 通过 | 隔离预览：加号与分屏间距 8px，最后标签到加号约 770px |
| 3 分屏菜单仍可用 | 通过 | 点开可见向右/下/左/上分屏 |
| 4 网页无 native-desktop | 未单独实跑 | 同一套 spacer，尾部 drag 在网页本就收起 |

## 假设与开放问题

- 桌面拖动热区改到标签与加号之间的 spacer，不再用半条 titlebar 的尾部空列。
