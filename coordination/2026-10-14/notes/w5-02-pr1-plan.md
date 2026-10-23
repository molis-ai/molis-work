# W5-02 PR-1：登记搬进各包、生成登记表、平台改读生成物（② 平台，2026-10-19 返工版，待 ① 批）

**状态**：按 D16（`coord-shared/DISPATCH-1019-0710.md`）和评审底稿 `coord-shared/review/plan-review-w5-02-pr1-1019.md` 返工，写进了用户 10:20 UTC 批的门禁读法与豁免。事实由只读子代理按 main `8eedf2222` 重扫；到 `7805fc62a`（#759 已合）为止，`builtin-plugins.ts`、`project-plugins.ts`、`project-host.ts`、`home-plugin-http.ts`、contracts 的 `projects.ts`、`privileges.md`、`assembly.mjs` 都没变。

**依据**：`privileges.md` §2 的 T1 行（`:102`）和 §3.7 的 PG-051、PG-065～PG-071、PG-105；§10.28 给 ② 的 P2 第 8 条（#679，Home 路由只认 Home 登记，PG-011 的一半）。W5-06（#729）只留一个指针（§13）。

## 0. 结论与先后

| 片 | 做什么 | 行为变不变 | 前置 |
| --- | --- | --- | --- |
| **C** | contracts 新子路径 `platform/plugin-registration`；工作台目录改用它的类型；删掉 contracts 里的三项名单（Feed→Inbox 搬到 Feed 条目上） | 不变 | #786 合入；进批 |
| **P0** | Coding 的客户端组装搬进 Coding 包，靠声明拿到 Git、Files 的工厂；工作台不再有 Coding 专用脚本 | 不变（浏览器验证待补） | C 合入 |
| **PR-1a** | 26 个包各写自己的登记；生成器原地写出 `apps/workbench/src/builtin-plugins.ts`；门禁读法同时认新旧两种；`--check` | 不变（逐字段比对） | T0（#799）、P0 合入；冻结 `builtin-plugins.ts` |
| **PR-1b-1** | 平台读自己的生成物，不再 import 工作台的目录（PG-105）；全部派生点一个提交切换；豁免；门禁删掉旧写法 | 不变 | PR-1a、#797 合入；冻结 `project-plugins.ts` |
| **PR-1b-2** | Manifest 加 `summary`、`developer`，SDK 检查；裁定 m 的标记 | 不变 | PR-1b-1；进批 |
| **PR-1b-3** | #679：Home 路由按 Home 登记判断（S-31） | 变，只这一处 | PR-1b-1、#788 合入 |
| **PR-1b-4** | PG-067：6 条没有端口的监督器条目改成生成 | 不变 | 项目库计划的 L4、#786、#788 合入；冻结 `project-plugins.ts` |
| PR-1c | PG-051：Agent 定义只留一条登记路 | 变 | PR-1b-1，另起计划 |

C、P0、PR-1a 依次合入，PR-1a 先于 ③ 的 S5（都改 `plugins/native/goals/package.json`）。共享核心的片（C、PR-1b-2）进集成批。

**D16 十点对照**

| D16 | 在哪 |
| --- | --- |
| 1 T0 先做（#799）；冻结窗口 | §1 |
| 2 先定 Coding 的客户端；`served()` 要有声明形状 | §4（P0）、§3.2 |
| 3 事实重扫 | §2 |
| 4 一份真相：范围、伴随插件各留一处；`catalog_order` 查重；不再导出旧类型名 | §3.3 |
| 5 生成器确定、`--check` 严格 | §5 |
| 6 门禁：读法进 PR-1a，豁免进 PR-1b，`MolisWorkLocalHost` 不长，`*_SCRIPT` 搬家算新增 | §6 |
| 7 合同：`api:update`、进批、SDK 检查新字段、裁定 m 标记、排在 #786 后 | §3、§8 |
| 8 安全一节重写 | §7 |
| 9 同 PR 改文档；PG-071 留到 W5-03 | §9 |
| 10 先后 | 本节表 |

## 1. 前置与冻结

- **T0**：⑦ 的 #799 逐行复核 22 行「待复核」（含 PG-067、PG-068 的旧数字）。PR-1a 等它合入。
- **冻结**（① 宣布）：PR-1a 从推送到合入，冻结 `apps/workbench/src/builtin-plugins.ts`；PR-1b-1 和 PR-1b-4 各自从推送到合入，冻结 `apps/local-host/src/project-plugins.ts`。`tests/builtin-plugin-assembly-gate.test.ts` 和 `scripts/workspace-packages.mjs` 只由这几片自己改。PR-1a 合入后，要改目录的插件改自己包里的 `src/registration.ts` 再重新生成。
- **在途核对**（`7805fc62a`）：
  - #797（我的）改 `project-plugins.ts:176-180`：PR-1b-1 之前合入。
  - #788（我的）改 `home-plugin-http.ts`（去掉 `granted: caller.permissions`）和 S-15 的说明：PR-1b-3 之前合入。
  - #786（我的）改 contracts 的「只给宿主条目」注释：C 之前合入。
  - #759 已合：Coding 用 esbuild 打浏览器代码，`readFileSync` 读进常量（`plugins/native/coding/src/draft-client.ts:8`）。P0 照这个先例。
  - #793 改 Coding 的 `route-actions.ts`、`run-inputs.ts`，与 P0 不撞；#631（草稿）改 Coding 的 `client.ts`，P0 不碰这个文件。
  - 没有在途 PR 碰 `builtin-plugins.ts`、`plugin-catalog.ts`、`coding-setup.ts`、装配门禁测试、`workspace-packages.mjs`、contracts 的 `projects.ts`。
