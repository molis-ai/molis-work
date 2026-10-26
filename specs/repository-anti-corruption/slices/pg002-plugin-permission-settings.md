# PG-002 插件权限设置与改授权的动作（ac-shell，设计稿）

状态：**已实现**（分支 `claude/ac-shell-pg002`，叠在 `origin/batch/1025-41` 上，未开 PR），2026-10-26。§7 的 6 项裁定统筹已给（见 §7，已按裁定改了 §2、§3、§6）。实现叠在 ac-trust 的 T7（batch-41，项目设置的「插件」页，S-85）上。**PG-002 行要等 BL-700（Home 级插件的开关页，§8a）合入才标已做。**PG-003（授权与外部插件同一套、可选权限能单独关，#741）已做，本稿补它欠下的两样：**本人关开的动作**和**开关的界面**。

验收编号：RAC-940～959（§6）。BL：BL-700～709（BL-700 = Home 级插件的开关页，owner 是 ac-shell，已实现，§8a）。安全不变量：**S-93**。

## 1. 现状（事实，按 `origin/main` 核）

- 授权是安装记录上的一份清单：`PluginInstanceRecord.grants`，每个安装（项目里的一份、Home 级插件的一份）各一份；上限是 Manifest 的 `permissions`，`normalizeGrants` 超出上限就 `plugin.grant_denied`；必需权限（`required: true`）缺一个就起不来（`assertStartable`）。
- 可选权限怎么留下，规则已经统一（PG-003）：`host` 等级全新安装全开，之后**人关掉的一直关着**（启动、跟宿主新版本都不翻回，`hostBuildGrants`）；其它等级是人确认的那些（`defaultGrants` 重放已有授权）。
- `PluginRuntime.grant(installId, permissions)` 已经在（`packages/plugin-runtime/src/index.ts`）：同步、**运行中的拒绝**（「运行中的 Plugin 必须先停止，不能静默改变 grant」）、没有调用者门槛。除了 `official-integrations.ts` 的安装期用法和测试，没有任何人调它：**没有动作，没有入口，没有界面**（PG-002 原文）。`docs/releases/POLICY.md` 第 7.8 节「授权」一条已经写着：可选的都能关（Runtime 的 `runtime.grant`，**插件先停**），关了只是用到它的动作不可用（`actions.plugin_permission`）、插件照常运行，「开关界面是下一片（PG-002）」。本稿的停—改—起就是把「插件先停」做成一个原子的方法。
- 撤权的机器是现成的：每次激活拿一份**冻结的授权快照**和一个撤销格（`createActivationContext`）；`PluginRuntime.stop()` 先 `revokeContext`（在排队**之前**就收回，不等锁），旧激活的服务从此拒；各平台服务每次写之前重读安装记录（`installation_generation`、`state === "running"`、`grants.includes(…)`，见 `plugin-agent-service.ts`、`plugin-background-service.ts`、`plugin-scheduler-owner.ts` 等）；动作可用性每次调用读 `state.record().grants`（`action-provider.ts` 的 `grantAvailability`）。
- 「只有本人」的做法也是现成的（T5/T5b，S-77、S-87）：动作受众只有 `user`，处理器再核**宿主设置入口给的凭据**（`assertPluginConsentSettingsEntry`），插件页的 `user_action`、`actions:delegate`、手写的都不算；HTTP 接缝是 `/api/settings/plugin-consents/*`。
- T7 的项目设置「插件」页（batch-41）列出已装插件和它们的权限（`PluginPermissionView`：权限名、必需与否、插件的理由、平台的说明），**没有「现在开着没有」**，也没有开关。

## 2. 设计

**一句话**：Runtime 加一个「换一项可选权限并让它立即生效」的方法；一个只给本人的动作经宿主设置入口调它；插件页的每项可选权限变成开关。不新建表、不新建撤销服务，收回在途调用走的还是现有的停止与激活快照。

