# W5-06 外壳余项：页面读声明、运行时目录、项目插件重启入口、引导走 Pages 公开动作（PG-060、PG-088）

状态：统筹已审、必改已补（2026-10-25）；第 1 片已实现（#1261，一轮评审可合）、第 2 片已实现（#1272，叠在 #1261 FIX3 上，随 batch-37 落）、第 3 片已实现（分支 `claude/ac-shell-slice3`，叠在 #1272 上）、第 4 片已实现（分支 `claude/ac-shell-slice4`，叠在第 3 片上），两片都只推分支。事实按 `origin/main`（`df5527f27`）重核。分四片，每片一个 PR，依次做。D1～D5 已裁定，见 §6。

验收编号：RAC-600～619（各片的区间见下）。BL 号段 BL-635～644（本稿暂未取用）。

## 1. 核清：这几项在 main 上还剩什么

| 项 | main 上的事实 | 结论 |
| --- | --- | --- |
| PG-060 已做的部分 | 第 1～3 片（#1087、#1098、#1107）与余项第一片（#1112，随 #1236）：9 张 Goals 的 surface→slot 表和转接文件、手写舞台行、`RAIL_TOOL_GROUPS`、设置图标表、标签标题兜底表、对象标签名单（`objectTabPlugins()`）、规格板插件格，都已改读 Manifest；项目级 Runtime 实例的舞台由运行中的实例画，没在运行的画不可用占位 | 不再碰 |
| BL-387 | 合同字段已在（`UiViewDeclaration.group/creates/start`，#1098），`creatableKinds()`、`homeStarts()` 已在 `plugin-catalog.ts:264,269`，**没有任何页面代码在用**（只有 `tests/view-placement-declarations.test.ts`）。三处手写行原样还在：`apps/workbench/src/goal-inputs-html.ts:22` 的 `CREATE`、`scripts/client/placement.ts:532` 的 `names`、`scripts/client/project-home.ts:183-188` 的 `starts` | 第 1 片 |
| BL-388 | BACKLOG 里**没有这一行**（只在 `slices/w5-06-shell-plugin-rows.md`、`primitive-catalog.ts:24`、`spec.md` W5-06 第 3 片、`EXTENSION-POINTS.md` 里被点名）。事实：页面脚本在构建期把对象标签名单写成字面量（`global-search.ts:33,48`、`placement.ts:13`、`initialization.ts:71`），读的是 `BUILTIN_PLUGIN_CATALOG`；运行时装进项目的插件不进名单 | 第 2 片 |
| BL-542 | 行在 `BACKLOG.md:180`。`renderPluginRail`（`immersive-shell.ts:114`）只读构建期目录；运行时装的插件宿主只给 `plugin_rail: {surface,label}[]`（`web-goals-read.ts:148-153`、`page-view.ts:22-23`），`group`、`creates`、`start`、`icon` 都不读。创作台生成的 Manifest 只有 `stage` 槽的视图（`plugin-builder/installed.ts:35`），今天没有插件会因此丢东西；第三方安装（ac-trust 一组）进来以后才露出来 | 并入第 2 片 |
| BL-430 | BACKLOG 里**没有这一行**（只在 `spec.md` W5-06 第 3 片点名）。Home 插件：`/plugins/<id>` 页有「重试启动 / 启用 / 停用」按钮（`home-plugin-page.ts:49,61`），不可用占位带「查看插件状态」链接（`unavailable-plugin-stage.ts:15`）。项目级：占位只有一句「请检查插件状态后重新打开。」（同文件 `:16`），没有状态也没有重启入口。**重启的宿主路由已有**：`POST /api/plugins/<id>/restart`、`/release-quarantine`（`plugin-route-operations.ts:50-60`，项目与 Home 共用，只给工作台外壳、不给插件页面框架）；缺的是界面。`ac-kernel` 的在途 PR（#1242 R8）只碰 `project-plugins.ts`、`project-plugin-ports.ts`，没做这件事 | 第 3 片 |
| PG-088 | 宿主的 Pages 文件、根路由、构建期装配都已删（#847）。剩 `apps/local-host/src/context-onboarding-service.ts:6` 同时 import `pagesActions` 与 `blocksFromMarkdown`：前者是调用公开动作（`:451,463` 经 `actions.invoke(pagesActions.importDocuments…)`，已是公开动作），后者是 Pages 内部的 Markdown→ProseMirror 转换（`:386-389` 的 `pageBody`）。没有直接开 Pages 的库 | 第 4 片 |
| V-18（PG-088 的核对行） | `plugins/native/pages/src/store.ts:62` 的 `attemptsByDatabase` 仍是模块级 Map（键：库的 realpath），`openPagesStore` 在生产代码里没有调用者（只导出，59 个测试文件在用） | 第 4 片搬到包的 `./testing` 出口，见 §5 的 V-18 结论 |

PG-060 其余在工作台里仍按名字的行，核过，**不归本线**：`renderer.ts:78` 的 Feed、Inbox、Schedule 页面视图模型表（FI 线，PG-034/093）、`immersive-shell.ts:91` 骨干顺序与 `RAIL_EXTEND_PLUGIN_IDS`（PG-074，ac-registry）、`web-request.ts` 的 feed、inbox、alchemist 根路由（FI 线、Alchemist 本轮不删）、Goals 舞台（S11，ac-sc3 的 Goals 计划）。

