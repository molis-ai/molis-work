# 最小真实评测路径合同与设计（第 30 批）

状态：已实施并随第 30 批 #2096 合入 `main`（合并提交 `ddda618006`，2026-11-15；验证头 `f1fa92ef5`）。本文原为设计定稿（2026-11-15，第 30 批 `#batch-30-item-1`，承接 [contract-design.md](contract-design.md) §1、§6 D1-Q2、§16～17，[观测和采集层需求](spec.md) §1、§2.2、§2.5、§2.6、§3、§5、§6 `OCL-12`/`OCL-13`/`OCL-14`/`OCL-17`，[主动助理需求](../proactive-assistant/spec.md) §14 `PWA-51`～`PWA-56`，以及 `BL-328` 的隔离 Home 可复现评测命令）。

---

## 1. 开工前检查（15 条与平台能力优先核对）

| 序号 | 检查项 | 核对结论 |
| --- | --- | --- |
| 1 | 需求在哪，要满足哪些验收编号 | [观测和采集层需求](spec.md) `OCL-12`（评测样本留存豁免清理）、`OCL-13`（回放来源类别隔离）、`OCL-14`（下游评测消费者读取与缺口如实呈现）、`OCL-17`（判定保留依据与来源且不改写历史事实），[主动助理需求](../proactive-assistant/spec.md) §14 `PWA-51`～`PWA-56`（完整工作评价单位、三种判定来源与复查纠正、隔离回放无外部副作用、版本前后对比与调优／独立验证分离、指标分母与阶段区分、独立漏发现依据与未曝光／未到期记 `unknown`），[评测案例](eval-cases.md) `EC-01`、`EC-02`、`EC-06`、`EC-08`、`EC-09`、`EC-16`、`EC-18`，以及 `BL-328`（隔离 Home 可复现评测命令）与 [BL-observation-b28-known-limits](../backlog/BL-observation-b28-known-limits.md) 第 ⑤ 项（`observation.db` 首次升级前确定性样本记录行验）。 |
| 2 | 事实归谁（SSOT） | 原始工作记录、证据快照、覆盖缺口与样本留存豁免表归 `horizontal/observation`（`<Home>/observation/observation.db`）；评测样本、运行前冻结的独立预期、评测器／规则版本、评测运行与结论、人工复查与纠正记录归新建横向服务 `horizontal/evaluation`（`<Home>/evaluation/evaluation.db`）；业务对象与版本仍归各插件或模块主人。任何一方不跨库直接写 SQL。 |
| 3 | 依赖方向与跨包边界 | `horizontal/evaluation` 只依赖 `@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`、`@molis-ai/molis-work-storage`；读取工作记录、证据、覆盖与登记样本留存一律经 `ActionClient` 调用 `system.observation` 的公开 `@1` 动作（`use: "evaluation"`），不 import `horizontal/observation` 内部实现（仅隔离回放在宿主薄装配中注入 `withObservationSource("replay", ...)` 端口），也不 import 任何插件实现。 |
| 4 | 平台能力优先检查（开发流程 §4.1） | 能力目录、权限校验与调用结算复用 `packages/kernel` `ActionService`；观测证据、覆盖登记与 `withObservationSource` 复用 `horizontal/observation`；模型调用统一经 `horizontal/agent-host`（支持替身模型与 Gemini 系列 OpenAI 兼容接口真实调用），不在评测服务或 CLI 内直连供应商 SDK 或自写 HTTP 模型循环。 |
| 5 | 公开合同变化 | 扩展 `packages/contracts/src/services/observation.ts`（新增 `observation.holds.put@1`、`observation.holds.release@1`、`observation.holds.list@1`）；新建 `packages/contracts/src/services/evaluation.ts`（`io.molis.work.service.evaluation.v1`，`system.evaluation` 公开动作集合）。同步更新 `tooling/versions.json`、`pnpm versions:generate`、`pnpm api:update`、`pnpm actions:update`。 |
| 6 | 库结构与连续升级（U1） | ① `<Home>/observation/observation.db` 由基线 `1` 升到 `2`（`OBSERVATION_BASELINE` 新增 `1 → 2` 升级段，建 `evaluation_holds` 与 `evaluation_hold_records` 表；金样 `0.1.1-dev.4` 已持有 v1 库，补确定性 v1 含记录与加密证据样本升级测试，同步收口 `BL-observation-b28-known-limits` ⑤）；② 新建 `<Home>/evaluation/evaluation.db` 基线 `1`（`EVALUATION_BASELINE`），登记进 `home-stores.ts`、`platform-upgrade-stores.ts`、`CHECKLIST.md`、`HOME-DATA.md`、`CONTRACT-CHANGES.md`、`golden-coverage.json` 与 `pnpm schemas:update`。无读取期兜底历史取值。 |
| 7 | 可信身份与跨项目边界 | 所有 `observation.holds.*@1` 与 `evaluation.*@1` 动作从可信 `ActionExecutionContext` 取 `actor_id`、`audience`、`project_id`；`use: "evaluation"` 关闭时立即拒绝 `observation.use_disabled`（`OCL-11`）；非本人受众遵守 `S-74` 跨项目边界；管理、样本写入、人工复查与回放仅对本人（`audiences: ["user"]`）开放。 |
| 8 | 取消、撤权与并发 | 评测运行若执行隔离回放或模型调用，遵守 `AbortSignal` 取消与 `withObservationSource("replay", ...)` 作用域；取消后不提交半截完成结论，已写入的 `replay` 观测记录保持 `source_class = "replay"`，不进入 `"real"` 统计。 |
| 9 | 安全不变量与拒绝测试 | 扩充 `S-observation-records`（留存动作的本人受众、`use: "evaluation"` 关闭拦截、跨项目隔离、删项目与清除插件数据优先于样本留存），并补 `tests/security-invariants-evaluation.test.ts`（评测结论与人工纠正不改写原记录与业务库、回放阻断外部副作用且不混入真实工作查询、CLI 拒绝指向真实 `~/.molis-work`）。 |
| 10 | 界面与页面资源影响 | 本批界面要求为「无需新增产品 UI」；删项目登记 `EVALUATION_OWNER` 采用 `label: null`，不触碰 `apps/workbench` 启动词包与前端 bundle，页面资源增量为 0。 |
| 11 | 宿主薄装配（C3） | `apps/local-host/src/evaluation-host.ts` 仅做薄装配（把 Home 路径、系统时钟、`ActionClient` 与 `withObservationSource("replay", ...)` 注入 `EvaluationService`，注册 `system.evaluation` 提供方，接入删项目与 `close()`），全部评测状态机与规则留在 `horizontal/evaluation`。 |
| 12 | 模型设置与隔离 Home CLI | 命令行入口 `scripts/run-evaluation.mts`（`pnpm eval:run`）严格拒绝 `~/.molis-work` 及其父子路径；默认创建一次性临时 Home 并在 `finally` 删除。支持 `--mode stand-in`（零外部成本，跑真实插件与替身模型端到端工作＋隔离回放＋双次复现核对）与 `--mode live`（默认按用户要求配置 **Gemini 系列模型**：`openai-chat-completions` + `https://generativelanguage.googleapis.com/v1beta/openai` + 默认 `gemini-2.5-flash`，支持切换 `gemini-2.5-pro` 等；内联读取 `GEMINI_API_KEY`／`MOLIS_EVAL_API_KEY` 仅写入临时 Home 的文件密钥库 `MOLIS_WORK_SECRET_BACKEND=file`，不碰钥匙串、不打日志）。 |
| 13 | 门禁影响 | `table-owners` 0 违规、`store-schemas`／`store-versions`／`golden-homes`／`backlog-rows`／`backlog-refs`／`api`／`actions`／`boundary:check`／`page-assets:check`／`secrets:check` 全绿。 |
| 14 | 路线书映射与 Backlog 清理 | 收口并 `git rm specs/backlog/BL-328.md`，记入 [docs/backlog-removed.md](../../docs/backlog-removed.md) 墓碑表；更新 [BL-observation-b28-known-limits.md](../backlog/BL-observation-b28-known-limits.md) ⑤；更新 [requirements.md](../post-anticorruption-roadmap/reference/requirements.md) 中 `PWA-51`～`PWA-56`、`OCL-12`～`14`/`17` 与 `BL-328` 行。 |
| 15 | 哪些需要用户拍板 | 无。D1-Q2 已在 [contract-design.md](contract-design.md) §6 定好样本留存归第 30 批升级段，模型系列用户已明确指定按 Gemini 系列设置，无新增 UI 或保留兼容机制。 |

