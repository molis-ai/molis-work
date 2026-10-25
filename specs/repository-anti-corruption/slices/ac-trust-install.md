# ac-trust：一条安装路、常开与默认连线只认声明、同意可撤回（设计稿）

状态：已定（2026-10-24）；七项待定都已定，#1098 已合入，实现按 §7 分片，T1 在分支 `claude/ac-trust-t1`，T3 在分支 `claude/ac-trust-t3`（叠在 T1 上）。

验收编号：RAC-380～399，另加一段 RAC-400～409（实现片也用它）。待办号：BL-555～564。安全不变量先写 S-67、S-68，合入时由统筹核连续。管 `privileges.md` 的 PG-001、PG-004、PG-005，并给 PG-049 提供它要用的同意账本；与 PG-002、PG-013、PG-015、PG-016 的衔接写在 §3.8。本片不改 `privileges.md` 状态列。

方向来自用户 2026-10-18「插件不分官方、个人、创作台生成还是第三方，待遇一样，只有安装信任按发布者签名区分」，和统筹 2026-10-23 的口径：安装确认对所有插件一条路；`always_on` 与默认连线只认 Manifest 声明，不认「是不是内置」；没签名的插件声明了，要用户在安装确认里同意；内置插件默认同意、不打扰；同意可撤回。

## 1. 要解决什么

今天「谁能做什么」有一部分取决于一个布尔量 `bundled`（宿主启动名单里标没标），而不是插件自己的声明加人的同意：

| 现状（已按 `origin/main` 核对） | 位置 | 问题 |
| --- | --- | --- |
| 宿主不调 `verifyPluginPackage`，只有 `tooling/plugin-cli` 在用；包里没有公钥，宿主里没有信任根 | `packages/plugin-runtime/src/package-verification.ts`、`docs/system/THIRD-PARTY-PLUGINS.md` §1 | 外部插件没有安装确认；R-36 |
| 安装只有两条：随宿主发布（`bundled`，`execution: "host"`）和创作台生成（`execution: "sandbox"`，权限由 `APPROVED_KEY` 那份项目内批准决定） | `packages/plugin-runtime/src/index.ts:139-241`、`apps/local-host/src/installed-plugin-lifecycle.ts` | 两条路的确认、授权、提供方身份各写各的 |
| `always_on` 只许 `bundled` 声明，别处来的安装在 `validateInstalledManifest` 里直接拒 | `install-rules.ts:79-83`、S-34 | 插件能不能声明，由「是不是内置」定，不由声明与同意定 |
| 常开名单取自内置目录里 `personal` 且声明了 `always_on` 的条目；Goals 的「每个项目都带」靠建项目时写死 `"goals"` | `apps/workbench/src/plugin-catalog.ts:101-107`、`modules/projects/src/project-service.ts:70`、`:120` | 常开不是从安装记录生成的；外部插件声明了也没有地方生效 |
| 默认连线与默认输入组只在两端都 `shipsWithHost` 时生效，装上的插件写的 `default_source` 当作没写 | `apps/local-host/src/plugin-default-bindings.ts:11-35`、`plugin-entry-identity.ts` | 同上；而且没有「人同意过」这件事可查 |
| 随宿主发布的插件在安装与每次启动时拿齐声明的权限（`bundledGrants`），并跟着宿主构建升降版本（`recordToFollow`） | `install-rules.ts:25-37,101-137` | 权限这半已经和别的插件同一规则（PG-003，#741）；剩下的特权只在「谁免于确认」 |

## 2. 设计总览

**把「内置」从一个布尔量改成安装信任的一个等级。** 安装只有一条路，路上有一个步骤叫「判定信任」，产出三种等级之一；之后要不要确认、跑不跑沙箱、提供方身份、声明要不要同意，都是这个等级加插件自己的声明算出来的，不再有按插件名或按「是否内置」开的分支。

```text
来源（宿主构建 / 签名包 / 开发目录 / 创作台产物）
  → 取证据 → 判定信任（host / pinned / unsigned）
  → 预览（发布者、权限、需要同意的声明）→ 人确认（host 等级：宿主代为默认同意）
  → 安装（Plugin Runtime 一个事务写记录、授权、同意）→ 启动
```

三个等级只回答「谁给的证据」，不回答「这个插件重不重要」：

| 等级 | 证据 | 谁判定 |
| --- | --- | --- |
| `host` | 这个 `PluginDefinition` 对象是宿主启动名单里的那个（对象身份，现在的 `pluginEntryIdentity` 做法），不看 Manifest 里写什么；它编进宿主构建 | 宿主，在进程内 |
| `pinned` | 包里带 Ed25519 公钥，公钥的指纹等于 Manifest 的 `publisher.signature`，签名验得过，并且这个指纹在 Home 的发布者表里已被人固定（首次安装时由人在预览里固定） | `verifyPluginPackage` + 发布者表 |
| `unsigned` | 没有可验的签名。**封闭清单，只有两个来源**：开发目录（`--allow-unsigned-development`）和创作台产物；新增来源要改本稿并经统筹。`molis-work plugin install` 对没签名的包仍一律拒绝（`THIRD-PARTY-PLUGINS.md` §3 第 2 步不变），没签名的包不会走到 `unsigned` 等级（RAC-387） | 无证据 |

### 2.1 等级决定什么（一张表，实现只读这张表）

| | `host` | `pinned` | `unsigned` |
| --- | --- | --- | --- |
| 验签 | 不需要（代码就在宿主构建里） | 每次安装、升级、回滚都验 | 不适用 |
| 首次确认 | 不弹窗；宿主按声明代为同意并记账（`granted_by: "host_build"`） | 发布者首次出现：显示指纹，人固定后才继续；同一发布者之后的包不再重复固定，但权限提升与需要同意的声明仍要确认 | 每次安装都确认，权限逐项给，没有「全部允许」 |
| 执行 | 宿主进程（`execution: "host"`） | 沙箱（`execution: "sandbox"`） | 沙箱 |
| 权限 | 现行规则不变：必需的总有，可选的按人留下的给，全新安装默认全开（PG-003） | 必需的加人确认的可选权限 | 同 `pinned` |
| `always_on`、默认连线 | 默认同意 | 必须显式同意 | 必须显式同意 |
| 动作提供方身份 | `plugin_id` | `plugin-install-<sha256(plugin_id, publisher.signature) 前 32 位>` | 同 `pinned` |
| 升级、版本 | 跟宿主构建（`recordToFollow`，PG-016） | 同发布者、版本更高、授权不扩（现行升级规则） | 同 `pinned` |

