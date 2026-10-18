# Images Runtime 公共端口设计候选

状态：2026-10-17，只读证据上的设计稿，待主会话裁决；不是已接受 spec 或已实现接口。基点 `wt-model-selection@e8925f8ea`；连接实现核对 `#661@9d94e5eb5c87dc6271c998d0163cd2f2adf64e57`。不含构建/测试/真实 Home 验证。

## 裁决建议

采用一个专用 `services.imageGeneration`，不改变现行文字 `services.model.complete` 的模型目录、InstructedPrompt 和显式 selection 合同。图片服务只承接现行 `image-api` 连接与 OpenAI Images/Gemini 生成，不提供任意 connector API、URL fetch、secret 读取、调度或业务任务。内部连接读写仍归 ConnectorConnectionStore，推理仍经 agent-host 的 PrologueInferenceClient.generateImages。

不推荐把图片塞进 `PluginModelClient.complete`：文字 selection 指向 Host 配置目录、图片却由 Images 保存协议/地址/模型；文字 prompt 是注册指令，图片是用户明确提交的画面描述。合成同一个请求会增加不必要的联合类型和默认回退规则。也不先建通用 PluginConnectionsClient：当前只有图片需要这一组新端口。

## 最小公开类型

拟新增 `packages/contracts/src/platform/plugin-image-generation.ts`，从 `platform/plugin.ts` 导出并在 PluginHostServices 添加可选字段；明确从升级预检 Partial services 排除。下列类型为建议名，不代表现有 API。

```ts
import type { ConnectorConnectionView } from "../services/connector-host.js";

export interface PluginImageTarget {
  readonly slot_id: string; // Images 配置 id；身份/namespace 不来自这里
  readonly base_url: string;
}
export interface PluginImageConnectionState {
  readonly connection_id: string | null;
  readonly available: boolean;
  readonly has_key: boolean;
  readonly reason?: string;
  /** 仅作并发前提；不包含凭据、密文或 secret reference。 */
  readonly revision: string;
}
export interface PluginImageGenerationRequest extends PluginImageTarget {
  readonly expected_revision: string;
  readonly protocol: "openai-images" | "gemini";
  readonly model: string;
  readonly prompt: string;
  readonly size?: string;
  readonly aspect_ratio?: string;
}
export interface PluginImageGenerationClient {
  /** 返回 image-api 的现行安全视图，不探测厂商，不返回 secret。 */
  connections(): readonly ConnectorConnectionView[];
  /** 只读状态，保留失效绑定的 connection_id，不隐式绑定地址。 */
  inspect(target: PluginImageTarget): PluginImageConnectionState;
  /** 当前动作授权后校验 image-api、enabled、凭据可用及目标，然后沿用原绑定。 */
  bind(target: PluginImageTarget, connection_id: string): Promise<void>;
  /** 只删本 owner 的这一 slot；不会删除账号或密钥。 */
  unbind(slot_id: string): Promise<void>;
  /** 返回原始推理字节；图片格式识别/领域记录仍归 Images。 */
  generate(request: PluginImageGenerationRequest,
    options?: { readonly signal?: AbortSignal }): Promise<readonly {
      readonly bytes: Uint8Array; readonly mime?: string;
    }[]>;
}

/** 可信 bundled 启动条目，不是 Manifest/业务输入。 */
export interface PluginImageGenerationDeclaration {
  readonly store_name: string;
  readonly read_permission: string;
  readonly write_permission: string;
  readonly generate_permission: string;
}
```

只增加以上五个方法。没有独立 validate、resolveCredential、beginJob、recoverJob 或持久 lease API。`bind` 自身完成校验；`inspect` 给生成时的连接并发前提。超时固定沿用 180 秒，单图检查沿用 Images 20 MiB 和现有 provider 总体限制，不新增通用限额配置。

Images 可信 entry：`image_generation: { store_name: "images", read_permission: "images:connections:read", write_permission: "images:connections:write", generate_permission: "images:generate" }`。同一条目原 database/files 的 store_name 也为 images。声明校验复用 Home store registry：store owner 必须等于 manifest.plugin_id；声明不可来自插件 Manifest、脚本或动作。冻结副本进入 entry identity 和 releaseArtifact 恢复，与 files 同样处理，避免升级时对象被改写。这个 store_name 同时是现行 connector_bindings 的 plugin_id namespace；不迁移 `("home", "images", slot_id)`，不增加映射表或按 Images ID 分支。