---

## 2. 职责切分与依赖关系

```text
apps/local-host (薄装配：evaluation-host.ts / observation-host.ts)
   ├── horizontal/evaluation (<Home>/evaluation/evaluation.db v1)
   │      ├── 样本与运行前冻结预期（tuning vs validation 分离）
   │      ├── 三种判定来源（确定性断言 / 带版本评测器规则 / 人工复查与纠正）
   │      ├── 覆盖缺口、证据缺失、未曝光、观察截止未到 → unknown（不误判 failed）
   │      ├── 版本前后对比（共同条件 vs 不可比差异 vs 六阶段定位）与队列指标汇总
   │      ├── 隔离回放执行器（经注入端口进入 withObservationSource("replay", ...)，禁外部副作用）
   │      └── 仅经 ActionClient 调 system.observation 公开动作（use: "evaluation"）：
   │             ├── observation.records.query@1
   │             ├── observation.evidence.get@1
   │             ├── observation.coverage.get@1
   │             └── observation.holds.{put,release,list}@1
   └── horizontal/observation (<Home>/observation/observation.db v1 → v2)
          └── evaluation_holds + evaluation_hold_records（豁免到期自动清理与手动清理；删项目与清插件数据仍优先删除）
```

---

## 3. 采集层样本留存合同（`observation.db` `1 → 2` 与 `observation.holds.*@1`）

