# BL-588：非 `host` 等级不在宿主进程里跑（设计稿）

状态：设计经统筹 2026-10-26 裁定（#1311 评论 6410517262：D1 选 O2，D2 选 B，D4 做，D5 扩 S-75 ⑥，错误码用专用的 `plugin.in_process_denied`）；S1～S4 与 S5 的文档部分已实现（防腐线 ac-clients-1 片，分支 `claude/bl588-non-host-trust-design`，没开 PR，BL-735～738 已做完删行）；S5 的真实 Home 核对被权限拦下，留作 BL-739，见 §3.5 与 §6 D3。号段 RAC-990～999、BL-735～739；不占新的 S 号，扩 S-75。

接 `specs/repository-anti-corruption/slices/ac-trust-install.md` §2 的 C1 与 RAC-383：T1 只落了一个方向（`host` 等级不得配沙箱定义）；另一个方向（非 `host` 等级不得在宿主进程里跑）和「映射不了沙箱形态的 Manifest 安装时拒绝」留给了 T2，即本条。

## 1. 现状（事实，已按 `origin/main` 核对）

1. **检查只有一个方向。** `assertTrustFitsExecution`（`packages/plugin-runtime/src/trust-rules.ts`）只拒 `host` + `sandbox`，它的注释写着「另一个方向暂未拒，开发目录和测试夹具仍在宿主进程里以 `unsigned` 跑」。`PluginRuntime.install` 经 `assertInstallIdentity` → `assertTrustFitsDefinition` 调它；`assertStartIdentity` 在每次启动与恢复前重跑同一条。所以补在这一处，安装与启动同时受益。
2. **记录里两个字段都在。** `PluginInstanceRecord.publisher_trust` 与 `execution`（contracts `platform/plugin`）都落库，启动时可以对存量复查，不用新字段。
3. **生产里构造 `PluginRuntime` 共 4 处：** `plugin-platform.ts`（项目，`scope: "project"`）、`home-plugins.ts`（Home，`scope: "home"`）、`official-integrations.ts`（`HOST_BUILD_TRUST`）、`plugin-development.ts`（开发目录）。前三处的启动条目要么是登记给的 `HOST_BUILD_TRUST`，要么是沙箱定义（`installed-plugin-lifecycle.ts`，信任取包验过的那个），所以**今天常驻宿主里没有非 `host` 的进程内代码**；但没有任何检查保证这一点：启动条目漏写 `trust`，会按 `entry.trust ?? UNSIGNED_TRUST`（`supervisor-releases.ts`）静默地以 `unsigned` 在宿主进程里跑。
4. **开发目录是生产里唯一真有的例外。** `runPluginDevelopment`（`apps/local-host/src/plugin-development.ts`）要 `allow_unsigned_development`，用 `loadDevelopmentPlugin` 对作者目录 `import()`（`development-loader.ts`，在宿主进程里执行），自己 `new PluginRuntime`、`trust: UNSIGNED_TRUST`、`execution` 缺省即 `host`，只跑 Integration 插件（health/poll），`finally` 里卸载（留私有数据）。入口 `runLocalPluginDevelopment`（命令行，`molis-work plugin dev`）先建带标记文件的隔离状态目录，再 `createMolisWorkLocalHost()`（不带 Home）、项目 `plugin-development`；真正干活的 `developInPrivateHost(host, …)` 是**导出的，接受任何 Host**（现在的调用方：上面那个入口，加 `tests/management-door-identity.test.ts`、`tests/goals-project-database-refusal.test.ts`）。
5. **测试夹具。** `MolisWorkLocalHostOptions.pluginFixtures`（`project-host.ts`，`assertFixtureScopes`）与 `home-side.ts` 的 `pluginFixtureEntries`：夹具定义在进程内跑，「从不给 `host` 等级」，沙箱夹具被拒。生产入口不传这个选项。
6. **影响面（静态数，用于估改动量）。** 75 个测试文件直接 `new PluginRuntime(`、46 个 `createPluginPlatform`、14 个 `new PluginSupervisor(`；84 个文件 198 处 `pluginFixtures`；72 个文件 261 行 `hostIds: ISOLATED_HOST_IDS`（`tests/fixtures/isolated-host.ts`），另约 10 个文件写 `hostIds: new Set([…])`；约 111 行 `start([{ definition` 不带 `trust`（缺省 `unsigned`）。这些测试装的几乎都是进程内的 `unsigned` 定义。
7. **现有同类门禁。** `tests/plugin-install-trust-call-sites.test.ts`（RAC-381-T1）：每个生产 `PluginRuntime.install` 调用都给出确定的 `trust`、不用 `bundled`。本稿的门禁照它的做法。

