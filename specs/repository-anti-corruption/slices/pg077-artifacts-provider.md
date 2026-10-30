# PG-077 成果库的提供方成为平台的（设计稿，方案 A）

状态：设计稿已认可（统筹 10-26，#1311 评论 6410822456：方案 A、D1 照做、D2 并进维护时段）；第一步已实现（2026-10-26，ac-platform，分支 `ac-platform/pg077-design`，基于 batch-42 头 `39e17eca1`），第二步产品代码候选已交接 #1552；按统筹6517794305改为干净重建，旧目录成员维护已取消，安装和验收仍未做。统筹 10-26 裁定：走方案 A，提供方 id 不变，不碰存量数据，不清点真实 Home；若论证出必须走 B（新提供方 id 加维护脚本）先报统筹。验收编号 RAC-1040～1049，待办号 BL-760～761。接着 `ac-artifacts.md`（A1～A4、A7 已合，A5、A6 未做）：本稿取代它的 A5（不换 id），并把 A6 拆成「提供方」与「外壳」两步。

## 1. 结论

**方案 A 够用，不需要 B。** 提供方的 `kind` 从 `"plugin"` 改成 `"system"`、去掉 `plugin_id`，`provider_id` 仍是 `io.molis.work.artifacts`。id 不变，所以凡是按提供方 id 记下来的东西都不用动：

| 记着提供方 id 的东西 | 为什么不用改 |
| --- | --- |
| MCP 逐客户端授权 | 授权按 `(客户端, 项目, 能力, 版本, provider_id, 权限)` 匹配（`mcp-action-grants.ts` 的 `matches`），不含 `kind` |
| 工作流步骤与绑定里的引用 | 引用带的是 `provider_id` |
| 搜索索引的来源行、判断规则的声明者 | 宿主各处都是 `provider.plugin_id ?? provider.provider_id`（`horizontal/search`、`functions-host.ts` 的 `ruleDeclarer`、`behavior-catalog.ts`、放置与情境），值相同 |
| 成果版本上的生产者身份 | 是版本记录里的 `producer_plugin_id` 与绑定签名，和提供方登记是两回事，原样保留 |
| 动作合同快照 | `registered_provider` 不变；快照不含 `kind` |

要换 id（`system.artifacts`）才会碰到上面前两行和第三行，那是 `ac-artifacts.md` 原 A5 的维护脚本；这一步不需要它。

**第二步删除外壳。** 原外壳的项目键 `artifacts` 曾存在每个项目的插件列表和隐藏列表里；删除登记后，代码继续拒绝无效项目键。统筹6517794305转达用户决定：旧Home整体搬开、重建当前结构，不迁移旧成员；因此原成员维护前置取消。外壳、视图与词典的产品归属见§5、§8。

## 2. 第一步改什么（只改代码，不碰存量）