- 与项目库计划的交叉：L2 改 `project-plugins.ts:156`（Coding 的存储），与 PR-1b 的冻结窗口错开；PR-1b-4 读 L4 搬进 Manifest 的 `databases.home`。

## 2. 事实（main `8eedf2222`）

### 2.1 `apps/workbench/src/builtin-plugins.ts`（447 行，26 条，`:107-447`）

| 字段 | 条数 | 说明 |
| --- | --- | --- |
| `project_plugin_id`、`manifest`、`summary`、`workbench`（含 `order`、`contributions`） | 26 | files、git、diff、text-stats 的 `contributions` 是 `[]` |
| `workbench.order` | 26 | **5 用了两次**（issues `:111`、feed `:238`），**14 用了两次**（todo `:287`、characters `:301`），4 没用 |
| `stylesheet` | 15 | builder `:139` 拼了 design-system 的 `PLUGIN_COMPONENT_STYLES`（plugin-builder 已依赖 design-system） |
| `clientFactory` | 17 | 经 `served()`（`:45-47`）的 3 条：schedule `:229`、lingguang `:272`、pages `:319`；Coding `:419` 用工作台内部的 `CODING_WORKBENCH_SETUP_SCRIPT`（`:1`） |
| `clientFrom` | 4 | files、git、diff、text-stats，都是 `CODING_PROJECT_PLUGIN_ID` |
| `clientAssets` / `settingsClient` | 2 / 1 | shelf、pages / shelf |
| `searchRow` / `recordRow` | 12 / 4 | `recordRow`（#765）：goals、sessions、inbox、feed，类型在 `:68` |
| `personal: true` | 15 | |
| `developer` | 1 | text-stats |
| `runtime` | 5 | issues、cognia、images、jelly、todo，都是 `scope: "home"`。`files`、`image_generation` 只有 images，`model_configuration` 只有 jelly，`keys` 只有 issues；类型里的 `owner_files`、`initialize_owner_files`（`:82-83`）没人用 |
| `instructions` / `agent` / `methods` | 13 / 3 / 3 | |
| `project_data` / `home_store` / `messages` | 8 / 6 / 1 | |

- 条目上没有 `companions`：伴随关系在 contracts 的 `PROJECT_PLUGIN_COMPANIONS`（`projects.ts:56-64`，feed → inbox），工作台 `plugin-catalog.ts:131` 读它。
- plugin id 多数是 `io.molis.work.<短 id>`；workflows 是 `io.molis.work.native.workflows`（`workflows/src/model.ts:8`）。

### 2.2 Coding 的客户端（唯一依赖工作台内部代码的条目）

- `CODING_WORKBENCH_SETUP_SCRIPT`（`apps/workbench/src/scripts/client/coding-setup.ts:9`，55 行）只在 `builtin-plugins.ts:1,419` 用。它拼了：
  - Git、Coding、Files 三个包的工厂；
  - 工作台内部的 `CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT`（`coding-companions.ts`，35 行，按 `[data-companion]` 分 files、git、其他三支）；
  - `AGENT_REVIEW_CLIENT_FACTORY_SCRIPT`（`agent-review.ts`，140 行，「Host-owned review actions」）；
  - 自己的胶水：`companionRequest`（`/api/plugins/io.molis.work.<插件>`）、`addWorkspace`（POST `/api/workspaces`）、页面全局的 `molisWorkRequest`。
- `tests/companion-client-lifecycle.e2e.test.ts:10-11` 从工作台的 dist 读那两个内部脚本。
- 别的条目都只用自己包或 design-system 的东西。

### 2.3 项目级监督器（`apps/local-host/src/project-plugins.ts`，282 行）

11 条，都是 `bundled: true`：`:189-233` 的 7 条（characters、shelf、coding、files、diff、git、text-stats），加 `homeLibraryPlugins()`（`:252-270`，有 Home 目录才加）的 4 条（dataset、form、lingguang、ppt，各带一份 Home 库声明）。**没有宿主端口的 6 条**：diff、text-stats、dataset、form、lingguang、ppt。

### 2.4 Home 级条目在 6 处派生

