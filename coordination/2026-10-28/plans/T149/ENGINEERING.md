# T149 + BL589 同一最小交付工程准备

负责人：一审线 2；2026-10-31。状态：只读工程候选已收敛，实施 WAIT，非 READY、非实现或验证通过。

证据冻结：本轮读取 Git 对象 `b0567bf545a74b858e4fdeddd5e66432b1065b21`（本轮开始和结束的本地 origin/main 均为此值）；主检出 HEAD `08c9933d57e153d1d59bf2811f203056d4358992`，开始和末次检查均无未提交修改。没有 fetch/改 refs，没有读取在途保护分支内容。锁状态沿根派任务保持，不把本地 ref 当作 GitHub 最新 main 的证明。

需求依据：原 PLAN.md、同一冻结树的 `specs/BACKLOG.md` BL-589/BL-712，`specs/repository-anti-corruption/slices/pg011-pg017-remaining.md` §4、§10 D2 甲、RAC-2656～2658。沿用此前已读取的 molis-plugin-dev 技能边界。本轮未读真实 Home、Keychain、私钥或环境变量，未运行模型、生成包、构建或测试；只新增本文。Memory 搜索无相关命中，结论不依赖历史记忆。

根采纳独立工程评审后的增量修订：按同目录 ENGINEERING-REVIEW.md 三项必修修改本文，并在上述冻结树逐项回读 `agent-validation`、workflow 的构建/发布调用、store.release、HTTP authority 及项目检查/试用身份。未将评审所读的新 ref 当作本线重新验证结果；其余已认可产品边界保留，仍为 WAIT。本次只修改本文。

## 1. 交付边界和需要纠正的现状

同一完整交付包含：SDK 唯一 Manifest 算法；`pack-sandbox` 作者入口；创作台真实发布生成可验签分发包；新 Home 范围发布经本人固定、确认进入现有安装链，并能重启恢复。BL377 整体重做不是前置。代码准备不能以“能生成 JSON”或“探针 installInHome 成功”交付。

发现三项容易造成错误实现的事实：

1. `studio-ports.ts:105–119` 写出的 release `manifest.json` 是 **BuildManifest**，不是 PluginManifest。`AgentRelease.manifest` 同样是 BuildManifest（`agent-model.ts:91–96`）。必须转换，不能把 release 五个文件直接装进容器，也不能把原 `packagePath: directory` 改成签名文件后让旧消费者继续猜。
2. `PluginInstallService.preview` 允许查看未固定发布者的合法签名包；`confirm` 没有已有 pin、又没有本人给的非空 `pin_label` 时才以 `plugin.publisher_untrusted` 拒绝。RAC2656 应断言“没有显式固定不能完成安装”，不能改成“未固定连预览也拒绝”。一次确认可以完成首次固定与安装；不另建先固定 API。
3. Home SecretStore 的密文属于这个 Home，但 Keychain 主密钥是全机共享的（`file-secret-store.ts:313–315`）。“删 Home 一起删”应删本 Home 的签名私钥密文与引用，不删除那把共享主密钥。现有 `uninstall --purge-user-data` 已按 owner 目录清理，普通卸载保留用户数据。

不增加迁移、发布者别名、自动重装、unsigned Home、信任例外、密钥轮换 UI、市场上架或新任务系统。Home 发布仍受普通沙箱包限制，不获得 `host_build`、内置声明或项目访问特权；T145 未采用的项目访问不由本单顺带实现。

## 2. SDK 与展示标识的确定归属

当前算法 owner 是 `apps/local-host/src/sandbox-plugin-manifest.ts`，有三个共享符号：`sandboxPluginManifest`、`sandboxIntegrationManifest`、`sandboxUiContribution`，以及两份输入类型。迁入 `packages/plugin-sdk/src/sandbox-manifest.ts`，从现有 SDK 根出口具名导出；不新增仅放一个常量的 subpath，不保留 Host 包装或旧出口别名。

当前展示要求唯一声明确实在 `packages/design-system/src/plugin-presentation.ts:5`：`{ capability_id: 'ui.plugin-presentation', version: 1 }`。contracts 中尚无同名 owner。它是渲染合同标识，不是可调用业务动作；本次将这一个常量的 owner 移到现有 `packages/contracts/src/platform/ui.ts`。删除 design-system 的定义/旧导出，三个生产消费者 `home-plugins.ts`、`plugin-platform.ts`、Manifest 算法直接从 contracts 取；设计系统仍拥有布局类型、组件检查与实际渲染，不迁这套实现。SDK 图标类型从自己的 `./ui/icon.js` 取，不依赖 design-system 或 Host。