1. **`modules/artifacts`：拆开两个常量。** `ARTIFACTS_PROVIDER`（`artifact-provider.ts`）现在同时是提供方登记和生产者身份。拆成 `ARTIFACTS_PROVIDER_ID`（动作登记用的 id）和 `ARTIFACT_PRODUCER`（`plugin_id`、`version`、`binding_signature`，成果版本记录里写的那份）。两者的值与现在一模一样，测试钉住（RAC-1047）；只是不再用「plugin_id」冒充提供方。`artifact-document-import.ts:138`、`demo-plugin-seed.ts:306` 改用生产者常量，`artifact-actions.ts`（宿主）改用提供方常量。
2. **`apps/local-host/src/artifact-actions.ts:15`：** `kind: "system"`，不带 `plugin_id`，仍带 `project_id`（项目内的提供方，同 `projectWorkspaceActionProvider`）。
3. **本机所有者的权限：** `local-owner-permissions.ts` 的 `ownerProviders()` 现在从内置 Manifest 的 `actions` 推出成果库这一行（`PLATFORM_PLUGIN_REGISTRATIONS` 里 native 且无 `runtime` 的条目）。改成显式一行 `[ARTIFACTS_PROVIDER_ID, ARTIFACT_ACTION_PERMISSIONS]`，权限取自模块，不再靠 Manifest 推：第二步删 Manifest 时这一行不能跟着消失。
4. **可用性：** `project-action-availability.ts:46` 按 `provider.plugin_id` 判断「此项目未启用该插件」；没有 `plugin_id` 之后成果库的动作不再受项目插件列表限制。见 §4 的 D1。
5. **测试夹具：** `tests/artifacts-actions.test.ts:41` 按 `provider.plugin_id` 筛，改按 `provider_id`。
6. **英文词典的归属（实现时发现，设计稿原先漏了）：** 能力库和对外接入两页用 `provider.plugin_id` 找「这条动作的文字用哪个插件的英文」。成果库动作的英文在成果插件的 `ui.translations` 里，去掉 `plugin_id` 之后这两页的成果库动作会变回中文。不能改成 `plugin_id ?? provider_id`：既有的 RAC-771 钉着「没有插件名的行不取任何词典」，而且 `system.*` 没有被保留，第三方插件可以用同名 id 注册词典去改平台动作的英文。做法是 `ActionProvider` 加一个可选的 `words_of`（只由宿主自己的登记设置，Runtime 构造的提供方带不上），成果库登记写成插件 id；两页取 `plugin_id ?? words_of`。这是公开合同的一处增量（`contracts/platform/actions` 的 API 快照加一行），第二步英文词典搬进平台后随之删掉。
7. **文档：** `SECURITY-INVARIANTS.md` 的 S-08 写着「随宿主发布的插件登记在 `plugin_id` 之下」，补一句成果库是平台提供方，仍以历史 id 登记；`SSOT-MATRIX.md` 成果库一行改成「提供方：平台；外壳（项目键、界面）仍是插件登记，待第二步」。本稿合入时不改 `privileges.md` 的 PG-077 状态格，第一步的代码 PR 合入后改成「部分」，写明剩第二步。
8. **外壳的 Manifest 变薄（实现时发现，设计稿原先说「不改 Manifest」是错的）：** 动作合同快照门禁要求「Manifest 里的动作必须由 `plugin_id` 等于该 Manifest 的提供方登记」，同一行又出现在宿主那一份会失败（"is both a Manifest row and a Host row"）。成果库提供方没有 `plugin_id` 之后，这两件事不能并存，所以外壳 Manifest 去掉 `actions`、`permissions` 和 `artifacts.produces/consumes`（界面翻译、贡献、视图留着）；17 个动作的定义早就在模块 `ARTIFACT_ACTIONS` 里，插件包里 `actions.ts`、`action-schemas.ts` 两个重复的文件删掉。
9. **文档类型的生产者声明：** `artifactDeclarationProblems` 要在声明它的同一份 Manifest 里找到预览动作；Manifest 不再有 `actions` 之后，`io.molis.work.document` 的生产者声明（原 §5 第 2 条）提前到这一步，改由宿主登记的产出者表 `HOST_ARTIFACT_PRODUCERS` 提供（`modules/artifacts` 的 `ARTIFACTS_HOST_PRODUCER`，与 Characters 同一类），`declared-types.ts` 先取宿主表再取 Manifest。

不改：17 个动作的合同（能力 id、版本、权限、输入输出 schema 的哈希，`registered_provider` 一列不变）、公开 API 除 `words_of` 一行外、工作台与客户端模板、项目库、真实 Home、项目键 `artifacts` 与插件登记本身。`pnpm actions:update` 的 diff 是 `actions.tsv` 里 17 行搬到 `host-actions.tsv`（剔除 Manifest 独有 owner 列后，同名合同字段一致，见 RAC-1041），`pnpm api:update` 只多 `words_of` 一行（见第 6 条）。

## 3. 信任边界

