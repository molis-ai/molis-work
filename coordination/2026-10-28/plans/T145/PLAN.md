# T-145 / BL-710 实施（负责人：开发线 1 · Codex）

状态：**2026-11-01 10:58Z根正式接受为执行书，开发线1接手完整实施；开发线3继续PR1c。** T394组合H090fcfa4cdf197419f4f48084bb46a3d5f87d854已冻结，可在独立树以此候选为父开发；最终发布/采用仍排T394实际采用后。S-106确认留给本项。下文旧快照/WAIT为工程准备时的历史事实，当前授权以本段及末尾执行窗口为准。 唯一产品需求仍是 `specs/repository-anti-corruption/slices/pg011-pg017-remaining.md` §8、§10 D3、§11 G；编号沿用 RAC-2644～2649。本书给出其实现与验证合同，不另立产品范围。

目标完成等级：后续在隔离 Home 达到功能可用，项目设置本人同意、真实页面/Agent 触发 Home 包、项目动作读写、撤回/升级/卸载/删项目/重启完整闭环。`full=true`，工程、CI/Full、真实环境与用户验收分别结算；本稿不宣称任何动态通过。

## 1. 基底、依据与开工缺口

只读固定对象 `b0567bf545a74b858e4fdeddd5e66432b1065b21`（本轮开始/结束本地 origin/main 均为此头），主检出 `08c9933d57e153d1d59bf2811f203056d4358992` 保持干净。未 fetch、未改 refs、未查询/写入 GH。所以这里不是远端最新锁与 PR 状态证明。实施派单时由统筹刷新组合头和锁。

检索现有 `coordination/2026-10-28/tasks` 与 `plans` 未见独立 T-145 等价执行书；相关命中是 T-139、T-141、T-122、PG011-017 总计划、T144 方案。沿 accepted §8 编号补此工程候选即可，不新造 RAC/BL。T134 已采用按本轮交接承接；T141 只有 `coordination/2026-10-28/plans/T141/PLAN.md` 与 FINAL-REVIEW.md 的 WAIT 候选，未实现。其最终审查不证明 T145 可用。

**accepted §8 的第一步核查未闭合：静态确认签名 Home 包当前没有完整的“外层项目 → 沙箱下行目标”链。** 不能把普通 Home 插件的可达性当作沙箱包已有能力，不能用请求输入 project_id 补洞。本稿向统筹报此缺口并给出最小接线候选；依 §8，实施保持 WAIT，统筹采纳此接线边界后才进入具体实现，已定产品语义不重问。

| 当前真实链/owner | 核到的事实 | T145 要完成的边界 |
| --- | --- | --- |
| `home-plugin-http.ts` 的 routeProject / projectRouteControl；`plugin-page-actions.ts` | 项目前缀经宿主核项目存在及该插件可达，Host-issued control 携带项目；普通插件经 `plugin-actions-client.ts` currentPluginInvocation / callScope 使用外层项目 | 复用可信入口和原 authority，不读 body/query/page_context 中的项目冒充身份 |
| `plugin-runtime/action-provider.ts`、`action-scope.ts` | 普通 Home 动作的 Runtime scope 保存真实外层 caller；内置 `projects:reach` + `project_reach:person` 是另一机制 | 不给沙箱包继承全项目权限、不把 readable_project_ids 当逐项目授权 |
| `home-plugin-http.ts` 包页面分支 → `HomePluginHost.packageDocument` → `plugin-builder/agent-surface.ts:renderHomePackageDocument` | 即使页面从项目打开，现有包 frame/call 路径仍无项目前缀，page authorization 以 null 打开 | 项目 frame 必须沿真实项目入口建立 page authority 与前缀，Home 入口仍 null；不能靠前端附加 input.project_id |
| `plugin-builder/exposed-actions.ts` → `installed-plugin-exposure.ts` → Runtime route | exposed handler 拿到 ActionExecutionContext；exposure dispatch 只拷 signal/beforeEffect/page_context/locale/assert_authority_current，未传项目 | 从真实 action context 建立每次调用的宿主 subject；页面和 Agent 路径均要覆盖，不只修 HTTP |
| `plugin-builder/installed.ts` → runner → broker → `plugin-builder/catalog.ts` | sandbox identity 取 activation 的 project_id（Home 为 null）；catalog 在 Home 仅固定 Home，运行前依赖预检也用此目录；runner 保留每次 control/reenter，但没有项目 subject；sandboxCaller 要求 identity.projectId 等于 actions.project_id | 增加宿主侧每次调用目标，贯穿预检、策略绑定和实际 dispatch；安装 identity 仍 Home/null，不能改成目标项目或放宽原一致性检查 |
| `home-installed-plugins.ts` | record/manifest、publisher standing、approvedFor、live、catalog/exposure 都由同一 Home controller 管 | T145 在这个 owner 接入现有 ledger 与 per-call 项目 client；不造第二个 Home controller/授权账/全项目目录 |
| `consent-ledger.ts` / `HomeConsentLedger` | 唯一同意表只认四个 kind；活动唯一键不含 digest；record 遇同 subject 活动行不再写，历史行不可改写/删除 | 加 project_reach；精确 subject；重问后必须撤旧并写新，不能以重复 record 假装更新 digest |

