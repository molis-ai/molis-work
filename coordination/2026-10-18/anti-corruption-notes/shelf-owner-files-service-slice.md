# OwnerFiles 服务前置：精确实施清单（负责人：主会话；实施待分配）

状态：只读候选，2026-10-18；只核对 S=`wt-shelf-runtime`，未改生产代码/测试/spec，未构建。承接 shelf-owner-files-candidate.md 的 write(run) 裁定，并纳入主会话接受的 shelf-owner-files-service-review.md 修订；本片只实现服务与真实 Home Runtime fixture。**不替换ShelfStore、不启用Shelf Runtime、不改Shelf现owner、不提供第二份Store。** 完成等级是OwnerFiles服务经真实Runtime验证；Shelf产品恢复、原件、AI及桌面交接仍未迁移。

## 1. 最小公共合同

新增 `packages/contracts/src/platform/plugin-owner-files.ts`，沿前候选保留以下类型（文件名以本片为准）：

```ts
export type PluginOwnerFileInfo = { readonly kind: "file"; readonly byte_length: number } | { readonly kind: "directory" };
export interface PluginOwnerFileEntry { readonly name: string; readonly kind: "file" | "directory" }
export interface PluginOwnerFilesReader {
  stat(relative: string): PluginOwnerFileInfo | null;
  read(relative: string): Uint8Array | null;
  list(relative: string): readonly PluginOwnerFileEntry[];
}
export interface PluginOwnerFilesWriter extends PluginOwnerFilesReader {
  mkdir(relative: string): void;
  writeFile(relative: string, bytes: Uint8Array, mode: "create" | "replace"): void;
  replaceFileAtomic(relative: string, bytes: Uint8Array): void;
  copyFile(source: string, target: string): void;
  removeTree(relative: string): void;
  setAccess(relative: string, access: "readonly" | "readwrite"): void;
}
export interface PluginOwnerFilesClient extends PluginOwnerFilesReader {
  write<Result>(run: (writer: PluginOwnerFilesWriter) => Result): Promise<Result>;
}
export interface PluginOwnerFilesDeclaration {
  readonly store_name: string;
  readonly entries: readonly ({ readonly name: string; readonly kind: "file" | "directory" })[];
  readonly read_permission: string;
  readonly write_permission: string;
}
```

`plugin.ts`导出上述type，`PluginHostServices`增加可选`ownerFiles`，`PluginUpgradeContext.services`的Omit加ownerFiles。不加Manifest字段、任意root/owner、caller传入control、序列化Data参数、max_file_bytes。写callback必须短同步；Promise返回立即拒绝并撤销writer，但不承诺回滚先前合法同步写。read/list返回独立值；writer每次原语同步消费bytes，不跨await保存引用。

path只接受严格相对`/`路径、普通Unicode段，拒绝空、`.`、`..`、NUL、反斜杠、绝对/盘符/UNC；不decode、不clean、不trim。顶层由entries精确限定，file条目不能有后代；目录条目可stat/list/mkdir，不能removeTree该顶层或owner根。目录不存在时list=[]，stat/read缺失=null，类型错误/链接/特殊文件明确拒绝。

## 2. 分层和文件变更（没有Shelf代码）

