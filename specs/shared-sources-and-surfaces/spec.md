# 公共来源与呈现合同（路线书 05 ②）

状态：设计稿，2026-11-04 写，没有实现。合同归 C 轨，呈现组件归 D 轨，这一份是共同设计；D 轨 2026-11-04 共审，四处要改的已改进稿子，§10 的四问已答（见第 10 节）。2026-11-06 按第 05 批核账勘误（动作版本、事件位置、Manifest 快照、C-1 与 U1 的先后），并按用户同日的决定改了第 8、9 节：真实 Home 重建不等 C-1，动表的部分走升级段。2026-11-07 统筹定 C-1 只加不删（第 9 节），用户定默认输出目录的快照和永久删除，以及另一台设备上的引用加「指定文件夹」（第 3 节）。2026-11-04 收进第 06 批核账（#1805）列的七处缺口（第 3、4、8、9 节）、第 15 批评审里收下的五项（#1798，第 5、6 节）和 D 轨定的两个字段角色。实现等 02 交接，以及 03、04 定样全部落定；组合服务的实现在[第 15 批](../post-anticorruption-roadmap/reference/batches/15.md)。

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
  directory?: { workspace_id: string; display_name: string; roles: DirectoryRole[] };  // source 为 directory 且 state 不是 unmapped 时有
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
  | 一次算几份 | 上限放在共用的 `readMaterialOrigins(caller, refs, { compare })` 里，不放在某个动作上：一次只比前 5 份的内容（调用方排好序，最坏读 40 MB），其余只查文件在不在，`note` 写「内容没有核对」。打开时读文件本身就比了。比较有总时限 1 秒，超时停止读，没比完的同样写 `note`，这样网络盘或没下载的 iCloud 文件不会让面板等着（这个数和慢盘的情况都没实测）。不加缓存：这台机器上 5 个 8 MB 算 sha256 约 12 毫秒，加上从系统缓存读约 20 毫秒 |
  | 谁用它 | `materials.recent@1` 比内容。`materials.recent.record@1` 不比（`compare: false`）：它要分的 `forbidden`、`missing`、`unmapped` 都用不到内容，一次 10 个也不多读，而且它在提交之后的路上。引用、出处行和 Goals 输入也要出处，C-1 只声明了 `materials.recent@1` 回 `origin`，所以实现片在第一个要它们的界面上加只读动作 `materials.origins@1`（受众 user、plugin，一次最多 20 个，走这同一个函数）；这是只加不删，不进 C-1 |
  | 只到界面 | 上面的比较都是给人看的出处。**Agent 读文件不比指纹**：`knowledge.read` 没有比较的参数，只回当前 revision（`horizontal/knowledge/src/workspace.ts:73`），`goals.inputs.list` 也不回指纹（`input-actions.ts:17`）。不改这一点（合同台定）：指纹给了 Agent 也要靠它自己比，比没比没有人知道，算不上保证 |

  它分不出是这份文件后来改过，还是另一份文件，所以只说「和引用时不是同一份」。
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
| 存什么 | `workspace_id` 是 `workspace-output-<哈希前 24 位十六进制>`，哈希是 `sha256(project_id + "\0" + 这个项目最早一条 project_events 的 event_id)`，「最早」按 `created_at, event_id` 排；`canonical_path` 是 `project-output:<project_id>`，`realpath_verified` 存 0，`display_name` 是占位的 `project-output`。用户自己选的目录照旧存绝对路径，新发 id。**两台设备上 id 必须不同，所以带上事件 id：** 事件 id 是每台设备建项目时各自随机发的，不同步（`portable-project.ts` 只投影 id、标题、时间和插件清单），`register` 在同一个事务里写第一条，所以每个项目都有；Home 整体拷到别处时跟着走，id 不变。id 相同的话，另一台设备上同路径的同名文件会被静默读到（下面「另一台设备上的引用」）。不直接随机，因为升级段不许随机（U1 §8.1）。id 也不能直接带 `project_id`：它可以含 `:`（`platform/placement.ts:22`），而 `parseWorkspaceFileSubjectId` 按第一个冒号切（`workspace-artifacts.ts:299`）；编码也不行，同步收的 id 最长 200 字符（`portable-project.ts:17`），编码后超过目录 id 200 字符的上限（C-1 的 `folderId`） |
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
| 确认框 | `has_files` 时多问一句，删还是留，不给默认选中：删了不能撤销。`empty`、`unknown` 不问，都按留。这是新状态，连同留下文件夹之后的提示，进实现片的定样，这个 PR 不定样。现在那句「关联工作目录中的代码和文件会保留」对用户自己选的目录仍然成立 |
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
| 另一台设备的文件夹名字 | 不同步（本机路径不同步这条不变），这台设备只知道 id 和相对路径。代价：原设备上两个目录各有一个 `README.md` 时，这边看到两行一样的，指错了也看不出，所以定样要按 `source_workspace_id` 分组。默认输出目录分两种，都不用同步：`source_workspace_id` 等于这个项目算出来的默认 id，写「这个项目原来的默认输出目录」；其余 `workspace-output-` 前缀的写「另一台设备的默认输出目录」 |
| 两片之间 | 目录实现片合入后、指定文件夹片合入前，不产出 `unmapped`，这些引用照旧是 `missing`，显示「找不到位置」。读取同样被拒，只是还没有入口 |

