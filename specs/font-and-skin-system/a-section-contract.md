# 字体、皮肤与语言系统：A 段合同设计稿

状态：设计稿，尚未实现（2026-11-07）；要用户定的事已全部定下（第 12 节），没有待定项。路线书第 14 批合同台写，写手拿它开工；合同代码按第 10 节单独开小 PR。代码依据是 main `88c713ba3`，只读核对，没有构建、没有跑测试、没有碰真实 Home。需求与总验收仍以[需求书](spec.md)为准，总体方案见[实现方案](implementation-plan.md)；两边与本文不一致的 A 段字段，以本文为准。

本批「做完基本看不到界面变化」。真实切换在第 16 批（[决定 20](../post-anticorruption-roadmap/reference/decisions.md#decision-20)）。下文凡是写「第 16 批」的段落只说明不留死路，不是 A 段要写的代码。验收编号在[需求书 §11](spec.md#11-验收标准) 的 FSS-42～FSS-68。

## 1. 设计目标

用户 2026-11-07 的方向，原话：「需要把字体皮肤语言建设成对业务逻辑最小干扰的横向平台能力，提供方便的注册管理和使用体系」。

下面把它拆成三块，每条都能验证。

### 1.1 使用：业务代码只碰这几样

业务页面只知道：**文字工具**（`t`、`format`）、**把它放进 HTML 的一个函数**（`textHtml`）、**语义颜色和字体角色**（CSS 变量）。别的都不知道。

今天的写法（简化自现有插件）：

```ts
// 服务端：L 是全局查表，语言藏在请求里
render() {
  return `<h2>${L("notes.main.title")}</h2>` + renderButton({ label: L("notes.main.add") });
}
// 浏览器：自己判断语言来格式化
const when = new Date(at).toLocaleString(host.locale === "en" ? "en-US" : "zh-CN");
host.showToast(host.translate("{count} {count|file|files}", { count }));
```

新写法。下面这段 A 段就能跑，组件板标本照抄（FSS-61）：

```ts
import { renderButton, textHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

// 服务端：ui 由平台给，已经绑好主人和语言
render(request, ui) {
  const { t, format } = ui;
  return `<h2>${textHtml(t("notes.main.title"))}</h2>`
    + renderButton({ label: t("notes.main.add") })
    + `<time>${textHtml(format.date(request.model.at, "datetime"))}</time>`
    + `<p>${textHtml(t("notes.main.saved", { count: request.model.saved }))}</p>`;
}
// 样式：只写语义变量，换皮肤不用动
.notes-title { color: var(--ink); font-weight: var(--weight-title); }
```

切语言时业务代码什么都不做：文字、日期、数字的绑定标记都由平台原地改掉（第 5 节 `applyTextBindings`），输入框内容、滚动、选区都不动。

一次性的场合（确认框、toast、写日志）没有节点可绑，写 `.text`：`showToast(t("notes.saved").text)`。

| 不许业务代码做的 | 怎样保证 |
| --- | --- |
| 读语言、皮肤、字体，写按语言或皮肤的分支 | `ui` 里只有 `environment` 只读快照，没有判断语言的写法也能写完页面；样例源码用断言查（FSS-62） |
| 订阅变化 | 只有要重新测量的终端、编辑器才听一个可选事件（第 4.5 节）；普通页面没有订阅 API |
| 不转义、不绑定就拼进 HTML | `BoundText` 没有 `toString()`，`${t("x")}` 显示 `[object Object]`，一眼能看出；`textHtml` 负责转义和绑定（FSS-61） |
| 把译文存进业务数据 | 整个对象塞进字符串字段会被动作 schema 拒绝；**`.text` 拦不住**，这一条靠评审。业务数据存键或原值 |
| 改动作的输入输出 | A 段不动任何动作；以后要给人看的字段才写 `TextRef`，业务字段不变 |
| 拼句 | 整句一个键带参数，不写 `t("a").text + "：" + title` |

现有插件一行不改：`render(request)` 照旧，多传的第二个参数它不读（第 8.3 节）。

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

随产品分发的资源只登记在 `packages/design-system/resources/registry.json`，字段见第 3.6 节。插件的语言文件不进这张表：它们的唯一声明是 Manifest，报告从内置目录投影，不抄第二份名单。

| 问题 | 答案 |
| --- | --- |
| 谁读 | 宿主资源适配器（启动时一次，定位字体与平台语言目录）；`packages/design-system` 的基线加载与 `fontFaceRules`；资源报告；测试 |
| 谁能改 | 只经 PR，文件归 D 轨。新增资源或一个资源涨超过 10 KB 按页面资源规则先问用户 |
| 缺失怎样被发现 | `tests/ui-resources.test.ts`：表里每行的文件或目录存在、字体的 sha256 相符、字体和素材的许可齐全；`resources/`、`fonts/` 下有文件而表里没有也失败。进 `tests/ci-product-subset.txt` |
| 超预算怎样被发现 | 能量到的路由继续由 `scripts/gates/page-assets.mjs` 只许变小；第 16 批开工前由单独的门禁 PR 改成算页面总数（第 9 节）。字节不存进表，由报告现算 |
| 发行物里有没有 | 同一测试核对包的 `files` 覆盖每行的 `path`；干净安装后文件可读（FSS-59） |

### 1.4 日常改动各动几处

每项越少越好。这张表就是注册管理「方便」的验收。

| 操作 | 动几处 | 跑什么 |
| --- | --- | --- |
| 改一句译文（插件或平台） | 1 处：语言文件那一行 | 不用跑。CI 解析全部语言文件 |
| 加一个键 | 默认语言必写，别的语言缺了只算覆盖率不阻断 | 插件作者跑 `molis-work-plugin validate` |
| 改一个颜色 | 1 处：皮肤文件 | 不用跑。改 Soft Workbench 的值 CI 会照常比页面资源 |
| 给插件加一种语言 | 2 处：`locales/<语言>.json`，Manifest 的 `available` 加一个词 | `validate` |
| 给平台主人加一种语言 | 1 处：语言目录里加一个文件 | 不用跑 |
| 加一个平台文字主人 | 2 处：语言目录，登记表一行 | 不用跑 |
| 加一款字体（先问用户） | 3 处：字体文件，字体方案，登记表一行（含 sha256、许可） | 报告脚本打印那一行的 sha256 |

**不用 `tooling/versions.json` 的 `carriers` 改这些 JSON。** 格式版本升一号时文件形状也变了，只改数字的工具帮不上忙；`scripts/gates/version-declarations.mjs` 也不读这些 JSON。解析器发现 `format_version` 不符就拒绝，CI 的解析测试会拦住。

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
- **查词按（主人，键）**，不再合成一张平面表（实现方案 §4.1）。两个插件最后一段相同也不互相覆盖；今天 `createPluginMessageStore` 的跨插件冲突检查随 C 段删。
- **参数名**是 `[A-Za-z_]\w*`，和 `message-declarations.ts` 的 `PLACEHOLDER` 一致。`{标题}` 这种中文占位符新语言包不收，旧的 `fillMessage` 到 C 段都还认（第 3.5 节）。
- **日期**：`at` 是 ISO 8601。带时区的按当前设置显示；只有日期（`2026-11-07`）的按字面显示，不换算时区，避免因时区差一天。`relative` 用 `Intl.RelativeTimeFormat`，`now` 由格式化工具传入，测试可固定。
- **上限**是 `TEXT_REF_LIMITS`，`PLUGIN_MESSAGE_LIMITS` 的 `keyLength`、`textLength` 改成取它，不留两个数。

**谁拒绝坏引用。** `TEXT_REF_SCHEMA` 挡不住 `{}`、`{ key, literal }`、只有 `fallback`、`{ literal, args }`、`{ name, kind: "number" }`（缺值）：`SandboxSchema` 没有联合，也没有最少属性数。所以：

| 入口 | 闸口 | 遇到坏引用 |
| --- | --- | --- |
| 动作输出（`summary`、`judgment`）、声明里的引用 | `ownedTextRef` 先跑 `textRefProblems`。这是这些位置的**唯一闸口**，schema 只挡 `owner` 和未知字段 | 抛 `ui.text_ref_invalid`（`defineErrorCodes("ui", …)`） |
| 内容包、Manifest（安装时） | `inspectBlueprint`、`parsePluginManifest` 调 `textRefProblems` | 拒绝安装 |
| 页面读（存下来的摘要、过期的引用） | `reader.say` | 不抛，显示 `common.text.unavailable` 并记一条问题，页面不因一句话坏掉 |

**查词顺序（读不到时绝不显示裸键或空白，FSS-34）：** 所选语言包 → 同语种基础语言（`zh-CN` → `zh`）→ 主人默认语言包 → `fallback` → 平台共有词 `common.text.unavailable`，同时记一条问题，可从读取器取回。只装两包的作者手上没有工作台语言包，这句也查不到，SDK 留最后一层常量 `UI_TEXT_UNAVAILABLE = "…"`。

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
| 「同一件事」，参数由页面填 | 15 第 7 节 | `OwnedTextRef` 少两个参数，页面调 `ui.say(ref, { extra })` 补上标题 | 组合服务 | 能。服务不读显示字段，所以要有 `extra` |
| `Blueprint.title` | 20 第 3 节 | `TextRef`，内容包不收 `literal`，草稿收 | 内容包的 `plugin_id`（安装记录）；草稿无主人 | 能。`inspectBlueprint` 调 `textRefProblems` |
| `connection.purpose`、`SettingEntryDeclaration.title`、`adopts[].title` | 20 第 3、4、8 节 | `TextRef` | 声明它的插件；系统提供方用登记里的 `text_owner` | 能 |
| `RoleTemplate.title`，采用时存成字符串 | 20 第 5 节 | 取 `.text`，语言来自调用上下文的 `locale` | 内容包 | 能。这是有意存字符串，说明见第 5 节 |
| 动作按钮 `action.<capability_id>.title` | 15 第 4.2 条、需求 §6.2 | **有冲突**，见下 | | 要改写法 |

**要改的地方（C-3 与 15 的写手照此改设计稿，本 PR 不改）：**

1. 05② 的 `label_key`、`note_key`、`title_key` 按上表换名和换类型。
2. 15 第 12 节第 6 条的 `reason?: string` 改 `reason?: TextRef`。
3. **`action.<capability_id>.title` 这种键过不了 `STABLE_KEY`。** `io.molis.work.example.notes.results.publish` 这样的能力 id 拼出来有 9 段，上限是 5 段，开头也不是主人名。FSS-40 本来就暂不实现，但 15 S-1 不要写死这个形状。推荐写法：`<主人名>.action.<能力 id 去掉插件前缀，点换连字符>.<部分>`，如 `notes.action.results-publish.title`。实现方案 §7.4 已同步改。

### 2.5 `TEXT_REF_SCHEMA`

平铺字段，组合规则由 `textRefProblems` 检查（第 2.3 节）。`additionalProperties: false` 让带 `owner` 的输出直接被 schema 拒绝。

```ts
const TEXT_ARG_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false, required: ["name", "kind"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 64 },
    kind: { type: "string", enum: ["text", "number", "date"] },
    text: { type: "string", maxLength: 2000 },
    number: { type: "number" },
    at: { type: "string", maxLength: 40 },
    style: { type: "string", enum: ["decimal", "percent", "compact", "date", "time", "datetime", "relative"] },
  },
};
export const TEXT_REF_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false,
  properties: {
    key: { type: "string", minLength: 3, maxLength: 120 },
    args: { type: "array", maxItems: 8, items: TEXT_ARG_SCHEMA },
    fallback: { type: "string", maxLength: 2000 },
    literal: { type: "string", maxLength: 2000 },
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

### 3.3 共同规格文件 `resources/interface.json`

```ts
export interface UiInterfaceSpec {
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
  readonly scope: "themed" | "shared" | "terminal";
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
  readonly locale: string;                     // zh、en、zh-CN；形状 ^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$
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
export type UiResourceKind = "spec" | "skin" | "font-scheme" | "locale" | "font" | "material";
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
  readonly sha256?: string;               // 只有 font、material 必填：第三方二进制，换了要看得出
  readonly license?: { readonly spdx: string; readonly source: string; readonly notice_path?: string };  // 只有 font、material 必填
}
export interface UiResourceRegistry {
  readonly format_version: /* @version format.ui.registry */ 1;
  readonly resources: readonly UiResourceRow[];
}
```

- **不存 `bytes`，JSON 不存 `sha256`。** 这些是文件事实的第二份：第 16 批工作台词典进语言文件后，每个改字的 PR 都要改登记表同一行，并行 PR 必然冲突；数字又是从文件算出来的，证明不了什么。预算要字节，报告现算。
- **`license` 只对字体和素材必填。** 自家 JSON 写 spdx 和来源纯属样板。
- **`route` 有两个读者。** `fontFaceRules` 从它写 `src: url(…)`；宿主的路由仍写在 `apps/local-host/src/web-assets.ts` 的字符串字面量里，因为 `scripts/gates/page-assets-measure.mjs` 读的就是这些字面量，改成查表它会拒绝。测试核对两边一致。
- **`kind` 会变多。** 第 16 批前的门禁 PR 要求第一屏资源都登记（第 9 节），届时加 `style`、`script`、`inline`、`startup-json`。这张表不进 Home，不算升格式版本。

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
| 语言（用户 2026-11-07 定：工作台一份，插件按需） | C 段把 `clientI18nScript`（`apps/workbench/src/i18n.ts:154` 起，把整本词典内联进 HTML）换成：工作台的词一个阻塞 `<script src="/assets/locale/workbench.<语言>.<摘要>.js">`；插件的词在打开它时取，同一屏的多个插件合成一次批量请求（N52），不按主人逐个发 | 字节搬到量得到、可缓存的地方；`L` 要同步可用，所以工作台那份阻塞。实测（`resource-budget.md` 第 4.2 节）：再次打开英文工作台从 2,573,362 B 降到 666,388 B |

### 4.5 iframe（第 16 批）

已核实：插件 frame 是不透明来源，CSP 写死 `connect-src 'none'`（`apps/workbench/src/browser/plugin-frame/document.ts:9`），只有 `/assets/` 下的样式和字体能加载；词今天经 `molis:plugin-connect` 消息一次性传入（`parent.ts:269`），传的是本插件的词加**整本页面词典**；`host.translate` 是 `(key, values) => string`（`child.ts:47-49`，`ui.ts:604`）；明暗密度由 `state` 消息同步（`parent.ts:148`）。

| 问题 | 答案 |
| --- | --- |
| 拉不了网，语言包怎么来 | `FrameConfig.messages` 换成 `environment: UiEnvironmentSnapshot` 和 `text: { owner; pack; shared }`，只带本插件的语言包和 `common.*`，不再带整本词典。子页面不发请求 |
| 切语言、切皮肤 | 父页面经已绑定的 `MessagePort` 发 `{ type: "environment", snapshot, text?, skin_href? }`。子页面换文字用 `applyTextBindings`，换皮肤换一个 `<link>`（`style-src` 已允许 `/assets/`）。来源校验就是这条端口本身，陌生窗口拿不到（FSS-08） |
| `host.translate` | A 段不动。B 段切片加 `host.ui: UiRenderTools`；C 段删 `translate`、`globalThis.L`、`molisFrameFillMessage`，所有调用改完，不留两条路（决定 20） |
| 设备偏好 | 只在浏览器。服务端快照 `device: null`；父页面已有的 `state` 消息继续送明暗密度，子页面调 `withDevicePreferences`。不新增第二条通道 |
| 字体 | `font-src` 已允许 `/assets/`，字体路径都在那下面。文件来自 `/assets/` 的字面路由，门禁量得到 |

**`molis-work:ui-environment-changed` A 段不登记。** A 段没有真实发送者和监听者：组件板的语言切换直接调函数，不走事件。`scripts/gates/dom-events.mjs` 会拦没人用的条目。第 16 批接文档控制器（发送）和终端重新测量（监听）的那一片，才在 `dom-events.ts` 登记并跑 `pnpm api:update`。

## 5. SDK `/ui` 工具清单

都加在 `packages/plugin-sdk/src/ui/` 下，`packages/plugin-sdk/src/ui.ts` 多几行 `export *`，不开新入口。不引 Node 内建模块，只用 `Intl`。`/ui` 现有注释说「no DOM and no dependencies」：绑定工具用结构类型（`UiBindingRoot`，只要 `querySelectorAll` 等几个方法），不写 `/// <reference lib="dom" />`，不污染 Node 用方的类型。`sideEffects: false` 加上不在模块顶层跑东西，现有插件包只引 `renderButton` 时不会变大，由 `page-assets` 门禁证明。

| 导出 | 文件 | A 段谁在用 |
| --- | --- | --- |
| `dateArg`、`numberArg` | `ui/text-ref.ts` | 样例、组件板。字符串和普通数字不用它们，`t(key, { title: "x", count: 3 })` 直接写 |
| `textRefProblems(value, { literal? })` | `ui/text-ref.ts` | `ownedTextRef`；`createTextReader`；CLI；之后的 05② `assertSurfaceDescription`、20 `inspectBlueprint` |
| `ownedTextRef(ref, owner)` | `ui/text-ref.ts` | `createUiTextTools`；之后的 15 组合服务 |
| `formatMessage`、`formatNumber`、`formatDate` | `ui/message-format.ts` | `createUiTextTools`；组件板 |
| `parseLocalePack` | `ui/locale-pack.ts` | `loadPluginLocalePacks`（plugin-runtime）；工作台语言文件；CLI |
| `inspectLocaleSet(packs, { default })` | `ui/locale-pack.ts` | CLI `validate`；`loadPluginLocalePacks`；组件板标本的问题列表 |
| `matchLocale(requested, available, fallback)` | `ui/locale-pack.ts` | `createUiTextTools`；组件板 |
| `createTextReader({ packs, locale })`、`createUiTextTools(reader, owner)`、`emptyUiTools(owner)` | `ui/text-reader.ts` | 宿主 `ui` 工具；组件板浏览器脚本；两包样例。`emptyUiTools` 给直接调贡献的测试和没有语言包的情况 |
| `bindUiContribution(contribution, owner, tools)` | `ui/text-reader.ts` | 宿主两个执行器（第 8.3 节） |
| `textHtml`、`textAttrs`、`applyTextBindings` | `ui/text-binding.ts` | 组件板（服务端出标记，浏览器切换）；样例；`renderButton` |
| `renderButton` 的 `label: string \| BoundText` | `ui/button.ts`（已有） | 第 1.1 节示例。A 段只改这一个部件，其余第 16 批改 |
| `parseStrictJson` | `ui/strict-json.ts` | 下面三个 `parse*`；`parseLocalePack`；CLI |
| `parseInterfaceSpec`、`parseSkinFile`、`parseFontScheme` | `ui/appearance-files.ts` | `packages/design-system` 基线加载；组件板 |
| `resolveSkin`、`skinTokenDeclarations` | `ui/appearance-resolve.ts` | `palette.ts` 等 |
| `resolveFontScheme`、`fontTokenDeclarations`、`fontFaceRules` | `ui/appearance-resolve.ts` | `typeface.ts` |
| `resolveUiEnvironment`、`withDevicePreferences` | `ui/environment.ts` | 宿主 `ui` 工具；组件板 |

**不在 A 段导出的**（没有消费者）：`formatList`（`listJoin` 到 C 段才换）、按声明查引用的 `inspectTextRefs`（15、20 的第一片带上）、动作文字键的拼法（FSS-40 暂不实现，只定写法）。

**作者工具与平台共用：** `inspectLocaleSet` 查缺键、多余键、参数不一致、缺复数形式、`hidden_number`，返回 `{ file, code, locale, key, reason, fix, blocking }[]`。默认语言缺键、参数不一致算 `blocking`，平台载入时拒绝；别的语言缺键不阻断，算覆盖率（FSS-34 可观察，FSS-37）。CLI 的 `validate` 调同一个函数，作者和平台看到一样的结果。

**文字工具的形状（在 `platform/ui-environment.ts`）：**

```ts
export type UiTextBinding =
  | { readonly kind: "ref"; readonly ref: OwnedTextRef }
  | { readonly kind: "format"; readonly arg: TextArg };   // 不带词的日期和数字
/** 没有 toString()：${t("x")} 显示 [object Object]，写错立刻看得见。一次性场合用 .text。 */
export interface BoundText { readonly text: string; readonly binding: UiTextBinding }
export interface UiFormatTools {
  date(at: string, style: "date" | "time" | "datetime" | "relative"): BoundText;
  number(value: number, style?: "decimal" | "percent" | "compact"): BoundText;
}
export interface UiRenderTools {
  t(key: string, args?: Readonly<Record<string, string | number | Omit<TextArg, "name">>>): BoundText;
  say(ref: OwnedTextRef, options?: { readonly extra?: readonly TextArg[] }): BoundText;
  readonly format: UiFormatTools;
  readonly environment: UiEnvironmentSnapshot;
}
```

**`format` 返回绑定值，不返回字符串。** 只有这样切语言时日期和数字才跟着变（FSS-35、FSS-39）；让作者把页面上每个日期都写成带键的 `t` 又太重。

**绑定的标记：**

```html
<span data-text-key="notes.main.saved" data-text-args='[{"name":"count","kind":"number","number":3}]'>3 saved results</span>
<time><span data-text-format='{"name":"at","kind":"date","at":"2026-11-07T10:00:00Z","style":"datetime"}'>Nov 7, 2026, 6:00 PM</span></time>
<button data-text-attrs='{"aria-label":{"key":"notes.main.add"}}' aria-label="Add">…</button>
```

`applyTextBindings(root, readerFor)` 一次扫完。只改这个元素自己的文字节点（元素有子元素就跳过并记问题，不覆盖）；属性只认 `aria-label`、`aria-description`、`title`、`placeholder`、`alt`；从不写 `value`，从不用 `innerHTML`。它不登记节点、不开 Observer，所以没有东西要释放，卸载的节点自然不在了（实现方案 §6 担心的全局 Observer 持有被卸载节点，这样就不存在）。代价是切语言时每个根扫一次，切语言很少。

**一屏多个主人（15 的首页）。** 查词的主人取**最近的** `data-text-owner`。

| 谁写 | 写在哪 |
| --- | --- |
| 平台挂载代码 | 挂载根上写一个，是这个插件自己。第 16 批写在 `renderStagePage` 的页面外壳上；A 段只有组件板标本写 |
| `textHtml` | `t` 的结果不写，省字节。`say` 的引用主人和工具的主人不同时才写在这个元素上：只有平台的工具能这样，组合页就是平台在画 |
| 插件的 `say` | 只收自己和 `common` 的引用，别人的抛 `ui.text_owner_denied` |

**防冒充在同文档页面也要成立：** `bindUiContribution` 检查 `render` 的结果，出现不等于自己的 `data-text-owner` 就抛 `ui.text_owner_forged`，这一页按现有的页面出错路径显示不可用。内嵌子插件的字符串是平台拼进来的，检查前先去掉 `model.nested` 里的内容。iframe 里读者只有本插件和 `common` 的词，伪造也查不到。

存字符串的例外只有 20 的 `RoleTemplate.title`：采用时写进用户自己的草稿，归用户所有，之后不随语言变（场景设计稿已定）。

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
export function loadPluginLocalePacks(manifest: PluginManifest, read: (path: string) => string | null): PluginLocalePacks;
```

逐个读 `locales/<语言>.json`，`parseLocalePack`；`pack.locale` 不等于文件名、`pack.owner` 不等于 `manifest.plugin_id` 就拒绝；`inspectLocaleSet` 有 `blocking` 就拒绝。`read` 由来源给，这样只有一套规则：

| 来源 | `read` 从哪来 | 哪一片 |
| --- | --- | --- |
| 本地开发（`molis-work plugin dev`，样例走这条） | 新函数 `loadDevelopmentLocalePacks(directory, manifest)`，放在 `development-loader.ts`，读项目目录 | A。**这是 A 段唯一真实可走的路** |
| 打包（`molis-work-plugin pack`、`validate`） | `packPluginProject` 按 Manifest 自动把声明的文件加进 `files`（`packageFileReader` 只收逐个写明的普通文件，这里正好逐个写）；`parsePluginPackage` 核对声明的文件都在，和入口文件同样处理（`package-verification.ts:50-54`） | A。带 `ui.locales` 的包能打、能校验，装不上（见下） |
| 外部安装（沙箱包） | 见 6.3 | 第 16 批 |
| 内置插件 | 登记上的 `package_name` 解析到包目录，包的 `files` 加 `locales` | 第 16 批。A 段没有内置插件声明，写了就是死代码 |

A 段写了 `ui.locales` 的沙箱包，被 `readSandboxPackage` 的「包里有格式之外的文件」拒绝，这是现成的明确错误，不用加代码。

**A 段不加 `locale_packs`，也不碰发行物。** `createPluginRuntimeReleaseArtifact` 只有内置插件在用，内置插件 `directlyUsable` 恒真，走当前构建，从不恢复存档；已有行还 `ON CONFLICT DO NOTHING`。外部包不进这张表。所以这个字段没有写入者也没有读取者。

**不把译文内联进 Manifest。** 看起来最省事（`ui.messages` 就是这样），但 N50 已测出冷启动 Manifest 摘要算三遍、`canonicalJson` 递归 31 万次，内联词典会把它放大；Manifest 还到处被复制。

### 6.3 第 16 批外部包走哪条路

不留死路，也不需要新表、新列或发行物字段：

1. **打包。** `pack-sandbox` 按 `sandboxPluginManifest` 的 `ui.locales` 逐个读 `locales/<语言>.json`，放进 `payload.files`，在签名范围内。
2. **读包。** `readSandboxPackage` 的 `wanted` 名单加上这些路径；调 `loadPluginLocalePacks(manifest, path => files.get(path))`；结果放进 `SandboxPackage`。
3. **存包。** `SandboxPackageStore.save` 不用改：它把整份已签名的包存进 `BUNDLE_FILE`，`load` 时重新验签再 `readSandboxPackage`，语言文件跟着回来。
4. **上线。** `packagedRelease` 把结果交给 `PluginHostExecutorOptions.localePacks`，后面和 A 段开发路径同一条（第 8.3 节）。
5. **创作台。** `studio-release.ts` 的 `RELEASE_FILES` 加上这些路径。
6. **iframe。** `FrameConfig.text` 只带本插件的那份（第 4.5 节）。

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
    interface.json
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

1. 服务端用 `createUiTextTools` 按 `apps/workbench/resources/locales/` 的词，照抄第 1.1 节的写法写出带绑定标记的 HTML（宿主消费者）。
2. 浏览器里一个语言切换，调 `applyTextBindings` 换文字、日期、数字和属性，不整页刷新；旁边一个输入框证明内容不丢（浏览器消费者）。
3. 同屏放两个主人，切换时各查各的词；显示 `resolveUiEnvironment` 的结果，服务端和浏览器各算一份并比较。
4. 列出 `parseSkinFile` 对几份坏文件的问题（重复键、CSS 文本、外部 URL、写了 `locked` 角色），这是组件板看得见的校验。

组件板没有开关，路由在发行物里也有（`apps/local-host/src/web-catalog-board.ts`、`web-routing.ts:42`），所以 `resources/` 要随包。它是开发工具，单独不算真实入口，所以和基线、两包样例一起算。

### 8.3 宿主给插件的 `ui` 工具

组件板只证明平台自己能用。插件要读到文字和快照，需要一个平台给的入口。

**真实页面不走 `UiHost`。** `supervisor.contribution().views` 拿到的是裸贡献，由 `home-plugin-http.ts:121,305`、`project-plugin-stages.ts:138,188,286`、`plugin-stage-fragment-http.ts:63`、`declared-stages.ts:101` 直接调 `view.render(request)`。这些地方都不改，所以工具不能在画页时传，要在**贡献进平台的入口绑定一次**。

**合同只多一个可选参数：**

```ts
// platform/ui.ts
export interface UiContribution<TModel = unknown> {
  readonly descriptor: UiContributionDeclaration;
  render(request: UiRenderRequest<TModel>, ui?: UiRenderTools): string;
}
```

为什么可选：用户同意并存的前提是「现有插件不动」（第 12 节第 4 条）。必填的话，现有的调用方和 9 个直接调贡献的测试文件都要改；可选之后这些地方一行不改，`OwnedUiContribution`、`ownedContribution` 也不改。新写法的作者照样写必填：`render(request: UiRenderRequest<M>, ui: UiRenderTools)`。`render` 是方法声明，参数按双向比较，这样写能赋给上面的类型（我用 scratch 文件跑 `tsc --strict` 核过四种写法，没有在仓库里跑）。没绑定就调新写法的贡献，`ui` 是 `undefined`，立刻抛错；测试写 `bindUiContribution(view, owner, emptyUiTools)`。

**绑定只有两个入口，都在宿主：**

| 入口 | 位置 | 改法 |
| --- | --- | --- |
| 插件 `start()` 返回的 `views` | `apps/local-host/src/plugin-executor.ts:157`、`home-plugin-executor.ts:172` | 拿到结果后，把 `views` 逐个换成 `bindUiContribution(view, plugin_id, tools)`，之后交给 runtime 的就是绑好的 |
| `services.ui.register` | `packages/ui-host/src/plugin-client.ts:40` | `PluginUiViews` 加可选的 `bind`，由 `plugin-host-services.ts:73`、`home-plugin-executor.ts:95` 传入。`ui-host` 只依赖 contracts，所以不直接引 SDK |

```ts
export function bindUiContribution<T>(contribution: UiContribution<T>, owner: string, tools: () => UiRenderTools): UiContribution<T> {
  return { descriptor: contribution.descriptor, render: request => refuseForgedOwner(contribution.render(request, tools()), owner, request) };
}
```

`owner` 是平台从 Manifest 拿的 `plugin_id`，插件改不了。`tools()` 每次画页时取，所以语言跟着当前请求（`pageLocale()`）。`PluginRuntime` 默认的 `NativePluginExecutor` 不绑：它只在没有 Host 的测试里用，真实路径都是上面两个执行器。

**语言包谁灌、谁删。** 新文件 `apps/workbench/src/plugin-text.ts`，存各主人的语言包，工具对象按（主人，语言，登记序号）记住，宿主两个执行器从 `@molis-ai/molis-work-app-workbench` 引用（`home-plugin-executor.ts:43` 已这样引 `withPluginWords`）：

| 时机 | 谁 | 做什么 |
| --- | --- | --- |
| 会话打开 | `openHostSession`、Home 执行器 | `options.localePacks?.(definition)` 有内容就 `registerPluginText(plugin_id, packs)`，拿到一个撤回函数 |
| 会话释放（停用、撤权、升级前的旧会话） | 同一处的 `dispose` | 调撤回函数。只删自己这次的登记：同一插件在几个项目里各有一次会话，互不影响 |
| 卸载 | 卸载先停，走上一行 | 不另写 |
| 升级 | 新会话登记，序号变，记住的工具对象失效 | 所以插件升级后不重启进程也不会留旧词 |

`PluginHostExecutorOptions.localePacks` 是可选的。A 段只有 `runPluginDevelopment` 传（`plugin-development.ts:14`，用 `loadDevelopmentLocalePacks`）；第 16 批沙箱包和内置插件各传各的。今天的 `registerPluginMessages` 不一样：它在 `plugin-platform.ts:249` 只登记，生产代码里没人删（`unregisterPluginMessages` 只有测试调）。新路径不沿用。

现有插件 `options.localePacks` 不给，`render(request)` 不读第二个参数，所以行为不变；`bindUiContribution` 多包一层函数，画页多一次调用，不读文件、不开库。

### 8.4 两包样例

`examples/plugin-sample`、`tooling/plugin-cli` 的 `create` 模板、`tests/plugin-sample.e2e.test.ts`：

1. **声明：** `manifest.json` 加第 1.2 节的 `ui.locales`；加 `locales/en.json`、`locales/zh.json`。`package.json` 的 `files` 不用动：`pack` 自动带（第 6.2 节）。测试把样例拷到临时目录的那一行（RAC-553 上面）要多拷这两个文件。
2. **校验：** `molis-work-plugin validate` 调 `inspectLocaleSet`，改坏一个占位符应失败。
3. **运行：** `render(request, ui)` 用 `ui.t("notes.main.saved", { count })`。现有断言 `/Saved results: 1/` 不动（`en.json` 就写这句，`Saved results: {count}`），另加一行单复数，并在 `zh` 下断言中文。
4. **只装两包：** 现有用例已经用 `npm install` 只装 contracts 和 SDK 后起子进程（`tests/plugin-sample.e2e.test.ts` 的 RAC-553 那段）。在同一段加：导入 `parseLocalePack`、`createTextReader`、`resolveUiEnvironment`、`parseSkinFile`（规格用一份内联的最小样本，作者拿不到私有 design-system），跑通并打印结果；再用 `esbuild --platform=browser` 打一次 `/ui`，有 Node 内建模块就失败。
5. **业务代码不碰语言：** 断言 `index.mjs` 源码里没有 `currentLocale`、`navigator.language`、`data-resolved-theme`、`data-skin`。

样例走 `services.ui.register`，证明不了真实页面。所以另加一个用例：临时 Home 里一个带 `ui.views` 的夹具插件，经 `createPluginPlatform` 启动，走 `renderStagePage` 画出来，断言读到了自己的词（FSS-60）。

### 8.5 字体路径

`apps/local-host/src/web-assets.ts:14-19` 写死 `../../../packages/design-system/fonts/…`。发行物里没有这个相对层级，**读代码判断应是 404（没有起服务实测）**；系统字体排在前面，所以平时看不出。改成 `interVariableFontFilePath()`、`notoSansScFontFilePath()`（`typeface.ts:19,23`，`local-host` 已依赖 design-system）。路由字面量 `"/assets/inter-latin-variable.woff2"` 保留（第 3.6 节）。写进基线那一片，并补干净安装后路由能读到的测试（FSS-59），先把现状跑出来证明确实是 404，再改。

## 9. 资源预算的接口

实测与预算方案在 `specs/font-and-skin-system/resource-budget.md`（分支 `claude/14-resource-budget`），本文不写，只定怎样接。字段以本文为准，那边第 6 节写明了「字段名以合同定稿为准」。

**用户 2026-11-07 选了方案二：** 每次改代码，自动起一个真实服务（不开浏览器），算主要页面第一次和再次打开共下载多少，只许变少，**不设绝对上限**；第一屏资源都要登记。这是改门禁，**第 16 批开工前单开门禁 PR 落地，不和功能混，A 段不做**。那边第 7 节「上限怎样定」的表因此不用。

| 预算方案的字段 | 这里怎样接 |
| --- | --- |
| `id`、`kind`、`owner`、`load`、`license` | 就是登记表的字段。`load` 取那边的 `first-screen`、`fallback`、`on-open`、`on-select`，加上 `startup`、`tool`。`kind` 的 `interface-spec` 这里叫 `spec` |
| `origin` | 合进 `license.source` |
| `path`、`source` | `route`、`package`＋`path` |
| `bytes`、`gzip` | 不存，报告从文件现算。方案二比的是真实响应对 merge-base，不需要存下来的数 |
| `gated` | 不存，报告对照 `page-assets` 的路由算 |
| `style`、`script`、`inline`、`startup-json` | 门禁 PR 加进 `kind`（第 3.6 节） |

- **插件语言文件**由报告从内置 Manifest 投影，和表合起来出同一张账，不抄进表。
- **报告只有一份。** `scripts/first-screen-report.mjs`（预算分支带来）加 `--resources`，读登记表、打印每行的字节和 sha256，不失败，不是门禁。那个分支合入之前没有消费者，所以放在 T9。
- **已知盲区**（`resource-budget.md` 第 5 节逐入口列了）：门禁只量 `/assets/` 字面路由和内置包；HTML 内联（最大是英文页词典，`apps/workbench/src/i18n.ts:154`）、`/api`、英文变体、外部插件都没量。A 段不往这些地方搬字节，也不改门禁。

A 段的页面资源影响：基线内容不变；SDK 新工具不进现有包（第 5 节，门禁证明）；组件板是内联的开发页；字体路径修复不改字节。所以 **A 段不需要新增资源，也不需要增长许可**。若实现时门禁显示某资源变大，停下来，不写许可。

## 10. 片与 PR 序列

C1 独占合同文件和 `tooling/gates/api/`；D 独占 `packages/design-system`、`packages/plugin-sdk/src/ui.ts`、`ui.ts`。合同先单独开小 PR。开写之前读 #1743 最新评论，开 PR 前再查一遍同快照的在途 PR。

**排队（用户 2026-11-07 同意本批插队）：** 快照是生成物，冲突是机械的，后合入的重新生成。

| 占用 | 怎么办 |
| --- | --- |
| `api/contracts/platform/ui.txt`：T1、T2 与 #1846 | T1 先于 #1846，不等它；#1846 合入前重新生成 |
| `api/plugin-sdk/ui.txt`：T4、T5 与 #1872 | T4、T5 先于 #1872，不等它；#1872 合入前重新生成 |
| 同一份：T4 与 #1913（第 05 批，开着） | T4 开工时看它合了没有；没合就按同样办法处理，并在 #1743 说一声 |
| `api/contracts/platform/plugin.txt`：T3 与 #1879（第 18 批）、02 批 N39 | T3 开工时看 #1879 合了没有，先后由主会话裁定；N39 是生成文件，谁后合谁重新生成（#1743 11-07） |
| `packages/design-system/src/styles/craft-finish-bar.ts`：T6 与 #1867 | 不是生成物，T6 开工时看它合了没有，没合就按它的改动合并 |

**合审（用户 2026-11-07 定）：** 公共合同台、D 轨没回音时，本批的合同 PR 和组件板新增由没碰过它的子代理合审；它们回来有意见照样处理。

| 片 | 做什么 | 动的文件与快照 | 前置 | 验收 | 写手模型 |
| --- | --- | --- | --- | --- | --- |
| T1 合同① `TextRef` | 第 2 节的类型与 schema | `platform/ui-text.ts`（新）；`ui.ts` 一行 `export *`（D 文件，D 评）；`api/contracts/platform/ui.txt` | 本设计稿合入 | FSS-42、FSS-45 | Opus 5.5 high |
| T2 合同② 文件与快照 | 第 3、4 节的类型；第 5 节的文字工具类型；`UiContribution.render` 的可选参数；`versions.json` 五个条目 | `platform/ui-files.ts`、`ui-environment.ts`（新）；`ui.ts`；`tooling/versions.json`；`api/contracts/platform/ui.txt` | T1 | FSS-46（类型部分） | Opus 5.5 high |
| T3 合同③ Manifest | `ui.locales` 类型与解析 | `plugin-manifest.ts`；`packages/plugin-sdk/src/manifest.ts`；`api/contracts/platform/plugin.txt` | 见排队表 | FSS-52 | Opus 5.5 high |
| T4 SDK 文字工具 | `text-ref`、`message-format`、`locale-pack`、`text-reader`、`text-binding`、`renderButton` 接 `BoundText`；`error-owners.json` 加 `ui` | `packages/plugin-sdk/src/ui/*`、`ui.ts`；`api/plugin-sdk/ui.txt` | T1、T2（文字工具类型）；排队表 | FSS-43、44、47、48、50、51 | Opus 5.5 high（SDK 共享核心，统筹加全量） |
| T5 SDK 文件工具 | `strict-json`、`appearance-*`、`environment` | 同上快照 | T2、T4 | FSS-46、48、49、57 | Opus 5.5 high |
| T6 基线与字体路径 | 第 7 节全部、第 8.1、8.5 节；同一 PR 改 `docs/SSOT-MATRIX.md` 的「`palette.ts` 唯一来源」、design-system README 的「开发要求」和 `page-clients.ts` 头部，否则文档到 T9 之前都是错的 | `packages/design-system/{resources,src/baseline.ts,src/palette.ts,src/typeface.ts,src/styles/foundation.ts,src/styles/craft-finish-bar.ts,package.json,README.md}`；`apps/local-host/src/web-assets.ts`；`docs/SSOT-MATRIX.md`；测试与夹具 | T5；排队表 | FSS-54、55、56、58、59 | Opus 5.5 medium；占 build 槽位 |
| T7 语言文件读取 | 第 6.2 节 A 段那两行；CLI `validate`、`pack` | `packages/plugin-runtime/src/{locale-packs,package-verification,development-loader}.ts`；`tooling/plugin-cli` | T3、T4 | FSS-53 | Opus 5.5 high |
| T8 消费者 | 第 8.2、8.3、8.4 节 | `packages/ui-host/src/plugin-client.ts`；`apps/workbench/{src/plugin-text.ts,src/browser/board/environment-section.ts,resources}`；`apps/local-host/src/{plugin-executor,plugin-host-services,home-plugin-executor,plugin-development}.ts`；`examples/plugin-sample`；`tooling/plugin-cli/src/create.ts`；`tests/plugin-sample.e2e.test.ts`。现有插件和画页的地方不动；若 `tsc` 或测试显示要动，**停下交回主会话**（第 12 节第 4 条） | T6、T7 | FSS-60、61、62、63、64 | Opus 5.5 medium；占 browser 槽位 |
| T8b 组件板三样 | 外观卡、样张卡、换外观的淡入，依据 `docs/design/appearance-selection/README.md`「组件板新增」：定样记录写明要先有标本才写产品代码。样式只进组件板，算不上页面资源增长（照 #1913）；部件的渲染函数不进 SDK，第 16 批做设置页时再提升，所以不占 `api/plugin-sdk/ui.txt`。样张卡用真实基线解析出来的令牌画，不写假值。#1795 共审留给第 16 批的三条小修（样张主按钮的键位提示、390 宽代码行截断、原型角标）不进这片 | `packages/design-system/src/primitives/catalog.ts`、`packages/design-system/src/browser/catalog.ts` 与组件板样式 | T6；与 T8 同碰组件板这两个文件，串行 | FSS-66、67、68 | Sonnet 5.5 xhigh；D 轨合审，没回音由没碰过这片的子代理代看 |
| T9 文档与账本 | 报告；`docs/platform/UI-PLATFORM.md`；SDK README「开发要求」；`docs/system/GLOSSARY.md` 加文字引用、语言包、字体方案、展示快照 | 文档；`scripts/first-screen-report.mjs` | T8；`resource-budget.md` 合入 | FSS-65 | Sonnet 5.5 high |

**先后：** T1 → T2 → T4 → T5 → T6；T3 → T7（T4 也要）；T6、T7 → T8 → T9；T6 → T8b，和 T8 串行，先后不限。同一时间最多 3 个写手，T1 与 T3 同归 C1 但快照不同，可以并行；T4、T5 同一快照串行。T4 前置 T2，是因为 `createUiTextTools` 返回 T2 定的 `UiRenderTools`。

**给别批的：** 05② C-3 的合同只等 T1；它的 SDK `assertSurfaceDescription` 要 `textRefProblems`，等 T4。15 S-1 同样。20 P-1 的合同只等 T1，`inspectBlueprint` 等 T4。

验证：每片 `node scripts/affected-tests.mjs` 挑用例，`node scripts/run-tests.mjs --jobs 1`，走机器槽位；全量由统筹加。T4、T5、T7 碰共享核心。

## 11. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 定义正文归文件；A 段的文件归发行物（design-system、workbench、各插件包）。语言偏好仍归入口 Cookie，设备偏好仍归浏览器。Home 选择归 B 段的新服务。快照、解析结果是投影，不是事实。`docs/SSOT-MATRIX.md` 的「`palette.ts` 唯一来源」改成皮肤文件（T6） |
| 2 | 插件同等待遇 | 内置和外部同一个 `ui.locales`；`loadPluginLocalePacks` 一套规则；`ui` 工具对所有插件一样。来源不同只是 `read` 不同。没有宿主私路 |
| 3 | 能力注册 | A 段不加动作，不碰动作目录；`pnpm actions:update` 应无变化。主人取自 Manifest 和可信登记 |
| 4 | 合同 | 改：`platform/ui`（三个新文件、`render` 一个可选参数）、`platform/plugin`（`ui.locales`）、SDK `/ui`。阶段一，不留兼容期。可选参数让现有插件和调用方不用改，所以 T2 单独能编译过，不需要和调用方绑在一个 PR。合同先单独开 PR（T1～T3） |
| 5 | 放在哪个包 | 合同在 contracts；工具在 SDK `/ui`（只依赖 contracts，无 Node 内建）；基线在 design-system（读文件）；语言文件读取在 plugin-runtime；A 段不加新包。**B 段的外观主人按用户 11-01 的规定进 `horizontal/` 新包，不进实现方案写的 `apps/local-host/src/interface/`**，方案已加注 |
| 6 | 表与存储 | 不加表，不改库结构，不碰发行物（`artifact_json` 不变）。第 16 批外部包走已签名的包文件（第 6.3 节），同样不用新表 |
| 7 | 兼容与迁移 | 不加。`ui.locales` 与 `ui.messages` 同写拒绝，没有翻译器读两种。`literal` 是语义不是兼容 |
| 8 | 安全边界 | 不碰回环、令牌、动作网关、MCP、桌面 IPC。相关的三点：① 文字冒充（主人不从声明读、前缀规则、伪造 `data-text-owner` 被拒），FSS-42、43、60 断言拒绝；② 不可信文件（重复键、危险属性名、CSS、外部 URL），FSS-46 断言拒绝；③ 译文和参数经 `textHtml` 转义，绑定不用 `innerHTML`，FSS-61 断言。是否进 `docs/system/SECURITY-INVARIANTS.md` 由 T4 写手按该文件规则加一行（语义 ID），评审确认 |
| 9 | 调用次数 | 见下表 |
| 10 | 升级与数据 | A 段不写 Home。统一起点已登记（#1914），但没有改库或带版本文件的结构。文件格式 `format.ui.*` 进 Home 是 D 段的事，到时按 `VersionedFile` 走升级链 |
| 11 | 成果与过程项 | 配置不进成果库（需求 §3.1） |
| 12 | 页面与外壳 | 不出新页面，组件板加一节开发标本。不登记 DOM 事件（第 4.5 节）。页面资源无增长（第 9 节）。标本是开发工具，不算定样，没有新组件 |
| 13 | 错误 | `defineErrorCodes("ui", …)`，`error-owners.json` 加 `ui` 一条，路径只含新文件。不写 Error 子类。报错带文件和下一步（第 3.1 节） |
| 14 | 冲突面 | C1：`platform/ui-*.ts`、`plugin-manifest.ts`、`plugin-runtime`、`api/`。D：`design-system`、`plugin-sdk/src/ui.ts`、`ui.ts`。枢纽：`tooling/versions.json`、`error-owners.json`、`ci-product-subset.txt`。在途：#1846、#1872、#1879、#1867、#1913，处理见第 10 节排队表。`apps/local-host/src/web-assets.ts`、`plugin-frame` 不归独占轨道 |

**调用次数（N42～N56 的口径：一次操作几个请求，每个请求几遍目录发现、几次授权核对、开几次库、读几次文件；按缓存过期后的真实成本算）。**

| 操作 | 请求 | 目录发现、授权核对 | 开库 | 读文件 |
| --- | --- | --- | --- | --- |
| **A 段**：进程启动 | 0 | 0 | 0 | 基线 4 个 JSON，各 1 次（模块初始化） |
| **A 段**：打开任一页面 | 比现在多 0 | 比现在多 0 | 比现在多 0 | 0。CSS 内容不变 |
| **A 段**：一次 `render` | 0 | 0。主人是已知的 `plugin_id` | 0 | 0。工具对象按（主人，语言，登记序号）记住，第二次起不重建 |
| **A 段**：插件开发启动（只有 `plugin dev`） | 0 | 0 | 0 | 声明几种语言读几个文件，各 1 次 |
| **A 段**：打开组件板 | 1 | 0 | 0 | 工作台语言文件 2 个，首次读后记住 |
| **第 16 批**：首屏，Soft Workbench | 比现在多 1（工作台的语言脚本），再次打开是 304。`/assets/` 现行缓存头是 `max-age=0` 加 ETag（`resource-budget.md` 第 2 节） | 0。快照由 Home 选择的内存投影算，不走 `localWebActionContext`（N42） | 0 | `state.json` 只在选择变化后读 1 次 |
| **第 16 批**：首屏，其他皮肤 | 再多 1（皮肤 CSS）；字体最多 2 个，只在选用时 | 同上 | 0 | 同上 |
| **第 16 批**：打开一个插件 | 同一屏的插件词 1 个批量请求（N52）；iframe 的词随配置来，0 个 | 0 | 0 | 每个主人每种语言第一次用到读 1 次，之后走内存；没用到的语言不读 |
| **第 16 批**：切皮肤，发起窗口 | 1 个写动作，共用 1 份上下文 | 1 遍 | 0 | `state.json` 读写各 1 |
| **第 16 批**：切皮肤，别的窗口 | 经已有推送通道收 1 条失效信号，取快照 1 个；iframe 0 个（`connect-src 'none'`，走端口），只换 `<link>` | 0 | 0 | 0 |
| **第 16 批**：切语言 | 1 个写 Cookie；工作台语言脚本 1 个；本页插件的词 1 个批量请求（N52）；iframe 0 个 | 0 | 0 | 同「打开一个插件」 |
| 后台 | 0。不轮询，不定时（N54），隐藏的窗口回到前台才重读 | 0 | 0 | 0 |

没有短 TTL 缓存（N55）：资源按摘要命名，内容变了地址就变；投影按版本失效。一次切换不进模型，不按插件各读一遍（FSS-20）。调用预算用例（N56）另有主人；A 段的 FSS-63 自己断言上面前四行。

## 12. 用户定的事

用户 2026-11-07 用弹窗全部定了，**没有待用户定的事项**。决策记录在[需求书 §12](spec.md#12-决策记录)。

| # | 事 | 选了 | 否掉 | 在本文 |
| --- | --- | --- | --- | --- |
| 1 | 页面下载量的检查（决策第 23 项其余部分） | 真打开一遍算总数（预算方案二）：起真实服务、不开浏览器，算主要页面第一次和再次打开共下载多少，只许变少，不设绝对上限，第一屏资源都登记。第 16 批开工前单开门禁 PR，不和功能混，A 段不做 | 只在代码里查名单（查不出网页本身变大）；每次真开浏览器（慢、易误报） | 第 9 节 |
| 2 | 语言目录 | 工作台一份，插件按需；第 16 批带实测按类一次批准，不逐个问 | 每种语言一个大文件（每页仍下发全部插件的词） | 第 4.4 节 |
| 3 | 候选字体 | 批准下载实测，结果写进 `resource-budget.md`，本文不写字节 | | 第 3.4 节 |
| 4 | 新旧写法并存（决定 20） | 并存到第 16 批，不算违反：一个插件只能写一种，只有样例用新写法，现有插件不动；断言 C 段之前内置插件不写新写法。插件绘制入口多的工具对象也在这条里，用户是按「现有插件不动」同意的 | | 第 6.1、8.3 节 |
| 5 | 合审 | 公共合同台、D 轨没回音时，由没碰过它的子代理合审；它们回来有意见照样处理 | | 第 10 节 |
| 6 | 排队 | 本批插队：T1 先于 #1846，T4、T5 先于 #1872，它们之后合入前重新生成快照 | | 第 10 节 |

## 13. 验收标准

A 段的验收写在[需求书 §11](spec.md#11-验收标准) 的 FSS-42～FSS-65，那里才是检查（`scripts/check-spec-coverage.mjs` 只读 `spec.md`）和测试引用的地方。测试只写真正证明了的编号；A 段为 FSS-09、FSS-34、FSS-35 等打基础，但不证明它们在全部入口成立，**测试不写这些旧编号**，否则报告会显示假覆盖。

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
| FSS-58 | 登记表对磁盘 | T6 |
| FSS-59 | 干净发行物里基线和字体可读 | T6 |
| FSS-60 | 真实画页路径拿到工具，冒充被拒，灌入与撤回 | T8 |
| FSS-61 | 组件板标本切语言，写错一眼看见 | T8 |
| FSS-62 | 两包样例 | T8 |
| FSS-63 | 调用次数 | T8 |
| FSS-64 | 现有页面无变化，现有插件和调用方没改 | T8 |
| FSS-65 | 文档 [人工] | T9 |
| FSS-66 | 外观卡 | T8b |
| FSS-67 | 样张卡用真实基线令牌 | T8b |
| FSS-68 | 换外观的淡入 | T8b |

## 14. 第 16 批要接着做的（从这份合同看到的）

- 门禁 PR：页面总数，第一屏资源登记（第 9 节），开工前单开。
- 字体方案加字号、行高、长文阅读、说明文字（第 3.4 节）。
- `PLUGIN_COMPONENTS` 搬进共同规格（第 3.3 节）。
- `ActionLocale = "zh" | "en"`（`actions.ts:80`）与 `WebLocale`、`WEB_LOCALES` 写死两种语言，要改由语言描述驱动。
- 内置插件和沙箱包的语言文件（第 6.2、6.3 节）。
- `FrameConfig` 与 `host.ui`（第 4.5 节）；登记 `molis-work:ui-environment-changed`。
- `renderStagePage` 的页面外壳写 `data-text-owner`（第 5 节）。
- `renderButton` 之外的部件接 `BoundText`（第 5 节）。
- #1795 共审留下的三条小修：样张主按钮的键位提示、390 宽代码行截断、原型角标。
- `render` 的可选参数在 C 段所有插件切完后改成必填，消费者同 PR 改完。
