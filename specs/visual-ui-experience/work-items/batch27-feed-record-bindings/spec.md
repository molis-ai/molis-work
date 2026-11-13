# 第 27 批 Feed 测试按记录绑定账号

状态：子分支定向验证通过，待整批回归（2026-11-09，负责人为第 27 批 Feed 测试写手）。

本片交付 BL-919（已做完删除） 的工程验证，归 [第 27 批第 5 项](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-5)。[T-121 二审及统筹裁定](https://github.com/molis-ai/molis-work/pull/1677#issuecomment-6541544756) 要求测试沿生产的按记录绑定，清掉来源配置驱动账号的路径。真实账号实操另记。认领见 [#1743](https://github.com/molis-ai/molis-work/issues/1743#issuecomment-6747329104)，基点为 `49da2f483`。

## 依赖与范围

`depends_on` 为已进基点的第 02 批及其审计 #1987、第 07 批 #1981，以及现行 T-121 的记录槽合同。无需等待新合同。#1999 固定差异 `1d32d49d6..f25c375149` 和 #2000 固定差异 `02d2443f1..d918375958` 与本片测试文件无重叠。#1999 为连接 owner 增加读取现存库的重载，保留本片使用的两参数入口。整批合并保留 #1999 的 [D0327 Signal 分页与项目隔离断言](../../../../tests/security-invariants-feed-sync.test.ts)，以及 #2000 的 Feed 规则、Inbox 测试对项目插件成员版本的准备。06 的 Feed 投影改动由原负责人处理。BL-921 的公开改绑拒绝仍归其原工作项。

允许路径为本 spec、[Feed 夹具](../../../../tests/fixtures/feed-library.ts)、[集成 Home 夹具](../../../../tests/fixtures/integration-home.ts)，以及下列测试。

- [Feed 同步授权](../../../../tests/feed-sync-authority.test.ts)、[Feed 连接器](../../../../tests/feed-connectors.test.ts)、[Feed 并发](../../../../tests/feed-sync-concurrency.test.ts)、[目录连接器信任](../../../../tests/catalog-trust-boundaries.test.ts)、[连接器设置](../../../../tests/connectors-settings-behaviors.test.ts)、[账号 live](../../../../tests/live-feed-accounts.e2e.test.ts)。
- [Feed 与 Inbox 生命周期](../../../../tests/feed-inbox-lifecycle.test.ts)、[研究来源授权](../../../../tests/feed-research-authority.test.ts)、[Inbox 自动场景](../../../../tests/inbox-automatic-scenes.test.ts)。

账号来源由连接 owner 按测试安装、Feed 插件、项目、槽和记录取当前连接。槽用 `integrationKeyOf` 取得的服务，记录用 `source_id`。夹具经 `pluginBindingScope` 与 `withConnectorConnections` 安排绑定、读当前状态和修订。账号只有连接器取得的引用进 Integration，Feed 来源不保存账号 id、凭据引用或令牌。直驱 Listener 的测试继续使用原有 Feed、Listener 与 Signal；provider 替身可替换外部响应，账号仍须绑定。公开 RSS、研究来源等继续走它们自己的测试路径。删掉来源服务和调度器的空转 Home 参数，账号同步夹具则显式接收隔离 Home。复制或伪造旧敏感字段来验证拒绝及过滤的安全样例保留。

手动 live 测试需要同时设置 `MOLIS_WORK_LIVE_ACCOUNTS=1` 和 `MOLIS_WORK_LIVE_FEED_HOME`。后者指向按约定新建并用文件密钥后端准备的临时 Home，分别使用 GitHub、Gmail 的现行 OAuth 入口连接专用测试账号。准备进程退出后再运行。测试确认路径和密钥后端，在对应服务中选唯一可用的 OAuth 连接。来源与项目库随本次运行生成，测试结束释放自己的绑定。操作者回收准备的 Home。普通测试用公开 OAuth 登记入口和合成 HTTP 响应准备账号，复用同一选择、绑定和读取路径。

### 手动账号验证

在已整体构建的工作树，用终端启动一次隔离的准备进程。

```sh
molis_live_feed_home=$(mktemp -d /tmp/molis-live-feed-home-XXXXXXXX)
MOLIS_WORK_SECRET_BACKEND=file MOLIS_WORK_ENCRYPTION_KEY='' \
  node dist/web/server.js --home "$molis_live_feed_home" --port 0
```

打开准备进程打印的回环地址，按现行连接设置为 GitHub 和 Gmail 各准备一个专用 OAuth 测试账号。注册自定义 OAuth 应用时使用连接设置显示的回调地址，GitHub 也可用现行设备授权。连接就绪后停止准备进程，在同一终端运行测试。内置 provider 在临时 Home 内仍可按正常 OAuth 规则续期，Feed 的上游读取只发 GET。

```sh
node scripts/machine-slot.mjs run browser --label 'Feed live OAuth verification' -- \
  env MOLIS_WORK_LIVE_ACCOUNTS=1 MOLIS_WORK_LIVE_FEED_HOME="$molis_live_feed_home" \
  node scripts/run-tests.mjs --jobs 1 tests/live-feed-accounts.e2e.test.ts
```

退出后由准备者删除这次创建的临时目录。两条真实账号用例分别以 `completed` 为成功，普通运行的两条跳过不计证据。

## 开工前检查

| 项 | 核对 |
| --- | --- |
| 1 事实主人 | 连接与绑定归 Connector，来源与同步进度归 Feed。夹具经各自公开入口读写。 |
| 2 插件同等待遇 | 不涉及生产装配。现有 Runtime 的按记录绑定用例继续验证相同合同。 |
| 3 能力注册 | 不涉及注册变化。保留 Feed 已有动作与调用授权断言。 |
| 4 合同 | 只迁测试夹具及手动测试的准备约定。公开动作、SDK 和存储合同不变。 |
| 5 包与分层 | 变更在测试目录。使用现有包出口与测试工具，不新增内部引用。 |
| 6 表与存储 | Connector owner 写真实按记录绑定，Feed owner 写隔离项目库。无表结构变更。 |
| 7 兼容与迁移 | 删除旧夹具驱动路径。生产的现行读取与升级不涉及。 |
| 8 安全边界 | 不涉及生产边界变更。覆盖绑定变更、断连、撤权和取消后的拒绝，保留恶意配置的拒绝测试。live 只接受明确准备的临时 Home。 |
| 9 调用次数 | 测试夹具在外部响应和落库前核对 owner 的绑定及连接修订。生产请求、权限核对和打开库的次数不涉及。 |
| 10 升级与数据 | 不涉及产品升级及存量。测试仅写隔离 Home 和项目。 |
| 11 成果与过程项 | 不涉及登记。保留原同步与 Inbox 断言。 |
| 12 页面、外壳与文字 | 不涉及 UI、资源、翻译或事件。 |
| 13 错误 | 沿用 Feed 与连接 owner 的拒绝码。测试前置缺失直接报断言失败。 |
| 14 冲突面 | 允许路径仅为测试及本说明，避开 06 的生产投影、公共合同快照和枢纽文件。 |
| 15 全局最优 | Feed 使用 Connector 的公开绑定和 OAuth，插件作者无需新入口；平台保有账号事实，助理和 MCP 的目录及授权照常；连接器、Inbox 与同步继续用原链路。全部账号来源测试按真实 owner 准备，省去无绑定替身特判。第 61 批的目录连接器账号来源仍由 BL-917 接续。显式临时 Home 的准备由手动执行者承担，工程验证用合成响应，保留 GitHub 和 Gmail 的真实 OAuth 路径。 |

## 验收标准

1. **BFR-01** 账号来源经 Connector owner 的按记录绑定取当前账号。供给 provider 的记录与连接正确，来源不写账号标识或凭据。无绑定或其他记录的绑定不会触发 provider。
2. **BFR-02** 保留原 Listener、Signal、Feed、游标、Inbox、记录和重放断言。撤权、断连、暂停、取消、上游失败，以及在途只改变绑定而旧账号仍有效时，原同步不能提交结果或失败记录。允许后续授权的同步恢复一次。
3. **BFR-03** [人工] 去掉无效 Home 参数，所有必要调用方迁移。逐条核查 `git grep connection_id -- tests/` 的来源配置读写。安全拒绝样本及真实连接、绑定合同字段仍有效。
4. **BFR-04** 账号 live 只在双重显式设置并通过临时目录检查后运行。离线以 GitHub、Gmail 的真实 OAuth 登记和内置拉取路径连接合成响应，确认请求只读、来源结果成功、用例绑定已释放。覆盖 `/tmp` 与规范路径、普通 Home 及符号链接拒绝。真实账号的 live 结果分开记录。
5. **BFR-05** [人工] 本片在公共槽内整体构建、运行所改的定向测试，再对照 `origin/main` 跑健康门禁和 `git diff --check`。既有夹具消费者、包 README 必跑用例及 Full 由整批验证。

## 子分支证据

- BFR-01、BFR-02 通过。`feed-sync-authority` 22/22，覆盖连接 owner 按来源选账号、其他记录绑定拒绝、换绑后旧账号仍有效却拒绝原同步，以及断连、暂停、撤权、取消、失败和定时恢复。原快照、投递租约、Signal、Feed、游标和重放断言均保留。
- BFR-03 通过。TypeScript AST 检查了来源服务 105 处、调度器 6 处、连接同步 7 处调用，确认可选项进入第五参、连接同步显式传隔离 Home。`connection_id` 的剩余来源配置样本来自 `personal-sync-creative` 与 `security-invariants-source-sync` 的跨设备过滤及拒绝测试。真正的连接对象与槽合同字段仍用于其他测试。
- BFR-04 离线 3/3。GitHub 与 Gmail 经公开 OAuth 登记和内置 provider 各读取并写入一个合成项目，验证只读请求、`completed` 结果和清理记录绑定。覆盖 `/tmp` 别名、规范路径、缺路径、普通 Home 和符号链接。真实 GitHub、Gmail 用例均未启用，跳过 2 项。
- BFR-05 通过。冻结锁离线安装与 65 包的整体构建成功。默认沙箱先拒绝测试运行器监听临时回环端口，提升权限后执行原范围。首轮 `feed-sync-concurrency` 的三例报告缺少预期拒绝，原因是一处多行调用仍把 `feedOptions` 传第六参。迁到第五参后 10/10，原断言保留。最后各文件有效结果合计 9 个文件、91 例通过、2 条真实账号未运行。健康门禁对照 `origin/main` 合并基点 `54a12642c` 通过，diff 检查通过。

整批回归包含两份夹具的消费者、Feed 与 connector-host README 的适用必跑项、Runtime 记录绑定及 S-71、S-97 拒绝、OAuth 套件、#1999 的 D0327、#2000 的 Feed 规则和 Inbox 插件，以及 CI Full。两份夹具的直接引用文件、各项测试日志及命令见 `/private/tmp/molis-b27-feed-bindings.nUGdZJoM`。真实账号只在具备授权与准备好的专用临时 Home 时验证，离线结果仅覆盖合成外部响应。
