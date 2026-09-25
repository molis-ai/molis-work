# 全量迁移与验证

目标：内部完整。状态：执行中。当前工作树 main，开始时已有 381 个已跟踪修改和 65 个未跟踪项；不重置这些成果。

## 当前阶段

正式 stdio MCP 的公共动作现经本机通道使用常驻 Web Host；目录、逐客户端授权和业务执行仍来自原服务，不维护第二份动作名单。判断与六组 Native 插件旧名称也已共用该授权和执行，旧开关不再自行授予权限。未知动作已通过真实产品 launcher 跨进程发现及写入，服务离线保留上下文工具。旧平台工具尚有本地路径，Files/Git 对外成果归属未定；这些仍属于未完成范围。具体边界和证据见末尾各次迁移记录。

Goals 已注册 45 项项目动作和 2 项 Home 个人规划动作，覆盖目录/创建/便笺、状态/历史、工作写入与回执、用户决定、项目规划、长期说明、生命周期、目标树、关系及项目规则。40 项项目动作及 Home 目录查询按授权供 MCP 使用，个人规划保存、事件决定、结构审批及三项关系/规则直接写入仅接受受保护 user 上下文。typed、Web、Coding 对应读取与进展、项目恢复目录、Work/Agent 说明、生命周期和结构提案已接通；29 个旧 MCP 名称使用精确动作授权和常驻 Host，管理 event_decide/goal_tree_decide 保留用户专用薄适配。Home 个人方法目录/保存已接入共同动作；所选目标正文已共用动作，页面完整目录组合仍待继续；连接摘要已遵守精确动作授权与常驻服务，Goals 整体尚未完成。

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

现有四项工作区能力已补全 schema 与描述，旧内部调用与 MCP 共用注册及校验，删除重复参数检查：`projects.workspaces.list.v1`、`projects.workspace.read.v1`、`projects.settings.workspaces.read.v1`、`projects.settings.browsing-workspace.read.v1`。Files、Git、Coding、Workspace、Plugin Builder 原有消费者继续通过同一 typed 入口调用。

生产 LocalMcpServer 已接受共同目录的动作工具、返回结构化结果，并实时读取能力与工具开关。Native MCP 发布 Pages/Form/Dataset/PPT Artifact 已改用 Host 的项目实例，清除了自行 new LocalProjectDatabase / GoalProjectApplication 的旁路。旧平台工具目录及 Native MCP 适配表仍在迁移期并存，尚未清除。

Inbox 七项业务 API 和已发布判断已接入共同调用（下述证据），Home 已支持无项目的系统判断服务。Inbox 显式判断已接入动态消费场景；Inbox 自动入箱消费者也已接入；下一段继续迁移 Feed/Home 判断和外部 MCP，逐项迁移全部插件，并补全不依赖页面的插件启动及外部客户端授权配置。生产 MCP 新动作现已读取持久化的精确授权，并有真实管理界面；旧 Functions 名称也已共用这些授权和常驻执行，原开关不再单独授予调用权。旧工作流程及函数场景仍使用固定名单；各已接线插件仍需随通用消费、生产授权和生命周期完成最终闭环。

## 存量插件盘点

下列清单来自所有插件目录（包括未启用、隐藏和历史插件）。这是迁移入口清单，不把声明文件存在当作能力清单完整或迁移完成。每项需要继续核对全部对外 API、消费方及真实调用。