RAC-967 原测试的失败点在运行前 Home catalog 缺少项目依赖，不是仅 HomePluginExecutor 的 null。只改后者或只加同意开关都无法闭环。原 RAC-966 Home 能力成功与 RAC-968 项目可见集合约束继续保留。

## 2. 唯一授权事实及升级合同

### 2.1 账本与 subject

`PluginConsentKind` 增 `project_reach`。subject 由 Runtime 的单一 helper 生成/解读，形式采用 `JSON.stringify([project_id, install_id])`；两值均来自宿主已核的项目上下文与当前 Home 安装记录，不接受用户提交 subject、publisher、digest、granted_by。ledger 仍以 plugin_id、publisher_signature、kind、subject 找活动行；granted_by 必为 user。项目设置选择的 plugin_id 只是查询目标，服务端解析当前安装，不信输入 install_id。

所有读写继续走 PluginConsentLedger / SqlitePluginConsentLedger，Host 不直接写 plugin_consents SQL。新增精确 owner 方法用于：按项目撤回、按 Home 安装撤回、同 subject 重新同意时原子撤旧/写新；Memory 和 SQLite 语义一致。操作幂等，历史保留 revoked_at，活动同意清零而非删审计行。既有 host_build 不替沙箱包授予 project_reach，安装 preview 的通用 consents 输入也不能拿此 kind 绕过项目设置专用入口。

CHECK(kind) 与批准集合列属于同一次现行库结构变更：同步 `PLUGIN_TRUST_SCHEMA_SQL`、Home store 完整 baseline 与独立 schema fixture，**版本保持 1**。不新增迁移、维护转换工具、读时补列、ALTER、旧记录推断或回填，不以升版本绕过结构核对。旧形状明确拒绝且库字节不变；缺库的只读/删除清理路径不创建库，现有 clean-home 拒绝不变。

### 2.2 manifest_digest 不是可达名单

沙箱 Manifest 当前 `capabilities.consumes` 基本仅 presentation；实际名单来自签名包 `contract.operations[].effects.capabilities`，`sandbox-package.ts` 校验整个包，`SandboxPackageStore.load` 重验签/形状/代码。**不能用 consumes 比较代替真正的能力声明，也不能简单要求升级后 digest 相等。** 版本变化会改变 manifest_digest，RAC-2649 明确允许同安装升级沿用。

根已明确采用 D1：历史批准事实写在**现有 ledger 的同一条 project_reach 记录**，字段定为 `approved_capability_ids`，不建第二份授权账。合同按 kind 判别：project_reach 必填 `readonly string[]`（允许空集合），其它 kind 必填 `null`，缺字段不等于 null，旧形状拒绝。SQLite 在同一表保存集合 JSON 列，null 为 SQL NULL；结构约束与 owner 校验一致，Memory/SQLite/Home facade 和所有输出 schema 同步。

1. 本人 grant 时，Host 从当前安装对应的已验签 signed contract 读取**全部 operation 的 `effects.capabilities` 中的 capability id**，求并集、去重、按稳定字典序排列为 Dgranted。这不是 `operation.id` 集合，不按当前目录存在性或 scope 过滤，不 trim/改写已校验 id。复核当前安装/世代/版本后，将 subject、原 manifest_digest、granted_by=user 与 Dgranted 一次提交到同一记录。请求不能自行提交批准集合。
2. `manifest_digest` 保留“本人此次同意时的 Manifest 摘要”原义，不改成集合摘要。当前声明归签名包、当前安装 effects 批准归原 approvedFor、历史项目同意归 ledger。owner 严格校验 canonical 集合与 kind；写入时复制输入数组，record/list/revoke 等所有返回值逐行复制数组，避免外部 mutation 改写 Memory 历史事实；SQLite 解析结果同样不共享可变引用。readonly 类型不能单独作为防线。
3. 每次调用从当前 verified contract 得出 Dcurrent，核 plugin/publisher/subject/本人/未撤回/安装与世代/生命周期，再判断 **Dcurrent ⊆ Dgranted**。成立便沿用原行，即使 manifest_digest 因合法升级变化，也不重写摘要或集合。新增任意声明 id（含只在 Home 使用、当前未安装或不可达的 id）都重新确认；这是根明确接受的保守声明口径，不能说成只比较项目动作。当前 operation effects、安装 approvedFor、目标 audience/permission 与 provider/version/policy binding 检查全部保留。
4. 扩大后原行保留历史，但不能授权新版本的项目调用；纯 Home 目标仍遵循原 Home 权限路径。项目设置准确显示“声明的动作增加”及新增 id/可读名称，不声称新增项全是项目动作。升级总确认不等于逐项目同意，不自动给所有项目重授。重新确认由 owner transaction 撤旧并写当前 digest/Dcurrent 新行，取消零写入；过期页面先拒并刷新。捕获的 consent_id 在尾检仍须等于当前活动行，撤回再授不复活旧调用。
5. 重启读取同一 ledger 历史集合和当前 verified release 得到同样结果；不扫描历史包，不新增按摘要查询，不依赖历史包永久留存。旧版本包缺失不再成为项目同意失效条件；当前运行包缺失/验签或形状失败仍按原安装链拒绝。收缩可沿用原集合，之后超出原集合才重问；不能用当前声明自动回写或扩展历史集合。

