# 干净 Home：记忆起点与离线旧数据工具删除

版本号相同、结构不同的旧库不在检查范围内；重建前不要用新构建打开旧 Home。已知例子：旧角色库曾为1但没有 `character_runs`；#661之前的连接库也曾为1；记忆账本旧1曾带 `facts` 表；MCP授权、Shelf目录、`feed/secrets.json` 和讨论库以前也有过版本1。数字重新从1起算不证明这些旧形状会被拒绝；原有明确的结构、路径、权限与密钥检查仍保留。这里只引用既有记录，没有重新读取真实Home。

状态：执行中，负责人 Codex（设备 A）。按统筹 #1332 6517794305 / 6518319207 / 6518340875 的第五片；基于main180116cb00，真实Home和旧副本均不操作。本片硬依赖#1578（a708339832dca6c433bf5a8fb1e46a2c04402cd7），只与它一起进入唯一`integration/clean-home`批，不能单独合入；被本片删掉的日志改名脚本之调用方`tests/project-maintenance-v8.test.ts`由#1578删除。Full只在八单合并后的批头上跑，不对本片单独跑；没有新产品协议或SDK包升级。

记忆账本现行完整DDL4→1，不改SDK的内部shape、领域事实或当前Memory授权。删除storage/Host/AgentHost的离线采用实现与出口、三套采用演练、Goals旧名/个人方法搬迁、Inbox绑定搬迁和Feed引用账回填工具/旧夹具/演练。保留正常产品里的记忆去重“采用”、项目引导“采用”等业务动作，它们不是旧格式工具。

新Home仍在任何业务写入前初始化完整八字段reviewed设置：personal和project-default，auto=false；已有当前账本只接受完整设置，不根据缺字段补造。删除strategy-adoption历史来源/完成标记要求，不添加替代标记；正常保存的完整设置与项目/插件限制保持。非空Home缺库、错版本、缺设置或部分设置仍在业务写入之前拒绝。Memory的WAL设置放到基线检查之后，避免错版本拒绝改变文件头；不放宽接受条件。

- RAC-2372：账本新建/重开是1，完整schema与冻结现行DDL一致；默认完整reviewed、用户保存的auto/项目覆盖/插件限制经真实SDK持久化重开保持。
- RAC-2373：非空Home缺库、错版本、缺失/部分设置仍拒绝，Host/Web/MCP/晚绑定入口不写业务文件、不建其他库、不发模型调用；拒绝不补造设置。
- RAC-2374：离线旧数据采用/Goals搬迁/Inbox绑定/Feed回填入口及旧夹具演练删除；非迁移的RAC-800目录结构拒绝保留在当前目录用例，不随旧move演练丢弃。
- RAC-2375：未知basis/approval/evidence/classification等事实仍保持未知；当前格式假数据经SDK公开storage owner写入，测试不运行旧采用、不放宽在线记忆写入。SDK内部Memory shape保持当前8，不归存储起点1。

证明文件：`tests/clean-home-memory-baseline.test.ts`、`tests/memory-initialization.test.ts`、`tests/memory-unknown-facts.test.ts`、`tests/memory-service.test.ts`、`tests/security-invariants-home-snapshot-entries.test.ts`、`tests/home-store-baselines.test.ts`、`tests/inbox-scene-bindings.test.ts`和当前目录RAC-800拒绝。先build，按Storage/AgentHost/Host README与直接依赖选定向；机器槽、jobs1、临时Home/专用测试浏览器，health/base、boundary、API影响核对、版本表、secrets。Full与甲档验证/Opus high二审由统筹排，不本机全量、不合并。

仅删除本仓库显式旧格式接入，不修改vendored SDK或Prologue仓库，不扩展用户暂停的Memory产品开发。新API/迁移机制均不新增，真实重建另等全部代码就绪后用户“开始”。

工程候选验证（2026-10-30，冻结main180116cb00）：整体build、health/base、boundary与40项存储版本表通过；核心8文件102项、README/直接影响其余111文件全部通过，共119个不同文件1077项，含一个专用浏览器文件。覆盖SDK效果、当前权限、未知事实、当前新Home初始化和原key/快照路径，未运行真实旧Home采用；SDK内部shape8和外层账本1分开核对。所有测试经公共槽、jobs1、临时Home；原两次未启动的长批队列已按准确己方pid取消并重排，未停止他人或运行中的测试。独立验证、二审、Full、合入与真实重建仍待统筹结算。
