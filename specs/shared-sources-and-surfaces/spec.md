# 公共来源与呈现合同（路线书 05 ②）

状态：现行规范（2026-11-13）；C-1、C-2、C-3、目录实现、组合服务与呈现组件已合入：C-1（#1894）、C-2/C-3 与 05② 目录实现随路线书第 05 批 #1979 于 2026-11-08 合入 main `500d868df3`，组合服务与呈现组件随第 15 批 #2017 于 2026-11-13 合入 `b819373250`；后续「接着做」与助理组合分别归第 21／28、64 批。合同归 C 轨，呈现组件归 D 轨，这一份是共同设计；D 轨 2026-11-04 共审，四处要改的已改进稿子，§10 的四问已答（见第 10 节）。2026-11-06 按第 05 批核账勘误（动作版本、事件位置、Manifest 快照、C-1 与 U1 的先后），并按用户同日的决定改了第 8、9 节：真实 Home 重建不等 C-1，动表的部分走升级段。2026-11-07 统筹定 C-1 只加不删（第 9 节），用户定默认输出目录的快照和永久删除，以及另一台设备上的引用加「指定文件夹」、接受脱钩之前目录行还剩的静默读（第 3 节）。2026-11-04 收进第 06 批核账（#1805）列的七处缺口（第 3、4、8、9 节）、第 15 批评审里收下的五项（#1798，第 5、6 节）和 D 轨定的两个字段角色。C-1 已合入（[#1894](https://github.com/molis-ai/molis-work/pull/1894)，`91f820f55`），合审留下的事见第 9 节；03、04 定样已全部合入，统一起点已登记（#1914）。2026-11-08 状态环取值已下沉到 contracts 的 `platform/ui`（随 C-2，用户同意，D 轨事后审）；C-2、C-3 的合同和 SDK 的共用校验在同一个分支、同一个 PR 里写完并随 #1979 合入（用户 11-08 定本批只开一个大 PR），没设临时拒绝；用到第 14 批 T4 文字工具的部分单独一个提交，在 14 批合入后统一编译（第 7、9 节）。同日统筹定：`mounts` 并进 `slots`，挂载位就是带 `accepts_forms` 的 slot（第 5 节）；`renderPresentationForm` 和 SSC-14 移到第 15 批第 2 项；目录实现片排在 C-2、C-3 之后，升级段随 U1 和四份门禁一起落地（第 9 节）；组合服务的实现在[第 15 批](../post-anticorruption-roadmap/reference/batches/15.md)。2026-11-08 用户看实物定了目录实现片和指定文件夹片的定样：永久删除时问删还是留选 A3「选项就是确认」，指定文件夹选 B1「就地指定」（第 3 节「定样」，原型在 [`docs/design/05-materials-directories/`](../../docs/design/05-materials-directories/README.md)）。

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

这两条定样记录在仓库里：[资料／目录／工作台](../../docs/design/workbench-shared-paths/README.md)（按来源分组加「最近用过」）与[智能呈现四种基础形态](../../docs/design/intelligent-surfaces-forms/README.md)（方案 B「插件领头」），2026-11-05 按组件板实件重做过（[#1792](https://github.com/molis-ai/molis-work/pull/1792)）。

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
  directory?: { workspace_id: string; display_name: string; roles: DirectoryRole[] };  // source 为 directory 时有；unmapped 没有；missing 在这个项目已经没有这一行时没有（目录实现片改 schema，第 9 节）
  /** unmapped：id 不是这个项目的目录，也没有指定对应的文件夹。可能来自另一台设备，也可能是这台设备上被换掉的目录（第 3 节）。只用于 source 为 directory。 */
  state: "ok" | "changed" | "missing" | "forbidden" | "truncated" | "unreadable" | "unmapped";
  note?: string;  // 例如「只读了前 20 页」「.key 读不了正文，原件还在」
}

/** 「最近用过」的一行：记下的引用，加这次现读的出处（第 2.1 节）。 */
interface RecentMaterial {
  ref: MaterialRef;
  origin: MaterialOrigin;
}
```

- **为什么要三种 pin**：WMD-04 要求当前文件更新可见，固定的快照和选区不变。成果是固定版本；Files 现在的集合、前后快照和选区都是过程项（WMD §6）。两种固定的东西主人不同，所以分开写。
- **不另起身份**：本机文件、导入文件和插件对象都用 `ActionSubject`。knowledge 的 `KnowledgePieceName`、search 的 `SearchEntry.subject` 已经是这个形状。
- **出处现读，不存**：存在对话或任务里的只有 `MaterialRef`。显示出处时由平台现查，所以撤权以后显示「没有权限查看」，删除以后显示「已删除」，不会拿旧缓存绕过授权（WMD 第 5 节）。
- **校验**：`assertMaterialRef` 放进 SDK（第 7 节），平台和作者用同一份。
- **本机文件的 `read_revision` 是内容指纹（合同台定）**：`fingerprint` 就是文件字节的 sha256 十六进制，文本读和 `bytes` 读算出来一样（`workspace-files.ts:66,71`），`knowledge.read` 的 `revision` 现在也是它（`horizontal/knowledge/src/workspace.ts:73`）。不用路径，也不用修改时间。`assertMaterialRef` 对 `workspace_file` 查格式：64 位十六进制，或 `size:<字节数>`；不查的话，Files 侧栏的 `revision: id`（`plugins/native/files/src/actions.ts:99`，就是 id 本身）抄过来也能过，那样永远比不出变化。这条改 C-1 的注释和 `assertMaterialRef`。

  | 件 | 定法 |
  | --- | --- |
  | 写引用的人怎么得到它 | 读到内容的取 `fingerprint`。文本读回答 `too-large` 的写 `size:<字节数>`。文本读回答 `binary` 或解码失败的 `unsupported` 时内容已经读了（`workspace-files.ts:67,70`），实现片让这两种结果也带 `fingerprint`（`workspace-artifacts.ts:27`），不多花一次读；不是普通文件的 `unsupported`（`:49`）没有内容，也写不成引用 |
  | 平台现读怎么比 | **先核调用方能不能读，核过才开文件**：和读动作同样的判断（`horizontal/knowledge/src/workspace.ts:79-84`），否则 `ok` 和 `changed` 的差别就是绕过授权的旁路。之后不走读动作：文本读只到 256 KB，`bytes` 动作只给宿主运行的插件（`project-capabilities.ts:43`）。宿主工作区服务多一个内部函数 `fingerprintWorkspaceFile`，检查和 `readWorkspaceFile` 相同（根目录的 realpath、逐段 `lstat`、`O_NOFOLLOW`），边读边算，不进内存，不转 base64，上限 8 MB。引用是十六进制时：不一样是 `changed`；现在超过 8 MB 也是 `changed`，因为写引用时没超。引用是 `size:` 时只比 `lstat` 的大小 |
  | 一次算几份 | 上限放在共用的 `readMaterialOrigins(caller, refs, { compare })` 里，不放在某个动作上：一次只比前 5 份的内容（调用方排好序，最坏读 40 MB），其余只查文件在不在，`note` 写「内容没有核对」。打开时读文件本身就比了。比较有总时限 1 秒，超时不再等，没比完的同样写 `note`，这样网络盘或没下载的 iCloud 文件不会让面板等着。已经发出的读取停不下来，卡住时反复打开面板会占住线程池，所以同一个文件有读取在途时不重复发。这个数、线程池和慢盘的情况都没实测。不加缓存：这台机器上 5 个 8 MB 算 sha256 约 12 毫秒，加上从系统缓存读约 20 毫秒 |
  | 谁用它 | `materials.recent@1` 比内容。`materials.recent.record@1` 不比（`compare: false`）：它要分的 `forbidden`、`missing`、`unmapped` 都用不到内容，一次 10 个也不多读，而且它在提交之后的路上。引用、出处行和 Goals 输入也要出处，C-1 只声明了 `materials.recent@1` 回 `origin`，所以实现片要加一个读出处的动作，见下面 |
  | 只到界面 | 上面的比较都是给人看的出处。**Agent 读文件不比指纹**：`knowledge.read` 没有比较的参数，只回当前 revision（`horizontal/knowledge/src/workspace.ts:73`），`goals.inputs.list` 也不回指纹（`input-actions.ts:17`）。不改这一点（合同台定）：指纹给了 Agent 也要靠它自己比，比没比没有人知道，算不上保证 |

  它分不出是这份文件后来改过，还是另一份文件，所以只说「和引用时不是同一份」。

  **读出处的动作 `materials.origins@1`**（query，`system.project-workspaces` 提供，受众 user、plugin，`scheduling: "concurrent"`；合同台 11-08 第二十一、二十二轮定）。输入 `{ items }`，1 到 20 项，每项是完整引用 `{ ref }`，或没有指纹时只给对象 `{ subject }`；输出同样条数、同样顺序的 `{ origin: MaterialOrigin | null }`。行为都在宿主的 `readMaterialOrigins(caller, items, { compare })`（`apps/local-host/src/material-origins.ts`），`materials.recent@1` 和 `materials.recent.record@1` 用的也是它：

  - **先查授权，再碰东西。** 本机文件先看调用方此刻能不能调读文件的动作和 `projects.directories.get`，不能就不打开文件：给 user 是 `forbidden`（不带 `directory`），给 plugin 是 null。
  - **对象的主人按动作目录里的对象读取器找**（`findSubjectReader`，和 `resolveActionSubject`、`knowledge.read` 同一套查法；合同台第二十二轮）。只有一个可用的：以调用方身份调它，读到了比 `revision`，被拒按错误类别给 `missing`、`forbidden` 或 `unreadable`。声明了但现在不可用的（停用、没有授权）：给 user 是 `forbidden`，`owner` 照给，读取器不调；给 plugin 是 null。不止一个可用的、一个都没有的（卸载了），以及只有 MCP 提供的：两边都是 null，平台不替人挑。主人取自读取器的提供方：插件给 `plugin_id` 和它的名字，系统给提供方 id。成果库的对象（`artifact`）记作 `import`，其余记作 `object`。
  - **给 plugin**：`forbidden`、`missing` 一律是 null，形状相同，分不出没有权限还是已删除；`unmapped` 照回（不泄露什么）。插件页面只显示一句「现在读不到这份资料」，分原因由工作台以用户身份现读时显示。
  - **比较**：只比前 5 个带 `current` pin 的本机文件（`size:` 只比大小，不算在 5 个里）；第 6 个起，和超过 1 秒总时限没做完的，写「内容没有核对」。对象每项调一次读取器，也算在这 1 秒里，超时的是 `unreadable` 加同一句 `note`。时限过了就不再发新的读取；同一个文件的读取在途时不重发。`{ subject }` 项只查在不在，永远不是 `changed`，写「内容没有核对」。`fixed`、`snapshot` 只查那个版本还在不在，不写 `note`。
  - `workspace_file` 解析不出（这个项目没有这个目录，也没有为它指定文件夹）是 `unmapped`，带 `owner`、不带 `directory`；id 是这个项目自己的默认输出目录写「这个项目原来的默认输出目录」，是别的默认输出目录写「另一台设备的默认输出目录」。
  - 只读：不写记录，不走 `beforeEffect`；调用取消了就什么也不返回。验收见 SSC-30。
- **引用不因为换设备而变**（第 3 节「另一台设备上的引用」）：`subject.id` 写的是原设备的目录 id，对应关系在读的时候换算，不改写引用。这样同步回原设备照样能读，换一次对应，这个目录的引用一起跟着走。所以 `MaterialRef` 不加字段；要改的是 `MaterialOrigin`，多一个 `unmapped`。

### 2.1 最近用过

03 第一块定的资料面板按来源分组，最上面一节「最近用过」：跨来源，最多 5 份，每行写出处。这份记录的主人是 `modules/projects`，工作台不在页面里自己攒：

- **记在哪**：`modules/projects` 自己的一张表 `material_recent_uses`，在项目库里，`tooling/gates/table-owners.json` 记为 `modules/projects` 独占。它只是「最近用过」的列表，和观测采集层的「完整工作记录」（GLOSSARY）不是一回事，不叫工作记录。
- **谁写**：引用发生的地方写，插件和平台走同一个写动作 `materials.recent.record@1`（command，`modules/projects` 提供，受众 user、plugin）。加入任务、在对话或文档里引用、从面板打开一份资料，都在自己的事提交成功之后调它；Pages、IM、Coding 这些发生在插件里的，也用这个动作，不 import Module，不开私路。
  - 输入只有 `refs: MaterialRef[]`（一次最多 10 个）。调用方和项目从调用上下文取，不从输入读。
  - 平台先用调用方此刻的授权现读每个引用的出处（不算指纹，第 2 节），读不了的（`forbidden`、`missing`、`unmapped`）不记、也不说明是哪一个，所以既不能替别人种记录，也不能借它探测别人的对象。
  - 只记引用，不记正文。被拒、取消、撤权的调用照 AGENTS 的规矩不写。
- **谁读**：只读动作 `materials.recent@1`（query，`modules/projects` 提供，受众 user、plugin）。按调用方和项目返回 `{ items: RecentMaterial[] }`，新的在前，最多 20 份，面板取前 5 份。`ref` 是记下的引用，`origin` 是这次读的时候照第 2 节现读的出处，不存。
  - **给 user**：读不到的项照样返回，由出处的 `state` 说明（「没有权限查看」「已删除」「找不到位置」「未指定文件夹」），让本人知道那份资料还在不在。
  - **给 plugin**：只返回调用方此刻读得了的项；`forbidden`、`missing`、`unmapped` 的项连 `subject` 都不给，也不给件数。插件拿到别的插件对象或本机文件的 `subject`，本身就是泄露（和第 6 节 `excluded` 同一条理由）。
- **生命周期**：
  - 每个调用方在每个项目里留 20 份，写入时在同一个事务里删掉最旧的。
  - 主人插件停用或卸载后记录不改写；读的时候出处按第 2 节现读。停用时是 `forbidden`，给 user 显示「没有权限查看」；卸载了或不止一个插件声明这种对象时 `origin` 是 null，给 user 显示「现在没有插件能打开这份资料」；给 plugin 都不返回（统筹 11-08 定，合同台第二十二轮）。
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
  state: "ok" | "missing";
}

interface ProjectDirectories {
  project_id: string;
  /** 恰好一项带 output。没有本机输入的项目也有，默认位置见下面「默认输出目录怎么存」（WMD-03）；同步来的项目同样，见下。 */
  directories: ProjectDirectory[];
  /** 另一台设备的目录在这台设备上对应哪个文件夹。只在本机，不同步（第 3 节）。 */
  source_links: { source_workspace_id: string; workspace_id: string }[];
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
| `projects.directories.set_output@1` | 设或改输出目录，也可以把一个输入设为输出，或设回默认位置。不搬移、不删除、不覆盖旧文件（WMD-09） | user |
| `projects.directories.repair@1` | 文件夹换了位置以后，重新找到它 | user |
| `projects.directories.map_source@1` | 把另一台设备的一个目录对应到本机的文件夹；已有对应就换掉 | user，并要用户在界面上确认 |
| `projects.directories.unmap_source@1` | 取消对应，文件夹还是这个项目的目录，磁盘上的文件不动 | user |

`set_output`、`map_source` 的目标写法一样，三选一（合同台定）：

```ts
type DirectoryTarget =
  | { workspace_id: string }       // 这个项目已有的目录
  | { workspace_path: string }     // 本机路径，走 add_input 的校验
  | { default_output: true };      // 这个项目的默认输出目录，不带路径，文件夹没建也可以

