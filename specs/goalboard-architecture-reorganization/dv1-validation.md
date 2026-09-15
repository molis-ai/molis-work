# DV1 — CLI / MCP 迁移验收

日期：2026-09-05。对应 accepted Contract revision 1；范围和验证方法见 [任务书](dv1-work-plan.md)。本报告只验收 CLI/MCP 薄入口，不代表全部架构重组或最终用户 E2E 完成。

## 验收证据

| 要求 / Evidence 名称 | 当前实现与实际检查 | 结论 |
| --- | --- | --- |
| `dv1-boundary` / dv1 boundary audit | `apps/cli`、`apps/mcp` 只消费公开 Contracts、官方 Goals Plugin 和包内文件。逐组读过生产 handlers：仅做参数转换、协议与展示，不含 SQL、Store 或领域事务；业务写入调用 public application/client。`pnpm boundary:check`：48 包、305 source files、778 imports、65 dependency edges、30 Contract subpaths，0 错误。 | 通过 |
| `dv1-boundary` / dv1 contract conformance | public Goals Plugin 唯一定义有限具名 capability 与原应用输入/输出；Host 显式注册到原 owner。完整 BoardSnapshot 复用事实类型并保留完整 revision 字段，旧路径是别名。原同步 adapter 是兼容 public API，不复制实现。包构建及根 TypeScript 通过。 | 通过 |
| `dv1-legacy-exit` / dv1 caller inventory | V1 CLI 所有 Goal 命令和 MCP 所有 Goal 工具改用 Host Client，无 `withProject`、Coordinator 或 Store 直访。Project context 工具通过有界 catalog provider；Session/Panel 通过 Local Host。下节列出保留的 executable 与其他 Goal 所有的职责。 | 通过 |
| `dv1-legacy-exit` / dv1 legacy responsibility diff | root MCP 从原 3,443 行到 533 行，V1 CLI 190 行；行数仅作定位。协议、工具目录、转换/展示、Session 活动描述、宿主组合各有实际 caller。旧 Runtime application 字段已删除；6 个旧 Host capability 声明改为 public re-export。V3 migration `safeId` 及之后算法正文与本切片前逐字一致；未改导入规则、数据库或幂等。 | 通过 |
| `dv1-result` / dv1 targeted test or inspection | 44 项 CLI/MCP/Host/跨入口定向测试通过、0 跳过。真实 CLI→MCP→CLI 链检查最终 Goal/Claim/Run/Evidence/Review；重复/并发提交检查相同记录与持久化快照；拒绝操作后状态不变；Host 重启后恢复。另有 scope/排队写入、Session 身份隔离与次级索引失败恢复测试，均在全量套件中通过。 | 通过 |
| `dv1-result` / dv1 primary deliverable | `pnpm test` 包含正式 migrated packages 构建、根编译、PTY bundle 和 `tests/*.test.ts`：601 通过、0 失败、0 跳过，进程 exit 0。日志：`/private/tmp/molis-work-dv1-full-regression-20260905.log`。`git diff --check` 通过。 | 通过 |

## 生产 caller 与保留边界

- `src/v1/cli.ts`：保留 executable 参数入口、命令分流、Host 注入与关闭；调用 CLI App 的输入/展示和具名 handler，再由 Client 调用原实现。不会打开 Store/复制事务。
- `src/mcp/server.ts`：保留 stdio 启动、有限 switch、可信宿主权限检查、错误类识别和实现注入。Runtime/management 区别、拒绝模型伪装用户、禁止覆盖宿主连接等检查仍先于操作；它们是入口信任边界，不是第二套 Goal 完成/规划/执行规则。
- `src/local-host/composition.ts`：唯一兼容 Store/Coordinator 装配点，237 行；具名注册调用原方法。Available+projection、trash+work state、planning methods+composition 在一个 handler 内完成原同步调用，不将相关状态拆成多个异步读写。`withScope` 保留 open-before-adapt、response-before-close，且不把整个 callback 入队造成嵌套调用死锁。
- `src/cli/main.ts`：安装、服务、卸载与配套 demo 命令调用现有安装/Project owner，没有另写 Store。其安装分发迁移由 DV4 负责，任务书已明确排除；本次没有为完成 DV1 将安装算法搬入 CLI 包。
- Coordinator 中剩余 Draft/Goal Tree/查询编排、Workbench 兼容 `withProject`、Catalog staging 仍由各自后续 owner 迁移；公开入口迁移不能证明这些业务实现也已完成。整体 Huge Class 审计仍保留。

## 非静态验证与限制

`tests/host-entry-consistency.test.ts` 在真实 MCP 查询中插入同 Host 的排队新建/恢复写入，证明当前组合响应不混入后一次提交，后续持久化事实又确实包含它；不是测试空壳或数组存在。`tests/runtime-context-entry.test.ts` 使用真实 catalog，验证失败绑定、异步展示失败及重试时绑定记录不变，资源正确关闭；guidance 失败不接纳新连接，Session 不可用仍保留主连接。`tests/mcp-protocol.test.ts` 独立断言 `_meta` 优先级、原参数、无重试及错误回复。

构建与迁移中曾发现一个未用 `PlanningMethodPack` import，删除后类型检查及全量回归通过；没有为通过测试放宽业务断言。全量测试需要本机临时端口，已在批准的执行环境运行，使用测试目录而非用户项目数据。

完成等级：本切片达到功能可用及自动回归验收，不声明整个产品内部完整或可发布。整体开发后的模拟用户前端/后端 E2E、代码清理后再次 E2E、原始架构逐项审计仍未完成。当前已安装 MCP 返回 Session reader 3 / schema 5，最终安装分发更新与真实 Session 恢复验证必须覆盖，不能用本仓库测试通过替代。
