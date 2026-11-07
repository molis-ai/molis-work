# 字体、皮肤与语言系统：A 段合同设计稿

状态：设计稿，尚未实现（2026-11-07）；要用户定的事只剩一项（第 12 节第 7 条：没有页面的工作用什么语言），它不挡 A 段任何一片。路线书第 14 批合同台写，写手拿它开工；合同代码按第 10 节单独开小 PR。代码依据是 main `88c713ba3`，只读核对，没有构建、没有跑测试、没有碰真实 Home；第 5.4 节的原地更新没有写原型。需求与总验收仍以[需求书](spec.md)为准，总体方案见[实现方案](implementation-plan.md)；两边与本文不一致的 A 段字段，以本文为准。

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
  return `<h2>${t("notes.main.title")}</h2>`                          // 直接可用且安全
    + renderButton({ label: t("notes.main.add") })
    + `<time>${format.date(model.at, "datetime")}</time>`
    + `<p>${t("notes.main.saved", { count: model.saved })}</p>`;
}
// 样式：只写语义变量，换皮肤不用动
.notes-title { color: var(--ink); font-weight: var(--weight-title); }
```

**后台工作没有页面，语言不确定，不调 `t`，存引用。** 这时调 `t` 明确抛 `ui.text_no_context`，错误里点名键，并说「存 `TextRef`」。不悄悄用默认语言，理由：悄悄的默认值会把错的语言存进记录，页面上才看得出来，这时已经改不回；抛错在测试里就抓到（第 5.2 节）。

**切语言时业务代码什么都不做**，也没有绑定标记，平台重取这块内容再原地合并文字（第 5.4 节）。

**词表每个主人一张，不合成一张。** 三个理由：
- 插件独立安装、卸载，第三方写不进中央表。
- 合成一张会互相覆盖：Pages 把「复制」译成 Duplicate，盖掉了助理的 Copy（[需求书](spec.md) §6.1 第 4 条）。
- 合成一张就得整张发：实测英文页每次多发 1.9 MB（`resource-budget.md` 第 4.2 节，2,573,362 B 对 666,388 B）。

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

**`src/stage-ui.ts` 有一处不是脚本能漂亮处理的，照实写：** 它把翻译函数当参数传（`buildFeedModel({ L: model.primitives.text }, …)`，内部 `text.L("…")`）。脚本把 17 行里的 `text.L("…")` 换成 `t("…")`，参数 `text` 就没人读了。**第一遍不动签名，留一个没人用的参数**，由主人之后单独清理，清不清都不影响切换。这样注入翻译函数的文件有多少，第 16 批开工前要数（第 14 节）。

`p.text`、`host.translate` 在 C 段删掉，所以第 16 批要连这两个名字一起换（第 14 节），不留第二条路。

**只有一种情况要多想一下：** 句子带**字符串参数**，又不是拼进 HTML。这时写 `t.text(…)`，见第 5.3 节。按实际调用数约 1 成，迁移脚本按位置判断。

| 不许业务代码做的 | 怎样保证 |
| --- | --- |
| 读语言、皮肤、字体，写按语言或皮肤的分支 | 工具里没有判断语言的写法也能写完页面；样例源码用断言查（FSS-62） |
| 订阅变化 | 普通页面没有订阅 API；只有要重新测量的终端、编辑器才听一个可选事件（第 4.5 节） |
| 拿译文做判断 | 窄规矩「逻辑不依赖译文」（第 16 节），靠评审；今天的违反列在第 14 节 |
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

随产品发行、有包内路径的东西（字体、皮肤、字体方案、共同规格、平台语言目录）只登记在 `packages/design-system/resources/registry.json`，字段见第 3.6 节。这张表不收别的：插件的语言文件唯一声明是 Manifest，报告从内置目录投影，不抄第二份名单；隐藏文档、内联块、启动 JSON 不是发行文件，第一屏清单放在门禁自己的文件里（`tooling/gates/` 下，第 16 批前的门禁 PR 新建，A 段不建）。

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

**工作台这一个文件是枢纽：** 并行 PR 都改它。键按字母排序、一行一个，不相邻的改动能自动合并；`validate` 查排序。

| 操作 | 动几处 | 跑什么 |
| --- | --- | --- |
| 加一句界面文字 | 2 处：代码里 `t("key")`，默认语言的语言文件加一行 | 插件作者跑 `molis-work-plugin validate` |
| 改一句译文（插件或平台） | 1 处：语言文件那一行 | 不用跑。CI 解析全部语言文件 |
| 别的语言缺键 | 只算覆盖率，不阻断 | 同上 |
| 改一个颜色 | 1 处：皮肤文件 | 不用跑。改 Soft Workbench 的值 CI 会照常比页面资源 |
| 给插件加一种语言 | 2 处：`locales/<语言>.json`，Manifest 的 `available` 加一个词 | `validate` |
| 给平台主人加一种语言 | 1 处：语言目录里加一个文件 | 不用跑 |
| 加一个平台文字主人 | 2 处：语言目录，登记表一行 | 不用跑 |
| 加一款字体（先问用户） | 3 处：字体文件，字体方案，登记表一行（含 sha256、许可） | 报告脚本打印那一行的 sha256 |

**不用 `tooling/versions.json` 的 `carriers` 改这些 JSON。** 格式版本升一号时文件形状也变了，只改数字的工具帮不上忙；`scripts/gates/version-declarations.mjs` 也不读这些 JSON。解析器发现 `format_version` 不符就拒绝，CI 的解析测试会拦住。这是对 `docs/releases/POLICY.md` 第 1 节「代码以外的文件只由 `carriers` 改写」的例外，T2 在同一个 PR 里把这条写进 POLICY。

## 2. 文字引用 `TextRef`

这一节可以先开工，05② C-3、15 S-1、20 P-1 等它。

### 2.1 形状

新文件 `packages/contracts/src/platform/ui-text.ts`，由 `platform/ui.ts` 用 `export *` 转出，和 `ui-connections.ts` 同样做法。理由：`ui.ts` 已有 794 行，文字引用是独立的小合同；`plugin-manifest.ts`、以后的 `presentation.ts`、`blueprints.ts` 只要类型，直接 `import type` 这个文件，不用拖进整份 `ui.ts`。

```ts
import type { SandboxSchema } from "./plugin-sandbox.js";

/** 一个参数。存原值，不存已格式化的文字。 */
export type TextArg =
  | { readonly name: string; readonly kind: "text"; readonly text: string }
  | { readonly name: string; readonly kind: "number"; readonly number: number; readonly style?: "decimal" | "percent" | "compact" }
  | { readonly name: string; readonly kind: "date"; readonly at: string; readonly style: "date" | "time" | "datetime" | "relative" };

/** 写在声明、动作输出、内容包里的形状：没有主人。主人由平台绑定，声明里写了 owner 就拒绝。 */
export type TextRef =
  | { readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

/** 平台绑好主人之后的形状：组合服务的输出、存下来的摘要、页面拿到的都是它。 */
export type OwnedTextRef =
  | { readonly owner: string; readonly key: string; readonly args?: readonly TextArg[]; readonly fallback?: string }
  | { readonly literal: string };

export const TEXT_REF_LIMITS = { key: 120, args: 8, arg_name: 64, arg_text: 2000, literal: 2000, fallback: 2000 } as const;

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

- **键的规则复用 `STABLE_KEY`**（`packages/plugin-sdk/src/message-declarations.ts:9`）：它和 `messageOwnerOf`（`:16`）都改成模块内 `export`，不进公开出口，`ui/text-ref.ts` 从那里取，不另写一份。门禁脚本 `scripts/gates/translations.mjs` 自己那份不动。
- **键的前缀决定能不能用**：`ownedTextRef(ref, owner)` 里，`common.*` 绑到平台主人 `workbench`（共有词有唯一主人，引用要显式）；否则前缀必须等于主人名（`messageOwnerOf(plugin_id)`，即 `plugin_id` 最后一段；平台主人就是它自己的名字）；别的前缀拒绝。这条是防冒充：插件不能把字显示成别人的。`common` 作插件最后一段继续拒绝：现在由 `messageProblems` 管（`message-declarations.ts:32`），`parseLocalePack` 同样拒绝，C 段删 `messageProblems` 时这条留在 `parseLocalePack` 里。
- **查词按（主人，键）**，不再合成一张平面表（实现方案 §4.1）。`OwnedTextRef` 写明主人，两个插件最后一段相同也不互相覆盖。`t` 从键算主人，同一进程里同名的处理见第 5.2 节。
- **参数名**是 `[A-Za-z_]\w*`，和 `message-declarations.ts` 的 `PLACEHOLDER` 一致。`{标题}` 这种中文占位符新语言包不收，旧的 `fillMessage` 到 C 段都还认（第 3.5 节）。
- **日期**：`at` 是 ISO 8601。带时区的按当前设置显示；只有日期（`2026-11-07`）的按字面显示，不换算时区，避免因时区差一天。`relative` 用 `Intl.RelativeTimeFormat`，`now` 由格式化工具传入，测试可固定。
- **上限**是 `TEXT_REF_LIMITS`，`PLUGIN_MESSAGE_LIMITS` 的 `keyLength`、`textLength` 改成取它，不留两个数。

**谁拒绝坏引用。** `TEXT_REF_SCHEMA` 挡不住 `{}`、`{ key, literal }`、只有 `fallback`、`{ literal, args }`、`{ name, kind: "number" }`（缺值）：`SandboxSchema` 没有联合，也没有最少属性数。所以由 `textRefProblems` 查，它有三个开关：`literal: false`（这个位置不收 `literal`）、`key: false`（草稿没有主人，不收键）、`owned: true`（这个位置是绑过的，`owner` 必须有；默认是声明，写了 `owner` 就拒绝）。

| 入口 | 闸口 | 遇到坏引用 |
| --- | --- | --- |
| 声明里的引用（Manifest、内容包，安装时） | `parsePluginManifest`、`inspectBlueprint` 调 `textRefProblems` | 拒绝安装 |
| 动作输出，平台绑主人 | `ownedTextRef` 先跑 `textRefProblems`。这是这些位置的**唯一闸口**，schema 只挡 `owner` 和未知字段 | 抛 `ui.text_ref_invalid`（`defineErrorCodes("ui", …)`）。**批量读取的服务要接住：** `surfaces.compose` 里一个插件的坏 `summary` 只让这张卡变 `unreadable`，不让整次组合失败 |
| 页面读（`judgment`、存下来的摘要、过期的引用） | `say` | 不抛，显示 `common.text.unavailable` 并记一条问题，页面不因一句话坏掉。`renderPresentationForm` 里的 `judgment` 走这一行 |

**查词顺序（读不到时绝不显示裸键或空白，FSS-34）：** 所选语言包 → 同语种基础语言（`zh-CN` → `zh`）→ 主人默认语言包 → `fallback` → 平台共有词 `common.text.unavailable`，同时记一条问题（`UiTextProvider.problem`）。只装两包的作者手上没有工作台语言包，这句也查不到，SDK 留最后一层常量 `UI_TEXT_UNAVAILABLE = "…"`。没有上下文不算「读不到」，那是写错了地方，抛 `ui.text_no_context`（第 5.2 节）。

### 2.4 逐个核对消费者

| 用处 | 位置 | 形状 | 主人从哪来 | 能否满足 |
| --- | --- | --- | --- | --- |
| 字段标签 `label_key` | 05② §5 `PresentationObject.fields[]` | 改成 `label?: TextRef`，`literal` 不收 | Manifest 的 `plugin_id`（可信目录） | 能 |
| 概况说明 `note_key` | 05② §5、15 第 12.1 条 | 改成 `note?: TextRef` | 同上 | 能 |
| 分组标题 `title_key` | 05② §6、15 第 12.3 条 | `SurfaceGroup.title?: OwnedTextRef` | 组合服务绑定 | 能。输出位置要写 `OwnedTextRef`，页面才查得到词 |
| `hidden_above` | 05② §6、15 第 12.4 条 | `{ count: number; label: OwnedTextRef }`，`label` 带 `count` 参数 | 平台共有词 `common.surface.*` | 能。「只数读得了的」是服务的事，字不重新组合 |
| 为什么这样放 `reason` | 05② §6 | `SurfaceDescription.reason?: OwnedTextRef` | 组合服务 | 能 |
| 概况动作的 `summary` | 05② §5、15 第 12.1 条 | 动作输出写 `TextRef`（`TEXT_REF_SCHEMA`），服务按动作提供方绑主人 | 动作目录给的提供方 | 能。输出里写 `owner` 被 schema 拒绝，`{}` 被 `ownedTextRef` 拒绝 |
| `judgment` | 05② §5、15 第 12.6 条 | `{ label: TextRef; reason?: TextRef }`，`reason` 可 `literal` | 主人的 values 动作提供方 | 能。两份设计稿对 `reason` 的类型不一致，按本文改 15 |
| 「同一件事」，参数由页面填 | 15 第 7 节 | `OwnedTextRef` 少两个参数，页面调 `say(ref, { extra })` 补上标题 | 组合服务 | 能。服务不读显示字段，所以要有 `extra` |
| `activity` 角色的值 | 05② §5 第 370 行 | `OwnedTextRef`，主人可写 `literal`。05② 没说形状，这里定：一句「最近发生了什么」是显示文字，切语言要变 | 值的主人 | 能 |
| 插件页面上别人的对象 | 05② §7 | 不走这条路。平台画，经 `model.nested` 拼进来（第 8.3 节） | | 要改 05② §7 |
| `Blueprint.title` | 20 第 3 节 | `TextRef`，内容包不收 `literal`，草稿不收键 | 内容包的 `plugin_id`（安装记录）；草稿无主人 | 要改 20，见第 6.2、15.4 节，**上一版标「能」不对**：08 的白名单放不下 `ui.locales`，内容包没有会话，`packs.save` 拒 `literal` |
| `connection.purpose`、`SettingEntryDeclaration.title`、`SettingEntryDeclaration.summary`、`adopts[].title` | 20 第 3、4、8 节 | `TextRef` | 声明它的插件；系统提供方用登记里的 `text_owner` | 能。内容包里的同上一行 |
| `RoleTemplate` 的 `title`、`materials`、`outputs`，采用时存成字符串 | 20 第 5 节 | `say.text(ref, { locale: context.locale })`，见第 5.2 节 | 内容包 | 能。这是有意存字符串，说明见第 5.3 节 |
| 文本形态 `presentationText` | 05② §7 | `presentationText(object, values, locale)`，见第 5.2 节 | 对象的主人 | 能。签名要补 `locale` |
| 动作按钮 `action.<capability_id>.title` | 15 第 4.2 条、需求 §6.2 | **有冲突**，见下 | | 要改写法 |

**要改的地方（05② C-2、C-3，20 P-1、P-2、P-3b，08 C-1 与 15 的写手照此改设计稿，本 PR 不改）：**

1. 05② 的 `label_key`、`note_key`（C-2）、`title_key`（C-3）按上表换名和换类型；`overview` 的输出 `summary: TextRef` 用 `TEXT_REF_SCHEMA`（C-2）。C-2 不等到 C-3 才用 `TextRef`，否则字符串键先进 Manifest，再在最热的 `plugin.txt` 上开一个 PR 改回来。
2. 15 第 12 节第 6 条的 `reason?: string` 改 `reason?: TextRef`。
3. 05② §7：`renderPresentationForm`、`presentationText` 的签名和作者用法按第 5.2、8.3 节改。
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
    at: { type: "string", maxLength: 40 },
    style: { type: "string", enum: ["decimal", "percent", "compact", "date", "time", "datetime", "relative"] },
  },
};
export const TEXT_REF_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false,
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
| 取值 | `id` 匹配 `^[a-z][a-z0-9-]{0,63}$`；`revision` 是正整数 |
| 未知字段 | 拒绝，不忽略（需求 §3.1） |
| 重复属性名 | 进入 `JSON.parse` 之前拒绝，只有 SDK 的 `parseStrictJson` 一份实现：扫描器按路径记键，报 `$.light.ink` 和行列。普通解析器会让后值静默覆盖前值，看不出来 |
| 危险属性名 | `__proto__`、`constructor`、`prototype` 一律拒绝 |
| 大小 | `UI_FILE_LIMITS = { spec: 256 KiB, skin: 64 KiB, font: 64 KiB, locale: 1 MiB, depth: 12 }`，先比字节再解析 |
| 不收的东西 | CSS 文本、选择器、函数、外部 URL、任意属性名。不靠黑名单：取值只有下面的结构，文字位置只有名字和译文，译文只当文本输出（FSS-16） |
| 错误 | 新错误码写 `defineErrorCodes("ui", …)`，不写 Error 子类。`tooling/gates/error-owners.json` 加一条 `ui`，路径是这些新文件；现有 `plugin` 那行仍管 `packages/plugin-sdk/` 其余部分 |
| 结果 | `parse*` 返回 `{ ok: true; value } | { ok: false; problems: UiFileProblem[] }`。`UiFileProblem = { file: string; path: string; code: string; reason: string; fix: string; line?: number; column?: number }`，`file` 是哪个文件，`fix` 写下一步怎么改。作者工具和平台看到同一份问题，CLI 直接打印就能看懂 |
| 版本字面量 | `tooling/versions.json` 加 `format.ui.spec`、`format.ui.skin`、`format.ui.font`、`format.ui.locale`、`format.ui.registry`，代码写 `/* @version format.ui.skin */ 1`。JSON 文件不走 `carriers`（第 1.4 节） |

