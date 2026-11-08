# 字体、皮肤与语言系统：A 段合同设计稿

状态：设计稿，尚未实现（2026-11-07）；要用户定的事都定了（第 12 节）。路线书第 14 批合同台写，写手拿它开工；合同代码按第 10 节单独开小 PR。代码依据是 main `88c713ba3`，只读核对，没有构建、没有跑测试、没有碰真实 Home；第 5.4 节的序列对齐只跑了离线模拟，范围写在那一节。需求与总验收仍以[需求书](spec.md)为准，总体方案见[实现方案](implementation-plan.md)；两边与本文不一致的 A 段字段，以本文为准。

本批「做完基本看不到界面变化」。真实切换在第 16 批（[决定 20](../post-anticorruption-roadmap/reference/decisions.md#decision-20)）。下文凡是写「第 16 批」的段落只说明不留死路，不是 A 段要写的代码。例外是回复语言（T10）和手册（T9b）：用户 2026-11-07 要求这两件本批就有。验收编号在[需求书 §11](spec.md#11-验收标准) 的 FSS-42～FSS-73。

## 1. 设计目标

用户 2026-11-07 的方向，原话：「需要把字体皮肤语言建设成对业务逻辑最小干扰的横向平台能力，提供方便的注册管理和使用体系」。

下面把它拆成三块，每条都能验证。用户同日又加了两条：内容跟语言走（第 15 节），这一套写进开发流程和手册（第 16 节）。

### 1.1 使用：业务代码只碰这几样

用户 2026-11-07 的要求，原话：「我要求对业务逻辑的侵入是少的，都是通过少量文件维护语言文件」。

业务代码只知道 **`t`、`format` 两个工具**，和**语义颜色、字体角色**（CSS 变量）。主人和语言由平台从上下文取，业务不传。没有 `ui` 参数，不改任何函数签名，服务端和浏览器写法相同。

**文字分四类，各走一条路：**

| 类 | 例子 | 走哪条路 |
| --- | --- | --- |
| 界面短句 | 按钮、标题、提示 | `t("key", args)`，查主人自己的词表。日期和数字走 `format` |
| 存下来以后才显示的 | 通知、错误记录、后台工作的结果 | 存键和参数（`TextRef`，第 2 节），显示时才查 |
| 长内容 | Skill、提示词、方法 | 每种语言一个文件，按语言选整个文件，不拆进词表（第 15 节） |
| 用户自己的内容 | 项目名、正文、已有对话 | 不翻译 |

```ts
import { t, format } from "@molis-ai/molis-work-plugin-sdk/ui";

// 有页面或请求的地方，任何函数里都能调
function head(model) {
  return `<h2>${t("notes.main.title")}</h2>`                                         // 拼进 HTML：直接可用且安全
    + renderButton({ label: t.text("notes.main.rename", { title: model.title }) })   // 自己会转义的部件，带字符串参数写 t.text
    + `<time>${format.date(model.at, "datetime")}</time>`
    + `<p>${t("notes.main.saved", { count: model.saved })}</p>`;
}
// 样式：只写语义变量，换皮肤不用动
.notes-title { color: var(--ink); font-weight: var(--weight-title); }
```

**后台工作存引用，不调 `t`：** 存下来的句子要能按以后的语言显示。万一在没有语言的地方调了：开发路径和测试抛 `ui.text_no_context`，错误里点名键，并说「存 `TextRef`」；正式运行用主人默认语言，记一条可观察的问题，不抛，因为抛错可能让整个宿主退出（第 5.2 节）。

**切语言时业务代码什么都不做**，也没有绑定标记，平台重取这块内容再原地合并文字（第 5.4 节）。

**词表每个主人一张，不合成一张。** 三个理由：
- 插件独立安装、卸载，第三方写不进中央表。
- 合成一张会互相覆盖：Pages 把「复制」译成 Duplicate，盖掉了助理的 Copy（[需求书](spec.md) §6.1 第 4 条）。
- 合成一张就得整张发：英文页再次打开多发 1.9 MB（`resource-budget.md` 第 4.2 节，实测 2,573,362 B，拆开后计算值 667,040 B）。

#### 验收：真实代码改前改后

都取自 `plugins/native/feed`（main `88c713ba3`），第 16 批的迁移脚本照这样做。没有动一个函数签名，没有动一行逻辑。

**浏览器：`src/browser/rule-authoring.ts`。** 全文件 17 个 `L(`，在 11 行里。

```ts
// 改前
import type { FeedPage } from "./factory.js";
export function feedRules(page: FeedPage) {
  const { host, q, all } = page, L = host.translate, drafts = new Map<string, RuleDraft>();
      select.replaceChildren(new Option(L("请选择判断能力"), ""));
      heading.textContent = L("最近 {count} 条消息的预览", { count: rows.length });

// 改后
import type { FeedPage } from "./factory.js";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
export function feedRules(page: FeedPage) {
  const { host, q, all } = page, drafts = new Map<string, RuleDraft>();
      select.replaceChildren(new Option(t("feed.rule.choose-judgment"), ""));
      heading.textContent = t("feed.rule.preview-recent", { count: rows.length });
```

改了 13 行：加 1 行 import，声明行去掉 `L = host.translate`，11 行换键。函数 `feedRules(page)` 不变。

**服务端：`src/ui.ts`。** 全文件 297 个 `text("`，在 98 行里。

```ts
// 改前
function renderFeedSourceRail(model: FeedUiModel): string {
  const p = model.primitives;
  return `<aside aria-label="${p.text("Feed 来源")}">
    <header><span>${p.text("来源")}</span><button>${p.icon("plus")}${p.text("添加来源")}</button></header>`;

// 改后
function renderFeedSourceRail(model: FeedUiModel): string {
  const p = model.primitives;   // 还要它取 icon、escape
  return `<aside aria-label="${t("feed.source.rail")}">
    <header><span>${t("feed.source.title")}</span><button>${p.icon("plus")}${t("feed.source.add")}</button></header>`;
```

改了 99 行：加 1 行 import，98 行换键。

**`src/stage-ui.ts` 把翻译函数当参数传**（`buildFeedModel({ L: model.primitives.text }, …)`，内部 `text.L("…")`）：脚本换成 `t("…")` 后参数没人读了，同一片删掉（决定 27：这一片让什么变多余就在这一片删）。这样的文件有多少，第 16 批开工前数（第 14 节）。

`p.text`、`host.translate` 在 C 段删掉，所以第 16 批要连这两个名字一起换（第 14 节），不留第二条路。

**只有一种情况要多想一下：** 句子带**字符串参数**，又不是拼进 HTML。这时写 `t.text(…)`，见第 5.3 节。按实际调用数约 1 成。

| 不许业务代码做的 | 怎样保证 |
| --- | --- |
| 读语言、皮肤、字体，写按语言或皮肤的分支 | 工具里没有判断语言的写法也能写完页面；样例源码用断言查（FSS-62） |
| 订阅变化 | 普通页面没有订阅 API；只有要重新测量的终端、编辑器才听一个可选事件（第 4.5 节） |
| 拿译文做判断 | 窄规矩「新代码不拿译文做判断、不存译文」（第 16 节），靠评审；存量列在第 14 节，第 16 批改完 |
| 把译文存进业务数据 | 同上。存键或原值；要显示的句子存 `TextRef` |
| 改动作的输入输出 | A 段不动任何动作；以后要给人看的字段才写 `TextRef`，业务字段不变 |
| 拼句 | 整句一个键带参数，不写 `t("a") + "：" + title` |

**不做布局和逻辑的大拆分。** 那样要改 444 个文件，本身就是最大的侵入。

现有插件一行不改：`L`、`p.text`、`host.translate` 照旧，合同里 `render` 也没变（第 8.3 节）。

### 1.2 注册：一处声明，宿主不写名单

内置插件、外部插件写法相同，只在 Manifest 写一处，语言文件按约定放在包里的 `locales/<语言>.json`：

```jsonc
// manifest（内置插件写在 src/manifest.ts 的 ui 下，外部插件写在 manifest.json，形状相同）
"ui": {
  "contributions": ["io.molis.work.example.notes.main"],
  "locales": { "default": "en", "available": ["en", "zh"] }
}
```

为什么约定路径，不让作者写路径：加一种语言只多写一个词；路径不用校验（语言标记的形状里没有 `/`）；`pack` 自动带上这些文件，作者不用在 `package.json` 的 `files` 再写一遍（`packageFileReader` 也只收逐个写明的普通文件，写目录会报错）。

平台自己的文字主人（工作台、以后的 `horizontal/` 服务）没有 Manifest，**在资源登记表加一行**（第 3.6 节）：`kind: "locale"`，`owner` 写主人名，`path` 是它包里的语言目录，里面同样是 `<语言>.json`。加一个平台主人不改宿主代码。系统提供方（如 `system.home`）在它的登记里写 `text_owner`，由可信登记给出，不从声明读。

### 1.3 管理：一张统一资源登记表

随产品发行、有包内路径的东西（字体、皮肤、字体方案、共同规格、平台语言目录）只登记在 `packages/design-system/resources/registry.json`，字段见第 3.6 节。这张表不收别的：插件的语言文件唯一声明是 Manifest，报告从内置目录投影，不抄第二份名单；隐藏文档、内联块、启动 JSON 不是发行文件，进第一屏清单 `tooling/gates/first-screen.json`（第 16 批前的门禁 PR 创建，A 段不建）。

| 问题 | 答案 |
| --- | --- |
| 谁读 | 宿主资源适配器（启动时一次，定位字体与平台语言目录）；`packages/design-system` 的基线加载与 `fontFaceRules`；资源报告；测试 |
| 谁能改 | 只经 PR，文件归 D 轨。新增资源或一个资源涨超过 10 KB 按页面资源规则先问用户 |
| 缺失怎样被发现 | `tests/ui-resources.test.ts`：表里每行的文件或目录存在、字体的 sha256 相符、`font`、`asset` 的许可齐全；`resources/`、`fonts/` 下有文件而表里没有也失败，只排除 `fonts/README.md` 和 `resources/registry.json` 自己。进 `tests/ci-product-subset.txt` |
| 超预算怎样被发现 | 能量到的路由继续由 `scripts/gates/page-assets.mjs` 只许变小；第 16 批开工前由单独的门禁 PR 改成算页面总数（第 9 节），第一屏清单是门禁自己的文件。字节不存进表，由报告现算 |
| 发行物里有没有 | 同一测试核对包的 `files` 覆盖每行的 `path`；干净安装后文件可读（FSS-59） |

### 1.4 日常改动各动几处

每项越少越好。这张表就是注册管理「方便」的验收。

**语言文件的数量：每个主人每种语言一个文件。** 今天有 57 个英文词典文件（`*-en.ts` 和 `en.ts`，我按文件名数，主会话的数字相同）：工作台 24（`i18n/` 下 22，别处 2），goals 13，其余 19 个插件和 design-system 各 1；中文原文还散在 444 个源码文件里。切完：

| | 今天 | 第 16 批切完 |
| --- | --- | --- |
| 工作台 | 英文 24 个，中文在源码里 | **真的合成一个：** `apps/workbench/resources/locales/{en,zh}.json`。英文约 589 KB（`resource-budget.md`），在 1 MiB 上限内 |
| goals | 英文 13 个，中文在源码里 | `plugins/native/goals/locales/{en,zh}.json` |
| 别的主人 | 各 1 个英文，中文在源码里 | 各 `locales/{en,zh}.json`。design-system 的 1 个是组件板用词，并进工作台 |
| 合计 | 英文 57 个，中文散在 444 个文件 | **约 21 个主人，共约 42 个文件**（主人数第 16 批按实际定），源码里不再有译文。每加一种语言多约 21 个 |

**工作台这一个文件是枢纽：** 并行 PR 都改它。键按字母排序、一行一个，不相邻的改动能自动合并。排序今天只是写法约定：`validate`、解析器（`parseLocalePack`、`inspectLocaleSet`）和 CI 都不查，第 14 批没做。

| 操作 | 动几处 | 跑什么 |
| --- | --- | --- |
| 加一句界面文字 | 2 处：代码里 `t("key")`，默认语言的语言文件加一行 | 插件作者跑 `molis-work plugin validate`（独立的 `molis-work-plugin` 今天装不到仓库外面，BL-plugin-cli-standalone-install） |
| 改一句译文（插件或平台） | 1 处：语言文件那一行 | 不用跑。CI 解析全部语言文件 |
| 别的语言缺键 | 只算覆盖率，不阻断 | 同上 |
| 改一个颜色 | 1 处：皮肤文件 | 不用跑。改 Soft Workbench 的值 CI 会照常比页面资源 |
| 给插件加一种语言 | 2 处：`locales/<语言>.json`，Manifest 的 `available` 加一个词 | `validate` |
| 给平台主人加一种语言 | 今天至少 3 处：语言目录里加一个文件（读取器只要这一处，它读目录里有的）；`apps/workbench/src/i18n.ts` 的 `WEB_LOCALES`（页面和切换只给它列的语言）；`tests/ui-resources.test.ts` 钉住的语言名单（`en`、`zh`） | `tests/ui-resources.test.ts` |
| 加一个平台文字主人 | 2 处：语言目录，登记表一行；包的 `package.json` `files` 还没有 `resources` 时是 3 处（发行物要带上，第 14 批的工作台就是这样）。另外 `tests/ui-resources.test.ts` 钉住了主人名单（今天只有 `workbench`），要一起改 | `tests/ui-resources.test.ts` |
| 加一款字体（先问用户） | 3 处：字体文件，字体方案，登记表一行（含 sha256、许可）；许可的 `notice_path` 指向的说明（今天是 `fonts/README.md`）补上这款字体。要发给页面的，再在 `apps/local-host/src/web-assets.ts` 加它的路由；`tests/ui-resources.test.ts` 钉住了字体与路由名单，一起改 | 报告脚本打印那一行的 sha256；`tests/ui-resources.test.ts` |

**不用 `tooling/versions.json` 的 `carriers` 改这些 JSON。** 格式版本升一号时文件形状也变了，只改数字的工具帮不上忙；`scripts/gates/version-declarations.mjs` 也不读这些 JSON。解析器发现 `format_version` 不符就拒绝，CI 的解析测试会拦住。这是对 `docs/releases/POLICY.md` 第 1 节「代码以外的文件只由 `carriers` 改写」的例外，T2 在同一个 PR 里把这条写进 POLICY。

## 2. 文字引用 `TextRef`

这一节可以先开工，05② C-2、C-3，15 S-1，20 P-1 等它。

### 2.1 形状

新文件 `packages/contracts/src/platform/ui-text.ts`，由 `platform/ui.ts` 用 `export *` 转出，和 `ui-connections.ts` 同样做法。理由：`ui.ts` 已有 794 行，文字引用是独立的小合同；`plugin-manifest.ts`、以后的 `presentation.ts`、`blueprints.ts` 只要类型，直接 `import type` 这个文件，不用拖进整份 `ui.ts`。

```ts
import type { SandboxSchema } from "./plugin-sandbox.js";

/** 一个参数。存原值，不存已格式化的文字。 */
export type TextDateStyle = "date" | "time" | "datetime" | "relative" | "weekday" | "weekday-narrow" | "month-day" | "weekday-month-day" | "year-month";
export type TextArg =
  | { readonly name: string; readonly kind: "text"; readonly text: string }
  | { readonly name: string; readonly kind: "number"; readonly number: number; readonly style?: "decimal" | "percent" | "compact" }
  | { readonly name: string; readonly kind: "date"; readonly at: string; readonly style: TextDateStyle };

/** 写在声明、动作输出、内容包里的形状：没有主人。主人由平台绑定，声明里写了 owner 就拒绝。 */
export type TextRef =
  | { readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

/** 平台绑好主人之后的形状：组合服务的输出、存下来的摘要、页面拿到的都是它。 */
export type OwnedTextRef =
  | { readonly owner: string; readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

export const TEXT_REF_LIMITS = { key: 120, args: 8, arg_name: 64, arg_text: 2000, arg_at: 40, literal: 2000, fallback: 2000, owner: 200 } as const;

/** 语言标记的形状。T3 的 Manifest 解析和 T4 的语言包解析都从这里取，不写第二份。 */
export const LOCALE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

/** 平台定死的 schema，用 SandboxSchema 写，沙箱插件的动作输出也能用（做法同 SANDBOX_INTEGRATION_CONTRACT）。 */
export const TEXT_REF_SCHEMA: SandboxSchema = /* 见 2.5 */;
export const OWNED_TEXT_REF_SCHEMA: SandboxSchema = /* TEXT_REF_SCHEMA 加可选 owner */;
```

### 2.2 为什么这样

- **声明和绑定分开，用两个类型。** AGENTS「可信身份不从输入读」，所以声明里不能有 `owner`。已有先例：`UiContribution` 与 `OwnedUiContribution`、`ownedContribution(contribution, pluginId)`（`packages/contracts/src/platform/ui.ts:566-575`）。沿用它：`TextRef` 是声明，`OwnedTextRef` 是平台填过主人的。各设计稿里写的 `TextRef` 多数就是声明位置，名字不用改；组合服务输出的位置改成 `OwnedTextRef`（第 2.4 节）。
- **主人是一个字符串，不是对象。** 插件的 `plugin_id` 都匹配 `^io\.molis\.work\.`（`packages/plugin-sdk/src/plugin-id.ts`），平台主人名（`workbench`）不带这个前缀，不会相撞。每个文字都要带主人，字符串最省字节，和 `SurfaceItem.owner_plugin_id` 一致。
- **有 `literal`。** 三件事需要它，缺它就得另开字符串分支：20 的草稿（`BlueprintSource` 的 `draft`）没有语言包，标题就是用户或助理写的话；自定义皮肤的名字是用户起的；`judgment.reason` 是主人给的一句话。这也统一了一处分歧：05② §5 写 `reason?: TextRef`，15 第 12 节写 `reason?: string`，本文定 `reason?: TextRef`，主人可写 `literal`。`literal` 不翻译，显示原样。声明位置要不要收它由调用方定：`textRefProblems(value, { literal: false })`，内容包的 `Blueprint.title`、Manifest 的 `label` 都用 `false`，防止把界面词写死绕过翻译。
- **有 `fallback`。** FSS-40 要求缺键时显示声明里的默认原文，实现方案 §7.4 要求摘要「存键、参数与默认原文」；主人被卸载后语言包也没了，存下来的摘要还要能看。它只在查不到时用，不是另一个翻译来源。
- **参数是数组，不是 map。** `SandboxSchema` 的 `additionalProperties` 只能写 `false`，也没有 `oneOf`（`packages/contracts/src/platform/plugin-sandbox.ts:5-21`），map 和联合类型都写不进平台定死的输出 schema。所以线上是平铺字段的数组，TypeScript 类型仍是联合，字段组合由 SDK 的 `textRefProblems` 检查。业务代码写 `{ count: 3 }`，由 SDK 转成数组，不用手写。
- **不存已格式化的文字。** 切语言要重算（FSS-39、FSS-35）；组合服务的缓存不分语言（15 第 4.2 节）；原始数值和时间不能因语言改变（FSS-38）。
- **没有 `kind: "count"`，也没有 `count()`。** 语言包的 `plural_arg` 已经说明按哪个参数选形式，数字就是 `number`。作者少记一个词：`t(key, { count: 3 })` 就够。

### 2.3 键、参数与上限

- **键的规则复用 `STABLE_KEY`**（`packages/plugin-sdk/src/message-declarations.ts:9`）：它和 `messageOwnerOf`（`:16`）都改成模块内 `export`，`ui/text-ref.ts` 从那里取，不另写一份。取键主人的规则另由 `/ui` 公开一份：`textKeyPrefix(owner)`，以及 `t` 按前缀找主人时拒绝第二个同前缀主人的 `refuseSharedTextPrefix`（`ui.text_owner_conflict`）；宿主的 `apps/workbench/src/plugin-text.ts` 和 CLI 的 `create.ts` 都调它们，不再各截一次最后一段、各声明一次错误码（#1976 评审①第 2 条，统筹定「SDK 导出一份」）。门禁脚本 `scripts/gates/translations.mjs` 自己那份不动。
- **键的前缀决定能不能用**：`ownedTextRef(ref, owner)` 里，`common.*` 绑到平台主人 `workbench`（共有词有唯一主人，引用要显式）；否则前缀必须等于主人名（`messageOwnerOf(plugin_id)`，即 `plugin_id` 最后一段；平台主人就是它自己的名字）；别的前缀拒绝。这条是防冒充：插件不能把字显示成别人的。Manifest 只保证最后一段能开头，没管长度：键最短是 `<名字>.x`，所以最后一段长于 118 就写不出 120 以内的键，`ownedTextRef`、`parseLocalePack` 直接说这一句，不逐个键报错。`common` 作插件最后一段继续拒绝：现在由 `messageProblems` 管（`message-declarations.ts:32`），`parseLocalePack` 同样拒绝，C 段删 `messageProblems` 时这条留在 `parseLocalePack` 里。
- **查词按（完整主人，键）**，不再合成一张平面表（实现方案 §4.1）。`OwnedTextRef.owner` 是完整 `plugin_id`（平台主人是它的名字），`io.molis.work.a.notes`、`io.molis.work.b.notes` 不互相覆盖，也不因同名被拒。`t` 从键算主人，那张索引的范围见第 5.2 节。
- **参数名**是 `[A-Za-z_]\w*`，和 `message-declarations.ts` 的 `PLACEHOLDER` 一致。`{标题}` 这种中文占位符新语言包不收，旧的 `fillMessage` 到 C 段都还认（第 3.5 节）。
- **日期**：`at` 是 ISO 8601。带时区的按当前设置显示；只有日期（`2026-11-07`）的按字面显示，不换算时区，避免因时区差一天。`relative` 用 `Intl.RelativeTimeFormat`，`now` 由格式化工具传入，测试可固定。周几、年月、月日几种样式现在就有，第 16 批的首屏要用（全仓 `weekday:`、`month: "long"` 共 12 行）；业务绕开 `format`，切语言时就认不出。**坏日期不抛：** `Intl.DateTimeFormat` 会抛 `RangeError`（今天 `toLocaleString` 显示 `Invalid Date`，不抛），这里接住，显示 `at` 原文并记一条问题，一条坏数据不让整页 `render` 失败。
- **数字**：普通数字（`{ y: 2026 }`）不分组，显示 `2026`；`Intl.NumberFormat` 默认会写成 `2,026`，年份、端口、版本号、退出码都不能这样。要分组写 `numberArg(n, "decimal")`。`plural_arg` 只看数值。
- **上限**是 `TEXT_REF_LIMITS`，`PLUGIN_MESSAGE_LIMITS` 的 `keyLength`、`textLength` 改成取它，不留两个数。

**谁拒绝坏引用。** `TEXT_REF_SCHEMA` 挡不住 `{}`、`{ key, literal }`、只有 `fallback`、`{ literal, args }`、`{ name, kind: "number" }`（缺值）：`SandboxSchema` 没有联合，也没有最少属性数。所以由 `textRefProblems` 查（`{ literal: "" }`、空 `fallback`、`{ owner, literal }`、参数字段和 `kind` 不配也在内，如 `{ kind: "number", style: "weekday" }`，schema 都放得过），它有三个开关：`literal: false`（这个位置不收 `literal`）、`key: false`（草稿没有主人，不收键）、`owned: true`（这个位置是绑过的，`owner` 必须有；默认是声明，写了 `owner` 就拒绝）。

| 入口 | 闸口 | 遇到坏引用 |
| --- | --- | --- |
| 声明里的引用（Manifest、内容包，安装时） | `parsePluginManifest`、`inspectBlueprint` 调 `textRefProblems` | 拒绝安装 |
| 动作输出，平台绑主人 | `ownedTextRef` 先跑 `textRefProblems`。这是这些位置的**唯一闸口**，schema 只挡 `owner` 和未知字段 | 抛 `ui.text_ref_invalid`（`defineErrorCodes("ui", …)`）。**批量读取的服务要接住：** `surfaces.compose` 里一个插件的坏 `summary` 只让这张卡变 `unreadable`，不让整次组合失败 |
| 页面读（存下来的摘要、过期的引用） | `say` | 不抛，显示 `common.text.unavailable` 并记一条问题，页面不因一句话坏掉 |
| `judgment`、`activity`：values 动作的输出，页面才读 | `renderPresentationForm`、`presentationText` 内部按 `object.owner` 做一次不抛的绑定（`tryOwnedTextRef`） | 前缀或形状不对都显示不可用，不让插件把字显示成别人的 |

**查词顺序（读不到时绝不显示裸键或空白，FSS-34）：** 所选语言包 → 同语种基础语言（`zh-CN` → `zh`）→ 主人默认语言包 → `fallback` → 平台共有词 `common.text.unavailable`，同时记一条问题（`UiTextProvider.problem`）。只装两包的作者手上没有工作台语言包，这句也查不到，SDK 留最后一层常量 `UI_TEXT_UNAVAILABLE = "…"`。没有语言不算「读不到」，处理见第 5.2 节。

### 2.4 逐个核对消费者

| 用处 | 位置 | 形状 | 主人从哪来 | 能否满足 |
| --- | --- | --- | --- | --- |
| 字段标签 `label_key` | 05② §5 `PresentationObject.fields[]` | 改成 `label?: TextRef`，`literal` 不收 | Manifest 的 `plugin_id`（可信目录） | 能 |
| 概况说明 `note_key` | 05② §5、15 第 12.1 条 | 改成 `note?: TextRef` | 同上 | 能 |
| 分组标题 `title_key` | 05② §6、15 第 12.3 条 | `SurfaceGroup.title?: OwnedTextRef` | 组合服务绑定 | 能。输出位置要写 `OwnedTextRef`，页面才查得到词 |
| `hidden_above` | 05② §6、15 第 12.4 条 | `{ count: number; label: OwnedTextRef }`，`label` 带 `count` 参数 | 平台共有词 `common.surface.*` | 能。「只数读得了的」是服务的事，字不重新组合 |
| 为什么这样放 `reason` | 05② §6 | `SurfaceDescription.reason?: OwnedTextRef` | 组合服务 | 能 |
| 概况动作的 `summary` | 05② §5、15 第 12.1 条 | 动作输出写 `TextRef`（`TEXT_REF_SCHEMA`），服务按动作提供方绑主人 | 动作目录给的提供方 | 能。输出里写 `owner` 被 schema 拒绝，`{}` 被 `ownedTextRef` 拒绝 |
| `judgment` | 05② §5、15 第 12.6 条 | 动作输出 `{ label: TextRef; reason?: TextRef }`，`reason` 可 `literal` | `object.owner`，页面读时绑（第 2.3 节） | 能。两份设计稿对 `reason` 的类型不一致，按本文改 15 |
| 「同一件事」，参数由页面填 | 15 第 7 节 | `OwnedTextRef` 少两个参数，页面调 `say(ref, { extra })` 补上标题 | 组合服务 | 能。服务不读显示字段，所以要有 `extra` |
| `activity` 角色的值 | 05② §5 第 370 行 | 动作输出 `TextRef`，可 `literal`，写 `owner` 被 schema 拒绝。05② 没说形状，这里定：一句「最近发生了什么」是显示文字，切语言要变 | 同 `judgment` | 能 |
| 插件页面上别人的对象 | 05② §7 | 不走这条路。平台画（第 8.3 节） | | 要改 05② §7，见下第 3 条 |
| `Blueprint.title` | 20 第 3 节 | `TextRef`，内容包不收 `literal`，草稿不收键 | 内容包的 `plugin_id`（安装记录）；草稿无主人 | 要改 20，见第 6.2、15.4 节：08 的白名单放不下 `ui.locales`，内容包没有会话，`packs.save` 拒 `literal` |
| `connection.purpose`、`SettingEntryDeclaration.title`、`SettingEntryDeclaration.summary`、`adopts[].title` | 20 第 3、4、8 节 | `TextRef` | 声明它的插件；系统提供方用登记里的 `text_owner` | 能。内容包里的同上一行 |
| `RoleTemplate` 的 `title`、`materials`、`outputs`，采用时存成字符串 | 20 第 5 节 | `say.text(ref, { locale: context.locale })`，见第 5.2 节 | 内容包 | 能。这是有意存字符串，说明见第 5.3 节 |
| 文本形态 `presentationText` | 05② §7 | `presentationText(object, values, locale)`，见第 5.2 节 | 对象的主人 | 能。签名要补 `locale` |
| 动作按钮 `action.<capability_id>.title` | 15 第 4.2 条、需求 §6.2 | **有冲突**，见下 | | 要改写法 |

**要改的地方（05② C-2、C-3，20 P-1、P-2、P-3b，08 C-1 与 15 的写手照此改设计稿，本 PR 不改）：**

1. 05② 的 `label_key`、`note_key`（C-2）、`title_key`（C-3）按上表换名和换类型；`overview` 的输出 `summary: TextRef` 用 `TEXT_REF_SCHEMA`（C-2）。C-2 不等到 C-3 才用 `TextRef`，否则字符串键先进 Manifest，再在最热的 `plugin.txt` 上开一个 PR 改回来。
2. 15 第 12 节第 6 条的 `reason?: string` 改 `reason?: TextRef`。
3. 05② §7（C-2、15）：
   - 定义 `OwnedPresentationObject = PresentationObject & { readonly owner: string }`，`owner` 由平台按可信目录填，声明里没有。`renderPresentationForm(object, form, values)`、`presentationText(object, values, locale)` 对值里的引用做第 2.3 节那次不抛的绑定。
   - 挂载位由平台画（第 8.3 节 (a)），今天的 `nested` 还差四件：① 它只装 `manifest.ui.embedded_plugins` 里的插件自己画的 surface（`UiNestedContentModel`，`ui.ts:538`；`nestedContent`，`project-plugin-stages.ts:173`），平台画的内容没走过；② 它是同步的（同文件第 122、173 行），`surfaces.compose@1` 和 values 是异步动作，要先读好再传入；③ `presentation.mounts`（`id`）和 `descriptor.slots`（`slot_id`）成了两份声明，要定以谁为准；④ 15 §4.3 按事件刷新一个位置，`nested` 只在整页画时填，没有单独刷新的路。
   - **开工前要核：** frame 里的 `SurfaceItem.actions` 按钮以谁的身份调动作。这件事和 (a)、(b) 无关，两条路都要答。可选：只放平台的通用操作，经父文档走（照 `pageIntake`）；或按钮由外壳盖在 frame 上画（照 `connection-slot`、`embed-open` 的位置上报）；或这个位置不带按钮。核不过由 15 接页面的片回来问，不是回到 (b)。
   - 开工时比较一下 `placement.ts:25-27`：父文档把平台画的 HTML 发进 frame，异步，也能单独刷新一个位置，可能比 `nested` 更合适 ②、④。
4. **`action.<capability_id>.title` 这种键过不了 `STABLE_KEY`。** `io.molis.work.example.notes.results.publish` 这样的能力 id 拼出来有 9 段，上限是 5 段，开头也不是主人名。FSS-40 本来就暂不实现，但 15 S-1 不要写死这个形状。推荐写法：`<主人名>.action.<能力 id 去掉插件前缀，点换连字符>.<部分>`，如 `notes.action.results-publish.title`。实现方案 §7.4 已同步改。

### 2.5 `TEXT_REF_SCHEMA`

平铺字段，组合规则由 `textRefProblems` 检查（第 2.3 节）。`additionalProperties: false` 让带 `owner` 的输出直接被 schema 拒绝。上限都从 `TEXT_REF_LIMITS` 取，不写第二份数字。

```ts
const TEXT_ARG_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false, required: ["name", "kind"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: TEXT_REF_LIMITS.arg_name },
    kind: { type: "string", enum: ["text", "number", "date"] },
    text: { type: "string", maxLength: TEXT_REF_LIMITS.arg_text },
    number: { type: "number" },
    at: { type: "string", maxLength: TEXT_REF_LIMITS.arg_at },
    style: { type: "string", enum: ["decimal", "percent", "compact", "date", "time", "datetime", "relative", "weekday", "weekday-narrow", "month-day", "weekday-month-day", "year-month"] },
  },
};
export const TEXT_REF_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false, required: [],
  properties: {
    key: { type: "string", minLength: 3, maxLength: TEXT_REF_LIMITS.key },
    args: { type: "array", maxItems: TEXT_REF_LIMITS.args, items: TEXT_ARG_SCHEMA },
    fallback: { type: "string", maxLength: TEXT_REF_LIMITS.fallback },
    literal: { type: "string", maxLength: TEXT_REF_LIMITS.literal },
  },
};
```

## 3. 四种文件与资源引用

统一 UTF-8 JSON。类型在新文件 `packages/contracts/src/platform/ui-files.ts`，由 `ui.ts` 转出。

### 3.1 共同规格

| 规则 | 内容与理由 |
| --- | --- |
| 版本 | `format_version` 是格式版本，`id`＋`revision` 是定义身份，互不代替。外观的准确引用是 `UiDefinitionRef = { id: string; revision: number }` |
| 取值 | `id` 匹配 `^[a-z][a-z0-9-]{0,63}$`；`revision` 是正整数。`id`、角色名、色值、字体名、`unicode_range`、资源 id、`route` 的正则在 `UI_FILE_PATTERNS`，只列允许的字符：会写进 CSS 的字符串不收分号、括号、引号、换行、反斜杠，`url(` 进不来；`route` 只收 `/assets/` 下的路径。正则只管形状：`inherit` 当字体名、`U+FFFFFF` 这种正则看不出的，和 `sha256`、包内路径这些不进 CSS 的，由 SDK 的解析器查。角色类型、资源种类等取值表在 `UI_ROLE_TYPES`、`UI_RESOURCE_KINDS` 等常量，解析器从这里取，不另写一份 |
| 未知字段 | 拒绝，不忽略（需求 §3.1） |
| 重复属性名 | 进入 `JSON.parse` 之前拒绝，只有 SDK 的 `parseStrictJson` 一份实现：扫描器按路径记键，报 `$.light.ink` 和行列。普通解析器会让后值静默覆盖前值，看不出来 |
| 危险属性名 | `__proto__`、`constructor`、`prototype` 一律拒绝 |
| 大小 | `UI_FILE_LIMITS = { spec: 256 KiB, skin: 64 KiB, font: 64 KiB, locale: 1 MiB, registry: 64 KiB, depth: 12 }`，先比字节再解析 |
| 不收的东西 | CSS 文本、选择器、函数、外部 URL、任意属性名。不靠黑名单：取值只有下面的结构，文字位置只有名字和译文，译文只当文本输出（FSS-16） |
| 错误 | 新错误码写 `defineErrorCodes("ui", …)`，不写 Error 子类。`tooling/gates/error-owners.json` 加一条 `ui`，路径是这些新文件；现有 `plugin` 那行仍管 `packages/plugin-sdk/` 其余部分 |
| 结果 | `parse*(source, options?)`（`parseSkinFile(source, spec, options?)`：能写哪些角色由规格定）返回 `UiFileResult<T>`，即 `{ ok: true; value } | { ok: false; problems: UiFileProblem[] }`。`UiFileProblem = { file: string; path: string; code: string; reason: string; fix: string; line?: number; column?: number }`，`file` 是哪个文件，`fix` 写下一步怎么改。作者工具和平台看到同一份问题，CLI 直接打印就能看懂 |
| 版本字面量 | `tooling/versions.json` 加 `format.ui.spec`、`format.ui.skin`、`format.ui.font`、`format.ui.locale`、`format.ui.registry`，代码只在 `UI_FORMAT_VERSIONS` 写一次（`skin: /* @version format.ui.skin */ 1`），接口的 `format_version` 写 `typeof UI_FORMAT_VERSIONS.skin`，解析器比同一个常量。JSON 文件不走 `carriers`（第 1.4 节） |

### 3.2 令牌取值

不收 CSS 文本，所以令牌值是结构；序列化器写回和今天逐字相同的文字（第 8.1 节要内容不变）。

```ts
export type UiTokenValue =
  | string                                                  // 只收 #rrggbb、#rrggbbaa、transparent，大小写原样保留
  | { readonly rgba: UiRgba }                               // rgba(255, 255, 255, .05)；UiRgba 是四个数的元组
  | { readonly role: string; readonly fallback?: string }   // var(--accent)、var(--hue-green-fill, #4cb782)
  | { readonly mix: { readonly role: string; readonly percent: number; readonly with: "transparent" } } // color-mix(in srgb, var(--ink) 7%, transparent)
  | { readonly shadow: readonly UiShadowLayer[] }
  | { readonly px: number } | { readonly ms: number } | { readonly number: number }
  | { readonly bezier: readonly [number, number, number, number] }
  | { readonly stroke: { readonly width_px: number; readonly style: "solid"; readonly role: string } };

export interface UiShadowLayer {
  readonly x: number; readonly y: number; readonly blur: number; readonly spread?: number;
  readonly color: string | { readonly rgba: UiRgba } | { readonly role: string };
}
```

序列化规则（写手照今天的文字核）：

- 十六进制色值按文件里的写法原样输出，不统一大小写：`--content-tty`、`--mark-*` 共 22 个值是大写，改成小写内容就变了。
- 小数不写前导零（`.05`、`-.011em`）；`0` 不带单位；`spread` 省略时只写三段。
- 每个令牌输出 `--name: value;`，令牌之间一个空格。`renderShellTokens` 现在就是这个样子，浅深两份顺序相同（已核对 53 个）。
- 字体栈：系统字体名带空格才加双引号，方案自带的字体（`face`）一律加（不加的话，叫 `serif` 的文件会被读成通用字体族），逗号加一个空格。`FONT_STACK`、`MONO_FONT_STACK` 现有文字都符合。`inherit`、`initial`、`unset`、`revert`、`revert-layer`、`default` 不带引号时整条 `font-family` 失效，当字体名拒绝。
- `0` 不带单位只对长度：时间写 `0ms`，CSS 里光写 `0` 不是合法的时间。
- `role` 必须是规格里有的角色，引用成环拒绝。

### 3.3 共同规格文件 `resources/ui-spec.json`

不叫 `interface.json`：沙箱包已有同名文件（`SANDBOX_PACKAGE_FILES.interface`），第 6.4 节同时在说它。

```ts
export interface UiSpecFile {
  readonly format_version: typeof UI_FORMAT_VERSIONS.spec;
  readonly id: string;                         // "molis-interface"
  readonly revision: number;
  readonly baseline_skin: UiDefinitionRef;     // 省略角色只从这一个基线补，不做多级继承（实现方案 §1）
  readonly baseline_font: UiDefinitionRef;
  readonly groups: readonly UiTokenGroup[];    // 顺序就是输出顺序
  readonly font_roles: readonly UiFontRoleSpec[];
}
export interface UiTokenGroup { readonly group: string; readonly roles: readonly UiRoleSpec[] }
export interface UiRoleSpec {
  readonly name: string;                       // 不带 --；--name 就是公开令牌名
  readonly type: "color" | "shadow" | "length" | "duration" | "easing" | "stroke" | "number";
  readonly varies_by: "theme" | "none" | "terminal";   // 不叫 scope：C 轨在 #1798 否过，和动作的 scope 撞名
  readonly follows?: string;                   // 皮肤省略时跟随哪个角色（nav-bg → page）
  readonly alias_of?: string;                  // 结构样式后层把它绑到这个角色；只有基线皮肤可以写它（第 7.2 节）
  readonly locked?: UiTokenValue;              // 有这个字段就是不可定制，值写在这里
}
export interface UiFontRoleSpec {
  readonly name: "body" | "control" | "title" | "display" | "code";
  readonly tokens: { readonly family?: string; readonly weight?: string; readonly tracking?: string };
}
```

A 段只放令牌和字体角色。`PLUGIN_COMPONENTS` 的组件描述（FSS-05、FSS-26）搬进来在 B 段，A 段不留空字段；那时 `format_version` 不必升（阶段一，文件也还没进 Home）。

### 3.4 皮肤与字体方案

```ts
export interface UiSkinFile {
  readonly format_version: typeof UI_FORMAT_VERSIONS.skin;
  readonly id: string;
  readonly revision: number;
  readonly spec: UiDefinitionRef;              // 只认这一份规格
  readonly name: TextRef;                      // 内置写键，用户起的写 literal
  readonly recommended_font: UiDefinitionRef;
  readonly light: UiTokenMap;                  // UiTokenMap = Readonly<Record<string, UiTokenValue>>
  readonly dark: UiTokenMap;
  readonly shared: UiTokenMap;
  readonly terminal: { readonly unset?: UiTokenMap; readonly light?: UiTokenMap; readonly dark?: UiTokenMap };
}

export interface UiFontSchemeFile {
  readonly format_version: typeof UI_FORMAT_VERSIONS.font;
  readonly id: string;
  readonly revision: number;
  readonly name: TextRef;
  readonly roles: Readonly<Record<UiFontRoleSpec["name"], UiFontRole>>;
  readonly faces: readonly UiFontFace[];
}
export interface UiFontRole {
  readonly families?: readonly UiFontFamily[];
  readonly weight?: number;
  readonly tracking_em?: number;
}
export type UiFontFamily = { readonly system: string } | { readonly face: string };  // 都按 UI_FILE_PATTERNS.font_name：字母、数字、空格、连字符
export interface UiFontFace {
  readonly family: string; readonly weight: number | readonly [number, number];
  readonly unicode_range: readonly string[]; readonly resource: string;   // 登记表的资源 id，不是路径
}
```

`--terminal-*` 单列一个 `terminal`：今天它有三份值，`:root` 未设终端主题时是一份（`--terminal: #171719`），`data-resolved-terminal-theme` 为 light、dark 各一份，页面深色块和终端深色那份相同（`styles/foundation.ts:10-48`）。内容不变要求三份都留，所以叫 `unset`、`light`、`dark`。

字体方案 A 段不写字号和行高。FSS §4 要求每个角色都有，但今天没有这样的令牌，写了也没人读，等于空字段。B 段把组件样式接到 `--type-*` 时再加，同时加「长文阅读」「说明文字」两个角色。一款字体可以分几片（`faces` 多行，各带 `unicode_range`），第 16 批的圆润中文字体按这样分片（`resource-budget.md` 第 7 节）。

### 3.5 语言包，以及 `fillMessage` 怎样换

```ts
export interface UiLocalePack {
  readonly format_version: typeof UI_FORMAT_VERSIONS.locale;
  readonly owner: string;                      // 文件自述，只用于核对和导入导出
  readonly locale: string;                     // zh、en、zh-CN；形状 LOCALE_TAG（第 2.1 节）
  readonly direction?: "ltr" | "rtl";          // 省略是 ltr
  readonly revision?: number;                  // 随包文件不写；Home 受管副本（D 段）才由主人递增
  readonly messages: Readonly<Record<string, UiMessage>>;
}
// 写在 ui-text.ts：文字工具要它，ui-files.ts 要 TextRef，放那边依赖只有一个方向。
export type UiMessage = string | { readonly plural_arg: string; readonly forms: Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & { readonly other: string } };
```

- **`owner` 是自述，不是身份。** 需求 §3.1 要语言包文件表达文案主人（导入导出要用），AGENTS 要主人取自可信目录。两边都守住：载入时 `pack.owner` 必须等于目录给的主人，不等就拒绝，它从不授予身份。
- **`revision` 随包不写。** 必填的话作者每个文件都要写一个没人读的数字；随包文件的身份由发行版本决定，缓存键用宿主算的内容摘要。
- **消息值直接写字符串。** 比实现方案 §4.1 的 `{ "text": … }` 少一层；工作台有几千条，这一层每条都占字节，也没带来别的信息。实现方案已同步改。
- **复数规则。** 必须有 `other`，类型上也写明，解析之后不用再判；其余形式按 `new Intl.PluralRules(locale).resolvedOptions().pluralCategories` 查缺。中文只有 `other`，直接写字符串。
- **文字里不许有 `<`、`>`、`&`、`"`、`'`，只有内容包例外。** 这是 `${t()}` 直接可用的前提，理由、例外和今天的存量见第 5.3 节。

**实现：** `formatMessage(message, args, locale, now?)` 先按 `Intl.PluralRules` 选形式，把参数格式化成文字，最后交给现有的 `fillMessage` 替换。替换仍只有一份写法。新语言包不收 `{n|a|b}`（解析器拒绝），旧词典到 C 段继续用它，C 段连同这个分支一起删。A 段不动 `fillMessage` 和 `tests/fill-message.test.ts`。

| `tests/fill-message.test.ts` 钉住的行为 | 新写法里怎样保留 |
| --- | --- |
| `{count} {count\|file\|files}` 在 1、0 时的单复数 | `forms: { one: "{count} file", other: "{count} files" }`，`Intl.PluralRules("en")` 对 0 给 `other`，结果相同 |
| 写成文字的 `"1"` 按数字读 | 不保留：`plural_arg` 的参数必须是数字，字符串记一条问题并用 `other`。调用方给原值 |
| `"1.2k"` 取复数 | `numberArg(1200, "compact")`，显示 `1.2K`，按 1200 选 `other`。比今天更准 |
| 一句里多个一致词（`Handle this 1 decision`） | 每种形式写整句 |
| 中文不写一致词 | `other` 或普通字符串 |
| `{标题}` 能替换 | `fillMessage` 仍能替换；语言包解析器不收非 ASCII 占位符，理由是 `message-declarations.ts` 已这样约束稳定键 |
| 值只放一次，不再读（`{a}` 的值是 `{b}`） | 最后一步还是 `fillMessage`，行为相同 |
| 没给值的名字原样留着 | 相同；`inspectLocaleSet` 另外报参数不一致 |
| `{ "json": true }` 这种花括号不动 | 相同 |
| 页面的 `L` 和宿主的 `L` 结果相同 | C 段起两边都用 `/ui` 打包的同一函数，不再 `toString()` 传过去；A 段新增 FSS-48 证明 Node 与浏览器结果相等 |
| 每个一致词都同时显示数字（“3 files”不能只写“files”） | `inspectLocaleSet` 新规则：`plural_arg` 的每种形式都要出现 `{参数名}`，否则报 `hidden_number` |

### 3.6 资源引用与登记表

```ts
export type UiResourceKind = (typeof UI_RESOURCE_KINDS)[number];   // spec、skin、font-scheme、locale、font、asset。不叫 material：仓库里 material 是「资料」
export type UiResourceLoad =
  | "startup"        // 进程启动读一次，不下发浏览器
  | "first-screen"   // 每个页面第一屏都下发
  | "fallback"       // 缺字形才下载（带 unicode-range 的后备字体）
  | "on-open"        // 打开某个界面时才下发（插件的词）
  | "on-select"      // 选用这个方案才下发（Folio 圆润字体）
  | "tool";          // 只有开发工具页用
interface UiResourceFields {
  readonly id: string;                    // font.inter-latin-variable；字体方案、预算都引用它
  readonly owner: string;                 // 主人：design-system、workbench、…
  readonly package: string;               // 所在包名
  readonly path: string;                  // 包内相对路径；kind 为 locale 时是语言目录
  readonly load: UiResourceLoad;
  readonly route?: string;                // 直接下发的文件的路径；fontFaceRules 的 src: url(…) 从这里读
}
export type UiResourceRow =
  | (UiResourceFields & { readonly kind: Exclude<UiResourceKind, "font" | "asset"> })
  // 只有 font、asset 带这两项，也必须带：第三方二进制，换了要看得出
  | (UiResourceFields & { readonly kind: "font" | "asset"; readonly sha256: string; readonly license: UiResourceLicense });
export interface UiResourceRegistry {
  readonly format_version: typeof UI_FORMAT_VERSIONS.registry;
  readonly resources: readonly UiResourceRow[];
}
```

- **不存 `bytes`，JSON 不存 `sha256`。** 这些是文件事实的第二份：第 16 批工作台词典进语言文件后，每个改字的 PR 都要改登记表同一行，并行 PR 必然冲突；数字又是从文件算出来的，证明不了什么。预算要字节，报告现算。
- **`license` 只对 `font`、`asset` 必填。** 自家 JSON 写 spdx 和来源纯属样板。
- **`route` 有两个读者。** `fontFaceRules` 从它写 `src: url(…)`；宿主的路由仍写在 `apps/local-host/src/web-assets.ts` 的字符串字面量里，因为 `scripts/gates/page-assets-measure.mjs` 读的就是这些字面量，改成查表它会拒绝。测试核对两边一致。
- **`kind` 不为门禁变多。** 这张表只收有包内路径、随产品发行的文件（第 1.3 节）。第一屏的样式、脚本、内联块、启动 JSON 没有包内路径，也按页面才有意义，进第一屏清单 `tooling/gates/first-screen.json`（第 9 节），门禁 PR 不给 `kind` 加值。这张表不进 Home。

## 4. 展示快照与解析

类型在新文件 `packages/contracts/src/platform/ui-environment.ts`，由 `ui.ts` 转出。

### 4.1 字段

```ts
export interface UiDevicePreferences {
  readonly theme: "light" | "dark" | "system";
  readonly resolved_theme: "light" | "dark";
  readonly density: "standard" | "compact";
  readonly terminal_theme: "auto" | "light" | "dark";
  readonly resolved_terminal_theme: "light" | "dark";
  readonly reduced_motion: boolean;
}
export interface UiEnvironmentSnapshot {
  readonly revision: string;              // 由下面各引用拼成，不含 device；同样的选择得到同样的值
  readonly spec: UiDefinitionRef;
  readonly skin: UiDefinitionRef;
  readonly font: { readonly scheme: UiDefinitionRef; readonly policy: "follow-skin" | "pinned"; readonly mono: UiDefinitionRef };
  readonly locale: {
    readonly tag: string; readonly direction: UiTextDirection;   // "ltr" | "rtl"，语言包同一个类型
    readonly source: "explicit" | "system" | "default";
    readonly formatting: string;          // 给 Intl 用的完整标记，en-US、zh-CN
  };
  readonly device: UiDevicePreferences | null;   // 服务端读不到，是 null；浏览器合并后才有
  readonly problems: readonly UiEnvironmentProblem[];   // { code; subject; detail? }
}
```

快照只有身份和问题，**不带令牌值和译文**。理由：它要进首屏 HTML 和 iframe 配置，带字节就把 CSS 和词典搬到量不到的地方（第 9 节）。令牌在样式表里，译文走语言资源。预计 300～600 字节。

- **`problems` 有上限：** `UI_ENVIRONMENT_PROBLEM_LIMITS` 是 8 条、每个字段 200 字符，多出来的合成最后一条 `ui.environment_problems_more`。一个 Home 里坏了多少东西不该决定首屏多大。
- **`font.mono` 没单独选时填当前字体方案。** 方案的 `code` 角色已经说明代码用什么字体，所以这不是空值，也不用让读的人判断。以后单独选等宽字体时才不同，`policy` 不管它。

### 4.2 优先级链

固定四层，和实现方案 §5.1 相同：共同规格（`locked` 与 `follows`）→ 所选皮肤 → 所选或推荐字体 → 入口的明暗、密度、语言与硬性可访问性规则。皮肤的完整值由 `resolveSkin(spec, baseline, skin?)` 算出：**皮肤自己的值 → `follows` 指向的角色已解析的值 → 基线皮肤的值**；皮肤写了 `locked` 角色就拒绝（FSS-57）。语言只影响文字和字形后备，不改皮肤或字体的选择。

### 4.3 服务端和浏览器同一份

`resolveUiEnvironment(input)` 在 SDK `/ui`，无 I/O，宿主和页面都用它。输入是已解析好的规格、皮肤、字体方案、语言选择，以及可选的设备偏好。浏览器不读文件，所以不重新解析皮肤，只调 `withDevicePreferences(snapshot, device)` 把设备偏好合进去。FSS-48 让同一输入在 Node 和浏览器打包后各跑一遍，比 JSON 相等。

### 4.4 首屏（第 16 批，先把路定下）

A 段什么都不改：令牌仍在基础 CSS 里，没有选择，快照由基线算出，只给样例和组件板用。第 16 批：

| 东西 | 怎样到页面 | 为什么 |
| --- | --- | --- |
| 快照 | HTML 里一段 `<script type="application/json" id="ui-environment">`，不执行 | 几百字节，要同步可得；CSP 已允许内联 |
| Soft Workbench | 不多发请求，令牌就在基础 CSS | 默认路径零成本 |
| 其他皮肤 | `<head>` 里一个 `<link rel="stylesheet" href="/assets/ui-skin/<id>-<revision>.css">`，排在基础 CSS 之后，选用时下发的 `@font-face` 也写在这张表里；明暗仍是 `html[data-resolved-theme]` 两个分支 | 阻塞首绘，不闪默认皮肤；引导脚本不用改 |
| 语言（用户定：工作台一份，插件按需） | `clientI18nScript`（`apps/workbench/src/i18n.ts:154`）换成工作台的词一个阻塞 `<script src="/assets/locale/workbench.<语言>.<摘要>.js">`；插件的词在挂载之前取，同一屏合成一次批量请求（N52）。两个例外，怎样拿到留给第 16 批：Issues 第一屏就要（隐藏文档把整本目录交给框架）；英文工作台的 Goals 要同步可得（`LF`、`LFor` 同步读 2～3 条） | 字节搬到量得到、可缓存的地方。再次打开英文工作台从 2,573,362 B 降到 667,040 B（计算值，`resource-budget.md` 第 4.2 节） |

皮肤、语言的路由不是字面量，第 16 批前的门禁 PR 一起教给 `page-assets`。

### 4.5 iframe（第 16 批）

插件 frame 是不透明来源，CSP 写死 `connect-src 'none'`（`plugin-frame/document.ts:9`），只有 `/assets/` 下的样式和字体能加载；词今天经 `molis:plugin-connect` 一次性传入（`parent.ts:269`），带整本页面词典。

- **语言包：** `FrameConfig.messages` 换成 `environment: UiEnvironmentSnapshot` 和 `text: { owner; pack; shared }`，只带本插件和 `common.*`。子页面不发请求。
- **切换：** 父页面经已绑定的 `MessagePort` 发 `{ type: "environment", snapshot, text?, documents?, skin_href? }`，子页面换上下文，跑第 5.4 节同一段合并代码，换皮肤换一个 `<link>`。来源校验就是这条端口本身（FSS-08）。设备偏好继续走现有 `state` 消息（`parent.ts:148`），不新增通道。
- **插件代码：** `startChild` 在加载插件脚本之前装上下文（第 5.2 节），插件脚本 `import { t }`，用自己打进去的那份 SDK。
- **`host.translate`：** A 段不动。C 段删 `translate`、`globalThis.L`、`molisFrameFillMessage`，所有调用改完，不留两条路（决定 20）。

**`molis-work:ui-environment-changed` A 段不登记：** 没有真实发送者和监听者，`scripts/gates/dom-events.mjs` 会拦没人用的条目。第 16 批接文档控制器（发送）和终端重新测量（监听）的那一片才登记。

## 5. SDK `/ui` 工具清单

都加在 `packages/plugin-sdk/src/ui/` 下，`packages/plugin-sdk/src/ui.ts` 多几行 `export *`，不开新入口。不引 Node 内建模块，只用 `Intl`。`sideEffects: false` 加上不在模块顶层跑东西，现有插件包只引 `renderButton` 时不会变大，由 `page-assets` 门禁证明。

| 导出 | 文件 | A 段谁在用 |
| --- | --- | --- |
| `t`、`say`、`format` | `ui/text.ts` | 样例、组件板。业务代码只用 `t`、`format`；`say` 给拿到 `OwnedTextRef` 的地方 |
| `installUiText`、`installTextForTest` | `ui/text.ts` | 宿主、开发路径、组件板浏览器脚本（第 5.2 节）；测试和两包样例 |
| `dateArg`、`numberArg` | `ui/text-ref.ts` | 样例、组件板。字符串和普通数字不用它们，`t(key, { title: "x", count: 3 })` 直接写 |
| `textArgs` | `ui/text-ref.ts` | 把业务写的 `{ count: 3 }` 转成存下来的数组；`t`、组件板 |
| `textRefProblems(value, { literal?, key?, owned? })` | `ui/text-ref.ts` | `ownedTextRef`；`say`；CLI；之后的 05② `validatePresentationDeclaration`、`assertSurfaceDescription`，20 `validateSettingsDeclaration`、`inspectBlueprint` |
| `ownedTextRef(ref, owner)`、`tryOwnedTextRef(ref, owner)` | `ui/text-ref.ts` | 宿主；之后的 15 组合服务。`try` 那个不抛，坏了返回 `null`，给 05② 页面读值（第 2.3 节） |
| `formatMessage(message, args, locale, { now?, problem? })`、`formatNumber`、`formatDate` | `ui/message-format.ts` | `t`、`format`；组件板。都只出纯文本，转义由调用方对全文做一次 |
| `parseLocalePack(source, { file?, contentPack? })` | `ui/locale-pack.ts` | `pluginLocaleReader`（plugin-runtime）；工作台语言文件；CLI |
| `inspectLocaleSet(packs, { default, contentPack?, directory? })` | `ui/locale-pack.ts` | CLI `validate`；安装与打包；组件板标本的问题列表 |
| `matchLocale(requested, available, fallback)` | `ui/locale-pack.ts` | 查词；组件板 |
| `createTextReader({ packs, locale })` | `ui/text-reader.ts` | 纯函数，给定语言包查词，返回和 `say` 一样的工具：调用本身转义全文，`.text` 给纯文本（第 5.3 节）。收绑过主人的引用，声明先用 `tryOwnedTextRef` 和包的 `plugin_id` 绑。还没装的包的预览、`plugins.bundled.list@1`、测试。每个主人的第一个语言包算默认语言 |
| `parseStrictJson` | `ui/strict-json.ts` | 下面三个 `parse*`；`parseLocalePack`；CLI |
| `parseUiSpecFile`、`parseSkinFile(source, spec)`、`parseFontScheme` | `ui/appearance-files.ts` | `packages/design-system` 基线加载；组件板 |
| `parseResourceRegistry` | `ui/appearance-files.ts` | 宿主资源适配器、`packages/design-system` 的基线加载与 `fontFaceRules`、资源报告、`tests/ui-resources.test.ts`（第 1.3 节）。解析和拒绝照第 3.1 节（FSS-46），`UI_RESOURCE_KINDS`、`UI_RESOURCE_LOADS`、`format.ui.registry`、`UI_FILE_LIMITS.registry` 的读者就是它 |
| `resolveSkin(spec, baseline, skin?)`、`skinTokenDeclarations(resolved, { theme?, terminal?, groups?, names? })` | `ui/appearance-resolve.ts` | `palette.ts` 等。引用成环可能跨皮肤和基线两个文件，所以 `resolveSkin` 也返回 `UiFileResult`；`names` 指定哪几个角色、什么顺序，给 `foundation.ts` 这种令牌分散写的模板 |
| `resolveFontScheme(spec, baseline, scheme?)`、`fontTokenDeclarations(resolved, names?)`、`fontFaceRules(resolved, registry)` | `ui/appearance-resolve.ts` | `typeface.ts`。`resolved.tokens.font` 就是字体栈文字 |
| `resolveUiEnvironment`、`withDevicePreferences`、`UI_ENVIRONMENT_PROBLEM_LIMITS` | `ui/environment.ts` | 组件板；第 16 批的首屏 |

`ui/text-lookup.ts`、`ui/text-errors.ts`、`ui/file-reader.ts`、`ui/token-values.ts` 是这些工具共用的内部文件，不进 `ui.ts`。

**不在 A 段导出的**（没有消费者）：`formatList`（`listJoin` 到 C 段才换）、按声明查引用的 `inspectTextRefs`（15、20 的第一片带上）、动作文字键的拼法（FSS-40 暂不实现，只定写法）。

**作者工具与平台共用：** `inspectLocaleSet` 查缺键、多余键、参数不一致、缺复数形式、`hidden_number`、标记字符（第 5.3 节，内容包不查），返回 `{ file, code, locale, key, reason, fix, blocking }[]`。默认语言缺键（别的语言有、默认语言没有）、参数不一致、标记字符算 `blocking`，平台拒绝；别的语言缺键不阻断，算覆盖率（FSS-34 可观察，FSS-37）。缺复数形式会回到 `other`，`hidden_number` 读得通但不好，都只报告。CLI 的 `validate` 调同一个函数，作者和平台看到一样的结果。

### 5.1 工具的形状

类型在 `platform/ui-text.ts`（T2 加，T1 不用等它）。`TEXT_NUMBER_STYLES`、`TEXT_DATE_STYLES` 同时导出（不叫 `NUMBER_STYLES`：design-system 已有同名的 CSS 字符串），T4 的 `textRefProblems` 查 `style` 和 `kind` 配不配；`TextNumberStyle` 是前者的类型，与 `TextDateStyle` 对称：

```ts
/** 业务写的参数值。按分支展开写，不用 Omit<TextArg, "name">：那样会压扁联合（tsc --strict 实测，{ kind: "number" } 缺值也能过）。 */
export type TextArgValue =
  | string | number                          // 普通数字不分组
  | { readonly kind: "number"; readonly number: number; readonly style?: TextNumberStyle }
  | { readonly kind: "date"; readonly at: string; readonly style: TextDateStyle };
export type TextArgs = Readonly<Record<string, TextArgValue>>;

export interface UiTextTool {
  /** 结果可以直接拼进 HTML 文本和属性（第 5.3 节）。 */
  (key: string, args?: TextArgs): string;
  /** 同一句话，字符串参数不转义。给 textContent、new Option、会自己转义的部件。 */
  text(key: string, args?: TextArgs): string;
}
export interface UiSayTool {
  (ref: OwnedTextRef, options?: UiSayOptions): string;
  text(ref: OwnedTextRef, options?: UiSayOptions): string;
}
export interface UiSayOptions {
  readonly extra?: readonly TextArg[];       // 15 的「同一件事」由页面补标题
  /** 只给平台服务用：显式指定语言；null 是明确要主人的默认语言。业务代码不写。 */
  readonly locale?: string | null;
}
export interface UiFormatTool {
  date(at: string, style: TextDateStyle): string;
  number(value: number, style?: TextNumberStyle): string;   // 没写 style 按 decimal，分组
}

/** 平台装进来的上下文。SDK 不存语言和译文。 */
export interface UiTextProvider {
  /** 当前的语言；没有页面、平台入口也没给时是 null。 */
  locale(): string | null;
  /** 语言是 null 时怎么办：正式运行 "default"，开发路径和测试 "throw"。 */
  noContext(): "default" | "throw";
  /** t 用：键的第一段对应的完整主人。这张索引的范围见第 5.2 节。 */
  ownerOfPrefix(prefix: string): string | null;
  /** owner 永远是完整主人：plugin_id，或平台主人名。 */
  message(owner: string, key: string, locale: string): UiMessage | null;
  /** 主人的默认语言，给 locale: null 和正式运行里没有语言时用。 */
  defaultLocale(owner: string): string | null;
  /** 查不到词、没有语言、坏日期时记一条问题。 */
  problem?(problem: { readonly code: string; readonly owner?: string; readonly key?: string; readonly locale?: string }): void;
  /** 只有浏览器给：记下这个结果是哪句话，切语言时用（第 5.4 节）。 */
  produced?(output: string, ref: OwnedTextRef): void;
}
```

`environment` 不进工具：业务代码本来就不该读它。组件板直接调 `resolveUiEnvironment`。

**`format` 也返回普通字符串，**切语言时和 `t` 一样由第 5.4 节处理。

### 5.2 主人和语言从哪来

**主人：两种查法分开，不共用一张表。**

| | `say(ref)` | `t(key)` |
| --- | --- | --- |
| 按什么查 | `ref.owner`：完整 `plugin_id`，或平台主人名 | 键的第一段（`messageOwnerOf`，第 2.3 节），经 `ownerOfPrefix` 换成完整主人；`common.*` 归 `workbench` |
| 谁登记 | 所有主人：内置、开发路径、外部、内容包、平台。**不查同名** | 只有能在这个进程调 `t` 的：内置、开发路径、平台主人。外部插件和内容包不进 |
| 同名时 | `io.molis.work.a.notes`、`io.molis.work.b.notes`、第三方 `io.molis.work.acme.todo` 和内置 Todo 各查各的 | 只有这张索引报 `ui.text_owner_conflict`，开发路径启动时就报（今天 `createPluginMessageStore` 同样检查） |

外部插件的 `t` 跑在它自己的沙箱进程和 iframe 里，那里的索引只有它自己和 `common`，所以第三方不会因为同名装不上。`t` 不需要知道「现在是谁在画」，服务端异步和浏览器事件里也不会丢。

**语言从平台装的上下文来。** 上下文放在 `globalThis[Symbol.for("molis.work.ui-text.v1")]`，SDK 每次调用时读。不用 SDK 的模块变量：内置插件的发行物把 SDK 打进单模块（`native-plugin-release-artifact.ts:34-38`），恢复时 `import("data:…")`（`:56`），一份插件一份 SDK；`Symbol.for` 在同一个 realm 里是同一个（实测）。键带 `v1`，因为外部插件打进去的是发布时那份 SDK：`UiTextProvider` 改形状时，阶段一原地改，阶段二宿主同时装新旧两个键（`CONTRACT-CHANGES.md`）。

**进程里只装一次。** 一个测试进程常开多个宿主（`createSpaceWebServer`），所以同一个 provider 重复装是无操作，换一个要先用撤回函数。provider 不依赖具体宿主：语言在 `AsyncLocalStorage`，词在进程级的 `plugin-text.ts`。门禁：`globalThis` 只有 `contracts-purity.mjs` 数，只管合同包；这是读脚本加 `tsc --strict` 单文件的结论，T4 的 `pnpm health:check` 为准，红了停下问，不改门禁。

| 路径 | 语言 | 词 |
| --- | --- | --- |
| 开发路径（`molis-work plugin dev`，A 段唯一真实可走的路） | `runPluginDevelopment` 给：`--locale`，没写用插件默认语言（第 8.3 节） | `plugin-text.ts` |
| 内置插件的服务端、动作处理器（第 16 批） | 页面请求的语言；模型工具调用由动作网关按 `ActionCallContext.locale` 包一层 | 同上 |
| Module、`horizontal/` | `say(ref, { locale: context.locale })`，可以用 SDK（`PACKAGE-BOUNDARIES.md` 第 36 行），不 import 工作台 | 同上 |
| 主文档的浏览器代码、内联脚本（第 16 批） | `clientI18nScript` 的位置（`i18n.ts:154`）装，取 `<html lang>`。内联脚本 import 不了（107 个文件、约 2,271 处），`t`、`format` 放到页面全局，和今天 `L` 同一个位置；局部变量名冲突见第 14 节 | 工作台一份；插件的词挂载前到（第 4.4 节） |
| iframe（第 16 批） | `startChild`（`child.ts:43`）在加载插件脚本之前装，取 `FrameConfig.environment` | 只有本插件和 `common.*` |
| 沙箱插件（第 16 批） | 调用消息带 `locale`（今天没有），启动脚本装上下文 | 同上 |
| 作者的测试、两包样例 | `installTextForTest({ packs, locale })`，返回撤回函数 | 自带 |

**后台不继承请求的语言。** `AsyncLocalStorage` 会被定时器和懒打开的对象继承，`web-server.ts:138-156` 又给每个请求语言，所以从页面请求的 async 链上起的工作会一直用那个页面的语言（实测：en 请求里起的定时器一直是 en）。现成的路：`assistant-dispatch.ts:245` 的 `continuations.watch`，之后 `assistant-service.ts:81` 以 `byHost` 开下一轮；`activation-jobs.ts:97` 的定时器和作业（`outsidePluginAction` 只退出插件范围，不退出语言）；`host.withProject` 懒打开的 Runtime。平台两层解决，业务不写：

1. **语言随范围结束作废。** 结束标记放进开范围的函数本身（`runWithLocale`、`runBackgroundWork`），不只 `web-server.ts:156`：`fn` 同步返回的当场标上（`web-catalog-board.ts`），返回 promise 的等它结束。`locale()` 读到作废的当没有。不靠入口名单，请求里嵌套的范围（`plugin-interaction.ts:82`）和后台范围里起的定时器都读不到旧语言（原型实测：范围内 en，结束后 null；4 个并发不串）。`pageLocale()` 本身不动，这一层只给 provider。不等流结束的路由（`plugin-builder/agent-surface.ts:286`，今天不译文字）第 16 批在打开时取下语言。T8 做。
2. **平台的后台入口给语言。** `runBackgroundWork(locale, fn)`（`web-locale.ts`）：入口每次开始运行时读「最后用的语言」（第 15.1 节）传进来，在新的范围里跑 `fn`，结束同样作废；范围里的语言由 `activeLocale()` 读，`pageLocale()` 和 `L` 不受影响。不做无参的 `runBackgroundWork(fn)`：记录按 Home 存，`web-locale.ts` 不知道是哪个 Home，一个进程又常开多个宿主，存一个进程级的 Home 就会串。第 16 批入口多了，再加 `backgroundWorkIn(home, fn)`，把读记录和开范围合在一处。入口是上面三处、`periodic-tasks.ts` 的 tick 和定时任务。`plugin-runtime` 不依赖 `local-host`，经 `gate.operation`（`activation-jobs.ts:100`）这一层由宿主传入，写手核。T10 做助理的入口，其余第 16 批接第一处后台 `t` 时做。T8 和 T10 先后不定：范围类型只写一份，后合的那片负责 FSS-69 的后台范围用例。

今天的 `pageLocale()`、`L` 同样继承（`web-locale.ts:8` 的注释说定时器里没有，不准确）。A 段不改（决定 20），主会话登待办。

**没有语言时（主会话裁定）：** 正式运行用主人默认语言，记一条可观察的问题，不抛；开发路径和测试抛 `ui.text_no_context`，错误里点名键。模式由装上下文的平台给。**进程里还没装 provider** 时没有模式可读，算接线错误，按开发路径抛（`literal` 不用查词，照常显示）：宿主启动时就装，所以它第一次运行就暴露，不会等到正式运行里某个定时器才碰到。`t`、`say`、`format` 在正式运行里一律不抛（语言包读不了、坏日期同理），**错误路径上的文字绝不能盖掉原错误。** 理由是抛错的真实代价：

| 位置 | 如果抛 | 依据 |
| --- | --- | --- |
| 页面请求 | 基本不会发生，每个请求都有语言 | `web-server.ts:156` |
| `try` 里的后台路径 | 一句话把真正的原因换掉。定时安排遇到没配模型：`assistant-service.ts:219` → `assistant-error.ts:13` 的 `L` 抛错，「还没有配置模型」丢了，`assistant-followups.ts:232` 把给开发者的说明记成失败原因。`project-deletion-service.ts:54` 的拒绝换成另一个错误码，每分钟重试 | 读代码 |
| 没人接的定时器或 promise | 整个宿主退出。全仓没有 `uncaughtException`、`unhandledRejection` 处理，实测退出码 1，一个 Home 只有这一个执行进程。没有找到今天真走到这一行的翻译调用，只说后果 | 实测加读代码 |

代价是漏掉的路显示默认语言。靠问题记录和第 14 节的盘点发现；要存进记录的，靠开发路径和测试抛错抓。模块顶层（`const X = t("a")`）同样按这一条处理，今天 AST 只数到 1 处，改到函数里。

**服务端读字的路只有这一条：** `say(ref, { locale })`，经全局上下文找词，主人卸载时走 `fallback`，都不 import 工作台。

- `characters.from_template@1` 写 `say.text(template.title, { locale: context.locale })`。没有 `locale` 就拒绝这个动作（它只给本人，一定有页面）。
- 05② 的 `presentationText(object, values, locale)`，`locale` 必填，可以是 `null`（明确要主人默认语言）。MCP 这条传第 15.1 节的最后用的语言。

### 5.3 转义和不被冒充

**`${t("key", args)}` 直接可用且安全，靠两条：**

1. **语言包的文字里不许有 `<`、`>`、`&`、`"`、`'`。** `parseLocalePack`、`inspectLocaleSet` 默认拒绝，`fix` 给出替换（`’`、`“ ”`、`and`、`›`）。
2. **算出全文之后，把全文转义一次。** 先用原始参数算，再转义，所以不会有 `&amp;amp;`。数字和日期经 `Intl` 输出后也在全文里。严格的词表没有这些字符，所以对 `t` 来说，转义全文和只转义参数结果相同，只留一种写法。

**只有内容包不查这五个字符（统筹裁定）。** 判断只有一个：已解析的 `manifest.kind === "content"`，由 `inspectPluginLocales`、`pluginLocaleReader` 决定（`contentPack: true`），不让语言文件自己说，也不让各调用方各传一份。理由：Skill frontmatter 和用户 `literal` 转的词可能有 `don't`、`<file>`、`R&D`；内容包的词不进 `t` 的索引（第 5.2 节），只经 `say` 和 `createTextReader` 读，这两个一律转义全文。`PluginKind` 现在还没有 `content`（08 C-1 加），所以 A 段没有解析过的 Manifest 走到这一支，T7 的用例用手写的 Manifest 证明这一支。`locale-packs.ts` 的函数收 `PluginLocaleManifest`（`plugin_id`、`kind: string`、`ui.locales`）而不是 `PluginManifest`：包里的 Manifest 是 `PluginManifest | SandboxPackageManifest`，这样两种都能传，08 也不用改这里。**外部沙箱插件照样查：** 它的 `t` 在自己的沙箱和 iframe 里，索引里有它自己的词，放宽了第三方的 `${t()}` 就不安全。

结果：`t` 不带字符串参数的调用，结果就是纯文字，拼进 HTML、赋给 `textContent`、再过一次 `esc`，三种都对。带字符串参数时分不出下游（`${obj}` 和 `el.textContent = obj` 都调 `toString()`），所以默认选安全的一边。`say` 没有这个「三种都对」：内容包的词、`literal`、`fallback` 都可能带这些字符。`format` 没有 `.text`，结果也转义：坏日期显示 `at` 原文，它可能来自存下来的数据。

| 位置 | 写 | 写错的后果 |
| --- | --- | --- |
| 拼进 HTML 文本或属性（`title="${…}"`） | `t(key, args)`、`say(ref)` | 没有错 |
| `textContent`、`el.title =`（DOM 属性）、`new Option`、`showToast`、`renderButton({ label })`，这些自己当文字用或自己转义 | `t.text(key, args)`、`say.text(ref)` | 写成 `t`：值里有这些字符时显示成 `A&amp;B`、`O&#039;Brien`。纯字母的测试数据看不出，所以 FSS-70 和手册实走都带一个含 `'` 和 `&` 的参数。写成 `say` 同样显示 `R&amp;D`，而且不限于参数：词本身就可能带。`esc(say(ref))` 转义两次 |
| HTML 属性或文本写成 `t.text`、`say.text` | 不许 | **注入。** `say.text` 比 `t.text` 更要紧：第三方内容包的词可以带 `<img onerror=…>`。可以静态查（`.text` 出现在模板插值里），新门禁要先问用户，这里只给建议 |

`createTextReader` 和 `say` 一样分两种形式（`plugins.bundled.list@1`、预览会用）：内容包的词从这里出来，同样不能少了这一层。

`UiTextProvider.produced` 记的是纯文本：第 5.4 节拿它和 DOM 里的文字节点比，那里已经解过实体。

**迁移不能一刀切。** 实测（AST，不含内联脚本和 `-en.ts`）：5,557 处里 4,846 处没有参数，164 处只有数字，547 处有字符串或看不出类型的参数；内联 2,271 处没有按位置分。无参的字面量键可以批量，547 处默认 `t.text` 可以批量，**但预转义和 HTML 参数、`L(变量)`、内联脚本的局部变量 `t` 这三类要先挑出来**（第 14 节）。今天 15,554 个译文里含 `'` 682 个、`&` 18 个、`"` 13 个、`<>` 9 个，前三种脚本替换；`<>` 里 7 个是冲突标记，改成字符串参数，2 个是 `<li>` 整段，要拆。

**冒充：** `t` 用别人的前缀不拒绝。同一进程里 `t("todo.x")` 能查到 Todo 的词，但这不是权限，插件本来就能在自己页面上写任何字；iframe 和沙箱里查不到，走 `common.text.unavailable`。防冒充要成立的地方是显示在平台位置上的字，比如插件的 `summary` 显示在别人的卡片上：那里只认 `OwnedTextRef`，由 `ownedTextRef` 按前缀绑主人（第 2.3 节，FSS-42、43）。

**存字符串的例外**只有 20 的 `RoleTemplate` 的 `title`、`materials`、`outputs`：采用时写进用户自己的草稿，归用户所有，之后不随语言变（场景设计稿已定 `title`，后两个同样处理）。写法是 `say.text`，所以存下的是可能带标记的原文（第三方内容包的词），**读的地方要按用户文字转义**，`characters.from_template@1` 的 `title` 也一样。

### 5.4 切语言时的原地更新（FSS-35，第 16 批的方案）

**定位（主会话裁定）：** 这是第 16 批的方案，A 段只要证明 `t` 没有标记不会堵死它。T8 的标本证明基本盘（FSS-61）；**第 16 批验收要在真实首屏过，不靠组件板**，组件板没有首屏日历和助理标签这些写法。

否掉的办法：整块 morph（客户端加的行、抽屉、对话框被当成多余删掉）；字符串里夹不可见字符（漏进比较、长度和存储）；只靠产出记录按字面替换（用户的待办叫 Save 也被译）；整页刷新（违反 FSS-35）；业务写 `onLocaleChange`（业务侵入）。

**三方文字合并。** 服务端把同一页按旧、新两种语言各画一遍，两份的差异就是要改的字；用户内容两边相同，不在差异里。两份 HTML 结构差异是 0、同语言两次渲染噪声是 0，评审台静态比过 7 个页面。

**不碰的内容（第 3、4 步都用，「两个都换」也不例外）：** `textarea`、`contenteditable` 及其内部的文字节点；`input`、`textarea` 的 `value`；`translate="no"` 及其内部的文字和属性。这些元素自己的 `placeholder`、`aria-label`、`title` 是界面字，照常改（七个页面逐节点比过，这类差异有 117 处，不改就留旧语言）。`input type=hidden` 的 `value` 有 4 处两种语言不同，T8 看过：都是表单数据，不合并（Goals 每次渲染都不同的随机 `newToken`；日程的 `clock_label`，会抄进时间字段存下；连接器的 `display_name`，抄进 `body.display_name`）。所以只有按钮类 `input` 的 `value` 算界面字。可编辑节点的文字会被存进数据（Jelly `blocks.ts:39,57`、`note-events.ts:103`；`pages/src/editor-gap.ts:129,153`），超出用户接受的「不写数据」。

1. **全部取到才动页面。** `fetch(location)` 两次，用请求头指定语言（语言不是权限，这个头不授予任何东西）；取工作台和本页插件的新语言词。主文档里每个 iframe 的文档就在 `script[data-plugin-document]` 里，不多发请求。**任何一步失败：** 页面和偏好都不动，说一句没切成，给重试。都到了才写偏好、换上下文。
2. **算差异。** 两棵树同步走，记下不同的文字节点和属性（`checked`、`selected`、`open`、`style`、`class` 除外）。`value` 按元素类型分：按钮类算（演示页有 6 处），输入框不算。还要走进 `<template>` 的内容（每页 5 个），`<script type="application/json">` 按整段比（选择页 `arrival-data`）。CSS 变量里的字（`navigation-presentation.ts:9` 的 `--stage-title`）不合并，由画它的代码重跑。
3. **序列对齐后写回。** 按最近的带 `id` 或 `data-plugin-contribution` 的祖先分组，旧 HTML 的文字序列和现有 DOM 的文字序列做最长公共子序列，对上的才改，对不上的不动。客户端节点是多出来的，不占位置。**同字紧挨（中间没有别的字）对不准，这时两个都换**，真界面字不留旧语言。只改 `Text.data` 和 `setAttribute`，没有删除节点、没有 `innerHTML`，所以节点、事件监听、焦点、输入框内容和选区、滚动、`details` 和 `dialog` 的开合都不动（评审台真实 Chrome 实测保住输入内容、焦点和选区）。结构不同的子树：里面没有表单控件和客户端节点就整块换，否则留着并记一条问题。
4. **客户端画的字。** 第 3 步之后，整个节点的文字（或上述属性）等于产出记录里的一条，就按记录的键和参数重算。记录上限 2,000 条，先进先出。
5. **发一次现有的失效**（`molis-work:select-item { invalidate: true }`，`tab-workspace-plugins.ts:212`）。有自己重取路径的列表和切换途中打开的标签由此重取。评审台跑的 5 个场景里这个选择器匹配到 0 个，没查透，**不能指望它纠正真界面字**。

切换串行：进行中再切就排队，只做最后一次。iframe 由父页面经端口把新语言包和两份文档发给子页面，跑同一段代码。

**序列对齐跑过了，离线：** 7 个页面的两种语言真实渲染，1,731 句界面字（同一锚下去重），每句在四个位置各加一个同字的客户端行，共 6,924 次；另删真节点 248 次。不加「两个都换」：隔着别的字的都对，紧挨的有 1,890 次把客户端行译掉、真界面字留旧语言（序号定位在隔着字时也错）。加上：真界面字留旧语言 0 次，译错 0 次，客户端行译掉 3,780 次，全是紧挨的；删节点 0 处错。**限制：** 用 `htmlparser2` 模拟，不是浏览器；每次只加一个节点；连续几条客户端行、服务端画的用户内容也同字、节点重排、iframe 都没跑。

**残余：**

1. **客户端画的、和界面文字一字不差的用户内容，临时显示成译文。** 用户 2026-11-07 接受，范围只限：只影响显示，不写数据，之后重画或重新打开恢复。**超出这个范围（真界面字留旧语言、译错、半页中文）不算用户接受，第 16 批实走出现就停下问，不放宽 FSS-35。**
2. **首屏有几种写法这个办法认不出，第 16 批要先改完才过得了首屏：** 直接 `new Intl.DateTimeFormat`（`project-home.ts:72,100,110`），改 `format.date`；`L(...).replace(…)`（`project-home.ts:141`、`assistant-island.ts:125`），改带参数；半句拼接（`project-home.ts:222`、`assistant-tabs.ts:28`），改整句一个键。它们进第 14 节。评审台实测首屏全走完仍有 9／34、17／58 处中文，含原型没记录的打包翻译，不全是这几种。
3. **在途的旧响应：** 切换时正在路上的片段是旧语言，下一次重取才变。

**T8 落地时与上面不同的三处（第 8.6 节）：** 第 3 步「结构不同的子树整块换」没有做，两份渲染形状不同就整块不动并记一条问题；第 5 步没有做（要动 DOM 事件登记，归第 16 批）；「两个都换」写成「可达」规则（第 8.6 节第 4 条）。

**代价：** 一段平台代码，估计 150 行上下，放 `apps/workbench/src/browser/locale-switch.ts`，**没有量过**，超过 10 KB 按规矩问用户；切一次语言多画两遍页面（第 11 节）；浏览器里每次 `t` 多一次 `Map.set`。

**还没有证明的：** iframe 内部的合并、在途响应、连续切换、画两遍 GET 有没有写入副作用和耗时。第 16 批实走发现哪类页面保不住，**停下交回，不放宽**。

## 6. Manifest 与语言文件

### 6.1 声明

`packages/contracts/src/platform/plugin-manifest.ts`：

```ts
export interface PluginLocalesDeclaration {
  readonly default: string;
  readonly available: readonly string[];   // 文件就是包里的 locales/<语言>.json
}
// PluginManifest.ui 增加
locales?: PluginLocalesDeclaration;
```

`parsePluginManifest` 检查：语言标记形状；`default` 在 `available` 里；语言不重复；`available` 最多 32 种（`PLUGIN_LOCALE_LIMITS`，合同常量）；`ui.locales` 只有 `default`、`available` 两个键，别的键拒绝，不静默忽略；`plugin_id` 最后一段要能当键的第一段（以字母开头，不是 `common`），否则这个插件写不出一个键（第 2.3 节），这条只对写了 `ui.locales` 的 Manifest。

**同一个 Manifest 不能既写 `ui.locales` 又写 `ui.messages` 或 `ui.translations`，写了就拒绝。** 这是 A 段「不双认」的落法：没有一个翻译器同时读两种格式，也没有一个插件走两条路。现有写法里只有样例写 `ui.locales`（第 08 批的内容包是新东西，也写它，第 12 节第 4 条）；第 16 批 C 段一次改完并删掉旧字段。**测试断言 C 段之前没有内置 Manifest 写 `ui.locales`**（FSS-53）：新内置插件一写，就成了决定 20 不许的逐插件切换。用户 2026-11-07 同意这样并存到第 16 批（第 12 节第 4 条）。

### 6.2 内容怎样走

已核实：内置的 `nativePluginReleaseArtifact` 打成单模块（`apps/local-host/src/native-plugin-release-artifact.ts`），恢复时是 `data:` URL，**模块里读不到包内文件**；外部安装走沙箱包，`readSandboxPackage` 只收格式内的文件（`apps/local-host/src/sandbox-package.ts:79-82`）。所以语言文件不能由插件代码自己读，要由平台读。

平台只有一个读取函数，新文件 `packages/plugin-runtime/src/locale-packs.ts`：

```ts
export function inspectPluginLocales(manifest: PluginLocaleManifest, read: (path: string) => string | null): readonly LocaleSetProblem[];
export function pluginLocaleReader(manifest: PluginLocaleManifest, read: (path: string) => string | null): PluginLocaleReader | null;  // 没有 ui.locales 是 null
export function assertPluginLocales(manifest: PluginLocaleManifest, read: (path: string) => string | null): readonly LocaleSetProblem[];  // inspect 的拒绝形式：blocking 就抛 plugin.package_invalid，其余的返回
export function pluginLocaleFilePaths(manifest: PluginManifest): readonly string[];   // locales/<语言>.json，路径只在这一处写
export interface PluginLocaleReader {
  readonly owner: string;                       // manifest.plugin_id，不从文件读
  readonly default: string;
  readonly available: readonly string[];
  pack(locale: string): UiLocalePack | null;    // 第一次用到才读和解析，文件坏了不抛，得 null
  problems(): readonly LocaleSetProblem[];      // 读过的文件有什么问题，给 T8 记问题或在开发路径抛
}
```

**一份规则，两个时机：**

- **`inspectPluginLocales(manifest, read)`：安装、`validate`、`pack` 时读全部语言一次。** 逐个 `parseLocalePack`，`contentPack` 按 `manifest.kind === "content"` 给（第 5.3 节）；`pack.locale` 不等于文件名、`pack.owner` 不等于 `manifest.plugin_id` 就拒绝；`inspectLocaleSet` 有 `blocking` 就拒绝。
- **`pluginLocaleReader(manifest, read)`：运行时。** 每种语言第一次用到才读和解析，之后走内存，没用到的语言不读（第 11 节）。沙箱包 `load` 时虽然验签要读整个包，语言文件也只在第一次用到时才解析。单个文件的规则（缺文件、解析、`locale`、`owner`）和 `inspectPluginLocales` 是同一个内部函数。运行时读坏文件不抛（第 5.2 节「语言包读不了」），`pack` 得 `null`，问题留在 `problems()`。

`read` 由来源给，这样只有一套规则：

| 来源 | `read` 从哪来 | 哪一片 |
| --- | --- | --- |
| 本地开发（`molis-work plugin dev`，样例走这条） | 新函数 `loadDevelopmentLocalePacks(directory, manifest)`，放在 `development-loader.ts`，读项目目录，沿用那里现有的 `realpath` 加根目录核对，防符号链接跑出去。异步，返回 `PluginLocaleReader | null`；**打开时核全部声明的文件路径**（缺文件、链接跑出项目目录都当场抛 `plugin.package_invalid`），内容仍是第一次用到才读。项目目录里的链接指向项目目录里的文件不算跑出去 | A。**这是 A 段唯一真实可走的路** |
| 打包（`molis-work-plugin pack`、`validate`） | `packPluginProject` 按 Manifest 自动把声明的文件加进 `files`（`packageFileReader` 只收逐个写明的普通文件，这里正好逐个写），写输出之前调 `assertPluginLocales`；`parsePluginPackage` 只核对声明的文件都在，和入口文件同样处理（`package-verification.ts:50-54`），不解析内容：验签和每次读包都走它，放进去就违反上面「第一次用到才解析」。`validate` 读 Manifest 旁边的语言文件，同样走 `packageFileReader`，`blocking` 的失败，其余的放进输出的 `locale_notes` | A。带 `ui.locales` 的包能打、能校验，装不上（见下） |
| 外部安装（沙箱包） | 见 6.3 | 第 16 批 |
| 内置插件 | 登记上的 `package_name` 解析到包目录，包的 `files` 加 `locales` | 第 16 批。A 段没有内置插件声明，写了就是死代码。23 个登记里 `alchemist`、`plugin-builder` 没有 `package_name`（两个批过的构建期例外），它们另给包目录（第 14 节） |
| 内容包（08） | 保存的已验证包，和 08 的方法正文同一条路 | 08 C-1、C-2。词在安装记录启用时按完整 `plugin_id` 登记进 `say` 的表，停用时撤回，不进 `t` 的索引（第 5.2 节）；随包带上、还没装的，预览和 `plugins.bundled.list@1` 按包读，用 `createTextReader` |

**08 要改（归第 08 批）：** `inspectContentPlugin` 的白名单收 `ui.locales`，去掉 `ui.messages`、`ui.translations`；`payload.files`「不多不少」的清单带上声明的语言文件。

**20 要改（归第 20 批）：** `blueprints.packs.save@1` 把草稿组成包时，`literal` 转成键，加单语言 `locales/<语言>.json`；草稿记 `locale`（第 15.4 节）。

A 段写了 `ui.locales` 的沙箱包被拒绝，**要有专门的拒绝，由 T7 加**（`apps/local-host/src/sandbox-package.ts`）：`readSandboxPackage`、`readSandboxIntegrationPackage` 在比较文件和形状之前，看到 `manifest.ui.locales` 就拒绝，消息说清沙箱包第 16 批才支持，现在要试语言文件走 `molis-work plugin dev`，要安装就先去掉 `ui.locales` 和 `locales/`。不提「先用 `ui.messages`」：沙箱包写 `ui.messages` 同样过不了（`sandbox-package.ts:114-121`，清单的形状不收它）。不能靠现成的错误：不带语言文件时形状比较报「清单不是沙箱插件的形状」，带了语言文件时报「包里有格式之外的文件」，作者都看不出原因，FSS-53 要的是被拒并说明。

**A 段不加 `locale_packs`，也不碰发行物。** `createPluginRuntimeReleaseArtifact` 只有内置插件在用，内置插件 `directlyUsable` 恒真，走当前构建，从不恢复存档；已有行还 `ON CONFLICT DO NOTHING`。外部包不进这张表。所以这个字段没有写入者也没有读取者。

**不把译文内联进 Manifest。** 看起来最省事（`ui.messages` 就是这样），但 N50 已测出冷启动 Manifest 摘要算三遍、`canonicalJson` 递归 31 万次，内联词典会把它放大；Manifest 还到处被复制。

### 6.3 第 16 批外部包走哪条路

不留死路，也不需要新表、新列或发行物字段。声明放进沙箱合同（`contract.json`，它已经是 `sandboxPluginManifest` 的输入，`sandbox-manifest.ts:126`）；`pack-sandbox` 按声明把语言文件放进 `payload.files`，在签名范围内；`readSandboxPackage` 的 `wanted` 加上这些路径并调 `inspectPluginLocales`；`SandboxPackageStore` 不用改，语言文件在已签名的包里；创作台 `RELEASE_FILES` 加上。上线时 `packagedRelease` 把读取器交给 `localePacks`，**词按完整 `plugin_id` 进 `say` 的表，不进 `t` 的索引**（第 5.2 节），iframe 和沙箱进程各只带本插件和 `common.*`。

### 6.4 现有字段与生成插件

`ui.messages`、`ui.translations`（`plugin-manifest.ts:187,195`）A 段不动，第 16 批 C 段删。生成插件现在没有词条声明：标题、列名是 `interface.json` 里的字符串，渲染器（`plugin-component-client.ts`）把它们当 `literal` 原样显示，这不是读取兼容，是它们本来的语义；渲染器自己的固定按钮、错误、日期改用 `common.*` 和 `format`（C 段）；创作台新生成的走 6.3；已安装的走实现方案 §7.3 的显式离线转换，转不了的列为阻塞。

## 7. 基线与内置资源

### 7.1 令牌再核一遍

用脚本按源码重数（`palette.ts`、`styles/foundation.ts`、`typeface.ts`、`styles/craft-finish-bar.ts`），和主会话的数字相同：**194 个，114 个分明暗**。

| 组 | 数 | 分明暗 | 位置 | 去处 |
| --- | --- | --- | --- | --- |
| 壳层 | 53 | 53 | `palette.ts:178-227` | 皮肤 |
| 形状、动效、焦点 | 31 | 0 | `palette.ts:242-252` | 皮肤 25，规格锁定 6（`focus-stroke`、`focus-stroke-inset`、`icon-xs/sm/md/lg`） |
| 控件尺寸 | 2 | 0 | `palette.ts:236` | 规格锁定（密度和触控规则要压过它） |
| hue | 42 | 42 | `palette.ts:39-52` | 皮肤 |
| tone | 7 | 0 | `palette.ts:152-153` | 皮肤（别名） |
| content | 15 | 2（`tty`、`tty-ink`） | `palette.ts:127-141` | 皮肤 |
| mark | 10 | 10 | `palette.ts:110-114` | 皮肤 |
| terminal | 6 | 6（第三条轴） | `styles/foundation.ts:10-15` | 皮肤 `terminal` |
| danger | 3 | 0 | `styles/foundation.ts:16-18` | 皮肤 |
| `--font` | 1 | 0 | `styles/foundation.ts:19` | 字体方案 |
| 字族、字重、字距 | 7 | 0 | `typeface.ts:52-54` | 字体方案 |
| `--r-*` 等收尾 | 17 | 1（`press-shade`） | `styles/craft-finish-bar.ts:8-25` | 皮肤 15，规格锁定 2（`sheet-inset`、`code-tab`） |

合计：皮肤 176（分明暗 114，共用 62），字体方案 8，规格锁定 10。

- `styles/skins.ts` 是 tray、pill 的差量（主会话说 35 个，我数到 37 个名字，多的是覆盖基线的如 `--r-dialog`），第 16 批删，不进基线。
- 另有 2 个 `:root` 令牌不在 194 里：`--arrival-titlebar-h`（布局）、`--ease-settle`（别名 `var(--ease-spring)`）。留在结构样式。
- 插件里用基线名：只数 `var(--x)` 写法我量到 95 个（主会话是 96，口径差一个），`--muted` 395 次相同。**公开令牌名不改**：规格的 `name` 加 `--` 就是令牌名。

### 7.2 各放哪里

| 放在 | 内容 |
| --- | --- |
| 皮肤文件 | 颜色、阴影、圆角、动效节奏、焦点颜色。别名也写（`blue` 写 `{ "role": "accent" }`） |
| 共同规格 | 角色全集、类型、`follows`、`alias_of`；不可定制的值（`locked`）。皮肤写了 `locked` 角色就拒绝，触控和焦点底线不能被皮肤改（FSS-16） |
| 字体方案 | 字族、字重、字距，离线字体的 `@font-face` 描述 |
| 结构样式（不动） | 选择器、布局、响应式、交互、减少动态效果；密度和触控对 `--control-h` 的覆盖；`--plugin-tint` 绑定；后层里的纯别名。这些没有数值，不是第二份常量 |

**后层有别名的角色不收皮肤值。** `craft-finish-bar.ts` 在后层写 `--desk: var(--page)`、`--lift-1: var(--shadow-soft)`、`--lift-2`、`--lift-3`。皮肤写 `desk` 不会生效，也不报错，最容易让人白改。所以这些角色在规格里标 `alias_of`：非基线皮肤写它就拒绝。基线皮肤为内容不变照写前层那个没用的值；令牌去重时连同它一起去掉（`resource-budget.md` 第 4.1 节）。

**省略的角色怎样补（第 4.2 节）：** 自己的值 → `follows` → 基线。`follows` 不是摆设：`--page`、`--nav-bg` 今天各写一遍相同的色值，基线为内容不变也照写；但 Folio 只写 `page` 时，`nav-bg` 要跟它，不能留着 Soft Workbench 的雾蓝。写手按这些同值关系补：`nav-bg` 跟 `page`；`panel`、`surface`、`canvas` 跟 `paper`；`wash` 跟 `rail`；`text` 跟 `ink`。

### 7.3 文件与读取

```text
packages/design-system/
  package.json          files 加 "resources"
  fonts/                 不动
  resources/
    registry.json
    ui-spec.json
    skins/soft-workbench.json
    fonts/system-sans.json
apps/workbench/
  package.json          files 加 "resources"
  resources/locales/{zh,en}.json   A 段只放组件板标本的词
```

共 6 个 JSON。读取写 `new URL("../resources/…", import.meta.url)`：`rootDir` 是 `src`，不能 import JSON；`src/` 和 `dist/` 上一层都是包根，源码和构建都能跑。先例 `packages/design-system/src/page-clients.ts:9`。发行物按包的 `files` 复制（`apps/local-host/src/installer/home-release.ts` 的 `runtimeDependencyReleaseEntries`），加这一项就够。

新文件 `packages/design-system/src/baseline.ts`：模块初始化读 4 个 JSON，走 SDK 解析，得到解析好的基线，错了抛 `ui.baseline_invalid`，带文件和字段。包入口转出 `BASELINE_SPEC`、`BASELINE_SKIN`、`BASELINE_FONT`、`BASELINE_REGISTRY`（T8b 的样张卡要用真实基线）；写回 CSS 文字的 `baselineGroups(groups, theme?)`、`baselineToken(name | names, theme = "light")`、`baselineTerminal(axis)`、`baselineFontToken(names)`、`baselineFontRoute(id)` 只给本包的样式文件，不转出。

基线皮肤的 `name` 写键 `workbench.skin.soft-workbench`，基线字体的写 `workbench.font.system-sans`。T8 把这两个词放进了工作台的语言文件（`apps/workbench/resources/locales/`），组件板的语言与文字一节显示它们，发行物里的宿主读得到（FSS-59）；产品页面第 16 批再用。

## 8. 真实消费者

### 8.1 皮肤和字体：同意主会话的方向，范围要大一点

主会话推荐 `palette.ts:157,175,241` 读基线文件、走 SDK 解析器，字节不变，删第二份常量表。方向对，**但只改这三处，还剩 34 个令牌的值写死在别处，等于留了第二份常量表。** 那 34 个是 terminal、danger、`--font` 10 个（`foundation.ts`）、字重字距 7 个（`typeface.ts`）、收尾 17 个（`craft-finish-bar.ts`）。所以范围是全部 194 个：

- `palette.ts`：`renderShellTokens`、`renderPaletteTokens`、`renderShapeTokens`、`renderControlMetrics` 签名不变，改成调 `skinTokenDeclarations`（经 `baselineGroups`）。`MW_HUES`、`MW_CONTENT_MARKS` 留 `id`、`label`、`role`（组件板要），删 `light`、`dark`；`MW_CONTENT_THEME` 删（核过只有 `palette.ts` 和 `index.ts` 在用）。调用方不动（`coss-controls`、`foundation`、`interaction-texture`、`apps/workbench/src/styles/base.ts`、`apps/desktop/src/capsule-shell.ts`、`packages/im-ui/src/styles.ts`、测试）。
- `foundation.ts`、`craft-finish-bar.ts`：模板不动，把写死的值换成 `${baselineToken("danger")}`，终端三份写 `${baselineTerminal("unset" | "light" | "dark")}`，后层重复声明的数值（`--ease-quint`、`--dur-*`）也换，不留第二份数字。别名不动。
- `typeface.ts`：`FONT_STACK`、`MONO_FONT_STACK` 和 `@font-face` 从 `system-sans.json` 算出来，导出名不变。`INTER_VARIABLE_ASSET_PATH`、`NOTO_SANS_SC_ASSET_PATH` 从登记表的 `route` 取。

**证据是内容比对，不是字节数。** `page-assets` 只比长度（`scripts/gates/page-assets-measure.mjs` 的 `measured[asset] = bytes.length`），色值都是等长的 `#rrggbb`：错一位、明暗写反、两个令牌互换，差都是 0。所以它只留作门禁。T6 这样证明：

1. **先冻结名字。** 开工第一步，改代码之前，从现有输出把 194 个令牌名写成测试夹具 `tests/fixtures/baseline-token-names.json`。之后不从渲染结果取，否则就是拿自己证明自己。
2. **比内容。** 在 merge-base 工作树和头上分别渲染下面这些，比 sha256，全表贴进 PR：`renderShellTokens` 两种主题、`renderPaletteTokens` 两种主题、`renderShapeTokens`、`renderControlMetrics`、`TYPEFACE_STYLES`、`FONT_STACK`、`MONO_FONT_STACK`、三份下发 CSS（工作台、设置、到达）、`IM_STYLES`。
3. **门禁照跑。** `node scripts/gates/page-assets.mjs --base origin/main` 通过。

**代价已核：** 模块初始化同步读文件，先例就在同一个包，`page-clients.ts` 头部「stylesheets stay free of file reads」要跟着改。评审从 54 个 esbuild 入口走过 import，没有一个走到 `design-system/src/index.ts`、`palette.ts`，所以不进浏览器打包。原生插件里只有 `plugin-builder` 依赖 design-system，它不走单模块发行物。它确实是全站单点：基线坏了宿主起不来。这是构建缺陷，不是用户数据问题，按构建缺陷拦在发行前：`tests/ui-baseline.test.ts` 进 `tests/ci-product-subset.txt`，解析全部内置文件、核冻结的名字；干净安装测试核发行物里文件可读。

### 8.2 文字：同意，放在组件板

不切现有词典（决定 20）。`/__ui/catalog` 加一节 `renderEnvironmentSection`，做法照 `collab-specimens.ts`：`apps/workbench/src/browser/board/environment-section.ts`，esbuild 打成 `dist/board-environment-section.js`，`readFileSync` 内联进组件板 HTML。不新增 `/assets/` 路由，不触发页面资源审批；这是新增的开发页字节，不是从量得到的地方搬走。

标本真跑：

1. 服务端照抄第 1.1 节的写法，用 `t`、`format` 和 `apps/workbench/resources/locales/` 的词画出来（宿主消费者）。两种语言的结果都放进页面的 `<template>`，开发页不多一个路由。
2. 浏览器里一个语言切换，调 `apps/workbench/src/browser/locale-switch.ts`（第 5.4 节）：不整页刷新，文字、日期、数字和属性都变；旁边的输入框内容和选区、`details` 开合、滚动不动；一行客户端加的字也跟着变；一条和界面词相同的用户文字（服务端画的）不变；一行和界面词同字的客户端节点（隔着别的字）不被改，真界面字正常变（浏览器消费者）。
3. 同屏放两个主人，切换时各查各的词；显示 `resolveUiEnvironment` 的结果，服务端和浏览器各算一份并比较。
4. 列出 `parseSkinFile` 对几份坏文件的问题（重复键、CSS 文本、外部 URL、写了 `locked` 角色），这是组件板看得见的校验。

组件板没有开关，路由在发行物里也有（`apps/local-host/src/web-catalog-board.ts`、`web-routing.ts:42`），所以 `resources/` 要随包。它是开发工具，单独不算真实入口，所以和基线、两包样例一起算。

### 8.3 宿主给插件的上下文

组件板只证明平台自己能用，插件要读到自己的词，还需要平台装好上下文、灌好词。

**合同不变。** `UiContribution.render(request)` 不加参数，`bindUiContribution`、`PluginUiViews.bind`、`plugin-executor.ts:157` 都不动；`supervisor.contribution().views` 的六个直接调用点（`home-plugin-http.ts:121,305`、`project-plugin-stages.ts:138,188,286`、`plugin-stage-fragment-http.ts:63`、`declared-stages.ts:101`）本来就在页面请求的 `runWithLocale` 里，`t` 从上下文就能取到语言。

**上下文进程内装一次（第 5.2 节）。** 新文件 `apps/local-host/src/ui-text-provider.ts`，应用宿主启动时装，`noContext()` 是 `"default"`，`locale()` 读第 5.2 节会作废的页面语言。

**开发路径。** `molis-work plugin dev` 没有 HTTP 请求：`runPluginDevelopment` 直接调 `options.ui.render(...)`（`plugin-development.ts`，`rendered_ui`），经 `developInPrivateHost`（`cli.ts:46`）进来，全程没有 `runWithLocale`。所以 `createPrivateDevelopmentHost` 同样要装 provider，`runPluginDevelopment` 在自己的范围里跑 `render`：语言取 `PluginDevelopmentInput.locale`（新的可选字段，`platform/tooling`，T3），CLI 写 `--locale <语言>`，没写用 `ui.locales.default`，不在 `available` 里就报错并列出可选的；这个范围里 `noContext()` 是 `"throw"`。这个入口只收 Integration（`contribution.kind !== "integration"` 就抛），手册的小插件写成 Integration（第 16.1 节）。

**语言包谁灌、谁删。** 新文件 `apps/workbench/src/plugin-text.ts`，存各主人的语言读取器，`local-host` 从 `@molis-ai/molis-work-app-workbench` 引用（`home-plugin-executor.ts:43` 已这样引 `withPluginWords`）：

| 时机 | 谁 | 做什么 |
| --- | --- | --- |
| 会话打开 | `openHostSession`、Home 执行器 | `options.localePacks?.(definition)` 有内容就 `registerPluginText(plugin_id, reader)`，拿到一个撤回函数 |
| 会话释放（停用、撤权、升级前的旧会话） | 同一处的 `dispose` | 调撤回函数。按计数：同一插件在几个项目里各有一次会话，都释放才删。两个项目装了不同版本时，先查最新登记的，没有的键再查旧的：词是显示，不是权限，残余是显示新版的译文；同一 `plugin_id`、不同发布者的残余登在 BL-586 下 |
| 卸载 | 卸载先停，走上一行 | 不另写 |
| 升级 | 新会话登记新的读取器，旧的随旧会话撤回 | 所以插件升级后不重启进程也不会留旧词 |
| 内容包（08，第 6.2 节） | 没有会话：安装记录启用时登记，停用时撤回 | 和 08 第 3 节「启用时登记方法」同一个时机 |

`PluginHostExecutorOptions.localePacks` 是可选的。A 段只有 `runPluginDevelopment` 传（用 `loadDevelopmentLocalePacks`）；第 16 批沙箱包和内置插件各传各的，只有能调 `t` 的进 `t` 的索引（第 5.2 节）。今天的 `registerPluginMessages` 不一样：它在 `plugin-platform.ts:249` 只登记，生产代码里没人删；新路径不沿用。

现有插件 `options.localePacks` 不给，不调 `t`，所以行为不变，一个请求也不多。

**插件页面画别人的对象。** 05② §7 写了 `renderPresentationForm` 给「插件在自己页面上画别人交来的对象」；可是 iframe 只带自己和 `common.*` 的词，读不出别人的 `label`。两条路：

| 路 | 怎样做 | 代价 |
| --- | --- | --- |
| **(a) 平台画，放进插件文档（推荐）** | 挂载位的内容由平台在服务端画好。iframe 插件的文档也是服务端画的（`script[data-plugin-document]`），所以拿得到；切语言走第 5.4 节 | 插件只能占一个位置，不能重画别人的对象，符合「外观用组件板已有的控件」（05② §7）。**不是现成合同：** `nested` 还差四件，frame 里的按钮没走通，都列在第 2.4 节第 3 条，归 05②、15 |
| (b) 把别人的词带进 frame | `FrameConfig.text` 带上别人的语言包，或按引用预先解析 | frame 的配置要按「这一屏可能出现谁的对象」算词；多字节；隔离的 frame 拿到别人的文字 |

推荐 (a)，理由是「frame 只带自己的词」这条规则不破例。开工前要核：frame 里的 `SurfaceItem.actions` 按钮以谁的身份调动作。这件事和 (a)、(b) 无关，两条路都要答。可选：只放平台的通用操作，经父文档走（照 `pageIntake`）；或按钮由外壳盖在 frame 上画（照 `connection-slot`、`embed-open` 的位置上报）；或这个位置不带按钮。核不过由 15 接页面的片回来问，不是回到 (b)。签名定成 `renderPresentationForm(object: OwnedPresentationObject, form, values): string`，**不加工具和主人参数**；平台画（挂载位、MLN-23）和插件预览是同一个函数。这不要求 A 段写代码。

### 8.4 两包样例

`examples/plugin-sample`、`tooling/plugin-cli` 的 `create` 模板、`tests/plugin-sample.e2e.test.ts`：

1. **声明：** `manifest.json` 加第 1.2 节的 `ui.locales`；加 `locales/en.json`、`locales/zh.json`。`package.json` 的 `files` 不用动：`pack` 自动带（第 6.2 节）。测试把样例拷到临时目录的那一行（RAC-553 上面）要多拷这两个文件。
2. **校验：** `molis-work-plugin validate` 调 `inspectLocaleSet`，改坏一个占位符应失败。
3. **运行：** `index.mjs` 只 `import { t } from ".../ui"`，`render(request)` 里写 `t("notes.main.saved", { count })`。现有断言 `/Saved results: 1/` 不动（`en.json` 就写这句，`Saved results: {count}`），另加一行单复数，并在 `zh` 下断言中文。**经真实 `molis-work plugin dev` 命令跑：** `--locale en`、`--locale zh` 各断言 `rendered_ui` 的 HTML，这是 A 段唯一能走的路。
4. **只装两包：** 现有用例已经用 `npm install` 只装 contracts 和 SDK 后起子进程（`tests/plugin-sample.e2e.test.ts` 的 RAC-553 那段）。在同一段加：导入 `parseLocalePack`、`installTextForTest`、`resolveUiEnvironment`、`parseSkinFile`（规格用一份内联的最小样本，作者拿不到私有 design-system），跑通并打印结果；测试上下文下没有语言时 `t` 抛 `ui.text_no_context`；再用 `esbuild --platform=browser` 打一次 `/ui`，有 Node 内建模块就失败。
5. **业务代码不碰语言：** 断言 `index.mjs` 源码里没有 `currentLocale`、`navigator.language`、`data-resolved-theme`、`data-skin`。
6. **副本共用上下文：** 把样例打成单模块，用 `import("data:…")` 载入（`native-plugin-release-artifact.ts` 的做法），断言它读到宿主装的上下文。这是第 5.2 节选 `Symbol.for` 的证据（FSS-69）。

样例走 `services.ui.register`，证明不了真实页面。另加一个用例：一个带 `ui.views` 的夹具插件，经 `createPluginPlatform` 启动（`localePacks` 由测试传入），走 `renderStagePage` 画出来，断言读到了自己的词（FSS-60）。这条今天用户走不到，只证明第 16 批的路通。

### 8.5 字体路径

`apps/local-host/src/web-assets.ts:14-19` 写死 `../../../packages/design-system/fonts/…`。发行物里没有这个相对层级，**实测是 404**（T6：`installMolisWorkHome` 真装到临时 Home，用发行物自己的 `web-assets.js` 起 HTTP，两款字体都是 404，文件其实在 `node_modules/@molis-ai/molis-work-design-system/fonts/`）；系统字体排在前面，所以平时看不出。改成 `interVariableFontFilePath()`、`notoSansScFontFilePath()`（`typeface.ts:19,23`，`local-host` 已依赖 design-system）。路由字面量 `"/assets/inter-latin-variable.woff2"` 保留（第 3.6 节）。写进基线那一片，并补干净安装后路由能读到的测试（FSS-59），先把现状跑出来证明确实是 404，再改。

### 8.6 T8 怎样落地（偏离与实测）

1. **多出来的文件。** 组件板一节的服务端画法放在新文件 `apps/workbench/src/environment-specimens.ts`（`renderEnvironmentSpecimen`、`renderEnvironmentSection`），照 `collab-specimens.ts`；`apps/local-host/src/web-catalog-board.ts` 改了一行，在 `runWithLocale("zh")`、`("en")` 里各画一遍再交给 `renderMolisWorkPrimitiveCatalog` 的新第三个参数。CLI 模板的源码在 `tooling/plugin-cli/src/sample-source.ts`（`create.ts` 只写文件），所以也改了，和 `examples/plugin-sample/index.mjs` 同一份写法。`tooling/gates/error-owners.json` 把 `apps/workbench/src/plugin-text.ts` 归给 `ui`（它的 `ui.text_owner_conflict`）。
2. **平台主人的默认语言。** 登记表的 `locale` 行没有写默认语言，宿主取 `WEB_LOCALES[0]`（`zh`）。目录是懒读的：第一次用到某种语言才读那个文件。
3. **组件板的第二个主人。** 样例主人 `io.molis.work.example.board-notes` 由组件板第一次画这一节时登记一次，进程里一直在；只在开发页上，不是插件。
4. **同字紧挨：可达规则。** 一串同字（中间只有空白）里，旧渲染有 n 个、页面上有 m 个时，每个位置只可能是 n 个里的某几个（差几个就能偏几个）；可能是要变的那个就改。对齐用最长公共子序列，平局时取后面的页面串。浏览器实测（`tests/board-locale-switch.e2e.test.ts`）：
   - 界面词后面紧挨一个、两个客户端同字：界面词和客户端的都变。
   - 客户端同字插在用户字前面：组件板上用户字带自己的属性，属性也算字，所以不紧挨，只有界面词变。三段纯文字紧挨（中间什么都没有）时，用户字会临时显示成译文，组件板上没有这种行，没有实测。
   - 用户字被删：界面词照常变。
   - 和界面词同字、隔着别的字的客户端行不变；可编辑节点的字不变。
5. **客户端画的字。** 只在页面上没对上的字里找产出记录；`say` 和 `t` 都记。页面自己改过、不等于旧语言那份的字不动。
6. **体积。** 组件板这一节的浏览器代码打出来 20.4 KB（含 SDK 的文字工具和 `resolveUiEnvironment`），只内联进开发页 `/__ui/catalog`；`locale-switch.ts` 单独压缩约 3.2 KB。页面资源门禁对照 `origin/main` 通过（51 个资源，没有新增）。工作台语言目录由宿主在服务端读，不下发给页面。
7. **开发路径。** `--locale` 只认 `ui.locales.available` 里的；没写 `ui.locales` 却写了 `--locale` 也报 `actions.input_invalid`，说先在 Manifest 写 `ui.locales`。选中的语言和默认语言的文件有 `blocking` 问题就抛 `plugin.package_invalid`。状态目录在检查语言之前就建好了（`runLocalPluginDevelopment` 的原有顺序），没改。
8. **`ui.views` 夹具（第 8.4 节末段）** 没有经 `createPluginPlatform`：`tests/host-ui-text.test.ts` 直接用 `PluginRuntime` 加 `PluginHostExecutor`（`localePacks` 由测试传入），会话打开、登记和释放走的是同一个 `plugin-host-services.ts`。`localePacks` 按 `plugin_id` 认插件，不按对象：运行时交给执行器的定义不是调用方手里的那个对象。
9. **范围之外改的测试准备。** `tests/goals-project-database-refusal.test.ts`、`tests/plugin-development-artifacts.test.ts` 拷样例时多拷 `locales/`（样例的 Manifest 现在声明它们），断言没动。

## 9. 资源预算的接口

实测与预算方案在 `specs/font-and-skin-system/resource-budget.md`（分支 `claude/14-resource-budget`，#1922），本文不写，只定怎样接。字段以本文为准，那边第 6 节写明了「字段名以合同定稿为准」，那边也按这里的说法改。

**用户 2026-11-07 选了方案二：** 每次改代码，自动起一个真实服务（不开浏览器），算主要页面第一次和再次打开共下载多少，只许变少，**不设绝对上限**；第一屏资源都要记账，分两处放：随产品发行的文件在 `registry.json`，门禁要算的第一屏在 `tooling/gates/first-screen.json`。这是改门禁，**第 16 批开工前单开门禁 PR 落地，不和功能混，A 段不做**。

**统一说法（统筹定）：** `registry.json` 只收随产品发行、有包内路径的东西。隐藏文档、内联块、启动 JSON 进第一屏清单 `tooling/gates/first-screen.json`（门禁 PR 创建），放进 `registry.json` 的话每个加启动请求的 PR 都要改 D 轨的发行文件。

| 预算方案的字段 | 这里怎样接 |
| --- | --- |
| `id`、`kind`、`owner`、`load`、`license` | 随产品发行的那些行，就是登记表的字段。`load` 取那边的 `first-screen`、`fallback`、`on-open`、`on-select`，加上 `startup`、`tool`。`kind` 的 `interface-spec` 这里叫 `spec` |
| `origin` | 合进 `license.source` |
| `path`、`source` | `route`、`package`＋`path` |
| `bytes`、`gzip` | 不存，报告从文件现算。方案二比的是真实响应对 merge-base，不需要存下来的数 |
| `gated` | 不要。报告对照 `page-assets` 的路由算 |
| `style`、`script`、`inline`、`startup-json` | 不进这张表，`kind` 不加这些值，进第一屏清单 `tooling/gates/first-screen.json` |
| `locale.<插件>` | 不进这张表。插件语言文件的声明只有 Manifest |

- **插件语言文件**由报告从内置 Manifest 投影，和两张表合起来出同一张账，不抄进表。
- **报告只有一份。** `scripts/first-screen-report.mjs`（预算分支带来）加 `--resources`，读登记表、打印每行的字节和 sha256，不失败，不是门禁。那个分支合入之前没有消费者，所以放在 T9。
- **已知盲区**（`resource-budget.md` 第 5 节逐入口列了）：门禁只量 `/assets/` 字面路由和内置包；HTML 内联（最大是英文页词典，`apps/workbench/src/i18n.ts:154`）、`/api`、英文变体、外部插件都没量。A 段不往这些地方搬字节，也不改门禁。

A 段的页面资源影响：基线内容不变；SDK 新工具不进现有包（第 5 节，门禁证明）；组件板是内联的开发页；字体路径修复不改字节。所以 **A 段不需要新增资源，也不需要增长许可**。若实现时门禁显示某资源变大，停下来，不写许可。

## 10. 片与 PR 序列

C1 独占合同文件和 `tooling/gates/api/`；D 独占 `packages/design-system`、`packages/plugin-sdk/src/ui.ts`、`ui.ts`。合同先单独开小 PR。开写之前读 #1743 最新评论，开 PR 前再查一遍同快照的在途 PR。

**分组（用户 2026-11-08 要求，原话「一批开发，一次性验收」「不要一小段一小段开发和推送」）：** T1～T3 已各自单独合入（#1940、#1948、#1949）。**T4～T10 合成一个 PR，一次验收**，冲突最后统一处理一次；这超出决定 28 写的分组条件，记在批次文件的偏离 4。T10 原来的 #1945 关闭，并入这个 PR。下面的排队表和「先后」按片写，仍说明各片动了哪些共享文件，但不再是各片各开一个 PR 的次序：快照冲突、与 #1872、#1867、#1913 的合并，都在这一个 PR 里统一处理。文件超过约 50 个只是参考，评审按区域分人，一次看完。

**排队（用户 2026-11-07 同意本批插队）：** 快照是生成物，冲突是机械的，后合入的重新生成。

| 占用 | 怎么办 |
| --- | --- |
| `api/contracts/platform/ui.txt`：T1、T2 与 #1846 | T1、T2 都先于 #1846，不等它；#1846 合入前重新生成。用户定的是 T1，T2 因为和 T1 同一份快照紧接着，主会话裁定 |
| 同一份：T2 与 05② C-2 前置的「状态环取值下沉到 `platform/ui.ts`」（D 轨，还没做） | 同一份快照一次一个 PR，开工时错开；下沉不等 T2 |
| `api/plugin-sdk/ui.txt`：T4、T5 与 #1872 | T4、T5 先于 #1872，不等它；#1872 合入前重新生成 |
| 同一份：T4 与 #1913（第 05 批，开着） | T4 开工时看它合了没有；没合就按同样办法处理，并在 #1743 说一声 |
| `api/contracts/platform/plugin.txt`：T3 与 #1879（第 18 批）、02 批 N39 | #1879 已合入 main（`8bd734188`），T3 在它之上做。N39 是生成文件，谁后合谁重新生成（#1743 11-07，先例 N22-01） |
| 同一份：T3 与 08 C-1 | **不互等，谁先准备好谁先（主会话裁定）。** 08 先合时，内容包白名单收 `ui.locales`（去掉 `ui.messages`、`ui.translations`）和 `payload.files`「不多不少」的文件清单带上语言文件，这两处**一起改**，随 T3 补（第 6.2 节）；只改一处，带语言文件的内容包要么 `ui.locales` 进不了白名单，要么语言文件被「不多不少」当多余文件拒掉。第 15.3 节其余几行（正文路径、版本、读正文、轮次、元数据、键的形状、资源）由第 08 批做，片待 08 定（#1936 还没回应这几行） |
| `packages/design-system/src/styles/craft-finish-bar.ts`：T6 与 #1867 | 不是生成物，T6 开工时看它合了没有，没合就按它的改动合并 |
| `packages/design-system/src/primitives/catalog.ts`、`browser/catalog.ts`：T8b 与 #1913、#1872 | 不是生成物。#1913 两个都改，#1872 改前一个（核过文件清单）。T8b 开工时看它们合了没有，没合就按它们的改动合并 |

**合审（用户 2026-11-07 定）：** 公共合同台、D 轨没回音时，本批的合同 PR 和组件板新增由没碰过它的子代理合审；它们回来有意见照样处理。

| 片 | 做什么 | 动的文件与快照 | 前置 | 验收 | 写手模型 |
| --- | --- | --- | --- | --- | --- |
| T1 合同① `TextRef` | 第 2 节的类型与 schema | `platform/ui-text.ts`（新）；`ui.ts` 一行 `export *`（D 文件，D 评）；`api/contracts/platform/ui.txt` | 本设计稿合入 | FSS-42、FSS-45 | Opus 5.5 high |
| T2 合同② 文件与快照 | 第 3、4 节的类型；第 5.1 节的文字工具类型；`versions.json` 五个条目，`POLICY.md` 记 `carriers` 例外（第 1.4 节）。**`UiContribution` 不改** | `platform/ui-files.ts`、`ui-environment.ts`（新）；`ui-text.ts`；`ui.ts` 只加 `export *`；`tooling/versions.json`；`docs/releases/POLICY.md`；`api/contracts/platform/ui.txt` | T1 | FSS-46（类型部分） | Opus 5.5 high |
| T3 合同③ Manifest | `ui.locales` 类型与解析；开发路径的可选 `locale`（第 8.3 节） | `plugin-manifest.ts`；`packages/plugin-sdk/src/manifest.ts`；`platform/tooling.ts`；`api/contracts/platform/plugin.txt`、`tooling.txt` | T1（`LOCALE_TAG`）；见排队表 | FSS-52 | Opus 5.5 high |
| T4 SDK 文字工具 | `text`、`text-ref`、`message-format`、`locale-pack`、`text-reader`，以及 `strict-json`（`parseLocalePack` 要用，从 T5 提前）；`message-declarations.ts` 改模块内 `export`；`error-owners.json` 加 `ui`，只写这片的文件（门禁对匹配不到文件的路径直接失败） | `packages/plugin-sdk/src/ui/*`、`ui.ts`、`message-declarations.ts`；`tooling/gates/error-owners.json`；`api/plugin-sdk/ui.txt` | T1、T2（文字工具类型）；排队表 | FSS-43、44、47、48、50、51、69、70 | Opus 5.5 high（SDK 共享核心，统筹加全量） |
| T5 SDK 文件工具 | `appearance-*`、`environment`；新文件有错误码才改 `error-owners.json` | 同上快照 | T2、T4 | FSS-46、48、49、57 | Opus 5.5 high |
| T6 基线与字体路径 | 第 7 节全部、第 8.1、8.5 节；同一 PR 改 `docs/SSOT-MATRIX.md` 的「`palette.ts` 唯一来源」、design-system README 的「开发要求」和 `page-clients.ts` 头部，否则文档到 T9 之前都是错的 | `packages/design-system/{resources,src/baseline.ts,src/palette.ts,src/typeface.ts,src/styles/foundation.ts,src/styles/craft-finish-bar.ts,package.json,README.md}`；`tooling/gates/error-owners.json`（`baseline.ts` 抛 `ui.baseline_invalid`，这个包今天没有主人）；`apps/local-host/src/web-assets.ts`；`docs/SSOT-MATRIX.md`；测试与夹具 | T5；排队表 | FSS-54、55、56、58、59（design-system 那些行） | Opus 5.5 medium；占 build 槽位 |
| T7 语言文件读取 | 第 6.2 节 A 段那两行和沙箱包的专门拒绝；CLI `validate`、`pack` | `packages/plugin-runtime/src/{locale-packs,package-verification,development-loader}.ts`；`apps/local-host/src/sandbox-package.ts`；`tooling/plugin-cli` | T3、T4 | FSS-53 | Opus 5.5 high |
| T8 消费者 | 第 8.2、8.3、8.4 节，第 5.2 节第 1 层（语言随范围结束作废），第 5.4 节的合并代码 | `apps/local-host/src/{ui-text-provider,web-locale,web-server,plugin-executor,plugin-host-services,home-plugin-executor,plugin-development,local-plugin-development}.ts`；`tooling/plugin-cli/src/{cli,create}.ts`；`apps/workbench/{src/plugin-text.ts,src/browser/locale-switch.ts,src/browser/board/environment-section.ts,src/primitive-catalog.ts,resources,package.json}`（`files`，`dist/board-environment-section.js` 的构建脚本）；`packages/design-system/resources/registry.json` 工作台那行（D 文件，D 评）；`examples/plugin-sample`；`tests/plugin-sample.e2e.test.ts`。现有插件、`render` 和画页的地方不动；若 `tsc` 或测试显示要动，**停下交回主会话**（第 12 节第 4 条） | T6、T7 | FSS-58、59（工作台那行）、60、61、62、63、64，69 的副本和定时器那两条 | Opus 5.5 medium；占 browser 槽位 |
| T8b 组件板三样 | 外观卡、样张卡、换外观的淡入，依据 `docs/design/appearance-selection/README.md`「组件板新增」：定样记录写明要先有标本才写产品代码。样式只进组件板，算不上页面资源增长（照 #1913）；部件的渲染函数不进 SDK，第 16 批做设置页时再提升，所以不占 `api/plugin-sdk/ui.txt`。样张卡用真实基线解析出来的令牌画，不写假值。#1795 共审留给第 16 批的三条小修（样张主按钮的键位提示、390 宽代码行截断、原型角标）不进这片 | `packages/design-system/src/primitives/catalog.ts`、`packages/design-system/src/browser/catalog.ts` 与组件板样式。和 T8 的文件不重合（T8 在 `apps/workbench`），可以各写各的；只是 browser 槽位要错开 | T6；排队表 | FSS-66、67、68 | Sonnet 5.5 xhigh；占 browser 槽位；D 轨合审，没回音由没碰过这片的子代理代看 |
| T9a 账本与术语 | 报告；`docs/platform/UI-PLATFORM.md`；SDK README「开发要求」；`docs/system/GLOSSARY.md`、`EXTENSION-POINTS.md`（第 16.2 节） | 文档；`scripts/first-screen-report.mjs` | T8；`resource-budget.md` 合入 | FSS-65 | Sonnet 5.5 high |
| T9b 手册与开发流程 | 第 16.2 节其余各行。**手册不写超前**（第 16.1 节）。`skills/` 不排在全量回归期间。`AGENTS.md` 和开发流程的文字经用户确认（主会话拿草稿问） | `skills/molis-plugin-dev/{text-and-appearance.md,SKILL.md,ui.md,elements.md}`；`skills/molis-prologue-ai/SKILL.md`；`docs/platform/{PLUGIN-DEVELOPMENT,PROLOGUE-AI}.md`；`specs/post-anticorruption-roadmap/reference/development-workflow.md`；`docs/prompts/repository-systematic-review.md`；`AGENTS.md`；`docs/README.md`；`apps/workbench/README.md`；`docs/cli-and-development.md` | T8、T10 | FSS-72、73 | Opus 5.5 high；实走用没读过设计稿的独立代理 |
| T10 回复语言 | 第 15.1、15.2 节。**不动公开合同，所以合同和实现不拆**：`AgentStartAuthority` 在 `horizontal/agent-host`，不在 `tooling/gates/api/`；`pnpm api:update`、`pnpm actions:update` 都应无变化 | `horizontal/agent-host/src/{index,run-start}.ts`；`apps/local-host/src/assistant/*`；`apps/local-host/src/{ui-locale-memory,home-stores,web-server,web-locale}.ts`；`tooling/versions.json`；`docs/system/SECURITY-INVARIANTS.md` 一行 | 不依赖别的片 | FSS-71 | Opus 5.5 high；提示词改动占 agent 锁，隔离 Home，真实模型验证由统筹安排 |

**先后：** T1 → T2 → T4 → T5 → T6；T1 → T3 → T7（T4 也要）；T6、T7 → T8 → T9a、T9b；T6 → T8b，和 T8 只错开 browser 槽位；T10 随时可开，T9b 里提到它的两句等它。同一时间最多 3 个写手，T1 与 T3 同归 C1 但快照不同：T3 要 `LOCALE_TAG`，所以 T1 先合；T4、T5 同一快照串行。T4 前置 T2，是因为 `t`、`say` 的类型在 T2。

**按决定 27（#1927）写：** T1 起每一片都答开工前检查的第 15 项「全局最优」；有更好的方案可以换，批次文件写明原来怎样、现在怎样、为什么更好、影响谁，再告诉用户；这一片让什么变多余就在这一片删；每批全部合入后评审台做一次收尾检查。

**各片开工注意事项：**

- **T3、T8：** `cli.ts:44` 按位置查 `args[4]`，`--locale` 排在它后面解析；`local-plugin-development.ts:49` 逐字段重组输入，要加 `locale`。
- **T8：** FSS-61 把三段相邻同字（客户端、服务端用户内容、界面字，含客户端删掉用户内容）和连续几条客户端行跑一遍，结果写进第 5.4 节的限制。
- **T9b：** `skills/molis-plugin-dev/elements.md:9` 的「反向域名」写明：前缀是 `io.molis.work.`，最长 200 字符（T3 起 `parsePluginManifest` 拒绝更长的），用 `ui.locales` 时最后一段要以字母开头（不是 `common`），否则写不出一个键。
- **T10：** 文件清单加 `docs/system/HOME-DATA.md` 一行，不变量正文在 `docs/system/security-invariants/`，`SECURITY-INVARIANTS.md:56` 提到 `/locale` 现在写 Home，看不到的部分写本机非浏览器进程能自带这个头。拒绝测试覆盖 `cross-site`、`same-site`、`none`、没有头。只在 `lang` 合法时写（`web-server.ts:136-138` 的推算不算切语言）。同步写，临时文件改名，权限 0600（同 `project-arrival.ts`）；写成功才改内存，失败下次还能重试。比程序新的文件：`readUiLocale` 返回 `null`，`rememberUiLocale` 不盖。
- **T10 的提醒给统筹（收口时改正）：** 原写 `prompt.assistant-base` 升到 2。#1960 把提示词的第 1 版检查放进了 CI 里的 `verify-release-versions`（阶段一提示词在原版本改，`CONTRACT-CHANGES.md` 第 3 节），所以收口时留在第 1 版、原地改正文。

**给别批的。** 合同都只等 T1 或 T3 的类型；校验等 T4；**T4 随第 14 批大 PR 合入，不单合（05 请求过单合，11-08 两边统筹商定：05 先合合同，SDK 校验跟在后面）**；**实现里要调 `say` 的片等 T8**（`ui-text-provider.ts`、`plugin-text.ts`），没装时抛 `ui.text_no_context`（第 5.2 节）。

| 片 | 合同等 | SDK 校验等 | 用来 |
| --- | --- | --- | --- |
| 05② C-2 | T1 | T4（`validatePresentationDeclaration`、`presentationText`、`tryOwnedTextRef`）：随第 14 批大 PR 合入；05 先合合同，SDK 校验跟在后面（11-08 两边统筹商定） | `label`、`note`、`overview` 的 `summary`，`OwnedPresentationObject` |
| 05② C-3、15 S-1 | T1 | T4（`assertSurfaceDescription`）：随第 14 批大 PR 合入；05 先合合同，SDK 校验跟在后面（11-08 两边统筹商定） | `SurfaceGroup.title`、`reason` |
| 20 P-1 | T1 | T4（`validateSettingsDeclaration`） | `SettingEntryDeclaration.title` |
| 20 P-2 | T1 | T4 | `RoleTemplate`，`say.text`（实现等 T8） |
| 20 P-3b | T1 | T4（`inspectBlueprint`） | `Blueprint.title`；第 15.4 节 |
| 08 C-1 | 不互等 T3（排队表） | T4 | 内容包白名单、第 15.3 节 |
| 08 C-2 | T1 | T4 | `skills.body.read@1` 的 `locale`、`fell_back`；实现等 T8 |
| 09 第 9-1 项 | T10 | | 交给外部执行方时当场算语言；要读冻结值由 09 的合同 PR 加 `frozen.reply_locale`（第 15.3 节） |

路线书的 `dependencies.md` 第 192、199 行已在本 PR 改；批次文件由主会话改（第 16.4 节）。

**MLN-23 不卡：** 它用 `renderPresentationForm` 读内置插件的 `label`，实现是第 37 批第 2 项「主线第一片接顶部切换器」，排在第 16 批切换之后（`dependencies.md` 15-1、第 218 行），那时内置插件已经有语言文件。批文件没有写编号 MLN-23，是按「顶部切换器」对上的；如果它被提前，要停下问。

验证：每片 `node scripts/affected-tests.mjs` 挑用例，`node scripts/run-tests.mjs --jobs 1`，走机器槽位；全量由统筹加。T4、T5、T7 碰共享核心。

## 11. 开工前检查

下表是本稿开 PR 时的 14 项。决定 27 加的第 15 项「全局最优」，已开的 PR 不回头补；T1 起每一片都要答。

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 定义正文归文件；A 段的文件归发行物（design-system、workbench、各插件包）。语言偏好仍归入口 Cookie，设备偏好仍归浏览器；新增「最后用的语言」归宿主，只给没有页面的工作用（第 15.1 节）。Home 选择归 B 段的新服务。快照、解析结果是投影，不是事实。`docs/SSOT-MATRIX.md` 的「`palette.ts` 唯一来源」改成皮肤文件（T6） |
| 2 | 插件同等待遇 | 内置和外部同一个 `ui.locales`；`inspectPluginLocales`、`pluginLocaleReader` 一套规则；`t` 对所有插件一样。来源不同只是 `read` 不同。没有宿主私路 |
| 3 | 能力注册 | A 段不加动作，不碰动作目录；`pnpm actions:update` 应无变化。主人取自 Manifest 和可信登记 |
| 4 | 合同 | 改：`platform/ui`（三个新文件）、`platform/plugin`（`ui.locales`）、`platform/tooling`（开发路径的 `locale`）、SDK `/ui`。T10 不动公开合同。阶段一，不留兼容期。`UiContribution` 不改，现有插件和调用方不用动。合同先单独开 PR（T1～T3） |
| 5 | 放在哪个包 | 合同在 contracts；工具在 SDK `/ui`（只依赖 contracts，无 Node 内建）；基线在 design-system（读文件）；语言文件读取在 plugin-runtime；A 段不加新包。**B 段的外观主人按用户 11-01 的规定进 `horizontal/` 新包，不进实现方案写的 `apps/local-host/src/interface/`**，方案已加注 |
| 6 | 表与存储 | 不加表，不改库结构，不碰发行物（`artifact_json` 不变）。T10 加一个 Home 文件 `config/ui-locale.json`（第 15.1 节）。第 16 批外部包走已签名的包文件（第 6.3 节），同样不用新表 |
| 7 | 兼容与迁移 | 不加。`ui.locales` 与 `ui.messages` 同写拒绝，没有翻译器读两种。`literal` 是语义不是兼容 |
| 8 | 安全边界 | 不碰令牌、动作网关、MCP、桌面 IPC。相关的四点：① 文字冒充（主人不从声明读、前缀规则），FSS-42、43 断言拒绝；② 不可信文件（重复键、危险属性名、CSS、外部 URL、语言包里的标记字符，内容包的词不查这一项），FSS-46、70 断言拒绝；③ `t` 的字符串参数和 `say`、`createTextReader` 的全文转义（内容包的词只靠这一层），合并代码不用 `innerHTML`，FSS-61、70 断言；④ `/locale` 是 GET，跨站 `<img>` 能到（`refuseForeignRequest` 拒非回环和跨站 iframe，`authorizeLocalWebRequest` 放行所有 GET），写 Home 记录只认 `Sec-Fetch-Site: same-origin`，T10 加一行不变量和拒绝测试。切语言的请求头只选语言、不授予任何东西。文字工具进 `SECURITY-INVARIANTS.md`：T4 写手加了 `S-ui-text-markup`，评审确认 |
| 9 | 调用次数 | 见下表 |
| 10 | 升级与数据 | A 段只有 T10 写 Home：一个新的带版本文件，进 `home-stores.ts`，第 1 版不用升级步骤；不存在就用默认，这是初始状态，不算新增兼容逻辑。没有改库或已有带版本文件的结构。`format.ui.*` 进 Home 是 D 段的事，到时按 `VersionedFile` 走升级链 |
| 11 | 成果与过程项 | 配置不进成果库（需求 §3.1） |
| 12 | 页面、外壳与文字 | 不出新页面，组件板加一节开发标本。不登记 DOM 事件（第 4.5 节）。页面资源无增长（第 9 节）。标本是开发工具，不算定样，没有新组件。新文字有主人；A 段逻辑不依赖译文；不存译文；令牌不改名；回复语言由平台一处给 |
| 13 | 错误 | `defineErrorCodes("ui", …)`，`error-owners.json` 加 `ui` 一条，路径只含新文件。不写 Error 子类。报错带文件和下一步（第 3.1 节） |
| 14 | 冲突面 | C1：`platform/ui-*.ts`、`plugin-manifest.ts`、`plugin-runtime`、`api/`。D：`design-system`（含 T8b 的两个组件板文件）、`plugin-sdk/src/ui.ts`、`ui.ts`。枢纽：`tooling/versions.json`、`error-owners.json`、`ci-product-subset.txt`、`AGENTS.md`。在途：#1846、#1872、#1867、#1913，处理见第 10 节排队表。`apps/local-host/src/web-assets.ts`、`plugin-frame` 不归独占轨道 |

**调用次数（N42～N56 的口径：一次操作几个请求，每个请求几遍目录发现、几次授权核对、开几次库、读几次文件；按缓存过期后的真实成本算）。**

| 操作 | 请求 | 目录发现、授权核对 | 开库 | 读文件 |
| --- | --- | --- | --- | --- |
| **A 段**：进程启动 | 0 | 0 | 0 | 基线 4 个 JSON，各 1 次（模块初始化） |
| **A 段**：打开任一页面 | 比现在多 0 | 比现在多 0 | 比现在多 0 | 0。CSS 内容不变 |
| **A 段**：一次 `render` | 0 | 0。主人在键里 | 0 | 开发路径的插件：这种语言第一次用到读 1 次，之后走内存。现有插件 0 |
| **A 段**：插件开发启动（只有 `plugin dev`） | 0 | 0 | 0 | 声明几种语言读几个文件，各 1 次 |
| **A 段**：打开组件板 | 1 | 0 | 0 | 工作台语言文件 2 个，首次读后记住 |
| **第 16 批**：首屏，Soft Workbench | 比现在多 1（工作台的语言脚本），再次打开是 304 | 0。快照由 Home 选择的内存投影算，不走 `localWebActionContext`（N42） | 0 | `state.json` 只在选择变化后读 1 次 |
| **第 16 批**：其他皮肤 | 再多 1（皮肤 CSS）；字体最多 2 个，只在选用时 | 同上 | 0 | 同上 |
| **第 16 批**：打开一个插件 | 同一屏的插件词 1 个批量请求（N52）；iframe 0 个 | 0 | 0 | 每个主人每种语言第一次用到读 1 次 |
| **第 16 批**：切皮肤 | 发起窗口 1 个写动作；别的窗口经已有推送通道收失效信号，取快照 1 个；iframe 只换 `<link>` | 发起窗口 1 遍 | 0 | `state.json` 读写各 1 |
| **第 16 批**：切语言 | 写偏好 1 个；工作台语言脚本 1 个；本页插件的词 1 个批量请求；**当前页面 HTML 2 个**（第 5.4 节），每个同源分屏窗格各 2 个；iframe 0 个 | 2 个页面请求各按现有画页路径走，语言不同不能共用 | 同打开一次页面 | 同「打开一个插件」 |
| **T10**：有页面的一轮 | 比现在多 0 | 比现在多 0 | 0 | 语言变了才写 1 次 Home 文件 |
| **T10**：宿主发起的一轮 | 0 | 0 | 0 | 进程第一次读 1 次 Home 文件，之后走内存 |
| 后台 | 0。不轮询，不定时（N54），隐藏的窗口回到前台才重读 | 0 | 0 | 0 |

没有短 TTL 缓存（N55）：资源按摘要命名，内容变了地址就变；投影按版本失效。一次切换不进模型，不按插件各读一遍（FSS-20）。调用预算用例（N56）另有主人；A 段的 FSS-63 自己断言上面前四行。

## 12. 用户定的事

决策记录在[需求书 §12](spec.md#12-决策记录)。第 1～6 条用户弹窗定；第 7、8、9 条用户 2026-11-07 定。第 4 条多的一类、第 5.2 节没有语言时不抛、T2 与 T3 的先后、第 5.4 节的定位是主会话的裁定，同样记在那里。

| # | 事 | 选了 | 否掉 | 在本文 |
| --- | --- | --- | --- | --- |
| 1 | 页面下载量的检查（决策第 23 项其余部分） | 真打开一遍算总数（预算方案二）：起真实服务、不开浏览器，算主要页面第一次和再次打开共下载多少，只许变少，不设绝对上限，第一屏资源都记账（`registry.json` 和 `tooling/gates/first-screen.json` 两处，第 9 节）。第 16 批开工前单开门禁 PR，不和功能混，A 段不做 | 只在代码里查名单（查不出网页本身变大）；每次真开浏览器（慢、易误报） | 第 9 节 |
| 2 | 语言目录 | 工作台一份，插件按需；第 16 批带实测按类一次批准，不逐个问 | 每种语言一个大文件（每页仍下发全部插件的词） | 第 4.4 节 |
| 3 | 候选字体 | 批准下载实测，结果写进 `resource-budget.md`，本文不写字节 | | 第 3.4 节 |
| 4 | 新旧写法并存（决定 20） | 并存到第 16 批，不算违反：一个插件只能写一种，只有样例用新写法，现有插件不动；断言 C 段之前内置插件不写新写法。**多一类（主会话裁定，由主会话告诉用户）：** 第 08 批内容包在第 16 批前就写 `ui.locales`，比用户同意的「只有样例」多一类，理由是内容包是新东西，不算现有插件，也不是逐插件切换 | | 第 6.1、8.3 节 |
| 5 | 合审 | 公共合同台、D 轨没回音时，由没碰过它的子代理合审；它们回来有意见照样处理 | | 第 10 节 |
| 6 | 排队 | 本批插队：T1 先于 #1846，T4、T5 先于 #1872，它们之后合入前重新生成快照 | | 第 10 节 |
| 7 | 没有页面的工作用什么语言 | 跟最后一次用的语言 | 记下发起时的语言（切语言后要逐个改）；用主人默认语言（英文用户收到中文日报） | 第 15.1 节 |
| 8 | 切语言时的误换 | 接受，范围只限：客户端画的、和界面文字一字不差的用户内容，临时显示成译文，只影响显示，不写数据，之后重画或重新打开恢复。超出这个范围的第 16 批实走出现就停下问 | | 第 5.4 节 |
| 9 | 圆润字体 | 第 16 批前定，另外派人再比一轮 | | 第 14 节 |

## 13. 验收标准

A 段的验收写在[需求书 §11](spec.md#11-验收标准) 的 FSS-42～FSS-73，那里才是检查（`scripts/check-spec-coverage.mjs` 只读 `spec.md`）和测试引用的地方，每片证明哪几条在第 10 节的片表里；FSS-74 不是 A 段，由第 08、16、20 批证明。测试只写真正证明了的编号；A 段为 FSS-09、FSS-34、FSS-35 等打基础，但不证明它们在全部入口成立，**测试不写这些旧编号**，否则报告会显示假覆盖。

## 14. 第 16 批要接着做的（从这份合同看到的）

只记不留死路要用的。

- 门禁 PR：页面总数、第一屏清单、语言和皮肤的路由（第 4.4、9 节），开工前单开。
- 字体方案加字号、行高、长文阅读、说明文字（第 3.4 节）；圆润字体第 16 批前定；`PLUGIN_COMPONENTS` 搬进共同规格（第 3.3 节）。
- `ActionLocale`、`WebLocale`、`WEB_LOCALES` 写死两种语言，改由语言描述驱动。
- 内置插件和沙箱包的语言文件（`alchemist`、`plugin-builder` 没有 `package_name`，另给包目录）、`FrameConfig` 与沙箱启动的上下文、动作网关包一层语言、`molis-work:ui-environment-changed`（第 4.5、5.2、6.2、6.3 节）。
- 第 5.4 节的合并代码进工作台脚本和 iframe，量字节；`/locale` 跳转改成原地；#1795 留下的三条小修。

**迁移：脚本处理能认出的，其余先分类。** 换键的对象是 `L(`、`p.text(`、`model.primitives.text(`、`host.translate(`、`globalThis.L(`，键由现有词典的对应生成。下面三类先挑出来，脚本不碰：

| 类 | 例子 | 去处 |
| --- | --- | --- |
| 预转义和 HTML 参数（粗数 13 处，`const safe = esc(x)` 这样的脚本看不出） | `settings-models.ts:212,375`（`{ name: p.escape(...) }`）、`settings-call-diagnostics.ts:34`、`capabilities.ts:90`（`{ link: <a…> }`）、`context-onboarding.ts:324,331`、`agent-studio.ts:229`。换成 `t` 二次转义，或显示 `<a href=` 字样 | 去掉预转义；HTML 参数拆成整句键加组件 |
| `L(变量)`（569 处）：`L` 查不到返回原文（`i18n.ts:127-129`），`t` 显示不可用 | `web-goals-read.ts:266`（`L(error.message)`）、`model-provider-list.ts:72`、`plugin-interaction-answer.ts:28`、`board-plugin-rows.ts`、`artifact-library-http.ts:46`；条件键 `todo/src/browser/page.ts:73` | 值是主人或用户的话，走 `literal` 不翻译；值是存量界面词，先变成键再显示 |
| 内联脚本的局部变量名 `t` | `context-onboarding.ts:320`、`agent-studio.ts:309`、`judgment-rules/settings-client.ts:3`（换完无限递归）。都在字符串里，`tsc` 不看，`client-script-undeclared` 也拦不住 | 先解析字符串里的作用域，再改名 |

另外：只有数字的 164 处按第 2.3 节不分组，年份、端口、版本号逐类看；注入翻译函数的文件（如 `feed/src/stage-ui.ts`）开工前数；语言文件的标记字符按第 5.3 节改；`scripts/gates/translations.mjs` 适配是改门禁，先问用户。

**开工前全部盘点不经页面请求能到的翻译调用，不止 `Error(L(`：** 第 5.2 节的继承路径和入口、定时任务、缺配置的错误路径（`assistant-error.ts:13`）、重启恢复。错误路径上的文字不能盖掉原错误。这些路接上 `runBackgroundWork`，会存下来的改存键。

**「新代码不依赖译文」的存量（`origin/main`，核过）：**

| 类 | 数 | 处理 |
| --- | --- | --- |
| 拿译文做判断 | **5 处：** `client/placement.ts:39`、`events-primary.ts:122`、`coding/src/browser/main/select.ts:111`、`main/run-facts.ts:43`、`goals/src/planning-client.ts:60`。`goals/src/relation-client.ts:17` 是按语言选标点，同样要改 | 比键或原值 |
| 把译文交出去或存下 | `context-onboarding-service.ts:411,513-516`（`L` 算好标题正文交给动作）、`assistant-http.ts:446`（`L` 拼好的话发进对话） | 存键，或交原值 |
| `Error(L(` | 165 处、74 个文件，多数是页面代码，服务端 20 处（`apps/local-host/src`）和 `goals/src/event-document-deliverables.ts:81` 优先查，**没有逐条分** | 开工前逐条分，会存的存错误码 |
| 写死日期语言 | 带写死语言或 `\|\| "zh-CN"` 回退的 13 处（`agent-review-http.ts:96`、`assistant-followups.ts:223` 等），不带参数的 38 处 | 改 `format` |
| 首屏写法（第 5.4 节） | 直接 `Intl`：`project-home.ts:72,100,110`；`.replace`：`project-home.ts:141`、`assistant-island.ts:125`；半句：`project-home.ts:222`、`assistant-tabs.ts:28`。半句全仓约 70 处（需求书 §6.1 第 3 条），`.replace` 不在这个数里，开工前数；CSS 变量里的字（`navigation-presentation.ts:9`） | 改 `format`、带参数、整句一个键 |
| 按中文排序 | 2 处：`assistant-contributions.ts:55`、`catalog-patterns.ts:36` | 用当前语言 |

拿译文做判断、写死语言、`t.text` 拼进模板插值都能静态查，新门禁先问用户，这里不加。

**内容翻译（第 15 节）：** goals 的 37 个方法、内置 Character、提示词段（各升版本）；Todo、Issues、Pages 的方法正文从代码搬成文件；Coding、创作台接回复语言；创作台生成内容的默认语言跟所选语言。**手册和脚手架（第 16 节）：** `create.ts`、`sample-source.ts` 默认生成语言文件；`generated-*.md` 和 `CHAPTERS`（要 `pnpm studio:replay`）；手册删旧写法。**第 70 批不变：** `DESIGN.md` 的皮肤章节、个人助理的外观 Skill。

## 15. 内容语言

用户 2026-11-07 的要求，原话：「同时各类资源包，也是做到多语言的，比如用户选择英语，那么助理回复什么的也是英语，技能也是英语」。

**今天和这个要求不符：** 助理提示词只有一句「用用户使用的语言」（`apps/local-host/src/assistant/assistant-agent.ts:63`）。核过 `assistant-*.ts` 和 `horizontal/agent-host/src`：界面语言**没有**传到模型那一边。`assistant-followups.ts:223` 还写死 `zh-CN`。08 的技能包合同没有语言字段，goals 的 37 个方法正文全是中文。

**规则：**

- **用户选了某种语言，助理的回复、Skill、Character、提示词段、方法库、内容包、创作台生成的内容都跟这个语言走。** 用户在这一轮明说要别的语言时听用户的。
- **不变的：** 用户自己的内容和已有对话不翻译。
- **业务零侵入：** 回复语言由平台在一处给模型，插件和 Skill 不写判断。
- **文件要少：** 每份内容每种语言一个文件，和语言文件同样的约定。外部导入的标准 Skill 只有一个 `SKILL.md` 也能用，把它当默认语言。
- **缺译文时：** 用默认语言正文，回复仍按所选语言，界面不报错。
- **一句话走键，一份正文走文件。** 作者不用猜：标题、说明走 `TextRef` 和词表；Skill 正文、提示词、方法、角色的做事方式、内容包的 `body` 走文件。

**注意一个取舍：** 选了英文界面却用中文打字，回复也是英文，除非明说。这是用户规则的直接结果，今天「用用户使用的语言」那句要改掉。

### 15.1 没有页面的工作用什么语言（用户 2026-11-07 定：跟最后一次用的语言）

定时任务、后台轮次、MCP 没有入口。

- **什么时候更新：** 用户在页面上切语言，或在页面上用助理：发消息、回答问题、重新准备操作卡。只是打开页面不算，后台开着的旧窗口不会改掉它。
- **什么时候读：** 定时任务每次开始运行时读，已有日报从下一次起跟着变，不用逐个改。**一轮之内不变。**
- **和「界面语言只在这个浏览器」：** 不冲突。界面语言仍是每个浏览器各选各的，Cookie 不变；这项记录不决定任何页面显示，只给没有页面的工作用。两个浏览器语言不同时，没有页面的工作跟最后动的那个。
- **主人与存放：** 主人是宿主，新文件 `apps/local-host/src/ui-locale-memory.ts`；存在 `<Home>/config/ui-locale.json`，算带版本文件（`home-stores.ts` 加一行，版本条目 `format.ui.last-locale`，第 1 版不用升级步骤）；不存在就用默认，不算新增兼容逻辑。不加表，别的包不碰文件。B 段的外观主人进 `horizontal/` 时连同文件一起搬。
- **读写函数：** `rememberUiLocale(home, locale)`：取值校验过才写，和内存里相同就不写，写失败只记一条问题，不挡请求。`readUiLocale(home)`：第一次读文件，之后走内存；没有记录或读不了时是 `null`，调用方用 `resolveWebLocale` 的默认。
- **写的入口：** `assistant-http.ts` 的 `pageRoundLanguage`（发消息、回答问题、重新准备操作卡共用），和 `/locale`（`web-server.ts:134`）。`/locale` 是 GET：`web-server.ts:133` 的 `refuseForeignRequest` 拒掉非回环的 `Host` 和跨站 iframe，`authorizeLocalWebRequest` 本来就放行所有 GET（`web-http.ts:152`），所以跨站 `<img>` 还能到。Cookie 照旧，写 Home 记录只认 `Sec-Fetch-Site: same-origin`，别的和没有这个头都跳过。别的网页让浏览器顶层跳到 `/locale` 仍能改 Cookie（`SameSite=Lax`），用户接着发送时回复语言和记录跟着页面走；页面语言变了用户看得见，害处小，不堵（`S-ui-locale-memory` 写进「看不到的部分」）。第 16 批原地切语言后改走写偏好的动作。

否掉：**记下发起时的语言**，切语言之后旧日报不变，要逐个改；**用主人默认语言**，英文用户也会收到中文日报，不满足用户的要求。

### 15.2 回复语言怎样给模型（T10）

**不动公开合同：** 走 `AgentStartAuthority`（`horizontal/agent-host/src/index.ts:122`），和 `call_id` 一样只有宿主给，请求里什么都不读。`AgentStartRequest` 和 `startInput`（`agent-host.ts:382`，`agent.run.start` 给插件的输入）都不碰，所以插件传不了。

- **路径：** `assistant-http.ts:272` → `assistant-service.ts:205` → `assistant-dispatch.ts:230` 的 `host.start`（`assistant-round-start.ts:32`）。`assistant-executor.ts:106` 是外部执行方的，不走这里。
- **有页面的一轮：** 发消息、回答重启前搁置的问题（`assistant-outcomes.ts`）、重新准备操作卡，这三处都由 `assistant-http.ts` 的 `pageRoundLanguage` 读 `pageLocale()`、记第 15.1 节的记录，作为参数经 `send` 或 `answer`、`dispatch` 进 authority，后面不再碰全局。一轮跟发起它的页面走，不读记录：两个浏览器语言不同时，各自发起的一轮用各自的语言。讨论串的回复第 16 批之前读记录。
- **宿主发起的一轮**（定时安排、续轮等，开轮的入口不止 `assistant-service.ts:81,95`）：`dispatch` 没收到语言就读第 15.1 节的记录，放在这一处，不靠入口名单，也不继承当初页面的语言。长期任务的入口包 `runBackgroundWork`（第 5.2 节）。
- **固定文字：** 取值校验（`isWebLocale`）后映射到固定的一段话，不把字符串拼进提示词。不用 `LOCALE_TAG`，所以 T10 不等 T1。按 `fencedMaterials` 的做法算代码里的固定文字，不登记、不进「提示词」设置页（`docs/platform/PROLOGUE-AI.md` 第 14 节「回复语言」一行）。
- **版本记得下：** 放进 `composeRolePrompts`（`run-start.ts:71`，调用在 `index.ts:351`），一条带 `prompt_id`、`version`（`prompt.reply-language`，走 `tooling/versions.json`）的提示词，`freezeRunStart` 就记下了。`prologue-run-start.ts:87` 只拼字符串，记不下。`ASSISTANT_BASE` 那句改成「回复语言见本轮说明；本轮没有说明时，用用户使用的语言」，`prompt.assistant-base` 按阶段一在第 1 版原地改（收口时改正：#1960 起 `verify-release-versions` 在 CI 里拒绝未到首次外部安装就升提示词版本，`CONTRACT-CHANGES.md` 第 3 节）。
- **它不是最后一段：** `roundCharacter`（`prologue-run.ts`）在 `character.instructions` 之后还接子角色说明、侧栏浏览器和桌面说明、步骤板，今天都是中文，都可能把回复带回中文。助理开轮时 `skills: []`（`assistant-round-start.ts`），方法正文不进系统提示，走材料（`compose`）或 `assistant.methods.read@2` 的工具结果，以用户消息或工具结果的身份到模型那边。FSS-71 的真实模型验证用两个用例：带一个点名的中文方法，和一轮有侧栏浏览器的。
- **T10 只接个人助理。** Coding、创作台第 16 批接同一个字段，宿主从 `caller.locale` 补。压缩和结尾复核的提示词不动。

T10 不依赖其余各片，也不碰文字工具。

### 15.3 Skill 的文件约定（交第 08 批合同）

**约定：** `skills/<skill_id>/SKILL.md` 是默认语言，标准格式不变；译文是同目录的 `SKILL.<语言>.md`。和 `locales/<语言>.json` 一样由约定路径得出，加一种语言不写路径。**只有 `SKILL.md` 的是合法包**，外部导入不需要语言标记。

逐条对照 `specs/skill-packs/contract-design.md`（08 C-1、C-2 还没合，现在改最便宜，**改动归第 08 批**）：

| 卡点 | 位置 | 规则 |
| --- | --- | --- |
| 正文路径 | §4.2 `body` | 仍是 `skills/<id>/SKILL.md`。声明加可选 `locales?: string[]`，列这个 Skill 有哪些译文，是 `ui.locales.available` 的子集；不写就只有默认语言。**`locales` 只列译文，写了默认语言就拒绝；没有 `ui.locales` 却写 `locales` 也拒绝**，否则「不多不少」的清单会算出 `SKILL.zh.md` |
| 文件清单 | §3「不多不少」 | 由声明算出每种语言的路径。默认语言必须有；声明了的译文缺文件算坏包 |
| 版本 | §4.3 | **所有语言共用一个 `version`**，摘要算全部语言。修一个英文错字也要升版本。理由：`SkillRef` 要精确，一份规则。代价：升级差异会多，加字段 `changed_locales` 写明改了哪种语言（`change` 是枚举，不动） |
| 读正文 | §8 `skills.body.read@1` | 语言不进输入。user、plugin 用调用上下文的 `locale`；agent 用这一轮的语言（见下面「轮次」一行），第 16 批之前到不了 `ActionCallContext.locale` 时读默认语言。输出加 `locale`（实际用的，单文件包是 `null`）和 `fell_back: boolean`，默认语言未知时 `fell_back` 是 `false`。回退不算「悄悄换版本」，版本没变，结果也写明了 |
| 轮次 | §5、§7 | 开轮时 `SkillRef` 名单照旧冻结。回复语言今天只是一段提示词，记在 `frozen.prompts`（`prompt_id`、`version`），冻结记录里没有语言字段。交给外部执行方时当场算语言；要读冻结值，由第 09 批合同 PR 照 `call_id` 的路加 `frozen.reply_locale`（`frozenOutput` 不许多字段，属动作合同） |
| 元数据 | §4.1、§4.2、§8 | **宿主只读词表，不读 frontmatter**（08 §4.1）。`pack-content` 把译文文件 frontmatter 的 `name`、`description`、`when_to_use`、`summary`、`when_not_to_use`、`argument_hint` 转进语言文件，键是 `<主人>.skill-<skill_id>.<字段>`。所以**有 `SKILL.<语言>.md` 的包必须有 `ui.locales`**，没有就按「不多不少」拒绝，不是悄悄只用默认语言。给模型选 Skill 的 `description` 也跟语言，不进 MCP。这些词可能有 `don't`、`<file>`，内容包的语言文件不查这五个字符，页面上只经 `say`、`createTextReader` 读（第 5.3 节）。`excerpt` 从所用语言的正文取。译文文件写 `tools`、`applies_to` 就拒绝。**花括号（T7 定）：** 内容包只放宽这五个字符，占位符规则不放宽，`{foo bar}`、`{pr-number}`、`{n\|a\|b}` 仍报 `ui.locale_placeholder`、`ui.locale_old_plural`。`{file}` 这种像参数名的不算错，`say` 不给这个参数时原样显示（`fillMessage`「A name with no value stays as written」），但各语言要写同样的名字。所以 `pack-content` 转词时遇到不合规的花括号**直接拒绝这个包**，问题写明 Skill、字段和替换写法（`‹foo bar›` 或 `[foo bar]`），不替作者改字。理由：作者手上有文件，改一行；规则只有一份；只有写了 `ui.locales`、由 `pack-content` 转词的包才碰到，外部导入的单文件包不转词，不受影响；以后要放宽容易，放宽了再收紧就拒掉已发的包 |
| 键的形状 | §4.2 | `skill_id`（`AGENT_TOKEN`）可以数字开头，`STABLE_KEY` 第二段起要字母开头，所以写成一段 `skill-<skill_id>`。导入包算 `plugin_id` 时最后一段以字母开头，否则主人名过不了；前缀也必须是 `io.molis.work.`，否则 `parsePluginManifest` 拒绝 |
| 外部导入 | §6 | 不要语言标记，单文件当默认语言。只有 `SKILL.md` 的包，`ui.locales` 可选；有 `SKILL.<语言>.md` 的必须有（见「元数据」一行） |
| 资源 | §4.2 | `SkillResourceDeclaration` 加可选 `locale`。`scripts/`、`assets/` 不分语言。上限不变（按全部语言计） |
| 白名单 | §3 | 收 `ui.locales`，去掉 `ui.messages`、`ui.translations`（第 6.2 节） |
| `name_en` | §3 | 写死两种语言，由词表替代，第 16 批删 |
| 内置方法 | §4.2「由定义给正文」 | Todo、Issues、Pages 的正文在代码里。第 16 批改成同样的文件，否则内置和外部写法不一样，违反插件同等待遇 |

### 15.4 内容包与场景包（交第 20 批合同）

逐条对照 `specs/scene-and-page-contract/spec.md`（P-3b 没合，**改动归第 20 批**）：

| 卡点 | 位置 | 规则 |
| --- | --- | --- |
| 正文写在声明里 | §3 `content.body`、§5 `RoleTemplate.instructions` | **整份场景包一个文件。** 内容包里是 `blueprint.json`（默认语言）和 `blueprint.<语言>.json`，形状都是 `Blueprint`。Manifest 的 `blueprint` 键写 `{ locales: string[] }`，是 `ui.locales.available` 的子集，「不多不少」由它判；有场景包时 `ui.locales` 必填（标题要键）。**单语言包写 `locales: []`**（键在，就表示包里有 `blueprint.json`）。08 §3 的「至少一项」是说内容包的 `methods` 和场景包两者至少要有一个，**不是指语言**，`locales` 为空不违反它。`locales` 只列译文，写了默认语言就拒绝；没有 `ui.locales` 却写 `locales` 也拒绝，否则清单会算出 `blueprint.zh.json`。草稿仍是一行 JSON、一种语言 |
| 静态检查 | §3 `inspectBlueprint(blueprint)` | 加 `{ source: "package" \| "draft" }`：包拒 `literal`，草稿拒 `key`。新函数 `inspectBlueprintLocales(default, others)`：除 `body`、`instructions` 和 `TextRef` 外全等。`schema` 按每种语言核放到 `adoption.preview` 的主人检查里，静态检查不看目录 |
| 采用 | §5、§7 | `instructions`、`body`、`title`、`materials`、`outputs` 都按采用当时的语言取。`adoptions` 加 `locale`。撤销和升级差异按这个语言比 |
| 另存 | §7 `packs.save@1` | 草稿记 `locale`。存包时 `literal` 转成键，加单语言 `locales/<语言>.json`，`blueprint.json` 就是草稿的语言。转过去的词可能有 `R&D`，所以这条路也按内容包不查标记字符。**花括号同样不放宽（第 15.3 节）：** 这里是用户自己写的字，`{项目名} 周报` 这样的标题会被拒，第 20 批要在保存时把问题说给用户并给下一步，不能让用户看到 `ui.locale_placeholder` |
| 没装的包 | 08 `plugins.bundled.list@1`、预览 | 从包文件用 `createTextReader` 按语言读（第 6.2 节）。调用本身转义全文，`.text` 给纯文本；写进 HTML 不许用 `.text`（第 5.3 节） |
| 接得上的，不改 | §8 `adopt` 的 `schema`、§3 `skill` 建议、§6 生成页面 | 平台选好语言再交给主人，主人不用知道语言文件 |

第 44 批的官方场景包和第 20 批第 2 项跟同一规则。

### 15.5 给模型的动作说明、工具说明要不要换

**T10 不换；第 16 批量过再定。** 动作文字有了英文键之后，同一批英文轮次跑两遍，一遍给中文动作说明，一遍给英文，比回复里夹中文的比例和选对工具的比例（BL-103 记的是反方向的同类问题）。换的成本很小，只有 `assistant-directory.ts` 一处。**MCP 的工具说明不换：** 外部 Agent 没有界面语言，换了还会让对方的缓存和比对失效。

**红线：** 这一节没有改门禁、没有新增兼容逻辑、没有新增资源。

## 16. 写进开发流程、规范和插件手册

用户 2026-11-07 的要求，原话：「因为后续是插件化的，这一套也要集成到开发流程，规范，以及插件开发手册，以及其他必要的地方」。

**今天的缺口：** 需求 §9、FSS-29 把手册算正式交付，排在第 70 批，第 14 批到第 70 批之间新写的插件没有规矩。`skills/molis-plugin-dev/ui.md` 的「文案与 i18n」有旧写法（`p.text`、`src/en.ts`），别的章节、`create.ts`、`development-workflow.md` 都没有这一项。

### 16.1 手册不能写超前

A 段新写法只有开发路径走得通，带 `ui.locales` 的沙箱包装不上，内置插件还不能写。**手册必须分开写：**

| 事 | 今天（第 14 批之后） | 第 16 批起 |
| --- | --- | --- |
| 自己在开发路径写插件 | `import { t }`，`locales/<语言>.json`，`validate` 能查。写成 Integration（这个入口只收它），`molis-work plugin dev --locale <语言>` 选语言 | 同，也可以写 `ui.views` |
| 打成沙箱包安装 | **不行**，被拒绝，错误写明原因 | 可以 |
| 内置插件的文字 | 继续用 `L`、`p.text` 和 `ui.messages`（决定 20），不写 `ui.locales` | `t`、语言文件 |
| 新文字用稳定键 | 插件要做：`<主人>.<位置>.<元素>`。工作台和宿主**第 16 批起**：今天没有词表（`apps/workbench/src/messages.ts` 不存在），`L` 查不到显示原样，写键会把键显示给用户 | 都要做 |
| 不拿译文做判断、不把译文存进业务数据 | **新代码**要做；存量清单在第 14 节 | 存量改完 |
| 颜色字体只用语义变量 | 要做 | 同 |
| 没有页面的地方存 `TextRef` | 新合同里能用（T1）；内置插件第 16 批之前 `say` 查不到自己的词，现有记录不动 | 要做 |
| 给模型的内容跟语言 | 回复语言由平台给（T10）；Skill 分语言文件要等第 08 批合同 | 要做 |

**开工前检查里的规矩，今天就能遵守的才写「要做」，其余写「第 16 批起」。**

### 16.2 本批改什么（T9a、T9b）

**`skills/` 改动不能排在全量回归期间**（AGENTS「构建与测试」）。**`AGENTS.md` 和开发流程这几段全局规矩，T9b 开写时由主会话先拿草稿给用户看，文字经用户确认。**

| 位置 | 改什么 | 片 |
| --- | --- | --- |
| `skills/molis-plugin-dev/text-and-appearance.md`（新） | 一章：文字四类、语言文件、外观变量、内容语言，加第 16.1 节的表 | T9b |
| `skills/molis-plugin-dev/SKILL.md` | 「读哪份」加一行入口 | T9b |
| `skills/molis-plugin-dev/elements.md`「身份」的 `plugin_id` 一行 | 写明前缀 `io.molis.work.`、最长 200 字符、用 `ui.locales` 时最后一段以字母开头（见第 10 节 T9b 注意事项） | T9b |
| `skills/molis-plugin-dev/ui.md`「文案与 i18n」 | 不抄第二份，加一句指向新章，写明这一节是内置插件第 16 批之前的写法。`CHAPTERS` 只挂 `ui.md` 的「质量线」一节（`plugin-builder/skill.ts:17-20`），这里不在挂载范围 | T9b |
| `docs/platform/PLUGIN-DEVELOPMENT.md` | 加一节：怎样声明 `ui.locales`、`validate` 的错误怎么读、现在哪条路走得通 | T9b |
| `development-workflow.md` 第 4 节 | **并入第 12 项，改名「页面、外壳与文字」（主会话裁定），不为文字加项。** 加的内容：新文字归谁、新代码不依赖译文、不存译文、颜色字体只用语义变量、给模型的内容跟语言；按第 16.1 节标「今天」和「第 16 批起」 | T9b |
| `development-workflow.md` 第 10.1 节 | 第 3 行或第 6 行加一句评审要点，指向第 4 节第 12 项；不加新行 | T9b |
| `docs/prompts/repository-systematic-review.md` | 第 9 节（前端质感）加一条：文字、语言、外观变量；指向新章 | T9b |
| `docs/system/DEVELOPMENT-REQUIREMENTS.md` | 不改。它只管包 README「开发要求」的写法，文字规矩不在那一层 | |
| `AGENTS.md` | 「先读哪里」加一行。硬约束加一条窄的，带时间边界：「新代码不拿译文做判断、不把译文存进业务数据；存量清单在字体皮肤设计稿第 14 节，第 16 批改完（`RoleTemplate` 采用时存字符串是例外）。第 16 批起后台工作存 `TextRef`。」SDK 共用工具枚举加文字工具 | T9b |
| `docs/README.md` | 按任务选路径的表加一行，指向新章 | T9b |
| `docs/platform/PROLOGUE-AI.md`、`skills/molis-prologue-ai/SKILL.md` | 各一句：回复语言由平台给，提示词和 Skill 不写语言判断，指向第 15 节 | T9b（等 T10） |
| `apps/workbench/README.md`「界面文字」 | 一句指向，写明旧写法到第 16 批 | T9b |
| `docs/cli-and-development.md` | 一句：`validate` 查语言文件，指向手册 | T9b |
| `docs/system/EXTENSION-POINTS.md` | 加一种界面语言要改哪里 | T9a |
| `docs/system/GLOSSARY.md` | 加文字引用、语言文件、字体方案、展示快照；2.7 第 2 条的主人改成「插件最后一段或平台主人（`workbench`）」，`settings`、`shell` 这类宿主区域写成 `workbench` 的第二段（`workbench.settings.*`），不另设主人；加一句区分「字体角色、令牌角色」和术语表的角色（Character） | T9a |
| `docs/SSOT-MATRIX.md`、SDK README、`docs/platform/UI-PLATFORM.md` | 原有的 | T9a（SSOT 那条在 T6） |
| `.github/pull_request_template.md` | **不改。** 它只指向第 4 节和第 10.1 节 | |
| `specs/README.md` | **不改。** | |

**不放进 `CHAPTERS`：** 否则要跑 `pnpm studio:replay`，生成内容也跟着变。第 16 批才动。

**08、20 的作者文档：** 不在这里改，第 15.3、15.4 节的清单一起交过去，手册章节由那两批补。

### 16.3 验收

**手册实走（FSS-72，放 T9b）：** 一个没读过设计稿的独立代理，依赖只装公开两包，加已安装的 CLI（`plugin-cli` 是私有包，`cli.ts:45`），只给手册，从空目录写一个带中英文的 Integration 小插件，参数带 `'` 和 `&`，经 `molis-work plugin dev` 跑起来。卡住的地方算手册缺陷，改手册再走一遍。

### 16.4 批次调整（主会话改批次文件）

| 批 | 要写什么 |
| --- | --- |
| `batches/14.md` | 交付项加 T9b、T10；「TextRef 先于 05② C-3」改成 C-2、P-1、C-3（第 15、32 行）。「交付与前置」写三条偏离：T8b 放本批；T10 回复语言提前到本批；手册和流程从第 70 批提前 |
| `batches/05.md` | 第 22、76 行还只说 C-3 等 `TextRef`，加 C-2 |
| `batches/20.md` | 第 135 行同上，加 P-1、P-3b |
| `batches/16.md` | 第 14 节的清单：迁移三类、盘点、首屏写法、脚手架、`generated-*.md` 与 `CHAPTERS`（要 `pnpm studio:replay`）、手册删旧写法、`translations.mjs` 适配（改门禁，先问用户）、内容翻译；第 5.4 节验收在真实首屏 |
| `batches/70.md` | 手册的大部分已前移；剩 `DESIGN.md` 的皮肤章节（核账第二节第 4 条）、个人助理的外观 Skill，以及交付前的全量核对 |