**边界提醒（要统筹知道）**：`goal-inputs-html.ts:22` 的 `CREATE` 同时是 BL-387（本线）和 PG-076「目标输入的 CREATE」（ac-registry，PG-072～076）。第 1 片关掉这一项，PG-076 的其余三项（助理设置的 SURFACES、Pages 的 searchRow 借用 Feed 的选择器、Todo 的初始化接线）仍归 ac-registry。PG-073（`global-search.ts` 的对象标签名单）的名单本身已由 #1112 读声明，第 2 片只换它的来源（构建期字面量 → 页面下发的目录），不动「选中记录由插件声明」那一半。

## 2. 第 1 片：BL-387 三处手写行改读声明（RAC-600～604）

读法：服务端按本项目显示的插件（`shownPagePlugins(view)`，两入口共用，内部沿用 `shownProjectPlugins`，与 rail 同一份）算出，写进页面；客户端脚本只读页面上的值，不再按插件名写表。

**第 1 片首评修正（#1261，FIRST6393589926；固定父 `b559b21ac`）**：Goal 输入新建入口在 `enabled_plugins` 缺省时传空集合，页面外壳却用既有的 `goals/inbox/feed/artifacts` 缺省集合。两入口改调同一个页面显示小函数：只把外壳现有缺省值移到这一处，再交给现有 `shownProjectPlugins` 处理；不增加名单或缓存。只有字段缺省才使用这份缺省值，显式 `[]` 不补项目插件；个人插件仍按既有规则加入，`hidden_plugins` 继续传给原规则，已隐藏的个人插件不因缺省被放回。显式输入的行为不变，不做本稿第 2～4 片。

当前四个 `creates` 都来自个人插件，错误缺省值在当前声明下恰好产出相同按钮。回归除了按独立字面期望检查真实页面的缺省、显式空、隐藏、显式启用，还临时给缺省集合中的 Goals 视图增加一条测试专用创建声明，再调用真实页面渲染；错误的空缺省必须漏掉该入口而失败，显式空集合则仍不画它。声明在测试结束后恢复，不改生产 Manifest、授权或 Runtime。英文与原有显式输入断言保留；HTML/JSON 转义仍按现有页面路径核对，不以两个 helper 产物相等作证明。

- `goal-inputs-html.ts`：`renderGoalInputsHtml` 多收一份 `creatableKinds(shown)`（`renderer.ts:236` 的调用点有 `view`），按钮由它画，`data-placement-create` 是声明的 `station`，另带 `data-placement-create-title`（声明的 `creates.title`，经 `L()`）；`CREATE` 表删除。
- `placement.ts`：`names` 表删除；默认标题与完成提示里的种类名读按钮上的值。
- `project-home.ts`（客户端）与 `project-home.ts`（服务端 `renderProjectHome`）：服务端把 `homeStarts(shown)` 写成 `data-home-starts`（id、标题、提示、图标），客户端读它；`starts` 数组与「按 rail 里有没有 `data-plugin-id` 过滤」一起删（过滤已由服务端的「本项目显示」代替）。固定追加的「浏览更多工具」是平台自己的，保留。
- 顺序会变：新建入口由手写的文档、演示稿、问卷、数据表变成声明顺序（文档、问卷、数据表、演示稿），2b 的说明里已记。
- 英文：声明里的中文原文仍按中文原文取既有词条（三条起点在 `i18n/gap-en.ts:75-80`；`文档/演示稿/问卷/数据表` 在各插件自己的词典，如 `plugins/native/form/src/en.ts:22`、`ppt/src/en.ts:19`），按钮与起点在服务端走 `L()`；声明里的字符串不再出现在 `L("…")` 字面量里，词条变成「无用键」只被报告，不挡门禁。

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-600 | Goal「输入」区的新建按钮 = 本项目显示的插件的 `creates`（站、标题、声明顺序）；隐藏或没装的插件没有按钮；源码里没有 `CREATE` 表；缺省使用页面既有缺省集合，显式空集合不恢复项目插件 | `tests/shell-declared-placement-rows.test.ts` 的真实页面断言，含受控创建声明的缺省回归；`tests/work-placement-plugins.e2e.test.ts` 的 `[data-placement-create="ppt"]` 实际点击由 TEST/Claude 在统一浏览器批核收，本窄修未运行，不据静态渲染宣称点击通过 |
| RAC-601 | 新建的默认标题与提示卡的种类名来自按钮上的声明值；客户端脚本里没有按站点写的名称表 | `tests/shell-declared-placement-rows.test.ts` 扫描实际 `CLIENT_SCRIPT` 的取值与旧表移除；实际点击、创建和提示卡链路由上述统一浏览器批证明 |
| RAC-602 | 项目首页「起点」= 本项目显示的插件的 `start`（声明顺序、标题、提示、图标）；只有 Goals 一个插件显示时只有它；客户端里没有 `starts` 表；缺省/显式空/隐藏/显式启用与新建入口共用页面规则 | `tests/shell-declared-placement-rows.test.ts` 检查真实页面的 `data-home-starts` 和客户端旧表移除，各场景期望独立写明 |
| RAC-603 | 英文页面里新建按钮和起点显示英文；中文原文没有掉出词典 | `tests/shell-declared-placement-rows.test.ts` 检查实际英文按钮、首页起点数据及其英文词典；首页起点由客户端翻译，最终显示与点击仍交统一浏览器批，本窄修不声明已验；`pnpm health:check` 翻译组作补充 |
| RAC-604 | 页面资源不增（`pnpm page-assets:check`）；增长则按 §7 的页面资源一条写进 PR | `tooling/gates/page-assets.json` |