### 3.2 令牌取值

不收 CSS 文本，所以令牌值是结构；序列化器写回和今天逐字相同的文字（第 8.1 节要内容不变）。

```ts
export type UiTokenValue =
  | string                                                  // 只收 #rrggbb、#rrggbbaa、transparent，大小写原样保留
  | { readonly rgba: readonly [number, number, number, number] }   // rgba(255, 255, 255, .05)
  | { readonly role: string; readonly fallback?: string }   // var(--accent)、var(--hue-green-fill, #4cb782)
  | { readonly mix: { readonly role: string; readonly percent: number; readonly with: "transparent" } } // color-mix(in srgb, var(--ink) 7%, transparent)
  | { readonly shadow: readonly UiShadowLayer[] }
  | { readonly px: number } | { readonly ms: number } | { readonly number: number }
  | { readonly bezier: readonly [number, number, number, number] }
  | { readonly stroke: { readonly width_px: number; readonly style: "solid"; readonly role: string } };

export interface UiShadowLayer {
  readonly x: number; readonly y: number; readonly blur: number; readonly spread?: number;
  readonly color: string | { readonly rgba: readonly [number, number, number, number] } | { readonly role: string };
}
```

序列化规则（写手照今天的文字核）：

- 十六进制色值按文件里的写法原样输出，不统一大小写：`--content-tty`、`--mark-*` 共 22 个值是大写，改成小写内容就变了。
- 小数不写前导零（`.05`、`-.011em`）；`0` 不带单位；`spread` 省略时只写三段。
- 每个令牌输出 `--name: value;`，令牌之间一个空格。`renderShellTokens` 现在就是这个样子，浅深两份顺序相同（已核对 53 个）。
- 字体栈：名字带空格才加双引号，逗号加一个空格。`FONT_STACK`、`MONO_FONT_STACK` 现有文字都符合。
- `role` 必须是规格里有的角色，引用成环拒绝。

### 3.3 共同规格文件 `resources/ui-spec.json`

不叫 `interface.json`：沙箱包已有同名文件（`SANDBOX_PACKAGE_FILES.interface`），第 6.4 节同时在说它。

```ts
export interface UiSpecFile {
  readonly format_version: /* @version format.ui.spec */ 1;
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
  readonly format_version: /* @version format.ui.skin */ 1;
  readonly id: string;
  readonly revision: number;
  readonly spec: UiDefinitionRef;              // 只认这一份规格
  readonly name: TextRef;                      // 内置写键，用户起的写 literal
  readonly recommended_font: UiDefinitionRef;
  readonly light: Readonly<Record<string, UiTokenValue>>;
  readonly dark: Readonly<Record<string, UiTokenValue>>;
  readonly shared: Readonly<Record<string, UiTokenValue>>;
  readonly terminal: { readonly unset?: UiTokenMap; readonly light?: UiTokenMap; readonly dark?: UiTokenMap };
}

export interface UiFontSchemeFile {
  readonly format_version: /* @version format.ui.font */ 1;
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
export type UiFontFamily = { readonly system: string } | { readonly face: string };  // system 只收字母、数字、空格、连字符
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
  readonly format_version: /* @version format.ui.locale */ 1;
  readonly owner: string;                      // 文件自述，只用于核对和导入导出
  readonly locale: string;                     // zh、en、zh-CN；形状 LOCALE_TAG（第 2.1 节）
  readonly direction?: "ltr" | "rtl";          // 省略是 ltr
  readonly revision?: number;                  // 随包文件不写；Home 受管副本（D 段）才由主人递增
  readonly messages: Readonly<Record<string, UiMessage>>;
}
export type UiMessage = string | { readonly plural_arg: string; readonly forms: Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> };
```

- **`owner` 是自述，不是身份。** 需求 §3.1 要语言包文件表达文案主人（导入导出要用），AGENTS 要主人取自可信目录。两边都守住：载入时 `pack.owner` 必须等于目录给的主人，不等就拒绝，它从不授予身份。
- **`revision` 随包不写。** 必填的话作者每个文件都要写一个没人读的数字；随包文件的身份由发行版本决定，缓存键用宿主算的内容摘要。
- **消息值直接写字符串。** 比实现方案 §4.1 的 `{ "text": … }` 少一层；工作台有几千条，这一层每条都占字节，也没带来别的信息。实现方案已同步改。
- **复数规则。** 必须有 `other`；其余形式按 `new Intl.PluralRules(locale).resolvedOptions().pluralCategories` 查缺。中文只有 `other`，直接写字符串。
- **文字里不许有 `<`、`>`、`&`、`"`、`'`。** 这是 `${t()}` 直接可用的前提，理由和今天的存量见第 5.3 节。

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
export type UiResourceKind = "spec" | "skin" | "font-scheme" | "locale" | "font" | "asset";   // 不叫 material：仓库里 material 是「资料」
export type UiResourceLoad =
  | "startup"        // 进程启动读一次，不下发浏览器
  | "first-screen"   // 每个页面第一屏都下发
  | "fallback"       // 缺字形才下载（带 unicode-range 的后备字体）
  | "on-open"        // 打开某个界面时才下发（插件的词）
  | "on-select"      // 选用这个方案才下发（Folio 圆润字体）
  | "tool";          // 只有开发工具页用
export interface UiResourceRow {
  readonly id: string;                    // font.inter-latin-variable；字体方案、预算都引用它
  readonly kind: UiResourceKind;
  readonly owner: string;                 // 主人：design-system、workbench、…
  readonly package: string;               // 所在包名
  readonly path: string;                  // 包内相对路径；kind 为 locale 时是语言目录
  readonly load: UiResourceLoad;
  readonly route?: string;                // 直接下发的文件的路径；fontFaceRules 的 src: url(…) 从这里读
  readonly sha256?: string;               // 只有 font、asset 必填：第三方二进制，换了要看得出
  readonly license?: { readonly spdx: string; readonly source: string; readonly notice_path?: string };  // 只有 font、asset 必填
}
export interface UiResourceRegistry {
  readonly format_version: /* @version format.ui.registry */ 1;
  readonly resources: readonly UiResourceRow[];
}
```

- **不存 `bytes`，JSON 不存 `sha256`。** 这些是文件事实的第二份：第 16 批工作台词典进语言文件后，每个改字的 PR 都要改登记表同一行，并行 PR 必然冲突；数字又是从文件算出来的，证明不了什么。预算要字节，报告现算。
- **`license` 只对 `font`、`asset` 必填。** 自家 JSON 写 spdx 和来源纯属样板。
- **`route` 有两个读者。** `fontFaceRules` 从它写 `src: url(…)`；宿主的路由仍写在 `apps/local-host/src/web-assets.ts` 的字符串字面量里，因为 `scripts/gates/page-assets-measure.mjs` 读的就是这些字面量，改成查表它会拒绝。测试核对两边一致。
- **`kind` 不为门禁变多。** 这张表只收有包内路径、随产品发行的文件（第 1.3 节）。第一屏的样式、脚本、内联块、启动 JSON 没有包内路径，也按页面才有意义，记在门禁自己的文件里（第 9 节）。这张表不进 Home。

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
    readonly tag: string; readonly direction: "ltr" | "rtl";
    readonly source: "explicit" | "system" | "default";
    readonly formatting: string;          // 给 Intl 用的完整标记，en-US、zh-CN
  };
  readonly device: UiDevicePreferences | null;   // 服务端读不到，是 null；浏览器合并后才有
  readonly problems: readonly { readonly code: string; readonly subject: string; readonly detail?: string }[];
}
```

快照只有身份和问题，**不带令牌值和译文**。理由：它要进首屏 HTML 和 iframe 配置，带字节就把 CSS 和词典搬到量不到的地方（第 9 节）。令牌在样式表里，译文走语言资源。预计 300～600 字节。

### 4.2 优先级链

固定四层，和实现方案 §5.1 相同：共同规格（`locked` 与 `follows`）→ 所选皮肤 → 所选或推荐字体 → 入口的明暗、密度、语言与硬性可访问性规则。皮肤的完整值由 `resolveSkin(spec, baseline, skin?)` 算出：**皮肤自己的值 → `follows` 指向的角色已解析的值 → 基线皮肤的值**；皮肤写了 `locked` 角色就拒绝（FSS-57）。语言只影响文字和字形后备，不改皮肤或字体的选择。

### 4.3 服务端和浏览器同一份

`resolveUiEnvironment(input)` 在 SDK `/ui`，无 I/O，宿主和页面都用它。输入是已解析好的规格、皮肤、字体方案、语言选择，以及可选的设备偏好。浏览器不读文件，所以不重新解析皮肤，只调 `withDevicePreferences(snapshot, device)` 把设备偏好合进去。FSS-48 让同一输入在 Node 和浏览器打包后各跑一遍，比 JSON 相等。

### 4.4 首屏（第 16 批，先把路定下）

A 段什么都不改：令牌仍在基础 CSS 里，没有选择，快照由基线算出，只给样例和组件板用。第 16 批按下面做，不留死路：

| 东西 | 怎样到页面 | 为什么 |
| --- | --- | --- |
| 快照 | HTML 里一段 `<script type="application/json" id="ui-environment">`，不执行 | 小（几百字节），要同步可得；CSP 已允许内联 |
| Soft Workbench | 不多发请求，令牌就在基础 CSS | 默认路径零成本 |
| 其他皮肤 | `<head>` 里一个 `<link rel="stylesheet" href="/assets/ui-skin/<id>-<revision>.css">`，排在基础 CSS 之后；只在选用时下发的 `@font-face` 也写在这张表里，不进基础样式表 | 阻塞首绘，不闪默认皮肤；不内联。路由不是字面量，第 16 批前的门禁 PR 一起教给门禁 |
| 明暗 | 一份 CSS 里两个分支，选择器仍是 `html[data-resolved-theme]`；现有 `THEME_BOOTSTRAP_SCRIPT` 选分支 | 比实现方案 §5.1「启动投影携带浅深色、引导脚本选中」简单：CSS 自己就能选，引导脚本不用改 |
| 语言（用户 2026-11-07 定：工作台一份，插件按需） | C 段把 `clientI18nScript`（`apps/workbench/src/i18n.ts:154` 起，把整本词典内联进 HTML）换成：工作台的词一个阻塞 `<script src="/assets/locale/workbench.<语言>.<摘要>.js">`；插件的词在**挂载它之前**取，同一屏的多个插件合成一次批量请求（N52），不按主人逐个发。**第一屏就要同步读的主人**（隐藏的问题收集文档要 `issues.*`，主文档 `LFor("io.molis.work.goals")` 同步读 Goals 的词）不能等请求，由页面模板写明，随工作台脚本同一批阻塞取；具体几个等 `resource-budget.md` 实测（#1922）。路由不是字面量，门禁 PR 要教给 `page-assets`，和皮肤那行一样 | 字节搬到量得到、可缓存的地方；`t` 要同步可用，所以工作台那份阻塞。实测（`resource-budget.md` 第 4.2 节）：再次打开英文工作台从 2,573,362 B 降到 666,388 B |

### 4.5 iframe（第 16 批）

已核实：插件 frame 是不透明来源，CSP 写死 `connect-src 'none'`（`apps/workbench/src/browser/plugin-frame/document.ts:9`），只有 `/assets/` 下的样式和字体能加载；词今天经 `molis:plugin-connect` 消息一次性传入（`parent.ts:269`），传的是本插件的词加**整本页面词典**；`host.translate` 是 `(key, values) => string`（`child.ts:47-49`，`ui.ts:604`）；明暗密度由 `state` 消息同步（`parent.ts:148`）。

