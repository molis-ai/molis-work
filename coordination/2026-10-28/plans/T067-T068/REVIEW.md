# T067 / T068 准备书独立评审

**结论：分工与准备范围可采用；T068 尚不能作为闭合的实施合同，须补下列凭据与声明来源边界。T067 的 F3 只能按限定场景、实际文件结算。保持 WAIT 前片采用与文件锁，不派实施、不占新号。**

本次只审 PLAN.md、原 W5-11 slice 的已接受第9/10片、PG045 候选分工及必要源码。源码绑定本地 `origin/main = fa9b907c9c6a8243c9a9504cf6c4c8a90509965b`，与 PLAN 相同；未 fetch，不声称远端最新。未改源码、coord 或 GitHub，未 build/test，未访问真实 Home、环境凭据或外部服务。以下是静态评审和未来验证要求，不是运行通过。

## 1. Figma：能机械保留，但必须写全默认与选址合同

原 slice §4.2 仅排除 Figma 的本机 `127.0.0.1:3845`，没有排除其 HTTPS 分支；§4.3 把本机平台能力留给 BL791。当前 `connector-mcp.ts:68` 一行允许两个地址，默认本机、auth=none；`:316` 在实际 HTTPS 选址时切 oauth/manual。`connector-setup.ts:35–39` 也单独切换认证。PLAN 指出的混合行问题属实，不能删除整行后只迁34个纯远程，也不能把本机能力一起迁走。

**必须把“保证原行为”展开为以下确定合同，属于原范围的机械迁移，无须另开产品问题：**

- 仍是同一个 Figma service、同一个 MCP 方法；未给 endpoint 时仍选择本机。方法目录默认 endpoint、本机无需认证、目录的 client_registration=dynamic 与 login_ready=false 保持当前结果；目录的默认值不等于远程分支的认证合同。
- 显式 HTTPS 地址仍只接受 `https://mcp.figma.com/mcp`，实际认证仍为 oauth/manual，带 Bearer 拒绝。其他本机端口、路径、HTTPS 主机不因此获得许可。
- 本机例外只贡献原本机地址及原生命周期；远程声明只贡献 HTTPS 地址及认证。消费处按所选地址合成有效配置，不能复制两份远程表；不为本片发明通用多端点框架。
- **产品客户端自动选用也要保持**：`:309–312` 只对未指定地址或等于默认地址的请求注入产品客户端。现状显式 Figma HTTPS 并不等于本机默认地址，因此不会自动注入该产品客户端。若拆分后直接把远程地址当作新的默认，会改变凭据选用，不是机械等价。需要改变这项行为时才提交具体差异给根裁定，本片默认不改。

上述组合的字段/接缝可由作者在正式技术书确定，不需要查到某份未入库私稿才允许作出机械设计；根只需确认允许路径与锁。原 PLAN §8.1 不宜作为无期限等待一个未知 owner 文稿的门槛。

## 2. 带数据 MCP：存在具体安全接缝，不能用 T134 已通过代签

`IntegrationRegistry.attach/assertFree` 确实支持签名包声明服务并按占用冲突拒绝；当前带数据 OAuth 禁令只匹配 `kind === "oauth"`，不会自动覆盖新增 MCP 数据。原 slice §0 明确 T1 信任策略归原 owner，§2.8/BL792 的临时禁令也针对 API OAuth，不能未经裁定照搬成 MCP 的永久政策。

但 **“沿 T134 安装信任/源钉住即可”在当前实现上尚不成立**：

1. `web-connector-connections.ts:55–74` 从同一 registry 读卡片和 declarer，只用于 token 创建；`ConnectorActivation` 也仅 token 分支有 declarer，`ConnectionStore.createToken` 原子写 pin。MCP 的 `McpConfiguration`、`connector-mcp-commit.ts` 与 activation 的 mcp 分支没有同等声明者投影。
2. `activeMcpConfiguration` 只核连接 enabled/disconnected、protocol/service 一致和 endpointFor；pending 检查只核授权会话有效。服务 id 的来源、发布者或声明被替换，不等同于连接被禁用。当前保存 endpoint 可以阻止部分换址，但不能证明同地址换主人、认证字段改变和授权在途换声明均已拒绝。
3. `connectorProductAuth(serviceId, "mcp")` 仅按服务名读部署客户端。原默认端点来自宿主常量；迁移后若外部包可提供这一默认端点，直接保留自动注入就会把原来“官方固定资源”的信任换成“当前声明”。官方服务停用后同 service_id 被新声明占据、或声明来源变化，是需要明确处理的情形。已有连接 pin 不能保护尚未创建的新授权中的产品 client secret。

