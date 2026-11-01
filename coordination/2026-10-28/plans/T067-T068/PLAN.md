# T067 / T068｜W5-11 后继分工与缺口准备

负责人：Codex 起草线。既有两单的准备候选，已按同目录 REVIEW.md 与根有限裁定修订，仍非领单/实现/采用；不增编号、验收号或产品范围。未发现两单已有同等完整独立任务书，因此本书补齐分工、当前差集、前置与 oracle，不复写 W5-11 已接受的完整 OAuth 方案。正式派单、路径锁、验收编号和最终合同由根确认。

## 1. 绑定与已有依据

- 源码只读本地 origin/main H=`fa9b907c9c6a8243c9a9504cf6c4c8a90509965b`，tree=`a27d430188798797e683f5b6dfc4ebdbef581ff8`；未 fetch，不等于远端此刻最新头。主检出仍为旧 main，不使用其磁盘源码作现行事实。
- 协调工作树 `/Users/yijunwang/code/mw-coord` HEAD=`248abfff1328f94e5baac4424c780eeec98be392`：当前 ESTIMATE 首段仍列 T067/068 后继；BOARD W5-11 行已分配 9=T067 文档、10=T068 BL-790。ESTIMATE 旧历史表不覆盖新首段。未找到 tasks/T-067.md 或 T-068.md；定向扫描该协调目录，只有 BOARD/ESTIMATE 和 T074 的“不包含 BL-790”边界，未发现完整替代书。不声称所有未提交私人草稿都不存在。
- 唯一需求来源：`specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md` §4.2、§5、§6.1、§7 第9/10片、§9 BL-790/791；ESTIMATE 用户裁定 BL-790 算收尾、W5-11 到第10片才算完成，不再问是否纳入。
- 已审 PG045 书在 `/private/tmp/codex-next-mainline/candidate-pg045-api-connection.md`：只负责 GitHub/Gmail/Catalog 内置 API source 的 health/sync 经当前绑定 connection_id + control 统一 resolveApiConnection 取钥。它不是 MCP 声明迁移书，也不负责本单 OAuth 状态文案收尾。
- 本轮实时 GitHub 元数据：#1669 T065 open、merged=false、head=`94861f093ab3971c6370b824cdd2bfcc30caf14d`；#1672 T066 open、merged=false、head=`ebcd6536cfec7a457802d1d87c24d2c4a242fda0`。T066 保留父片内容，base 为 main 不证明父片已采用；旧 Full、PR描述、审核通过均不能替代 main 回读。未抓全部在途 PR 文件锁，不能宣称任何路径无锁。

本轮仅 Git/文本与 GH 元数据读取、写本临时 PLAN；无源码/协调/GH写入，无构建、测试、模型、真实 Home、凭据或 Keychain 读取。下文 oracle 是拟实施验收，不是已通过结果。

## 2. 三单互不代签的分工

| 现有单 | 负责 | 不负责/不能关闭 |
| --- | --- | --- |
| T067，第9片 | T065/T066 实际采用后，按最终实现同步 OAuth 手册、例外、升级须知、安全证据及刷新写回例外；删准确的旧说法 | 不改生产实现、不重跑服务登录；不关闭 PG045 三类 API provider 各自取钥，不冒称 BL790 MCP 已声明化，不签 W5-11 全完 |
| T068，第10片 BL790 | 远程 MCP 的 endpoint/auth/registration/endpointPattern/tokenScheme 从 Host 常量表迁入 kind:mcp 声明，校验、发现与连接执行消费同份声明；保留现有安全与调用结果 | 不做 API provider resolver 收敛；不迁飞书/Lark stdio 或 Figma 本机服务（BL791）；不新增 OAuth 设备流/刷新策略/账号绑定体验 |
| PG045，已有候选 | 三类 API 集成取钥与实际来源提交/失权链 | 不迁 MCP_SERVERS，不替 T067 更新 OAuth 完成状态；自己的文档差集交根串行 |

T067 可在 T068 前完成自己的 OAuth 文档差集，但留下 BL790 明确未完；T068 在原 slice 只依赖 C 及第4片合同已采用，不是逻辑上必须等第9片。当前 T065/T066 对共享合同/目录/SDK/测试/文档的在途改动使 T068 不能提前开 writer；两片采用后冻结最终输入是当前落地前置。PG045 与 T068 不互为产品前置；若使用共享文件/测试，只由根排串行，不用改文件名逃避锁。

