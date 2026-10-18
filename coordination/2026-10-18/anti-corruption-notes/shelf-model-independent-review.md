# Shelf 模型材料前置 SHM 独立复核

对象：`wt-shelf-runtime` 的 `a939521a3`，基线 `9892c6b9d`；同时读取主会话尚未提交的八项 docs/spec/API 变更。唯一验收依据是 `specs/repository-anti-corruption/spec.md` 顶部 `W5-01-SHM-01～03`。本轮只读源码、测试和已有日志，没有修改仓库、构建或启动测试。

**结论：未发现当前必须修复的生产 Blocker/P1。** SHM 平台接缝实现与既定范围一致，尚不能由此宣称 Shelf 插件迁移完成。一个安全断言缺口建议在本片定向回归中补齐；其余批次和门禁仍由主会话裁决。

## 关键边界核对

### 原图与清理

- `packages/plugin-runtime/src/model-service.ts:95-98,182-191` 在首个 await 前复制 selection、每张图的字节与 label，限制 30 张、单张 32 MiB、合计 128 MiB；传入的路径或 URL 不参与模型输入，label 仅作描述。
- `apps/local-host/src/plugin-model-images.ts:10-27` 使用 `mkdtemp` 的新目录，目录设为 0700，文件仅为内部编号，`wx` 新建且 mode 0600；每次文件写入前及真实调用前重查原调用授权和取消。目录创建之后的所有后续成功/抛错路径都在同一个 `finally` 删除目录。chmod、writeFile、授权或 provider 失败也落在该清理范围。
- SDK 仍经原 intake 校验图片格式、处理原字节和释放自己的资源；未新增图片解码/重编码、外部路径授权或持久缓存。
- 新测试用真实 Runtime→Host→agent-host→SDK→本机两种协议服务，检查三张 PNG/GIF/重复图的顺序与原字节、请求发起后改动原数组不会改变请求、prompt 用户覆盖、0600/0700、Host 源目录与 SDK intake 清理。伪图、张数、单图超限、非视觉选择均断言零请求；取消用例在关闭 owner 后检查清理。

### 回执、terminal 拒绝与最终提交

- `apps/local-host/src/host-complete-text.ts:68-83,117-129` 的 guard 捕获的是实际调用前的 configured snapshot，含 provider/model、connection revision 与 sealed credential snapshot；`validateResult()` 同步重读同一选择，不重选默认模型。成功结果保留真实推理字段，普通 provider 失败保留已有 `PrologueInferenceError.execution`，空正文也保留这次已完成推理的事实。
- `host-complete-text.ts:119,126,202` 在绑定已经变化时创建新的 `actions.configuration_changed`，没有附带旧 execution 或 validateResult。`plugin-model-service.ts` 只复制源错误已有的字段；`packages/plugin-runtime/src/model-service.ts:124-126` 对 terminal configuration_changed 直接透传，不再运行会产生不同 availability 错误的 authority，也不把它包装成插件可记账失败。代码路径满足“terminal 拒绝不暴露可记账 receipt”。
- Runtime 对普通失败在 `model-service.ts:127-134` 重新检查 authority，并将 Host guard 与原 action guard 组合；成功路径 `137-145` 同理，JSON 解码失败携带真实 completed receipt，不伪造 failed 推理。
- `model-service.ts:99-106` 的结果 guard 必须位于原 `currentPluginAction()` 对象中，检查 signal、当前安装与 grant、原 caller 权限和同步 `assert_authority_current()`。该 guard 不取代 `await caller.beforeEffect()`；新实操测试把最终 beforeEffect 停在真实 barrier，期间改变连接、模型、caller 授权、安装 grant 或停止再启用，断言零业务写；未变化对照可提交。普通失败的最后等待也有连接变化拒绝；原动作结束与下一动作借 guard 均有拒绝断言。

### onText 与结果 guard 的区别

`model-service.ts:112-117` 的 onText 交付检查捕获的原 caller、signal、安装及 grant，但不要求回调当前处在原 ALS：模型 provider 可以从外部异步上下文推送进度。它另有 receiving 开关，在模型请求结束时关闭。结果 guard 则严格要求原 ALS scope，供最终业务提交使用。两者职责不同，未见通过复用 callback 绕开结果提交授权的路径。

`tests/security-invariants-plugin-model-progress.test.ts:75-90` 现在明确在动作外部调用进度回调：有效时能交付，取消/撤权/停用之后拒绝，且无迟到业务写。动作已结束、模型请求已结束两种情况也有原有拒绝覆盖。没有为了修 ALS 问题去掉原 caller 的同步授权检查。

### choices

`model-service.ts:76-81` 检查当前安装与 model grant，拒绝外部插件作用域，返回副本。Host 直接复用 `configuredModelChoices`，只投影 ID、显示名、vision 与 reasoning_effort；底层 `configured-models.ts:29-40,50-75` 用 sealed metadata、连接状态与 origin pin 判断可用性，不调用 secret get 或网络。可用性查询没有递归进入动作完整 authority。

SHM choices 测试逐次检查零 secret get、零 provider 请求，覆盖 provider 停用/恢复、断开连接、撤 model grant 和停止。secret store 的按 Home 缓存保证 spy 与生产读取使用同一个对象。既有 `plugin-model-selection.test.ts` 另外覆盖精确选择、缺失/禁用/断开时不回退，以及首次等待前复制 selection；新图测试也在调用后改 selection 并验证实际模型未改变。

## 必要验证缺口

**建议给 terminal configuration_changed 增加明确的字段拒绝断言。** 现有 `tests/plugin-model-selection.test.ts` 最后一个真实请求用例验证了 configuration_changed、未交结果、无业务写，但没有在插件 catch 分支检查 `execution === undefined` 与 `validateResult === undefined`。SHM 新测试中的配置变化均主要发生在“已经拿到 result/failure 后的最终 beforeEffect”阶段，不能代替“Host 已作 terminal 拒绝时不得交出可记账字段”的合同断言。最小补法是在既有真实请求期间断开连接的用例里捕获该错误，核对两字段不存在后继续抛出，并保留当前零写断言；不需要增加新平台或扩大测试矩阵。这是缺失断言，当前源码未发现实际泄露。

已读取 `/tmp/molis-shelf-model-repair-targeted.log` 的完成结果：真实存在的五份文件全部通过——host-configured-text 14/14、shelf-ai-host 8/8、security-invariants-plugin-model-materials 14/14、plugin-model-service 15/15、plugin-model-selection 4/4。另两项失败是传入不存在的文件名 `prologue-progress.test.ts` 和 `prologue-sdk-images.test.ts`，不是产品失败；正确的 progress/images/native 与余下生命周期、metadata、Shelf jobs/recipes/settings、prompt 及集成/门禁结果仍由主会话补齐。整体 build exit 0 为主会话提供的验证；本轮没有重复运行。

## 非阻塞 P2

`tests/fixtures/plugin-model-runtime.ts:73-78,91-96` 的清理检查只记录抵达 inference seam 的 Host 源目录。非视觉模型等更早拒绝也会先建立 Host 临时源目录，但该目录没有进入 `sources`，因此该分支的 assertClean 不能单独证明 Host 源目录已清掉。当前 helper 的统一 finally 已覆盖该路径，正常/provider/格式失败/取消路径的清理已有真实验证，故不视为生产阻塞；后续若调整暂存生命周期，宜补一条能观察该早期拒绝目录的定向断言。

证据等级：源码复核与真实 SDK/本机模型服务协议测试，非商业模型质量、Shelf 迁移产品实操或一骏验收。
