# Prologue A0、A1 与早期采用验证

原 §5.5–5.6a 和 §6.0–6.0c。包括证据等级、验证缺口、候选包与暂停点。

[返回需求书](spec.md)

- [5.5 A0 最小基础采用交接（2026-10-11 核查）](#55-a0-最小基础采用交接2026-10-11-核查)
- [5.6 A0 后的下一完整切片 A1：模型控制与逐轮展示](#56-a0-后的下一完整切片-a1模型控制与逐轮展示)
- [5.6a A1 改为核对 #472（2026-10-13）](#56a-a1-改为核对-4722026-10-13)
- [6.0 A0 收口记录（2026-10-12，当前状态）](#60-a0-收口记录2026-10-12当前状态)
- [6.0a 对账与过渡包（2026-10-13 晚）](#60a-对账与过渡包2026-10-13-晚)
- [6.0b 现状核对（2026-10-14）](#60b-现状核对2026-10-14)
- [6.0c 暂停点（2026-10-14，用户让需求线先停、防腐线先走）](#60c-暂停点2026-10-14用户让需求线先停防腐线先走)

## 5.5 A0 最小基础采用交接（2026-10-11 核查）

**交付边界**：下一位 writer 从最新已接受的 Molis 主线建干净工作树，按以下提交提取必要改动，交付可验证的基础采用 diff。不要在含他人未提交 yield 补丁的采用树直接整树合并，也不要把旧 spec 覆盖回本文。A0 的目标是基础能力功能可用，并解除输入回执 D7 的 SDK 采用依赖；不是统一协作内部完整。P1 合同设计可独立推进，A0 不等它完成；Molis main 合入后才算 D7 的前置满足，候选实现不等于已满足。源码写入、构建和浏览器时段仍由统筹安排；S1 工程收尾已被统筹接受，当前唯一源码 writer 已转交本线。

### 提交取舍与顺序

| 顺序 / 来源提交 | 下一位 writer 取什么 | 明确不随本刀纳入 |
| --- | --- | --- |
| 1 · Prologue `c4b9fde3`（基于 `4f7110fe`） | 微压缩只收可再读观察；独占 owner 重开清理残留写声明；App 接手 yield 完成通知。三项源码、测试与对应上游需求一起核实，按 §3.2 先满足上游合主线条件再作为 Molis main 的包来源 | `onYieldSettled` 可存在于 SDK，但 A0 的 Molis 不启用新的自动唤醒 |
| 2 · Molis `77fde1040` | 新 SDK 依赖、预算参数合并、状态/事件投影、工具副作用分类、yield 安全拒绝、命令扩权审查及对应用例 | 旧包路径/锁文件不原样覆盖主线；原始 spec 不覆盖修订版 |
| 3 · `da9ddd994` | 前项对应的 Agent Host、合同和 Coding 展示拆分；在当前主线已有拆分上落位，必要 helper 随调用链一起带入 | 历史评估文档不是运行依赖，不为复刻旧提交搬运；不得恢复已删 CLI adapter 或旧 Runtime 状态 |
| 4 · `804384d8a`、`5a4d6feba` | 派出前拒绝、副作用、记忆伪标记测试；包登记中的 SDK 路径随实际包更新 | 不用旧测试覆盖主线后续断言，不把只读回归的通过当成统一协作验收 |
| A0 后独立保留 · `ceac00a2b` + `4d90a1b4f` | 推理力度、运行中换模型、模型控件和逐轮变更后续展示验收 | 不是输入回执/S1 的前置，不塞入 A0 的设置、路由与模型合同改动 |
| A0 后独立保留 · `65d6c3e13` | 灵光流式预览、取消和最终保存校验 | 不延长 A0，不新增旧式 native HTTP 装配路径 |
| A0 后独立保留 · `b3235bb1b` + `8c0b60fb3` | 助理与 Schedule 变化观察传输及公开入口测试；最终订阅统一事实 | 不带进另一套等待/唤醒 owner；助理拆分按届时防腐落点接入 |
| 排除 · `8b1a05220` 与未提交 Coding yield 补丁 | 只作 P3/P4 的需求样本：结果报告、成果引用、交回场景和 UI 文案可重新采用 | `handed_back_run` / `hand_back_held`、私有恢复扫描/自动启动、`yield:<session>` 与 busy/retry 接续均不进 A0 |

前三个 Molis 主提交形成一条依赖链；`da9ddd994` 的拆分不能单独拿成与前项无关的清理。提交号是核对来源，不是可盲目 cherry-pick 的批次。采用树当前 8 处源码/快照修改及 5 个未跟踪源码/测试均保留，不重置、不删除。

### SDK 依赖判断

| 项目 | A0 / 后续消费关系 | 接入时处理 |
| --- | --- | --- |
| S1 输入回执 | **不是 A0 前置**，也不依赖带类型问询或统一 TaskBoard。它提供当前 Run 的 `SteerInput` key/source/about、读到回执、撤回与投影；跨 Run 排队 S2 不在 S1 内 | `prologue-input-receipts` 的 HEAD 为 `4f7110fe`，完整未提交 S1 已由统筹验收，来源树冻结；本轮在独立树与 `c4b9fde3` 组合验证。仍不等于已在 main；合成若有独立合同冲突，可先交 A0 |
| `ask-user-fields=a06ae62e` | 基于 `c4b9fde3` 的题型增强；**不是 A0 或 S1 前置**，是跨插件 AI 线正式接题型的依赖 | 可在自身验收和包消费者通过后合包，但不因“顺便升级”隐式承诺 UI 已接通，不阻塞 A0 |
| Computer Use | Grok 原线单独负责，本刀无依赖 | 不把它的未提交源码或 SDK 合同纳入本刀 |

S1 与 `c4b9fde3` 实际共改 `agent/core/compaction-history.ts`、`agent/core/loop-tools.ts`、`composition/core/agent-run-collaborators.ts`（均在 `packages/sdk/src/`），以及两个切片索引；必须同时保住输入 key/读到回执与不可重做回执的压缩语义。S1 与问询提交共改 SDK `index.ts`、公开 API 快照与切片顺序，需重新生成合成后的公开面；仅没有文本冲突不足以证明消费合同正确。合成包来源必须记最终真实提交及构建步骤，不把 `c4b9fde3` 的包标成已含 S1。共享 SDK 源码由完成 S1 后的指定 writer 串行处理。

### A0 文件范围

以下是依据前四个 Molis 提交推导的允许范围，文件落点以当前防腐结构为准；若文件已拆分，先在本文更新对应落点再实现。不开放整目录任意重构。

| 责任 | 允许路径 |
| --- | --- |
| SDK 装配与依赖 | `horizontal/agent-host/package.json`、`pnpm-lock.yaml`、`scripts/workspace-packages.mjs`；`vendor/prologue-sdk/` 中实际采用包、对应 `.sha256` / `.provenance.json`、README；替换旧包时同步 `patch-history.json`，不保留失效旁证 |
| Host 适配 | `horizontal/agent-host/src/adapters/` 下 `prologue-action-gateway.ts`、`prologue-action-tools.ts`、`prologue-credentials.ts`、`prologue-documents.ts`、`prologue-memory.ts`、`prologue-methods.ts`、`prologue-node.ts`、`prologue-run-params.ts`、`prologue-stream.ts`、`prologue-subagents.ts`、`prologue.ts`；同包 `capability-registration.ts`、`reviews.ts` |
| 公共合同 | `packages/contracts/src/services/agent-host.ts`、`agent-host-memory.ts`；按集成结果生成 `tooling/gates/api/contracts/services/agent-host.txt`，不得带入旧 Runtime 状态。A0 不新增 TaskBoard 合同出口 |
| 必要展示 | `apps/workbench/src/agent-review-surface.ts`；`plugins/native/coding/src/` 下 `client.ts`、`composer-model-client.ts`、`index.ts`、`styles.ts`、`timeline-styles.ts`、`timeline-words.ts`、`timeline.ts`、`turn-changes-client.ts`，只收前四提交所需状态/审查展示与拆分 |
| 定向测试与文档 | 下文列出的现有回归文件及与 PA-22/PA-23 对应的拒绝用例；本文、`specs/README.md` 本线行、实际变更包 README 的开发要求。不改他线 spec |
| 本轮已获授权的安全/CI 登记 | `docs/system/SECURITY-INVARIANTS.md` 仅记忆标记、命令扩权与 yield 拒绝；根 `package.json` 仅在现有 `test:security` 增加对应轻量测试；`tests/ci-product-subset.txt` 仅加入本刀合格产品用例。保留全部现有条目，不碰 S-07/S-17、数量说明与防腐在途实现，不改门禁或阈值 |
| 生成结果 | 当前集成结果确需更新的 API/动作快照、收紧后的健康基线/资产实测值。只按现行生成命令更新，不手写放宽；A0 无动作 schema 改动时不制造动作快照 diff |

A0 明确不改助理协调器/存储/客户端、Schedule runner、模型设置、灵光、Coding `routes.ts` / `run-inputs.ts`、Computer Use、输入/题型产品接入；不修改门禁脚本、阈值、豁免或冻结名单来收容旧分支。若集成证明有必要扩到这些落点，先将原因、合同和验证写回本节并由统筹重新分配共享范围，不以整分支合并绕过边界。

### 与当前主线/防腐的冲突

前序交接只读 `git merge-tree 118780596 origin/main <采用提交>`，不创建合并、不动工作树。核查的 `origin/main=9f9bda551`：

- A0 来源截止 `5a4d6feba`：**8 个文件重叠、2 处文本冲突文件**。冲突在 `specs/README.md`、`tests/coding-timeline.e2e.test.ts`；其余重叠为 `packages/contracts/src/services/agent-host.ts`、`plugins/native/coding/src/index.ts`、`pnpm-lock.yaml`、`scripts/workspace-packages.mjs`、`tests/action-before-effect.test.ts`、`tooling/gates/api/contracts/services/agent-host.txt`。锁文件/快照需从当前结果生成，自动合并不作正确性证据。
- 整个已提交采用分支截止 `8b1a05220`：27 个重叠文件、3 处文本冲突文件，多出的冲突为 `apps/workbench/src/scripts/client/assistant-island.ts`。这不是 A0 的额外文件范围，也不是未提交 yield 补丁的预演结果。
- 当前主线已删除 CLI adapter（`f07c771c9`）、`agent.runtime_missing`/health unavailable（`a5e21bd05`），并有表 owner 收口（`c07e4bd33`）、工作区 ID 收口（`747eda419`）、回环校验共享（`dadb765a6`）、Chrome testkit（`32246e7aa`）、生命周期移入 plugin SDK（`f6f73e7d0`）及 Manifest 校验迁移（`e90638794`）。保留这些现行边界；Coding 浏览器用例用当前 testkit，包登记/合同不复活已删能力，业务读写继续走 owner。
- 上述是已接受主线时间点。Claude 防腐工作区继续变化，未接受内容不复制、不宣称已经合入；writer 开始前重查最新主线、在途 PR 与共享文件，必要时重算本节，不能把本次预演当成未来零冲突保证。

### 下一位 writer 的执行与交付步骤

1. 先核查 SDK 来源：若仅 A0，验证 `c4b9fde3` 三项；若合 S1/题型，同时列出精确已接受提交。SDK 运行对应 typecheck/build，定向 `context-micro-compaction.test.ts`、`host-storage-concurrency.live.test.ts`、`subagent-writeback.test.ts` / `subagent-writeback.live.test.ts`，以及 `packaged-consumer.test.ts`；合 S1/题型时再加各自消费者/恢复测试。Molis main 采用的包满足 §3.2 上游要求后再生成来源记录。
2. 获统筹分配构建时段后，Molis 更新实际依赖和锁文件，再 `pnpm install --frozen-lockfile --offline` 验证可重装；按包 README 做检查，先整体 `pnpm build`。执行结果记 §6。
3. A0 定向回归：用 `node scripts/run-tests.mjs` 跑 `tests/model-thinking.test.ts`、`agent-budget-prologue.test.ts`、`prologue-stream.test.ts`、`prologue-status-projection.test.ts`、`prologue-storage-claims.test.ts`、`prologue-memory-boundary.test.ts`、`prologue-start-refusal.test.ts`、`prologue-subagents.test.ts`、`prologue-recovery.test.ts`、`action-before-effect.test.ts`、`assistant-business-gateway.test.ts`、`agent-review-standing.test.ts`、`agent-review-surface.test.ts`、`vendor-provenance.test.ts`（以上后续短名均在 `tests/`）。正式 yield 拒绝与零自动父 Run 启动由 `tests/prologue-adoption-guard.test.ts` 走真实回环 HTTP、生产 Node Adapter 与落盘重开验证；不把在途 `prologue-subagent-yield.test.ts` 的开放语义复制进来。
4. 申请整机唯一浏览器批次，跑 `tests/coding-timeline.e2e.test.ts`，在临时 Home 验状态、变更与扩权审查实际展示；不碰真实 Home。按 §5.4 跑当前合同/边界/健康/资产门禁，SDK 与共享 Host 变更按仓库规则在集成树整体回归一次，源码冻结期间不同时构建。失败在同批干净基线对照，不删除断言。
5. 交付来源提交/最终包、scoped diff、PA-22/PA-23 的通过/失败/未运行与原因、主线冲突处理和下一消费者入口。工程通过、临时 Home 实操与用户验收分记；不把 A0 完成报告成 PA-02–PA-21 全部完成。推送、PR、合并仍走已有授权边界；未合 Molis main 前，明确 D7 尚未解除。

## 5.6 A0 后的下一完整切片 A1：模型控制与逐轮展示

这是原第 6–8 项与 18/23 展示的接续，不开新的总需求书。本节给下一 writer 的范围，当前仍只实施 A0。来源 `ceac00a2b083272e59a4a27ba7da5e24e7a20d2c` + `4d90a1b4f97ffc08968dce34e21751f1d3f0d7e4`，基于 A0 实际结果提取，主线已有拆分/模型配置一并核对，不整提交覆盖。前置仅 A0 可用包、模型目录/凭据与派出授权入口；不依赖 TaskBoard 合同或 P4 产品闭环。

现行主线 #391 已将模型模板实现归 `apps/local-host/src/model-provider-templates.ts`，从 Host 公开入口导出 `MODEL_PROVIDER_TEMPLATES` / `modelProviderTemplate` 等；工作台公开 `ModelTemplateChoice`，设置页通过 `ModelSettingsModel.templates` 接受 Host 给出的模板。A1 必须沿这些现行入口实现，相关渲染调用显式传 templates，不把模板目录/常量搬回 contracts；旧来源提交只能提取力度与换模型行为。

允许范围按这两个提交收窄：

- Host：`horizontal/agent-host/src/adapters/` 的 `prologue-frozen.ts`、`prologue-model-switch.ts`、`prologue-node.ts`、`prologue-run-params.ts`、`prologue-stream.ts`、`prologue.ts`；同包 `capability-registration.ts`、`model-configuration.ts`。
- 模型配置/公共合同：`apps/local-host/src/configured-models.ts`、`web-model-settings.ts`、`web-request.ts`；`packages/contracts/src/modules/model-providers.ts`、`services/agent-host.ts` 及对应 API/动作生成快照。
- 必要界面：`apps/workbench/src/i18n/renderer-gap-en.ts`、`scripts/settings-models.ts`、`settings-models.ts`、`styles/settings-models.ts`；`plugins/native/coding/src/client.ts`、`composer-model-client.ts`、`routes.ts`、`route-actions.ts`、`run-inputs.ts`、`styles.ts`、`ui.ts`，逐轮展示如需修正限 A0 已有 `timeline*`/`turn-changes-client.ts`。
- 验证：`tests/prologue-model-controls.test.ts`、`coding-model-controls.e2e.test.ts`、`coding-timeline.e2e.test.ts`、`agent-action-tools-prologue.test.ts`、`assistant-business-gateway.test.ts`、`model-thinking.test.ts`；相应包 README、本文、必要生成资产尺寸（只收紧）。不改助理私有协调、Schedule、灵光、输入/题型、TaskBoard 或 SDK 包机制。

验收 `PA-24`：只对支持的模型提供力度，逐轮冻结且显式预算优先；运行中模型切换下一模型边界生效，区分请求/实际生效，下一调用使用新模型和正确凭据；不支持力度/思考、上下文缩小、cache 协议不符、撤权等拒绝零错误派出且保持原事实；重放逐轮变更不重复，浏览器展示对应真实 Run/文件变更；写前密钥拒绝与点名扩权文案如实展示。取消与冷读恢复各有行为断言，不仅检查字段。实现时在新增测试名/注释引用编号。

验证顺序：整体 `pnpm build` 后，上述五个非浏览器定向文件；`pnpm test:contracts` 与边界/健康/API/资产门禁；唯一浏览器时段跑两份 e2e，实操模型/力度选择、运行中切换与时间线。模型请求使用可计数回环服务，真实外部模型与用户体验另记。共享 Host 的集成全量由统筹安排，来源提交的历史通过不能当 A1 新基准通过。

## 5.6a A1 改为核对 #472（2026-10-13）

推理力度、运行中换模型、逐轮变更已随 #472（`ceac00a2`、`4d90a1b4`）进 main。A1 不重做，只核对 main 的实现是否满足 PA-24 与 PA-12，缺的补齐。

main 已满足（证据是 main 的用例，在对账后的树上重跑，结果见 §6.0a）：

- 力度只给设置里标了支持的模型（`model-providers.ts` 的 `reasoning_effort`，设置页勾选），逐轮冻结、每次调用都带，不支持就在发出前拒绝：`prologue-frozen.ts`；`tests/prologue-model-controls.test.ts`、`tests/coding-model-controls.e2e.test.ts`。PA-24 写的「按模型能力」实现为「人在设置里标记」，符合 §4.3 的「目录声明」。
- 显式预算优先不变：`prologue-run-params.ts`；`tests/model-thinking.test.ts`。
- 运行中换模型在下一模型边界生效，区分请求与生效，用新模型的凭据，历史不动，记下开跑模型：`prologue-model-switch.ts`；`prologue-model-controls.test.ts`；浏览器用例。
- 已测的拒绝：已结束的一轮、上下文窗口变小、带思考切到不支持思考的协议。
- 逐轮变更重放不重复：`tests/prologue-stream.test.ts`；浏览器里的行与回退、写前密钥拒绝、点名扩权文案：`tests/coding-timeline.e2e.test.ts`、`tests/agent-review-surface.test.ts`、`tests/agent-review-standing.test.ts`。

缺口（main 上的位置；按 PA-24 编号补，下一组 A1 提交在 #408 上做）：

1. 没有用例在名字或注释里写 PA-24 / PA-12。
2. `horizontal/agent-host/src/adapters/prologue-model-switch.ts` 的五个拒绝分支没有用例：提示缓存协议不符（PA-24 点名）、目标模型没标力度、视觉、模型不可用、Runtime 不支持切换。
3. 申请换模型后撤权（授权撤回、Character 停用）：下一次模型调用要在发出前拒绝，新端点零请求，没有用例。
4. 带着未生效的切换停止一轮：不向新模型发任何请求、结束的视图去掉 `requested`，没有断言。
5. 冷读：关掉再打开适配器后，运行视图仍显示 `model_switch.now` 与开跑模型，没有断言。
6. §4.3「从断点继续」后重新解析模型与凭据、不悄悄换模型：没有覆盖换过模型之后的情形。

**2026-10-13 晚的进展（分支 `feature/prologue-adoption-a1-checks`）：**

- 缺口 1 已补：`prologue-model-controls` 的 6 条、`coding-model-controls.e2e`、`prologue-stream` 里新帧那一条与 `coding-timeline.e2e` 的逐轮变更段都写了 PA-24。
- 缺口 2 补了三个分支，各自断言拒绝之后什么都不变，也没有请求发到别的模型：提示缓存跨接口格式、目标模型没标力度、模型不可用。另外两个没补：视觉要在开跑时带图片，没有 Runtime 支持切换的场景用真实 Node 适配器造不出来。
- 补用例时修了一个真缺陷：`prompt_cache` 的取值是 `"off" | "best-effort" | "required"`，原判断只看真假，提示缓存明确关掉的一轮也被拒绝换到别的接口格式。现在只有开着缓存才拒绝，两边各有一条用例。
- 缺口 4 已补：申请换模型之后停止这一轮，新模型零请求，结束的视图不再显示 `requested`。
- 缺口 5 已补：申请换模型、下一次模型调用换成新模型之后结束这一轮，关掉适配器再重开，结束的视图仍显示 `model_switch: { now }`、开跑模型与那一条换模型活动。（更正：第一次写这条用例时让第一次调用直接收尾，这一轮只调了一次模型，换模型根本没生效，看起来像冷读丢了；用例改成第一次调用要一个工具、逼出第二次调用之后，冷读是对的。不是产品缺陷。）
- 缺口 3（申请换模型后撤权）、缺口 6（从断点继续之后的模型与凭据）没做。

**2026-10-15 P3b（分支 `adoption/p3b-model-switch`）：缺口 3、6 补了用例，没有改源码。**

- 更正：前文和 §6.0b 表第 7 项说 P3b 要「接 SDK 的 `beforeAccept`」。这一步早在 main 上：防腐线 I8（#523）换 acceptance 包时接的，`horizontal/agent-host/src/adapters/prologue-run.ts` 的 `switchModel` 把 `beforeAccept` 交给 SDK（先 `deps.effects.assertCurrent()` 再 SDK 自己的检查），用例是 `tests/agent-sdk-effects.test.ts` 的 W2-18-MODEL-SWITCH-01/02（配置、凭据、SDK 接受三个阶段 × 取消、撤权）。P3b 剩下的只是两个缺口的用例。
- 缺口 3：`tests/agent-sdk-effects.test.ts`「PA-24: plugin-stopped / character-disabled after a switch is accepted …」。真实 Node 适配器经 LocalHost 与 `registerAgentHostCapabilities` 开跑，带插件实例（`plugin_caller`）；第一次模型调用要一个工具，逼出第二次调用；中间申请换到 B（端点 `1.1.1.2`），SDK 接受（`requested: B`），然后让插件实例停止（真实的 `actions.forbidden`「此插件实例已停止，请重新打开」），或让 Character 停用（真实的「所选 Character 版本不可用…」）。断言：B 的端点零请求；这一轮 `failed`，`stop_reason` 是「EFFECT_NOT_AUTHORIZED: The App refused this network dispatch before sending: <原因>」（Coding 时间线把它译成「这一轮的授权已失效」）；用量只算 START 那一次；会话里没有多出一轮。
  - 挡住它的是现有的逐次出网检查：这一轮的 `dispatchGuard` 经 `beforeNetworkDispatch` 在每次出网前跑（SDK 的 model 通道也走它），其中 `capability-registration.ts` 的 `caller?.assertActive()` 管插件实例，`index.ts` 的 `validateCharacter()` 管 Character。SDK 另有 `beforeModelDispatch`，Molis 不用：`beforeNetworkDispatch` 已经覆盖模型调用，再接一个是同一件事查两遍。
  - 反证：在构建产物里临时去掉这两处检查（备份后改 `dist`，跑完还原并逐字节比对），两条用例都失败，B 收到了请求。
  - 视图里 `model_switch` 是 `{ now: "B" }`：切换在那次调用的边界上生效了（SDK 发了 `model-switched`），而它生效的那次调用在发出前被拒。用量与 `stop_reason` 说明 B 没有收到任何东西。用例把这一点钉住。统筹 2026-10-15 审定：这符合 SDK 的语义，保持现状。`model_switch.now` 的意思是「切换已生效」，不是「B 回答过」；界面上如果有地方把它写成「这一轮用 B 回答」，以后另开一项改，这次不动。
- 缺口 6：`tests/prologue-model-controls.test.ts`「PA-24 (§4.3): a round continued after a switched one …」。Molis 的「从断点继续」是同一会话里的新一轮：Coding 的 `coding.continuation` 只起草任务与意图，模型是人当时选的，开跑时按现行设置解析（`plugins/native/coding/src/start-round.ts`）。用例：第一轮从 small 换到 large 并结束；马上在同一个活着的会话里再开一轮，选 small，就是 small、small 的端点和密钥，`model_switch` 为空；关掉适配器，把 small 挪到新端点、换一把新密钥、删掉 large，重开后再开一轮，用的是新端点和新密钥，会话历史还在；再选 large，在发出前拒绝（适配器的原话「还没有配置可用的模型」），零请求，也不多出一轮。

PA-12 仍未完成：写后诊断（第 9 项，A2）与 Alchemist 的结构化生成（第 11 项，A3）都还没有实现。另记：`prologue-frozen.ts` 的 `throw new Error("思考力度只能是快速、平衡或深入")` 是普通 Error，归错误模型 W3-02-G。

当前 A0 已转入执行：SDK `c4b9fde3` 与完整 S1 已在独立树组合，保留工具回执微压缩保护和补充读到回执；不带问询字段。Molis 只提取 A0 源码/测试，保持主线 Chrome testkit。新的明确实现边界：S1 steer 返回值在 Host 适配器内等待后丢弃，现行 Molis void 接口不变；typed 输入接入仍归后续线。新增 PA-23 生产入口拒绝/重开用例；对应测试路径纳入 §5.5 范围。

## 6.0 A0 收口记录（2026-10-12，当前状态）

**一句话**：A0 在 `origin/main` 上工程通过；SDK 是从 Prologue main 上的具名合并提交 `55b0c85a`（PR #4，2026-10-12T06:34:51Z）打出的合成包（`dirty:false`），所以输入回执 D7 的「正式 SDK 来源」已满足；「Molis 默认路径验证」工程部分通过、浏览器部分未完成；「采用线合入 Molis main」未做。三级证据分开记，下文只写实际跑过的命令。

### SDK 来源（§3.2 的整合记录）

唯一整合分支：Prologue `feature/handoff-molis-a0-s1`（本机整合树 `prologue-wt/sdk-integration`），整理后的提交线（基点 `4f7110fe`）：

| 提交 | 内容 |
| --- | --- |
| `c4b9fde3` | 微压缩只收能再读的观察、独占写主人清遗留写声明、让出续跑可交 App（原样） |
| `4acfb445` | 输入回执第一刀 S1（原 WIP `820eeca9` 的代码，只整理了提交说明与交接文字） |
| `edb8ec86` | 并入上游 main `69ccfa94`（符号链接 cwd 越根、非终态导入），零冲突 |
| `8db0d7d6` | 并入 `a06ae62e` 带类型的问卷；唯一冲突是 public-surface 快照，重新生成 |
| `a13bf067` | 合成后的复验记录（只改 `docs/slices`）；PR #4 的 head |
| `55b0c85a` | PR #4 合入上游 main 的合并提交（父 `69ccfa94`、`a13bf067`），树与 `a13bf067` 相同 |

取舍：问卷字段与 A0 合成一个包而不是等 A0 收口之后再出第二个。收益是一次上游合入、一次 Molis 全量回归、跨插件 AI 线同时拿到问卷；代价是 A0 的回退点要多记一个——需要只带 A0 时可退到 `edb8ec86`（SDK 全量也跑过）。S2 持久队列（receipts 线 `a807c2cc`，基于 `edb8ec86`）不在本包，等本包上游合入后作为下一个整合包，因为它改变续聊历史里未读补充的入模方式，需要 Molis 侧单独验证。

包：`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-adoption-receipts-fields.tgz`，1,076,425 字节，SHA-256 `646afefbd4225bfe8bf50892403962fa3e12711f1c45035cfb739e3b9bc8d34f`，`source.commit` = `55b0c85a`（上游 main 的合并提交，`mergedUpstream` 记 PR #4、head、合并时间），`dirty:false`，无补丁；从 `8db0d7d6`、`a13bf067`、`55b0c85a` 三份 `git archive` 各打一次，逐字节相同。旧 dirty 候选 `prologue-sdk-a0-s1.tgz` 已删，记在 `patch-history.json`（git blob `0c421991`）。`vendored-provenance` 门禁通过（0 问题）；没有改门禁、没有放宽 `dirty` 检查。

### 工程证据（第一级）

| 范围 | 命令与结果 |
| --- | --- |
| SDK | 两份 `tsc`、`pnpm --filter @prologue/sdk build` 通过；`vitest run --maxWorkers=4` 全量：合入问卷前 3659 通过 / 1 文件失败（`host-storage-full.live` 的 `afterAll` 弹 ram disk 超时，单独复跑 2/2）；合入后 330 个文件 323 通过 / 6 跳过，3670 条通过 / 21 跳过 / 1 条失败（`agent-budget.live` 墙钟用例在 4 并发下时序，单独复跑 3/3）。§5.5 第 1 步的三项回归与 `packaged-consumer` 在其中 |
| 包消费者 | 干净归档打出的包装进只有 `package.json` 的空目录（`pnpm install --offline --ignore-scripts`），只经 `@prologue/sdk` 公开入口：S1-10 消费者通过；问卷校验（有效答案零问题，坏日期 / 非整数 / 对象种类不在名单各报原因）通过 |
| Molis 安装与构建 | `pnpm install --frozen-lockfile --offline`（锁文件只换 SDK 路径与 integrity）；整体 `pnpm build` 退出 0（约 2 分钟） |
| Molis 定向 | §7 的 16 个文件加 `agent-host*`、`host-inference-completion`、`prologue-inference-native`，共 24 个文件 217 项全过（默认包路径，非源码映射） |
| 安全与合同 | `pnpm test:security` 145 项 144 通过 / 1 跳过（需真实 npm registry 的用例）/ 0 失败；`pnpm test:contracts` 430 项首轮 3 项 `action-before-effect` 的 `form:` 用例 15 秒超时（同批并发负载），该文件单独连跑两次 20/20 通过 |
| 门禁 | `check-health-gates.mjs --base origin/main` 通过（公开 API 只变 agent-host 合同：`grants`、`turn_changes`、`sleeping_until`）；`check-package-boundaries.mjs` `errors: []`；`page-assets.mjs --base origin/main` 见下 |
| 部分全量（`c5ddde8e`） | `node scripts/run-tests.mjs` 全量从 2026-10-12 07:36Z 跑到 10:46Z，**按用户决定停止，改为批量全量**（不是跑完：日志计数 4204 个 ✔、21 个 ✖、15 个跳过，未跑到的文件没有结果）。树是 `c5ddde8e`（A0 加 main `032a5d00`，`pnpm build` 退出 0），机器负载 4–11。21 个 ✖ 归 19 个文件，逐个单独复跑并和干净基线（`032a5d00`，同样 `pnpm build`）比对，见下「失败定性」 |
| vendor 记录 | 用户 2026-10-12 确认删除 `side-panel-memory.patch`（`dependencies-and-sdk-plan.md` §4.2）：已删，登记为 `patch-history.json` 的第 26 份（225,092 字节、SHA-256 `1f64a15c…`、git blob `97328ddc`、基线 `af7375c7`、来源 `9fc3b173`；重新施加到基线，`packages/sdk` 与 `9fc3b173` 逐文件相同），它产出的 side-panel-memory 包随它记在 `package` 里。`tests/vendor-provenance.test.ts` 78/78 通过（断言的数字随记录改为 26 份 / 2,791,897 字节 / 10 个无补丁包，没有删除或放宽任何一条） |

### 失败定性（部分全量里的 21 个 ✖）

| 类 | 文件与结果 | 定性 |
| --- | --- | --- |
| 非浏览器，9 个文件 | `alchemist-mcp`、`form-mcp`、`home-mcp-actions`、`inbox-automatic-scenes`、`installed-plugin-host`、`lingguang-mcp`、`pages-mcp`（stdio MCP / 跨进程用例 30–90 秒超时，或 `ECONNRESET`）和 `jelly-native-material`、`material-extraction`（本机 Swift 助手不可用：`/.build: Read-only file system`、`native helper unavailable on this dev machine`）。我的树单独复跑：43 项 32 通过 / 5 个失败文件（11 个 ✖ 行），**干净基线 `032a5d00` 同样的 43 项、同样的失败集合，差集为空** | **预先存在 / 环境问题，非 A0、非 SDK 引起**；未修，也不属于本线 |
| 浏览器，10 个文件 | `agent-action-selection`、`artifact-clipboard`、`assistant-dock-ime`、`dense-workspace`、`feed-capture`、`goals-document`、`goals-narrow-navigation`、`goals-planning`、`immersive-directory`、`inbox-current`。我的树单独复跑（负载 4）：16 项 9 通过 / 7 失败（`agent-action-selection`、`feed-capture`、`immersive-directory`、`inbox-current`、`goals-narrow-navigation`、`goals-document`、`assistant-dock-ime` 各一项）；**干净基线 `032a5d00` 同样 16 项 7 通过 / 9 失败，我的 7 个失败全在基线上也失败，只在我这边失败的为空**（基线多失败 `dense-workspace`、`artifact-clipboard` 两项，是偶发）；`goals-planning` 在我的树上单独跑通过 | **预先存在 / 环境问题，非 A0、非 SDK 引起**；未修，也不属于本线 |

此前 17 个受影响 e2e 的两轮：首轮 30/43、重跑 13/17，失败全是 `CDP timeout` / `Navigation did not finish`（负载 50–66 时跑的），其中 `coding-timeline`、`coding-taskboard`、`issue-assistant-repair-page` 通过；浏览器类 21 个 ✖ 里没有一个是只在 A0 树上才失败的。**结论：部分全量跑到的那一半里，没有 A0 或 SDK 引起的失败；全量没有跑完，不能代替批量全量。**

合入 main 后冒出的页面资源超预算已就地解决，没有放宽：Coding 客户端（以 `coding/diff/files/git/text-stats.js` 五个名字发出）A0 版比预算多 5,002 字节，两张样式表多 944 / 1,366 字节。做法：三处注入浏览器的函数（`createCodingTimeline`、`codingTimelineWords`、`createCodingTurnChanges`）里的注释移到模块头（函数体每个字节都发给每个页面）；工具种类表改成元组再展开；写入行复用现有行与运行卡样式，`timeline-styles.ts` 删除、`styles.ts` 与 main 逐字节相同；命令扩权说明复用 `agent-review-concurrent`。行为与断言文字不变。预算用 `page-assets.mjs --update --base origin/main` 降了 12 字节，样式表回到 main 的数字。

### 第二级：真实产品实操

- 浏览器用例：`coding-timeline.e2e`（时间线状态与收尾）、`coding-taskboard.e2e` 3 项、`issue-assistant-repair-page.e2e` 等受影响文件通过；其余失败按上表和干净基线比对为预先存在。这是自动化浏览器用例，不等于临时 Home 里的人工实操。
- 真实模型：本机没有 Key，未跑。回环对端是本地脚本服务，不是外部模型。
- 临时 Home 里的 Coding 时间线与扩权审查卡人工实操：未做。

### 第三级：用户本人验收

未做。

### PA-22 / PA-23 当前判定

| 编号 | 判定 | 依据 / 缺口 |
| --- | --- | --- |
| PA-22 | **工程通过，实操与验收未做** | 显式预算优先（`model-thinking`、`agent-budget-prologue`）、修改回执不被压成可重做观察（SDK `context-micro-compaction` + `prologue-stream`）、独占重开成功与非独占拒绝（`host-storage-concurrency.live` + `prologue-storage-claims`）、撤权 / 取消零派出零迟到写（`action-before-effect`、`prologue-start-refusal`）、状态与审查展示（`agent-review-surface`、`prologue-status-projection`）均在默认包路径上通过；干净包消费者通过。缺：浏览器时间线展示、真实模型 |
| PA-23 | **工程通过，实操与验收未做** | `prologue-adoption-guard` 在真实回环 HTTP + 生产 Node Adapter 上：yield 在派出前拒绝、零孩子、无审批、只有原父 Run、落盘重开无模型调用 / 自动接续；没有复活已删 CLI adapter / Runtime 路径（边界检查器 `errors: []`，健康门禁通过）。缺：临时 Home 实际启动与 Coding 时间线操作 |

### 第二个包与决策记录（2026-10-12）

第二个包 `prologue-sdk-0.0.0-rc.1-adoption-receipts-handling.tgz`（输入回执第二、三刀：会话级持久排队、`acknowledge-inputs` 与有界提醒）：Prologue PR #5 已合入 main（合并提交 `f5ef12e6`），包从该提交打出，与 PR head `87e063e8` 打出的逐字节相同（SHA-256 `c474ee43…`）。Molis 侧换包是叠在 #408 上的单独 PR #442。默认路径检查：`pnpm build`；采用定向 24 个文件 218/218；`test:security` 164/165（1 跳过）；`test:contracts` 520/520；`affected-tests` 选出的 90 个文件 1196 通过 / 4 失败（3 项 `action-before-effect` 15 秒超时，单独连跑两次 20/20；1 项 Swift 助手本机不可用，基线同样）；`vendor-provenance` 78/78。未跑：全量、浏览器、真实 Provider。

按「技术决策按防腐后果、功能决策选体验最好」的规则，本线自己定了这些，不需要用户拍板；收益与取舍如下：

| 决定 | 理由 | 取舍 / 后果 |
| --- | --- | --- |
| 问卷字段与 A0 合进同一个包（PR #4），S2、S3 作为第二个包（PR #5） | 一次上游合入、一次 Molis 验证；S2、S3 改变续聊历史里未读补充的入模方式，需要 Molis 单独验证，不拖慢 A0 | 回退点多记一个：只要 A0 时可退到 `edb8ec86`；vendored 目录始终一份当前包 |
| `acknowledge-inputs` 在助理面板里不显示（`presentActivity` 里与 `reasoning`、`context-remaining` 并列的一行） | `assistant-tool-words` 要求每个受守护的工具在面板里用人话显示或不显示；没有任何 Molis 角色被给到这个工具，面板里出现裸工具名比不出现更差；措辞是产品决定 | 输入回执线接 S3 时再定显示位置与措辞（统筹已认可）；不增加 Coding 时间线词表（页面资源预算只许变小） |
| 产品子集清单去掉 `test:security` 已覆盖的三个文件 | 主线新增的计划测试规定子集不重复阻塞作业已跑的文件 | 没有少跑：三个文件仍在 `test:security`（阻塞作业）里 |
| 页面资源超预算靠减少注入函数里的注释和重复，不放宽预算 | 预算只许变小 | 注入函数的说明移到模块头；预算降了 12 字节 |
| 全量回归改成批量（用户决定）：部分全量 21 个失败逐个和干净基线比对，都是预先存在 | 用户要优先开发，全量攒一批跑 | #408 要等集成分支的批量全量通过才合 |

### P2 SDK 实现进度（2026-10-13）

P1 合同（§4.6.9）冻结后，P2 按切片在 Prologue 一刀一刀实现，每一刀过 SDK 全量和干净包消费者检查；Molis 的包只在 P2 全部合入后换一次（需要时再核一次 Molis 默认路径）。

| 刀 | 内容 | 状态 |
| --- | --- | --- |
| P2a | `InputRef`、节点 `origins`、`report.inputs`（只有字段） | 已合 Prologue main（PR #7，`2621ae91`） |
| P2b | 执行代次、有界尝试、`waiting` / `needs-reconciliation`、重试、`attemptOf(run)` 与 `scope` 代次检查（存储层） | 已合 Prologue main（PR #8，`7f318494`） |
| P2c | `startAgentRun({ collaboration })` 运行绑定（准入核对、开尝试、Run 绑定、终态收场）、绑定的跑每次改图带代次；`RunBinding` 经 `SystemToolInput.collaboration()` 交给板工具和 `acknowledge-inputs` 执行体 | 已写完，SDK 分支 `feature/p2c-binding`（`3ef2aa15`）；全量与消费者检查进行中；按用户 2026-10-13 的决定先不开 PR |
| P2d | 翻开门禁（无绑定的跑里板工具与 `dispatch-subagent` 不进名单、直调 `TASKBOARD_NOT_BOUND`）并重做派出（节点点名与自动建子节点、删 `claims`、子会话绑自己的节点）；走旧路径的用例改成带绑定 | 未开始 |
| P2e–P2h | 派出四步与 `admitDispatch`、恢复；信封 `scope` 与受限通信；等待（条件组、四态观察、`board-wait`）；外部检查器与接续记录 | 未开始 |

本轮核对并改了合同的一处（决策 T7）：P1 初稿假定待答问题能「稍后」重开并由只读口跟着新问题走；SDK 里只有副作用审批有 `later`，且旧引用上没有指向新问题的链接。改成：`pending` 等待条件只接待答问题类，审批不是等待条件。这也回答了回执线 S4 的 I15（不影响 S4）。P2c 同批记录了 T8（绑定要求节点 `ready` / `running` / `waiting` 且负责人是这个会话或这一跑的角色）和 T9（一个开始键只开一次尝试）。

用户 2026-10-13 的决定：各线只在各自的交接 PR 里提交，不单开 PR（有防腐线在改代码质量和架构，单开 PR 容易冲出架构问题）。Molis 侧据此把 #442（第二个包，叠在 #408 上）快进并入 #408 的分支（`4e426f4c`）；Prologue 侧的 P2c 之后是否单独开 PR 由统筹向用户确认，确认之前只推分支。

### 防腐复查记录（对 #408 自己的 diff，清单见协调板旁的 ANTI-CORRUPTION-REVIEW.md）

| 日期 · 对照 | 范围 | 结论 |
| --- | --- | --- |
| 2026-10-13 · merge-base `aadeef76`（main 末端 `e4ec01bd`，尚未合入） | 清单 §2 不需要构建的项（M2 `check-health-gates --base origin/main`、M4 `api:update`、M7 Biome、M8 页面事件、M9 翻译、M10 测试进程双份、M15 密钥、vendored-provenance）和 §3 人工项，只看 #408 自己的 diff | **通过，一处已修，两处暂缓（等防腐线的片）。** 构建类（M1 边界、M5 动作快照、M6 页面资源、M13 受影响用例、M14 安全）等把最新 main 合进来之后再跑，结果另起一行。 |

- **已修（§3-1/§2 M7）**：`prologue-stream.ts` 里新写的三处 `as unknown as`（`memory-recalled`、`todo-changed`、`circuit-tripped` 三个事件）改成事件联合里的有类型成员 + `Extract<PrologueEvent, …>`，Biome 对该文件无诊断，`tests/prologue-stream.test.ts` 28/28。
- **通过**：新增行里没有兼容/迁移/回填标记（只有协议名 `anthropic-compatible`）、没有 typed 宿主能力、没有 SQL、没有旧名、没有新 `CustomEvent`、没有裸 `fetch`、没有 `biome-ignore`；巨大单元只变小或没变大（`prologue-node.ts` 1759→1550、合同 `agent-host.ts` 1732→1638，`prologue-stream.ts` 588→697 仍在 800 行以下）；`vendor/prologue-sdk/` 只有一份 tgz，来源记录与包相符（`vendored-provenance` 退出 0）；没有碰 `limits.json`、`biome.jsonc`、门禁脚本与例外文件；`baseline.json`、`page-assets.json` 是重新生成且数字只降；`packages/contracts/src/services/agent-host-memory.ts` 只被 `agent-host` 合同再导出，不是新的发布子路径（没有新快照文件，`api:update` 无变化）。
- **公共 API 变化（PR 描述要写的影响）**：`contracts/services/agent-host` 只多可选字段和两个类型——`AgentCommandReviewDocument.grants?`、`AgentRunView.turn_changes?` / `sleeping_until?`、新类型 `AgentCommandGrants`、`AgentTurnChanges`。读 `AgentRunView` 的调用方不认识这些字段时忽略即可，没有字段被改名或收紧。
- **暂缓 1（§3-14 错误模型，等 W3-02 G）**：`horizontal/agent-host` 的适配器里抛给用户看的错误是 `throw new Error("<中文>")`，新增的一处（`prologue-node.ts` 命令授权不可读）沿用了这个文件里几十处同样的写法；其余几处是从 `prologue-node.ts` 原样搬到 `prologue-credentials.ts` / `prologue-methods.ts` 的。没有新增 `extends Error` 子类，也没有新的错误码字符串，所以门禁数字不变。这一类要等防腐线 W3-02 的 G 系列统一成 `defineErrorCodes`，本线不抢先改。
- **暂缓 2（§3-20 界面文字，等 W5-03）**：Coding 客户端、`agent-review-surface.ts`、`timeline-words.ts` 里新增的中文界面文字，这几处现在没有翻译入口（整个文件都是中文直出），翻译门禁 0 缺英文通过；新文案集中在 `timeline-words.ts` 的词表里，W5-03 按主人词典搬时一并处理。

### 没做的与风险

- D7 还差一项：采用线合入 Molis main（Molis 默认路径验证的工程部分和受影响的浏览器用例已过，部分全量里的失败已和干净基线比对为预先存在；批量全量尚未跑）（PR #408 由统筹按条件合并）。
- 全量回归：`affected-tests` 命中共享核心 + 4 个包。用户决定改成批量全量（统筹把 #408 和情境线 W1 的合同片合到一条集成分支跑一次），所以 #408 要等那一次全量通过才合；上面的部分全量只证明跑到的那一半没有 A0 引起的失败（浏览器部分待定性），不代替它。
- `c4b9fde3` 目前只在 Prologue 的特性分支上；`patch-history.json` 的上游说明已如实写明，并入后复核。

## 6.0a 对账与过渡包（2026-10-13 晚）

**做了什么**（提交在 #408 上，按时间）：

1. `f9769ce5` 先在 #408 自己的树上换包：`adoption-receipts-handling.tgz`（`f5ef12e6`）换成过渡包 `interim-p1-cu.tgz`（`08b84296`），来源与理由见 §3.2 与 vendor README。锁文件只手改 `@prologue/sdk` 的五行（`pnpm install` 不带 frozen 会删掉别的平台的可选包，约 900 行）。`vendor-provenance` 用例改成钉住过渡包的规则：推送的具名分支，两个父提交逐一点名。这是新规则的准确断言，不是放宽。
2. `7d49a99c` 合 main（`f2024d6b`，含 #471、#472、#474），26 个冲突，按「实现以 main 为准」解：
   - #472 带进 main 的 A0 代码与 #408 同源（`77fde104`、`da9ddd99`、`804384d8`、`5a4d6feb`），#408 只留 main 没有的三处：S1 补充回执在 `prologue-node.ts` 三处 await 后丢弃；S3 的 `acknowledge-inputs` 在助理面板 `presentActivity` 里隐藏；`prologue-stream.ts` 用三个联合成员代替三处 `as unknown as`。
   - 用例用 main 的正文加 #408 的 PA-22 编号；网关那条只留一份，git 的自动合并会留成两份。
   - main 的 `computer-use.tgz` 删除（过渡包以 `d4908c11` 为父）；`side-panel-memory` 包与补丁随合并删除；连同 `molis-adoption.tgz` 都记进 `patch-history.json`。`specs/README.md` 只留一行本线索引。
3. `9cabd35e` 修 main 上的一处红：#472 在 `schedule-task-runner.ts` 写了 `reject(signal.reason ?? new Error("到点执行已取消"))`。中止的信号一定带原因，这个兜底是死代码，却让 `feed-inbox-schedule-error-model` 在 main 上失败；去掉兜底。
4. `b4711259` 再合 main（`c33448f2`，#475、#482、#483 测试迁移），无冲突；`baseline.json` 按 `--update --base origin/main` 降（vendored SDK 2 → 1，`prologue-stream.ts` 的 `as unknown as` 3 → 0）。

**证据**（对账后的树，过渡包；工程级）：

- 整体 `pnpm build` 与 `pnpm workspace:build` 通过：过渡包与 main 的代码之间没有类型断裂。
- 门禁：`boundary:check` 无错；健康门禁对照 merge-base `c33448f2` 通过；`pnpm api:update`、`pnpm actions:update` 后快照没有任何变化；页面资源对照 merge-base 通过，不用改预算（页面代码全是 main 的）。
- 定向 45 个文件 441/441：
  - 默认路径 §7.10 的 19 个；
  - agent-host 必跑 6 个；
  - #472 带进 main 的 8 个（模型控制、助理交回与续做、变化等待、灵光、到点执行、资源缓存、跟进）；
  - #471 的 3 个（`computer-use-gaps`、`assistant-tool-words`、`assistant-attention`）；
  - 打包与安装 8 个（`vendor-provenance`、`ci-product-subset*`、`release-assets`、`npm-package`、`install`、`runtime-payload`、`uninstall`）；
  - `feed-inbox-schedule-error-model`。
- `pnpm test:security` 182 条 181 通过、0 失败（1 条跳过）；`pnpm test:contracts` 541/541。
- `affected-tests` 选出的其余 104 个单元文件：1443 条，1442 通过、0 失败、1 跳过。
- 浏览器一批 10/10：`coding-timeline`、`coding-model-controls`、`issue-assistant-repair-page`、`assistant-handback`、`assistant-follow-live`、`lingguang-plugin`。
- 全量：换包改了每条 Agent 路径下的运行时，属于 §5.4 的共享核心阶段（`affected-tests` 看不到 vendored 包，没有建议全量）。#411 合入后在 #408 的 `b1459770`（合 main `70c928ae`）上跑：`node scripts/run-tests.mjs`，约 112 分钟，6155 条，6143 通过、3 失败、9 跳过。3 条失败都在干净 main 上同样失败，与本线无关：`settings-requests-through-helper` 的 settings-assistant 一条（#471 在 `settings-assistant.ts` 直接 `fetch`）、`touch-targets.e2e` 的触屏窗口两条。#472 留下的 `feed-inbox-schedule-error-model` 在本线修过之后通过。之后再合 main `f47ee72c`（#476 文档、#484 测试迁移、#485 文档）：没有冲突，健康门禁通过；#484 改过的 30 个测试文件（19 个浏览器）在合并后的树上 135 条 133 通过、2 失败；失败的 `agent-action-selection.e2e` 与 `configured-text.e2e` 单独重跑 3/3 通过，判为同批浏览器负载下的时序。
- 真实产品实操：未做（没有人在隔离 Home 里走过对账后的树）。真实模型：未跑（本机无 Key）。用户验收：未做。

**D7 重新判定**（统筹，回执线生产接入的前置）：① 正式 SDK 来源，按用户 2026-10-13 的决定改为「推送的具名分支，父提交都在 Prologue main 上」，过渡包满足；② Molis 默认包路径验证在本次换包里做了（上面的证据）；③ #408 进 main：待合。三项都满足后由统筹通知回执线。

**PA-22** 在对账后的树上重判：通过（上面的默认路径用例）。**PA-23** 改述：SDK 的 `yield` 仍被拒（`subagentYieldGuard`，S-23，`prologue-adoption-guard` 用例通过）；main 上第 14 项的私有接续是已知的 X6 欠账，由 P4 的助理那一半还（§7.5）。

**防腐复查**：对本线 diff（merge-base `c33448f2`），机器项 M1、M2、M4、M5、M6、M14、M15 通过。人工项逐条看过：
- 不留兼容：vendored 只剩一份；没有读取兜底。
- 不新增 typed 能力。
- 巨大单元：`prologue-node.ts` 仍是 1551 行；`prologue-stream.ts` 747 行，其中 `applyPrologueEvent` 没动。
- 错误模型：去掉了一处裸 Error。
- 枢纽文件两边都留。
- 没有改门禁。

两处不归本线、已报统筹：
- `docs/system/SECURITY-INVARIANTS.md` 里「Computer Use 不在 main」一条已过时（Computer Use 线）；
- `specs/archive/repository-anti-corruption/dependencies-and-sdk-plan.md` §4.3 需要记过渡包这个例外（防腐线）。

## 6.0b 现状核对（2026-10-14）

对照原始需求（2026-10-02 评估的 23 项，要求「每项都有明确处理结果、核心路径内部完整」）与本文，按 Molis `origin/main` `393e8958` 与 Prologue main `b01067b4` 的真实代码和测试逐项核过。只读源码与用例，没有为这次核对重跑测试；「证据」列的用例是 main 上已有、在 §6.0a 的对账树或各 PR 上跑过的。三级证据照旧分开：下表所有项的真实产品实操与用户验收都是**未做**（本机无模型 Key，隔离 Home 里没人走过）。

| # | 项 | 结果 | 依据（main 上的位置、用例、PR） | 剩下的 / 去处 |
| --- | --- | --- | --- | --- |
| 1 | 思考覆盖输出预算 | 已实现 | `horizontal/agent-host/src/adapters/prologue-run-params.ts`：显式 `max_output_tokens` 优先，没给才用思考上限；`tests/model-thinking.test.ts`（PA-22）；#472 | — |
| 2 | 模型派出前授权 | 已实现，证据缺一处 | 灵光、Form、Dataset、PPT 的 `actions.ts` 都把 `caller.beforeEffect` 作为 `beforeDispatch` 交给 Host（`87cbaf85`）；`tests/action-before-effect.test.ts` 对 Form、Dataset、灵光、Pages、Cognia 各测撤权 / 停用 / 取消时 `dispatched === 0` 且库不变 | **PPT 不在这条用例的循环里**：评估点名的四条路径之一没有「零派出」的断言（代码有）。补一行用例，归 A5 |
| 3 | 新状态与事件 | 已实现（让出投影随 P3） | `prologue-stream.ts` 认 `sleeping`、`turn-changes`、`model-switched`，不再计入 `unknown_frames`；合同 `sleeping_until`、`turn_changes`、`model_switch`；`tests/prologue-stream.test.ts`（PA-24 新帧）| `completed{yielded}` 现在不会出现（`yield` 被拒，见 13）；P3 接通让出时投影成「在等」而不是「完成」 |
| 4 | 工具副作用分类 | 已实现 | `prologue-action-gateway.ts`：`suggest`、委派 start/follow/stop、记忆 remember/forget/propose 都是 `mutate-external`；`prologue-action-tools.ts` 只在 `operation=query` 且 `actionEffect=read` 时给 `safe-read`；`tests/assistant-business-gateway.test.ts`、`tests/agent-action-tools-prologue.test.ts`（PA-22） | — |
| 5 | 修改回执与微压缩 | 已实现（Molis 侧只有间接证据） | SDK `agent/core/loop-tools.ts` 由工具登记的 `effectKind` 推出 `rereadable`，只有 `safe-read` 能被换成「需要就再调」，`rereadable: false` 的不收（`c4b9fde3`，在过渡包里）；配合第 4 项，Molis 改东西的工具回执都不收；SDK `context-micro-compaction` 用例 | **文中 §6.0 写「`prologue-stream` 证明修改回执不被压」不准**：`tests/prologue-stream.test.ts` 不测压缩。Molis 侧没有「真实网关 + 压缩后的请求里回执还在」的用例；A5 补一条请求级断言 |
| 6 | 推理力度 | 已实现 | `prologue-frozen.ts` 每轮冻结、不支持就发出前拒绝；`tests/prologue-model-controls.test.ts`、`tests/coding-model-controls.e2e.test.ts`（PA-24）；#472、#491 | — |
| 7 | 运行中换模型 | 部分 | `prologue-model-switch.ts`；拒绝分支（提示缓存跨格式、目标没标力度、模型不可用、思考切到无思考）、停止时零请求、冷读都有用例（#491） | §5.6a 缺口 3（申请换模型后撤权）：更正——SDK 的同步 `beforeAccept` 早由 #523 在 `prologue-run.ts` 接好（W2-18-MODEL-SWITCH-01/02），不是 P3 才接；接受之后的撤权与缺口 6（从断点继续后重新解析模型与凭据）由 P3b 补了用例（§5.6a 末尾）；视觉、Runtime 不支持切换两个分支无用例（造不出来，见 §5.6a） |
| 8 | 逐轮变更 | 已实现 | `prologue-stream.ts` 的 `turn-changes` 投影、重放不重复；Coding `turn-changes-client.ts`；`tests/coding-timeline.e2e.test.ts`（PA-24） | — |
| 9 | 写后诊断 | **未做** | main 上没有按文件的检查器接入（`diagnose` 只出现在 Coding 方法名与开发者诊断页） | A2：检查器输入 / 输出与用例先写进本文，再实现 |
| 10 | 文字增量、停止与错误 | 已实现 | 灵光 `client.ts` 的 `?stream=1` 逐行读、`reply-stream.ts`；阶段名已从宿主挪回插件（采用合同闭环）；`tests/lingguang-plugin.e2e.test.ts` 的「边写边出、Stop 不保存、字留在框里」 | — |
| 11 | 结构化生成 | **未做** | `apps/local-host/src/alchemist-prologue.ts` 仍把 JSON Schema 写进提示词再解码；共享端口的 `structured` 没有 Alchemist 调用方 | A3 的结构化一半 |
| 12 | 变化等待 | 已实现（协作视图的版本随 P3） | 助理 `assistant/assistant-wait.ts` + 工作台 `assistant-follow.ts` 的长请求（取代 1.2 秒轮询）；Schedule 用 `adapter.observe`（`schedule-task-runner.ts`）；`tests/assistant-work-wait.test.ts`、`tests/schedule-task-runner.test.ts` | 等待 / 接续进 `runViewVersion` 随 P3 |
| 13 | Coding 子代理让出与续做 | 部分：按 A0 边界拒绝 | `prologue-subagents.ts` 的 `subagentYieldGuard` 在派出前拒绝 `yield`；`tests/prologue-adoption-guard.test.ts`（PA-23、S-23）。SDK 正式路径（P2i：让出 = 派出 + 这一步等孩子那一步 + 收工，接续经 App 起跑）已在 Prologue main | **P3**：`collaborationHost.startContinuation`、删 `subagentYieldGuard`、PA-08 / PA-11 接替 PA-23 的证明 |
| 14 | 助理委派交回与续做 | 部分：私有实现在 main（X6 欠账） | `apps/local-host/src/assistant/assistant-delegation.ts` 的 `handed_back_run` / `hand_back_held`、按结果键自启（#472）；`tests/assistant-delegation-handback.test.ts` 等五个用例 | **P4 助理那一半**（W5-10 形状），清单见 §7.5 第 5 条；P3 先给协作口与接续 |
| 15 | 休眠 | 投影已实现；工具暂不开放 | 投影见第 3 项；各角色的 `host_tools` 是显式名单（`plugins/native/coding/src/roles.ts`、助理角色），都不含 `sleep` | 暂缓，依据：短等待已有 `await-commands` / `command-output`，跨重启与未来时刻的跟进走 Schedule 与跟进；没有哪个角色要在同一 Run 里睡。有具体场景再按 §4.7 开 |
| 16 | 会话条目 | 未做，归回执线 | main 上没有 `session.appendEntry` 的调用方 | 回执线「会话条目端口」，W4-06 之后接；本线只在 P3 提供 Board 引用 |
| 17 | 记忆边界 | 已实现（SDK 自动生效） | `tests/prologue-memory-boundary.test.ts`（S-13） | — |
| 18 | 写前密钥扫描 | 已实现 | `plugins/native/coding/src/timeline-words.ts` 把 `WORKSPACE_SECRET_DETECTED` 写成「没有写入」的人话；`tests/coding-timeline.e2e.test.ts` | — |
| 19 | 副本血缘 | 暂缓 | main 上没有 `copyOf` 调用方 | 依据 §4.7：不是统一协作的完成条件，不新增入口；Coding 隔离工作区若要解释来源再开 |
| 20 | 租约排队 | 暂缓 | 没有用 SDK 的租约排队 | 依据 §4.7：没有找到「短暂锁竞争导致失败」的入口；内容冲突仍靠版本检查 |
| 21 | 企业网络（Host 代理与 CA） | 暂缓 | 没有接 Node Host 的代理 / 额外 CA 设置；`node-model-dns.ts` 只在有代理环境变量时改走 HTTPS 解析名字，不是这项 | 依据 §4.7：没有企业网络需求与验收环境 |
| 22 | 审计导出 | 暂缓 | 没有用 SDK 的审计 exporter | 依据 §4.7：没有排障需求；开发者诊断页读 Runtime 自己的回执 |
| 23 | 点名扩权 | 已实现 | `horizontal/agent-host/src/reviews.ts` 与审查卡如实显示 `grants`、含扩权的不给「记住」；`tests/agent-review-surface.test.ts`、`tests/agent-review-standing.test.ts`（S-22） | — |
| 24 | TaskBoard 统一协作 | 部分：SDK 完成，Molis 未接 | P1 合同（Prologue #6，§4.6.9）；P2a–P2j 在 Prologue main（#7–#22，证据在合同的「P2 进度」）；合入后补跑见下 | **P3–P6** |
| 25 | 外部条件等待 | 部分：SDK 完成，Molis 未接 | P2j：`conditionCheckers`、`config.waits.external`、队列道 `prologue:wait-check`、零模型计数（`taskboard-external-checks*`） | **P3** 建 `prologue-checkers.ts`（`molis.action-query`、`molis.file-present`）；**P4** 迁助理 `watchJob` / `checkJob`（A3 已迁：工作图上的一步，§6.0o） |
| — | 存储写声明 | 已实现 | `tests/prologue-storage-claims.test.ts`、SDK `host-storage-concurrency.live` | — |
| — | 墙钟预算 | 已实现 | `tests/agent-budget-prologue.test.ts` | — |

**文中写了完成、但和代码或证据不符的地方**（本节之前的段落不改写，以这里为准）：

1. 开头状态句与 §7.1、§7.4、§7.5 写「P2h 在做、P2i 未开始、#408 待合」。实际：P2h（#19）、P2i（#21）、P2j（#22）与换模型验收复查（#24）都在 Prologue main；#408 于 2026-10-14 01:35Z、#491 于 05:51Z 合进 Molis main。状态句已改。
2. §6.0 与 §6.0a 把「修改回执不被压成可重做观察」的证据记成 `context-micro-compaction` + `prologue-stream`；后者不测压缩。实现是对的（第 5 项），Molis 侧的请求级证据是缺的。
3. §2 第 2 项写「核对 Host 侧转发与撤权零派出的测试证据」；PPT 没有这条证据（第 2 项）。
4. §0.2 第 13 项与 §4.6.6 提到 Coding 的 `yield-wait.ts`、`round-report.ts`：main 上没有这两个文件（10-13 已作废的在途改动）。P4 要退出的是 Coding 的 `waits.ts` 与 `last-start:*` / `wake-note:*` 存储（§4.6.9）。
5. §5.6a 缺口 3 原写「没有用例」；现在 SDK 一侧已有 `beforeAccept`，缺的是 Molis 接线，放进 P3。（2026-10-15 更正：接线早由 #523 做了，缺的只是「接受之后撤权」的用例，P3b 补上，见 §5.6a 末尾。）
6. §3.1 表里的 `onYieldSettled`、`SubagentRequest.yield`、`SubagentWake` 在 P2i 已从 SDK 删掉；P3 的 Molis 一侧不能再引用它们。

**Prologue main 合入后的补跑**（§7.4 第 3 条、合同 P2i / P2j「验证」行）：对 `b01067b4`（P2j 之后又合了 #24）跑 `prologue-verify.sh`（build dist → `tsc` → SDK 全量，两个 worker，不跑 `desktop-computer-use.live` → 干净 `git archive` 打包 → 空目录跑全部 `*-consumer.mjs` → 对 P2h 的包再跑一遍）。P2h 的包取自 P2h 合并前的验证目录（`4416fc09` 打出，1,163,878 字节，SHA-256 `7e728f4a…`；与 #19 的 head `0bfb0e47` 比，`packages/sdk/src` 与 `package.json` 没有差别）。结果记在合同的 P2i、P2j「验证」行，经 Prologue docs PR 进 main。

## 6.0c 暂停点（2026-10-14，用户让需求线先停、防腐线先走）

统筹 2026-10-14 转达用户：当前任务做完后，需求线先暂停，整台机器让给防腐线。采用线停在下面这个位置。

**决定（都已记进本文）**：
- 用户选 B：同一项目的编码会话共用项目工作板。原题、三个选项和对 X5 的影响见 §4.6.10 末尾。
- 统筹批准 P2k「按节点判冲突」（理由：在 SDK 源头修，不在 Molis 里另造一套语义；只开一个会话时也有这个缺陷）。
- 助理仍是每个 Work 一块板，到 P4 再看。

**已完成、已验证**：
- 现状核对 §6.0b：Molis PR #500，已合 main（`59d02a37`）。
- P2k 的实现与定向证据：Prologue 分支 `feature/p2k-node-conflicts`，head `46bc586d`，叠在 main `b01067b4` 上。
  - 新用例 `taskboard-node-conflicts`：内存 9 条、真实 Node Host 1 条，全过。
  - 5 个变异各自让用例变红，还原后文件逐字节相同。
  - 改了一条预期变化的旧断言（`taskboard-waits` 的「同一张板一次只改一处」）。
  - 合同改了三处：新加「板的写法：按节点判冲突（P2k）」一节；P2 进度里加 P2k 一条；决策记录的 X5 一行写明用户选 B。

**没验证的**：
- Prologue main `b01067b4` 合入后的补跑：一直排在构建锁后面，暂停时按要求撤掉，一次都没跑。
- P2k 的 SDK 全量（要先 build dist）和干净包消费者检查：没跑。
  - 在没构建 dist 的工作树上，相关非 live 用例 412 条里有 5 条失败，全是读 `packages/sdk/dist` 的跨进程用例。
  - 草稿 PR molis-ai/prologue#25 已经开了（暂停通知之前开的），验证一节写的是「待补」，不要合。
- P3a：远端分支 `adoption/p3-collaboration`，标 WIP。
  - 底是 #498 的 head `02e6720a`，再并了 main `59d02a37`。
  - 没换包、没编译、没跑任何用例，也没量门禁。

**P3a 已写的（按 B）**：
- 新合同子路径 `services/agent-collaboration`：视图类型，加 read、control 两个动作。
- 旧 `agent.waits.*` 换成一个 typed 等待 `agent.collaboration.await.v1`（Action 不能是等待）。
- `prologue-collaboration.ts`：会话在项目工作板上的那一块、绑定规则、`admitDispatch`。
- `prologue-plan-steps.ts`：计划步骤带前缀放在会话那一块下面，视图还原成 `step-N`，计划的版本按它自己的步骤算，人的修订也在这里。`prologue-taskboard.ts` 只剩接缝，原来的巨大函数拆到阈值以下。
- `prologue-waits.ts` 改写到 `HeldWait` 上，人排队改成 app 的 `arm`。
- 删 `subagentYieldGuard`。
- 发信钩子只留三件事：说清不能发的、展开「范围重叠的会话」、群发上限。
- 优先提醒改由宿主直接告诉正在跑的那几轮。
- Coding 的叫醒循环搬到 `wake-loop.ts`（`routes.ts` 1522 → 1454 行），状态词表补了两种新状态。
- 改写的用例：`coding-message-wait`、`coding-queued-round`、`coding-delegation-waits`、`coding-cooperation-http`、`coding-step-claims`（只改了 `claims` → `node`）、`prologue-adoption-guard`（S-23 改述）、`vendor-provenance`（期待的提交号还是 `b01067b4`，换包时改成实际的那一个）。

**恢复时按这个顺序**：
1. **补跑 Prologue main `b01067b4`**（构建锁下，`~/code/prologue-p2j` 已停在 detached `b01067b4`）。
   - 命令：`zsh coordination/2026-10-14/tools/prologue-verify.sh ~/code/prologue-p2j main-b01067b4 <P2h 的包>`。
   - P2h 的包：另一会话 scratchpad 里的 `prologue-verify/p2h-3/prologue-sdk-0.0.0-rc.1.tgz`，1,163,878 字节，SHA-256 `7e728f4a…`，由 `4416fc09` 打出，与 #19 的 head 相比 src 相同。找不到就省略第三个参数，并写明。
   - 结果补进合同 P2i、P2j 的「验证」行。
2. **P2k 验证**：在 `~/code/prologue-p2k` 跑同一个脚本，第三个参数用第 1 步打出的包，新加的消费者脚本在那个包上应当失败。
   - 公开面快照若变了，逐项核过再 `-u`。
   - 结果写进 #25 的「验证」与合同的 P2k 进度条，转为 ready，发统筹合。
3. **P3a 按 B 继续**：
   1. #498 合入后变基到 main。
   2. 从 P2k 合入后的 main 打包换进 vendored 目录：删掉过渡包，记进 `patch-history.json`；`commitsChecked` 加上过渡包的提交与新包的提交；锁文件只改 `@prologue/sdk` 的路径和 integrity（依赖相同，都是 `@tauri-apps/api` 2.11.1）；`vendor-provenance` 用例的提交号、PR 号跟着改。
   3. 构建锁下 `pnpm build`，修编译错误。
   4. 跑 `affected-tests` 选出的用例和本文 §7.10 的默认路径清单，另外改到能过：`coding-collab-handoff`、`coding-session-messages`、`coding-background-wait`、`coding-step-claims`、`prologue-taskboard`、`prologue-subagents`、`coding-taskboard.e2e`。
   5. 加并发用例：两个会话同时汇报，都成功；同一步被别人改过的那一方得到明确的冲突。
   6. `pnpm api:update`、`pnpm actions:update`；`page-assets` 量两个新状态词（只许变小，超了就在同一个文件里省字节）；`check-health-gates --base`。
   7. 写验证证据，开 PR。
4. 之后是 P3b（换模型之后撤权与「从断点继续」的用例，见 §5.6a 末尾）、P3c（外部条件检查器），再往后 P4。