| 问题 | 答案 |
| --- | --- |
| 拉不了网，语言包怎么来 | `FrameConfig.messages` 换成 `environment: UiEnvironmentSnapshot` 和 `text: { owner; pack; shared }`，只带本插件的语言包和 `common.*`，不再带整本词典。子页面不发请求 |
| 切语言、切皮肤 | 父页面经已绑定的 `MessagePort` 发 `{ type: "environment", snapshot, text?, documents?, skin_href? }`，`documents` 是第 5.4 节的新旧两份文档。子页面换上下文并跑同一段合并代码，换皮肤换一个 `<link>`（`style-src` 已允许 `/assets/`）。来源校验就是这条端口本身，陌生窗口拿不到（FSS-08） |
| 插件代码怎样拿到文字 | `startChild` 在加载插件脚本之前装上下文（第 5.2 节），插件脚本 `import { t }`，用自己打进去的那份 SDK |
| `host.translate` | A 段不动。C 段删 `translate`、`globalThis.L`、`molisFrameFillMessage`，所有调用改完，不留两条路（决定 20） |
| 设备偏好 | 只在浏览器。服务端快照 `device: null`；父页面已有的 `state` 消息继续送明暗密度，子页面调 `withDevicePreferences`。不新增第二条通道 |
| 字体 | `font-src` 已允许 `/assets/`，字体路径都在那下面。文件来自 `/assets/` 的字面路由，门禁量得到 |

**`molis-work:ui-environment-changed` A 段不登记。** A 段没有真实发送者和监听者：组件板的语言切换直接调函数，不走事件。`scripts/gates/dom-events.mjs` 会拦没人用的条目。第 16 批接文档控制器（发送）和终端重新测量（监听）的那一片，才在 `dom-events.ts` 登记并跑 `pnpm api:update`。

## 5. SDK `/ui` 工具清单

都加在 `packages/plugin-sdk/src/ui/` 下，`packages/plugin-sdk/src/ui.ts` 多几行 `export *`，不开新入口。不引 Node 内建模块，只用 `Intl`。`sideEffects: false` 加上不在模块顶层跑东西，现有插件包只引 `renderButton` 时不会变大，由 `page-assets` 门禁证明。

| 导出 | 文件 | A 段谁在用 |
| --- | --- | --- |
| `t`、`say`、`format` | `ui/text.ts` | 样例、组件板。业务代码只用 `t`、`format`；`say` 给拿到 `OwnedTextRef` 的地方 |
| `installUiText`、`installTextForTest` | `ui/text.ts` | 宿主、组件板浏览器脚本（第 5.2 节）；测试和两包样例 |
| `dateArg`、`numberArg` | `ui/text-ref.ts` | 样例、组件板。字符串和普通数字不用它们，`t(key, { title: "x", count: 3 })` 直接写 |
| `textRefProblems(value, { literal?, key?, owned? })` | `ui/text-ref.ts` | `ownedTextRef`；`say`；CLI；之后的 05② `validatePresentationDeclaration`、`assertSurfaceDescription`，20 `validateSettingsDeclaration`、`inspectBlueprint` |
| `ownedTextRef(ref, owner)` | `ui/text-ref.ts` | 宿主；之后的 15 组合服务 |
| `formatMessage`、`formatNumber`、`formatDate` | `ui/message-format.ts` | `t`、`format`；组件板 |
| `parseLocalePack` | `ui/locale-pack.ts` | `pluginLocaleReader`（plugin-runtime）；工作台语言文件；CLI |
| `inspectLocaleSet(packs, { default })` | `ui/locale-pack.ts` | CLI `validate`；安装与打包；组件板标本的问题列表 |
| `matchLocale(requested, available, fallback)` | `ui/locale-pack.ts` | 查词；组件板 |
| `createTextReader({ packs, locale })` | `ui/text-reader.ts` | 纯函数，给定语言包查词。还没装的包的预览、测试、`installTextForTest` |
| `parseStrictJson` | `ui/strict-json.ts` | 下面三个 `parse*`；`parseLocalePack`；CLI |
| `parseUiSpecFile`、`parseSkinFile`、`parseFontScheme` | `ui/appearance-files.ts` | `packages/design-system` 基线加载；组件板 |
| `resolveSkin`、`skinTokenDeclarations` | `ui/appearance-resolve.ts` | `palette.ts` 等 |
| `resolveFontScheme`、`fontTokenDeclarations`、`fontFaceRules` | `ui/appearance-resolve.ts` | `typeface.ts` |
| `resolveUiEnvironment`、`withDevicePreferences` | `ui/environment.ts` | 组件板；第 16 批的首屏 |

**不在 A 段导出的**（没有消费者）：`formatList`（`listJoin` 到 C 段才换）、按声明查引用的 `inspectTextRefs`（15、20 的第一片带上）、动作文字键的拼法（FSS-40 暂不实现，只定写法）。

**作者工具与平台共用：** `inspectLocaleSet` 查缺键、多余键、参数不一致、缺复数形式、`hidden_number`、标记字符（第 5.3 节），返回 `{ file, code, locale, key, reason, fix, blocking }[]`。默认语言缺键、参数不一致、标记字符算 `blocking`，平台拒绝；别的语言缺键不阻断，算覆盖率（FSS-34 可观察，FSS-37）。CLI 的 `validate` 调同一个函数，作者和平台看到一样的结果。

### 5.1 工具的形状

类型在 `platform/ui-text.ts`（T2 加，T1 不用等它）：

```ts
/** 业务写的参数值。按分支展开写，不用 Omit<TextArg, "name">：那样会压扁联合（tsc --strict 实测，{ kind: "number" } 缺值也能过）。 */
export type TextArgValue =
  | string | number
  | { readonly kind: "number"; readonly number: number; readonly style?: "decimal" | "percent" | "compact" }
  | { readonly kind: "date"; readonly at: string; readonly style: "date" | "time" | "datetime" | "relative" };
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
  date(at: string, style: "date" | "time" | "datetime" | "relative"): string;
  number(value: number, style?: "decimal" | "percent" | "compact"): string;
}

/** 平台装进来的上下文。SDK 不存语言和译文。 */
export interface UiTextProvider {
  /** 当前的语言；没有页面、轮次或记下的语言时是 null。 */
  locale(): string | null;
  /** 这个主人在这种语言下的这个键。 */
  message(owner: string, key: string, locale: string): UiMessage | null;
  /** 主人的默认语言，给 locale: null 用。 */
  defaultLocale(owner: string): string | null;
  /** 查不到词时记一条问题。 */
  problem?(problem: { readonly owner: string; readonly key: string; readonly locale: string }): void;
  /** 只有浏览器给：记下这个结果是哪句话，切语言时用（第 5.4 节）。 */
  produced?(output: string, ref: OwnedTextRef): void;
}
```

`environment` 不进工具（上一版 `UiRenderTools.environment` 在 T4 还拿不到）：业务代码本来就不该读它。组件板直接调 `resolveUiEnvironment`。

**`format` 也返回普通字符串，**切语言时和 `t` 一样由第 5.4 节处理。

### 5.2 主人和语言从哪来

**主人从键来。** 键的第一段就是主人名（`messageOwnerOf`，第 2.3 节），`common.*` 归平台。所以 `t` 不需要知道「现在是谁在画」，服务端异步和浏览器事件里也不会丢。

**同一进程里只有内置插件和开发路径的插件，**两边最后一段相同时 `registerPluginText` 抛 `ui.text_owner_conflict`，开发路径启动时就报（今天 `createPluginMessageStore` 有同样的冲突检查）。外部插件的词只在它自己的沙箱进程和 iframe 里，不和别人同表，所以第三方不会因为同名装不上。

**语言从平台装的上下文来。** 上下文放在 `globalThis[Symbol.for("molis.work.ui-text")]`，SDK 每次调用时读。为什么不用 SDK 里的模块变量：内置插件的发行物是单模块，`packages: "bundle"` 把 SDK 打进去（`native-plugin-release-artifact.ts:34-38`），恢复时 `import("data:…")`（`:56`），一份插件就有一份 SDK，模块变量各是各的。`Symbol.for` 在同一个 realm 里是同一个，也不要 Node 内建。

**门禁：** 「模块级可变状态」和「`globalThis`」的计数只管合同包（`scripts/gates/contracts-purity.mjs`），合同里只放类型。SDK 不存模块状态，`installUiText` 只写这一个全局位，第二次装抛错（只有拿着上一次返回的撤回函数才能换）。我没有在别的门禁里找到对这个写法的限制，但**没有跑过**，T4 的 `pnpm health:check` 为准；红了就停下问，不改门禁。

| 路径 | 代码跑在哪 | 语言 | 词 |
| --- | --- | --- | --- |
| 内置插件、开发路径插件的服务端（A 段开发路径） | 宿主进程，同一 realm | 新文件 `apps/local-host/src/ui-text-provider.ts` 启动时装，`locale()` 读现有的 `pageLocale()`（`web-locale.ts` 的 `AsyncLocalStorage`，只在 local-host，不进 SDK） | `apps/workbench/src/plugin-text.ts`（第 8.3 节） |
| 动作处理器 | 同上 | 页面发起的本来就在 `runWithLocale` 里。**第 16 批：** 动作网关按 `ActionCallContext.locale` 包一层，模型工具调用也就有了（轮次冻结的语言，第 15.2 节） | 同上 |
| Module、`horizontal/` | 宿主进程 | `say(ref, { locale: context.locale })`。可以用 SDK（`PACKAGE-BOUNDARIES.md` 第 36 行），不 import 工作台 | 同上，经全局上下文 |
| 沙箱插件（第 16 批） | 另一个进程，界面由平台按 `interface.json` 画（`installed-plugin-definition.ts:58`） | 今天沙箱调用没有 `locale`（核过 `packages/plugin-sandbox/src`）。第 16 批由调用消息带上，沙箱启动脚本装上下文，用它自己的 `AsyncLocalStorage` | 启动时给它自己的语言包和 `common.*` |
| 主文档的浏览器代码 | 页面 | `clientI18nScript` 的位置（`apps/workbench/src/i18n.ts:154`）装上下文，语言取自 `<html lang>` | 工作台一份；插件的词在挂载之前到（第 4.4 节） |
| 内联脚本（`L(` 写在模板字符串里，发到浏览器才跑） | 页面 | 同上 | 同上。**它们 import 不了**：107 个文件、约 2,271 处。同一段脚本把 `t`、`format` 放到页面全局，和今天 `globalThis.L` 同一个位置，调用写法相同 |
| iframe（第 16 批） | 不透明来源，`connect-src 'none'` | `startChild`（`child.ts:43`）在加载插件脚本之前装，语言取自 `FrameConfig.environment` | `FrameConfig.text`，只有本插件和 `common.*`（第 4.5 节） |
| 作者的测试、两包样例（A 段） | Node 或浏览器 | `installTextForTest({ packs, locale })`，返回撤回函数 | 自带 |
| 后台工作 | 任何 | 没有上下文，`t` 抛 `ui.text_no_context` | 存 `TextRef`；显示时才查 |
| 模块顶层（`const X = t("a")`） | 导入时 | 同上，抛错。今天 AST 只数到 1 处顶层 `L(` | 改到函数里 |

**没有上下文时为什么不只在测试里抛：** 生产和测试行为不同，就证明不了什么。代价是漏掉的后台路径会在线上报错，而不是显示错语言；第 14 节把 165 处 `Error(L(` 和后台路径列为第 16 批开工前的盘点。

**服务端读字的路（代审挡 3）只有这一条：** `say(ref, { locale })`，经全局上下文找词，主人卸载时走 `fallback`，都不 import 工作台。

- `characters.from_template@1` 写 `say.text(template.title, { locale: context.locale })`。没有 `locale` 就拒绝这个动作（它只给本人，一定有页面）。
- 05② 的 `presentationText(object, values, locale)`，`locale` 是必填参数，可以是 `null`（明确要主人默认语言）。MCP 这条在第 15.1 节的决定之前传 `null`，就是今天「没有页面用默认语言」的行为，写成显式的。

### 5.3 转义和不被冒充

**`${t("key", args)}` 直接可用且安全，靠两条：**

1. **语言包的文字里不许有 `<`、`>`、`&`、`"`、`'`。** `parseLocalePack` 拒绝，`fix` 给出替换（`’`、`“ ”`、`and`、`›`）。语言包不是 HTML，也不需要这些字符。
2. **字符串参数转义；数字和日期经 `Intl` 输出后同样过一遍。** `say` 的 `literal`、`fallback` 也转义。

结果：**不带字符串参数的调用，结果就是纯文字**，拼进 HTML、赋给 `textContent`、再过一次 `esc`，三种都对。这是绝大多数。

只有带字符串参数、且值里真有这些字符时，三种用法才有差别。普通字符串分不出下游是哪一种：`${obj}` 和 `el.textContent = obj` 都调 `toString()`，没有办法靠类型区分。所以默认选安全的一边：

| 位置 | 写 | 写错的后果 |
| --- | --- | --- |
| 拼进 HTML | `t(key, args)` | 没有错 |
| `textContent`、`title=`、`new Option`、`showToast`、`renderButton({ label })` 这些自己当文字用或自己转义的 | `t.text(key, args)` | 写成 `t`：`A&B` 显示成 `A&amp;B`，一眼能看见，不是安全问题 |
| 拼进 HTML 却写成 `t.text` | 不许 | 和今天的 `L` 一样不安全。可以静态查（`t.text` 出现在模板字符串的插值里），新门禁要先问用户，这里只给建议 |

**实测（我的 AST 脚本，口径：真实调用，不含内联脚本和 `-en.ts`）：** 5,557 处里 4,846 处没有参数，164 处只有数字，547 处有字符串或看不出类型的参数。这 547 处：拼进 HTML 25 处，被 `esc` 包着 46 处，赋给 DOM 属性 68 处，对象属性 42 处，传给函数 178 处，其他 188 处。内联脚本的 2,271 处没有按位置分。

**第 16 批的迁移脚本这样判断，都不比今天差：** 拼进 HTML 的写 `t`（那 25 处今天没转义，顺带修好）；被 `esc` 包着的去掉 `esc`，写 `t`；其余写 `t.text`，行为和今天的 `L` 相同。