- **没有扩大授权。** 成果库的动作都声明了权限（`artifacts:read`，写的再加 `artifacts:write`），所以 `mcp-action-grants.ts` 里「system 且无需权限的动作默认开放」那一条对它们不成立；「Agent 读项目内的对象读取器默认开」那一条今天就对成果库的读取器成立，与 `kind` 无关。本机所有者的权限由 §2 第 3 条那一行给，等于今天从 Manifest 推出来的那一份，不多不少（RAC-1043 逐项对照）。
- **id 保留要独立于登记。** `HOST_PLUGIN_IDS`（`host-plugin-ids.ts`）由内置登记生成；非宿主信任的安装，`plugin_id` 等于其中一个、或嵌在它下面（`io.molis.work.artifacts.x`），被 `plugin.id_namespace_conflict` 拒绝（S-75.2，`install-identity.ts`）。第一步登记还在，保留照旧；第二步删登记之后，`io.molis.work.artifacts` 不能掉出保留名单，否则第三方装一个同 id 的插件，就和平台提供方撞 `provider_id`。所以第二步（BL-761）把「平台提供方 id」单独列入保留，第一步先用测试钉住现状（RAC-1045）。
- **不新增 S 号。** 没有放宽或新增边界，只是同一条授权规则换了登记写法；S-08 补一句即可。

## 4. 要统筹裁的两处

- **D1 可用性（推荐：不再受项目插件列表限制）。** 今天一个项目把「成果」插件从列表里去掉，它的 `artifacts.*` 动作对 MCP、Agent、工作流都是 `actions.plugin_disabled`；改后动作一直可用，界面入口（标签）仍跟项目插件列表走，直到第二步。这符合 `ac-artifacts.md` 的 RAC-424（成果是平台面、一直在）。另一条路是给成果库这个提供方在可用性里留特例，那就是宿主里为一个具名提供方开私路，违反 10-18 同等待遇，不取。
- **D2 第二步并进干净重建。** 已由统筹6517794305确认旧Home整体搬开，不改旧项目键；产品代码合入后等用户另说“开始”才重建。

## 5. 第二步（产品候选 #1552，真实重建未开始）

删外壳：`plugins/native/artifacts` 整个包（Manifest、登记、界面贡献、5 段客户端模板、英文词典）、`BUILTIN_PLUGIN_CATALOG` 里的成果库行、`HOST_ARTIFACT_PRODUCERS` 的内置来源，成果页改由工作台的平台面挂（`ac-artifacts.md` 的 C7、RAC-424、RAC-425）。前置：

1. 旧Home整体搬开后创建当前Home，不维护旧成员；原成员维护脚本、旧目录结构夹具及其演练删除。代码只认现行项目键，不留兜底。搬开、安装与服务操作等全部代码就绪后由统筹再问用户“开始”。
2. （已在第一步做完，见 §2 第 9 条：文档类型的生产者声明改由宿主产出者表提供。）
3. BL-761：平台提供方 id 单独保留（§3）。
4. 页面资源字节不许变大：5 段客户端模板原样搬进工作台，`pnpm page-assets:check` 为准。

W5-06 的挂载器（`declared-stages.ts`）和 PG-024 都已合入，不再是前置。

## 6. 验收

