# Actions

系统级动作服务让插件、系统判断、工作流和 MCP 使用同一套能力定义与执行入口。查询、判断和操作都可以注册；业务实现、数据和已有后台任务仍由原插件或服务持有。

当前实现：

- [平台合同](../../packages/contracts/src/platform/actions.ts)：稳定能力引用、输入输出、调用者上下文、消费场景和绑定。
- [Kernel](../../packages/kernel/src/action-service.ts)：注册、合同校验、发现、依赖检查、执行及场景消费。
- [Local Host](../../apps/local-host/src/local-host.ts)：项目隔离、生命周期、队列和实时可用性。原 typed capability 与动作使用同一注册表。
- [SDK](../../packages/plugin-sdk/README.md#动作与判断消费场景)：插件贡献定义和实际处理器；声明不会自动产生授权。
- [MCP 适配](../../apps/mcp/src/action-tools.ts)：从共同目录生成工具，传输层绑定可信身份，业务参数不携带授权。

生产 MCP 的新动作入口读取原 `config/mcp-tools.json` 中的 `action_grants`。授权固定客户端、项目或 Home、能力版本和提供方，并保留接受的权限集合。新版本、替换提供方或权限变化需要重新授权；目录和执行读取当前配置，排队后的实际分发也重新检查。旧工具开关保持兼容，尚未迁移的旧工具仍沿用原权限流程，不能把新授权机制视为所有旧入口已经收敛。

本机管理接口 `GET/POST /api/settings/mcp/actions` 由 Web 的原有同源和控制令牌规则保护；权限从当前注册定义取得，不能由请求自填。接口可检查目录、保存或撤销准确授权；提供方消失后仍保留并允许撤销原记录。只读检查不授予执行权限，也不放进插件 ActionClient。

受保护的用户操作可以要求独立权限和 Host 注入的 `ActionCallContext.user_action` 出处。会话/消息引用本身不授予权限，不接受业务参数或 MCP 请求自填；Host 在排队时保留调用者与出处快照。例如 `goals.decisions.record` 只允许 user audience 和 `goals:decide`，普通模型仍只能请求或引用决定。旧 typed 用户决定适配声明 `host_only`；Plugin SDK 在检查和调用时固定传递 plugin 消费者限制，Host 按已注册定义拒绝，插件不能通过 Manifest 或伪造描述把此入口变成可消费能力。

持续任务继续复用 Images、Alchemist 等业务 owner 的原记录。平台不另造任务表来复制其状态，也不将每次轻量调用升级为 Goal。[历史模块合同](../../packages/contracts/src/modules/actions.ts) 的声明不等于已有实现；不要据此再创建第二套动作执行服务。

当前为迁移中，未达到整体内部完整。授权界面、旧 MCP/平台工具统一授权、MCP Client 接入、全部存量插件、通用工作流及调用记录仍有未完成项。唯一范围和验证记录见 [架构规格](../../specs/action-architecture/spec.md) 与 [迁移清单](../../specs/action-architecture/migration.md)。