**这台设备上同路径有同名文件时怎么办。** 分指定之前和指定之后：

- **指定之前不读，也就不会静默读到别的文件。** 默认输出目录两台设备 id 不同（上表「存什么」），用户自己选的目录脱钩之后新发的 id 也不同，所以另一台设备的引用在这里解析不出来，出处是 `unmapped`，界面显示「未指定文件夹」。给 plugin 和 agent 的读取被拒，`materials.recent` 给 plugin 时和 `forbidden`、`missing` 一样不返回。
- **指定之后读指定的那个文件夹里同路径的文件。** 这是用户说的对应，读到的就算内容不同也不拒绝，但要说出来：有指纹就比，不一样是 `changed`，界面提示「和引用时不是同一份」；比不了的给 `note`，写明「内容没有核对」。同路径没有文件是 `missing`。这些只到界面，Agent 读文件不比（第 2 节）。
- **`goals.inputs.bind` 带指纹。** 输入多一个可选的 `read_revision`，调用方读到什么传什么，只是提示，传错了最多多报一次 `changed`。处理器是同步的，不自己读文件。十六进制写成 `sha256:<hex>` 存进已有、也同步的 `input_bindings.snapshot_digest`（和 `goals.inputs.confirm` 同一种形状，`goal-entry-actions.ts:32`），比较时去掉前缀；`size:` 放不进这种形状，写 null。不改表，动作快照要跟着改。没有指纹的绑定显示「内容没有核对」。

**还剩一种静默读：脱钩之前建的目录行。** 这种行的 id 是路径的哈希（`normalizeProjectWorkspace`）。同一个同步项目，两台设备都在目录实现片之前关联过同一个绝对路径，id 就相同，引用不用指定就走本机目录这条路。关联不只是手动加，在这个路径开过终端、绑过会话也算（`modules/private-work-context/src/project-binding-commands.ts:171,180`）。只关联别的项目不算，那样是 `unmapped`（下面）。先按接受这个缺口写（统筹 11-07 定，用户的决定到了再改）。

| 引用 | 人在界面上 | Agent 读 |
| --- | --- | --- |
| `MaterialRef` | 实现片才有，`read_revision` 必填。内容不同是 `changed` | 读到本机同名文件，不比，不提示 |
| 带指纹的 `input_bindings` | 同上 | 同上 |
| 不带指纹的 `input_bindings`（`bind` 没传，或实现片之前写的，`snapshot_digest` 是 null） | 显示「内容没有核对」 | 同上 |
| `goal_tree_proposal_items.source_refs_json` | 只存 `kind:id` 字符串，没有页面读，也没有地方按它调读取动作 | Agent 能在提案输出里看到这个字符串，要自己切开才能读，条件同上 |