## 2. 设计原则

1. 规则写一处（`assertTrustFitsExecution`），安装和启动都经它。
2. 例外只由宿主**代码**给，永远不由**数据**给：Manifest、包字段、调用输入、库里的记录都不能让一个定义进宿主进程。例外按定义**对象的身份**给（同 `pluginEntryIdentity` 的做法），不按内容、不按名字。
3. 例外是封闭清单，只有两个：开发目录一个、测试夹具一个；新增要改本稿并经统筹。与 ac-trust §2 里 `unsigned` 的封闭来源清单（开发目录、创作台产物）对应：创作台产物本来就是沙箱定义，不占进程内的例外。
4. 常驻宿主（项目与 Home 的监督器）除夹具外不带例外；夹具在生产里恒为空集。
5. 不留兼容：存量记录按维护处理，不在读取时兜底。

## 3. 设计

### 3.1 规则 R1

`execution` 为 `host` 的定义（代码在宿主进程里跑）只在 `host` 等级下被接受，除非它是 Runtime 的 `inProcess.admit` 里的那个对象。违反时抛专用身份拒绝码 `plugin.in_process_denied`。

- `assertTrustFitsExecution(trust, execution, admitted)`：新增 `admitted`，由 `assertTrustFitsDefinition` 传 `options.inProcess?.admit.has(definition)`。
- 安装在 `assertInstallIdentity` 里拒，先于安装、同意、私有数据准备与清理（同 S-75 的顺序，不留副作用）。
- **RAC-990-UPGRADE-01**（批 B 补原评审 P1）：升级/回滚也用当前安装的可信 trust 对目标定义复查同一身份、运行范围与进程准入；在停旧实例、捕获/处理私有数据、候选 `validateUpgrade`、登记或保存之前拒绝。running 与 disabled 均要证明精确 `plugin.in_process_denied`、候选预检/启动为零、旧记录/实例/数据无变化；该目标对象实际被准入后，同一升级按原运行/停用语义成功。
- 启动与恢复前由 `assertStartIdentity` 重验同一条；冲突存量记 `crashed` 与同码诊断，不登记处理器或提供方，不重复恢复：把 `plugin.grant_denied` 加进 `isIdentityFailure`（现在只认 `plugin.signer_mismatch`、`plugin.id_namespace_conflict`）。错误码用专用的 `plugin.in_process_denied`（统筹已定；`plugin.grant_denied` 别处也用，`isIdentityFailure` 靠码判断），加进 `plugin-errors.ts`，`runtimeFailureCodes` 也列上，使启动失败时原样抛出而不被改成泛泛的 `executor_failed`；contracts 快照随改（只多一行）。

### 3.2 Runtime 选项 `inProcess`

`PluginRuntime` 的构造选项新增 `inProcess?: { readonly admit: ReadonlySet<PluginDefinition> }`：

- **给了就严格**：只有 `admit` 说「有」的定义对象可以在非 `host` 等级下进程内跑（`admit` 只要能回答 `has(definition)`，装与启动时现问，所以宿主代码事后往里加的也算）；空集即「一个都不许」。
- **没给就不查**：裸 `new PluginRuntime` 只出现在测试里（它是 Runtime 的机制测试，不是宿主）。生产构造点由门禁强制必须写 `inProcess`（§3.6），所以「没给」在生产里进不去。这是 D2 的方案 B；方案 A（必填，同 `hostIds`）见 §6。
- 不进任何 contracts 类型，不在 Manifest、包、动作输入里出现（RAC-993）。

