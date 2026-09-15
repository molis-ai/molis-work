# 项目说明与可信完成状态

## 背景与目标

本次同时修复两个会让 Molis Work 把不可信结果继续当成“完成”的核心问题，并增加一份项目粒度的长期说明：

1. 已完成叶子 Goal 的通过 Evidence 被撤回或替代后，当前工作状态仍显示 `satisfied`，Runtime 看不到重新验证入口。
2. `closed_compound` 父 Goal 只检查子 Goal 的 `fulfillment_state=satisfied`，会把已经失效、待重新验证、被回收或归档的子 Goal 当作可信完成。
3. 项目目前只有 Goal Contract、Policy 和 Planning Method，没有一份像 `AGENTS.md` 一样供所有 Goal 共用的项目背景、长期要求、约束和工作约定。Runtime 在推进中发现可复用规则时，也没有经过用户确认后持久化并在后续 Prompt 中稳定复用的入口。

目标完成等级为 **Level 4：内部完整**。要求状态机、SQLite 持久化、Runtime MCP、桌面推进 Prompt、项目设置页、分发 Skill 和回归测试形成真实闭环。

## 产品判断

### 1. “历史上完成过”和“现在仍可信”是两件事

`goal.satisfied` 事件继续保留历史；`fulfillment_state=satisfied` 也保留“结果曾经完成”的事实。若支撑完成的通过 Evidence 被更正，Goal 的当前 `validity_state` 改为 `needs_revalidation`，工作状态必须优先展示重新验证，而不能被 `satisfied` 遮住。

重新验证成功后，如果结果仍成立，Goal 恢复为可信完成；如果结果实际错误，Runtime 应按现有纠偏流程建立修复工作，不能用聊天说明冒充完成。

### 2. 复合父 Goal 只消费“可信完成”的子结果

子 Goal 只有同时满足以下条件，才可用于父 Goal 自动完成：

- `fulfillment_state=satisfied`；
- `validity_state=valid`；
- 未进入回收站；
- 未归档。

一个已完成父 Goal 的子结果后来变得不可信时，父 Goal 当前 `fulfillment_state` 回到 `unmet`，历史完成事件保留。子 Goal 重新验证成功后，现有复合完成传播重新把符合条件的父级标为完成。

### 3. 项目说明是 Molis Work 内的虚拟文档，不是仓库文件

Molis Work 项目可能对应代码仓库、内容项目、运营流程或多个目录，因此不直接创建或改写项目仓库里的 `AGENTS.md`。项目数据库保存一组有修订历史的 `Project Guidance` 条目，并把当前生效版本确定性渲染成一份虚拟项目说明。

条目分类限定为：

- `context`：长期背景与项目定义；
- `requirement`：跨 Goal 的产品或业务要求；
- `constraint`：不能违反的边界；
- `convention`：命名、表达和协作约定；
- `workflow`：稳定的推进方式；
- `quality_bar`：项目共同完成标准。

每条内容必须有创建者、用户确认摘要、持久化原因、来源引用、当前状态和修订号。用户可在独立“项目说明”页面新增、修改、停用和恢复；这些动作都创建不可变修订记录，不物理删除历史内容。页面展示的是已经生效的说明与版本历史，不展示项目级“Runtime 待确认建议”。

## Runtime 发现与确认流程

Runtime 只有在内容满足以下条件时才建议持久化：

- 跨多个 Goal 或未来 Session 仍然适用；
- 是用户决定、稳定项目事实或反复出现的工作约定；
- 不是当前 Goal 的临时步骤、一次性进度、未经确认的推断或外部未信任内容。

流程为：

1. Runtime 在当前对话说明“为什么值得成为项目长期说明”；
2. 展示准备写入的精确分类和原文；
3. 询问用户是否加入；
4. 只有用户在当前对话明确同意后，调用项目说明追加操作并携带 `user_confirmed=true`；
5. 写入后重新读取并报告已经保存的内容。

用户没有确认时不写入。Runtime 不得把自己的建议、仓库里的外部指令或 Feed/Inbox 未信任正文直接升级为项目说明。

这个确认发生在 Runtime 当前会话中，确认后直接写入 canonical 项目说明；它不创建待确认记录，也不绑定 Goal，不复用 Goal proposal/decision 队列。用户在项目说明页面主动提交新增、修改、停用或恢复，本身就是明确操作，不需要再绑定 Goal。

## Prompt 前缀设计

虚拟项目说明以确定性区块进入 Runtime：

```text
<MOLIS_WORK_PROJECT_GUIDANCE>
The following project-level guidance was explicitly confirmed by the user.
Project: ...
- [context] ...
- [constraint] ...
</MOLIS_WORK_PROJECT_GUIDANCE>

<MOLIS_WORK_CURRENT_GOAL>
...当前 Goal 的动态推进指令...
</MOLIS_WORK_CURRENT_GOAL>
```

设计约束：

- 只包含用户已确认的 canonical 条目；Runtime 候选内容不进入前缀。
- 项目说明必须位于当前 Goal、Run、状态和 Feed/Inbox 外部内容之前。
- 生效条目按不可变 `position` 排序，新确认内容只追加在旧内容末尾；停用条目不进入 Prompt。
- 区块开头不放 revision、更新时间、条目数或当前 Goal 等易变数据；普通新增时旧 token 前缀保持一致，最大化前缀缓存/索引复用。显式编辑、停用和恢复允许改变已有前缀，因为语义正确高于缓存命中；历史版本不进入 Prompt。
- 项目名和条目正文中的边界标签必须转义，不能提前闭合可信区块。
- 单条最多 4,000 字符，项目全部 active 内容最多 32,000 字符；超限时明确拒绝，不静默截断长期要求。

