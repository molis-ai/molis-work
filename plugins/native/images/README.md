# 图片生成

Status: `partial`
Migration Goal: `goal-reorg-f2`
Contract: `@molis-ai/molis-work-contracts/platform/plugin`，记录结构见 `@molis-ai/molis-work-contracts/modules/images`。

在 Molis Work 项目中打开「图片」，添加生图服务并选择系统账号连接，填写提示词后点击生成。历史记录与图片保存在本机，可刷新后找回、预览和下载。生图协议、地址与模型由本插件管理，API Key 在系统服务连接中管理；已有密钥自动沿用原引用。

支持 OpenAI Images、Gemini generateContent 和兼容 OpenAI Images 的同步接口。可编辑 API 基址和模型名；基址应为 `/images/generations` 或 `/models/{model}:generateContent` 之前的部分。兼容接口的尺寸按该厂商文档填写，留空采用默认值；不承诺任意厂商协议兼容。API Key 由宿主 SecretStore 加密保存，列表、任务与图片下载不会返回 Key。

生成由明确提交的动作启动，费用由所连接的厂商收取。失败、超时或重启不会自动再次调用；「停止等待」仅停止本机请求，不保证厂商不继续生成或计费。重新使用提示词不立即生图。所选账号失效或服务被删除时保留原选择并显示原因，不自动换成其他账号或匿名本机请求。生成期间授权改变时不保存过期结果。

插件声明九项统一动作：`images.connections.list/save/delete`、`images.jobs.list/start/get/cancel/delete` 和 `images.images.read`。HTTP 仅转发到同一动作服务；标准 MCP 导出相同合同。配置操作遵守 Home 权限，任务和图片遵守项目权限；模型参数不能改变调用者的项目。启动返回持久任务，`request_id` 对相同输入去重；图片读取返回实际 Base64 字节、MIME 和文件名。

数据：`{home}/images/images.db` 与 `{home}/images/assets/`。任务按宿主项目隔离，配置属于本机。Web 和独立 MCP 进程共享原数据库、请求去重与并发上限；每个任务记录执行进程，关闭或崩溃只中断该进程负责的任务。跨进程取消会通知原执行者停止等待，打开或关闭管理页面不影响任务。当前基线 v2 含同步日志，旧库仅拒绝并保留，维护需要另行批准；禁止新旧执行器同时修改任务。

个人空间的 `saved_images` 集合由本包声明和实现，只传已保存终态的提示词、生成资料、结果与实际图片。运行中记录暂不上传，接收不调用厂商，不继承连接、请求幂等键、input hash 或 runner。图片经过共同 R2 内容通道，长度、编码及 MIME 与实际格式一致后才加入 owner 事务；文件名由目标 owner 生成，不接受网络路径或覆盖唯一本机文件。同步连接不取得生成运行锁、不恢复执行进程，停用的项目仍由 Host 拒绝接收。

此版不包含图生图、蒙版、多图批处理、异步厂商私有协议或 Artifact 发布。通用工作流配置、生产 MCP 客户端授权和完整插件生命周期仍属于系统动作服务的后续接线范围，不能以 Images 的业务测试代替全平台完成。