### 3.3 开发目录（D1：设计稿的核心取舍）

作者对着自己的目录跑 `plugin dev --allow-unsigned-development`，这一下是作者明说授权的、在作者自己的机器上执行作者自己的代码，威胁模型和 `node script.js` 一样。真正的风险不在作者的代码，在两处：**这扇门被对准有真实 Home 的宿主**，和**开发留下的记录被常驻宿主当成普通安装**。

| 方案 | 做法 | 评价 |
| --- | --- | --- |
| O1 | 子进程，用 Node 权限模型限制文件与网络 | 不是真正的沙箱（Node 自己的文档也这么说）；Integration 插件要宿主端口，跨进程要新建一整套代理；工作量大、收益是名义上的。不推荐 |
| **O2（推荐）** | 保持在进程里跑，但把这扇门收窄成「唯一的、封闭的例外」：①`runPluginDevelopment` 自己用刚加载出的那个定义对象建 `inProcess: { admit: new Set([definition]) }`，不接收参数里的放行；②`developInPrivateHost` 只接受**私有开发宿主**（§3.4）；③隔离状态目录与标记文件、只用该开发状态自己拥有的 Home（不接普通/真实 Home）、一次性安装—运行—卸载，都照旧；④常驻宿主（严格）启动时拒绝任何非 `host`、进程内、没卸载的记录（§3.5） | 把「能在宿主进程里跑非 host 代码」缩成一个代码里可数的点，由门禁（RAC-994/995）盯住；开发循环（Integration 插件的 health/poll）不变 |
| O3 | 开发目录只做沙箱形态：`plugin dev` 把目录构建成沙箱定义，在真沙箱里跑 | 最干净，但 Integration 插件（connector driver）没有沙箱形态，等于砍掉现在唯一能跑的开发循环；是产品取舍，不是工程取舍。长期方向，等 Integration 有沙箱形态再做 |

D1 需要裁：O2（推荐）还是 O3。O2 不改变任何用户可见的行为；O3 会。

### 3.4 私有开发宿主与 `developInPrivateHost`（D4）

- `local-plugin-development.ts` 的无参 `createPrivateDevelopmentHost()` 仍不带 Home，建出的 Host 记进模块内的 `WeakSet`，只供身份/项目范围的前置拒绝。2026-10-26 批 B 按 Root 的 A×B 裁决：真实 `runLocalPluginDevelopment` 先保现有 marker 与非空普通目录拒绝，校验后只构造固定 `state_directory/home` 的私有 Host，再在同一模块内部登记；该 Home 是原开发例外自己的必要 Goals owner，不是另一种进程内放行。不得新增任意 Home 参数、公开 mark/admit 方法或把普通/真实 Home Host 转为私有。
- `developInPrivateHost` 先检查 host 在这个 `WeakSet` 里，否则拒（`actions.forbidden`），再做它现有的身份与项目一致检查。
- **RAC-997**：普通/真实 Home Host 仍在接触开发目录前被拒（`actions.forbidden`）；身份/项目范围前置测试使用无参私有 factory。PLIB-14 的开发路径通过真实 `runLocalPluginDevelopment`，先成功生成自己的 `development.db`，再破坏同一库的原五种 ledger/shape 情形，要求 `actions.missing` 且无修复或半写；原 catalog、其他插件及 Home Goals 半的断言保留。健康开发成功与现行公开 `goalEntryActions.initialize` 接线共同证明可达，不能被 WeakSet 提前拒绝；不为保留旧 `actionAvailability` 观察而加生产注入口，实际调用版本未独立录制的边界明确保留。
- `runPluginDevelopment` 继续导出（`tests/plugin-development-artifacts.test.ts`、`tests/runtime-provider-identity.test.ts` 直接跑它，且它在函数内部自己造 `inProcess`，参数没法放宽它），本稿不动它的导出。

### 3.5 常驻宿主与存量记录

