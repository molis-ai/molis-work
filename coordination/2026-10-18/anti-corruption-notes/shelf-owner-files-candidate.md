# Shelf owner files 最小合同候选（负责人：主会话；实施待分配）

状态：只读候选，未实现、未验证。承接 shelf-storage-project-services-plan.md §2 和 shelf-origin-authority-review.md；根已接受独立 owner 文件树、短同步 writer、授权 activation 初始化、query 无写的方向。并入唯一防腐 spec 后才实施。未改 S/P、未 build/测试/Chrome；本文件不是第二份需求。

本片只解锁个人 Shelf 自有 catalog/files/jobs 的运行期权限与 IO。保持 catalog v1、一个 owner、原目录及已有记录。原件来源绑定、桌面私有交接、项目成果服务、SHM/Shelf AI 切换均不是本片完成内容；正式切换须先满足这些依赖。

## 1. 实际必需操作与现行约束

源依据：modules/shelf/src/store.ts 的构造/ensureSample/writeCatalog、admit/admitFolder/readChild、runJob/storeResult/writeCopy/deleteCopy、contentHash/uniqueName/copyTree/freezeReadOnly/unlockDirectories/thawTree/appendEvent。

| 现动作 | 必需原语 | 不引入的能力 |
|---|---|---|
| 读catalog、内容、预览、hash | stat/read；list直接子项 | 外部路径、返回FD/绝对路径、任意fs |
| 初始化/进货/任务目录 | mkdir（owner内递归建目录） | Home根或未声明顶层 |
| 文件/结果写入，编辑副本与镜像output | writeFile，明确 create/replace 模式 | 随意open flags、任意权限位 |
| catalog.json原子保存 | replaceFileAtomic，同目录临时文件→rename | 暴露rename、第二catalog、事务模拟 |
| 冻结input、复制结果 | copyFile；递归顺序由Shelf实现 | 跨owner或外部copy |
| 删除副本/任务树 | removeTree；缺失幂等 | 删除owner根/声明顶层本身 |
| input冻结、结束时解锁目录、删除前thaw | setAccess(path, readonly/readwrite)；目录/文件自行识别 | chmod任意数字 |
| events.jsonl | read+write替换（保留逐行内容） | 无需新增append；若实测大日志成本构成问题再提，不预建 |

已存在的数值：单文件admit非空且≤32 MiB；admitFolder总量≤64 MiB，没有逐文件32 MiB限制；edit≤512 KiB；剪贴板正文截到256 KiB、历史10条；PDF入库预览extract限32 MiB/20,000字符。普通文件名由safeFilename处理；folder safeRelative当前会删掉空、`.`、`..`段及NUL，并非严格拒绝。这是当前行为事实，服务边界改为严格拒绝，不能先用该旧函数洗掉越界输入再让安全测试“通过”。内部存量正常Unicode/层级继续可读。

catalog（含长期items/jobs）与任务生成output当前没有统一字节上限；storeResult复制output也不套admit的32 MiB。**不能给整个files树套32或64 MiB便宣称行为不变**。本片的存储客户端不另创持久总量/文件数限制；领域入口保留上述真实上限。读取先fstat拒非普通文件、检查Node可表示长度，按块读取而非信任size一次分配；这不等于为catalog新增产品限额。若主会话要求硬上限，应先量现行合法数据和生成上界、明确新拒绝语义，不能隐含在实现中。

## 2. 公共类型草案

新增 contracts/platform/plugin-owner-files.ts（名字可在并入spec时统一），不扩PluginFilesClient。以下为可实施形状，不在本轮入库：

