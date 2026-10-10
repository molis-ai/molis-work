# 本地应用装配中心

把数据库、业务 Modules、横向服务和 Plugins 接成同一个本地产品。CLI、MCP、Web 要执行真实项目操作时，经这里取得已装配的能力。

包名：`@molis-ai/molis-work-app-local-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

createMolisWorkLocalHost 为项目创建运行实例与 Host Client；同一项目复用运行实例，capability 调用进入受控队列。project-host 负责连接生命周期，project-capabilities 绑定各 owner；GoalProjectApplication 组合跨 Module 用例。Web 工厂在入口统一解析显式 Home、MOLIS_WORK_HOME 和默认目录。

Web 和进程内嵌入式 MCP 通过 `ensureSystemAgentService` 装配 Agent/Git 后台服务，由 LocalHost 持有，同一 Host 只装配一次。正式 stdio launcher 有明确 Runtime Home 时，通过 `LocalActionGatewayClient` 将公共动作发现和调用转发到常驻 Web Host，不再装配另一个 Agent 执行器（它的 Host 只有构造时不启动运行时的惰性装配，不采用该服务；删除项目时也不为记忆启动运行时）；页面无需打开。嵌入者关闭借用 Host 的传输后，仍须在整个 Host 不再使用时 `await host.close()`。能力注册不会启动 SDK、CLI 或请求模型，实际操作才初始化执行器。独立嵌入者仍受原存储目录的独占锁保护，避免相互误恢复。

通道使用 Runtime 的 `webBaseUrl`（默认 `http://127.0.0.1:4173`）和同一 Home 已有控制凭据，只接受数字 loopback HTTP，拒绝重定向；常驻服务校验 Home/实例、从原目录解析项目，并使用原逐客户端动作授权。项目/主体更换或 MCP 关闭会取消旧请求，连接丢失不自动重试或退回本地执行。服务离线时只列出连接工具，其余调用返回 `actions.service_unavailable`。MCP 目录只有平台工具（连接与受信管理入口）加已授权的动作，没有旧名称或旧开关；Files/Git 的跨调用者成果归属仍未完成。

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
| [src/mcp-catalog.ts](src/mcp-catalog.ts) | 平台工具 + 已授权动作合成目录 |
| [src/goal-project-application.ts](src/goal-project-application.ts) | 跨 Module 应用组合 |

可对照现有调用方 [apps/desktop/src/web-host.ts](../desktop/src/web-host.ts) 阅读装配方式。

## 接入与边界