「跑不跑沙箱」是这张表的结果：`host` 等级以外一律沙箱，安装前检查 Manifest 能不能映射到沙箱形态（`docs/system/THIRD-PARTY-PLUGINS.md` §5 阶段一），映射不了的在安装时拒绝并说明（`plugin.declaration_invalid`），不降级成宿主进程。

## 3. 设计细则

### 3.1 一条安装路（PG-001）

- **平台安装服务**：新增 `apps/local-host/src/plugin-install-service.ts`（宿主装配，不属于任何插件）。它做取证据、判定信任、预览、确认、调 Plugin Runtime 的 `install`；`tooling/plugin-cli` 的 `plugin install` 只解析参数后转给常驻宿主（硬约束：一个 Home 一个执行进程）。判定规则本身是纯函数，放在 `packages/plugin-runtime/src/trust-rules.ts`，和 `install-rules.ts` 并排，宿主与测试共用。
- **宿主构建这条也走它**：监督器启动内置插件时（`packages/plugin-runtime/src/supervisor.ts` 的 `startInstallInput`），不再传 `bundled: true`，改传 `trust: { level: "host" }`，并由安装服务按当前 Manifest 的声明生成代为同意的记录。内置插件看到的体验不变（不弹窗），变的是它的特权都落成了账上的一行。
- **验签接上**：`verifyPluginPackage` 的调用方是安装服务，不再只有命令行。包信封要带公钥（§4 C9），宿主先核「公钥指纹 == `publisher.signature`」再验签；公钥不由调用方临时传。
- **创作台产物也走它**：现在 `installedLifecycle` 自己收的批准（`APPROVED_KEY`、`covered`）保留到创作台随 BL-377 删除；它经 `resolvePluginTrust` 得到 `unsigned`，不能声明 `always_on`、默认连线（今天也声明不了），所以不需要同意账本的行。

### 3.2 声明需要同意（PG-004、PG-005 的共同底座）

Manifest 里有三类声明会改变「这个插件在别处的效果」，装在安装预览里单列，每一类可以单独同意或拒绝：

| 声明 | Manifest 位置 | 同意的是什么 |
| --- | --- | --- |
| `always_on` | `always_on: true` | 「每个项目都开、删不掉」 |
| 默认连线 | `ports.inputs[].default_source` | 「默认从 X 读 Y」，每条是一个同意的对象（目标端口 + 来源插件 + 来源端口 + 来源插件当时的发布者签名） |
| 默认输入组 | `ports.input_groups[].default` | 「默认用这一组输入」 |

规则：`host` 等级默认同意；`pinned`、`unsigned` 必须显式同意。拒绝一项不阻止安装，那一项就不生效（`always_on` 拒了，它就是普通插件；默认连线拒了就不绑），这是为了让人能装而不被迫接受全部声明；是否允许「拒绝单项还装」见 §10 待定 1。

同意的对象带来源插件的发布者签名，是为了防抢注：宿主插件声明「默认从 `io.molis.work.coding` 读 changesets」，以后某个外部插件占了同一个 `plugin_id`，它的发布者签名对不上同意记录里的那一个，连线不绑（S-67）。

### 3.3 同意账本与撤回（PG-049 的机制）

同意是一行显式记录，不是推出来的状态。新表由 Plugin Runtime 拥有（`packages/plugin-runtime` 的仓库，Home 级库），别的包只经导出函数读：

| 表 | 列 | 说明 |
| --- | --- | --- |
| `plugin_publishers` | `key_id`（公钥指纹）、`public_key_spki_base64`、`label`、`pinned_at`、`pinned_by`、`revoked_at` | 发布者固定表。固定一次，对整个 Home 生效 |
| `plugin_consents` | `consent_id`、`plugin_id`、`publisher_signature`、`kind`（`always_on` / `default_wiring` / `default_group`，预留 `local_directory` 给 PG-049 的本机目录读取）、`subject`（该类声明的规范化字符串）、`manifest_digest`、`granted_at`、`granted_by`（`user` / `host_build`）、`revoked_at` | 一行一项同意。`manifest_digest` 记同意时的 Manifest，声明变了（新增一条默认连线）就是新的一项，需要新的同意 |

撤回（`plugins.consent.revoke`）把 `revoked_at` 写上，按撤权处理：

1. **收回在途调用**：并入 S-15/S-18 已有的授权世代检查，撤回让这个安装的授权世代前进，执行中的调用在 `beforeEffect()` 和每次写之前被拒，不再写任何业务记录；处理器开始之前被拒的，只留一行「未执行」的诊断行（硬约束，不记内容）。实现片先核 `validate_authority` 现在怎么算世代，再把「同意」并进去，不另写第二套收回。
2. **效果随类**：`always_on` 撤回后，它不再出现在常开名单里（§3.4），人可以在项目里隐藏或移除它；`default_wiring` 撤回后，来源为 `default` 且对应这一项的绑定被解开，并且记着不再自动绑；`default_group` 同理；发布者撤回（`plugins.publisher.revoke`）后，这个发布者的所有已装插件停用、不能再升级，数据保留（`THIRD-PARTY-PLUGINS.md` §4）。
3. **所有等级的同意都可撤**（用户 2026-10-24 定，不分等级）：`host` 等级的 `always_on` 仍是宿主代为同意、默认开，但和别的等级一样可撤；撤回后它就是普通插件，可以从项目里隐藏、移除。所以 `plugin_consents` 不需要 `revocable` 列。