### 2.1 开关管什么

- 只有 Manifest 里 `required: false` 的权限出开关。必需权限列出来、标「必需」、没有开关（要它不用，就停用或卸载这个插件）。
- 作用于**一个安装**（这个项目里的这个插件；Home 级插件是它那一份）。这与现行安装范围一致（统筹 10-24 定：安装范围本片不动，同意与发布者固定才放 Home 级）。「同一个插件所有项目联动」不做（§7 第 4 项）。
- 沙箱包装进来的插件，Manifest 是固定的单一形状，权限都是必需的，页面上没有可开关的；它们的权限是安装时本人批准的沙箱效果，不是 Manifest 的可选权限，**不在本片**。

### 2.2 动作 `plugins.permissions.set@1`

- 放在现有的 `plugin-install` 提供方里（`apps/local-host/src/plugin-install-actions.ts`，不新增 `registerProvider`），项目范围，受众只有 `["user"]`，权限 `plugin-install:write`。
- 输入 `{ install_id, permission, granted }`：**一次只换一项**。不收「整份清单」，因为页面拿着的清单可能是旧的，整份替换会把别处刚改的悄悄改回去；一项一换也让「谁在什么时候开了什么」不含糊。
- 输出 `{ install_id, permissions: [{ permission, required, reason, meaning, granted }], changed }`（与 `plugins.installed.list@1` 的每项权限同一形状，页面直接换掉）；设成已经是的值，`changed: false`，什么都不写。
- 目标**不由输入定**：项目取自调用的可信上下文（`caller.project_id`），处理器经项目的 Runtime 找 `install_id`，不是这个项目里的安装就 `plugin.definition_missing`，不能借这个项目的入口去动别的项目的安装（§3.2）。
- 处理器第一行就是入口凭据检查，然后才碰 Runtime；`await caller.beforeEffect()` 之后才写。

### 2.3 入口

`POST /projects/<id>/api/plugin-trust/permissions/set`（项目设置页自己的路由，`plugin-trust-http.ts`，不是任何插件页的路由）：在常驻服务的本机守卫后面（控制令牌、Origin、一次性键，S-03/S-06/S-07），项目取自路径、人由入口自己盖章，**请求体里写的项目、人、`user_action` 一律不读**（schema 拒，`actions.input_invalid`）；入口先拒 `pluginPageRequest`（插件页不能代本人改授权），再给处理器一份冻结的设置入口凭据（`withPluginPermissionSettingsEntry`），进程内登记、请求结束就撤下。凭据与 Home 同意入口（S-77）的是**两份各自的登记**，互不通用。Home 级插件的开关入口是 BL-700。

### 2.4 收窄：立即生效，怎么做

新增 `PluginRuntime.regrant(installId, permission, granted)`（async）：

1. 查：安装存在且 `assertMutable`；权限在 Manifest 上限内；要关的不能是必需的（`plugin.grant_denied`）。设成原值直接回执 `replayed`。
2. **收窄时先收回**：安装有活着的激活，就**立刻** `revokeContext`（同 `stop()` 的做法，不等锁）。从这一刻起，旧激活的服务全拒，在途的调用走到下一次副作用（`beforeEffect`、任何平台服务的写）被拒，**不再写任何业务记录**，只在调用记录里留「未执行」诊断行（硬约束，S-18）。
3. 排进这个安装的锁，同一段里：停（`preserve_enabled`，不改成 `disabled`）→ 存新的授权 → 起（新激活拿新的授权快照）。放宽也走这条，只是第 2 步不需要：旧激活不拿新权限，新的在重启后拿到。没在运行的安装（停用、未启动）只存授权，不起。
4. **失败往安全的一边**：收窄之后重启失败，授权已经存了的收窄**不回滚**，安装记 `crashed` 和错误码，动作把错误抛给页面，人用现有的恢复；放宽之后重启失败，授权存着，同样记 `crashed`，不执行。
5. `PluginRuntime.grant` 留着（安装期与测试在用），文档里写明：安装之后人改授权只经 `regrant`。

