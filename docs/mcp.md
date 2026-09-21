# MCP 接入

Molis Work 通过统一 Skill 连接项目。Runtime 消费 `molis_work_v1_context_resolve` 返回的公开状态、项目身份和连接，不读取 catalog 或数据库路径，也不从仓库名推断项目。已绑定 Session 或唯一、已验证 workspace membership 可以只读恢复；候选本身不授权绑定。

## Runtime 工作入口绑定（推荐）

Runtime 宿主只在自己能保证稳定性的情况下提供 Session ID；它不是 Git 地址、目录名、仓库结构或模型从对话中推断的字符串。Molis Work 支持任意 MCP Runtime 在每次 `tools/call` 的 `_meta.threadId`、`_meta.sessionId` 或 `_meta["molis-work/sessionId"]` 中提供 Session ID，也支持 Claude Code 等 adapter 的稳定环境信号；普通工具参数不会被当成宿主身份。同一个长驻 MCP 进程收到不同 Session ID 时会清掉前一个 Session 的连接。没有 Session ID 时，Molis Work 仍可把 canonical workspace 用于查找历史候选，但绝不把目录或 MCP 进程伪装成 Session。一个 workspace 可关联多个 `project_id`；普通选择不自动设默认。

安装本身不会写入 Runtime 配置。Codex 和 Claude Code 应由用户在接入预览中确认后使用稳定 launcher；其他 Runtime host 可以显式提供同一组环境值：

```bash
MOLIS_WORK_HOME="$HOME/.molis-work" \
MOLIS_WORK_RUNTIME_ID="<runtime-id>" \
MOLIS_WORK_WORK_CONTEXT_ID="<宿主提供的稳定工作入口 ID>" \
MOLIS_WORK_WORK_CONTEXT_STABLE="true" \
MOLIS_WORK_WEB_URL="http://127.0.0.1:4173" \
MOLIS_WORK_MCP_AUDIENCE="runtime" \
"$HOME/.molis-work/bin/molis-work-mcp"
```

这个 MCP 进程启动时仍是“未连接项目”状态，不会打开某个 Board。统一 Skill 先调用 `molis_work_v1_context_resolve`：

> **宿主身份**：Molis Work 优先读取单次调用 `_meta["molis-work/sessionId"]`、`_meta.threadId`、`_meta.sessionId`，再沿用宿主启动时提供的身份。是否提供这些字段由 Runtime host 决定；不能假设所有版本都会提供。没有 Session 信号时，唯一已验证 workspace membership 仍可只读恢复；其他情况按返回的候选/未绑定状态处理。

- `bound`：返回唯一项目与固定连接。后续普通调用省略 `board_id` 和操作者字段，由Host从该连接与Session注入；记录某个Goal时仍明确传 `goal_id`。
- `suggested`：新 Session 有 workspace 历史或其他宿主线索。结果只含候选项目和不泄露原始路径的通用原因，没有项目连接。若当前用户消息已经明确要求用 Molis Work 连接或推进一个已命名项目，且返回的现有项目中只有一个无歧义匹配，Skill 直接调用 `context_bind`；否则才展示候选并询问。
- `unbound`：返回 `missing_stable_context` 或 `unknown_context`，不连接任何项目；同样先复用当前消息中对一个现有项目的明确选择，否则展示项目列表并询问选择或新建。
- 用户明确拒绝某个 `suggested` 候选时，Skill 调用 `molis_work_v1_context_reject_suggestion` 并传入 `user_confirmed=true`。它只在这个 Session 不再提示该候选，随后可返回另一个候选或显式的项目列表／新建路径；不会解绑、删除或影响其他 Session。
- 用户明确选定已有项目后，Skill 调用 `molis_work_v1_context_bind`，传入 `user_confirmed=true`。有稳定 Session 时可使用 `binding_scope=session`；workspace 只记录关联，不保存目录默认。切换已绑定项目还需明确的切换授权与 `rebind_confirmed=true`。不要发送已移除的 `workspace_default`。
- 用户在当前对话明确要求新建一个命名项目后，Skill 调用 `molis_work_v1_context_create_and_bind` 并传入 `user_confirmed=true`、项目名称和幂等键。它只在 `~/.molis-work` 创建项目 DB 并绑定；失败不会留下孤儿项目。
- 用户要求查看项目时，Skill 调用 `molis_work_v1_context_list_projects`；它不暴露数据库路径，也不改变当前连接。
- 用户明确要求仅解绑当前工作入口时，Skill 调用 `molis_work_v1_context_unbind` 并传入 `user_confirmed=true`。它不删除项目、DB 或其他 Runtime 的绑定。
- 删除项目及其 DB 是另一项单独确认：用户明确点名项目并确认删除后，Skill 调用 `molis_work_v1_project_delete` 并传入 `delete_confirmed=true` 和幂等键。项目有有效 Claim 或未结束 Run 时会被拒绝；成功后返回删除收据，Runtime 不能继续使用旧连接。

