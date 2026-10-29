# Prologue MCP 策略：服务器信任、发现与生命周期

状态：需求已整理（2026-10-21；2026-10-27 用户确定三种权限选项、本次工作/持续授权，以及同账号、地址和有效授权下短暂断线自动恢复、未知写入先核对），其余策略仍待逐项评审，尚未实施本次决定。独立需求；连接、协议、调用与审查沿用 [plugin-platform-v2](../plugin-platform-v2/spec.md) 和 Prologue `mcp/` 合同，本 spec 只补“哪些服务器可信、发现什么、坏了怎么办、怎么让人看懂”。

同系列：[Skill](../prologue-skill-strategy/spec.md) · [Tool](../prologue-tool-strategy/spec.md) · [Context](../prologue-context-strategy/spec.md)。

## 1. 问题与现状

Prologue `mcp/` 已有：stdio / http / in-process 三种传输、协议大版本握手、`connected/disconnected/unavailable/not-reattached` 四态、工具/资源/提示三个控制面分开报、形状指纹与漂移拒绝、连接世代与撤权、`refreshMcp` 原子替换、resources/prompts 读取、elicitation 进同一本等待账、OAuth Node 实现（未公开）。Molis 的 `prologue-mcp` 适配器按项目保存配置、给每个配置版本独立连接身份、处理账号变化、忙碌/错误、主动关闭。

但现在的 MCP 仍是“工具源”，不是“外部能力面”：

1. **所有服务器一个信任档。** 没有“这是公司内网、这是个人装的开源服务、这是临时试用”的区别；工具描述、资源正文、服务器指令都只能当同一类外部内容。
2. **所有 MCP 工具都是 `mutate-external`。** 即使对方声明只读，也要走最重的审批；Molis 因此只在 workspace-write 路径开放外部工具。只读 MCP 工具本可以进只读面。
3. **resources 有模型入口，prompts 还没有。** `list-mcp-resources` / `read-mcp-resource` 已经能列出、读取并分页长资料；但 prompts 主要仍是 App 入口，也没有 resource templates、completions、订阅或提示命令。
4. **没有健康与配额。** 连接靠人手动连；没有周期探活、退避、限流、每服务器工具上限；一次坏服务可以拖慢一轮。
5. **搜索按全局。** `mcp:server/tool` 只能整串匹配；没有按服务器过滤、分组、分页；服务器一多，`find-tools` 里全是噪音。
6. **认证仍偏内部。** OAuth 只在 Node 的 plugin 里，未公开；token 刷新、账号切换、凭据引用没有统一公开合同。
7. **没有可观测。** 看不到发现差异、调用延迟、错误率、工具形状变化；出了事只能看日志。

## 2. 市面做法