为什么是重启，不是活着改：激活的冻结快照是 S-18 的设计（「重装后的新世代不能复活旧句柄或继承可选授权」），`grant()` 拒绝运行中的正是为了不出现「插件手里的快照和记录对不上」。重启复用已有的撤销，不另造一套（统筹的要求）；代价是这个安装的**其他**在途调用也在下一次副作用被拒，而不只是用到那一项权限的——可以接受，因为权限变更本来就是人要的一次打断（§7 第 2 项请统筹确认）。

后台作业与调度：作业声明的权限被关掉，它在触发时被拒（`plugin-background-service.ts`、`plugin-scheduler-owner.ts` 现有检查），不删作业，权限再开就自然恢复；页面把这样的作业标「已暂停：缺少某某授权」。

### 2.5 放宽是不是扩大安全边界

结论：**不扩大**，但它是个应该只有本人能做、并且看得清的动作，所以下面几条都是硬的。

- 上限不变：放宽只能到 Manifest 声明的、也就是发布者签了名（`host` 等级是宿主构建）的范围，超出一个字都是 `plugin.grant_denied`；插件包一个字节不变，要它多要权限只有升级，升级走现行的「权限不扩」规则和重新确认。
- 它等同于「这个安装一开始就开着」：`host` 等级全新安装本来就是可选权限全开（PG-003），放宽只是回到那个状态；已确认的 `pinned` 在安装预览里看过每一项的理由和平台的说明，开关旁边显示同样两句话。
- 只有人：受众 `user` 加设置入口凭据（S-77 同款）。插件、Agent、MCP、工作流既发现不了也调不了，**持有 `actions:delegate` 的插件也不能给自己放宽**（委托出去的调用没有设置入口凭据）。
- 同意账本照旧：`plugin_consents`（常开、默认连线、默认输入组）是另一回事，不变，也不为授权开关新写一行；授权的主人仍是安装记录（Plugin Runtime），没有第二个地方记「开了什么」。
- 不留历史表：记录上的 `updated_at` 加回执，不新建 `plugin_grant_changes`（§7 第 5 项）。

### 2.6 界面

项目设置「插件」页（T7）里，每个插件行展开：必需的权限（只读，「必需」）、可选的权限（开关）；每项都写插件自己的理由和平台的说明（`platformPermissionMeaning` 同一份，不另写）；最宽的几项旁边有平台的原话，放宽前再确认一次（§7 第 3 项）。后台作业列出它们需要的权限和是否暂停。点开关：调接缝、成功就按返回的 `permissions` 更新，失败（含重启失败）原地显示错误并恢复开关；不乐观更新。**放宽 `actions:delegate`、`network:*`、`secret:*`、`model:invoke` 这四类前先弹一次确认**（复用 T7 的同一个 `ask` 对话框，写出平台的原话，和安装预览同一套文案，只在 UI 层，动作不变），其余权限单击生效；关掉不需要确认。`PluginPermissionView` 加 `granted: boolean`（合同的增量字段，`plugins.installed.list@1` 的输出也加，快照 `pnpm api:update` / `pnpm actions:update`）。文字走 `L()` 和翻译词典；页面脚本与样式的增长在 PR 里写明字节数，涨超 10 KB 或新增资源先问。

### 2.7 与相邻条目

| 条目 | 关系 |
| --- | --- |
| PG-003（已做） | 授权规则不变；本稿只加「人改」的入口 |
| PG-049（本机目录读取） | `local_directory` 是同意账本的一种，不在这个开关里 |
| PG-016（版本跟随） | 跟宿主新版本时，人关掉的仍关着、新增的可选权限默认开（`hostBuildGrants`），页面不需要额外处理 |
| BL-587（默认组撤回） | 不相关 |
| T5b（发布者撤销） | 撤销后插件整个停用，和单项权限开关并列；两者都落在「下一次副作用被拒」的同一道检查上 |

