# 图片生成

Status: `partial`
Migration Goal: `goal-reorg-f2`
Contract: `@molis-ai/molis-work-contracts/platform/plugin`，记录结构见 `@molis-ai/molis-work-contracts/modules/images`。

在 Molis Work 项目中打开「图片」，添加生图服务并选择系统账号连接，填写提示词后点击生成。历史记录与图片保存在本机，可刷新后找回、预览和下载。生图协议、地址与模型由本插件管理，API Key 在系统服务连接中管理；已有密钥自动沿用原引用。

支持 OpenAI Images、Gemini generateContent 和兼容 OpenAI Images 的同步接口。可编辑 API 基址和模型名；基址应为 `/images/generations` 或 `/models/{model}:generateContent` 之前的部分。兼容接口的尺寸按该厂商文档填写，留空采用默认值；不承诺任意厂商协议兼容。API Key 由宿主 SecretStore 加密保存，列表、任务与图片下载不会返回 Key。

生成由明确提交的动作启动，费用由所连接的厂商收取。失败、超时或重启不会自动再次调用；「停止等待」仅停止本机请求，不保证厂商不继续生成或计费。重新使用提示词不立即生图。所选账号失效或服务被删除时保留原选择并显示原因，不自动换成其他账号或匿名本机请求。生成期间授权改变时不保存过期结果。

插件声明九项统一动作：`images.connections.list/save/delete`、`images.jobs.list/start/get/cancel/delete` 和 `images.images.read`。HTTP 仅转发到同一动作服务；标准 MCP 导出相同合同。配置操作遵守 Home 权限，任务和图片遵守项目权限；模型参数不能改变调用者的项目。启动返回持久任务，`request_id` 对相同输入去重；图片读取返回实际 Base64 字节、MIME 和文件名。

数据：`{home}/images/images.db` 与 `{home}/images/assets/`。任务按宿主项目隔离，配置属于本机。Web 和独立 MCP 进程共享原数据库、请求去重与并发上限；每个任务记录执行进程，关闭或崩溃只中断该进程负责的任务。跨进程取消会通知原执行者停止等待，打开或关闭管理页面不影响任务。升级时保留原数据并补充内部 runner 身份；运行中的旧版本独占服务需要先关闭，禁止新旧执行器同时修改任务。

此版不包含图生图、蒙版、多图批处理、异步厂商私有协议或 Artifact 发布。通用工作流配置、生产 MCP 客户端授权和完整插件生命周期仍属于系统动作服务的后续接线范围，不能以 Images 的业务测试代替全平台完成。

官方协议依据：[OpenAI](https://developers.openai.com/api/reference/resources/images/methods/generate)、[Gemini](https://ai.google.dev/api/generate-content)、[阿里兼容 API](https://www.alibabacloud.com/help/zh/model-studio/qwen-image-generation-and-editing-api-reference)。模型示例可编辑，账号可用性以实际厂商响应为准。

原验证见 `specs/images-plugin/verification.md`，本次统一服务迁移见 `specs/action-architecture/migration.md`。受控 HTTP 厂商、标准 MCP 和浏览器测试验证真实传输、状态和图片字节；它们不等于付费厂商账号验收或用户本人验收。