- **升级段不改这些 id。** 别的库也存着（`modules/characters/src/open.ts:37`、冻结的轮次），要逐库改，改漏了本机的历史就断了。
- **范围。** 外部用户只有实现片晚于首次外部安装才会碰上：一台设备上的旧行，遇到另一台实现片之后新发的 id，照样是 `unmapped`。这个先后由统筹写进路线图依赖或发版清单（第 9 节）。自己的设备上已经有这种行的，要把这个路径从那台设备的**所有项目**移除，再加一次才发新 id：`removeWorkspaceIfEmpty`（`workspace-repository.ts:146`）只在没有任何关联时才删这一行，还有别的项目关联时加回来认回原来那一行。之后那台的旧引用变成未指定，可以指定。

**相邻两种情况。**

- **本机有这个 id 的行，但这个项目没有关联**（只关联别的项目，或从这个项目移除了）：和 id 不在目录库一样是 `unmapped`，可以指定。读取照旧被拒（SSC-04），对应只把这个项目接到它自己的目录，碰不到别的项目的文件夹。不做成 `forbidden`：那样没有出路，而且会让人看出别的项目用没用这个文件夹。`forbidden` 是调用方没有读目录的授权（`horizontal/knowledge/src/workspace.ts:81`）。目录的 `state` 没有 `revoked`（合同台定）：移除以后这一行就没了，说不出谁会写这个取值。撤权按调用方的授权算，不是目录的状态；`projects.directory_revoked` 留给冻结轮次用到已经移除的目录时回答（SSC-04）。给的路径正好是这一行时，等于把同一个文件夹加进这个项目，只写关联。
- **整份 Home 拷到第二台设备，两边都在用：** 不支持。两边是同一个 Home 的两份，所有 id 都相同，默认输出目录也一样，事件 id 也拷过去了，和上面的旧行同样静默。Home 拷过去之后只用一边是支持的。不做检测。

**要定样的新状态（实现片先定样，这个 PR 不定样）：**

