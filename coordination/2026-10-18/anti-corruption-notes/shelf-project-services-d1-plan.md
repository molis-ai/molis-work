# D1：提取现项目成果操作并补过程项恢复与可消费目录（负责人：主会话；实施待分配）

状态：2026-10-18，只读设计完成，未改代码/spec/测试，未构建。实读 S=`wt-shelf-runtime`，HEAD=`dfc21df3ba0bf835e39935885488065873fd9888`。本文件收敛 D/shelf-project-services-slice.md 的 D1，供主会话写入唯一 accepted spec。完成等级为公共前置功能可用；D2 图参与者、D3 Home invocation 门面和 Shelf 正式迁移不在本片。

## 1. 保留与新增

保留现项目 `openHostSession → createPluginArtifactClient → SDK sync ActionService → operations → ArtifactsApplicationApi/ProcessItemsApplicationApi` 的真实生产路径；提取的是现 owner 包中的政策，不新增注册表、数据库、SQL、provider 或 Home 服务。旧 SDK provider 仍每安装注册一次、退出时 dispose。

现 `artifacts.head/readOwn` 只校验 producer_plugin_id，未检查 publisher signature 或 owner；本片原样保留参数、返回值、拒绝规则和归档可读语义，不顺便加严。普通 `read` 保持成果优先、过程项其次、过程个人 owner 检查和 consumes/归档/可用性检查。固定输出在 producer 停用后仍能消费，本片不读取运行状态、不碰 graph/bindings。

新增三项：`processItems.head`、`processItems.readOwn`、`artifacts.listConsumable`。现 SDK project client 立即接入三项，不能只导出未被生产使用的工厂。工厂由当前 client 使用，未来 D3 直接复用，D1 不开放 Home 声明。

## 2. 作者合同（精确形状）

在 contracts/platform/plugin-artifacts.ts 增加并经 platform/plugin.ts 导出：

```ts
export interface PluginProcessItemHead { version: number }
export interface PluginConsumableVersion extends ArtifactReference {
  kind: "artifact" | "process_item";
  artifact_type_id: string;
  schema_version: number;
  title: string | null;
}
// 追加到既有接口，不替换旧方法：
// PluginArtifactClient
listConsumable(): PluginConsumableVersion[];
// PluginProcessItemClient
head(artifactId: string): PluginProcessItemHead | null;
readOwn(reference: ArtifactReference): ProcessItemRecord | null;
```

过程 head 只查 process.query.latestArtifactVersion，不查成果库，不返回/伪造 source_revision。不存在返回 null；存在时必须 producer_plugin_id 与 manifest.plugin_id、producer_binding_signature 与 manifest.publisher.signature 相等；personal 还必须 owner_actor_id 等于安装的 actor_id。readOwn 同规则但用 getArtifactVersion；归档与 unavailable 记录均允许读取用于自身恢复，consumes 不参与，不能因此变成普通 read 可消费项。不比较 producer_plugin_version，正常升级仍可恢复本签名旧版本。

目录无输入、无 project/producer/filter/pagination 参数，返回所有可消费的固定版本，不只 latest，不限端口。事实核对：modules/artifacts/src/repository.ts::listArtifacts 返回所有版本，按 created_at DESC、artifact_id、version DESC；两个 owner 都沿该合同。成果 title 取记录 title；过程没有 title 字段，metadata.title 为非空字符串时原样返回，否则 null，不从正文猜标题。目录不返回正文、metadata、owner、路径或运行状态。

目录遍历两个 owner 的 listArtifacts(project_id)，成果在前、过程在后，各自保留 owner 排序；此顺序为明确合同，不假装跨库全局时间序。每个候选使用和 read 同一个消费判定。个人过程 owner 不符、未声明 consumes、归档、unavailable 只过滤该候选；查询/数据错误直接抛出，禁止 `try read; catch continue`。成果同 id/version 优先行为保持：若 owner API 中异常存在两类同引用，过程候选跳过（用本次成果候选建立局部 ref 集合；不是持久 registry），保证列出的引用与随后 read 的种类一致。正常写入仍由原 cross-store unused 拒绝重号。

## 3. 工厂与输入校验：Host 注入现 Kernel validator

新增 owner 包文件 `plugins/native/artifacts/src/plugin-operations.ts`，公开工厂（只经该包 index.ts，作者 SDK 不导出工厂）：

```ts
export interface PluginArtifactOperationsInput {
  api: ArtifactsApplicationApi;
  process: ProcessItemsApplicationApi;
  manifest: PluginManifest;
  project_id: string;
  actor_id: string;
  author?: () => string | undefined;
  authorize(permission: "artifact:read" | "artifact:write"): void;
  assertInput(schema: ActionSchema, value: unknown): void;
}
export function createPluginArtifactOperations(input: PluginArtifactOperationsInput): {
  client: PluginArtifactClient;
  process: PluginProcessItemClient;
};
```

