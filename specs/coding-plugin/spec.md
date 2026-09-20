# Coding App 需求书

把编码这件事作为一个 **Plugin Platform v2 的 app 插件**做进 Molis Work：
用户在项目里开一条编码会话，交给 Agent Runtime 去读、去想、去给建议，
成果以 Artifact 的形式回到项目里，副作用一律经宿主审批。

这份是 Coding 的单一需求来源。**平台侧**的需求在
[`../plugin-platform-v2/spec.md`](../plugin-platform-v2/spec.md)，本文不重复。

## 0. 本轮产品闭环（2026-09-20，执行中）

本节是当前核对结果与剩余工作；下文保留此前切片的实现依据，历史工程完成不能解释为产品可用。
范围按本次确认：完成 Coding、Workspace、Files、Diff、Git、Text Stats，并新增独立 Character 管理插件。
保持 `design.md` 和四张 UI 稿的外壳、三栏职责与导航，沿用 HTML Slot 和共享控件。

### 工作基线与边界

- Molis Work：`4b47329440a8b26f53522b99a44948539e2bbd7d`，初始 `main` 干净；
  本次在隔离工作树 `/Users/oreal/.codex/worktrees/molis-coding-complete/molis-work`、
  分支 `codex/molis-coding-complete` 实现，不影响主工作树及 Casebook 工作树。
