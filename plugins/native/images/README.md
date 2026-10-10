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

原验证见 `specs/archive/images-plugin/verification.md`，本次统一服务迁移见 `specs/action-architecture/migration.md`。受控 HTTP 厂商、标准 MCP 和浏览器测试验证真实传输、状态和图片字节；它们不等于付费厂商账号验收或用户本人验收。

## 开发要求

- 负责：个人图片生成、项目历史与已保存图片的预览。
- 不负责：文字模型提供方、自动重试、其他插件的实现。
- 公开入口：`@molis-ai/molis-work-plugin-images`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - API Key 由宿主 SecretStore 加密保存；列表、任务与下载不返回 Key。
  - 失败、超时或重启不自动再次调用；「停止等待」只停本机请求，不保证厂商停止计费。
  - 所选账号失效时保留选择并显示原因，不自动换账号；生成期间授权改变不保存过期结果。
  - 同一 Home 只有一个执行进程；另一个进程报 `images.runtime_unavailable` 并说明原因。
  - `images.jobs.start` 在目录里对助理、MCP、工作流和插件随服务状态可用：没有一条能用的生图服务（本机地址，或已选择且仍连着的服务连接）就标成不可用并写明原因，MCP 的工具列表里也就没有它；用户自己的页面不受影响，仍得到所选服务连接的具体原因。宿主 `ImagesHostService.startAvailability()` 在库文件 `images.db` 不存在时直接回答，问目录不会创建图片库；库文件一旦存在，每次问目录（助理、MCP、工作流、插件的发现）都会打开图片库，并逐条查已保存的服务连接，所以这个检查要保持只读、足够便宜。同一请求的重放在服务连接撤掉之后，对这些调用者也按不可用拒绝，不再返回原任务。
  - `images/runners/` 里每个进程的锁文件（`<uuid>.db` 与它的 `-journal`）不留孤儿：正常关闭时两个都没了（SQLite 关锁连接时删 journal，`releaseLocks` 删 `.db`）；启动时（`reclaimRunnerFiles`）扫整个目录，凡能加上独占锁的遗留文件连同 journal 一起清掉。别的进程持有的、30 秒内新建的（可能是还没加锁的新进程）和名字不是 `<uuid>.db` 的不动。
  - 项目被删除时清掉这个项目的任务记录和 `images/assets` 里的图片文件：无运行中的服务时按目录条目上的 `project_data`（`imagesProjectData`，`src/project-data.ts`：确认框里的标签与 `purgeImagesProject`），运行中的服务则用它的 `deleteProject`（先中止还在生成的任务，标签同一份）。
- 改动后必跑：`node scripts/run-tests.mjs tests/images-actions.test.ts tests/images-service.test.ts tests/images-providers.test.ts tests/images-concurrency.test.ts tests/images-mcp.test.ts tests/project-deletion-owners.test.ts tests/model-unavailable-declarations.test.ts`
- 相关手册：[docs/platform/PROLOGUE-AI.md](../../../docs/platform/PROLOGUE-AI.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

客户端资源由 Host 注入的 UI 生命周期管理：隐藏停止进度轮询，再次显示刷新；卸载取消本机请求并释放监听、定时器和观察器。服务端任务保持原有取消与恢复语义。

执行时限与持久取消监测复用 Plugin SDK 的执行生命周期；请求去重、进程锁、图片提交和重启后中断记录继续由 Images 拥有。监测失去执行资格后停止等待，不能把撤销或关闭改写成普通失败。
