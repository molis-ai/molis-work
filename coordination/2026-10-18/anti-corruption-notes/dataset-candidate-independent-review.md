# Dataset 候选独立复核

复核对象：`327cbd8ed`，基线 `aceffff86`；工作树 `/Users/yijunwang/code/goalboard/.claude/worktrees/w5-dataset`。只读复核固定提交的实现、调用方及测试；没有构建、运行测试、启动浏览器或修改候选工作树。工作树已有的测试修改不算此提交的证据。

## 当前必须修复

**[P1] 合同删除后仍有 6 份回归用例调用旧 Dataset 入口，候选无法通过其相关回归。**

实现将 `DatasetActionPorts.withStore` 改为 `read/write`（`plugins/native/dataset/src/actions.ts:60,67-70`），将 `createDatasetContentHandlers` 的函数参数改为 `DatasetStores`（同文件 `131-133`），并删除 route table 与旧 HTTP 入口。但以下调用方没有随提交迁移：

- `tests/artifact-compare-moved.test.ts:24`：仍传 `{ withStore, modelAvailability }`，执行 Dataset compare 时 `read` 不存在。
- `tests/content-owner-regressions.test.ts:32`：动作和 workflow content 两种 handler 都是旧参数，创建、导入及交付回归会遇到 `write/read` 非函数；这也使 CSV 拒绝不得改变原记录的回归失去可执行性。
- `tests/document-plugins-limits.test.ts:107`：AI handler 仍传旧 `withStore`，在读取当前 Dataset 时先失败，无法完成“派发模型前撤权不得调用模型”的原断言。
- `tests/creative-artifact-promote.test.ts:12-13,86`：仍导入并实例化已删除的 `DatasetPluginRouteTable/createDatasetRouteHandlers`，模块加载或编译即失败。
- `tests/artifact-continue.test.ts:64-69`：仍通过 `/api/dataset` 创建、修改、固定、读取表；候选明确要求旧入口 404，因此无法到达成果继续编辑的原断言。
- `tests/web-route-table.test.ts:108-109` 及 `tests/fixtures/web-route-table.snapshot.json:508-524`：继续采样旧入口，但快照仍预期列表 200、未知记录为 `dataset.not_found`；旧路由删除后两项均变成路由级 404。应保留旧入口拒绝覆盖，并为现行 Runtime 入口补对应的正常读/未找到记录覆盖。

这是同一次合同迁移遗漏，不应恢复旧 API、放宽断言或移除原业务用例来修。候选外已有前三份已知文件中的部分修改（`artifact-compare-moved`、`artifact-continue`、`creative-artifact-promote`）；它们尚不能证明另外三份已处理，也不属于本次固定提交结论。修复后应在按规则完成构建的环境里运行上述 6 个相关测试文件，并保留原业务断言。

## 已核对的关键边界

除上述测试调用方遗漏，未发现需另列的 Blocker/P1 产品问题。

- `plugins/native/dataset/src/plugin.ts:76-104` 的 HTTP adapter 同时拒绝 query/body 项目冒充；请求身份通过 SDK 的 `bindPluginActionRoute` 绑定，实际动作仍由 Host 服务执行。`apps/local-host/src/web-catalog.ts`、`web-request.ts` 的两条旧分支及旧 native adapter 已删除。浏览器用例检查 scope 拒绝后表数量不变、旧入口 404，并保留桌面/窄屏编辑、版本和发布实操。
- Runtime 写入由 `plugin.ts:25` 进入 `apps/local-host/src/plugin-database.ts:29-50`；`beforeEffect` 后重新核对存储授权，事务同步提交/失败回滚。Dataset actions 测试用数据库触发器强制删除失败，并检查记录及版本均保留；发布完成关联失败、不同 actor 恢复拒绝、Host 重启后恢复旧快照以及后续发布新版本都有状态断言。
- `plugin.ts:30` 不转传旧 `completeText.beforeDispatch` 并非缺失授权检查：`packages/plugin-runtime/src/model-service.ts:73-89` 从当前插件动作取真实 caller，在派发前与模型返回后重新执行 authority，并向模型 port 提供自己的 `beforeDispatch`。真实 Host AI 用例涵盖取消、模型异常/空答案、等待期间编辑与删除、缺少模型权限等；未将这些用例称为覆盖了所有撤权/停用交错。
- `tests/dataset-mcp.test.ts` 经真实 Host gateway 调用标准 MCP adapter，检查权限、项目隔离、CSV、版本、模型列、固定版本恢复及磁盘重开结果。其客户端在同一测试进程内构造；“跨工具进程”是 adapter 使用方式的描述，该文件并未实际 spawn 外部工具子进程。Host 也是同进程对象关闭后重建，证明持久化重开，不证明 OS 进程隔离。
- `tests/dataset-file-import.e2e.test.ts` 保留真实文件 Read/Response 两个 barrier、竞争选择、目标 A 内容、请求路径/版本/CSV 与 UI 恢复断言；改动主要是 Runtime 路由地址和验收编号，并非以结构断言替代原行为覆盖。

本报告不替代主 Session 的实际 diff 裁决、修复后回归与集成验证。

## README 必跑项与交付证据核对

候选 `plugins/native/dataset/README.md` 的「改动后必跑」列出 Dataset actions、MCP、creative-artifact-promote、document-pin-after-move、artifact-compare-moved、project-deletion-owners、document-plugins-error-model。交接材料已有 actions、MCP、project-deletion-owners 的通过声明；初始候选没有覆盖其余四项的有效通过证据（其中两份实际仍为旧调用方）。界面加跑清单另有 model-ready-surfaces，目前交接材料未给该项结果。它们是既定验证待补项，不能用 contracts 批次通过代替；这不构成新增生产缺陷。

发布恢复的测试内容本身是有效业务验证：`dataset-actions.test.ts:68-87` 强制“成果已写但表内完成关联失败”，保留 pending，拒绝删除及另一 actor 恢复，允许随后编辑；关闭项目再打开后恢复固定的旧内容，保留新编辑，不多写第二版，下一次正常固定才生成第二版新内容。`dataset-mcp.test.ts` 进一步关闭并重建 Host/gateway 后恢复，再直接读取项目成果库和 Home Dataset 库核对结果。它们证明临时 Home 的真实存储恢复路径；未验证真实用户 Home，也没有杀死 OS 进程或电源故障注入。

复核结束时交接材料追加 `dfb3e530c`：声明修复 artifact-compare-moved、artifact-continue、creative-artifact-promote、旧路由快照并通过对应测试，另 work-placement 浏览器通过。这些属于后续提交，尚未在此固定提交复核中裁决；仍需确认 content-owner-regressions 与 document-plugins-limits 两份遗漏、上述 README 尚缺结果，以及 Runtime 新路由的 route-table 对应覆盖。
