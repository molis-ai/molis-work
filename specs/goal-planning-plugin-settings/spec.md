# 规划方法改为 Goal 插件设置

状态：功能可用。规划方法库已是 Goals 插件设置。项目设置只留常规和项目说明。工作规划与工作规则在 Goals 顶栏，点了才展开。

## 背景与目标

全局设置把「规划方法」写成宿主固定分类。这页只给 Goal 用：维护 Runtime 拆 Goal、判断依赖、检查完成证据时阅读的方法库。方法不属于某个项目。

Shelf、Functions 的本机设置是插件自己登记的 `settings-page`，没装就不出现。规划方法要比照这条：当前项目启用了 Goal，全局设置才有这一行。

## 当前行为与问题证据

- `apps/workbench/src/settings-directory.ts` 与 `settings-navigation.ts` 把「规划方法」写进宿主分类，和外观、诊断并列。
- Goal Manifest 没有 `slot: "settings"` 的视图。
- `listPluginSettingsNavItems()` 按已登记的 settings-page 列目录，但排序用了全部插件，没有按当前项目是否启用过滤。Shelf / Functions 是个人插件，所以总是在。

## 范围与非目标

做：

- 从宿主全局分类去掉「规划方法」。
- Goal 登记一页插件设置。目录行用插件名 **Goals**，和 Shelf、Functions 一样。点进去仍是规划方法库，地址仍是 `/settings/planning`（含详情、编辑、新建）。
- 工作台目录和独立设置页都只在当前项目启用了 Goal 时列出这一行。没有项目上下文时不列。
- 个人插件设置（Shelf、Functions）照旧总是列出。
- 项目设置只留常规和项目说明。工作规划、工作规则从项目设置目录拿掉。
- Goals 顶栏在「列表 / 画布 / 看板」旁边有「工作规划」和「工作规则」。默认不展开。点一颗才盖住当前看板，再点或切回三态就收起。两颗互斥，同时只展开一个。
- 直接打开 `/projects/{id}/settings/planning` 和 `/settings/rules` 仍能看到同一页。
- 项目工作规则的配置项沿用设置页的分区和行。开始与完成、高级执行与检查是并列分区。保存项目规则不要求填写修改原因。
- 工作规划左边是和 Goal 列表一样的折叠目录：分类和方法在同一个列表里，条目标出已加入或未加入。点一条方法，右边滑入方法正文，不离开 Goals，不打开设置页。还没点时，右边是当前规划组合。

不做：

- 不改规划方法的存储、保存接口和页面正文。
- 不把单个 Goal 自己的规则编辑器从 Goal 文档里拿掉。
- 不把方法库改成按项目存一份。

## 方案

1. Goal Manifest 增加 `settings` 视图，贡献类型 `settings-page`，`navigation_id` 为 `planning`。
2. 宿主分类不再包含 `planning`，因此它不再被当成宿主保留段而滤掉。
3. 设置目录用「个人插件 + 当前项目已启用插件」决定哪些 settings-page 出现。
4. `/settings/planning` 仍由现有规划页处理，正文不变。

## 验收

1. 当前项目启用 Goal：全局设置在宿主分类之后有「Goals」，点进去仍是方法库，能打开一张方法。
2. 当前项目没有 Goal，或没有项目上下文：目录里没有「Goals」。Shelf、Functions 仍在。
3. 项目设置目录只有常规和项目说明。Goals 顶栏有工作规划和工作规则；点开能看到对应正文，滚轮能滚。
4. 定向测试覆盖目录组装与「未启用则不出现」。

## 验证

```
node --import tsx --test --test-concurrency=1 \
  tests/plugin-global-settings.test.ts \
  tests/plugin-declarative-mounting.test.ts \
  tests/project-settings-stage.test.ts \
  tests/goals-planning-ui.test.ts
```
