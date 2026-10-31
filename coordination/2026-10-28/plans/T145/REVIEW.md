# T145 安全工程书只读审查（负责人：二审线 5 · Codex）

结论：**候选方案的安全方向成立，但尚不能标 Ready。两项计划必修，另有一项必须由统筹落定的授权事实合同。** 不是已发现生产越权，也不是实现或测试通过。T141/T143/共享包继续 WAIT；本审查不授予实施、迁移、真实 Home 操作或共享锁释放。

审查对象：`/private/tmp/t145-ready-plan/PLAN.md` 当前候选；代码固定为 `b0567bf545a74b858e4fdeddd5e66432b1065b21`。唯一 accepted 产品语义仍是 `specs/repository-anti-corruption/slices/pg011-pg017-remaining.md` §8、D3、RAC-2644～2649。只读参考了 coordination 分支的 T141 PLAN，其候选状态不作为已实现证据。

## 当前必须修订

### R1：删除维护转换/迁移候选，明确现行 schema 与版本 1

PLAN §2.1 的“维护转换方案”“若需要迁移机制”及 §7 的“baseline维护边界”应删除或改正。根已明确本线不加兼容/迁移；同步当前 schema、Home baseline（仍版本 1）和独立 fixture，旧形状明确拒绝且字节不变。不得写成等待实现时自行选择迁移，也不提高版本号绕开旧形状拒绝。

代码依据：`home-plugin-store.ts:32–59` 对现行完整结构和版本严格核对；`consent-ledger.ts:15–33` 中 CHECK(kind) 和索引才是需要同步的真实结构。最终若采用 D1 所述新字段，也属于同一次现行结构修改，不引入读时补列、ALTER、旧值默认接受或转换工具。无需重新问用户已定产品语义。

### R2：补全外层项目工作台到 frame 的入口，加入缺失写点

PLAN 已发现 frame/call 和 page authority 丢项目，但精确写集漏了外层项目上下文的实际来源：

1. `web-request.ts:181–183` 在项目 view 中调用 `renderHomePluginStages(localHost.homePlugins)`，没有把已经核过的 `hostReference`/项目传下去。
2. `home-plugin-http.ts:282,307–309` 的 stage 渲染接口不收项目，Home 包固定 `prefix: ""`。
3. `installed-stage-section.ts:13–15` 实际 iframe 地址由该 prefix 拼成 `/plugins/<id>?frame=workbench`；它已有 prefix 参数，通常无需为此修改 helper。
4. `home-plugin-http.ts:36` 的项目前缀 matcher 目前只收 `api/plugins/...` 与 `side/...`，不收 `/projects/<id>/plugins/<id>`。仅换 iframe URL 会落不到这一条正确的 Home 包 page 路径。
5. 同文件 `105–108`、`HomePluginHost.packageDocument`（`home-plugins.ts:152–154`）、`renderHomePackageDocument`（`agent-surface.ts:170–177`）继续丢项目，最后 call URL 无 prefix，`pluginPagesFor.open` 用 null。

修订要求：把 `apps/local-host/src/web-request.ts` 作为**需统筹补入并确认锁的准确候选写点**；从已有可信项目 view 把项目送到 Home stage，补对应的项目 frame 路由，沿 `routeProject` 核存在与可见性后建立项目 page authority/调用前缀。Home 自身入口仍无项目。不要通过输入/query/page_context、全局当前项目或仅改客户端地址补洞；不开放任意项目前缀管理路由。`PluginPageAuthority.bind` 的路径与页面项目匹配（149–151）、安装世代检查、项目删除关闭页面都保持。

RAC-2645 浏览器 oracle 必须从项目 A 的真实工作台打开包，观察初始 iframe、刷新/重新打开及其真实 call 都留在 A，然后通过 Home 沙箱实际写入 A 的 owner；不能手工 `goto` 一条测试专用项目 frame URL代替这个入口。项目 B 和 Home 各自打开的页面也分别绑定自己的上下文。PLAN 已列真实浏览器路径，补这一具体缺失即可，不扩 UI 范围。

## 必须落定的工程合同 D1：保存历史同意事实，取消按摘要扫描历史包的默认方案

### 当前证据与风险边界

