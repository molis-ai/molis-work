# Runtime 接入服务

## 背景与目标

Molis Work 本体安装现在只写入 `~/.molis-work`。安装后还缺少一条统一、安全的 Runtime 接入链路，导致 Codex、Claude Code 等 Runtime 只能靠人工修改 Skill 和 MCP 配置，而且旧配置可能仍指向源码目录或旧项目 DB。

本 Work Item 建立一个可复用的 Runtime 接入领域服务。UI、MCP 和 CLI 后续都只能调用这套服务，不各自直接改配置。

## 当前行为与问题证据

- `src/install/runtime-config.ts` 只处理单个文本文件，没有 Runtime 探测、适配器、Skill、移除和多资源事务。
- 当前机器的 Codex 配置仍包含旧的 Molis Work MCP 入口和 `MOLIS_WORK_DATABASE`，说明旧流程不能形成干净的安装后接入。
- `src/mcp/server.ts` 只识别显式的 `MOLIS_WORK_WORK_CONTEXT_ID`；Codex 已提供 `CODEX_THREAD_ID`，Claude Code 安装包也包含 Session ID 环境信号，但 Molis Work 尚未把这些宿主信号转换为稳定 Session 身份。

## 范围

- 建立 Runtime adapter registry，首批支持 Codex 与 Claude Code。
- 只读探测 Runtime 可执行文件、配置、Skill 和 Molis Work 当前安装。
- 生成不泄露用户原配置的精确公开预览；预览包含目标路径、Molis Work 字段、Skill 链接、备份位置、替代路径和重启说明。
- 只有 Runtime ID、plan ID 和明确决定完全匹配时才应用。
- 把 MCP 配置与 Skill 链接作为一个事务应用；写后启动 Molis Work MCP 做验证，失败恢复原配置和原 Skill 状态。
- 保存不含原配置内容的 Molis Work ownership receipt；移除时只删除 receipt 证明由 Molis Work 写入且仍未被用户改写的部分。
- 支持重复接入、配置冲突、预览后配置变化、失败回滚和重复移除。
- MCP Runtime host 自动采用当前 Runtime 的可信 Session 环境 ID；新 Session 只用当前工作目录和同 Runtime 历史做非权威候选建议，仍需用户确认。
- 删除被新服务替代的单文件 `runtime-config` 旧逻辑。

## 非目标

- 不在安装时自动修改任何 Runtime 配置。
- 不绑定项目，不把目录、Git 或项目名当作 Session 身份。
- 不支持任意未知 Runtime 的自动配置写入；未知 Runtime 后续使用同一 adapter 接口扩展，当前仍可按公开启动信息手工接入。
- 本 Work Item 不增加 Web 设置页面或写入型 HTTP API。

## 用户与调用场景

1. 设置入口只读列出 Codex / Claude Code 是“未接入、已接入、需要修复、存在冲突”中的哪一种。
2. 用户选择接入后先看到具体要改哪个配置、增加哪个 Molis Work MCP、安装哪个 Skill、备份放哪里以及需要重启什么。
3. 用户确认后一次完成；验证失败时页面收到“验证失败，已恢复”，原配置字节和 Skill 状态不变。
4. 用户选择移除时先看到反向预览；确认后只撤销 Molis Work 自己写入且仍匹配 receipt 的内容。
5. 新 Codex / Claude Code Session 调用 Skill 时，MCP 使用宿主 Session ID 查询绑定；没有绑定时最多建议项目并让当前 Runtime 询问用户。

## 方案与关键决策

- `RuntimeIntegrationService` 持有短期 plan；公开 plan 不包含整份配置或 secret，确认必须在同一服务进程中使用 plan ID。
- adapter 负责 Runtime 特有的探测、配置解析和 Molis Work entry 生成；事务、备份、receipt、幂等和回滚由统一服务负责。
- Codex 只替换 `[mcp_servers.molis-work]` family，保留其他 TOML 字节。
- Claude Code 只替换顶层 `mcpServers` 对象值，并保留其他顶层 JSON 字节；不通过项目级 `.mcp.json` 修改用户项目。
- Skill 使用 Runtime 用户级 Skill 目录中的符号链接，目标是当前 `~/.molis-work` release 内的 Skill；未知文件或非 Molis Work 链接一律视为冲突。
- receipt 只保存路径、hash、Molis Work entry 指纹和 Skill link，不保存用户原配置内容。
- 默认验证通过实际启动 `~/.molis-work/bin/molis-work-mcp` 并完成 MCP initialize / tools-list；测试可以注入确定性的验证器。

## 输入、输出与依赖

- 输入：Molis Work home、用户 home、PATH、Runtime ID、用户对公开 plan 的决定。
- 输出：Runtime 探测状态、公开 change plan、接入/移除结果、备份与 receipt 路径。
- 依赖：已完成的自包含安装 manifest、MCP launcher 和 `goal-advance` Skill。

## 文件与模块边界

- 新增 `src/install/runtime-integration.ts`：adapter、统一服务、事务、receipt 和验证。
- 修改 `src/mcp/server.ts`：可信 Runtime Session 环境信号与非权威工作目录线索。
- 新增 `tests/runtime-integration.test.ts`，删除被替代的 `tests/runtime-config.test.ts`。
- 删除 `src/install/runtime-config.ts`。
- 更新 `package.json`、README / PRODUCT 协议说明。

## 验收标准

- Codex 与 Claude Code 均能探测并生成不含用户配置全文的精确接入预览。
- 未确认、确认不匹配、未知 Skill 冲突、未知 MCP entry 冲突均不改任何字节。
- 首次接入同时写入 MCP 与 Skill，其他配置保持不变并创建备份与 receipt。
- 重复接入返回已接入，不重复写入。
- 验证失败恢复原配置字节和原 Skill 状态。
- receipt 存在且 Molis Work entry 未被改写时可安全移除；用户改写后拒绝移除。
- Codex `CODEX_THREAD_ID` 与 Claude Code Session 环境变量可成为稳定入口 ID；目录只用于建议，不会自动绑定。
- `pnpm typecheck`、定向测试、完整 `pnpm test` 通过。

## 验证命令

```bash
pnpm typecheck
pnpm build
node --import tsx --test tests/runtime-integration.test.ts tests/mcp.test.ts tests/install.test.ts
pnpm test
```

## 假设与开放问题

- 当前优先支持本机实际可探测的 Codex 和 Claude Code；adapter registry 保留增加 Cursor 等 Runtime 的唯一扩展点。
- Runtime 必须把它自己的 Session 环境变量传给 MCP 子进程。若某版本不再传递，探测会显示该 Runtime 需要修复，而不会退化为目录身份。