Manifest 的调用点精确改接：Host `sandbox-package.ts`、`plugin-builder/installed.ts`、Host `index.ts` 的旧导出，以及 `tests/fixtures/sandbox-package.ts` 的 Host import。集成 Manifest 也搬同一文件，保持行为，不让删除 Host 文件留下另一半算法。

作者入口还需要由 contract.operations 合并 effects。当前有两份算法：`packages/plugin-sandbox/src/schema.ts:122–126` 的 `effectsFromContract`，以及 `plugins/native/plugin-builder/src/agent-validation.ts:7–13` 的 `contractEffects`。后者恰是 `agent-workflow.ts:351、740` 生成构建/发布 BuildManifest.effects 的实际入口，不能漏迁。将前者归 SDK（可在同一模块具名导出），删除 sandbox 原实现及旧出口，同时删除 agent-validation 的重复循环和导出；workflow 两处直接调用 SDK `effectsFromContract(design.contract)`，不留 contractEffects wrapper/re-export，不迁其余设计校验。

其余直接消费者改到 SDK：`installed-plugin-host.ts`、`plugin-builder/build-project.ts`、`plugin-builder/installed.ts`、`sandbox-package.ts`、sandbox 的 schema/index、`tests/security-invariants-plugin-projects.test.ts`。因此修改集合包括这组既有同名函数消费者和上面的创作台实际构建/发布链，而非只有按 effectsFromContract 搜到的文件。包间已存在 sandbox→SDK 依赖，不加反向依赖。独立 oracle 必须进入真实 workflow，核对其产出的 BuildManifest.effects，而非只互比作者包/Host/SDK 的同算法返回值。

`assertContract`、运行时 schema 检查和设计系统的 interface 检查仍在原 owner。pack-sandbox 是有边界的打包工具，不承诺执行源码、重新跑 G1–G6 或证明业务正确；Host 发布前和安装前继续调用生产验证器。CLI 对不可信 JSON 做它消费字段的形状检查、SDK Manifest 校验及路径/体积检查；不复制完整 Host 校验器，也不把结构可打包描述为“已经通过 Host 验收”。

T143/T144 后所有已采用的名单块必须进入同一共享输入。CLI 的动态选项与名单块不得接受任意 Manifest 字段；名单块如已存在则使用前置任务给出的简化声明形状，不能让作者手写宿主派生字段。BL916 尚未采用的五项本单不提前开放。正式开发以根冻结的 adopted base 重新枚举，不把本轮旧 effects 键集合抄成最终合同。

## 3. release → 分发包文件映射

来源必须是按实际目标 scope 通过构建/浏览器检查的冻结 build/release（见 §5），项目范围的绿不能作为 Home 的通过证据。发布者指纹和 scope 必须在生成 PluginManifest 之前确定，签名器不会替你改清单（`signPluginPackage` 身份不相等直接 signer_mismatch）。版本用现有 `releaseVersion(n)`，即 `n.0.0`；plugin_id 仍为 contract.pluginId。

| 分发包 payload.files | 来源与处理 | 独立 oracle |
| --- | --- | --- |
| `plugin.mjs` | 发布检查记录的 bundlePath 经 `readBuildFile` 安全读取；与 release/plugin.mjs 同字节，8 MiB 上限 | 固定输入调用包内生产操作得到预先写定值；同时比较源码与包的代码字节 |
| `manifest.json` | **新生成的 PluginManifest**：SDK 输入 name=design.title、pluginId、n.0.0、实际签名指纹、presentation 存在性、合同 effects、已冻结 scope、允许的图标/声明块/升级版本 | 与 payload.manifest 深相等；固定字面量断言 scope、入口、route、permission、publisher、requires，不只三路互比 |
| `contract.json` | release 的 design.contract，不能为改发布范围偷偷换 pluginId 或改 operation | pluginId 与清单一致；调用输入/输出与冻结 contract 相符 |
| `interface.json` | `{ parts: design.parts, nodes: build.nodes, acceptance: design.acceptance, presentation: design.presentation }`，缺省 presentation 正常省略 | 原生产设计系统验证器验证；parts/nodes/presentation 与发布快照逐项一致 |
| `prompts.json` | `readPluginPrompts(buildSources(...))` 的已检查结果 | id/title/purpose/body 精确对应；不是把代码文件、模型输出日志放进包 |

此基点 `SANDBOX_PACKAGE_FILES` 的应用包只有这五项。**不带 package.json**：普通 `pack` 强制加入 package.json，会被 `readSandboxPackage:74` 拒绝，所以不能用普通 pack 包住 release 目录。T144 若先采用正文资源，则只额外纳入已声明且通过其安全路径规则的正文文件；根必须冻结准确白名单，不能 hardcode“五个永远够用”或递归打整棵目录。

