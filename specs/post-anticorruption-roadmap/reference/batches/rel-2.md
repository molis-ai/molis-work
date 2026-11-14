# REL-2 · 发行物：签名、公证与随包组件

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [上一批 REL-1](rel-1.md) · [下一批 REL-3](rel-3.md) · [执行规则](../execution-rules.md)

<a id="rel-2"></a>

## 给人讲清楚

把能装到别人 Mac 上的安装包做出来：用正式证书签名并公证，包里的 Node、原生模块和 Helper 逐个签好；第一次打开时检查随包组件在不在、能不能用，坏了能恢复；官方插件包用正式发布者密钥签，字体确认可以随包分发。签名身份、公证方式、证书引用都从 [26-9](26.md#batch-26-item-9) 的发行配置读，这一批只把发行档填满、把发行步骤接上。需要你做的：先办好 REL-1 的 Apple 凭据；看安装与自检的样子（已定，见下）。

## 交付与前置

- **阶段／类型**：发行；产品线（发布）；系统能力
- **需求来源**：[C 端就绪 M1][CEND]、[产品建议 A1～5／H14][P]
- **前置／待决**：开工由用户定；[26-9](26.md#batch-26-item-9) 的发行配置；真实签名与公证等 [REL-1 第 1 项](rel-1.md#rel-1-item-1)，没到之前用开发档（ad-hoc）把步骤走通
- **可并行项**：REL-3、REL-4
- **UI 要求**：复用：安装与自检已定样（[docs/design/runtime-and-recovery](../../../../docs/design/runtime-and-recovery/README.md)，用户 2026-11-04 五题选 A）

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-2-item-1"></a>签名、公证与安装 | Developer ID 签名、Resources 里各 Mach-O 逐个重签（Node 去掉 `get-task-allow`、Helper 按整个 bundle 签、`--options runtime` 带时间戳）、entitlements、公证与 `stapler`／`spctl` 校验、裁掉多余的 node-pty 预编译、安装说明；仓库侧草稿 [#1818](https://github.com/molis-ai/molis-work/pull/1818) 开工时同步 main 再接；安装说明、拷贝与签名清单不含 `goal-advance` Skill（44-7 已删）。原 [26-1](26.md#batch-26-item-1) | 26-9；REL-1 第 1 项（真实签名） |
| <a id="rel-2-item-2"></a>原生组件随包预置与首次自检 | 组件随包带上，首次启动自检、失败可恢复；开发机上组件本来就在，不受影响。原 [26-3](26.md#batch-26-item-3) | 25-1（已合入） |
| <a id="rel-2-item-3"></a>官方包与字体的发行核对 | 官方插件包与官方场景包（45-2、52-3 随安装包带上的那几套）改用正式发布者密钥签名（开发档用开发密钥，#1794 第 13 节）；核字体能否随包分发（从 [71-2](71.md#batch-71-item-2) 拆出） | 26-9；45-2、52-3 已做出对应的包 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-2「发行物：签名、公证与随包组件」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-2.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

发行批：我没明确说这一批开工之前，只做只读核查和设计（手册「发行批」）。发行用的配置只改 26-9 收拢的那一份发行配置，不在代码里另写；要改 CI 工作流、动凭据或真实账号，先问我。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；docs/product-operations/产品优化建议.md；docs/releases/POLICY.md；docs/releases/CHECKLIST.md

本批交付：
1. 签名、公证与安装（本批文件 #rel-2-item-1）
2. 原生组件随包预置与首次自检（本批文件 #rel-2-item-2）
3. 官方包与字体的发行核对（本批文件 #rel-2-item-3）

界面：安装与自检复用已定的样（docs/design/runtime-and-recovery/），不重新出样。
```

[ASC]: ../../../assistant-service-connections/spec.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