碰的文件：`apps/workbench/src/{goal-inputs-html,renderer,project-home,shell-page-renderer}.ts`、`scripts/client/{placement,project-home}.ts`、`tests/shell-declared-placement-rows.test.ts`。首评窄修只涉及 `renderer.ts`、`shell-page-renderer.ts`、`plugin-catalog.ts`（或同模块必要小 helper）、该测试及本节，不修改运行时目录、第 2～4 片或浏览器用例断言。BACKLOG 删 BL-387；`slices/w5-06-shell-plugin-rows.md` 的「没做、交给后面」里 BL-387 一条改写为已做。

## 3. 第 2 片：运行时目录（BL-388 + BL-542，RAC-605～611）

目标：外壳读的是「这个项目里运行中的插件的 Manifest」，内置与运行时装的一视同仁（10-18 同等待遇）；内置插件不再因为在构建目录里而有第二条路。

设计（D1、D2 已裁定，见 §6）：

- 宿主在渲染项目页时**每次现算**（不加缓存与失效逻辑），从项目的 Plugin Runtime（内置项目级插件 + Home 级插件 + 运行时装的）取每个运行中安装的 Manifest，只抽外壳要用的声明（`plugin_id`、名称、`ui.views` 的 `slot/group/icon/order/creates/start/accepts_objects/title`），作为 `plugin_directory` 放进 `MolisWorkWebView`，取代 `plugin_rail`（`{surface,label}`）。
- 工作台里读目录的函数（`plugin-catalog.ts` 的 `registryFor`、`placedViews`、`creatableKinds`、`homeStarts`、`objectTabPlugins`，`immersive-shell.ts` 的 rail）改成显式收一份目录参数，构建目录只是调用方在没有运行时的地方（规格板、无 Runtime 的夹具）传进去的默认值，不再作为模块全局被直接读。
- 三处构建期写进脚本的对象标签名单（`global-search.ts:33,48`、`placement.ts:13`、`initialization.ts:71`）改读页面下发的目录：页面带一个 `<script type="application/json" data-plugin-directory>`，客户端启动时读一次。
- **运行时装的插件的名称、视图标题、`creates.title`、`start` 的标题与提示都是不可信文本**：
  - 服务端写进 HTML 时转义（沿用 `escapeHtml`，属性与文本各按其位）。
  - 写进 `<script type="application/json" data-plugin-directory>` 的 JSON 先转成安全形式：`<`、`>`、`&`、U+2028、U+2029 一律写成 `\u003c`、`\u003e`、`\u0026`、`\u2028`、`\u2029`，防 `</script>` 截断。这个序列化只在一处（工作台里一个函数），宿主与测试共用。
  - `icon`、`start.icon` 只认 design-system 图标集里的名字（`registeredIconNames`），不认 URL、SVG 或别的字符串；不认识的退回 `package`（rail）或 `settings`（设置页），与 2b 对设置图标的做法一致。
  - 客户端读目录后，文字只用 `textContent` 或经现有转义函数画，不拼进 `innerHTML`。
- **宿主标记（与 W5-02 B1 约定，字段定义归本片）**：`PluginDirectoryEntry` 上平铺三项可选字段，缺省 = 没有该标记——`personal?: true`（跨项目持有个人数据的插件）、`always_on?: true`（每个项目都开、关不掉）、`companions?: readonly string[]`（一同显示、一同勾选的项目键，宿主算好的完整集合）。来源：宿主在 `apps/local-host/src/plugin-directory.ts` 的 `runningPluginDirectory` 里、内置命中时写，值取自宿主自己的可信登记（B1 把 `BUILTIN_PLUGIN_CATALOG` 换成 `plugin-registry.ts` 后从那里取），不读 Manifest；运行时装的插件、`chosen` 为 false 的条目一律不带。`sanitizePluginDirectory` 只认 `=== true` 的标记，`companions` 逐项过 `KEY`、去重、至多 32 项，`chosen` 为 false 的条目三项都去掉。页面里：只在服务端渲染（选择器勾选、侧栏）用，**不进** `data-plugin-directory` 的 JSON（客户端脚本只读 `id/name/accepts_objects`），所以不增页面资源。宿主的 POST、动作、路由只认 `ProjectPluginRegistry`，页面上的值只用来显示和帮着勾选；「页面改了再提交，宿主不认」的拒绝用例归 B1。本片只定义类型和清洗，不替 B1 取值。验收 RAC-619。
- 停用、卸载、被拒绝的插件不在目录里；撤权后下一次读页面就没有入口（与 S-47 的页面授权拒绝一致，不新增拒绝点）。
- `skills/molis-plugin-dev/ui.md` 里「目前只对随宿主发布的插件生效」的限定（BL-542 要求注明的）撤掉，改成与行为一致。注意在途的 #1253 也改了这个文件（对象标签文档），合入顺序上谁后到谁重基。

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-605 | 页面的 `plugin_directory` 来自项目 Runtime 里运行中安装的 Manifest；内置与运行时装的是同一形状。**不可信文本**：fixture 里加一个插件，名称、视图标题、`creates.title`、`start.title/hint` 里带 `</script><img src=x onerror=…>`、`<`、`&`、U+2028，断言：页面里的 JSON 没有裸 `<`、`>`、`&`、U+2028、U+2029，HTML 里不出现可执行的标签或事件属性，界面显示的是原文；`icon` 写成 URL 或 SVG 的退回默认图标，不进 `href`、`src`、`innerHTML` | 新 `tests/plugin-directory.test.ts`，用一个带 `group/creates/start/accepts_objects` 的 fixture 插件和一个带上述文本的恶意 fixture 装进临时项目；浏览器里「不执行」的一条交 CI |
| RAC-606 | 对象标签名单（搜索、放置卡、侧栏文件）读下发的目录：fixture 插件声明 `accepts_objects` 即可按 id 开标签；脚本里没有构建期写死的名单 | 同上 + 扫描 `CLIENT_SCRIPT` |
| RAC-607 | rail 读运行中 Manifest 的 `group/icon/order`：fixture 的 `group: "make"` 在「写与做」下，不写的在「更多」 | 同上 |
| RAC-608 | `creatableKinds`、`homeStarts` 对运行时装的插件生效（接第 1 片） | 同上 |
| RAC-609 | 停用、卸载、被拒绝的插件，目录里没有；已打开的页面在下一次读时没有入口 | `tests/plugin-directory.test.ts` 保留撤销启用并补 RAC-609-BLOCK-01；`tests/installed-plugin-host.test.ts` 的 RAC-609-UNINSTALL-01 经真实 Host 卸载路径验证，见 §3.2 |
| RAC-610 | `skills/molis-plugin-dev/ui.md` 的说法与行为一致 | `pnpm health:check` 文档引用组 + 文字核对 |
| RAC-619 | 宿主标记：`personal`/`always_on` 只认 `true`，`companions` 逐项过 `KEY`、去重、至多 32 项，`chosen` 为 false 的条目不带；`data-plugin-directory` 里没有这三项 | `tests/plugin-directory.test.ts` |
| RAC-611 | 页面资源：脚本里去掉名单字面量、加一次读取，预期不增；增长按 §7 的页面资源一条 | `pnpm page-assets:check` |

