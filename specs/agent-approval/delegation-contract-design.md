# 第 39 批有限委托与管理合同细化

状态：§2.6 为 2026-11-14 复审发现后补充的 SDK 接缝设计，用户已批准此 SDK 修复范围；其余已列范围在 2026-11-13 通过设计评审及公共合同合审。同一个 GPT-6.1 high 只读代理核过有限字段声明、Pages 首批范围、模式裁决、管理读写、命令/桌面/MCP 的真实派发接缝，可作为实现依据；最终头仍须合审。承接[本批设计 §3.1、§5](batch-39-design.md)，工作结束与存储原子性沿[已通过的设计](review-contract-design.md#32-工作边界与存储)。本稿不代表已经实现；验收仍是 [APR-07/08/11/13、ASC-51/52 与 H1](spec.md#batch-39-kickoff)。

## 1. 复杂度与责任

当前必须补的是可校验的有限范围、持久委托和跨 owner 管理投影。动作目录、安装身份、连接账号、动作 schema、最终授权检查、业务写事务及重试恢复均复用。平台不能根据插件名猜权限，也不能要求外部作者安装私有包。

采用动作主人声明的有限输入字段与操作，不增加任意表达式、用户脚本、异步目标解析器或第二个策略引擎。当前实际输入的目标只允许直接字段或声明里的常量默认值；从数据库、网络或脚本计算出的默认目标必须改为明确参数才能匹配对象级自动范围。不能证明的调用保留原确认入口。该限制针对可执行的参数形状，不取消本批对象级授权交付。

新增的可运行校验／提取工具放 `packages/plugin-sdk`，合同类型和声明放 `packages/contracts`；平台及插件共用。agent-host 负责委托记录、匹配与来源；每个业务 owner 仍负责声明与实际副作用相符。Host 仅接可信主体、原有授权 owner、目录和设置入口。

## 2. 实际输入到有限范围

### 2.1 有限声明

在 `ActionMetadata` 加可选 `delegation`，其内容全部进入授权合同摘要。取有限声明对象或 `"confirmation-only"`；后者明确禁止可复用自动委托。已有动作没有声明时仍可完整参数精确授权，不能据 `subject_kinds` 或可撤销性自动获得对象级范围。

三态补充（2026-11-13，同一 GPT-6.1 high 只读代理设计评审及 C 合审通过）：SDK 只将未声明返回为 `undeclared`，这是唯一能进入完整参数精确授权的提取结果；标记返回 `confirmation-only`，有限声明的其他失败保留原确认。准备、授予和实际执行均遵守，不能只在界面隐藏选择。标记约束新增自动委托，不禁用人工确认后的 ActionService 及嵌套调用，也不改未选择新模式时的原策略。Pages 的 `pages.artifacts.pin` 动态读取文稿／原 intent 的 Goal，`pages.revert` 从历史快照恢复文件夹和 Goal，两者都用该标记；Goals 的 `goals.deliverables.pin`、`goals.artifact_inputs.pin` 会委托前一入口，也须在外层声明，不能借嵌套 audience 转换绕过。平台不按插件 id 维护黑名单。

| 字段 | 形状与约束 |
| --- | --- |
| `targets` | 有限列表 `{ key, title, kind, field, default_value?, allowed_values? }`。`field` 是输入对象的一个顶层 string 字段；不支持点路径、通配、正则、模板或引用另一个输入字段。`default_value` 只能是 owner 声明的固定 string，缺省且无默认值表示目标不明确。`allowed_values` 若给出，只允许其中的有限常量（首批 Goal 为 `[""]`），不以名字假定 owner 已支持其他值。空字符串是明确的根目录／不关联目标值，必须由 owner 给出准确名称，不能视为任意目标。非空值必须已经规范化（值等于 trim 后的值），否则不产生自动许可 |
| `operations` | 有限列表 `{ key, title, fields, targets, when }`。`when` 仅 `always` 或一组字段“任一存在”；`fields` 是该操作允许变化的业务字段，`targets` 引用本声明里的目标键。一个调用触发的每个操作都必须获准，不能只命中其中一项就通过 |
| `control_fields` | 原 owner 保证不选择业务目标、也不增加效果的字段；首批仅实际使用的 `expected_version`、`request_id`。它们仍过原 schema、版本冲突和幂等检查，不能用于绕过未知效果核对 |

注册校验拒绝重复键、未知字段、未知 target 引用、非字符串目标字段、没有目标的操作、操作激活字段与业务字段不一致，以及没有被分类的输入属性。`additionalProperties: true`、依赖动态键或 union 才能解释的输入形状不采用该声明；仍可精确参数授权。每个操作的副作用字段属于该操作，不能把同一个字段归到几个操作以求任意命中。目标字段用于定位；若改变目标字段本身也是副作用，例如 `folder_id`，必须同时属于相应操作的 `fields` 与激活条件。控制字段不能同时是目标或副作用字段。

调用先用原输入 schema 校验，再按原值冻结 input。SDK 提取器按字段是否实际存在（不是 truthy）算全部操作和目标；**每个实际传入的业务字段必须属于一个已激活的操作**。缺目标、额外字段、不支持的值或无操作都不产生自动许可。body/markdown 等内容只在 owner 明确声明为对应操作的可变字段时变化；它们不会被解释成授权。声明新增字段、改变默认值、权限、效果或执行边界都会改变合同摘要，使旧委托不再匹配。

一条范围是 `{ action: ExactActionReference, declaration_digest, provider_installation_generation, operations: [{ key, targets: { target_key: { owner, ids: string[] } } }] }`。`owner` 是由可信目录固定的目标 provider/安装世代，不是动作提供方替其他 owner 自报；根／不关联常量不伪造对象 owner。target 的数组是用户明确选中的有限 id 集合，不能为空或使用 `*`；每行的目标键必须精确等于该 operation 的声明，缺键、重键、额外键均为无效记录，不能缺键即通配。同一 operation 中所有 target 取交集，不同完整行取并集，不把几条行的不同 target 拼成新的组合。对象身份另由项目、目标 owner 安装世代与 kind 限定，不能只按裸 id。id 在同一 owner/project 内不得被另一个对象回收；会回收 id 的 owner 必须先提供不可复用身份，不能宣布该目标可持久委托。

### 2.2 首批 owner 与真实写入

| 原动作／owner | 操作与目标 | 最后约束，不新增第二份事实 |
| --- | --- | --- |
| Pages `pages.update` | 修改内容：`title/body/markdown/starred`，目标 `id`；移动文件夹：仅存在 `folder_id` 时触发，目标 `id + folder_id`；改 Goal 关联：仅存在 `goal_id` 时触发，目标 `id + goal_id`；控制字段 `expected_version` | `written()` 不改变文稿 id，Pages 原项目范围检查和 store 的版本 CAS 保留。文件夹由 Pages 同一事务检查存在/所属项目；目标字符串要求已规范化。只有修改内容的委托不能混入移动或改关联。空串移到根／取消关联必须显式在对应范围中；非空 Goal 的限制见表后 |
| Pages `pages.create` | 新建文稿，固定操作，目标文件夹与 Goal；`folder_id/goal_id` 的默认常量均为 `""`；正文、标题、markdown、starred、template_id 可变，request_id 只作原幂等键 | template_id 选原 owner 的静态正文／标题模板，不选择额外业务目标；同样过原模板检查。新建只在选定文件夹与明确 Goal 边界内；不把返回的新 id 自动追加到“修改已有文稿”的范围 |
| Pages `pages.promote` | 保存固定成果 **并更新文稿的 Goal 关联**：两个 always 操作，都以 `id + goal_id` 为目标；控制字段 expected_version。**goal_id 无自动授权默认值**，即使原动作允许省略 | 省略时会从当前文稿或原 pending intent 取 Goal，不能用文稿 id 猜目标。`beginPublication` 的实际事务内统一比较明确 goal_id、pending 和 existing 固定成果目标，不同即拒绝且原 intent 保留。completePublication 条件更新关联也要求已允许关联操作。写前原 beforeEffect、同步 current、source_version/CAS 均保留；恢复只核原效果，不重发 |
| Pages `pages.delete`／`pages.discard` | 删除／丢弃是独立操作，目标 `id`；discard 的 expected_version 仍是原前置版本；名称明确一并删除评论 | 修改内容的委托不能授权删除。原 owner 决定可删除性，不能把副作用少的命名当作只读 |
| 连接器业务动作 | 沿相同声明绑定实际连接字段与对象字段；额外固定 connector owner 提供的连接 id、账号／租户身份、授权世代及工具／声明摘要 | 原连接调用器在真实网络派发前核账号、来源和当前授权。刷新凭据且身份不变不自行扩大范围；身份或来源无法被当前 owner 证明时不得保存持续自动范围 |
| 无可信声明的 MCP 工具 | 只保存完整 JSON 参数及实际工具身份的精确指纹；连接身份边界同上 | 参数有任何变化就不命中，包括省略和显式 null；工具 annotation 不证明只读。不显示数据库／目录宽范围的静态承诺；未改变原执行前授权和原 SDK effect 归属 |
| Coding 命令 | 原工作区身份、会话／工作 epoch、完整 command/argv/cwd/env_allowlist/timeout/background/outlives_run | 原 command document 与原 SDK pending 精确匹配；现有 elevate/network/path 的硬边界不由“记住”扩大。后续独立低风险 AI 评估器仍归第 64 批 |

服务连接的 MCP 动作沿原 `AgentActionReviewAuthority.resolveDelegation` 给出 `mcp_scope`。服务连接 owner 固定当前连接 id、修订、协议目标与声明世代，以及当前登记中的工具名和完整输入形状摘要。工作权限动作和审批执行都使用该 owner 与同一精确 JSON 范围。该字段仅由 Host 填入，页面和模型只能引用原提案。实际客户端仍在最终 HTTP 或 stdio 发送时核对原权限。连接收到请求而没有可靠结果时，由原效果进入待核对。

Pages 现状只把 Goal 关联当字符串，`normalizeGoalId` 没有 Goals owner 的当前存在/项目检查，不能在设计里写成已有该保证。首批对象自动范围完整覆盖文稿内容、Pages 文件夹、新建、删除及明确不关联 Goal 的发布；非空 Goal 关联不声明为当前可自动委托的目标，保留原确认，UI 给出原因，**完整参数精确授权也不能绕过此限制**。若要在本批加入非空 Goal 自动范围，必须先提交 Goals 当前身份的公开最终校验设计并合审，不能仅凭授予时读过标题放行。这是无法验证的跨 owner 目标的适配边界；对象级授权并未退成所有动作只能精确参数，其他可验证操作仍须交付。

目标名称不能由模型提供。复用 `platform/presentation` 的 `presentation.values`：按声明发现同一可信项目内唯一的目标 owner，批量读 subject 的 title 角色字段与 state，固定其 provider/安装世代；重复 owner、缺项、forbidden/deleted/stale 均不能用于新授予。Pages 补文稿/文件夹的该协议实现，Goals 沿它的现行呈现声明；不新增 `delegation_targets` 协议。不读正文，每次按现有上限 50 个 subject 分页；候选一次最多 50 个非空目标，按 owner 批读。空串的根／不关联名称来自字段声明，不伪造可读取的对象。没有 title 呈现声明的 owner 不能展示一个看似对象级的授权选择。声明上的 title 也沿现行词包机制，不把原始 id 当主标签。

名称合同补充（2026-11-13，同一只读代理设计评审及 C 合审通过）：目标和操作保留 `title: string`，各加可选 `title_text: TextRef`；目标另加可选 `empty_title: TextRef`，只表示实际空串目标的名称，`TextRef.fallback` 可提供默认文字，不另加一对空值显示字段。SDK 沿 `textRefProblems(..., { literal: false })` 校验，准备与授予均用可信动作提供方的 plugin_id 绑定词包；缺少合法准确空值名称时不能构造或授予对象级候选。显示字段不改 default_value／allowed_values，不增加执行许可。沿整份 declaration 的摘要，更换声明内的文字引用会使旧摘要失配；只改词包译文、对象标题不会。

该读口只为授予／当前展开详情校验身份与名称，不进入每次执行链；改标题不废除委托，也不把一份旧标题当当前事实。业务写事务仍检查对象存在、所在项目及本次版本，不能因为授予时读过就跳过。动态默认目标在本协议里读出来也不成为执行许可；实际调用仍须明确输入。

### 2.3 匹配与当前性

身份、可用性、已有禁止及强制人审先检查，之后才用新选择判定。一次判定只处理本次真实 input，保留原登记、input 指纹与匹配到的委托 id/revision/epoch；不会改参数，不另派动作。普通重试如遇效果未知先走原 SDK 的核对；即使新一轮仍有委托，也不能借新 id 重发原未知效果。

动作判定接缝细化（2026-11-13 同一代理设计及 C 合审通过）：在现有 `WorkDelegationStore` 增加 `actionDecision(subject, proposal, control)`，不另建权限服务。`proposal` 仅供可信 Host 适配器传入已通过原 schema 校验的 `view/input`、原动作提供方安装世代、按声明目标键解析的 `target_owners` 和已有更严格规则的 `confirmation_required`；它不是开放给模型或页面的动作输入。每个非空目标条目含 owner `identity` 及固定其原登记/安装世代的同步 `assertCurrent`，缺可信检查不匹配对象自动范围；实际空串常量不借用对象 owner。`control` 复用原 `prepareActionReview` 的异步检查与同步检查，须覆盖冻结登记、原安装／来源、用户开关与强制确认选择（现有 Assistant 的 `confirmAlways` 只用于 `direct`，适配器仍须补接）。方法在第一次 await 前复制事实并生成规范 JSON，拒绝 undefined、非有限数、函数等被 JSON 丢弃或转换的值，先核原控制，再读当前工作/持续权限，最后同步重核原控制与权限。目标检查只叠到已匹配对象委托的许可，原策略、普通读取和本人确认不依赖自动范围的目标登记；命中后失效仍拒绝原许可。先硬拒只读模式的写，再处理明确人审（含读取），最后放行普通读取。

返回本次冻结参数的 `input_version` 哈希、判定（原策略／只读查询／必须确认／沿用委托）和同一个 `beforeEffect/assertCurrent` 控制；只读模式的写直接拒绝，不返回可批准状态。自动匹配只消费当前 permission 的唯一选择，不把多条历史选择并集；来源使用该选择的 id/revision/grantor 和实际工作 epoch（持续选择也不拿自己的 epoch 冒充当前工作），另保留实际选择的主体供原 Run 失效登记。`permission()` 从同一快照返回 `work_epoch`，必须与原 Run 接受时固定、由 proposal 携带的工作 epoch 相等，不能在 await 后补读新工作来拼来源。原策略只在没有新选择时保留，仍遵守原强制确认，不生成新的委托来源；只读查询仅指 `operation=query` 且公开 `actionEffect(view.action, view.capability_id)` 为 `read`；effect 省略沿合同现行默认，不新造推断。显式人审优先于自动范围。未声明才允许规范 JSON 精确匹配，`confirmation-only` 和有限声明的其他提取失败都要求本次确认；对象模式用同一 SDK 提取结果核每项操作及完整目标行。安装／声明摘要不同直接不命中；`provider.kind=mcp` 不经动作精确范围绕过连接身份，留给原 MCP 判定。摘要统一复用 `actionDigest`。返回的控制保留原许可，之后出现撤销、收窄、到期、工作结束或 owner 失效即拒绝，不能重新读一条新许可替换它。该方法不写来源、不回答 pending、不发业务动作；真实调用方仍须在原 SDK pending/effect 上记录一次来源和登记原 Run 后才执行，并在最后同一调用栈调用返回的同步检查。

当前工作在聚合记录上保存一个权限选择 `mode`（未选、只读、确认、自动）及其 revision；它不是最后一轮状态。只读拒绝写、确认要求决定、自动仅在本次选定范围内自动，范围外回原确认。没有新增选择时保留原策略及有效持续委托。明确选择过自动后撤销全部范围，工作仍为确认，不能删除记录使旧可撤销策略或持续委托偷偷接管。普通再次 Send 不清除该选择或结束屏障。

一项工作同时只有一份当前范围选择；同一可信 `(actor, executor, project, installation_generation)` 也只存一份当前持续选择，不从任意多条持续授权里挑赢家。新增差额展示原范围与增加项，由用户采用后产生新委托 id，`supersedes` 指原选择；收窄不换 id、递增 revision。已结束/撤销的旧选择只留历史，绝不重新加入候选并集。只有当前选择**未设置**才可取持续范围；当前自动选择的范围为空也只回确认，不等于未设置、不回退持续。持久记录缺必需字段是损坏，不当空选择。命中记实际使用的当前或持续委托来源，一次决定只有一份来源。

| 当前工作选择 | 当前持续选择 | 结果（前面已有禁止／强制人审仍优先） |
| --- | --- | --- |
| 未选 | 不存在 | 原策略，包含原 session 命令规则；不伪造新委托 |
| 未选 | 自动 | 只在该持续范围命中时自动；写操作未命中回原确认 |
| 未选／自动 | 确认或只读 | 取更严格模式；不能新增当前自动选择绕过持续限制 |
| 确认或只读 | 任意 | 更严格模式优先，不因曾有自动范围而放行 |
| 自动 | 不存在或自动 | 只匹配当前工作范围，越界回原确认，不借持续范围补齐 |
| ending/ended 或读取失败 | 任意 | 拒绝使用该工作许可；不回退原策略，不重新打开 epoch |

读操作仍核原权限；`只读 > 确认 > 自动` 只表达对写的限制。撤销当前自动范围后保留确认模式；撤销持续选择后其后继记录也保留确认模式，避免以缺记录重新启用旧可撤销策略。新建当前/持续选择、扩大或从确认切自动，都在对应原限制入口明确呈现后保存新 id，不能靠另一条授权绕过。持续委托不能清掉工作 ending/ended 屏障。

| 入口 | 可信 work 归属及使用位置 |
| --- | --- |
| Assistant 对话与其任务面板 | 原 Assistant work owner 解析 work_id，给原 actor/project/executor/session 及 epoch；同一工作续轮沿它，不用普通 work revision 当 epoch |
| 从该工作打开连接页 | 只携原 work 引用作为选择值，Host 向同一 owner 验归属后绑定；页面 project/connection id 不能自称工作。独立打开连接页尚无工作时只能授予本人选定执行者/项目的持续选择，不能生成一个虚构“当前工作” |
| Coding 会话／任务入口 | 原 session owner 核该 session 的项目、工作区身份与安装世代，映射同一 session 工作记录；不借 Assistant 身份。后台任务原 task-grant 主体继续只读，不把它升级成写许可；真实 Agent 工作消费者只能使用其自己 owner 给的 work 引用 |

| 执行入口 | 在原 SDK effect 之前怎样接新模式 |
| --- | --- |
| Assistant `change-capability` 与固定动作工具 | 原 tool-before hook 完成实际参数判定和 prepareReview。只读 deny；确认/自动返回 SDK ask（hook 只能加严），到原 pending 后由桥决定是否沿用委托。显式模式不开放 `change-reversible`；旧模型调用它在 effect 创建前拒绝并指向 change-capability，不在 executor 内造第二笔审查 |
| 未选模式的 `change-reversible` | 保持原可撤销策略及现有强制确认；本批来源记录在真实原 SDK effect 上，不伪造用户委托 |
| Coding command 与外部 MCP | 同一 session 的 tool-before hook 按真实 origin.run 取工作选择。已选模式对非 safe-read 操作只读 deny、其余 ask；未知性质按有副作用处理，不能凭 MCP annotation 判 safe-read。SDK HookOutcome 的 tightening 盖住原 remembered approved；原 command/MCP effect 接收 gate.restrict，仍只准备一笔 |
| Session 命令记住规则 | 原 owner 是 AgentReviewQueue 的 #standing，不是 SDK learned；registerResponder 的自动 respond 在新模式确认/只读或强制人审时禁用，自动时只能沿新有限范围。未选模式保留原语义；每次决定重新核 rule id/revision，不能只在排 microtask 前取一次 |
| Assistant surface-act、站点与 run-app 规则 | 同一 hook 在原 surface effect 前按新模式加严：只读拒绝实际操作，确认返回 ask，自动也先 ask 再按原有限范围裁决；观察仍走原读取权限。站点已记住的 approved 不能盖过 hook 的 tightening。明确确认/只读或已有强制人审时不展示、不保存、不消费“本轮不再问”；不能由一次人点 approve 改全局模式 |

每个已批准但未完成的 effect 保留原批准来源及工作选择/规则 revision，在允许写来源决定／回答 pending 前登记它使用该许可的原 Run，收窄与登记仍由同一 owner 同步仲裁。管理缩权先使该引用和原轮 fence 同步失效，再取消正在用它的原 Run；这仅结束当前轮，不冒充结束整个 work。如真实宿主动作已派出，显示原结果／未知并走原核对，不声称撤销既成效果。撤销回执须等原 owner 确认取消已收口；界面立即显示处理中并说明影响该轮。

具体最终提交位置，不能仅以 SDK cancel 或 hook 返回 ask 作为证据：

- 前台与后台命令：现 SDK 前台查 stoppedBeforeDispatch，但后台并未查 Run 取消。本片在 Node 装配的原 Host runCommand/startBackgroundCommand 外包同一个可信轮次 guard，沿现有 dispatchGuards AsyncLocalStorage 传原闭包，不能按 root/session 当前运行猜身份。await 原 beforeDispatch 后最后同步核原轮 fence，再调用原 Node Host；已核现行 Node Host 从这两个方法进入 spawn 前无 await。缺应有的轮次 guard 就拒绝。原 SDK 仍管同一 effect、命令 id 与进程回执，包装不创建第二份进程账；测试须覆盖后台已批准后撤权且实际没有 spawn，以及 outlives_run 在被明确允许并已派出后的原语义。
- 命令等待补充（2026-11-13 同一代理设计及 C 合审通过）：前台命令在新异步准备中可能遭遇单条超时，此时整 Run 仍活且 Node 尚无进程；按 SDK 原 commandId 仅留本次等待的取消标记，cancelCommand 同步标失效并转原 Host、保留返回值。最终同栈核原控制与取消、移除登记并调原 Host；拒绝沿 SDK CANCELLED，finally 只清自己的登记。缺/重复 ID 拒绝，不创建新 id。实际生产包装 `guardNodeDispatch` 在 Agent Host 根命名导出供装配和公共测试使用，不进入 contracts 或插件 SDK。
- 交互 `start-command` 的 `interactive: true` 与 `command-input`：现 SDK 路径没有转交原 gate，不能声称已受确认模式约束。本片新选择模式下在 tool-before 明确拒绝这两个未接边界的入口，说明使用普通命令／后台命令或在本人明确决定后调整选择；未设置新选择的旧行为保留。原会话精确规则不匹配交互输入。将来补交互有限委托须先接原 gate 和真实 stdin 写前检查，不靠包一层新的审批绕过 SDK。
- Surface：`UiSurface.perform` 没有原 effect/run 参数，故 **每次 start 的 attach 都创建新 target**，闭包固定该次开始已存在的 actionController、stopping 与工作权限 fence；不跨轮复用 target，不在 perform 时读 session 的当前 Run。旧 target 关闭时失效自己的 fence，不能替换为新轮 guard。原 Run id 取得后只补归属，不换闭包。hostAction 的资源读取后再核，并把同一控制随 HostSurfaceDriver.perform 的可信 context 传到底层。
- 桌面真实派发：在 `HelperConnection.call` 完成 ensure 后、创建 waiting/timer 和 socket.write **之前**同步检查同一 guard；pointer/key/text/scroll/drag/menu、app 切换和文件入口的异步预检都必须保留该控制，不能只在 computer-driver 调用前检查。文件复制在 copyFileSync 前检查。拒绝不留下 waiting timer，不写失败业务记录；已发出的 input 不伪称未发送。浏览器对应在最后预检后的 CDP send 前检查同一控制。动作造成按下状态后，原调用必要的释放按现有清理语义恢复输入状态，不能借清理发起另一个业务动作。
- 外部 MCP 区分两条原执行路径：Connector ActionService 沿现行每调用 transport 的 beforeDispatch/assertCurrent；SDK 原生 `mcp:*` 也必须携原工作与所选连接的同一控制。原 `withDispatchGuard` 从单个 async 函数收为 `{ beforeEffect, assertCurrent }`，嵌套时两者均组合；所选连接 owner 的 resolveHost.assertCurrent 与原工具 fingerprint 进入该控制，不能只用 live(ref) 的工具形状替代账号世代。HTTP 在原 Host executeModelNetwork 包装里组合 input.beforeDispatch，异步复核后返回一个同步 fence，交现行 NodeNetwork 在真实 outbound.send 前调用；保留原同 handle、每次发送和原 signal。stdio 在原 Host writeInteractive 处只做同步检查再调原 Node Host（现行 writeInteractive 到 stdin.write 无 await）；异步检查须在 SDK 原单条请求取消检查之前完成，不能在两者之间新增 await，让已超时封账的请求后来发送。上下文取原异步调用，不取 session 当前 run；缺应有控制拒绝。初始化／心跳沿原连接维护 owner 的控制，不能借维护通道发送 tools/call；已发送原请求的取消通知和原连接的断开清理由可信原请求/传输归属限定，不能被业务撤权阻断或只按 method 文本放行。网络新增最终检查须保留 SDK 的应用拒绝、取消、原 fence 错误与 handle 结算，不在 executeModelNetwork 进入之前抛错。原生 MCP 这套归属未接齐前保留既有 transport 行为。两条路径都必须完成真实发送前撤权、换账号、换工具和重试拒绝用例，任何未接到最终位置的原生 MCP 变更只保留原确认，不能宣布已自动执行。

新增拒绝用例分别卡在 SDK 答复后、后台启动前、surface 旧 target 跨轮、driver 最后预检、helper.ensure 返回前、MCP HTTP 发送前及 stdio 写入前，观察真实命令/IPC/网络接口无副作用。旧 target 的 close 只清它自己的登记，不能清掉同 session 的新 target；失败启动失效并释放自己的 target。假 driver 的一次点击成功不是该证据。

直接执行与原 SDK ask 桥消费同一判定，先持久保存原 effect 的来源再派出／回答原 pending。派出前读委托一次并保留当前引用；每次效果前由同一 owner 核本条 revision、工作 epoch、expiry、状态及结束屏障，最后同步检查不能位于最后一个 await 之前。数据坏了或读取失败拒绝该主体，不回退旧策略。收窄/撤销先同步使旧许可失效，再 CAS；保存失败明确报告并保持本进程拒绝，后续可读取真实持久状态恢复或重试，不能返回撤销成功。其他条目的修改不使无关许可失效。

命中对象声明的普通调用不增加目录发现或目标读口请求：沿当前 AgentActionClient 的一次目录／检查结果计算；beforeEffect 保留原调用预算内的授权复核。持久存储只用原 SDK storage，不每调用重开数据库。连接的当前性仍由原连接 owner 检查，不为省读取而复制账号缓存。直接来源写入是本片新增的一次必要 CAS；同 effect 重复不产生第二条来源或第二次业务写入。

### 2.4 Surface 原轮绑定细化（合同分项已合审，SDK 最终释放已授权）

沿用现有 driver 与 SDK target，不增加持久化租约、代理服务或第二套审批。合同增加必填 `HostSurfaceContext`，只带原 `session_id`、`beforeEffect` 与同步 `assertCurrent`；同一个 context 对象同时标识一次原轮绑定。driver 的 identity、scope、observe、perform、描述、readiness、assess、currentApp 都显式接收它，不能只给 perform 加检查而让旧观察或审批描述去读取新轮。describeRound/noteRun/release 同样接原 context；release 是清理，允许控制已经失效，但只能清理持有同一对象的原轮。close 仍属于整个 driver 生命周期，单轮 target 关闭不关闭共享 driver。

Agent Host 每次 attach 都创建新 SDK target；每个 target 闭包将原 Run 控制与自己的存活状态组合后传给 driver，资源读取完成后再次同步检查。同会话旧 target 不复用；沿用 `PrologueAdapter` 的 `startingSessions/latestEnded/withSessionHeld` 原子占位，不新增 Run owner；新 target 可见前旧轮已终态且旧 target 已同步失效。不同 session 的浏览器独占从 attach 预留时生效，不能等 afterStart 才登记 activeRuns。旧 close 先使自己失效，只比较并删除自己的登记。attach 在任一 await 后重新核对原控制及独占状态，失败则只释放本次已创建的 targets。返回的 `SurfaceAttachment` 自持 noteRun/release 闭包，从 roundBinding 到 afterStart 的失败和原 Run 结束都调用它，不从 session 当前 map 找新目标。审批描述按 pending 的原 run id 找绑定；读取 text 资源之后再核原 run/session/effect，失效只显示原摘要、不带正文或本轮允许选项。run id 到达只补元数据，不替换控制。桌面缓存同一个真实 driver，遮蔽截图白名单按活绑定保留，不能因旧 target 关闭而误删仍被新 target 使用的 driver。

浏览器 driver 用同一 context 绑定当轮控制与节点集合，旧 release 不能清新观察、活动提示或空闲计时器。每个可能恢复导航的 ensure/session、节点读取、截图遮蔽、文件选择和 CDP 输入都把同步检查放到最后 await 后；页面活动通知现经 queueMicrotask 发出，检查仍放在实际 send 前。输入目标固定实际 session/target，不将旧预检结果送往后来弹出的窗口。按下事件在真实 send 边界记录“可能已派出”，响应丢失也只对原 session 做无文字、无命令、无点击数的必要释放；清理不能改新轮业务状态。截图遮蔽使用本次独立标记，旧 finally 不能删掉新截图的遮蔽；节点句柄释放同样只清原对象。

桌面沿现有 ComputerDesk 的唯一 lease，持有原 context 而非仅 session_id；ready 等待返回后核原控制，记录、目标、进度、帧和最后注入时间的读写均绑定该 lease。原 helper 方法最终 socket.write 使用已落地的同步检查；检查包含原轮与原目标，失效后不新增失败业务记录。输入可能派出时即标记原轮，避免响应超时被误当作没有输入；已按下的原手势由 helper 在失败时配对释放，不发新业务输入。应用退出后不把已批准动作自动改投同 bundle 的新 pid；新进程须重新观察。本人暂停、释放及 UI 预览继续走现有 owner，但异步回调要固定进入时的 lease，不能污染后来同会话的 lease。监视关闭的最终写检查原监视代次，不能在新 lease 开始后迟到关闭。浏览器和桌面已发后的未知响应由 `HostSurfaceRefusalError.partial=true` 沿 SDK 原效果链进入核对，不以普通 failed 冒充未执行；实际派发前的拒绝须证明零物理输入；若原 SDK 已持久领取 permit，则保留该派发账的实际状态，不改写成 `not-dispatched`。

分片与证据：先交原轮绑定合同和 Agent Host 消费者，再收浏览器与桌面各自真实派发边界；各片不冒充整链路验收。实际生产装配 `createPrologueSurfaces` 在 Agent Host 根命名导出，供 Host 装配与公共边界测试使用，不转出 SDK、不进插件 SDK；测试用其最小真实依赖形状控制 SDK attach/close 的交错，另由实际 Agent Adapter 用例覆盖 start 失败收尾。新增拒绝用例覆盖同会话换轮、旧 close/旧 release/失败启动、审批描述原 run、授权在资源读取或最后预检中失效，以及已派出的按下事件应有的原目标清理。中途只跑新用例；最终统一补全原 Surface、Computer 和 Agent 包规定的回归。

审批等待与批准权限分开：原 SDK 仍持有同一 open pending/awaiting effect 且可接收拒绝时，原授权丢失或正文/焦点不可读只将卡片降为原摘要、去正文与本轮许可，仍可拒绝。缺少焦点读取能力、敏感输入框或浏览器原节点不可读同样只可拒绝；普通坐标保留原位置，桌面节点展示冻结的原 selector 与不可逆提示。输入正文沿既有字段完整展示，不截为前 2000 字；资源必须是有界文本，分块长度、offset、结束标记和 UTF-8 均核对。最终展示在最后 await 后同步重核，并在入队前再次核过期时间；批准处理器捕获这次卡的完整性与准确绑定，退级后不能因后来的授权恢复而批准同一摘要卡。伪造 `app-this-round` 请求在服务端写决定前拒绝；SDK 接受正常批准后，安装许可核原 Run/绑定与已冻结的资格，不再要求 pending 仍为 open。初次 pending 投影在原 session index 队列尾重核原 waiter 与队列当前回执（含过期状态），取消后不新增待批投影。通用子任务的人审仍按原 SDK pending/effect 与实际 live Run 判断，不额外要求仅主 Run 登记的 Surface map。

临时检查失败不隐式 detach，也不把独占浏览器转给另一轮。停止意图尚在保存时，以原 stopping fence 暂拒新批准和操作；写失败可恢复同一绑定，成功接受停止后才永久释放。结束原因由真实终态/已接受停止给出。成功释放清空原 bindings 并断开原控制引用；失败才保留精确重试上下文。关闭时先封住新操作；Surface 失败不跳过原关闭链，但其他 owner 仍依原顺序关闭，任一失败就保留它依赖的 SDK 供明确重试。仅当 SDK 在关库后重抛与原 Surface 失败严格相同的错误对象时，缓存该失败；不能凭 stopped 状态、错误码或文案判断关库已完成。只有一个旧 closer 失败时保留原错误，两项同时失败才汇总。存储所有权只在实际关闭成功后归还。

关闭故障证据区分三条真实路径：原 prepare 已写入但回应丢失，SDK 最终 drain 后仍保留原未知错误；原 cancel 回应丢失后，现有 Git recovery 读回原版本，SDK 对同一 id 再次提交取消并收到确认，后续明确 close 可完成（原取消在磁盘提交两次，只有第二次得到成功回执，不声称只写一次）；读回也失败时，SDK 在 pending 收尾处即拒绝、仍为 ready，不能冒充已完成最终 drain。三条都以实际隔离 Node 存储、原 effect id 与零物理输入为证据，未核明的原记录不能被删除或换成新操作。

本片 Agent Host/SDK 采用工程证据：`security-invariants-surface-round.test.ts` 的 41 条与 `security-invariants-surface-close.test.ts` 的 3 条新增用例、两份测试的严格类型检查、Agent Host 构建及对 `origin/main` merge-base 的健康门禁通过；同一个 GPT-6.1 high 只读评审代理通过代码与公共合同合审，含完整长文本、原节点、不可逆提示、准确按钮/次数与关闭失败边界。真实 CDP、桌面 helper 派发和完整产品实操仍待各自下一片，不能据此视为已验收。

<a id="25-sdk-surface-最终释放提案需用户批准红线例外"></a>

### 2.5 SDK Surface 最终释放（用户已批准红线例外）

当前实际使用包的 `UiControl.close` 只标 `open=false`，SDK target、observation 和 plan 索引持续持有 driver 闭包，surface-list 也继续列 closed 行。每轮新 target 会放大已有生命周期缺口。只把目标换成同 session 的稳定桥还不能解决：原 observation 可在新轮生成旧 scope 的待审提案，SDK 到 perform 才比 identity。解析工具结果首行并另记观察归属虽能加一道拒绝，但会增加安全协议与事件时序耦合，不采用。

拟改动限定为原 SDK Surface owner 的最终释放，已由同一只读代理审过接口方向：保留现有 `close/get/list` 对 closed 行的默认合同，新增 `detach(ref): Promise<void>`。detach 同栈失效原 target，并移出公开 target/observation/plan 索引；重复 detach 成功，并发共享本次清理，不永久留 tombstone。正在执行的清理只留局部引用，完成后释放；不删已发布资源正文或历史 effect，它们仍由原 owner/GC 管。observe 在最后 stage/publish/register 前核原 target/epoch；prepare 在 assess 后和原 effect 写 lane 的最终保存前核，必要的同步控制接入原 chain，不以 await 前检查代替。已有尚未派出的原 effect 沿同一个 chain.cancel 取消并唤醒原 pending；detach 等这些取消收口，不另造审查或通知待批。perform 在原 claim 后、调用 driver 前再核，已进 driver 的动作保留原结果或未知结算。不得借该修复放宽已取消/撤权调用不再写业务记录的不变量。

用户已于 2026-11-13 批准：从当前采用的准确源码建立隔离上游工作树，只实现上述 Surface 释放合同及拒绝用例；评审通过后制包并更新本批 vendor、完整性/来源记录、依赖与锁文件。保持原版本号，不发布、不动真实 Home 或其他工作树，不带入无关上游更新。新增证据覆盖原 close 行为、detach 重入、关闭时的 observe/assess/effect 保存/dispatch claim 交错、长会话不堆旧 target，以及原 pending/effect 的一次结算。生产 Surface 接线须等该生命周期边界及相应 driver 都完成后启用。

失败边界：driver 关闭同一在途尝试共享，成功不重复；失败后显式释放可沿原 driver 重试。存储已接受但响应丢失时，不能把原记录当作从未存在；未核清的原准备 fingerprint/错误或 effect 引用持续保留，释放继续报错，由原 Runtime 恢复核对。SDK 关机先封住新的目标和释放请求，等待已开始的清理再关存储；未知清理不会被报告为成功。实际 Node 同栈提交前失效仍须证明零新 Effect/Pending 行。

SDK 评审补充边界：`UiSurface.assertCurrent?()` 为原 target/epoch 追加进程内同步权限检查，原 observe/prepare/recheck/commit 临界点复用它，拒绝 thenable；失败不自动结束绑定。`SystemToolInput.surfaces.guard?` 是 `createSystemToolRunner` 的可选公开构造参数，捕获同一原 target/epoch；Runtime 装配从原 Surface owner 提供。工具在等待时钟后、保存输入正文前、读取与交付观察正文前后复核，公开构造的回调同样拒绝 thenable，不新增通用资源权限层或持久记录。源码、API 快照与真实 Node/系统工具拒绝证据随受控包一起评审；零新 Effect/Pending 不能单独证明零新正文资源或零正文交付。

<a id="surface-original-target"></a>

### 2.6 原观察目标贯穿 SDK 到实际驱动（补充设计，SDK 范围已获用户批准）

2026-11-14 同一 GPT-6.1 high 只读评审代理指出并核对采用包的实际调用链：SDK 在 identity／scope 核对之后仍等待效果领取；Molis binding 随后等待当前授权和输入正文。浏览器或电脑驱动此时重新捕获页面／目标，会把旧观察的坐标或文字发给后来界面。观察路径也先按旧 scope 许可，再等待 readiness，可能把后来来源内容保存到原观察。仅有 driver 内的原 session／target 检查不能覆盖这条接缝；不接受缩减验收。

最小修复在既有 SDK `UiSurface.observe(kind, expected)`、`perform(action, expected)` 和 `assess(action, expected)` 传同一次调用冻结的只读 `{ identity, scope, assertCurrent }`。身份来自 SDK 已持有的原观察／当次身份读取，不从模型、页面或最近一次全局 identity 缓存获取；同步检查闭包保留原 target 的本次派发代次和单条取消状态，贯穿 Molis 的正文读取等待和最后发送。app 动作先使旧观察代次失效，再为本次派发固定新代次，不能自行失效。保留既有 UiControl 方法与返回形状、持久格式和公开观察记录，不加新 owner、服务、重试或读取兼容。SDK 保存观察正文之前仍核原 target；Molis 把这份原目标经 HostSurfaceDriver 合同传到底层，缺少或核不清时拒绝，不以当前目标补齐。

2026-11-14 同一代理补充 C 合审：`observe/prepare` 输入沿 `perform` 增加可选同步布尔 `cancelled`。原入口没有这一参数，保留完全相同签名无法传递本次工具取消；这是已批准范围内必要的接缝。观察只用本次取消，不写进后续动作；prepare 的取消随原 plan 进入 reviewTarget 与 perform，和 perform 本次取消取 OR，观测到取消或非布尔／异步回答后不得恢复。系统工具将同一 abort.requested 转递到资源发布、正文返回和既有检查点；保留等待人审停表和原 Run 取消，不增加轮询或承诺唤醒任意外部 awaitApproval。

浏览器在取得实际 CDP session 时与原 identity／scope 精确比对，并把同一 session、文档代次、来源和接管代次保留到每次发送；切层必须使原文档代次失效，未知 popup 来源期间拒绝 Agent 读取和输入。桌面保留原 app、pid、稳定 window id 和必要 frame／焦点事实，转换成可信的最小本机参数送到 helper，实际输入前再核；不把 opaque identity 或正文写进 helper 日志。不能证明原窗口或焦点时拒绝。显式 app 动作以切换前的原观察核验，目的地仍只由本次 action.app 指定，切换成功后仅本次动作可读新目标回执。影响不可逆判断的 assess 也核原目标；无法核清沿 SDK 既有保守判断，不降低风险。

人审卡的实时焦点／位置描述和本轮应用许可也必须核对原观察；原 Run 尚活着不足以证明原提案的界面。复用 SDK 已有内存 plan 按 exact effect 找原目标的只读检查，接入 Molis 原审查路径；不建立第二份 plan 索引，不把原 URL／opaque identity 写入页面或日志，不改持久记录。查不到或检查失败的卡沿现有降级规则只保留冻结摘要并可拒绝，不能安装本轮应用许可。采用同一评审代理建议的窄口 `UiControl.reviewTarget(effectRef)`，直接复用 `planned` 与原 `seen.target.effects`，逐项核 kind/id/revision；只在原 effect 当前 awaiting、原 target/epoch 有效且未进入 shutdown 时返回 `{ targetRef, expected }`。不依赖只按 id 的 chain.load 作为 exact 核对，不新增 Molis effect→plan 镜像。expected 是可信进程内参数，不能序列化或从模型／页面输入构造。其同步检查固定计划对象、原 target/epoch 和原轮，但不把“仍 awaiting”写进该闭包：当前 present/approve 沿 Molis 已有决定守卫；SDK 接受后记住仍核原目标与有效焦点，不能证明就不安装，避免把已接受误判成尚未批准。最终接口实现仍须同一代理合审。

补充范围仅在当前采用版本的同一个隔离 SDK 源码实施以上参数传递、原 plan 只读检查和拒绝测试，同一代理再做代码及公共合同合审，更新本批 vendor 包、哈希与来源。没有发布、版本号变化、真实 Home 操作或无关上游内容。用户于 2026-11-14 明确批准本节补充 SDK 修复；此例外仅覆盖以上原目标传递、单条取消及原 plan 检查，其他上游／vendor 红线不变。

验收沿 APR-11/13：在 SDK scope／效果领取等待、Molis 正文读取等待、单条取消及 observe 的策略等待之间切换同网址文档、跨来源 popup 或同 pid 的不同窗口，断言零业务输入、零错误来源观察正文/资源；旧目标的清理仍只释放原手势。实际原生输入和用户视觉体验另行验收，协议夹具不代替。

Host 实现细节（2026-11-14）：普通坐标卡展示原提案里的精确坐标、按钮和次数。浏览器节点卡走同一个保留 DOM 节点；文本卡在当前决定提交前把 Chrome 焦点节点附到原输入正文的精确引用，仅同一轮保有，开始派发时取走，释放时清空。同一次隔离的 Chrome DOM 序列化读取焦点、敏感属性及封闭 shadow root 证据，之后立即发输入；临时对象归原会话清理，审批和派发无需等清理答复。页面仍可能在浏览器收到输入前自行改变，最后一次查询与输入是独立请求。

桌面评估可识别的落点时，用原 SDK 动作对象短暂保留坐标和原生控件的角色、名称指纹。实际驱动重新解算选择器，核原坐标和指纹，原生助手在输入前再核。落点不可辨认或名称被截断时逐笔审。同名同角色控件会有相同指纹。取出文件需原观察窗口的文档路径摘要，并在写前复核原路径；摘要约束窗口指向的文件路径。原生树和焦点从验真的 AX 对象读取，AX 文本写入也只交给该对象。原 helper 明确成功回执一经收到，跟随读取失败便省略后续视图，撤权后也不写后续记录；响应缺失或明确部分执行仍待核对。观察收到窗口变化则拒绝发布。无可证明窗口时回到应用列表，下一次仍能重新选应用。单键按下后的松开只送原进程，避免 Tab 改焦点时把成功的按键标为部分执行。

## 3. 委托动作与可信入口

公开服务仍放 `services/agent-host`，动作以 `agent.delegations.*` 登记一次。`prepare` 为只读候选，可供 Agent 提出范围；`grant/narrow/revoke/mode` 只给有权限的真人入口。输入只能选择工作引用和候选范围，actor、project、安装、工作 epoch、来源、grantor、声明摘要均由实际 owner 从可信上下文核出，不能接受客户端自报。工作引用也必须在原工作 owner 下验归属，不能用同名 id 代替。

`prepare` 返回可展示候选及不可用原因、当前 owner revision、准确动作和范围；候选不保留执行闭包、不算授权。`grant` 带用户所见的工作 revision、候选合同摘要和新增范围；重新核目录、目标与工作，再用 expectedVersion 保存。失效候选返回冲突及当前投影，不自动读新版本重新授予。`narrow` 只接受原目标集合和操作行的子集、相同身份与声明，不接受新目标、延长到期或换 scope；`revoke` 单向置 revoked；`mode` 向更严格切换可沿当前选择，放宽按 grant 明确呈现差额。结果携 owner 新 revision 与投影，不另让页面猜成功。

工作 record 的存储版本和条目的 revision 分开：CAS 可因别的条目更新而冲突，但仅实际被改条目的执行许可失效。grant 的 scope 必须完整验证后一次写入，不允许部分成功。工作结束用已通过的 ending/ended 协议，不逐条调用 revoke。当前性读取、条目变更与工作终止共用 agent-host 的单一 owner，不另建一个 Host 可写的索引。

## 4. 统一管理的公开投影

管理仍挂现有设置外壳，布局沿已选 B。公开 `agent.authorizations.list/read/change` 动作只给可信用户入口，调用方没有给自己授权的入口；聚合由 Host 装配 agent-host、原 MCP/task-grant、原 Assistant 与原内存规则端口，不为这些事实再建表。

`list` 的输入只含可见项目过滤与 owner 类别过滤；项目必须在本人可管理范围内。输出 `{ entries, owners }`：entry 有稳定 `{ owner, id }`、原 owner 并发 token、调用方/项目/工作显示名、范围摘要、方式、结束条件、状态、来源、可执行修改及不可用原因；`owners` 给每类完整／失败状态。部分失败保留成功条目并显示缺口，全部失败显示错误。列表不包含完整命令环境、敏感参数和历史正文；需要这些的 `read` 只读取当前选中项。

`change` 是按 owner 分辨的有限 union，包含原 id 和原 expected token，不接受客户端路由、任意动作名或属性 patch。owner 的真实结果决定成功与新投影；保存期间立即反馈，失败保留尚未保存的选择；冲突显示当前状态，让人重新决定，不自动覆盖。首版每次修改一条 owner 事实，不能声称跨 owner 原子批量撤销。

| owner | 允许的 change | 并发与撤销后果 |
| --- | --- | --- |
| work-delegation | narrow / revoke / 更严格 mode | 工作 record CAS + 原条目 revision；保留 tombstone，结束屏障优先 |
| run-app / session-command | revoke | 精确原 run/session 与规则 id/revision；在原 owner 同步比较并删除。已结束则已失效，不恢复到新 run/session；不能在此页延长生命周期。run-app 的具体 owner 调整见下文，不能误用 SDK forget(match) |
| task-grant | narrow / revoke | 原 `set(categories, expected_revision)`；按类别收窄，不能使用 confirm 来采纳新增动作，撤销 set([])。原 API 不支持类别内单动作收窄，UI 不提供该控件、不走无 CAS 的 clear |
| mcp-client | narrow / revoke | 原串行更新队列内比较完整键及 generation；无持久记录的默认开放项用 expected_absent；只移除动作或 disabled，不把删 permissions 伪装为该动作的部分授权。改完沿原 generation 失效链拒绝在途旧许可 |
| assistant-policy | 更严格 mode / 禁用动作 | 原设置 owner，精确动作引用；读取后的内容摘要作为 expected token，在原写入口队列内比较，旧页面不能覆盖新的强制确认。旧数据形状不增加 revision 字段；不挪用 MCP caller |

现行 run-app 使用 SDK boundToRun，SDK remembered() 不列它，forget(match) 会同时影响其他 run，releaseRun 会清整轮并永久封住该 run。本片不改 vendor；把这一项现有授权的唯一 owner 收回 AgentReviewQueue/Prologue approval bridge，和会话命令规则同样在原 pending 后以可信内部 respond 应用。停止调用 SDK effects.remember(..., {run}) 保存 app 允许，原 SDK surface ask 保留；列表、精确撤销与原 Run 结束都操作同一份内存规则，不镜像 SDK 规则。来源为 `policy/agent.run-app`，绑定原人决定、原 run 与精确 bundle id，只覆盖 `subject.surface === desktop`、`subject.action !== app` 且原 kind 为 mutate-local/user-visible 的操作；不覆盖切 app、发送/保存文件或 mutate-external。更严格模式优先。撤销先删原规则并失效已选引用，再取消使用此来源的原 Run，按上节的真实派出拒绝证据验收；不凭一次内存 delete 宣称在途写已停止。

旧设置页也必须使用同一并发写口：MCP 原 GET 返回 generation/expected_absent、POST 必带所见 token；原 `with` 会同时写主动作及所需动作，**每个实际改写的完整键都必须带各自 token**，在同一队列内全部比对后原子写入，一个冲突就不写任何一项，不能只查主动作。Assistant 原设置 GET/POST 共用原 owner 的内容摘要 token，检查与写入在同一事务。没有 token 不能为旧客户端降级放行。MCP/task 修改在原文件队列内比较 token，临时文件写完后重新核当前调用权限，再在最后同步检查之后用同步 rename 发布；等待队列和写临时文件不能扩大许可寿命。失败只保留/清理自己的临时文件，不返回业务成功。原文件格式和 Assistant 表结构不变，不加读取兼容。

首屏默认聚合本人可管理的已存事实，不按“全 Home × 项目 × client”发现。客户端身份来自现有认证客户端记录与 retained grants 的并集；无持久 grant 的默认开放能力在选定一个 Home/项目和具体 client 后读 metadata 显示。列表一次读取 MCP 文件、一次读取 agent-host 委托集合、一次读取当前内存规则、一次读取原 Assistant 设置；每个实际选定 scope 的 metadata/安装快照可复用，最终 availability 不能跨 client 或任务 caller 共用。列表未知可用性如实显示，展开才由对应原 owner 按原 caller 读取当前 availability；原 metadata/availability 两阶段按实际两次计，task 原 agent:prologue 目录也另计，不能伪称只有一次发现。最近使用没有原 owner 事实就为 null/未知，不增加每次执行写一条的追踪库。

owner 变化沿已有 Home/工作事件失效；如现行事件不能表达本项，登记一个 `authorization-changed` DOM 事件供同页刷新，不增加轮询。事件只是重新读取的信号，不能携授权事实或使未保存操作成功。

## 5. 必需证据与合审点

新增用例要走真实 SDK 提取器、agent-host 存储与最终动作路径：不能以复制匹配逻辑的测试证明边界。验收编号仍附原 APR/ASC/H1，不另造完成目标。

- APR-07/08：只准改正文的委托混入 folder_id/goal_id 被拒；多操作请求缺一个不放行；目标空串、缺字段、null、未知字段、换 provider/安装/声明被拒；Pages 省略发布目标不命中，恢复快照与明确目标不一致在写 intent 前拒绝。
- APR-11、ASC-51/52：同一对象正文变化、跨轮/等待/重启可继续；工作停止/归档崩溃交错不能复活；收窄/撤销与派出/写前检查交错，观察实际业务记录；持续委托不能越过当前工作模式或结束屏障；未设新选择的旧工作保持原策略。
- APR-07/12/13：原 SDK pending 自动沿用一次委托来源，保存失败不派发；显式人审与 Memory 最终确认不被自动模式绕过；无声明 MCP 工具只有完整参数相等可命中，未知效果核对不重派。
- H1：各 owner 列表与部分读取失败；旧页面覆盖刚撤销授权被拒；连续两次收窄不能勾回范围；MCP 默认项并发新增后 expected_absent 失败；任务授权保持只读；返回投影反映原持久事实，外部客户端和在途许可实际失效。
- 调用次数：一份含多条/多客户端/多任务的管理请求记录每个 owner、目录与库打开次数；对象级连续执行没有每条权限额外 discover；新增目标读口按 owner 批读，不按 id 逐个请求。

以上设计由同一只读代理分段核对并合审通过；运行时最终拒绝、真实 MCP 工具调用沿用原轮/连接、维护帧不代业务授权，以及 HTTP 拒绝时的“未发送”回执仍须实现与验证，不能以稿件通过替代。已经通过的来源／结束协议不重复另造。此前占用 platform/actions 的 [#2017](https://github.com/molis-ai/molis-work/pull/2017) 已于 2026-11-13 合入；最新认领未显示新的该子路径占用，批内不提前同步 main，最终统一处理合入差异。
