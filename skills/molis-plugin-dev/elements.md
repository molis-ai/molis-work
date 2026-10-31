# 插件要素词典

Manifest 定义在 `packages/contracts/src/platform/plugin-manifest.ts`，仍从 `@molis-ai/molis-work-contracts/platform/plugin` 导入。用不到的块省略。声明了就必须兑现。

## 身份

- `schema_version`：产品插件用 `2`（ports、events、views、routes、agent、actions）。CLI 样例脚手架仍可能生成 `1`。
- `host_api_version`：与 schema 对齐，产品用 `2`。
- `plugin_id`：反向域名，如 `io.molis.work.feed`。
- `*_PROJECT_PLUGIN_ID`：项目库短名（`feed`）。和全球 id 不是同一个字段。
- `name`、`version`：给人看的名字；代码变化必须自己递增 version。同一 `plugin_id + version + signature` 的 Manifest 不能静默改内容。升级来源要通过 `upgrade_compatibility` 精确声明。
- `publisher.signature` 变了 = 新身份，旧 grant 不继承。
- `entrypoints[]`：`deployment: "local" | "server"` + `entrypoint` 路径。一等插件常用 `./index.js`。
- `kind`：`native` | `app` | `integration`。选贡献形态，不是信任等级。
- `always_on`（schema 2）：常开插件，每个项目都开着、不进插件列表与市场，服务端拒绝把它从项目移除、停用、卸载。它生不生效看同意账本里有没有一行有效同意（见下文「装的时候用户会被问哪些声明」），不看插件从哪来：随宿主发布的插件由宿主代为同意，其他插件要本人同意，本人撤回后它就是普通插件。声明本身不会被安装拒绝，写了没人同意就不生效，所以别让插件的基本功能依赖「一定常开」。外部装的常开插件现在只有卸载拒绝，进项目成员列表随安装服务（ac-trust T2）。

## 版本升级

`upgrade_compatibility` 不是版本范围或自动升级开关，而是目标发布对精确旧版本的声明：

- `compatible_from_versions`：新代码可直接读写该版本的私人数据，并沿用旧 grant。项目重启可用兼容实现恢复，但已安装版本只在用户手动升级后更新。同版本修正文档可列出当前版本以继续运行，但不会改变安装指纹或显示成升级。
- `migratable_from_versions`：允许用户手动升级；目标定义还必须实现 `validateUpgrade({ from, context })`，通过只读 `get` 检查现有私人数据。Host 不执行数据迁移；预检通过后，目标实现直接使用已有格式。需要转换格式的插件目前不受此协议支持。
- 来源必须是精确 SemVer；较高版本的来源必须早于当前 `version`，只有 `compatible_from_versions` 可列出与 Manifest 相同的版本。未声明的来源不能升级；升级不能降低版本。
- Runtime 检查目标 Manifest 保留全部旧 grant 和必需权限，不会自动授予新权限。相同身份的普通安装仍要求指纹一致；同版本不同 Manifest 只有明确兼容声明才可用于继续运行，存储的版本与指纹保持不变。
- `validateUpgrade` 收到旧安装记录和受限上下文；只有目标 Manifest 声明且旧安装已授予的 `storage:private.get` 可用，不暴露其他服务。校验失败时旧安装记录、grant 和存储仍留在原位。

内置插件（监督器条目 `trust: HOST_BUILD_TRUST`）不用这些声明：它随宿主版本升级，安装记录跟着提升。授权和其他插件同一规则：必需的总有，可选的按人留下的给，人关掉的可选权限升级后仍关着（项目设置的插件页对每项可选权限有开关，只有本人能开关，关掉立即生效、插件重启一次）；新 Manifest 不再声明的去掉，新声明的可选权限像新装一样默认打开（全新安装时可选的都默认打开）。所以给内置插件加一项可选权限，已装的人升级后就有；关了它，只是用到它的动作不可用。

