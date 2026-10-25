# 待办（Todo）

用户需要推进的事项的正式管理位置：个人待办和项目待办，手动管理不依赖 AI。数据在 `{home}/todo/todo.db`。

包名：`@molis-ai/molis-work-plugin-todo`。需求见 [specs/archive/todo-plugin/spec.md](../../../specs/archive/todo-plugin/spec.md)，实现与进度见 [implementation.md](../../../specs/archive/todo-plugin/implementation.md)。

所有动作由插件的 `actions.ts` 声明，`scope: "home"`。Todo 是 Plugin Runtime 上的 Home 级插件（`src/plugin.ts` 的 `createTodoPlugin`，Manifest 的 `runtime: { scope: "home" }` 与目录条目的 `runtime`，库由宿主的 Home 库服务按 `TODO_DATABASE` 打开）：没有项目时也能用。调用方在项目里时只看到个人、暂未归类和这个项目的待办；跨项目的“所有项目”不由 Todo 判断受众：声明了 `project_reach: "person"` 的动作，宿主只在本人自己的调用里（并且用户给了 `projects:reach`）把此刻显示 Todo 的项目放进 `caller.readable_project_ids`，Todo 只按这份清单放行（SECURITY-INVARIANTS S-74）；助理、工作流和 MCP 的调用没有清单，隐藏了 Todo 的项目也不在清单里。HTTP 是 Manifest 声明的路由（`/api/plugins/io.molis.work.todo/…`，每条经 `bindPluginActionRoute` 转成一个动作），只转参数：身份由 Host 绑定，项目只来自页面路径 `/projects/<id>/api/plugins/io.molis.work.todo/…`（宿主核对项目存在且显示 Todo，见 SECURITY-INVARIANTS S-31），请求体里的 `project_id` 被丢掉。

页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/todo-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂，`--minify`）；`src/client.ts` 的 `TODO_CLIENT_FACTORY_SCRIPT` 只读这个包。页面状态在一个 `TodoPage` 对象里（`page.ts`），列表、提醒、整理审阅、详情、快速输入各是一个部件，在启动时把自己的操作装到这个对象上；按钮是 `commands.ts` 里按顺序匹配的命令表；请求只经工作台的 `molisWorkRequest`（`request.ts`），不直接 `fetch`。Todo 与 Form 从公共 `platform/ui` 的 `UiPluginClientHost` 取实际字段，宿主同合同类型检查；`pluginId` 与 `pluginRoute` 来自 Manifest 和当前项目，`route` 只处理平台路径。esbuild 是包的直接开发依赖，版本与根相同；升级后的资源增长仍须按资源规则评审。