与 `ac-registry` 对齐（统筹 10-25）：它的 B1 把平台事实搬进 `apps/local-host/src/plugin-registry.ts`，工作台需要的平台事实经渲染端口下发——本片的 `plugin_directory` 就是那条端口，它复用、不另开。`web-goals-read.ts`、`plugin-catalog.ts`、`immersive-shell.ts` 两边都会碰：谁后到谁重基，同时在评审就照 `MERGE-QUEUE.md` §1a 同批落。

碰的文件（预估）：`apps/workbench/src/{plugin-catalog,immersive-shell,shell-page-renderer,page-view,primitive-catalog}.ts`、`scripts/client/{global-search,placement,initialization}.ts`、`apps/local-host/src/web-goals-read.ts`（在途 #1242、#1251 也改它）、`skills/molis-plugin-dev/ui.md`。可能要 `pnpm api:update`（若 `MolisWorkWebView` 的 `plugin_rail` 换名属公开导出，核对后定）。删 BL-542；`primitive-catalog.ts:24` 与 `slices/w5-06-shell-plugin-rows.md`、`spec.md`、`EXTENSION-POINTS.md` 里点名 BL-388 的句子改成已做。

### 3.1 FIRST 第 1 项：相同 Manifest id 的目录键与视图归属（FIX1）

状态：已实现并完成本地工程验证，待独立 REVIEW/TEST；唯一源 `ab34bc79b6168cd87c419ce025eb899a5149dbd7`（#1272）。FIRST6394942921 已指出：不同发布者可以使用同一 `plugin_id`，Host 给它们不同外壳键；市场补回未运行的内置项后，`placedViews` 的 `Map<plugin_id, entry>` 会把 Runtime 的视图归到后面的市场键。目标是保留原目录与 UI 语义，修复这些视图的主人，而不是按 Manifest id 认内置信任。

目录先清洗，再按有效条目的外壳键排除市场重复项。各条目分别经现有 `UiViewRegistry` 解释，保留其外壳键、`chosen`、视图与贡献 id，再按原先的 `order → plugin_id → view_id` 顺序组合；不同键不因共享 Manifest id 而互相覆盖，也不删除另一发布者的市场入口。只改 `plugin-catalog.ts` 中目录组合和视图映射、`tests/plugin-directory.test.ts` 与本节；不动 B1 标记/权限/信任、内置 blocked 产品行为、FIRST 第 2～4 项或作者后续片。

- **RAC-605-KEY-01**：真实临时 Plugin Runtime 运行一个与内置项同 Manifest id、不同发布者签名的插件，经 `runningPluginDirectory → pluginDirectoryFor → rail/creates/start/真实页面` 仍用其自己的外壳键，未获内置 `chosen` 或标记；未运行内置项的市场条目保留，标题与入口不串到它。
- **RAC-605-KEY-02**：同 Manifest id 的两个有效不同键逐条保留 navigator/island/side/stage 的归属，视图 id 与默认贡献 id 不改，顺序仍为原排序。`chosen` 条目受 enabled 控制，非 chosen 的运行项保持可见；不同 Manifest id 的合法条目照旧。
- **RAC-605-KEY-03**：只有清洗后有效的 Runtime 条目优先于同键市场项；无效项不能遮掉市场项。已有重复键、文本/图标/slot 清洗及不可信文本转义断言完整保留；本片不改变清洗或信任合同。