## 3. T067：已有接受范围的当前差集

无需新产品决定。沿 slice §5、§6.1、§7 第9片执行，按语义定位，旧行号只作历史线索：

| 允许文档/段落 | 当前实证与最小改法 | 精确核验 oracle |
| --- | --- | --- |
| `specs/repository-anti-corruption/privileges.md` PG045、PG092及原“10-21/收尾后删除”所指结论段 | PG045 现位221，已明确统一 resolver 仍等 T066；保留该未完成项，追加最终 OAuth 已迁声明与 Alchemist 例外。PG092/后文按标题内容找，不按旧288/327盲替。只改本线 Alchemist 结论，不全仓清历史词。 | 10-23“本轮不迁、不删”与 BL376 现行边界一致；Alchemist 重做进 Runtime、经 services.connections 才删除例外。PG045 状态仍留 FI7b/统一取钥等待/未验证；不得删整行或记完成。 |
| `docs/system/CALL-CHAINS.md` §10.1 原 provider OAuth 行（H:277） | 仍写 Gmail/GitHub/Notion/飞书专属组、要求各自接入包；T065/T066落地后只留下飞书CLI/本机MCP与Alchemist两个准确例外及删除条件，通用 OAuth 回调留平台、由声明解释，不写迁进插件执行代码。 | 专门 OAuth 路径在 adopted main 实际删除才删文档；R2→BL791，R3→Alchemist Runtime/services.connections；不误删其他宿主设置管理接口。 |
| `docs/system/EXTENSION-POINTS.md` 仅§3.3/F3及对应汇总格 | H 已是11，不是 slice旧文的12；F3当前写11→1推演。本线完成后按包外文件口径分别核已有平台来源与新增服务/账号来源，才更新受限样本当前值及依据，保留目标与历史实测。 | 一处=包外必改源码/配置文件，包内Manifest不计；已有平台来源且仅补同类授权声明时列包内改动及包外实测文件（若确无则0，不冒称包内一处就是包外1）。新增service_id/账号来源时，oauthAccountRequest仍要求平台 CONNECTOR_REQUEST_SERVICES/CONNECTOR_ACCOUNT_ORIGINS，Host声明禁止自行写origins；两表同在contracts/services/connector-host.ts，只按文件计一处。新包登记、同步提供方等若必需另列，不能由授权声明完成推断归零。保留原11实测切点与目标1，未证部分写未实测，不为数字修改S69。非W6-04全表重测。T378在途同文件§3.1，领取时核其采用并串行。 |
| `docs/system/SECURITY-INVARIANTS.md` 仅本线已落实安全条目与证据引用 | 按采用的 S101/S105、S37/S12/S69 及最终测试名核对，第8片最终号以实际采用为准，不沿旧“新S待统筹核”占位。 | 写实际测试文件/断言，准确区分拒绝前后允许诊断/会话变化与业务记录不变；OAuth访问令牌仍有PG045/PG093边界，不写“所有插件永远拿不到任何令牌”。不添新安全政策/新测试。 |
| `AGENTS.md` 取消/撤权/S35硬约束邻近一处 | slice已接受的 A3 刷新写回例外，当前未检到其正文。按最终共用刷新实现核定：刷新已发出、参与者全部离开但原插件/安装/发布者/声明等仍有效时，仅允许轮换凭据写回原连接；停用等失效不存。 | 必须和采用后的 shared-refresh 生产路径及 RAC1085 一致，不能给普通业务写入例外，不能允许停用后存凭据。已有同等内容则不重复添加。 |
| `docs/releases/CHANGELOG.md` Unreleased升级须知 | Gmail已有部分，Notion/GitHub说明在父片PR中已有；只补采用后确缺部分，不重复三段。 | Gmail/Notion/GitHub旧形状连接需新增；Feed本人换绑后旧来源暂停、旧消息保留，Notion导入每次选连接；Alchemist重新选前匿名/旧连接本人删；产品变量按最终新名称，不写读取兼容/自动迁移。不改版本号。 |
| 原 W5-11 slice 本线事实/进度段 | 仅根串行回填第3～8片已采用来源、当前文档状态、剩余第10片。 | 历史通过仍保留原头/来源；文档采用不代签动态、Full、真实账号和用户验收。 |