**语言文件要动一次：** 今天 15,554 个译文里，含 `'` 682 个、`&` 18 个、`"` 13 个、`<>` 9 个。前三种脚本替换；`<>` 里 7 个是冲突标记（`<<<<<<<`），改成字符串参数；2 个是 `<li>` 整段，要拆，列进第 14 节。

**冒充（上轮挡 3、小修 8）换写法后怎样：**

- `BoundText`、`textHtml`、`data-text-*`、`refuseForgedOwner` 都不要了，上一版那条「伪造 `data-text-owner`」和代审指出的「`say` 共有词被拒」一起消失。
- **`t` 用别人的前缀不拒绝。** 在同一进程里 `t("todo.x")` 能查到 Todo 的词，但这不是权限：插件本来就能在自己页面上写任何字。iframe 和沙箱里只有自己和 `common.*`，查不到，走 `common.text.unavailable`。
- **防冒充要成立的地方是显示在平台位置上的字**，比如插件的 `summary` 显示在别人的卡片上。那里只认 `OwnedTextRef`，由 `ownedTextRef` 按前缀绑主人，这一条不变（第 2.3 节，FSS-42、43）。

**存字符串的例外**只有 20 的 `RoleTemplate` 的 `title`、`materials`、`outputs`：采用时写进用户自己的草稿，归用户所有，之后不随语言变（场景设计稿已定 `title`，后两个同样处理）。

### 5.4 切语言时的原地更新（FSS-35）

`t` 返回普通字符串，就没有绑定标记。逐个比较：

| 方案 | 怎样做 | 保得住吗 | 结论 |
| --- | --- | --- | --- |
| 甲 重取再整块合并（morph） | 重取新语言的 HTML，把差异合并进现有 DOM | 服务端没画的节点（客户端加的行、抽屉、对话框）会被当成多余删掉，选区和状态跟着丢 | 否 |
| 乙 标记放在结果里 | `t` 在字符串里夹不可见字符，平台在结果上找 | 字符串比较、长度、截断、`.includes` 都受影响；还会漏进 `textContent` 和存下的数据 | 否 |
| 丙 只靠「产出记录」反查 | 记下 `t` 产出过的字符串，走一遍 DOM 按字面替换 | 用户的待办恰好叫 Save 会被译掉（违反「用户内容不翻译」）；服务端的字浏览器没有记录 | 只作补充 |
| 丁 整页刷新加恢复状态 | 今天的 `/locale` 跳转 | **违反 FSS-35「无需刷新整页」** | 否，也不向用户提议，除非放宽 |
| 戊 业务写回调 | 每个插件写 `onLocaleChange` | 能保住，但这是业务侵入 | 否 |
| **己 三方文字合并**（推荐） | 见下 | 都保得住，残余见下 | **推荐** |

**己的做法。** 服务端把同一页按旧、新两种语言各画一遍。两份的差异就是这一页要改的字，用户内容两边相同，天然不在差异里。把差异应用到现有 DOM：

1. **写偏好、换词。** 请求写 Cookie；取工作台和本页插件的新语言；换上下文。之后客户端新画的字已经是新语言。
2. **取两份 HTML。** `fetch(location)` 两次，用请求头指定语言（语言不是权限，这个头不授予任何东西）。主文档里每个 iframe 的文档就在 `script[data-plugin-document]` 里（`plugin-frame/view.ts`），不再多发请求。同源的分屏窗格由 `workbench-view-invalidate` 同类消息各做各的。
3. **算差异。** 两棵树同步走，记下不同的文字节点和属性（`value`、`checked`、`selected`、`open`、`style`、`class` 除外）。按最近的带 `id` 或 `data-plugin-contribution` 的祖先做锚，按「同样文字里的第几个」定位。
4. **写回。** 只改 `Text.data` 和 `setAttribute`，而且**只在现值还等于旧语言那份时才改**。没有删除节点、没有 `innerHTML`，所以节点、事件监听、焦点、输入框内容和选区、滚动、`details` 和 `dialog` 的开合都不动。客户端加的节点不在差异里，不受影响。结构不同（今天还有按语言写的分支）的子树：里面没有表单控件和客户端节点就整块换，否则留着并记一条问题，实走能看到。
5. **客户端画的字。** 第 4 步之后，服务端差异之外的节点，整个节点的文字（或上述属性）等于产出记录里的一条，就按记录的键和参数重算。记录有上限（2,000 条，先进先出）。跳过 `input`、`textarea`、`contenteditable` 和 `translate="no"`。
6. **发一次现有的失效。** `molis-work:select-item { invalidate: true }`（`tab-workspace-plugins.ts:212`）。这条路今天给 1.5 秒轮询用，客户端已经要保住草稿；有自己重取路径的列表由此重画，第 5 步的误译（见下）也被纠正。

iframe 由父页面经端口把新语言包和两份文档发给子页面，子页面跑同一段代码（`connect-src 'none'` 不用改）。

**代价：**

- 一段平台代码，估计 150 行上下，放 `apps/workbench/src/browser/locale-switch.ts`。第 16 批进工作台脚本和 iframe，**没有量过**；超过 10 KB 按规矩问用户。
- 切一次语言多画两遍页面（第 11 节）。切语言很少。
- 产出记录：每次 `t` 多一次 `Map.set`，只在浏览器。

**残余，都不放宽 FSS-35，但要让用户知道：**

- **客户端画的、恰好等于一句界面文字的用户内容，可能被译掉。** 比如客户端画的列表里一条待办就叫 Save。只影响显示、不写数据，第 6 步有重取路径的列表随即纠正；既没有重取路径、文字又完全相同时，留到下次打开。
- **客户端拼的半句**（`${t("a")}：${title}`）第 5 步认不出，留到下次重画。这是 FSS-39 本来就不许的写法（约 70 处，第 14 节），改完就没有了。
- **在途的旧响应：** 切换时正在路上的片段是旧语言，下一次重取才变。

**还没有证明的：** 这是设计，我没有写原型。T8 的组件板标本先证明它（FSS-61）；第 16 批实走如果发现哪类页面保不住，**停下交回，不放宽**。今天的 `L` 走同样的路（第 2、3 步不分新旧写法），所以它不依赖第 16 批的迁移顺序。

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

`parsePluginManifest` 检查：语言标记形状；`default` 在 `available` 里；语言不重复。

**同一个 Manifest 不能既写 `ui.locales` 又写 `ui.messages` 或 `ui.translations`，写了就拒绝。** 这是 A 段「不双认」的落法：没有一个翻译器同时读两种格式，也没有一个插件走两条路。A 段里只有样例写 `ui.locales`；第 16 批 C 段一次改完并删掉旧字段。**测试断言 C 段之前没有内置 Manifest 写 `ui.locales`**（FSS-53）：新内置插件一写，就成了决定 20 不许的逐插件切换。用户 2026-11-07 同意这样并存到第 16 批（第 12 节第 4 条）。

### 6.2 内容怎样走

已核实：内置的 `nativePluginReleaseArtifact` 打成单模块（`apps/local-host/src/native-plugin-release-artifact.ts`），恢复时是 `data:` URL，**模块里读不到包内文件**；外部安装走沙箱包，`readSandboxPackage` 只收格式内的文件（`apps/local-host/src/sandbox-package.ts:79-82`）。所以语言文件不能由插件代码自己读，要由平台读。

平台只有一个读取函数，新文件 `packages/plugin-runtime/src/locale-packs.ts`：

```ts
export function inspectPluginLocales(manifest: PluginManifest, read: (path: string) => string | null): readonly LocaleSetProblem[];
export function pluginLocaleReader(manifest: PluginManifest, read: (path: string) => string | null): PluginLocaleReader;
```

**一份规则，两个时机：**

- **`inspectPluginLocales(manifest, read)`：安装、`validate`、`pack` 时读全部语言一次。** 逐个 `parseLocalePack`；`pack.locale` 不等于文件名、`pack.owner` 不等于 `manifest.plugin_id` 就拒绝；`inspectLocaleSet` 有 `blocking` 就拒绝。
- **`pluginLocaleReader(manifest, read)`：运行时。** 每种语言第一次用到才读和解析，之后走内存，没用到的语言不读（第 11 节）。沙箱包 `load` 时虽然验签要读整个包，语言文件也只在第一次用到时才解析。

`read` 由来源给，这样只有一套规则：

| 来源 | `read` 从哪来 | 哪一片 |
| --- | --- | --- |
| 本地开发（`molis-work plugin dev`，样例走这条） | 新函数 `loadDevelopmentLocalePacks(directory, manifest)`，放在 `development-loader.ts`，读项目目录，沿用那里现有的 `realpath` 加根目录核对，防符号链接跑出去 | A。**这是 A 段唯一真实可走的路** |
| 打包（`molis-work-plugin pack`、`validate`） | `packPluginProject` 按 Manifest 自动把声明的文件加进 `files`（`packageFileReader` 只收逐个写明的普通文件，这里正好逐个写）；`parsePluginPackage` 核对声明的文件都在，和入口文件同样处理（`package-verification.ts:50-54`） | A。带 `ui.locales` 的包能打、能校验，装不上（见下） |
| 外部安装（沙箱包） | 见 6.3 | 第 16 批 |
| 内置插件 | 登记上的 `package_name` 解析到包目录，包的 `files` 加 `locales` | 第 16 批。A 段没有内置插件声明，写了就是死代码。23 个登记里 `alchemist`、`plugin-builder` 没有 `package_name`（两个批过的构建期例外），它们另给包目录（第 14 节） |
| 内容包（08） | 保存的已验证包，和 08 的方法正文同一条路 | 08 C-1、C-2。词在安装记录启用时登记，停用时撤回（第 8.3 节）；随包带上、还没装的，预览和 `plugins.bundled.list@1` 按包读，用 `createTextReader` |

**08 要改（归第 08 批）：** `inspectContentPlugin` 的白名单收 `ui.locales`，去掉 `ui.messages`、`ui.translations`；`payload.files`「不多不少」的清单带上声明的语言文件。

**20 要改（归第 20 批）：** `blueprints.packs.save@1` 把草稿组成包时，`literal` 转成键，加单语言 `locales/<语言>.json`；草稿记 `locale`（第 15.4 节）。

A 段写了 `ui.locales` 的沙箱包被拒绝，这是现成的明确错误，不用加代码：不带语言文件时，`readSandboxPackage` 的形状比较报「清单不是沙箱插件的形状」；带了语言文件时报「包里有格式之外的文件」。

**A 段不加 `locale_packs`，也不碰发行物。** `createPluginRuntimeReleaseArtifact` 只有内置插件在用，内置插件 `directlyUsable` 恒真，走当前构建，从不恢复存档；已有行还 `ON CONFLICT DO NOTHING`。外部包不进这张表。所以这个字段没有写入者也没有读取者。

**不把译文内联进 Manifest。** 看起来最省事（`ui.messages` 就是这样），但 N50 已测出冷启动 Manifest 摘要算三遍、`canonicalJson` 递归 31 万次，内联词典会把它放大；Manifest 还到处被复制。

### 6.3 第 16 批外部包走哪条路

不留死路，也不需要新表、新列或发行物字段：

1. **声明的来源。** 今天缺这一步：`sandboxPluginManifest` 没有语言声明的输入（`textDeclarations` 只取 agent 声明），`pack-sandbox` 也不收作者的 Manifest。**推荐放进沙箱合同（`contract.json`）**，它已经是 `sandboxPluginManifest` 的输入（`packages/plugin-sdk/src/sandbox-manifest.ts:126`），生成插件和手写的都有。第 16 批定，同时让 `readSandboxPackage` 的 `expected` 带上它。
2. **打包。** `pack-sandbox` 按上一步的声明逐个读 `locales/<语言>.json`，放进 `payload.files`，在签名范围内。
3. **读包。** `readSandboxPackage` 的 `wanted` 名单加上这些路径；调 `inspectPluginLocales(manifest, path => files.get(path))`（只在安装时），结果里放 `pluginLocaleReader`。
4. **存包。** `SandboxPackageStore.save` 不用改：它把整份已签名的包存进 `BUNDLE_FILE`，`load` 时重新验签再 `readSandboxPackage`，语言文件跟着回来。
5. **上线。** `packagedRelease` 把结果交给 `PluginHostExecutorOptions.localePacks`，后面和 A 段开发路径同一条（第 8.3 节）。
6. **创作台。** `studio-release.ts` 的 `RELEASE_FILES` 加上这些路径。
7. **iframe 和沙箱进程。** `FrameConfig.text` 和沙箱启动各只带本插件的那份和 `common.*`（第 4.5、5.2 节）。

### 6.4 现有字段与生成插件

- `ui.messages`、`ui.translations`（`plugin-manifest.ts:187,195`）A 段不动，第 16 批 C 段删。`PluginRegistration.messages` 早已删除（`plugin-registration.ts:109` 的接口里没有这个字段），实现方案 §7.4 还当它现行，已改。
- **生成插件现在没有词条声明。** 标题、提交名、列名是 `interface.json` 里的字符串，渲染器 `packages/design-system/src/plugin-component-client.ts` 还有固定中文。以后这样走：
  - 渲染器把这些字符串当 `literal`（作者写的内容，原样显示）。这不是读取兼容，是它们本来的语义，所以未转换的已安装插件照常显示，只是不翻译。
  - 渲染器自己的固定按钮、错误、日期改用平台 `common.*` 和 `format`（C 段）。
  - 创作台新生成的插件由代码阶段写稳定键和 `locales/*.json`，走 6.3 的路。
  - 已安装的走实现方案 §7.3 的显式离线转换，走原发布主人的升级路径；转不了的明确列为阻塞，不算覆盖完成。
  - 组件目录的名称、说明迁到共同规格（B 段）。

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

新文件 `packages/design-system/src/baseline.ts`：模块初始化读 4 个 JSON，走 SDK 解析，得到解析好的基线，错了抛 `ui.baseline_invalid`，带文件和字段。

## 8. 真实消费者

### 8.1 皮肤和字体：同意主会话的方向，范围要大一点

主会话推荐 `palette.ts:157,175,241` 读基线文件、走 SDK 解析器，字节不变，删第二份常量表。方向对，**但只改这三处，还剩 34 个令牌的值写死在别处，等于留了第二份常量表。** 那 34 个是 terminal、danger、`--font` 10 个（`foundation.ts`）、字重字距 7 个（`typeface.ts`）、收尾 17 个（`craft-finish-bar.ts`）。所以范围是全部 194 个：

