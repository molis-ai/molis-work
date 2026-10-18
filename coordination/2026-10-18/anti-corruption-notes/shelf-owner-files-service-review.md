# OwnerFiles 服务前置独立复核

2026-10-18；只读检查两份候选及 S=`wt-shelf-runtime` 的 Home/Project 启动、entry identity、现 files IO、Runtime action scope 与 requireSynchronous。没有修改 S、构建或测试。本次范围仅服务与真实 Home Runtime fixture，不包含 ShelfStore/正式 Shelf owner 切换。以更窄的 `shelf-owner-files-service-slice.md` 为准，旧 candidate 的 Module IO 改造段不作为本轮范围。

结论：短同步 write(run)、唯一 HomeStoreRegistry、Host-only 授权初始化、真实 Runtime fixture 可以接受；无需再造数据协议、事务、持久句柄或代次系统。发现一项需要在接受前明确的 P1 交叉名单漏洞，另列少量必须落到实现/拒绝测试的精度。

## P1：跨 Home / Project 的旧 files 共根不能只看各自 start list

现 `HomePluginHost.start` 在 `home-plugins.ts` 只拼 shipped Home + Home fixtures，然后做 assertFilesEntries；`plugin-platform.ts:220` 另在 project start 校验自己的 entries。`home-side.ts:63–74` 的 storesWithFixtures 虽看两组 fixture，但 registry 只登记 owner/library，并不记录旧 files 子目录用途。同一个 plugin_id 的两个可信定义可分别位于 Home 和 project；store归属相同不会拒绝它们。

因此仅把 `assertOwnerFilesEntries(entries, home, 'home')` 插到 Home start、并在 project start 拒绝 project owner_files，不足以实现“owner_files占用的store不能同时有旧files”：Home A 声明 owner_files(root=x)，project A 声明 files(root=x, directory=files)，registry owner都是A且无library，两边各自都能通过。OwnerFiles 的短 writer 失效后，旧 files 接口仍可在同根写入，破坏本片宣称的唯一执行边界。

最小修正是完整名单包括这个 Home 已知的**两种 scope 的可信声明**，在任一 owner port/业务初始化之前纯检查交叉冲突。沿现 HomeStoreRegistry 验 owner；从现可信输入派生 root 使用关系，禁止同 root owner_files 与任何旧files/database声明共存，不建立第二持久 registry 或通用资源租约。如果选择额外限制只允许专属 fixture root，也必须由真实校验执行而非命名约定。测试同时覆盖 Home owner_files + project files（相同plugin_id、不同definition、同一非library root），以及反向启动次序；拒绝前 root、早先合法 entry 的seed均不创建。

本片尚无正式消费者，可以在现Host组合输入处先拒绝这种配置；不需要提前迁移ShelfStore或扩大到新跨进程协调系统。未来动态装配若允许改变可信start list，则需同样经过该纯检查。

## 权限、短作用域与代次：可沿用现设施

- `currentPluginAction()` 只是 ALS 上下文，原作用域随Promise/timer传播；必须每次运行原 caller 的同步 authority 检查。方法缓存到无scope、另install scope、已结束旧scope都拒绝。writer必须绑定捕获的原scope与一次callback有效位，不能每次重新采用当前的新scope给旧writer续命。
- 独立reader要求声明read权限；writer内部读取以原write权限授权合理，不强制重复read权限。两种路径都复核 manifest/action/caller与实时grant，storage:private不因自定义read/write权限而漏查。write仅command；只读query不能通过callback写。
- write等待 beforeEffect 后再次同步核同scope、signal、安装、grant、原caller；随后每个原语复核。利用现 `HomePluginExecutor.activeRecord` 的 active、Home active、installation_generation 和 authorize 即可。旧client在stop后由旧active闭包永久拒绝，新grant/restart只建立新client，不需新增generation或第二安装状态。
- 服务短writer的“callback有效位”是必要的作用域状态，不能与重复Host active计数混为一谈。除此之外无持久fd的Host IO port无需close、dispose或另一个closed字段。slice文件表中的port/close、Runtime返回close、revoke关闭ownerFiles gate可删去；现executor revoke先置active=false已提供唯一实例拒绝。
- 统一调用现 `requireSynchronous(run(writer), ...)`，在finally撤销writer。初始化callback也同样处理，不手写then探测。该工具会观察非法Promise的拒绝，避免晚到 unhandled rejection；async callback前半段已合法同步写不回滚，await后writer必须拒绝。即使类型写 `=> void`，TS也可能接收async函数，因此运行期拒绝不可省。

## 初始化特权范围与完整校验顺序

Host-only initializer只能由真实definition的WeakMap声明获得；深复制并冻结entries元素及数组，initializer函数引用与声明一起固定。普通definition同plugin_id、安装包Manifest自报、upgrade candidate均不能继承。releaseArtifact使用最初可信绑定，不读后续可变entry对象的owner_files字段。

