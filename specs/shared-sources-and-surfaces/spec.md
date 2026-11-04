# 公共来源与呈现合同（路线书 05 ②）

状态：设计稿，2026-11-04 写，没有实现。合同归 C 轨，呈现组件归 D 轨，这一份是共同设计；D 轨 2026-11-04 共审，四处要改的已改进稿子，§10 的四问已答（见第 10 节）。实现等 02 交接，以及 03、04 定样全部落定；组合服务的实现在[第 15 批](../post-anticorruption-roadmap/reference/batches/15.md)。

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
- **现行取值。** 阶段 1 按 N35 原地改形状，不留旧取值的读取兜底；已有数据由维护改成现行形状（第 7 节）。

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

- **谁写**：引用发生的地方写。加入任务、在对话或文档里引用、从面板打开一份资料时，发生处所在的服务把 `MaterialRef` 记进平台共用的工作记录（`modules/projects` 导出的写入函数，按调用上下文里的调用方和项目记，不从输入读）。只记引用，不记正文。
- **谁读**：只读动作 `materials.recent@1`（query，`modules/projects` 提供，受众 user、plugin）。按调用方和项目返回最近的 `MaterialRef[]`，新的在前，最多 20 份，面板取前 5 份。出处照第 2 节现读，所以撤权、删除以后照样显示「没有权限查看」「已删除」。
- **撤权以后**：记录不改写；读不到的项照样返回，由出处的 `state` 说明。被拒或取消的调用不写这份记录（AGENTS 的规矩）。

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

动作都归 `modules/projects`，读取时的版本用内核已认的 `expected_revision`：

| 动作 | 做什么 | 谁能调 |
| --- | --- | --- |
| `projects.directories.get@1` | 读项目的输入与输出 | user、plugin、agent、mcp（只读） |
| `projects.directories.add_input@1` | 加一个输入目录 | user，并要用户在界面上确认（沿用现有的 `user_confirmed` 规则） |
| `projects.directories.remove_input@1` | 移除一个输入目录，不删磁盘上的文件（WMD-02） | user |
| `projects.directories.set_output@1` | 设或改输出目录，也可以把一个输入设为输出。不搬移、不删除、不覆盖旧文件（WMD-09） | user |
| `projects.directories.repair@1` | 文件夹换了位置以后，重新找到它 | user |

- 现有的 `add`、`repair` 并进上表，`is_default` 删掉（第 7 节）。
- 改配置只影响以后的轮次；正在跑的轮次照它开始时的位置继续（第 4 节）。
- 各插件读同一份配置，不存自己的覆盖值（WMD-07）。

## 4. 浏览和执行，以及撤权

一个任务涉及三个位置，用处各不相同：

| 位置 | 主人 | 存在哪里 | 能不能写或执行 |
| --- | --- | --- | --- |
| 项目配置（输入和输出） | `modules/projects` | 项目库，持久 | 只有输出目录可写；只作输入的目录只能读（§2.1） |
| 本轮执行位置 | agent-host，在轮次开始时冻结 | 轮次记录 | 是输出目录，或临时工作树 |
| 面板正在看的位置 | 工作台的视图状态 | 页面，按窗口各自记 | 永远不能，只是看 |

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
- **失效时的错误**：用 `projects.directory_missing`、`projects.directory_revoked`，在 `modules/projects` 的 `defineErrorCodes("projects", …)` 里声明。

## 5. 智能呈现的声明

写在 Manifest 的新字段 `presentation` 里，和 `actions`、搜索来源、`artifacts.produces` 并列。