`project-host.ts:202-205`（`HomePluginHost` 的 `entries`）、`plugin-owner-files-entries.ts:21`、`plugin-scope-entries.ts:11,27`、`home-stores.ts:36-40`、`native-plugin-api.ts:6-11`（只给 `personal && !runtime` 的条目建别名）。看插件范围的地方：`home-plugin-http.ts:32,134,161`、`plugin-scope-entries.ts:27`、工作台 `home-plugin-navigation.ts:7,39`、`home-plugins.ts:20`、`scripts/gates/home-runtime-entries.mjs:15`。

`home-plugin-http.ts` 有 4 处查目录：`:32`（页面）、`:134`（`routeProject`，S-31）、`:145`（`homePageContext`）、`:161`（`renderHomePluginStages`）。

### 2.5 平台层读目录的地方

- 直接点名 `BUILTIN_PLUGIN_CATALOG` 的 18 个 local-host 文件：`agent-definitions/builtin-agents.ts`、`builtin-instructions.ts`、`agent-host-composition.ts`、`agent-question-surfaces.ts`、`artifact-native-plugin-http.ts`、`coding-surface.ts`、`declared-types.ts`、`home-plugin-http.ts`、`home-stores.ts`、`local-owner-permissions.ts`、`native-plugin-api.ts`、`plugin-owner-files-entries.ts`、`plugin-scope-entries.ts`、`project-action-availability.ts`、`project-deleted-owners.ts`、`project-host.ts`、`side-files-http.ts`、`web-project-platform-routes.ts`。
- **读由目录派生的值的**（旧稿漏了）：`BUILTIN_PLUGIN_AGENTS`（另有 `schedule-task-runner.ts`）、`BUILTIN_PLUGIN_REGISTRY`（`project-catalog.ts:184`）、`PROJECT_SCOPED_PLUGIN_IDS`（`demo-plugin-seed.ts`，另有 3 个脚本）、`artifactTypeDeclarations`（`artifact-actions.ts`、`goals-actions.ts`、`side-files-http.ts`、`artifact-native-plugin-http.ts`）、`artifactContinuers`、`artifactReferrerActions`、`availableProjectPluginIds`（`project-action-availability.ts`、`web-goals-read.ts`、`web-project-platform-routes.ts`）、`shownProjectPlugins`（`agent-reference-kinds.ts`、`web-project-context.ts`）、`homeToolKeysScript`（`im-server.ts`）、`pluginWorkbenchClientAsset`（`web-assets.ts`）、`renderHomePluginPage`。前 8 项是平台事实，PR-1b-1 改从平台的生成物派生；后 3 项是外壳的渲染，留在工作台。
- local-host 已依赖 28 个插件包，26 个里只差 `plugin-issues`。

### 2.6 读目录的门禁与脚本

| 文件 | 读法 |
| --- | --- |
| `scripts/check-package-boundaries.mjs` | `:343` 把 `builtin-plugins.ts` 交给 `hasWorkbenchUiContribution`；`:1396-1409` 用正则认 import、`pluginWorkbenchPacks`、数组体、`contributions`；`:1464` 读文本做 `checkProposalUiOwnership` |
| `scripts/gates/translations.mjs` | `:66` `MESSAGES_ROOT` 指向它；`:257-279` 读数组里的 `messages`；`:537-541` 报错 |
| `scripts/gates/home-runtime-entries.mjs` | AST 读 `runtime.scope === "home"` 的条目，要求字面量的 `package_name`、`factory_export`、`create`；`assembly.mjs:16,53`、`package-inventory.mjs:18,83` 用它的结果 |
| `scripts/gates/assembly.mjs` | `:43-56` 在 `project-plugins.ts` 的文本里找包名；`pluginOutsideMentions` 在 `:146-168`，`NEW_PLUGIN_OUTSIDE_FILES = 7`（`:36`） |
| `scripts/gates/package-inventory.mjs` | `:23,82,98` 在 `project-plugins.ts` 里找子串，定 Runtime 还是构建期 |
| `scripts/gates/page-assets.mjs` | `:175-187` 动态 import 工作台 dist 的 `BUILTIN_PLUGIN_WORKBENCH` |
| `scripts/gates/action-contract-host.mjs` | `:57-69,111-115` 动态 import 目录与 `PROJECT_SCOPED_PLUGIN_IDS` |
| `scripts/affected-tests/rules.mjs` | `:32,63` |
| `tests/builtin-plugin-assembly-gate.test.ts` | `RUNTIME_ASSEMBLED`（`:27-39`，11 条）、`BUILD_TIME_ASSEMBLED`（`:45-48`，10 条）；`:111` 用正则在 `project-plugins.ts` 里找包名与工厂名 |

`verify-release-versions.mjs` 不读目录（它按 `plugins/native/*/src/manifest.ts` 找）。24 个测试文件点名 `BUILTIN_PLUGIN_CATALOG`。

### 2.7 contracts

