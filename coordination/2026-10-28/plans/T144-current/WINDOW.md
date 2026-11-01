# T144 有限窗口交接（负责人：开发线3）

状态：**窗口附页已准备，等根正式交实施窗口；本轮仅写本页。** 保留原 [PLAN](PLAN.md)、[REVIEW](REVIEW.md) 及[完整 A–D 工程书](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T144/PLAN.md)，不重写矩阵、不降为 A/B 切片完成。原 owner 开发线3，后续目标仍 RAC-2636～2643 / S-105 的 A–D 完整实现。

## 准确父输入和已解除的等待

- 拟执行基点 M=`08642dcb92dbdad029d990813da56682d6864a23`，tree=`1a5141a207f7af8aeda53c70f5bba1e8b3daf6bd`；从该已采用提交新建独立树，不在主检出或 PR1b 树开发。正式开工只复核届时根指定 M 的真实增量。
- T143 父条件已满足。本轮再次用 Git 对象比较原 T143 H58a1713c 与 M 的九个既定父接缝，差异为空；不恢复旧 WAIT，不重审 T143 矩阵。
- 根已通知 PR1b 推至 H=`3421e0e69645a7ac247672c590951bce3a9c5765`、base main；这是根的远端核收事实，本页未另查 GH，也不把“已推送”写成“已采用”。本轮只读核其原作者树 HEAD 同 H、clean。其新 API 不是 T144 产品前置，不复制未采用 PR1b 实现。
- 根本次明确允许 T144 在**主线的 Assistant 末端 handoff 接缝**实施原 C 项。旧 REVIEW 的这项待裁定已解除；#1101 保护分支不改、不检出、不取实现，未来由根/原 owner 普通合成。仍保留原 caller/lifecycle 检查；T144 的来源检查仅约束本次 handoff，不能改成持续 beforeDispatch/action guard 或撤销后整轮取消。

PR1b [SDK-WINDOW](/private/tmp/t116-pr1b-evidence/SDK-WINDOW.md) 的准确冻结引用如下；本页更新引用，不改原冻结文件或四份源码/快照。后续 T144 获窗口只在自己的 M 派生树写独立差量。

| PR1b 冻结路径 | H3421 的 blob |
| --- | --- |
| `packages/plugin-sdk/src/manifest.ts` | `0373dc1de41d7b7d675edb180e5d9552e2a7df42` |
| `packages/plugin-sdk/src/index.ts` | `da9ce027f88978ba61f6dc6649487563c4389ac9` |
| `tooling/gates/api/contracts/platform/plugin.txt` | `67491f79ec26322989af828ee9e405ad82c84596` |
| `tooling/gates/api/plugin-sdk/index.txt` | `24884fed5227b075a38600000052ebd82b9f6066` |

T144 的 parser/export 只补 wire 正文声明、唯一派生 helper、空 tools 与签名来源；将来正常吸收已采用 PR1b 时保留 pageRouteProblems、page_routes 与公开导出及可信名拒绝。快照按实际组合源码生成，不整文件取边或手拼。PR1b 若需要回写这四文件，先由根重新串行交接。

## T141 当前阻断点：四路径整文件留给开发线1

依据根本轮指令及 [NEXT-WINDOWS](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/parallel-2026-11-01/NEXT-WINDOWS.md)。即便同文件不同函数，本线也不提前写。

| 路径 | T141 当前写入 | T144 待交接内容与阻断结果 |
| --- | --- | --- |
| `apps/local-host/src/home-installed-plugins.ts` | `installPackage` 的 Home install/upgrade 路由 | `registerPrompts`、`declaredPrompts`、forget 的完整 registration 接线；A 的 Home 启停/恢复闭环须等此文件冻结，不能只凭项目路径报完成 |
| `apps/local-host/src/plugin-install-service.ts` | `confirm` 的 Home 拒绝与原 preflight | preview 的 `agent_bodies`、全文变化比较及同 held 包消费；B/D 的真实签包预览链须等交接，不提前改 imports/types 或 preview |
| `apps/workbench/src/settings-plugins.ts` | `load/review` 的 Home 旧版本与 service origins DOM | 同 review 追加角色/方法逐条正文预览；保留 T141 的 scope/current/origins 与取消/确认流程；真实 DOM 验收须等交接 |
| `tests/security-invariants-plugin-install.test.ts` | 整文件 | T144 安装拒绝断言等交接后追加，保双方旧断言，并运行最终组合完整文件 |