| 文件 | 精确职责/成员 |
|---|---|
| contracts新`platform/plugin-owner-files.ts`、现`platform/plugin.ts` | 上述合同、service字段、upgrade排除；无需新package subpath，继续通过platform/plugin导出 |
| plugin-runtime新`src/owner-files-service.ts`、现`src/index.ts` | `createPluginOwnerFilesClient(manifest, declaration, port, gate)`；内部port仅同步Reader/Writer原语；gate为install_id/assertActive/requireGrant。返回client与Host-only初始化入口，不把初始化入口放PluginHostServices；无独立close或第二active/generation |
| local-host新`src/plugin-owner-files.ts` | `openPluginOwnerFiles(home, declaration)`产生无持久fd的内部同步port；路径绑定、类型验证、节点IO、原子replace；每次IO的fd在finally关闭，不增加port.close，不得接受外部owner/path |
| local-host新`src/plugin-owner-files-paths.ts`（若为阈值/职责必要） | 单份严格segment解析、逐层目录检查、普通文件fd打开；只服务本实现，不能成为第二owner registry |
| local-host新`src/plugin-owner-files-entries.ts` | `assertOwnerFilesEntries`接收Home与project两scope完整可信名单及home；重用home.stores、PLUGIN_LIBRARY_NAME，同次纯校验，无IO。Host可信初始化接线类型可放此文件 |
| local-host现`src/plugin-entry-identity.ts` | WeakMap绑定真实definition→只读ownerFiles声明+可信初始化回调；`ownerFilesFor`；remember深复制entries，不能仅浅freeze数组 |
| local-host现`src/home-plugins.ts` | HomePluginEntry声明/初始化字段，shipped与releaseArtifact重新生成definition继承同一可信字段，校验后remember，传HomeExecutor resolver |
| local-host现`src/home-plugin-executor.ts` | resolver→打开port→Runtime服务wrap→授权初始化→definition.start→register；原activeRecord/installation_generation/实时grants作为唯一实例gate；现revoke先置active=false，使旧client与writer失效；port无持久资源，不加close或重复dispose |
| local-host现`src/home-side.ts` | PluginFixture扩可选声明/可信初始化；storesWithFixtures沿原owner registry只给未占用name登记fixture owner；pluginFixtureEntries透传；不允许覆盖modules/shelf或任何已登记owner |
| local-host现`src/plugin-platform.ts` | PluginPlatformEntry仅为共用fixture/identity类型承载字段；project start校验明确拒绝ownerFiles，不能静默忽略变成无服务成功 |
| workbench现`src/builtin-plugins.ts` | runtime类型可表达owner_files及可信initialize_owner_files（函数签名Writer→void）；只改类型，不给Shelf添加runtime/home_store条目 |
| tests新`fixtures/plugin-owner-files.ts`及`security-invariants-plugin-owner-files.test.ts` | 真MolisWorkLocalHost/HomePluginHost/PluginRuntime/动作网关驱动；再加必要服务IO故障小测试；无ShelfStore替身 |

建议可信字段命名：`owner_files?: PluginOwnerFilesDeclaration` 与 `initialize_owner_files?: (writer: PluginOwnerFilesWriter) => void`。后者只在Host start-entry/内存fixture声明，不在PluginDefinition或manifest；只有声明存在才可给初始化器。插件不通过字符串指定initializer。若为了少一个回调字段把二者收成单个Host内部对象也可，核心是身份WeakMap按definition绑定，不向普通installed definition继承。

不修改project executor的service set，不给sandbox/upgrade提供port。项目平台类型carry字段的唯一原因是当前pluginFixtureEntries统一返回PluginPlatformEntry；必须负向验证project entry立即拒绝，不能由项目会话获得服务。Builtin/runtime类型引用来自contracts，不能让workbench依赖local-host内部类型。

## 3. 登记校验：沿用唯一 HomeStoreRegistry

当前 `home-side.ts:63–74` 用homeStores()加fixture的未占用目录构造homeStoreRegistry；`plugin-files-entries.ts`从home.stores查owner，`plugin-entry-identity.ts`以WeakMap识别真实definition。这三处是现行信任根，新增服务沿用，不增加owner映射表/磁盘manifest/另一份登记API。

完整start list指这个Home已知的Home与project两scope可信输入（shipped及fixtures），须在同一次纯校验中交叉核对，并在打开HomePluginStore、任何owner port或initializer之前完成；不得只在两个平台分别检查各自名单。project平台已有调用方传入的db，验收不承诺该db从未打开，而是OwnerFiles目录与业务seed尚未创建。检查：有Home、声明owner_files的entry必须scope=home、非sandbox、store_name匹配PLUGIN_LIBRARY_NAME、已登记owner等于manifest.plugin_id、声明permissions均存在、entries非空且name为单段无重复/路径重叠、只有file/directory；初始化器无owner_files拒绝。fixture注册只给新名字归其真实plugin_id，不能覆盖已有名或前一个fixture。