### 2.3 与 T141 的依赖/接线，不冻结候选函数

T141 必须先实现且交付：同发布者同 install_id 的真实 Home 升级、当前 manifest_digest/版本事实更新、当前包可验签读取、失效实例/尾效应拒绝、失败一致恢复；准确 API 以其采用头为准。T145 不预先调用不存在的升级 hooks、不重写 T141 source/secret 补偿，不假定其规划中的新返回字段已存在。

T145 主要采用**调用时复核**，不要求 T141 升级时批量重写 ledger，因此升级失败自然回读实际恢复版本。接线合同是“当前 Runtime record + 当前 verified release + 同一 ledger 历史批准集合 + 同一生命周期尾检”；不要求 T141 提供历史包保留、摘要索引或授权迁移 hooks。测试必须从公开 preview/confirm 升级，不能直接改 version 或 digest 骗过依赖。

T134 的安装/连接 owner 身份不动；安装 identity 与本次目标项目是两个不同维度。改目标项目不得切换包的 secrets、数据库、存储 owner 或连接绑定。

## 3. 外层项目下行接线候选

1. 在已通过 page/Agent 网关检查的入口，捕获不可由插件造出的每次 subject：目标 project、当前 Home install_id/installation_generation、真实外层 authority/cancel。名字只是内部类型，不向 worker SDK 或业务输入加 project 参数。HTTP 复用 Host-issued routed control 校验；exposed action 从 handler 的可信 context 发放。不得对任意结构相同的 object 认领身份。
2. 原 `HomePluginExecutor` activation caller 继续 project_id:null。Runtime action scope 仍管理外层生命周期。沙箱 route 获取 Host 认证 subject；runner 的每次 call control/active record 传 broker，既有 reenter 用来保持上下文，但不假定继承 ALS 自动得到缺失的项目。subject 不编码进入 worker message；插件传假的字段无效。同 runner A/B 两项目交错各保留自己的 subject，call 结束后失效。
3. `installed.ts` 依赖预检、capabilityPolicyBinding、limits 与实际 `catalogCapabilities.call` 使用**同一次 subject 的目录解析**。项目目标在项目 client/inspect 下选择真实 provider/version；Home 目标仍使用 Home client/identity（特别是 model.generate.home 的当前规则），不能把所有下行调用都替换成项目 client。无项目 subject 时项目动作拒绝，Home 动作照旧可用。
4. Host call-bound resolver 先查当前安装/发布者/项目存在与插件可见性/ledger 授权，再从现有目录取目标；每个 awaited 操作后及最终 effect 前复核同意、安装世代、调用结束/取消、目标项目可达性。scope.project_id 是 Host subject 的目标，sandbox identity.projectId 仍 null。`catalog.ts` 原 project-installed 的 identity===project 检查保持；Home→project 只走持有宿主有效 subject 的显式分支，不删除比较。
5. 宿主签发下行 caller 的 plugin_install_id/host_plugin 仍来自 Home 安装，project_id 来自 subject；permissions 仍取已批准 capability 的目标权限，audience 为 plugin。不升级为 user，不从 subject 推出 actions:delegate。只同意范围不突破 per-operation effects、安装 approvedFor、S-15、query只读与目标的 audience/permission。
6. 发现/availability、执行前依赖检查、最终调用三处均不可只看同意而跳过真实目标状态。原全 Home catalog 的全局缓存不能按最近一次项目覆盖；项目目录按调用解析，任何 cache 只能是可丢派生值且不能缓存授权成立。公共 exposed action 的成本刷新不能用单一项目偶然的结果给所有项目定价；保留 unknown/现有 conservative 行为，并在实际调用以该项目目标的策略限制。
7. 没有触发项目的 Home 调用、启动、自发 timer/后台工作拒绝项目目标；不能从历史上最后一次调用、全局“当前项目”、body.project_id 或 background.saved input 恢复。保留既有有独立授权的后台机制，不在此单扩大后台项目授权。
8. query 延迟返回前撤权应拒结果；command 若已实际提交后才失权沿用 outcome_unknown 语义，不伪称回滚或零写入。测试的“零写入”屏障须停在业务 effect 之前；不改原未知结果防重复调用行为。