- `palette.ts`：`renderShellTokens`、`renderPaletteTokens`、`renderShapeTokens`、`renderControlMetrics` 签名不变，改成调 `skinTokenDeclarations`。`MW_HUES`、`MW_CONTENT_MARKS` 留 `id`、`label`、`role`（组件板要），删 `light`、`dark`；`MW_CONTENT_THEME` 删（核过只有 `palette.ts` 和 `index.ts` 在用）。调用方不动（`coss-controls`、`foundation`、`interaction-texture`、`apps/workbench/src/styles/base.ts`、`apps/desktop/src/capsule-shell.ts`、`packages/im-ui/src/styles.ts`、测试）。
- `foundation.ts`、`craft-finish-bar.ts`：模板不动，把写死的值换成 `${baselineToken("danger")}`，终端三份写 `${baselineTerminal("unset" | "light" | "dark")}`，后层重复声明的数值（`--ease-quint`、`--dur-*`）也换，不留第二份数字。别名不动。
- `typeface.ts`：`FONT_STACK`、`MONO_FONT_STACK` 和 `@font-face` 从 `system-sans.json` 算出来，导出名不变。

**证据是内容比对，不是字节数。** `page-assets` 只比长度（`scripts/gates/page-assets-measure.mjs` 的 `measured[asset] = bytes.length`），色值都是等长的 `#rrggbb`：错一位、明暗写反、两个令牌互换，差都是 0。所以它只留作门禁。T6 这样证明：

1. **先冻结名字。** 开工第一步，改代码之前，从现有输出把 194 个令牌名写成测试夹具 `tests/fixtures/baseline-token-names.json`。之后不从渲染结果取，否则就是拿自己证明自己。
2. **比内容。** 在 merge-base 工作树和头上分别渲染下面这些，比 sha256，全表贴进 PR：`renderShellTokens` 两种主题、`renderPaletteTokens` 两种主题、`renderShapeTokens`、`renderControlMetrics`、`TYPEFACE_STYLES`、`FONT_STACK`、`MONO_FONT_STACK`、三份下发 CSS（工作台、设置、到达）、`IM_STYLES`。
3. **门禁照跑。** `node scripts/gates/page-assets.mjs --base origin/main` 通过。

**代价已核：** 模块初始化同步读文件，先例就在同一个包，`page-clients.ts` 头部「stylesheets stay free of file reads」要跟着改。评审从 54 个 esbuild 入口走过 import，没有一个走到 `design-system/src/index.ts`、`palette.ts`，所以不进浏览器打包。原生插件里只有 `plugin-builder` 依赖 design-system，它不走单模块发行物。它确实是全站单点：基线坏了宿主起不来。这是构建缺陷，不是用户数据问题，按构建缺陷拦在发行前：`tests/ui-baseline.test.ts` 进 `tests/ci-product-subset.txt`，解析全部内置文件、核冻结的名字；干净安装测试核发行物里文件可读。

### 8.2 文字：同意，放在组件板

不切现有词典（决定 20）。`/__ui/catalog` 加一节 `renderEnvironmentSection`，做法照 `collab-specimens.ts`：`apps/workbench/src/browser/board/environment-section.ts`，esbuild 打成 `dist/board-environment-section.js`，`readFileSync` 内联进组件板 HTML。不新增 `/assets/` 路由，不触发页面资源审批；这是新增的开发页字节，不是从量得到的地方搬走。

标本真跑：

1. 服务端照抄第 1.1 节的写法，用 `t`、`format` 和 `apps/workbench/resources/locales/` 的词画出来（宿主消费者）。两种语言的结果都放进页面的 `<template>`，开发页不多一个路由。
2. 浏览器里一个语言切换，调 `apps/workbench/src/browser/locale-switch.ts`（第 5.4 节）：不整页刷新，文字、日期、数字和属性都变；旁边的输入框内容和选区、`details` 开合、滚动不动；一行客户端加的字也跟着变；一条和界面词相同的用户文字（服务端画的）不变（浏览器消费者）。
3. 同屏放两个主人，切换时各查各的词；显示 `resolveUiEnvironment` 的结果，服务端和浏览器各算一份并比较。
4. 列出 `parseSkinFile` 对几份坏文件的问题（重复键、CSS 文本、外部 URL、写了 `locked` 角色），这是组件板看得见的校验。

组件板没有开关，路由在发行物里也有（`apps/local-host/src/web-catalog-board.ts`、`web-routing.ts:42`），所以 `resources/` 要随包。它是开发工具，单独不算真实入口，所以和基线、两包样例一起算。

### 8.3 宿主给插件的上下文

组件板只证明平台自己能用，插件要读到自己的词，还需要平台装好上下文、灌好词。

**合同不变。** `UiContribution.render(request)` 不加参数，`bindUiContribution`、`PluginUiViews.bind`、`plugin-executor.ts:157` 的包一层都不要了。上一版为传工具才动这些地方；`supervisor.contribution().views` 的六个直接调用点（`home-plugin-http.ts:121,305`、`project-plugin-stages.ts:138,188,286`、`plugin-stage-fragment-http.ts:63`、`declared-stages.ts:101`）本来就在页面请求的 `runWithLocale` 里，`t` 从上下文就能取到语言。

**上下文装一次。** 新文件 `apps/local-host/src/ui-text-provider.ts`，宿主启动时 `installUiText({ locale: pageLocale, message, defaultLocale, problem })`。

**语言包谁灌、谁删。** 新文件 `apps/workbench/src/plugin-text.ts`，存各主人的语言读取器，`local-host` 从 `@molis-ai/molis-work-app-workbench` 引用（`home-plugin-executor.ts:43` 已这样引 `withPluginWords`）：

| 时机 | 谁 | 做什么 |
| --- | --- | --- |
| 会话打开 | `openHostSession`、Home 执行器 | `options.localePacks?.(definition)` 有内容就 `registerPluginText(plugin_id, reader)`，拿到一个撤回函数 |
| 会话释放（停用、撤权、升级前的旧会话） | 同一处的 `dispose` | 调撤回函数。按计数：同一插件在几个项目里各有一次会话，都释放才删 |
| 卸载 | 卸载先停，走上一行 | 不另写 |
| 升级 | 新会话登记新的读取器，旧的随旧会话撤回 | 所以插件升级后不重启进程也不会留旧词 |
| 内容包（08，第 6.2 节） | 没有会话：安装记录启用时登记，停用时撤回 | 和 08 第 3 节「启用时登记方法」同一个时机 |

`PluginHostExecutorOptions.localePacks` 是可选的。A 段只有 `runPluginDevelopment` 传（`plugin-development.ts:14`，用 `loadDevelopmentLocalePacks`）；第 16 批沙箱包和内置插件各传各的。今天的 `registerPluginMessages` 不一样：它在 `plugin-platform.ts:249` 只登记，生产代码里没人删（`unregisterPluginMessages` 只有测试调）。新路径不沿用。

现有插件 `options.localePacks` 不给，不调 `t`，所以行为不变，一个请求也不多。

**插件页面画别人的对象（代审挡 4）。** 05② §7 写了 `renderPresentationForm` 给「插件在自己页面上画别人交来的对象」；可是 iframe 只带自己和 `common.*` 的词，读不出别人的 `label`。两条路：

| 路 | 怎样做 | 代价 |
| --- | --- | --- |
| **(a) 平台画，经 `model.nested` 拼进来（推荐）** | 挂载位的内容由平台在服务端画好，走现有 `nested`（`ui.ts:538`）。iframe 插件的文档也是服务端画的（`script[data-plugin-document]`），所以同样拿得到。切语言走第 5.4 节 | 插件不能按自己的布局重画别人的对象，只能占一个位置。这符合「外观用组件板已有的控件」（05② §7） |
| (b) 放开读取，把别人的词带进 frame | `FrameConfig.text` 带上别人的语言包，或按引用预先解析 | frame 的配置要按「这一屏可能出现谁的对象」算词；多字节；隔离的 frame 拿到别人的文字 |

推荐 (a)，理由：frame 只带自己的词这条规则不破例，`nested` 是现成合同，不多字节。要 05② 改两处（第 2.4 节列了）：§7 作者用法那一格改成「插件预览自己的对象」；签名定成 `renderPresentationForm(object: OwnedPresentationObject, form, values): string`，**不加工具和主人参数**，字段标题走 `say`，主人在 `OwnedTextRef` 里，语言在上下文里。平台画（挂载位、MLN-23）和插件预览是同一个函数。坏引用 `say` 不抛（第 2.3 节），一句坏判断打不断整页。

### 8.4 两包样例

`examples/plugin-sample`、`tooling/plugin-cli` 的 `create` 模板、`tests/plugin-sample.e2e.test.ts`：

1. **声明：** `manifest.json` 加第 1.2 节的 `ui.locales`；加 `locales/en.json`、`locales/zh.json`。`package.json` 的 `files` 不用动：`pack` 自动带（第 6.2 节）。测试把样例拷到临时目录的那一行（RAC-553 上面）要多拷这两个文件。
2. **校验：** `molis-work-plugin validate` 调 `inspectLocaleSet`，改坏一个占位符应失败。
3. **运行：** `index.mjs` 只 `import { t } from ".../ui"`，`render(request)` 里写 `t("notes.main.saved", { count })`。现有断言 `/Saved results: 1/` 不动（`en.json` 就写这句，`Saved results: {count}`），另加一行单复数，并在 `zh` 下断言中文。
4. **只装两包：** 现有用例已经用 `npm install` 只装 contracts 和 SDK 后起子进程（`tests/plugin-sample.e2e.test.ts` 的 RAC-553 那段）。在同一段加：导入 `parseLocalePack`、`installTextForTest`、`resolveUiEnvironment`、`parseSkinFile`（规格用一份内联的最小样本，作者拿不到私有 design-system），跑通并打印结果；不装上下文时 `t` 抛 `ui.text_no_context`；再用 `esbuild --platform=browser` 打一次 `/ui`，有 Node 内建模块就失败。
5. **业务代码不碰语言：** 断言 `index.mjs` 源码里没有 `currentLocale`、`navigator.language`、`data-resolved-theme`、`data-skin`。
6. **副本共用上下文：** 把样例打成单模块，用 `import("data:…")` 载入（`native-plugin-release-artifact.ts` 的做法），断言它读到宿主装的上下文。这是第 5.2 节选 `Symbol.for` 的证据（FSS-69）。

样例走 `services.ui.register`，证明不了真实页面。所以另加一个用例：临时 Home 里一个带 `ui.views` 的夹具插件，经 `createPluginPlatform` 启动，走 `renderStagePage` 画出来，断言读到了自己的词（FSS-60）。

### 8.5 字体路径

`apps/local-host/src/web-assets.ts:14-19` 写死 `../../../packages/design-system/fonts/…`。发行物里没有这个相对层级，**读代码判断应是 404（没有起服务实测）**；系统字体排在前面，所以平时看不出。改成 `interVariableFontFilePath()`、`notoSansScFontFilePath()`（`typeface.ts:19,23`，`local-host` 已依赖 design-system）。路由字面量 `"/assets/inter-latin-variable.woff2"` 保留（第 3.6 节）。写进基线那一片，并补干净安装后路由能读到的测试（FSS-59），先把现状跑出来证明确实是 404，再改。

## 9. 资源预算的接口

实测与预算方案在 `specs/font-and-skin-system/resource-budget.md`（分支 `claude/14-resource-budget`，#1922），本文不写，只定怎样接。字段以本文为准，那边第 6 节写明了「字段名以合同定稿为准」，那边也按这里的说法改。

**用户 2026-11-07 选了方案二：** 每次改代码，自动起一个真实服务（不开浏览器），算主要页面第一次和再次打开共下载多少，只许变少，**不设绝对上限**；第一屏资源都要登记。这是改门禁，**第 16 批开工前单开门禁 PR 落地，不和功能混，A 段不做**。

**统一说法（统筹 2026-11-07 定）：** `registry.json` 只收随产品发行、有包内路径的东西（字体、皮肤、字体方案、共同规格、平台语言目录）。隐藏文档、内联块、启动 JSON 不进这张表；第一屏清单放在门禁自己的文件里（`tooling/gates/` 下），由门禁 PR 新建。理由：那些行没有包内路径，按页面才有意义；放进 `registry.json` 的话，每个加启动请求的 PR 都要改 D 轨的发行文件，正是第 3.6 节删 `bytes` 要避免的并行冲突。

| 预算方案的字段 | 这里怎样接 |
| --- | --- |
| `id`、`kind`、`owner`、`load`、`license` | 随产品发行的那些行，就是登记表的字段。`load` 取那边的 `first-screen`、`fallback`、`on-open`、`on-select`，加上 `startup`、`tool`。`kind` 的 `interface-spec` 这里叫 `spec` |
| `origin` | 合进 `license.source` |
| `path`、`source` | `route`、`package`＋`path` |
| `bytes`、`gzip` | 不存，报告从文件现算。方案二比的是真实响应对 merge-base，不需要存下来的数 |
| `gated` | 不要。报告对照 `page-assets` 的路由算 |
| `style`、`script`、`inline`、`startup-json` | 不进这张表，进门禁自己的第一屏清单 |
| `locale.<插件>` | 不进这张表。插件语言文件的声明只有 Manifest |

- **插件语言文件**由报告从内置 Manifest 投影，和两张表合起来出同一张账，不抄进表。
- **报告只有一份。** `scripts/first-screen-report.mjs`（预算分支带来）加 `--resources`，读登记表、打印每行的字节和 sha256，不失败，不是门禁。那个分支合入之前没有消费者，所以放在 T9。
- **已知盲区**（`resource-budget.md` 第 5 节逐入口列了）：门禁只量 `/assets/` 字面路由和内置包；HTML 内联（最大是英文页词典，`apps/workbench/src/i18n.ts:154`）、`/api`、英文变体、外部插件都没量。A 段不往这些地方搬字节，也不改门禁。

A 段的页面资源影响：基线内容不变；SDK 新工具不进现有包（第 5 节，门禁证明）；组件板是内联的开发页；字体路径修复不改字节。所以 **A 段不需要新增资源，也不需要增长许可**。若实现时门禁显示某资源变大，停下来，不写许可。

## 10. 片与 PR 序列

C1 独占合同文件和 `tooling/gates/api/`；D 独占 `packages/design-system`、`packages/plugin-sdk/src/ui.ts`、`ui.ts`。合同先单独开小 PR。开写之前读 #1743 最新评论，开 PR 前再查一遍同快照的在途 PR。

**排队（用户 2026-11-07 同意本批插队）：** 快照是生成物，冲突是机械的，后合入的重新生成。