`pack-sandbox <directory> <output.json>`：从输入目录读 code/contract/interface/prompts；发布元数据用明确参数（name、version、publisher-id、publisher-key-id，scope 默认为 project，可选 icon/compatible-from）生成清单，不要求作者手抄整份固定 Manifest。T143/T144 的结构化块用它们已定输入形状，不引入新包内声明文件。目录里的旧 BuildManifest 不作为分发清单，不默默采纳任意已有 manifest。复用 package-files 的逐段 lstat/禁止 symlink、总量限制、输出不覆盖策略；把它需要共用的安全文件读取提成该工具包内函数即可。签名继续原 `sign <input> <private-key> <output>`，验签继续原 verify，包容器仍 schema_version=1。

创作台不用 CLI 子进程、不将私钥写成 PEM 临时文件：Host 组装相同文件映射，调用 SDK builder 和 Runtime `parsePluginPackage/signPluginPackage/verifyPluginPackageSignature`，再用 `readKeptSandboxPackage` 自验。共享算法是 Manifest/effects；文件 IO 属于各自边界，不为这一步迁整个 Host reader 或让 SDK 依赖私有包。

保留 release 的原五文件及 BuildManifest 语义，在该 release 目录另写 `signed-package.json`（它不是 payload 内文件）；`packagePath` 不改义。建议给 AgentRelease 增加明确的可选分发描述 `distribution: { runtime_scope, publisher_key_id }`，分发文件位置由 release owner 固定推导，不把绝对路径或 secret_ref 传到页面。旧 release 没有 distribution 就明确“无签名分发物”，不现场伪造、不读旧字段兜底成签名物；这不是兼容别名或存量迁移。

发布捕获与提交合同：入口从可信 Host 上下文取得项目/build 归属与执行 authority，捕获预期 build revision、目标 scope、待发布版本、合同/界面与对应 scope 的通过检查候选。HTTP 的现有 `pageAuthority`/执行控制通过 workflow 的窄发布端口传递，不能停在 `agent-surface.ts:279` 的入口 assert；非页面受信入口同样提供自己的执行控制，不从 body 接 actor、项目身份或私钥引用。scope 选择是用户意图，执行身份、能力目录和授权仍由 Host 决定。

发布顺序：捕获上述条件 → 校验目标 scope 的资格/声明和所有内容 → 取当前 Home 签名身份 → 独占暂存目录生成 release 和签名包 → 回读验签/读包，并对 Home 调用既有 admission 校验 → release owner 正式提交文件 → `AgentBuilderStore.release` 同 CAS 提交事实。每次异步等待后检查 authority/signal、Host关闭状态、build revision/scope/资格是否仍成立；每个新的持久化副作用前再复核，特别是 SecretStore createIfAbsent、身份元数据写入、暂存写入、正式文件提交与 release 事实提交。控制失效后不继续签名发布，不以清理为名删掉已经合法存在的 Home key 或旧版本。

现有 store.release 只核版本不存在，这不够。它必须在**同一次读取与 CAS**里核 build 仍存在、revision 等于预期、仍具发布资格、检查结果属于捕获的候选与目标 scope、既有发布范围不变、该版本未被占用；不能只在 await 前或调用 store.release 前单独 require 一次。authority 在最终同步提交段前复核，该段不插入 await；文件正式提交/版本冲突与恢复判定由既有 release owner 在单宿主内按 build 串行，store CAS 仍是事实防线。只补发布提交边界，不扩大到全部创作台并发治理，不新增持久任务账或分布式锁。

明确处理“正式文件已提交、事实 CAS 前进程中断”：下一次**本人显式发布**在同一 owner 的提交段先回读 release 与目标 vN。已有 release 引用该目录时绝不删除或覆盖，按已有发布返回/重复发布规则处理；没有 release 引用时，仅当目录确实是该 build/version 的 owner 路径、普通文件布局属于本发布流程且没有其他 release 引用，才清除未登记产物，然后用当前重新核定的资格和独占暂存结果重试该版本。完整包可核签名/清单/合同身份，正常中断留下的不完整产物按已知发布文件集合和 owner 路径核归属；有越界、symlink、额外未知文件或无法确认引用的情况则明确拒绝并保留证据，不盲删。检查与清理之间不允许另一发布者抢占：同 owner 串行并在删除前复核引用；有胜者一律保留。此路径无需新增恢复 manifest，原 release 存储、版本目录及包本身足以判定正常崩溃窗口。

这样正常中断不会留下永久占住 vN 的空壳；若旧调用已失效，恢复只能由新的显式发布及当前资格触发，不复活旧授权或自动发布过时 build。文件提交后的 CAS 拒绝也使用相同 owner 规则清理仅本次未被引用的产物，不能删胜者。失败不能出现“已发布但无完整可验包”；已成功发布但安装失败仍保留 release，安装结果单列，不虚构发布/安装跨 owner 原子事务。

