# 图片生成

Status: `partial`
Migration Goal: `goal-reorg-f2`
Contract: `@molis-ai/molis-work-contracts/platform/plugin`，记录结构见 `@molis-ai/molis-work-contracts/modules/images`。

在 Molis Work 项目中打开「图片」，添加生图服务并选择系统账号连接，填写提示词后点击生成。历史记录与图片保存在本机，可刷新后找回、预览和下载。生图协议、地址与模型由本插件管理，API Key 在系统服务连接中管理；已有密钥自动沿用原引用。

支持 OpenAI Images、Gemini generateContent 和兼容 OpenAI Images 的同步接口。可编辑 API 基址和模型名；基址应为 `/images/generations` 或 `/models/{model}:generateContent` 之前的部分。兼容接口的尺寸按该厂商文档填写，留空采用默认值；不承诺任意厂商协议兼容。API Key 由宿主 SecretStore 加密保存，列表、任务与图片下载不会返回 Key。

生成由明确提交的动作启动，费用由所连接的厂商收取。失败、超时或重启不会自动再次调用；「停止等待」仅停止本机请求，不保证厂商不继续生成或计费。重新使用提示词不立即生图。所选账号失效或服务被删除时保留原选择并显示原因，不自动换成其他账号或匿名本机请求。生成期间授权改变时不保存过期结果。

连接列表 `images.connections.list@2` 的账号记录带 `enabled`，停用保留已选账号与凭据但拒绝生成；重新启用后沿用同一引用。调用方从共同目录取当前版本，旧版精确引用须重选。

生成动作 `images.jobs.start@3` 使用 Runtime 并发后台受理并要求 `model:invoke` 与 `images:files:write`；删除动作 `images.jobs.delete@2` 要求 `images:delete` 与 `images:files:write`。输入输出保持，旧固定版本须重新选择，MCP 当前工具为 `images.jobs.start__v3`、`images.jobs.delete__v2`。已授权给 MCP 客户端、工作流步骤的调用方要补授 `images:files:write`（内置安装默认同意）。

插件声明统一动作：`images.connections.list/save/delete`、`images.jobs.list/start/get/cancel/delete` 和 `images.images.read`。HTTP 仅转发到同一动作服务；标准 MCP 导出相同合同。配置操作遵守 Home 权限，任务和图片遵守项目权限；模型参数不能改变调用者的项目。启动返回持久任务，`request_id` 对相同输入去重；图片读取返回实际 Base64 字节、MIME 和文件名。

数据：`{home}/images/images.db` 与 `{home}/images/assets/`。一个 Home Runtime 实例拥有配置与任务，Web、MCP 通过同一个动作服务调用；原表结构保持版本 1。数据库、文件和生图由宿主注入的有限服务提供，插件不持有 Home 路径或凭据解析器；文件声明在 Manifest 的 `owner_files`（`IMAGES_OWNER_FILES`：根 `images`，顶层目录 `assets`，读 `images:read`、写 `images:files:write`，根与自己的库同在），动作之内由动作和原调用者的权限决定。启动前由 Runtime 检查安装当前的必需授权（`storage:private` 与 `images:files:write`）。任务在后台保留原调用者的可撤销授权，普通请求断开不取消已受理任务；撤权、停用和项目删除后不写晚到结果或失败记录。停止不写业务状态。

每次获准启动都先按 `storage:private` 授权，把数据库中遗留的 `running` 标为 `interrupted`，不依赖可选的 `images:read`，不重新调用厂商。随后单独回收所有项目均未引用的图片文件，还需当前安装的 `images:read` 授权，并保留文件写权限和启动生命周期的检查；缺少读取授权时仍可启动，未引用文件留到下次具备所需授权的启动再清理。

此版不包含图生图、蒙版、多图批处理、异步厂商私有协议或 Artifact 发布。完整产品验收仍须覆盖真实 Host、MCP 和浏览器路径。

