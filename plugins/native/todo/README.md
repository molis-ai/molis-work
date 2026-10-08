# 待办（Todo）

用户需要推进的事项的正式管理位置：个人待办和项目待办，手动管理不依赖 AI。数据在 `{home}/todo/todo.db`。

包名：`@molis-ai/molis-work-plugin-todo`。需求见 [specs/archive/todo-plugin/spec.md](../../../specs/archive/todo-plugin/spec.md)，实现与进度见 [implementation.md](../../../specs/archive/todo-plugin/implementation.md)。

所有动作由插件的 `actions.ts` 声明，`scope: "home"`，由 Host 的一个 Home 级提供方登记：没有项目时也能用。调用方在项目里时只看到个人、暂未归类和这个项目的待办；跨项目的“所有项目”只对用户本人的界面（`audience: "user"`）开放，助理、工作流和 MCP 看不到。HTTP 只转参数，身份与项目由 Host 绑定。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：待办的记录、状态、三种日期（截止、计划处理、提醒）、归属（个人、项目、暂未归类）、来源与形成原因、关联、修改记录与撤销、视图、搜索与对象读取、批量处理；提醒的到期判断与首页事项；整理结果（候选、依据、与已有待办的关系、忽略与已处理的记忆）及其审阅与采用；整理方法（登记的指令 `todo.organize.basic`）。
- 不负责：AI 整理与推进（系统 Assistant 经 Prologue 负责，Todo 只提供动作与对象读取）、Goal 与业务结果、提醒的送达渠道、材料正文（只存引用）。
- 公开入口：`@molis-ai/molis-work-plugin-todo`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin` 与 `@molis-ai/molis-work-contracts/modules/todo`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 修改带读取时的 `expected_revision`，别处改过时拒绝，不覆盖。
  - 每次修改记一条历史；用户本人改过的字段记入 `edited_fields`，之后的自动更新据此保护。
  - 撤销按历史进行，之后又被改过就拒绝；删除不可撤销，执行前确认。
  - 从 Inbox、灵光“转为待办”由 Workbench 调新建接口组合：原条目只作为来源（`inbox`／`lingguang`）保留，不改它的状态；请求号 `inbox:<id>`、`lingguang:<id>` 让同一条再转时找到原来的待办（升级前转过的除外，见下）。
  - 重要标记只能由用户本人设置；“所有项目”只给用户本人的界面。
  - 新建带 `request_id` 时同一请求重试不重复创建；请求号按调用者与所在项目分别记（整理结果的请求号同理），别的调用者用了同一个号是另一次请求，不会拿到别人的待办。
  - 已落库的旧请求号不迁移、不回退匹配：按调用者与项目分别记之前写入 `todo_requests` 和 `todo_batches.request_id` 的行存的是原始请求号，现在的键是 `[调用者, 项目, 请求号]`，旧行不再命中。后果：升级前已转过的 Inbox／灵光条目（`inbox:<id>`、`lingguang:<id>`）再转一次会新建一条待办，升级前发出的整理请求重试也不再去重；升级后新写入的请求照常去重。旧行只是不再命中，读取与整理都不会因它报错，`todo_requests` 的旧行随它所属待办的删除或撤销一并清掉；这是按“没有旧数据”处理的取舍，不另写回退匹配或改写旧行的逻辑。
  - 整理只产生待确认的候选，不直接新建或修改待办；依据必须能在原文里找到，原文没写的日期只作建议，用户手动改过的字段只作冲突提示——采用时按待办此刻的状态再判断，整理之后才改的字段同样不被覆盖。
  - 截止日期按原文说法与写下时间确定性换算，不采用模型的日期算术；有歧义时只给建议日期。
- 改动后必跑：`node scripts/run-tests.mjs tests/todo-actions.test.ts tests/todo-organize.test.ts tests/todo-plugin.test.ts tests/todo.e2e.test.ts tests/context-onboarding-todo.test.ts tests/context-onboarding-todo.e2e.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[continuity.md](../../../skills/molis-plugin-dev/continuity.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
