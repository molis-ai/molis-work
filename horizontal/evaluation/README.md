# 基于真实工作记录的端到端评测

评测服务（`system.evaluation`）：基于采集层（`system.observation`）公开动作读取真实工作记录、证据快照、覆盖登记与样本留存，执行冻结样本判定、六阶段跨版本对比、隔离回放、人工复查追加与按用途分桶的指标汇总。

包名：`@molis-ai/molis-work-service-evaluation`。工作区内部包，由 Host 装配使用。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/service.ts](src/service.ts) | `EvaluationService`：全部 `evaluation.*@1` 公开动作、懒打开与项目删除清理入口 |
| [src/run-executor.ts](src/run-executor.ts) | 单次评测运行编排：读取／回放采集、规则判定、未知原因归拢与留存衔接 |
| [src/observation-bridge.ts](src/observation-bridge.ts) | 经 `ActionClient` 调用 `system.observation`（`use: "evaluation"`）读取记录、证据、覆盖与管理留存 |
| [src/store.ts](src/store.ts) | `<Home>/evaluation/evaluation.db` 读写：样本版本冻结校验、运行入库、人工复查追加与项目删除清理 |
| [src/rules.ts](src/rules.ts) | 三类判定规则引擎（确定性检查、带标识与版本的评估器、人工对照标准）及证据追溯指针 |
| [src/unknown-and-funnel.ts](src/unknown-and-funnel.ts) | 覆盖缺口与窗口未完转化为 `unknown`、呈现→查看→采用→返工分阶段漏斗计数与运行条件提取 |
| [src/comparison-and-metrics.ts](src/comparison-and-metrics.ts) | 跨版本六阶段对比（`understanding`～`delivery`）与按 `tuning`／`validation` 分桶的群体指标汇总 |
| [src/replay.ts](src/replay.ts) | 隔离回放执行器：进入 `replay` 来源作用域并阻断外部发送与连接器副作用 |
| [src/errors.ts](src/errors.ts) | `evaluation.*` 动作错误码工厂 |
| [src/schema.ts](src/schema.ts) | 库 `<Home>/evaluation/evaluation.db` 的建表基线 |

设计与取舍见 [specs/observation-collection/evaluation-path-design.md](../../specs/observation-collection/evaluation-path-design.md)。

交付判定可以用 `evidence_source` 固定事实及正文角色。模型回复只在 `agent.reply` 的 `reply` 正文里核对词语。运行的执行和完成数按项目、安装、事实主人和工作引用去重。定时会话的工作引用来自 Schedule 保存的结果轮次。同一件交付被不同样本引用或重复评测，在汇总漏斗中只计一次。呈现和选择按工作与候选分开统计，采用和撤回按主人回执识别。`excluded_execution_runs` 统计缺少执行与完成身份依据的运行。汇总经工作记录的评测用途重读本轮回放回执或逐项预期所引的记录。六个互动阶段分别按已查实的身份去重。某阶段的原次数超过能查实的身份数时，汇总保留剩余次数，并在 `funnel_totals.unattributed_interactions` 单列这部分。各阶段的总数减去这部分，就是有身份依据且已跨运行去重的数量。

指标中的 `selected_sample_count` 包含窗口结束前已登记、目前仍可用的样本以及窗口内评过、之后移除的样本。`sample_count` 是该窗评过的不同样本数，`denominator`、`evaluable_count` 和 `verdict_counts` 按评测尝试计，`work_outcome_counts` 汇总各次运行读到的原始记录结局。

## 当前限制

- 证据快照目前逐条调用 `observation.evidence.get@1`；一个有 N 条证据记录的大样本会产生 N 次动作调用（记录查询本身已分页，且默认读完整个样本，不再停在 500 条）。批量解封需要 observation 提供新的公开读取动作，记 [BL-evaluation-read-cost](../../specs/backlog/BL-evaluation-read-cost.md)。
- 隔离回放阻断的是外部连接器、发送/发布和外部 MCP 写；场景内的本地业务写按设计要在隔离临时项目里做，不能把“外部无副作用”理解成“任何写都不发生”。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24.15+ 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-service-evaluation run build
```

```bash
node scripts/run-tests.mjs tests/evaluation-service.test.ts tests/security-invariants-evaluation.test.ts
```

## 开发要求

- 负责：`<Home>/evaluation/evaluation.db`（`evaluation_samples`、`evaluation_runs`、`evaluation_reviews`），以及 `evaluation.samples.{put,list,remove}@1`、`evaluation.runs.{execute,get,list,compare}@1`、`evaluation.reviews.record@1`、`evaluation.metrics.summarize@1` 九个动作、隔离回放外部副作用门卫与删项目时的评测记录清理。
- 不负责：原始工作记录、证据密文、覆盖登记与样本留存本身（归 `horizontal/observation`）；任何插件业务事实与成果库（归各自事实主人）；模型执行核（归 `horizontal/agent-host`）。
- 公开入口：`@molis-ai/molis-work-service-evaluation`（`src/index.ts`）；合同 `@molis-ai/molis-work-contracts/services/evaluation`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`、`@molis-ai/molis-work-storage`。依赖方向只向下：不 import `apps/`、任何插件包或另一个横向服务的实现（隔离回放作用域由宿主通过 `runInReplayScope` 端口注入）。
- 不变量：
  - 只经公开动作读取采集层：读取记录、证据、覆盖与管理样本留存一律经注入的 `ActionClient` 调用 `observation.records.query@1`、`observation.evidence.get@1`、`observation.coverage.get@1`、`observation.holds.{put,release}@1` 并传 `use: "evaluation"`，绝不直连 `observation/observation.db`（安全不变量 `S-evaluation-isolation`）。
  - 样本版本冻结不可变（`PWA-54`）：同一 `(sample_id, version)` 写入不同预期、窗口或基线条件拒 `evaluation.sample_version_immutable`；调优（`tuning`）与独立验证（`validation`）分开汇总与对比，不得混算。
  - 未知与失败严格区分（`OCL-08`、`OCL-14`、`PWA-55`、`PWA-56`）：到期清理、暂停记录、插件清除、记录丢失、证据缺失、观察窗口未结束、未向用户曝光及待人工复查一律报 `verdict: "unknown"` 与结构化 `unknown_reasons`，不归入 `failed` 或 `passed`。
  - 人工复查追加不覆盖自动结论、不回写历史事实（`PWA-52`、`OCL-17`）：`evaluation.reviews.record@1` 只向 `evaluation_reviews` 追加记录并更新 `effective_verdict`（保留 `automated_verdict`），绝不改动采集层记录或插件业务表。
  - 隔离回放阻断外部副作用（`PWA-53`、`OCL-13`、`EC-18`）：`isolated_replay` 运行在 `source_class: "replay"` 作用域内并拒绝 `external: true` 或连接器写动作（`evaluation.replay_external_effect_blocked`），不混入真实工作查询与统计。
  - 库在首次调用 `evaluation.*@1` 时懒打开，不在宿主启动时创建空库；删除项目时清除该项目关联的样本、运行与人工复查记录。
- 改动后必跑：`node scripts/run-tests.mjs tests/evaluation-service.test.ts tests/security-invariants-evaluation.test.ts tests/action-contract-snapshot.test.ts`
- 相关手册：[docs/horizontal/evaluation.md](../../docs/horizontal/evaluation.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
