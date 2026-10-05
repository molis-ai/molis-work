# 能力：读、写、不可撤销

平台里所有能力（系统能力、每个已安装插件对外提供的动作、以后接入的 MCP 与连接器）只有一个目录：统一动作服务（`ActionService`）。不要为插件另建能力表或工具清单。

## 每个动作说清三件事

| 字段 | 意思 |
|---|---|
| `audiences` | 谁能看见并调用：`user`、`agent`、`workflow`、`mcp`、`plugin` |
| `effect` | 调用它对世界做了什么：`read`（只读）、`write`（改了能改回来）、`irreversible`（不能撤销） |
| `plugin: false` | 即使给了 agent，也不给生成插件 |

未写 `effect` 时按规则推断：query / navigation 是读；能力 id 里有 delete、trash、purge、destroy、erase、wipe、reset、uninstall、remove 这类动词段的是不可撤销；其余是写。名字像删除但其实可撤销（例如移除一个标签、删除前的预览、移入可恢复的回收站）就明写：`withActionEffect(definition, "write")`；原本靠误判挡在生成插件之外的，同时写 `plugin: false` 保持不开放。

**给生成插件的规则**：带 `agent` 受众的动作自动对 `plugin` 受众开放，除非它不可撤销或写了 `plugin: false`。不可撤销的动作永远不给插件。

## 写官方插件时

- 新动作注册进共同目录，UI、编排、Agent、MCP 共用同一个处理器（见 [host.md](host.md)）。
- 会改数据的动作写清 `effect`；不希望被自动化调用的写 `plugin: false`，或不给 `agent`。
- 输入输出 schema 写完整：生成插件、Agent、MCP 都按它调用和校验，缺字段就等于没法被别人用。
- 可信身份（actor、项目、安装）从上下文来，不从输入里读。
- 写入要算在某个 Runtime 会话名下的，声明 `authorship: "session"`：经 MCP 调用必须带稳定会话，作者从 `caller.audit_actor_id` 读。
- 处理器里等模型或外部服务的，声明 `scheduling: "concurrent"`，并在返回后 `await caller.beforeEffect()`、按读取时的版本提交。
- 结果回显已存历史的，schema 接受历史上出现过的取值（读取兼容），新写入仍按严格合同校验。结果不合合同时，查询报 `actions.output_invalid`；写动作此时已提交，报 `actions.output_invalid_after_effect`，调用方刷新而不重试。

## 生成插件用能力时

- 只能用能力板上列出的、并且安装时用户授权过的能力。读类随安装一并授予；写类在安装清单里逐项列出；不可撤销的不会出现。
- 目录里标着"还没启用"的插件也可以用：开工前平台会请用户确认启用；用户不启用，就把"不要用它"作为修改意见交回主线设计。已启用的插件能做到的，优先用已启用的。
- 试用和验收时，写入别处的动作一律由替身代答（按输出 schema 生成合法结果），不碰真实数据；装好之后才调用真的。所以例子和验收只检查结构或插件自己保存的内容，不检查别处的真实结果。
- 读取平台能力的操作，例子不承诺精确结果（替身答的是示例数据），用部分匹配。替身按输出 schema 生成：列表里有一条示例记录，文字字段是「示例」，数字取最小值，枚举取第一个。
- 需要付费或有配额的能力（例如调用模型）只放在由用户点击触发的操作里，不放在打开页面就会自动运行的查询里。

## 调用身份与限额

生成插件调用时，身份是它自己（`plugin:<插件 id>`），历史里显示为"插件「名称」"；每次调用前宿主都会重查安装是否仍有效、授权是否被撤回。调用有次数和时长上限，调用模型另有每分钟上限。

生成插件的公开操作从已发布 `contract.operations` 自动登记，不另写 MCP/Action 清单。Host 在发现和调用前，根据 operation 的 effects 与当前实际依赖刷新公共 `execution.cost`，包括经其他生成插件间接调用的费用；未知网络/依赖和无法解析的循环不能写成免费。费用声明不代表实际用量，也不授予执行权限。沙箱排队、安装级频率与公共 Action 的调用者级限额语义不同，不直接互抄。旧动作 provider/version 与安装 Manifest 指纹保留，升级到新版本仍需要相应的外部授权。
# 有界模型调用与取消

插件模型能力按 [Prologue AI Skill](../molis-prologue-ai/SKILL.md) 接入。业务只拿 Host 注入的函数端口；需结构、进度与回执时由 Host 使用 `hostTextGeneration`。Coding 的短草稿与 Cognia 的知识生成都复用 Home Runtime，不能复制测试中创建 adapter 的做法到按钮处理器。

调用 Host Capability 时可传 `{ signal, before_effect }` 收紧本次执行。Plugin SDK 保留取消信号，Host 在 invocation 暴露它并持续核对原身份；这些选项不允许覆盖 plugin_caller。异步结果返回后仍须业务版本与提交检查。过程进度不等于已验证结果，未知用量不等于零。

长任务的进程内取消、时限和周期性所有权检查使用 Plugin SDK `createExecutionLifetime`；同步 `monitor.check()` 抛错会取消该次执行。外部等待传其 signal，返回后 `assertActive()` 再进入业务事务/CAS，并在 finally dispose。它不授予执行权限，不替代 beforeEffect，不拥有持久状态或重试策略。Alchemist 的续租和 Images 的取消监测是实际示例；业务取消、关闭、失租不得写成普通失败，结果未知的收费调用不得自动重放。


### 让动作结果可以直接读懂

动作可声明 `action.result_view`，与动作定义放在同一处：`summary` 为准确的业务结果说明，`title_pointer`、`text_pointer` 从原输出的 JSON Pointer 读取标题/正文；`link: { label, href_template }` 指向本站原对象页面。模板仅替换 `{project_id}` 和 `{/输出/字段}`，替换值逐个 URL 编码。完整例子及长结果、历史、缺字段行为见 [公开 SDK](../../packages/plugin-sdk/README.md#展示动作结果)。不要更改业务返回值来迎合 UI，也不要在 Host 按插件 ID 分支生成摘要。