- 项目（`project-plugins.ts` 经 `createPluginPlatform`）与 Home（`home-plugins.ts`）构造 Runtime 时传 `inProcess: fixtureAdmission(<夹具条目>, <测试自己手工装的>)`（`home-side.ts`）：放行的是各自 `pluginFixtures` 里的定义对象，加上测试往 `pluginFixtures.installed`（项目侧直接调 `ensureProjectPlugins` 的测试用端口上的 `installedByHand`）里放的对象。后一类是**实现时发现的、设计稿没估到的测试面**：不少测试把自己做的 `unsigned` 进程内定义用 `platform.runtime.install(…)`、`upgrade(…)`、`platform.start([…])` 直接装进 Host 的 Runtime（测的是别的东西：声明在启动时被拒、升级期间迟到的结果被拒等），这些现在要先把那个对象放进集合，等于测试在扮演宿主代码。集合在装与启动时现问，所以测试先建集合、需要时再往里加。生产入口从不传 `pluginFixtures`（RAC-995）。集成登记的共用 Runtime（现行 `integration-registry.ts`；原 `official-integrations.ts` 已移除）与已装沙箱包的平台（`installed-plugin-host.ts`）传空集。
- 严格 Runtime 在启动复查时，对任何 `state != uninstalled`、`publisher_trust != "host"`、`execution = "host"` 且定义不在 `admit` 里的记录，按 §3.1 拒绝。开发目录的记录在隔离状态目录里、跑完即卸载（`state` 为 `uninstalled`），常驻宿主从不打开那个目录，所以不会遇到。
- **真实 Home 的核对（D3）**：本稿预计没有违例存量（开发目录不写真实 Home，夹具只在测试里），但这是推断。统筹转述用户 2026-10-26 同意读真实 Home 的只读副本（immutable URI 备份到副本、只数记录、核完删副本，同 W5-17）；**2026-10-26 实际去做时，会话的权限分类器按「个人数据」拒绝了这一步（统筹转述的同意不算会话里的授权），没有读，也没有绕**。要查的是：Home 库（`plugin_runtime_installs` 表）与 `projects/*/molis-work.db` 里 `publisher_trust != 'host'`、`record_json` 的 `execution = 'host'`、`state != 'uninstalled'` 的行数。要用户给这条命令的权限规则（或自己跑一次那条只数行数的查询）后才能做；有违例就走维护，不在读取时兜底。

### 3.6 门禁

`tests/plugin-in-process-call-sites.test.ts`（AST，进 `test:security`，照 `plugin-install-trust-call-sites.test.ts`）：

1. 非测试源码里每个 `new PluginRuntime(` 的选项都写 `inProcess`；
2. `inProcess.admit` 不是空集字面量或来自夹具的位置，只有 `plugin-development.ts`；
3. 非测试源码不在任何调用或对象字面量里传 `pluginFixtures`（只在 `MolisWorkLocalHostOptions` 里声明、在 Host 里读）；
4. 非测试源码里的每个 `supervisor.start(` 条目要么写 `trust`，要么来自登记（`HOST_BUILD_TRUST`）——这条已经被严格 Runtime 在运行时兜住，门禁只是让它在 CI 里早红。

### 3.7 RAC-383 的另一半：映射不了沙箱形态的 Manifest 安装时拒绝

沙箱定义由 `AgentRelease`（operations 契约）经 `sandboxedPluginDefinition`（`plugin-builder/installed.ts`）建出。RAC-383 逐项核对合法 Manifest 中沙箱形态承载不了的声明（integration、常开、本机工具、事件、端口、多出的权限），连同包文件、接口与贡献不匹配，在签名通过后的安装预览以 `plugin.declaration_invalid` 拒绝，并确认没有固定发布者、保存包或安装。现行签名沙箱包支持 `runtime: { scope: "home" }`，由 RAC-961 保留安装正例；未知 runtime scope 在签名前由 Manifest 解析以 `plugin.manifest_invalid` 拒绝、无写入，RAC-383 单独验证这一更早的边界。

### 3.8 文档与安全表

