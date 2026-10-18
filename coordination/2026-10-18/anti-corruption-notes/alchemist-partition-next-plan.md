# Alchemist 分库 / Runtime 下一片交接（负责人：主会话；下一片实施待分配）

状态：只读设计稿，2026-10-18；未实施、未运行安装/构建/测试/浏览器。依据 A=`/Users/yijunwang/code/molis-anti-corruption-20261017/wt-alchemist-runtime` 的 `f629556d0da5bfc7ef5f577590c524d9c4185d4b` 与当时 11 份收尾改动。交稿前主会话已将这 11 份收尾保存为 `8f1cee7d333da653ac2712ba14e895dff7f0c11f`，A 状态干净；其 stat 与原 11 文件一致。行号均指这棵树；接手时先核最终合入的 main。唯一需求仍是 A 的 `specs/repository-anti-corruption/spec.md`，本稿不是第二份 accepted spec，主会话采纳后在原 spec 追加下一片合同。

## 结论：先交付 Runtime 关闭前置，不先落一个无人消费的 partition 字段

建议下一片 **ALC-RT-CLOSE：让 Home Runtime 保留清理失败的原实例，等待真实前台和后台工作退出，资源释放成功才遗忘**。目标是该生命周期功能可用。复用现有 `PluginRuntime.stop`、`PluginBackgroundClient`、`HomePluginExecutor`、`PluginDatabase`，不增加插件公开生命周期 API、不迁 Alchemist SQL、不动工作室数据、恢复界面或预算政策。

理由是当前 Alchemist 的 ALC-LIFE 已兑现这项保证，但目标 Runtime 尚未兑现；直接切换会退回已经修好的关闭缺陷。这是当前生产 Runtime 的真实问题，能够单独通过生产 Host / Runtime 用例验收，也会保留在最终迁移中。它不依赖 D1 的成果 operations，不等 C OwnerFiles，更不需要新的分区合同。完成此片只能记“Runtime 关闭前置完成”，不能记“Alchemist 已迁 Runtime/PluginDatabase”。

最终分库仍需要 **可信存储布局/子库归属声明**，现能力不能原样复用；但插件侧的 `PluginDatabaseReader` / `PluginDatabaseTransaction` 足够，无需 `database.open(projectId)`、任意路径、`prepare` facade、borrowedSql 或 readTransaction。为什么暂不把“声明分区”选为下一片，见后面的已核事实与必要后继条件。

## 已核事实与旧稿纠正

| 事实 | 当前源码证据 | 对接手人的约束 |
| --- | --- | --- |
| Alchemist 仍是构建期 Native；目录 `personal:true`，没有 `runtime` 条目 | `apps/workbench/src/builtin-plugins.ts:358`；`apps/local-host/src/alchemist-service-host.ts:41` | 不能靠改成熟度/目录字段称迁移完成；两个 Home 范围 GitHub 连接动作仍须可用 |
| Native Host 按可信 caller.project_id 选现工作室；一个进程按 Home+project 共享实例 | `alchemist-service-host.ts:61–80` | 项目身份不从输入或历史 job 获取；生产仅一个工作室 Store |
| Studio 路径固定，插件拥有 schema；父目录含 Host 搜索事实 | `apps/local-host/src/alchemist-paths.ts:4–12`；`apps/local-host/src/home-stores.ts:28–29`；`plugins/native/alchemist/src/studio/server/db/schema.ts:8` | 保留 `alchemist/projects/<encodeURIComponent(id).replaceAll(".","%2E")>/studio.sqlite`、v1 和 SQL owner；不能把整个 alchemist 根目录随意改归插件来绕过 registry |
| 当前 PluginDatabase 只开 Home 单库 | `packages/contracts/src/platform/plugin-database.ts:19–25`；`packages/storage/src/home-sqlite.ts:5–6`；`apps/local-host/src/plugin-database.ts:7–15` | `store_name:"alchemist"` 会开 `alchemist/alchemist.db`，不是既有 studio.sqlite |
| 当前 trusted entries 要求 store.library、同 owner、同 baseline | `apps/local-host/src/plugin-database-entries.ts:28–46` | alchemist 现登记是 Host 目录、没有 library；不能只加 partition 字段便放行 |
| Project executor 有固定项目身份，但数据库仍调用同一 Home 单库 opener | `apps/local-host/src/plugin-host-services.ts:84–88`；`plugin-executor.ts:9–26` | 改走 Project executor 不会自动解决分库；而且 Home GitHub 连接操作及单 Home 安装语义不可顺手改变 |
| Home executor 不提供项目成果/端口/事件 | `apps/local-host/src/home-plugin-executor.ts:16,35–37,86–89` | D1“仅项目 SDK”的成果操作不能据此算 Home Alchemist 已可消费 |
| ALC-LIFE 已追踪真实 Promise 与失败资源 | Alchemist `bootstrap/actor-actions.ts:6–35`、`bootstrap/studio-lifecycle.ts:28–35`；Host `alchemist-service-host.ts:94–125`；`alchemist-search.ts:74–86` | 这些现有保证迁移时要保留；不再重做原生命周期片 |
| ALC-RES 已无自动扫描旧持久队列 | Alchemist `jobs/local-worker.ts:33–76`；`services/job-resumption.ts:75–92` | 旧稿的 recoverExpired/claimNext/无继续动作已失效；重启零自动消费已定，不再问政策 |

