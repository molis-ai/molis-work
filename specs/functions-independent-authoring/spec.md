# 函数三栏：看什么 / 函数 / 用在哪 解耦

完成等级：**3 功能可用**。不宣称可发布。不把函数选项长成 Inbox / 首页 / Feed 的新按钮。

## 背景目标

判断函数是独立的题：有自己的输入对象、自己的答案、可选的落地去向。上一版把「用在哪」当成总开关，一点 Inbox 就把选项改写成「做完了 / 忽略」，函数没法单独存在，也不能增删改自定义答案。

要把配置拆成三条，页面改成三栏流水线：观察 → 判断 → 落地。绑到现场时用映射，不覆盖手写的自定义答案。

## 当前行为与问题证据

- 点 Inbox / 首页 / Feed 曾用 `criteriaForDestination` 整表覆盖 Choice 选项，自定义答案写不成。
- 解耦后又出现反面：改「用在哪」只刷新动作库，选项仍留着上一处现场的按钮。Inbox 的「做完了 / 忽略」配 Feed 的「进入 Inbox / 打开」，同一块面板互相打架。
- 勾选「看什么」完全不改选项和动作库。首页卡底实际上按对象类型收窄按钮，编辑器却列出整池。
- Choice 没有「添加」；选项只能勾该去向已接线行为。Inbox 看起来像死两个动作。
- Noul / Score 被写成 `scene_id=agent.mcp`，来源也被锁成 `mcp_invoke`。
- `functionFitsScene` 要求选项 key 本身落在现场按钮池里，自定义答案无法绑定。

## 范围

1. 看什么、函数、用在哪分别保存。改去向不改「看什么」勾选。
2. 函数可以不选去向。三种原语新建时 `scene_id` 都是空。
3. Choice 选项可增删改（key + 说明），2–32 个。动作库是「加入」素材，不是唯一合法集合。
4. 选项区（当前选项 + 动作库）跟随「看什么 ∩ 用在哪」更新：事件去向把默认 `yes/no` 或现场动作 key 同步成该现场当前对象能用的按钮；手写的自定义 key 不覆盖。
5. 事件去向（首页 / Inbox / Feed）在右栏做「选项 → 现场按钮」映射。映射不进 `config_hash`。
6. Noul 也可以选事件去向，映射成立 / 不成立到两颗按钮。Score 仍不能绑这三处。
7. 判断落到现场时，把 Choice 结果（或 Noul 阈值）经映射写成 `suggested_behavior_ids`。Agent invoke 仍返回函数自己的答案。
8. 编辑器改成三栏。邻栏只高亮相关项；不自动勾选「看什么」。
9. 现场不长新按钮。对不上就先不绑，或只给 Agent。

## 非目标

不在 Inbox / 首页 / Feed 上按函数选项长新按钮。不支持一个函数同时绑多个事件去向。不改 TypeSafe 协议、发布不可变、试跑才能发布。不另做总控台。

## 使用场景

- 写「这封邮件急不急」：看什么勾 Inbox；函数选项急 / 不急，可再加「以后再说」；用在哪先空着，函数已经完整。
- 再把它用到 Inbox：选项仍是急 / 不急，动作库列出做完了 / 忽略，右栏把急 → 做完了、不急 → 忽略。
- 新建 Choice 点 Inbox：选项变成做完了 / 忽略。再点 Feed：选项换成进入 Inbox / 打开，不再留着做完了。
- 首页勾 Inbox：选项收到接着做 / 做完了 / 忽略 / 问问怎么回事。改勾 Feed：换成该对象在首页能亮的按钮。
- 写给 Agent 的工具选择：用在哪选 Agent，从按「看什么」过滤后的动作库加入；不把 MCP 工具整表灌进选项。
- Noul「材料够不够」绑首页：成立 → 接着做，不成立 → 问问怎么回事。

## 方案与关键决策

- `scene_map`: `Record选项key, 行为id`。Choice 用选项 key；Noul 用 `true` / `false`。空对象表示未映射。
- 选项 key 已在该去向按钮池里时，视为恒等映射，右栏预填，不必手对。
- `functionFitsScene`：去向已写则必须一致；事件现场要求每个输出都对上池内按钮（映射或恒等）；`agent.mcp` 不能绑现场。未写去向、但选项本身就是该现场按钮时，仍可按恒等适配（内置函数与旧数据）。
- 点去向改 `scene_id`，并按上面规则同步选项 / 动作库；修剪对不上的 `scene_map`。看什么仍由用户勾，不跟去向对拷。
- 选项是否「跟着现场走」：当前 key 是默认 `yes/no`，或全部都是动作库 id。出现任一自定义 key 则只更新动作库。
- 事件去向的建议动作 = 该去向按钮池 ∩ 已勾对象类型；没勾「看什么」时用该去向整池。Agent / 先不落地不自动灌选项。
- 三栏在 plugin-stage 工作面里，左栏函数列表不动。窄屏改单栏上下排。

## 输入输出与依赖

- 输入：现有函数记录、行为总表、现场按钮池。
- 输出：带可选去向与映射的草稿；三栏编辑器；判断时的映射后行为 id。
- 依赖：`specs/archive/functions-system-capability/spec.md`、`specs/archive/functions-product-authoring/spec.md`（来源/去向/总表仍有效；选项与去向的耦合以本文件为准）。

## 文件 / 模块边界

允许：`specs/functions-independent-authoring/`、`packages/contracts`（functions 合同）、`modules/functions`、`plugins/native/functions`、对应测试、`docs/SSOT-MATRIX.md` 一行。

禁止：Feed / Inbox / 首页为函数选项长新按钮；把映射写进 `config_hash`。

## 验收标准

1. 新建 Choice / Noul / Score 都可以不选「用在哪」；保存后 `scene_id` 为空。
2. 点 Inbox 不会改掉已写的自定义选项和「看什么」。默认 `yes/no` 或现场动作选项会换成该去向当前对象的按钮；动作库同步过滤。
3. Choice 能添加、删除、改 key 与说明；少于两个不能删光。
4. 自定义选项绑 Inbox 时，右栏出现映射；映射完整后 `functionFitsScene(..., inbox.next)` 为真，判断结果经映射出现在 `suggested_behavior_ids`。
5. 映射不完整不能绑现场；Agent invoke 仍返回函数自己的 choice / noul / score。
6. Score 选 Inbox / 首页 / Feed 仍被拒绝。Noul 可以选，并映射成立 / 不成立。
7. 编辑器 DOM 有三栏：看什么、函数、用在哪。页面不再把可选动作当成去向的复选总表。
8. 内置三个系统函数仍能绑到原来的去向（恒等映射）。`agent.mcp` 函数仍不能绑 Inbox。
9. 从 Inbox 改到 Feed 后，选项不再留着做完了 / 忽略。勾选「看什么」会收窄首页动作库和可同步的选项。Agent 去向不把工具整表写进选项。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-functions --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/functions-system-capability.test.ts tests/chrome-inner-scroll.test.ts
```

浏览器：打开 Functions → 新建 Choice → 选 Inbox，选项变成做完了 / 忽略 → 再选 Feed，选项换成进入 Inbox / 打开。手写两个自定义选项后再选 Inbox，自定义选项仍在、右栏出现映射。

## 假设与开放问题

- Noul 落地时 `noul >= 0.5` 算成立，否则不成立。
- 多个选项可以映射到同一颗现场按钮。
- 现场长新按钮仍是 later。