| 占用 | 怎么办 |
| --- | --- |
| `api/contracts/platform/ui.txt`：T1、T2 与 #1846 | T1、T2 都先于 #1846，不等它；#1846 合入前重新生成。用户定的是 T1，T2 因为和 T1 同一份快照紧接着，主会话确认 |
| 同一份：T2 与 05② C-2 前置的「状态环取值下沉到 `platform/ui.ts`」（D 轨，还没做） | 同一份快照一次一个 PR，开工时错开；下沉不等 T2 |
| `api/plugin-sdk/ui.txt`：T4、T5 与 #1872 | T4、T5 先于 #1872，不等它；#1872 合入前重新生成 |
| 同一份：T4 与 #1913（第 05 批，开着） | T4 开工时看它合了没有；没合就按同样办法处理，并在 #1743 说一声 |
| `api/contracts/platform/plugin.txt`：T3 与 #1879（第 18 批）、02 批 N39 | T3 开工时看 #1879 合了没有，先后由主会话裁定；N39 是生成文件，谁后合谁重新生成（#1743 11-07） |
| 同一份：T3 与 `plugin-manifest` 那条链（08 C-1 → 05② C-2 → P-1 → P-3b，20 第 10 节） | **T3 排在 08 C-1 之前。** 08 C-1 的白名单要收 `ui.locales`（第 6.2 节） |
| `packages/design-system/src/styles/craft-finish-bar.ts`：T6 与 #1867 | 不是生成物，T6 开工时看它合了没有，没合就按它的改动合并 |
| `packages/design-system/src/primitives/catalog.ts`、`browser/catalog.ts`：T8b 与 #1913、#1872 | 不是生成物。#1913 两个都改，#1872 改前一个（核过文件清单）。T8b 开工时看它们合了没有，没合就按它们的改动合并 |
| `api/contracts/services/agent-host.txt`：T10 | 查过 #1879、#1888、#1889 不动 |

**合审（用户 2026-11-07 定）：** 公共合同台、D 轨没回音时，本批的合同 PR 和组件板新增由没碰过它的子代理合审；它们回来有意见照样处理。

| 片 | 做什么 | 动的文件与快照 | 前置 | 验收 | 写手模型 |
| --- | --- | --- | --- | --- | --- |
| T1 合同① `TextRef` | 第 2 节的类型与 schema | `platform/ui-text.ts`（新）；`ui.ts` 一行 `export *`（D 文件，D 评）；`api/contracts/platform/ui.txt` | 本设计稿合入 | FSS-42、FSS-45 | Opus 5.5 high |
| T2 合同② 文件与快照 | 第 3、4 节的类型；第 5.1 节的文字工具类型；`versions.json` 五个条目，`POLICY.md` 记 `carriers` 例外（第 1.4 节）。**`UiContribution` 不改** | `platform/ui-files.ts`、`ui-environment.ts`（新）；`ui-text.ts`；`ui.ts` 只加 `export *`；`tooling/versions.json`；`docs/releases/POLICY.md`；`api/contracts/platform/ui.txt` | T1 | FSS-46（类型部分） | Opus 5.5 high |
| T3 合同③ Manifest | `ui.locales` 类型与解析 | `plugin-manifest.ts`；`packages/plugin-sdk/src/manifest.ts`；`api/contracts/platform/plugin.txt` | T1（`LOCALE_TAG`）；见排队表 | FSS-52 | Opus 5.5 high |
| T4 SDK 文字工具 | `text`、`text-ref`、`message-format`、`locale-pack`、`text-reader`；`message-declarations.ts` 改模块内 `export`；`error-owners.json` 加 `ui`，只写这片的文件（门禁对匹配不到文件的路径直接失败） | `packages/plugin-sdk/src/ui/*`、`ui.ts`、`message-declarations.ts`；`tooling/gates/error-owners.json`；`api/plugin-sdk/ui.txt` | T1、T2（文字工具类型）；排队表 | FSS-43、44、47、48、50、51、69、70 | Opus 5.5 high（SDK 共享核心，统筹加全量） |
| T5 SDK 文件工具 | `strict-json`、`appearance-*`、`environment`；新文件有错误码才改 `error-owners.json` | 同上快照 | T2、T4 | FSS-46、48、49、57 | Opus 5.5 high |
| T6 基线与字体路径 | 第 7 节全部、第 8.1、8.5 节；同一 PR 改 `docs/SSOT-MATRIX.md` 的「`palette.ts` 唯一来源」、design-system README 的「开发要求」和 `page-clients.ts` 头部，否则文档到 T9 之前都是错的 | `packages/design-system/{resources,src/baseline.ts,src/palette.ts,src/typeface.ts,src/styles/foundation.ts,src/styles/craft-finish-bar.ts,package.json,README.md}`；`tooling/gates/error-owners.json`（`baseline.ts` 抛 `ui.baseline_invalid`，这个包今天没有主人）；`apps/local-host/src/web-assets.ts`；`docs/SSOT-MATRIX.md`；测试与夹具 | T5；排队表 | FSS-54、55、56、58、59（design-system 那些行） | Opus 5.5 medium；占 build 槽位 |
| T7 语言文件读取 | 第 6.2 节 A 段那两行；CLI `validate`、`pack` | `packages/plugin-runtime/src/{locale-packs,package-verification,development-loader}.ts`；`tooling/plugin-cli` | T3、T4 | FSS-53 | Opus 5.5 high |
| T8 消费者 | 第 8.2、8.3、8.4 节，第 5.4 节的合并代码 | `apps/local-host/src/{ui-text-provider,plugin-executor,plugin-host-services,home-plugin-executor,plugin-development}.ts`；`apps/workbench/{src/plugin-text.ts,src/browser/locale-switch.ts,src/browser/board/environment-section.ts,src/primitive-catalog.ts,resources,package.json}`（`files`，`dist/board-environment-section.js` 的构建脚本）；`packages/design-system/resources/registry.json` 工作台那行（D 文件，D 评）；`examples/plugin-sample`；`tooling/plugin-cli/src/create.ts`；`tests/plugin-sample.e2e.test.ts`。现有插件、`render` 和画页的地方不动；若 `tsc` 或测试显示要动，**停下交回主会话**（第 12 节第 4 条） | T6、T7 | FSS-58、59（工作台那行）、60、61、62、63、64 | Opus 5.5 medium；占 browser 槽位 |
| T8b 组件板三样 | 外观卡、样张卡、换外观的淡入，依据 `docs/design/appearance-selection/README.md`「组件板新增」：定样记录写明要先有标本才写产品代码。样式只进组件板，算不上页面资源增长（照 #1913）；部件的渲染函数不进 SDK，第 16 批做设置页时再提升，所以不占 `api/plugin-sdk/ui.txt`。样张卡用真实基线解析出来的令牌画，不写假值。#1795 共审留给第 16 批的三条小修（样张主按钮的键位提示、390 宽代码行截断、原型角标）不进这片 | `packages/design-system/src/primitives/catalog.ts`、`packages/design-system/src/browser/catalog.ts` 与组件板样式。和 T8 的文件不重合（T8 在 `apps/workbench`），可以各写各的；只是 browser 槽位要错开 | T6；排队表 | FSS-66、67、68 | Sonnet 5.5 xhigh；占 browser 槽位；D 轨合审，没回音由没碰过这片的子代理代看 |
| T9a 账本与术语 | 报告；`docs/platform/UI-PLATFORM.md`；SDK README「开发要求」；`docs/system/GLOSSARY.md`、`EXTENSION-POINTS.md`（第 16.2 节） | 文档；`scripts/first-screen-report.mjs` | T8；`resource-budget.md` 合入 | FSS-65 | Sonnet 5.5 high |
| T9b 手册与开发流程 | 第 16.2 节其余各行。**手册不写超前**（第 16.1 节）。`skills/` 不排在全量回归期间。`AGENTS.md` 和开发流程的文字经用户确认（主会话拿草稿问） | `skills/molis-plugin-dev/{text-and-appearance.md,SKILL.md,ui.md}`；`skills/molis-prologue-ai/SKILL.md`；`docs/platform/{PLUGIN-DEVELOPMENT,PROLOGUE-AI}.md`；`specs/post-anticorruption-roadmap/reference/development-workflow.md`；`docs/prompts/repository-systematic-review.md`；`AGENTS.md`；`docs/README.md`；`apps/workbench/README.md`；`docs/cli-and-development.md` | T8、T10 | FSS-72、73 | Opus 5.5 high；实走用没读过设计稿的独立代理 |
| T10 回复语言 | 第 15.2 节 | 第 15.6 节第一行 | 不依赖别的片；排队表 | FSS-71 | Opus 5.5 high；提示词改动占 agent 锁，隔离 Home，真实模型验证由统筹安排 |

**先后：** T1 → T2 → T4 → T5 → T6；T1 → T3 → T7（T4 也要）；T6、T7 → T8 → T9a、T9b；T6 → T8b，和 T8 只错开 browser 槽位；T10 随时可开，T9b 里提到它的两句等它。同一时间最多 3 个写手，T1 与 T3 同归 C1 但快照不同：T3 要 `LOCALE_TAG`，所以 T1 先合；T4、T5 同一快照串行。T4 前置 T2，是因为 `t`、`say` 的类型在 T2。

**给别批的（改了上一版只写 C-3 的说法）：**

| 片 | 合同等 | SDK 校验等 | 用来 |
| --- | --- | --- | --- |
| 05② C-2 | T1 | T4（`validatePresentationDeclaration`、`presentationText`） | `label`、`note`、`overview` 的 `summary` |
| 05② C-3 | T1 | T4（`assertSurfaceDescription`） | `SurfaceGroup.title`、`reason` |
| 20 P-1 | T1 | T4（`validateSettingsDeclaration`） | `SettingEntryDeclaration.title` |
| 20 P-3b | T1 | T4（`inspectBlueprint`） | `Blueprint.title`；第 15.4 节 |
| 15 S-1 | T1 | T4 | 同 05② C-3 |
| 08 C-1 | T3 | T4 | 内容包白名单、第 15.3 节 |

`dependencies.md` 第 194、199 行已在本 PR 改；`batches/14.md` 第 15、32 行由主会话改（第 16.4 节）。

**MLN-23 不卡：** 它在需求上「不经组合服务直接画行」，用 `renderPresentationForm`，读内置插件的 `label`。第 03 批定样，实现是第 37 批第 2 项「主线第一片接顶部切换器」（前置 07、15、36）。15 接页面的片在第 16 批切换之后（`dependencies.md` 15-1），第 218 行也要求新格式消费者在 16 之后。所以它画的时候内置插件已经有语言文件，读取器不缺。批文件没有写编号 MLN-23，是按「顶部切换器」对上的；如果它被提到第 16 批之前，它读不到内置插件的 `label`，要停下问。

验证：每片 `node scripts/affected-tests.mjs` 挑用例，`node scripts/run-tests.mjs --jobs 1`，走机器槽位；全量由统筹加。T4、T5、T7 碰共享核心。

## 11. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 定义正文归文件；A 段的文件归发行物（design-system、workbench、各插件包）。语言偏好仍归入口 Cookie，设备偏好仍归浏览器。Home 选择归 B 段的新服务。快照、解析结果是投影，不是事实。`docs/SSOT-MATRIX.md` 的「`palette.ts` 唯一来源」改成皮肤文件（T6） |
| 2 | 插件同等待遇 | 内置和外部同一个 `ui.locales`；`inspectPluginLocales`、`pluginLocaleReader` 一套规则；`t` 对所有插件一样。来源不同只是 `read` 不同。没有宿主私路 |
| 3 | 能力注册 | A 段不加动作，不碰动作目录；`pnpm actions:update` 应无变化。主人取自 Manifest 和可信登记 |
| 4 | 合同 | 改：`platform/ui`（三个新文件）、`platform/plugin`（`ui.locales`）、SDK `/ui`、`services/agent-host`（T10 一个可选字段）。阶段一，不留兼容期。`UiContribution` 不改，现有插件和调用方不用动。合同先单独开 PR（T1～T3） |
| 5 | 放在哪个包 | 合同在 contracts；工具在 SDK `/ui`（只依赖 contracts，无 Node 内建）；基线在 design-system（读文件）；语言文件读取在 plugin-runtime；A 段不加新包。**B 段的外观主人按用户 11-01 的规定进 `horizontal/` 新包，不进实现方案写的 `apps/local-host/src/interface/`**，方案已加注 |
| 6 | 表与存储 | 不加表，不改库结构，不碰发行物（`artifact_json` 不变）。第 16 批外部包走已签名的包文件（第 6.3 节），同样不用新表 |
| 7 | 兼容与迁移 | 不加。`ui.locales` 与 `ui.messages` 同写拒绝，没有翻译器读两种。`literal` 是语义不是兼容 |
| 8 | 安全边界 | 不碰回环、令牌、动作网关、MCP、桌面 IPC。相关的三点：① 文字冒充（主人不从声明读、前缀规则），FSS-42、43 断言拒绝；② 不可信文件（重复键、危险属性名、CSS、外部 URL、语言包里的标记字符），FSS-46、70 断言拒绝；③ `t` 的字符串参数转义，合并代码不用 `innerHTML`，FSS-61、70 断言。切语言的请求头只选语言、不授予任何东西。是否进 `docs/system/SECURITY-INVARIANTS.md` 由 T4 写手按该文件规则加一行（语义 ID），评审确认 |
| 9 | 调用次数 | 见下表 |
| 10 | 升级与数据 | A 段不写 Home。统一起点已登记（#1914），但没有改库或带版本文件的结构。文件格式 `format.ui.*` 进 Home 是 D 段的事，到时按 `VersionedFile` 走升级链 |
| 11 | 成果与过程项 | 配置不进成果库（需求 §3.1） |
| 12 | 页面与外壳 | 不出新页面，组件板加一节开发标本。不登记 DOM 事件（第 4.5 节）。页面资源无增长（第 9 节）。标本是开发工具，不算定样，没有新组件 |
| 13 | 错误 | `defineErrorCodes("ui", …)`，`error-owners.json` 加 `ui` 一条，路径只含新文件。不写 Error 子类。报错带文件和下一步（第 3.1 节） |
| 14 | 冲突面 | C1：`platform/ui-*.ts`、`plugin-manifest.ts`、`plugin-runtime`、`api/`。D：`design-system`（含 T8b 的两个组件板文件）、`plugin-sdk/src/ui.ts`、`ui.ts`。枢纽：`tooling/versions.json`、`error-owners.json`、`ci-product-subset.txt`、`AGENTS.md`。在途：#1846、#1872、#1879、#1867、#1913，处理见第 10 节排队表。`apps/local-host/src/web-assets.ts`、`plugin-frame` 不归独占轨道 |
| 15 | 文字与外观（T9b 之后才是正式的一项，第 16 节） | 新文字有主人；A 段逻辑不依赖译文；不存译文；令牌不改名；回复语言由平台一处给 |