读取了根 AGENTS、`docs/system/PARALLEL-DEVELOPMENT.md`，Alchemist、local-host、contracts、plugin-sdk、plugin-runtime、storage 的开发要求，以及 `skills/molis-plugin-dev/SKILL.md` 和相关 authoring/host 章节。旧的三个 D 稿只作线索；其中“先 seed/recover 再启动”、原预算待决、重启无继续入口均不能继续作为现状。

## 下一片的具体根因、调用链与最小修法

### 1. 当前关闭链在哪里丢资源

生产 Home 链：`MolisWorkLocalHost.close()` → `HomePluginHost.close/release()` → `PluginRuntime.stop()` → `HomePluginExecutor.stop()` → plugin `definition.stop()` → session dispose → `PluginDatabase.close()`。

- `packages/plugin-runtime/src/index.ts:395–397` 已同步撤动作授权，这是应保留的起点；但 `stopOnce:453–488` 在 executor.stop 前删除 live context/contribution，失败记 crashed。下一次 stop 只接 running / disabled，不能重新定位那次失败的 cleanup。只在 executor map 留 session 不够。
- `apps/local-host/src/home-plugin-executor.ts:103–107` 在 finally 无条件 dispose 并 delete session；`61–67` 又会在每次 dispose 重做全部资源释放。plugin.stop 报错也可能把仍被异步工作使用的数据库关掉。
- `apps/local-host/src/home-plugins.ts:75–96` 的 closed 让第二次 close 直接返回；release 的 finally 无论失败都注销 project owners、关 Runtime repository DB、丢 platform。因此上层重试入口、安装记录、删除 owner 都可能丢。
- `apps/local-host/src/project-host.ts:397–409` 缓存主 closing Promise；只有 Alchemist 单独传给 settleHostClose 的清理每次重进。Home Runtime 不能仅改内层而仍被公共 Host 的已拒 Promise挡住。
- `apps/local-host/src/plugin-database.ts:57` 先置 closed，再 try reader / finally writer；任一个真实 close 失败，下次不再尝试。需要分别记成功释放，不把“已撤销读写”当成“两连接已关”。
- `packages/plugin-runtime/src/background-service.ts:48–61` 中 raw `pending` 与 `lifetime.wait(pending)` 是两条时间线。result 可以先拒，finally 会移除 controller，close 又直接 active.clear；均不能证明 raw work 已退出。
- 前台 action wrapper `packages/plugin-runtime/src/action-provider.ts:25` 只建立 scope，没有追踪原始 handler Promise。仅等 PluginBackgroundClient 会漏掉 conversation 这类前台模型等待。

同类 Project executor 的 finally 在 `plugin-executor.ts:100–111`，项目 manager 又在 `project-plugins.ts:62–70` stop 前删 entry。**本片不把全项目关闭改造成另一个大任务**：共享 Runtime 的 stop 修正适用于它，但 Project manager 的完整重试与项目库关闭链单列为后继切换条件；本片“公共 Host 重试完成”的验收明确只针对 Home Runtime 资源，不宣称任意项目插件关闭失败都已修好。若实现不得不改 Project 路径才能保持共享 Runtime 既有契约，先把具体调用点补进同一 spec，再实施，不暗增范围。

### 2. 建议实现边界