**正式实施前必须补齐的合同**：有效 MCP 配置须带平台取得的真实声明来源，明确其有效期、失效检查和产品客户端适用范围；不能仅凭 service_id 或前端提交认定可信。发起、网络等待后的写凭据/激活、held 结果最终提交、后续发现/刷新/调用均须消费同一有效来源规则，不能只在列表或 setup 查一次。原有 endpoint/issuer 与取消机制继续复用，不另造安装系统或第二份事实账。

根需决定的具体事项只有这一项：**本片允许哪些已安装来源提供带数据 MCP；对这些来源，产品部署客户端的使用资格如何保持原固定资源边界。** 如果沿现有签名安装准入开放，必须把上述接缝及准确修改文件、验收写入本片；若暂只迁宿主构建声明，须由根明确接受这项收窄，并给外部带数据声明确定拒绝行为，不能把它伪称为旧合同已经规定。两条路线均不要求重写 API OAuth 方案，也不展开 BL791/795。

对应验证应能区分新声明普通正控和产品客户端的安全边界：真实声明登记到 MCP 连接/调用；同地址换主人；不同端点换声明；授权或刷新在途停用再启用；产品客户端不被未获资格声明读取/发送。断言请求目的地/次数、凭据和激活结果，不只是目录存在。现有 issuer pin、T134 token 测试只按实际覆盖核抵。

## 3. F3：“纯声明 OAuth”不等于所有新服务都只改 Manifest

PLAN 已正确保留11与旧slice12的历史差异，且没有把公开来源、MCP、本机与token whoami算作已完成。这一分工可保留。

还需明确一个已经可以静态确认的事实：`connector-oauth-declarations.ts:294–316` 的 identity/context 带令牌请求必须命中平台 `CONNECTOR_REQUEST_SERVICES` 或 `CONNECTOR_ACCOUNT_ORIGINS`（同在 contracts/services/connector-host.ts），否则拒绝。新 service_id/新账号来源并不会因为 Manifest 声明了完整 HTTPS 地址就获准；宿主构建集成在 `integration-registry.ts:182–184` 还禁止自行声明 origins。因此，**对需要新增这类来源的服务，平台文件仍是必改项，不能写“包外无需改动、只改 Manifest”。** 这是已接受 S69 边界的延续，不要求本片将来源表迁进插件。

计量也不能混用：EXTENSION-POINTS §1 定义一处为包外必改源码/配置文件，包内 Manifest 本身不计；原 slice 的“1（只改 Manifest）”是目标表述，不能直接当成同口径实测。两张来源表在同一文件时只计一处，不能按表数重复计；反过来，也不能把包内一处和包外一处各算成同一个“1”。

T067应列出限定样本的包内声明改动、包外必改文件及理由，再填写当前值/目标值：已有平台来源且只新增同类授权声明，与新增 service_id/账号来源分别说明。根确认此处如何将旧目标文字对齐既有文件口径即可；没有证据时保留目标未实测。不要为了达成数字改 S69，也不要重测整张扩展性表。F3广义“GitHub/Gmail形新服务”不得仅凭授权声明完成就宣称同步提供方、包登记等全部归零。

## 4. 一处 oracle 事实修正与最终边界

PLAN §5“Microsoft固定tenant UUID”应改为“保留原正则的36字符 `[0-9a-f-]`、i/u flags及固定服务路径”。当前原表并未验证 UUID 连字符位置或版本；例如36个连字符能过这一字符模式。不能在所谓机械等价验收中要求所有非标准UUID都拒绝。若要收紧，另向根提交明确行为变化；本次不扩修。

T067负责第9片文档，T068负责BL790第10片，PG045负责三个API provider按当前connection_id/control统一取钥，三者不代签，这一划分合理。T068不以T067完成作为产品前置，但当前父片最终合同与共享锁仍是实施前置；T067可准备差分，不提前写已采用。所有锁、实际采用和最终逐文件范围由根派单时fresh核定，本评审未验证锁已释放。

综上：准备书可用于继续收敛正式两单；Figma补具体等价合同，Microsoft修正静态事实，F3明确文件口径；T068的来源/产品客户端边界需根作上述有限裁定后再冻结实施书。未发现需要改动PG045范围或展开BL791/795的理由。

— Codex，独立评审，2026-10-31

## 增量复核：修订 §4.1（2026-10-31）

**结论：仍有两处必须改；其余本轮接缝可接受。** 仅复核稳定来源、在途实例、产品客户端资格及 held/commit；不重开前轮 Figma/Microsoft/F3 或外部 data-MCP 准入裁定。源码仍绑定 `fa9b907c9c6a8243c9a9504cf6c4c8a90509965b`，仅静态读取并追加本节，无实施、测试或 coord/GH 写入，父片/锁 WAIT 保持。

### 必修 A：install_id 是稳定身份，不是安装世代