`packages/contracts/src/modules/projects.ts`：`BUILTIN_PROJECT_PLUGIN_IDS`（`:47`，没有代码用，只在 API 快照里）、`PROJECT_PLUGIN_COMPANIONS`（`:56-64`）、`BUILTIN_PROJECT_PLUGIN_REGISTRY`（`:81-88`，只是 `modules/projects/src/project-service.ts:14,31` 的默认参数和一个测试；生产里传的是工作台的 `BUILTIN_PLUGIN_REGISTRY`）。`PluginManifest`（`platform/plugin.ts:210-285`）没有范围、顺序、`personal`、`summary`、`developer`。

### 2.8 门禁数字（committed baseline）

- `MolisWorkLocalHost`（`project-host.ts:119-419`）301 行、22 个方法，上限 300，**不许再长**。`HUGE-CLASS-MIGRATION.md:176` 还写着 361/24。
- `pluginOutsideMentions` 共 381（issues 4、goals 58、feed 41……）。它按文件数：`plugins/native/<目录>/` 之外、文本里含包名的源码、`package.json`、`apps/*/package.json`、`scripts/*.mjs|mts`。
- `scriptConstants` 共 129；`agent-review.ts`、`coding-companions.ts`、`coding-setup.ts` 各 1；`builtin-plugins.ts` 是 0（`served()` 的结果是调用，不算）。`*_SCRIPT` 搬到别的文件算新增。

### 2.9 安全不变量与 id

- S-08（`SECURITY-INVARIANTS.md:22`）：只有宿主自己的启动名单能让插件拿内置 `plugin_id` 作提供方。S-15（`:29`）：只有它能把插件标 `bundled`。S-31（`:45`）：路由前核项目存在、项目显示这个插件。
- `PLUGIN_ID`（`packages/plugin-sdk/src/plugin-id.ts:2`）是 `/^io\.molis\.work\.[a-z0-9][a-z0-9.-]*$/u`：带点；短 id 没有点，所以不会撞。短 id 和 plugin id 共用键的两处：`native-plugin-api.ts` 的别名、`/api/plugins/<id>/` 路由；Home 页路由的正则 `[a-z0-9-]+`（`home-plugin-http.ts:29`）只收短 id。

## 3. 登记类型（C）

### 3.1 放在哪

contracts 新子路径 `platform/plugin-registration`，导出 `PluginRegistration`、`PluginWorkbenchRegistration`。C 里工作台目录直接改用它（`BuiltinPluginEntry`、`BuiltinPluginWorkbench` 删掉，不留别名），所以它有真实使用者，不是占位子路径。`pnpm api:update`，进批。

### 3.2 字段

```ts
export interface PluginRegistration {
  readonly project_plugin_id: string;   // 短 id，`^[a-z0-9][a-z0-9-]*$`
  readonly catalog_order: number;       // 目录顺序，唯一；PR-2 与 workbench.order 合并
  readonly manifest: PluginManifest;
  readonly summary: string;             // PR-1b-2 搬进 Manifest
  readonly developer?: true;            // PR-1b-2 搬进 Manifest
  // 以下影响信任，留在可信登记（§7、§11 PG-065 行），注释标「2026-10-18 改」（裁定 m）
  readonly personal?: true;
  readonly companions?: readonly string[];      // 取代 PROJECT_PLUGIN_COMPANIONS
  readonly runtime?: { scope: "home"; create; package_name; factory_export; database?; files?;
                       model_configuration?; image_generation?; keys? };
  readonly project_data?; readonly home_store?; readonly messages?;
  readonly instructions?; readonly agent?; readonly methods?;  // PR-1c 收进 PluginDefinition
  readonly workbench: PluginWorkbenchRegistration;
}
```

- `PluginWorkbenchRegistration` 是今天的形状原样搬来（含 `recordRow`），只加两项：`clientServed?: true`（工作台在下发前做 `served()` 那一步压缩，字节不变）和 `clientUses?: readonly string[]`（P0）。`clientFrom`、`clientUses` 写字面量短 id：插件不能 import 别的插件的常量。
- 派生出的 `BUILTIN_PLUGIN_WORKBENCH` 形状不变，`page-assets.mjs` 的读法不动。
- 删掉类型里没人用的 `owner_files`、`initialize_owner_files`（裁定 m 要删的钩子）。

### 3.3 一份真相

- 范围只在 `runtime.scope`（可信登记）。Manifest 不加 `runtime_scope`，旧稿 §4.2 那一项作废。
- 伴随插件只在登记的 `companions`。C 里把 Feed→Inbox 写到 Feed 条目上，同一个 PR 删掉 contracts 的 `PROJECT_PLUGIN_COMPANIONS`、`BUILTIN_PROJECT_PLUGIN_IDS`、`BUILTIN_PROJECT_PLUGIN_REGISTRY`；`project-service.ts:14,31` 的默认参数改成必填；`tests/project-plugin-registry.test.ts`、Skill 的 `elements.md:53`、`host.md:90` 跟着改。
- `catalog_order` 唯一，生成器查重（§5）。C 里按今天的数组顺序编号，PR-1a 的逐字段比对因此成立。
- 不再导出旧类型名。

## 4. P0：Coding 的客户端搬进 Coding