// set_output@1：  DirectoryTarget & { expected_revision: string }
// map_source@1：  { source_workspace_id: string } & DirectoryTarget & { expected_revision: string }
// unmap_source@1：{ source_workspace_id: string; expected_revision: string }
```

schema 是 `closedInput` 加 `oneOf: [{ required: ["workspace_id"] }, { required: ["workspace_path"] }, { required: ["default_output"] }]`，`default_output` 是 `{ const: true }`。

- 现有的 `projects.workspaces.add@1`、`projects.workspaces.repair@1` 并进上表的 `add_input`、`repair`，`projects.workspaces.unlink@1` 并进 `remove_input`，旧名不留（N35）；`is_default` 删掉（第 8 节）。这些删除都在实现片，同一次切换里改完调用方，那一片的 PR 写明对调用方的影响。C-1 只加不删，现有调用方不受影响：新动作在 C-1 只有声明，宿主还没登记，调用不到，所以不是两种写法并存。
- **默认输出目录是真实的一行**：没有本机输入的项目也有输出目录（WMD-03）。它是 `workspaces` 里真实的一行，`modules/projects` 在建项目时写入；已有项目由升级段补上（第 8 节），回收站里的项目也补，否则恢复后没有输出目录。这一行不存路径，文件夹第一次要用时才建（下面「默认输出目录怎么存」）。所以「恰好一项带 output」和 `RunDirectories.output` 永远有东西可指。
- **同步来的项目也走这一步，不用首次读取时再建。** 同步的内容里确实没有目录（`portable-project.ts` 只投影 id、标题、时间和插件清单，本机路径不同步，这条不变），但本机这一行项目记录不是同步写的：`personal-catalog-sync.ts:23` 的 `prepare` 先经 `ensureSyncedProject` → `ManagedProjectFiles.createProject(input, true)` → `lifecycle.register(record, "project.sync_prepared")` 建好，`apply` 只更新已有的行（没有就拒绝）。个人空间、演示项目、绑定运行上下文时建的项目也都经 `register`（`modules/projects/src/project-service.ts:68`）。所以默认输出目录写在 `register` 这一处的事务里，已有 output 就不动，建项目的路都覆盖到。不在读取时建：`projects.directories.get@1` 是查询，查询不写。跨空间复制目前只有回执和内容接口（`project-copy-journal.ts`、`runtime-project-copy.ts`），没有建目标项目的入口；将来有了也要经 `register`。
- 结果是**每台设备各有各的输出目录**：在 A 设备上改的输出位置不跟到 B 设备，B 设备上是默认位置。这和 #1877 已有的「本机路径不同步」一致，用户不用多做什么，建项目时也没有多一步。
- **文件不跟过去，引用可以接回来（用户 2026-11-07 定）。** 输出目录里的文件不同步。同步内容里的 `workspace_file` 引用到另一台设备上显示「未指定文件夹」，用户指定本机的哪个文件夹对应那个目录，见下面「另一台设备上的引用」。
- 改配置只影响以后的轮次；正在跑的轮次照它开始时的位置继续（第 4 节）。
- 各插件读同一份配置，不存自己的覆盖值（WMD-07）。

**默认输出目录怎么存**（合同台定）。和项目库同一个规则：目录库不存路径，由可信 Home 和 `project_id` 推导（S-102、W5-17）。这样 Home 整体拷到别处之后，这一行指的是新 Home，不会写回原来的 Home，副本演练（UPG-12）也碰不到正在用的 Home。

| 件 | 定法 |
| --- | --- |
| 位置 | `<Home>/outputs/<project_id>/`，账号 Home 各有一份。不放 `projects/<id>/` 下：快照会走进去，碰到符号链接或 SQLite 文件就拒绝整份（`home-snapshot-inventory.ts:89,108`），Coding 默认在输出目录工作，这两样都常见；永久删除时那个目录也是整个搬走的，留不下文件 |
| 存什么 | `workspace_id` 是 `workspace-output-<哈希前 24 位十六进制>`，哈希是 `sha256(project_id + "\0" + 这个项目最早一条 project_events 的 event_id)`，「最早」按 `created_at` 再按写入先后（`rowid`）排；这一行写下以后 id 以写下的为准，不再重算；`canonical_path` 是 `project-output:<project_id>`，`realpath_verified` 存 0，`display_name` 是占位的 `project-output`。用户自己选的目录照旧存绝对路径，新发 id。**两台设备上 id 必须不同，所以带上事件 id：** 事件 id 是每台设备建项目时各自随机发的，不同步（`portable-project.ts` 只投影 id、标题、时间和插件清单），`register` 在同一个事务里写第一条，所以每个项目都有；Home 整体拷到别处时跟着走，id 不变。id 相同的话，另一台设备上同路径的同名文件会被静默读到（下面「另一台设备上的引用」）。不直接随机，因为升级段不许随机（U1 §8.1）。id 也不能直接带 `project_id`：它可以含 `:`（`platform/placement.ts:22`），而 `parseWorkspaceFileSubjectId` 按第一个冒号切（`workspace-artifacts.ts:299`）；编码也不行，同步收的 id 最长 200 字符（`portable-project.ts:17`），编码后超过目录 id 200 字符的上限（C-1 的 `folderId`） |
| 读 | 读这一列的只有 `workspace-repository.ts`，在那里把这种写法换成 `realpathSync.native(Home)/outputs/<project_id>`，`realpath_verified` 给 true（存 0：这个文件有几条查询，漏换一条时 `project-output:<id>` 也进不了 `agent-host-composition.ts:260` 的授权目录），`display_name` 给「默认输出目录」（中文原文，界面用 `L()` 翻译，文案随定样）。下游和合同拿到的还是绝对路径，公开合同不变。`<project_id>` 过 `projectDirectoryPath`，这一行的关联只许是这个项目，否则 `catalog.project_storage_invalid` |
| 按路径写或查 | 绝对路径到行的换算也只在 `workspace-repository.ts` 一处，见下面「路径到行」 |
| 碰磁盘之前 | `project-paths.ts` 放两个函数，规则相同：id 过 `projectDirectoryPath`，逐级 `lstat` `outputs` 和 `<id>`，碰到符号链接或不是目录就拒绝（`catalog.project_storage_invalid`），最后核 realpath。一个只核，文件夹不在时回答「还没建」；一个核后建。`ProjectsModule` 把它们包成 `prepareWorkspaceDirectory(workspace_id, "read" \| "write")`，用户自己选的目录什么也不做。**拿这一行碰磁盘的地方都先过它：要写或要起进程的用 `write`，只读的用 `read`**，名单在下面「碰磁盘的调用方」。建项目、升级段、查询都不用 `write` |
| 文件夹还没建 | 不算 `missing`，`state` 是 `ok`，列目录读到空 |
| `repair` | 这一行不会是 `missing`，现有规则就不允许，不用另写。别的目录修到 `outputs/` 里，见下面「路径到行」 |
| 改了输出目录 | 这一行没有关联了就删掉，文件留在原处（WMD-09）。这里的旧引用因此变成 `unmapped`，这是同一台设备上最常见的来路，界面写法见「另一台设备的文件夹名字」那一行，设回默认位置或指定到 `default_output` 就接回来。设回默认位置用 `set_output` 的 `default_output: true`，不带路径：这时行已经没了，调用方手里没有 id，文件夹可能从没建过，路径也核实不了。服务按 `project_id` 和最早的事件算回同样的 id，写回这一行，不要求文件夹存在。时钟回拨才可能算出另一个 id，后果是旧引用回到未指定，可以重新指定 |
| 登记 | `homeStores()` 加 `{ path: "outputs", snapshot: omittedSnapshot("…", "preserve") }`，owner `modules/projects`。`uninstall --purge-user-data` 随之清除 |
| `HOME-DATA.md` 加一行 | `outputs/<project_id>/`：`modules/projects`；项目的默认输出目录，用户和 Agent 的产物，普通文件，无版本；不进快照，恢复不动；永久删除项目时按人的选择删或留，没问过的都留；purge 清除，含留下来的 |

**路径到行**（合同台定）。上表只说了从行到路径，反方向也要定。终端、Coding、MCP 的工作目录都按路径写目录库：`plugin-terminal-service.ts:85-88` → `plugin-terminal-panels.ts:115` → `project-catalog.ts:420` → `project-binding-commands.ts:171,180` → `workspace.ts:120`。新项目的终端默认就开在默认输出目录，不定的话第一次开终端就发一个新 id，把绝对路径写进目录库：同一个文件夹两行，Home 拷到别处之后这一行还指着原 Home。

所有按路径写或查的都走这一处：`add_input`、`set_output`、`repair`、`map_source`、`addWorkspaceProject`（`system-agent-service.ts:53`、`web-onboarding.ts:99`）、运行上下文绑定、按路径解析（`project-resolution.ts:43`、`project-binding-commands.ts:122`、`project-setup.ts:52`）。路径先过 `realpathSync.native`，再和 `realpathSync.native(Home)/outputs` 比（`workspace.ts:26` 用的也是它，`realpathSync` 不归一大小写）：

| 路径 | 查 | 用户明确要关联（`add_input`、`set_output`、`map_source`、`workspace_member`） | 运行上下文绑定（`session`） |
| --- | --- | --- | --- |
| 不在 `outputs/` 下 | 按 `canonical_path` | 和别的目录一样 | 和别的目录一样 |
| 正好是 `outputs/<id>` | 这一行；没有这一行就是没有 | 是这个项目的：认回，这一行没了就按同样的 id 再写。别的项目的：拒绝，`projects.directory_duplicate`（否则那个项目删除时，文件会被一起删掉） | 是这个项目的：认回。别的项目的：只绑会话 |
| `outputs/` 里别的位置（子目录、`outputs` 本身） | 没有行 | 拒绝，`projects.directory_duplicate` | 只绑会话，不写目录行 |

- `repair` 修到 `outputs/` 里（后两行）一律拒绝，`projects.directory_duplicate`，否则下面那道守卫不写表，动作却报成功。
- 文件夹没建时路径核实不了，第二行走不到；要用默认位置，给 `default_output: true`。
- 运行上下文绑定不能拒绝，否则终端开不了：`directory.path` 可以让工作目录落在子目录。这种会话靠会话绑定，新会话按路径解析不到项目，和用户自己选的目录的子目录一样。
- `upsertWorkspace` 是写这张表的唯一一处，这里再守一次：路径落在 `outputs/` 里就不写这张表，只写关联。它的 `ON CONFLICT` 会更新 `canonical_path`，读出来的绝对路径再传回来就写回库了。
- 首次使用页选的文件夹加进项目时就是**输出**（输出也能读），Agent 和 Coding 在那里干活，建项目时写下的默认输出目录那一行随之去掉（文件夹从没建过）；没选文件夹的照旧用默认输出目录。和升级段「只关联一个的设成输出」同一条思路（用户 2026-11-08 定）。`addWorkspaceProject` 只剩写手目录以外的可信入口，加为输入。
- Coding 的独立工作树**不写成目录行**：开轮时把这一轮的 `RunDirectories.execution` 冻结成工作树，由 agent-host 放行这一轮的工作树（统筹 2026-11-08 定方案 A；按路径认工作树等于在授权里另开一条私路）。
- 还没有行的路径没有目录 id。`runtimeContextPersistenceId` 的 `workspace-request:` 键（`project-binding-validation.ts:51`）这时用路径哈希，只作请求键，不作目录 id。

**碰磁盘的调用方。** 按 `canonical_path` 的消费者列，不按 C 表：C 表只列隐含取一个目录的地方，显式带 `workspace_id` 的不在里面。这是读代码列的，实现片开工时再查一遍。

| 调用方 | 用 | 文件夹没建时 |
| --- | --- | --- |
| 终端 `plugin-terminal-service.ts:292` | `write` | 建好再开。不建会报「终端工作目录不存在」 |
| Character `character-native-execution.ts:80` | `write` | 建好再启动。不建 `realpathSync` 抛 ENOENT |
| Agent 的轮次和会话（Coding `start-round.ts:143`、`routes-sessions.ts:238`、`routes-setup.ts:53,77`，`plugin-agent-service.ts:65`） | `write` | 建好再起进程。放在真正开始的路上：`horizontal/agent-host/src/index.ts:117,286` 核完 `authorizedDirectories` 之后，经 `AgentStartAuthority` 多一个宿主给的端口调，插件不碰。不放在 `startAuthority` 里：只是列动作也调它（`agent-host-composition.ts:190`），那样查询也建文件夹。stdio 连接器 `library-actions.ts:31` 同样在核完之后 |
| Git 读 `workspace-git.ts:28,93`、`project-capabilities.ts:33` | `read` | 回答「不是仓库」，不起 git。现在是 `spawn git ENOENT`，`project-capabilities.ts:34` 的正则认不出来，面板显示错误 |
| Git 写（`workspace-git-{operations,writers,index,integration,worktrees}.ts`） | `read` | 同上。没有仓库本来就写不了，不用建 |
| Files `workspace-files.ts:19` | `read` | `directory` 读到空，`text`、`bytes` 回答 `missing`。现在根目录不在一律 `missing`，和「列目录读到空」不符 |
| 按引用打开 `artifact-actions.ts:74` | `read` | 找不到 |

符号链接也靠这一步：终端和 Git 会跟过去，只有 `workspace-files.ts:22` 拒绝。只比路径、不碰磁盘的不用过（`review-settlement-events.ts:39`、`project-arrival-http.ts:102`、`coding/src/executor.ts:81`）。

这些都在实现片。代价：`canonical_path` 有两种写法，由 `workspace-repository.ts` 一处认；`normalizeProjectWorkspace` 本来就拒绝非绝对路径（`modules/projects/src/workspace.ts:22`），不用改；`ProjectsModule` 多收一个 `outputs_directory`，和 `projects_directory` 同样由宿主给（生产 3 处）。不走「存绝对路径、拷贝和恢复时改写」：那是新的迁移逻辑。

**用户定的三点（用户 2026-11-07 定）。**

| 问题 | 定了 | 否掉的方案和理由 |
| --- | --- | --- |
| Home 快照带不带这些文件 | **不带。** 快照小而稳，`node_modules` 的链接、测试用的 `.sqlite` 不会让快照失败，和用户自己选的目录一样。恢复不把这些文件带回当时的样子，换机器要自己拷；旧引用显示「找不到位置」；快照之后新建的项目，恢复后文件夹留在原处，没有项目指它 | 带，跳过链接、SQLite 和 `node_modules` 这类：要给快照加「跳过」的新规则，现在是碰到就拒绝；体积随产物涨；恢复出来的代码目录是残的。全带：要放开「快照不跟随链接」「未知 SQLite 拒绝」两条现行检查，正在写的 `.sqlite` 拷出来可能是坏的，一个大仓库就让快照涨几个 GB |
| 永久删除项目时这些文件删不删 | **非空时问一句；放进回收站时都不动。** MCP、CLI 没有对话框，只能留着 | 一起删：不能撤销，Coding 默认在这里工作，未提交的代码也会没。留着：文件夹以编号命名，磁盘只涨不减，人在要删的时候没有机会选 |
| 另一台设备上的引用 | **加「指定文件夹」，** 用户把引用对应到本机的文件夹，做法在下面。要新动作和定样，实现片变大 | 说清楚，不加操作：不用新动作和定样，但用户自己选的目录的引用在另一台设备上永远接不回来，只能显示找不到；同名文件也只能靠指纹提示 |

**永久删除怎么做。**

| 件 | 定法 |
| --- | --- |
| 谁问 | 只有设置页的删除确认框。打开时 `delete-scope`（`web-project-deletion.ts:48`）多回一项 `default_output`：`empty`、`has_files` 或 `unknown`，只看 `readdir` 有没有一项，不数不走。过不了上面的符号链接检查的是 `unknown` |
| 确认框 | `has_files` 时多问一句，删还是留，不给默认选中：删了不能撤销。`empty`、`unknown` 不问，都按留。这是新状态，连同留下文件夹之后的提示，用户 2026-11-08 看实物定了 A3「选项就是确认」（下面「定样」）。现在那句「关联工作目录中的代码和文件会保留」对用户自己选的目录仍然成立 |
| 选择怎么传 | `DeleteProjectInput` 多一个 `output_files?: "keep" \| "delete"`，缺省是 `keep`。**和操作者一样由入口给：** 设置页的路由从请求里读并校验，别的值 400；MCP（`mcp-server.ts:114`、`mcp-context-gateway.ts:99`）、示例项目的删除（`removeDemoThroughService`、`demo remove`）和卸载（`local-uninstall.ts:31`）写死 `keep`，写在展开请求之后，不从请求读。MCP 工具的 schema 不加这个字段，所以 Agent 删不了这些文件。MCP 的 `project_delete` 说明写明文件留在原处 |
| 选择怎么记 | 选了删，收据里多一步 `project-output`，失败重试、换进程都还在；选了留，没有这一步，不用改表。`request_fingerprint` 选了删才带 `output_files`，留的写法和现在一样，同一个键换了选择按 `deletion_idempotency_conflict` 拒绝 |
| 不登记成 owner | 由 `ManagedProjectDeletion.runCleanup` 自己执行这一步，不进 `homeProjectOwners`：示例项目重建的 `clearAll`（`demo-project-lifecycle.ts:46,101`）会跑所有 owner，登记了就会删掉人没选删的文件 |
| 这一步做什么 | 目录库提交之后才做，提交失败什么也没碰。先过和读、建同样的检查：id 过 `projectDirectoryPath`，逐级 `lstat` `outputs` 和 `<id>`，碰到符号链接或不是目录**不删**，记失败，留着重试（`outputs` 是符号链接时，`fs.rm(join(home, "outputs", id))` 删的是 Home 外的目录，评审台实测）。`<id>` 不在算完成。然后 `fs.rm` 递归删除，里面的符号链接只删链接本身，目标还在（实测） |
| 选了删时还查什么 | 项目还有运行或排队的任务就拒绝（`isProjectBusy`，`catalog.project_task_live`），放在 `releaseProject` 之前。现在永久删除只查终端，别的进程还在写的话文件删不干净 |
| 确认框打开之后又有了文件 | 打开时是空的、提交前有了文件：没问过，按留，不丢东西。打开时非空、选了删：一起删 |

**这一问只出现在根 Home。** 账号 Home 上 `deleteProject` 直接拒绝（`project-deletion-service.ts:73`，判断的是存储空间的种类），项目只能进回收站，文件一直留到 purge。

**留下来的文件夹（已知后果）。** 文件夹还在 `<Home>/outputs/<project_id>/`，以编号命名，界面上再也找不到。

- **谁能找到：** 只有删除那一刻和在文件管理器里翻的人。`ProjectDeletionResult` 多一个 `kept_output_directory`（有文件留下时是绝对路径，不存库），设置页显示出来，MCP 的返回里也有，Agent 可以转告。之后只能到 Home 下按编号找，编号对应的项目名在收据 `project_deletions` 里，没有界面读它。
- **purge：** `uninstall --purge-user-data` 把 `outputs` 整个清掉，含留下来的。不带 purge 的卸载不动。
- **快照和恢复：** 快照不带，恢复不动。恢复出一个已经永久删除的项目时，文件夹还在就重新指上。
- **同一个编号再建项目：** 普通项目的编号不重复；账号 Home 不支持永久删除（下面），同步来的项目也就碰不到。只有固定编号的示例项目会：删除后再建，认回留下的文件夹。示例项目重置也不动它，重建的只是种子数据。
- 没有「清理留下的文件夹」的入口。磁盘只涨不减这件事用户知道，等有人要再加。

**另一台设备上的引用（用户 2026-11-07 定：加「指定文件夹」）。** 用户把引用对应到本机的文件夹。

| 件 | 定法 |
| --- | --- |
| 一条对应管什么 | **一个项目里、另一台设备的一个目录**，主键 `(project_id, source_workspace_id)`。不是一个引用：同一个目录里的文件要逐份指定，几十份就指不动。不是一整个项目：一个项目在原设备上可以有多个目录，文件各在各的。不跨项目：对应的结果是这个项目的目录，授权是按项目的。多个原目录可以对应到同一个本机文件夹 |
| 存在哪 | 目录库新表 `workspace_source_links`，`modules/projects` 独占：`project_id`、`source_workspace_id`、`workspace_id`、`bound_by`、时间。`project_id` 和 `workspace_id` 都带外键，`ON DELETE CASCADE`。只在本机：`portable-project.ts` 不投影它，同步内容里没有。跟着目录库进 Home 快照。升级段见第 8 节 |
| 怎么读 | `resolveWorkspaceFileSubject(subject, directories)`，纯函数，放在 `parseWorkspaceFileSubjectId` 旁边：id 是这个项目的目录就是它，否则查 `source_links`，都没有返回 null。**只有读引用的地方调它**：`horizontal/knowledge/src/workspace.ts:68`、`plugins/native/files/src/actions.ts:108`、`plugins/native/files/src/browser/client.ts:14`、平台现读出处。它们拿到的是本机的目录 id，之后走现有的读动作，授权、realpath 和符号链接检查都不变。`plugins/native/files/src/browser/client.ts:14` 打开引用时自己切 id、和当前目录比，也要先换算，否则指定过的引用点开会提示不在当前目录。所以读动作和写动作都只认本机 id，**写入给原设备的 id 照旧被拒**。指定不改变目录的角色，指定到输入目录时 Agent 写不了（SSC-15） |
| 谁能改 | `projects.directories.map_source@1`、`unmap_source@1`，提供方是现有的 `system.project-workspaces`，受众只有 user，权限 `projects:settings`，和 `add_input` 同一个声明工厂。插件、Agent、MCP 都调不到。操作者和项目从调用上下文来，输入里没有。输入是 `source_workspace_id` 加目标（`workspace_id`、`workspace_path`、`default_output: true` 三选一），加 `expected_revision`。已有对应时再调就是换。`unmap_source` 只去掉对应，文件夹还是这个项目的目录。`revision` 把对应算进去。合同写法在第 3 节开头 |
| 目标文件夹过哪些校验 | 目标三种写法（`workspace_id`、`workspace_path`、`default_output: true`）过同一个检查。给 `workspace_id`：必须已经是这个项目的目录。给 `workspace_path`：在同一个事务里走 `add_input`，所以 realpath 必须核实成功（`projects.directory_missing`，符号链接存的是它指向的真实路径），也走上面「路径到行」，别的项目的默认位置被拒。给 `default_output`：这个项目的默认输出目录，文件夹没建也可以；这一行不在时补回来，角色是 input（指定不改变已有角色，见下面「怎么读」）。**目标和根 Home 不能互相包含**（这个项目的默认位置除外），`actions.input_invalid`：引用里的相对路径是另一台设备写的，不能让它指进 Home 的库和密钥，目标是 `~` 时 `.molis-work/…` 一样指得进去。根 Home 是 Home 本身；账号 Home（`<根 Home>/spaces/<spaceId>`，`space-web-server.ts:105`）比根 Home，这样也挡住根 Home 和别的账号 Home。两边都用 `realpathSync.native`，它才归一大小写。写法同 `home-snapshot-publication.ts:18,29`。`add_input` 本身不加这条，那是现有行为，不在这里改 |
| `source_workspace_id` 的校验 | 它只作键，不拼路径。形状同 `folderId`。只有这个 id 已经是**这个项目的**目录才拒绝（`projects.directory_duplicate`）：那不是另一台设备的目录。目标就是这一行时（比如给的路径正好哈希到它），只写关联，不写对应。之后这个 id 被加进这个项目时，对应在同一个事务里去掉 |
| 读的时候怎么跳不出去 | 引用的相对路径过 `parseFilePath`，`..` 进不来（`assertMaterialRef` 也查）。读文件时 `workspace-files.ts` 逐段 `lstat`、`O_NOFOLLOW`、核根目录的 realpath，符号链接不跟。对应到默认输出目录时先过 `prepareWorkspaceDirectory(…, "read")` |
| 什么时候失效 | 目录从这个项目移除（`remove_input`、改输出目录后这一行没了），对应在同一个事务里去掉，引用回到未指定。`repair` 换路径时 id 不变，对应不动，所以这一行有对应时 `repair` 也过上面「目标和根 Home 不能互相包含」的检查。文件夹找不到时照旧是 `missing`，由 `repair` 修 |
| 另一台设备的文件夹名字 | 不同步（本机路径不同步这条不变），这台设备只知道 id 和相对路径。代价：原设备上两个目录各有一个 `README.md` 时，这边看到两行一样的，指错了也看不出，所以定样要按 `source_workspace_id` 分组。默认输出目录分两种，都不用同步：`source_workspace_id` 等于这个项目算出来的默认 id，写「这个项目原来的默认输出目录」；其余 `workspace-output-` 前缀的写「另一台设备的默认输出目录」。这两句由平台写进 `origin.note`：`unmapped` 没有 `directory`，页面手里也没有默认 id，不让页面解析 id 的形状 |
| 两片之间 | 目录实现片合入后、指定文件夹片合入前，不产出 `unmapped`，这些引用照旧是 `missing`，显示「找不到位置」。这时目录 id 已不属于这个项目，给不出名字和角色，所以 `missing` 不带 `directory`。读取同样被拒，只是还没有入口 |

**这台设备上同路径有同名文件时怎么办。** 分指定之前和指定之后：

- **指定之前不读，也就不会静默读到别的文件。** 默认输出目录两台设备 id 不同（上表「存什么」），用户自己选的目录脱钩之后新发的 id 也不同，所以另一台设备的引用在这里解析不出来，出处是 `unmapped`，界面显示「未指定文件夹」。给 plugin 和 agent 的读取被拒，`materials.recent` 给 plugin 时和 `forbidden`、`missing` 一样不返回。
- **指定之后读指定的那个文件夹里同路径的文件。** 这是用户说的对应，读到的就算内容不同也不拒绝，但要说出来：有指纹就比，不一样是 `changed`，界面提示「和引用时不是同一份」；比不了的给 `note`，写明「内容没有核对」。同路径没有文件是 `missing`。这些只到界面，Agent 读文件不比（第 2 节）。
- **`goals.inputs.bind` 带指纹。** 输入多一个可选的 `read_revision`，调用方读到什么传什么，只是提示，传错了最多多报一次 `changed`。处理器是同步的，不自己读文件。十六进制写成 `sha256:<hex>` 存进已有、也同步的 `input_bindings.snapshot_digest`（和 `goals.inputs.confirm` 同一种形状，`goal-entry-actions.ts:32`），比较时去掉前缀；`size:` 放不进这种形状，写 null。不改表，动作快照要跟着改。没有指纹的绑定显示「内容没有核对」。

**还剩一种静默读：脱钩之前建的目录行。** 这种行的 id 是路径的哈希（`normalizeProjectWorkspace`）。同一个同步项目，两台设备都在目录实现片之前关联过同一个绝对路径，id 就相同，引用不用指定就走本机目录这条路。关联不只是手动加，在这个路径开过终端、绑过会话也算（`modules/private-work-context/src/project-binding-commands.ts:171,180`）。只关联别的项目不算，那样是 `unmapped`（下面）。**用户 2026-11-07 定：接受，写明。** 碰上还要先有同步：同步默认关闭，不设环境变量就没有（`modules/sync-replication/src/endpoint.ts:14-16`）；联网同步没有交付，个人同步排在 M1 之后（路线图 SRV-1、SRV-2）。同步晚到不清旧行，打开时照样碰得上。

| 引用 | 人在界面上 | Agent 读 |
| --- | --- | --- |
| `MaterialRef` | 实现片才有，`read_revision` 必填。内容不同是 `changed` | 读到本机同名文件，不比，不提示 |
| 带指纹的 `input_bindings` | 同上 | 同上 |
| 不带指纹的 `input_bindings`（`bind` 没传，或实现片之前写的，`snapshot_digest` 是 null） | 显示「内容没有核对」 | 同上 |
| `goal_tree_proposal_items.source_refs_json` | 只存 `kind:id` 字符串，没有页面读，也没有地方按它调读取动作 | Agent 能在提案输出里看到这个字符串，要自己切开才能读，条件同上 |

- **否掉的两个方案。**
  - **旧绑定标成待确认。** 多一个 Goals 升级段，把没有指纹的旧 `workspace_file` 绑定标成 `proposed`。还要改 `goals.inputs.accept`：它现在只认 `feed_item`（`plugins/native/goals/src/input-actions.ts:108-109`），这种绑定认可不了。用户要逐条认可。重建之后这种行预计接近 0，也不改 Agent 读文件不比这一点。
  - **目录 id 加每台设备的盐。** 盐是 Home 里只写一次的随机值，放进目录库 `catalog_meta` 的一个新键，不改表结构。`normalizeProjectWorkspace` 多一个参数，改 `workspace.ts:47`、`modules/projects/src/index.ts:144`、`project-catalog.ts:412`，模块级的 `contextBindingValidation` 和 `normalizeRuntimeWorkContext` 要改成按实例取（`project-catalog.ts:411-420`、`project-workspace-actions.ts:12`）。`catalog_meta` 归 `packages/storage`，读写要加在 `packages/storage/src/catalog-metadata.ts` 再接到目录的构造上。`modules/characters/src/open.ts:37` 这些下游把 id 当不透明字符串存，不用动。#1837 没有改这几个文件，不挡它。**但必须在真实 Home 重建之前合入**：之后已有的行没有盐，同一个路径算出新 id，撞 `canonical_path` 的唯一约束（`repository.ts:67`，`upsertWorkspace` 只处理 `workspace_id` 冲突），就要再补迁移或先按路径查行。重建因此多等这一个 PR。它只填重建到实现片这段窗口，实现片 `add` 发新 id 以后就没用了，算一次性代码。这段窗口里，另一台设备同路径的引用从读到本机文件变成读不了，指定文件夹片之前没有入口。整份 Home 拷贝照样不解决，盐也拷过去了。
- **接受的后果。** 主要是上表 Agent 那一列：这种引用 Agent 读到的是本机同名文件，不比，不提示，可能不是引用时的内容。另外多一条判断（没有指纹就写「内容没有核对」）和一个发布排序条件。

- **升级段不改这些 id。** 别的库也存着（`modules/characters/src/open.ts:37`、冻结的轮次），要逐库改，改漏了本机的历史就断了。
- **范围。** 外部用户只有实现片晚于首次外部安装才会碰上：一台设备上的旧行，遇到另一台实现片之后新发的 id，照样是 `unmapped`。这个先后写在[路线图依赖](../post-anticorruption-roadmap/reference/dependencies.md)（`MAT --> M1`）。自己的设备上已经有这种行的，要把这个路径从那台设备的**所有项目**移除，再加一次才发新 id：`removeWorkspaceIfEmpty`（`workspace-repository.ts:146`）只在没有任何关联时才删这一行，还有别的项目关联时加回来认回原来那一行。之后那台的旧引用变成未指定，可以指定。

**相邻两种情况。**

- **本机有这个 id 的行，但这个项目没有关联**（只关联别的项目，或从这个项目移除了）：和 id 不在目录库一样是 `unmapped`，可以指定。读取照旧被拒（SSC-04），对应只把这个项目接到它自己的目录，碰不到别的项目的文件夹。不做成 `forbidden`：那样没有出路，而且会让人看出别的项目用没用这个文件夹。`forbidden` 是调用方没有读目录的授权（`horizontal/knowledge/src/workspace.ts:81`）。目录的 `state` 没有 `revoked`（合同台定）：移除以后这一行就没了，说不出谁会写这个取值。撤权按调用方的授权算，不是目录的状态；`projects.directory_revoked` 留给冻结轮次用到已经移除的目录时回答（SSC-04）。给的路径正好是这一行时，等于把同一个文件夹加进这个项目，只写关联。
- **整份 Home 拷到第二台设备，两边都在用：** 不支持。两边是同一个 Home 的两份，所有 id 都相同，默认输出目录也一样，事件 id 也拷过去了，和上面的旧行同样静默。Home 拷过去之后只用一边是支持的。不做检测。

**要定样的新状态（用户 2026-11-08 看实物定了，见下面「定样」）：**

1. 未指定的引用长什么样：资料面板的「最近用过」、选择器、引用和出处行、Goals 的输入。只有文件名和相对路径可以写，要按 `source_workspace_id` 分组，用原设备上两个目录各有一个 `README.md` 来验收；默认输出目录分「这个项目原来的」和「另一台设备的」两种写法（上表）。
2. 从哪里指定：未指定的那一行上的操作；选已有目录还是新选文件夹，这个项目的默认输出目录怎么放。
3. 指定时的反馈：一次接回这个目录的全部引用，这件事要说得出来，同样按目录分组；指定的文件夹里同路径没有文件时的样子。
4. 指定之后怎么看、怎么换、怎么取消：目录设置里每个目录的对应，出处行上的入口。
5. 内容不一样时的「和引用时不是同一份」，和「内容没有核对」的说明。
6. Agent 或插件读到未指定的引用被拒之后，人在哪里看到、怎么接着做。

**定样（用户 2026-11-08 看实物定）。** 原型在 [`docs/design/05-materials-directories/`](../../docs/design/05-materials-directories/README.md)，每个方案都能看浅色、深色，1440、1024、390 三种宽度，中英文。

| 问题 | 定了 | 否掉的方案和理由 |
| --- | --- | --- |
| 永久删除时默认输出目录里有文件，确认框怎么问 | **A3 选项就是确认。** `has_files` 时两张交互卡片（`mw-ix-option`）代替原来的勾选框：「删除项目，文件留下」「删除项目和文件」，各写一句后果，下面一句「两种都会永久删除项目，不能撤销」。不预先选好，选了以后按钮才能按，按钮文字跟着选择写明后果。回答这一问本身就是「我知道后果」的确认，不用再勾一次；后果写在卡片上，不用回头对照，按下去之前按钮再说一遍。`empty`、`unknown` 不问，照旧是勾选框，所以两种情况下确认框样子不同 | A1 问一句，再勾选（原框里加两个单选，勾选照旧）：选、勾、按三步，两处都在说「不能撤销」；勾选框和单选挤在一起，最后按的是什么要回头看。A2 两个结束按钮（勾选照旧，底部「删除项目，留下文件」「删除项目和文件」并排）：两个破坏性按钮摆在一起，违背一个决定一个主操作；删和留的区别只在按钮字面上，容易按错 |
| 另一台设备上的引用在哪里指定 | **B1 就地指定。** 在碰到它的地方指定：资料面板的「最近用过」、对话里读不到的提示、Goal 的输入、选资料的弹层。每个来源目录一个分组容器，组名下写同一个目录里还用过的文件，带「指定文件夹」，从按钮旁弹出同一个选择。未指定的引用一定是在某处碰到的，就地指定不打断手上的事；指定后的提示马上说出这个文件夹整体读得怎样（比如「3 份里找到 1 份」），指错了当场看得出来，带「撤销」。代价：分组容器在「最近用过」和选资料弹层里占地方，挤掉一些能读的行；同一个按钮出现在好几处（是同一个弹层） | B2 资料里一处（资料面板多一个来源组，只在那里指定，别处只给跳转）：从对话出发要多跳一次、换个地方找；「最近用过」里看不到刚才那份文件，要到下面的组里找。B3 一次接回（一个对话框列出所有未指定的目录，一次指定）：离开了碰到问题的地方，对话框里只有文件名，判断哪个对哪个更难；会顺手去指定眼下不需要的；多一个要学的弹窗 |

- 两个方案之外随定样一起定的部分（各状态的字、按来源分组、指定的去处、之后怎么看换取消、「和引用时不是同一份」「内容没有核对」、Agent 读不到之后、删除时还有任务被拒、清理没做完时选择锁住）写在原型的 README，实现照原型。
- 组件板没有新增。三处组件板已有、页面样式表还没有的样式，随第一个用到的页面搬进页面样式表：交互卡片 `mw-ix-option`（设置页的样式表现在不带）、提示里的按钮行 `mw-alert__actions`、菜单项的说明行 `mw-menu__desc`。
- 备注：一个项目常有很多目录要接的话，B3 的对话框以后可以补成批量入口，和 B1 不冲突。

**代价。** 两个新动作、一张表、一段升级、一个解析函数和四处读的地方，加上面六个状态。05② 的实现片因此变大，所以拆成单独一片（第 9 节）。

**目录的 id 和路径脱钩**（#1805 第 2 条）。现在 `workspace_id` 是路径哈希（`modules/projects/src/workspace.ts` 的 `normalizeProjectWorkspace`），`repair` 换了路径就换了 id，旧关联随之删掉；而资料引用写的是 `<workspace_id>:<相对路径>`，修复以后旧引用就指向一个不存在的 id。改成：

- 文件夹是 Home 级的一行（`modules/projects` 的 `workspaces`，`canonical_path` 全局唯一），和项目多对多关联（`workspace_project_memberships`）。这个形状不变。
- `add` 时发一个新 id，以后不再随路径变；「同一个文件夹只关联一次」由 `canonical_path` 的唯一约束来守。加一个别的项目已经关联过的文件夹，关联到原来那一行，不新发 id。
- **唯一性只认核实过的路径**：`add`、`repair` 都必须 realpath 核实成功；核实不了（不存在、读不了）就拒绝，错误码 `projects.directory_missing`，不退回 `path.resolve` 的结果。这样大小写不同、经符号链接的同一个文件夹不会被当成两个。
- **`repair` 说的是「这个文件夹搬到了这里」**，是文件夹的事实，不是某个项目的：只在这一行的状态是 `missing` 时允许，改的是这一行的 `canonical_path`，id 不变，所以每个关联它的项目一起跟着走，历史引用和固定版本都不受影响（WMD-04）。每个关联的项目各记一条 `project.workspace_path_repaired`。想换成另一个文件夹，是移除再添加，不是修复。
- 新路径已经是另一行（不论哪个项目关联着）时拒绝，错误码 `projects.directory_duplicate`，不悄悄合并两行。
- **不再从路径推 id**：现在 `apps/local-host/src/project-catalog.ts`、`modules/private-work-context/src/project-binding-validation.ts` 用 `normalizeProjectWorkspace` 按路径哈希推 id。脱钩以后一律改成按 `canonical_path` 查那一行，`normalizeProjectWorkspace` 不再出 id。否则旧的哈希 id 照旧推得对、新发的推不对，就成了一条没写明的兼容路径。
- 现有的哈希 id 本来就是不透明的字符串，照旧有效，不重写、不重映射；以后只是不再从路径算它。

**没写目录时取输出目录**（#1805 第 3 条）。现在有十几处不传 `workspace_id`，靠 `preferredPath` 隐含取一个目录（Schedule 的唤醒、Goals 的终端、到达页都是）。规则定为：

- 没传 `workspace_id` 的读、写、执行，一律取**输出目录**。合同里的 `preferredWorkspacePath`（`modules/projects.ts` 的读取端口，有 api 快照）和动作 `projects.workspace.read` 都换成按角色给的读法：端口改成 `outputDirectory(project_id)`，动作并进 `projects.directories.get`，不留旧名。这一步也在实现片。
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
// packages/contracts/src/modules/projects.ts（C-1）
// 轮次视图和冻结轮次信息里的字段，随实现片加到 services/agent-host.ts
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

写在 Manifest 的新字段 `presentation` 里，和 `actions`、搜索来源、`artifacts.produces` 并列。合同已写进 `packages/contracts/src/platform/presentation.ts`（C-2），下面的形状以它为准；给人看的字照[字体、皮肤与语言系统 A 段合同](../font-and-skin-system/a-section-contract.md) §2.4 用 `TextRef`（统筹 2026-11-08 同意照改）。`parsePluginManifest` 用第 7 节的 `validatePresentationDeclaration` 查它。

```ts
// packages/contracts/src/platform/presentation.ts（新子路径；Manifest 类型在 plugin-manifest.ts 里引用，它的快照落在 tooling/gates/api/contracts/platform/plugin.txt，经 platform/plugin 子路径导出）
type FieldRole = "title" | "status" | "summary" | "excerpt" | "media" | "number" | "progress"
  | "due_at" | "happened_at" | "updated_at" | "actor" | "activity" | "origin" | "version" | "relation" | "children"
  | "judgment" | "held_in";