### 3.4 常开从安装记录生成（PG-004）

- 常开名单 = 状态为已安装且在运行的安装记录里，Manifest 声明了 `always_on` 并且有一行有效同意（未撤回）的插件。不再读内置目录，也不再有写死的 `"goals"`。
- Goals 的 Manifest 加 `always_on: true`，`ProjectService.register` 里的 `new Set(["goals", ...])` 去掉；Shelf 已经声明。
- 项目成员关系对常开插件是**派生**的：`listPlugins` 返回「存的成员 ∪ 常开名单里的非个人插件」，不再靠建项目时写行，所以以后装上的常开插件对已有项目也立刻生效，撤回后也立刻不强制。个人插件（Shelf）本来就不存成员（没隐藏就开着），常开只让它「不能隐藏」：`listHidden` 不列常开插件的隐藏标记，旧标记不再起作用。Goals 与 Shelf 的区别（Goals 是项目级插件、Shelf 是个人插件）不再靠常开名单区分，仍由各自的 Manifest 和放置声明决定。
- `ProjectPluginCatalog.isAlwaysOn?` 与「常开必须是 `personal`」的过滤（`plugin-catalog.ts:105`）都删掉，改成 `alwaysOn(): readonly ProjectPluginId[]`，每次求值，由宿主适配器从安装记录与同意账本算出。
- 服务端拒绝卸载、停用、从项目里移除常开插件（`catalogErrors.plugin_always_on`、`pluginErrors.always_on`，复现见 `privileges.md` V-01）。三个入口各在自己的位置、都在改任何东西之前拒绝：从项目移除在 `ProjectService.removePlugin`（含依赖它的插件会被一起移除的情形）；Home 路由的停用在 `HomePluginHost.leaveRefusal`；卸载在 `PluginRuntime.uninstall`（作为后盾）。`PluginRuntime.stop` 不查：宿主关机、项目关闭都会停插件，那不是人的停用；人的停用只有 Home 路由这一个入口（项目级插件的停用就是从项目移除）。生成插件的平台没有 Home 账本、今天没有同意，所以不会常开，它的停用与卸载入口不查；T2 给它接上账本时一并加。

#### 3.4.1 Goals 不在项目里时要核的地方（T1/T3 的验收）

常开同意都可撤，所以 Goals 也可能被撤掉常开后从某个项目里移除。按插件同等待遇，别的部分本来就不该假定 Goals 在；实现片逐处核，每处写一条「Goals 不在时」的用例（RAC-400），不留隐患：

| 地方 | 现状 | 要的结果 |
| --- | --- | --- |
| 建项目 | `ProjectService.register` 写死 `"goals"`（`modules/projects/src/project-service.ts`） | 改读 `alwaysOn()` 与 `initial()`；没有 Goals 的建项目也成功 |
| 工作台外壳 | `immersive-shell.ts` 的 `RAIL_CORE_ORDER` 与 `plugin.id === "goals"` 的锁定；`shell-page-renderer.ts` 里默认启用名单 `["goals", "sessions", "inbox", "feed", "artifacts"]`；`plugin-catalog.ts` 的 `DOCK_DEFAULT_PINS` | 名单里没有的插件不显示，不是空位；锁定改读常开名单 |
| 首页与搜索 | `project-home.ts` 打开 Goal、`global-search.ts` 的 `goals` 来源、`placement.ts` 里打开 Goal | 来源或目标插件没启用就不列、不报错 |
| 标签页与分屏 | `tab-workspace.ts`、`frame-container.ts`、`editing-graph.ts` 里对 `goals` 的特判 | 没有 Goals 时不尝试打开 Goal 视图，恢复旧布局时跳过丢掉的标签 |
| 宿主动作 | `goals-actions.ts` 的 `readProjectGuidance`、`goal-project-application.ts` | 项目里没有 Goals 时返回「没有」，不抛错 |
| 调 Goal 动作的插件 | Coding、Work 等经动作目录调 Goal 动作 | 动作目录里没有时按「能力不可用」处理，不崩 |
| MCP 与命令行的 goal 工具 | MCP 默认工具与 Runtime 工具里的 goal 相关工具、`molis-work` 命令行里的 goal 命令、`goal-advance` Skill | 项目没有 Goals 时工具列表不列、调用得到「能力不可用」的明确答复，不是内部错误；Skill 文字不假定 Goals 在 |
| 新建项目与引导 | 新建项目流程与项目上手引导里对 Goal 的假定（默认第一个 Goal、引导步骤、导入材料后建 Goal） | 没有 Goals 时跳过这些步骤，引导仍能完成，不出现空步骤 |
| 项目页渲染 | 项目首页、项目页的服务端渲染与客户端脚本里对 Goal 列表、Goal 画布的假定（`shell-page-renderer.ts` 的 `goal-canvas-shell` 等） | Goals 不显示时页面照常渲染，不留空画布和失效的入口 |
| Feed、成果库等挂 Goal 的地方 | Feed 条目、成果库、过程项、动量与回执里「挂到某个 Goal」的字段和入口 | 没有 Goals 时这些入口不显示；已有挂着 Goal 的记录原样保留、只读，不报错、不丢 |

这些是现状的调用点，不是完整清单；T1 开工时用 `git grep` 补全，补出来的也归这一条验收。

**T3 的核对结果（2026-10-25）**：服务端和数据的几处在 T3 做完并有用例；页面与客户端脚本里的几处在 T3 只核了现状，不能在没有浏览器的会话里验证，拆成 BL-585（T3b）：