1. Runtime 沿现每安装串行操作保存一份**已撤权、待清理的进程内记录**，包含原 definition/context 和清理进度；不存授权、不新建持久状态表、不复活 provider。stop 失败保留它，后续 stop 或 Host.close 重试同一记录。只有存在该 pending 记录时才允许 crashed 状态继续 cleanup；普通 crashed 安装仍沿原规则。start/recover/restart/upgrade/uninstall 不得跨过未结束 cleanup 开第二个实例；最小行为是明确拒绝或先完成同一 cleanup，不暗自补跑业务。
2. 在 Runtime 已有 provider wrapper 追踪**原始 handler Promise**，在当前 activation 被撤销后阻止新的登记。用本实例集合和 Promise.allSettled 即可，不建调度器。SSE/HTTP 等待结束不等于 handler 结束；正常业务拒绝是一次已退出工作，不当成资源释放失败。跟踪不能把 stop 的调用者自己纳入待等工作而形成自等。
3. 背景服务保留 raw pending 集合直到其 finally；对用户的 handle.result 仍按原语义尽快取消。Host 内部取得 revoke/drain 两阶段；可以扩它的工厂返回值，不给插件公开通用 close/open 权力。`close()` 发取消后不能 clear 掉真实退出证据。
4. Home executor 同步 revoke、调用 plugin.stop 使插件有机会停止自己的 timer/网络，然后等待 stop hook 与前台/后台真实退出；不可先等永不退出的工作再调用负责终止它的 stop。Host-owned DB/files/UI 的 release 在真实退出后执行。stop hook 失败时保留 session；已成功步骤不重做，失败步骤下次再试。只释放属于这次 session 的资源，撤权状态不回退。
5. PluginDatabase 的 close 分开 rejected/readClosed/writeClosed 状态；首次立即禁止 client 调用，分别尝试尚未关闭连接并汇总失败；第二次只补失败连接。对外仍 `close():void`，不改 SQL API。
6. HomePluginHost 保留 platform/repository DB 与 project owner，直到所有待清理安装退出；close 中失败仍保持不接纳。不能只遍历 state===running，漏掉有 pending cleanup 的 crashed 安装。成功后才注销 owner/关 repository/清引用。公共 MolisWorkLocalHost 的重试必须再进入这个未完成 Home 步骤，不能重跑已完成的 agents/sessions/其它资源。
7. Home 的 project-data hook 在该安装 cleanup 尚未完成时必须等待/拒绝，不得见 contribution 已撤就直接 purge。当前 `plugin-project-cleanup.ts:31–41` 只读 contribution 再直接 purge，是实际接缝；用上述 Runtime pending cleanup 的内部查询/等待复用同一个 Promise。没有活动/待清理实例时保持原离线 purge。这里不新增分区 manager，也不声称实现了“删除一个项目时只 drain 该项目”的未来分区行为。

现有 Alchemist 自有 actionsInFlight/worker/search 保留，不能为了复用而把它们先删掉。下一片尚未切换它们，恰好避免两个阶段同时改变存储和执行身份。

### 3. 允许文件与依赖顺序

允许源码：`packages/plugin-runtime/src/index.ts`（必要时拆现职责的短 helper）、`action-provider.ts`、`background-service.ts`；`apps/local-host/src/home-plugin-executor.ts`、`home-plugins.ts`、`plugin-background-service.ts`、`plugin-database.ts`、`plugin-project-cleanup.ts`、`project-host.ts`。Project executor 仅因工厂返回/类型改动做必要适配，不扩大到其整条 manager 重试。公开工厂返回若变化，按实际更新 API 快照；不预设必须改 contracts。

配套：现 `tests/security-invariants-plugin-background.test.ts`、`home-plugin-platform.test.ts`、`home-plugin-project-cleanup.test.ts`、`plugin-project-database.test.ts`、`plugin-runtime-integration.test.ts` 及相应 fixture；对应 README、技能/开发手册的真实生命周期说明、安全表、唯一 spec 由 root 串行更新。若新建测试文件，走包公开入口，不能新增长深导入或 source/dist 混用。

顺序：主会话在原 spec 接受 ALC-RT-CLOSE → 原始 Promise跟踪与 pending cleanup → Home executor 和 Database 释放 → HomePluginHost/公共 Host/项目清理 owner 保留 → 定向验证 → 实际 diff 与共享门禁核对。独立的 SQL / owner-file / D1 分支不在这片合写。禁止通过 baseline 或门禁例外放大已有巨大单元。

### 4. 验收与验证指引

