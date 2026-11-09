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

## 写一个带两种语言的插件

最短的路是 `molis-work plugin create`：生成的样例已经带 `ui.locales` 和 `locales/en.json`、`locales/zh.json`，同一份写法在 `examples/plugin-sample/`。安装公开两包（contracts 和 SDK）、`validate`、`dev` 的完整命令见 `docs/platform/PLUGIN-DEVELOPMENT.md`「创建和运行」。从空目录写，照下面四步，文末有一个跑过的最小例子。

**1. Manifest 声明语言。** 在 `ui` 下加 `locales`：

```json
"ui": {
  "contributions": ["io.molis.work.demo.greeting.main"],
  "locales": { "default": "en", "available": ["en", "zh"] }
}
```

- 每种语言一个文件 `locales/<语言>.json`，路径由约定得出，不写；`molis-work-plugin pack` 自动带上；用 npm 或 pnpm 发布项目时，把 `locales` 放进 `package.json` 的 `files`。
- 语言标记写 `zh`、`en`、`zh-Hant`、`pt-BR` 这样的；`default` 在 `available` 里，不重复，最多 32 种；`ui.locales` 只有这两个键。
- 同一个 Manifest 不能再写 `ui.messages` 或 `ui.translations`。
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
- **日期：** 样式是 `date`、`time`、`datetime`、`relative`、`weekday`、`month-day` 等，`at` 写 ISO 8601。带时间的（`2026-11-08T21:15:00Z`）可指定 IANA 时区，如 `dateArg(at, "datetime", { time_zone: "America/Los_Angeles" })`；不指定按运行这段代码的机器本地时区显示，`dev` 里就是你这台机器：UTC 21:15 在东八区显示成次日 05:15。只有日期的（`2026-11-08`）照写的那天显示，不随时区挪，`time`、`datetime` 样式对它只显示日期。坏日期不抛，显示原文。
- **代码里的参数名要和语言文件里的一样。** 文件写 `{keeper}`、代码传 `{ keepr: … }`，页面原样显示 `{keeper}`，没有警告；`validate` 不读代码，也查不到。`dev` 之后看一眼 `rendered_ui` 里有没有没替换的 `{…}`。
- 代码里不读语言：没有 `navigator.language`、`currentLocale`，也不按语言写分支。语言由平台给，`t` 自己知道。
- 一个键在所有语言里都查不到时，页面显示平台的一句「这句话暂时显示不了」（英文 This text cannot be shown right now），键名不上页面；宿主在 stderr 记一行 `"area":"ui-text","event":"text-missing"`，`fields` 里有 `owner`、`key`、`locale`；同一个主人的同一个键只记第一次，再渲染多少次也只有这一行。`validate` 只读语言文件、不读代码，所以写错的键看 `dev` 的这行日志。

**4. 检查和运行。** `validate` 和 `dev` 都用 Molis Work 本体的命令 `molis-work plugin …`。它不在你装的 contracts、SDK 两个包里，装完它们 PATH 上也没有 `molis-work`。今天拿到它有两条路，命令后面的参数一样：

- 在 Molis Work 仓库里 `pnpm build` 之后，在仓库根目录写 `node dist/cli/main.js plugin …`（`docs/platform/PLUGIN-DEVELOPMENT.md`「创建和运行」都这样写）。
- 按 `docs/installation.md` 装过 Home 的，写全路径 `~/.molis-work/bin/molis-work plugin …`，它不在 PATH 上。公开安装包还没发布。

仓库里另有一个独立工具 `molis-work-plugin`（`tooling/plugin-cli`），今天装不到仓库外面（`specs/backlog/BL-plugin-cli-standalone-install.md`），而且没有 Host：在它上面跑 `dev` 报 `plugin.host_required`，不是 Manifest 写错了，换成 `molis-work plugin dev`。

```bash
molis-work plugin validate <项目>/manifest.json
molis-work plugin dev <项目> <开发状态目录> <grants> --allow-unsigned-development --locale zh
```

`<grants>` 是逗号分隔的、Manifest 要的权限（下面的最小例子只要 `ui:register`）。`<开发状态目录>` 必须是新的、空的，或之前 `dev` 用过、带 `.molis-work-plugin-development.json` 标记的目录，普通的非空目录会被拒绝（`message` 写「Plugin 开发不能使用非空的普通目录或用户项目目录」；错误码今天误报成 `plugin.manifest_invalid`，看 `message`，见 `specs/backlog/BL-plugin-cli-dev-uncoded-errors.md`）；中英文各跑一次可以用同一个。

**先 `validate`，再 `dev`。** `dev` 只读这次用的语言和默认语言两个文件：单个文件坏了（不是合法 JSON、有那五个字符、`owner` 或 `locale` 不符），或者这两种语言之间参数不一样、默认语言缺这次语言有的键，都拒绝运行，报 `plugin.package_invalid`，`message` 和 `validate` 的写法一样。别的语言（没用到的那几种）它不读，所以全部语言的检查仍要靠 `validate`；这次的语言少几个键不挡运行，那几处显示默认语言的字。