| 地方 | T3 的结果 |
| --- | --- |
| 建项目 | 做完。`register` 只写 `initial()`；`tests/security-invariants-always-on-records.test.ts` 在 Goals 被撤回后建项目成功、不存 Goals 行 |
| 工作台外壳 | 部分。「Goals 不能移除」的锁改读 Manifest 的 `always_on`（`declaresAlwaysOn`），不再认名字 `"goals"`。`RAIL_CORE_ORDER`、`DOCK_DEFAULT_PINS` 是内置插件的默认顺序和默认固定，不假定 Goals 在，不改；插件选择器（`pluginMarketCards`）和锁仍读 Manifest 的声明而不是账本，撤回之后的显示归 BL-585 |
| 宿主动作 | 核过，不用改。`readProjectGuidance` 在没有 Goals 时拒绝，两个调用方（`agent-host-composition.ts`、`assistant-authority.ts`）都吞掉拒绝、不加这一层 |
| 调 Goal 动作的插件 | 核过，没有。`git grep` 在 `plugins/native` 里除 Goals 外找不到 Goals 的动作或能力 id |
| 首页与搜索、标签页与分屏、项目页渲染、新建项目与引导 | 未做，归 BL-585。项目页渲染器无条件画 Goals 舞台（`goalStage`、`goalDocument`），客户端的 `tab-workspace.ts`、`frame-container.ts`、`editing-graph.ts`、`global-search.ts`、`placement.ts`、`project-home.ts` 里有 `"goals"` 的特判 |
| MCP 与命令行的 goal 工具、`goal-advance` Skill | 未做，归 BL-585：`apps/mcp/src/goal-tools.ts` 的 v1 工具是固定列表，要用真实 MCP 会话核「没有 Goals 时的答复」 |
| Feed、成果库等挂 Goal 的地方 | 未做，归 BL-585：已有记录的只读与不丢要逐处核 |

### 3.5 默认连线要同意（PG-005）

`bindDeclaredDefaults` 的判断从 `shipsWithHost(target)` 和 `shipsWithHost(source)` 改成：

1. 目标插件在运行，来源插件在运行，输出与输入的类型相同（现有检查，不变）。
2. 账本里有一行**有效**的 `default_wiring` 同意，其 `subject` 对得上这条连线，并且**来源插件当前的发布者签名等于同意记录里的**。
3. 人已经选过的端口、已经选过的输入组不动（现有规则，不变）。

绑定仍走同一个 `wiring.bind`，`origin: "default"`。同意在**安装预览**里一次给出，对整个 Home 生效；项目里启用插件时不再重复弹窗，同意的清单在 `plugin-settings-catalog`（#1098）里的插件详情页常驻可看、可撤。

### 3.6 提供方身份与 id 前缀（BL-506）

- 动作提供方 id 的规则已经有了（`specs/action-architecture/spec.md` §3、`tooling/gates/README.md` 动作合同快照：随宿主发布的用 `plugin_id`，其余用 `plugin-install-<sha256(plugin_id, publisher.signature) 前 32 位>`）。本片只把「随宿主发布」改成「等级是 `host`」，其余不动。
- **标签冒充指纹**：`unsigned` 的 `publisher.signature` 是作者自己写的字符串。它若写成 `ed25519:sha256:…` 的形状，就能和某个已固定发布者的指纹重合，拿到同一个提供方 id。所以安装时：等级不是 `pinned` 的，`publisher.signature` 一律不许是 `ed25519:sha256:` 开头（`plugin.signer_mismatch`）（S-68）。
- **id 互为前缀（BL-506）**：同一个 Home 里，两个不同发布者的 `plugin_id` 不许按点分段互为前缀（`io.a.b` 与 `io.a.b.c` 来自两个发布者时拒绝安装后装的那个，`plugin.id_namespace_conflict`）；同一发布者之间允许。理由：日志与事件的命名空间按 `plugin_id` 前缀划分，前缀归属必须有主。BL-506 原话的上下文（命名空间的哪几处按前缀匹配）实现片开工时再核一遍（S-68）。

### 3.7 版本跟随（PG-016）

`recordToFollow` / `followBundledBuild` 保留，条件从 `bundled` 改成 `trust.level === "host"`。权限的处理不变（`bundledGrants`）。`pinned`、`unsigned` 不跟随。PG-016 要求的文档（POLICY 与 `privileges.md` 里写明「版本跟随算安装信任」）在实现片一并改，不在本片。

### 3.8 与相邻条目的衔接

| 条目 | 衔接 |
| --- | --- |
| PG-002 可选权限开关（连 BL-353、BL-362） | 开关的界面在 #1098 的插件详情页；它读写的授权与本片同一份。安装预览里的平台权限说明文字（BL-353）和随激活作业（BL-362）与同意清单在同一页呈现。本片不做界面，只定数据 |
| PG-013 隐藏后动作仍可调 | 与同意无关；`plugin_disabled` 的判断在 `project-action-availability.ts`。本片只保证「常开插件不能隐藏」的判断读 §3.4 的名单 |
| PG-015 S-32 去掉「内置在前」 | 无依赖。对象种类的配额按 `plugin_id` 排序，不再看等级 |
| PG-049 本机目录读取 | 复用 §3.3 的账本（`kind: "local_directory"`，`subject` 是目录的规范化路径）。服务本身的设计由 PG-049 那一片出，不在这里 |

## 4. 合同改动（现在不留兼容期，同一个 PR 改完所有消费者）