```ts
// packages/contracts/src/platform/presentation.ts（新子路径；Manifest 类型在 plugin-manifest.ts 里引用）
type FieldRole = "title" | "status" | "summary" | "excerpt" | "media" | "number" | "progress"
  | "due_at" | "happened_at" | "updated_at" | "actor" | "activity" | "origin" | "version" | "relation" | "children";
// activity：一句最近发生了什么，由主人给。「行」的第二行固定读 actor、activity 和时间（MLN-23 的「最近一次动作」）。
type FormKind = "chip" | "row" | "card" | "peek";           // 第一片：四种基础形态
// 第二片再加 "live" | "embed"；"page" 是插件自己的主区，不进声明。
type AttentionState = "needs_decision" | "needs_acceptance" | "failed" | "partial" | "stale";

interface PresentationDeclaration {
  objects: PresentationObject[];
  /** 自己页面上允许别人放东西的位置；不写就是一处都不开放（IUI-13）。 */
  mounts?: MountDeclaration[];
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
- **没有声明的对象**：平台兜底显示图标、名字、所属插件和「打开」，打开位置用 `SearchOpenTarget`（IUI-02）。
- **文案键**：`label_key` 用插件的稳定文字键，和第 15 批「前三个插件声明从首片起用稳定文字键」一致。
- **装不上要说清**：声明不合法时安装被拒，并说明是哪一项错了（IUI-01）。校验是第 6 节的 `validatePresentationDeclaration`。

## 6. 组合服务的公开合同

组合服务是一个新的 `horizontal/` 包，第 15 批实现；宿主只做装配。公开合同放在 `packages/contracts/src/services/surface-composition.ts`。界面上的位置叫 slot（`SurfaceSlotKind`），不叫 placement，理由同第 4 节：

```ts
type SurfaceSlotKind = "plugin-mount" | "conversation" | "discussion" | "attention"   // 第一片的四处
  | "home" | "shelf" | "search" | "side" | "text";                                  // 以后

interface SurfaceRequest {
  slot: { kind: SurfaceSlotKind; plugin_id?: string; mount_id?: string };   // plugin-mount 时要写在哪个插件的哪个挂载位
  subjects?: ActionSubject[];
  /** 此刻在做什么（§5 依据 4）。第一片的确定组合不看它，只为助理组合留位置。 */
  task?: "writing" | "reviewing" | "finding" | "handing-off" | "discussing";
}

