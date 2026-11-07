# 技能包的合同设计（路线书 08）

状态：设计稿，2026-11-04 写，没有实现。合同归 C 轨；界面定样（安装预览、启用和管理）归 E 轨，两边字段在这里对齐（E 轨 2026-11-04 已回，第 5、7、8 节按它改了）；呈现相关的第 10 节请 D 轨看。合同实现等 C 轨接手（第 02 批 Codex 交接之后），按「合同先行」开小 PR（第 12 节）。第 13 节的问题统筹已于 2026-11-04 裁定，并写进了正文。

## 0. 这份稿子做什么

[第 08 批](../post-anticorruption-roadmap/reference/batches/08.md#batch-08-item-1)要交「技能包基础能力」。本稿写其中的合同，共八项：

1. 公共格式；
2. 普通插件安装；
3. 外部 Skills 导入；
4. 启用与仅手动；
5. 版本；
6. 停用与卸载；
7. Skill 目录；
8. 「只有声明的插件」这种形态。

第 8 项不只给技能包用。[第 20 批第 2 项](../post-anticorruption-roadmap/reference/batches/20.md#batch-20-item-2)的场景套组声明也用它（ONB-53）。套组只往同一份白名单里加自己的键，不按套组名开分支（第 3 节）。

产品规则已经定了，这里不重定：

- [技能包需求](spec.md)：§2～§5、SKP-01～12，以及 2026-10-27 用户定的「启用后默认自动选用，可改为仅手动」；
- [产品建议](../../docs/product-operations/产品优化建议.md) G1、G2；
- BL-165，设计与无障碍内容包；
- [plugin-platform-v2](../plugin-platform-v2/spec.md) S1 与 PLP-01、PLP-02；
- [官方场景套组](../onboarding-coverage/spec.md) §3.8.1 与 ONB-50～56。

本稿只写合同长什么样、归谁、怎么拆 PR，不写实现。现有合同能用的都直接复用：

- 精确来源用 `SignedAgentReference` 和 `SignedAgentInstallation`（`services/agent-definitions`）；
- 安装用 `plugins.install.preview`、`plugins.install.confirm` 与签名包 `PluginPackageBundle`；
- 导入扫描用 Character 导入的 `CharacterImportSnapshot`（`modules/character-import`）；
- 依赖用 Manifest 的 `requires`；
- 用量记录照 `prompt_uses` 和 `recordSignedUse` 的做法。

本稿按第 02 批 #1762 之后的现行形状写：Manifest 只剩 `schema_version: 1`，动作统一到第 1 版。#1762 合入前，文中的版本号以它为准。

## 1. 原则

- **一个事实一个主人。** Skill 的正文与声明归提供它的插件；Skill 目录和启用状态归宿主的 Agent 定义登记（第 7、8 节）；安装、信任、停用、卸载归 Plugin Runtime。导入来源的原文件归用户本机，导入只做固定拷贝。
- **插件同等待遇。** 以下几种技能包用同一份声明、同一个校验函数、同一条安装路径：随系统带的、Plugin Builder 生成的、从别处导入的、第三方签名的。只有安装信任按签名区分，宿主不按插件名或「官方」开分支。
- **哪些文件归 C 轨**（统筹 2026-11-04 定）：`apps/local-host/src/agent-definitions/`、`apps/local-host/src/agent-host-composition.ts`、`apps/local-host/src/plugin-instructions.ts`，以及 `packages/contracts/src/services/agent-host*.ts`。目录、设置和用量的实现都在这几处。
- **Skill 不授予权限。** 声明里的 `tools` 只是说明，用工具仍要当前的动作授权；写操作仍进审查队列。
- **可信身份不从输入读。** 调用方、项目、安装、发布者从调用上下文和安装记录来。「本轮由用户点名」也一样：从这一轮冻结的选择来，不从模型的输入读（第 7 节）。
- **现行取值。** 阶段 1 按 N35 原地改形状，不留旧取值的读取兜底。

## 2. 现状（2026-11-04 核对 main `4fd250564`）

| 现在 | 位置 | 问题 |
| --- | --- | --- |
| `AgentSkillDeclaration` 只有 `skill_id`、`version`、`name`、`summary`、`tools` | `packages/contracts/src/platform/plugin-agent.ts` | 没有「什么时候用」、资源清单、`applies_to` |
| Manifest 至少要一个 `entrypoints`，安装时还要有当前部署环境的入口 | `packages/plugin-sdk/src/manifest.ts`、`packages/plugin-runtime/src/index.ts` 的 `installRecord` | 没有 runtime 的插件装不上 |
| 沙箱 app 包已经能带方法：wire 写 `methods: [{ name, purpose, body }]`，id 由 SHA-256 算出，版本固定为 1 | [沙箱包格式与安装](../../docs/platform/PLUGIN-DEVELOPMENT.md#沙箱包格式与安装) | 第二种方法写法，没有 skill_id、版本和资源；由 C-3 并进来（第 12 节） |
| 助理的 `methods()` 只留「所属插件在这个范围里有可用动作」的方法 | `apps/local-host/src/assistant/assistant-work-reads.ts` | G1：只有内容的插件，助理看不见它的方法 |
| 宿主的 Agent 定义登记：各插件的提示词、角色和方法，加上人改过的覆盖；存在 Home 库 `agent-definitions`，第 1 版 | `apps/local-host/src/agent-definitions/agent-definitions.ts` | 这就是 Skill 目录的主人，但还没有启用状态和资源 |
| Coding 另有一条路：从项目目录找 Skill（`agent.skills.discover.v1`），装进 Prologue 存储（`agent.skills.install.v1`，类型 `molis-coding-method`） | `horizontal/agent-host/src/adapters/prologue-methods.ts`；SSOT「Agent Host 保存的人的配置」 | 第二份名单，与助理不共用 |
| Character 导入会扫五种本机 Agent 的规则和 Skills，导入的 Skills 只在选了这个 Character 的那一轮全文展开 | `packages/contracts/src/modules/character-import.ts`、`horizontal/agent-host/src/character-import.ts` | G2：不进目录，不能按需披露，也不能单项启用 |
| 安装预览 @5 有 `agent_bodies`（种类、名字、前 200 字）和 `declarations` | `apps/local-host/src/plugin-install-actions.ts` | 缺 Skill 的适用说明、资源和依赖状态 |
| 签名包只认沙箱包：要有 `plugin.mjs`，`kind` 只能是 `app` 或 `integration` | `apps/local-host/src/plugin-install-service.ts`、`apps/local-host/src/sandbox-package.ts` | 内容包装不进来 |
| 插件的方法跟着运行的定义登记：定义起来才登记，插件停下就不再提供 | `apps/local-host/src/plugin-instructions.ts` 的 `registerPluginAgentDefinitions`；`agent-definitions.ts` 的 `offering` | 不起进程的插件，方法永远登记不上 |
| 宿主构建的内置插件拿 `HOST_BUILD_TRUST`，安装记录自动跟着构建走：不经确认，也不能拒绝升级 | `apps/local-host/src/project-plugins.ts`；`packages/plugin-runtime/src/install-rules.ts` 的 `recordToFollow` | 套组要首次确认、可以不升级（ONB-53、ONB-55），走内置登记就做不到 |
| 升级差异只比角色和方法的正文 | `apps/local-host/src/plugin-install-service.ts` | 要按 Skill 比资源与版本；场景声明的整份差异归第 20 批 |
| 代码里没有「自动选用 / 仅手动」的状态 | 全仓搜索无结果 | 要新加 |

第 20 批第 2 项的只读核查（F 轨，[#1793](https://github.com/molis-ai/molis-work/pull/1793)，同样对照 `4fd250564`）也列了上面后四项，本稿据此改了第 3 节的交付方式和第 13 节第 1 条。

## 3. 只有声明的插件

`PluginKind` 加 `"content"`，与 plugin-platform-v2 的 `create --kind content` 同名。界面和文档叫「只有声明的插件」，GLOSSARY 在 C-1 里加一行。

**Manifest 的要求**：写 `kind: "content"` 时，以下各项必须为空：

- `entrypoints: []`
- `permissions: []`
- `capabilities: { provides: [], consumes: [] }`
- `artifacts: { produces: [], consumes: [] }`
- `ui.contributions: []`

其余顶层键按白名单收。白名单之外的键出现就拒绝：报 `plugin.declaration_invalid`，并点名是哪个键。

| 允许 | 说明 |
| --- | --- |
| 身份与展示：`schema_version`、`plugin_id`、`version`、`name`、`name_en`、`summary`、`publisher`、`host_api_version`、`developer` | 与其他插件一样 |
| `methods` | 技能，见第 4 节；只有声明的插件至少要有一项（第 20 批加入套组的键以后，改成「`methods` 或套组至少一项」） |
| `requires` | 依赖的动作：必要的不满足就不能启用，可选的不满足只降级，安装预览列出现在满不满足（第 5 节）；只有声明的插件不要求列进 `capabilities.consumes`（第 08 批主会话 2026-11-06 定） |
| `upgrade_compatibility` | 与其他插件一样 |
| `ui.messages`、`ui.translations` | 名称与说明的双语 |
| `runtime: { scope: "home" }` | 这里只表示范围：装给个人空间，所有项目和个人助理都能用。没有进程可起，所以不受 PG-011 对 Home 代码来源的限制；没写就装进项目 |

**不允许**：`actions`、`action_scenes`、`routes`、`ui.views`、`ui.page_routes`、`ports`、`events`、`databases`、`owner_files`、`background`、`connections`、`connection_services`、`integrations`、`source_presentations`、`notifications`、`attention`、`local_tools`、`model_configuration`、`image_generation`、`process_items`、`always_on`、`agent`。`agent` 是插件自己的 Agent 用的，只有声明的插件没有 Agent。场景套组要不要带角色说明，由第 20 批第 2 项定；要带时，在白名单里加一个只收文字的键，不放开 `agent`。

**校验**：只有一个函数，即 SDK 的 `inspectContentPlugin(manifest)`。它在 `parsePluginManifest` 里调用，所以 CLI、Plugin Runtime、安装预览、Plugin Builder 用的是同一份。第 20 批加套组的键时，只改这份白名单和对应的检查函数。

**装配**：Plugin Runtime 把它当作「已声明、不启动」。安装、启用、停用、卸载、发布者撤销的状态与记录，和其他插件完全一样；但它不起进程、不开沙箱实例、不挂路由，也不进 MCP 工具表。装配检查只做一件事：声明的正文和资源都在、摘要相符，否则不启用，并写明原因。

**方法怎样登记**：今天方法跟着运行的定义登记（第 2 节）。只有声明的插件没有定义可起，所以改成：安装记录启用时，宿主从保存的已验证包里读出正文，登记进 Agent 定义登记；停用就撤下。这条路对所有插件都成立，不是给内容插件开的分支：别的插件的方法正文本来也随包发布。

**只有一种来路：签名的内容包**。新的包种类「内容包」：`payload.files` 正好是 `manifest.json`，加上声明里列出的正文与资源，不多不少；没有 `plugin.mjs`、`contract.json`、`interface.json`、`prompts.json`。安装服务按 `kind` 分派到沙箱包或内容包的解析，签名验证（`verifyPluginPackageSignature`）是同一个。包从哪里来，只影响签名是谁的：

| 包从哪里来 | 签名 | 信任 |
| --- | --- | --- |
| 随安装包带上（官方技能包如 BL-165，第 20 批的官方套组） | Molis Work 的官方发布者密钥；密钥和签包步骤并进第 26 批的签名问题 | 和第三方一样：首次照常预览、本人确认，安装包里不预先固定 Molis 发布者（统筹 2026-11-04 定） |
| 第三方文件 | 第三方发布者 | 固定的发布者是 `pinned` |
| 本机导入（第 6 节）；第 20 批的个人场景包与 AI 生成的方案同此 | 这个 Home 现有的发布身份（`apps/local-host/src/plugin-builder/publisher-identity.ts`，Plugin Builder 发布用的同一个），不另造钥匙 | 与 Plugin Builder 发布的插件同一档；首次照常预览、本人确认，不另开 `unsigned` 一档（统筹 2026-11-04 定） |

不走内置插件的 `registration`：那条路给的是 `HOST_BUILD_TRUST`，安装记录自动跟着构建升级，不经确认，也不能拒绝升级（第 2 节），与 ONB-53、ONB-55 冲突。

随安装包带上的包装上之前处在「随包带上、还没装」这个状态：不在 Skill 目录里，不登记方法，没有设置，只出现在挑选处和助理的推荐里（第 9 节）。它们要有一份只读清单，给挑选处和助理推荐读：`plugins.bundled.list@1`，只给本人，主人是插件安装服务。它只列包的身份、名称、说明与签名，不安装，也不登记方法。这是读，不是第二条安装路径：装仍然走 `plugins.install.preview`（第 5 节）。

**第 20 批加套组的键**：英文键名不用 `scene`（`action_scenes`、`scenes:use`、`services.scenes` 都已占用），名字由第 20 批第 2 项定，并在 GLOSSARY 登记。依赖沿用 `requires`（含 `optional`）；「挡第几步」「需要哪家服务的账号」由那一项加在场景声明里，采用时由平台按能力找提供方，不直接写插件 id。

## 4. 公共格式

### 4.1 包的形状

```text
my-skill-plugin/
├── manifest.json               # kind: "content"
└── skills/
    └── <skill_id>/
        ├── SKILL.md            # 正文
        ├── references/         # 按需读
        ├── scripts/            # 只在权限岛和沙箱里跑（SKP-09）
        └── assets/
```

正文与资源的路径都相对包根，不许 `..`、绝对路径或符号链接。`SKILL.md` 的 frontmatter 只给作者工具用：SDK 的 `skillDeclarationFromFrontmatter()` 把它转成声明，CLI `pack-content` 和导入都调它。宿主只读 Manifest，不读 frontmatter。

### 4.2 Skill 声明

`AgentSkillDeclaration` 加下列字段，并按「用在哪里」分两种要求：

| 字段 | 类型与上限 | `methods` 里（给别的 Agent） | `agent.skills` 里（插件自己的 Agent） |
| --- | --- | --- | --- |
| `skill_id`、`version`、`name`、`summary`、`tools` | 不变 | 必填 | 必填 |
| `description` | 什么时候触发，1～1024 字 | 必填 | 可选 |
| `when_to_use`、`when_not_to_use` | 各 ≤500 字 | 可选 | 可选 |
| `applies_to` | `"assistant" \| "coding" \| "both"` | 必填 | 不许写（只给自己的 Agent 用） |
| `user_invocable` | 布尔；不写表示可以点名 | 可选 | 不许写 |
| `argument_hint` | ≤80 字 | 可选 | 不许写 |
| `body` | 正文的包内路径，必须是 `skills/<skill_id>/SKILL.md` | 签名包必填；随系统带的由定义给正文 | 同左 |
| `resources` | `SkillResourceDeclaration[]`，见下 | 可选 | 可选 |
| `connector_categories` | 正文里用到的连接器类别占位符，如 `project-tracker`，取值见[助理统一接入服务](../assistant-service-connections/spec.md) | 可选 | 可选 |

`applies_to` 和 `description` 在 `methods` 里最终必填，分两步改，中间不让任何现有插件装不上（合同台评审 2026-11-04 查出）：

1. **C-1 把两个字段加进 `AgentSkillDeclaration`，先是可选。** 没有这两个字段之前，插件写进去过不了类型检查，所以合同必须先落。
2. **E 轨补上取值。** main 上已有三个内置插件声明了 `methods`：取值写在 `plugins/native/todo/src/roles.ts`（`todoSkills`）、`plugins/native/issues/src/skills.ts`、`plugins/native/pages/src/skills.ts`，各自的 `manifest.ts` 只是映射过去，经 `apps/local-host/src/plugin-instructions.ts` 的 `declaredMethods` 在运行时登记。这三处是 E 轨的文件，按轨道规则 7 由 E 轨落，叠在 C-1 后面。
3. **改成必填和 C-3 放在同一片**：C-3 把沙箱 app 包的 `{ name, purpose, body }` 改成完整的 Skill 声明，包自己带上这两个字段，宿主不再替它派生、也不替它编默认值。这样改成必填的那一刻，没有一个现有包会被拒。

（2026-11-04 更正，依据 09 核账 #1804，统筹裁定；分步依据合同台评审。）

**`tools` 在 Coding 里只当说明**（统筹 2026-11-04 定）：方法的 `tools` 取值只能在 `SKILL_TOOLS` 里，这是声明检查。Coding 开轮时不拿它和角色的 `host_tools` 比较，也**永远不能用它扩大 Coding 角色的 `host_tools`**。要有一条测试断言这一点：给 Coding 角色选一个声明了它没有的工具的方法，开轮后那个工具仍不可用。现在开轮时的比较（`horizontal/agent-host/src/index.ts` 的方法工具检查，`role_execution_exceeded`）对所有角色都生效；第 09 批的 9-5 把它对 Coding 角色改掉，别的执行方式由 9-5 一并核定。`tests/agent-host.test.ts` 里断言这条拒绝的用例，到时记成预期变化，由 SKC-13 接替。C-1 只定合同上的说法。

```ts
interface SkillResourceDeclaration {
  path: string;                 // skills/<skill_id>/{references,scripts,assets}/…
  role: "reference" | "script" | "asset";
  media_type: string;           // text/markdown、text/x-python、image/png …
  bytes: number;
  sha256: string;               // 包内文件的摘要，装配和读取时核对
}
```

**上限**沿用已有的数，不另起一套：

- 正文：≤500 行，且不超过 Prologue 的 `MAX_SKILL_BODY_CHARS`；
- 每个 Skill：≤300 个资源；
- 每个包：≤4000 个文件，总共 ≤64 MiB；
- 单个文件：≤8 MiB；
- 一个包最多 128 个 Skill。

后三项取自 `CHARACTER_IMPORT_LIMITS`。

读取的上限（C-2 定，`services/skills` 的常量）：

- 一次 `skills.body.read@1` 至多 20 个引用（`SKILL_BODY_READ_MAX_REFS`）。理由：一轮冻结的几个 Skill 要在一次请求、一份调用上下文里读（spec §10 第 9 项，N42～N44），第 09 批 9-5 的计数用例按一轮选 20 个写；20 份正文 × `MAX_SKILL_BODY_CHARS`（20,000）= 400,000 字，正好是宿主一次从主人读回文字的已有上限 `KNOWLEDGE_TEXT_MAX_CHARS`。多于 20 个就分几次读。
- 一次 `skills.resource.read@1` 读一个文件，整份返回，上限就是单个文件的 8 MiB（`SKILL_RESOURCE_READ_MAX_BYTES` = `SKILL_LIMITS.fileBytes`，与侧栏文件预览的 `FILE_CONTENT_MAX_BYTES` 同一个数），不分页。
- 目录项与安装预览的 `excerpt` 是正文前 200 个码点（`SKILL_EXCERPT_CHARS`）。

**校验**：`inspectSkillDeclarations` 扩成同时查以下各项，满足 SKP-08。坏包整包拒绝，不部分安装。每条拒绝原因都指到具体的 Skill 和文件：错误 `plugin.declaration_invalid` 带 `problems: Array<{ skill_id?: string; path?: string; reason: string }>`，例如 `{ skill_id: "meeting-notes", path: "skills/meeting-notes/SKILL.md", reason: "包里找不到" }`，界面照原样列出。

- 重复的 `skill_id`；
- 正文缺失或超长；
- 路径逃逸；
- 资源缺失或摘要不符；
- `applies_to` 非法；
- `tools` 越界：指取值不在 `SKILL_TOOLS` 里，不是指超出某个角色的 `host_tools`；
- `connector_categories` 不认识。类别表的常量由助理统一接入服务的主人给出；给出之前 C-1 只查格式。

### 4.3 版本

- 包用 SemVer，`version` 写在 Manifest 里；每个 Skill 有自己的整数 `version`。
- 升级时按 `skill_id` 对比：正文或任一资源的摘要变了，而 `version` 没有增加，就拒绝。`version` 只许增加。
- 精确引用是 `SkillRef`。它在 `SignedAgentReference` 的基础上加 `version`，再配 `SignedAgentInstallation`（安装、世代、项目）：

```ts
interface SkillRef {
  source: { kind: "plugin"; plugin_id: string; plugin_version: string; publisher_signature: string };
  skill_id: string;
  version: number;
  install_id: string;
  installation_generation: string;
}
```

`SignedAgentReference` 的 `kind: "method"` 改成用 `SkillRef`；角色资料仍用 `kind: "role"`。官方包、第三方包、本机导入的包都是签名包，都有 `publisher_signature`；随宿主构建、带 Manifest `methods` 的内置插件也有构建的签名身份。所以引用的写法只有一种。

这一步不在 C-1、C-2 里改（第 08 批主会话 2026-11-07 定）：`kind: "method"` 的消费方都在助理一侧，即 `assistant-rule-actions.ts` 的 `assistant.methods.read` 输入、`assistant-send-materials.ts` 的材料校验、`agent-definitions.ts` 的 `methods()` 与 `signedMaterial()`，以及 `prompt_uses.source_ref` 里存着的引用。它跟第 09 批 9-2「助理改读目录」一起改，同一个 PR 改完所有读它的地方。C-2 的 Skill 目录动作只用 `SkillRef`，不碰 `SignedAgentReference`。

## 5. 安装与升级

只走 `plugins.install.preview` 和 `plugins.install.confirm`，没有只给技能包的入口。

**预览**输出加 `skills`，每项给 E 轨定样要用的字段：

```ts
interface SkillInstallPreview {
  skill_id: string; version: number; name: string; description: string;
  when_to_use?: string; when_not_to_use?: string;
  applies_to: "assistant" | "coding" | "both";
  user_invocable: boolean; argument_hint?: string;
  tools: string[];                          // 声明，不授予
  resources: Array<{ path: string; role: "reference" | "script" | "asset"; bytes: number }>;
  runs_scripts: boolean;                    // 有 role=script 的资源；界面单独标「会执行」
  connector_categories: string[];
  excerpt: string;                          // 正文前 200 个码点
  change?: "added" | "body_changed" | "resources_changed" | "removed";  // 只在升级时给；removed 的项照旧给 name、applies_to（取已装版本的）
  state: "off" | "auto" | "manual";        // 这一项在本范围现在的状态：新装与新增的是 off，升级时沿用（界面只对 manual 标「仅手动会保留」）
}
```

确认后的「在这个项目里用哪些」一步（E 轨定样，用户 2026-11-04 定）读的就是这里的 `state`，之后每项一次 `skills.settings.set@1`；「以后再说」不调任何动作。

预览还另外给：

- `requires`：每项依赖的 `capability_id@version`、是否必要、现在满不满足，以及不满足时影响哪一步；
- `scope`：装进项目，还是装给个人空间（取自 `runtime`）。

`agent_bodies` 只留角色资料。方法都改成在 `skills` 里列，app 包派生出来的方法也一样，所以「方法」只有一种列法。这一步按 N35 原地改形状，刷新动作快照。

**确认**：`plugins.install.confirm` 不变，不带启用参数：装上不等于启用。启用只走 `skills.settings.set@1`（第 7 节）。E 轨 2026-11-04 定的做法是：装完在同一处接着显示「启用到本项目」这一步，或在确认里放默认全关的开关，确认后由界面再调一次 `set`。哪种由用户在定样时选，两种都不用把启用并进安装动作。

**升级差异**：现在只比角色和方法的正文（第 2 节）。改成按 Skill 比：正文、资源摘要与 `version`，见 4.3。场景声明的整份差异（ONB-55）由第 20 批第 2 项接在同一个预览上。

**升级**：装更高版本的包，同一个发布者，`compatible_from_versions` 要包含当前版本，和其他签名包一样。升级不改启用状态。正在跑的轮次固定原版本，不改绑。被移除的 Skill，其设置随之删除；新增的 Skill 是「没启用」。

## 6. 外部 Skills 导入

导入的结果是一个「只有声明的插件」，由这个 Home 现有的发布身份签名（与 Plugin Builder 同一个），再走第 5 节同一个安装确认。导入不另设目录、不另设状态，也不另设执行路径。

**来源**：

- 本机 Agent 的 Skills 目录：Claude Code、Codex 等，即 `CHARACTER_IMPORT_RUNTIMES` 的五种，复用 Character 导入的扫描（`apps/local-host/src/character-import-scan.ts`）；
- 项目授权目录里的 Skills：取代 Coding 的 `agent.skills.discover.v1` 和 `agent.skills.install.v1`（第 8 节）。

**动作**（只给本人，`audiences: user`，没有 MCP 工具）：

| 动作 | 输入 | 输出 |
| --- | --- | --- |
| `skills.import.preview@1` | `{ source: { kind: "runtime"; runtime_id } \| { kind: "project_directory"; directory_id } }` | `preview_id`；拟定的包身份（`plugin_id` 由来源种类和来源根目录确定地算出，同一来源再导入就是升级）；候选 Skill 列表，每项给 `name`、`description`、`file_count`、`bytes`、`compatibility`（`portable` 或 `native-only` 加 `reason`）、`runs_scripts`、`change`（`new`，或同名已装时 `upgrade`：会升级成新版本） |
| `skills.import.confirm@1` | `{ preview_id; skill_ids: string[]; scope: "project" \| "home" }`，同样不带启用参数 | 与 `plugins.install.confirm` 相同 |

**规则**：

- 导入的是确认那一刻的固定拷贝，原目录之后的变化不影响已装的包。「重新导入」就是再走一次预览，按 4.3 自动加版本并列出差异；用户在宿主里改过的设置不被覆盖。
- `native-only` 的 Skill 可以导入，但在内置引擎里显示「不可用」并写原因；只有本地 Agent 能用它。
- 来源读取遵守 Character 导入已有的路径和大小限制，不读来源目录之外的文件。
- 预览只给本人的界面；导入的动作不交给 Agent、工作流或插件。

**和 Character 的关系**：G2 要的是「导入一次，助理和 Coding 都能用」。Character 快照里的 `skills` 是否改成引用目录里的 `SkillRef`、不再整段内嵌，是 Characters 主人的合同改动，不在本批做。统筹 2026-11-04 定改，待办记为 BL-957（第 13 节）。

## 7. 启用与仅手动

**状态**：一个 Skill 在一个范围（某个项目，或个人空间）里有三种状态。

| 状态 | 意思 | 能不能被 AI 自己选 | 用户点名能不能用 |
| --- | --- | --- | --- |
| `off`（没启用，默认） | 装上、导入、看过都停在这里 | 不能 | 不能，提示先启用 |
| `auto` | 启用后的默认 | 能：已启用、适用、具备必要能力与权限才进候选 | 能，点名优先 |
| `manual` | 仅手动 | 不能，已知精确引用也绕不过 | 能，沿原权限 |

只按范围记，不按「人＋范围」记（E 轨 2026-11-04 同意）：一个 Home 只有一个人，「只有本人能改」由调用上下文的操作者保证。以后有多人时，按 `docs/system/CONTRACT-CHANGES.md` 再把操作者加进主键。

**主人**：宿主的 Agent 定义登记，即 `apps/local-host/src/agent-definitions/` 的 Home 库 `agent-definitions`。新增一张表，由这个包独占读写：

```sql
CREATE TABLE skill_settings (
  scope_ref TEXT NOT NULL,          -- 项目 id，或 "home"
  install_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  state TEXT NOT NULL,              -- 'auto' | 'manual'；没有行就是 off
  enabled_at TEXT NOT NULL,         -- 从 off 变成启用的时间；auto 与 manual 之间切换不改
  enabled_by TEXT NOT NULL,         -- 启用时的操作者
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  PRIMARY KEY (scope_ref, install_id, skill_id)
);
```

**动作**：`skills.settings.set@1`，只给本人。输入 `{ scope, install_id, skill_id, state: "off" | "auto" | "manual", expected_revision }`，冲突时拒绝；改成 `off` 就删行。项目、操作者从上下文来。不可用原因是 `plugin_disabled`、`publisher_revoked`、`resource_invalid` 时拒绝改状态（界面三档变灰）；`requires_unmet`、`connection_missing`、`native_only` 时照常可改。

**保留规则（SKP-10）**：

- 插件停用再启用、升级：不动行。
- 卸载：删掉这个安装的行。再装就重新从 `off` 开始，因为卸载就是「不再用」。
- 发布者被撤销：行留着，Skill 不可用；之后只能卸载。

**「本轮由用户点名」怎么认**：一轮开始时，宿主把用户这一轮点名的 Skill（`/`、选择器、前门）冻结进这一轮的选择，形状是 `SkillRef` 的列表。`manual` 的 Skill 只在这份冻结名单里才能读，模型的输入写什么都不算。读取动作只看调用上下文里的这份名单（第 8 节）。

## 8. Skill 目录

不新建注册表。宿主的 Agent 定义登记就是 Skill 目录：各插件 Manifest 的 `methods`，与随系统带的定义里的方法，进的是同一份。新增一个系统提供方 `system.skills`，下面四个动作都由它提供：

| 动作 | 谁能调 | 做什么 |
| --- | --- | --- |
| `skills.catalog.list@1` | user、plugin、agent | 列这个范围里的 Skill。输入可选 `{ applies_to?: "assistant" \| "coding"; states?: ("off" \| "auto" \| "manual")[] }`，范围从上下文来。agent 与 plugin 只拿到 `auto` 和 `manual`，看不到 `off` |
| `skills.body.read@1` | user、plugin、agent | 按 `SkillRef` 读正文，一次收一组引用 `{ refs: SkillRef[] }`（1～20 个，见 4.2），一次请求一份上下文：一轮开头冻结的几个 Skill 一起读，不逐个重核、逐个开库（spec §10 第 9 项，N42～N44）。每一项都核对：安装、世代、版本仍是当前的；状态允许（`manual` 要在本轮冻结名单里）；`applies_to` 与调用方相符。按给的顺序逐项回答 `{ ref, ok: true, name, body }` 或 `{ ref, ok: false, reason, detail? }`，一项读不了不连累别的项；被拒时说明原因（`SkillReadRefusal`），不悄悄换成别的版本 |
| `skills.resource.read@1` | user、plugin、agent | 按 `SkillRef` 和声明里的 `path` 读一个资源，核对 `sha256`。只收声明过的路径，大小有上限，二进制资源给 base64 |
| `skills.settings.set@1` | user | 第 7 节 |

**目录项**（`SkillCatalogEntry`，E 轨的管理页和助理、Coding 读同一份）：

```ts
interface SkillCatalogEntry {
  ref: SkillRef;
  name: string; description: string; when_to_use?: string; when_not_to_use?: string;
  applies_to: "assistant" | "coding" | "both";
  user_invocable: boolean; argument_hint?: string; tools: string[];
  resources: Array<{ path: string; role: "reference" | "script" | "asset"; bytes: number }>;
  connector_categories: string[];
  runs_scripts: boolean;                  // 有 role=script 的资源
  excerpt: string;                        // 正文前 200 个码点，省得详情页为开头再读一次正文
  pack: { plugin_id: string; title: string; version: string; publisher_label: string; trust: "host" | "pinned" | "home_local"; scope: "project" | "home" };
  state: "off" | "auto" | "manual"; settings_revision: number;
  enabled?: { at: string; by: string; scope: "project" | "home" };   // 只在启用时给，供界面回显启用的范围
  availability: { available: true } | { available: false; reason: SkillUnavailableReason; detail?: string };
  last_used?: { at: string; caller: "assistant" | "coding" | "agent"; run_ref?: string };
}
```

**不可用的原因码**（`SkillUnavailableReason`）。每个码对应一件用户能做的事，界面按码给入口：

| 码 | 意思 | 界面给的事 |
| --- | --- | --- |
| `plugin_disabled` | 包所在的插件停用了 | 去启用插件 |
| `publisher_revoked` | 发布者已撤销 | 只能卸载 |
| `resource_invalid` | 正文或资源缺失、摘要不符 | 重新安装或重新导入 |
| `requires_unmet` | 必要依赖不满足（`detail` 写哪一项） | 去添加那个插件 |
| `connection_missing` | 正文用到的连接器类别在本范围没有连接（`detail` 写类别） | 去连接 |
| `native_only` | 只有本地 Agent 能用，内置引擎用不了 | 换本地 Agent，或不用 |
| `not_applicable` | `applies_to` 不含当前调用方（只在 user 看全部时出现） | 无 |

`off` 不算不可用，它是状态，界面按状态给「启用」。

**C-2 定下的**（`packages/contracts/src/services/skills.ts`，只声明，提供方由 08-7、08-8 登记；稿子没写死的在这里定）：

- **读不了的原因**（`SkillReadRefusal`）：上表的七个码，加 `not_current`（引用的安装、世代、包版本、签名或 Skill 版本已不是当前的，卸载、升级、重装都是它）、`off`（本范围没启用）、`not_named`（`manual`，且不在本轮冻结名单里）。`skills.body.read@1` 逐项回答这些原因；`skills.resource.read@1` 只读一项，读不了就抛 `skills.read_refused`，`details.reason` 是同一组词。
- **范围**：六个动作的 `scope` 都是 `home`，调用上下文带项目就是那个项目（连同装给个人空间的），不带就是个人空间。项目 id、操作者、调用方的安装都不进输入；输入 schema 一律 `additionalProperties: false`，夹带 `project_id`、`actor_id` 就被拒。`skills.settings.set@1` 与 `skills.import.confirm@1` 里的 `scope` 是第 6、7 节已有的二选一 `"project" | "home"`：`project` 指上下文里的项目，不能借它点名别的项目；上下文没有项目时由实现拒绝。
- **权限**：读目录、正文、资源要 `skills:read`；改状态、导入要 `skills:manage`。宿主在 `local-owner-permissions.ts` 给本人这两项，随 08-7 接。导入的确认和 `plugins.install.confirm` 一样只认受保护入口的本人操作（`user_action`），随 08-8 接。
- **`skills.settings.set@1` 的输出**是改完的那一项 `SkillCatalogEntry`，界面拿它就地刷新；`settings_revision` 在 `off`（没有行）时是 0。
- **错误码**（`skillErrors`，主人 `skills`，只给这个新文件在 `tooling/gates/error-owners.json` 加了一条）：`not_found`、`read_refused`、`resource_undeclared`、`settings_conflict`、`settings_locked`（`details.reason` 是 `plugin_disabled`、`publisher_revoked`、`resource_invalid` 之一）、`scope_mismatch`（对装进项目的 Skill 写 `home`）、`import_source_unavailable`、`import_preview_unknown`、`import_skill_unknown`。
- **导入的预览输出**：`{ preview_id, package: { plugin_id, version, installed_version }, candidates }`，候选的 `compatibility` 沿用 Character 导入的 `"portable" | "native-only"` 加 `reason`；候选数上限取 `CHARACTER_IMPORT_LIMITS.skills`（200），一次确认至多 `SKILL_LIMITS.skillsPerPackage`（128）个。
- **都不等模型**，不声明 `scheduling: "concurrent"`。

**渐进披露（SKP-05）**：目录项只带元数据。正文由 `skills.body.read` 按需读，资源由 `skills.resource.read` 按正文的指引读，不会整包进上下文。

**用量**：Skill 的正文交给一轮、并拿到接受回执后，宿主在 `agent-definitions` 库里记一行，写法照 `prompt_uses`，表名 `skill_uses`。被拒或取消的轮次不记。历史行保留当时的 `SkillRef` 和名称，卸载后仍可读（SKP-07）。

**消费方怎么改**（实现时做，这里先写明去向）：

- **个人助理**：`methods()` 改成从目录取：已安装、在本范围启用，且 `applies_to` 含 `assistant`（修 G1）。读正文改走 `skills.body.read@1`。`assistant.methods.read@2` 只留角色资料，它改不改名由 A 轨定。
- **Coding**：取 `applies_to` 含 `coding` 的项，起跑时把精确的 `SkillRef` 冻结进 `agent.skills`。原来那条路删掉：`agent.skills.discover.v1`、`agent.skills.install.v1`，以及 Prologue 存储里 `molis-coding-method` 这种类型；SSOT 里「装进项目的 Skill」一行同时删。Coding 自己 Agent 的 `agent.skills`（`codingSkills`）不变，仍是插件自己的。
- **其他 Agent**：同样按目录与冻结名单读。

## 9. 停用、卸载与可见性

| 安装状态 | 目录里 | 新的一轮 | 正在跑的一轮 | 设置 | 用量历史 |
| --- | --- | --- | --- | --- | --- |
| 随包带上、还没装 | 不列；只在 `plugins.bundled.list@1`、挑选处与助理推荐里出现 | 不用 | — | 无 | 无 |
| 装上未启用（`off`） | user 看得到，标「没启用」 | 不用 | — | 无行 | 留 |
| 启用（`auto`、`manual`） | 看得到 | 按状态用 | 按冻结的用 | 有行 | 留 |
| 插件停用 | user 看得到，`plugin_disabled` | 不用 | 下一次读正文或资源时被拒 | 留 | 留 |
| 发布者撤销 | user 看得到，`publisher_revoked` | 不用 | 下一次读被拒 | 留 | 留 |
| 卸载 | 不再列 | 不用 | 下一次读被拒 | 删 | 留 |

卸载只删插件内容和它的设置，不删业务数据。技能包本来也写不了业务数据（SKP-12）。

## 10. 呈现（请 D 轨看）

界面由 E 轨定样（用户 2026-11-04 定：A 的启用步骤加 C 的目录；原型在 `docs/design/skill-packs/`，分支 `claude/e-track-08-skill-pack-design`）。这里只列合同给什么、按组件板对应哪个控件，供 D 轨核对：

| 位置 | 合同给的 | 组件板控件 |
| --- | --- | --- |
| 安装与导入的确认 | 只看不选：`scope`、包版本、签名者；每项 `SkillInstallPreview`（升级时 `change`、`state`）；坏包时逐条 `problems` | `mw-item` 加展开；「会执行」「仅手动会保留」用 `mw-badge` |
| 确认后的启用步骤 | 每项 `state`，三档默认关；每项一次 `skills.settings.set@1`；「以后再说」不调动作 | 现有分段选择 |
| 目录左边的列表行 | `name`、`pack.title`、`state`、`availability` | `mw-item`；状态用 `renderStatusMark` |
| 目录右边的详情 | `description`、`when_to_use`、`when_not_to_use`、`applies_to`、`tools`、`resources`、`runs_scripts`、`connector_categories`、`last_used`、`pack`（版本、`publisher_label`、`trust`、`scope`）、`excerpt` | `renderPreviewCard`；窄屏用 `renderSheet` |
| 目录筛选 | 在用＝`state ≠ off` 且可用；没启用＝`off` 且可用；用不了＝不可用 | 由界面按目录项算，合同不另加字段 |
| 不可用 | 第 8 节的原因码；`plugin_disabled` 时显示「设置保留为」当前 `state` | 文案在原型 README 的表里 |
| 导入的候选 | 第 6 节的候选列表 | 同安装确认；`native-only` 写原因 |

状态不用 `mw-tag`：那是带关闭按钮、可以移除的标签片（D 轨共审 2026-11-04）。

`mw-item` 现在只在组件板里有，技能包管理页是它在产品里的第一处用法：实现时把它搬进页面样式表，这一步由 D 轨审。除此之外没有要「组件板新增」的；E 轨定样若还要新的控件，按 #1772 标出，由 D 轨补标本。

## 11. 存量数据

`skill_settings` 和 `skill_uses` 是 `agent-definitions` 库的新表。分界与 05② 相同，看 **02③ 真实 Home 重建**：

- **重建之前落**：直接改第 1 版的建表，不写迁移。
- **重建之后落**：走 U1 的升级链，写一步升级。这算「新增迁移逻辑」，是红线，开 PR 之前由统筹先问用户。

删 Prologue 存储里的 `molis-coding-method`，在重建之后也一样，不留读取兜底。重建之后如果真实 Home 里已经有这种数据，按同一条红线处理。

不加读取兼容。开 PR 时先核 02③ 做完没有。

## 12. PR 怎么拆

按轨道规则 1：合同单独先开小 PR，服务接着，消费者最后。

| 片 | 内容 | 前置 |
| --- | --- | --- |
| C-1 声明合同 | contracts：`PluginKind` 的 `"content"`、`AgentSkillDeclaration` 的新字段、`SkillResourceDeclaration`、`SkillRef`、内容包的文件常量。SDK：`inspectContentPlugin`、扩展后的 `inspectSkillDeclarations`、`skillDeclarationFromFrontmatter`、内容包的解析。GLOSSARY 加一行；刷新 api 快照。新字段先是可选；E 轨随后补上 Todo、Issues、Pages 的取值，改成必填随 C-3 一起做（第 4.2 节）。给第 09 批 9-1 留位：委派协议的「本轮技能」用 `SkillRef` | 02 交接；#1762 合入 |
| C-2 目录、设置与导入的动作合同 | `services/skills.ts`：第 6、7、8 节的六个动作声明、`SkillCatalogEntry` 与 `SkillUnavailableReason`、`SkillInstallPreview` 与导入候选的类型；`skills.body.read@1` 收引用数组（第 8 节）。**挪出本片**（2026-11-07）：`plugins.install.preview` 的输出形状（`skills`、`requires`、`scope`，`agent_bodies` 只留角色）与 `plugins.bundled.list@1` 挪到 08-6（Runtime 与安装）。原因：预览动作的声明和 `additionalProperties: false` 的输出 schema 都写在宿主的 `apps/local-host/src/plugin-install-actions.ts`，产出是 `plugin-install-service.ts` 的 `preview`；改形状就得同时改宿主产出和 `host-actions.tsv`，而且沙箱包的方法在 C-3 之前给不出 `description`、`applies_to`。`plugins.bundled.list@1` 与它同属宿主的 `pluginInstallActions`，主人是插件安装服务，单独搬进 contracts 会让同一组动作分在两处。本片只写 `SkillInstallPreview` 类型，不改宿主、不动动作快照 | C-1；E 轨定样定下 |
| C-3 方法写法合一（统筹 2026-11-04 定：做） | 沙箱 app 包的 `{ name, purpose, body }` 改成完整的 Skill 声明；`applies_to`、`description` 在同一片改成必填；跑 `pnpm studio:replay`；已有数据按第 11 节同一条 02③ 分界 | C-1；E 轨补好三个内置插件的取值 |
| 实现 | Plugin Runtime 的「已声明、不启动」装配；随安装包带上的官方包与 `plugins.bundled.list@1`；宿主的目录、设置和用量；导入服务与 CLI `pack-content`；助理与 Coding 两个消费方，以及删掉 Coding 的旧路；BL-165 设计与无障碍内容包 | C-1、C-2 合入；E 轨定样 |

## 13. 统筹裁定（2026-11-04，见 #1794 上的统筹评论）

1. **官方技能包和官方套组怎么交**：不走内置 `registration`，做成随安装包带上的签名「只有声明的插件」，走同一条预览、确认安装的路，并有「随包带上、还没装」这个状态（第 3、9 节）。安装包里不预先固定 Molis 发布者，首次照常预览、本人确认。发布者密钥和签包步骤并进第 26 批的签名问题。与 #1793 第 20 批第 2 项的裁定一致。
2. **信任档**：外部 Skills 导入、个人场景包、AI 生成的方案，都用这个 Home 现有的发布身份签名，与 Plugin Builder 同一档；首次照常预览、本人确认，不另造钥匙，也不另开 `unsigned` 一档。
3. **沙箱 app 包的三键方法写法**：并进完整的 Skill 声明，单开 C-3，跑 `pnpm studio:replay`，按 02③ 的分界处理已有数据。
4. **Character 快照里的 Skills**：改成引用目录里的 `SkillRef`。这是 Characters 的合同，记为 BL-957，不在本批做。

另两项已和 E 轨对齐（2026-11-04）：安装与导入的确认都不带启用参数，启用只走 `skills.settings.set@1`；启用状态只按范围记。

## 14. 验收编号（候选）

实现时，测试名或注释写出这些编号。

| 编号 | 要达到的结果 | 对应 |
| --- | --- | --- |
| SKC-01 | 写 `kind: "content"` 的 Manifest，只收第 3 节白名单里的键；出现别的键时安装被拒，报 `plugin.declaration_invalid` 并点名那个键；内置、生成、导入、第三方走同一个 `inspectContentPlugin` | SKP-01、SKP-08、ONB-53 |
| SKC-02 | 只有声明的插件能装、能启用、能停用、能卸载，不起进程、不挂路由、不进 MCP 工具表；正文或资源的摘要不符时不启用，并写明原因 | SKP-01、PLP-01 |
| SKC-03 | 坏包整包被拒，不部分安装：正文缺失、重复 id、路径逃逸、超长、资源缺失、`applies_to` 非法、`tools` 不在 `SKILL_TOOLS` 里 | SKP-08 |
| SKC-04 | 升级时正文或资源变了而 Skill 的 `version` 没有增加，就被拒；预览按 Skill 标出新增、正文变了、资源变了、移除 | SKP-07 |
| SKC-05 | 装上、导入、打开看都是 `off`，安装与导入的确认都不启用任何一项；启用后默认 `auto`，目录回显启用的时间、操作者和范围；`manual` 在停用再启用、升级之后不变；卸载后再装从 `off` 开始 | SKP-10 |
| SKC-06 | `manual` 的 Skill 只在本轮冻结的点名名单里能读，模型在输入里写精确引用也读不到 | SKP-10 |
| SKC-07 | 助理与 Coding 从同一个 `skills.catalog.list@1` 拿到同一份 `SkillRef` 和正文；只有内容的插件，助理也看得见 | SKP-02、SKP-04、G1 |
| SKC-08 | `skills.body.read@1` 在插件停用、发布者撤销、卸载、世代变化后被拒，不换成别的版本；正在跑的一轮在下一次读时停住 | SKP-06、SKP-07 |
| SKC-09 | 资源只能按声明的路径读，摘要不符时被拒；目录项不带正文 | SKP-05 |
| SKC-10 | 从一个真实的本机 Skills 目录导入，得到一个本机签名的只有声明的插件，走同一个安装确认；原目录之后的改动不影响已装的版本；再导入一次就是升级 | G2、SKP-04 |
| SKC-11 | 代码里没有只给技能包用的注册表或安装入口；Coding 的 `agent.skills.discover.v1`、`agent.skills.install.v1` 与 `molis-coding-method` 已删 | SKP-04 |
| SKC-12 | 被拒或取消的轮次不记 `skill_uses`；卸载以后用量历史仍可读，保留当时的名称和版本 | SKP-07 |
| SKC-13 | 方法的 `tools` 不扩大 Coding 角色的 `host_tools`：选一个声明了角色没有的工具的方法，开轮后那个工具仍不可用 | SKP-06；统筹 2026-11-04 |