### 3.1 表结构升级（`OBSERVATION_BASELINE` `1 → 2`）

在 `<Home>/observation/observation.db` 新增两张表，归 `horizontal/observation` 唯一读写：

```sql
CREATE TABLE evaluation_holds (
  hold_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  note TEXT
);
CREATE INDEX evaluation_holds_sample ON evaluation_holds (sample_id);
CREATE INDEX evaluation_holds_project ON evaluation_holds (project_id);

CREATE TABLE evaluation_hold_records (
  hold_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  seq INTEGER,
  PRIMARY KEY (hold_id, record_id)
);
CREATE INDEX evaluation_hold_records_seq ON evaluation_hold_records (seq);
CREATE INDEX evaluation_hold_records_record ON evaluation_hold_records (record_id);
```

- **有效留存（active hold）**：`expires_at IS NULL OR expires_at > :nowIso`。默认留存天数采用 `OBSERVATION_RETENTION_NEEDS.evaluation_samples`（120 天），调用方可传显式 `expires_at` 或 `null`（长期回归样本留存）。
- **清理豁免（`OCL-12`、`EC-16`）**：
  - `previewCleanup` 与 `applyCleanup` 在筛选候选记录时，将处于有效留存内的 `seq` 从待删集合剔除，按去重 `sample_id` 计入 `preserved.evaluation_samples_count`；因为留存记录本身不被删除，`record_evidence` 仍引用其 `evidence_blobs`，`collectUnreferenced` 自然保留对应加密证据快照，重评时仍可解封。
  - `sweepExpiredRecords`（自动保留期清扫）同样跳过处于有效留存内的 `seq`。
  - `settings.get@1` 的 `evaluation_holds` 字段实时统计有效留存覆盖的去重评测样本数 `count` 与其关联行及证据快照字节数 `bytes`。
- **用户删除权优先（`OCL-12`）**：
  - 删除项目（`clearProject`）删除该 `project_id` 下的 `evaluation_hold_records` 与项目专属 `evaluation_holds`，原项目记录与快照照常彻底清除。
  - 卸载并清除插件数据（`purgePlugin`）将被清除记录对应的 `evaluation_hold_records.seq` 置空并解除 `record_evidence` 引用，已清除插件的内容与快照不因评测留存残留。

### 3.2 新增公开动作（`system.observation`）

