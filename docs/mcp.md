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

- `bound`：返回唯一项目与固定连接。后续普通调用省略 `project_id` 和操作者字段，由Host从该连接与Session注入；记录某个Goal时仍明确传 `goal_id`。
- `suggested`：新 Session 有 workspace 历史或其他宿主线索。结果只含候选项目和不泄露原始路径的通用原因，没有项目连接。若当前用户消息已经明确要求用 Molis Work 连接或推进一个已命名项目，且返回的现有项目中只有一个无歧义匹配，Skill 直接调用 `context_bind`；否则才展示候选并询问。
- `unbound`：返回 `missing_stable_context` 或 `unknown_context`，不连接任何项目；同样先复用当前消息中对一个现有项目的明确选择，否则展示项目列表并询问选择或新建。
- 用户明确拒绝某个 `suggested` 候选时，Skill 调用 `molis_work_v1_context_reject_suggestion` 并传入 `user_confirmed=true`。它只在这个 Session 不再提示该候选，随后可返回另一个候选或显式的项目列表／新建路径；不会解绑、删除或影响其他 Session。
- 用户明确选定已有项目后，Skill 调用 `molis_work_v1_context_bind`，传入 `user_confirmed=true`。有稳定 Session 时可使用 `binding_scope=session`；workspace 只记录关联，不保存目录默认。切换已绑定项目还需明确的切换授权与 `rebind_confirmed=true`。不要发送已移除的 `workspace_default`。
- 用户在当前对话明确要求新建一个命名项目后，Skill 调用 `molis_work_v1_context_create_and_bind` 并传入 `user_confirmed=true`、项目名称和幂等键。它只在 `~/.molis-work` 创建项目 DB 并绑定；失败不会留下孤儿项目。
- 用户要求查看项目时，Skill 调用 `molis_work_v1_context_list_projects`；它不暴露数据库路径，也不改变当前连接。
- 用户明确要求仅解绑当前工作入口时，Skill 调用 `molis_work_v1_context_unbind` 并传入 `user_confirmed=true`。它不删除项目、DB 或其他 Runtime 的绑定。
- 删除项目及其 DB 是另一项单独确认：用户明确点名项目并确认删除后，Skill 调用 `molis_work_v1_project_delete` 并传入 `delete_confirmed=true` 和幂等键。成功后返回删除收据（含各插件数据所有者的清理步骤，未完成的步骤用同一个幂等键重试），Runtime 不能继续使用旧连接。各插件为这个项目保存的数据（文稿、问卷与回答、待办、记忆、助理工作等）一并删除。Molis Work 正在运行时，stdio MCP 把删除交给它执行（项目的终端和运行环境都在它那里）：项目里还有正在运行的终端时拒绝（`catalog.project_terminal_live`，请用户先关闭终端，再用同一个幂等键重试），否则它先释放项目的运行环境再删除，记忆一步也由它当场完成。Molis Work 没有运行时，MCP 进程自己删除（此时没有终端可检查）：记忆放在 Agent 执行服务里，MCP 进程不运行它，所以 Home 里有 Agent 运行环境时这一步留在收据里（pending），由之后运行的 Molis Work 接着清理（它启动时和运行中每分钟做一次），收据完成之前不能把它当作已经删净；Molis Work 没有运行时，用同一个幂等键重试也只会得到同样的 pending。

Web 是可选查看和用户确认界面，不是连接项目或推进 Goal 的前置条件。浏览页面不会绑定 Runtime；项目设置管理 Session 关联与 workspace membership，不保存目录默认项目。项目创建、Runtime 配置、解除关联与删除仍各有自己的授权。

## 当前工具

`molis-work-mcp` 只有两类工具：

- **连接工具**（平台工具，名称以 `molis_work_v1_` 开头）：`context_resolve`、`context_list_projects`、`context_reject_suggestion`、`context_bind`、`context_unbind`、`context_create_and_bind`、`project_delete`。连接工具不收 `actor_id`：宿主记录这次调用的 MCP 客户端与 Runtime 会话（`runtime:<runtime_id>:<会话>`；宿主没有声明稳定会话时只记 `runtime:<runtime_id>`），参数里带了身份字段会被 `mcp.unexpected_field` 拒绝，什么也不写。
- **动作工具**：系统同一能力注册表里的每个动作，名称是 `molis_work_v1_action_<动作>__v<版本>`，例如 `molis_work_v1_action_goals.list__v1`。Goals、判断规则和各插件的能力都只经这一种方式对外。

