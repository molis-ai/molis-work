# T403 Functions / page action 权限窄核

负责人：Codex 安全合同审查线。状态：静态审查完成；A 可有条件采用，尚未代替用户授予新增权限。只审 API-PLAN §1–3，不重审 MOUNT，不扩展 §4 账号控件。

材料：`API-PLAN.md`、`API-MAP.md`、原 accepted `../t116-successor-plan/decision-t133.txt`。代码核对绑定本地主检出 `08c9933d57e153d1d59bf2811f203056d4358992`，首尾 HEAD 一致、工作区干净；原方案绑定 `b6f92222fce89dfba756a580768889292cfe9967`。已查两点间相关路径差异，下面引用以本次 HEAD 为准；不声称远端最新。未实现，未读真实凭据/Home 数据，未跑模型、测试、build，未写 GH/coord。本文是源码合同结论，不是动态安全验收。

## 1. 裁决

**若明确授权的内容就是“让 Feed 安装通过这五项公共动作管理 Home 范围 Functions 记录”，A 没有发现额外的 user-only 禁令或必须另建记录 owner 的安全障碍。** Functions 仍然是数据 owner；跨 owner 经过其公共动作，是现有架构允许的调用，不因跨 owner 本身变成越权。保留真实 plugin caller、consumes、安装 grant、当前 provider、撤权和发布校验后，不能再以“这些动作原来走本人 HTTP”为由认定 A 必须改成另一套编辑产品。

但 A **确实增加 Feed 安装的持续能力**，不只是把同一人的按钮换传输：它能读取本 Home 全部草稿/已发布记录（含样本、最后试跑），修改任何可编辑草稿，试跑并发布符合现有校验的记录。没有“仅当前 Feed、当前项目、当前页面新建草稿”的行级限制，也没有“每次本人点击才允许”的限制。页面只是一个入口；持同样 grants 的 Runtime 代码也可调用这些 consumed 动作。preview 可付费调用判断服务，但不执行判断建议的业务操作。

原 accepted 书授权保留出口规则编辑并把客户端搬回插件；没有点明这一新增安装能力，也没有点明把内嵌创作改成 Functions 独立编辑面。故可直接准备通用接线，**不能从搬迁目标自动推导授予 Home 管理权，也不能擅自用 B 改体验**。本轮给出两个准确选择见 §5，不重复申请已有搬迁授权。

## 2. 必须纠正的阻塞项

### B1：API-PLAN §2 把“现有 consent/安装流程”写成新增管理权限的显式确认保障，当前代码不支持这个保证

- `packages/plugin-runtime/src/install-rules.ts:26–29,71–94`：`host` 安装走 `hostBuildGrants`。全新安装给全部声明权限；跟随新构建补必需权限，并在知道旧声明时打开新声明的可选权限。调用方传较窄 grants 不覆盖这条规则。
- `packages/plugin-runtime/src/supervisor-releases.ts:28–43` 提供旧声明；`docs/releases/POLICY.md` §7.8 明确这是既有宿主构建信任政策。不能为本次另改此政策，也不能假称新增声明会等待逐安装弹窗。
- consent 账本与 permission grant 不是同一件事。`installed-plugin-consent-actions.ts:20–28` 的 consent 类型是 always_on/default_wiring/default_group/local_directory，不是 functions:manage；`plugin-consent-settings-entry.ts:49–61` 的权限设置才是本人可信入口。
- `install-rules.ts:189–194` 拒绝关闭 required 权限。因此若写 `functions:manage required:true`，“拒绝管理授权只让自然语言编辑不可用、Feed 继续运行”的承诺也不成立；关闭此项被拒，要停用插件。可选声明才支持现有逐项关闭，`regrant.ts:28–44` 会先撤运行权限、停—改—起。

**最小修书**：明确 A 的新增管理范围，以及采用现行 host-build 发放方式；建议 `functions:manage` 为可选，拒绝/撤回仅影响需要它的创作操作，沿现有设置关闭。可选不等于默认关闭——首次/新增声明仍按现有政策打开。严格显式授权在这里必须是用户明确批准这次能力扩展及发放方式；不能拿自动发放的运行结果倒推用户同意。若要求每台安装都先弹独立确认且默认拒绝，当前路径没有这种保证，那是额外授权产品合同，本次不能承诺“已有流程已解决”。