| # | 改什么 | 前 → 后 | 版本与快照 |
| --- | --- | --- | --- |
| C1 | `PluginRuntime.install` 的输入 | `bundled?: boolean` → `trust: PluginTrust`（`{ level: "host" }`、`{ level: "pinned", publisher_key_id }`、`{ level: "unsigned" }`），外加 `consents?: PluginConsentGrant[]`；`execution` 必须与等级一致（`host` ↔ `"host"`，其余 ↔ `"sandbox"`），不一致 `plugin.state_invalid` | `packages/plugin-runtime` 的公开签名；`pnpm api:update` |
| C2 | `PluginInstanceRecord` | 新增 `publisher_trust: "host" \| "pinned" \| "unsigned"`（宿主证据，不读 Manifest）；`execution` 保留 | contracts `platform/plugin` 快照；Runtime 库基线升版本（§6） |
| C3 | `validateInstalledManifest` | `(manifest, bundled)` → `(manifest)`；`always_on` 不再在这里拒，改由安装时的同意检查（`plugin.consent_required`） | 不对外 |
| C4 | 新合同子路径 `platform/plugin-trust` | `PluginTrustLevel`、`PluginInstallPreview`、`PluginDeclarationNeedingConsent`、`PluginConsentRecord`、`PluginConsentGrant`、`PluginPublisherPin` | 新增一个 contracts 子路径快照 |
| C5 | 错误码 | `plugin.consent_required`、`plugin.consent_revoked`、`plugin.publisher_untrusted`、`plugin.publisher_revoked`、`plugin.id_namespace_conflict` 加进 `plugin-errors.ts`（写法同现有 `defineErrorCodes("plugin", …)`） | contracts 快照 |
| C6 | 宿主登记的用户动作（不是 Manifest 动作） | 新增六个，只给人：`plugins.install.preview@1`、`plugins.install.confirm@1`、`plugins.consents.list@1`、`plugins.consents.revoke@1`、`plugins.publishers.list@1`、`plugins.publishers.revoke@1`（名字最终以 `host-actions.tsv` 现有命名习惯为准，实现片定）。受众只有 `user`，处理器要 `caller.user_action`（S-58），模型、MCP、工作流、插件调不到（S-17） | `host-actions.tsv`；`pnpm actions:update` |
| C7 | `ProjectPluginCatalog` | `isAlwaysOn?(id)` → `alwaysOn(): readonly ProjectPluginId[]`；`register` 不再写死 `"goals"` | contracts `modules/projects` 快照 |
| C8 | Goals 的 Manifest | 加 `always_on: true` | 动作合同快照不变（只是 Manifest 字段） |
| C9 | `PluginPackageBundle` | 加 `publisher_key: { algorithm: "ed25519"; spki_base64: string } \| null`（`signature` 为 null 时必须为 null）；`parsePluginPackage` 与 `tooling/plugin-cli` 的 `pack`/`sign` 同步 | contracts 快照；`payload.schema_version` 不变（签名字节只覆盖 payload） |
| C10 | `PluginPortBinding` 的 `origin: "default"` | 不变；新增读取「这条连线的同意是哪一行」的投影，用于撤回时只解开对应的默认绑定 | 随 `wiring` 合同 |

SDK（`packages/plugin-sdk`）的公开 API 不变：Manifest 字段没有增减，`always_on` 与 `default_source` 的解析不动。外部插件作者的写法不变，变的是装的时候人会被问。

对调用方的影响：工作流步骤与绑定、MCP 工具名都没有现有引用；`skills/molis-plugin-dev` 要加一节「装的时候用户会被问哪些声明」，`docs/system/THIRD-PARTY-PLUGINS.md` 与 POLICY 第 7.8 节同步（实现片）。

## 5. 信任边界与安全不变量

### 5.1 S-34 改写、S-15 补充

- **S-34（改）**：常开插件（`always_on: true`）是否生效，看安装记录里有没有一行有效同意，不看安装来源；`host` 等级由宿主代为同意，同意不分等级都可撤（用户 2026-10-24）；其余等级未同意的，安装时那一项不生效（不是装不上，依据统筹 10-24 定的待定 1）。服务端拒绝卸载、停用、项目内移除常开插件。`tests/security-invariants-always-on.test.ts` 的三条断言按新语义重写（见 RAC-384～386）。
- **S-15（补）**：在 `bundled` 一段改成「`host` 等级」；其余内容不变。

### 5.2 新增

**S-67（暂定）安装信任与同意账本。**
1. 信任等级只由宿主给：`host` 来自启动名单里的对象身份，`pinned` 来自验得过的签名加已固定的发布者，Manifest、包里的任何字段、调用输入都不能自称等级。安装、升级、回滚、停用、卸载、同意、撤回、固定与撤销发布者都只接受带 `caller.user_action` 的人，模型、MCP、工作流、插件的调用一律拒（沿用动作网关现有的受众拒绝，不新造拒码）。
2. 需要同意的声明（`always_on`、默认连线、默认输入组）没有有效同意就不生效，没有任何别的来源（插件名、等级、目录条目）能代替；`host` 等级的同意是安装时代记的，同样是账上的一行。
3. 默认连线的同意带来源插件的发布者签名，运行时来源的签名对不上就不绑。
4. 撤回按撤权处理：在途调用在最后一次检查处被拒、不再写业务记录；常开与默认连线随之失效；发布者撤销后其所有安装停用且不能升级，数据保留。
5. `pinned` 等级每次安装、升级、回滚都验签；验不过 `plugin.signature_invalid`，指纹对不上 `plugin.signer_mismatch`，发布者没固定 `plugin.publisher_untrusted`，已撤销 `plugin.publisher_revoked`。没签名的包经 `plugin install` 一律 `plugin.signature_invalid`，不进 `unsigned` 等级。

**S-68（暂定）提供方身份不可冒充。**
1. 非 `pinned` 等级的 `publisher.signature` 不许是 `ed25519:sha256:` 形状。
2. 两个不同发布者的 `plugin_id` 不许按点分段互为前缀。
3. 动作提供方 id：`host` 等级用 `plugin_id`，其余用 `plugin-install-<hash>`；一个等级不是 `host` 的安装不能登记成 `plugin_id` 作提供方。
4. 宿主启动名单里全部的 `plugin_id`，连同它们点分段的前缀（名单里有 `io.molis.work.goals`，则 `io.molis.work` 与 `io.molis` 也算），不许由非 `host` 等级的安装使用（`plugin.id_namespace_conflict`）；这条与第 2 条是两件事：第 2 条管外部发布者之间，这条管外部与宿主之间。

每条都要有断言**拒绝本身**的测试（§8 逐条对应）；写测试时找不到拒绝，就是缺陷，先补最小的拒绝。

### 5.3 没有扩大的信任边界

