# 防腐后路线书 · 执行目录

状态：执行中（2026-11-24 核对第 36A、37、44B、47 批）。没有统筹会话（2026-11-14 用户定，[决定 44](reference/decisions.md#decision-44)）：排期由各批主会话在收尾时维护（[批次执行手册](reference/batch-runbook.md)第十节），实施、评审、合并也由各批主会话一个会话做完（[决定 26](reference/decisions.md#decision-26)、[决定 34](reference/decisions.md#decision-34)），谁在做哪一项看[认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743)。各批合入记录见下表与对应批次页，本人验收见各批关联待办。

**当前入口：[批次 01～27 的结算与剩余](reference/batches/) · [认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743) · [本人试用单](reference/acceptance-01.md)。** 批次文件记排期与合入结果，实时认领、分支和状态以认领板最新正文/评论为准。

**从 01 往下做。** 同一批次下，每个独立交付各占一行；点内容看该项产出和前置，点批次号看共同约束、来源、并行和 UI 要求。批次号保持不变；同批无关的子项不互相等待，有先后的写在该项前置里。每批一个文件：开头「给人讲清楚」用大白话说这批做什么、为什么做，末尾「Goal Prompt」可整段交给执行会话。每项开始前按[需求开发流程](reference/development-workflow.md#kickoff-brief)先用大白话讲清要做什么，再给技术说明。

**谁在做什么看[认领板](https://github.com/molis-ai/molis-work/issues/1743)**（置顶的 GitHub issue，用户 2026-11-03 定）：每项交付一行，记认领的会话、分支／PR 和状态。开工前先在那里认领，状态变了就改；本目录和批次文件只记排期与合入后的结果，不记「正在做」。

验收编号：不适用（排期文档；验收以各原需求书为准）。

<a id="execution-batches"></a>

## 01～112

2026-11-18 按未开工批次复查调整（[决定 52](reference/decisions.md#decision-52)）：新增 36A 逐屏打磨（排在 37 前）与 63A 记忆 P2（从 64 拆出），72 并入 77，各批的前提、范围与前置按代码更正，见各批次文件「11-18 复查」一节。同日新增 [91](reference/batches/91.md)（决定 54）并随后合并全产品界面／布局／行为反馈打磨与开发指引收口，拆成紧邻双段 [91（91A）](reference/batches/91.md) 与 [91B](reference/batches/91b.md)（按最大批号编在 90 后，实际前置为 35-2、36A、37-2，不等 38～89；[90](reference/batches/90.md) 仍为整条路线最终交付对账，[决定 55](reference/decisions.md#decision-55)）。

2026-11-18 确认 22 条独立待办的归属。7 条并入 6 个原交付项，另外 15 条编为 92～99。各项按实际前置开工，第 90 批仍负责最终对账。见[正式排期与开工 Prompt](reference/backlog-dispatch-2026-11-18/README.md)。

2026-11-20 按全仓体检与决定 57 两轮红队终校调整（[决定 58](reference/decisions.md#decision-58)）：不砍任何既有批次、不做大规模拆迁、100% 保留全部 AI Harness 与 RSI 工程优化；按最大批号追加 6 个横向修复与硬化正式批次 [100](reference/batches/100.md)～[105](reference/batches/105.md)（按各自真实前置开工，**不等 38～89**），同步校准 [91](reference/batches/91.md)、[91B](reference/batches/91b.md)、[62](reference/batches/62.md) 等批次的红队护栏，第 90 批仍为整条路线最终交付对账。

2026-11-22 按「特殊逻辑平民化 + 统一工作分区」终审合并拍板（[决定 66](reference/decisions.md#decision-66)；决定 64/65 规格已由 `#2259` 确立，`91-0c` 代码实现 PR 排在 `111` 之后、`91A` 与 `91B` 之前合入）：新增 [44B](reference/batches/44b.md)（已随 `#2262`/`#2279`/`#2294`/`#2308` 合入：特殊逻辑平民化，Shelf 剥离插件壳收归纯平台 `modules/shelf` / `system.shelf`、彻底删旧 Alchemist 与 `better-sqlite3`、官方集成驱动化、G1 门禁；两轮复核余项于 2026-11-24 随 `#2311` 增开 [44C](reference/batches/44c.md)）与按 V1 先加后迁再删的 6 个统一工作分区正式批次 [106](reference/batches/106.md)～[111](reference/batches/111.md)（20 个平等内置插件，零 `always_on`/`dual_instance`/普通 `scope:"home"`、星型版本化 Push、Clean v1、G1～G5 门禁）。在途待合前置 PR（`#2239`、`#2258`、`#2253`～`#2255`、`#2257`、`#2250`、`#2260`）及 `106`（`#2314`～`#2323`）、`107`（`#2325`／`#2329`）均已合入消费；`44B`、`44C` 与 `106`～`112` 排在 `91-0c`、`91A`、`91B`、`104`、`105`、`45`～`90`、`REL-4`、`SRV` 之前，[第 90 批](reference/batches/90.md)仍为整条路线最终交付对账。

2026-11-25 按全量待推进批次逐批方案优化与拍板（[决定 68](reference/decisions.md#decision-68)）：专项新增 [112](reference/batches/112.md)（`112-1` 彻底删除 `jelly-whisper` 与 626 MB Whisper 模型下载链并更名 `molis-material` 补日文 OCR；`112-2` 将 `Jelly` 瘦身为 4 张关系表：日历＋极简随手记，砍除私有 AI 与独立模型台，排在 `108` 与 `54` 之前），结清决定 16（`BL-128`）、决定 18、QA 7 项待定与 `BL-812`，在 [63-2](reference/batches/63.md#batch-63-item-2) 增设按需懒加载的图形化「`设置 › 评测`」后台，并按清晰子 PR 校准阶段 2～4、`REL-1`～`5`（M1 `1.0.0` Apple Silicon `arm64` 单架构）及 `SRV-1`～`8` 全线方案。

| 批次 | 批次内内容 |
| --- | --- |
| [01](reference/batches/01.md) | [基线、旧成果与在途需求核对](reference/batches/01.md#batch-01-item-1) |
|  | [归档、状态修正与验收单](reference/batches/01.md#batch-01-item-2) |
| [02](reference/batches/02.md) | [遗留事项、主人与唯一待办](reference/batches/02.md#batch-02-item-1) |
|  | [共享核心、SQLite 驱动与合同复位](reference/batches/02.md#batch-02-item-2) |
|  | [版本归一与重建清理](reference/batches/02.md#batch-02-item-3) |
|  | [升级起点与合同规则 U0](reference/batches/02.md#batch-02-item-4) |
|  | [对外许可口径与 BACKLOG 整理](reference/batches/02.md#batch-02-item-5) |
| [03](reference/batches/03.md) | [资料、工作台、输入和创作台主路径定样](reference/batches/03.md#batch-03-item-1) |
|  | [文案帮助、创作断点与角色样例用途](reference/batches/03.md#batch-03-item-2) |
|  | [安静准备、观察试用与部分返工定样](reference/batches/03.md#batch-03-item-3) |
| [04](reference/batches/04.md) | [Onboarding 全程设计](reference/batches/04.md#batch-04-item-1) |
| [05](reference/batches/05.md) | [升级链 U1 与金样回放 U2](reference/batches/05.md#batch-05-item-1) |
|  | [资料、目录与呈现公共合同](reference/batches/05.md#batch-05-item-2) |
|  | [SQLite 第二步切换](reference/batches/05.md#batch-05-item-3) |
|  | [版本字段与 schema 输入类型](reference/batches/05.md#batch-05-item-4) |
|  | [编辑器字段整理](reference/batches/05.md#batch-05-item-5) |
| [06](reference/batches/06.md) | [公共资料与 Files 退役](reference/batches/06.md#batch-06-item-1) |
|  | [文档记录协议与 SDK 共用实现](reference/batches/06.md#batch-06-item-2) |
|  | [宿主调用整治与缓存核查](reference/batches/06.md#batch-06-item-3) |
|  | [各包调用成本补齐](reference/batches/06.md#batch-06-item-4) |
| [07](reference/batches/07.md) | [工作台导航、布局与 Home 插件接入](reference/batches/07.md#batch-07-item-1) |
|  | [页面读取与轮询整治](reference/batches/07.md#batch-07-item-2) |
|  | [Feed 投影归回插件](reference/batches/07.md#batch-07-item-3) |
| [08](reference/batches/08.md) | [技能包基础能力](reference/batches/08.md#batch-08-item-1) |
| [09](reference/batches/09.md) | [能力包](reference/batches/09.md#batch-09-item-2)；[助理与 Coding 接点](reference/batches/09.md#batch-09-item-1) |
| [10](reference/batches/10.md) | [统一输入公共组件](reference/batches/10.md#batch-10-item-1) |
| [11](reference/batches/11.md) | [三入口接入统一输入](reference/batches/11.md#batch-11-item-1) |
| [12](reference/batches/12.md) | [Coding 执行、委派与可见状态](reference/batches/12.md#batch-12-item-1) |
|  | [材料进入项目与 Coding 接续](reference/batches/12.md#batch-12-item-2) |
| [13](reference/batches/13.md) | [服务与模型基础连接](reference/batches/13.md#batch-13-item-1) |
| [14](reference/batches/14.md) | [字体皮肤语言 A 段](reference/batches/14.md#batch-14-item-1) |
| [15](reference/batches/15.md) | [确定组合平台服务](reference/batches/15.md#batch-15-item-1) |
|  | [公共来源、呈现组件与首批入口](reference/batches/15.md#batch-15-item-2) |
|  | [基础首页与 Feed 归属](reference/batches/15.md#batch-15-item-3) |
| [16](reference/batches/16.md) | [真实基线与插件切片验收 B 段](reference/batches/16.md#batch-16-item-1) |
|  | [现有入口整体切换 C 段](reference/batches/16.md#batch-16-item-2) |
| [17](reference/batches/17.md) | [风险插件基础完整路径](reference/batches/17.md#batch-17-item-1) |
| [18](reference/batches/18.md) | [Schedule 查询前置](reference/batches/18.md#batch-18-item-1) |
| [19](reference/batches/19.md) | [Work Brief 首页与简报核心](reference/batches/19.md#batch-19-item-1) |
| [20](reference/batches/20.md) | [场景与生成页面公共合同](reference/batches/20.md#batch-20-item-1) |
|  | [场景包声明](reference/batches/20.md#batch-20-item-2) |
| [21](reference/batches/21.md) | [观测采集设计与评测案例](reference/batches/21.md#batch-21-item-1) |
| [22](reference/batches/22.md) | [Sessions 来源与历史合同](reference/batches/22.md#batch-22-item-1) |
| [23](reference/batches/23.md) | [同步与团队共同设计 → SRV-1](reference/batches/23.md#batch-23-item-1) |
| [24](reference/batches/24.md) | [Prologue 采用与任务能力核准](reference/batches/24.md#batch-24-item-1) |
|  | [Memory P0 非上游余项](reference/batches/24.md#batch-24-item-2)（2026-11-11 移出本批：独立的 Memory V0 收口批，以 #2020 为基线；P1 在 [31](reference/batches/31.md#batch-31-item-2)，见 [Memory 去向](reference/requirements.md#memory-paused)） |
|  | [逐项交付与证据关联合同](reference/batches/24.md#batch-24-item-3) |
| [25](reference/batches/25.md) | [常驻、休眠与单 Home 执行恢复](reference/batches/25.md#batch-25-item-1) |
|  | [按主人隔离升级失败 U3](reference/batches/25.md#batch-25-item-2) |
|  | [回到上一版（U6 的回退，从 26-6 提前）](reference/batches/25.md#batch-25-item-3) |
| [26](reference/batches/26.md) | [插件升级 U4](reference/batches/26.md#batch-26-item-5) |
|  | [状态与状态机合同与词表](reference/batches/26.md#batch-26-item-7) |
|  | [状态词汇门禁与文档](reference/batches/26.md#batch-26-item-8)（原 27-6）；[47](reference/batches/47.md)消费 26-5、26-7、26-8 |
|  | [发行配置收拢](reference/batches/26.md#batch-26-item-9) |
|  | 签名公证、正式 OAuth、原生组件预置、日志诊断、U5、U6 移到[发行批](#release-batch)（2026-11-14） |
| [27](reference/batches/27.md) | [基础交互体验债](reference/batches/27.md#batch-27-item-1) |
|  | [代码／Diff 及性能余项](reference/batches/27.md#batch-27-item-2) |
|  | [首批文案与帮助](reference/batches/27.md#batch-27-item-3) |
|  | [Runtime、Goals 与沙箱余项](reference/batches/27.md#batch-27-item-4) |
|  | [宿主出口、文档门禁与各包清理](reference/batches/27.md#batch-27-item-5) |
| [28](reference/batches/28.md) | [采集事实接入](reference/batches/28.md#batch-28-item-1) |
| [29](reference/batches/29.md) | [历史查询与记录管理](reference/batches/29.md#batch-29-item-1) |
| [30](reference/batches/30.md) | [最小真实评测路径](reference/batches/30.md#batch-30-item-1) |
| [31](reference/batches/31.md) | [SDK 窗口一](reference/batches/31.md#batch-31-item-1) |
|  | [Memory P1：历史、交换与单一写主人](reference/batches/31.md#batch-31-item-2) |
| [32](reference/batches/32.md) | [主对话持续接单、后台任务控制与结果回流](reference/batches/32.md#batch-32-item-1) |
|  | [逐项产物、认可、返工与复核](reference/batches/32.md#batch-32-item-2) |
|  | [事项线第一片：外壳、线、事件登记、事件卡与后台任务面板](reference/batches/32.md#batch-32-item-3) |
| [33](reference/batches/33.md) | [Coding 任务与环境恢复](reference/batches/33.md#batch-33-item-1) |
|  | [材料、大清单与重启接续](reference/batches/33.md#batch-33-item-2) |
| [34](reference/batches/34.md) | [Sessions 历史实现](reference/batches/34.md#batch-34-item-1) |
| [35](reference/batches/35.md) | [引导接入已有 Sessions](reference/batches/35.md#batch-35-item-1) |
|  | [Coding A 期](reference/batches/35.md#batch-35-item-2) |
| [36](reference/batches/36.md) | [角色设置、生效与恢复](reference/batches/36.md#batch-36-item-1) |
|  | [主线第一片的合同与服务](reference/batches/36.md#batch-36-item-2) |
| [36A](reference/batches/36a.md) | [顶部栏：纸上的页签](reference/batches/36a.md#batch-36a-item-1)（七项工程均已合入，含 #2142、#2218、#2232、#2233、#2235 及复核 #2252，实物验收见批次页；[决定 52](reference/decisions.md#decision-52)） |
|  | [底栏：第十三版](reference/batches/36a.md#batch-36a-item-2)（2026-11-17 改，[决定 53](reference/decisions.md#decision-53)） |
|  | [助理对话框、事件卡与收起态](reference/batches/36a.md#batch-36a-item-3) |
|  | [Coding 逐屏](reference/batches/36a.md#batch-36a-item-4) |
|  | [设置页：一种写法](reference/batches/36a.md#batch-36a-item-5) |
|  | [首页：项目的第一页](reference/batches/36a.md#batch-36a-item-6) |
|  | [动效落地与曲线收口](reference/batches/36a.md#batch-36a-item-7) |
| [37](reference/batches/37.md) | [生成页面运行、采用与恢复](reference/batches/37.md#batch-37-item-1)（[#2288](https://github.com/molis-ai/molis-work/pull/2288)，合后修复 [#2295](https://github.com/molis-ai/molis-work/pull/2295)、[#2298](https://github.com/molis-ai/molis-work/pull/2298)，SPC-10～11、ONB-25～28、WBR-26、S-home-page-*；本人验收 [BL-b37-generated-home-mainline-acceptance](../backlog/BL-b37-generated-home-mainline-acceptance.md)） |
|  | [事项切换与工作台状态](reference/batches/37.md#batch-37-item-2)（[#2288](https://github.com/molis-ai/molis-work/pull/2288)，合后修复 [#2295](https://github.com/molis-ai/molis-work/pull/2295)、[#2298](https://github.com/molis-ai/molis-work/pull/2298)，MLN-01～19／21～23、WLN-19／20／23／24、POLISH-62～64、决定 66；MLN-20 本人验收 [BL-b37-generated-home-mainline-acceptance](../backlog/BL-b37-generated-home-mainline-acceptance.md)） |
| [38](reference/batches/38.md) | [插件配置采用](reference/batches/38.md#batch-38-item-1) |
| [39](reference/batches/39.md) | [授权、人审与统一管理页](reference/batches/39.md#batch-39-item-1) |
|  | [可信决定回平台](reference/batches/39.md#batch-39-item-2) |
| [40](reference/batches/40.md) | [配置、工作交接与使用治理](reference/batches/40.md#batch-40-item-1)（[#2204](https://github.com/molis-ai/molis-work/pull/2204)，PFG-19、PF-A12～15；本人验收 [BL-b40-governance-help-acceptance](../backlog/BL-b40-governance-help-acceptance.md)） |
|  | [全产品文案与按需帮助](reference/batches/40.md#batch-40-item-2)（[#2204](https://github.com/molis-ai/molis-work/pull/2204)，VUX-51～56／58～59、ONB-47～48 入口与事实；VUX-57 准备返回接续归 45-1） |
| [41](reference/batches/41.md) | [Skill 选用](reference/batches/41.md#batch-41-item-1) |
|  | [规划方法变成技能](reference/batches/41.md#batch-41-item-2) |
|  | [在设置里写自己的技能](reference/batches/41.md#batch-41-item-3) |
| [42](reference/batches/42.md) | [Skill 创作与改进完整路径](reference/batches/42.md#batch-42-item-1)：已实现并合入 `4cf1c742e6`（[#2107](https://github.com/molis-ai/molis-work/pull/2107)；最终 CI/Full/队列通过）；本人验收保留 |
| [43](reference/batches/43.md) | [`43-1` · 项目助理团执行与交付（独立 PR，排在 111／91／91B 之后）](reference/batches/43.md#batch-43-item-1) |
|  | [`43-2` · Dataset 逐行表（`dataset_rows`）、汇总、追加与问卷去点名自动进表（独立并行 PR）](reference/batches/43.md#batch-43-item-2) |
| [44](reference/batches/44.md) | [合同去插件化](reference/batches/44.md#batch-44-item-1) |
|  | [项目指导回平台](reference/batches/44.md#batch-44-item-2) |
|  | [要求与认可：Goals 改为消费平台能力](reference/batches/44.md#batch-44-item-3) |
|  | [终端执行解耦](reference/batches/44.md#batch-44-item-4) |
|  | [其他插件去点名](reference/batches/44.md#batch-44-item-5) |
|  | [宿主与工作台去私路、Goals 可移除](reference/batches/44.md#batch-44-item-6) |
|  | [删除桌面胶囊、CLI 的 Goals 命令与 `goal-advance`](reference/batches/44.md#batch-44-item-7) |
|  | [叙事与命名](reference/batches/44.md#batch-44-item-8) |
| [44B](reference/batches/44b.md) | [P0 安全补洞：全局保留 `io.molis.work.` 前缀与修第三方前缀正则](reference/batches/44b.md#batch-44b-item-0)（已合入 [#2262](https://github.com/molis-ai/molis-work/pull/2262) `de25e3090d`，[决定 66](reference/decisions.md#decision-66)） |
|  | [合同、SDK、纯平台身份与 Clean v1 存储改名（D5+U13）](reference/batches/44b.md#batch-44b-item-1)（已随 [#2294](https://github.com/molis-ai/molis-work/pull/2294) `b57fd115ff` 合入） |
|  | [Shelf 收归纯平台 `modules/shelf`、彻底删除旧 Alchemist、官方集成驱动化与宿主清零](reference/batches/44b.md#batch-44b-item-2)（已随 [#2279](https://github.com/molis-ai/molis-work/pull/2279)、[#2294](https://github.com/molis-ai/molis-work/pull/2294) `b57fd115ff` 及独立复核修复 [#2308](https://github.com/molis-ai/molis-work/pull/2308) 合入；两项测试补缺移交 [106](reference/batches/106.md)） |
| [44C](reference/batches/44c.md) | [统一提供方身份与平台登记](reference/batches/44c.md#batch-44c-item-1)（2026-11-24 加，44B 两轮复核的余项，用户定一次做完） |
|  | [集成驱动收尾与厂商分支清零](reference/batches/44c.md#batch-44c-item-2) |
|  | [签名样例、G1 终点与验证欠账](reference/batches/44c.md#batch-44c-item-3) |
| [45](reference/batches/45.md) | [首次／项目／个人空间场景闭环（支持个人空间直接采用或新建项目，接帮助往返 VUX-57 与 `packs.save` 三语报错）](reference/batches/45.md#batch-45-item-1) |
|  | [官方签名场景包：行业观察与写作（`Feed+Pages`）、写代码（`Coding+Git+Diff+Todo` 四插件一次配齐）](reference/batches/45.md#batch-45-item-2) |
| [46](reference/batches/46.md) | [情境 W4 创建与准备声明（W4-3～W4-7，Lucide 顶栏槽、懒加载守 `context-toolbar` 上限与当前分区候选隔离）](reference/batches/46.md#batch-46-item-1)（单 PR 等 45 合入后推进） |
|  | [通用任务引导与个人场景保存／复制复用（接 45-1 补问往返与 `zh`/`en`/`ja` 三语）](reference/batches/46.md#batch-46-item-2) |
| [47](reference/batches/47.md) | [正式插件交付的平台前置](reference/batches/47.md#batch-47-item-1)（#2239、#2264 已合入） · [BL-586](../../docs/backlog-removed.md) |
|  | [状态机登记与只读查询](reference/batches/47.md#batch-47-item-2)（#2239、#2264 已合入，本人验收见 [BL-b47-acceptance](../backlog/BL-b47-acceptance.md)） |
| [48](reference/batches/48.md) | [`48-1` · 新插件创建、隔离试用与修通 11-03 全部真断点（含硬检查全绿时本人试跑带标安装活口与 60KB 提示词去重，归 `48A` PR 1）](reference/batches/48.md#batch-48-item-1) · [BL-plugin-cli-dev-uncoded-errors](../../docs/backlog-removed.md)（`#2152` 已合） |
|  | [`48-2` · 自动产出成果、搜索、快速创建与工作流内容站声明（归 `48A` PR 1）](reference/batches/48.md#batch-48-item-2) |
|  | [`48-3` · 安装预演展示依赖（含一键协同启用分区依赖）、来源与权限／联网范围（归 `48B` PR 2）](reference/batches/48.md#batch-48-item-3) |
|  | [`48-4` · 首次可用率与返修评测样本（归 `48B` PR 2）](reference/batches/48.md#batch-48-item-4) |
|  | [`48-5` · 安装预演与插件目录的状态机展示（归 `48B` PR 2）](reference/batches/48.md#batch-48-item-5) |
|  | [`48-6` · 创作能力经动作目录提供（归 `48A` PR 1，由 47 挪来）](reference/batches/48.md#batch-48-item-6) |
| [49](reference/batches/49.md) | [个人同步核心 → SRV-2](reference/batches/49.md#batch-49-item-1) |
| [50](reference/batches/50.md) | [团队关键协作 → SRV-3](reference/batches/50.md#batch-50-item-1) |
| [51](reference/batches/51.md) | [双身份协作实证 → SRV-3](reference/batches/51.md#batch-51-item-1) |
| [52](reference/batches/52.md) | [每日简报、平台日历重复规则（每天／每周／每月）、设置与中断恢复（个人空间由个人助理按 `OverviewGrant` 汇总，`Work Brief` 严守单分区隔离）](reference/batches/52.md#batch-52-item-1) |
|  | [初始日报与工作接续 Skill（三语正式登记）](reference/batches/52.md#batch-52-item-2) |
|  | [官方签名场景包：个人事务与每日简报（`Schedule+Work Brief+Todo+Inbox+Jelly` 五插件一次配齐，默认推荐装入个人空间）](reference/batches/52.md#batch-52-item-3) |
| [53](reference/batches/53.md) | [`53-1` · 回执与交互余项（独立 PR，等 111／91-3／91B／46）](reference/batches/53.md#batch-53-item-1) · [BL-959](https://github.com/molis-ai/molis-work/blob/ec2620d916523def9ac8cf9450da50bebac3c393/specs/backlog/BL-959.md) 已由 [#2193](https://github.com/molis-ai/molis-work/pull/2193) 结清 |
|  | [`53-2` · 智能呈现第二片（独立 PR，五种卡片、卡叠短动作与跨插件呈现声明，等 111／91／91B／43）](reference/batches/53.md#batch-53-item-2) |
|  | [`53-3` · 主线第二片（独立 PR，按需懒加载「整理主线」表格页与个人空间／项目统一多来源联动，等 111／91B／105-2）](reference/batches/53.md#batch-53-item-3) |
| [54](reference/batches/54.md) | [轻量双通道语音输入：系统原生离线听写＋可选通用语音转写接口（免 600MB 下载、零录音残留，前置 `112-1`）](reference/batches/54.md#batch-54-item-1) |
| [55](reference/batches/55.md) | [`55-1` · 月／季／年重复与瘦身后 `jelly_series` 迁平台规则（按主人拆 6 个互不等待独立 PR，PR A）](reference/batches/55.md#batch-55-item-1) |
|  | [`55-2` · Todo 等待按人分组催办与时长（PR B）](reference/batches/55.md#batch-55-item-2) |
|  | [`55-3` · 待办整理准确率样本集（PR B）](reference/batches/55.md#batch-55-item-3) |
|  | [`55-4` · 外部判断连接未连接时的降级与补连引导（零服务名硬编码，PR C）](reference/batches/55.md#batch-55-item-4) |
|  | [`55-5` · 纯平台 Shelf 投放轮盘与全局快捷键（PR D）](reference/batches/55.md#batch-55-item-5) |
|  | [`55-6` · 工作流查询步骤与结果映射（消费 `43-2`，PR E）](reference/batches/55.md#batch-55-item-6) |
|  | [`55-7` · 旧版 Office（`.doc`／`.xls`／`.ppt`）离线提取（`BL-397`，`BL-398` 已随 `112-1` 根除，PR F）](reference/batches/55.md#batch-55-item-7) |
|  | [`55-8` · 连续两期场景实操与按需开新期（PR B）](reference/batches/55.md#batch-55-item-8) |
| [56](reference/batches/56.md) | [`56-1` · Attention 跨分区唤醒、克制分级角标与系统通知（轨道一：独立功能 PR，等 `111`／`91B-1`）](reference/batches/56.md#batch-56-item-1) · [BL-attention-404-by-code](../../docs/backlog-removed.md)（[#2160](https://github.com/molis-ai/molis-work/pull/2160) 已合入） |
|  | [`56-2` · 阶段 2 新入口中 / 英 / 日三语文案与术语总复核（轨道二：独立收尾 PR，等阶段 2 全新页面合入）](reference/batches/56.md#batch-56-item-2) |
|  | [`56-3` · N22 全量动作输入推导迁移与绝对门禁收口（轨道三：等 `111`／`112` 后按分片独立小 PR + `N22-G`）](reference/batches/56.md#batch-56-item-3) |
| [57](reference/batches/57.md) | [个人工作完整路径：网页端 + macOS 桌面端双端实走个人空间／零 Goals 项目／三套场景包／v1 真实规模造数基准／三语四皮肤（缺陷拆独立小 PR，收口 PR 结项；M1 在 REL-5）](reference/batches/57.md#batch-57-item-1) |
| [58](reference/batches/58.md) | [子代理公共交互组件](reference/batches/58.md#batch-58-item-1)：公共视图与交互端口已实现并合入 `6359987103`（[#2108](https://github.com/molis-ai/molis-work/pull/2108)；最终 CI/Full/队列通过）；本人验收保留 |
| [59](reference/batches/59.md) | [子代理双入口接入](reference/batches/59.md#batch-59-item-1)：助理与 Coding 消费 58 的公共浮窗，真实历史、输入、问卷、审批、回报及重启接续；原目录接续采用 Prologue #134/#135，43-1 的最小业务 SDK 派发随本批交付，完整助理团归 43-1。工程和隔离实操见 [#2115](https://github.com/molis-ai/molis-work/pull/2115)，本人验收单列 |
| [60](reference/batches/60.md) | [`60-1` · 外部会话直接控制与运行中跨工具／转助理交接（串行 2 PR，PR 1：只走公开接口真控，未开放工具给唤起＋转交 Molis 接着做）](reference/batches/60.md#batch-60-item-1) |
|  | [`60-2` · 持续跟进增量汇入观测／每日简报与国内外主流工具适配及全表诚实收口（PR 2，等 `60-1`／`52`）](reference/batches/60.md#batch-60-item-2) |
| [61](reference/batches/61.md) | [服务矩阵、现有连接与统一搜索](reference/batches/61.md#batch-61-item-1) |
|  | [自动化推荐与采用](reference/batches/61.md#batch-61-item-2) |
|  | [交给 SDK 窗口二的缺口清单](reference/batches/61.md#batch-61-item-3) |
| [62](reference/batches/62.md) | [`62-0` · Prologue 窗口 B 剩余能力补齐与 SDK 增量换包（有序 4 PR，PR 1，等 `91-2` 并经用户确认提交）](reference/batches/62.md#batch-62-item-0) |
|  | [`62-1A` · 四策略与 Agent 底座核心接线（PR 2：静态工具面 `act__`、对接 `105-1` 并行波、持久压缩检查点／Clean Handoff、Clean v1 合并双 MCP 流水线）](reference/batches/62.md#batch-62-item-1) |
|  | [`62-2/3` · 项目模型限制与出站外网边界 + 智能组合统一候选目录 + `BL-128` 注册拦截（PR 3）](reference/batches/62.md#batch-62-item-2) |
|  | [`62-1B` · 服务矩阵缺口收口（Feed 默认搜索、操作卡三语字段等）与 48 项逐服务闭环验收（PR 4）](reference/batches/62.md#batch-62-item-3) |
| [63](reference/batches/63.md) | [`63-1` · Piece 0 观测埋点补齐与批量证据读取合同（串行 2 PR，PR 1：结清 `BL-evaluation-read-cost` 与 `BL-b42-followups ①`，等 `111`／`91-2`／`104-1`）](reference/batches/63.md#batch-63-item-1) |
|  | [`63-2` · 全平台评测引擎、校准裁判、Clean v1 实验账本、「设置 › 评测」图形化后台与跨批样本库（PR 2，保 `studio:replay` 离线门禁，等 `63-1`／`62-1A`）](reference/batches/63.md#batch-63-item-2) |
| [63A](reference/batches/63a.md) | [`63A-0` · 拆分 106KB `MemoryService` 巨类纯结构重构（有序 3 PR，PR 1：清 `BL-memory-p1-residuals`，等 `111`）](reference/batches/63a.md#batch-63a-item-0) |
|  | [`63A-1` · 记忆形成质量与情景记忆（P2-01，PR 2：修 `sameText` 反转误合并、批量语义比对与形成预算，`MEM-45～63`）](reference/batches/63a.md#batch-63a-item-1) |
|  | [`63A-2` · Dreaming 空闲整理（严守人工优先与分区隔离）、按需查会话原话与 Zone 1 静态常驻层（PR 3，三组对照入评测后台，`MEM-64～75`）](reference/batches/63a.md#batch-63a-item-2) |
| [64](reference/batches/64.md) | [`64-4/5` · 五套初始主动场景 Skill 与访谈初始化底座（按主人拆 4 PR，PR 1 先行，等 `111`／`52`／`63A-2`）](reference/batches/64.md#batch-64-item-4) |
|  | [`64-1/6/7` · 主动发现／周期报告、防抖预算门控材料触发／历史回查与安静准备／观察试用（PR 2，建议不弹窗、采纳按轻重分级）](reference/batches/64.md#batch-64-item-1) |
|  | [`64-2` · 智能组合第三片：跨插件／MCP／Skill 动态拼操作面与纯文本形态（PR 3，等 `62-2/3`）](reference/batches/64.md#batch-64-item-2) |
|  | [`64-3` · 主线建议与消费 `108` `overview_projection` 的跨项目个人主线视图（PR 4，零休眠唤醒）](reference/batches/64.md#batch-64-item-3) |
| [65](reference/batches/65.md) | [`65-0` · Prologue 窗口 C 双平台 OS 真沙箱与兼容 fake-IP 本地出站域控代理换包（串行 3 PR，PR 1，经用户确认提交）](reference/batches/65.md#batch-65-item-0) |
|  | [`65-1/2` · 公共搜索联网开关、真沙箱命令规则、隔离依赖下载与默认关闭的 AI 低风险代批（PR 2，复用共用原语零插件样式增长）](reference/batches/65.md#batch-65-item-1) |
|  | [`65-3` · 带脚本内容指纹锁的用户 Hooks 生命周期与第 `61` 批 `G-09` 自动化建议收口（PR 3）](reference/batches/65.md#batch-65-item-3) |
| [66](reference/batches/66.md) | [`66-1` · 写后报错当轮即时自修、有界迭代与三档依据写回同一验收卡（串行 2 PR，PR 1：日常默认轻量档零额外子代理开销）](reference/batches/66.md#batch-66-item-1) |
|  | [`66-2` · 共享缓存前缀 5 路多代理评审（≥80 分过滤）、简化／安全专科（只出补丁不自动改）与对抗验证（PR 2，按需开启防烧钱）](reference/batches/66.md#batch-66-item-2) |
| [67](reference/batches/67.md) | [`67-1A` · `git` 插件提交签名、PR Base 分支防提权清洗与紧凑 PR／CI／评论跟进（有序 3 PR，PR 1：默认只认本人触发执行，无 Git 优雅降级）](reference/batches/67.md#batch-67-item-1a) |
|  | [`67-1B` · Coding 挂接 `system.computer` 桌面操控与共用右栏浏览器排队及三语 OCR 围栏（PR 2，守 Coding 样式零增长）](reference/batches/67.md#batch-67-item-1b) |
|  | [`67-2` · `R12` 八大真实完整任务评估集录入「设置 › 评测」与实验账本基线（PR 3，等 `63-2`／`66`／`48`）](reference/batches/67.md#batch-67-item-2) |
| [68](reference/batches/68.md) | [`68-A` · 已装插件持续修订（`B14` 界面与数据双重防误删保护）、缺包恢复与创作台 Harness 缓存／压缩优化（有序 3 PR，PR 1，保 `studio:replay` 离线门禁）](reference/batches/68.md#batch-68-item-1) |
|  | [`68-B` · 生成插件业务数据导出（`44-5` 分段）与智能呈现第四片操作面保存（PR 2）](reference/batches/68.md#batch-68-item-2) |
|  | [`68-C` · 七组角色 14 个纯 UPP 样板插件（对齐 `112-2` 瘦身版 Jelly 与按需启用依赖）与同口径评测录入「设置 › 评测」后台（PR 3）](reference/batches/68.md#batch-68-item-5) |
| [69](reference/batches/69.md) | [`69-1` · 情境 W5 跨窗格／iframe 防卡死拖放底座与按落点轻重分级放入（串行 2 PR，PR 1：按需懒加载零首屏增长）](reference/batches/69.md#batch-69-item-1) |
|  | [`69-2` · 情境 W6 纯平台 `modules/shelf` 材料篮、讨论／Coding 输入框双落点、触控板手势与第 `61` 批 `G-03`（`BL-694`）沙箱导入收口（PR 2，衔接 `55-5`）](reference/batches/69.md#batch-69-item-2) |
| [70](reference/batches/70.md) | [`70-1` · 本机规则脱敏平台共用底座（按主人拆 5 个互不等待独立 PR，PR A 安全单审）](reference/batches/70.md#batch-70-item-1) |
|  | [`70-2/3` · Gmail 全文安全清洗与附件 + `rss` 驱动内 YouTube 纯文本字幕轨提取（零音视频下载，PR B）](reference/batches/70.md#batch-70-item-2) |
|  | [`70-4/5/6/9` · PPT 图片图表（接 `43-2`）、Pages 个人空间模板、固定版逐段差异与后端轻量导出 Word（PR C）](reference/batches/70.md#batch-70-item-4) |
|  | [`70-7/8` · 生成内容可追溯出处与 Cognia 材料更新结论重看清单（PR D）](reference/batches/70.md#batch-70-item-7) |
|  | [`70-10` · 规划方法系统技能扩充行业覆盖并同步三语词包（PR E）](reference/batches/70.md#batch-70-item-10) |
| [71](reference/batches/71.md) | [`71-1` · 外观自定义、对比度与暖色硬校验、中日文 `0` 字距与助理制作 D 段（串行 2 PR，PR 1：按需懒加载结构化 JSON 皮肤，零样式注入）](reference/batches/71.md#batch-71-item-1) |
|  | [`71-2` · 隔离 Home 全入口中 / 英 / 日三语 × 全部内置与自定义外观无刷新交付 E 段（PR 2，保模型工具说明稳定单语；字体分发核对在 [REL-2](#release-batch)）](reference/batches/71.md#batch-71-item-2) |
| [72](reference/batches/72.md) | [复杂场景设计定稿 → 并入 77](reference/batches/72.md#batch-72-item-1)（2026-11-18） |
| [73](reference/batches/73.md) | [`73-A` · 单项分享导入导出：技能包、工作流、生成插件、14 个角色样板、场景包与保存操作面（串行 2 PR，PR 1：严守签名信任与受保护提示词禁覆盖）](reference/batches/73.md#batch-73-item-1) |
|  | [`73-B` · 整份 Home 换机导出导入 `U7`（业务全带＋大日志可选瘦身、保遗忘墓碑、非空先拍快照）与生成插件业务数据回读（PR 2）](reference/batches/73.md#batch-73-item-3) · [BL-knowledge-restore-partial-catalog](https://github.com/molis-ai/molis-work/blob/3a6f2289a0b526d0496481ee060807c23ed337f3/specs/backlog/BL-knowledge-restore-partial-catalog.md)（已合入）、[BL-tests-umask](https://github.com/molis-ai/molis-work/blob/d5dd1fbb6aec214c743e34fba9434f7f131ae6f1/specs/backlog/BL-tests-umask.md)（#2171 已合入） |
| [74](reference/batches/74.md) | [个人同步完整交付 → SRV-5](reference/batches/74.md#batch-74-item-1) |
| [75](reference/batches/75.md) | [`75-A` · 本机使用统计与调用用量、KV-Cache 省钱及诚实费用面板（独立 2 PR，PR 1：按需懒加载只读聚合，等 `63-1`／`104-1`）](reference/batches/75.md#batch-75-item-1) |
|  | [`75-B` · macOS 服务菜单、快捷指令与 App Intents 安全送入 Work（PR 2：只收素材禁自动跑命令，未启用插件保底进 `system.shelf` 零丢件）](reference/batches/75.md#batch-75-item-3) |
| [76](reference/batches/76.md) | [`76-1` · 阶段 3 全平台与主动效果收官验收（单 PR 闭环：隔离 Clean v1 跨周时间线实测、`设置 › 评测` 与 `75-A` 双向对账、同 PR 修净缺陷且调优必附 `validation` 零回归证据；真人日常观察并行至 `83`／`90` 签结）](reference/batches/76.md#batch-76-item-1) |
| [77](reference/batches/77.md) | [`77-1` · 场景组装公共合同定稿（原 `72`：复用 `Blueprint`＋`workflows` 零第三种格式、对齐 UPP `partitions.plugins.set@1`）与手动组装定样（串行 2 PR，PR 1）](reference/batches/77.md#batch-77-item-1) |
|  | [`77-2` · 创作台三语手动组装全流程、零污染隔离试跑、混合补件统一安装单与接通 `73-A` 导入导出（PR 2）](reference/batches/77.md#batch-77-item-2) |
| [78](reference/batches/78.md) | [`78-1` · 个人助理与创作台同草稿双向共编、晚到冲突转按部件挑选卡与按轻重分流采用／跳创作台试跑（三语懒加载零首屏增长）](reference/batches/78.md#batch-78-item-1) |
| [79](reference/batches/79.md) | [团队身份与访问 → SRV-6](reference/batches/79.md#batch-79-item-1) |
| [80](reference/batches/80.md) | [团队实时协作 → SRV-6](reference/batches/80.md#batch-80-item-1) |
| [81](reference/batches/81.md) | [团队恢复与首版验收 → SRV-6](reference/batches/81.md#batch-81-item-1) |
| [82](reference/batches/82.md) | [`82-A` · Alchemist 完整研究与同版本决策场景（独立并行 2 PR，PR 1：薄纯 UPP 领域表＋全复用 `Feed`/`Cognia`/联网搜索/记忆/证据＋创作台可重开编辑，三语）](reference/batches/82.md#batch-82-item-1) |
|  | [`82-B` · CGS 七项签名内容技能包＋零新代码 `Blueprint` 自媒体创作出各平台稿场景（PR 2：定稿落 `Pages`/成果库禁自动外发，三语）](reference/batches/82.md#batch-82-item-2) |
| [83](reference/batches/83.md) | [`83-A` · 创作台另一轻量场景通用性验证、14 个纯 UPP 角色样例 AI 改造实测与「`设置 › 评测`」同口径首期基线（独立 2 PR，PR 1：废除手写月报不另开 PR 死结）](reference/batches/83.md#batch-83-item-1) |
|  | [`83-B` · 两条创作路径、全站 20 插件＋5 纯平台入口智能呈现声明、三语引导文案补缺与 Clean v1 去向清账（PR 2）](reference/batches/83.md#batch-83-item-3) |
| [84](reference/batches/84.md) | [`84-A` · 插件通用 CLI 子命令合同、自动识别终端／脚本的无感非交互 `D1/D7` 与极简一键分叉／只读旁问／脱敏导出／记忆 `C1～C4`（独立并行 2 PR，PR 1）](reference/batches/84.md#batch-84-item-1) |
|  | [`84-B` · `E7` Coding 可交互实施计划页（PR 2：复用 `37` 安全页面底座、零私有 CSS 增长、三语，提前解锁 `85`）](reference/batches/84.md#batch-84-item-2) |
| [85](reference/batches/85.md) | [`85-1` · 代码现代化完整流程（只读前四步一气呵成进 `84-B` 单页一次拍板、分片改造复用 `66` 独立等价／安全证明挂 `32-2`、零私有 CSS 增长，不等 `84-A`）](reference/batches/85.md#batch-85-item-1) |
| [86](reference/batches/86.md) | [`86-A` · Coding 效率三组对照（轻量 Repo-Map／Clean Handoff／`code-mode`）与跨模型提示词剪枝实验（独立并行 2 PR，PR 1：败者代码清零、结果进「`设置 › 评测`」，不等 `83-A`）](reference/batches/86.md#batch-86-item-1) |
|  | [`86-B` · 插件创作台阶段简化同口径对照实验（PR 2：等 `83-A` 创作基线，保 `380` 语料门禁不退步）](reference/batches/86.md#batch-86-item-2) |
| [87](reference/batches/87.md) | [团队记忆形成与融合 → SRV-7](reference/batches/87.md#batch-87-item-1) |
| [88](reference/batches/88.md) | [团队记忆发布、管理与效果 → SRV-7](reference/batches/88.md#batch-88-item-1) |
| [89](reference/batches/89.md) | [`89-A` · 情境 `W7` 与总纲收口（独立并行 3 PR，PR 1：按需懒加载保首屏预算、零 `goal` 硬编码、剔除已退役 `Files`/`Text stats`、三语）](reference/batches/89.md#batch-89-item-1) |
|  | [`89-B` · 输入回执阶段 6 剩余场景收口（PR 2：覆盖创作台／`Schedule`／灵光／`Alchemist`／`system.shelf`／引导／`Images`，剔除 `112-2` 已砍掉的 `Jelly` AI 拆解）](reference/batches/89.md#batch-89-item-2) |
|  | [`89-C` · 全目录 Skill 三段式评测进「`设置 › 评测`」与弱效分级治理（PR 3：内置弱效附证据修准或关默认自动，用户自建绝不自动删停）](reference/batches/89.md#batch-89-item-3) |
| [90](reference/batches/90.md) | [`90-1` · 非服务端全路线最终交付对账、全谱系门禁总核（含 `112`／三语／五层样式／`N22-G`／评测五大基线）与 M1 前 Clean v1 `version: 1` 封板交接（真缺口禁带病签结）](reference/batches/90.md#batch-90-item-1) |
| [91](reference/batches/91.md) | [`91-0a` · 设计开发 Skill（`skills/molis-design-ui/`）、规范统一与 59→9 存量设计库收口](reference/batches/91.md#batch-91-item-0a)（已合入 [#2221](https://github.com/molis-ai/molis-work/pull/2221)，[决定 60](reference/decisions.md#decision-60)） |
|  | [`91-0b` · 4 套皮肤/F1 字体/材质升级 + 原 `91-1` 底座 + 组件板 93 节 + 设置页 30 页](reference/batches/91.md#batch-91-item-0b)（已合入 [#2222](https://github.com/molis-ai/molis-work/pull/2222) + [#2230](https://github.com/molis-ai/molis-work/pull/2230)，[决定 60](reference/decisions.md#decision-60)） |
|  | [`91-0c` · 平台统一「列表—详情」标准容器、退役插件 `workbench.directory`／`DIRECT_WORK_SURFACE_IDS` 与顶部标签组联动底座](reference/batches/91.md#batch-91-item-0c)（规格与[决定 64](reference/decisions.md#decision-64)／[决定 65](reference/decisions.md#decision-65)已由 `#2259` 确立，共享样式去插件名已由 `#2258` 结清；排在 [`111`](reference/batches/111.md) 后、`91A` 主体前单独一个 PR 合入） |
|  | [Design System 流式、布局与行为反馈统一底座](reference/batches/91.md#batch-91-item-1)（已随 `91-0b` [#2222](https://github.com/molis-ai/molis-work/pull/2222) 提前交付；[决定 54](reference/decisions.md#decision-54)、[决定 55](reference/decisions.md#decision-55)、[决定 60](reference/decisions.md#decision-60)） |
|  | [平台运行流合同、Prologue 窗口 A 完整换包（补齐上游 A1/A3/A4 + `#142`～`#145`）与 Agent Host 热路径减负](reference/batches/91.md#batch-91-item-2) |
|  | [个人助理 SSE 增量流与对话流精修](reference/batches/91.md#batch-91-item-3) |
|  | [Coding SSE 增量流、回滚稳态与过程精修](reference/batches/91.md#batch-91-item-4) |
|  | [后续开发指引与插件创作台规范同步更新](reference/batches/91.md#batch-91-item-5)（已随 `91-0a` [#2221](https://github.com/molis-ai/molis-work/pull/2221) + `91-0b` [#2222](https://github.com/molis-ai/molis-work/pull/2222) 与补清小修落稳，[决定 60](reference/decisions.md#decision-60)） |
| [91B](reference/batches/91b.md) | [`91B-1` · 入口、账号、市场、侧栏四视图、IM 与 5 个纯平台表面（Artifacts、Characters、Sessions、Shelf、创作台）收口 + 共享 `[data-dimmed]`](reference/batches/91b.md#batch-91b-item-1)（2026-11-18 加，2026-11-25 拍板按 `91B-1 → 91B-2∥91B-3 → 91B-4` 四 PR 推进，排在 111 与 91 之后，不等 38～89，[决定 55](reference/decisions.md#decision-55)、[决定 66](reference/decisions.md#decision-66)） |
|  | [`91B-2` · 工作主干 9 插件 + 官方连接器驱动全面打磨（与 `91B-3` 零冲突并行）](reference/batches/91b.md#batch-91b-item-2) |
|  | [`91B-3` · 创作数据 5 + 收集知识 3 + 研发工具（Git/Diff）全面打磨（与 `91B-2` 零冲突并行）](reference/batches/91b.md#batch-91b-item-3) |
|  | [`91B-4` · 全站轻动效收口、`plugin-styles.json` 公共样式账本清零与五层自动化防回归门禁焊死](reference/batches/91b.md#batch-91b-item-4)（`#2258` 已提前结清共享样式去插件名，本项清零残余 11 条混合规则并实测收紧首屏预算，[决定 65](reference/decisions.md#decision-65)） |
| [92](reference/batches/92.md) | [把图片下载的漏测命令补进手册](reference/batches/92.md#batch-92-item-1) · [#2144](https://github.com/molis-ai/molis-work/pull/2144) 已合入 |
|  | [把「打开数据库会不会创建文件」写准确](reference/batches/92.md#batch-92-item-2) · [#2145](https://github.com/molis-ai/molis-work/pull/2145) 已合入 |
|  | [让 Goals 测试即使报错也关干净](reference/batches/92.md#batch-92-item-3) · [#2146](https://github.com/molis-ai/molis-work/pull/2146) 已合入 |
| [93](reference/batches/93.md) | [确认页面关掉时，两个正在做的请求各收到自己的取消原因](reference/batches/93.md#batch-93-item-1) · [#2148](https://github.com/molis-ai/molis-work/pull/2148) 已合入 |
|  | [关掉侧栏浏览器后，清掉还没挂好的监听](reference/batches/93.md#batch-93-item-2) · [#2149](https://github.com/molis-ai/molis-work/pull/2149) 已合入 |
| [94](reference/batches/94.md) | [重新安装同版本开发 App 后，用上刚编出来的版本](reference/batches/94.md#batch-94-item-1) · [#2162](https://github.com/molis-ai/molis-work/pull/2162) 已合入 |
| [95](reference/batches/95.md) | [把 Feed 连数据库的旧函数名改准确](reference/batches/95.md#batch-95-item-1) · [#2151](https://github.com/molis-ai/molis-work/pull/2151) 已合入 |
|  | [资讯更新点过「现在做」，睡醒后直接做](reference/batches/95.md#batch-95-item-2) · [#2151](https://github.com/molis-ai/molis-work/pull/2151) 已合入 |
|  | [错过的任务统一留七天，到期一次说清跳过了几件](reference/batches/95.md#batch-95-item-3) · [#2151](https://github.com/molis-ai/molis-work/pull/2151) 已合入 |
| [96](reference/batches/96.md) | [编辑一项定时任务时，只查这一项](reference/batches/96.md#batch-96-item-1) · [#2165](https://github.com/molis-ai/molis-work/pull/2165) 已合入 |
|  | [定时任务失败时，开着的详情立刻显示原因](reference/batches/96.md#batch-96-item-2) · [#2165](https://github.com/molis-ai/molis-work/pull/2165) 已合入 |
| [97](reference/batches/97.md) | [助理只汇报结果时，别占用继续干活的次数](reference/batches/97.md#batch-97-item-1) · [#2176](https://github.com/molis-ai/molis-work/pull/2176) 已合入 |
|  | [同一项目同时办完几件事，助理合起来报一次](reference/batches/97.md#batch-97-item-2) · [#2176](https://github.com/molis-ai/molis-work/pull/2176) 已合入 |
| [98](reference/batches/98.md) | [让两家插件都能提供同一种材料，还能按来源挑](reference/batches/98.md#batch-98-item-1) · [#2154](https://github.com/molis-ai/molis-work/pull/2154) 已合入 |
| [99](reference/batches/99.md) | [在 Coding 的本轮变更里列出确实删掉的文件](reference/batches/99.md#batch-99-item-1)（#2207 已合入） |
| [100](reference/batches/100.md) | [路线书勘误、决定 57/58 落盘与 `100`～`105` 正式入列](reference/batches/100.md#batch-100-item-1)（2026-11-20 加，#2186 已合入，[决定 58](reference/decisions.md#decision-58)） |
|  | [反效果门禁精准松绑与 CI 碎作业合并](reference/batches/100.md#batch-100-item-2)（#2188 已合入） |
| [101](reference/batches/101.md) | [现役 P0 功能故障、英文模式断链与安全异常修复](reference/batches/101.md#batch-101-item-1)（2026-11-20 加，#2189 已合入，[决定 58](reference/decisions.md#decision-58)） |
|  | [零误报死文件清理与热路径/生命周期泄漏止血](reference/batches/101.md#batch-101-item-2)（#2189 已合入） |
| [102](reference/batches/102.md) | [工作台去 Layer 1 双套 iframe、拆插件基础 CSS 与清理前端热路径](reference/batches/102.md#batch-102-item-1)（2026-11-20 加，前置 100-2、36A，不等 38～89，[决定 58](reference/decisions.md#decision-58)；#2216、`#2229` 已合入） |
|  | [沙箱批量 RSS/CPU 监控与 Tauri 桌面壳/端口/CLI 维护硬化](reference/batches/102.md#batch-102-item-2)（#2196、`#2226` 已合入） |
| [103](reference/batches/103.md) | [休眠项目唤醒索引、热点库长连接复用与 `ProjectLine` 纯读并发](reference/batches/103.md#batch-103-item-1)（2026-11-20 加，前置 101，不等 38～89，[决定 58](reference/decisions.md#decision-58)；#2205 已合入 `1faf24dbf0`） |
|  | [Host/MCP/Sessions 热路径去全量扫描、异步化与高收益冗余清理](reference/batches/103.md#batch-103-item-2)（#2211 已合入 `7acf6bea7a`） |
| [104](reference/batches/104.md) | [全量单次 AI 调用（11 内置插件 + 9 平台能力）双通道纳管与本人显式授权备用模型](reference/batches/104.md#batch-104-item-1)（2026-11-20 加，排在 [`111`](reference/batches/111.md) 与 [`91`](reference/batches/91.md) 之后，不等 38～89，[决定 58](reference/decisions.md#decision-58)、[决定 67](reference/decisions.md#decision-67)） |
|  | [面向非技术用户的全站结构化三语（`zh`/`en`/`ja`）大白话报错转译与无损安全重试](reference/batches/104.md#batch-104-item-2) |
| [105](reference/batches/105.md) | [防链式 RCE 免批护栏、全分区分类跨重启审批续接与审批列表局部刷新／批量原子底座](reference/batches/105.md#batch-105-item-1)（2026-11-20 加，经[决定 66](reference/decisions.md#decision-66)与 2026-11-25 拍板解耦排在 [`111`](reference/batches/111.md) 与 [`91`](reference/batches/91.md) 之后一次结项，底层并行波联动归 [62](reference/batches/62.md)，不等 38～89） |
|  | [双子代理终态缓存、Mainline 增量校验、「AI 记下的约定」原地修改与预览写按钮禁用](reference/batches/105.md#batch-105-item-2) |
| [106](reference/batches/106.md) | [分区根 `partitionRoot()`、保留分区守卫与 `listPartitions()` 全量归类](reference/batches/106.md#batch-106-item-1)（2026-11-22 加，UPP 批 A 只加不删，前置 `44B`，已合入 [#2314](https://github.com/molis-ai/molis-work/pull/2314) 及复查修复 `#2316`～`#2323`，[决定 66](reference/decisions.md#decision-66)） |
|  | [Home 单张安装表、`partition_plugins`、`partitions.plugins.set@1` 与新每分区装配](reference/batches/106.md#batch-106-item-2)（已合入） |
|  | [新平台基础设施：`person-settings`、`evidence`、到期登记、声明式 `overview_projection` 与 Manifest 新字段](reference/batches/106.md#batch-106-item-3)（已合入） |
| [107](reference/batches/107.md) | [宿主全链路接通新每分区装配；6 个独立库插件迁 `databases.partition`、删业务表 `project_id` 并摘除各自 `personal:true`](reference/batches/107.md#batch-107-item-1)（2026-11-22 加，UPP 批 B1，前置 `106`，已合入 [#2325](https://github.com/molis-ai/molis-work/pull/2325) 及复核修复 [#2329](https://github.com/molis-ai/molis-work/pull/2329)，[决定 66](reference/decisions.md#decision-66)） |
|  | [当波删除 `databases.home.partition` 复用器、清理 6 个顶层旧库登记与清退 `106` 一次性白名单（`project_rows` 与 `artifact_join` 机制留 `109-3` 删除）](reference/batches/107.md#batch-107-item-2)（已合入 [#2325](https://github.com/molis-ai/molis-work/pull/2325)） |
| [108](reference/batches/108.md) | [插件侧接通 `personSettings`／到期回调；Todo、瘦身分表后的 Jelly、Cognia、Images、Issues 迁分区与 `databases.partition`](reference/batches/108.md#batch-108-item-1)（2026-11-22 加，UPP 批 B2，前置 `107`［已合］与 `112`，[决定 66](reference/decisions.md#decision-66)） |
|  | [个人空间总览上线（承接原 `64-3`，含主库 `attention_entries` 只读投影与助理跨项目授权开关）与门禁 G4](reference/batches/108.md#batch-108-item-2) |
|  | [当波删除 `personal:true` 与 `hidden`，补齐 `person-settings`/`due-registry` 金样覆盖（普通插件 `runtime.scope:"home"` 与 `projects:reach` 机制留 `109-3` 删除）](reference/batches/108.md#batch-108-item-3) |
| [109](reference/batches/109.md) | [`109-1` · 主库插件删 `project_id` 列，Feed 证据迁 `horizontal/evidence`、Work Brief 迁独立库并接个人空间总览](reference/batches/109.md#batch-109-item-1)（2026-11-22 加，UPP 批 B3，允许拆 3 个串行 PR，前置 `108`，[决定 66](reference/decisions.md#decision-66)） |
|  | [`109-2` · Workspace Git 与 `projects.workspace.writers.*` 迁入 `plugins/native/git`（D6=B）+ Agent Host 开放审查种类与非 Git 目录降级](reference/batches/109.md#batch-109-item-2) |
|  | [`109-3` · 第三方沙箱包开放 `databases.partition`、全部插件合流唯一每分区装配并彻底删除双实例与旧平行装配](reference/batches/109.md#batch-109-item-3) |
| [110](reference/batches/110.md) | [放置、搜索、助理个人空间上下文与记忆/角色去 `project_id: null` 业务双轨](reference/batches/110.md#batch-110-item-1)（2026-11-22 加，UPP 批 B4，前置 `109`，[决定 66](reference/decisions.md#decision-66)） |
|  | [同步收敛（Clean v1 保 v1 拍平）、分区启用清单独立同步（V4）、零唤醒发现与门禁 G5](reference/batches/110.md#batch-110-item-2) |
|  | [MCP 个人空间显式绑定守卫（闭合显式 `bind` 缺口）](reference/batches/110.md#batch-110-item-3) |
| [111](reference/batches/111.md) | [`111-1` · 存储三库原子事务升级、星型单向版本化推送引擎、不预记补账、大快照分片与 CAS GC 保护](reference/batches/111.md#batch-111-item-1)（2026-11-22 加，UPP 批 C，允许拆 3 个串行 PR，前置 `110`，[决定 66](reference/decisions.md#decision-66)） |
|  | [`111-2` · 14 个有业务对象内置插件一次完成 `push` 声明（U8）与第三方沙箱同路支持](reference/batches/111.md#batch-111-item-2) |
|  | [`111-3` · 工作台界面定样落地（推送弹窗与占用页按需懒加载）、G1～G5 全量焊死、清空临时白名单与文档收尾](reference/batches/111.md#batch-111-item-3) |
| [112](reference/batches/112.md) | [`112-1` · 彻底删除 `jelly-whisper` 音视频转写与 626 MB 模型下载链（结清 `BL-122`/`BL-398`），图文提取器改名 `molis-material` 并补日文 OCR](reference/batches/112.md#batch-112-item-1)（2026-11-25 用户专项新增，拆 2 个正交并行 PR，与 `44C` 并行推进并在 `108` 与 `54` 之前合入） |
|  | [`112-2` · Jelly 彻底瘦身（日历日程＋纯文本/Markdown 极简随手记，砍除私有 AI 拆解/独立模型台/进展页/块级复杂结构）与标准 SQLite 关系分表重构](reference/batches/112.md#batch-112-item-2) |

<a id="server-batch"></a>

## 服务端批

排在 01～112 及 M1（[`REL-5`](reference/batches/rel-5.md) `1.0.0`）发出之后，开工时间由用户定；01～112 不等它。后续服务端需求继续加在这一批。

| 批次 | 批次内内容 |
| --- | --- |
| [SRV-1](reference/batches/srv-1.md) | [`SRV-1-1` · 主干个人同步底座与 UPP＋`112-2` 瘦身后 4 表 `Jelly` 终态对账（单 PR 先行设计）](reference/batches/srv-1.md#srv-1-item-1) |
|  | [`SRV-1-2` · 身份、项目三档访问与分层协作协议（富文稿实时增量协同＋关系表按行／字段版本化同步，零 SQLite 黑盒化）](reference/batches/srv-1.md#srv-1-item-2) |
|  | [`SRV-1-3` · 同步合同、Outbox（`BL-070`）与接受 `1.0.0` 客户端的 `U5` 跨版本兼容规则](reference/batches/srv-1.md#srv-1-item-3) |
|  | [`SRV-1-4` · 团队记忆访问隔离设计与同步／共享／冲突／实时共编三语定样切片](reference/batches/srv-1.md#srv-1-item-4) |
| [SRV-2](reference/batches/srv-2.md) | [`SRV-2-A` · Rust/WASM 同步传输核心、Outbox、`>256 KiB` 大附件断点续传与冲突双版本保留底座（串行 2 PR，PR 1：附件未完禁报已全同步）](reference/batches/srv-2.md#srv-2-item-1) |
|  | [`SRV-2-B` · 成果库／置物架＋待办／`Pages`／`Schedule`／瘦身 `Jelly` 接入、大日志库留本机＋记忆遗忘墓碑同步与真实云端字节验收（PR 2）](reference/batches/srv-2.md#srv-2-item-3) |
| [SRV-3](reference/batches/srv-3.md) | [`SRV-3-A` · 平台通用实时协同合同、项目三档拦截、在途撤权与 `Pages` 人机共编实现（串行 2 PR，PR 1：零宿主特权、AI 只用发起人模型授权并标明发起人）](reference/batches/srv-3.md#srv-3-item-1) |
|  | [`SRV-3-B` · 两个真实独立身份线上双端联调、断网重启撤权实测与未覆盖插件对象清账（PR 2）](reference/batches/srv-3.md#srv-3-item-2) |
| [SRV-4](reference/batches/srv-4.md) | [`SRV-4-1` · 其余 19 个平等 UPP 分区插件（含瘦身 `Jelly`）及讨论 IM 团队协作覆盖与三语定样（单 PR 先行定稿，含共享确认 V13）](reference/batches/srv-4.md#srv-4-item-1) |
|  | [`SRV-4-2` · 团队记忆本机有界提炼（云端零模型密钥）、矛盾并列保留分歧与「当轮指令＞公共产物团队约定＞个人汇报偏好」优先级及三语定样](reference/batches/srv-4.md#srv-4-item-2) |
| [SRV-5](reference/batches/srv-5.md) | [`SRV-5-A` · 全量 20 个 UPP 插件＋公开 SDK 沙箱插件同步收口、整项目复制／回收站与本地优先零阻断恢复（串行 2 PR，PR 1：云满／止损不锁本机，换机温和引导绑目录）](reference/batches/srv-5.md#srv-5-item-1) |
|  | [`SRV-5-B` · 正式云服务限额告警、D1+R2 配对备份／只读止损演练与两台真实 Apple Silicon Mac 跨版本（`1.0.0`↔最新）接续验收（PR 2）](reference/batches/srv-5.md#srv-5-item-3) |
| [SRV-6](reference/batches/srv-6.md) | [`SRV-6-A` · 团队身份、项目共享邀请、三档统一访问拦截与项目讨论 IM（串行 3 PR，PR 1：严守 `personal` 分区与私人凭据零泄露＋共享明示 V13）](reference/batches/srv-6.md#srv-6-item-1) |
|  | [`SRV-6-B` · 全量 20 个平等 UPP 插件（含瘦身 `Jelly`）分层协同、成员在线光标与人机任务接续（PR 2）](reference/batches/srv-6.md#srv-6-item-2) |
|  | [`SRV-6-C` · 在途撤权、自动清退本机共享项目副本（保本人未发离线增量进 `system.shelf`）与两名真实成员完整项目验收（PR 3）](reference/batches/srv-6.md#srv-6-item-3) |
| [SRV-7](reference/batches/srv-7.md) | [`SRV-7-A` · 共享项目获准来源采集、本机按预算有界提炼（云端零模型密钥）、矛盾并列保留分歧与撤权阻断（串行 2 PR，PR 1）](reference/batches/srv-7.md#srv-7-item-1) |
|  | [`SRV-7-B` · 成员不可撤回二次确认发布、懒加载三语管理页（安静零通知打扰）、三类交接 Zone 4 消费与接入「`设置 › 评测`」验收（PR 2）](reference/batches/srv-7.md#srv-7-item-2) |
| [SRV-8](reference/batches/srv-8.md) | [`SRV-8-A` · `arm64` 自动更新、后台秒级库级副本彩排与不打断运行中 AI 任务的延后重启／回退（独立并行 3 PR，PR 1）](reference/batches/srv-8.md#srv-8-item-1) |
|  | [`SRV-8-B` · 本机端到端加密增量定时在线备份与非空先拍快照恢复（PR 2：含记忆遗忘墓碑，排除密钥／路径／索引与大日志库）](reference/batches/srv-8.md#srv-8-item-2) |
|  | [`SRV-8-C` · 默认关闭、开启前透明预览脱敏样例的可选崩溃上报（PR 3：接 `REL-3-A`／`70-1` 脱敏底座）](reference/batches/srv-8.md#srv-8-item-3) |

<a id="release-batch"></a>

## 发行批

只为对外发行才要的事（2026-11-14 用户定，[决定 45](reference/decisions.md#decision-45)，[发行批总则](reference/release-batch.md)）：开工时间由用户定，01～112 不等它；`REL-5`（M1 `1.0.0`）排在第 `90` 批 Clean v1 封板之后发出，保阶段 3～4 开发全程零历史兼容迁移包袱。

| 批次 | 批次内内容 |
| --- | --- |
| [REL-1](reference/batches/rel-1.md) | [`REL-1-1` · Apple Developer 签名证书与 App Store Connect `.p8` API 公证密钥（替代个人专用密码）](reference/batches/rel-1.md#rel-1-item-1) |
|  | [`REL-1-2` · 公开产品页、覆盖 OAuth 本机存储的隐私政策与服务条款起草与域名验证](reference/batches/rel-1.md#rel-1-item-2) |
|  | [`REL-1-3` · 正式外部连接应用快慢分流（细粒度 GitHub App／Notion／Linear 进 M1，Google CASA／Slack 长审并行不卡发包）](reference/batches/rel-1.md#rel-1-item-3) |
|  | [`REL-1-4` · 自研 `@prologue/sdk` 随安装包再分发内部许可记录落档](reference/batches/rel-1.md#rel-1-item-4) |
| [REL-2](reference/batches/rel-2.md) | [`REL-2-1` · Apple Silicon（`arm64` 单架构）逐件重签、接通 `.p8` `api-key` 公证与 `75-B` 系统入口声明（不含 `jelly-whisper`/`x64`）](reference/batches/rel-2.md#rel-2-item-1) |
|  | [`REL-2-2` · 瘦身后原生组件（`molis-material` 等，零 626 MB 语音包）随包预置与首次自检恢复](reference/batches/rel-2.md#rel-2-item-2) |
|  | [`REL-2-3` · 全套随包官方包（含 `system-skills`、`45`/`52`、`68-C` 14 样板、`82`）正式签名与 OFL／三语字体分发核对](reference/batches/rel-2.md#rel-2-item-3) |
| [REL-3](reference/batches/rel-3.md) | [`REL-3-A` · 本机脱敏日志轮转（接 `70-1`）、Node／Rust 崩溃恢复与带导出前透明预览的纯本机诊断包（串行 2 PR，PR 1：全程零联网）](reference/batches/rel-3.md#rel-3-item-1) |
|  | [`REL-3-B` · 平台包可选默认空操作 `DiagnosticLogger` 窄口与高价值静默 `catch` 补记（PR 2，结清 `BL-812` 防全仓大震荡）](reference/batches/rel-3.md#rel-3-item-2) |
| [REL-4](reference/batches/rel-4.md) | [`REL-4-A` · 基于 `90` Clean v1 `version: 1` 封板起点的合同过渡 `U5` 与门禁切换（独立并行 2 PR，PR 1：覆盖工作流／角色／`Blueprint`／保存操作面／MCP）](reference/batches/rel-4.md#rel-4-item-1) |
|  | [`REL-4-B` · 秒级库级副本升级演练 `U6` 与退回上一版衔接（PR 2：仅拷全分区 SQLite 库与清单，跳过 GB 级大附件与缓存防撑爆磁盘）](reference/batches/rel-4.md#rel-4-item-2) |
| [REL-5](reference/batches/rel-5.md) | [`REL-5-1` · 等 `90` Clean v1 封板后，无开发环境第二台 Apple Silicon Mac 全套真机验收与 M1（`1.0.0`）正式发行立标（封存 `golden-homes/1.0.0`）](reference/batches/rel-5.md#rel-5-item-1) |

<a id="reference"></a>

## 参考

| 要查什么 | 文件 |
| --- | --- |
| 执行边界、同批顺序、字体切换与升级窗口 | [执行规则](reference/execution-rules.md) |
| 每项怎样开工、设计、实施、验证和收尾 | [需求开发流程](reference/development-workflow.md) |
| 批次主会话从开工到合入、收尾逐步做什么（各批 Goal Prompt 的公共部分） | [批次执行手册](reference/batch-runbook.md) |
| 批次完整交付、来源、前置、并行与 UI | 每批一个文件，从 [01](reference/batches/01.md) 起；[服务端批总则](reference/server-batch.md)；[发行批总则](reference/release-batch.md) |
| 原需求、类型、待决与批次映射 | [需求来源](reference/requirements.md) |
| 近期需求 PR 的实际内容与批次去处 | [PR 来源对照](reference/requirement-prs.md) |
| 为什么这样排序、谁依赖谁 | [排期原则与依赖](reference/dependencies.md) |
| 由谁做、哪些文件独占、怎样并行 | [轨道与分工](reference/tracks.md) |
| 每阶段要形成什么、何时可退出 | [阶段与验收](reference/stages-and-acceptance.md) |
| 用户已经定了什么、还缺什么决定 | [决策记录](reference/decisions.md) |
| 暂缓、暂停与条件触发的去处 | [暂缓与条件项](reference/deferred.md) |
| 起点、历史核查与调整来由 | [基线与历史](reference/baseline-and-history.md) |
| 新需求、状态、证据和链接怎样更新 | [维护规则](reference/maintenance.md) |