真实页面从 `apps/local-host/src/web-request.ts:181–183` 的项目 view 接线：把已核过的 hostReference/项目交给 `home-plugin-http.ts:renderHomePluginStages`，将项目 prefix 传入已有 `installedStageSection`（该 helper 已支持 prefix，无须为此修改）。`home-plugin-http.ts` matcher 当前只收项目前缀 api/plugins 与 side，须准确增加 `/projects/<id>/plugins/<id>` 的包 frame 路径；经 routeProject 再核项目存在/插件可见，继续传到 `HomePluginHost.packageDocument` → `renderHomePackageDocument` 的 frame/call 前缀与 `pluginPagesFor.open` 项目 authority。不开放项目前缀管理路由，不取 body/query/page_context 身份。Home 自身入口仍空 prefix/null。`PluginPageAuthority.bind` 的路径/页面项目匹配、安装世代、删除项目关闭页面都保留。Agent 路径从实际 project action client 进入同一 exposed action，再经 subject→broker；测试不需要真实模型账号。

## 4. 项目设置、撤回、删除与恢复

入口复用项目设置插件页。对已安装 Home 包显示包/发布者、当前项目、已声明能力及同意状态（未同意、已同意、声明的动作增加需确认、包/库不可读）。本人明确同意或撤回；提交中禁止重复，取消不发 mutation，失败不乐观标成功，刷新从事实 owner 读回。中英文与错误文本同步。Home 全局权限设置保持原含义，不能替代逐项目入口。

新增 project-scoped action 候选 `plugins.project_reach.list@1` / `grant@1` / `revoke@1`，输入以 plugin_id 选择对象、以预览版本/摘要作**并发前置条件**，不作为身份授权；project 从 caller。action 位于现有 consent owner 模块，由项目设置 HTTP 可信入口签发独立 entry credential。既有 `assertPluginConsentSettingsEntry` 强制 project_id=null，不可放宽成“两者都行”；复用其 WeakSet 入口范式，独立 project-reach credential，拒绝 Agent/MCP/workflow/plugin/delegation、复制 user_action、Home门凭证及错项目的入口。请求额外 actor/project/subject/install/digest 授权字段由严格 schema 拒绝；正确 snapshot token 也须和当前 owner 比。

同意 view 增 approved_capability_ids，project_reach 返回规范化数组，其它 kind 明确返回 null；所有暴露新 enum/字段的既有 list/revoke output schema 按 CONTRACT-CHANGES 升版并同步调用方/快照，Memory/SQLite 与公开输出一致，不把新形状塞进旧v1 schema。不新建 MCP 特权入口。全局同意列表若展示 project_reach，只做事实展示；project_reach 的修改由对应项目设置门完成，避免全局 revoke 与项目门形成未定义的第二修改入口。

安装列表也输出同一同意记录：`apps/local-host/src/plugin-install-actions.ts:33–44` 的 `consentRow`（additionalProperties:false）经 `installedView.consents` 被 `plugins.home.installed.list` 与 `plugins.installed.list` 使用，必须同步新 kind、必填 approved_capability_ids 及数组/null 形状。原审查基点两动作分别为 @2/@3；实施按**最终采用基点顺延版本**，不冻结未来版本号。handler 已从 descriptor 读取版本；实际调用链为 `plugin-permission-settings-http.ts` 的 `/api/settings/plugin-permissions/list` → homeInstalled，以及 `plugin-trust-http.ts` → installed，再由 `settings-plugins.ts` 消费列表。逐一同步/核实实际 descriptor、响应类型与列表解析；已自动跟随 descriptor 的调用方不为凑差异改动。`plugin-install-service.ts` 两份 list 经 installedPluginViews 读取同一 ledger，保持该数据来源。更新 `tooling/gates/actions/host-actions.tsv` 两行动作版本/输出形状及 `tooling/gates/api/contracts/platform/plugin-trust.txt` 的同意记录合同；其它受公开导出影响的快照按生成结果同步。此补项只改输出合同及调用方版本引用，不改变安装确认输入、权限或流程。

卸载：沿 `HomePluginExecutor.uninstalled` → 现有 `forgetInstallationRecords` owner 清理路径（或最终采用头中的等价真实 hook）撤本 Home 安装的全部 project_reach，**keep_data=true 仍清授权**；prepareReinstall/同安装 id 重装前先处理上次未完成清理。停用只使调用失效，不等于撤回；再启用要读当前行。错误不可吞掉：已变 uninstalled 即拒调用，清理未完要可重试，重新安装不得复活旧行。

