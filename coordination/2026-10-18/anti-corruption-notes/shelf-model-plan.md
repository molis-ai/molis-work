# SHM 实施提案（负责人：主会话统筹，writer 待分配）

状态：只读细化完成，基于 wt-shelf-runtime / 8e0152907。只覆盖 Shelf Runtime 前置 A+B：原图、完整回执、最终绑定复核、模型 choices。没有改源码/搬 Shelf/安装/构建/浏览器。最终预算、public exports、API快照及唯一 W5-01 spec 由 root 接。

## 1. 最小合同差异

修改现 `packages/contracts/src/platform/plugin-model.ts`，不新建 service map，不开放任意 HostTextOptions：

```ts
import type { BoundedInferenceReceipt } from "../services/agent-host.js";
import type { ActionError } from "./actions.js";

export interface PluginModelChoice extends PluginModelSelection {
  readonly label: string;
  readonly vision: boolean;
  readonly reasoning_effort: boolean;
}
export interface PluginModelImage {
  readonly bytes: Uint8Array;
  readonly label?: string;
}
// 在现请求增加；无路径、URL、凭据、资源ref或用户自称的mime。
// PluginModelRequest.images?: readonly PluginModelImage[];
// 在现结果增加：
// PluginModelResult.execution?: BoundedInferenceReceipt;
// PluginModelResult.validateResult(): void;
// 在现 client 增加：
// choices(): readonly PluginModelChoice[];

export type PluginModelFailure = ActionError & {
  readonly execution?: BoundedInferenceReceipt;
  readonly validateResult?: () => void;
};
```

execution 对真实 Prologue 完整返回；可选仅因现 `HostCompleteText` 注入只返回 string，没有运行事实可填，不伪造 run_ref 或零用量。保留当前 `usage` 简表给已有消费者，其 reportedTokenTotal 算法不变；Shelf 后续只存 execution。validateResult 是同进程同步函数，不是可序列化权限票据，不进入动作输出或持久化。返回对象/错误附着的函数可设 non-enumerable，避免误散入普通 JSON，但安全不依赖此属性。

失败不加 Error 子类、不把回执塞进 details（那会改变 HTTP 响应）。可用现 defineErrorCodes 增 `plugin.model_failed: upstream`，仅规范化非 ActionError 的模型执行失败；已知平台拒绝保留原 code/kind。`plugin.model_output_invalid` 仍表示现 JSON解码失败，携带已完成的真实 execution（state 仍 completed，不能为了业务解析失败改成 failed）。领域校验仍归 Shelf，收到成功 result 后由 Shelf 现 catch 保存 result.execution。

命名可沿现 Shelf 的 validateResult，避免另造一套 assertCurrent 命名；它不是替代 beforeEffect。

## 2. 真实图像链与最小实现

已核对：`horizontal/agent-host/src/inference.ts` 的 PrologueInputImage 只有 `{root_path, relative_path, label?}`。`adapters/prologue-inference-materials.ts` 通过 Runtime.workspace.authorize + beginIntake(root.ref).add(path)，当前 vendored SDK IntakeBatch 也只有 add(path)，没有 addBytes。不得把不存在的字节 intake 当已满足，也不应为了此片改 SDK。

推荐：公共请求收 bytes；Runtime 在第一次 await **之前**做数量/大小/形状校验并复制每份 bytes 和 label；Host 在私有临时目录将复制的 bytes 写成内部生成的数字文件名，再构造可信 PrologueInputImage 给现 hostTextGeneration。无需改 agent-host 的图像类型或 SDK。每次一个目录，权限0700/文件0600，名字不使用label，拒绝超限在落盘前完成；30张、单张32 MiB、总128 MiB沿用现 inference 约束，不调预算。无 images 就无目录。

Host 在现 beforeDispatch/取消检查后才创建暂存；每次等待后复查；finally 在真实生成/intake完成或清理后删除临时源目录。既有 withInferenceImages 继续按魔数拒绝伪图，允许 PNG/JPEG/GIF/WebP，维护顺序、重复图、32MiB/128MiB边界，并撤销 SDK staged/published资源。Host源暂存和SDK资源是两份不同清理责任，测试都检查。取消时后台工作尚未退出的情况由同一次 promise/finally负责完成清理，不能让工具先报已清而异步又写出文件。无需 Shelf 文件服务，也不接受 plugin root_path。