- FlyLeaf：`a0267d39d5860575efd0ab080fb0f6887234759b`，初始 `main` 干净，始终只读。
- Prologue：`3077386c5b7bb86637dfd72b3405d3c629a5a066`，初始 `main` 干净。
  初始依赖 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1.tgz` 没有来源提交记录，不能视为该 checkout 同一构建。
  当前已改用 `prologue-sdk-0.0.0-rc.1-command-feedback.tgz`：对应 Prologue 分支 `codex/molis-coding-receipts` 的提交 `8d590818e32534880984f9e84e1efd005caa105a`。2026-09-20 提交整理时重新构建 SDK，包内 494 个构建文件逐字节一致；包和锁文件配套，未发布 npm 包。
- 模型验证使用 appkey `minimax` 注入 `MINIMAX_API_KEY`，国内 Anthropic 兼容端点，默认 `MiniMax-M3`。
  凭据不写项目文件。实操使用独立产品 Home 与有代表性的授权测试仓库，避免改用户正在使用的数据。
- 本轮最初不含提交或推送；2026-09-20 用户追加授权，将已完成部分拆分提交并推送到上述两条功能分支，不合并主分支、不对外发布产品，也不重写壳层或另建执行核。回滚单位是功能块的明确文件差异；
  SDK 包与锁文件配套变更，用户数据采用向前兼容迁移，禁止通过清库回滚。

### 已核实的产品断点

| 能力 / 阶段 | 实现归属与正式入口 | 当前调用链事实 | 剩余与验证 |
| --- | --- | --- | --- |
| C0 设计 | `design.md`、`ui/` 四张稿、Design System | 设计已确定 | 每块以真实内容看深浅主题与窄屏，不把静态稿当功能 |
| C1/C2 能力与成果类型 | Projects / Agent Host / Artifacts | 契约、注册和类型存在 | 验证授权工作区 → 真实 Run → 固定版本成果 |
| C3/C7 会话与插件托管 | Coding → Plugin Runtime → 工作台 | 市场安装、directory/stage、声明式会话 routes 与持久私有草稿已接；正式入口新建、重命名、标题搜索、只读执行、继续和停止已有 MiniMax 实操 | 补其余导航面、完整执行/成果关系和更复杂会话组织；继续按正式入口验证 |
| C4 宿主审查 | Agent Host Review → HTTP → 宿主 UI | Agent Host 已在 web-server 构造；审查 HTTP 与宿主渲染/决定控件已挂入 Coding 结果区，按当前会话的实际 Run 筛选 | 文件拒绝、并发冲突与命令停止/超时已有指定路径实操；完整差异反馈和未知副作用恢复仍待补齐 |
| C5/C6/C15 模型执行 | 全局模型设置 → Host → Prologue adapter | Prologue 已按需正式装配，读取配置模型与密钥；模型设置可增改、保存凭据、启停、移除及测试。Coding 已用 MiniMax-M3 实际读仓库和跨重启续聊；文件写入审查已接通并有 MiniMax 实际批准落盘证据 | 拒绝、冲突、重启及命令回执已补指定路径实操；跨文件任务、完整成果交付和质量验收仍未完成 |
| C8 结构化提问 | 对话问题卡 → Host 控制 → SDK pending | 提问投影与独立卡片函数存在，但正式 client 未装配、路由不接受 answer、角色未声明 ask-user；Node adapter 未接回答与原问卷读取通道 | 真实提出问题、回答、离开后保留、过期拒绝 |
| C9 方法 / MCP | Coding 设置与输入选择 → SDK | 仅 selection 投影；Manifest 未声明 skills/mcp | 安装、选择、冻结、失效、工具实际调用与下一轮生效 |
| C9 检查点 / 恢复 | 会话执行记录 → SDK | SDK 终态历史与 Host 冻结输入索引已持久恢复，安全的已结束会话可以续聊；检查点和未知操作核对尚未接入 | 实际检查点、统一审查恢复、重启恢复；未知副作用不能重跑 |
| C9 子代理 / 并行写入 | C13 → SDK / Host git-worktrees | 有投影和 git 工作树辅助实现；无运行时子代理路径 | 明确分工与权限、失败/停止/返工、隔离写入和整合 |
| C9 报告 / 用量 / 阅读 | 中栏报告、执行详情 | 正式工作台已有安全 Markdown、流式回答、折叠工具活动、用量和滚动保持；完整报告尚未接，剪贴板端到端仍待核验 | Markdown、流式、未知用量、滚动保持、代码复制 |
| C10 五个伴随插件 | Workspace / Files / Diff / Git / Text Stats | 六插件能启动；仅 Workspace 面板挂载；缺宿主数据源与默认连线 | 正式入口选择工作区、文件材料、差异反馈、Git 固定审查、文本统计 |
| C11 四层提示 | Plugin declaration → Host freeze → SDK | Host 分层存在；Node adapter 已按实际 tgz 的 SDK 类型接通 Resource 写入发布、精确引用、工具名和 Session history；独立两轮测试与正式 Coding 读取/续聊已实操；base Prompt 已去掉错误的全局只读约束；角色交接说明已修正并在新任务验证实际写入/检查状态；长会话只回复计划等质量反例仍保留 | 用实际打包 SDK 类型修正，验证模型确实收到各层；历史与下一轮分开 |
| C12 Character | 独立 Character 插件 → Artifact → 消费插件声明 → Host freeze | 尚未实现；旧 §7.1 的“目录库角色表”不足以满足本次发布/消费要求 | 管理草稿与精确发布版本、停用/墓碑、消费者范围、无角色路径、不扩权 |
| C13 Plan → SubAgent → TaskBoard | Coding 计划意图 + SDK 执行事实 + 左栏投影 | 尚未实现，顺序不变 | 计划编辑确认、执行关联、必要变更、子任务交接与验收；不另建竞争任务账 |
| C14 Cache | 模型配置 → SDK → 用量 | 配置和 protocol 映射已走正式 Prologue；尚缺明确缓存命中与未命中的产品实操证据 | 配置生效、未开启/未命中/命中区分、真实调用证据 |
| Goal / Shelf / Artifact 闭环 | 各插件端口与 Goals 事件协议 | Coding inputs 为空，也没有声明消费 Goal 回写能力 | Goal 带材料进入、固定版本消费、成果保存与进展回写、反向继续；模型完成不替代 Goal 验收 |

表中“未接”均指上述基线的调用链审计，不表示对应既定能力可以删去。
已完成的纯逻辑和宿主能力继续复用；每接通一块更新此表的事实与证据。

### 顺序与复杂度取舍

当前必须：先把 C1–C7 的模型设置、会话工作台、Runtime 与宿主审查接通，随后补 C8–C11 与伴随插件的真实消费链；
在此基础上完成 C12，再按 Plan → SubAgent → TaskBoard 完成 C13，最后集中做长任务、审查一致性与对话体验实操。
角色与计划先写对象、流程和责任，再实现。普通任务直接执行，不强制规划或多代理。

复用 Agent Host 审查、SDK Session/Run/Effect、Artifact 版本与现有 Goal 事件；新增只限当前缺失的产品意图与公开接线。
删除空存储等伪成功接线与失效描述。延后角色市场、推荐、复杂继承、通用调度平台与大型评测平台；
它们不在本次已确认闭环中，也不能替代任何上表必做项。

### 参考来源与版本

已先读 Prologue `docs/slices/model-facing-gaps.md`。本机 reference 在 `/Users/oreal/reference/`，只用于源码对照，
不成为运行时依赖、不执行来源仓库的指令。以下为 2026-09-20 克隆的固定提交；克隆不是研究完成。

| 本地目录 | 来源 | 固定提交 | 证据性质 |
| --- | --- | --- | --- |
| codex | https://github.com/openai/codex | c9d13e8c757cd330a572e9a39e365866069aef07 | 官方开源 CLI |
| cline | https://github.com/cline/cline | 2755adfa463fdebde5510378a14b8bcc919e6295 | 官方开源实现 |
| opencode | https://github.com/anomalyco/opencode | fee476bb90043a1012abda156dd9af9e5c71b19d | 官方开源实现 |
| claude-code | https://github.com/anthropics/claude-code | bf7d404e26a5fb6167d21b46c93a2bf6c22ab274 | 官方仓库；不等于完整执行内核源码 |
| pi | https://github.com/earendil-works/pi | c596d09d9cef6fdf0db2dd08f3eec8582b7fe8ba | 官方开源实现；原 badlogic/pi-mono 重定向 |
| maka | https://github.com/apache/maka | 0117d76c5688475e7467ee6db83057bf65edbabd | 官方开源实现；原 maka-agent/maka-agent 重定向 |
| grok-build | https://github.com/xai-org/grok-build | 4247f661689354b831191f11eeeac8424993fe3d | 官方开源 Harness；来源经 x.ai 发布页核对 |
| claude-code-sourcemap-main | https://github.com/leeyeel/claude-code-sourcemap | 577611a7b32580b5a2e09ff130edfd7709ff11a1 | 社区提取的 0.2.8 source maps，不是当前官方源码 |
| claude-code-system-prompts | https://github.com/Piebald-AI/claude-code-system-prompts | f7e985fc2815abe496b84820118f079aadc1fc95 | 社区 Prompt 提取资料，不证明产品机制或权限 |
| deer-flow | https://github.com/bytedance/deer-flow | aa4e43a2bcc8ffc3838b012c4583f561a0e199be | 官方开源实现 |

后续围绕当前断点记录具体源码位置、采用原因与不采用原因，不按项目数量计成果。

### 验证记录

- 初始依赖安装：pnpm 11.5.0 对三个本地 tgz 查询注册表返回 404；已核对 tgz 与 lockfile SHA-512，
  有旁置 SHA-256 的两个包也一致；`pnpm install --frozen-lockfile --trust-lockfile` 成功，未变更依赖版本。
- 初始 `pnpm build`、`pnpm boundary:check`、`pnpm workspace:typecheck` 通过。
  初始全量回归 1262 项：1204 通过、54 失败、4 跳过；日志 `/tmp/molis-coding-baseline-tests.log`。
  失败涉及已有 Goal/Feed/Settings 浏览器交互、旧迁移、打包卸载、运行时发现和服务脚本；本轮不能将这些算作通过。
  影响 Coding 及 Goal 闭环的已有失败需要修复，其余至少零新增失败。
- 产品实操、用户验收：本轮尚未完成，所有“顶尖”质量结论为 `UNVERIFIED`。

### 当前功能块：模型设置与 SDK 执行接缝

已实现：
- 全局设置导航接模型设置，复用原设置外壳与 Provider Store，供应商落 Catalog，凭据进入既有加密 SecretStore。
  页面能新建供应商、编辑名称/端点/格式/缓存、增删启停模型、保存与移除；失败保留输入，未保存时切换供应商会提示。
- 模型测试按钮经正式 HTTP 路径执行无工作区工具的 SDK Run，成功只报告“模型已实际响应”；
  健康状态“配置就绪”不再冒充连接成功。端点使用既有格式映射补全 `/v1/messages` / `/chat/completions`。
- Node adapter 使用真实 SDK 类型，写入并发布 Prompt 字节，保留资源、Session、Credential 的精确引用，
  正确映射 read/edit 工具并带入会话历史。角色投影不复用会冲突的 SDK Character id。
- 修复流式正文不可见、首条任务重复、控制状态无内容事件时不刷新、SDK 安全错误丢失。
  重复 MiniMax 验证发现控制面的 completed 早于 Session 落账；立刻续聊会偶发丢上一轮信息。
  已调整为等待 SDK 提交后公布的终态事件才显示结束，控制先结束时显示收尾/保存；加了可重复时序回归。
  工具结果保留有界的展开证据；用量按网络调用累加和去重，使用实际 SDK `source` 字段，未知与估算有说明，非美元费用不显示为美元。
- 密钥每轮重新解析，轮换/移除生效；同值并发交接共享引用，失败可重试，字节交接后清零。
- 本机代理会返回 `198.18.0.0/15` 与配套假 IPv6，原 SDK 网络门禁正确拒绝这些地址。
  通过 NodeHost 已有 `resolveHost` 扩展，在明确配置代理且出现假 IPv4 时使用 Google HTTPS DNS 查询 A/AAAA；
  只发送域名、不发送密钥，禁重定向、有超时，保留普通混合 DNS 地址，SDK 仍校验所有返回地址。
  这条兼容接法依赖外部 DNS 可用；失败时明确失败，不能编造公共地址或放开私网门禁。

已有验证：
- 定向验证 SDK 投影、控制、凭据轮换、并发与失败、DNS 私网/混合结果、配置格式、保存重开与 Home 隔离。
- `prologue-node-live.test.ts` 使用实际打包 SDK + NodeHost + MiniMax-M3，在临时代表性 TS 文件上实际 read，
  核对精确代码内容、Prompt 标记、第二轮记忆与源文件未改。这只是 SDK 接缝实测。
  早期使用 `FILE_<随机串>` 的夹具时，模型把工具正文误当资源引用，曾返回无关内容；
  换成代码夹具后通过，不能据此认定工具理解质量普遍解决，后续真实任务需覆盖类似歧义。
- 隔离产品 Home `/tmp/molis-coding-product-home-v2`，本分支预览端口 4198：通过模型设置页面新建供应商、添加 MiniMax-M3、保存，
  appkey `minimax` 经相同正式保存 API 写入凭据；页面重开后显示已保存，点击“测试这个模型”实际收到模型响应。
  密钥输入步骤使用正式 API，未将密钥读入对话或截图；服务重启后不重新写入密钥，页面再次测试成功。
  无效端点的失败反馈、输入保留、开关切换与撤销已实操；检查了浅色、深色和 390px 窄屏，保存与模型动作可到达。
  深色开关被原生 input 背景遮盖的问题已修复共享原语，不在业务 CSS 另画一套。
  这不是整个 Coding 流程的实操验收。
  第一份 Home `/tmp/molis-coding-product-home` 重启后遇到 macOS Keychain 不可访问，原数据保留，未旋转或覆盖密钥。
  产品现已区分“密钥库不可用”与“未配置密钥”，保留记录并提供重试方向；v2 隔离 Home 显式使用既有加密文件后端。
  macOS Keychain 在本机授权环境下的长期恢复仍需验证，不能用文件后端的成功代替它。
- 本块 `pnpm build`、`pnpm boundary:check`、`pnpm workspace:typecheck` 通过；完整回归 1274 项，1220 通过、49 失败、5 跳过。
  与初始 54 项失败逐项比对，无新增失败；日志 `/tmp/molis-coding-block1-final2-{build,boundary,types,tests}.log`。
  期间一次标题栏宽度检查偶发失败，单独重跑与本轮完整回归通过；没有把它称为已修复。
- 经正式页面创建隔离的“Coding 产品验证”项目后，在工作台内打开模型设置，切换外观再返回，未保存开关状态保留，撤销恢复成功。

仍差：Coding 正式会话工作台、Runtime 装配、审批/写入/命令、持久恢复、C8–C15 其余能力及完整真实编码任务。
当前 adapter 未装 compactor，能力矩阵已如实标不支持；上下文压缩仍为必做，不因修正申报而移出范围。
输入法和主观手感 `UNVERIFIED`；整体 Coding 功能仍未达到产品实操标准。

### 接下来的会话与执行装配边界

顺序仍按 C1–C7：先让配置后的模型从 Coding 正式入口执行只读任务，再接宿主审查、写入与命令；
随后完成 C8 结构化提问与 C9 跨重启恢复。中间态如实申报可用能力，不把只读任务成功写成 Coding 已完成。

- 插件拥有会话整理、输入意图、草稿和成果展示，路由在 Manifest 声明，由既有 PluginRouteRouter 派发。
  工作台通过既有 HTML Slot 放入外壳，补齐现有目录贡献缺失的 stage；复用 shared Markdown、标签和控件。
- Host 从实际 Catalog 解析模型、凭据和工作区，从运行插件声明冻结角色；请求不能通过自报项目、角色或路径取得权限。
  会话创建、读取、继续、执行读取/控制及命令回执已核验项目归属；运行引用还核验所属会话。宿主审查决定的项目校验已在后续 C5 功能块补齐。
- SDK 拥有执行、事件、历史和副作用。恢复读取 SDK 的精确 Session 引用、terminalRuns/replay 与 listOpenWork；
  Host 只保存必要的归属和冻结输入索引，不复制第二本聊天或执行账。未知副作用必须明确对账，不自动重放。
- 已发现审批 HTTP 只改 Host 队列、没有调用 SDK，且桥把 authorized 写成 effect_settled。
  这两处在开放写入前修复：批准决定传给原 pending，执行结果只取实际回执；重复决定和跨项目决定拒绝。
- 当前必须补调用链、归属检查、每会话并发保护与草稿保存；通用调度平台和新审批账不采用。

### 当前功能块：正式 Coding 会话入口（实现与回归中）

- 插件市场从已有 Catalog 生成条目，修正 Coding 已注册却无法从正式入口添加的问题；
  通用目录装配补宿主识别标记，Coding 的目录与 stage 均来自运行插件贡献。
- 正式插件路由接通会话创建、重命名、标题搜索、草稿保存、模型选择、工作区选择、只读讨论/评审、补充要求与停止。
  工作区关联复用宿主 `/api/workspaces`；新增项目作用域的只读目录列表 Capability，启动只接受目录列表内的授权路径。
- Node Prologue 按需装配。Host 从已配置模型解析具体选择，角色、目录与本轮执行记录关联；同会话并发启动被拒绝。
  回答使用共享安全 Markdown，代码可复制，工具活动折叠；用量缺失显示未知。状态“本轮结束”不表示用户验收。
- 插件新增声明递增到 1.1.0；补 Host 明确授权的非活动版本替换，安装身份和私有草稿不变，
  运行中的版本与同版本不同 Manifest 仍拒绝覆盖。未删除旧安装数据。启动失败会显示具体原因。
- 2026-09-20 正式产品实操：在隔离项目“Coding 产品验证”内，经市场添加 Coding，再用工作区对话框关联
  `/private/tmp/molis-coding-product-fixture`。MiniMax-M3 从页面接收任务，实际读取 README 与 `src/total.js`，
  找出折扣符号错误，给出 3300 与 2200 的差异；文件保持原样。第二轮正确复述仅第一轮提供的口令“篮子-927”与诊断，未再次调用工具。
  输入第二轮草稿后新建另一会话，再返回，草稿保留。两轮公开执行记录保留在 `/tmp/molis-coding-product-two-turns.json`。
  这是单个受控仓库的只读实操证据，不是完整编码任务或顶尖质量的证明。
- 定向验证 124 项通过，包含正式 HTTP 草稿跨服务重启、未启用/无控制令牌拒绝、跨项目会话隔离、目录拒绝、升级保留草稿。
  完整构建、boundary 与 workspace typecheck 通过；本块首次全量回归 1276 项：1222 通过、49 失败、5 跳过，与初始基线比对无新增失败（`/tmp/molis-coding-block2-final-tests.log`）。随后发现的重启装配修复需单独补验，不能沿用这份结果。
- 实操发现且正在修复：轮询反复重建目录行会干扰点击；重命名输入会被轮询覆盖；按钮布局被通用样式覆盖。
  最新源码已改为保留目录 DOM、编辑时保护输入、提高局部布局选择器优先级，待在最终运行构建复核。
- 重启实操另发现 PluginRuntime 将落盘的 running 当成本进程已经启动，返回重放回执却没有贡献，导致空白页面；
  已修复为仅本进程实际贡献存在时才重放启动回执；新进程重建贡献。定向重启检查4项通过，正式页面重启后目录和工作台恢复。
  补跑全量回归 1277 项：1223 通过、49 失败、5 跳过，与初始基线逐项比对零新增失败（`/tmp/molis-coding-block2-restart-tests.log`）。该次构建的 SDK 执行历史仍未恢复，不会丢掉原引用并创建假新会话。
  该次实操还发现 SSR 初始会话行与客户端接管后会话行重复、会话重命名未同步宿主标签标题；待回归结束后一起修正。
  重启后的未执行会话可以从正式入口发起 MiniMax 任务，实际读取文件并返回诊断。模型额外建议 `0 <= discount < 1`，
  但需求没有排除100%折扣或约定截断；这是未经确认的产品限制建议，不能当作必修缺陷。后续 Prompt/角色验证要约束证据、最小修改与待确认建议，不能仅判断成功启动。

剩余不变：写入与命令的真实宿主审查、C9 完整持久恢复、方法/MCP/检查点/子代理/并行写入/报告、伴随插件、
Goal 材料成果闭环、独立 Character（C12）、Plan→SubAgent→TaskBoard（C13）、完整真实任务与集中体验验收。
五个目录面当前只有会话接通；其余面和右侧完整成果工具仍是必补范围。真人中文输入与主观手感为 UNVERIFIED。

### 当前功能块：执行历史恢复（部分实现，尚未完成 C9 恢复）

- 宿主在 SDK 既有加密 HostStorage 保存精确 Session 引用、归属和启动意图索引。每轮先保存固定角色/Prompt 版本、模型、目录、材料来源和原始任务，再启动 SDK；不保存第二套流式正文或工具执行账，也不存密钥。
- 重开会话从 SDK `terminalRuns/replay` 重建正文、工具活动、失败与用量；后续执行使用原 Session 和 SDK history。旧控制句柄不复活，重放不触发模型或工具。
- 启动引用不完整、未提交事件账、未查清 OpenWork 或中断副作用时，显示核对原因并禁止盲目重跑。草稿仍可编辑保存。只有安全的已结束历史可以直接开下一轮。
- 实操：本轮新建“跨重启保留任务与证据”，MiniMax-M3 从正式页面读取两文件，正确比较3300与2200；服务真正重启后，正文、两项工具记录、741/520用量、固定模型/角色与草稿仍在。随后从页面续聊，模型正确保留口令“松鼠-614”、尚未修复及需覆盖100%折扣的要求，未再次调用工具。第二轮用量872/136。
- 模型第二轮额外断言200%折扣是调用方责任，现有需求没有说明该责任划分。连续性实操通过这个有限样例，不代表任务判断质量已解决；后续四层 Prompt 与 Character 必须继续验证证据边界。
- 真实打包 SDK 离线验证：私网模型请求被门禁拒绝后的失败账、原任务、冻结配置和归属跨重启一致；历史控制拒绝；新轮仍在同一个 Session。中断记录可读但不能自动重跑。两项定向检查通过。
- 目录初始 SSR 重复、重命名标签不同步已在页面修复确认。轮询保留未变的模型/目录选项，避免打断正在选择的用户。复制按钮反馈可见，浏览器剪贴板读取未返回正文，不能据此称剪贴板端到端已验收。
- 构建、boundary、workspace typecheck 通过；第一轮全量回归1279项：1225通过、49失败、5跳过，零新增失败（`/tmp/molis-coding-recovery-tests.log`）。随后对窄栏与单会话读取失败做了补修，最终构建、boundary、workspace typecheck 均通过；全量1280项：1226通过、49失败、5跳过，与初始基线逐项比对零新增失败（`/tmp/molis-coding-recovery-final-{build,boundary,types,tests}.log`）。既有49项失败没有被计作通过。
- 730px实操发现阅读区被右栏挤到约203px，已按 Coding 容器实际可用宽度改为下方结果区，正常窗口截图确认正文恢复可读，代码按钮不压住代码。浅色/深色均检查真实长回答；390 CSS px下页面没有横向溢出，工作区对话框能打开关闭，发送控件在视口内。浏览器尺寸工具受现有缩放影响，按实际CSS宽度校准；调整视口时截图出现采集畸变，窄屏视觉质感不能仅凭几何结果认定通过。
- 一条 SDK 历史无法读取时，只将对应会话标为待核对，列表与草稿仍可用，不声称历史为空或本轮已完成。定向29项通过，包含真实SQLite的坏会话隔离、SDK重启、正式HTTP及标签重命名。
- 实操新增发现：全局设置里点击原本已选中的会话标签不会退出设置，需要经 Coding 导航返回；此导航缺陷已在下一节 C5 功能块修复并重新实操，不归为正常体验。
- 中断实操：新建只读任务，MiniMax读取三文件并输出部分分析时点击停止；三项工具记录与部分正文保留。服务重启后续聊，不调用工具即可正确给出 package.json 的 `coding-product-fixture` 与 `node --test`，且明确完整五场景分析未完成。公开记录分别保留在 `/tmp/molis-coding-product-stopped-turn.json` 与 `/tmp/molis-coding-product-recovery-turns.json`（后者为另一条正常结束后恢复的会话）。这证明受控停止后的 SDK 工具上下文可继续，不代表崩溃时未知写入已解决。
  已发现控制面显示“已停止”、SDK事件回放显示“已取消”的文案漂移；已在下一节 C5 功能块持久保留宿主停止意图，仅在SDK确认取消后投影为已停止。模型也略多描述了停止前已经写出的分析内容，任务进展仍需依据实际输出核验，不能采用模型自述。

仍差：旧的开发实操会话在宿主索引引入前已执行，没有当时冻结配置，暂保持引用和“待恢复”提示，不能伪造版本；需要补可解释的旧记录恢复。中断执行、未决副作用的显式核对与继续、检查点、压缩和结构化提问仍待接通。本节不将部分恢复标成完整 C9；C8 结构化提问仍待接通。

### 当前功能块：C5 审查事实与执行所有者（实现中）

- 已确认正式 HTTP 只记录 Host 决定、SDK 桥把授权当成完成、重复投影能重置已消费的批准。这是开放写入前必须修复的当前问题。
- 复用 Host 队列和 SDK effect/pending：HTTP 只交给注册的执行所有者；无所有者时拒绝，跨项目引用不可决定。重复同内容审查保留原回执，同引用换内容拒绝。
- 精确 pending 引用保留 kind/id/revision，核验实际 Session/Run 来源；失效只撤回这一笔，不影响同轮其他操作。允许后仍等待实际回执；传送异常保留用户决定并显示未确认，不宣称没有发生或自动重发。
- 审查面展示前后文本、程序/逐项参数/目录/超时；无法展开的内容不提供批准按钮。Host 决定不作为插件 Capability。
- 同块修复受控停止意图的持久保存；仅 SDK 已确认取消时恢复为“已停止”。同一 Session 的索引更新串行读取最新记录，防止旧轮迟到的停止请求覆盖后续轮次；终态句柄不再写停止意图。真实打包 SDK 两轮执行后迟到停止、重启仍保留两轮的回归通过。点击会话标签退出设置，重命名保存后清理过期操作提示。
- 定向52项通过，覆盖正式 HTTP 归属/未接执行方拒绝、桥的精确引用与一次决定、实际回执不可改写、缺失审查文档及孤立 pending 拒绝、SDK 历史恢复。构建、boundary、workspace typecheck 通过；最终全量1291项：1237通过、49失败、5跳过，与初始基线逐项比对零新增失败。日志为 `/tmp/molis-coding-approval-foundation-final-{build,boundary,types,focused,tests}.log`。首轮全量曾再现既有标签宽度不等的间歇失败（此前 block1 已记录），原状态独立复跑与最终全量均通过；未把它称为已修复。
- 新会话“停止意图与计算证据验证”经 MiniMax-M3 执行两轮只读任务，第三轮从正式页面立即停止。SDK 收尾期间显示“正在保存”，结束后“已停止”；服务真正重启后，三轮原文、用量、终态和停止原因一致。第四轮无需工具即可复述“银杏-508”，并正确说明被停止轮次没有核对结果。证据为 `/tmp/molis-coding-product-stop-intent-{before,after,continued}.json`。
- 设置返回实操定位到“忽略已选标签”和“保留设置目录”两个独立判断，现已同时修复；一次点击原会话标签恢复 Coding 目录和对话。重命名保存后的提示已在页面确认。
- 模型质量反例保留：只读分析把预期值与当前代码值混写；100%折扣漏掉税率；下一轮文字复核又在同一段同时写2750与3300。角色成功启动和上下文保留不代表计算正确。后续接实际检查工具，并在 Prompt/角色任务验证中检查结论与证据的一致性，不额外建立评分系统。
- 命令回执的当前边界：SDK 运行中的 evidence 有结构化检查结果，但现有公开持久事件只留下可读工具文字，尚未找到重启后读取完整结构化命令回执的公开路径。不能从模型回答或拼接日志猜测退出码。下一步先核对 SDK 资源与回执出口，确需扩展时复用其资源/Session 账与实际 Host 回执，不建立第二套执行事实。
- 真实 SDK Review 资源读取、live waiter 查询、效果/命令回执同步、页面 Host 控件仍待装配；桥已要求这些真实端口，不再用 generic summary 代替固定审查。这是该基础块结束时的边界；后续文件写入接通情况见下一节，不把桥的组件测试算成 C5 完成。

### 文件修改与宿主审查（指定路径已实操，后续能力继续）

- 正式任务方式新增已有 writer 角色的“修改文件”；完整“执行”仍等待命令回执接通，没有用改写角色冒充完整 builder。宿主在当前会话对应 Run 的结果区装配审查，插件不获得批准 Capability。
- Node Runtime 复用 SDK 固定 PatchReview Resource，完整读取修改前后文本并核对本轮授权根。未知或不完整文档不允许批准。`workspace-write` 与 `ask-always` 同时装配，角色工具名单与授权根继续收紧权限；没有 Host 审查所有者时仍只读。
- 实操先发现仅设置 `untrusted` 姿态不足以覆盖 SDK 默认拒绝，已补公开的 `ask-always` 权限模式。另确认 SDK 的 `pending.hasLiveWaiter` 只覆盖普通输入等待，Effect 有独立等待表；改为要求实际仍运行且未请求停止的 SDK Run、相同来源与精确等待中的 Effect/Pending。重启的历史引用不进入活动表，不能批准恢复旧执行。
- MiniMax-M3 从正式入口读取 README 与源码，提出将 `src/total.js` 的 `(1 + discount)` 改成 `(1 - discount)`。页面显示完整前后内容；批准前读盘仍为 `+`，点击一次批准后实际文件变为 `-`，Host dispatch 回执确认后卡片才显示完成。会话为 `1a04a05c-bf7c-4bdf-a9de-5c92afe0f381`。没有从脚本或数据库代替产品写入。
- 真实质量反例：首个成功写入后，模型收到 edited/checkpoint 回执却声称“尚未经宿主批准”。写入事实成立，完成解释不合格。已把 writer 的交接说明改为：工具等待期间未执行；返回实际写入回执后应说已修改；未跑检查不得声称测试通过。writer/Prompt 递增到 v3，插件递增1.3.0，历史仍保留当轮冻结版本。下述新建文件实操确认 v3 能正确区分已落盘与未运行检查，但拒绝原因解释仍有缺口。
- Host 的用户决定在唤醒 SDK 前保存进既有加密索引，只存决定人/时间/备注及精确归属；效果与实际回执仍从 SDK 原账读取。恢复后的批准只用于显示与核对，不重新签发权限。
- 拒绝实操：宿主点击拒绝后 `total.test.js` 不存在，Agent 未重试。随后独立新提案等待期间，以文件独占创建模拟另一位作者写入同名文件；批准旧提案后 SDK 返回 `PATCH_BASE_CHANGED`，标记 `keep-external-817` 完整保留，卡片显示已批准但未完成。
- 同一会话补充要求后，Agent 读取外部标记并保留原文件，另用 write 创建 `basket.test.js`，宿主批准后落盘641字节，五个 node:test 用例经开发者独立运行通过。这不是 App 内命令能力的证明。writer v3 此次正确说明“宿主已批准并落盘”，未声称已运行检查。会话 `0639ac88-2e20-41c1-a439-0af3ee9af0c2` 已命名“补丁冲突与审查恢复”。
- 另保留两类质量缺口：拒绝后模型仍把用户拒绝误称为未配置权限；部分续轮只回复行动计划而未调用工具，明确补充要求后才能继续。这些仍需通过工具反馈与实际任务质量改进，不能用成功样例掩盖。
- 重启实操发现 SDK `pending.get` 只查活动账，已结束待批须用公开的异步 `read`，现已改正。真正重启后，三笔原始文档、Run 归属、用户决定和效果状态逐项一致：拒绝未写入、批准但冲突、批准且已写入。证据为 `/tmp/molis-coding-write-reviews-{before,after}-restart.json`。历史准备时间取 SDK 原记录，不能凭恢复时钟编造批准时间。
- 深浅主题检查了真实长对话与完整测试文件审查；窄栏审查排在结果元数据前，整个结果区可滚动，避免新增审查内容溢出不可达。390 CSS px 下页面没有横向溢出，输入区与审查区均在视口内。细微手感和中文 IME 仍为 UNVERIFIED。
- 工程：定向63项通过。首轮全量1293项，1237通过、51失败、5跳过；除49项基线失败外，另暴露了全局 fetch 计数混入页面请求，以及标签测试视口接近自然宽度阈值的问题。前者改为只跟踪测试明确创建的两位消费者，后者改用确实溢出的440px视口，保留等宽/不越界断言；定向复验通过，标签连续五次通过。最终构建、boundary、workspace typecheck 均通过；全量1293项：1239通过、49失败、5跳过，与初始基线逐项比较零新增失败（`/tmp/molis-coding-write-final-{build,boundary,types}.log`、`/tmp/molis-coding-write-verified-tests.log`）。既有49项失败仍保留，标签定向稳定性不代表全产品切换体验已经验收。
- 剩余工作：命令、完整差异反馈/检查/Artifact/Goal、C12/C13 仍按既定范围继续，不因单处写入成功宣称 Coding 完成。索引增加前的开发轮次没有当时的 Host 审查决定，不能倒推批准人；未知副作用的核对与继续仍属 C9 待补范围。

### 当前功能块：命令执行与检查回执（实现中）

- 已核对 SDK 主仓 `3077386c5b7bb86637dfd72b3405d3c629a5a066` 干净，在独立工作树 `/Users/oreal/.codex/worktrees/molis-coding-receipts/prologue`、分支 `codex/molis-coding-receipts` 修改；FlyLeaf 仍只读。SDK 原执行队列登记本消费前置修复，短合同为 `docs/slices/command-receipt-consumption.md`。
- 当前真实缺口：Host 回执有结构化退出码/输出/停止原因，但 SDK 原 Agent 公开持久事件只有可读工具文字。采用既有 Resource + Session 事件保存精确命令回执引用；不在 App 新建执行账，不从模型文本解析退出码。SDK 工具结果另带明确返回/失败状态，旧记录缺字段不倒推为成功。
- 已在 SDK 隔离源码验证真实 Node 成功、非零退出、取消、超时、原资源和事件重建读取；回执保存失败必须停止对账，不进入下一轮重跑。模型响应在这些工程测试中受控，不能当 MiniMax 产品实操。
- SDK 最终类型/构建通过，全量3210项：3188通过、2失败、20跳过；两项网络失败在原主仓基线复现，浏览器夹具的空页读取与连接收尾已修正（`/tmp/prologue-coding-receipts-verified-all.log`）。干净 npm 安装包只从公开入口启动真实 Node 非零命令、读双流、重建读取，磁盘计数仍为一次。受控模型响应不等于真实模型实操。
- 本仓已切换独立命名的 vendor 包并接入明确工具状态：返回、失败、旧记录状态未知；不从正文判断成功。构建、boundary、workspace typecheck 与19项定向已通过。首轮全量1294项：1234通过、55失败、5跳过；唯一不在初始基线的失败是构建后同步 inventory 导致指纹失效，安装器正确拒绝旧 dist。已重新完整构建，原安装路径定向通过（`/tmp/molis-coding-command-sdk-final-build.log`、`/tmp/molis-coding-command-sdk-install-verified.log`）；该次全量已结束，结果与后续命令入口接通情况见下文；当前产品已能审查并执行命令，不能继续标成未接通。

- MiniMax 正式入口会话“真实工具状态与材料缺失”（`4d5f8b02-b48a-458f-964d-ef2f1eac3bcd`）先读取 README，再读取不存在的材料。实际显示一项已返回、一项失败，保留已读正文；模型准确区分已确认/未知，未搜索、重试或修改。进程真正重启后，内容、状态、归属和用量逐项一致，证据为 `/tmp/molis-coding-sdk-tool-status-{live,restarted}.json`。这是工具状态与升级恢复的指定路径验证，不是命令执行实操。
- 恢复的反例保留：逐字段对比发现工具/回答的 `at` 被恢复逻辑统一投影为起跑时间，`ended_at` 变成 null。内容与结果没有丢，但精确时间没有恢复；不能声称原轮完整字段一致。后续须从 SDK 原执行账的公开时间事实恢复，缺失则明确未知，不能把起跑时间当实际发生时间。
- 安装时 pnpm 对本地私有 tarball 尝试查注册表发布日期导致404；已核对三个 archive 内的名称/版本，仅对 `@adeptify/intelligence-client@0.2.2`、`@adeptify/search-evidence-layer@0.4.1`、`@prologue/sdk@0.0.0-rc.1` 增加精确版本例外。其余发布时效检查不变；锁文件只切换 Prologue tarball 与完整性值，inventory 的声明路径同步。
- 命令产品接线已实现：Host 审查展示 SDK 固定程序、分项参数、相对目录、环境变量名称、超时与升权字段。只有审批桥与回执读取都存在才开放执行角色，能力配置只能收窄。命令回执按 Session/Run/call 读取 SDK 原资源，核对工作区及 Effect 身份；缺失、损坏或旧调用有歧义明确拒绝。右栏按轮次展开 stdout/stderr、退出码、截断、取消和超时，不新增 PTY 或第二执行账。
- MiniMax 正式会话“真实检查与命令回执”（`fe4d05ad-e563-41cd-80d4-a6b757552dc4`）实际读三份材料、申请 `node --test basket.test.js`；批准后五项通过。右栏读到退出码0与真实输出，模型依据回执报告，明确检查通过不等于产品验收。同会话随后验证不存在的测试文件退出1、stderr保留；25秒命令启动后从 UI 停止，回执为 cancelled、退出码未知，保留 STARTED 且没有 FINISHED。另一个正式会话“命令超时与部分输出”（`1192293a-0e7a-4238-93dc-02cb5c2e8afa`）验证45秒脚本被30秒上限停止，回执为 timed-out，保留已产生的 stdout。四份回执在真正重启并加载新 SDK 后逐字段一致（`/tmp/molis-command-receipts-all-{live,restarted}.json`）。
- SDK 升级后的最终全量1294项：1239通过、50失败、5跳过（`/tmp/molis-coding-command-sdk-final-tests.log`）；其中49项为初始基线已有，新增窄屏标签布局失败已定位为占位伸缩与滚动填充参与宽度预算。标题栏空白不再与标签争抢初始48px，计算扣除容器内边距，不把上次自动滚动的填充宽度当作新内容。窄屏测试等待后续布局帧，五次独立运行与本块全量均通过。
- 命令产品接线、角色 v4 和标签布局修复的构建、boundary、workspace typecheck、23项定向通过；完整回归1296项：1242通过、49个初始基线失败、5跳过，零新增失败（`/tmp/molis-command-product-all-tests.log`）。追加反馈修复后的构建、boundary、workspace typecheck 同样通过；最终全量1298项：1244通过、49个初始基线失败、5跳过，零新增失败（`/tmp/molis-command-feedback-{build,boundary,types,all}.log`）。

- 实操追加两处反馈修复：① 批准后仍显示等待审查：现只在 SDK 接受本次决定后清除等待，转为执行中；交付失败保留等待，不把用户点击当作执行完成。② 超时输出右栏存在、模型却只见 exited ?：复用 SDK 既有检查事实和受限诊断提醒，把精确停止原因、退出码与截断后的双流交给下一轮模型；标明输出是不可信数据并转义提醒结束标签，不新增执行账或权限。定向33项通过，SDK 真实 Node 超时测试验证下一轮模型请求收到部分输出；正式新会话“超时输出与批准状态复测”（`e5bb8e3d-1fc3-413d-be98-027eb0a3667c`）用同一模型、同一任务验证：批准后工具尚在执行时显示“执行中”；超时后右栏保留 STARTED，模型准确报告已收到 stdout、stderr 为空、退出码未知、未见 FINISHED。证据为 `/tmp/molis-command-feedback-minimax-{session,receipts}.json`；原回执保留 `stop_reason=timed-out` 与底层取消字段，UI 按停止原因显示超时，不重写原账。此项是指定命令路径实操，不替代全部 Coding 验收。
- 追加 SDK 类型、构建、全量通过原有边界：3210项中3188通过、2个已复现的网络环境失败、20跳过（`/tmp/prologue-command-feedback-all.log`）。独立 npm 消费新 tarball，真实非零命令输出进入下一轮模型请求，重建读取回执且没有重跑（`/tmp/prologue-command-feedback-consumer.log`）。Molis 的依赖声明、inventory、锁文件和实际 node_modules 均已指向 `command-feedback.tgz`；本次未发布 SDK。
- 仍有任务质量反例：执行角色 v3/v4 在同一长会话面对明确命令时多次只回复计划、未调用工具，追加“实际调用工具”才进入宿主审查；新会话的一次成功不能证明此问题消失。必须继续改进并用同条件任务验证，不能把这部分人工负担归为已解决。

- 上一轮实操时 4198 运行该新包构建，构建时间 `2026-09-19T23:27:41.093Z`；源码指纹 `4bab3ef4aad36c7c89655db4a7a59715449a6973de18d7ceb017e41ee4a46180` 与 dist 一致。恢复后旧四份命令回执与新超时实操均从该服务读取。窄屏深色实看可读，但已结束审查全文占据较多结果栏空间，集中体验打磨仍需压缩历史审查呈现；宽屏截图工具异常未形成有效视觉证据，不能计作通过。

### 2026-09-20 提交整理范围

用户追加授权将已完成工作拆分提交并推送功能分支。Molis Work 代码按执行层、模型设置、插件生命周期、正式 Coding 工作台分组；SDK 的真实浏览器夹具修复与命令回执/反馈分别提交。只保存开发成果，不代表整体产品完成、用户验收或主分支合并。

- Molis Work：`960b3e9` 执行/审查/恢复；`d348f49` 模型设置；`0e114ec` 插件重启/升级；`702d7cc` 正式 Coding 工作台与命令检查。
- Prologue：`2b64cb8` 浏览器夹具；`8d59081` 命令回执与超时反馈。SDK 包来源见 `vendor/prologue-sdk/README.md`。
- 中断时 C8 的四个文件补丁已完整备份并移出本次提交，提交后保留在本地继续；本次远端代码不包含未接完的问卷合同与回答适配修改。无引用的中间 SDK 包 `coding-receipts.tgz` 留在本地，不新增到远端。
- 提交代码重新完整构建后，源码指纹仍为 `4bab3ef4aad36c7c89655db4a7a59715449a6973de18d7ceb017e41ee4a46180`，与上一完整功能块相同。构建、boundary、workspace typecheck 已通过。
- Molis 本次全量回归 1298 项：1244 通过、49 失败、5 跳过；49 项失败与上一完整功能块逐项一致，零新增失败。日志：`/tmp/molis-commit-{build,boundary,types,all}.log`。失败没有计作通过。
- SDK 重新构建及命令/超时/真实浏览器三份定向测试通过（21 项）；包内 494 个构建文件与源码重建结果一致。本次不重复全量 SDK 测试，沿用同一代码状态的上一轮 3188 通过、2 项基线网络失败、20 跳过。
- 本次没有重新执行 MiniMax 产品旅程或用户验收；既有实操证据及质量反例继续有效，整体 Coding App 仍未完成。

### 下一功能块：C8 原问题、原答案与同轮继续

已核对当前 SDK 的公开 AskUser 合同与源码：`ask-user` 真正等待原 Pending，文本/冻结问卷均已有、答案持久化后才唤醒，普通回答不授权 Effect。Molis 不需要再造提问账或修改 SDK 引擎；必须补齐既定的单选、多选和自由输入。

- 调用链：角色声明 ask-user → SDK 发输入等待引用 → Node adapter 读取该 Session/Run 的原 Pending → 既有 AgentRunView 投影完整题目 → 当前对话位置展示 → 正式 control 路由提交到同一个原 Pending。准确核对归属、版本、期限和活执行者；终态/旧问题不能借回答复活。
- 现有单个 prompt/options 字段不能表达 SDK 多题问卷，需在同一合同补充有编号的冻结问题和对应选择；保留旧文本调用，不从事件描述或工具正文猜题目。答案按冻结编号提交，选项不预选，不把问题当审批。
- 正式会话 client 复用设计系统与现有卡片样式，轮询保留输入与焦点；离开只保存草稿，不取消等待。失败留原答案以便重试，后台问题只更新目录。提交成功以执行方已接受为准，原工具结果负责历史答案，不另存第二份执行记录。
- 必验：实际 MiniMax 文本及问卷等待→回答→同轮继续；无回答不继续、跨会话拒绝、过期/停止后拒绝、重复提交不重复继续、切换与重开不丢尚未提交内容。进程重启后无活执行者的问题明确不可答，继续策略仍归 C9，不能伪造自动恢复。

### Harness 对照形成的初步取舍

- Codex `codex-rs/core/src/session/inject.rs`：判断活动任务与插入补充输入在同一锁中，
  没有活动任务就返回未消费输入；否则会出现补充要求“显示已发出，实际上错过本轮”的竞态。
  这里采用同轮控制与收件回执的约束，通过 SDK steer 核实实际消费位置，不在 UI 点击时就声称 Agent 已遵循。
  `compact.rs` 另保留真实用户消息与来源标注，摘要不替代原要求，适配现有四层 Prompt 与 SDK 历史来源。
- Cline `sdk/packages/core/src/session/checkpoint-restore.ts`：恢复前先保存工作区，失败再回滚，
  解决恢复过程中一半成功导致用户改动消失的问题。采用“先核验范围、能回滚、部分失败如实记录”的要求；
  不复制其整个 worktree 的 `reset --hard` / `clean -fd` 做法，Molis 复用 SDK 有范围且经过 effect-policy 的回退，
  用户或其他任务后续改动必须冲突检查，未批准不能动。
- Pi `packages/coding-agent/src/core/compaction/compaction.ts`：压缩保留摘要、保留区间及读改文件线索，
  原因是长任务不能只恢复最后几条消息。这里复用 SDK 的历史/压缩机制，补需求、决定和未解决项的上下文约定；不复制第二套历史账。
- Maka `packages/runtime/src/agent-run-recovery.ts`：按事件区分中断工具、等待过期和缺少终态，不能把进程结束视为完成。
  这里恢复时查 SDK 的执行事实，未确定副作用先对账；不凭聊天文本自动重跑。
- OpenCode `packages/opencode/src/tool/plan.ts`：Plan 的确认和进入实施分开，避免模型把提案当授权。
  这里以既有宿主授权语义承接，普通任务不强制规划；不复制它的界面和另一套审批。
- Grok Build 的 compaction prompt 强调任务、行动、错误、文件与用户输入。采用这类必要信息保留目标，
  不照抄冗长固定章节；压缩质量要由恢复后是否能继续正确工作判断。
- deer-flow `backend/packages/harness/deerflow/subagents/report_contract.py`：子代理报告要将证据与声明分开，委托材料也不升级成系统规则。
  这里交接保留结果、实际回执及未验证项；主代理仍负责核验，不将子代理结束当验收。

## 1. 三份文件怎么分工

| 文件 | 回答什么 | 什么时候改 |
| --- | --- | --- |
| 本文 `spec.md` | 要做什么、做到什么算完成 | 范围或验收条件变了 |
| [`design.md`](design.md) | 长什么样、怎么交互 | 界面或交互决策变了 |
| [`implementation.md`](implementation.md) | 怎么落地、按什么顺序、代码放哪 | 实施路径变了 |
| [`ui/`](ui/README.md) | 定稿的四张主屏（可直接打开） | 设计稿重画了 |

三者冲突时：**范围以本文为准，界面以 `design.md` 为准，顺序以 `implementation.md` 为准。**
发现某一份和另一份打架，先改文档再动代码——2026-09-19 就出过一次
（UI 稿把终端和预览画进来了，而 `design.md` §12 还写着它们不在首版）。

## 2. 设计稿

定稿快照：[`ui/`](ui/README.md)，四张 1440×900 的静态 HTML。
可编辑的原始画布在 Artifact：`https://claude.ai/artifact/W1wXuuLuGc9CuWfVCYYKpW`
（私有，未分享的人打不开；仓库里的快照才是定稿依据）。