## 4. 每 Home 签名身份的 owner 与生命周期

分成三种事实，不能拿“本人固定”账本存私钥：

| 事实 | owner/位置候选 | 读写与清理 |
| --- | --- | --- |
| Home 发布身份的引用和预期公钥指纹 | 现有 apps/local-host owner 的 `config/plugin-publisher.json`，由单一 `plugin-builder/publisher-identity.ts` 服务管理；在现有 home-stores 的 apps/local-host config 条目中登记这个文件 | 仅 ref、key_id、公钥；不属于任一 projectId，不由删除项目清掉；由现有 Home purge 按注册项清该文件 |
| Ed25519 私钥 | 现有 `packages/storage` SecretStore，固定 Home 内引用，例如 `plugin-builder-publisher:signing-key` | Host 签名服务经 `createLazyFileSecretStore(home)` 操作；密文在 Home/feed，Home purge 清 feed；不新增 Keychain 项，不调用 security、不自写 secrets.json |
| 本人信任哪个发布者 | 现有 `HomeConsentLedger` → Runtime `SqlitePluginConsentLedger` | 只由原确认安装链 pin/revoke；签名身份初始化绝不写 pin |

这是在既有 owner 下新增必要的发布身份记录，不造库或全局身份服务。明确不能用 `plugin-builder/secrets.ts` 当前 `plugin-builder-secret:<projectId>:<pluginId>:<name>` 命名空间存此 key：它是插件网络请求密钥，删除项目时会被清理，且有插件请求解析入口。

初始化仅发生在明确发布动作中，普通打开、列表、下载、安装预览不创建密钥。使用 SecretStore 已有 `createIfAbsent`，禁止 get→put 覆盖竞态；创建者与竞争者都回读胜出的 key、由 Runtime 算指纹，再一次性写/核对公共元数据。私钥仅在受信 Host 签名函数内短期使用，给 Agent/浏览器/release/日志的都不是私钥或其引用。

必须处理的有限状态：

- 两者均不存在：首次明确发布才可创建；两个项目同时发布最终共用一个 key。
- 密文存在、元数据尚未提交（首次初始化中断）：下一次明确发布读取现有 key，补交相同身份元数据，不换 key；纯读取仍不修复。
- 元数据存在、密文丢失/解不开，或二者指纹不符：拒绝发布，保留记录，提示恢复原密钥；不得静默新建来绕过丢失或撤销。对已经成功初始化的可观察状态，不把“读取失败”当作首次发布。
- pin 已撤销：不生成第二把 key、不自动重新 pin；本单不做轮换。可直接拒绝继续发布该不可安装身份并说明撤销不可逆；现有产物保持。安装端仍独立按 publisher_revoked 拒绝。
- 删除一个项目或卸载一个生成插件：只执行已有项目/安装清理，不删 Home 发布身份。普通程序卸载保留用户数据，也保留 key。显式 Home purge 后本 Home 的密文、元数据和 pin 随各 owner 被清；另一个 Home 的发布 key 和共享 Keychain 主密钥不得受影响。

清理证据链已核：`home-stores.ts` 把 feed 归 packages/storage、plugin-builder 和多项 config 文件归 apps/local-host；`installer/uninstall.ts:59–65,205–210` 取注册路径清单，`uninstall-purge.ts:63–78` 删注册路径；`plugin-builder/project-data.ts:15–20` 只删指定 project 子目录和网络 secret 前缀。新增一个 config 注册项后由这套清理自然覆盖，不新增“删除 Home”入口。选择 config 文件而不放 plugin-builder 的项目子路径，正是为避免当前 project-data 只校验 basename 的清理规则误删 Home 身份。

元数据按现有 config 注册项的 ordinarySnapshot 保存，feedSnapshot 保留密封 secrets，故正常 Home 整体备份恢复会恢复同一发布身份。本单不加“恢复即轮换”或设备绑定；RAC2658 的第二 Home 是独立初始化的 Home，不是人为复制原 Home 密文后的身份克隆试验。

## 5. 旧项目、新 Home 发布与现有确认链

**最小身份选择：只新增 Home 分发，不迁移已有 agent-built 项目。** 旧 project release/安装按 `installedSignature(buildId) = agent-built:<id>`、既有 version/安装 ID 和数据继续工作。其新项目发布可以附带 BL589 签名分发包，但原项目生命周期不借此改写 publisher。签名分发包导入已装同 pluginId 的旧项目，会按原签名冲突拒绝；明确提示，不自动卸载，不声称这是无损升级。旧项目“导出签名包”与原“更新项目安装”是不同动作，界面不能混标。

