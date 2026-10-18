# Runtime project cleanup：可直接实现的最小测试设计

状态：2026-10-18，只读设计；未改生产/tests，未运行构建或测试。依据 `wt-model-selection` 现有公开接口。新增字段按主会话最终命名替换，以下使用设计名 `project_data: {owner_id, declaration}` / `onProjectDeleted`。

## 文件与可复用接口

新增一个 `tests/home-plugin-project-cleanup.test.ts`，只测共享 HomeHost→Runtime contribution→ProjectDeletedHooks 接线。不要扩写 Images job/provider/files 测试，也不要给生产新增 test-only export。

全部生产 import 使用包名：

```ts
import { HomePluginHost, projectDeletedHooksFor, type HomePluginEntry }
  from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG }
  from "@molis-ai/molis-work-app-workbench";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID }
  from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginAppContribution, PluginDefinition }
  from "@molis-ai/molis-work-contracts/platform/plugin";
import { deferred, homeProbe } from "./fixtures/home-runtime.js";
```

核对位置：local-host `index.ts:17,65–66` 已公开 HomePluginHost/HomePluginEntry、ProjectDeletionService、ProjectDeletedHooks/projectDeletedHooksFor。ActionService（kernel）同时实现 ActionClient 和 ActionRegistryPort，因此同一个对象可给 constructor.registry/client。`tests/home-plugin-platform.test.ts` 已用 public runtime.stop、supervisor.restart、runtime.upgrade；`tests/home-plugin-private-store.test.ts` 已证明 close→另开实例及失败升级恢复路径；`tests/project-deletion-declarations.test.ts` 已用公开 catalog 注入/恢复条目；`tests/project-deletion-owners.test.ts` 已证明 hooks.clear 经 owner 到实际 purge。因此本片不需再造 HTTP/catalog/SQLite fixture。

## 最小环境（一个测试一个临时 Home）

用 mkdtemp 创建存在的 home（openPluginFiles 如涉及会 realpath）。`const actions = new ActionService()`；`new HomePluginHost({home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries, fixtures})`。finally 严格先 `await host.close()`，再撤销本测试底层 owner，最后 rm 临时 Home。即使断言失败也释放停用 barrier，防清理卡死。测试串行，不改真实 Home，不触发模型或密钥。

正向可信 entry 建议复用 catalog 中现有 `project_plugin_id === "issues"` 的真实 runtime 条目：展开它的 runtime/database/package_name/factory_export 和 manifest，在 `create()` 中调用其真实 create 得 definition，仅包装 definition.start 返回的 app contribution，追加测试 onProjectDeleted；stop 包装使用可控制 deferred barrier。Issues start 只要求 actor_id/database 并构造 IssueStore，不调用模型。它有真实数据库声明、库 owner、公开 factory 和持久发行物元数据。

**不要给 homeProbe 伪造 package_name/factory_export。** HomePluginHost 启动时 `persistReleaseArtifact` 就会调用 esbuild capture，假的包会让测试在无关位置失败。上述真实 Issues 包装仅测同一 Host 内 start/stop/restart；不要据此宣称验证了包发行物 restore（restore 的工厂不是测试包装函数）。

为这个 entry 配本测试唯一 owner_id（如 `cleanup-probe`），label=`测试清理数据`、order=90、purge 为有明确效果的测试函数（删除临时 marker 文件并记录顺序）。在 ready 前经 `hooks.register` 注册同 id 的底层 sentinel owner，clear 记录 `offline` 并删除 marker；保存 `before = hooks.owners().map(({id,label})=>({id,label}))`。live wrapper 应覆盖该 owner，close 后实际恢复其原 clear。不要把 pointer/count 断言当成删除成功：每次 purge 前写 marker，调用后检查文件消失。

如果主会话校验要求 HomeEntry 必须与真实 catalog 映射一致，沿 `project-deletion-declarations.test.ts` 现有模式在测试内追加一个从 Issues 条目复制、project_plugin_id 为 cleanup-probe、project_data 为上述 declaration 的条目，并 finally 精确移除；不要为了测试放松生产校验。不改变 Issues 原条目或公用 manifest，也不增加测试注入 production API。

## 五个有效测试

### RPC-SH-01：没有可信声明时拒绝 callback

使用 `homeProbe("cleanup-undeclared")`，包装其 start 为 `{...await original(context), onProjectDeleted(){ called++ }}`，作为 `fixtures: [probe.definition]` 进入 `HomePluginHost`，`entries: []`，**不给可信 project_data**。可给 definition 对象附加同名伪造字段，但不放进可信 entry，以检查不从定义/Manifest 取授权。

`platform = await host.ready()` 后检查 `platform.supervisor.state(probe.id)?.status === "failed"`、对应 runtime record 不是 running、`runtime.contribution(install_id) === null`。`called === 0`；hooks 不出现伪造 owner；底层 sentinel 仍能清 marker。不要只检查 callback 没被调用：一个仍处 running 的非法 contribution 也可能暂时没收到删除。

现有 supervisor 捕获 activation 错误并记 failed，HomeHost.ready 通常仍 resolve；不要无条件 `assert.rejects(host.ready())`。错误码用最终新增 host/plugin 拒绝码断言（如果 Runtime 包装为 plugin.executor_failed，则同时检查 supervisor.message 或明确最终错误映射，不能写不存在的期望码）。