跨服务冲突采用本片最小保守规则：**owner_files占用的store不同时声明database或旧files服务，也不接受home.stores该store本身带library。** 这是新服务的声明限制，不改变Images已有database+files合法组合。它避免catalog/SQLite WAL/SHM/旧assets共写而不新增一套“保留文件名清单”；本片Shelf未来根本就非library，fixture用自己根。多个owner_files条目声明同一store直接拒绝，不能靠顶层分片合写。交叉冲突按两scope所有可信条目的store_name检查，即使Home与project的definition不同但plugin_id相同、registry归属检查都通过，也拒绝Home owner_files与project旧files共根。无论先请求Home还是project启动，都先做同一完整输入的检查；若后续允许改变可信名单，仍须通过该检查。所有冲突由现名单和home.stores派生，不持久注册第二次，不建第二owner registry。后一个entry非法时，前一个合法entry也不能已打开owner port或执行seed。entry.create是可信工厂，零IO验收约束Host受管开库/owner目录/seed，不声称任意可信工厂本身无副作用。

允许复用的小校验是现PLUGIN_LIBRARY_NAME与manifest权限集合/owner查验逻辑；无需为了去掉几行相同if把所有database/files/model登记器重构成通用框架。若抽通用纯校验，原files/database现语义必须保持，不改它们公共合同/资源上限。

## 4. 权限、短作用域与初始化

Runtime wrapper读入口从`currentPluginAction()`取真实scope；要求install_id相同、声明read_permission在manifest及action权限内、caller.permissions内、storage:private在manifest/实时grant内；同步signal/assert_authority_current与gate.assertActive/requireGrant每次检查。没有action的start/route/timer调用拒绝，旧ALS继承不延长原caller寿命。write同理还要求command与write_permission；不能强制action本身同时声明read_permission才能在writer里做提交前读取，否则常见write action必须多一组不必要权限：writer内读属于已授权写提交，检查原write权限即可；独立Reader始终按read权限。

write入口捕获scope→检查→await原caller.beforeEffect→复核同scope、原caller、signal、实时grant/安装代次/活动状态→创建writer。每个writer方法都复核原权威并调用同步port。使用现`requireSynchronous(run(writer), ...)`检查返回值，finally撤销短writer有效位；不手写then探测。Promise返回立即拒绝且其拒绝被现helper观察，避免unhandled rejection；异步后续writer调用拒绝，异常原样抛并撤销。writer始终绑定捕获的原scope，不采用后续新动作的scope续权；即使新合法动作内使用旧writer也拒绝。本片不承诺callback忽略约定仍有输入快照保证。fixture可验证同步原语返回后再改源bytes不影响已写文件；跨await请求bytes防变更必须等Shelf入口实施，不能由服务测试冒领。

HomeExecutor沿现activeRecord实现实例代次验证，不另建generation计数、第二active/closed或服务close。短writer自己的callback有效位仍是必要的作用域限制。stop的revoke在definition.stop之前失效，stop回调拿旧client写会拒绝；dispose不重新授权。重新grant且restart后旧client/旧writer仍拒绝，新client才可用；升级preflight不含ownerFiles。同plugin_id的另一个definition不能继承可信声明。entries数组及元素深复制冻结，初始化函数引用与声明一并固定；releaseArtifact继承初始WeakMap绑定，不重读可变entry上的owner_files或initializer。

初始化是一个**显式Host特权同步段**，不是伪造action：gate有效且storage:private/write_permission grant通过之后，Runtime service的Host-only `initializeTrusted(callback)`创建短writer；不走currentPluginAction的普通入口，不给callback普通client绕过路径。Host只在HomeExecutor受理这次activation时调用；初始化同样以现`requireSynchronous(callback(writer), ...)`拒绝并观察非法Promise；类型`=> void`不能替代运行期检查。回调返回/抛错后撤销。该入口本身不放公共service，其函数只握在可信Host装配里。初始化之后再definition.start，查询贡献注册前准备完毕。初始化失败不得注册动作，撤销作用域但不删除已合法写的数据；没有跨文件rollback承诺。初始未授予写权限时不初始化、不创建owner目录；授权后restart才执行。打开port只绑定canonical Home及声明，不mkdir；首次目录创建只能发生于获准writer原语。