- `observation.holds.put@1`（`command`，`scope: "home"`，`audiences: ["user"]`）：按 `hold_id` 幂等创建或更新留存（`sample_id`、`owner`、`record_ids`、`project_id?`、`expires_at?`、`note?`）。校验 `use: "evaluation"` 处于开启状态（否则拒 `observation.use_disabled`）；核对 `record_ids` 在当前 `records` 表中的存在性与项目归属，返回实际留存的 `held_record_ids`、已缺失／不存在的 `missing_record_ids` 及留存摘要。
- `observation.holds.release@1`（`command`，`scope: "home"`，`audiences: ["user"]`）：按 `hold_id`（或 `sample_id`）释放留存，释放后记录回到常规保留期与手动清理范围。
- `observation.holds.list@1`（`query`，`scope: "home"`，`audiences: ["user"]`）：按 `project_id`、`sample_id`、`include_expired` 列出留存条目及其有效记录数。

---

## 4. 评测服务合同（`packages/contracts/src/services/evaluation.ts`）

### 4.1 样本与运行前冻结预期（`EvaluationSample`）

- **样本标识与冻结语义（`PWA-52`）**：每份样本以 `(sample_id, version)` 唯一冻结预期。同版本号重复写入若预期内容不同则拒绝 `evaluation.sample_version_immutable`（幂等相同内容放行）；修改预期或评分标准必须递增 `version`，历史运行永久绑定当时的 `sample_version` 与冻结快照。
- **用途分离（`PWA-54`）**：`purpose: "tuning" | "validation"` 必填。`tuning` 用于开发调优与案例迭代，`validation` 用于独立验证；队列汇总指标默认按 `purpose` 过滤或分桶，禁止把 `tuning` 样本混入独立验证通过率。
- **独立机会依据（`PWA-56`、`PWA-125`）**：可选 `opportunity_basis` 记录独立于助理输出的候选机会来源（`independent_fixture` / `human_audit` / `rule`）、期望姿态（`act` / `clarify` / `continue` / `quiet`）及候选对象引用，使“应发现而漏掉”和“识别后保持安静”都能独立判定，不在助理自己输出的建议分母里算发现率。
- **六阶段定位（`PWA-51`）**：每条预期绑定 `stage: "understanding" | "materials" | "skill" | "interaction" | "execution" | "delivery"`，定位失败或版本差异发生在哪个环节。
- **三种判定来源（`PWA-52`）**：
  1. `deterministic`（确定性事实断言）：直接核对采集记录、已解析业务对象状态、调用树关联、阶段先后顺序、证据解封内容或脱敏标记、多个不同 `owner_version_ref`、自述成功但无业务落库拦截（`no_self_certifying_success`）、呈现到采用分阶段核对（`stage_separation`）。
  2. `evaluator`（带版本与规则的评测器判断）：显式声明 `evaluator_id`、`evaluator_version`、`rubric` 与结构化检查规则（如期望姿态、允许的合理差异 `allowed_variations`、禁止行为如泄露被拒输入或越界读取、必须引用的材料／Skill 版本），输出结论时完整保留 `evaluator_id`、`evaluator_version`、判定依据与引用的证据编号，与被评场景 Skill 完全解耦。
  3. `human_reference`（人工评价基准／待复查项）：声明人工复查要点与参考结论；尚未收到人工复查记录时，判定保持 `unknown`（原因 `awaiting_human_review`），不假装自动通过或失败。

### 4.2 未知与失败的严格区分（`OCL-08`、`OCL-14`、`PWA-55`、`PWA-56`）

每条预期和整次运行的结果 `verdict` 取值闭集：`passed` | `failed` | `unknown`。

以下情形**必须**判为 `unknown` 并记录结构化 `unknown_reasons`，绝不归为 `failed` 或用户拒绝：
- `coverage_gap_expired`：查询时间窗或样本关联范围内存在 `expired` 清理缺口且所需记录不在留存集中；
- `coverage_gap_paused`：范围内存在暂停记录缺口或当前处于暂停导致关键阶段未采集；
- `coverage_gap_purged`：相关插件数据已被用户清除（`purged`）；
- `coverage_gap_lost`：存在写入失败、队列丢弃、意外退出、配额耗尽或密钥不可用导致的 `lost`／`unavailable`／`not_connected` 缺口；
- `evidence_missing`：记录存在但所需证据快照因 `expired`／`purged`／`not_obtained`／`truncated` 无法核对正文；
- `unexposed`：建议或候选仅生成但没有实际呈现／曝光记录（`ui.present` / `ui.dwell` 等），用户反馈阶段未知；
- `window_incomplete`：样本声明的观察截止时刻 `observation_cutoff_at` 晚于当前评测时间 `evaluated_at`，尚未到后续采用／返工观察窗口终点；
- `awaiting_human_review`：包含未完成人工复查的 `human_reference` 预期。

