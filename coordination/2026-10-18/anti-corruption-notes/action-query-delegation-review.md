# AQD 最小性与授权复核

负责人：root 的只读 reviewer。2026-10-18 核对 `wt-shelf-runtime` 源码、唯一 spec 顶部 W5-01-AQD 与外部实施草案，并同 pages_handle_writer 交换定位。未改源码/spec/门禁/测试，未构建或测试。实现尚未开始，下面是必须落实的边界，不把方案视为已实现。

## 判断

窄 `invokeQuery(reference,input)` 有实际必要。现 `pluginHostActions` 的 own actionCaller 合成 user + 安装 grants + own/required refs，外部依赖分支则改成 plugin audience；两者都不能表达“保留原 user/Agent/MCP 的 refs 与权限，同时受来源插件约束”。不能靠加 required_actions、Pages plugin audience 或扩大安装 grants 解决。

方案没有必须重新询问用户的 Blocker。必须落实下列 P1 边界；其中“派发传实际权限”已被根写入当前唯一 spec，应直接实现，不另立设计。

## P1：query_only 必须沿实际绑定传递

在 `action-execution-context.ts::visibleAction` 拒绝 query_only 下非 query 是合理最小落点。`ActionService` 注册 availability 调用它，`CapabilityRegistry.requireCapability` 在真正进入 handler 前复核 availability；invoke/invokeSync 都走此入口。discover 过滤加上实际派发限制可覆盖 discover 后替换 command，现注册 token 检查再覆盖授权 await 中重登记。

但只增加 visibleAction 和字段仍不完整。`contracts/actions.ts::bindActionClient` 使用新的 `context()` 构造 caller、再接父 control 时，目前只组合 signal/page_context/authority hooks。若 query handler 通过 `bound.invoke(command, input, originalExecution)` 发子动作，父 control 的 query_only 会丢失。应在标准 binding 中按“bound caller 或 parent control 任一为 true 就保持 true”传递；不得显式 undefined/false 清除父限制。相关 Pick 类型需包含该只减权限。

Pages 当前 `bindActionClient(actions,()=>caller)` 恰好保留全部字段，故只测 Pages 正向链发现不了上述缺口。新增一个父 query 内用新 bound caller + 原 control 调 command 的负向用例，断言 command handler 从未进入；同时保留 Pages content→get/list 成功。snapshotCaller 与 retainActionAuthority 当前是 spread，可自然保留字段，不需要重复写三套限制。这里不声称防御任意可信插件自行制造新身份绕过平台。

## P1：派发前必须核实际目标权限，不能只核发现快照

当前 `ActionService.invoke/invokeSync` 在 handler 前调用 `assertCurrentAuthority(call,reference)`，没有传当前 definition.action.permissions。若 discover 之后、retain 接受之前同 id/provider 替换为权限更高的新 query，旧发现权限列表不足；query handler 也不必调用 beforeEffect。来源插件的 manifest/grant 交集可能没被核到实际新增权限。

根当前 spec 已要求这两处传真实 definition.action.permissions，这比每次重新 discover 或复制目录小。委托 wrapper 的同步 assert 必须按此参数核来源声明及实时 grant，同时保留原 caller 的 target assert；不能忽略参数或只存旧数组。目标被接受后仍由 retainAuthority 的 token 与实际派发 token 检查拒绝重登记。不要把 capture 提前到未校验引用、也不要用再次查到的同名注册替换旧 guard。

测试：发现旧 query 后在 retain 接受前换更高权限的 query（来源 grant 不足）拒绝零 handler 进入；授权 await 中重登记拒绝；目标执行成功后交付前重登记旧结果拒绝。查询本身不调用 beforeEffect，才能证明门槛在公共派发端。

## P1：真实 HTTP own action 要保留 caller，且不能误把 own-only 检查套到子目标

