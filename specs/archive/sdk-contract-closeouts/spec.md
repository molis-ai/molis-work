# 页面刷新、成果动作和固定变更的 SDK 收口

> 归档（2026-11-23）：判定为**已实现**。[#2274](https://github.com/molis-ai/molis-work/pull/2274) 已合入 `main`（`6c2de22521`）。三项工程验收通过，三份待办已删除并登记。

状态：已合入（负责人 Codex）。

用户授权把 BL-ui-client-scope-watch-revision、BL-artifact-sdk-handler-binding、BL-coding-changeset-view-shared 合成一组改动。目标是功能可用并完成本地工程验证。推送和开 PR 按仓库授权规则办理，最终提交的全量测试由 CI 运行。

## 行为和范围

- `host.scope.watchRevision` 已由 UI Host 实现。公开的 `UiClientScope` 补上现行签名，Git、Coding 和 Schedule 从这里取类型。轮询、暂停、取消和刷新回调沿用 UI Host 的实现。
- 成果模块的 read、head、own、publish、record、process-head、process-own 与 list 共用 `bindActionHandler`，输入类型按现有 schema 推导。写入 schema 的 payload 和 metadata 保持开放，由原有的成果存储入口验证和规范化 JSON。内部写入参数声明体现这条边界，插件直接调用的 SDK 类型、注册身份、权限、同步执行、动作版本及 schema 值保持原行为。独立 Artifacts 插件已从 main 移除，核对模块现行登记、SDK 动作 schema 和 Shelf 的真实调用。Shelf 按平台返回的可消费版本列表读取正文。
- `/diff-view` 提供固定 Coding 变更的视图。按条目索引或路径选择，返回全部文件摘要、选中版本来源和对比行，统一判断新增和删除。Coding 继续筛选可用的净变更、生成可复制补丁并决定布局。Diff 继续解析输入、决定比较路径并提供自己的提示文案。沿用两边的空态、缺项提示和已有输出。
- Coding 预览从已有的固定变更引用规则取得首版显示值。页面仍用实际保存的引用决定是否可以提交逐行意见。

## 开工前检查

- UI Host 仍拥有刷新机制，成果模块仍拥有写入与消费规则，Coding 仍生产固定变更；SDK 共用公开类型和视图投影。各插件用既有 Runtime 登记和 SDK，权限取自原调用上下文。
- 公开 TypeScript 签名经 `pnpm api:update` 更新，动作合同和版本、库与既有引用原样核对。沿用现行存储规范化、完整的授权检查和拒绝路径，无库结构、数据迁移、新调用或新增错误码。
- 插件原有入口、文案、布局、反馈及页面资源路径均沿用。来自用户或插件的固定引用仍按原规则读取和验证，只把已解析的变更交给 SDK 生成视图。
- 从 `origin/main` 5bfd52b87b 建独立工作树，2026-11-23 同步到 8192cc7b10。#1743 对应的第 96、98、99 批均已合入，三个 BL 是后续项。在途 PR 同改 `docs/backlog-removed.md`，合并时保留各项登记。选择沿用已有 API、schema 构造器和 SDK 对比原语，避免为三个使用方维护专用平台实现。

## 验收标准

1. **SCC-01** 三个插件通过公开类型编译。定向回归证明可见的 Schedule 详情仍能跟随版本变化更新，并拒绝过时响应。
2. **SCC-02** 实际注册的 8 个 SDK 动作保留精确输入输出 schema。读、写、同步、拒绝和重放走原安装权限。非法的 payload 或 metadata 被成果主人拒绝，库与事件游标保持。
3. **SCC-03** Shelf 的结果列表调用既有可消费查询。平台仍按声明、权限和可用性给出候选，Shelf 仍可预览和接收可用版本。
4. **SCC-04** Coding 和 Diff 对固定变更共用视图，新增、删除、空清单、缺项和多次改同一文件保留各自选择规则。Coding 净变更和补丁、Diff 来源和版本保持正确。
5. **SCC-05** [人工] `pnpm api:update` 生成的变化与预期一致，`tooling/gates/actions/` 无差异。构建、健康、包边界、资源和密钥门禁通过。三份 BL 删除并在 `docs/backlog-removed.md` 登记，相关历史链接有效。全量由 CI 在最终提交运行。

## 验证记录

- 2026-11-23，Node 24.15.0、pnpm 11.9.0 上 `pnpm build` 通过。`pnpm api:update` 更新 `contracts/platform/ui`、`contracts/modules/artifacts` 和 `plugin-sdk/diff-view`。动作快照差异为空，`action-contract-snapshot` 25 条通过。
- `pnpm health:check --base origin/main`、`pnpm boundary:check`、页面资源、首屏体积、插件样式预算、密钥扫描、翻译和文案巡检通过。三份 backlog 文件删除，批次中的历史引用已指向删除登记。
- 合同套件 68/68 文件、980/980 条通过。关键定向回归 20/20 文件、117/117 条通过，覆盖已打开 Schedule 详情的就地刷新和迟到响应、成果动作读写及拒绝、Shelf 的列出到接收、Coding 和 Diff 的固定变更与补丁。
- 包级回归首次通过 116/117 文件。Shelf 的测试替身曾把未声明的计划加入可消费查询。替身改从 Manifest 取声明，保留原断言。末次构建后，Shelf 单测及真实 HTTP、成果 SDK 和 schema 共复跑 4/4 文件通过，补齐第 117 个包级文件。
- `pnpm studio:replay` 的 404 份答卷维持既有判定。隔离 Home 的替身生成冒烟 4/4。该 Home 未配置模型，真实生成未运行。
- 最终 PR 头 `bdaffee9e4` 复评后重新构建。本机包边界、资源预算、版本校验和五个定向文件全过。Coding 预览沿用已有固定引用规则，真实 HTTP 回归验证未保存时能预览，已保存后才有逐行反馈。[复评记录](https://github.com/molis-ai/molis-work/pull/2274#issuecomment-7108446905)
- [常规 CI](https://github.com/molis-ai/molis-work/actions/runs/45225850212)、[视觉检查](https://github.com/molis-ai/molis-work/actions/runs/45225849703)和[全量回归 24/24](https://github.com/molis-ai/molis-work/actions/runs/45226135096)通过。
- 首轮合并队列的 `tests/doc-reference-gates.test.ts` 超时，同一队列提交在本机单跑 85/85 通过。[首轮记录](https://github.com/molis-ai/molis-work/actions/runs/45234614121)
- 最终[合并队列](https://github.com/molis-ai/molis-work/actions/runs/45254592491)的 `Verify` 通过，并确认 [`6c2de22521`](https://github.com/molis-ai/molis-work/commit/6c2de22521f88e4809dff98111e92aa2ff74cba6) 已在 `main` 上，文件树与同一基线合入评审头的结果一致。
