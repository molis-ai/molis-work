# T384 实际采用后的既有书派工顺序

状态：只读准备，2026-10-31 PDT。T384 尚在实施链，本文不认定四片已采用、不计 READY、不分新号。根回读实际 main 采用提交、四片补丁及两项合成修复后，以该准确 M* 重新冻结以下书的输入。现有 owner 保留，不因等待改成待分配。本文只补领取顺序与差量，已有书仍是唯一工程合同。

建议先派 **T369 → T116 PR1b → T144**；第四本 **T141** 保留条件队列，根明确 #1672 registry hunk 交接后才插入实现。这里是优先顺序，不授权多个 writer 同时写；根依现有职能聊天安排唯一 writer，审验角色沿用原分工。

| 顺位 / 复用书 | T384 采用实际解除什么 | 领取前最小更新与剩余锁 |
| --- | --- | --- |
| 1. [T369](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-369.md)；负责人仍 Codex 待分配 | T148 的公开异步 `aliasTerminalSession` 与终端记录合同真正落 main；可从真实 alias 等待点核连接变化拒绝 | 把旧基点换 M*，重核 LocalMcpServer 的 alias→连接引用复查→dispatch 顺序与公开接线，保留同屏障正常对照、`mcp.context_changed/invalid`、handler=0和精确变异。唯一写路径仍新增 `tests/mcp-connection-change-refusal.test.ts`；不动 `mcp-server.ts`、`runtime-panel-session.ts`。fresh 核该新文件和公共fixture无人写，再由根派已有职能线。三完整文件仍按原书，不扩传输矩阵；full=false 以最终实际diff复核。 |
| 2. [T116 PR1b接续](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-pr1b-next/PLAN.md)，沿用 #1680 / 原 T116 owner与根交writer | PR1a迁移成为真实父，T362的 `settings_address` 合同/SDK/UI快照从在途变为已采用输入 | 对 #1680 当前 H `d37ec34c8498ab755bf9e34ba430e5648dacb0a8` 正常接续 M*，不能照搬旧预测树。保留 T384 的必填 `GoalsTerminalPaneModel.terminalsRoute`、独立重录golden及T362字段；修原书三个必修：拒三可信字段进入request、L/icon函数属性类型、factories叶子import。`platform/ui.ts`、SDK manifest/index与API快照双边合成；不整文件取一边。正常 golden +66完整HTML比较沿用已有效父DUMP，输入未变不重录压红。full=true，准确头CI/Full另结。 |
| 3. [T144工程书](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T144/PLAN.md)及FINAL-REVIEW；负责人 Codex开发线3 | T143的 effects派生权限、完整instructions、Home安装与模型链成为已采用合同 | 只更新旧58a/main快照到 M* 与真实owner，保A–D已接受语义和accepted §7候选，不另出设计。原书路径中 `packages/plugin-sdk/src/manifest.ts`、`index.ts` 与PR1b明确重叠，必须在PR1b作者完成/根释放后串行交接；保已采用page_routes/settings_address解析。Home `plugin-builder/{installed,prompts}.ts`、`home-installed-plugins.ts` 保T143完整登记/身份，不恢复prompts-only回调。`plugin-install-service.ts`、`settings-plugins.ts`、`installed-plugin-lifecycle.ts` 又与T141共用，领取时给根精确hunk表。仍沿原RAC2636–2643/S105和原真消费者/末端复核验收，不依赖未采用T141来假造Home原地升级。 |
| 4. [T141任务书](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-141.md)与[已接受PLAN](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T141/PLAN.md)；负责人 Codex开发线1 | T143的Home共享源码/fixture锁随T384实际采用解除；#1701测试锁早已解除 | **不因四片采用自动可领**：#1672仍占 `integration-registry.ts`；根给出准确hunk串行交接或等采用。T141只改attach既有队列内 parse/live/assertFree→同步release/declare/替换entry，失败保持旧占用，不能拆detach→attach。保#1672的OAuth grant选择及RAC2447旧holder可用断言。与T144的安装预览/生命周期/设置页明确串行，已有完整升级、失败恢复、密钥/批准测试接线直接复用，不拆app-only缩减单。 |

## 当前确切锁和串行理由

本轮只读 GitHub 元数据及完整分页文件表核到：#1672 仍open，H=`ebcd6536cfec7a457802d1d87c24d2c4a242fda0`；#1680仍open，H=`d37ec34c8498ab755bf9e34ba430e5648dacb0a8`。这不是所有开放PR均无交集的声明；根派发前须对最终允许文件再fresh核全量锁，尤其共享安全文档、资源与API快照，#1101保护不解除。

