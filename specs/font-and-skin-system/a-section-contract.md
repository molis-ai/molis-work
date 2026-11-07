# 字体、皮肤与语言系统：A 段合同设计稿

状态：设计稿，尚未实现（2026-11-07）。路线书第 14 批合同台写，写手拿它开工；合同代码按第 10 节单独开小 PR。代码依据是 main `8d8aa76a6`，只读核对，没有构建、没有跑测试、没有碰真实 Home。需求与总验收仍以[需求书](spec.md)为准，总体方案见[实现方案](implementation-plan.md)；两边与本文不一致的 A 段字段，以本文为准。

本批「做完基本看不到界面变化」。真实切换在第 16 批（[决定 20](../post-anticorruption-roadmap/reference/decisions.md#decision-20)）。下文凡是写「第 16 批」的段落只说明不留死路，不是 A 段要写的代码。

## 1. 设计目标

用户 2026-11-07 的方向，原话：「需要把字体皮肤语言建设成对业务逻辑最小干扰的横向平台能力，提供方便的注册管理和使用体系」。

下面把它拆成三块，每条都能验证，编号在第 13 节。

### 1.1 使用：业务代码只碰三样东西

业务页面只知道三样：**文字引用**（`t`）、**语义颜色和字体角色**（CSS 变量）、**按语言格式化的工具**（`format`）。别的都不知道。

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

第 16 批切换之后的写法：

```ts
import { count, renderButton, textHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

// 服务端：ui 由平台给，已经绑好主人和语言
render(request, ui) {
  const { t, format } = ui;
  return `<h2>${textHtml(t("notes.main.title"))}</h2>`
    + renderButton({ label: t("notes.main.add") })
    + `<time>${format.date(request.model.at, "datetime")}</time>`
    + `<p>${textHtml(t("notes.main.saved", { count: count(request.model.saved) }))}</p>`;
}
// 样式：只写语义变量，换皮肤不用动
.notes-title { color: var(--ink); font-weight: var(--weight-title); }
```

切语言时业务代码什么都不做：平台把页面里带绑定标记的文字和属性原地改掉（第 5 节 `applyTextBindings`），输入框内容、滚动、选区都不动。

| 不许业务代码做的 | 怎样保证 |
| --- | --- |
| 读语言、皮肤、字体，写按语言或皮肤的分支 | `ui` 里没有这些入口；样例源码用断言查（FSA-21） |
| 订阅变化 | 只有要重新测量的终端、编辑器才听一个可选事件（第 4.5 节）；普通页面没有订阅 API |
| 把译文存进业务数据 | `t()` 返回对象而不是字符串，塞进字符串字段会被动作 schema 拒绝；业务数据存键或原值 |
| 改动作的输入输出 | A 段不动任何动作；以后要给人看的字段才写 `TextRef`，业务字段不变 |
| 拼句 | 整句一个键带参数，不写 `t("a") + "：" + title` |

### 1.2 注册：一处声明，宿主不写名单

内置插件、外部插件写法相同，只在 Manifest 写一处，语言文件放在自己包里：

```jsonc
// manifest（内置插件写在 src/manifest.ts 的 ui 下，外部插件写在 manifest.json，形状相同）
"ui": {
  "contributions": ["io.molis.work.example.notes.main"],
  "locales": {
    "default": "en",
    "files": [
      { "locale": "en", "path": "locales/en.json" },
      { "locale": "zh", "path": "locales/zh.json" }
    ]
  }
}
```

平台自己的文字主人（工作台、以后的 `horizontal/` 服务）没有 Manifest，**在资源登记表加行**（第 1.3 节）：`kind: "locale"`，`owner` 写主人名，`package`、`path` 指向它自己包里的文件。加一个平台主人不改宿主代码。系统提供方（如 `system.home`）在它的登记里写 `text_owner`，由可信登记给出，不从声明读。

### 1.3 管理：一张统一资源登记表

随产品分发的资源只登记在 `packages/design-system/resources/registry.json`，字段见第 3.6 节。插件的语言文件不进这张表：它们的唯一声明是 Manifest，报告脚本从内置目录投影，不抄第二份名单。

| 问题 | 答案 |
| --- | --- |
| 谁读 | 宿主资源适配器（启动时一次，定位字体与平台语言文件）；`packages/design-system` 的基线加载；报告脚本 `scripts/ui-resources-report.mjs`；预算方案（第 9 节）；测试 |
| 谁能改 | 只经 PR，文件归 D 轨。新增资源或一个资源涨超过 10 KB 先问用户（页面资源规则） |
| 缺失怎样被发现 | `tests/ui-resources.test.ts`：表里每行的文件存在、字节数和 sha256 相符、许可字段齐全；`resources/`、`fonts/` 下有文件而表里没有也失败。进 `tests/ci-product-subset.txt`（AGENTS 允许快且稳的用例进这份清单，不算改门禁） |
| 超预算怎样被发现 | 能量到的路由继续由 `scripts/gates/page-assets.mjs` 只许变小；量不到的部分现在只有报告，怎样补要用户定（第 12 节第 1 条） |
| 发行物里有没有 | 同一测试核对包的 `files` 覆盖每行的 `path`；干净安装后文件可读（FSA-18） |

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
  | { readonly name: string; readonly kind: "count"; readonly number: number; readonly style?: "decimal" | "compact" }
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
- **主人是一个字符串，不是对象。** 插件的 `plugin_id` 都匹配 `^io\.molis\.work\.`（`packages/plugin-sdk/src/plugin-id.ts`），平台主人名（`workbench`）不带这个前缀，不会相撞。描述里每个文字都要带主人，字符串最省字节，和 `SurfaceItem.owner_plugin_id` 一致。
- **有 `literal`。** 三件事需要它，缺它就得另开字符串分支：20 的草稿（`BlueprintSource` 的 `draft`）没有语言包，标题就是用户或助理写的话；自定义皮肤的名字是用户起的；`judgment.reason` 是主人给的一句话。这也统一了一处分歧：05② §5 写 `reason?: TextRef`，15 第 12 节写 `reason?: string`，本文定 `reason?: TextRef`，主人可写 `literal`。`literal` 不翻译，显示原样。声明位置要不要收它由调用方定：`textRefProblems(value, { literal: false })`，内容包的 `Blueprint.title`、Manifest 的 `label` 都用 `false`，防止把界面词写死绕过翻译。
- **有 `fallback`。** FSS-40 要求缺键时显示声明里的默认原文，实现方案 §7.4 要求摘要「存键、参数与默认原文」；主人被卸载后语言包也没了，存下来的摘要还要能看。它只在查不到时用，不是另一个翻译来源。
- **参数是数组，不是 map。** `SandboxSchema` 的 `additionalProperties` 只能写 `false`，也没有 `oneOf`（`packages/contracts/src/platform/plugin-sandbox.ts:5-21`），map 和联合类型都写不进平台定死的输出 schema。所以线上是平铺字段的数组，TypeScript 类型仍是联合，字段组合由 SDK 的 `textRefProblems` 检查。业务代码写 `{ count: count(3) }`，由 SDK 转成数组，不用手写。
- **不存已格式化的文字。** 切语言要重算（FSS-39、FSS-35）；组合服务的缓存不分语言（15 第 4.2 节）；原始数值和时间不能因语言改变（FSS-38）。

### 2.3 键、参数与上限

- **键的规则复用 `STABLE_KEY`**（`packages/plugin-sdk/src/message-declarations.ts:9`）：改成模块内 `export`，不进公开出口，`ui/text-ref.ts` 从那里取，不另写一份。门禁脚本 `scripts/gates/translations.mjs:59` 自己那份不动。
- **键的前缀决定能不能用**：`ownedTextRef(ref, owner)` 里，`common.*` 绑到平台主人 `workbench`（共有词有唯一主人，引用要显式）；否则前缀必须等于主人名（`messageOwnerOf(plugin_id)`，即 `plugin_id` 最后一段；平台主人就是它自己的名字）；别的前缀拒绝。这条是防冒充：插件不能把字显示成别人的。
- **查词按（主人，键）**，不再合成一张平面表（实现方案 §4.1）。两个插件最后一段相同也不互相覆盖；今天 `createPluginMessageStore` 的跨插件冲突检查随 C 段删。
- **参数名**是 `[A-Za-z_]\w*`，和 `message-declarations.ts` 的 `PLACEHOLDER` 一致。`{标题}` 这种中文占位符新语言包不收，旧的 `fillMessage` 到 C 段都还认（第 3.5 节）。
- **日期**：`at` 是 ISO 8601。带时区的按当前设置显示；只有日期（`2026-11-07`）的按字面显示，不换算时区，避免因时区差一天。`relative` 用 `Intl.RelativeTimeFormat`，`now` 由格式化工具传入，测试可固定。
- **上限**是 `TEXT_REF_LIMITS`，`PLUGIN_MESSAGE_LIMITS` 的 `keyLength`、`textLength` 改成取它，不留两个数。

**查词顺序（读不到时绝不显示裸键或空白，FSS-34）：** 所选语言包 → 同语种基础语言（`zh-CN` → `zh`）→ 主人默认语言包 → `fallback` → 平台共有词 `common.text.unavailable`，同时记一条问题，可从读取器取回。

### 2.4 逐个核对消费者

| 用处 | 位置 | 形状 | 主人从哪来 | 能否满足 |
| --- | --- | --- | --- | --- |
| 字段标签 `label_key` | 05② §5 `PresentationObject.fields[]` | 改成 `label?: TextRef`，`literal` 不收 | Manifest 的 `plugin_id`（可信目录） | 能 |
| 概况说明 `note_key` | 05② §5、15 第 12.1 条 | 改成 `note?: TextRef` | 同上 | 能 |
| 分组标题 `title_key` | 05② §6、15 第 12.3 条 | `SurfaceGroup.title?: OwnedTextRef` | 组合服务绑定 | 能。输出位置要写 `OwnedTextRef`，页面才查得到词 |
| `hidden_above` | 05② §6、15 第 12.4 条 | `{ count: number; label: OwnedTextRef }`，`label` 带 `count` 参数 | 平台共有词 `common.surface.*` | 能。「只数读得了的」是服务的事，字不重新组合 |
| 为什么这样放 `reason` | 05② §6 | `SurfaceDescription.reason?: OwnedTextRef` | 组合服务 | 能 |
| 概况动作的 `summary` | 05② §5、15 第 12.1 条 | 动作输出写 `TextRef`（`TEXT_REF_SCHEMA`），服务按动作提供方绑主人 | 动作目录给的提供方 | 能。输出里写 `owner` 被 schema 拒绝 |
| `judgment` | 05② §5、15 第 12.6 条 | `{ label: TextRef; reason?: TextRef }`，`reason` 可 `literal` | 主人的 values 动作提供方 | 能。两份设计稿对 `reason` 的类型不一致，按本文改 15 |
| 「同一件事」，参数由页面填 | 15 第 7 节 | `OwnedTextRef` 少两个参数，页面调 `reader.say(ref, { extra })` 补上标题 | 组合服务 | 能。服务不读显示字段，所以要有 `extra` |
| `Blueprint.title` | 20 第 3 节 | `TextRef`，内容包不收 `literal`，草稿收 | 内容包的 `plugin_id`（安装记录）；草稿无主人 | 能。`inspectBlueprint` 调 `textRefProblems` |
| `connection.purpose`、`SettingEntryDeclaration.title`、`adopts[].title` | 20 第 3、4、8 节 | `TextRef` | 声明它的插件；系统提供方用登记里的 `text_owner` | 能 |
| `RoleTemplate.title`，采用时存成字符串 | 20 第 5 节 | 调 `reader.say(ownedTextRef(template.title, pack))`，语言取调用上下文的 `locale` | 内容包 | 能。这是有意存字符串，说明见第 5 节 |
| 动作按钮 `action.<capability_id>.title` | 15 第 4.2 条、需求 §6.2 | **有冲突**，见下 | | 要改写法 |

**要改的地方（C-3 与 15 的写手照此改设计稿，本 PR 不改）：**

1. 05② 的 `label_key`、`note_key`、`title_key` 按上表换名和换类型。
2. 15 第 12 节第 6 条的 `reason?: string` 改 `reason?: TextRef`。
3. **`action.<capability_id>.title` 这种键过不了 `STABLE_KEY`。** `io.molis.work.example.notes.results.publish` 这样的能力 id 拼出来有 9 段，上限是 5 段，开头也不是主人名。FSS-40 本来就暂不实现，但 15 S-1 不要写死这个形状。推荐写法：SDK 给 `actionTextKey(capability_id, "title" | "description" | "summary")`，结果是 `<主人名>.action.<能力 id 去掉插件前缀，点换连字符>.<部分>`，如 `notes.action.results-publish.title`。实现方案 §7.4 已同步改。

### 2.5 `TEXT_REF_SCHEMA`

平铺字段，组合规则由 SDK 检查（`SandboxSchema` 写不出联合）。`additionalProperties: false` 让带 `owner` 的输出直接被 schema 拒绝。

```ts
const TEXT_ARG_SCHEMA: SandboxSchema = {
  type: "object", additionalProperties: false, required: ["name", "kind"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 64 },
    kind: { type: "string", enum: ["text", "number", "count", "date"] },
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
| 结果 | `parse*` 返回 `{ ok: true; value } | { ok: false; problems: UiFileProblem[] }`，`UiFileProblem = { path: string; code: string; reason: string; line?: number; column?: number }`。作者工具和平台看到同一份问题 |
| 版本字面量 | `tooling/versions.json` 加 `format.ui.spec`、`format.ui.skin`、`format.ui.font`、`format.ui.locale`，代码写 `/* @version format.ui.skin */ 1`。随包的基线与平台语言 JSON 走 `carriers`，再跑 `pnpm versions:generate`。第 16 批插件语言文件变多时，`carriers` 逐个写不下，届时再定写法，A 段只有 5 个文件 |

### 3.2 令牌取值

不收 CSS 文本，所以令牌值是结构；序列化器写回和今天逐字相同的文字（第 8.1 节要字节不变）。

```ts
export type UiTokenValue =
  | string                                                  // 只收 #rrggbb、#rrggbbaa、transparent
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

序列化规则（写手照今天的文字核）：小数不写前导零（`.05`、`-.011em`）；`0` 不带单位；`spread` 省略时只写三段；每个令牌输出 `--name: value;`，令牌之间一个空格。`renderShellTokens` 现在就是这个样子，浅深两份顺序相同（已核对 53 个）。`role` 必须是规格里有的角色，引用成环拒绝。

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
  readonly follows?: string;                   // 皮肤省略时跟随哪个角色（desk → page）
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

`--terminal-*` 单列一个 `terminal`：今天它有三份值，`:root` 未设终端主题时是一份（`--terminal: #171719`），`data-resolved-terminal-theme` 为 light、dark 各一份，页面深色块和终端深色那份相同（`styles/foundation.ts:10-48`）。字节不变要求三份都留，所以叫 `unset`、`light`、`dark`。

字体方案 A 段不写字号和行高。FSS §4 要求每个角色都有，但今天没有这样的令牌，写了也没人读，等于空字段。B 段把组件样式接到 `--type-*` 时再加，同时加「长文阅读」「说明文字」两个角色。

### 3.5 语言包，以及 `fillMessage` 怎样换

```ts
export interface UiLocalePack {
  readonly format_version: /* @version format.ui.locale */ 1;
  readonly owner: string;                      // 文件自述，只用于核对和导入导出
  readonly locale: string;                     // zh、en、zh-CN；形状 ^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$
  readonly direction: "ltr" | "rtl";
  readonly revision: number;
  readonly messages: Readonly<Record<string, UiMessage>>;
}
export type UiMessage = string | { readonly plural_arg: string; readonly forms: Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> };
```

- **`owner` 是自述，不是身份。** 需求 §3.1 要语言包文件表达文案主人（导入导出要用），AGENTS 要主人取自可信目录。两边都守住：载入时 `pack.owner` 必须等于目录给的主人，不等就拒绝，它从不授予身份。
- **`revision`。** 随包分发的语言文件固定写 1，它的身份由发行版本决定，缓存键用宿主算的内容摘要。只有 Home 受管副本（D 段）才由主人递增。不要求作者每改一句译文手动加一。
- **消息值直接写字符串。** 比实现方案 §4.1 的 `{ "text": … }` 少一层；工作台有几千条，这一层每条都占字节，也没带来别的信息。实现方案已同步改。
- **复数规则。** 必须有 `other`；其余形式按 `new Intl.PluralRules(locale).resolvedOptions().pluralCategories` 查缺。中文只有 `other`，直接写字符串。

**实现：** `formatMessage(message, args, locale, now?)` 先按 `Intl.PluralRules` 选形式，把参数格式化成文字，最后交给现有的 `fillMessage` 替换。替换仍只有一份写法。新语言包不收 `{n|a|b}`（解析器拒绝），旧词典到 C 段继续用它，C 段连同这个分支一起删。A 段不动 `fillMessage` 和 `tests/fill-message.test.ts`。

| `tests/fill-message.test.ts` 钉住的行为 | 新写法里怎样保留 |
| --- | --- |
| `{count} {count\|file\|files}` 在 1、0 时的单复数 | `forms: { one: "{count} file", other: "{count} files" }`，`Intl.PluralRules("en")` 对 0 给 `other`，结果相同 |
| 写成文字的 `"1"` 按数字读 | 不保留：`count` 参数的类型就是数字，字符串被 `textRefProblems` 拒绝。调用方给原值 |
| `"1.2k"` 取复数 | `{ kind: "count", number: 1200, style: "compact" }`，显示 `1.2K`，按 1200 选 `other`。比今天更准 |
| 一句里多个一致词（`Handle this 1 decision`） | 每种形式写整句 |
| 中文不写一致词 | `other` 或普通字符串 |
| `{标题}` 能替换 | `fillMessage` 仍能替换；语言包解析器不收非 ASCII 占位符，理由是 `message-declarations.ts` 已这样约束稳定键 |
| 值只放一次，不再读（`{a}` 的值是 `{b}`） | 最后一步还是 `fillMessage`，行为相同 |
| 没给值的名字原样留着 | 相同；`inspectLocaleSet` 另外报参数不一致 |
| `{ "json": true }` 这种花括号不动 | 相同 |
| 页面的 `L` 和宿主的 `L` 结果相同 | C 段起两边都用 `/ui` 打包的同一函数，不再 `toString()` 传过去；A 段新增 FSA-07 证明 Node 与浏览器结果相等 |
| 每个一致词都同时显示数字（“3 files”不能只写“files”） | `inspectLocaleSet` 新规则：`plural_arg` 的每种形式都要出现 `{参数名}`，否则报 `hidden_number` |

### 3.6 资源引用与登记表

```ts
export type UiResourceKind = "spec" | "skin" | "font-scheme" | "locale" | "font" | "material";
export type UiResourceLoad =
  | "startup"        // 进程启动读一次，不下发浏览器
  | "first-paint"    // 每个页面首屏都下发
  | "on-demand"      // 用到才下发（如另一种语言）
  | "selected-only"  // 选用这个方案才下发（Folio 圆润字体）
  | "tool";          // 只有开发工具页用
export interface UiResourceRow {
  readonly id: string;                    // font.inter-latin-variable；字体方案、预算都引用它
  readonly kind: UiResourceKind;
  readonly owner: string;                 // 主人：design-system、workbench、…
  readonly package: string;               // 所在包名
  readonly path: string;                  // 包内相对路径
  readonly bytes: number;
  readonly sha256: string;
  readonly load: UiResourceLoad;
  readonly route?: string;                // 下发路径，只给字体这类直接下发的文件
  readonly license: { readonly spdx: string; readonly source: string; readonly notice_path?: string };
}
export interface UiResourceRegistry {
  readonly format_version: /* @version format.ui.registry */ 1;
  readonly resources: readonly UiResourceRow[];
}
```

（`format.ui.registry` 与第 3.1 节四个版本条目一起加。）`route` 只是记录，宿主的路由仍写在 `apps/local-host/src/web-assets.ts` 的字符串字面量里。`scripts/gates/page-assets-measure.mjs` 读的就是这些字面量，改成查表它会拒绝，那是门禁改动。测试核对两边一致。

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

固定四层，和实现方案 §5.1 相同：共同规格（`locked` 与 `follows`）→ 所选皮肤 → 所选或推荐字体 → 入口的明暗、密度、语言与硬性可访问性规则。皮肤的完整值由 `resolveSkin(spec, baseline, skin?)` 算出：**皮肤自己的值 → `follows` 指向的角色已解析的值 → 基线皮肤的值**；皮肤写了 `locked` 角色就拒绝（FSA-16）。语言只影响文字和字形后备，不改皮肤或字体的选择。

### 4.3 服务端和浏览器同一份

`resolveUiEnvironment(input)` 在 SDK `/ui`，无 I/O，宿主和页面都用它。输入是已解析好的规格、皮肤、字体方案、语言选择，以及可选的设备偏好。浏览器不读文件，所以不重新解析皮肤，只调 `withDevicePreferences(snapshot, device)` 把设备偏好合进去。FSA-07 让同一输入在 Node 和浏览器打包后各跑一遍，比 JSON 相等。

### 4.4 首屏（第 16 批，先把路定下）

A 段什么都不改：令牌仍在基础 CSS 里，没有选择，快照由基线算出，只给样例和组件板用。第 16 批按下面做，不留死路：

| 东西 | 怎样到页面 | 为什么 |
| --- | --- | --- |
| 快照 | HTML 里一段 `<script type="application/json" id="ui-environment">`，不执行 | 小（几百字节），要同步可得；CSP 已允许内联 |
| Soft Workbench | 不多发请求，令牌就在基础 CSS | 默认路径零成本 |
| 其他皮肤 | `<head>` 里一个 `<link rel="stylesheet" href="/assets/ui-skin/<id>-<revision>.css">`，排在基础 CSS 之后 | 阻塞首绘，不闪默认皮肤；不内联；按版本长缓存。路由不是字面量，门禁要教，所以进第 12 节第 1 条 |
| 明暗 | 一份 CSS 里两个分支，选择器仍是 `html[data-resolved-theme]`；现有 `THEME_BOOTSTRAP_SCRIPT` 选分支 | 比实现方案 §5.1「启动投影携带浅深色、引导脚本选中」简单：CSS 自己就能选，引导脚本不用改 |
| 语言 | C 段把 `clientI18nScript`（`apps/workbench/src/i18n.ts:154` 起，把整本词典内联进 HTML）换成阻塞 `<script src="/assets/locale/<主人>.<语言>.<摘要>.js">` | 字节从量不到的 HTML 搬进量得到的 `/assets/`；`L` 要同步可用，所以阻塞；按摘要长缓存 |

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
| `text`、`count`、`date` | `ui/text-ref.ts` | 样例、组件板 |
| `textRefProblems(value, { literal? })` | `ui/text-ref.ts` | 宿主 `ui` 工具；05② `assertSurfaceDescription`、20 `inspectBlueprint`；CLI |
| `ownedTextRef(ref, owner)` | `ui/text-ref.ts` | 宿主 `ui` 工具；15 组合服务 |
| `formatMessage`、`formatNumber`、`formatDate` | `ui/message-format.ts` | `createUiTextTools`；组件板 |
| `parseLocalePack` | `ui/locale-pack.ts` | `loadPluginLocalePacks`（plugin-runtime）；工作台语言文件；CLI |
| `inspectLocaleSet(packs, { default })` | `ui/locale-pack.ts` | CLI `validate`；`loadPluginLocalePacks`；组件板标本的问题列表 |
| `matchLocale(requested, available, fallback)` | `ui/locale-pack.ts` | 宿主 `ui` 工具；组件板 |
| `createTextReader({ packs, locale })`、`createUiTextTools(reader, owner)` | `ui/text-reader.ts` | 宿主 `ui` 工具；组件板浏览器脚本 |
| `textHtml`、`textAttrs`、`bindText`、`applyTextBindings` | `ui/text-binding.ts` | 组件板（服务端出标记，浏览器切换） |
| `parseStrictJson` | `ui/strict-json.ts` | 下面三个 `parse*`；`parseLocalePack`；CLI |
| `parseInterfaceSpec`、`parseSkinFile`、`parseFontScheme` | `ui/appearance-files.ts` | `packages/design-system` 基线加载；组件板 |
| `resolveSkin`、`skinTokenDeclarations` | `ui/appearance-resolve.ts` | `palette.ts` 等 |
| `resolveFontScheme`、`fontTokenDeclarations`、`fontFaceRules` | `ui/appearance-resolve.ts` | `typeface.ts` |
| `resolveUiEnvironment`、`withDevicePreferences` | `ui/environment.ts` | 宿主 `ui` 工具；组件板 |

**不在 A 段导出的**（没有消费者）：`actionTextKey`（FSS-40 暂不实现；只定写法）、`formatList`（`listJoin` 到 C 段才换）、按声明查引用的 `inspectTextRefs`（15、20 的第一片带上）。

**作者工具与平台共用：** `inspectLocaleSet` 查缺键、多余键、参数不一致、缺复数形式、`hidden_number`，返回 `{ code, locale, key, detail, blocking }[]`。默认语言缺键、参数不一致算 `blocking`，平台载入时拒绝；别的语言缺键不阻断，算覆盖率（FSS-34 可观察，FSS-37）。CLI 的 `validate` 调同一个函数，作者和平台看到一样的结果。

**文字绑定的标记：**

```html
<div data-text-owner="io.molis.work.example.notes"> <!-- 插件根节点一个，平台写 -->
  <span data-text-key="notes.main.saved" data-text-args='[{"name":"count","kind":"count","number":3}]'>3 saved results</span>
  <button data-text-attrs='{"aria-label":{"key":"notes.main.add"}}' aria-label="Add">…</button>
</div>
```

`applyTextBindings(root, reader)` 一次扫完。只改这个元素自己的文字节点（元素有子元素就跳过并记问题，不覆盖）；属性只认 `aria-label`、`aria-description`、`title`、`placeholder`、`alt`；从不写 `value`，从不用 `innerHTML`。它不登记节点、不开 Observer，所以没有东西要释放，卸载的节点自然不在了（实现方案 §6 担心的全局 Observer 持有被卸载节点，这样就不存在）。代价是切语言时每个根扫一次，切语言很少。

`t()` 返回 `BoundText = { text; ref; toString() }`。`toString()` 给当前语言的字，用在 toast、确认框这类一次性的地方；`renderButton` 等部件的 `label` 第 16 批改成 `string | BoundText`，收到 `BoundText` 就写绑定标记。业务里把它当字符串存进数据，字符串字段的 schema 会拒绝。

存字符串的例外只有 20 的 `RoleTemplate.title`：采用时写进用户自己的草稿，归用户所有，之后不随语言变（场景设计稿已定）。

## 6. Manifest 与发行物

### 6.1 声明

`packages/contracts/src/platform/plugin-manifest.ts`：

```ts
export interface PluginLocalesDeclaration {
  readonly default: string;
  readonly files: readonly { readonly locale: string; readonly path: string }[];
}
// PluginManifest.ui 增加
locales?: PluginLocalesDeclaration;
```

`parsePluginManifest` 检查：语言标记形状；`default` 在 `files` 里；语言不重复；路径是相对路径且以 `.json` 结尾。路径规则今天在 `plugin-runtime` 的 `assertPluginPackagePath`（`package-verification.ts:26`），SDK 的解析器用不到它，所以**把这个函数搬到 SDK，`plugin-runtime` 从 SDK 取**，不写第二份。

**同一个 Manifest 不能既写 `ui.locales` 又写 `ui.messages` 或 `ui.translations`，写了就拒绝。** 这是 A 段「不双认」的落法：没有一个翻译器同时读两种格式，也没有一个插件走两条路。A 段里只有样例写 `ui.locales`；内置插件一个都不写，第 16 批 C 段一次改完并删掉旧字段。这条解释要用户确认（第 12 节第 3 条）。

### 6.2 内容怎样走

已核实：`PluginRuntimeReleaseArtifact` 只有 `{ manifest, module_source }`（`packages/plugin-runtime/src/release-artifacts.ts:4-11`、`:112`），内置的 `nativePluginReleaseArtifact` 也打成单模块（`apps/local-host/src/native-plugin-release-artifact.ts`），恢复时是 `data:` URL，**模块里读不到包内文件**。所以语言文件不能由插件代码自己读，要由平台读出来带着走：

```ts
export interface PluginRuntimeReleaseArtifact {
  // …原有字段
  readonly locale_packs?: Readonly<Record<string, string>>;   // 语言 → 文件原文
}
export function loadPluginLocalePacks(manifest: PluginManifest, read: (path: string) => string | null): PluginLocalePacks;
```

`loadPluginLocalePacks` 在 `plugin-runtime`，唯一入口：逐个读声明的文件，`parseLocalePack`；`pack.locale` 不等于声明、`pack.owner` 不等于 `manifest.plugin_id` 就拒绝；`inspectLocaleSet` 有 `blocking` 就拒绝。`read` 由各种来源给，这样只有一套规则。

| 来源 | `read` 从哪来 | 哪一片 |
| --- | --- | --- |
| 本地开发（`plugin dev`，样例走这条） | `development-loader.ts` 读项目目录，路径再过一遍 `assertPluginPackagePath` | A |
| 打包（`molis-work-plugin pack`、`parsePluginPackage`） | `payload.files`；声明的文件缺了拒绝，和入口文件同样处理（`package-verification.ts:50-54`） | A |
| 内置插件 | 登记上的 `package_name` 解析到包目录；包的 `files` 加 `resources`。写在 `native-plugin-release-artifact.ts` 旁边 | C（A 段没有内置插件声明，写了就是死代码） |
| 沙箱包 | `SANDBOX_PACKAGE_FILES` 是「恰好这些文件」，要加 `locales/` 一组 | C，和生成插件一起。A 段写了 `ui.locales` 的沙箱包被现有的 Manifest 重建核对拒绝，有明确错误 |

**为什么放在发行物一层，不放进 `NativeReleaseBundle`：** 后者是带版本的格式（`format.plugin.native-release`），统一起点已登记（#1914），改它要升版本带升级步骤；放在发行物这一层，内置和外部同一处，也不用。`artifact_json` 这一列没有版本号，旧行没有这个字段，它们的 Manifest 也没有 `ui.locales`；`validateArtifact` 规定「声明了就必须有，没声明就不能有」，所以不是读取兜底，不用升级步骤。

**信任和过期**与 `module_source` 相同：外部包的文件在签名范围内（`payload.files`）；同一（版本，摘要）的行 `ON CONFLICT DO NOTHING`，只改译文不改 Manifest 不会刷新存档。这没有新风险：内置插件跟随当前构建，不从存档恢复（`docs/platform/PLUGIN-PLATFORM.md`）；外部包改内容要升版本。不把摘要写进 Manifest，否则作者每改一句译文都要算一次哈希，不方便。

**不把译文内联进 Manifest。** 看起来最省事（`ui.messages` 就是这样），但 N50 已测出冷启动 Manifest 摘要算三遍、`canonicalJson` 递归 31 万次，内联词典会把它放大；Manifest 还到处被复制。

### 6.3 现有字段与生成插件

- `ui.messages`、`ui.translations`（`plugin-manifest.ts:187,195`）A 段不动，第 16 批 C 段删。`PluginRegistration.messages` 早已删除（`plugin-registration.ts` 里没有这个字段），实现方案 §7.4 还当它现行，已改。
- **生成插件现在没有词条声明。** 标题、提交名、列名是 `interface.json` 里的字符串，渲染器 `plugin-component-client.ts` 还有固定中文。以后这样走：
  - 渲染器把这些字符串当 `literal`（作者写的内容，原样显示）。这不是读取兼容，是它们本来的语义，所以未转换的已安装插件照常显示，只是不翻译。
  - 渲染器自己的固定按钮、错误、日期改用平台 `common.*` 和 `format`（C 段）。
  - 创作台新生成的插件由代码阶段写稳定键和 `locales/*.json`，打进沙箱包。
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
- 插件里用基线名：只数 `var(--x)` 写法我量到 95 个（主会话是 96，口径差一个），`--muted` 395 次相同。**公开令牌名不改**：规格的 `name` 加 `--` 就是令牌名，FSA-13 断言 194 个名字一个不少。

### 7.2 各放哪里

| 放在 | 内容 |
| --- | --- |
| 皮肤文件 | 颜色、阴影、圆角、动效节奏、抬升、焦点颜色。别名也写（`blue` 写 `{ "role": "accent" }`） |
| 共同规格 | 角色全集、类型、`follows`；不可定制的值（`locked`）。皮肤写了 `locked` 角色就拒绝，触控和焦点底线不能被皮肤改（FSS-16） |
| 字体方案 | 字族、字重、字距，离线字体的 `@font-face` 描述 |
| 结构样式（不动） | 选择器、布局、响应式、交互、减少动态效果；密度和触控对 `--control-h` 的覆盖；`--plugin-tint` 绑定；后层里的纯别名（`--desk: var(--page)`、`--lift-1: var(--shadow-soft)`）。这些没有数值，不是第二份常量 |

**省略的角色怎样补（第 4.2 节）：** 自己的值 → `follows` → 基线。`follows` 不是摆设：`--page`、`--desk`、`--nav-bg` 今天各写一遍相同的色值，基线为字节不变也照写；但 Folio 只写 `page` 时，`desk` 要跟它，不能留着 Soft Workbench 的雾蓝。写手按这些同值关系补：`desk`、`nav-bg` 跟 `page`；`panel`、`surface`、`canvas` 跟 `paper`；`wash` 跟 `rail`；`text` 跟 `ink`。

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

读取写 `new URL("../resources/…", import.meta.url)`：`rootDir` 是 `src`，不能 import JSON；`src/` 和 `dist/` 上一层都是包根，源码和构建都能跑。先例 `packages/design-system/src/page-clients.ts:9`。发行物按包的 `files` 复制（`apps/local-host/src/installer/home-release.ts` 的 `runtimeDependencyReleaseEntries`），加这一项就够。

新文件 `packages/design-system/src/baseline.ts`：模块初始化读 4 个 JSON，走 SDK 解析，得到解析好的基线，错了抛 `ui.baseline_invalid`，带文件和字段。

## 8. 真实消费者

### 8.1 皮肤和字体：同意主会话的方向，范围要大一点

主会话推荐 `palette.ts:157,175,241` 读基线文件、走 SDK 解析器，字节不变，删第二份常量表。方向对，**但只改这三处，还剩 34 个令牌的值写死在别处，等于留了第二份常量表。** 那 34 个是 terminal、danger、`--font` 10 个（`foundation.ts`）、字重字距 7 个（`typeface.ts`）、收尾 17 个（`craft-finish-bar.ts`）。所以范围是全部 194 个：

- `palette.ts`：`renderShellTokens`、`renderPaletteTokens`、`renderShapeTokens`、`renderControlMetrics` 签名不变，改成调 `skinTokenDeclarations`。`MW_HUES`、`MW_CONTENT_MARKS` 留 `id`、`label`、`role`（组件板要），删 `light`、`dark`；`MW_CONTENT_THEME` 删（核过只有 `palette.ts` 和 `index.ts` 在用）。调用方不动（`coss-controls`、`foundation`、`interaction-texture`、`apps/workbench/src/styles/base.ts`、`apps/desktop/src/capsule-shell.ts`、`packages/im-ui/src/styles.ts`、测试）。
- `foundation.ts`、`craft-finish-bar.ts`：模板不动，把写死的值换成 `${baselineToken("terminal")}`，后层重复声明的数值（`--ease-quint`、`--dur-*`）也换，不留第二份数字。别名不动。
- `typeface.ts`：`FONT_STACK`、`MONO_FONT_STACK` 和 `@font-face` 从 `system-sans.json` 算出来，导出名不变。

**证据：** `node scripts/gates/page-assets.mjs --base origin/main` 通过，并用 `--report --json` 比基点，所有已测资源字节差为 0（门禁只拦变大，变小也算过，所以要贴差值）。这是字节不变的唯一证据；不用「文件解析后等于自己」这种自证。

**代价已核：** 模块初始化同步读文件，先例就在同一个包。它确实是全站单点：基线坏了宿主起不来。这是构建缺陷，不是用户数据问题，按构建缺陷拦在发行前：`tests/ui-baseline.test.ts` 进 `tests/ci-product-subset.txt`，解析全部内置文件、核 194 个名字；干净安装测试核发行物里文件可读。**没有查到有 native 插件把 design-system 打进单模块发行物**：唯一声明依赖的 `plugin-builder` 是构建期例外，不走发行物。写手合入前按当时再核一次，打进去的话 `import.meta.url` 是 `data:`，`new URL` 会抛。

### 8.2 文字：同意，放在组件板

不切现有词典（决定 20）。`/__ui/catalog` 加一节 `renderEnvironmentSection`，做法照 `collab-specimens.ts`：`apps/workbench/src/browser/board/environment-section.ts`，esbuild 打成 `dist/board-environment-section.js`，`readFileSync` 内联进组件板 HTML。不新增 `/assets/` 路由，不触发页面资源审批。

标本真跑：

1. 服务端用 `createUiTextTools` 按 `apps/workbench/resources/locales/` 的词写出带绑定标记的 HTML（宿主消费者）。
2. 浏览器里一个语言切换，调 `applyTextBindings` 换文字和属性，不整页刷新；旁边一个输入框证明内容不丢（浏览器消费者）。
3. 同屏显示 `count` 的单复数、数字和日期随语言变；显示 `resolveUiEnvironment` 的结果，服务端和浏览器各算一份并比较。
4. 列出 `parseSkinFile` 对几份坏文件的问题（重复键、CSS 文本、外部 URL、写了 `locked` 角色），这是组件板看得见的校验。

组件板没有开关，路由在发行物里也有（`apps/local-host/src/web-catalog-board.ts`、`web-routing.ts:42`），所以 `resources/` 要随包。它是开发工具，单独不算真实入口，所以和基线、两包样例一起算。

### 8.3 宿主给插件的 `ui` 工具

组件板只证明平台自己能用。插件要读到文字和快照，需要一个平台给的入口，这是主会话清单之外我补的一处，否则两包样例接不上真实路径：

```ts
// platform/ui-environment.ts
export interface UiFormatTools {
  date(at: string, style: "date" | "time" | "datetime" | "relative"): string;
  number(value: number, style?: "decimal" | "percent" | "compact"): string;
}
export interface BoundText { readonly text: string; readonly ref: OwnedTextRef; toString(): string }
export interface UiRenderTools {
  t(key: string, args?: Readonly<Record<string, string | number | TextArg>>): BoundText;
  say(ref: OwnedTextRef, options?: { readonly extra?: readonly TextArg[] }): string;
  readonly format: UiFormatTools;
  readonly environment: UiEnvironmentSnapshot;
}
// platform/ui.ts
export interface UiContribution<TModel = unknown> {
  readonly descriptor: UiContributionDeclaration;
  render(request: UiRenderRequest<TModel>, ui: UiRenderTools): string;
}
```

`UiHost`（`packages/ui-host/src/index.ts:27`）加选项 `uiTools: (owner: string) => UiRenderTools`，和 `drawingAs` 并列，`owner` 就是平台从 Manifest 填的 `descriptor.plugin_id`，插件改不了；`plugin-client.ts:40` 的包装把第二个参数传下去。五处 `new UiHost` 传同一个导出（`apps/workbench/src/plugin-text.ts`，它存各插件的语言包，按（主人，语言）记住工具对象）。快照 A 段由 `packages/design-system` 的基线算，语言取现有 `currentLocale`。

现有 `render(request)` 都不读第二个参数，行为不变。这不是 `ui.messages` 的第二读法：没声明 `ui.locales` 的插件，`t` 查不到任何自己的词，但它们也不调。

### 8.4 两包样例

`examples/plugin-sample`、`tooling/plugin-cli` 的 `create` 模板、`tests/plugin-sample.e2e.test.ts`：

1. **声明：** `manifest.json` 加第 1.2 节的 `ui.locales`；`locales/en.json`、`locales/zh.json`；`package.json` 的 `files` 加 `locales`。`pack` 把声明的文件打进去。
2. **校验：** `molis-work-plugin validate` 调 `inspectLocaleSet`，改坏一个占位符应失败。
3. **运行：** `render(request, ui)` 用 `ui.t("notes.main.saved", …)`。现有断言 `/Saved results: 1/` 不动（`en.json` 就写这句，`Saved results: {count}`），另加一行用 `count()` 的单复数，并在 `zh` 下断言中文。
4. **只装两包：** 现有用例已经用 `npm install` 只装 contracts 和 SDK 后起子进程（`tests/plugin-sample.e2e.test.ts` 的 RAC-553 那段）。在同一段加：导入 `parseLocalePack`、`createTextReader`、`resolveUiEnvironment`、`parseSkinFile`（规格用一份内联的最小样本，作者拿不到私有 design-system），跑通并打印结果；再用 `esbuild --platform=browser` 打一次 `/ui`，有 Node 内建模块就失败。
5. **业务代码不碰语言：** 断言 `index.mjs` 源码里没有 `currentLocale`、`navigator.language`、`data-resolved-theme`、`data-skin`。

### 8.5 字体路径

`apps/local-host/src/web-assets.ts:14-19` 写死 `../../../packages/design-system/fonts/…`。发行物里没有这个相对层级，**读代码判断应是 404（没有起服务实测）**；系统字体排在前面，所以平时看不出。改成 `interVariableFontFilePath()`、`notoSansScFontFilePath()`（`typeface.ts:19,23`，`local-host` 已依赖 design-system）。路由字面量 `"/assets/inter-latin-variable.woff2"` 保留（第 3.6 节）。写进基线那一片，并补干净安装后路由能读到的测试（FSA-18），先把现状跑出来证明确实是 404，再改。

## 9. 资源预算的接口

实测与预算方案由另一位写手在 `specs/font-and-skin-system/resource-budget.md`（分支 `claude/14-resource-budget`）交，本文不写，只定怎样接：

- **登记表是预算的账本。** 预算按 `load` 分组算：`first-paint` 的字节合计就是首屏增量；`selected-only` 只在选用时算；`tool` 不计入产品。行的 `id` 是预算方案引用资源的唯一写法。
- **插件语言文件**由报告脚本从内置 Manifest 投影，和表合起来出同一张账，不抄进表。
- **报告脚本** `scripts/ui-resources-report.mjs` 只报告，不失败，不是门禁。
- **已知盲区**（已读 `scripts/gates/page-assets-measure.mjs`）：只量 `/assets/` 字面路由和内置包；HTML 内联（最大是英文页词典，`apps/workbench/src/i18n.ts:154`）、`/api`、英文变体、外部插件都没量。A 段不往这些地方搬字节，也不改门禁。怎样补是第 12 节第 1 条。

A 段的页面资源影响：基线字节不变；SDK 新工具不进现有包（第 5 节，门禁证明）；组件板是内联的开发页；字体路径修复不改字节。所以 **A 段不需要新增资源，也不需要增长许可**。若实现时门禁显示某资源变大，停下来，不写许可。

## 10. 片与 PR 序列

C1 独占合同文件和 `tooling/gates/api/`；D 独占 `packages/design-system`、`packages/plugin-sdk/src/ui.ts`、`ui.ts`。合同先单独开小 PR，公共合同台合审。开写之前读 #1743 最新评论，开 PR 前再查一遍同快照的在途 PR。

| 片 | 做什么 | 动的文件与快照 | 前置 | 验收 | 写手模型 |
| --- | --- | --- | --- | --- | --- |
| T1 合同① `TextRef` | 第 2 节的类型与 schema | `platform/ui-text.ts`（新）；`ui.ts` 一行 `export *`（D 文件，D 评）；`api/contracts/platform/ui.txt` | 本设计稿合入；核过三张快照 #1872、#1913、#1909 都不碰这份 | FSA-01、FSA-04 | Opus 5.5 high |
| T2 合同② 文件与快照 | 第 3、4、8.3 节的类型；`versions.json` 五个条目 | `platform/ui-files.ts`、`ui-environment.ts`（新）；`ui.ts`；`tooling/versions.json`；`api/contracts/platform/ui.txt` | T1 合入（同一快照） | FSA-05（类型部分） | Opus 5.5 high |
| T3 合同③ Manifest | `ui.locales` 类型与解析；`assertPluginPackagePath` 搬到 SDK | `plugin-manifest.ts`；`packages/plugin-sdk/src/manifest.ts`；`api/contracts/platform/plugin.txt`、`api/plugin-sdk/index.txt` | **等 #1909**（占这两份快照） | FSA-11 | Opus 5.5 high |
| T4 SDK 文字工具 | `text-ref`、`message-format`、`locale-pack`、`text-reader`、`text-binding`；`error-owners.json` 加 `ui` | `packages/plugin-sdk/src/ui/*`、`ui.ts`；`api/plugin-sdk/ui.txt` | T1；**等 #1872、#1913**（占 `ui.txt`） | FSA-02、03、06、07、09、10 | Opus 5.5 high（SDK 共享核心，统筹加全量） |
| T5 SDK 文件工具 | `strict-json`、`appearance-*`、`environment` | 同上快照 | T2、T4 | FSA-05、07、08、16 | Opus 5.5 high |
| T6 基线与字体路径 | 第 7 节全部、第 8.1、8.5 节 | `packages/design-system/{resources,src/baseline.ts,src/palette.ts,src/typeface.ts,src/styles/foundation.ts,src/styles/craft-finish-bar.ts,package.json}`；`apps/local-host/src/web-assets.ts`；测试；`carriers` | T5 | FSA-13、14、15、17、18 | Opus 5.5 medium；占 build 槽位 |
| T7 语言文件进发行物 | 第 6.2 节 A 段那两行；CLI `validate`、`pack` | `packages/plugin-runtime/src/{release-artifacts,package-verification,development-loader,supervisor*}.ts`；`tooling/plugin-cli` | T3、T4 | FSA-12 | Opus 5.5 high |
| T8 消费者 | 第 8.2、8.3、8.4 节 | `packages/ui-host`；`apps/workbench/{src/plugin-text.ts,src/browser/board/environment-section.ts,resources}`；`apps/local-host` 五处 `new UiHost`；`examples/plugin-sample`；`tooling/plugin-cli/src/create.ts`；`tests/plugin-sample.e2e.test.ts` | T6、T7 | FSA-19、20、21、22、23 | Opus 5.5 medium；占 browser 槽位 |
| T9 文档与账本 | 报告脚本；`docs/platform/UI-PLATFORM.md`；design-system、SDK README「开发要求」随代码；`docs/system/GLOSSARY.md` 加文字引用、语言包、字体方案、展示快照；`docs/SSOT-MATRIX.md` 里「`palette.ts` 唯一来源」改掉 | 文档；`scripts/ui-resources-report.mjs` | T8；`resource-budget.md` 合入 | FSA-24 | Sonnet 5.5 high |

**先后：** T1 → T2；T1 + #1872、#1913 → T4 → T5（T2 也要）→ T6；#1909 → T3；T3 + T4 → T7；T6 + T7 → T8 → T9。同一时间最多 3 个写手，T1 与 T3 同归 C1 但快照不同，可以并行；T4、T5 同一快照串行。

**给别批的：** 05② C-3 的合同只等 T1；它的 SDK `assertSurfaceDescription` 要 `textRefProblems`，等 T4。15 S-1 同样。20 P-1 的合同只等 T1，`inspectBlueprint` 等 T4。

验证：每片 `node scripts/affected-tests.mjs` 挑用例，`node scripts/run-tests.mjs --jobs 1`，走机器槽位；全量由统筹加。T4、T5、T7 碰共享核心。

## 11. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 定义正文归文件；A 段的文件归发行物（design-system、workbench、各插件包）。语言偏好仍归入口 Cookie，设备偏好仍归浏览器。Home 选择归 B 段的新服务。快照、解析结果是投影，不是事实。`docs/SSOT-MATRIX.md` 的「`palette.ts` 唯一来源」改成皮肤文件（T9） |
| 2 | 插件同等待遇 | 内置和外部同一个 `ui.locales`；`loadPluginLocalePacks` 一套规则；`ui` 工具对所有插件一样。没有宿主私路 |
| 3 | 能力注册 | A 段不加动作，不碰动作目录；`pnpm actions:update` 应无变化。主人取自 Manifest 和可信登记 |
| 4 | 合同 | 改：`platform/ui`（三个新文件）、`platform/plugin`、SDK `/ui`、`UiContribution.render` 多一个参数。阶段一，不留兼容期，消费者同 PR 改完。合同先单独开 PR（T1～T3） |
| 5 | 放在哪个包 | 合同在 contracts；工具在 SDK `/ui`（只依赖 contracts，无 Node 内建）；基线在 design-system（读文件）；发行物规则在 plugin-runtime；A 段不加新包。**B 段的外观主人按用户 11-01 的规定进 `horizontal/` 新包，不进实现方案写的 `apps/local-host/src/interface/`**，方案已加注 |
| 6 | 表与存储 | 不加表，不改库结构。`artifact_json` 多一个可选 JSON 键，理由见第 6.2 节 |
| 7 | 兼容与迁移 | 不加。`ui.locales` 与 `ui.messages` 同写拒绝，没有翻译器读两种格式。`literal` 是语义不是兼容 |
| 8 | 安全边界 | 不碰回环、令牌、动作网关、MCP、桌面 IPC。相关的两点：① 文字冒充（主人不从声明读、前缀规则），FSA-01、02 断言拒绝；② 不可信文件（重复键、危险属性名、CSS、外部 URL），FSA-05 断言拒绝。译文只当文本输出，绑定不用 `innerHTML`。是否进 `docs/system/SECURITY-INVARIANTS.md` 由 T4 写手按该文件规则加一行（语义 ID），评审确认 |
| 9 | 调用次数 | 见下表 |
| 10 | 升级与数据 | A 段不写 Home。统一起点已登记（#1914），但没有改库或带版本文件的结构（第 6.2 节）；旧发行物行照常可读。文件格式 `format.ui.*` 进 Home 是 D 段的事，到时按 `VersionedFile` 走升级链 |
| 11 | 成果与过程项 | 配置不进成果库（需求 §3.1） |
| 12 | 页面与外壳 | 不出新页面，组件板加一节开发标本。不登记 DOM 事件（第 4.5 节）。页面资源无增长（第 9 节）。组件板标本是开发工具，不算定样，不用 D 轨合审新组件（没有新组件），D 评标本一节 |
| 13 | 错误 | `defineErrorCodes("ui", …)`，`error-owners.json` 加 `ui` 一条，路径只含新文件。不写 Error 子类 |
| 14 | 冲突面 | C1：`platform/ui-*.ts`、`plugin-manifest.ts`、`plugin-runtime`、`api/`。D：`design-system`、`plugin-sdk/src/ui.ts`、`ui.ts`。枢纽：`tooling/versions.json`、`error-owners.json`、`ci-product-subset.txt`。快照冲突见第 10 节。`apps/local-host/src/web-assets.ts`、`plugin-frame` 不归独占轨道 |

**调用次数（N42～N56 的口径：一次操作几个请求，每个请求几遍目录发现、几次授权核对、开几次库、读几次文件；按缓存过期后的真实成本算）。**

| 操作 | 请求 | 目录发现、授权核对 | 开库 | 读文件 |
| --- | --- | --- | --- | --- |
| **A 段**：进程启动 | 0 | 0 | 0 | 基线 4 个 JSON，各 1 次（模块初始化） |
| **A 段**：打开任一页面 | 比现在多 0 | 比现在多 0 | 比现在多 0 | 0。CSS 字节不变 |
| **A 段**：一次 `render` | 0 | 0。主人是已知的 `descriptor.plugin_id` | 0 | 0。工具对象按（主人，语言）记住，第二次起不重建 |
| **A 段**：插件启动 | 0 | 0 | 写发行物本来就有 1 次，不增加 | 声明几种语言读几个文件，各 1 次 |
| **A 段**：打开组件板 | 1 | 0 | 0 | 工作台语言文件 2 个，首次读后记住 |
| **第 16 批**：首屏，Soft Workbench，中文 | 比现在多 1（平台语言脚本），摘要长缓存，之后 304 或命中缓存 | 0。快照由 Home 选择的内存投影算，不走 `localWebActionContext`（N42） | 0 | `state.json` 只在选择变化后读 1 次 |
| **第 16 批**：首屏，其他皮肤 | 再多 1（皮肤 CSS）；字体最多 2 个，只在选用时 | 同上 | 0 | 同上 |
| **第 16 批**：切皮肤，发起窗口 | 1 个写动作，共用 1 份上下文 | 1 遍 | 0 | `state.json` 读写各 1 |
| **第 16 批**：切皮肤，别的窗口 | 经已有推送通道收 1 条失效信号，取快照 1 个；iframe 0 个（`connect-src 'none'`，走端口），只换 `<link>` | 0 | 0 | 0 |
| **第 16 批**：切语言 | 1 个写 Cookie；1 个批量取本页所有主人的语言包（N52：不按主人逐条请求）；iframe 0 个 | 0 | 0 | 每个主人每种语言首次读 1 次，之后走内存 |
| 后台 | 0。不轮询，不定时（N54），隐藏的窗口回到前台才重读 | 0 | 0 | 0 |

没有短 TTL 缓存（N55）：资源按摘要长缓存，内容变了地址就变；投影按版本失效。一次切换不进模型，不按插件各读一遍（FSS-20）。调用预算用例（N56）另有主人；A 段的 FSA-22 自己断言上面前四行。

## 12. 要用户定的事

写到这里都不停工；下面这些在对应片开工前问，按第六节攒成一批。A 段的合同与工具不依赖第 1、2 条。

**1. 量不到的资源怎样补（决策第 23 项其余部分）。** 门禁现在只量 `/assets/` 字面路由和内置包。

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| A | 门禁不动，只靠报告脚本和测试 | 不改门禁。HTML 内联、`/api`、英文变体变大时没有东西拦，「不把字节搬到未计量入口」靠评审 |
| **B（推荐）** | 第 16 批 C 段之前单开一个门禁 PR：测量范围加「HTML 首屏（中英文）」和登记表的行，规则还是只许变小；`/assets/ui-skin/…`、`/assets/locale/…` 这类带版本的路由由登记表教给门禁 | 要改门禁（红线，所以问）。一次把 C 段要搬的字节都量上，搬过去能看到净减 |
| C | 再加绝对预算上限 | 文档里已经取消过绝对预算；要维护数字，真实收益小 |

**2. 第 16 批语言和皮肤资源的放行。** 规则是新增资源先问。C 段每个主人每种语言都是新资源，可能上百个。

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A（推荐）** | 第 16 批带着实测，按类一次批准（`locale` 类多少字节，换来 HTML 减少多少），`userApproval` 写同一出处 | 用户只看一次；要求方案 1 选 B，否则净减看不到 |
| B | 所有语言打成一个按语言的大文件，只算 2 个新资源 | 批准简单，但每页都下发全部插件的词，正好违背「只加载用到的」 |

**3. A 段到 C 段之间 `ui.locales` 和 `ui.messages` 并存，算不算违反「不做双格式过渡」（决定 20）。** 第 6.1 节的解释：一个插件只能写一种，没有翻译器读两种，A 段只有样例写新的。

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A（推荐）** | 照第 6.1 节，A 段合入 `ui.locales`，同写拒绝，C 段删旧字段 | 两个字段并存到第 16 批；样例能走真实路径，满足本批「不能只交类型」 |
| B | A 段不进 Manifest，样例自己读文件 | 没有并存，但样例证明不了发行物和宿主路径，第 6 节推到 C 段才验证 |

## 13. 验收标准

下面是 A 段的验收。**`scripts/check-spec-coverage.mjs` 只读 `spec.md`，这些编号不进它的报告**，所以测试名同时写 FSA 和对应的 FSS 编号，报告看得到 FSS。

| 编号 | 标准 | FSS |
| --- | --- | --- |
| FSA-01 | 声明里写 `owner` 被 `TEXT_REF_SCHEMA` 和 `textRefProblems` 拒绝；主人只由 `ownedTextRef` 从可信目录填 | FSS-19、FSS-34 |
| FSA-02 | 键沿用 `STABLE_KEY`；前缀不是主人名被拒；`common.*` 绑到平台主人；各上限被拒 | FSS-34、FSS-37 |
| FSA-03 | 参数存原值；同一引用切语言重算数字和日期；字符串当 `count` 被拒；只有日期的不随时区差一天 | FSS-38、FSS-39 |
| FSA-04 | `TEXT_REF_SCHEMA` 是合法的 `SandboxSchema`；第 2.4 节每种用法都有一个样例能通过，包括 `literal` 被 `{ literal: false }` 拒绝 | FSS-36 |
| FSA-05 | 四种文件：未知字段、重复属性名（进 `JSON.parse` 之前，带路径）、危险属性名、超大、CSS 文本、选择器、函数、外部 URL、`format_version` 不符，都被拒绝 | FSS-16、FSS-25、FSS-37 |
| FSA-06 | `formatMessage` 按 `Intl.PluralRules` 选形式；第 3.5 节表格每一行都有用例；`{n\|a\|b}` 被语言包解析器拒绝；`tests/fill-message.test.ts` 不改仍过 | FSS-39 |
| FSA-07 | 同一输入在 Node 和 `--platform=browser` 打包后，`resolveUiEnvironment`、`formatMessage`、`resolveSkin` 结果 JSON 相等 | FSS-09、FSS-33 |
| FSA-08 | 快照不含令牌值和译文；服务端 `device` 是 `null`，`withDevicePreferences` 合并后才有；优先级链四层各有用例；换皮肤不改语言，换语言不改皮肤和选定字体 | FSS-01、FSS-20、FSS-33 |
| FSA-09 | `/ui` 打包到浏览器不含 Node 内建模块；只装 contracts 与 SDK 能跑；现有插件包字节不因此变大 | FSS-09 |
| FSA-10 | `inspectLocaleSet` 查出缺键、多余键、参数不一致、缺复数形式、`hidden_number`；CLI 和平台载入用同一函数，`blocking` 的拒绝 | FSS-37 |
| FSA-11 | Manifest 的 `ui.locales`：标记形状、`default` 不在列表、语言重复、跳目录路径、非 `.json` 被拒；与 `ui.messages`、`ui.translations` 同写被拒 | FSS-34 |
| FSA-12 | 发行物带 `locale_packs`；声明与内容不符拒绝保存；`pack.owner`、`pack.locale` 与声明不符拒绝载入；包内缺文件拒绝；写了 `ui.locales` 的沙箱包被拒绝并说明；旧行照常可读 | FSS-34、FSS-37 |
| FSA-13 | 基线文件解析通过；规格的角色全集覆盖现有 194 个令牌名，一个不少；明暗分支 114 个；`locked` 10 个 | FSS-02、FSS-26 |
| FSA-14 | `page-assets.mjs --base origin/main --report` 所有资源字节差为 0，贴进 PR | FSS-02 |
| FSA-15 | `palette.ts`、`foundation.ts`、`typeface.ts`、`craft-finish-bar.ts` 令牌声明处不再有写死的色值或数值（断言），没有第二份常量表 | FSS-26 |
| FSA-16 | 省略角色按「自己 → `follows` → 基线」补齐；只写 `page` 时 `desk`、`nav-bg` 跟随；写 `locked` 角色被拒；不引用规格外的角色；引用成环被拒 | FSS-16、FSS-25 |
| FSA-17 | 登记表每行文件存在、字节与 sha256 相符、许可齐全；目录里有表外文件失败；包的 `files` 覆盖每行；`route` 与 `web-assets.ts` 字面量一致 | FSS-31 |
| FSA-18 | 干净发行物里基线和语言文件可读，两款离线字体路由返回 200；修之前先证明是 404 | FSS-03、FSS-27 |
| FSA-19 | `render(request, ui)` 的 `ui` 由宿主按 Manifest 的主人给；插件读不到别的插件的词；`t` 用别人前缀被拒 | FSS-09、FSS-34 |
| FSA-20 | 组件板标本：服务端写绑定，浏览器切语言不整页刷新，输入框内容和焦点保留；`applyTextBindings` 不写 `value`、不用 `innerHTML`、有子元素的跳过；两边算的快照相等 | FSS-35 |
| FSA-21 | 两包样例：只装两包声明语言文件、`validate` 查出改坏的占位符、`ui.t` 读到中英文和快照；源码没有语言、皮肤分支；现有断言不改 | FSS-09 |
| FSA-22 | 第 11 节「调用次数」A 段四行：一次 `render` 不读文件、不开库、不做目录发现；基线每进程只读一次 | FSS-20 |
| FSA-23 | 现存页面无变化：现有词典、`L`、`/locale` 路由、`tests/i18n.test.ts` 不改仍过；页面文字和样式字节不变 | FSS-38 |
| FSA-24 | [人工] 手册、术语表、SSOT、包 README 改完，评审核对；第 9 节的账本接上预算方案 | FSS-29 |

## 14. 第 16 批要接着做的（从这份合同看到的）

- 字体方案加字号、行高、长文阅读、说明文字（第 3.4 节）。
- `PLUGIN_COMPONENTS` 搬进共同规格（第 3.3 节）。
- `ActionLocale = "zh" | "en"`（`actions.ts:79`）与 `WebLocale`、`WEB_LOCALES` 写死两种语言，要改由语言描述驱动。
- 内置插件和沙箱包的语言文件路径（第 6.2 节）。
- `FrameConfig` 与 `host.ui`（第 4.5 节）；登记 `molis-work:ui-environment-changed`。
- `renderButton` 等部件的 `label` 接 `BoundText`。
- 语言文件的 `format_version` 怎样走 `carriers`（第 3.1 节）。
