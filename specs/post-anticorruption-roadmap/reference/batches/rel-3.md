# REL-3 · 本机日志、崩溃恢复与诊断包

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-2](rel-2.md) · [下一批 REL-4](rel-4.md) · [执行规则](../execution-rules.md)

<a id="rel-3"></a>

## 给人讲清楚

装在别人机器上出了问题，要能看到发生了什么：日志脱敏后存在本机、按大小和天数轮转；Node 和 Rust 崩溃了能捕获并接着重启；需要时导出一份诊断包给你看。开发阶段你们直接看终端和开发日志，所以挪到这里。平台包往哪里记日志（BL-812 的注入日志端口）是开发也要的平台能力，不随本批挪：谁先用到谁定，第 75 批或本批，另一方沿用。需要你做的：看诊断包里会带哪些内容。

## 交付与前置

- **阶段／类型**：发行；底层与架构
- **需求来源**：[C 端就绪 C-5A][CEND]
- **前置／待决**：开工由用户定；先核已有 logger；BL-812 的日志端口若 75 已定就沿用，没定由本批定（端口放在哪、什么形状，开工时问用户，见 BL-812）；发布符号的上传位置从 26-9 的发行配置读
- **可并行项**：REL-2、REL-4
- **UI 要求**：复用：诊断导出沿 [runtime-and-recovery](../../../../docs/design/runtime-and-recovery/README.md) 已定样

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-3-item-1"></a>本机日志、崩溃恢复与诊断包 | 按 C-5A 先核已有 logger，补脱敏结构化日志落盘／按大小和天数轮转、Node／Rust 崩溃捕获与重启衔接、发布符号和诊断导出。原 [26-4](26.md#batch-26-item-4) | 05、25（已合入）；BL-812 的日志端口（与 75 谁先用谁定） |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-3「本机日志、崩溃恢复与诊断包」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-3.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

发行批：我没明确说这一批开工之前，只做只读核查和设计（手册「发行批」）。发行用的配置只改 26-9 收拢的那一份发行配置，不在代码里另写；要改 CI 工作流、动凭据或真实账号，先问我。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/BACKLOG.md

本批交付：
1. 本机日志、崩溃恢复与诊断包（本批文件 #rel-3-item-1）

界面：诊断导出复用已定的样（docs/design/runtime-and-recovery/）。

本批另有：
- 日志里不出现密钥、令牌和用户内容原文；脱敏规则带拒绝测试。
```

[ASC]: ../../../assistant-service-connections/spec.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