先在未改生产代码的 `ab34` 构建上运行真实回归留红，再修复、整体构建后同用例留绿。按 workbench README 跑必跑非浏览器文件，加目录/视图声明相关回归、health 对照 `origin/main`、boundary、页面资源与 fresh-fetch secrets。整机 FIFO、有限份数；不跑 full 或本机浏览器、不碰真实 Home。固定独立候选直交 REVIEW、TEST、PIPE/Root，双核后才接下一题。

本地验证（FIX1，2026-10-25）：离线安装、`ab34` 整体构建通过。未改生产代码时，`red-confirmed.log` 原 8 项通过、新 3 项失败：真实 Runtime 视图变成 `pages/pages/chosen=true`、重复 Manifest id 覆盖条目、无效条目遮掉市场。
修复后整体构建通过，目录文件 11/11；README 18 个必跑文件及目录函数的直接消费方另 31 文件 376/376，合计 **32 个唯一非浏览器文件、387 项通过，0 fail/cancel/skip**。
首次接线错误（测试入口未导出、夹具缺内容站声明）保留原件，不算业务红；首次绿跑 10/11 检出测试 HTML 解码器漏认生产输出的 `&#039;`，补齐单次解码，原断言和不可信文本要求未放宽。
health 对照 `origin/main` 的 merge-base `3817f875`、正式 boundary（70 包无错误）及页面资源检查通过；27 项资源未增长，快照、预算和门禁未改。原件在 `/tmp/molis-plugin-publisher-views-20261025/`；提交后另做 fresh-fetch secrets 并固定双核。
没有 full、浏览器点击或用户验收，其他三条 FIRST 不挡项仍不在本片。

### 3.2 FIRST 第 2 项：blocked 与卸载后的真实目录验收（FIX1）

状态：已补齐并完成本地有限验证，待独立 REVIEW/TEST；独立后继以已双核的 `5a9f2dd8a4244bcaf5a4e0a9ed24404dbc3293c9` 为唯一基线，不改第 1 项冻结候选。原 RAC-609 只跑了 `supervisor.revoke`。现行 `enabledPluginIds` 和目录函数会排除 blocked；正常 Host 卸载由 `installedLifecycle` 先 revoke，再调用 Runtime uninstall。本片补这两条真实路径的证明，不把单独调用底层 Runtime、绕过 Host 撤销启用的操作当作正常卸载入口。

- **RAC-609-BLOCK-01**：在临时项目真实 Runtime 中安装带必需缺失能力的非内置插件，经真实 Supervisor 得到 `blocked / plugin.capability_missing`，安装记录保留且工厂不执行；同一个 Supervisor 的正常插件仍在目录里，受阻插件不出现在 `runningPluginDirectory`、页面目录、rail 或首页起点中。不造状态数组或 mock 目录。
- **RAC-609-UNINSTALL-01**：复用真实已发布插件与 Host 安装入口，经 `installed.lifecycle('uninstall', …)` 分别保留和删除数据；断言实际 Runtime 记录已 uninstalled，下一次 `runningPluginDirectory(installed.platform.supervisor)` 没有该插件，重新安装后目录恢复。原停用、数据保留/删除及重新安装断言保留。

只改 `tests/plugin-directory.test.ts`、`tests/installed-plugin-host.test.ts` 的现有安装夹具用例与本节/本片验收证明；不新增私有源码导入或生产导出。第 1 项 KEY 回归、作者 §4/§5 保持；不改内置 blocked 后市场补回的产品行为、B1 身份/权限/信任，FIRST 第 3/4 项另做。

先核绑定基线源码摘要与已成功的实际 build manifest 一致，再将冻结构建产物复制到独立后继供测试使用；测试/spec 不在该源码摘要的输入内，验证后再核摘要。无生产变更时只跑两份实际涉及文件：`node scripts/run-tests.mjs --jobs 1 --verbose --retries 0 tests/plugin-directory.test.ts tests/installed-plugin-host.test.ts`，核实际通过/失败/跳过；installed Host 的既有 macOS 条件如实保留。再做 scoped diff、health 对 `origin/main` 与提交后 fresh-fetch secrets，不重复 whole build、README18/32文件、full 或浏览器，不碰真实 Home。若揭露生产缺陷，先保精确失败并更新本节，再按源码规则构建与有限回归。

本地验证（FIX1，2026-10-25）：两个完整相关文件单次自然通过，目录 12/12、installed Host 21/21，合计 **2 个唯一文件、33 项，0 fail/cancel/skip/todo，无重试**；两个新验收在 macOS 实际执行。现行生产行为正确，本次没有生产修复或人为制造的业务红。
离线安装、冻结构建复用、测试后源码绑定均通过：生产源码摘要与 `5a9` 原成功构建（2026-10-25T08:28:20.594Z）同为 `3f59a8f81d507aa21d1800ed170b5cbf9c08b8fc92f95878f3380de61b2aa396`，只复制 71 份既有 dist，未新跑构建。官方 FIFO health 对 `origin/main` 的 merge-base `3817f875` 自然退出 0，无门禁/预算/基线改写。原件与交接在 `/tmp/molis-plugin-directory-exclusions-20261025/`；提交后另做 fresh-fetch secrets，固定候选直交独立双核，不重复前片的 32/387 或整合验证。

