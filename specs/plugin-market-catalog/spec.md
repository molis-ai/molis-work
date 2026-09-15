# 插件市场目录页

状态：已完成验证。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它覆盖 `specs/immersive-workbench-implementation/spec.md` 里「插件市场用卡片」的视觉约定，不改添加、搜索、跨项目写入的产品行为。

## 背景与问题

当前市场页是居中着陆页：眉题「Molis Work」、超大「插件市场」、搜索和「添加到项目」并排表单、复选框「仅看已添加」，下面是同尺寸营销卡片。看起来像后台设置，不像目录。参考 Codex 插件页：左对齐标题、整行搜索、已安装图标条、分组列表行、行内添加。

## 范围与非目标

### 范围

- 市场主区改成目录语法，仍在 Calm Desktop 石墨/紫工作台内，不换成 Codex 白底或彩色第三方图标。
- 去掉眉题。页面标题改为「插件」，不要副标题。
- 搜索是带图标的整行字段；项目选择收到标题右侧，文案为「添加到」。可见控件是工作台 popover 菜单，不是系统 `<select>` 列表；隐藏的 `[data-market-project]` 仍是程序与 e2e 的真相源。
- 「仅看已添加」改为「全部 / 已添加」文本筛选。
- 当前选中项目已添加的插件显示为「已添加」图标条；目录用两列列表行（图标井、名称、一句说明、添加），不再用同尺寸边框卡片。
- 保留真实内置插件、按项目写入、重复添加显示「已添加」、添加到当前项目后刷新、搜索过滤。
- 添加按钮短文案为「添加」；已添加态仍为「已添加」。

### 非目标

- 不做远程市场、下载、公开/个人仓库、假分类。
- 不改目录条「插件市场」入口、插件激活存储、API。
- 不改 Goal 画布、首页、Feed 等其他表面。

## 使用场景

1. 打开市场：看到目录，不是表单着陆页；当前项目已出现在「添加到」选择器中。
2. 搜索「Artifacts」：只剩 Artifacts 行。
3. 切到「已添加」：只看当前选中项目已经启用的插件。
4. 把 Feed 加到另一个项目：该项目记录更新，当前工作台不误切。
5. 把 Artifacts 加到当前项目：写入后刷新，目录入口出现。

## 方案

Codex 提供信息架构，Molis Work 提供材料和语义：插件是按项目添加，不是全局安装。已添加条和筛选都相对当前「添加到」项目。窄屏标题与选择器上下排列，列表改单列。

「添加到」跟侧栏项目切换器同一类：触发器是纸面控件，列表是 `paper` popover（浅阴影、当前项标记、Escape / 点外面关闭）。原生 select 的打开列表无法按产品皮肤绘制，所以不能只靠 `appearance: none`。选择一项时写入隐藏 select 的 `.value` 并派发 `change`，添加、搜索、跨项目写入行为不变。

## 文件边界

- `apps/workbench/src/immersive-shell.ts`
- `apps/workbench/src/scripts/client/plugin-workbench.ts`
- `apps/workbench/src/styles/immersive-navigation.ts`
- `apps/workbench/src/i18n/en.ts`
- 测试：`tests/plugin-market-catalog.test.ts`、`tests/chrome-inner-scroll.test.ts`、`tests/chrome-inner-scroll.e2e.test.ts`、`tests/immersive-workbench.e2e.test.ts`、`tests/i18n.test.ts`
- 必要时更新 `.impeccable/surfaces/immersive-workbench.md`

## 验收

1. 市场页没有「Molis Work」眉题，没有并排「搜索插件 / 添加到项目」表单标签，没有同尺寸边框卡片网格。
2. 可见：左对齐「插件」、整行搜索、已添加图标条（有已添加插件时）、全部/已添加、内置列表行。
3. `data-market-search`、`data-market-project`、`data-market-add`、`data-market-plugin` 仍驱动现有添加与搜索行为；程序仍可对隐藏 select 读写 `.value` / `.disabled` 并监听 `change`。
4. 标题栏在市场内容滚动时不动。
5. 中英文标签完整；浅色/深色/窄屏可阅读、可操作。
6. 「添加到」打开的是工作台 popover，不是系统默认 select 列表。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/plugin-market-catalog.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts \
  tests/immersive-workbench.e2e.test.ts
```

Chrome e2e 需要非沙箱。真实数据验证走本机 4173，不使用无 catalog 的隔离 demo 端口。