**取舍**：一是把组装搬进 Coding 包，靠声明拿依赖；二是加一种「宿主组装」的客户端声明，生成器给 Coding 开特例。选一：特例就是给一个插件在宿主里开私路（10-18 待遇一样）。

- Coding 的胶水（`companionRequest`、伴随插件框、`addWorkspace`）和 `coding-companions.ts` 的伴随框写成 Coding 包里的浏览器 TypeScript，照 #759 的先例用 esbuild 打包、`readFileSync` 读进常量。不新增字符串字面量的 `*_SCRIPT` 常量；删掉 `coding-setup.ts`、`coding-companions.ts`，`scriptConstants` 少 2。
- 伴随框不再按插件名分支：有 `host.clients[<短 id>]` 就交给它，没有就用通用的 `/state` 读取（今天 diff、text-stats 走的那条）。
- Git、Files 各自声明 `clientFactory`，加 `clientFrom: "coding"`（和 Coding 打在同一个资源里，与今天下发方式相同）；Coding 声明 `clientUses: ["git", "files"]`，工作台把它们的工厂实例按 `host.clients.git`、`host.clients.files` 交给 Coding 的工厂。
- 评审动作仍归宿主：工作台把 `agent-review.ts` 的工厂作为通用的 `host.reviews` 交给每个声明了 `clientUses` 的客户端，Coding 只调它，不拿决定权（原注释「Plugins receive a rendering hook, never a decision capability」照旧）。
- 胶水用到的页面全局（`molisWorkRequest`、`/api/workspaces`）从工作台传给所有工厂的 `host` 对象取；`host` 缺的，补在通用的 `host` 上，不开 Coding 专用分支。
- `tests/companion-client-lifecycle.e2e.test.ts:10-11` 改从 Coding 的 dist 读。它是浏览器用例：PR 正文写「浏览器验证与截图待补（用户 10-19 暂停）」。
- `/assets/molis-work-plugins/coding.js` 的字节数按 `page-assets` 规则：变小就降基线；变大就照 `APPROVED_CEILINGS` 的路走（PR 写明原因），超过 10 KB 先问用户。esbuild 压缩过，预计变小。

## 5. 生成器（PR-1a）

`scripts/generate-plugin-registry.mjs`，写入与 `--check` 两种模式。

- **只读仓库里的包**：从 `scripts/workspace-packages.mjs` 的登记表里取 `plugins/native/*`、`package.json` 的 `molis-work.registration` 有值的包；登记指向 `plugins/native/` 之外的路径就失败。从不读 `node_modules`、Home 里装上的包。
- **每个包怎么写**：`src/registration.ts` 导出 `registration: PluginRegistration`，必须是一个对象字面量（不许展开、不许由函数算出）；`package.json` 加 `exports["./registration"]`，`molis-work` 块写 `"registration": "./registration"`。
- **写出什么**：原地写 `apps/workbench/src/builtin-plugins.ts`：
  - 文件头「生成物，勿手改，`node scripts/generate-plugin-registry.mjs` 重写」；
  - 每个包一行 `import { registration as … } from "<包>/registration"`，按包名的码点顺序；
  - `export const BUILTIN_PLUGIN_CATALOG = [ … ] as const`，按 `catalog_order` 升序；
  - 没有别的逻辑。`served()` 搬到 `plugin-workbench.ts`，由 `clientServed` 触发。
  - 原地写的好处：这个文件今天就点名这 26 个包，各插件的 `pluginOutsideMentions` 不变；文档、Skill 里引的路径也不变。
- **确定**：没有时间戳、没有绝对路径，LF 换行，结尾一个换行。
- **`--check`**：重新生成，与磁盘上的文件逐字节比，以下任一情况失败并说明是哪个包：文件过期或被手改；某个声明了 `registration` 的包没有 `src/registration.ts`；`registration.ts` 里有不认识的键（顶层和 `workbench` 两层，用 AST 读）；`catalog_order` 不是数字字面量或重复；`project_plugin_id` 是字面量时格式不对或重复。
- **字面量以外的查重**：多数 `project_plugin_id` 和全部 `manifest.plugin_id` 引用包里的常量，文本读不出来。由一条读 dist 的测试和宿主启动时的检查拒绝重复，并核对 `clientFrom`、`clientUses`、`companions` 指向存在的登记（W5-02-REG-02）。
- `--check` 放进 `pnpm health:check`（CI 里跑）。它只读文本，不需要先构建。
- **一次性比对**（W5-02-REG-01）：PR-1a 前后各序列化一次 `BUILTIN_PLUGIN_CATALOG`（非函数字段取值，函数字段记身份），逐条相等；脚本放 scratch，结果贴进 PR 正文。

## 6. 门禁