interface SurfaceDescription {
  composed_by: "rules" | "assistant";
  revision: string;                 // 同样的输入得到同样的 revision，确定组合可以重复（IUI-04）
  groups: Array<{ title_key?: string; items: SurfaceItem[] }>;
  reason?: string;                  // 一句「为什么这样放」（IUI-06）
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
    prepared_input?: Record<string, unknown>;
    consequence?: Array<"external" | "cost" | "irreversible">;   // 写在按钮旁（IUI-08，VUX-56）
  }>;
}
```

| 动作 | 种类 | 说明 |
| --- | --- | --- |
| `surfaces.compose@1` | query | 按调用方、位置（slot）和对象返回校验过的 `SurfaceDescription`。第一片只做确定组合，不调模型 |
| `surfaces.correct@1` | command | 用户换形态、移走、固定。按调用方和位置记住，同一位置下次先照纠正来（IUI-06）。用 `expected_revision` |

- **操作就是动作**：`SurfaceItem.actions` 里只能是动作目录里现有的动作，或者平台的通用操作。点下去的时候走动作网关，用当时的授权，不用组合当时的授权（IUI-07）。
- **组合不存值**：描述里只有引用、形态和该显示哪些字段，值由页面另取。所以描述可以缓存，值照样是主人的当前值。
- **助理组合**（第三片）：同一个 `compose`，`composed_by: "assistant"`。服务先算出确定组合的候选，再经 agent-host 让模型挑选，输出用 `assertSurfaceDescription(候选)` 校验：候选以外的丢掉并记下，不合格就退回确定组合（IUI-05）。合同现在只是给它留了字段，第一片不实现。
- **记录**：助理组合的输入、候选、选择、理由和纠正写进工作记录，不记对象正文（IUI-23）。

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

分界是 **02③ 真实 Home 重建**，不看 U1 合没合入（统筹 2026-11-04 定）：

- **重建之前落**：直接改第 1 版的建表，不写迁移。
- **重建之后落**：真实 Home 已经按第 1 版建了表，不能再原地改第 1 版，只能走 U1 的升级链写一步升级，并过金样回放（U2）。写这一步算「新增迁移逻辑」，是红线：开 PR 之前由统筹先问用户。

不加读取兼容。开 PR 时先核 02③ 做完没有。

## 9. PR 怎么拆

按轨道规则 1，合同单独先开小 PR，服务接着，消费者最后。

| 片 | 内容 | 前置 |
| --- | --- | --- |
| C-1 资料与目录合同 | `platform/project-materials.ts`；`modules/projects` 的 `ProjectDirectory`、`ProjectDirectories`、`RunDirectories`，第 3 节的五个动作与 `materials.recent@1` 的声明；`assertMaterialRef`；api、actions 快照 | 02 交接；与 U1 共用 storage 的部分排在 U1 之后 |
| C-2 呈现声明合同 | `platform/presentation.ts`、Manifest 的 `presentation` 字段、values 的类型与 define/bind；`validatePresentationDeclaration`、`presentationText`、`presentationFormFields`、`renderPresentationForm` 的签名；api 快照 | 02 交接；D 轨把状态环取值下沉到 contracts 的 `platform/ui.ts` 之后 |
| C-3 组合服务合同 | `services/surface-composition.ts`、`surfaces.compose@1`、`surfaces.correct@1` 的声明；`assertSurfaceDescription`；actions 快照 | C-2 |
| 实现 | 组合服务包（第 15 批）；`modules/projects` 的服务与界面接线（WMD 的实施切片）；Goals、Inbox、Coding 的第一片声明 | C-1～C-3 合入 |

## 10. D 轨的答复（2026-11-04 共审）

1. **插件色：平台分配，Manifest 不声明。** 分配结果要稳定：同一个插件换设备、重装后颜色不变；色盘够用时，两个已装的插件不撞色。色盘和状态色分开，由 D 轨在 design-system 里定，浅色和深色都要分得清（IUI-26）。合同只给 `owner_plugin_id`，不加颜色字段；是记在安装记录上，还是按 id 确定地算，D 轨做色盘时再定，两种都不用改本合同。
2. **字段角色：四种形态够画，「行」缺一个角色。** 已加 `activity`（第 5 节），一共 16 个；行的第二行固定读 `actor`、`activity` 和时间。其余不加。
3. **第一片的位置：同意插件内、对话、项目讨论、等你四处**，首页和 Shelf 进第二片。另外，MLN-23 不经 `surfaces.compose`，直接按声明画「行」（第 5 节、第 7 节）。
4. **`surfaces.compose` 第一片只给 user 和 plugin：同意。** 外部 Agent 走 `presentationText`。

## 11. 验收编号（候选）

实现时测试名或注释写出这些编号。

| 编号 | 要达到的结果 | 对应 |
| --- | --- | --- |
| SSC-01 | 本机文件、导入文件、插件对象在选择器、引用、出处里用同一个 `MaterialRef`；当前、固定、快照三种 pin 分得清 | WMD-01、WMD-04 |
| SSC-02 | 出处现读：撤权、删除、文件夹失效以后，旧引用分别显示「没有权限查看」「已删除」「找不到位置」，不用缓存的正文 | WMD-05、WMD-06、IUI-10 |
| SSC-03 | 项目恰好有一个输出目录；同一个文件夹只关联一次，可以同时是输入和输出；改配置按 `expected_revision` 提交，冲突时被拒 | WMD-02、WMD-07、WMD-08 |
| SSC-04 | 正在跑的轮次照冻结的 `RunDirectories` 做；撤权或移除目录后，下一次读、写、执行马上被拒，且不写业务记录 | WMD-09、WMD-11 |
| SSC-05 | 浏览位置不进任何合同；临时查看输入目录不改执行位置，也不获得写入权限 | WMD-11、CHO-36～39 |
| SSC-06 | 呈现声明不合法时安装被拒，并说出是哪一项；内置、生成、第三方插件走同一个 `validatePresentationDeclaration` | IUI-01、IUI-22 |
| SSC-07 | `surfaces.compose` 的确定组合不调模型，同样输入得到同样的 revision；描述里只有引用，值由主人现给 | IUI-04、IUI-09 |
| SSC-08 | 描述里的每个操作都是已注册动作或通用操作；点下去时走动作网关，用当时的授权；撤权以后点击不写任何业务记录 | IUI-07、IUI-08 |
| SSC-09 | 插件只在自己声明的挂载位上出现别人的东西；没有声明挂载位的插件，什么都不放 | IUI-13 |
| SSC-10 | `assertSurfaceDescription` 丢掉候选以外的对象和操作并记下；不合格时退回确定组合 | IUI-05（第三片才用到） |
| SSC-11 | 呈现声明里的 `attention` 只改色点和状态标签，不产生等你条目；等你列表只来自 attention-resumption | D 轨共审 2026-11-04 |
| SSC-12 | 「最近用过」由引用发生处记、`materials.recent@1` 按调用方和项目读，最多 5 份显示，出处现读；被拒或取消的调用不记 | WMD-01、WMD-05 |
| SSC-13 | 主人读不到时 `PresentationValues` 给 `stale` 和 `read_at`，界面写「x 分钟前的值」，不当成当前值 | IUI-10 |
| SSC-14 | 不经组合服务，按声明和 `PresentationValues` 单独画出「行」（MLN-23），与组合服务画出的同一形态一致 | MLN-23、IUI-03 |