| 编号 | 可观察结果 | 证据 |
| --- | --- | --- |
| RAC-1040 | 成果库提供方登记为 `kind: "system"`，没有 `plugin_id`，`provider_id` 仍是 `io.molis.work.artifacts`，`project_id` 照旧；发现结果里 17 个动作的 `provider_id`、能力 id、版本都不变 | `tests/artifacts-actions.test.ts` |
| RAC-1041 | 17 个动作的合同、`registered_provider` 与哈希不变；成果库提供方没有 `plugin_id`，快照里这 17 行从 `actions.tsv`（Manifest）搬到 `host-actions.tsv`（宿主），剔除 Manifest 独有 owner 列后，同名合同字段一致；外壳 Manifest 不再声明 `actions`、`permissions`、`artifacts.produces/consumes`；`pnpm api:update` 只多 `ActionProvider.words_of` 一行（`platform/actions`、`platform/plugin` 两份快照） | 快照门禁；`tests/plugin-artifact-schemas.test.ts` |
| RAC-1042 | 授权前后：已授权的 MCP 客户端仍能调（授权记录一字未改）；没有授权的客户端仍发现不到也调不了；撤销后排队中的调用被拒 | 隔离 Home 的 MCP 授权用例（沿用 S-08 的测试） |
| RAC-1043 | 本机所有者经网页入口仍能调全部 17 个动作；某个插件安装的授权不能借此调到成果库动作；提供方 id 不在表里的 Host 提供方什么权限也拿不到（拒绝本身有断言） | `tests/security-invariants-*.test.ts`，仿 PG-007 阶段 4 的用例 |
| RAC-1044 | D1：项目插件列表里没有「成果」时，动作仍可用，界面标签不出现；有 `plugin_id` 的别的内置插件被去掉时仍是 `actions.plugin_disabled`（不被连带放开） | 非浏览器用例 |
| RAC-1045 | 非宿主信任的安装（未签名、固定公钥各一）`plugin_id` 为 `io.molis.work.artifacts` 或 `io.molis.work.artifacts.x`，都以 `plugin.id_namespace_conflict` 被拒 | 插件安装用例，仿 S-75.2 |
| RAC-1046 | 搜索索引里成果库来源行的 `plugin_id` 不变，已有的索引行不用重建就能读、能搜 | `horizontal/search` 用例，隔离 Home |
| RAC-1047 | `ARTIFACT_PRODUCER` 三个字段与 `ARTIFACTS_PROVIDER_ID` 的值写死在测试里；新写入的成果版本带这份生产者身份，旧版本照读 | 模块用例 |
| RAC-1048 | `ownerProviders()` 里成果库一行来自模块，不再依赖内置 Manifest 的 `actions`（用不含该 Manifest 的登记表构造也能得到同一份权限） | 单元用例 |
| RAC-1049 | 宿主与工作台里没有别处把成果库的 `kind` 当 `"plugin"` 用：Function 创作目录对它显示为平台来源；能力库与对外接入两页里它的动作文字仍取成果插件的英文（`words_of`），没有 `plugin_id` 也没有 `words_of` 的行仍不取任何词典 | 目录用例；`tests/plugin-words-owned.test.ts` |

验证（实现时）：`pnpm build`，上表用例，`node scripts/check-health-gates.mjs --base origin/main`，`pnpm boundary:check`，`pnpm test:contracts`，`pnpm secrets:check`。不动真实 Home，演练只用隔离 Home。

## 7. 待办

- BL-760：第二步，删外壳（§5）；旧成员维护已取消。合入时 `privileges.md` PG-077 改「已做」，`ac-artifacts.md` 的 A5、A6 标「由本稿第二步取代」。真实重建与安装另等用户“开始”。
- BL-761：平台提供方 id 独立于内置登记保留（§3），与第二步同一片。

## 8. 维护窗口线的第二步（Codex 设备 A，2026-10-29）

统筹 #1332 6513987033 已确认按本稿方案 A 接 BL-760/761，旧 BACKLOG 要求换 system.artifacts 的部分由本稿取代。provider_id 与引用合同不变；6517794305取消旧成员维护，改为整个旧Home搬开、新建Home，当前只做代码与临时Home。

实现边界：browser/reference 视图、五段客户端和 en 词典原样搬入 `apps/workbench/src/artifacts/`，经现行 UiHost 注册为平台贡献并继续 mountDeclared，已有壳与 DOM/交互不重做。ArtifactBrowserView、GoalArtifactEmbed、artifactVersionPath 取模块既有公开声明，不再留一份业务形状。成果原件的 Home 存储登记改从模块已导出的 ARTIFACTS_HOME_STORE 取得，原目录与内容不搬。HOST_ARTIFACT_PRODUCERS 的当前平台声明保留；平台 id 独立于插件登记保留。删除仅为旧词典准备的 ActionProvider.words_of 及消费点，同步 API 快照。

删除旧外壳包、生成登记和 workspace 依赖，成果类型与动作合同、事实 Store、生产者身份和权限不变。旧Home全部搬开后新建，不清理或迁移目录成员；专用成员维护脚本、旧目录结构夹具与演练已删除。统筹 #1332 6514355991 已同意门禁替换及 Home 存储登记：保留事实 owner、权限和生命周期断言，增加平台 UI 不读 Store、旧壳不能回来及插件不能顶替项目键/界面 id 的正反检查；assembly 冻结名单与旧别名仅移除成果条目。

