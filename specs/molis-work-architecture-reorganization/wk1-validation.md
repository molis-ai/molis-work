# WK1 Private Work Context 迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-wk1`  
完成等级：功能可用（本阶段自动化门禁完成；整轮架构开发结束后再做统一真实用户前后端 E2E）

## 结果

WK1 已把 Session、私密内容、Project / Goal / workspace 关联、Handoff、旧数据迁移和 Runtime context binding 正式归到 `modules/private-work-context`。原数据位置和公开行为保持不变，旧源码入口只剩有明确退出条件的兼容 re-export。

这次不是把 1,324 行 Registry 原样换目录：owner 内按职责拆成 11 个文件，最大的 `session-records.ts` 为 387 行；原 `src/sessions/registry.ts` 变成 8 行 public package re-export。Project Catalog 从 2,104 行降到 1,871 行，并且不再包含 `runtime_context_*` 的直接 SQL。

## 唯一事实与边界

| 事实 / 行为 | 当前 owner | 兼容位置 |
| --- | --- | --- |
| Session identity、native correlation、surface、Project / Goal / workspace association | `session-records.ts` | `src/sessions/registry.ts` 仅 re-export |
| 私密内容加密和 content reference | `content-store.ts` | `src/sessions/content-store.ts` 仅 re-export |
| Session timeline event、敏感元数据过滤 | `session-events.ts` | 旧 Runtime / UI caller 经 public facade |
| Handoff draft、目标 lineage、发送状态和中断恢复 | `session-handoffs.ts` | 实际 Runtime 投递仍由 WK2 / WK3 编排 |
| 旧 panel / binding 幂等迁移和 receipt | `session-migration.ts` | 保留原 `sessions.db` schema v3 |
| Runtime context binding、event、setup request、suggestion rejection | `context-bindings.ts` | Project Catalog 只做 Project 选择应用编排 |
| schema、数据兼容 marker、共同校验 | `session-schema.ts` | 原 owner marker 仅作为旧数据兼容标识 |

Private Work Context 不吸收 Project identity / workspace membership、Execution Claim / Run、Goal / Artifact、Runtime process、Codex / PTY 协议或 Desktop Panel UI 状态。

## 无损迁移

- 继续使用 `~/.molis-work/sessions/sessions.db`、schema v3、`sessions/content` 和原 AES-256-GCM 内容格式；没有新建第二份 Session Store，也没有破坏性数据搬迁。
- Registry 的 create / discover / link / association / archive、事件幂等、Handoff 重试、legacy migration 和重启恢复方法保持原签名和行为。
- Project Catalog 原 v1–v9 migration 仍调用同一套 binding schema helper；既有 Catalog 升级测试通过，Project facts 没有被 Private Work Context 吸收。
- Web、MCP 和 workspace project actions 已直接使用 package public entrypoint；`src/sessions/` 内剩余 Runtime adapter、resume 和 Handoff delivery caller 由 WK2 / WK3 继续迁移。

## Huge Class 治理

| 文件 | 行数 |
| --- | ---: |
| `session-records.ts` | 387 |
| `session-handoffs.ts` | 336 |
| `context-bindings.ts` | 318 |
| `session-schema.ts` | 254 |
| `session-registry.ts`（package facade） | 213 |
| `session-migration.ts` | 200 |
| `content-store.ts` | 159 |
| `session-events.ts` | 121 |
| 其余 entry / error / aliases | 81 合计 |

边界门禁新增 `checkPrivateWorkContextOwnership`，会拒绝：旧 Registry / Content Store 重新长出实现、旧 types 复制 Contract、Project Catalog 重新写 binding SQL、owner 文件超过 500 行、或缺少 public Contract / owner 文件。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| WK1 定向回归（Session Registry、隐私、迁移、Project actions、Handoff recovery、Project Catalog、public module） | 35 / 35 通过 |
| public module 补充验证（关闭后的内容保留、重启、binding Repository） | 2 / 2 通过 |
| `CI=true pnpm workspace:verify` | 通过：48 packages、191 source files、403 imports、61 dependency edges、30 Contract subpaths、14 compatibility entries、9 legacy huge files、0 boundary errors；全部 package typecheck / build 通过 |
| `CI=true pnpm test` | 515 / 515 通过，0 fail / cancelled / skipped |
| `git diff --check` | 通过 |

全量回归包含 Project Catalog schema v1–v9 迁移、Session 创建/关联/重启、加密内容、Handoff 中断/重试、Project 删除 receipt、Web/MCP/CLI/安装和前后端 loopback 集成。按总体执行合同，本阶段不单独做人工浏览器验收；全部架构开发完成后统一按真实用户操作执行并复验。

## Acceptance Criteria 对账

| Criterion | 状态 | 证据 |
| --- | --- | --- |
| `wk1-boundary` | 通过 | public Contract / package entrypoint；Project Catalog 零 direct binding SQL；owner 文件均低于 500 行；boundary gate 通过 |
| `wk1-legacy-exit` | 通过 | 原 1,324 行 Registry 降为 8 行 re-export；content store / core types 退出旧目录；binding schema / mapping / SQL 退出 Catalog |
| `wk1-result` | 通过 | 35 项定向回归、2 项 public module 测试、515 项全量回归覆盖创建、隔离、关联、关闭保留、重启和删除相关行为 |

## 后续边界

- WK2：迁移 Runtime Host、Codex / PTY provider 和技术 receipt，不复制 Session facts。
- WK3：迁移 Work Native Plugin、resume / Handoff 用户路径和剩余 `src/sessions/` caller；届时删除 Registry compatibility allowlist。
- 总体末轮：真实用户前端 + 后端 E2E、清理修复、重跑门禁，并对照初始架构与 Huge Class 要求做最终审计。
