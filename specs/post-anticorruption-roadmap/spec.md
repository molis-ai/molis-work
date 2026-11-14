# 防腐后路线书 · 执行目录

状态：执行中（2026-11-13）。统筹与排期维护：Claude（本机）统筹会话，2026-11-04 起（用户定，此前 Codex）；实施由各批主会话一个会话做完（[决定 26](reference/decisions.md#decision-26)、[决定 34](reference/decisions.md#decision-34)），谁在做哪一项看[认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743)。01 已交单；02～27 中至少 18 个批次已有合入记录，最近合入包括 15 #2017（`b819373250`）、16 #2031、22 #2038、25 #2034、27 #2010；06 等仍有在途 PR，未结算项以批次文件与认领板为准。

**当前入口：[批次 01～27 的结算与剩余](reference/batches/) · [认领板 #1743](https://github.com/molis-ai/molis-work/issues/1743) · [本人试用单](reference/acceptance-01.md)。** 批次文件记排期与合入结果，实时认领、分支和状态以认领板最新正文/评论为准。

**从 01 往下做。** 同一批次下，每个独立交付各占一行；点内容看该项产出和前置，点批次号看共同约束、来源、并行和 UI 要求。批次号保持不变；同批无关的子项不互相等待，有先后的写在该项前置里。每批一个文件：开头「给人讲清楚」用大白话说这批做什么、为什么做，末尾「Goal Prompt」可整段交给执行会话。每项开始前按[需求开发流程](reference/development-workflow.md#kickoff-brief)先用大白话讲清要做什么，再给技术说明。

**谁在做什么看[认领板](https://github.com/molis-ai/molis-work/issues/1743)**（置顶的 GitHub issue，用户 2026-11-03 定）：每项交付一行，记认领的会话、分支／PR 和状态。开工前先在那里认领，状态变了就改；本目录和批次文件只记排期与合入后的结果，不记「正在做」。

验收编号：不适用（排期文档；验收以各原需求书为准）。

<a id="execution-batches"></a>

## 01～90

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
| [26](reference/batches/26.md) | [签名、公证与安装准备](reference/batches/26.md#batch-26-item-1) |
|  | [正式 OAuth 应用](reference/batches/26.md#batch-26-item-2) |
|  | [原生组件预置与自检](reference/batches/26.md#batch-26-item-3) |
|  | [本机日志、崩溃恢复与诊断包](reference/batches/26.md#batch-26-item-4) |
|  | [插件升级 U4 与合同过渡 U5](reference/batches/26.md#batch-26-item-5) |
|  | [副本演练与回退 U6](reference/batches/26.md#batch-26-item-6) |
|  | [状态与状态机合同与词表](reference/batches/26.md#batch-26-item-7) |
|  | [状态词汇门禁与文档](reference/batches/26.md#batch-26-item-8)（原 27-6） |
| [27](reference/batches/27.md) | [基础交互体验债](reference/batches/27.md#batch-27-item-1) |
|  | [代码／Diff 及性能余项](reference/batches/27.md#batch-27-item-2) |
|  | [首批文案与帮助](reference/batches/27.md#batch-27-item-3) |
|  | [Runtime、Goals 与沙箱余项](reference/batches/27.md#batch-27-item-4) |
|  | [宿主出口、文档门禁与各包清理](reference/batches/27.md#batch-27-item-5) |
| [28](reference/batches/28.md) | [采集事实接入](reference/batches/28.md#batch-28-item-1) |
| [29](reference/batches/29.md) | [历史查询与记录管理](reference/batches/29.md#batch-29-item-1) |
| [30](reference/batches/30.md) | [最小真实评测路径](reference/batches/30.md#batch-30-item-1) |
| [31](reference/batches/31.md) | [SDK 窗口一](reference/batches/31.md#batch-31-item-1) |
| [32](reference/batches/32.md) | [主对话持续接单与后台任务控制](reference/batches/32.md#batch-32-item-1) |
|  | [逐项产物、认可、返工与复核](reference/batches/32.md#batch-32-item-2) |
|  | [事项线第一片：外壳、线、节点卡与后台任务列表](reference/batches/32.md#batch-32-item-3) |
| [33](reference/batches/33.md) | [Coding 任务与环境恢复](reference/batches/33.md#batch-33-item-1) |
|  | [材料、大清单与重启接续](reference/batches/33.md#batch-33-item-2) |
| [34](reference/batches/34.md) | [Sessions 历史实现](reference/batches/34.md#batch-34-item-1) |
| [35](reference/batches/35.md) | [引导接入已有 Sessions](reference/batches/35.md#batch-35-item-1) |
|  | [Coding A 期](reference/batches/35.md#batch-35-item-2) |
| [36](reference/batches/36.md) | [角色设置、生效与恢复](reference/batches/36.md#batch-36-item-1) |
|  | [主线第一片的合同与服务](reference/batches/36.md#batch-36-item-2) |
| [37](reference/batches/37.md) | [生成页面运行、采用与恢复](reference/batches/37.md#batch-37-item-1) |
|  | [事项切换与工作台状态](reference/batches/37.md#batch-37-item-2) |
| [38](reference/batches/38.md) | [插件配置采用](reference/batches/38.md#batch-38-item-1) |
| [39](reference/batches/39.md) | [授权、人审与统一管理页](reference/batches/39.md#batch-39-item-1) |
|  | [可信决定回平台](reference/batches/39.md#batch-39-item-2) |
| [40](reference/batches/40.md) | [配置、工作交接与使用治理](reference/batches/40.md#batch-40-item-1) |
|  | [全产品文案与按需帮助](reference/batches/40.md#batch-40-item-2) |
| [41](reference/batches/41.md) | [Skill 选用](reference/batches/41.md#batch-41-item-1) |
|  | [规划方法变成技能](reference/batches/41.md#batch-41-item-2) |
| [42](reference/batches/42.md) | [Skill 创作与改进完整路径](reference/batches/42.md#batch-42-item-1) |
| [43](reference/batches/43.md) | [项目助理团执行与交付](reference/batches/43.md#batch-43-item-1) |
|  | [Dataset 汇总、追加与规模性能](reference/batches/43.md#batch-43-item-2) |
| [44](reference/batches/44.md) | [合同去插件化](reference/batches/44.md#batch-44-item-1) |
|  | [项目指导回平台](reference/batches/44.md#batch-44-item-2) |
|  | [要求与认可：Goals 改为消费平台能力](reference/batches/44.md#batch-44-item-3) |
|  | [终端执行解耦](reference/batches/44.md#batch-44-item-4) |
|  | [其他插件去点名](reference/batches/44.md#batch-44-item-5) |
|  | [宿主与工作台去私路、Goals 可移除](reference/batches/44.md#batch-44-item-6) |
|  | [删除桌面胶囊、CLI 的 Goals 命令与 `goal-advance`](reference/batches/44.md#batch-44-item-7) |
|  | [叙事与命名](reference/batches/44.md#batch-44-item-8) |
| [45](reference/batches/45.md) | [首次／项目场景闭环](reference/batches/45.md#batch-45-item-1) |
|  | [官方场景包：行业观察与写作、写代码](reference/batches/45.md#batch-45-item-2) |
| [46](reference/batches/46.md) | [情境 W4 创建与准备声明](reference/batches/46.md#batch-46-item-1) |
|  | [通用任务引导与场景复用](reference/batches/46.md#batch-46-item-2) |
| [47](reference/batches/47.md) | [正式插件交付的平台前置](reference/batches/47.md#batch-47-item-1) |
|  | [状态机登记与只读查询](reference/batches/47.md#batch-47-item-2) |
| [48](reference/batches/48.md) | [新插件创建、隔离试用与安装预演](reference/batches/48.md#batch-48-item-1) |
|  | [成果、搜索与工作流内容站声明](reference/batches/48.md#batch-48-item-2) |
|  | [依赖、来源与权限可见](reference/batches/48.md#batch-48-item-3) |
|  | [首次可用率与返修评测样本](reference/batches/48.md#batch-48-item-4) |
|  | [安装预演与插件目录的状态展示](reference/batches/48.md#batch-48-item-5) |
| [49](reference/batches/49.md) | [个人同步核心 → SRV-2](reference/batches/49.md#batch-49-item-1) |
| [50](reference/batches/50.md) | [团队关键协作 → SRV-3](reference/batches/50.md#batch-50-item-1) |
| [51](reference/batches/51.md) | [双身份协作实证 → SRV-3](reference/batches/51.md#batch-51-item-1) |
| [52](reference/batches/52.md) | [每日简报、设置与中断恢复](reference/batches/52.md#batch-52-item-1) |
|  | [初始日报与工作接续 Skill](reference/batches/52.md#batch-52-item-2) |
|  | [官方场景包：个人事务与每日简报](reference/batches/52.md#batch-52-item-3) |
| [53](reference/batches/53.md) | [回执与交互余项](reference/batches/53.md#batch-53-item-1) |
|  | [智能呈现第二片](reference/batches/53.md#batch-53-item-2) |
|  | [主线第二片](reference/batches/53.md#batch-53-item-3) |
| [54](reference/batches/54.md) | [本机语音](reference/batches/54.md#batch-54-item-1) |
| [55](reference/batches/55.md) | [月／季／年重复](reference/batches/55.md#batch-55-item-1) |
|  | [等待分组与时长](reference/batches/55.md#batch-55-item-2) |
|  | [待办整理样本](reference/batches/55.md#batch-55-item-3) |
|  | [TypeSafe 未连接时的判断](reference/batches/55.md#batch-55-item-4) |
|  | [Shelf 轮盘与快捷键](reference/batches/55.md#batch-55-item-5) |
|  | [工作流查询与映射](reference/batches/55.md#batch-55-item-6) |
|  | [旧 Office 与下载／转写恢复](reference/batches/55.md#batch-55-item-7) |
|  | [连续两期场景](reference/batches/55.md#batch-55-item-8) |
| [56](reference/batches/56.md) | [Attention 唤醒、角标与系统通知](reference/batches/56.md#batch-56-item-1) |
|  | [切换后新入口文字与翻译复核](reference/batches/56.md#batch-56-item-2) |
|  | [N22 全量迁移与收口](reference/batches/56.md#batch-56-item-3) |
| [57](reference/batches/57.md) | [个人工作完整路径与 M1 交付](reference/batches/57.md#batch-57-item-1) |
| [58](reference/batches/58.md) | [子代理公共交互组件](reference/batches/58.md#batch-58-item-1) |
| [59](reference/batches/59.md) | [子代理双入口接入](reference/batches/59.md#batch-59-item-1) |
| [60](reference/batches/60.md) | [Sessions 控制与交接](reference/batches/60.md#batch-60-item-1) |
| [61](reference/batches/61.md) | [服务矩阵、现有连接与统一搜索](reference/batches/61.md#batch-61-item-1) |
|  | [自动化推荐与采用](reference/batches/61.md#batch-61-item-2) |
|  | [交给 SDK 窗口二的缺口清单](reference/batches/61.md#batch-61-item-3) |
| [62](reference/batches/62.md) | [四策略、SDK 补缺与逐服务验收](reference/batches/62.md#batch-62-item-1) |
|  | [项目模型限制与出站边界](reference/batches/62.md#batch-62-item-2) |
|  | [组合候选目录与引用语义](reference/batches/62.md#batch-62-item-3) |
| [63](reference/batches/63.md) | [全平台评测扩展](reference/batches/63.md#batch-63-item-1) |
| [64](reference/batches/64.md) | [主动发现、持续工作与周期报告](reference/batches/64.md#batch-64-item-1) |
|  | [智能组合第三片](reference/batches/64.md#batch-64-item-2) |
|  | [主线建议与跨项目个人视图](reference/batches/64.md#batch-64-item-3) |
|  | [初始场景 Skill 与默认配置](reference/batches/64.md#batch-64-item-4) |
|  | [访谈初始化与工作记忆](reference/batches/64.md#batch-64-item-5) |
|  | [回执阶段 5](reference/batches/64.md#batch-64-item-6) |
|  | [安静准备与观察试用](reference/batches/64.md#batch-64-item-7) |
| [65](reference/batches/65.md) | [公共搜索与联网设置](reference/batches/65.md#batch-65-item-1) |
|  | [受限命令、依赖与 AI 低风险审批](reference/batches/65.md#batch-65-item-2) |
|  | [Hooks 启用、变更、停用与恢复](reference/batches/65.md#batch-65-item-3) |
| [66](reference/batches/66.md) | [Coding 自检、评审与有界迭代](reference/batches/66.md#batch-66-item-1) |
|  | [简化与安全专科评审](reference/batches/66.md#batch-66-item-2) |
|  | [依据三档与同一验收卡](reference/batches/66.md#batch-66-item-3) |
| [67](reference/batches/67.md) | [Computer Use、Git 与 PR／CI 基础接入](reference/batches/67.md#batch-67-item-1) |
|  | [评论处理与真实完整任务评估](reference/batches/67.md#batch-67-item-2) |
| [68](reference/batches/68.md) | [已装插件持续修订、采用与升级](reference/batches/68.md#batch-68-item-1) |
|  | [生成插件业务数据导出](reference/batches/68.md#batch-68-item-2) |
|  | [缺包、损坏、卸载与重启恢复](reference/batches/68.md#batch-68-item-3) |
|  | [生成插件呈现与操作面保存](reference/batches/68.md#batch-68-item-4) |
|  | [各主推角色的可安装、可改用样例](reference/batches/68.md#batch-68-item-5) |
|  | [新插件同口径评测](reference/batches/68.md#batch-68-item-6) |
| [69](reference/batches/69.md) | [情境 W5 拖放](reference/batches/69.md#batch-69-item-1) |
|  | [情境 W6 Shelf 与材料篮](reference/batches/69.md#batch-69-item-2) |
| [70](reference/batches/70.md) | [本机规则脱敏](reference/batches/70.md#batch-70-item-1) |
|  | [Gmail 全文与附件](reference/batches/70.md#batch-70-item-2) |
|  | [YouTube 字幕](reference/batches/70.md#batch-70-item-3) |
|  | [PPT 图片与图表](reference/batches/70.md#batch-70-item-4) |
|  | [Pages 个人模板](reference/batches/70.md#batch-70-item-5) |
|  | [固定版逐段差异](reference/batches/70.md#batch-70-item-6) |
|  | [出处追溯](reference/batches/70.md#batch-70-item-7) |
|  | [结论重看](reference/batches/70.md#batch-70-item-8) |
|  | [Word 与固定版导出](reference/batches/70.md#batch-70-item-9) |
|  | [规划方法扩行业](reference/batches/70.md#batch-70-item-10) |
| [71](reference/batches/71.md) | [外观自定义与助理制作 D 段](reference/batches/71.md#batch-71-item-1) |
|  | [外观与语言整体交付 E 段](reference/batches/71.md#batch-71-item-2) |
| [72](reference/batches/72.md) | [复杂场景设计定稿](reference/batches/72.md#batch-72-item-1) |
| [73](reference/batches/73.md) | [技能包、工作流与生成插件导入导出](reference/batches/73.md#batch-73-item-1) |
|  | [场景方案与保存操作面导入导出](reference/batches/73.md#batch-73-item-2) |
|  | [整份 Home 导出与导入 U7](reference/batches/73.md#batch-73-item-3) |
|  | [业务数据导出回读](reference/batches/73.md#batch-73-item-4) |
| [74](reference/batches/74.md) | [个人同步完整交付 → SRV-5](reference/batches/74.md#batch-74-item-1) |
| [75](reference/batches/75.md) | [本机使用统计](reference/batches/75.md#batch-75-item-1) |
|  | [调用用量与费用](reference/batches/75.md#batch-75-item-2) |
|  | [其他应用送入 Work](reference/batches/75.md#batch-75-item-3) |
| [76](reference/batches/76.md) | [全平台与主动效果验收](reference/batches/76.md#batch-76-item-1) |
| [77](reference/batches/77.md) | [手动场景组装](reference/batches/77.md#batch-77-item-1) |
| [78](reference/batches/78.md) | [个人助理场景组装入口](reference/batches/78.md#batch-78-item-1) |
| [79](reference/batches/79.md) | [团队身份与访问 → SRV-6](reference/batches/79.md#batch-79-item-1) |
| [80](reference/batches/80.md) | [团队实时协作 → SRV-6](reference/batches/80.md#batch-80-item-1) |
| [81](reference/batches/81.md) | [团队恢复与首版验收 → SRV-6](reference/batches/81.md#batch-81-item-1) |
| [82](reference/batches/82.md) | [Alchemist 完整研究场景](reference/batches/82.md#batch-82-item-1) |
|  | [CGS 自媒体创作场景](reference/batches/82.md#batch-82-item-2) |
| [83](reference/batches/83.md) | [通用性、角色样例与业务数据验收](reference/batches/83.md#batch-83-item-1) |
|  | [创作效果同口径评测](reference/batches/83.md#batch-83-item-2) |
|  | [两条创作路径与智能呈现整项验收](reference/batches/83.md#batch-83-item-3) |
| [84](reference/batches/84.md) | [Coding C／D 期余项](reference/batches/84.md#batch-84-item-1) |
|  | [Coding 交互计划页](reference/batches/84.md#batch-84-item-2) |
| [85](reference/batches/85.md) | [代码现代化完整流程](reference/batches/85.md#batch-85-item-1) |
| [86](reference/batches/86.md) | [Harness 效率实验](reference/batches/86.md#batch-86-item-1) |
| [87](reference/batches/87.md) | [团队记忆形成与融合 → SRV-7](reference/batches/87.md#batch-87-item-1) |
| [88](reference/batches/88.md) | [团队记忆发布、管理与效果 → SRV-7](reference/batches/88.md#batch-88-item-1) |
| [89](reference/batches/89.md) | [情境 W7 与总纲收口](reference/batches/89.md#batch-89-item-1) |
|  | [回执阶段 6 的各场景](reference/batches/89.md#batch-89-item-2) |
|  | [Skill 效果比较](reference/batches/89.md#batch-89-item-3) |
| [90](reference/batches/90.md) | [整条路线最终交付对账](reference/batches/90.md#batch-90-item-1) |

<a id="server-batch"></a>

## 服务端批

排在 01～90 之后，开工时间由用户定；01～90 不等它。后续服务端需求继续加在这一批。

| 批次 | 批次内内容 |
| --- | --- |
| [SRV-1](reference/batches/srv-1.md) | [个人同步分支对账](reference/batches/srv-1.md#srv-1-item-1) |
|  | [身份、访问与协作协议](reference/batches/srv-1.md#srv-1-item-2) |
|  | [同步合同、Outbox 与版本兼容](reference/batches/srv-1.md#srv-1-item-3) |
|  | [团队记忆来源、用途与访问边界](reference/batches/srv-1.md#srv-1-item-4) |
| [SRV-2](reference/batches/srv-2.md) | [同步服务、账号与传输核心](reference/batches/srv-2.md#srv-2-item-1) |
|  | [附件、大对象与冲突恢复](reference/batches/srv-2.md#srv-2-item-2) |
|  | [核心插件同步与附件字节验收](reference/batches/srv-2.md#srv-2-item-3) |
| [SRV-3](reference/batches/srv-3.md) | [团队关键协作实现](reference/batches/srv-3.md#srv-3-item-1) |
|  | [双身份真实协作验证](reference/batches/srv-3.md#srv-3-item-2) |
| [SRV-4](reference/batches/srv-4.md) | [团队剩余覆盖与交互设计](reference/batches/srv-4.md#srv-4-item-1) |
|  | [团队记忆形成、融合与使用设计](reference/batches/srv-4.md#srv-4-item-2) |
| [SRV-5](reference/batches/srv-5.md) | [逐插件同步、完整历史与公开插件接入](reference/batches/srv-5.md#srv-5-item-1) |
|  | [全插件同步、项目复制与回收](reference/batches/srv-5.md#srv-5-item-2) |
|  | [双 Mac、跨版本与工作接续验收](reference/batches/srv-5.md#srv-5-item-3) |
|  | [附件、大对象与故障恢复验收](reference/batches/srv-5.md#srv-5-item-4) |
|  | [正式服务限额、监测与备份恢复](reference/batches/srv-5.md#srv-5-item-5) |
| [SRV-6](reference/batches/srv-6.md) | [团队身份、项目共享与统一访问](reference/batches/srv-6.md#srv-6-item-1) |
|  | [内容实时协作与工作接续](reference/batches/srv-6.md#srv-6-item-2) |
|  | [撤权、离线与跨客户端恢复](reference/batches/srv-6.md#srv-6-item-3) |
| [SRV-7](reference/batches/srv-7.md) | [团队记忆采集、形成与融合](reference/batches/srv-7.md#srv-7-item-1) |
|  | [团队记忆发布、管理与效果](reference/batches/srv-7.md#srv-7-item-2) |
| [SRV-8](reference/batches/srv-8.md) | [自动更新与回退](reference/batches/srv-8.md#srv-8-item-1) |
|  | [在线备份与恢复](reference/batches/srv-8.md#srv-8-item-2) |
|  | [可选崩溃上报](reference/batches/srv-8.md#srv-8-item-3) |

<a id="reference"></a>

## 参考

| 要查什么 | 文件 |
| --- | --- |
| 执行边界、同批顺序、字体切换与升级窗口 | [执行规则](reference/execution-rules.md) |
| 每项怎样开工、设计、实施、验证和收尾 | [需求开发流程](reference/development-workflow.md) |
| 批次完整交付、来源、前置、并行与 UI | 每批一个文件，从 [01](reference/batches/01.md) 起；[服务端批总则](reference/server-batch.md) |
| 原需求、类型、待决与批次映射 | [需求来源](reference/requirements.md) |
| 近期需求 PR 的实际内容与批次去处 | [PR 来源对照](reference/requirement-prs.md) |
| 为什么这样排序、谁依赖谁 | [排期原则与依赖](reference/dependencies.md) |
| 由谁做、哪些文件独占、怎样并行 | [轨道与分工](reference/tracks.md) |
| 每阶段要形成什么、何时可退出 | [阶段与验收](reference/stages-and-acceptance.md) |
| 用户已经定了什么、还缺什么决定 | [决策记录](reference/decisions.md) |
| 暂缓、暂停与条件触发的去处 | [暂缓与条件项](reference/deferred.md) |
| 起点、历史核查与调整来由 | [基线与历史](reference/baseline-and-history.md) |
| 新需求、状态、证据和链接怎样更新 | [维护规则](reference/maintenance.md) |
