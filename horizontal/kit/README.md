# 能力包汇总

把这个范围里的能力包（插件包、Molis Work 自带、你的角色）现算出来：经调用方自己的动作目录找到各主人的上报动作，各调一次，按登记与安装记录给每条盖上来源和所属的包，再从包里的条目读出每个包的状态。它什么也不存，每次都重新汇总。

包名：`@molis-ai/molis-work-service-kit`。工作区内部包，由 Host 装配成 `kit.catalog.list@1`。

## 一次典型调用

本人打开「能力包」：Host 的 `kit.catalog.list@1`（`system.kit`）把调用方和它自己的客户端交给 `gatherKit`。汇总处 `discover` 一次，按两个合同类型（`KIT_REPORT_INPUT_TYPE`、`KIT_REPORT_OUTPUT_TYPE`）挑出上报动作，并行各调一次（每个限 `KIT_REPORT_TIMEOUT_MS`）。插件安装服务给包头；技能、提示词与角色、Agent 工具、Characters、项目 MCP、连接 MCP、对外接入各报自己的条目；插件自己的上报者只报它安装里的提示词、角色与 MCP。汇总处盖章、拼包（角色下挂提示词，没有归属角色的挂在「个人助理」一行下；工具按包里角色的 `host_tools` 算），读出每个包是在用、要处理、停用、已卸载还是读不到。

## 从哪里读代码

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | `gatherKit`、`KIT_SYSTEM_REPORTERS`（谁能替别人说来源和包）、盖章、拼包与包状态 |

合同在 `@molis-ai/molis-work-contracts/platform/kit-report`（上报协议与条目形状）和 `@molis-ai/molis-work-contracts/services/kit`（`kit.catalog.list@1`、包与导出文件）。Host 装配与宿主自己的上报者在 [apps/local-host/src/kit-actions.ts](../../apps/local-host/src/kit-actions.ts)、[apps/local-host/src/kit-mcp-reports.ts](../../apps/local-host/src/kit-mcp-reports.ts)、[apps/local-host/src/agent-definitions/kit-report.ts](../../apps/local-host/src/agent-definitions/kit-report.ts)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-service-kit typecheck
pnpm --filter @molis-ai/molis-work-service-kit build
```

## 开发要求

- 负责：发现上报者、并行调用与限时、按登记与安装记录盖章、拼包、算工具所在的包、读出包状态、把失败与丢掉的条目写进 `issues`。
- 不负责：任何条目的事实（技能、提示词、角色、工具、MCP 与包头各归其主人）、存储、权限的授予、导出与导回（各部分走主人自己的动作）、界面。
- 公开入口：`@molis-ai/molis-work-service-kit`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/platform/kit-report`、`@molis-ai/molis-work-contracts/services/kit`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同；不读任何主人的库与文件（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量（安全不变量 [S-kit-catalog](../../docs/system/security-invariants/S-kit-catalog.md)）：
  - 只用调用方自己的客户端：调用方看不到的上报者不调；上报者按合同类型发现，不维护名单。
  - 来源与所属的包由汇总处盖章，不信上报者自称：插件上报者的条目一律盖成它自己的安装；系统提供方只有在 `KIT_SYSTEM_REPORTERS` 里点名、且背后没有插件安装时才可信，并只在它那一行允许的类、来源与包里。
  - `manage.href` 只能指向上报者自己的地方：插件只到自己的 `/plugins/<plugin_id>`，系统提供方只到宿主设置；其余去掉。
  - 一个上报者失败或超时只让它可能在的包读作 `unknown`，别的包照常。
  - 包没有开关，状态只从插件与条目读出；不存任何东西，也不加用量表。
- 改动后必跑：`node scripts/run-tests.mjs tests/kit-catalog.test.ts tests/kit-export.test.ts tests/security-invariants-kit-catalog.test.ts tests/capability-pack-contract.test.ts`
- 相关手册：[specs/capability-pack/contract-design.md](../../specs/capability-pack/contract-design.md) 第 4 节；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