- **读法进 PR-1a，同时认两种写法一个 PR**（用户 10-19 批）：`home-runtime-entries.mjs`、`assembly.mjs`、`package-inventory.mjs`、`check-package-boundaries.mjs`（`:343`、`:1396-1409`、`:1464`）、`translations.mjs`（`MESSAGES_ROOT`）、`affected-tests/rules.mjs`、装配门禁测试。门禁对 merge-base 也用头的脚本量，所以新读法先认旧写法（目录数组在 `builtin-plugins.ts` 里）、再认新写法（读生成文件列出的各包 `registration.ts`）。PR-1b-1 删掉旧写法，加一条「旧写法被拒」的测试。
- **豁免进 PR-1b-1**（用户 10-19 批）：`pluginOutsideMentions` 不数生成文件，按确切路径登记（`apps/workbench/src/builtin-plugins.ts`、`apps/local-host/src/plugin-registry.generated.ts`），只在 `--check` 通过时生效。
- **`plugin-issues` 的依赖**：PR-1b-1 要给 local-host 加这一个依赖（26 个里唯一缺的），`apps/local-host/package.json` 因此多点名一次，issues 的数字从 4 变 5。豁免只认两个生成文件的路径，盖不住它（§12 第 3 条）。
- **`MolisWorkLocalHost` 不长**：`project-host.ts:202-205` 的 Home 条目派生搬进新文件 `apps/local-host/src/home-plugin-entries.ts`，类变短。
- **`scriptConstants`**：P0 少 2；PR-1a、PR-1b 不搬任何 `*_SCRIPT` 常量（各包的脚本常量本来就在包里，登记只引用）。
- **`page-assets`**：PR-1a、PR-1b 不许让下发的字节变；P0 见 §4。
- **巨大单元**：生成文件只有 import 和一个数组；`plugin-catalog.ts` 只会变小。
- **W2-10-E**：生成文件经包名 import，测试照旧经包名读 dist，不新加 `../P/src`。

## 7. 安全

旧稿「安全边界不变」不准确。改成：

- **生成文件就是 S-15、S-08 的启动名单**。PR-1b-1 起宿主从 `plugin-registry.generated.ts` 取启动名单；同一个 PR 改 S-15、S-08 两行的代码列。
- **只有仓库里的包进名单**：生成器只读 `plugins/native/` 里登记过的包（§5），`--check` 在 CI 里跑。拒绝测试（W5-02-REG-06）：一个装进 Home 的包带着 `molis-work.registration` 和 `registration` 导出，不进启动名单、拿不到 `bundled`、不能用内置 plugin id 作提供方。
- **影响信任的字段留在可信登记**：`personal`、`companions` 决定 S-31 的路由准入和自动启用；`runtime`（工厂、库、文件、模型配置、图片生成、快捷键）、`project_data`、`home_store`、`messages` 是宿主给的服务。都不进 Manifest。`HomeStoreDeclaration` 只由可信登记带。Home 库声明进 Manifest 走项目库计划的 L4（带发布者绑定）。
- **可信字段搬进包以后，平台仍要评审**：`scripts/package-owners.mjs` 加一条规则，`plugins/native/*/src/registration.ts` 也请平台的评审，`node scripts/package-owners.mjs --write` 重新生成 CODEOWNERS。
- **全部派生点一个提交切换**（PR-1b-1）：§2.4 的 6 处和 §2.5 的平台事实，免得半数从工作台、半数从生成物取。
- **与 #788 对齐**：#788 改 S-15 第二段（Runtime 插件的网页调用只认安装的授权），PR-1b-3 动的 `routeProject` 在它之后。
- 改到的不变量（S-08、S-15 的代码列；S-31 的代码列在 PR-1b-3）和测试同一个 PR 改，测试进 `pnpm test:security`。

## 8. PR-1b 四片

1. **PR-1b-1 平台读自己的生成物**：生成器多写 `apps/local-host/src/plugin-registry.generated.ts`（同一批 `registration`，同样的确定规则）；§2.5 的 18 个文件和 8 个平台派生值一个提交改读它；`home-plugin-entries.ts`（§6）；豁免；删掉门禁的旧写法并加拒绝测试；S-08、S-15 代码列；W5-02-REG-04、-06。
2. **PR-1b-2 Manifest 的展示字段**：`summary`、`developer` 搬进 `PluginManifest`，SDK 的 Manifest 检查认它们（类型、长度）；登记删掉这两项；已装插件读出来就是缺省值，不用迁移。随宿主发布的插件按裁定 b 跟宿主版本走；先跑 `builtin-manifests-contract`、`verify-release-versions`、`plugin-declaration-rules`、动作合同快照（只哈希动作与场景，新字段不进）。登记类型里留下的可信字段标「2026-10-18 改」（裁定 m）。`pnpm api:update`，进批。
3. **PR-1b-3 #679**：`home-plugin-http.ts` 4 处改查 Home 登记（宿主的 Home 监督器加 Home 夹具）：页面按短 id 找已登记的插件；`routeProject` 按 `projectKey(pluginId)` 判断，`projectKey` 对随宿主发布的插件是 `project_plugin_id`，对装上的插件是 plugin id（`PLUGIN_ID` 带点，短 id 不带点，不会撞）；`homePageContext`、`renderHomePluginStages` 遍历 Home 登记。项目里存的插件清单不改键（改键要动真实 Home 的存量，还算对外改名）。先失败的用例（W5-02-REG-05）：夹具登记一个目录里没有的 Home 级插件，项目路径下能路由，项目隐藏后是 `actions.plugin_disabled`，`/plugins/<键>` 能打开。S-31 的代码列同 PR 改。
4. **PR-1b-4 PG-067**：diff、text-stats、dataset、form、lingguang、ppt 6 条由生成物带进监督器（包名、工厂名、`manifest.databases.home`）；带端口的 5 条（characters、shelf、coding、files、git）照旧手写，等 PG-005 和项目库 L2。装配门禁测试的 `RUNTIME_ASSEMBLED` 改读生成物。

