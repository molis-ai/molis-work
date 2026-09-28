# EX1 Execution Claim / Run 生命周期迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-ex1`  
完成等级：内部完整（架构迁移，无用户功能增删）

## 1. 本次真正迁走了什么

- `packages/contracts/src/modules/execution.ts` 成为 Claim、Run、lease 和状态转换的公开类型/API SSOT。
- `modules/execution` 接管 Claim/Run schema、migration 2/6/7、migration 30 的 Execution backfill、Repository、Query、Command、生命周期事件和租约过期恢复。
- Claim 的 create / renew / release / revoke 与 Run 的 start / block / resume / complete / fail / abandon 由 Execution 状态机执行。
- `src/v1/coordinator.ts` 不再直接查询或修改 `claims` / `runs` 表；它只保留 Goal 动作资格、Contract revision、幂等 Receipt 和跨 owner lifecycle reconciliation。
- `src/v1/store.ts` 不再维护 Claim/Run 映射、schema 或历史迁移实现；总 migration 和 Board snapshot 通过 Execution 公共入口组合。
- `src/projects/catalog.ts` 的删除保护改读 Execution Repository，不再直查 Claim/Run 表。
- `src/v1/types.ts` 的 Claim/Run 重复类型改为 Execution Contract 别名。

## 2. 明确保留与未纳入

- Web、CLI、MCP 的路径、payload、权限、幂等和错误语义保持兼容；最终让这些入口脱离 Coordinator Facade 由 EX4 完成。
- Goal 是否 ready、动作应该由谁领取、Contract revision 是否兼容，仍由 Goals / action application layer 判断，不塞进 Execution。
- Evidence、Review、Proposal、Decision、Session、Runtime process 和 Artifact 未迁入 Execution；分别由 EX2、EX3、WK、AR 系列 Goal 负责。
- 本次不新增 attempt、Runtime invocation 或 retry-lineage 产品功能；Contract 中未来字段不会用假实现冒充可用。

## 3. Huge Class 对账

| 文件 | 上一阶段 | EX1 后 | 已退出职责 |
| --- | ---: | ---: | --- |
| `src/v1/coordinator.ts` | 12,423 | 12,006 | Claim/Run SQL、Repository、状态机、lease/recovery 实现 |
| `src/v1/store.ts` | 2,276 | 2,019 | Claim/Run schema、migration、mapping、snapshot SQL |
| `src/v1/types.ts` | 933 | 895 | Claim/Run 重复 public types |

新的 Execution 实现按 `repository.ts`（持久化）、`lifecycle.ts`（状态机）、`migrations.ts`（历史升级）、`errors.ts` 和公共 `index.ts` 拆分；没有把旧 Coordinator 整段换名搬入新包。

## 4. 验证证据

| 检查 | 结果 |
| --- | --- |
| Contracts / Execution / root TypeScript | 通过 |
| Workspace inventory | 48 packages、30 Contract subpaths、0 errors |
| Package boundary | 153 source files、253 imports、56 dependency edges、15 compatibility allowlist entries、11 legacy huge files、0 errors |
| Execution public Module 定向测试 | 2 / 2 通过 |
| Execution + Project Catalog + V1 定向回归 | 135 / 135 通过 |
| 全量 `CI=true pnpm test` | 506 / 506 通过；包含 build、安装升级、Web/PTY、CLI、MCP、并发与迁移回归 |

全量测试中的 Web/PTY 用例需要绑定本机 `127.0.0.1`，因此最终证据在允许本地端口的执行环境中取得；沙箱内的 `listen EPERM` 不属于产品失败。

## 5. 验收条件对照

- `ex1-boundary`：通过。Execution 有唯一 public entrypoint；旧 caller 不再 deep import 或直连 Claim/Run Store。
- `ex1-legacy-exit`：通过。Claim/Run 类型、schema、Repository、状态机和 migration 已退出 Coordinator/Store；旧入口只做应用兼容编排。
- `ex1-result`：通过。领取、续租、释放、撤销、运行转换、失败释放、lease expiry、崩溃恢复、幂等、Contract pinning 和并发行为由定向及全量回归固定。

## 6. 后续边界

- EX2 迁 Evidence / Correction / verification gate。
- EX3 迁 Review / Proposal / Decision / Governance。
- EX4 组合 Execution + Evidence + Governance Query，切换 Web/CLI/MCP/Action Projection，并删除剩余 Coordinator compatibility facade。
