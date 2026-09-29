# 连续工作：对象、版本与助理

同一件工作会在底栏助理、你的插件页面和用户的手动操作之间交替进行：助理产出一篇文档，用户在插件里改，再回到助理继续；或者用户先在插件里开始，再唤起助理。插件要做到的是：**别的入口随时能从你这里读到对象的最新事实，旧结果不会覆盖新版本。**

系统不另建保存一切的总账。对象（正文、版本、是否已删除）归你的插件；工作与对象的关系（从哪个对象开始、用了哪些材料、产出了什么、交给了哪个会话）是 Context Ledger 的关系边，由助理这样的语义所有者写；运行、问题和确认归 Agent Host。用户的手动修改不另记流水——它就是你那里版本的变化，别的入口靠比较版本得知。

## 插件要做的五件事

1. **对象上下文读取。** 界面上展示的每种对象，都提供一个读取动作：

   ```ts
   defineSubjectContextAction("<plugin>.subject.read", "<kind>", "<对象名>", ["<plugin>:read"]);        // 项目里的对象
   defineSubjectContextAction("<plugin>.subject.read", "<kind>", "<对象名>", ["<plugin>:read"], "home"); // 个人范围的对象
   ```

   handler 用 `subjectContext({ subject, revision, title, content, goal_ids, session_id, open })` 返回：当前正文（超过 32000 字截断并标 `truncated`）、`revision`（你自己的版本号或令牌，内容一变它就变）、关联的 Goal、所在会话，以及 `open: { surface, id }`——工作台打开它的位置（与 `host.openItem(surface, id)` 一致）。对象不存在时抛 `<plugin>.not_found`：助理据此显示“已不存在”，而不是“暂时读不到”。一种对象只能有一个提供方。

2. **修改类动作说清改了哪个对象、改成了哪个版本。** `subject_kinds` 只写一种；在 `result_subject` 里声明输出中对象标识与新版本的位置，例如 `{ id: "document.id", revision: "document.version" }`（不声明时按“输出里唯一带 id 与 version 的记录”推断）。修改已有对象的动作接受 `expected_version`（或 `expected_revision`），不一致就拒绝。助理修改已有对象时必须带上读取时的版本，否则在请用户确认之前就被拒绝。

3. **页面声明当前对象。** 插件根元素写 `data-assistant-context`（契约 `AssistantSurfaceContext`，`@molis-ai/molis-work-contracts/services/assistant`）：`plugin_id`、`surface_title`、`object: { kind, id, version, title }`（`kind` 与读取动作一致）、`unsaved`、`draft_text`（未保存内容，限长）、`starters`（空输入时的起步建议，点选只填入输入框）。随选择与保存更新。这是对屏幕的说明，不是授权，也不写任何记录：只有用户发送时，它才成为这一轮的材料。没有声明时，工作台按当前标签页给出对象身份，但拿不到版本、选区和草稿。

4. **两个方向的通知。** 监听 `molis:assistant-effect`（`ASSISTANT_EFFECT_EVENT`，`detail: { work_id, capability_id, session_id? }`）：`capability_id` 以你的前缀开头时重新读取；有未保存修改时不覆盖，只提示“助理刚改过，保存时会提示冲突”。用户在你的页面上改变了助理可能正在展示的东西（会话的方式、自己发起了一轮）时，发 `molis:assistant-surface-changed`（`ASSISTANT_SURFACE_CHANGED_EVENT`，`detail: { plugin_id, object }`）。两者都只是“请重读”，不携带数据。事件只在同一个窗口里传递；另一个窗口靠定期读取跟上。

5. **设置与草稿以所有者为准。** 页面缓存的设置（例如 Coding 会话的方式），在本页没有未保存改动时要采用已保存的值；否则下一次保存会把别处刚改的设置写回。做法见 Coding 客户端：记住“上次采用的值”，读到的已保存值不同且本页没改过，就采用。

同一个读取器也是系统搜索读取正文的地方：可搜索的对象再声明一个搜索来源即可被 ⌘K、助理与 MCP 搜到，见 [search.md](search.md)。

## 不要做的

- 不要自己记录“助理做过什么”，也不要把对象正文复制到别处保存：关系由助理写进 Context Ledger，内容总是向所有者重读。
- 不要把浏览当成任务：页面声明不写记录，不申请授权，不进记忆。
- 不要让一个修改动作改多种对象却不声明结果对象。
- 给 Native 插件加了新路由或动作时，要递增 Manifest `version` 并声明兼容来源；否则已安装的项目仍按旧清单运行，新路由不存在（见 [elements.md · 版本升级](elements.md#版本升级)）。

## 样例与验证

- 完整样例：Pages（`plugins/native/pages`：`pages.subject.read`、`result_subject`、`expected_version`、页面声明与刷新）和 Coding（`plugins/native/coding`：`coding.subject.read` 路由、页面声明、方式同步、两个入口同一会话）。
- 测试：`tests/assistant-work-continuity.test.ts`（关系、手动修改被感知、版本前提、相关工作查询、Home 作用域声明）、`tests/assistant-coding-executor.test.ts`（两个入口、接续会话、交接与回到助理）。
- 需求与验收：`specs/system-assistant/spec.md` 第 10.4 节、AC46—AC51。
