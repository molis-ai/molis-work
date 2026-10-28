# 连续工作：对象、版本与助理

同一件工作会在底栏助理、你的插件页面和用户的手动操作之间交替进行：助理产出一篇文档，用户在插件里改，再回到助理继续；或者用户先在插件里开始，再唤起助理。插件要做到的是：**别的入口随时能从你这里读到对象的最新事实，旧结果不会覆盖新版本。**

系统不另建保存一切的总账。对象（正文、版本、是否已删除）归你的插件；工作与对象的关系（从哪个对象开始、用了哪些材料、产出了什么、交给了哪个会话）是 Context Ledger 的关系边，由助理这样的语义所有者写；运行、问题和确认归 Agent Host。用户的手动修改不另记流水——它就是你那里版本的变化，别的入口靠比较版本得知。

## 插件要做的事

1. **对象上下文读取。** 界面上展示的每种对象，都提供一个读取动作：

   ```ts
   defineSubjectContextAction("<plugin>.subject.read", "<kind>", "<对象名>", ["<plugin>:read"]);        // 项目里的对象
   defineSubjectContextAction("<plugin>.subject.read", "<kind>", "<对象名>", ["<plugin>:read"], "home"); // 个人范围的对象
   ```

   读取动作是版本 2：`goal_ids` 不是必填，对象不属于任何 Goal 就不写（不要补 `[]`）。固定了版本 1 读取器的引用会遇到另一份合同，要改成 2。

   handler 用 `subjectContext({ subject, revision, title, content, goal_ids, open }, input)` 返回：当前正文（一次最多 32000 字；把读取器收到的 `input` 作第二个参数传进去，就能从 `input.offset` 起一页页读长文，项目资料按页读到全文；不传只给第一页并标 `truncated`）、`revision`（你自己的版本号或令牌，内容一变它就变）、关联的 Goal、所在会话，以及 `open: { surface, id }`——工作台打开它的位置（与 `host.openItem(surface, id)` 一致）。对象不存在时抛 `<plugin>.not_found`：助理据此显示“已不存在”，而不是“暂时读不到”。一种对象只能有一个提供方。

2. **修改类动作说清改了哪个对象、改成了哪个版本。** `subject_kinds` 只写一种；在 `result_subject` 里声明输出中对象标识与新版本的位置，例如 `{ id: "document.id", revision: "document.version" }`（两个位置都要在本次 `output_schema` 里写出来：写成字符串、位置不在合同里会被拒绝；没有 `output_schema` 就没有位置可指）。不声明时按代码里的明文规则推断，只对“既不是查询也不是导航、恰好写了一种 `subject_kinds`”的动作生效：输出本身带字符串 `id` 就用它；否则用输出顶层唯一一个带字符串 `id` 的对象字段；版本取该对象的 `version`，没有就取 `revision`；输出里找不到这样的对象就看输入——输入带字符串 `id` 就指它，没有版本。平台不检查推断得对不对，所以会写东西的动作应当声明 `result_subject`。修改已有对象的动作接受 `expected_version`（或 `expected_revision`），不一致就拒绝。助理修改已有对象时必须带上读取时的版本，否则在请用户确认之前就被拒绝。

3. **页面声明当前对象。** 插件根元素写 `data-assistant-context`（契约 `AssistantSurfaceContext`，`@molis-ai/molis-work-contracts/services/assistant`）：`plugin_id`、`surface_title`、`object: { kind, id, version, title }`（`kind` 与读取动作一致）、`unsaved`、`draft_text`（未保存内容，限长）、`starters`（空输入时的起步建议，点选只填入输入框）。随选择与保存更新。这是对屏幕的说明，不是授权，也不写任何记录：只有用户发送时，它才成为这一轮的材料。没有声明时，工作台按当前标签页给出对象身份，但拿不到版本、选区和草稿。

4. **两个方向的通知。** 监听 `molis:assistant-effect`（`ASSISTANT_EFFECT_EVENT`，`detail: { work_id, capability_id, session_id? }`）：`capability_id` 以你的前缀开头时重新读取；有未保存修改时不覆盖，只提示“助理刚改过，保存时会提示冲突”。用户在你的页面上改变了助理可能正在展示的东西（会话的方式、自己发起了一轮）时，发 `molis:assistant-surface-changed`（`ASSISTANT_SURFACE_CHANGED_EVENT`，`detail: { plugin_id, object }`）。两者都只是“请重读”，不携带数据。事件只在同一个窗口里传递；另一个窗口靠定期读取跟上。

5. **设置与草稿以所有者为准。** 页面缓存的设置（例如 Coding 会话的方式），在本页没有未保存改动时要采用已保存的值；否则下一次保存会把别处刚改的设置写回。做法见 Coding 客户端：记住“上次采用的值”，读到的已保存值不同且本页没改过，就采用。