初始化无普通action scope是有意特权，但权限仅是此owner声明的写能力：现安装active + storage:private + write_permission实时grant。不给caller/owner/path参数，不暴露到PluginHostServices；初始化writer内部读仍按这份写权。打开port本身只建立闭包/读取canonical Home，不mkdir；首次实际目录创建须在已授权同步writer中。initializer失败不注册动作，撤销writer，保留此前合法写入，不能把损坏catalog改成空或扫描修复旧任务。

完整的声明校验必须在`openHomePluginStore`之前（现Home代码已经提供这个插入点），包含后一个entry的坏声明，不边校验边初始化前一个。entry.create是可信Host工厂而非来自manifest的初始化代码；“零IO”准确约束Host受管开库/owner目录/seed，不能承诺任意可信工厂自己没有副作用。project factory已有传入db，不能用“project平台之前从未打开任何数据库”作为验收；应证明拒绝前未创建OwnerFiles目录/业务数据。

未授予write时零initializer、零owner目录，不静默运行无授权seed。fixture重启幂等由fixture的seeded flag负责；服务不理解catalog、不加初始化日志/完成manifest。Shelf正式query无写与真实示例恢复仍是后片，不能用fixture代证。

## IO路径拒绝：按已决定的稳定磁盘布局边界实现

已有plugin-files的NOFOLLOW/NONBLOCK/fstat/finally模式可参照，但它过滤非法list项、ASCII名称及max_file_bytes等语义不能直接复制。OwnerFiles应明确拒绝链接/特殊节点，保留合法Unicode，不decode/trim/清洗路径。所有原语先校验完整相对路径、声明顶层与类型，再做任何mkdir/open写入；不能先建父目录再发现末段无效。

以下是本片拒绝测试需覆盖的实际差异：

- 普通文件统一拒绝nlink>1；read/stat/list枚举到的文件、copy source/已存在target、replace/atomic replace目标、setAccess、removeTree预检都使用一致的普通文件检查。不是只在writeFile挡硬链接而其他操作仍接收。目录nlink通常大于1，不得套用文件规则误拒普通目录。
- 文件fd打开NOFOLLOW+NONBLOCK，fstat普通文件及nlink后再ftruncate/read/write/fchmod；不能先截断后校验。目录chmod需用适当只读目录fd检查，不能沿文件O_WRONLY路径。FIFO测试断言拒绝且不挂住。
- create/copy目标独占；replace缺失拒绝；atomic replace允许缺失、目标目录/链接/硬链接拒绝。同目录随机独占临时文件只由Host内部用，不让随机tmp绕过普通调用顶层白名单。失败只清本次tmp；不清历史文件，不假装多文件回滚。
- removeTree先预检整棵子树，发现链接/特殊文件/多硬链接时零删除；随后真实IO错误可部分删除，合同明确不保证树事务。根与声明目录顶层不可删除；声明file顶层若允许remove则应明确（目前文本只禁止目录顶层，catalog文件删除是写权内行为）。
- list缺失=[]、read/stat缺失=null合理，但ENOTDIR、ELOOP、权限错误不能伪装缺失。list直接子项返回独立值；遇不安全项整次拒绝，不过滤成“目录为空”。setAccess只作用指定节点，固定0444/0644、0555/0755；不借本片改变已决定的磁盘隐私策略。

接受拒绝nlink>1与逐层现存父链检查的范围：稳定磁盘布局下不越界。没有openat目录fd链就不声称防住同OS用户并发交换父目录；无需因此加入native helper。无持久fd也不应机械增加close服务。文件实际读写长度错误按IO失败处理，不附加32MiB通用限额；Shelf自己的领域上限后片验证。

## 最小性与建议验收裁决

接受分层：contracts类型 → Runtime scope/短writer授权 → Host owner/path/同步IO → Home executor装配。路径/entries可按职责和门禁拆文件，不预建通用多服务登记器。Host初始化入口可仅为Runtime返回值上的内部方法，不新增公共Plugin服务、JSON授权对象或通用Data克隆框架。

两份候选以service-slice优先，明确删除其表内不必要的close/第二gate，并补跨scope冲突检查后可形成可实施spec。最重要的真实fixture证据是：完整名单坏尾项零seed、跨scope旧files共根拒绝、真实beforeEffect等待撤grant/stop/重装零IO、no-scope及晚到ALS拒绝、旧writer在新合法动作内仍拒绝、非法async返回被观察、初始化失败不注册，以及逐类不安全节点目标不变。

没有发现需要重问用户的产品政策。没有代码或运行证据，以上不是实现验收通过；Shelf迁移仍未实施。