生成还要求 Manifest 与生成动作声明既有 `model:invoke`；read/write 权限使用上面的现有 Images 权限，避免为了图片列表把整个 connectors:management:read 授给所有旧调用者。`model:invoke` 是新增到 Images 动作的真实依赖，迁移说明须明确调用方重新获准后才能使用，不能静默补权。服务本身不需要 `secret:images` 或任意 `network:*` 把凭据/网络访问权交给插件；现行 Manifest 的这两项在接线后按实际边界删除。

## 原事实与 Host 实现链

- 可信 entry → Home/项目 executor → `pluginImageGenerationFor(home, definition, context, declaration, assertActive)`；声明缺失、无 Home、sandbox、升级预检均没有服务。
- `packages/plugin-runtime/src/image-generation-service.ts` 持有 action scope gate。Host 端口只有执行与连接操作，不接收可伪造 actor、project_id、install_id。
- `apps/local-host/src/plugin-image-generation-service.ts` 是通用服务适配文件，不 import Images 包、不读 Images SQL、不引用 Images 错误码。它调用 `withConnectorConnections`、现行连接 view/SecretStore、`resolvePrologueInference`、`withConnectorRequest`。
- `connections()` 复用 #661 `listConnectorConnectionViews(home, "image-api")` 或其共同 owner 投影，不能自行拼一份 enabled/state 规则。
- `inspect()` 读取 `binding("home", store_name, slot_id)`；再用 `store.get(binding.connection_id)` 判断当前有效账号。#661 removed 账号仍能从 binding join 返回，get 却返回 null，因此必须保留“有绑定但已失效”状态。只有完全没有 binding 且地址为合同 loopback 才允许无密钥本机请求。selected 必须 image-api、enabled、未断开、凭据存在、target origin 相容。
- `assertTarget()` 当前会 `INSERT OR IGNORE connector_connection_targets`，不是只读。`connections/inspect/availability` 不可调用它。`bind` 在授权后调用它并调用现有 bind；正式 dispatch 也在授权后调用，保持首次目标固定。连接仍由其 owner SQL 读写，不把表复制进插件。首次 pin 会把 target 从 null 变成 origin：先核传入 revision，再在同一无异步段固定目标并捕获派出快照；不能拿固定前 revision 比固定后 snapshot 而误拒绝自己的写入。
- `generate` 在任何 await 前复制所有字符串与协议参数，并比对 inspect 的 expected_revision；随后 Host 保留原连接记录/绑定/密文状态快照，不能在异步之后改取“最新账号”。Host 派出前与返回后核原快照；`resolveCredential` 闭包仅在 Host 传给 agent-host，不进入公开 client。
- endpoint 只由两种协议和已验证 base URL 构成。URL 的 HTTPS/loopback、用户名密码、query/hash 约束与现行 Images providers 一致；可将纯规范校验下沉到合同/SDK 并让 Images 共用，不能让 Host import 图片插件。不要改成任意协议或自由 endpoint。
- `resolvePrologueInference(home).generateImages` 获得 signal、beforeDispatch、Host-only credential_ref/resolveCredential、prompt/size/aspect_ratio、180 秒超时。已有 agent-host 下载/重定向保护继续工作。

revision 是实际并发控制需要，不是交付证据链：现行 ImagesHostService 已用 selected id/updated_at/disconnected_at/密文的 JSON 作 revision，但不能把那份含密文的 JSON 暴露到公共服务。建议在 Host 内对该现行快照做 SHA-256 不透明指纹，加入 enabled、binding id、target origin。仅比较相等，不写数据库、不返回到 Images 公共动作/HTTP/MCP、不持久化。禁止用明文 key 生成该值。另一种更小表面是只用 updated_at，但不能保留现行对外部密文变化的检测，不推荐。派出期间仍直接比原 Host 内部快照，不依靠指纹替代权限。

## 运行授权与取消

只读 `connections/inspect` 可用于活跃安装的 discovery，检查安装 read_permission，不创建 Images 库、不发模型请求。动作内读取再核 action scope：connections 需要 read_permission；inspect 允许 read_permission 或 generate_permission（生成本来不要求列举全部账号）。这样既支持 startAvailability，也不额外把账号列表权限绑到所有生成调用。