交接所需是 T141 作者冻结 H、这四文件 scoped diff 和相关有效验证原件；由根明确接入已采用结果或具体合成安排，本线不自行取候选。T141 的 Home 就地升级不变成 T144 原需求前提，也不因随后可用而静默扩大 RAC-2643。未拿到四文件时，可做下表独立部分，但 A–D 完整产品仍未闭合。

## 正式派发后可先写的原允许源码

下列只是从原精确表扣除上述四文件及共享词典所得的执行分组，不新增路径。表内缩写严格限定：`H/`=`apps/local-host/src/`，`W/`=`apps/workbench/src/`，`A/`=`apps/local-host/src/assistant/`。

| 顺序/职责 | 精确路径及函数边界 |
| --- | --- |
| wire/SDK 合同 | `packages/contracts/src/platform/plugin-package.ts`、`packages/contracts/src/platform/plugin.ts`、`packages/contracts/src/services/agent-definitions.ts`、`packages/contracts/src/services/assistant.ts`；`packages/plugin-sdk/src/manifest.ts`、`agent-declarations.ts`、`index.ts`及同目录拟新增 `sandbox-agent-declarations.ts`。只做原 wire/effective 分离、声明/来源/id 与公开导出 |
| 验签、读取、持久恢复 | `packages/plugin-runtime/src/package-verification.ts`；`H/sandbox-package.ts`、`H/sandbox-plugin-manifest.ts`、`H/sandbox-package-store.ts`、`H/installed-release.ts`、拟新增 `H/sandbox-agent-bodies.ts`。签名仍对原 wire payload，正文从已验签资源派生 |
| A：唯一 registration 与项目/执行器接线 | `H/plugin-instructions.ts`、`H/plugin-builder/prompts.ts`、`H/plugin-builder/installed.ts`、`H/installed-plugin-definition.ts`、`H/installed-plugin-host.ts`、`H/installed-plugin-lifecycle.ts`、`H/installed-plugin-version.ts`、`H/plugin-host-services.ts`、`H/home-plugin-executor.ts`；`packages/plugin-sandbox/src/services.ts`。Home 安装回调仍等四文件交接；T141 对 lifecycle/version 仅条件只读，若其实际需要写先回根协调 |
| B：既有 owner 的覆盖/来源/展示 | `H/agent-definitions/agent-definitions.ts`、`H/agent-definitions/agent-declarations.ts`、`H/agent-definitions/agent-definitions-http.ts`、`W/settings-prompts.ts`；`tests/fixtures/home-store-schemas/agent-definitions.sql`。复用原 owner 的 history/uses，不能加平行正文或身份账 |
| 安装动作声明 | `H/plugin-install-actions.ts` 的 preview@4/schema/引用；可以先准备差量，接入和完整运行需等 install-service/真实 review，不以独立 action 编译当闭环 |
| B/C/D：选择、来源、交付末端 | `A/assistant-http.ts`、`A/assistant-service-shared.ts`、`A/assistant-work-reads.ts`、`A/assistant-send-materials.ts`、`A/assistant-round-materials.ts`、`A/assistant-rule-actions.ts`、`A/assistant-service.ts`、`A/assistant-dispatch.ts`、`A/assistant-inputs.ts`、`A/assistant-executor.ts`、`A/assistant-present.ts`、`A/assistant-store.ts`；`W/scripts/client/assistant-composer.ts`、`W/scripts/client/assistant-send.ts`。store 仅保原 round materials 引用；dispatch/executor 的 beforeStart/assertBeforeStart、inputs 最终 send 与工具 beforeEffect 仍按原 C 项，不增加持续撤销机制 |

