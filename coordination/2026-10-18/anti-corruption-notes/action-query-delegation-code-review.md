# AQD 实际代码只读复核

负责人：root 的只读 reviewer。2026-10-18。依据 S 唯一 spec 的 W5-01-AQD、已接受计划及前轮 review，检查 `69bf931c6→c00f06475` 的 AQD 切片，以及整合头 `2ee1fc6fb` 上 writer 最后冻结的六文件修补/新增 Home HTTP 测试。本报告只写 D，未修改 S、运行构建、Chrome或测试。`git diff --check` 通过。

## 裁决

**当前读到的最终源码可以接受，没有剩余必须修改的 Blocker/P1。** 本轮找出的 Home HTTP 权限缺口、Home 自身启动重入死锁及 project route 后台 signal 回流均已在最终差异修正。此为代码裁决，不是最终工程/实际用例通过：根所给首轮 build exit0 是最后修补前证据，最终构建与定向运行仍由 root 执行并记录。

## 关键源码结论

### 原调用者与来源插件权限交集

`apps/local-host/src/plugin-action-query.ts:7–45` 是唯一委托实现。15–18行要求当前Runtime action scope、同install、现有retainAuthority和consumes；项目实例另核可信project_id。19–36行从scope.caller复制actor/project/audience/allowed_actions/allowed_capability_ids等原字段，permissions只做来源声明与context.grants的过滤，没有加入目标ref、清空allowlist或使用本机owner工厂。来源assertActive及context.requireGrant在等待前后持续复核。

`used` Set只记录这次派发实际用到的权限，以便结果交付前再次查source grant；不存动作目录、另一身份或持久授权。它解决query未调用beforeEffect时仍需在返回前重核权限的问题，当前范围合理。来源consumes仅限制直接目标；Pages content→get/list仍沿原caller，原未授权get/list不会自动补齐。普通actions.invoke外部plugin-audience分支保持原有语义。

### 派发与注册竞态

`packages/kernel/src/action-service.ts:209/223` 两条异步/同步入口现在给最终assert传实际注册definition.action.permissions，来源wrapper不依赖discover旧权限。`action-execution-context.ts:49–54` 的visibleAction检查query_only下实际operation。注册availability和CapabilityRegistry.requireCapability在handler进入前执行，所以discover之后同id/version换成command不会进入handler。

`contracts/platform/actions.ts:443–454` 的bindActionClient以OR保留parent control与bound caller的query_only；父授权和子授权仍分别检查，没有用子检查替换父。Pages `content-actions.ts:15–18` 的内部binding保留原caller，source限制与原精确refs继续生效。该机制限制标准动作链的query性质，不是任意可信进程代码的IO沙箱；本片没有扩大此承诺。

helper 39–44行固定provider，依现retainAuthority捕获目标注册，先核再invoke，结果返回后再次await retained、核parent、最后同步retained.assertCurrent/source。目标在授权等待中换代由Kernel token检查拒绝；结果完成后到交付之间换代由最后guard拒绝。原parent.beforeEffect寿命没有延长，结束后的ALS仍会失败。

### HTTP own action 与生命周期

`plugin-actions-client.ts:17–57` 复用原routedControls记录完整caller/client/ended，Home无project也按原control对象身份查记录。克隆control没有这份记录。101–124行routedActions以原caller为底，额外检查来源安装；own定义从manifest按id/version取得，不信任插件传入definition中的权限/schema，Kernel实际权限也继续传给同步检查。

`coding-surface.ts:198–215` 与 `home-plugin-http.ts:93–120` 在取得可信caller前后都查abort，响应/路由结束仍令普通请求失效；完整caller不持有request signal，由control承担前台取消。project current回调现在只查实例生命周期，不调用包含旧signal的plain.beforeEffect，因此已受理background不会因response结束被二次取消。原capture前signal、Kernel注册/环境和安装检查仍保留，没有全局删取消边界。

### Home client与项目边界

`plugin-actions-client.ts:143–154` 的adapter只从现Host.status.projects选择可信caller.project_id对应且非closing的reference，null走Home client，找不到直接scope_mismatch；没有从业务输入/路径开库、没有新parser或registry。`project-host.ts:207` 最终传`homePluginActions(this.host)`，复用底层raw客户端，避免高层prepareHomeActions再次await本实例ready。HTTP route本身仍复用已有验证后的project client。