## 9. 文档（随各片同 PR 改）

- **PR-1a**：`AGENTS.md:33`（Home 级插件写在包的登记里，不再是目录条目）；`skills/molis-plugin-dev/host.md:58,72,88`、`SKILL.md:77,120`、`elements.md:51`、`ui.md:86`；`skills/molis-prologue-ai/SKILL.md:64,68`；`apps/workbench/README.md` 的「界面文字」（`:5,48`）和 `:55,98,117,120`；`docs/platform/PLUGIN-DEVELOPMENT.md:5,9,107,276`、`PLUGIN-PLATFORM.md:142`、`PROLOGUE-AI.md:134,136`；`docs/system/EXTENSION-POINTS.md:66,76,94,313,319`、`CALL-CHAINS.md:146`、`GLOSSARY.md:142,247`（`:247` 还写着 25 条、14 个个人插件，实为 26、15）、`HOME-DATA.md:65`、`THIRD-PARTY-PLUGINS.md:28`、`RUNTIME-MIGRATION.md:41,49,220,227,256`、`PARALLEL-DEVELOPMENT.md:39`（枢纽文件名单：`builtin-plugins.ts` 成了生成物，枢纽换成各包的 `registration.ts` 与生成器）；`docs/releases/POLICY.md:22,25,150`、`CHECKLIST.md:10,130,131`；`apps/local-host/README.md:117,158`；`plugins/native/pages/README.md:62`；`tooling/gates/README.md:109`、`scripts/gates/action-contract-snapshot.mjs:16` 的注释。
- **C**：Skill 的 `elements.md:53`、`host.md:90`（伴随插件）。
- **PR-1b-1**：`HUGE-CLASS-MIGRATION.md:176`（301/22）、`SECURITY-INVARIANTS.md` 的 S-08、S-15。
- **privileges.md**：PG-065～PG-070、PG-105 的状态随各片改；PG-071 留开到 W5-03（#751 那一处只是把 `MESSAGES_ROOT` 换了地方）。
- spec：`repository-anti-corruption/spec.md` 里引用目录的行在 PR-1a 一并核。归档的历史文档不动。

## 10. 验收编号

| 编号 | 内容 | 片 |
| --- | --- | --- |
| W5-02-REG-01 | 生成的目录与改之前手写的逐字段相等（一次性比对，贴进 PR） | 1a |
| W5-02-REG-02 | `--check` 对过期、手改、缺登记、不认识的键、重复的顺序或字面量 id 失败；读 dist 的测试和宿主启动对重复 id、悬空的 `clientFrom`/`clientUses`/`companions` 失败 | 1a |
| W5-02-REG-03 | 新插件只改自己的包（`registration.ts`、`package.json`）再重新生成，就进目录，不碰外壳和宿主（RAC-02 前半） | 1a |
| W5-02-REG-04 | 平台层没有文件从工作台取目录或由它派生的平台事实（§2.5 前 8 项），按 import 图判断 | 1b-1 |
| W5-02-REG-05 | §8 第 3 条的三个用例 | 1b-3 |
| W5-02-REG-06 | 装进 Home 的包带着登记，不进启动名单、不拿 `bundled`、不能冒用内置 plugin id | 1b-1 |
| W5-02-REG-07 | 门禁的旧写法被拒（读法只认新写法） | 1b-1 |
| W5-02-REG-08 | Coding 的客户端经 `clientUses` 拿到 Git、Files 的工厂，工作台里没有 Coding 专用脚本；`clientServed` 的条目下发字节与改之前相同 | P0 |
| W5-02-REG-09 | 6 条没有端口的监督器条目由生成物带进，与手写时的条目相同 | 1b-4 |
| W5-02-REG-10 | Runtime 定义带角色与方法、目录里没有它，角色也被登记（PG-051） | 1c |

## 11. 决策记录（批后抄进 spec §1）

