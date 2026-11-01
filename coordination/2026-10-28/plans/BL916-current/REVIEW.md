# BL916 当前接续稿独立窄审

**结论：先完整四资源、再在其准确采用树做background的方向成立；T143旧采用等待已解除，仍不能将任一本标为无条件READY。** 原两本工程书和既有通过评审不需重开，原owner保留。当前须补清两处交接文字，随后由根给具体窗口，不拆app残片、不扩大矩阵。

本线读当前PLAN、revision-3固定PLAN/两书/FINAL-REVIEW及相关T144/T141当前接续稿，并只读指定M、保护头和PR1b当前本地头的目标hunk；未build/test、merge/checkout、fetch、改refs/GH/共账/源码。以下是当前准备裁决，不是执行/真包验收或远端fresh锁声明。

## 当前需补清的两处

1. **T141的registry等待按最新差量表述，不能继续归为整片采用依赖。** BL916 PLAN早于最新T141当前接续稿；其表格“T141自身仍等#1672 integration-registry”不宜继续写成技术事实。最新 `/private/tmp/t141-current-ready/PLAN.md` 已区分：#1672只改oauthOwner/grant与import，T141要的是IntegrationRegistry.attach队列体/assertFree声明更新；无必须先采用整个#1672才能完成Home app/source升级的技术依赖，真正待根解除的是attach写窗口和T144共享hunk。这是只读接续结论，原工单状态是否更新仍归根，不能据新稿自行抢锁。BL916与T141也不应互相变成“等对方整单采用”：保留plugin-install-service的preview/permission setter、home-installed-plugins生命周期和settings-plugins实际review块、签包/安装共用fixture及完整测试的精确串行归属即可。需要谁先冻结由根排，本片不接管T141、不借其现有等待绕过自己的setter/UI闭环。

2. **保护DDL交接表补Runtime公开导出，并以PR1b真实冻结头派窗口。** 独立核#1101准确头`2b38b5f5fef4bf70617c3c05b22b6d446771d693`自己的差异，除project-database.ts与SDK index，还包括 **packages/plugin-runtime/src/index.ts**：它同一project-database导出行新增inspectExistingPluginProjectDatabase。当前表仅写“SDK index另有导出交集”，容易漏掉Runtime这条未来合成接缝。四资源若提取规则需改Runtime公共导出，应把该行和相应API快照并入根的条目窗口，保已有project wrapper签名/返回及project_root特权；若实施无需改该入口则明确只读保留，不预领整文件。#1101新增checkedExisting/inspectExisting复用原inspect/shape/ledger，不能消费其未采用API或改保护树，后续正常合成责任由根指定。#1059准确头的本片核心owner交集为空，不增加其采用前置。

   PR1b的root-open-0630记录是旧已发布d37头，不等于当前writer冻结点。本线回读本地PR1b当前头`3421e0e69645a7ac247672c590951bce3a9c5765`，SDK实际差异仍是pageRouteProblems import、assertNoV2Blocks/ui.page_routes、assertV2Blocks调用及index导出，与本稿所列同parser/export接缝一致，未发现新的资源能力依赖。因此无需等待PR1b全单采用；但派发时根必须给当时实际冻结head/patch，不能把旧20头快照当已交接证明，也不能在dev3仍改同parser时并写。此处是准确窗口收口，不要求再审PR1b或遍历全仓锁。

## 已核成立的先后关系

指定M=`08642dcb92dbdad029d990813da56682d6864a23`包含实际采用15ad；与T143最终H58a的sandbox Manifest/reader、exposed-actions、安装服务、Home executor及sandbox services目标父接缝无diff。T143 squash采用不要求旧H本身成为main祖先，更不应再等其候选。可以沿用已采用模型/生图/operation权限基础的原来源，不重演T143旧矩阵。

当前缺口仍在：PluginPermissionView没有requested；openSandboxHomeLibrary仍同步开库；exposed-actions注册时展开cost对象而runInPluginAction持原definition；sandboxServicesFor仍需Host background与backgroundLane同时存在才公布background。这些事实支持原两本工作仍必要，不证明任何服务已完成。

四资源是当前可安排的**完整第一本**：资源形状、Declared/Requested/Operation、静态Manifest与finalDefinition、预览/批准/setter/保存恢复、异步Home有界DDL及真签包四服务正反/恢复一起交付。T144书明确不把BL916实现当能力前提，没有反向依赖环。当前四资源书仍明文要求T143/T144之后的采用输入；T143部分解除，T144部分需遵守现行排程。根若选择先在T144冻结patch后并行做四资源，可只更新原书的排程/准确输入和共享hunk交接，不必重新设计工程语义；本评审不自动解除“T144采用”或授权这种变更。

background使用第一本Requested/operation/静态投影与finalDefinition，并要求真实target同时具有DB/files/受控HTTPS效果、可信COMMIT unknown与业务job重启待核对。现有broker/lane只能证明分层能力，不能绕过缺失的真包声明/授权/安装链。因此background目前只能准备接口，不宜先补background_job/lane后报告“可独立完整交付”。第一本通过仍留BL916，第二本五项证据齐才由根收行。

## 最小下一步与窗口

根可先只更新原书状态句：T143采用已满足，T144采用条件/具体共享窗口待定；保原作者与完整验收。随后交接以下有限集合，足以派四资源整本，不要求先合全部在途大单：

- **T144父接缝**：reader允许块/真实签名文件映射、sandbox Manifest唯一派生、保存/恢复definition、preview输出/权限视图与Home executor异步start/服务公布/关闭。按同一实际发布definition串行；不各造一份Manifest/预览/恢复实现。
- **SDK与Runtime**：PR1b parser/import/index冻结hunk，及上述DDL共用规则、project wrapper和必要Runtime导出行；保护分支保持不动，后续合成责任明确。
- **T141与共享结算**：Host permission setter/Home升级与设置review真实同函数块、确需改的既有签包fixture/安装测试窗口；API/actions/SI/README/资源仅本片条目由根串行。T141/T144先后选择不能改变四资源完整范围或授予Manifest全集grants。

T389/T386/T390未见本片核心生产路径交集；其资源和SI共享只影响具体条目/公共槽，不构成整单产品等待。签名Darwin链、Linux分层、shared-core/full=true及旧有效证据复用沿原书，不新增本地测试/故障矩阵，不以Linux skip或手工definition抵真包验收。待窗口成立再从真实采用输入完成第一本，background接第一本准确采用树；当前不宣称READY或任何实现通过。