6. **给助理发信息，按用途说清楚。** 页面用 `molis:assistant-message`（`ASSISTANT_MESSAGE_EVENT`，契约 `AssistantPluginMessage`）告诉助理一件事，`purpose` 决定助理怎么对待它，措辞不起作用：

   | `purpose` | 什么时候用 | 助理怎么做 |
   | --- | --- | --- |
   | `background` | 页面想补充“现在在看什么”（没有 `data-assistant-context` 时） | 只作为下一次发送的页面上下文；不发送、不调模型 |
   | `change` | 你的对象被改了（`object` 必填） | 与它相关的工作重新读取；不是请求 |
   | `suggest` | 建议用户发起一项工作（如“带到助理”） | 在底栏上方显示来源与内容，用户点“放进输入框”才填入，由用户发送 |
   | `delegate` | 用户在你的页面上**刚刚**要求交给助理处理（如“交给助理”表单提交） | 只有页面上有真实的用户操作（`navigator.userActivation.isActive`）才立即开始或接着 `work_id` 那项工作；否则降为建议并注明“未确认是你发起的” |
   | `reply` | 你把结果交回给一项工作（`work_id`、`object` 必填） | 把对象作为这项工作的结果关联起来，之后向你重读；收到不等于工作完成 |

   每条带唯一的 `message_id`（重复的只处理一次；委托用它做发送的请求号，同一条不会开始两次）。`materials` 最多 4 份、每份不超过 20000 字，带上 `object` 就能回到原对象。不要在信息里自称“用户已同意”——助理不看这种话，只看真实的操作与授权。样例：Pages 写作菜单里的“带到助理（由你发送）”（`suggest`）与“交给助理”（`delegate`）。

同一个读取器也是系统搜索读取正文的地方：可搜索的对象再声明一个搜索来源即可被 ⌘K、助理与 MCP 搜到，见 [search.md](search.md)。

## 撤销、后台任务与同一次注册

动作声明里指向别的动作的地方——可撤回修改的 `undo`、会启动后台任务的 `background_job.status`、片段与事项推荐的选项目标——目标都必须在**同一次注册**里：同一份 Manifest 的 `actions`，或同一次 `registerProvider` 的 `definitions`（文档里说的“同一提供方”就是这个）。注册先后不定，所以不按提供方编号跨注册去找：一个提供方拆成几次注册、又互相引用，会被拒绝，报“不在同一提供方的声明里”。要用别的提供方的动作，写 `required_actions`，使用时按调用者核对。`definePlugin`、命令行 `validate`、Runtime 安装与升级、宿主注册动作时都检查（SDK 的 `inspectActionCrossReferences`）。片段与事项推荐的选项同样要指向同一次注册里、同一范围的动作；事项推荐的目标还要支持选项对应的事项种类（目标没写事项种类则不限）。

**可撤回的修改声明 `undo`：** `{ capability_id, version, input: { 字段: "输出路径" } }`，指向同一次注册里的撤销命令，以及它的输入在本次输出里的位置；需要数组时写 `["路径"]`。注册时检查：撤销命令存在、是命令、与本动作同一范围、不能是它自己；`input` 里的每个字段都是撤销命令输入 schema 的属性，撤销命令必填的输入都要填上；每个输出路径都在本动作的 `output_schema` 里写出来了（只写 `type: "object"` 的开放对象找不到，要先把字段写出来；没有 `output_schema` 就没有位置可指）。这样的修改在用户明确要求时由助理直接执行、事后可撤销，用户也可以把它设成每次确认。删除、对外发送这类撤不回的修改不要声明。样例：灵光“记下灵光”用“丢弃灵光” `{ ids: ["spark.id"] }` 撤回。

**会启动后台任务的命令声明 `background_job`：** `{ status: { capability_id, version }, id: "run.jobId", input: "id", state: "status", done: [...], failed: [...] }`——同一次注册里的状态查询、输出里任务标识的位置、状态查询接收标识的字段、状态的位置和结束状态。注册时检查：状态查询存在、是查询、与本动作同一范围；`id` 在本动作的 `output_schema` 里，`input` 在状态查询的输入 schema 里，`state` 在状态查询的输出 schema 里；`done`、`failed` 是非空字符串数组。助理（或用户点的建议按钮）启动后，Host 经 Prologue 队列按状态查询跟进到结束，结束时提醒用户、按钮显示结果，并在下一轮告诉助理；不必自己推送。样例：炼金术士的“启动炼化”“启动研究”。

## 不要做的

- 不要自己记录“助理做过什么”，也不要把对象正文复制到别处保存：关系由助理写进 Context Ledger，内容总是向所有者重读。
- 不要把浏览当成任务：页面声明不写记录，不申请授权，不进记忆。
- 不要让一个修改动作改多种对象却不声明结果对象。
- 给插件加了新路由或动作时，要递增 Manifest `version`。内置插件（监督器条目 `trust: HOST_BUILD_TRUST`）随宿主升级；第三方或用户安装的插件（非 `host` 信任）还要声明 `upgrade_compatibility` 来源，否则已安装的项目仍按旧清单运行，新路由不存在（见 [elements.md · 版本升级](elements.md#版本升级)）。

## 样例与验证

- 完整样例：Pages（`plugins/native/pages`：`pages.subject.read`、`result_subject`、`expected_version`、页面声明与刷新）和 Coding（`plugins/native/coding`：`coding.subject.read` 路由、页面声明、方式同步、两个入口同一会话）。
- 测试：`tests/assistant-work-continuity.test.ts`（关系、手动修改被感知、版本前提、相关工作查询、Home 作用域声明）、`tests/assistant-executor.test.ts`（两个入口、接续会话、交接与回到助理）。
- 需求与验收：`specs/archive/system-assistant/spec.md` 第 10.4 节、AC46—AC51。
