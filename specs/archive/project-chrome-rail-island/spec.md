# 项目岛落到左栈，titlebar 只留标签

状态：可点切片已核验。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。安装包 4173 窗口看不到这次改动。

本文件改写 `specs/archive/project-chrome-titlebar-row/spec.md`：项目切换 / 搜索 / 项目设置 / 收起目录不再和标签挤在 titlebar。

## 背景目标

Titlebar 被项目条占去一截，标签和加号抢位。项目身份、搜索、项目设置和插件入口不是同一类东西，却排在同一条上。

要做：这组控件收到左边，用一块略浮起的卡片和插件图标切开；titlebar 只服务窗口和标签。

## 当前行为与问题证据

- `[data-workspace-chrome]` 在 `.immersive-titlebar` 里，有目录时按目录列宽铺，首页按内容收窄。
- 桌面红绿灯、项目名、上一步/下一步、标签、加号、分屏抢同一行。
- 插件栏底已有全局设置齿轮；项目设置在 titlebar。

## 范围与非目标

做：

- 项目条从 titlebar 拿出来，作为左栈顶上的项目岛。
- 有目录：卡片写出项目名，宽度跟内容走，浮在左栈顶上；目录常开，没有展开/收起。
- 无目录：岛只占插件栏宽，收成图标（项目、搜索、设置），项目名进 `title` / `aria-label`。
- 岛是抬起的内容宽卡片，不是拉满目录宽的第二条工具栏。底栏全局设置不动。
- Titlebar：桌面红绿灯让位、上一步/下一步、标签、加号、分屏。
- ≤600px：titlebar 仍是标签行；岛单独占下一行通栏；目录改抽屉，用岛上的展开入口，不占桌面常驻栏。

不做：不改插件点按、目录拖宽、分屏、加号靠右、红绿灯坐标、全局设置位置、账号入口。桌面不再提供目录展开/收起。

## 使用场景

1. 首页：titlebar 只有历史和标签；左栏顶是窄卡片（项目图标、搜索、设置）；下面是插件图标。
2. 打开 Sessions / Feed 等有目录的插件：卡片写出项目名，搜索/设置贴在名字旁边；目录常开在卡片下面。
3. 桌面没有收起目录；刷新后目录仍在。
4. 桌面：红绿灯只和 titlebar 抢位，不压项目岛。
5. 点搜索、切项目、进项目设置，行为与现在相同。

## 方案

- 栅格两行：titlebar | 左栈与主内容。岛叠在左栈顶上，栏和目录从 titlebar 底下铺满，用 `--project-island-offset` 给内容让位。
- 岛是 `.workspace-chrome.project-island`，不再是 titlebar 子元素。
- 内部 `.navigator-project-primary` 做成抬起卡片（`--nav-raised` + 细边 + 轻阴影），宽度 max-content，不把搜索顶到目录右缘。

## 文件边界

允许改：`apps/workbench/src/immersive-shell.ts`、`goals-page-renderer.ts`、`styles/immersive-navigation.ts`、`styles/linear-density.ts`；`tests/immersive-directory.e2e.test.ts`、`tests/desktop-tui.test.ts`、`tests/chrome-inner-scroll.test.ts`。

## 验收

1. Titlebar 内没有项目切换、搜索、项目设置。
2. 这些控件在 `[data-workspace-chrome]`，且顶边在 titlebar 底边之下。
3. 有目录：项目名可见；卡片右缘不超过目录列；卡片窄于栏+目录，不拉满。
4. 首页/无目录：岛宽度不超过插件栏 + 8px；项目名隐藏，图标可点。
5. 岛背景与插件栏不同，能看出是一张卡片。
6. 搜索、项目菜单、项目设置仍可用。桌面看不见展开/收起目录。
7. 加号仍贴分屏、靠 titlebar 右缘。
8. 底栏仍是全局设置 + 账号。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/desktop-tui.test.ts \
  tests/immersive-directory.e2e.test.ts
```

## 假设

- Goals 当前没有第二栏目录，按「无目录」走窄岛，不再为它对齐一条假目录宽。
- 桌面有目录时始终展开；旧的 `directoryCollapsed` 状态不再恢复。

## 验收对照

| # | 标准 | 结果 | 证据 |
|---|------|------|------|
| 1 | Titlebar 无项目切换/搜索/设置 | 通过 | CDP：`titlebarHasSwitcher/Search/Settings` 均为 false |
| 2 | 岛在 titlebar 下方 | 通过 | header bottom 32，island top 32 |
| 3 | 有目录时项目名可见，卡片不拉满 | 通过 | Feed：内容宽芯片，搜索贴名字旁 |
| 4 | 首页/无目录窄岛、名隐藏 | 通过 | 首页窄卡片；名隐藏 |
| 5 | 抬起卡片浮在左栈上 | 通过 | 栏/目录连续底，卡片 inset |
| 6 | 搜索可用；桌面无展开/收起 | 通过 | Feed 芯片只有项目/搜索/设置；目录常开 |
| 7 | 加号贴分屏靠右 | 通过 | add.right 1870，split.left 1878，viewport 1920 |
| 8 | 底栏全局设置+账号 | 通过 | 两按钮仍在栏底 |

定向测试：`chrome-inner-scroll`、`desktop-tui`、`immersive-directory.e2e`、`chrome-inner-scroll.e2e` 通过。隔离预览 `127.0.0.1:63606`。
