# Jelly Runtime 的模型配置端口：P0 设计稿

2026-10-17；只读核对 `wt-model-selection` 的 `e8925f8eaf5d9ad0152b16c3441a79bd7d3b875b`，以及 #661 `9d94e5eb5c87dc6271c998d0163cd2f2adf64e57` 的相关文件。没有修改工作树、运行构建/测试或接触真实 Home。以下是供主 Agent 裁决的具体合同，不是已批准架构。

## 判断

推荐把现有 `jelly-model.ts` 的**配置部分整体声明化**为一个 Host 消费者模型配置服务，保留原读写实现的职责与物理位置，并把目前没有写清的配置事实 owner 明确为该 Host 模型设置服务；Jelly 的 53 个动作全部由 Runtime 注册。模型执行仍是已存在的 `services.model`，配置作为其可选 `configuration` 成员。删除旧 Jelly Host 配置文件及旧三个导出，不保留同名代理、第二份配置实现或 Host 内的 Jelly 特判。

这确实新增一小块公共合同，但不新增通用 provider CRUD、文件替换 API、typed capability、Host 动作 provider 或任意 service map。可信目录只携**配置数据声明**，不能放依赖 Host 的回调。

当前没有可直接复用的“消费者模型配置 owner 扩展点”：

- `BuiltinPluginEntry.runtime` / `HomePluginEntry` 只有 `create`、`database`、`files`、包/工厂信息。
- `pluginEntryIdentity()` 用实际 `PluginDefinition` 对象的 WeakMap 保存数据库/文件声明；这是应复用的可信绑定机制。
- `pluginModelFor()` 只拿 Home、definition、context、assertActive，`createPluginModelPort()` 只提供默认或显式选择的推理/availability。
- `jelly-model.ts` 私有函数是现有配置路径，未暴露为 Runtime 服务。`web-model-settings.ts` 是全局管理 HTTP，不是插件可调用端口。
- #661 的连接管理动作只提供连接的管理/状态，不提供 provider 配置或 Jelly preference 管理。

因此“完全不新增合同、把 53 动作照搬 Runtime，同时保留原配置行为”没有现成生产接缝。把 Home 路径塞给工厂、让插件调用管理 HTTP、或把两个设置动作留成独立 Host provider，都不是零成本替代。

## 公共合同草案

可以放在小文件 `packages/contracts/src/platform/plugin-model-configuration.ts`，由现有 `platform/plugin-model.ts` 导出，不开一个无实际消费者的新 subpath。以下命名为建议；字段保留当前设置动作的输出形状，避免同次迁移无端改动作版本。

```ts
import type { ActionReference } from "./actions.js";
import type { PluginModelSelection } from "./plugin-model.js";
import type { ModelApiFormat, ModelRecord } from "../modules/model-providers.js";

export interface PluginModelConfigurationInput {
  readonly provider_id?: string;
  readonly model_id?: string;
  readonly base_url?: string;
  readonly api_format?: ModelApiFormat;
  readonly connection_id?: string;
}

export interface PluginModelConfigurationView {
  readonly configured: boolean;
  readonly providers: readonly {
    readonly id: string;
    readonly provider_id: string;
    readonly name: string;
    readonly base_url: string;
    readonly api_format: ModelApiFormat;
    readonly enabled: boolean;
    readonly has_credential: boolean;
    readonly models: readonly ModelRecord[];
  }[];
  readonly selection?: PluginModelSelection;
  readonly effective_selection?: PluginModelSelection;
  readonly source: "selection" | "provider" | "environment" | "none";
  readonly connections: readonly {
    readonly connection_id: string;
    readonly display_name: string;
    readonly state: string;
  }[];
  readonly custom_connection_id?: string;
}

export interface PluginModelConfigurationClient {
  /** Own selection metadata only; no endpoint, connection or credential. */
  selection(): PluginModelSelection | undefined;
  /** Only from the trusted declaration's read action, under that original caller. */
  read(): Promise<PluginModelConfigurationView>;
  /** Only from its save action. Authority is checked before any persistent effect. */
  save(input: PluginModelConfigurationInput): Promise<PluginModelConfigurationView>;
}

type OwnModelConfigurationAction = Pick<ActionReference, "capability_id" | "version">;

/** Host startup declaration. It is not part of PluginManifest or PluginDefinition. */
export interface PluginModelConfigurationDeclaration {
  readonly preference: {
    readonly store_name: string;
    readonly file_name: string;
  };
  readonly custom_provider: {
    readonly provider_id: string;
    readonly display_name: string;
  };
  readonly actions: {
    readonly read: OwnModelConfigurationAction;
    readonly save: OwnModelConfigurationAction;
  };
}

// One optional addition to the existing PluginModelClient:
// readonly configuration?: PluginModelConfigurationClient;
```