`bind/unbind` 只能在本安装活跃 command 中调用，动作及 caller 都含 write_permission；等待 beforeEffect 后同步 assert_authority_current、当前安装与 grants，再执行同步 Connector owner 写入。它们没有模型等待，不强制变 concurrent；Images 外层若改用异步处理器，仍按实际动作调度声明。

`generate` 只能在本安装并发动作或已有 background.start 保留的同一 action scope 中使用。生成动作和 caller 同时具 generate_permission 与 model:invoke，且当前安装也有授权。启动、路由、过期回调、另一安装、sandbox 均拒绝。beforeEffect 前后、每次 provider dispatch 前、交付结果前复核；最终业务提交由插件自己的新 background control 再检查。

`withConnectorRequest` 接入 #661 disable/remove/token replace 的 invalidate；不配合 signal 的推理也由 SDK createExecutionLifetime.wait 结束本机等待，不能 await 原 Promise 无限阻塞。绑定变化目前 bind/unbind 不触发 connector invalidate，因此不能仅依赖该 signal；在有限生成 lifetime 上沿用 200 ms 快照检查，同时提交前同步检查。监测关闭、失败、成功都 dispose。

连接失效/权限撤销/安装停用/显式取消一旦拒绝，迟到成功与失败不得交给业务 catch 当普通生成失败写入。普通 timeout/provider HTTP 仍可在授权有效且 job running 时记录失败。Host 返回统一 ActionError（plugin/host owner 码或现行 connector 码）；Images 决定自己的用户提示与失败记录。不要把 provider 未脱敏异常或密钥内容写日志。

## Images 内部执行与一致性（无新增平台任务）

1. 在现行 jobs.start 内复制生成配置；inspect 选中 slot，保存内存 revision，拒绝不可用；数据库同步事务仍做 request_id/input_hash 幂等和全 Home 两个 running 上限。
2. 用已存在 `services.background.start` 接受执行；回调使用新 control，调用 generate。任务行与受理句柄之间要处理失败：不能先插 running 后因 background 受理拒绝留下假运行而无恢复依据。实现可先取得有限后台句柄，回调等待该次 insert 完成的本地 Promise；若 insert 被拒/命中已有任务，取消句柄且不派出。这个 Promise 只是本次受理协调，不是新队列或任务事实；不要从后台另起 background。
3. 提交前检查原配置协议/地址/模型仍一致、job 仍 running、连接 revision 仍一致；文件 create 使用组合 control：先原 beforeEffect，再同步核 job/配置，assert_authority_current 也含这些检查。不能在检查之后跨文件 API 的授权等待而失去业务版本前提。
4. 文件全部创建后，数据库 transaction 的 beforeEffect 包含同一检查，事务内再核 running/原配置后 finish succeeded；不允许错误时再把已成功 job 改 failed。
5. 文件先于 DB 是现行事实，无跨库事务。被撤权后 files.remove 也必须拒绝；保留未引用文件，下一次有效恢复/清理根据所有项目 images_json 集合删除孤儿。不能凭当前项目列表清 Home 文件，也不能删除当前进行中的生成刚写出的文件：启动恢复在接受新 job 前执行，运行时清理排除本实例 active pending filenames，或只在启动做清理。
6. stop 只取消句柄、等待 lifetime 收尾、释放内存；executor 先 revoke 后 stop，不能照搬旧 close 写 interrupted。新实例启动可在自身当前授权下恢复遗留 running→interrupted，绝不重发厂商。启动清理权限来自当前安装，不能伪造用户 action control；现有 database.transaction 接受安装 requireGrant/assertActive 检查即可，files 需要同样的生命周期控制并明确只在未注册/未受理 job 的恢复阶段使用。若主会话认为启动阶段控制必须只由 Host 创建，见下方决策点，不能让 writer 私自扩大控制能力。
7. 旧 runner_id 列保留 v1；新单 Home supervisor 不再开 images/runners 的第二套锁。只有确认已运行于唯一 Host 后，恢复全部旧 running；旧锁文件属于旧版本维护残留，不通过 assets 文件服务跨目录删除。本次不新增迁移读取、也不新建 runner 服务。

## 项目删除：先用现有事实，避免第三个公共服务

保留 `imagesProjectData.purge` 由 `project-deleted-owners.ts` 通用 catalog 接线；它仍属于 Images 包，删除本项目 SQL/资产。删除动作属于 Host 的独立授权生命周期，不受原生图调用撤权影响。

