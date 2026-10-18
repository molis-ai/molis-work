# D1 项目成果 owner operations 只读代码评审

状态：2026-10-18 完成冻结 diff 的只读核对。树为 `wt-project-artifact-operations`，HEAD `eaca4ded6bdc20d8d2dfdd636dc22f04c1918ac0`；范围仅 HEAD diff 的七个已跟踪文件及三个未跟踪文件 `plugin-action-contracts.ts`、`plugin-operations.ts`、`plugin-artifact-operations.test.ts`。合同为该树唯一 spec 开头 `W5-01-D1-01～06`，D1 设计稿仅作辅助。不审 D2/D3、Alchemist 或未来迁移。

**结论：未发现当前项目 SDK 生产链的 Blocker/P1。新直调工厂有一处身份绑定不一致，建议本片最小修正后收尾；其余所核行为符合 accepted D1。** 此处不把尚未接入的 Home 使用方式推定为当前漏洞。

## 必须收口的合同风险：消费检查重读可变创建参数

位置：`plugins/native/artifacts/src/plugin-operations.ts:26,49,116–122`。

工厂创建时已解构 `api/process/project_id/actor_id`，查询、写入和 process own 都使用这些固定值；但 `issue` 把原始 `input` 传入 `consumptionIssue`，后者重新读 `input.actor_id`、`input.project_id` 及 owner API。调用方在创建后修改参数对象，普通 read/list 的消费判定就会与实际取数和 process own 使用不同身份。

具体可见偏差：用 actor A 创建直调工厂；项目内有 B 的个人过程项时，原本 read 应拒绝、list 应过滤。随后把原参数对象的 `actor_id` 改为 B，`consumptionIssue` 会按 B 放行，但查询仍在原来绑定的项目中进行，process own 又仍按 A 拒绝。同理，更改 `project_id` 会让内容查询和 compatibility 查询针对不同项目，可能把正常记录变成查询错误。Manifest clone 覆盖不了这一点。

这不是当前 Host 路径的已证可触发外部攻击：`plugin-client.ts:33` 创建独立配置对象，`openHostSession` 目前没有随后修改该对象的路径。因此不升级成当前生产 P1，但公开工厂承诺的固定身份在本片就应一致，不能把差异带入交接。

最小修正：让消费 helper 只接收创建时已捕获的 API、project、actor；不要再把原 `input` 作为政策上下文传入。可同时捕获 authorize/assertInput/author 的函数引用，保持函数内部的当前授权与动态 author 语义，不冻结授权状态、不 clone owner API、不新造身份对象协议。加一条调用生产工厂的回归：创建后改原参数的 actor/project，再核 read/list 与 own/write 仍使用原身份；保留 Manifest mutation 和真实 author 测试。现七条工厂测试只改了 Manifest 与方法输入，没有改创建参数，不能覆盖此风险。

## 已核符合合同的关键边界

- **生产立即使用唯一实现。** `plugin-client.ts:33–51` 的旧五 handler 和新增三 handler 都委托同一工厂；Host 的变更只有 `plugin-host-services.ts:56` 注入现有 Kernel `assertActionInput`。工厂不持 registry、不注册 provider；现项目 client 仍只注册 `sdk.artifacts.<install>` 一份 provider，并 dispose。
- **旧五 schema 与调度合同未改。** 与 HEAD 原 `sdkArtifactActions` 逐项核对，提取后的 read/head/own/publish/record 输入输出形状保持；新增 process-head/process-own/list 均为 query、@1、project、plugin audience、artifact:read、sync。未向作者 SDK 导出内部工厂，也未给 Home 新声明。
- **身份与 author 的主写路径保持。** 方法输入先经共享白名单投影，未把原方法参数 spread 到 Module；`fixed(projected)` 的 spread 对象已是受 schema 验证的投影。project、producer、personal scope 不可由 publish/record 输入覆盖。Host author 仍从本安装 `currentPluginAction().caller.actor_id` 取得，Module 的 personal owner 原规则未改。上节风险仅在消费 helper 重读创建参数，不能据此笼统声称所有身份绑定失效。
- **权限与输入验证次序有明确边界。** 原 SDK client 本来就在 invokeSync 前 requirePermission；Kernel 验证输入后才进 handler，新工厂仍核 Manifest 声明和 grant，并用同一 schema/validator 校验投影。直调工厂按 accepted spec 先声明/authorize 再输入验证；两者都在 owner 读写前拒绝。本片没有自写 JSON validator、no-op 或公开跳过开关。未发现旧五动作的错误顺序因本次提取发生实质退化。
- **process own 与 artifact own 分开。** `plugin-operations.ts:44–47,103–111` 对过程项核 producer id、签名和 personal owner，不核 producer version、不要求 consumes、不拒绝自身 archived/unavailable。旧 artifact head/readOwn 仍只核 producer id，没有顺手加严签名或 owner。
- **目录与普通 read 共用消费政策。** `plugin-operations.ts:83–93` 先取全部成果引用建立 Set，再过滤成果和过程项；不可消费成果也遮蔽同 id/version 的过程项，保持后续 read 的成果优先行为。返回全部固定版本，成果在前、过程在后，各保 owner 顺序。过程标题只保非空字符串原值；输出只含约定摘要字段。查询和 compatibility 抛错直接传播，没有 catch-and-skip。未新增 producer-active 条件。

## 测试证据与实际边界

我没有运行安装、构建、测试或浏览器；只读现有日志与测试源码，另做 `git diff --check HEAD`（通过）。

- `/tmp/molis-artifact-operations-d1-focused.log`：三文件通过，plugin-artifact-client 2/2、plugin-artifact-operations 7/7、plugin-host-services 11/11，共 20/20。
- `/tmp/molis-artifact-operations-d1-required.log`：评审时已完成 71/71 文件，末尾有成功汇总；连同 focused 是已报告的 74 个文件。日志包含 artifacts README 的相关 owner/页面/链接/个人归属等检查。
- 整体 build 通过由 root 交接提供，现有 `/tmp/molis-artifact-operations-d1-build.log` 可供 root 保留；本 reviewer 不把自己只读日志描述成再次构建通过。另五个消费者验证、API/actions/health/文档快照最终状态由 root/writer 收尾，本报告没有相应新增完成证明。

现有测试确实调用真实 ArtifactsModule/ProcessItemsModule、Kernel ActionService、PluginRuntime 及 HostPluginExecutor 的生产装配；并非全部绕过 SDK 的裸工厂测试。独立 expected schemas 锁住旧五/新三形状；SDK 真实调用覆盖错安装、actor、user/MCP audience、无 grant、停用与旧 client 拒绝；Host 新用例通过真实 action scope 验 author。process own 覆盖错签名/owner、升级、归档与 unavailable；目录覆盖多版本、未连端口、不可消费成果遮蔽碰撞、故障传播；拒绝断言比较版本与事件不增加。producer stop 后消费者仍读取固定版本也有真实 Runtime/Host 路径覆盖。

这些证据不包含创建参数对象随后变更的情形，因此建议只补上述窄修与对应回归。已有有效测试不必重复扩大；源码修正后的构建和必要定向按仓库规则由唯一 writer/root 安排。没有 D1 以外的新增实施要求。