允许新建一个小型 `apps/local-host/src/plugin-model-images.ts` 放暂存适配，避免主 service 膨胀；如能在已有文件内保持清楚且不触巨大门禁则无需新文件。不得用标签推导文件路径。未来 Shelf prepareSources 从自己已经校验/冻结的副本读取 bytes；本片不移动 prepareSources。

## 3. final validator 的可信来源和生命周期

必须从**实际派出的模型绑定**产生 guard，不能在 Runtime 收到结果后重新 snapshot 并把新配置当作原绑定。

最小 Host 改法：`host-complete-text.ts` 定义 HostTextGenerationResult = PrologueTextResult & `{validateResult():void}`，并让 HostTextGeneration 返回它。configured 分支现有 `before = current()` 与其固定 `selection` 就是基线，在同一闭包导出同步 guard，比较现有 configuredTextModelSnapshot（包含连接 revision），不暴露 snapshot、credential_ref或secret；环境分支比较该次 before 的环境状态及目录优先级，不用“重新选择默认模型”。结果返回前继续调用 guard。`hostCompleteText()` 仍只取 .value，旧消费者不受影响。

错误路径：在 Host 捕获 actual PrologueInferenceError 时用现有错误对象/包装后的错误附加这一 guard；execution 原样保留。用内部 Host 类型描述可带 guard 的执行错误，不给插件一个可注册 validator 的入口。对于本就为撤权、取消、失效配置的拒绝，优先抛拒绝，不能转成可记业务失败的普通 provider error。没有 receipt 的 pre-dispatch 错误不补 receipt。后续空正文等已获得真实 result 再失败的检查应携带该 result.execution，避免新接口把已有事实丢掉。

`PluginModelPort.complete` 从 `{text,usage?}` 扩成 `{text,usage?,execution?,validateResult}`，内部统一从 HostTextGenerationResult 映射，复制可序列化 receipt；注入 string 模型给无模型绑定的 no-op Host guard，Runtime 授权 guard 仍执行。Runtime 暴露给插件的 validateResult **不是直接给Host函数**，而是闭包：

1. 对照捕获的原 PluginActionScope（当前scope必须是同次调用，不能借新调用），检查 signal、gate.assertActive、model:invoke当前grant及原caller权限。
2. `requireSynchronous(caller.assert_authority_current?.())`，原 kernel assertCurrent 已有 `executing`、registration token、availability、环境检查；action结束后抛 actions.expired，换代/停止仍拒绝。AsyncLocalStorage可能跟随旧timer，因此只比较scope不够。
3. 调 Host validateResult()，读取配置和连接当前值，任何差异抛 actions.configuration_changed。

插件提交模式仍是 `await caller.beforeEffect(); result.validateResult(); <同步提交>`；没有 await 夹在 guard 与同步写之间。Shelf 自己的 source/hash/job/shortcut 检查继续保留，不搬到通用服务。失败对象的 validateResult也同样包装，供失败记账前使用；不能只保护成功写入。

正常模型返回、Runtime JSON decode失败和可记账的provider失败均保留对应同一次guard；对失败进行规范化前/后执行当前原调用授权检查，撤权时不向插件交付可用来记业务失败的对象。无需全局WeakMap/receipt registry或可复用token；闭包绑定该次调用与Host快照即可。

## 4. choices 的准确复用

直接复用 `apps/local-host/src/configured-models.ts:29 configuredModelChoices(home)`，其返回正是 provider_id/model_id/label/vision/reasoning_effort。它调用现 `selectConfiguredTextModel` 与 `modelCredentialMetadata`，仅 peekSealedEntry，检查连接启用、断开、origin pin及模型是否有效，不解密、不联网。不能改用 health，也不能取 model.configuration.read 然后丢弃敏感字段。

`PluginModelPort.choices()` 提供元数据，`PluginModelClient.choices()` 在 Runtime 检查当前安装与model grant，返回复制的 readonly rows；与 availability 一样可以用于发现，不递归触发 caller.assert_authority_current（可用性重算可能再读choices）。若在scope内调用，至少拒绝跨安装scope；没有scope的发现仍按实例grant。注入 HostCompleteText 不伪造一个“测试模型 choice”；无目录 choices=[]，availability 仍保持当前测试注入语义。Shelf未来 settings保持在catalog，不用Jelly configuration的preference/custom-provider写口。

## 5. 现有证据与准确测试