新 Home 发布从尚未发布的 build 首次选择 Home 范围开始；`agent-workflow.ts:257` 的 pluginId 本已来自新 build UUID，不需发明别名/重写 bundle。scope 一经该 build 的第一份发布固定不再变；已有项目发布历史不在本单改成 Home，给出明确范围冲突。新 Home release 只经签名安装入口，原 `ports.lifecycle('install'|'upgrade'|...)` 的 agent-built 项目路径不得接受 Home distribution。Home 包升级依赖 T141 最终协议；无回滚。升级兼容列表只引用同 scope、同签名身份的已发布版本，不能把旧 agent-built 版本冒充同发布者历史。

**目标 scope 是实际检查输入，不是签名前加一个 Manifest 字段。** 现有 studio-ports 的 catalog/missingPlugins/check 与 studio-preview 的 capability/runner 都来自项目 context；第一次在发布处选择 Home 时，需更新该 build 的目标范围/revision，使原项目检查和浏览器通过状态不能满足 Home 发布资格，停止旧范围的试用 runner，并清除或标为不再适用的原通过结果。在同一现有检查/试用流程重新检查：Host 注入可信 Home 目录/服务与 `projectId=null` 的沙箱身份；检查结果绑定该 scope、合同/候选和版本状态，runner 缓存键也纳入目标 scope，不能按原 bundle 路径命中项目 runner。可复用与 scope 无关的已生成源码，不重新调用模型，不新增第二套生成器或验收流程。

Home 的 missingPlugins/能力替身/真实试用必须共同使用 Home 实际可达目录；不能读取项目目录来造替身，也不能通过启用某个项目插件补齐 Home 缺依赖，更不能从请求 body 取 project_id 填给 Home runner。涉及目标依赖、服务身份及真实浏览器动线的检查须重跑，且通过之后才允许 §3 发布捕获。暂不支持的声明或服务明确拒绝或回草稿修改；T143/T144 只接已采用的真实能力，BL916/T145 未采用部分不开放。Home admission 在发布自验和原安装链两处各负其责，检查/试用本身不 pin、不安装，不借沙箱预览获得内置特权。

保持项目发布原行为，是本次最小范围的工程选择，依据是已有项目不迁移、T149只增加 Home。若根要求把旧项目和所有项目安装也统一切成签名路径，那是额外的身份/数据切换任务，不能在本片以兼容映射暗做。当前 accepted 不要求这项切换，无需以此重新问 unsigned 或扩大到 BL377。

用户动线最小可用：在现有发布处明确 project/Home 范围；首次改选 Home 显示需要按个人空间重新检查，在原检查/试用流程通过后再发布，不能显示旧项目绿色即允许发布；发布成功可下载完整 signed-package.json；沿现有设置的“导入插件包”选择该文件，检查 scope、发布者指纹、权限/声明后本人确认。可先用这一条完整路径，不为了省一次导入开发跨页面自动带包/自动确认机制。下载只凭当前项目的 buildId/version 定位 owner 已发布文件，不接受任意路径；复用现有 Host 请求授权，UI 只得到包，不得到本地路径。`agent-surface.ts:126–128` 的 publicRelease 必须继续遮蔽新增的内部信息。

确认链：设置 `settings-plugins.ts:189–224` 导入 → project 的 plugin-trust API → 已注册 `plugins.install.preview` → `verifyPluginPackageSignature` → `readKeptSandboxPackage` → Home admission/namespace/scope 预检 → 展示。确认时 `plugins.install.confirm` → actor/project/时效/一次性 preview 复核 → 重新查冲突与撤销 → 若尚未固定且本人输入 label，`ledger.pinPublisher` → `packages.save` → `packagedRelease` → `installInHome` → Runtime 沙箱。

本轮 preview 是 @3，accepted T144 将改变它；开发调用最终动作目录版本，不固定本轮 @3。CLI 原 `runLocalPluginInstall`/resident Host gateway、`--pin-as` 和 `--confirm` 是同一路，可用于集成验证，不能在测试里直接调用 ledger.pinPublisher 代替人的首次确认路径。

取消/缺确认不 pin、不 save、不 install。预览不持久化包，但内存里有 TTL preview 属于既有行为。**不要承诺确认后所有安装失败都回滚 pin**：现行 confirm 在 pin/save 后才启动安装，启动失败可能已经留下 pin/存档；必须分别核实和展示。T141 若调整此顺序沿采用结果，本单不另造跨 owner 原子事务。

## 6. 精确验收 oracle（拟实施后运行，本轮全为 NOT RUN）

RAC 2656–2658 使用已预留号；以下 BL589/工程条目只是本文标签，不占新 RAC 或 S 号。每条调用生产路径，预期值由固定 fixture 写定，不从同一生成函数反算。

