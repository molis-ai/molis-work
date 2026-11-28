# 图片生成

Migration Goal: `goal-reorg-f2`
Contract: `@molis-ai/molis-work-contracts/platform/plugin`，记录结构见 `@molis-ai/molis-work-plugin-images/contract`。

在 Molis Work 项目中打开「图片」，添加生图服务并选择系统账号连接，填写提示词后点击生成。历史记录与图片保存在本机，可刷新后找回、预览和下载。生图协议、地址与模型由本插件管理，API Key 在系统服务连接中管理；已有密钥自动沿用原引用。

支持 OpenAI Images、Gemini generateContent 和兼容 OpenAI Images 的同步接口。可编辑 API 基址和模型名；基址应为 `/images/generations` 或 `/models/{model}:generateContent` 之前的部分。兼容接口的尺寸按该厂商文档填写，留空采用默认值；不承诺任意厂商协议兼容。API Key 由宿主 SecretStore 加密保存，列表、任务与图片下载不会返回 Key。

生成由明确提交的动作启动，费用由所连接的厂商收取。失败、超时或重启不会自动再次调用；「停止等待」仅停止本机请求，不保证厂商不继续生成或计费。重新使用提示词不立即生图。所选账号失效或服务被删除时保留原选择并显示原因，不自动换成其他账号或匿名本机请求。生成期间授权改变时不保存过期结果。

连接列表 `images.connections.list@1` 的账号记录带 `enabled`，停用保留已选账号与凭据但拒绝生成；重新启用后沿用同一引用。调用方从共同目录取当前版本，旧版精确引用须重选。

每个启用图片的分区（个人空间或项目）拥有自己的 `<分区>/libraries/images.db` 和 `<分区>/plugin-files/<安装>/images/assets/`。本人设置的 `connections` 保存服务名称、地址、协议和模型，随本人同步。账号绑定、密钥和待办的绑定变更留在设备。Web 和 MCP 都由常驻宿主执行动作，按分区去重并限制并发。打开或关闭页面不影响已受理的生成。

各分区的 `saved_images` 集合由本包声明和实现，只传已保存终态的提示词、生成资料、结果与实际图片。运行中记录暂不上传，接收不调用厂商，不继承连接、请求幂等键、input hash 或 runner。图片经过共同 R2 内容通道，长度、编码及 MIME 与实际格式一致后才加入 owner 事务；文件名由目标 owner 生成，不接受网络路径或覆盖唯一本机文件。同步连接不取得生成运行锁、不恢复执行进程，停用的项目仍由 Host 拒绝接收。
生成动作 `images.jobs.start@1` 通过 Runtime 并发受理，需要 `model:invoke` 和 `images:files:write`，状态查询使用 `images.jobs.get@1`。同步或复制的终态记录可以没有本机 `connection_id`。查看、预览和下载历史均无需另配生图服务。新生成需要有效连接和当前授权。删除任务需要 `images:delete` 和 `images:files:write`。页面、工作流和 MCP 通过同一份动作描述取得版本与权限。

插件声明统一动作：`images.connections.list/save/delete`、`images.jobs.list/start/get/cancel/delete` 和 `images.images.read`。还在等厂商的生成由 `images.background.tasks@1`（`src/background.ts`，只读、要 `images:read`）报到平台的后台任务总表，行上的「停止」就是 `images.jobs.cancel@1`；结束的生成是页面上的记录，不是任务。HTTP 仅转发到同一动作服务；标准 MCP 导出相同合同。本人设置按调用身份授权。任务和图片属于调用者的分区。启动返回持久任务，`request_id` 对相同输入去重；图片读取返回实际 Base64 字节、MIME 和文件名。