- **ALC-RT-CLOSE-01**：正式 Home Runtime 前台 action 与 background work 分别卡在 deferred 模型/网络；stop/Host.close 立即拒新动作与效果，handle.result 可先拒；在 raw work 释放前 close 未完成，DB 未关闭，目录未 purge。释放后迟到成功/失败零业务写，最终 close 完成。测试读取持久化结果，不只看 Promise reject。
- **ALC-RT-CLOSE-02**：plugin.stop 真失败一次，第一次 close 失败但 provider仍不可用、session/platform/owner保留；第二次公共 Host.close 能到同一 cleanup，成功后幂等。不能用第二次其实只调用已成功 close 的 wrapper证明重试。
- **ALC-RT-CLOSE-03**：reader.close、writer.close 分别注入一次实际释放失败；失败连接仍可定位，成功连接不再被重复关闭；客户端从第一次 close 起永久拒绝，重试后全部释放。保留 SQL 拒绝/异步 tx/逃逸 tx 既有断言。
- **ALC-RT-CLOSE-04**：stop 失败时并发 start/recover/restart/upgrade/uninstall 不开第二实例；清理完成后原允许操作正常。原 installation_generation、provider身份、正常停用与 preserve_enabled语义保持。
- **ALC-RT-CLOSE-05**：Home关闭/项目删除交错与 cleanup失败交错不提前 purge；成功后才清对应 owner，另一 Home插件仍可正常读写。生命周期失败不得触发旧业务任务重放。
- **ALC-RT-CLOSE-06**：真实 HTTP/MCP 正常返回继续保留原后台授权；撤销原来源、新grant不能救活、终止后零写保持。原 `tests/security-invariants-plugin-background.test.ts:65–67` 在 release 前 await stop/close，适用新 drain 合同时要改为先取得 stopping Promise、断言未完成、再 release 并 await；保留提前取消与零写断言，不能把测试改成不观察真实工作。
- **ALC-RT-CLOSE-07**：ALC-LIFE / RES 当前生产链定向回归，原项目路径/v1、重启零自动消费、当前caller明确继续、原预算和重复收费提示保持。此项证明前置没破坏现 Alchemist，不冒充新 Runtime 接线通过。

实施者先按机器槽排一次整体 `pnpm build`，再 `node scripts/run-tests.mjs --jobs 2 tests/security-invariants-plugin-background.test.ts tests/home-plugin-platform.test.ts tests/home-plugin-project-cleanup.test.ts tests/plugin-project-database.test.ts tests/plugin-runtime-integration.test.ts tests/security-invariants-alchemist-lifecycle.test.ts tests/alchemist-resumption.test.ts tests/security-invariants-alchemist-resumption.test.ts`。然后按实际改动包 README 补必跑（不是本稿已运行的证据）；API 检查用已核实的 `node scripts/gates/api-snapshot.mjs`；另跑 `pnpm boundary:check` 与 `node scripts/check-health-gates.mjs --base origin/main`，不改门禁或提高基线。共享Runtime/local-host属于共享核心，全量由主会话在最终集成上统一安排，子代理不跑全量。本稿没有运行任何命令级验证。

## 分库 / Runtime 真正切换前必须处理的后继条件（仅定位，不在下一片扩建）

**分区合同的最小形状。** 保持 PluginDatabase SQL客户端不变；可信Host声明要表达“固定store下按可信project分区，固定叶文件 studio.sqlite，插件拥有这一子库baseline”。Home registry的alchemist根仍覆盖Host搜索库和search-content，不能把整个目录改给插件。应在现registry表达这个固定子库的owner与v1，再验证同一份trusted entry；不是Manifest或请求传path。旧稿仅 `partition:{by:"project",file_name:"studio.sqlite"}` 而没有解决root owner/非library校验，尚不完整。project_id从 `currentPluginAction` 的当前安装作用域获取，缺项目、其他安装、过期作用域拒绝；transaction在await前固定分区，await后复核同一安装/项目及authority，不能在await后选成另一个项目。Home start只构造惰性服务，不遍历项目或seed。

**为什么不先做 Native→PluginDatabase 的中间存储层。** 当前Native resolve得到caller，但共享Studio只通过 `.actionsFor(actor_id)` 绑定身份（`alchemist-service-host.ts:44`），插件的invoker再传control（`action-operations.ts:234–236`）。现PluginDatabase authorize本身只接安装permission回调，不知道Native当次query/command或worker。先制造Alchemist专属执行scope再迁Runtime会增加一层临时授权协议；单纯把现driver搬到Host更是原borrowedSql问题。后继真正迁库应与Runtime作用域和所有提交边界一起切换，最终只有一套实现、同一文件只由一个工作室打开。