| 日期 | 要定的事 | 选项 | 选了 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-19 | W5-02 PR-1 的门禁读法与生成物豁免（D16，① 转问） | 读法一次改完；读法在一个 PR 里同时认新旧两种 | 同时认两种，只一个 PR | 下一个 PR 删掉旧写法并加拒绝旧写法的测试；生成物的豁免按确切路径登记，只在 `--check` 通过时生效 |
| 2026-10-19 | PG-065 的字段去哪 | 全部进 Manifest（PG-065 原文）；影响信任的留在可信登记，其余进 Manifest | 影响信任的留在可信登记，其余进 Manifest | `summary`、`developer` 进 Manifest；范围、`personal`、伴随、`runtime` 各项、`project_data`、`home_store`、`messages` 留在登记（S-15、S-08、S-31）；Home 库声明经项目库 L4 进 Manifest，带发布者绑定 |
| 2026-10-19 | Coding 的客户端怎么组装 | 搬进 Coding，靠 `clientUses` 拿依赖；宿主组装的特例 | 搬进 Coding | 特例是给一个插件开私路；评审动作仍归宿主，作通用的 `host.reviews` |
| 2026-10-19 | 登记放在哪 | 各包 `registration` 子路径加 `package.json` 声明；按约定猜路径 | 显式声明 | 生成器不猜；只认 `plugins/native/` 里登记过的包 |
| 2026-10-19 | 生成文件放哪 | 原地重写 `builtin-plugins.ts`；新开 `.generated.ts` | 工作台原地重写；平台另开 `plugin-registry.generated.ts` | 原地写让各插件的点名数和文档路径不变；平台那份按 PG-105 不能从外壳取 |
| 2026-10-19 | 目录顺序 | 登记写唯一的 `catalog_order`；改派生处不依赖顺序 | `catalog_order` | PR-1a 不许有行为差异；PR-2 与 `workbench.order` 合并 |
| 2026-10-19 | 项目里插件的键 | 保持短 id，装上的插件用 plugin id；全部改成 plugin id | 保持短 id | 改键要动真实 Home 的存量，还算对外改名；`PLUGIN_ID` 带点，短 id 不带，不撞 |

## 12. 要 ① 定或转的

1. 宣布冻结：PR-1a 期间 `builtin-plugins.ts`；PR-1b-1、PR-1b-4 期间 `project-plugins.ts`。
2. `--check` 进 `pnpm health:check`：用户 10:20 批的豁免写着「只在 `--check` 通过时生效」，我理解已含这一步；若要单独问，和第 3 条一起问。
3. `plugin-issues` 的依赖让 issues 的点名数 4 → 5（§6）。推荐：豁免另认「两个应用的 `package.json` 里、生成文件所需的插件依赖」，同样只在 `--check` 通过时生效。这比已批的「确切路径」宽，要不要再问用户由 ① 定。另一条路是把生成物做成一个应用层的新包，两个应用只依赖它，工作量大，不推荐现在做。
4. 重复的 plugin id 和多数短 id 不是字面量，生成器查不了，由读 dist 的测试和宿主启动拒绝（§5）。要求登记里写字面量 id，就多一份真相，不推荐。
5. CODEOWNERS 加 `registration.ts` 的平台评审（§7）。
6. PR-1b 合入后，`NEW_PLUGIN_OUTSIDE_FILES` 从 7 降到 0（privileges §5 第 7 条）：改门禁，到时问用户。
7. PR-1a 会改 ① 名下的文档（`AGENTS.md`、Skill、`docs/system`），按 D16 第 9 条同 PR 改，请 ① 指定评审。
8. 跨计划的先后：PR-1b-4 在项目库 L4 之后；项目库 L2 与 PR-1b 的 `project-plugins.ts` 冻结错开。

## 13. 风险

- **PR-1a 量大**：26 个包各加一个文件、改 `package.json`，CODEOWNERS 会请很多评审。纯搬家，比对结果贴 PR。
- **构建**：要重建 26 个插件包加两个应用，全部经 `heavy.sh` 排队，只建改动的包，`--jobs` ≤ 2；本机 `pnpm build` 在 Swift 那一步失败，用 `pnpm --filter` 分包建。
- **P0 是浏览器可见的改动**：浏览器验证暂停期间只能靠单元用例和字节比对，PR 正文写「浏览器验证与截图待补（用户 10-19 暂停）」。
- **Manifest 内容变了版本号没变**（PR-1b-2）：见 §8 第 2 条。
- **W5-06（#729）**：项目里 Runtime 视图的通用挂载要 `UiSurfaceDescriptor.model: "standard"` 和 PR-1b 的 `projectKey`、Home 登记；旧稿 §7 的合同与交接写法（③ 逐个删手放的行、每个 `data-work-surface` 恰好出现一次的用例）留到 W5-06 自己的计划。

## 14. ① 的批复（10-19 11:35 UTC，D23）与用户决定（11:37 UTC）

- 计划批了，附条件，全文见 `coord-shared/DISPATCH-1019-0710.md` D23。
- **§12 第 3 条用户已批：**「豁免扩到两个应用 package.json 里生成文件需要的插件依赖，只在 --check 通过、且依赖清单正好等于生成文件 import 的那一组时生效。」
  - `--check` 要核对这两份依赖清单，多一个、少一个都失败，每种不符各配一条门禁测试。
  - 这条抄进 §11，作为用户决定行。