- `validate` 读 Manifest 旁边声明的语言文件。默认语言缺键（别的语言有、它没有）、参数和默认语言不一样、文字里有那五个字符、文件缺失、`owner` 或 `locale` 和声明不符：都失败，退出码 1，`message` 写哪个文件、哪个键、怎么改。参数不一样时，问题记在非默认语言的文件上，但写错的可能是任何一边：`message` 写出两个文件各用什么参数、哪个是默认语言，改写错的那一边；代码里 `t` 传的参数名以默认语言为准。只是别的语言少几个键不算失败，写进输出的 `locale_notes`（每条有 `file`、`code`、`locale`、`key`、`reason`、`fix`），那种语言暂时显示默认语言的字。
- `dev` 加 `--locale <语言>` 用那种语言画页面，不写用 `default`。语言不在 `available` 里报 `actions.input_invalid` 并列出可选的；插件没写 `ui.locales` 却传了 `--locale`，同样报错，提示先写 `ui.locales`。中英文各跑一次，看输出 JSON 里 `rendered_ui` 的 HTML。

## 后台工作与稍后显示的文字

开发预览只有在渲染时提供语言。正式运行的请求、动作和后台入口由宿主给上下文：页面随当前调用，后台工作开始时读同一 Home 最近用的语言。请求结束后的 promise 或定时器不能继续用原页面的语言。

消息存下来以后才显示时，用 `TextRef` 保存键和参数（例如 `{ key: "greeting.sync.done", args: { count } }`）。在拥有它的作用域用 `t` 或 `say` 显示，换语言后仍用同一条记录。外部错误和用户原文按原文保留。

测试用 `installTextForTest({ packs, locale })` 装上用 `parseLocalePack` 读出的词包，并在结束时撤回；`locale: null` 模拟无语言上下文。

## 逻辑不碰译文

- 不拿译文做判断：不比较 `t(...)` 的结果，不按显示的字找按钮、选状态；用键、错误码、对象的原值。
- 不把译文存进业务数据：存键和参数，或原值。存了译文，换语言以后旧数据还是那种语言。
- 用户自己的字原样存、原样显示，不翻译。

## 颜色和字体

- 样式只写语义变量：颜色 `var(--ink)`、`var(--muted)`、`var(--paper)`、`var(--line)`、`var(--accent)`、`var(--action)`；字体 `var(--font)`、`var(--font-mono)`、`var(--weight-body)`、`var(--weight-title)`；圆角 `var(--r-control)`、`var(--r-card)`；动效 `var(--dur-move)`、`var(--ease-quint)`。不写色值，也不写圆角、阴影、时长的数值和 `!important`。
- 值只在基线文件里：`packages/design-system/resources/` 的 `ui-spec.json`（有哪些角色）、`skins/soft-workbench.json`（颜色、阴影、圆角、动效的值）、`fonts/system-sans.json`（字族、字重、字距）。缺一个就加进基线文件（角色在 `ui-spec.json`，值在皮肤文件），不写局部值；改这些文件要过设计系统的评审。外部插件作者拿不到私有的 design-system，按名字用变量就行。
- 代码不读当前皮肤、明暗或字体（`data-skin`、`data-resolved-theme` 都不碰），换外观时页面不用做任何事。

## 给模型的内容

一轮用哪种语言回复，由平台在一处给模型（`AgentStartAuthority.reply_language`）。提示词、Skill、方法和插件代码里都不写「用中文回复」，也不按语言分支；用户这一轮明说要别的语言时，模型照用户的。写法见 [molis-prologue-ai](../molis-prologue-ai/SKILL.md)。

Skill、方法和提示词的长正文每种语言一个文件，缺译文时用该来源的默认正文；这一轮的回复语言不随正文回退。内容包的具体文件规则见 [字体、皮肤与语言合同](../../specs/font-and-skin-system/a-section-contract.md#153-skill-的文件约定交第-08-批合同)。

## 最小的完整例子

一个只画一页的 Integration 插件，中英文，参数带 `'` 和 `&`。上面第 2 步的 `locales/en.json`、`locales/zh.json` 放在同一目录。

插件代码跑在 `molis-work` 的进程里，所以 Node 版本跟它走。仓库锁定 24.15.x：`.nvmrc` 写 24.15.0，根 `package.json` 的 `engines` 写 `>=24.15.0 <24.16.0`，npm 安装包也要求这一版；别的版本不在支持范围，能跑也不保证。contracts 和 SDK 两包自己写的是 `>=24`。`import … with { type: "json" }` 在 24.15 能用。入口写成 `.mjs`，不管 `package.json` 的 `"type"` 都按 ES 模块读。`validate` 和 `dev` 不读 `package.json`，自己不用写；`npm install` 装两个包时会建一个。到 `pack` 时才要它：`files` 列出分发的文件（语言文件不用列，自动带上）。

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
