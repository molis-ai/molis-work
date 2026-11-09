# 场景与生成页面公共合同（路线书 20 第 1、2 项）

状态：部分实施，2026-11-04 起草，2026-11-08 补齐第 20 批场景包声明与合同验收边界。P-3a 的 owner 与合同已在本地批分支实施，宿主及界面接入未完成；其他合同仍在设计与等待前置阶段，证据见批次文件。保留 11-04 评审修订及用户确定的首页归属。第 20 批全部合同在同一批分支按依赖接力、一个 PR 交付（第 10 节）；第 36 批角色层次合同仍是 P-2 前置。第 37／44 批承担页面与引导的服务、交互和真实路径验收，不能拿本批静态校验代替。P4 分工由用户 2026-11-08（PST）明确选择：「按批次分工（推荐）：20 完成公共合同、SDK 校验和本批必要接入；37 完成页面运行及真实安全验收，未完成项明确保留。」

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
| `role` | Characters（36） | `characters.from_template@1`（第 5 节） | `characters.subject.read@2` | 解除这次采用建的项目成员；你的角色本身留着（ONB-56） |
| `setting` | 声明这一项的主人（第 4 节） | 主人的写动作 | 主人的读动作 | 值仍是采用写的那个（revision 没变）时恢复采用前的值或沿用 |
| `connection` | connector-host | 采用不连账号，只标「去连接」，挡受影响的步骤 | 连接状态 | 无 |
| `content` | 声明接受这种内容的主人（第 8 节） | 主人的采用动作 | 主人的读动作 | 主人的撤回动作；主人没声明撤回的，只解除绑定 |

**校验分两步**，因为「有没有主人」要看此刻装了什么：

- **静态检查**：SDK 的 `inspectBlueprint(blueprint, { source: "package" | "draft" })`，不看目录。查第 3.1～3.3 节的字段、引用、建议种类、各项上限与角色模板；文字复用 `textRefProblems`，包只收键、草稿只收 literal。内容包安装、场景服务存草稿共用它，坏的场景包整份拒；问题沿用 `PluginDeclarationProblem`，带具体字段路径与 `reason`，不另造错误模型。
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

沿 08 的 `plugins.bundled.list@1` 读取已验签包的身份、名称与说明；未安装的场景正文从同一份验证过的内容包读，不另建场景登记库。文字经 `createTextReader` 按调用语言解析，HTML 不用 `.text`。这里只列候选，不能把 bundled 当 install_id、项目成员、启用或授权。尚未选用时不登记 Skill、不出现在工作台／项目，不起进程；选中才走普通安装预览、本人确认、项目启用与场景采用。离线挑选不等于所有依赖离线可用。发布者密钥、签包和安装包资源由第 26 批处理，本批不碰凭据、不制作官方发行包。

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

独占实现放在 contracts 的 `platform/settings.ts` 和 SDK 的 `settings.ts`、`sandbox-schema.ts`。Manifest 字段、解析接线、SDK 根导出及共享 API 快照等 #1984 交接后串行接入。本片以公开 contracts／SDK 入口和真实 Runtime 准入验证，不登记存量 owner 的设置动作。用户 2026-11-08（PST）已定：本批完成公共合同、SDK 绑定和声明校验，签名沙箱 app 的设置执行留待后续接入，记在 [BL-settings-sandbox-execution](../backlog/BL-settings-sandbox-execution.md)。本批不宣称签名沙箱设置已能执行，也不放开无处理器的声明。当前签包按固定 Manifest 投影，沙箱的数据库事务端口只接受写语句批次。后续接入需要投影固定读写定义，并在安装私有库内提供受授权的同步事务端口供同一 SDK 绑定调用。用户同日确认保留第 36 批先交角色层次合同的分工，P-2 仍等该前置，本批先推进可独立部分。

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

