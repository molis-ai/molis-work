# SRV-5 · 个人同步完整交付

[执行目录](../../spec.md#execution-batches) · [服务端批总则](../server-batch.md#server-batch) · [上一批 SRV-4](srv-4.md) · [下一批 SRV-6](srv-6.md) · [执行规则](../execution-rules.md)

<a id="srv-5"></a>

## 给人讲清楚

个人同步的完整交付：所有插件和个人事项都能同步，逐个插件列清覆盖和缺口；能整项目复制和回收；用两台真实 Mac、不同版本的客户端验证事项顺序和工作接续；验证附件、大文件、损坏、断点恢复和冲突历史；在正式环境验证真实限额、负载、告警、备份和恢复演练，和本机模拟的结果分开记。需要你做的：准备真实设备和账号；同步异常和项目生命周期的差异会做样给你看。

## 交付与前置

- **阶段／类型**：服务端；产品线（同步）；底层与架构
- **需求来源**：[个人同步][SYNC]、[插件复制][SYNCP]、[主线第三片][MLN]、[升级持续可用][UPG]
- **前置／待决**：SRV-2；主线数据在 36／37／52 就绪，跨项目视图按 63 覆盖；真实设备／账号条件具备
- **可并行项**：SRV-8 的安装与恢复说明走读
- **UI 要求**：复用 SRV-1、SRV-2；同步异常与项目生命周期差异先定样

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-5-item-1"></a>逐插件同步、完整历史与公开插件接入 | 其余插件及个人主线的声明，逐插件列出覆盖与缺口；逐 owner 验完整历史／附件、关联删除与冲突，按原覆盖表接 Work／Coding／Workflows／Schedule 等且接收不执行；用只装公开包的独立插件验证安装、停用、注销和重新发现，不用内置名单冒充扩展能力 | 共用本批前置 |
| <a id="srv-5-item-2"></a>全插件同步、项目复制与回收 | 全插件自动／手动同步、整项目复制／回收、异常恢复、配额／保留／删除 | 共用本批前置 |
| <a id="srv-5-item-3"></a>双 Mac、跨版本与工作接续验收 | 两台真实 Mac 验跨版本客户端、主线顺序及工作接续，完成正式服务交付 | 共用本批前置 |
| <a id="srv-5-item-4"></a>附件、大对象与故障恢复验收 | 验完整附件与大对象、损坏／丢回执／断点恢复、冲突双方历史及删除回收 | 共用本批前置 |
| <a id="srv-5-item-5"></a>正式服务限额、监测与备份恢复 | 正式环境验真实限额与负载、告警、配对数据备份、只读止损和恢复演练，和本机模拟证据分开 | 共用本批前置 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进路线书第 SRV-5 批「个人同步完整交付」。完成程度按本批每项交付写的来（定样、合同、实现或验收），不停在方案、原型或几个样例，也不自行降级。PR 按第七节的粒度开，交统筹审和合并。

前提：服务端批什么时候开工由我定（决策记录第 24 项）。我没明确说这一批开工之前，只做只读核查和设计准备，不部署、不开账号、不产生费用。

一、先读
- 本批文件：specs/post-anticorruption-roadmap/reference/batches/srv-5.md。交付、前置、可并行项和界面要求都以它为准；它和这段 prompt 对不上时以它为准，并顺手改正这段。
- 规则：AGENTS.md；specs/post-anticorruption-roadmap/reference/execution-rules.md；specs/post-anticorruption-roadmap/reference/development-workflow.md；specs/post-anticorruption-roadmap/reference/tracks.md
- 原需求（行为与验收以它们为准）：https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md；https://github.com/molis-ai/molis-work/blob/personal/specs/personal-plugin-replication/spec.md；specs/work-mainline/spec.md；specs/upgrade-continuity/spec.md

二、开工前先跟我讲清楚（大白话）
先核对现状：main 上已经有什么、前置批次是否真的合入、有没有在途 PR 在做同样的事。然后用大白话跟我讲：这批做什么、要解决什么问题、做完我能看到或用到什么、为什么排在这里、需要我做什么。不用包名、合同、schema、编号这类词，非用不可时顺带解释一句。本批文件「给人讲清楚」一节是底稿，按核对结果改。讲完就继续做，不用等我回话。

三、本批交付
1. 逐插件同步、完整历史与公开插件接入（本批文件 #srv-5-item-1）
2. 全插件同步、项目复制与回收（本批文件 #srv-5-item-2）
3. 双 Mac、跨版本与工作接续验收（本批文件 #srv-5-item-3）
4. 附件、大对象与故障恢复验收（本批文件 #srv-5-item-4）
5. 正式服务限额、监测与备份恢复（本批文件 #srv-5-item-5）
每片开工前按需求开发流程第 2.1 节说明这一片，再在原需求里答第 4 节的开工前检查。已经做了的先核回，只做缺口。

四、前置与顺序
按本批文件的「前置／待决」和每项的「该项前置」逐条核；没就绪的只停那一项，其余照做。合同先单独一个 PR（轨道规则 1），服务再接，消费者最后。可并行项只做设计、只读核查或等待期间的独立工作，不把后续依赖当成已经能开工。

五、界面
本批文件的界面要求是「复用 SRV-1、SRV-2；同步异常与项目生命周期差异先定样」。写「先定样」的部分，先做可操作的样（组件板标本或预览页，2～3 个方案，正常与异常状态都有），我看过定下、记进原需求的决策记录后再写产品代码（需求开发流程第 5 节）；写「复用」的部分沿已定交互。

六、边界
- 一条轨道同一时间一个写手；要改别的轨道独占的文件，由那条轨道落，你的片叠在后面（轨道规则 7）。
- 不碰真实 Home（4207／4208 端口、~/.molis-work）；不换 vendor/prologue-sdk；不放宽门禁、不删断言、不为变绿跳过用例；不加兼容读取或迁移，除非已按防腐线的保留机制经我确认。
- 只做本批的交付，后面批次的内容不提前做；发现本批范围要变，先改本批文件和原需求，再跟我说。

七、验证与完成
- 每项按原需求的验收编号验：用 node scripts/affected-tests.mjs 挑相关用例，node scripts/run-tests.mjs 跑；浏览器用例按机器槽位排，一台机器同时一个构建、一个测试；全量由统筹在集成分支跑，你不跑全量。
- 工程验证、真实操作和本人验收分开记；要我本人验收的列进 BACKLOG「待你验收」，不代我验收。
- PR 粒度：一项交付完整做完，或者别的片真要先用到它时，才开 PR；同一项的后续步骤叠在同一个分支上，不为每一步各开一个，也不开草稿 PR 占位；合同改动先单独开小 PR（需求开发流程第 8 节、轨道规则 1）。
- PR 按模板填，「开工前检查」一节贴检查结果和定样决定；推送前先 git fetch origin main 再跑 pnpm secrets:check；合并交统筹，你不合。
- 每片合入后在本批文件补日期、PR 和剩余项；全部交付都验过，本批才算完成。

八、什么时候停下问我
碰到我没定过的事、红线（需求开发流程第 4 节）、界面定样、要动真实 Home／账号／费用／对外发布，或本批文件和代码现状对不上、要改范围时。问的时候给 2～3 个方案，标出推荐和各自的代价。
```

[MLN]: ../../../work-mainline/spec.md
[SYNC]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md
[SYNCP]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-plugin-replication/spec.md
[UPG]: ../../../upgrade-continuity/spec.md