// activity：一句最近发生了什么，由主人给。「行」的第二行固定读 actor、activity 和时间（MLN-23 的「最近一次动作」）。
// activity 的值是 TextRef，可以写 literal（A 段 §2.4）。
// judgment：主人对这件东西的判断，值是 { label: TextRef; reason?: TextRef }（D 轨 2026-11-04 定），reason 可以写 literal。
// held_in：这件东西归项目还是归个人，值是 "project" | "personal"。不叫 scope：会和动作的 scope、AssistantScope 撞名。
type FormKind = "chip" | "row" | "card" | "peek";           // 第一片：四种基础形态
// 第二片再加 "live" | "embed"；"page" 是插件自己的主区，不进声明。
type AttentionState = "needs_decision" | "needs_acceptance" | "failed" | "partial" | "stale";

interface PresentationDeclaration {
  objects: PresentationObject[];
  // 没有 mounts：挂载位写在 UiContributionDeclaration.slots 上，见下面的 UiSlotDescriptor 和「挂载位」一条。
  /** 插件级概况：首页、Shelf 上「这个插件现在怎么样」。指向本插件自己的一个 query 动作（#1798 第 12 节第 1 条）。 */
  overview?: {
    capability_id: string; version: number;
    note?: TextRef;
    /** 开始的入口，至多 3 个，都是本 Manifest 自己的动作；概况动作返回的 start 只能从这里挑（统筹 2026-11-08 定）。 */
    start?: Array<{ capability_id: string; version: number }>;
  };
}

