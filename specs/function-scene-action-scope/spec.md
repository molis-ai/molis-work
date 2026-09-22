# Functions 事件去向的动作范围

完成等级：**3 功能可用**。不宣称可发布。

作者规范与判例以 [Plugin 开发 · 事件去向的动作名单](../../docs/platform/PLUGIN-DEVELOPMENT.md#事件去向的动作名单) 为准。本文件是这次行为变更的需求书。

## 背景目标

Functions「用在哪」里，每个事件去向有一份可映射的动作名单。名单曾经按场景硬编码，Feed 只收「加入 Inbox / 留在 Feed」，详情上已经能点的保存、升格、忽略进不了判断。后续插件也没有统一录取标准。

判断能选的动作，是人正盯着这个对象时、已经能点的下一步处置。不是插件所有能改数据的事。

## 当前行为与问题证据

- `feed.capture` 池只有 `inbox.admit`、`feed.open`。Feed 详情 footer 已有加入 Inbox、保存为资料、升格为 Goal、忽略。
- 去向文案写「要不要出现『加入 Inbox』」，听起来 Feed 只有这一个动作。
- Feed 插件 Manifest 未声明 save / promote / archive。内置 `system_admit_inbox` 仍是进 Inbox / 留在 Feed，可继续用。
- Inbox / 首页池与各自详情大体一致。Pages / Forms / Dataset / PPT 的写在 MCP，走 Agent 去向。Goals 方案确认、灵光丢掉/分发是对象上的处置，但没有「对象到来 / 点开事件」这种 Functions 场景，本轮不强开去向行。

## 范围

1. 把录取标准与判例写入 Plugin 开发规范，后续插件按同一套四问登记 `behaviors` 和 `function_scenes`。
2. 登记 `feed.save` / `feed.promote` / `feed.archive`，写入 `feed.capture` 池。`feed.open` 仍可映射（内置「留在 Feed」），不画成详情 footer 按钮。
3. 改 Feed 去向文案，使动作库能把选项对到这四条处置。
4. Feed 详情按建议亮处置按钮：建议落在四条处置上则只画这些；建议只有 `feed.open` 时不画「加入 Inbox」，保存 / 升格 / 忽略仍在；空或非法建议时四条都在。「打开原文」常驻。判断不自动写入。
5. 已加入 Inbox 的条目仍画四条处置（加入 Inbox 为已加入、禁用），不受捕捉建议藏按钮。已忽略走恢复，恢复不进 `feed.capture`。

## 非目标

不新开 Goals / 灵光事件去向。不把 MCP 写工具摆进首页 / Inbox / Feed。不改 `system_admit_inbox` 的两个选项。不把来源设置、token、计划、标已读、重新打开、说一句放进事件池。不按函数选项在现场长新按钮。

## 使用场景

- 写「这条消息该去哪」：选项急 / 不急 / 留着，用在哪选 Feed，映射到升格 / 忽略 / 保存，捕捉命中后详情只亮映射到的按钮。
- 继续用内置「是否进 Inbox」：建议 `inbox.admit` 时详情仍有加入 Inbox；建议 `feed.open` 时加入 Inbox 消失，保存 / 升格 / 忽略还在。
- 新插件作者写 Manifest：先问四问，过了才进某个事件去向；过不了的写操作最多进 Agent。

## 方案与关键决策

- 录取四问见开发规范。事件去向的 `behavior_ids` 必须是该现场已接线、且对应该对象的下一步处置。
- 公共 id：`feed.save`、`feed.promote`、`feed.archive`。系统行为表与 Feed Manifest 都声明，公开名撞号时系统项保留。
- 画按钮用 `visibleFeedDispositionIds`，与 Inbox / 首页的 `visibleDockBehaviorIds` 分开：`feed.open` 不是处置按钮，不能当「空建议」退回四条（否则会把「留在 Feed」画回加入 Inbox）。
- 首页卡底不接这三条。首页没有保存 / 升格 / 忽略这几颗 Feed 按钮。

## 输入输出与依赖

- 输入：Feed 详情已有点击路径、现有 `inbox.admit` / `feed.open`、行为总表。
- 输出：扩大后的 `feed.capture` 池、catalog / 编辑器动作库、Feed 详情按钮集合、开发规范。
- 依赖：`specs/functions-system-capability/spec.md` 的判断不自动执行；`specs/functions-independent-authoring/spec.md` 的映射、不长新按钮。

## 文件 / 模块边界

允许：`specs/function-scene-action-scope/`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`docs/platform/PLUGIN-PLATFORM.md`、`docs/SSOT-MATRIX.md`、`packages/contracts`（functions 合同）、`apps/local-host` 行为总表、`plugins/native/feed` Manifest 与详情按钮、`plugins/native/functions` 去向文案、`modules/functions` README 一行、对应测试、与本标准冲突的旧 spec 句子。

禁止：Feed / Inbox / 首页 import Functions 插件实现；为 Goals / 灵光新建场景绑定 HTTP。

## 验收标准

1. Plugin 开发文档有录取四问和判例（Feed 四条处置进 `feed.capture`；打开原文 / 说一句 / 重新打开 / 恢复 / 来源设置 / MCP 写不进事件去向；Goals 方案与灵光丢掉/分发本轮不开去向）。
2. `defaultFeedCaptureBehaviorIds(true)` 含 `inbox.admit`、`feed.save`、`feed.promote`、`feed.archive`、`feed.open`。
3. `GET /api/functions/catalog` 的 Feed 去向 `behavior_ids` 含这五项；文案不再写成只问「加入 Inbox」。
4. 未绑或非法建议时，Feed 详情仍有加入 Inbox、保存、升格、忽略、打开原文。
5. 建议只含 `feed.open` 时不显示加入 Inbox，保存 / 升格 / 忽略 / 打开原文仍在。
6. 建议只含 `feed.promote` 时显示升格，不显示加入 Inbox / 保存 / 忽略；打开原文仍在。点击才写入。
7. `functionFitsScene(system_admit_inbox, feed.capture)` 仍为真。首页卡底 offered 仍不含 `inbox.admit` / `feed.save` / `feed.promote` / `feed.archive`。
8. Feed / Inbox / 首页源码仍不 import `@molis-ai/molis-work-plugin-functions`。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-functions --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/functions-system-capability.test.ts tests/feed-native-plugin.test.ts tests/feed-out-rules.test.ts
```

## 假设与开放问题

- Goals 确认方案、灵光丢掉/分发以后若要进 Functions，需要自己的场景、判断时机和已接线按钮，不复用 `feed.capture`。
- 内置「是否进 Inbox」不扩成四选一；要写「这条该去哪」用自定义 Choice 映射。