动作工具只在用户为这个客户端、这个范围（全局或某个项目）逐项授权后出现。在「能力 → 对外接入」选择客户端和范围，可按名称或来源搜索、查看所需权限并逐项授权或撤销。授权准确绑定能力版本与提供方；发现和每次实际执行都检查最新授权，撤销后原连接的下一次调用也会被拒绝；客户端自己的工具列表可能需要刷新。项目绑定本身不授予任何动作。 在途搜索与已受理后台任务保留这次受理时的原精确授权代次；撤销后同值重新授权只对新受理调用生效，无关授权编辑和幂等保存不会打断合法调用。授权配置现为 v3，旧 v2 由统一离线维护窗口处理，运行时拒绝并保留原件。

`goals.events.list`、`goals.events.latest`、`goals.events.read` 当前为 @2（MCP 工具名分别以 `__v2` 结尾），输出包含 `input_acknowledged` 系统记录。@1 已不再登记；固定的工作流程引用和外部客户端授权需重新选择 @2，刷新工具目录。`goals.events.acknowledge` 仍是 @1。

常用的 Goals 动作：

| 用途 | 动作 |
| --- | --- |
| 发现、创建与状态 | `goals.list`、`goals.create`、`goals.state.read` |
| 普通记录与历史 | `goals.note`、`goals.events.configure`、`goals.events.report`、`goals.progress.record`、`goals.events.acknowledge`（读到本人的笔记、要求或决定后说明怎么处理；只给 MCP 与助理、Agent）、`goals.events.list`、`goals.events.read` |
| 约定、决定与收尾 | `goals.concerns.apply`、`goals.decisions.request`、`goals.decisions.cite`、`goals.agreement.set`、`goals.closure.submit`、`goals.work.resume` |
| 结构提案 | `goals.tree.submit`、`goals.tree.read`、`goals.tree.check` |
| 按需规划 | `goals.planning.catalog`（不含正文的目录）、`goals.planning.read`（可按 `method_ids` 读正文）、`goals.planning.save`、`goals.planning.impact`、`goals.planning.graph.check` |
| 项目指导 | `goals.guidance.read`、`goals.guidance.add`、`goals.guidance.update` |
| 回收站 | `goals.trash.set`（`trashed` 为真移入、为假恢复）、`goals.trash.list` |

已精确授权的动作暂不可用时，`tools/list` 隐藏它；调用原工具名仍交给 Host 判断，返回同一原因和稳定错误码（例如 `actions.plugin_disabled`），并在这次操作留行时附可查询的诊断编号。未知、未授权、撤权或 provider/version 不匹配的名字仍在 MCP 入口拒绝，不恢复管理工具权限。

AI来源修改已有对象时，提交动作schema声明的读取版本（`expected_version`、`expected_revision`、`expected_revisions`、`expected_updated_at`，Functions authoring用`updated_at`）。缺版本或版本表未覆盖全部`ids`时返回`actions.version_required`，原事实不变；先重新读取再由当前意图决定提交。实际schema允许的`expected_revision: null`仍表示create-if-absent，陈旧版本由owner拒绝。

动作的输入只含业务字段：项目、操作者和创建渠道由宿主从连接与会话注入，不接受 `project_id`、数据库路径、Web URL、`actor_id` / `actor_kind` / `runtime_actor_id`、`source_kind`。Runtime 写入时，宿主用会话身份生成审计作者（`runtime:<runtime_id>:<会话>`），没有稳定会话身份时写入被拒绝。

最短工作路径是 `goals.create` → `goals.note`，无需类型或规划。需要结构化结果时用 `goals.events.configure` / `goals.events.report`。报告可以含多个事实和进展，整批有效才保存，回执给出当前状态、差距和游标。