## 3. 边界

**做**：编码会话的组织、执行的观察与控制、成果的预览与处置、跨插件的协议交换。

**不做**：
- 不重造终端。右栏终端页只读**本轮执行自己跑过的命令回执**（Agent Host 的 `AgentCommandOutput`），不是 PTY，
  也不是 Sessions 那个交互终端——那是用户自己的终端，两件事。
- 不自己决定副作用。批准是用户在宿主审查面里的动作，Coding 碰不到。
- 不发明角色。角色与 Prompt 由插件 Manifest 声明，宿主冻结后交给 adapter。
- 不做 PR/CI 跟踪、云端执行、定时任务。

## 4. 验收条件

按动作路径写，不按页面写。每条都要有测试。

### A. 开一条会话
- A1 不选 Goal 也能开；选了 Goal，会话出现在该 Goal 分组下。
- A2 工作区目录由宿主授权并核过 realpath；插件不能指定任意目录。
- A3 选中的角色必须是 Manifest 声明过的；角色需要的能力 Runtime 必须真的支持，否则**拒绝起跑**并说明原因。
- A4 没有配置模型时，开始按钮不可用，并指向全局设置。

### B. 看一轮执行
- B1 事件流投影出轮次、工具活动、用量；用量没报就显示未知，**不填 0**。
- B2 停止、暂停、恢复、转向四个控制真实作用于 Runtime；Runtime 不支持的控制显示为真实不可用。
- B3 Runtime 返回的冻结权限若比 Manifest 宽，该 Run **立刻取消**并留下回执。
- B4 会话可关闭、可重开，重开后轮次与成果完整——事件流和端口绑定都落库。