- `pluginManifestDigest`（`packages/plugin-runtime/src/identity.ts:5–6`）只散列 Manifest；沙箱的动作声明来自已验签包 `contract.operations[].effects.capabilities`，不是 `capabilities.consumes`。PLAN 对这点判断正确。
- `SandboxPackageStore.directory/load`（`sandbox-package-store.ts:40–41,83–93`）按 **plugin + publisher key + version** 定位；没有 `loadByManifestDigest`、摘要索引或同意引用的历史包保留合同。
- `save` 拒绝同 plugin/publisher/version 不同字节，Manifest 自身包含版本；在当前正常写入路径里，这使某个已保存版本与其 contract 保持关联。因此不能声称“同摘要任意对应两个合法 contract”已经成立，也不能把候选的失败关闭方案指为已证实越权。
- 但 consent 行不存版本/批准集合；用 digest 倒查只能新增目录扫描及候选解析、再按版本 load/验签/复核。`scopeOf` 的现有扫描只用于否定安装范围，允许略过坏目录，不能借来证明授权。原包缺失/不可读则同意无法沿用；后续必须永久留存的依赖目前没有成立。T141 当前候选说升级 save 新版本并复用现有 lifecycle，不能替 T145 承诺授权历史存储。
- `home-installed-plugins.ts` 已缓存当前 release，但不持有同意时的历史声明；进程 cache 不能补这个事实，重启时仍缺。把旧包查询放进“每次调用”还会引入与所有历史包数量相关的工作。

### 建议根采用的最小取舍

在**现有 PluginConsentLedger 的同一条 project_reach 同意记录**增加结构化的“此次本人批准的 capability id 集合”（字段名由实施合同定），从当前 verified signed contract 规范化、去重后，在本人 grant 时与 subject、manifest_digest、granted_by=user 一次提交。

这是一份必要的新历史事实——“本人当时同意了什么”。当前包声明仍唯一归签名包；当前安装批准仍归原 approvedFor；项目同意归既有 ledger，不新建授权表、历史包索引、grant map 或第二套安装 owner。不能用当前包每次回写这个集合，也不能把 manifest_digest 改成集合摘要。

执行时用当前 verified contract 的声明集合 Dcurrent 与该行 Dgranted 作包含比较，仍检查当前安装/发布者、operation effects、安装 approvedFor、真实目录/audience/permissions 和调用生命周期；项目能力授权不扩大 Home 安装自身身份或私有数据 owner。只要 Dcurrent 没有新增项，升级不改同意行；新增项则该项目等待本人重新确认，owner 原子撤旧写新。撤回再授予依然捕获/尾检 consent_id，旧调用不会复活。

新字段对 project_reach 必填并严格校验，其它 kind 使用合同明确的“不适用”形状；Memory/SQLite/Home facade 和输出 action schema 同步。沿用版本 1 的现行 schema，旧形状拒绝，不做旧记录推断/回填。这样取消 `loadByManifestDigest`、同意所需旧包保留依赖及对应“旧包缺失就强制重问”的新产品条件；当前运行包的验签与形状检查保留。RAC-2649 相应改验 ledger 的历史批准集合和当前声明比较、重启一致，而不是验历史扫描工具。

这一选择改变的是工程候选，不改变 D3/RAC-2649。**需根明确采用后作者才改 PLAN；本审查没有实施它。** 若根选择包引用方案，最小替代是同意行保存准确已验签版本、按现有 load 定位，并显式接受该版本必须可重读的依赖；不要在没有这个决定时先实现按摘要全库扫描。

### 比较集合的口径应写成确定合同

现有 signed contract 的 capability 声明是 id 字符串，没有 provider/version 钉。按包所有 operation 的 capability id 并集比较，是不依赖当下目录可见性的稳定口径；不把当前不可达、未安装的 id 过滤掉。代价是新增一个仅 Home 使用的 id 也会要求重新确认项目同意，PLAN 当前算法确实如此。根采用时应明确接受这一保守口径，并让设置页解释“声明的动作增加”，不能声称精准只比较项目动作。若要只比较项目动作，需要另外解决声明长期 scope 的权威来源，当前不建议为此扩合同。目标 provider/version/policy 在每次调用仍由现有 binding 检查，不能拿同意 id 集合替代。

## 已核可保留的边界（不是新必修）

