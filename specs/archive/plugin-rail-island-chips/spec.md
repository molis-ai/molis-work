# 插件栏与底栏收成和项目岛一样的抬起卡片

状态：完成。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

左栏是三块**纵向**卡片，铺满 48px 栏：项目岛、插件入口、设置+头像。有目录时岛也不能变成横条。

## 当前行为与问题证据

有目录时 `.navigator-project-primary` 仍是横条（约 217×36），写出项目名、搜索、设置。一骏选中该节点问「为什么还是横的」。

## 范围与非目标

做：桌面无论有没有目录，岛都在栏宽里竖排（项目 / 搜索 / 项目设置），名字进 `title` / 裁切。目录不再为横岛留 `--project-island-offset`。插件卡 `flex: 1` 铺满岛和底栏之间。

不做：不改插件点按、账号进设置。≤600px 抽屉里岛仍可通栏横排写出项目名。

## 使用场景

1. 无目录 Feed：三块竖卡铺满左栏。
2. 有目录 Shelf / 项目设置：岛仍是竖卡，不伸进目录；目录从 titlebar 底下铺满。
3. ≤600px：岛在独立行写出项目名，便于点。

## 方案

默认岛用现在无目录那套：`grid-column: 1`、主卡 `flex-direction: column`、名字裁切、菜单向右开。岛和栏的垂直缝见 `specs/archive/plugin-rail-island-gaps/spec.md`。`.tree-pane` 顶 padding 改为 0。

## 文件边界

允许改：`apps/workbench/src/styles/immersive-navigation.ts`、`apps/workbench/src/styles/linear-density.ts`；`tests/chrome-inner-scroll.test.ts`、`tests/immersive-directory.e2e.test.ts`。

## 验收标准

1. 有目录时岛宽度不超过栏宽 + 3px，高度明显大于 36px，项目名宽度 ≤1px。
2. 目录顶边贴 titlebar 底边，不被岛压住。
3. 无目录时三块竖卡仍铺满左栏。
4. 点切换项目、搜索、项目设置仍可用。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/immersive-directory.e2e.test.ts
```