## 4. 第 3 片：项目级 Runtime 插件的状态与重启入口（BL-430，RAC-612～614）

不新增页面（插件只提供内容、挂在工作台位置，不出整页）。做法：项目级不可用占位（`unavailable-plugin-stage.ts` 的 `scope: "project"` 分支）在原因下面加两样：

- 状态行：监督器说的状态（启动失败、已被阻止）、原因、错误码（读 `supervisor.state()` 的 `status/message/code`，由 `project-plugin-stages.ts` 的 `unavailableStage` 带进 `UnavailablePluginStage`）；监督器记 `running`（实例只是停了或崩溃）或 `plugin.revoked`（用户停用）时不画状态行，免得「暂不可用」下面写着「运行中」或「启动失败」。已卸载的实例仍按监督器报告显示状态行，不提供重启按钮。
- 「重新启动」按钮**只在实例是失败、崩溃或被隔离时显示**：宿主按 `supervisor.state()` 与 `runtime.get(install_id).state` 算出 `restart: "restart" | "release-quarantine" | null` 带进 `UnavailablePluginStage`——监督器 `status: "failed"` 或安装是 `crashed`（运行中崩溃时监督器仍记 `running`，所以两个都看）、`code` 不是 `plugin.revoked`、安装没卸载 → `restart`；安装是 `quarantined` → `release-quarantine`（显示「解除隔离并重启」）；只被停止（`disabled`）的不画；用户停用或撤回同意（`plugin.revoked`，T5 以后同理）、`blocked`、已卸载 → `null`，占位只写状态，不画按钮。路由本身也拒：`supervisor.restart` 对撤销启用的插件不重新启用，返回 409（`plugin.revoked`），卸载的安装 `dispatchRuntimePluginRoute` 不接（落到 404）。按钮（`data-project-plugin-restart` 是操作名，`data-restart-plugin` 是插件 id）由工作台外壳的脚本（`initialization.ts` 里一个委托的点击处理）发 `POST <route>/api/plugins/<plugin_id>/restart`（或 `/release-quarantine`），带控制令牌，成功后重新读页面，失败在占位里写原因。占位仍是宿主画的静态内容，不执行插件客户端、不申请页面授权（S-47 的做法不变）。
- Home 级占位保持「查看插件状态」链接，不动。

**#1274 首评增量（固定来源 `4043ae2ff`）**：点击处理核对实际宿主工作区的 DOM 归属：控件必须是项目不可用占位的直属内容里的按钮，占位必须直接处于宿主的 surface pool、分栏 body 或独占区，且不嵌在另一个插件舞台里；插件内容即使伪造占位、pool 或同名属性，也不能借外壳派出请求。只接受 `restart`、`release-quarantine` 两个操作及非空插件 id。409 的原因按现行路由结果的 `state.message` 显示，经共同请求助手输出纯文字；按钮恢复可操作，成功仍重新读页面。不改服务端生命周期或授权政策。

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-612 | 项目里的 Form 实例失败后，占位显示状态与原因和「重新启动」；点击后实例恢复、占位消失、舞台恢复可用；重启失败时占位写出原因，按钮可再次操作 | `tests/runtime-plugin-http-discovery.test.ts` 的真实 Host 状态断言及浏览器回归：执行生成的外壳脚本，核对项目路由、插件 id 编码、POST、409 原因与重试、成功刷新后的实例与舞台 |
| RAC-613 | 重启只接受外壳（控制令牌）发起；插件内容伪造同名按钮或完整嵌套占位时点击零请求；未知操作零请求。来自插件页面框架的同一请求被拒（沿用 `PLUGIN_MANAGEMENT_OPERATIONS` 的拒绝，不新增拒绝点）。**停用（撤销启用）的插件发 restart 被拒**，不被重新启用，占位也不画按钮；被卸载的、blocked 的同样不画。按钮只在失败或被隔离时画 | 停用被拒：已有断言 `tests/runtime-plugin-http-discovery.test.ts` 的 `formal Runtime HTTP entry discovers a new registered plugin without a Host ID list`（`restart must not re-enable a revoked plugin`，409），本片确认仍绿；页面框架被拒：`tests/security-invariants-home-route-project.test.ts` 与 `tests/plugin-route-operations.test.ts` 已有用例；按钮显隐（失败、隔离、停用、blocked、卸载五种）与浏览器伪造按钮拒绝均在 `tests/runtime-plugin-http-discovery.test.ts`；不新增 S 号 |
| RAC-614 | 中英文占位文案都在词典里；隔离状态显示「解除隔离并重启」 | `tests/runtime-plugin-http-discovery.test.ts`（已验中英文占位）、`pnpm health:check` 翻译组 |

碰的文件：`apps/workbench/src/unavailable-plugin-stage.ts`、`scripts/client/` 里一个按钮处理（挂在现有外壳脚本上，不新增资源）、`apps/local-host/src/project-plugin-stages.ts`、`tests/runtime-plugin-http-discovery.test.ts`。`spec.md` W5-06 第 3 片里「项目状态与重启入口仍属 BL-430」改写为已做。

## 5. 第 4 片：引导走 Pages 的公开动作（PG-088，RAC-615～618）

目标：`context-onboarding-service.ts` 不再 import Pages 的 Markdown→ProseMirror 转换；转换由 Pages 经公开动作提供。