### C. 处置成果
- C1 变更集能按文件看差异，行上能留意见，若干条一起发回，**发回不等于批准**。
- C2 只读档下「应用」是真不可用，不是点了没反应。
- C3 成果作为 Artifact 发布，带 producer 身份与版本；消费方拿到的是固定版本。
- C4 Canvas 画出来的图可以存为 Artifact，同样带来源和版本。

### D. 跨插件
- D1 Shelf 材料经输入端口进入会话，用的是 Artifact 的固定版本。
- D2 命令回执来自 Agent Host（本轮执行跑过的命令），只读；Coding 不另开一条命令执行路径。
  Prologue 的 Node 装配已接通宿主命令审查与持久回执；CLI 仍不支持宿主审批下的新命令，但能读取已有回执。
- D3 轮到用户处理时进 Inbox。
- D4 关联 Goal 的会话，结论能写回 Goal 事件。

### E. 诚实
- E1 能力矩阵里 `unsupported` 就是真不可用，界面上不画空壳。
- E2 浏览器页与终端页在对应 Capability 注册之前，显示为真实不可用。
- E3 批准不等于已发生：`effect_settled` 要等真实回执。

## 5. 阶段（历史切片记录；当前产品完成度以 §0 为准）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| C0 | UI 与交互设计定稿 | **已完成**：`design.md` §14、`ui/` 四张稿 |
| C1 | Capability 地基：Projects 工作区只读、Agent Host 命令回执（Goals 复用已注册的 16 个） | **基础实现存在，产品闭环见 §0**：`projects.workspace.read.v1`、`agent.command-output.v1`；`tests/coding-capabilities.test.ts` 3 项、`tests/agent-host.test.ts` 15 项 |
| C2 | Artifact 类型：ChangeSet / Report / Diagram | **基础实现存在，产品闭环见 §0**：`plugins/native/coding/src/artifacts.ts`；图是结构不是 SVG，见下；`tests/coding-artifacts.test.ts` 5 项 |
| C3 | 插件本体：Manifest + 三段 UI | **基础实现存在，产品闭环见 §0**：包、Manifest、投影层、目录栏与工作台渲染、会话落库（真实 SQLite 重开验证）。`coding-projection` 5 项、`coding-ui` 5 项、`coding-store` 4 项 |
| C4 | 宿主审查面 | **已接进产品装配**：`composeAgentHost` 在 `web-server` 里被调用，CLI 运行时已注册，插件经 Capability 真的够得到（`tests/agent-host-composition.test.ts` 5 项）。会话里的审查摘要卡已做（含「卡片上不能有任何按钮」这条硬断言）。**审查队列已经走 HTTP**：`/api/agent/reviews` 读、`/api/agent/reviews/decide` 决定，复用既有的本地控制护栏（同源 + 控制令牌 + 一次性键），重放返回 409。宿主渲染器现已挂入 Coding 结果区，正式页面已有 MiniMax 单处补丁审查实操；拒绝/冲突/恢复见 §0 当前验证。`agent-review-surface` 7 项、`coding-review-card` 5 项、`agent-review-http` 4 项 |
| C5 | 审批桥挂到 Prologue + 真实模型验证 | **文件审批已接通，失败路径与恢复验证中**：桥挂上之后 `text-edit` 才申报支持（`command` 不跟着变，见下）。两种 API 格式已对着真实 MiniMax 验证通过，见 C6。`tests/prologue-approval-attachment.test.ts` 5 项 |
| C6 | 模型供应商管理（设置页 + 两种 API 格式） | **基础实现存在，产品闭环见 §0**：契约、设置页、落库（目录库 schema 17）、到 `modelConfiguration()` 的映射，以及**跨密钥库的凭据交接**。`model-providers` 9 项、`model-provider-store` 7 项、`prologue-credential-bridge` 6 项 |
| C9 | 对齐 FlyLeaf 的全部能力 | **基础实现存在，产品闭环见 §0**：方法/MCP 选择、检查点、子代理与验收、恢复投影、工作区事件、并行写入（含真实 git 工作树）、报告与用量视图、贴底行为。`coding-selection` 8、`coding-delegation` 8、`coding-recovery` 7、`coding-events` 8、`coding-writers` 9、`git-worktrees` 5、`coding-reading` 6、`coding-report-usage` 4 |
| C8 | 结构化提问（AskUser） | **基础实现存在，产品闭环见 §0**：问题进 `AgentRunView.awaiting_input`，回答是独立的控制动作（不是 steer），Coding 侧有提问卡片。`coding-question-card` 7 项、`agent-pending-questions` 4 项 |
| C7 | Coding 由 Plugin Runtime 托管 | **基础实现存在，产品闭环见 §0**：产品经 `coding-surface.ts` 起平台、启动 Coding、用它的 contribution 渲染目录；`kind` 已从 `native` 翻成 `app`。`coding-plugin-activation` 3 项、`coding-surface` 3 项、`plugin-panel-seam` 3 项 |
| C10 | 复现 FlyLeaf 的另外五个插件 | **基础实现存在，产品闭环见 §0**：`workspace` / `files` / `diff` / `git` / `text-stats` 五个包，Manifest v2 端口与输入组、纯投影层、UI 贡献，全部在真平台上一起启动并能连线。跨插件的载荷契约收进 `contracts/modules/workspace-artifacts`（插件之间不许互相 import）。`workspace-plugin` 7、`files-plugin` 13、`diff-plugin` 16、`git-plugin` 18、`text-stats-plugin` 7、`workspace-plugin-graph` 5、`plugin-catalog-companions` 7 |
| C11 | 提示分层：划清 ReAct 里属于我们的那一层 | **基础实现存在，产品闭环见 §0**：四层契约、宿主按层组合、项目层接上项目指引、只读的「这一轮的身份」面。`agent-prompt-layers` 11 项 |
| C12 | Character 管理（角色变成用户可管的数据） | **计划中**，见 §7 |
| C13 | Plan → SubAgent 接通 → TaskBoard | **计划中**，见 §7；三者按这个顺序，倒过来会做出没有内容的板子 |
| C14 | Prompt Cache（开，不只是读数） | **基础实现存在，产品闭环见 §0**：供应商记录带 `prompt_cache`，落库（目录库 schema 18）、设置页、透传到 `startAgentRun`。`model-prompt-cache` 7 项 |
| C15 | 修 protocol 名字对不上 | **已修**：`prologueProtocolFor()` 做显式翻译，断言钉在 Prologue 自己的适配器表上。`model-protocol-mapping` 5 项 |

