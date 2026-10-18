# Home Runtime 项目清理最小接缝

状态：2026-10-18，独立只读设计；未实现、未运行测试。负责人：runtime_project_cleanup_plan 子任务；主会话裁决与集成。证据基点为 `e8925f8ea`，工作树合并中的文件不作为最终实现证据。范围仅 Images 迁移所需的同步项目取消，不增加通用任务或删除服务。

## 结论

复用 `ProjectDeletedHooks.register` 的既有覆盖栈、`ProjectDataDeclaration.purge`、`PluginRuntime.contribution(installId)`。HomePluginHost 为可信目录中有 project_data 的 Home 插件注册一个通用 owner wrapper；每次 clear 取得当前已发布 contribution，先同步调用实例的内存取消回调，紧接着调用原离线 purge。实例未运行时直接执行同一 purge。无需 executor 为每次实例注册/注销另一个 owner，也无需后台轮询发现项目消失。

Images 在回调里同步取消该项目所有 active 与尚在受理中的工作，取消信号在 purge 前已触发。stop 只清内存、取消和释放资源；恢复 running→interrupted 留到新实例 start，完成后才返回 contribution、受理动作。现有 trusted database/files 授权端口足够，不需要新的恢复服务或伪造 action/user 身份。

## 代码证据

- `apps/local-host/src/project-deleted-hooks.ts`：register 相同 id 覆盖原 owner，dispose 恢复原 owner；clear 等待 owner.clear；clearAll 给 rebuild 共用，按 priority 再注册位置排序。
- `apps/local-host/src/project-deleted-owners.ts`：目录的 project_plugin_id 是 receipt owner id；ProjectDataDeclaration.order 仅用于初始目录排序，生成的 owner **没有 priority**（默认 0）。Images order=90、owner id=`images`、label 为「图片生成记录和已生成的图片」。不能把 order=90 直接变成 live owner.priority=90，会改变它相对于其他默认 priority owner 的顺序。
- `apps/local-host/src/images-service-host.ts`：原 live owner id=images；clear 调 ImagesService.deleteProject。
- `plugins/native/images/src/service.ts:168`：同步 abort 该项目 controller，随即同步删 jobs 与引用文件；不等厂商 Promise，也不等 200ms。
- `plugins/native/images/src/store.ts:267`：purgeImagesProject 本身是同步函数，通过 store owner 的现行 clearInExistingHomeSqlite 删除；没库不建库。因此 wrapper 可以保持取消→purge 同一个 JS 同步段。
- `apps/local-host/src/project-host.ts:211`：现行 Home entry 投影只带 runtime 与 manifest，遗漏了外层 project_plugin_id/project_data，是需要补的真实接线点。
- `packages/plugin-runtime/src/index.ts`：contribution 只在 start/redeem 成功后发布；stopOnce 在调用 executor.stop 前删除 contribution；uninstall/upgrade 也沿现行生命周期处理。HomePluginExecutor.stop 先 revoke/background.close，再 await definition.stop，不能在那里写 interrupted。
- **已发现边界**：Runtime.startOnce 的 redeem 失败 catch 撤销上下文、删 contribution，但没有 executor.stop。若新方案在 executor.start 内注册项目 owner，会新增漏注销路径；本方案用 HomeHost 固定 wrapper 与已发布 contribution 查找，避开这条新增泄漏。原有 executor 资源清理问题属于现存问题，不能据此宣称所有启动失败资源都已清理。

## 最小合同与可信目录

公共 `PluginAppContribution` 只增加一个可选回调（建议名）：

```ts
/** Host-only lifecycle delivery: cancel project-local work synchronously.
 * No persistence, model call, actor identity or action authority is granted.
 * May be called repeatedly; old work must stay cancelled across fixed-id rebuild.
 */
onProjectDeleted?(projectId: string): void;
```

不用 PluginHostServices 新增 projectCleanup，不增加 Manifest action、事件、permission、project owner 参数或新的 ProjectDataDeclaration 方法。回调只做本实例内存任务取消，不能用它在撤权后写库/文件。Host 用 requireSynchronous 检查实际返回值；TS 的 void 不能阻止 async function 被赋值，运行时检查必须保留。

Host 内部 HomePluginEntry 补一个可信投影（无需新增公开服务类型）：

```ts
readonly project_data?: {
  readonly owner_id: string;
  readonly declaration: ProjectDataDeclaration;
};
```

由唯一目录生成：`{owner_id: entry.project_plugin_id, declaration: entry.project_data}`。不在 runtime 子对象重复写 images id/label/order/purge，不从 Manifest 或插件 contribution 读取 owner id。wrapper 使用该 declaration 的原 label/purge，order 保持既有离线 owner 的排序，不设置新 priority/survivesRebuild。相同 id 的 stack 已保留原注册位置。HomeHost 启动前检查目录投影 owner_id 唯一，不能拿另一插件的 owner 名覆盖；无声明的 contribution 回调拒绝受理。

