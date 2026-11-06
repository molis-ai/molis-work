# 公共来源与呈现合同（路线书 05 ②）

状态：设计稿，2026-11-04 写，没有实现。合同归 C 轨，呈现组件归 D 轨，这一份是共同设计；D 轨 2026-11-04 共审，四处要改的已改进稿子，§10 的四问已答（见第 10 节）。2026-11-06 按第 05 批核账勘误（动作版本、事件位置、Manifest 快照、C-1 与 U1 的先后），并按用户同日的决定改了第 8、9 节：真实 Home 重建不等 C-1，动表的部分走升级段。2026-11-04 收进第 06 批核账（#1805）列的七处缺口（第 3、4、8、9 节）、第 15 批评审里收下的五项（#1798，第 5、6 节）和 D 轨定的两个字段角色。实现等 02 交接，以及 03、04 定样全部落定；组合服务的实现在[第 15 批](../post-anticorruption-roadmap/reference/batches/15.md)。

## 0. 这份稿子做什么

[第 05 批第 2 项](../post-anticorruption-roadmap/reference/batches/05.md#batch-05-item-2)要交六样合同：

1. 资料的身份；
2. 多个输入目录配一个输出目录；
3. 浏览和执行的区别，以及撤权；
4. 智能呈现的声明；
5. 组合服务的公开合同；
6. SDK 里作者和平台共用的校验。

产品规则不在这里定，已经定了：

- 目录与资料：[目录与资料整合方案](../product-flow-governance/workspace-and-materials-design.md) §2、§2.1、§5，WMD-01～12。第 03 批的定样（2026-11-03）选的是「按来源分组，最上面加最近用过」。
- 智能呈现：[智能呈现](../intelligent-surfaces/spec.md) §4、§5、§12，IUI-01～26。第 03 批的定样（2026-11-03）选的是方案 B「插件领头」。
- 主线顶部事项切换（[work-mainline](../work-mainline/spec.md) MLN-23）：列表每行用智能呈现的「行」形态。它是本合同的消费者，不需要另加合同。

03 的这几条定样记录现在在分支 `claude/roadmap-03-shared-design` 上（`ff1f8221a`），合入 main 后改成仓库内链接。

本稿只写合同长什么样、归谁、怎么拆 PR，不写实现。凡是现有合同能用的都直接复用：

- 身份用 `ActionSubject`；
- 打开位置用 `SearchOpenTarget`；
- 来源复用 `SearchSourceKind`、`FileSourceKind`；
- 本机文件用 `WORKSPACE_FILE_SUBJECT_KIND`；
- 固定版本用成果库与过程项的 `ArtifactReference`；
- 读取时的版本照内核已认的四个字段。

## 1. 原则

- **一个事实一个主人。** 目录配置归 `modules/projects`；本机文件的读写归宿主工作区服务；跨来源的查找和读取归 `horizontal/knowledge`；对象和正文归各自的插件或 Module；操作面的组合归新的组合服务。本合同不新建资料库，也不复制正文。
- **可信身份不从输入读。** 调用方、项目、安装、插件从调用上下文来。资料引用里写的主人插件只用来展示，平台按动作目录核对，不靠它授权。
- **插件同等待遇。** 内置、生成、第三方插件用同一份声明、同一套校验，宿主不按插件名开分支。
- **现行取值。** 阶段 1 按 N35 原地改形状，不留旧取值的读取兜底；已有数据由维护改成现行形状（第 8 节）。

## 2. 资料身份

「项目资料」面板、资料选择器、「加入任务」、引用和出处说的是同一个东西。它的身份是：

```ts
// packages/contracts/src/platform/project-materials.ts（新子路径）
interface MaterialRef {
  /** 主人给的身份。本机文件是 WORKSPACE_FILE_SUBJECT_KIND，id 为 `<workspace_id>:<相对路径>`；插件对象用它自己的 kind/id。 */
  subject: ActionSubject;
  /** 当前文件还是固定的版本。 */
  pin:
    | { mode: "current"; read_revision: string }            // 当前文件：读的时候是哪一版，用来提示「已经变了，刷新」
    | { mode: "fixed"; version: ArtifactReference }         // 成果库里的固定版本
    | { mode: "snapshot"; version: ArtifactReference };     // 快照或选区：过程项，不进成果库
  /** 选区落在哪一段（可选）：页、行、锚点。和 knowledge 的 anchor、line 同一套。 */
  range?: { anchor?: string; line?: number; length?: number; page?: number };
}

/** 引用旁边显示的出处。由平台按 MaterialRef 现读，不随引用存储。 */
interface MaterialOrigin {
  source: "directory" | "import" | "object";
  owner: { kind: "plugin" | "system"; id: string; title: string };
  directory?: { workspace_id: string; display_name: string; roles: DirectoryRole[] };  // source 为 directory 时有
  state: "ok" | "changed" | "missing" | "forbidden" | "truncated" | "unreadable";
  note?: string;  // 例如「只读了前 20 页」「.key 读不了正文，原件还在」
}
```

- **为什么要三种 pin**：WMD-04 要求当前文件更新可见，固定的快照和选区不变。成果是固定版本；Files 现在的集合、前后快照和选区都是过程项（WMD §6）。两种固定的东西主人不同，所以分开写。
- **不另起身份**：本机文件、导入文件和插件对象都用 `ActionSubject`。knowledge 的 `KnowledgePieceName`、search 的 `SearchEntry.subject` 已经是这个形状。
- **出处现读，不存**：存在对话或任务里的只有 `MaterialRef`。显示出处时由平台现查，所以撤权以后显示「没有权限查看」，删除以后显示「已删除」，不会拿旧缓存绕过授权（WMD 第 5 节）。
- **校验**：`assertMaterialRef` 放进 SDK（第 7 节），平台和作者用同一份。

### 2.1 最近用过

03 第一块定的资料面板按来源分组，最上面一节「最近用过」：跨来源，最多 5 份，每行写出处。这份记录的主人是 `modules/projects`，工作台不在页面里自己攒：

- **记在哪**：`modules/projects` 自己的一张表 `material_recent_uses`，在项目库里，`tooling/gates/table-owners.json` 记为 `modules/projects` 独占。它只是「最近用过」的列表，和观测采集层的「完整工作记录」（GLOSSARY）不是一回事，不叫工作记录。
- **谁写**：引用发生的地方写，插件和平台走同一个写动作 `materials.recent.record@1`（command，`modules/projects` 提供，受众 user、plugin）。加入任务、在对话或文档里引用、从面板打开一份资料，都在自己的事提交成功之后调它；Pages、IM、Coding 这些发生在插件里的，也用这个动作，不 import Module，不开私路。
  - 输入只有 `refs: MaterialRef[]`（一次最多 10 个）。调用方和项目从调用上下文取，不从输入读。
  - 平台先用调用方此刻的授权现读每个引用的出处，读不了的（`forbidden`、`missing`）不记、也不说明是哪一个，所以既不能替别人种记录，也不能借它探测别人的对象。
  - 只记引用，不记正文。被拒、取消、撤权的调用照 AGENTS 的规矩不写。
- **谁读**：只读动作 `materials.recent@1`（query，`modules/projects` 提供，受众 user、plugin）。按调用方和项目返回最近的 `MaterialRef[]`，新的在前，最多 20 份，面板取前 5 份。出处照第 2 节现读。
  - **给 user**：读不到的项照样返回，由出处的 `state` 说明（「没有权限查看」「已删除」「找不到位置」），让本人知道那份资料还在不在。
  - **给 plugin**：只返回调用方此刻读得了的项；`forbidden`、`missing` 的项连 `subject` 都不给，也不给件数。插件拿到别的插件对象或本机文件的 `subject`，本身就是泄露（和第 6 节 `excluded` 同一条理由）。
- **生命周期**：
  - 每个调用方在每个项目里留 20 份，写入时在同一个事务里删掉最旧的。
  - 主人插件停用或卸载后记录不改写；读的时候出处按第 2 节现读：给 user 显示「已删除」或「没有权限查看」，给 plugin 不返回。
  - 删项目时随项目库一起删（项目库是每个项目一份，`ProjectDeletionService` 删项目库那一步就清掉了），不另登记步骤。
  - Home 快照照项目库的规矩带上。

## 3. 目录：多个输入，一个输出

现在 `ProjectWorkspaceMembership` 用 `is_default` 标一个默认目录，没有输入、输出之分。改成下面的形状：

```ts
// packages/contracts/src/modules/projects.ts
type DirectoryRole = "input" | "output";   // 界面上 input 叫「参考」、output 叫「输出」（03 定样），文案键照界面叫法写

interface ProjectDirectory extends ProjectWorkspaceRef {
  /** 同一个文件夹只关联一次；输入和输出可以重合，这时 roles 两项都有（WMD-08）。 */
  roles: DirectoryRole[];
  state: "ok" | "missing" | "revoked";
}

interface ProjectDirectories {
  project_id: string;
  /** 恰好一项带 output。没有本机输入的项目也有，由项目或 Home 的存储约定给默认位置（WMD-03）。 */
  directories: ProjectDirectory[];
  /** 读取时的版本：改配置时按 expected_revision 提交。 */
  revision: string;
}
```

动作的事实都归 `modules/projects`，提供方照旧是现有的 `system.project-workspaces`（不换提供方，动作快照只变动作本身）。读取时的版本用内核已认的 `expected_revision`：

| 动作 | 做什么 | 谁能调 |
| --- | --- | --- |
| `projects.directories.get@1` | 读项目的输入与输出 | user、plugin、agent、mcp（只读） |
| `projects.directories.add_input@1` | 加一个输入目录 | user，并要用户在界面上确认（沿用现有的 `user_confirmed` 规则） |
| `projects.directories.remove_input@1` | 移除一个输入目录，不删磁盘上的文件（WMD-02） | user |
| `projects.directories.set_output@1` | 设或改输出目录，也可以把一个输入设为输出。不搬移、不删除、不覆盖旧文件（WMD-09） | user |
| `projects.directories.repair@1` | 文件夹换了位置以后，重新找到它 | user |

- 现有的 `projects.workspaces.add@1`、`projects.workspaces.repair@1` 并进上表的 `add_input`、`repair`，`projects.workspaces.unlink@1` 并进 `remove_input`，旧名不留（N35）；`is_default` 删掉（第 8 节）。C-1 的 PR 写明对调用方的影响。
- **默认输出目录是真实的一行**：没有本机输入的项目也有输出目录（WMD-03）。它是 `workspaces` 里真实的一行，`modules/projects` 在建项目时按 Home 的存储约定建好文件夹、核实 realpath 后写入，和别的目录同一套规矩；已有项目由 02③ 的重建（或之后的升级步）补上。所以「恰好一项带 output」和 `RunDirectories.output` 永远有东西可指。
- 改配置只影响以后的轮次；正在跑的轮次照它开始时的位置继续（第 4 节）。
- 各插件读同一份配置，不存自己的覆盖值（WMD-07）。

**目录的 id 和路径脱钩**（#1805 第 2 条）。现在 `workspace_id` 是路径哈希（`modules/projects/src/workspace.ts` 的 `normalizeProjectWorkspace`），`repair` 换了路径就换了 id，旧关联随之删掉；而资料引用写的是 `<workspace_id>:<相对路径>`，修复以后旧引用就指向一个不存在的 id。改成：

- 文件夹是 Home 级的一行（`modules/projects` 的 `workspaces`，`canonical_path` 全局唯一），和项目多对多关联（`workspace_project_memberships`）。这个形状不变。
- `add` 时发一个新 id，以后不再随路径变；「同一个文件夹只关联一次」由 `canonical_path` 的唯一约束来守。加一个别的项目已经关联过的文件夹，关联到原来那一行，不新发 id。
- **唯一性只认核实过的路径**：`add`、`repair` 都必须 realpath 核实成功；核实不了（不存在、读不了）就拒绝，错误码 `projects.directory_missing`，不退回 `path.resolve` 的结果。这样大小写不同、经符号链接的同一个文件夹不会被当成两个。
- **`repair` 说的是「这个文件夹搬到了这里」**，是文件夹的事实，不是某个项目的：只在这一行的状态是 `missing` 时允许，改的是这一行的 `canonical_path`，id 不变，所以每个关联它的项目一起跟着走，历史引用和固定版本都不受影响（WMD-04）。每个关联的项目各记一条 `project.workspace_path_repaired`。想换成另一个文件夹，是移除再添加，不是修复。
- 新路径已经是另一行（不论哪个项目关联着）时拒绝，错误码 `projects.directory_duplicate`，不悄悄合并两行。
- **不再从路径推 id**：现在 `apps/local-host/src/project-catalog.ts`、`modules/private-work-context/src/project-binding-validation.ts` 用 `normalizeProjectWorkspace` 按路径哈希推 id。脱钩以后一律改成按 `canonical_path` 查那一行，`normalizeProjectWorkspace` 不再出 id。否则旧的哈希 id 照旧推得对、新发的推不对，就成了一条没写明的兼容路径。
- 现有的哈希 id 本来就是不透明的字符串，照旧有效，不重写、不重映射；以后只是不再从路径算它。

**没写目录时取输出目录**（#1805 第 3 条）。现在有十几处不传 `workspace_id`，靠 `preferredPath` 隐含取一个目录（Schedule 的唤醒、Goals 的终端、到达页都是）。规则定为：

- 没传 `workspace_id` 的读、写、执行，一律取**输出目录**。合同里的 `preferredWorkspacePath`（`modules/projects.ts` 的读取端口，有 api 快照）和动作 `projects.workspace.read` 都换成按角色给的读法：端口改成 `outputDirectory(project_id)`，动作并进 `projects.directories.get`，不留旧名。
- 第 06 批核账 C 表里的每个调用方，实现时逐个标明是改用输出目录，还是必须显式传目录：手里已经有引用的（如 `artifact-actions.ts` 按引用定位文件）用引用里自带的 `workspace_id`，不改成输出目录。
- 要用输入目录，必须显式传它的 `workspace_id`，服务按当前角色核对；不按「最近看过」「第一个加的」去猜。

## 4. 浏览和执行，以及撤权

一个任务涉及三个位置，用处各不相同：

| 位置 | 主人 | 存在哪里 | 能不能写或执行 |
| --- | --- | --- | --- |
| 项目配置（输入和输出） | `modules/projects` | 项目库，持久 | 只有输出目录可写；只作输入的目录对谁都只能读，Agent、插件、Git 一样（WMD §2.1、WMD-11）。要在某个文件夹里写，就把它设成输出（输入和输出可以是同一个） |
| 本轮执行位置 | agent-host，在轮次开始时冻结 | 轮次记录 | 是输出目录，或临时工作树 |
| 面板正在看的位置 | 工作台的视图状态 | 页面，按窗口各自记 | 永远不能，只是看 |

**现在的「浏览目录」设置删掉**（#1805 第 1 条）。main 上有一份持久的浏览选择：动作 `projects.settings.browsing-workspace.read`、`.select`，宿主表 `project_browsing_settings`（`apps/local-host/src/project-browsing-settings.ts`），Files、Git、Coding 和助理的环境都在读。按上表它是页面状态，所以：

- 这两个动作和这张表一起删，同一次切换里改完所有读它的地方，不留别名（N35）。页面事件 `host.workspace.changed@1`（S-54 管着）**保留**，只改「项目打开」那一路（`announceProjectOpened`）的载荷，不再带浏览设置；同一个 PR 改 `packages/contracts/src/platform/plugin-events.ts:29` 这个插件事件的载荷（它不在 `dom-events.ts` 里；快照是 `platform/plugin-events.txt` 和 `platform/plugin.txt`）、跑 `pnpm api:update`，并核 S-54 那一行。同一次切换里要改的还有：`projectWorkspacesRoute`、`plugin-page-workspaces.ts`、Coding Manifest 的 `consumes`、`skills/molis-plugin-dev/elements.md`、`docs/platform/PROJECT-SETTINGS.md`。
- **Git**：动作的输入显式带 `workspace_id`，不传就是输出目录（第 3 节）；页面把正在看的目录作为输入传过去，服务按当前角色核对。
- **Coding**：浏览的目录只在页面里；执行位置只从 `RunDirectories.execution` 来（下一段）。Coding 现在把两者混在一起（`routes-sessions.ts`、`executor.ts`），浏览器代码要整块改：归 B 轨；借助理执行器（`assistant-executor.ts`）的那部分归 A 轨（轨道规则 7）。
- **助理的环境**：「你正在看什么」由页面经现有的情境通道交给助理，只当提示，不带授权；不再读持久设置。
- **Files**：随第 06 批退役（第 8 节），不再改它。

开轮时冻结下来的是（叫 `RunDirectories`，不叫 placement：`platform/placement.ts` 里的 placement 指对象放在哪个项目分区）：

```ts
// packages/contracts/src/services/agent-host.ts（在现有的冻结轮次信息上加）
interface RunDirectories {
  directories_revision: string;  // 开轮时读到的 ProjectDirectories.revision
  output: string;                // workspace_id
  inputs: string[];              // workspace_id[]
  execution: { kind: "output" } | { kind: "worktree"; worktree_id: string };
}
```

- **冻结的是「在哪」，不是「准不准」。** 每次读、写、执行，都按**当前**的目录角色和授权重新核一遍。撤权、文件夹失效、移除输入会立即拒绝之后的访问，不能拿「已经冻结了」当理由继续（WMD-09）。被拒的调用照 AGENTS 的规矩不写业务记录。
- **配置变了**：轮次视图同时给出 `RunDirectories` 和当前的 `ProjectDirectories`，界面据此显示「本轮还在原位置，下一轮起用新位置」。
- **浏览不改权限**：面板正在看哪里不进任何合同，只是工作台的页面状态。临时查看一个输入目录不改执行位置（CHO-36～39），也不获得写入权限。
- **只有输出目录可写**（#1805 第 5 条）。现在 `agent-host-composition.ts` 里，`workspaceRefFor` 取的是最近更新的那条关联，`workspaceGrants` 给的是所有已验证目录；目前没有因此多放权，但改成 `roles` 以后要说死：一轮里能写的只有 `RunDirectories.output`（或它的临时工作树），输入目录只读，和上表对所有写入方的规矩一致。实现时补一条断言「写输入目录被拒」的测试，并在 `docs/system/SECURITY-INVARIANTS.md` 加一行（编号由实现片取）。
- **失效时的错误**：用 `projects.directory_missing`、`projects.directory_revoked`、`projects.directory_duplicate`，在 `modules/projects` 的 `defineErrorCodes("projects", …)` 里声明。

## 5. 智能呈现的声明

写在 Manifest 的新字段 `presentation` 里，和 `actions`、搜索来源、`artifacts.produces` 并列。

```ts
// packages/contracts/src/platform/presentation.ts（新子路径；Manifest 类型在 plugin-manifest.ts 里引用，它的快照落在 tooling/gates/api/contracts/platform/plugin.txt，经 platform/plugin 子路径导出）
type FieldRole = "title" | "status" | "summary" | "excerpt" | "media" | "number" | "progress"
  | "due_at" | "happened_at" | "updated_at" | "actor" | "activity" | "origin" | "version" | "relation" | "children"
  | "judgment" | "held_in";
// activity：一句最近发生了什么，由主人给。「行」的第二行固定读 actor、activity 和时间（MLN-23 的「最近一次动作」）。
// judgment：主人对这件东西的判断，值是 { label: TextRef; reason?: TextRef }（D 轨 2026-11-04 定）。
// held_in：这件东西归项目还是归个人，值是 "project" | "personal"。不叫 scope：会和动作的 scope、AssistantScope 撞名。
type FormKind = "chip" | "row" | "card" | "peek";           // 第一片：四种基础形态
// 第二片再加 "live" | "embed"；"page" 是插件自己的主区，不进声明。
type AttentionState = "needs_decision" | "needs_acceptance" | "failed" | "partial" | "stale";

interface PresentationDeclaration {
  objects: PresentationObject[];
  /** 自己页面上允许别人放东西的位置；不写就是一处都不开放（IUI-13）。 */
  mounts?: MountDeclaration[];
  /** 插件级概况：首页、Shelf 上「这个插件现在怎么样」。指向本插件自己的一个 query 动作（#1798 第 12 节第 1 条）。 */
  overview?: { capability_id: string; version: number; note_key?: string };
}

interface PresentationObject {
  /** 必须是本插件已经声明过的搜索 kind 或动作的 subject kind，不另起类型。 */
  kind: string;
  fields: Array<{ key: string; role: FieldRole; label_key?: string }>;
  /** 插件自己的状态映射到状态环（status-ring-system）和显示用的提醒标记。ring 写族名或别名，和 renderStateRing 一致。 */
  status?: { field: string; map: Record<string, { ring: StateRingState; attention?: AttentionState }> };
  /** 每种形态显示哪些字段；没写的形态平台不用，按梯度降一级（IUI-03）。 */
  forms: Partial<Record<FormKind, { fields: string[] }>>;
  actions?: Array<{
    ref: string;                      // "capability_id@version"，必须在动作目录里
    primary?: boolean;
    when?: { status?: string[]; slots?: SurfaceSlotKind[] };
    input_from?: Record<string, string>;  // 预备输入取哪些字段；预备不写入
  }>;
  /** 给外部 Agent、终端、通知用的文本形态（§4.5）：用字段拼几行，和图形出自同一份事实。 */
  text?: { lines: string[] };
}

interface MountDeclaration {
  id: string;
  where: "list-top" | "detail-side" | "between-blocks" | "header";
  accepts: FormKind[];
  max: number;
  refuse_kinds?: string[];
}
```

- **值由主人现给，平台不存。** 字段的值由插件的一个读取动作给出。写法照搜索来源的样子，定义一对类型：

  ```ts
  export const PRESENTATION_VALUES_INPUT_TYPE = "molis.presentation.values.request.v1";
  export const PRESENTATION_VALUES_OUTPUT_TYPE = "molis.presentation.values.v1";
  interface PresentationValuesInput { subjects: ActionSubject[]; fields: string[] }   // 一次最多 50 个对象
  interface PresentationValues {
    items: Array<{ subject: ActionSubject; revision: string;
      state: "ok" | "forbidden" | "deleted" | "stale"; values?: Record<string, unknown>;
      /** 这些值是什么时候读到的。state 为 stale（主人此刻读不到、给的是最后的值）时必有，界面写「x 分钟前的值」（IUI-10）。 */
      read_at?: string }>;
  }
  ```

  另给 `definePresentationValuesAction`、`bindPresentationValuesHandler`。插件只写一个处理器；组合服务用调用方当时的授权去调它，所以读不到、撤权、删除会如实反映出来（IUI-09、IUI-10）。
- **插件领头需要的身份**：方案 B 的色块、色带只需要「这个东西归哪个插件」。组合服务从动作目录得出主人插件，放进操作面描述；颜色和图标怎么从插件身份映射出来归 D 轨，合同只给插件 id。插件色只用在色块和色带里，状态色只用在状态环、色点和状态标签里，两套分开，这一条在 D 轨的组件里守。
- **状态环的取值归 contracts。** `StateRingState` 现在在 SDK 的 `packages/plugin-sdk/src/ui/state-ring-states.ts`，contracts 不能反过来引用 SDK。先由 D 轨把 `STATE_RING_FAMILIES` 的取值清单下沉到 contracts 的 `platform/ui.ts`（这个文件归 D 轨），SDK 的 `/ui` 从 contracts 取，渲染留在 SDK；`presentation.ts` 只引用 contracts 里的这份取值。C-2 叠在 D 轨这一步后面。
- **`attention` 只管显示，不进「等你」。** 声明里的 `attention` 只决定色点和状态标签，不产生等你条目。「等你」的主人仍是 `modules/attention-resumption.ts`，插件经 `platform/plugin-attention.ts` 写入；它的 `reason`（manual、source_rule、goal_decision……）说的是为什么进来，这里的 `needs_decision`、`needs_acceptance` 说的是要你做什么，两者不是一回事。等你列表只认 attention-resumption，不形成第二份「要你管」的名单。
- **不经组合服务也能用。** 呈现声明可以脱离组合服务单独用：主线顶部切换（MLN-23）不调 `surfaces.compose`，直接按声明和 `PresentationValues` 画「行」。SDK 给一个按声明取值、渲染单个形态的入口（第 7 节），所以 MLN-23 不用等第 15 批。
- **插件级概况**（`overview`）：
  - 指向的动作，输入输出 schema 由平台定死，声明必须一字不差，做法照 `SANDBOX_INTEGRATION_CONTRACT`。输出是 `{ summary: TextRef; subjects: ActionSubject[]（≤5）; start: Array<{ capability_id; version }>（≤3） }`。
  - 动作是 `effect: "read"`，不调模型、不花钱，和 `home_aggregate` 的约束一样。
  - `note_key` 是不变的一句话（如 Feed 的「同步来的资料不算你接下的工作」），写在声明里，不让动作每次返回。
  - `start` 里的动作必须在同一次注册里，用 `inspectActionCrossReferences` 查；后果从动作元数据取。
  - Home 级插件（如 Todo）的概况动作走 `project_reach`，按调用上下文给它可达的项目，不在输入里带项目。
- **没有声明的对象**：平台兜底显示图标、名字、所属插件和「打开」，打开位置用 `SearchOpenTarget`（IUI-02）。
- **文案键**：`label_key` 用插件的稳定文字键，和第 15 批「前三个插件声明从首片起用稳定文字键」一致。
- **装不上要说清**：声明不合法时安装被拒，并说明是哪一项错了（IUI-01）。校验是第 7 节的 `validatePresentationDeclaration`。

## 6. 组合服务的公开合同

组合服务是一个新的 `horizontal/` 包，第 15 批实现；宿主只做装配。公开合同放在 `packages/contracts/src/services/surface-composition.ts`。界面上的位置叫 slot（`SurfaceSlotKind`），不叫 placement，理由同第 4 节：

```ts
type SurfaceSlotKind = "plugin-mount" | "conversation" | "discussion" | "attention" | "home"
  | "shelf" | "search" | "side" | "text";
// 合同里现在就有 home；消费者的顺序照第 10 节第 3 条，首页排在第二片。

interface SurfaceRequest {
  slot: { kind: SurfaceSlotKind; plugin_id?: string; mount_id?: string };   // plugin-mount 时要写在哪个插件的哪个挂载位
  subjects?: ActionSubject[];
  /** 此刻在做什么（§5 依据 4）。第一片的确定组合不看它，只为助理组合留位置。 */
  task?: "writing" | "reviewing" | "finding" | "handing-off" | "discussing";
}

interface SurfaceDescription {
  composed_by: "rules" | "assistant";
  revision: string;                 // 同样的输入得到同样的 revision，确定组合可以重复（IUI-04）
  groups: SurfaceGroup[];
  reason?: TextRef;                 // 一句「为什么这样放」（IUI-06）
}

/** 按种类区分的组（#1798 第 12 节第 4 条）。描述里所有给人看的字都用 TextRef（第 14 批 A 段）。 */
interface SurfaceGroup {
  kind: "attention" | "continue" | "plugin" | "slot";
  owner_plugin_id?: string;         // 只在 plugin 组
  state: "ok" | "unreadable" | "stale" | "disabled" | "undeclared";   // disabled、undeclared 只用在 plugin 组
  read_at?: string;                 // state 为 stale 时有
  /** 没有放进来的。第一片只收 disabled：不给 forbidden，「有几件你看不了」本身就是泄露。件数只给 user 受众；plugin 受众只给有没有，不给件数。 */
  excluded?: Array<{ reason: "disabled"; count: number }>;
  hidden_above?: { count: number; label: TextRef };   // 「另有 N 件」：只数调用方读得了的
  title?: TextRef;
  items: SurfaceItem[];
}

interface SurfaceItem {
  subject: ActionSubject;
  owner_plugin_id: string;          // 方案 B 的插件色块、色带用它
  form: FormKind;
  state: "ok" | "forbidden" | "deleted" | "stale";
  fields: Array<{ key: string; role: FieldRole }>;   // 显示哪些字段；值由页面用 PresentationValues 去取，不放进描述
  actions: Array<{
    ref: string;                    // "capability_id@version"，或平台的通用操作（打开、速览、放进、交给……）
    primary: boolean;
    prepared_input?: Record<string, string>;   // 只放字段引用（同 input_from：输入键 → 字段键），不放值；点下去时按当时的授权取值
    consequence?: Array<"external" | "cost" | "irreversible">;   // 写在按钮旁（IUI-08，VUX-56）
  }>;
  /** 被合并进这一件的对象（#1798 第 12 节第 5 条）。服务按动作目录填 owner_plugin_id；调用方读不了的不放进来。 */
  merged?: Array<{ subject: ActionSubject; owner_plugin_id: string; relation: ContextRelationType }>;
}
```

| 动作 | 种类 | 说明 |
| --- | --- | --- |
| `surfaces.compose@1` | query | 按调用方、位置（slot）和对象返回校验过的 `SurfaceDescription`。第一片只做确定组合，不调模型 |
| `surfaces.correct@1` | command | 用户换形态、移走、固定。按调用方和位置记住，同一位置下次先照纠正来（IUI-06）。用 `expected_revision` |

**纠正记录的生命周期**：
- 存在哪：位置属于某个项目的（插件挂载位、项目讨论、等你）存在组合服务在项目库里的纠正表；不属于项目的（个人一层）存在组合服务自己的 Home 库，登记进 `homeStoreRegistry`。两处都在 `table-owners.json` 记为组合服务独占，建表经第 02 批的 storage 驱动，按 02③ 分界（第 8 节）。
- 键：调用方 + 位置（`slot.kind`、`plugin_id`、`mount_id`）+ 对象 `subject`。
- 插件停用或卸载：它挂载位上的纠正不删，读的时候挂载位不在就不用；同一插件同一挂载位再装回来，照旧生效（这是本人对自己版面的偏好）。纠正里指向的对象读不到时同样跳过，不显示。
- 删项目：随项目库一起删；个人一层的纠正不受影响。
- Home 快照：项目库和登记过的 Home 库都带上。

- **组的规矩**：`disabled`、`undeclared` 用在 plugin 组以外，`assertSurfaceDescription` 拒绝。停用卡上的「启用」引用平台动作 `plugins.installed.enable@1`（只给本人），不另造。
- **revision 要把授权算进去**：main 上没有单独的「授权版本」，所以哈希的输入里加上动作目录 `discover()` 给每个操作的 `availability`。只换了授权、别的没变时，可点的操作已经不同，revision 也必须变，页面才会重画。
- **关系类型要登记**：现在 context-ledger 的 `ContextEdge.type` 是自由字符串，写入方各自定常量（如 `horizontal/placement/src/index.ts` 的 `TYPES`）。C-3 在 contracts 的 `modules/context-ledger` 加一张平台关系类型表 `ContextRelationType`：放进 placement 已有的 `placement.derived_from`、`placement.copied_from` 等（照原名，归 placement），再加 `created_from`；`merged` 只认表里的类型。三者不重叠：`copied_from` 是复制出的副本，`derived_from` 是由别的对象派生出的版本，`created_from` 是在操作面上「从这件新建」出的另一件东西，两者主人可以不同。这条边由执行「从这件新建」的平台路径写，不由插件自称。
- **授权核对只读**：组合服务核对「这个操作此刻能不能点」直接用动作目录的 `discover()`，它带 `availability`，不另开接口。
- **操作就是动作**：`SurfaceItem.actions` 里只能是动作目录里现有的动作，或者平台的通用操作。点下去的时候走动作网关，用当时的授权，不用组合当时的授权（IUI-07）。
- **组合不存值**：描述里只有引用、形态和该显示哪些字段，值由页面另取。所以描述可以缓存，值照样是主人的当前值。
- **助理组合**（第三片）：同一个 `compose`，`composed_by: "assistant"`。服务先算出确定组合的候选，再经 agent-host 让模型挑选，输出用 `assertSurfaceDescription(候选)` 校验：候选以外的丢掉并记下，不合格就退回确定组合（IUI-05）。合同现在只是给它留了字段，第一片不实现。
- **记录**：助理组合的输入、候选、选择、理由和纠正写进组合服务自己的组合记录，不记对象正文（IUI-23）；观测采集层（第 21 批）落地后由它接进「完整工作记录」，这里不另起同名的东西。

## 7. SDK 里共用的校验

照 AGENTS 的规矩：作者和平台都要跑的工具只放一份，放在 SDK 里。新子路径 `@molis-ai/molis-work-plugin-sdk/presentation`：

| 函数 | 平台在哪里用 | 作者在哪里用 |
| --- | --- | --- |
| `validatePresentationDeclaration(manifest, catalog)` | 安装时解析 Manifest：kind 必须是已声明的，动作引用必须存在，形态里的字段必须声明过，挂载位不能重名 | 本地自查；创作台生成插件时（IUI-22） |
| `assertMaterialRef(value)` | 资料引用进对话、任务时 | 插件处理别人交来的引用时 |
| `assertSurfaceDescription(value, candidates)` | 组合服务校验助理组合的输出 | 插件在测试里检查自己挂载位上的东西 |
| `presentationText(object, values)` | 文本形态（MCP、通知、导出） | 插件预览自己的文本形态 |
| `presentationFormFields(object, form)` | 组合服务和单独使用的页面算出一个形态要取哪些字段，再调主人的 values 动作 | 插件检查自己每种形态取的字段 |
| `renderPresentationForm(object, form, values)`（`/ui`） | 不经组合服务单独画一个形态，第一个用的是 MLN-23 的「行」 | 插件在自己页面上画别人交来的对象 |

`renderPresentationForm` 只给签名和取值规则，外观用组件板（`/__ui/catalog`）已有的控件拼，不另画（用户 11-04 的要求，#1772）。组件板没有的标「组件板新增」，由 D 轨先补成标本，再接进来：

| 形态 | 用组件板的什么 |
| --- | --- |
| 名字片 chip | 标签 `mw-tag`，状态用状态环 `renderStateRing` |
| 行 row | 列表行 `mw-item`（组件板「行」一节） |
| 卡片 card | 预览卡 `renderPreviewCard` |
| 速览 peek | 浮层 `renderPopover`，窄屏用 `renderSheet`，里面放卡片的字段 |
| 插件领头的色块、色带（方案 B） | 组件板新增（D 轨补标本；03 定样 #1768 里已有的，以它为准） |

上表以 D 轨核对为准。

SDK 只依赖 contracts，不依赖也不转出私有包。改 SDK 算动共享核心，照规矩跑全量。

## 8. 存量数据

`is_default` 改成 `roles`，属于改库结构。第 02 批已经定下真实 Home 清空重建，各库从统一起点的第 1 版开始。所以这一步：

**真实 Home 重建不等这份合同（用户 2026-11-06 定）：#1837 合入就按检查单重建。** 分界仍是 02③（统筹 2026-11-04 定），但顺序定了，这份稿子动表的部分都落在重建之后，不再进第 1 版：

- `workspaces` 的 `is_default` 改 `roles`、默认输出目录那一行、删 `project_browsing_settings`、新增 `material_recent_uses`：都走 U1 升级段，并过金样回放（U2）。这几段用户已同意，写的时候不用再问。
- 组合服务纠正表属第 15 批，到时同样走升级段。

这些段写在 05② 的实现片里，那一片要等 U1 和四份门禁就位（U1 设计第 14 节）。**合同片不动表，也就不等 U1。** 不加读取兼容。`modules/projects` 现在没有升级段（#1805 第 6 条），实现片先给它登记第一段。

万一 C-1 的合同片赶在重建之前合入，也不要趁机把表写进第 1 版：重建随时会发生，分两条路只会多出一种要核的情况。

本稿里另外两处存量：

- **删掉的浏览设置表**（第 4 节）：重建之前落，第 1 版建表里直接不建；之后落，升级步删表，不搬数据（它本来就是页面状态）。
- **Files 退役**（#1805 第 7 条）：去向写在[第 06 批第 1 项](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-1)。要点：产生动作和版本读取归平台的资料服务，用现有的过程项设施（产生者的身份要先在合同里补，见那一节）；原来的输出绑定在同一次切换里改到新动作，不留别名；侧栏的文件来源归 `horizontal/knowledge`；历史过程项按维护步处理，涉及真实 Home 的进维护时段，先问用户。

## 9. PR 怎么拆

按轨道规则 1，合同单独先开小 PR，服务接着，消费者最后。

| 片 | 内容 | 前置 |
| --- | --- | --- |
| C-1 资料与目录合同（**不碰 `packages/storage`，也不等 U1**：建表语句在 `modules/projects`，由 `apps/local-host/src/project-database-schema.ts` 汇进项目库基线；动表的部分不在这一片，见前置列） | `platform/project-materials.ts`；`modules/projects` 的 `ProjectDirectory`、`ProjectDirectories`、`RunDirectories`，第 3 节的五个动作与 `materials.recent@1`、`materials.recent.record@1` 的声明；删掉 `projects.settings.browsing-workspace.*`；三个错误码；`assertMaterialRef`；api、actions 快照 | 02 交接。`material_recent_uses` 表挪到实现片走 U1 升级段（用户 2026-11-06 定重建不等 C-1）；这一片只声明动作 |
| C-2 呈现声明合同 | `platform/presentation.ts`、Manifest 的 `presentation` 字段、values 的类型与 define/bind；`validatePresentationDeclaration`、`presentationText`、`presentationFormFields`、`renderPresentationForm` 的签名；api 快照 | 02 交接；D 轨把状态环取值下沉到 contracts 的 `platform/ui.ts` 之后 |
| C-3 组合服务合同 | `services/surface-composition.ts`、`SurfaceGroup`、`surfaces.compose@1`、`surfaces.correct@1` 的声明；context-ledger 的关系类型表；`assertSurfaceDescription`；actions 快照 | C-2；第 14 批 A 段的 `TextRef` 合入 |
| 实现 | 组合服务包（第 15 批）；`modules/projects` 的服务与界面接线（WMD 的实施切片），含 id 与路径脱钩、`outputDirectory`、删浏览设置表；Git 显式带目录；Goals、Inbox、Coding 的第一片声明。Coding 的浏览与执行拆开归 B 轨，`assistant-executor.ts` 的部分归 A 轨。第 8 节的升级段在这一片写 | C-1～C-3 合入；升级段另等 U1 和四份门禁（U1 设计第 14 节） |

## 10. D 轨的答复（2026-11-04 共审）

1. **插件色：平台分配，Manifest 不声明。** 分配结果要稳定：同一个插件换设备、重装后颜色不变；色盘够用时，两个已装的插件不撞色。色盘和状态色分开，由 D 轨在 design-system 里定，浅色和深色都要分得清（IUI-26）。合同只给 `owner_plugin_id`，不加颜色字段；是记在安装记录上，还是按 id 确定地算，D 轨做色盘时再定，两种都不用改本合同。
2. **字段角色：四种形态够画，「行」缺一个角色。** 已加 `activity`（第 5 节）；行的第二行固定读 `actor`、`activity` 和时间。之后 D 轨又定了 `judgment` 和 `held_in` 两个（第 5 节），一共 18 个。
3. **第一片的位置：同意插件内、对话、项目讨论、等你四处**，首页和 Shelf 进第二片。另外，MLN-23 不经 `surfaces.compose`，直接按声明画「行」（第 5 节、第 7 节）。
4. **`surfaces.compose` 第一片只给 user 和 plugin：同意。** 外部 Agent 走 `presentationText`。

## 11. 开工前检查 14 项

按[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)的 14 项作答。实现片开工时按这里守，评审也按这里对。

| # | 作答 |
| --- | --- |
| 1 事实主人 | 目录配置与「最近用过」归 `modules/projects`；本机文件读写归宿主工作区服务；跨来源查找读取归 `horizontal/knowledge`；对象与正文归各自插件或 Module；操作面组合与纠正归组合服务（第 15 批）；过程项归 `modules/artifacts`。本合同不新建资料库、不复制正文 |
| 2 插件同等待遇 | 资料引用、「最近用过」的写读、呈现声明、挂载位，内置、生成、第三方插件都走同一个动作和同一个 `validatePresentationDeclaration`；宿主不按插件名分支 |
| 3 能力注册 | 第 3 节五个目录动作、`materials.recent@1`、`materials.recent.record@1`（`system.project-workspaces`）；`surfaces.compose@1`、`surfaces.correct@1`（组合服务）；values 动作由各插件在自己的声明里注册。都注册一次，页面、工作流、Agent、MCP 共用 |
| 4 合同 | 改。新子路径 `platform/project-materials`、`platform/presentation`、`services/surface-composition`；改 `modules/projects`、`modules/context-ledger`、`services/agent-host`、Manifest、`platform/plugin-events`。按 N35 原地改形状，旧名不留；按第 9 节拆三片，按快照一次一个 PR |
| 5 放在哪个包 | 合同在 contracts；共用校验在 SDK（只依赖 contracts）；状态环取值下沉到 contracts 的 `platform/ui.ts`（D 轨）；组合服务进 `horizontal/`，宿主只装配 |
| 6 表与存储 | `workspaces` 去掉 `is_default`、改 `roles`；删 `project_browsing_settings`；新增 `material_recent_uses`（项目库，`modules/projects`）和组合服务的纠正表（项目库与它自己的 Home 库）。都登记进 `table-owners.json`，都走升级段（第 8 节） |
| 7 兼容与迁移 | 不加读取兼容。哈希 id 照旧当不透明字符串用，不从路径推，不算兼容路径。重建之后才落的，走 U1 升级链，是红线，先问用户 |
| 8 安全边界 | 碰。只有输出目录可写，有拒绝测试和不变量一行（SSC-15）；撤权、移除后马上拒绝（SSC-04）；`materials.recent` 给 plugin 不泄露无权项（SSC-12），`excluded` 件数只给 user；`record` 先按调用方授权现读、读不了不记；`host.workspace.changed@1` 的载荷改动核 S-54 |
| 9 调用次数 | values 一次最多 50 个对象；授权核对复用 `discover()`；`record` 一次最多 10 个引用；描述可缓存，值另取 |
| 10 升级与数据 | 「最近用过」与纠正记录的生命周期写在第 2.1、6 节：裁剪、停用卸载后怎么显示、删项目、Home 快照。目录 id 修复后不变，历史引用照读（SSC-16） |
| 11 成果与过程项 | `pin` 分 current、fixed（成果库）、snapshot（过程项），不把过程项放进成果库 |
| 12 页面与外壳 | 浏览位置只是页面状态；形态只用组件板已有的控件拼，缺的由 D 轨先补标本；页面事件按登记改，不新增未登记事件 |
| 13 错误 | `projects.directory_missing`、`projects.directory_revoked`、`projects.directory_duplicate`，在 `defineErrorCodes("projects", …)` 里声明，不新写 Error 子类 |
| 14 冲突面 | contracts 的 `modules/projects`、`platform/plugin-manifest`（快照在 `platform/plugin.txt`；排序见 #1806 第 10 节）、`platform/plugin-events`（快照 `platform/plugin-events.txt`，同名常量也进 `platform/plugin.txt`）；宿主的 `project-browsing-settings.ts`、`workspace-settings-events.ts`、`agent-host-composition.ts`；Git、Coding（B 轨）、`assistant-executor.ts`（A 轨）；`tooling/gates/actions/`、`tooling/gates/api/` |

## 12. 验收编号（候选）

实现时测试名或注释写出这些编号。

| 编号 | 要达到的结果 | 对应 |
| --- | --- | --- |
| SSC-01 | 本机文件、导入文件、插件对象在选择器、引用、出处里用同一个 `MaterialRef`；当前、固定、快照三种 pin 分得清 | WMD-01、WMD-04 |
| SSC-02 | 出处现读：撤权、删除、文件夹失效以后，旧引用分别显示「没有权限查看」「已删除」「找不到位置」，不用缓存的正文 | WMD-05、WMD-06、IUI-10 |
| SSC-03 | 项目恰好有一个输出目录；同一个文件夹只关联一次，可以同时是输入和输出；改配置按 `expected_revision` 提交，冲突时被拒 | WMD-02、WMD-07、WMD-08 |
| SSC-04 | 正在跑的轮次照冻结的 `RunDirectories` 做；撤权或移除目录后，下一次读、写、执行马上被拒，且不写业务记录 | WMD-09、WMD-11 |
| SSC-05 | 浏览位置不进任何合同，`projects.settings.browsing-workspace.*` 与它的表已删；临时查看输入目录不改执行位置，也不获得写入权限 | WMD-11、CHO-36～39 |
| SSC-06 | 呈现声明不合法时安装被拒，并说出是哪一项；内置、生成、第三方插件走同一个 `validatePresentationDeclaration` | IUI-01、IUI-22 |
| SSC-07 | `surfaces.compose` 的确定组合不调模型，同样输入得到同样的 revision；描述里只有引用，值由主人现给 | IUI-04、IUI-09 |
| SSC-08 | 描述里的每个操作都是已注册动作或通用操作；点下去时走动作网关，用当时的授权；撤权以后点击不写任何业务记录 | IUI-07、IUI-08 |
| SSC-09 | 插件只在自己声明的挂载位上出现别人的东西；没有声明挂载位的插件，什么都不放 | IUI-13 |
| SSC-10 | `assertSurfaceDescription` 丢掉候选以外的对象和操作并记下；不合格时退回确定组合 | IUI-05（第三片才用到） |
| SSC-11 | 呈现声明里的 `attention` 只改色点和状态标签，不产生等你条目；等你列表只来自 attention-resumption | D 轨共审 2026-11-04 |
| SSC-12 | 「最近用过」由引用发生处在提交成功后调 `materials.recent.record@1` 记，插件与平台同一个动作，读不了的引用不记；`materials.recent@1` 按调用方和项目读，最多 5 份显示，出处现读；给 plugin 受众时无权或不在的项连 `subject` 都不返回；被拒或取消的调用不记；每个调用方每个项目只留 20 份 | WMD-01、WMD-05 |
| SSC-13 | 主人读不到时 `PresentationValues` 给 `stale` 和 `read_at`，界面写「x 分钟前的值」，不当成当前值 | IUI-10 |
| SSC-14 | 不经组合服务，按声明和 `PresentationValues` 单独画出「行」（MLN-23），与组合服务画出的同一形态一致 | MLN-23、IUI-03 |
| SSC-15 | Agent 只能写输出目录（或它的临时工作树）；写输入目录被拒，有断言拒绝本身的测试和安全不变量一行 | WMD-09、#1805 第 5 条 |
| SSC-16 | `repair` 只在文件夹失效时允许，以后 id 不变，关联它的每个项目的旧 `MaterialRef` 照样能读；修到已有的另一行时被拒；realpath 核实不了的路径 `add`、`repair` 都被拒；不再有从路径推 id 的读法 | WMD-04、#1805 第 2 条 |
| SSC-17 | 没传 `workspace_id` 的读、写、执行都取输出目录；要用输入目录必须显式传，并按当前角色核对 | WMD-07、#1805 第 3 条 |
| SSC-18 | 插件级概况的动作 schema 与平台定的一字不差，否则安装被拒；`start` 只能引用同一次注册里的动作 | #1798 第 12 节第 1 条 |
| SSC-19 | 只换了授权、别的不变时，`surfaces.compose` 的 revision 也变 | #1798 评审 |