- #1672 对 `integration-registry.ts` 的实际差分是 import `OAuthGrant`、`oauthOwner(serviceId, grant="authorization_code")` 及 `auth.methods` 按grant选择；T141目标是另一处 attach 声明刷新。二者不是产品依赖，**同文件不同函数仍需根明确hunk窗口**，不能因merge可自动完成就抢锁，也不必凭空要求整条OAuth线先结束。根释放时提供准确H与保留的这三处差分；若头变化重算。
- #1680完整44路径同时含 `platform/ui.ts`、`plugin-manifest.ts`、SDK `manifest.ts/index.ts/page-routes.ts`、Workbench renderer/ui-composition/page-view及对应快照。T384采用只释放其父/T362，不解决PR1b原必修，也不释放它对T144 SDK入口的写锁。PR1b完成作者切片并交根后，T144才取同一入口窗口。
- T144与T141共同写 `plugin-install-service.ts`、`settings-plugins.ts`、`home-installed-plugins.ts`、`installed-plugin-lifecycle.ts`、包reader/manifest和共享安全/动作快照。根可在T141 registry窗口先到时交换两者次序，但必须以实际最终hunk表交接，不能双writer并写安装链。现有owner归属保持。
- T369只有新测试文件，与后三本无生产写路径交集；它是最小、最先能验证真实已采用合同的一本。仍要证明公共alias屏障可达；若当前实现已删除原拒绝点，由根按原书缩减/取消，不复活旧aliasPanelSession。

## 四片后仍不能直接派的后继

- **T117/T118**：复用[已接受T117书](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T117/PLAN.md)和REVIEW，不重写。T117明确等**完整T116 PR1（1b必修+1c声明舞台/词典）及T402采用**后才列最终符号/消费者表；T384仅含1a，不解除这些前置。T118承担状态/docs/skills/BACKLOG尾项，在T117后；本轮在定向tasks/plans检索未找到独立T118书，不因此新增一份或提前派状态销账。T116 PR2虽解除T148前置，仍按T116父序/原批准方案，不从此队列绕过1b/1c；T402/403也保持原序与新资源约束。
- **T403产品授权更新（仅解除这一项）**：根已记录用户明确选择[API-PLAN A](/Users/yijunwang/code/mw-coord/coordination/2026-10-28/plans/T116-followups/API-PLAN.md)：保留Feed页面内创作，授予Home全部规则定义、草稿/已发布记录、样本和试跑的读取，以及改可编辑草稿、试跑、发布的管理能力；不限项目或自建，持相同grant的后台Runtime也可调用，试跑可能产生模型费用；`functions:manage`可选、依现行host-build政策默认开启，设置可关闭。该选择不再WAIT、不重复询问；最终实施只按原API-PLAN精确开放 `functions.authoring.{create,list,update,preview,publish}` 五动作的plugin受众/consume与既定grant，保留撤权拒绝，不扩到delete/sample/context或账号列表管理。**完整PR1/T402、T121账号slot实际采用及最终合同、资源审批/窗口、共享文件锁仍各自WAIT**，不因此将T403排入本轮直接待领。账号选择仍为可信Host本人选择面；真实Home、真凭据、真实模型测试禁区保持，产品费用授权不是测试环境授权。此更新不重开安全评审，也不另造grant或授权账。
- **BL916**：复用[revision-3 PLAN](/private/tmp/bl916-five-services-plan/revision-3/PLAN.md)、four-resources.md、background.md及FINAL-REVIEW（书面无P1）。其状态明确 WAIT **T143/T144实际采用及共享锁**；四片只解除T143。先四资源（homeDatabase/connections/materials/ownerFiles），准确采用后才background；DDL独立controller、Declared/Requested/Operation、COMMIT unknown、业务job状态合同不重设计。它与T144同写包Manifest/reader/预览和Home装配，与T141也碰安装服务，不能现在以四片为由抢占。第一片不关闭BL916，五服务真包闭环齐后才结整行。

最小队列因此是三本直接前置候选加一本有明确hunk条件的既有书，不是四本READY。T384实际采用前可继续原范围只读准备；实际采用后根逐项回读M*、补丁/合同和共享锁，才将相应WAIT改为正式派工。本轮无实现、测试、coord/GH写入、分支或任务编号变更。