这是文档片，full=false 候选，档位由根正式定；不因书含安全术语就跑产品 Full。writer 不扩大到 skills 或源码注释（slice虽列代码注释清单，但需先核前片已清；尚有代码注释差异交根准确清单，不在文档片自行加 src）。根维护 privileges/slice 等共享状态的方式与独占路径在派单时明确，避免第二 writer。

T067可先准备：逐段差分清单、父片已写/尚缺 CHANGELOG 对照、链接与现行条目定位、原新变量名核对；不能提前提交“已采用”文字。实际验证：scoped diff、git diff --check、既有 merge-base health 的文档门禁与引用核验，不造测试；若计量1尚不能证明，只保留准确差异，不宣布目标已达到。

## 4. T068：当前生产缺口与有限实现合同候选

H 的 `packages/contracts/src/platform/plugin-integrations.ts` 仍把 mcp/cli 定义为无数据 kind；SDK `integration-declarations.ts:102～103` 对非token/oauth多字段拒绝。`connector-mcp.ts:39～78` 仍持 MCP_SERVERS；不是仅文档未刷新。

静态逐行计37项，**34项纯远程**：gmail、google-drive、google-calendar、outlook、onedrive、sharepoint、teams、salesforce、canva、notion、github、dropbox、box、slack、gitlab、vercel、cloudflare、huggingface、sentry、supabase、linear、asana、clickup、monday、airtable、jira、confluence、bitbucket、loom、stripe、intercom、hubspot、zoom、x。另两项 feishu/lark 为 stdio；figma 一项混合 `http://127.0.0.1:3845/mcp` 默认与 `https://mcp.figma.com/mcp` 允许地址，并在start按远程地址改oauth/manual。slice“约40”不是固定验收数量；当前具体名单供冻结差分，执行基点变化时逐项说明。

最小实现路径（最终接缝需与父片采用合同重核，不另造执行框架）：

1. 在既有 connection_services.auth.methods 的 kind:mcp 成员写当前五项数据，扩现有 contracts/SDK形状检查，cli保持现行无数据；catalog写其服务，独立gmail/github包各写自己的声明，不把两服务挪入catalog或重复service主人。用现有登记/目录接缝派生执行配置，不在Host换个文件继续手写远程服务表。传输、授权、发现、refresh、实际工具调用仍沿原实现。
2. 声明为可序列化数据；endpointPattern现是RegExp，不能直接放JSON。技术候选为冻结现有正则source+flags数据、SDK校验后由唯一消费点编译，仅保留原锚点/允许集，不引入可执行钩子。字段最终命名和允许flags在正式技术书锁定；不需用户挑实现细节。若现有平台合同不允许等价表达，交根具体缺字段/安全变化再调整本书，不借迁移新放行URL。
3. 统一消费点不仅createConnectorMcpHost：`host-connector-methods.ts` 生成 method_options/login_ready；`connector-setup.ts` 在授权前校验endpoint/auth；`agent-connector-ports.ts` 拒绝stdio/SSE/特殊tokenScheme的直通条件，也须从同一配置取。删除远程常量权威来源而不是复制两表；保留testServers测试注入仅作受控远端夹具，不以其绕过生产声明证明迁移成功。
4. **Figma四项等价合同已冻结，不再等未知私稿**：①同一service/同一MCP方法，未给endpoint仍本机默认 `http://127.0.0.1:3845/mcp`，目录默认endpoint、auth=none、client_registration=dynamic、login_ready=false不变；②显式HTTPS只接受 `https://mcp.figma.com/mcp`，实际oauth/manual，带Bearer拒绝，不放行其他本机端口/路径/主机；③本机例外只贡献原本机配置/生命周期，远程声明只贡献原HTTPS配置，按选址合成有效配置，不复制远程表、不造多端点框架；④产品客户端自动选择仍沿原请求条件：本机默认及显式HTTPS均不因本片自动获得产品客户端。原代码按未指定/等默认的条件尝试服务名查找，但本机免认证不应注入/发送客户端；显式HTTPS不等于原本机默认，更不能改远程为新默认而自动选产品客户端。目录默认值不代替HTTPS认证合同。两项feishu/lark stdio仍归BL791。
5. 自定义mcp-bearer、kind-only MCP槽、本机例外、原endpoint/issuer与取消规则不改变。**根本片工程裁定**：仅把原Host自持远程表迁入Host构建声明，保持外部包当前无带数据MCP的准入；扩schema后安装预览和attach仍须明确拒绝外部带数据MCP，写任何安装/连接/secret之前拒绝。当前SDK原本拒mcp多字段，这是保持准入范围的工程裁定，不声称旧OAuth禁令已经涵盖MCP，也不是永久产品政策。外部开放仍归T1主人，BL792原API OAuth边界不据此记完成。具体来源与产品客户端保护合同见下节，T134 token绿不能代签。