interface PresentationObject {
  /** 必须是本插件已经声明过的搜索 kind 或动作的 subject kind，不另起类型。 */
  kind: string;
  fields: Array<{ key: string; role: FieldRole; label?: TextRef }>;   // label 用插件自己的文字键，不收 literal
  /** 插件自己的状态映射到状态环（status-ring-system）和显示用的提醒标记。ring 写族名或别名，和 renderStateRing 一致。 */
  status?: { field: string; map: Record<string, { ring: StateRingState; attention?: AttentionState }> };
  /** 每种形态显示哪些字段；没写的形态平台不用，按梯度降一级（IUI-03）。 */
  forms: Partial<Record<FormKind, { fields: string[] }>>;
  actions?: Array<{
    ref: string;                      // "capability_id@version"，必须在动作目录里
    primary?: boolean;
    when?: { status?: string[]; slots?: SurfaceSlotKind[] };
    input_from?: Record<string, string>;  // 预备输入取哪些字段；预备不写入
    unavailable?: {
      when: { status?: string[]; codes?: string[] }; // 至少一项非空；两项并列时 AND
      reason: TextRef;               // 主人的已声明文字键，不收 literal
      next?: string;                 // 只引用本对象 actions 里的另一动作，复用它的 input_from
    };
  }>;
  /** 给外部 Agent、终端、通知用的文本形态（§4.5）：每一行是一个字段键，和图形出自同一份事实。 */
  text?: { lines: string[] };
}

/** 平台按可信目录填上主人以后的样子，声明里没有 owner（A 段 §2.4 第 3 条）。 */
type OwnedPresentationObject = PresentationObject & { readonly owner: string };

// packages/contracts/src/platform/ui-slots.ts（由 ui.ts 转出）：插件的一个贡献给别人的内容开的位置。原有两项不动，加三项可选的收法。
interface UiSlotDescriptor {
  slot_id: string;
  accepts: string[];               // 原有：嵌入插件自己画的 surface 的格式，如 "declarative-html"
  accepts_forms?: FormKind[];      // 平台按形态画别人的对象时收哪几种；不写，平台什么都不往这里放（IUI-13）
  max?: number;                    // 平台最多放几件；不写只受平台自己的上限
  refuse_kinds?: string[];         // 哪些对象种类不收
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