| 条目 | 输入/交错 | 必须观察的结果 |
| --- | --- | --- |
| SDK-1 | 固定合法 contract：不同操作间重复/乱序 effects（不是单个操作内非法重复），带与不带 presentation、project/Home 两种 scope；走真实 workflow 的 adopt/prepareBuild 和 publish | 手写独立期望核构建与发布的 BuildManifest.effects 及包所用效果集合，例如 query 的 storage:[read] 加 command 的 storage:[write,read]，期望固定 [read,write]；关键 Manifest 字段精确相符；Host/CLI 同形只是补充。contractEffects 旧循环/wrapper/出口删除；SDK 无私有依赖，外部作者只装 contracts+SDK 能生成 Manifest |
| PACK-1 | 固定五文件源、CLI pack-sandbox→原 sign→原 verify→Host read；逐项改 body/代码/Manifest/公钥 | 正样本可进入原预览；改签名内容拒 signature_invalid；不同 signer 拒 signer_mismatch；缺文件、manifest mismatch、额外 package.json、越界/symlink/超限拒；失败无输出覆盖/安装副作用 |
| PUB-1 | 合法固定 build 触发真实 workflow publish，读取 release 与包；两个并行发布同 build/version | 上表逐项映射准确，BuildManifest 未被 PluginManifest 覆盖；只有一条同版本 release，已发布记录均有完整可验包，失败不删胜者；操作固定输入得到独立期望值；不需要真实模型生成 |
| PUB-2 | 发布停在真实 await 边界，另一请求分别 revise/remove/变更目标 scope，或使 authority失效/Host关闭，再放行；在新 key、正式文件和事实提交边界注入交错 | 不新增 stale release 或失效后的签名发布；同 CAS 拒绝资格/revision已变的候选。失效前已有的 Home key/元数据/旧版本和其他调用胜者保留；失效后不新建 key/元数据，不继续正式提交；只按 owner 清本次未登记产物，不把已合法写入的 key 误删为“回滚” |
| PUB-3 | 正式版本目录完成后、release CAS 前模拟进程中断，再启动并明确发布；再覆盖有胜者引用及另一正常版本的情况 | 未登记的已知 owner 产物经核定清理后同 vN 可成功重试，只有一条完整可验的 release，不永久占位；已有引用绝不删/覆盖，其他版本不变；旧草稿已失效时不自动接续，只允许新的显式发布按当前资格决定 |
| SCOPE-1 | 项目独有 capability 的 build 在项目检查/浏览器中通过，首次改选 Home；另用纯私有存储的合法 Home 样本 | 项目旧绿失效，缺 Home capability 的候选不能发布，无新分发 release/pin/安装；不借项目替身或启用项目插件过关。Home检查及真实试用捕获的可信 projectId 均为 null，旧项目 runner 不复用；合法 Home 样本按目标重验后才可发布、本人安装并运行 |
| KEY-1 | 同一隔离 Home 两个项目并发首次发布，重启后发布；另一独立 Home 首发 | 前两者同一公钥/指纹，后者不同；并发使用真实 SecretStore createIfAbsent；key 创建不 pin；页面/日志/包无私钥、secret_ref 或 Home 绝对路径 |
| KEY-2 | 已有元数据后移除其测试密文、解密失败、指纹不符、撤销 pin、初始化中断 | 前三种拒且不旋转；撤销不能重建身份绕过；中断后只复用已存在 key；普通读取不补写；测试只用隔离 file backend/临时 key |
| RAC-2656 | Home A 发布签名 Home 包；真实 preview，再 confirm consent=true 但不传 pin_label；另测取消、过期、actor/project不符 | preview 成功且 publisher_pinned=false；confirm 分别按原错误拒；零新 pin、零包存档、零安装/业务数据；不能拿低层 unsigned 拒绝代替 |
| RAC-2657 | 同一包重新 preview，本人 label+consent 确认；再发布第二包/版本 | 首次 pin 记录 actor、公钥/指纹准确，安装 pinned+sandbox，project_id=null；执行固定命令写值再读回；Host 重启从验签包恢复同安装/业务值。后续包仍需确认但不重复 pin；Home 升级由 T141 实际接口验证，不能手写 runtime.install |
| RAC-2658 | Home B 自己已固定 B 的 key，导入 A 的包，不传 A 的 pin_label | A 验签有效但在 B 预览仍未固定；confirm publisher_untrusted，B 无 A 的 pin/安装/业务写；A 的固定不跨 Home 生效。若 B 本人明确固定 A，则这是普通外部发布者，不额外禁止 |
| ID-1 | 已有 agent-built 项目安装；同 pluginId 的新签名 project 包；试图把旧 build 切成 Home | 旧安装 ID/发布者/数据不变；签名覆盖拒且不自动 pin；scope 切换拒。新 build 的 Home 发布正常，不接收旧项目 grants/secrets/数据，不造别名；旧 release 项目生命周期回归仍通 |
| LIFE-1 | 已安装 Home 包撤销 publisher，或有待完成操作时停用/取消 | 后续 effect 按既有生命周期拒绝，无迟到业务写；不靠签名服务或安装重试恢复执行。测试复用 T141/既有 revoke 用例，只补本地签名入口接线 |
| CLEAN-1 | 两项目共用 key；删其中项目、卸载一个插件、普通程序卸载，再显式 purge A | 前三种保留 A 发布身份，purge 才清 A 的身份元数据和密文；B key仍可签验，公共 Keychain adapter未收到删除调用；以生产 purge 路径断言，不能仅 rm 临时目录作为产品证据 |
| UI-1 | 独立测试浏览器：Home发布→下载→设置导入→首次固定确认→Home入口使用；取消后再次进入 | scope/指纹/权限确实显示，取消无安装副作用，确认后真正操作成功，重启可恢复；物理点击/下载文件和真实导入，不靠 page.evaluate 调内部 service 代替。T401 已采用导航能力若不在最终基点，要标明可用入口及依赖，不虚称全导航验收 |

