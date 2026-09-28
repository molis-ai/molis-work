# EX2 Evidence 与 Verification 门禁迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-ex2`  
完成等级：内部完整（架构迁移，无用户功能增删）

## 1. 本次真正迁走了什么

- `packages/contracts/src/modules/evidence-verification.ts` 成为 Evidence、Correction、locator、criterion coverage 和 verification gate 的公开类型/API SSOT。
- `modules/evidence-verification` 接管 Evidence/Correction schema、migrations 17–20、migration 30 Evidence backfill、Repository、文件与 Markdown locator 预检、不可变更正状态机、覆盖判断和返工 freshness。
- `src/v1/coordinator.ts` 不再保存 Evidence SQL、文件预检或 Correction 规则；它只保留 Goal/Run 授权、action token、幂等 Receipt 和跨 owner reconciliation。
- `src/v1/store.ts` 不再维护 Evidence schema、migration、mapping 或 snapshot SQL；总 migration 和 Board snapshot 通过 Evidence public entrypoint 组合。
- `src/v1/action-projection.ts` 不再复制“当前有效 Evidence”和 human-decision coverage 规则；Web 打开项目 Evidence 也通过公开 Query/locator API 获取记录时的 workspace root。
- 旧 `src/evidence/locator.ts` 已删除，`src/v1/types.ts` 的重复 Evidence/Correction 类型改为 public Contract 别名。

## 2. 明确保留与未纳入

- Web、CLI、MCP 的路径、payload、权限、幂等和错误语义保持兼容；最终让这些入口脱离 Coordinator Facade 由 EX4 完成。
- Goal/Run 是否允许提交、criterion 是否属于当前 Contract、action token 是否有效，仍由 Goals/Execution application layer 判断；Evidence Module 接收已经授权的提交上下文。
- Review obligation、Review verdict、Proposal、Decision 和人工确认来源不归 Evidence；它们由 EX3 的 Governance owner 维护。Evidence 只保存可选的 Review 引用。
- Artifact 内容与版本、Goal Contract、Run lifecycle 和跨 owner 完成协调没有被吸收到本模块。

## 3. Huge Class 对账

| 文件 | EX1 后 | EX2 后 | 已退出职责 |
| --- | ---: | ---: | --- |
| `src/v1/coordinator.ts` | 12,006 | 11,778 | Evidence SQL、locator preflight、Correction 状态机、coverage/freshness 查询 |
| `src/v1/store.ts` | 2,019 | 1,872 | Evidence/Correction schema、migration、mapping、snapshot SQL |
| `src/v1/types.ts` | 895 | 862 | Evidence/Correction 重复 public types |

`src/v1/action-projection.ts` 仍是 1,111 行的跨 owner read model，但其中的 Evidence 有效性与 criterion coverage 规则已调用公开纯函数，不再保留第二套业务判断；整个 read model 的退出属于 EX4。

新的 Evidence 实现按 `repository.ts`（持久化）、`lifecycle.ts`（提交/更正状态机）、`verification.ts`（查询与门禁）、`coverage.ts`（无副作用投影规则）、`locator.ts`（有界文件预检）、`migrations.ts` 和公共 `index.ts` 拆分。最大单文件 359 行，没有把旧 Coordinator 整段换名搬入新包。

## 4. 验证证据

| 检查 | 结果 |
| --- | --- |
| Contracts / Evidence Module / root TypeScript | 通过 |
| Workspace inventory | 48 packages、30 Contract subpaths、0 errors |
| Package boundary | 160 source files、273 imports、56 dependency edges、15 compatibility allowlist entries、11 legacy huge files、0 errors |
| Evidence public Module 定向测试 | 2 / 2 通过 |
| Evidence + V1 定向回归 | 118 / 118 通过 |
| 全量 `CI=true pnpm test` | 508 / 508 通过；包含 build、安装升级、Web/PTY、CLI、MCP、并发与迁移回归 |
| `git diff --check` | 通过 |

全量测试中的 Web/PTY 用例需要绑定本机 `127.0.0.1`，因此最终证据在允许本地端口的执行环境中取得。

## 5. 验收条件对照

- `ex2-boundary`：通过。Evidence/Verification 有唯一 public entrypoint；workspace boundary 为零错误，没有 deep import、跨 owner Store 或 Plugin 反向依赖。
- `ex2-legacy-exit`：通过。Evidence/Correction 类型、schema、Repository、migration、locator、Correction 和 verification 规则已退出 Coordinator、Store、`src/evidence/` 与 Action Projection 的重复实现。
- `ex2-result`：通过。Evidence 提交、passed/failed/inconclusive 结果、不可变 supersede/retract、owner/cycle 保护、Review 引用、criterion coverage、返工 freshness、locator 隐私边界和历史 migration 均由定向及全量回归固定。

## 6. 后续边界

- EX3 迁 Review obligation、Review、Proposal、Decision 和确认来源。
- EX4 组合 Execution + Evidence + Governance Query，切换剩余 Web/CLI/MCP/Action Projection 入口，并删除 Coordinator compatibility facade。
- 本次没有实现未来 Plugin Artifact 交换、Team Server 同步或新的用户功能；这些仍按各自已确认 Goal 推进。