`id`/`provider_id`、`name` 等重复或既有命名是当前 Jelly 动作输出的一部分，这片保留；不再增兼容字段。`JellyModelInput` / `JellyModelSettings` 可以直接引用这些公共类型，JSON schema 原样，不在两包各写一份 DTO。现有 action output schema 与 readonly 类型的数组用途需在迁移时按实际编译检查，不能靠强转跳过。

输入没有 api_key、credential_ref、Home、文件路径、插件身份或事务回调。运行时还必须拒绝 `api_key` 等非法额外字段，不能依赖 TypeScript 形状。

配置文件内容仍固定为现行 `{ schema_version: 1, provider_id, model_id }`。只有文件名/所属 store 来自可信声明，不提供任意 JSON 文档读写。当前声明的文件名就是 `preferences.json`；名称需是单个普通文件名且非目录穿越。没有调用者可传的 filename 参数。

## 唯一可信声明

`apps/workbench/src/builtin-plugins.ts` 同一 Jelly 项的 `runtime`：

```ts
runtime: {
  scope: "home",
  create: createJellyPlugin,
  database: JELLY_DATABASE,
  model_configuration: {
    preference: { store_name: "jelly", file_name: "preferences.json" },
    custom_provider: { provider_id: "jelly-text", display_name: "Jelly 模型" },
    actions: {
      read: { capability_id: "jelly.model.settings", version: 1 },
      save: { capability_id: "jelly.model.configure", version: 1 },
    },
  },
  package_name: "@molis-ai/molis-work-plugin-jelly",
  factory_export: "createJellyPlugin",
}
```

这里没有 Host import、没有 `(home) => ...` 工厂、没有字符串 service resolver。可以把纯声明常量导出在 Jelly 包与 `JELLY_DATABASE` 并列，但实际授予仍只认 Host start list 携带的那份，插件自己返回的同形字段不生效。

启动前统一校验：

1. 是 Home、Host 执行的定义，非 sandbox；Manifest 声明 `storage:private`、`model:invoke`。
2. `store_name` 满足已有 `PLUGIN_LIBRARY_NAME`，Home registry 的 owner 与此 definition.manifest.plugin_id 一致；文件名单层普通名称，当前允许的现行格式是 JSON v1 模型选择。
3. 同一启动名单不得重复占用同一 preference 文件或同一 custom provider id；provider id 满足现有 ModelProviderStore 的格式。声明由宿主控制，不另造 provider ownership 表或从既有数据猜 owner。
4. read/save 引用必须在此 Manifest 的 actions 中唯一存在；read 是 query，save 是 command，两者有非空权限声明。当前都是 `jelly:settings`。不允许引用外部 provider 或把 provider_id 放入此动作绑定。
5. 复制并冻结声明（含嵌套对象）后再运行插件代码。没有可信声明的定义，即使伪造同 plugin_id，也拿不到 configuration。

## 无 Jelly 分支的装配链

```text
Workbench 同一目录项的 runtime.model_configuration
  → HomePluginHost.start() 的 shipped entry
  → assertModelConfigurationEntries(entries, home)
  → pluginEntryIdentity.remember()
      WeakMap<PluginDefinition, PluginModelConfigurationDeclaration>
  → HomePluginExecutor: modelConfiguration(definition)
  → pluginModelFor(home, definition, authorizedContext, assertActive, declaration?)
      现有推理 client
      + 可选 configuration client
  → PluginStartContext.services.model.configuration
  → Jelly 的现有设置 handler / selection 读取
```