fixture初始化器写小型catalog/sample，自己记录seeded后用户删除示例，stop/start不重建；坏catalog明确抛错，不覆盖为空。此处只证明Host调用时机/短writer/真实生命周期，不声称Shelf的ensureSample迁移完成。服务不内建seed，也不读懂fixture catalog。

## 5. 路径与IO安全：准确承诺

查过现helper：`project-file-paths.ts.isWithin`只有词法包含关系，`storage/adapters/local-security-paths.ts`只解Home路径，`home-stores.ts`只登记归属；均不能替代逐层链接拒绝。现`plugin-files.ts`已有realpath(home)、逐层lstat、NOFOLLOW/NONBLOCK+fstat和fd finally关闭，可复用其已验证模式，必要时把纯底层小helper抽到Host共享文件；它的ASCII filename/max_file_bytes合同保持原样。`storage/adapters/atomic-write.ts`使用可预测tmp+普通writeFile、自动mkdir、rename后chmod，**不可直接拿来实现本服务的安全原子replace**。

- 所有原语在任何mkdir或写入前先校验完整relative路径、声明顶层与预期类型，不能先创建父目录再发现末段非法。list遇链接/特殊文件整体拒绝，不沿用旧files过滤非法项的行为；ENOTDIR/ELOOP/权限错误不能当缺失。
- 可信Home取canonical root；从store开始每层lstat，非directory/链接拒绝；创建目录逐层mkdir后再核，不能recursive mkdir跨未核父链。普通文件打开用NOFOLLOW+NONBLOCK，fstat普通文件后才读/写；replace不要先O_TRUNC再fstat，须验证fd后ftruncate/write。已选择拒绝普通文件nlink>1：stat/read/list枚举、copy源/已有目标、replace/atomic目标、setAccess及removeTree预检使用一致检查；目录正常nlink常大于1，不能套文件规则误拒目录。
- create独占O_CREAT|O_EXCL，冲突拒绝；copy只同owner且目标独占，源普通文件，不能直接无检查fs.copyFile。read按块到EOF，检查Node可表示长度，不加32MiB/64MiB业务上限。资源耗尽仍可报真实IO错误，不宣称无限存储。
- replaceFileAtomic同目录随机tmp、O_EXCL|NOFOLLOW、0600，写完关闭后再rename；目标不存在或普通文件，拒绝目录/链接；失败只清本次tmp，旧目标在rename前失败保持原bytes。本片承诺原子可见替换，不承诺fsync掉电持久、跨文件事务或rename后的无副作用回滚。
- removeTree先遍历核子树所有节点，再按节点删除，不使用会悄悄跟随/忽略链接的捷径；拒绝owner根/声明目录顶层；缺失幂等。setAccess只指定节点，用固定readonly/readwrite位，文件0444/0644、目录0555/0755；需要安全fd核验后fchmod，目录采用适当只读目录fd，不沿文件O_WRONLY路径；不给任意mode。不安全子节点在预检时拒绝并零删除；之后真实IO失败可能已删一部分，明确无树事务保证。声明目录顶层与owner根不可删，声明file顶层可在有效写权内remove；缺失幂等。
- **边界范围**：父链lstat与末端NOFOLLOW防现存路径穿越/链接及受控调用中的错误路径；Node基于绝对pathname的后续操作不能保证抵御同一OS用户的另一个进程在检查后并发置换父目录。无openat逐段目录句柄相对操作，不声称消除此TOCTOU；本片不新增native helper或OS沙箱。测试验证稳定磁盘布局下明确拒绝，不把此未支持威胁伪装已通过。