| 插件 | 原入口 | 目标位置 | 消费方 | 状态 |
| --- | --- | --- | --- | --- |
| plugins/native/alchemist | Studio 41 个业务 HTTP/SSE/导出入口、3 项旧演示只读入口 | 44 项插件自有合同 → 生产 Host，复用原 Studio services/repositories/jobs | HTTP 经 Host Kernel；标准 MCP 读取真实持久授权 | 44 项业务、Host/actor、原数据和桌面/窄屏通过；浏览器授权后标准 MCP 真实写入及撤销已验证；全平台生命周期仍待完成 |
| plugins/native/artifacts | 版本目录/读取/导出、文件/外部导入、来源状态、Goal 引用、项目文件、Runtime SDK 读写 | [src/actions.ts](../../plugins/native/artifacts/src/actions.ts)、[src/plugin-client.ts](../../plugins/native/artifacts/src/plugin-client.ts) → 原 Artifact/Context Ledger/Evidence owner | HTTP、Goal 阅读、项目引用、正式 MCP 的 8 项与 Runtime 同步 SDK 均共用 Kernel；Inputs/Outputs、Characters、Shelf、Coding 保留同步合同 | 公共及受限 SDK 接线已验证；显式来源账号选择和系统整体治理继续 |
| plugins/native/characters | [src/manifest.ts](../../plugins/native/characters/src/manifest.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/native/coding | [src/manifest.ts](../../plugins/native/coding/src/manifest.ts), [src/routes.ts](../../plugins/native/coding/src/routes.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/native/cognia | 原知识库 HTTP、两个只读 MCP、首次使用材料导入 | [src/actions.ts](../../plugins/native/cognia/src/actions.ts) → Home 注册；原 Store 与 Prologue owner | HTTP/页面、旧 MCP、标准 MCP、上下文来源扫描及导入/读取共用动作 | 22 项业务接线与 SDK 本机 HTTP 已验证；通用工作流/用途配置、生产 MCP 授权与生命周期仍待完成 |
| plugins/native/dataset | 原 HTTP、12 个旧 MCP、工作台编辑/CSV/版本/发布 | [src/actions.ts](../../plugins/native/dataset/src/actions.ts) → 项目注册，原 Store/Artifact owner | HTTP、编辑器、旧名与标准 MCP 共用动作；独立 AI 入口 | 13 项业务与桌面/窄屏实操通过；通用工作流/用途、生产授权及生命周期仍随整体推进 |
| plugins/native/diff | [src/actions.ts](../../plugins/native/diff/src/actions.ts) | 固定差异读取、纯文本比较 → Runtime 自动注册 | 原 HTTP 薄转发、独立标准 MCP；嵌入可用性由父插件声明 | 业务查询已迁移并验证；通用配置消费待系统收尾 |
| plugins/native/experiments | [src/manifest.ts](../../plugins/native/experiments/src/manifest.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/native/feed | [src/manifest.ts](../../plugins/native/feed/src/manifest.ts), [src/routes.ts](../../plugins/native/feed/src/routes.ts) | 插件自有能力定义 → 共同注册/调用 | Inbox 创建事件转统一场景；内容列表/读取/接收和工作流消费已接通；其他 API 及 feed.capture 待迁移 | 部分完成 |
| plugins/native/files | [src/actions.ts](../../plugins/native/files/src/actions.ts) | 四项浏览/读取/快照操作 → Runtime 自动注册 | HTTP 薄转发与 Host 动作共用；保留原个人 owner | 部分：现有路径已迁移；跨主体 SDK、对外读写仍待完成 |
| plugins/native/form | 原 HTTP、10 个旧 MCP、工作台编辑/填写/结果/发布 | [src/actions.ts](../../plugins/native/form/src/actions.ts) → 项目注册，原 Store/Artifact owner | HTTP、工作台、旧名与标准 MCP 共用动作；独立 AI 入口 | 11 项业务与桌面/窄屏实操通过；通用工作流/用途、生产授权及生命周期仍随整体推进 |
| 原 plugins/native/functions（已移除） | 原 Manifest、Workbench contribution、HTTP/MCP 导出 | [系统动作](../../modules/functions/src/actions.ts)、[管理动作](../../modules/functions/src/authoring-actions.ts)、[编辑器](../../apps/workbench/src/functions/README.md) | 编辑器、HTTP、内部客户端、旧 MCP 薄转发、动态版本动作 | 编辑/试跑/发布及包移除完成；通用用途编辑、Feed/Home 消费迁移未完成 |
| plugins/native/git | [src/action-definitions.ts](../../plugins/native/git/src/action-definitions.ts), [src/actions.ts](../../plugins/native/git/src/actions.ts) | 五项查询/选择/审阅/归档 → Runtime 自动注册 | HTTP 薄转发与 Host 动作共用；执行保留 Review 审批 | 部分：现有路径、无页面 Host 审阅与宿主依赖检查已接通；跨主体、跨进程执行方及完整参数/连接可用性仍待完成 |
| plugins/native/goals | [src/manifest.ts](../../plugins/native/goals/src/manifest.ts) | 目录/创建/便笺、状态/历史、工作写入/回执、用户决定、项目规划、长期说明、生命周期和目标树 → 插件动作与原业务 owner | typed、CLI、Coding、项目恢复目录、Work/Agent 说明、Web 与新旧 MCP 共用相应动作；审批为受保护 Web/管理渠道；Home 个人方法目录/保存共用系统动作，页面完整组合仍待迁移；连接摘要已收敛授权 | 47 项已接线，关系/规则、Home 及正文验证见末尾；插件整体部分迁移 |
| plugins/native/images | Home 服务配置、项目生成/历史/取消/删除/图片下载 HTTP | [src/actions.ts](../../plugins/native/images/src/actions.ts) → Home 注册、项目调用；原 Service/Store | 工作台/HTTP、内部客户端、标准 MCP 共用九项动作 | 九项业务、Web/MCP 并用、取消/崩溃恢复、桌面/窄屏通过；通用工作流、生产授权及全平台生命周期仍待完成 |
| plugins/native/inbox | [src/manifest.ts](../../plugins/native/inbox/src/manifest.ts), [src/routes.ts](../../plugins/native/inbox/src/routes.ts) | [src/actions.ts](../../plugins/native/inbox/src/actions.ts) → 项目 Runtime 注册 | 原 HTTP 七项业务 API、内容交接、工作区 fragment、授权动作/MCP 客户端；文稿读写转调 Pages | 部分完成；显式及 Feed 自动判断、文稿失败恢复和编辑已接通，其他消费方及真实模型待完成 |
| plugins/native/jelly | 原 HTTP、40 类命令、13 个 MCP 工具、材料读取/模型设置 | [src/actions.ts](../../plugins/native/jelly/src/actions.ts)、command-actions.ts、service-actions.ts → Home 级注册 | 原页面/HTTP、旧 MCP 别名、内部客户端和授权标准 MCP 共用动作 | 59 项能力及真实业务路径已验证；通用工作流绑定、生产 MCP 授权与完整生命周期仍随系统治理推进 |
| plugins/native/lingguang | [src/routes.ts](../../plugins/native/lingguang/src/routes.ts) 的全部 8 条 HTTP 路由、工作台、工作流内容交接 | [src/actions.ts](../../plugins/native/lingguang/src/actions.ts) + 内容协议适配 → 项目 Runtime | 项目 HTTP、旧全局 URL、工作台与工作流共用动作；官方 MCP stdio 以 fixture 授权验证业务读写/对话/重启 | 业务迁移已验证；生产 MCP 授权、模型连接统一和完整生命周期仍随系统治理推进 |
| plugins/native/pages | [src/manifest.ts](../../plugins/native/pages/src/manifest.ts), [src/mcp.ts](../../plugins/native/pages/src/mcp.ts), [src/routes.ts](../../plugins/native/pages/src/routes.ts) | [src/actions.ts](../../plugins/native/pages/src/actions.ts)、[src/content-actions.ts](../../plugins/native/pages/src/content-actions.ts) → 项目 Runtime | HTTP、内容工作流、旧 MCP、Inbox 生成/历史及上下文采纳共用动作 | 18 项业务、4 项内容适配及跨库发布恢复已验证；生产 MCP 授权和完整生命周期随系统治理继续推进 |
| plugins/native/plugin-builder | [src/manifest.ts](../../plugins/native/plugin-builder/src/manifest.ts), [src/routes.ts](../../plugins/native/plugin-builder/src/routes.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/native/ppt | 原六项 HTTP/旧 MCP、编辑器与 JSON 下载 | [src/actions.ts](../../plugins/native/ppt/src/actions.ts) → 项目注册，原 Store/Artifact owner | HTTP、编辑器、JSON 导出、旧名与标准 MCP 共用动作 | 7 项业务与桌面/窄屏实操通过；通用工作流/用途、生产授权及生命周期仍随整体推进 |
| plugins/native/schedule | [src/manifest.ts](../../plugins/native/schedule/src/manifest.ts), [src/routes.ts](../../plugins/native/schedule/src/routes.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/native/shelf | [src/manifest.ts](../../plugins/native/shelf/src/manifest.ts), [src/routes.ts](../../plugins/native/shelf/src/routes.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/native/text-stats | [src/actions.ts](../../plugins/native/text-stats/src/actions.ts) | 固定快照统计、纯文本统计 → Runtime 自动注册 | 原 HTTP 薄转发、独立标准 MCP；真实 Files 快照接线 | 业务查询已迁移并验证；通用配置消费待系统收尾 |
| plugins/native/work | [src/manifest.ts](../../plugins/native/work/src/manifest.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/native/workflows | [src/manifest.ts](../../plugins/native/workflows/src/manifest.ts), [src/routes.ts](../../plugins/native/workflows/src/routes.ts) | 内容消费者已使用共同目录和动作客户端 | 内容站接线完成；通用字段映射及自身管理 API 待迁移 | 部分完成 |
| plugins/native/workspace | [src/manifest.ts](../../plugins/native/workspace/src/manifest.ts), [src/routes.ts](../../plugins/native/workspace/src/routes.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/official-integrations/catalog | [src/index.ts](../../plugins/official-integrations/catalog/src/index.ts), [src/provider.ts](../../plugins/official-integrations/catalog/src/provider.ts), [src/catalog.ts](../../plugins/official-integrations/catalog/src/catalog.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/official-integrations/github | [src/index.ts](../../plugins/official-integrations/github/src/index.ts), [src/provider.ts](../../plugins/official-integrations/github/src/provider.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/official-integrations/gmail | [src/index.ts](../../plugins/official-integrations/gmail/src/index.ts), [src/provider.ts](../../plugins/official-integrations/gmail/src/provider.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/official-integrations/rss | [src/index.ts](../../plugins/official-integrations/rss/src/index.ts), [src/catalog.ts](../../plugins/official-integrations/rss/src/catalog.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/official-integrations/web-query | [src/index.ts](../../plugins/official-integrations/web-query/src/index.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |
| plugins/official-integrations/youtube | [src/index.ts](../../plugins/official-integrations/youtube/src/index.ts) | 插件自有能力定义 → 共同注册/调用 | 待按实际 API 核对消费方 | 未迁移 |

## 平台与消费方

| 范围 | 原入口 | 目标 | 状态 |
| --- | --- | --- | --- |
| Kernel/Host | packages/kernel/src/index.ts, apps/local-host/src/local-host.ts | 共用注册、schema、上下文与调用合同 | 已共享注册与队列；项目作用域/关闭/重新激活验证通过 |
| Runtime/SDK | packages/plugin-runtime, packages/plugin-sdk | 自动注册、兑现、停用撤销、场景发现 | 定义与生命周期接线通过；生产 Coding/Builder 注入完成；七个项目 Runtime 插件可由动作入口启动并供 UI 复用，其他组合与全量生命周期仍待迁移 |
| 平台 MCP | apps/mcp/src/tool-catalog.ts, apps/local-host/src/mcp-server.ts | 统一目录及执行适配 | 新动作已接入持久、逐客户端/范围的生产授权及本机管理 API；授权界面、旧工具权限/目录与适配表仍待收敛 |
| 项目工作区 | packages/contracts/src/modules/projects.ts, apps/local-host/src/project-capabilities.ts | 原消费者及 MCP 使用同一查询能力 | 四项查询已迁移并验证 |
| 外部 MCP | horizontal/agent-host/src/adapters/prologue-mcp.ts | 连接与能力接入共用 | 未迁移 |
| 判断模块 | modules/functions, apps/local-host/src/functions-host.ts | 系统能力、动态场景与使用关系 | 已发布规则注册/调用与 Home 接线通过；动态场景、使用关系待迁移 |
| 首页 | apps/workbench/src/scripts/client/project-home.ts | 动态动作、实际执行、上下文会话 | 未迁移 |
| 工作流程 | plugins/native/workflows, apps/local-host/src/workflows-native-plugin-http.ts | 按能力合同匹配及调用 | 四个内容站与未知 Runtime 插件接通；通用步骤映射、恢复待完成 |
| Character/Agent | modules/characters, horizontal/agent-host | 授权能力引用和统一调用 | 未迁移 |
| 系统岛与设置 | apps/workbench/src/immersive-shell.ts, settings-navigation.ts | 系统能力管理、唯一配置位置 | 部分完成：固定入口与真实目录/绑定；连接与旧 MCP 设置迁入，旧 URL 转发；编辑器、全量授权/历史待完成 |
| 生成与开发 | plugins/native/plugin-builder, packages/plugin-sdk, tooling/plugin-cli, skills/molis-plugin-dev | 默认注册能力和消费场景 | 未迁移 |

## 验证

2026-09-25 工程证据：

- Contracts、Kernel、Plugin Runtime、Plugin SDK、MCP 和 Local Host 包 build 通过。
- `node --import tsx --test --test-concurrency=1 tests/action-service.test.ts tests/action-mcp.test.ts tests/action-mcp-stdio.test.ts tests/mcp-protocol.test.ts tests/plugin-manifest-v2.test.ts tests/plugin-runtime-integration.test.ts tests/plugin-upgrades.test.ts`：39 项通过。
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
- `node --import tsx --test --test-concurrency=1 tests/action-service.test.ts tests/local-host-actions.test.ts tests/inbox-action-scenes.test.ts tests/inbox-plugin.test.ts tests/inbox-native-plugin.test.ts tests/feed-inbox-pages-loop.test.ts tests/system-functions-actions.test.ts tests/functions-plugin.test.ts tests/plugin-outbound-mcp.test.ts tests/action-mcp.test.ts tests/action-mcp-stdio.test.ts tests/plugin-runtime-integration.test.ts tests/plugin-manifest-v2.test.ts`：98 项通过。包含真实 HTTP/SQLite、官方 MCP 客户端与生产 LocalMcpServer 的既有回归；判断供应商仍用 fixture，未验证真实模型。
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
- 移除旧 Inbox requires 后补充 `tests/functions-system-capability.test.ts tests/plugin-manifest-v2.test.ts tests/inbox-automatic-scenes.test.ts`：38 项通过。

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
- 旧 `/settings/functions`、`openPlugin/panePlugin=functions` 链接和 `/api/plugins/functions` 前缀保留为薄转发。三项 `molis_work_v1_functions_*` 名称从系统动作合同派生 schema，走同一动作调用及原工具开关，不再伪造插件身份。已绑定 MCP 客户端保留项目上下文，判断历史不会误记到 Home。删除已无使用者的 Native grandfathered 默认开关逻辑。
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
- 主回归 61 项通过：`node --import tsx --test --test-concurrency=1 tests/workflow-content-actions.test.ts tests/workflows-plugin.test.ts tests/inbox-automatic-scenes.test.ts tests/local-host-actions.test.ts tests/action-service.test.ts tests/plugin-manifest-v2.test.ts tests/inbox-action-scenes.test.ts tests/inbox-plugin.test.ts tests/inbox-native-plugin.test.ts tests/capabilities-page.test.ts tests/plugin-runtime-integration.test.ts tests/action-mcp-stdio.test.ts`。后续收紧内容引用合同并扩充旧实例/完整列表场景后，动作/Host/自动入箱回归仍通过；新增旧实例用例初次未填写正文，正确被模板空内容校验拒绝，补齐真实编辑操作后，工作流两文件 9 项全部通过。Workbench 注册边界 2 项通过。
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
- 主回归 58 项通过：`node --import tsx --test --test-concurrency=1 tests/lingguang-actions.test.ts tests/lingguang-plugin.test.ts tests/lingguang-mcp.test.ts tests/workflows-plugin.test.ts tests/workflow-content-actions.test.ts tests/local-host-actions.test.ts tests/action-service.test.ts tests/plugin-manifest-v2.test.ts tests/capabilities-page.test.ts tests/inbox-automatic-scenes.test.ts`。清理旧灵光测试中已经过时的 Functions 名单、Assistant 占位及 stub 断言，保留原有实际数据和 UI 检查；新行为另有集成验证。
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


## Jelly 全量业务接线与并发等待（本轮）

- 插件自有 59 项能力：40 类原事务命令、8 项查询/导出、3 项确认预览、3 项手工/模型整理和5项材料/模型服务。输入输出明确声明，AI 来源映射按 text 与 note/inspiration 区分必填字段；备份的原始 JSON 留给原多版本导入 owner 校验，不伪造统一旧格式。
- Host 在 Home 级注册一次，不需打开项目或 Jelly 页面。继续使用原 singleton、revision、history、note_versions、previews、模型 preferences 和连接/凭据 owner；没有新建 Jelly 数据库分区或另一套历史。`jelly:read`、`jelly:write`、`jelly:settings`、`model:invoke` 按能力检查，Manifest 权限从同一能力定义派生，声明不等于授权。
- HTTP 路由、材料/模型设置和旧 13 个 MCP 名称只做参数/协议适配；删除这些入口的 Store/AI/模型/材料业务直连。Web 的项目与全局路由绑定同一个 Home 客户端，旧 MCP 按原工具读写范围绑定授权且不借用项目上下文。旧 MCP 可省 revision 时先通过动作读取版本再 CAS 写入，保留原语义。
- 原素材文件安全读取、来源边界、结构化摘要证据、指纹复核、原文变化拒绝、预览与撤销均保留。NDJSON 通过可信调用上下文回传实际进度，断连取消传给模型/材料 owner；不将回调当成持久任务历史。
- 实测发现 Home 串行等待会阻塞模型期间的编辑。动作增加可选 scheduling=concurrent，由注册定义控制；只有声明并具备事务/冲突处理的能力并行。Jelly 模型和材料动作不占用串行队列，摘要结束后在短 Store 操作中重新检查原文与素材。Host 关闭等待并发调用，包括失败的调用；调用方无法通过伪造描述符改变调度。项目调用同样保留 Runtime 生命周期等待，未声明动作继续串行。
- 同步修复三个真实调用断点：事项 kind 原本被 owner 忽略，现按用户 task/event 选择创建/编辑且不改历史数据；复制剔除原对象的只读身份字段；旧进度窗口迟到的 close 事件不再清掉新计划的提交回调。窄屏区块操作移到正文下方，正文不被按钮挤成数个字一行。
- `tests/jelly-actions.test.ts` 11 项，实际执行全部 40 类命令与 13 个旧 MCP 别名，验证原 Store 数据、任务双向同步、实例改期、分类迁移、导入来源防替换、预览过期、撤销/重做和模型编辑/取消/失败。模型 plan 只返回预览，采纳后才产生任务及日历关联；不同 Home 和缺少权限不能读写。
- 最终业务/实操组 17 项通过：jelly-actions、jelly-http-stream、jelly-mcp、jelly-actions.e2e。官方 SDK stdio 客户端完成读取、写入、手工计划、材料重新读取、确认凭证跨进程恢复及撤销；读权限客户端不能写入或管理模型，两个 Home 不串用。MCP fixture 显式授权，不代表生产授权管理已经完成。
- Chrome 1440×950 与 390×844 实际完成笔记输入/保存、手工预览/采纳、日程创建/复制及刷新；主动将旧 close 事件延后到新预览打开后仍能确认。四张 jelly-{note,calendar}-{1440,390}.png 位于 `.impeccable/review/action-service/`，已逐张视觉检查；窄屏正文宽度与页面无横向溢出有实际断言。用户本人验收未进行。
- 相邻回归 57 项通过（并发、既有 MCP 装配、能力页面、日历/内容）；前一组 Jelly 素材/来源/模型/插件及 Host/Functions/ActionService 93 项通过。追加 Jelly 模型动作配置与实时停用验证后，模型文件 6 项通过。组间有重叠，不相加为独立总数。关键日志：`/tmp/jelly-actions-live-final.log`、`/tmp/jelly-actions-neighbor.log`、`/tmp/jelly-actions-regression.log`、`/tmp/jelly-model-actions.log`。
- Manifest 权限声明补齐后，旧 MCP 装配与 Jelly 插件回归 25 项通过（`/tmp/jelly-actions-manifest-final.log`）；根 tsc 与 diff 检查再次通过。
- Contracts、Jelly（含现有原生产物）、Workbench、Local Host 构建和根 tsc 通过；Workbench 注册边界 2 项通过。包边界仍只有既存 connector-connection-store.ts 与 web-connector-connections.ts 两处 App 直接 SQLite 引用，未新增豁免。无 commit / PR，未清理无关工作区修改。

整体仍未达到“内部完整”：其他存量插件、Home/“说一句”、Character/Agent、通用工作流输入映射与动态用途编辑、MCP Client 接入/生产 Server 授权、完整插件生命周期与统一调用记录仍需继续。Jelly 业务接线完成不替代这些范围；真实外部模型端点和音视频模型下载仍依据已有 owner 测试，不把注入模型与文本附件实操宣称为全部媒体现场验收。


## Cognia 业务接线、固定版本与 Prologue（本轮）

- 插件自身声明 22 个动作和完整输入/输出合同：知识库/搜索/详情/下载，领域与来源管理，资料增改删，上传与本机目录预览、扫描、确认/取消导入，整理/问答、草稿读取/采纳/归档。Manifest 权限直接从定义派生，Home Host 注入原 Store、模型与目录适配；没有第二份业务目录或知识数据表。
- 原 HTTP 改为路径/参数和下载响应适配，旧两个 MCP 名称转发到同一 Home 客户端；保留原默认关闭和动态工具开关，仅获得知识库读权限。原 generic personal HTTP 中的 Cognia 特例与模型解析被移除，两个生产 Web 组合根接入同一 Home 客户端。目录扫描迁出 HTTP 文件，首次使用的资料导入、确认和正文读取改用动作服务，保留原 checkpoint、回执和重试。
- `cognia:read` 不授予本机目录访问；目录扫描单独要求 `cognia:read-local-files`。目录导入声明真实 scan/preview 依赖，上传预览没有该权限要求。下载返回原始 Base64/MIME/文件名，HTTP 继续附件下载、nosniff 和 sandbox。
- 生成用短 Store 操作读取证据，释放后等待模型，再以短事务保存草稿；不阻塞 Home 的编辑、导入或查询。领域在等待期间删除时拒绝悬空草稿；原资料更新/删除仍保留其固定版本证据。失败、取消、无证据及无效引用不写草稿。
- 修复旧资料引用的实际断点：原界面打开 v1 后整理只传 ID，可能使用当前 v2。现在界面提交所见 `material_refs`，新动作允许明确版本或旧 `material_ids` 二选一；旧 ID 语义仍为执行时当前版本。实操在源已更新后从 v1 引用再整理，确认模型仍收到 v1。
- Prologue 保留原有无工具、固定上下文的有界会话；发现只读共同模型与连接元数据，不解密或启动运行器。执行绑定可信 actor，解密固定选择，并在执行前后检查模型/连接变化。正式构造的 SDK 通过受控 HTTPS Provider 实际完成请求、草稿和取消；模拟响应验证质量不能当作商业模型质量验收。
- 实测发现当前 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-compaction-growth.tgz` 的 `session/core/run` 仅接受 HTTPS，虽然全局模型设置允许本机 HTTP。目录/工作台现在明确显示该运行器限制并禁用生成入口，执行同样拒绝，资料操作仍可用。SDK 本机 HTTP 支持尚未完成；不回退到另一模型，不修改 vendor 安全边界来绕过测试。下一次处理此依赖需核对源码仓库及构建来源，再验证端点合同与网络边界。

验证证据：

- Cognia 与首次使用原业务组 40 项通过：`/tmp/cognia-final.log`，覆盖原数据、版本、导入原子性与重试、受控路径/附件、AI 证据以及完整资料采纳。随后补齐明确版本与生产旧 MCP 接线验证，动作/HTTP 最新 10 项通过：`/tmp/cognia-actions-http-final.log`。
- Prologue 最新 5 个场景通过，见 `/tmp/cognia-version-final.log` 中对应五项：发现零解密/零运行，实际 SDK 无工具及固定证据，执行中停用/断连拒绝提交，真实本机 HTTPS 请求与取消，HTTP 选择准确不可用。该组合日志曾有两个浏览器失败，原因是测试重导入使用了未 canonicalize 的临时路径而创建新来源；改为读取原来源 locator，并验证未新增来源资料后，浏览器组已单独全部通过。
- 标准 MCP stdio 使用官方客户端验证跨进程导入、原始字节、查询、来源删除后的固定版本、只读授权、Home 隔离和重启后确认预览。最新原生产 MCP 入口验证无项目时可调用旧名、动态关闭后拒绝旧调用；分别见 `/tmp/cognia-live.log` 与 `/tmp/cognia-actions-http-final.log`。标准客户端的权限由测试明确授予，不能据此宣称生产授权配置已完成。
- Chrome 实操 3 项通过：1440×950 与 390×844 的目录选择→预览→导入→整理→审阅→保存→固定引用→历史版本再次整理→刷新；另验证模型不可用时窄屏原因、入口禁用及资料保存。`/tmp/cognia-ui-final.log`，截图 `cognia-review-*`、`cognia-library-*`、`cognia-model-unavailable-390.png` 位于 `.impeccable/review/action-service/`；已视觉检查。未进行用户本人验收。
- 相邻动作、依赖、并发、模型、能力页与旧 MCP 装配 47 项通过：`/tmp/cognia-neighbor.log`。组间有重叠，不累加为独立测试总数。
- Cognia、Workbench、Local Host 构建与根 tsc 通过；Workbench 注册边界 2 项通过。包边界仍只有原 `connector-connection-store.ts`、`web-connector-connections.ts` 两处 App 直接 SQLite 引用，未新增豁免。全仓定向搜索未留下旧 Cognia route/store、MCP/store 或 HTTP/scanner 调用旁路。未提交或创建 PR，保留无关修改。

整体仍未达到内部完整：其余存量插件、通用工作流输入映射/恢复与动态使用绑定、首页动作和“说一句”、Character/Agent、MCP Client 接入与生产 Server 授权、完整生命周期与调用记录，以及上述 SDK HTTP 支持，均需继续推进。Cognia 的业务接线不替代这些完成条件，Goal 保持执行中。


## Prologue 本机 HTTP 与 Cognia 实际消费（本轮）

- 根因是消费 SDK 的 Model 目录允许回环 HTTP，而 Session 的 Run 启动使用 HTTPS-only 正则。以原消费 a7e785b8 建立隔离源码工作树，目录和 Run 统一使用 Model 端点校验，Host 继续拥有最终出网授权。没有回退到其他模型或另一条 completion 执行链。
- 同时修正回环判定的实际漏洞：`127.example.com`、`127.0.0.1.example.com` 不是回环 IP。Node/Rust 仅识别准确的回环 IP/localhost 名称，Rust 补齐 URL 解析返回的 `[::1]`。登记不放行网络；无 model 或 loopback 授权的实际请求为零。Run 沿用既有 MODEL_NETWORK_FAILED 错误投影，仍保留可理解的拒绝原因。
- 新包 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-loopback-model.tgz` 已成为唯一活动依赖，agent-host、workspace inventory 与 pnpm 锁文件同步。500 个 dist 文件与源码构建、包内和实际安装逐字节一致。`model-loopback.patch` 保存全部未提交源码、合同及测试，反向 apply 检查通过；README 给出基线和重建命令。原 Prologue checkout 仍干净；未提交、发布 npm 或替换正式安装版。Rust 判据已编译测试，未将其宣称为原生安装版实操。
- 删除 Cognia 临时 HTTP 禁用及对应过时英文文案；无可用模型时明确提示检查模型设置和服务连接。能力目录、工作台、实际执行继续独立检查元数据；发现不启动模型、不解密。HTTP/HTTPS 均经正式打包 SDK 和 Molis 原 Node 适配器执行。

验证：

- SDK 模型/网络 53 项全部通过（`/tmp/prologue-loopback-tests.log`）。受控 HTTP 服务在 IPv4/IPv6 上实际收到模型请求与认证，正常结果和回放一致；取消保留终态且不再次请求。未授权为零请求；模型登记和启动均拒绝伪回环及非本机明文端点。原 DNS/重定向/密钥来源测试继续通过。
- SDK 相邻 71 项通过（`/tmp/prologue-loopback-neighbor.log`），覆盖真实公共包入口、模块边界、关闭、MCP 工具 wire 和原有上下文整理；Rust 真实目标校验 1 项通过（`/tmp/prologue-loopback-rust.log`）。SDK build/tsc 通过。初次测试书写时修正缺失括号，并按既有公共合同使用 text-delta 与 MODEL_NETWORK_FAILED；未修改运行语义来迎合断言。
- Molis Cognia 动作/HTTP/标准 MCP/Prologue 17 项通过（`/tmp/cognia-loopback-business.log`）：实际 HTTP 与 HTTPS 生成和取消，运行期间停用/断连禁止草稿提交、发现零请求、固定资料版本、原字节、权限及 Home 隔离和跨进程恢复。
- Chrome 4 项全部通过，无跳过（`/tmp/cognia-loopback-ui.log`）。保留原目录导入与历史版本整理的桌面/窄屏回归，新增 1440/390 宽度实际配置本机 HTTP Provider→资料输入→Prologue 生成→审阅→明确保存→刷新→停用→生成禁用但手工保存仍成功。新路径没有注入 completion；请求实际包含所选资料且没有 tools。四张 `cognia-http-{review,disabled}-{1440,390}.png` 已逐张视觉检查，窄屏内容和操作完整、无横向溢出。
- Molis 相邻 Character、Prologue 凭据/流/整理/恢复及首次使用导入 66 项通过（`/tmp/molis-loopback-neighbor.log`）；Cognia、agent-host、Workbench、Local Host 构建与根/SDK 类型检查通过，Workbench 注册边界 2 项通过；diff 检查通过。没有为此次依赖修改重复运行全仓测试，商业模型质量和用户本人验收未进行。

本轮关闭的是 Cognia 已知 SDK HTTP 断点。整体仍未达到内部完整：全部其他插件及其消费者、通用工作流输入映射与恢复、动态场景绑定/用途反查、首页动作与“说一句”、Character/Agent 动作消费、MCP Client 接入与生产 Server 授权、页面外完整生命周期及统一调用记录仍需继续。相邻 Character 回归不等于其动作迁移已完成，Goal 保持执行中。

## Dataset 业务、编辑器与真实 MCP（本轮）

- 插件自身声明 13 项能力：列表/读取/新建/修改/删除、本地加列、显式 AI 加列、CSV 导入/导出、快照列表/保存/回滚、Artifact 发布。完整输入输出合同与权限从插件定义派生，项目 Host 注册原 Store 处理器。12 个原 MCP 名称和 HTTP 保留薄转发，移除 HTTP/旧 MCP 中的业务、独立 Store 构造与模型分支；Host 的原 personal HTTP 分发不再拥有 Dataset 处理器。清除废弃发布端口断言和不再准确的文档。
- Dataset 仍用 Home 下原库及 canonical project_id，保留表/快照 ID、版本和 Artifact 引用。HTTP 组合根注入可信项目、actor 和取消信号，拒绝 query/body 项目漂移；MCP 外部参数不能伪造上下文。读权限不会获得写入、模型或发布权限，AI 可用性同时核对模型、全部所需权限和调用者能力白名单。
- 本地加列不调模型；新 AI 入口明确调用模型并单独要求 model:invoke，只发送用户拟列名请求，不发送表内数据。模型等待期间不占用项目串行队列或持有 Store；返回时校验读取版本，空响应、失败、取消、并发编辑/删除、连接撤销均不追加列。标准目录与编辑器都显示缺模型原因。
- 编辑采用 expected_version 和数据库条件写入；客户端串行保存，等待期间继续编辑会保留并提交下一笔。目录刷新不能跳过确认版本；保存失败保留输入并阻止发布、切表和返回，明确重新读取才丢弃未保存输入。CSV 引号、逗号和多行文本往返正确，文本控件保留多行，筛选不会删除隐藏行；原数字/日期列无法用原生输入表示的字符串保留可见文本。
- 发布固定内容/版本/发起者，再交给原 Artifact owner；Artifact 成功而关联失败时保留意图并显示恢复入口。重启后重用原 Artifact，不把后续编辑覆盖进原版本，不允许其他发起者代为恢复，下一次显式发布可生成新版本。删除表和快照在原库事务完成，待恢复发布不能删除。
- 窄屏实操发现并修复了表格被 flex 压扁、列名挤至不可读、顶栏滚动带偏整片编辑区的问题。表格与顶栏分别在自身容器滚动；错误信息滚入可见区域，草稿仍保留。桌面和窄屏均保留实际编辑与全部操作。

验证证据：

- Dataset 动作/标准 MCP/相邻创作业务与旧 MCP 装配共 41 项通过，`/tmp/dataset-business-verified.log`。使用真实 SQLite、可信调用者、两个项目及隔离 Home；13 项业务均调用处理器验证数据，12 个旧 MCP 别名全部走统一动作。包含 CAS 冲突、事务删除故障、固定发布内容、重启及不同 actor、AI 取消/空结果/失败/等待冲突和准确授权。
- 官方 MCP Client 通过独立 stdio 进程发现并调用全部 Dataset 能力，完成跨进程 CSV、版本、读写授权、项目隔离与重启发布恢复，Artifact 内容由原 owner 查询核对，未生成多余版本。fixture 明确授予权限，不将其算作生产客户端授权配置已完成。
- 模型与动作服务相邻 28 项通过，`/tmp/dataset-neighbor.log`。新增 Dataset 真实本机 HTTP Provider 测试：从原模型/连接配置解析凭据，目录和本地加列零模型请求；显式生成的模型、认证和提示正确，表内数据不外传；调用中撤销连接后结果不落库，目录同步不可用。未用注入 completion 替代此实际网络测试。
- Chrome 1440×950、390×844 及无模型共 3 项实际操作通过，`/tmp/dataset-ui-final.log`。覆盖创建、CSV、多行编辑、筛选保留隐藏行、故意延迟第一笔真实保存响应后继续编辑、快照、显式 AI/本地加列、列类型切换、回滚、实际 CSV/JSON 下载字节、冲突保留和明确重读、发布中断恢复、刷新与 HTTP 项目漂移拒绝。截图在 `.impeccable/review/action-service/dataset-{editor,conflict,recovery}-{1440,390}.png`；已检查桌面和窄屏。模型质量使用可控响应验证，用户本人验收未进行。
- Contracts（前段）、Dataset、Workbench、Local Host 构建及根 tsc 通过；Workbench 注册边界 2 项通过，见 `/tmp/dataset-boundary.log`。修改范围 diff 检查通过。旧测试中 Functions 插件仍存在及固定完整插件名单的断言已改为系统服务移除和实际创作入口边界；原保存实现字符串断言由真实浏览器乱序/冲突与类型切换覆盖。未删除原业务回归，未改生产行为迎合测试。

整体仍未达到内部完整。其余存量插件及其消费方、通用工作流字段映射与恢复、动态用途/真实引用反查、首页动作和“说一句”、Character/Agent、MCP Client 与生产 Server 授权、页面外完整生命周期和统一调用记录仍需继续。Dataset 接线不替代这些范围；Goal 保持执行中，未提交或创建 PR。

## Form 业务、答卷历史与真实 MCP

- 插件声明 11 项业务：列表/读取/新建/修改/删除、本地加题、显式 AI 拟题、标记已发布、提交答卷、结果查询、Artifact 发布。Host 只注入原 Store、共享模型和 Artifact owner；HTTP 与原 10 个 MCP 名称统一薄转发，输入 schema 和权限来自插件定义。移除旧 HTTP/旧 MCP 内的 Store 与业务分发、旧 personal HTTP 处理器及其多余模型查找、废弃发布端口。生产中仅 `form-actions.ts` 构造 Form Store。
- 原 forms/submissions 库和项目分区继续使用；旧 schema 原地补可空快照与请求字段，保留 ID、题目/选项、share_id、版本、答卷内容和 Artifact 身份。新答卷同事务保存问卷版本及题目；结果按提交时题目显示，旧答卷明确无快照，无法匹配的原题号和答案仍可读。六种题型、必填、选项、评分、日期及未知题号在业务 owner 校验。
- 编辑与发布使用 expected_version；客户端保存排队，等待响应期间的新输入继续提交。失败保留草稿，冲突阻止发布、切换和返回；明确重读可取消或确认丢弃。纯输入校验失败修复后可重新保存，不把版本冲突或未知请求结果自动重试。预览提交固定版本，错版拒绝且保留答案；稳定 request_id 支持响应丢失和跨进程重试，修改内容不能复用已保存请求。
- 本地加题零模型请求；AI 拟题单独授权、复用原模型/连接，仅发送用户请求，不发送问卷/答卷。等待不占用 Store，取消、模型失败、空结果、并发编辑/删除和撤权不追加题目。缺模型禁用 AI，仍可本地加题。
- “标记已发布”保持原本机状态和 share_id 语义，不提供外网公开填写链接。Artifact 只保存问卷，固定发布意图保留可信 actor 和源版本；关联失败可重启恢复原版本，不能把后来编辑塞入旧快照。问卷和答卷删除在原库事务完成，待恢复发布不能删除。
- 实操修复窄屏题目输入被操作按钮挤窄、历史说明误用两列布局、修复输入后仍残留旧警告的问题。题目占整行，排序/删除保留触摸尺寸；补完必填项才清除必填警告，成功保存清除对应错误，发布待恢复说明仍保留。

验证证据：

- Form 动作/标准 MCP/相邻创作业务/旧 MCP 装配与实际模型配置共 52 项通过：`/tmp/form-business-final.log`。覆盖全部 11 项处理器、10 个旧名、六种题型、两个项目/Home、读写/模型权限、旧 schema 原地升级、CAS、删除事务故障、固定发布/actor/重启以及 AI 各种终态。相关用例在 `tests/form-actions.test.ts`、`tests/form-mcp.test.ts`、`tests/host-configured-text.test.ts`。
- 加强后的标准 MCP 用例另行通过：`/tmp/form-refine-mcp.log`。两个独立写入进程同时提交相同请求，返回同一答卷且数据库只有一行；随后仍验证修改题目、进程重启、原提交恢复与固定 Artifact 发布恢复。该项是上述 MCP 用例的补充复验，不累计为新的独立测试。客户端权限由 fixture 明确授予，生产授权配置仍未完成。
- 真实配置模型测试经共同连接 owner 发出实际本机 HTTP 请求，验证认证、所选模型及提示，不向模型发送问卷数据；发现与本地加题不请求模型，撤销连接后返回结果不落库。浏览器模型内容使用受控响应，不能当作商业模型质量验收。
- Chrome 1440×950、390×844 和无模型共 3 项通过：`/tmp/form-refine-ui.log`。覆盖六题型编辑填写、先保存成功再丢失响应后的提交恢复、改题后原答卷、延迟保存响应期间继续编辑、选项修复后继续保存、编辑和预览冲突保留、重读取消/确认、AI/本地分离、Artifact 回写失败后继续编辑再恢复、刷新、旧历史和 HTTP 项目漂移拒绝。已视觉检查 `form-editor-390.png`、`form-recovery-390.png`、`form-history-1440.png`；其他路径截图同在 `.impeccable/review/action-service/`。这是桌面 Chrome 和窄屏模拟实操，未进行实体手机或用户本人验收。
- Form、Workbench、Local Host 构建通过（`/tmp/form-refine-{plugin,workbench,host}.log`），根 tsc 与 Workbench 注册边界 2 项通过（`/tmp/form-refine-{types,boundary}.log`）；范围内 diff 检查通过。没有提交或创建 PR，无关修改保留。

整体仍未达到内部完整。其余插件及消费方、通用工作流字段映射与恢复、动态用途/引用反查、首页动作和“说一句”、Character/Agent、MCP Client 与生产 Server 授权、页面外完整生命周期和统一调用记录仍需继续，Goal 保持执行中。

## PPT 业务、编辑器、导出与真实 MCP

- 插件声明 7 项能力：列表、读取、新建、编辑、删除、JSON 导出、Artifact 发布。原 HTTP 和六个旧 MCP 名称薄转发；导出由动作读取已保存演示稿，浏览器和外部调用取得相同 JSON，不声称支持 PPTX。输入明确幻灯片、要点、备注、配色和版本；旧省略字段保留原默认语义。
- 原 presentations 表及 ID、幻灯片顺序/身份、配色、备注、时间、版本和 Artifact 引用保留，仅原行增加待恢复发布信息。Store 条件更新防止跨进程覆盖，待恢复发布阻止删除。发布保存固定内容/actor/版本，经原 Artifact owner 核对并恢复，原快照和后来编辑分别保留。
- 客户端保存串行排队，等待时继续输入可正确提交；失败保留草稿并阻止发布、导出、返回或切稿。明确重新读取提供取消/确认，目录刷新不替换已确认版本。移除旧忽略保存错误后继续执行的路径；修复移动非当前幻灯片时把当前页字段写入被移动页的问题。窄屏顶栏独立滚动，配色按钮具有 44px 触摸尺寸，预览备注保留换行。
- 删除 PPT 原 HTTP/旧 MCP 内的业务分发和 Store 构造、personal HTTP 发布分支及独立发布端口、废弃 requirePptArtifactPort/rememberArtifact。最后一个创作插件迁走后，旧 `createBoundProjectStoreAdapter` 整体删除；MCP Server 和 Web 请求不再传各插件发布回调或导入空 Artifact 模块。必要旧工具名继续从插件 action 定义派生 schema/权限并调用同一执行核心。

验证证据：

- PPT 动作、标准 MCP、相邻创作与旧 MCP 装配共 34 项通过，无跳过：`/tmp/ppt-business-final.log`。覆盖 7 项处理器和六个旧名、真实数据库业务结果、输入拒绝不写入、项目/Home/权限、旧 schema 原地升级、读取/导出一致、发布中断/actor/重启/后续新版本。新增生产旧 MCP 入口验证：未绑定隐藏、明确工具开关后绑定可创建/列表，项目由可信上下文注入。
- 官方标准 MCP Client 使用独立 stdio 进程发现七项能力，两个写入进程同时改同一读取版本，仅一个成功；只读/其他项目拒绝写入或跨区读取。实际 JSON 等于库内记录，发布回写失败后换进程恢复原 Artifact，后续编辑保留且无额外版本。fixture 权限明确授予，不替代尚未完成的生产全量授权配置。
- Chrome 1440×950 与 390×844 两项实操通过：`/tmp/ppt-ui-final.log`。创建两页、要点和多行备注、切页、移动非当前页、加页/删页、配色、延迟真实保存响应后继续输入、实际下载文件字节/对象、编辑冲突阻止发布/导出/离开、重读取消/确认、Artifact 失败后继续编辑及页面重启恢复、项目漂移拒绝、最终删除均成功。`ppt-{editor,conflict,recovery}-{1440,390}.png` 位于 `.impeccable/review/action-service/`；桌面/窄屏编辑、冲突和恢复已视觉检查，窄屏为 Chrome 模拟，实体手机与用户本人验收未进行。
- Contracts、PPT、Workbench、Local Host 构建通过；根 tsc 与 Workbench 注册边界 2 项通过：`/tmp/ppt-{contracts-build,plugin-build,workbench-build,host-build,types-final,boundary}.log`。范围内 diff 检查通过。初次构建修复了适配文件路径的机械替换和 SQL 可选类型错误，并清除已无用途的参数/import；后续构建通过。原业务回归保留，旧 saveSeq 字符串断言由浏览器真实并发/冲突覆盖取代。

整体仍未达到内部完整。其余插件与平台服务、通用工作流映射及恢复、动态用途/引用反查、首页动作和“说一句”、Character/Agent、MCP Client 和生产 Server 授权、页面外生命周期及统一调用记录仍未完成。PPT 接线不替代这些范围；Goal 保持执行中，未提交或创建 PR。

当时的接续位置为 Images；实际迁移结果见下一段。

## Images 九项业务接线、跨进程任务与失效连接（2026-09-25）

插件定义 Home 连接列表/保存/删除，项目任务列表/启动/读取/取消/删除及图片读取共九项动作，包含完整输入输出合同和权限。Host 提供原 ImagesService 的生命周期与原 Connector 端口，Kernel 执行同一处理器。原 HTTP 路径仅薄转发，图片下载将同一动作的 Base64 还原为真实二进制；标准 MCP 通过通用导出获得九项动作。未增加生图业务副本或第二份任务、图片、凭据数据。

移除原 HTTP 文件中的服务 Map、openImages/closeImages 和 personal-native-plugin-http 里的旁路。服务由 Host 持有，同进程按 Home 共享；关闭一个持有者不打断另一个。跨进程复用原 jobs，加 runner_id 和各执行者独立 SQLite 锁；OS 退出释放锁，恢复仅标记已退出执行者的任务。原全局锁改为共享兼容锁，拒绝仍在运行的旧版本独占执行器；旧 schema 无 runner_id 可原位升级。请求去重与 Home 两任务上限在原库事务裁决；跨进程取消写入原状态，执行者观察终态并中断网络等待。没有自动重试、重复计费或另一套任务状态表。

连接列表和旧引用采纳不解密密钥；共享 Connector owner 采用 sealed-entry 存在性判断，执行时才解析真实凭据。原 images:<id> 引用自动进入同一连接目录，列表不返回密钥或密文。撤权在启动及厂商响应后检查，失效不保存新图、不回退本机匿名请求。工作台保留失效服务/账号、说明原因、禁用生成；选择其他账号后修改地址不会把选择重置。复用历史提示词也保留原服务引用。浏览器真实操作发现并修复原账号下拉框 esc 未定义导致管理弹窗无法打开的问题，并清除刷新后的过期“可以开始生成”提示。

验证证据：

- `/tmp/images-all-business.log`：38 项通过，覆盖原 Provider 协议、实际图片字节、九项动作、Home/项目/权限、请求身份、撤权、旧密钥引用与真实授权头、关闭/恢复、Connector 回归、标准 MCP 及 Web/MCP 并用。
- `tests/images-concurrency.test.ts` 使用真实 Web Server、独立标准 MCP SDK 子进程和受控 HTTP Provider；并发相同 request_id 只调用一次，原库限制全 Home 并发，跨进程取消确实断开原请求，SIGKILL 后仅相应任务 interrupted、Web 活任务保留，重启重放无额外厂商请求。
- `tests/images-service.test.ts` 覆盖旧 schema 无 runner_id、旧独占进程仍在时拒绝启动及新共享进程在运行时旧执行器无法接管；存量配置和任务身份保持。
- `/tmp/images-ui-final.log`：3 项真实 Chrome 操作通过，包含原完整生成/刷新/下载/故障恢复/删除路径，以及 1440px、390px 撤权、改绑、服务消失、手动选择备用服务、生成和下载。输出为受控 PNG，未调用付费厂商。
- 截图位于 `.impeccable/review/action-service/images-{revoked,connection,missing,result}-{1440,390}.png`；已查看桌面失效状态、窄屏连接及结果画面。
- Images、Workbench、Local Host 构建通过，日志 `/tmp/images-{plugin,workbench,host}-final-build.log`；根类型检查 `/tmp/images-types-final.log` 通过；两项注册边界检查 `/tmp/images-boundary.log` 通过。

这证明 Images 的业务路径和并用行为，不等于生产客户端授权、原生插件完整生命周期或通用工作流配置已经完成。Images 目录声明能力合同，具体所选连接可用性在连接选项和执行时校验；通用参数配置/可用性呈现仍随整体消费方推进。用户本人验收、真实付费厂商验证未进行。

整体 Goal 保持执行中。其余插件与平台服务、通用工作流字段映射和恢复、动态用途/引用反查、首页动作与“说一句”、Character/Agent、MCP Client 接入及生产 Server 授权、页面外完整生命周期、统一调用记录和最终旧代码收敛仍须继续。后续 Alchemist 的实际核对和修改见下一段。

## Alchemist 真实入口盘点与多进程执行前置修复（2026-09-25）

核对发现旧 src/routes.ts 的八项演示操作不是当前产品全貌。Host 实际使用 Studio app，41 个业务入口由 src/studio/server/api 注册；旧演示写入已返回 410，读取用于保留历史数据。原生工作台 client.ts/client-flows.ts 消费 Studio 接口。迁移必须覆盖以下分组，不能按旧演示路由生成一个“已迁移”的空壳：

| 当前 API 分组 | 数量 | 真实消费/后续接线 |
| --- | --- | --- |
| bootstrap、方向创建/编辑/归档、探索启动/读取 | 6 | 目录、方向编辑与炼化进度 |
| 候选读取/保留/丢弃/恢复、Idea 版本 | 5 | 卡片比较、已保留想法及历史版本 |
| 讨论消息读写 | 2 | 当前对象及历史讨论、明确保存失败回复 |
| 模型目录、运行设置读写与验证 | 4 | 共享 Host 模型，保留固定模型与预算 |
| 研究工作区、计划、启动、取消及事件 | 5 | 双 Lens、原检查点与 SSE；需结构化事件动作及 SSE 适配 |
| 正式决策列表、版本工作区与保存 | 3 | 证据门槛和 Idea 版本决定 |
| 注释与 Memory/提案 | 9 | 引用版本、反馈、Taste、Playbook 和实际应用 |
| 市场来源、报告、运行、机会保存/转方向 | 6 | 原公开来源与材料 owner |
| 工作区导出 | 1 | 原 JSON/ZIP 字节与下载 |

新动作身份、输入输出和权限仍需逐项定义；基础健康检查不视为业务动作。旧演示只读 list/get/完整历史导出也需薄转发，保留原数据和标签，不恢复已关闭的演示写入。

已修复的实际前置缺陷：JobRunner 原始租期为 30 秒，LocalWorker 没有续租；第二个运行时会把仍在生成/研究的任务判成过期并恢复，旧执行者也可能回写业务状态。现在执行期间续租，取消/租约丢失会中断原等待；所有 Brainstorm、Lens、Pulse 的业务写入通过原数据库事务同时检查归属。旧执行者不能覆盖接管后的结果或失败记录。claim/enqueue/recovery/checkpoint/cancel/finish 与事件记录使用原库事务，状态和事件写入失败一起回滚。保留原安全检查点和 generating/call_dispatched 防重发语义，没有新增任务状态副本。

验证：

- `/tmp/alchemist-lease-tests.log`：24 个文件、62 项插件测试通过；新增 lease-ownership 六项覆盖超过原租期的持续执行、远端取消与迟到写入、失去租约后的真实 Brainstorm 恢复，以及 SQLite 触发器注入事件写失败后的原子回滚。
- `/tmp/alchemist-host-regression.log`：25 项通过，包含原 Host/运行时/旧插件回归及新 `tests/alchemist-worker-process.test.ts`。两个独立 Node 进程共用真实 Studio 数据库，受控 HTTP 模型持续超过两个原租期，仍只发一次请求并保存一张卡；SIGKILL 原执行者后，另一进程恢复为 AI_CALL_INTERRUPTED，未增加模型调用，已完成卡片保持。
- `/tmp/alchemist-build.log` 插件构建、`/tmp/alchemist-types.log` 根类型检查通过。未改 UI；本轮未重复浏览器验收。测试夹具仅使用隔离数据库和受控模型，不访问用户账号或付费服务。

下一步仍是 Alchemist 全部业务接线，不转去另一个插件：原 ApiDependencies/local-runtime 是业务组合边界；将原处理器与完整动作合同关联，Host 管生命周期、模型/搜索端口与可信项目，HTTP/SSE/导出和标准 MCP 消费同一执行器。当前 HTTP studios Map/closeAlchemist、Hono 直通、旧演示 handler 仍未收敛，不能把此轮续租修复称为 Alchemist 迁移完成。全部其他插件、系统产品与通用消费方仍保留在 Goal 中。

## Alchemist Studio 41 项业务合同与统一执行器（2026-09-25）

- 插件自身声明全部 41 项 Studio 动作，输入输出 Schema 从同一 Zod 合同派生；包含实际对象正文、版本、来源、研究报告与证据、校准应用引用、后台任务状态，不用一个通用 HTTP 代理代替业务能力。模型调用与公开来源抓取有单独权限声明。项目与调用者不允许通过业务参数覆盖。
- 原 14 个业务 route 文件已移除，方向编辑/归档和探索复用等已有行为迁到操作层。`api/action-routes.ts` 仅做固定路径映射、原成功状态码、SSE 与下载编码。运行时允许 Host 注入 Kernel 调用口，独立 Studio 使用同一个插件执行器；没有复制数据库、任务表或结果存储。
- 新事件动作以 jobId 和 after 返回原事件、状态与游标，并在原库同一读取事务中获取，SSE 消费它。研究取消仍接收 `run.jobId`，仅取消 Lens；合同明确区分 run.id，未声称通用取消所有任务。导出返回原 JSON/ZIP 字节的 base64，HTTP 还原下载。机会转换保留 created 结果，HTTP 维持首次 201/重复 200。
- 讨论保留原上下文、历史和启用的 Taste。取消后的迟到模型回复不保存为成功，用户输入与失败状态仍可回看。未配置模型的消息保留原 runtime_unavailable 语义。
- `tests/alchemist-actions.test.ts` 验证真实仓库数据的完整方向→炼化→卡片→双研究→决策链路，以及注释→校准提案→应用/停用、Taste→讨论、市场来源→报告→机会→方向、取消、事件和导出；包含 HTTP/函数交叉读取、Kernel 项目/权限/输入拒绝、重复保留/应用不产生第二份业务对象、关闭观察不中止任务和迟到回复拒绝。
- `tests/alchemist-mcp.test.ts` 用标准 SDK 启动独立 stdio 进程，验证 41 项能力目录、只读/写入和项目隔离、后台生成、消息联合输出、真实导出与重启后身份/数据保留。初次验证暴露联合对象被 MCP 多包一层 result，已在合同中显式标记 object 并复验。测试使用显式 fixture 授权和受控模型，不代表生产客户端授权管理完成。
- `/tmp/alchemist-actions-plugin-tests.log`：24 个文件、62 项插件测试通过。`/tmp/alchemist-actions-business.log`：4 项新的业务集成测试通过。`/tmp/alchemist-actions-combined.log`：30 项合并回归通过，覆盖新动作/MCP、原 Host、运行时、旧插件和双进程恢复。`/tmp/alchemist-actions-build.log` 插件构建、`/tmp/alchemist-actions-root-types.log` 根类型检查通过。
- `/tmp/alchemist-actions-browser.log`：原生浏览器完整流程通过，包括卡片、研究材料、讨论、注释校准、决策、Taste、设置、JSON/ZIP 下载、市场机会以及缺模型失败恢复。1440/390 两种尺寸、明暗主题截图写入 `.impeccable/review/action-service/alchemist/`，未覆盖已有 spec 截图；已检查桌面明色与窄屏暗色，无横向溢出。只使用隔离 Home 与受控数据，无用户账号或付费服务调用。

当时尚未完成的接线（后续结果见下段）：生产 `alchemist-native-plugin-http.ts` 的 studios Map/closeAlchemist 仍存在，`MolisWorkLocalHost` 未注册 Alchemist provider；当前 HTTP 只完成内部业务归一，尚未通过 Host Kernel。下一步必须把运行时、搜索和 Prologue 的生命周期交给 Host，补可信 actor（目前 Studio actor-local/Prologue web-user）、同 Home 多 Host 释放规则、旧演示只读动作，以及生产 HTTP/MCP 的同源接线与验证。其余插件和系统功能的全量 Goal 保持不变。

## Alchemist 生产 Host、可信身份与旧演示清理（2026-09-25）

生产 Host 现注册 44 项能力。HTTP 仅保留参数、状态码、SSE/下载；运行时按 Home/项目由多个 Host 共同持有，最后一个 owner 释放才关闭，目录发现不打开 Studio 数据库或启动任务。可信 actor 通过调用上下文及原 job input 保留，后台恢复后仍使用发起身份；并发讨论不串身份。Prologue 默认模型选择复用原模型和连接 owner，发现不解密/探测，生成前后核对配置，实际 session 使用可信 actor。搜索端口从 HTTP 移到 Host，自有数据库及 SEL 规则不变。

旧演示新增 list/get/export 只读动作，原 IDs、日期、决定理由和内容保留；已删除旧 routes.ts、route-handlers.ts、演示生成器及 Store 写入方法，旧 HTTP 写入继续 410。包的 dist 清理后重新构建，避免删除源码后仍发布旧 JS。

验证：/tmp/alchemist-production-regression.log 的 30 项通过，覆盖业务、Host、标准 MCP、原运行时、可信 actor、两个 Host 并用、重启恢复及独立进程租约；/tmp/alchemist-production-plugin-tests.log 的 24 文件/62 项通过。/tmp/alchemist-production-browser.log 的真实 Chrome 工作台路径通过，截图在 .impeccable/review/action-service/alchemist-host/；已查看 1440 明色及 390 暗色。插件/Host 构建及根类型检查通过，另以 /tmp/alchemist-clean-build.log 验证清理产物后的构建。使用隔离 Home 与受控 AI，无用户账号或付费请求，用户本人验收未进行。

标准 MCP 测试改为真实 Host，但仍使用显式 fixture 权限。生产逐客户端授权、插件停用对后台任务的完整治理和通用参数可用性仍未完成。其余存量插件、工作流、用途/引用、首页、Character/Agent、MCP Client 和统一调用记录继续保留在全量 Goal。

## 生产 MCP 新动作入口的明确授权（2026-09-25）

此前新动作在正式 LocalMcpServer 中始终使用空 permissions，只有 fixture 主动授予时才能使用。现在复用 config/mcp-tools.json 保存 action_grants：客户端来自宿主 runtime 身份，准确绑定项目或 Home、能力 ID/版本、提供方和已接受权限。目录重新发现及每次调用读取配置；进入 Host 队列后，Kernel 在实际调用前再次读取授权。升级、换提供方或权限变化不能沿用旧授权，授权检查期间重新加载提供方也拒绝原调用。没有自动为声明授予权限，没有新增能力注册表。

Host 增加仅组合根可用的只读 inspectActions，从同一注册表查看未授权元数据；ActionClient 的发现和调用仍受权限限制。新增 allowed_actions 精确约束版本与提供方，旧 ID 名单不能绕过；新授权不使相同权限的其他能力自动可用，也不自动授予依赖。新动作的业务字段由自身 Schema 验证，旧 Goal 工具的 payload/actor 字段启发式不再误伤未知插件，但旧工具原有身份保护保留。

本机管理 GET/POST /api/settings/mcp/actions 已接在原同源/控制令牌门后。保存从实际注册定义取得权限并检查当下可用性，不接受请求自填权限；来源消失后的旧记录保留，可继续撤销。现有 MCP 开关修改保留 action_grants，同进程管理写入按序执行、文件原子替换；无效/冲突配置拒绝覆盖并保留原文件。此处采用原本机管理 writer；未声称支持多个管理进程同时改写配置。

验证：

- /tmp/mcp-grants-final-tests.log：69 项通过，覆盖新授权/HTTP/生产标准 MCP、动作依赖/并发、Host、正式 Runtime 的未知插件、系统判断、旧插件 MCP、Session 活动和原 MCP 回归。
- 后续加强配置保留、执行时重读定义和连接检查并清除无用适配创建后，/tmp/mcp-grants-refined-tests.log 的 9 项复验通过（6 项授权专项、3 项系统判断，与上述用例重叠，不累计）。真实标准 SDK 客户端通过独立 stdio 的正式 LocalMcpServer 读写 Alchemist，两个客户端/项目不能借用权限，撤权在原连接和重启后生效，数据与各自可信 actor 保持。
- 本机 Web 实测发现随机 ID 的新插件，未授权时仅能检查元数据，缺 token/自填权限/断连拒绝授权；授权后经正式 MCP 分发真实执行其声明的 payload 参数，移除 provider 后保留并撤销原记录。Kernel 测试以真实排队交错验证撤权不产生副作用，以及检查授权期间替换提供方不执行新处理器。
- Contracts、Kernel、Local Host 构建通过，根启动器类型检查通过；日志 /tmp/mcp-grants-{contracts,kernel,host,types}.log。

这只是新动作入口的生产授权接线，不能标记 MCP 或整体 Goal 完成。授权 UI 尚未接入；能力库 Web 调用者仍有手写权限集合待收敛；旧兼容别名/平台工具继续沿用原开关与权限，尚未完全纳入逐客户端规则。MCP Client、工作流、Character/Agent、其余存量插件、全平台后台生命周期和统一调用记录仍继续。没有改动本轮产品界面，未重复浏览器验收或宣称用户本人认可。

## 对外接入的真实客户端授权界面（2026-09-25）

系统岛「对外接入」现从同一 Host 注册表展示新动作。选择客户端及 Home/项目后，可搜索、筛选、检查权限并授权/撤销；已保存的未知客户端会保留在选择器里。Runtime 名称来自现有适配器描述，不在 UI 维护白名单，不探测账号或执行插件业务。

授权读模型分别呈现未授权、已授权、授权已撤销、暂不可用、权限变化和原能力失效。权限变化不能自动扩大已保存授权；移除 provider 或删除项目后保留原引用，并允许撤销。默认开放的无额外权限系统查询支持显式拒绝记录，项目中的该客户端也遵守 Home 的撤销，其他客户端不受影响。

界面保存复用原同源/控制令牌 API 和 config/mcp-tools.json。保存期间禁用相关控件；服务拒绝时保留原状态；实际写入成功但响应丢失时提示“保存结果未确认”，刷新后从真实配置恢复。生产脚本已删除原型专用的模拟授权分支。旧工具仍在明确标注作用于所有客户端的折叠区，不伪称它们已服从新授权。

验证证据：

- /tmp/mcp-access-service-final.log：5 个测试文件、28 项通过，覆盖新授权管理/精确权限/撤销、生产 MCP、系统能力页和原 MCP 回归。包含随机 ID 插件的真实注册、断连、权限变化、提供方移除、实际项目删除后的保留与撤销。初次并发组合中生产 MCP 因 40 秒超时被取消；单独复验通过，最终以单文件并发的完整 28 项复验关闭该验证缺口。
- /tmp/mcp-access-browser.log：真实 Chrome 端到端 1 项通过。原生控件选择客户端/项目并保存授权，正式 stdio LocalMcpServer + 官方 SDK 创建 Alchemist 方向，原 Host 读到相同对象；第二客户端不能调用，撤销后原连接拒绝写入。另覆盖写入后响应丢失和刷新、随机 provider 的权限变化/断连/移除、空搜索、插件文本转义、默认系统查询的撤销/恢复、英文状态及键盘展开权限详情。
- Workbench/Local Host 构建、根启动器类型检查通过，日志 /tmp/mcp-access-{ui-build,host-build,types}.log。定向 diff 空白检查通过。
- 真实页面截图在 .impeccable/review/action-service/mcp-access/，1440/390 两种尺寸与明暗主题，以及窄屏权限详情。浏览器验证无横向溢出、窄屏可见操作按钮至少 44px。设计 detector 对本轮目标执行一次，结果为空；这不替代界面复核。

只使用隔离 Home、项目和临时客户端，无用户凭据、远端账号或模型调用。用户本人验收未进行。尚未完成旧工具逐客户端治理、MCP Client、通用工作流、动态用途/真实绑定跳转、首页与 Character/Agent、其余插件、全平台后台生命周期和统一调用记录，整体 Goal 保持进行中。

独立 UI 复核发现并修复 P1：选择新客户端/项目但未加载时，旧列表原本仍可操作。现在范围变化立即隐藏旧结果，明确提示先「查看能力」，搜索及变更处理器也拒绝旧范围操作；恢复已加载选择可继续。浏览器新增客户端/全局范围切换及旧 DOM 操作不写授权的回归，完整端到端再次通过；新增窄屏 pending-scope 截图。Reviewer 对这一项判定 resolved，SHIP 仅覆盖本 UI 切片。之后系统能力页/管理 API 两项定向复验通过（/tmp/mcp-access-scope-regression.log，与 28 项重叠，不累计），类型检查再次通过。已同步 surface brief、中文/英文 MCP 说明及插件开发/SDK 文档。

## Artifacts 网页与生产 MCP 接线（2026-09-25）

插件声明 `artifacts.browse/read/export/import.file/import.external/import.sources/goals.embeds/references.open` 八项动作；Host 注入原数据库 owner、可信 actor、Ledger 和受限文件读取器。已移除 HTTP 与 Goal 渲染中的直接读取/导入业务调用；传输层保留原 URL、下载编码、请求大小及错误语义。版本引用只包含 artifact_id/version，修正原读取模型把整条记录塞进引用字段的问题。

目录和调用遵守项目插件启停；可读取 Goal 本身时，即使成果插件停用，页面仍显示 Goal 和明确的成果不可读取原因，原 Ledger 引用不删除，重新启用恢复原版本。显式单数据库测试入口沿用其配置的 board，不要求伪造项目目录；正式项目仍逐次查安装记录。文件引用优先采用 Evidence 原始工作区，其次当前项目工作区，并保留服务启动者明确配置的 projectRoot 回退，不接受业务输入覆盖路径。

文档抓取使用实际 Host 的 Home 上下文。外部抓取完成、写入前再次检查调用授权、插件状态与取消信号；Notion 刷新等待按 Home 与连接引用隔离。同源内容复用、原 producer、personal scope、metadata、固定版本、HTML 原文和原限制均保留。外部来源目前仍使用该 Home 的既有默认账号选择，显式 connection_id 未完成。

验证证据（重叠复验不累计）：

- `/tmp/artifacts-actions-regression.log`：原模块/引用/受限插件客户端及 HTTP 共 23 项，22 通过、1 项暴露停用插件 HTTP 应返回 404 的映射问题；修复后 `/tmp/artifacts-consumers-final.log` 的浏览/导入/引用/历史 21 项通过。其另 1 项旧剪贴板浏览器用例因未进入当前工作视图失败，已修正实际操作路径并由下述浏览器复验关闭。
- `/tmp/artifacts-integration-final.log`：2 项 Host/生产 MCP 与外部导入等待测试通过。官方 SDK 经正式 LocalMcpServer 持久授权导入、读取，Host 读到同一记录和可信 actor；陌生客户端、撤权、项目漂移、伪造 producer/actor/root、缺外部读取权限被拒绝。重启、停用恢复和原文件字节验证通过。等待测试使用受控 Google Docs HTTP 响应，撤权、停用和取消均无落库，正常调用保存原文。首次 MCP 测试受 60 秒用例时限取消，延长多进程测试时限后该用例 40 秒通过；不重复计算。
- `/tmp/artifacts-new-tests.log` 中 OAuth 六项通过，包含两 Home 真正交错刷新、同 Home 合并请求、各自 token/refresh 持久化。该日志早期另两项 Artifacts 测试失败后已按上述结果修复，不把整个早期运行宣称全绿。
- `/tmp/artifacts-browser-final.log`：2 项真实 Chrome 用例全部通过。1440/390 导入真实本地文件、重复导入复用、原文读取与导出 JSON、显式 Goal 固定引用、停用仍可读 Goal/重新启用恢复，以及真实剪贴板拒绝/成功及原事实不变。截图 `.impeccable/review/action-service/artifacts/read-{1440,390}.png` 已查看。沿用既有布局；桌面旧独立目录左上导航有轻微重叠，保留为产品收尾项。窄屏为 Chrome 模拟，未做实体手机或用户本人验收。
- 浏览器首次运行未显式关闭默认模型配置，在 Goal 页面阶段之后的收尾等待挂起；未追踪到具体等待请求，已终止该隔离测试进程。正式复验显式禁止模型调用，使用正式项目启停策略，清理活动 HTTP 连接后正常结束。不将首轮挂起计作通过，也不把模型配置直接断言为根因。
- `/tmp/artifacts-goals-routes.log`：5 项 Goal 路由、编码、集合与缺失语义全部通过。`/tmp/artifacts-configured-root.log`：实际目录项目的显式工作区文件读取及原导入/隔离/导出用例通过；最后补查发现历史 Evidence 使用不带 project:// 的相对路径，现动作接受原两种格式并交给相同受限读取器，两种读取及越界/HTTPS/file URL 拒绝已实测通过。
- Artifacts/Local Host 构建和根启动器类型检查通过：`/tmp/artifacts-actions-build.log`、`/tmp/artifacts-host-build.log`、`/tmp/artifacts-root-typecheck.log`；定向 diff 空白检查通过。

下一段迁移范围已明确：`PluginArtifactClient` 当前是同步的 public SDK，仍直接消费原模块；`PluginInputsClient`/`PluginOutputsClient`、Characters、Shelf、Coding 的 context/material/plan/report/changeset 及 routes 依赖它。实际检查发现 Characters 发布依赖同步事务，因此改为共用 Kernel 的显式同步调用，保留真实消费者同步合同，保留 Manifest type/schema、producer 签名、个人 owner 与实时运行授权检查。内部 Wiring graph 用于判断固定引用状态的 owner 查询需与插件可调用的业务入口区分；不能为了统一而向普通 MCP 开放任意 producer 注册，也不能遗留两套公共读写实现。此段尚未实现，整体 Goal 继续进行。

## 插件成果 SDK 共同执行与存量消费者（2026-09-25）

上一节的 SDK 待办现已接通：Host 根据任意插件 Manifest/安装实例自动注册私有 `sdk.artifacts.<install_id>.read/publish`，作者客户端只做绑定和转发，实际业务读写仅在已注册处理器内执行。同步和异步派发复用同一 CapabilityRegistry、权限/作用域、注册实例与输入输出校验；没有第二份目录、数据库或成果身份迁移。同步处理器需明确声明，公共动作不能借 Host 同步入口绕过异步调度；异步授权/Host 策略/依赖策略均先拒绝，不启动业务处理器。

保留作者 SDK 的同步合同，角色的修订检查与发布继续位于原同步事务；Inputs/Outputs、Characters、Shelf、Coding 的材料、Goal 上下文、计划、报告和变更集实际读写已经经过共同 Kernel。安装、启动失败、崩溃、停止失败和重启分别清理注册并撤销旧客户端。能力目录反映真实 Runtime grant，私有 SDK 不出现在普通用户/MCP 工具中。Web 和插件开发入口必须显式注入同一 Host 的注册与同步调用端口；独立测试显式共享一个 Kernel，生产不创建兜底服务。同步处理器声明属于可信实现合同，不能把意外 Promise 被拒绝误称为自动回滚其已发生的副作用。

验证证据（存在交叠，不相加）：

- `/tmp/artifacts-sdk-regression.log`：13 项通过，覆盖真实插件启动、崩溃恢复、固定版本/类型/owner/grant、输出接线、消费者失效及原绑定恢复。
- `/tmp/artifacts-sdk-integration.log`：21 项通过，覆盖共同 ActionService、同步约束、Host、Characters 导入/发布 HTTP、Coding 角色引用及 Shelf 原文到 Coding。
- `/tmp/artifacts-sdk-consumers.log`：32 项中 31 通过；包括 Coding 原始目标、材料、计划、报告、子任务、工作树、升级、Builder、打包公共 SDK 的新开发目录样例及 Files/Git/Diff/Text Stats 接线。变更集测试原计数器把 Files 的项目浏览设置刷新也算成 Agent 读取，已按其业务断言改为只统计 Agent 读取；没有修改生产路径来放宽断言。
- `/tmp/artifacts-sdk-final.log`：上述变更集复验及原成果浏览/导入、角色事务、受限 SDK 共 24 项通过。新增验证 SDK 同步调用与目录中的异步调用读取同一记录，跨安装身份及伪造字段拒绝，缺 grant 的目录状态不可用，MCP 不能发现私有 SDK。
- `/tmp/artifacts-sdk-host-final.log`：11 项通过，包含最终同步权限/Host 公共入口隔离/异步依赖拒绝、正式 LocalMcpServer 与官方客户端的真实成果读写及外部等待撤权、真实目录项目角色发布、Coding 原始目标恢复、插件生命周期。
- `/tmp/artifacts-sdk-lifecycle.log`：最后补充崩溃、停止失败和启动失败后注册表确实清空，2 项复验通过。
- Contracts/Kernel/Artifacts/Local Host 构建通过；最后 Host 构建 `/tmp/artifacts-sdk-build.log`、根启动器类型检查 `/tmp/artifacts-sdk-types.log` 通过，定向 diff 空白检查通过。原生 API 签名保留，插件开发/SDK/Kernel 文档已同步。

本轮无视觉变更，没有重新进行浏览器或用户本人验收；没有真实外部账号或商业模型联调。Artifacts 的显式账号选择、其余插件业务注册与消费迁移、通用工作流、动态用途、首页、Character/Agent、MCP Client、后台独立生命周期、统一调用记录及旧工具治理继续，整体 Goal 保持 active。


## 项目插件后台启动、Diff/Text Stats 动作与嵌入发现（2026-09-25）

将七个项目 Runtime 插件的装配、缓存和关闭从 Coding 页面移到 `project-plugins.ts`。Host 的项目动作发现、检查和调用复用同一个实例，首次从 MCP 发现无需访问工作台；并发发现不重复注册，晚到的模型/PTY/工作目录适配器不改变绑定的用户、Home 和项目。关闭清理所有注册，失败启动清理已经启动的部分；某个 stop 失败不会阻止其余插件退出。

Diff 新增 `diff.state` / `diff.compare`，Text Stats 新增 `text-stats.state` / `text-stats.count`。原 HTTP 只转换输入并调用插件绑定的共享 ActionClient，业务处理器留在插件。绑定客户端仅调用自身声明动作，Host 固定本地入口身份；权限和 schema 由同一 Kernel 校验，停止/崩溃/启动失败后旧客户端（含零权限纯计算）不能随新实例恢复。

移除 Web 中 `embeddedCodingCompanions` 名单；Coding/Files/Git 通过 Manifest `ui.embedded_plugins` 声明嵌入读取器，HTTP gate 与动作策略共用传递解析。该关系不创建导航项或授予权限；未知缺失依赖不被猜测，循环安全，停用最后父入口会使能力不可用并保留授权引用。目录不存在的独立数据库/已删除项目不具备项目插件安装，返回不可用而不让 MCP 进程崩溃；其他目录错误仍上抛。插件版本及明确兼容来源同步更新，成果身份/端口/历史未改。

工程证据：

- `/tmp/companion-declarations-build.log`：Host 依赖图构建通过；`/tmp/project-plugins-final-build.log` 与 `/tmp/companion-tests-typecheck.log`：Host 构建及新增测试严格类型检查通过。
- `/tmp/companion-consumer-regression.log`：54 项通过，覆盖 Files/Git 实际 HTTP、固定快照及 Git 审阅历史、Character 发布、Coding 真实路由/接线、同步 SDK、场景和升级、Diff/Text Stats 内容语义。
- `/tmp/companion-final-regression.log`：15 项通过；包括 Artifacts 与 Alchemist 的生产标准 MCP 授权/真实读写，以及未知作者动作的 Kernel 路由、生命周期、晚到执行端口和嵌入声明。另一个文件因源码中旧 type re-export 被当作运行时 export 而未加载；已将三个类型改为明确 `export type`，单独复验见下方记录。
- `/tmp/companion-mcp-final.log`：独立复验通过。官方 SDK 启动正式 MCP 服务，未访问 UI 即发现四项能力；中文/emoji/CRLF 的字符、字节、行数与差异原文可还原。逐客户端授权、撤权、停用/恢复、重启后稳定 provider 引用和参数身份伪造拒绝均通过。
- Manifest v2 验证 14 项通过，新增嵌入声明验证覆盖自身、重复、非法 ID 和非数组；未知插件传递嵌入及循环解析另在最终目录回归通过。修改范围 `git diff --check` 通过。
- 旧 Workspace 插件已被项目设置服务替代，原 companion 测试仍断言自动安装它，已改为验证现有系统服务边界；未修改生产安装语义来迎合旧测试。缺少目录记录的独立 MCP fixture 现明确应用正式策略，暴露并修复 `catalog.project_not_found` 引发的发现崩溃。

剩余：Files/Git 对外业务动作及写入的可信调用者/个人成果归属，其他 Runtime 插件的 HTTP/MCP 旁路、Host 路由名单、全量通用工作流/场景配置、双向 MCP 与整体日志。此轮不宣称所有 Runtime 插件迁移完成，未重新做浏览器视觉或用户本人验收；Goal 继续执行。


## Files/Git 业务路由进入统一动作（2026-09-25）

Files 的 state、directory、open、capture 和 Git 的 state、select-diff、prepare-index、results、save-result 已由插件 Manifest 自动注册，原 HTTP 处理器仅转换输入并调用共享动作服务。所有结果仍出自原文件读取、Git、Artifact、私人存储和 Review owner；保留端口身份、版本、阅读位置、固定差异与审阅历史。Files 的浏览刷新会使旧工作区输出失效，按 operation 显式声明，未伪装成纯查询。

迁移限制如实可见：现有 Runtime 的 SDK/私人状态绑定启动用户，九项动作的 availability 会拒绝其他 actor，并说明不能借用个人身份。普通 MCP 客户端即使获得动作 grant 也不能冒充 web-user。本地用户已有业务路径已进入共同执行，**这不代表 Files/Git 已实现对外完整读写**。后续需将私人状态和成果发布/引用按真实主体完成迁移，同时收敛页面外 Agent/Git 审阅服务及精确依赖可用性；不将这条临时 owner 限制当最终架构。

同步保存前重新检查原授权、项目状态、Runtime grant 和取消。Git 创建审阅前通过内部 Capability 调用选项传递检查回调，服务处理器在实际创建前执行；回调与 JSON 业务参数分离，注册替换或原调用结束后失效，不保存在审阅中。原审批和暂存执行路径保持。新严格输入拒绝伪造 outcome/summary/result；旧 HTTP prepare-index 多带的 side 仅由薄适配器剔除，公开能力合同不接受这些无关字段。

验证：`/tmp/files-git-checkpoints.log` 12 项通过，包括正式 Host/真实文件与 Git 读取、固定 owner/producer/version、跨主体拒绝、真实等待中撤权/停用/取消无新版本、重新启用及重启保持、Git 原 HTTP 审批与暂存/失败结果归档、Agent 结果过滤及 Host 串行一致性。`/tmp/files-git-action-http.log` 的 Files 实际 HTTP 路径先行通过；初轮 Git 旧额外字段不符合新 schema，已显式处理合法兼容字段并更新伪造字段拒绝断言后由最终回归覆盖。

构建：`/tmp/capability-checkpoint-build.log`（Contracts、Runtime、Git、Host）与 `/tmp/files-git-final-build.log`（Host）通过。更多消费方回归和新增测试类型检查结果见本段后续记录。本轮无视觉改版，不声明浏览器或用户本人验收；整个 Goal 保持执行中。


补充验证：`/tmp/files-git-consumers.log` 27 项通过，覆盖 Files 实际 HTTP、Coding 伴随入口/接线、Runtime 服务、同步 SDK、旧上下文撤销、项目启动/关闭及 Host 动作队列。`/tmp/files-git-mcp-owner.log` 的标准 SDK 独立进程实测通过：后台发现原四项只读能力仍正常；为 Files.open 写入显式 MCP grant 后，外部 actor 仍被 owner 边界拒绝，不能冒充本地用户。`/tmp/files-git-types.log` 新增测试严格类型检查通过，修改范围 `git diff --check` 通过。


## Agent/Git 后台服务归属（2026-09-25）

Agent/Git 装配移入 `system-agent-service.ts`，原模型目录、MCP 连接与凭据解析只搬迁、不另建状态。Web 与显式 Home 的 LocalMcpServer 共用 `MolisWorkLocalHost.ensureAgentService`：同一 Host 一次注册，实际操作才初始化 SDK；关闭借用 Host 的传输不会撤回共享待审操作。Host 关闭等待项目调用结束后统一释放，重复关闭复用同一 Promise；Home 不一致拒绝，旧 ready 不能复活服务，惰性启动失败可重试。

核对发现 Prologue 的恢复把本地 live 集合之外的未派出审阅当成重启遗留并取消，因此当前不能让 Web/MCP 各自打开同一个执行目录。Node 适配器对显式 storageRoot 使用 OS 自动释放的 SQLite 独占锁；竞争进程在创建 runtime/恢复审阅之前返回 agent.storage_busy，正常关闭释放，异常退出由 OS 释放。未能正常关闭不主动释放所有权。这是必要的过渡保护，**跨进程统一执行方仍未接通**，不能把拒绝占用当成最终方案，也不能宣称不同独立进程现在能共同审批。

验证：
- `/tmp/system-agent-service-tests.log`：3 项通过。真实仓库在 Web 尚未启动时通过 Git 动作准备审阅，随后 Web 复用同一 Host 审批并实际改变暂存区；关闭 Web/MCP 借用入口后待审操作仍可执行，Host 关闭才撤回，重开保留已完成回执。独立竞争进程不能撤回活动审阅，SIGKILL 后另一个 Host 可重试初始化。未使用和初始化中的 Host 关闭均不遗留或复活执行器。
- `/tmp/system-agent-regression.log`：15 项通过，覆盖真实 Git HTTP、原 Agent Capability、标准 MCP 独立进程、Prologue Git 不确定回执/重启恢复，以及父任务完成/失败后的成果整合。
- `/tmp/system-agent-final-build.log`：Agent Host、Local Host 构建通过；`/tmp/system-agent-types.log`：新增测试及子进程 fixture 严格类型检查通过；本轮改动范围 diff 检查通过。

未完成仍包含：Files/Git 跨调用者的个人成果归属，独立进程访问同一执行方，目录按实际后端依赖报告可用性，Character/Coding 的公共动作与完整生命周期、全部存量消费者及总 Goal 其他清单。该轮无视觉改版，HTTP 实测不等同于浏览器体验或用户本人验收；Goal 保持执行中。


## Runtime 宿主依赖状态（2026-09-25）

旧 typed Capability SDK 增加只读 `availability(reference)`，使用 LocalHost 已有 Kernel 注册表，不创建第二份目录。查询仅接受 Manifest 声明消费的 ID，匹配实际版本、当前项目与可选提供方；缺失/不可检查/实例已停止均返回具体原因。检查不会打开业务 Runtime 或执行 handler。原公共动作的 `required_actions` 权限与异步递归策略保持，新的同步查询不授予调用权限，也不冒充给定参数、工作区或连接必然可用。

Files/Git 的九项处理器分别声明实际依赖：Files 状态只需浏览设置，其他文件动作再需文件读取；Git 状态和差异只需浏览设置/Git 读取，审阅准备与结果各自依赖对应宿主能力。目录、执行入口和原保存前检查共用状态，后端缺失时不会先读取目录或写入成果，注册/撤下/版本变化自动反映。正式 Runtime 转发 inspection，并令停止、崩溃恢复后的旧 Capability 客户端失效。SDK 文档同步说明边界。

验证：
- `/tmp/plugin-dependencies-build.log`：Contracts、Plugin Runtime、Files、Git、Local Host 构建通过；`/tmp/plugin-dependencies-final-build.log` 是后续 Contracts 重建。
- `/tmp/plugin-dependencies-tests.log`：15 项通过，覆盖正式 Files/Git 目录、缺依赖先拒绝、精确版本、注册/撤下及相互独立的依赖；原 owner、固定版本、撤权/停用/取消、真实 Agent/Git 后台服务仍通过。
- `/tmp/plugin-dependencies-await.log`：3 项通过，包含真实 Host 嵌套调用等待时撤下依赖，返回后 checkpoint 拒绝后续写入；重新注册后恢复；陌生能力 ID、项目/提供方隔离和不执行检查。
- `/tmp/plugin-dependencies-consumers.log`：13 项中 12 通过；旧浏览设置 fixture 只提供 invoke，新增合同正确报告不可检查，已给 fixture 声明它确实提供的唯一浏览能力。`/tmp/plugin-dependencies-consumers-fixed.log`：该 6 项连线回归及 1 项正式未知插件 Runtime/HTTP 测试通过，后者补充验证 SDK 状态查询转发和重启后旧客户端拒绝。生产代码未添加默认可用兜底。
- `/tmp/plugin-dependencies-workspace-types.log`：工作区全部包类型检查通过；`/tmp/plugin-dependencies-final-types.log`：新增及调整测试严格类型检查通过；改动范围 diff 检查通过。无视觉改版，不新增浏览器或用户本人验收结论。

后续继续完整迁移：上述只完成宿主依赖注册事实的检查，未完成独立进程统一执行方、Files/Git 真实跨调用者归属，以及完整参数/账号/连接就绪状态；其余插件与消费方清单仍保持原范围，Goal 未完成。

## 跨进程动作转发（2026-09-25）

生产 Web 在既有 origin/control-token/一次性键闸门之后挂载通用动作端点。只接受固定 Home、客户端与项目身份，执行方从目录解析项目，不接收数据库路径或权限覆盖；同一 `authorizeMcpActions` 读取原持久授权并在调用和业务 checkpoint 重查。客户端只连接数字 loopback，固定 Home/Host 实例、拒绝重定向、不自动重试、不在响应丢失时改成本地执行。输入限制为 16 MiB，非 JSON 对象返回明确参数错误。

正式 stdio launcher 在明确 Runtime Home 时使用该通道发现/执行公共动作；外部进程不再装配 Agent 执行器。进程内嵌入者仍可显式使用 Local Host。Runtime 项目连接更换、调用主体替换或入口关闭会中止原请求，常驻方在保存前检查取消。常驻服务没有启动时，只保留上下文工具，业务调用明确返回 service_unavailable。已改用实际 launcher 做标准 MCP 测试，删除本轮临时协议 fixture。

验证：

- `/tmp/action-gateway-launcher-tests.log`：4 项通过。官方 MCP SDK 启动实际生产 launcher，用原 Catalog 绑定会话，在独立进程自动发现常驻 Host 的陌生能力 ID；授权后真实写入项目 SQLite 并核对主体，重新打开 Runtime 后持久结果保持。包括撤权等待、项目切换取消、客户端/项目/Home 隔离、实例不匹配、身份伪造拒绝、JSON 参数错误、响应丢失不重试、重定向不转送凭据，以及实际 launcher 离线时上下文解析仍可用。
- `/tmp/action-gateway-formal-regression.log`：11 项通过，覆盖原授权/设置、生产 Alchemist MCP 读写及撤权、上下文恢复、Agent 生命周期和真实 Git 审阅/存储竞争。后续加强授权检查返回前的传输复查，`/tmp/action-gateway-final-tests.log` 的 9 项通道及授权回归通过；最终 launcher 实测见上一项。
- `/tmp/action-gateway-final-build.log` 和 `/tmp/action-gateway-desktop-build.log`：Local Host、Desktop 构建通过；`/tmp/action-gateway-launcher-types.log`：正式 launcher 类型检查通过；`/tmp/action-gateway-final-types.log`：新增测试严格类型检查通过。

剩余：旧平台、Native 和判断别名仍有本地调用，尚未完成唯一执行方的全量切换；Files/Git 外部主体的个人成果归属等待产品决定。临时锁、owner 限制不能当最终方案。工作流、场景、Character 和其余插件总清单继续，不因转发成功标记 Goal 完成。本轮无视觉改版，也没有新增浏览器或用户本人验收结论。

## 判断函数旧 MCP 名称统一授权与执行（2026-09-25）

上节所列判断别名已接入同一常驻服务：list/describe/invoke 的旧名字仍可用，但目录从已授权、实际可用的系统动作派生，调用复用相同 ActionClient。移除旧分支自行附加 functions:invoke 的权限旁路；客户端撤销 functions.list/functions.invoke 后，不能借旧名称继续读取或执行。旧开关保留为兼容名称开关，开启它不等于授予客户端执行权；现有调用者须在同一“能力 → 对外接入”授予 functions.invoke。目录描述、模块 README 和开发文档明确说明这个迁移行为。

模型结果返回后，通用 invoke 和精确版本的已发布动作都在历史写入、结果返回前重查原授权及取消。不会改写或删除既有规则、发布版本和判断记录。通用本机协议保留业务 Error 的稳定 code，判断未找到等错误不会变成没有业务含义的 transport_failed。此轮没有更改模型供应商或凭据存储。跨进程测试使用确定性的判断 Provider，实际启动器、授权、业务服务与存储均为生产代码；此轮没有新增真实 Jev/TypeSafe 网络验证。

验证：

- `/tmp/functions-alias-final-mcp.log`：21 项通过。实际产品 launcher + 官方 MCP SDK 验证常驻 Host 注入的真实判断处理器执行；新旧名字共用单客户端授权，另一客户端不能借权，连接缺失同步不可用，别名开关只影响该名字；模型等待中撤权后，通用调用及精确版本调用均无新判断历史；旧记录保持，业务错误码跨进程保留。其余覆盖 Native 兼容路由、设置、项目绑定恢复等回归。
- `/tmp/functions-alias-tests.log`：3 项通过，包含同一真实标准 MCP 路径早期验证和函数编辑/发布/HTTP、重开保留数据、两项目历史及取消试跑；后续增强的别名连接状态验证由上一项覆盖。
- `/tmp/functions-alias-consumers.log`：49 项中 46 通过；三个失败分别是旧 MCP fixture 未授权、旧 Form 文案断言及仅测 behavior 的夹具误带新增 Feed 动作。已增加明确客户端授权、核对当前描述和分离夹具合同，未放宽生产权限或绕过能力兑现验证。`/tmp/functions-alias-consumers-fixed.log`：受影响的系统判断/场景 27 项通过；该轮已通过的其他函数与通道回归不重复计算。
- `/tmp/functions-alias-compat-fixed.log`：MCP audience、上下文与项目生命周期 8 项通过。无 Home 服务时不能列出可执行的判断别名，旧静态目录断言已改成真实可用性断言。
- `/tmp/functions-alias-build.log`、`/tmp/functions-alias-final-build.log`：Functions、Local Host 构建通过；`/tmp/functions-alias-final-types.log`：新增及调整的 MCP/函数测试严格类型检查通过。修正夹具遗留类型和不再存在的 adapter 参数，没有引入 any 掩盖约束。

剩余范围：Native 旧名字和平台工具尚待统一授权/执行，工作流与用途、其余插件迁移仍继续；Files/Git 的跨调用者成果归属仍待产品决定。以上是判断兼容入口闭环，不表示整体 Goal 完成。未新增浏览器或用户本人验收结论。

## 六组 Native MCP 兼容入口（2026-09-25）

Form、Dataset、PPT、Pages、Cognia、Jelly 的原名称现共用精确客户端动作授权及常驻 Host。插件兼容声明用 required_actions 引用动作 ID/版本，未指定 provider 则必须属于本插件；引用缺失、版本/提供方不符、未授权或不可用均不展示旧工具。组合工具覆盖全部分支及补充读取：Pages list 的模板、翻译并新建所需动作，Jelly 自动读取 revision 和重复实例变体。较窄授权可使用原子动作，兼容开关本身不授予权限。

删除五个插件的 LegacyMcpPermissions helper、旧 Host 权限参数与三份包装文件（mcp-store-plugin-adapter、mcp-cognia-tools、mcp-jelly-tools）。mcp-native-plugins 只保留历史参数/结果处理器；正式调用统一使用 authorizedActions 和本机通道，Home 能力仍使用 Home 上下文。陌生插件没有历史 adapter 不再导致 Host 装配报错，其新动作继续自动发现。保留必要的旧名字和插件自有复合结果适配，不保留重复 Store 或权限目录。

验证：

- `/tmp/native-alias-integration-final.log`：2 项通过。官方 SDK 启动实际产品 launcher，六组兼容名在只有开关时不可调用，逐动作授权后真实跨进程读写；验证同一 canonical 入口读到相同记录、客户端和项目隔离、重新打开后的持久结果。Pages 模型等待后撤销 create 授权不会新增文稿，恢复后保留翻译并新建结果；Jelly 缺少 revision 读取授权时旧写工具不可用。模型采用确定性测试 Provider，不代表新增真实模型网络验收。
- `/tmp/native-alias-regression.log`：37 项通过，覆盖旧目录、设置、Cognia Home 查询、Forms/PPT 持久读写、重新绑定、Manifest 校验。旧 fixture 改用真实 Catalog 项目和显式动作授权。
- `/tmp/native-alias-contract-tests.log`：2 项声明/目录定向测试通过，覆盖非法和重复引用、旧下划线名称，以及另一 provider、错误版本、复合依赖不齐时不能出现旧工具。
- `/tmp/native-alias-consumers.log`：39 项中 35 通过，包括通用转发、判断别名、Jelly 动作/兼容行为等。受授权变更影响的 Pages promote fixture 已补充真实项目和授权，`/tmp/native-alias-promote.log` 单独验证实际 Artifact 版本通过。另三项不一致尚未处理：purge 名单缺 context-onboarding；Schedule 导航断言与当前目录面不符；Workbench pack 和 catalog 插件集合不同。需要在整体收尾核对实际产品合同，不能将该组结果写成全绿。
- `/tmp/native-alias-build.log`：Contracts、六个插件、Workbench、Local Host 构建通过；`/tmp/native-alias-workspace-types.log`：全部工作区包类型检查通过；`/tmp/native-alias-types-final.log`：新增/调整 MCP 测试严格类型检查通过。设置页中英文说明已同步，后续 Workbench 构建见 `/tmp/native-alias-copy-build.log`。

初版整合测试漏传 Pages AI 的必填 text，等待模型 barrier 未达；已停止确认为本次测试的进程，补齐原合同并增加提前失败检查后由最终日志通过。没有修改生产 schema 来放行错误输入。未操作用户常驻进程。

剩余：平台/Goals/事件的旧权限与本地分发、完整工作流和函数用途、其余插件生命周期、Files/Git 外部成果归属，以及上述三项产品回归不一致。此轮仅调整设置页说明，没有新增视觉布局；没有新增浏览器或用户本人验收结论。Goal 保持执行中。

## Runtime Web 自动分发与回归修正（2026-09-25）

web-request 与 coding-surface 两层固定插件正则名单已移除。内置插件的项目启用策略仍从 catalog 派生；Shelf 同时提供原生页面与 Runtime 路由，按 Manifest 路由声明接入，不能只接受 kind=app。其他注册插件交由当前项目 supervisor 和 Manifest/contribution 路由判断。无实例或未声明路径交回后续分发，失败实例返回真实不可用错误，重启不能隐式重新启用已撤销实例。控制令牌、origin 与一次性键继续由原 Web 边界检查。

PluginPlatform 删除 last-start entries 路由快照，改从 supervisor 当前 states/manifest 派生，追加注册不会丢失既有插件路由。Files 的旧设置刷新只在声明消费其产物类型的插件调用前执行，不让无关插件读文件或发布成果。Coding 的 report/runs 等页面加工限于 Coding；Diff/Text stats 的呈现匹配精确插件 ID，陌生插件同名字段原样返回。

回归修正：个人 purge 清单补上实际已使用的 context-onboarding；Coding 目录检查改为实际独立目录；Workbench 覆盖测试从只比较静态 pack 改为同时真正启动 Runtime，逐一检查未被静态装配的 app 及其已声明视图贡献。保留临时 Home 中真实 purge 和实际 Artifact promote 验证。历史恢复测试显式构造 Diff 1.3.1 安装，避免 createDiffPlugin 升版后夹具误变成当前版本却仍断言旧版本；未放宽生产升级兼容性。

验证：

- `/tmp/runtime-http-final-tests.log`：22 项通过。含陌生 ID 插件经过正式 Web 服务的真实 SQLite 写入、无令牌拒绝、严格输入、跨项目拒绝、撤销启用后不再写入、重启不能恢复授权、重新启用后恢复；原 Coding 草稿与项目隔离、进程重启、旧安装崩溃/隔离恢复，以及上述个人插件回归。直接路由集成还验证新增插件保留原路由、陌生响应不被加工、无关调用不刷新 Files。
- `/tmp/runtime-http-consumers.log`：24 项通过，覆盖 Coding/Files/Git/Diff/Text stats、产物传播、项目能力与实际 MCP 消费。`/tmp/runtime-http-tests.log`：10 项初步路由/面板/升级回归通过，其中陌生路由测试在最终组再次运行，不重复计数。
- `/tmp/runtime-http-build-final.log`：Local Host 构建通过。`/tmp/runtime-http-test-types-final.log`：新增路由集成、个人插件回归和旧版本恢复测试严格类型检查通过；修正测试 source/dist 私有类型混用及 Pages fixture 的实际端口类型。scoped diff --check 通过。

范围仍有限：本步验证已注册实例经 Web 分发，不代表发行物安装、所有插件业务动作、完整工作流/场景消费都已迁完。平台/Goals MCP 旁路、Files/Git 对外成果归属和总清单其余项继续保留。没有新增页面布局、浏览器实操或用户本人验收结论；Goal 保持执行中。

## Goals 目录、创建与便笺（2026-09-25）

Goals Manifest 新增 goals.list/create/note 三项 project 动作，完整声明业务输入和目录/回执输出，使用 goals:read 或 goals:write。Host 仅装配原 GoalEventApplication 和 board；处理器仍由 Goals 插件提供，不新增业务 Store。公共输入拒绝 actor、board 和权限字段，按可信调用上下文绑定真实身份；模型调用创建缺省使用 runtime 来源。

旧 createGoalIntentCapability、listGoalDirectoryCapability、recordGoalNoteCapability，以及 Coding 消费的 goalContextCapabilities.list 已转调同一 Host ActionClient。内部适配器保留原可信身份、来源默认值和 idempotency key，检查 board 与已绑定项目一致，限制到精确提供方/动作，并将原 beforeEffect checkpoint 传给新调用。新增的可选 ActionCallContext.actor_kind 是可信审计元数据：null 保留原未记录分类，不把它补写为用户；业务参数不能设置它，字段本身不授予决策权限。已有记录和幂等回执不改写。

验证：

- `/tmp/goals-actions-contract-final.log`：13 项通过，含官方 MCP SDK 启动实际产品 launcher，通过常驻 Web Host 发现逐项授权后的动作、创建目标、保存便笺、读取目录及原事件正文；伪造身份拒绝、撤销便笺动作授权后公共工具不可见且不可写。新旧 typed/动作入口共享幂等回执，验证真实分页、原未知 actor kind 保留、跨项目/board 拒绝及旧 typed 入口确实经过实时动作策略。其余覆盖旧 MCP 状态/决策、Session 身份和 Local Host 共用写入/恢复。
- `/tmp/goals-actions-final-tests.log`：47 项通过，覆盖 Goals 事件、状态、规划及 Session 活动，含新集成测试的早期版本；不与最终组重复计数。`/tmp/goals-actions-regression.log`：12 项通过，包括 Coding 的真实目标上下文与重开关联。
- `/tmp/goals-actions-boundaries.log`：23 项中 22 通过；唯一失败为既有页面断言把整个 HTML 的“补充说明”和其他表单“可选”串到一起。现限定实际 data-goal-tree-decision-form，保留必填理由、预填冲突和真实 HTTP 提交检查。`/tmp/goals-actions-recheck.log`：该项及两项动作集成共 3 项通过，未修改生产页面来匹配测试。
- Contracts、Goals、Local Host 构建通过，见 `/tmp/goals-actions-contracts-build.log`、`/tmp/goals-actions-build-final.log`、`/tmp/goals-actions-host-build-final.log`。`/tmp/goals-actions-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-actions-test-types-final.log` 新增测试严格类型检查通过。scoped diff --check 通过。

本步之后的 Web 迁移见下节。旧 MCP 三项业务虽经 typed 适配调用动作，其目录授权与进程仍走平台兼容路径，尚未切到精确动作授权/常驻通道；本轮公共 MCP 验证不覆盖这个遗留缺口。状态/事件/决策等其余 Goals 能力、工作流用途和其他总清单项目继续执行，不把三项动作注册视为 Goals 全量完成。

## Goals Web 消费与异步操作记录（2026-09-25）

Web 创建目标、记录便笺及首页胶囊目录现在使用 Host 绑定的同一动作客户端，执行原输入校验和实时动作策略。GoalsHttpContext 及同步观察代理不再提供这三项旧方法。HTTP 仅保留旧表单字段转换、状态码及回执，用户/项目上下文由 Host 绑定；Casebook 在 await 后记录一次结果或失败，沿用 web.goal-events.v1、操作身份及原业务引用，不重复记录公共动作。

目标树批准事务内部调用 createIntent 是同插件内的事务实现，保留此调用；此前将其列为需直接异步替换的旁路不准确。需要迁移的是目标树对外能力及实际消费边界，不能拆开批准事务。

验证：

- `/tmp/goals-web-actions-test.log`：真实 Web 服务、SQLite 和 Casebook 授权下验证无控制令牌拒绝、异步等待只记尝试、返回后保存原文与作者、重试复用业务事件、胶囊读取经过动作策略，以及等待中停用后记录失败且不写业务事件。
- `/tmp/goals-web-regression.log`：25 项通过，覆盖现有 HTTP 目标/事件/决定/树结构、Casebook 同意与撤销、观察渠道及操作回执。
- Goals、Local Host 构建通过，见 `/tmp/goals-web-build.log`、`/tmp/goals-web-host-build.log`；`/tmp/goals-web-workspace-types.log` 全工作区类型检查通过，`/tmp/goals-web-test-types.log` 新集成测试严格类型检查通过。

该步发现的旧 MCP 会话作者与授权兼容问题在下节处理。Feed 提升、项目恢复摘要、其他 Goals 事件/决策及总清单其余项仍待迁移。本步无页面布局变更，未新增浏览器视觉或用户本人验收结论；Goal 保持执行中。

## Goals 三项 MCP 兼容入口收敛（2026-09-25）

goal_intent_create、goal_list、event_note 现在只把旧名称映射到 goals.create/list/note，schema 从动作合同派生，保留 goal_url 和 JSON 回执。发现及调用均依赖精确客户端/项目/provider/version 授权；原全局开关只决定该名称是否可用。正式 launcher 通过原通道调用常驻 Host，management 同样需要绑定项目与授权，不能再从这三个工具传入任意数据库或作者。其他管理工具合同未在本步隐式改变。

授权主体 actor_id 与可选可信审计作者 audit_actor_id 分开。兼容写入从宿主 Session 生成原 runtime:<client>:<session> 作者，原数据和幂等域不变。传输只携带独立 Runtime Session 元数据，服务端根据客户端推导作者，不接收自由作者覆盖。新公共动作保留原客户端作者语义；重试需保持原工具与身份上下文。Session 活动仍在成功后记录，并按原业务键去重。

Host 原观察点新增可信 caller 参数，Casebook 把 MCP Goals 动作投影为原事件观察合同，保留 local-host.capability.v1 渠道及实际业务引用。Web 和 typed 观察不重复；等待、失败、重试沿用原结果语义。删除三项旧事件 schema、处理器、switch 分支、身份注入分支及无消费者的旧事件名称集合；其余事件工具继续列为待迁移。

验证：

- `/tmp/goals-alias-final-tests.log`：70 项中 67 项通过。包含真实 stdio launcher 的旧回执重试、作者保持、共享权限策略、旧/新名撤权、伪造拒绝、管理参数边界、Casebook 单次记录、Session 去重及既有 Web/Coding/Goals/通道回归。失败为两处旧规划 fixture 缺少显式动作授权及并行负载下 Web launcher 超过原启动观察时限；未放宽生产权限或更改启动断言。
- `/tmp/goals-alias-recheck.log`：14 项全部通过，覆盖补齐授权后的规划回归、原 Web launcher 检查、真实 MCP 集成及新增传输伪造作者拒绝。重复用例不累计为新增覆盖。
- `/tmp/goals-alias-packaged-e2e.log`：实际 npm 打包、全新安装、常驻 Web 服务、通过正式设置 HTTP 授权、旧 MCP 创建/便笺、重启重试、卸载与升级全流程通过。
- `/tmp/goals-alias-cleanup-tests.log`：最后删除旧身份注入分支后，真实 MCP 和事件/状态回归 9 项通过。Runtime Skill 已补充精确动作授权、保持原工具/会话重试及服务离线的只读诊断；不把打开页面当成执行前置条件，也不允许自授权限或偷偷安装常驻服务。
- Contracts、Goals、MCP 与 Local Host 构建通过；`/tmp/goals-alias-host-build.log` 为最后 Host 构建记录。`/tmp/goals-alias-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-alias-test-types.log` 新集成和调整的事件/规划/入口测试严格类型检查通过。

仍待：其他 Goals 状态/事件/决策/规划工具、Feed 提升和项目恢复摘要、其余插件与完整工作流/场景/Character 消费，以及 Files/Git 成果归属选择和整体系统岛体验验收。没有新增视觉布局或用户本人验收结论；Goal 保持执行中。


## Goals 状态与历史查询收敛（2026-09-25）

Goals 新增 goals.state.read、goals.directory.read、goals.events.list/latest/read、goals.timeline.list、goals.history.list/read 八项动作，现共 11 项。状态及事件输出合同包含约定、要求、来源、完整类型版本、动态报告文本、决定、关闭和迁入完成历史；不存在的目录项/历史正文保留 null。业务所有权仍在插件，Host 只注入本项目原 owner、快照和日志。混合历史排序与读取在原同步组合内完成。

typed 的状态、事件正反向列表、时间线和正文，Coding 的目标状态，以及项目恢复摘要的目录/焦点查询已转调共同动作，保留 Host 原组合调度范围。HTTP 四类读取转为 await 动作；历史缺失返回 404，旧分页参数保留默认/上限规范化，HTML 转义和旧 Run/Evidence/Review/Journal 正文保持。删除 HTTP 旧 lookup 实现及无消费者的快照/日志/读取端口。

旧 goal_state/event_list/event_read 改为共享授权动作的薄别名，保留 goal_url/JSON 返回，删除三项重复工具 schema、旧处理器、switch 和身份注入名单。新旧名发现和调用均校验客户端/项目/provider/version 授权；读取撤权不影响另行授权的查询。Casebook 每个公开查询只保留一组尝试/结果，Web、MCP 原渠道保持，历史组合内部不重复观察。SDK/插件说明、MCP 中英文文档及 Runtime 使用说明同步六个旧名称的授权要求。

验证证据：

- `/tmp/goals-query-tests.log`：首轮 25 项中 24 通过；一处故障注入测试在故意破坏 Home 后继续读取授权查询，已改为读之前恢复真实 Home，未放宽生产授权。最终复核见 targeted 组。
- `/tmp/goals-query-targeted.log`：17 项中 16 通过，包含真实 stdio 六个旧名称、读写独立撤权、查询单次观察、输入伪造拒绝、Web 实际策略和原 Session 故障处理。唯一失败是 v35 fixture 的历史 board ID 与现 demo 常量不同；改用旧 dump 的真实 ID，原 SQL 数据不改，`/tmp/goals-query-history.log` 单独通过。
- `/tmp/goals-query-final-tests.log`：清理旧 HTTP 端口后 31 项通过，包括四类真实 v35 dump 的状态/事件输出、原文与 HTML 转义、双向事件分页、混合历史连续分页及旧正文、缺失 null/404、作用域拒绝、typed/Coding/恢复查询实时策略、Web 单次观察，以及原决定/状态回归。
- `/tmp/goals-query-consumers.log`：6 项通过，覆盖同一 Host 写入/重启、竞争写入不拆散组合、Runtime Skill 流程。`/tmp/goals-query-resume-planning.log`：9 项通过，包括目录窗口外的 Host/Session 焦点恢复和原规划行为。
- `/tmp/goals-query-public-mcp.log`：2 项通过，官方 stdio + 标准 MCP SDK 实际读取公共状态、完整事件、历史 HTML，以及缺失目录项的 null 回执；MCP 对联合/可空输出按现有 result 信封返回。`/tmp/goals-query-public-types.log` 对这组测试的严格类型检查通过。
- `/tmp/goals-query-packaged-e2e.log`：打包后的真实安装、Web、设置 HTTP 授权、旧 MCP 状态/事件查询、重启、卸载与升级流程通过。测试通过后仅删除未使用的 HTTP 注入端口；相关包重建和清理后回归通过，没有改变包入口。
- Goals/MCP/Host 构建通过，`/tmp/goals-query-build.log` 与最后清理后的 `/tmp/goals-query-cleanup-build.log`；`/tmp/goals-query-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-query-test-types-final.log` 新查询、Web/MCP、旧数据和状态 fixture 的严格类型检查通过。

边界：此轮没有新增视觉布局，不产生浏览器视觉或用户本人验收结论。其他 Goals 写入/决策/规划、文档页组合、Feed 提升、MCP 连接/恢复摘要的外层权限，以及其他插件、工作流/场景/Character 和 Files/Git 归属问题继续推进。Goal 保持 active。

## Goals 普通工作写入收敛（2026-09-25）

新增九项插件动作：goals.events.configure/report、goals.progress.record、goals.concerns.apply、goals.decisions.request/cite、goals.agreement.set、goals.closure.submit、goals.work.resume，当前 Goals 共 20 项。输入输出使用同一组事件/状态合同，报告输出明确为 report 类型；版本、至少两个决定选项等约束与实际业务对应，进展保留 Artifact 来源和原 CAS 条件。处理器仍调用原 GoalEventApplication，审计 actor/分类及 board 从可信上下文绑定，事务、批量原子性、幂等域和完成判定不另建实现。

九项 typed 消费和 Coding 的 goalProgress.record 已转调共同动作。Web 的八个原写路由（引用决定原本没有单独路由）转为 await 动作；唯一保留的同步 goalEvents 口是尚待单独迁移的受保护用户决定。Casebook 的普通工作写入均在实际返回后记录一次结果，保留事件引用；原 Proxy 已缩为仅包装用户决定。

九个旧 MCP 工作名称改为动作别名，现共 15 个兼容名称通过精确客户端/项目/provider/version 授权及常驻 Host。删除对应旧 handler、工具 schema、switch 和身份注入集合，以及五组无消费者的参数定义。错误展示只在共同 schema 拒绝后保留原非法收尾种类、缺少版本、Concern 动作及继续原因诊断；不另跑旧业务或退回本地路径。旧管理模式不能再通过已迁移名称自填数据库/作者，无项目授权时拒绝；用户决定原受保护管理入口的合同暂留。

验证证据：

- `/tmp/goals-command-final-tests.log`：4 项通过，包括正式 stdio + 标准 MCP SDK 实际执行九项公共写入、完整报告正文和作者、独立撤权后无新增报告、Web 配置及报告在异步策略等待后单次记录、领域版本/批量失败/用户验收/收尾和继续。新增测试最初缺少真实 Concern 范围、两个可区分选项及问题后的支持事件，按原业务约束补全输入，未修改领域规则。
- `/tmp/goals-command-restart.log`：新增拒绝后事件游标不变、关闭 Host 后再打开并重试原报告的检查通过；原 event_id 与游标保持，无重复记录。历史配置回执按持久化 JSON 比较，避免把 undefined 键和对象原型误当成业务差异。
- `/tmp/goals-command-compat-final.log`：11 项通过，覆盖旧 MCP 工作/状态/决定流程、请求时约定与过期批准拒绝、稳定 Session 作者、正式 stdio 的配置/报告重试、精确授权与 Casebook 单次观察，以及 Session 索引实际故障和重试修复。故障注入改为临时 SQLite trigger 只拒绝辅助 report 索引，不破坏承担授权身份的 Home；主报告仍提交，恢复索引后同一报告重试不会重写业务。
- `/tmp/goals-command-regression.log`：首轮 30 项中 24 通过，覆盖 HTTP/Coding/规划等原行为；6 个失败来自旧诊断码、一个仍用无授权管理参数做用户修改的 fixture、两处破坏整个 Home 的故障注入，均在上述最终组处理。fixture 的用户修改改由可信 Host typed 入口建立，旧管理 MCP 仍验证过期批准被拒绝，并明确验证未授权普通工作别名不可用。
- `/tmp/goals-command-targeted.log`：Coding 报告持久化与用量 6 项通过；同组早期新增业务测试失败已由 final/restart 组修正。`/tmp/goals-command-formal-mcp.log` 中 CLI/同一 Host、原六项别名扩展、默认工具面等 11 项通过，公共写入新测试的输入缺口已由 final 组修正。
- `/tmp/goals-command-packaged-e2e.log`：现有打包后的安装、Web 设置真实授权、MCP 目录/状态、重启、卸载与升级流程通过；新工作名称已要求显式授权，不能因旧全局开关开启而自行获得权限。
- Goals/MCP/Host 构建通过，见 `/tmp/goals-command-final-build.log` 和删除最后废弃 schema 后的 `/tmp/goals-command-cleanup-build.log`。`/tmp/goals-command-workspace-types.log` 全工作区类型检查通过；`/tmp/goals-command-test-types-final.log` 新业务、正式 MCP、Web、旧状态和故障注入测试严格类型检查通过。对应 diff --check 和旧分发残留搜索通过。

剩余：用户决定需要单独迁入受保护来源合同，不能用 goals:write 或 Runtime 的 actor/user_confirmed 字段代替；进展回执、规划/树、页面组合、Feed 提升及 MCP 连接摘要授权继续迁移。其他存量插件、完整工作流/场景/Character、Files/Git 归属及系统岛实际体验仍属于总目标。此轮没有新增视觉布局或用户本人验收；Goal 保持 active。

### Goals 进展回执查询（2026-09-25）

在上述九项写入之后补齐 `goals.progress.receipt`，Goals 共 21 项动作。沿用原 owner 的 actor/goal/idempotency 查询和持久回执，作者由可信审计上下文绑定；结果不存在返回 null，不新建进展。Coding 原 typed receipt 删除直达 owner 的接线，转入同一动作与策略检查；标准 MCP 自动发现并按精确授权提供查询，未增加兼容别名。

进展来源检查确认原业务只校验引用格式，并不会读取 Artifact 验证内容。已修正动作说明，明确来源是提交者的引用，只有 Goal 预期版本在原事务中比较；不新增“来源已验证”的语义或第二套验证状态。

- Goals → Local Host 构建通过：`/tmp/goals-receipt-build.log`。
- `tests/goals-command-actions.test.ts`、`tests/goals-actions.test.ts`、`tests/coding-report-persistence.test.ts`、`tests/coding-report-usage.test.ts`：9 项通过，日志 `/tmp/goals-receipt-tests.log`。包括标准 MCP 保存后读取/null/伪造作者拒绝、真实 Coding 路由、同作者不同目标/不同作者同键隔离、typed 停用拒绝及重启回执保留。
- 两个修改的测试文件严格 TypeScript 检查通过：`/tmp/goals-receipt-test-types.log`；修改范围 diff 空白检查通过。

前一段待迁移项中的进展回执已完成；用户决定、规划/树、页面组合、Feed 提升、连接摘要及其他插件/系统消费仍继续。未宣称整体完成或用户验收。

### Goals 用户决定与旧 SDK 旁路（2026-09-25）

新增 `goals.decisions.record`，当前共 22 项动作。它要求 user audience、独立 goals:decide 权限及 Host 注入的 user_action 出处。普通 Agent/MCP/workflow/plugin 不能发现或执行，也不能通过权限配置导出为普通 MCP。参数不能自填 actor、authority 或 user_confirmed；原 Governance 校验、请求承诺基线、事务、决定身份和回执保持不变。Host 对等待中的调用保存出处快照。

Web 决定路由改为 await 共同动作，删除 GoalsHttpContext.goalEvents、同步 observedWebGoalEvents 及其装配。旧 typed 决定适配转入同一动作并检查项目 board；受保护管理 MCP event_decide 继续薄转发此适配，业务 schema 改由 canonical action 派生。清除三个无人使用的旧参数定义（requirement revision、agreement change、scope）。Casebook 异步后只观察一次结果，并保持旧决定 author-under-authority 的观察形状，以兼容既有 request-key 比较。

实际检查发现旧 PluginCapabilityClient 仅凭 consumes 就能调用 typed 决定并自填 authority。已将该旧入口声明为 host_only；Plugin SDK 在查询及调用时固定携带 plugin 消费者限制，经 PluginHostExecutor 转发到 Host。Host 按注册定义检查，参数中的假描述、host_only:false、consumer:undefined 不能解除限制。限制以 Host 内部调用标记保存，保留其他旧 typed 消费已有 audience 行为，不把整个 SDK 统一改成另一类调用者。未知 ID 的正式 Runtime 插件声明这一接口仍被拒绝；Host 原用户适配可继续调用。

验证：

- 初始决定/领域状态/标准 MCP/管理 MCP/Casebook 定向回归 40 项通过：`/tmp/goals-decision-tests.log`。
- 进展后的决定原子性、Web、管理 MCP 5 项通过：`/tmp/goals-decision-final-tests.log`。通过在 Governance 已写入后的事件 INSERT 处制造真实失败，验证事务回滚、恢复重试及无重复决定。
- SDK 边界较宽回归 37 项中最初 36 项通过；一项项目设置读取暴露“将所有旧 SDK audience 改成 plugin”不兼容。已调整为 Host 内部限制标记，相关决定/未知插件/项目设置/checkpoint 9 项全部通过：`/tmp/goals-decision-consumer-tests.log`；其他原通过项保留其验证范围。
- 正式未知 Runtime 插件、Web 决定、管理 MCP 及 Casebook 回归 14 项通过：`/tmp/goals-decision-production-tests.log`。最终观察兼容调整后的 Web 回归通过：`/tmp/goals-decision-observer-web.log`。原 Web 测试一次失败源于 fixture 在等待前判断停用状态，已改为等待后读取当前策略，无生产语义放宽。
- Contracts、Kernel、Runtime、Goals、MCP、Local Host 构建通过；全工作区 typecheck 通过（`/tmp/goals-decision-workspace-types.log`）。最后的 Host 调整重新构建通过；六个修改测试文件严格类型检查通过（`/tmp/goals-decision-final-type-tests.log`），修改范围 diff 检查通过。

前述待迁移的用户决定已完成。下一步继续规划/树/生命周期、页面组合、Feed 提升及 MCP 连接摘要；其余插件、工作流/场景/Character、系统岛完整实操及 Files/Git 归属选择仍在总体范围内。没有修改用户数据结构或宣称整体完成，Goal 继续 active。

### Goals 项目规划与真实设置入口（已实现验证）

新增五项项目动作 read/save/apply/impact/graph.check，Goals 当前共 27 项，26 项可按精确授权导出普通 MCP，用户决定仍为受保护动作。Planning Engine 保留方法规范化、版本、事务、项目覆盖和图算法；Host 从同一个人方法快照提供采用来源。采用完整复制事件类型和默认要求，版本继续遵守原 owner 规则，不新增自动重试或幂等承诺。

原 typed 四个接口、Web 项目 API、方法详情/编辑及 settings hub 的实际优先读取入口改走共享策略。真实 HTTP 测试发现 settings hub 曾提前消费规划页，现已封住此读取旁路。网页编辑器原来会清空未展示的事件类型/默认要求，也已随本次修复，经过转义的表单数据保留完整配置。现有抽屉式设置交互保持，浏览器测试更新到当前按钮和异步面板路径。

四个规划 MCP 旧名称变成薄别名，目前共 19 个 Goals 兼容名称；保留轻量目录、按 ID 顺序选择、正文及 catalog_id 展示，实际读写和授权只有一条路径。旧 handler、工具总表、switch、身份注入集合和五组无消费者 schema 已删除。普通模型仍不能通过规划确认字段获得 Goal 用户决定权。

验证：
- `/tmp/goals-planning-final-regression.log`：60 项通过，覆盖原规划算法/循环检查/版本、三组规划采用与真实报告、旧 MCP 行为、事件状态和 UI 渲染。
- `/tmp/goals-planning-version-tests.log`：5 项通过。正式 launcher + 官方 MCP SDK 执行全部五项规划动作、撤权后不可发现/执行且版本不变；实际 Host/SQLite 验证项目隔离、旧 typed 策略拒绝、完整配置、版本及重启；真实 Web API/设置页面均受策略约束；个人覆盖采用后以项目方法配置 Goal 并实际保存工程交付记录。
- `/tmp/goals-planning-browser-http.log`：3 项通过，其中实际 Chrome 完成个人复制、网络失败保留输入、重试保存、项目采用、面板编辑停用和刷新。事件类型和默认要求全程保持，个人源不受项目修改影响。
- `/tmp/goals-planning-alias-tests.log`：7 项通过，包括正式 MCP 历史作者/回执及协议无重试行为。其规划用例在保留原版本规则后再次通过上面的最终 5 项。
- Goals、MCP、Local Host 构建通过（`/tmp/goals-planning-final-build.log`、`/tmp/goals-planning-hub-build.log`、`/tmp/goals-planning-version-build.log`）；四个相关非浏览器测试文件严格类型检查通过（`/tmp/goals-planning-test-types.log`）。单独加入浏览器夹具的临时类型命令暴露既有 source/dist 私有类型混用，未扩大本次生产接口；浏览器运行验证通过。scoped diff 检查通过。

剩余 Home 个人方法管理/运行时刷新、目标树/生命周期/长期说明、整页组合及连接摘要；其他插件、完整工作流/场景/Character 与系统岛仍继续。此处是项目规划范围完成，整体 Goal 保持 active，未宣称内部完整或用户本人验收。

### Goals 长期说明及 Prompt 消费（已实现验证）

新增 guidance.read/add/update 三项，Goals 共 30 项，其中 29 项可按授权导出 MCP。原 GuidanceCommands 仍负责规范化、去重、容量、不可变修订、Prompt 前缀和幂等回执。动作绑定项目及可信审计作者；保留精确内容、原因、确认摘要和用户确认前提，不能借此产生 Goal 用户决定。

typed、三个旧 MCP 名称、Web API/settings hub、Work 的开始提示词及 Agent Host 项目层已共用动作。旧 MCP 共 22 个兼容名称，删除独立 goal-commands handler、导出、工具表、switch、身份列表和无消费者的编译产物。原 wire 测试替换为真实 Host/SQLite 集成，保留历史回执与项目隔离检查。连接摘要原 typed 读取也转入共同动作；摘要外层客户端权限仍按总迁移清单继续审计。

Agent 的项目 Prompt 原来用启用条数作为版本，编辑不增版；现在使用已有修订数。真实 Host 起跑交给探针适配器的两份正文及版本不同，之前的运行不受后续编辑影响，读取策略拒绝时不注入不可读说明。适配器为测试探针，没有调用外部模型。

Web 写入和后续刷新分别授权：已保存后刷新被拒绝时仍返回真实保存回执，project_guidance 为 null 并给出 project_guidance_error；正常结构不变。HTTP 验证持久化成功和刷新失败分别呈现，不误报保存失败。

验证：
- `/tmp/goals-guidance-first-tests.log`：31 项通过，包含原事件状态、回执、受保护决定、共享 Host、MCP 连接恢复和新增长期说明契约。
- `/tmp/goals-guidance-product-tests.log`：16 项通过，含正式 launcher/官方 MCP SDK 的新增、读取、兼容名称编辑、停用、撤权及原会话作者；真实 Chrome 的设置页面、失败重试、说明编辑修订及刷新；真实 HTTP/Work Prompt 和 Agent 装配。
- `/tmp/goals-guidance-final-tests.log`：最终 9 项通过，覆盖实际 Host 起跑的正文/版本冻结、策略拒绝、历史回执兼容、去重、编辑/停用/恢复、重启、Web 刷新部分成功等。
- `/tmp/goals-guidance-consumer-tests.log`：52 项中 50 通过；两个旧夹具问题为首页文案断言过时，以及 Inbox 测试未显式启用插件。改为检查实际项目首页结构，并在该 Inbox 用例安装插件，未放宽生产权限。`/tmp/goals-guidance-tui-recheck.log` 两项最终通过，含面板实际调用及 Inbox 保存/开始/重启不重复 Goal。
- Goals/Work/MCP/Local Host 构建通过（`/tmp/goals-guidance-build.log` 初次发现 settings 旧参数无消费者，删除后 `/tmp/goals-guidance-host-build.log`、`/tmp/goals-guidance-final-build.log`、`/tmp/goals-guidance-refresh-build.log` 通过）。四个相关测试严格类型检查 `/tmp/goals-guidance-types.log` 通过；scoped diff 检查通过。

下一步是目标树、生命周期、Home 个人方法、整页组合和 MCP 连接摘要外层授权。其他插件、工作流、场景、Character、系统岛实操和 Files/Git 归属选择仍在总体范围；Goal 保持 active，未宣称整体完成或用户验收。

## Goals 当前目标、归档和回收站（已接线验证）

新增 active.set、archive.set、trash.set、trash.list 四项，当前 Goals 共 34 项动作、33 项可授权 MCP 动作、26 个兼容名称。原 BoardCommands/GoalArchiveCommands 继续负责选择限制、完成条件、活动工作阻塞、关系停用及恢复、当前目标清除、原事务和历史回执。完整 Goal、未恢复关系及阻塞 Claim/Run 均按原结果返回；blocked 不表示删除成功。公共回收站动作要求 user_confirmed，不能提供用户决定权。

Web active/archive/trash、CLI/typed 当前目标、typed 回收站组合/列表及四个 MCP 名称使用同一动作。旧 trash/restore 名称固定方向且共用授权，撤权同时移除并阻止新旧三种写入口；work_state 从原回执派生，排队恢复不会污染先前删除的返回值。旧任意数据库/作者/嵌套 payload 管理输入撤下，原 CLI 正式合同及领域回执保留。删除独立 goal-trash-commands、未再使用的 mcpBoardPayload、工具定义/switch/身份特判及旧编译产物；MCP Runtime 别名列表从动作声明派生，避免新的别名漏在另一份名单之外。处理器装配改为命名业务端口，原业务 owner 没有迁入 Host 分发器。

真实浏览器发现明确 /goals/CORE 链接被已保存 WEB 标签覆盖，造成地址与实际目标不一致。修复为恢复前先选中请求目标，避免旧目标异步读取抢写；去掉第二次重复恢复，保留 Frame 恢复后的视图应用。新链接优先，刷新/历史返回仍恢复工作区。归档用例通过真实工作视图操作，保留网络失败可重试、完成事实及原历史记录断言。删除一条依赖旧脚本排列的正则断言，行为由浏览器验证。

验证证据：

- `/tmp/goals-lifecycle-combined-final.log`：16 项全部通过。真实 SQLite/Host、HTTP、CLI、正式 stdio MCP SDK；原领域回执重放、冲突不写入、跨项目/身份/权限拒绝、两端关系恢复、历史保留、注入事件写入失败后完整回滚、同键恢复执行、重启后旧回执不重新删除、活动历史工作阻塞、网页原作者及 MCP 精确撤权。
- `/tmp/goals-lifecycle-owner-tests.log`：30 项通过；原事件工作及原生命周期模块回归。`/tmp/goals-lifecycle-domain-tests.log`：4 项原归档/回收站/关系恢复用例通过。
- `/tmp/goals-lifecycle-dialogs-final.log`：最终导航修复后的创建草稿及创建重试→取消→回收站→刷新→恢复两项真实 Chrome 通过。早期整文件运行的三个旧导航用例失败；其中归档已按当前工作视图修正并通过 `/tmp/goals-lifecycle-archive-browser-final.log`。另外两个分别停在隐藏的旧 tree-node 点击和 Feed Sources 切换等待，未将其计作通过，留在导航/Feed 后续收尾。
- `/tmp/goals-lifecycle-tabs-regression.log`：31 项全部通过，其中两个真实 Chrome 验证标签保留、分屏、Frame 引用及项目隔离。`/tmp/goals-lifecycle-desktop-check.log`：现有桌面/网页渲染检查通过。
- `/tmp/goals-lifecycle-entry-browser-verified.log`：项目首页→目标工作→刷新保留→直接打开另一目标→进入工作→返回首页通过。该旧 fixture 补上桌面视口并按现行 Frame→工作入口操作；新断言使用不同 Goal ID，同时核对可见正文和地址，防止保存标签覆盖新链接。
- Goals、MCP、Workbench、Local Host 构建通过；`/tmp/goals-lifecycle-types-verified.log` 中四个相关集成测试最终严格类型检查通过；限定范围 diff 检查通过。

归档测试最初缺少有效结果要求及支持事实，原业务正确拒绝归档；fixture 现通过正式创建→配置→报告→完成准备已完成目标，并明确断言 completion_applied/work_status，不放宽生产完成条件。历史活动 Claim fixture 使用未到期租约，验证真实阻塞，而不是误把过期租约视为活动。

目标树/可信树审批、关系/项目策略、Home 个人方法、文档组合与 MCP 连接摘要外层权限仍待继续；其他插件、工作流/场景/Character、系统岛完整实操与 Files/Git 归属选择仍属总范围。这里只完成生命周期切片，整体 Goal 保持 active，未宣称内部完整或用户本人验收。

### Goals 结构提案与用户审批（已实现验证）

新增 tree.submit/read/check/decide 四项，当前共 38 项 Goals 动作，其中 36 项可按授权导出 MCP。原 Submission、Query、Check、Decision owner 保留：提交不创建正式目标，检查保存结果但回滚预检物化，用户审批负责目标/关系写入，逐项修订生成仍待审批的新提案。历史 Proposal/Candidate 等保留原始 ID 与映射 ID 读取，退役写入仍拒绝。

typed 四入口、CLI、Web 审批、三个普通 MCP 兼容名与管理审批已接通。schema 从 Goals 插件派生，旧 MCP 重复 schema、普通分发、身份注入分支、Runtime 对话自报确认帮助器、Web 决定转换器及无消费者的编译产物已删除。管理审批只保留传输薄适配，并剥离数据库等传输字段。原整组确认出处及 submitted_session_id 保留，后者由可信上下文经网关注入，业务输入不能覆盖。

结构审批为 user-only / goals:decide；旧 typed 同时 host_only。未知插件不能用 consumes、自填 authority 或覆盖描述获得用户审批权。原历史 runtime_dialogue 记录仍可读，模型无法生成新的受保护决定。Casebook 新 MCP/Web 动作映射至原记录合同，保留用户/会话请求键及 Web 渠道，避免漏记或重复记录；仅增加两个已知错误码，不导出任意业务文本。

验证：
- `/tmp/goals-tree-final-products.log`：6 项通过，含正式 stdio launcher / 官方 MCP SDK / 常驻 Host 的三项普通动作及兼容名、会话来源、权限撤销、历史读取、旧 CLI 与管理 MCP 回执、项目隔离和重启。
- `/tmp/goals-tree-final-revisions-receipts.log`：12 项通过，补充修订/拒绝分支、新提案仍待审批、事务中断后无部分目标/关系/审计写入、真实 Web 批准及整组冲突全回滚、真实 v35 历史读取、Casebook 单次记录和隐私。
- `/tmp/goals-tree-receipts-built.log`：9 项通过；Casebook 测试统一使用编译 Host 后，正式 Web 审批与重试仍只生成一组尝试/结果。`/tmp/goals-tree-receipts-tests.log` 另有 21 项相关回归通过，覆盖原受保护事件决定、Attention/Inbox、Casebook 授权及 Web 渠道。
- `/tmp/goals-tree-entry-final.log`：11 项通过，含 CLI、MCP 工具面、连接与管理重放。`/tmp/goals-tree-products.log` 的 4 项网关回归及 2 项原目标树领域测试通过；该轮唯一失败是新增 SDK 测试把标准 `{ result: null }` 响应误断言为裸 null，已改正并在 final-products 中通过。
- `/tmp/goals-tree-browser-current.log`：实际 Chrome 审批通过，覆盖空意见校验、断网保留意见、重试后仅一次物化、退回不创建目标、刷新保持状态。旧测试等待隐藏的旧目标工作区，已改为当前 Frame → 工作视图；Inbox 行由独立 Attention/Inbox 测试覆盖。v35 测试改用夹具真实的 `goalboard-v1-demo`，没有改写历史数据。
- Contracts、Goals、MCP、Workbench、Local Host 构建通过：`/tmp/goals-tree-final-build.log`；关系方向说明补充后 Goals 构建通过：`/tmp/goals-tree-schema-build.log`。五个相关非浏览器测试文件严格类型检查通过：`/tmp/goals-tree-final-types.log`。scoped diff 检查通过。

本轮完成目标树入口迁移，不代表全局 Goal 已达内部完整。继续处理 Home 个人方法、独立关系/策略、页面组合与连接摘要，以及剩余插件、工作流/场景/Character 和系统岛整体验证；Files/Git 跨调用者归属仍依赖此前待答选择，其他工作不受阻。


## Goals 独立关系与项目规则迁移

新增六项动作：relations.list/add/deactivate、policy.history/resolve/save。现在共 44 项 Goals 项目动作，39 项可按授权导出普通 MCP，5 项为受保护用户操作；旧 MCP 兼容名称仍为 29 个。关系/规则此前没有独立 typed/MCP 写入名，不制造额外兼容入口。

Web 建立/解除关系与保存项目默认规则已转共同动作；规则设置页和所选目标正文读取也通过共同查询。原 `GoalsHttpContext.commands/query` 删除，所有 Goals HTTP 业务操作只接受 BoundActionClient。普通模型、工作流、插件和 MCP 不能自填用户出处直接改变关系/规则；三个直接写动作只接受 user audience、goals:decide 和 Host 注入的真实用户 web/management 出处。模型提出关系变化仍走结构提案，不能因统一目录而扩大权限。

原 GoalCommands、ProjectPolicyCommands 和 GoalsQueryApi 继续拥有记录、事务和规则：关系方向、proposed/active/inactive、创建理由、解除理由及原作者保留；默认规则替换保留旧绑定，目标更严格要求继续合并；旧幂等哈希/作者域和返回游标不改变。故障发生在关系/规则已写入而审计事件尚未写入时，整个事务回滚，随后能以同键成功重试。重启后仍读原记录并重放旧回执。

清理了已无生产消费者的 Workbench/CLI/MCP GoalsApplicationApi 转发工厂、对应包元数据与原身份相等测试。边界检查改为检查当前 scoped Host/BoundActionClient 入口，结构提案 owner 检查跟随 goals-actions 装配；旧已删除 Dialogue/Proposal 文件的测试改为验证当前 owner 与退役入口不回归。历史迁移文档中的当时测试证据保留。

验证证据：

- Goals、CLI、MCP、Workbench、LocalHost 构建通过：`/tmp/goals-configuration-build-current.log`、`/tmp/goals-configuration-adapters-build.log`。
- `tests/goals-configuration-actions.test.ts` 三项通过：原请求回执、方向/历史、原图校验、缺失/已丢弃目标、身份/项目/权限、用户专用授权、故障回滚/恢复、重启，以及真实 Web 写入和读取的实时停用。`/tmp/goals-configuration-integration.log`。
- `tests/goals-actions.test.ts` 两项通过：官方 SDK 使用正式 stdio 进程与常驻 Host，读取真实关系/规则历史/最终规则；三项受保护写入不在目录且伪造字段不能调用；撤回查询授权后目录和执行同时更新。原标准 MCP 的创建/事件/规划/树/生命周期路径同次通过。`/tmp/goals-configuration-mcp.log`。
- 实际 Chrome 四项通过：关系 HTTP 的类型/方向/项目/重试，关系历史与重载，1024×400 和 390×500 的项目规则与说明编辑、取消、无效输入、网络失败保留/重试、保存等待及重载。`/tmp/goals-configuration-browser.log`；截图只写 `/tmp/goals-configuration-browser`，未覆盖用户截图。
- 原规则/关系 UI、领域保存、事件状态、结构提案及旧 MCP 别名 40 项回归通过：`/tmp/goals-configuration-regression.log`。
- 当前 owner 与 UI 注册边界七项通过：`/tmp/goals-configuration-boundary-tests.log`。新增集成、标准 MCP 和受影响事件 fixture 的严格 TypeScript 检查通过：`/tmp/goals-configuration-types.log`；修改范围 diff 检查通过。
- 全仓边界检查仍有五个报错：Dataset README 三项元数据缺失；Connector 两个文件直接导入 node:sqlite。见 `/tmp/goals-configuration-boundaries.log`。本次 Goals 相关边界报错已清除，未把全仓检查报告为通过。

当前接续盘点：Home 个人规划方法还有独立 HTTP 直读/写 Catalog；全局保存会关闭全部项目 Runtime，而项目路由另存个人方法未使已打开 Runtime 更新。`GoalsPlanningEngine` 的个人方法仍是构造时数组。后续迁移须统一 Home 方法目录/保存与真实项目采用，保留个人/项目独立版本、内置模板覆盖规则和原用户数据，并解决已打开项目的更新；不能只再注册两个静态动作。此段仅完成代码盘点，未修改个人方法实现。

完整 Goal 仍 active：Home 个人方法、整页组合/连接摘要授权、其余插件与全部消费方、工作流、动态场景/引用、Character/Agent、系统岛完整路径和 Files/Git 归属选择仍在范围内。以上不是整体内部完整或用户本人验收，无提交或 PR。


## 个人规划方法：实时读取与已有工作保留

已修复两条旧路径不一致：全局个人方法保存此前会关闭所有项目 Runtime 并清空 Feed scheduler，项目 URL 的另存个人方法却不刷新构造时数组。GoalsPlanningEngine 现接受同步读取端口（保留静态数组的原调用合同）；项目 Host 默认从自己 Home 的原个人方法 owner 读取，项目动作的 baseMethods 也使用同一读取端口。Web/MCP 构造处重复的默认装配已删除。

查询、后续采用与项目页面都读取当前个人版本；一次事件采用固定同一份个人/项目方法快照。项目覆盖继续优先，项目副本和 Goal 已保存 config 不变。页面缓存键包含 method_id/scope/version，Home 保存没有项目事件时也能更新方法选项。删除了保存时强制关闭所有项目、清空 Feed scheduler 以及失去用途的路由参数。

证据：

- Module Goals 与 LocalHost 构建通过；最终 Host 构建为 `/tmp/goals-personal-live-final-build.log`。
- `tests/goals-planning-actions.test.ts` + `tests/planning-engine.test.ts` 20 项通过，`/tmp/goals-personal-live-tests.log`。新增真实 Web 两项目路径：先打开两个 Runtime，全局保存与项目 URL 保存均立即可见；项目采用副本保留旧版，冻结 Goal 要求保持原配置；失败保存不增加版本，后续 Goal 能采用新要求；页面缓存更新但项目游标不变；Runtime 对象身份不变、关闭次数为零；重启后保留结果。
- `tests/goals-actions.test.ts` + `tests/goal-events-planning.test.ts` 最终五项通过，`/tmp/goals-personal-live-mcp-final.log`。正式 stdio/官方 SDK 连接保持期间，Home owner 连续保存后的方法名称/版本可实时读取，并能把最新版本采用到项目。保留原模板升级后的配置重放、记录与冲突原子性回归。第一轮 MCP 新用例复用了前面已撤销的 apply 授权而失败，测试现明确重新授权该独立操作；未放宽生产权限。
- `tests/goals-planning.e2e.test.ts` 实际 Chrome 通过，`/tmp/goals-personal-live-browser.log`：复制内置模板、保存失败保留输入、恢复后保存、重载、采用为独立项目版本、停用与读取均通过。
- 严格类型检查与本次修改范围 diff 检查通过；此项不增加动作数量，仍为 44 项 Goals 项目动作 / 39 项普通 MCP。

下一步仍须完成 Home 个人方法的共同目录/保存动作及旧 HTTP 旁路清理。当前 `web-planning.ts` 仍直接读个人 owner、两处调用 Catalog save；这些尚未完成。复用原 Catalog 创建/升级 owner：`MolisWorkProjectCatalog.open` 需要现有 LocalCatalogPlatform，不能另建不完整 Catalog、把桌面包反向导入 Host，或只在打开页面后注册服务。应沿现有平台组合入口注入目录 owner 端口，并覆盖无项目、Home 隔离、撤权与生产 MCP 查询。全量 Goal 保持 active，用户本人验收未进行，未提交或创建 PR。


## Home 个人规划方法：共同动作与实际使用

已注册 `goals.planning.personal.list/save`，共 44 项项目动作和 2 项 Home 动作（39 项项目及 1 项 Home 查询可供普通 MCP 授权）。Host 构造声明 Home 能力，Web/MCP 平台启动注入原 Catalog runner；不依赖项目安装或页面，不反向依赖桌面包，也不另建个人方法数据库。未配置保存后端时目录说明不可用；不同 Home 不能复用绑定，关闭后不能重新配置。

`web-planning.ts` 全局和项目 URL 的个人保存，以及 Home 页/API 的方法查询均调用共同动作，已删除直接个人 Catalog 保存/查询。原版本、完整方法字段与实时采用保持。个人保存属于用户设置，要求可信用户和 web/management 出处；普通 MCP 仅在独立 Home 授权后查询，不能授予或伪造保存能力。

验证：

- `/tmp/goals-home-planning-tests-final.log`：6 项通过，含真实 Host 无项目首次保存、缺少后端、双 Home 隔离、关闭/重启、完整方法版本、伪造身份/权限拒绝，两个真实 HTTP 保存入口，以及官方 MCP SDK/正式 launcher 在无项目状态的发现、实时版本、撤权和禁止写入。
- `/tmp/goals-home-planning-consumers.log`：12 项通过，含新增两种 URL 同受 Home 策略约束断言、正式 MCP 项目采用、Goal 已保存事件配置、系统判断与实际模型连接回归。
- `/tmp/planning-layout-fixed.log`：1440px 与 390px 真实 Chrome 完整复制→失败保留/重试→采用→编辑停用→重载均通过。窄屏原绝对定位正文高度为零已修复为自然展开；实际 DOM 高度和截图已核实，未用程序点击绕过可见性。临时诊断已删除。共享浏览器 fixture 统一使用与生产 launcher 相同的 Host 包，消除源码/产物私有类型混用。
- Goals/Host 构建通过；`/tmp/goals-home-planning-types-checked.log` 的新增 Home、规划动作及浏览器严格类型检查通过，范围 diff 检查通过。边界检查仍只有此前 Dataset README 三项及两个连接模块 SQLite 导入问题，没有本轮新增问题。

这部分完成 Home 个人方法迁移。Goals 页面完整组合和 MCP 连接摘要的外层授权仍继续，其他存量插件、工作流、场景、Character 和系统岛总清单仍未完成；Goal 保持 active，未提交或创建 PR，未宣称用户本人验收。


## MCP 连接摘要：当前客户端授权与唯一执行方

`context_resolve/bind/create_and_bind` 原先通过 Host typed 身份读取项目说明和恢复目录，现在使用当前客户端的已授权动作及生产常驻服务通道。复用 `goals.guidance.read/list/directory.read`，不新增摘要动作；typed 与 MCP 的目录窗口和焦点补查已合并为插件内 `readGoalResumeFacts`，删除旧重复组合与焦点辅助函数。

连接先接受原 Catalog 的真实结果。说明和恢复目录分别读取，未授权、插件停用或服务离线时返回 null 和对应 `project_guidance_error`/`resume_error`，不把已有绑定伪报为失败，也不把缺权限显示为空项目。生产 launcher 不再为这两项内容回退到本地数据库。整个等待期间项目连接或客户端寿命改变时拒绝旧结果，保留新连接；项目读取不自动开始工作。SDK/Skill 协议说明已更新，正常授权结果和原排序保持。

验证：

- `/tmp/mcp-context-actions-final.log` 三项通过：官方 SDK 启动正式 launcher，真实 Web Host/项目/Catalog 验证无授权、局部授权、完整读取、实时撤权、停用、解析/绑定/创建并绑定、项目隔离、关闭常驻服务后的 bound 结果和内容不可用；原绑定/项目事件在只读恢复中不变。独立等待测试验证项目和客户端改变后拒绝混合摘要。
- `/tmp/mcp-context-regression.log` 15 项通过：焦点在首 100 项之外时单独要求 directory.read；授权后保留 Host/Session 焦点、重启恢复与不自动 claim；原连接确认、解绑、项目删除、工作区匹配、Session 覆盖、JSON-RPC 记录及幂等恢复均通过。
- `/tmp/mcp-context-actions-tests.log` 首轮八项含 Goals typed 查询、完整旧事件和恢复回归通过。Goals/MCP/Host 构建、修改测试的严格类型检查及 scoped diff 检查通过。

Goals 动作数量仍 46；此轮消除了连接摘要外层授权旁路，页面整页组合/contract/snapshot 仍待迁移。整体 Goal 保持 active，其余插件、工作流/场景/Character、系统岛及 Files/Git 主体归属选择仍在范围中。未做额外 UI 改版或用户本人验收，未提交/PR。


## 目标正文：网页与公开动作共同读取

新增 `goals.document.read`（45 项项目动作 / 40 项普通 MCP，另 2 项 Home 动作）。输入仅 goal_id，可信项目由 Host 绑定。插件沿用原 createGoalEventDocumentView、状态及历史 owner，完整 schema 描述状态、原始说明、混合历史首屏/游标、关系、带原关联的风险、当前规划方法、继续方式与事件类型；没有新建事实表或返回 UI HTML。

Web 完整页、正文/刷新 fragment 的所选目标使用共同动作。原 Host 直调事件与规划 owner 的所选正文路径已删除，移除未使用的 attachEventDocument helper 和关联参数/导入。关系/规则和可选 Artifact 阅读继续沿现有动作及错误处理。整页目录/snapshot/contract 仍在原清单中，不将所选正文等同于全量页面完成。

验证：

- `/tmp/goals-document-tests.log` 九项通过：真实 Host 的正文/状态/原文/缺失目标/输入身份及跨项目拒绝、原 v35 迁入历史与完成事实、归档和回收站保留正文/关系，标准 MCP 发现、真实结果与撤权，以及 Web 完整页和 fragment 热缓存下停用/恢复。
- `/tmp/goals-document-planning.log` 四项通过：Home 个人方法保存后正文可选模板显示新版本，而已采用的 Goal config 保持原版本；两种保存 URL、原项目副本和当前 Runtime 均保持。
- `/tmp/goals-document-browser.log` 五项真实 Chrome 通过：规划、报告、问题、用户决定及收尾完整交互；历史未完成目标只读、分页失败恢复及原日期/类型；窄屏抽屉/视图恢复与桌面并排几何。
- `/tmp/goals-document-protected.log` 受保护 Web 决定定向回归通过。Goals/Host 构建、相关测试严格类型检查 `/tmp/goals-document-types-final.log`、范围 diff 检查通过。

整体 Goal 继续 active。当前接续：完整页面目录、snapshot 与 Session handoff 的 contract 读取仍直接组合原 owner，需要保留完整历史合同并纳入共同动作；其余存量插件、工作流/场景/Character、系统岛及 Files/Git 主体归属选择仍未完成。未提交/PR，未宣称用户本人验收。