- **采用动作** `characters.from_template@1`（command，只给本人）：按模板建一份你的角色草稿，记下来源 `{ source: BlueprintSource; part_id }`；标题按本人当时的界面语言解析成字符串存进草稿；同一个 `request_id` 只建一次。项目里已有同名角色时不覆盖，由预览让你选沿用还是另建（04 定样已画）。
- **层次与生效归 36**：项目成员默认跟随你的原件、改了哪一节哪一节成为本项目的、取值顺序「本次 → 本项目 → 你的默认 → 助理自己」、每次保存固定一个版本，都是 36 的合同。本稿只要求两件事：采用建的项目成员带着来源，以便升级时比差异、移除时只解除它（ONB-56）；模板不能放宽工具与动作（36 第三节「选角色不是授权」）。
- 官方场景包升级时，模板变了只出现在升级预览里，由你挑着重新采用；不改你已经改过的角色（ONB-55）。
- **36 前置核对（2026-11-08）**：其方案 C 足以确定模板内容、个人／项目作用域、逐节跟随与覆盖的设计原则；现有 `CharacterDraft` 没有项目成员、默认选择和固定生效版本的层次合同。P-2 可据现有字段定 `RoleTemplate` 及校验，但 `characters.from_template` 的项目成员返回值、来源挂载与回读须接 36 的准确类型；不能凭本稿补一套角色层次，更不能把模板类型完成写成角色采用完成。缺的合同由主会话安排 36 提前合同片，角色服务实现仍归 36。

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

