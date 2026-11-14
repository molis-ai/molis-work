# 动作迁移历史：盘点与早期验证

状态：2026-09-25 至 2026-09-28 的迁移过程与验证记录，2026-11-03 分册。原文的“下文”“末尾”指整组历史记录，可从总入口查找。下文“当前”“尚未提交/发布”“本轮”“待迁移”均为原记录时点的陈述；不作为今日状态、执行授权或现行兼容策略。现行规则见[动作合同](../spec.md)与[SSOT](../../../docs/SSOT-MATRIX.md)。防腐阶段的决定见[历史归档](../../archive/repository-anti-corruption/spec.md)。

[迁移历史总入口](../migration.md) · [2026-09-28 复查报告](../review-2026-09-28.md)

## 本册目录

- [原迁移目标与状态](#原迁移目标与状态)
- [当前复查状态（2026-09-28）](#当前复查状态2026-09-28)
- [历史阶段记录](#历史阶段记录)
- [存量插件盘点](#存量插件盘点)
- [平台与消费方](#平台与消费方)
- [验证](#验证)

## 原迁移目标与状态

目标：内部完整。状态：本地迁移与本轮复查修复完成，尚未提交/发布；始终保护其他任务成果。

## 当前复查状态（2026-09-28）

Claude 的迁移已合入 `main @ 8b609527`。当前架构与实际路径已重新审查，发现的问题均已在本地修复，完整证据见 [main 复查报告](../review-2026-09-28.md)。当前完成项：

- 25 个现存原生插件及 6 个官方集成逐项核对原入口、注册、消费方和业务结果。官方私有 Feed 驱动经 Feed 能力使用，公开账号查询经连接系统动作；未知插件的发现/场景/工作流/MCP 使用共同机制。
- 工作流部分成功保留尝试状态，普通继续不重复写；MCP 撤权、工具 schema 变化与不支持合同在实际派发前拒绝。Coding MCP 的 SDK 网络检查、取消和需对账状态已贯通真实 HTTP。
- Feed 公开来源、Git 研究库和账号 Listener 的网络/模型等待后核对授权与来源状态；定时器通过 `feed.sources.tick`，旧直调旁路删除，计划幂等键修复。
- Feed 列表/详情、首页非 Goals 视图、信息助手、终端关联材料、判断历史、Shelf 设置均经相应动作；停用后热缓存不返还旧数据。
- 工作流默认展示插件声明的可读摘要与原对象链接，技术详情折叠；长正文与桌面/窄屏真实浏览器通过。异步恢复不再覆盖用户新选择，故障注入证实回归测试有效。
- 原 Functions 插件包与依赖、被替代名单/分发/读取分支已清理；保留的兼容入口薄转发到同一执行核心，原函数与历史/业务数据保留。SDK、开发文档与生成模板同步。

核心修复 120 项、Feed 67 项、SDK 32 项/应用 38 项、查询消费 79 项，以及最终存量专项 154 个不同用例通过；批次重叠，不相加。最终清理回归 28/28，包含两个真实 Chrome 场景。全 workspace 构建、最后 Host 重建、应用根目录与插件 SDK 类型、69 包边界通过。SDK 全量测试类型有两处基线错误，本次未重跑全仓约 2600 项、未逐一登录商业服务或穷举所有 UI 分支。完成程度为迁移范围本地内部完整的工程与已覆盖实际路径，尚未提交/发布，本轮不替代用户本人验收。

下方保留按日期的迁移过程与原反例；历史“待迁移”和“执行中”不是当前待办。各插件共同能力的证据见“[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)”，本轮逐插件专项见复查报告末尾。
## 历史阶段记录

场景配置已由共同 Host 根据原声明自动派生查看、启用、停用三项真实动作，安装与调用方的配置权限独立于运行权限。只提供消费场景的陌生插件通过现有对外授权设置和生产 LocalMcpServer 完成原配置停用、撤权与重启验证；没有新增授权表或绑定副本。具体证据见末尾“[场景管理动作与独立授权](scenes-and-agents.md#场景管理动作与独立授权)”。其余插件、作者合同和系统治理仍继续迁移。

作者用途已保存准确场景版本与提供方，同名多版本可在真实编辑器选择，标签和使用位置按版本区分。新发布动作声明结果适用的准确场景，共同核心在发现、绑定和执行阶段阻止转到其他版本或替换提供方。旧草稿发布时仅在唯一匹配下补齐；已发布旧记录保持。此项替代早前记录中的“多版本作者暂不可配置”限制，非推荐结果及停用来源的持久用途显示仍未完成。

首页已接通对象上下文、准确会话选择与真实消息发送；具体动作通过插件的事项查询自动发现，首批 Inbox 完成/忽略与未知插件原业务写入共用动作服务。按钮不再根据陌生动作 ID 回退到“接着做”。动态事件、导航/授权/问询和判断动作名单仍需迁移，详细证据见末尾记录；不以本轮代替全部首页或全量插件闭环。

正式 stdio MCP 的公共动作现经本机通道使用常驻 Web Host；目录、逐客户端授权和业务执行仍来自原服务，不维护第二份动作名单。判断与六组 Native 插件旧名称也已共用该授权和执行，旧开关不再自行授予权限。未知动作已通过真实产品 launcher 跨进程发现及写入，服务离线保留上下文工具。旧平台工具尚有本地路径，Files/Git 对外成果归属未定；这些仍属于未完成范围。具体边界和证据见末尾各次迁移记录。

Goals 已注册 50 项项目动作和 2 项 Home 个人规划动作，覆盖目录/创建/便笺、状态/历史、完整快照/约定/页面集合、工作写入与回执、用户决定、项目规划、长期说明、生命周期、目标树、关系及项目规则。43 项项目动作及 Home 目录查询按授权供 MCP 使用；八项管理/保存/决定/关系规则操作保留受保护用户上下文。typed、CLI snapshot、Web、Coding 对应读取与进展、项目恢复目录、Work/Agent 说明、Session handoff、生命周期和结构提案已接通；30 个旧 MCP 名称使用精确授权与常驻 Host。整页和 fragment 目录/正文已走共同动作，热缓存不绕过授权；连接摘要也遵守精确授权。初始化/旧数据导入管理入口已转入同一动作并维持管理权限；与其他插件的剩余消费和系统生命周期仍需审计，整体 Goal 尚未完成。

Runtime Web 的内外两层路由 ID 白名单已移除；目录来自当前项目 supervisor，后加入的插件不再覆盖旧路由。陌生插件通过真实 Web 服务和原控制校验完成项目写入，停用、重启、跨项目隔离及旧版本恢复已验证。上轮三项个人插件回归不一致已按实际库/页面合同修正并通过；不代表其他存量插件及整个目标已完成。

Artifacts 的 8 项浏览、导入、引用能力已由插件声明并接入 Host。HTTP、Goal 嵌入、项目文件读取和生产标准 MCP 共用动作，原记录与版本保持；撤权/停用后的导入写入、Home 凭据隔离及桌面/窄屏路径已验证。Runtime 同步 PluginArtifactClient 与实际生产/消费方已迁入同一 Kernel；显式文档账号选择与整体调用治理仍待完成，Artifacts 状态为部分完成。

PPT 的 7 项能力已迁入项目动作服务，HTTP、6 个旧 MCP 名称、JSON 导出和编辑器共用原处理器。旧数据/配色/页身份保留；编辑 CAS、保存排队、下载、排序与固定 Artifact 恢复已验证。旧创作 MCP 的通用直连 Store 适配器已删除。通用工作流、动态用途、生产授权和页面外生命周期仍需整体收尾。

Form 的 11 项业务能力已迁入项目动作服务，原 HTTP、10 个旧 MCP 名称、标准 MCP 与工作台共用处理器。原问卷/答卷身份和 share_id 保留；新答卷保存题目快照，旧答卷明确无快照；版本冲突、提交重试、固定 Artifact 发布恢复及显式 AI 均已接线。业务/协议、实际模型连接和桌面/窄屏核心路径已验证；通用消费、生产授权与完整生命周期仍待系统范围收尾。

Dataset 的 13 项能力已迁入项目动作服务，原 HTTP、12 个旧 MCP 名称、标准 MCP 和编辑器共用同一处理器。原数据、快照及 Artifact 身份保留；串行保存/版本冲突、CSV 多行、显式 AI 与本地加列、发布中断恢复均已接线。业务/协议、实际模型连接及桌面与窄屏核心路径已验证。此项不替代通用工作流、动态用途和生产 MCP 授权。

Cognia 的 22 项业务能力已由 Home 动作服务注册，HTTP、旧只读 MCP 和首次使用材料导入共用实际处理器；固定版本、导入回执、审阅草稿和原数据库保持。目录读取独立授权，整理使用界面所选版本，Prologue 发现不解密、执行前后核对模型及连接。已修复 SDK 本机 HTTP 启动断点并更新实际依赖；标准 MCP、真实 HTTP/HTTPS Provider、桌面/窄屏的生成审阅保存及停用状态已验证。通用工作流、用途配置、生产 MCP 授权及完整生命周期仍随整体迁移推进。

Pages 现有 18 项业务动作与 4 项内容协议适配共用同一注册和执行路径。Inbox 材料生成、结果读取及项目初始材料采纳已迁到 Pages 动作；旧 Host 文稿生成实现已删除。文稿旧 board 分区按原项目目录证明的唯一归属迁移，保留历史请求与编辑。组合动作增加通用 `required_actions`，目录和执行递归检查下游权限与生命周期，Inbox 不再重复维护模型配置判断。跨库 Artifact 发布中断恢复已接通原存储并验证，生产 MCP 授权及系统生命周期仍需继续完成。

灵光的全部原 HTTP 业务操作与工作流内容交接已归入插件动作：8 项业务能力及 4 项内容协议适配共用原 SQLite 数据，HTTP 仅做参数转发。官方 MCP 客户端以明确的测试启动授权完成跨进程验证；文字模型现已共用全局目录及连接引用；生产客户端全量授权和其余连接治理仍未完成。

工作流的 Feed、Inbox、Pages、灵光内容站已改为插件自有动作，并从共同目录发现和执行，删除 Host 支持白名单与插件分支。保存/运行固定能力版本及提供方，旧引用失效可见且不能执行。内容站迁移不等于通用 schema 步骤映射完成；工作流自己的管理动作、运行恢复和其余插件消费仍继续迁移。

系统“能力”入口已接入系统岛及无项目入口，能力库、服务连接、对外接入和判断调用记录读取真实服务。Functions 独立插件已移除，编辑/试跑/发布迁入 `/capabilities/rules` 并调用系统动作；原数据保留。桌面/窄屏主路径已实操。旧用途编辑仍待迁成通用场景；对外接入现已提供同目录新动作的客户端/项目授权，旧别名及平台工具仍待收敛。详细证据见本文最后一节，不表示全部产品路径完成。

已实现共同动作/场景合同、Kernel 注册与 schema 校验、SDK 定义帮助函数、Runtime 激活/撤销接线，以及动态 MCP 协议适配。未知插件已通过正式 Runtime 注册并在内存/SQLite 路径调用；官方 MCP 客户端已通过独立 stdio 进程完成注册发现、持久写入、读取、项目隔离和重启后读取。

已接通 LocalHost 共同组合根：旧 typed capability 与 ActionService 共用一个 Kernel registry、项目 Runtime 和执行队列；Host 在调用期间关联可信身份与业务 Runtime。注册实例以项目作用域区分，同插件可同时在多个项目激活，关闭一个项目只撤回其实例。Coding/Builder/生成插件的生产 PluginPlatform 已注入该 registry，但其启动仍有页面驱动路径，尚未完成独立于 UI 的自动激活。

现有四项工作区能力已补全 schema 与描述，旧内部调用与 MCP 共用注册及校验，删除重复参数检查：`projects.workspaces.list`、`projects.workspace.read`、`projects.settings.workspaces.read`、`projects.settings.browsing-workspace.read`。Files、Git、Coding、Workspace、Plugin Builder 原有消费者继续通过同一 typed 入口调用。

生产 LocalMcpServer 已接受共同目录的动作工具、返回结构化结果，并实时读取能力与工具开关。Native MCP 发布 Pages/Form/Dataset/PPT Artifact 已改用 Host 的项目实例，清除了自行 new LocalProjectDatabase / GoalProjectApplication 的旁路。旧平台工具目录及 Native MCP 适配表仍在迁移期并存，尚未清除。

Inbox 七项业务 API 和已发布判断已接入共同调用（下述证据），Home 已支持无项目的系统判断服务。Inbox 显式判断已接入动态消费场景；Inbox 自动入箱消费者也已接入；下一段继续迁移 Feed/Home 判断和外部 MCP，逐项迁移全部插件，并补全不依赖页面的插件启动及外部客户端授权配置。生产 MCP 新动作现已读取持久化的精确授权，并有真实管理界面；旧 Functions 名称也已共用这些授权和常驻执行，原开关不再单独授予调用权。旧工作流程及函数场景仍使用固定名单；各已接线插件仍需随通用消费、生产授权和生命周期完成最终闭环。

## 存量插件盘点

下列清单来自所有插件目录（包括未启用、隐藏和历史插件）。这是迁移入口清单，不把声明文件存在当作能力清单完整或迁移完成。每项需要继续核对全部对外 API、消费方及真实调用。

| 插件 | 原入口 | 目标位置 | 消费方 | 状态 |
| --- | --- | --- | --- | --- |
| plugins/native/alchemist | Studio 41 个业务 HTTP/SSE/导出入口、3 项旧演示只读入口 | 44 项插件自有合同 → 生产 Host，复用原 Studio services/repositories/jobs | HTTP 经 Host Kernel；标准 MCP 读取真实持久授权 | 44 项业务、Host/actor、原数据和桌面/窄屏通过；浏览器授权后标准 MCP 真实写入及撤销已验证；生命周期、流程步骤与对外授权由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/artifacts | 版本目录/读取/导出、文件/外部导入、来源状态、Goal 引用、项目文件、Runtime SDK 读写 | [src/artifact-actions.ts](../../../modules/artifacts/src/artifact-actions.ts)（PG-077：动作定义原在插件包 `src/actions.ts`，现为成果库模块的，提供方是平台的）、[src/plugin-client.ts](../../../modules/artifacts/src/plugin-client.ts)（ac-artifacts A2 从插件包搬到成果库模块） → 原 Artifact/Context Ledger/Evidence owner | HTTP、Goal 阅读、项目引用、正式 MCP 的 8 项与 Runtime 同步 SDK 均共用 Kernel；Inputs/Outputs、Characters、Shelf、Coding 保留同步合同 | 公共及受限 SDK 接线已验证。外部导入的显式账号选择已完成：导入页按服务列出连接（只有一个时自动选中），多账号未选时拒绝，只用所选账号读取并在版本元数据记下连接，读取期间断开不写入（`tests/connector-document-import.test.ts`）；Artifacts 节「显式 connection_id 未完成」已过时。流程步骤、对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/characters | 原 14 项 Runtime 路由（草稿列表/新建/修改/启停/发布、能力目录、本机 Agent 导入/预览、运行准备/启动/记录） | [src/actions.ts](../../../modules/characters/src/actions.ts)（原在 `plugins/native/characters/src/`，CHR-1 搬到 Module）15 项 `characters.*` 由项目 Runtime 实例兑现（1.3.0，兼容 1.0.0–1.2.0），全部与草稿所有者绑定 | 管理界面 Runtime 路由薄转发（保留 403/404/409）；Agent/Character 仍经已发布固定版本消费 | 已迁移并验证（`tests/characters-actions.test.ts`、characters 系列与基线一致）。本机导入、文件预览、启动与运行记录仅限本机界面；旧 1.0.0 安装现可兼容打开（修复原失败的升级 e2e）。（CHR-1，2026-10-22：Characters 不再是插件，包 `plugins/native/characters` 已删；这些动作由 `modules/characters` 声明与绑定，宿主为每个项目注册提供方（`apps/local-host/src/characters-host.ts`），原 14 个地址由宿主的 `apps/local-host/src/characters-http.ts` 接，状态码改由共用的 `actionErrorResponse` 给。） |
| plugins/native/coding | 58 条 Runtime 路由中的业务面：概况、会话新建/读取/修改、轮次开始/控制/列表、报告与变更读取/保存/目录、计划读取/保存/确认 | [src/route-actions.ts](../../../plugins/native/coding/src/route-actions.ts) 16 项 `coding.*` 由项目 Runtime 实例兑现（1.48.0，兼容 1.30–1.47），与会话所有者绑定；原处理代码不变，路由只转发 | 工作台路由、Host 无页面调用（Host 自带 Agent 执行端口）；开始/控制轮次、改会话与计划仅本机界面 | 业务面已迁移并验证（`tests/coding-actions.test.ts`、51 个 coding 测试与基线一致）。实时流、文件树、符号、任务板、委派、分工目录、检查点、MCP/方法设置等是页面内部路由，按方案「插件内部私有辅助无需机械注册」不注册为动作；其中 MCP 服务配置出的外部工具已进入目录（见「[外部 MCP 工具进入同一目录](verification.md#外部-mcp-工具进入同一目录2026-09-27)」） |
| plugins/native/cognia | 原知识库 HTTP、两个只读 MCP、首次使用材料导入 | [src/actions.ts](../../../plugins/native/cognia/src/actions.ts) → Home 注册；原 Store 与 Prologue owner | HTTP/页面、旧 MCP、标准 MCP、上下文来源扫描及导入/读取共用动作 | 22 项业务接线与 SDK 本机 HTTP 已验证；流程步骤、使用位置、对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/dataset | 原 HTTP、12 个旧 MCP、工作台编辑/CSV/版本/发布 | [src/actions.ts](../../../plugins/native/dataset/src/actions.ts) → 项目注册，原 Store/Artifact owner | HTTP、编辑器、旧名与标准 MCP 共用动作；独立 AI 入口 | 13 项业务与桌面/窄屏实操通过；流程步骤、使用位置、对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/diff | [src/actions.ts](../../../plugins/native/diff/src/actions.ts) | 固定差异读取、纯文本比较 → Runtime 自动注册 | 原 HTTP 薄转发、独立标准 MCP；嵌入可用性由父插件声明 | 业务查询已迁移并验证；流程步骤、使用位置与对外授权由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/experiments（2026-10-10 已删除，下面是当时的迁移记录） | 原 13 项实验 HTTP（列表、读取/导出、新建、删除、运行、取消、复核、参试配置、连接选择、可对比函数） | `src/actions.ts` `experiments.*` → Host 在 Home 注册；判断函数经系统 `functions.authoring.list` 以调用者自身授权读取，不再直开 Functions 库 | 工作台 HTTP 薄转发（含 201/202 与导出下载）；Agent/工作流/MCP 只见 list/results | 已迁移并验证（`tests/experiments-actions.test.ts`、`experiments-http`）。参试配置含本机程序与权重路径，配置/运行/读取全文仅限本机界面 |
| plugins/native/feed | [src/manifest.ts](../../../plugins/native/feed/src/manifest.ts), [src/routes.ts](../../../plugins/native/feed/src/routes.ts) | 插件自有能力定义 → 共同注册/调用；消息去向 [src/item-actions.ts](../../../plugins/native/feed/src/item-actions.ts) `feed.items.*` | Inbox 创建事件转统一场景；内容列表/读取/接收、工作流消费、捕捉场景已接通；消息已读/加入 Inbox/保存/忽略/恢复/升格为 Goal 改为动作，原 `/api/feed/items/:id/:action` 薄转发，首页经 `feed.items.offers` 推荐与执行（`tests/feed-item-actions.test.ts`、home-offers e2e、浏览器实操） | 业务面已迁移：来源管理 `feed.sources.*`（添加/修改/删除/计划/暂停恢复/断开/立即拉取）同样改为动作，旧路由薄转发（`tests/feed-source-actions.test.ts`、浏览器实操）。仍为本机设置流程：连接器令牌、OAuth/设备码授权（携带密钥，只在服务连接设置页使用） |
| plugins/native/files | `src/actions.ts`（第 06 批随 Files 退役删除） | 四项浏览/读取/快照操作 → Runtime 自动注册 | HTTP 薄转发与 Host 动作共用；保留原个人 owner | 现有路径已迁移。插件自身的浏览动作仍绑定本机用户的个人浏览状态，其他主体调用显示 `actions.owner_mismatch` 及原因。跨主体读取改由 Host 提供：`projects.workspace.files.read`、`projects.workspace.git.inspect` 两项目录动作，要求 `workspace:read`，受众含本机用户、内置 Agent、工作流与对外 MCP；对外客户端须精确授权，文件读取的授权不打开 Git；路径越出工作目录、其他项目的目录均被拒绝（`tests/workspace-read-actions.test.ts`；Files/Git/Coding 相关 16 项通过）。2026-10-09（W2-09）：插件原来用的两个 typed 宿主能力 `projects.workspace.file.read.v1`、`projects.workspace.git.read.v1` 已删，每个读只剩上面的动作 id；Files、Git、Coding 在 Manifest 声明 `workspace:read` 并把动作 id 写进 `capabilities.consumes`，经 `services.actions` 调用；整份文件（`kind: "bytes"`）只放行宿主运行的、把这个动作写进 `consumes` 的插件（宿主按它确认的插件身份 `host_plugin` 判断，不是看受众，生成的沙箱插件以插件受众调用也被拒绝），入参 schema 里的 `kind` 因只有一个 id 而对所有调用方可见（取舍记在防腐 spec §1）；Files/Git 里依赖读取的 10 个动作写 `required_actions` 和 `workspace:read`（`tests/workspace-read-one-id.test.ts`）。对外 MCP 客户端不受这次改动影响：Files/Git 的这些动作都是 `bindOwnerPluginAction`，非本机用户的调用者（MCP 的 `local-mcp`、`runtime:*`、网关的 client_id）一律 `actions.owner_mismatch`，前后都调不了，所以没有授权要重新给；插件创作台的能力板只是不再把这 10 个依赖读取的动作列给生成插件，而生成插件以 `plugin:<id>` 调用本来就被同一规则拒绝，没有能用的功能被拿走|
| plugins/native/form | 原 HTTP、10 个旧 MCP、工作台编辑/填写/结果/发布 | [src/actions.ts](../../../plugins/native/form/src/actions.ts) → 项目注册，原 Store/Artifact owner | HTTP、工作台、旧名与标准 MCP 共用动作；独立 AI 入口 | 11 项业务与桌面/窄屏实操通过；流程步骤、使用位置、对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| 原 plugins/native/functions（已移除） | 原 Manifest、Workbench contribution、HTTP/MCP 导出 | [系统动作](../../../modules/judgment-rules/src/actions.ts)、[管理动作](../../../modules/judgment-rules/src/authoring-actions.ts)、[编辑器](../../../apps/workbench/src/judgment-rules/README.md) | 编辑器、HTTP、内部客户端、旧 MCP 薄转发、动态版本动作 | 编辑/试跑/发布及包移除完成；用途按场景合同派生并可编辑、Feed 捕捉与首页判断的真实消费已迁移（见「[共同场景作者目录、真实用途与发布校验](scenes-and-agents.md#共同场景作者目录真实用途与发布校验)」「[Feed 捕捉场景与真实消费完成迁移](scenes-and-agents.md#feed-捕捉场景与真实消费完成迁移)」「[首页判断场景、实时建议与存量旁路清理](scenes-and-agents.md#首页判断场景实时建议与存量旁路清理)」） |
| plugins/native/git | [src/action-definitions.ts](../../../plugins/native/git/src/action-definitions.ts), [src/actions.ts](../../../plugins/native/git/src/actions.ts) | 五项查询/选择/审阅/归档 → Runtime 自动注册 | HTTP 薄转发与 Host 动作共用；执行保留 Review 审批 | 现有路径、无页面 Host 审阅与宿主依赖检查已接通（`tests/files-git-actions.test.ts` 通过：夹具原先带 Home，而带 Home 的 Host 总会启动提供审阅后端的系统 Agent 服务，前提不再成立，已改为不带 Home）。与 Files 相同：插件动作按本机用户归属；其他主体的只读查询经 `projects.workspace.git.inspect`（见 Files 行）。暂存、提交、推送等写操作仍只经 Host 审阅由本人执行，不向其他主体开放 |
| plugins/native/goals | 原 typed/CLI、HTTP、普通及管理 MCP | 插件动作与原领域 owner，完整定义/历史/集合/管理共用 | Web/CLI/typed、Coding 上下文、Work/Agent 说明、Session 交接和 30 个普通 MCP 薄别名；管理初始化/导入及审批维持受保护入口 | 52 项（50 project/2 Home）已接线。消费方审计（2026-09-27）：网页读取/规划/面板、MCP 别名与事件工具、Sessions 的 Goal 合同、Casebook 观察、工作流步骤（16 项命令可选）、Feed 升级为 Goal、首页事项均经 `goalsActions` 调用；直接写 Goal 存储的只剩 Goals 提供方本身、演示数据种子和受信的 V3 导入（仅本机管理入口）。生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/images | Home 服务配置、项目生成/历史/取消/删除/图片下载 HTTP | [src/actions.ts](../../../plugins/native/images/src/actions.ts) → Home 注册、项目调用；原 Service/Store | 工作台/HTTP、内部客户端、标准 MCP 共用九项动作 | 九项业务、Web/MCP 并用、取消/崩溃恢复、桌面/窄屏通过；流程步骤、对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/inbox | [src/manifest.ts](../../../plugins/native/inbox/src/manifest.ts), [src/routes.ts](../../../plugins/native/inbox/src/routes.ts) | [src/actions.ts](../../../plugins/native/inbox/src/actions.ts) → 项目 Runtime 注册 | 原 HTTP 七项业务 API、内容交接、工作区 fragment、授权动作/MCP 客户端；文稿读写转调 Pages | 显式及 Feed 自动判断（动态场景，见「共同场景作者目录」「Feed 捕捉场景」两节）、首页事项与动作（offers）、文稿生成经 `pages.generate`、失败恢复和编辑均已接通；第 138 行所记「判断场景仍在旧 Functions 场景体系」已被后续场景迁移取代。真实模型：同一文稿动作与 TypeSafe 判断已在 prologue 收敛线用 MiniMax / 真实 TypeSafe 实测通过（~/code/goalboard-prologue `work-items/prologue-convergence/spec.md`，2026-09-26）；本分支以注入模型的测试覆盖同一动作路径，未在本分支重跑真实模型 |
| plugins/native/jelly | 原 HTTP、40 类命令、13 个 MCP 工具、材料读取/模型设置 | [src/actions.ts](../../../plugins/native/jelly/src/actions.ts)、command-actions.ts、service-actions.ts → Home 级注册 | 原页面/HTTP、旧 MCP 别名、内部客户端和授权标准 MCP 共用动作 | 59 项能力及真实业务路径已验证；流程步骤、对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/lingguang | [src/plugin.ts](../../../plugins/native/lingguang/src/plugin.ts) 的全部 HTTP 路由（迁移时 8 条，现在 Manifest 声明 10 条，#729 起由 Plugin Runtime 挂载）、工作台、工作流内容交接 | [src/actions.ts](../../../plugins/native/lingguang/src/actions.ts) + 内容协议适配 → 项目 Runtime | 项目 HTTP、工作台与工作流共用动作（旧全局 URL 已在 #729 退役）；官方 MCP stdio 以 fixture 授权验证业务读写/对话/重启 | 业务迁移已验证；对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」）；文字模型已经共用的 `hostCompleteText`（全局模型目录与服务连接凭据，经 Prologue 发出），无单独的模型连接；#729 里 `lingguang.material.read` 加了 `materials:read`、`lingguang.source.read` 加了 `materials:fetch`，版本没升（仍是 1）。MCP 授权要求权限集合完全一致（`apps/local-host/src/mcp-action-grants.ts` 的 `matches`），所以已有的外部 MCP 客户端对这两个工具的授权失效，要在设置里重新确认 |
| plugins/native/pages | [src/manifest.ts](../../../plugins/native/pages/src/manifest.ts), `src/mcp.ts`（已于 #269 删除）, [src/plugin.ts](../../../plugins/native/pages/src/plugin.ts) 的 17 条 Manifest 路由（2026-10-20 起由 Plugin Runtime 挂载，W5-01-PAGES） | [src/actions.ts](../../../plugins/native/pages/src/actions.ts)、[src/content-actions.ts](../../../plugins/native/pages/src/content-actions.ts) → 项目 Runtime | HTTP、内容工作流、旧 MCP、Inbox 生成/历史及上下文采纳共用动作 | 18 项业务、4 项内容适配及跨库发布恢复已验证；对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/plugin-builder | 旧「设计数据 + 解释器 v1」创作台的 `builder.builds.*` 动作与 `/state`、`/builds*`、`/records` 路由 | 已删除（[artifact-positioning](../../archive/artifact-positioning/spec.md) S1b，用户 2026-10-03 定：随旧系统一起删，不留兼容） | — | 旧创作台与其动作、页面、示例一并移除；现行创作台是 Agent 写代码的工作台主区表面（`/api/plugin-builder/studio/*`，`apps/local-host/src/plugin-builder/agent-surface.ts`），生成的插件经 Plugin Runtime 安装 |
| plugins/native/ppt | 原六项 HTTP/旧 MCP、编辑器与 JSON 下载 | [src/actions.ts](../../../plugins/native/ppt/src/actions.ts) → 项目注册，原 Store/Artifact owner | HTTP、编辑器、JSON 导出、旧名与标准 MCP 共用动作 | 7 项业务与桌面/窄屏实操通过；流程步骤、使用位置、对外授权与生命周期由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/schedule | 原 7 项任务/闹钟 HTTP（列表、新建、修改、归档、启停、已读、闹钟启停） | [src/actions.ts](../../../plugins/native/schedule/src/actions.ts) `schedule.tasks.*`/`schedule.jobs.enabled` → 项目 Runtime 注册，原项目库与调度服务 | 工作台 HTTP 薄转发、Host 调用、生产 MCP 逐客户端授权 | 7 项接通；HTTP/授权/项目隔离/停用/重启/生产 MCP 与浏览器提交恢复已验证（`tests/schedule-actions.test.ts`、cross-plugin e2e Schedule 用例）。平台 `schedule.register/list` 唤醒能力仍是插件间 typed 服务 |
| plugins/native/shelf | 原 18 项置物架 HTTP（面板、放入、文件夹、处理任务、剪贴板、设置、项目材料）与 5 项 Runtime 路由（接收 Coding 成果、材料输出） | [src/actions.ts](../../../plugins/native/shelf/src/actions.ts) 18 项 Home 动作 + 2 项项目材料动作由 Host 注册；[src/runtime-actions.ts](../../../plugins/native/shelf/src/runtime-actions.ts) 5 项由项目 Runtime 实例兑现（1.5.0，兼容 1.4.0） | 面板 HTTP 与 Runtime 路由薄转发；Agent/工作流/MCP 只见材料列表、正文与放入/处理/编辑类动作 | 已迁移并验证（`tests/shelf-actions.test.ts`、shelf 系列回归与基线一致）。剪贴板、设备设置、整面板快照、原件路径与示例仅限本机界面；Runtime 动作与个人 Shelf 绑定同一用户 |
| plugins/native/text-stats | [src/actions.ts](../../../plugins/native/text-stats/src/actions.ts) | 固定快照统计、纯文本统计 → Runtime 自动注册 | 原 HTTP 薄转发、独立标准 MCP；真实 Files 快照接线 | 业务查询已迁移并验证；流程步骤、使用位置与对外授权由共同机制承担（见「[存量插件的共同收尾](verification.md#存量插件的共同收尾2026-09-27)」） |
| plugins/native/work | 已下线（SC-4）：包与 `sessions.*` 动作、首页「说一句」（`home.talk.prepare`）一并删除，重做见 BL-177 | — | — | 本行原先记录的迁移不再适用；历史见 Git |
| plugins/native/workflows | 原 11 项流程/运行 HTTP | [src/actions.ts](../../../plugins/native/workflows/src/actions.ts) `workflows.*` → 项目注册；站点经调用者自身授权的内容动作读写 | 工作台 HTTP 薄转发；Agent/MCP 按精确授权使用 | 管理与运行动作已迁移；F4 交接固定身份并先落盘再交付，同步竞争只交付一次、中断重试复用原结果且不重复调模型，Pages/灵光接收按交付键幂等（`tests/workflows-handoff-idempotency.test.ts`）。新增「判断规则」交接：用调用者可运行的已发布 Choice 规则把关，勾选结果才原样交出，否则停下并记录判断（`tests/workflows-judgment-link.test.ts`，编辑器已在浏览器实操）。新增「动作步骤」：目录里接受 workflow 调用、输入为平铺字段的命令即可作为一站（按提供方分组，宿主无名单），每个字段从交过来的标题/正文/来源/链接/日期取值或填固定值，保存与每次运行都按当前合同校验；动作不能做第一站；调用前落盘尝试标记，目录在进入提供方前拒绝的调用不留痕迹，提供方报错或中断则停在「结果未确认」，需人核对后明确重新执行（`tests/workflows-action-steps.test.ts`，含宿主不认识的工单插件；浏览器 1280/390 实操：Feed →模板转换→ 灵光「记下灵光」真实写入并显示结果） |
| 原 plugins/native/workspace（已移除） | 退役的浏览目录选择（state/select 两条 Runtime 路由），生产已不安装 | 由 Host 项目设置 `projects.settings.browsing-workspace.read` 等工作区动作取代 | 无生产消费方；旧选择由 `ProjectBrowsingSettings` 一次性从原私有存储迁入 | 包、依赖声明、锁文件条目、Files/Git 废弃的来源常量与专属测试已删除；旧选择迁移路径保留 |
| plugins/official-integrations/catalog | Feed 连接器驱动；设置页账号检查（旧 `whoami` 行为） | 账号检查改为连接器系统动作 `connectors.account.read`（[connector-account-actions.ts](../../../apps/local-host/src/connector-account-actions.ts)）；清单删除旧 behaviors 声明 | 设置页账号检查路由薄转发；Agent/MCP 按精确授权 | 账号检查已迁移并验证（`tests/connector-account-actions.test.ts`、connectors 设置 HTTP）；取数仍是 Feed 来源驱动，不是对外动作 |
| plugins/official-integrations/github | Feed 连接器驱动；设置页账号检查（旧 `whoami` 行为） | 账号检查改为连接器系统动作 `connectors.account.read`（[connector-account-actions.ts](../../../apps/local-host/src/connector-account-actions.ts)）；清单删除旧 behaviors 声明 | 设置页账号检查路由薄转发；Agent/MCP 按精确授权 | 账号检查已迁移并验证（`tests/connector-account-actions.test.ts`、connectors 设置 HTTP）；取数仍是 Feed 来源驱动，不是对外动作 |
| plugins/official-integrations/gmail | Feed 连接器驱动（取数、健康检查），无对外调用入口 | 仍由 Feed 来源服务驱动；取到的内容经 Feed 动作读取 | Feed 同步 | 无需注册：不对外提供可调用能力，内容经 Feed 已迁移的动作使用 |
| plugins/official-integrations/rss | Feed 连接器驱动（取数、健康检查），无对外调用入口 | 仍由 Feed 来源服务驱动；取到的内容经 Feed 动作读取 | Feed 同步 | 无需注册：不对外提供可调用能力，内容经 Feed 已迁移的动作使用 |
| plugins/official-integrations/web-query | Feed 连接器驱动（取数、健康检查），无对外调用入口 | 仍由 Feed 来源服务驱动；取到的内容经 Feed 动作读取 | Feed 同步 | 无需注册：不对外提供可调用能力，内容经 Feed 已迁移的动作使用 |
| plugins/official-integrations/youtube | Feed 连接器驱动（取数、健康检查），无对外调用入口 | 仍由 Feed 来源服务驱动；取到的内容经 Feed 动作读取 | Feed 同步 | 无需注册：不对外提供可调用能力，内容经 Feed 已迁移的动作使用 |

## 平台与消费方

| 范围 | 原入口 | 目标 | 状态 |
| --- | --- | --- | --- |
| Kernel/Host | packages/kernel/src/index.ts, apps/local-host/src/local-host.ts | 共用注册、schema、上下文与调用合同 | 已共享注册与队列；项目作用域/关闭/重新激活验证通过 |
| Runtime/SDK | packages/plugin-runtime, packages/plugin-sdk | 自动注册、兑现、停用撤销、场景发现 | 定义与生命周期接线通过；生产 Coding/Builder 注入完成；七个项目 Runtime 插件可由动作入口启动并供 UI 复用。宿主事先不知道 ID 的插件经正式 PluginRuntime 安装启动后：目录发现与流程步骤执行、未授权 MCP 客户端被拒而精确授权后以客户端身份调用并记入调用记录（`tests/workflows-action-steps.test.ts`）、场景绑定与判断消费（`tests/function-scene-authoring.e2e.test.ts`）、能力库展示（`tests/capabilities-page.test.ts`）、停用后引用保留并说明原因，均无需修改宿主代码 |
| 平台 MCP | apps/mcp/src/tool-catalog.ts, apps/local-host/src/mcp-server.ts | 统一目录及执行适配 | 新动作已接入持久、逐客户端/范围的生产授权、本机管理 API 与「对外接入」授权界面；旧名称（六组原生插件、Goals、判断函数、连接摘要）均按精确客户端授权转发到同一动作（见对应各节）。仅 initialize/import_v3/goal_tree_decide/event_decide 四个受信管理工具仍直接调用 Host 能力，只在本机管理连接出现，对外客户端看不到 |
| 项目工作区 | packages/contracts/src/modules/projects.ts, apps/local-host/src/project-capabilities.ts | 原消费者及 MCP 使用同一查询能力 | 四项查询已迁移并验证 |
| 外部 MCP | horizontal/agent-host/src/adapters/prologue-mcp.ts、apps/local-host/src/external-mcp-actions.ts | 连接与能力接入共用 | 已接入：已连接服务的工具作为项目动作进入同一目录（每个服务一个提供方，版本随配置与工具形状），经 Prologue 调用器与系统执行器执行；本机用户、工作流动作步骤、获授权的对外 MCP 客户端与插件共用；断开后保留条目并说明原因，移除配置后撤回。重启后连接需重新建立（SDK 连接不持久），保存的工具快照与稳定版本仍在目录中标记为断开不可用，重连后按当前 schema 核对 |
| 判断模块 | modules/judgment-rules, apps/local-host/src/judgment-rules-host.ts | 系统能力、动态场景与使用关系 | 已发布规则注册/调用与 Home 接线通过；动态场景与使用关系已由场景合同与各 owner 上报提供（同上三节） |
| 首页 | apps/workbench/src/scripts/client/project-home.ts、apps/local-host/src/home-actions.ts | 动态动作、实际执行、上下文会话 | 事项按合同类型动态发现；动作按 offers 合同由各插件准备、首页复核后执行（Feed 消息、Inbox 事项、未知插件）；“说一句”按对象上下文选择会话并真实发送（见下文专节）。本地网页调用者的原生权限改由原生清单派生，不再手写 |
| 工作流程 | plugins/native/workflows, apps/local-host/src/workflows-native-plugin-http.ts | 按能力合同匹配及调用 | 四个内容站与未知 Runtime 插件接通；流程自身动作与 F4 幂等交接/中断恢复已完成；判断规则交接与通用字段映射动作步骤已完成 |
| Character/Agent | modules/characters, horizontal/agent-host | 授权能力引用和统一调用 | 大部分完成：Agent/Character 精确能力选择经 AgentHost、Prologue 正式工具扩展与原审查队列执行（见“[Agent 实际工具执行与 F1–F3 审查修复](scenes-and-agents.md#agent-实际工具执行与-f1f3-审查修复)”）；角色管理本身已是 `characters.*` 动作。浏览器复跑已完成（见「[Character 能力范围的浏览器复跑](verification.md#character-能力范围的浏览器复跑2026-09-27)」） |
| 系统岛与设置 | apps/workbench/src/immersive-shell.ts, settings-navigation.ts | 系统能力管理、唯一配置位置 | 完成（本分支范围）：固定入口与真实目录/绑定；连接与旧 MCP 设置迁入，旧 URL（/settings/mcp、/settings/connectors、/settings/functions）转发；固定入口与真实目录/绑定；连接与旧 MCP 设置迁入，旧 URL 转发；能力库对每项能力显示「可用在哪」（调用方、首页事项、判断场景）与「已用在哪」（场景绑定 + 各使用方上报）；调用记录显示最近执行的操作（元数据，不含输入/结果）与判断记录；四个分区桌面/窄屏已实操；能力库与工作流程、首页的本机权限从原生清单派生，不再漏插件；服务连接中的远程 MCP 工具与资源、Coding 配置的外部 MCP 工具均进入同一目录与调用记录。用户本人已于 2026-09-27 验收通过 |
| 生成与开发 | plugins/native/plugin-builder, packages/plugin-sdk, tooling/plugin-cli, skills/molis-plugin-dev | 默认注册能力和消费场景 | 生成模板默认注册系统动作（见“[生成插件模板默认注册系统动作](scenes-and-agents.md#生成插件模板默认注册系统动作)”）；Plugin Builder 自身业务面已注册为动作；生成插件调用外部 MCP 工具由 Plugin Builder 线在合并后接入 |

## 验证

2026-09-25 工程证据：

- Contracts、Kernel、Plugin Runtime、Plugin SDK、MCP 和 Local Host 包 build 通过。
- `node --import tsx --test --test-concurrency=1 tests/action-service.test.ts tests/action-mcp.test.ts tests/action-mcp-stdio.test.ts tests/mcp-protocol.test.ts tests/plugin-manifest.test.ts tests/plugin-runtime-integration.test.ts tests/plugin-upgrades.test.ts`：39 项通过。
- 覆盖未知插件真实 SQLite 读写、输入输出拒绝、调用者与插件权限、停用/重启/卸载、场景实际消费及使用位置、异步期间改绑和提供方重载、旧 Runtime 与升级回归。
- 官方 `@modelcontextprotocol/sdk` Client 经 StdioClientTransport 启动独立进程，连接正式 Runtime 注册的测试插件；schema 带局部 `$ref` 的数组输出经客户端校验；写入与读取结果一致，伪造身份元数据及参数不能越权，两个项目隔离，重启仍可读。此项证明协议/核心组合，不证明产品生产入口已迁移。
- 修改范围的 `git diff --check` 通过。

2026-09-25 Host 接线与生产 MCP 证据：

- `node --import tsx --test --test-concurrency=1 tests/local-host-actions.test.ts tests/local-host.test.ts tests/action-service.test.ts tests/action-mcp-stdio.test.ts tests/current-project-settings.test.ts tests/coding-capabilities.test.ts tests/plugin-outbound-mcp.test.ts tests/mcp.test.ts tests/plugin-platform-composition.test.ts`：50 项通过；Local Host build 与根启动器 `tsc --noEmit -p tsconfig.json` 通过。
- 同一注册被旧 typed 客户端和新动作客户端调用，共用运行实例与队列；同 ID 的项目 A/B 插件及消费场景相互隔离；关闭 A 后 B 正常，A 的旧注册入口不能复活。
- 生产 LocalMcpServer 可列出并执行真实工作区查询，以及运行期注册/撤回的动作；无私有 Session 的固定连接可调用这些能力。其结构化输出与旧内部查询一致。
- 工具关闭后现有 MCP 连接立即更新，旧名称调用被拒绝。更新了原先要求目录冻结到新连接的回归断言，以执行本规格的实时生命周期要求。
- 首次回归发现的旧 MCP 直接构造数据库路径已消除；再次检查通过。目录数据库版本错误仍通过协议返回结构化诊断，不暴露存储路径。
- 补充同一项目内嵌套调用的重入支持：插件动作可以 await 它声明消费的 Host 能力，不会排到自己后面死锁；不同顶层调用继续排队。新增嵌套调用及受影响 Host/PluginPlatform 共 9 项回归通过。

产品实操：尚未验证系统岛、存量业务、真实判断供应商、外部 MCP 接入和工作流程。用户本人验收：未进行。完整目标未完成。


2026-09-25 Inbox 调用迁移证据：

- 插件拥有 `inbox.list`、`inbox.entry.status`、`inbox.pages.results`、`inbox.pages.generate`、`inbox.judgment.read`、`inbox.judgment.write`、`inbox.judgment.evaluate` 七项定义和处理器。输入及输出包含事项、文稿、生成记录和判断字段合同。Host 在项目 Runtime 打开时装配原业务 owner 并注册，不要求打开 Inbox 页面。
- 原 HTTP route handlers 变为 BoundActionClient 适配；删除 HTTP 层的 Feed 应用、Pages 与 Functions 直接调用。工作区 HTML fragment 先经过统一读取和权限/生命周期检查。保留 board_id 存储关联，事项对外返回 canonical project_id；没有迁移或删除用户数据。
- Host 异步目录读取既有项目插件启用事实；执行前再次检查。测试覆盖先发现、停用后使用旧引用、MCP 工具撤回、HTTP/HTML 拒绝、重新启用及重开项目，状态持久化一致。另验排队期间停用不会触发后续副作用。
- 缺 Home、未绑定规则、规则失效/不兼容、缺判断凭据及写作模型未配置在能力状态中说明。文稿生成显式绑定 Host 的 Home，避免直接动作调用误用默认 Home 的凭据。
- Runtime 激活失败会撤回已经注册的能力并关闭该次打开的数据库；回归证明第二次激活不会被残留注册阻挡。
- Contracts、Kernel、Plugin Runtime、Inbox、MCP、Local Host build 通过；根启动器 `pnpm exec tsc --noEmit -p tsconfig.json` 与修改范围 diff 检查通过。
- `node --import tsx --test --test-concurrency=1 tests/inbox-plugin.test.ts tests/inbox-native-plugin.test.ts tests/feed-inbox-pages-loop.test.ts tests/local-host-actions.test.ts tests/action-mcp.test.ts tests/action-mcp-stdio.test.ts tests/current-project-settings.test.ts tests/coding-capabilities.test.ts tests/plugin-platform-composition.test.ts`：32 项通过。补充实时判断/模型状态后，受影响 Inbox/Host/Feed-loop 21 项回归通过。
- 实际 HTTP 服务与 SQLite 回归通过；同一 Host 通过 MCP protocol adapter 修改状态，内部和 HTTP 读到相同结果。官方 MCP 客户端独立进程测试继续通过，但 Inbox 的生产外部客户端授权配置尚未完成，不能据此宣称对外完整可用。
- `tests/list-silent-refresh.test.ts` 中本次改动的 Inbox/Schedule fragment 用例通过；全文件另有两项失败：Alchemist 源码断言要求 `keepListScroll`，Feed 源码断言要求恰好一次 `location.reload()`。这些客户端文件未在本段修改，现实现分别使用其他滚动恢复代码/无该 reload，未扩大本段修改以迎合源码字符串断言。完整测试集并非全绿。
- 其余核心/旧 MCP/manifest/Host 回归 46 项通过；该组合最初另有 Inbox 测试把 MCP 成功的 `isError: false` 写成 `undefined`，已修正并通过上述最终 Inbox 回归。

Inbox 尚未全量闭环：判断场景仍在旧 Functions 场景体系，部分工作台整体投影/Feed 内部动作消费者待核对迁移；未用真实模型供应商验证统一动作入口的文稿生成和判断执行。七项 API 接线不等于插件或整体目标完成。下一步继续已发布判断/动态消费场景、生产 MCP 授权和后续插件迁移；系统岛高保真与正式 UI 仍待完成。

2026-09-25 系统判断能力与 Home 调用证据：

- modules/functions/src/actions.ts 由现有 Functions 模块定义系统 list/describe/invoke 和逐规则判断能力。`functions.published.<function_key>@version` 保留已发布记录身份，Choice/Noul/Score 各有实际输入输出合同；来源为 system.functions，不要求安装插件或选择项目。草稿不注册，调用检查发布版本及配置。
- SystemFunctionsActions 在发现和调用前读取原存储，仅维护当前进程的注册 disposer；发布后目录自动更新。没有增加持久函数目录、复制记录或删除历史。
- LocalHost Home 客户端与项目客户端共用 Kernel registry。无项目调用拒绝伪造 project_id，不打开虚拟项目；支持嵌套调用，关闭等待在途执行后撤销系统注册。两种入口应用同一 Host availability policy。
- 旧 Functions MCP adapter 已删除自行打开存储和组装服务的业务路径，改为系统动作的薄转发。已发布规则 HTTP 的 list/describe/invoke 同样调用动作客户端；草稿管理及 UI 仍是待迁移的原插件路径。旧 MCP 名称与开关保留兼容。
- 生产 LocalMcpServer 在未绑定项目时也使用 Home 动作目录。旧 Functions 开关授权的调用仅获得 functions:invoke，不扩展到其他插件写入。新的外部客户端授权管理仍未完成。
- 系统调用、原后台 JudgmentPort 与 HTTP 现在都读取已选择的 TypeSafe 连接；未选择连接时保留旧凭据兼容。切换账号后下次调用使用新账号，所选连接断开时不回退到旧密钥。配置发现只检查凭据元数据，不为浏览规则解锁 Keychain。行为候选读取延迟到执行并绑定正确 Home，修复了扫描默认 Home 凭据的断点。
- 已发布调用传递取消 signal 到 TypeSafe provider；项目调用的判断历史保留相应项目范围，Home 的函数和历史不跨账号混用。未改变原试跑记录或已发布不可变语义。
- `node --import tsx --test --test-concurrency=1 tests/system-functions-actions.test.ts tests/functions-plugin.test.ts tests/secret-store-keychain-retry.test.ts tests/connector-connections.test.ts tests/plugin-outbound-mcp.test.ts tests/local-host-actions.test.ts tests/local-host.test.ts tests/inbox-plugin.test.ts`：64 项通过。
- 官方 MCP SDK Client 通过独立 stdio 进程连接生产 LocalMcpServer；启动器绑定测试 Home/Runtime 身份，无项目及私有 Session。客户端读取系统目录并通过旧公开名执行判断，HTTP 和外部客户端各保存一条判断，原存储可读。远端 TypeSafe provider 使用 fixture，未验证真实模型服务。
- 新增取消检查后，系统判断三项集成测试再次通过：provider 收到取消，没有虚假成功记录。Functions 模块、插件与 Local Host build，根 `tsc --noEmit -p tsconfig.json` 和修改范围 diff 检查通过。

仍未完成：动态消费场景替换旧 Functions 场景枚举、真实事件通过新场景消费规则、函数使用位置反查、系统岛高保真与正式页面、Functions 插件包与导航删除、工作流/Character 全量接线、其他插件及外部 MCP 接入迁移。Home 系统判断调用已可用，其他 Home 能力待迁移；不能宣称 Functions 或整体目标已迁移完成。


2026-09-25 Host 消费场景与 Inbox 显式判断证据：

- Host 提供同项目／Home 的场景发现、绑定、真实使用位置及执行客户端，复用项目队列与嵌套调用。异步判断返回后重新检查判断能力和消费方策略，未授权项目不能使用该客户端。
- 场景注册支持事件合同与 `prepare`。内核先校验事件，保留绑定快照，再由插件准备判断上下文和私有状态；准备中或判断中改绑、重载、取消均不进入结果消费。新增 `required_scene` 声明，Host 根据真实绑定派生触发动作状态；删除未知判断提供方后，Inbox 判断入口与已用位置同时不可用。
- Inbox 自有 `inbox.next` 场景按 `{entry_id}` 读取实际内容，调用任意兼容的已注册判断，核对事项版本和内容后保存原 Functions 历史并写入 Feed 事件。`inbox.judgment.read/write/evaluate` 已走共同场景客户端；选项来自共同合同，不再调用旧 `functionFitsScene` 或 `bindBoardFunctionScene`。其他插件判断能被选中和真实消费，不需要新增 Host ID 分支。
- 在原 function_scene_bindings 行新增通用绑定 JSON 与修订标识，旧行仍可读取。新旧绑定写入都会变更修订，关闭保留引用。旧 Functions 查询只投影仍启用且可表示的绑定，通用插件身份不伪装成 Functions。已发布函数返回建议合同，场景调用的历史延迟到消费后写入，避免多记一条 MCP 调用或保存过期成功结果。
- 删除 FeedApplication.evaluateInboxEntries 旧显式执行实现，源码和测试中已无该旧 API 引用。原对应的业务断言迁入真实 Host 场景测试，覆盖跨项目、整批选择预检查、compose/verify/done 建议、不确定结果、已关闭事项、历史与事件。Feed 自动触发中的旧 judgeScene 路径仍未迁移，function_scenes 兼容声明暂时仍保留，不能宣称 Inbox 全量完成。
- Contracts、Kernel、Functions 模块、Feed、Inbox、Local Host 构建通过，根 `pnpm exec tsc --noEmit -p tsconfig.json` 通过。
- `node --import tsx --test --test-concurrency=1 tests/action-service.test.ts tests/local-host-actions.test.ts tests/inbox-action-scenes.test.ts tests/inbox-plugin.test.ts tests/inbox-native-plugin.test.ts tests/feed-inbox-pages-loop.test.ts tests/system-functions-actions.test.ts tests/functions-plugin.test.ts tests/plugin-outbound-mcp.test.ts tests/action-mcp.test.ts tests/action-mcp-stdio.test.ts tests/plugin-runtime-integration.test.ts tests/plugin-manifest.test.ts`：98 项通过。包含真实 HTTP/SQLite、官方 MCP 客户端与生产 LocalMcpServer 的既有回归；判断供应商仍用 fixture，未验证真实模型。
- 新增 Inbox 集成证明：旧绑定无需先保存即可执行，建议不会改变 Attention 状态；每次成功只生成一条消费历史；同函数重新绑定、消费方停用、事项变化时均无过期历史；禁用与历史重启保留；未知注册判断真实消费后撤销提供方，引用仍保留并显示不可用。

当前未完成项仍包括：自动 Feed/Inbox/Home 触发链、停用消费插件后的持久使用位置发现（Runtime 撤回场景后目录仍需保留配置事实）、系统岛高保真和正式 UI、Functions 插件删除、工作流与 Character、所有剩余插件、外部 MCP 接入及授权管理。用户本人验收和这些产品路径的真实操作尚未进行。目标保持执行中。


2026-09-25 Inbox 自动消费链与失败处理证据：

- Feed 删除对 inbox.next 的旧 JudgmentPort / judgeScene 调用。正式 Web 组合根注入同作用域场景触发端口，传入 Feed HTTP、公开来源、连接器同步、定时器和工作流交接；各实例保留自己的事件队列，不共用待处理数组。可信调用者与最小判断权限由组合根绑定，事件不能伪造其他 board。
- 队列改为监听 Attention 模块实际创建事件，消除手工 push 的漏触发，覆盖 Feed ingest 参数中的 attention。去重并在 flush 时读取提交后的事项，事务回滚、已关闭事项和重复入箱不产生新判断。修复定时器创建来源故障后丢失未 flush 队列的问题。
- 判断失败通过可选场景 failed 消费入口记录 needs_review/error_code；失败消费仍校验绑定修订、提供方、权限、取消及实际对象版本。prepare 已读取对象但上下文超限时不调用模型，仍保留需复核记录；事件参数不合法或对象无法读取仍直接拒绝。原材料写入与来源同步结果不被判断服务失败伪装为失败，没有自动模型重试。
- Inbox manifest 移除已无调用方的 functions.evaluate consumes/requires。旧 function_scenes 保留给尚未迁移的编辑器兼容。更新 SDK README、Feed/Inbox README、molis-plugin-dev Skill 与开发手册，删除新场景必须修改 Host 白名单的开发步骤；明确旧 MCP/场景声明只用于存量维护，不把尚未完成的产品界面描述成已自动接入。
- 新增 tests/inbox-automatic-scenes.test.ts：启动真实 HTTP 服务与项目 SQLite；HTTP 入箱、直接 attention 导入、工作流交接、连接器同步、公开来源同步和定时来源故障都调用实际绑定。未知注册判断 ID 可消费事件；重复同步不再调用，撤销提供方后保留不可用绑定。模型及上游内容供应商使用 fixture，无真实外部 API 调用。
- 场景核心新增失败期间改绑和取消的回归，证明不能借失败处理落入过期消费。HTTP 验供应商失败与 8000 字上限，来源同步验后续判断失败仍保留已完成收据和事项。
- Contracts、Kernel、Inbox、Feed、Local Host 构建通过，根 `pnpm exec tsc --noEmit -p tsconfig.json` 与修改范围 diff 检查通过。
- 主回归 `node --import tsx --test --test-concurrency=1 tests/action-service.test.ts tests/local-host-actions.test.ts tests/inbox-automatic-scenes.test.ts tests/inbox-action-scenes.test.ts tests/inbox-plugin.test.ts tests/feed-out-rules.test.ts tests/feed-inbox-pages-loop.test.ts tests/feed-sources.test.ts tests/feed-connectors.test.ts tests/workflows-plugin.test.ts tests/system-functions-actions.test.ts tests/functions-plugin.test.ts tests/action-mcp-stdio.test.ts tests/plugin-runtime-integration.test.ts`：97 项通过。
- 移除旧 Inbox requires 后补充 `tests/functions-system-capability.test.ts tests/plugin-manifest.test.ts tests/inbox-automatic-scenes.test.ts`：38 项通过。

仍未完成：Feed 捕捉判断、首页判断与动作、其他直接创建 Attention 的业务方；进程中断后未处理自动事件恢复；独立于页面的运行时启动；停用消费者后的持久使用位置发现；系统岛高保真/正式 UI；工作流通用能力步骤、Character、其余存量插件、外部 MCP 接入与授权、Functions 插件彻底移除。此段仅证明自动入箱子链，不证明所有插件或整体产品内部完整。真实模型和最终产品 UI 实操、用户本人验收仍未完成。

2026-09-25 系统能力入口与真实目录证据：

- 新增系统 `/capabilities/library|connections|access|history` 路由；项目工作台系统岛在 Character 与设置旁加入固定“能力”入口，无项目目录也可进入。入口不依赖 Functions 插件安装。项目上下文与 desktop 参数保留；不存在的项目返回 404，不回落到全局。
- 能力库读取同一 Host ActionClient，支持名称/用途/来源搜索、类型与项目范围筛选、版本详情、实际输入输出、权限与不可用原因。判断详情从 SceneClient 读取兼容性与真实绑定。能力撤销后旧详情链接明确显示不可访问；浏览不会执行 handler、调用模型或解锁凭据。当前可信 Web 用户权限沿用已迁移 Inbox/Functions 组合根，其他插件授权仍须随迁移接入，不能据此宣称完整目录已覆盖全部插件。
- 连接与对外接入复用原连接库、凭据 owner、MCP 开关及写入 API。删除全局设置中重复的 MCP/Connectors 导航，旧 `/settings/mcp|connectors` 以 302 薄转发保留链接和参数。对外页面明确开关只控制现有公开方法；新动作的完整授权仍待实现。
- 调用记录读取原 Functions 历史，Home 只显示无项目记录，项目读取其 canonical project_id/原 board_id 的历史；未建第二份日志库。页面明确当前仅覆盖判断记录。Functions 编辑器、草稿/试跑/发布入口尚未迁入，插件包和依赖尚未删除。
- 先用明确标注的示例数据检查高保真交互切片，再接真实 Host。截图与复现脚本在 `.impeccable/review/action-service/`。真实浏览器 1440×950 和 390×844 验证从系统岛（窄屏先开目录抽屉）进入、选能力、查看兼容场景和真实绑定、搜索无结果、失效引用、TypeSafe 连接详情、MCP 开关保存后重载仍一致、实际 Inbox 场景产生的历史。两种宽度检查无文档横向溢出。窄屏初次自动化未先开抽屉导致定位超时，补上正常用户步骤后通过；不是页面缺入口。
- 浏览器使用隔离的真实 Host/SQLite、正式 Web 路由和确定性本地判断处理器；未调用真实模型或授权真实账号。初版及正式截图均逐张视觉检查；正式页面继承现有连接/MCP 设置内容，尚未完成全量产品内容收敛。Impeccable 检测新增 renderer/styles 返回无问题。
- Workbench、Local Host 构建及根 `pnpm exec tsc --noEmit -p tsconfig.json` 通过。
- `node --import tsx --test --test-concurrency=1 tests/capabilities-page.test.ts tests/project-settings-stage.test.ts tests/plugin-global-settings.test.ts tests/connectors-settings-behaviors.test.ts tests/project-settings-accordion.test.ts tests/system-functions-actions.test.ts`：35 项通过。新增集成覆盖未知能力真实注册/发现、绑定反查、断连恢复、撤回失效、HTML 转义、项目隔离、读取无副作用、系统岛链接及旧路由转发。旧设置导航断言按新的产品归属调整。
- `node --test tests/workbench-registration-boundaries.test.mjs`：2 项通过。此次修改范围 diff 检查通过。不是全仓测试结论，也不是所有插件的真实验收。

下一步：把 Functions 编辑/试跑/发布和绑定配置迁进此系统入口，移除独立插件导航与包依赖；继续 Feed/Home、通用工作流和 Character、全部其余插件与 MCP 双向接入，补齐目录生命周期、权限和持续任务恢复。原完整目标保持执行中，用户本人验收未进行。

2026-09-25 Functions 插件退役、管理动作与编辑器迁移证据：

- 删除原 `plugins/native/functions` 包、Manifest、Workbench/settings contribution、目录注册、依赖和包生成清单，以及旧构建产物。UI 归 `apps/workbench/src/functions`，HTTP 归 `apps/local-host/src/functions-http*`，业务和数据继续归原 `modules/functions`。未新建规则库或搬移用户数据。同步当前 README、插件开发说明与 SSOT；历史审计注明原路径的时间范围。
- 新增 `functions.authoring.*` 管理动作，涵盖列表、读取、创建、修改、试跑、发布、草稿删除、样本与旧用途读取。管理需要 `functions:manage`，试跑另需 `functions:invoke`。HTTP 只转参数到同一 Host 动作客户端，原 Service/Store 保留发布锁定、试跑条件和 CAS 规则；不再在管理 HTTP 内另开业务服务。试跑采用 Host 注入的供应商并传递取消信号；供应商忽略取消而晚返回时也不会保存过期结果。
- `/capabilities/rules` 提供完整编辑/试跑/发布路径；规则 ID、项目和桌面上下文可保留，失效引用在列表显示错误，关闭编辑清除旧详情参数。原 Functions 标签页只清理视图状态，规则数据保留。Assistant/Inbox 引导改为系统入口，同时修正 Assistant 提交 `expected_updated_at` 为实际合同的 `updated_at`，恢复版本冲突检查。
- TypeSafe 账号选择收入「服务连接 → TypeSafe」详情，复用连接库与原绑定。修复新增连接局部刷新后保存事件丢失，以及取消选用后自定义下拉文案不更新的问题。浏览目录和配置状态只读凭据元信息，不解锁密钥；Keychain 锁定时仍能管理本地草稿和读取发布定义。
- 旧 `/settings/functions`、`openPlugin/panePlugin=functions` 链接保留为薄转发（`/api/plugins/functions` 前缀的转发已于 2026-10-26 随 W6-01 删，RAC-1020）。三项 `molis_work_v1_functions_*` 名称从系统动作合同派生 schema，走同一动作调用及原工具开关，不再伪造插件身份。已绑定 MCP 客户端保留项目上下文，判断历史不会误记到 Home。删除已无使用者的 Native grandfathered 默认开关逻辑。
- 新增 `tests/functions-authoring-actions.test.ts`：真实 HTTP/Host/SQLite 覆盖 Choice/Noul/Score 创建到发布、发布后动态发现、内部/HTTP 同源、权限和输入拒绝、CAS、不可变发布、样本、删除、重启保留、按项目记录 MCP 调用，以及配合/忽略取消的供应商。未知规则页、旧 URL 转发和移除旧视图的回归进入 `capabilities-page.test.ts`。供应商使用本地 fixture，没有真实 TypeSafe 请求。
- 主回归 97 项通过：`node --import tsx --test --test-concurrency=1 tests/functions-authoring-actions.test.ts tests/functions-plugin.test.ts tests/functions-system-capability.test.ts tests/plugin-outbound-mcp.test.ts tests/system-functions-actions.test.ts tests/capabilities-page.test.ts tests/connectors-settings-behaviors.test.ts tests/experiments-http.test.ts tests/experiments-plugin.test.ts tests/secret-store-keychain-retry.test.ts`。包含官方 MCP SDK stdio 集成的既有回归与 6 项隔离 Keychain 回归。连接面板后续调整的 32 项定向回归再次通过。
- `tests/functions-draft-retention.test.ts` 的真实 Chrome 草稿保留/快捷键回归通过；`tests/workbench-registration-boundaries.test.mjs` 两项通过。`personal-plugins-review-fixes.test.ts` 中 functions、客户端路径及 CAS 的四项定向回归通过。该旧审计文件全跑仍有四项未处理失败：purge 名单新增 context-onboarding、Schedule 目录断言、Pages Artifact 测试缺项目注入口、Workbench pack 覆盖名单差异；未放宽这些断言来制造全绿。
- Functions 模块、Design System、Workbench、Local Host 构建和根 `pnpm exec tsc --noEmit -p tsconfig.json` 通过，修改范围 diff 检查与 Impeccable detector 通过。包生成清单补齐 Kernel 已使用的 AJV 依赖；`check-package-boundaries.mjs` 仍有两项 App 直接依赖 SQLite：`connector-connection-store.ts`、`web-connector-connections.ts`，本轮未处理，不宣称全仓边界检查通过。
- 真实浏览器 1440×950、390×844 验证：旧标签视图恢复不出现空白 Functions 页；能力库 → 创建 → 自动保存 → 试跑 → 发布 → 重载 → 动态发现；缺失规则反馈；旧设置链接 → TypeSafe → 新增模拟账号 → 选用 → 重载 → 取消选用且账号保留。编辑、发布、连接选择截图和可复现脚本位于 `.impeccable/review/action-service/`（`rules-browser-qa.cjs`、`connections-browser-qa.cjs`）。系统岛、目录、连接详情、MCP 开关、判断历史的既有桌面/窄屏流程也已回归；无浏览器 JS 错误和文档横向溢出。所有数据在临时 Home，凭据为本地 fixture，未访问真实账号；用户本人验收未进行。

接续工作：通用场景绑定编辑仍未替换旧函数用途；Feed/Home 判断、首页动作与“说一句”、全部其余插件、工作流合同映射与实际执行、Character/Agent、独立于页面的激活、外部 MCP 导入和客户端授权、完整调用记录与恢复均未完成。连接撤销后规则选用表单还需要更明确地展示保留的失效引用。必须继续逐项迁移，不以本段完成替代全量目标。目标保持执行中。

2026-09-25 工作流内容站接入与旧分发清理证据：

- 新增明确的内容交接协议 v1，以及 SDK `defineWorkflowContentActions` / `bindWorkflowContentHandlers`。规范定义包含列表、读取、接收、可选空白创建的输入输出、权限和语义类型；注册期拒绝伪报协议但 schema 不一致的动作。协议只覆盖内容交接，不推断任意业务 schema 的语义。
- Feed、Inbox、Pages、灵光各自提供 `content-actions.ts`，现有工作流读写实现从 Host 归还插件。Host 的 `content-action-providers.ts` 只提供原 Feed/Pages/Lingguang 数据 owner；Inbox 读取或接收 Feed 内容也调用共同动作客户端。能力随项目 Runtime 注册，工作流交接产生的 Inbox 事件仍实际消费统一判断场景，自动执行身份为 workflow，不能调用仅允许 user 的判断。
- 删除 `workflows-native-plugin-http.ts` 的 SUPPORTED / BLANK_START、内置插件目录依赖及全部按插件 ID 分发的业务代码。该文件仅保留 41 行 HTTP/可信客户端/模型组合。`content-client.ts` 依据角色和合同发现站点，不包含任何内置插件 ID；已实现的内容选择取消前 60 条截断，项目授权继续由 Host 和原存储 owner 控制。能力库的本地用户权限补齐这四项原生内容服务，不自动授予未知插件权限。
- 保存及开始实例固定提供方、能力 ID 和版本；旧链仍能读取，旧流程开始时固定实例引用，旧进行中实例在交接前固定尚未固定的引用。撤回或升级不会替换保存的旧版本。执行核心新增可选提供方约束，拒绝注册变化后同能力 ID 被另一提供方接管的调用。保持原工作流/实例 SQLite 表和原插件业务数据；无第二份状态库。
- API 为流程/实例投影真实站点可用性；界面保留失效引用、显示原因并禁止开始/推进。失效站点使用警示图标与下方说明，窄屏不被长消息撑宽；模板转换在产品中不再标为 Function，存量 `kind: function` 存储值继续兼容。模板、AI、人工交接及已完成的历史仍按原语义工作。
- `tests/workflow-content-actions.test.ts` 通过正式 Plugin Runtime 注册宿主不知道 ID 的草稿插件，以真实 SQLite 验证自动发现、保存、模板交接、实际写入、MCP 读回、项目隔离、缺权限无写入、旧链/旧运行实例固定引用、重新打开存储、正式升级撤回旧版本、保留失效引用，以及提供方变化拒绝执行。此新增 MCP 用协议适配测试；官方 SDK 的跨进程 stdio 路径由下列既有回归覆盖，不声称这一个 fixture 完成了最终客户端授权产品。
- `tests/workflows-plugin.test.ts` 改用实际 MolisWorkLocalHost 组合根，验证 Feed → Inbox → Pages → 灵光真实存储交接、手工/AI/模板、配置修订和历史；新增 65 篇当前项目文稿完整可选、其他项目文稿不混入的验证。AI 和上游内容仍使用本地 fixture。
- 主回归 61 项通过：`node --import tsx --test --test-concurrency=1 tests/workflow-content-actions.test.ts tests/workflows-plugin.test.ts tests/inbox-automatic-scenes.test.ts tests/local-host-actions.test.ts tests/action-service.test.ts tests/plugin-manifest.test.ts tests/inbox-action-scenes.test.ts tests/inbox-plugin.test.ts tests/inbox-native-plugin.test.ts tests/capabilities-page.test.ts tests/plugin-runtime-integration.test.ts tests/action-mcp-stdio.test.ts`。后续收紧内容引用合同并扩充旧实例/完整列表场景后，动作/Host/自动入箱回归仍通过；新增旧实例用例初次未填写正文，正确被模板空内容校验拒绝，补齐真实编辑操作后，工作流两文件 9 项全部通过。Workbench 注册边界 2 项通过。
- Contracts、Kernel、SDK、四个内容插件、Workflows、Workbench、Local Host 构建和根 `pnpm exec tsc --noEmit -p tsconfig.json` 通过。全仓包边界检查仍为原来的两项 App 直接依赖 SQLite：`connector-connection-store.ts`、`web-connector-connections.ts`，本轮没有新增边界错误，没有为全绿加豁免。
- Chrome 在 1440×950、390×844 真实操作：进入工作流程 → 目录选 Feed/Pages → 配模板 → 选材料 → 交接 → 在嵌入 Pages 中读取实际正文 → 重载；另用隔离存储中的旧版本引用验证说明可见、开始按钮禁用、数据引用保留。修正测试入口为真正的工作流导航、等待目标 Pages frame 正文和页面动画结束后截图，避免把尚未加载的空 frame 或过渡模糊态当成结果。最终截图已视觉检查，无文档横向溢出、无 JS 错误；用户本人验收未进行。可复现脚本为 `.impeccable/review/action-service/workflows-browser-qa.cjs`、`workflow-stale-fixture.mts`，截图 `workflow-{config,done,unavailable}-{desktop,mobile}.png`。使用临时 Home 与本地模型 fixture，没有访问真实外部账号。

仍需继续：任意输入输出的工作流步骤及字段映射、工作流管理能力注册、内容写入成功但保存流程进度前中断的恢复与防重复、通用使用绑定编辑与完整引用反查、未知内容插件无 UI 时的通用结果呈现、场景后台执行入口兼容性提示、所有其余插件/API/MCP 消费迁移、Feed/Home 与“说一句”、Character/Agent、独立激活、外部 MCP 导入和完整授权、统一调用记录。现有迁移清单仍有大量未完成项；本轮内容站闭环不等于整体内部完整。目标保持执行中。

2026-09-25 灵光全部业务 API、对话及实际消费者迁移证据：

- 插件新增 8 项业务动作：list、get、create、update、discard、conversation.open/get/message。Manifest 声明权限与合同，原项目 Runtime 在打开时注册；不依赖打开灵光页面。工作流的 4 项内容协议处理器转调同一业务动作，保留可信 caller 与能力范围限制，不再直接读写 Store。
- 原 8 条 HTTP 路由改为动作客户端的薄参数适配；项目路由由 Host 绑定身份，旧全局 URL 必须先从真实项目目录解析项目。query/body 与绑定项目不一致时拒绝。移除 personal-native-plugin-http 的旧灵光分发与 HTTP 自行打开 Store/调用模型的旁路。原表、ID 和历史不迁出、不删除。
- 对话先读取并验证当前项目的会话、所选灵光和正文，再调用文字模型；prompt 包含真实材料与非 stub 历史。成功原子保存 user/assistant；取消、模型错误、空结果和生成期间材料/会话变化不保存半轮或过期回复。旧 stub 行仍读取并标作本地记录，删除新的占位回复生成与无使用者 STUB_PREFIX 导出。修改和会话创建置于事务，批量丢弃全量校验后才写入，编辑支持 expected_updated_at。
- 工作台改用 host.route 的项目 API，不再由请求正文选择项目。保存串行执行且防覆盖，保存失败阻止切换/开启对话；发送期间禁用按钮并防止重复提交，失败保留输入，迟到的回复不清空新草稿或覆盖其他会话。分发候选中的旧 Functions 名称改成判断规则，本轮仍仅复制正文。同步插件 README。
- `tests/lingguang-actions.test.ts` 以真实 Host/SQLite/HTTP 验证目录自动注册、身份/权限/schema 拒绝、内容协议不能绕过业务动作授权、CAS、批量原子性、原库重开、旧 stub 保留、模型获得所选灵光与历史、非法会话不调用模型、无模型/失败/空结果/忽略取消的晚回复，以及另一连接修改/丢弃/追加消息时拒绝过期结果。
- `tests/lingguang-mcp.test.ts` 通过官方 SDK 和独立 stdio 进程连接真实 Host 组合根，验证查询、创建、修改、对话、丢弃、两个项目隔离、只读客户端拒绝写入、伪造项目参数拒绝及进程重启后历史一致。fixture launcher 明确提供测试授权和本地模型回复，不冒充生产 LocalMcpServer 的全量客户端授权已经完成。
- 主回归 58 项通过：`node --import tsx --test --test-concurrency=1 tests/lingguang-actions.test.ts tests/lingguang-plugin.test.ts tests/lingguang-mcp.test.ts tests/workflows-plugin.test.ts tests/workflow-content-actions.test.ts tests/local-host-actions.test.ts tests/action-service.test.ts tests/plugin-manifest.test.ts tests/capabilities-page.test.ts tests/inbox-automatic-scenes.test.ts`。清理旧灵光测试中已经过时的 Functions 名单、Assistant 占位及 stub 断言，保留原有实际数据和 UI 检查；新行为另有集成验证。
- `tests/lingguang-plugin.e2e.test.ts` 3 项真实 Chrome 操作通过：桌面原主路径、1440×950 和 390×844 下模型失败保留输入、防重复发送、新草稿不被晚回复清空、保存冲突阻止进入对话。fixture 新增可选 Host completion 注入，未影响默认调用者；其点击助手在等待布局后重新定位节点，避免列表刷新时点击已脱离 DOM 的旧节点。截图 `lingguang-dialogue-{1440,390}.png` 位于 `.impeccable/review/action-service/` 并已视觉检查，无横向溢出。模型为确定性本地 fixture，没有调用真实外部服务；用户本人验收未进行。
- Contracts、Lingguang、Workbench、Local Host 构建和根 tsc 通过；Workbench 注册边界 2 项通过；此次修改范围 diff 检查通过。包边界检查仍有此前两项 App 直接引用 SQLite（connector-connection-store.ts、web-connector-connections.ts），未加豁免，未宣称全仓通过。

继续工作与未完成项：`host-complete-text.ts` 当前仍读取旧的 model:text:api_key/环境变量，未使用全局模型设置中的 catalog.models 与连接选择。这是实际产品配置一致性缺口，下一步应复用现有模型选择与连接事实修复，并验证断连、撤权、重启；不要把本轮注入模型的成功当成该缺口完成。生产 MCP 全量授权、原生插件完整生命周期治理、通用工作流输入输出映射、使用绑定编辑、Feed/Home 与“说一句”、Character/Agent、所有其余插件及统一调用记录等仍未完成。整体 Goal 保持执行中。

2026-09-25 文字模型配置、连接及失效状态收敛证据：

- 修复上一段明确记录的配置断点：`host-complete-text.ts` 使用现有 catalog.models 的供应商、启用模型、API 格式、地址、缓存偏好与 credential_ref。`configured-models.ts` 复用原 ModelProviderStore、目录所有权检查及连接库；未新建模型注册表或偏好文件。无明确选择时沿用原 Store 的供应商顺序，明确选择失效时不回退到其他供应商。
- 能力发现、completion 创建与 Jelly 设置读取只检查元数据及密文存在，不解锁密钥。真实执行才读取原凭据，并在发送前与返回后核对模型/连接状态；断连、停用、换模型、删除供应商或生成期间配置变化时拒绝提交结果。现有凭据引用绑定了服务地址时，地址不匹配不能读取/发送该密钥。取消在发送前、网络返回后及正文读取后重新检查。
- Lingguang、Pages/个人插件、Inbox 写作、工作流 AI、Assistant 与 Jelly 共用补全解析器。已知 Home 的入口显式传入 homeDirectory，不借用其他项目/账号的环境上下文。Jelly 删除自己的目录打开、供应商自动回退及将解密密钥塞进模拟环境变量的适配；保留原 preferences.json 的已选身份，失效时不能保存为成功选择，页面显示恢复或重选提示。
- 旧环境变量/`model:text:api_key` 保留为尚无目录配置时的兼容来源，共用同一 HTTP 请求执行器。有目录记录、已选模型失效、或已撤销的旧连接均不能通过这个分支自动恢复。旧数据和原凭据引用未删除。配置中的完整 `/v1/messages`、`/chat/completions` 地址不重复追加路径；Anthropic 缓存偏好转换为原协议支持的 cache_control，OpenAI 使用其原接口格式。
- 全局模型页保留已断开的选中账号及缺失引用，并标记不可用，不再把选择过滤成空白。设置说明同步文字生成在配置变化时需重新生成。清理原测试对密码输入框的过时断言，改为验证连接选项、失效引用保留和不输出密钥。
- `tests/host-configured-text.test.ts` 10 项：真实设置 HTTP 创建连接与供应商后，经生产 Host 和灵光动作请求本机模型 HTTP 服务；验证返回与实际对话数据一致、断连后目录/执行不可用、在途断连/停用/换模型/删除不保存半轮对话、读取目录不解密、Jelly 明确选择不换账号、重新授权恢复、双 Home 凭据隔离、重开读取、地址绑定、缓存/协议、取消以及旧密钥兼容和撤销。上游为本地确定性 HTTP 服务，无外部真实账号或计费请求。
- 主回归 57 项通过：`node --import tsx --test --test-concurrency=1 tests/host-configured-text.test.ts tests/model-provider-store.test.ts tests/model-settings-http.test.ts tests/model-providers.test.ts tests/jelly-model.test.ts tests/lingguang-actions.test.ts tests/workflows-plugin.test.ts tests/feed-inbox-pages-loop.test.ts tests/capabilities-page.test.ts`。后续保存校验与界面补充的定向集成和浏览器 17 项通过，最终界面/模型页 11 项通过。Jelly、Workbench、Local Host 构建及根 tsc 通过；Workbench 注册边界 2 项通过。包边界仍为两项已知 App 直接 SQLite 引用，未新增豁免。
- `tests/configured-text.e2e.test.ts` 在 1440×950、390×844 实操：灵光通过真实配置及 HTTP 模型取得回复 → Jelly 已选账号断连仍保留 → 原选择保存被拒 → 用户重选账号 → 后续真实调用使用新模型 → 全局模型页仍显示原已断开的账号。没有绕过产品 Host 注入 completion。截图 `model-disconnected-*`、`model-connection-retained-*` 位于 `.impeccable/review/action-service/`，已视觉检查；用户本人验收尚未进行。

整体未完成：本轮只收敛文字补全的配置/执行，不代表 Jelly 等全部业务 API 已注册。继续迁移清单中的 Pages、Jelly 等存量插件与消费者，以及通用工作流字段映射/运行恢复、使用绑定与反查、Feed/Home 和“说一句”、Character/Agent、双向 MCP 及生产授权、原生插件生命周期和统一调用记录。Goal 保持执行中。

文字模型收尾核对：Assistant 的计划函数移除隐式环境默认模型，只消费 Host 已绑定的 completion，防止显式 Home 无可用模型时又落回其他环境。对应双 Home 与 Assistant/Feed/Inbox 回归 16 项通过；旧连接即使重新出现密文字节，断开标记仍阻止发现和执行。窄屏截图等待实际连接字段可见后拍摄，避免把自定义下拉框隐藏的原生 select 当作可见目标。


2026-09-25 Pages 业务动作、HTTP / 内容协议 / 旧 MCP 迁移证据：

- Pages 插件声明并实现 14 项业务动作：list/get/create/update/delete、templates、folders.create/update/delete、import.preview/import、ai/promote/extract。原项目 Runtime 打开时注册，Host 仅组合原 PagesStore、共享文字模型及原 Artifact owner；发布 actor 来自可信 caller。4 项工作流内容协议转调这些业务动作，保留 caller、权限和能力范围限制，不再直接读写 Store。
- HTTP 的 14 条路由改成绑定动作客户端的薄参数适配。项目路由绑定 canonical project_id；旧全局 URL 从真实项目目录解析，query/body（包括重复 query 项）不符时拒绝。移除个人插件分发器的 Pages Store/模型/发布旁路。保留原 `/api/pages` 和 `/api/plugins/pages` 地址及导入的 15 MB HTTP 限额；业务导入仍遵守原文件限制，未知的伪造正文不能进入导入合同。
- 旧 MCP 八个工具名的描述/输入合同从动作定义派生，执行转调 Host 动作客户端。旧 list 通过同一模板查询补齐原响应；旧 translate_new 组合 AI 与创建动作保留新建语义。删除 MCP 的直接 Store 分发、重复提取/发布/参数解析，以及始终返回 stub 的 AI 实现。旧工具开关仍只授予相应旧业务合同所需权限，未替代尚待完成的新动作生产授权产品。
- 文档更新支持 expected_version，并以 SQL 条件更新防止并发覆盖。编辑器保存队列使用实际服务器版本，冲突保留草稿、阻止离开。AI 先保存当前草稿、前后验证文档和本地编辑版本；取消、空回复、模型失败及并发修改/删除均拒绝候选，不写占位文稿。旧数据不删除。提取源文档和全部知识页在一次事务中提交；删除文件夹与文档移回根目录也一并提交，更新文档版本。
- 浏览器实操发现旧界面在 debounce 期间仍显示“已保存”，刷新可能丢失刚采用的候选。修复为输入后立即“保存中”，成功才“已保存”，失败显示“保存失败”。测试核对持久化正文后再刷新，而非仅等待旧标签。
- `tests/pages-actions.test.ts` 9 项以真实 Host/SQLite 验证注册、调用者/项目/权限/schema、工作流不能通过嵌套调用绕过能力范围、条件保存、原库重开、Legacy MCP 读回、实际 Artifact 结果，以及 AI 缺模型/错误/空结果/取消/并发编辑或删除。用原 SQLite 的故障触发器验证提取插入失败时源文档也回滚，重试不重复创建。
- `tests/pages-mcp.test.ts` 用官方 SDK 和独立 stdio 进程操作真实 Host：双项目隔离、只读拒写、输入不能伪造项目、完整 14 项目录、创建/查询/修改/AI、文件预览/导入/重复请求及进程重启读回，结果与原文档库一致。模型和客户端 grants 使用明确 fixture，不冒充生产全量授权完成。
- 主 Pages 回归 147 项通过（pages-actions、pages-mcp、pages-import、pages-plugin、pages-project-binding）；最终保存状态修复后，pages-actions / pages-draft-race / pages-import / pages-plugin 146 项通过。相邻导入、灵光、工作流、能力页和旧 MCP 回归 67 项通过。旧审计文件中 Pages / Promote / Manifest / 生产 MCP 发布定向 4 项通过。该旧审计文件其余三个已知失败仍为 purge context-onboarding 名单、Schedule 目录断言、Workbench pack 覆盖名单，未修改无关断言来宣称全仓通过。
- `tests/pages-actions.e2e.test.ts` 在 Chrome 1440×950、390×844 实操新建、编辑、AI 候选（确认前无写入）、确认后保存、刷新重开、另一连接编辑后冲突保留草稿与阻止返回，2 项通过。初次测试误用不生效的 openPlugin 单独参数及不存在的 data-pages-id，已改为真实导航和实际文档行选择器。截图 `.impeccable/review/action-service/pages-actions-{1440,390}.png` 已视觉检查，无横向溢出。使用隔离 Home 和本地模型 fixture；用户本人验收未进行。
- Pages、Workbench、Local Host 构建与根 tsc 通过，Workbench 注册边界 2 项通过。包边界检查仍只有原来的两个 App 直接 SQLite 引用（connector-connection-store.ts、web-connector-connections.ts）；未新增豁免。相关修改 diff 检查通过，无 commit / PR。

继续迁移，不标记 Pages 或整体完成：`inbox-pages.ts` 的生成/结果查询和 `context-onboarding-service.ts` 的材料采纳仍直接使用 PagesStore。前者仍以 board_id 分区，后者使用 canonical project_id；必须核对旧文稿/生成历史的兼容映射后收敛，不机械替换存储键。`promote.ts` 的跨库发布已共用执行路径，但 Artifact 成功而 Pages 回写前中断的恢复仍需实现与验证。之后继续其余插件、通用工作流字段映射与恢复、使用绑定、Feed/Home 和“说一句”、Character/Agent、双向 MCP 及生产授权、生命周期与统一调用记录。Goal 保持执行中。

2026-09-25 Pages 跨模块迁移、依赖可用性及旧数据恢复证据：

- Pages 在原 14 项业务动作上增加 documents.import、generate、generations.list/get。Inbox 插件拥有材料选择与原意图 hash 生成，调用 Pages 读写；项目上下文采纳使用同一动作客户端批量保存来源与摘要。删除 apps/local-host/src/inbox-pages.ts；Host 对 PagesStore 的直接使用仅留在 Pages 提供方组合根，不在业务消费者另建执行路径。原 HTTP 地址、生成请求身份、材料快照及已确认的采纳意图保留。
- 生成器改为短 Store 操作，模型等待期间不持有数据库。取消及失败保留原请求/快照，成功重试保留用户后续编辑。beginGeneration 使用单调递增的运行身份，failGeneration 以状态和运行身份原子更新；同一毫秒重试、过期任务晚返回不能覆盖新运行或复活已迁移的旧任务。
- 旧 board_id 分区仅在现有 catalog 明确证明唯一归属、数据库路径匹配时，事务迁移文档、文件夹、导入请求及生成记录到 canonical project_id。保留 ID、hash、快照、编辑和 Artifact 引用，仅转换精确的旧 Inbox 链接。归属不明、请求冲突和未过期运行拒绝迁移并保留原数据；过期运行变成可重试失败。已验证旧请求重试、重启、外项目隔离和冲突时不丢失数据。
- 新增通用 action.required_actions 引用合同。Kernel 在原 registry 内递归检查所需版本、提供方、权限、作用域及同步可用性；Host 补充异步生命周期和场景依赖，排队执行前再次校验。循环依赖明确不可用；没有新增持久目录或 Host 插件名单。Inbox 声明真实 Pages 依赖，删除其重复的模型可用性判断；无模型时生成不可用但历史仍可读。SDK、Pages 和 Inbox 文档已同步。
- 主回归 61 项通过：action-service、action-dependencies、local-host-actions、pages-actions、pages-cross-module、context-onboarding、pages-mcp、inbox-plugin、inbox-action-scenes、feed-inbox-pages-loop。官方 MCP SDK 通过独立 stdio 进程真实导入、生成、查询快照/记录和文档，跨项目隔离，重启重试保留手工编辑。授权使用明确 fixture，不代表生产客户端授权管理已完成。
- 补充的生成竞态/过期迁移与浏览器验证 10 项通过；邻接 Runtime、Manifest、MCP、工作流和 Inbox 自动事件回归 30 项通过。删除 Inbox 重复模型检查后最终定向 24 项通过：action-dependencies、host-configured-text、inbox-pages-actions.e2e、inbox-plugin、pages-cross-module（包含新增无模型历史读取）。这些是部分重叠的测试组，不累计为独立测试总数。
- 真实 Chrome 在 1440×950、390×844 从 Inbox 选择真实存储材料，填写标题/要求，首次生成故障后刷新恢复，再次生成进入 Pages，修改标题并核对实际 SQLite。事项仍保持 open，文稿正文包含原边界与 canonical 项目链接。screenshots：.impeccable/review/action-service/inbox-pages-actions-{1440,390}.png；已逐张视觉检查，无文档横向溢出。测试使用隔离 Home 和模型替身；用户本人验收未进行。
- Contracts、Kernel、Inbox、Local Host 构建与根 tsc 通过。Workbench 注册边界 2 项通过；包边界仍只有 connector-connection-store.ts、web-connector-connections.ts 两项既存 App 直接 SQLite 引用，未新增豁免。受影响已跟踪文件 diff 检查通过，无 commit / PR。

仍未完成：Pages Artifact 已发布而文稿回写前中断的恢复；其余存量插件全量业务/消费者迁移、通用工作流输入映射与运行恢复、通用使用绑定编辑及反查、Feed/Home 与“说一句”、Character/Agent、双向 MCP 和生产授权、独立于页面的生命周期、全量调用记录及最终旧实现清理。此段只关闭 Pages 跨模块生成/采纳与通用依赖可用性的子链，不能证明 Pages 或整体已达内部完整。完整 Goal 保持执行中。

2026-09-25 Pages 发布中断恢复与重复客户端代码清理证据：

- 原 pages 表增加可空 publication_pending_json，保存本次发布的标题、正文、Goal、源文档版本、Artifact 版本及可信发起者。事务提交快照后才调用原 Artifact owner；关联更新与快照清除在同一文稿事务提交。没有新建 Artifact 目录、通用任务日志或第二套发布业务。源文稿的后续正文、标题及后续 Goal 编辑保留，不能被恢复快照覆盖。
- Host 的读取适配核对原 Artifact 项目、owner、Pages 类型/schema、生产者和文稿身份；已有 Artifact 按原内容恢复关联，不重新注册或修改生命周期。旧代码未保存快照但已提交 Artifact 时也可恢复。未完成请求不允许其他 actor 接管或换 Goal；内容冲突保留两边记录并明确拒绝。项目分区迁移仅改变可编辑文稿链接，待恢复的已发布快照保持原样。
- pages.promote 增加可选 expected_version 和 recovered 结果。客户端保存当前草稿后携带最新版本，过期请求拒绝新增 Artifact；旧客户端不传该参数时保留明确再次发布新增一版的原语义。列表和编辑器的两份发布 fetch 逻辑合并为一个入口，同一页面防重复提交，错误后读取实际恢复状态，保留在途编辑。publication_pending 从原库派生，界面提供“继续保存上次成果”及快照说明；恢复完成后说明当前编辑仍保留。
- tests/pages-publication.test.ts 六项通过：Artifact 写入前失败、Artifact 已写入但关联前失败、关联写入后清除快照失败（整段回滚）、旧版无快照恢复、项目分区迁移保持原 Artifact 内容、冲突拒绝。使用实际 Host/SQLite 和故障触发器，覆盖重启、后续编辑、owner 隔离、过期点击拒绝新增及下一次有意发布第 2 版。
- 初始 pages-actions、pages-project-binding、pages-draft-race 和 publication 定向 17 项通过；补充故障后的主 Pages 回归 142 项通过（pages-publication、pages-plugin、pages-cross-module、pages-actions.e2e）；相邻 context-onboarding、inbox-pages-actions.e2e、workflows-plugin、pages-import 32 项通过。测试组部分重叠，不累计成独立总数。
- 官方 SDK stdio MCP 实操使用原项目 Runtime：制造 Artifact 成功而文稿回写失败，查询 pending 状态、继续编辑、关闭并重新连接进程、恢复同一版本并与原 PagesStore 核对。测试授予明确 fixture 权限；不代表生产 MCP 授权管理完成。
- tests/pages-publication.e2e.test.ts 在真实 Chrome 1440×950、390×844 完成新建/编辑、发布故障、刷新后的持久恢复提示、继续编辑、恢复发布，并核对原 Artifact 内容及仅一个版本。MCP 与本浏览器文件共 3 项通过。四张截图 .impeccable/review/action-service/pages-publication-{pending,recovered}-{1440,390}.png 已逐张视觉检查，无文档横向溢出。测试使用隔离 Home，未访问外部账号；用户本人验收未进行。
- Contracts、Pages、Local Host、Workbench 构建和根 tsc 通过，相关 diff 检查通过。Workbench 注册边界 2 项通过；包边界仍仅有 connector-connection-store.ts / web-connector-connections.ts 两处既存 App 直接 SQLite 引用，未新增豁免。无 commit / PR。

下一项实际盘点：Jelly 的 calendar.ts/content.ts 有 37 种业务命令，加 Store 的 undo、redo、workspace.import 共 40 种写入；原 mcp.ts 导出 13 个工具。其 routes.ts 包含列表、日期查询、进展、整体/笔记导出、命令、预览及 AI；Host 还承载 material/material-reread/source、model-settings 和 NDJSON 进度。数据为 Home 级 singleton + 原 revision/history/previews，不能按项目拆成新库。迁移必须保留所有命令合同、确认预览、来源指纹、取消/进度和模型失效状态，将现有 HTTP、MCP 与产品消费者一起转到 Home 动作服务；不能只注册一个任意 command 执行器或只搬 MCP 已暴露的日历子集。本轮仅完成盘点，尚未修改 Jelly 的业务实现。

整体仍未完成：Jelly 及其余插件全量迁移、通用工作流映射/恢复、场景绑定编辑/反查、Feed/Home 与“说一句”、Character/Agent、外部 MCP 导入与生产授权、独立于页面的生命周期、完整调用记录和最终旧实现清理。Pages 的业务与恢复证据不能替代这些范围；Goal 保持执行中。