C1 与 C2 都挡着 C3；C4 挡着 C5。顺序理由见 [`implementation.md`](implementation.md)。

### C5：文件写入已接通，恢复与反馈仍需验证

**已有的组件接缝，不等于产品装配完成。**
`PrologueAgentAdapter` 现在接受一个 `approvals` 桥。挂上之前 `text-edit` 如实申报为 `unsupported`，
宿主拒绝任何会写入的角色起跑；挂上之后它才算支持，而且 Run 每停在一笔副作用上，
这笔副作用都会**先进宿主审查队列**，在用户决定之前执行主人那边收不到任何答复。
镜像失败不会被当成放行——它记在这一轮的活动里。

**`command` 需要审批桥和回执读取同时接通。** Node 装配已满足这两个条件，
`workspace-write` 可以起跑；仅挂桥的其他装配仍拒绝命令。能力配置只能收窄，不能绕过缺失端口。

**当前证据**：实际打包 SDK + MiniMax 已通过读取文件和两轮连续对话，修正参数、引用与终态时序，详见 §0。
正式 Coding 入口已用 MiniMax 完成单处 Bug 修复、批准落盘、拒绝零写入、外部创建冲突保护、同会话创建另一文件，以及批准命令后读取退出码0和1的真实输出。完整成果交付尚未接通，C5 不据此宣称完整 Coding 已完成。