```ts
export type PluginOwnerFileInfo =
  | { readonly kind: "file"; readonly byte_length: number }
  | { readonly kind: "directory" };
export interface PluginOwnerFileEntry {
  readonly name: string;
  readonly kind: "file" | "directory";
}
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
  // callback只执行短同步提交；输入快照由可信Shelf入口按领域字段完成。
  write<Result>(run: (writer: PluginOwnerFilesWriter) => Result): Promise<Result>;
}
export interface PluginOwnerFilesDeclaration {
  readonly store_name: string;
  readonly entries: readonly (
    | { readonly name: string; readonly kind: "file" }
    | { readonly name: string; readonly kind: "directory" }
  )[];
  readonly read_permission: string;
  readonly write_permission: string;
}
```

`write`从Runtime自己的 currentPluginAction 取原caller，不接受调用者自制control/actor/project/install；因此不把一个任意beforeEffect回调当授权。如现Runtime wrapper职责分离，Host只收由wrapper生成的内部gate；该gate不出现在PluginHostServices或JSON。推荐删除generic Data、structuredClone/plainData/SAB通用输入协议。callback可以忽略传回Data并读取闭包原对象，因此它不是Host可强制的输入安全保证；当前唯一可信消费者Shelf直接按自身字段复制即可。Host保证权限、路径和writer生命周期；Shelf保证一次领域请求接受的输入固定。writer原语同步消费bytes，不存留异步引用；不新造通用序列化协议。

`writeFile(create)`独占创建，存在即冲突；replace仅替换已存在普通文件（不存在明确拒绝）。输出第一次写用create，编辑用replace，不能不小心把失败旧路径重建成新成功项。copyFile目标独占、仅同owner源普通文件。replaceFileAtomic用于catalog和日志，允许不存在时创建；tmp名字Host自生成、同目录、不可预测、NOFOLLOW/O_EXCL，成功rename后清理tmp，失败只清本次tmp，不扫描/删除历史数据。list不存在返回空，stat/read不存在返回null；遇链接或特殊文件一律拒绝，不能当作“空”。

setAccess只改变指定节点，不自动递归：文件readonly/readwrite对应现0444/0644，目录0555/0755；Shelf遍历调用保留“结束仅解锁目录、input文件仍只读”的语义。该选择保持现模式，不额外声称迁移改变磁盘隐私位；新临时文件使用0600，mkdir初建0700即可。冻结是OS权限与业务hash共同保护，不是Host不可解除的安全隔离。

## 3. 作用域、权限与时序

读入口：必须在本安装真实动作中，检查manifest/action声明的read_permission、caller.permissions、signal、安装当前记录与activation活跃状态、原caller.assert_authority_current同步拒绝；启动初始化只通过下面独立Host作用域读取，不把“无当前action”默认当可信。每次检查都重新取现状态。返回复制bytes与新对象，不返回可用来写的handle。保存reader方法到另一动作可重新以新真实调用获得读取权；保存**writer**绝不能延长原调用。

write入口按顺序：

1. 捕获原action scope对象和caller、检查该动作是command且有write_permission及storage:private；不处理领域Data；Shelf入口须在调用write或其他第一个await前捕获本次请求所需字段。
2. await原caller.beforeEffect；回到同步段，核当前scope仍是原scope、signal、activation/安装代次/当前grants、原caller.permissions与同步assert_authority_current。
3. 创建只在本次callback有效的writer。所有读写原语都再检查短scope有效性和上述原权威，路径核验紧邻IO。callback返回Promise即拒绝；不承诺因此回滚callback已合法同步执行的写，应在类型和文档禁止async callback，测试区分“后续写被拒”与“先前同步写已发生”。
4. finally撤销writer，返回Result。Result若包含writer/closure也无用；下一次microtask或任何异步回调调用旧writer均拒绝。

不靠`currentPluginAction()`存在就认为仍有效：ALS可跟随晚到Promise，必须跑原caller最终检查。关闭先同步撤销gate，再abort本次调用/等待真实工作，然后释放；close/stop回调不得拿到写服务。无await的短段只代表权限原子检查与同步顺序，**不代表多文件原子事务**。