- 改 `trust-rules.ts` 里 `assertTrustFitsExecution` 的注释（去掉「T2 把它们映射到沙箱」的说法，改成本稿的封闭清单）。
- `docs/system/SECURITY-INVARIANTS.md` 的 S-75 加第 ⑥ 项（非 `host` 等级的进程内代码），断言「拒绝」本身的测试进 `tests/security-invariants-in-process.test.ts`（D5：扩 S-75，不新开 S 号，同 D6 先例）。
- `docs/system/THIRD-PARTY-PLUGINS.md` §1「`plugin dev` … 在宿主进程里执行」与 §5「host 执行只接受 `trust: HOST_BUILD_TRUST` 的内置条目」补上：开发目录是唯一的进程内例外，由 `inProcess.admit` 一个对象放行。
- `ac-trust-install.md` 的 C1 与 RAC-383 两处把「T2 余项」改成「BL-588 已做」（落地后）；`packages/plugin-runtime/README.md` 开发要求补一行。

## 4. 不做

- 不把开发目录放进真沙箱或子进程（O1/O3），不新增权限模型层面的隔离；
- 不动 `unsigned` + 沙箱（创作台产物）和 `pinned` + 沙箱（BL-628）两条路；
- 不加读取兼容或迁移；
- 不改 contracts 的任何导出（`inProcess` 只在 `packages/plugin-runtime` 的构造选项里，不在 `packages/contracts`、`packages/plugin-sdk`）。如果实现片采用专用错误码，则 contracts 的错误码表与快照随改，其余不变。

## 5. 分片与验收

分片与待办号（顺序 S1 → S2 → S3，S4 和 S5 独立；整组一个 PR）：

| 片 | 待办 | 内容 | 验收 |
| --- | --- | --- | --- |
| S1 | BL-735 | Runtime 规则 R1、`inProcess` 选项、启动复查、`isIdentityFailure`（含错误码取舍）；产品行为不变（生产点此时还没传 `inProcess`，裸 Runtime 不查） | RAC-990～993 |
| S2 | BL-736 | 项目、Home、官方集成、开发目录四个生产点传 `inProcess`；夹具集合；§3.6 的门禁 | RAC-994～996 |
| S3 | BL-737 | 私有开发宿主与 `developInPrivateHost` 限制，两个测试调整 | RAC-997 |
| S4 | BL-738 | §3.7：Manifest 与沙箱定义逐项对账，必要时预览阶段拒绝 | RAC-998 |
| S5 | 原BL-739（随干净重建取消） | 原真实Home只读核对与维护已取消（统筹T-321，6529444914）；§3.8现行说明与S-75行保持 | RAC-999（原核对不再执行） |

