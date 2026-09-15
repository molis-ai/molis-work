# Runtime 接入验证超时稳定性

## 背景与目标

Runtime 接入在写入配置和 Skill 后，会真实启动 `molis-work-mcp`，依次完成 MCP `initialize` 与 `tools/list`，验证成功后才保存接入结果。当前整个握手只有固定 3 秒，完整测试并行负载下曾在 3.03 秒被误判失败并回滚；同一场景单独运行约 0.34 秒通过，完整套件复跑也通过，说明超时余量不足而不是稳定的协议错误。

目标是给冷启动和机器负载保留合理余量，避免有效接入被误判回滚，同时继续保证真正无响应的 MCP 会在有限时间内失败。

## 当前行为和问题证据

- `src/install/runtime-integration.ts` 的默认 MCP 验证器使用匿名 `3_000ms` 定时器。
- `pnpm typecheck` 通过。
- 第一次 `pnpm test`：169/170，通过握手测试在 3028ms 返回 `rolled_back`。
- 相同测试单独复跑通过（约 339ms）；完整测试再次复跑 170/170。

## 范围

- 把默认 MCP 握手超时提升为具名的 10 秒常量。
- 增加一个真实慢启动回归场景：启动延迟超过旧的 3 秒，但仍能在新上限内完成 `initialize` 与 `tools/list`。
- 保留接入失败后的配置、Skill 回滚和尝试记录行为。

## 非目标

- 不修改 Runtime adapter、配置格式、ownership receipt 或用户提示协议。
- 不引入重试、后台验证、遥测或新的公开配置项。
- 不处理 PR #13 的 Runtime/本机 Web 重构；它在本修复验证完成后单独更新。

## 用户与调用场景

1. 正常机器上，接入验证仍快速完成。
2. 冷启动或高负载机器上，MCP 在 3 秒后、10 秒内完成握手时，接入成功而不是回滚。
3. MCP 退出、输出无效或超过 10 秒无响应时，验证失败并沿用现有安全回滚。

## 方案与关键决策

- 使用 10 秒作为单次完整握手上限。它显著高于观测到的 3 秒抖动，同时仍给用户明确的失败上限。
- 只替换默认验证器中的匿名时间值，不改变自定义 `validateConnection` 注入接口。
- 回归测试通过延迟真实 launcher 后再启动已构建 MCP，验证的是完整协议链路，不只断言常量值。

## 输入、输出与依赖

- 输入：Molis Work MCP launcher、Runtime ID、Molis Work home、plan ID。
- 输出：布尔验证结果，继续由 `RuntimeIntegrationService.confirm` 转换为 `connected` 或 `rolled_back`。
- 依赖：Node 子进程、stdio JSON-RPC、已构建的 `dist/mcp/server.js`。

## 文件与模块边界

- `src/install/runtime-integration.ts`：默认握手超时常量和计时器。
- `tests/runtime-integration.test.ts`：真实慢启动握手回归测试。
- 其他模块不修改。

## 验收标准

- 默认 MCP 验证允许超过 3 秒但少于 10 秒的有效启动完成。
- `initialize` 和 `tools/list` 都成功后才返回 `connected`。
- 原有失败回滚测试继续通过。
- `pnpm typecheck`、Runtime 接入定向测试和完整 `pnpm test` 通过。
- 工作区不出现 spec 范围外的源码改动。

## 验证命令

```bash
pnpm typecheck
pnpm build
node --import tsx --test tests/runtime-integration.test.ts
pnpm test
```

## 假设与开放问题

- 10 秒足以覆盖本地 Node/MCP 冷启动和常见并行负载；如果后续真实机器仍超过该上限，再基于证据调整，不在本次加入无限等待或重试。
- 测试环境提供项目现有测试已依赖的 POSIX shell。