为防升级同 plugin_id 的非可信 definition 继承这项能力：把投影按 definition 对象记入现有 pluginEntryIdentity WeakMap，冻结 owner_id 与 declaration 的浅副本（保留函数引用）；Home executor 检查 contribution 有回调时该 definition 必须带可信投影。releaseArtifact 重建沿现有 files 模式将同一冻结声明传给 identity.remember。不能仅凭 manifest.plugin_id 字符串判可信，也不能读取后续被修改的原 entry 对象。项目 executor/sandbox 不提供这项 lifecycle 投递；不为它扩展项目级服务。

## HomeHost 接线与生命周期

注册放在 HomePluginHost 创建 runtime 后、supervisor.start 前；只注册有上述可信声明的目录条目。每条捕获一个既定 plugin_id、owner id、declaration 与本 Home 的 runtime，不捕获某一代 contribution。形状如下（伪代码，具体错误码沿 host 的 defineErrorCodes）：

```ts
hooks.register({
  id: owner.owner_id,
  label: owner.declaration.label,
  clear(projectId) {
    const record = runtime.list().find(row =>
      row.plugin_id === pluginId && row.state !== "uninstalled");
    const contribution = record && runtime.contribution(record.install_id);
    if (contribution?.kind === "app" && contribution.onProjectDeleted) {
      requireSynchronous(contribution.onProjectDeleted(projectId),
        "项目清理前必须同步停止后台工作");
    }
    return owner.declaration.purge(home, projectId);
  },
});
```

关键：clear **不要写成 `await callback(); await purge()`**。即使 callback 同步，await 也让出微任务，允许旧后台继续或新请求插入。实际 purge 仍允许原合同 Promise 返回；Images 的 purge 是同步的，本片不把所有插件 purge 强制同步。

注册 disposers 保存在 HomeHost，release 在已停止/撤销全部实例之后注销，然后关闭 Home Runtime DB。start 失败也经过同一 release。不要用 `alive: () => !this.closed`：HomeHost.close 最先设 closed，再等 opening，过早让 wrapper 消失可能在后台尚未取消时暴露 offline purge。wrapper 的活期以注册/dispose 为准，clear 从当前 runtime 取实例；dispose 前不关 repository。

- 正常 running：callback cancel，再 purge；purge 抛错仍保留 receipt pending，重试再次 cancel/purge，原任务不能恢复。
- disabled/uninstalled：无 contribution，原 purge 继续工作，且不因插件 grants 被撤销拒绝删除用户已要求删除的项目数据。
- upgrade：旧 contribution 被撤回前可能接收 cancel；撤回后走 purge；新实例完成恢复、成功发布后下次 clear 找新 callback。不存在捕获旧 closure 误清新实例的问题。
- Host close：保留 wrapper 到实例均已停止；然后 dispose 恢复既有 offline owner 栈。
- callback 抛错/返回 Promise：拒绝该 owner 的清理、receipt pending；不继续 purge 假装成功。不新增超时调度、轮询或后台 retry 服务。

## Images 受理与固定 id rebuild

仅取消已拿到 handle 的 active Map 不够。`background.start` 先 await caller.beforeEffect，期间项目删除可能发生；如果受理意图尚未登记在 Images 内存，callback 会漏它，它可能在 purge 后重新插入 running。

最小实现：在 jobs.start 的第一个 await 前创建并登记本次 projectId 对应的 AbortController；把其 signal 传给 background.start。句柄尚未返回时也在同一待受理集合内，项目 callback 同步 abort 这些 controller。拿到 handle 后继续保留同一 controller 到工作结束；删除、stop 都取消它。后台回调与插入事务/文件提交都检查同一不可逆 signal 和自己的 job 行，不再以“project id 仍存在”作为旧工作的存活依据。拒绝的受理不得插入 running；插入失败或幂等命中已有任务时取消新 handle，零派出。

不用永久 project tombstone：同 id rebuild 后，新的独立动作可以新建任务；旧控制器保持 aborted，旧 job id 随 purge 消失，复用 projectId/request_id 也不会唤醒旧 work。Images 同步 purge 在 callback 后无 await；项目 callback 只影响目标 project，其他项目不中断。既有 clearAll/rebuild 并没有全局封锁重建过程中的所有新动作，本片保证旧代工作不得复活，不凭空承诺整个重建期间无新请求。如要禁止整个 rebuild 窗口的新请求，需要单独改变项目删除/重建合同，非本片最小范围。

