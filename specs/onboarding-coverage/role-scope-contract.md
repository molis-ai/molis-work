# 第 36 批提前交付的角色层次公开合同

状态：设计待评审（2026-11-08）。目标是第 20 批能经公开合同消费角色层次和采用回读类型。提前片交付 TypeScript 类型、闭合 schema 及定向验证，角色服务和界面的可用性由第 36 批后续验收。

本片依据 [Onboarding §3.9、§3.11、§3.12 和 §10](spec.md#10-决策记录)、[角色作用范围原型](../../docs/design/role-scope/README.md)及[第 36 批第 1 项](../post-anticorruption-roadmap/reference/batches/36.md#batch-36-item-1)。用户已选方案 C。第 20 批 P-2b 依赖本片的项目成员、版本、来源和回读形状。P-2a 模板内容、P-3b 场景包静态校验可独立进行。第 36 批后续角色服务的第 13 批前置照原安排，主线事项照自己的前置推进。

## 1. 角色、成员和固定版本

从现有 `@molis-ai/molis-work-contracts/modules/characters` 导出。Characters 拥有个人原件、项目成员、角色默认及固定版本。`CharacterDraft` 仍是个人可编辑稿，其 `revision` 用来比较草稿编辑。`CharacterContent` 仍是已发布成果的正文。现行项目发布有真实 `ArtifactReference`，由成果库持有，发布记录包含项目、操作者和版本。个人工作可只有 Characters 的固定版本引用。现行 `AgentFrozenCharacter` 仍消费项目发布物。第 36 批服务阶段再接角色解析与执行冻结，继续使用同一个 Prologue 运行时。

```ts
type PersonalCharacterRef = { kind: "personal"; character_id: string };
type ProjectCharacterMemberRef = { kind: "project"; member_id: string };
type PersonalCharacterVersionRef = PersonalCharacterRef & { version: number };
type ProjectCharacterVersionRef = ProjectCharacterMemberRef & {
  member_version: number;
  original: PersonalCharacterVersionRef;
};
type CharacterRoleVersionRef = PersonalCharacterVersionRef | ProjectCharacterVersionRef;

type CharacterRoleSection = "work_style" | "capabilities";
type CharacterSectionStatus =
  | { mode: "follow" }
  | { mode: "override"; based_on_original_version: number; original_changed: boolean };

type CharacterRole =
  | { layer: "personal"; state: "active" | "disabled"; draft_revision: number;
      current: PersonalCharacterVersionRef; origin: BlueprintPartOrigin | null }
  | { layer: "project"; state: "active" | "disabled"; revision: string;
      current: ProjectCharacterVersionRef; origin: BlueprintPartOrigin | null;
      sections: { work_style: CharacterSectionStatus; capabilities: CharacterSectionStatus } };
```

- `character_id` 沿现有个人身份，`member_id` 标识当前项目的成员绑定。同名无身份意义。本人、项目和执行权限从可信调用上下文取。项目成员读、写和按版本读都在该项目内查归属。成员跟随的原件由 Characters 确认，持有引用本身没有跨项目读取权。已解除的成员和已删除的原件在当前角色读回中为缺失。
- 原件确认保存时得到不可变的 `version`。新成员两节都跟随。项目保存只覆盖本次编辑的节，其他节取最新已保存的原件，别的项目和原件不受影响。项目本地保存得到不可变的 `member_version`。任务固定当时的成员版本及原件版本。两者足以重建当时的内容，原件发布后无需逐项目补写成员。成员的 `revision` 是针对成员配置及采用复用保护的写入凭据，原件单独更新只改变读到的 `current.original`，不会改掉场景采用存下的成员 revision。
- 「做事方式」复用 `instructions`。「能用什么」复用 `host_tools` 和 `action_tools`，保留原合同中 `null`、省略、空列表各自的意义。节的 `follow` 由节状态表达。标题沿个人原件。角色和模板只能收窄本次授权，任务启动和后续实际调用仍查现行许可。材料和输出说明、解析后的 Skill 引用由 P-2b 与后续角色服务接内容字段。材料说明没有授权效力，Skill 解析走现有 `SkillRef`，`works_with` 的场景部分 id 由第 44 批解析成实际成员。
- `based_on_original_version` 指覆盖所依据的原件版本。`original_changed` 只在原件的对应节变化时提示。「保持本项目的」确认此次差异，下次这节再变才重新提示。项目覆盖和原件各自保留可读的固定版本，允许看差异。具体比较和确认记录由后续服务实现。

## 2. 默认、一次选择和恢复

```ts
type CharacterDefaultSelection =
  | { layer: "personal"; selection: PersonalCharacterRef | null }
  | { layer: "project"; selection: ProjectCharacterMemberRef | { kind: "assistant" } | null };
type CharacterTaskSelection = PersonalCharacterRef | ProjectCharacterMemberRef | { kind: "assistant" };
type EffectiveCharacterSelection =
  | { kind: "role"; source: "task"; version: CharacterRoleVersionRef }
  | { kind: "role"; source: "project"; version: ProjectCharacterVersionRef }
  | { kind: "role"; source: "personal"; version: PersonalCharacterVersionRef }
  | { kind: "assistant"; source: "task" | "project" }
  | { kind: "assistant"; source: "assistant"; stopped_project_default?: ProjectCharacterMemberRef };
```

本次未另选时按「项目默认 → 个人默认 → 助理自己」取值。个人工作从个人层开始。项目的 `null` 表示沿用，显式选助理时保留项目来源。个人默认只引用个人原件。默认保存稳定引用，任务开始才解析并固定一个版本。任务改选只管本次，只有本人明确保存才扩大范围。

用户于 2026-11-08 确认，项目默认的角色被停用时，新任务直接由助理自己做，跳过个人默认。保留原项目默认配置，结果为 `kind: "assistant"`、`source: "assistant"`，带 `stopped_project_default` 以提示是哪一个项目默认停用，供人换选或重新启用。任务显式另选仍优先。运行中的任务继续用固定版本。实际能力被撤后当前轮停在原处，另选从后续轮开始，已做记录保留。

| 恢复路径 | 后续 owner 的输入和行为 |
| --- | --- |
| 恢复跟随／保持本项目的 | 指定 `member_id`、一节、所见 `revision` 和 `current.original.version`。前者清掉该节覆盖并保存新的项目版本，旧覆盖仍可从历史读。后者只确认当前差异。另一节、个人原件、任务的固定版本保持原有取值。 |
| 恢复某个历史版本 | 指定同一角色的固定版本引用。原件按所见 `draft_revision`、项目按所见成员 `revision` 与原件版本核对。把用户看到的历史内容保存成选定作用域的新版本。若历史上跟随的节如今从原件取不到当时内容，在项目内覆盖该节以还原内容。冲突先回读当前值并给出差异，用户决定后再提交。已有任务不换版。 |
| 场景撤销／移除 | 按 Characters 回读的成员身份、采用来源和成员 `revision` 判断。只有这次采用新建、仍由它独占且未被随后编辑的成员可解除。共享或复用的成员以及个人原件保留。 |

[选择器与项目设置原型](../../docs/design/role-scope/app.js)原先显示退到个人默认。按上述决定校正这一个停用状态的取值、来源、提示和影响说明。

## 3. 模板采用与主人回读

第 20 批的 `BlueprintSource` 是场景包的来源事实，归 Blueprints。它与 `BlueprintPartOrigin` 定义在 contracts 内部纯叶文件 `src/platform/blueprint-source.ts`，无角色、场景包正文或服务依赖。现有 Characters 入口为角色采用回读转出，后续 `platform/blueprints` 复用同一份类型和 schema。只在模板采用关联里用这份来源，角色自己新建时 `origin` 为 `null`。

```ts
type BlueprintSource =
  | { kind: "package"; plugin_id: string; version: string }
  | { kind: "draft"; draft_id: string; revision: number };
type BlueprintPartOrigin = { source: BlueprintSource; part_id: string };

type CharacterTemplateAdoptionResult = {
  outcome: "created" | "reused";
  origin: BlueprintPartOrigin;
  role: CharacterRole;
};
type CharacterRoleReadInput =
  | { by: "role"; role: PersonalCharacterRef | ProjectCharacterMemberRef }
  | { by: "request"; layer: "personal" | "project"; request_id: string };
type CharacterRoleReadResult =
  | { kind: "missing" }
  | { kind: "role"; role: CharacterRole }
  | { kind: "receipt"; receipt: CharacterTemplateAdoptionResult; current: CharacterRole | null };
```

采用的输入由 20 P-2b 组合既有 `RoleTemplate`、`origin`、`request_id` 与显式层和预览决定。本人选择新建，项目分支按模板建个人原件并确认首个版本，再建两节跟随的项目成员，返回项目分支。预览应列出会新建原件，默认选择不随采用写入。个人分支只返回新建原件。复用须指向预览已确认的同层稳定引用，角色自身的 `origin` 和内容保持原样，结果的 `origin` 只表明本次请求。项目成员的首次复用与本次回执在 Characters 同一提交中更新成员 `revision`，不改变 `member_version` 或正文；同请求重放返回原回执，不再次更新 revision。该变更使之前创建者记录的解除凭据失效，即使复用方后来移除也不恢复旧 revision。复用方的 `outcome: "reused"` 不授予解除权。解除和复用都在同一成员 owner 内按实际存在状态及所见 revision 比较提交：解除先成功时，针对已解除身份的复用失败；复用先成功时，旧 revision 的解除失败。因此保护不依赖跨 owner 的先查后写，也不让 Characters 与 Blueprints 各存一份共享计数。标题按采用时语言落为用户自己的文字。来源由验证过的内容包或已读到的草稿给出，进入角色结果的字段只有来源和稳定 `part_id`。Characters 仍核对授权及项目，来源不携带安装凭据或操作者身份。

主人未来以本人和所选层的作用域约束 `<adoption_id>:<part_id>`。项目分支还使用可信项目。角色和回执在同一提交内生效，同键同请求重放原结果，同键异内容冲突。撤权或取消时经 `beforeEffect()` 拒绝写入。场景服务已知身份时按角色读。写成功而返回丢失时按请求读回执和当前角色，回执与已解除角色可同时表达。读失败按待核对处理，不能视作缺失后补写。当前角色用于升级差异和撤销判断，原回执用于确认先前提交。

第 20 批交接时校正原表的回读引用。[现行声明](../../modules/characters/src/actions.ts#L68)和 [Host 动作快照](../../tooling/gates/actions/host-actions.tsv#L130)均为 `characters.subject.read@1`。它走通用对象正文协议，固定 `subject_id` 输入。角色采用需要同 owner 的类型化回读接口，具体动作登记和版本留在实际接入片，本提前片交 schema 与类型。

## 4. Schema、允许路径与验证

公开 `BLUEPRINT_SOURCE_SCHEMA`、`BLUEPRINT_PART_ORIGIN_SCHEMA`、`CHARACTER_ROLE_VERSION_REF_SCHEMA`、`CHARACTER_DEFAULT_SELECTION_SCHEMA`、`CHARACTER_EFFECTIVE_SELECTION_SCHEMA`、`CHARACTER_TEMPLATE_ADOPTION_RESULT_SCHEMA` 及 `CHARACTER_ROLE_READ_INPUT_SCHEMA`／`CHARACTER_ROLE_READ_RESULT_SCHEMA`。共用同一组叶 schema，按判别字段使用闭合分支。ID、revision 凭据、请求键和来源字符串非空，数值版本与草稿 revision 为正安全整数。来源的真实包 id、SemVer 和草稿版本由接入片沿已有来源检查确认。项目、操作者、安装身份、当前授权等字段在输入的任何分支都不接收。保存、恢复、选择的实际动作输入与 owner 持久化由接入片按上面的边界完成。

| 允许路径 | 内容 |
| --- | --- |
| `packages/contracts/src/modules/characters.ts` | 现有公开入口，增量转出类型与 schema。 |
| `packages/contracts/src/modules/character-role-scope.ts`、`packages/contracts/src/platform/blueprint-source.ts` | 相邻纯合同、来源叶定义。 |
| `tooling/gates/api/contracts/modules/characters.txt` | `pnpm api:update` 后提交此子路径的变化。 |
| `tests/character-role-scope-contract.test.ts`、本文 | 公开入口验收和设计说明。 |
| `docs/design/role-scope/app.js`、`docs/design/role-scope/README.md` | 仅校正用户已定的项目默认停用取值、来源、提示和影响说明。 |

公共包根、`package.json` exports、SDK、Manifest、Host 动作快照、版本登记、存储／升级、运行时和 UI 均在本片的文件边界之外。主台协调第 36 批目录和第 20 批交接引用。源码按分支合入，只有公开子路径可消费后，P-2b 才能把类型用作交付依据。

| 编号 | 从公开入口验证 |
| --- | --- |
| RSC-C01 | 项目成员能表达双跟随和任一节覆盖。拒绝缺节、未知节模式、伪造身份、项目版本缺原件引用、把成果引用当角色版本和超过安全整数的版本。个人固定引用可独立成立。 |
| RSC-C02 | 默认形状区分项目沿用与显式助理，个人默认拒绝项目成员。有效值能区分本次、项目、个人和助理，拒绝来源和版本所属层矛盾，只允许助理自身结果带停用的项目默认引用。 |
| RSC-C03 | 模板采用结果区分个人原件和项目成员、创建和复用。接受内容包／草稿两种来源，拒绝跨分支字段、伪造安装／操作者。角色读与请求读是互斥分支。回执存在且角色已解除与未找到回执可分别返回。 |
| RSC-C04 | [原型] 个人默认已有角色时进入「项目默认的角色已停用」状态，任务选择器和项目设置都显示新任务由助理自己做，个人默认配置保留，进行中的任务继续显示原固定版本。原型说明同样记录用户确认的行为。 |

测试以现有公开 `modules/characters` 及 Kernel 的 `compileActionSchema`／`assertActionInput` 运行真实 schema。正例用公开类型作 `satisfies` 约束，负例经公开 validator 检查。整批类型检查覆盖测试文件。构建产物就绪后跑 `node scripts/run-tests.mjs tests/character-role-scope-contract.test.ts`，并核对公开 API 快照和健康门禁。实际继承、授权拒绝、并发冲突、原子回执、重启后恢复、冻结执行和 UI 由第 36／20／44 批各接入片运行时验收。本片的结构测试只证明形状。

## 5. 开工前检查

| # | 提前片范围 |
| --- | --- |
| 1 事实主人 | Characters 拥有原件、成员、默认和固定版本。Blueprints 拥有草稿及采用步骤，成果库仍拥有发布物。各方只交换公开身份和观测 revision。 |
| 2 插件同等待遇 | 角色合同从同一子路径消费。插件或场景来源不同不改变主人或调用通路。本片无装配。 |
| 3 能力注册 | 本片无登记或处理器。后续在 Characters 一处声明，调用者与项目从可信上下文获取。 |
| 4 合同 | 现有 `modules/characters` 增量导出，更新其 API 快照。按第 36 批已定的合同提前片交付，第 20 批直接消费。 |
| 5 包边界 | 公共形状留在 contracts，场景来源叶无业务依赖。角色服务落回 Characters，Agent 执行归原主人。 |
| 6 表与存储 | 不涉及。提前片只交 DTO 和 schema。 |
| 7 兼容与迁移 | 不涉及。现有草稿、发布和对象正文合同保持原形。 |
| 8 安全边界 | 无网关或授权行为变化。闭合输入拒绝冒充身份。实际边界由接入片用现行上下文与拒绝测试验证。 |
| 9 调用次数 | 无运行调用。未来回执和该角色当前状态同次主人回读，未知结果先读再写。 |
| 10 升级与数据 | 不涉及。无持久格式或版本登记变化，存量数据处理另行决定。 |
| 11 成果与过程项 | 不涉及新成果类型。真实发布仍用既有 `ArtifactReference`。个人与成员固定引用由 Characters 持有。 |
| 12 页面、外壳与文字 | 已定方案 C 原型仅校正上述停用状态。产品页面、资源和事件不涉及，文本键解析留实际采用入口。 |
| 13 错误 | 本片复用 Kernel schema 诊断，owner 错误码留给实际接入。 |
| 14 冲突面 | 只改 Characters 出口、纯叶、独立测试、本片文档和该原型状态。主台安排与 20 P-2a 的同出口顺序，08 共享出口不用改。 |
| 15 全局最优 | **插件**共用角色合同，第 20 批场景包无专属内置路径。**平台**沿 Characters 与成果库分工，Coding 继续消费现有发布。**助理**由 36 接固定引用启动。**平台能力**沿用精确 Skill 引用与现有授权。**后续**第 20 批 P-2b 和第 44 批共用成员身份、来源与回执。个人草稿只表达原件，整份复制也无法逐节跟随。这里固定原件与成员两份引用，由后续 36 组合并接实际执行。 |