删项目：唯一入口仍 `ProjectDeletionService` → catalog `ManagedProjectDeletion` → `ProjectDeletedHooks` owner step。在 `project-deleted-owners.ts` 注册 ledger owner 的幂等清理（包括 Home 服务未启动时；缺库先经只读存在性检查返回零，不进入可创建库的写入口），通过 HomeConsentLedger 调 Runtime 方法，不能只在“运行中的每个包”循环。catalog 去项目后调用即拒，清理失败保留既有 pending receipt；重启/sweep 重试；同 id 重建经 settleProject 等待清理，无旧授权。不要另加删除 endpoint、私有任务表或 receipt。维护历史 revoked rows 的清理规则不在此单。

恢复：同一临时 Home 重开后从存量 ledger/包/安装重新推导；没有内存特权。撤权/卸载/删除与旧调用交错，旧 authority 被拒，后到新调用只按新事实；撤回再授予不能让撤回前捕获的旧调用恢复（以捕获 consent_id 与当前活动行一致性尾检），grant事务不抹掉撤回事实。

## 5. 精确路径与锁（候选写集，当前均未授权执行）

**本轮只修 `/private/tmp/t145-ready-plan/PLAN.md` 并生成同目录 `accepted-section8.patch`，不应用到仓库。** 以下供统筹派单核定，未列路径不自动允许；条件路径确需变化先更新同一稿。共享文件均串行接力，不让 T141/T143/T144 与 T145 同写。

| 责任 | 后续候选路径（仓库相对） | 依赖/锁 |
| --- | --- | --- |
| 同意合同与owner | `packages/contracts/src/platform/plugin-trust.ts`; `packages/plugin-runtime/src/consent-ledger.ts`; `packages/plugin-runtime/src/trust-rules.ts`; 必需公开导出 `packages/plugin-runtime/src/index.ts`; `apps/local-host/src/home-plugin-store.ts` | shared contracts/Runtime；现行schema/baseline/fixture同步，版本1，无转换 |
| 安装列表输出合同补项 | **`apps/local-host/src/plugin-install-actions.ts`**：consentRow、installedView 及 homeInstalled/installed 两动作输出与版本；实际调用方核对/必要引用同步限 `apps/local-host/src/plugin-permission-settings-http.ts`、`apps/local-host/src/plugin-trust-http.ts`、已列 `apps/workbench/src/settings-plugins.ts` | 纳入共享合同锁，按最终基点顺延动作版本；数据来源 `plugin-install-service.ts` 只核对不新增写许可；不改安装确认权限/流程。准确快照候选 `tooling/gates/actions/host-actions.tsv`、`tooling/gates/api/contracts/platform/plugin-trust.txt` 仍由根串行采用 |
| Host 授权与包证据 | 新 `apps/local-host/src/plugin-project-reach-consent.ts`; `apps/local-host/src/home-installed-plugins.ts`; `apps/local-host/src/home-plugins.ts` | T141/T143 Home接线必锁；T141未实现，不提前改其升级代码 |
| 每次 subject/沙箱 | 新 `apps/local-host/src/plugin-project-reach-subject.ts`; `apps/local-host/src/installed-plugin-exposure.ts`; `apps/local-host/src/installed-plugin-definition.ts`; `apps/local-host/src/plugin-builder/installed.ts`; `apps/local-host/src/plugin-builder/catalog.ts`; `packages/plugin-sandbox/src/runner.ts`; `packages/plugin-sandbox/src/broker.ts` | T143 broker/model及T144 installed/host重叠锁；新模块仅各自一职责，不建通用权限框架 |
| HTTP/page 接线 | **`apps/local-host/src/web-request.ts`**（项目view到stage准确入口，需统筹确认锁）； `apps/local-host/src/home-plugin-http.ts`; `apps/local-host/src/plugin-builder/agent-surface.ts`; 条件 `apps/local-host/src/plugin-page-authority.ts`; `apps/local-host/src/plugin-consent-settings-entry.ts`; `apps/local-host/src/plugin-consent-settings-http.ts`; `apps/local-host/src/installed-plugin-consent-actions.ts` | T401已采用能力须保留；Home页面T142相关现状开工再核 |
| 项目 provider/settings 注册 | `apps/local-host/src/project-host.ts`（已核 pluginConsentProvider 装配）；条件 `apps/local-host/src/web-catalog-index-routes.ts`（已核 handler 注册）；`apps/workbench/src/settings-plugins.ts`; `apps/workbench/src/i18n/plugin-trust-en.ts` | provider注册点可能由原consent provider自动纳入，不另建名单；T141/T143/T144设置页锁 |
| 清理 | `apps/local-host/src/plugin-installation-cleanup.ts`; `apps/local-host/src/project-deleted-owners.ts`; 条件 `apps/local-host/src/home-plugin-executor.ts` | 只接真实卸载清理；不改ProjectDeletionService语义、不做第二删除路径 |
| 配套合同 | 条件 `packages/contracts/src/platform/plugin-routes.ts`、sandbox出口/index，仅真实host-only类型需要时；不改worker SDK call参数 | 优先用既有control及宿主证明；确需公共形状变更进API快照 |
| 测试必写候选 | 新 `tests/home-package-project-reach.test.ts`、`tests/home-package-project-reach.e2e.test.ts`、`tests/fixtures/home-project-reach-package.ts`; 原 `tests/security-invariants-sandbox-home-instance.test.ts`、`tests/plugin-trust-rules.test.ts`、`tests/clean-home-plugin-stores.test.ts`、`tests/home-store-baselines.test.ts`、`tests/project-deletion-service.test.ts`、`tests/project-deletion-owners.test.ts` | 新fixture仅造签名前包，复用sandbox-package工具；不改T141/T143占用的home-sandbox共享fixture；RAC-967旧文件与T141串行 |

