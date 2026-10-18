# Alchemist lifecycle 独立复核

结论：对 `cf1dc0ac0..f26f8216e` 的 14 文件候选差异，未发现有充分源码证据的 Blocker/P1 或必须先改生产代码的问题。此结论是只读调用链审查，不是运行验收通过。未修改工作树、未构建、未跑测试/Chrome；主会话提供的 build 仍在执行，本文不引用其完成结果。范围只含唯一 spec 顶部 ALC-LIFE-01～08，不把后续“重启需继续按钮”语义算入本片。

## 重点结论：transport 关闭顺序

`apps/local-host/src/search-evidence-runtime.ts:67` 的 pending 集合按 intelligenceCollect、queryRuntime、transport、source 顺序调用 shutdown，每项调用开始后才 await。当前 SEL 0.4.1 的真实实现显示：

- `search-intelligence-client.ts` 在返回 closing Promise 前，先同步设置 shutDown 并 stop.abort。
- SEL `dist/core/search-runtime.js:32` 的 shutdown 在返回 Promise 前，先设置 isShutdown，再对已登记 operation 同步 cancel；之后才 await operation.result，最后调用 bridge.shutdown。
- 因而新代码调用 transport.shutdown 时，query 的原权威 operation 信号已经取消。它确实比原先“operation terminal 后由 bridge 关闭 transport”更早释放网络资源，但不是在一个仍被允许成功提交的 query 上突然撤走 transport。
- 生产 `anysearch-transport.ts:43` 的 shutdown 自身 abort，并等待 active 请求和 socket close；composition 的 allSettled 仍等待该 Promise。移除 SEL bridge 中的 transport.shutdown 不会让 composition 提前向搜索库 owner报告完成。execute仍绑定原transport调用，不换目标或凭据。
- Alchemist外层先等Studio前台/worker，再关search；`alchemist-search.ts` 另等原search Promise（包括content.read），随后才关组合与SQLite。共享Feed路径没有这个外层，但同样由collect同步取消+组合allSettled守住收尾。

因此没有根据将此时序调整判为P1。需要保留已存在的“在途transport忽略abort直至release”用例；它是本改动最相关的运行证据，不能只跑新空闲shutdown失败用例。

## 其他调用链

1. `actor-actions.ts::actionsInFlight` 保存的是由原invoker Promise同化的work，不是Kernel可提前因取消而结束的外层invoke；track调用在首次await前加入集合。revoke同步abort，此后新调用在入集合前拒绝，故whenIdle快照没有接纳窗口。`local-runtime.ts` 的actions、actionsFor和createApp三条入口都经同一tracker；传下原caller控制与合并signal，不重建actor/权限。
2. `studio-lifecycle.ts` 在等待之前同步closed、清interval、撤销前台并stop worker，allSettled等原前台和worker，再close DB。业务拒绝不被当作资源close失败；DB.close拒绝清closing以重试，但closed保持，动作不可复活。旧runPending恢复逻辑未变，本片没有提前落实新的恢复产品语义。
3. `alchemist-service-host.ts` 在evict开始即draining；own entry也先过draining检查。runtimeClosed只在实际成功后标记；search失败时保留entry/owners，不能新建第二Studio。最后成功才从全部owner与全局表移除。live删除hook在closed但entries仍存在时继续有效；ProjectDeletedHooks使用stack，另一个owner退出不会把仍在的owner静态清理替换掉。
4. `close()` 的非最后owner只放弃自己的entry；最后owner/项目删除共用evict。idle失败有catch记录，真实Studio关库失败后idle为false，不会每tick反复关闭；保留资源供显式重试。
5. `project-host.ts::settleHostClose` 每次重新调用Alchemist.close，其他Host teardown仍复用原closing Promise；allSettled等两边。它只为Alchemist提供独立重试，不声称修复其他Host资源自身失败后的重试。该范围与spec一致。

## 验证缺口与运行时应确认的项

以下不是已证实的生产缺陷，也不是要求新增泛化矩阵；主会话在记录完成证据时应区分：

- **必跑仍待结果**：四个指定文件及Host/search README相关集合。当前新增源码测试尚不代表通过，尤其正式Host conversation/plan/settings的close与late-failure、公共Host DB.close一次失败、ProjectDeletionService同receipt重试、共享search在途取消。
- **三入口覆盖强弱不同**：新增关闭交错主要通过正式Host→actionsFor证明；`actions.invoke`只直接断言关闭后拒绝，HTTP app现有用例主要覆盖正常调用及worker等待。没有独立的“正在直接actions/HTTP前台metadata调用时close”回归。源码三个入口确实统一track，但若要称三入口均经实测，应补同一小deferred场景而非把worker HTTP用例当作前台HTTP证据。
- **搜索retry的已测范围**：新LIFE-08实际composition用test transport.shutdown一次拒绝，实际Alchemist search port用LocalSqliteStorage.close一次拒绝。测试未把搜索关闭失败放入完整ProjectDeletionService链，也未覆盖已有source.runtime拒绝。这不影响Studio DB失败链的现有测试，但不要写“全部搜索子资源失败已实测”。
- **SEL底层限制**：SEL storage/search-keyring.js 的foundation.shutdown同样永久缓存第一次Promise；外层保留ready只能保留真实句柄，不能把底层不可重试变成可重试。当前foundation正常收尾只有activeRotation排空（拒绝被吞以继续drain）、SearchAccessGate.closeAll的permit排空、reservation.release；closeAll没有普通可失败IO，所以本轮未找到可复现的真实foundation失败leaf，不据此报P1。source SearchRuntime也缓存关闭Promise。若将来真实SDK失败出现，不应以外层mock第二次成功作为底层已释放证据；按spec重新诊断上游。transport是本片已成功移出该缓存的真实可失败leaf。
- **测试证据精度**：新idle失败测试的wrapStudio在原close前抛一次，证明Host保留entry并观察失败；真实数据库关闭失败由Host lifecycle另一测试覆盖。两者不要合并叙述成idle场景已实测DB.close失败。多owner测试直接构造共享Studio owner（不是第二个真实Home进程），符合当前“一个Home一个模型进程”限制。

评审建议：保持当前生产候选，先等已排定运行验证；若相关用例通过，可按其实际覆盖记录ALC-LIFE前置完成。任何真实失败再定位，不为上述尚未发生的SDK失败扩建关闭平台。