这不是否定既有 host 信任决定；阻塞的是把未发生的具体批准和不存在的确认机制当成 A 已满足的前提。批准 A 的完整范围后，不再重复请求同一授权。

### B2：API-PLAN §3 的备选 `services.actions.availability` 不能直接充当安全预检

`plugin-actions-client.ts:204–214` 的同步 availability 只检查实例活动、声明 consumes，再调用 dependencyCheck。`hostDependencyCheck`（同文件 :92–98）用 `consumer:"plugin"`；`plugin-callers.ts:55–65` 明确它问的是“依赖登记且就绪”，构造 actor=`local-host`、权限为目标所需权限，非 plugin 受众动作甚至按 user 查看。它不是当前安装授权判断，Home activation 还可能没有该端口而返回 dependency_unknown。

因此，Feed 自有 query **仅转发这个结果**并不满足“同 caller / consumes / grant / provider”的要求，可能对自己实际不可调用的动作报 available。删掉这条等价替代说法。已有可复用的安全下层是 `pluginPageActions` 的真实 caller 构造 + `pluginActionView` / `ActionClient.discover(caller)`，不是另造一份目录或权限判定器。§4 给出最小接线。

### B3：native page 必须精确绑定已选舞台 owner；有 Runtime activation 不等于选对 activation

`plugin-host-services.ts:109–114` 已把真实 native Runtime 实例 connect 到同一 PluginPageAuthority，含 install_id、actor、project、invoke，且 revoke/dispose withdraw 页面。这部分无需新造 native 特例。

但 `plugin-page-authority.ts:58–70` 只按 plugin/actor 找候选，依次偏好 Home resolveFiles、当前项目、Home，最后 registered fallback。`plugin-page-http.ts:56–70` 的 open 请求只有 plugin_id，当前没有接收舞台已选安装的可信绑定。这个排序不能证明 RAC-2506“只调画舞台的那一半”。

API-PLAN 已识别此缺口，方向正确；实现冻结时必须把 T402 已选 owner 的真实安装/作用域延伸到 authority.open，并精确匹配该仍存活 activation。无匹配就拒绝，不换另一实例，不借 install_id=null 的注册 HTTP fallback。child 的 install_id/actor/project 均不能成为可信输入。**这是原 accepted 的既有验收约束，无需用户新决定，也不在本轮重审 MOUNT 其余内容。**

## 3. 五动作的实际安全边界

| 核查项 | 当前实现与对 A 的判断 |
| --- | --- |
| user-only / owner 假设 | `modules/functions/src/authoring-actions.ts:35–49`：受众是 user/agent/workflow/mcp，五项都是 Home scope、functions:manage，preview 另需 functions:invoke。没有本人专属 entry credential；不同于插件权限设置、连接账号绑定。只缺 plugin 受众，不能把原 HTTP 当成服务层 user-only。 |
| 记录归属 | 同文件 :78–90 调统一 Functions service；`service.ts:70–71,109–118` 直接 list/create/updateDraft，未接收创建安装 owner。list 返回完整记录，update/preview/publish 按 id。已发布版本不可改、草稿修订冲突等由既有 store 规则处理，不是 Feed owner 隔离。 |
| 可信身份 | `plugin-page-actions.ts:25–40` 限 own/consumes，跨 owner audience=plugin，Host 发出的 caller + install_id，权限来自 activation grants；`plugin-callers.ts:16–35,71–103` 验 issued 对象、actor/project/install 一致并把权限收窄到“声明且持有”。不能只传一组字符串权限或改 audience=user。 |
| 公开哪几项 | 精确给 create/list/update/preview/publish 加 plugin；不要改共同 define 的全局默认，否则 get/delete/sample/context 系列一起开放。开放是通用 plugin 受众，其他满足声明、授权的安装也适用，不能暗称只对白名单 Feed 生效。 |
| preview | `authoring-actions.ts:82–83`，`service.ts:139–158`：模型 await 后 beforeSave=caller.beforeEffect、signal 检查，再 CAS savePreview。保留这条路径；不能另写“直接模型调用”或先保存假试跑。 |
| publish | `authoring-actions.ts:84–90`：准备校验、await validatePublication、beforeEffect、用修订号 publish。`functions-actions.ts:23–58` 对 action_map 用原 caller 的目录，对 scene 用原 caller 的场景、精确版本/provider 和兼容性校验。换 plugin 后可见范围更窄是正常约束，不能补全 user 目录或移除校验来使发布成功。 |
| 业务副作用 | create/update 是同步 owner 写；list 只读。preview 存试跑，publish 存不可变版本；发布本身不等于给 Feed/Inbox 安装规则、不代用户改别的消费者绑定。Feed out-rule 的最终写还走它自己的动作权限与修订检查。 |

