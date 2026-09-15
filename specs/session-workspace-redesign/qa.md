# Session Runtime Foundation QA

## capability-routing

状态：通过。

- `tests/session-adapters.test.ts` 验证 Codex Adapter 完整声明 `create/list/discover/read/resume/events/handoff`，并只调用已核实的 app-server method。
- 同一测试验证未知 Runtime 自动进入 registry fallback；只有 `create/list` 可用，其余能力返回结构化 `unsupported`。
- Runtime 调用抛错时结果保持 `failed`，不会伪装为空内容或空列表。

验证命令：

```text
node --import tsx --test tests/session-adapters.test.ts tests/session-registry.test.ts tests/session-migration.test.ts
结果：8 passed, 0 failed
```

## compatibility-migration

状态：通过。

- `tests/session-migration.test.ts` 覆盖 binding-only、panel、后到 native identity、重复对账和注入失败。
- 重复迁移不增加 Session；旧 panel 和 binding 数量保持不变。
- 注入失败时 Registry 整批事务回滚，旧 catalog 不受影响。

## identity-model-and-isolation

状态：通过。

- `tests/session-registry.test.ts` 验证 `session_id`、Runtime 原生 ID、surface、project、Goal 与 workspace 分列保存。
- 同 workspace 的两个 Session 保持独立；不同 Runtime 可安全使用相同原生 ID 文本。
- 原生 discover 不会自动写入 project、Goal 或 workspace 关系。
- 晚到原生 ID 必须匹配短期 correlation 或 surface；Goal 变更追加历史而非覆盖。
- `tests/mcp.test.ts` 验证 `MOLIS_WORK_SESSION_ID`、Codex thread、panel、Goal 与 legacy work context 在宿主边界保持分离。

## mcp-and-desktop-integration

状态：通过。

```text
node --import tsx --test tests/mcp.test.ts
结果：32 passed, 0 failed

node --import tsx --test tests/desktop-tui.test.ts
结果：31 passed, 0 failed
```

- 用户确认项目绑定后，`context_resolve` 返回 Molis Work `session_id` 摘要。
- desktop panel 启动环境包含 `MOLIS_WORK_SESSION_ID`，同时保留旧变量供兼容回退。
- Codex `_meta.threadId` 晚到时补到相同 Session，不生成第二条记录。
- 多 panel 列表每个请求只执行一次 Registry 对账，避免并发重复迁移。

## build-and-static-checks

状态：通过。

```text
pnpm typecheck
pnpm build
git diff --check
结果：全部通过
```

`package.json` 的完整 `pnpm test` 已纳入三个 Session foundation 测试文件。

## full-suite-context

完整套件最后一次运行结果为 `360 passed, 3 failed`。三个失败均不在本 Work Item 调用链：

1. Goal momentum 的 100ms 性能阈值在并行全套运行时为 152.4ms；定向运行不涉及 Session 模块。
2. 当前工作树已有五条 Web 中文文案缺少英文翻译。
3. 当前工作树已有一条 Decision Center CSS 断言仍要求旧的 Feed mobile padding 结构。

本 Work Item 没有修改这些失败对应的 Goal momentum、翻译字典或 Feed mobile CSS；受影响的 Session、MCP 与 desktop 定向套件全部通过。

## acceptance-summary

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 七项 capability 与 native/fallback 边界 | 通过 | `tests/session-adapters.test.ts` |
| 兼容迁移幂等、保留旧数据、失败回滚 | 通过 | `tests/session-migration.test.ts`、`migration.md` |
| 身份与关系分离、无持久默认关系 | 通过 | `spec.md#identity-model`、`tests/session-registry.test.ts` |
| Session 隔离与 MCP/panel 晚到身份接线 | 通过 | `tests/mcp.test.ts`、`tests/desktop-tui.test.ts` |