`localWebActionContext` 已提供原 accepted 精确 refs、权限与动态 owner/generation 验证；真实 root/catalog/Home 路由可复用它。现 Home 只取其 permissions，project ownAction 则重造 caller，确实必须补接线。

用既有 routedControls WeakMap 存 Host 创建的 caller+client+ended，按原 control 身份取回，方向正确。当前 callScope 仅在 control.project_id 存在时查 map，需改为所有真实 control 身份先查；无 project 的 Home 记录同样有效。克隆 control、请求 JSON 的 caller/project、普通 start/timer 不能得到该 authority。

带真实 route 记录的 own action 必须以原 caller 为底，不新增/清空 allowed_actions，不拿安装 grants 替换 caller.permissions。另加的来源 own action 检查应固定原 parent 定义，并检查安装/route；不能复用当前 actionCaller.assertAuthority 的“传入 ref 必须是本插件 own action”逻辑检查所有子 target，否则 Pages content/get 会被无条件拒绝。target 的权限和 refs 留给原 caller 与 query wrapper 校验。

本机用户工厂只能从真实已认证 Host 路由调用。外部 MCP/Agent 的 currentPluginAction.caller 无论缺什么权限，都不能改走 localWebActionContext 补权。Pages 内部 get/list 原未获授权就拒绝；consumes 只限定直接委托 content 目标，不变成强行限制全子链只有一个 id，也不自动追加内部 refs。

必要验证是实际 root 与 catalog HTTP own action→委托→Pages；再测克隆 control、结束 route、来源隐藏/停用拒绝。只手造 scope 或直接调用 helper 不能证明这一段接通。

## Home client：可删接口铺设，不能删可信选择

现 `HomePluginHost` 构造时拿到的是 `this.host.homeActionClient()`；该 client 在 `local-host.ts` 明确拒绝 caller.project_id。`PluginActionScope` 只有 install/definition/caller，没有派发 client；Kernel 创建的新 execution 也不是原 route control。因此：

- HTTP 项目路由已在 routedControls 保存正确的 project client，应直接复用，不能根据业务输入重新找项目。
- Home 插件由 MCP/Agent 在项目中调用时没有 route 记录；原 scope caller 确定身份，但现 home-only client 不能派项目 query。完全省掉可信 client 选择逻辑不可行。
- 不必因此把新的 `clientForCaller` 接口依次铺到 HomePluginHost、Executor 和服务层，更不必新增 parser/map/token registry。可以在现 Home composition 提供符合既有 ActionClient 的私有 adapter：每次 discover/invoke 按 caller.project_id，从现 Host status 中选已打开且有效的 reference，复用已有 actionClient；null 复用 homeActionClient。Home options.client 只在 pluginHostActions 使用，现 own/dependency 路径仍由 callScope 产生 null 或可信 route 项目，因此可以保持原行为。若 writer 选择很小的私有 selector 也可，避免同时存在 adapter 和 selector 两套。
- 未知、关闭或不匹配的项目明确拒绝，不按 id 推导数据库路径或打开新项目。Home 无项目不默认当前页面项目。只为当前真实场景接现 client，不新增通用项目解析服务。

## 可直接删去的复杂度与验收边界

保留单一 query_only、现 retainAuthority token、原 Runtime scope 和现 routedControls。无需新增票据、身份 registry、授权快照文件、独立 dispatcher 或第二动作目录。无需修改普通 invoke 的外部 plugin audience 分支；只在真实 HTTP own action 分支保原 caller。Home client 选择与 route caller 记录承担不同职责，不用把它们合成跨来源授权工厂。

本片用真实 Runtime fixture 消费现 Pages content→get/list 即可，不改 DSH 的 PPT 实现。完整授权成功与“只给父动作/只给content没给get”的拒绝需并列；source grant 撤销、父结束、target 换代在等待及交付前分别拒绝，command handler 计数始终零。保持 text-only 无 Pages 依赖，不为验证新增无条件 required_actions。上述通过后足以证明公共前置，不扩为所有插件的迁移或后台委托体系。
