# 快捷方式迁到左侧目录

状态：已被 `specs/home-shortcuts-return/spec.md` 覆盖。位置改回项目首页；本文件只保留当时的目录挂载记录，不再作为当前位置权威。

当时把快捷方式从诗意首页挪到左侧目录。下面是当时的范围、方案和验收记录。

## 背景与问题

首页启动区有一列 88px 圆形「添加快捷方式」。它打断诗意首页，也不像目录里的入口。用户要求把它放到左侧目录：分区、下面一份带小标题的快捷入口列表，并允许添加。

## 范围与非目标

### 范围

- 首页不再渲染快捷方式列表或添加按钮。首页仍保留日期/星期、引语、月历、禁用 Agent 输入。
- 左侧目录在目的地+当前列表之下、账号页脚之上，增加固定分区「快捷方式」。
- 分区内是目录行语法的快捷入口列表（链接图标 + 名称），末行可添加；已有项可编辑/移除。
- 弹窗、localStorage 键、URL 校验、按项目隔离、Web 新页 / 桌面系统浏览器打开，全部保持原契约。
- 弹窗挂在目录分区里，这样在 Goals 等非首页也能添加。

### 非目标

- 不改插件目的地、Goal 树、Feed/Inbox 列表行为。
- 不把快捷方式做成全局导航，也不同步到 Goal 真相源。
- 不重做首页诗意构图，不为迁走快捷方式另做营销空态。

## 使用场景

1. 打开项目：左侧目的地下面是当前列表，再下面是「快捷方式」和「添加」；右侧首页没有圆形添加按钮。
2. 点「添加」、填名称和 https 地址、保存：列表出现该项，刷新后仍在，仍按当前项目隔离。
3. 在 Goals 目录时仍能看到并打开已有快捷方式。
4. 窄屏抽屉里同样有该分区；账号页脚仍在最底。

## 方案

目录已经是「目的地 / 当前列表 / 账号」。快捷方式成为列表与账号之间的第三段，不再用横线切开。行高、图标、hover 跟目的地链接同一家族，不用首页圆形井。小标题用目录列表标题那一档（12px / 500 / muted），不是营销眉题。条目多时分区内部滚动，不把 Goal 树挤没。

## 文件边界

- `apps/workbench/src/immersive-shell.ts`、`goals-page-renderer.ts`
- `apps/workbench/src/project-home.ts`、`styles/project-home.ts`
- `apps/workbench/src/scripts/client/project-home.ts`、`project-home-shortcuts.ts`
- `apps/workbench/src/styles/immersive-navigation.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- 测试：`tests/desktop-tui.test.ts`、`tests/project-home-start.e2e.test.ts`

## 验收

1. `.immersive-home` 里没有 `[data-home-shortcut-add]`；目录有 `[data-directory-shortcuts]`、小标题「快捷方式」和添加入口。
2. `[data-home-shortcut-add]`、`[data-home-shortcut-link]`、`[data-home-shortcut-edit]`、`[data-home-shortcut-dialog]` 仍驱动原添加/编辑/移除/校验。
3. 存储键仍是 `molis-work:home-shortcuts:{project_id}`；取消不写；无效 URL 留在弹窗。
4. 浅色/深色/窄屏抽屉里分区可读、可点；首页主区不再出现圆形添加。

## 验证命令

```
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/project-home-start.e2e.test.ts
```

Chrome e2e 需要非沙箱。本机 4173 只做只读打开与弹窗，不为演示写入用户项目快捷方式。

## 验证结果

| 项 | 结果 |
| --- | --- |
| 1 首页无圆形添加，目录有分区和小标题 | 通过。4173 DOM：`homeAdd=false`，tree-pane 顺序为目的地 → 列表 → `directory-shortcuts` → 账号；标题「快捷方式」，添加入口 `aria-label=添加快捷方式`。 |
| 2 原 data 属性仍驱动弹窗 | 通过。e2e 持久化/校验/失败重试；4173 只读打开弹窗后取消。 |
| 3 存储键与取消不写 | 通过。`tests/project-home-start.e2e.test.ts` 快捷方式项。 |
| 4 浅/深/窄屏 | 通过。4173 浅色首页、深色 Goals、390 抽屉均可见分区；隔离 e2e 含 dialog-mobile 截图。 |

定向测试：`tests/desktop-tui.test.ts` 34 通过 / 1 跳过（Grok CLI 未装）；`tests/project-home-start.e2e.test.ts` 3 通过。4173 未写入用户快捷方式。