**调用次数（N42～N56 的口径：一次操作几个请求，每个请求几遍目录发现、几次授权核对、开几次库、读几次文件；按缓存过期后的真实成本算）。**

| 操作 | 请求 | 目录发现、授权核对 | 开库 | 读文件 |
| --- | --- | --- | --- | --- |
| **A 段**：进程启动 | 0 | 0 | 0 | 基线 4 个 JSON，各 1 次（模块初始化） |
| **A 段**：打开任一页面 | 比现在多 0 | 比现在多 0 | 比现在多 0 | 0。CSS 内容不变 |
| **A 段**：一次 `render` | 0 | 0。主人在键里 | 0 | 开发路径的插件：这种语言第一次用到读 1 次，之后走内存。现有插件 0 |
| **A 段**：插件开发启动（只有 `plugin dev`） | 0 | 0 | 0 | 声明几种语言读几个文件，各 1 次 |
| **A 段**：打开组件板 | 1 | 0 | 0 | 工作台语言文件 2 个，首次读后记住 |
| **第 16 批**：首屏，Soft Workbench | 比现在多 1（工作台的语言脚本），再次打开是 304。`/assets/` 现行缓存头是 `max-age=0` 加 ETag（`resource-budget.md` 第 2 节） | 0。快照由 Home 选择的内存投影算，不走 `localWebActionContext`（N42） | 0 | `state.json` 只在选择变化后读 1 次 |
| **第 16 批**：首屏，其他皮肤 | 再多 1（皮肤 CSS）；字体最多 2 个，只在选用时 | 同上 | 0 | 同上 |
| **第 16 批**：打开一个插件 | 同一屏的插件词 1 个批量请求（N52）；iframe 的词随配置来，0 个 | 0 | 0 | 每个主人每种语言第一次用到读 1 次，之后走内存；没用到的语言不读 |
| **第 16 批**：切皮肤，发起窗口 | 1 个写动作，共用 1 份上下文 | 1 遍 | 0 | `state.json` 读写各 1 |
| **第 16 批**：切皮肤，别的窗口 | 经已有推送通道收 1 条失效信号，取快照 1 个；iframe 0 个（`connect-src 'none'`，走端口），只换 `<link>` | 0 | 0 | 0 |
| **第 16 批**：切语言 | 1 个写 Cookie；工作台语言脚本 1 个；本页插件的词 1 个批量请求（N52）；**当前页面 HTML 2 个**（旧、新两种语言，第 5.4 节），每个同源分屏窗格各 2 个；iframe 0 个（文档已在主页面的 HTML 里，经端口交给它） | 这 2 个页面请求各按现有的画页路径走，目录发现和授权核对的次数和打开一次页面相同，不多不少。两个请求可以共用吗：不行，语言不同 | 同打开一次页面 | 同「打开一个插件」 |
| **T10**：助理开一轮 | 比现在多 0 | 比现在多 0 | 0 | 0 |
| 后台 | 0。不轮询，不定时（N54），隐藏的窗口回到前台才重读 | 0 | 0 | 0 |

没有短 TTL 缓存（N55）：资源按摘要命名，内容变了地址就变；投影按版本失效。一次切换不进模型，不按插件各读一遍（FSS-20）。调用预算用例（N56）另有主人；A 段的 FSS-63 自己断言上面前四行。

## 12. 用户定的事