`HomePluginHost` 的 `nativePluginReleaseArtifact(... restore)` 必须把同一可信声明记到 restored definition 对象；不能仅初始化时记一次，也不能靠 restored manifest 的 plugin_id 从字符串表补回。现有数据库/文件已有这条模式。

初版只给真正需要它的 Home Runtime 接线；项目 executor 的 model 服务保持 configuration 缺省。公共服务是可选的，不必为了对称同时给所有项目工厂新增配置。将来有真实项目 Runtime 消费者时再按同一可信机制补，不在本片扩范围。

Host 提供的内部同步端口可以是：

```ts
interface ConsumerModelConfigurationPort {
  selection(): PluginModelSelection | undefined;
  read(): PluginModelConfigurationView;
  save(input: PluginModelConfigurationInput): PluginModelConfigurationView;
}
```

新 Host 配置实现 `model-configuration.ts`（建议名）接收 `home + trusted declaration`，由它参数化当前 `jelly-model.ts` 的路径、custom provider id/label。它仍调用唯一 `ModelProviderStore`、`withConnectorConnections`、`modelCredentialMetadata`、`selectConfiguredTextModel`、`validateTextModelUrl` 等现行 owner；不复制 provider 表、token 校验或连接视图。原 Jelly Host 文件整体删除，不能留“通用函数 + Jelly 专用旧函数”双实现。

Runtime 对端口的权限封装可以是 `packages/plugin-runtime/src/model-configuration.ts` 的 `createPluginModelConfigurationClient(manifest, declaration.actions, port, gate)`，复用 `currentPluginAction()` 与 `PluginModelGate` 的安装门。新增这一有限服务，不另造命名服务目录。

## 三种访问的授权

### selection：仅本消费者的模型名字

`selection()` 同步返回已复制的 `{provider_id, model_id}` 或文件确实缺失时的 undefined；格式错误直接拒绝，不当作没配置。每次读原文件，不在启动时缓存。

它使用与现有 `model.availability()` 相同级别的**当前安装**授权：assertActive、当前 `storage:private` grant、当前 `model:invoke` grant。它不要求 `jelly:settings`，也不返回 providers、base_url、连接列表或 credential_ref。

这是刻意允许在动作 availability 计算时使用的元数据方法，因此**不能同时要求必须存在 currentPluginAction**。现行 `modelPlan.availability` 会由目录发现调用，`workspace.get` 也会返回 `capabilities.ai`，两者均需判断独立选择。若调用时存在 action scope，应验证同 install_id 并同步检查原 caller 仍有效；无 scope 时只是安装级元数据读取，不能写任何内容。这与当前 model.availability 的设计一致，不能写成“只有 plan 动作内部可读”。

模型实际执行仍由既有 `complete()` 强制核对当前 own action、model:invoke 的 caller 与安装 grant、concurrent、beforeEffect、prompt owner；读取到 selection 绝不授予模型调用权。

```ts
const model = context.services!.model!;
const configuration = model.configuration!;

modelAvailability: () => {
  // Preserve current Jelly unavailable-state presentation for a broken preference.
  try { return model.availability(configuration.selection()); }
  catch { return jellyModelUnavailable(); }
},
completeJson: async (prompt, options) => {
  const selection = configuration.selection();
  // complete copies the selection before its first authorization wait.
  return (await model.complete(prompt, {
    selection, signal: options?.signal, output: "json",
  })).value;
},
```

`undefined` 保持现有默认/环境语义；显式选择不可用不回退。不要把 `services.model` 的“省略 selection = Host 默认”改成隐藏的按插件默认，从而破坏新 SEL 合同。

### read：原设置读取动作