- 没有新增「人以外的东西能同意」：`host_build` 的同意只对 `host` 等级，来源是对象身份，和今天 `bundled` 同一个信任根，只是现在落了账。
- 没有放宽沙箱：非 `host` 等级仍然只在沙箱里跑，宿主进程里不执行第三方代码。
- 没有新增能读的数据：同意账本只存声明与时间，不存插件内容。

## 6. 存量

合同只认现行取值，存量由维护改成现行形状，读取时不兜底。

| 对象 | 现状 | 处理 |
| --- | --- | --- |
| 开发用的 Home | 随便 | 重建（Runtime 库基线升版本，旧库被 `applySqliteBaseline` 拒绝），一次性脚本放会话临时目录，不进仓库 |
| `plugin_runtime_installs`（项目库与 Home 库里的安装记录） | 没有 `publisher_trust` | 基线加列。维护步骤的映射：`execution = "host"` → `host`，`execution = "sandbox"` → `unsigned`（现有所有沙箱安装都是创作台产物） |
| 同意账本 | 不存在 | 内置插件：宿主启动时按当前 Manifest 的声明补代为同意的行（幂等，按 `manifest_digest` 区分）；创作台产物没有可同意的声明，不补 |
| 发布者固定表 | 不存在 | 空表。没有任何已装的外部签名插件，所以没有要迁的固定项 |
| 常开名单 | 内置目录里的 Shelf；Goals 在 `project_plugins` 表里有每个项目的一行 | Goals 的行保留无害（派生关系取并集），不做维护 |

**真实 Home 的维护步骤（待用户定时段）**：真实 Home 的任何改动先整份备份、在拷贝上演练、用户当次同意。本片要做的有两件：Runtime 库基线升版本并为现有安装记录填 `publisher_trust`；为内置插件补同意行。两件都可以由「升级基线 + 启动时幂等补账」完成，不需要手改数据，但按口径仍列为维护步骤，时段与 W5-17 的真实 Home 维护同一次（统筹排）。在用户定时段之前，实现片只在隔离 Home 里验证。

## 7. 实现拆片

每片一个 PR，实现等 #1098 合入；表里「前置」是片与片之间的依赖。

| 片 | 内容 | 前置 | 备注 |
| --- | --- | --- | --- |
| T1 | 合同与规则：C1～C5、C9、`trust-rules.ts`、Runtime 仓库的新表与 `publisher_trust` 列、基线升版本、S-34 改写与 `tests/security-invariants-always-on.test.ts` 重写；监督器与安装改传 `trust`，内置插件体验不变 | #1098 | `pnpm api:update`；一片内改完所有消费者（`bundled` 的全部调用点：`home-plugins.ts`、`project-plugins.ts`、`plugin-entry-identity.ts`、`plugin-scope-entries.ts` 等） |
| T2 | 安装服务与动作：C6、预览与确认、发布者固定、`verifyPluginPackage` 接上、`plugin-cli install` 转发、S-67 的 1 与 5 | T1 | 沙箱形态映射不了的拒绝；`pnpm actions:update` |
| T3 | 常开从记录生成：C7、C8、Goals 的 `always_on`、去掉写死的 `"goals"`、卸载与停用入口的拒绝（V-01 复现） | T1 | 与 PG-013 的可用性判断同一处，先看在途 PR |
| T4 | 默认连线要同意：`bindDeclaredDefaults` 改读账本、来源签名核对、C10、S-67 的 2 与 3 | T1，T2（预览里要有同意项） | |
| T5 | 撤回与世代：`consents.revoke`、发布者撤销、并入授权世代检查、S-67 的 4 | T1，T3，T4 | 和 S-18 的测试放一起 |
| T6 | 提供方身份：S-68 三条、BL-506 前缀检查 | T1 | |
| T7 | 界面：安装预览、插件详情页里的同意清单与撤回、BL-353 与 BL-362 的文字 | T2，T5，#1098 | PG-002 的开关同在这一页，归 PG-002 那条线 |
| T8 | 文档与手册：POLICY 7.8、THIRD-PARTY-PLUGINS、`skills/molis-plugin-dev`、PG-016 的版本跟随写明 | T1 | |


**T3 落地时的口径（2026-10-25）：**

- 同意账本里的 `always_on` 行就是「声明了且同意了」：只有声明过这个字段的 Manifest 才能被记下这种同意，所以名单不必再读 Manifest。
- 项目级的内置插件（Goals）的安装记录在各项目库里，Home 级的目录看不到；宿主的构建担保它被装，记录只在 Home 级的内置插件（Shelf）上能看到，看得到就看它的状态。宿主在第一次被问时代为同意，这样没启动过 Host 的 Home（只开目录）和启动过的答案一样。
- 非目录的常开插件（外部装的）今天没有项目成员关系可派生：成员关系只定义在内置目录的插件上。它们的卸载与停用拒绝照样成立；让它们进项目的成员列表随 T2 的外部插件进项目一起做。
- 个人插件不入 `listPlugins`（见 §3.4），这是对本稿原文「存的成员 ∪ 常开名单」的收窄，理由是不改变设置页和各处列表里个人插件现在的样子。

**T1 落地时的两处口径（2026-10-24）：**

- C1「非 `host` 等级只在沙箱」在 T1 只强制一个方向：`host` 配沙箱定义被拒（`plugin.grant_denied`）。另一个方向（非 `host` 等级不得在宿主进程里跑）留给 T2：开发目录和宿主的测试夹具今天仍在宿主进程里跑，T1 给它们 `unsigned`，不改它们的执行方式。Feed 的官方集成随宿主构建一起发布、由宿主构建目录登记，T1 给 `host`；以后若独立发布，再按它自己的签名定等级。RAC-383 里「映射不了沙箱形态的 Manifest 安装时拒绝」的那一半随 T2。
- 已装插件不能换信任等级（`plugin.definition_conflict`）；卸载后重装可以。存量记录按 `execution` 补等级的维护见 §6 与检查清单第 4 节。