必须返回分开的 client/process，不能再用 `PluginArtifactClient & PluginProcessItemClient` 扁平对象：新增的两个 head/readOwn 同名但操作不同 store，交叉类型会把语义混掉。

工厂在创建时 structuredClone manifest；不持 registry/client/install_id，不注册动作，不自己创建身份。每个方法先检查 manifest 对 artifact:read/write 的声明，再调用 authorize；身份与运行授权由可信 Host 入口给，manifest 不能替代授权。D1 client 的 authorize 调 context.requireGrant(permission)；D3 将用原 invocation guard，不能把 context.requireGrant 的 project 语义照抄到 Home。既有 manifest 与 context.plugin_id/version 匹配检查保留在 createPluginArtifactClient 入口。

把现 fixed/versionOf 字段白名单合并为 owner 包内唯一的输入投影，工厂也使用它；不得 spread 插件输入到 registerVersion。先投影再用共享 schema 校验，与现 client 丢弃额外 identity 字段的行为一致；nested content/metadata 仍受原 schema/Module 检查。项目 public client 同一投影用于 invoke，避免 forged identity 先被 action input 额外字段拒绝而改变既有行为；工厂直接调用也不能绕过边界校验。

`assertInput` 是一个实际已有功能的窄端口：Host 从 `@molis-ai/molis-work-kernel` 传公开 `assertActionInput`（kernel/src/index.ts 已导出），tests 用同公开函数。给 createPluginArtifactClient 的 input 追加此 required 字段并传入工厂；更新当前全部调用方（Host 一个、plugin-artifact-client.test.ts 两处）。不让 owner 插件新增 kernel 依赖，不手写第二套 JSON validator，不使用 no-op。project Kernel 和工厂会校验同一 schema：前者守动作边界，后者保证未来直接调用的 owner 边界；没有两套字段或校验规则。若实现要去除重复运行，应在已有可信已验入口内部优化，不能公开允许调用者跳过校验的 boolean。

schema 与字段投影从 plugin-client.ts 提为小 `plugin-action-contracts.ts`，供 actions 和 operations 共用；现 action-schemas.ts 的 id/version/reference/record/processRecord/object/array/nullable 继续复用。旧五个动作的 input/output schema 必须逐字段不变。新 schema：process-head 输入 object({artifact_id:id})，输出 nullable(object({version}))；process-own 输入 reference，输出 nullable(processRecord)；list 输入 object({})，输出 array(object({artifact_id:id,version,kind:{enum:["artifact","process_item"]},artifact_type_id:id,schema_version:version,title:nullable(text)}))。

## 4. 唯一政策与真实生产接线

从 plugin-client.ts 搬出 UNCONSUMABLE_MESSAGE、declares、unused、fixed、publish/record/read/head/readOwn 全部实现；原位置不留第二份 fallback。工厂内把“消费判定”做成一个非抛错的 owner 私有函数，返回 allowed 或明确 denied/incompatible 原因。read 用它转回原错误码/中文原因；list 用同结果过滤。它调用 owner 的 consumptionCompatibility，不复制归档/可用性判定。ownProcess 有自己明确规则，不把旧 artifact own 接到它而悄悄加严。

client 文件只负责：安装身份匹配、创建 operations、一次 registerProvider、caller/allowed_actions、方法白名单投影与 invokeSync、dispose。SDK 每个 handler 委托 operations.client 或 operations.process；availability 和 invoke 前的 requirePermission 保留其现生命周期意义，实际业务决定只在 operations。Host openHostSession 只新增 assertInput 的注入，保留 author() 从真实 currentPluginAction 的 caller.actor_id 读取的写法。services.artifacts/processItems 继续返回 hosted client，无 Runtime/graph 新装配。

owner/author 不混淆：原 fixed.actor_id=input.author?.()??actor_id 保持。个人成果 owner 由 Artifacts Module 的 homeOwner 规则给出；过程 owner 仍遵循现注册默认（本次 author），不擅自改成 Home person。新过程 own 对 actor_id 安装归属检查会拒绝“其他 actor 记下的个人过程项”，这是新增恢复接口的明示边界；D1 必测 author 与安装 actor 不同时 created_by/owner 原规则保持、own 拒绝，不偷偷通过改 record 的 owner_actor_id 来让测试变绿。

## 5. SDK 动作、版本与快照

同一 `sdk.artifacts.${install_id}` provider 新增三个 operation 后缀：`process-head`、`process-own`、`list`，version 均 1；operation=query、kind=query、scope=project、audiences=[plugin]、permissions=[artifact:read]、subject_kinds=[artifact]、execution=sync。扩展 sdkArtifactActions 的 union/title/read判断、definitions、handlers、caller.allowed_actions 和返回 client 方法；无额外 provider。旧 read/head/own/publish/record 仍 @1，形状和语义不变，无需冒升版本。