允许实现模块候选：contracts平台plugin-integrations、SDK既有声明检查；catalog声明构造与gmail/github manifest；local-host的connector-mcp、connector-mcp-endpoint、connector-mcp-configuration、connector-mcp-commit、connector-activation、connector-authorization-commit、host-connector-methods、connector-setup、agent-connector-ports及integration-registry和plugin-trust-actions既有安装预览接缝；现有相关测试、API快照与必要文档。**不是任意改这些整包的许可**：根派单前基于最终父片冻结逐文件名单及共享锁，再把实现合同写回原slice/正式任务书。若需新叶子模块，只负责解析/读取一种配置，不增加新的registry、默认Home取钥、跨插件深import或泛化DSL。

T068为共享合同/SDK与凭据地址边界，甲档 full=true 候选，Full由根安排CI。不执行真实服务登录/部署/发版，不动真实Home/密钥；服务端地址全部来自源码合成夹具，secret backend为临时file。

### 4.1 T068准确接缝、输入输出与有效期

以下是本片必须补齐的实现合同，候选函数名用于固定职责，不假称已有API。只扩已有registry/协议配置/授权completion；不新建事实账、安装系统、兼容读取或自动迁移。可信owner来自Host运行时与登记，前端/包输入不能提交owner或product-client资格。