Shelf在入库、folder、prepare job、finalize success/failure、编辑、删除等每个已有同步提交段调用一次write；不要把整个runJob包在callback里。首次准备与最终提交之间照旧使用生命周期和hash检查。取消/撤权后连unlockDirectories也属于写，不能在catch里无条件先chmod；旧只读input保持，后续新授权delete在自己的writer里thaw。query不顺便清理、修目录或seed。

## 4. 可信登记与初始化接线

仅 builtin trusted entry增加 `owner_files?: PluginOwnerFilesDeclaration` 与 **Host侧** `initializeOwnerFiles?(writer): void`。initialize不是Manifest字段，不由请求/安装脚本提供；具体命名在现Builtin runtime/可信HomeEntry类型统一。只Home executor启用本片，项目executor与sandbox/upgrade context不提供，也不为“将来复用”加项目接线。

声明候选是 `{ store_name: "shelf", entries: [{name:"catalog.json",kind:"file"},{name:"files",kind:"directory"},{name:"jobs",kind:"directory"}], read_permission:"storage:private", write_permission:"storage:private" }`。真实Shelf当前snapshot/root/AI路径未迁移，**本片不能提前在正式builtin给Shelf启用Home runtime**；先用隔离Home fixture验证声明和初始化。正式条目接线随所有前置齐备后的切换。

校验复用plugin-files-entries的信任原则：先检查完整start list再创建目录；有Home、非sandbox、单段store_name、顶层name无重叠/重复、storage:private与声明权限存在、home.stores归属匹配。ownerFiles与现files/database声明之间也要检查同一根覆盖冲突，不只在自己的数组查重。

**现有owner问题必须显式解决**：home-stores.ts当前 `owned("modules/shelf", ...at("shelf"))`，不是Shelf plugin id。不可加任意`owner`字符串绕过身份、不借用modules/shelf名冒充。正式切换时将同一个物理`shelf`登记移到Shelf builtin的home_store声明、归属插件id，Module继续是该插件委托的领域实现，不创建第二份登记/第二目录；这一行变更和旧构建期入口关闭必须同片。C前置fixture用本fixture自己的已登记根，不访问真实Shelf根。

Host启动顺序：active record与grant检查→打开owner port（不做业务写）→在只此startup有效的同步writer中调用初始化→撤销启动writer→definition.start→登记贡献。初始化器由Module导出 `initializeShelfStore(io: ShelfStoreWriter): void`：检查当前catalog格式，mkdir files/jobs，空且未seed时原seed逻辑；不扫描/恢复旧任务或改版本。成功初始化后的注册失败允许保留已合法初始化数据；重试靠原seeded_sample幂等，不加初始化manifest。初始化失败关闭服务，保持原数据，不把破损catalog覆盖为空。

## 5. Module IO 形状与路径边界

Module保持自己声明的窄类型，不import Runtime/Host：`ShelfStoreReader = Pick<PluginOwnerFilesReader,...>` 的等价结构可在modules/shelf/src/io.ts本地定义（仅结构type，避免私包依赖）；`ShelfStoreWriter`同样仅所需原语。`ShelfStore`读方法只拿Reader，突变方法显式接收本次Writer或创建只活在同步提交中的mutation facade，不把writer保存成员。生产所有写经callback、测试纯Module通过同样scope实现，避免测试无条件fs绕过权限证明。

递归copy/hash/freeze/unlock/thaw与uniqueName留Module；Host只做节点和树安全IO。目录路径统一owner内相对`/`分隔，普通路径段保留Unicode，不修剪变更人名/文件名。拒绝绝对/盘符/UNC、NUL、反斜杠、空段、`.`、`..`，单文件条目只接受精确catalog.json；目录条目只接受files/…或jobs/…以及list/stat/mkdir顶层。禁止删除/重命名顶层与owner根。每层lstat拒symlink，末端NOFOLLOW+fstat拒FIFO/device/socket；递归不得跟随链接；跨owner字符串、编码后的路径不做“decode再放行”。

