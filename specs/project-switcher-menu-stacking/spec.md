# 无目录时项目切换菜单不被舞台挡住

状态：已核验。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

无第二栏目录时，项目切换菜单从岛右侧伸进主舞台。菜单必须盖住舞台内容，不能被 Feed 工具条或列表字透出来。

## 当前行为与问题证据

Feed、无目录、菜单打开：`.navigator-project-menu-popover` 在 `50,36` 处 `280×500`。

CDP：`elementFromPoint` 打在「添加任务」上（`mw-btn tree-create`），不是菜单。项目岛 `z-index: 12`；`.plugin-stage-chrome` 是 `.plugin-stage-shell` 的直接子元素，`z-index: 20`。舞台 `z-index: auto` 且未形成 stacking context，工具条的 20 在工作区层叠里压过岛的 12。

## 范围与非目标

做：打开项目菜单时，菜单盖住舞台工具条和列表；关闭后岛与舞台的日常层叠不变。

不做：不改菜单内容、尺寸、无目录时的右开位置；不改插件点按、分屏、titlebar。

## 使用场景

1. Feed（无目录）：点切换项目，菜单盖住「添加任务」和列表，能点项目名。
2. Goals（无目录）：同样不被舞台顶栏挡住。
3. 有目录：菜单仍在岛下方打开，盖住目录而不被拖宽条挡住。

## 方案

舞台自己收成一层（`z-index: 0`），里面的 `plugin-stage-chrome: 20` 出不去。菜单打开时岛抬到 `50`，压过 titlebar `41` 和 tree-resizer `25`。

## 输入输出与依赖

输入：`details[data-project-menu][open]`。输出：菜单命中测试落在 popover 上。依赖现有项目岛 DOM，不改 HTML。

## 文件边界

允许改：`apps/workbench/src/styles/immersive-navigation.ts`；`tests/chrome-inner-scroll.test.ts`、`tests/chrome-inner-scroll.e2e.test.ts`。

## 验收标准

1. 无目录 Feed：菜单打开后，原「添加任务」中心点命中 `.navigator-project-menu-popover`。
2. 菜单背景不透出列表文字。
3. 关闭菜单后仍能点「添加任务」。
4. 有目录时菜单仍从岛下方打开。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts
```

## 假设与开放问题

假设 4174 吃 workbench 源码模块缓存，改 CSS 后要 rebuild 并重启 web 才看得到。

## 验收对照

| # | 标准 | 结果 | 证据 |
|---|------|------|------|
| 1 | 无目录 Feed：菜单盖住「添加任务」 | 通过 | CDP：add 中心命中 popover；island z-index 50；stage z-index 0 |
| 2 | 菜单不透出列表 | 通过 | 截图顶部是「切换项目」，不再是工具条压在名单上 |
| 3 | 关闭后仍能点「添加任务」 | 通过 | `tests/chrome-inner-scroll.e2e.test.ts` |
| 4 | 有目录仍从岛下方打开 | 未改这条定位规则 | CSS `top: calc(100% + 4px)` 仍在；无目录才 `left: calc(100% + 8px)` |

