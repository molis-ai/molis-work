# T141 source guard 候选窄审

结论：**`source-repair.patch` 的五生产文件方案可用于当前真实 Runtime Feed 动作链，未发现需要另起设计或扩大生产写窗口的 blocker。** 下面三项接线边界须随实现保留；尚无实现或动态通过结论。根核并协调 T144 后才交写权，本线未派发、运行或写共表。

输入：原 WO `coordination/2026-10-28/tasks/T-141.md`、`plans/T141-current/`、作者 `/private/tmp/t141-evidence/{BLOCKER.md,source-repair-design.md,source-repair.patch,source-runtime-3.log}`。源码按原 H `d3502b72bb2b58414503efd5069ba38b1849cf03` 核；作者随后冻结 H `306c600e123dcad960d217a92b5a3633cc482c09`，五生产文件相对原 H 无差分。catalog 及四共享文件的修复、构建和 56/56 不属本审，本线不背签。

## 传播与实际来源绑定

已核链路：Feed `source-actions.ts:92` → `runtime-connector.ts:50` → Runtime `source-pull-connector.ts:74–85` → Host `connector-source-pull.ts:59–65` → registry `bind` → SDK polling / `sandbox-integration.ts:114–129` 的实际 runner。旧实例 `live()` 拒绝后，现实现的 Listener `store/listener.ts:381` 与 Feed `connector-sync.ts:82` 两层 catch 都再问消费调用；该调用和账号仍有效，故写 interrupted / retry_wait / source error。原件严格快照确实显示这些新增事实，不只是错误码猜测。

候选在 Host **调用 `registry.bind` 时就交 `run.retainProvider`**；registry 在首个 `await contributionOf` 前登记检查，因此 bind/recover 抛错时也未丢失持有关系。检查捕获原 `RegisteredIntegration` 对象、原 attached 条目或原 built-in installId；`IntegrationDeclarations.integration()` 返回 map 原对象（`integration-declarations.ts:106–107`），release/redeclare 会产生新对象。attached 的 `contribution()` 内含原 Home exposure token/live，最终再比较贡献对象，故同 plugin_id、同 install_id、相同声明值也不能让旧请求借新实例复活。冲突预检未替换 entry 时，旧 guard 仍有效。

**贡献捕获的准确时点：**补丁的 `contribution` 局部变量在 await 返回才赋值；但现有 `contributionOf` 的 attached 分支在 async 函数返回前同步读取贡献（`integration-registry.ts:170–175`），不是恢复后重找来源。若该 microtask 间升级，返回的旧对象与当前对象不等，`current()` 拒绝；本次签名来源路径成立。不要将它改成 await 后才首次读取 attached 的“最新贡献”。built-in 分支原本允许 crashed → recover 后绑定，须保留该行为；恢复中尚无贡献时不能据此声称已有旧结果。恢复失败且仍无有效实例，guard 拒绝，与“仍有效实例的普通 poll 故障”分开描述。

## 三项必须保留的实现边界

1. **使用原持有机制。** `action-scope.ts:213–253` 的 WeakMap、`heldKey`、逐项追加和两处复核原样复用；仅改为通用命名和接受实际 invocation scope。`source-pull-connector.ts` 的 `retainProvider` 捕获本次 scope，不按 source/plugin/installation 建另一份表，不覆盖同调用先前的 guard，也不在 pull 成功或失败后清除它。`model-service.ts` 只替换 helper 名称，保留模型成功、普通失败和 terminal refusal 的既有处理。guard 不调用消费方 `run.current` / `beforeEffect`，也不要求“当前 ALS 必须等于原 scope”，避免递归及破坏嵌套调用/保留的后台执行。
2. **只持有 provider 检查。** 当前补丁符合：registry guard 不捕获 `withConnectorRequest` 的 signal/current。`connector-lifecycle.ts:40`、ConnectorHost `withTimeout` 及沙箱 proxy 都在请求结束时主动 abort 自己的临时 signal；持有这些会让成功或普通失败一返回便被误拒。账号 ABA、消费方取消/撤权继续由原 control 检查。本补丁没有新 listener/controller；请求 `finally` 和 Host 清理照旧，WeakMap 随原 scope/checked 生命周期释放，无须新增手动 disposer 或业务补偿写。
3. **私有类型接齐。** `PluginConnectorPort.pull` 的 run 新增必需同步 `retainProvider`，Runtime 的唯一生产构造点已补齐；Host 原样转交 registry 可选 retain。registry 的可选参数用于未持有结果的普通 bind 调用，不能演变成生产端口缺回调时静默 no-op 的兼容分支。`tests/security-invariants-plugin-source-connector.test.ts:224` 附近 `hostRig.run` 等直接 Host port 测试对象必须按新私有类型补齐，相关观察用例实际收集并调用 guard，不能只加空函数冒作传播证明。无需导出 `holdPluginResult` 到 Runtime index，更不向 contracts、SDK、receipt 或插件输入添加字段。