`functions-http/route-handlers.ts:9–23` 证明旧 HTTP 本来也转同一批动作，update 的平铺 body 被转换成 `{id,updated_at,patch}`。迁移直接用 API-MAP 的真实 schema 即可。function_key 找回、丢响应后的 list 恢复、preview/publish CAS、已发布 reference 重用仍属原行为；不建 Feed 草稿副本或私有 owner 表。

在上述前提下，**A 授予的是确切、较宽的管理能力，不是绕过既有 owner 授权**。当前没有依据要求“即使用户接受这些能力也必须禁用 A”。同时，源码审查不证明新 plugin 路径已跑通；实际工程必须证明 Feed capture scene 在真实 caller 下可见、发布成功且未借权，不能把这个未运行项隐去。

## 4. page actionAvailability 的可复用最小边界

**已有下层端口，可补 page adapter；尚无现成 frame API。** `UiPluginClientHost`（`packages/contracts/src/platform/ui.ts:21`）和 `browser/plugin-frame/child.ts:77` 现有 invokeAction；`plugin-page-http.ts:43–54` 只接受 reference/input；Activation 只有 invoke，没有 availability。不能声称已经有 `host.actionAvailability`，但无需新增 Functions settings 动作、全目录接口或另一份权限 owner。

最小做法：在同一 page action 入口增加严格区分的查询分支（API-PLAN 的 `{mode:"availability",reference}` 可作为候选），invoke 分支不变；在现有 `pluginPageActions` 中共用 reference 校验、own/consumes 判定、真实 caller 构造与 provider 解析，只在末端区分“返回 view.availability”与“invoke”。对应 Activation/Host/child 只传这个有限操作；没有真实 invoke activation 的注册 fallback 不自动获得查询权。

具体约束：

1. 保留 own 动作当前受限 user 语义和自己的 provider pin；跨 owner 是 plugin，权限只取该 activation 持有值，allowed_capability_ids 是其 consumes。输入不接身份、权限、完整 action metadata 或自报 provider 定义。
2. `pluginActionView`（`plugin-action-provider.ts:10–18`）已用同 caller discover，按 capability/version/可选 provider 精确筛选，并拒绝缺失/不唯一。`ActionClient` 在 `local-host.ts:134–175` 经 verifiedCaller；`visibleAction`（`packages/kernel/src/action-execution-context.ts:58–62`）过滤受众、permission、允许动作和作用域。复用这些，不另读用户目录再替插件裁剪。
3. 返回前检查所解析动作的 permissions 仍由 `context.requireGrant` 持有，只返回既有 `ActionAvailability`。权限缺失可能在目录层表现为 dependency_missing；保留真实拒绝，不统一翻译为 connection_required。不可把查询 caller 设 `query_only:true`：preview 本身是 command，查询其元数据不等于执行它，也不应把它从目录隐藏。
4. 当前 `pluginActionView` 在 await discover 后只显式复查 signal，不替页面完成所有作用域/权限复核；新增查询分支须沿 page 请求的 beforeEffect/assertCurrent，在读之前和 await 之后、返回之前检查 page、安装活动、项目显示及目标 grants。没有副作用的 metadata 查询也不应在撤权后返回旧状态。复用 page.bind 的 AbortController、close/withdraw 和现有检查闭包，不新建授权表或 lease。
5. `functions.authoring.preview` 的现有 availability 只返回配置是否可用，不解密凭据。只用这个结果给“先连接判断服务”的提示，不能暴露 source/env/credential 引用，也不能把 available 当模型调用成功保证。
6. 预检通过后实际 invoke 仍走完整实时授权；两者间断连/撤权按真实错误处理。预检不能执行一次假 preview，也不能先创建草稿再用失败模拟无副作用提示。保输入、忽略旧输入对应的晚到 UI 结果，属于原迁移闭环。

