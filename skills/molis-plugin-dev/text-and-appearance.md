# 界面文字、语言与外观

插件只写**说什么**；用哪种语言、什么颜色和字体，由平台从上下文给。业务代码只碰两个工具 `t`、`format`（SDK 的 `/ui` 子路径）和语义 CSS 变量：不读语言，不判断皮肤，不为它们改函数签名。

内置、开发预览和签名安装都用同一份词包合同。先用 `molis-work plugin validate` 检查，再用 `molis-work plugin dev` 预览；集成插件在开发入口可选语言。正式工作台切换时，已打开的页面原地换字。

## 文字分四类

| 类 | 例子 | 怎么写 |
| --- | --- | --- |
| 界面短句 | 标题、按钮、提示、空态 | `t("<主人>.<位置>.<元素>", 参数)`，日期和数字用 `format` |
| 存下来以后才显示的 | 同步结果、通知、错误记录 | 存键和参数（不存译好的句子），显示时再 `t` |
| 长内容 | Skill、提示词、方法 | 不拆进词表 |
| 用户自己的内容 | 项目名、正文、已有对话 | 不翻译，原样当参数传进句子 |

## 怎么写界面文案

界面文案围绕一个目标：**让用户看清现状、理解边界、顺手做下一步**（对照 [`PRODUCT.md`](../../PRODUCT.md)「直接、具体、简洁、专业」与 [`DESIGN.md`](../../DESIGN.md) 三问）。官方插件、创作台生成插件、工作台外壳与宿主报错遵守同一套标准；概念用词以 [`docs/system/GLOSSARY.md`](../../docs/system/GLOSSARY.md) 为准。

### 四条标尺

1. **准（贴合功能真实边界）**：只读就写「只读」，导入快照就写「导入时的版本，不随原文件更新」，结果未知就写「结果未确认，请先核对」；不夸大自动化，也不把内部实现词原样抛给用户。
2. **短（去掉无信息量的字）**：删掉「您可以在 / 请点击 / 当前尚未 / 暂无任何 / 正在为您 / 进行…操作 / 本页面用于 / 以便于」；上层标题已交代的主语下层不再重复；安全边界压成半句结果（写「原文件不变」，不连写两句免责声明）。
3. **稳（克制专业的工具语调）**：不用口语俚语（「连看都不看」「够不到」「叫醒」），不用后台官腔（「暂无相关记录」「执行变更操作」），也不用空泛营销词（「赋能」「范式」「智能协同」「编排中枢」）。
4. **引（空白与阻断必给出口）**：遇到空态、缺配置、无权限或失败，统一按 **「现状或原因 → 下一步动作」** 写清出口；写入中断额外交代已填内容仍在、先核对再决定是否重试。

### 禁用内部黑话对照

不要向终端用户暴露架构与存储术语，统一换成用户能感知的对象与结果：

| 不要写 | 写成 |
| --- | --- |
| 宿主、宿主设置、宿主重启 | `Molis Work`、系统，或直接写「设置 › …」 |
| 超出宿主执行边界 | 超出本轮允许范围 |
| 权威状态、权威记录、投影 | 当前记录、正式记录、列表或预览（直接指对象） |
| 幂等运行记录、游标、世代 | 共用运行记录（不重复执行）、同步进度、版本 |
| 回执（除专有词「读到回执」外） | 执行结果、操作记录 |
| 已落盘、终端通道、对象挂载位 | 已保存、终端连接、关联内容区 |
| 工作区、工作目录（指项目关联文件夹时） | 项目目录、输入目录、输出目录（Git 内部仍称工作树、暂存区） |
| `Functions`、动作库、消费场景、`Connectors` | 判断规则、能力库、用途、「设置 › 服务连接」 |
| 原生 Agent、本机 Agent、本地 Agent、终端 Agent | 指工具或环境写具体产品名或「本地 Runtime」；指里面执行任务的工作者写「外部 Agent」 |
| 方法（指 Skill 时） | 中文写「技能」、英文写 `Skill` / `Skills`；规划方法、研究方法、连接方式写全名 |

### 九类界面元素的写法

