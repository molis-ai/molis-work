# T116 后续｜Feed 两类跨 owner API 有限映射

负责人：Codex 开发线3。状态：静态接口准备完成，未实施、未运行测试，不是T403独立审验。仅新增本文件；PORT-MAP与作者树/分支未改。绑定本地origin/main **b6f92222fce89dfba756a580768889292cfe9967**（与PORT-MAP相同；末次rev-parse复核），未fetch，不冒称远端最新。

结论：7处真实调用在现行Feed plugin-page身份下均无HTTP许可；5处Functions草稿调用已有准确公开动作，但缺plugin受众、Feed consumes及管理权限，不能直接改成invokeAction就宣称可用。Functions settings没有查到等价公开动作；连接列表有管理动作但同样不接受plugin受众，其插件可用availability动作不返回UI所需账号字段。这是将旧shell闭包搬到opaque frame时的合同缺口，不表示现有shell UI这7处已经运行失败。

## 一行对应一处真实调用

下表“拒绝”均为静态分支判定：假定已建立有效Feed page，走普通x-molis-plugin-page受控请求；不是本轮HTTP动态结果。旧函数api会处理项目URL前缀，后续插件必须由可信route端口生成同项目路径；漏前缀会在路径门更早被拒。

| 真实调用与调用点（apps/workbench/src/scripts/client/） | page HTTP gateway | 现行公开动作、精确输入/输出与元数据 | UI字段核对、缺口与最小owner |
| --- | --- | --- | --- |
| POST `/api/functions`；feed-rule-authoring.ts:106，新建自然语言草稿 | 拒绝；跨Feed own route，registration无pageRequests许可 | `functions.authoring.create@1`，provider=`system.functions`，home，command/operation；input=`{primitive?:"choice"\|"noul"\|"score",name?:string,function_key?:string}`，额外键拒绝；output=`{function:record}`；audience=user/agent/workflow/mcp，permission=`functions:manage` | 现有body `{name,function_key,primitive:"noul"}`可原形传动作。record有id/function_key/status/updated_at，满足保存后继续更新。Feed未consume该id、未声明functions:manage，动作不接受plugin；owner=Functions动作模块+Feed manifest，页面动作调用装配另见下文。function_key用于丢响应后找回，不能换成每次新key。 |
| GET `/api/functions`；同文件:109，仅create失败后恢复同一草稿 | 拒绝，同上 | `functions.authoring.list@1`，同provider/home，query/query，input=`{}`且额外键拒绝，output=`{functions:record[]}`；audience=user/agent/workflow/mcp，permission=`functions:manage` | 同样返回草稿和已发布记录，UI用function_key查找并继续读id/updated_at，结构满足。**不是**`functions.list@1`：后者只列已发布summary，没有草稿/id/updated_at，不能替换恢复逻辑。缺口同上；owner=Functions+Feed。 |
| POST `/api/functions/:id`；同文件:117～124，更新规则 | 拒绝，同上 | `functions.authoring.update@1`，同provider/home，command/operation；input=`{id:string(min1),updated_at?:string(min1)\|null,patch:{...}}`，required=id/patch，额外顶层键拒绝。patch允许name/function_key/instructions/criteria/scene_id/scene_version/scene_provider_id/subject_kinds/scene_map/action_map；本UI实际criteria用`{true_description:string,false_description:string}`，scene_map为string值映射。output=`{function:record}`；audience同上，permission=`functions:manage` | HTTP adapter把body的updated_at抽出，将其余字段包成patch并注入path id；插件调用动作时必须做同样形状转换，不能平铺原body。record满足id/updated_at及后续预览。缺口同上；owner=Functions+Feed，保留读取时updated_at拒绝过期编辑。 |
| GET `/api/functions/settings`；同文件:154，预览前检查模型连接 | 拒绝；不是Feed own route，无pageRequests | **未发现等价公开动作id/schema/audience/provider**。现有Host直接`functionsConnectionStatus(home)`返回contracts类型`JudgmentRuleSettingsStatus={has_credential:boolean,source:"env"\|"ui"\|"none"}`，不是通过动作表调用 | UI只用has_credential决定是否显示“请先连接”并保留输入。精确缺口为可供插件使用的判断服务就绪状态合同；最小owner=Functions（模块合同/状态）与Host Functions装配。不能编造`functions.settings.*`；也不能把connector connected当作Typesafe凭据可用。preview动作已有connection_required availability，可作为根决定是否保留此单独预检的依据；本映射不擅自删调用或更改体验。 |
| POST `/api/functions/:id/preview`；同文件:164，逐sample试跑 | 拒绝，同上 | `functions.authoring.preview@1`，system.functions/home，command/operation，concurrent、metered；input=`{id:string(min1),updated_at?:string(min1)\|null,input:string(min1,max8000)}`，required=id/input，额外键拒绝；output=`{function:record}`；audience=user/agent/workflow/mcp，permissions=`functions:manage`+`functions:invoke` | UI body加path id即可。UI读record.last_preview.outcome、noul，并更新updated_at；TS record和生产service.preview写入这些值，语义匹配。**动作output JSON schema仅把last_preview约束成object或null，未逐字段约束outcome/noul**；只能说当前实现满足，不能说schema已严格保证嵌套字段。Feed有functions:invoke但缺manage/consumes/plugin受众。owner=Functions+Feed。不得用只调用已发布规则的functions.invoke替换草稿试跑或丢失保存预览语义。 |
| POST `/api/functions/:id/publish`；同文件:194，保存启用前发布 | 拒绝，同上 | `functions.authoring.publish@1`，system.functions/home，command/operation；input=`{id:string(min1),updated_at?:string(min1)\|null}`，required=id，额外键拒绝；output=`{function:record}`；audience=user/agent/workflow/mcp，permission=`functions:manage` | UI需status/function_key/version，record均有，version的schema允许null但publish生产路径发布后给版本；不能只靠宽schema断言成功发布。UI随后生成`functions.published.<function_key>`、version、system.functions并写Feed自己的out-rules，此后段不是额外跨owner HTTP调用，本表不扩映射。缺口同上；owner=Functions+Feed，保留原updated_at/已预览校验/晚响应及重试意图。 |
| GET `/api/settings/connectors/connections?service_id=<region.dataset.feedConnectionService>`；navigation-feed-sources.ts:100 | 拒绝；pathname为`/api/settings/connectors/connections`，query不扩大gateway权限；不是Feed own route，无pageRequests | `connectors.connections.read@1`，provider=`system.connectors`，home，query/query，effect=read；input=`{service_id?:string(pattern ^[a-z0-9-]{1,100}$)}`、额外键拒绝；audience=user/agent/mcp（无plugin/workflow），permission=`connectors:management:read`；output schema仅`{type:"object"}`，TS返回`{connections:ManagedConnectorView[]}` | 现行HTTP有BoundActionClient时直接调此动作，否则listConnectorConnectionViews。普通服务连接实际返回connection_id/state/account_label/display_name/auth_method，满足UI的value、标签和三态文字；typed ConnectorConnectionView也含这五字段，但宽output schema未保证数组/字段。Feed缺该consume与管理读权限。已有plugin受众`connectors.connection.availability@1`只收connection_id、回`{connection_id,available}`，不能列账号/服务/标签，绝非此列表替代。最小owner=Connector管理/选择合同+Feed；是否向插件提供受限服务账号选择视图须根冻结，不能直接扩大管理读权限或HTTP allowlist。 |

