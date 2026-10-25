# PG-071：插件的页面文字由 Manifest 声明，平台据此派生英文

状态：执行中（2026-10-25）。24 个内置插件把页面文字写进自己的 Manifest（`ui.messages`、`ui.translations`），工作台的英文词典不再 import 任何插件包，翻译门禁改读声明；启动一个插件时平台登记它的文字，内置与安装的插件走同一条路。与 PG-070 同一个 PR，叠在 #1288（PG-056）之上；待统筹集成全量。

验收编号：RAC-750～753。

## 范围

- **合同**：`PluginManifest.ui.messages`（稳定键 → `{ zh, en }`）与 `ui.translations`（中文原文 → 英文）；`PluginRegistration.messages` 删除（内置目录条目不再另登记词典）。
- **形状检查只有一份**：SDK 的 `messageDeclarationProblems`（`packages/plugin-sdk/src/message-declarations.ts`）。键写成 `<主人>.<区域>.<名称>`（小写、2 至 5 段）、必须以插件自己的名字开头、`common` 留给平台的通用词、zh 与 en 的 `{占位符}` 一致、en 里不得有中文、条目与长度有上限。`parsePluginManifest` 在 v2 Manifest 里调用它，作者的工具与宿主拒绝同样的声明；v1 Manifest 带这两个字段被拒。
- **工作台**：`apps/workbench/src/plugin-messages.ts` 是登记表。同一个键被两个插件声明时拒绝后来者，被拒的插件一个词都不登记。`ui.messages`（稳定键，主人在键里）进全页目录；`ui.translations`（中文原文当键，中文原文不属于任何人）任何发布者都收，但只翻译声明它的那个插件自己画的东西，不进全页目录：它框架里的页面脚本拿到「自己的词 + 全页目录」（`MOLIS_WORK_PLUGIN_WORDS[plugin_id]`，宿主的句子优先），它的贡献由 `UiHost` 的 `drawingAs` 挂钩在画的那一刻套上自己的词（`i18n.ts` 的 `withPluginWords`，同步、画完即退出）。所以同一句中文在宿主页面和别的插件里不受它影响。优先级：`ui.messages` > 宿主 `EN` > 声明它的插件自己的 `ui.translations`。`i18n.ts` 在加载时登记内置目录里的插件；页面词典（`catalogJson`、`clientI18nScript`）只含已登记插件的稳定键。
- **宿主自己画的**：宿主的页面画的、由内置插件的 Manifest 和代码交出的数据文字（动作与视图的标题、删除项目时列出的数据说明、schema 里的词），以及宿主文件或别的内置插件借用的词，英文在宿主词典 `apps/workbench/src/i18n/plugin-declared-en.ts`（520 条，值取改造前实际生效的那一句）。找法：对每个有框架的内置插件，它的词典里凡是在服务端代码里以字面量出现但不是翻译调用的（数据）、或根本没有字面量的（拼出来的），都算宿主画的。外壳自己画的内置插件（没有框架的客户端，或设置页在页面里跑：Goals、Inbox、Feed、Shelf、Artifacts）没有框架可限定，它们声明的词就是页面的词，启动时由内置目录的 Manifest 派生（`i18n.ts` 的 `SHELL_DRAWN_EN`，宿主 `EN` 仍优先）；任何别的插件一律在框架里，所以这一类只可能是内置的、第三方加不进来。
- **宿主**：`plugin-platform.ts` 的启动观察者在插件启动时登记它的文字（内置与安装的写法相同）。
- **词典搬进插件包**：24 个插件的 `src/manifest.ts` 声明自己的文字，Coding、Diff、Files、Git、Text Stats 新增 `src/en.ts`；Goals 的英文词典由 Manifest 引用，不再写死语言（`GOALS_*_EN` 与新增的 `messages.ts`）。`apps/workbench/src/i18n/en.ts` 删掉全部对插件包的 import 与展开。
- **翻译门禁**（`scripts/gates/translations.mjs`）：稳定键词典的登记只认「内置目录里插件的 Manifest `ui.messages`」，不再写死 `MESSAGES_ROOT`；「无人下发的词典」以各插件 Manifest 文件为起点判断；`tests/translation-check.test.ts` 的夹具同步。只许持平或更严：中文原文无英文、词典没并进 `EN` 照旧直接失败；中文键冲突 160 → 136。
- **英文目录不变**：改造前后逐键比对，英文目录除 Goals 新增的 2 个引文键外完全相同；26 条因优先级而落选的英文已对齐到原来生效的那一句。

## 保留的机制

- `ui.translations`（中文原文 → 英文）是过渡段：内置插件的页面代码仍以中文原文为键，直到逐个迁到稳定键（`apps/workbench/README.md`「界面文字」）。任何发布者都可以声明，但只翻译声明它的插件自己画的东西，所以第三方不会靠它改写宿主或别的插件的任何一句话（用户 2026-10-25 定：内置与第三方同一种方式加载）。
- 登记表是进程内的、不随插件撤权或停用而注销：同一个键始终属于同一个插件，词典不含密钥与事实，留着的代价只是页面词典多几行。

## 已知限制

- 宿主自己画的第三方文字（它的动作标题、动作返回的整句）宿主不读它的 `ui.translations`：中文原文不属于任何人，宿主不能替一个插件决定整页的一句话。要在宿主画的地方有英文，用 `ui.messages` 的稳定键，或让动作按语言返回。
- 第三方插件的独立查看页（`plugin-document-shell`）不加载页面脚本，仍是中文；框架里的页面与贡献才有英文。
- 宿主按非字面量的键查词（`L(变量)`）时，不再顺带查到框架内插件的词；扫描能找到的字面量用法与数据文字已逐条核对（宿主词典 520 条即来自这一步），非字面量的键由单元测试（含删除项目的数据说明、创建入口的标题）兜底，剩下的交浏览器用例。

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