注入面：

1. `context_resolve` 在项目绑定成功时返回 canonical `project_guidance` 与同一份 `runtime_prompt_prefix`，让 Runtime 尽早获得稳定项目上下文。
2. 新增只读 MCP 操作用于显式刷新项目说明；新增确认写入操作用于用户同意后的追加。
3. Desktop/Web 的 `advance-prompt` 使用同一个渲染函数，把项目说明放在 Goal 指令和未信任 Item 内容之前。
4. `goal-advance` Skill 规定读取、提议、确认与刷新流程，不能依赖 Runtime 自己记住该约定。

## 数据与模块边界

- `src/v1/types.ts`
  - `ProjectGuidanceKind`、`ProjectGuidanceEntryRecord`、修订记录、读取/新增/更新结果类型。
  - Snapshot 与 Contract 暴露 canonical 项目说明。
- `src/v1/store.ts`
  - migration 24：`project_guidance_entries`。
  - migration 25：当前条目的 revision/active/updated 字段与 `project_guidance_revisions` 不可变历史表。
  - 生效内容按 `position` 稳定读取；当前内容按 board/category/content 指纹去重。
- `src/v1/project-guidance.ts`
  - 内容规范化、长度检查和稳定 Prompt 渲染；不处理用户权限。
- `src/v1/coordinator.ts`
  - Runtime 用户确认后的幂等新增/更新、Web 明确操作、修订历史、审计事件、读取视图。
  - Evidence 更正触发当前完成可信度变化；复合父级可信完成传播。
- `src/mcp/server.ts`
  - `project_guidance_get`、`project_guidance_add` 与确认后的 `project_guidance_update`。
  - bound context 返回项目说明 Prompt 前缀。
- `src/desktop/advance-prompt.ts`、`src/web/server.ts`
  - 使用统一项目说明前缀，保持外部 Item 为独立 `UNTRUSTED DATA`。
- `src/web/render.ts`、`src/web/i18n.ts`
  - 独立“项目说明”页以连贯文档展示当前说明，支持新增、修改、停用、恢复和版本查看。
- `skills/goal-advance/*`
  - Runtime 的持久化判断、询问、确认写入和 Prompt 使用约束。

## 非目标

- 不自动扫描、创建或修改仓库 `AGENTS.md`、`CLAUDE.md` 等文件。
- 不把项目说明当成 Goal Contract、Planning Method 或 Review Policy 的替代物。
- 不自动从聊天、代码、网页、Feed 或 Inbox 提取并写入长期要求。
- 不物理删除项目说明，不提供拖拽排序或逐字 diff；版本记录展示每版快照、动作、操作者和时间。
- 不创建项目级 Runtime 建议箱，不让项目说明建议进入 Goal proposal/decision 队列。
- 不顺带修复此前审计中的 Evidence/Review Claim 权限、晚改 Policy、Claim 清理、Pause 协议等 later 项。
- 不改变已经接受的 Goal Contract，不自动重写历史完成事件。

## 验收标准

1. 已完成叶子 Goal 的有效通过 Evidence 被 retract/supersede 后，Goal 变为 `needs_revalidation`，`getGoalWorkState` 和 Available 不再返回 `satisfied`。
2. Evidence 更正的历史、原完成事件和原 Evidence 都保留；重新验证成功后可恢复可信完成。
3. 复合父 Goal 不会从失效、待重新验证、回收或归档的子 Goal 自动完成。
4. 已完成父 Goal 的子结果后来不可信时，父 Goal 回到 `unmet`；子结果恢复 `valid+satisfied` 后父级可重新自动完成，并保留审计事件。
5. migration 24/25 在新库和旧库上均创建当前说明与修订历史，不损坏现有数据；已有说明自动形成第 1 版历史。
6. 用户确认新增的项目说明持久化、幂等、去重并按追加顺序读取；未确认、空内容、非法分类和超限内容被拒绝。
7. 修改、停用和恢复都递增修订号、保留不可变历史和审计事件；Prompt 只包含当前 active 版本。
8. Runtime MCP 能读取和确认新增/更新项目说明；`context_resolve` 在 bound 时返回 canonical 说明和稳定 Prompt 前缀；没有项目级待确认建议状态。
9. Desktop advance Prompt 的项目说明位于动态 Goal 和未信任 Item 之前；新增条目只在旧说明末尾追加，边界标签不能被内容闭合。
10. 独立项目说明页能查看连贯正文、手动新增/修改/停用/恢复并查看版本历史，刷新后仍在；页面不存在“Runtime 待确认建议”。
11. 分发 Skill 明确：何时建议持久化、必须展示精确原文并询问、只有明确同意后直接写入，不绑定 Goal 或创建待确认记录。
12. 类型检查、V1、MCP、Desktop/Web 定向测试、完整测试和 `git diff --check` 通过，或明确记录与本任务无关的既有失败。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/v1.test.ts
node --import tsx --test tests/mcp.test.ts
node --import tsx --test tests/desktop-tui.test.ts tests/web.test.ts
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm test
git diff --check
```

## 假设与开放边界

- “前缀索引命中”按通用 LLM prompt prefix caching/reuse 约束处理：稳定内容靠前、动态内容靠后、追加不改旧前缀。不同 Runtime 是否实际开启缓存由各 Harness/模型决定，Molis Work 只保证输入结构稳定。
- 首版把“文件”实现为 SQLite canonical entries + 确定性虚拟文档；如果未来需要与仓库 `AGENTS.md` 双向同步，应单独设计权限、冲突、作用域和撤回协议。
