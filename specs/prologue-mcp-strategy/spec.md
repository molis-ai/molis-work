# Prologue MCP 策略：服务器信任、发现与生命周期

状态：需求已整理（2026-10-21），待评审后实施。独立需求；连接、协议、调用与审查沿用 [plugin-platform-v2](../plugin-platform-v2/spec.md) 和 Prologue `mcp/` 合同，本 spec 只补“哪些服务器可信、发现什么、坏了怎么办、怎么让人看懂”。

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

### 3.1 服务器信任：三档，只能加严

| 档 | 用途 | 允许 |
| --- | --- | --- |
| `trusted` | 公司内网、已审服务 | 仍走同一道门；注解只加严；只读面 P1 评审后才可能开放 |
| `standard` | 常规第三方 | 默认档；工具可按注解收窄；写入必问 |
| `restricted` | 临时/未知来源 | 只读、只允许显式点名的工具；不自动发现进目录 |

- 信任档只影响“可发现/可自动进入哪一面”，**不放宽**副作用链、审批和密钥规则。
- 服务器指令（server instructions）按“外部数据”进上下文，不进系统指令；要人能看见来源。
- 连接、启用、信任三件事分开：连上不等于信任，信任不等于自动放行。

### 3.2 发现：工具、资源、提示、模板、补全

- 握手快照保留 `tools / resources / prompts / resourceTemplates / completions`；三个控制面分开报。
- 快照带 TTL / ETag；`refreshMcp` 产出 **发现差异**（新增/删除/形状变化），不静默替换。
- 工具进同一本 Tool 目录；资源进 Source/Context 的引用入口；提示进“命令/方法”入口。
- 资源模板按参数读取；补全只用于参数建议，不自动执行。

### 3.3 工具注解：用来加严和分层

- 读取 MCP `readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`。
- **P0 只用来加严/提示，不改变 `effectKind`。** 把 `readOnly` 映射成 `safe-read`、让只读 MCP 工具进只读面，是安全边界变更，P1 单独评审；没有批准就不做。
- **destructive / openWorld 一律 `mutate-external` 并必问**，注解不能把它们降级。
- `idempotentHint: true` 也只表示“对方这么说”，未知结果仍不自动重放；`idempotency` 仍以显式声明为准。
- 注解冲突时取更严的一档；不认识的注解忽略，不当成放行。

### 3.4 健康、退避与配额

- 连接后按 `config.mcp.health` 周期探活（默认关，App 打开）；失败进入 `degraded`，连续失败退避，超过阈值标 `unavailable`。
- 只探活，不自动调用工具；不自动重连到新地址；重连仍要过配置版本与身份复核。
- 每服务器配额：并发调用、每分钟调用、单次结果大小、工具数上限；超限明确失败，不排队到无限。
- 断开/撤权/换账号立即封新外发；在途请求按原 Effect 链进对账，不自动重试。

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
- 人能回答“这台服务器现在能干什么、为什么不可用、上次变是什么时候”。

## 4. Prologue 合同

- `McpConnectionInput` 增加 `trust: "trusted" | "standard" | "restricted"`（默认 `standard`）。
- `McpServerInfo`：`name` / `version` / `instructions?` / `capabilities`；instructions 作为外部数据，不进系统指令。
- `McpToolSpec` 增加 `annotations?: { readOnly?, destructive?, idempotent?, openWorld? }`；只用于加严/分层。
- `McpSnapshot` 增加 `resourceTemplates`、`completions`（可选）；`McpHealth` 增加 `degraded`。
- `config.mcp`：`health`（探活间隔/退避/阈值）、`quotas`（并发/每分钟/结果大小/工具数）、`trustDefaults`。
- `refreshMcp` 返回 `McpDiscoveryDiff`；新增 `mcp-discovery-changed` 事件。
- `mcp.prompts.invoke`：提示作为命令/方法调用；`mcp.resources.read` 已有，补模板与订阅。
- 公开 Node OAuth 适配器与凭据引用合同；不新增第二套认证。
- 错误码：`MCP_TRUST_INSUFFICIENT`、`MCP_QUOTA_EXCEEDED`、`MCP_DEGRADED`、`MCP_DISCOVERY_CHANGED`。

## 5. Molis Work 接入

| 位置 | 改什么 | 不做什么 |
| --- | --- | --- |
| `horizontal/agent-host` | 信任档、注解加严、健康/配额投影、prompts/resources 入口；只读面按 P1 评审结论 | 不绕过现有审查与 Effect 链 |
| `apps/local-host` | 项目 MCP 设置加信任/配额；账号切换；只读路径；OAuth | 不在请求体里读身份/密钥 |
| `apps/workbench` | 服务器健康、工具/提示/资源列表、发现差异、最近失败；不展示明文 | 不做第二套 MCP 连接 |
| `packages/contracts` | `AgentMcpServerView` 加 trust/health/quotas/annotations；事件投影 | 不复制 SDK 类型 |
| `packages/storage` | 配置/用量/健康事实沿用现有表；不另建 MCP 账 | 不存 token 明文 |