本包负责连接、事务装配、文件与 HTTP/进程 IO，不复制 Module 的业务规则。withScope 保持响应组合期间的资源存活，内部 invoke 仍进入正常队列。typed Host Client 仍是进程内实现；公共 ActionClient 另有复用现有常驻 Web Host 的本机转发通道。对外 MCP 由本包装配：目录合成、闸门、native 适配表见 [CLI 与开发 · 对外 MCP](../../docs/cli-and-development.md#对外-mcp)。

本包的装配依赖见 [package.json](package.json)；包之间的允许方向由仓库边界检查约束。

安装/分发也由本包装配：installMolisWorkHome 要求显式 sourceDirectory；RuntimeIntegrationService 和 MolisWorkWebServiceManager 保留检测、计划、确认与恢复流程。Web 自重启先返回 202，再运行 afterResponse，不能在响应发出前停止当前进程。createMolisWorkNpmPackageDirectory 与 createMolisWorkRuntimePayload 分别准备 npm 和 Desktop 资产，不会自动发布。

PluginHostExecutor 提供私人存储、Artifact 和 UI clients；这是受信任的进程内开发执行。应用通过 openWorkSessionRegistry 组合 Work 与 Ledger，关闭 Registry 时释放其拥有的连接。

Schedule 的提醒在项目动作目录直接注册，Scheduler 装配时绑定唤醒，无须打开 Studio。`schedule-reminders.ts` 只连接安装仓库和同库 Feed/Inbox 投递；时间、数量、安装隔离和一次性消费归 Schedule 插件。`schedule-operations.ts` 同样只装配安装执行器和 Inbox；计划与 occurrence、重装后的归属确认、未知结果恢复归 Schedule。执行器注册不派出工作，新的 lease 才能运行持久 pending；结果未知必须在 Schedule 核对后明确重试或跳过。

## 公共搜索与证据

`createSearchEvidenceRuntime` 装配 SEL 的公共 web query、可信身份、intent 持久化和 Storage 正文端口；关闭时取消并等待在途操作和传输，再由数据库所有者关闭连接。`createFeedSourceRuntime` 注入 RSS Runtime、来源路由、条件请求游标和 receipt。Alchemist 直接使用公共装配和受限的 AnySearch 传输，不初始化 Feed/RSS；研究查询、预算和可引用摘要仍由 Alchemist 决定。历史存储名称及引用保留，不改写已有数据。

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
  - 每个项目一条串行操作队列；等模型或外部服务的动作声明 `scheduling: "concurrent"`，例外写进 `tests/action-model-scheduling.test.ts` 的名单并说明理由。并发动作不占队列：它调用的串行动作排队等自己的轮次，只有嵌套在占着队列的调用里的调用直接在队列上运行；场景运行取触发它的调用的位置（`tests/local-host-queue-scope.test.ts`）。
  - 被取消、撤权、停用的调用不再写任何记录，包括失败记账。
  - 安装插件的 Action/定时入口通过可信 route execution 向沙箱传递当前控制；异步能力、密钥/DNS 解析与存储 CAS 后续派出或提交前复查。生成式外层动作 concurrent，串行由沙箱队列承担；未知结果不自动重放。定时调用者按数据库/项目隔离。
  - 安装 operation 每次读取当前依赖的版本、可用性和 execution，决定通道及单次时限；等待后依赖变更拒绝晚提交。query 运行时也拒绝收费或写入能力。嵌套超时的未知结果沿 Sandbox、HTTP 和公开 Action 保留，不能被插件 catch 后变成成功。
  - 生成式公开 Action 从已发布 operation 契约派生，发现/调用准备与 Builder 目录刷新直接及传递依赖的 cost；网络/缺失/循环无法确认时保持 unknown。仅变化的 operation 替换注册，关闭或卸载期间的异步检查不能重挂旧动作；不改安装指纹或旧 provider/version，不借声明自动授予权限。
  - 安装 owner 按已发布版本复用唯一执行定义，回滚不能用新对象替换 Runtime 已登记的同版本实现。版本切换先验证批准覆盖所需权限，执行定义只持有所需集合；卸载同时清除该插件的缓存，重装产生新定义。
  - 生成式模型提示词按可信项目/安装身份读取实际发布声明；试运行读取自己的构建声明。Home 设置中的聚合登记只用于发现与编辑，不能替代执行版本；用户覆盖按 owner/prompt 保留，安装登记按项目/实例分别更新和注销。异步声明读取后先复查授权/取消，再记使用和派出。
  - `installed-plugin-host.ts` 按项目数据库拥有生成式安装运行（安装、升级、停用、卸载的动作在 `installed-plugin-lifecycle.ts`）；发现/恢复读取已发布工件和批准记录，不初始化创作 Workflow。Studio 只委托生命周期管理。正常关闭保留启用意图，用户停用不随重启撤销；关闭顺序是创作与预览、安装进程、其他项目插件、数据库。
  - 已停用的安装可以升级或回滚，版本换了、安装仍停用，Host 重启后也一样（此时 Supervisor 并不登记它，由目标定义登记）；启用启动安装所在的版本。被隔离的安装拒绝版本切换，先卸载再装。卸载后可再确认安装任一已发布版本，保留的数据按版本兼容声明沿用；目标版本读不了保留的数据时，安装以 `plugin_kept_data_incompatible` 拒绝，带 `discardKeptData: true`（创作台里由人确认「放弃旧数据，全新安装」）才删掉保留的数据再装。同意安装时在授权框里填的密钥随 install 动作一起送来，只在安装完成后保留；安装没有完成（启动失败等）就整体撤回：不留密钥、批准记录和崩溃的安装行，放弃旧数据的那次安装失败时旧数据原样还给人；撤回（第一次安装的也一样）先问 Runtime 能否退回，若这次安装已被后来的安装顶替、或人在这期间已把它卸载，就什么都不动（不还旧数据、不撤密钥和批准记录、不撤已开放的动作），新安装保持原样，人对数据去留的选择也算数。恢复时每个安装的失败原因取自它自己的 Supervisor 状态。生成式命令在调用返回后若调用方授权已结束，报 `actions.outcome_unknown`（操作已执行，勿重复），查询才按撤权拒绝并不回传结果；有 `required_actions` 的能力不开放给生成插件（插件一次只能调用一项已批准的动作）。
  - 项目关闭时创作与预览、安装进程、其他项目插件逐个释放，某一步失败也继续后面的步骤并最后关闭数据库，再把失败报告给调用者。
  - 只装配和做 IO（连接、事务、文件、HTTP、进程），不复制 Module 的业务规则；能力注册不启动 SDK、CLI 或请求模型。
  - 项目选择页的简介（`GET /api/projects/:id/brief`，`project-arrival-http.ts`）只经公开读口按所选项目逐个读：Goals 目录与状态、Home 事项、长期背景；读一个项目就要打开它，所以页面在选中停住约 160 毫秒后才来读、服务端同时最多读两个（`createReadLimiter`），不批量预取、不写任何记录，读不到的部分在简介里缺席而不是被猜；缓存按请求语言区分、只留几秒。「最近打开」与采用时保存的一句话描述（`config/project-arrival.json`，`project-arrival.ts`）只是展示记忆：项目自己的页面被打开时写入，选择页渲染时对照目录清理，写失败不挡路，不存任何项目事实。
  - 有 Artifact 输入的 PluginPlatform 观察同一项目连接的领域 journal，每秒核对已提交的 Artifact 游标；其他连接的提交也能触发既有输入图重算，不读取未提交的外层事务。启动读取当前固定事实，关闭先调用 `closeCoordination()` 停止观察、输入处理与事件，再停插件和关数据库。此路径刷新投影，不重放业务操作。
  - 默认接线（`bindWorkspaceCompanions`，每次项目插件启动及放回某个输入口时都会跑）只给什么也没读的输入口装默认来源：已读着另一个插件输出或人给它的固定成果版本的口保持原样（装默认来源会连带清掉固定版本）。放回输入口只在它仍读着那一版时生效，过期页面的点击不撤销后来的选择。
  - 安装器准备 npm 与 Desktop 资产但不自动发布；vendored 依赖的传递依赖必须能从标准 ancestor 解析。
  - 宿主自己打开的个人库（炼金术士每个项目的 `search.sqlite`，`alchemist-search.ts` 的 `ALCHEMIST_SEARCH_BASELINE`）也和别的库一样只认一份当前基线、版本不符拒绝：版本 1，有表没有版本的旧文件拒绝打开；改它的表结构要换版本并加新夹具（`tests/home-store-baselines.test.ts`）。
  - 系统搜索只在这里装配：`system.search` 注册一次；建索引用本机用户上下文，调用者按自己的项目或 Home 客户端访问；成功的命令与提供方注册/撤下都通知搜索，不另建能力名单或权限。
  - 删除项目时，各数据所有者（插件库、炼金术士、插件创作台、记忆、助理、搜索、项目运行环境）经 `ProjectDeletedHooks`（`project-deleted-hooks.ts`，每个 Home 一份、进程内共享）登记自己要清什么；宿主不写它们的表名或目录。目录提交后依次运行，每个所有者在回执里记一步，失败的步骤、被所有者推迟的步骤（`ProjectDeletedDeferred`）和所有者不在收尾进程里的步骤都保持 pending 并留着上次的错误，用同一个删除请求重试，或由 Web 服务接着做（它启动时和运行中每分钟都会把别的进程留下的 pending 回执做完，`web-deletion-sweep.ts`，`projectDeletion.finishAll`）；同一个 catalog 实例里（Web 服务只有一个）同时收尾同一个回执的几处（扫描、重试、演示项目再创建）共用一次运行。只靠文件的所有者对任何打开该 Home 目录的进程都生效：内置插件在自己的目录条目上声明（`BUILTIN_PLUGIN_CATALOG` 条目的 `project_data`，类型 `ProjectDataDeclaration`：标签、清除函数、可选的先后），`project-deleted-owners.ts` 遍历目录登记，不点名任何一个插件（回执里的 id 是 `project_plugin_id`），自己列的只有不是插件的所有者（Functions 模块、炼金术士、插件创作台、助理、记忆、搜索）；需要运行中服务的所有者（项目运行环境、炼金术士、Images、记忆、助理、搜索）在服务存在期间登记并替换同名的文件级所有者，服务关闭后自动退出。所有者的 id 是回执里的稳定名字：没有任何构建再登记的 id，它在旧回执里的那一步会一直 pending（Web 服务每分钟重试一次，并挡住演示项目的再创建），所以删掉或改名一个所有者之前要先决定这些回执的去向。
  - 记忆放在 Agent 运行环境里，Home 里只有执行进程持有它，所以只有执行进程会为删除项目启动它：Web 服务和进程内嵌入式 MCP 把 catalog 交给 `ensureSystemAgentService`（采用了这个 Agent 服务），或运行环境已经在本进程里启动的 Host，是执行进程；只转发到常驻 Host 的 stdio MCP、命令行和卸载程序不是。Home 里有 Agent 运行环境时，它们的记忆这一步推迟（`ProjectDeletedDeferred` 的 `elsewhere`），留在回执里由 Web 服务做，不占用 Agent 运行锁、不让常驻 Host 的 AI 调用失败；没有运行环境就没有记忆库可清，只清账本。执行进程里运行环境正被另一个进程使用时也推迟，但只是需要等待。没有搜索服务的进程（命令行、卸载程序）在 Home 有搜索索引时同样推迟搜索一步。排队中或正在提炼的记忆学习在写入前会再问项目是否还在（`projectExists`），已删除的项目不会因它重新有记忆。
  - 演示项目的 id 固定：再创建（之前删除过）前所有所有者先清一遍，挂起的回执要先做完，其中有推迟的所有者且没有回执证明它已做过时拒绝，而不是带着旧数据创建。重建（`resetDemoProject`）不是删除，不写回执：能清的所有者先清，需要等待的所有者（运行环境正被另一个进程使用）让重建在改动任何东西之前拒绝，服务属于别的进程的所有者（命令行没有 Agent 运行环境和搜索索引）留给运行中的 Molis Work，重建不为它们等待，结果的 `owners_left` 列出它们，`molis-work demo reset` 会说出来。
  - `material-web.ts` 负责显式网页捕获的 HTTP(S)、最多 5 次重定向、12 秒总时限和解压后 4 MiB 正文限制；每次派出复查权限，超限拒绝正文并取消流。Shelf 保留产品组织和链接失败提示，Artifacts 复用 Host HTML 解析，不跨模块导入 Shelf 解析器。
  - Artifacts 外部文档沿用连接器请求生命周期；每个供应商 API 请求前复查原 Action、取消与账号 revision，最终异步授权检查之后再核对连接。撤权、断开或取消不继续读取正文、不刷新凭据，也不保存迟到结果。
  - 助理（`src/assistant/`）只在一轮真的开始之后才把「只告诉一次」的事记为已告知：撤销、已结束的后台任务、停止后落定的修改；开轮失败（无模型、`storage_busy`、Character 版本）不留任何已告知标记，记忆召回按未使用结算，下一轮照样告知。一个后台任务只跟一次（同一工作、同一状态查询的同一 job 不重复登记，卡片接手既有的那条）；撤销先占用再调用所有者，并发的第二次请求得到同一结果，已撤销不被迟到的失败覆盖；归档要求这项工作和它的子任务都没有在进行的一轮，并停用它的定时；归档的子任务仍计入委托它的工作的用量、上限和停止；子任务的首轮开不了就不留孤儿工作。
- 改动后必跑：`node scripts/run-tests.mjs tests/local-host.test.ts tests/local-host-actions.test.ts tests/local-host-queue-scope.test.ts tests/web-mutation-key-settle.test.ts tests/action-before-effect.test.ts tests/action-model-scheduling.test.ts tests/action-read-compatibility.test.ts tests/installer-symlink-dependencies.test.ts tests/system-search-host.test.ts tests/project-arrival.test.ts tests/project-deletion-hooks.test.ts tests/project-deletion-owners.test.ts tests/project-deletion-studios.test.ts tests/project-deletion-assistant.test.ts tests/project-deletion-declarations.test.ts tests/project-deletion-processes.test.ts tests/memory-learning.test.ts tests/goal-management-identity.test.ts tests/home-store-baselines.test.ts tests/private-store-versions.test.ts`
- 助理逻辑验证：`node scripts/run-tests.mjs tests/assistant-undo.test.ts tests/assistant-business-gateway.test.ts tests/assistant-followups.test.ts tests/assistant-delegation.test.ts tests/assistant-memory.test.ts tests/assistant-page-written.e2e.test.ts`（最后一个驱动真浏览器，需要本机 Chrome：工作台自己写的话带 `written_by: "page"`，路由拒绝别的值）。
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