做法（B，统筹已裁定，见 §6 的 D3）：Pages 加一个**只读的转换动作**（`pagesActions.bodyFromMarkdown`，`documents.body_from_markdown`，输入 `{ markdown }`，输出 `{ body: PagesBody }`，权限 `pages:read`），内部用现有 `blocksFromMarkdown`。引导的 `pageBody` 改成调用它（变成 async，`pageParts` 随之变 async 生成器）。可见范围：只给需要的调用者——`audiences: ["user"]`（引导走的是「人在新项目里的动作」），不写 Pages 其他动作默认的 `workflow`、`agent`、`mcp`（`actions.ts` 的 `define` 默认四个都给），所以不进 MCP 工具名单，Agent 与工作流程也调不到；Pages 自己的内容交接处理器不用它（它有自己的转换）。只在这个动作的 `withAction` 覆写受众与 `subject_kinds: []`：转换输入不读取或修改文档，不宣称 `pages_document` 主体，按主体筛选的目录不应列出它；其余动作不变。

**结果体积**（D3 补）：转换动作自己守 Pages 单文档正文上限（`document.ts` 的 `MAX_BODY_CHARS`，1,500,000 编码字符）：转换后超过就返回明确错误 `pages.body_too_large`（`error.ts` 里 `defineErrorCodes("pages", …)` 加一条，kind `invalid`），不截断、不返回超大结果。所以动作结果恒 ≤ 1.5 MB（核对过：Runtime 动作结果没有通用字节上限，所以由动作自己限）；输入 `markdown` 上限 1,000,000 字符（与 Pages 自己的 `markdown` 写入字段同一个数；原稿写 400,000，但引导的摘要页不拆分、整篇转换，摘要加资料来源行可以超过 400,000，收紧会让原来能存的摘要失败。结果体积仍由 `pages.body_too_large` 守住；统筹 2026-10-25 裁：准用 1,000,000）。引导的客户端权限列表加 `pages:read`（`web-onboarding.ts`）。引导照旧按减半重试：转换返回 `pages.body_too_large`，或返回的正文编码后超过引导自己的 `PAGE_BODY_MAX`（1,400,000），都把这一部分从中间减半再转换；部分长度小于 2 时把错误抛出，与现在一致。拆分、「第 k / N 部分」标题、按编码体积减半重试、每部分一个 `request_id` 的幂等，全部留在引导里不变（那是引导的策略，且用户 10-22 定了「来源不设上限」）。

放弃的写法：(A) 给 `importDocuments` 的文档项加 `markdown` 字段——宿主就量不到编码后体积，减半重试要搬进 Pages，同时带着随界面语言的标题后缀，更大；(C) 做一个 Pages 负责拆分的 `importMarkdown`——同样要 Pages 知道标题后缀的语言。

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-615 | 引导源码不 import `blocksFromMarkdown`、不 import ProseMirror；Markdown→正文走 Pages 的公开动作；同一段文字的结果与之前逐字相同（以现有引导用例的正文为准） | `tests/context-onboarding.test.ts`（已有用例读回 Pages 文档）、新增一条 Pages 动作的单测（`tests/pages-body-from-markdown.test.ts`） |
| RAC-616 | 动作合同快照已更新并提交（`pnpm build` 后 `pnpm actions:update`），PR 写对调用方的影响（工作流程、MCP 工具名、Skill）；动作只在需要的调用者可见。实际 user 目录里的 `subject_kinds` 为空，按 `pages_document` 主体筛选不列出它；workflow、agent、mcp 的真实调用均准确报 `actions.forbidden` | `tests/action-contract-snapshot.test.ts`、`tests/pages-body-from-markdown.test.ts` |
| RAC-617 | 长文拆分与重试保持：同一 `request_id` 重试返回同一份文档，超长文本仍按减半拆开。**结果体积**：转换后超过 1,500,000 编码字符的输入，动作返回 `pages.body_too_large`、不返回正文；引导遇到它按减半重试，最终每部分都能存下；部分长度小于 2 仍超限时错误抛出，不无限循环；动作结果恒不超过 1.5 MB。补一条真实链路：不改限额、不模拟拒绝，真实转换动作超限后，引导沿原逻辑减半，读回所有持久化正文，逐项核对完整内容及顺序。动作只对 `user` 受众可见，MCP 工具名单、Agent 与工作流程的动作目录里没有它 | `tests/context-onboarding.test.ts`（保留模拟拒绝的终止边界用例，另加真实动作超限到完整保存用例）、`tests/context-onboarding-documents.test.ts`；`tests/pages-body-from-markdown.test.ts`（25,000 个单字符标题验证真实 `pages.body_too_large`，保留原输入与正文限额断言）；可见范围由 `tests/action-contract-snapshot.test.ts` 与 MCP 工具名单用例钉住 |
| RAC-618 | 门禁数字不增：`check-health-gates --base origin/main`、`boundary:check`；该文件对 Pages 包的点名只剩 `pagesActions`（动作描述符，与 `inbox-actions.ts`、`content-action-providers.ts` 同一做法） | 两条门禁命令 |

碰的文件：`apps/local-host/src/context-onboarding-service.ts`（在途 #1251 改了其中一行 import，重基无冲突）、`plugins/native/pages/src/{actions,manifest}.ts`（动作与 Manifest 声明）、`tests/` 三份、`tooling/gates/actions/`。