删除后后台控制应立即失效，且每次提交复核 job 存在；本地 200 ms job monitor 可停止仍等待的任务。固定 id demo rebuild 不应仅按“项目仍存在”放行，所以 job 行不存在检查必需。文件 control 的最后同步检查拒绝删项目后新增资产；已经生成未入库的资产按上节 orphan 清理处理。

这里有一个需要主会话明确的等价性点：旧 ImagesHostService 的活动 hook 在 purge 前同步 abort；只保留离线 purge+200 ms monitor 会把停止等待延迟至下次 monitor（与既定后台撤权轮询级别相同），并可能留下最多一轮孤儿直到有效清理。若要求删除 receipt 返回前已立即 cancel 且孤儿已清，最小扩展是给现行 `ProjectDataDeclaration` 的通用 live-owner 装配添加可选运行实例清理回调，经 Home supervisor 当前 contribution 调用后再执行既有 purge；**这应是主会话独立串行前置，不在图片推理接口里塞 project.delete，也不再写 Images Host 文件。** 若允许受既有 200 ms 撤权上限约束，则无需新增公共项目删除接口，必须以真实删除/固定 id rebuild 交错测试证明零晚到写入。

## 已有动作哪些能直接用

#661 的 `connectors.connections.read` 能给目录，`connection.check` 做真实检查，`connection.control` 管启用/移除，`usages.read` 汇总使用位置；均继续通过正式 action 客户端声明 consumes/required_actions 并受权限检查。它们不提供 binding/目标固定/凭据派出。

Images 设置链接继续打开现有连接设置；不为了迁移新增检查或创建账号动作。Images `connections.list@2` 返回 auth_connections 时用专用服务的过滤安全视图，避免被迫增加所有服务管理读取授权。Images 新 `connection.usages` 继续由自身原数据库配置与 inspect 的状态生成，不写 Host 名单。公共业务动作的名字、v2 list、schema 与 #661 一致；改变 schema 时按现行合同规则升版本。

## 文件边界与最小实施顺序

A. 主会话先冻结本设计的两处选择：专用 imageGeneration 服务及可信 declaration；项目删除同步 abort 是否是必须的 receipt 语义。确认启动恢复控制能否沿用可信 native 生命周期，或要先补极小恢复控制（不能在 writer 中临时发明）。

B. 唯一平台 writer：新增 `contracts/platform/plugin-image-generation.ts`、`plugin-runtime/src/image-generation-service.ts`、`local-host/src/plugin-image-generation-service.ts`；必要纯 URL/connection snapshot helper 独立小文件。修改 plugin.ts/index exports、HomePluginEntry/PluginPlatformEntry、entry identity、Home/项目 executor 与 fixtures，使声明与服务走同一路径。Connector owner 如需共享只读状态/目标纯校验，由它导出最小方法；不跨包 SQL。复用已有 background/files，不新增其 API。API 快照、安全表、包 README/Skill 同片由主会话串行更新。

C. Images writer 在公共接口冻结后可独立改 `plugins/native/images/src/{service,store,providers,actions,manifest,routes,index,project-data}.ts` 与新 plugin.ts、Images 定向 tests；不能改共享装配。继承 i18n 27b28a420 的 messages/client/ui，client 路由切换逐块合并，不覆盖稳定键。

D. 主会话串行 Home catalog 接线，移除 project-host 旧 provider、images-service-host/images-actions/images-native-plugin-http、web-request 旧分发；清单/依赖/装配门禁/spec/SSOT/资源派生由主会话处理。#661 list v2、usage action、enabled 与 dangling binding 拒绝一并保留。

E. 验证按真实临时 Home：服务 scope 拒绝与零派出；绑定 target 固定/错误服务/disabled/removed/密钥替换/绑定变化；无绑定本机可用与有失效绑定本机不可用；HTTP/MCP 正常断开继续、原授权撤销、不配合 abort 的迟到成功和失败；文件部分创建后撤权、重启清孤儿、不删另一项目资产；项目删除与同 id rebuild；关闭后 running 恢复 interrupted 且零重复 provider 请求；并发最多 2 个、同 request_id 无重复费用派出。共享构建/全量由主会话排程，不能以已有通用 background/files 测试替代 Images 实接。