### 7.1 #1250 本轮首评修复（2026-10-24，修复已实现）

本轮只处理固定 `d4dee51fa` 的首评 `6390022295`：移除 `tests/plugin-trust-rules.test.ts` 新增的双重断言，用 `Object.assign` 保留 Manifest 自称等级的真实额外字段和原拒绝断言；补包信封拒绝、T1 调用点、维护后真实临时 Host 启动的证据，并补齐 S-34 既有测试引用和同意跨库写入的说明。完成标准是本片修后必要定向及门禁通过、独立增量审验通过；不以作者原 334 项摘要代替本轮实跑，也不冒称整条 ac-trust 或实际合入完成。

- **RAC-382-T1**：`tests/plugin-package.test.ts` 通过公开函数验证未签名包带公钥、签名包缺少或带非法公钥均准确拒为 `plugin.package_invalid`，随包公钥指纹不符和 signer 身份与公钥不符准确拒为 `plugin.signer_mismatch`；保留真实 Ed25519 的合法签名、解析和验签对照。这是 T1 的 C9 信封检查，完整 RAC-382 的安装、升级、回滚验签仍随 T2。
- **RAC-381-T1**：`tests/plugin-install-trust-call-sites.test.ts` 找到生产代码中实际解析为 `PluginRuntime.install` 的调用，检查传入类型有必填、非空的 `trust` 且没有 `bundled`；不写固定调用数或调用点白名单。它与 `tests/plugin-trust-rules.test.ts` 的 Runtime 缺信任拒绝、`tests/plugin-runtime-maintenance-v3.test.ts` 的真实 Host 启动一起证明 T1，不新增全局门禁。§8 RAC-381 的完整目标保留：所有来源经 `resolvePluginTrust` 的安装服务、预览和确认属于 T2，本轮不以编号或文字改成已经实现。
- **RAC-397-HOST**：维护后的隔离 Home 经真实 `MolisWorkLocalHost` 启动后，Shelf 的 `always_on` 同意实际落账，发布者、Manifest 与 `host_build` 来源正确；关闭后再次启动不重复，持久撤回后再次启动不复活。不因此声明 T3 的常开名单与移除限制、T5 的撤回入口已实现。
- **RAC-398-T1**：S-34 仅补现有 `plugin.state_invalid`、`plugin.grant_denied`、`plugin.definition_conflict` 的文件与真实测试名引用，不新增 S 号；在 `recordInstallConsents` 旁说明安装记录与 Home 同意可能跨库部分成功、账本失败原样传播及下一次 replay 补账，失败策略与权限不变。