页面上的字是稳定键（`todo.<区域>.<名称>`），中英文都在 `src/messages.ts`，登记在 `registration.ts` 的 `messages`，不经工作台的 `i18n/en.ts` import。`src/en.ts` 的 `TODO_EN` 只保留 Todo 交给宿主按中文原文翻译的动态声明（动作 schema 字段与选项、首页事项、搜索结果、项目数据标签），新页面文字一律加稳定键。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：待办的记录、状态、三种日期（截止、计划处理、提醒）、归属（个人、项目、暂未归类）、来源与形成原因、关联、修改记录与撤销、视图、搜索与对象读取、批量处理；提醒的到期判断与首页事项；整理结果（候选、依据、与已有待办的关系、忽略与已处理的记忆）及其审阅与采用；整理方法（登记的指令 `todo.organize.basic`）。
- 不负责：AI 整理与推进（系统 Assistant 经 Prologue 负责，Todo 只提供动作与对象读取）、Goal 与业务结果、提醒的送达渠道、材料正文（只存引用）。
- 公开入口：`@molis-ai/molis-work-plugin-todo`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin` 与 `@molis-ai/molis-work-contracts/modules/todo`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `todo.<原因>`，状态由错误种类决定，Todo 不自带状态表）。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 修改带读取时的 `expected_revision`，别处改过时拒绝，不覆盖。
  - 每次修改记一条历史；用户本人改过的字段记入 `edited_fields`，之后的自动更新据此保护。
  - 撤销按历史进行，之后又被改过就拒绝；删除不可撤销，执行前确认。
  - 从 Inbox、灵光“转为待办”走情境的创作入口（`todo.items.create` 声明的 intake，由 `todo.fragment.offers` 准备）：原条目只作为来源（`material`，`subject` 记着它是哪个对象）保留，不改它的状态；请求号 `intake:todo:<对象种类>:<id>` 让同一条再转时找到原来的待办；来源要不要显示成可点开的链接，由工作台按插件声明的对象种类找页面决定（找不到或有几个都不显示链接，只显示文字）。整个对象（Inbox 条目、灵光）转出的待办放在调用所在的项目（个人空间里则放个人空间），项目取自调用上下文、不读输入；只选一段文字转出的待办仍不带落位，留给本人。
  - 重要标记只能由用户本人设置；“所有项目”只给宿主给了清单的本人调用（`readable_project_ids`）。
  - 新建带 `request_id` 时同一请求重试不重复创建；请求号按调用者与所在项目分别记（整理结果的请求号同理），别的调用者用了同一个号是另一次请求，不会拿到别人的待办。
  - 已落库的旧请求号不迁移、不回退匹配：按调用者与项目分别记之前写入 `todo_requests` 和 `todo_batches.request_id` 的行存的是原始请求号，现在的键是 `[调用者, 项目, 请求号]`，旧行不再命中。后果：升级前已转过的 Inbox／灵光条目（`inbox:<id>`、`lingguang:<id>`，也含改走创作入口之前的 `intake` 以外的请求号）再转一次会新建一条待办，升级前发出的整理请求重试也不再去重；升级后新写入的请求照常去重。旧行只是不再命中，读取与整理都不会因它报错，`todo_requests` 的旧行随它所属待办的删除或撤销一并清掉；这是按“没有旧数据”处理的取舍，不另写回退匹配或改写旧行的逻辑。
  - 整理只产生待确认的候选，不直接新建或修改待办；依据必须能在原文里找到，原文没写的日期只作建议，用户手动改过的字段只作冲突提示——采用时按待办此刻的状态再判断，整理之后才改的字段同样不被覆盖。
  - 截止日期和时间按原文说法与写下时间确定性换算；候选、新建、原项的更新与受保护字段使用同一结果，不采用模型的日期算术。没有写时间就不补时刻，有歧义时只给建议日期。
  - 保存失败或标题为空会阻止离开与后续动作，保留编辑器各字段；明确确认重新读取或删除才丢弃。删除会先等正在派出的保存结束，之后不再派出该项的保存。
  - 选中文本的“记成待办”是 `todo.items.create` 上的创建入口（`intake`，context-program W4-1）：`todo.fragment.offers` 只做它的 `prepare`，从选区确定地算出整份输入（来源文本与对象固定在这时），浮条不再从它单独出选项。因为声明了 `undo`（`todo.changes.revert`），点一下就直接建，完成卡片上有「打开」「撤销」；同一请求号只建一条，之后在别处改过就拒绝撤销、不删也不改。默认归属仍为暂未归类，不自动变成项目待办。
  - 项目被删除时平台按 Manifest 里 Home 库的 `project_rows`（`src/database.ts`：确认框里的标签与要删的表）删掉放在这个项目里的待办及其历史、请求回执、整理器的记忆与审阅批次；个人待办不带项目，保留；插件的代码不参与，平台在自己的连接上删，库不存在时不创建，重复运行没有副作用（PG-024）。
- 改动后必跑：`node scripts/run-tests.mjs tests/todo-actions.test.ts tests/todo-organize.test.ts tests/todo-plugin.test.ts tests/translation-check.test.ts tests/todo.e2e.test.ts tests/todo-draft-recovery.e2e.test.ts tests/contextual-todo.e2e.test.ts tests/contextual-create.test.ts tests/context-onboarding-todo.test.ts tests/context-onboarding-todo.e2e.test.ts tests/project-deletion-owners.test.ts tests/action-error-model.test.ts tests/action-error-edges.test.ts tests/todo-from-inbox.e2e.test.ts tests/todo-placement.e2e.test.ts tests/todo-assistant.e2e.test.ts tests/web-route-table.test.ts tests/security-invariants-home-route-project.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[continuity.md](../../../skills/molis-plugin-dev/continuity.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
