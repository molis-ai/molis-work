# BL-588：非 `host` 等级不在宿主进程里跑（设计稿）

状态：设计稿，待统筹审（2026-10-26，防腐线 ac-clients-1 片；基线 main `29f1ffd47`），未实现。动安全边界，按统筹要求先交稿再做。号段 RAC-990～999、BL-735～739；本稿不占新的 S 号，扩 S-75（安装身份）。待裁定 D1～D5 见 §6。

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

`execution` 为 `host` 的定义（代码在宿主进程里跑）只在 `host` 等级下被接受，除非它是 Runtime 的 `inProcess.admit` 里的那个对象。违反时抛 `plugin.grant_denied`（与 T1 那个方向同码）。

- `assertTrustFitsExecution(trust, execution, admitted)`：新增 `admitted`，由 `assertTrustFitsDefinition` 传 `options.inProcess?.admit.has(definition)`。
- 安装在 `assertInstallIdentity` 里拒，先于安装、同意、私有数据准备与清理（同 S-75 的顺序，不留副作用）。
- 启动与恢复前由 `assertStartIdentity` 重验同一条；冲突存量记 `crashed` 与同码诊断，不登记处理器或提供方，不重复恢复：把 `plugin.grant_denied` 加进 `isIdentityFailure`（现在只认 `plugin.signer_mismatch`、`plugin.id_namespace_conflict`）。注意 `plugin.grant_denied` 在别处也用，所以 `isIdentityFailure` 要能区分——实现片在启动复查里抛带标记的同码错误，或把这条换成专用码（实现片定，倾向后者：`plugin.in_process_denied`，加进 `plugin-errors.ts`，contracts 快照随改）。

### 3.2 Runtime 选项 `inProcess`

`PluginRuntime` 的构造选项新增 `inProcess?: { readonly admit: ReadonlySet<PluginDefinition> }`：

- **给了就严格**：只有 `admit` 里的定义对象可以在非 `host` 等级下进程内跑；空集即「一个都不许」。
- **没给就不查**：裸 `new PluginRuntime` 只出现在测试里（它是 Runtime 的机制测试，不是宿主）。生产构造点由门禁强制必须写 `inProcess`（§3.6），所以「没给」在生产里进不去。这是 D2 的方案 B；方案 A（必填，同 `hostIds`）见 §6。
- 不进任何 contracts 类型，不在 Manifest、包、动作输入里出现（RAC-993）。

### 3.3 开发目录（D1：设计稿的核心取舍）

作者对着自己的目录跑 `plugin dev --allow-unsigned-development`，这一下是作者明说授权的、在作者自己的机器上执行作者自己的代码，威胁模型和 `node script.js` 一样。真正的风险不在作者的代码，在两处：**这扇门被对准有真实 Home 的宿主**，和**开发留下的记录被常驻宿主当成普通安装**。

| 方案 | 做法 | 评价 |
| --- | --- | --- |
| O1 | 子进程，用 Node 权限模型限制文件与网络 | 不是真正的沙箱（Node 自己的文档也这么说）；Integration 插件要宿主端口，跨进程要新建一整套代理；工作量大、收益是名义上的。不推荐 |
| **O2（推荐）** | 保持在进程里跑，但把这扇门收窄成「唯一的、封闭的例外」：①`runPluginDevelopment` 自己用刚加载出的那个定义对象建 `inProcess: { admit: new Set([definition]) }`，不接收参数里的放行；②`developInPrivateHost` 只接受**私有开发宿主**（§3.4）；③隔离状态目录与标记文件、不带 Home、一次性安装—运行—卸载，都照旧；④常驻宿主（严格）启动时拒绝任何非 `host`、进程内、没卸载的记录（§3.5） | 把「能在宿主进程里跑非 host 代码」缩成一个代码里可数的点，由门禁（RAC-994/995）盯住；开发循环（Integration 插件的 health/poll）不变 |
| O3 | 开发目录只做沙箱形态：`plugin dev` 把目录构建成沙箱定义，在真沙箱里跑 | 最干净，但 Integration 插件（connector driver）没有沙箱形态，等于砍掉现在唯一能跑的开发循环；是产品取舍，不是工程取舍。长期方向，等 Integration 有沙箱形态再做 |

D1 需要裁：O2（推荐）还是 O3。O2 不改变任何用户可见的行为；O3 会。

### 3.4 私有开发宿主与 `developInPrivateHost`（D4）