用户的决定只在受保护的 Web 界面或受信管理入口写入，不属于 Runtime。Runtime 可以提交具体变化、请求或引用已保存的有效决定，不能自填用户身份、确认文本或会话字段批准自己。受信管理入口使用 `MOLIS_WORK_MCP_AUDIENCE=management`，额外有平台工具 `initialize`、`event_decide`、`goal_tree_decide`；身份由宿主定为本机这个人（`web-user`），这三个工具的参数里没有身份字段：`event_decide` 带了 `actor_id`、`actor_kind`、`audit_actor_id` 或 `runtime_actor_id` 被拒绝（`mcp.unexpected_field`），`goal_tree_decide` 同样被拒绝（`actions.input_invalid`），`event_decide` 本身不带 `authority`，决定指向管理入口自身，宿主记本机这个人（出处 management）；`goal_tree_decide` 的 `authority` 只写对话出处 `conversation_ref`、`message_ref`（以及整组确认），在 `authority` 里带身份或出处（`actor_id`、`actor_kind`、`authority_source`）被拒绝（`goals.goal_tree_proposal.authority_source_invalid`）；`initialize` 只取 `project_id`、`title`、`idempotency_key`，其余参数不读、不当作身份，也不报错。三个管理业务各调用一个 Goals 动作，身份与单一动作权限由 Host 的私有管理工厂提供。传输未知字段、身份和 authority 的前置拒绝可无动作行、无编号；进入动作后的调用只结算一次，留行才带 Host 编号，客户端自带的编号不读。工具名、schema、成功 JSON 和原出处规则不变。这三个工具指向项目库时必须给出路径：参数 `database_path`，或环境变量 `MOLIS_WORK_DATABASE`；两者都没有就报 `mcp.path_required`，没有按当前目录猜的默认路径。

服务不可用时报告失败，不切换数据库、改 URL 或使用 CLI 兜底。`mcp.context_refresh_required` 仅要求只读 `context_resolve`：返回 bound 后用原 idempotency_key 原样重试；未绑定则按项目选择流程处理。

插件不另外登记 MCP 工具：插件在 Manifest 里声明的动作就是它对外的能力，见 [Plugin 开发](platform/PLUGIN-DEVELOPMENT.md)。

## 出错时的诊断编号

每条 `tools/call` 是一次操作，Molis Work 给它一个编号（`call_id`，界面上叫「诊断编号」）：这次操作引起的所有调用在调用记录里共用它。编号只由 Molis Work 给，不读工具参数、`_meta` 或请求里自带的值；它不是身份，不授予任何权限。

- 失败时，错误文本末尾的 JSON 里有 `call_id`，例如 `{"code":"actions.input_invalid","call_id":"…"}`；留了调用记录的命令成功时，结果的 `_meta["molis-work/callId"]` 有它。
- 只有这次操作在调用记录里留了行才给编号：命令（成功或失败）、处理器之前就被拒绝的调用（记为「未执行」）、失败的读取。读取成功不留行，什么都不带；还没走到动作的失败（例如工具未授权、`mcp.tool_unknown`、常驻服务不在）也没有编号。
- 向用户报告失败时把编号（至少前 6 位）和错误码一起带上，用户和维护者据此在 Molis Work 的调用记录里找到这次操作的每一步（界面上按编号查找随后续版本）。
- 常驻服务和 `molis-work-mcp` 进程要是同一个版本：旧版本的 MCP 进程调用动作时不带编号，会被新版常驻服务以 `actions.input_invalid` 拒绝，重启 MCP 进程即可。

错误响应的 text 是一份 JSON `{ error, code, details?, call_id? }`，标准动作、上下文与管理工具共用现行格式。旧的文本前缀/末行 JSON 与 message 字段已退役；owner 的 current_version、fields、recovery 等保留在 details，code 与真实已记录的 call_id 由出口给出。没有调用记录就没有编号。

Goals 事件拒绝的现行 code 使用 goals.<原前缀>.<原因>，例如 goals.event_config.version_conflict、goals.event_progress.stale_goal、goals.event_http.unexpected_field。消息、kind 与 details 保持原含义；不读取或返回旧前缀。

规划 issue.code 的现行 enum 为 goals.planning.*；包含该输出的 goals.planning.impact、goals.planning.graph.check、goals.tree.check、goals.tree.decide 均为版本2。MCP树检查名为 molis_work_v1_action_goals.tree.check__v2；发现与授权应固定当前版本，旧工具名不再提供。semantic_review.review_action固定goals.planning.impact@2。
