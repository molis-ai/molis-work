# 函数页：来源、事件去向、动作总表

完成等级：**3 功能可用**。不宣称可发布。

## 背景目标

底层已有判断、行为总表、现场绑定。函数页仍是给 Agent 用的双栏表单：Choice 手填 key，没有来源/去向，空态还写「发布给 Agent」。用户配不明白，页面也丑。

要把写函数做成系统判断的产品面：看什么、何时跑、在哪开开关、能挑哪些已登记动作、挑中后有什么效果。动作名单来自 Host 行为总表：系统处置、插件 Manifest `behaviors`、MCP `mcp_exports`。

## 当前行为与问题证据

- `plugins/native/functions/src/ui.ts` 两栏 `functions-define` / `functions-try`；空态「发布给 Agent 调用」；创建对话「Agent 才能调用」。
- Choice 选项是手填 key。填成人话后 `functionFitsScene` 对不上场景池，现场下拉看不见该函数。
- 行为总表在 `assembleHostBehaviorCatalog`，函数页不消费。MCP 与插件动作只存在于合同，用户在函数页看不到。
- 绑定仍在 Inbox / 首页详情 / Feed 规则，这是对的；函数页需要说明那是开关所在，并让草稿先选定去向。

## 范围

1. 函数记录持久化 `scene_id`（去向）和 `subject_kinds`（来源）。内置三个系统函数写入对应去向与对象类型。
2. Host 提供 `GET /api/functions/catalog`：subjects、destinations（事件去向 + Agent/MCP）、behaviors（系统 / 插件 / MCP，带 effect 与是否可摆到现场按钮）。
3. 新建/编辑 Choice：勾选来源；点选一个去向。每个去向写清何时跑、哪里配置、什么效果。
4. 去向分两类：
   - **事件**：首页出现这条事件、Inbox 条目落地、Feed 捕捉命中。选项只能勾该现场已接线的系统/插件动作。
   - **给 Agent 调用**：发布后走 MCP `functions.invoke`。选项勾行为总表里的 MCP 工具和未接到现场按钮的插件动作。
5. Noul / Score 不能绑事件现场；页面写明只给 Agent 用。
6. 未绑时说明去哪个现场开开关；已绑时「被用在哪」可读。开关仍在 Inbox / 首页 / Feed，不另做总控台。
7. 函数页视觉改成单栏工作台（对齐 Form）：空态教用法，编辑器能扫清来源/去向/动作/试跑。
8. `functionFitsScene`：已写 `scene_id` 的函数只能绑到该去向；`agent.mcp` 不能绑现场。

## 非目标

不另做总控台。不自动执行写入或 MCP 写工具。不把 MCP 工具摆进首页卡底按钮。不改 `agent.mcp` 协议。不宣称可发布。不把判断做成 Artifact。

## 使用场景

- 写一道「首页这条事件该亮哪个按钮」：来源勾 Inbox/Feed/来源，去向选首页事件，动作勾接着做/做完了/忽略等，发布后去首页详情选它。
- 写一道「Agent 该调哪个工具」：去向选给 Agent 调用，从 Form/Dataset/Pages 等 MCP 工具里勾至少两个，发布后 Agent 调 `invoke`。
- 打开空函数页：能看懂这是系统判断，下一步是写题、试跑、发布、去现场开开关。

## 方案与关键决策

- 去向 id：`home.dock` / `inbox.next` / `feed.capture` 仍是现场绑定键；`agent.mcp` 只表示给 Agent 用，不写入 `function_scene_bindings`。
- 事件去向的动作池 = 该现场已兑现点击路径（与现场景池一致）。MCP 出现在 Agent 去向，标「写 / 判断只建议」。
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

1. 新建 Choice 能选来源（对象类型）和去向（三个事件现场或给 Agent 调用）。每个去向能读到何时、哪里配、什么效果。
2. 事件去向的动作勾选自该现场已接线行为，标题来自总表，不是手填 key。
3. Agent 去向能勾到 MCP 工具（至少含 Functions `invoke` 与 Form `create`）和系统/插件动作；写动作标明不会自动执行。
4. Noul/Score 不能选事件去向；文案说明现场判断要用 Choice。
5. 空态与创建对话不再只说「发布给 Agent」；说明这是系统判断、发布后去现场开开关。
6. 未绑事件去向时，编辑器说明去 `configure_at` 选它。已绑时列出场景名。Agent 去向说明发布即可调用。
7. 已写 `scene_id=agent.mcp` 的函数绑到 `inbox.next` 返回 400。内置三个系统函数带对的 `scene_id` 与 `subject_kinds`。
8. 函数页是单栏编辑器，不再是定义/试跑双栏。
9. 定向测试覆盖 catalog HTTP、持久化、`functionFitsScene` 去向、页面文案。浏览器能打开函数页看到来源/去向。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-module-functions --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/functions-system-capability.test.ts
```

## 假设与开放问题

- 首页卡底仍不画 MCP 按钮；MCP 只出现在 Agent 去向。
- 未接线的插件动作不进 Inbox/首页按钮，只在 Agent 去向可见。