Molis 的 [Agent Host](../../docs/horizontal/agent-host.md) 现在明确“当前仅 workspace-write 路径开放外部工具”；本 spec 的目标是先把注解、信任、健康、发现和配额做清楚；只读 MCP 工具能否进只读路径，P1 单独做安全评审，通过后再开。写入路径的审查保持原样。

## 6. 分期

| 期 | 内容 | 完成时能证明 |
| --- | --- | --- |
| M0 | 信任档、annotations（只加严）、健康/配额、发现差异 | 服务器坏了能说清；注解不放宽边界 |
| M1 | prompts/resources 一等入口、模板/补全、OAuth 公开 | 提示可点名、资源可引用；认证走统一合同 |
| M2 | 订阅/进度/日志、按服务器搜索、用量评测 | 长任务能看到进展；服务器多时找得到工具 |

## 7. 验收标准

| 编号 | 可观察标准 | 证明方式 |
| --- | --- | --- |
| MCPX-01 | 三档信任只影响发现/分层，不放宽审批、密钥或副作用链 | Prologue 单测 + 策略测试 |
| MCPX-02 | `restricted` 服务器不自动进目录；只读工具也要显式点名 | Prologue 单测 |
| MCPX-03 | P0 注解只加严；MCP 工具不因 readOnly 自动降成 safe-read；destructive/openWorld 必问；冲突取更严 | Prologue 单测 + Molis 审查测试 |
| MCPX-04 | 未知结果不自动重试；`idempotentHint` 不当作可重放 | Prologue 单测 |
| MCPX-05 | 发现差异（新增/删除/形状变化）可查；不静默替换 | Prologue live + Molis 投影 |
| MCPX-06 | 健康探活/退避/配额生效；超限明确失败，不无限排队 | Prologue 单测 |
| MCPX-07 | 断开/撤权/换账号后零新外发；在途进对账 | Prologue live |
| MCPX-08 | prompts 可点名/作为方法；resources 可引用；模板/补全按能力协商 | Prologue 单测 + Molis 测试 |
| MCPX-09 | sampling/roots 不支持时明确报错，不偷偷换通道 | Prologue 单测 |
| MCPX-10 | OAuth 公开适配器只经 Host 凭据口；配置/日志/快照无明文 | 真实 Node Host + 安全测试 |
| MCPX-11 | 每服务器健康/延迟/失败/工具数/配额可看；能回答为什么不可用 | Molis 设置页测试 |
| MCPX-12 | P1 若批准只读映射，Molis 只读路径能调用 readOnly MCP 工具；写入仍走 workspace-write + Review；未批准时保持现状 | Molis live + 安全评审 |
| MCPX-13 | MCP 工具按服务器分组搜索；find-tools 不返回未授权服务器 | Molis 测试 |
| MCPX-14 | 账号切换/连接版本变化不会把旧待批请求送到新地址 | Molis `prologue-mcp` 测试 |
| MCPX-15 | `[人工]` 在真实项目里接一个只读 MCP 服务器，完成一次查询；断开后能说清原因 | 人工 |

## 8. 非目标与风险

- 不做 MCP 服务器市场/自动安装；安装与配置仍归 App。
- 不做 sampling/roots 的伪支持；不支持就明确报。
- 不用注解放宽硬边界；注解只用于加严/分层。
- 不自动重连到新地址、不自动重放外部副作用。
- 风险：服务器描述/资源里的提示注入；一律按外部数据，进上下文前过 screening。
- 风险：健康探活本身产生流量；默认关，App 打开，且有界。

### 8.1 复查记录（2026-10-21）

- 现有实现已经给模型 `list-mcp-resources` / `read-mcp-resource`，并且长资料有分页；原稿写成“resources 没有模型入口”不准确，已改正。本轮只补 prompts、模板、补全、订阅。
- `readMcpPrompt` / `readMcpResource` 仍是 App 侧入口；本 spec 不重复实现，只补模型可点名的提示面。
- MCP 工具当前一律 `mutate-external`；P0 的 annotations 只加严，不把 readOnly 自动降成 `safe-read`。只读面是 P1 安全评审项。
- 与 Skill/Tool 的边界：MCP prompts 不是 Skill；MCP tools 仍进 Tool 目录、走同一道门。`find-tools` / `find-skills` 不替 MCP 另开搜索。

## 9. 参考

- [plugin-platform-v2](../plugin-platform-v2/spec.md)：插件、MCP 与宿主装配。
- [prologue-adoption](../prologue-adoption/spec.md)：Molis 的 MCP 采用与剩余边界。
- [Agent Host](../../docs/horizontal/agent-host.md)：项目 MCP 配置与 partial 能力。
- [MCP 规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [OpenHands MCP](https://github.com/OpenHands/OpenHands/pull/7637)