对输入异常区分容器 `plugin.package_invalid`、签名错误、Host `plugin.declaration_invalid`，不要为测试全绿把错误统一改掉。CLI 无完整语义验证承诺时，错误 contract 在 Host 拒绝才是对应 oracle，不能错误要求打包命令证明运行可用。

建议复用定向文件：`tests/plugin-package.test.ts`、`plugin-authoring.test.ts`、`agent-built-plugins-workflow.test.ts`、`agent-built-plugins-workbench.test.ts`、`agent-built-plugins-checks.test.ts`、`agent-built-plugins-capabilities.test.ts`、`security-invariants-plugin-install.test.ts`、`security-invariants-plugin-install-cli.test.ts`、`home-installed-plugins.test.ts`、`security-invariants-sandbox-home-instance.test.ts`、`security-invariants-publisher-revoke.test.ts`、`uninstall.test.ts`；外部作者两包路径 `plugin-sample.e2e.test.ts`。按实际新增入口补少量具名用例，不复制整套测试框架。真实 BuildManifest 独立期望、scope 负例、发布资格交错和正式文件/CAS中断恢复须进入对应生产链的定向用例，不能以 mock ports.publish 恒成功或测试脚本自己 CAS 代替；缺失/并发 key 同样定向覆盖。测试名称/注释带对应 RAC，具体文件归根正式范围冻结。

未来命令顺序：公共 build 槽 `pnpm build` → 公共测试槽 `node scripts/run-tests.mjs --jobs 1 <冻结文件>` → API/动作快照、boundary/health 与页面资源按实际 diff 验证 → 根在最终精确 head 调度 CI Full。SDK/合同、信任和持久身份变化意味着工程候选 full=true；本线不跑 Full，也不把本方案当 Full 豁免。若新增资源或单资源涨超10KB，按既有资源规则由根处理，不能预先写许可。

## 7. 实施顺序、允许路径与冻结条件

一个 writer 串行完成同一交付：先 SDK/常量/effects 搬迁并消除 workflow 重复算法、作者 pack → Host 消费同算法及按目标 scope 的检查/试用 → Home 身份与受 authority/revision/CAS 约束的发布和中断恢复 → 下载/范围表达与既有导入确认路径 → 真实隔离 Home 与 UI 验证。中间可分可审阅提交，不能把“SDK搬完”记为 T149/BL589完成。

允许范围候选：SDK 的 sandbox-manifest 与 index/API；contracts 现有 ui 标识；design-system 去旧标识；plugin-sandbox 删除 effects 旧实现及其列明消费者；tooling/plugin-cli 的 cli/index/package-files/小型 sandbox pack 模块与文档；Host 原 manifest 文件删除、sandbox reader/imports、两个 supervisor 常量 import、plugin-builder studio-ports/agent-surface/studio-preview/发布身份服务、home-stores 新增上述 config 文件注册；plugin-builder 的 agent-validation 删除 contractEffects、agent-workflow 两处 effects 调用及发布/目标检查控制、agent-store.release 的同CAS资格核验、AgentBuild/AgentRelease 的范围和检查输入表达、现有发布 UI；相关有限测试及必要翻译/资源快照。Host 只在现有检查/试用端口注入可信 Home 目录与服务，必要接线纳入根冻结清单，不另造特权预览平台。HomeInstallService/ledger/trust 算法原则上不改，T141/T143接缝按最终依赖处理；不另开宿主特权安装路由、不改保护 #1101 文件。SI/accepted slice/Backlog 由根串行。