`read()` 只允许 currentPluginAction.install_id 为当前安装、动作 id/version 精确等于可信 read 引用。它检查当前 action definition 的全部 permissions、原 caller.permissions、安装当前 grants，执行 `await caller.beforeEffect()` 后再同步复查 signal/active/grants/caller.assert_authority_current，然后同步读 owner。

它不要求 caller 或安装额外拥有 model:invoke；现有设置动作只要求 `jelly:settings`，设置用户应能修复一个没有模型调用授权的配置。服务容器在 Manifest 声明 model:invoke 时创建，不等于调用每个配置方法都消耗该 grant。停止后不可读；旧动作结束后的 timer 即使继承 AsyncLocalStorage，也会被 beforeEffect 的 expired 检查拒绝。

### save：原设置写入动作

与 read 相同，但绑定 save 引用并确认为 command。使用原 action caller，不创建 user/owner 替身、不嵌套一个独立管理动作。权限仍是原 `jelly:settings`，不增加全局 connectors management 或任意 provider write 权限。

处理器可保持：

```ts
createJellyServiceHandlers({
  modelSettings: () => configuration.read(),
  saveModelSettings: input => configuration.save(input),
});
```

两项仍在 Jelly Manifest 中，由 Runtime 的同一次 `registerProvider` 登记，Host 不再 register 相同或另一份 id。HTTP route 调同两项，MCP/工作流沿原动作。安装停用后提供方撤销；晚到的内部 port 调用还会被 gate 拒绝。无需另做 Host 2 动作的停用桥。

## beforeEffect 与同步写边界

建议 Runtime 封装的顺序（伪代码，仅表示必要次序）：

```ts
async function save(input: PluginModelConfigurationInput) {
  const scope = requireOwnBoundAction("save");
  const accepted = structuredClone(input); // before the first await
  assertCurrent(scope); // installation, current grants, caller permissions
  await scope.caller.beforeEffect();
  assertCurrent(scope);
  scope.caller.signal?.throwIfAborted();
  requireSynchronous(scope.caller.assert_authority_current?.());
  return port.save(accepted); // synchronous: no await/network inside this call
}
```

生产 scope 的 caller 来自 Runtime 包装过的 ActionService，不接受插件传来的 control 参数。实现时 `assertCurrent` 可调用现有同步原 caller 检查；不能让一个没有真实 execution control 的伪 scope 通过。

`port.save` 中所有持久效果都必须在以上检查之后：包括首次 Connector origin pin、mkdir、临时文件、provider upsert、preference rename、失败补偿。校验与读取可以在检查后同步做；不在 await 之前预先 pin 连接。

原保存的同步次序应保留：校验目录/选择/连接 → assertTarget → catalog immediate transaction 内更新固定 custom provider（若需要）并 atomicWrite preference → commit；捕获 commit/写错误时回滚 provider、按现行标记还原 preference。save 返回设置 view 仍由同一个 owner 同步构造，不把事务拆成多个异步服务调用。当前不作联网探测，也不改 `jelly.model.configure` 为 concurrent。

**准确的现有边界：这不是三存储原子事务。** `ConnectorStore.assertTarget` 在 catalog transaction 之前 `INSERT OR IGNORE connector_connection_targets`，首次 origin pin 可能在后续 preference/provider 失败后保留。另有进程崩溃时 DB 与文件跨存储原子性无法由该同步补偿证明。本迁移保留这一现行语义，不新增恢复日志/分布式事务，不声称修复。拒绝于 beforeEffect 时三类存储都必须零写；通过授权后发生文件错误时，只按现行 provider/preference 回滚边界验收，另观察并如实记录 pin。

这修正上一份报告 `JRT-04` 中“失败后连接状态均不改变”的过强文字：跨 origin/disabled 等在 pin 前就拒绝的输入应零写；首次 pin 成功后的人为文件故障不符合该承诺。

## 停用、撤权、换代与恢复

