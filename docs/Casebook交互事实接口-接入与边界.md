# Molis Work 与 Casebook

本接口复用 GoalBoard Casebook 协议，供服务端读取授权后的有限事实。产品更名不改变已有线协议的 contract_id、purpose 和摘要规则。操作 capability 使用真实的 io.molis.work 命名，消费者需同时识别旧、新前缀。

## 接入

在独立的 Molis Work home 下配置 config/casebook.json，文件权限必须为 0600。version 为 1；grants 为项目限定的服务凭证列表；catalogConnections 为成员限定的目录凭证（token、actor_ref）；proof 为独立的 secret 和 audience。凭证由部署负责人安全配置，不能复用浏览器 control token，不能放进前端。

默认不启用。目录连接只允许发现项目，不代表采集授权。Casebook 需经真实成员动作签名，逐项目加入。交互事实、目标背景、操作回执各有独立 purpose、epoch；暂停停止读取，移除清理该授权下的事实与衍生内容。不能把旧案例迁移当作新授权。

POST /casebook/v1/projects 返回项目目录；POST /casebook/v1/{project_ref}/ 后分别接 authorization、set-authorization、facts、goal-contexts、operation-receipts、diagnostics。只允许带服务 Bearer 的非浏览器请求，不接受 Origin。

项目由 Molis Work 自己的 Host 打开。Casebook 不接收数据库路径。恢复只允许现有且版本完整的项目，不新建、不代为迁移；缺少结构需由 Molis Work 正式打开并完成其自身升级。

## 能看见什么

授权后经共享 Host 的 Goal 事件操作、部分规划提案操作，以及 Web Goal 事件入口的操作尝试和结果。输出包括有限状态、引用、原因码、是否重放等；目标标题另需背景授权。原始对话、仓库内容、凭证和任意报错正文不导出。

这是有限覆盖，不代表所有 Molis Work 功能均已埋点；终端网络失败、用户是否看到提示、插件自有操作、Canvas 操作和未走上述入口的路径不会自动变成可观测摩擦。开发回放不等于自然使用质量验收。

## 工程验证

使用 pnpm 11.9.0，先 pnpm build，再 node --import tsx --test --test-concurrency=1 tests/casebook*.test.ts。所有用例使用临时项目。node scripts/build-casebook-client.mjs 可生成无存储依赖的客户端包；发布与真实部署另行进行。