每个分区一个实例，拥有该分区的任务与图片；Web、MCP 通过同一个动作服务调用。数据库、文件和生图由宿主注入的有限服务提供，插件不持有分区路径或凭据解析器；文件声明在 Manifest 的 `owner_files`（`IMAGES_OWNER_FILES`：根 `images`，顶层目录 `assets`，读 `images:read`、写 `images:files:write`，根与自己的库同在），动作之内由动作和原调用者的权限决定。启动前由 Runtime 检查安装当前的必需授权（`storage:private` 与 `images:files:write`）。任务在后台保留原调用者的可撤销授权，普通请求断开不取消已受理任务；撤权、停用和项目删除后不写晚到结果或失败记录。停止不写业务状态。

实例获准启动后，按 `storage:private` 将本分区遗留的生成标为 `interrupted`。宿主在登记的时间投递队列工作。生成仍在执行时续约，已中断时发送一次带原提示词、可打开对应生成的提醒。显示或重投提醒都不会重新调用厂商。清理本分区无人引用的图片还需当前的读写授权。缺少授权时留待下次清理。

此版不包含图生图、蒙版、多图批处理、异步厂商私有协议或 Artifact 发布。完整产品验收仍须覆盖真实 Host、MCP 和浏览器路径。

官方协议依据：[OpenAI](https://developers.openai.com/api/reference/resources/images/methods/generate)、[Gemini](https://ai.google.dev/api/generate-content)、[阿里兼容 API](https://www.alibabacloud.com/help/zh/model-studio/qwen-image-generation-and-editing-api-reference)。模型示例可编辑，账号可用性以实际厂商响应为准。

原验证见 `specs/archive/images-plugin/verification.md`，本次统一服务迁移见 `specs/action-architecture/migration.md`。受控 HTTP 厂商、标准 MCP 和浏览器测试验证真实传输、状态和图片字节；它们不等于付费厂商账号验收或用户本人验收。

## 项目复制

`openImagesCopyOwner` 只读打开既有本地库，复用当前图片格式和原件校验；目标使用新的记录及图片身份，保留完整字节和终态记录，不复制连接、密钥或 runner，不恢复生成。相同结果重试不重复写入，目标删除/修改后拒绝重建或覆盖，最终授权失败回滚 SQL 记录及同步队列。失败事务可能留下不被记录引用的不可变暂存文件，由原有有界清理处理。该端口不代表整项目用户入口已经接通。验证另跑 `tests/security-invariants-images-copy.test.ts`。
Manifest 的 `ui.locales` 声明[中文](locales/zh.json)、[英文](locales/en.json)和[日文](locales/ja.json)词包。`ui.ts` 与浏览器客户端共用 `images.*` 稳定键。[Workbench 界面文字](../../../apps/workbench/README.md#界面文字稳定键和翻译检查)

服务配置的绑定或删除先记入本机本人设置的 `binding_changes`，连接器提交后才结束操作。中断期间暂停使用该服务，重试后继续。创建方可传 `create_id` 以便重放。凭据归连接器保管。

## 开发要求

项目变更观察由 owner 解码稳定日志键，覆盖已删除记录、冻结上传与保留冲突，未启用上传也不能冒充无本机修改；`hasProjectChanges` 不读取或导出正文，不跨其他 owner 查询。

- 负责：个人图片生成、项目历史与已保存图片的预览。
- 不负责：文字模型提供方、自动重试、其他插件的实现。
- 公开入口：`@molis-ai/molis-work-plugin-images`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；插件协议 `@molis-ai/molis-work-contracts/platform/plugin`，数据合同 `@molis-ai/molis-work-plugin-images/contract`（`src/contract.ts`）。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 服务框内的 Connectors 链接先关闭原生模态框，让设置接收点击与键盘；返回时保留服务字段，打开服务框主动刷新账号，失败留在框内并可重新打开重试。返回生成历史清空本页声明的当前任务，不取消已接受的服务端任务。
  - API Key 由宿主 SecretStore 加密保存；列表、任务与下载不返回 Key。
  - 失败、超时或重启不自动再次调用；「停止等待」只停本机请求，不保证厂商停止计费。
  - 所选账号失效时保留选择并显示原因，不自动换账号；生成期间授权或连接版本改变不保存过期结果；按当次返回的 revision 在交付与写入前复核。
  - 同一 Home 只有一个执行进程；每个分区的实例由该分区的监督器管理，插件不另外建立进程锁或打开数据库。
  - 生图服务列表只回答本人和本插件自己的后台工作；Agent、MCP 或工作流发起的生成用实例上次替本人读到的列表，拿不到服务的设置本身。
  - `images.jobs.start` 对助理、MCP、工作流和插件随服务状态可用；用户页面仍能配置服务。发现只读取现有配置与连接状态，不 pin 地址或调用模型。
  - 项目被删除时平台先经后台作业服务停掉这个项目等待受理和执行中的任务，再连同该分区的库与图片文件一起删掉；插件的代码不参与。未引用的部分生成文件留到下次具备所需读写授权的启动中回收，缺少 `images:read` 时保留。
  - HTTP 挂载在分区下的 `/projects/<分区>/api/plugins/io.molis.work.images/`，路由只调用共同动作；预览显式返回 inline，下载返回 attachment，Host 只保留 PNG/JPEG/WebP MIME；未知错误仍只回 images.internal 和原通用句，已知错误状态由 SDK 统一转换。
  - 配置、任务与文件的每次写入均等待当前授权后同步复查；并发生成维持每个分区最多两项，相同请求 ID 不重复调用厂商。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-plugin-images run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/images-client-bundle.test.ts tests/images-actions.test.ts tests/images-service.test.ts tests/plugin-image-generation.test.ts tests/images-providers.test.ts tests/images-concurrency.test.ts tests/images-mcp.test.ts tests/project-deletion-owners.test.ts tests/model-unavailable-declarations.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts`
- 首次连接与可见对象定向回归（需要本机 Chrome）：`node scripts/run-tests.mjs tests/content-context-regressions.e2e.test.ts tests/images-actions.e2e.test.ts tests/images-plugin.e2e.test.ts tests/images-result-whole-characters.e2e.test.ts`（使用受控本机 provider，不调用真实厂商；最后一个用例检查提示词截断处是 emoji 等两单元字时，下载链接、Chrome 实际保存的文件名与 Shelf 留存回执都保留完整字符）。
- 相关手册：[docs/platform/PROLOGUE-AI.md](../../../docs/platform/PROLOGUE-AI.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

页面客户端是 `src/browser/` 的 TypeScript（`tsconfig.browser.json` 类型检查），构建时由 esbuild 打成 `dist/images-client.js`，`src/client.ts` 读取它；请求只经共同的 `molisWorkRequest`，不直接 `fetch`。

客户端资源由 Host 注入的 UI 生命周期管理：隐藏停止进度轮询，再次显示刷新；卸载取消本机请求并释放监听、定时器和观察器。服务端任务保持原有取消与恢复语义。

个人空间删除任务时，在同一数据库事务先保存完整可携带记录与图片字节，再删除任务；从未上传的唯一图片也可在原版本和空内容前提下离线撤销。旧且无任何当前任务引用的 owner 图片按数据库写锁有界回收（每次至多 20 个，至少 24 小时）；本机保留快照自包含原字节。新文件、共享引用、链接和未知文件名不清理；不依据设备时间丢弃唯一保留原件。
执行时限与取消监测复用 Plugin SDK 的执行生命周期；请求去重、图片提交和重启后中断记录继续由 Images 拥有。监测失去执行资格后停止等待，不能把撤销或关闭改写成普通失败。

连接使用位置查询 `images.connection.usages` 读取原生图配置的 `auth_connection_id`，返回该配置 id 与已有生成动作；不查询历史提示、图片或 API Key。换绑、删除和停用后直接反映当前 owner 的状态，汇总可见性不授予生成权限。