共享文档/生成物只交精确候选，由统筹串行写：accepted slice §8状态/证据、SI S-106及受影响S-15/S-84分句、BACKLOG/privileges、适用README、`tooling/gates/api/`、`tooling/gates/actions/`、baseline/giant/page-assets必要增量。保护 PR #1101/#1064/#1059/#784/#734/#1324 不动；不改 CI/控制标签/门禁来放宽。T141 的 #1672 registry、T143 Home 等锁仅按其交接保持 WAIT，不能从本地无修改推断释放。

注册点已核为 project-host.ts:213 与 web-catalog-index-routes.ts:35；若复用既有provider/HTTP handler即可纳入，新名单不另造。实施前按采用头重新核方法，此稿没有给目录级通配写许可。若现有真实入口要求新增另一处源码，先报具体调用链/路径由统筹补入写集；不把“按需”当整包授权。

## 6. 可检出的验收与反例

| 编号 | 真实准备、动作与 oracle | 必须暴露的错实现 |
| --- | --- | --- |
| RAC-2644（改 RAC-967） | 临时Home装真实签名Home包，项目A已真实存在且具备可消费的项目读/写动作；未同意，页面/Agent项目上下文都拒，记录业务owner前后相同；原Home查询仍成功 | 仅给同意UI但下行直通；测试仅因不存在项目/能力失败 |
| RAC-2645 | 本人从项目A设置页同意；实际ledger subject=(A,当前install)、user、当前digest与规范化批准集合；从A页面和project action client的agent audience分别调Home包→真实沙箱→项目owner读/写，写入后公开读取精确值；重启后再成功 | 只测ledger、fake runner、HTTP mock、直接调下游动作而没经过Home包 |
| RAC-2646 | A撤回后新调用拒；延迟的真实下行command停在owner beforeEffect前，撤回再释放，零业务变化；query晚回执拒；撤回后重授新consent_id，旧调用仍拒，新调用可用 | 只查调用开始授权、缓存权限、撤回再授使旧调用复活；已提交后强说回滚 |
| RAC-2647 | A同意而B未同意，同一Home安装分别从A/B调用；B拒；第二安装/另发布者不继承；A输入伪造B、无项目输入伪造A、复制control/subject均不能转入B；A/B并发交错核真实落库项目 | 最后项目全局变量、输入项目路由、按plugin_id全Home授予、改identity造成跨存储owner |
| RAC-2648 | keep_data真/假卸载均清全部项目活动行，重装含复用install_id仍未授予；经ProjectDeletionService删A撤A全部Home包行，B保留；注入一次ledger清理失败得到pending，重启重试完成且固定id重建无授权；无触发项目Home/后台仍拒项目动作 | 仅清运行实例、只清一次安装、keep_data保留权限、吞错误伪complete、后台借最后项目 |
| RAC-2649 | T141公开preview/confirm同安装v1→v2（声明相同）digest确已变化，原同意不重写且A仍成功；v3增声明后A整份project_reach需确认，B未授予仍拒；页面准确显示“声明的动作增加”（含仅Home使用的新增id）/取消无写/确认当前digest和新集合的新行后A成功；历史包不可读不影响批准集合，当前包验签规则保留；重启结果一致 | digest一变全失效、只比consumes漏扩权、record旧行幂等导致假更新、升级确认顺带授权全部项目 |

补充合同反例合并在上述文件，不为数量另造矩阵：设置入口身份/一次性控制、取消/断线/过期预览；publisher撤回/disable/upgrade世代晚回执；声明未批准/查询尝试写入；schema旧库拒绝且不创建不修补；新增枚举/集合字段和其它kind的null在API/actions快照同步；现有ledger合同用例断言修改输入或返回数组不改变保存的历史事实，作为D1的owner校验，不另扩矩阵。

