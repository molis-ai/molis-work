# SRV-1 · 共同设计与对账

[执行目录](../../spec.md#execution-batches) · [服务端批总则](../server-batch.md#server-batch) · [下一批 SRV-2](srv-2.md) · [执行规则](../execution-rules.md)

<a id="srv-1"></a>

## 给人讲清楚

个人数据跨设备同步和团队协作都需要服务端，开工时间由你定（在 M1 发出之后）。这一批先对账、定规矩：拿当时的代码对一遍旧的个人同步分支，看哪些还能用、哪些要重写；定好身份、版本、查看／编辑／管理三档访问、多人同时改、撤销授权、离线和冲突、退出项目；定同步的规则，保证新服务能接受上一版客户端；核清团队记忆从哪来、用来干什么、谁能看。需要你做的：开工时间、同步接入方式（决定 13）和协作协议要你定；看同步、共享、冲突与实时协作的样子并定下。

## 交付与前置

- **阶段／类型**：服务端；产品线（同步、团队）；底层与架构
- **需求来源**：[个人同步][SYNC]、[同步基础][SYNCF]、[团队协作][TEAM]、[团队记忆][TMEM]、[升级持续可用][UPG]、[主线第三片][MLN]、[BL-070][BL]
- **前置／待决**：你定开工；56（M1 已发出）、21 的使用边界；要决策：同步接入方式（[决策记录](../decisions.md#section-7) 第 13 项）与协作协议
- **可并行项**：服务与账号条件核查
- **UI 要求**：先定样：同步、共享、冲突与实时协作切片

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="srv-1-item-1"></a>个人同步分支对账 | 拿当时的 main 对一遍 `personal` 分支，列出还成立和要重写的适配 | 共用本批前置 |
| <a id="srv-1-item-2"></a>身份、访问与协作协议 | 定身份、版本、三档访问、并发、撤权、离线／冲突、项目退出 | 共用本批前置 |
| <a id="srv-1-item-3"></a>同步合同、Outbox 与版本兼容 | 定同步合同及 Outbox（BL-070），协议接受上一版客户端，明确个人主线随后同步的边界 | 共用本批前置 |
| <a id="srv-1-item-4"></a>团队记忆来源、用途与访问边界 | 核团队记忆的来源、用途与访问边界 | 共用本批前置 |

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进路线书第 SRV-1 批「共同设计与对账」。完成程度按本批每项交付写的来（定样、合同、实现或验收），不停在方案、原型或几个样例，也不自行降级。PR 按第七节的粒度开，交统筹审和合并。

前提：服务端批什么时候开工由我定（决策记录第 24 项）。我没明确说这一批开工之前，只做只读核查和设计准备，不部署、不开账号、不产生费用。

一、先读
- 本批文件：specs/post-anticorruption-roadmap/reference/batches/srv-1.md。交付、前置、可并行项和界面要求都以它为准；它和这段 prompt 对不上时以它为准，并顺手改正这段。
- 规则：AGENTS.md；specs/post-anticorruption-roadmap/reference/execution-rules.md；specs/post-anticorruption-roadmap/reference/development-workflow.md；specs/post-anticorruption-roadmap/reference/tracks.md
- 原需求（行为与验收以它们为准）：https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md；https://github.com/molis-ai/molis-work/blob/personal/specs/plugin-sync-foundation/spec.md；specs/team-collaboration/spec.md；specs/team-memory/spec.md；specs/upgrade-continuity/spec.md；specs/work-mainline/spec.md；specs/BACKLOG.md

二、开工前先跟我讲清楚（大白话）
先核对现状：main 上已经有什么、前置批次是否真的合入、有没有在途 PR 在做同样的事。然后用大白话跟我讲：这批做什么、要解决什么问题、做完我能看到或用到什么、为什么排在这里、需要我做什么。不用包名、合同、schema、编号这类词，非用不可时顺带解释一句。本批文件「给人讲清楚」一节是底稿，按核对结果改。讲完就继续做，不用等我回话。

三、本批交付
1. 个人同步分支对账（本批文件 #srv-1-item-1）
2. 身份、访问与协作协议（本批文件 #srv-1-item-2）
3. 同步合同、Outbox 与版本兼容（本批文件 #srv-1-item-3）
4. 团队记忆来源、用途与访问边界（本批文件 #srv-1-item-4）
每片开工前先在认领板（GitHub issue #1743）认领，再按需求开发流程第 2.1 节说明这一片，再在原需求里答第 4 节的开工前检查。已经做了的先核回，只做缺口。

四、前置与顺序
按本批文件的「前置／待决」和每项的「该项前置」逐条核；没就绪的只停那一项，其余照做。合同先单独一个 PR（轨道规则 1），服务再接，消费者最后。可并行项只做设计、只读核查或等待期间的独立工作，不把后续依赖当成已经能开工。
本批牵涉的待决：第 11 项（Sessions 会话交互和技术方案；创作台原 spec §7 的合同与交互；团队剩余细粒度规则、同步交互及团队记忆形成／融合／管理／使用策略）；第 13 项（个人同步采用按收尾后形状重接、整支变基，还是先停；重接是原建议，尚未决定）。没定之前只停依赖它的部分，不替我定。

五、界面
本批文件的界面要求是「先定样：同步、共享、冲突与实时协作切片」。写「先定样」的部分，先做可操作的样（组件板标本或预览页，2～3 个方案，正常与异常状态都有），我看过定下、记进原需求的决策记录后再写产品代码（需求开发流程第 5 节）；写「复用」的部分沿已定交互。
凡是碰到界面的部分（新做、复用、改文案或修缺陷都算），都按我对界面、设计、交互、视觉和使用体验的高要求做：样和产品代码都用组件板 /__ui/catalog 的实件，守 DESIGN.md、specs/craft-finish/spec.md 和 specs/ui-craft-floor/spec.md；空间、光影与阴影、动效与曲线、反馈、留白、内容布局、色彩逐项做到位，中英文、浅深色、1440／1024／390 宽都看过，不以「能用」或「测试过了」交差。组件板上没有的部件标「组件板新增」，定下后先补成组件板标本再进产品（需求开发流程第 5 节）。界面与体验类的完成，以我本人看实物验收为准。

六、边界
- 一条轨道同一时间一个写手；要改别的轨道独占的文件，由那条轨道落，你的片叠在后面（轨道规则 7）。
- 不碰真实 Home（4207／4208 端口、~/.molis-work）；不换 vendor/prologue-sdk；不放宽门禁、不删断言、不为变绿跳过用例；不加兼容读取或迁移，除非已写进 docs/system/CONTRACT-CHANGES.md 的「当前保留机制」并经我确认。
- 只做本批的交付，后面批次的内容不提前做；发现本批范围要变，先改本批文件和原需求，再跟我说。

七、验证与完成
- 每项按原需求的验收编号验：用 node scripts/affected-tests.mjs 挑相关用例，node scripts/run-tests.mjs 跑；浏览器用例按机器槽位排，一台机器同时一个构建、一个测试；全量由统筹在集成分支跑，你不跑全量。
- 工程验证、真实操作和本人验收分开记；要我本人验收的列进 BACKLOG「待你验收」，不代我验收。
- PR 粒度：一项交付完整做完，或者别的片真要先用到它时，才开 PR；同一项的后续步骤叠在同一个分支上，不为每一步各开一个，也不开草稿 PR 占位；合同改动先单独开小 PR（需求开发流程第 8 节、轨道规则 1）。
- PR 按模板填，「开工前检查」一节贴检查结果和定样决定；推送前先 git fetch origin main 再跑 pnpm secrets:check；合并交统筹，你不合。
- 每片合入后在本批文件补日期、PR 和剩余项，并在认领板改状态；全部交付都验过，本批才算完成。

八、什么时候停下问我
碰到我没定过的事、红线（需求开发流程第 4 节）、界面定样、要动真实 Home／账号／费用／对外发布，或本批文件和代码现状对不上、要改范围时。问的时候给 2～3 个方案，标出推荐和各自的代价。
```

[BL]: ../../../BACKLOG.md
[MLN]: ../../../work-mainline/spec.md
[SYNC]: https://github.com/molis-ai/molis-work/blob/personal/specs/personal-cloud-sync/spec.md
[SYNCF]: https://github.com/molis-ai/molis-work/blob/personal/specs/plugin-sync-foundation/spec.md
[TEAM]: ../../../team-collaboration/spec.md
[TMEM]: ../../../team-memory/spec.md
[UPG]: ../../../upgrade-continuity/spec.md