### RPC-SH-02：同步取消发生在 purge 前，同一个同步段

可信 entry 的 callback 在对应项目 controller 上 `abort()` 并记录 `cancel:<id>`。purge 的第一行断言 signal.aborted=true，记录 `purge:<id>` 并删除 marker。callback 还 `queueMicrotask(()=>trace.push("microtask"))`。

调用 `const pending = hooks.clear(ownerId, "p1")` 后、尚未 await 时立即断言 `trace === ["cancel:p1","purge:p1"]` 且 marker 已消失；await pending 后断言 true。这个断言会稳定抓到错误的 `await callback(); purge()`：只检查 Promise 最终顺序抓不到多出来的让步。另一项目 controller 未 aborted；owners 的 id/label/顺序与 before 相同，只有一个 ownerId，没有二次 receipt owner。

不用实际 background/provider：这里证明的是同步 lifecycle delivery 顺序与真实清理效果；Images writer 负责业务 handle 的 abort 实接。

### RPC-SH-03：async callback 拒绝，purge 绝不执行

用合法 entry，但 callback 为 `async () => { await release.promise; }`（TS void 类型允许这个赋值，因此不需 any/as unknown as）。启动成功后调用 hooks.clear，要求拒绝；在 release 前后都断言 purgeCount=0、marker 仍在。finally release.resolve 以免遗留悬挂 Promise。

这必须测试生产 requireSynchronous，不可 mock 成“检测返回 Promise”；不要把 callback 的拒绝写成普通 throw 来替代 async 返回值。可用最终真实错误码，若沿 requireSynchronous 为普通 Error 则匹配约定 message。该层 hooks.clear 自身不写 receipt，不能据此宣称 receipt pending 已验证；既有 catalog owner失败→pending 用例继续提供那层证据。

### RPC-SH-04：只调用当前 contribution；停用/重启/卸载回落

每次 definition.start 为 contribution 捕获不可变 generation 计数（1/2），onProjectDeleted 记录 `live:<generation>`；不要让所有 callback 都读取同一可变 generation，否则抓不到 stale closure。

1. ready 后 clear→只记 live:1 + purge。
2. `await platform.runtime.stop(installId)`；重新建 marker，clear→只 purge，不再 live:1，真实文件删除。
3. `await platform.supervisor.restart(pluginId)`；assert running；clear→只 live:2 + purge，live:1 次数不变。
4. `await platform.runtime.uninstall(installId, {retain_private_data:true})`；clear→只 purge、无 live callback。

停用期间 owner id/label/order 都保持；卸载不会失去项目数据 purge 能力。此测试已直接覆盖当前 contribution 世代选择，不必为了名义“upgrade”给包装的 Issues 伪造版本/发行物。真实升级回滚元数据测试沿现有 home-plugin-private-store；若还需新 definition 身份拒绝，用相同 plugin_id 的未登记对象执行 runtime.upgrade 并断言拒绝、旧 running 恢复，勿把它当可信升级成功测试。

### RPC-SH-05：并发 stop/close 与 owner 栈恢复

包装真实 definition.stop：entered.resolve(); await release.promise。ready 后发 `stopping = platform.runtime.stop(installId)`，等 entered。此时当前 contribution 已撤回；`await hooks.clear(ownerId,"p1")` 应仅走 declaration.purge，不能调用旧 contribution，也不能访问已关闭 Runtime DB。release 后 await stopping，再 supervisor.restart，验证新 callback 可用。

随后 `const closing = host.close()`；等这代 stop entered。在 close 尚未完成时再次 clear，同样不能运行旧实例 callback；完成 release/await closing 后重新建 marker，clear 应调用最初底层 sentinel 的 `offline`，**不是仅检查 owner id 还存在**。断言 before 与 after 的 id/label/顺序完全相同，且 sentinel 删除成功。

这个测试可抓到 close 只丢引用、忘记 disposer，以及 wrapper 被注销过早/迟到 callback 访问关闭 DB 的部分问题。为了明确 close 在等待 startup 时不提前撤 wrapper，可另用 deferred start 做一个分支，但不是本轮五项的必需追加；现有 stop/close 核心交错先做实。

## 断言/范围提醒

- 只调用 hooks.clear(testOwnerId, ...)；不调用 clearAll，避免无关 memory/search/agent owner 要求常驻服务。
- marker 只写临时 Home；purge 参数同时断言传入的 home 与 projectId 原样正确。
- 类型、生命周期、期望码要按最终实现核对，尤其 ready 返回与 supervisor.failed，不能以测试没抛错代替运行成功。
- 不需要等待 200ms；全部用同步断言或 deferred barrier，超时只作卡死上限。
- 用本任务 spec 的最终验收编号替换/映射 RPC-SH-01…05，在测试名写编号。预计一个新测试文件即可，生产 import 全部走现有公开 exports。
- 执行交给主会话：共享整体 build 完成后 `node scripts/run-tests.mjs tests/home-plugin-project-cleanup.test.ts tests/home-plugin-platform.test.ts tests/home-plugin-private-store.test.ts tests/project-deletion-declarations.test.ts`；owner 本身未改时无需为了本接缝重跑重量级 Sessions 内容库矩阵。本报告没有运行任何命令验证测试。