另外 **CLI 那一侧的写入仍然不支持**：Claude Code 的审批发生在它自己的权限模型里，
要打开需要一个 permission-prompt 工具把询问转回宿主队列。

产品已构造 Agent Host，并按需注册 Prologue，凭据与模型已接。真实 PatchReview、宿主决定与效果回执已装配，“修改文件”可从正式入口使用；完整 builder 仍受命令回执能力门禁。

## 5.1 C6：模型供应商管理

Coding 要跑起来，用户得能配模型。这一段 2026-09-19 纳入范围，参照 Prologue 的模型管理。

**两种 API 格式都要支持**，而且都已对着真实服务（MiniMax）验证过：

| 格式 | 验证地址 | 结果 |
| --- | --- | --- |
| `openai-chat-completions` | `api.minimaxi.com/v1/chat/completions` | 通，1386ms |
| `anthropic-messages` | `api.minimaxi.com/anthropic/v1/messages` | 通，976ms |

`scripts/verify-model.mjs` 是这次验证用的脚本，读 `.secrets/model.local.json`（已 gitignore）。
**密钥只出现在请求头里**，日志与报错一律只打印长度。

已经落地的判据：

- **密钥不进记录**。`ModelProviderRecord` 只存一个指向密钥库的 `credential_ref`，
  设置页渲染的是「已保存 / 还没填」，从不渲染密钥本身，字段上连 `value` 都不带。
- **「有没有密钥」问密钥库，不问记录**。记录里存一个 `has_credential` 会在密钥被删后变成谎，
  页面就会显示一个跑不了的供应商。
- **状态分清三种**：没填密钥、被关掉、没启用任何模型——它们是不同处境，不能混成一个灰点。
- **上下文徽标只在知道时出现**，不猜一个数字。

一个实测差异要在投影层处理：**同一个模型，OpenAI 那条会把 `<think>` 推理段当正文吐出来，
Anthropic 那条不会。** 正文里混进推理过程，用户读到的就不是结论。

### C6 那一跳已经闭上

`PrologueCredentialBridge` 把 Molis Work 的引用换成 Prologue 认识的引用：从我们的密钥库读出密钥，
经 `PrologueHost.writeCredential` 交给它自己的凭据库，换回一个它能解析的引用。

**每个引用只交接一次**（按引用缓存），**递过去的字节用完立刻清零**——JS 里字符串抹不掉，
能抹的那份就该抹。没配解析、密钥库里没有、密钥是空白，三种情况各自报清楚，
而且**解析不到就不往 Prologue 写任何东西**。

### 命令回执能力与产品入口

`command.receipts` 是新加的能力，和 `command` 分开：**能说清跑过什么，和能不能在宿主审批下跑新的，
是两个问题**。CLI 流现在保留命令回执（输出按 16 KiB 截断并如实标记，失败的输出进 stderr，
退出码保持 `null` 因为 CLI 只说成功失败），`readCommandOutput` 真的读得到。

回执投影按 `command.receipts` 判断可用性，而不是按 `command`。CLI adapter 可读取已有回执，不能因此声称其正式产品入口已全部接通。
当前 Coding 正式会话使用 Prologue，右栏可按轮次展开 SDK 持久命令回执。CLI 的 `command` 依然不支持，因为执行审批仍归它自己的权限模型。

### C7：`app` 现在是真的

那条缺失的通路已经建好，分三段，每段都可单独验证：

1. **接缝**：渲染器接受 `plugin_panels`（按项目插件 id 的已渲染面板）。
   不提供时页面输出**逐字节不变**——`tests/plugin-panel-seam.test.ts` 直接断言这一点，
   所以接缝先落地不会造成半截迁移。
2. **托管**：`apps/local-host/src/coding-surface.ts` 按项目起 `createPluginPlatform`、
   启动 Coding、取它的 contribution、用它声明的 `directory` 视图渲染面板。
   **任何失败都返回 null**，页面退回原来的样子——一个插件坏了不该把整页带走。
3. **接线**：`web-goals-read` 在注入 `enabled_plugins` 的同一处注入面板。

于是 `kind` 从 `native` 翻成 `app`：宿主**确实**经 Plugin Runtime 启动并隔离它，
也**确实**用它自己的贡献来画。其余六个内置插件仍是 `native`，因为它们还是构建期组合。

## 5.2 C8：结构化提问

Run 停下来问问题时，原先**只有 phase 能看出「在等」，看不到「在问什么」**——`AgentRunView`
没有任何字段承载问题，界面也就无从显示，Run 卡住而用户无路可走。这是功能闭环缺口，不是增强。

补了两处：

- `AgentRunView.awaiting_input` 承载问题（问题原文、选项、是否接受自由输入）。
  Prologue 的事件**不带选项**，所以选项就是空数组——编出选项等于替运行时说话。
