# 函数页：来源、事件去向、动作总表

完成等级：**3 功能可用**。不宣称可发布。

编辑器里选项与去向的关系已改为三栏解耦，见 [functions-independent-authoring](../functions-independent-authoring/spec.md)。本文件仍管来源、去向名单和行为总表。

## 背景目标

底层已有判断、行为总表、现场绑定。函数页仍是给 Agent 用的双栏表单：Choice 手填 key，没有来源/去向，空态还写「发布给 Agent」。用户配不明白，页面也丑。

把写函数做成系统判断的产品面：看什么、函数、用在哪分别配置。动作名单来自 Host 行为总表，可加入选项；事件去向用映射，不覆盖函数本身。

## 当前行为与问题证据

- `plugins/native/functions/src/ui.ts` 两栏 `functions-define` / `functions-try`；空态「发布给 Agent 调用」；创建对话「Agent 才能调用」。
- Choice 选项是手填 key。填成人话后 `functionFitsScene` 对不上场景池，现场下拉看不见该函数。
- 行为总表在 `assembleHostBehaviorCatalog`，函数页不消费。MCP 与插件动作只存在于合同，用户在函数页看不到。
- Feed 捕捉仍在规则里开关。Inbox / 首页的 board 级绑定不应占工作面；函数页选定去向后，发布即可在「用在哪」打开当前项目。

## 范围

1. 函数记录持久化 `scene_id`（去向）和 `subject_kinds`（来源）。内置三个系统函数写入对应去向与对象类型。
2. Host 提供 `GET /api/functions/catalog`：subjects、destinations（事件去向 + Agent/MCP）、behaviors（系统 / 插件 / MCP，带 effect 与是否可摆到现场按钮）。
3. 新建/编辑 Choice：勾选看什么；点选用在哪。每个去向用一两句话说明什么时候用、会改什么。不堆「何时 / 哪里配 / 效果」标签，不用「这道题」。
4. 去向分两类：事件（首页、Inbox、Feed）与 Agent。选项与去向的耦合改为映射，见 [functions-independent-authoring](../functions-independent-authoring/spec.md)。
5. Score 不能绑 Inbox / 首页 / Feed。Choice / Noul 可以；事件去向用映射对到现场按钮。
6. Inbox / 首页：已发布函数在「用在哪」打开或停用当前项目。Feed：未绑时说明去捕捉规则选它；已绑时列出场景名。不另做总控台。
7. 函数页是三栏工作台：看什么 / 函数 / 用在哪。
8. `functionFitsScene`：已写 `scene_id` 的函数只能绑到该去向；`agent.mcp` 不能绑现场。自定义选项经 `scene_map` 对上按钮池后可以绑。

## 非目标

不另做总控台。不自动执行写入或 MCP 写工具。不把 MCP 工具摆进首页卡底按钮。不改 `agent.mcp` 协议。不宣称可发布。不把判断做成 Artifact。

## 使用场景

- 写「首页这条事件该亮哪个按钮」：看什么勾 Inbox/Feed/来源，用在哪选首页，动作勾接着做/做完了/忽略等，发布后点「用在首页」。
- 写「Agent 该调哪个工具」：用在哪选 Agent，从 Form/Dataset/Pages 等 MCP 工具里勾至少两个，发布后 Agent 调 `invoke`。
- 打开空函数页：看见「点「新建判断」」；编辑器字段自己说明看什么、用在哪，不另写机制说明。

## 方案与关键决策

- 去向 id：`home.dock` / `inbox.next` / `feed.capture` 仍是现场绑定键；`agent.mcp` 只表示给 Agent 用，不写入 `function_scene_bindings`。
- 事件去向的动作池 = 该现场已兑现点击路径（与现场景池一致）。MCP 出现在 Agent 去向，标「写」。
- 插件已登记但与系统 id 相同的动作不重复列出；未接线的插件动作进 Agent 去向。
- Choice 不再手填 key；从目录勾选。选项说明可改。
- `scene_id` / `subject_kinds` 不进入 `config_hash`。

## 输入输出与依赖

- 输入：行为总表、Manifest `function_scenes` / `judgment_subjects` / `mcp_exports` / `behaviors`。
- 输出：带去向的函数草稿、catalog JSON、函数页。
- 依赖：`specs/functions-system-capability/spec.md` 的判断与现场绑定合同。

## 文件 / 模块边界

允许：`specs/functions-product-authoring/`、`packages/contracts`（functions 合同）、`modules/functions`（列与内置 seed）、`plugins/native/functions`（UI/HTTP/文案）、`apps/local-host`（catalog 注入）、对应测试、SSOT 一行。

禁止：Feed/Inbox/首页 import Functions 插件实现；把 MCP 画进卡底。

## 验收标准

1. 新建 Choice 能选看什么（对象类型）和用在哪（首页 / Inbox / Feed / Agent）。每个去向一行说清用户在那会看到什么变化。
2. 事件去向的动作勾选自该现场已接线行为，标题来自总表，不是手填 key。
3. Agent 去向能勾到 MCP 工具（至少含 Functions `invoke` 与 Form `create`）和系统/插件动作；写动作标「写」。
4. Noul/Score 不能选 Inbox / 首页 / Feed；文案说明这三处要用 Choice。
5. 空态引导去「新建判断」，不讲机制、不说「这道题」。创建对话三个选项自己带一句。
6. Inbox / 首页已发布函数可在编辑器打开或停用；未绑时按钮为「用在 Inbox」/「用在首页」。Feed 未绑时说明去任务里选。Agent 去向说明发布后可用。
7. 已写 `scene_id=agent.mcp` 的函数绑到 `inbox.next` 返回 400。内置三个系统函数带对的 `scene_id` 与 `subject_kinds`。
8. 函数页是单栏编辑器，不再是定义/试跑双栏。
9. 定向测试覆盖 catalog HTTP、持久化、`functionFitsScene` 去向、页面文案。浏览器能打开函数页看到看什么/用在哪。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-functions --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/functions-system-capability.test.ts
```

## 假设与开放问题

- 首页卡底仍不画 MCP 按钮；MCP 只出现在 Agent 去向。
- 未接线的插件动作不进 Inbox/首页按钮，只在 Agent 去向可见。