## 3. 信任边界与安全不变量

### 3.1 新增（S-93）

**改授权只由本人做，收窄立即生效，放宽不超过 Manifest。**
1. `plugins.permissions.set@1` 的受众只有 `user`；agent、MCP、工作流、插件看不到也调不到（`actions.forbidden` 或不在目录里）；处理器还要设置入口凭据，没有就 `actions.forbidden`，在碰 Runtime 之前拒。
2. 目标由可信上下文定：项目取自入口，`install_id` 必须属于那个 Runtime；输入不能指名别的项目，也不能自称人。
3. 只能动 Manifest 里的可选权限：必需的关不掉、没声明的开不了，都是 `plugin.grant_denied`，授权不变。
4. 收窄在调用处立即收回：旧激活的服务全拒，在途调用在下一次副作用被拒、不写业务记录（S-18 的同一条）；重启失败不回滚收窄。
5. 放宽只在新激活里生效，不改旧激活的快照；插件自己不能放宽。
6. 关掉的可选权限在重启、宿主跟新版本后仍然关着（PG-003 已有，本稿为人用动作关的路径再证一次）。

### 3.2 没有扩大的信任边界

- 没有「人以外的东西能改授权」：入口凭据同 S-77/S-87，不新造信任根。
- 没有放宽沙箱，没有新增能读的数据，不碰同意账本。
- 项目设置页的接缝不接收请求里写的项目或身份。

## 4. 合同与代码改动

- `packages/plugin-runtime`：`PluginRuntime.regrant`（`index.ts`，一个只转交的方法）、步骤在新文件 `regrant.ts`（`regrantInstall`，类已冻结，新增部分先写在新文件里，`HUGE-CLASS-MIGRATION.md`），`toggledGrants` 在 `install-rules.ts`；README「开发要求」加一条。类因此仍多一个方法，`tooling/gates/giant-exceptions.json` 里登记了 class 与 file 两条，等 W5-10 拆分时随之删。
- `packages/contracts`：`PluginPermissionView.granted`（增量字段，`pnpm api:update`）。
- `apps/local-host`：动作与处理器在 `plugin-install-actions.ts`（同一个提供方，没有新增 `registerProvider`），`plugin-install-service.ts` 的 `setPermission`，凭据在 `plugin-consent-settings-entry.ts`（第二份登记 `permissionEntries`，没有复制机制），入口是 `plugin-trust-http.ts` 的 `permissions/set`，`project-plugin-ports.ts` 的 `regrantPluginInProject`，`plugin-installed-view.ts` 填 `granted`。
- `apps/workbench/src/settings-plugins.ts`：开关与作业的暂停标记。
- 文档：`docs/system/SECURITY-INVARIANTS.md`（新行，S-15 补一句指向）、`docs/releases/POLICY.md` 第 7.8 节、`docs/system/THIRD-PARTY-PLUGINS.md`、`skills/molis-plugin-dev/elements.md`（可选权限「人能在设置里关」）。
- 没有存量迁移：不新建表，旧的授权清单原样。

## 5. 实现拆片（一个分支、三个提交，整个功能做完再开 PR）

1. Runtime：`regrant` 与它的测试（RAC-940～945、954）。
2. 动作、入口、合同的 `granted`、动作与 API 快照（RAC-946～950、953、955）。
3. 页面与文档（RAC-951、952、956）。

只跑改到的文件，`--jobs 1` 走机器槽；浏览器用例交 CI；共享核心（contracts、plugin-runtime）的改动按共享核心由统筹跑全量。