- `AgentRunControl` 增加 `answer`，**和 `steer` 分开**。steer 是给运行中任务追加指令，
  回答是针对某一条待答问题并关掉它；混在一起会让问题一直悬着，而执行把回答当成无关指导。
  测试直接断言「steer 不会关掉问题」。

界面按设计 §6 的三条硬约束做：**一个选项都不预选**（预填的答案是用户没给过的答案，
而执行会照它动作）、**没有关闭/忽略入口**（离开不等于取消）、
**运行时不接受自由输入时就不给输入框**（不邀请一个会被丢掉的回答）。

CLI 那一侧如实报「不会提出结构化问题，因此也没有可回答的对象」。

## 5.3 C9：与 FlyLeaf 的能力对齐

逐个模块对照 FlyLeaf 的 `plugins/coding-agent/`，缺的全部补上。几条在复现时保住的语义：

| 语义 | 为什么不能省 |
| --- | --- |
| 你选的 ≠ 这一轮冻结的（方法/MCP） | 只显示选择，会让用户以为改动已对正在跑的这轮生效 |
| 跑完 ≠ 验收通过（子代理） | 执行终态归运行时，验收判断归插件；判成需返工不会改掉运行时报的状态 |
| 跑着时不能回退（检查点） | 不能在 agent 脚下抽地板；但看得见，只是给出原因 |
| 批准过但没回执 = 无法确定是否发生（恢复） | 中断之后这件事不能往任何一边假设 |
| 草稿只来自本地意图（恢复） | 从运行时状态反推出一句用户没写过的话，比没有草稿更糟 |
| 写入者还在跑时不能整合 | 会把人家写到一半的改动截走一半 |
| 冲突文件不可选但仍列出 | 从列表里消失比说明白更难解释 |
| 没报用量显示未知而不是 0 | 0 会被读成「这一轮不花钱」 |
| 人往上翻后不抢滚动 | 读历史读到一半被拽到底，等于没法读 |

**并行写入接了真实 git**：`apps/local-host/src/git-worktrees.ts` 用 `execFile`（参数数组，不走 shell，
因为分支名受用户影响）建工作树、列改动、清理。非 git 目录和没有提交的仓库都如实报不支持——
在那里说支持，会在第一次建工作树时才失败。写入者 id 限定安全字符集，
`../escape`、`--upload-pack=evil` 这类都被拒，不会变成 git 参数。

工作区事件的路径校验比 FlyLeaf 更严：拒绝**所有**控制字符而不只是空字节，
`..` 与分隔符一律拒绝而不是 normalize——想爬出工作区的载荷是坏载荷，悄悄改写会把问题藏起来。

## 6. 历史缺口记录（部分已过期，当前事实见 §0）

- **除 Goals 外没有任何模块注册过 Capability**。Goals 有 38 个定义、37 个绑定，其余模块是 0。
  这是 C1 存在的原因，也是目前最实的扩展性约束。
- **Sessions 没有命令回执这份事实**。它有一个活的 PTY 客户端，不存"某条命令跑完留下什么"的记录。
  所以终端页的来源改成 Agent Host 的 `AgentCommandOutput`（本轮执行自己跑的命令），
  这份契约已经存在、两个 adapter 都实现了（都如实抛不支持），只是还没暴露成 Capability。
- **浏览器页两端能力不对等**：桌面壳有 WebView，Web 版只有 iframe。
  可能要接受「浏览器页只在桌面版可用」，Web 版如实显示不可用。
- ~~**Canvas 的图形类 Artifact 是新课题**~~ 已定：**图是结构不是 SVG**。
  本轮执行产出节点与连线，宿主来画，标签一律作为文本节点进入。
  让模型直接吐 SVG 等于把模型输出变成应用 DOM 里的标记，中间只隔一个消毒器——那种白名单会被绕过。
- **Prologue SDK 接缝已对真实 MiniMax 实测**，protocol、端点、资源引用、历史与流式已修复；
  正式 Coding 产品执行仍待装配。旧 protocol 缺陷分析保留在 §7，不能继续描述为当前未修。
- **CLI 的写入不经宿主审批**，因此 `text-edit` / `command` 申报为不支持。
- **产品已构造 Agent Host 与 PluginPlatform**，后者当前只贡献目录；Prologue、会话工作台与宿主审查尚待接通。

## 5.4 C10：FlyLeaf 的另外五个插件

FlyLeaf 的 `plugins/` 下除了 `coding-agent` 还有五个：`projects`、`files`、`diff`、`git`、`text-stats`。
它们在这里全部复现，并按 Molis Work 已有的东西做了映射：

| FlyLeaf | 这里 | 为什么这么映 |
| --- | --- | --- |
| `projects`（选目录 + 发布它） | `workspace`（只发布） | 项目在 Molis Work 已经是目录库里的一等记录，选目录不是插件的事；缺的那一半是「把当前项目变成别人能连的值」 |
| `files` | `files` | 树、阅读器、`before`/`after` 快照、选区，全部照搬；目录读取归宿主，插件只投影 |
| `diff` | `diff` | 三组可互换输入：两份快照、Coding 的变更集、Git 的工作区改动 |
| `git` | `git` | 工作区状态、提交草稿、接受一轮变更；`git` 仍由宿主跑，porcelain 的解析放在插件里才测得动 |
| `text-stats` | `text-stats` | 系统里最小的一个完整插件：一个必填输入，不要能力、不发端口、不发事件 |

几条在复现时立住的判断：

- **插件之间不许互相 import。** FlyLeaf 里 `files` 直接 import `@flyleaf/git/events`，这里过不了
  `boundary:check`。跨插件的载荷因此收进 `contracts/modules/workspace-artifacts`：形状是约定，
  插件是可替换的实现。事件 id 也放在那里——**订阅别人不等于依赖别人的代码**，但校验器留在发布方，
  因为只有它知道自己的载荷是什么意思。
- **一轮执行的 diff 是片段，不是整份文件。** Coding 的变更集带的是每个文件的 unified diff，
  拿它算不出整份对比。所以这种对比标成 `partial` 并在行的上方说出来，而不是画成一份完整比较。
- **Artifact 里不能出现真实路径。** 工作目录引用带的是宿主的不透明句柄；Artifact 是会流动的，
  路径塞在里面等于把用户的磁盘结构漏给每一个经手的插件，包括从没拿过文件系统权限的那些。
- **接受一轮变更是人做的决定。** `git` 只判断这个决定现在还能不能给：文件在那之后动过、
  有冲突开着、改动已经落盘——三种情况各自拒绝并说明。执行由宿主做，所以只是「显示」一个变更集的界面
  不可能变成提交工作的地方。
- **必填输入会把来源一起带上。** 启用 `files` 会一并启用 `workspace`，启用 `text-stats` 会带上
  `files` 和 `workspace`——伴随关系由 Manifest 推导，不是手写的表。一个必填端口没人能发布的插件，
  单独开着就是一个永远填不满、也说不出为什么的导航格。

### 这一段没接通的部分

- **只有 `workspace` 的面板接上了产品。** 五个插件都在 `coding-surface.ts` 里随项目一起启动（端口与
  事件订阅因此才登记得上），但 `files` / `git` / `diff` 的面板需要宿主提供目录列表、文件读取和
  `git status`，这三处数据源今天不存在。面板没挂 ≠ 插件没跑，但也不能反过来说成「Files 能用了」。
- **端口之间还没有默认连线。** 宿主没有替用户建任何 binding，所以图是「能连」而不是「已连」。
  `tests/workspace-plugin-graph.test.ts` 里连线是测试自己建的。

## 7. 下一批：四处缺口与一个已确认的缺陷

**对照的基线在哪。** 不是凭印象说「市面上都有」。`/Users/yijunwang/reference` 下有几家的真源码
（`codex`、`cline`、`opencode`、`claude-code-sourcemap-main`、`claude-code-system-prompts`、
`grok-build`、`openclaw` 等），Prologue 的 `docs/slices/model-facing-gaps.md` 已经照着
Codex 的 `codex-rs/core/src/tools/handlers/`、Claude Code、OpenCode 的 `core/src/tool/`、Cline
查过一遍工具面。下面每条要补的东西，**先去那几份源码里看别人怎么做的、为什么那么做**，
再决定我们抄哪一半、拒哪一半——`model-facing-gaps.md` 里「明确不做」那一节就是这种拒绝的样子，
它比照搬有价值。


下面五条来自一次逐项对照（Coding 的 ReAct 提示分层、Prologue 的 Character 模块、
TaskBoard/SubAgent/Plan/协同、Prompt Cache）。每条先写**今天是什么**，再写**要做什么**——
「今天是什么」是查过代码的，不是印象。

### C11 提示分层：把 ReAct 里属于我们的那一层划清楚

**今天是什么。** ReAct 循环**不在这个仓库里**：think → act → observe 跑在 Runtime 里
（Prologue 的 agent loop、Claude Code CLI）。这边只做一件事——在 Run 起跑前**冻结身份**：

- `plugins/native/coding/src/roles.ts` 里 7 段 prompt body（`coding-base` + 6 个角色专属）、6 个角色；
- 每个角色用 `prompts: ["coding-base", "coding-<role>"]` **点名**要哪几段；
- `composeRolePrompts()`（`horizontal/agent-host/src/index.ts`）按点名顺序取 body，
  角色不点名才回退到「全部已声明的」——早先是**无条件**回退，只读角色因此拿到过写入者的
  「你可以改文件」，那是真 bug，已修；
- adapter 收到的是冻结后的 `{role_id, version, execution, prompts[], host_tools[]}`，
  它不读 `roles.ts`、不自己拼；起跑后再复核一次，Runtime 回报的角色与冻结的不一致就取消 Run。

所以**只有系统指令这一层是我们的**。工具调用的格式提示、观察回填的措辞、重试提示，
全在 Runtime 里，我们既没设也改不了。

**做完了什么。** 没有「把 ReAct 搬过来」——那会变成第二个 agent 循环，和 Runtime 抢同一件事。
补的是**我们这一层**：

1. **四层有了名字和顺序**：`base`（产品约束）/ `role`（这一轮的身份）/ `project`（这个项目的约定）/
   `task`（用户这一次写的）。组合严格按这个顺序，**层内顺序不动**——角色点名 prompt 的次序是它有意排的。
2. **`task` 不能被声明。** 包里出现一个 task 层的 prompt 会被 `inspectAgentDeclaration` 拒绝：
   任务是用户这一次写的，包里带一个就是替他说话，而「你的任务」那一栏会显示成别人的话。
3. **project 层由宿主补，而且强制标成 project**——不管送进来的人管它叫什么。
   来源是**真实存在的**：Goals 的项目指引已经渲染好 `runtime_prompt_prefix`，
   所以这不是一个没人能发布的端口。项目没确认过指引时这一层是**空的**：
   指引视图在那种情况下仍会渲染一句「还没有确认过」，把它当指令传下去，
   等于把「这个项目什么都没说」变成一条它说过的话。