## 6. 本片可独立证明的验收

原候选SHF-IO编号需拆清证据；建议唯一spec记以下service编号，测试名称带编号：

- **SHF-IO-S01 登记**：真实Home启动名单wrong owner/已有shelf owner/重复store/旧files或database冲突/无Home/sandbox/project scope/未声明权限/初始化无声明均在任何owner目录/业务seed前拒绝；新的fixture注册通过现registry。真实Home owner_files与project旧files同root、同plugin_id但不同definition须拒绝，两种启动次序均验证；完整名单坏尾项拒绝时前面合法entry也零seed。伪造同id definition无服务。
- **S02 生命周期初始化**：真实startup首次授权初始化→动作可见；无grant零初始化；重启幂等由fixture自身seed flag证明；坏fixture catalog不覆盖；初始化writer逃逸拒绝、非法async initializer被requireSynchronous拒绝且无unhandled rejection、初始化失败无注册、停用回调不能写。查询重复调用不mkdir/write/chmod。
- **S03 路径与节点**：绝对/../空段/反斜杠/NUL/Unicode合法/父链与末端symlink/FIFO/目录作file/硬链接按上述选择/跨声明顶层/删除声明目录顶层；拒绝后目标及其它owner内容不变。拒绝FIFO不能挂住；普通文件nlink>1覆盖读/stat/list/copy/replace/atomic/chmod/removeTree，普通目录不因nlink>1误拒；removeTree发现坏子节点时整树零删除；非法末段不得已创建父目录。
- **S04 原调用权限**：真实动作beforeEffect barrier期间取消、撤grant、stop、同id重新安装代次；零文件创建/更新/删除/chmod。query进入write拒绝；action缺write声明、caller无权限、不同install action、无scope调用分别拒绝。
- **S05 writer寿命**：callback外、异步微任务、后续合法动作内使用旧writer均拒绝；返回Promise即拒绝但不伪称此前同步写已回滚。新grant/restart不复活旧client；非法Promise拒绝被观察，不出现unhandled rejection；晚到ALS scope仍须因原caller过期拒绝。
- **S06 IO语义**：create冲突/replace缺失/copy目标存在明确拒绝；atomic rename前注入真实失败旧文件不变且本次tmp清理；成功为完整新bytes；服务无新增32MiB限制（可用一个>32MiB普通文件证明，不造全业务矩阵）；普通源buffer在同步原语返回后修改不改变文件。
- **S07 真实边界缺席**：upgrade context无ownerFiles、project executor无服务并拒绝声明、sandbox无服务；已有files/database正常fixture回归保持。

不以fixture启动返回Done替代这些拒绝及磁盘副作用检查。低层rename失败测试可用隔离故障注入，但权限/代次必须走真实Runtime/动作网关，不能只传一个假的authorize回调。

## 7. 明确延期：不得算进本片通过

前候选SHF-IO02的“首次Shelf snapshot示例”只由fixture模拟初始化行为，真实Shelf query无写仍未改；SHF-IO04的Shelf跨await bytes/path快照、SHF-IO06的32MiB单文件/64MiB folder/512KiB编辑约束、SHF-IO07的prepare冻结/hash/finally取消后不chmod与新授权delete、SHF-IO08的Shelf output失败不落成功catalog均等真实Store统一IO接线。本片不新增相同Store算法来代证。

正式Shelf后续须同一片完成原modules/shelf owner→插件home_store登记迁移、旧构建期入口关闭、唯一Store IO改造、root/原件授权/AI/拖出调用方切换，才声明Shelf迁移。当前只服务+fixture不存在真实消费者，所以不挪owner登记、不切现Shelf数据、不双写、不添加未启用Store。

根需要串行维护：唯一spec新增准确服务完成句、contracts API快照、安全表拒绝行、包README开发要求；仅服务变化不增加内置业务动作，通常无需action快照变动，若fixture不纳入内置快照则保持。新增Runtime模块/导出需相应包构建和受影响真实测试，完整验证由根排时段；本轮全部未运行。