Web 是可选查看和用户确认界面，不是连接项目或推进 Goal 的前置条件。浏览页面不会绑定 Runtime；项目设置管理 Session 关联与 workspace membership，不保存目录默认项目。项目创建、Runtime 配置、解除关联与删除仍各有自己的授权。

## 当前工具

工具名以下省略 `molis_work_v1_` 前缀；实际输入以当前MCP schema为准。

| 用途 | Runtime工具 |
| --- | --- |
| 项目连接 | `context_resolve`、`context_list_projects`、`context_reject_suggestion`、`context_bind`、`context_unbind`、`context_create_and_bind`、`project_delete` |
| 发现、创建与状态 | `goal_list`、`goal_intent_create`、`goal_state` |
| 普通记录与历史 | `event_note`、`event_configure`、`event_report`、`event_progress`、`event_list`、`event_read` |
| 约定、决定与收尾 | `event_concern`、`event_decision_request`、`event_cite_decision`、`event_agree`、`event_close`、`event_resume` |
| 结构提案 | `goal_tree_propose`、`goal_tree_read`、`goal_tree_check` |
| 按需规划 | `planning_methods`、`planning_method_save`、`planning_analyze_change`、`planning_graph_check` |
| 项目指导 | `project_guidance_get`、`project_guidance_add`、`project_guidance_update` |
| 回收站 | `goal_trash`、`goal_trash_list`、`goal_restore` |
| 判断函数 | `functions_list`、`functions_describe`、`functions_invoke` |

对外只有 `molis-work-mcp`。平台工具（连接 / Goals / 事件）的 schema 留在本包；插件用 Manifest `mcp_exports` 登记本地 `tool_id`、说明、输入 schema 和读或写。Host 盖正式名 `molis_work_v1_<plugin>_<tool>`，再按全局开关（`~/.molis-work/config/mcp-tools.json`）、audience、项目启用和 grant 合成清单。Functions 三项默认开；Pages / Forms / Dataset / PPT 已登记、默认关，且要已绑项目。关了的方法不出现在 `tools/list`，点名 `tools/call` 也会拒绝。开关在用户设置「MCP」页，与「AI 与执行工具」分开；已打开的连接不会因改开关热刷新。`agent.mcp` 是插件里的 Agent 能不能去调外部 MCP，不是对外贡献。

插件作者怎么登记、Host 改哪里，见 [Plugin 开发 · 对外 MCP](platform/PLUGIN-DEVELOPMENT.md#对外-mcp) 和 [CLI 与开发 · 对外 MCP](cli-and-development.md#对外-mcp)。

普通Runtime工具不接受 `board_id`、数据库路径、Web URL或 `actor_id` / `actor_kind` / `runtime_actor_id` 覆盖，即使值与当前连接相同也会拒绝。回收站同样使用有限顶层字段，不接受旧 `payload` 信封。项目选择工具与 `project_delete` 保留各自明确的项目选择和确认参数；这些确认不能被复用为约定或树变化的批准。

最短工作路径是 `goal_intent_create` → `event_note`，无需类型或规划。需要结构化结果时用 `event_configure` / `event_report`。报告可以含多个事实和进展，整批有效才保存，回执给出当前状态、差距和游标。`event_close` 显式收尾，只有 `completion_applied=true` 才表示完成成立；`event_resume` 用必填原因继续已完成或已取消的目标。普通笔记和与当前结论无关的报告不自动重开；有效反证可能使原完成结论退出当前生效，原始历史仍保留。

`event_decide` 和 `goal_tree_decide` 仅在受保护的用户Web/管理入口调用，不属于Runtime。Runtime可以提交具体变化、请求或引用已保存的有效决定，不能自填user身份、确认文本或Session字段批准自己。已有仍有效的同范围授权无需重复决定。

受信管理入口使用 `MOLIS_WORK_MCP_AUDIENCE=management`，额外保留 `initialize`、`import_v3`、`snapshot`、`event_decide`、`goal_tree_decide`、`active_goal`。管理调用遵循其显式项目和身份schema。不要把management MCP交给自主Runtime。V3导入保留原字段、关系、coverage和来源，导入后的Goal可立即使用当前状态与笔记；不合成验收承诺。

旧Claim/select/Run/Evidence/Review、draft dialogue、Contract/Candidate/Dependency/Rewire写工具，以及Available/Ready/Contract/Explain工作入口已退役；旧名字无法通过管理入口继续执行。历史记录仍可阅读，日常工作只使用当前事件路径。

服务不可用时报告失败，不切换数据库、改 URL 或使用 CLI 兜底。`mcp.context_refresh_required` 仅要求只读 resolve：返回 bound 后用原 idempotency_key 原样重试；未绑定则按项目选择流程处理。旧 reader 的版本错误与连接缓存刷新不同，按返回诊断恢复。完整协议见 [Runtime Skill](../skills/goal-advance/SKILL.md)。