官方集成的等级已按 [Claude 统筹裁定 6392849194](https://github.com/molis-ai/molis-work/pull/1250#issuecomment-6392849194) 统一：仅随宿主构建发布、由宿主构建目录登记的官方集成是 `host`，保留 `official-integrations.ts` 的现有实现，修正 `trust-rules.ts` 注释和本稿口径；独立发布后按自身签名定等级，不将外部定义一律视为 `host`，不提前实现 T2。项目库 9→10、与 #1245 的真实 owner 结构/四份 SQL 组合仍由唯一 carrier 处理，本轮不改版本或维护 SQL；#1246 的重装先清文件后清 KV、清完才发布新安装保持原样。

六项修复已在独立树整体构建后通过精确定向 5 文件 / 20 用例、Plugin Runtime README 必跑 20 文件及 Home 相关 6 文件与包清单 1 文件 / 596 用例，合计 32 文件 / 616 用例首次通过；包边界、版本核对、修正文档列后的健康门禁和 secret 扫描通过，原始初败与通过日志保留。本次等级裁定只改注释与文档，复用上述有效运行证据；最终交付核固定差异、健康门禁与 secret 扫描，并交独立增量审验。共享核心的 full 与维护组合仍由唯一 Claude 批次处理，未操作真实 Home。

## 8. 验收

| 编号 | 内容 | 证据（测试文件待实现片定，名字里写编号） |
| --- | --- | --- |
| RAC-380 | 信任等级只由宿主给：Manifest、包字段、调用输入自称等级都无效；`host` 只认启动名单的对象 | `trust-rules` 单元测试 |
| RAC-381 | 一条安装路：宿主构建、签名包、开发目录、创作台产物都经 `resolvePluginTrust`，源码里不再有按 `bundled` 分叉的安装逻辑 | 门禁式测试：`install` 调用点都带 `trust` |
| RAC-382 | `pinned` 每次安装、升级、回滚都验签；验不过、指纹对不上、发布者没固定、已撤销，各自拒绝并带对应码（S-67.5） | `tests/plugin-package.test.ts` 扩展 |
| RAC-383 | 非 `host` 等级只在沙箱：`execution` 与等级不一致被拒；映射不了沙箱形态的 Manifest 安装时拒绝 | Runtime 单元测试 |
| RAC-384 | `unsigned` 声明 `always_on` 且没有同意：装得上、不生效（不在常开名单，可移除，依据统筹 10-24 定的待定 1）；有同意则生效（S-34 新语义） | 重写后的 `tests/security-invariants-always-on.test.ts` |
| RAC-385 | 同意不分等级都可撤（用户 2026-10-24）：`host` 等级的 `always_on` 默认同意、不弹窗；撤回后它不再出现在常开名单里，能被隐藏、移除；`pinned` 同意后可撤 | 同上 |
| RAC-400 | Goals 不在项目里（常开被撤回后移除）时，首页、建项目与引导、Dock、搜索、项目页渲染、标签页、MCP/命令行的 goal 工具、Feed/成果库挂 Goal 的入口、Inbox/Sessions 等照常工作，不报错、不出空白；清单见 §3.4.1，T1/T3 逐处补用例 | 新增非浏览器用例加两个浏览器冒烟（少量） |
| RAC-386 | 常开从记录生成：外部常开插件对已有项目立刻生效；撤回后立刻不强制；服务端拒绝卸载、停用、移除（V-01）；Goals 与 Shelf 常开仍然成立，建项目不再写死 `"goals"` | `tests/project-plugins.test.ts` 扩展 |
| RAC-387 | 没签名的包经 `plugin install` 被拒（`plugin.signature_invalid`），不会得到 `unsigned` 等级；`unsigned` 只有开发目录和创作台产物两个来源 | `tests/plugin-package.test.ts` 扩展 |
| RAC-388 | 默认连线：`unsigned`/`pinned` 声明的 `default_source` 没有同意不绑，有同意才绑；`host` 等级的行为与今天一致 | `tests/plugin-default-bindings.test.ts` 扩展 |
| RAC-389 | 默认连线的来源签名对不上同意记录就不绑（防抢注，S-67.3） | 同上 |
| RAC-390 | 撤回一项默认连线只解开对应的 `origin: "default"` 绑定，人手选的不动，且不再自动绑 | 同上 |
| RAC-391 | 撤回按撤权处理：一个 `concurrent` 动作在 `beforeEffect()` 前被撤回，不写任何业务记录；处理器开始前被撤回，只留「未执行」诊断行（S-67.4） | 并入 S-18 的测试文件 |
| RAC-392 | 撤销发布者：其所有安装停用、不能升级、数据保留 | Runtime 集成测试 |
| RAC-393 | 安装、同意、撤回、固定的动作只接受带 `caller.user_action` 的人；模型、MCP、工作流、插件调用被拒（S-67.1） | `tests/security-invariants-*.test.ts` 新增一份 |
| RAC-394 | 非 `pinned` 的 `publisher.signature` 不许是 `ed25519:sha256:` 形状（S-68.1） | 同上 |
| RAC-395 | 两个不同发布者的 `plugin_id` 互为前缀被拒，同发布者允许（S-68.2，BL-506） | 同上 |
| RAC-396 | 提供方 id：`host` 用 `plugin_id`，其余用 `plugin-install-…`；动作合同快照里内置插件的 `registered_provider` 不变（S-68.3） | `tests/action-contract-snapshot.test.ts` |
| RAC-397 | 存量：旧基线的库被拒绝；新基线下 `publisher_trust` 与同意行由启动幂等补齐；在隔离 Home 演练维护步骤 | 隔离 Home 的演练记录 |
| RAC-398 | 公开 API 与动作合同快照：只有 §4 列出的变化，PR 里逐项写对调用方的影响；文档一致：S-15、S-34、S-67、S-68 与 `SECURITY-INVARIANTS.md` 的测试列、POLICY 7.8、THIRD-PARTY-PLUGINS、手册 | `pnpm api:update`、`pnpm actions:update` 的 diff；`pnpm health:check` 的文档引用检查 |
| RAC-399 | 宿主启动名单里的 `plugin_id` 及其点分段前缀，非 `host` 等级的安装使用时被拒（S-68.4） | 同 RAC-394 的测试文件 |

## 9. 待办

BL-556～562 写在 `specs/BACKLOG.md`（T2～T8 各一行）；T1 的 BL-555 和 T1 开工前核 Home 库账本的 BL-563（结论在 §10 待定 4）都已做完，行已删；BL-564 空着。

## 10. 待定

七项都已定：第 2 项用户 2026-10-24 定，其余统筹 10-24 定。

1. **拒绝单项声明还装不装。统筹 10-24 定：装，那一项不生效。** S-34 与 RAC-384 保留这个写法。
2. **`host` 等级的 `always_on` 可不可撤。用户 2026-10-24 定：所有等级的常开同意都可撤**，不设「内置不可撤」。S-34 与 RAC-385 按此写；连带要核的 Goals 缺席场景见 §3.4.1。
3. **内置插件的 `publisher.signature` 仍是标签。统筹 10-24 定：内置仍靠启动名单的对象身份，不走真签名。**
4. **外部插件的安装范围。统筹 10-24 定：本片不动。** 同意与发布者固定放在 Home 级，每个项目的安装记录仍各自一份。**BL-563 核完（T1，2026-10-24）：** PG-022 P1b 的账本 `plugin-libraries/plugin-libraries.db` 的表 `plugin_home_libraries` 只有 `plugin_id`、`publisher_signature`、`store_name`、`version`、`schema_digest`、`created_at`，记的是装进来的插件的 Home **库**（存储），不是安装记录，也没有信任或同意的列；所以同意账本 `plugin_consents` 与 `plugin_publishers` **独立建表**，放在 Home Runtime 库（`plugin-runtime/plugin-runtime.db`，基线 2 → 3）里，与那份账本互不引用。项目平台经 `PluginPlatformHome.consents` 读写同一份，Home Runtime 直接用自己打开的库。
5. **包信封带公钥（C9）。统筹 10-24 定：带公钥。** 已有的签名包要重打，现在没有外部在用的包。
6. **提供方 id 对 `pinned` 保持 `plugin-install-<hash>`。统筹 10-24 定。** 固定了提供方的引用在重装后显式失效。
7. **BL-506 的前缀规则落在哪几处命名空间。统筹 10-24 定：T6 开工时核。** 核完若某处是精确匹配，规则可以放宽（S-68.4 的宿主名单规则同理）。

## 11. 防腐复查

- 插件不 import 另一个插件的实现：本片只动平台层（Plugin Runtime、宿主装配、contracts、projects 模块）；Goals 只加一个 Manifest 字段。
- 能力注册一次：六个新动作注册为宿主动作，进动作合同快照的 `host-actions.tsv`，不另写名单。
- 表的主人：`plugin_publishers`、`plugin_consents` 由 Plugin Runtime 建、读写；`modules/projects` 经 `alwaysOn()` 读，不直接写 SQL。
- 错误码按 `defineErrorCodes("plugin", …)` 写，不新写 Error 子类。
- 无兼容层：`bundled` 参数删除，不留别名；旧库被基线拒绝。
- 没有巨大单元：新文件按职责拆（trust-rules、安装服务、同意仓库各一份）。
- 本稿只改文档。