| 路线 | 代表 | 值得借 | 不照搬 |
| --- | --- | --- | --- |
| 标准三面 | [MCP 规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | tools / resources / prompts 分开；能力协商；elicitation | 把所有能力都塞进工具 |
| 客户端接入 | [Claude Code MCP](https://code.claude.com/docs/en/mcp)、[OpenHands MCP](https://github.com/OpenHands/OpenHands/pull/7637) | 服务器配置、认证、工具发现、按项目启用 | 自动信任所有服务器 |
| 工具注解 | MCP tool annotations | readOnly / destructive / idempotent / openWorld 影响审批 | 用注解绕过审查 |
| 生命周期 | MCP lifecycle / health | 握手、能力、关闭、重连；失败可解释 | 静默重连/自动重放 |
| 提示与资源 | MCP prompts / resource templates | 提示作为命令、资源作为上下文、模板补全 | 把资源正文当指令 |

### 2.1 来源与取舍

下表只列直接影响本 spec 决定的来源；不是完整 MCP 客户端调研。协议版本按 [MCP 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) 的页面引用，实施前按目标版本复核。

| 来源 | 类型 | 它做了什么 | 采纳 / 拒绝 | 影响 |
| --- | --- | --- | --- | --- |
| [MCP 规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | 官方规范 | tools/resources/prompts、能力协商、elicitation、生命周期 | 采纳三面与生命周期；继续不支持 sampling/roots | 发现、健康、提示/资源 |
| [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) | 官方规范 | readOnly/destructive/idempotent/openWorld | 采纳只加严；P0 不降 effectKind | 注解、审批 |
| [Claude Code MCP](https://code.claude.com/docs/en/mcp) | 官方文档 | 项目配置、认证、工具发现 | 采纳项目级与信任/健康；不自动信任所有服务器 | 信任档、健康、认证 |
| [OpenHands MCP](https://github.com/OpenHands/OpenHands/pull/7637) | 第三方实现 | MCP 客户端接入与执行 | 采纳连接生命周期；不照搬执行器 | 生命周期、错误 |

## 3. 优化策略

### 3.1 服务器信任与用户权限选项

用户面向的三种权限选项、授权期限和连续执行行为统一按 [主动助理 §7.1](../proactive-assistant/spec.md#71-行动范围与授权)：只读协助、修改前确认、授权内自动执行。连续工作推荐第三种，AI 按任务提出范围，用户可调整；默认仅授予本次工作，长期委托可明确保存持续授权。发送、发布、删除等已明确包括在有效自动执行授权内时，不逐次重复确认。MCP 不另设一套与此冲突的“外部操作必问”规则。

以下服务器信任档仍为待评审的技术提案，区分来源与发现限制，不是另一组要求用户必选的权限档，也不自动产生操作授权。

| 档 | 用途 | 允许 |
| --- | --- | --- |
| `trusted` | 公司内网、已审服务 | 仍走同一道门；注解只加严；能否执行由实际能力与有效授权决定 |
| `standard` | 常规第三方 | 默认来源档；工具可按注解收窄，操作沿用户权限选项与有效授予处理 |
| `restricted` | 临时/未知来源 | 只读、只允许显式点名的工具；不自动发现进目录 |

- 信任档只影响“可发现/可自动进入哪一面”，**不放宽**副作用链、审批和密钥规则。
- 服务器指令（server instructions）按“外部数据”进上下文，不进系统指令；要人能看见来源。
- 连接、启用、信任三件事分开：连上不等于信任，信任不等于自动放行。
- 已有只读或逐次确认选择不被推荐、重连或升级覆盖；切模式、撤权、换账号及结束委托按同一授权 owner 生效。旧目录、工具说明和待批请求不能绕过新限制，跨轮/重启也不把本次工作授权扩大成持续授权。

### 3.2 发现：工具、资源、提示、模板、补全

- 握手快照保留 `tools / resources / prompts / resourceTemplates / completions`；三个控制面分开报。
- 快照带 TTL / ETag；`refreshMcp` 产出 **发现差异**（新增/删除/形状变化），不静默替换。
- 工具进同一本 Tool 目录；资源进 Source/Context 的引用入口；提示进“命令/方法”入口。
- 资源模板按参数读取；补全只用于参数建议，不自动执行。

### 3.3 工具注解：用来加严和分层

- 读取 MCP `readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`。
- **注解只用来加严/提示，不独自降低 `effectKind` 或授予权限。** 只读路径只开放有可信能力依据、不修改业务内容或产生发送/发布等对外业务效果且在读取授权范围内的工具；不能仅凭 `readOnlyHint`、名字或服务器描述认定只读，性质不明确的仍按可能有副作用处理。实现时同步合同与安全不变量，用真实拒绝测试证明边界；产品权限选择已定，当前代码尚未因此改变。
- **destructive / openWorld 不能靠注解降级放行**。由实际效果、用户权限方式和有效操作授予决定直接执行、等待确认或拒绝；不再把这些标记等同于每次弹窗。自动执行仍需明确覆盖目标和相应操作，不能以服务器受信、登录成功或模型判断代替。
- `idempotentHint: true` 也只表示“对方这么说”，未知结果仍不自动重放；`idempotency` 仍以显式声明为准。
- 注解冲突时取更严的一档；不认识的注解忽略，不当成放行。

### 3.4 自动恢复、健康与配额

2026-10-27 用户已定：账号、服务地址和授权不变且仍有效时，短暂断线默认自动重连，恢复后接续原工作；反复失败、需要重新登录或权限变化时再提醒用户。结果不明的写操作先核对，避免重复执行。完整连接恢复行为沿 [服务接入 §7](../assistant-service-connections/spec.md#7-失败与恢复规则)，复用连接 owner 与任务接续机制。

- 当前工作遇到短暂网络/连接故障时，自动检查并重连原连接，不要求用户先开启周期探活或点击“检查连接”。每次重连复核账号、地址、连接配置与当前授权，不静默换身份、地址或来源；用户主动断开/停用、撤权或结束相关委托时停止对应自动恢复，不当作网络故障再连。
- 失败后退避并遵守服务限流、已有时间/用量及重试边界；不无限循环、不为同一连接启动多份恢复。反复失败后保留结果和等待状态，只暂停依赖部分，给出原因和可操作的恢复入口；具体间隔与阈值在实现中结合现有策略确定，不交给普通用户逐项配置。
- 短暂失败和重连过程在原工作中显示，不逐次弹窗/通知；反复失败、需本人登录或权限变化时合并必要提醒，遵守通知设置，同一问题未变不反复催促。恢复成功更新原状态并继续，无须再确认一次“是否接续”。
- 重连成功后刷新实际能力，核对原工作最新要求与有效权限再继续。连接恢复不表示前次业务操作已成功；未知写入先查原请求或目标状态，不能仅凭重连成功或 `idempotentHint` 重发，仍无依据时保留未知并只等待所需决定；已完成效果不重做。
- `config.mcp.health` 的常驻周期探活仍是独立技术配置，默认关、由 App 按需要装配；它只检查健康，不调用业务工具。关闭周期探活不关闭上述工作中的自动恢复。
- 每服务器配额约束并发调用、每分钟调用、单次结果大小和工具数；超限明确显示，不排队到无限。主动停用/撤权/换账号后阻止不再获准的新外发，在途效果沿原执行链核对，不盲目重试。

### 3.5 提示与资源：一等入口

- MCP prompt 可作为：人点名的命令、模型可读的方法、Skill 的引用；执行前仍过同一道门。
- MCP resource 作为上下文材料：带 `mcp` 来源、URI、服务器、快照版本；正文是不可信数据。
- 现有 `list-mcp-resources` / `read-mcp-resource` 与长资料分页保留；本 spec 只补 resource templates、completions、订阅和 prompts 的模型入口，不重做已有读取链。
- MCP prompts 不进入 SkillRegistry；它们是 MCP 自己的调用面（`mcp.prompts.invoke` 或 App 包装），不能冒充 Skill、也不能绕过同一道门。
- 资源模板、订阅、进度、日志、completions 按能力协商；不支持就明确报 `MCP_CAPABILITY_UNSUPPORTED`。
- sampling / roots 继续明确不支持；不假装支持，也不偷偷用别的通道。

### 3.6 认证

- 公开 Node OAuth 适配器（现在只在 plugin 里）；token 只经 Host 凭据口，配置里只有引用。
- 账号切换/失效要能让连接失效，不能拿旧 token 打新地址。
- 每服务器凭据作用域独立；不在日志、错误、快照里出现明文。

### 3.7 可观测

- 每服务器：连接状态、最近成功、最近失败、发现差异、工具数、调用数、失败率、P95 延迟、配额命中。
- 每次工具形状变化记 `mcp-discovery-changed`；不记 schema 正文。
- 人能回答“这台服务器现在能干什么、为什么不可用、是否正在自动恢复、哪项工作受影响、什么时候需要我操作”；重复失败合并，恢复后状态与实际接续一致。

## 4. Prologue 合同

- `McpConnectionInput` 增加 `trust: "trusted" | "standard" | "restricted"`（默认 `standard`）。
- `McpServerInfo`：`name` / `version` / `instructions?` / `capabilities`；instructions 作为外部数据，不进系统指令。
- `McpToolSpec` 增加 `annotations?: { readOnly?, destructive?, idempotent?, openWorld? }`；只用于加严/分层。
- `McpSnapshot` 增加 `resourceTemplates`、`completions`（可选）；`McpHealth` 增加 `degraded`。
- `config.mcp`：`health`（探活间隔/退避/阈值）、`quotas`（并发/每分钟/结果大小/工具数）、`trustDefaults`。
- `refreshMcp` 返回 `McpDiscoveryDiff`；新增 `mcp-discovery-changed` 事件。
- `mcp.prompts.invoke`：提示作为命令/方法调用；`mcp.resources.read` 已有，补模板与订阅。
- 公开 Node OAuth 适配器与凭据引用合同；不新增第二套认证。
- 三种用户权限方式映射到平台已有授权与 Effect 决策，保留本次工作/持续授权的真实范围与当前有效性，不新增 MCP 专属授权账；技术字段在实施方案中与现有合同对齐。
- 错误码：`MCP_TRUST_INSUFFICIENT`、`MCP_QUOTA_EXCEEDED`、`MCP_DEGRADED`、`MCP_DISCOVERY_CHANGED`。

## 5. Molis Work 接入

| 位置 | 改什么 | 不做什么 |
| --- | --- | --- |
| `horizontal/agent-host` | 信任与注解、健康/配额、prompts/resources；可信只读能力与三种权限选项接入同一授权/Effect 决策 | 不以注解或模型声明代替实际授权 |
| `apps/local-host` | 复用授权 owner 的本次工作/持续范围；账号切换、撤权、只读路径与 OAuth | 不在请求体里读身份/密钥，不建 MCP 授权副本 |
| `apps/workbench` | 三种权限选项与可调整的范围，查看/收窄/撤销及真实运行状态；健康、能力列表、发现差异和失败 | 不做第二套 MCP 连接，不强迫逐个配置工具 |
| `packages/contracts` | `AgentMcpServerView` 加 trust/health/quotas/annotations；事件投影 | 不复制 SDK 类型 |
| `packages/storage` | 配置/用量/健康事实沿用现有表；不另建 MCP 账 | 不存 token 明文 |

2026-10-21 整理时，[Agent Host](../../docs/horizontal/agent-host.md)记录“当前仅 workspace-write 路径开放外部工具”。2026-10-27 已确定的目标是让可信只读能力与三种用户权限选项真实生效：已授权读取直接进行，其他操作按有效授予和所选方式决定，不能用现有实现的一律外部写入分类代替产品规则。实现仍须复用同一调用身份、授权与 Effect 链，同步适用安全不变量和拒绝测试；本次只改需求，不宣称入口已经接通。

## 6. 分期

| 期 | 内容 | 完成时能证明 |
| --- | --- | --- |
| M0 | 用户权限选项与本次工作/持续授权接线、可信只读能力、信任档与 annotations（只加严）、自动恢复与健康/配额、发现差异 | 授权内连续工作不重复打断；短暂断线自动接续、未知写入不重放；限制与撤权有效，注解不授予权限 |
| M1 | prompts/resources 一等入口、模板/补全、OAuth 公开 | 提示可点名、资源可引用；认证走统一合同 |
| M2 | 订阅/进度/日志、按服务器搜索、用量评测 | 长任务能看到进展；服务器多时找得到工具 |

## 7. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| MCPX-01 | 三档信任只影响发现/分层，不放宽审批、密钥或副作用链 | Prologue 单测 + 策略测试 |
| MCPX-02 | `restricted` 服务器不自动进目录；只读工具也要显式点名 | Prologue 单测 |
| MCPX-03 | 注解只加严、不产生授权；伪造 readOnly 或来源信任不能让有副作用/性质未知工具进入只读路径；destructive/openWorld 仍核对实际操作授权，不能被注解或模型声明放行 | Prologue 单测 + Molis 拒绝测试 |
| MCPX-04 | 未知结果不自动重试；`idempotentHint` 不当作可重放 | Prologue 单测 |
| MCPX-05 | 发现差异（新增/删除/形状变化）可查；不静默替换 | Prologue live + Molis 投影 |
| MCPX-06 | 周期探活与工作中自动恢复分别生效，关闭周期探活不阻止短暂故障恢复；退避/限流/重试边界有效，无无限排队或重复恢复；反复失败/需登录/权限变化有合并提醒，其余过程不重复打断 | Prologue 单测 + Molis 状态与通知测试 |
| MCPX-07 | 用户主动断开/停用、撤权、换账号或结束相关委托后，自动恢复不能产生不再获准的新外发；在途结果核对，迟到成功不复活旧工作 | Prologue live + Molis 授权交错测试 |
| MCPX-08 | prompts 可点名/作为方法；resources 可引用；模板/补全按能力协商 | Prologue 单测 + Molis 测试 |
| MCPX-09 | sampling/roots 不支持时明确报错，不偷偷换通道 | Prologue 单测 |
| MCPX-10 | OAuth 公开适配器只经 Host 凭据口；配置/日志/快照无明文 | 真实 Node Host + 安全测试 |
| MCPX-11 | 每服务器健康/延迟/失败/工具数/配额可看；能回答为什么不可用 | Molis 设置页测试 |
| MCPX-12 | Molis 只读路径能真实调用具有可信只读依据且已获准的 MCP 查询；只读模式拒绝副作用，修改前确认等待用户，授权内自动执行只放行明确覆盖的操作；三者仍走同一 Effect 链 | Molis live + 安全拒绝测试 |
| MCPX-13 | MCP 工具按服务器分组搜索；find-tools 不返回未授权服务器 | Molis 测试 |
| MCPX-14 | 账号切换/连接版本变化不会把旧待批请求送到新地址 | Molis `prologue-mcp` 测试 |
| MCPX-15 | `[人工]` 在真实项目里接一个只读 MCP 服务器，完成一次查询；断开后能说清原因 | 人工 |
| MCPX-16 | `[人工]` 用真实 MCP 工作验证三种权限选项；AI 按任务提出范围，用户可调整且不必逐个配置工具；授权内包含的修改和外部操作连续完成、不逐次重复确认，未包含的目标或效果明确阻塞 | 真实任务 + 用户入口验证 |
| MCPX-17 | 本次工作授权跨轮/等待/重启按原范围复用，结束后不带到新工作；持续授权仅在用户明确保存后有效；改回只读/确认、收窄、撤权或换账号后，旧目录及请求不能继续放行，新限制即时生效且未知结果不重放 | Molis 授权、并发与恢复测试 |
| MCPX-18 | 同账号/地址和有效授权的真实连接短暂中断后自动重连、刷新能力并按最新要求接续；账号/地址/权限改变时不静默替换；覆盖写入已生效但回执丢失，先核对且不重复效果，无法确认时保留未知，只阻塞依赖部分 | 真实 MCP 故障注入 + 业务终态与接续验证 |

## 8. 非目标与风险

- 不做 MCP 服务器市场/自动安装；安装与配置仍归 App。
- 不做 sampling/roots 的伪支持；不支持就明确报。
- 不用注解放宽硬边界；注解只用于加严/分层。
- 不自动重连到新地址、不自动重放外部副作用。
- 风险：服务器描述/资源里的提示注入；一律按外部数据，进上下文前过 screening。
- 风险：健康探活与恢复本身产生流量；常驻探活默认关，工作中恢复有界退避、遵守限流及有效授权，不无限重连。

### 8.1 复查记录（2026-10-21）

- 现有实现已经给模型 `list-mcp-resources` / `read-mcp-resource`，并且长资料有分页；原稿写成“resources 没有模型入口”不准确，已改正。本轮只补 prompts、模板、补全、订阅。
- `readMcpPrompt` / `readMcpResource` 仍是 App 侧入口；本 spec 不重复实现，只补模型可点名的提示面。
- 当时 MCP 工具一律 `mutate-external`，草案将只读映射另列 P1。2026-10-27 已确认 §3.1/3.3 的三种权限方式及可信只读方向，实施仍须验证实际授权与拒绝；不能仅凭注解降级的边界保留。
- 与 Skill/Tool 的边界：MCP prompts 不是 Skill；MCP tools 仍进 Tool 目录、走同一道门。`find-tools` / `find-skills` 不替 MCP 另开搜索。

## 9. 参考

- [plugin-platform-v2](../plugin-platform-v2/spec.md)：插件、MCP 与宿主装配。
- [prologue-adoption](../prologue-adoption/spec.md)：Molis 的 MCP 采用与剩余边界。
- [Agent Host](../../docs/horizontal/agent-host.md)：项目 MCP 配置与 partial 能力。
- [MCP 规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [OpenHands MCP](https://github.com/OpenHands/OpenHands/pull/7637)