`record`为modules/functions/src/authoring-actions.ts:23～30的recordSchema：required含id/name/function_key/instructions/criteria/scene_id/subject_kinds/scene_map/status/primitive/version/model/config_hash/last_preview/samples/published_at/created_at/updated_at。id minLength1；status=draft|published；version=integer>=1|null；last_preview=object|null。patch的criteria为三个现行分支（string[]、非空key/description对象数组、true_description/false_description对象），本UI只用最后一种。schema描述与真实生产写入分别核，不声称动态验证。

## 共同的两层拒绝与当前装配边界

1. **HTTP层**：`apps/workbench/src/browser/plugin-frame/fetch.ts:72～85`仅转同origin受控fetch，parent自己设置x-molis-plugin-page。`apps/local-host/src/web-server.ts:152`在route前调用page authority bind。`plugin-page-authority.ts:143～180`核当前page/项目API前缀，然后只放行own manifest route、少数具名Host入口或activation.requestAllowed；这7处均不命中。`plugin-page-routes.ts`只认完整method/path对，忽略URL query不意味着任意路径可用。
2. **Feed现行声明**：`plugins/native/feed/src/registration.ts`的workbench没有pageRequests；manifest.capabilities.consumes唯一项为`GOAL_CONTRACT.capability_id`，在runtime-actions.ts定义为`goals.contract.read`；permissions.ts没有functions:manage或connectors:management:read（functions:invoke确实存在）。不能把已有actions:invoke、actions:delegate、connections:use或连接观察权限当上述管理权。
3. **动作层**：`plugin-page-actions.ts:26～48`先要求own或consume，跨ownercaller audience明确为plugin，使用context.grants并逐permission requireGrant。五个Functions管理动作和Connector列表即使只补consumes仍不满足audience/权限。`modules/functions/src/actions.ts:84～90`和`apps/local-host/src/connector-account-actions.ts:105～118`证明各provider真实注册，不是只定义没装配；host-actions.tsv的同id/version/provider/audience行与源码一致。settings等价动作在Functions动作定义、Host装配及快照中未发现，故不命名。
4. **不能偷换成现成native page调用能力**：`plugin-page-http.ts`registered fallback仅在entry.workbench.pageRequests且有project时构造；该fallback含requestAllowed而没有invoke。Feed当前也没有该pageRequests或插件clientFactory。因而这里是“未来Feed有效frame按当前gateway会如何判”的静态映射，不签当前Feed已有可用page action activation，更不能以添加一个consume推断整条通路已可用。后续实际挂载选择沿最终T402/T403装配确认；若需native registration到现成page action客户端的接线，最小owner是通用Plugin page装配，禁止Feed特例或假造user audience。