- `local-plugin-development.ts` 里新增 `createPrivateDevelopmentHost()`（不带 Home，建出的 Host 记进模块内的 `WeakSet`）；`runLocalPluginDevelopment` 用它建 Host。
- `developInPrivateHost` 先检查 host 在这个 `WeakSet` 里，否则拒（`actions.scope_mismatch`，同它现有的口径），再做它现有的身份与项目一致检查。
- 两个现有测试（`management-door-identity`、`goals-project-database-refusal`）用普通测试 Host 加一个不存在的目录来断言拒绝顺序，改成用 `createPrivateDevelopmentHost()` 建 Host；它们断言的拒绝不变。再加一条「普通 Host 被拒」。
- `runPluginDevelopment` 继续导出（`tests/plugin-development-artifacts.test.ts`、`tests/runtime-provider-identity.test.ts` 直接跑它，且它在函数内部自己造 `inProcess`，参数没法放宽它），本稿不动它的导出。

### 3.5 常驻宿主与存量记录

- 项目（`plugin-platform.ts`）与 Home（`home-plugins.ts`）构造 Runtime 时传 `inProcess: { admit: <夹具定义对象的集合> }`：集合由各自的 `pluginFixtures` 选项算出（`pluginFixtureEntries` 里的 `definition`），所以夹具只放行它自己；生产入口从不传 `pluginFixtures`，集合为空。官方集成（`official-integrations.ts`）传空集。
- 严格 Runtime 在启动复查时，对任何 `state != uninstalled`、`publisher_trust != "host"`、`execution = "host"` 且定义不在 `admit` 里的记录，按 §3.1 拒绝。开发目录的记录在隔离状态目录里、跑完即卸载（`state` 为 `uninstalled`），常驻宿主从不打开那个目录，所以不会遇到。
- **真实 Home 的核对（D3）**：本稿预计没有违例存量（开发目录不写真实 Home，夹具只在测试里）。但这是推断，要在真实 Home 的**只读副本**上核对（immutable URI 备份到副本再查，同 W5-17 的做法）：数出 Home 库与各项目库里满足上面条件的记录。有违例就走维护（卸载或改成沙箱形态），不在读取时兜底。这一步要读真实 Home，按规矩先问用户。

### 3.6 门禁

`tests/plugin-in-process-call-sites.test.ts`（AST，进 `test:security`，照 `plugin-install-trust-call-sites.test.ts`）：

1. 非测试源码里每个 `new PluginRuntime(` 的选项都写 `inProcess`；
2. `inProcess.admit` 不是空集字面量或来自夹具的位置，只有 `plugin-development.ts`；
3. 非测试源码不在任何调用或对象字面量里传 `pluginFixtures`（只在 `MolisWorkLocalHostOptions` 里声明、在 Host 里读）；
4. 非测试源码里的每个 `supervisor.start(` 条目要么写 `trust`，要么来自登记（`HOST_BUILD_TRUST`）——这条已经被严格 Runtime 在运行时兜住，门禁只是让它在 CI 里早红。

### 3.7 RAC-383 的另一半：映射不了沙箱形态的 Manifest 安装时拒绝

沙箱定义由 `AgentRelease`（operations 契约）经 `sandboxedPluginDefinition`（`plugin-builder/installed.ts`）建出。签名包的 Manifest 里哪些声明沙箱形态承载不了（比如连接器驱动、Manifest 的某些贡献类型），**本稿还没逐项核对**，不下结论。实现片先写一条测试把「Manifest 能声明的」与「沙箱定义实际兑现的」逐项对出来：对出来是空集，就只补一条断言并记录；不是空集，就在预览阶段（`plugins.install.preview`）拒绝并带具名错误码，不留装了但不生效的状态。这一片独立于其余几片，可以最后做或在 D 项里砍掉。

### 3.8 文档与安全表

- 改 `trust-rules.ts` 里 `assertTrustFitsExecution` 的注释（去掉「T2 把它们映射到沙箱」的说法，改成本稿的封闭清单）。
- `docs/system/SECURITY-INVARIANTS.md` 的 S-75 加第 ⑥ 项（非 `host` 等级的进程内代码），断言「拒绝」本身的测试进 `tests/security-invariants-install-identity.test.ts`（D5：扩 S-75，不新开 S 号，同 D6 先例）。
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
| S5 | BL-739 | 真实 Home 只读核对与（如有）维护；§3.8 的文档与 S-75 行 | RAC-999 |

