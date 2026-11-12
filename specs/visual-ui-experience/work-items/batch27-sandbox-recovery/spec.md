# 第 27 批 · 损坏签名包卸载与沙箱生图传输

状态：BL-915、BL-918 两项已在第 27 批实现（2026-11-11，各节末的「实现记录」）；设置页呈现用户 2026-11-11 选 A。公共合同台 C 在整批最终头合审，本人验收未做。设计 2026-11-09（第 27 批沙箱合同设计 Agent），基点 `359fe1fd8ef4ed9cf98cb5d8425403b66d01f5dc`。 [认领 #1743](https://github.com/molis-ai/molis-work/issues/1743#issuecomment-6746910253)

## 交付与证据

按第 27 批原交付要求实施并验收两项。Home 和项目从真实设置入口完成损包卸载、数据保留反馈和失败重试。沙箱生图在现行通道边界下交付真实尺寸，授权失效时撤销交付和释放暂存。 [第 27 批第 4 项](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-4)、[完整 Goal](../../../post-anticorruption-roadmap/reference/batches/27.md#goal-prompt)

| 证据 | 本稿状态与最终门槛 |
| --- | --- |
| 设计 | 已静态核实现状、验收和冲突，待公共 C 合审。 |
| 工程 | 尚未实施或运行验证。合同、生产接入、编号用例、受影响检查及最终集成按原批次要求交付。 |
| 实操 | 尚未执行。隔离 Home 走两种范围的真实签包卸载和设置重试，再走真实签包的完整生图链、容量与拒绝。 |
| 本人验收 | 设置体验按第 27 批要求由一骏看实物验收，单列结果。 |

适用流程与合同。 [开工前检查](../../../post-anticorruption-roadmap/reference/development-workflow.md#4-开工前检查)、[开发](../../../post-anticorruption-roadmap/reference/development-workflow.md#8-开发)、[评审](../../../post-anticorruption-roadmap/reference/development-workflow.md#10-评审与合并)、[合同变更](../../../../docs/system/CONTRACT-CHANGES.md)、[插件开发 Skill](../../../../skills/molis-plugin-dev/SKILL.md)

需求与接续。BL-910 已随 `c19f85c3c` 进入本基点。BL-701、367、803 沿现有 Runtime 合同，本稿复用现行安装授权和直接本人入口，消费 BL-367／第 06 批的实际资源释放等待。 BL-915、BL-918（都已完成，待办文件已删，实现记录见下文）、[BL-628 §3.7](../../../archive/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md#37-卸载与数据清理)、[T-143 与原验收](../../../archive/repository-anti-corruption/slices/pg011-pg017-remaining.md#6-bl-491-模型设置与生图t-143)、[Runtime 合同](../batch27-runtime-contracts/spec.md)、[第 06 批](../../../post-anticorruption-roadmap/reference/batches/06.md)

## BL-915 · 依可信记录卸载

### 现行路径与缺口

- Home 设置 `/api/settings/plugin-permissions/uninstall` → `plugins.home.installed.uninstall@1` → `controlHomePackage` → `HomePluginHost.packageAction`（`home-plugins.ts:128`）。项目设置 `/projects/<id>/api/plugin-trust/installed/uninstall` → `plugins.installed.uninstall@1` → `controlPackageInProject`（`project-plugin-ports.ts:68`）。两边先 `packageOf` 读取包，再调用共享 `installedLifecycle`。Home 另有 `POST /api/plugins/<id>/uninstall`，已有消费者走这条且路由先用 Manifest 和安装状态作入口闸。收口时让卸载命中可信记录和本人入口判断，其他页面与操作继续先取 Manifest。 [Home 管理入口](../../../../apps/local-host/src/home-plugins.ts#L128)、[项目管理入口](../../../../apps/local-host/src/project-plugin-ports.ts#L68)、[Home 备份门](../../../../apps/local-host/src/home-plugin-http.ts#L126)
- `sandbox-package-store.ts:104–118` 的包读取将部分 IO／JSON 错混报为找不到包，随后验签、检查身份与入口字节。不把三类混在一起。① 文件缺失（bundle 或应有 entrypoint 的 ENOENT）是缺包。② 存在但读不通、验签／形状／安装摘要不符、入口改写、路径不可信是包无效，详情为固定安全码。③ Runtime 精确 release 快照行缺失是 `manifest_available=false`，与包文件是否存在相互独立。可信安装行缺失或不匹配是另一回事，拒绝请求。Home 前面的 `recordFor` 已拦掉无安装记录，后面的 `if (!release)` 捕不到 ①、②。 [保存包读取](../../../../apps/local-host/src/sandbox-package-store.ts#L104)、[Runtime release 账本](../../../../packages/plugin-runtime/src/release-artifacts.ts)
- 冷启两边已把失败隔离，写 `recoveryErrors` 继续启动其他插件；Runtime 的旧 `running` 记录可能仍在，但没有 live activation。已有 Home RAC-2601 验过缺包仍列出原因。项目列表的发行物来源是 `plugin-installation-directory.ts` 与 Runtime release repository，Home 列表也要区分已验证的安装发行物快照与当前代码可运行性。把当前诊断或缓存 release 当作删除证据会混掉这两件事。启用仍需已验签 bundle＋实际入口字节和安装摘要；单独少了快照行但已验发行物可核回时，按原恢复路径处理。 [Home 恢复](../../../../apps/local-host/src/home-installed-plugins.ts#L204)、[项目恢复](../../../../apps/local-host/src/installed-plugin-host.ts#L206)、[安装目录](../../../../apps/local-host/src/plugin-installation-directory.ts)、[RAC-2601](../../../../tests/home-plugin-settings.test.ts)
- `installed-plugin-lifecycle.ts:72–87` 卸载从 release 实际只用 plugin ID，却先按 ID 删除密钥、再调用 `PluginRuntime.uninstall`。后者已经能在没有 live activation 时只用记录完成状态转换，但在 `index.ts:629–642` 先写 tombstone 再调用 Host 的 `executor.uninstalled`。Host 后续还要清 KV、批准、声明、任务授权等。中途失败时项目排除墓碑，Home 仅以按 plugin ID 的批准存在且恰一旧行临时允许重试，两份设置列表都会丢失待清理行。 [共享卸载路径](../../../../apps/local-host/src/installed-plugin-lifecycle.ts#L72)、[Runtime 卸载](../../../../packages/plugin-runtime/src/index.ts#L591)

### 推荐合同

已决语义直接落实。Home／项目可卸载自己范围内可证明的签名沙箱安装，即便包丢失或被改过。范围由现有本人管理入口和 Runtime 库给出，目标是当前可信行的 `(scope, install_id, installation_generation, plugin_id, publisher_signature, version, manifest_digest)`。要求 `execution=sandbox`、`publisher_trust=pinned`，安装号由 Plugin Runtime 原 `installIdentity` 规则验证（plugin ID 与发布者签名，不含范围）。已撤销发布者可卸载，独立的现行 `always_on` 站立同意须先走撤回入口，重用 `leaveRefusal`。Home 设置门已有 S-94 的专用凭据。项目现行 `person(caller)` 只查 `user_action` 是否存在，`plugin-trust-http.ts` 的项目卸载分支也没有 permissions/set 的框页拒绝。卸载扩展前复用 S-94 项目设置入口与 Home 设置入口的不同可信凭据，项目 HTTP 卸载先做同 permissions/set 的框页拒绝，Home 备份门明确委托同一 Home 本人管理入口。沿 BL-803 的原则拒绝转调冒充直接本人。该设计的 `direct_person_entry` 是 Plugin Runtime 插件处理器的签发点，此处是 Host 管理处理器，用已有设置门证明，不直接依赖插件上下文字段。继续拒绝跨范围、非本人、冒名目标、内置、无签名及不唯一的安装记录。 [安装身份](../../../../packages/contracts/src/platform/plugin.ts#L57)、[本人入口凭据](../../../../apps/local-host/src/plugin-consent-settings-entry.ts)、[项目设置路由](../../../../apps/local-host/src/plugin-trust-http.ts)、[S-94](../../../../docs/system/security-invariants/S-94.md)

将卸载从启停的包读取分支中分出来，Home／项目调用同一 `installedLifecycle` 的记录驱动路径，继续复用 Runtime 锁、停止和 Host owner 清理。无需构造替代 release、把未验快照变成 definition，或从文件名反推安装。对于已经运行的已验签版本，Runtime 只调用已装配的 Host 沙箱 stop 包装器，关闭 quick/slow/background runner 或 integration runner 和 Host 服务。代码见 `plugin-builder/installed.ts:168`、`installed-plugin-definition.ts:61`、`sandbox-integration.ts:143`。没有活实例就跳过 stop，内容包也无作者执行。禁止重新 import/启动包、跑作者 stop/upgrade/purge。实际 child 退出和资源释放需 await。第 06 批候选 `8982fad38` 尚未合入主批，已核到 ProjectStatementProcess → library.close → session.dispose → lease 的释放链和 BSH03/S-59 证据，接续记录为 `850583606`。最终接第 06 批的实际完成头并复核该链。BL-367 的 2 秒只诊断作者钩子。Home 独立 SQLite owner 的实际 close 单独验证。 [停止合同](../batch27-runtime-contracts/spec.md#bl-367-停止钩子的期限和记法)、[项目语句进程](../../../../apps/local-host/src/project-statement-process.ts)、[Home 沙箱库](../../../../apps/local-host/src/plugin-sandbox-home-library.ts)、[S-59](../../../../docs/system/security-invariants/S-59.md)

| 东西 | 足够的证据与动作 |
| --- | --- |
| 运行权、安装 grant、暴露动作、声明激活 | 可信行及其 Runtime/监督器的同代 activation。先收回调用、页面／动作和后台的权限，再停止，只清本次 Host 的持有。墓碑里的旧 grant 可继续供历史读取，重新安装必须重新批准。跨范围同 install ID 的共享声明，依已知 Host holder，无法确认最后持有人时保留，停用本范围。 |
| 批准和同意 | Runtime grant 与 Home reach ledger 的 `install_id` 是各自的 owner。当前范围 `studioStorage` 的 `APPROVED_KEY+plugin_id` 是运行时效果槽，只在锁内确认属于唯一当前／待完成安装后移除该范围的有效授权。存量若和另一代／发布者归属冲突，保留原值，且不再用来授权新代。发布者 pin 与按插件+发布者而非按安装记录的共享同意，按原账本规则保留或撤回。 |
| 本机目录、原件、任务授权、普通连接 | 调既有 owner：`plugin-directory-store`、`material-original-files`、`task-grant-subjects`、`connector-plugin-requests`。用精确 install ID + scope（原件还需 plugin ID，任务要匹配已证实项目）。Home 中仅按 install ID 删所有项目的目录授权、任务或提示词的现有快捷路径，在同 ID 另有持有方或 holder 读取不全时不可用，安全地限定范围或逐项保留。共享安装槽和其他项目残存的按记录绑定只在 BL-596 最后持有人证明成立时撤掉。连接账号、凭据、原件文件本身归各 owner 或本人。不得调用删除账户／密钥的入口来代替解绑。 |
| 专属图片绑定与 Studio 网络密钥 | `imageconn-<install_id hash>` 是 Host 保留的 Home 安装 namespace，`forgetSandboxImageBindings` 只能解绑该用途；原 BL-491 保留数据时留此用途设置，删数据时清用途绑定，账号保留。Studio sealed 引用与索引只有 scope、plugin ID、ref 名（`plugin-builder/secrets.ts:30–45`），没有签名／世代。当前生产签包 confirm 只传 consent，没有收集这些密钥，声明/批准包含同名 ref 也证明不了 sealed 项归属。损包场景只清有 owner 明证的凭据；按 plugin ID 的可疑索引和未知 sealed 项保留。由 owner 提供能安全区分的说明，无法辨认单项时明确说只能核对哪个类别及原因。密钥值、头、ref 名和路径禁止扫描或输出。已有归属不明槽不可被同名新安装重新使用或覆盖：重装承认新批准，遇确实重叠的旧 ref 由现有凭据/安装入口拒绝自动接用；无重叠的重装照常。涉及新增持久化凭据归属的另立合同。受控 RAC-2615 是生命周期夹具注入，不证明生产签包可写该槽。 |
| 私有数据 | `keep_data=true` 继续保留既有私有数据。`false` 只清同范围同 install ID 的 KV、明确声明的安装私有文件／已确认的保留根、按 install ID 与项目拥有的判断记录。主人文件路径来自 Host 的保留树，逐段确保 canonical、普通目录、非链接，拒绝符号链接或目录位置异常（即使指向 Home 内其他安装），保留并报告，重装准备阶段也沿相同 owner 检查，不绕过保留；没有可信所有权的散落路径、表或文件不查猜测名称。只按 plugin ID 的共享默认规则／绑定由 Functions owner 与 holder 证据裁决，模糊时连关联一并保留。`plugin-packages`、历史发行物、成果库和用户来源数据不属于该安装可清私有数据。 |
| 独立 Home 库 | `plugin_home_libraries` 是唯一归属账本，含 plugin ID、publisher、store 名、库版本、schema 摘要。按下节选定的 A 执行。归属不明始终保留并列项。 |

### 独立 Home 库沿原卸载验收

BL-628 §3.7 的原表写明「Home 库（S-91）」，不保留数据时「删库文件并从账本去掉」，保留数据时「留」。BL-915 的 2026-11-04 决定约束归属与损包执行，没有改写该表。当前 Manifest 以 `databases.home` 声明 store、库版本和 schema；保留选择来自 `keep_data` → Runtime 行 `retain_private_data`，没有 Manifest 层的库清理开关。`HomePluginExecutor.uninstalled:223–231`／`discardInstallationOwnerData` 只删 ownerFiles、图片绑定、KV 和其他登记，未调用库删除；`installed-plugin-libraries.ts` 的现行 owner 只有校验、打开、快照枚举和中断**初始化**补偿。测试 RAC-971 的私有数据清理只覆盖原有路径，需补独立库证据。 [原卸载验收](../../../archive/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md#37-卸载与数据清理)、[Home 执行器](../../../../apps/local-host/src/home-plugin-executor.ts#L223)、[卸载清理](../../../../apps/local-host/src/plugin-installation-cleanup.ts)、[独立库 owner](../../../../apps/local-host/src/installed-plugin-libraries.ts)

| 选项 | 范围与影响 |
| --- | --- |
| A 按原验收补齐已知库删除（统筹选定） | 由 `installed-plugin-libraries.ts` 原 owner 增加精确清理入口。只在 `keep_data=false`、目标 Home 可信 install 身份、持有者清楚、已匹配该安装摘要的 Manifest `databases.home` 与账本的 `plugin_id/publisher_signature/store_name/version/schema_digest` 对上、真实空间/目录与库 baseline 都可信且已等待实际 child 退出时，移除明确的 DB 与其 SQLite sidecar，安全地 rmdir 已清空的归属根，再移除该账本行（空根若留下会被现行首次建库拒绝）。清理与打开在 owner 的同一账本互斥下，重用精确库路径/保护名单验证，发现未知兄弟文件或链接时保留该库并逐项回执。文件/目录先删、账本后删；若后者失败，同代 pending 重试只收尾仍匹配的账本和已经删空的路径。精确发行物和账本任一缺失、另有持有方、路径/库身份不符，保留并逐项回执，不查其他目录。无新表和数据迁移；须补健康及损包两条既有动作的真实删除/保留、重装、失败与等待证据。 |
| B 维持基点存储行为（未采用） | 两种卸载都会保留已知独立 Home 库，重装读到原库。这会缩减 §3.7 已约定的删除验收。 |

2026-11-09 第 27 批统筹核对原 BL-628 §3.7、BL-915 的现行引用及 2026-11-04 的既有用户决定，按原验收选 A。由现有库 owner 实施，公共 C 仍须合审归属证明、实际资源退出、删除顺序、重试与拒绝。当前仅有设计。 [原卸载验收](../../../archive/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md#37-卸载与数据清理)

### 失败、重试与回执

1. 在同一个 Runtime `InstallLocks` 中重读并对齐目标世代、范围、安装来源、版本／摘要，复查现行本人授权与常开同意，获准前零撤回或清理。排队后和每个可分开的持久步骤都用现有 `beforeEffect` 及紧贴写入的同步检查，取消后停止剩余步骤，已授权并落定的进度由同代墓碑说明。已启动的安装先撤活性并等 Host 包装器真实释放。停止失败沿现行 `crashed` 可重试且保持撤权，不启动／导入包来清理。卸载终态后的 Host 清理仍通过 owner，不由被取消的插件调用代写。
2. 在实际停止后且通过提交授权时，继续使用同一安装墓碑持久化 `uninstalled` 和第一次获准的 `retain_private_data`，将既有 `last_error_code` 在 Host 清理完成前设为 `plugin.uninstall_cleanup_pending`（建议通过现有 `pluginErrors` owner 声明）。读写同一行，持有同一锁直到 Host 清理结束；既有 executor owner 清理与 lifecycle 剩余清理只调用一次，避免项目重复扫连接 holder 或重复撤声明。没有新表、日志账本、迁移或挂起清理 worker。未完成时在管理列表仍显示已停止待清理，退出/重启后按同一墓碑恢复设置入口，不进入运行目录、不允许启用／重装／升级。仅允许同世代的本人重试，保持第一次选择，反向 `keep_data` 拒绝并显示原决定。重新入队先复查授权，子步骤可重放；对已删除项为空。先把授权撤掉，已知删除失败保留 pending 并回带安全步骤错误，无法证明归属的项按合同保留并报告而不把操作永远卡在 pending。
3. 所有应做清理落定后清除 pending 标记，设置列表移除已卸载项。重放同世代完成墓碑只读回最终状态与仍可枚举的保留项，禁止重新清理；换代后旧目标失败且不影响新安装。健康升级会保留世代 UUID，因此目标还要核旧 version 与 manifest_digest，旧版本界面也不能命中新版本。找不到该可信墓碑则拒绝，不能以同名新安装作为重试。遇到外部取消／掉线，依既有调用和 effect 语义拒交结果；已提交的墓碑/完成步骤是可观察状态，按显式本人重试续做。清理失败后的 UI 可用既有内联错误与卸载按钮显示「重试卸载」，不另建页面或常驻轮询。
4. 现行动作结果是封闭 `{plugin_id,state}`，设置页只 toast 后 reload，普通错误 detail 不能表达成功且保留项。**C 差异提案**。在两条设置列表给签名沙箱行带不显示的 `uninstall_target`（绑定当前 `install_id/installation_generation/version/manifest_digest` 的同一个前提值，采用既有可信快照做法或同字段精确比较，pending 时可加 `pending_keep_data`）。两条卸载输入要求该目标，实际身份仍取信任范围与 Runtime，锁内还核 publisher 与 scope。成功结果保持 `state:"uninstalled"`，增加 `retained?: Array<{kind,reason,label?}>`。`kind` 与 `reason` 用严格枚举（如 `network_credential`、`installation_binding`、`owner_files`、`home_library`、`task_grant`、`declared_rule`，原因 `ownership_unverified`、`other_holder`、`inventory_unavailable`）。能核实存在的保留项由各 owner 提供可辨认且安全的现有显示名或说明，例如现有的插件库显示名、可公开的连接用途。逐项列其类别、名称或说明、保留理由。无法安全区分或枚举时，按可见的类别和范围说明「这些项目无法逐项核对」，只报可安全确定的数量。具体字段、用词和呈现由 C 与设置实现同片核定。用现有 owner 的可显示数据，无需新增不透明标识、持久索引或为展示扫敏感存储。回执省去凭据值、secret ref、路径和原始异常。保留现行健康回执形状（空时不带 retained）。非动作 Home HTTP 路径须守原入口的 token/Origin、禁项目路径及直接本人判断；同一清理实现返回现行 `{uninstalled:true}` 加可选报告，内部冻结该入口取得的目标。若要求该 HTTP 入口在跨重装后也对无目标重放去重，须在 C 同步改它的调用方提供目标，不能猜同名请求是重放。 [现行管理动作定义](../../../../apps/local-host/src/plugin-install-actions.ts#L124)、[安装列表输出](../../../../apps/local-host/src/plugin-installed-view.ts)、[现行设置页](../../../../apps/workbench/src/settings-plugins.ts#L173)
5. 使用现有设置确认和反馈样式。对包损坏的「删除数据」说明可确认的资料会清理，归属不清会列出。成功 toast 后在所属列表上方内联列出可辨认的保留项及其理由，明确说明无法逐项核对的范围，更新列表一次且反馈留在原处。待重试只显示第一次清理选择和原位错误，按钮单次提交；以 `textContent` 渲染。保留现行发布者撤销说明、BL-910 选择按钮文案和 #1999 安全码翻译。若引入新互动状态或控件，按第 27 批定样门槛执行。

### 编号验收

| 编号 | 工程与真实路径 |
| --- | --- |
| B27-UN-01 | Home 和项目真实签包 preview→confirm→可用。关隔离 Host，分别删包、改 entrypoint/签名和移除 release 快照行后重开。缺包与篡改分别核列表诊断和启动／启用拒绝，缺快照单独验证 `manifest_available` 与可信安装的区别（配一例包仍可验证、另一例无可读包）；从现有设置入口卸载成功。没有安装行或 scope/signature/世代不匹配拒绝，零清理。用执行见证证明没有载入破坏的包、没有执行作者脚本，其他安装仍可用。另在启动后改包，卸载只停已验证的原 lane 并等待原 PID 退出。 |
| B27-UN-02 | 两种保留选择检验 install row、批准、作用域授权、旧 RPC、目录／原件注册、连接绑定、任务授权、私有 KV/文件和保留报告。独立 Home 库按 A 验证已确认库、sidecar、空根和账本的删留与重装；共享账号、他项目相同 install ID、旧世代及不明 secret／目录／独立库保留。验证可识别项显示 owner 的安全名称，无法枚举时说明范围。可证明是本安装的解绑确实删除，连接 token/密钥值、ref 名、路径均不进回执和日志。无法读全 holder 时确认拒绝跨范围清理，按项报告。符号链接（含父链接指向本 Home 他安装）及非可信路径拒绝。 |
| B27-UN-03 | 沿 S-94／S-75 在两个真实入口断言跨范围、内置／unsigned、伪造上下文、非本人、项目有效常开、过期世代拒绝，原运行/授权/数据均可核回。身份冒用/框页返回 `actions.forbidden`，输入附带身份字段 `actions.input_invalid`，可信行缺失/错误范围按已有门的 missing/scope 或 `plugin.state_invalid`，预期世代失配 `plugin.install_replaced`，常开 `plugin.always_on`。撤回常开再卸载；发布者已撤销仍允许卸载且 pin 不变。 |
| B27-UN-04 | 在真实副作用之间设失败／等待栅栏，已释放授权不能调用。失败后在重启的管理列表找到同代待清理行，继续同一选择；反向 keep／enable／reinstall/upgrade 拒，零越权回写。另在墓碑提交前后取消管理请求，前者零新增持久状态，后者保留已提交进度且不写后续步骤。清理完成后重放无重复副作用；夹入重装或升级，旧世代不会命中新安装。测试锁保持至最后 owner 完成，且实际退出可观察。 |
| B27-UN-05 | 隔离 Home 实操设置页的损包、保留项、失败重试与完成清单；Home／项目各走一次，中英文、深浅色、1440/1024/390、键盘确认和反馈。分开记录工程测试、实际操作和一骏本人验收。 |

### 设置页呈现（用户 2026-11-11 选 A）

定样在 [docs/design/uninstall-retained](../../../../docs/design/uninstall-retained/README.md)（1440/1024/390、中英、深浅、正常/留下/读不全/出错四种情形）。用户选 **A 就地结果**，它取代上面「失败、重试与回执」第 5 条里「成功 toast 后在所属列表上方内联列出」的放法：

- 卸载结果带 `retained` 时，刚才那一行原地换成一条 `mw-alert`：有需要核对的留下项用警示色，全部只是「别处还在用」时用信息色。标题「已卸载 X · 有 N 项留下了」，每类一行，写图标、类别名和一句原因，末尾「其余数据已经删除。」，按钮「知道了」收起。焦点移到这条提示上，不再弹 toast。什么都没留下时照旧轻提示、行消失。
- 清理没做完（墓碑 `plugin.uninstall_cleanup_pending`）时，这一行展开，里面是一条错误提示（`role=alert`）：「卸载没做完」、安全码翻成的原因、主按钮「重试卸载」，用第一次的选择。刚失败的那次会把这行滚进视野，焦点放在「重试卸载」上；页顶不另报错。
- 否掉 B（轻提示加「查看」）：轻提示一过，明细就找不回来了，而留下的东西是人要知道、可能还要处理的事。否掉 C（确认框里转成结果）：用模态拦住人不值得，而且「什么都没留下」和「留下了」两种结果的去向不一样。A 把正常、留下、出错放在同一个位置。

### 实现记录（2026-11-11，第 27 批主会话）

- Runtime 与宿主（`5d088b0bd6`）。Home 和项目都按可信记录卸载，不读包。列表带 `uninstall_target` 和 `pending_keep_data`，两条卸载动作要求带目标，入口和锁里各核一次，不符回 `plugin.install_replaced`。带宿主清理的卸载在清理完成前把墓碑记为 `plugin.uninstall_cleanup_pending`；同代重试沿用第一次的选择，反向的拒绝；已完成的重放原样回答。待清理期间，重装和升级都被拒。项目卸载只认 S-94 的项目设置入口凭据。
- 独立 Home 库按 A 删（`712caa7133`）。`removeInstalledPluginLibrary` 在账本锁下，只在账本行与留存的已验签 Manifest 对上、目录里只有库文件和 sidecar 时，才删文件、目录和账本行；对不上或有不认识的文件，就整个留下并报告。执行器先等语句进程实际退出（`ProjectStatementProcesses.exited`）再删。S-94 已补拒绝、代码位置与测试。
- 回执（`99a853fe1f`）。合同新增 `PluginRetainedKind/Reason/Item` 与 `PluginUninstallResult`；两条卸载动作同版本输出加可选的 `retained`，Home 旧 HTTP 入口也回带。宿主在一次卸载里收集各 owner 的保留说明，只放内存、不建表。今天会报告保留的是 Home 库、连接绑定、判断规则三处 owner。
- 设置页（本提交）。`apps/workbench/src/settings-plugins.ts` 按上一节画；类别图标由 `PLUGIN_RETAINED_ICONS` 给，写成 `Record<PluginRetainedKind, …>`，合同加类别时编译就报。英文在 `plugin-trust-en.ts`。存文件的文件夹指向这个空间之外时，宿主的说法改成人话（`plugin-sandbox-owner-files.ts`）。
- 一处取舍：存文件的父目录是指向 Home 之外的链接时，整个清理停在 pending、让人处理后重试，而不是当成「核实不了」留下就算完成。理由是这一步连本安装确认属于它的文件都删不了，算完成就会悄悄留下一整份数据。
- 第 06 批：子进程实际退出这一承诺用的是本批基点上的 `ProjectStatementProcesses.exited`；最终同步 main 时，对照第 06 批的实合头再核一次。
- 证据。工程测试：`tests/security-invariants-broken-package-uninstall.test.ts`（B27-UN-01、03、04），`tests/security-invariants-sandbox-signed-resources.test.ts`（B27-UN-02 库的删、留与重装），RAC-861/863、RAC-504 的保留说明，以及 `tests/plugin-uninstall-retained.e2e.test.ts`。最后这个是 B27-UN-02、04 在真实设置页上的一遍：真签包，按钮由人点。它覆盖留下的结果、焦点、无 toast、不显示 id 和路径、390 不横滚、「知道了」，以及失败后在行里重试；截图在 `.impeccable/qa/review/b27-uninstall-retained/`，有中文浅色的 1024 和 390、英文深色的 1024、失败态的 1024。B27-UN-05 的 1440、键盘逐键确认、项目内插件的一遍，和一骏本人验收，都还没做。

## BL-918 · 生图结果用现行分段协议交付

### 现行实现和可复用路径

签名 Home app 的生成 command → `SandboxSdk.imageGeneration.generate` → worker JSON RPC → runner 当前调用 → `SandboxBroker.invoke` → `imageGenerationCall` → Home executor 的 `sandboxImageGenerationFor` → Runtime `createPluginImageGenerationClient` → 共用 `createPluginImageGenerationPort` → 唯一 agent-host/Prologue。Broker 查 command、效果声明 ∩ 已批授权、来源域名；Runtime 查 Manifest/安装 grant、`model:invoke`、当前 concurrent 动作、原调用者与 `beforeEffect`；Host 查预先钉住的连接来源与 revision。基点已有 RAC-2655 真实签包+Seatbelt+Prologue+HTTPS（可信证书成功、错 SAN/不信任拒绝），RAC-2633 检查 4 张与合计 360 KiB（base64 491,520 字节）。runner 消息 1 MiB，broker 单响应半限 512 KiB，操作结果仍为有界 JSON。大小改动前先证明分段上线。 [SDK 合同](../../../../packages/contracts/src/platform/plugin-sandbox.ts)、[broker 生图](../../../../packages/plugin-sandbox/src/image.ts)、[Home 生图端口](../../../../apps/local-host/src/sandbox-image-generation.ts)、[Runtime 生图客户端](../../../../packages/plugin-runtime/src/image-generation.ts)、[RAC-2633](../../../../tests/security-invariants-sandbox-model-image-broker.test.ts)、[RAC-2655](../../../../tests/security-invariants-sandbox-home-signed-model.test.ts)

| 已有路径 | 可借与取舍 |
| --- | --- |
| `materials.readOriginalRange` → `worker.ts readOriginal`（S-65） | 已有真实 256 KiB/base64 分段与 worker 拼接，单段 checked offset/length，回带 length/size/revision。借相同有界范围语义和校验。原件登记按安装+项目+业务键跨调用持久，且需人选文件与 `materials.original`，因此只复用传输，不向原件登记写暂存图。 |
| `ownerFiles`（S-64） | Host 保留根、相对路径、显式权限与持久所有权，一次文件 256 KiB，整组写 512 KiB。为生图落盘会混入业务数据并依赖额外权限及重启清理，本片用调用内字节引用。 |
| agent-host `adapters/prologue-inference.ts:66–87` | Prologue 已持生成 resource，inspect 后以 ≤64 KiB 读，最终 `finally` 撤所有 ref。复用这条上游和先验大小核对。Prologue ref 在现有适配器内完成撤销，直接交给沙箱会打穿 Prologue/Host 权限并改变原生 Images 客户端，无需延寿。 |

仓内实际沙箱字节消费者是 `worker.ts`、RAC-2633 与 RAC-2655 夹具。真实 `plugins/native/images/src/service-job.ts:40` 消费 Runtime 的 bytes+revision 并按原任务状态和版本写自己的结果，和这个沙箱 wire 无关。仓内查不到要持久保存沙箱生成原图的签包消费方。支持作者在同一动作处理原图（例如本地读取图信息、回小结果）；大图仍不能作为完整 base64 从插件动作结果、成果或 ownerFiles 回送。若以后需把大图交给人或另一插件，应由真实消费者走已声明的成果或过程项合同，另设计保存入口。 [独立 Images 客户端](../../../../plugins/native/images/src/service-job.ts#L40)、[原件分段](../../../../packages/plugin-sandbox/src/broker.ts#L153)、[worker 读段](../../../../packages/plugin-sandbox/src/worker.ts#L63)、[Prologue 资源读取和释放](../../../../horizontal/agent-host/src/adapters/prologue-inference.ts#L66)

### 推荐传输与寿命

**推荐保留作者 API** `generate(request): Promise<SandboxImageResult>`，仍返回 `{images:[{base64,mime?}],revision}`。Host wire `imageGeneration.generate` 改回 `{ result_id, revision, images:[{ byte_length, mime? }] }`，这里的 revision 还是连接版本。内部 `SandboxSdkMethod` 增加 `imageGeneration.readRange`，参数恰为 `{result_id,image_index,offset,length}`，回 `{offset,byte_length,size,data_base64}`。段格式与原件统一，有效 result_id 自带不可变的版本含义。内部 `imageGeneration.releaseResult({result_id})` 在所有字节组装或 SDK 失败时可提前释放，正常活调用的同一令牌重复释放可为空操作；最多保留当前外层一个已释放令牌的标识，过外层立即丢弃，拒绝借此探测别的 holder。无须给作者导出 read/release API。worker 先校验描述符，再按顺序、每次一个 RPC 预分配受限 Buffer、写入验证过的段，单图完成后仅在 worker 本地转一次 base64。一个结果有任何失败则整个 `generate` 拒绝，没有可返回的部分图组。独立、稍晚的新生成仍走原收费动作；自动重试只允许在仍有效的调用内读取同一 immutable 范围，绝不重发生成。

**外层是谁。** runner 每次调度一个 `active`，由 Host 生成不可伪造的 `id/controller`，接收时已经检查 worker `callId` 与 `active.id` 一致（`runner.ts:126–155,224–228`）。将至多一个未释放图片组放在该 **runner.call() 的 active 调用** 上。该次调用由 Host 新建 holder 并经内存上下文传给 broker，同步失效钩子独立于 RPC lifetime；worker 只见有界引用。holder 绑定 runner 的不可变安装身份/世代、实际 Home scope 与本次 projectReach/原调用者，令牌由 Host 随机生成。过了单个 broker `generate` RPC 的 `lifetime.dispose` 后引用仍活，直到外层操作完成（成功、插件报错）、取消、撤权、项目许可失效、连接改变、停用、超时或进程退出中的首件事。不要把 holder 挂到单个 RPC signal、进程全局映射或按 operationId 猜调用。普通操作退出由现行 `current.controller.abort` 清，`shutdown` 会 abort，Host 管理 stop/close 走同一处。每次失败、释放、换代同步清引用并解除订阅，断开 worker 即使没调用 release 也由 Host 回收。只存 Host 内存的字节与必要版本元数据，不落盘，不写原件/文件/业务账本，不承诺跨动作或重启。晚到 provider 回复发现外层或 RPC 已失效直接丢弃。 [runner 当前调用](../../../../packages/plugin-sandbox/src/runner.ts#L126)、[broker RPC 时限](../../../../packages/plugin-sandbox/src/broker.ts#L78)

**每段仍走两道门。** Broker 用现行 operation 的 `generate` effect/approved grant 和原地址的 domain 批准，runner 复查原 caller 的 `beforeEffect`、同步授权、active identity/projectReach。Host 仍检查生图所需的安装 grant 与绑定版本。可复用现有 Runtime scope gate，Host 将已授权的 connector `(home,namespace,slot,connection,revision)` 作为私有持有条件，连接/槽变更经 `connector-lifecycle.ts` 的 exact binding 和 connection invalidation 立即清 holder，并沿外层取消/authority fence 拒绝进一步交付与效果。只结束当次持有，不会让后来新动作共用旧信号。优先复用同一 `withConnectorRequest` 的注册和信号，让已暂存交付的 lease 跟本次外层操作/提前释放一起关闭（需要移交可独立关闭的 Host-only lease 时只提取现有注册/注销，不建平行监听表）。每段按原动作门与实际版本拒绝，掉线后绝无末段交付；不要占着当前 broker 队列等待 worker 的下一次 RPC。正常的 `generate` RPC dispose 不会结束借用给续读的外层信号；provider 自己的本次信号仍及时截止。若采用只在续读时查版本的简化实现，不能声称连接变更会即时回收，保留这一点给 C 验。撤权、停止、取消后零新业务写或持久计量/失败记录。厂商可能已接受计费，按原 metered/outcome-unknown 处理，禁止自动重发。现用 vendored SDK 的 `composition/core/images.js` 在收到厂商结果后记既有进程内 usage，`model/core/usage.js` 是至多 500 项的内存观察，不将这笔外部事实当成沙箱业务提交，也不扩用 S-95 OAuth 例外。 [连接生命周期](../../../../apps/local-host/src/connector-lifecycle.ts)、[S-60](../../../../docs/system/security-invariants/S-60.md)、[S-95](../../../../docs/system/security-invariants/S-95.md)

### 数字、拒绝与切换

- 传输限制。每段最多 256 KiB 原始字节，base64 349,528 字节，小于 512 KiB，含短描述符和 wire envelope 仍远低于 1 MiB。自定义更小通道的非产品路径照现有半限拒绝超限段。4 张上限保留。先以现行 360 KiB 总上限上线 wire，最后一层才以 8 MiB 总、4 MiB 单图启用真实尺寸（4×2 MiB，单图留出压缩波动余地；其余批量仍受总量约束）。4×2 MiB 需要 32 次顺序范围读，默认通道最坏 35 次（按四张分别向上取整），再加 1 次生成和 1 次提前释放，相对默认每 broker 600 SDK/min、32 排队、64MiB V8 heap/192MiB RSS 是明确有界。重复范围可在活引用内得到同一字节，仍计入 rate limit。并发新生成有一个未交付 batch 时在发网前拒绝 `sandbox.queue_full`；可在首批释放后显式发新生成。一条 runner 活跃 holder 原始数据 ≤8 MiB，worker 同时持累计 base64 ≤约 10.67 MiB、正在拼接的单图 ≤4 MiB 及一个段。每个独立 lane 各守自己的限额，quick/slow/background 最多三条，故留存 ≤24 MiB/安装；总 Host 可见内存还包含已有 provider 解码、SDK 缓冲和其他安装，工程验收测实际 RSS/请求字节，不把配额算成总 RSS 承诺。
- 数据检查在分配前。默认 Prologue Node 现有上游限额是每响应 40 MiB、单图 20 MiB、最多 4 张（`horizontal/agent-host/src/adapters/prologue-node-port.ts`）。它们限制 provider 资源产生，不能用来当本沙箱配额。将 Host 策略的 output cap 只传给 sandbox 图像 port，再传入同一个 Agent Host adapter。先检查 receipt 数量，检查每个 resource 的安全整数/非零/单张/累计字节，整批都通过才创建任一 Host 输出 Buffer；未通过直接 `finally` revoke 所有资源。64 KiB 既有读取循环逐段校验实际 offset、读长、剩余和 `done`（现用 Prologue stored-resource 实现有此字段）。允许合法短段，拒绝声明总长度未到即结束、过早 EOF、超请求/剩余量或不前进；只在实际合计吻合时交付。底层 stage/publish 也核声明长度等于存入字节，读取时核每个存储块长度。区分可预期的 `sandbox.response_too_large` 与无效/不完整 provider 结果，Host owner 既有错误映射负责传达。Broker 自身还对传进来的实际 Uint8Array byteLength 核数量、总量和每张并限 MIME 长度/形状，避免测试接缝和未来 Host 返回值绕过。工作器验证描述符总数、size、part offset、byte_length、真实解码字节及累计边界，禁止缺段后返回部分数据。保持上游策略、native image client 和厂商协议路径；这里减小的是 sandbox 适配时 materialize 的量。 [Prologue 限额](../../../../horizontal/agent-host/src/adapters/prologue-node-port.ts)、[Prologue 图片适配器](../../../../horizontal/agent-host/src/adapters/prologue-inference.ts#L66)
- 真拒绝。未知/跨 runner/安装/项目/调用的随机引用统一 `sandbox.not_authorized`，不回答存在性；不合法 token/字段/offset/length/index 类型是 `sandbox.invalid_request`，范围短尾按既定规则返回实际长度，越过已知图像范围拒绝；释放后、完成后、超时/撤权后不能继续。未声明／未批准 generate、查询、无 `model:invoke`、来源未钉或不一致、旧 revision 仍在原门上拒。无有效图、越限或任一后续部分失败不回任何整批图片，不留 holder 或 Prologue ref。
- 切换顺序。① C 批准内部描述符/范围 RPC、保留作者结果形状与容量。② 同一 Host build 接通 broker + runner active holder + worker 组装，临时仍 4/360 KiB，复用 RAC-2633 原拒绝和 RAC-2655 原小图/真实 TLS 并加生命周期证据。③ 把同一 cap 接到 sandbox 独有的 Host/agent-host 读取入口，再把最终常量改为 4/4 MiB 单图/8 MiB 合计，正面实测与上、下边界一并验证。避免长期双解码或同时接受两套 wire。记录第②步的 360 KiB+1 拒绝，保留有界策略低限回归时用同一校验器及受信的夹具，不留生产旧路。最终阈值对应 8 MiB+1、4 MiB+1、接到 5 张的 Host 接缝、每段 256 KiB+1。现用 Prologue 的 OpenAI/Gemini 适配器先按 maxImages 截取/跳过，因此真实厂商回复超过 4 张只能验证交付最多 4 张。独立保留 broker 对实际收到 5 张的拒绝，不改上游厂商结果语义。现行纯生图操作可能还是 runner 10 秒 service/15 秒 operation，能力配置可覆盖，Host 厂商时限 180 秒。本片不以调长时间伪造通过，量真实接缝耗时，发现另有经证实超时则另立决策。

### 编号验收

| 编号 | 工程与真实路径 |
| --- | --- |
| B27-IMG-01 | 保住 RAC-2632/2633/2655。旧阶段 4 张、360 KiB 边界与通用半限拒绝，加 256 KiB+1 的单段拒绝。最终单图 4 MiB、总 8 MiB、5 张和无完整资源的失败逐项证明，Host 预检失败时零大 Buffer 分配、零读段、资源均撤销，SDK 不能伪报尺寸取得更多字节。 |
| B27-IMG-02 | 真签包 → 生产 Host/Seatbelt/broker/Prologue → 隔离 HTTPS 假厂商。真实 PNG/JPEG 1–2 MiB（含非整段尾）、4×2 MiB 对照独立原字节长度/摘要，插件只返回小验证值。每个批次确实只有一次供应商 POST，每段在半限以下，测最大报文/Host 和 worker 峰值，原小图 fixture 保持。未信任 CA、错 SAN 及错来源拒且 HTTP=0，保留既有计量策略证据。 |
| B27-IMG-03 | 正面证明单 RPC dispose 后同一个 `runner.call` 可续读。旁路 raw frame 分别带另一调用、安装、项目的 ref（同名 operation 也拒），无声明/授权、未知字段、负数、非整数、越界、释放后读均断言拒绝本身。正面测同范围重复无 provider POST，恶意并发分片或并行 generate 受既有队列和未释放结果限额约束。 |
| B27-IMG-04 | 在供应商回之前、描述符已回首段前、中段后及最终交付边界设置真实栅栏，分别取消、超时、撤权限/项目许可/发布者、切换或断开连接、停用、进程退出。每组至少测一处晚回包与半批失败；不交付后续结果，所有内存持有、connector registration 和 Prologue refs 释放，原件／ownerFiles／成果／持久业务及计量无新增，重试只由新的显式动作发起。 |

### 实现记录（2026-11-11，第 27 批主会话）

按上面的推荐做，作者 API 不变。合同：`SandboxImageDescriptor`、`SandboxImageRange`、`SandboxImagePart` 与两个内部方法 `imageGeneration.readRange`、`imageGeneration.releaseResult` 进 `platform/plugin-sandbox`，`SANDBOX_IMAGE_LIMITS` 定为 4 张、单张 4 MiB、合计 8 MiB、每段 256 KiB（公开 API 快照已刷新）。

- 持有：`SandboxImageHolder`（`packages/plugin-sandbox/src/image.ts`）由 runner 为每个 `active` 调用新建，绑在该调用的 `controller.signal` 上；调用正常结束、插件报错、取消、超时、撤权、停止、进程退出都走这个 controller 的 abort，holder 同步清空。broker 的 `invoke` 多一个参数把它传进来，单个 RPC 的 lifetime 结束不影响它。结果号用 `randomUUID`，只在本调用内有效；只记得最近一个已释放的号，用来让重复释放成为空操作。
- 每段的门：broker 再查 `generate` 效果与原地址的 `networkDomains`；`beforeEffect` 走 runner 的原调用者检查；宿主客户端在同一动作作用域里 `inspect`，授权或连接版本不对即丢弃整个结果。**采用了「只在续读时查版本」的简化**：连接在两段之间改变时不会主动回收，只保证下一段必拒、之后什么都不交付；没有接 `withConnectorRequest` 的租约。留给 C 审。
- 限额先查后分配：holder 对宿主真实交回的 `Uint8Array` 查张数、单张、合计与 MIME 形状，worker 对描述符再查一遍再分配缓冲、逐段核 offset、长度、尺寸与解码后字节数；agent-host 适配器新增可选的 `output` 上限，只由沙箱的图片端口传入，先 inspect 全部资源、整批合格才分配，超限 `agent.inference.image_too_large`（宿主映射为 `host.image_too_large`，沙箱端口再转成 `sandbox.response_too_large`），资源在 `finally` 全部撤销；读块循环加了「多读」「未到长度就 done」的拒绝。原生图片客户端不传 `output`，行为不变。
- 切换：第 ② 步（新传输、仍 360 KiB）与第 ③ 步（上限与 agent-host 预检）在同一提交落地，没有长期双解码；旧阶段的 360 KiB+1 拒绝由同一个校验器（holder 给 360 KiB 限额）在 B27-IMG-01 里保留。
- 新错误码：`agent.inference.image_too_large`、`host.image_too_large`。
- 证据：`tests/security-invariants-sandbox-image-ranges.test.ts`（B27-IMG-01、03、04，含真 Seatbelt runner 的续读、段间取消与停进程）、`tests/prologue-inference-native.test.ts`（适配器预检）、`tests/security-invariants-sandbox-home-signed-model.test.ts` 的 RAC-2655 trusted 分支（B27-IMG-02：真签包、生产宿主、Seatbelt、Prologue、隔离 HTTPS，1.5 MiB 与 4×(2 MiB−64 KiB) 的真 PNG，每批一次供应商 POST）、RAC-2633 改为新形状。未做：真实 JPEG、峰值 RSS 与最大报文的数字测量、撤项目许可或发布者的分组栅栏（这几种撤销都经同一个 `beforeEffect`／controller，单测覆盖了撤权与取消两种代表）。

## 开工前 15 项

| 项 | 已核决定 |
| --- | --- |
| 1 事实主人 | Runtime 可信安装/激活，Host 各 owner 的权限与私有数据，连接器账号/绑定，agent-host 厂商结果；runner 外层仅持有传输字节。 |
| 2 插件同等待遇 | 签名沙箱复用 Runtime 与同一服务／SDK；Native Images 原客户端照产品合同使用。 |
| 3 能力注册 | 两条已有本人管理动作注册原处，SDK range/release 为内部 RPC；生成继续 concurrent + metered，身份来自受信上下文。 |
| 4 合同 | 现行阶段一，同版本更新列表/卸载输入输出及沙箱 wire/limits，覆盖全部实际消费者。公共 C 审完合同先叠，再接实现，不开子 PR。 |
| 5 包边界 | 各 owner 现有包，broker 管传输，agent-host 管推理；不新建横向服务或 adapter 目录。 |
| 6 表与存储 | 只用现有安装行的墓碑与错误码，传输内存，无新库、表、文件格式或版本。独立 Home 库沿 A 复用现有归属账本及目录校验。 |
| 7 兼容/迁移 | 不双读 wire 或补猜测性归属。世代前提随设置消费者切换，现存未关联数据保留。 |
| 8 安全边界 | S-18、S-60、S-64、S-65 的分段先例、S-75/84/87/94、S-57/71/95/107 按触达边界更新主表与条目，新增明确拒绝证据。 |
| 9 调用次数 | 卸载 1 请求、完成后 1 次列表刷新。锁内一次读取目标与快照，跨 scope holder 只扫一次且按需，不能读每个包或按绑定开库。每批只发一次收费生成 POST（厂商返回 URL 时保留现行受限下载），默认通道最多 35 个已授权 range 请求及一次提前释放。每段继续必要活性检查；原 beforeEffect 有跨能力依赖时照原策略检查，纯生图无依赖不新做目录发现，均不重验包、解密或全量找连接。 |
| 10 升级/数据 | 现有授权不可被坏包、旧索引、旧世代或晚回包恢复；私有数据与共享 owner 规则沿可信记录。业务动作/日志仍有原生命周期语义。 |
| 11 成果/过程项 | 图片交付暂存属于本调用，业务成果、过程项须由未来实际 owner 明确声明与提交。 |
| 12 页面/外壳 | 复用现行设置确认和内联提示、原控制作用域；用现行英文词典和 textContent，无新页面/DOM 事件。超过一次 10 KB 或新增资源由统筹按规则处理。 |
| 13 错误 | 归属不足／输入错误／过期走现有 plugin 与 sandbox 错误机制。需要持久 pending 或映射新安全码时按 `defineErrorCodes` owner 声明，公共 C 审；不加 Error 子类。 |
| 14 冲突 | 见下节。统筹顺序落 C、Runtime、Host、Workbench；字符线 writer 无公共快照并写。 |
| 15 全局取舍 | 插件作者保留 generate 形状，不加文件权限；平台复用 Runtime/owner/分段和 Prologue，内存与清理归明确生命周期；助理/Agent/MCP 仍经原能力目录与原 caller 授权，卸载保留本人入口；连接器与成果库分别守现有边界，不承担暂存；后续批只改同一 owner 链，避免通用缓存、兼容读取和重复校验。 |

## 冲突、落地与验收排程

- #1999 固定 `f25c375149faf7143debffa5f90583a3bfd1ddb6`。与设计基点的精确 merge-base `54a12642c5c13f785ba40187363d31f73df12bc4`，该头与本机固定 origin/main 的合并基点 `1d32d49d6bdff86791d76e4ebf0cebecb2809228`。相关 hunk 为 `plugin-installed-view.ts` 旧 L38 原文 recovery_error → 安全码，`settings-plugins.ts` 旧 L196 码→本地化文案，`plugin-trust-en.ts` 旧 L2 后三键。连接器相关 `connector-plugin-requests.ts` 旧 L55、130、233、244 改走只读连接库，`connector-connection-store.ts` 旧 L1–13 分读写并保留外空间拒绝。BL-915 加码/回执叠上该处理，不能还原为原始异常，BL-918 只需读原 connection snapshot 及精确失效通知，沿新 owner API。 [PR #1999](https://github.com/molis-ai/molis-work/pull/1999)
- #2000 固定 `d918375958d1cbc477e7bdeab89e4d38e934da96`。设计基点 merge-base 同上 `54a12642c`，与 origin/main 的合并基点为 `02d2443f1b79b70092745714c938cc75b1826074`。相关 hunk 为 `home-plugins.ts` L10/63/261 的 SettingsVersionClaims 装配，`sandbox-package-store.ts` L29、36 的 Blueprint 留存，`plugin-holders.ts` L27–107 的只读预检/单读与精确库范围，`release-artifacts.ts` L156 精确验证快照，`plugin-install-actions.ts` L161–219 的安装对象与绑定，`plugin-install-service.ts` L113、189–292 的预览/确认合同。 `plugin-runtime/index.ts` L125–553 的新 release/upgrades 和授权起用不覆盖 L591–643 uninstall，但共用巨大单元登记要按整合后重新实测。 `plugin-sandbox/schema.ts` L1–106 把通用 schema/JSON 核对收进 SDK，分段使用整合后校验，旧实现不拿回来。`plugin-trust.ts`/快照新 preview 类型与 `host-actions.tsv` 旧 L256/269 附近的新增动作都保留，重生快照时只允许本片预期差异。 `tests/home-installed-plugins.test.ts` L98/101 的项目成员行为保留。两 PR 对 `image.ts`、`broker.ts`、`runner.ts`、`worker.ts`、`platform/plugin-sandbox.ts` 没有对应 hunk，BL-918 可先审，按实际重叠顺序接线。 [PR #2000](https://github.com/molis-ai/molis-work/pull/2000)
- 允许路径。BL-915 为两套 installed host/ports/lifecycle、Runtime uninstall/锁、只受影响的 owner 清理和安全码、两个设置动作与备份 Home HTTP 门、设置现有页面与词典、直接的 contracts/snapshots/tests/spec/docs。BL-918 为 `packages/contracts/src/platform/plugin-sandbox.ts`、`packages/plugin-sandbox/src/{image,broker,runner,worker,materials}.ts`（materials 仅共用 range 形状或检查）、sandbox image Host port、现有 connector 生命周期、agent-host inference adapter 和直接用例/文档。最终同步时重读 #1999/#2000 的实合头与具体 hunk，接 #1999 读口与诊断、#2000 预览/持有人/公合同，再按本批唯一 writer 次序更新这两片。第 06 批候选尚未合入主批，接实际完成头后复核子进程退出承诺。当前只交稿。
- C 首审。BL-915 的同世代管理请求、可安全展示的保留项、现行安装墓碑内的 pending 语义、旧 alternate HTTP 策略，以及已选 A 的独立 Home 库 owner 删除边界和实际资源释放。BL-918 的 descriptor/range/lifetime、跨 RPC revoke、单图/总量与 SDK 形状、agent-host materialize cap。无新增 UI 交互方案时可复用现行控件；如 UI 超出原设置路径，统筹走定样。用户的损包可卸载/未知保留原则及 360 KiB 先换传输的前置无需重问。推荐分段内存引用；有第二个真实持久文件消费者时才考虑用现有文件服务的授权引用这一备选。
- 子写手（获准后）仅整仓 `pnpm build`，刚新增/改过的上述编号用例用 `node scripts/run-tests.mjs --jobs 1 --retries 0 <files>`，再 `pnpm health:check`（以 `--base origin/main` 作最终口径）和 `git diff --check`。合同先更新 `pnpm api:update` 与 build 后 `pnpm actions:update`，检查两个管理动作/两张列表的 `host-actions.tsv`、`platform/plugin-trust`、`platform/plugin-sandbox` 以及受影响错误码的预期差异；复核 static/giant diff，无门禁改动。
- 统筹最终一次对合并后的头运行相关与 README 必跑合集和 Full CI。最低相关文件包括 `home-plugin-settings`、`home-installed-plugins`、`installed-plugin-host`、`security-invariants-installation-records`、`security-invariants-plugin-permissions[-http]`、`security-invariants-artifact-declarations`、`home-package-project-reach`、`installed-plugin-libraries`、`plugin-permission-switch.e2e`、`plugin-sandbox`、`security-invariants-sandbox-local-original`、`security-invariants-sandbox-owner-files`、`security-invariants-sandbox-model-image-broker`、`security-invariants-sandbox-home-image-port`、`security-invariants-sandbox-home-signed-model`、`security-invariants-sandbox-signed-background`、`plugin-image-generation`、`prologue-inference-images`、`images-providers` 和动作/公开 API 快照。隔离 Home、合成发布者和本地 TLS 测试接缝，不读真实凭据或生产 Home。真实签包实操与工程测试各列证据。设置体验由一骏本人看实物后记录。维护 `specs/BACKLOG.md`、手册与 Skill 的合同说明，只在编号与最终证据齐备时结项。 [Local Host 开发要求](../../../../apps/local-host/README.md#开发要求)、[Plugin Runtime 开发要求](../../../../packages/plugin-runtime/README.md#开发要求)、[沙箱开发要求](../../../../packages/plugin-sandbox/README.md#开发要求)、[待办索引](../../../BACKLOG.md)、[插件开发手册](../../../../docs/platform/PLUGIN-DEVELOPMENT.md)