- `tests/shelf-ai-host.test.ts:60` “Shelf Action -> registered prompt override -> shared Prologue -> result and truthful receipt”：真实请求、prompt override一次、configuredModel/text、reportedModels/actual、estimated input、unknown cost不填数、catalog持久化完全等于返回receipt。
- 同文件:80 “every recipe reaches its registered instruction; JSON alone uses JSON files and malformed output retains execution facts”：遍历recipe、JSON围栏与JSON文件、invalid not-json/[]/null的失败任务有run_ref；领域空交付拒绝。
- 同文件:108 “original images require the selected vision model; folder and PDF contents keep their source identity”：文本模型0请求、vision原图data URL字节准确、文件夹/PDF来源、无效selection不回退。
- 同文件:149 “Shelf rechecks the exact model binding after the final business authority wait”：实际实现是在 port.generate已返回后、store拿到结果前停用模型，再验证零结果和原running记录。它证明返回后guard，但**未实际卡住最后beforeEffect Promise**；新增用例要补这个真实交错，不能复述测试名作为完整证据。
- `tests/shelf-job-runner.test.ts:11` 参数化 cancel/abort/revoke/source/model/shortcut：迟到结果和失败记录均拒绝，只有显式cancel写cancelled，其余running不补error，旧任务不再阻塞。
- `tests/host-configured-text.test.ts:76` vision关闭拒绝；:172 disconnect/disable/replace-model/replace-key/delete真实pending结果拒绝；:142元数据不解密。
- `tests/prologue-inference-images.test.ts` 首条两协议/顺序/原字节/清资源；第二条 invalid structured output保留failed receipt并销毁图；第三条伪格式/路径/symlink/数量/字节拒绝；末组cancel/revoke/close在intake等待中拒绝。无需重复修改这些路径，但公共适配必须另验。

## 6. 新增三个真实 Runtime 用例（可以一个文件分3组）

SHM-01：使用真实 Home fixture、声明并发model动作、生产配置HTTP/目录和本机SSE模型，循环两协议（可复用现夹具），从context.services.model完成带两张图的JSON请求。首次授权wait时修改调用者的selection/bytes/label，最终请求仍为原快照；原图内容/顺序、用户prompt覆盖、execution五项与SDK回执一致，usage不伪造。遍历JSON decode失败和可产生真实execution的provider/SDK失败，断言原receipt state（completed vs failed）及guard存在；无receipt的拒绝保持无receipt。完成/失败/取消后两类暂存皆空。至少覆盖一次伪图片与非vision拒绝的0请求。

SHM-02：真实 Runtime handler拿到result后挂住自己的最后caller.beforeEffect，期间更换绑定/连接、撤权、停止并再启用（参数化），放行后调用result.validateResult，断言零成功/失败业务行；未改变对照能够同步提交。同一handler内捕获provider error并挂起失败提交也做一次连接变更，error.validateResult拒绝。保留guard跨action调用或原action结束后的timer调用均拒绝，不能复活。重点不是mock guard，而是让真实Host snapshot和kernel当前原调用检查失败。

SHM-03：真实 Runtime choices反映两个可用模型，禁用/断开/撤权后立即变化/拒绝；记录所有外部请求与SecretStore.get调用，发现0请求/0解密，响应不含地址/凭据引用。available(selection)与complete(selection)落到同目标，无效精确选择0请求且不回退；Shelf settings shape未改。

以上用例可以共用现 tests/plugin-model-selection.test.ts 的 fixture、security-invariants-plugin-model-metadata 的secret计数方法及SSE服务。禁止把receipt自己填到fixture结果再声称真实推理验证。

## 7. writer 边界和验证

允许：contracts/plugin-model；Runtime model-service；Host plugin-model-service、host-complete-text；必要小型Host image暂存helper；上述相关测试。choices复用configured-models无需另建目录。不改Shelf production、文件服务、项目桥、SDK/vendor、预算或其他模型消费者行为；不添加structured/schema这次未需的额外API。公共新增字段/错误码/exports由root串行接。

先pnpm build，再按root排期跑模型service/selection/lifecycle/metadata/progress、host-configured-text、prologue-inference-images/native、shelf-ai-host/job-runner/recipes/settings、prompt-registration和新SHM用例。此报告没有测试执行结果。只有SHM验证通过，不得宣称Shelf Runtime迁移完成。