- 沿用 HomePluginExecutor 的 active flag、Host active、repository.installation_generation、动态 grants；配置客户端必须使用它的 `authorized` context，而不是 start 时拷贝的 grants 数组。
- `revoke()/stop()` 立即让旧 gate 失败；upgrade/reinstall 后旧 definition/client 的 active/generation 拒绝。不能只比较 plugin_id 或可复用 install_id。
- 在 beforeEffect 等待时发生停用/撤权/重装，放行后再检查，无 pin/文件/provider 写入。原 ActionService 的 registration token 检查还防止提供方重注册。
- currentPluginAction 的 AsyncLocalStorage 会流入 timer，不代表调用仍有效；read/save 必须走 beforeEffect，不能仅凭 scope 存在授权。
- 方法不持有数据库连接或后台任务；配置 read/selection 每次打开现行 owner，不需 close 生命周期。重启从同一 preference/file/catalog 读，不自动改格式、不把丢失文件补为默认选择文件。
- #661 的 `enabled` 状态检查与 `connector-connection-views.ts` import 进入唯一通用 owner，不能在参数化时退回旧 base 的 disconnected-only 判断。

## 错误与行为保持

配置权限/停止/过期错误保留 `actions.*` 或 Runtime 的 `plugin.*`，不得全部映射为 jelly.invalid。现有 Connector/ModelProvider 的 owner 错误原样穿透。

从 Jelly 专用实现搬出的明确用户输入/偏好格式错误可以由共享服务用一个明确的 Host owner code 生产，例如 `host.model_configuration_invalid`；Jelly 的设置 adapter 只把这一已知码映射回原 `jelly.invalid`，保留 message/details，其余错误原样抛出。这是保留现有 Jelly 外部错误码的边界翻译，不是历史读取兼容。避免把错误工厂、随意 error owner 字符串或 Host 回调塞进可信目录。

也可让公共服务返回显式配置校验结果再由 Jelly raiser 转错误，但会让 read/save 成功结果形成额外 union；当前 ActionError 路径更小。原 JSON parse/IO 异常如何保持按实际迁移逐项对照，不能对所有 Error 都 catch 成“模型配置错误”。

## 配置事实的 owner：不能只说“Host 代理 IO”

当前证据有两层，不能混为一谈：`docs/system/HOME-DATA.md:212` 把 `jelly/preferences.json` 的实际读写源列为 `apps/local-host/src/jelly-model.ts`；`docs/SSOT-MATRIX.md` 的 Jelly 专节明确插件拥有日历、重复实例、分类、笔记、关联和撤销库，但没有明确写模型偏好文件的领域 owner。Home store registry 的 `jelly` owner 是 Jelly，用于目录隔离、保留与 purge；这并不证明其中每个文件的语义目前都由 Jelly 实现。

本方案应明确采用以下归属，而不是泛称“偏好仍归插件、Host 只做 IO”：

| 事实/职责 | 唯一 owner 与边界 |
| --- | --- |
| 日历、笔记、提案的领域校验、采纳与撤销历史 | Jelly。模型配置服务不能读写这些事实。 |
| “Jelly 消费哪个 provider/model”这项消费者模型绑定、v1 preference 格式、与固定 custom provider 的配置提交 | Host 消费者模型配置服务。它是此类设置的唯一解释者和读写者；消费者身份由可信声明决定。Jelly 不再另解析或写同一文件。 |
| 设置意图的入口、原动作 id/schema/受众/权限、提示文案与何时消费选择 | Jelly；53 项由 Runtime 提供，UI/MCP/工作流仍走 Jelly 动作。入口 owner 不意味着直接写下层配置表。 |
| provider 目录与模型配置 | 既有 Host ModelProviderStore；新服务调用其 API，不再建表或写第二套 SQL。 |
| connection、credential 与 origin pin | 既有 Connector owner；新服务只调用其 API，不拿表的所有权。 |
| 文件的所在目录、备份/保留/purge | 原 Jelly store 命名空间；路径不迁移。配置服务仅被可信声明授予这一个文件，不拥有整个 jelly/。 |

推荐写入唯一 spec/SSOT 的句子：**“消费者模型选择是 Host 模型设置服务按消费者隔离的配置事实；Jelly 拥有设置动作与界面、日历和笔记事实。Jelly 的现行模型绑定继续保存在 jelly/preferences.json，由该服务按可信声明独占读写；此处目录归属控制保留与清理，不授予 Host 访问 Jelly 业务库。服务只支持现行模型选择和固定 custom provider，不是任意插件设置系统。”**

