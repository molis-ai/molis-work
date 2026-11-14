# SRV-1 · 共同设计与对账

[执行目录](../../spec.md#execution-batches) · [服务端批总则](../server-batch.md#server-batch) · [下一批 SRV-2](srv-2.md) · [执行规则](../execution-rules.md)

<a id="srv-1"></a>

## 给人讲清楚

个人数据跨设备同步和团队协作都需要服务端，开工时间由你定（在 M1 发出之后）。这一批先对账、定规矩：拿当时的代码对一遍旧的个人同步分支，看哪些还能用、哪些要重写；定好身份、版本、查看／编辑／管理三档访问、多人同时改、撤销授权、离线和冲突、退出项目；定同步的规则，保证新服务能接受上一版客户端；核清团队记忆从哪来、用来干什么、谁能看。需要你做的：开工时间、同步接入方式（决定 13）和协作协议要你定；看同步、共享、冲突与实时协作的样子并定下。

## 交付与前置

- **阶段／类型**：服务端；产品线（同步、团队）；底层与架构
- **需求来源**：[个人同步][SYNC]、[同步基础][SYNCF]、[团队协作][TEAM]、[团队记忆][TMEM]、[升级持续可用][UPG]、[主线第三片][MLN]、[BL-070][BL]
- **前置／待决**：你定开工；57（M1 已发出）、21 的使用边界；要决策：同步接入方式（[决策记录](../decisions.md#section-7) 第 13 项）与协作协议
- **可并行项**：服务与账号条件核查
- **UI 要求**：先定样：同步、共享、冲突与实时协作切片

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-1-item-1"></a>个人同步分支对账 | 拿当时的 main 对一遍 `personal` 分支，列出还成立和要重写的适配；Goals 聚合按 44 之后的归属重切：项目指导、决定记录、要求认可各由平台主人声明自己的同步集合，Goals 只留 Goal 事实；引用核对与关联边分段按声明的同步集合走，不认 Goals 名字（2026-11-13，[决定 42](../decisions.md#decision-42)） | 共用本批前置 |
| <a id="srv-1-item-2"></a>身份、访问与协作协议 | 定身份、版本、三档访问、并发、撤权、离线／冲突、项目退出 | 共用本批前置 |
| <a id="srv-1-item-3"></a>同步合同、Outbox 与版本兼容 | 定同步合同及 Outbox（BL-070），协议接受上一版客户端，明确个人主线随后同步的边界 | 共用本批前置 |
| <a id="srv-1-item-4"></a>团队记忆来源、用途与访问边界 | 核团队记忆的来源、用途与访问边界 | 共用本批前置 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进路线书第 SRV-1 批「共同设计与对账」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/srv-1.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

服务端批：我没明确说开工之前，只做只读核查和设计（手册「服务端批」）。

原需求（行为与验收以它们为准）：https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md；https://github.com/molis-ai/molis-work/blob/personal/specs/plugin-sync-foundation/spec.md；specs/team-collaboration/spec.md；specs/team-memory/spec.md；specs/upgrade-continuity/spec.md；specs/work-mainline/spec.md；specs/BACKLOG.md

本批交付：
1. 个人同步分支对账（本批文件 #srv-1-item-1）
2. 身份、访问与协作协议（本批文件 #srv-1-item-2）
3. 同步合同、Outbox 与版本兼容（本批文件 #srv-1-item-3）
4. 团队记忆来源、用途与访问边界（本批文件 #srv-1-item-4）

界面：本批文件的界面要求是「先定样：同步、共享、冲突与实时协作切片」。写「先定样」的部分，按手册第五节的「定样怎么走」先出样，我确认后再写产品代码（组件板有新增部件的，还要先在本批分支上补成组件板标本、D 轨合审过）；写「复用」的部分沿已定交互。

本批另有：
- 当前 main 的对应文档：[个人云同步总纲](../../../personal-cloud-sync/spec.md)、[同步基础](../../../personal-cloud-sync/foundation.md)、[插件复制](../../../personal-cloud-sync/plugin-replication.md)；下面的 `personal` 分支 URL 保留为历史来源。
- 本批牵涉的待决：第 11 项（Sessions 会话交互和技术方案；创作台原 spec §7 的合同与交互；团队剩余细粒度规则、同步交互及团队记忆形成／融合／管理／使用策略）；第 13 项（个人同步采用按收尾后形状重接、整支变基，还是先停；重接是原建议，尚未决定）。没定之前只停依赖它的部分，不替我定。
```

[BL]: ../../../BACKLOG.md
[MLN]: ../../../work-mainline/spec.md
[SYNC]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md
[SYNCF]: https://github.com/molis-ai/molis-work/blob/personal/specs/plugin-sync-foundation/spec.md
[TEAM]: ../../../team-collaboration/spec.md
[TMEM]: ../../../team-memory/spec.md
[UPG]: ../../../upgrade-continuity/spec.md
