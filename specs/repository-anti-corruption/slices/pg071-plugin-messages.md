# PG-071：插件的页面文字由 Manifest 声明，平台据此派生英文

状态：执行中（2026-10-25）。24 个内置插件把页面文字写进自己的 Manifest（`ui.messages`、`ui.translations`），工作台的英文词典不再 import 任何插件包，翻译门禁改读声明；启动一个插件时平台登记它的文字，内置与安装的插件走同一条路。与 PG-070 同一个 PR，叠在 #1288（PG-056）之上；待统筹集成全量。

验收编号：RAC-750～753。

## 范围

- **合同**：`PluginManifest.ui.messages`（稳定键 → `{ zh, en }`）与 `ui.translations`（中文原文 → 英文）；`PluginRegistration.messages` 删除（内置目录条目不再另登记词典）。
- **形状检查只有一份**：SDK 的 `messageDeclarationProblems`（`packages/plugin-sdk/src/message-declarations.ts`）。键写成 `<主人>.<区域>.<名称>`（小写、2 至 5 段）、必须以插件自己的名字开头、`common` 留给平台的通用词、zh 与 en 的 `{占位符}` 一致、en 里不得有中文、条目与长度有上限。`parsePluginManifest` 在 v2 Manifest 里调用它，作者的工具与宿主拒绝同样的声明；v1 Manifest 带这两个字段被拒。
- **工作台**：`apps/workbench/src/plugin-messages.ts` 是登记表。同一个键被两个插件声明时拒绝后来者，被拒的插件一个词都不登记；`ui.translations` 只收宿主自己构建的插件（`shipsWithHost`），安装的插件声明了也不读。`i18n.ts` 在加载时登记内置目录里的插件；页面词典（`catalogJson`、`clientI18nScript`）只含已登记的插件。优先级：`ui.messages` > 宿主的 `EN` > 插件的 `ui.translations`。
- **宿主**：`plugin-platform.ts` 的启动观察者在插件启动时登记它的文字（内置与安装的写法相同）。
- **词典搬进插件包**：24 个插件的 `src/manifest.ts` 声明自己的文字，Coding、Diff、Files、Git、Text Stats 新增 `src/en.ts`；Goals 的英文词典由 Manifest 引用，不再写死语言（`GOALS_*_EN` 与新增的 `messages.ts`）。`apps/workbench/src/i18n/en.ts` 删掉全部对插件包的 import 与展开。
- **翻译门禁**（`scripts/gates/translations.mjs`）：稳定键词典的登记只认「内置目录里插件的 Manifest `ui.messages`」，不再写死 `MESSAGES_ROOT`；「无人下发的词典」以各插件 Manifest 文件为起点判断；`tests/translation-check.test.ts` 的夹具同步。只许持平或更严：中文原文无英文、词典没并进 `EN` 照旧直接失败；中文键冲突 160 → 136。
- **英文目录不变**：改造前后逐键比对，英文目录除 Goals 新增的 2 个引文键外完全相同；26 条因优先级而落选的英文已对齐到原来生效的那一句。

## 保留的机制

- `ui.translations`（中文原文 → 英文）是过渡段：内置插件的页面代码仍以中文原文为键，直到逐个迁到稳定键（`apps/workbench/README.md`「界面文字」）。只对宿主自己构建的插件生效，安装的插件不读，所以第三方不会靠它改写宿主的任何一句话。
- 登记表是进程内的、不随插件撤权或停用而注销：同一个键始终属于同一个插件，词典不含密钥与事实，留着的代价只是页面词典多几行。

## 已知限制

- 第三方插件的动作返回的整句文字（句子形式的输出）仍无法被翻译：它没有稳定键，宿主也不读第三方的中文原文翻译。要给英文，插件按语言返回，或改用稳定键的页面文字。

## 对插件和调用方的影响

- 新增 Manifest 字段 `ui.messages`、`ui.translations`（v2）；删除 `PluginRegistration.messages`（只有内置目录用过）。公开 API 快照：`contracts/platform/plugin`、`plugin-registration`、`plugin-sdk/index` 已刷新。
- 不改动作、路由、库结构；页面显示的英文不变。

## 验收

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-750 | 共用的声明检查接受插件自己的稳定键，拒绝中文键、他人的键、`common`、占位符不一致、en 里的中文、空值与超长 | `tests/plugin-messages.test.ts` |
| RAC-751 | 读 Manifest 时坏声明被拒（含 v1 Manifest 带这两个字段），安装不会带进坏词典 | 同上 |
| RAC-752 | 内置与安装的插件用同一条路登记；只有宿主自己构建的插件能翻译中文原文，且不能改写宿主已有的句子；被别的插件占用的键被拒，被拒的插件一个词都不登记 | 同上 |
| RAC-753 | 页面词典只含已登记的插件，没登记的不贡献任何词；启动插件时登记它声明的文字 | 同上，`tests/i18n.test.ts` |
