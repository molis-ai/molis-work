# PG-071：插件的页面文字由 Manifest 声明，平台据此派生英文

状态：执行中（2026-10-25）。24 个内置插件把页面文字写进自己的 Manifest（`ui.messages`、`ui.translations`），工作台的英文词典不再 import 任何插件包，翻译门禁改读声明；启动一个插件时平台登记它的文字，内置与安装的插件走同一条路。与 PG-070 同一个 PR，叠在 #1288（PG-056）之上；待统筹集成全量。

验收编号：RAC-750～754、RAC-770～778。

## 范围

- **合同**：`PluginManifest.ui.messages`（稳定键 → `{ zh, en }`）与 `ui.translations`（中文原文 → 英文）；`PluginRegistration.messages` 删除（内置目录条目不再另登记词典）。
- **形状检查只有一份**：SDK 的 `messageDeclarationProblems`（`packages/plugin-sdk/src/message-declarations.ts`）。键写成 `<主人>.<区域>.<名称>`（小写、2 至 5 段）、必须以插件自己的名字开头、`common` 留给平台的通用词、zh 与 en 的 `{占位符}` 一致、en 里不得有中文、条目与长度有上限。`parsePluginManifest` 在 v2 Manifest 里调用它，作者的工具与宿主拒绝同样的声明；v1 Manifest 带这两个字段被拒。
- **工作台**：`apps/workbench/src/plugin-messages.ts` 是登记表。同一个键被两个插件声明时拒绝后来者，被拒的插件一个词都不登记。`ui.messages`（稳定键，主人在键里）进全页目录；`ui.translations`（中文原文当键，中文原文不属于任何人）任何发布者都收，但只翻译声明它的那个插件自己画的东西，不进全页目录：它框架里的页面脚本拿到「自己的词 + 全页目录」（`MOLIS_WORK_PLUGIN_WORDS[plugin_id]`，宿主的句子优先），它的贡献由 `UiHost` 的 `drawingAs` 挂钩在画的那一刻套上自己的词（`i18n.ts` 的 `withPluginWords`，同步、画完即退出）。所以同一句中文在宿主页面和别的插件里不受它影响。优先级：`ui.messages` > 宿主 `EN` > 声明它的插件自己的 `ui.translations`。`i18n.ts` 在加载时登记内置目录里的插件；页面词典（`catalogJson`、`clientI18nScript`）只含已登记插件的稳定键。
- **宿主画的插件文字**（统筹评审 2026-10-25 定：用插件自己的词，不留表）：宿主画一段插件交来的文字时，用该插件自己的 `ui.translations` 翻译，画法同贡献——`withPluginWords(插件, …)` 包住画的那一处，画完即退出。所以第三方也有英文，而且只限它自己交的文字：动作的标题、描述与输入说明（按提供方：能力库、对外接入）、侧栏标签与插件市场的卡片文案、侧栏摘要（按声明它们的插件）、删除项目对话框里的数据说明（按所有者：`ProjectDeletedOwner.words_of`，`ownerLabel` 翻译）、创建入口与首页起点的标题（按声明它们的插件）。外壳画的 Goals、Feed（以及 Inbox、Schedule、Artifacts 的贡献）也一样：渲染器收的 `L` 是套着自己词的版本（`renderer.ts` 的 `wordsOf`），Goals 与 Feed 的页面脚本拿 `LFor(插件 id)`（浏览器里 `LF(插件 id, 键)` 的绑定版本：稳定键与页面的词在先，其次该插件自己的词）。**没有给内置插件开的词表**：`SHELL_DRAWN_EN` 与按插件整理的 `plugin-declared-en.ts` 已删。宿主词典里留下的只有宿主自己的文件、或几个插件共用的句子（`apps/workbench/src/i18n/shared-words-en.ts` 的 `SHARED_WORDS_EN`，并进宿主 `EN`），其余各插件独有的句子留在它自己的 `ui.translations` 里。
- **宿主**：`plugin-platform.ts` 的启动观察者在插件启动时登记它的文字（内置与安装的写法相同）。
- **词典搬进插件包**：24 个插件的 `src/manifest.ts` 声明自己的文字，Coding、Diff、Files、Git、Text Stats 新增 `src/en.ts`；Goals 的英文词典由 Manifest 引用，不再写死语言（`GOALS_*_EN` 与新增的 `messages.ts`）。`apps/workbench/src/i18n/en.ts` 删掉全部对插件包的 import 与展开。
- **翻译门禁**（`scripts/gates/translations.mjs`）：稳定键词典的登记只认「内置目录里插件的 Manifest `ui.messages`」，不再写死 `MESSAGES_ROOT`；「无人下发的词典」以各插件 Manifest 文件为起点判断；`tests/translation-check.test.ts` 的夹具同步。只许持平或更严：中文原文无英文、词典没并进 `EN` 照旧直接失败；中文键冲突 160 → 136。
- **英文目录不变**：改造前后逐键比对，英文目录除 Goals 新增的 2 个引文键外完全相同；26 条因优先级而落选的英文已对齐到原来生效的那一句。