## 6. 验收（草稿，RAC-940～959）

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-940 | 运行中的插件关掉一项可选权限：授权清单不再有它，新激活的快照没有它，安装还是同一个（`install_id`、`installation_generation`、私有数据都不变），状态回到 `running` | `tests/security-invariants-plugin-regrant.test.ts` |
| RAC-941 | 关必需的、开或关没声明的，都是 `plugin.grant_denied`，授权不变，没有重启 | 同上 |
| RAC-942 | 收窄立即收回：一个在途的调用卡在处理器里，关掉它下一步要用的权限，它的下一次写被拒，没有业务记录，只留一行「未执行」诊断 | 同上，用真实的存储与背景服务 |
| RAC-943 | 收窄后重启失败：收窄保留，安装 `crashed` 带错误码，动作把错误抛出，不回滚 | 同上 |
| RAC-944 | 放宽到上限以内：新激活拿到、依赖它的动作变成可用、后台作业到下次触发就跑；放宽超过上限被拒 | 同上 |
| RAC-945 | 经动作关掉的可选权限，在 Host 重启和跟宿主新版本之后仍然关着 | 同上、`tests/bundled-plugin-grants.test.ts` |
| RAC-946 | 动作受众只有 `user`：agent、MCP、工作流、插件四种调用者各自发现不了也调不了，Runtime 不动 | `tests/security-invariants-plugin-permissions.test.ts` |
| RAC-947 | 没有设置入口凭据的 user、仿造的 `user_action`、持有 `actions:delegate` 的插件自己，都是 `actions.forbidden`，在碰 Runtime 之前，授权不变 | 同上 |
| RAC-948 | 目标取自可信上下文：用这个项目的入口去动另一个项目的 `install_id` 被拒；请求体里写项目或身份被忽略 | 同上 |
| RAC-949 | `plugins.installed.list@1` 给每项权限的 `granted`，必需的为 `true`，和安装记录一致；开关之后概览读到新值 | `tests/security-invariants-plugin-permissions.test.ts`、`tests/security-invariants-plugin-permissions-http.test.ts` |
| RAC-950 | 接缝在控制令牌与 Origin 之后，只认 `POST` 和约定的三个字段，别的方法、多余字段被拒 | `tests/security-invariants-plugin-permissions-http.test.ts` |
| RAC-951 | 页面：必需项没有开关，可选项的开关调接缝、成功后按返回值更新、失败恢复并显示错误；放宽四类宽权限前先确认（确认在调用之前）；文字全部走翻译 | `tests/security-invariants-plugin-permissions-http.test.ts` 的页面脚本断言；翻译门禁 |
| RAC-952 | 依赖已关权限的后台作业在页面上标「已暂停」，权限再开后（重画）消失 | 同上 |
| RAC-953 | 设成原值：`changed: false`，不重启、不改 `updated_at` | `tests/security-invariants-plugin-regrant.test.ts` |
| RAC-954 | 同一安装上的 `regrant` 与停用、卸载、升级在安装锁上排队，没有半个状态 | 同上 |
| RAC-955 | 动作与 API 快照随改动更新（`granted`、新动作），形状变化记入 PR 的「对调用方的影响」 | `pnpm actions:update`、`pnpm api:update` |
| RAC-956 | 安全不变量表新增一行并指向以上测试，`pnpm health:check` 通过 | `check-health-gates --base origin/main` |
| RAC-957 | （BL-700）个人空间的开关只给本人：四种别的调用者发现不了也调不了；没有凭据、手写同文、项目入口的凭据、同意入口的凭据、代本人的调用都是 `actions.forbidden`；输入里写项目或身份被拒 | `tests/security-invariants-plugin-permissions.test.ts` |
| RAC-958 | （BL-700）宿主设置入口列出并开关个人空间的插件：控制令牌、Origin、方法、多余字段、插件页都被拒；开关后插件按新授权重启、列表读到新值；必需的关不掉、没声明的开不了；项目入口够不到它 | `tests/security-invariants-plugin-permissions-http.test.ts` |
| RAC-959 | （BL-700）插件页有「个人空间里的插件」一节，从宿主设置入口读、开关发往那里；项目的行仍发往项目入口 | 同上 |