只有当证据覆盖充分、观察窗口满足要求，且实际行为违反预期（例如动作失败未恢复、越界报错、漏掉独立机会、未曝光外自称已完成、返工推翻原交付等）时，才判为 `failed`，并保留失败阶段 `failed_stages`、原记录 `outcome` 与具体证据引用。

### 4.3 人工复查与纠正（`OCL-17`、`PWA-52`）

- `evaluation.reviews.record@1` 追加一条不可变的人工复查记录（绑定 `run_id`、可选 `expectation_id`、复查结论 `passed | failed | unknown`、问题阶段与说明、引用的 `record_ids`）。
- 读取运行详情（`evaluation.runs.get@1`）时同时返回：
  - `automated_verdict`（原始断言与评测器结论，原样保留）；
  - `human_reviews`（按时间排列的人工复查链）；
  - `effective_verdict`（合入人工纠正后的当前有效结论及决定来源 `source: "automated" | "human_review"`）。
- 全程**零写入** `observation.db` 与任何插件库（`OCL-17`）。

### 4.4 隔离回放（`OCL-13`、`PWA-53`、`EC-18`）

- 隔离回放通过 `EvaluationService` 的受控回放入口在 `withObservationSource("replay", ...)` 内执行：
  1. 回放产生的一切动作调用、Agent 轮次与上报事实均由采集层自动打上 `source_class = "replay"`；默认面向真实工作的查询（`include_simulated` 未开）与周期报告、偏好学习自动排除这些记录（`PWA-83`）。
  2. 回放上下文显式标记 `execution_kind: "isolated_replay"`（或搭配真实模型时标 `live_model` + `replay_isolated: true`），与对既有真实记录的 `evidence_audit`、`simulated`、`live_model` 严格区分，禁止混充（`PWA-53`）。
  3. 回放运行器提供只读材料快照／隔离临时项目与外部副作用拦截门（任何外部连接器发送／发布／购买／删除动作在回放门内被确定性拦截并记录拦截回执，绝不触发真实外部网络写操作）。
  4. 重评或回放生成新的 `run_id`，原样本指向的历史真实记录与旧 `run_id` 结论一字不改。

### 4.5 公开动作清单（`system.evaluation`）

| 动作 | 种类 | 说明 |
| --- | --- | --- |
| `evaluation.samples.put@1` | `command` | 登记或升版一份评测样本与冻结预期；若 `hold_records: true` 且给定关联记录或查询到匹配记录，自动经 `observation.holds.put@1` 建立留存 |
| `evaluation.samples.list@1` | `query` | 按 `project_id`、`purpose`（`tuning` / `validation`）、`work_mode` 列出样本最新版本或指定版本 |
| `evaluation.samples.remove@1` | `command` | 移除样本定义，并可选释放其在采集层的 `evaluation_holds`（历史运行记录保留可查） |
| `evaluation.runs.execute@1` | `command` | 对指定 `(sample_id, version?)` 执行一次基于采集证据的评测（或触发已登记的隔离回放方案），落盘可追溯结论 |
| `evaluation.runs.get@1` | `query` | 读取单次评测运行的完整证据链、逐条预期判定、未知／缺口原因、自动结论、人工纠正链与有效结论 |
| `evaluation.runs.list@1` | `query` | 按样本、项目、`purpose`、`execution_kind`、`verdict` 查询历史评测运行 |
| `evaluation.runs.compare@1` | `query` | 对比同一 `sample_id` 的两次运行（如平台、模型、Skill 或插件版本更新前后），输出 `shared_conditions`、`incomparable_differences` 与按六阶段归因的 `stage_diffs`（`PWA-54`） |
| `evaluation.reviews.record@1` | `command` | 记录人工复查或纠正结论，保留依据且不改写原观测事实与原自动结论（`PWA-52`、`OCL-17`） |
| `evaluation.metrics.summarize@1` | `query` | 按时间窗、`purpose`、工作方式、插件与版本汇总样本量、分母、可评测比例、缺失／未知原因分布、各类结局计数（含失败、拒绝、无响应、接管、正确不行动）与曝光→查看→选择→执行→完成→持续采用分阶段漏斗（`PWA-55`） |