这是必须明确的架构取舍，不能只用“现有逻辑搬家”掩盖。它沿用今天由 Host 实现的模型设置职责，不把插件内容搬到平台；但默认“事实归插件”如何适用于这项配置例外，应由主 Agent 在本次 spec 裁决里写明。决定 #7 对全局模型设置已有同类基础，却不能代替上述 Jelly 绑定归属的明确说明，更不能据此去掉原 MCP/工作流入口。

## 是否应把 preference 的语义与读写交回 Jelly

现在做会更大，且没有现成管理动作可完成余下工作：

1. 当前 `services.files` 只能访问 `store/directory/name`，不能访问 store 根的 preferences.json，也不能 replace；`services.storage` 会搬位置且另生事实。要交回插件必须先增加新的根文件/原子替换合同或明确执行数据搬迁；两者都不是本次的更小路径。
2. 插件可负责 preference JSON 的解析，但 custom provider 仍属于 Host；现有 provider 管理只有受保护 HTTP，没有 plugin consumes 合同。增加 provider upsert 再加文件写，两个异步提交会丢原同步 catalog/file补偿边界。
3. 用一个 Host composite configure 操作同时写 provider 和 preference，实际上回到本设计的消费者配置服务；把后半段刻意再回调插件只会增加事务接口和生命周期边界。

因此上述**Host 消费者模型配置服务唯一拥有绑定语义/读写，Jelly 保留动作和消费入口**的方案机制最少。它不会把 Jelly 的独立选择变成 Host 全局默认，也不迁到共享 KV。相反，如果主 Agent 裁决“模型绑定本身也必须是 Jelly 独占解释和直接读写的事实”，就不应采用本服务后仍标为 Jelly-owned：应选择文件/provider 分离路线，并承认需要更多公共合同及一致性工作。两种归属不可同时声称。

## 最小文件集与必须串行的地方

1. 公共合同：新增 `plugin-model-configuration.ts`，现有 `plugin-model.ts` 添加 configuration 字段/导出；必要的公共 API 快照。无 Manifest 新字段。
2. Runtime gate：新增有限 `model-configuration.ts` + index 出口，复用 action-scope 和现有 gate；没有新 action provider。
3. 可信声明接线：`builtin-plugins.ts` 的 runtime 类型与 Jelly 一项、`home-plugins.ts` 的 entry/restore、`plugin-entry-identity.ts` 的 WeakMap、`home-plugin-executor.ts` 的 getter和注入；新增统一 declaration 检查。它们需主 Agent 串行与其他插件迁移合并。
4. Host owner：`model-configuration.ts` 参数化现有 Jelly 配置代码；`plugin-model-service.ts` 装配可选 configuration；删除 `jelly-model.ts`。不改全局 web-model-settings 的授权或联网检查语义，不复制其另一套保存流程。
5. Jelly：service-actions 的 DTO/异步 ports、plugin.ts 读 selection并使用现有 model服务；删除旧 Host 三函数消费者与旧 provider/HTTP接线按完整迁移收口。共享先固定合同，再由唯一 writer 接插件。
6. 当前配置必跑用例迁到真实 Host/Runtime入口（原 tests/jelly-model.test.ts 正直接 import dist/jelly-model.js，删除文件时要同时切换，不能保假代理只供测试）。为新 P0 加 declaration spoof、settings-only caller、plan-only caller、等待期间撤权/stop/reinstall、失效 timer、输入等待时被修改、真实失败后的文件/provider/pin分别检查。共享全量/构建由统筹安排，此设计未运行。

本方案仍待主 Agent 对“配置声明化 + services.model.configuration”裁决。它不需要用户另外决定把配置改为仅用户 HTTP、不移动现有数据、不授予更宽的模型/连接管理权限；如果要走那些替代方案，才需要重新明确行为范围。