| 编号 | 内容 | 证据 |
| --- | --- | --- |
| RAC-990 | 严格 Runtime 里，`unsigned` 或 `pinned` 等级配 `execution: "host"` 的定义，安装被拒（`plugin.grant_denied` 或专用码），不留记录、同意、私有数据 | `tests/security-invariants-install-identity.test.ts` |
| RAC-991 | 放行按定义对象的身份：内容相同、对象不同的定义不被放行；`host` 等级不受影响；同一定义在没放行的 Runtime 里被拒 | 同上 |
| RAC-992 | 启动与恢复前复查：库里已有的「非 `host`、进程内、没卸载」记录记 `crashed` 与同码诊断，不登记处理器或提供方，不重复恢复尝试；活实例再次 `start` 也重验 | 同上 |
| RAC-993 | 没有 Manifest 字段、包字段、动作输入、库里的记录能打开 `inProcess`；`inProcess` 不在 contracts 与插件 SDK 的公开 API 快照里 | 同上；`pnpm api:update` 无 diff |
| RAC-994 | 生产里每个 `new PluginRuntime(` 都写 `inProcess`；放行集合只有夹具与开发目录两处来源 | `tests/plugin-in-process-call-sites.test.ts` |
| RAC-995 | 非测试源码不传 `pluginFixtures`；开发目录的放行集合恰好是它刚加载出的那一个对象，调 `runPluginDevelopment` 的参数放宽不了 | 同上；`tests/plugin-development-artifacts.test.ts` 加一条 |
| RAC-996 | 常驻宿主（项目与 Home）里，漏写 `trust` 的启动条目、夹具以外的 `unsigned` 进程内启动条目都被拒；登记的内置条目与沙箱包条目不受影响 | `tests/security-invariants-install-identity.test.ts` |
| RAC-997 | `developInPrivateHost` 只接受私有开发宿主；普通 Host 被拒；负载里的身份字段与项目不一致照旧被拒 | `tests/management-door-identity.test.ts`、`tests/goals-project-database-refusal.test.ts`（改后） |
| RAC-998 | 映射不了沙箱形态的 Manifest 在预览阶段被拒并带具名码、不留装了不生效的状态；或对账结果为空集并有断言 | `tests/plugin-package.test.ts` 或新文件，实现片定 |
| RAC-999 | 真实 Home 与各项目库的核对结果记入 `docs/`，无违例或已维护；S-75 行、`ac-trust-install.md` C1/RAC-383、`THIRD-PARTY-PLUGINS.md` 与注释已按 §3.8 更新 | `pnpm health:check`；文档核对 |

测试按槽位跑，只跑改到的文件：`packages/plugin-runtime` 的单元、`tests/security-invariants-install-identity.test.ts`、新的门禁用例、`tests/plugin-development-artifacts.test.ts`、`tests/management-door-identity.test.ts`、`tests/goals-project-database-refusal.test.ts`，加 `pnpm test:security`；全量交 CI 与统筹。

## 6. 待统筹或用户裁定

| # | 问题 | 选项与推荐 |
| --- | --- | --- |
| D1 | 开发目录怎么处理（§3.3） | **O2 保持进程内、收成唯一封闭例外（推荐）**；O3 只做沙箱形态（砍掉 Integration 的开发循环，产品取舍，要用户定）；O1 不推荐。统筹定 O2 就不必问用户；选 O3 要问用户 |
| D2 | 例外机制的默认（§3.2） | **B：没给 `inProcess` 就不查，生产靠门禁强制必写（推荐）**，改动在 Runtime、四个生产点与新门禁，测试几乎不动；A：必填（同 `hostIds`），裸 Runtime 也严格，约 85 个测试文件要机械改一遍（`hostIds: ISOLATED_HOST_IDS` 一族），换来的只是裸 Runtime 也严格，对生产没有额外保证 |
| D3 | 真实 Home 只读核对（§3.5） | 要读真实 Home 的副本，按规矩要用户同意。推荐 S5 前问一次；不同意就只在测试里证明、文档里写明未核对 |
| D4 | `developInPrivateHost` 限制成私有开发宿主（§3.4） | 推荐做；代价是两个现有测试改造 Host 的建法 |
| D5 | 安全表怎么记 | **扩 S-75 加 ⑥（推荐）**，同 D6 先例；新开 S 号则要等号段 |

另有一个顺带的取舍，不需要裁定：错误码用 `plugin.grant_denied` 还是新增 `plugin.in_process_denied`（§3.1）。推荐专用码，因为 `isIdentityFailure` 靠码判断，而 `plugin.grant_denied` 在别处也用；要改 contracts 的错误码表与快照，实现片会在 PR 里写对调用方的影响（无外部调用方，现在不留兼容期）。