## 最小接续边界与证据位置

根需逐项冻结：Functions现有authoring动作如何向合法插件调用者授权（受众、权限与所需owner边界），settings就绪状态是否有最小公开合同或依现有preview失败呈现，Connector是否给出受限账号选择合同，以及native frame如何获得真实动作activation。这里只列缺口，不批准新增动作、放宽gateway、修改audience/权限或另建owner代理；不提供新id候选。

主要生产依据（全部从绑定H读取）：

- `apps/workbench/src/scripts/client/feed-rule-authoring.ts:96～125,154～168,189～196`；`navigation-feed-sources.ts:91～124`。
- `apps/local-host/src/functions-http.ts:22～32`；`functions-http/routes.ts:38～47`；`functions-http/route-handlers.ts:14～30`。
- `modules/functions/src/authoring-actions.ts:7～53,94～111`；`modules/functions/src/service.ts:139～158`；`apps/local-host/src/functions-host.ts:87～90`。
- `apps/local-host/src/web-connector-connections.ts:39～43`；`connector-management-actions.ts:21～35,79～85`；`connector-connection-views.ts:7～18`；`packages/contracts/src/services/connector-host.ts:274～282`。

补充界限：原调用只有POST `/:id`，没有GET `/:id`；Host虽存在GET `/:id`→functions.authoring.get@1，本表不把未发生调用算作第8处。Functions公开目录functions.list/describe/invoke也不是这些管理操作的替代。当前默认schema未严格承诺的嵌套输出已单列，未为了填表编造保证。

本轮只读Git对象并写本临时映射，没有测试/build/浏览器/模型、fetch、refs、源码、作者树、coord或GH写入；不改变T116主链等待/实施授权和后续作者归属。