§4.1 两次声称“disable/enable 重新 install 会换 install_id”“进程重启即新建 install_id”，与当前 Runtime 不符。`packages/plugin-runtime/src/runtime-rules.ts:46–50` 的 `installIdentity` 为 plugin_id 与 publisher.signature 的确定性摘要；`index.ts:184` 使用它。同 plugin_id/签名卸装再启用或正常进程重启，install_id 都相同。用它检测在途 ABA 会漏拒，不能按书直接实施。

现成正确字段是 `PluginInstanceRecord.installation_generation`：`index.ts:249–254` 新安装记录以 randomUUID 生成，`IntegrationRegistry.disableOnce` 先删 installs/声明后 uninstall，再 enable 会得到新 generation；Memory 仓库重建同样重新生成。无需新建世代账。

精确修订：mcpOwner 从同一 Runtime 记录投影真实 state、install_id、installation_generation、publisher_id/publisher_signature 和 method；要求当前实例 running。pending/held、单次发现/刷新/调用的在途快照绑定 generation，末端同步核相同 generation；不能每次检查时重新捕获新 generation 来替换原快照。已激活连接持久绑定使用稳定身份（可复用 install_id，或 plugin_id+publisher_signature，并保留 publisher_id）加声明指纹/所选地址模式，不持久要求旧 generation。这样正常重启后的新操作可用，重启前 pending/held 与同进程 disable/enable 后的旧在途操作拒绝。

当前书的持久字段只有 plugin_id/publisher_id，会把同一 publisher_id 换 signature 视为未换发布者；这也随上述修订闭合。`publisher_id` 是 Manifest 显示身份，当前 Runtime 的安装身份另含 signature，不能遗漏后者。已有完整声明指纹不包含此安装身份，不能替代它。

### 必修 B：资格可读原始公开声明，但该 view 本身不含完整来源

`builtinIntegrationDeclarations()` 并非 Home 当前 registry 的别名：它在 `builtin-integrations.ts:56–62` 以 `builtinIntegrationDefinitions()` 的随 Host 发布的 Manifest 另行构造只读视图，没有读取当前 Home/attached 声明。因此，作为当前 Host 构建中原默认 MCP 数据的参照，**不属于“拿待核当前声明自证”**，可保留；不要求第二张资格名单或永久历史快照。后续构建对这份原始 Manifest 的有意变更仍属于代码/发布合同变化，不能把该函数描述为跨版本冻结的历史表。

但是此 view 的 `RegisteredConnectionService` 只有 `{owner, declaration}`，没有 publisher_signature、publisher_id 或安装信任。若实现只比较 owner 字符串+method/endpoint，即使再检查当前记录由 HOST_BUILD_TRUST 安装，也不足以落实书中“不能仅同名/同地址”的要求：`IntegrationRegistry.enableOnce` 为传入 definition 授 HOST_BUILD_TRUST，不能证明它就是那份原始构建贡献。

精确修订：资格参照从现有公开 `builtinIntegrationDefinitions()` 的原 Manifest 一次投影 service 的 plugin_id、publisher_id、publisher.signature、原 MCP 方法/默认资源；或由这份原定义在既有接缝派生同等只读投影。当前 mcpOwner 的真实 Runtime 来源必须匹配该原始身份与方法，处于 running，操作 generation 仍有效，之后才可调用 connectorProductAuth。不能从当前 registry 反向生成“原始”资格，也不接受包自报资格 flag。已有 view 可继续供方法数据读取，不把它未携带的发布者信息当成已证明。合成新 service 正控不命中原始贡献；相同 plugin_id/publisher_id/endpoint 但不同 signature 也不得获得产品客户端。

### 本轮可接受的部分

稳定绑定与单次在途快照分离的方向正确，以上只是纠正其实际身份字段。§4.1 已把声明检查接到凭据读取、SDK回调、active、held及最终activation，并写明先 await 取得 registry、最终同步读 live owner 后直接写，工程上可沿现有路径完成：`activateConnectorConnection` 在写 final secret 前仍有同步检查位置；held路径在 await 后会重读 completion，再经 submit/activate，必须对这次实际提交的 completion 同步复核，不能只用 await 前那份。

这两处最终检查已在书中要求，不另加第三项必修。普通激活与 held 释放共用同一来源规则，检查用运行时 registry/短期回调，持久 completion 只保存数据；不把闭包序列化或重新造一份来源数据库。已激活重启正控、pending/held重启拒绝和同源同签名卸装再装的在途拒绝，应使用修正后的generation机制验证；本轮没有执行这些场景。

根无需新增产品决定：A是现行实现事实纠正，B是已裁定“原固定资源+有效真实Host来源”的具体来源接缝。修正后可冻结本节工程合同；此前不应将§4.1标成全部闭合。