| 接缝（现状） | 必须达到的输入→输出及检查 |
| --- | --- |
| `integration-registry.ts` 的 `installs/runtime/declarations` 与新增等价 `mcpOwner(serviceId)` | 输入当前Home registry和serviceId；输出同一Runtime记录的 `{plugin_id,install_id,installation_generation,publisher_id,publisher_signature,state,method}` 或缺失，实例须running，方法须为该实例当前声明的带数据mcp。来源取当前Host登记/真实实例，不取attached外部包，不仅看service_id/插件名。停用、移除、重装、换主人/发布者或方法变化失效；同源同签名disable/enable的install_id不变，现有installation_generation变化才可捕获ABA。 |
| `assertFree` + `attach` + `plugin-trust-actions.ts:assertIntegrationsFree` | SDK先接受合法mcp数据供Host用；安装预览仍明确拒外部带数据mcp为declaration_invalid，零安装/连接/secret写。attach的准入检查放在既有attached快速返回之前，不因已登记同插件走捷径；整份拒绝且已有owner不变。kind-only mcp仍按原合同通过。Host enable走已有Host构建装配，不为外部调用开绕过入口。 |
| `host-connector-methods/connector-directory`、`connector-setup.selectedPlan` | 目录字段来自同份声明/本机例外；setup用Home+所选endpoint解析有效配置，返回原公开计划形状。内部取source投影但不把它交前端作为权威，start再取当前真实source并对照，不能相信旧列表/计划。 |
| `connector-mcp.ts:startMcpConnection` 与产品客户端读取前 | Home+serviceId+所选地址→有效配置+内部source pin。先核真实Host来源、原固定默认资源及产品客户端使用资格，再允许调用connectorProductAuth；该底层函数当前仅service名，不可直接当资格判定。资格参照从现有公开builtinIntegrationDefinitions()原Manifest一次投影service的plugin_id、publisher_id、publisher.signature、原mcp方法/默认资源，再与当前真实Runtime来源、running状态及操作generation匹配。builtinIntegrationDeclarations()可供方法数据读取，但其owner/declaration视图没有发布者身份，不能单独证明资格。原定义属于当前Host构建，不是跨版本冻结的历史表；不从当前registry反向生成资格、不新增手写service资格表，不接受同名/同地址/自报flag；合成新Host声明普通正控不因此获得部署客户端。未给endpoint或精确等原默认、无本人client/token的原条件也须满足。变为不同默认/显式非默认（含Figma HTTPS）不得自动选；本机免认证不选。凭据不进入目录/计划/日志。 |
| `McpConfiguration`、既有protocol配置和授权pending记录 | 分清持久绑定与本次实例快照：pending/held及一次在途操作保存真实owner及installation_generation；已激活协议持久保存稳定install_id（由plugin_id与publisher.signature确定），并保留plugin_id/publisher_id/publisher_signature、规范化完整mcp声明指纹及所选有效地址/模式。每次新操作先核稳定绑定，再捕获当前installation_generation，后续await/写入一直核这份快照，不能重新捕获新世代来替换旧快照。同源同签名重装的install_id不变但generation变化，拒进行中ABA；正常进程重启后的新操作可重新核稳定来源并捕获当前世代，重启前pending/held仍拒。持久连接不要求旧generation继续相等。只含非secret，逻辑来源规则同一份，声明指纹覆盖auth/registration/tokenScheme/pattern/默认及选址而非仅endpoint。配置/授权记录仍各在原owner里，不另建source数据库。需要持久化source字段是本片现有协议记录形状变更，按合同/存储规则处置；历史记录缺pin不能根据service_id补猜可信来源或新加compat/migration。若实际存量需维护，给根准确维护前置，未处理前不宣称旧连接继续可用。custom/local原独立配置分支保持，不伪装成缺pin的Host声明兼容分支。 |
| `provider.checkActive`、`guardedFetch`、SDK `saveClientInformation/saveTokens/saveDiscoveryState/saveConfig` | 状态或已激活source都须与当前真实owner/完整声明一致。每次发请求前、beforeDispatch await后、网络返回后写临时/最终secret与协议记录前复核；失效不发送旧客户端/refresh/access，不写晚到凭据。已有oauthRefreshGuard/connection revision、取消/endpoint/issuer检查继续叠加，不能用source取代它们。服务同源同签名停用再启用以新installation_generation拒旧进行中调用；错误结束/清理仍走既有授权失败及清secret路径。 |
| `connector-mcp-commit.commitMcpConnection` → `submitConnectorActivation` → `activateConnectorConnection` | completion的mcp分支必须带同一个内部source投影；pending/原revision检查后、staged→final凭据与saveProtocol/connection写之前核当前source。同一次最终检查后到同步写入不可插await；若Home registry获取需要await，先取得现有registry对象，再在提交处同步读其当前owner/method比较，不能只比await前快照。当前mcp activation无declarer投影，必须补，不能拿token分支已有declarer当完成。 |
| `connector-authorization-commit.commitRetainedConnectorAuthorization` | 当前assertHeldOAuthDeclared遇mcp直接return，是实质缺口。补mcp held来源复核（保留OAuth原校验）；释放intent后至最终activate也再核当前source，再提交同一completion。hold期间换主人/端点/认证/停用重启则失败并清原held/staged结果，零连接激活/最终secret；诊断/授权状态允许变化按原规则。 |
| `activeMcpConfiguration`、`runConnection/useClient`、发现/refresh/call及agent直通 | 当前active仅检查enabled/disconnected/protocol/service/endpoint，必须增加当前source核验；用同一来源规则拒同地址换主人/同owner改auth及ABA，不只比较URL。SDK持久化回调重核；工具调用在实际业务dispatch前后继续control/source核，失效结果不注册新目录/提交业务。Agent直通取token/descriptor也经同一active/source，不能绕过。重启从保存pin恢复并核当前Host登记，原owner/声明未变的合法连接正控可用。 |

**已知支撑缺口如实列出**：现有oauthOwner只覆盖API OAuth；新增mcpOwner须从同一installs/runtime投影。现有pending只核会话，McpConfiguration没有上述pin，mcp activation/held无来源校验，产品客户端读取仅按service名；这些都是本片必要增量，不能只改表就称等价。源码中尚无通用MCP来源资格API，不假称T134已提供；registry构造使用MemoryPluginRuntimeRepository；Runtime的installIdentity由plugin_id与publisher.signature确定，install_id在同源同签名重装/重启不变，新安装记录的installation_generation由randomUUID生成。须复用该世代而不新建账，永久绑定保签名/稳定身份、在途快照固定generation；这是当前静态事实，不推给未知未来实现。作者若发现无法在原模块中完成同步最终核验或稳定重启owner绑定，交根具体调用链/字段/数据生命周期差异，保持WAIT，不临时加另一账或兼容猜测。

