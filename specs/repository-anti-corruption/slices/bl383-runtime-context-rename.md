# BL-383：`modules/private-work-context` 改名为 `modules/runtime-context`

状态：已实现（2026-10-24，迁移线 ac-sc3 片，叠在 SC-4b 的分支上，PR 等 SC-4 合入后再开）。依据：Sessions 清理计划 D5。

## 1. 目标

SC-4 之后这个模块只剩运行上下文绑定（一个 Runtime 工作入口或工作目录属于哪个项目：`createRuntimeContextModule`、项目建议、绑定与事件、setup 幂等、拒绝建议），名字里的「私人工作」已不对。机械改名，不改行为。

## 2. 范围

- 改名：目录 `modules/private-work-context` → `modules/runtime-context`；包名 `@molis-ai/molis-work-module-private-work-context` → `@molis-ai/molis-work-module-runtime-context`；合同子路径 `@molis-ai/molis-work-contracts/modules/private-work-context` → `.../modules/runtime-context`（文件、`package.json` 的导出、API 快照 `tooling/gates/api/contracts/modules/runtime-context.txt`）；合同描述符 `modulesPrivateWorkContextContract` → `modulesRuntimeContextContract`；边界脚本的 `checkPrivateWorkContextOwnership` → `checkRuntimeContextOwnership`；`tests/private-work-context-boundaries.test.mjs` → `tests/runtime-context-boundaries.test.mjs`；`docs/modules/private-work-context.md` → `runtime-context.md`；README 标题改成「运行上下文绑定」。
- 跟着改：所有活文档与代码里的引用（`scripts/workspace-packages.mjs`、SSOT 矩阵、包清单表、`tooling/gates/*.json` 里按路径记的行、`pnpm-lock.yaml`、宿主与 MCP 的 import）。
- 不改：历史文档（`specs/archive`、`docs/archive`、发布说明、评审记录、旧计划）里的旧名，它们记的是当时的事；`tests/sessions-offline.test.ts` 里断言旧导出名不存在的正则。
- 合同包名变了，按 `docs/system/CONTRACT-CHANGES.md` 第一阶段同一个 PR 改全；没有外部调用方（工作区内部包）。

## 3. 验收

- **RAC-258**：仓库的活代码、配置和活文档里没有 `private-work-context`（历史文档除外）；`modules/private-work-context`、合同子路径 `modules/private-work-context` 不存在，新路径存在且导出与原来相同（API 快照只有改名带来的差别）。（`tests/runtime-context-boundaries.test.mjs`、`pnpm api:update` 后快照无其他变化）
- **RAC-259**：门禁数字对 merge-base 不升：按文件记录的行随文件改名，没有因改名多出来的单元（改名前后同样的数字）。

## 4. 对调用方的影响

工作区内部包改名：宿主与 MCP 的 import 路径变了，同一个 PR 已改全。没有外部调用方，没有动作、Manifest、MCP 工具名、数据或页面资源的变化。