| 编号 | 内容 | 证据 |
| --- | --- | --- |
| RAC-990 | 严格 Runtime 里，`unsigned` 或 `pinned` 等级配 `execution: "host"` 的定义，安装被拒（`plugin.grant_denied` 或专用码），不留记录、同意、私有数据 | `tests/security-invariants-in-process.test.ts` |
| RAC-991 | 放行按定义对象的身份：内容相同、对象不同的定义不被放行；`host` 等级不受影响；同一定义在没放行的 Runtime 里被拒 | 同上 |
| RAC-992 | 启动与恢复前复查：库里已有的「非 `host`、进程内、没卸载」记录记 `crashed` 与同码诊断，不登记处理器或提供方，不重复恢复尝试；活实例再次 `start` 也重验 | 同上 |
| RAC-993 | 没有 Manifest 字段、包字段、动作输入、库里的记录能打开 `inProcess`；`inProcess` 不在 contracts 与插件 SDK 的公开 API 快照里 | 同上；`pnpm api:update` 无 diff |
| RAC-994 | 生产里每个 `new PluginRuntime(` 与 `createPluginPlatform(` 都写 `inProcess`；放行集合只有夹具与开发目录两处来源 | `tests/plugin-in-process-call-sites.test.ts`（已进 `test:security`） |
| RAC-995 | 非测试源码不传 `pluginFixtures`；开发目录的放行集合恰好是它刚加载出的那一个对象，调 `runPluginDevelopment` 的参数放宽不了 | 同上（门禁文件里第二条用例，含 `scripts/replay-plugins.mjs` 一个封闭的重放工具例外） |
| RAC-996 | 常驻宿主（项目与 Home）里，漏写 `trust` 的启动条目、夹具以外的 `unsigned` 进程内启动条目都被拒；登记的内置条目与沙箱包条目不受影响 | `tests/security-invariants-in-process.test.ts`（Runtime 与监督器）、`tests/security-invariants-in-process-host.test.ts`（常驻宿主的项目与 Home） |
| RAC-997 | `developInPrivateHost` 只接受私有开发宿主；普通/真实 Home Host 被拒（`actions.forbidden`）；负载里的身份字段与项目不一致照旧被拒；真实开发入口只用其已校验状态自己的 Home，并保 Goals 公开 initialize 与同库破坏拒绝 | `tests/management-door-identity.test.ts`（前置拒绝用无参 factory）、`tests/goals-project-database-refusal.test.ts`（真实开发入口先成功，再破坏同一 development.db） |
| RAC-998 | 映射不了沙箱形态的 Manifest 在预览阶段被拒并带具名码、不留装了不生效的状态；对账结果为空集：`readSandboxPackage` 已拒绝任何不等于沙箱形态的 Manifest（`plugin.declaration_invalid`，S-84），本片只补断言 | `tests/security-invariants-plugin-install.test.ts`（S-84 原有的加 7 个逐项用例） |
| RAC-999 | 原真实Home与各项目库核对随干净重建取消（原BL-739，T-321 6529444914），不将取消记为已核对；S-75 行、`ac-trust-install.md` C1/RAC-383、`THIRD-PARTY-PLUGINS.md` 与注释已按 §3.8 更新 | `pnpm health:check`；文档核对 |

测试按槽位跑，只跑改到的文件：`packages/plugin-runtime` 的单元、`tests/security-invariants-in-process.test.ts`、新的门禁用例、`tests/plugin-development-artifacts.test.ts`、`tests/management-door-identity.test.ts`、`tests/goals-project-database-refusal.test.ts`，加 `pnpm test:security`；全量交 CI 与统筹。

## 6. 待统筹或用户裁定

| # | 问题 | 选项与推荐 |
| --- | --- | --- |
| D1 | 开发目录怎么处理（§3.3）。**统筹 2026-10-26 裁定 O2。** | **O2 保持进程内、收成唯一封闭例外（推荐）**；O3 只做沙箱形态（砍掉 Integration 的开发循环，产品取舍，要用户定）；O1 不推荐。统筹定 O2 就不必问用户；选 O3 要问用户 |
| D2 | 例外机制的默认（§3.2）。**裁定 B。** | **B：没给 `inProcess` 就不查，生产靠门禁强制必写（推荐）**，改动在 Runtime、四个生产点与新门禁，测试几乎不动；A：必填（同 `hostIds`），裸 Runtime 也严格，约 85 个测试文件要机械改一遍（`hostIds: ISOLATED_HOST_IDS` 一族），换来的只是裸 Runtime 也严格，对生产没有额外保证 |
| D3 | 原真实Home只读核对（§3.5，原BL-739），当时被权限分类器拦下、未做；2026-10-30随干净重建取消（T-321 6529444914） | 不再推进旧Home核对或维护；现行安全拒绝由测试证明，真实重建另等用户“开始” |
| D4 | `developInPrivateHost` 限制成私有开发宿主（§3.4）。**裁定做，已实现。** | 推荐做；代价是两个现有测试改造 Host 的建法 |
| D5 | 安全表怎么记。**裁定扩 S-75 加 ⑥，已写。** | **扩 S-75 加 ⑥（推荐）**，同 D6 先例；新开 S 号则要等号段 |

另有一个顺带的取舍（已定专用码 `plugin.in_process_denied`，已实现）：错误码用 `plugin.grant_denied` 还是新增 `plugin.in_process_denied`（§3.1）。推荐专用码，因为 `isIdentityFailure` 靠码判断，而 `plugin.grant_denied` 在别处也用；要改 contracts 的错误码表与快照，实现片会在 PR 里写对调用方的影响（无外部调用方，现在不留兼容期）。