原两份新增 signed-agent 测试、两个签包 fixture 和其它具名完整测试仍限工程书的原允许范围；四文件外可按实际实现补断言。不改任一具体执行方或 Prologue inlineMethods，不重复父矩阵。实现第一步落入已获裁定的同一 accepted §7 修订；文档/生成表由根串行收差量，不能把本页当新的需求书。

## R-A4 / T392 当前新增交集

已读 T392-current PLAN/REVIEW、原 inventory、根 NEXT-WINDOWS，并只读 `/private/tmp/t392-dev` 当前相对 M 的实际 staged/unstaged 路径与 `shared-docs-candidate.patch`。该树尚未提交，以下是当前工作差量观察，不把它当冻结 H 或远端排他锁。未重建 152 文件矩阵。

- **源码只有 `apps/workbench/src/i18n/en.ts` 共同命中。** T392 实际只将 `FUNCTIONS_EN` 的 `../functions/en.js` 改为 `../judgment-rules/en.js`；T144 原授权仅增加本片文字。不同 hunk，仍等根给这一个文件的短冻结交接，不在 T392 写入期间改整份词典；新目录没有采用前不把其 import 复制进 T144 的 M 树。
- **当前实际文档候选交集四份**：`docs/platform/PROLOGUE-AI.md` 的判断规则目录注记、`docs/releases/CHECKLIST.md` 的 Functions schema 源码链接、`skills/molis-plugin-dev/SKILL.md` 的系统模块/编辑器路径、`specs/repository-anti-corruption/privileges.md` 的 PG010/034/045 路径。T144 是签名正文/来源/handoff、S105 及本片条目；由根逐 hunk 串行收，保留迁移后的现行路径与原库名/owner。原候选集合还含 BACKLOG，但 T392 当前共享候选不写它，不将候选命中夸成正在写。
- **无新增核心交集**：T392 37 移动路径及当前源码/测试差量不含 T144 SDK/parser、wire、正文注册、Assistant 或四个 T141 阻断路径；不新增 T392 整单等待。私有依赖/registry/lock、包清单、error-owner 与资源结算仍归 T392/根，T144 不借本窗口改它们。以后真实差量扩展时再交具体 hunk。

## 可执行次序和完成边界

1. 根正式派发后，从指定 M 建独立树，核原范围及四文件冻结；按上表先完成 wire→正文→唯一登记/覆盖→Assistant 精确引用与本次 handoff。保持四阻断文件及词典未写；这只是顺序，不能以半片交付替代 A–D。
2. T141 冻结交回后，由根安排正常接入，串行补 Home registration、预览/确认消费、设置 DOM 和共享安装测试；同时交词典与必要文档短窗口。保留 T141 升级/preflight/origins 与 T144 正文的各自语义。
3. PR1b 若先采用，正常 merge 已采用 main，核实际 parser/export/快照差量；#1101 将来由根/原 owner 普通合成，核 T144 本次 handoff 和其持续 lifecycle guard 两套不同边界。均不 rebase/force，不动保护树，不整文件覆盖。
4. 原 A–D、真实签包/角色与方法消费、覆盖重启/长标识、末端反证、实际模型输入与真实体验分层验收全保留。沿原具名完整文件、匹配整体 build、非重复有效证据核抵、实际 served 资源与 API/actions；所有 build/test 走公共唯一槽，隔离 Home/browser、jobs1、无 retry。本机不 Full，full=true 仍由根安排；推送/PR/采用另依根授权。

本轮未改原 PLAN/REVIEW、PR1b、产品、共账或任何保护分支；未创建工作树/refs、fetch/GH、build/test。唯一新增文件为本 WINDOW.md；完成后等根正式实施窗口。