插件不另声明「首页卡片」。卡片就是 05② 呈现声明里的对象与形态，加上第 15 批要 C 轨补进 C-2 的插件级概况声明（[#1798](https://github.com/molis-ai/molis-work/pull/1798) 第 12 节第 1 条，C 轨已同意）。首页按 `surfaces.compose@1`、`slot: { kind: "home" }` 取组合好的描述，值由页面另用 `PresentationValues` 取。能力只注册一次：同一份声明，基础首页、生成页面、侧栏、搜索都用。

- 基础首页：首页服务直接画 `surfaces.compose` 给的描述（第 15 批 S-2 的内容）。
- 生成页面：页面要放插件卡片时，同样经页面网关调 `surfaces.compose@1` 与各主人的 values 动作，这两个也要在页面声明、本人批准的动作里；页面拿到的只是描述和值，渲染用 SDK 的 `renderPresentationForm`。
- 所以 05② 的 `SurfaceSlotKind` 的 `home` 就是首页的组合位置，没有第二个「首页」：不在 `UI_VIEW_SLOTS` 里加 `home`，也没有 `projects.home`。

### 6.3 生成页面的形状

```ts
// packages/contracts/src/services/home.ts（新子路径）
interface HomePageVersion {
  page_id: string; version: number;          // 版本只增
  title: string;
  files: Array<{ path: string; media_type: "text/html" | "text/javascript" | "text/css"; bytes: number; sha256: string }>;
  entry: string;                             // 入口 html 的 path
  actions: Array<Pick<ActionReference, "capability_id" | "version">>;   // 页面要用的动作，声明不等于获准
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

- `apply` 做到这一步：存好草稿，把这一步标 `needs_approval`，返回 `page_id`、`version`。
- 本人在首页服务自己的批准界面（第 6.4 节）点 `home.pages.adopt@1`。
- 批准后本人用同一个 `request_id` 再调 `apply`；`home.read` 读到首页已是这一版，才标「已生效」。
- `adopt`、`restore` 只认没有上一层的本人调用：`apply`、`revert`、`remove` 嵌套调它们一律被拒（S-113）。

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
| `blueprints.adoption.preview@1` | user | command（write：存一份会过期的预览记录、发 `preview_id`，与 `plugins.install.preview@5` 同一种） | 输入：草稿或已装的场景包、目标（新项目、某个项目、个人）、选了哪些部分、本次改了哪些值。先做主人检查（第 3 节），再输出每个部分：会新建、复用、修改、要先安装还是跳过；当前值与来源、建议值、写到哪一层；后果标记；依赖是否就绪、缺了挡哪一步；同名冲突。主人的当前值按主人一次读齐 |
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
- **页面的版本与恢复**归首页服务（第 6 节）；采用记录里的首页一步只记本项目首页从哪个换成了哪个。撤销时：采用前是基础首页，就嵌套调 `home.select@1` 换回（只收窄，不授予）；采用前是别的生成页面，换回去等于重新批准它的动作，这一步标 `needs_approval`，由本人在首页的批准界面点 `home.pages.restore@1`。

## 8. 插件采用边界

插件（以及 Module、系统提供方）要被场景配置，只能经过下面三样声明；平台除此之外不碰插件的数据，也不为某个插件写采用代码（ONB-33）。

| 声明 | 写在哪 | 管什么 |
| --- | --- | --- |
| `settings_entries` | Manifest；系统提供方在登记里 | 可配的设置项与读写动作（第 4 节） |
| `adopts` | Manifest；系统提供方在登记里 | 接受哪些 `content` 建议：`{ type, title: TextRef, schema: SandboxSchema, adopt, read, revert? }`，三个都是本插件已声明的动作。首页服务（`system.home`，类型 `molis.home-page.v1`，在登记里声明）、工作流程、项目说明各声明自己的类型 |
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
- **首页**：打开生成页面时一次 `home.read`、一次 `home.pages.files.read`；卡片值按 05② 每个来源一次。不轮询。

## 10. 合同项、子路径与快照

| 片 | 合同项 | contracts 子路径 | 影响的快照 | 前置 |
| --- | --- | --- | --- | --- |
| P-1 设置 | `SettingEntryDeclaration`、`SettingsDeclaration`、读写类型与类型 id、Manifest 的 `settings_entries`；SDK 的 `defineSettingsActions`、`bindSettingsHandlers`、`validateSettingsDeclaration`、`resolveEffectiveSetting` | `platform/settings.ts`（新）、`platform/plugin-manifest.ts` | api：`contracts/platform/settings`（新）、`contracts/platform/plugin-manifest`、`plugin-sdk/index`；动作快照不变（只定类型） | 02 交接 |
| P-2 角色模板 | `RoleTemplate`、`characters.from_template@1` 的声明 | `modules/characters.ts` | api：`contracts/modules/characters`；动作：`host-actions.tsv`（提供方 `io.molis.work.characters` 由宿主登记） | 36 的层次合同同一片或在它之后 |
| P-3a 项目插件成员 | `projects.plugins.set@1` 按 `expected_revision` 把插件加进或撤出项目，受众为 `user`。`projects.plugins.get@1` 返回版本化成员。两个动作复用 Projects 的常开、随行、隐藏和原子 revision 规则。项目设置 HTTP 的写走 set，全项目 GET 复用 get 的 owner 读法，保持被动读取（第 10.1、10.2 节） | `modules/projects.ts` | api：`contracts/modules/projects`；动作：`host-actions.tsv` | 05② 的 C-1（同一快照） |
| P-3b 场景定义 | `Blueprint`、`BlueprintSource`、`BlueprintPart`、`BlueprintProposal`、Manifest 的 `blueprint`／`adopts`；SDK 的 `inspectBlueprint`（静态）、`inspectBlueprintLocales`、内容包文件校验与 `validateAdoptsDeclaration`；GLOSSARY 加「场景包（blueprint）」一行 | `platform/blueprints.ts`（新）、`platform/plugin-manifest.ts` | api：`contracts/platform/blueprints`（新）、`contracts/platform/plugin-manifest`、`plugin-sdk/index` | P-1、P-2；08 的 C-1（`content`、`SkillRef`） |
| P-3c 采用动作与签名入口 | 第 7 节八个动作的声明与类型（`adoption.preview` 是 command／write）；`needs_install`、`needs_approval` 步骤状态；「采用不转交本人的同意」合同及本批实际接入边界的拒绝测试；完整 apply 服务与 S-110 处理器真实拒绝归第 44 批；第 6.6 节的 `plugins.local_packages.sign@1` 与安装预览里的来源字段 | `services/blueprints.ts`（新）、`platform/plugin-trust.ts`（安装预览的类型在这里） | api：`contracts/services/blueprints`（新）、`contracts/platform/plugin-trust`；动作：`host-actions.tsv`（`system.blueprints`、`plugin-install` 的签名入口） | P-3a、P-3b；08 的 C-2（`skills.*`） |
| P-4 首页与生成页面 | `services/home.ts`：首页选择、`HomePageVersion`、第 6.5 节八个动作；页面主体与试用主体这两种调用主体（`platform/actions.ts` 里的调用方种类）；S-111～S-113 三条边界的公共合同。本批交 schema、SDK 校验及必要接入，并验证实际接入边界的真实拒绝；文件送达、页面主体网关、执行隔离、撤权／换版与真实浏览器拒绝归第 37 批（第 6.4 节）。SPC-10／11 留给第 37 批真实验收，不记第 20 批通过（用户 2026-11-08 PST 裁定） | `services/home.ts`（新）、`platform/actions.ts` | api：`contracts/services/home`（新）、`contracts/platform/actions`；动作：`host-actions.tsv`（`system.home`） | 05② 的 C-2、C-3（卡片与 `home` 组合位置）；#1791 K0（同动 `platform/actions`）；P-3b（`adopts`） |

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
| 6 | P-2 角色模板（36 的层次合同之后） | `modules/characters`、`host-actions` |
| 7 | 05② C-3（第 14 批 `TextRef` 之后） | `services/surface-composition`、`host-actions` |
| 8 | P-3b、P-3c | `plugin-manifest`（`adopts`）、新的 `platform/blueprints`、`services/blueprints`、`host-actions` |
| 9 | P-4 | 新的 `services/home`、`platform/actions`（页面主体，排在 #1791 K0 之后）、`host-actions` |

- 快照文件名：`plugin-manifest.ts`、`plugin-package.ts` 没有自己的子路径，经 `platform/plugin` 导出，所以它们的改动都落在 api 快照 `contracts/platform/plugin.txt` 上；表里按源文件写，排序时视为同一份快照。
- 按快照看：`plugin-manifest` 是 08 C-1 → 05② C-2 → P-1 → P-3b，08 C-3 插在 08 C-1 之后、P-3b 之前，和 05② C-2、P-1 先准备好的先落（共用 `platform/plugin.txt`，见下一条）；`modules/projects` 是 05② C-1 → P-3a；`plugin-package` 只有 08 C-3（本稿不动）；`platform/actions` 是 #1791 K0 → P-4；`host-actions.tsv` 按上表依次落，同一时间只有一片在途。
- 全部在 M1 之前落，按 N35 一个 PR 改完所有消费者，不留兼容期。
- 错误码用 `defineErrorCodes`：`blueprints.part_unsupported`（主人没声明）、`blueprints.step_conflict`（主人的 revision 变了）、`blueprints.dependency_unmet`、`blueprints.preview_expired`；设置的拒绝由主人给 `<主人>.setting_invalid`、`<主人>.setting_conflict`，SDK 的 bind 帮主人按主人名生成，不新增平台码。P-1 落时按 `tooling/gates/error-owners.json` 核主人名。


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

**页面观察与回执。** 选择器及当前项目市场使用 `apps/workbench/src/scripts/client/plugin-membership.ts`，市场为其他项目保存使用同目录 `plugin-workbench.ts`。两处都保存与展示成员、隐藏状态时一起读到的 revision，点击时固定目标项目、操作和观察值。保存成功采用返回的 `plugins`、`hidden`、`revision`。冲突用现有反馈保留操作意图，重读后由人再次发起。已提交而刷新失败时，Host 用 `defineErrorCodes` 声明 `host.project_plugins_refresh_failed`（`unavailable`），HTTP 503 保留 `details: { committed: true, membership }`。membership 从同一 Catalog owner 回读最新值，独立于故障 Runtime。若目录也无法回读，改带 `committed_membership` 表示提交时的观察值，页面重读成功后才允许继续保存。客户端先采用回执的成员和 revision，再用现有状态行或 toast 提示，保留已保存的成员选择，运行页面按现有机制在刷新后跟上。

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
| SPC-C06 | 角色模板、采用来源、幂等及页面动作／版本／批准类型可从公共路径消费；严格 schema 拒绝伪造 actor／安装身份及未声明字段；缺 36 输入的准确类型单列，不用 unknown 占位冒充交付 | SPC-06、10、11、14、15；类型拒绝不等于网关真实拒绝 |
| SPC-C07 | 升级预览合同能表达稳定 part_id 对应的旧建议／新建议／当前值、保留用户修改、新增／移除／依赖变化及采用语言；随包候选沿 08 包来源表达，无安装身份或自动授权 | SPC-07、08、13、16；ONB-55、56，实际三方计算与卸载保留仍待服务测试 |

## 15. 开工前检查

本批 20-1／20-2 的 15 项回答唯一维护在 [Onboarding 第 11 节](../onboarding-coverage/spec.md#batch-20-preflight)，Work Brief 引用同处。原 11-04 设计的主人、表、调用次数和安全规则保留在本文对应章节；本次不把它们记成已实现。合同设计与工程验收分开：本批补公共形状、共用校验与必要接入，并验证实际接入边界的真实拒绝；37／44 接页面与采用，36 接角色层次，26 接正式签名发行；行业观察与写作、写代码场景归 44，个人事务与每日简报归 51。任何新增存量 schema／版本、页面资源或产品语义变化仍先交主会话处理红线。