允许的tmp只由Host内部生成，不给普通relative路径绕过entries白名单。已有正常catalog.relative_path也过这些检查，未验证磁盘文本不能免检。原件origin_realpath完全不在IO合同中；保留原字段字节不授予外部读取能力。snapshot.root/桌面拖出路径、原AI root输入是正式切换待拆的调用方，不为了让旧Store编译给新Reader加resolve/root逃生口。

## 6. 拒绝测试与允许路径

测试标题带候选编号（并入唯一spec后固定）：

- SHF-IO01：真实Home fixture声明属于别owner/重叠files根/sandbox/缺Home/缺grant，任何初始化前拒绝，未创建目录。
- SHF-IO02：初始化首次snapshot有一次示例；删除后stop/start不再seed；坏版catalog原bytes不变；普通query扫描fs无mkdir/write/chmod。
- SHF-IO03：逐项绝对/../反斜杠/NUL/symlink父链与末端/FIFO/跨owner/删除顶层拒绝；原文件与别owner字节不变；Unicode嵌套读写成功。
- SHF-IO04：通过真实Shelf入口，在其第一个beforeEffect barrier等待中改原input的bytes、folder entries/paths、job item_ids/recipe，提交仍使用入口接受值；编辑字符串按值捕获；取消/撤权/stop/restart时零业务写。不建立Host通用Data或SAB协议测试。
- SHF-IO05：捕获writer后回调外、原动作结束后、下次动作内调用全部拒绝；async callback后续写拒绝，不伪称先前同步写回滚；query不能进入writer。
- SHF-IO06：单文件32MiB/folder64MiB/edit512KiB原边界；folder中>32MiB但总≤64MiB合法；catalog/output不被新增32MiB上限误杀。真实生产module调用证明，不只查字段。
- SHF-IO07：prepare冻结input、最终hash检查、结束只解锁目录；取消后的catch不chmod/记账；新授权delete可清只读树。
- SHF-IO08：故意令实际rename或output写失败，catalog不出现成功记录、原catalog保留、只清本次tmp；重试沿现Store行为，不建恢复系统。

允许实施文件：新增contracts/plugin-owner-files及必要plugin导出/services/upgrade排除；Runtime新owner-files gate；local-host新owner-files实现/entries与Home executor/可信entry类型；modules/shelf/src/io.ts、初始化及Store窄替换；真实fixture/安全测试。Home store归属、builtin正式Shelf切换、旧Host/桌面调用方删除本片不执行。公共docs/API/security/唯一spec由根串行维护。文件服务应拆到当前巨大单元阈值以下，不放宽门禁；不改PluginFilesClient/Images、数据库/schema、vendor、预算、兼容表或恢复策略。

实施前唯一需落入spec的精度：类型命名、严格路径拒绝替代旧洗路径语义、startup初始化时点、owner登记在正式切换片完成。原件授权前置仍未实现，不能据C通过宣布Shelf全链路可用。


## 7. 最小性复核：推荐 write(run)，单一 Store + IO（2026-10-18）

再次读取当前 `modules/shelf/src/store.ts`、`plugins/native/shelf/src/actions.ts` 和 `apps/local-host/src/shelf-actions.ts` 后，推荐上面修订的 `write<Result>(run)`。原泛型方案增加通用可克隆值集合、特殊缓冲识别和深层遍历，同时仍不能约束callback的闭包；Shelf还得做相同领域快照。较小方案把输入固定在真正首次异步交界处，用已有字段与Buffer复制，删除Data泛型参数、frozenData参数、structuredClone协议、plainData校验与SAB递归检查。Result泛型仅推导同步返回值，不是数据协议。可信调用路径当前由JSON/base64构造普通Buffer，无共享内存消费者；不把跨线程恶意共享内存防御放进本片。若以后增加这种入口，再在那个入口明确支持/拒绝，不能宣称本片已经保证该场景。