## 本轮发现并已修正的问题

| 原问题 | 最终源码修正 | 新增/补强的实际测试位置与当前证据 |
|---|---|---|
| Home项目HTTP用`localWebActionContext(...,[])`，native Pages没有install_id供补grant，导致合法Pages读取失败 | `home-plugin-http.ts:101` 使用现LOCAL_OWNER_PERMISSIONS，仅限已认证本机HTTP；query source声明/grant交集不变 | 新`tests/plugin-action-query-home-http.test.ts`正向真实Home项目路径、source-missing拒绝、target等待时隐藏/停用；已读测试源码，最终运行待root |
| Home adapter使用高层MolisWorkLocalHost client，插件start内await actions.discover反等自己的ready，死锁 | adapter参数改raw LocalHost client，composition传this.host | `tests/plugin-action-query.test.ts`末尾Home start await discover并ready成功用例；已读，运行待root |
| projectRouteControl额外current调plain.beforeEffect，正常response结束的signal重新进入retained后台guard | coding-surface分离无signal current；plain control仍检查请求signal | 原background正常返回继续用例需复用；新HTTP文件补Home/project受理前断开零execution/业务写；源码已读，运行待root |

本表“已修”表示当前代码已处理，不表示新增测试已经通过。

## 新测试实际覆盖与剩余证据

- `tests/action-query-only.test.ts`：真实Kernel异步/sync拒command、新bound caller仍query-only、发现后换command；实际当前权限在不调用beforeEffect的query handler前拒绝。handler计数断言有效。
- `tests/plugin-action-query.test.ts`：真实Runtime读取生产Pages content及内部get/list；缺原权限/direct ref/nested ref/source grant/source declaration/consumes拒绝并无delivered；无scope、别安装、结束后的继承scope拒绝；target-held期间source停止、target重注册、原caller撤权与取消零交付；版本/provider/schema不转投；新startup死锁回归。
- `tests/plugin-action-query-http.test.ts`：真实root/catalog项目HTTP成功、clone/direct/输入伪造拒绝、断开后零交付、传入伪own定义不能降source权限，以及Home/project受理前断开零background execution。不是仅调helper的mock。
- `tests/plugin-action-query-home-http.test.ts`：以生产Home装配位置注入fixture，验证真实项目前缀、native Pages读取、来源权限缺失以及已进入目标等待时hidden/disabled拒绝。改用owner baseline的正向与负向都存在。
- `tests/plugin-action-query-mcp.test.ts`：实际stdio MCP→Host网关，parent-only/缺内部get拒绝、完整精确授权读取Pages。最后撤权已从delegate之前的behavior.before改为真实`query.target` handler进入后的等待，在等待中撤target grant，最终error且无delivered；比初版更贴近晚到结果风险。

权限证据需保持准确：PluginRuntime.grant当前禁止running期间静默改grant（index.ts:366起），所以source-grant等待用例按协议先stop再grant，最先命中的是stop，不能报告成“运行中单独撤grant”的独立证明。初始缺grant用例独立证明来源权限交集；真实停止/重启及原client生命周期按现合同验证即可，不为测试发明允许运行时改grant的行为。

root尚需最终整体build后的上述五文件运行结果，以及既有HTTP background正常response结束继续/撤权回归，公开API快照、boundary/health与必要包回归。首轮build日志`/tmp/molis-shelf-aqd-build.log`末尾确认已有产物输出，但它不覆盖最后源码修补，不能作为最终测试证据。未新增本机全量要求，也不因本review再重复已有效通过且未受后续变化影响的检查。

## 范围与复杂度

新增实现约46行helper、一份现WeakMap扩展和约12行Home adapter，职责明确；没有第二执行器/动作目录/长期authority平台。query_only是只减权限字段，普通plugin自主消费分支保持。当前无建议为整理而删改的P1级复杂度；唯一spec/API/安全表和最终证据由root维护，不由reviewer另建需求或替代验收。
