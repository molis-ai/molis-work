# 项目条与 titlebar 同一行

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件改写：

- `specs/project-chrome-span-rail/spec.md` 里项目条在 titlebar **下面**单独一行；
- `specs/chrome-plugin-rail/spec.md` 里「项目切换不进 titlebar」和「插件栏从项目条下一行起」。

## 背景目标

项目条现在是 titlebar 底下第二行（32px）。主内容从这一行就开始，目录和插件栏从第三行才开始，所以画布比左边高一截。

用户要求：项目条上移，和 titlebar 同一行；这一行下面，插件栏、目录、右边主内容顶对齐、同高。

## 当前行为与问题证据

- 栅格三行：titlebar / 项目条 / 栏+目录。
- `.immersive-plugin-stage`：`grid-row: 2 / -1`，从项目条那一行贯通。
- `.plugin-rail` 与 `.tree-pane`：`grid-row: 3`。

## 范围与非目标

做：

- 桌面/网页：项目条进 `.immersive-titlebar`，与上一步/下一步、标签同一行。
- 有目录时：项目条宽度对齐「插件栏 + 目录」，右缘贴目录右缘；搜索/设置/收起仍贴这条右缘。
- 桌面红绿灯仍占 titlebar 左 88px；项目名从让位之后开始，不压灯。
- 上一步/下一步跟标签走，从目录右缘起。
- 下面一行：插件栏、目录、主内容同顶同底。
- 首页/收起目录：项目条在 titlebar 里按内容收窄，不盖住标签。
- ≤600px 仍两行（标签一行、项目条一行），抽屉从这两行下面滑出。

不做：不改红绿灯坐标、插件点按、目录拖宽、分屏靠右。

## 使用场景

1. 打开 Goals：一行里左边是项目名和搜索/设置/收起，右边是上一步/下一步和标签；下面三列顶边齐。
2. 回首页：项目名仍在 titlebar 左侧，标签还在；插件栏和首页内容同顶。
3. 桌面：红绿灯可点，项目名在它右边。

## 验收标准

1. 有目录：`[data-workspace-chrome]` 与 `.immersive-titlebar` 顶边相差不超过 2px；右缘与目录右缘相差不超过 2px。
2. 插件栏、目录、主内容顶边两两相差不超过 2px，且都在 titlebar 底边之下。
3. 桌面 `data-native-desktop`：项目选择器左缘 ≥ 红绿灯让位（88px）。
4. 点插件、收起目录、拖目录宽度、分屏靠右仍可用。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/chrome-inner-scroll.test.ts tests/desktop-tui.test.ts tests/immersive-directory.e2e.test.ts
```
