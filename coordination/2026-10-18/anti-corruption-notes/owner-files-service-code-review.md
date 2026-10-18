# OwnerFiles 服务实现只读评审（负责人：runtime_project_cleanup_plan）

状态：2026-10-18，源码评审完成；最终整体构建及 9 文件 72 条定向测试通过。评审范围为 `wt-owner-files` 相对 `dfc21df3b` 的已跟踪差异及 9 个未跟踪新增文件；以唯一 spec 顶部 W5-01 OwnerFiles 的 SHF-IO-S01～07 为验收，不把此片解释为 Shelf 已迁移。

## 结论

当前检查未发现 Blocker/P1。可以进入定向验证与 root 集成裁决；这不是工程已通过或 Shelf 产品已可用的声明。评审者只读源码和现成日志，没有启动构建、测试、Chrome 或真实 Home，也没有修改实现。

## 已核对的实际行为

- 登记沿唯一 HomeStoreRegistry 与真实 definition 的 WeakMap；声明的 entries 深复制冻结。坏尾项、Home/project 同根、database/旧 files/library 冲突、同 id 不同 definition 均由纯校验拒绝，不能覆盖现 Shelf owner。Home 预检的 shipped project 范围与 spec 的现有 library 裁定一致；project.start 再检查实际 entries，没有复制第二张插件名单。
- Runtime service 依现 activeRecord/generation 和原 caller 控制：本安装真实 currentPluginAction、command、action/caller/manifest/实时 grants 均要匹配。等待原 beforeEffect 后及每个同步原语复核，writer 在 finally 撤销；新动作、晚到 ALS、重新授权不恢复旧 writer/client。initializer 只有 Host 持有，不在公开 services；upgrade/project/sandbox 无此服务。
- Host port 绑定 canonical Home，本身不开目录；严格相对路径在写前完整校验，父目录和末端拒链接/特殊节点。普通文件统一拒硬链接，NOFOLLOW/NONBLOCK 打开后 fstat，再读取/截断/chmod，fd finally 关闭。Unicode 保留，文件读取没有新增 32MiB 限制。
- create/copy 独占、replace 要存在；atomic replace 使用同目录独占临时文件，rename 前失败保留旧 bytes 并清自己的临时文件。removeTree 先检查整棵树，拒坏子树时不开始删；不能删 owner 根或声明目录顶层。access 仅固定文件/目录模式。
- 新 fixture 走真实 MolisWorkLocalHost、Home Runtime、动作网关与 beforeEffect barrier；检查取消、撤权、停用、重装后的磁盘 create/update/delete/chmod 零副作用，而不只检查异常返回。初始化顺序、缺 grant 零 seed、坏 catalog、async 回调逃逸、旧身份继承拒绝均有生产路径断言。IO 测试还覆盖 FIFO/硬链接/Unicode、真实 rename 权限失败清理和 33MiB 成功读取。

## 必须保留的边界与后续集成检查

1. 此服务不抵御同 OS 用户并发替换父目录；没有 openat/native helper。spec 已明确排除，当前路径保护不能宣称覆盖此威胁。
2. write 回调不是多文件事务；非法 Promise 被拒绝并撤销 writer，但此前合法同步写不会回滚。初始化失败同样不注册动作，却可保留已合法写入的字节。测试和 spec 一致。
3. shared API 快照、包 README、安全不变量表、merge-base health 和资源裁决由 root 串行完成。尚不能以本报告替代这些门禁，未来 project 旧 files 声明也必须接入共同预检。
4. ShelfStore、Shelf Runtime 启用、原件来源、模型、桌面导入导出和正式产品体验均不在本片范围。

## 工程证据

- `git diff --check` 已检查，无输出。
- `/tmp/owner-files-initial-build.log` 首轮整体构建失败：Runtime Object.freeze 方法失去 contextual typing，TS7006。writer 已将 Runtime/Host 相应冻结对象改为显式泛型；评审已读到修复后的源码，不把旧错误当作未修 P1。
- 第二轮 `/tmp/owner-files-types-build.log` 尚未收取完成结果；新测试及 README 要求的相关回归尚待原始日志。收到最终证据后在这里补充，不重复启动验证。

最终证据补充（root 已核读）：`/tmp/owner-files-final-build.log` 整体构建 exit 0，`/tmp/owner-files-typecheck.log` contracts/runtime/Host noEmit 检查 exit 0。`/tmp/owner-files-targeted-tests.log` 首批 9 文件中 8 过 1 败，失败为测试使用 `/var` 路径未命中生产 canonical `/private/var` 的 rename 故障注入；仅将测试 targetFile 改为 realpathSync 后，`/tmp/owner-files-io-retest.log` 5/5 通过，合计 9 文件 72 条通过，没有为此修改生产逻辑。最终生产差异另含 PluginPlatformEntry 的 Pick 类型修正，以及提前预检只投影 fixture 声明、保留非 OwnerFiles sandbox 原有拒绝时机的修正。共享门禁与 Shelf 产品迁移仍不由这些结果代替。