  另给 `definePresentationValuesAction`、`bindPresentationValuesHandler`。插件只写一个处理器；组合服务用调用方当时的授权去调它，所以读不到、撤权、删除会如实反映出来（IUI-09、IUI-10）。动作是只读、并发的 query，默认受众 user、plugin、agent、mcp（`PRESENTATION_VALUES_AUDIENCES`，主人可以收窄）；`bind` 只交回问到的字段，`forbidden`、`deleted` 的项只留状态。schema 只用 `SandboxSchema` 有的写法，沙箱插件也能声明；「`stale` 必有 `read_at`」由第 7 节的 `presentationValuesProblems` 查。
- **插件领头需要的身份**：方案 B 的色块、色带只需要「这个东西归哪个插件」。组合服务从动作目录得出主人插件，放进操作面描述；颜色和图标怎么从插件身份映射出来归 D 轨，合同只给插件 id。插件色只用在色块和色带里，状态色只用在状态环、色点和状态标签里，两套分开，这一条在 D 轨的组件里守。
- **状态环的取值归 contracts。** `StateRingState` 现在在 SDK 的 `packages/plugin-sdk/src/ui/state-ring-states.ts`，contracts 不能反过来引用 SDK。先由 D 轨把 `STATE_RING_FAMILIES` 的取值清单下沉到 contracts 的 `platform/ui.ts`（这个文件归 D 轨），SDK 的 `/ui` 从 contracts 取，渲染留在 SDK；`presentation.ts` 只引用 contracts 里的这份取值。C-2 叠在 D 轨这一步后面。
- **`attention` 只管显示，不进「等你」。** 声明里的 `attention` 只决定色点和状态标签，不产生等你条目。「等你」的主人仍是 `modules/attention-resumption.ts`，插件经 `platform/plugin-attention.ts` 写入；它的 `reason`（manual、source_rule、goal_decision……）说的是为什么进来，这里的 `needs_decision`、`needs_acceptance` 说的是要你做什么，两者不是一回事。等你列表只认 attention-resumption，不形成第二份「要你管」的名单。
- **不经组合服务也能用。** 呈现声明可以脱离组合服务单独用：主线顶部切换（MLN-23）不调 `surfaces.compose`，直接按声明和 `PresentationValues` 画「行」。SDK 给一个按声明取值、渲染单个形态的入口（第 7 节），所以 MLN-23 不用等组合服务；这个入口（`renderPresentationForm`）随第 15 批第 2 项的形态组件交（统筹 11-08 定）。
- **插件级概况**（`overview`）：
  - 指向的动作，输入输出 schema 由平台定死（`PRESENTATION_OVERVIEW_INPUT_SCHEMA`、`PRESENTATION_OVERVIEW_OUTPUT_SCHEMA`），声明必须一字不差，做法照 `SANDBOX_INTEGRATION_CONTRACT`；作者用 `definePresentationOverviewAction` 写。输出是 `{ summary: TextRef; subjects: ActionSubject[]（≤5）; start: Array<{ capability_id; version }>（≤3） }`；`summary` 用 `TEXT_REF_SCHEMA`，写 `owner` 被 schema 拒绝，服务按动作提供方绑主人。
  - 动作是 `effect: "read"`，不调模型、不花钱，和 `home_aggregate` 的约束一样。
  - `note` 是不变的一句话（如 Feed 的「同步来的资料不算你接下的工作」），写在声明里，不让动作每次返回。
  - `start` 分两半（统筹 2026-11-08 定）：声明里的 `overview.start` 至多 3 个，安装时查它们都是本 Manifest 自己的动作；动作运行时返回的 `start` 只能是声明里的子集，由第 7 节的 `presentationOverviewProblems` 查。后果从动作元数据取。
  - Home 级插件（如 Todo）的概况动作走 `project_reach`，按调用上下文给它可达的项目，不在输入里带项目。
- **没有声明的对象**：平台兜底显示图标、名字、所属插件和「打开」，打开位置用 `SearchOpenTarget`（IUI-02）。
- **文案键**：`label` 用插件的稳定文字键，和第 15 批「前三个插件声明从首片起用稳定文字键」一致。
- **挂载位：`mounts` 并进 `slots`（统筹 2026-11-08 定）。** C-2 写合同时核实，原稿的 `mounts` 和现有的 `UiContributionDeclaration.slots`（「这个贡献给别的插件内容开的位置」，由 `manifest.ui.embedded_plugins` 里的插件用 `target_slot_id` 填，见 Coding 的 `coding.companion-directory`）说的是同一件事：我的页面上哪里开放给别人的内容。一件事只留一份声明，所以呈现声明里没有 `mounts`（写了按未知字段拒绝），收法加在 `UiSlotDescriptor` 上，三项都可选，只加不删，`embedded_plugins` 和 `target_slot_id` 照旧。挂载位就是带 `accepts_forms` 的 slot；没有带它的 slot，平台什么都不往里放（IUI-13，由第 15 批 S-1 证明）。名字和原稿不同的两处：`accepts` 在 slot 上已经是必填的 surface 格式，平台按形态收的那一项叫 `accepts_forms`；原稿的 `where` 不要了，slot 放在页面哪里由插件自己的标记定（`UiNestedContentModel` 按 `slot_id` 放）。组合服务的位置随之改名：`plugin-mount` 改 `plugin-slot`，`mount_id` 改 `slot_id`，不留旧名（第 6 节）。A 段 §2.4 第 3 条③也记了这一处。
- **装不上要说清**：声明不合法时安装被拒，并说明是哪一项错了（IUI-01）。校验是第 7 节的 `validatePresentationDeclaration`。

## 6. 组合服务的公开合同

组合服务是一个新的 `horizontal/` 包，第 15 批实现；宿主只做装配。公开合同放在 `packages/contracts/src/services/surface-composition.ts`（C-3，和 C-2 同一个 PR 写进去了，下面以它为准；两个动作只声明，提供方 `system.surfaces` 由第 15 批 S-1 登记）。界面上的位置叫 slot（`SurfaceSlotKind`），不叫 placement，理由同第 4 节。`SurfaceSlotKind` 放在 `platform/presentation`，因为声明里的 `when.slots` 要用它：

```ts
type SurfaceSlotKind = "plugin-slot" | "conversation" | "discussion" | "attention" | "home"
  | "shelf" | "search" | "side" | "text";
// 合同里现在就有 home；消费者的顺序照第 10 节第 3 条，首页排在第二片。

interface SurfaceRequest {
  slot: { kind: SurfaceSlotKind; plugin_id?: string; slot_id?: string };   // plugin-slot 时要写在哪个插件的哪个 slot（带 accepts_forms 的）
  subjects?: ActionSubject[];
  delivery_subjects?: ActionSubject[]; // 仅 conversation；subjects 的去重子集，其余为正文引用；总输入仍最多 50 项
  expanded?: true;                    // 仅 conversation/discussion，在原位置展开全部可读项；不改变挂载位 max
  /** 此刻在做什么（§5 依据 4）。第一片的确定组合不看它，只为助理组合留位置。 */
  task?: "writing" | "reviewing" | "finding" | "handing-off" | "discussing";
}

interface SurfaceDescription {
  composed_by: "rules" | "assistant";
  revision: string;                 // 同样的输入得到同样的 revision，确定组合可以重复（IUI-04）
  corrections_revision: string;     // 调用方在这个位置的纠正版本，surfaces.correct@1 拿它当 expected_revision
  groups: SurfaceGroup[];
  reason?: OwnedTextRef;            // 一句「为什么这样放」（IUI-06）
}

/** 按种类区分的组（#1798 第 12 节第 4 条）。描述里给人看的字都是 OwnedTextRef，主人由服务按插件目录绑（A 段 §2.4）。 */
interface SurfaceGroup {
  kind: "attention" | "continue" | "plugin" | "slot";
  owner_plugin_id?: string;         // 只在 plugin 组
  state: "ok" | "unreadable" | "stale" | "disabled" | "undeclared";   // disabled、undeclared 只用在 plugin 组
  read_at?: string;                 // state 为 stale 时有
  /** 没有放进来的。第一片只收 disabled：不给 forbidden，「有几件你看不了」本身就是泄露。件数和插件 id 只给 user 受众；plugin 受众只给有没有（统筹 2026-11-08 定，和第 15 批 §7.1 对齐）。 */
  excluded?: Array<{ reason: "disabled"; count?: number; owner_plugin_id?: string }>;
  hidden_above?: { count: number; label: OwnedTextRef };   // 「另有 N 件」：只数调用方读得了的；label 带 count 参数
  overflow?: { count: number; label?: OwnedTextRef };     // 当前折叠的可读项，与已经显示在上面的 hidden_above 分开；S-1 不新声明文字键
  title?: OwnedTextRef;
  items: SurfaceItem[];
}

interface SurfaceItemAction {
  ref: string;                    // "capability_id@version"，或平台通用操作 open、peek、place、hand_off
  provider_id?: string;           // 普通目录动作必带精确提供方；通用操作不冒充某个提供方
  primary: boolean;
  prepared_input?: Record<string, string>; // 输入键 → 字段键，不放值；点击时按当时授权取值
  consequence?: Array<"external" | "cost" | "irreversible">;
}

interface SurfaceItem {
  subject: ActionSubject;
  owner_plugin_id: string;          // 方案 B 的插件色块、色带用它
  form: FormKind;
  state: "ok" | "forbidden" | "deleted" | "stale";
  read_at?: string;                // 只转发本次已授权 owner 读取给的真实旧值时间，不填当前时间冒充
  fields: Array<{ key: string; role: FieldRole }>;   // 显示哪些字段；值由页面用 PresentationValues 去取，不放进描述
  actions: SurfaceItemAction[];
  notices?: Array<{ reason: OwnedTextRef; next?: SurfaceItemAction }>; // 原因不是可执行按钮；next 只能复用已核实的只读/导航动作
  /** 被合并进这一件的对象（#1798 第 12 节第 5 条）。服务按动作目录填 owner_plugin_id；调用方读不了的不放进来。 */
  merged?: Array<{ subject: ActionSubject; owner_plugin_id: string; relation: ContextRelationType }>;
}
```

| 动作 | 种类 | 说明 |
| --- | --- | --- |
| `surfaces.compose@1` | query | 按调用方、位置（slot）和对象返回校验过的 `SurfaceDescription`。第一片只做确定组合，不调模型 |
| `surfaces.correct@1` | command | 用户换形态、移走、固定或恢复默认。按调用方和位置记住，同一位置下次先照纠正来（IUI-06）。用 `expected_revision`，取描述里的 `corrections_revision` |

两个动作都是项目范围。`compose` 只读、并发（要等各主人的 values），受众 user、plugin（第 10 节第 4 条）；`correct` 改的是本人自己的版面，受众只有 user。`correct` 的输入是 `{ slot, subject?, correction: "form" | "remove" | "pin" | "reset", form?, position?, expected_revision }`：`form` 必带形态，不带 `subject` 时对整个位置；`remove` 必带对象；`pin` 带对象和从 0 起的位置；`reset` 不带 form／position，带对象时恢复该对象，不带对象时恢复整个位置。多带的键被 schema 拒绝。返回新的 `corrections_revision`。恢复沿原表写 reset 标记，修订号仍取所有行的最大值，不删除旧行使修订回退；对象恢复仍继承位置形态。准确截断和受保护消费者边界见[智能呈现 §17](../intelligent-surfaces/spec.md#17-跨位置消费者实施输入2026-11-09)。

**纠正记录的生命周期**：
- 存在哪：位置属于某个项目的（插件挂载位、项目讨论、等你）存在组合服务在项目库里的纠正表；不属于项目的（个人一层）存在组合服务自己的 Home 库，登记进 `homeStoreRegistry`。两处都在 `table-owners.json` 记为组合服务独占，建表经第 02 批的 storage 驱动，按 02③ 分界（第 8 节）。
- 键：调用方 + 位置（`slot.kind`、`plugin_id`、`slot_id`）+ 对象 `subject`。
- 插件停用或卸载：它挂载位上的纠正不删，读的时候挂载位不在就不用；同一插件同一挂载位再装回来，照旧生效（这是本人对自己版面的偏好）。纠正里指向的对象读不到时同样跳过，不显示。
- 删项目：随项目库一起删；个人一层的纠正不受影响。
- Home 快照：项目库和登记过的 Home 库都带上。

- **组的规矩**：`disabled`、`undeclared` 用在 plugin 组以外，`assertSurfaceDescription` 拒绝。停用卡上的「启用」引用平台动作 `plugins.installed.enable@1`（只给本人），不另造。
- **revision 要把授权算进去**：main 上没有单独的「授权版本」，所以哈希的输入里加上动作目录 `discover()` 给每个操作的 `availability`。只换了授权、别的没变时，可点的操作已经不同，revision 也必须变，页面才会重画。
- **关系类型要登记**：现在 context-ledger 的 `ContextEdge.type` 是自由字符串，写入方各自定常量（如 `horizontal/placement/src/index.ts` 的 `TYPES`）。C-3 在 contracts 的 `modules/context-ledger` 加一张平台关系类型表 `CONTEXT_RELATION_TYPES`（类型 `ContextRelationType`）：放进 placement 已有的 `placement.derived_from`、`placement.copied_from`（照原名，归 placement，placement 的 `TYPES` 改成从表里取；它的其余几种边说的是「放在哪里」，不是同一件事，不进表），再加 `created_from`；`merged` 只认表里的类型。三者不重叠：`copied_from` 是复制出的副本，`derived_from` 是由别的对象派生出的版本，`created_from` 是在操作面上「从这件新建」出的另一件东西，两者主人可以不同。这条边由执行「从这件新建」的平台路径写，不由插件自称。
- **授权核对只读**：组合服务核对「这个操作此刻能不能点」直接用动作目录的 `discover()`，它带 `availability`，不另开接口。
- **操作就是动作**：`SurfaceItem.actions` 里只能是动作目录里现有的动作，或者平台的通用操作。点下去的时候走动作网关，用当时的授权，不用组合当时的授权（IUI-07）。
- **提供方和不可用说明（15 S-1 合审补齐，2026-11-08）。** 普通动作按 `(ref, provider_id)` 匹配候选及去重；先在声明 owner 的提供方找唯一匹配，再找唯一跨提供方匹配，有歧义不给按钮。先筛外层 `when`，再匹配 `unavailable.when`：`status` 可抑制原本可用的按钮，`codes` 只匹配可见目录行的 `available:false` 原因码；条件都满足时只给 notice，不再给该按钮。权限隐藏的行不出说明。`next` 只能引用同一对象另一个声明动作，复用其输入映射；最终不可用、不能准备输入或不是只读 query/navigation 就省略去处。候选事实中的 provider、notice 与后果不能由助理改写。动作元数据补 `external?: true`，SDK 拒绝其他值；不可逆复用平台 `actionEffect`，计费取 `execution.cost`，不按动作名猜外发。
- **对话和折叠（同次合审）。** `delivery_subjects` 必须是 `subjects` 的去重子集，交付默认卡片、其余默认名字片；讨论默认卡片。默认显示前 6 件，多出的可读件数进 `overflow`；`expanded:true` 才在同一位置全部展开，仍最多 50 个请求对象。`hidden_above` 只记录首页上方已经显示的对象。没有授权核实的对象不能进入折叠计数。无可用旧值时间的读取失败使用 unreadable 组，不捏造 stale 组的 `read_at`。
- **组合不存值**：描述里只有引用、形态和该显示哪些字段，值由页面另取。所以描述可以缓存，值照样是主人的当前值。
- **助理组合**（第三片）：同一个 `compose`，`composed_by: "assistant"`。服务先算出确定组合的候选，再经 agent-host 让模型挑选，输出用 `assertSurfaceDescription(候选)` 校验：候选以外的丢掉并记下，不合格就退回确定组合（IUI-05）。合同现在只是给它留了字段，第一片不实现。
- **记录**：助理组合的输入、候选、选择、理由和纠正写进组合服务自己的组合记录，不记对象正文（IUI-23）；观测采集层（第 21 批）落地后由它接进「完整工作记录」，这里不另起同名的东西。

## 7. SDK 里共用的校验

照 AGENTS 的规矩：作者和平台都要跑的工具只放一份，放在 SDK 里。新子路径 `@molis-ai/molis-work-plugin-sdk/presentation`：

| 函数 | 平台在哪里用 | 作者在哪里用 |
| --- | --- | --- |
| `validatePresentationDeclaration(manifest, catalog)` | 安装时解析 Manifest：kind 必须是已声明的，动作引用必须存在，形态里的字段必须声明过；挂载位不进声明，是贡献的 slot 上带 `accepts_forms` 的那些（第 5 节） | 本地自查；创作台生成插件时（IUI-22） |
| `presentationCatalog(actions, complete)` | `parsePluginManifest` 拿本 Manifest 的动作建目录；第 15 批 S-1 拿整份动作目录、`complete: true` | 自查时同 `parsePluginManifest` |
| `presentationValuesProblems(input, values)` | 组合服务和单独使用的页面读主人给的值，有问题的项显示为读不了（SSC-13） | 插件在测试里查自己的 values 动作 |
| `presentationOverviewProblems(declaration, overview)` | 组合服务读概况，查返回的 `start` 是声明的子集（SSC-18） | 插件在测试里查自己的概况动作 |
| `assertMaterialRef(value)` | 资料引用进对话、任务时 | 插件处理别人交来的引用时 |
| `assertSurfaceDescription(value, candidates)` | 组合服务校验助理组合的输出 | 插件在测试里检查自己挂载位上的东西 |
| `presentationText(object, item, locale)` | 文本形态（MCP、通知、导出） | 插件预览自己的文本形态 |
| `presentationFormFields(object, form)` | 组合服务和单独使用的页面算出一个形态要取哪些字段，再调主人的 values 动作 | 插件检查自己每种形态取的字段 |
| `renderPresentationForm(object, form, values)`（`/ui`，第 15 批第 2 项交，统筹 11-08 定） | 不经组合服务单独画一个形态：第一个用的是 MLN-23 的「行」，挂载位里的东西也由平台这样画好放进插件文档 | 插件预览自己的对象 |

**合同和这些校验在同一个 PR（用户 2026-11-08 定本批只开一个大 PR，盖过统筹同日「拆两个 PR」的安排）。** 已写进 `/presentation` 的：`presentationFormFields`、`validatePresentationDeclaration` 与 `presentationCatalog`、`presentationValuesProblems`、`presentationOverviewProblems`、`assertSurfaceDescription`；values 的 define/bind 和概况的 define 从 SDK 根入口出。`parsePluginManifest` 直接调 `validatePresentationDeclaration`，不设临时拒绝。用到第 14 批 T4 文字工具（`textRefProblems`、`ownedTextRef`、`tryOwnedTextRef`、`say`、`installTextForTest`，都从 `/ui` 出；`say.text` 进 HTML 插值算注入）的部分在分支上单独一个提交，14 批合入后统一编译、测试：声明里的 `label`、`note` 和操作面上的词改由 `textRefProblems` 全查（`label` 不收 `literal`，键的前缀要是本插件自己的），加 `presentationText`。那之前这几处只查是不是对象。`renderPresentationForm` 和 SSC-14 移到[第 15 批第 2 项](../post-anticorruption-roadmap/reference/batches/15.md#batch-15-item-2)（统筹 2026-11-08 定）：下表要用的预览卡、浮层、底部单、行、标签和方案 B 的色块都在 D 轨私有的 design-system 里，SDK 不能依赖它，搬进 SDK 的 `/ui` 就是那一项要交的名字片、行、卡片、速览和组件板。C-2 不留空壳或只有签名的导出。

已经定下的取值规则：

- `presentationFormFields` 返回 `{ form, fields }`：没声明的形态按 `chip → row → card → peek` 往简单的一侧降，降到有声明的为止；一个都没有时返回 `null`，平台画兜底（IUI-02）。声明了 `status` 的，它的字段跟着每种形态一起取，因为每种形态都显示状态和提醒标记。
- `OwnedPresentationObject = PresentationObject & { readonly owner: string }`，`owner` 由平台按可信目录填，声明里没有。`renderPresentationForm(object: OwnedPresentationObject, form: FormKind, values: PresentationFormValues): string` 保留三个参数；第三参包含显示所需的值、语言及已绑定控件，准确边界见下方第 15 批交接。平台画（挂载位、MLN-23）和插件预览是同一个函数。它和 `presentationText(object, item, locale)` 对值里的引用做不抛的绑定（`tryOwnedTextRef`），`locale` 必填，可以是 `null`（A 段 §2.4 第 3 条、§5.2）。插件页面不画别人的对象：挂载位的内容由平台在服务端画好放进插件文档（A 段 §8.3 的 (a)）。
- `catalog` 对每个动作引用答三种：有、没有、不知道（统筹 2026-11-08 定）。`parsePluginManifest` 里只拿本 Manifest 自己的动作当目录：引用本插件的动作必须存在、版本对；引用别的提供方的答「不知道」，不拦。安装时对着整份动作目录查的那一步归第 15 批 S-1。
- 概况动作返回的 `start` 必须是声明里 `overview.start` 的子集，每个只出现一次；`presentationOverviewProblems` 查，组合服务和作者的测试用同一个函数。

写校验时补上的规则（C-2 写的时候定，评审时核）：

- 对象种类只认本插件的搜索来源或别的动作已经声明的；给值的动作列出的种类不算，否则一份声明就能自带新类型。每种对象要有一个给值的动作，用 `definePresentationValuesAction` 写，只读 query，schema 与平台定的一样。
- `status.field` 要是一个角色为 `status` 的字段；`when.status` 只能列 `status.map` 里的状态；`input_from` 只查字段键，输入键归目标动作的 schema，在点下去时查。
- 声明里不收 `owner`、`mounts` 和别的未知字段。
- `presentationText(object, item, locale)` 写一个对象：`text.lines` 每个键一行，有 `label` 的写「label：值」，`judgment` 写「label（reason）」，没有值的字段不写；值里的词绑不上主人时显示 `common.text.unavailable`。`stale` 的项第一行是 `common.presentation.stale`（参数 `at` 是 `read_at`，相对时间），这个键集成时和第 14 批一起加进工作台的语言包，第 15 批第 2 项画「x 分钟前的值」用同一个键；`forbidden`、`deleted` 返回空字符串，说什么由调用方定。
- `presentationValuesProblems`：问到以外的对象或字段、`forbidden`、`deleted` 还带值、同一个对象答两次、`stale` 没有 `read_at`，都算问题。`bind` 已经裁剪过，这一步给不走 `bind` 的主人（如沙箱插件）同样查。
- `assertSurfaceDescription(value, candidates)` 返回 `{ description, dropped }`。形状或组的规矩不对就抛 `actions.output_invalid`，组合服务改用候选（IUI-05）。值里的每一组要对上候选里 `kind` 和 `owner_plugin_id` 都相同的那一组，同一组只放一次，对不上就抛；组的 `state`、`read_at`、`excluded`、`hidden_above` 一律取那个候选组的，值里写的不算，组的规矩查在这些事实上，所以拿候选当值自查也查得出来。对象只留在和它的候选同 `kind`、同主人的组里，且候选有同一主体、主人、形态、状态、字段和合并对象；放进别的组（「等你」的 attention 组也一样）就照候选以外丢掉并记下。操作只在那个候选有同一 `ref` 时保留，并用候选的预备输入和后果。值能决定的只剩：组的先后、组里挑哪几件及其先后、操作挑哪些、哪个是 primary、`title`、`reason`（评审台 11-08 退回后补，统筹认可）。一件东西至多一个 primary，同一个对象只放一次，`corrections_revision` 和候选的一样；`composed_by`、`revision` 照值里的，显示出去的 `revision` 由组合服务按结果定（IUI-04，第 15 批 S-1）。丢掉的记进 `dropped`：对象，或对象加操作的 `ref`。

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

### 第 15 批渲染入口交接（2026-11-08）

公共合同台在 `85d54e86e0f10e53c1fb4ec8bd9b4271b8bd4074` 对本段的渲染输入及可信父文档承载设计合审通过，无 Blocker/P1（`gpt-6-astra / high`，只读）；与组合和安装边界一并记录在[组合服务 §14.2](../surface-composition/spec.md#142-s-1-装配缺口与合同合审2026-11-08)。设计通过不代替组件、挂载执行和最终合同代码的合审与实操。

本节把原三参数签名与必填 locale 的缺口补全，不改变 Manifest、values 或 `SurfaceItem` 的线协议。设计依据是 S-1 `ccfd93200936` 和方案 B 实件标本 `49beab1c55`；以下仍待公共 API 合审和实际实现验证。

`PresentationFormValues` 是一次渲染的显示投影：必填 `locale: string | null`、`ownerDisplay: { name: string; icon?: PluginIconName; hue?: UiViewHue }`、`read`（`PresentationValueItem` 的 state／values／read_at，或明确的 `{ state: "unreadable" }`），可选 `actions` 与 `notices`。控件为 `{ key: string; label: string; primary?: boolean; consequence?: readonly SurfaceConsequence[] }`；notice 为 `{ reason: OwnedTextRef; next?: 控件 }`。`key` 只是一处位置自己绑定的局部 DOM 句柄，不能充当 provider、ref、prepared_input、执行权或自造 URL；renderer 不执行、不取数据、不注册动作。

`ownerDisplay` 的名称与图标来自现有可信插件目录和确切 Manifest，不从 id 猜名字，也不新建 SDK 主人登记表；缺图标用既有 package 表达。呈现色由平台按 §10 第 1 条分配，不拿标签条的 Manifest hue 代替；用户已选择保持颜色稳定、允许偶尔同色。字段按现有 role 与 `presentationFormFields` 画一份内容；未绑定 TextRef 经 `tryOwnedTextRef`，已绑定的 notice 直接经 `say`，HTML 只转义一次。日期和数值复用 `format` 的内部原实现及相同文字环境，按显式 locale 解析；locale 为 null 时用 owner 默认语言，所需读取 helper 留私有，不直接套用只读全局页面语言的公开 `format`。投影中的已译按钮字只用于当前 DOM，不存回业务事实。

平台把实际 `SurfaceItem.actions`／`notices` 和当时可用的精确目录行绑定到控件，点击时经网关重核授权、重取当前输入。独立 MLN-23 读取同一声明和值，沿用其原菜单与切换动作；插件预览只画自己对象，无绑定时只显示。`stale` 必须有主人真实 read_at；仍可保留按组合服务 §6.4 核实可用的操作，禁止的是失效操作，不是所有操作。首次失败、撤权、删除与未声明分别处理；forbidden／deleted 优先截断 values、actions、notices 及隐藏属性。挂载位跨插件执行当前没有通用入口，须按下一段补齐，不能以 `pageIntake` 或 `embed-open` 冒充已接通。

**挂载位的可信承载。** 复用工作台一页唯一的 `pageFramedAreas`、`childPlaces` 和现有页面凭据。SDK `UiPageView.surfaceSlot(element, { slot_id, subjects })` 只提交至多 50 个闭合的 `{ kind, id }` 目标引用和声明位置；引用是不可信输入，不是授权，仍按组合服务 §6.1 检查、去重及 `refuse_kinds`／`max` 过滤。子 frame 只发 open、geometry、close；父文档从实际 page 绑定安装、项目、贡献、producer 和该贡献的 `accepts_forms`，在不可由插件访问的 sibling 里使用同一 renderer。自动展示用当前用户已有授权读取，不给插件身份加权限、不凭输入选择 actor/project/install，也不产生 user_action。原目录仍供选择操作，只有 values 子调用受 query-only／只读约束；自动 values 同时拒绝显式 external、模型和计费。

子端 ready 只表示声明位置获准预留，不等待数据查询；高度只由宽度与该位置预先确定的形态决定，不取决于授权、结果、条数或错误。不向子页面返回 HTML、对象值、候选、按钮、路由、操作结果或焦点回执。父文档沿现有 contextual header 新增窄读／执行接点，插件 fetch 桥不能转发该凭据。真实点击先经现有 `area.gate`，核当前可见、无遮挡、稳定、busy 和局部渲染绑定；绑定包含当前页面/安装/项目/贡献/slot/渲染代次及精确动作。Host 在正常用户动作网关前核页面仍有效、当前候选及动作/输入映射，点击重取值，过期或未知句柄拒绝，不开放任意 ref/input 的代理。重绘、切项目、停用、撤权和关闭要使旧绑定及在途请求失效；结果只在父文档处理。共用现成裁剪、相交隐藏、真实点按与焦点保护，不另建平台区域或授权目录。

验收复用 IUI-07／08／10／13：同项目合法对象可显示；越权引用与空结果向子端给相同协议回执；未声明、跨贡献、伪安装和过量引用拒绝；外发 values 未被调用；脚本点击、pointerdown 后重绘、旧代次、遮盖和撤权期间均零写；真实父键盘点击只执行一次、回执和跨位置更新正确。公开 renderer 的合审不替代这些挂载位路径的验证。

**surfaceSlot 实施合同补充（2026-11-09 前置合审）。** 对照 `c07dbad4a8`，现行 `UiPageView` 只有 `embed`；上面的 surfaceSlot 仍需实现，不能把声明当作已有能力。独立设计与只读合审未发现方向性 Blocker/P1，按下列约束进入第 15 批唯一 writer 实施；此结论不是产品、安全验证或最终公共合审通过。

新增页面 API（签包作者入口另见下文补充）：

```ts
surfaceSlot(element: Element, options: {
  slot_id: string;
  subjects: readonly ActionSubject[];
}): { ready: Promise<void>; dispose(): void };
```

沿用现有 `ActionSubject`、slot 标识及对象数校验，允许空数组，超过 50 或含未知字段整次拒绝，再按组合服务原规则去重。同元素再次调用先释放旧挂载；更改引用用新调用，不增加 update API。dispose 幂等，元素离开 DOM 或 page scope 结束自动释放；待定 ready 在本地释放时以 AbortError 拒绝，已完成的 ready 不再变化。Host 拒绝向子端只映射固定 unavailable，不泄漏诊断。`UiSlotDescriptor`、`SurfaceRequest`、`SurfaceItem` 和 Manifest 不加字段；SDK 与 contracts 的实际导出、API 快照和作者文档随实现同步，本页面方法不提升现有动作或 API 版本。签包持久化格式的新增面按下文单独核定，不能由此推导全部格式均不升版。

私有 MessagePort 上行只有 `surface-slot-open {id,slot_id,subjects}`、`surface-slot-layout {id,box}`、`surface-slot-close {id}`，下行只有 `surface-slot-ready {id,error?:"unavailable"}` 与 `surface-slot-size {id,height}`。沿现有 FrameBox；id 为端口内不重用的递增正 safe integer。重复 open 拒绝，关闭／替换后的消息与异步返回失效。没有子端 click、prepare、execute 或 peek 消息。ready 在声明预留校验结束后、任何业务查询之前答一次；height 只取声明预定形态档和盒宽，不能按值、数量、结果或错误测量。沿既有宽度分档、已批实件布局取固定高度，内部滚动；不足宽时为零。不回传焦点、存在标志或执行结果。

父端在一页唯一 `pageFramedAreas` 中申请区域，与其他种类共享原四区配额，复用裁剪、相交隐藏、稳定期、真实 pointer／keyboard gate 和 childPlaces，不另建区域登记。可信 PageSelection 从实际选中的 owner contribution 记录私有 slot 来源：contribution、surface、target slot、producer、原贡献 slots 和准确 installation／scope／activation。预签发的签包页也须在实际选定贡献时绑定，不能凭 plugin_id 猜贡献；没有来源证明的 preview 或旧页不能申请 slot。Page 只提供按 slot_id 取得本页原声明的窄操作，不开放任意安装／贡献查询。

父端新增工作台内部 `POST /api/contextual/surface-slot`，沿原 contextual header fence 和 page authority：只接受受保护的 `x-molis-context-page`，与当前项目／页面／贡献绑定；普通插件页头、双头、错项目和关闭页面均拒绝。插件 fetch 桥不得转发该头，Home 对 pluginPageRequest 的拒绝不变。HTTP 各意图闭合校验：reserve 收本地挂载 id、slot_id、subjects；read 收 page 内 slot 句柄；activate 收 slot／render／control；confirm 收 slot／render／preparation；cancel 收 slot／preparation；close 收 slot。不得传任意 actor、project、install、ref、input、subject 或 URL 到执行意图。

reserve 只核页面、原贡献声明、输入和容量，零业务读取；父端取得当前 Page 内的随机句柄与固定高度档后先发 ready，再 read。Page 最多保存四个挂载记录，记录随原页关闭、撤权或 activation 更替清理，不是第二授权目录。read 只向父端返回当前 render 句柄、共用显示投影与可信控件标签／后果；实际动作及输入映射留在 Host。activate 只能选择本 render 返回过的 control，沿原对象打开／速览、offer 或 placement 服务；confirm 只消费本次准备的句柄，cancel／close 不执行业务动作。有限输入选择沿原受保护 picker，不开放 JSON 代理。并发／重复 confirm 对原准备只消费一次，未知或过期句柄拒绝。

组合位置仍是原 `plugin-slot`。只在本次可信采样目录的 slots 投影中保留本页准确安装及原贡献声明；其余 presentation／对象来源保留，但不让同 plugin_id 的另一 scope 或同名贡献决定此处形态。投影前后检查原目录与页面，内置和签包同路。抽出首页已用的采样、显示与准确打开接点供真实消费者共用，一次 read 只做一次目录发现与 compose，显示字段继续按准确 ActionView 合批和对象自身形态裁剪。

**两层寿命是合审的必要条件。** `PluginPageAuthority.bind` 在 HTTP finish 会中止请求，`localWebAuthority` 闭包也捕获创建时的 signal。因此 page／slot 长寿命 caller 必须从最初以 page／slot signal 创建 `openProjectPersonContext`，不能由短请求 caller spread 后换 signal；compose 用于保留目录的 context 也不能被 `bindActionClient` 控制参数合并回 HTTP signal。每次实际查询与交付另用短请求、slot signal 及 deadline 的读 guard；请求结束不留下写权限。只保留原登记、声明、候选绑定及其原 token guard，不保留已经结束请求的 effectGuard，不使用后台 authority 续命。后续真实点击重新创建当前人 request caller，并叠加原 page／slot／目录 token guard，再走原网关和 beforeEffect。

非 Home compose 当前还没有首页的采样注入、catalogCurrent 和共享 deadline，实施时须一并推广到本次受保护位置；compose 与最后显示读取共用同一预算，compose 返回时不能提前 dispose。prepare／confirm 虽调用原服务，其 discover 也必须返回受原 guard 约束的同一目录，不能通过重新发现替换原 registration、reader 或 values。任意 read 开始先让旧 render 与 preparation 失效，成功才发布新绑定；隐藏标脏、清敏感 DOM 并取消读取，再显示时重读。切项目、关闭、停用、撤权和贡献变化先清绑定并中止请求，旧响应不能覆盖新状态；只有 owner 的真实 stale／read_at 可显示旧值。

现有 `area.redraw` 不会清除 pointerdown，slot 层须额外保存 pointerdown 的 render 并在点击时比对；键盘绑定更换后重新计稳定期。真实父端按钮同时通过 isTrusted、area.gate、可见／无遮挡／非 busy 与当前 control 映射。准备／确认等待后重核当前人、页面、安装、贡献、对象、原读口、动作输入映射与 revision；提交后失权或断线只核实，不自动重做。刷新按逻辑对象／操作保焦，但不恢复旧 render key，也不在用户离开后抢焦点。

调用数：首次 reserve 零业务读，再一次 read／compose 与有界显示合批；几何变化零 Host 调用；打开／速览一次 activate 及必要原读取；写操作沿原 prepare 和一次真实 confirm，不叠加另一套执行。验收除前述 IUI-07／08／10／13，还须实际覆盖同名不同贡献、双 scope、同版本换 digest／activation／registration、普通 fetch 头与未知字段拒绝；对子端比较合法／空／越权／删除／超时的相同 ready／size；证明首次 HTTP 结束后当前按钮仍可合法使用、撤权后不能凭页面寿命继续执行，及 pointerdown 后重绘／旧 preparation／并发确认零额外写。Goals 自身直接复用同形态 renderer，不伪造 slot；Inbox 在真实原件详情声明并使用 slot。最终仍须真实写入、跨位置回执与三宽中英深浅／键盘验收。

**签包作者与真实挂载路径补充（2026-11-09，前置窄审及限定同版例外已批准）。** 实施核查发现现行 `interface.json` 严格字段只有 parts／nodes／presentation／acceptance，组件没有调用 surfaceSlot 的入口，已安装沙箱 Runtime 又把 slots 固定为空。只验证未声明时拒绝，不能交付 IUI-13 的签包正向路径。原稿“仅新增一个公开 API”的结论因此更正；以下最小补充经独立前置窄审，一骏已批准下述两个 Builder 格式本次保持版本 1，继续实施真实签包正向路径。

签包界面文件与 AgentDesign 增可选 `ui?: Pick<UiContributionDeclaration, "slots">`，只承载现有 slot 类型，不开放作者重复填写 contribution id、kind、label、surface、owner 或安装。当前沙箱仅承载对象形态，`accepts` 必须为空、`accepts_forms` 非空；其余收法沿现行合同。part／node 增 `surfaceSlot?: { slot_id: string }` 及专用 `surface-slot` 组件 kind，引用同一 ui 声明，沿原 reading intent／read binding，禁止 submit，不复制收法。未使用的合法 slot 无须拒绝安装。引用 query 沿原 operationId／input／outputPath，静态核真实 query 与闭合 kind/id 数组类型；不要求 schema 为通过此绑定另写某个长度字面量，运行时仍严格检查最多 50 个非空、闭合引用，接受已有更严约束。

SDK 以唯一校验／派生入口生成完整贡献声明：id 沿 `sandboxUiContribution`，kind 为 primary-page，label 取既有名称，slots 取已校验的 ui，workbench surface 采用平台既有格式与位置。Manifest 继续由原生成器产出，不能再加第二份 slots 表。CLI pack、安装读取、Studio 的原 `builderReleaseInterface`、发布、保存／portable 同步、安装停启及重开必须保留同份 ui 与组件引用；签名继续覆盖原 interface 字节，不改签名格式，不增加 hash 或授权目录。签名包同版本不同内容仍由原包存储拒绝。

保留现有 `/plugins/:id` framed stage 为签包页面的唯一实际装配。项目 `agent-surface` 与 Home 的包文档渲染从同一实际 Runtime owner 捕获 descriptor、producer、render 及原安装／activation；Home 的包渲染分支须把已画的 contribution/workbench 纳入现有去重，不能随后再由 generic stage 画一次空 main。原导航、直接打开和重开都须进入同一实例、只出现一页。PageSource 从这个已验证 descriptor 取得 slots，不回头从 design 或 plugin id 猜；原 `captureRuntimeStageOwner` 与原发行物检查必须保留，Manifest digest 本身不覆盖 interface，不能仅凭该 digest 判定声明不变。

签包客户端在合并 `{...host, ...embedded}` **之前**捕获真实 `UiPageView.surfaceSlot`，以独立窄函数参数交给组件；embedded.view 是组件数据，会覆盖 host.view，不能从它取得页面方法，更不能把函数放进持久化 interface。组件 query 只取得该插件本来有权读的引用；surface-slot 分支不把它渲染为通用表格或正文，调用公共方法后仍只接 ready／固定 size。切选择、重读、重绘、关闭先 dispose 原挂载；父端值、数量、按钮及结果不回流 query、selection 或 onRead。无声明的现有包仍没有挂载权。

版本边界已核实：interface 没有独立版本，但新增的 design／part／node 结构进入 `format.builder.saved-state` 与 `format.builder.portable`，当前均为 1。一骏明确批准仅这两种格式本次保持 1：允许可选 `ui.slots`、组件 `surfaceSlot` 引用及 `surface-slot` kind；旧的无挂载位数据继续是现行格式的合法子集，不改写原数据、历史发行物或签名包，不新增升级或读时转换。未知字段、非法引用／组件、签名不符和错误版本仍严格拒绝，拒绝不改变原内容，不触碰真实 Home。本次例外独立登记在[合同变更规则](../../docs/system/CONTRACT-CHANGES.md#当前保留机制)，不借用 IM 例外、不扩到其他格式或后续变化。最终验收包含真实外部 pack→签名→安装→原舞台父组件正向，项目／Home 双路径、发布／保存／同步／停启重开往返，以及未知字段、跨贡献、篡改、旧代次和子端回流拒绝；不以测试注入 descriptor 代替实际生产路径。项目与 Home 签包分别使用不同插件 ID 验证真实安装与挂载。同一 canonical ID 的签包改换范围，仍由现行 BL-628 的 `assertScopeKept`／`SandboxPackageStore.scopeOf` 拒绝（包括不同版本或签名），验证拒装且零变更，不为此验收放宽安装合同。同 ID 双 scope 的准确页面绑定与隔离正向使用现有原生路径证明，签包另验原页面 scope 错绑拒绝；两类证据分别记录。

签包候选 `07799208cbc7fc9aa18ccacbda39d45f0843a353` 已完成上述生产接线，独立限定复核无 Blocker/P1，尚未合回本批。实际整体构建及两份定向文件 3/3 通过：外部 CLI 打包、签名、project／Home 两范围真实安装和原直接地址，浏览器各显示唯一原载体，原 query 经可信 reserve/read 在父组件呈现，子页面没有原件标题或按钮；Inbox 做完／忽略各使原记录 revision 仅增加一次并出现真实回执。普通子传输、跨贡献、签名篡改和同 ID 换范围被拒。Studio 发布采用同一 `builderReleaseInterface`，v1 草稿重开与 portable 恢复保留 ui／组件引用及原签名字节，非法写入和错误版本在副作用前拒绝。已修复原页面启动误认 UUID 长度和 Studio 发布漏传 ui；首轮回执断言也未通过，不把首轮失败计为通过。

这轮证据仍不包含签包停启重开、侧栏真实点击及旧页面代次拒绝；已有原生用例不能替代它们。Studio 离线答卷回放已执行，替身模型 smoke 3/3 只证明接线；真实模型证据另记如下。最终健康、资源、中英深浅多宽实操及全批公共合审另验。测试入口为 `tests/security-invariants-signed-surface-slots.e2e.test.ts` 与 `tests/signed-surface-slot-authoring.test.ts`，目前在上述子分支候选，合回时同步进入本批。

同一固定候选 `07799208cb` 在独立工作树整体构建后，完成真实 Studio smoke：笔记、阅读摘记、收支记录 3/3 均冻结为设计，详细设计首答接受 2/3，共 4 轮修复；只有收支记录全阶段首答接受。笔记的三轮修复为验收步骤语法，阅读摘记的一轮修复为体验方案漏掉已选新增入口，校验未被放宽。配置选择 `MiniMax-M3.1-Flash-Preview`，服务实际报告 `MiniMax-M3.1-Flash`，13 次设计者调用及修复答卷保留在本地评审材料。用户授权复用历史隔离 QA 的单项模型配置及凭据，在新临时 Home 中通过现行 owner 接口建立连接；原 QA 只读、真实 Home 未触碰，完成后临时凭据已清理。该命令只到设计冻结，不证明生成插件的构建、安装、运行或模型主动采用 surfaceSlot；本次 Node 24.14.0 构建和执行成功，但出现仓库要求 24.15.x 的引擎提示，不替代最终标准环境验证。



最小迁移范围是 `renderPreviewCard`、`renderPopover`、`renderSheet` 及形态实际使用的 `renderMenu`／`renderMenuItem`：将原实现移到 SDK 的一个 UI 叶子，design-system 原入口同源重导，普通消费者签名与 HTML 保持；不复制第二套实现。其它 dialog、drawer、菜单组及客户端 tooltip、焦点、浮层工具保留原 owner。形态内容只画一次，位置层选择 popover 或窄屏 Sheet；`mw-tag`／`mw-item` 复用原样式。样式叶子只用语义变量和环境继承，消费第 16 批 font roles 的 size／lineheight，不建第二份字体、皮肤状态或缓存。`UiSpecFile.components` 只登记元数据，实际 kind 渲染与允许操作仍由实现负责。

文件边界：SDK `src/ui/presentation-form.ts` 与最小 primitive 叶子、design-system `src/styles/presentation.ts`、同 renderer 的组件板样张。SDK `/ui` 导出及私有文字接线、API 快照、design-system overlay 重导和样式入口、组件板装配、语言键与页面消费者按第 10／16 批实际窗口串行；第 16 批 C 切换之前不接新稳定键或页面入口。不得提交只有签名或无人消费的永久空壳。SSC-14 验不经 compose 的行与组合行相同；IUI-03／07／08／10／26 分别验跨位置事实、绑定与后果、异常泄露和三宽双语双主题及键盘；原标本的局部浏览器结果不替代产品验收。

## 8. 存量数据

`is_default` 改成 `roles`，属于改库结构。第 02 批已经定下真实 Home 清空重建，各库从统一起点的第 1 版开始。所以这一步：

**真实 Home 重建不等这份合同（用户 2026-11-06 定）：#1837 合入就按检查单重建。** 分界仍是 02③（统筹 2026-11-04 定），但顺序定了，这份稿子动表的部分都落在重建之后，不再进第 1 版：

- `workspaces` 的 `is_default` 改 `roles`、默认输出目录那一行、删 `project_browsing_settings`、新增 `material_recent_uses`：都走 U1 升级段，并过金样回放（U2）。这几段用户已同意，写的时候不用再问。
- 默认输出目录那一段（第 3 节「默认输出目录怎么存」）只读写库，不拿 Home，不建文件夹：对每个没有 output 的项目写一行和一条关联。SQL 算不了 sha256，所以写在段的 `run` 里，id 由 `project_id` 和这个项目最早的事件算出来，都是库里已有的列（U1 §8.1）。每个项目都有事件：`insertProject` 只在 `register` 里，同一个事务写第一条。手改的库没有事件时按 §8.1 抛，这个目录库升不上去，不另写恢复。`workspaces` 不同步，所以每台设备跑出不同的 id 不违反 U1 §2.4「段要确定」：那一条说的是进同步的表。`workspaces` 的各列照第 3 节的「存什么」写，时间取项目的 `created_at`；关联的 `membership_id` 是 `workspace-output-membership-<同一个哈希>`，`bound_by` 是 `molis-work-upgrade`。回收站里的项目也补，不滤 `project_recycle`。这种写法和绝对路径撞不上 `UNIQUE`，`outputs/` 又是新目录，不会有用户早就加过的行，所以这一段不会让目录库失败。
- `workspace_source_links`（第 3 节，用户 2026-11-07 定指定文件夹）同样走升级段，建一张空表，随「实现（指定文件夹）」那一片写。不搬数据，也不是读取兼容，统筹 11-07 定不单独问用户。
- 组合服务纠正表属第 15 批，到时同样走升级段。

这些段写在 05② 的实现片里，那一片要等 U1 和四份门禁就位（U1 设计第 14 节）。**合同片不动表，也就不等 U1。** 不加读取兼容。`modules/projects` 现在没有升级段（#1805 第 6 条），实现片先给它登记第一段。

万一 C-1 的合同片赶在重建之前合入，也不要趁机把表写进第 1 版：重建随时会发生，分两条路只会多出一种要核的情况。

本稿里另外两处存量：

- **删掉的浏览设置表**（第 4 节）：重建之前落，第 1 版建表里直接不建；之后落，升级步删表，不搬数据（它本来就是页面状态）。
- **Files 退役**（#1805 第 7 条）：去向写在[第 06 批第 1 项](../post-anticorruption-roadmap/reference/batches/06.md#batch-06-item-1)。要点：产生动作和版本读取归平台的资料服务，用现有的过程项设施（产生者的身份要先在合同里补，见那一节）；原来的输出绑定在同一次切换里改到新动作，不留别名；侧栏的文件来源归 `horizontal/knowledge`；历史过程项按维护步处理，涉及真实 Home 的进维护时段，先问用户。

## 9. PR 怎么拆

按轨道规则 1，合同先落，服务接着，消费者最后。第 05 批剩下的工作按用户 2026-11-08 的决定合成一个 PR，统筹最后统一合 main、跑门禁和全量；下表的「片」照旧说明内容、先后和依赖。

| 片 | 内容 | 前置 |
| --- | --- | --- |
| C-1 资料与目录合同（**不碰 `packages/storage`，也不等 U1**：建表语句在 `modules/projects`，由 `apps/local-host/src/project-database-schema.ts` 汇进项目库基线；动表的部分不在这一片，见前置列） | `platform/project-materials.ts`；`modules/projects` 的 `ProjectDirectory`、`ProjectDirectories`（含 `source_links`）、`RunDirectories`，第 3 节的七个动作（`set_output`、`map_source` 的目标三选一）与 `materials.recent@1`、`materials.recent.record@1` 的声明；三个错误码；SDK 新的 `presentation` 子路径放 `assertMaterialRef`；api 快照（`contracts/modules/projects.txt`、新 `contracts/platform/project-materials.txt`、新 `plugin-sdk/presentation.txt`）。**只加不删**：现有动作、字段和端口都不动，不碰 `services/agent-host`。动作只声明、不登记，所以动作快照不变 | 不等 02 收尾（用户定放行，撞了就让路）：排在 #1837 之后入队，合入前补 4 处 `version: 1` 的 `@version` 标记和 `tooling/versions.json` 条目。`material_recent_uses` 表挪到实现片走 U1 升级段（用户 2026-11-06 定重建不等 C-1）；这一片只声明动作 |
| C-2 呈现声明合同 | 一个 PR，和 C-3、第 05 批剩下的工作同一个（用户 2026-11-08 定）：状态环取值下沉（`platform/ui-state-rings.ts`，SDK `/ui` 从 contracts 取）、`platform/presentation.ts`、Manifest 的 `presentation` 字段、values 的类型与 define/bind、概况动作的定死 schema 与 define、SDK `/presentation` 的共用校验（第 7 节），`parsePluginManifest` 直接调 `validatePresentationDeclaration`，不设临时拒绝；api 快照。用 T4 文字工具的部分（文字引用全查、`presentationText`）单独一个提交。挂载位的收法加在 `platform/ui` 的 `UiSlotDescriptor` 上（`mounts` 并进 `slots`，统筹 11-08 定），这个类型连同注释搬进 `platform/ui-slots.ts`、由 `ui.ts` 转出，`ui.ts` 不过巨大单元的 800 行（评审台 11-08）。`renderPresentationForm` 和 SSC-14 移到第 15 批第 2 项（统筹 11-08 定），不在这一片 | 02 交接（已交）。T4 那个提交等第 14 批合入，统一合 main 时编译 |
| C-3 组合服务合同 | `services/surface-composition.ts`、`SurfaceGroup`、`surfaces.compose@1`、`surfaces.correct@1` 的声明（只声明不登记，动作快照不变，`tooling/gates/version-exceptions.json` 两条例外由 S-1 登记时删）；context-ledger 的关系类型表（placement 的两种边改从表里取）——和 C-2 同一个 PR，`assertSurfaceDescription` 也在里面 | C-2；第 14 批 A 段的 `TextRef`（T1 已合入；`assertSurfaceDescription` 查词的那一步在 T4 那个提交） |
| 实现 | 组合服务包（第 15 批）；`modules/projects` 的服务与界面接线（WMD 的实施切片），含 id 与路径脱钩、`outputDirectory`、登记 C-1 声明的动作；重写 `workspace-repository.ts` 的查询（`is_default` 换 `roles`）时，保留 `:22,57,69` 三处「回收的项目不算」的过滤（`project_recycle`，#1877 加的）；默认输出目录写在 `register` 里，升级段连回收的项目一起补（第 3 节）；第 3 节的路径到行、碰磁盘的调用方和永久删除；第 2 节的 `fingerprintWorkspaceFile` 和 `binary`、`unsupported` 带指纹（改 `WorkspaceFileResult`）；这一片不产出 `unmapped`；加读出处的动作之前先定第 2 节那几件并过评审；删除确认框多的一问和留下文件夹的提示是新状态，定样已定（A3，第 3 节「定样」）；`goals.inputs.bind` 写指纹不在这一片；`RunDirectories` 随轮次视图和冻结轮次信息的字段加进 `services/agent-host`；收资料引用的地方都调 `assertMaterialRef`，它比 schema 严（查 `workspace_file` 的 id 落在目录内），只靠 schema 会放过 `ws1:../secret`；宿主的 `PROJECT_WORKSPACE_PROVIDER_ID`（`apps/local-host/src/project-workspace-actions.ts:7`）改成从合同取；同一次切换里删 `projects.settings.browsing-workspace.*` 和它的表、`projects.workspaces.add/repair/unlink`、`projects.workspace.read`、`is_default`、`preferredWorkspacePath`，改完所有读它们的地方（宿主的 `project-capabilities.ts`、`workspace-settings-events.ts` 和 Files、Git、Coding，第 4 节）；Git 显式带目录；Goals、Inbox、Coding 的第一片声明。Coding 的浏览与执行拆开归 B 轨，`assistant-executor.ts` 的部分归 A 轨。第 8 节的升级段在这一片写 | C-1～C-3 合入；升级段另等 U1 和四份门禁（U1 设计第 14 节）。**发布排序：合入早于首次外部安装**，否则外部用户也有第 3 节「脱钩之前建的目录行」那个缺口；这条依赖由统筹写进路线图依赖或发版清单，不只留在这里 |
| 实现（指定文件夹） | 第 3 节「另一台设备上的引用」：`workspace_source_links` 和它的升级段、登记 `map_source`、`unmap_source`、`resolveWorkspaceFileSubject` 和四处读的地方、产出 `unmapped`（从这一片起，解析不出的不再显示「找不到位置」）、`goals.inputs.bind` 多 `read_revision`（动作快照跟着改）、界面（六个状态的定样已定，B1，第 3 节「定样」） | 上一行的目录实现片合入（目录 id 脱钩和默认输出目录都在那一片）；U1 和四份门禁 |

**C-2、C-3 留给第 15 批 S-1 的事：** 安装时对着整份动作目录查声明里的动作引用（共用校验里引用别的提供方的只答「不知道」，第 7 节）；`excluded` 按受众给（件数和插件 id 只给 user）的行为；SSC-07 的确定性、SSC-08、SSC-09、SSC-11、SSC-19 的证明（SCS-01、SCS-03、SCS-05、SCS-07），合同里不加算 revision 的纯函数（统筹 2026-11-08 定）。挂载位的收法（`accepts_forms`、`max`、`refuse_kinds`）由服务守，SSC-09 由 S-1 证明（SCS-05）。

**C-1 合审留给实现片的事（[#1894](https://github.com/molis-ai/molis-work/pull/1894#issuecomment-6704624854)，2026-11-07）：**

| 事 | 谁 | 什么时候 |
| --- | --- | --- |
| `MaterialOrigin` 的 schema 改一个条件，让 `state: "missing"` 可以不带 `directory`，`project-materials.ts` 的注释跟着改，加用例：这个项目还有这一行时带 `directory`（名字和角色都在，页面拿 `workspace_id` 去 `repair`），已经没有这一行时不带，两种都测。不改的话这种引用让 `materials.recent` 整个响应报 `actions.output_invalid`。API 快照不变 | 目录实现片 | 开工时 |
| 主人插件卸载后 `owner` 是必填的，却查不到。定一种「读不了的项」的形状，和 `materials.origins@1` 一起定；如果 `owner` 改成可选，`platform/project-materials.txt` 改一行，和 N22-03 排先后 | 合同台 | 实现片加这个动作之前 |
| `materials.recent` 要向各主人现读，声明 `scheduling: "concurrent"`，否则占项目队列。`record` 如果也改并发，要走 `beforeEffect()` | 目录实现片 | 开工检查 |
| 把 `projects.workspace.read` 并进 `get` 时，前者有 `workflow` 受众，后者没有。要么加上，要么在 PR 写明工作流程步骤读不到目录 | 目录实现片 | 开工检查 |
| `MaterialRange.length` 没写单位，第一个写 `range` 的片定下来，在 `project-materials.ts` 写一句注释 | 第一个写 `range` 的片 | 那时 |
| `expected_revision` 过期不用新码，用平台的 `actions.conflict` | 目录实现片 | 照写 |
| `assertMaterialRef` 不查 `workspace_file` id 里目录 id 的部分：201 字符或带控制字符的目录 id 能过，而 `map_source` 的 `folderId` 上限是 200，这种引用接不回来。`tests/action-project-materials.test.ts` 两处：输出校验的 18 处 `assert.rejects` 没断言错误码（实跑是 `actions.output_invalid`）；另外五个命令和 `materials.recent`，agent、mcp 只查了发现列表，没真调 | 目录实现片 | 碰这些文件时；后一处写安全不变量时补 |

## 10. D 轨的答复（2026-11-04 共审）

1. **插件色：平台分配，Manifest 不声明。** 用户 2026-11-08 在第 15 批会话选择「颜色稳定，允许偶尔同色」：同一个插件换设备、重装、增删其它插件后颜色不变，允许不同插件分到同色，继续由图标与名字辨认。此决定取代原“色盘够用时两个已装插件不撞色”的要求。按规范 plugin id 确定地选取现有语义色盘，不新增安装字段、持久化映射或同步；色盘和状态色分开，浅色和深色都要分得清（IUI-26）。合同仍只给 `owner_plugin_id`，不加颜色字段，不改变标签条自身的 Manifest hue 规则。
2. **字段角色：四种形态够画，「行」缺一个角色。** 已加 `activity`（第 5 节）；行的第二行固定读 `actor`、`activity` 和时间。之后 D 轨又定了 `judgment` 和 `held_in` 两个（第 5 节），一共 18 个。
3. **第一片的位置：同意插件内、对话、项目讨论、等你四处**，首页和 Shelf 进第二片。「插件内」是 `plugin-slot`：插件的贡献在 `UiContributionDeclaration.slots` 里带 `accepts_forms` 的 slot；原来答的「挂载位」不另起声明，`mounts` 并进 `slots`（统筹 2026-11-08 定，第 5 节）。另外，MLN-23 不经 `surfaces.compose`，直接按声明画「行」（第 5 节、第 7 节）。
4. **`surfaces.compose` 第一片只给 user 和 plugin：同意。** 外部 Agent 走 `presentationText`。

## 11. 开工前检查 14 项

按[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)的 14 项作答。实现片开工时按这里守，评审也按这里对。

| # | 作答 |
| --- | --- |
| 1 事实主人 | 目录配置与「最近用过」归 `modules/projects`；本机文件读写归宿主工作区服务；跨来源查找读取归 `horizontal/knowledge`；对象与正文归各自插件或 Module；操作面组合与纠正归组合服务（第 15 批）；过程项归 `modules/artifacts`。本合同不新建资料库、不复制正文 |
| 2 插件同等待遇 | 资料引用、「最近用过」的写读、呈现声明、挂载位，内置、生成、第三方插件都走同一个动作和同一个 `validatePresentationDeclaration`；宿主不按插件名分支 |
| 3 能力注册 | 第 3 节七个目录动作、`materials.recent@1`、`materials.recent.record@1`（`system.project-workspaces`）；`surfaces.compose@1`、`surfaces.correct@1`（组合服务，`system.surfaces`）；values 动作和概况动作由各插件在自己的声明里注册（`definePresentationValuesAction`、`definePresentationOverviewAction`）。都注册一次，页面、工作流、Agent、MCP 共用。实现片还要加读出处的动作，加之前先定（第 2 节） |
| 4 合同 | 改。新子路径 `platform/project-materials`、`platform/presentation`、`services/surface-composition`，SDK 的 `presentation`；改 `modules/projects`、`modules/context-ledger`、`services/agent-host`、Manifest、`platform/plugin-events`、`platform/ui`（状态环取值；`UiSlotDescriptor` 加挂载位的三项收法，只加不删）。按 N35 原地改形状，旧名不留；按第 9 节拆片，按快照一次一个 PR。C-1 只加不删，旧名和 `services/agent-host` 的改动在实现片；C-2、C-3 的合同和 SDK 的共用校验同一个 PR，用 T4 的部分单独一个提交 |
| 5 放在哪个包 | 合同在 contracts；共用校验在 SDK（只依赖 contracts）；状态环取值下沉到 contracts 的 `platform/ui.ts`（D 轨）；组合服务进 `horizontal/`，宿主只装配 |
| 6 表与存储 | `workspaces` 去掉 `is_default`、改 `roles`；删 `project_browsing_settings`；新增 `material_recent_uses`（项目库，`modules/projects`）和组合服务的纠正表（项目库与它自己的 Home 库）。都登记进 `table-owners.json`，都走升级段（第 8 节）。新目录 `outputs/`：默认输出目录，登记进 `homeStores()`，第 3 节。新表 `workspace_source_links`（目录库，`modules/projects`），第 3 节 |
| 7 兼容与迁移 | 不加读取兼容。哈希 id 照旧当不透明字符串用，不从路径推，不算兼容路径。重建之后才落的，走 U1 升级链，这几段用户 2026-11-06 已同意（§8），写的时候不用再问 |
| 8 安全边界 | 碰。只有输出目录可写，有拒绝测试和不变量一行（SSC-15）；撤权、移除后马上拒绝（SSC-04）；`materials.recent` 给 plugin 不泄露无权项（SSC-12），`excluded` 件数只给 user；`record` 先按调用方授权现读、读不了不记；`host.workspace.changed@1` 的载荷改动核 S-54；默认输出目录的路径由可信 Home 推导，读、建、删都先核（SSC-21）；不写回目录库（SSC-22）；MCP、CLI 删不了这些文件，选择由入口给（SSC-23）；指定文件夹只有 user 能改，目标过校验，写入不认原设备的 id（SSC-27）；读出处的动作有 plugin 受众，不能借它探测别人的对象，加之前定形状并过评审（第 2 节，SSC-30） |
| 9 调用次数 | values 一次最多 50 个对象；授权核对复用 `discover()`；`record` 一次最多 10 个引用；描述可缓存，值另取。`readMaterialOrigins` 一次只比前 5 份的内容，每份最多读 8 MB，边读边算，总时限 1 秒（第 2 节）；其余只 `lstat`；`record` 不比内容 |
| 10 升级与数据 | 「最近用过」与纠正记录的生命周期写在第 2.1、6 节：裁剪、停用卸载后怎么显示、删项目、Home 快照。默认输出目录不进快照，永久删除时非空才问，用户 2026-11-07 定，否掉的方案和理由在第 3 节（SSC-23）。另一台设备上的引用加指定文件夹，用户 2026-11-07 定，否掉的方案在第 3 节（SSC-25～28）；脱钩之前建的目录行还剩一种静默读，用户 2026-11-07 定接受并写明，否掉「旧绑定标成待确认」和「目录 id 加设备盐」，范围、出路和两个方案的代价在第 3 节（SSC-29）。目录 id 修复后不变，历史引用照读（SSC-16） |
| 11 成果与过程项 | `pin` 分 current、fixed（成果库）、snapshot（过程项），不把过程项放进成果库 |
| 12 页面与外壳 | 浏览位置只是页面状态；形态只用组件板已有的控件拼，缺的由 D 轨先补标本；页面事件按登记改，不新增未登记事件。别人的东西只进插件页面上带 `accepts_forms` 的 slot，由平台画好放进插件文档（`mounts` 并进 `slots`，统筹 11-08 定），插件不另开挂载位声明，也不自己画别人的对象。删除确认框多的一问、留下文件夹的提示和指定文件夹的六个状态（第 3 节）都是新状态，定样用户 2026-11-08 看实物定了（第 3 节「定样」） |
| 13 错误 | `projects.directory_missing`、`projects.directory_revoked`、`projects.directory_duplicate`，在 `defineErrorCodes("projects", …)` 里声明，不新写 Error 子类 |
| 14 冲突面 | C-1 只碰 contracts 的 `modules/projects`、新 `platform/project-materials`，SDK 新的 `presentation` 子路径，`tooling/gates/api/`（含新增 `plugin-sdk/presentation.txt`）、`tooling/gates/error-owners.json`、`tooling/versions.json` 和 `tooling/gates/version-exceptions.json`（#1837 之后才有，C-1 的九个动作键还没有快照行，走例外）。C-2、C-3 碰 contracts 的 `platform/ui`（新 `ui-state-rings.ts`；`ui.ts` 的 `UiSlotDescriptor` 加挂载位的收法，D 轨的文件，C-2 写、D 轨事后审）、新 `platform/presentation`、新 `services/surface-composition`、`platform/plugin-manifest`、`modules/context-ledger`、`package.json`，SDK 的 `index.ts`、`manifest.ts`、`presentation.ts`、新 `presentation-declaration.ts`、新 `surface-description.ts`、`ui/state-ring-states.ts`，`horizontal/placement` 一行，`tooling/gates/api/`（含 `plugin-sdk/ui.txt`，和第 14 批同一份快照，谁后合谁刷新）、`tooling/versions.json`、`tooling/gates/version-exceptions.json`；T4 那个提交从 SDK 的 `ui/text-ref.ts`（第 14 批新加）取文字工具，合 main 后刷新 `plugin-sdk/presentation.txt`。其余各片合起来：contracts 的 `services/agent-host`（实现片）、`platform/plugin-manifest`（快照在 `platform/plugin.txt`；排序见 #1806 第 10 节）、`platform/plugin-events`（快照 `platform/plugin-events.txt`，同名常量也进 `platform/plugin.txt`）；宿主的 `project-browsing-settings.ts`、`workspace-settings-events.ts`、`agent-host-composition.ts`；Git、Coding（B 轨）、`assistant-executor.ts`（A 轨）；`tooling/gates/actions/`、`tooling/gates/api/` |

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
| SSC-09 | 插件只在自己带 `accepts_forms` 的 slot 上出现别人的东西，按它的 `max`、`refuse_kinds` 收；没有这种 slot 的插件，什么都不放 | IUI-13；`mounts` 并进 `slots`（统筹 11-08 定）；由第 15 批 S-1 证明（SCS-05） |
| SSC-10 | `assertSurfaceDescription` 丢掉候选以外的对象和操作并记下，放进别的组的对象也算候选以外；组的状态、`read_at`、`excluded`、`hidden_above` 取候选的；不合格时退回确定组合 | IUI-05（第三片才用到） |
| SSC-11 | 呈现声明里的 `attention` 只改色点和状态标签，不产生等你条目；等你列表只来自 attention-resumption | D 轨共审 2026-11-04 |
| SSC-12 | 「最近用过」由引用发生处在提交成功后调 `materials.recent.record@1` 记，插件与平台同一个动作，读不了的引用不记；`materials.recent@1` 按调用方和项目读，最多 5 份显示，出处现读；给 plugin 受众时无权或不在的项连 `subject` 都不返回；被拒或取消的调用不记；每个调用方每个项目只留 20 份；没有授权的 plugin 调 `materials.recent@1` 时文件没有被打开；`record` 一次 10 个也不读内容 | WMD-01、WMD-05 |
| SSC-13 | 主人读不到时 `PresentationValues` 给 `stale` 和 `read_at`，界面写「x 分钟前的值」，不当成当前值 | IUI-10 |
| SSC-14 | 不经组合服务，按声明和 `PresentationValues` 单独画出「行」（MLN-23），与组合服务画出的同一形态一致 | MLN-23、IUI-03；随 `renderPresentationForm` 移到[第 15 批第 2 项](../post-anticorruption-roadmap/reference/batches/15.md#batch-15-item-2)（统筹 11-08 定） |
| SSC-15 | Agent 只能写输出目录（或它的临时工作树）；写输入目录被拒，有断言拒绝本身的测试和安全不变量一行 | WMD-09、#1805 第 5 条 |
| SSC-16 | `repair` 只在文件夹失效时允许，以后 id 不变，关联它的每个项目的旧 `MaterialRef` 照样能读；修到已有的另一行时被拒；realpath 核实不了的路径 `add`、`repair` 都被拒；不再有从路径推 id 的读法 | WMD-04、#1805 第 2 条 |
| SSC-17 | 没传 `workspace_id` 的读、写、执行都取输出目录；要用输入目录必须显式传，并按当前角色核对 | WMD-07、#1805 第 3 条 |
| SSC-18 | 插件级概况的动作 schema 与平台定的一字不差，否则安装被拒；声明的 `start` 只能是本 Manifest 自己的动作，动作返回的 `start` 只能是声明的子集 | #1798 第 12 节第 1 条；schema、安装时、运行时三半都在 C-2 |
| SSC-19 | 只换了授权、别的不变时，`surfaces.compose` 的 revision 也变 | #1798 评审；由第 15 批 S-1 证明（SCS-01），合同不加算 revision 的函数 |
| SSC-20 | 默认输出目录：目录库里没有路径；Home 拷到别处后读到新位置，原 Home 的文件不变；文件夹没建时 `state` 是 `ok`；升级段不拿 Home、不碰文件，回收站里的项目也有，同一个库两次跑出的 id 相同，两台设备上同一个项目的 id 不同（整份 Home 拷过去的除外）；`project_id` 含 `:` 时引用照样切得对 | WMD-03、S-102 |
| SSC-21 | 这些都被拒（`catalog.project_storage_invalid`），Home 外没有新东西，有断言拒绝本身的测试和安全不变量一行（S-102 的延伸）：项目 id 是 `../../x`；`canonical_path` 手改成 `project-output:../../x`；这一行手工关联到别的项目；`outputs` 或 `outputs/<id>` 是符号链接（读、建各一条，终端和 Git 也拒绝）。选了删时 `outputs` 是符号链接：不删，Home 外的文件还在，这一步留着重试 | S-102 |
| SSC-22 | 新项目改到自己的目录再用 `default_output: true` 设回默认，文件夹没建也成功，id 不变；路径到行：`add_input`、`set_output` 给的路径是这个项目的默认位置时认回同一行，是别的项目的或 `outputs/` 里别的位置时被拒；`repair` 修到 `outputs/` 里被拒；大小写不同的路径也认得出来；在默认输出目录开终端以后，目录库里还是一行、没有绝对路径；工作目录在这里的会话能解析到所属项目；工作目录在子目录时终端能开，只绑会话，不写目录行；读出来的路径再传给 `upsertWorkspace`，这一行不变 | WMD-02、S-102 |
| SSC-23 | Home 快照不含 `outputs/`，里面有符号链接和 `.sqlite` 也不影响快照，恢复不动它；回收站里文件不动。永久删除：空的不问，非空时只有设置页问；选了留文件还在，结果里有路径；选了删文件没了，失败留着重试，里面的符号链接不跟过去；同一个键换选择被拒；还有任务时选了删被拒。MCP 请求带 `output_files: "delete"`、CLI 和卸载都留着（断言拒绝本身）；示例项目重建不动这些文件；purge 清掉留下的 | 第 3 节，用户 2026-11-07 定 |
| SSC-24 | 文件夹没建时：新项目第一个终端能开，Character 能启动，Git 面板显示「不是仓库」，Files 列目录读到空 | 第 3 节 |
| SSC-25 | 另一台设备的引用，指定之前（目录行是脱钩之后建的，旧行见 SSC-29）：默认输出目录和用户自己选的目录都是 `unmapped`；这台设备同路径有同名文件时也不读，没有指纹的引用同样；plugin、agent 的读取被拒，`materials.recent` 给 plugin 时不返回，`record` 不记；本机有这个 id 的行但这个项目没关联时也是 `unmapped`，可以指定，读取仍被拒。同一台设备：默认输出目录换走后旧引用是 `unmapped`，写「这个项目原来的默认输出目录」，用 `default_output` 接回来，id 不变 | 第 3 节，用户 2026-11-07 定 |
| SSC-26 | 指定：一条对应接回这个目录的全部引用，引用文字不变，同步回原设备照读；换、取消各一次；目录移除后对应一起去掉；只影响这个项目；同步内容里没有这张表 | 第 3 节 |
| SSC-27 | 这些都被拒，有断言拒绝本身的测试和安全不变量一行（S-102 的延伸）：plugin、agent、mcp 调 `map_source`；输入里带操作者或项目；目标 realpath 核实不了、是别的项目的默认位置；目标落在 Home 里、包含 Home（`~`）、在账号 Home 上落在根 Home 或别的账号 Home 里，三种写法都查，路径大小写不同也查；有对应的目录 `repair` 到这些位置；`source_workspace_id` 是这个项目的目录；写动作给原设备的 id；引用路径带 `..` 或经过符号链接 | S-102 |
| SSC-28 | 指定之后：内容相同是 `ok`，不同是 `changed`，读取不被拒；比不了的有 `note`；`goals.inputs.bind` 传了 `read_revision` 时 `snapshot_digest` 是 `sha256:<hex>`，`size:` 或没传时是 null 并显示「内容没有核对」；`read_revision` 不是这两种格式时 `assertMaterialRef` 拒绝。现读：`bytes` 读到的 300 KB 文本和 PDF 比内容；文本读 `too-large` 和超过 8 MB 的写 `size:`，只比大小，内容变了大小没变时比不出；`materials.recent@1` 一次只比前 5 份的内容，第 6 份起有 `note`；比较超过总时限时有 `note`，面板不等 | 第 2、3 节 |
| SSC-29 | 脱钩之前建的行，同一个项目、两台设备路径相同：`MaterialRef` 内容不同时界面是 `changed`；没有指纹的绑定显示「内容没有核对」；Agent 经 `knowledge.read` 读到本机文件，不比不提示；这个路径还关联别的项目时，移除再加一次 id 不变；从那台设备的所有项目移除再加一次后 id 不同，变成 `unmapped`。这条用例钉住的是已知缺口，不是要的行为 | 第 3 节 |
| SSC-30 | 加读出处的动作时：plugin 传别人的引用，分不出 `forbidden` 和 `missing`，也拿不到 `owner`、`directory`；`unmapped` 照回；没有授权时文件没有被打开；没有 `read_revision` 的引用只查在不在，`note` 写「内容没有核对」 | 第 2 节 |