根发单前须冻结以下输入，冻结的是实现基点和范围，不是重新进行产品投票：

1. T143、T144 的采用状态、准确 SHA、Manifest 参数/名单块、body 资源白名单、最终 preview 版本；若 T144 未采用，本文不提前实现它，后继任务明确迁入 SDK 同一 builder。BL916 未采用五项保持不支持。
2. T141 最终 SHA、Home 安装/升级/恢复及失败留下 pin/包的真实语义；本轮 main 仍写“Home 不就地升级”，不能用它假装满足已接受 D1。
3. SDK/contract/export/effects 的文件锁解除与保护 #1101 隔离；有任何交集仍 WAIT。此次没有读取该分支或把它作为代码来源。
4. T149+BL589 同一正式书采纳本方案的身份边界：旧项目不迁移，Home 首次发布 scope 固定，已发布项目 build 不改范围；签名分发下载后走现有导入。若 root 选做旧安装转换，应另行明确身份/数据/授权合同，不能隐含到本书。
5. 最终 scope 下的 UI owner/授权入口、Home可信目录/服务注入接缝与检查结果绑定、持续执行控制到发布owner的传递、Home导航依赖、源码/测试文件清单，和新分发字段/发布参数是否触及注册动作 schema；触及时依现行规则升版本并同改调用方，不能以“只是 UI 参数”逃过合同检查。

没有从 accepted 中发现必须重新向用户裁定的产品矛盾。当前待项是共享锁和采用基点，不是 unsigned 的新选择。独立准备已经完成；可以作为根起同一完整交付正式任务书的工程输入，**仍不得据此启动实现、改协调表、宣告 READY 或消耗构建测试槽**。

## 2026-11-01 11:35Z 根执行窗口

用户已要求加速W5、增加开发并行。原方案与三必修复核采纳，完整T149＋BL589交给开发线4实施；这取代旧书仅WAIT/不得实施的排期，不改产品语义。实际main M=e4bf46ca920e72fd54cb4dc83f2f41e6d3b04485，冻结父输入T394 H=3878296adf2dbf12c809c79e093b3410d22a4658（含准确PR1b、T141、T143已采用输入和完整T144）。从M建立独立feature工作树并普通merge该冻结父；T394未采用前可做独立候选，最终发布/采用在父后，不把父候选称main能力。

实施读同目录ENGINEERING-REVIEW-INCREMENT.md及/private/tmp/t149-next/EXECUTION.md现行hunk交接：SDK唯一Manifest/effects、CLI pack-sandbox、完整发布owner、同Home签名身份、真实scope检查/试用、CAS/中断恢复和实际下载导入链一起完成。T143派生权限与T144正文声明/路径规则全部随唯一Manifest主人迁入，使用真实preview@4；BL916未实现五项不提前开放。旧项目不迁移、Home首次发布scope固定、无自动pin/unsigned例外等原合同不变。

开发4现在拥有其余允许路径；contracts/platform/ui.ts的presentation常量hunk、plugin-builder/installed.ts和home-plugins.ts的imports/必要接线暂只出候选补丁，根待PR1c/T145相关hunk冻结后串行接入。不要将这三处短等待扩为整Host/SDK锁；SDK index具名导出可实施，PR1c的page-routes/view-placement校验不重做。共享API/actions、SI、基线、总词典和状态文档只交窄候选给根。保护#1101等分支不碰、任何产品语义新取舍才报根。

按原书有区分度的完整相关文件和必要真实UI闭环验证，沿用未变父证据；公共build/test槽、jobs1/retries0、独立测试浏览器，子代理不跑本机Full。无额外固定README矩阵、哈希账本或多轮复核；准确最终H的full=true仍由根排。作者先实现完整路径后交一页报告，不以SDK搬迁或可生成JSON提前结单。真实Home/4207/Keychain/真凭据/真模型不动，测试只在隔离Home与file secrets里进行。


2026-11-01 12:54Z 测试隔离纠正：用户报告重复Keychain not found。根查authd定位两批T149 workflow测试的内层G7 Browser回落/Applications/Google Chrome.app，临时HOME触发loginKC:queryCreate；8个涉事Chrome与2个SecurityAgent PID均已退出，日志所见创建请求失败。外层test-kit专用不等于内层已隔离。作者3f92da607已在实际studio options注入browserExecutable并给共用测试fixture加显式专用路径检查；各本线wrapper的TEST_CHROME/BUILDER_BROWSER/BROWSER_PATH均须钉专用molis-test-browser，file secret backend保留。产品默认和真实钥匙串不改。根核静态差量后已放行一次相关完整文件回归，其余独立开发继续。原测试失败保留，不把隔离修复当作产品主链已通过。