1. 未指定的引用长什么样：资料面板的「最近用过」、选择器、引用和出处行、Goals 的输入。只有文件名和相对路径可以写，要按 `source_workspace_id` 分组，用原设备上两个目录各有一个 `README.md` 来验收；默认输出目录分「这个项目原来的」和「另一台设备的」两种写法（上表）。
2. 从哪里指定：未指定的那一行上的操作；选已有目录还是新选文件夹，这个项目的默认输出目录怎么放。
3. 指定时的反馈：一次接回这个目录的全部引用，这件事要说得出来，同样按目录分组；指定的文件夹里同路径没有文件时的样子。
4. 指定之后怎么看、怎么换、怎么取消：目录设置里每个目录的对应，出处行上的入口。
5. 内容不一样时的「和引用时不是同一份」，和「内容没有核对」的说明。
6. Agent 或插件读到未指定的引用被拒之后，人在哪里看到、怎么接着做。

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
- 默认输出目录那一段（第 3 节「默认输出目录怎么存」）只读写库，不拿 Home，不建文件夹：对每个没有 output 的项目写一行和一条关联。SQL 算不了 sha256，所以写在段的 `run` 里，id 由 `project_id` 和这个项目最早的事件算出来，都是库里已有的列（U1 §8.1）。每个项目都有事件：`insertProject` 只在 `register` 里，同一个事务写第一条。手改的库没有事件时按 §8.1 抛，这个目录库升不上去，不另写恢复。`workspaces` 不同步，所以每台设备跑出不同的 id 不违反 U1 §2.4「段要确定」：那一条说的是进同步的表。`workspaces` 的各列照第 3 节的「存什么」写，时间取项目的 `created_at`；关联的 `membership_id` 是 `workspace-output-membership-<同一个哈希>`，`bound_by` 是 `molis-work-upgrade`。回收站里的项目也补，不滤 `project_recycle`。这种写法和绝对路径撞不上 `UNIQUE`，`outputs/` 又是新目录，不会有用户早就加过的行，所以这一段不会让目录库失败。
- `workspace_source_links`（第 3 节，用户 2026-11-07 定指定文件夹）同样走升级段，建一张空表，随「实现（指定文件夹）」那一片写。不搬数据，也不是读取兼容，统筹 11-07 定不单独问用户。
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
| C-1 资料与目录合同（**不碰 `packages/storage`，也不等 U1**：建表语句在 `modules/projects`，由 `apps/local-host/src/project-database-schema.ts` 汇进项目库基线；动表的部分不在这一片，见前置列） | `platform/project-materials.ts`；`modules/projects` 的 `ProjectDirectory`、`ProjectDirectories`（含 `source_links`）、`RunDirectories`，第 3 节的七个动作（`set_output`、`map_source` 的目标三选一）与 `materials.recent@1`、`materials.recent.record@1` 的声明；三个错误码；SDK 新的 `presentation` 子路径放 `assertMaterialRef`；api 快照（`contracts/modules/projects.txt`、新 `contracts/platform/project-materials.txt`、新 `plugin-sdk/presentation.txt`）。**只加不删**：现有动作、字段和端口都不动，不碰 `services/agent-host`。动作只声明、不登记，所以动作快照不变 | 不等 02 收尾（用户定放行，撞了就让路）：排在 #1837 之后入队，合入前补 4 处 `version: 1` 的 `@version` 标记和 `tooling/versions.json` 条目。`material_recent_uses` 表挪到实现片走 U1 升级段（用户 2026-11-06 定重建不等 C-1）；这一片只声明动作 |
| C-2 呈现声明合同 | `platform/presentation.ts`、Manifest 的 `presentation` 字段、values 的类型与 define/bind；`validatePresentationDeclaration`、`presentationText`、`presentationFormFields`、`renderPresentationForm` 的签名；api 快照 | 02 交接；D 轨把状态环取值下沉到 contracts 的 `platform/ui.ts` 之后 |
| C-3 组合服务合同 | `services/surface-composition.ts`、`SurfaceGroup`、`surfaces.compose@1`、`surfaces.correct@1` 的声明；context-ledger 的关系类型表；`assertSurfaceDescription`；actions 快照 | C-2；第 14 批 A 段的 `TextRef` 合入 |
| 实现 | 组合服务包（第 15 批）；`modules/projects` 的服务与界面接线（WMD 的实施切片），含 id 与路径脱钩、`outputDirectory`、登记 C-1 声明的动作；重写 `workspace-repository.ts` 的查询（`is_default` 换 `roles`）时，保留 `:22,57,69` 三处「回收的项目不算」的过滤（`project_recycle`，#1877 加的）；默认输出目录写在 `register` 里，升级段连回收的项目一起补（第 3 节）；第 3 节的路径到行、碰磁盘的调用方和永久删除；第 2 节的 `fingerprintWorkspaceFile` 和 `binary`、`unsupported` 带指纹（改 `WorkspaceFileResult`）；这一片不产出 `unmapped`；删除确认框多的一问和留下文件夹的提示是新状态，先定样；`goals.inputs.bind` 写指纹不在这一片；`RunDirectories` 随轮次视图和冻结轮次信息的字段加进 `services/agent-host`；收资料引用的地方都调 `assertMaterialRef`，它比 schema 严（查 `workspace_file` 的 id 落在目录内），只靠 schema 会放过 `ws1:../secret`；宿主的 `PROJECT_WORKSPACE_PROVIDER_ID`（`apps/local-host/src/project-workspace-actions.ts:7`）改成从合同取；同一次切换里删 `projects.settings.browsing-workspace.*` 和它的表、`projects.workspaces.add/repair/unlink`、`projects.workspace.read`、`is_default`、`preferredWorkspacePath`，改完所有读它们的地方（宿主的 `project-capabilities.ts`、`workspace-settings-events.ts` 和 Files、Git、Coding，第 4 节）；Git 显式带目录；Goals、Inbox、Coding 的第一片声明。Coding 的浏览与执行拆开归 B 轨，`assistant-executor.ts` 的部分归 A 轨。第 8 节的升级段在这一片写 | C-1～C-3 合入；升级段另等 U1 和四份门禁（U1 设计第 14 节）。**发布排序：合入早于首次外部安装**，否则外部用户也有第 3 节「脱钩之前建的目录行」那个缺口；这条依赖由统筹写进路线图依赖或发版清单，不只留在这里 |
| 实现（指定文件夹） | 第 3 节「另一台设备上的引用」：`workspace_source_links` 和它的升级段、登记 `map_source`、`unmap_source`、`resolveWorkspaceFileSubject` 和四处读的地方、产出 `unmapped`（从这一片起，解析不出的不再显示「找不到位置」）、`goals.inputs.bind` 多 `read_revision`（动作快照跟着改）、界面（六个状态先定样） | 上一行的目录实现片合入（目录 id 脱钩和默认输出目录都在那一片）；定样；U1 和四份门禁 |

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
| 3 能力注册 | 第 3 节七个目录动作、`materials.recent@1`、`materials.recent.record@1`（`system.project-workspaces`）；`surfaces.compose@1`、`surfaces.correct@1`（组合服务）；values 动作由各插件在自己的声明里注册。都注册一次，页面、工作流、Agent、MCP 共用 |
| 4 合同 | 改。新子路径 `platform/project-materials`、`platform/presentation`、`services/surface-composition`，SDK 的 `presentation`；改 `modules/projects`、`modules/context-ledger`、`services/agent-host`、Manifest、`platform/plugin-events`。按 N35 原地改形状，旧名不留；按第 9 节拆三片，按快照一次一个 PR。C-1 只加不删，旧名和 `services/agent-host` 的改动在实现片 |
| 5 放在哪个包 | 合同在 contracts；共用校验在 SDK（只依赖 contracts）；状态环取值下沉到 contracts 的 `platform/ui.ts`（D 轨）；组合服务进 `horizontal/`，宿主只装配 |
| 6 表与存储 | `workspaces` 去掉 `is_default`、改 `roles`；删 `project_browsing_settings`；新增 `material_recent_uses`（项目库，`modules/projects`）和组合服务的纠正表（项目库与它自己的 Home 库）。都登记进 `table-owners.json`，都走升级段（第 8 节）。新目录 `outputs/`：默认输出目录，登记进 `homeStores()`，第 3 节。新表 `workspace_source_links`（目录库，`modules/projects`），第 3 节 |
| 7 兼容与迁移 | 不加读取兼容。哈希 id 照旧当不透明字符串用，不从路径推，不算兼容路径。重建之后才落的，走 U1 升级链，这几段用户 2026-11-06 已同意（§8），写的时候不用再问 |
| 8 安全边界 | 碰。只有输出目录可写，有拒绝测试和不变量一行（SSC-15）；撤权、移除后马上拒绝（SSC-04）；`materials.recent` 给 plugin 不泄露无权项（SSC-12），`excluded` 件数只给 user；`record` 先按调用方授权现读、读不了不记；`host.workspace.changed@1` 的载荷改动核 S-54；默认输出目录的路径由可信 Home 推导，读、建、删都先核（SSC-21）；不写回目录库（SSC-22）；MCP、CLI 删不了这些文件，选择由入口给（SSC-23）；指定文件夹只有 user 能改，目标过校验，写入不认原设备的 id（SSC-27） |
| 9 调用次数 | values 一次最多 50 个对象；授权核对复用 `discover()`；`record` 一次最多 10 个引用；描述可缓存，值另取。`readMaterialOrigins` 一次只比前 5 份的内容，每份最多读 8 MB，边读边算，总时限 1 秒（第 2 节）；其余只 `lstat`；`record` 不比内容 |
| 10 升级与数据 | 「最近用过」与纠正记录的生命周期写在第 2.1、6 节：裁剪、停用卸载后怎么显示、删项目、Home 快照。默认输出目录不进快照，永久删除时非空才问，用户 2026-11-07 定，否掉的方案和理由在第 3 节（SSC-23）。另一台设备上的引用加指定文件夹，用户 2026-11-07 定，否掉的方案在第 3 节（SSC-25～28）；脱钩之前建的目录行还剩一种静默读，范围和出路在第 3 节（SSC-29）。目录 id 修复后不变，历史引用照读（SSC-16） |
| 11 成果与过程项 | `pin` 分 current、fixed（成果库）、snapshot（过程项），不把过程项放进成果库 |
| 12 页面与外壳 | 浏览位置只是页面状态；形态只用组件板已有的控件拼，缺的由 D 轨先补标本；页面事件按登记改，不新增未登记事件。删除确认框多的一问、留下文件夹的提示和指定文件夹的六个状态（第 3 节）都是新状态，实现片先定样 |
| 13 错误 | `projects.directory_missing`、`projects.directory_revoked`、`projects.directory_duplicate`，在 `defineErrorCodes("projects", …)` 里声明，不新写 Error 子类 |
| 14 冲突面 | C-1 只碰 contracts 的 `modules/projects`、新 `platform/project-materials`，SDK 新的 `presentation` 子路径，`tooling/gates/api/`（含新增 `plugin-sdk/presentation.txt`）和 `tooling/gates/error-owners.json`。其余各片合起来：contracts 的 `services/agent-host`（实现片）、`platform/plugin-manifest`（快照在 `platform/plugin.txt`；排序见 #1806 第 10 节）、`platform/plugin-events`（快照 `platform/plugin-events.txt`，同名常量也进 `platform/plugin.txt`）；宿主的 `project-browsing-settings.ts`、`workspace-settings-events.ts`、`agent-host-composition.ts`；Git、Coding（B 轨）、`assistant-executor.ts`（A 轨）；`tooling/gates/actions/`、`tooling/gates/api/` |

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
| SSC-12 | 「最近用过」由引用发生处在提交成功后调 `materials.recent.record@1` 记，插件与平台同一个动作，读不了的引用不记；`materials.recent@1` 按调用方和项目读，最多 5 份显示，出处现读；给 plugin 受众时无权或不在的项连 `subject` 都不返回；被拒或取消的调用不记；每个调用方每个项目只留 20 份；没有授权的 plugin 调 `materials.recent@1` 时文件没有被打开；`record` 一次 10 个也不读内容 | WMD-01、WMD-05 |
| SSC-13 | 主人读不到时 `PresentationValues` 给 `stale` 和 `read_at`，界面写「x 分钟前的值」，不当成当前值 | IUI-10 |
| SSC-14 | 不经组合服务，按声明和 `PresentationValues` 单独画出「行」（MLN-23），与组合服务画出的同一形态一致 | MLN-23、IUI-03 |
| SSC-15 | Agent 只能写输出目录（或它的临时工作树）；写输入目录被拒，有断言拒绝本身的测试和安全不变量一行 | WMD-09、#1805 第 5 条 |
| SSC-16 | `repair` 只在文件夹失效时允许，以后 id 不变，关联它的每个项目的旧 `MaterialRef` 照样能读；修到已有的另一行时被拒；realpath 核实不了的路径 `add`、`repair` 都被拒；不再有从路径推 id 的读法 | WMD-04、#1805 第 2 条 |
| SSC-17 | 没传 `workspace_id` 的读、写、执行都取输出目录；要用输入目录必须显式传，并按当前角色核对 | WMD-07、#1805 第 3 条 |
| SSC-18 | 插件级概况的动作 schema 与平台定的一字不差，否则安装被拒；`start` 只能引用同一次注册里的动作 | #1798 第 12 节第 1 条 |
| SSC-19 | 只换了授权、别的不变时，`surfaces.compose` 的 revision 也变 | #1798 评审 |
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