## 5. T068预先固定的业务 oracle

以下由原配置/公开行为给出期望，不能用迁移后解释器输出反算期望。沿既有验收号由根分配到本单，不新占号；“输入JSON能解析”不能单独结算。

| 场景 | 固定预期/独立比较 |
| --- | --- |
| 纯远程逐服务迁移 | 34项的endpoint/auth/registration/tokenScheme及正则source/flags逐字等于H原表（取原件逐项冻结在现有测试夹具/断言，不新增证据manifest）；缺省dynamic/Bearer也按原解释比较。完整ConnectorMethodOption的endpoint、registration、login_ready、note及服务顺序保持，不只断言kind存在。 |
| 来源真正改为声明 | 合成真实Host构建Integration声明唯一service id+受控endpoint，经生产登记→目录→setup→Host连接→发现/调用走通，无Host服务id名单；普通声明正控用自己的合成客户端或DCR，不自动得部署客户端。只传testServers不算。 |
| 外部准入保持 | 合法带数据mcp外部签名包在真实安装预览与attach分别拒，零安装记录/连接/secret、已有registry主人不变；已attached同插件分支也拒。kind-only mcp与custom原正控仍工作。不能靠SDK一律拒mcp数据让Host正控也无法运行。 |
| 同地址/同名不是资格 | 正控为真实有资格Host登记+原固定默认，网络替身实际收到预期合成部署client；换同service_id的新Host来源、外部来源、同地址不同发布者，或同plugin_id/publisher_id/地址但不同signature均不得读取/发送该client，明确断言请求体/目的地/次数及secret写。不同声明默认地址也不得凭同名获得client。读取入口须可观察计数，不能仅断言输出未显示secret。 |
| 来源交错与held | 暂停真实授权/refresh请求后，分别同源同签名停用再启用、同地址换主人、改端点、同owner改auth/registration；释放后零晚到凭据/激活/业务写，staged按原清理，已有合法记录不变。另真实held结果后改来源，再释放intent仍拒；未改来源的held正控提交一次。检查登记、protocol配置、临时/最终secret、连接与实际网络次数。 |
| 精确地址边界 | notion仅接受既定https://mcp.notion.com/mcp；换example.test拒、零请求/零新连接。Microsoft严格保留原正则36字符类 `[0-9a-f-]{36}`、i/u flags及固定服务路径（包括36个连字符可匹配，不能改成标准UUID校验）；长度/字符不符或另一server路径拒；Salesforce仅原可选sandbox及serverName允许。带userinfo/hash/敏感query、非本机HTTP拒。Supabase固定read_only=true不得丢失。Figma四项按§4逐条测：目录默认、本机none、显式HTTPS oauth/manual拒Bearer、两条路径都不因迁移自动注入产品客户端；错误本机端口/路径/HTTPS主机拒。 |
| 认证/注册 | Gmail等manual在未配置产品客户端时login_ready按原条件false；有客户端真值由合成配置给定。Sentry带Sentry-Bearer，其他Bearer沿原；oauth-only带token拒，不发请求/不写连接；none不收token。DCR/PKCE、refresh、401重试沿原实际MCP夹具完整链，不宣称API OAuth迁移覆盖它。 |
| 取消/撤权/换主/重启 | 复用当前connector-mcp中真实SDK+Host的连接建立/发现/工具调用、disable-reenable拒晚到刷新、disconnect/abort、重启恢复及本片mcp来源投影断言；T134 token绿只支持token，不核抵mcp。未改来源的合法配置重启后的新操作仍可用，重启前pending/held须拒；缺pin不得猜来源；同头未跑原件不得算通过。异步拒绝时秘密/连接/业务副作用按原规则检查，不凭方法列表正确结安全通过。 |
| 例外/回归 | 飞书/Lark stdio环境隔离与启动链不变；custom MCP HTTP/SSE、none/bearer/oauth路径保持；agent直通仍拒SSE/stdio/特殊tokenScheme，不能迁移后漏条件。保留prototype-member无官方地址拒绝（RAC2416）和ASC22错误地址拒绝。 |
| 声明形状拒绝 | 非法字段/非https远程/含凭据端点/不合法pattern结构在现有Manifest校验边界拒整份、不写连接；精确错误码沿原声明合同。合法正控确能走生产登记，防止通过一律拒绝新字段“过安全测试”。 |

