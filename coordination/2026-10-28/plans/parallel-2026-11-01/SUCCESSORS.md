# 本批并行后的前五个后继：只读排程差量

状态：仅队列准备；不派单、不占号、不修改共账/源码/refs/GH，不build/test。执行规则以根已生效的 [并行窗口](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/parallel-2026-11-01/PLAN.md) 为准：T389开发2、T390开发1、PR1b开发3、T386开发4路径独立，可并行源码；公共build/browser槽串行。下文没有“整机唯一writer”前置。

读当前MISC、ESTIMATE最新追加、BOARD及已接受工程书。ESTIMATE头部和BOARD若仍写“PR1b/T386等唯一writer”，已被06:16Z并行窗口取代；根更新这一句状态即可，不重复审计73项或重算23～31片。T146/T385/T387/B等仅待Full的在途片、T391待CI文档均不是本清单的新开发。

## 第一波：本批直接释放，优先两项

### 1. T116 PR1c：声明式舞台/词典与旧拼装删除

- **负责人**：T116现行接续作者为Codex开发线3（当前只派PR1b）；链原受理t281-ca保历史归属。PR1c尚无本轮独立派单，根须给明确后片作者/交接，不自动从PR1b“完成”推导已领后片。
- **唯一需求**：原T116 accepted评论6541306409及裁定6541316193；已整理在 [T116接续 §1/§3](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-followups/PLAN.md)。无独立T116 md书，不补造第二spec。
- **精确门槛/窗口**：PR1b三必修后的**实际采用提交**及接口/API冻结；不能以旧d37或候选通过替代。交Goals src/page、stage/fragments/manifest/词典与现有出口，Workbench renderer/ui-composition/shell-page-renderer/stage-renderers及Host旧拼装hunk；保T148已采用终端端口。PR1b作者冻结后可只读核这些接缝/金样，正式改代码仍等采用及根fresh同文件交接。
- **复用/下一动作**：复用§3数据→Goals stage→contribution模型、owner限定与不双画要求、普通golden/66完整HTML方法及父有效DUMP；不重审1a/1b。根把旧“等PR1a”状态改为“等最终PR1b采用与上述窗口”，拿到采用SHA即绑定输入并派原合同实现。

### 2. T144 / BL493 / S105：签名角色资料与方法正文

- **负责人**：BOARD和已接受工程附件均为Codex开发线3；独立二审线1。该作者当前做PR1b，根可在其作者冻结后续派或明确交接给空闲开发线，未交接前归属不变。
- **唯一需求**：`specs/repository-anti-corruption/slices/pg011-pg017-remaining.md` §7及D5/D6/R1/R3/L/Q，RAC2636～2643；[A–D工程PLAN](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T144/PLAN.md) 已接受，无需再写总方案。
- **精确门槛/窗口**：T143已随T384实际采用main15ad，旧“等T143采用”解除；剩余是PR1b独占SDK manifest/index、contracts/UI/API与根登记接缝的具体窗口，不是全局等所有PR。PR1b作者冻结后，根若确认T144不借未采用API、对重叠hunk给明确冻结/采用顺序，可派其独立Host/agent资料等范围准备；共享写入只能接实际采用父或根批准的具体窗口，不能直接消费在途候选。T390的plugin-terminal-panels/S103不等于T144/S105窗口，仍核整文件与Host in-flight。
- **复用/下一动作**：A–D已经固定角色资料、完整发布版本、唯一组装/holder引用计数、取材与末端复核、无额外权限；不重开产品问题或独立T144文件查找。先核最终采用T143实现与PR1b对SDK实际delta，把工程书状态一句改为“前置T143满足；等SDK/API具体交接”，沿既有精确路径、八条RAC执行。

## 第二波：紧随第一波的明确链，不提前标可实施

### 3. T402（T133片2）：Feed/Inbox owner数据及对象路由