await 撤权仍用现有调用链：page 关闭/实例 withdraw abort 在途请求（`plugin-page-authority.ts:50–55,73–78,155–164`）；page invoke 的 route control 传原 signal/current check（`plugin-page-actions.ts:41–49`）；Runtime regrant 立即撤旧 activation；实际 preview/publish 在写前调 kernel beforeEffect，随后同步写入。不得把 beforeEffect 替换成只在打开 frame 时检查、只在返回后检查，或用 background authority 延长本人页面创作。调用返回后再给 Feed 保存绑定前，仍需 Feed 自身实时授权；已成功发布而后续绑定失败时保留已发布 reference 供重试，不再次发布。

需要后续实现验证的最小证据：无 consume/无 grant/不同 provider/已停用的拒绝；双实例精确 owner；availability await 中关页或撤权不回旧可用结果；预检缺连接时不创建 Functions 草稿；preview/publish await 中撤权不晚写、Feed 不绑定；授权正常时保留原完整预览—发布—保存行为。这些是后续证据要求，本轮均未运行。

## 5. 仅有的用户选择：安装管理权还是本人编辑面

通用 activation 接线、同 caller 元数据预检、既有撤权边界和原规则编辑行为恢复，属于 accepted 迁移的工程补齐，不各自再发明一次产品审批。需要明确的是下面 **一项决定、两个选项**：

| 选择 | 用户实际接受的权限/体验 | 建议 |
| --- | --- | --- |
| **A：批准 Feed 安装取得现有 Home Functions 管理能力** | 五动作精确开放 plugin，Feed 声明对应 consumes 和可选 functions:manage，保留 functions:invoke；可读取本 Home 全部定义/样本/试跑，修改任意草稿、试跑并发布；不限制为自己创建的记录或某次点击。host 安装按现行构建信任方式发放新声明，用户之后可在现有权限设置关闭管理能力。不会开放 delete/sample/context 等其余动作，也不会给插件本人设置入口凭证。 | **推荐**：在用户明确接受左列完整范围后采用。保留现有内嵌自然语言创作体验，复用一个 owner 和现有权限体系，改动最小；不需要为跨 owner 再建立一套草稿归属或代理。当前审查不视作该批准。 |
| **B：不给 Feed 这项 Home 管理权，由可信 Functions 本人编辑面完成创作** | Feed 交出合成输入，用户在可信 owner 面完成编辑、预览、发布，返回已发布 ActionReference，再由 Feed 保存自己的规则。Feed 不直接拿完整草稿列表和管理权。 | 适合明确不接受 A 范围时；但改变内嵌编辑路径，需要接受这项可见体验变化并落实交接。不是已有现成安全桥，也不能用插件点击伪装本人来偷渡完成。 |

建议给用户的准确一句话：**“是否允许 Feed 插件管理本 Home 的判断规则（可读全部定义、样本和试跑，修改草稿、试跑并发布；按现有宿主构建授权政策生效，可在权限设置关闭），以保留当前页面内创作体验？若不允许，就改由 Functions 的可信本人编辑面完成后带回已发布规则。”**

若要求“只准管理 Feed 自己的草稿”或“新增权限必须逐安装先弹窗”，两者均不是当前 A 的含义，也不是现成端口能力；须另定义真实合同，不能悄悄塞进本轮最小补线。账号选择 §4 保持 T121 后续工作边界，本报告不提新控件。