| 元素 | 公式 | 字数与标点 | 反例 → 正例 |
| --- | --- | --- | --- |
| 页面与分组标题 | 对象名或动宾短语，不重复标签栏已有的插件名 | 中文 2–8 字，**不加句号**；英文 Sentence case | `项目的工作目录配置管理` → `输入与输出` |
| 页面引言与设置说明 | 管什么 + 生效范围或关键边界 | 中文 12–36 字；单句短说明（≤20 字）不加句号，两句及以上正常句号 | `本页面用于管理…改去它自己的页面。` → `按用途汇总技能、工具、MCP 与角色。技能可直接开关，其余项前往对应设置修改。` |
| 按钮、菜单项、操作卡 | **精准动词 + 对象**（同屏对象唯一时只写动词） | 中文 2–6 字，**不加句号**；英文 Sentence case；禁用泛词「确定 / 提交 / 去处理」 | `请点击刷新重试` / `Create Goal` / `确定` → `重新加载` / `Create goal` / `删除来源` |
| 状态标签 | 对齐 [`STATE-VOCABULARY.md`](../../docs/platform/STATE-VOCABULARY.md) 21 家族短词 | 中文 2–5 字，**不加标点** | `还没有叫醒过` → `未运行`；`等待中` → `等你处理` |
| 空状态（`mw-empty`） | 标题：`还没有<对象>`；说明：一句来源或用法；次按钮：动词 + 对象 | 标题 ≤10 字**无句号**，说明 ≤28 字；不用「暂无…」「无数据」 | `暂无订阅。` → 标题 `还没有订阅` · 说明 `开通或分配套餐后显示在这里` |
| 确认对话框（`mw-dialog`） | 标题：`动词 +「{name}」？`；正文：不可逆影响 + 保留项；按钮：左 `取消`、右具体动词 | 正文不超过两句，不写空话「是否确认执行此操作」 | `确认按当前表单变更订阅？此操作不涉及付款。` → 标题 `保存订阅变更？` · 正文 `立即生效，本次变更不产生费用。` |
| 错误与阻断提示 | 什么没成（含直接原因）+ 输入是否保留 + 下一步动作 | 不露内部字段名（如 `review_id`、`cursor`） | `Functions 请求失败` → `判断规则请求失败，请稍后重试` |
| 权限理由（`permissions.reason`） | `读取/修改 <具体对象>，用于 <用户可感知目的>` | 单行无句号，≤40 字 | `按调用者授权使用能力` → `读取并检索已导入的本机知识条目` |
| 动作目录（`title` / `description`） | 标题写动宾短语；描述写做什么、改不改数据、关键边界 | 标题 3–10 字无句号；描述不写接口调参语法（如 `传入 {}`） | `传入 {} 读取全部服务的连接方式…` → `查看所有可接入服务及其认证方式与连接状态` |

### 符号与中英文排版

- **引号与路径**：中文词包引用界面按钮、菜单、视图或对象名称统一用直角引号 `「…」`（既清晰，也天然避开词包禁用的裸 `"` 与 `'`），英文词包用弯引号 `“…"`；菜单与层级路径统一用 ` › `（两端各留一个半角空格，如 `「设置 › 服务连接」`，不混用 `→`、`/`、`·`）。
- **英文大小写与术语**：英文标题、按钮、表头、状态词一律采用 **Sentence case**（仅句首词与专有名词如 `Goal`、`Inbox`、`Feed`、`Pages`、`Forms`、`Dataset`、`PPT`、`Shelf`、`Jelly`、`Cognia`、`Coding`、`Git`、`Diff`、`Schedule`、`Work Brief`、`Runtime`、`Agent`、`Skill`、`Character`、`MCP`、`Molis Work` 大写）；一轮统一写 `turn`（不写 `round`），子任务统一写 `sub-task`（不写 `subtask`）。
- **巡检命令**：改完词包先跑 `node scripts/gates/translations.mjs --missing` 查缺漏与参数一致性，再跑 `node scripts/audit-ui-copy.mjs` 自查黑话、旧术语、标点与大小写。

## 写一个带两种语言的插件

