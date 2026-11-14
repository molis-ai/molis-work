# 2026-11-08 中优先级A类：四项分层补充方案

状态：四项补充方案均已获用户批准并完成代码实施（2026-11-09），定向回归通过；最终结构门禁与 CI Full 状态见[中优先级 A54 spec](../../../specs/archive/daily-quality-medium-20261108/spec.md)。2026-11-13 后续结算：A 类 54 项随 #2004 已合入 main。

| 问题 | 引入PR | 问题描述 | 修复方式 | 建议修复方案 |
| --- | --- | --- | --- | --- |
| D0041、D0078 | 未确认；原核查基准1b8712618 | Feed离线种子装配与公共RSS路由仍在Host点名引用 | 保持演示事实归Feed；路由归位需调整 | 演示种子走通用Manifest动作登记，在Runtime全部就绪后初始化；无Feed事实的纯路由移RSS integration公共端口。前者采纳公开合同方向，后者因当前公共平台消费者及停用语义作实质调整，取舍见下 |
| D0272、D0280 | 未确认；原核查基准1b8712618 | server五个应用反向import点；恢复还受S-81例外限制 | 采用公开组合端口，保留原owner与私有维护权限 | server变为可组合服务，由现有CLI组合根注入适配器，入口统一为molis-work server；不把恢复公开成插件动作。需确认启动入口变化，取舍见下 |

## D0041、D0078：Feed种子与路由

原报告要求Host不导入Feed实现，经唯一登记/公开合同装配，原评估采纳。继续保持现有Host/UI同源生成登记，不迁目录。

新增事实与原方案缺口：

- `apps/local-host/src/demo-plugin-seed.ts`、`demo-feed-library.ts`在Runtime启动前同步组装Feed/store并写种子。只把工厂搬到别的文件仍是Host手写装配；直接把这段变成动作，还必须明确何时调用、如何防止重启复活已删除的种子，以及隔离测试的离线种子怎样接续。
- `plugins/native/feed/src/exact-source-routes.ts`只使用SEL路由类型及传入的RSS/YouTube定义，不读Feed事实；`apps/local-host/src/source-pull-runtime.ts`将它用于平台的公共sourcePull。让平台路由依赖Feed启用状态会破坏同一平台服务对其它插件的可用性。因而原“仍归Feed、经平台端口调用”的建议归位不足以消除当前反向依赖。

推荐具体落法：

1. 演示数据仍归Feed，Manifest新增可选通用`demo_seed`动作引用，SDK验证它确实声明为本插件的写动作。平台在受信的可再生演示项目里、Runtime全部启动后统一调用；第三方与内置插件走同一合同，不加Feed分支。Feed自己保存/判断种子已初始化状态，删除、停用后重启不复活。Host只发起初始化，不再导Feed assemble/store。离线测试种子回到Feed拥有的测试装配/fixture，产品不再复用测试装配。
2. 纯RSS/SEL路由移至现有RSS integration的公开端口，继续传入YouTube定义与校验函数，不在RSS中import另一个集成实现。Feed和公共sourcePull共用，删除Feed的旧路由实现/导出，不留兼容别名。**此处实质偏离报告“仍归Feed”**：证据是函数无Feed事实、当前消费者为平台公共服务；收益是移除平台依赖插件、Feed停用不影响其它调用者，代价是RSS integration公开API变更，需重跑所有源拉取测试。

不推荐：仅搬import或在Host新增Feed专用注册分支；两者保留原问题。把公共RSS拉取全部改为依赖Feed动作会使Feed成为平台服务的前置插件，也不推荐。

验收：生成登记与装配门禁；Feed启用/停用下公共拉取；新demo、重启、删种子后重启、demo重置；测试装配与实际Runtime各一遍；新增Manifest声明的拒绝矩阵；每个原Host import点分别归零。

## D0272、D0280：server的组合根和公开命令

原报告要求server恢复经项目/成果owner公开命令，消除server→desktop/local-host import，并把门禁改为具体import点计数。原评估采纳。

新增事实与硬边界：

- 实际五个import点分别是`assets.ts`中的Host与desktop、`gateway.ts`、`admin-grants.ts`、`main.ts`。后面三处拥有凭据证明、授权入口与日志装配，不能只挪恢复函数。
- `apps/local-host/src/project-version-stores.ts`明确恢复是S-81的本机恢复例外：“Never an action, nothing in the SDK or contracts.” 因而不能为了倒置依赖，把任意来源恢复变成普通插件可用的动作。
- 目前公开启动方式是`node apps/server/dist/main.js ...`，它自己组合Host适配器。要让这个包完全不依赖Host/desktop，组合根必须搬出该包；原方案没有明确这项用户入口变化。

推荐具体落法：

1. `apps/server`保留协议、参数整理、HTTP生命周期、输出及业务编排，公开一个`runServer(args, ports)`。ports分别接动作网关、成员授权、显式本机资产恢复/读取和安全诊断；包本身不读Host凭据文件、不打开项目库、不引用Host/desktop。
2. 恢复的固定身份、空目标与来源检查留在Host/项目/成果owner；只给本机操作入口，不变成SDK服务或通用动作，保持S-81。网关证明与凭据写入也仍由其现有owner负责。
3. 在现有产品CLI组合根接入这组ports，入口统一为`molis-work server ...`；原`apps/server/dist/main.js`不再是独立产品入口，文档及真实启动器测试同一改动更新，不保留回读/兼容跳板。**需要确认的用户可见变化是启动命令**；这是完整消除该包反向依赖的代价，不通过动态import掩盖依赖。
4. server清掉两项应用依赖；边界按具体import语句计数，所有剩余入口分别验。包归属、清单、公开API与锁文件同步。

候选保守做法：本批暂缓这两项，先保留当前组合根；代价是原问题不能关闭。仅把`assets.ts`搬层、让`main/gateway/admin-grants`继续导Host，不作为完成方案。

验收：真实CLI启动/关闭与EPIPE；有效恢复、团队来源/外部引用/非空目标/伪造身份拒绝；成员授权与撤回；server全部import点归零与新增import拒绝；S-81不暴露给插件；Linux与macOS相应用例、共享核心Full。

## 与本次授权的关系

A类原方案仍有效。RSS 路由归位的实质调整、演示初始化生命周期合同及 server 启动命令变化均先交用户 review，获批后实施，没有将日报建议当成授权。

2026-11-09 用户决定：接受 server 统一到 `molis-work server …`，按上述补充方案实施；包括组合根注入和对应边界按具体 import 点计数。