- **负责人**：当前BOARD只列T133链由Claude设备A统筹、原方案6519062770接受；未见本轮具体实现作者分配，故**实施owner待分配**，不可冒称T389作者或开发线4已领。
- **唯一需求**：accepted 6519062770，RAC2507～2514；[T116接续 §4及DECISION](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-followups/PLAN.md)，配套API/MOUNT补充均为同一合同的工程附件。
- **精确门槛/窗口**：完整PR1（含PR1c）实际采用，PR1b采用独自不够；contracts/ui、SDK view-placement-declarations、Host project-stage-data/web-goals-read/web-request/对象读与绘制配对接缝，Workbench declared/stage/page/shell渲染及Feed/Inbox manifest。两客户端仅改对象URL时还需T389已修四片段的准确输入和具体hunk交接，不回盖intent修复；T121同文件未交hunk保持冻结。
- **复用/下一动作**：复用A/B/C已核owner/实例/失效拒绝、stage_surfaces、persisted-detail/frame-block及URL同批切换图。PR1c作者冻结时即可只读核最终接口映射；采用后根明确owner/窗口进入实施。不新建dispatcher或重写一份T402方案。

### 4. T116 PR2：统一view与旧布局一次重置

- **负责人**：沿T116原归属/当前接续线3，后片实施仍需根明示派单；不因PR1b已派就同时占其writer。
- **唯一需求**：同一T116 accepted裁定及RAC2687，[接续 §2](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-followups/PLAN.md)；不另发任务号。
- **精确门槛/窗口**：T148实际采用前置已满足（15ad）；完整PR1及最终外壳/布局模型与共享客户端窗口待交接。已接受排程建议为T402→PR2→T403，根可按真实路径调序；这不是凭T148落地即可立即开工。保T389菜单恢复与T386目的地/快捷键补丁，按最终采用main冻结frame/tab/state/客户端文件，不从旧副本搬回来。
- **复用/下一动作**：复用goalView/feedTask→view、旧整布局重置一次且不迁移的已定合同；只补最终TerminalPaneModel/对象URL接缝核对。把旧“仍等#1654”一句改为“终端前置满足，待完整PR1/实际共享窗口”，不重开布局迁移决定。

### 5. T403（T133片3）：Feed/Inbox客户端回插件

- **负责人**：同T402，未见本轮实施作者分配，实施owner待分配；保T133链归属，根明确分派后才接手。
- **唯一需求**：accepted6519062770的片3，RAC2515～2519；[接续 §5](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-followups/PLAN.md)、现成 [PORT-MAP](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-followups/PORT-MAP.md) / MOUNT附件。无需再写客户端搬迁总书。
- **精确门槛/窗口**：T402最终对象数据/路由采用与PR2共享状态交接；五片navigation-feed、navigation-feed-stage、navigation-feed-sources、feed-rule-authoring、navigation-inbox，以及browser-assets、Feed/Inbox registration/browser构建。T389前三片、documents-state与T386若影响挂载/快捷键都按实际采用输入保留。T121共享hunk仍须根交接，不能把当前作者冻结说成其权限开放。
- **复用/下一动作**：现有闭包端口映射可在T389/T402最终作者冻结后有限补差；代码仍按父序。Feed页面内创作与Home Functions A已获产品批准，不再泛问方向；但新增feed.js/feed.css/inbox.js的**资源实测与具体批准**独立保留。先完成可审阅源码/字节/净变化后由根提交具体资源决定，不因方案已批提前放预算，不将真实Home授权混入。

这五项中本批最直接交接的是PR1c、T144；其后三项是第一波随后的明确路线，当前仍有具体父提交/文件/资源条件，不能全部标READY。T390没有在现有书里发现必须新开的直接后继；T386采用释放的是原W6组合/复验条件，不把它重记一张新开发单。PG045仍等T066最终OAuth合同，T065/T066未因本批释放；T141等#1672、PG070等T146、T117/T118等更后整链，均不挤入本次前五。

根下一步只需按以上“状态一句”更新原书/共账，绑定实际采用SHA与具体owner交接；不改未出后继总数，不把作者冻结、方案核收、本地绿或Full排队当采用。此处完成即停，无源/refs/GH/build/test操作。
