# 本地应用装配中心

把数据库、业务 Modules、横向服务和 Plugins 接成同一个本地产品。CLI、MCP、Web 要执行真实项目操作时，经这里取得已装配的能力。

包名：`@molis-ai/molis-work-app-local-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createMolisWorkLocalHost 为项目创建运行实例与 Host Client；同一项目复用运行实例，capability 调用进入受控队列。project-host 负责连接生命周期，project-capabilities 绑定各 owner；GoalProjectApplication 组合跨 Module 用例。Web 工厂在入口统一解析显式 Home、MOLIS_WORK_HOME 和默认目录。

Web 和进程内嵌入式 MCP 通过 `ensureSystemAgentService` 装配 Agent/Git 后台服务，由 LocalHost 持有，同一 Host 只装配一次。正式 stdio launcher 有明确 Runtime Home 时，通过 `LocalActionGatewayClient` 将公共动作发现和调用转发到常驻 Web Host，不再装配另一个 Agent 执行器；页面无需打开。嵌入者关闭借用 Host 的传输后，仍须在整个 Host 不再使用时 `await host.close()`。能力注册不会启动 SDK、CLI 或请求模型，实际操作才初始化执行器。独立嵌入者仍受原存储目录的独占锁保护，避免相互误恢复。

通道使用 Runtime 的 `webBaseUrl`（默认 `http://127.0.0.1:4173`）和同一 Home 已有控制凭据，只接受数字 loopback HTTP，拒绝重定向；常驻服务校验 Home/实例、从原目录解析项目，并使用原逐客户端动作授权。项目/主体更换或 MCP 关闭会取消旧请求，连接丢失不自动重试或退回本地执行。服务离线时只列出上下文工具，其余调用返回 `actions.service_unavailable`。判断函数以及 Form、Dataset、PPT、Pages、Cognia、Jelly 的旧名称也已转发并共用动作授权，旧开关不自行授予调用权。插件兼容声明列出完整的 required_actions，全部引用可用后才显示旧工具；原参数和结果适配仍归插件。旧平台工具仍有进程内路径，Files/Git 的跨调用者成果归属也未完成。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/project-host.ts](src/project-host.ts) | 项目运行实例装配 |
| [src/system-agent-service.ts](src/system-agent-service.ts) | Host 拥有的 Agent/Git 装配与原模型、连接引用 |
| [src/local-host.ts](src/local-host.ts) | Host Client 与调用生命周期 |
| [src/project-capabilities.ts](src/project-capabilities.ts) | 能力绑定 |
| [src/web-server.ts](src/web-server.ts) | Web 请求与 Home 装配 |
| [src/mcp-server.ts](src/mcp-server.ts) | 对外 MCP 装配；公共动作转发、上下文及历史入口 |
| [src/action-gateway.ts](src/action-gateway.ts)、[src/action-gateway-http.ts](src/action-gateway-http.ts) | 常驻 Host 的通用动作通道，复用原授权与执行核心 |
| [src/mcp-catalog.ts](src/mcp-catalog.ts) | 平台 schema + 插件 `mcp_exports` 合成目录 |
| [src/mcp-native-plugins.ts](src/mcp-native-plugins.ts) | 尚待收敛的历史 Native MCP 兼容适配；新插件使用动作声明 |
| [src/goal-project-application.ts](src/goal-project-application.ts) | 跨 Module 应用组合 |

可对照现有调用方 [apps/desktop/src/web-host.ts](../desktop/src/web-host.ts) 阅读装配方式。

## 接入与边界