本片用 RAC-2340～2349：2340 平台界面不读 Store 的正反门禁；2341 旧壳不能回来、插件不能顶替的正反门禁；2342 平台入口、provider/权限/producer 不变且无旧包依赖；2343 未签名与固定发布者安装均不能占用平台 id；2344 原件目录仍进入 snapshot/purge 登记；2345 中英文目录、选版、预览、引用与交接主路径；2346 原项目成员维护已随用户决定取消，脚本/夹具/演练删除。工程、实际浏览器覆盖、真实重建、本人验收分别记账。

候选验证（2026-10-29）：整体 build、workspace build、boundary、merge-base health 和 page-assets 通过；48份资源合计7,492,948字节，工作台脚本较本片基线少140字节，无新增资源。RAC-2345 在隔离 Home 的真实测试浏览器实操通过：1440/390宽度文件导入与精确版本读取/导出、Goal固定输入、移除旧成员入口被拒但平台入口仍可用、英文成果目录/选版、Assistant交接材料和版本引用。没有发出模型任务。旧插件夹具按新归属更新后144个相关文件通过（含WorkBench README的10个UI浏览器文件），并保留第三方navigator先后和stage-only置后的原顺序；合入当前main2167e044后build/workspace/health/boundary再通过，CI另记。真实目录成员/隐藏行未读取、未清理，未安装，未作用户验收，仍只能由统筹在获准维护窗口合入。

候选CI后续（2026-10-30）：453594d583的必需Verify及Health两片通过，三个可选作业失败仍保留原记录：product两片共有11个失败文件，security一片的knowledge-lifecycle两例也在其中。定位为尚未更新的平台成果合同预期，以及context-onboarding仍尝试启用已删除artifacts插件的真实遗留调用；后者已删，新增平台服务注释。五个没有外部调用方的Workbench根导出删除，不加导出白名单。知识安全用例只改建立项目的旧成员前提，所有撤权/删除/迟到写入断言保留；catalog/demo/市场/导航按平台始终可用更新独立期望，Shelf跨项目导入继续断言未知插件成员入口被拒、鉴权失败403和真实材料成功。定向10文件先9/10，market剩余旧package图标预期改为实际Coding/code后6/6通过，合为10文件有效通过；空白引导专用测试浏览器2/2通过。整体build32与workspace:verify（退出0、公共槽增量5包）确认当前产物，未重跑先前144文件或全量；维护、模型调用、用户验收均没有发生。新CI按随后推送的准确头记录。

2026-10-30干净重建裁定（统筹6517794305）：本PR仅保留产品代码及其鉴权、平台UI、provider/producer与生命周期回归。目录成员数据维护和RAC-2346演练不再执行，相关脚本/夹具/用例删除；旧Home整体搬开等用户说开始，本PR不负责搬动或安装。既有平台行为与RAC-2340～2345验收保持，先前15条成员计数只是已取消路线的历史观察。

干净重建候选工程增量：普通merge main ea05b7690b（含T-113的声明方链接名称），旧插件包仍删除，该包README新增的“被谁引用”说明保留到模块README，Workbench使用现行公开UI贡献。整体build、merge-base health通过；合并后6文件115项串行通过（链接模型/鉴权、平台提供方、UI归属门禁、门禁正反、Workbench导出）。先前144文件及浏览器路径只支持其当时准确头，未冒充新头重跑；当前CI和独立验证另记。

RAC-2345 当前合同补验（2026-10-30）：B在e0763d39a指出用例仍等待旧Goal href而未执行后半路径。现只把这一处选择器同步为T-113现行的插件分组及workbench item plugin/id属性，导入/精确版本、Goal固定输入、非法成员移除后平台入口保留、英文选版、Assistant材料与版本引用的全部断言保留。专用测试浏览器、公共槽、jobs1、独立Home/profile完整实跑1/1、skip0（1440/390两宽度）；未发模型任务。源码及构建与e076相同，既有build/6文件115项与B普通路径证据按其准确源码保留，未重跑或倒签旧144文件。新测试health/base通过，独立复验与Full仍交统筹，不以作者自测替代B签结论。