第 1～6 条用户 2026-11-07 用弹窗定了，决策记录在[需求书 §12](spec.md#12-决策记录)。**第 7 条待用户定，主会话拿第 15.1 节的方案去问；它不挡 A 段任何一片。**

| # | 事 | 选了 | 否掉 | 在本文 |
| --- | --- | --- | --- | --- |
| 1 | 页面下载量的检查（决策第 23 项其余部分） | 真打开一遍算总数（预算方案二）：起真实服务、不开浏览器，算主要页面第一次和再次打开共下载多少，只许变少，不设绝对上限，第一屏资源都登记。第 16 批开工前单开门禁 PR，不和功能混，A 段不做 | 只在代码里查名单（查不出网页本身变大）；每次真开浏览器（慢、易误报） | 第 9 节 |
| 2 | 语言目录 | 工作台一份，插件按需；第 16 批带实测按类一次批准，不逐个问 | 每种语言一个大文件（每页仍下发全部插件的词） | 第 4.4 节 |
| 3 | 候选字体 | 批准下载实测，结果写进 `resource-budget.md`，本文不写字节 | | 第 3.4 节 |
| 4 | 新旧写法并存（决定 20） | 并存到第 16 批，不算违反：一个插件只能写一种，只有样例用新写法，现有插件不动；断言 C 段之前内置插件不写新写法。用户当时是按「现有插件不动」同意的。**同日用户要求业务只 `import { t }`，上一版那个绘制入口的可选参数已去掉，这条的前提更稳了** | | 第 6.1、8.3 节 |
| 5 | 合审 | 公共合同台、D 轨没回音时，由没碰过它的子代理合审；它们回来有意见照样处理 | | 第 10 节 |
| 6 | 排队 | 本批插队：T1 先于 #1846，T4、T5 先于 #1872，它们之后合入前重新生成快照 | | 第 10 节 |
| 7 | **待定：没有页面的工作用什么语言** | 推荐「记下发起时的语言」 | | 第 15.1 节 |

## 13. 验收标准

A 段的验收写在[需求书 §11](spec.md#11-验收标准) 的 FSS-42～FSS-73，那里才是检查（`scripts/check-spec-coverage.mjs` 只读 `spec.md`）和测试引用的地方。测试只写真正证明了的编号；A 段为 FSS-09、FSS-34、FSS-35 等打基础，但不证明它们在全部入口成立，**测试不写这些旧编号**，否则报告会显示假覆盖。

| 编号 | 一句话 | 哪一片 |
| --- | --- | --- |
| FSS-42 | 主人只由平台填，坏引用被拒 | T1、T4 |
| FSS-43 | 键规则、前缀、`common`、上限 | T4 |
| FSS-44 | 参数存原值，切语言重算 | T4 |
| FSS-45 | schema 合法，第 2.4 节每种用法都通过 | T1 |
| FSS-46 | 四种文件的拒绝 | T2、T5 |
| FSS-47 | 复数与第 3.5 节表格 | T4 |
| FSS-48 | Node 与浏览器结果相同 | T4、T5 |
| FSS-49 | 快照不带字节，优先级链 | T5 |
| FSS-50 | `/ui` 没有 Node 内建，现有包不变大 | T4 |
| FSS-51 | 作者工具与平台同一函数 | T4 |
| FSS-52 | Manifest 声明的拒绝 | T3 |
| FSS-53 | 语言文件读取、`pack` 自动带、内置不写新写法 | T7 |
| FSS-54 | 194 个名字对冻结夹具 | T6 |
| FSS-55 | merge-base 与头内容 sha256 相同 | T6 |
| FSS-56 | 令牌声明处没有第二份数值 | T6 |
| FSS-57 | 省略角色补齐，`locked`、`alias_of` 拒绝 | T5 |
| FSS-58 | 登记表对磁盘 | T6；工作台那行 T8 |
| FSS-59 | 干净发行物里基线和字体可读 | T6；工作台语言文件 T8 |
| FSS-60 | 真实画页路径读到自己的词，灌入与撤回 | T8 |
| FSS-61 | 组件板标本原地切语言，状态保留 | T8 |
| FSS-62 | 两包样例 | T8 |
| FSS-63 | 调用次数 | T8 |
| FSS-64 | 现有页面无变化，现有插件和调用方没改 | T8 |
| FSS-65 | 文档 [人工] | T9 |
| FSS-66 | 外观卡 | T8b |
| FSS-67 | 样张卡用真实基线令牌 | T8b |
| FSS-68 | 换外观的淡入 | T8b |
| FSS-69 | 没有上下文时 `t` 抛错；SDK 多份副本共用上下文 | T4；副本那条 T8 |
| FSS-70 | 语言包拒标记字符，字符串参数转义，三种用法的结果 | T4 |
| FSS-71 | 回复语言 | T10 |
| FSS-72 | 手册实走 | T9b |
| FSS-73 | 开发流程文字 [人工] | T9b |
| FSS-74 | 内容语言的全局规则 | 不是 A 段：第 08、16、20 批证明 |

## 14. 第 16 批要接着做的（从这份合同看到的）

- 门禁 PR：页面总数，第一屏清单放在 `tooling/gates/` 下（第 9 节），语言和皮肤的路由教给 `page-assets`（第 4.4 节），开工前单开。
- 字体方案加字号、行高、长文阅读、说明文字（第 3.4 节）。
- `PLUGIN_COMPONENTS` 搬进共同规格（第 3.3 节）。
- `ActionLocale = "zh" | "en"`（`actions.ts:80`）与 `WebLocale`、`WEB_LOCALES` 写死两种语言，要改由语言描述驱动。
- 内置插件和沙箱包的语言文件（第 6.2、6.3 节）；沙箱合同的语言声明；`alchemist`、`plugin-builder` 没有 `package_name`，另给包目录。
- `FrameConfig` 与沙箱启动的上下文（第 4.5、5.2 节）；动作网关按 `locale` 包一层（第 5.2 节）；登记 `molis-work:ui-environment-changed`。
- 第 5.4 节的合并代码进工作台脚本和 iframe，量字节；`/locale` 跳转改成原地。
- #1795 共审留下的三条小修：样张主按钮的键位提示、390 宽代码行截断、原型角标。

**迁移脚本（第 1.1 节的改前改后就是它的验收）：**

- 换键：`L(`、`p.text(`、`model.primitives.text(`、`host.translate(`、`globalThis.L(` 换成 `t(` 或 `t.text(`，按第 5.3 节的位置规则；加 import。键由 `createPluginMessageStore` 和各 `*-en` 的现有对应生成。
- 内联脚本 107 个文件约 2,271 处：不加 import，用页面全局的 `t`。这些文件的字符串参数没有按位置分过，开工前再数。
- 注入翻译函数的文件（如 `plugins/native/feed/src/stage-ui.ts` 的 `{ L: model.primitives.text }`）：开工前数，第一遍留下没人读的参数。569 处 `L(变量)` 和条件键（如 `todo/src/browser/page.ts:73`）脚本认不全，开工前分类。
- 语言文件的 `'`、`"`、`&` 替换，7 处冲突标记改参数，2 处 `<li>` 拆开（第 5.3 节）。
- `scripts/gates/translations.mjs` 适配新词表：**这是改门禁，到时先问用户。**

**「逻辑不依赖译文」今天的违反（`origin/main`，我核过）：**

| 类 | 数 | 处理 |
| --- | --- | --- |
| 拿译文做判断 | 主会话数 7 处，我核到 **5 处是真的判断**：`apps/workbench/src/scripts/client/placement.ts:39`、`events-primary.ts:122`、`plugins/native/coding/src/browser/main/select.ts:111`、`main/run-facts.ts:43`、`plugins/native/goals/src/planning-client.ts:60`。另外 2 处不是：`goals/src/relation-client.ts:17` 是 `currentLocale() === "en"` 选标点（按语言分支，同样要改，归「按语言写分支」），`todo/src/browser/page.ts:73` 是比年份选键，不依赖译文 | 改成比键或原值 |
| 写死日期语言的 `toLocale*String` | 主会话数 16 处；我数到带写死语言或 `\|\| "zh-CN"` 回退的 13 处（`agent-review-http.ts:96`、`assistant-followups.ts:223`、`computer-record-source.ts:37`、`coding/src/browser/usage-meter.ts:46` 等）。**另有 38 处 `toLocale*String()` 不带参数**，跟着运行环境的语言，也不对 | 改 `format` |
| 按中文排序的 `localeCompare` | 2 处：`assistant-contributions.ts:55`、`design-system/src/browser/catalog-patterns.ts:36` | 用当前语言 |
| 抛错时翻译 `Error(L(` | 165 处、74 个文件（相同）。按 `plugins/native/*/src/browser/`、`apps/workbench/src` 的分布，多数是页面代码只给页面看，不用动；**会存下来的要改存错误码。** 我只抽看了 12 处，都在页面代码或请求路径里（如 `model-provider-setup.ts:93` 是本次请求的拒绝），**没有逐条分**。服务端的 20 处（`apps/local-host/src`）和 `goals/src/event-document-deliverables.ts:81` 这类要优先查 | 开工前逐条分 |
| 按中文词序拼句 | 需求书 §6.1 第 3 条，约 70 处 | 整句一个键 |

**能不能静态拦（只给建议，新门禁先问用户，这里不加）：** 拿译文做判断可以拦：AST 查 `L(`、`t(` 作为 `===`、`!==`、`switch` 的操作数，误报少，5 处就是这样查到的。写死语言的 `toLocale*String` 和 `localeCompare(x, "zh…")` 同样能查。「存进数据」查不了，靠评审。

**内容翻译（第 15 节）：** goals 的 37 个方法（`plugins/native/goals/methods/`）、内置 Character、提示词段（`assistant-agent.ts` 等，各升版本）；Todo、Issues、Pages 的方法正文从代码搬成文件；Coding、创作台接 `reply_locale`；创作台生成内容的默认语言跟所选语言；量动作说明要不要换（第 15.5 节）。第 20 批内容包跟同一规则。

**手册和脚手架（第 16 节）：** `create.ts`、`sample-source.ts` 默认生成语言文件；`generated-*.md` 和 `CHAPTERS`（要 `pnpm studio:replay`）；手册删旧写法。

**不变、仍在第 70 批：** `DESIGN.md` 的皮肤章节（核账第二节第 4 条）、个人助理的外观 Skill。

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

### 15.1 没有页面的工作用什么语言（**待用户定**）

定时任务、后台轮次、MCP 没有入口。语言偏好今天归入口 Cookie，每个浏览器一份，这些工作碰不到。**这条不定，下面第 15.3 节「冻结语言」对没有页面的轮次就落不了；T10 不受影响，它只管有页面的轮次。**

| 方案 | 用户会看到什么 | 代价 |
| --- | --- | --- |
| **甲 记下发起时的语言（推荐）** | 每个定时任务、后台工作、MCP 授权，建的时候是什么语言就一直是什么语言。今天用英文建的日报，以后都是英文；切成中文界面，旧日报还是英文，要改就在任务上改一下。助理委派的子任务跟着上一轮 | 这几张记录各加一个 `locale` 字段；旧记录没有值，用主人默认语言（统一起点前按维护决定处理）。**不违反**「界面语言只在这个浏览器」：记的是这件工作自己的事实，不是一个 Home 级偏好 |
| 乙 跟最后一次用的语言 | 切成英文之后，明天的日报就是英文，不用逐个改 | 要新增一项 Home 级事实「最后用的语言」，和「界面语言只在这个浏览器」冲突：两个浏览器用不同语言时，后台工作的语言看最后动的是哪个，用户说不清为什么变了 |
| 丙 用主人默认语言 | 后台工作的语言和界面可能不同，一个英文用户也会收到中文日报 | 不用改任何记录。就是今天的行为，不满足用户的要求，只列作对照 |

### 15.2 回复语言怎样给模型（T10）

**能在一处小改完成，提议本批加一片，让用户现在就能看到效果。**

- **一处。** `horizontal/agent-host/src/adapters/prologue-run-start.ts:87`：`instructions` 由角色的提示词拼成，这里在最后加一段平台的话。所有经 agent-host 的轮次都走这里，「模型调用只经 agent-host」。
- **合同。** `AgentStartRequest` 加可选的 `reply_locale?: string`（`packages/contracts/src/services/agent-host-start.ts`），`agent-host.ts` 的 schema 同步。没写就不加那段，行为和今天一样。它不授予任何东西，不算可信身份。
- **提示词版本。** 平台那段话新增 `prompt.reply-language`，走 `tooling/versions.json` 和 `pnpm versions:generate`。`ASSISTANT_BASE` 的那句改成「回复语言见本轮说明；本轮没有说明时，用用户使用的语言」，`prompt.assistant-base` 升一版。
- **语言从哪来。** 助理发起一轮时取 `pageLocale()`，开轮时定下，这一轮之内不变。切界面语言只影响下一轮。**我没有走通**从页面请求到 `AssistantExecutor.start`（`assistant-executor.ts:106`）这一路在排队时 `pageLocale()` 还在不在，T10 写手第一步核；不在的话在收到请求时记到轮次上。
- **T10 只接个人助理。** Coding、创作台到第 16 批接同一个字段，一行调用方。
- **压缩和结尾复核的提示词不动。**

T10 不依赖其余各片，也不碰文字工具。

### 15.3 Skill 的文件约定（交第 08 批合同）

**约定：** `skills/<skill_id>/SKILL.md` 是默认语言，标准格式不变；译文是同目录的 `SKILL.<语言>.md`。和 `locales/<语言>.json` 一样由约定路径得出，加一种语言不写路径。**只有 `SKILL.md` 的是合法包**，外部导入不需要语言标记。

逐条对照 `specs/skill-packs/contract-design.md`（08 C-1、C-2 还没合，现在改最便宜，**改动归第 08 批**）：

| 卡点 | 位置 | 规则 |
| --- | --- | --- |
| 正文路径 | §4.2 `body` | 仍是 `skills/<id>/SKILL.md`。声明加可选 `locales?: string[]`，列这个 Skill 有哪些译文；不写就只有默认语言 |
| 文件清单 | §3「不多不少」 | 由声明算出每种语言的路径。默认语言必须有；声明了的译文缺文件算坏包 |
| 版本 | §4.3 | **所有语言共用一个 `version`**，摘要算全部语言。修一个英文错字也要升版本。理由：`SkillRef` 要精确，一份规则。代价：升级差异会多，`change` 写明改了哪种语言 |
| 读正文 | §8 `skills.body.read@1` | 语言不进输入，取这一轮冻结的语言（可信上下文）。输出加 `locale`（实际用的，单文件包是 `null`）和 `fell_back: boolean`。回退到默认语言不算「悄悄换版本」，因为版本没变，结果也写明了 |
| 轮次 | §5、§7 | 开轮时语言和 `SkillRef` 名单一起冻结，第 09 批委派协议带上 |
| 元数据 | §4.2、§8 | 界面用的 `name`、`description`、`when_to_use` 走主人词表（`<主人>.skill.<skill_id>.<字段>`，第 2.3 节的键规则）；没有就显示声明原文。给模型选 Skill 的 `description` 也跟语言：它决定助理选不选得对，且不进 MCP。`excerpt` 从所用语言的正文取 |
| frontmatter | §4.1 | 只认 `SKILL.md`。译文文件的 frontmatter 只收 `name`、`description`、`when_to_use`，写 `tools`、`applies_to` 就拒绝 |
| 外部导入 | §6 | 不要语言标记，单文件当默认语言。`ui.locales` 对内容包可选 |
| 资源 | §4.2 | `SkillResourceDeclaration` 加可选 `locale`。`scripts/`、`assets/` 不分语言。上限不变（按全部语言计） |
| 白名单 | §3 | 收 `ui.locales`，去掉 `ui.messages`、`ui.translations`（第 6.2 节） |
| `name_en` | §3 | 写死两种语言，由词表替代，第 16 批删 |
| 内置方法 | §4.2「由定义给正文」 | Todo、Issues、Pages 的正文在代码里。第 16 批改成同样的文件，否则内置和外部写法不一样，违反插件同等待遇 |

### 15.4 内容包与场景包（交第 20 批合同）

逐条对照 `specs/scene-and-page-contract/spec.md`（P-3b 没合，**改动归第 20 批**）：

| 卡点 | 位置 | 规则 |
| --- | --- | --- |
| 正文写在声明里 | §3 `content.body`、§5 `RoleTemplate.instructions` | **整份场景包一个文件。** 内容包里是 `blueprint.json`（默认语言）和 `blueprint.<语言>.json`，形状都是 `Blueprint`，不内联进 Manifest。草稿仍是一行 JSON、一种语言。所以只有一个形状，只是存放处不同 |
| 静态检查 | §3 `inspectBlueprint(blueprint)` | 加 `{ source: "package" \| "draft" }`：包拒 `literal`，草稿拒 `key`（草稿没有主人）。新函数 `inspectBlueprintLocales(default, others)`：各语言的 `part_id` 集合和建议种类相同，只有文字可不同，`schema` 按每种语言都核 |
| 采用 | §5、§7 | `instructions`、`body`、`title`、`materials`、`outputs` 都按采用当时的语言取。`adoptions` 加 `locale`。撤销和升级差异按这个语言比 |
| 另存 | §7 `packs.save@1` | 草稿记 `locale`。存包时 `literal` 转成键，加单语言 `locales/<语言>.json`，`blueprint.json` 就是草稿的语言 |
| 没装的包 | 08 `plugins.bundled.list@1`、预览 | 从包文件用 `createTextReader` 按语言读（第 6.2 节） |
| 接得上的，不改 | §8 `adopt` 的 `schema`、§3 `skill` 建议、§6 生成页面 | 平台选好语言再交给主人，主人不用知道语言文件 |

第 44 批的官方场景包和第 20 批第 2 项跟同一规则。

### 15.5 给模型的动作说明、工具说明要不要换

**T10 不换；第 16 批量过再定。** 没有证据的情况下不改，理由：

- **证据要这样拿：** 第 16 批动作文字有了英文键之后（FSS-40），同一批英文轮次跑两遍，一遍给中文动作说明，一遍给英文，比两样：回复里夹中文的比例、选对工具的比例。BL-103 记的是反方向的同类问题（中文对话里夹英文，「模型行为」），说明上下文的语言会渗进回复，所以这件事值得量，不值得猜。
- **换的成本很小：** 能力目录给模型的那一处在 `assistant-directory.ts`，一处按语言取。量出来有差就改这一处。
- **MCP 的工具说明不换。** 外部 Agent 没有界面语言，工具说明换语言还会让对方的缓存和比对失效。这和第 15.1 节的决定无关。

所以需求书「交给模型与 MCP 的声明原文不变」改成：MCP 不变；助理的能力目录按上面的量法定。

### 15.6 谁动哪些文件

| 事 | 谁 | 文件 | 撞不撞快照 |
| --- | --- | --- | --- |
| 回复语言 | **本批 T10** | `packages/contracts/src/services/agent-host-start.ts`、`agent-host.ts`；`horizontal/agent-host/src/adapters/prologue-run-start.ts`；`apps/local-host/src/assistant/*`；`tooling/versions.json` | `api/contracts/services/agent-host.txt`；schema 改了还要 `pnpm actions:update`。查过 #1888、#1889 不动这几个文件；#1879 动 `versions.json`，生成文件，后合的重新生成 |
| Skill 约定 | 第 08 批合同 | 第 15.3 节 | 08 C-1 的 `plugin.txt`，见第 10 节排队 |
| 场景包约定 | 第 20 批合同 | 第 15.4 节 | P-3b 的 `plugin.txt` |
| 翻译内容 | 第 16 批 | 37 个方法、内置 Character、提示词（第 14 节） | 不改合同；提示词升版本 |
| 第 20 批内容包 | 第 20、44 批 | 跟同一规则 | |

**红线：** 这一节没有改门禁、没有新增兼容逻辑、没有新增资源。

## 16. 写进开发流程、规范和插件手册

用户 2026-11-07 的要求，原话：「因为后续是插件化的，这一套也要集成到开发流程，规范，以及插件开发手册，以及其他必要的地方」。

**今天的缺口：** 需求 §9、FSS-29 把手册算正式交付，排在第 70 批，第 14 批到第 70 批之间新写的插件没有规矩。`skills/molis-plugin-dev/ui.md` 的「文案与 i18n」有旧写法（`p.text`、`src/en.ts`），别的章节、`create.ts`、`sample-source.ts`、`development-workflow.md` 第 4 节和第 10.1 节都没有这一项。

### 16.1 手册不能写超前

A 段新写法只有开发路径走得通，带 `ui.locales` 的沙箱包装不上，内置插件还不能写。**手册必须分开写：**

| 事 | 今天（第 14 批之后） | 第 16 批起 |
| --- | --- | --- |
| 自己在开发路径写插件 | `import { t }`，`locales/<语言>.json`，`validate` 能查 | 同 |
| 打成沙箱包安装 | **不行**，被拒绝，错误写明原因 | 可以 |
| 内置插件的文字 | 继续用 `L`、`p.text` 和 `ui.messages`（决定 20），不写 `ui.locales` | `t`、语言文件 |
| 新文字用稳定键 | 要做。键写成 `<主人>.<位置>.<元素>` | 同 |
| 逻辑不依赖译文 | 要做 | 同 |
| 不把译文存进业务数据 | 要做 | 同 |
| 颜色字体只用语义变量 | 要做 | 同 |
| 没有页面的地方存 `TextRef` | 新合同里能用（T1）；现有记录第 16 批改 | 要做 |
| 给模型的内容跟语言 | 回复语言由平台给（T10）；Skill 分语言文件要等第 08 批合同 | 要做 |

**开工前检查里的规矩，今天就能遵守的才写「要做」，其余写「第 16 批起」。**

### 16.2 本批改什么（T9a、T9b）

**`skills/` 改动不能排在全量回归期间**（AGENTS「构建与测试」）。**`AGENTS.md` 和开发流程这几段全局规矩，T9b 开写时由主会话先拿草稿给用户看，文字经用户确认。**

| 位置 | 改什么 | 片 |
| --- | --- | --- |
| `skills/molis-plugin-dev/text-and-appearance.md`（新） | 一章：文字四类、语言文件、外观变量、内容语言，加第 16.1 节的表 | T9b |
| `skills/molis-plugin-dev/SKILL.md` | 「读哪份」加一行入口 | T9b |
| `skills/molis-plugin-dev/ui.md`「文案与 i18n」 | 不抄第二份，加一句指向新章，写明这一节是内置插件第 16 批之前的写法。`CHAPTERS` 只挂 `ui.md` 的「质量线」一节（`plugin-builder/skill.ts:17-20`），这里不在挂载范围 | T9b |
| `docs/platform/PLUGIN-DEVELOPMENT.md` | 加一节：怎样声明 `ui.locales`、`validate` 的错误怎么读、现在哪条路走得通 | T9b |
| `development-workflow.md` 第 4 节 | **新加第 15 项「文字与外观」，不并入第 12 项。** 比较过：第 12 项讲页面和外壳，给模型的内容语言放不进去，硬塞会让那一项读不清。全仓只有第 10.1 节第 1 行写死「14 项」，改一个数字。内容：新文字归谁、逻辑不依赖译文、不存译文、颜色字体只用语义变量、给模型的内容跟语言；按第 16.1 节标「今天」和「第 16 批起」 | T9b |
| `development-workflow.md` 第 10.1 节 | 第 3 行或第 6 行加一句评审要点，指向第 4 节第 15 项；保持六行，不加第七行 | T9b |
| `docs/prompts/repository-systematic-review.md` | 第 9 节（前端质感）加一条：文字、语言、外观变量；指向新章 | T9b |
| `docs/system/DEVELOPMENT-REQUIREMENTS.md` | 不改。它只管包 README「开发要求」的写法，文字规矩不在那一层 | |
| `AGENTS.md` | 「先读哪里」加一行。硬约束加一条窄的：「逻辑不依赖译文：不拿译文做判断，不把译文存进业务数据；后台工作存 `TextRef`。」SDK 共用工具枚举加文字工具 | T9b |
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

**手册实走（FSS-72，放 T9b）：** 一个没读过设计稿的独立代理，只给手册和公开两包，从空目录写一个带中英文的小插件，走开发路径跑起来。卡住的地方算手册缺陷，改手册再走一遍。做法参考 `tests/plugin-sample.e2e.test.ts` 的只装两包。

### 16.4 批次调整（主会话改批次文件）

| 批 | 要写什么 |
| --- | --- |
| `batches/14.md` | 交付项加 T9b、T10；「TextRef 先于 05② C-3」改成 C-2、P-1、C-3（第 15、32 行） |
| `batches/16.md` | 第 14 节的清单：脚手架、`generated-*.md` 与 `CHAPTERS`（要 `pnpm studio:replay`）、手册删旧写法、`translations.mjs` 适配（改门禁，先问用户）、内容翻译 |
| `batches/70.md` | 手册的大部分已前移；剩 `DESIGN.md` 的皮肤章节（核账第二节第 4 条）、个人助理的外观 Skill，以及交付前的全量核对 |