## 保留的机制

- `ui.translations`（中文原文 → 英文）是过渡段：内置插件的页面代码仍以中文原文为键，直到逐个迁到稳定键（`apps/workbench/README.md`「界面文字」）。任何发布者都可以声明，但只翻译声明它的插件自己画的东西，所以第三方不会靠它改写宿主或别的插件的任何一句话（用户 2026-10-25 定：内置与第三方同一种方式加载）。
- 登记表是进程内的、不随插件撤权或停用而注销：同一个键始终属于同一个插件，词典不含密钥与事实，留着的代价只是页面词典多几行。

## 已知限制

- 宿主只在「这是某个插件交来的文字」的地方套它的词：动作返回的整句（输出数据）、历史调用记录里存下的标题，宿主不翻译，要英文用 `ui.messages` 的稳定键或让动作按语言返回。宿主在页面上自己拼出的句子仍用宿主的词。
- 第三方插件的独立查看页（`plugin-document-shell`）不加载页面脚本，仍是中文；框架里的页面与贡献才有英文。
- 宿主按非字面量的键查词（`L(变量)`）时，只有套了该插件的词才查得到它的词；已知的几处（删除项目的数据说明、创建入口与首页起点的标题、市场卡片与侧栏摘要、侧栏标签、对外接入与能力库的动作文字）已按所有者包住，由单元测试（RAC-770～774，`tests/plugin-words-owned.test.ts`，另有 `tests/project-deletion-owners.test.ts`、`tests/shell-declared-placement-rows.test.ts`）兜底，剩下的交浏览器用例。

## 对插件和调用方的影响

- 新增 Manifest 字段 `ui.messages`、`ui.translations`（v2）；删除 `PluginRegistration.messages`（只有内置目录用过）。公开 API 快照：`contracts/platform/plugin`、`plugin-registration`、`plugin-sdk/index` 已刷新。
- 不改动作、路由、库结构；页面显示的英文不变。

## 验收

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-750 | 共用的声明检查接受插件自己的稳定键，拒绝中文键、他人的键、`common`、占位符不一致、en 里的中文、空值与超长 | `tests/plugin-messages.test.ts` |
| RAC-751 | 读 Manifest 时坏声明被拒（含 v1 Manifest 带这两个字段），安装不会带进坏词典 | 同上 |
| RAC-752 | 内置与安装的插件用同一条路登记；任何发布者的 `ui.translations` 只翻译它自己的框架和贡献、不改宿主已有的句子；被别的插件占用的键被拒，被拒的插件一个词都不登记 | 同上 |
| RAC-753 | 页面词典只含已登记插件的稳定键，没登记的不贡献任何词；`ui.translations` 不进全页目录，按插件放在 `MOLIS_WORK_PLUGIN_WORDS`；启动插件时登记它声明的文字 | 同上，`tests/i18n.test.ts` |
| RAC-754 | 第三方插件的词典生效于它自己的贡献，对别的插件同一句中文不生效；宿主 `EN` 优先；贡献画完后它的词不留在作用域里 | `tests/plugin-messages.test.ts` |
| RAC-770 | 宿主画第三方插件的删除项目数据说明时，用该插件自己的英文；宿主自己对同一句的使用、没有声明所有者的条目、别的插件的词典都不受影响 | `tests/plugin-words-owned.test.ts` |
| RAC-771 | 第三方插件的动作标题与描述在宿主画的地方（对外接入）是它自己的英文；同一句在别的插件的行里是那个插件的英文；不声明插件的行不取任何词典 | 同上 |
| RAC-772 | 一个插件的词典改不到宿主或别的插件画出的一句话；宿主已有的英文优先；撤销登记后词典即失效 | 同上 |
| RAC-773 | 页面把每个插件自己的词典交给它的框架和它的脚本（`LF`、`LFor`），不交别人的；中文页显示原文；占位符照常替换 | 同上 |
| RAC-774 | 稳定键仍是全页的词，中文原文键的翻译只属于声明它的插件 | 同上 |
| RAC-775 | 翻译门禁认 `LF(插件 id, 文字)` 与绑定到它的包装（`FL`、`LFor` 的结果）为翻译调用，键是文字、插件 id 不是键；没有英文的中文原文被报出来，只调用 `LF(` 的脚本模板也被解析 | `tests/translation-check.test.ts` |
| RAC-776 | 成果库按类型的声明方给出类型名的英文（数据集的「数据表」在英文页是 Dataset），Artifacts 自己的句子用 Artifacts 的英文；中文页显示原文 | `tests/artifact-english.test.ts` |
| RAC-777 | 新项目引导起草待办时的三种类别名（要你处理、你的承诺、在等别人）在宿主词典里有英文，不靠 Todo 的词 | `tests/plugin-words-owned.test.ts` |
| RAC-778 | 在宿主页面里运行的插件脚本（Goals 的规划与项目规则、Artifacts 的四段脚本）用自己插件的翻译器，不用全页的 `L` | 同上 |