官方协议依据：[OpenAI](https://developers.openai.com/api/reference/resources/images/methods/generate)、[Gemini](https://ai.google.dev/api/generate-content)、[阿里兼容 API](https://www.alibabacloud.com/help/zh/model-studio/qwen-image-generation-and-editing-api-reference)。模型示例可编辑，账号可用性以实际厂商响应为准。

原验证见 `specs/archive/images-plugin/verification.md`，本次统一服务迁移见 `specs/action-architecture/migration.md`。受控 HTTP 厂商、标准 MCP 和浏览器测试验证真实传输、状态和图片字节；它们不等于付费厂商账号验收或用户本人验收。

界面文字使用本包 `src/messages.ts` 的 `images.*` 稳定键，通过内置插件目录的 `messages` 交给共同翻译入口。`ui.ts` 与浏览器客户端共用这份中英词典；`src/en.ts` 只保留其他主人或目录元数据仍使用的中文键。换措辞时保留键，新增场景时按含义命名；格式与登记见 [Workbench 界面文字](../../../apps/workbench/README.md#界面文字翻译检查与一个文件怎样迁到稳定键)。

## 开发要求

- 负责：个人图片生成、项目历史与已保存图片的预览。
- 不负责：文字模型提供方、自动重试、其他插件的实现。
- 公开入口：`@molis-ai/molis-work-plugin-images`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 服务框内的 Connectors 链接先关闭原生模态框，让设置接收点击与键盘；返回时保留服务字段，打开服务框主动刷新账号，失败留在框内并可重新打开重试。返回生成历史清空本页声明的当前任务，不取消已接受的服务端任务。
  - API Key 由宿主 SecretStore 加密保存；列表、任务与下载不返回 Key。
  - 失败、超时或重启不自动再次调用；「停止等待」只停本机请求，不保证厂商停止计费。
  - 所选账号失效时保留选择并显示原因，不自动换账号；生成期间授权或连接版本改变不保存过期结果；按当次返回的 revision 在交付与写入前复核。
  - 同一 Home 只有一个执行进程，由共同 Host 监督器管理；插件不另外建立进程锁或打开数据库。
  - `images.jobs.start` 对助理、MCP、工作流和插件随服务状态可用；用户页面仍能配置服务。发现只读取现有配置与连接状态，不 pin 地址或调用模型。
  - 项目被删除时共同 Home 生命周期回调先同步取消等待受理和执行中的任务，再由 `imagesProjectData` 清理项目任务与已引用图片；插件停用时仍可通过同一数据主人清理。未引用的部分生成文件留到下次具备所需读写授权的启动中回收，缺少 `images:read` 时保留。
  - HTTP 挂载在 `/api/plugins/io.molis.work.images/`，路由只调用共同动作；预览显式返回 inline，下载返回 attachment，Host 只保留 PNG/JPEG/WebP MIME；未知错误仍只回 images.internal 和原通用句，已知错误状态由 SDK 统一转换。
  - 配置、任务与文件的每次写入均等待当前授权后同步复查；并发生成维持每个 Home 最多两项，相同请求 ID 不重复调用厂商。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-plugin-images run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/images-client-bundle.test.ts tests/images-actions.test.ts tests/images-service.test.ts tests/plugin-image-generation.test.ts tests/images-providers.test.ts tests/images-concurrency.test.ts tests/images-mcp.test.ts tests/project-deletion-owners.test.ts tests/model-unavailable-declarations.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts`
- 首次连接与可见对象定向回归（需要本机 Chrome）：`node scripts/run-tests.mjs tests/content-context-regressions.e2e.test.ts tests/images-actions.e2e.test.ts tests/images-plugin.e2e.test.ts`（使用受控本机 provider，不调用真实厂商）。
- 相关手册：[docs/platform/PROLOGUE-AI.md](../../../docs/platform/PROLOGUE-AI.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

页面客户端是 `src/browser/` 的 TypeScript（`tsconfig.browser.json` 类型检查），构建时由 esbuild 打成 `dist/images-client.js`，`src/client.ts` 读取它；请求只经共同的 `molisWorkRequest`，不直接 `fetch`。

客户端资源由 Host 注入的 UI 生命周期管理：隐藏停止进度轮询，再次显示刷新；卸载取消本机请求并释放监听、定时器和观察器。服务端任务保持原有取消与恢复语义。

执行时限与取消监测复用 Plugin SDK 的执行生命周期；请求去重、图片提交和重启后中断记录继续由 Images 拥有。监测失去执行资格后停止等待，不能把撤销或关闭改写成普通失败。

连接使用位置查询 `images.connection.usages` 读取原生图配置的 `auth_connection_id`，返回该配置 id 与已有生成动作；不查询历史提示、图片或 API Key。换绑、删除和停用后直接反映当前 owner 的状态，汇总可见性不授予生成权限。