contracts 公共 API 有新增，pnpm api:update 必跑并审 diff；如为 SDK 作者便利导出新类型，只在现 plugin-sdk/index.ts 的 type export 行追加 PluginProcessItemClient/PluginProcessItemHead/PluginConsumableVersion/PluginProcessItemInput，禁止导出 factory。root 决定是否本片增加这些便利导出，作者始终可从 contracts/platform/plugin 取完整类型，不阻塞功能。

动态 SDK 动作是否进入 host-actions 快照取决于现 discover caller 是否有安装身份。现 action-contract-host.mjs 的枚举 caller 没有 plugin_install_id，而本 provider 的 availability 要求安装 id，因此不能承诺它必出现三行。按现脚本实际运行 actions:update/check 并提交真实变化；没有变化也记录“当前快照不覆盖安装私有 SDK 动作”，用定向 discovery 测试逐个断言新动作 schema/permission/audience/version。不要为快照人为放开 SDK availability 或改门禁。

## 6. 允许文件与验收编号

实现范围：contracts/src/platform/plugin-artifacts.ts、plugin.ts；artifacts/src/plugin-client.ts、plugin-operations.ts、plugin-action-contracts.ts、index.ts（action-schemas.ts 仅共享 schema 必需时）；Host plugin-host-services.ts 一个 validator 注入；tests/plugin-artifact-client.test.ts 和必要新 tests/plugin-artifact-operations.test.ts、plugin-host-services.test.ts。类型展开导致已有 typed fixture 缺方法时仅补对应真实语义 fixture，不加可选方法、any 或生产兜底。不改 modules/artifacts SQL、wiring、project-plugins 特殊消费者、home executor、C OwnerFiles 或 A 树。

root 串行：唯一 spec、API/动作快照、包 README/必要 skills 文档与安全表；本片无页面资源变化、无数据库迁移、无新增错误码需求，继续 artifacts.plugin_denied/plugin_incompatible 与 Kernel 原输入错误。

- D1-01：原五个动作、生产 project createPluginArtifactClient 全部委托共同工厂；真实 Runtime publish/read/head/readOwn/record 结果、事件游标、replayed 与输入身份白名单不变。停止/撤权/旧 client 必须仍拒绝。
- D1-02：process head/readOwn 精确 store、null、最新版、归档/unavailable 自恢复、无 consumes 仍恢复；错 producer、同 id 不同签名、个人 owner 不符拒绝。producer version 升级不拒。artifact 原 head/readOwn 同签名变化仍按原 producer id 规则工作，锁住“不加严”。
- D1-03：两类多版本、未连端口版本都可列；只过滤不兼容/不可用/归档/他人个人过程；过程标题 null/string、成果 title 正确。每个列出 ref 随后 read 同 kind/type/version；查询故障抛出，禁止吞库错误。无产物引用时返回 []。
- D1-04：publish/record 未声明 type/schema、跨 store 同 ID、版本冲突、伪 project/owner/producer/scope 输入不能越权，拒绝后版本/事件无新增。direct factory 与 SDK 使用同 schema，非法 version/content 同样拒绝；生产 author 来源保留。
- D1-05：真实 SDK discovery 新三 query @1 的精确 input/output/permission/audience；无读 grant、其他安装和用户/MCP actor 不得冒充。旧五动作 schema 比较不变。工程 fixture 不通过裸 operations 代替全部真实客户端证明。
- D1-06：真实 project Host fixture 的 services.processItems.head/readOwn 与 services.artifacts.listConsumable 可用；现 inputs/outputs record/select 继续工作；producer stop 后另一消费者仍读取已固定且可消费版本（无需改 graph）。工厂本身无 registry 参数，创建不会新增 provider；项目 client 只保留现一个 provider 并可 dispose。

验证先整体 pnpm build，再 `node scripts/run-tests.mjs tests/plugin-artifact-client.test.ts tests/plugin-artifact-operations.test.ts tests/plugin-host-services.test.ts tests/personal-artifact-owner.test.ts tests/artifacts-module.test.ts`（新文件名在实施时固定）。artifacts README 必跑再纳入 artifacts-actions、artifact-browser、artifact-document-import、artifact-links、artifact-source-and-links、artifact-subject-context、artifact-search-summary；Runtime/Host/contracts README要求按实际改动由root整合，不重复已有效批次。api/actions/boundary/merge-base health 由root串行核验，共享核心全量在集成队列；本设计没有运行任何测试。

## 7. 实施顺序及与后片交接

先补唯一 spec 和合同/schema；再提取 operations 并让旧 client 五方法切到同一实现（定向回归）；随后加三 query 与真实 Host fixture；最后 root 收共享快照/文档和工程证据。可在一次 writer 任务串行完成，不切出“只有 factory”作为交付终点。

D2/D3 只消费这里的工厂和返回接口。D3 的 authorize 必须做原 invocation/安装/项目/caller 与写 gate 检查，assertInput 仍用同 Kernel validator；D1 没有提供那份授权，不得据 factory 已存在提前允许 Home 调项目库。既有固定输出保留策略、旧 artifact head/readOwn 合同保持。后片不应复制本片业务规则或新增 owner SQL。
