# Evaluation（端到端工作评测）

`horizontal/evaluation`（`@molis-ai/molis-work-service-evaluation`）是平台的端到端工作评测服务，提供方 ID 为 `system.evaluation`。

- **权威设计**：[`specs/observation-collection/evaluation-path-design.md`](../../specs/observation-collection/evaluation-path-design.md)
- **需求条款**：[`specs/proactive-assistant/spec.md`](../../specs/proactive-assistant/spec.md)（`PWA-51`～`56`）、[`specs/observation-collection/spec.md`](../../specs/observation-collection/spec.md)（`OCL-08`、`OCL-12`～`14`、`OCL-17`）
- **合同定义**：[`packages/contracts/src/services/evaluation.ts`](../../packages/contracts/src/services/evaluation.ts)

## 核心职责与边界

1. **只经公开合同消费采集层**：所有工作记录、证据快照、覆盖缺口与样本留存均通过注入的 `ActionClient` 调用 `observation.*@1`（携带 `use: "evaluation"`），不直连 `observation.db`，也不建立第二套埋点。
2. **样本冻结与用途分离（`PWA-54`）**：样本按 `(sample_id, version)` 计算规范化 SHA-256 摘要冻结，任何预期、窗口或基线条件变动必须升版本号；`purpose: "tuning"` 与 `purpose: "validation"` 在汇总与版本对比中严格分离。
3. **三类判定来源与不可覆盖链（`PWA-52`、`OCL-17`）**：支持确定性规则（`deterministic`）、带版本与等价变体白名单的评估器规则（`evaluator`）以及人工准则参考（`human_reference`）；`evaluation.reviews.record@1` 只追加 `evaluation_reviews` 并叠加 `effective_verdict`，保留 `automated_verdict`，绝不改写采集层记录或插件业务表。
4. **未知与失败分离（`OCL-08`、`OCL-14`、`PWA-55`、`PWA-56`）**：覆盖缺口（到期清理、暂停、清除、丢失）、证据缺失、窗口未结束、未曝光与待人工复查统一归入 `unknown` 并记录结构化原因，不冒充通过或失败。
5. **隔离回放（`PWA-53`、`OCL-13`、`EC-18`）**：`isolated_replay` 在 `source_class: "replay"` 作用域内运行，拦截外部连接器／发送类副作用，回放记录不混入真实工作统计。

## 隔离 Home 可复现评测命令（`BL-328`）

仓库根脚本 `pnpm eval:run`（[`scripts/run-evaluation.mts`](../../scripts/run-evaluation.mts)）提供最小隔离 Home 评测运行入口：

- `pnpm eval:run`：默认 `--mode stand-in`，在全新临时 Home（强制 `MOLIS_WORK_SECRET_BACKEND=file`）启动真实 `MolisWorkLocalHost`、插件运行时、Prologue 推理与 `system.observation`／`system.evaluation`，跑完内置代表性端到端套件后自动删除临时 Home。
- `pnpm eval:run --verify-reproducible`：在两个独立隔离 Home 连续运行并校验规范化判定摘要完全一致。
- `pnpm eval:run --mode live`：默认按 Gemini 系列（`--model gemini-2.5-flash`、`--base-url https://generativelanguage.googleapis.com/v1beta/openai`、`--api-format openai-chat-completions`）内联读取 `GEMINI_API_KEY`（或 `MOLIS_EVAL_API_KEY`），密钥只进临时 Home 文件凭据库并对报告脱敏，严拒读写 `~/.molis-work`。