`molis-work plugin create` 生成的样例已经带 `ui.locales`、`locales/en.json` 和 `locales/zh.json`。先按随包手册准备安装版 CLI 和 contracts、SDK 两包。从空目录手写时，照下面四步和文末的完整例子。[安装版开发入口](authoring.md#安装版开发入口) · [中英文最小例子](#最小的完整例子)

有源码树时，可以对照其中同一写法的样例。[源码树样例](../../examples/plugin-sample/)

**1. Manifest 声明语言。** 在 `ui` 下加 `locales`：

```json
"ui": {
  "contributions": ["io.molis.work.demo.greeting.main"],
  "locales": { "default": "en", "available": ["en", "zh"] }
}
```

- 每种语言一个文件 `locales/<语言>.json`，路径按约定推导。`molis-work plugin pack` 自动带上。用 npm 或 pnpm 发布项目时，把 `locales` 放进 `package.json` 的 `files`。[打包与签名](authoring.md#打包与签名)
- 语言标记写 `zh`、`en`、`zh-Hant`、`pt-BR` 这样的；`default` 在 `available` 里，不重复，最多 32 种；`ui.locales` 只有这两个键。
- 不接受旧的 `ui.messages` 或 `ui.translations`，两者单独出现也不接受。
- Home 库的项目清理说明（`databases.home.project_rows.label`）也可引用本插件的键。默认语言必须有这句；它是非空单行、最多 200 字符，无参数与复数。要保留原文时写字符串或 `{ literal }`。
- `plugin_id` 的最后一段就是键的第一段（上例是 `greeting`），所以它要以小写字母或数字开头、只含小写字母、数字和连字符，不是 `common`（[elements.md](elements.md#身份)）。也别用 `workbench`：平台自己的词用这个名字，开发路径会报 `ui.text_owner_conflict`。

**2. 每种语言一个文件。** `locales/en.json`：

```json
{
  "format_version": 1,
  "owner": "io.molis.work.demo.greeting",
  "locale": "en",
  "messages": {
    "greeting.main.title": "Greeting",
    "greeting.main.hello": "Hello, {name}",
    "greeting.main.unread": { "plural_arg": "count", "forms": { "one": "{count} new note", "other": "{count} new notes" } },
    "greeting.main.level": "Peak level {level} m, {at}"
  }
}
```

`locales/zh.json`：

```json
{
  "format_version": 1,
  "owner": "io.molis.work.demo.greeting",
  "locale": "zh",
  "messages": {
    "greeting.main.title": "问候",
    "greeting.main.hello": "你好，{name}",
    "greeting.main.unread": "{count} 条新笔记",
    "greeting.main.level": "{at} 最高水位 {level} 米"
  }
}
```

中文不分单复数，`unread` 写一句就够；`level` 的参数顺序可以和英文不同，名字要一样。

- `owner` 是完整的 `plugin_id`，`locale` 和文件名相同。
- 键是 `<plugin_id 最后一段>.<位置>.<元素>`：小写，2 到 5 段，最长 120 个字符。键说意思，不抄措辞；整句一个键，不拼半句（不写 `t("a") + "：" + title`）。
- 参数写 `{name}`，各语言用同一组参数名。跟着数变的句子写 `{ "plural_arg": "count", "forms": { … } }`，每种形式写整句，并且写出 `{count}`；旧的 `{count|a|b}` 不收。
- **文字里不许有 `<`、`>`、`&`、`"`、`'`。** 这样 `t` 的结果才能直接拼进 HTML。换成 `’`、`“ ”`、`and`、`›`；真要带这些字符的（人名、标题），写成参数。

**3. 代码里用 `t`。**

```js
import { t, format, numberArg, dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";

const team = "Tom's R&D team";   // 用户的字带 ' 和 &：当参数传
render() {
  return `<h2>${t("greeting.main.title")}</h2>`
    + `<p title="${t("greeting.main.hello", { name: team })}">${t("greeting.main.hello", { name: team })}</p>`
    + `<p>${t("greeting.main.unread", { count: 3 })}</p>`
    + `<p>${t("greeting.main.level", { level: numberArg(12345.678, "decimal"), at: dateArg("2026-11-08T21:15:00Z", "datetime") })}</p>`
    + `<time>${format.date("2026-11-08", "date")}</time>`;
}
```

- **拼进 HTML（文本和属性）写 `t`。** 它先用原始参数算出整句，再把整句转义一次：上面那句英文出来是 `Hello, Tom&#039;s R&amp;D team`，浏览器显示成 `Hello, Tom's R&D team`，不会转义两次。
- **交给自己会转义的地方写 `t.text`**：`textContent`、`el.title =`、`new Option(…)`、`renderButton({ label })` 这类。写成 `t` 会显示成 `Tom&#039;s`。反过来，**`t.text` 绝不能拼进 HTML**，那是注入。不带字符串参数的句子两种写法结果相同。
- **句子里的数和日期，当 `t` 的参数传：** 普通数字照原样，不分组（`{ count: 2026 }` 显示 `2026`，`numberArg(n)` 不带样式也一样）；要分组写 `numberArg(n, "decimal")`，另有 `percent`、`compact`。日期写 `dateArg(at, style)`。这两个只是值：画页面时按那句话的语言排版，和整句一起转义一次；它们也能存进键和参数里，在没有页面的地方建（下一节）。
- **单独一个数或日期放进 HTML，写 `format.number(n, style?)`、`format.date(at, style)`：** 调用的时候就按当前语言排好并转义，没有页面的地方调会抛 `ui.text_no_context`。`format.number` 不写样式按 `decimal`，**会分组**，和 `numberArg(n)` 不一样。不要把 `format.*` 的结果再当 `t` 的参数：它已经是转义过的 HTML，再进 `t` 就转义第二次；今天数字和日期排出来没有那五个字符，所以看不出来，但写法是错的。
- **日期：** 样式是 `date`、`time`、`datetime`、`relative`、`weekday`、`month-day` 等，`at` 写 ISO 8601。需要显示到秒时用 `time-with-seconds`（时分秒）或 `datetime-with-seconds`（日期和时分秒）。带时间的（`2026-11-08T21:15:00Z`）可指定 IANA 时区，如 `dateArg(at, "datetime", { time_zone: "America/Los_Angeles" })`；不指定按运行这段代码的机器本地时区显示，`dev` 里就是你这台机器：UTC 21:15 在东八区显示成次日 05:15。只有日期的（`2026-11-08`）照写的那天显示，不随时区挪，`time`、`datetime` 样式对它只显示日期。坏日期不抛，显示原文。
- **代码里的参数名要和语言文件里的一样。** 文件写 `{keeper}`、代码传 `{ keepr: … }`，页面原样显示 `{keeper}`，没有警告；`validate` 不读代码，也查不到。`dev` 之后看一眼 `rendered_ui` 里有没有没替换的 `{…}`。
- 代码里不读语言：没有 `navigator.language`、`currentLocale`，也不按语言写分支。语言由平台给，`t` 自己知道。
- 一个键在所有语言里都查不到时，页面显示平台的一句「这句话暂时显示不了」（英文 This text cannot be shown right now），键名不上页面；宿主在 stderr 记一行 `"area":"ui-text","event":"text-missing"`，`fields` 里有 `owner`、`key`、`locale`；同一个主人的同一个键只记第一次，再渲染多少次也只有这一行。`validate` 只读语言文件、不读代码，所以写错的键看 `dev` 的这行日志。

**4. 检查和运行。** `validate` 和 `dev` 都由 Molis Work 本体的 CLI 执行。按随包手册设好 `molis_cli`，默认是 Home 下的 `bin/molis-work`。[安装版开发入口](authoring.md#安装版开发入口)

在源码树里构建后，可用 `node dist/cli/main.js` 代替 `"$molis_cli"`。独立工具 `molis-work-plugin` 目前供源码树使用，它的 `dev` 会报 `plugin.host_required`，应改用 `molis-work plugin dev`。[构建命令](authoring.md#从源码树构建) · [源码树的安装说明](../../docs/installation.md) · [独立 CLI 的源码树待办](../../specs/backlog/BL-plugin-cli-standalone-install.md)

把项目路径换成实际位置。最小例子的授权项是 `ui:register`，其他插件填自己 Manifest 所需的权限，以逗号分隔。

```bash
plugin_project="/实际目录/greeting"
plugin_state="$(mktemp -d)"
"$molis_cli" plugin validate "$plugin_project/manifest.json"
"$molis_cli" plugin dev "$plugin_project" "$plugin_state" ui:register --allow-unsigned-development --locale zh
```

开发状态目录必须是新的、空的，或之前 `dev` 用过且带 `.molis-work-plugin-development.json` 标记。中英文各跑一次可以用同一个目录。普通非空目录会被拒绝，`message` 写「Plugin 开发不能使用非空的普通目录或用户项目目录」。目前错误码为 `plugin.manifest_invalid`，以 `message` 定位目录问题。[源码树的错误码待办](../../specs/backlog/BL-plugin-cli-dev-uncoded-errors.md)

**先 `validate`，再 `dev`。** `dev` 只读这次用的语言和默认语言两个文件：单个文件坏了（不是合法 JSON、有那五个字符、`owner` 或 `locale` 不符），或者这两种语言之间参数不一样、默认语言缺这次语言有的键，都拒绝运行，报 `plugin.package_invalid`，`message` 和 `validate` 的写法一样。别的语言（没用到的那几种）它不读，所以全部语言的检查仍要靠 `validate`；这次的语言少几个键不挡运行，那几处显示默认语言的字。

- `validate` 读 Manifest 旁边声明的语言文件。默认语言缺键（别的语言有、它没有）、参数和默认语言不一样、文字里有那五个字符、文件缺失、`owner` 或 `locale` 和声明不符：都失败，退出码 1，`message` 写哪个文件、哪个键、怎么改。参数不一样时，问题记在非默认语言的文件上，但写错的可能是任何一边：`message` 写出两个文件各用什么参数、哪个是默认语言，改写错的那一边；代码里 `t` 传的参数名以默认语言为准。只是别的语言少几个键不算失败，写进输出的 `locale_notes`（每条有 `file`、`code`、`locale`、`key`、`reason`、`fix`），那种语言暂时显示默认语言的字。
- `dev` 加 `--locale <语言>` 用那种语言画页面，不写用 `default`。语言不在 `available` 里报 `actions.input_invalid` 并列出可选的；插件没写 `ui.locales` 却传了 `--locale`，同样报错，提示先写 `ui.locales`。中英文各跑一次，看输出 JSON 里 `rendered_ui` 的 HTML。

## 后台工作与稍后显示的文字

开发预览只有在渲染时提供语言。正式运行的请求、动作和后台入口由宿主给上下文：页面随当前调用，后台工作开始时读同一 Home 最近用的语言。请求结束后的 promise 或定时器不能继续用原页面的语言。

消息存下来以后才显示时，用 `TextRef` 保存键和参数（例如 `{ key: "greeting.sync.done", args: { count } }`）。在拥有它的作用域用 `t` 或 `say` 显示，换语言后仍用同一条记录。外部错误和用户原文按原文保留。

测试用 `installTextForTest({ packs, locale })` 装上用 `parseLocalePack` 读出的词包，并在结束时撤回；`locale: null` 模拟无语言上下文。

## 逻辑不碰译文

状态标签沿用本插件的静态语言键，家族标签由平台的状态环定义提供。代码以状态 ID 做判断。

- 不拿译文做判断：不比较 `t(...)` 的结果，不按显示的字找按钮、选状态；用键、错误码、对象的原值。
- 不把译文存进业务数据：存键和参数，或原值。存了译文，换语言以后旧数据还是那种语言。
- 用户自己的字原样存、原样显示，不翻译。

## 颜色和字体

- 样式只写语义变量：颜色 `var(--ink)`、`var(--muted)`、`var(--paper)`、`var(--line)`、`var(--accent)`、`var(--action)`；字体 `var(--font)`、`var(--font-mono)`、`var(--weight-body)`、`var(--weight-title)`；圆角 `var(--r-control)`、`var(--r-card)`；动效 `var(--dur-move)`、`var(--ease-quint)`。不写色值，也不写圆角、阴影、时长的数值和 `!important`。
- 安装版插件直接按名字使用上面的语义变量。基线文件是源码树的设计系统资料，`ui-spec.json` 列角色，`skins/soft-workbench.json` 定颜色、阴影、圆角和动效，`fonts/system-sans.json` 定字族、字重和字距。源码树维护者新增角色或取值时走设计系统评审。[源码树基线文件](../../packages/design-system/resources/)
- 代码不读当前皮肤、明暗或字体（`data-skin`、`data-resolved-theme` 都不碰），换外观时页面不用做任何事。

### 目录和连接服务的文字

清单里原来的名称、简介和视图标题是原文。要随语言切换，分别在 `name_text`、`summary_text`、视图的 `title_text`、输入框来源（动作的 `composer_source`）的 `title_text` 或开始/创建入口的对应文字字段声明本插件的 `{ "key": "插件前缀.区域.名称" }`。视图有自己的标题，缺词时回退同一字段的原文。外部品牌或用户原文继续用原来的文字，不用给它们造译文。

成果库类型可以在 `artifacts.produces` 的条目上保留非空 `title` 原文，并用 `title_text` 声明本插件的 `{ "key": "greeting.artifacts.type-title" }`。默认语言文件须有这个键，文字为不超过 80 字的无参单行短句。其他语言缺词时沿默认语言显示。类型名不能取通用词、原文字面引用、参数或复数。成果内容、类型 ID 和版本照原合同写。[成果类型声明](elements.md#artifacts--ports)

集成插件的连接服务标题、简介、提示、能力标签、链接标题，以及凭据和 OAuth 设置的标签与占位文字，也可以用同一份 `TextRef`。默认语言必须有本插件的每个声明键，这些字段不带参数，也不取复数词条。授权端点、域名、范围、枚举值和设置字段名照原合同写；语言切换不改变授权。签名沙箱集成把语言声明写进现有 `contract.json` 的 `ui.locales`，其 `manifest.json` 与之相符，语言文件同包签名。

## 给模型的内容

一轮用哪种语言回复，由平台在一处给模型（`AgentStartAuthority.reply_language`）。提示词、Skill、方法和插件代码里都不写「用中文回复」，也不按语言分支；用户这一轮明说要别的语言时，模型照用户的。写法见 [molis-prologue-ai](../molis-prologue-ai/SKILL.md)。

Skill、方法和提示词的长正文每种语言一个文件，缺译文时用该来源的默认正文；这一轮的回复语言不随正文回退。具体的内容包文件规则留作源码树参考。[源码树的内容包文件约定](../../specs/font-and-skin-system/a-section-contract.md#153-skill-的文件约定交第-08-批合同)

## 最小的完整例子

一个只画一页的 Integration 插件，中英文，参数带 `'` 和 `&`。上面第 2 步的 `locales/en.json`、`locales/zh.json` 放在同一目录。

插件代码在 `molis-work` 的进程里运行，Node 版本跟它走。当前 npm 安装包要求 Node 24.15.x，源码树也锁定这个系列。源码树的 `.nvmrc` 写 24.15.0，根 `package.json` 的 `engines` 写 `>=24.15.0 <24.16.0`。contracts 和 SDK 两包自己声明 `>=24`。`import … with { type: "json" }` 在 24.15 能用。入口写成 `.mjs` 时按 ES 模块读，与 `package.json` 的 `"type"` 无关。`validate` 和 `dev` 无需手写 `package.json`，离线安装两包时 npm 会建一个。打包时用 `files` 列出分发文件，Manifest 声明的语言文件自动带上。[离线安装两包](authoring.md#安装版开发入口)

`manifest.json`：

```json
{
  "schema_version": 1,
  "host_api_version": 1,
  "plugin_id": "io.molis.work.demo.greeting",
  "version": "1.0.0",
  "name": "Greeting",
  "kind": "integration",
  "publisher": { "publisher_id": "local-developer", "signature": "local-development-binding" },
  "entrypoints": [{ "deployment": "local", "entrypoint": "./index.mjs" }],
  "permissions": [{ "permission": "ui:register", "required": true, "reason": "Show the greeting page" }],
  "capabilities": { "provides": [], "consumes": [] },
  "artifacts": { "produces": [], "consumes": [] },
  "ui": {
    "contributions": ["io.molis.work.demo.greeting.main"],
    "locales": { "default": "en", "available": ["en", "zh"] }
  }
}
```

`index.mjs`：

```js
import { definePlugin, definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import manifest from "./manifest.json" with { type: "json" };

const team = "Tom's R&D team";

export default definePlugin({
  manifest,
  async start(context) {
    context.services.ui.register({
      descriptor: {
        contribution_id: manifest.ui.contributions[0], kind: "primary-page", label: "Greeting", slots: [],
        surfaces: [{ surface_id: "main", target_slot_id: "plugin.main", format: "html" }],
      },
      render: () => `<section><h2>${t("greeting.main.title")}</h2><p>${t("greeting.main.hello", { name: team })}</p>`
        + `<p>${t("greeting.main.unread", { count: 3 })}</p></section>`,
    });
    const provider = {
      type: "greeting",
      async health() { return { ok: true, status: "connected", message: "ready" }; },
      async sync() { return { ok: true, mode: "live", cursor: null, items: [] }; },
    };
    return definePollingIntegrationPlugin({ manifest, createProvider: () => provider }).start(context);
  },
});
```

`provider` 的形状是合同里的 `IntegrationProviderPort`（`@molis-ai/molis-work-contracts/platform/plugin`）。`health()` 返回 `{ ok, status, message }`：`status` 是 `connected`、`disconnected`、`error`、`needs_auth` 之一，`message` 是给人看的一句话。`sync({ cursor, mode })` 成功时返回 `{ ok: true, mode: "live", cursor, items }`：`items` 是这次拉到的条目（这个例子没有，写空数组）；`cursor` 是下次从哪里接着拉，平台原样存下、下次传回来，没有就写 `null`。失败时返回 `{ ok: false, mode: "live", failure, message }`。连接、cursor 和重建 cursor 的做法见 [integrations.md](integrations.md)。

`--locale en` 画出 `Hello, Tom&#039;s R&amp;D team` 和 `3 new notes`，`--locale zh` 画出 `你好，Tom&#039;s R&amp;D team` 和 `3 条新笔记`。`health`、`sync` 里不调 `t`（上面「没有页面的地方没有语言」）。