---

## 5. 内置代表性真实评测样本集与隔离 Home 命令（收口 `BL-328`）

1. **内置标准评测样本集（`scripts/evaluation/suite.mts`）**：
   直接对齐 [eval-cases.md](eval-cases.md) 与主动助理 §14，覆盖不同工作方式与结局：
   - `ec-01-pages-evolution`（Pages 多版本修订与成果发布链路，核对同一工作流中两个独立对象版本、`owner` 引用实时可解析性与修订输入快照）；
   - `ec-02-model-round`（Prologue 真实模型回合完整事实序列＋带版本评测器规则核对中文摘要要点与等价变化）；
   - `ec-02-no-self-cert`（`tuning` 组：底层动作失败时拦截模型自证成功，并配 `human_reference` 人工复查只追加评测库不改写历史记录）；
   - `ec-06-quiet-restraint`（独立机会依据下专注编辑期间保持 `quiet` 姿态、不打扰不计负向率）；
   - `ec-08-unexposed-opportunity`（尚未向用户曝光的机会严格归入 `unknown` `unexposed`，不补成失败）；
   - `ec-09-interleaved-isolation`（主次 `work_ref` 穿插执行时不串用调用号或目标对象）；
   - `ec-16-held` 与 `ec-16-unheld`（7 天到期清理后，挂 `evaluation_holds` 的回归样本完整存活判 `passed`，未留存样本因 `coverage_gap_expired` 如实判 `unknown`）；
   - `ec-18-replay-compare`（`tuning` 组隔离回放阻断外部副作用、保持 `source_class: "replay"` 与真实工作查询隔离，并完成前后两版六阶段差异对比 `materials` 由 `failed` 提升至 `passed`）。

2. **隔离 Home 可复现 CLI（`scripts/run-evaluation.mts`，`pnpm eval:run`）**：
   - **安全护栏**：检查 `--home`、`MOLIS_WORK_HOME` 与默认路径，凡解析后等于、包含或位于真实 `~/.molis-work` 下立即拒绝退出（附测试钉死）；默认在系统临时目录创建一次性 `<tmpdir>/molis-eval-<uuid>`，结束时无论成败自动清理（传 `--keep-home` 仅允许保留在显式非真实临时目录供排查）。
   - **两种运行模式**：
     - `--mode stand-in`（默认）：在隔离临时 Home 启动真实 `MolisWorkLocalHost` 与 Prologue Runtime，驱动真实插件（Pages、Todo）、模型回合、并发交错、清理与留存、以及隔离 `replay`，跑完内置样本集＋版本前后对比＋人工纠正演练，并支持 `--verify-reproducible` 连跑两轮独立临时 Home 校验可复现摘要（`reproducibility_digest`）100% 一致。
     - `--mode live`（真实模型模式，默认 **Gemini 系列**）：默认设置 `api_format = "openai-chat-completions"`、`base_url = "https://generativelanguage.googleapis.com/v1beta/openai"`、`model = "gemini-2.5-flash"`（可通过 `--model gemini-2.5-pro` 等参数切换任意 Gemini 模型）；从环境变量 `GEMINI_API_KEY`（或 `MOLIS_EVAL_API_KEY`）单次内联读取密钥，仅写入临时 Home 的文件密钥库（`MOLIS_WORK_SECRET_BACKEND=file`）并配置隔离模型提供方，经 `AgentHost` 跑真实模型轮次后用同一套 `system.evaluation` 判定并输出结构化报告；未提供密钥时明确输出 `SKIP:`（加 `--require-live` 则非零退出拒绝）而不静默伪造通过。
