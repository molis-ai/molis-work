# 函数三栏：看什么 / 函数 / 用在哪 解耦

完成等级：**3 功能可用**。不宣称可发布。不把函数选项长成 Inbox / 首页 / Feed 的新按钮。

## 背景目标

判断函数是独立的题：有自己的输入对象、自己的答案、可选的落地去向。上一版把「用在哪」当成总开关，一点 Inbox 就把选项改写成「做完了 / 忽略」，函数没法单独存在，也不能增删改自定义答案。

要把配置拆成三条，页面改成三栏流水线：观察 → 判断 → 落地。绑到现场时用映射，不覆盖函数本身。

## 当前行为与问题证据

- 点 Inbox / 首页 / Feed 会 `criteriaForDestination` 整表覆盖 Choice 选项。
- Choice 没有「添加」；选项只能勾该去向已接线行为。Inbox 看起来像死两个动作。
- Noul / Score 被写成 `scene_id=agent.mcp`，来源也被锁成 `mcp_invoke`。
- `functionFitsScene` 要求选项 key 本身落在现场按钮池里，自定义答案无法绑定。

## 范围

1. 看什么、函数、用在哪分别保存。改去向不改选项、不改来源。
2. 函数可以不选去向。三种原语新建时 `scene_id` 都是空。
3. Choice 选项可增删改（key + 说明），2–32 个。动作库只是「加入」素材，不是唯一合法集合。
4. 事件去向（首页 / Inbox / Feed）在右栏做「选项 → 现场按钮」映射。映射不进 `config_hash`。
5. Noul 也可以选事件去向，映射成立 / 不成立到两颗按钮。Score 仍不能绑这三处。
6. 判断落到现场时，把 Choice 结果（或 Noul 阈值）经映射写成 `suggested_behavior_ids`。Agent invoke 仍返回函数自己的答案。
7. 编辑器改成三栏。邻栏只高亮相关项，不互相覆盖。
8. 现场不长新按钮。对不上就先不绑，或只给 Agent。

## 非目标

不在 Inbox / 首页 / Feed 上按函数选项长新按钮。不支持一个函数同时绑多个事件去向。不改 TypeSafe 协议、发布不可变、试跑才能发布。不另做总控台。

## 使用场景

- 写「这封邮件急不急」：看什么勾 Inbox；函数选项急 / 不急，可再加「以后再说」；用在哪先空着，函数已经完整。
- 再把它用到 Inbox：右栏把急 → 做完了、不急 → 忽略，发布后「用在 Inbox」。选项文案不变。
- 写给 Agent 的工具选择：用在哪选 Agent，从动作库把 MCP 工具加入选项；不映射。
- Noul「材料够不够」绑首页：成立 → 接着做，不成立 → 问问怎么回事。

## 方案与关键决策

- `scene_map`: `Record选项key, 行为id`。Choice 用选项 key；Noul 用 `true` / `false`。空对象表示未映射。
- 选项 key 已在该去向按钮池里时，视为恒等映射，右栏预填，不必手对。
- `functionFitsScene`：去向已写则必须一致；事件现场要求每个输出都对上池内按钮（映射或恒等）；`agent.mcp` 不能绑现场。未写去向、但选项本身就是该现场按钮时，仍可按恒等适配（内置函数与旧数据）。
- 点去向只改 `scene_id` 和修剪 `scene_map`。看什么仍由用户勾。
- 三栏在 plugin-stage 工作面里，左栏函数列表不动。窄屏改单栏上下排。

## 输入输出与依赖

- 输入：现有函数记录、行为总表、现场按钮池。
- 输出：带可选去向与映射的草稿；三栏编辑器；判断时的映射后行为 id。
- 依赖：`specs/functions-system-capability/spec.md`、`specs/functions-product-authoring/spec.md`（来源/去向/总表仍有效；选项与去向的耦合以本文件为准）。

## 文件 / 模块边界

允许：`specs/functions-independent-authoring/`、`packages/contracts`（functions 合同）、`modules/functions`、`plugins/native/functions`、对应测试、`docs/SSOT-MATRIX.md` 一行。

禁止：Feed / Inbox / 首页为函数选项长新按钮；把映射写进 `config_hash`。

## 验收标准

1. 新建 Choice / Noul / Score 都可以不选「用在哪」；保存后 `scene_id` 为空。
2. 点 Inbox 不会改掉已写的自定义选项和「看什么」。
3. Choice 能添加、删除、改 key 与说明；少于两个不能删光。
4. 自定义选项绑 Inbox 时，右栏出现映射；映射完整后 `functionFitsScene(..., inbox.next)` 为真，判断结果经映射出现在 `suggested_behavior_ids`。
5. 映射不完整不能绑现场；Agent invoke 仍返回函数自己的 choice / noul / score。
6. Score 选 Inbox / 首页 / Feed 仍被拒绝。Noul 可以选，并映射成立 / 不成立。
7. 编辑器 DOM 有三栏：看什么、函数、用在哪。页面不再把可选动作当成去向的复选总表。
8. 内置三个系统函数仍能绑到原来的去向（恒等映射）。`agent.mcp` 函数仍不能绑 Inbox。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-functions --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/functions-system-capability.test.ts tests/chrome-inner-scroll.test.ts
```

浏览器：打开 Functions → 新建 Choice → 写两个自定义选项 → 选 Inbox → 选项仍在、右栏出现映射。

## 假设与开放问题

- Noul 落地时 `noul >= 0.5` 算成立，否则不成立。
- 多个选项可以映射到同一颗现场按钮。
- 现场长新按钮仍是 later。