官方协议依据：[OpenAI](https://developers.openai.com/api/reference/resources/images/methods/generate)、[Gemini](https://ai.google.dev/api/generate-content)、[阿里兼容 API](https://www.alibabacloud.com/help/zh/model-studio/qwen-image-generation-and-editing-api-reference)。模型示例可编辑，账号可用性以实际厂商响应为准。

原验证见 `specs/archive/images-plugin/verification.md`，本次统一服务迁移见 `specs/action-architecture/migration.md`。受控 HTTP 厂商、标准 MCP 和浏览器测试验证真实传输、状态和图片字节；它们不等于付费厂商账号验收或用户本人验收。

## 项目复制

`openImagesCopyOwner` 只读打开既有本地库，复用当前图片格式和原件校验；目标使用新的记录及图片身份，保留完整字节和终态记录，不复制连接、密钥或 runner，不恢复生成。相同结果重试不重复写入，目标删除/修改后拒绝重建或覆盖，最终授权失败回滚 SQL 记录及同步队列。失败事务可能留下不被记录引用的不可变暂存文件，由原有有界清理处理。该端口不代表整项目用户入口已经接通。验证另跑 `tests/security-invariants-images-copy.test.ts`。

## 开发要求

项目变更观察由 owner 解码稳定日志键，覆盖已删除记录、冻结上传与保留冲突，未启用上传也不能冒充无本机修改；`hasProjectChanges` 不读取或导出正文，不跨其他 owner 查询。

- 负责：个人图片生成、项目历史与已保存图片的预览。
- 不负责：文字模型提供方、自动重试、其他插件的实现。
- 公开入口：`@molis-ai/molis-work-plugin-images`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 服务框内的 Connectors 链接先关闭原生模态框，让设置接收点击与键盘；返回时保留服务字段，打开服务框主动刷新账号，失败留在框内并可重新打开重试。返回生成历史清空本页声明的当前任务，不取消已接受的服务端任务。
  - API Key 由宿主 SecretStore 加密保存；列表、任务与下载不返回 Key。
  - 失败、超时或重启不自动再次调用；「停止等待」只停本机请求，不保证厂商停止计费。
  - 所选账号失效时保留选择并显示原因，不自动换账号；生成期间授权改变不保存过期结果。
  - 同一 Home 只有一个执行进程；另一个进程报 `images.runtime_unavailable` 并说明原因。
  - `images.jobs.start` 在目录里对助理、MCP、工作流和插件随服务状态可用：没有一条能用的生图服务（本机地址，或已选择且仍连着的服务连接）就标成不可用并写明原因，MCP 的工具列表里也就没有它；用户自己的页面不受影响，仍得到所选服务连接的具体原因。宿主 `ImagesHostService.startAvailability()` 在库文件 `images.db` 不存在时直接回答，问目录不会创建图片库；库文件一旦存在，第一次问目录（助理、MCP、工作流、插件的发现）就会打开图片库，并让图片服务一直开着（打开时取运行锁、收尾被中断的任务、清理遗留文件，这几步会写库）；之后每次问目录复用这个已打开的服务，只逐条查已保存的服务连接（每条一次服务连接库的读取），所以这个检查本身不能写数据，要足够便宜。同一请求的重放在服务连接撤掉之后，对这些调用者也按不可用拒绝，不再返回原任务。
  - `images/runners/` 里每个进程的锁文件（`<uuid>.db` 与它的 `-journal`）不留孤儿：正常关闭时两个都没了（SQLite 关锁连接时删 journal，`releaseLocks` 删 `.db`）；启动时（`reclaimRunnerFiles`）扫整个目录，凡能加上独占锁的遗留文件连同 journal 一起清掉。别的进程持有的、30 秒内新建的（可能是还没加锁的新进程）和名字不是 `<uuid>.db` 的不动。
  - 项目被删除时清掉这个项目的任务记录和 `images/assets` 里的图片文件：无运行中的服务时按目录条目上的 `project_data`（`imagesProjectData`，`src/project-data.ts`：确认框里的标签与 `purgeImagesProject`），运行中的服务则用它的 `deleteProject`（先中止还在生成的任务，标签同一份）。
  - 失败都是 `ActionError`：码是 `images.<原因>`（`imagesErrors`）；状态只由 kind 推出，没有错误类和状态表。入口（`apps/local-host/src/images-native-plugin-http.ts`）自己写图片字节，不走分发器，请求体用共用的 `readNativePluginJsonBody` 读，出错写 SDK 的 `actionErrorResponse`；没有我们格式的码的失败只回一句通用话（`images.internal`，500），不带它自己的文字。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-plugin-images run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/images-actions.test.ts tests/images-service.test.ts tests/images-providers.test.ts tests/images-concurrency.test.ts tests/images-mcp.test.ts tests/project-deletion-owners.test.ts tests/model-unavailable-declarations.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts`
- 首次连接与可见对象定向回归（需要本机 Chrome）：`node scripts/run-tests.mjs tests/content-context-regressions.e2e.test.ts tests/images-actions.e2e.test.ts`（使用受控本机 provider，不调用真实厂商）。
- 相关手册：[docs/platform/PROLOGUE-AI.md](../../../docs/platform/PROLOGUE-AI.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

客户端资源由 Host 注入的 UI 生命周期管理：隐藏停止进度轮询，再次显示刷新；卸载取消本机请求并释放监听、定时器和观察器。服务端任务保持原有取消与恢复语义。

执行时限与持久取消监测复用 Plugin SDK 的执行生命周期；请求去重、进程锁、图片提交和重启后中断记录继续由 Images 拥有。监测失去执行资格后停止等待，不能把撤销或关闭改写成普通失败。

个人空间删除任务时，在同一数据库事务先保存完整可携带记录与图片字节，再删除任务；从未上传的唯一图片也可在原版本和空内容前提下离线撤销。旧且无任何当前任务引用的 owner 图片按数据库写锁有界回收（每次至多 20 个，至少 24 小时）；本机保留快照自包含原字节。新文件、共享引用、链接和未知文件名不清理；不依据设备时间丢弃唯一保留原件。