**存储事务边界。** `local-runtime.ts:86–115,239–243,279–286` 仍开better-sqlite3并向全部repositories/jobs/WorkReuse注入driver。全部读改reader.get/all；写必须外层 `database.transaction(beforeEffect, tx => …)`，同一个tx显式传给下层，不给每个SQL套独立await，也不把模型等待放进事务。至少逐一处理：initializeWorkspace（290–303）、createExploration/run+job+event、start/cancel Lens、Pulse run+job、worker claim/renew/checkpoint/结果/terminal、workReuse receipt+playbook应用。`sqlite-job-runner.ts:84–88,103–113,135–150,153–169,216–229` 的租约检查和业务写必须仍在同一同步事务；最终effect同步检查也要位于提交内，不只在await前。`readEvents:208–213` 可改一次jobs LEFT JOIN events查询保持原快照，无事件/高cursor/未知job语义保持，不因此新增公共readTransaction。原baseline v1不变；`applySqliteBaseline` 仅核user_version（`packages/storage/src/sqlite-baseline.ts:32–37`），不能声称它验证了同版全部schema；迁移测试需另比现fixture的schema与业务行，拒错版本，不补读时兼容。

**身份与后台。** 原 job input.author/actorId 是历史事实（`sqlite-job-runner.ts:97–98`），执行身份目前是本次acceptance.actorId（`local-runtime.ts:156–160`，`job-resumption.ts:78–90`）。两者不能混淆，也不能用start context固定host.actor_id代替当前MCP/Agent用户。目标Runtime可复用 `currentPluginAction()` 和 background-service 的 `runInPluginAction`（48–51）保留当前项目/actor，无需持久授权；但background.start目前固定无参retain（31），而Alchemist继续按job类别额外保留generate/collect（`job-resumption.ts:117–120`）。迁移时必须把既有附加权限能力沿真实background路径保留，不能退回只查read/write。无需重新设计恢复政策。

**搜索与drain。** `alchemist-search.ts:18–39,74–86` 是Host-owned SEL/search.sqlite/content组合，独立于Studio schema；每次调用AsyncLocalStorage里的beforeDispatch/assertCurrent必须保留到DNS/TLS、opaque/secret/content最终效果。不能把搜索数据放进Studio库或由插件自己打开。分区关闭顺序仍是拒接纳→撤权/取消→等前台/worker/search真实Promise→关对应连接→ProjectDeletionService purge；项目B不应被删除A一并停止。仅登记partition或等DB事务数量不能证明这一点。目标Home Runtime还需要受信任项目清理能等这些项目资源，现同步onProjectDeleted（`plugin-project-cleanup.ts:38–41`）不足以代替真实drain。

**WorkReuse / D1。** 当前 `WorkReuseHostPort` 明确需要 callerFor、listArtifacts、readArtifact、publishReport、linkConsumption（`src/work-reuse/contracts.ts:43–53`）；A的生产Host未传workReuse（`alchemist-service-host.ts:73–74`），全树linkConsumption实现只在包内fixture，不能把现测试接收端记为生产接线。`service.ts:141–160` 会拒绝snapshot.actorId与当前调用者不符，固定版本和当前可读性检查须保留；外部link与本地receipt更新分别在213与215–216，本地仍需当前lease事务，不能假设两owner一个SQL事务。D1项目成果owner operations只是必要依赖的一部分：接手必须核它最终公开合同是否覆盖list/read/publish，以及Context Ledger边的实际owner操作；不能把D1当成已有linkConsumption，也不能为接Home Alchemist授一个永久caller。C OwnerFiles不是这个缺口的解决方案。下一片ALC-RT-CLOSE不等待、不实现这些接线。

## 交付范围与未验证项

本文只写这份设计稿，没有改A/spec/源码/测试/被测树，也没有碰真实Home、Keychain、Claude、外部PR或其它chat。结论是源码审阅与方案判断；ALC-LIFE/RES“已经验证”沿用主会话现有证据，本稿没有重新运行它们。D1/C的完成度来自主会话任务边界，未把别树未整合实现当A现有能力。

接手人从最终main核对上述问题是否已经被其它PR修好；若Runtime cleanup已有完整有效证据，直接跳过本前置，再在唯一spec定稿分区+Runtime完整切换。不要重新执行已完成的ALC-LIFE/RES，不重问恢复/预算，不先创建临时Store，也不在handoff阶段启动下一片实现。