**FIRST 后第 1～3 项修复（2026-10-25，Codex）**：从冻结的 `76128186a3fe14b4cf0df944cb35cdd1a0c621a7` 做独立候选，只改这个动作、上述两个直接相关测试、本节与必要动作快照；V-18、§3 的目录、§4 的重启入口与生产拆分逻辑保持。按合同变更流程 §3.6，主体声明变化会列为同版本形状变化；保持 `@1`，原因是身份、提供方、输入输出、权限、受众与执行行为都不变，唯一生产调用方是引导按 `pagesActions.bodyFromMarkdown` 调用，不按主体绑定；该动作从未给 workflow、agent、mcp 发现或调用，没有这些入口的固定引用需要迁移。user 的文档主体列表去掉误列正是本次修正；Skill 和 MCP 工具名无需改变。构建后用 `pnpm actions:update` 生成精确差异，共同 spec 与快照交 Claude carrier 在合成树统一承接。有限验证：Pages README 的非浏览器必跑项、两个直接测试、引导 documents、动作快照与 MCP 目录测试，加边界与健康门禁、推送前密钥扫描；构建走整机 FIFO，不跑 full，不动真实 Home，第 4 项未来独立发包假设不实施。

收口（RAC-619，统筹合入后做，不在片里改）：每片 PR 正文「privileges.md 状态」一节写好 PG-060（余项全部做完后「已做」，带 PR 与 RAC-600～618）和 PG-088（带 PR 与 RAC-615～618）该写的状态；统筹合入后统一改状态列（`SLICE-RULES.md` §2）。

**V-18 结论（统筹 2026-10-25 裁）**：`attemptsByDatabase`（`plugins/native/pages/src/store.ts`）只被同一文件的 `openPagesStore` 用；`openPagesStore` 在生产代码里没有调用者（`plugin.ts` 按实例持有 attempts），测试里有 59 个文件、142 处调用把它当通用的开库入口（开工前核对时误记成 4 份，已更正）。所以不是死代码，但留在主出口上以后生产代码一调用就又是跨实例状态：选「搬到测试出口」——`openPagesStore` 连同 Map 移到新模块 `plugins/native/pages/src/testing.ts`，包 `exports` 加 `./testing`，主出口不再导出；59 个测试文件的 import 用一条可重跑的命令改（命令写在第 4 片 PR 正文里，批头重跑同一条）；边界规则 `plugin-testing-entry-import`（`packages/test-kit/src/boundaries.ts`）拒绝生产源码 import 任何插件的 `./testing`，或插件自己的其他模块 import 它的 `testing` 模块。

## 6. 统筹裁定（2026-10-25，已定）

- **D1**：`plugin_directory` 每次读页面时从 Runtime 现算，不加缓存。
- **D2**：只放外壳要用的那部分声明；运行时装的插件的文字一律当不可信文本，转义与 JSON 序列化的要求写进第 2 片（§3）和 RAC-605。
- **D3**：选 B（只读转换动作）；结果体积与可见范围写进第 4 片（§5）和 RAC-617。输入 `markdown` 上限用 1,000,000（原稿 400,000），理由见 §5「结果体积」，统筹 10-25 裁准。
- **D4**：BACKLOG 不补 BL-388、BL-430 两行；做完把点名它们的句子改写。
- **D5**：目标输入的 `CREATE` 随第 1 片关掉；`ac-registry` 只做 PG-076 余下的三项（统筹已告知）。

## 7. 开工前核对（每片开工前重做一遍）

- `git fetch origin`，`gh pr list --state open`，`gh pr diff <n> --name-only` 查有没有人改同一批文件。本稿写时：#1251（`context-onboarding-service.ts`、`web-goals-read.ts`）、#1242（`web-goals-read.ts`）、#1253（`skills/molis-plugin-dev/ui.md`）、#1064（`plugin-route-operations.ts`）、#1250（`tests/plugin-route-operations.test.ts`）。
- 第 1 片：确认 `view.enabled_plugins` 在 `renderGoalInputsHtml` 的调用点可得；确认 `data-plugin-id` 过滤删掉后，项目首页在「只显示 Goals」时的行为与现在一致。
- 第 2 片：运行时装的插件在项目 Runtime 里的取法（`platform.runtime` 的安装记录与 Manifest）与 Home 级插件的取法（`home-plugins.ts`）；创作台的 `installedPluginStages` 路径（`web-goals-read.ts:150`）是否随目录并成一条，还是保持（创作台本轮不删、可绕过，用户 10-23）。
- 第 3 片：`supervisor.state()` 的 `code` 能否区分「被隔离」；外壳脚本里发 `POST` 的现成封装（`molisWorkRequest`）与控制令牌的取法。
- 第 4 片：V-18——`attemptsByDatabase` 的实际使用者；`openPagesStore` 在生产代码里没有调用者，则这个模块级 Map 只剩测试在用，记结论（统筹 10-25 裁：搬到 `./testing` 出口，见 §5）；Runtime 动作的结果体积是否有上限（转换结果可达 1.4 MB 编码）。
- 页面资源：每片跑 `pnpm page-assets:check`；增长写进 PR，涨超过 10 KB 或新增资源先发统筹。
- 本机只做：`pnpm build`、`check-health-gates --base origin/main`、`boundary:check`、`page-assets:check`、`secrets:check`，以及直接改到的几份非浏览器用例；浏览器用例与全量交 CI 和统筹的批。界面改动只在一次性 Home 的预览里看版面，用完即停、删 Home。