并发屏障设在真实宿主目标 handler/目录读取/owner beforeEffect 的可观察点，保留生产实现，用测试透传观察；先证明屏障到达再操作撤权/卸载/删项目/升级，finally释放并等待全部pending。不能把超时当拒绝。真实业务oracle选既有 Goals：从公开 `@molis-ai/molis-work-plugin-goals/contract` 取 goalPluginActions.list/state/progress 的准确id/version，A/B分别初始化Goal；Home包声明并实际调用progress，输入 `{goal_id,based_on_cursor,summary,idempotency_key}`，通过各项目公开state读回 goal_event_cursor 与该进展内容，成功只推进A且仅一条、B不变，拒绝前后游标/内容均不变；同幂等键重发不新增。现有 agent-built-plugins-catalog.test.ts 的 PG006-02/04 已示范该真实owner与参数，但它的局部service.call不替代本单真实Home沙箱路径。新文件复用既有goals-board/goal-application测试fixture做初始化，最终断言优先公开动作，不新增包内部import。专用probe仅补局部身份与屏障观察，不能替代业务落库oracle。

浏览器从项目 A 的**实际工作台**进入项目设置同意，再通过真实导航打开 Home 包；观察初始 iframe、刷新/重新打开及真实 call 均保持 A，并实际写入 A 的 Goals owner。不得手工 goto 特制项目 frame URL 代替入口；切换项目 B 与 Home 打开的页面分别绑定 B 与 null。确认、撤回与刷新均用可见 DOM/真实 HTTP；截图写忽略目录。Agent 覆盖用项目 action client 构造经 Host 验证的 agent 调用，测试无真实模型。视口至少正常桌面和窄窗，不能按钮被裁/状态串项目。RAC2649 升级浏览器路径依赖 T141 真正采用后跑，当前不可模拟它冒充通过。

最小首红：旧头的A同意→真实项目调用无法成功、frame丢项目、声明增大误判/无UI可断言；若红在签包/fixture构造等前置错误，修夹具后才记有效红。按最终差异选必要变异：删ledger尾检→RAC2646红；伪造项目读取→RAC2647红；忽略声明差异→RAC2649红。无需机械固定变异数量；动态全是NOT RUN。

## 7. 实施顺序、验证命令与执行隔离

1. 统筹先裁定 §1 接线缺口与上述候选；T141采用头与共享锁确认后（现行库版本1已定，无转换分支），独立工作树领取，刷新适用AGENTS/README和实际写集。当前不建树、不改refs、不实施。
2. 按“ledger合同/subject/历史批准集合 → 当前verified声明 → per-call项目通路（预检与dispatch同时）→ 项目设置 → 清理与恢复”顺序落地；测试编号沿用。T141升级未落地时可完成不依赖它的工程准备，但不得交T145缩减版完成。
3. 固定基底/候选头与完整测试清单；整体构建后完整文件验证、无name-pattern、`--jobs 1 --retries 0`；不空列表触发Full。必要基线对比在独立干净树，同样隔离，同一完整文件，不用重试抹失败。
4. 必要工作负载（以下仅计划；均由公共槽+隔离子进程包装后执行）：
   - `pnpm install --frozen-lockfile --offline`；`pnpm build`。
   - `node scripts/run-tests.mjs --jobs 1 --retries 0 tests/home-package-project-reach.test.ts tests/home-package-project-reach.e2e.test.ts tests/security-invariants-sandbox-home-instance.test.ts tests/plugin-trust-rules.test.ts tests/clean-home-plugin-stores.test.ts tests/home-store-baselines.test.ts tests/project-deletion-service.test.ts tests/project-deletion-owners.test.ts`。
   - 回归集合：`tests/security-invariants-consent-settings.test.ts`、`tests/security-invariants-consent-revoke.test.ts`、`tests/security-invariants-plugin-permissions-http.test.ts`、`tests/home-plugin-project-routes.test.ts`、`tests/home-installed-plugins.test.ts`、`tests/agent-built-plugins-catalog.test.ts`、`tests/plugin-sandbox.test.ts`、`tests/security-invariants-sandbox-services.test.ts`、`tests/security-invariants-sandbox-background-host.test.ts`。若broker仅传scope，model/connections/materials等README相关集仍由最终diff核依赖，不自行删除必跑要求。
   - 受影响五包README必跑与`node scripts/affected-tests.mjs`建议逐一登记：local-host、contracts、plugin-runtime、plugin-sandbox、workbench。整合窗口由统筹按实际diff展开/安排，已有同头证据可核抵；超出本线本地批次的必要项明确待统筹，不能暗写通过或省略。共享核心 `full=true`，本机本线不跑Full。
   - 合同更新：整体build后`pnpm api:update`、`pnpm actions:update`，变化调用方/版本逐项说明；对应`pnpm test:contracts`在受控测试窗口。`node scripts/test-imports.mjs --check --chains`、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、完整workspace build后`pnpm page-assets:check`，安全集合由统筹受控执行。推前fresh main与`pnpm secrets:check`依后续明确发布授权，当前无push授权。