静态对照的原件在H `connector-mcp.ts`；当前回归实现位置：`tests/connector-mcp.test.ts` 的SDK发现/显式调用、Bearer端点固定、DCR/PKCE重启+刷新、S37 ASC19/35、取消/断开、官方Host→Agent选择、ASC22、RAC2416；`tests/connector-method-directory.test.ts` 和 `tests/integration-registry.test.ts` /现有声明校验测试负责发现与声明，最终准确文件由根从父片后的README/affected-tests再定。不能用正则源码扫描替代上述真实调用。

## 6. 前置、锁与可独立准备

T065先实际采用到main，再核T066是否含同等父片、准确差集/采用；T067在3～8全采用之后才写完成态。T068当前也等待二者最后SDK/auth_kind/registry/目录接口与文件锁稳定，但不虚构“第9片完成是第10片能力前置”。PG045同样等待T065/066，不能抢它的resolver/provider实现来填本单。

可先独立做的仅本书这些静态准备：确认34远程与本地混合例外、原表/目录字段固定期望、消费者清单、T067按语义文档差分和父片已写CHANGELOG对照。冻结原oracle时不读取真实配置、测试密钥、账号余额，不对真实服务探测。正式作者才在受控临时Home执行验证。

派单前由根fresh核全部目标路径：T065 #1669、T066 #1672及PG045候选共享的registry/目录/SDK；T378已派写EXTENSION-POINTS§3.1，不与T067同文件并写；保护#1101文档/AGENTS相关路径照现行锁；SECURITY-INVARIANTS和CHANGELOG跨任务统一由根串行。锁冲突等待/精确交接，不新建替代测试文件逃锁，不因锁就创造第三任务。本轮不修改coord/不改变ESTIMATE数量。

## 7. 验证与交付（均待实施）

T067：仅文档scoped diff，准确两类完成态/未完成态、旧新变量与链接回读，git diff --check，既有merge-base health文档/引用检查；无build/full/新门禁。若shared状态由根维护，作者提供准确补丁而不并写。

T068：实际改src/SDK/合同后先公共build槽整体pnpm build；既有定向完整文件经machine-slot、--jobs 1，file秘密库和临时Home清理；SDK/合同API按现有流程刷新快照并检查调用方影响，若动作形状有变按合同升版并更新动作快照，不能为了迁表无故改动作。跑boundary、merge-base health、test-import graph、推前secrets等所涉要求；Full/SI及准确头Verify由根按正式档位安排CI，本机/子代理不Full。构建/测试/HOLD保留真实状态，不把父片历史运行改署到本头。

交付准确base/head/tree、scoped diff、逐条固定oracle实际通过/失败/未运行、原配置逐项迁移差分、例外剩余和公共消费链证据。T067采用仅关闭第9片文档；T068采用及验收才可能结算BL790第10片；PG045、BL791/794/795、真实账号/用户与W6最终验收分别保留原状态。

## 8. 根已裁定与剩余工程WAIT

根已接受同目录 REVIEW 的事实修正，并有限裁定：本片保持外部包无带数据MCP准入；产品部署客户端只给原固定默认资源及有资格真实Host来源；pending/写入/held/后续使用消费同一来源规则。这些已落实在§4～5，不再留作要用户选择的开放产品题，不扩BL792或BL791。

Figma四项是原行为机械等价，不等未知owner私稿；Microsoft按实际36字符类及iu保留；T067 F3分已有来源/新增来源，以包外文件计量，保留目标与未实测，不改S69。根正式派单前仍需核父片实际采用、最终逐文件范围/锁以及实现对既有协议配置/source投影生命周期是否可行。缺pin存量维护、重启来源稳定性或同步最终校验若无现成支撑，作者提交准确事实/必要差分给根，不以新增兼容/迁移、第二事实账或T134历史绿掩盖。

本书仍为修订候选，WAIT父片采用/最终接缝/锁；本轮只改此PLAN，没有实现、运行或安全通过结论，不占新号。

## 根增量采纳（2026-11-01 00:00Z）

已全文核REVIEW增量并回读Runtime installIdentity、新安装randomUUID及原始构建声明：修正install_id/installation_generation事实，补publisher_signature与原Manifest资格参照。二审其余held/最终同步commit接缝无新增必修；本次仅把两处精确修正落到工程准备，保持父片/最终路径锁WAIT，不声称实现或运行通过。