本包负责连接、事务装配、文件与 HTTP/进程 IO，不复制 Module 的业务规则。withScope 保持响应组合期间的资源存活，内部 invoke 仍进入正常队列。typed Host Client 仍是进程内实现；公共 ActionClient 另有复用现有常驻 Web Host 的本机转发通道。对外 MCP 由本包装配：目录合成、闸门、native 适配表见 [CLI 与开发 · 对外 MCP](../../docs/cli-and-development.md#对外-mcp)。

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

安装/分发也由本包装配：installMolisWorkHome 要求显式 sourceDirectory；RuntimeIntegrationService 和 MolisWorkWebServiceManager 保留检测、计划、确认与恢复流程。Web 自重启先返回 202，再运行 afterResponse，不能在响应发出前停止当前进程。createMolisWorkNpmPackageDirectory 与 createMolisWorkRuntimePayload 分别准备 npm 和 Desktop 资产，不会自动发布。

PluginHostExecutor 提供私人存储、Artifact 和 UI clients；这是受信任的进程内开发执行。应用通过 openWorkSessionRegistry 组合 Work 与 Ledger，关闭 Registry 时释放其拥有的连接。

Schedule 的提醒在项目动作目录直接注册，Scheduler 装配时绑定新旧唤醒，无须打开 Studio。`schedule-reminders.ts` 只连接安装仓库、旧数据迁移和同库 Feed/Inbox 投递；时间、数量、安装隔离和一次性消费归 Schedule 插件。旧 job 身份和收据保持，归属不明的记录保留并暂停。`schedule-operations.ts` 同样只装配安装执行器、Inbox 和旧定时 operation 的单向迁移；计划与 occurrence、未知结果恢复归 Schedule。执行器注册不派出工作，新的 lease 才能运行持久 pending；结果未知必须在 Schedule 核对后明确重试或跳过。长驻 timer 在旧 lease 结束后继续迁移，避免未导入的旧 job 被提前消费。

## 公共搜索与证据

`createSearchEvidenceRuntime` 装配 SEL 的公共 web query、可信身份、intent 持久化和 Storage 正文端口；关闭时取消并等待在途操作和传输，再由数据库所有者关闭连接。`createFeedSourceRuntime` 注入 RSS Runtime、来源路由、条件请求游标和 receipt。Alchemist 直接使用公共装配和受限的 AnySearch 传输，不初始化 Feed/RSS；研究查询、预算和可引用摘要仍由 Alchemist 决定。历史存储名称及引用保留，不改写已有数据。

## SDK 兼容发布面

`sdk/` 保留 0.1.x 的根 SDK 名称与类型别名；它独立于本包 `src/index.ts`，由根 `tsconfig.sdk.json` 编译到 `dist/index.js` 及对应声明。消费者仍使用 `@molis-ai/molis-work`，内部代码继续使用明确的 Module/Host 入口。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-local-host typecheck
pnpm --filter @molis-ai/molis-work-app-local-host build
```

已有行为示例与回归：[local-host.test.ts](../../tests/local-host.test.ts)、[web-home-isolation.test.ts](../../tests/web-home-isolation.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/local-host.test.ts tests/web-home-isolation.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

Web 目录连接归每个服务实例及固定 Home 所有；传入外部 LocalHost 时归该 Host 所有，关闭或重建借用的 Web 传输仍保留连接，最终 Host 关闭才释放。借用时复核 owner/schema，查询不缓存授权或项目事实，关闭等待已有借用。当前 schema 的目录打开不取得初始化写事务，也不执行建表。首次准备遇到 SQLITE_BUSY 延迟重试目录准备，确定性 owner/schema 拒绝不自动重试，关闭取消待重试；不会重新执行失败的业务回调。`/health` 在请求校验后读取服务就绪状态，不通过目录数据库探活。

- 负责：本机唯一的组合根：数据库、Module、横向服务、插件、动作目录、安装器，以及 Web 与 MCP 网关。
- 不负责：第二个业务协调者，或面向用户的外壳。
- 公开入口：`@molis-ai/molis-work-app-local-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：组合根：按 `package.json` 装配已登记的包，只做装配与 IO，不写业务规则。方向见[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节。
- 不变量：
  - 一个 Home 只有一个执行进程（`agent-runtime/.molis-runtime-owner.db` 锁）；其他入口经 `LocalActionGatewayClient` 转发，连接丢失不退回本地执行。
  - 每个项目一条串行操作队列；等模型或外部服务的动作声明 `scheduling: "concurrent"`，例外写进 `tests/action-model-scheduling.test.ts` 的名单并说明理由。
  - 被取消、撤权、停用的调用不再写任何记录，包括失败记账。
  - 安装插件的 Action/定时入口通过可信 route execution 向沙箱传递当前控制；异步能力、密钥/DNS 解析与存储 CAS 后续派出或提交前复查。生成式外层动作 concurrent，串行由沙箱队列承担；未知结果不自动重放。定时调用者按数据库/项目隔离。
  - 安装 operation 每次读取当前依赖的版本、可用性和 execution，决定通道及单次时限；等待后依赖变更拒绝晚提交。query 运行时也拒绝收费或写入能力。嵌套超时的未知结果沿 Sandbox、HTTP 和公开 Action 保留，不能被插件 catch 后变成成功。
  - 生成式公开 Action 从已发布 operation 契约派生，发现/调用准备与 Builder 目录刷新直接及传递依赖的 cost；网络/缺失/循环无法确认时保持 unknown。仅变化的 operation 替换注册，关闭或卸载期间的异步检查不能重挂旧动作；不改安装指纹或旧 provider/version，不借声明自动授予权限。
  - 安装 owner 按已发布版本复用唯一执行定义，回滚不能用新对象替换 Runtime 已登记的同版本实现。版本切换先验证批准覆盖所需权限，执行定义只持有所需集合；卸载同时清除该插件的缓存，重装产生新定义。
  - 生成式模型提示词按可信项目/安装身份读取实际发布声明；试运行读取自己的构建声明。Home 设置中的聚合登记只用于发现与编辑，不能替代执行版本；用户覆盖按 owner/prompt 保留，安装登记按项目/实例分别更新和注销。异步声明读取后先复查授权/取消，再记使用和派出。
  - `installed-plugin-host.ts` 按项目数据库拥有生成式安装运行；发现/恢复读取已发布工件和批准记录，不初始化创作 Workflow。Studio 只委托生命周期管理。正常关闭保留启用意图，用户停用不随重启撤销；关闭顺序是创作与预览、安装进程、其他项目插件、数据库。
  - 只装配和做 IO（连接、事务、文件、HTTP、进程），不复制 Module 的业务规则；能力注册不启动 SDK、CLI 或请求模型。
  - 项目选择页的简介（`GET /api/projects/:id/brief`，`project-arrival-http.ts`）只经公开读口按所选项目逐个读：Goals 目录与状态、Home 事项、长期背景；读一个项目就要打开它，所以页面在选中停住约 160 毫秒后才来读、服务端同时最多读两个（`createReadLimiter`），不批量预取、不写任何记录，读不到的部分在简介里缺席而不是被猜；缓存按请求语言区分、只留几秒。「最近打开」与采用时保存的一句话描述（`config/project-arrival.json`，`project-arrival.ts`）只是展示记忆：项目自己的页面被打开时写入，选择页渲染时对照目录清理，写失败不挡路，不存任何项目事实。
  - 有 Artifact 输入的 PluginPlatform 观察同一项目连接的领域 journal，每秒核对已提交的 Artifact 游标；其他连接的提交也能触发既有输入图重算，不读取未提交的外层事务。启动读取当前固定事实，关闭先调用 `closeCoordination()` 停止观察、输入处理与事件，再停插件和关数据库。此路径刷新投影，不重放业务操作。
  - 安装器准备 npm 与 Desktop 资产但不自动发布；vendored 依赖的传递依赖必须能从标准 ancestor 解析。
  - 系统搜索只在这里装配：`system.search` 注册一次；建索引用本机用户上下文，调用者按自己的项目或 Home 客户端访问；成功的命令与提供方注册/撤下都通知搜索，不另建能力名单或权限。
  - `material-web.ts` 负责显式网页捕获的 HTTP(S)、最多 5 次重定向、12 秒总时限和解压后 4 MiB 正文限制；每次派出复查权限，超限拒绝正文并取消流。Shelf 保留产品组织和链接失败提示，Artifacts 复用 Host HTML 解析，不跨模块导入 Shelf 解析器。
  - Artifacts 外部文档沿用连接器请求生命周期；每个供应商 API 请求前复查原 Action、取消与账号 revision，最终异步授权检查之后再核对连接。撤权、断开或取消不继续读取正文、不刷新凭据，也不保存迟到结果。
- 改动后必跑：`node scripts/run-tests.mjs tests/local-host.test.ts tests/local-host-actions.test.ts tests/action-before-effect.test.ts tests/action-model-scheduling.test.ts tests/action-read-compatibility.test.ts tests/installer-symlink-dependencies.test.ts tests/system-search-host.test.ts tests/project-arrival.test.ts`
- 安装插件执行链额外验证：`node scripts/run-tests.mjs tests/installed-plugin-host.test.ts tests/installed-plugin-execution.test.ts tests/installed-plugin-policy.test.ts tests/generated-action-costs.test.ts tests/agent-built-plugins-reminders.test.ts tests/agent-built-plugins-network.test.ts`。
- 生成式提示词身份/版本验证：`node scripts/run-tests.mjs tests/generated-plugin-prompt-binding.test.ts tests/generated-plugin-prompts.test.ts tests/plugin-model-generation.test.ts tests/agent-definitions.test.ts tests/prompt-registration.test.ts`。
- 网页材料与导入验证：`node scripts/run-tests.mjs tests/material-web.test.ts tests/material-extraction.test.ts tests/artifact-document-import.test.ts tests/shelf-actions.test.ts`。
- 相关手册：[docs/platform/LOCAL-HOST.md](../../docs/platform/LOCAL-HOST.md)、[specs/action-architecture/spec.md](../../specs/action-architecture/spec.md)、[docs/platform/PROLOGUE-AI.md](../../docs/platform/PROLOGUE-AI.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/LOCAL-HOST.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。


## 并行写入的 Git 工作树端口

`createGitWorktreePort` 目前是尚待产品接线的底层端口，不代表并行写入入口已可用。它只从授权仓库根创建工作树，目录位于仓库同级的 `.molis-work-writers/<来源标识>/<slot>`；子目录权限不自动扩大到全仓库。主工作区有未提交或未跟踪内容时拒绝从旧 HEAD 分叉，须先确定完整起点。Git 原登记拥有目录与分支，分支配置 `molisWorkOrigin` 固定创建工作区和原基线；缺失或不匹配时拒绝接管，不根据当前 HEAD 猜测旧基线。

`changes` 对照原基线读取净变化，同时包含未忽略的新文件，并保留特殊路径。`remove` 只移除已核对来源的干净工作目录，拒绝未提交、未跟踪和忽略内容，保留分支及来源以免丢失未整合提交。清理不代表整合或验收，已移除目录的 slot 不自动复用。真实 Git 验证见 `tests/git-worktrees.test.ts`；后续须接 SDK 子目录授权、原审查和成果整合。

Coding/Git 生产通知接到当前项目的 Files/Git 视图 revision；Host receipt observer 可晚于 headless 插件装配接入，项目关闭先注销，插件停用撤销发布身份。revision 是进程内 UI 提示，重启更换 epoch，不能当作可靠业务 outbox。

### 公共材料提取

`material-extraction.ts` 实现 `contracts/services/materials`：输入已授权字节，返回正文、页/时间定位、覆盖及截断信息；不产生附件身份或业务材料记录。UTF-8 只做本地解码；HTML、PDF 文本在有界 worker 中执行，取消/超时会终止并等待 worker 退出，异常 HTML 不能阻塞主线程时限。原生 PDF/OCR/音视频和许可证归 `native/materials`，构建随 Host 打包。模型下载必须显式允许，临时文件在子进程关闭后清理。

Jelly 保留上传 SHA、历史路径和领域引用，只委托解析；onboarding 复用文字/HTML/PDF 文本提取，保留原始附件并拒绝截断或缺失文本层的 PDF。DOCX/ZIP 经同一 Host 文档 worker 读取，Pages 负责编辑器转换；Shelf 网页、PDF 预览、PDF 文字层与 OCR 也复用共同提取口，AI recipe 仍待迁移。Shelf 显式采用 32 MiB 输入，公共默认仍为 25 MiB；图片可按语言返回逐行置信度，产品低置信度提示留在 Shelf。Artifacts HTML 端口异步，12 秒限时，保留原 2 MiB 正文与原文限制，不用网页截断代替文档；提交前沿用 beforeSave 并复核 signal。相关回归：`tests/material-extraction.test.ts`、`tests/shelf-material-extraction.test.ts`、`tests/jelly-native-material.test.ts`、`tests/context-onboarding-documents.test.ts`。

文档批次用 `MaterialDocumentReader` 返回原名、正文格式、内容和覆盖信息。ZIP 路径/目录/CRC/有界解压、DOCX Mammoth 和 UTF-16 BOM 解码归 Host；预览和正式导入经 `pages-import.ts` 共用装配。取消/超时终止 worker，Pages 在异步返回后再检查执行权限，最终业务转换与单事务/请求幂等仍由 Pages 管理。文档输出合计限 20 MiB，超限拒绝整个批次。

Catalog 的异步 `commit` 只接收同步 owner 提交体：沿用当前连接的锁等待时限，锁忙时将未开始的 `BEGIN IMMEDIATE` 等待让回事件循环，拿到锁后校验 schema/owner，且提交体只调用一次。正常语句的 busy timeout 始终恢复，事务不跨异步 IO；创建、删除和示例项目沿原文件准备/恢复流程在真正 Catalog 提交处使用此口。动作调用方在异步等待后通过 `beforeAcquire` 复核原 `beforeEffect`，取消/撤权不得提交。原同步 API 继续提供给其既有同步调用方，不允许直接把 async 业务回调塞进提交体。

固定项目身份的创建使用请求独有的暂存目录；提升后的数据库可由并发或重启后的请求校验采用，目录提交重读已登记身份，失败不删除其正式数据库。示例重置在新数据初始化和最终目录事务成功后才清理旧备份；此前失败恢复旧目录，插件启用与重置记录一起提交。备份清理失败保留已成功的正式目录。