5. 整机`machine-slot`先在共享TMPDIR获取build或browser槽，再在槽内启动隔离子进程；所有测试都占browser槽。不得先换TMPDIR使公共槽分裂，不设slot=off、不并行构建与该树测试。actions:update会起临时Host也占相应窗口。宿主有效slot继承变量按脚本真实协议传入，不能env allowlist时丢掉而二次死锁。
6. 子进程环境从显式allowlist构造；系统HOME、CFFIXED_USER_HOME、XDG_CONFIG_HOME/XDG_CACHE_HOME/XDG_DATA_HOME/XDG_STATE_HOME/XDG_RUNTIME_DIR、TMPDIR、MOLIS_WORK_HOME均指向本次临时目录。`MOLIS_WORK_SECRET_BACKEND=file`，从首次build起`MOLIS_HELPER_SIGNING_IDENTITY=-`，不继承真实token/model/provider/SSH/登录配置/NODE_OPTIONS。允许只读工具链PATH与任务依赖，配置/cache解析必须落在隔离路径；需要原生Foundation路径则先验证解析结果，不能假定只设HOME就够。遇真实路径访问依赖停下报根，不以真实环境补跑。
7. 签包用临时Node Ed25519 fixture，绝不调用系统证书/Keychain。真实runner保留Seatbelt，不能假runner或降沙箱。Host随机127.0.0.1端口、completeText:null或本地受控替身、不碰4207和真实账号。专用浏览器绝对路径`/Users/yijunwang/.local/bin/molis-test-browser`先验证，显式传给公共ChromeHarness、独立profile，失效即报错，禁止fallback日常Chrome。
8. finally/t.after关闭本次Host/browser/runner，等待pending，取消同样清理仅本次pid/profile/Home；不按进程名批杀，不动别人工作树。失败保留首个断言、stack、raw日志/skip/retry/source-build绑定；不把泛化crashed直接归环境。

资源/巨大单元按实际served bytes与实测size处理，不能先写预计零增长或改门禁通关；>10KB/新资源由统筹按现有条款决定。shared文件候选由统筹串行采用。CI full=true与所需Darwin沙箱/真实浏览器证据分开，不拿Linux跳过后的绿代替此路径。

## 8. 本轮交付边界

已按根采纳的R1/R2/D1修订同一计划：版本1现行schema无转换，真实工作台到frame接线，同一ledger行保存历史批准集合。accepted-section8.patch仅供根采用，未应用。无源码/coord/GH/refs修改，无build/test/browser，无真实Home/Keychain读取或操作。T141未实现与共享锁保持WAIT；RAC-2644～2649、S-106、CI/Full、工程与用户验收均未通过。此稿可供统筹审阅、裁定接线范围，不能作为已具备执行授权或Ready的证据。

## 2026-11-01 10:58Z 根执行窗口

为落实用户W5加速要求，解除仅等待已审父候选Full/采用而停止源码开发的排程限制。T394已冻结H090fcfa4cdf197419f4f48084bb46a3d5f87d854，tree f56ffc21f8627d3f8db08664677eb804b65e638f；它是候选而非main。开发线1从该头建/private/tmp/t145-dev与feature/t145-project-reach，不改父树/原分支。既定R1/R2/D1/D3、完整RAC2644～2649和功能可用目标不变；直接采用本书已经补齐的安装列表输出路径，REVIEW-INCREMENT旧遗漏不重开。已接受的accepted-section8.patch等价hunk先准确落入本树同一需求书§8，保§7/T144等内容；只交本项共享段落，不重写整书。

先实现ledger/合同/subject/当前verified contract/设置与清理，沿§5具体写集；不改T141升级语义、T144正文/来源、PR1b请求校验。PR1c同时改web-request.ts、home-plugin-http.ts的stage呈现透传，因此这两文件暂仅出本项精确接线候选，不覆盖或搬其整段；根在PR1c冻结后串行交最终组合接口，再补真实项目frame入口。其余文件无共享writer时可直接完成。生成API/actions、本项S106与必要包README/预算候选由根串行收取；不能因为公共文件待接力而停下独立owner/核心通路实施。

原书超重README逐文件记录、重复source/hash矩阵和固定变异流程由用户最新要求收窄：做能检出本项真实安全/跨项目/撤回/升级错误的相关完整文件、适用必要门禁；已有效父片证据沿用，未受改动部分交最终准确头CI/Full，不机械重复整包清单。只在真实失败或关键边界疑点时展开诊断/故障注入。报告一页列完整验收结果与实际未验边界，用户/真实Home验收不冒签。本机无Full，公共槽、隔离Home/专用浏览器/临时签包/无真实凭据规则不变，源码作者不push/GH。