## 7. 裁定（统筹，2026-10-26）

1. **入口**：项目设置页自己的接缝，项目取自路径、凭据由入口盖章；不从输入读项目。
2. **收窄靠停—改—起**，复用 `revokeContext`；这个安装的其他在途调用被打断可以接受，不动 S-18。
3. **加一步确认**（原稿推荐不加，统筹改为加）：放宽 `actions:delegate`、`network:*`、`secret:*`、`model:invoke` 这四类时，页面先弹一次确认，写出平台的原话（和安装预览同一套文案），复用 T7 的同一个 `ask` 对话框；只在 UI 层，动作不变。其余权限单击生效。理由：优先不留隐患，这四类一开就能外发数据或花钱。
4. **范围**：开关只管这个项目里的这个安装。Home 级插件的开关页记 **BL-700，owner 是 ac-shell**，排在 PG-002 之后接着做，不放进待办池；**PG-002 行要等 BL-700 也做完才标已做**。
5. **不建表**，只记 `updated_at`。
6. **S 号**：S-93；S-15 补一句指向它。

## 8a. BL-700：个人空间里自己运行的插件的开关（已实现）

- **范围**：Manifest 写 `runtime: { scope: "home" }` 的插件（Todo、Jelly、Images、Issues、Cognia、Shelf 等）在 Home 的 Plugin Runtime 里有自己的安装记录，项目的插件页看不到。双实例的插件项目一半和 Home 一半各有一条记录、`install_id` 相同，所以动作按范围分开，不靠 id 猜是哪一半。
- **动作**：`plugins.home.permissions.set@1`（范围 `home`）与 `plugins.home.installed.list@1`（查询），放在同一个 `plugin-install` 提供方里，受众只有 `user`；输入输出形状与项目的同一份（`granted` 随权限）。
- **入口与凭据**：宿主设置入口 `/api/settings/plugin-permissions/{list,set}`（仿 `/api/settings/plugin-consents/*`，`plugin-permission-settings-http.ts`），先拒插件页，凭据是入口自己发的第三份登记（`assertHomePluginPermissionSettingsEntry`，要求 `project_id` 为 `null`），与项目入口、同意入口的互不通用；项目入口收到个人空间的 `install_id` 是 `plugin.definition_missing`。
- **方法**：同一个 `PluginRuntime.regrant`，经 `regrantHomePlugin`：Home 平台的监督器运行这条安装才由 Home 平台停—改—起。
- **页面**：放在项目设置的「插件」页里「已安装的插件」下面一节「个人空间里的插件」，写明「所有项目共用同一份」，同一套行、开关与确认，只是开关发往 Home 入口。没有新开全局设置分区：开关是对每个项目都生效的授权，放在人本来就看插件权限的那一页最不容易漏看；将来要独立成全局分区时，渲染与脚本不用改，只换挂载位置。
- **验收**：RAC-957（动作受众与凭据）、RAC-958（入口守卫、重启后新激活持有、项目入口够不到）、RAC-959（页面）。安全不变量仍是 S-93，没有新号。
- **状态**：PG-002 行可以在这一片合入后标已做。

## 8. 防腐复查

- 不新增兼容层、不留迁移：不建表，读取只认现行形状。
- 一个事实一个主人：授权清单仍只在安装记录里，界面读它、动作写它，没有第二份；同意账本不动。
- 没有给某个插件开私路：开关对所有插件一样，`host`、`pinned`、`unsigned` 走同一个方法，差别只在安装时的默认值（PG-003）。
- 插件缺什么补进平台：本片补的正是平台缺的「人改授权」。
- 动作注册一次，进动作目录，不另写名单；MCP/Agent 看不到（受众只有 `user`）。
- 页面资源：只涨 T7 已涨的那个脚本，字节数写进 PR。
