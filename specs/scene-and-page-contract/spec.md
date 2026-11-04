# 场景与生成页面公共合同（路线书 20 第 1 项）

状态：设计稿，2026-11-04 写，没有实现，也没有改合同代码。合同台 11-04 评审的四处必改与九条建议、评审台 11-04 退回的六项与五条小修（a～e）都已改进稿子；合同归 C 轨，由合同台按快照一次一个 PR 落（第 10 节）；第 6 节的页面形态要用户拍板（第 13 节第 1 条），定下之前第 6 节只算候选。实现排在合同合入之后。

## 0. 这份稿子做什么

[第 20 批第 1 项](../post-anticorruption-roadmap/reference/batches/20.md#batch-20-item-1)要交「角色、设置、场景定义、页面运行、保存／恢复及插件采用边界」的公共合同。本稿写六样：

1. **场景定义**（第 3 节）：场景包由哪些部分组成，每一部分交给哪个主人；
2. **设置**（第 4 节）：一项设置的有效值、来源和读写，引导、设置页和助理读写同一份；
3. **角色**（第 5 节）：场景包里带的角色模板，采用时交给 Characters；
4. **页面运行**（第 6 节）：生成页面的代码怎样隔离运行、怎样挂到首页、版本归谁；
5. **保存与恢复**（第 7 节）：多步采用的记录、续做、撤销、移除和升级；
6. **插件采用边界**（第 8 节）：插件要声明什么才能被场景配置，平台除此之外不碰插件的数据。

[第 2 项](../post-anticorruption-roadmap/reference/batches/20.md#batch-20-item-2)的场景套组声明叠在本稿上：§3.8 各项内容的字段、示范任务、「挡第几步」、版本与升级差异、随包带上但未启用的状态，都由第 2 项用这里的部分类型拼出来。本稿不定套组的字段。

产品规则已经定了，这里不重定：

- [Onboarding](../onboarding-coverage/spec.md) §3.8～3.12、§3.8.1，ONB-17～34、ONB-50～56；
- [Work Brief](../work-brief/spec.md) §1.3、§2，WBR-21～27；
- 第 36 批角色作用范围定样（用户 2026-11-04 选方案 C「默认跟随，改了才覆盖」，[#1801](https://github.com/molis-ai/molis-work/pull/1801)，合入后改成仓库内链接）；
- 第 20 批第 2 项只读核查与三项统筹裁定（[#1793](https://github.com/molis-ai/molis-work/pull/1793)）；
- 第 08 批技能包合同稿（[#1794](https://github.com/molis-ai/molis-work/pull/1794)，`specs/skill-packs/contract-design.md`）。

现有合同能用的都直接复用：

| 要表达的 | 复用 |
| --- | --- |
| 依赖哪种能力 | Manifest 的 `requires`（`PluginRequirementDeclaration`，含 `optional`） |
| 只有声明的插件、签名的内容包、随包带上未装 | 08 的 `kind: "content"`、内容包、`plugins.bundled.list@1` |
| 安装与信任 | `plugins.install.preview`、`plugins.install.confirm`、`verifyPluginPackageSignature`、这个 Home 现有的发布身份（`apps/local-host/src/plugin-builder/publisher-identity.ts`） |
| Skill 的精确引用与启用 | 08 的 `SkillRef`、`skills.settings.set@1` |
| 角色 | `modules/characters` 的 `CharacterDraft`、`characters.create@1` 等；层次与生效按 36 |
| 页面隔离 | 不透明框架 `apps/workbench/src/browser/plugin-frame/`（S-47：固定脚本清单、`connect-src none`、动作走页面网关） |
| 基础首页里的呈现 | 05② 的呈现声明与 `SurfaceSlotKind` 的 `home`（只用在基础首页里，见第 6 节）（[#1771](https://github.com/molis-ai/molis-work/pull/1771)） |
| 界面文字 | 14 的 `TextRef`（`platform/ui`） |
| 有界 JSON 结构 | `SandboxSchema`（`platform/plugin-sandbox.ts`） |
| 对象身份 | `ActionSubject` |

## 1. 原则

- **场景包不存用户数据，只提建议。** 场景包里每一部分都是「建议某个主人这样配」。采用时调那个主人的公开动作写进去，回读结果才算生效；之后这份配置归那个主人，与场景包分开演进（ONB-55）。
- **一个事实一个主人。** 角色归 Characters，设置归各自的主人，页面的版本归首页提供方，Skill 启用归 Agent 定义登记，插件安装归 Plugin Runtime。新的平台服务只拥有两样：场景包草稿，和「这次采用做了什么」的记录（第 7 节）。
- **插件同等待遇。** 官方场景套组、个人场景包、AI 生成的草稿用同一份声明、同一条采用路径；宿主不按插件名、套组名或「官方」开分支（ONB-53）。首页提供方也按能力找，宿主里不写 Work Brief 的名字（WBR-23）。
- **场景包不能放宽权限。** 采用不授予动作、不扩大连接的使用范围、不重新开启停用项、不越过主人的硬限制（§3.11 末段）。会改权限、花钱、对外发、开定时的项，在预览里单独标出，由本人确认。
- **可信身份不从输入读。** 操作者、项目、安装从调用上下文来；采用由本人在预览后发起，按本人的授权逐项调用。
- **现行取值。** 按 N35 原地改形状，不留旧取值的读取兜底（第 11 节）。

## 2. 现状（2026-11-04 核对 main `4fd250564`）

| 现在 | 位置 | 问题 |
| --- | --- | --- |
| 角色只有你自己的草稿，发布进项目成为固定版本；没有项目默认和个人默认，个人工作拒绝角色 | `modules/characters/src/open.ts:15-41`、`publications.ts:16,65-85`；`apps/local-host/src/assistant/assistant-service.ts:306` | 场景包带不进角色模板；36 定的「跟随、覆盖、恢复」要先有层次（36 实现） |
| 设置各管各的：模型设置是 Manifest 的 `model_configuration`（存哪、两个动作）；项目运行时存 `null` 表示沿用；记忆有 `personal`、`project-default`、`project:<id>` 三层；插件设置页靠 `settings_data` 读一个动作 | `packages/contracts/src/platform/plugin-model-configuration.ts:44-51`；`apps/local-host/src/project-runtime-settings.ts:17-31`；`horizontal/memory/src/prefs.ts:19-40`；`packages/contracts/src/platform/ui.ts:447` | 没有统一的「有效值＋来源＋读写」形状：引导、设置页、助理各读各的，ONB-21～23 要的「同一份有效值」做不到 |
| 引导的采用是宿主私有代码：建项目、导入 Pages、整理待办，用 `discover()` 找动作、按 `request_id` 防重 | `apps/local-host/src/context-onboarding-service.ts:442-470`；`context-onboarding-store.ts:47-83` | 只认这几步；没有逐项的未执行／已生效／失败／待核对，也没有撤销与移除 |
| 项目里加哪些插件，只有项目设置页的 HTTP 能改，没有动作；表在 `modules/projects`，常开与随行的规则在宿主 | `modules/projects/src/project-records-repository.ts:42-52`；`apps/local-host/src/web-catalog-routes.ts:113`；`apps/local-host/src/project-plugin-enablement.ts` | 采用调不到；事实与规则分在两处（P-3a 合到 `modules/projects`） |
| 场景包没有任何声明；套组的内容 Manifest 大多放不下 | #1793 核账第一节 | 本稿与第 2 项补 |
| 插件页面跑在不透明框架里，脚本只能是包里固定的几份，动作走页面网关、受安装的 `consumes` 与授权限制 | `apps/workbench/src/browser/plugin-frame/`；S-47 | 这是生成页面能复用的隔离 |
| 生成插件的界面是 `interface.json`：零件从组件板挑、绑定到操作 | `apps/local-host/src/sandbox-package.ts:92-103`；`packages/design-system/src/plugin-components.ts` | 只能排列现有零件，满足不了「模块库没有的交互」（§3.10） |
| 首页只有平台的基础首页；没有「项目用哪个首页」的设置，也没有 Work Brief 插件 | `apps/workbench/src/`；`plugins/native/` | 首页提供方、项目选哪个首页，都没有合同 |
| 签名包只认沙箱包，且必须带 `plugin.mjs` | `apps/local-host/src/sandbox-package.ts:76-104` | 08 加内容包；页面包同理要加（第 6 节） |

## 3. 场景定义

**名字。** 界面与文档只用一个名字：**场景包**。没保存的叫「场景包草稿」，不另叫「方案」；「场景方案」不用（容易和「消费场景」混）。用户 11-04 定的「官方场景套组」指随安装包带上的那几个场景包，界面上要不要改称「官方场景包」，是改用户定过的名字，交统筹问（第 13 节第 4 条）。英文键用 `blueprint`：`scene` 已被消费场景占用（`action_scenes`、`scenes:use`、`services.scenes`，GLOSSARY「消费场景 | scene」）。合同 PR 里在 GLOSSARY 加一行（「场景包」｜`blueprint`｜旧称：场景方案、方案）；第 2 项的 Manifest 键沿用 `blueprint`。

**三种来路，一个形状。**

| 来路 | 存在哪 | 签名 |
| --- | --- | --- |
| 官方套组 | 随安装包带上的内容包（08），Manifest 的 `blueprint` 键（第 2 项加进内容包白名单） | Molis Work 发布者（第 26 批） |
| 个人场景包（另存下来的） | 同上，由「另存」生成的内容包 | 这个 Home 的发布身份 |
| 草稿（AI 按目的生成、访谈里成形、改到一半的） | 场景服务的草稿表（第 7 节），没装、不签名 | 不签名；草稿只是数据，采用时它要装的东西（Skill、页面代码）各自打成签名包 |

草稿采用时**不必先装成包**：只配置已有主人（角色、设置、已装插件）的草稿，采用就是逐项写给主人。只有要装新东西时才打包签名：草稿里的新 Skill 打成内容包，新页面打成页面包（第 6 节），都用这个 Home 的发布身份，走同一个安装确认。这是对统筹裁定第 3 条「AI 生成的方案用这个 Home 的发布身份签名」的落法，请统筹确认（第 13 节第 2 条）。

**形状**（`packages/contracts/src/platform/blueprints.ts`，新子路径）：

```ts
interface Blueprint {
  title: TextRef;
  parts: BlueprintPart[];        // 至少一项；part_id 在场景包内唯一、跨版本稳定（升级差异按它对）
  // 第 2 项在这里加：目的、示范任务、步骤与「挡第几步」、运行条件说明……
}

/** 场景包从哪来。不放进 Blueprint 本身：包的身份来自安装记录，草稿的来自场景服务，都不从内容里读。采用记录按它记。 */
type BlueprintSource =
  | { kind: "package"; plugin_id: string; version: string }   // 内容包：plugin_id 与 SemVer
  | { kind: "draft"; draft_id: string; revision: number };    // 草稿

interface BlueprintPart {
  part_id: string;
  required: boolean;             // false：缺了只挡受影响的步骤（ONB-54）
  layer: "project" | "personal"; // 建议写到哪一层，与设置写入的 layer 同名；本次任务的参数不进方案（第 4 节）
  proposal: BlueprintProposal;
}

type BlueprintProposal =
  | { kind: "capability"; requires: PluginRequirementDeclaration }        // 要有哪种能力；平台按能力找提供方，不写插件 id
  | { kind: "skill"; skill: { pack: string; skill_id: string }; state: "auto" | "manual" }  // pack 是内容包的 plugin_id
  | { kind: "role"; template: RoleTemplate }                              // 第 5 节
  | { kind: "setting"; key: string; value: SandboxJson }                  // 第 4 节，key 是主人声明的设置项
  | { kind: "connection"; category: string; purpose: TextRef }            // 需要哪类服务的账号；不带凭据
  | { kind: "content"; type: string; body: SandboxJson };          // 交给声明接受这种内容的主人（第 8 节）：首页、工作流程、项目说明草稿……；type 写成带主人前缀的类型 id，如 molis.home-page.v1、<主人>.<名字>.v1
```

每种建议对应一个主人和一条采用路径：

| 建议 | 主人 | 采用时调什么 | 回读 | 撤销或移除时 |
| --- | --- | --- | --- | --- |
| `capability` | Plugin Runtime；项目的插件成员 | 有提供方而没装：采用**不装**，这一步停在 `needs_install` 并给出 `plugins.install.preview` 的 `preview_id`，由本人在普通的安装确认里装，装好后续做（第 7 节；随包带上的也一样，ONB-53）；装了没进项目：`projects.plugins.set@1`（新，第 10 节 P-3a） | 安装记录、项目插件成员 | 只撤这次采用加进项目、之后没人再用的；不卸载。「有人在用」指：别的采用记录还引用它，或你在采用之后自己改过项目插件成员（`projects.plugins` 的 revision 变了） |
| `skill` | Agent 定义登记（08） | 预览把 `pack`（内容包的 plugin_id）解析成本范围的安装（`install_id`），找不到就标依赖未满足；采用调 `skills.settings.set@1` | `skills.catalog.list@1` | 状态仍是采用写的那个时改回 `off` |
| `role` | Characters（36） | `characters.from_template@1`（第 5 节） | `characters.subject.read@2` | 解除这次采用建的项目成员；你的角色本身留着（ONB-56） |
| `setting` | 声明这一项的主人（第 4 节） | 主人的写动作 | 主人的读动作 | 值仍是采用写的那个（revision 没变）时恢复采用前的值或沿用 |
| `connection` | connector-host | 采用不连账号，只标「去连接」，挡受影响的步骤 | 连接状态 | 无 |
| `content` | 声明接受这种内容的主人（第 8 节） | 主人的采用动作 | 主人的读动作 | 主人的撤回动作；主人没声明撤回的，只解除绑定 |

**校验分两步**，因为「有没有主人」要看此刻装了什么：

- **静态检查**：SDK 的 `inspectBlueprint(blueprint)`，不看目录。查 `part_id` 重复、建议种类、各项上限、`TextRef` 的形状、角色模板的形状。内容包安装、场景服务存草稿、第 2 项的套组键都调它，坏的场景包整份拒；错误照 08 的写法给 `problems: Array<{ part_id?: string; reason: string }>`。
- **主人检查**：在 `blueprints.adoption.preview@1` 里做。设置项、内容类型、能力此刻没有主人或提供方的那一项，标 `blueprints.part_unsupported`（没人声明）或 `blueprints.dependency_unmet`（能力没装），只挡受影响的步骤（ONB-54）。所以一个套组依赖还没装的插件，照样装得上。

## 4. 设置

**一项设置**由它的主人声明、保存、给出有效值。平台不存设置值，也不另建「设置中心」的第二份名单（§3.11「引导与设置页读写同一份有效配置」）。

```ts
// packages/contracts/src/platform/settings.ts（新子路径）
interface SettingEntryDeclaration {
  key: string;                     // 写成 "<主人>.<名字>" 只是命名约定，不是身份（见下）
  title: TextRef; summary?: TextRef;
  layers: Array<"project" | "personal">;   // 主人保存哪几层
  schema: SandboxSchema;           // 有界；只描述值，不许放凭据（凭据只走连接）
  consequence?: Array<"reach" | "cost" | "external" | "schedule">;
  // 扩大范围前要说明的后果（§3.11 末段）。reach：扩大可读或可观察的范围（如记忆回看范围、观察范围）。
  // 设置不能扩大授权，授权只走 grants，所以没有 "permission" 这一项。
}

interface SettingsDeclaration {    // Manifest 的 `settings_entries`；系统提供方在登记里给同一个形状
  entries: SettingEntryDeclaration[];
  read: Pick<ActionReference, "capability_id" | "version">;   // 输入输出类型见下
  write: Pick<ActionReference, "capability_id" | "version">;
}

export const SETTINGS_READ_INPUT_TYPE = "molis.settings.read.request.v1";
export const SETTINGS_READ_OUTPUT_TYPE = "molis.settings.values.v1";
export const SETTINGS_WRITE_INPUT_TYPE = "molis.settings.write.request.v1";

interface SettingsReadInput { keys: string[] }   // 一次读本主人的多项；项目从上下文来
interface EffectiveSetting {
  key: string;
  state: "ok" | "unavailable";     // unavailable：读不到或尚不可用，带 reason，不用默认值冒充（§3.11 末段）
  value?: SandboxJson;
  source?: "project" | "personal" | "provider_default";
  layers?: { project?: SandboxJson; personal?: SandboxJson; provider_default?: SandboxJson };
  revision: string;
  reason?: string;
}
interface SettingsWriteInput {
  key: string;
  layer: "project" | "personal";
  change: { set: SandboxJson } | { inherit: true };   // inherit：删掉这一层，恢复沿用上一层
  expected_revision: string;
  request_id: string;              // 重复提交只生效一次（ONB-28）
}
```

- **取值顺序**：项目 → 个人 → 提供方默认。主人可以有更严的硬限制，写入越过硬限制就拒，方案和模板也绕不过。
- **本次任务的值不归主人**：「只用这一次」的参数随那一轮或那件任务走（起跑时冻结），不写进任何主人。消费方显示时按「本次 → 主人给的有效值」叠一层，来源写「本次」。所以 `layers` 里没有「本次」。
- **读写动作的 schema 由平台定死。** `validateSettingsDeclaration` 要求 `read`、`write` 指向的本插件动作，其 `input_schema`、`output_schema` 与平台导出的那份一字不差（与 08、#1791、#1798 同一条规矩）；条目的 `schema` 只描述 `value`。
- **受众**：读给 `user`、`plugin`、`agent`；写第一片只给 `user`。助理要改设置，出建议卡由本人确认，不直接写。
- **key 不是身份。** 平台按声明它的那个安装认主人，不看 key 的前缀；同一范围里两个安装声明同一个 key，像 `ui.messages` 一样，后装的那个被拒。
- **SDK 给一份**：`defineSettingsActions`（按平台的 schema 声明读写动作）、`bindSettingsHandlers`（在这里统一做 `request_id` 去重和 `expected_revision` 核对，主人不各写一份）、`validateSettingsDeclaration`，和按上面顺序算有效值的 `resolveEffectiveSetting(layers)`。主人只写存取，顺序、来源和去重都只有这一份。
- **谁先改到这个形状**：现有的设置都要按 N35 原地改成这个形状，按消费方需要的先后排，不在本批做。名单写在这里，实现时逐项开片：模型设置（`model_configuration` 并进 `settings_entries`）、项目运行时（`projects.settings.runtime.*`）、记忆（现在的三层 `personal`、`project-default`、`project:<id>` 落成两项：个人记忆偏好只有 `personal` 层；项目记忆偏好的 `project` 层是 `project:<id>`，`personal` 层是 `project-default`，即你给所有项目的默认）、助理的主动回看范围与报告周期（主动助理 §3.1、§9.1）、工作记录的清理期限、各插件设置页里真正可配的项。插件设置页的 `settings_data` 仍然是「页面要显示什么」，与这里不冲突；页面上能改的值改走这对动作。
- 引导里每项「什么时候问」（复用、本次询问、首次使用时引导、高级入口）是第 45 批的准备声明，不在这里。

## 5. 角色

角色模板放在 Characters 的合同里（`packages/contracts/src/modules/characters.ts`），因为角色归 Characters：

```ts
interface RoleTemplate {
  title: TextRef;                          // 采用时按本人当时的界面语言解析成字符串存进草稿；草稿归本人，之后不随语言切换
  instructions: string;                    // 做事方式；上限同 CharacterDraft
  host_tools?: string[] | null;            // 同 CharacterDraft：只能收窄
  action_tools?: ExactActionReference[] | null;
  skills?: Array<{ pack: string; skill_id: string }>;   // 采用后解析成目录里的 SkillRef（BL-957）
  materials?: TextRef;                     // 材料范围的说明，不是授权
  outputs?: TextRef;
  works_with?: string[];                   // 同一场景包里协作的其他角色 part_id
}
```

- **采用动作** `characters.from_template@1`（command，只给本人）：按模板建一份你的角色草稿，记下来源 `{ source: BlueprintSource; part_id }`；标题按本人当时的界面语言解析成字符串存进草稿；同一个 `request_id` 只建一次。项目里已有同名角色时不覆盖，由预览让你选沿用还是另建（04 定样已画）。
- **层次与生效归 36**：项目成员默认跟随你的原件、改了哪一节哪一节成为本项目的、取值顺序「本次 → 本项目 → 你的默认 → 助理自己」、每次保存固定一个版本，都是 36 的合同。本稿只要求两件事：采用建的项目成员带着来源，以便升级时比差异、移除时只解除它（ONB-56）；模板不能放宽工具与动作（36 第三节「选角色不是授权」）。
- 套组升级时，模板变了只出现在升级预览里，由你挑着重新采用；不改你已经改过的角色（ONB-55）。

## 6. 页面运行（候选，待用户定）

§3.10 要两件事同时成立：生成的页面能有模块库没有的交互（要有页面自己的代码），又按不可信代码处理、复用平台隔离、安装信任与生命周期。今天能满足后一半的只有插件的不透明框架。两种做法：

| 做法 | 怎样 | 好处 | 代价 |
| --- | --- | --- | --- |
| **A 页面即插件（推荐）** | 生成的页面打成一个签名的**页面包**（这个 Home 的发布身份），作为普通插件安装：只有一个首页视图、页面脚本和它要用的动作（`consumes`），没有后端、动作、库和后台。运行时就是今天的插件页：不透明框架、固定脚本、动作走页面网关、受这个安装的授权限制。每件事一个主人：页面的源文件、版本历史、人工修改与差异归首页提供方（Work Brief）；项目里正在跑哪个版本归 Plugin Runtime 的安装记录；项目用哪个首页归 `projects.home`。提供方对后两项只读，不另存「哪个项目用哪一版」 | 不新增授权主体，复用不透明框架与页面网关；安装确认就是 §3.10 的「展示依赖、权限与配置变化 → 采用」；停用、卸载、发布者撤销、升级差异都现成；生成页面和插件是同一种东西 | 要加一条安全不变量：今天框架里的固定脚本只来自宿主构建，页面包是第一次让**装进来的包**带自己的 JS 进框架（见下）；每个采用过的页面在插件列表里是一项（列表按 `kind` 收起）；每次改页面是新装一个版本；恢复旧版是把旧源文件签成更高的版本，再经一次正常的安装确认装上 |
| B 页面是首页提供方的内容 | 页面的源文件、要用的动作和版本都存在首页提供方里；平台另给一个「页面主体」：按（提供方安装、页面、版本）在不透明框架里运行，授权取页面声明的动作、提供方的授权与本人在采用时的批准三者的交集 | 页面的事实全在一处；切版本不用装 | 新增一种授权主体，要改 S-47 并补一组拒绝测试；首页提供方的授权得宽到覆盖任何页面可能要的动作，或由平台另管每个页面的授权，等于第二套安装 |

**按 A 写的合同项**：

- `PluginKind` 加 `"page"`。页面包：`payload.files` 是 `manifest.json` 加声明里列出的视图文件（html、js、css），不多不少；没有 `plugin.mjs`、`contract.json`、`interface.json`。Manifest 只许：身份与展示、`requires`、`capabilities.consumes`、`ui.views`（正好一个，位置 `stage`）、`ui.messages`、`ui.translations`、`presentation` 的消费。其余键出现就拒，SDK 的 `inspectPagePlugin(manifest)` 一处校验，与 08 的 `inspectContentPlugin` 同一写法。
- **新的安全不变量「装入的页面脚本」**（或扩展 S-47，编号由统筹给），随 P-4 落，每条配拒绝测试：
  - 框架只加载已验签、摘要与包内清单相符的视图文件，别的脚本来源一律不加载；
  - 页面策略 `connect-src 'none'`，不许 `eval`、不许内联脚本与内联事件；
  - 页面网关只认这个安装的 `consumes` 与当前授权，与别的插件页同一条路；
  - 每次启动视图前重新验签与核摘要，文件被改过就不运行，显示基础首页。
- **只有一个「首页」**：不在 `UI_VIEW_SLOTS` 里加 `home`。页面包的视图就是普通的 `stage` 视图；工作台的首页位置画什么，只看 `projects.home`：指着一个视图就画那个视图，`null` 就画平台的基础首页。05② 的 `SurfaceSlotKind` 的 `home` 是**基础首页里面**由组合服务排内容的位置，只在基础首页上用；被 `projects.home` 换掉的首页不经组合服务。所以合同里「首页」这个位置只有 `projects.home` 一处，`home` 这个 slot 只属于基础首页的组合。`kind: "page"` 的插件不进插件切换器和工作区标签，只在首页位置出现。
- **项目用哪个首页**是项目的一项设置，归 `modules/projects`，走第 4 节的形状（`projects.home` 的读写在 `modules/projects` 自己的库里，与 P-3a 搬进去的项目插件成员同一主人）：`projects.home`，值是 `{ plugin_id, view_id } | null`。`null` 或那个视图不可用（停用、卸载、加载失败、撤权）时显示平台基础首页（WBR-22），宿主不认插件名。
- **首页提供方**按能力找：`packages/contracts/src/services/home-pages.ts` 只定输入输出类型（预览、采用、列版本、比较、恢复），哪个插件实现就由它声明动作，场景服务和首页设置按类型发现，不写死 Work Brief。采用一页 = 提供方把这一版的文件与 Manifest 交给平台签名入口（第 6.1 节）、拿回 `plugins.install.preview` 的 `preview_id`，本人在正常的安装确认里确认（S-84：权限清单照常显示），装好后再写 `projects.home`。恢复上一可用版本走同一条路：提供方把旧源文件交给签名入口签成更高的版本，本人在恢复处点的那一下就是 S-84 的那次预览加确认（界面在恢复处直接展开那份安装预览），不是另一条捷径；权限没有扩大时预览里写明「没有新增权限」，但确认照样要本人点。回到基础首页只写 `projects.home = null`，立即生效。
- **预览**：页面在试用框架里跑（创作台试用的那套，S-47 末段），示例数据在界面上逐处标明；要真实写入的动作沿现有授权，试用不掩盖副作用（§3.10）。
- **生成工具**：打包与检查复用创作台的检查（G1～G6）和 05② 的 `validatePresentationDeclaration`；不另造一套。

### 6.1 平台签名入口

这个 Home 的发布身份归宿主的创作台（`apps/local-host/src/plugin-builder/publisher-identity.ts` 的 `studioPublisherIdentity`，「只在明确发布时调用」，撤销见 S-87）。插件、`horizontal/blueprints` 都不拿私钥，也不直接调签名（密钥只给引用）。所以加一个平台签名入口，归发布身份的主人：

- **`plugins.local_packages.sign@1`**（command，只给 `user`，提供方是宿主的 `plugin-install`，和 `plugins.install.preview`、`plugins.installed.enable` 同一个；它在宿主里调发布身份的签名函数，创作台不另注册动作）：输入包的种类（`content` 或 `page`）、Manifest 与文件；输出 `plugins.install.preview` 的 `preview_id`。每次调用就是一次明确的发布。首页提供方的「采用这一页」、场景服务的 `packs.save`、外部 Skills 导入（08 第 6 节）都在本人的调用里嵌套调它，带本人的上下文（第 7 节），只交文件，拿回 `preview_id`。
- **来源**：签名入口按调用上下文里的上一层（哪个提供方、哪个动作）写一份随包签名的来源记录：`ai_generated`（助理按 Skill 生成）、`imported`（从本机导入）、`saved`（另存）。来源不从输入读。安装预览在发布者「这个 Home」旁边写出来源，例如「这个 Home · AI 生成的页面」，让本人在 S-84 的确认里看得到这份代码是怎么来的。
- 它不装、不授予：装仍是 S-84 那一条路。

做法 B 若被选中，第 6 节改写，第 10 节的 P-4 换成「页面主体」合同与 S-47 的改动。

## 7. 保存与恢复

**新的平台服务** `horizontal/blueprints`（包名 `@molis-ai/molis-work-service-blueprints`，提供方 `system.blueprints`），宿主只做装配。它拥有两样，存在这个服务自己的 Home 库里（一次采用可能先建项目，也可能写个人一层，不属于某一个项目库）：

- **草稿**：`blueprint_drafts`，一行一份场景包草稿（`Blueprint` 的 JSON、revision、来源：访谈、目的、已有项目、一次工作）。
- **采用记录**：`adoptions` 与 `adoption_steps`。一次采用一行，按 `BlueprintSource` 记来源；每个部分一步，记下建议、调了哪个动作、幂等键、结果、主人回给的对象与 revision，以及采用前的值。

这个库进宿主唯一的 Home 存储登记（`HomeStoreDeclaration`，`packages/contracts/src/platform/plugin-database.ts:232`），三张表在 `tooling/gates/table-owners.json` 里记为本包独占。

**动作**（没有 MCP 工具；会等主人或模型的声明 `scheduling: "concurrent"`）。草稿只是数据，不改任何主人，所以给 `user` 与 `agent`；采用与另存只给 `user`：

| 动作 | 受众 | 种类 | 做什么 |
| --- | --- | --- | --- |
| `blueprints.drafts.save@1` | user、agent | command | 存或改一份草稿，带 `expected_revision`；先过静态检查。助理按目的生成草稿走它 |
| `blueprints.drafts.read@1` | user、agent | query | 读草稿 |
| `blueprints.adoption.preview@1` | user | command（write：存一份会过期的预览记录、发 `preview_id`，与 `plugins.install.preview@5` 同一种） | 输入：草稿或已装的场景包、目标（新项目、某个项目、个人）、选了哪些部分、本次改了哪些值。先做主人检查（第 3 节），再输出每个部分：会新建、复用、修改、要先安装还是跳过；当前值与来源、建议值、写到哪一层；后果标记；依赖是否就绪、缺了挡哪一步；同名冲突。主人的当前值按主人一次读齐 |
| `blueprints.adoption.apply@1` | user | command | 输入 `preview_id`、接受的 `part_id`、`request_id`。逐步调主人的动作，幂等键是 `<adoption_id>:<part_id>`；写完回读，读到才标「已生效」。遇到要安装的部分不装，标 `needs_install` 并给出它的 `preview_id`（见下） |
| `blueprints.adoption.read@1` | user | query | 一次采用的逐步状态：未执行、要先安装、已生效、失败（带主人的错误）、待核对、跳过 |
| `blueprints.adoption.revert@1` | user | command | 撤销这次采用仍归它的部分：主人当前的 revision 还是采用写下的那个，才恢复；否则跳过并写「之后被你改过」 |
| `blueprints.adoption.remove@1` | user | command | 从项目移除一个已采用的场景包（ONB-56）：同 `revert` 的规则，解除它拥有的配置与绑定；插件只在没有别的场景包和你自己用着时才撤出项目；稿件、待办、代码改动、你的角色都不动 |
| `blueprints.packs.save@1` | user | command | 把一份草稿或一次采用另存为个人场景包：组好内容包的 Manifest 与文件，交给平台签名入口（第 6.1 节）签名，返回 `plugins.install.preview` 的 `preview_id`，装仍由本人在安装确认里点。场景服务不碰私钥 |

**采用不转交本人的同意。**

- **安装只由本人确认。** `plugins.install.preview`／`confirm` 只接受本人的操作。`apply` 碰到要装的部分（缺的插件、草稿里新 Skill 打的内容包、页面包），把那一步标 `needs_install` 并返回 `plugins.install.preview` 的 `preview_id`；界面走普通的安装确认；装好后本人再调一次 `apply`（同一个 `request_id`），从那一步接着做。`apply` 自己从不调 `plugins.install.confirm`。
- **嵌套调用带着本人的上下文。** `apply`、`revert`、`remove` 调主人的动作（`projects.plugins.set@1`、`skills.settings.set@1`、`characters.from_template@1`、各主人的设置写与采用动作）时：操作者、项目取自本人这次调用的上下文；子调用的授权按本人核，不按 `system.blueprints` 核；动作网关在调用记录里记下上一层（`blueprints.adoption.apply@1` 与它的调用 id）。`system.blueprints` 自己没有替人写主人数据的授权。
- **新的安全不变量**（编号由统筹给），随 P-3c 落，拒绝测试覆盖两种：`apply` 直接调 `plugins.install.confirm` 被拒；`apply` 用系统身份而非本人上下文写设置被拒。

**规则**：

- **续做**：失败和待核对的步骤，重试时先用主人的读动作核对实际结果，再决定补写还是标已生效；已生效的不再调（ONB-28、ONB-45）。
- **取消与迟到**：取消后不再开新步；在途那一步按动作架构的规矩，`beforeEffect()` 后才记结果。撤权、项目切换、安装换代后迟到的结果不写进错误范围（§3.12）。
- **进度不靠轮询**：逐步状态变化发 Home 事件，页面订阅；重进时读一次 `adoption.read`。
- **升级（ONB-55）**：新版本的场景包出来后，`adoption.preview` 带 `upgrade_of: adoption_id`，按 `part_id` 三方比较：旧版建议、新版建议、主人现在的值。现在的值还是旧版建议的，列成「新版建议改成」；你改过的，列成冲突并默认保留你的；新版删掉的部分只提示，不自动撤。不升级时旧的采用照常可用。
- **删项目**：场景服务在项目删除回执里登记一步（目录删除时每个项目数据主人一步，`ProjectDeletionService` 是唯一入口），清掉指向这个项目的采用记录与预览；建在个人一层的采用不受影响。
- **主人不在了**：某一步的主人插件停用或卸载、角色被删后，`adoption.read` 把那一步标「主人已不在」；`revert`、`remove` 跳过它并如实写出，不假装撤销成功。主人再启用后，按 revision 规则照常可撤。
- **Home 快照与恢复**：场景服务的 Home 库登记进 `homeStoreRegistry`（`apps/local-host/src/home-stores.ts`），快照与恢复带上它。
- **页面的版本与恢复**归首页提供方（第 6 节）；采用记录里的 `page` 一步只记 `projects.home` 改了什么，撤销时恢复它。

## 8. 插件采用边界

插件（以及 Module、系统提供方）要被场景配置，只能经过下面三样声明；平台除此之外不碰插件的数据，也不为某个插件写采用代码（ONB-33）。

| 声明 | 写在哪 | 管什么 |
| --- | --- | --- |
| `settings_entries` | Manifest；系统提供方在登记里 | 可配的设置项与读写动作（第 4 节） |
| `adopts` | Manifest；系统提供方在登记里 | 接受哪些 `content` 建议：`{ type, title: TextRef, schema: SandboxSchema, adopt, read, revert? }`，三个都是本插件已声明的动作。首页提供方、工作流程、项目说明各声明自己的类型 |
| `requires`、`connections.slots`、`connection_services` | 已有 | 依赖与账号位置 |

- 一次采用里一种 `content` 类型只交给一个主人；有两个提供方都声明时，预览让你选，不按插件名定。
- 主人没有声明的，预览里那一部分标「提供方没有公开配置能力」，不能采用，宿主不兜底。
- `adopt` 动作的输入有平台给的固定部分：`request_id` 和 `blueprint`（`{ source: BlueprintSource; part_id }`，只作来源记录，不作授权），另加 `body`。声明里的 `schema` 只描述 `body`。
- 校验在 SDK：`validateSettingsDeclaration`、`validateAdoptsDeclaration`，安装时跑。`validateAdoptsDeclaration` 核 `adopt`、`read`、`revert` 都是本插件已声明的动作，固定部分确实在 `adopt` 的输入 schema 里、与平台导出的形状一字不差；声明不合法整个安装被拒并点名哪一项。
- 同一范围里两个安装声明同一种 `content` 类型时，后装的照样能装；采用时由预览让你选主人。`settings_entries` 的 key 不同：重复就拒后装的（第 4 节）。

## 9. 调用次数

- **预览**：一次动作目录发现；每个涉及的主人一次读（多项设置合成一次 `SettingsReadInput`）；缺插件时每个一次安装预览。不按设置项或部分逐个请求。
- **采用**：每个部分一次写；回读按主人合并成一次。进度走 Home 事件，不轮询。
- **重进**：一次 `adoption.read`。
- 页面运行与今天的插件页相同，不另加请求。

## 10. 合同项、子路径与快照

| 片 | 合同项 | contracts 子路径 | 影响的快照 | 前置 |
| --- | --- | --- | --- | --- |
| P-1 设置 | `SettingEntryDeclaration`、`SettingsDeclaration`、读写类型与类型 id、Manifest 的 `settings_entries`；SDK 的 `defineSettingsActions`、`bindSettingsHandlers`、`validateSettingsDeclaration`、`resolveEffectiveSetting` | `platform/settings.ts`（新）、`platform/plugin-manifest.ts` | api：`contracts/platform/settings`（新）、`contracts/platform/plugin-manifest`、`plugin-sdk/index`；动作快照不变（只定类型） | 02 交接 |
| P-2 角色模板 | `RoleTemplate`、`characters.from_template@1` 的声明 | `modules/characters.ts` | api：`contracts/modules/characters`；动作：`host-actions.tsv`（提供方 `io.molis.work.characters` 由宿主登记） | 36 的层次合同同一片或在它之后 |
| P-3a 项目插件成员 | `projects.plugins.set@1`：把插件加进或撤出项目，带 `expected_revision`，只给 `user`；常开插件撤不出，随行插件（如 Feed 带 Inbox）一起进出。表 `project_plugins` 已在 `modules/projects`（`project-records-repository.ts:42-52`），常开与随行规则今天在宿主（`apps/local-host/src/project-plugin-enablement.ts`）：这一片把规则搬进 `modules/projects`、与动作同一主人，宿主的项目设置 HTTP 改调这个动作 | `modules/projects.ts` | api：`contracts/modules/projects`；动作：`host-actions.tsv` | 05② 的 C-1（同一快照） |
| P-3b 场景定义 | `Blueprint`、`BlueprintSource`、`BlueprintPart`、`BlueprintProposal`、Manifest 的 `adopts`；SDK 的 `inspectBlueprint`（静态）、`validateAdoptsDeclaration`；GLOSSARY 加「场景包（blueprint）」一行 | `platform/blueprints.ts`（新）、`platform/plugin-manifest.ts` | api：`contracts/platform/blueprints`（新）、`contracts/platform/plugin-manifest`、`plugin-sdk/index` | P-1、P-2；08 的 C-1（`content`、`SkillRef`） |
| P-3c 采用动作与签名入口 | 第 7 节八个动作的声明与类型（`adoption.preview` 是 command／write）；`needs_install` 步骤状态；「采用不转交本人的同意」不变量与拒绝测试；第 6.1 节的 `plugins.local_packages.sign@1` 与安装预览里的来源字段 | `services/blueprints.ts`（新）、`platform/plugin-trust.ts`（安装预览的类型在这里） | api：`contracts/services/blueprints`（新）、`contracts/platform/plugin-trust`；动作：`host-actions.tsv`（`system.blueprints`、发布身份的主人） | P-3a、P-3b；08 的 C-2（`skills.*`） |
| P-4 页面（按 A） | `PluginKind` 的 `"page"`、页面包文件常量、`inspectPagePlugin`；`kind: "page"` 的插件不进切换器与标签；`services/home-pages.ts` 的类型；`projects.home` 设置项；「装入的页面脚本」不变量与拒绝测试 | `platform/plugin-manifest.ts`、`platform/plugin-package.ts`、`services/home-pages.ts`（新）、`modules/projects.ts` | api：上述各文件、`plugin-sdk/index`；动作：`host-actions.tsv`（项目设置的读写） | 第 13 节第 1 条定下；P-1、P-3a；08 的 C-1、C-3；05② 的 C-2 |

**先后**（合同台 2026-11-04 排，[#1806 评论](https://github.com/molis-ai/molis-work/pull/1806#issuecomment-6638722432)；同一份快照一次一个 PR，全部在 02 交接之后）：

| 顺序 | 片 | 动到的快照 |
| --- | --- | --- |
| 1 | 05② C-1 | `modules/projects`、新的 `platform/project-materials` |
| 2 | 08 C-1 | `plugin-manifest`（`kind: "content"`）、`plugin-agent` |
| 3 | 05② C-2 | `plugin-manifest`（`presentation`）、`platform/presentation` |
| 4 | P-1 设置 | `plugin-manifest`（`settings_entries`）、新的 `platform/settings` |
| 4′ | 08 C-2、#1791 K0（可与 P-1 并行，不动 `plugin-manifest`） | `services/skills`、`host-actions`；`platform/actions`、`platform/composer` |
| 5 | P-3a | `modules/projects`、`host-actions`（与 4′ 的 `host-actions` 错开） |
| 6 | P-2 角色模板（36 的层次合同之后） | `modules/characters`、`host-actions` |
| 7 | 05② C-3（第 14 批 `TextRef` 之后） | `services/surface-composition`、`host-actions` |
| 8 | P-3b、P-3c | `plugin-manifest`（`adopts`）、新的 `platform/blueprints`、`services/blueprints`、`host-actions` |
| 9 | 08 C-3 | `plugin-package`（沙箱方法写法） |
| 10 | P-4（用户定了 A 以后） | `plugin-manifest`（`kind: "page"`）、`plugin-package`、`modules/projects`（`projects.home`）、新的 `services/home-pages` |

- 快照文件名：`plugin-manifest.ts`、`plugin-package.ts` 没有自己的子路径，经 `platform/plugin` 导出，所以它们的改动都落在 api 快照 `contracts/platform/plugin.txt` 上；表里按源文件写，排序时视为同一份快照。
- 按快照看：`plugin-manifest` 是 08 C-1 → 05② C-2 → P-1 → P-3b → P-4；`modules/projects` 是 05② C-1 → P-3a → P-4；`plugin-package` 是 08 C-3 → P-4；`host-actions.tsv` 按上表依次落，同一时间只有一片在途。
- 全部在 M1 之前落，按 N35 一个 PR 改完所有消费者，不留兼容期。
- 错误码用 `defineErrorCodes`：`blueprints.part_unsupported`（主人没声明）、`blueprints.step_conflict`（主人的 revision 变了）、`blueprints.dependency_unmet`、`blueprints.preview_expired`；设置的拒绝由主人给 `<主人>.setting_invalid`、`<主人>.setting_conflict`，SDK 的 bind 帮主人按主人名生成，不新增平台码。P-1 落时按 `tooling/gates/error-owners.json` 核主人名。

## 11. 存量数据

场景服务的三张表是新库。设置改形状、Characters 加来源字段都动已有库。分界照 05②、08：看 **02③ 真实 Home 重建**：

- 重建之前落：直接改第 1 版的建表，不写迁移。
- 重建之后落：走 U1 的升级链写一步升级，这是红线，开 PR 前由统筹先问用户。

引导现有的 `context-onboarding` 库不在本批动；它和场景服务的草稿怎样合，由第 44 批定。不加读取兼容。

## 12. 界面

第 20 批的界面要求是「复用 04；影响交互的合同差异先定样」。本稿不决定任何交互，所有字段都够几种候选画法用。和 04 的样（[onboarding-full-journey](../../docs/design/onboarding-full-journey/README.md)）比，合同带出四处 04 没画的，各交给要做它的批次在实现前定样：

| 差异 | 04 现在 | 交给 |
| --- | --- | --- |
| 有效值的来源（本次、本项目、个人默认、默认） | 来源标记按「让版面说话」去掉了 | 44 的完整路径定样：来源仍要能看到（§3.11），放进「?」或展开处，由 44 定 |
| 采用中途停在「要先安装」：转到普通的安装确认（验签名、本人确认），装好回到采用接着做 | 只画了「缺一个插件、挡哪一步」 | 44 的挑套组两种入口定样 |
| 撤销、移除场景包、套组升级的差异 | 没画 | 44 |
| 页面采用、恢复上一版、回到基础首页 | 首页是占位 | 37 的「页面采用／恢复」定样 |

D 轨若要在组件板补「逐步状态」「三方差异」的标本，由 44、37 的定样提出。

## 13. 要定的事

1. **页面形态 A 还是 B**（第 6 节）。这是对 Work Brief §2「页面定义归 Work Brief」的落法：A 下，页面的源文件、版本与恢复仍归首页提供方，运行中的那一份是一个插件安装，代价是要加一条「装入的页面脚本」安全不变量（装进来的包第一次带自己的 JS 进框架）；B 下全部归首页提供方，但要新增授权主体、改 S-47。推荐 A，合同台同意。要用户拍板，请统筹问。
2. **草稿采用时不必先打包**（第 3 节）：只有要装的新东西（Skill、页面代码）才签名打包。合同台 2026-11-04 核过，符合 #1793 裁定第 3 条的更正（个人场景包、AI 生成的草稿、外部导入都用这个 Home 已有的发布身份）。
3. **场景服务放在 `horizontal/blueprints`**，草稿与采用记录在它自己的 Home 库（第 7 节）。合同台 2026-11-04 确认，与第 21 批 D2 同一做法。
4. **界面名统一成「场景包」**（第 3 节）：「场景方案」「方案」不再用；用户 11-04 定的「官方场景套组」要不要改称「官方场景包」，是改用户定过的名字，请统筹问用户。英文键 `blueprint`。
5. **平台签名入口** `plugins.local_packages.sign@1`：合同台 2026-11-04 定，提供方是宿主的 `plugin-install`（和安装预览、启用同一个），在宿主里调发布身份的签名函数；发布身份本身留在原处。创作台是批过的构建期例外（BL-377 重做），不往它身上加动作。只给本人，每次是一次明确发布（第 6.1 节）。

## 14. 验收编号（候选）

实现时，测试名或注释写出这些编号。

| 编号 | 要达到的结果 | 对应 |
| --- | --- | --- |
| SPC-01 | 同一份场景包无论来自套组、个人场景包还是草稿，都由同一个静态 `inspectBlueprint` 校验，走同一个 `adoption.preview`／`apply`；代码里没有按套组名、插件名或「官方」的分支 | ONB-53、ONB-33 |
| SPC-13 | 一个套组依赖还没装的插件时照样装得上；预览里那一项标依赖未满足，只挡受影响的步骤 | ONB-54 |
| SPC-15 | 首页提供方、场景服务都拿不到私钥：页面包与个人场景包只经 `plugins.local_packages.sign@1` 签名，安装预览写出来源（AI 生成、导入、另存），来源不从输入读 | S-84、S-87 |
| SPC-16 | 删项目后指向它的采用记录被清；主人插件停用或卸载后，那一步标「主人已不在」，撤销跳过并如实写出 | ONB-56、§3.12 |
| SPC-14 | `apply` 碰到要装的部分停在 `needs_install`，从不调 `plugins.install.confirm`；本人装好后同一个 `request_id` 续做；`apply` 用系统身份写主人数据被拒，嵌套调用的调用记录里有上一层 | ONB-53、ONB-34 |
| SPC-02 | 预览逐项写出新建、复用、修改、跳过，当前值与来源、建议值、层次、后果和缺的依赖；会改权限、花钱、对外发、开定时的项单独标出 | §3.12、ONB-19 |
| SPC-03 | 采用逐项调主人的动作并回读；在任一步制造失败、取消和重启，再继续不重复建角色、成员、页面，不重复外部效果；待核对的先读再定 | ONB-28、ONB-45 |
| SPC-04 | 同一项设置从引导、设置页和助理改，读到同一个有效值和来源；`inherit` 恢复沿用上一层；本次任务的值不写进主人 | ONB-21～23、ONB-31 |
| SPC-05 | 场景包写的设置越过主人的硬限制被拒；采用不新增动作授权、不扩大连接使用范围、不开启停用项 | §3.11 末段、ONB-34 |
| SPC-06 | 角色模板采用后是你的角色，带来源；同名时不覆盖；模板的工具与动作只能收窄 | ONB-17、ONB-20 |
| SPC-07 | 撤销与移除只处理主人 revision 未变的部分；你之后改过的、别的场景包还在用的插件、稿件、待办、代码改动和你的角色都保留 | ONB-30、ONB-56 |
| SPC-08 | 场景包升级按三方比较列出差异，你改过的默认保留；不升级时原采用照常可用 | ONB-55 |
| SPC-09 | 插件没声明 `settings_entries` 或 `adopts` 的部分在预览里标「提供方没有公开配置能力」，不能采用 | ONB-33 |
| SPC-10 | （按 A）页面包带后端、动作、库或多余文件时安装被拒并点名；框架只加载验签、摘要相符的包内视图文件，内联脚本、`eval`、直接网络都被拒；文件被改过就不运行；页面只能调本安装获准的动作 | §3.10、ONB-26 |
| SPC-11 | （按 A）`projects.home` 指的视图停用、卸载、加载失败或撤权时显示基础首页；恢复上一版、回到基础首页都不重做已完成的业务动作 | WBR-22、WBR-27、ONB-25 |
| SPC-12 | 采用进度在页面上实时更新，不轮询；重进只读一次 | 第 9 节 |

## 15. 开工前检查

按[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md) §4 作答。本片只写设计稿，下表是实现与合同片要守的结论。

| # | 结论 |
| --- | --- |
| 1 事实主人 | 新事实只有两样，归新服务 `horizontal/blueprints`：场景包草稿、采用记录。角色归 Characters、设置归各自主人、Skill 启用归 Agent 定义登记、安装归 Plugin Runtime、页面源文件与版本历史归首页提供方、项目里跑哪个版本归安装记录、项目首页选择归 `projects.home`（提供方对后两项只读）；签名归发布身份的主人（第 6.1 节）。读别人的事实只走第 4、8 节的读动作，场景服务不缓存主人的值 |
| 2 插件同等待遇 | 套组、个人包、草稿同一条路；首页提供方、`content` 主人按声明的类型找；生成页面（按 A）就是一个普通签名插件。宿主只装配场景服务，不新增构建期接线 |
| 3 能力注册 | 第 7 节八个动作（`adoption.preview` 是 command）由 `system.blueprints` 注册一次；设置与采用都是主人自己声明的动作，读写 schema 由平台定死。草稿给 `user`、`agent`，采用与另存只给 `user`。嵌套调用的操作者、项目取自本人的调用上下文，授权按本人核，`system.blueprints` 不替人写；`adoption.apply`、`adoption.preview`、`packs.save` 等主人或签名的声明 `concurrent` |
| 4 合同 | 改。新子路径 `platform/settings`、`platform/blueprints`、`services/blueprints`、`services/home-pages`；改 `platform/plugin-manifest`、`platform/plugin-package`、`platform/plugin-trust`、`modules/characters`、`modules/projects`；不动 `platform/ui`。M1 前，按 N35 一个 PR 改完消费者；合同先单独开 PR，按快照一次一个（第 10 节） |
| 5 放在哪个包 | 场景服务是 `horizontal/` 下的新包，依赖 contracts 与 plugin-sdk，经动作目录调主人，不 import 任何插件或 Module 的实现；共用校验在 SDK |
| 6 表与存储 | 新表 `blueprint_drafts`、`adoptions`、`adoption_steps` 归场景服务自己的 Home 库：进宿主的 Home 存储登记（`HomeStoreDeclaration`），在 `table-owners.json` 里记为本包独占。设置值仍在各主人的库里；项目插件成员的规则随 P-3a 搬进 `modules/projects`，与表同一主人 |
| 7 兼容与迁移 | 不加。现有设置改形状、Characters 加来源字段按 02③ 分界（第 11 节）；重建之后才落的要走升级链，先由统筹问用户 |
| 8 安全边界 | 碰。安装只走 S-84 由本人确认（含「恢复上一版」那一下），签名只经发布身份主人的入口（S-87 照旧，第 6.1 节）；加两条不变量（编号由统筹给），各配拒绝测试：「采用不转交本人的同意」（P-3c：`apply` 不替人确认安装、不用系统身份写主人数据）；按 A 的「装入的页面脚本」（P-4：只加载验签、摘要相符的包内视图文件，`connect-src none`、无 `eval` 与内联，启动时重核）。按 B 则改 S-47 并补一组拒绝测试。采用不授予权限（SPC-05） |
| 9 调用次数 | 第 9 节：预览每个主人一次读，采用每部分一次写、回读按主人合并，进度走 Home 事件不轮询 |
| 10 升级与数据 | 采用后的配置在各主人那里，按主人自己的升级规则保留；场景服务的库登记进 `homeStoreRegistry`，快照与恢复带上；删项目经 `ProjectDeletionService` 的回执清掉对应采用记录；主人卸载后那一步标「主人已不在」；采用记录、草稿随场景服务的库进升级链；场景包升级不自动改主人的值（第 7 节） |
| 11 成果与过程项 | 草稿与采用记录不是成果，不进成果库；另存的个人场景包是插件（内容包），也不进成果库 |
| 12 页面与外壳 | 不新增整页例外：生成页面挂在首页位置，跑在不透明框架里；采用进度若要跨模块的 DOM 事件，在 `dom-events.ts` 登记。不涉及页面资源 |
| 13 错误 | 场景服务的码用 `defineErrorCodes("blueprints", …)`；设置的拒绝由主人按主人名给，不写 Error 子类（第 10 节） |
| 14 冲突面 | 本片只新增本 spec、改 `specs/README.md` 索引与第 20 批文件。合同片要动的枢纽：`plugin-manifest.ts`（与 08 的 C-1、05② 的 C-2 同一快照，合同台排序）、`platform/plugin-trust.ts`（P-3c，签名入口与来源）、`modules/characters.ts`（与 36 同一片或叠在后面）、`modules/projects.ts`（05② C-1 → P-3a → P-4）；先后见第 10 节合同台排的表、`tooling/gates/actions/host-actions.tsv` |