实际快照点与防止的变化：

- `admitFile`目前在首个beforeShelfEffect后仍用原input，最后admit才Buffer.from；这是过晚复制。入口立即捕获filename/mime/origin_realpath并Buffer.from(bytes)，已存在artifact_source按已知结构复制reference等字段。预览抽字与最终落盘必须使用同一份接受值，防等待期间替换bytes、改文件名或来源元数据导致预览/Hash/记录不一致。动作绑定本已从base64创建新Buffer，但Module公开入口仍应自己固定这个合同，测试直接调用真实入口。
- `admitFolder`当前全同步，没有现存await窗口；改为write(run)后，必须在进入write前映射每个entry的relative/mime及独立Buffer，并捕获name/origin。原来循环到每项时才Buffer.from不再足够。按接受副本算64MiB总量，不能先按旧数组校验再写新数组。
- `runJob`有两个先后交界：actions中generate/extract先await beforeEffect再传input；Store第一句又await beforeShelfEffect，之后才复制item_ids。因此仅在Store补快照不覆盖动作前面的窗口：绑定处在自己的首await前捕获recipe/option_id/shortcut_id/item_id和item_ids副本，Store直接入口也在自己的首await前按同字段捕获。它们是各自真实可调用边界，不必建立一个通用clone函数。选定catalog材料、hash、settings在准备提交中读取；跨模型/抽字等待后的变化继续由既有assertCurrent、hash与模型配置校验拒绝，复制请求不能替代这些活状态检查。
- `writeCopy(itemId,text)`参数本就是不可变string；调用write前捕获二者即可，Buffer可在同步callback中生成。绑定若改成async须先把input.item_id/input.text解构，不能等待后再访问input对象。item/catalog路径应在获准callback内按当前catalog重新解析，不把旧磁盘路径提前缓存当授权。
- `admitText`/captureUrl使用字符串参数；clipboardToMaterial保留fingerprint的活性复核。模型结果text同样是字符串，应先捕获text；会入记录的coverage/execution若跨最终等待则按其已知结构捕获。storeResult/最终catalog写在同一个同步提交段消费这些值，不给整个模型结果对象加通用数据协议。catch和finally当前都有unlockDirectories：迁移时两处都须移到有效writer内，撤权后finally只做内存/lifetime释放。

IO改造应当让现正式消费者立即使用同一份domain实现，而非新建RuntimeShelfStore等待未来启用：把当前ShelfStore内的catalog/副本/jobs文件操作统一依赖一个ShelfStoreIO（Reader + write短scope），现openShelfStore只负责组装**当前已登记modules/shelf根的FS适配器**并委托同一个Store，正式路径、catalog与业务算法各一份。原owner适配器保留当前真实Host控制来源，不能假装已由Plugin Runtime授权；新Home fixture以owner-files适配同一IO、同一Store验证新服务。两者不在一个正式实例中同时启用、不双写、不读旧写新；正式切换仅更换组合处适配器并删除旧组装。适配器可有两份入口接线，不能复制Store、catalog算法或新增第二份路径模型；Module自身只认相对路径。root/status/拖出/外部原件等尚未迁移的系统接口留在明确的宿主组合边界，不借机把绝对路径逃生口加进新OwnerFilesClient。

若本片无法在保持当前root/原件/AI调用合同的前提下让正式Store通过统一IO运行，收窄本片为OwnerFiles服务及真实fixture，推迟整个Store替换到正式迁移片；不要提交一份未启用且复制业务逻辑的新Store。两种切片均不放松严格路径、owner归属、原调用权限/撤权/停用拒绝和授权初始化。将现同步突变入口改为异步write后，actions/ports要沿同一调用链await完整结果；这是必须同步修改的调用合同，不能只在fixture里await而正式适配仍返回不同形状。