完整流程和 Manifest 片段见[本地 Plugin 开发·版本升级](../../docs/platform/PLUGIN-DEVELOPMENT.md#插件版本升级)。

## 权限与能力

`permissions[]`：`permission` + `required` + `reason`。真权限 = Host grant ∩ Manifest 上限。常见：

| permission | 何时 |
| --- | --- |
| `storage:private` | 本机私人库、计数、草稿 |
| `artifact:read` / `artifact:write` | 按类型读写 Artifact |
| `ui:register` | 样例注册 UI（CLI 脚手架） |
| `network:<host>` | 访问该主机 |
| `secret:<name>` | 凭据引用，不要自己存可导出密钥 |

`requires[]`：`capability_id`、`version`、`reason`。可选的写 `optional: true`。每一条的 `capability_id` 必须同时出现在 `capabilities.consumes`，否则解析拒绝。消费判断用 `action_scenes`，不声明 `functions.evaluate`（Feed、Inbox 都已不声明）。

`capabilities.provides` 是契约 id，不是别的插件包名。不带 `@` 时版本按 1：`functions.evaluate` 对得上 requires 里的 version 1；`functions.evaluate.v1` 是另一个 id。`consumes` 写不带版本的 id。Kernel 里任意满足者都可以。必需项没有提供者、依赖成环、或依赖的插件被挡住，才不激活。

经 `context.services.actions.invoke` 调的动作，必须列在 `capabilities.consumes` 里；它可以是宿主的，也可以是别的插件的（用户 2026-10-14 定）。宿主以插件受众、本插件自己的授权去调，提供方固定为项目目录里唯一的那一个；没列出的是 `actions.forbidden`，缺授权的是 `plugin.grant_denied`，目录里没有或不止一个提供方的是 `actions.dependency_missing` / `actions.provider_ambiguous`。只对 `user` 开放、声明了 `plugin: false` 或不可撤销的动作，插件受众够不到。要像工作流那样替原调用者调目录里的动作、不事先列出，声明权限 `actions:delegate` 用 `services.actions.directory`（写法与限制见 `host.md` 的「动作目录委托」，S-43）。

## 装的时候用户会被问哪些声明

Manifest 里有三类声明会改变插件在别处的效果，安装预览把它们单列，用户逐项同意或拒绝：

| 声明 | 用户同意的是 | 拒绝后 |
| --- | --- | --- |
| `always_on: true` | 每个项目都开、删不掉 | 它是普通插件 |
| `ports.inputs[].default_source` | 「端口 X 默认读取某插件的某输出口」，每条一项，带来源插件当时的发布者签名 | 不绑，输入口等人自己连 |
| `ports.input_groups[].default` | 默认用这一组输入 | 不默认 |

写的时候记住：

- 随宿主发布的插件（监督器条目 `trust: HOST_BUILD_TRUST`）由宿主代为同意，不弹窗；其他等级（发布者已固定的包、没有发布者的创作台产物）必须显式同意，没有「全部允许」。
- 拒绝一项不阻止安装，所以被拒时插件仍要能用：别把核心流程建立在默认连线或常开上，输入口要能手动连。
- 同意是账本里的一行，带同意时的 Manifest 摘要和发布者签名。新版本多一条默认连线就是新的一项，要新的同意；`publisher.signature` 变了是新身份，旧同意不继承；来源插件换了发布者，默认连线的同意对不上，不绑。
- 本人随时可以撤回，各等级一样（包括 `host` 等级的），撤回立即生效，之后宿主也不再为随它发布的插件代为同意。同意与撤回只有本人能做：agent、MCP、工作流、别的插件都调不到。
- 预览显示的是声明本身（端口名、来源插件名），不是你另写的说明，所以端口名和插件 `name` 要让人看得懂。

## 个人 vs 项目

插件 `registration`（各包 `src/registration.ts`）的 `personal: true`：每个项目都可用，不进项目启用列表。今天（`BUILTIN_PLUGIN_CATALOG`，由各包的 `registration` 生成）：Cognia、插件创作台、Images、Jelly、Shelf、灵光、Todo、Pages、Forms、Dataset、PPT、Alchemist、Workflows、Issues。

其余按项目启用。必选输入口会拉上能产出该类型的同伴插件；可选取消口（Diff）不拉同伴。Feed 启用会带上 Inbox（Feed `registration` 上的 `companions`）。

市场卡片要同时有 catalog 的 `summary` 和一个 `navigator` 或 `island` 视图；没有这两种视图、页面只放在设置里的插件不进内建市场（Characters 是宿主的一节设置，不是插件，不在市场里）。

## UI

- `ui.contributions`：contribution id 列表。
- `ui.views`：`view_id`、`slot`、`title`、`contribution_id`、`icon`（限平台图标集，集合外的名字 Manifest 读取即被拒）、`order`。可选 `accepts_objects`：这个插件的标签能按 id 打开一个对象，插件收 `molis-work:select-item`。当前搜索、放置卡和侧栏文件的对象标签名单由构建期插件目录派生；动态安装插件的运行时 Manifest 尚未接入这份名单（BL-388），声明字段本身仍适用。不声明的，命中打开插件页，有 `searchRow` 的再点那一行。
- **槽（合同五选一）**：`navigator` 一级入口（底栏插件切换与 Dock）、`stage` 工作区工具面、`settings` 全局设置目录、`island` 底栏右侧的个人常驻入口（项目圆钮旁）、`side` 侧栏里的一个标签（见 [ui.md](ui.md#侧栏标签side)）。不要发明第六个。
- 没有 `ui.commands`：界面命令没有一处调用，已取消（BL-363），Manifest 写了会被拒。
- 贡献 descriptor 的 HTML Slot：`workbench.directory` / `workbench.main` / `workbench.overlay` / `workbench.settings` / `workbench.side`。`settings-page` 只能挂 settings。
- `kind`：`primary-page` | `embedded` | `overlay` | `settings-page`。

构建期 Native（冻结名单）：Host 注入 HTML primitives。  
经 Plugin Runtime 启动的插件（`app`，以及 Shelf 这样的 `native`）：`start()` 返回的 `views` 必须覆盖 Manifest 每一条，否则启动失败。

## HTTP

两条路径，不要抄错：

1. **Manifest `routes`（第三方插件与新的内置插件）**：`routes[]`（`route_id`、method、`path` 带 `:name`）。Host 挂 `/api/plugins/<plugin_id>/`，处理器用 `bindPluginActionRoute` 转调动作。未声明路径到不了插件。经 Plugin Runtime 启动的插件必须兑现每条 `routes[].handle`；请求体默认最多读 256 000 字节（Home 级实例的路由默认 12 MiB），某条路由要收更大的内容（如导入文件）就声明 `max_body_bytes`（至多 45 000 000 字节，`packages/plugin-sdk/src/manifest.ts` 的 `MAX_ROUTE_BODY_BYTES`，超过的 Manifest 解析时被拒）。
2. **构建期 Native（冻结，只许减少）**：Host 文件把短名接到产品 API（`/api/alchemist`），由 `*-native-plugin-http.ts` 调用（Inbox、Feed 已迁走，路由写在各自的 Manifest `routes` 里，挂在 `/api/plugins/<plugin_id>/` 下）。新的内置插件不走这条，走第 1 条。`project_id` 由 Host 从当前项目注入，不要从 body / MCP schema 收。

写操作要 revision / 幂等；冲突可恢复。handler 用注入的 Module/端口，不 import 别的插件实现。

## actions / action_scenes

新插件通过 `actions` 提供查询、判断或操作，通过 `action_scenes` 贡献真实消费入口。不能仅写一个场景标签或让 Host 增加判断去向枚举。定义和公开类型在 contracts/platform/actions，SDK 的 `defineAction` 用同一份定义生成 manifest 与 handler 引用。

- 动作：身份与版本、名称、输入输出、语义类型、权限、作用域、允许入口。`required_scene` 可声明触发入口依赖的已启用判断绑定。
- 场景：事件触发、对象种类、提供的输入和接受的结果、作用域与权限。`event_schema` 和 `prepare` 将业务事件转换为函数上下文；私有 `state` 留给消费方。
- 兑现：运行实例提供 `bindings`、`bind`、`consume`；需要时提供 `prepare` 和 `failed`。绑定数据保留在原业务 owner。消费前核对业务对象；共同内核负责绑定修订、提供方实例和权限重查。
- 发现：Host 场景客户端根据注册合同判断兼容性，并从真实绑定反查使用位置。新场景无需更新 Host ID 名单。完整系统管理 UI 与部分旧编辑器尚在迁移，不能把注册成功等同于所有产品入口完成。

Manifest 里没有 `behaviors`、`function_scenes`、`judgment_subjects`（2026-10 删除）。可调用能力用 `actions`，消费判断用 `action_scenes`；Home、Inbox、Feed 的判断都已走共同场景。详情见 [Host 接线](host.md#接到统一判断场景) 和 [开发手册](../../docs/platform/PLUGIN-DEVELOPMENT.md#统一动作与消费场景)。

## MCP（对外贡献）

方向：人/Agent → 本插件。插件对外的能力就是它声明的 `actions`：动作的 `audiences` 含 `mcp`，用户在「能力 → 对外接入」为某个客户端授权后，它就是 MCP 工具 `molis_work_v1_action_<动作>__v<版本>`。不另外登记 MCP 工具，没有按名称的开关。

- 动作输入只放业务字段；`project_id`、数据库路径、Web 地址、操作者身份都由 Host 注入。
- 个人、不绑项目也能用的动作用 `scope: "home"`；个人插件但按项目分区（Pages / Forms / Dataset / PPT）用 `scope: "project"`，`project_id` 由 Host 注入。

`agent.mcp` 是反方向：插件里的 Agent 能不能调**外面**的 MCP。



## Artifacts / ports

- 成果库是平台界面与动作服务，不是可启停插件，也不能登记 `artifacts` 项目键或平台成果界面 id。提供方 `io.molis.work.artifacts` 及既有能力引用不变；插件用同一套 SDK 动作读写成果，不依赖成果 UI 实现。
- `artifacts.produces/consumes`：成果，人要留存、引用的固定版本，进成果库。`artifact_type_id` + `schema_version`。消费方按类型匹配，不指定生产者插件。
- 每种 `artifacts.produces` 写 `title`（显示名，如「文档」）与 `preview`（用 `defineArtifactPreviewAction` 定义、`bindArtifactPreview` 绑定的动作：只把这一版的 payload 转成 Markdown、CSV、文本或位图，不读存储）。工作对象能当场固定成一版的（Goal 收尾时交付），再写 `pin`：用 `defineArtifactPinAction(id, 对象种类, 显示名, 权限)` 定义，输入 `{subject_id}`，输出 `{artifact, recovered}`，内部就是你的「存为成果」；每种对象至多一个 owner；能当场固定的类型还要写 `compare`（`defineArtifactCompareAction` + `bindArtifactCompare`：读自己的对象、只比内容字段，答 same、changed、moved、missing（对象不在这个项目里时，`bindArtifactCompare` 的第五个参数告诉成果库它是否还在别处：移走不是删除），成果库据此提示「原对象之后改过了」「原对象已移到别处」）。能从某个成果类型的一版新建自己的对象的插件，在那个类型上写 `continue`（`defineArtifactContinueAction` + `bindArtifactContinue`，自己生产的写在 `produces`，只读取的写在 `consumes`），成果库给出「在 X 继续」；没有「继续」的类型要在门禁的例外名单里写明理由。门禁 `tests/artifact-type-gate.test.ts`。
- 自己的对象能链接到成果库里的某一版（文档正文里的版本链接）的，加一个 `defineArtifactReferrersAction(id, 对象显示名, 读权限)` 查询：输入 `{reference}`，返回链接到这一版的对象（`subject`、`title`、`open`）。正文里认链接用 `linksToArtifactVersion(body, reference)`。成果详情的「被谁引用」按协议问每个声明了它的插件，不写名单（例：`pages.artifacts.referrers`）。
- 在 Manifest `artifacts.links` 里声明了链接种类（自己的对象把某一版记为输入或产出，边写进上下文关联）的，再加一个 `defineArtifactLinkSubjectsAction(id, 对象显示名, 读权限)` 查询：输入 `{ids}`，返回这些 id 里现在还在、调用者读得到的对象（`id`、`title`、`open`），读不到的不返回（一个读不到的 id 不能让整批失败）；一次最多 200 个 id，`open` 只能指向你自己的 surface。受众由这个函数定成与 `artifacts.links` 相同，因为它以那个调用者的身份被问。「被谁引用」把你的对象列在你的插件名下，名字和打开位置就从这里来；没有这个动作，你的对象只显示 id（例：`goals.artifacts.link_subjects`）。
- `process_items.produces/consumes`：过程项，插件之间交换的数据（快照、变更集、回执），记在生产插件名下，不进成果库、侧栏文件和搜索。一种类型要么是成果、要么是过程项。端口发布一律记成过程项；直接记用 `services.processItems.record`。
- **新类型先写合同**（如 `packages/contracts/src/modules/workspace-artifacts.ts` 或该插件的 `modules/<id>.ts`），再声明 `produces`。只写端口、合同里没有这个类型，连不上。
- `ports.inputs/outputs`：按 Artifact 类型连接，不指定生产者插件。声明输出口必须同时 `artifact:write` 且类型在 `process_items.produces`（或固定后再选择的成果在 `artifacts.produces`）。输入同理 `artifact:read` + `consumes`。
- 输入口默认必选。项目启用时会拉上能产出该类型的同伴插件；可选取消口（Diff）不拉同伴。不会永远有生产者就不要声明必选入口。
- 缺绑定仍然可以 `start`。状态是 `missing`，Host 不会调用 `onUpstreamReady`。整份构建里没有产出者时，解析只记 `port_type_unsatisfiable`，插件不因此进 `blocked`。挡住启动的是必需 Capability、依赖成环，或依赖的插件被挡住。
- 产品里没有通用连线页：输入口由默认连线（下一条）接上，或由人在成果库详情把某一版接给插件输入（`artifacts.plugin_inputs.bind`，只对人开放）。`PluginWiringApi.bind` / `selectInputGroup` 在 Runtime 里。Local Host 没有挂 `/api/plugins/:id/ports`。
- 默认连线由消费方自己的 Manifest 声明：输入口写 `default_source: { plugin_id, port }`（另一个插件的输出口，类型必须相同），有输入组的写一个 `default: true` 的组（至多一个）。宿主在两个插件都在项目里运行、这个口什么也没读时接上（`apps/local-host/src/plugin-default-bindings.ts`），人选过的来源或固定成果版本不被覆盖；来源插件不在、没有那个口或类型不同就不接。没有名单可加（W4-03，原 D-04）。**要有同意才接上**（ac-trust T4，S-X3）：默认连线与默认组只在 Home 的同意账本里有这个插件的发布者一行未撤回的同意时生效，宿主为随它发布的插件代为同意（只同意从同样随宿主发布的来源读），其余插件由装的人在安装确认里同意；同意带来源插件此刻的发布者签名，后来占了同一个 `plugin_id` 的别家插件不会被默认读取。没有同意，写了 `default_source` 或默认组也不会自动接上，输入口由人接。撤回同意会解开它绑出的默认连线，人选的来源不动。
- 输出口：`services.outputs.publish`、`invalidate(port, 给人看的原因)`、`retain(引用)`。同一轮输入是否算一组，由 Host 创建 client 时附上 `scope_key`。`publish` 参数里没有这个字段。
- `input_groups`：组之间换着用；选中的那一组端口生效，其余不绑也不算失败。
- 完整输入一次送达 `onUpstreamReady`；失效走 `onUpstreamUnavailable`。Host 不投递半套。
- 输入状态的 `missing.reason` 区分未选择和已失效，界面保留 waiting/unavailable 的语义。输入通知刷新当前投影，不是一次性业务命令。`onUpstreamReady(inputs, context)` 接到可用且未归档的固定版本；异步读取后、更新投影前调用 `context.beforeEffect()`，并把 `context.signal` 传给可取消操作。Host 从已提交的领域 journal 发现失效/归档并重算既有输入图。新实例重新读取当前输入，不能把重启通知当作再次执行外部操作的授权。

## 插件事件总线（不是判断场景）

三件都叫「事件」，别混：

| 叫法 | 是什么 | 给谁 |
| --- | --- | --- |
| 判断场景 | 首页 / Inbox / Feed 上判断亮哪颗按钮 | `action_scenes` |
| 插件事件总线 | 插件之间打招呼 | Manifest `events` + `onEvent` |
| Integration Signal | 外部世界进来的消息 | Connector → Feed Item |

总线规则：

- `events.publishes` / `subscribes`。订阅必须列出 `from_plugin_ids`。来源没装只是不匹配，不算激活失败。宿主事件（`host.review.settled@1`、`host.workspace.changed@1`）例外：不写来源，不落库；前者只投给发起审查的那个安装，后者广播给声明并持有 `workspace:read` 的订阅者，写法见 `host.md`。
- 正文上限 16 KiB。更大的走 Artifact 引用。
- 禁止发布 `molis.` / `host.` 命名空间的事件；订阅只能订宿主登记过的那几种。
- **事件 id 放合同**，不放发布者插件包。Coding 的 `file-changed` 在 `workspace-artifacts` 合同里，Files 只点名 id，不 import Coding 实现。
- `PluginDefinition.event_types` 的 `validate` 必须覆盖自己 publishes 的每一种；Host 只存校验通过的。
- 发布：`context.services.events.publish({ event_type_id, type_version, payload })`。没声明 publishes 就没有 `services.events`。
- 接收：`start()` 返回的 contribution 上写 `onEvent(event, delivery)`（Files/Git 用来刷工作区）。使用订阅安装自己的身份及 `delivery.signal`，每次异步等待后、写入前调用 `delivery.beforeEffect()`；传给 Host 端口时继续传该控制，不能长期保留原发布 Action 的临时授权。
- 落项目库，按 (订阅者, 来源) 串行，游标绑定 install_id 与安装世代。同一安装重启续接未派出的工作，重装建立新订阅，不继承旧游标或重放历史。
- 处理前持久记录 delivering，确认前重查实例、版本和订阅。处理器已开始但崩溃或被撤销，结果未知则隔离，不能自动重试；启动失败且没有派出处理器时可以恢复。普通处理器异常记录后不自动重投，不能声称任意副作用 exactly-once。Host 关闭先 `await events.close()` 再关闭数据库。
- 隔离事件由人从项目「插件 → 待核对的插件通知」核对，填写依据后明确 retry/skip。插件不能给自己恢复，普通启用不能补权。所见 revision、首条事件、安装世代与版本必须保持一致，决定及历史同事务保存；不替换原安装，不跳过后续事件。重试存在重复副作用的可能，必须在确认中说明。

**总线只在 Plugin Runtime（`createPluginPlatform`）启动的插件里跑**：登记上有 `project_runtime` 或 `runtime` 的内置插件，以及已安装插件。Feed、Inbox 这类冻结名单里的构建期 Native 没有；给它们抄 Coding 的 `events:` 块，运行时不会投递。

对照：Files 订阅 Coding/Git 的文件变更；Coding 发布 file-changed / workspace-invalidated。

## agent 块

仅 Agent 驱动才需要。至少有一个角色。`execution`：`read-only` | `text-edit` | `workspace-write`，省略等于只读，启动后不能自己放宽。

每个角色写 `role_id`、`version`、`name`，用 `prompts` 点名自己的提示词，用 `host_tools` 点名能叫的 Host 工具。不写 `prompts` 时，运行组合会把本插件声明的全部提示词交给这个角色；解析器同时要求有一条与 `role_id` 同名的 Prompt，否则 Manifest 无效。只读角色点名自己的那几条。

一个插件有几种用途（规划、执行、讨论……）时，每种用途是一个角色。角色可以写 `skills: { allowed: [...], default: [...] }`：`allowed` 是这个用途能挑的方法（只能点名 agent 块 `skills` 里声明过的），`default` 是这个用途默认选上的（必须在 `allowed` 里，用户可以去掉）。每个可选方法要的 `tools` 都必须在角色的 `host_tools` 里，否则 Manifest 无效：给不了工具的方法不该出现在这个用途里。现在只有解析 Manifest 时的这些检查：宿主开新一轮时还不按 `default` 选上，也不拒绝 `allowed` 之外的方法，要等宿主那一片（#576 的后续 PR）合入后，宿主开轮时才按它选上；在那之前写了不生效。不需要按用途分方法就不写。

提示词层级是 `base` | `role` | `project`，省略等于 `role`。`task` 是用户这一次写的，插件声明会被拒绝。提示词正文放在 `PluginDefinition.agent_prompts`，Skill 正文放在 `PluginDefinition.agent_skills`，不进 Manifest；Manifest 声明的每段 Prompt、`compaction` 与 `ending_review` 都要在 `agent_prompts` 里有正文，否则开跑时角色是空的。运行中的非沙箱插件由 Host 从 Manifest 的 `agent` 与定义的正文登记（内置与安装的插件同一条路，PG-051），停下后按「未运行」留在设置里，作者不必再另接一份 catalog。沙箱插件的登记尚待 PG-017。正文与缺失检查见 [authoring.md](authoring.md#sdk)。

`subagent_workspaces: "required"` 只放在只读父角色上（Coding 的协调者、并行写入）。工作目录是 Host 事实，候选通过 `projectSettingsCapabilities.workspaces` 读取。`directory_input_port` 不会让 Host 采信目录。

今天三例：`plugins/native/coding`（kind `app`），以及 `plugins/native/schedule`、`plugins/native/todo`（kind `native`）。不要把 Coding 的 agent 块抄到普通内容插件。合同里还有 `compaction`、`ending_review`、`text_sources`、`skills`，只有 Coding 用了 `compaction`、`ending_review` 与 `skills`，先不要写成必填。`ending_review` 指向自己 `prompts` 里的一条：可写的一轮没有成功的改动就要结束时，宿主用它对照这一轮的事实核对最后的话（用户能在「设置 › 提示词」的「收尾核对」下改）；不声明就不核对。

## Integration

`kind: "integration"`。`definePollingIntegrationPlugin`：Manifest + `createProvider(context, binding)` → 每个来源一对 Connector Driver + Signal Adapter；Manifest 的 `connection_services`、`integrations` 声明它的服务与用途。Host 只看 Contract 和 Receipt。细节：[integrations.md](integrations.md)。

## 当前项目设置能力

从 `contracts/modules/projects` 导入 `projectSettingsCapabilities`：`workspaces` 返回当前项目已关联目录，`browsingWorkspace` 返回 Files/Git 的当前浏览目录或 null。逐项将完整 `capability_id` 写入 Manifest consumes，然后调用 `invoke(capability, [])`。不可传 project_id，不支持 key 袋或通配读取。Host 裁剪其他项目关联字段。工作目录在项目设置中维护，不再接 Workspace 输出。Coding 会话执行目录独立；`projects.workspace.read.v1` 返回项目的首选工作区，Coding 在没有浏览目录时用它。

`settings` 槽只放页面，不给其他插件读权；`storage:private` 只存自己的偏好。项目说明仍属 Goals。归属与例子见 `docs/platform/PROJECT-SETTINGS.md`。

生产事件要从事实 owner 的提交或回执接出，不能从审批通过或一次历史查询推断新执行。Coding `run-updated`、Git `operation-updated` 是刷新提示，包含失败/未知状态；不冒充旧的 review 失效或 file-changed 协议。Host 按项目和 activation 装配、停止时注销；提示到 Files/Git 后只失效视图 revision。可靠业务副作用仍需要自己的提交一致性，不能由 UI revision 冒充持久 outbox。