4. **冻结的那一份看得见。** 冻结记录里每条 prompt 带着自己的层，
   「这一轮的身份」按层展示，空的层也出现并说清为什么空——
   缺一节读起来像「这里没东西可看」，写一句「这个项目还没确认过指引」才是能动手的信息。
   **面上没有任何控件**（有硬断言守着）：能改就等于绕过冻结；要改是改角色，在下一轮之前。

### C12 Character 管理：接线有了，管理没有

**今天是什么。** 要分两半，不能一句「没实现」带过：

- **接线是真的。** `prologue-node.ts` 每次起 Run 都 `sdk.characters.create(...)` + `publish`，
  把 `characterRef` 挂到 Run 上。Prologue 的 Character 机制**在用**。
- **管理一点没有。** 那个 character 是**从冻结角色现造的一次性投影**
  （`id = role_id`、`version = role.version`、`tools = host_tools`），一 Run 一个，用完就扔。
  Prologue `character` 模块支持的东西——人设 CRUD、`active / disabled / tombstoned` 状态、
  skill / tool / mcp-server 绑定、按版本 CAS 写入、从目录安装、`BUILT_IN_CHARACTERS`——**一个都没接**。
- 用户这边：6 个角色**编译进包**，加不了、改不了、也不能绑自己的工具集。
  全仓 grep 不到任何 character / persona 的产品概念。

**要做什么。**

1. **角色变成数据，不再是常量。** 目录库里存用户自己的角色：名字、指令、工具子集、启用停用。
   内置 6 个作为**样例**随包发，不是「产品默认」——Prologue 自己的
   `config.character.includeBuiltIns` 默认关，理由一样。
2. **只能收紧，不能扩权。** 一个角色要的工具比 Manifest 声明的天花板宽，是**扩权尝试**，
   起跑前失败；不是「尽力给一部分」——给一半会让这一轮以为自己能做它做不到的事。
3. **改角色是按版本写入。** 两个人同时改同一个角色要冲突，不能互相覆盖；
   **运行中的 Run 握着冻住的那一份**，改角色不影响它。
4. 设置页跟 C6 模型供应商同一处，同一种样式。

### C13 TaskBoard / SubAgent / Plan / Agent 协同

四件事进度差得很远，必须分开说。

| | 今天是什么 |
| --- | --- |
| **TaskBoard** | **只有一个页签常量**（`ui.ts` 里 `{ face: "taskboard", label: "TaskBoard", icon: "grid" }`）。没有数据、没有投影、没有渲染 |
| **SubAgent** | **投影做了，Runtime 不支持**。`delegation.ts` 有 `projectSubagents`（验收 accepted / needs-work、「跑完 ≠ 验收通过」）+ 8 项测试；契约有 `AgentSubagentsCapability` 与 `subagent_workspaces: "required"`；roles 里有 coordinator / writers。**但**：`codingAgentManifest` 没声明 `subagents` 块，两个 adapter 的能力矩阵里 `subagents` 都是 `unsupported`（`emptyCapabilityMatrix()` 的默认，谁都没改），`horizontal/agent-host/` 里没有任何 subagents 端口实现 |
| **Plan** | **没有**。唯一沾边的是 `prologue.ts` 把执行档位映射成 Prologue 的 `mode: "plan" \| "build"`。没有计划对象、没有计划批准、没有 plan → execute 的转换 |
| **协同** | 同 SubAgent：`writers.ts` 的并行写入投影 + 真实 git 工作树（`git-worktrees.ts`）都在宿主侧做好了，但**没有 Runtime 能起子代理**，所以今天跑不起来 |

**要做什么，按依赖顺序。**

1. **Plan 先做。** 它不依赖子代理，而且是这类产品的标配交互：
   一轮先出**计划对象**（有序步骤，每步说清做完怎么判断它做对了），用户改/批，
   批过之后才转成执行。**计划不是提示词里的一段话**——它得是能引用、能比对、
   能说「实际做的和计划的不一样」的东西，否则「按计划执行」无从验证。
2. **SubAgent 接通。** 先给 adapter 实现 `subagents` 端口并如实申报能力，
   投影层已经在等它。**跑完 ≠ 验收通过**这条已经在投影里立住了，接通时不能退。
3. **TaskBoard 最后。** 它是前两者的**视图**：计划的步骤 + 子代理的认领与验收，
   摆成一张板。先做板子会做出一个没有内容的板子。

### C14 Prompt Cache：已接配置与 SDK，请求不等于命中

当前供应商配置已透传 `off / best-effort / required`，SDK 负责协议字段与缓存指纹。
`required` 只保证声明支持且本地前缀未失效时发送缓存请求，不保证厂商实际命中；
页面已改称“要求缓存支持”，实际命中只读供应商用量，未知不能报成零。
CLI 的缓存由对应 CLI 自己处理，Host 只投影其返回的用量。

**做完了什么。**

1. 模型供应商记录加了 `prompt_cache: "off" | "best-effort" | "required"`，落目录库（schema 18，
   旧库按需补列，可重复跑），透传到 `startAgentRun`。
   **关着就一个字段都不发**——`off` 的请求和「没有缓存这回事」时逐字节一样。
   没选过的供应商是关着的：升级不替用户要一个他没要过的东西。
2. **两种格式不一视同仁。** Anthropic 兼容线有 `cache_control` 断点，我们打得开；
   OpenAI 兼容线由对方自动做前缀缓存，没有可以由我们打开的字段。
   所以设置页在 OpenAI 格式上**根本不摆「要求缓存支持」这个选项**——
   摆一个永远选不了的选项，用户学不到任何东西；不摆它、加一句话，才说得清。
   保存时也再判一次（改格式会让一个已存着的档位重新过审），
   这是配置错误，要在用户还看着那个字段的时候说，不是等某次 Run 失败。
   「能不能打开断点」这件事**以 Prologue 自己的申报为准**，不是我们抄一份清单。
3. **还没做**：用量面板目前只显示命中的 token 数，说不清「这次没开缓存」和
   「开了但没命中」是两回事。

### C15 已确认的缺陷：protocol 名字对不上

`prologueModelConfiguration()` 把 `protocol: selection.provider.api_format` 直接传给
Prologue，值是 `"anthropic-messages"` / `"openai-chat-completions"`。
Prologue 按**精确字符串**查协议表，表里的键是 `"anthropic-compatible"` / `"openai-compatible"`
（`packages/sdk/src/model/plugin/registry.ts`），查不到就抛 `MODEL_PROTOCOL_UNSUPPORTED`。

**历史影响：修复前经此映射起的 Run 会在协议查表时失败；当前映射已修复并经过真 SDK 验证。**

**测试为什么没拦住它。** `tests/model-provider-store.test.ts` 里写着
`assert.equal(configuration?.protocol, "anthropic-messages")`——它断言的是**我们自己的名字**，
而代码传的也是我们自己的名字，于是两边一致、测试通过。
问题从来不在我们这一侧是否自洽，而在**对面认不认**。
所以修的时候断言要钉在 Prologue 的 `BUILT_IN_ADAPTERS` 上（SDK 导出了它，每项带 `protocol`），
让下一次改名直接把测试打红。

这正是「对着真实模型端到端跑一次」没做所以没被发现的东西——编译器对得上（两边都是 `string`），
单测对得上（测试用的是我们自己的端口，不是 Prologue 的表）。**已修。** `prologueProtocolFor()` 做一次显式翻译，`ModelApiFormat` 保持面向用户的拼法
（设置页里写着 `/v1/messages`），不跟着别人的内部键走。

断言钉在 **Prologue 自己导出的 `BUILT_IN_ADAPTERS`** 上而不是我们抄的一份清单：
`tests/model-protocol-mapping.test.ts` 逐项确认每个译出来的名字 Prologue 真的认、
我们自己的名字它真的不认、两套名字一一对应没有漏也没有多。
SDK 那边改名会直接把测试打红。

这件事是**跑出来的，不是读出来的**：拿真 SDK 起一个适配器注册表，
`anthropic-messages` 和 `openai-chat-completions` 都抛 `MODEL_PROTOCOL_UNSUPPORTED`，
`anthropic-compatible` / `openai-compatible` 才通。

## 7.1 C12 的早期设计依据（发布与消费归属由本轮 §0 覆盖）

在写实现之前先把它是什么想清楚，否则会做成「角色表加个增删改」。

### 它是对角色的**收紧**，不是角色的替代

Manifest 里的角色是**插件声明的可能性**，宿主已经拿它和 Runtime 的能力矩阵对过账；
Character 是**用户在那个范围里的选择**。所以：

**character ⊆ role**，永远。一份要的工具比它派生的角色宽，是**扩权尝试**，起跑前失败——
不是「尽力给一部分」。给一半会让这一轮以为自己能做它做不到的事，
而这正是 Prologue 的 character 模块用整段注释强调过的那条。

能放宽就意味着用户可以给自己一个 `run-command`，而底下那台 Runtime 根本不支持在审批下跑命令。
收紧永远安全，放宽永远不安全——这不对称，所以不做成一个对称的「编辑」。

### 档案上那句自我介绍**必须进提示**

Prologue 那边写得很直白：不进提示的话，「探索者」和「工人」的区别就只剩工具名单，
而档案上那句话是个死字段。

C11 刚把提示分了层，所以这件事有地方放：**Character 的自述进 `role` 层**，
排在插件角色自己那几段之后——它是在角色搭好的场景里说话。

反过来也成立：**没有 Character 也要能跑**。默认执行者**不带自述**——
它不是一份隐形档案，就是「这一次本来有什么」；凭空多一句自我介绍，
等于替用户决定了人格。

### 引用必须精确到版本

**没有「按名字取最新」。** 否则同一句话在档案改版之后会悄悄换一份人格，
而用户当初点头点的是那一版。冻结记录里存 `character_id` + `character_version`，
运行中的 Run 握着冻住的那一份，登记表之后怎么改都不影响它。

### 停用和删除是两件事

- **停用**是用户的选择，可以再打开；
- **删除**之后那个 id **不能被重用**——历史里的 Run 引用着它，
  重用会让一条旧记录指向一份它从没用过的档案。

所以删除是留墓碑，不是抹掉。

### 内置的是样例，不是产品默认

随包发几份示例角色，但**默认不启用**。Prologue 的 `config.character.includeBuiltIns`
默认关，理由一样：内置人格一旦默认开着，就成了产品替用户做的决定。

### 落在哪

和模型供应商同一处——目录库（安装级），不是项目库。
Character 是「我习惯怎么干活」，跟着人走而不是跟着某一个项目走。
将来真出现按项目定制的需要，那是加一列作用域，不是现在先猜一个。