| 边界 | 结论与代码证据 |
| --- | --- |
| 外层 Agent 入口 | `installed-plugin-exposure.ts:30–34` dispatch 只拷 signal/beforeEffect/page_context/locale/assert_authority_current，确实未携项目。应在真实 handler context 捕获宿主签发的每次 scope，不仅修 HTTP。Home controller 用这份共用 exposure（`home-installed-plugins.ts:139–142`），不是要另建一份 Home exposure。 |
| 预检、策略与真正 dispatch 一致 | `installed.ts:70–95` 运行前依赖预检、cost/lane/limits 与 beforeEffect binding 都读 `host.capabilities()`；只换最终 catalogCapabilities 会仍在预检拒绝或检查错目录。PLAN 同次 subject 贯穿这些点正确。 |
| 安装身份与触发项目分离 | `home-installed-plugins.ts:86–91` 明确只收 installed/null identity；`catalog.ts:206–214` 的 identity===actions.project_id 是现有项目安装防线。保留两者，Home→project 只加持有真实宿主 scope 的显式分支，不能删除比较或修改 activation identity。 |
| Runner/broker | runner 在每次 call 捕获 reenter（191 行），排队后保存在 active，再进 broker（127、207）；broker 72–88 创建 service context 时目前只有 activation identity。已有 reenter 是可复用机制，不证明项目已传入。先选单一每次调用 scope 的传递方式，再决定是否需要改 runner/broker 类型；不同时叠两套 ALS 与控制对象身份账。worker 不接收可自填项目身份。 |
| Home 目标 | 保留 Home model/catalog/client；只对项目目标要求 project_reach。项目未同意不应把原本可用的纯 Home 查询一起禁掉。PLAN 已写此边界。 |
| 本人设置入口 | 现有 `assertPluginConsentSettingsEntry` 只收 Home/null，不能泛化放行项目；独立、短生命周期且绑定项目的 Host entry 合理。入口 credential 不来自 JSON。agent/MCP/plugin/delegated/复制 user_action 都拒，旧 Home consent credential 不通新门。 |
| 账本更新 | 活动唯一键不含 digest，record 对同 subject 活动行不写新行（`consent-ledger.ts:76–85`）；重新确认必须 owner 事务撤旧/写新。新 subject 用结构化 `[project_id, install_id]` 合理，不靠分隔符猜拆。 |
| 全局 revoke | 现有 `pluginConsentHandlers` 50–56 行可按任意 consent_id 直接 revoke，list 直接返回全部行。新增 kind 后必须按 PLAN 真正处理输出版本与禁止由旧 Home 门修改 project_reach；不能只新增项目按钮。 |
| 卸载与同 id 重装 | `HomePluginExecutor.uninstalled/prepareReinstall`（204–213）确实都走 forgetInstallationRecords，keep_data 不应保留此授权。这个 owner hook 合适；补失败后可重试并阻止重装复活，不能仅成功路径清理。 |
| 删项目 | `homeProjectOwners` 的常驻 plain-store owner 可用于未运行 Home 服务时撤项目全部同意，复用已有 ProjectDeletionService/receipt/retry；不另建清理表或后台队列。不存在 ledger 的 Home 删除路径须保持只读不创建，用现有 read-only presence/owner 能力，不直接 new HomeConsentLedger 误建库。PLAN 中无数据也不造库的要求需落实在此具体调用。 |
| 效应与尾检 | 撤回再授予不复活旧调用、业务 effect 前零写入、已经提交后 outcome_unknown，以及 query 晚回执拒绝的分界正确。不是承诺撤权会回滚已经完成的业务写入。 |

## 验证范围与交还

PLAN 用真实签名 Home 包 → page/agent → sandbox → 项目 Goals owner → 公开读回的主 oracle 合理；A/B 项目并发应覆盖已排队调用与 quick/slow lane 的真实交错，不假设单个 worker 可同时执行两个 operation。同安装升级必须等 T141 真正采用后从公开 preview/confirm 路径验证。

本轮 **没有 build/test/browser、变异、CI/Full 或真实 Home 实操**；所有结论来自固定头源码与候选工程书。没有新增其它 P1。R1/R2 修订和 D1 由根落定后，只需检查这些增量及其关联合同；不要求整份方案重审、不重新询问逐项目同意已定语义。实施仍受 T141/T143/共享锁约束，full=true 不变。

主检出起止均为 `08c9933d57e153d1d59bf2811f203056d4358992`、clean；本地 origin/main 起止为上述 b0567bf5。未 fetch、改 refs、改仓库/coordination/GitHub，未读写真实 Home/Keychain。唯一写入是本 REVIEW。

T377：五文件行为二审既有结论保留，最终资源增量仍由本线负责；等待根交 T351 实际采用后的准确 H，再检查资源与同步小差集，不重开五文件行为审查。
