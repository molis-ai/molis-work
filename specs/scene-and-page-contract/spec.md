# 场景与生成页面公共合同（路线书 20 第 1、2 项）

状态：部分实施，2026-11-04 起草，2026-11-08 补齐第 20 批场景包声明与合同验收边界。P-3a 的 owner、合同与独立运行恢复段已在本地批分支实施，宿主动作、HTTP 及界面接入未完成；其他合同仍在设计与等待前置阶段，证据见批次文件。保留 11-04 评审修订及用户确定的首页归属。第 20 批全部合同在同一批分支按依赖接力、一个 PR 交付（第 10 节）；第 36 批角色层次合同只挡 P-2b 采用接口，P-2a 模板与静态校验继续。第 37／44 批承担页面与引导的服务、交互和真实路径验收，不能拿本批静态校验代替。P4 分工由用户 2026-11-08（PST）明确选择：「按批次分工（推荐）：20 完成公共合同、SDK 校验和本批必要接入；37 完成页面运行及真实安全验收，未完成项明确保留。」

## 0. 这份稿子做什么

[第 20 批第 1 项](../post-anticorruption-roadmap/reference/batches/20.md#batch-20-item-1)要交「角色、设置、场景定义、页面运行、保存／恢复及插件采用边界」的公共合同。本稿写六样：

1. **场景定义**（第 3 节）：场景包由哪些部分组成，每一部分交给哪个主人；
2. **设置**（第 4 节）：一项设置的有效值、来源和读写，引导、设置页和助理读写同一份；
3. **角色**（第 5 节）：场景包里带的角色模板，采用时交给 Characters；
4. **首页与生成页面**（第 6 节）：首页作为平台能力怎样组成、插件怎样注册卡片、生成页面怎样存版本与隔离运行；
5. **保存与恢复**（第 7 节）：多步采用的记录、续做、撤销、移除和升级；
6. **插件采用边界**（第 8 节）：插件要声明什么才能被场景配置，平台除此之外不碰插件的数据。

[第 2 项](../post-anticorruption-roadmap/reference/batches/20.md#batch-20-item-2)的场景包声明在第 3.1～3.4 节：§3.8 的内容、示范任务、「挡第几步」、版本与升级差异、随包带上但未安装的状态，都沿同一个 Blueprint 与内容包合同表达。首批三套的原型、成品与贯穿任务按批次交付：行业观察与写作、写代码归第 44 批，个人事务与每日简报归第 51 批，不在本批制作。

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
- **一个事实一个主人。** 角色归 Characters，设置归各自的主人，首页与生成页面归平台的首页服务（第 6 节），Skill 启用归 Agent 定义登记，插件安装归 Plugin Runtime。场景服务只拥有两样：场景包草稿，和「这次采用做了什么」的记录（第 7 节）。
- **插件同等待遇。** 官方场景包、个人场景包、AI 生成的草稿用同一份声明、同一条采用路径；宿主不按插件名、场景包名或「官方」开分支（ONB-53）。首页是平台能力，插件卡片只经 05② 的呈现声明进首页，宿主和首页都不写 Work Brief 或别的插件名（WBR-23）。
- **场景包不能放宽权限。** 采用不授予动作、不扩大连接的使用范围、不重新开启停用项、不越过主人的硬限制（§3.11 末段）。会改权限、花钱、对外发、开定时的项，在预览里单独标出，由本人确认。
- **可信身份不从输入读。** 操作者、项目、安装从调用上下文来；采用由本人在预览后发起，按本人的授权逐项调用。
- **现行取值。** 按 N35 原地改形状，不留旧取值的读取兜底（第 11 节）。

## 2. 现状

**2026-11-08 本批基线 `226ce892a8`：** 下表保留 11-04 的历史问题定位，不再用作前置未合入的证据。当前源码已有 `PluginKind: "content"`、SDK `inspectContentPlugin` 与 `parseContentPackage`；但白名单尚未收 `blueprint`，内容包仍要求至少一个方法，文件读取尚无场景正文。05 的资料／呈现／组合合同与 14 的 `TextRef`、共用校验已存在。主会话核对 08 C-2／C-3 仍在 #1984（核对头 `cbbeb06cf19354a10bbf4109417cc535ee20ed77`），占 `platform/plugin.txt`、SDK index 与 `host-actions.tsv`，接入这些位置须等待交接。角色现有公开类型仍是 `CharacterDraft`／`CharacterContent`，36 的层次设计不等于已交付合同。开工前完整回答见 [Onboarding 第 11 节](../onboarding-coverage/spec.md#batch-20-preflight)。

**历史核查（2026-11-04，main `4fd250564`）：**

| 现在 | 位置 | 问题 |
| --- | --- | --- |
| 角色只有你自己的草稿，发布进项目成为固定版本；没有项目默认和个人默认，个人工作拒绝角色 | `modules/characters/src/open.ts:15-41`、`publications.ts:16,65-85`；`apps/local-host/src/assistant/assistant-service.ts:306` | 场景包带不进角色模板；36 定的「跟随、覆盖、恢复」要先有层次（36 实现） |
| 设置各管各的：模型设置是 Manifest 的 `model_configuration`（存哪、两个动作）；项目运行时存 `null` 表示沿用；记忆有 `personal`、`project-default`、`project:<id>` 三层；插件设置页靠 `settings_data` 读一个动作 | `packages/contracts/src/platform/plugin-model-configuration.ts:44-51`；`apps/local-host/src/project-runtime-settings.ts:17-31`；`horizontal/memory/src/prefs.ts:19-40`；`packages/contracts/src/platform/ui.ts:447` | 没有统一的「有效值＋来源＋读写」形状：引导、设置页、助理各读各的，ONB-21～23 要的「同一份有效值」做不到 |
| 引导的采用是宿主私有代码：建项目、导入 Pages、整理待办，用 `discover()` 找动作、按 `request_id` 防重 | `apps/local-host/src/context-onboarding-service.ts:442-470`；`context-onboarding-store.ts:47-83` | 只认这几步；没有逐项的未执行／已生效／失败／待核对，也没有撤销与移除 |
| 项目里加哪些插件，只有项目设置页的 HTTP 能改，没有动作；表在 `modules/projects`，常开与随行的规则在宿主 | `modules/projects/src/project-records-repository.ts:42-52`；`apps/local-host/src/web-catalog-routes.ts:113`；`apps/local-host/src/project-plugin-enablement.ts` | 采用调不到；事实与规则分在两处（P-3a 合到 `modules/projects`） |
| 场景包没有任何声明；官方场景包的内容 Manifest 大多放不下 | #1793 核账第一节 | 本稿与第 2 项补 |
| 插件页面跑在不透明框架里，脚本只能是包里固定的几份，动作走页面网关、受安装的 `consumes` 与授权限制 | `apps/workbench/src/browser/plugin-frame/`；S-47 | 这是生成页面能复用的隔离 |
| 生成插件的界面是 `interface.json`：零件从组件板挑、绑定到操作 | `apps/local-host/src/sandbox-package.ts:92-103`；`packages/design-system/src/plugin-components.ts` | 只能排列现有零件，满足不了「模块库没有的交互」（§3.10） |
| 首页只有平台的基础首页；没有「项目用哪个首页」的设置，也没有 Work Brief 插件 | `apps/workbench/src/`；`plugins/native/` | 首页服务、项目选哪个首页、生成页面的版本，都没有合同（第 6 节） |
| 签名包只认沙箱包，且必须带 `plugin.mjs` | `apps/local-host/src/sandbox-package.ts:76-104` | 08 加内容包；生成页面不打包，不碰这里（第 6 节） |

## 3. 场景定义

**名字。** 界面与文档只用一个名字：**场景包**。没保存的叫「场景包草稿」，不另叫「方案」；「场景方案」不用（容易和「消费场景」混）。随安装包带上的那几个叫「官方场景包」（原称「官方场景套组」，用户 11-04 在合同台的弹窗里定改名，第 13 节第 4 条）。英文键用 `blueprint`：`scene` 已被消费场景占用（`action_scenes`、`scenes:use`、`services.scenes`，GLOSSARY「消费场景 | scene」）。合同 PR 里在 GLOSSARY 加一行（「场景包」｜`blueprint`｜旧称：场景方案、方案）；第 2 项的 Manifest 键沿用 `blueprint`。

**三种来路，一个形状。**

| 来路 | 存在哪 | 签名 |
| --- | --- | --- |
| 官方场景包 | 随安装包带上的内容包（08），Manifest 的 `blueprint` 键（第 2 项加进内容包白名单） | Molis Work 发布者（第 26 批） |
| 个人场景包（另存下来的） | 同上，由「另存」生成的内容包 | 这个 Home 的发布身份 |
| 草稿（AI 按目的生成、访谈里成形、改到一半的） | 场景服务的草稿表（第 7 节），没装、不签名 | 不签名；草稿只是数据，采用时它要装的新 Skill 打成签名的内容包（生成页面不打包，存进首页服务） |

草稿采用时**不必先装成包**：只配置已有主人（角色、设置、已装插件）的草稿，采用就是逐项写给主人。只有要装新东西时才打包签名：草稿里的新 Skill 打成内容包，用这个 Home 的发布身份签名，走同一个安装确认；新首页不打包，是首页服务自己的内容（第 6 节）。合同台 2026-11-04 核过，符合统筹裁定第 3 条（第 13 节第 2 条）。

**形状**（`packages/contracts/src/platform/blueprints.ts`，新子路径）：

```ts
interface Blueprint {
  title: TextRef;
  parts: BlueprintPart[];        // 至少一项；part_id 在场景包内唯一、跨版本稳定（升级差异按它对）
  purpose: { audience: TextRef; work: TextRef; inputs: TextRef; outputs: TextRef; first_result: TextRef };
  steps: Array<{ step_id: string; title: TextRef; part_ids: string[] }>;
  example_task: { title: TextRef; input: TextRef; step_ids: string[]; result: { part_id: string; location: TextRef } };
}

/** 场景包从哪来。不放进 Blueprint 本身：包的身份来自安装记录，草稿的来自场景服务，都不从内容里读。采用记录按它记。 */
type BlueprintSource =
  | { kind: "package"; plugin_id: string; version: string }   // 内容包：plugin_id 与 SemVer
  | { kind: "draft"; draft_id: string; revision: number };    // 草稿

interface BlueprintPart {
  part_id: string;
  required: boolean;             // false：用户可不选；被选步骤仍须满足它引用的部分（第 3.2 节）
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
| `role` | Characters（36） | `characters.from_template@1`（第 5.2 节） | 同一主人的 `characters.roles.read@1` 批读合同 | 解除这次采用新建且 revision 仍匹配的项目成员。个人原件保留（ONB-56） |
| `setting` | 声明这一项的主人（第 4 节） | 主人的写动作 | 主人的读动作 | 值仍是采用写的那个（revision 没变）时恢复采用前的值或沿用 |
| `connection` | connector-host | 采用不连账号，只标「去连接」，挡受影响的步骤 | 连接状态 | 无 |
| `content` | 声明接受这种内容的主人（第 8 节） | 主人的采用动作 | 主人的读动作 | 主人的撤回动作；主人没声明撤回的，只解除绑定 |

**校验分两步**，因为「有没有主人」要看此刻装了什么：

- **静态检查**：SDK 的 `inspectBlueprint(blueprint, options)` 按第 3.5 节接收来源模式和包版文字主人，不看目录。检查字段、引用、建议种类、上限与角色模板。内容包安装与场景服务存草稿共用它，坏的场景包整份拒。问题沿用带字段路径和 `reason` 的 `PluginDeclarationProblem`。
- **主人检查**：在 `blueprints.adoption.preview@1` 里做。设置项、内容类型、能力此刻没有主人或提供方的那一项，标 `blueprints.part_unsupported`（没人声明）或 `blueprints.dependency_unmet`（能力没装），只挡受影响的步骤（ONB-54）。所以一个官方场景包依赖还没装的插件，照样装得上。


### 3.1 场景包声明与内容去向（20-2）

Manifest 只加 `blueprint?: { locales: string[] }`，不内嵌第二份 Blueprint。键存在就要求默认文件 `blueprint.json`；译文只列在 `locales` 中，路径是 `blueprint.<语言>.json`。所有文件都由现有内容包签名与文件清单覆盖。`kind: "content"` 的 `methods` 非空或 `blueprint` 存在至少满足一个；纯场景包可没有 Skill。只扩现有 `inspectContentPlugin` 白名单与 `parseContentPackage` 的文件清单／返回值，继续拒绝入口、权限、动作、数据库及 UI 贡献；不借场景包放开 `agent` 或运行代码。

| ONB §3.8 内容 | 唯一表达位置 | 采用后的主人／边界 |
| --- | --- | --- |
| 目的 | `purpose.audience/work/inputs/outputs/first_result` | 短说明，只供挑选与预览，不当作事实或执行指令 |
| 个人助理与助理团 | `role` 部分的 `RoleTemplate`；`layer` 区分个人／项目，`works_with` 引用本包其他 role 的 `part_id` | Characters；个人助理仍沿原身份，模板不创建第二个跨项目助理 |
| Skill、方法与流程 | `skill` 引用包和 Skill；固定流程用 `content`，其 `type` 与 `body` 由工作流程主人声明 | Skill 目录、工作流程主人；`steps` 只描述起步顺序与依赖，不是第二个流程执行器 |
| 背景、资料、目录、规则、规划方法 | `content` 部分交给声明该内容类型的项目／资料主人；规则做法复用 `skill` 或角色 `instructions` | 不在 Blueprint 新建材料库或目录表；用户真实资料、路径及授权在预览时选，不随模板带出 |
| 模型、用量、主动程度、周期、通知、观察范围 | `setting` 部分引用主人的稳定 `key` 和建议值；能力依赖为 `capability`，账号依赖为 `connection` | 有效值与来源由第 4 节读取；没有公开设置的标未支持，设置建议不自动形成委托 |
| 首页与起步内容 | `content` 的首页类型、主人的内容类型；现有页面合同表达内容和动作绑定 | 首页服务、各内容主人；生成页面不变成插件；没有依赖不显示可用假按钮 |
| 示范任务 | `example_task` 的标题、真实输入说明、`step_ids` 和结果 `part_id/location` | 结果部分须指向 `capability` 或 `content` 的实际主人；location 是对结果位置的说明，不是假造的对象 ID。完成后对象由主人返回 |

所有场景共用这些字段，不设 `official` 或三个内置场景的分支。声明不能用文本冒充能力：缺少 owner schema、公开动作、目录绑定时只保留建议并说明未就绪。长正文仍在 `content.body`／`RoleTemplate.instructions`，不拆入界面词表；示范任务使用用户自己的输入，需要展示样例的正文须明确说明是示例。

### 3.2 必需、可选与受影响步骤

- `part_id`、`step_id` 在本包内唯一且跨版本稳定；`steps[].part_ids` 明列该步骤所需全部部分，包括相关角色、Skill、能力、账号、设置和内容；只引用存在的部分，不靠文字推断依赖。角色的 `works_with` 只指向其他角色，不能自指。`example_task.step_ids` 只引用已有步骤，其结果部分必须被所引步骤使用。
- `required: true` 表示完成这套场景声明的起步路径需要它；`false` 表示可以不选。无论必需或可选，缺失只挡引用它的步骤，其他步骤可继续；选了可选步骤仍要补齐该步骤的依赖。未选、待补、已具备是采用预览的结果，不作为包里的安装状态。
- `capability.requires` 复用 `PluginRequirementDeclaration`，按 `capability_id@version` 找提供方，不写目标插件 id；其 `optional` 与该部分的 `required` 互为反值（未写 `optional` 即必需），矛盾声明静态拒绝。`connection.category/purpose` 复用连接目录可识别的类别和用途，只表达需要账号，不携带连接 ID、凭据或扩大使用范围。
- Manifest 的 `requires` 仍是**包本身启用**的条件；场景步骤的能力建议归 Blueprint，不把它们全部复制为包级必需依赖。内容包没有运行进程，因此纯场景包通常不需要包级 `requires`。这保留 08 的启用语义，也让缺一个场景能力时仍可装包、查看建议并完成其他步骤（ONB-54／SPC-13）。
- 静态上限统一在合同导出：部分至多 128、步骤至多 128，引用数组不超过对应集合；短文字沿 `TEXT_REF_LIMITS`，角色正文沿 Characters 上限，内容沿 `SandboxJson` 与原内容包字节／文件上限；不因增加多语言扩大包预算。静态检查不访问动作目录，不校验用户此刻是否已连账号。

### 3.3 语言、版本与保存错误

按 [14 的语言合同 §15.3／15.4](../font-and-skin-system/a-section-contract.md#154-内容包与场景包交第-20-批合同)执行：有场景包就必须有 `ui.locales`；`blueprint.locales` 是 `ui.locales.available` 的子集，只列译文、不列默认语言、不可重复，单语言写 `[]`。语言文件与全部场景文件必须不多不少；包拒 literal、草稿拒 key。`inspectBlueprintLocales(default, others)` 只允许 `TextRef`、`instructions` 与 `content.body` 不同，结构、稳定 ID、能力／Skill 引用、设置值、依赖与步骤均相同。`body` 的 schema 留给采用预览按所用语言向主人校验，SDK 不 import 主人的实现。

采用记录与草稿记 `locale`，正文和标题等按采用时语言选定；回退按 14／08 既定规则，不改变包版本。包身份与版本来自安装记录的 `BlueprintSource`，不在 Blueprint 再加版本或安装身份。所有语言共用 Manifest 的版本。场景升级沿第 7 节按稳定 `part_id` 比「旧版建议、新版建议、主人当前值」，并保持采用语言：用户修改默认保留，新增／删除／依赖变化明确列出；包升级不等于重新采用，拒绝升级继续使用原采用。步骤与示范任务变化也展示，但它们不写业务数据。移除仍按 SPC-07／16 保留用户内容与共享依赖。

`packs.save` 将 literal 转为稳定键，生成草稿语言的单语言词表与 `blueprint.json`；不自动翻译用户内容。内容包只放宽 14 已允许的标记字符，占位符规则不变。遇到 `{foo bar}`、`{pr-number}` 或旧复数写法时，在保存前拒绝，错误指出场景标题／字段及问题片段，并给「改成 `‹foo bar›` 或 `[foo bar]` 后再保存」；不自动改字，不把 `ui.locale_placeholder`／`ui.locale_old_plural` 当用户文案。`{file}` 仍按共用规则处理。校验失败不签名、不写包、不改采用记录。存包服务与用户界面由第 44 批消费这份规则；本批用共用校验与打包边界证明可检测、可定位。

### 3.4 随包带上、尚未安装

沿 08 的 `plugins.bundled.list@1` 读取已验签包的身份、名称与说明；未安装的场景正文从同一份验证过的内容包读，不另建场景登记库。包版校验的 `owner` 来自该包验签后通过解析的 `manifest.plugin_id`。以 `tryOwnedTextRef` 绑定引用，再经 `createTextReader` 按调用语言解析，HTML 不用 `.text`。这里只列候选，不能把 bundled 当 install_id、项目成员、启用或授权。尚未选用时不登记 Skill、不出现在工作台／项目，不起进程；选中才走普通安装预览、本人确认、项目启用与场景采用。离线挑选不等于所有依赖离线可用。发布者密钥、签包和安装包资源由第 26 批处理，本批不碰凭据、不制作官方发行包。

### 3.5 P-3b 静态实施设计

`contracts/platform/blueprints` 导出 §3 的四种类型和 `BLUEPRINT_LIMITS`（`parts`、`steps` 各 128）。`BlueprintProposal` 使用 §5.1 的 `RoleTemplate`、现有 `PluginRequirementDeclaration`、`TextRef` 和 `SandboxJson`。上文的 `BlueprintSource` 展示来源形状，实际定义与 schema 复用第 36 批提前合同的 `platform/blueprint-source.ts`，交接后从本子路径转出。校验模式和包版文字主人均由外层给出。正文不带来源、包版本、安装、操作者或项目身份，因此静态校验无需等 P-2b 或 36 的角色服务。

SDK 入口为 `inspectBlueprint(value: unknown, options: { source: "draft" } | { source: "package"; owner: string }): readonly PluginDeclarationProblem[]`。包读取调用方给已解析 Manifest 的 `plugin_id`，运行时按 §3.4 取已验签包。空数组表示通过。先查对象、数组及上限，再查引用。所有有明确定义字段的对象均闭合，必填字段按 §3 的形状，包括建议分支、目的、步骤与示范任务。每个部分的 `required` 必须为布尔值，`layer` 只收 `personal`／`project`。`setting.value`、`content.body` 按现有 SDK `sandbox-schema.ts` 的 `assertJson` 核对有界 JSON，值里的字段交给主人。问题路径用 `$.parts[2].proposal.requires.optional` 这类实际字段位置，包读取附文件路径，经 `refuseDeclarations` 整包拒绝，保留 `plugin.declaration_invalid`。

| 建议 | 静态检查 |
| --- | --- |
| `capability` | `requires` 只收 `capability_id`、正安全整数 `version`、非空 `reason` 和可选布尔 `optional`，版本用 SDK `validVersion`。`required: true` 对应省略 `optional` 或 `false`，`required: false` 对应 `optional: true`。Manifest 检查里的 `capabilities.consumes` 与包级启用规则留在原处。 |
| `skill`／`role` | Skill 的 `pack`、`skill_id` 沿 §5.1 的插件 ID 与 Skill token 规则，`state` 只收 `auto`／`manual`。角色复用同一份 §5.1 模板校验，把问题路径挂到 `proposal.template`。`works_with` 的指向由场景部分集合核对。第 09 批 #1993 的角色说明消费同一内容合同，本片不另加白名单键或模板字段。 |
| `setting`／`connection`／`content` | 设置 key 沿 P-1 规则。连接类别非空并检查 `purpose` 的文字引用。内容 `type` 用 §3 的 `<主人>.<名字>.v<正整数>` 形状，与 §8 的 `adopts.type` 共用这一检查。是否存在该设置、类别、内容类型及其主人，以及值是否满足主人 schema，留给采用预览。 |

用一个部分索引和一个步骤索引核对本包引用。两个 ID 集合各自唯一，标识非空。重复或悬空的 `part_ids`、`step_ids`、`works_with` 要定位到引用项，数组不超过各自可引用集合。`works_with` 只指其他 role，表示协作关系。步骤实际需要协作者时在 `part_ids` 明列。`example_task.result.part_id` 须为 `capability` 或 `content`，并被 `example_task.step_ids` 选中的至少一个步骤引用。校验保持声明顺序，跨版本稳定性在升级预览按 ID 比较。

采用预览以后直接按 `steps[].part_ids` 判受影响步骤。`required` 决定整套起步路径对该部分的要求。可选部分可以跳过，选了引用它的步骤就需要它。比如一项可选订阅未连接，只挡明列它的调研步骤，独立的写作步骤仍可继续。角色协作和示范任务的描述不会隐式添加步骤依赖，依赖也不会复制到 Manifest `requires`。静态检查没有目录输入，缺安装、连接或主人时仍可读到有效 Blueprint。

`inspectBlueprintLocales(defaultBlueprint: unknown, others: readonly { locale: string; blueprint: unknown }[], options: { owner: string })` 同样返回声明问题。同一 Manifest 的 `owner` 传给每份正文的 package 模式。`TextRef` 沿 SDK `textRefProblems` 和 `tryOwnedTextRef`，包只收键并检查主人（含 `common.*`），草稿只收 literal。角色校验复用相同模式，问题路径加上模板所在字段前缀。比较时仅允许声明里的 `TextRef`、role 的 `proposal.template.instructions` 和 content 的 `proposal.body` 的值变化，外层字段是否存在保持一致。对象忽略键顺序，数组保持顺序。`setting.value` 里的同名字段仍按原值比较，引用、步骤和 `requires.reason` 也须一致。问题指出译文文件和第一个不同的结构字段。读取并比较一次即可，调用方继续使用已校验的正文。

**接入现有包读取。** `parsePluginManifest` 在既有内容包检查中接 `blueprint`，验证闭合的 `{ locales }`、与 `ui.locales` 的子集关系及非默认、去重。仅 `kind: "content"` 接受 `blueprint`，至少一个 method 或一份 Blueprint。随包提供的 methods 仍逐项检查。沿 08 的 `ui.locales` 检查和 14 的 `parseLocalePack`／`inspectLocaleSet`，词表文件与声明的语言和包主人相符，保留词表回退和阻断规则。包读者用现有预期文件清单计入默认 `blueprint.json`、列明的译文与声明的语言文件，在同一份 UTF-8／文件数／字节限制下解码校验。`parseContentPackage` 的结果新增可选 `blueprint: { default: Blueprint; others: readonly { locale: string; blueprint: Blueprint }[] }`，默认语言从 Manifest 取。默认与译文的正文一次检查，文字读取按验过的包主人走 `tryOwnedTextRef`／`createTextReader`。声明 `adopts` 的实际动作及固定 schema 核对仍按 §8，在共享 Manifest 接线时做。

**文件与顺序。** 实施用 `packages/contracts/src/platform/blueprints.ts`、`packages/plugin-sdk/src/blueprints.ts` 和 `tests/blueprint-contract.test.ts`。复用 P-2a 的 `role-template.ts`，P-1 的设置边界在其合同到位后接。按 §10 的共享文件交接，由单一写手串行接 `packages/contracts/package.json` 的既定子路径、SDK `index.ts`、`plugin-manifest.ts` 及 SDK 的 `manifest.ts`、`content-plugin.ts`、`content-package.ts`，统一刷新 `contracts/platform/blueprints`、`contracts/platform/plugin` 与 `plugin-sdk/index` API 快照。包读取接 08 的同一条已验签内容包入口。基点 `7098d6c37d` 的 Host 尚无 `parseContentPackage` 调用，真实安装证据须等该入口接通。跨包调用和定向测试走公开出口。

**验收映射。** SPC-C03 从 `contracts/platform/blueprints` 消费类型与上限，从 SDK 根调用 `inspectBlueprint`。验包与草稿正例、超限和多余身份字段、重复／悬空引用、互相协作和自指的区别、结果在未选步骤或指向错误建议种类、必需／可选不一致，以及可选依赖尚未安装仍通过静态检查。SPC-C04 经公开 `parseContentPackage` 验纯场景包、仅 methods、混合包与空包，覆盖缺／多文件、坏语言清单、译文改步骤／能力／设置值。SPC-C05 经公开 `inspectBlueprintLocales` 和内容包词表读取验三类允许的译文变化、来源文字模式及占位符问题的文件与词键。草稿转词时，另存消费者须把生成的键映回场景字段，复用 14 的占位符诊断并按 §3.3 提供替换建议。字段映射与失败无写入在该消费者实际接入时验。实际受影响步骤、采用和安装行为沿 SPC-01／02／13 另验。

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
- **SDK 给一份**：`defineSettingsActions`（按平台的 schema 声明读写动作）、`bindSettingsHandlers`（按下述 owner 事务接口统一做 `request_id` 去重和 `expected_revision` 核对，主人不各写一份）、`validateSettingsDeclaration`，和按上面顺序算有效值的 `resolveEffectiveSetting(layers)`。主人只写存取，顺序、来源和去重都只有这一份。
- **谁先改到这个形状**：现有的设置都要按 N35 原地改成这个形状，按消费方需要的先后排，不在本批做。名单写在这里，实现时逐项开片：模型设置（`model_configuration` 并进 `settings_entries`）、项目运行时（`projects.settings.runtime.*`）、记忆（现在的三层 `personal`、`project-default`、`project:<id>` 落成两项：个人记忆偏好只有 `personal` 层；项目记忆偏好的 `project` 层是 `project:<id>`，`personal` 层是 `project-default`，即你给所有项目的默认）、助理的主动回看范围与报告周期（主动助理 §3.1、§9.1）、工作记录的清理期限、各插件设置页里真正可配的项。插件设置页的 `settings_data` 仍然是「页面要显示什么」，与这里不冲突；页面上能改的值改走这对动作。
- 引导里每项「什么时候问」（复用、本次询问、首次使用时引导、高级入口）是第 45 批的准备声明，不在这里。

**P-1 的原子写接口（合同建议，不新增存储）。** SDK 不依赖 storage，也不持有 Map 幂等缓存；主人给 `transaction(run)`，在同一个持久化写事务里向同步回调提供 `readReceipt`、`readCurrent`、`writeChange`、`saveReceipt` 四项存取。receipt 保存原请求与原返回值；作用域由已绑定的 owner／actor／项目加 key、layer、request_id 组成，可信身份不进动作输入。SDK 的顺序固定：找到相同请求的 receipt 就返回原结果；同键不同内容拒绝；否则读当前 revision，核对 expected_revision 与主人硬限制，写值并回读，最后同事务写 receipt，任一失败全部回滚。有效 revision 必须覆盖会影响当前有效值的各层变化，不能只核被写层。成功重放不被原请求的旧 revision 拦住；取消或撤权先经 `beforeEffect()` 拒绝，不能补 receipt。

事务回调内不 await、不调外部动作，异步准备在 `beforeEffect()` 前完成；SDK 复用现有动作绑定、输入 schema 与 TextRef 校验。存储侧已有 `packages/storage/src/sqlite.ts` 的 immediate 事务及 `modules/projects/src/repository.ts` 的 owner 事务模式，`horizontal/memory/src/preferences.ts`／`operations.ts` 有业务写与操作记录同事务的参考；它们不是 SDK 依赖，也不直接拿来共写别人的表。没有持久化 receipt 的 owner 不能宣称具备重启幂等；给存量 owner 加表／字段属于版本与升级红线，先交主会话问用户，不在 P-1 静态合同里偷偷迁移。

P-1 可先在独占的新合同／SDK settings 文件形成待接片，最终统一接 `plugin-manifest`、SDK index、内容校验及快照；未接公开入口前只是候选实现，不算交付。不得为等 #1984 另抄一份 schema、TextRef 校验或 Manifest 解析。第 14.1 节的并发与重启用例须由实施者给出证据。

### 4.1 P-1 实施设计

| 公共入口 | 输入与返回 |
| --- | --- |
| `defineSettingsActions(options)` | 主人给共同的 `scope`，以及读写各自的 `capability_id`、`version`、标题、说明和权限。SDK 返回可用于 Manifest 和运行时绑定的 `{ read, write }` 两个动作定义。读为 `query`，受众为 `user`、`plugin`、`agent`。写为 `command`，受众仅 `user`。 |
| `validateSettingsDeclaration({ settings_entries, actions, plugin_id })` | 返回带字段路径的声明问题。按 `capability_id` 和 `version` 找本主人的动作，用 `canonicalJsonText` 比较固定 schema，并核对类型 ID、读写效果和受众。校验条目的 key、可写层及后果枚举，拒绝重复 key。条目标题和摘要沿呈现声明复用 `textRefProblems` 和 `tryOwnedTextRef`，接入 `parsePluginManifest` 的 `refuseDeclarations`。 |
| `resolveEffectiveSetting(snapshot)` | 主人给 `key`、有效 `revision` 与各层值，或不可用状态与原因。返回 `EffectiveSetting`，按项目、个人、提供方默认取第一个存在的值，保留 `null`、`false`、`0` 等有效值。 |
| `bindSettingsHandlers(actions, declaration, owner)` | 返回两个 `ActionHandlerBinding`，复用 `bindActionHandler`。主人提供 `read(scope, keys)` 批量返回层快照，以及 `transaction(scope, run)` 同步提供 §4 所列四项存取。读取与写后回读都用 `resolveEffectiveSetting`。 |

在 `platform/settings` 导出类型和固定动作 schema。读输入为 `SettingsReadInput`，写输入为 `SettingsWriteInput`。两者输出共用 `SettingsValues`（`{ values: EffectiveSetting[] }`）及 `SETTINGS_READ_OUTPUT_TYPE`，写只返回一项事务内回读结果。闭合输入对象，`change` 只收 `set` 与 `inherit: true` 其中一种。动作网关检查固定形状，SDK 再按条目校验 `set` 的值和允许写入的层，写项目层必须有可信项目上下文。新增协议类型 ID 的 v1 在 `tooling/versions.json` 首次登记，实际 owner 动作版本在该动作首次声明时登记。

owner 身份来自已绑定的安装或系统提供方，actor 与项目取自 `ActionExecutionContext`。执行完异步准备后 `await caller.beforeEffect()`，进入同步事务时用现有 `requireSynchronous(caller.assert_authority_current?.())` 和 `caller.signal?.throwIfAborted()` 做最终检查。以 owner、actor、项目、key、layer、`request_id` 查回执，用规范化 JSON 比对原请求，匹配即返回原结果。同键异内容和过期 revision 由 owner 的 `setting_conflict` 拒绝，层或值非法由 `setting_invalid` 拒绝。新写在事务内核对涵盖所有相关层的 revision 和主人硬限制，写值、回读并保存回执。各层的变更版本与默认值版本由主人提供，同一个值改回去仍能识别中间写入。回读或存回执失败，事务回滚本次值、revision 和回执。给存量主人加表、字段或持久回执需要单独的版本与升级授权。

把 `packages/plugin-sandbox/src/schema.ts` 中 `assertJson`、`assertSchema`、`assertMatches` 的有界校验逻辑提取到 SDK 新文件 `src/sandbox-schema.ts`。设置声明与值检查共用这份纯逻辑。沙箱保留原入口、限额、检查顺序与 `SandboxError` 的错误码及消息，runner、background、broker、签包读取及创作台继续经原入口。设置声明及写入分别走现有 Manifest 问题出口与 owner 的 `defineErrorCodes`。

安装归属复用 Runtime `install-rules.ts` 的 `DeclarationOwners` 和 Host `declaration-owners.ts` 的 `heldInstalls`。按动作目录可达交集判定，同项目及 Home 与任一项目间同 key 冲突，不同项目允许同名。按可信 `scope` 与 `install_id` 精确排除升级自身，禁用保留 key，卸载即释放。异步升级预检后在保存安装记录前重查。

独占实现放在 contracts 的 `platform/settings.ts` 和 SDK 的 `settings.ts`、`sandbox-schema.ts`。Manifest 字段、解析接线、SDK 根导出及共享 API 快照等 #1984 交接后串行接入。本片以公开 contracts／SDK 入口和真实 Runtime 准入验证，不登记存量 owner 的设置动作。用户 2026-11-08（PST）已定：本批完成公共合同、SDK 绑定和声明校验，签名沙箱 app 的设置执行留待后续接入，记在 [BL-settings-sandbox-execution](../backlog/BL-settings-sandbox-execution.md)。本批不宣称签名沙箱设置已能执行，也不放开无处理器的声明。当前签包按固定 Manifest 投影，沙箱的数据库事务端口只接受写语句批次。后续接入需要投影固定读写定义，并在安装私有库内提供受授权的同步事务端口供同一 SDK 绑定调用。用户同日确认保留第 36 批先交角色层次合同的分工，P-2b 仍等该前置，P-2a 与本批其他独立部分继续。

SPC-C01 经公开 Manifest 解析和 `ActionService` 验证错引用／schema、非法文字、越层、继承和不可用，经 Runtime 安装验证 key 冲突。SPC-C02 用临时文件 SQLite owner 驱动公开 SDK 绑定。两个独立连接以同一 revision 竞争写入，另验跨层变化导致旧 revision 冲突。测试同请求重放、同键异内容拒绝及关闭重开后返回原回执。用数据库触发器让 receipt 插入失败，核对值与 revision 回滚。暂停调度器的 `beforeEffect` 后撤权，验证新请求和重放都被拒，数据库中值和回执没有变化。


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

- **采用动作** `characters.from_template@1`（command，只给本人）按第 5.2 节新建个人原件或项目成员，或复用本人在预览明确选中的角色。新建记录来源 `{ source: BlueprintSource; part_id }`。同一个 `request_id` 只生效一次。同名角色由预览让本人选沿用还是另建（04 定样已画）。
- **层次与生效归 36**：项目成员默认跟随你的原件、改了哪一节哪一节成为本项目的、取值顺序「本次 → 本项目 → 你的默认 → 助理自己」、每次保存固定一个版本，都是 36 的合同。本稿只要求两件事：采用建的项目成员带着来源，以便升级时比差异、移除时只解除它（ONB-56）；模板不能放宽工具与动作（36 第三节「选角色不是授权」）。
- 官方场景包升级时，模板变了只出现在升级预览里，由你挑着重新采用；不改你已经改过的角色（ONB-55）。
- **36 前置核对与阻塞修正（2026-11-08，用户明确要求继续独立部分）**：其方案 C 足以确定模板内容、个人／项目作用域、逐节跟随与覆盖的设计原则；现有 `CharacterDraft` 没有项目成员、默认选择和固定生效版本的层次合同。P-2 分成 P-2a 的 `RoleTemplate`、严格形状及静态校验，与 P-2b 的 `characters.from_template` 采用接口。P-2a 不依赖 36；P-3b 的场景形状与静态校验只消费 P-2a，不等角色采用接口。只有 P-2b 的项目成员返回值、来源挂载与回读须接 36 的准确类型；不能凭本稿补一套角色层次，也不把模板类型完成写成角色采用完成。36 的角色服务与界面排期不变；同一批中的独立工作继续，不因该接口未交接停整批。

### 5.1 P-2a 模板内容与静态边界

首片 `6a9cf182a7` 已从 `contracts/modules/characters` 导出 `RoleTemplate` 和 `ROLE_TEMPLATE_SCHEMA`，仅含第 5 节八个字段，必填 `title` 与 `instructions`。模板不收 actor、安装、项目成员、来源或授权状态。`title`、`materials`、`outputs` 复用 `TEXT_REF_SCHEMA`。SDK `inspectRoleTemplate(value, { source: "draft" } | { source: "package"; owner: string })` 返回 `readonly PluginDeclarationProblem[]`，问题路径以 `$` 为根。包版 `owner` 取已核对 Manifest 的 `plugin_id`。文字复用 `textRefProblems` 与 `tryOwnedTextRef`，保留 `common.*`。角色采用后的标题在解析语言键后再核非空和 120 UTF-16 上限。

正文沿 CharacterDraft：`instructions` 允许空，上限 20,000 UTF-16 单位。工具列表的省略／null 表示继承，空数组表示不使用，最多 100 项。Host 工具的名字与去重复用 `parseCharacterTools`；动作工具复用 `parseExactActionReferences`，每项须是闭合的 capability、version、provider 三字段，provider 允许现有 `#mcp:` 身份，不收角色自行声称的授权。公开动作引用 schema 复用 `ACTION_REFERENCE_SCHEMA` 并要求 provider；准确字符、重复项、安全整数与 UTF-16 限制由已有 parser 检查。JSON Schema 的 maxLength 按码点计数，不能单凭它声称正文及 provider 的 UTF-16 边界通过。

`skills` 每项只收 `{ pack, skill_id }`，按现有插件 id 与 Skill token 规则检查，不把单个包的技能声明数上限套在多包引用上。`works_with` 每项为非空字符串且不能重复；是否指向同一场景中另一个 role、是否自指，由 P-3b 检查实际部分集合，引用条数不超过其他角色数。第 09 批 #1993 的能力包扩展要求共用角色说明字段；本片不新增内容包角色白名单键，后续打包接入复用同一份角色内容。

合同首片允许修改 `packages/contracts/src/modules/characters.ts`、该公开子路径的 API 快照和新定向测试。SPC-C06 先通过公开合同与 Kernel `assertActionInput` 验证八字段形状、可空工具和伪造身份／未知字段拒绝。这一阶段只报形状证据。SDK 的纯静态校验在独立 `role-template.ts`，按 §10 接 SDK 根出口，由 P-3b `inspectBlueprint` 复用。SPC-C03 的角色引用与 SPC-C06 的后续语义按各自公开入口验证。

### 5.2 P-2b 模板采用与同主人批读

消费第 36 批提前合同 #1995（核对头 `7339705f7b`，尚待合入）。在现有 `packages/contracts/src/modules/characters.ts` 合成下面输入和闭合 `CHARACTER_TEMPLATE_ADOPTION_INPUT_SCHEMA`。新建分支引用 `ROLE_TEMPLATE_SCHEMA`，来源用 `BLUEPRINT_PART_ORIGIN_SCHEMA`，层和观察版本沿 36 类型。复用分支只传被选中的角色与观察值。`request_id`、`expected_revision` 非空，版本为正安全整数。

```ts
type CharacterTemplateAdoptionInput = { origin: BlueprintPartOrigin; request_id: string } & (
  | { layer: "personal" | "project"; selection: { kind: "create" }; template: RoleTemplate }
  | { layer: "personal"; selection: { kind: "reuse"; role: PersonalCharacterVersionRef } }
  | { layer: "project"; selection: { kind: "reuse"; role: ProjectCharacterMemberRef;
        expected_revision: string; expected_original_version: number } }
);
```

同一公共出口给 `characters.from_template@1`（command）和 `characters.roles.read@1`（query）的动作定义，均面向 `user`，声明为 Home scope，以覆盖个人调用。项目分支仍须可信项目上下文。写返回现成 `CharacterTemplateAdoptionResult`／`CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA`。读复用 `CharacterRoleReadInput`、`CharacterRoleReadOutput` 和其固定 schema，1～128 项按输入顺序对应。`by: "role"` 读当前角色，`by: "request"` 读原回执和当前角色（成员已解除时可为 `null`）。确认缺失与读失败分开。无项目上下文的项目查询拒绝。现行 `characters.subject.read@1` 的 `{ subject_id, offset? }` 与通用正文继续供原消费者，批读不借它升版。角色正文的固定版本读取仍由 36 的真实服务交付。

场景采用入口先在已核对的包或草稿中确认来源与模板，按确认的语言把 `title`、`materials`、`outputs` 转成 literal 交给主人，仍使用同一 `RoleTemplate` 形状。主人用 draft 文字模式重验，再核标题，保存用户自己的文字。实际入口必须核对已确认的来源和选项，输入 `origin` 只记录来源。工具的省略、null 和空集合沿 §5.1。Skill 按目录解析成真实 `SkillRef`，模板本身不启用 Skill 或授权。`works_with` 的场景部分 ID 由第 44 批按真实成员处理。

角色主人经 `beforeEffect()` 后，按可信 actor、所选层、项目及 `<adoption_id>:<part_id>` 在事务内查回执。同请求重放原结果，同键异内容拒绝。项目新建确认个人原件的首个固定版本，再建立两节跟随的成员，返回项目角色。个人新建只返回原件。项目复用核对成员 revision 和原件版本，同事务推进成员 revision 并保存本次回执，正文照旧。个人复用核对所见固定版本。旧成员解除凭据、回执失败回滚和撤权后不写入均按 36 owner 事务验证。

第 20 批交付上述公开动作、SDK 语义校验与实际可接的静态消费者。SPC-C06 用公开 `modules/characters` 与 Kernel `assertActionInput`／`compileActionSchema` 证明创建和复用分支、CAS 字段、来源、项目成员结果、批读回执及伪造身份拒绝，更新该子路径 API 快照。现有 `characters.sqlite` 的角色业务记录只有个人草稿和运行记录，Host 只绑定项目提供方。第 36 批主人实现真实原件固定版本、成员和回执事务，再以同一 `io.molis.work.characters` 登记这两个动作并接个人／项目范围。`host-actions.tsv` 只记真实绑定。真实 SPC-06 验收保留，含同名选择、原件与成员回读、重启幂等、并发复用与解除和授权收窄。第 44 批再验场景预览与采用消费。存量库或格式改动另依已授权的版本和升级流程。

## 6. 首页与生成页面

**用户 2026-11-04 定**（统筹转达）：「放在首页插件下，然后首页插件允许各个插件注册，也允许根据描述生成，不是当做普通插件」；「插件可以注册卡片，首页当做平台能力」。上一版的做法 A（页面打成插件包）与做法 B 都不用了。落成三条：

1. **首页是平台能力**，不是插件，待遇照创作台。
2. **插件注册卡片**，走 05② 的组合这一条路，不另写一套。
3. **按描述生成的页面是首页自己的内容**：不打包、不进插件列表；源文件、版本、人工修改与恢复都归首页；代码隔离运行，授权取页面声明的动作与本人批准的交集。

### 6.1 首页服务

新的平台服务 `horizontal/home`（包名 `@molis-ai/molis-work-service-home`，提供方 `system.home`），宿主只做装配，与第 15 批的 `horizontal/surfaces`、本稿的 `horizontal/blueprints` 同一种写法。不放进宿主：用户 2026-11-01 定新的平台服务进 `horizontal/`。

它拥有的事实（每件一个主人，别处不另存）：

| 事实 | 存在哪 | 说明 |
| --- | --- | --- |
| 项目用哪个首页 | 项目库（经 storage 驱动，同第 15 批的纠正表） | `{ kind: "basic" } \| { kind: "page"; page_id; version }`；没有行就是基础首页 |
| 生成页面的定义与版本 | 项目库 | 每页一组版本；每版有文件清单（路径、`sha256`、字节）、声明的动作、作者（助理生成、本人修改）、来源说明；文件正文按摘要存，版本只追加 |
| 每版页面获准的动作 | 项目库 | 本人采用或恢复时批准的动作集合，带批准时间与操作者 |

三张表在 `tooling/gates/table-owners.json` 里记为 `horizontal/home` 独占，并写进项目库的 `PROJECT_DATABASE_BASELINE`（`apps/local-host/src/project-database.ts`）。个人一层的首页（个人汇总）以后要时同样写法放 Home 库，本稿不定。删项目时这些行随项目库一起没了；Home 快照照项目库的规矩带上。

不拥有：卡片的内容与值（归各插件，经 05② 的 `PresentationValues` 现读）、基础首页的组合规则（归第 15 批的组合服务）、页面里显示和写入的业务事实（归原插件）。

### 6.2 插件注册卡片

插件不另声明「首页卡片」。卡片用 05② 的呈现声明和插件级概况。首页按 `surfaces.compose@1`、`slot: { kind: "home" }` 取描述，值另用 `PresentationValues` 取。同一份声明供基础首页、生成页面、侧栏、搜索使用。基点 `13cba9962f` 的 `platform/presentation` 已公开 `home`、概况和 values，SDK `/presentation` 已有声明、取值及描述检查。`services/surface-composition` 已声明 `surfaces.compose@1`，动作目录尚无 `system.surfaces` 绑定。组合提供方和 `renderPresentationForm` 分别由第 15 批第 1、2 项交付。P-4 可以先消费这些公共形状，真实卡片组合和渲染随相应提供方接通。

- 基础首页：首页服务直接画 `surfaces.compose` 给的描述（第 15 批 S-2 的内容）。
- 生成页面：页面要放插件卡片时，同样经页面网关调 `surfaces.compose@1` 与各主人的 values 动作，这两个也要在页面声明、本人批准的动作里；页面拿到的只是描述和值，渲染用 SDK 的 `renderPresentationForm`。
- 所以 05② 的 `SurfaceSlotKind` 的 `home` 就是首页的组合位置，没有第二个「首页」：不在 `UI_VIEW_SLOTS` 里加 `home`，也没有 `projects.home`。

### 6.3 生成页面的形状

```ts
// packages/contracts/src/services/home.ts（新子路径）
interface HomePageRef { page_id: string; version: number }
interface HomePageVersion extends HomePageRef {
  title: string;
  files: Array<{ path: string; media_type: "text/html" | "text/javascript" | "text/css"; bytes: number; sha256: string }>;
  entry: string;                             // 入口 html 的 path
  actions: ExactActionReference[];           // capability_id、version 和 provider_id 固定
  author: "assistant" | "person";
  based_on?: number;                         // 从哪一版改来，差异按它比
  created_at: string;
}
```

- 上限：每版最多 64 个文件、总共 ≤ 4 MiB、单个 ≤ 1 MiB，路径相对、不许 `..`、绝对路径。
- 保留：每个项目最多 20 个页面，每页最多留 20 版。正在用的那一版、它的 `based_on`、上一次获准用过的那一版不删；超出时删最旧的其余版本（连同只被它引用的文件正文），并在页面的版本列表里写出删了哪几版。存草稿时超出页面数，答 `home.page_limit`。
- 生成与修改不靠插件：助理按 Skill 产出文件与动作清单，存成新的一版草稿；本人手改也存成新的一版，`author: "person"`。
- 再生成覆盖人工改过的版本之前，按 `based_on` 给出差异，由本人选（§3.10）。

### 6.4 页面主体与授权

生成页面不是插件，没有安装，所以要一种新的调用主体：**页面主体** `home-page:<项目>/<page_id>@<version>`。

- **运行**：跑在不透明框架里，与插件页同一套（`sandbox="allow-scripts allow-forms"`、不透明来源，S-47）。框架脚本按页面主体连页面网关，不带插件 id。
- **送文件只有一条路**：
  1. 外壳（可信父页）以本人的身份调 `home.pages.files.read@1`（只给 `user`，页面主体调不到），输入 `page_id`、`version`。
  2. 首页服务按这一版的清单从项目库取正文，**送出前逐个重算 `sha256`**；有一个对不上就整版不给（`home.page_file_mismatch`），外壳显示基础首页。
  3. 外壳拿到后**再核一次**摘要，以入口 HTML 为底，把这一版的 JS、CSS 分别内联成 `<script>`、`<style>` 元素，整份写进框架的 `srcdoc`；页面文件里引用别的文件的 `<script src>`、`<link>` 由外壳换成内联，清单外的引用不加载。页面不能用内联 `style` 属性和内联事件（`style-src` 不给 `'unsafe-inline'`，这一点与插件页不同）。框架的 CSP 里 `script-src`、`style-src` 只有平台固定的框架脚本，加上这一版每个文件的 `'sha256-…'` 哈希源；`connect-src 'none'`，不给 `'unsafe-eval'`、`'unsafe-hashes'`。所以浏览器也按摘要把关：页面运行中拼出的脚本、内联事件、`eval` 都不执行。
  - 页面文件不走静态路由，也不进 `/assets/`，没有按地址取页面文件的第二条路。
  - 实现要改的：`apps/workbench/src/browser/plugin-frame/document.ts`（按页面版本组 `srcdoc` 与 CSP）、`parent.ts`（挂页面主体）；宿主侧页面网关 `apps/local-host/src/plugin-page-authority.ts`、`plugin-page-actions.ts`（认页面主体）。这些文件送达、页面主体与执行隔离实现归第 37 批，列入该批冲突面；第 20 批 P-4 只交公共 schema、SDK 校验和本批必要接入，实际接入的边界须当批验证真实拒绝，不提前改这条页面运行链。
- **主体从哪来**：照插件页的做法（`apps/local-host/src/plugin-page-authority.ts`）。外壳打开生成页面时请宿主开一条页面记录，宿主从调用上下文取项目、从首页服务读本项目此刻用的 `page_id@version`，记进页面记录、发回一个 `page_session_id`（页面记录的号，与生成页面的 `page_id` 是两回事）；外壳和页面都只拿这个号。网关每次调用按 `page_session_id` 从宿主的页面记录读主体，外壳或页面在请求里写的主体、项目、版本一律不认。换版、撤下、关页面、切项目后页面记录作废，号再用被拒。
- **调用**：页面只经页面网关调动作。每次调用都核：动作在这一版声明的 `actions` 里，也在本人为这一版批准的集合里；动作的受众含 `plugin`（页面主体按 `plugin` 受众核，只给 `user` 的动作调不到）；目标项目就是页面所在的项目。调用记录里写页面主体和它的版本。
- **批准**：只有本人在采用或恢复时批准，`home.pages.adopt@1`、`home.pages.restore@1` 只给 `user`。批准时列出这一版要用的每个动作和后果（会写、对外发、花钱），与安装确认的权限清单同一种呈现。恢复的那一版若用的动作没有超出它当初获准的集合，界面写「没有新增权限」，但仍由本人点一次恢复。
- **失效**：换了首页、恢复了别的版本、页面被删、项目切换后，旧版本的在途调用在 `beforeEffect()` 处被拒，迟到的结果不写。
- 页面拿不到宿主文件、凭据、私有库，也没有平台服务，只有页面网关。

这是新的授权主体。第 20 批 P-4 定公共 schema 与 SDK 校验，必要接入中实际形成的边界按 AGENTS 当批登记并验证真实拒绝；以下完整的文件送达、页面主体、执行隔离、撤权／换版和真实浏览器拒绝，由第 37 批随页面运行实现登记安全不变量并验收。尚无处理器的边界不能用 schema 拒绝充数，SPC-10／11 不记为本批通过：

| 编号 | 不变量 | 拒绝测试要断言的 |
| --- | --- | --- |
| S-111 | 生成页面只跑首页存下的、摘要相符的文件，文件只经 `home.pages.files.read@1` 送进框架 | 库里的正文被改过时 `files.read` 整版不给、外壳显示基础首页；外壳再核不符时不写进框架；哈希源之外的脚本（页面拼出的、内联事件）、`eval`、直接网络请求在真浏览器里不执行；页面主体调 `files.read` 被拒 |
| S-112 | 页面主体只能调这一版声明并获准的动作，只在本项目，按 `plugin` 受众；试用主体只能调声明里的查询动作 | 声明外、未批准、只给 `user` 的动作，别的项目，都被拒；请求里自带主体、项目或版本的不认（主体只从宿主的页面记录读），别的项目或已作废的页面记录号被拒；试用主体调命令动作被拒 |
| S-113 | 批准只由本人直接给（采用或恢复），换版或撤下后旧调用不生效 | 助理、插件、页面调 `adopt`／`restore` 被拒；`blueprints.adoption.apply`／`revert`／`remove` 嵌套调 `adopt`／`restore` 被拒（这两个动作只认没有上一层的本人调用）；换版后旧版本的在途调用在 `beforeEffect()` 被拒、不写记录 |

编号由合同台 2026-11-04 定：第 7 节「采用不转交本人的同意」是 S-110，首页三条是 S-111～S-113。

### 6.5 动作

都由 `system.home` 提供，共八个，没有 MCP 工具。

| 动作 | 受众 | 种类 | 做什么 |
| --- | --- | --- | --- |
| `home.read@1` | user、plugin、agent | query | 本项目用的是哪个首页，以及可用的页面与版本列表（不含文件正文） |
| `home.pages.drafts.save@1` | user、agent | command | 存一版草稿（文件与动作清单）；先过静态检查（上限、路径、媒体类型、动作引用存在） |
| `home.pages.preview@1` | user | command | 在试用框架里跑一版草稿，主体是另一种 `home-page-preview:<项目>/<page_id>@<version>`，调用记录里分得出：只放行声明里的查询动作；命令动作在试用里不执行，界面逐个标「预览中不执行」，示例数据逐处标明（§3.10） |
| `home.pages.adopt@1` | user | command | 本人批准这一版的动作清单，把它设为本项目的首页；带 `request_id` 与 `expected_revision` |
| `home.pages.restore@1` | user | command | 换回某个旧版本，同一份批准规则 |
| `home.select@1` | user | command | 回到基础首页（`{ kind: "basic" }`），立即生效 |
| `home.pages.diff@1` | user | query | 两版之间的差异，供再生成前对照 |
| `home.pages.files.read@1` | user | query | 外壳取一版的文件正文，送出前逐个核摘要（第 6.4 节）；只给外壳以本人身份调 |

场景包里的首页部分是一个 `content` 建议，类型 `molis.home-page.v1`：`system.home` 在登记里声明 `adopts`（第 8 节），它的采用动作就是 `home.pages.drafts.save@1`，只存一版草稿，不批准、不换首页。

- 草稿写入并回读后，场景步骤记下固定 `{ page_id, version }` 和为这次批准生成的 `approval_request_id`，随 `needs_approval` 返回。续做沿用这个批准键。
- 本人在首页自己的批准入口直接调 `home.pages.adopt@1`，把该批准键用作动作的 `request_id`。独立采用同一页同一版时使用新的请求键。批准键只关联本次操作。
- 本人以原场景请求键续做 `apply`。场景按批准键经 `home.read` 查同一本人、同一项目的原回执，核对操作及固定页面版本。当前页面相同但缺少关联回执时仍待批准或核对，不能据此记生效或取得撤销凭据。
- `adopt`、`restore` 只认没有上一层的本人调用：`apply`、`revert`、`remove` 嵌套调它们一律被拒（S-113）。

**P-4 公共合同与静态校验。** `services/home` 导出 `HomePageRef`、`HomePageVersion`、`HomePageDraft`、`HomeSelection`、`HomePageApproval` 和上述八个动作的闭合输入输出 schema。`HomePageDraft` 包含 `title`、`entry`、`actions` 和 `{ path, media_type, text }` 文件列表。`HomePageVersion` 的 `bytes` 和 `sha256` 由主人按文件原文的 UTF-8 字节生成，`sha256` 为 64 个小写十六进制字符。版本是正安全整数，`based_on` 指同页已存在的旧版本。动作复用 `ACTION_REFERENCE_SCHEMA` 并要求 `provider_id`，保留 `parseExactActionReferences` 的身份、版本、数量及去重规则。批准回读 `{ page: HomePageRef, approved_actions: ExactActionReference[], approved_at }`，操作者从可信入口取并由主人记录。项目当前选择的 `revision` 是主人比较写入的凭据，与页面 `version` 分开。

| 动作 | 输入与回读 |
| --- | --- |
| `home.read` | `{}` → `{ selection, revision, versions }`，版本摘要含声明动作和该版 `approval`（未批准为 `null`），无文件正文。第 8 节的首页主人批读沿同一 `queries` 分支。批准回执查询为 `{ by: "request", operation: "adopt" \| "restore", request_id }`。核可信本人和项目后返回 `{ kind: "receipt", receipt, current }` 或 `{ kind: "missing", current }`。`current` 是独立的 `{ selection, revision }`，读失败仍待核对。 |
| `home.pages.drafts.save` | 直接新建传 `{ draft }`，追加版本传 `{ draft, page_id, expected_version, based_on? }`，输出 `{ version: HomePageVersion }`。采用分支沿第 8 节固定输入与回执，`body` 共用 `HomePageDraft`，回执同时给新草稿版本，供 `needs_approval` 使用。 |
| `home.pages.preview`／`home.pages.files.read` | 均用 `HomePageRef`。试用返回 `{ page, page_session_id }`，文件读取返回 `{ version: HomePageVersion, files }`，`files` 带同版完整正文。 |
| `home.pages.adopt`／`home.pages.restore` | `{ page_id, version, approved_actions, request_id, expected_revision }` → `HomePageApprovalReceipt`。批准动作须是该版声明且当前可批准的精确子集。恢复仍由本人再次确认，旧批准只供比较。 |
| `home.select` | `{ kind: "basic", request_id, expected_revision }` → `{ selection, revision, approval: null }`。第 7 节退回基础首页按采用记录的 revision 比较，写回不重做业务动作。 |
| `home.pages.diff` | `{ page_id, from_version, to_version }` → 两版的文件新增／修改／删除、入口和动作集合差异。文字对照复用 SDK `compareTexts`，结果用于本人查看。 |

`HomePageApprovalReceipt` 为 `{ operation: "adopt" | "restore", request_id, selection, revision, approval }`。`selection` 是 `{ kind: "page", page_id, version }`，`revision` 是批准与选择同一提交写下的版本凭据。原回执由首页主人在该提交内保存。相同请求重放及按键回读均返回原回执，同键改变操作、页面版本或批准集合时拒绝。每次新的批准或页面切换提交推进选择 revision，切回同一版也有新 revision。

SDK 根入口 `inspectHomePageDraft(value: unknown)` 返回带字段路径的声明问题。正文形状由一份可作 §8 `body` 的 `HOME_PAGE_DRAFT_SCHEMA` 配合现有 SDK `assertMatches` 检查。复用 `packagePathProblem` 核相对路径，检查重复路径、入口唯一且是 `text/html`、允许的媒体类型，以及 64 文件、单个 1 MiB、合计 4 MiB 的实际 UTF-8 字节。闭合引用形状后调用 `parseExactActionReferences`。这一步检查文件和声明数据。保存／批准时的动作存在性、提供方、项目及当前权限由真实 owner 和动作目录核实。页面引用须显式有 `plugin` 受众，普通 `actionReachesAudience` 的 agent 转 plugin 路径不满足这一条件。文件读取不复用会截断正文的 `fileContentOf`。

`platform/actions` 导出区分 `home-page`／`home-page-preview` 的可信主体类型，含项目和固定页面版本。动作仍按 `plugin` 受众核对，试用沿现有 `query_only`。本片不接受主体字段进入动作业务输入，也不把主体接进现有调用链。`files.read` 仅供可信外壳调用，`adopt`／`restore` 还要求本人的直接确认。`audiences: ["user"]` 只表达受众。外壳来源、嵌套拒绝、有效版本、运行期摘要核对与 CSP 内联后的实际哈希均由第 37 批接入和验收。

### 6.6 平台签名入口（只给内容包）

生成页面不打包，签名入口只剩内容包用（场景服务的 `packs.save`、08 的外部 Skills 导入）：

- **`plugins.local_packages.sign@1`**（command，只给 `user`，提供方是宿主的 `plugin-install`，和 `plugins.install.preview`、`plugins.installed.enable` 同一个；它在宿主里调发布身份的签名函数，创作台不另注册动作，合同台 2026-11-04 定）：输入内容包的 Manifest 与文件，输出 `plugins.install.preview` 的 `preview_id`。每次调用就是一次明确的发布。调用方在本人的调用里嵌套调它，带本人的上下文（第 7 节），只交文件。
- **来源**：签名入口按调用上下文里的上一层写一份随包签名的来源记录：`ai_generated`、`imported`、`saved`，不从输入读。安装预览在发布者「这个 Home」旁写出来源。
- 它不装、不授予：装仍是 S-84 那一条路。

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
| `blueprints.adoption.preview@1` | user | command（write：存一份会过期的预览记录、发 `preview_id`，沿 `plugins.install.preview` 的预览句柄） | 输入：草稿或已装的场景包、目标（新项目、某个项目、个人）、选了哪些部分、本次改了哪些值。先做主人检查（第 3 节），再输出每个部分：会新建、复用、修改、要先安装还是跳过；当前值与来源、建议值、写到哪一层；后果标记；依赖是否就绪、缺了挡哪一步；同名冲突。主人的当前值按主人一次读齐 |
| `blueprints.adoption.apply@1` | user | command | 输入 `preview_id`、接受的 `part_id`、`request_id`。逐步调主人的动作，幂等键是 `<adoption_id>:<part_id>`；写完回读，读到才标「已生效」。遇到要安装的部分不装，标 `needs_install` 并给出它的 `preview_id`；首页那一步只存草稿，标 `needs_approval`（第 6.5 节） |
| `blueprints.adoption.read@1` | user | query | 一次采用的逐步状态：未执行、要先安装、要本人批准、已生效、失败（带主人的错误）、待核对、跳过 |
| `blueprints.adoption.revert@1` | user | command | 撤销这次采用仍归它的部分：主人当前的 revision 还是采用写下的那个，才恢复；否则跳过并写「之后被你改过」 |
| `blueprints.adoption.remove@1` | user | command | 从项目移除一个已采用的场景包（ONB-56）：同 `revert` 的规则，解除它拥有的配置与绑定；插件只在没有别的场景包和你自己用着时才撤出项目；稿件、待办、代码改动、你的角色都不动 |
| `blueprints.packs.save@1` | user | command | 把一份草稿或一次采用另存为个人场景包：组好内容包的 Manifest 与文件，交给平台签名入口（第 6.6 节）签名，返回 `plugins.install.preview` 的 `preview_id`，装仍由本人在安装确认里点。场景服务不碰私钥 |

**采用不转交本人的同意。**

- **安装只由本人确认。** `plugins.install.preview`／`confirm` 只接受本人的操作。`apply` 碰到要装的部分（缺的插件、草稿里新 Skill 打的内容包），把那一步标 `needs_install` 并返回 `plugins.install.preview` 的 `preview_id`；界面走普通的安装确认；装好后本人再调一次 `apply`（同一个 `request_id`），从那一步接着做。`apply` 自己从不调 `plugins.install.confirm`。
- **嵌套调用带着本人的上下文。** `apply`、`revert`、`remove` 调主人的动作（`projects.plugins.set@1`、`skills.settings.set@1`、`characters.from_template@1`、各主人的设置写与采用动作）时：操作者、项目取自本人这次调用的上下文；子调用的授权按本人核，不按 `system.blueprints` 核；动作网关在调用记录里记下上一层（`blueprints.adoption.apply@1` 与它的调用 id）。`system.blueprints` 自己没有替人写主人数据的授权。
- **新的安全不变量 S-110「采用不转交本人的同意」**（合同台定号）：P-3c 在第 20 批给出合同，实际接入的边界当批登记并验证真实拒绝。完整采用服务归第 44 批，其处理器实现时必须验证两种真实拒绝：`apply` 直接调 `plugins.install.confirm` 被拒；`apply` 用系统身份而非本人上下文写设置被拒。尚无 `apply` 处理器时这两项保持待验证，不以 schema 测试宣称 S-110 完成。首页批准的 S-113 归第 37 批真实验收（第 6.4 节）。

**规则**：

- **续做**：失败和待核对的步骤，重试时先用主人的读动作核对实际结果，再决定补写还是标已生效；已生效的不再调（ONB-28、ONB-45）。
- **取消与迟到**：取消后不再开新步；在途那一步按动作架构的规矩，`beforeEffect()` 后才记结果。撤权、项目切换、安装换代后迟到的结果不写进错误范围（§3.12）。
- **进度不靠轮询**：逐步状态变化发 Home 事件，页面订阅；重进时读一次 `adoption.read`。
- **升级（ONB-55）**：新版本的场景包出来后，`adoption.preview` 带 `upgrade_of: adoption_id`，按 `part_id` 三方比较：旧版建议、新版建议、主人现在的值。现在的值还是旧版建议的，列成「新版建议改成」；你改过的，列成冲突并默认保留你的；新版删掉的部分只提示，不自动撤。不升级时旧的采用照常可用。
- **删项目**：场景服务在项目删除回执里登记一步（目录删除时每个项目数据主人一步，`ProjectDeletionService` 是唯一入口），清掉指向这个项目的采用记录与预览；建在个人一层的采用不受影响。
- **主人不在了**：某一步的主人插件停用或卸载、角色被删后，`adoption.read` 把那一步标「主人已不在」；`revert`、`remove` 跳过它并如实写出，不假装撤销成功。主人再启用后，按 revision 规则照常可撤。
- **Home 快照与恢复**：场景服务的 Home 库登记进 `homeStoreRegistry`（`apps/local-host/src/home-stores.ts`），快照与恢复带上它。
- **页面的版本与恢复**归首页服务（第 6 节）。采用步骤沿第 6.5 节保存匹配的原批准回执及提交时 revision，用它核撤销。后续页面选择变化时仍可确认旧批准曾生效，当前状态按读回说明，撤销沿 `revision_changed` 跳过。没有匹配回执时没有撤销凭据。采用前是基础首页时以原 revision 调 `home.select@1`。采用前是别的生成页面时，撤销步骤给固定的恢复批准请求键，由本人以原 revision 直接点 `home.pages.restore@1`，续做按该键回读恢复结果。

### 7.1 P-3c 公开动作与回读

`contracts/services/blueprints` 导出八个动作定义及其输入、输出类型和闭合的外层 `ActionSchema`。复用 `inputSchemaFor`、`ActionReference`、`ActionSubject` 及它们的现有 schema。`Blueprint` 正文继续由 §3.5 的 SDK 检查负责。动作声明 `scope: "home"` 对应场景记录的主人，项目子调用仍须有可信项目。受众沿上表，查询用 `query`／`read`，命令用 `command`／`write`。固化主人动作时带确切 `provider_id`。草稿 revision 为正安全整数，owner 的 CAS 凭据保留原类型与值。actor、项目身份、安装、授权与来源凭证由可信入口或主人记录给出。

| 动作 | 最小输入 → 输出 |
| --- | --- |
| `drafts.save`／`drafts.read` | 保存新稿 `{ expected_revision: null, blueprint }`，改稿 `{ draft_id, expected_revision, blueprint }`。读 `{ draft_id }`。输出 `{ draft: { source, blueprint, locale } }`，`source` 为 `BlueprintSource` 的 draft 分支。保存走 `inspectBlueprint` 的 draft 模式。 |
| `adoption.preview` | `{ source: BlueprintSource, target, part_ids, changes?, upgrade_of? }`。`target` 区分 `personal`、可信调用的 `current_project`、`new_project`（只带 `display_name`）。`changes` 每项为 `{ part_id, proposal?, selection?, action? }`，只接受同种替换建议与已提供的对象或主人候选。`selection` 选新建或 `reuse`／`update` 加 `subject`，revision 由预览读回。输出 `{ preview_id, expires_at, source, target, locale, parts, upgrade? }`。每个 part 给建议、层次、主人候选及当前值与来源、`create`／`reuse`／`update`／`needs_choice`／`needs_install`／`skip` 决定、后果和 `affected_step_ids`。 |
| `adoption.apply`／`adoption.read` | 应用 `{ preview_id, part_ids, request_id }`，输出 `{ adoption_id, source, target, locale, steps }`。读取 `{ adoption_id }`，输出相同身份字段及 `{ apply_steps, latest_undo }`。`apply_steps` 保留采用历史，`latest_undo` 为最近一次撤销或移除的 `UndoResult`，没有则为 `null`。`target` 的实际项目由主人回给调用方。 |
| `adoption.revert`／`adoption.remove` | `{ adoption_id, request_id }` → `{ adoption_id, undo: UndoResult }`。同请求核对并续做对应的撤销或移除，保留最初的采用凭据。 |
| `packs.save` | `{ source: { kind: "draft", draft_id, revision } \| { kind: "adoption", adoption_id } }` → `{ preview_id }`。读取选定版本或该次采用已确认的快照，沿 §3.3 校验转词后交 §6.6。 |

`part_ids` 与 `changes` 只收唯一且存在的部分，按 `BLUEPRINT_LIMITS.parts` 限制。apply 只接受该预览已确认的部分、目标和主人选择，层不适用时明确说明。预览由主人读回 `current`，区分 `present`（值、主人来源和可用的 revision）、`missing`（确认不存在）与 `unavailable`（有原因的读取缺口）。`upgrade.parts` 每项按 `part_id` 给旧建议、新建议（缺一方时明确新增／移除）、当前值、是否保留人工修改及依赖变化，保留原采用语言。36 的角色批读能核身份、来源与 revision，实际三方正文仍须 36 的按固定版本读取。

`steps` 每项带 `part_id`，状态分 `not_started`、`needs_install`、`needs_approval`、`applied`、`failed`、`pending_verification`、`skipped`。`needs_install` 带现有安装预览的 `preview_id`，`needs_approval` 带首页的 `{ page_id, version, approval_request_id }`。`applied` 保留主人回执的 `created`／`reused`／`modified`、实际动作引用、对象及观测 revision。首页步骤用原批准回执的提交 revision，当前选择变化时保留历史并标当前已变更。纯依赖已具备时只记录复用，无写回执或撤销权。`failed` 带已公开的主人错误码与说明。`skipped.reason` 区分 `not_selected`、`dependency_unmet`、`unsupported`、`scope_mismatch`、`owner_unavailable`、`revision_changed`、`reused`、`shared`、`no_revert`。只知道 revision 已变时，不归因于用户手改。读视图标明主人暂时不可用，历史回执仍保留。

`UndoResult` 为 `{ operation: "revert" | "remove", request_id, steps: UndoStep[] }`。`UndoStep` 按 `state` 闭合，各分支带 `part_id`。`restored` 带经核实的 `{ action, subject, revision }`。`detached` 表示实际解除，只有场景解绑时省略主人写回执。`skipped` 带 `reason`，`needs_approval` 带 `{ page_id, version, approval_request_id }`，`pending_verification` 带待核对的主人 `request_id`，`failed` 带主人的 `error`。动作、对象、CAS 凭据及错误复用采用步骤的合同。`adoption.read` 用 `latest_undo` 呈现当前撤销进度与结果，已恢复或解除的部分保留原采用回执供追溯。

后续处理器按同一可信范围和 owner 读动作合并查询。已知对象读当前值，写出结果未知则按 `<adoption_id>:<part_id>` 查主人回执。失败、超时、数量不符或返回不全仍待核对。确认未提交后按原键补写。主人只提供当前值读取时，只有已证明可返回原回执的动作才能在成功回读后按原键核对式重放。相同当前值不能证明这次新建或具备撤销权，P-3a 的当前成员读取也无法单独证明失联写的来源。Characters 沿 36 的批读及复用 CAS，同时核对成员 revision 和原件版本，复用与回执同事务更新成员 revision，使旧解除凭据失效。Blueprints 不另存一份角色共享计数。

第一次 apply 绑定可信本人、已确认预览、目标与原请求，同键异内容拒绝。预览未使用且过期时用 `blueprints.preview_expired`。一旦接受并记下 `adoption_id`，同请求重进沿该记录续做，原预览过期不让它重开一份。派发主人命令前经 `beforeEffect()` 留待核对的检查点，成功回读后才能记已生效。取消或撤权后停止派发和记账。迟到或重启后的检查点由下一次获准调用核对。新项目复用现有 `ProjectCatalog.createProject` 的可信稳定 ID 创建路径。现行目录没有 `projects.create` 动作，给刚建项目绑定子调用的可信入口由第 44 批接，不能修改一份 caller 对象冒充该项目的权限。

## 8. 插件采用边界

插件（以及 Module、系统提供方）要被场景配置，只能经过下面三样声明；平台除此之外不碰插件的数据，也不为某个插件写采用代码（ONB-33）。

| 声明 | 写在哪 | 管什么 |
| --- | --- | --- |
| `settings_entries` | Manifest；系统提供方在登记里 | 可配的设置项与读写动作（第 4 节） |
| `adopts` | Manifest；系统提供方在登记里 | 接受哪些 `content` 建议：`{ type, title: TextRef, schema: SandboxSchema, adopt, read, revert? }`，三个都是本插件已声明的动作。首页服务（`system.home`，类型 `molis.home-page.v1`，在登记里声明）、工作流程、项目说明各声明自己的类型 |
| `requires`、`connections.slots`、`connection_services` | 已有 | 依赖与账号位置 |

- 一次采用里一种 `content` 类型只交给一个主人；有两个提供方都声明时，预览让你选，不按插件名定。
- 主人没有声明的，预览里那一部分标「提供方没有公开配置能力」，不能采用，宿主不兜底。
- `adopt` 输入固定为 `{ request_id, blueprint, selection, body }`。`blueprint` 复用 36 的 `BlueprintPartOrigin`，只作来源记录。`selection` 为闭合联合 `{ kind: "create" }` 或 `{ kind: "reuse" | "update", subject: ActionSubject, expected_revision }`。由已确认的预览生成选择和 CAS 凭据，`body` 只按声明的 `schema` 传值。主人按可信范围核对象。复用和修改在同一 owner 提交内比较 revision、变更和写回执。成功回执给出 `{ outcome, subject, revision }`，`outcome` 用 §7.1 的三种实际结果。
- 通用 `content` 首次复用也在写回执的同一事务推进撤销所用的 owner revision，正文照旧。提交失败一并回滚。同键重放原回执，revision 只推进一次。复用方的回执没有主人撤销权，后续移除也不恢复旧 revision。这样 A 创建的对象被 B 复用后，A 的旧 revision 无法通过原子撤回核对。保护由同一主人完成，Blueprints 不另存共享计数。
- `read` 用 `{ queries }`／`{ results }` 批读，结果与查询按序对应，单批沿 `BLUEPRINT_LIMITS.parts`。查询按 `by` 区分 `proposal`（`type`、`blueprint`、`body`，返回候选）、`subject`（读当前值）和 `request`（按 `request_id` 读回执与当前值）。批读失败和确认不存在分开。可选 `revert` 输入 `{ adopt_request_id, request_id, subject, expected_revision }`，由同一主人核回执和当前 revision 后恢复或解除。未声明时只解除场景绑定，并回报实际结果。
- `validateAdoptsDeclaration` 随 Manifest 校验，核 `adopt`、`read`、`revert` 都指本插件已声明的同版本动作，读写效果与所用作用域一致。SDK 复用 `ACTION_SUBJECT_SCHEMA`、`BlueprintPartOrigin` schema 和 P-1 的有界 schema 检查，按 `canonicalJsonText` 比较固定字段，`body` 匹配声明的 schema。拒绝缺 CAS、错误分支和伪造身份。既供编辑又供采用的动作，采用分支也须闭合且与这份输入一致。现行签名沙箱的 `SandboxOperationContract` 无法直接表达该联合，实际接入须提供同一合同的绑定并验证，不能拿普通读动作或仅 Manifest 校验冒充支持。
- 同一范围里两个安装声明同一种 `content` 类型时，后装的照样能装；采用时由预览让你选主人。`settings_entries` 的 key 不同：重复就拒后装的（第 4 节）。

## 9. 调用次数

- **预览**：一次动作目录发现；每个涉及的主人一次读（多项设置合成一次 `SettingsReadInput`）；缺插件时每个一次安装预览。不按设置项或部分逐个请求。
- **采用**：每个部分一次写；回读按主人合并成一次。进度走 Home 事件，不轮询。
- **重进**：一次 `adoption.read`。
- **首页**：打开生成页面时一次 `home.read`、一次 `home.pages.files.read`；卡片值按 05② 每个来源一次。不轮询。

## 10. 合同项、子路径与快照

| 片 | 合同项 | contracts 子路径 | 影响的快照 | 前置 |
| --- | --- | --- | --- | --- |
| P-1 设置 | `SettingEntryDeclaration`、`SettingsDeclaration`、读写类型与类型 id、Manifest 的 `settings_entries`；SDK 的 `defineSettingsActions`、`bindSettingsHandlers`、`validateSettingsDeclaration`、`resolveEffectiveSetting` | `platform/settings.ts`（新）、`platform/plugin-manifest.ts` | api：`contracts/platform/settings`（新）、`contracts/platform/plugin-manifest`、`plugin-sdk/index`；动作快照不变（只定类型） | 02 交接 |
| P-2a 角色模板 | `RoleTemplate`、严格形状及静态校验；不建角色成员或持久化来源 | `modules/characters.ts` | api：`contracts/modules/characters`；SDK 的静态校验随既定公共出口接入 | 不依赖 36；复用现行 Character 内容与 TextRef |
| P-2b 角色采用接口 | §5.2 的 `characters.from_template@1`、`characters.roles.read@1` 与角色成员、来源／回执合同 | `modules/characters.ts` | api：`contracts/modules/characters`。`host-actions.tsv` 随真实 owner 绑定 | P-2a 与 36 提前公开合同。真实 owner 归 36，场景消费归 44 |
| P-3a 项目插件成员 | `projects.plugins.set@1` 按 `expected_revision` 把插件加进或撤出项目，受众为 `user`。`projects.plugins.get@1` 返回版本化成员。两个动作复用 Projects 的常开、随行、隐藏和原子 revision 规则。项目设置 HTTP 的写走 set，全项目 GET 复用 get 的 owner 读法，保持被动读取（第 10.1、10.2 节） | `modules/projects.ts` | api：`contracts/modules/projects`；动作：`host-actions.tsv` | 05② 的 C-1（同一快照） |
| P-3b 场景定义 | `Blueprint`、`BlueprintSource`、`BlueprintPart`、`BlueprintProposal`、Manifest 的 `blueprint`／`adopts`；SDK 的 `inspectBlueprint`（静态）、`inspectBlueprintLocales`、内容包文件校验与 `validateAdoptsDeclaration`；GLOSSARY 加「场景包（blueprint）」一行（第 3.5 节） | `platform/blueprints.ts`（新）、`platform/plugin-manifest.ts` | api：`contracts/platform/blueprints`（新）、`contracts/platform/plugin`、`plugin-sdk/index` | 形状和检查复用 P-2a，设置与主人声明接 P-1。来源转出复用 36 提前合同，公开接线与包读取等 08 交接。不依赖 P-2b 或 36 的服务实现 |
| P-3c 采用动作与签名入口 | 第 7.1 节八个动作的公开声明与类型，第 8 节固定内容采用输入，第 6.6 节签名入口与安装预览来源类型。实际接入边界随接线验证，完整服务与 S-110 处理器真实拒绝归第 44 批 | `services/blueprints.ts`（新）、`platform/plugin-trust.ts` | api：`contracts/services/blueprints`（新）、`contracts/platform/plugin-trust`；`host-actions.tsv` 只收真实登记 | 合同复用 P-3b 与 36 来源形状。P-3a、08 C-2 和主人读写是实际接入前置 |
| P-4 首页与生成页面 | 第 6.5 节八个动作、选择／版本／批准和页面主体公开形状，SDK 静态校验及公共入口接线。已接入的真实边界当批验拒绝。运行、SPC-10／11 与 S-111～S-113 的页面实操归第 37 批 | `services/home.ts`（新）、`platform/actions.ts` | api：`contracts/services/home`（新）、`contracts/platform/actions`、`plugin-sdk/index`。`host-actions.tsv` 只收真实登记 | 05② C-2／C-3 公共形状已在。实际卡片用第 15 批提供方。P-3b／P-3c 共用采用形状，`platform/actions` 排 #1791 K0 后 |

**先后**（合同台 2026-11-04 排，[#1806 评论](https://github.com/molis-ai/molis-work/pull/1806#issuecomment-6638722432)；08 C-3 的位置由用户 2026-11-07 改，见[技能包需求第 9 节](../skill-packs/spec.md#9-决策记录)；以下是依赖与接力顺序，不是拆 PR 的清单；第 20 批一个 PR，同一份快照一次一个写手，全部在 02 交接之后）：

| 顺序 | 片 | 动到的快照 |
| --- | --- | --- |
| 1 | 05② C-1 | `modules/projects`、新的 `platform/project-materials` |
| 2 | 08 C-1 | `plugin-manifest`（`kind: "content"`）、`plugin-agent` |
| 2′ | 08 C-3（不等 P-3b／P-3c；和 3、4 同一份快照，先准备好的先落） | `plugin-package`（沙箱方法写法） |
| 3 | 05② C-2 | `plugin-manifest`（`presentation`）、`platform/presentation` |
| 4 | P-1 设置 | `plugin-manifest`（`settings_entries`）、新的 `platform/settings` |
| 4′ | 08 C-2、#1791 K0（可与 P-1 并行，不动 `plugin-manifest`） | `services/skills`、`host-actions`；`platform/actions`、`platform/composer` |
| 5 | P-3a | `modules/projects`、`host-actions`（与 4′ 的 `host-actions` 错开） |
| 6 | P-2a 角色模板可独立；P-2b 角色采用接口在 36 层次合同之后 | `modules/characters`；仅 P-2b 动 `host-actions` |
| 7 | 05② C-3（第 14 批 `TextRef` 之后） | `services/surface-composition`、`host-actions` |
| 8 | P-3b、P-3c | `plugin-manifest`（`adopts`）、新的 `platform/blueprints`、`services/blueprints`、`host-actions` |
| 9 | P-4 | 新的 `services/home`、`platform/actions`（页面主体，排在 #1791 K0 之后）、`host-actions` |

- 快照文件名：`plugin-manifest.ts`、`plugin-package.ts` 没有自己的子路径，经 `platform/plugin` 导出，所以它们的改动都落在 api 快照 `contracts/platform/plugin.txt` 上；表里按源文件写，排序时视为同一份快照。
- 按快照看：`plugin-manifest` 是 08 C-1 → 05② C-2 → P-1 → P-3b，08 C-3 插在 08 C-1 之后、P-3b 之前，和 05② C-2、P-1 先准备好的先落（共用 `platform/plugin.txt`，见下一条）；`modules/projects` 是 05② C-1 → P-3a；`plugin-package` 只有 08 C-3（本稿不动）；`platform/actions` 是 #1791 K0 → P-4；`host-actions.tsv` 按上表依次落，同一时间只有一片在途。
- 全部在 M1 之前落，按 N35 一个 PR 改完所有消费者，不留兼容期。
- 错误码用 `defineErrorCodes`：`blueprints.part_unsupported`（主人没声明）、`blueprints.step_conflict`（主人的 revision 变了）、`blueprints.dependency_unmet`、`blueprints.preview_expired`；设置的拒绝由主人给 `<主人>.setting_invalid`、`<主人>.setting_conflict`，SDK 的 bind 帮主人按主人名生成，不新增平台码。P-1 落时按 `tooling/gates/error-owners.json` 核主人名。

**共享文件交接更新。** 第 08 批 #1984 最新交接头 `8fc71a40e8` 已释放 SDK 根出口、contracts 导出、Manifest 及 `packages/plugin-runtime/src/index.ts` 等共享文件。串行接入须保留该头的取消清理修复。宿主枢纽与动作快照由第 16 批交给第 15 批，组合提供方接好后交第 20 批。文件交接与提供方可调用分别验证。

**P-3c 文件与验收。** 实施用 `packages/contracts/src/services/blueprints.ts` 和 `tests/blueprint-adoption-contract.test.ts`，按同批顺序接 `contracts/package.json`、`platform/plugin-trust.ts`、SDK 的声明检查与相关 API 快照。动作版本只首次登记。八个场景动作当前没有 `system.blueprints` provider 或处理器，交给第 44 批真实登记。签名仍归 `plugin-install`，输入沿现有内容包 `{ manifest, files }`，输出复用普通安装预览 `{ preview_id }`。`platform/plugin-trust` 的预览来源只收 `ai_generated`／`imported`／`saved`。真实签名接线排在 08 C-2 和内容包安装入口之后。基点的 `plugins.install.preview@1` 只认项目上下文，签名动作尚无登记。个人另存若缺普通预览上下文，由接线片解决。现有签包解析只保留 Manifest 与文件，随包来源须走经评审的签名覆盖路径。未核实前不改包格式、密钥或真实 Home。

SPC-C07 经公开 `services/blueprints` 与 Kernel `compileActionSchema` 验八项动作的输入输出，覆盖三方差异、无安装身份的随包候选、采用历史与带请求键的撤销结果并存、跳过及待核对、安装与批准状态及伪造身份拒绝。第 8 节通过公开 Manifest／SDK 验固定 `selection` 缺 CAS、错分支及错动作版本被拒。实际接入须验证 A 创建、B 复用后 A 的旧凭据撤回被拒，同键重放只推进一次，移除 B 后旧凭据仍失效。基点 `pluginInstallHandlers` 只核可信 `user_action`，Kernel 允许嵌套调用原样继承，尚无供处理器消费的公开上一层引用。签名来源、直接批准拒绝与上一层审计须接真实可信调用链验证。没有该链和实际处理器时保留 SPC-14／15、S-110 及 S-113 的对应运行验收。

**P-4 文件与验收。** 实施用 `packages/contracts/src/services/home.ts`、`packages/plugin-sdk/src/home-page.ts` 和 `tests/home-page-contract.test.ts`。`contracts/package.json`、SDK `index.ts` 及共享 API 快照按同批顺序接入，`platform/actions` 按上表等 #1791 K0。独占文件未接公开出口时只是待接候选。现行 `apps/local-host/src/home-actions.ts` 已用 `system.home`，新八个页面动作尚无处理器，第 37 批接同一提供方。此处必要接入是公开合同、SDK 及共用声明校验，范围不含新运行服务、数据库、iframe、网关或批准流程。

SPC-C06 经公开 `services/home` 和 Kernel `compileActionSchema` 验精确页面与动作版本、摘要形状、批准回读／恢复输入、身份字段拒绝和 user-only 声明。经公开 SDK 验路径穿越／重名、错误入口与类型、单文件和合计 UTF-8 字节超限、引用缺 provider 或重复。可用 `surfaceCompositionActions.compose` 公开 schema 验 `{ slot: { kind: "home" } }`，以 `/presentation` 检查真实 values 形状。没有真实页面执行入口时，以上只记合同和静态证据。

SPC-C06／C07 用公开 schema 验批准请求键、按请求返回原回执、另列当前 revision 及回执缺失的形状。真实接入验 A 批准后切回基础首页，再独立批准同一页同一版。A 续做仍读 A 的原 revision，撤销不能改动后一次选择。缺少匹配回执时即使当前页相同，也不能证明 A 生效。真实写入与续做由 37／44 按已有首页主人事务和场景步骤实现。


### 10.1 P-3a 项目插件成员的最小接入（20-1）

基线已把常开、随行、个人插件隐藏规则放在 `modules/projects/src/project-service.ts` 的 `addPlugin`／`removePlugin`，不再搬一次。仅给这份事实加公开读写及并发保护：

- 成员动作返回 `VersionedProjectPluginMembership extends ProjectPluginMembership`，增加 `revision: string`，是调用方只保存和回传的不透明值。`projects.plugins.get@1` 输入 `{}`，输出该 membership；`projects.plugins.set@1` 输入 `{ plugin_id: string; enabled: boolean; expected_revision: string }`，输出修改后的同形 membership。读取受众为 user／plugin／agent，写仅 user。项目、actor 取调用上下文，输入不收它们；不提供整表替换或另一个成员名单。原来的 `projectPluginMembership` 和 `storedProjectPluginMembership` 继续供权限／可达性检查使用，不为每次检查增加事件查询；编辑入口显式调用 `projectPluginMembershipWithRevision`，与写入共用同一份成员事实和观察规则（2026-11-08 实施调整）。
- revision 由目录主人根据当前实际成员、hidden 和最近一条成员增删事件的 `event_id` 得到，读时同一个事务快照；集合排序稳定，最近事件按已有库的实际写入顺序取，不能用时间字符串排序猜最后一条。事件类型为 `project.plugin_added`／`project.plugin_removed`，包含个人插件 hide／show。值变回原样但发生过增删时 revision 仍变化，防止 ABA；不拿 `projects.updated_at` 当 revision，不加表、列或持久化格式版本。
- set 在 owner 同一事务里读 revision 并核对，随后调用原 `addPlugin`／`removePlugin` 和原事件写入，再返回最新 membership；旧 revision 拒绝且无成员／hidden／事件副作用。常开插件不能移除、移除依赖导致随行移除、个人插件只隐藏等原规则照旧。两个携带相同 revision、确实会改变成员的交错写入，只允许先提交者成功。旧 revision 即使目标状态已经达到也拒绝，不能当成无变化成功绕过冲突检查；只有 revision 正确且该操作涉及的成员、隐藏及既有同步意图均无变化时，才返回当前 membership、不增事件。有效常开成员的启用不写成员或同步意图，也不清掉暂时被常开规则遮住的个人隐藏选择；取消常开后原隐藏选择仍有效。普通成员已在运行、但同步中的成员意图已撤掉时，明确启用仍沿原 `addPlugin` 规则补回该意图并记事件，不能只比较当前可见成员而跳过。这里不新增 request_id 回执表，场景服务续做仍先回读真实结果。
- 合同动作沿 `projects.directories.get` 的目录提供方注册一次。项目设置 HTTP 的写调 set，`beforeEffect()` 之后进入同步 owner 事务。成员提交后复用 `refreshOpenProjectPlugins`。刷新失败以结构化错误反馈「成员已保存，运行状态尚未同步」，并带实际 membership 与 revision。页面先应用这份快照，恢复走现有项目重开或刷新，只处理运行状态（第 10.2 节）。
- 全项目 GET 直接复用 get 的版本化 owner 读取，保留被动读取。页面提交携带编辑时实际读到的 revision，收到成功回执后更新观察值。冲突沿现有错误反馈要求重新读取，保留用户本次操作。API 外的 owner 级写入口继续复用同一规则与事件，使它们的变更也会令旧 revision 失效。

允许实现路径包括 `packages/contracts/src/modules/projects.ts`、`modules/projects/src/` 的主人读写与现有合同装配、Host 的目录动作、项目设置 HTTP 与项目插件运行刷新、现有页面保存载荷和对应测试。`modules/projects` API 快照可独立更新。`host-actions.tsv` 等 #1984 释放后由本批主会话最终刷新。这里沿用已有事件，涉及新增库结构或持久化版本的缺口交回主会话。

**SPC-C08**：从公开 get 取得 revision 后 set 成功，回读和 HTTP／页面保存一致；旧 revision（包括目标已达到）、两个同 revision 且实际改变成员的写入交错、增后删回原值的 ABA 均按冲突规则拒绝且不多事件；正确 revision 的无变化提交成功且不添事件。故障注入成员提交后的 Runtime 刷新失败，断言成员／事件只写一次，错误可取得最新 membership／revision，UI 不假回滚，恢复只刷新而不重复写成员；常开／随行／个人 hide-show 规则保持；重开目录仍能识别旧 revision；上下文项目／actor 不可由输入覆盖。关联 SPC-03、07、14，只证明项目成员接入，不代替整个场景采用或安装授权验收。

### 10.2 P-3a 宿主、页面与运行恢复设计

**目录提供方与 Web 授权。** `apps/local-host/src/project-workspace-actions.ts` 的 `projectWorkspaceActionProvider` 在现有 `PROJECT_WORKSPACE_PROVIDER_ID` 下绑定两个动作。`project-catalog.ts` 只委托 `ProjectsModule` 的 `projectPluginMembershipWithRevision`、`setProjectPlugin`。写走 `catalog.commit`，把 `caller.beforeEffect` 交给等待写锁的检查，进入同步事务时用 `requireSynchronous(caller.assert_authority_current?.())` 与 `caller.signal?.throwIfAborted()` 做最终复核。项目 ID 和 actor 用可信调用上下文。运行刷新在 Catalog 提交后进行。

`web-catalog-routes.ts` 按 URL 项目从 Catalog 解析 Host reference。`web-project-settings.ts` 的 POST／DELETE 请求体仅收 `plugin_id` 和 `expected_revision`，HTTP 方法映射为 `enabled`。入口只绑定固定目录提供方的 `projects.plugins.set@1`。本机用户身份沿 `local-web-actions.ts` 的取法，首次等待前用 `captureWebSessionAuthority` 固定请求会话，用 `localOwnerPermissionsOver` 对精确动作引用检查 `projects:settings`。用现有 `actionClient(reference, false)` 跳过项目插件准备，仍经宿主动作网关。普通 `bindLocalWebActions` 构造上下文会先准备插件，因此这里需要固定动作的窄绑定。全项目 GET `/api/settings/project-plugins` 从 Catalog 用同一版本化 owner 读取，独立于项目 Runtime，保留 `web-home-plugin-recovery.ts` 的展示回退。回退行只供展示，没有可提交的 revision。

**页面观察与回执。** 选择器及当前项目市场使用 `apps/workbench/src/scripts/client/plugin-membership.ts`，市场为其他项目保存使用同目录 `plugin-workbench.ts`。选择器的页面与市场列表分别附带展示成员、隐藏状态时同一次读到的 revision，点击时固定目标项目、操作和观察值。Coding 的 MCP 设置页原有「为当前项目启用 Coding」从同一被动列表确认未启用、带 revision 显示该按钮。保存成功采用返回的 `plugins`、`hidden`、`revision`。冲突用现有反馈保留操作意图，重读后由人再次发起。已提交而刷新失败时，Host 用 `defineErrorCodes` 声明 `host.project_plugins_refresh_failed`（`unavailable`），HTTP 503 保留 `details: { committed: true, membership }`。membership 从同一 Catalog owner 回读最新值，独立于故障 Runtime。若目录也无法回读，改带 `committed_membership` 表示提交时的观察值，页面重读成功后才允许继续保存。客户端先采用回执的成员和 revision，再用现有状态行或 toast 提示，保留已保存的成员选择，运行页面按现有机制在刷新后跟上。市场的冲突与已保存但待同步反馈会把现有状态及重试行滚入可见区，保留选择和键盘焦点。Coding 设置页显示已保存反馈并移除启用按钮。

**运行刷新与恢复。** `project-plugin-enablement.ts` 的 `projectPluginEnablementRefresh` 沿单项目 `tail` 串行处理，每轮重新读 Catalog，并返回未完成切换的插件、目标启用状态和可展示原因。当前实现忽略 `supervisor.enable()` 返回的 `failed`／`blocked`，`enabledPluginIds()` 也可能包含启动失败的插件。另一方向先 `supervisor.revoke()` 再 `runtime.stop()`，停用失败后下一轮会因插件已从 enabled 列表移除而跳过。普通项目页重开或刷新经 `web-request.ts` 的 `ensureProjectPlugins` 调用 `state.refreshEnablement`。插件级失败留在本轮结果及现有不可用页面，其他插件的刷新和项目页继续服务。RAC-1120 的隔离插件移出、再加入仍是 `quarantined`，项目页仍返回 200。隔离中的插件已经不可用，移出可保留隔离状态完成停用，加入也只有原有显式解除隔离入口能使它运行。

保存后的 `refreshOpenProjectPlugins` 需直接取得这一次刷新结果。现有 `inspectActions` 只返回动作目录。Host 装配可复用 `LocalHost.withExistingRuntime`，由 `project-plugins.ts` 从已有 `started` 记录调用同一个 `state.refreshEnablement`。没有插件平台时由下次打开项目读最新成员并启动。严格保存入口只对本次成员变更涉及的切换报告同步失败，关联范围从事务内提交前后快照和现有插件登记取得，含随行项。项目页与保存进入同一个串行刷新队列，只有保存把本次相关的未完成结果转换为提交后的 503。

未完成切换可在现有刷新闭包内临时记住，仅用于完成仍符合最新成员选择的切换。已有安装用 `runtime.get(installId)` 返回的 `PluginInstanceRecord.install_id`、`installation_generation` 和 `state` 核对身份与当前生命周期。启用沿 `supervisor.state()` 和 `enable()`，后者按需调用 `restart()`。停用沿 `runtime.stop()` 收尾。反向修改或安装换代时丢弃过时标记，按现状处理。既有取消与撤权检查继续生效，其他崩溃、隔离解除和重新安装各走原授权入口。成员意图始终来自 Catalog，进程重开走现有启动流程。市场已有「重试」继续重读列表，运行恢复走现有项目重开或刷新入口。

**实现顺序。** #1984 核对头 `cbbeb06` 未占 `project-plugin-enablement.ts`、`project-plugins.ts` 或 `packages/plugin-runtime/src/supervisor.ts`。运行协调的结果与重试修复经设计审核后可先做独立段。Host 动作装配、页面接入及共享快照等 #1984 交接。临时切换状态不持久化，也不增加公开恢复动作、路由或布局。

**SPC-C08 接入验证。** 使用公开动作与现有 HTTP 走通 get／set，验证伪造身份、等待写锁时撤权、旧 revision 及被动 GET 不唤醒项目。运行夹具让真实 `enable()` 返回失败，也让 `revoke()` 已生效后的显式 `runtime.stop()` 实际失败，断言两种切换经现有重开／刷新恢复。停用用例要确认故障出现在显式等待的 stop，后台 stop 失败后显式 stop 仍可能完成停用。覆盖切换期间撤权、反向修改、blocked 与隔离状态，按 RAC-1120 验证普通项目页 200 及隔离状态未变。核对失败回执与实际成员、revision、事件数，恢复不增成员事件。浏览器分别核对当前与其他项目发出的 revision、冲突保留意图及 503 保留已保存的状态。实现后按现有门禁量工作台脚本的下发字节。

## 11. 存量数据

第 02 批真实 Home 已核实统一起点，不能再按重建前的规则直接改第 1 版建表。本批合同文件、SDK 静态校验不改存量库。后续场景服务新库、首页项目库、设置回执、Characters 来源字段／层次如果涉及持久化格式变化，须先给具体结构、版本和升级方案，由主会话问用户，再实施；本稿的表归属设计不是迁移授权。

引导现有的 `context-onboarding` 库不在本批动；它和场景服务的草稿怎样合，由第 44 批定。不加读取兼容。

## 12. 界面

第 20 批的界面要求是「复用 04；影响交互的合同差异先定样」。本稿不决定任何交互，所有字段都够几种候选画法用。和 04 的样（[onboarding-full-journey](../../docs/design/onboarding-full-journey/README.md)）比，合同带出四处 04 没画的，各交给要做它的批次在实现前定样：

| 差异 | 04 现在 | 交给 |
| --- | --- | --- |
| 有效值的来源（本次、本项目、个人默认、默认） | 来源标记按「让版面说话」去掉了 | 44 的完整路径定样：来源仍要能看到（§3.11），放进「?」或展开处，由 44 定 |
| 采用中途停在「要先安装」：转到普通的安装确认（验签名、本人确认），装好回到采用接着做 | 只画了「缺一个插件、挡哪一步」 | 44 的挑官方场景包两种入口定样 |
| 撤销、移除场景包、官方场景包升级的差异 | 没画 | 44 |
| 页面采用、恢复上一版、回到基础首页 | 首页是占位 | 37 的「页面采用／恢复」定样 |

D 轨若要在组件板补「逐步状态」「三方差异」的标本，由 44、37 的定样提出。

## 13. 要定的事

1. **首页形态：用户 2026-11-04 已定**（统筹转达）：首页是平台能力、插件注册卡片、生成页面是首页自己的内容，不当插件。第 6 节按此改写；Work Brief 需求 §1.3、§2 与 Onboarding §3.10 里「页面定义归 Work Brief」随之改，决策记进 Onboarding §10。首页服务放 `horizontal/home`（第 6.1 节）请统筹确认；四条不变量的编号由合同台定为 S-110～S-113。
2. **草稿采用时不必先打包**（第 3 节）：只有要装的新 Skill 才签名打包成内容包；生成页面不打包（第 6 节）。合同台 2026-11-04 核过，符合 #1793 裁定第 3 条的更正（个人场景包、AI 生成的草稿、外部导入都用这个 Home 已有的发布身份）。
3. **场景服务放在 `horizontal/blueprints`**，草稿与采用记录在它自己的 Home 库（第 7 节）。合同台 2026-11-04 确认，与第 21 批 D2 同一做法。
4. **界面名统一成「场景包」**（第 3 节）：「场景方案」「方案」不再用；「官方场景套组」改称「官方场景包」：**用户 11-04 已定**（合同台弹窗），Onboarding、路线书与第 20、44、51 批文件已同步改；第 20 批第 2 项随之叫「场景包声明」。英文键 `blueprint`。
5. **平台签名入口** `plugins.local_packages.sign@1`：合同台 2026-11-04 定，提供方是宿主的 `plugin-install`（和安装预览、启用同一个），在宿主里调发布身份的签名函数；发布身份本身留在原处。创作台是批过的构建期例外（BL-377 重做），不往它身上加动作。只给本人，每次是一次明确发布（第 6.6 节）；生成页面不打包，签名入口只给内容包用。

## 14. 验收编号（候选）

以下 SPC-01～16 保留产品行为验收；实现时测试名或注释写出实际证明的编号。合同与静态校验不能单独证明采用、授权拒绝、重启或页面真实运行，合同层用第 14.1 节的 SPC-C 编号，关联不等于通过。

| 编号 | 要达到的结果 | 对应 |
| --- | --- | --- |
| SPC-01 | 同一份场景包无论来自官方场景包、个人场景包还是草稿，都由同一个静态 `inspectBlueprint` 校验，走同一个 `adoption.preview`／`apply`；代码里没有按场景包名、插件名或「官方」的分支 | ONB-53、ONB-33 |
| SPC-02 | 预览逐项写出新建、复用、修改、跳过，当前值与来源、建议值、层次、后果和缺的依赖；会改权限、花钱、对外发、开定时的项单独标出 | §3.12、ONB-19 |
| SPC-03 | 采用逐项调主人的动作并回读；在任一步制造失败、取消和重启，再继续不重复建角色、成员、页面，不重复外部效果；待核对的先读再定 | ONB-28、ONB-45 |
| SPC-04 | 同一项设置从引导、设置页和助理改，读到同一个有效值和来源；`inherit` 恢复沿用上一层；本次任务的值不写进主人 | ONB-21～23、ONB-31 |
| SPC-05 | 场景包写的设置越过主人的硬限制被拒；采用不新增动作授权、不扩大连接使用范围、不开启停用项 | §3.11 末段、ONB-34 |
| SPC-06 | 角色模板采用后是你的角色，带来源；同名时不覆盖；模板的工具与动作只能收窄 | ONB-17、ONB-20 |
| SPC-07 | 撤销与移除只处理主人 revision 未变的部分；你之后改过的、别的场景包还在用的插件、稿件、待办、代码改动和你的角色都保留 | ONB-30、ONB-56 |
| SPC-08 | 场景包升级按三方比较列出差异，你改过的默认保留；不升级时原采用照常可用 | ONB-55 |
| SPC-09 | 插件没声明 `settings_entries` 或 `adopts` 的部分在预览里标「提供方没有公开配置能力」，不能采用 | ONB-33 |
| SPC-10 | 生成页面只跑首页存下的、摘要相符的文件；改过的文件、清单外脚本、内联脚本、`eval`、直接网络都不运行；页面主体只能调这一版声明并经本人批准的、受众含 `plugin` 的本项目动作；助理、插件、页面自己调不了 `adopt`／`restore`（S-111～S-113） | §3.10、ONB-26 |
| SPC-11 | 生成页面加载失败、文件对不上或被撤下时显示基础首页；换版后旧版本的在途调用不生效；恢复上一版、回到基础首页都不重做已完成的业务动作；插件卡片在基础首页与生成页面里出自同一份呈现声明 | WBR-22、WBR-23、WBR-27、ONB-25 |
| SPC-12 | 采用进度在页面上实时更新，不轮询；重进只读一次 | 第 9 节 |
| SPC-13 | 一个官方场景包依赖还没装的插件时照样装得上；预览里那一项标依赖未满足，只挡受影响的步骤 | ONB-54 |
| SPC-14 | `apply` 碰到要装的部分停在 `needs_install`，从不调 `plugins.install.confirm`；本人装好后同一个 `request_id` 续做；`apply` 用系统身份写主人数据被拒，嵌套调用的调用记录里有上一层；首页那一步停在 `needs_approval`，`apply`／`revert`／`remove` 嵌套调 `home.pages.adopt`／`restore` 被拒 | ONB-53、ONB-34 |
| SPC-15 | 首页服务、场景服务都拿不到私钥：个人场景包与导入的 Skill 只经 `plugins.local_packages.sign@1` 签名，安装预览写出来源（AI 生成、导入、另存），来源不从输入读 | S-84、S-87 |
| SPC-16 | 删项目后指向它的采用记录被清；主人插件停用或卸载后，那一步标「主人已不在」，撤销跳过并如实写出 | ONB-56、§3.12 |

### 14.1 本批合同层验收

以下列验收标准，实际通过范围按批次文件的证据记录，局部用例不代表整项通过。验证使用公开 contracts／SDK 入口，不只查 fixture 字段存在；主会话在最终头按包要求完成构建、定向用例、API／动作快照与全量检查。安全边界真正接入之前不在不变量表冒充已有拒绝实现。

| 编号 | 合同层可证明的结果 | 关联但不能替代的产品验收 |
| --- | --- | --- |
| SPC-C01 | 设置声明拒绝错读写 schema、错 action 引用、越层或坏 TextRef；有效值解析正确区分项目／个人／默认和 unavailable | SPC-04、05、09 |
| SPC-C02 | SDK 设置绑定接可持久化的 owner 事务：同请求重放只写一次，同键异内容拒绝，两个同 revision 并发写只有一次成功，重开 owner 后重放返回原结果，写 receipt 失败不留值修改，撤权不落值／回执 | SPC-03、04、05；不代表所有存量设置已迁入 |
| SPC-C03 | Blueprint 校验接受同一形状的 package／draft，拒绝重复／悬空 ID、错角色协作、示范任务结果不在所引步骤、required 与 optional 矛盾；缺未安装能力本身不导致静态拒绝 | SPC-01、02、13；ONB-53、54 |
| SPC-C04 | 普通内容包解析接受仅 blueprint、仅 methods、两者都有；拒绝两者皆无、运行时权限／入口、缺文件／多文件、非法语言清单；默认及译文共用同一校验，语言间改了能力／步骤／设置值即拒绝 | SPC-01、13；ONB-53 |
| SPC-C05 | TextRef 的包键／草稿 literal 边界及译文结构检查调用 14 共用实现；草稿转词时花括号失败能定位场景字段并给替换建议，不自动改字；签名／保存消费者后续另验无副作用 | ONB-53；FSS-74 的场景包合同部分 |
| SPC-C06 | 角色模板、采用来源与请求键、成员结果与批读、页面动作／版本／批准类型可从公共路径消费。严格 schema 拒绝伪造 actor／安装身份及未声明字段。角色用 36 已定义的准确类型，真实 owner 事务与回读另验 | SPC-06、10、11、14、15；合同证据覆盖形状，运行验收另记 |
| SPC-C07 | 升级预览合同能表达稳定 part_id 对应的旧建议／新建议／当前值、保留用户修改、新增／移除／依赖变化及采用语言；随包候选沿 08 包来源表达，无安装身份或自动授权 | SPC-07、08、13、16；ONB-55、56，实际三方计算与卸载保留仍待服务测试 |

## 15. 开工前检查

本批 20-1／20-2 的 15 项回答唯一维护在 [Onboarding 第 11 节](../onboarding-coverage/spec.md#batch-20-preflight)，Work Brief 引用同处。原 11-04 设计的主人、表、调用次数和安全规则保留在本文对应章节；本次不把它们记成已实现。合同设计与工程验收分开：本批补公共形状、共用校验与必要接入，并验证实际接入边界的真实拒绝；37／44 接页面与采用，36 接角色层次，26 接正式签名发行；行业观察与写作、写代码场景归 44，个人事务与每日简报归 51。任何新增存量 schema／版本、页面资源或产品语义变化仍先交主会话处理红线。