不配合 abort 的厂商 Promise 不影响本地取消：沿 background/createExecutionLifetime.wait 结束本地等待。厂商迟到成功/失败必须在文件创建和 DB 业务写之前被原 signal/control 拒绝，不能捕获取消后写一条 failed。

## 启动恢复与文件边界

新实例 definition.start 内先 await 数据库 transaction，将遗留 running 改 interrupted，不重发请求；beforeEffect 使用当前 context.requireGrant 与自身 starting 状态检查，不构造 ActionExecutionContext 的 actor/caller。DB 端口已经在 await 前后检查安装世代、active、storage:private 与写 grant。

文件孤儿清理使用现行 files.remove 接受的最小 PluginExecutionControl：beforeEffect 检查 starting 与当前 requireGrant，assert_authority_current 同步做同样检查。它不是 action 身份，不能拿去 services.actions/model/background；那些服务仍要求真实 action scope。start 恢复完成后立刻关闭这个本地恢复阶段标志，再返回 contribution，旧恢复控制不可用于正常运行。读全 Home 所有项目 jobs 的引用集合再清孤儿，不能按某一项目清其他项目资产；恢复期间尚未受理新 job，所以不会误删本实例正在生成的文件。stop 时这个控制也受 executor active 检查拒绝，绝不撤权后补写 interrupted。

明确限制：迁移后的异步 files.create 可能已写出一张图片而 job 最终事务尚未保存；原 purge 只知道 images_json 中的文件，不知道未引用文件。这个接缝保证同步停止与零晚到写入，不自动保证 receipt 时所有这类未引用文件都已回收。沿已定启动恢复清孤儿可处理它。若主会话要求 receipt 同时清除这类新增中间文件，需要额外 owner 级文件清理设计，不能偷偷在 callback 用已撤权 action control 删除，也不能把“下次启动清理”写成“本次 receipt 已清完”。

## 验收与真实拒绝测试

在已有 Home Runtime fixture + 临时 Home 和 ProjectDeletionService/ProjectDeletedHooks 实路径上测试；Images 实接用生产 store/files/background，不以 Map fixture 或 callback 次数证明数据正确。不运行真实 Home/钥匙串。

- RPC-01 同步序列：用悬挂的 provider，调用正式删除；在 purge 入口断言该项目 provider signal 已 aborted；receipt 返回前必为 true，无 200ms 等待。迟到 resolve 与 reject 分别验证零新文件、零 failed/finished rows，其他项目任务正常。
- RPC-02 受理交错：把真实 action beforeEffect 卡住，发起 jobs.start；删项目/固定 id rebuild 后再放开，必须拒绝且零 running 插入、零厂商派出。随后新动作同 projectId/request_id 可受理，旧 promise 迟到不能改新记录。
- RPC-03 文件交错：卡在 files.create 的 beforeEffect，删除后放开，真实文件 API 拒绝且不新增文件；覆盖已经有第一张文件时的约定孤儿恢复行为，不把第二次文件拒绝当作全部已清理。
- RPC-04 stop/delete 两种交错：stop 的 cleanup 人为等待时执行删除，以及先 delete 再 stop；无关闭 DB 访问错误、目标数据删除、旧 late result 不写，stop 本身没有 interrupted 写入。
- RPC-05 lifecycle：未启动、disabled、uninstalled 时删除仍调用原 purge；upgrade 中旧停止/新未发布时亦可清；新发布后只取消新实例，旧 callback 不再被投递；Home.close 后离线 owner 恢复且 label/id/顺序不变。
- RPC-06 真实拒绝：无可信声明但返回 callback 的 Home 插件启动拒绝；伪造 Manifest owner/project_data 不取得投递；async callback 被 requireSynchronous 拒绝、purge 不执行、receipt pending；callback 抛错后重试可恢复，不重启旧任务。
- RPC-07 恢复：用上一实例留下 running 与孤儿、多项目有效文件；新 start 完成前不可受理；恢复只写 interrupted，零 provider 请求，保留其他项目引用文件。恢复中撤 grant/stop，DB 或 files 操作真实拒绝；新实例不发布半恢复 contribution。
- RPC-08 owner snapshot：删除 receipt 只有现行 images step、现行 label 与相对顺序，无新增第二 step；修改原 entry 对象后不能改变 owner/purge 身份；升级 artifact 恢复保留冻结声明。

建议沿 `tests/project-deletion-owners.test.ts`、`tests/project-deletion-declarations.test.ts` 和 Home Runtime 生命周期现有用例补接线，再在 Images Runtime 实接用例补 RPC-01/02/03/07。本报告未运行这些测试。合同改动需要主会话同步 spec 验收编号/API snapshot；共享构建、全量及真实体验验证由主会话排程。
