# W5-09 余项：`platform/plugin.ts` 的热点按领域拆开（纯搬移）

状态：一轮可合，Codex 已认领并补修文档建议（2026-10-23）；纯搬移，由公开 API 快照与逐条语句比对守住，全量交统一验证窗口。

## 1. 目标

路线图 W5-09：「按领域拆 `services/agent-host.ts`，修 `platform/plugin.ts` 的热点。纯搬移，由 API 快照守住。」

- `services/agent-host.ts` 一半已由 #591 做完（按领域拆到旁边的 `agent-host-*.ts`）。入口里还留着 typed 能力表 `agentHostCapabilities`：门禁按文件数 typed 引用，表必须留在原文件，它的去向是 R8（BL-364 把它逐批改成动作）。本片不再动这个文件。
- `platform/plugin.ts` 是并行开发登记的枢纽文件之一（`docs/system/PARALLEL-DEVELOPMENT.md`），2026-10-01 起改过 50 次；改得最多的是插件拿到的平台服务（每加一项服务改一次）、Manifest 声明和路由类型三块。本片把这三块搬到旁边的文件，`plugin.ts` 留启动上下文、定义、Runtime 与集成提供方。

## 2. 搬到哪里

| 新文件 | 内容 |
| --- | --- |
| `packages/contracts/src/platform/plugin-host-services.ts` | `PluginHostServices` 与它直接用的客户端接口：`PluginPrivateStorage`、`PluginUiClient`、`PluginActionDirectory`、`PluginActionClient`、`PluginTerminalClient` |
| `packages/contracts/src/platform/plugin-manifest.ts` | `PluginManifest` 与各项声明：`PluginDeployment`、`PluginKind`、`PluginPermissionDeclaration`、`SURFACE_BROWSER_PERMISSION`、`browserSiteDeclarations`、`PluginEntrypointManifest`、`PluginRequirementDeclaration`、`PluginUpgradeCompatibilityDeclaration`、`PluginRouteMethod`、`PluginRouteDeclaration` |
| `packages/contracts/src/platform/plugin-routes.ts` | 路由：`PluginRouteRequest`、`PluginRouteStreamLine`、`PluginExecutionControl`、`PluginRouteResponse`、`PluginRouteBinding` |

- `PluginCapabilityClient` 留在 `plugin.ts`：它引用 `HostCapabilityDefinition`，typed 能力的门禁按文件计数，搬走就是新文件里多一处。它随 typed 通路一起删。
- `plugin.ts` 按名字逐个转出搬走的声明，`platform/plugin` 子路径与根入口的导出不变；新文件不是子路径。

## 3. 验收

| 编号 | 内容 | 证据 |
| --- | --- | --- |
| RAC-185 | 公开 API 不变：`node scripts/gates/api-snapshot.mjs` 与快照一致，`tooling/gates/api/` 没有改动 | 门禁输出 |
| RAC-186 | 纯搬移：拆分前 `plugin.ts` 的 43 条顶层语句（不算 import 与转出）与拆分后四个文件的语句逐字相同，连同前导注释；95 个具名导出与原 19 条转出保持一致 | PR 正文提供可复跑的 TypeScript AST 比对命令 |
| RAC-187 | 门禁数字不变或变小（typed 引用、合同纯度、巨大单元） | `node scripts/check-health-gates.mjs --base origin/main` |

## 4. 对调用方的影响

没有：类型、值、子路径都不变，只是声明换了文件。文档里指向 Manifest 定义的地方改成 `plugin-manifest.ts`（`packages/contracts/README.md`、`docs/system/CONTRACT-CHANGES.md`、`docs/system/PARALLEL-DEVELOPMENT.md` 的枢纽表、`skills/molis-plugin-dev/elements.md` 与 `docs/platform/PLUGIN-PLATFORM.md`）；外部作者仍从公开的 `platform/plugin` 子路径导入，不新增深层入口。两处测试注释写全 `apps/local-host/src/plugin-host-services.ts`，明确说的是宿主实现，不是本片新拆出的同名合同文件。


## 5. 本轮 CI 夹具修复

CI run 40009381609 的 Rust 检查在 `context_directory_files.rs` 测试夹具建目录时返回 `AlreadyExists`，文件替换拒绝断言尚未执行。该文件与 main 相同：进程号加系统时钟不能保证同一进程并行测试拿到不同目录名。本片只为 `#[cfg(test)]` 的 `Fixture::new` 添加原子序号，继续独占 `create_dir`，每份夹具只删除自己的目录；不改生产文件访问行为、依赖或已有断言。用该模块的并行 Rust 测试与最终 CI 验证，RAC-185～187 仍只约束合同拆分。