## 错误结果与调用范围

来源身份失效时，补丁的 guard 抛现有 `plugin.integration_unavailable`；它从 `run.current()` 或后续 `beforeEffect` 再次抛出，使两层 catch 在业务写之前退出。无需按原 sandbox/connector 错误码猜取消，也不新造错误码。原错误可能经过 ConnectorHost 的规范化，但持有的检查不随该错误丢失。

实例仍有效时 guard 通过：provider 的 `ok:false` 继续走 Listener terminal failed / Feed sync_failed；普通 throw/timeout 继续走既有 interrupted / retry_wait / sync_interrupted。沙箱 runner 的 GONE 只清 runner 供下次重启（`sandbox-integration.ts:119–123`），Host contribution 未换时不能据 GONE 一概取消业务故障。无可用账号在 bind 前返回 needs_auth，不虚构已调用 provider。原真实 Feed strict snapshot 之外须有正常故障对照，否则“所有失败都不写”也可能假绿。

本次 Feed sync/tick 是真实 action，handler 的 `pluginActionBeforeEffect` 和平台写入的 `assertCapturedPluginActionCurrent` 都复核同一 checked key；`background.start` 延续 action 也共享该 key。不同调用有独立 key，不应串扰；同一次 tick 若已持有的某来源失效，该调用后续提交整体被拒，不能为继续处理另一来源而删除旧 guard。新调用可读取当前来源正常执行。

**不要扩大承诺为所有 job 的裸 `control.beforeEffect`。** 来源接口支持 kept job，但 `activation-jobs.ts:91–95` 的裸 control 只检查 job authority，未接 heldResults；平台服务写入仍由 `assertCapturedPluginActionCurrent` 检查。当前 Feed kept jobs 只做 wake/reconcile，不走本次 connector pull，故本补丁不需扩 activation-jobs；scene 在 `source-pull-connector.ts:44` 被全部拒绝，并非只拒只读 scene。以上是现有路径边界，不另加 scene/job 矩阵或源码写窗。

## 原范围内的验证落点及交接

- `tests/sandbox-integration-home.test.ts`：保留 RAC-2615-QUEUE 的真实 runner 后屏障、升级、严格 owner 快照零新增；同源新请求可成功，以及正常 provider 故障仍留下合法失败事实。作者已有 dirty 测试不覆盖。
- `tests/integration-registry.test.ts`：原 RAC1001 队列与 source bind 普通异常隔离继续保留；在已准窗口证明 retained guard 遇换 provider / disable→enable 拒绝、冲突替换不污染旧 guard。检查实际捕获与 await 时点，不以 entry 字段存在代替。
- 新准窗口 `tests/security-invariants-plugin-source-connector.test.ts`：沿现有 Runtime/Host rig 验同调用后续 `beforeEffect`/平台写被 guard 拒绝，并证明新调用和正常故障仍可行；现有账号 ABA 和 receipt 五字段断言保留。
- 机械泛化回归沿已有 `tests/security-invariants-plugin-model-held-results.test.ts`、`tests/security-invariants-plugin-model-materials.test.ts`、`tests/plugin-model-service.test.ts`，不改模型期望。直接连接控制的已有证据位置为 `tests/connector-call-control.test.ts`；非 Runtime Feed 的正常失败语义可对照 `tests/feed-connectors.test.ts:710–741`，不拿它替代真实 Runtime 对照。

这些是原方案的验证落点，不新增固定 case 数或强制矩阵。实际构建、完整文件 jobs1/retries0、隔离及公共槽沿 T141 原合同由执行者负责；本线未运行。五生产文件就是作者 patch 所列；`#1672` 的 registry OAuth import/oauthOwner hunk 冻结，T144 共享窗口按根 fresh 核查与交接，不自行放锁。README、SI、共表、Full/CI 与采用仍归根；T141 完整目标未因本审结案。
